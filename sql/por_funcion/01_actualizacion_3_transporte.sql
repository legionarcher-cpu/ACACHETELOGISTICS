-- 3 de 15 · sql/01_actualizacion_base_existente.sql · Viajes, rol cliente, franjas, costos y cortesía (bloques 19 a 19).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 19. TRANSPORTE: VIAJES, CLIENTES CON USUARIO, FRANJAS, COSTOS Y CORTESÍA (2026-10-04)
--   Diseño: docs/14-transporte.md. Lo usan js/viajes-comun.js, js/secciones/viajes.js
--   y js/secciones/configuracion/transporte.js.
--   - actividades.usa_viajes: la actividad trabaja con VIAJES (agenda, el cliente
--     solicita, conductor y vehículo automáticos). Transporte = sí.
--   - Rol "cliente": usuario ligado a un cliente (usuarios.cliente_id). Entra solo a
--     Inicio, Viajes y Mi perfil. Se crea en Clientes -> "Acceso y lugares".
--   - clientes: Casa y Trabajo (dirección y punto) para armar la ruta con un toque.
--   - vehiculos: asientos, carga, acepta mascotas y datos de costos; tipos auto y microbús.
--   - transporte_config: reglas por empresa (agenda, recargos, cortesía, combustible).
--   - transporte_franjas: precio por km según la hora de recogida (no se enciman).
--   - transporte_dias_cerrados, transporte_costos (gastos del mes por vehículo).
--   - viajes y cortesias. La página SOLO LEE estas dos tablas: reservar, cambiar la
--     hora, cancelar y avanzar el estado se hace con funciones de la base, que
--     revisan las reglas y evitan que dos clientes tomen la misma hora.
--   Se puede repetir.
-- ==================================================

-- ---------- Actividades: ¿trabaja con viajes? ----------
alter table public.actividades add column if not exists usa_viajes boolean not null default false;
update public.actividades set usa_viajes = true where codigo = 'transporte';

-- ---------- Vehículos: lo que necesita la agenda y los costos ----------
alter table public.vehiculos
    add column if not exists asientos        smallint,      -- pasajeros (sin contar al conductor)
    add column if not exists carga_kg        numeric(8,2),  -- carga máxima
    add column if not exists acepta_mascotas boolean not null default false,
    add column if not exists km_por_litro    numeric(6,2),  -- rendimiento (costo del combustible)
    add column if not exists horas_mes       numeric(6,1),  -- horas de trabajo estimadas al mes
    add column if not exists km_mes          numeric(8,1);  -- km estimados al mes
alter table public.vehiculos drop constraint if exists vehiculos_tipo_valido;
alter table public.vehiculos add constraint vehiculos_tipo_valido
    check (tipo is null or tipo in ('camion', 'pickup', 'panel', 'moto', 'auto', 'microbus'));
alter table public.vehiculos drop constraint if exists vehiculos_transporte_valido;
alter table public.vehiculos add constraint vehiculos_transporte_valido check (
    (asientos is null or asientos between 0 and 60) and (carga_kg is null or carga_kg >= 0)
    and (km_por_litro is null or km_por_litro > 0) and (horas_mes is null or horas_mes >= 0)
    and (km_mes is null or km_mes >= 0));

-- ---------- Clientes: Casa y Trabajo ----------
alter table public.clientes
    add column if not exists casa_direccion    text,
    add column if not exists casa_lat          numeric(9,6),
    add column if not exists casa_lng          numeric(9,6),
    add column if not exists trabajo_direccion text,
    add column if not exists trabajo_lat       numeric(9,6),
    add column if not exists trabajo_lng       numeric(9,6);

-- ---------- Usuarios: rol cliente ----------
alter table public.usuarios add column if not exists cliente_id bigint references public.clientes(id) on delete cascade;
create unique index if not exists usuarios_un_acceso_por_cliente on public.usuarios (cliente_id) where cliente_id is not null;

alter table public.usuarios drop constraint if exists usuarios_rol_valido;
alter table public.usuarios add constraint usuarios_rol_valido check (
    rol in ('desarrollador', 'administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado', 'piloto', 'cliente'));
alter table public.usuarios drop constraint if exists usuarios_tienda_segun_rol;
alter table public.usuarios add constraint usuarios_tienda_segun_rol check (
    (rol in ('desarrollador', 'administrador', 'admin_g1') and tienda_id is null and region is null)
    or (rol = 'admin_g2' and tienda_id is null and region is not null)
    or (rol in ('admin_g3', 'empleado', 'piloto') and tienda_id is not null and region is null)
    or (rol = 'cliente' and tienda_id is null and region is null and cliente_id is not null));
alter table public.usuarios drop constraint if exists usuarios_cliente_solo_cliente;
alter table public.usuarios add constraint usuarios_cliente_solo_cliente check (cliente_id is null or rol = 'cliente');

-- empresa_id del usuario: de su tienda, su región o (cliente) de su cliente
create or replace function public.empresa_de_usuario()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.rol = 'desarrollador' then
        new.empresa_id := null;
    elsif new.tienda_id is not null then
        select t.empresa_id into new.empresa_id from public.tiendas t where t.id = new.tienda_id;
    elsif new.region is not null then
        select r.empresa_id into new.empresa_id from public.regiones r where r.codigo = new.region;
    elsif new.cliente_id is not null then
        select c.empresa_id into new.empresa_id from public.clientes c where c.id = new.cliente_id;
    end if;
    return new;
end;
$$;

drop trigger if exists usuarios_empresa on public.usuarios;
create trigger usuarios_empresa before insert or update of tienda_id, region, rol, cliente_id on public.usuarios
    for each row execute function public.empresa_de_usuario();

-- ---------- Reglas de transporte de cada empresa ----------
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
    precio_litro         numeric(10,2) not null default 0,   -- combustible (costos)
    actualizado_en       timestamptz   not null default now(),

    constraint transporte_config_valida check (
        acercamiento_min between 0 and 240 and colchon_min between 0 and 240 and velocidad_kmh > 0
        and anticipacion_min between 0 and 10080 and anticipacion_dias between 0 and 90
        and cancelar_horas >= 0 and pasajeros_incluidos >= 0
        and recargo_pasajero >= 0 and recargo_mercaderia >= 0 and recargo_mascota >= 0 and redondeo >= 0
        and cortesia_viajes > 0 and cortesia_dias > 0 and cortesia_vence_dias > 0 and cortesia_radio_km >= 0
        and precio_litro >= 0)
);

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

    constraint franjas_horas_validas check (hasta > desde),
    constraint franjas_dias_validos  check (cardinality(dias) > 0 and dias <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
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

-- Gastos del mes. vehiculo_id vacío = de toda la empresa (se reparte entre los vehículos)
create table if not exists public.transporte_costos (
    id           bigint generated always as identity primary key,
    empresa_id   bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    vehiculo_id  bigint references public.vehiculos(id) on delete cascade,
    concepto     text not null,
    tipo         text not null,
    monto_mes    numeric(12,2) not null,
    creado_en    timestamptz not null default now(),

    constraint costos_tipo_valido  check (tipo in ('fijo', 'variable')),
    constraint costos_monto_valido check (monto_mes >= 0)
);
create index if not exists transporte_costos_empresa_idx on public.transporte_costos (empresa_id);

-- ---------- Viajes ----------
create sequence if not exists public.viajes_codigo_seq;

create table if not exists public.viajes (
    id                      bigint generated always as identity primary key,
    codigo                  text unique,
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
    cortesia_ganada_id      bigint,   -- la cortesía que se ganó con este viaje (contó entre los 5)

    estado                  text not null default 'confirmado',
    notas                   text,
    motivo_cancelacion      text,
    cancelado_por           bigint references public.usuarios(id) on delete set null,
    cancelado_en            timestamptz,
    en_camino_en            timestamptz,
    iniciado_en             timestamptz,
    terminado_en            timestamptz,
    creado_en               timestamptz not null default now(),
    actualizado_en          timestamptz not null default now(),

    constraint viajes_estado_valido check (estado in ('confirmado', 'en_camino', 'en_curso', 'terminado', 'cancelado', 'no_se_presento')),
    constraint viajes_quienes_validos check (personas >= 0 and mascotas >= 0 and (personas > 0 or lleva_mercaderia)),
    constraint viajes_bloque_valido check (bloque_fin > bloque_inicio and km >= 0 and minutos >= 0),
    constraint viajes_montos_validos check (precio_viaje >= 0 and recargos >= 0 and total >= 0)
);
create index if not exists viajes_empresa_inicio_idx on public.viajes (empresa_id, inicio);
create index if not exists viajes_vehiculo_idx       on public.viajes (vehiculo_id, bloque_inicio);
create index if not exists viajes_cliente_idx        on public.viajes (cliente_id, estado);
create index if not exists viajes_conductor_idx      on public.viajes (conductor_id, inicio);

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

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'viajes_cortesia_fk') then
        alter table public.viajes add constraint viajes_cortesia_fk
            foreign key (cortesia_id) references public.cortesias(id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'viajes_cortesia_ganada_fk') then
        alter table public.viajes add constraint viajes_cortesia_ganada_fk
            foreign key (cortesia_ganada_id) references public.cortesias(id) on delete set null;
    end if;
end;
$$;

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

-- Distancia en línea recta (km): nadie puede cobrar menos que esto
create or replace function public.km_recta(a_lat numeric, a_lng numeric, b_lat numeric, b_lng numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
    select (6371 * 2 * asin(sqrt(
        power(sin(radians((b_lat - a_lat)::float8) / 2), 2)
        + cos(radians(a_lat::float8)) * cos(radians(b_lat::float8)) * power(sin(radians((b_lng - a_lng)::float8) / 2), 2))))::numeric;
$$;

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
create or replace function public.viaje_vehiculo_libre(p_empresa bigint, p_desde timestamptz, p_hasta timestamptz,
    p_personas integer, p_kg numeric, p_mascotas integer, p_excluir bigint default null, p_preferido bigint default null,
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
    v_min := coalesce(p_minutos, ceil(coalesce(p_km, 0) / greatest(c.velocidad_kmh, 1) * 60)::integer);
    for f in select x.* from public.transporte_franjas x
              where x.empresa_id = p_empresa and x.activa and extract(isodow from p_fecha)::smallint = any(x.dias)
              order by x.desde loop
        for t in select g from generate_series(p_fecha + f.desde, p_fecha + f.hasta - interval '1 minute', interval '15 minutes') g loop
            v_ini := t at time zone c.zona_horaria;
            continue when v_ini < now() + make_interval(mins => c.anticipacion_min);
            select * into b from public.viaje_bloque(p_empresa, v_ini, v_min);
            select * into vl from public.viaje_vehiculo_libre(p_empresa, b.bloque_inicio, b.bloque_fin,
                p_personas, p_kg, p_mascotas, p_excluir);
            v_precio := public.viaje_precio(p_empresa, v_ini, p_km, p_personas, p_mascotas, p_mercaderia, false);
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

-- Usuario que hace la acción: { id, rol, empresa_id, cliente_id, nombre }
create or replace function public.viaje_usuario(p_usuario bigint)
returns public.usuarios
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    u public.usuarios;
begin
    select * into u from public.usuarios where id = p_usuario;
    if not found or u.aprobado = false then
        raise exception 'Usuario no válido: vuelve a iniciar sesión.' using errcode = 'P0001';
    end if;
    return u;
end;
$$;

-- ---------- Reservar ----------
-- p: { usuario_id, empresa_id (solo Desarrollador), cliente_id (personal; el cliente es él mismo),
--      origen: { direccion, lat, lng }, destino: {...}, km, minutos, aproximada,
--      personas, mascotas, mascotas_nota, lleva_mercaderia, mercaderia_descripcion,
--      mercaderia_bultos, mercaderia_kg, inicio, notas }
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
    b          record;
    vl         record;
begin
    u := public.viaje_usuario((p ->> 'usuario_id')::bigint);
    if u.rol not in ('cliente', 'administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado', 'desarrollador') then
        raise exception 'Tu usuario no puede solicitar viajes.' using errcode = 'P0001';
    end if;
    v_empresa := case when u.rol = 'desarrollador' then (p ->> 'empresa_id')::bigint else u.empresa_id end;
    select id, nombre, apellidos, telefono, empresa_id into v_cliente from public.clientes
     where id = case when u.rol = 'cliente' then u.cliente_id else (p ->> 'cliente_id')::bigint end;
    if v_cliente.id is null or v_cliente.empresa_id is distinct from v_empresa then
        raise exception 'Elige el cliente del viaje.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.empresas e join public.actividades a on a.codigo = any(e.actividades)
                    where e.id = v_empresa and a.usa_viajes and a.activa) then
        raise exception 'La empresa no tiene una actividad de viajes activa.' using errcode = 'P0001';
    end if;

    v_personas := (p ->> 'personas')::integer;
    v_mascotas := (p ->> 'mascotas')::integer;
    v_merc := coalesce((p ->> 'lleva_mercaderia')::boolean, false);
    v_kg := coalesce((p ->> 'mercaderia_kg')::numeric, 0);
    if v_personas is null or v_personas < 0 then
        raise exception 'Indica cuántas personas viajan.' using errcode = 'P0001';
    end if;
    if v_mascotas is null or v_mascotas < 0 then
        raise exception 'Indica si lleva mascotas.' using errcode = 'P0001';
    end if;
    if v_personas = 0 and not v_merc then
        raise exception 'Si no viaja nadie, el viaje debe llevar mercadería.' using errcode = 'P0001';
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

    insert into public.viajes (
        empresa_id, cliente_id, cliente_nombre, cliente_telefono, solicitado_por,
        origen_direccion, origen_lat, origen_lng, destino_direccion, destino_lat, destino_lng,
        km, minutos, ruta_aproximada, personas, mascotas, mascotas_nota,
        lleva_mercaderia, mercaderia_descripcion, mercaderia_bultos, mercaderia_kg,
        inicio, bloque_inicio, bloque_fin, vehiculo_id, conductor_id, franja_id,
        precio_viaje, recargos, total, desglose, es_cortesia, cortesia_id, notas)
    values (
        v_empresa, v_cliente.id, btrim(v_cliente.nombre || ' ' || coalesce(v_cliente.apellidos, '')), v_cliente.telefono, u.id,
        coalesce(nullif(btrim(p #>> '{origen,direccion}'), ''), 'Punto A'), (p #>> '{origen,lat}')::numeric, (p #>> '{origen,lng}')::numeric,
        coalesce(nullif(btrim(p #>> '{destino,direccion}'), ''), 'Punto B'), (p #>> '{destino,lat}')::numeric, (p #>> '{destino,lng}')::numeric,
        v_km, v_min, coalesce((p ->> 'aproximada')::boolean, false), v_personas, v_mascotas, nullif(btrim(p ->> 'mascotas_nota'), ''),
        v_merc, case when v_merc then nullif(btrim(p ->> 'mercaderia_descripcion'), '') end,
        case when v_merc then (p ->> 'mercaderia_bultos')::smallint end, case when v_merc then nullif(v_kg, 0) end,
        v_inicio, b.bloque_inicio, b.bloque_fin, vl.vehiculo_id, vl.conductor_id, (v_precio ->> 'franja_id')::bigint,
        (v_precio ->> 'viaje')::numeric, (v_precio ->> 'recargos')::numeric, (v_precio ->> 'total')::numeric, v_precio,
        v_cort is not null, v_cort, nullif(btrim(p ->> 'notas'), ''))
    returning * into v_viaje;

    if v_cort is not null then
        update public.cortesias set usada_viaje_id = v_viaje.id, usada_en = now() where id = v_cort;
    end if;
    perform public.viaje_avisar(vl.conductor_id, 'Viaje nuevo ' || v_viaje.codigo,
        format('%s · %s · %s → %s', to_char(v_inicio at time zone c.zona_horaria, 'DD/MM HH24:MI'),
               v_viaje.cliente_nombre, v_viaje.origen_direccion, v_viaje.destino_direccion), v_viaje.id);
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
        if v.estado <> 'confirmado' then
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
        if v.estado not in ('confirmado', 'en_camino') then
            raise exception 'Ese viaje ya no se puede cambiar.' using errcode = 'P0001';
        end if;
    elsif u.rol = 'desarrollador' then
        if v.estado not in ('confirmado', 'en_camino') then
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
    u := public.viaje_usuario(p_usuario);
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
begin
    u := public.viaje_usuario(p_usuario);
    select * into v from public.viajes where id = p_viaje for update;
    if not found then
        raise exception 'El viaje no existe.' using errcode = 'P0001';
    end if;
    c := public.transporte_cfg(v.empresa_id);
    perform public.viaje_permiso(u, v, c);
    perform pg_advisory_xact_lock(7301, v.empresa_id::integer);
    perform public.viaje_validar_inicio(v.empresa_id, p_inicio);

    select * into b from public.viaje_bloque(v.empresa_id, p_inicio, v.minutos);
    select * into vl from public.viaje_vehiculo_libre(v.empresa_id, b.bloque_inicio, b.bloque_fin,
        v.personas, coalesce(v.mercaderia_kg, 0), v.mascotas, v.id, v.vehiculo_id);
    if vl.vehiculo_id is null then
        raise exception 'Esa hora no está disponible: elige otra. Tu viaje sigue como estaba.' using errcode = 'P0001', hint = 'ocupado';
    end if;
    v_precio := public.viaje_precio(v.empresa_id, p_inicio, v.km, v.personas, v.mascotas, v.lleva_mercaderia, v.es_cortesia);

    update public.viajes
       set inicio = p_inicio, bloque_inicio = b.bloque_inicio, bloque_fin = b.bloque_fin,
           vehiculo_id = vl.vehiculo_id, conductor_id = vl.conductor_id, franja_id = (v_precio ->> 'franja_id')::bigint,
           precio_viaje = (v_precio ->> 'viaje')::numeric, recargos = (v_precio ->> 'recargos')::numeric,
           total = (v_precio ->> 'total')::numeric, desglose = v_precio, estado = 'confirmado', en_camino_en = null
     where id = v.id;
    if v.conductor_id is distinct from vl.conductor_id then
        perform public.viaje_avisar(v.conductor_id, 'Viaje reasignado ' || v.codigo, 'Ya no te toca este viaje.', v.id);
    end if;
    perform public.viaje_avisar(vl.conductor_id, 'Viaje con hora nueva ' || v.codigo,
        format('%s · %s', to_char(p_inicio at time zone c.zona_horaria, 'DD/MM HH24:MI'), v.cliente_nombre), v.id);
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
    u := public.viaje_usuario(p_usuario);
    select * into v from public.viajes where id = p_viaje for update;
    if not found then
        raise exception 'El viaje no existe.' using errcode = 'P0001';
    end if;
    if not (u.rol = 'desarrollador'
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
    if v_empresa is null then
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

-- ---------- Acceso desde la web (TEMPORAL, como las demás tablas) ----------
-- Configuración de transporte: leer, crear, modificar y eliminar
do $$
declare
    t text;
begin
    foreach t in array array['transporte_config', 'transporte_franjas', 'transporte_dias_cerrados', 'transporte_costos'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('grant select, insert, update, delete on public.%I to anon', t);
        execute format('drop policy if exists "TEMPORAL - leer %1$s" on public.%1$I', t);
        execute format('drop policy if exists "TEMPORAL - crear %1$s" on public.%1$I', t);
        execute format('drop policy if exists "TEMPORAL - modificar %1$s" on public.%1$I', t);
        execute format('drop policy if exists "TEMPORAL - eliminar %1$s" on public.%1$I', t);
        execute format('create policy "TEMPORAL - leer %1$s" on public.%1$I for select to anon using (true)', t);
        execute format('create policy "TEMPORAL - crear %1$s" on public.%1$I for insert to anon with check (true)', t);
        execute format('create policy "TEMPORAL - modificar %1$s" on public.%1$I for update to anon using (true) with check (true)', t);
        execute format('create policy "TEMPORAL - eliminar %1$s" on public.%1$I for delete to anon using (true)', t);
    end loop;
    -- Viajes y cortesías: la página SOLO LEE (todo cambio pasa por las funciones de arriba)
    foreach t in array array['viajes', 'cortesias'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('revoke insert, update, delete on public.%I from anon', t);
        execute format('grant select on public.%I to anon', t);
        execute format('drop policy if exists "TEMPORAL - leer %1$s" on public.%1$I', t);
        execute format('create policy "TEMPORAL - leer %1$s" on public.%1$I for select to anon using (true)', t);
    end loop;
end;
$$;

grant execute on function public.viajes_horas_disponibles(bigint, date, numeric, integer, integer, integer, boolean, numeric, bigint) to anon;
grant execute on function public.viajes_solicitar(jsonb) to anon;
grant execute on function public.viajes_cancelar(bigint, bigint, text) to anon;
grant execute on function public.viajes_cambiar_hora(bigint, bigint, timestamptz) to anon;
grant execute on function public.viajes_avanzar(bigint, bigint, text) to anon;
grant execute on function public.viajes_estado_cliente(bigint) to anon;
grant execute on function public.viaje_precio(bigint, timestamptz, numeric, integer, integer, boolean, boolean) to anon;
-- Las funciones internas no se llaman desde la página
revoke execute on function public.transporte_cfg(bigint) from anon, public;
revoke execute on function public.viaje_validar_inicio(bigint, timestamptz) from anon, public;
revoke execute on function public.viaje_avisar(bigint, text, text, bigint) from anon, public;
revoke execute on function public.viaje_usuario(bigint) from anon, public;
revoke execute on function public.cortesia_revisar(bigint, bigint) from anon, public;
revoke execute on function public.viaje_json(bigint) from anon, public;

notify pgrst, 'reload schema';


