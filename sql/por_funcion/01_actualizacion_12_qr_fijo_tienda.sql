-- 12 de 16 · sql/01_actualizacion_base_existente.sql · QR fijo de la tienda: el piloto lo escanea y se marca solo, estando en la tienda (GPS) (bloques 34 a 35).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 34. QR FIJO DE LA TIENDA: EL PILOTO LO ESCANEA Y SE MARCA SOLO
--   Cada tienda tiene un QR FIJO ("ACACHETE-TIENDA:<tienda>:<código>") que no cambia
--   cada mes: se ve siempre en el Inicio de la tienda y se imprime una vez. El piloto
--   lo escanea y la base marca SOLA su horario abierto con la fecha y la hora del
--   sistema (hora de Costa Rica), SIN validación previa. Marca tardía: pide el motivo.
--   - qr_tienda_fija(tienda, nuevo): devuelve el QR; nuevo = true genera otro código
--     (el impreso deja de servir; por si se copió o se perdió).
--   - marcar_por_qr_fijo(piloto, qr, justificacion): la marca.
--   El QR del mes (qr_marca_mes / marcar_por_qr) sigue funcionando como antes.
--   Se puede repetir.
-- ==================================================

create table if not exists public.qr_tiendas_fijo (
    tienda_id  bigint primary key references public.tiendas(id) on delete cascade,
    codigo     text not null,
    creado_en  timestamptz not null default now()
);
alter table public.qr_tiendas_fijo enable row level security; -- sin acceso directo: solo por las funciones

create or replace function public.qr_tienda_fija(p_tienda bigint, p_nuevo boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_codigo text;
begin
    if not exists (select 1 from public.tiendas t where t.id = p_tienda) then
        raise exception 'La tienda no existe.' using errcode = 'P0001';
    end if;
    if p_nuevo then
        delete from public.qr_tiendas_fijo where tienda_id = p_tienda;
    end if;
    select codigo into v_codigo from public.qr_tiendas_fijo where tienda_id = p_tienda;
    if v_codigo is null then
        insert into public.qr_tiendas_fijo (tienda_id, codigo)
        values (p_tienda, substr(md5(random()::text || clock_timestamp()::text || p_tienda::text), 1, 20))
        on conflict (tienda_id) do nothing;
        select codigo into v_codigo from public.qr_tiendas_fijo where tienda_id = p_tienda;
    end if;
    return 'ACACHETE-TIENDA:' || p_tienda || ':' || v_codigo;
end;
$$;

create or replace function public.marcar_por_qr_fijo(p_piloto bigint, p_qr text, p_justificacion text default null)
returns table (numero smallint, marcado_en timestamptz, a_tiempo boolean, tienda_id bigint, justificacion text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
    v_ahora   timestamp := public.ahora_local();
    v_hoy     date := v_ahora::date;
    v_hora    time := v_ahora::time;
    v_partes  text[] := string_to_array(coalesce(p_qr, ''), ':');
    v_tienda  bigint;
    v_proxima time;
    m         record;
begin
    if coalesce(array_length(v_partes, 1), 0) <> 3 or v_partes[1] <> 'ACACHETE-TIENDA' or v_partes[2] !~ '^[0-9]+$' then
        raise exception 'Ese no es un QR de tienda.' using errcode = 'P0001';
    end if;
    v_tienda := v_partes[2]::bigint;
    if not exists (select 1 from public.qr_tiendas_fijo q where q.tienda_id = v_tienda and q.codigo = v_partes[3]) then
        raise exception 'Este QR de la tienda ya no sirve (se generó uno nuevo). Escanea el que está en la tienda.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.usuarios u where u.id = p_piloto and u.rol = 'piloto') then
        raise exception 'Solo los pilotos marcan con este QR.' using errcode = 'P0001';
    end if;

    delete from public.marcas_piloto mp where mp.fecha < date_trunc('month', v_ahora)::date;

    select x.* into m from public.marcas_del_dia(v_hoy) x
     where v_hora between x.inicio_desde and x.fin
       and not exists (select 1 from public.marcas_piloto mp
                        where mp.piloto_id = p_piloto and mp.fecha = v_hoy and mp.numero = x.numero)
     order by x.numero
     limit 1;
    if not found then
        select min(x.inicio_hasta) into v_proxima from public.marcas_del_dia(v_hoy) x where x.inicio_desde > v_hora;
        raise exception '%', case when v_proxima is null
            then 'No hay ningún horario abierto para marcar ahora (o ya lo marcaste).'
            else 'Todavía no se puede marcar: el próximo horario tiene hora de inicio ' || to_char(v_proxima, 'HH24:MI') || '.' end
            using errcode = 'P0001';
    end if;

    if v_hora > m.inicio_hasta and coalesce(btrim(p_justificacion), '') = '' then
        raise exception 'JUSTIFICAR:Horario % · la hora de inicio era %. Es una marca tardía: escribe por qué.',
            m.numero, to_char(m.inicio_hasta, 'HH24:MI') using errcode = 'P0001';
    end if;

    insert into public.marcas_piloto (piloto_id, fecha, numero, a_tiempo, justificacion)
    values (p_piloto, v_hoy, m.numero, v_hora <= m.inicio_hasta,
            case when v_hora > m.inicio_hasta then left(btrim(p_justificacion), 200) end);

    return query
        select mp.numero, mp.marcado_en, mp.a_tiempo, v_tienda, mp.justificacion
          from public.marcas_piloto mp
         where mp.piloto_id = p_piloto and mp.fecha = v_hoy and mp.numero = m.numero;
end;
$$;

grant execute on function public.qr_tienda_fija(bigint, boolean) to anon;
grant execute on function public.marcar_por_qr_fijo(bigint, text, text) to anon;

notify pgrst, 'reload schema';



-- ==================================================
-- 35. QR FIJO: SOLO SE MARCA ESTANDO EN LA TIENDA (GPS)
--   El QR fijo de la tienda solo marca si el piloto ESTÁ EN LA TIENDA: el celular manda
--   su ubicación (GPS) y la base mide la distancia a la ubicación de la tienda
--   (tiendas.lat / lng). Más lejos que el radio permitido = no marca.
--   - Radio: configuracion 'radio_marca_m' (150 m por defecto; se cambia en el Inicio
--     de la tienda, Administrador y G1). Se descuenta la precisión del GPS, hasta 50 m.
--   - Sin ubicación de la tienda: no marca (se guarda desde su Inicio, "Usar mi
--     ubicación actual", o desde Pedidos). Sin GPS del celular: no marca.
--   - Cada marca guarda dónde se hizo (marcas_piloto.lat, lng, distancia_m).
--   "Validar y marcar" (la tienda escanea al piloto en persona) no cambia.
--   Se puede repetir.
-- ==================================================

insert into public.configuracion (clave, valor) values ('radio_marca_m', '150') on conflict (clave) do nothing;

alter table public.marcas_piloto
    add column if not exists lat         double precision,
    add column if not exists lng         double precision,
    add column if not exists distancia_m integer;

-- Cambia lo que recibe (ubicación): se quita la versión de 3 datos (bloque 34)
drop function if exists public.marcar_por_qr_fijo(bigint, text, text);

create or replace function public.marcar_por_qr_fijo(
    p_piloto bigint, p_qr text, p_justificacion text default null,
    p_lat double precision default null, p_lng double precision default null, p_precision double precision default null)
returns table (numero smallint, marcado_en timestamptz, a_tiempo boolean, tienda_id bigint, justificacion text, distancia_m integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
    v_ahora     timestamp := public.ahora_local();
    v_hoy       date := v_ahora::date;
    v_hora      time := v_ahora::time;
    v_partes    text[] := string_to_array(coalesce(p_qr, ''), ':');
    v_tienda    bigint;
    v_proxima   time;
    v_radio     integer;
    v_distancia integer;
    t           record;
    m           record;
begin
    if coalesce(array_length(v_partes, 1), 0) <> 3 or v_partes[1] <> 'ACACHETE-TIENDA' or v_partes[2] !~ '^[0-9]+$' then
        raise exception 'Ese no es un QR de tienda.' using errcode = 'P0001';
    end if;
    v_tienda := v_partes[2]::bigint;
    if not exists (select 1 from public.qr_tiendas_fijo q where q.tienda_id = v_tienda and q.codigo = v_partes[3]) then
        raise exception 'Este QR de la tienda ya no sirve (se generó uno nuevo). Escanea el que está en la tienda.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.usuarios u where u.id = p_piloto and u.rol = 'piloto') then
        raise exception 'Solo los pilotos marcan con este QR.' using errcode = 'P0001';
    end if;

    -- ¿Está en la tienda? (GPS del celular vs. ubicación de la tienda)
    select x.lat, x.lng, x.nombre into t from public.tiendas x where x.id = v_tienda;
    if t.lat is null or t.lng is null then
        raise exception 'La tienda % no tiene su ubicación guardada: pide que la guarden en su Inicio ("Usar mi ubicación actual").', t.nombre
            using errcode = 'P0001';
    end if;
    if p_lat is null or p_lng is null then
        raise exception 'Activa la ubicación (GPS) del celular: solo se puede marcar estando en la tienda.' using errcode = 'P0001';
    end if;
    select coalesce((select (valor #>> '{}')::integer from public.configuracion where clave = 'radio_marca_m'), 150) into v_radio;
    v_distancia := round(public.km_recta(t.lat, t.lng, p_lat::numeric, p_lng::numeric) * 1000);
    if v_distancia - least(greatest(coalesce(p_precision, 0), 0), 50) > v_radio then
        raise exception 'Estás a % m de la tienda: solo se puede marcar estando en ella (hasta % m).', v_distancia, v_radio
            using errcode = 'P0001';
    end if;

    delete from public.marcas_piloto mp where mp.fecha < date_trunc('month', v_ahora)::date;

    select x.* into m from public.marcas_del_dia(v_hoy) x
     where v_hora between x.inicio_desde and x.fin
       and not exists (select 1 from public.marcas_piloto mp
                        where mp.piloto_id = p_piloto and mp.fecha = v_hoy and mp.numero = x.numero)
     order by x.numero
     limit 1;
    if not found then
        select min(x.inicio_hasta) into v_proxima from public.marcas_del_dia(v_hoy) x where x.inicio_desde > v_hora;
        raise exception '%', case when v_proxima is null
            then 'No hay ningún horario abierto para marcar ahora (o ya lo marcaste).'
            else 'Todavía no se puede marcar: el próximo horario tiene hora de inicio ' || to_char(v_proxima, 'HH24:MI') || '.' end
            using errcode = 'P0001';
    end if;

    if v_hora > m.inicio_hasta and coalesce(btrim(p_justificacion), '') = '' then
        raise exception 'JUSTIFICAR:Horario % · la hora de inicio era %. Es una marca tardía: escribe por qué.',
            m.numero, to_char(m.inicio_hasta, 'HH24:MI') using errcode = 'P0001';
    end if;

    insert into public.marcas_piloto (piloto_id, fecha, numero, a_tiempo, justificacion, lat, lng, distancia_m)
    values (p_piloto, v_hoy, m.numero, v_hora <= m.inicio_hasta,
            case when v_hora > m.inicio_hasta then left(btrim(p_justificacion), 200) end,
            p_lat, p_lng, v_distancia);

    return query
        select mp.numero, mp.marcado_en, mp.a_tiempo, v_tienda, mp.justificacion, mp.distancia_m
          from public.marcas_piloto mp
         where mp.piloto_id = p_piloto and mp.fecha = v_hoy and mp.numero = m.numero;
end;
$$;

grant execute on function public.marcar_por_qr_fijo(bigint, text, text, double precision, double precision, double precision) to anon;

notify pgrst, 'reload schema';



