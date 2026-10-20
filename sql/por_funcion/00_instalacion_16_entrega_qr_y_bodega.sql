-- 16 de 23 · sql/00_instalacion_completa.sql · Entrega con QR obligatorio y pedidos con productos solo si hay en la bodega del día (secciones 31 a 31).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 31. ENTREGA CON QR OBLIGATORIO Y PEDIDOS SOLO CON PRODUCTO EN BODEGA (sql/01 bloque 38)
--   - El piloto empieza la entrega ESCANEANDO EL QR del pedido (el que tiene el cliente):
--     pedido_iniciar_entrega lo pasa de "En ruta" a "Entregando". Si el QR no se puede leer,
--     sirve el código de entrega que da el cliente. La base ya no deja pasar a "Entregando"
--     de otra forma, ni marcar "Entregado" sin haber pasado por "Entregando".
--   - Pedidos con productos (distribuidora): no se guarda un producto si la bodega del día
--     de su ruta no lo tiene disponible (lo que entró menos lo ya pedido). Si ese día aún no
--     hay bodega, la página deja el pedido "por autorizar" y avisa al G3 o superior.
--   Se puede repetir.
-- ==================================================

-- ---------- La entrega se empieza escaneando el QR del pedido ----------
-- p = { usuario_id, pedido_id, token (lo que trae el QR, sin "ACACHETE-PEDIDO:") | codigo (el del cliente) }
-- Solo el piloto del pedido y solo desde "En ruta". Uno a la vez (índice pedidos_un_en_entrega).
create or replace function public.pedido_iniciar_entrega(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u         public.usuarios;
    pe        public.pedidos;
    v_id      bigint := (p ->> 'pedido_id')::bigint;
    v_token   text := nullif(btrim(coalesce(p ->> 'token', '')), '');
    v_codigo  text := nullif(btrim(coalesce(p ->> 'codigo', '')), '');
    v_otro    text;
    v_uuid    uuid;
begin
    u := public.viaje_usuario((p ->> 'usuario_id')::bigint);
    if v_token is not null then
        begin
            v_uuid := v_token::uuid;
        exception when others then
            raise exception 'Ese QR no es de un pedido del sistema.' using errcode = 'P0001';
        end;
        select * into pe from public.pedidos where token_qr = v_uuid for update;
        if not found then
            raise exception 'Ese QR no es de un pedido del sistema.' using errcode = 'P0001';
        end if;
        if v_id is not null and pe.id <> v_id then
            raise exception 'Ese QR es del pedido %, no de este. Revisa que sea el paquete correcto.', pe.codigo using errcode = 'P0001';
        end if;
    else
        select * into pe from public.pedidos where id = v_id for update;
        if not found then
            raise exception 'Ese pedido no existe.' using errcode = 'P0001';
        end if;
        if v_codigo is null or v_codigo not in (coalesce(pe.codigo_respaldo, ''), coalesce(pe.codigo_telefono, '')) then
            raise exception 'El código no coincide. Pídele al cliente el código de entrega de su pedido.' using errcode = 'P0001';
        end if;
    end if;
    if u.id is distinct from pe.piloto_id then
        raise exception 'El pedido % no es de tu ruta.', pe.codigo using errcode = 'P0001';
    end if;
    if pe.anulado or pe.estado <> 'en_ruta' then
        if pe.estado = 'en_entrega' then
            return jsonb_build_object('id', pe.id, 'codigo', pe.codigo, 'estado', pe.estado);
        end if;
        raise exception 'El pedido % no está en ruta: solo se empieza a entregar un pedido "En ruta".', pe.codigo using errcode = 'P0001';
    end if;
    select codigo into v_otro from public.pedidos
     where piloto_id = pe.piloto_id and estado = 'en_entrega' and id <> pe.id limit 1;
    if v_otro is not null then
        raise exception 'Primero marca como entregado (o no entregado) el pedido %.', v_otro using errcode = 'P0001';
    end if;

    -- Permiso para el trigger pedidos_entrega_con_qr (solo dentro de esta transacción)
    perform set_config('acachete.entrega_qr', pe.id::text, true);
    update public.pedidos set estado = 'en_entrega', actualizado_en = now() where id = pe.id;
    insert into public.pedido_historial (pedido_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id, usuario_nombre)
    values (pe.id, 'estado', 'en_ruta', 'en_entrega',
            jsonb_build_object('verificado', case when v_token is not null then 'qr' else 'codigo' end), u.id, u.nombre);
    return jsonb_build_object('id', pe.id, 'codigo', pe.codigo, 'estado', 'en_entrega');
end;
$$;

-- La base no deja pasar a "Entregando" sin pedido_iniciar_entrega, ni marcar "Entregado"
-- sin haber pasado por "Entregando" ("No entregado" sí se puede desde "En ruta": el cliente no estaba).
create or replace function public.pedidos_entrega_con_qr()
returns trigger
language plpgsql
as $$
begin
    if new.estado is distinct from old.estado then
        if new.estado = 'en_entrega' and coalesce(current_setting('acachete.entrega_qr', true), '') <> new.id::text then
            raise exception 'Escanea el QR del pedido (o escribe el código de entrega del cliente) para empezar la entrega.' using errcode = 'P0001';
        end if;
        if new.estado in ('entregado', 'entregado_incidencia') and old.estado <> 'en_entrega' then
            raise exception 'Primero escanea el QR del pedido: solo se marca entregado después de "Entregando".' using errcode = 'P0001';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists pedidos_entrega_con_qr on public.pedidos;
create trigger pedidos_entrega_con_qr
    before update of estado on public.pedidos
    for each row execute function public.pedidos_entrega_con_qr();

-- ---------- Disponible en la bodega del día para pedidos con productos ----------
-- Bodegas: la de la ruta en esa fecha (sin ruta: las de la tienda en esa fecha).
-- Disponible = lo que entró ese día (ingresos + ajustes - salida - devuelto dañado)
--              - lo ya comprometido (pedidos con productos no cancelados ni devueltos; los
--                entregados y las ventas en ruta cuentan lo entregado).
-- Volatile a propósito: dentro del trigger ve las líneas del mismo pedido ya insertadas.
create or replace function public.dist_disponible_de(p_tienda bigint, p_ruta bigint, p_fecha date, p_excluir bigint default null)
returns table (presentacion_id bigint, entrado numeric, comprometido numeric, disponible numeric)
language sql
security definer
set search_path = ''
as $$
    with b as (
        select id from public.bodegas_dia
         where fecha = p_fecha and (case when p_ruta is not null then ruta_id = p_ruta else tienda_id = p_tienda end)
    ), ent as (
        select m.presentacion_id,
               sum(case m.tipo when 'ingreso' then m.cantidad when 'ajuste' then m.cantidad when 'salida' then -m.cantidad
                               when 'devolucion' then case when m.estado_producto = 'danado' then -m.cantidad else 0 end
                               else 0 end) as cantidad
          from public.bodega_movimientos m
         where m.bodega_id in (select id from b)
         group by m.presentacion_id
    ), com as (
        select pp.presentacion_id,
               sum(case when pp.cantidad_entregada is not null then pp.cantidad_entregada else pp.cantidad end) as cantidad
          from public.pedido_productos pp
          join public.pedidos pe on pe.id = pp.pedido_id
         where not pe.anulado
           and pe.id is distinct from p_excluir
           and pe.estado not in ('cancelado', 'devuelto', 'no_entregado', 'no_salio', 'reprogramado')
           and (pp.bodega_id in (select id from b)
                or (pp.bodega_id is null and pe.fecha_entrega = p_fecha
                    and (case when p_ruta is not null then pe.ruta_id = p_ruta else pe.tienda_id = p_tienda end)))
         group by pp.presentacion_id
    ), ids as (
        select ent.presentacion_id from ent union select com.presentacion_id from com
    )
    select i.presentacion_id, coalesce(ent.cantidad, 0), coalesce(com.cantidad, 0),
           coalesce(ent.cantidad, 0) - coalesce(com.cantidad, 0)
      from ids i
      left join ent on ent.presentacion_id = i.presentacion_id
      left join com on com.presentacion_id = i.presentacion_id;
$$;

-- Para la página (al registrar el pedido): p = { tienda_id, ruta_id, fecha }
-- -> { bodegas: cuántas hay ese día, abiertas, productos: { "<presentacion_id>": disponible } }
create or replace function public.dist_disponible(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_tienda bigint := (p ->> 'tienda_id')::bigint;
    v_ruta   bigint := (p ->> 'ruta_id')::bigint;
    v_fecha  date := coalesce((p ->> 'fecha')::date, (now() at time zone 'America/Costa_Rica')::date);
begin
    return jsonb_build_object(
        'bodegas', (select count(*) from public.bodegas_dia
                     where fecha = v_fecha and (case when v_ruta is not null then ruta_id = v_ruta else tienda_id = v_tienda end)),
        'abiertas', (select count(*) from public.bodegas_dia
                      where fecha = v_fecha and estado = 'abierta'
                        and (case when v_ruta is not null then ruta_id = v_ruta else tienda_id = v_tienda end)),
        'productos', coalesce((select jsonb_object_agg(d.presentacion_id::text, d.disponible)
                                 from public.dist_disponible_de(v_tienda, v_ruta, v_fecha) d), '{}'::jsonb));
end;
$$;

-- No se guarda un producto de un pedido si la bodega de ese día no lo tiene disponible.
-- Si ese día todavía no hay bodega, pasa: la página deja el pedido "por autorizar" (G3 o superior).
-- La venta en ruta (dist_venta_ruta) ya revisa lo que el piloto lleva en mano.
create or replace function public.pedido_productos_revisar_bodega()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    pe     public.pedidos;
    v_disp numeric;
begin
    if new.bodega_id is not null then
        return new;
    end if;
    select * into pe from public.pedidos where id = new.pedido_id;
    if not found or coalesce((pe.detalle ->> 'venta_ruta')::boolean, false) then
        return new;
    end if;
    if not exists (select 1 from public.bodegas_dia
                    where fecha = pe.fecha_entrega
                      and (case when pe.ruta_id is not null then ruta_id = pe.ruta_id else tienda_id = pe.tienda_id end)) then
        return new;
    end if;
    select d.disponible into v_disp
      from public.dist_disponible_de(pe.tienda_id, pe.ruta_id, pe.fecha_entrega) d
     where d.presentacion_id = new.presentacion_id;
    if coalesce(v_disp, 0) < new.cantidad then
        raise exception 'No hay suficiente en la bodega: % (pides %, disponibles %).',
            new.descripcion, trim_scale(new.cantidad), trim_scale(greatest(coalesce(v_disp, 0), 0))
            using errcode = 'P0001';
    end if;
    return new;
end;
$$;

drop trigger if exists pedido_productos_revisar_bodega on public.pedido_productos;
create trigger pedido_productos_revisar_bodega
    before insert on public.pedido_productos
    for each row execute function public.pedido_productos_revisar_bodega();

grant execute on function public.pedido_iniciar_entrega(jsonb) to anon;
grant execute on function public.dist_disponible(jsonb) to anon;

notify pgrst, 'reload schema';

