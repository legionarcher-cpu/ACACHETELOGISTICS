-- ==================================================
-- 02. ACTIVIDADES Y CATÁLOGOS DE PEDIDOS
-- ACACHETE LOGISTICS
--
--   - actividades: qué hace cada una y qué partes del sistema usa (Configuración ->
--     Actividades). La empresa elige las suyas en empresas.actividades.
--   - categorias_mercaderia y articulos_catalogo: casillas del pedido y pesos promedio
--     (Configuración -> Artículos), por empresa.
--   - tamanos_bulto: medidas de referencia (S, M, L, XL).
--   - tarifas y descuentos del envío, por empresa.
--   - motivos_retraso: por empresa y por actividad (sin actividad = para todas).
-- Los datos de ejemplo están en 12_datos_arranque.sql.
-- Se puede repetir.
-- ==================================================

-- ==================================================
-- ACTIVIDADES
-- ==================================================

create table if not exists public.actividades (
    codigo               text primary key,
    nombre               text not null,
    descripcion          text,
    icono                text not null default 'bi-box-seam',
    activa               boolean not null default true,
    orden                smallint not null default 0,
    -- Pedidos
    usa_bodega           boolean not null default false, -- estado "Recibido en bodega"
    usa_punto_partida    boolean not null default false, -- dirección de recolección del paquete (punto A del pedido)
    usa_compra           boolean not null default false, -- monto de compra, envío gratis, cobrar compra
    usa_tamanos          boolean not null default false, -- tamaño S/M/L/XL en los bultos
    permite_alcohol      boolean not null default false, -- casilla "lleva alcohol"
    -- Qué partes del sistema usa (la página muestra cada parte si ALGUNA actividad de la empresa la usa)
    usa_vehiculos        boolean not null default true,  -- vehículos (Configuración, Usuarios, Pilotos)
    usa_km               boolean not null default true,  -- cobro por km
    usa_peso             boolean not null default true,  -- peso del pedido y tarifas por kg
    usa_productos        boolean not null default false, -- distribuidora (08_distribuidora.sql)
    usa_caja             boolean not null default true,  -- caja de pilotos (07_caja_y_ubicacion.sql)
    usa_viajes           boolean not null default false, -- agenda de viajes (05_transporte.sql)
    usa_recolecciones    boolean not null default false, -- agenda de recolecciones (09_recolecciones.sql)
    -- Cómo llama la actividad al registro y al conductor (vacío = pedido / piloto). Ver js/palabras.js.
    palabra_registro     text, -- ej. 'viaje'
    palabra_registros    text, -- ej. 'viajes'
    palabra_conductor    text, -- ej. 'conductor'
    palabra_conductores  text  -- ej. 'conductores'
);


-- ==================================================
-- MERCADERÍA DEL PEDIDO
-- ==================================================

-- Categorías (casillas del pedido), por empresa y actividad.
--   conteo    -> cajas, bolsas, hieleras y peso aproximado (abarrotes)
--   articulos -> artículos con su peso (del catálogo de pesos promedio)
--   bulto     -> bultos con cantidad, tamaño y peso (cajas, bolsas)
--   documento -> solo cantidad; peso de cada uno = peso_referencia
create table if not exists public.categorias_mercaderia (
    id               bigint generated always as identity primary key,
    empresa_id       bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict,
    actividad        text not null references public.actividades(codigo) on delete cascade,
    nombre           text not null,
    tipo             text not null default 'articulos',
    icono            text not null default 'bi-box',
    peso_referencia  numeric(8,2),
    activa           boolean not null default true,
    orden            smallint not null default 0,

    constraint categorias_tipo_valido  check (tipo in ('conteo', 'articulos', 'bulto', 'documento')),
    constraint categorias_nombre_unico unique (empresa_id, actividad, nombre)
);

-- Pesos promedio de artículos (Configuración -> Artículos; python/pesos_promedio.py los ajusta)
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

-- Tamaños de bulto (solo referencia de medidas; los mismos para todas las empresas)
create table if not exists public.tamanos_bulto (
    codigo     text primary key,
    nombre     text not null,
    largo_cm   numeric(6,1),
    ancho_cm   numeric(6,1),
    alto_cm    numeric(6,1),
    orden      smallint not null default 0
);


-- ==================================================
-- TARIFAS Y DESCUENTOS
-- ==================================================

-- Tarifa del envío:
--   cargo_fijo + minimo + max(0, peso_total - kg_incluidos) * precio_kg
--   + max(0, km - km_incluidos) * precio_km   (km por calle de A a B, mapa del pedido)
--   gratis si la compra >= envio_gratis_desde. Prioridad: tienda > región > general.
-- La calculadora de Configuración (python/tarifas.py) usa la misma fórmula.
create table if not exists public.tarifas (
    id                  bigint generated always as identity primary key,
    empresa_id          bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict,
    actividad           text not null references public.actividades(codigo) on delete cascade,
    region              text references public.regiones(codigo) on delete cascade,
    tienda_id           bigint references public.tiendas(id) on delete cascade,
    cargo_fijo          numeric(10,2) not null default 0,
    minimo              numeric(10,2) not null default 0,
    kg_incluidos        numeric(8,2)  not null default 0,
    precio_kg           numeric(10,2) not null default 0,
    precio_km           numeric(10,2) not null default 0,
    km_incluidos        numeric(8,2)  not null default 0,  -- km que cubre el mínimo
    envio_gratis_desde  numeric(10,2),
    actualizado_en      timestamptz not null default now(),

    constraint tarifas_valores_validos check (
        cargo_fijo >= 0 and minimo >= 0 and kg_incluidos >= 0 and precio_kg >= 0 and precio_km >= 0
        and km_incluidos >= 0 and (envio_gratis_desde is null or envio_gratis_desde >= 0)),
    constraint tarifas_region_o_tienda check (region is null or tienda_id is null)
);
-- Una tarifa por lugar dentro de cada empresa
create unique index if not exists tarifas_alcance_unico_empresa
    on public.tarifas (empresa_id, actividad, coalesce(region, ''), coalesce(tienda_id, 0));

create table if not exists public.descuentos (
    id          bigint generated always as identity primary key,
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict,
    nombre      text not null,
    tipo        text not null,
    valor       numeric(10,2) not null,
    actividad   text references public.actividades(codigo) on delete cascade,
    region      text references public.regiones(codigo) on delete cascade,
    activo      boolean not null default true,
    creado_en   timestamptz not null default now(),

    constraint descuentos_tipo_valido  check (tipo in ('porcentaje', 'monto')),
    constraint descuentos_valor_valido check (valor > 0 and (tipo <> 'porcentaje' or valor <= 100))
);

drop trigger if exists tarifas_empresa on public.tarifas;
create trigger tarifas_empresa before insert or update of tienda_id, region on public.tarifas
    for each row execute function public.empresa_de_lugar();
drop trigger if exists descuentos_empresa on public.descuentos;
create trigger descuentos_empresa before insert or update of region on public.descuentos
    for each row execute function public.empresa_de_region();


-- ==================================================
-- MOTIVOS DE RETRASO (entrega tardía)
-- ==================================================

-- Por empresa y por actividad: actividad vacía = el motivo sirve para todas.
create table if not exists public.motivos_retraso (
    id          bigint generated always as identity primary key,
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    actividad   text references public.actividades(codigo) on delete cascade,
    nombre      text not null,
    activo      boolean not null default true,
    orden       smallint not null default 0
);
create unique index if not exists motivos_retraso_unico
    on public.motivos_retraso (empresa_id, coalesce(actividad, ''), lower(nombre));
