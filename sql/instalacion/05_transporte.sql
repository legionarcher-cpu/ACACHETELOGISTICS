-- ==================================================
-- 05. TRANSPORTE: VIAJES, FRANJAS Y CORTESÍA
-- ACACHETE LOGISTICS
--
-- Diseño: docs/14-transporte.md. Lo usan js/viajes-comun.js, js/secciones/viajes.js
-- y js/secciones/configuracion/transporte.js.
--   - Actividades con usa_viajes (Transporte): el cliente reserva, el conductor y el
--     vehículo se asignan solos.
--   - transporte_config: reglas por empresa (agenda, recargos, cortesía).
--   - transporte_franjas: precio por km según la hora de recogida (no se enciman).
--   - transporte_dias_cerrados y transporte_bloqueos (horas sin servicio, ej. almuerzo).
--   - viajes y cortesias: la página SOLO LEE. Reservar, cambiar la hora, cancelar y
--     avanzar el estado se hace con funciones que revisan las reglas y evitan que dos
--     clientes tomen la misma hora.
--   - El conductor ACEPTA o RECHAZA cada viaje que le llega (viajes_responder): queda
--     "pendiente" (Esperando conductor) con aviso y sonido. Si lo rechaza o no responde en
--     transporte_config.aceptar_min minutos (viajes_revisar_pendientes), pasa a otro
--     conductor libre (viaje_reasignar); si no hay, queda "sin_conductor" y se avisa al
--     cliente, al Administrador y al G1 (el personal usa viajes_buscar_conductor).
-- Los gastos del mes (costos de operación) están en 06_costos.sql.
-- Se puede repetir.
-- ==================================================

-- ==================================================
-- TABLAS
-- ==================================================

create table if not exists public.transporte_config (
    empresa_id           bigint primary key references public.empresas(id) on delete cascade,
    zona_horaria         text          not null default 'America/Costa_Rica',
    acercamiento_min     smallint      not null default 15,  -- llegar al punto A (antes de la hora)
    colchon_min          smallint      not null default 10,  -- después del viaje
    velocidad_kmh        numeric(5,1)  not null default 30,  -- si el mapa no da los minutos
    anticipacion_min     smallint      not null default 60,  -- reservar al menos N minutos antes
    anticipacion_dias    smallint      not null default 14,  -- reservar hasta N días después
    cancelar_horas       numeric(4,1)  not null default 2,   -- el cliente cancela o cambia hasta N horas antes
    pasajeros_incluidos  smallint      not null default 1,
    recargo_pasajero     numeric(10,2) not null default 0,   -- por persona arriba de las incluidas
    recargo_mercaderia   numeric(10,2) not null default 0,   -- por viaje
    recargo_mascota      numeric(10,2) not null default 0,   -- por mascota
    redondeo             numeric(10,2) not null default 100, -- el precio del viaje se redondea hacia arriba
    cortesia_activa      boolean       not null default true,
    cortesia_viajes      smallint      not null default 5,   -- viajes terminados...
    cortesia_dias        smallint      not null default 15,  -- ...dentro de estos días
    cortesia_vence_dias  smallint      not null default 30,
    cortesia_radio_km    numeric(5,1)  not null default 8,
    aceptar_min          smallint      not null default 10,  -- el conductor acepta o rechaza en N minutos (si no, pasa a otro)
    actualizado_en       timestamptz   not null default now(),

    constraint transporte_config_valida check (
        acercamiento_min between 0 and 240 and colchon_min between 0 and 240 and velocidad_kmh > 0
        and anticipacion_min between 0 and 10080 and anticipacion_dias between 0 and 90
        and cancelar_horas >= 0 and pasajeros_incluidos >= 0
        and recargo_pasajero >= 0 and recargo_mercaderia >= 0 and recargo_mascota >= 0 and redondeo >= 0
        and cortesia_viajes > 0 and cortesia_dias > 0 and cortesia_vence_dias > 0 and cortesia_radio_km >= 0)
);
-- Base ya instalada: minutos para aceptar el viaje
alter table public.transporte_config add column if not exists aceptar_min smallint not null default 10;
alter table public.transporte_config drop constraint if exists transporte_config_aceptar_valido;
alter table public.transporte_config add constraint transporte_config_aceptar_valido check (aceptar_min between 1 and 240);

-- Precio por km según la hora de recogida. dias: 1 = lunes ... 7 = domingo.
create table if not exists public.transporte_franjas (
    id          bigint generated always as identity primary key,
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    nombre      text,
    dias        smallint[] not null,
    desde       time not null,
    hasta       time not null,
    cargo_base  numeric(10,2) not null default 0,
    precio_km   numeric(10,2) not null default 0,
    minimo      numeric(10,2) not null default 0,
    activa      boolean not null default true,
    creado_en   timestamptz not null default now(),

    constraint franjas_horas_validas   check (hasta > desde),
    constraint franjas_dias_validos    check (cardinality(dias) > 0 and dias <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
    constraint franjas_valores_validos check (cargo_base >= 0 and precio_km >= 0 and minimo >= 0)
);
create index if not exists transporte_franjas_empresa_idx on public.transporte_franjas (empresa_id);

-- Dos franjas activas no pueden cubrir la misma hora del mismo día
create or replace function public.franjas_sin_encimar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_otra record;
begin
    if not new.activa then
        return new;
    end if;
    select x.nombre, x.desde, x.hasta into v_otra
      from public.transporte_franjas x
     where x.empresa_id = new.empresa_id and x.activa and x.id is distinct from new.id
       and x.dias && new.dias and x.desde < new.hasta and x.hasta > new.desde
     limit 1;
    if found then
        raise exception 'Se encima con la franja % (%–%).', coalesce(v_otra.nombre, 'sin nombre'),
            to_char(v_otra.desde, 'HH24:MI'), to_char(v_otra.hasta, 'HH24:MI')
            using errcode = 'P0001', hint = 'franjas_encimadas';
    end if;
    return new;
end;
$$;

drop trigger if exists transporte_franjas_sin_encimar on public.transporte_franjas;
create trigger transporte_franjas_sin_encimar before insert or update on public.transporte_franjas
    for each row execute function public.franjas_sin_encimar();

create table if not exists public.transporte_dias_cerrados (
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    fecha       date not null,
    motivo      text,
    primary key (empresa_id, fecha)
);

-- Horas bloqueadas (almuerzo, entrada, salida): un día (fecha) o todas las semanas (dias).
-- Ningún vehículo sale en esas horas. Los viajes que ya existían no se tocan.
-- (Igual que recoleccion_bloqueos en 09_recolecciones.sql.)
create table if not exists public.transporte_bloqueos (
    id          bigint generated always as identity primary key,
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    fecha       date,
    dias        smallint[],
    desde       time not null,
    hasta       time not null,
    motivo      text,
    creado_por  bigint references public.usuarios(id) on delete set null,
    creado_en   timestamptz not null default now(),

    constraint transporte_bloqueos_validos check (
        hasta > desde
        and ((fecha is not null) <> (coalesce(cardinality(dias), 0) > 0))
        and (dias is null or dias <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]))
);
create index if not exists transporte_bloqueos_empresa_idx on public.transporte_bloqueos (empresa_id);

create sequence if not exists public.viajes_codigo_seq;

create table if not exists public.viajes (
    id                      bigint generated always as identity primary key,
    codigo                  text unique,
    token_qr                uuid not null default gen_random_uuid(), -- QR del viaje (ACACHETE-VIAJE:<token>), sin datos personales
    empresa_id              bigint not null references public.empresas(id) on delete restrict,
    cliente_id              bigint references public.clientes(id) on delete set null,
    cliente_nombre          text not null,
    cliente_telefono        text,
    solicitado_por          bigint references public.usuarios(id) on delete set null,

    origen_direccion        text not null,
    origen_lat              numeric(9,6) not null,
    origen_lng              numeric(9,6) not null,
    destino_direccion       text not null,
    destino_lat             numeric(9,6) not null,
    destino_lng             numeric(9,6) not null,
    km                      numeric(8,2) not null,
    minutos                 smallint not null,
    ruta_aproximada         boolean not null default false,

    personas                smallint not null default 1,
    mascotas                smallint not null default 0,
    mascotas_nota           text,
    lleva_mercaderia        boolean not null default false,
    mercaderia_descripcion  text,
    mercaderia_bultos       smallint,
    mercaderia_kg           numeric(8,2),

    inicio                  timestamptz not null,  -- hora de recogida en A
    bloque_inicio           timestamptz not null,  -- desde que el vehículo sale hacia A
    bloque_fin              timestamptz not null,  -- hasta que queda libre

    vehiculo_id             bigint references public.vehiculos(id) on delete set null,
    conductor_id            bigint references public.usuarios(id) on delete set null,
    franja_id               bigint references public.transporte_franjas(id) on delete set null,
    precio_viaje            numeric(10,2) not null default 0,
    recargos                numeric(10,2) not null default 0,
    total                   numeric(10,2) not null default 0,
    desglose                jsonb not null default '{}'::jsonb,

    es_cortesia             boolean not null default false,
    cortesia_id             bigint,   -- la cortesía que se usó en este viaje
    cortesia_ganada_id      bigint,   -- la cortesía que se ganó con este viaje

    forma_pago              text,     -- cómo dice el cliente que va a pagar: efectivo o sinpe (no se acepta tarjeta)
    paga_con                numeric(10,2), -- efectivo: con cuánto paga (el conductor lleva el vuelto)
    cobro_forma             text,     -- cómo pagó (efectivo, sinpe, tarjeta)
    cierre_id               bigint,   -- cierre de caja: llave en 07_caja_y_ubicacion.sql

    -- pendiente (esperando que el conductor acepte) -> confirmado -> en_camino -> en_curso -> terminado.
    -- sin_conductor: todos rechazaron o nadie estaba libre (el personal busca otro o cancela).
    estado                  text not null default 'pendiente',
    asignado_en             timestamptz,             -- cuándo se le ofreció al conductor actual
    aceptado_en             timestamptz,             -- cuándo lo aceptó
    rechazado_por           bigint[] not null default '{}', -- conductores que lo rechazaron o no respondieron
    notas                   text,
    motivo_cancelacion      text,
    cancelado_por           bigint references public.usuarios(id) on delete set null,
    cancelado_en            timestamptz,
    en_camino_en            timestamptz,
    iniciado_en             timestamptz,
    terminado_en            timestamptz,
    creado_en               timestamptz not null default now(),
    actualizado_en          timestamptz not null default now(),

    constraint viajes_quienes_validos    check (personas >= 0 and mascotas >= 0 and (personas > 0 or lleva_mercaderia)),
    constraint viajes_bloque_valido      check (bloque_fin > bloque_inicio and km >= 0 and minutos >= 0),
    constraint viajes_montos_validos     check (precio_viaje >= 0 and recargos >= 0 and total >= 0),
    constraint viajes_cobro_forma_valida check (cobro_forma is null or cobro_forma in ('efectivo', 'sinpe', 'tarjeta')),
    constraint viajes_telefono_largo     check (char_length(cliente_telefono) <= 30)
);
create index if not exists viajes_empresa_inicio_idx on public.viajes (empresa_id, inicio);
create index if not exists viajes_vehiculo_idx       on public.viajes (vehiculo_id, bloque_inicio);
create index if not exists viajes_cliente_idx        on public.viajes (cliente_id, estado);
create index if not exists viajes_conductor_idx      on public.viajes (conductor_id, inicio);
create index if not exists viajes_caja_idx           on public.viajes (conductor_id, cierre_id);

-- Base ya instalada: aceptar o rechazar el viaje (estados pendiente y sin_conductor)
alter table public.viajes add column if not exists asignado_en timestamptz;
alter table public.viajes add column if not exists aceptado_en timestamptz;
alter table public.viajes add column if not exists rechazado_por bigint[] not null default '{}';
alter table public.viajes alter column estado set default 'pendiente';
alter table public.viajes drop constraint if exists viajes_estado_valido;
alter table public.viajes add constraint viajes_estado_valido check (estado in
    ('pendiente', 'sin_conductor', 'confirmado', 'en_camino', 'en_curso', 'terminado', 'cancelado', 'no_se_presento'));
create index if not exists viajes_pendientes_idx on public.viajes (empresa_id, asignado_en) where estado = 'pendiente';

-- Base ya instalada: forma de pago que elige el cliente (efectivo con cuánto paga, o SINPE)
alter table public.viajes add column if not exists forma_pago text;
alter table public.viajes add column if not exists paga_con numeric(10,2);
alter table public.viajes drop constraint if exists viajes_forma_pago_valida;
alter table public.viajes add constraint viajes_forma_pago_valida check (
    (forma_pago is null or forma_pago in ('efectivo', 'sinpe'))
    and (paga_con is null or (paga_con >= 0 and forma_pago = 'efectivo')));

-- Base ya instalada: QR único de cada viaje (los viajes que ya existían reciben el suyo)
alter table public.viajes add column if not exists token_qr uuid not null default gen_random_uuid();
create unique index if not exists viajes_token_qr_idx on public.viajes (token_qr);

create table if not exists public.cortesias (
    id              bigint generated always as identity primary key,
    empresa_id      bigint not null references public.empresas(id) on delete cascade,
    cliente_id      bigint not null references public.clientes(id) on delete cascade,
    ganada_en       timestamptz not null default now(),
    vence_en        timestamptz not null,
    usada_viaje_id  bigint references public.viajes(id) on delete set null,
    usada_en        timestamptz
);
create index if not exists cortesias_cliente_idx on public.cortesias (cliente_id, vence_en);

alter table public.viajes drop constraint if exists viajes_cortesia_fk;
alter table public.viajes add constraint viajes_cortesia_fk
    foreign key (cortesia_id) references public.cortesias(id) on delete set null;
alter table public.viajes drop constraint if exists viajes_cortesia_ganada_fk;
alter table public.viajes add constraint viajes_cortesia_ganada_fk
    foreign key (cortesia_ganada_id) references public.cortesias(id) on delete set null;

-- Código del viaje (V-000001) y fecha de modificación
create or replace function public.viajes_antes_de_guardar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' and new.codigo is null then
        new.codigo := 'V-' || lpad(nextval('public.viajes_codigo_seq')::text, 6, '0');
    end if;
    new.actualizado_en := now();
    return new;
end;
$$;

drop trigger if exists viajes_antes_de_guardar on public.viajes;
create trigger viajes_antes_de_guardar before insert or update on public.viajes
    for each row execute function public.viajes_antes_de_guardar();


-- ==================================================
-- FUNCIONES DE TRANSPORTE
-- ==================================================

-- Reglas de la empresa (si no tiene, las crea con los valores de siempre)
create or replace function public.transporte_cfg(p_empresa bigint)
returns public.transporte_config
language plpgsql
security definer
set search_path = ''
as $$
declare
    v public.transporte_config;
begin
    select * into v from public.transporte_config where empresa_id = p_empresa;
    if not found then
        insert into public.transporte_config (empresa_id) values (p_empresa) on conflict (empresa_id) do nothing;
        select * into v from public.transporte_config where empresa_id = p_empresa;
    end if;
    return v;
end;
$$;

-- Franja de una hora de recogida (vacía si a esa hora no hay servicio)
create or replace function public.viaje_franja(p_empresa bigint, p_inicio timestamptz)
returns public.transporte_franjas
language plpgsql
stable
set search_path = ''
as $$
declare
    v_local timestamp;
    f       public.transporte_franjas;
begin
    v_local := p_inicio at time zone coalesce(
        (select zona_horaria from public.transporte_config where empresa_id = p_empresa), 'America/Costa_Rica');
    select * into f
      from public.transporte_franjas x
     where x.empresa_id = p_empresa and x.activa
       and extract(isodow from v_local)::smallint = any(x.dias)
       and x.desde <= v_local::time and v_local::time < x.hasta
     order by x.desde
     limit 1;
    return f;
end;
$$;

-- Precio del viaje (jsonb con el desglose) o null si a esa hora no hay franja:
--   viaje = máximo(mínimo, cargo base + km × precio por km), redondeado hacia arriba
--   recargos = pasajeros adicionales + mercadería + mascotas (montos fijos)
--   total = viaje (0 si es cortesía) + recargos
create or replace function public.viaje_precio(p_empresa bigint, p_inicio timestamptz, p_km numeric,
    p_personas integer, p_mascotas integer, p_mercaderia boolean, p_cortesia boolean default false)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
    c       public.transporte_config;
    f       public.transporte_franjas;
    v_viaje numeric;
    r_pas   numeric;
    r_merc  numeric;
    r_masc  numeric;
begin
    select * into c from public.transporte_config where empresa_id = p_empresa;
    f := public.viaje_franja(p_empresa, p_inicio);
    if f.id is null then
        return null;
    end if;
    v_viaje := greatest(f.minimo, f.cargo_base + coalesce(p_km, 0) * f.precio_km);
    if coalesce(c.redondeo, 0) > 0 then
        v_viaje := ceil(v_viaje / c.redondeo) * c.redondeo;
    end if;
    r_pas  := greatest(0, coalesce(p_personas, 0) - coalesce(c.pasajeros_incluidos, 1)) * coalesce(c.recargo_pasajero, 0);
    r_merc := case when p_mercaderia then coalesce(c.recargo_mercaderia, 0) else 0 end;
    r_masc := coalesce(p_mascotas, 0) * coalesce(c.recargo_mascota, 0);
    return jsonb_build_object(
        'franja_id', f.id,
        'franja', coalesce(f.nombre, to_char(f.desde, 'HH24:MI') || '–' || to_char(f.hasta, 'HH24:MI')),
        'precio_km', f.precio_km, 'cargo_base', f.cargo_base, 'minimo', f.minimo, 'km', p_km,
        'viaje', v_viaje, 'cortesia', coalesce(p_cortesia, false),
        'recargo_pasajeros', r_pas, 'recargo_mercaderia', r_merc, 'recargo_mascotas', r_masc,
        'recargos', r_pas + r_merc + r_masc,
        'total', (case when p_cortesia then 0 else v_viaje end) + r_pas + r_merc + r_masc);
end;
$$;

-- Bloque que ocupa el vehículo: sale hacia A "acercamiento" minutos antes, hace el
-- viaje y suma el colchón; redondeado hacia arriba a 15 minutos.
create or replace function public.viaje_bloque(p_empresa bigint, p_inicio timestamptz, p_minutos integer,
    out bloque_inicio timestamptz, out bloque_fin timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
    v_acerca integer;
    v_colchon integer;
begin
    select coalesce(acercamiento_min, 15), coalesce(colchon_min, 10) into v_acerca, v_colchon
      from public.transporte_config where empresa_id = p_empresa;
    v_acerca := coalesce(v_acerca, 15);
    v_colchon := coalesce(v_colchon, 10);
    bloque_inicio := p_inicio - make_interval(mins => v_acerca);
    bloque_fin := bloque_inicio + make_interval(mins => (ceil((v_acerca + greatest(coalesce(p_minutos, 1), 1) + v_colchon) / 15.0) * 15)::integer);
end;
$$;

-- Vehículo libre para un bloque: activo, con conductor, con asientos y carga
-- suficientes, que acepte mascotas si hacen falta y sin otro viaje que choque.
-- Prefiere p_preferido (al cambiar la hora) y si no, el de menos viajes ese día.
-- p_sin_conductores: conductores que ya rechazaron ese viaje (no se le vuelve a ofrecer).
drop function if exists public.viaje_vehiculo_libre(bigint, timestamptz, timestamptz, integer, numeric, integer, bigint, bigint);
create or replace function public.viaje_vehiculo_libre(p_empresa bigint, p_desde timestamptz, p_hasta timestamptz,
    p_personas integer, p_kg numeric, p_mascotas integer, p_excluir bigint default null, p_preferido bigint default null,
    p_sin_conductores bigint[] default null,
    out vehiculo_id bigint, out conductor_id bigint)
language plpgsql
stable
set search_path = ''
as $$
begin
    select v.id, u.id into vehiculo_id, conductor_id
      from public.vehiculos v
      join lateral (select x.id from public.usuarios x
                     where x.vehiculo_id = v.id and x.rol = 'piloto' and x.aprobado
                       and not (x.id = any(coalesce(p_sin_conductores, '{}'::bigint[])))
                     order by x.id limit 1) u on true
     where v.empresa_id = p_empresa
       and v.estado <> 'mantenimiento'
       and coalesce(v.asientos, 0) >= coalesce(p_personas, 0)
       and (coalesce(p_kg, 0) <= 0 or coalesce(v.carga_kg, 0) >= p_kg)
       and (coalesce(p_mascotas, 0) = 0 or v.acepta_mascotas)
       and not exists (
           select 1 from public.viajes o
            where o.vehiculo_id = v.id
              and o.estado not in ('cancelado', 'no_se_presento')
              and (p_excluir is null or o.id <> p_excluir)
              and o.bloque_inicio < p_hasta
              and (case when o.estado = 'terminado' and o.terminado_en is not null
                        then least(o.bloque_fin, o.terminado_en) else o.bloque_fin end) > p_desde)
     order by (v.id = p_preferido) desc nulls last,
              (select count(*) from public.viajes d
                where d.vehiculo_id = v.id and d.estado not in ('cancelado', 'no_se_presento')
                  and d.inicio >= p_desde - interval '12 hours' and d.inicio < p_desde + interval '12 hours'),
              v.id
     limit 1;
end;
$$;

-- ¿Hay en la empresa ALGÚN vehículo (con conductor y sin mantenimiento) que sirva para el viaje,
-- a cualquier hora? Si no, el motivo (si no, todas las horas saldrían "Ocupado" sin explicación):
-- pocos asientos, o con mascotas y ningún vehículo las acepta (Configuración -> Vehículos).
-- null = sí hay.
create or replace function public.viaje_sin_vehiculo(p_empresa bigint, p_personas integer, p_mascotas integer)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    with sirven as (
        select v.asientos, v.acepta_mascotas
          from public.vehiculos v
         where v.empresa_id = p_empresa and v.estado <> 'mantenimiento'
           and exists (select 1 from public.usuarios x where x.vehiculo_id = v.id and x.rol = 'piloto' and x.aprobado))
    select case
        when not exists (select 1 from sirven where coalesce(asientos, 0) >= coalesce(p_personas, 1))
            then format('Ningún vehículo tiene lugar para %s %s.', coalesce(p_personas, 1),
                        case when coalesce(p_personas, 1) = 1 then 'persona' else 'personas' end)
        when coalesce(p_mascotas, 0) > 0
             and not exists (select 1 from sirven where coalesce(asientos, 0) >= coalesce(p_personas, 1) and acepta_mascotas)
            then 'Por ahora ningún vehículo acepta mascotas.'
    end;
$$;

-- ¿El bloque del vehículo (desde que sale hacia A hasta que queda libre) cae en una hora
-- bloqueada? Devuelve el motivo ('' si no tiene) o null.
create or replace function public.viaje_bloqueo(p_empresa bigint, p_desde timestamptz, p_hasta timestamptz)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(b.motivo, '')
      from public.transporte_bloqueos b,
           lateral (select coalesce((select zona_horaria from public.transporte_config where empresa_id = p_empresa),
                                    'America/Costa_Rica') as zona) z
     where b.empresa_id = p_empresa
       and (b.fecha = (p_desde at time zone z.zona)::date
            or extract(isodow from (p_desde at time zone z.zona))::smallint = any(b.dias))
       and b.desde < (p_hasta at time zone z.zona)::time
       and b.hasta > (p_desde at time zone z.zona)::time
     order by b.desde
     limit 1;
$$;

-- ¿Se puede reservar a esa hora? (lanza el error con el motivo)
create or replace function public.viaje_validar_inicio(p_empresa bigint, p_inicio timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    c       public.transporte_config;
    v_local timestamp;
begin
    c := public.transporte_cfg(p_empresa);
    v_local := p_inicio at time zone c.zona_horaria;
    if p_inicio < now() + make_interval(mins => c.anticipacion_min) then
        raise exception 'Reserva con al menos % minutos de anticipación.', c.anticipacion_min using errcode = 'P0001';
    end if;
    if v_local::date > (now() at time zone c.zona_horaria)::date + c.anticipacion_dias then
        raise exception 'Solo se puede reservar hasta % días después de hoy.', c.anticipacion_dias using errcode = 'P0001';
    end if;
    if exists (select 1 from public.transporte_dias_cerrados d where d.empresa_id = p_empresa and d.fecha = v_local::date) then
        raise exception 'Ese día no hay servicio.' using errcode = 'P0001';
    end if;
    if (public.viaje_franja(p_empresa, p_inicio)).id is null then
        raise exception 'A esa hora no hay servicio: elige una hora de la lista.' using errcode = 'P0001';
    end if;
    if extract(minute from v_local)::integer % 15 <> 0 then
        raise exception 'Elige una hora de la lista (cada 15 minutos).' using errcode = 'P0001';
    end if;
end;
$$;

-- Horas de un día: cada 15 minutos dentro de las franjas, si hay vehículo libre
-- y cuánto cuesta. Si el día no se puede, una sola fila con el motivo.
create or replace function public.viajes_horas_disponibles(p_empresa bigint, p_fecha date, p_km numeric, p_minutos integer,
    p_personas integer, p_mascotas integer, p_mercaderia boolean, p_kg numeric, p_excluir bigint default null)
returns table (inicio timestamptz, hora text, disponible boolean, franja text, total numeric, motivo text)
language plpgsql
security definer
set search_path = ''
as $$
declare
    c        public.transporte_config;
    v_hoy    date;
    v_motivo text;
    v_min    integer;
    v_ini    timestamptz;
    v_precio jsonb;
    f        record;
    t        timestamp;
    b        record;
    vl       record;
begin
    if not public.ve_empresa(p_empresa) then
        raise exception 'No tienes acceso a esa empresa.' using errcode = '42501';
    end if;
    c := public.transporte_cfg(p_empresa);
    v_hoy := (now() at time zone c.zona_horaria)::date;
    if p_fecha < v_hoy or p_fecha > v_hoy + c.anticipacion_dias then
        return query select null::timestamptz, null::text, false, null::text, null::numeric,
            format('Solo se puede reservar desde hoy hasta %s días después.', c.anticipacion_dias);
        return;
    end if;
    select coalesce(d.motivo, '') into v_motivo from public.transporte_dias_cerrados d
     where d.empresa_id = p_empresa and d.fecha = p_fecha;
    if found then
        return query select null::timestamptz, null::text, false, null::text, null::numeric,
            'Ese día no hay servicio' || case when v_motivo <> '' then ': ' || v_motivo else '.' end;
        return;
    end if;
    -- Ningún vehículo sirve (asientos o mascotas): una sola fila con el motivo
    v_motivo := public.viaje_sin_vehiculo(p_empresa, p_personas, p_mascotas);
    if v_motivo is not null then
        return query select null::timestamptz, null::text, false, null::text, null::numeric, v_motivo;
        return;
    end if;
    v_min := coalesce(p_minutos, ceil(coalesce(p_km, 0) / greatest(c.velocidad_kmh, 1) * 60)::integer);
    for f in select x.* from public.transporte_franjas x
              where x.empresa_id = p_empresa and x.activa and extract(isodow from p_fecha)::smallint = any(x.dias)
              order by x.desde loop
        for t in select g from generate_series(p_fecha + f.desde, p_fecha + f.hasta - interval '1 minute', interval '15 minutes') g loop
            v_ini := t at time zone c.zona_horaria;
            continue when v_ini < now() + make_interval(mins => c.anticipacion_min);
            select * into b from public.viaje_bloque(p_empresa, v_ini, v_min);
            v_precio := public.viaje_precio(p_empresa, v_ini, p_km, p_personas, p_mascotas, p_mercaderia, false);
            -- Hora bloqueada (ej. almuerzo): ningún vehículo sale
            if public.viaje_bloqueo(p_empresa, b.bloque_inicio, b.bloque_fin) is not null then
                return query select v_ini, to_char(t, 'HH24:MI'), false,
                    coalesce(f.nombre, to_char(f.desde, 'HH24:MI') || '–' || to_char(f.hasta, 'HH24:MI')),
                    (v_precio ->> 'total')::numeric, 'No disponible'::text;
                continue;
            end if;
            select * into vl from public.viaje_vehiculo_libre(p_empresa, b.bloque_inicio, b.bloque_fin,
                p_personas, p_kg, p_mascotas, p_excluir);
            return query select v_ini, to_char(t, 'HH24:MI'), vl.vehiculo_id is not null,
                coalesce(f.nombre, to_char(f.desde, 'HH24:MI') || '–' || to_char(f.hasta, 'HH24:MI')),
                (v_precio ->> 'total')::numeric,
                case when vl.vehiculo_id is null then 'Ocupado' end;
        end loop;
    end loop;
end;
$$;

-- Viaje con su vehículo y su conductor (lo que devuelven las funciones)
create or replace function public.viaje_json(p_viaje bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select to_jsonb(v) || jsonb_build_object(
        'vehiculo', (select jsonb_build_object('placa', x.placa, 'marca', x.marca, 'tipo', x.tipo) from public.vehiculos x where x.id = v.vehiculo_id),
        'conductor', (select jsonb_build_object('nombre', u.nombre, 'telefono', u.telefono) from public.usuarios u where u.id = v.conductor_id))
      from public.viajes v where v.id = p_viaje;
$$;

-- Aviso para un usuario (si hay a quién)
create or replace function public.viaje_avisar(p_usuario bigint, p_titulo text, p_mensaje text, p_viaje bigint)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, enlace, referencia_tipo, referencia_id)
    select p_usuario, 'info', p_titulo, p_mensaje, '#viajes?id=' || p_viaje, 'viaje', p_viaje
     where p_usuario is not null;
$$;

-- Viaje ofrecido a su conductor: aviso "pendiente" con sonido (referencia viaje_nuevo,
-- js/notificaciones.js). Se cierra solo al aceptar, rechazar o pasar a otro.
create or replace function public.viaje_avisar_conductor(p_viaje bigint)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, enlace, referencia_tipo, referencia_id)
    select v.conductor_id, 'pendiente', 'Viaje nuevo ' || v.codigo || ': acéptalo o recházalo',
           format('%s · %s · %s → %s · tienes %s min para responder',
                  to_char(v.inicio at time zone c.zona_horaria, 'DD/MM HH24:MI'), v.cliente_nombre,
                  v.origen_direccion, v.destino_direccion, c.aceptar_min),
           '#viajes?id=' || v.id, 'viaje_nuevo', v.id
      from public.viajes v, public.transporte_cfg(v.empresa_id) c
     where v.id = p_viaje and v.conductor_id is not null;
$$;

-- Avisos "pendiente" de un viaje ofrecido: se marcan leídos (ya respondió o pasó a otro)
create or replace function public.viaje_cerrar_avisos(p_viaje bigint)
returns void
language sql
security definer
set search_path = ''
as $$
    update public.notificaciones set leida = true
     where referencia_tipo = 'viaje_nuevo' and referencia_id = p_viaje and not leida;
$$;

-- ---------- Reservar ----------
-- p: { usuario_id, empresa_id (solo Desarrollador), cliente_id (personal; el cliente es él mismo),
--      origen: { direccion, lat, lng }, destino: {...}, km, minutos, aproximada,
--      personas, mascotas, mascotas_nota, lleva_mercaderia, mercaderia_descripcion,
--      mercaderia_bultos, mercaderia_kg, inicio, notas,
--      forma_pago ('efectivo' | 'sinpe'; no se acepta tarjeta), paga_con (efectivo: con cuánto paga) }
create or replace function public.viajes_solicitar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u          public.usuarios;
    c          public.transporte_config;
    v_empresa  bigint;
    v_cliente  record;
    v_inicio   timestamptz;
    v_km       numeric;
    v_min      integer;
    v_personas integer;
    v_mascotas integer;
    v_merc     boolean;
    v_kg       numeric;
    v_cort     bigint;
    v_precio   jsonb;
    v_viaje    public.viajes;
    v_forma    text := nullif(btrim(coalesce(p ->> 'forma_pago', '')), '');
    v_paga     numeric := nullif(p ->> 'paga_con', '')::numeric;
    v_total    numeric;
    v_motivo   text;
    b          record;
    vl         record;
begin
    u := public.usuario_activo((p ->> 'usuario_id')::bigint);
    if u.rol not in ('cliente', 'administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado', 'desarrollador') then
        raise exception 'Tu usuario no puede solicitar viajes.' using errcode = 'P0001';
    end if;
    v_empresa := case when u.rol = 'desarrollador' then (p ->> 'empresa_id')::bigint else u.empresa_id end;
    perform public.soporte_exigir(v_empresa, 'corregir');
    select id, public.nombre_completo(nombre, apellido1, apellido2) as nombre, telefono, empresa_id into v_cliente
      from public.clientes
     where id = case when u.rol = 'cliente' then u.cliente_id else (p ->> 'cliente_id')::bigint end;
    if v_cliente.id is null or v_cliente.empresa_id is distinct from v_empresa then
        raise exception 'Elige el cliente del viaje.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.empresas e join public.actividades a on a.codigo = any(e.actividades)
                    where e.id = v_empresa and a.usa_viajes and a.activa) then
        raise exception 'La empresa no tiene una actividad de viajes activa.' using errcode = 'P0001';
    end if;

    -- Viajes de personas (con o sin mascotas). La mercadería ya no se pide: se ignora.
    v_personas := (p ->> 'personas')::integer;
    v_mascotas := (p ->> 'mascotas')::integer;
    v_merc := false;
    v_kg := 0;
    if v_personas is null or v_personas < 1 then
        raise exception 'Indica cuántas personas viajan (al menos 1).' using errcode = 'P0001';
    end if;
    if v_mascotas is null or v_mascotas < 0 then
        raise exception 'Indica si lleva mascotas.' using errcode = 'P0001';
    end if;
    if (p #>> '{origen,lat}') is null or (p #>> '{origen,lng}') is null
       or (p #>> '{destino,lat}') is null or (p #>> '{destino,lng}') is null then
        raise exception 'Ubica el punto A y el punto B en el mapa.' using errcode = 'P0001';
    end if;
    v_inicio := (p ->> 'inicio')::timestamptz;
    if v_inicio is null then
        raise exception 'Elige el día y la hora.' using errcode = 'P0001';
    end if;

    -- Una reserva a la vez por empresa: dos clientes no toman la misma hora
    perform pg_advisory_xact_lock(7301, v_empresa::integer);
    c := public.transporte_cfg(v_empresa);
    perform public.viaje_validar_inicio(v_empresa, v_inicio);

    v_km := round(greatest(coalesce((p ->> 'km')::numeric, 0),
        public.km_recta((p #>> '{origen,lat}')::numeric, (p #>> '{origen,lng}')::numeric,
                        (p #>> '{destino,lat}')::numeric, (p #>> '{destino,lng}')::numeric)), 2);
    v_min := coalesce((p ->> 'minutos')::integer, ceil(v_km / greatest(c.velocidad_kmh, 1) * 60)::integer);
    select * into b from public.viaje_bloque(v_empresa, v_inicio, v_min);
    if public.viaje_bloqueo(v_empresa, b.bloque_inicio, b.bloque_fin) is not null then
        raise exception 'Esa hora no está disponible: elige otra.' using errcode = 'P0001', hint = 'ocupado';
    end if;
    v_motivo := public.viaje_sin_vehiculo(v_empresa, v_personas, v_mascotas);
    if v_motivo is not null then
        raise exception '%', v_motivo using errcode = 'P0001';
    end if;
    select * into vl from public.viaje_vehiculo_libre(v_empresa, b.bloque_inicio, b.bloque_fin, v_personas, v_kg, v_mascotas);
    if vl.vehiculo_id is null then
        raise exception 'Esa hora acaba de ocuparse: elige otra.' using errcode = 'P0001', hint = 'ocupado';
    end if;

    -- Cortesía: la que vence primero, si el viaje está dentro del radio
    if c.cortesia_activa and v_km <= c.cortesia_radio_km then
        select id into v_cort from public.cortesias
         where cliente_id = v_cliente.id and empresa_id = v_empresa and usada_viaje_id is null and vence_en > now()
         order by vence_en limit 1
           for update;
    end if;
    v_precio := public.viaje_precio(v_empresa, v_inicio, v_km, v_personas, v_mascotas, v_merc, v_cort is not null);

    -- Forma de pago: efectivo (con cuánto paga, para el vuelto) o SINPE. Sin tarjeta.
    -- Un viaje de cortesía sin recargos (total ₡0) no pide forma de pago.
    v_total := coalesce((v_precio ->> 'total')::numeric, 0);
    if v_total <= 0 then
        v_forma := null;
        v_paga := null;
    elsif v_forma = 'tarjeta' then
        raise exception 'No se acepta tarjeta: elige efectivo o SINPE Móvil.' using errcode = 'P0001';
    elsif v_forma is null or v_forma not in ('efectivo', 'sinpe') then
        raise exception 'Elige la forma de pago: efectivo o SINPE Móvil.' using errcode = 'P0001';
    elsif v_forma = 'sinpe' then
        v_paga := null;
    elsif v_paga is null then
        raise exception 'Indica con cuánto paga en efectivo (para llevar el vuelto).' using errcode = 'P0001';
    elsif v_paga < v_total then
        raise exception 'Con ₡% no alcanza: el viaje cuesta ₡%.', to_char(v_paga, 'FM999G999G990'), to_char(v_total, 'FM999G999G990')
            using errcode = 'P0001';
    end if;

    insert into public.viajes (
        empresa_id, cliente_id, cliente_nombre, cliente_telefono, solicitado_por,
        origen_direccion, origen_lat, origen_lng, destino_direccion, destino_lat, destino_lng,
        km, minutos, ruta_aproximada, personas, mascotas, mascotas_nota,
        lleva_mercaderia, mercaderia_descripcion, mercaderia_bultos, mercaderia_kg,
        inicio, bloque_inicio, bloque_fin, vehiculo_id, conductor_id, franja_id,
        precio_viaje, recargos, total, desglose, es_cortesia, cortesia_id, notas, estado, asignado_en,
        forma_pago, paga_con)
    values (
        v_empresa, v_cliente.id, v_cliente.nombre, v_cliente.telefono, u.id,
        coalesce(nullif(btrim(p #>> '{origen,direccion}'), ''), 'Punto A'), (p #>> '{origen,lat}')::numeric, (p #>> '{origen,lng}')::numeric,
        coalesce(nullif(btrim(p #>> '{destino,direccion}'), ''), 'Punto B'), (p #>> '{destino,lat}')::numeric, (p #>> '{destino,lng}')::numeric,
        v_km, v_min, coalesce((p ->> 'aproximada')::boolean, false), v_personas, v_mascotas, nullif(btrim(p ->> 'mascotas_nota'), ''),
        v_merc, case when v_merc then nullif(btrim(p ->> 'mercaderia_descripcion'), '') end,
        case when v_merc then (p ->> 'mercaderia_bultos')::smallint end, case when v_merc then nullif(v_kg, 0) end,
        v_inicio, b.bloque_inicio, b.bloque_fin, vl.vehiculo_id, vl.conductor_id, (v_precio ->> 'franja_id')::bigint,
        (v_precio ->> 'viaje')::numeric, (v_precio ->> 'recargos')::numeric, (v_precio ->> 'total')::numeric, v_precio,
        v_cort is not null, v_cort, nullif(btrim(p ->> 'notas'), ''), 'pendiente', now(),
        v_forma, v_paga)
    returning * into v_viaje;

    if v_cort is not null then
        update public.cortesias set usada_viaje_id = v_viaje.id, usada_en = now() where id = v_cort;
    end if;
    -- Queda "Esperando conductor": el conductor lo acepta o lo rechaza (viajes_responder)
    perform public.viaje_avisar_conductor(v_viaje.id);
    return public.viaje_json(v_viaje.id);
end;
$$;

-- ¿Puede esta persona cambiar o cancelar el viaje? (lanza el error si no)
create or replace function public.viaje_permiso(u public.usuarios, v public.viajes, c public.transporte_config)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
    if u.rol = 'cliente' then
        if v.cliente_id is distinct from u.cliente_id then
            raise exception 'Ese viaje no es tuyo.' using errcode = 'P0001';
        end if;
        if v.estado not in ('pendiente', 'sin_conductor', 'confirmado') then
            raise exception 'El viaje ya empezó: llama a la empresa.' using errcode = 'P0001';
        end if;
        if now() > v.inicio - make_interval(secs => (c.cancelar_horas * 3600)::integer) then
            raise exception 'Solo se puede cambiar o cancelar hasta % horas antes. Llama a la empresa.', c.cancelar_horas
                using errcode = 'P0001';
        end if;
    elsif u.rol in ('administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado') then
        if u.empresa_id is distinct from v.empresa_id then
            raise exception 'Ese viaje es de otra empresa.' using errcode = 'P0001';
        end if;
        if v.estado not in ('pendiente', 'sin_conductor', 'confirmado', 'en_camino') then
            raise exception 'Ese viaje ya no se puede cambiar.' using errcode = 'P0001';
        end if;
    elsif u.rol = 'desarrollador' then
        perform public.soporte_exigir(v.empresa_id, 'corregir');
        if v.estado not in ('pendiente', 'sin_conductor', 'confirmado', 'en_camino') then
            raise exception 'Ese viaje ya no se puede cambiar.' using errcode = 'P0001';
        end if;
    else
        raise exception 'Tu usuario no puede cambiar viajes.' using errcode = 'P0001';
    end if;
end;
$$;

-- ---------- Cancelar ----------
create or replace function public.viajes_cancelar(p_viaje bigint, p_usuario bigint, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u public.usuarios;
    v public.viajes;
    c public.transporte_config;
begin
    u := public.usuario_activo(p_usuario);
    select * into v from public.viajes where id = p_viaje for update;
    if not found then
        raise exception 'El viaje no existe.' using errcode = 'P0001';
    end if;
    c := public.transporte_cfg(v.empresa_id);
    perform public.viaje_permiso(u, v, c);

    update public.viajes
       set estado = 'cancelado', cancelado_por = u.id, cancelado_en = now(),
           motivo_cancelacion = nullif(btrim(coalesce(p_motivo, '')), '')
     where id = v.id;
    -- La cortesía vuelve si todavía no venció
    if v.es_cortesia and v.cortesia_id is not null then
        update public.cortesias set usada_viaje_id = null, usada_en = null
         where id = v.cortesia_id and vence_en > now();
    end if;
    perform public.viaje_cerrar_avisos(v.id);
    perform public.viaje_avisar(v.conductor_id, 'Viaje cancelado ' || v.codigo,
        format('%s · %s', to_char(v.inicio at time zone c.zona_horaria, 'DD/MM HH24:MI'), v.cliente_nombre), v.id);
    return public.viaje_json(v.id);
end;
$$;

-- ---------- Cambiar la hora (todo o nada) ----------
create or replace function public.viajes_cambiar_hora(p_viaje bigint, p_usuario bigint, p_inicio timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u        public.usuarios;
    v        public.viajes;
    c        public.transporte_config;
    b        record;
    vl       record;
    v_precio jsonb;
    v_sigue  boolean;
begin
    u := public.usuario_activo(p_usuario);
    select * into v from public.viajes where id = p_viaje for update;
    if not found then
        raise exception 'El viaje no existe.' using errcode = 'P0001';
    end if;
    c := public.transporte_cfg(v.empresa_id);
    perform public.viaje_permiso(u, v, c);
    perform pg_advisory_xact_lock(7301, v.empresa_id::integer);
    perform public.viaje_validar_inicio(v.empresa_id, p_inicio);

    select * into b from public.viaje_bloque(v.empresa_id, p_inicio, v.minutos);
    if public.viaje_bloqueo(v.empresa_id, b.bloque_inicio, b.bloque_fin) is not null then
        raise exception 'Esa hora no está disponible: elige otra. Tu viaje sigue como estaba.' using errcode = 'P0001', hint = 'ocupado';
    end if;
    select * into vl from public.viaje_vehiculo_libre(v.empresa_id, b.bloque_inicio, b.bloque_fin,
        v.personas, coalesce(v.mercaderia_kg, 0), v.mascotas, v.id, v.vehiculo_id);
    if vl.vehiculo_id is null then
        raise exception 'Esa hora no está disponible: elige otra. Tu viaje sigue como estaba.' using errcode = 'P0001', hint = 'ocupado';
    end if;
    v_precio := public.viaje_precio(v.empresa_id, p_inicio, v.km, v.personas, v.mascotas, v.lleva_mercaderia, v.es_cortesia);

    -- El mismo conductor que ya lo aceptó: sigue confirmado. Otro conductor: lo tiene que aceptar.
    v_sigue := v.conductor_id is not distinct from vl.conductor_id and v.estado in ('confirmado', 'en_camino');
    update public.viajes
       set inicio = p_inicio, bloque_inicio = b.bloque_inicio, bloque_fin = b.bloque_fin,
           vehiculo_id = vl.vehiculo_id, conductor_id = vl.conductor_id, franja_id = (v_precio ->> 'franja_id')::bigint,
           precio_viaje = (v_precio ->> 'viaje')::numeric, recargos = (v_precio ->> 'recargos')::numeric,
           total = (v_precio ->> 'total')::numeric, desglose = v_precio, en_camino_en = null,
           estado = case when v_sigue then 'confirmado' else 'pendiente' end,
           asignado_en = case when v_sigue then asignado_en else now() end,
           aceptado_en = case when v_sigue then aceptado_en end,
           rechazado_por = '{}'
     where id = v.id;
    perform public.viaje_cerrar_avisos(v.id);
    if v.conductor_id is distinct from vl.conductor_id then
        perform public.viaje_avisar(v.conductor_id, 'Viaje reasignado ' || v.codigo, 'Ya no te toca este viaje.', v.id);
    end if;
    if v_sigue then
        perform public.viaje_avisar(vl.conductor_id, 'Viaje con hora nueva ' || v.codigo,
            format('%s · %s', to_char(p_inicio at time zone c.zona_horaria, 'DD/MM HH24:MI'), v.cliente_nombre), v.id);
    else
        perform public.viaje_avisar_conductor(v.id);
    end if;
    return public.viaje_json(v.id);
end;
$$;

-- ---------- Pasar el viaje a otro conductor (rechazo o sin respuesta) ----------
-- Busca otro vehículo con conductor libre, sin los que ya lo rechazaron. Si hay: queda
-- "pendiente" para él (con aviso y sonido). Si no hay (o la hora ya pasó): "sin_conductor"
-- y se avisa al cliente, al Administrador y al G1. Devuelve el estado en que quedó.
--   p_excluir_actual: el conductor actual se suma a los que lo rechazaron
--   p_avisar_sin: avisar si queda sin conductor (no, cuando el personal vuelve a buscar)
create or replace function public.viaje_reasignar(p_viaje bigint, p_excluir_actual boolean, p_avisar_sin boolean default true)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v         public.viajes;
    c         public.transporte_config;
    v_veh     bigint;
    v_cond    bigint;
    v_excluir bigint[];
begin
    select * into v from public.viajes where id = p_viaje for update;
    c := public.transporte_cfg(v.empresa_id);
    perform pg_advisory_xact_lock(7301, v.empresa_id::integer);
    perform public.viaje_cerrar_avisos(v.id);
    v_excluir := v.rechazado_por
        || case when p_excluir_actual and v.conductor_id is not null then array[v.conductor_id] else '{}'::bigint[] end;

    if v.inicio > now() and public.viaje_bloqueo(v.empresa_id, v.bloque_inicio, v.bloque_fin) is null then
        select l.vehiculo_id, l.conductor_id into v_veh, v_cond
          from public.viaje_vehiculo_libre(v.empresa_id, v.bloque_inicio, v.bloque_fin,
               v.personas, coalesce(v.mercaderia_kg, 0), v.mascotas, v.id, null, v_excluir) l;
    end if;

    if v_veh is null then
        update public.viajes
           set estado = 'sin_conductor', vehiculo_id = null, conductor_id = null, asignado_en = null,
               aceptado_en = null, rechazado_por = v_excluir
         where id = v.id;
        if p_avisar_sin then
            perform public.viaje_avisar(x.id, 'Viaje sin conductor ' || v.codigo,
                format('%s · %s · ningún conductor libre lo aceptó: busca otro, cambia la hora o cancélalo.',
                       to_char(v.inicio at time zone c.zona_horaria, 'DD/MM HH24:MI'), v.cliente_nombre), v.id)
              from public.usuarios x
             where x.empresa_id = v.empresa_id and x.aprobado and x.rol in ('administrador', 'admin_g1');
            perform public.viaje_avisar(x.id, 'Buscamos conductor para tu viaje ' || v.codigo,
                format('%s · por ahora no hay conductor libre. La empresa te contactará.',
                       to_char(v.inicio at time zone c.zona_horaria, 'DD/MM HH24:MI')), v.id)
              from public.usuarios x where x.cliente_id = v.cliente_id;
        end if;
        return 'sin_conductor';
    end if;

    update public.viajes
       set estado = 'pendiente', vehiculo_id = v_veh, conductor_id = v_cond,
           asignado_en = now(), aceptado_en = null, rechazado_por = v_excluir
     where id = v.id;
    perform public.viaje_avisar_conductor(v.id);
    return 'pendiente';
end;
$$;

-- ---------- El conductor acepta o rechaza el viaje que le llegó ----------
create or replace function public.viajes_responder(p_viaje bigint, p_usuario bigint, p_acepta boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u public.usuarios;
    v public.viajes;
    c public.transporte_config;
begin
    u := public.usuario_activo(p_usuario);
    select * into v from public.viajes where id = p_viaje for update;
    if not found then
        raise exception 'El viaje no existe.' using errcode = 'P0001';
    end if;
    if v.conductor_id is distinct from u.id then
        raise exception 'Este viaje ya no está asignado a ti.' using errcode = 'P0001', hint = 'cambiado';
    end if;
    if v.estado <> 'pendiente' then
        raise exception 'Este viaje ya fue respondido.' using errcode = 'P0001', hint = 'cambiado';
    end if;
    c := public.transporte_cfg(v.empresa_id);

    if p_acepta then
        update public.viajes set estado = 'confirmado', aceptado_en = now() where id = v.id;
        perform public.viaje_cerrar_avisos(v.id);
        perform public.viaje_avisar(x.id, 'Viaje confirmado ' || v.codigo,
            format('%s · tu conductor es %s', to_char(v.inicio at time zone c.zona_horaria, 'DD/MM HH24:MI'), u.nombre), v.id)
          from public.usuarios x where x.cliente_id = v.cliente_id;
    else
        perform public.viaje_reasignar(v.id, true);
    end if;
    return public.viaje_json(v.id);
end;
$$;

-- ---------- Viajes que el conductor no respondió a tiempo ----------
-- Pasan a otro conductor como si los hubiera rechazado. No hay un reloj en la base: la
-- llama la página de cualquier persona conectada de la empresa (js/notificaciones.js, cada
-- minuto). Devuelve cuántos pasó.
create or replace function public.viajes_revisar_pendientes(p_empresa bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    c   public.transporte_config;
    r   record;
    v_n integer := 0;
begin
    if p_empresa is null or not public.ve_empresa(p_empresa) or not public.es_personal() then
        return 0;
    end if;
    c := public.transporte_cfg(p_empresa);
    for r in select id, conductor_id, codigo from public.viajes
              where empresa_id = p_empresa and estado = 'pendiente'
                and asignado_en < now() - make_interval(mins => c.aceptar_min)
              order by inicio
              for update skip locked loop
        perform public.viaje_avisar(r.conductor_id, 'Viaje ' || r.codigo || ' pasó a otro conductor',
            format('No respondiste en %s minutos.', c.aceptar_min), r.id);
        perform public.viaje_reasignar(r.id, true);
        v_n := v_n + 1;
    end loop;
    return v_n;
end;
$$;

-- ---------- Volver a buscar conductor (personal, viaje sin conductor) ----------
-- Se le puede ofrecer de nuevo a quienes lo rechazaron (el personal ya habló con ellos).
create or replace function public.viajes_buscar_conductor(p_viaje bigint, p_usuario bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u public.usuarios;
    v public.viajes;
begin
    u := public.usuario_activo(p_usuario);
    select * into v from public.viajes where id = p_viaje for update;
    if not found then
        raise exception 'El viaje no existe.' using errcode = 'P0001';
    end if;
    if not ((u.rol = 'desarrollador' and public.soporte_puede(v.empresa_id, 'corregir'))
            or (u.rol in ('administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado') and u.empresa_id = v.empresa_id)) then
        raise exception 'Tu usuario no puede asignar viajes.' using errcode = 'P0001';
    end if;
    if v.estado <> 'sin_conductor' then
        raise exception 'Ese viaje ya tiene conductor.' using errcode = 'P0001', hint = 'cambiado';
    end if;
    if v.inicio <= now() then
        raise exception 'La hora del viaje ya pasó: cambia la hora o cancélalo.' using errcode = 'P0001';
    end if;
    update public.viajes set rechazado_por = '{}' where id = v.id;
    if public.viaje_reasignar(v.id, false, false) = 'sin_conductor' then
        raise exception 'No hay conductor libre a esa hora: cambia la hora o cancela el viaje.' using errcode = 'P0001';
    end if;
    return public.viaje_json(v.id);
end;
$$;

-- ---------- Cortesía: ¿ya juntó los viajes? ----------
create or replace function public.cortesia_revisar(p_empresa bigint, p_cliente bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    c     public.transporte_config;
    v_ids bigint[];
    v_id  bigint;
begin
    c := public.transporte_cfg(p_empresa);
    if not c.cortesia_activa or p_cliente is null then
        return;
    end if;
    select array_agg(id order by terminado_en) into v_ids
      from (select id, terminado_en from public.viajes
             where empresa_id = p_empresa and cliente_id = p_cliente and estado = 'terminado'
               and not es_cortesia and cortesia_ganada_id is null
               and terminado_en >= now() - make_interval(days => c.cortesia_dias)
             order by terminado_en
             limit c.cortesia_viajes) x;
    if coalesce(cardinality(v_ids), 0) < c.cortesia_viajes then
        return;
    end if;
    insert into public.cortesias (empresa_id, cliente_id, vence_en)
    values (p_empresa, p_cliente, now() + make_interval(days => c.cortesia_vence_dias))
    returning id into v_id;
    update public.viajes set cortesia_ganada_id = v_id where id = any(v_ids);
    perform public.viaje_avisar(u.id, '¡Ganaste un viaje de cortesía!',
        format('Se aplica solo en tu próximo viaje de hasta %s km. Vence el %s.', c.cortesia_radio_km,
               to_char(now() at time zone c.zona_horaria + make_interval(days => c.cortesia_vence_dias), 'DD/MM/YYYY')), v_ids[1])
      from public.usuarios u where u.cliente_id = p_cliente;
end;
$$;

-- ---------- Avanzar el estado (conductor o personal) ----------
--   confirmado -> en_camino -> en_curso -> terminado | confirmado / en_camino -> no_se_presento
create or replace function public.viajes_avanzar(p_viaje bigint, p_usuario bigint, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u public.usuarios;
    v public.viajes;
    c public.transporte_config;
begin
    u := public.usuario_activo(p_usuario);
    select * into v from public.viajes where id = p_viaje for update;
    if not found then
        raise exception 'El viaje no existe.' using errcode = 'P0001';
    end if;
    if not ((u.rol = 'desarrollador' and public.soporte_puede(v.empresa_id, 'corregir'))
            or (u.rol = 'piloto' and v.conductor_id = u.id)
            or (u.rol in ('administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado') and u.empresa_id = v.empresa_id)) then
        raise exception 'Este viaje no es tuyo.' using errcode = 'P0001';
    end if;
    if not ((p_estado = 'en_camino' and v.estado = 'confirmado')
            or (p_estado = 'en_curso' and v.estado in ('confirmado', 'en_camino'))
            or (p_estado = 'terminado' and v.estado in ('en_camino', 'en_curso'))
            or (p_estado = 'no_se_presento' and v.estado in ('confirmado', 'en_camino'))) then
        raise exception 'El viaje está "%": no puede pasar a "%".', v.estado, p_estado using errcode = 'P0001';
    end if;
    c := public.transporte_cfg(v.empresa_id);

    update public.viajes
       set estado = p_estado,
           en_camino_en = case when p_estado = 'en_camino' then now() else en_camino_en end,
           iniciado_en  = case when p_estado = 'en_curso' then now() else iniciado_en end,
           terminado_en = case when p_estado = 'terminado' then now() else terminado_en end
     where id = v.id;

    if p_estado = 'en_camino' then
        perform public.viaje_avisar(x.id, 'Tu conductor va en camino',
            format('%s · llega a %s cerca de las %s', v.codigo, v.origen_direccion,
                   to_char(v.inicio at time zone c.zona_horaria, 'HH24:MI')), v.id)
          from public.usuarios x where x.cliente_id = v.cliente_id;
    elsif p_estado = 'terminado' then
        perform public.cortesia_revisar(v.empresa_id, v.cliente_id);
    end if;
    return public.viaje_json(v.id);
end;
$$;

-- ---------- Cortesía del cliente (Inicio y Viajes) ----------
create or replace function public.viajes_estado_cliente(p_cliente bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_empresa bigint;
    c         public.transporte_config;
    v_n       integer;
    v_primero timestamptz;
begin
    select empresa_id into v_empresa from public.clientes where id = p_cliente;
    -- El cliente ve lo suyo; el personal, los clientes de su empresa
    if v_empresa is null or not (coalesce(p_cliente = public.mi_cliente(), false)
                                 or (public.es_personal() and public.ve_empresa(v_empresa))
                                 or public.llamada_interna()) then
        return null;
    end if;
    c := public.transporte_cfg(v_empresa);
    select count(*), min(terminado_en) into v_n, v_primero from public.viajes
     where empresa_id = v_empresa and cliente_id = p_cliente and estado = 'terminado'
       and not es_cortesia and cortesia_ganada_id is null
       and terminado_en >= now() - make_interval(days => c.cortesia_dias);
    return jsonb_build_object(
        'activa', c.cortesia_activa, 'necesarios', c.cortesia_viajes, 'dias', c.cortesia_dias,
        'radio_km', c.cortesia_radio_km, 'cancelar_horas', c.cancelar_horas,
        'contados', least(v_n, c.cortesia_viajes),
        'cuenta_hasta', v_primero + make_interval(days => c.cortesia_dias),
        'cortesias', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'vence_en', vence_en) order by vence_en)
                                 from public.cortesias
                                where cliente_id = p_cliente and usada_viaje_id is null and vence_en > now()), '[]'::jsonb));
end;
$$;
