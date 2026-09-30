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
--
-- Queda EN BLANCO: sin tiendas, pilotos, empleados, clientes, vehículos,
-- rutas ni pedidos. Solo trae:
--   - el usuario "desar" (Desarrollador, clave ak7desa) y el usuario "admin"
--     (Administrador, clave admin123: CAMBIARLA al entrar)
--   - las regiones de ejemplo (CAMBIARLAS por las reales antes de ejecutar)
--   - la configuración inicial: actividades, categorías de mercadería,
--     pesos promedio de artículos, tamaños de bulto, tarifas generales de
--     ejemplo, motivos de retraso y 5 horarios de ejemplo.
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

-- ⚠ CAMBIAR por las regiones reales antes de ejecutar (luego se agregan en Supabase)
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
--   administrador, admin_g1     -> sin tienda ni región (usuario simple: admin, jlopez)
--   admin_g2                    -> con región
--   admin_g3, empleado, piloto  -> con tienda (usuario compuesto: nor-001-jperez)
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

create table if not exists public.clientes (
    id                  bigint generated always as identity primary key,
    nombre              text not null,
    apellidos           text not null,
    telefono            text not null,
    direccion           text,
    ubicacion           text,
    aprobado            boolean not null default true,
    cambios_pendientes  jsonb,
    solicitado_por      bigint references public.usuarios(id) on delete set null,
    solicitado_en       timestamptz,
    creado_en           timestamptz not null default now()
);

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
    inicio_desde    time not null,
    inicio_hasta    time not null,
    fin             time not null,
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
    marca_numero           smallint,
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

    constraint pedidos_estado_valido check (estado in (
        'registrado', 'recibido_bodega', 'asignado', 'en_ruta', 'entregado',
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
                     and p.estado in ('registrado', 'recibido_bodega', 'asignado', 'reprogramado', 'en_ruta')
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

-- Regiones: solo lectura (se editan aquí, en Supabase)
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
