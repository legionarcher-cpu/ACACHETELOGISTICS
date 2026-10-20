-- 9 de 23 · sql/00_instalacion_completa.sql · Carga con evidencia por pedido, salida a ruta por slot y caja por actividad (secciones 22 a 23).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 22. DESPACHO: CARGA CON EVIDENCIA POR PEDIDO Y SALIDA A RUTA POR SLOT (sql/01 bloque 29)
--   - El piloto solo toca los pedidos que la tienda marcó "Listo para despachar".
--   - Carga POR PEDIDO (pedido_cargar): foto de lo que recibe (bultos, cajas...),
--     cantidad de bultos recibidos y, si lleva efectivo, cuánto. Queda "Cargado"
--     (ya no hace falta que la tienda escanee el QR).
--   - Salida a ruta POR SLOT (piloto_salir_ruta): todos sus pedidos cargados de ese
--     slot pasan a "En ruta". Los que estaban listos pero no se le entregaron quedan
--     "No salió a ruta" (no_salio) para que el G2 los reprograme o los cancele.
--   Se puede repetir.
-- ==================================================

alter table public.pedidos drop constraint if exists pedidos_estado_valido;
alter table public.pedidos add constraint pedidos_estado_valido check (estado in (
    'registrado', 'recibido_bodega', 'asignado', 'alistando', 'listo_despacho',
    'recibido_ruta', 'cargado', 'en_ruta', 'en_entrega', 'entregado',
    'entregado_incidencia', 'no_entregado', 'no_salio', 'reprogramado', 'devuelto', 'cancelado'));

alter table public.pedidos
    add column if not exists carga_bultos   integer,        -- bultos que recibió el piloto
    add column if not exists carga_efectivo numeric(12,2),  -- efectivo que lleva para este pedido (si lleva)
    add column if not exists carga_nota     text;
alter table public.pedidos drop constraint if exists pedidos_carga_valida;
alter table public.pedidos add constraint pedidos_carga_valida
    check ((carga_bultos is null or carga_bultos >= 0) and (carga_efectivo is null or carga_efectivo >= 0));

alter table public.pedido_evidencias drop constraint if exists evidencias_tipo_valido;
alter table public.pedido_evidencias add constraint evidencias_tipo_valido
    check (tipo in ('entrega', 'mal_estado', 'retraso', 'recepcion', 'carga'));

-- ---------- Cargar un pedido con su evidencia ----------
-- p = { usuario_id, pedido_id, bultos, efectivo, nota, fotos: [{ url, ruta }] }
-- La foto la sube la página al Storage "evidencias" y aquí se registra.
-- Quién: el piloto del pedido (o un G3 o superior de la tienda).
create or replace function public.pedido_cargar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u         public.usuarios;
    pe        public.pedidos;
    v_bultos  integer := (p ->> 'bultos')::integer;
    v_efe     numeric := (p ->> 'efectivo')::numeric;
    v_nota    text := nullif(btrim(coalesce(p ->> 'nota', '')), '');
    v_fotos   jsonb := coalesce(p -> 'fotos', '[]'::jsonb);
begin
    u := public.viaje_usuario((p ->> 'usuario_id')::bigint);
    select * into pe from public.pedidos where id = (p ->> 'pedido_id')::bigint for update;
    if not found then
        raise exception 'Ese pedido no existe.' using errcode = 'P0001';
    end if;
    if u.id is distinct from pe.piloto_id and not public.dist_puede_tienda(u, pe.tienda_id) then
        raise exception 'Solo el piloto del pedido lo carga.' using errcode = 'P0001';
    end if;
    if pe.anulado or pe.estado not in ('listo_despacho', 'recibido_ruta') then
        raise exception 'Solo se cargan los pedidos que la tienda marcó "Listo para despachar".' using errcode = 'P0001';
    end if;
    if v_bultos is null or v_bultos < 1 then
        raise exception 'Escribe cuántos bultos recibiste (1 o más).' using errcode = 'P0001';
    end if;
    if v_efe is not null and v_efe < 0 then
        raise exception 'El efectivo no puede ser negativo.' using errcode = 'P0001';
    end if;
    if jsonb_array_length(v_fotos) = 0 then
        raise exception 'Toma al menos una foto de lo que recibes.' using errcode = 'P0001';
    end if;

    update public.pedidos
       set estado = 'cargado', carga_bultos = v_bultos, carga_efectivo = round(nullif(v_efe, 0), 2), carga_nota = v_nota,
           cargado_por = u.id, actualizado_en = now()
     where id = pe.id;

    insert into public.pedido_evidencias (pedido_id, tipo, url, ruta, tomada_por)
    select pe.id, 'carga', f ->> 'url', f ->> 'ruta', u.id
      from jsonb_array_elements(v_fotos) f
     where coalesce(f ->> 'url', '') <> '';

    insert into public.pedido_historial (pedido_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id, usuario_nombre)
    values (pe.id, 'carga', pe.estado, 'cargado',
            jsonb_build_object('bultos', v_bultos, 'fotos', jsonb_array_length(v_fotos))
            || case when coalesce(v_efe, 0) > 0 then jsonb_build_object('efectivo', round(v_efe, 2)) else '{}'::jsonb end
            || case when v_nota is not null then jsonb_build_object('nota', v_nota) else '{}'::jsonb end,
            u.id, u.nombre);

    return jsonb_build_object('id', pe.id, 'codigo', pe.codigo, 'estado', 'cargado', 'bultos', v_bultos);
end;
$$;

-- ---------- Salir a ruta con TODO un slot ----------
-- p = { usuario_id, slot (vacío = pedidos sin slot), fecha (vacía = hoy), piloto_id (si lo hace un G3+) }
-- Sus pedidos CARGADOS de ese slot (de esa fecha o de antes) pasan a "En ruta". Los que estaban
-- listos para despachar (o recibidos) y no se cargaron quedan "No salió a ruta".
-- Devuelve { en_ruta: [{ id, codigo, tienda_id }], no_salio: [...] }
create or replace function public.piloto_salir_ruta(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u        public.usuarios;
    v_piloto bigint;
    v_slot   smallint := (p ->> 'slot')::smallint;
    v_fecha  date := coalesce((p ->> 'fecha')::date, (now() at time zone 'America/Costa_Rica')::date);
    v_ruta   jsonb;
    v_no     jsonb;
begin
    u := public.viaje_usuario((p ->> 'usuario_id')::bigint);
    if u.rol = 'piloto' then
        v_piloto := u.id;
    else
        v_piloto := (p ->> 'piloto_id')::bigint;
        if u.rol not in ('desarrollador', 'administrador', 'admin_g1', 'admin_g2', 'admin_g3') or v_piloto is null then
            raise exception 'Solo el piloto sale a ruta con sus pedidos.' using errcode = 'P0001';
        end if;
    end if;

    -- Una salida a la vez por piloto
    perform pg_advisory_xact_lock(7305, v_piloto::integer);

    if not exists (select 1 from public.pedidos
                    where piloto_id = v_piloto and not anulado and estado = 'cargado'
                      and slot_numero is not distinct from v_slot and fecha_entrega <= v_fecha) then
        raise exception 'No tienes pedidos cargados en ese slot.' using errcode = 'P0001';
    end if;

    -- Cargados -> En ruta (la hora de salida la pone el trigger pedidos_tiempos)
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'codigo', codigo, 'tienda_id', tienda_id) order by id), '[]'::jsonb)
      into v_ruta
      from public.pedidos
     where piloto_id = v_piloto and not anulado and estado = 'cargado'
       and slot_numero is not distinct from v_slot and fecha_entrega <= v_fecha;
    insert into public.pedido_historial (pedido_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id, usuario_nombre)
    select (x ->> 'id')::bigint, 'salida', 'cargado', 'en_ruta', jsonb_build_object('slot', v_slot), u.id, u.nombre
      from jsonb_array_elements(v_ruta) x;
    update public.pedidos
       set estado = 'en_ruta', actualizado_en = now()
     where id in (select (x ->> 'id')::bigint from jsonb_array_elements(v_ruta) x);

    -- Listos que no se cargaron -> No salió a ruta (para reprogramar)
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'codigo', codigo, 'tienda_id', tienda_id, 'estado', estado) order by id), '[]'::jsonb)
      into v_no
      from public.pedidos
     where piloto_id = v_piloto and not anulado and estado in ('listo_despacho', 'recibido_ruta')
       and slot_numero is not distinct from v_slot and fecha_entrega <= v_fecha;
    insert into public.pedido_historial (pedido_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id, usuario_nombre)
    select (x ->> 'id')::bigint, 'no_salio', x ->> 'estado', 'no_salio',
           jsonb_build_object('slot', v_slot, 'motivo', 'Estaba listo pero no se entregó al piloto al salir a ruta'), u.id, u.nombre
      from jsonb_array_elements(v_no) x;
    update public.pedidos
       set estado = 'no_salio', actualizado_en = now()
     where id in (select (x ->> 'id')::bigint from jsonb_array_elements(v_no) x);
    return jsonb_build_object('en_ruta', v_ruta, 'no_salio', v_no);
end;
$$;

grant execute on function public.pedido_cargar(jsonb) to anon;
grant execute on function public.piloto_salir_ruta(jsonb) to anon;

notify pgrst, 'reload schema';


-- ==================================================
-- 23. CAJA DE PILOTOS COMO PARTE DE CADA ACTIVIDAD (sql/01 bloque 30)
--   actividades.usa_caja: la actividad cobra y cierra la caja de sus pilotos o
--   conductores (sección Caja y Configuración -> Cajas). Se marca en
--   Configuración -> Actividades -> "Qué usa en todo el sistema". La sección aparece
--   si ALGUNA actividad de la empresa la usa (y su plan incluye "caja").
--   Todas las actividades que ya existían quedan con caja (no cambia nada).
--   Se puede repetir.
-- ==================================================

alter table public.actividades add column if not exists usa_caja boolean not null default true;

notify pgrst, 'reload schema';



