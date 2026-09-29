-- ==================================================
-- PEDIDOS (por actividad) + su CONFIGURACIÓN
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez, DESPUÉS de sql/13_horario_dias.sql)
--
-- Diseño completo: PROPUESTA-ESTRUCTURADA-V2.md, sección 31.
-- Un PEDIDO = datos comunes + detalle según la ACTIVIDAD + cierre de entrega.
--
-- Qué hace:
--   CONFIGURACIÓN (se administra en Configuración -> Pedidos)
--     1. actividades            -> Encomiendas, Entregas de tienda... (activa o no)
--     2. tiendas_actividades    -> qué actividades ofrece cada tienda
--                                  (si una tienda no tiene ninguna, ofrece TODAS las activas)
--     3. categorias_mercaderia  -> casillas de "Entregas de tienda": Abarrotes,
--                                  Línea blanca, Electrónica... (tipo conteo o artículos)
--     4. tamanos_bulto          -> S / M / L / XL, SOLO medidas de referencia
--     5. tarifas                -> cobro por actividad: general, por región o por tienda
--                                  (prioridad tienda > región > general)
--     6. descuentos             -> pre-establecidos; máximo 1 por pedido
--     7. motivos_retraso        -> lista para el cierre de entrega
--     8. configuracion.codigo_respaldo -> 'aleatorio' o 'telefono' (4 dígitos)
--   PEDIDOS
--     9.  pedidos               -> datos comunes + detalle (JSON) + desglose del costo
--     10. pedido_articulos      -> bultos / artículos con su peso
--     11. pedido_entregas       -> cierre de entrega (lo llena el piloto en la app)
--     12. pedido_evidencias     -> fotos (bucket "evidencias"; se borran a los 12 meses)
--     13. pedido_historial      -> línea de tiempo de cada pedido
--   14. Código del pedido y código de respaldo automáticos (trigger).
--   15. Bucket "evidencias" y reglas de acceso TEMPORALES.
--
-- REGLA: un pedido NUNCA se borra (no hay permiso de borrar): se cancela o se anula.
--
-- Los valores de tarifas, tamaños y motivos son de EJEMPLO: se cambian
-- desde Configuración -> Pedidos.
-- ==================================================


-- ==================================================
-- CONFIGURACIÓN
-- ==================================================

-- ---------- 1. Actividades ----------
create table public.actividades (
    codigo       text primary key,              -- ej. 'encomiendas', 'tienda'
    nombre       text not null,
    descripcion  text,
    icono        text not null default 'bi-box-seam', -- icono de Bootstrap Icons
    usa_bodega   boolean not null default false, -- true = tiene el estado "Recibido en bodega"
    activa       boolean not null default true,
    orden        smallint not null default 0
);

insert into public.actividades (codigo, nombre, descripcion, icono, usa_bodega, orden) values
    ('encomiendas', 'Encomiendas', 'Recepción de cajas en bodega y entrega con QR.', 'bi-box-seam', true, 1),
    ('tienda', 'Entregas de tienda', 'Abarrotes, línea blanca, electrónica y más.', 'bi-shop', false, 2);


-- ---------- 2. Actividades de cada tienda ----------
create table public.tiendas_actividades (
    tienda_id  bigint not null references public.tiendas(id) on delete cascade,
    actividad  text not null references public.actividades(codigo) on delete cascade,
    primary key (tienda_id, actividad)
);


-- ---------- 3. Categorías de mercadería (casillas) ----------
-- tipo 'conteo'    -> cajas, bolsas, hieleras/"fríos", ¿alcohol?, peso aproximado
-- tipo 'articulos' -> lista de artículos, cada uno con nombre, cantidad y peso
create table public.categorias_mercaderia (
    id         bigint generated always as identity primary key,
    actividad  text not null references public.actividades(codigo) on delete cascade,
    nombre     text not null,
    tipo       text not null default 'articulos',
    icono      text not null default 'bi-box',
    activa     boolean not null default true,
    orden      smallint not null default 0,

    constraint categorias_tipo_valido check (tipo in ('conteo', 'articulos')),
    constraint categorias_nombre_unico unique (actividad, nombre)
);

insert into public.categorias_mercaderia (actividad, nombre, tipo, icono, orden) values
    ('tienda', 'Abarrotes',    'conteo',    'bi-basket',        1),
    ('tienda', 'Línea blanca', 'articulos', 'bi-snow',          2),
    ('tienda', 'Electrónica',  'articulos', 'bi-tv',            3);


-- ---------- 4. Tamaños de bulto (solo referencia) ----------
create table public.tamanos_bulto (
    codigo     text primary key,   -- S, M, L, XL
    nombre     text not null,
    largo_cm   numeric(6,1),
    ancho_cm   numeric(6,1),
    alto_cm    numeric(6,1),
    orden      smallint not null default 0
);

insert into public.tamanos_bulto (codigo, nombre, largo_cm, ancho_cm, alto_cm, orden) values
    ('S',  'Pequeño',     30, 20, 15, 1),
    ('M',  'Mediano',     40, 30, 30, 2),
    ('L',  'Grande',      60, 40, 40, 3),
    ('XL', 'Extra grande', 80, 60, 60, 4);


-- ---------- 5. Tarifas ----------
-- Cobro del ENVÍO:
--   cargo_fijo + minimo + max(0, peso_total - kg_incluidos) * precio_kg + km * precio_km
--   Si el monto de la compra >= envio_gratis_desde -> envío gratis.
--   Luego se resta el descuento (máximo 1).
-- Una fila por actividad y alcance: general (region y tienda vacías),
-- una región o una tienda. Prioridad: tienda > región > general.
create table public.tarifas (
    id                  bigint generated always as identity primary key,
    actividad           text not null references public.actividades(codigo) on delete cascade,
    region              text references public.regiones(codigo) on delete cascade,
    tienda_id           bigint references public.tiendas(id) on delete cascade,
    cargo_fijo          numeric(10,2) not null default 0,
    minimo              numeric(10,2) not null default 0,
    kg_incluidos        numeric(8,2)  not null default 0,  -- peso que cubre el mínimo
    precio_kg           numeric(10,2) not null default 0,  -- por cada kg adicional
    precio_km           numeric(10,2) not null default 0,  -- se usará con Google Maps
    envio_gratis_desde  numeric(10,2),                     -- vacío = nunca gratis
    actualizado_en      timestamptz not null default now(),

    constraint tarifas_valores_validos check (
        cargo_fijo >= 0 and minimo >= 0 and kg_incluidos >= 0 and precio_kg >= 0 and precio_km >= 0
        and (envio_gratis_desde is null or envio_gratis_desde >= 0)),
    constraint tarifas_region_o_tienda check (region is null or tienda_id is null)
);

-- Una sola tarifa por actividad y alcance
create unique index tarifas_alcance_unico
    on public.tarifas (actividad, coalesce(region, ''), coalesce(tienda_id, 0));

-- Tarifas generales de EJEMPLO
insert into public.tarifas (actividad, cargo_fijo, minimo, kg_incluidos, precio_kg, envio_gratis_desde) values
    ('encomiendas', 0,  25, 2, 3, null),   -- mínimo Q25 cubre 2 kg; Q3 por kg adicional
    ('tienda',      15, 0,  0, 0, 300);    -- envío Q15; gratis desde Q300 de compra


-- ---------- 6. Descuentos (pre-establecidos) ----------
create table public.descuentos (
    id         bigint generated always as identity primary key,
    nombre     text not null,
    tipo       text not null,                 -- 'porcentaje' | 'monto'
    valor      numeric(10,2) not null,
    actividad  text references public.actividades(codigo) on delete cascade, -- vacío = todas
    region     text references public.regiones(codigo) on delete cascade,    -- vacío = todas
    activo     boolean not null default true,
    creado_en  timestamptz not null default now(),

    constraint descuentos_tipo_valido check (tipo in ('porcentaje', 'monto')),
    constraint descuentos_valor_valido check (
        valor > 0 and (tipo <> 'porcentaje' or valor <= 100))
);


-- ---------- 7. Motivos de retraso ----------
create table public.motivos_retraso (
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
    ('Otro', 6);


-- ---------- 8. Código de respaldo (4 dígitos) ----------
-- 'aleatorio' = número al azar | 'telefono' = últimos 4 dígitos del teléfono del cliente
insert into public.configuracion (clave, valor) values ('codigo_respaldo', '"aleatorio"');


-- ==================================================
-- PEDIDOS
-- ==================================================

-- ---------- 9. Pedidos ----------
-- Los datos del cliente se COPIAN al pedido (cliente_nombre, cliente_telefono...)
-- para que el historial no cambie si luego se modifica el cliente.
create table public.pedidos (
    id                     bigint generated always as identity primary key,
    codigo                 text unique,                        -- ej. P-000123 (lo pone el trigger)
    token_qr               uuid not null unique default gen_random_uuid(), -- lo que lleva el QR
    codigo_respaldo        text,                               -- 4 dígitos (lo pone el trigger)

    actividad              text not null references public.actividades(codigo),
    tienda_id              bigint not null references public.tiendas(id),

    -- Cliente (copia al momento del pedido)
    cliente_id             bigint references public.clientes(id) on delete set null,
    cliente_nombre         text not null,
    cliente_telefono       text not null,

    -- Direcciones
    direccion_recoleccion  text,
    direccion_entrega      text not null,
    distancia_km           numeric(8,2),                       -- con Google Maps (más adelante)

    -- Quién recibe
    recibe_tipo            text not null default 'cliente',    -- 'cliente' | 'autorizado'
    recibe_nombre          text,
    recibe_telefono        text,

    -- Planificación
    fecha_entrega          date not null default current_date,
    marca_numero           smallint,                           -- marca del horario (1, 2, 3...)
    piloto_id              bigint references public.usuarios(id) on delete set null,

    -- Mercadería
    peso_total_kg          numeric(10,2) not null default 0,
    lleva_alcohol          boolean not null default false,
    detalle                jsonb not null default '{}'::jsonb, -- campos propios de la actividad

    -- Cobro
    monto_compra           numeric(10,2),                      -- entregas de tienda (envío gratis)
    cobrar_compra          boolean not null default false,     -- true = el piloto cobra también la compra
    costo_envio            numeric(10,2) not null default 0,   -- ya con descuento
    descuento_id           bigint references public.descuentos(id) on delete set null,
    costo_desglose         jsonb not null default '{}'::jsonb, -- copia de tarifa y cálculo
    total_cobrar           numeric(10,2) not null default 0,
    forma_pago             text not null default 'efectivo',   -- 'efectivo' | 'tarjeta'
    paga_con               numeric(10,2),                      -- efectivo: con cuánto paga
    vuelto                 numeric(10,2),

    -- Estado
    estado                 text not null default 'registrado',
    anulado                boolean not null default false,     -- registrado por error (solo Admin/G1)
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

-- Índices para listas y reportes rápidos
create index pedidos_fecha_idx   on public.pedidos (fecha_entrega);
create index pedidos_tienda_idx  on public.pedidos (tienda_id, fecha_entrega);
create index pedidos_cliente_idx on public.pedidos (cliente_id);
create index pedidos_piloto_idx  on public.pedidos (piloto_id, fecha_entrega);
create index pedidos_estado_idx  on public.pedidos (estado);


-- ---------- 10. Artículos / bultos del pedido ----------
create table public.pedido_articulos (
    id            bigint generated always as identity primary key,
    pedido_id     bigint not null references public.pedidos(id) on delete cascade,
    categoria_id  bigint references public.categorias_mercaderia(id) on delete set null,
    categoria     text not null,        -- copia del nombre: 'Encomienda', 'Abarrotes', 'Línea blanca'...
    descripcion   text,                 -- 'Caja', 'Bolsa', 'Refrigeradora'...
    cantidad      integer not null default 1,
    tamano        text references public.tamanos_bulto(codigo) on delete set null, -- referencia
    peso_kg       numeric(10,2) not null default 0,

    constraint articulos_valores_validos check (cantidad > 0 and peso_kg >= 0)
);

create index pedido_articulos_pedido_idx on public.pedido_articulos (pedido_id);


-- ---------- 11. Cierre de entrega (app del piloto) ----------
create table public.pedido_entregas (
    pedido_id            bigint primary key references public.pedidos(id) on delete cascade,
    piloto_id            bigint references public.usuarios(id) on delete set null,
    entregado_en         timestamptz not null default now(),
    validado_con         text,                   -- 'qr' | 'codigo'
    recibio_nombre       text,
    satisfecho           boolean,
    comentario           text,
    mercaderia_buena     boolean,                -- false = mal estado (fotos obligatorias)
    hubo_retraso         boolean not null default false,
    motivo_retraso_id    bigint references public.motivos_retraso(id) on delete set null,
    confirma_mayor_edad  boolean,                -- obligatorio si el pedido lleva alcohol
    ubicacion            text,

    constraint entregas_validado_valido check (validado_con is null or validado_con in ('qr', 'codigo'))
);


-- ---------- 12. Evidencias (fotos) ----------
-- La foto vive en el bucket "evidencias"; aquí solo el enlace.
-- A los 12 meses se borra la foto y se llena eliminada_en (el registro queda).
create table public.pedido_evidencias (
    id           bigint generated always as identity primary key,
    pedido_id    bigint not null references public.pedidos(id) on delete cascade,
    tipo         text not null,                  -- 'entrega' | 'mal_estado' | 'retraso' | 'recepcion'
    url          text,
    ruta         text,                           -- ruta dentro del bucket
    tomada_por   bigint references public.usuarios(id) on delete set null,
    creado_en    timestamptz not null default now(),
    eliminada_en timestamptz,

    constraint evidencias_tipo_valido check (tipo in ('entrega', 'mal_estado', 'retraso', 'recepcion'))
);

create index pedido_evidencias_pedido_idx on public.pedido_evidencias (pedido_id);


-- ---------- 13. Historial (línea de tiempo) ----------
create table public.pedido_historial (
    id               bigint generated always as identity primary key,
    pedido_id        bigint not null references public.pedidos(id) on delete cascade,
    evento           text not null,     -- 'registrado', 'estado', 'asignado', 'escaneo', 'correccion', 'cancelado'...
    estado_anterior  text,
    estado_nuevo     text,
    detalle          jsonb,             -- ej. {"campo": "direccion", "antes": "...", "despues": "..."}
    usuario_id       bigint references public.usuarios(id) on delete set null,
    usuario_nombre   text,              -- copia del nombre
    ubicacion        text,
    creado_en        timestamptz not null default now()
);

create index pedido_historial_pedido_idx on public.pedido_historial (pedido_id, creado_en);


-- ---------- 14. Código del pedido y código de respaldo automáticos ----------
create sequence public.pedidos_codigo_seq;

create or replace function public.pedidos_antes_de_crear()
returns trigger
language plpgsql
as $$
declare
    modo    text;
    digitos text;
begin
    -- Código visible: P-000001, P-000002...
    new.codigo := 'P-' || lpad(nextval('public.pedidos_codigo_seq')::text, 6, '0');

    -- Código de respaldo de 4 dígitos (según Configuración)
    select valor #>> '{}' into modo from public.configuracion where clave = 'codigo_respaldo';
    digitos := regexp_replace(coalesce(new.cliente_telefono, ''), '\D', '', 'g');
    if modo = 'telefono' and length(digitos) >= 4 then
        new.codigo_respaldo := right(digitos, 4);
    else
        new.codigo_respaldo := lpad(floor(random() * 10000)::int::text, 4, '0');
    end if;

    return new;
end;
$$;

create trigger pedidos_codigo
    before insert on public.pedidos
    for each row execute function public.pedidos_antes_de_crear();


-- ==================================================
-- 15. ACCESO DESDE LA WEB (TEMPORAL)
-- Quién puede hacer qué lo controla la página (Fase 7: reglas reales).
-- Pedidos, historial y evidencias NO tienen permiso de borrar.
-- ==================================================

-- Configuración de pedidos: leer, crear, modificar y borrar
alter table public.actividades enable row level security;
grant select, insert, update, delete on public.actividades to anon;
create policy "TEMPORAL - leer actividades"      on public.actividades for select to anon using (true);
create policy "TEMPORAL - crear actividades"     on public.actividades for insert to anon with check (true);
create policy "TEMPORAL - modificar actividades" on public.actividades for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar actividades"  on public.actividades for delete to anon using (true);

alter table public.tiendas_actividades enable row level security;
grant select, insert, delete on public.tiendas_actividades to anon;
create policy "TEMPORAL - leer tiendas_actividades"   on public.tiendas_actividades for select to anon using (true);
create policy "TEMPORAL - asignar tiendas_actividades" on public.tiendas_actividades for insert to anon with check (true);
create policy "TEMPORAL - quitar tiendas_actividades"  on public.tiendas_actividades for delete to anon using (true);

alter table public.categorias_mercaderia enable row level security;
grant select, insert, update, delete on public.categorias_mercaderia to anon;
create policy "TEMPORAL - leer categorias"      on public.categorias_mercaderia for select to anon using (true);
create policy "TEMPORAL - crear categorias"     on public.categorias_mercaderia for insert to anon with check (true);
create policy "TEMPORAL - modificar categorias" on public.categorias_mercaderia for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar categorias"  on public.categorias_mercaderia for delete to anon using (true);

alter table public.tamanos_bulto enable row level security;
grant select, insert, update, delete on public.tamanos_bulto to anon;
create policy "TEMPORAL - leer tamanos"      on public.tamanos_bulto for select to anon using (true);
create policy "TEMPORAL - crear tamanos"     on public.tamanos_bulto for insert to anon with check (true);
create policy "TEMPORAL - modificar tamanos" on public.tamanos_bulto for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar tamanos"  on public.tamanos_bulto for delete to anon using (true);

alter table public.tarifas enable row level security;
grant select, insert, update, delete on public.tarifas to anon;
create policy "TEMPORAL - leer tarifas"      on public.tarifas for select to anon using (true);
create policy "TEMPORAL - crear tarifas"     on public.tarifas for insert to anon with check (true);
create policy "TEMPORAL - modificar tarifas" on public.tarifas for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar tarifas"  on public.tarifas for delete to anon using (true);

alter table public.descuentos enable row level security;
grant select, insert, update, delete on public.descuentos to anon;
create policy "TEMPORAL - leer descuentos"      on public.descuentos for select to anon using (true);
create policy "TEMPORAL - crear descuentos"     on public.descuentos for insert to anon with check (true);
create policy "TEMPORAL - modificar descuentos" on public.descuentos for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar descuentos"  on public.descuentos for delete to anon using (true);

alter table public.motivos_retraso enable row level security;
grant select, insert, update, delete on public.motivos_retraso to anon;
create policy "TEMPORAL - leer motivos"      on public.motivos_retraso for select to anon using (true);
create policy "TEMPORAL - crear motivos"     on public.motivos_retraso for insert to anon with check (true);
create policy "TEMPORAL - modificar motivos" on public.motivos_retraso for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar motivos"  on public.motivos_retraso for delete to anon using (true);

-- Pedidos: leer, crear y modificar (NUNCA borrar)
alter table public.pedidos enable row level security;
grant select, insert, update on public.pedidos to anon;
create policy "TEMPORAL - leer pedidos"      on public.pedidos for select to anon using (true);
create policy "TEMPORAL - crear pedidos"     on public.pedidos for insert to anon with check (true);
create policy "TEMPORAL - modificar pedidos" on public.pedidos for update to anon using (true) with check (true);

-- Artículos: se pueden corregir mientras el pedido no se entrega
alter table public.pedido_articulos enable row level security;
grant select, insert, update, delete on public.pedido_articulos to anon;
create policy "TEMPORAL - leer articulos"      on public.pedido_articulos for select to anon using (true);
create policy "TEMPORAL - crear articulos"     on public.pedido_articulos for insert to anon with check (true);
create policy "TEMPORAL - modificar articulos" on public.pedido_articulos for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar articulos"  on public.pedido_articulos for delete to anon using (true);

alter table public.pedido_entregas enable row level security;
grant select, insert, update on public.pedido_entregas to anon;
create policy "TEMPORAL - leer entregas"      on public.pedido_entregas for select to anon using (true);
create policy "TEMPORAL - crear entregas"     on public.pedido_entregas for insert to anon with check (true);
create policy "TEMPORAL - modificar entregas" on public.pedido_entregas for update to anon using (true) with check (true);

-- Evidencias: update solo para marcar eliminada_en (a los 12 meses)
alter table public.pedido_evidencias enable row level security;
grant select, insert, update on public.pedido_evidencias to anon;
create policy "TEMPORAL - leer evidencias"      on public.pedido_evidencias for select to anon using (true);
create policy "TEMPORAL - crear evidencias"     on public.pedido_evidencias for insert to anon with check (true);
create policy "TEMPORAL - modificar evidencias" on public.pedido_evidencias for update to anon using (true) with check (true);

-- Historial: solo leer y agregar (nunca se modifica ni se borra)
alter table public.pedido_historial enable row level security;
grant select, insert on public.pedido_historial to anon;
create policy "TEMPORAL - leer historial" on public.pedido_historial for select to anon using (true);
create policy "TEMPORAL - crear historial" on public.pedido_historial for insert to anon with check (true);

-- La secuencia del código la usa el trigger al crear pedidos
grant usage on sequence public.pedidos_codigo_seq to anon;


-- ---------- Bucket "evidencias" (fotos de entrega, mal estado, retraso) ----------
-- 5 MB por archivo; la app comprime antes de subir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "TEMPORAL - ver evidencias"
    on storage.objects for select to anon using (bucket_id = 'evidencias');
create policy "TEMPORAL - subir evidencias"
    on storage.objects for insert to anon with check (bucket_id = 'evidencias');
create policy "TEMPORAL - borrar evidencias"
    on storage.objects for delete to anon using (bucket_id = 'evidencias');
