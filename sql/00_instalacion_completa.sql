-- ==================================================
-- INSTALACIÓN COMPLETA EN BLANCO (una empresa nueva)
-- ACACHETE LOGISTICS
--
-- Para qué sirve: crear TODA la base de datos del sistema en un proyecto
-- de Supabase NUEVO y vacío, de una sola vez. Es el ÚNICO script de
-- instalación: reemplaza a los 21 scripts anteriores (eliminados), ya en su
-- versión final (ej. los roles de administración en una sola regla).
--
-- Secciones (las citan los comentarios del código como "sql/00, sección N"):
--    1. Regiones y tiendas          7. Rutas
--    2. Vehículos                   8. Pedidos (+ número y código de respaldo)
--    3. Usuarios y roles            9. Vehículo "en uso" automático
--    4. Clientes y notificaciones  10. Acceso desde la web (temporal)
--    5. Configuración y horarios   11. Archivos (fotos)
--    6. Actividades y configuración de pedidos
--   12. Empresas internas (ID "01", usuarios jperez01 / cenjperez01)
--
-- Queda EN BLANCO: sin tiendas, pilotos, empleados, clientes, vehículos,
-- rutas ni pedidos. Solo trae:
--   - el usuario "desar" (Desarrollador, clave ak7desa) y el usuario "admin"
--     (Administrador, clave admin123: CAMBIARLA al entrar)
--   - las regiones de ejemplo (CAMBIARLAS por las reales antes de ejecutar)
--   - la configuración inicial: actividades, categorías de mercadería,
--     pesos promedio de artículos, tamaños de bulto, tarifas generales de
--     ejemplo, motivos de retraso, 5 horarios (marcas) y 4 slots de ejemplo.
--
-- Cómo ejecutarlo:
--   1. supabase.com -> New project (uno por empresa).
--   2. SQL Editor -> New query -> pegar TODO este archivo -> Run ("with RLS").
--      Si se corta a medias, se puede volver a ejecutar: salta lo que ya
--      existe y completa lo que falta (no borra ni duplica datos).
--   3. Project Settings -> API: copiar "Project URL" y "anon public" en
--      empresas/empresas.js (campo supabase de la empresa).
--
-- ⚠ MODO RÁPIDO: la clave se guarda sin cifrar y las reglas de acceso son
-- TEMPORALES (todo abierto a la clave pública). Antes de usarlo con datos
-- reales: Fase 7 (Supabase Auth + RLS).
--
-- NO ejecutar en una base que ya tiene el sistema: para esas está
-- sql/01_actualizacion_base_existente.sql.
--
-- Regla: cada cambio nuevo de estructura se agrega AQUÍ (en su sección) y
-- también al final de sql/01_actualizacion_base_existente.sql.
-- ==================================================


-- ==================================================
-- 1. REGIONES Y TIENDAS
-- ==================================================

-- codigo: 3 letras MAYÚSCULAS (inicio del código de cada tienda, ej. NOR-001)
create table if not exists public.regiones (
    codigo  text primary key check (codigo ~ '^[A-Z]{3}$'),
    nombre  text not null
);

-- ⚠ CAMBIAR por las regiones reales antes de ejecutar (luego se administran en Tiendas -> Regiones)
insert into public.regiones (codigo, nombre) values
    ('CEN', 'Central'),
    ('NOR', 'Norte'),
    ('SUR', 'Sur'),
    ('ORI', 'Oriente'),
    ('OCC', 'Occidente')
on conflict do nothing;

create table if not exists public.tiendas (
    id         bigint generated always as identity primary key,
    codigo     text not null unique,
    region     text not null references public.regiones(codigo),
    nombre     text not null,
    direccion  text,
    telefono   text,
    estado     text not null default 'activa',
    lat        numeric(9,6),   -- ubicación en el mapa (punto de salida de sus entregas)
    lng        numeric(9,6),
    creado_en  timestamptz not null default now(),

    constraint tiendas_codigo_formato check (codigo ~ '^[A-Z]{3}-[0-9]{3}$'),
    constraint tiendas_codigo_region  check (left(codigo, 3) = region),
    constraint tiendas_estado_valido  check (estado in ('activa', 'inactiva'))
);


-- ==================================================
-- 2. VEHÍCULOS (tipo: camión, pick-up, panel o moto)
-- ==================================================

create table if not exists public.vehiculos (
    id         bigint generated always as identity primary key,
    placa      text not null unique,
    tipo       text,
    marca      text not null,
    estado     text not null default 'disponible',
    creado_en  timestamptz not null default now(),

    constraint vehiculos_placa_formato check (placa ~ '^[A-Z0-9-]+$'),
    constraint vehiculos_estado_valido check (estado in ('disponible', 'en_uso', 'mantenimiento')),
    constraint vehiculos_tipo_valido   check (tipo is null or tipo in ('camion', 'pickup', 'panel', 'moto'))
);


-- ==================================================
-- 3. USUARIOS
-- Roles:
--   desarrollador               -> por encima del Administrador (solo se crea aquí, por SQL)
--   administrador, admin_g1     -> sin tienda ni región (usuario + ID de la empresa: jlopez01)
--   admin_g2                    -> con región (jlopez01)
--   admin_g3, empleado, piloto  -> con tienda (usuario: región + nombre + empresa, norjperez01)
--   (el ID de la empresa y su regla están en la sección 12; "admin" y "desar" no cambian)
-- ==================================================

create table if not exists public.usuarios (
    id              bigint generated always as identity primary key,
    nombre          text        not null,
    id_usuario      text        not null unique,
    telefono        text,
    clave           text        not null,
    permisos        text[]      not null default '{}',
    rol             text        not null,
    tienda_id       bigint references public.tiendas(id) on delete restrict,
    region          text references public.regiones(codigo) on delete restrict,
    foto_url        text,
    aprobado        boolean     not null default true,
    solicitado_por  bigint references public.usuarios(id) on delete set null,
    solicitado_en   timestamptz,
    vehiculo_id     bigint references public.vehiculos(id) on delete set null,
    multitienda     boolean     not null default false,
    creado_en       timestamptz not null default now(),

    constraint usuarios_rol_valido check (
        rol in ('desarrollador', 'administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado', 'piloto')),
    constraint usuarios_tienda_segun_rol check (
        (rol in ('desarrollador', 'administrador', 'admin_g1') and tienda_id is null and region is null)
        or (rol = 'admin_g2' and tienda_id is null and region is not null)
        or (rol in ('admin_g3', 'empleado', 'piloto') and tienda_id is not null and region is null)),
    constraint usuarios_vehiculo_solo_piloto    check (vehiculo_id is null or rol = 'piloto'),
    constraint usuarios_multitienda_solo_piloto check (not multitienda or rol = 'piloto')
);

-- Reglas de rol al día (si la tabla ya existía de una ejecución anterior)
alter table public.usuarios drop constraint if exists usuarios_rol_valido;
alter table public.usuarios add constraint usuarios_rol_valido check (
    rol in ('desarrollador', 'administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado', 'piloto'));
alter table public.usuarios drop constraint if exists usuarios_tienda_segun_rol;
alter table public.usuarios add constraint usuarios_tienda_segun_rol check (
    (rol in ('desarrollador', 'administrador', 'admin_g1') and tienda_id is null and region is null)
    or (rol = 'admin_g2' and tienda_id is null and region is not null)
    or (rol in ('admin_g3', 'empleado', 'piloto') and tienda_id is not null and region is null));

-- Usuarios iniciales:
--   desar -> DESARROLLADOR: por encima de todo; no aparece para los demás usuarios
--            (el login no distingue mayúsculas: "Desar" también entra)
--   admin -> Administrador de la empresa que usa el sistema. ⚠ Cambiar su clave al entrar.
insert into public.usuarios (nombre, id_usuario, telefono, clave, permisos, rol) values
    ('Desarrollador', 'desar', '00000000', 'ak7desa',  '{*}', 'desarrollador'),
    ('Administrador', 'admin', '00000000', 'admin123', '{*}', 'administrador')
on conflict do nothing;

-- Los usuarios "desar" y "admin" no se pueden eliminar ni cambiar de usuario o rol
create or replace function public.proteger_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' and old.id_usuario in ('admin', 'desar') then
        raise exception 'El usuario % está protegido y no se puede eliminar.', old.id_usuario
            using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and old.id_usuario in ('admin', 'desar')
       and (new.id_usuario <> old.id_usuario or new.rol <> old.rol) then
        raise exception 'Al usuario % no se le puede cambiar el usuario ni el rol.', old.id_usuario
            using errcode = 'P0001';
    end if;
    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

drop trigger if exists usuarios_proteger_admin on public.usuarios;
create trigger usuarios_proteger_admin
    before update or delete on public.usuarios
    for each row execute function public.proteger_admin();

-- Cambiar el código de una tienda y renombrar a sus usuarios (sección Tiendas)
create or replace function public.cambiar_codigo_tienda(p_tienda_id bigint, p_nuevo_codigo text)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_codigo_viejo text;
begin
    select codigo into v_codigo_viejo from public.tiendas where id = p_tienda_id for update;
    if not found then
        raise exception 'La tienda no existe.' using errcode = 'P0002';
    end if;
    if v_codigo_viejo = p_nuevo_codigo then
        return;
    end if;

    update public.tiendas
       set codigo = p_nuevo_codigo, region = left(p_nuevo_codigo, 3)
     where id = p_tienda_id;

    update public.usuarios
       set id_usuario = lower(p_nuevo_codigo) || '-' || substr(id_usuario, length(v_codigo_viejo) + 2)
     where tienda_id = p_tienda_id
       and id_usuario like lower(v_codigo_viejo) || '-%';
end;
$$;


-- ==================================================
-- 4. CLIENTES Y NOTIFICACIONES
-- ==================================================

-- apellidos y busqueda los calcula la base (no se escriben):
--   apellidos -> "Apellido1 Apellido2" (lo leen Pedidos, avisos, etc.)
--   busqueda  -> nombre, apellidos, correo y teléfono (solo dígitos) en minúsculas
--                y sin tildes: el buscador de clientes de Pedidos busca aquí
create table if not exists public.clientes (
    id                  bigint generated always as identity primary key,
    nombre              text not null,
    apellido1           text not null,
    apellido2           text,
    apellidos           text generated always as (btrim(apellido1 || ' ' || coalesce(apellido2, ''))) stored,
    telefono            text not null,
    correo              text,
    busqueda            text generated always as (lower(translate(
                            nombre || ' ' || apellido1 || ' ' || coalesce(apellido2, '') || ' ' ||
                            coalesce(correo, '') || ' ' || regexp_replace(telefono, '\D', '', 'g'),
                            'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))) stored,
    direccion           text,
    ubicacion           text,
    aprobado            boolean not null default true,
    cambios_pendientes  jsonb,
    solicitado_por      bigint references public.usuarios(id) on delete set null,
    solicitado_en       timestamptz,
    creado_en           timestamptz not null default now(),

    constraint clientes_correo_formato check (correo is null or correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- El correo identifica al cliente: no se repite (sin importar mayúsculas) dentro
-- de cada empresa (la regla con la empresa está en la sección 12)
do $$
begin
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'clientes' and column_name = 'empresa_id') then
        create unique index if not exists clientes_correo_unico on public.clientes (lower(correo)) where correo is not null;
    end if;
end;
$$;

create table if not exists public.clientes_tiendas (
    cliente_id  bigint not null references public.clientes(id) on delete cascade,
    tienda_id   bigint not null references public.tiendas(id) on delete cascade,
    primary key (cliente_id, tienda_id)
);

create table if not exists public.notificaciones (
    id               bigint generated always as identity primary key,
    usuario_id       bigint not null references public.usuarios(id) on delete cascade,
    tipo             text not null default 'info',
    titulo           text not null,
    mensaje          text,
    enlace           text,
    referencia_tipo  text,
    referencia_id    bigint,
    leida            boolean not null default false,
    creado_en        timestamptz not null default now(),

    constraint notificaciones_tipo_valido check (tipo in ('pendiente', 'aprobado', 'rechazado', 'info'))
);

create index if not exists notificaciones_usuario_idx on public.notificaciones (usuario_id, leida, creado_en desc);


-- ==================================================
-- 5. CONFIGURACIÓN Y HORARIOS
-- ==================================================

create table if not exists public.configuracion (
    clave           text primary key,
    valor           jsonb not null,
    actualizado_en  timestamptz not null default now()
);

insert into public.configuracion (clave, valor) values
    ('cantidad_marcas',   '5'),
    ('pedidos_por_marca', '5'),
    ('numero_pedido',     '"automatico"'),
    ('codigo_respaldo',   '["aleatorio"]')
on conflict do nothing;

create table if not exists public.marcas_horario (
    numero          smallint primary key,
    inicio_desde    time not null,  -- desde aquí se puede marcar (solo lo ven G2 o superior)
    inicio_hasta    time not null,  -- "HORA INICIO": hasta aquí la marca es a tiempo
    fin             time not null,  -- "TERMINA": hasta aquí, marca tardía (con justificación)
    actualizado_en  timestamptz not null default now(),

    constraint marcas_numero_valido  check (numero between 1 and 24),
    constraint marcas_ventana_valida check (inicio_hasta >= inicio_desde),
    constraint marcas_fin_valido     check (fin > inicio_hasta)
);

insert into public.marcas_horario (numero, inicio_desde, inicio_hasta, fin) values
    (1, '07:00', '07:30', '09:00'),
    (2, '09:00', '09:30', '11:00'),
    (3, '11:00', '11:30', '13:00'),
    (4, '13:00', '13:30', '15:00'),
    (5, '15:00', '15:30', '17:00')
on conflict do nothing;

create table if not exists public.capacidad_marcas (
    id                 bigint generated always as identity primary key,
    region             text references public.regiones(codigo) on delete cascade,
    tienda_id          bigint references public.tiendas(id) on delete cascade,
    pedidos_por_marca  integer not null,
    creado_en          timestamptz not null default now(),

    constraint capacidad_valida check (pedidos_por_marca between 0 and 999),
    constraint capacidad_region_o_tienda check ((region is null) <> (tienda_id is null)),
    constraint capacidad_region_unica unique (region),
    constraint capacidad_tienda_unica unique (tienda_id)
);

create table if not exists public.horario_dias (
    dia              smallint primary key,
    cantidad_marcas  smallint not null,
    actualizado_en   timestamptz not null default now(),

    constraint horario_dia_valido      check (dia between 1 and 7),
    constraint horario_cantidad_valida check (cantidad_marcas between 0 and 24)
);

create table if not exists public.marcas_dia (
    dia             smallint not null references public.horario_dias(dia) on delete cascade,
    numero          smallint not null,
    inicio_desde    time not null,
    inicio_hasta    time not null,
    fin             time not null,

    primary key (dia, numero),
    constraint marcas_dia_numero_valido  check (numero between 1 and 24),
    constraint marcas_dia_ventana_valida check (inicio_hasta >= inicio_desde),
    constraint marcas_dia_fin_valido     check (fin > inicio_hasta)
);

-- Marcas (horarios) que aplican a una fecha: las propias del día o las de la base
create or replace function public.marcas_del_dia(p_fecha date default current_date)
returns table (numero smallint, inicio_desde time, inicio_hasta time, fin time, personalizado boolean)
language sql
stable
as $$
    select m.numero, m.inicio_desde, m.inicio_hasta, m.fin, true
    from public.marcas_dia m
    where m.dia = extract(isodow from p_fecha)
    union all
    select b.numero, b.inicio_desde, b.inicio_hasta, b.fin, false
    from public.marcas_horario b
    where not exists (select 1 from public.horario_dias d where d.dia = extract(isodow from p_fecha))
    order by 1;
$$;

-- ---------- MARCAS DEL PILOTO CON QR (sql/01 bloques 13 y 14) ----------
-- 1. Al empezar el día, la TIENDA valida al piloto escaneando su QR DEL DÍA (el G2 lo
--    da en Rutas y asignaciones; el piloto también lo ve en su Inicio): pilotos_dia.
--    Sin esa validación el piloto NO puede marcar.
-- 2. Cada tienda tiene un QR DE MARCAS que cambia cada mes (qr_marcas; se ve e
--    imprime en Tiendas). El piloto lo escanea al llegar y la base marca sola el
--    horario que está abierto en ese momento (marcar_por_qr), con la hora de Costa Rica.
-- 3. Cada horario (marcas_horario / marcas_dia):
--      inicio_desde -> desde aquí se puede marcar (SOLO lo ven G2 o superior)
--      inicio_hasta -> "HORA INICIO": marcar hasta aquí = a tiempo
--      fin          -> "TERMINA": entre la hora inicio y aquí = MARCA TARDÍA (el piloto
--                      debe escribir por qué); después ya no se puede marcar
-- 4. Cada marca guarda lo mínimo (piloto, día, horario, hora, a tiempo y, si fue tardía,
--    su justificación: menos de 1 KB) y lo de meses anteriores se borra solo.
-- La página no escribe directo en estas tablas: solo con las funciones (security definer).
create table if not exists public.marcas_piloto (
    id             bigint generated always as identity primary key,
    piloto_id      bigint not null references public.usuarios(id) on delete cascade,
    fecha          date not null,
    numero         smallint not null,
    marcado_en     timestamptz not null default now(),
    a_tiempo       boolean not null default true,
    justificacion  text,  -- solo si fue tardía (máx. 200 caracteres)

    constraint marcas_piloto_unica unique (piloto_id, fecha, numero),
    constraint marcas_piloto_justificacion check (justificacion is null or length(justificacion) <= 200)
);

-- Código del QR de marcas de cada tienda, uno por mes
create table if not exists public.qr_marcas (
    tienda_id  bigint not null references public.tiendas(id) on delete cascade,
    mes        date not null,  -- primer día del mes
    codigo     text not null,
    primary key (tienda_id, mes)
);

-- QR del día de cada piloto y su validación en tienda
create table if not exists public.pilotos_dia (
    piloto_id     bigint not null references public.usuarios(id) on delete cascade,
    fecha         date not null,
    token         uuid not null default gen_random_uuid() unique,
    validado_en   timestamptz,
    validado_por  bigint references public.usuarios(id) on delete set null,
    primary key (piloto_id, fecha)
);

-- Fecha y hora de la empresa (Costa Rica). Cambiar aquí si la empresa está en otra zona.
create or replace function public.ahora_local()
returns timestamp
language sql
stable
as $$ select now() at time zone 'America/Costa_Rica' $$;

-- QR de marcas del mes de una tienda (lo crea si no existe; borra los de meses anteriores).
-- Lo que lleva el QR: ACACHETE-MARCA:<tienda>:<código del mes>
create or replace function public.qr_marca_mes(p_tienda bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_mes    date := date_trunc('month', public.ahora_local())::date;
    v_codigo text;
begin
    delete from public.qr_marcas where mes < v_mes;
    select codigo into v_codigo from public.qr_marcas where tienda_id = p_tienda and mes = v_mes;
    if v_codigo is null then
        insert into public.qr_marcas (tienda_id, mes, codigo)
        values (p_tienda, v_mes, substr(md5(random()::text || clock_timestamp()::text || p_tienda::text), 1, 16))
        on conflict (tienda_id, mes) do nothing;
        select codigo into v_codigo from public.qr_marcas where tienda_id = p_tienda and mes = v_mes;
    end if;
    return 'ACACHETE-MARCA:' || p_tienda || ':' || v_codigo;
end;
$$;

-- QR del día de un piloto (solo sirve hoy). Lo que lleva el QR: ACACHETE-PILOTO:<token>
create or replace function public.qr_piloto_dia(p_piloto bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_hoy   date := public.ahora_local()::date;
    v_token uuid;
begin
    delete from public.pilotos_dia where fecha < date_trunc('month', v_hoy)::date;
    insert into public.pilotos_dia (piloto_id, fecha) values (p_piloto, v_hoy) on conflict (piloto_id, fecha) do nothing;
    select token into v_token from public.pilotos_dia where piloto_id = p_piloto and fecha = v_hoy;
    return 'ACACHETE-PILOTO:' || v_token::text;
end;
$$;

-- La tienda escanea el QR del día: valida al piloto y devuelve su nombre y su foto
create or replace function public.validar_piloto(p_token uuid, p_usuario bigint)
returns table (piloto_id bigint, nombre text, foto_url text, tienda text, validado_en timestamptz, ya_estaba boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
    v_hoy date := public.ahora_local()::date;
    d     record;
begin
    select * into d from public.pilotos_dia x where x.token = p_token;
    if not found then
        raise exception 'Ese QR de piloto no existe.' using errcode = 'P0001';
    end if;
    if d.fecha <> v_hoy then
        raise exception 'Ese QR es del %: pide el QR de hoy.', to_char(d.fecha, 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
    if d.validado_en is null then
        update public.pilotos_dia x set validado_en = now(), validado_por = p_usuario
         where x.piloto_id = d.piloto_id and x.fecha = v_hoy;
    end if;
    return query
        select u.id, u.nombre, u.foto_url, t.codigo || ' · ' || t.nombre,
               coalesce(d.validado_en, now()), d.validado_en is not null
          from public.usuarios u
          left join public.tiendas t on t.id = u.tienda_id
         where u.id = d.piloto_id;
end;
$$;

-- El piloto escanea el QR de marcas de la tienda: se marca el horario que está abierto
-- (entre "inicia desde" y "termina"); a tiempo = hasta la "hora inicio" (inicio_hasta).
-- Si es TARDÍA y no viene p_justificacion, responde "JUSTIFICAR:..." para que la página
-- pida el motivo y vuelva a llamar con él.
create or replace function public.marcar_por_qr(p_piloto bigint, p_qr text, p_justificacion text default null)
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
    v_mes     date := date_trunc('month', v_ahora)::date;
    v_partes  text[] := string_to_array(coalesce(p_qr, ''), ':');
    v_tienda  bigint;
    v_proxima time;
    m         record;
begin
    if coalesce(array_length(v_partes, 1), 0) <> 3 or v_partes[1] <> 'ACACHETE-MARCA' or v_partes[2] !~ '^[0-9]+$' then
        raise exception 'Ese no es un QR de marcas de tienda.' using errcode = 'P0001';
    end if;
    v_tienda := v_partes[2]::bigint;
    if not exists (select 1 from public.qr_marcas q where q.tienda_id = v_tienda and q.mes = v_mes and q.codigo = v_partes[3]) then
        raise exception 'Este QR de marcas ya no sirve (cambia cada mes). Pide a la tienda el QR de este mes.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.pilotos_dia d where d.piloto_id = p_piloto and d.fecha = v_hoy and d.validado_en is not null) then
        raise exception 'La tienda todavía no te ha validado hoy: muéstrale tu QR del día y luego marca.' using errcode = 'P0001';
    end if;

    delete from public.marcas_piloto mp where mp.fecha < v_mes; -- lo de meses anteriores se borra solo

    select x.* into m from public.marcas_del_dia(v_hoy) x
     where v_hora between x.inicio_desde and x.fin
       and not exists (select 1 from public.marcas_piloto mp
                        where mp.piloto_id = p_piloto and mp.fecha = v_hoy and mp.numero = x.numero)
     order by x.numero
     limit 1;
    if not found then
        -- Al piloto no se le dice "inicia desde" (solo lo ven G2+): se le da la hora inicio
        select min(x.inicio_hasta) into v_proxima from public.marcas_del_dia(v_hoy) x where x.inicio_desde > v_hora;
        raise exception '%', case when v_proxima is null
            then 'No hay ningún horario abierto para marcar ahora.'
            else 'Todavía no se puede marcar: el próximo horario tiene hora de inicio ' || to_char(v_proxima, 'HH24:MI') || '.' end
            using errcode = 'P0001';
    end if;

    -- Marca tardía: hay que justificar
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

-- ---------- SLOTS: rango de horario de despacho de cada pedido ----------
-- Distinto de la marca (horario del piloto, que solo ven el piloto y G2+).
-- El empleado elige el slot al registrar el pedido y lo confirma al marcarlo
-- "Listo para despachar". Igual que las marcas: slots base y, si se quiere,
-- slots propios por día de la semana (Configuración -> Slots).
insert into public.configuracion (clave, valor) values
    ('cantidad_slots', '4')
on conflict do nothing;

create table if not exists public.slots_horario (
    numero          smallint primary key,
    inicio          time not null,
    fin             time not null,
    actualizado_en  timestamptz not null default now(),

    constraint slots_numero_valido check (numero between 1 and 24),
    constraint slots_fin_valido    check (fin > inicio)
);

insert into public.slots_horario (numero, inicio, fin) values
    (1, '08:00', '10:00'),
    (2, '10:00', '12:00'),
    (3, '13:00', '15:00'),
    (4, '15:00', '17:00')
on conflict do nothing;

create table if not exists public.slot_dias (
    dia             smallint primary key,
    cantidad_slots  smallint not null,
    actualizado_en  timestamptz not null default now(),

    constraint slot_dia_valido      check (dia between 1 and 7),
    constraint slot_cantidad_valida check (cantidad_slots between 0 and 24)
);

create table if not exists public.slots_dia (
    dia     smallint not null references public.slot_dias(dia) on delete cascade,
    numero  smallint not null,
    inicio  time not null,
    fin     time not null,

    primary key (dia, numero),
    constraint slots_dia_numero_valido check (numero between 1 and 24),
    constraint slots_dia_fin_valido    check (fin > inicio)
);

-- Slots que aplican a una fecha: los propios del día o los de la base
create or replace function public.slots_del_dia(p_fecha date default current_date)
returns table (numero smallint, inicio time, fin time, personalizado boolean)
language sql
stable
as $$
    select s.numero, s.inicio, s.fin, true
    from public.slots_dia s
    where s.dia = extract(isodow from p_fecha)
    union all
    select b.numero, b.inicio, b.fin, false
    from public.slots_horario b
    where not exists (select 1 from public.slot_dias d where d.dia = extract(isodow from p_fecha))
    order by 1;
$$;


-- ==================================================
-- 6. ACTIVIDADES Y CONFIGURACIÓN DE PEDIDOS
-- ==================================================

-- Qué usa cada actividad (se cambia en Configuración -> Actividades).
-- La empresa elige cuáles realiza en empresas/empresas.js.
create table if not exists public.actividades (
    codigo           text primary key,
    nombre           text not null,
    descripcion      text,
    icono            text not null default 'bi-box-seam',
    usa_bodega       boolean not null default false, -- estado "Recibido en bodega"
    usa_recoleccion  boolean not null default false, -- dirección de recolección
    usa_compra       boolean not null default false, -- monto de compra, envío gratis, cobrar compra
    usa_tamanos      boolean not null default false, -- tamaño S/M/L/XL en los bultos
    permite_alcohol  boolean not null default false, -- casilla "lleva alcohol"
    activa           boolean not null default true,
    orden            smallint not null default 0
);

insert into public.actividades (codigo, nombre, descripcion, icono, usa_bodega, usa_recoleccion, usa_compra, usa_tamanos, permite_alcohol, orden) values
    ('tienda', 'Entregas de tienda', 'Supermercado: abarrotes, línea blanca, electrónica y más.', 'bi-shop', false, false, true, false, true, 1),
    ('encomiendas', 'Encomiendas', 'Cajas, bolsas, documentos y artículos. Recepción en bodega y entrega con QR.', 'bi-box-seam', true, true, false, true, false, 2)
on conflict do nothing;

create table if not exists public.tiendas_actividades (
    tienda_id  bigint not null references public.tiendas(id) on delete cascade,
    actividad  text not null references public.actividades(codigo) on delete cascade,
    primary key (tienda_id, actividad)
);

-- Categorías de mercadería (casillas del pedido), por actividad.
--   conteo    -> cajas, bolsas, hieleras y peso aproximado (abarrotes)
--   articulos -> artículos con su peso (del catálogo de pesos promedio)
--   bulto     -> bultos con cantidad, tamaño y peso (cajas, bolsas)
--   documento -> solo cantidad; peso de cada uno = peso_referencia
create table if not exists public.categorias_mercaderia (
    id               bigint generated always as identity primary key,
    actividad        text not null references public.actividades(codigo) on delete cascade,
    nombre           text not null,
    tipo             text not null default 'articulos',
    icono            text not null default 'bi-box',
    peso_referencia  numeric(8,2),
    activa           boolean not null default true,
    orden            smallint not null default 0,

    constraint categorias_tipo_valido check (tipo in ('conteo', 'articulos', 'bulto', 'documento')),
    constraint categorias_nombre_unico unique (actividad, nombre)
);

insert into public.categorias_mercaderia (actividad, nombre, tipo, icono, orden, peso_referencia) values
    ('tienda',      'Abarrotes',       'conteo',    'bi-basket',   1, null),
    ('tienda',      'Línea blanca',    'articulos', 'bi-snow',     2, null),
    ('tienda',      'Electrónica',     'articulos', 'bi-tv',       3, null),
    ('encomiendas', 'Cajas',           'bulto',     'bi-box-seam', 1, null),
    ('encomiendas', 'Bolsas',          'bulto',     'bi-bag',      2, null),
    ('encomiendas', 'Documentos',      'documento', 'bi-envelope', 3, 0.2),
    ('encomiendas', 'Línea blanca',    'articulos', 'bi-snow',     4, null),
    ('encomiendas', 'Electrónica',     'articulos', 'bi-tv',       5, null),
    ('encomiendas', 'Otros artículos', 'articulos', 'bi-box',      6, null)
on conflict do nothing;

-- Pesos promedio de artículos (se cambian en Configuración -> Pedidos ->
-- Artículos frecuentes; python/pesos_promedio.py los ajusta con lo real)
create table if not exists public.articulos_catalogo (
    id            bigint generated always as identity primary key,
    categoria_id  bigint not null references public.categorias_mercaderia(id) on delete cascade,
    nombre        text not null,
    peso_kg       numeric(8,2) not null default 0,
    activo        boolean not null default true,
    orden         smallint not null default 0,

    constraint articulos_catalogo_peso_valido check (peso_kg >= 0),
    constraint articulos_catalogo_unico unique (categoria_id, nombre)
);

-- Los mismos pesos para Línea blanca y Electrónica de ambas actividades
insert into public.articulos_catalogo (categoria_id, nombre, peso_kg, orden)
select c.id, a.nombre, a.peso, a.orden
from public.categorias_mercaderia c
join (values
    ('Línea blanca', 'Refrigeradora',                       70,  1),
    ('Línea blanca', 'Refrigeradora dúplex (side by side)', 110, 2),
    ('Línea blanca', 'Frigobar',                            25,  3),
    ('Línea blanca', 'Congelador',                          55,  4),
    ('Línea blanca', 'Lavadora',                            40,  5),
    ('Línea blanca', 'Secadora',                            35,  6),
    ('Línea blanca', 'Centro de lavado',                    90,  7),
    ('Línea blanca', 'Cocina / estufa',                     45,  8),
    ('Línea blanca', 'Horno de empotrar',                   35,  9),
    ('Línea blanca', 'Campana extractora',                  12, 10),
    ('Línea blanca', 'Microondas',                          13, 11),
    ('Línea blanca', 'Lavaplatos',                          45, 12),
    ('Línea blanca', 'Calentador de agua',                  25, 13),
    ('Línea blanca', 'Aire acondicionado',                  35, 14),
    ('Línea blanca', 'Dispensador / enfriador de agua',     15, 15),
    ('Electrónica',  'Pantalla / TV 32"',                    6,  1),
    ('Electrónica',  'Pantalla / TV 43"',                    9,  2),
    ('Electrónica',  'Pantalla / TV 55"',                   15,  3),
    ('Electrónica',  'Pantalla / TV 65"',                   22,  4),
    ('Electrónica',  'Pantalla / TV 75" o más',             32,  5),
    ('Electrónica',  'Celular',                            0.3,  6),
    ('Electrónica',  'Tablet',                             0.6,  7),
    ('Electrónica',  'Laptop',                             2.5,  8),
    ('Electrónica',  'Computadora de escritorio',            8,  9),
    ('Electrónica',  'Monitor',                              5, 10),
    ('Electrónica',  'Impresora',                            6, 11),
    ('Electrónica',  'Consola de videojuegos',               4, 12),
    ('Electrónica',  'Equipo de sonido',                    10, 13),
    ('Electrónica',  'Barra de sonido',                      4, 14),
    ('Electrónica',  'Bocina / parlante',                    3, 15),
    ('Electrónica',  'Teatro en casa',                      12, 16),
    ('Electrónica',  'Proyector',                            3, 17),
    ('Electrónica',  'Cámara',                               1, 18),
    ('Electrónica',  'Router / módem',                     0.5, 19)
) as a(categoria, nombre, peso, orden)
  on c.nombre = a.categoria
on conflict do nothing;

-- Tamaños de bulto (solo referencia de medidas)
create table if not exists public.tamanos_bulto (
    codigo     text primary key,
    nombre     text not null,
    largo_cm   numeric(6,1),
    ancho_cm   numeric(6,1),
    alto_cm    numeric(6,1),
    orden      smallint not null default 0
);

insert into public.tamanos_bulto (codigo, nombre, largo_cm, ancho_cm, alto_cm, orden) values
    ('S',  'Pequeño',      30, 20, 15, 1),
    ('M',  'Mediano',      40, 30, 30, 2),
    ('L',  'Grande',       60, 40, 40, 3),
    ('XL', 'Extra grande', 80, 60, 60, 4)
on conflict do nothing;

-- Tarifas del envío:
--   cargo_fijo + minimo + max(0, peso_total - kg_incluidos) * precio_kg
--   + max(0, km - km_incluidos) * precio_km   (km por calle de A a B, mapa del pedido)
--   gratis si la compra >= envio_gratis_desde. Prioridad: tienda > región > general.
-- La calculadora de Configuración (python/tarifas.py) usa la misma fórmula.
create table if not exists public.tarifas (
    id                  bigint generated always as identity primary key,
    actividad           text not null references public.actividades(codigo) on delete cascade,
    region              text references public.regiones(codigo) on delete cascade,
    tienda_id           bigint references public.tiendas(id) on delete cascade,
    cargo_fijo          numeric(10,2) not null default 0,
    minimo              numeric(10,2) not null default 0,
    kg_incluidos        numeric(8,2)  not null default 0,
    precio_kg           numeric(10,2) not null default 0,
    precio_km           numeric(10,2) not null default 0,
    km_incluidos        numeric(8,2)  not null default 0,  -- km que cubre el mínimo; los demás se cobran a precio_km
    envio_gratis_desde  numeric(10,2),
    actualizado_en      timestamptz not null default now(),

    constraint tarifas_valores_validos check (
        cargo_fijo >= 0 and minimo >= 0 and kg_incluidos >= 0 and precio_kg >= 0 and precio_km >= 0
        and km_incluidos >= 0
        and (envio_gratis_desde is null or envio_gratis_desde >= 0)),
    constraint tarifas_region_o_tienda check (region is null or tienda_id is null)
);

create unique index if not exists tarifas_alcance_unico
    on public.tarifas (actividad, coalesce(region, ''), coalesce(tienda_id, 0));

-- Tarifas generales de EJEMPLO (una por actividad; se cambian en Configuración)
insert into public.tarifas (actividad, cargo_fijo, minimo, kg_incluidos, precio_kg, envio_gratis_desde) values
    ('encomiendas', 0,    2500, 2, 500, null),  -- mínimo ₡2500 cubre 2 kg; ₡500 por kg adicional
    ('tienda',      1500, 0,    0, 0,   30000)  -- envío ₡1500; gratis desde ₡30000 de compra
on conflict do nothing;

create table if not exists public.descuentos (
    id         bigint generated always as identity primary key,
    nombre     text not null,
    tipo       text not null,
    valor      numeric(10,2) not null,
    actividad  text references public.actividades(codigo) on delete cascade,
    region     text references public.regiones(codigo) on delete cascade,
    activo     boolean not null default true,
    creado_en  timestamptz not null default now(),

    constraint descuentos_tipo_valido check (tipo in ('porcentaje', 'monto')),
    constraint descuentos_valor_valido check (valor > 0 and (tipo <> 'porcentaje' or valor <= 100))
);

create table if not exists public.motivos_retraso (
    id      bigint generated always as identity primary key,
    nombre  text not null unique,
    activo  boolean not null default true,
    orden   smallint not null default 0
);

insert into public.motivos_retraso (nombre, orden) values
    ('Tráfico', 1),
    ('Cliente ausente', 2),
    ('Dirección incorrecta', 3),
    ('Clima', 4),
    ('Falla del vehículo', 5),
    ('Otro', 6)
on conflict do nothing;


-- ==================================================
-- 7. RUTAS
-- ==================================================

create table if not exists public.rutas (
    id          bigint generated always as identity primary key,
    tienda_id   bigint not null references public.tiendas(id) on delete cascade,
    nombre      text not null,
    actividad   text references public.actividades(codigo) on delete set null,
    activa      boolean not null default true,
    orden       smallint not null default 0,
    creado_en   timestamptz not null default now(),

    constraint rutas_nombre_unico unique (tienda_id, nombre)
);

create table if not exists public.rutas_pilotos (
    id           bigint generated always as identity primary key,
    ruta_id      bigint not null references public.rutas(id) on delete cascade,
    piloto_id    bigint not null references public.usuarios(id) on delete cascade,
    fecha_desde  date not null,
    fecha_hasta  date not null,
    creado_por   bigint references public.usuarios(id) on delete set null,
    creado_en    timestamptz not null default now(),

    constraint rutas_pilotos_fechas_validas check (fecha_hasta >= fecha_desde and fecha_hasta - fecha_desde <= 31)
);

create index if not exists rutas_pilotos_fechas_idx on public.rutas_pilotos (ruta_id, fecha_desde, fecha_hasta);


-- ==================================================
-- 8. PEDIDOS
-- Un pedido NUNCA se borra: se cancela o se anula.
-- ==================================================

create table if not exists public.pedidos (
    id                     bigint generated always as identity primary key,
    codigo                 text unique,
    token_qr               uuid not null unique default gen_random_uuid(),
    codigo_respaldo        text,
    codigo_telefono        text,

    actividad              text not null references public.actividades(codigo),
    tienda_id              bigint not null references public.tiendas(id),
    ruta_id                bigint references public.rutas(id) on delete set null,

    cliente_id             bigint references public.clientes(id) on delete set null,
    cliente_nombre         text not null,
    cliente_telefono       text not null,

    direccion_recoleccion  text,
    direccion_entrega      text not null,
    distancia_km           numeric(8,2),

    recibe_tipo            text not null default 'cliente',
    recibe_nombre          text,
    recibe_telefono        text,

    fecha_entrega          date not null default current_date,
    marca_numero           smallint,   -- horario del piloto (solo lo ven el piloto y G2+)
    slot_numero            smallint,   -- slot de despacho (lo elige el empleado; slots_del_dia)
    piloto_id              bigint references public.usuarios(id) on delete set null,

    peso_total_kg          numeric(10,2) not null default 0,
    lleva_alcohol          boolean not null default false,
    detalle                jsonb not null default '{}'::jsonb,

    monto_compra           numeric(10,2),
    cobrar_compra          boolean not null default false,
    costo_envio            numeric(10,2) not null default 0,
    descuento_id           bigint references public.descuentos(id) on delete set null,
    costo_desglose         jsonb not null default '{}'::jsonb,
    total_cobrar           numeric(10,2) not null default 0,
    forma_pago             text not null default 'efectivo',
    paga_con               numeric(10,2),
    vuelto                 numeric(10,2),

    estado                 text not null default 'registrado',
    anulado                boolean not null default false,
    motivo_cancelacion     text,
    notas                  text,

    creado_por             bigint references public.usuarios(id) on delete set null,
    creado_en              timestamptz not null default now(),
    actualizado_en         timestamptz not null default now(),

    -- Hora de cada paso del despacho (las pone el trigger pedidos_tiempos; no se escriben
    -- a mano). Alimentan el calculador interno: vistas pedidos_tiempos y slots_carga.
    alistando_en           timestamptz,
    listo_en               timestamptz,
    recibido_ruta_en       timestamptz,
    cargado_en             timestamptz,
    cargado_por            bigint references public.usuarios(id) on delete set null, -- quién escaneó el QR
    salida_en              timestamptz,
    entregando_en          timestamptz,
    finalizado_en          timestamptz,

    -- Flujo: registrado (o recibido_bodega) -> alistando -> listo_despacho (con slot)
    --   -> recibido_ruta (el piloto lo recibe y muestra el QR) -> cargado (el despachador
    --   escanea el QR) -> en_ruta ("Saliendo a ruta") -> en_entrega (uno a la vez)
    --   -> entregado / entregado_incidencia / no_entregado. asignado = ya tiene piloto.
    constraint pedidos_estado_valido check (estado in (
        'registrado', 'recibido_bodega', 'asignado', 'alistando', 'listo_despacho',
        'recibido_ruta', 'cargado', 'en_ruta', 'en_entrega', 'entregado',
        'entregado_incidencia', 'no_entregado', 'reprogramado', 'devuelto', 'cancelado')),
    constraint pedidos_recibe_valido check (recibe_tipo in ('cliente', 'autorizado')),
    constraint pedidos_pago_valido   check (forma_pago in ('efectivo', 'tarjeta')),
    constraint pedidos_montos_validos check (
        costo_envio >= 0 and total_cobrar >= 0 and peso_total_kg >= 0
        and (monto_compra is null or monto_compra >= 0))
);

create index if not exists pedidos_fecha_idx   on public.pedidos (fecha_entrega);
create index if not exists pedidos_tienda_idx  on public.pedidos (tienda_id, fecha_entrega);
create index if not exists pedidos_cliente_idx on public.pedidos (cliente_id);
create index if not exists pedidos_piloto_idx  on public.pedidos (piloto_id, fecha_entrega);
create index if not exists pedidos_estado_idx  on public.pedidos (estado);
create index if not exists pedidos_slot_idx    on public.pedidos (tienda_id, fecha_entrega, slot_numero);

-- El piloto entrega UN pedido a la vez: solo uno "en_entrega" por piloto
create unique index if not exists pedidos_un_en_entrega on public.pedidos (piloto_id) where estado = 'en_entrega';

-- Artículos / bultos del pedido (peso_kg = peso de CADA uno)
create table if not exists public.pedido_articulos (
    id            bigint generated always as identity primary key,
    pedido_id     bigint not null references public.pedidos(id) on delete cascade,
    categoria_id  bigint references public.categorias_mercaderia(id) on delete set null,
    categoria     text not null,
    descripcion   text,
    cantidad      integer not null default 1,
    tamano        text references public.tamanos_bulto(codigo) on delete set null,
    peso_kg       numeric(10,2) not null default 0,

    constraint articulos_valores_validos check (cantidad > 0 and peso_kg >= 0)
);

create index if not exists pedido_articulos_pedido_idx on public.pedido_articulos (pedido_id);

create table if not exists public.pedido_entregas (
    pedido_id            bigint primary key references public.pedidos(id) on delete cascade,
    piloto_id            bigint references public.usuarios(id) on delete set null,
    entregado_en         timestamptz not null default now(),
    validado_con         text,
    recibio_nombre       text,
    satisfecho           boolean,
    comentario           text,
    mercaderia_buena     boolean,
    hubo_retraso         boolean not null default false,
    motivo_retraso_id    bigint references public.motivos_retraso(id) on delete set null,
    confirma_mayor_edad  boolean,
    ubicacion            text,

    constraint entregas_validado_valido check (validado_con is null or validado_con in ('qr', 'codigo'))
);

create table if not exists public.pedido_evidencias (
    id           bigint generated always as identity primary key,
    pedido_id    bigint not null references public.pedidos(id) on delete cascade,
    tipo         text not null,
    url          text,
    ruta         text,
    tomada_por   bigint references public.usuarios(id) on delete set null,
    creado_en    timestamptz not null default now(),
    eliminada_en timestamptz,

    constraint evidencias_tipo_valido check (tipo in ('entrega', 'mal_estado', 'retraso', 'recepcion'))
);

create index if not exists pedido_evidencias_pedido_idx on public.pedido_evidencias (pedido_id);

create table if not exists public.pedido_historial (
    id               bigint generated always as identity primary key,
    pedido_id        bigint not null references public.pedidos(id) on delete cascade,
    evento           text not null,
    estado_anterior  text,
    estado_nuevo     text,
    detalle          jsonb,
    usuario_id       bigint references public.usuarios(id) on delete set null,
    usuario_nombre   text,
    ubicacion        text,
    creado_en        timestamptz not null default now()
);

create index if not exists pedido_historial_pedido_idx on public.pedido_historial (pedido_id, creado_en);

-- ---------- Número de pedido y código de respaldo al crear ----------
create sequence if not exists public.pedidos_codigo_seq;

create or replace function public.pedidos_antes_de_crear()
returns trigger
language plpgsql
as $$
declare
    modo_numero   text;
    opciones      jsonb;
    digitos       text;
    usa_aleatorio boolean;
    usa_telefono  boolean;
begin
    select valor #>> '{}' into modo_numero from public.configuracion where clave = 'numero_pedido';

    if modo_numero = 'manual' then
        new.codigo := upper(trim(coalesce(new.codigo, '')));
        if new.codigo = '' then
            raise exception 'Falta el número de pedido (la empresa usa números manuales).'
                using errcode = '23502';
        end if;
    else
        new.codigo := 'P-' || lpad(nextval('public.pedidos_codigo_seq')::text, 6, '0');
    end if;

    select valor into opciones from public.configuracion where clave = 'codigo_respaldo';
    if opciones is null then
        opciones := '["aleatorio"]';
    elsif jsonb_typeof(opciones) = 'string' then
        opciones := jsonb_build_array(opciones);
    end if;

    digitos := regexp_replace(coalesce(new.cliente_telefono, ''), '\D', '', 'g');
    usa_aleatorio := opciones ? 'aleatorio';
    usa_telefono  := opciones ? 'telefono' and length(digitos) >= 4;

    new.codigo_telefono := case when usa_telefono then right(digitos, 4) end;

    if usa_aleatorio or not usa_telefono then
        new.codigo_respaldo := lpad(floor(random() * 10000)::int::text, 4, '0');
    else
        new.codigo_respaldo := new.codigo_telefono;
    end if;

    return new;
end;
$$;

drop trigger if exists pedidos_codigo on public.pedidos;
create trigger pedidos_codigo
    before insert on public.pedidos
    for each row execute function public.pedidos_antes_de_crear();

-- Validar un código de respaldo (app del piloto)
create or replace function public.validar_codigo_respaldo(p_pedido bigint, p_codigo text)
returns boolean
language sql
stable
as $$
    select exists (
        select 1 from public.pedidos
        where id = p_pedido
          and trim(p_codigo) in (codigo_respaldo, codigo_telefono)
    );
$$;

-- ---------- Calculador interno: hora de cada paso del despacho ----------
-- Al cambiar el estado se guarda la hora del paso (alistando_en, listo_en...).
-- alistando_en y listo_en guardan la PRIMERA vez; los demás, la última (si se
-- reprograma, cuenta el último intento). No se ve en pantalla: lo usan las
-- vistas pedidos_tiempos y slots_carga para las estadísticas.
create or replace function public.pedidos_marcar_tiempos()
returns trigger
language plpgsql
as $$
begin
    if new.estado is distinct from old.estado then
        case new.estado
            when 'alistando'      then new.alistando_en     := coalesce(old.alistando_en, now());
            when 'listo_despacho' then new.listo_en         := coalesce(old.listo_en, now());
            when 'recibido_ruta'  then new.recibido_ruta_en := now();
            when 'cargado'        then new.cargado_en       := now();
            when 'en_ruta'        then new.salida_en        := now();
            when 'en_entrega'     then new.entregando_en    := now();
            else null;
        end case;
        if new.estado in ('entregado', 'entregado_incidencia', 'no_entregado', 'devuelto', 'cancelado') then
            new.finalizado_en := now();
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists pedidos_tiempos on public.pedidos;
create trigger pedidos_tiempos
    before update of estado on public.pedidos
    for each row execute function public.pedidos_marcar_tiempos();

-- Tiempos de cada pedido en minutos (null = ese paso aún no pasa).
--   min_hasta_listo = desde que se crea el pedido hasta "Listo para despachar"
create or replace view public.pedidos_tiempos
with (security_invoker = true) as
select
    p.id, p.codigo, p.tienda_id, p.actividad, p.fecha_entrega, p.slot_numero, p.piloto_id, p.estado,
    round(extract(epoch from (p.alistando_en  - p.creado_en))    / 60, 1) as min_espera_alistar,
    round(extract(epoch from (p.listo_en      - p.alistando_en)) / 60, 1) as min_alistando,
    round(extract(epoch from (p.listo_en      - p.creado_en))    / 60, 1) as min_hasta_listo,
    round(extract(epoch from (p.cargado_en    - p.listo_en))     / 60, 1) as min_espera_carga,
    round(extract(epoch from (p.salida_en     - p.cargado_en))   / 60, 1) as min_cargado_a_salida,
    round(extract(epoch from (p.finalizado_en - p.salida_en))    / 60, 1) as min_en_ruta,
    round(extract(epoch from (p.finalizado_en - p.entregando_en)) / 60, 1) as min_ultimo_tramo,
    round(extract(epoch from (p.finalizado_en - p.creado_en))    / 60, 1) as min_total
from public.pedidos p
where not p.anulado;

-- Carga de cada slot (tienda + fecha + slot). Cada escaneo del QR guarda su hora
-- (cargado_en); el cronómetro del slot va del PRIMER escaneo hasta que el piloto
-- marca "Saliendo a ruta" (o hasta el último escaneo si aún no sale). Si de 5
-- pedidos salen 3 y los otros se cargan después, min_carga_todos mide del primer
-- al último escaneo y completo dice si ya se cargaron todos.
create or replace view public.slots_carga
with (security_invoker = true) as
select
    p.tienda_id, p.fecha_entrega, p.slot_numero,
    count(*)                                   as pedidos,
    count(p.cargado_en)                        as cargados,
    count(*) = count(p.cargado_en)             as completo,
    min(p.listo_en)                            as primer_listo,
    min(p.cargado_en)                          as primer_escaneo,
    max(p.cargado_en)                          as ultimo_escaneo,
    min(p.salida_en)                           as primera_salida,
    round(extract(epoch from (coalesce(min(p.salida_en), max(p.cargado_en)) - min(p.cargado_en))) / 60, 1) as min_carga,
    round(extract(epoch from (max(p.cargado_en) - min(p.cargado_en))) / 60, 1)                              as min_carga_todos
from public.pedidos p
where p.slot_numero is not null and not p.anulado and p.estado <> 'cancelado'
group by p.tienda_id, p.fecha_entrega, p.slot_numero;


-- ==================================================
-- 9. VEHÍCULO "EN USO" AUTOMÁTICO
-- En uso mientras su piloto tiene pedidos activos; mantenimiento no se toca.
-- ==================================================

create or replace function public.recalcular_estado_vehiculo(p_vehiculo bigint)
returns void
language plpgsql
as $$
begin
    if p_vehiculo is null then
        return;
    end if;

    update public.vehiculos v
       set estado = case
               when exists (
                   select 1
                   from public.pedidos p
                   join public.usuarios u on u.id = p.piloto_id
                   where u.vehiculo_id = v.id
                     and p.anulado = false
                     and p.estado in ('registrado', 'recibido_bodega', 'asignado', 'reprogramado', 'alistando',
                                      'listo_despacho', 'recibido_ruta', 'cargado', 'en_ruta', 'en_entrega')
               ) then 'en_uso'
               else 'disponible'
           end
     where v.id = p_vehiculo
       and v.estado <> 'mantenimiento';
end;
$$;

create or replace function public.pedidos_actualizar_vehiculo()
returns trigger
language plpgsql
as $$
begin
    if new.piloto_id is not null then
        perform public.recalcular_estado_vehiculo((select vehiculo_id from public.usuarios where id = new.piloto_id));
    end if;
    if tg_op = 'UPDATE' and old.piloto_id is not null and old.piloto_id is distinct from new.piloto_id then
        perform public.recalcular_estado_vehiculo((select vehiculo_id from public.usuarios where id = old.piloto_id));
    end if;
    return null;
end;
$$;

drop trigger if exists pedidos_vehiculo_en_uso on public.pedidos;
create trigger pedidos_vehiculo_en_uso
    after insert or update of piloto_id, estado, anulado on public.pedidos
    for each row execute function public.pedidos_actualizar_vehiculo();

create or replace function public.usuarios_actualizar_vehiculo()
returns trigger
language plpgsql
as $$
begin
    if old.vehiculo_id is distinct from new.vehiculo_id then
        perform public.recalcular_estado_vehiculo(old.vehiculo_id);
        perform public.recalcular_estado_vehiculo(new.vehiculo_id);
    end if;
    return null;
end;
$$;

drop trigger if exists usuarios_vehiculo_en_uso on public.usuarios;
create trigger usuarios_vehiculo_en_uso
    after update of vehiculo_id on public.usuarios
    for each row execute function public.usuarios_actualizar_vehiculo();


-- ==================================================
-- 10. ACCESO DESDE LA WEB (TEMPORAL)
-- Quién puede hacer qué lo controla la página. Fase 7: reglas reales.
-- ==================================================

-- Si se vuelve a ejecutar: se quitan las reglas TEMPORALES que ya existan
-- (tablas y fotos) para crearlas de nuevo sin error
do $$
declare
    r record;
begin
    for r in select schemaname, tablename, policyname from pg_policies
             where policyname like 'TEMPORAL - %' and schemaname in ('public', 'storage') loop
        execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    end loop;
end;
$$;

-- Regiones: solo lectura aquí; la sección 12 les da acceso completo (Tiendas -> Regiones)
alter table public.regiones enable row level security;
grant select on public.regiones to anon;
create policy "TEMPORAL - leer regiones" on public.regiones for select to anon using (true);

-- Tablas con acceso completo (leer, crear, modificar, eliminar)
do $$
declare
    t text;
begin
    foreach t in array array[
        'tiendas', 'vehiculos', 'usuarios', 'clientes', 'notificaciones',
        'marcas_horario', 'capacidad_marcas', 'horario_dias', 'marcas_dia',
        'slots_horario', 'slot_dias', 'slots_dia',
        'actividades', 'categorias_mercaderia', 'articulos_catalogo', 'tamanos_bulto',
        'tarifas', 'descuentos', 'motivos_retraso', 'rutas', 'rutas_pilotos',
        'pedido_articulos'
    ] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('grant select, insert, update, delete on public.%I to anon', t);
        execute format('create policy "TEMPORAL - leer %1$s" on public.%1$I for select to anon using (true)', t);
        execute format('create policy "TEMPORAL - crear %1$s" on public.%1$I for insert to anon with check (true)', t);
        execute format('create policy "TEMPORAL - modificar %1$s" on public.%1$I for update to anon using (true) with check (true)', t);
        execute format('create policy "TEMPORAL - eliminar %1$s" on public.%1$I for delete to anon using (true)', t);
    end loop;
end;
$$;

-- Asignaciones (sin modificar: se quitan y se ponen)
alter table public.clientes_tiendas enable row level security;
grant select, insert, delete on public.clientes_tiendas to anon;
create policy "TEMPORAL - leer clientes_tiendas"    on public.clientes_tiendas for select to anon using (true);
create policy "TEMPORAL - asignar clientes_tiendas" on public.clientes_tiendas for insert to anon with check (true);
create policy "TEMPORAL - quitar clientes_tiendas"  on public.clientes_tiendas for delete to anon using (true);

alter table public.tiendas_actividades enable row level security;
grant select, insert, delete on public.tiendas_actividades to anon;
create policy "TEMPORAL - leer tiendas_actividades"    on public.tiendas_actividades for select to anon using (true);
create policy "TEMPORAL - asignar tiendas_actividades" on public.tiendas_actividades for insert to anon with check (true);
create policy "TEMPORAL - quitar tiendas_actividades"  on public.tiendas_actividades for delete to anon using (true);

-- Configuración: leer, crear y modificar
alter table public.configuracion enable row level security;
grant select, insert, update on public.configuracion to anon;
create policy "TEMPORAL - leer configuracion"      on public.configuracion for select to anon using (true);
create policy "TEMPORAL - crear configuracion"     on public.configuracion for insert to anon with check (true);
create policy "TEMPORAL - modificar configuracion" on public.configuracion for update to anon using (true) with check (true);

-- Pedidos, entregas y evidencias: leer, crear y modificar (NUNCA borrar)
do $$
declare
    t text;
begin
    foreach t in array array['pedidos', 'pedido_entregas', 'pedido_evidencias'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('grant select, insert, update on public.%I to anon', t);
        execute format('create policy "TEMPORAL - leer %1$s" on public.%1$I for select to anon using (true)', t);
        execute format('create policy "TEMPORAL - crear %1$s" on public.%1$I for insert to anon with check (true)', t);
        execute format('create policy "TEMPORAL - modificar %1$s" on public.%1$I for update to anon using (true) with check (true)', t);
    end loop;
end;
$$;

-- Historial: solo leer y agregar
alter table public.pedido_historial enable row level security;
grant select, insert on public.pedido_historial to anon;
create policy "TEMPORAL - leer historial"  on public.pedido_historial for select to anon using (true);
create policy "TEMPORAL - crear historial" on public.pedido_historial for insert to anon with check (true);

-- Funciones y secuencia que usa la página
grant usage on sequence public.pedidos_codigo_seq to anon;
grant execute on function public.cambiar_codigo_tienda(bigint, text) to anon;
grant execute on function public.marcas_del_dia(date) to anon;
grant execute on function public.slots_del_dia(date) to anon;

-- Marcas del piloto y QR: se leen, pero se crean SOLO con las funciones (validan QR y hora)
alter table public.marcas_piloto enable row level security;
grant select on public.marcas_piloto to anon;
create policy "TEMPORAL - leer marcas_piloto" on public.marcas_piloto for select to anon using (true);
alter table public.pilotos_dia enable row level security;
grant select on public.pilotos_dia to anon;
create policy "TEMPORAL - leer pilotos_dia" on public.pilotos_dia for select to anon using (true);
alter table public.qr_marcas enable row level security; -- sin acceso directo: solo qr_marca_mes
grant execute on function public.ahora_local() to anon;
grant execute on function public.qr_marca_mes(bigint) to anon;
grant execute on function public.qr_piloto_dia(bigint) to anon;
grant execute on function public.validar_piloto(uuid, bigint) to anon;
grant execute on function public.marcar_por_qr(bigint, text, text) to anon;

-- Calculador interno (solo lectura)
grant select on public.pedidos_tiempos to anon;
grant select on public.slots_carga to anon;
grant execute on function public.validar_codigo_respaldo(bigint, text) to anon;


-- ==================================================
-- 11. ARCHIVOS (Supabase Storage)
-- ==================================================

-- Fotos de usuario: 2 MB, JPG / PNG / WEBP
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict do nothing;

create policy "TEMPORAL - ver avatares"        on storage.objects for select to anon using (bucket_id = 'avatares');
create policy "TEMPORAL - subir avatares"      on storage.objects for insert to anon with check (bucket_id = 'avatares');
create policy "TEMPORAL - reemplazar avatares" on storage.objects for update to anon using (bucket_id = 'avatares') with check (bucket_id = 'avatares');
create policy "TEMPORAL - borrar avatares"     on storage.objects for delete to anon using (bucket_id = 'avatares');

-- Fotos de entregas (evidencias): 5 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict do nothing;

create policy "TEMPORAL - ver evidencias"   on storage.objects for select to anon using (bucket_id = 'evidencias');
create policy "TEMPORAL - subir evidencias" on storage.objects for insert to anon with check (bucket_id = 'evidencias');
create policy "TEMPORAL - borrar evidencias" on storage.objects for delete to anon using (bucket_id = 'evidencias');


-- ==================================================
-- 12. EMPRESAS INTERNAS (sql/01 bloque 16)
--   Varias empresas en la MISMA base. Cada una tiene un ID de 2 números
--   ("01", "02"...), sus actividades (entregas de tienda, encomiendas o las
--   dos) y sus propias regiones, tiendas, usuarios, clientes, rutas,
--   vehículos, pedidos, categorías de mercadería (con sus artículos), tarifas
--   y descuentos. Las crea el Desarrollador (Configuración -> Empresas; lista
--   en Tiendas -> Empresas). Lo que ya existía queda en la empresa "01".
--   - empresa_id se llena solo: la página pone la empresa activa y, en
--     pedidos, rutas, tiendas, usuarios, tarifas y descuentos, la base la
--     corrige según su tienda o región (triggers).
--   - USUARIOS con el ID de su empresa al final, sin guiones:
--       Administrador, G1, G2:    jperez01
--       G3, Empleado, Piloto:     cenjperez01  (región + nombre + empresa; sin la tienda)
--     "admin" y "desar" no cambian. Los usuarios que ya existían se renombran
--     UNA sola vez (cen-001-jperez -> cenjperez01). Al cambiar el ID de una
--     empresa (cambiar_codigo_empresa) o el código de una tienda se renombran solos.
--   - clientes_tiendas.ruta_id: ruta de entrega del cliente en cada tienda.
--   - Lo que no se repite (correo del cliente, nombre de categoría, tarifa por
--     lugar) ahora es dentro de cada empresa. Los códigos de región y de tienda
--     siguen siendo únicos en todo el sistema.
--   Se puede repetir.
-- ==================================================

create table if not exists public.empresas (
    id           bigint generated always as identity primary key,
    codigo       text not null unique,   -- ID de la empresa: "01", "02"... (va al final de sus usuarios)
    nombre       text not null unique,
    actividades  text[] not null default '{tienda,encomiendas}', -- códigos de la tabla actividades
    activa       boolean not null default true,  -- inactiva: sus usuarios no inician sesión
    creado_en    timestamptz not null default now(),

    constraint empresas_codigo_valido      check (codigo ~ '^[0-9]{2}$'),
    constraint empresas_actividades_validas check (cardinality(actividades) > 0)
);

-- La primera empresa: valor por defecto de empresa_id. Si no hay ninguna (ej. después
-- de herramientas/vaciar_base_datos.sql) la crea, así las inserciones no fallan.
create or replace function public.empresa_principal()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
    v_id bigint;
begin
    select id into v_id from public.empresas order by codigo, id limit 1;
    if v_id is null then
        insert into public.empresas (codigo, nombre) values ('01', 'Empresa principal') returning id into v_id;
    end if;
    return v_id;
end;
$$;

select public.empresa_principal();

alter table public.regiones              add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
alter table public.tiendas               add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
alter table public.clientes              add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
alter table public.rutas                 add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
alter table public.vehiculos             add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
alter table public.pedidos               add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
alter table public.categorias_mercaderia add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
alter table public.tarifas               add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
alter table public.descuentos            add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
-- Usuarios: el Desarrollador no es de ninguna empresa (las ve todas)
alter table public.usuarios              add column if not exists empresa_id bigint default public.empresa_principal() references public.empresas(id) on delete restrict;
update public.usuarios set empresa_id = null where rol = 'desarrollador' and empresa_id is not null;
alter table public.usuarios drop constraint if exists usuarios_empresa_segun_rol;
alter table public.usuarios add constraint usuarios_empresa_segun_rol
    check (rol = 'desarrollador' or empresa_id is not null);

-- Ruta de entrega del cliente en cada tienda (un cliente puede ser de varias)
alter table public.clientes_tiendas add column if not exists ruta_id bigint references public.rutas(id) on delete set null;

-- Lo que no se repite, ahora dentro de cada empresa
alter table public.categorias_mercaderia drop constraint if exists categorias_nombre_unico;
alter table public.categorias_mercaderia add constraint categorias_nombre_unico unique (empresa_id, actividad, nombre);
drop index if exists public.clientes_correo_unico;
create unique index if not exists clientes_correo_unico_empresa on public.clientes (empresa_id, lower(correo)) where correo is not null;
drop index if exists public.tarifas_alcance_unico;
create unique index if not exists tarifas_alcance_unico_empresa
    on public.tarifas (empresa_id, actividad, coalesce(region, ''), coalesce(tienda_id, 0));

create index if not exists tiendas_empresa_idx  on public.tiendas (empresa_id);
create index if not exists clientes_empresa_idx on public.clientes (empresa_id);
create index if not exists pedidos_empresa_idx  on public.pedidos (empresa_id, fecha_entrega);
create index if not exists usuarios_empresa_idx on public.usuarios (empresa_id);

-- ---------- empresa_id según la tienda o la región (triggers) ----------

-- Pedidos y rutas: de su tienda
create or replace function public.empresa_de_tienda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.tienda_id is not null then
        select t.empresa_id into new.empresa_id from public.tiendas t where t.id = new.tienda_id;
    end if;
    return new;
end;
$$;

-- Tiendas y descuentos: de su región
create or replace function public.empresa_de_region()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.region is not null then
        select r.empresa_id into new.empresa_id from public.regiones r where r.codigo = new.region;
    end if;
    return new;
end;
$$;

-- Tarifas: de su tienda o de su región (la general queda con la empresa que la crea)
create or replace function public.empresa_de_lugar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.tienda_id is not null then
        select t.empresa_id into new.empresa_id from public.tiendas t where t.id = new.tienda_id;
    elsif new.region is not null then
        select r.empresa_id into new.empresa_id from public.regiones r where r.codigo = new.region;
    end if;
    return new;
end;
$$;

-- Usuarios: de su tienda o de su región (Admin G2). Administrador y G1: la que se elige.
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
    end if;
    return new;
end;
$$;

drop trigger if exists pedidos_empresa on public.pedidos;
create trigger pedidos_empresa before insert or update of tienda_id on public.pedidos
    for each row execute function public.empresa_de_tienda();
drop trigger if exists rutas_empresa on public.rutas;
create trigger rutas_empresa before insert or update of tienda_id on public.rutas
    for each row execute function public.empresa_de_tienda();
drop trigger if exists tiendas_empresa on public.tiendas;
create trigger tiendas_empresa before insert or update of region on public.tiendas
    for each row execute function public.empresa_de_region();
drop trigger if exists descuentos_empresa on public.descuentos;
create trigger descuentos_empresa before insert or update of region on public.descuentos
    for each row execute function public.empresa_de_region();
drop trigger if exists tarifas_empresa on public.tarifas;
create trigger tarifas_empresa before insert or update of tienda_id, region on public.tarifas
    for each row execute function public.empresa_de_lugar();
drop trigger if exists usuarios_empresa on public.usuarios;
create trigger usuarios_empresa before insert or update of tienda_id, region, rol on public.usuarios
    for each row execute function public.empresa_de_usuario();

-- ---------- Usuario con el ID de la empresa ----------
-- Usuario de tienda (G3, Empleado, Piloto): REGIÓN + nombre + ID de la empresa ->
-- "cen" + "jperez" + "01" = "cenjperez01". No lleva el número de la tienda: el usuario
-- ya está ligado a su empresa, su tienda y su región; si cambia de sucursal dentro de
-- la región (o es multisucursal) su usuario NO cambia.
-- Administrador, G1 y G2: nombre + ID -> "jperez01". "admin" y "desar" no cambian.

-- "jperez" a partir del usuario completo, en cualquier formato:
--   cenjperez01 / cen001jperez01 / cen001jperez / cen-001-jperez / jperez01 / jperez
create or replace function public.usuario_base(p_id_usuario text, p_codigo_empresa text, p_codigo_tienda text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
    v_id     text := coalesce(p_id_usuario, '');
    v_tienda text := regexp_replace(lower(coalesce(p_codigo_tienda, '')), '[^a-z0-9]', '', 'g');
    v_region text := lower(left(coalesce(p_codigo_tienda, ''), 3));
    v_emp    text := coalesce(p_codigo_empresa, '');
begin
    if p_codigo_tienda is not null then
        if v_id like lower(p_codigo_tienda) || '-%' then                                   -- cen-001-jperez
            v_id := substr(v_id, length(p_codigo_tienda) + 2);
        elsif v_tienda <> '' and v_id like v_tienda || '%' and length(v_id) > length(v_tienda) then -- cen001jperez
            v_id := substr(v_id, length(v_tienda) + 1);
        elsif v_region <> '' and v_id like v_region || '%' and length(v_id) > length(v_region) then -- cenjperez
            v_id := substr(v_id, length(v_region) + 1);
        end if;
    end if;
    if v_emp <> '' and right(v_id, length(v_emp)) = v_emp and length(v_id) > length(v_emp) then
        v_id := left(v_id, length(v_id) - length(v_emp));
    end if;
    return v_id;
end;
$$;

-- región de la tienda + nombre + ID de la empresa: "cen" + "jperez" + "01"
-- (sin tienda: "jperez" + "01")
create or replace function public.usuario_completo(p_base text, p_codigo_empresa text, p_codigo_tienda text)
returns text
language sql
immutable
set search_path = ''
as $$
    select coalesce(lower(left(p_codigo_tienda, 3)), '') || p_base || coalesce(p_codigo_empresa, '');
$$;

-- Usuario completo que no choque con OTRO usuario: si "cenjperez01" ya existe
-- (ej. otro jperez de otra tienda de la región), prueba "cenjperez201", "cenjperez301"...
create or replace function public.usuario_libre(p_base text, p_codigo_empresa text, p_codigo_tienda text, p_usuario_id bigint)
returns text
language plpgsql
set search_path = ''
as $$
declare
    v_n  integer := 1;
    v_id text := public.usuario_completo(p_base, p_codigo_empresa, p_codigo_tienda);
begin
    while exists (select 1 from public.usuarios where id_usuario = v_id and id <> p_usuario_id) loop
        v_n := v_n + 1;
        v_id := public.usuario_completo(p_base || v_n, p_codigo_empresa, p_codigo_tienda);
    end loop;
    return v_id;
end;
$$;

-- Cambia el ID de una empresa y renombra a sus usuarios (todo o nada)
create or replace function public.cambiar_codigo_empresa(p_empresa_id bigint, p_codigo text)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_viejo text;
    v_nuevo text := btrim(coalesce(p_codigo, ''));
    r       record;
begin
    select codigo into v_viejo from public.empresas where id = p_empresa_id for update;
    if not found then
        raise exception 'La empresa no existe.' using errcode = 'P0002';
    end if;
    if v_viejo = v_nuevo then
        return;
    end if;

    update public.empresas set codigo = v_nuevo where id = p_empresa_id;

    for r in select u.id, u.id_usuario, t.codigo as tienda
               from public.usuarios u
               left join public.tiendas t on t.id = u.tienda_id
              where u.empresa_id = p_empresa_id
                and u.id_usuario not in ('admin', 'desar') loop
        update public.usuarios
           set id_usuario = public.usuario_libre(public.usuario_base(r.id_usuario, v_viejo, r.tienda), v_nuevo, r.tienda, r.id)
         where id = r.id;
    end loop;
end;
$$;

-- Cambiar el código de una tienda. Sus usuarios solo se renombran si la tienda
-- cambia de REGIÓN (cenjperez01 -> norjperez01); con otro número en la misma región, no.
create or replace function public.cambiar_codigo_tienda(p_tienda_id bigint, p_nuevo_codigo text)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_codigo_viejo text;
    v_empresa      text;
    r              record;
begin
    select t.codigo, e.codigo into v_codigo_viejo, v_empresa
      from public.tiendas t
      left join public.empresas e on e.id = t.empresa_id
     where t.id = p_tienda_id
       for update of t;
    if not found then
        raise exception 'La tienda no existe.' using errcode = 'P0002';
    end if;
    if v_codigo_viejo = p_nuevo_codigo then
        return;
    end if;

    update public.tiendas
       set codigo = p_nuevo_codigo, region = left(p_nuevo_codigo, 3)
     where id = p_tienda_id;

    if left(v_codigo_viejo, 3) = left(p_nuevo_codigo, 3) then
        return;
    end if;
    for r in select u.id, u.id_usuario from public.usuarios u
              where u.tienda_id = p_tienda_id and u.id_usuario not in ('admin', 'desar') loop
        update public.usuarios
           set id_usuario = public.usuario_libre(public.usuario_base(r.id_usuario, v_empresa, v_codigo_viejo), v_empresa, p_nuevo_codigo, r.id)
         where id = r.id;
    end loop;
end;
$$;

-- Usuarios que ya existían: se renombran UNA sola vez (marca en configuracion)
--   cen-001-jperez -> cenjperez01 · jlopez -> jlopez01
do $$
declare
    r record;
begin
    if exists (select 1 from public.configuracion where clave = 'usuarios_con_empresa') then
        return;
    end if;
    for r in select u.id, u.id_usuario, t.codigo as tienda, e.codigo as empresa
               from public.usuarios u
               join public.empresas e on e.id = u.empresa_id
               left join public.tiendas t on t.id = u.tienda_id
              where u.id_usuario not in ('admin', 'desar')
              order by u.id loop
        update public.usuarios
           set id_usuario = public.usuario_libre(public.usuario_base(r.id_usuario, null, r.tienda), r.empresa, r.tienda, r.id)
         where id = r.id;
    end loop;
    insert into public.configuracion (clave, valor) values ('usuarios_con_empresa', 'true');
end;
$$;

grant execute on function public.usuario_libre(text, text, text, bigint) to anon;

-- ---------- Acceso desde la web (TEMPORAL, como las demás tablas) ----------
-- Empresas y regiones: leer, crear, modificar y eliminar (las regiones ahora se
-- administran en Tiendas -> Regiones)
do $$
declare
    t text;
begin
    foreach t in array array['empresas', 'regiones'] loop
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
end;
$$;

-- Ruta de entrega del cliente: ahora también se modifica
grant update on public.clientes_tiendas to anon;
drop policy if exists "TEMPORAL - modificar clientes_tiendas" on public.clientes_tiendas;
create policy "TEMPORAL - modificar clientes_tiendas" on public.clientes_tiendas for update to anon using (true) with check (true);

grant execute on function public.cambiar_codigo_empresa(bigint, text) to anon;
grant execute on function public.cambiar_codigo_tienda(bigint, text) to anon;

notify pgrst, 'reload schema';
