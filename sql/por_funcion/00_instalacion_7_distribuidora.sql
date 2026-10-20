-- 7 de 20 · sql/00_instalacion_completa.sql · Partes por actividad y distribuidora (productos, bodega del día, cierres) (secciones 19 a 20).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 19. QUÉ PARTES USA CADA ACTIVIDAD (vehículos, km, peso y productos) (sql/01 bloque 26)
--   Cada actividad dice si usa:
--     usa_vehiculos -> vehículos (Configuración -> Vehículos y Costos, vehículo del
--                      piloto en Usuarios, Pilotos y Mi perfil)
--     usa_km        -> cobro por km (tarifas, simulador, distancia del Cotizador)
--     usa_peso      -> peso (tarifas por kg, peso del pedido, Cotizador)
--     usa_productos -> productos de la distribuidora (Productos, Bodega del día,
--                      carga, entrega por producto, venta en ruta; bloque siguiente)
--   La página muestra cada parte si ALGUNA actividad de la empresa la usa
--   (empresas/empresas.js: empresaUsa). Se cambian en Configuración -> Actividades.
--   Las que ya existían quedan como antes (vehículos, km y peso: sí).
--   Masajes: la usaba una empresa y no estaba en la tabla (sin vehículos, km ni peso).
--   Distribución: actividad nueva con productos.
--   Se puede repetir.
-- ==================================================

alter table public.actividades
    add column if not exists usa_vehiculos boolean not null default true,
    add column if not exists usa_km        boolean not null default true,
    add column if not exists usa_peso      boolean not null default true,
    add column if not exists usa_productos boolean not null default false;

insert into public.actividades (codigo, nombre, descripcion, icono, orden, usa_vehiculos, usa_km, usa_peso, usa_productos) values
    ('masajes', 'Masajes', 'Servicios a domicilio: sin vehículos, cobro por km ni peso.', 'bi-heart-pulse', 5, false, false, false, false),
    ('distribucion', 'Distribución', 'Distribuidora: productos con presentación y precio, bodega del día por ruta, carga de pilotos, entrega, venta en ruta y devolución.',
     'bi-boxes', 6, true, false, false, true)
on conflict do nothing;

notify pgrst, 'reload schema';



-- ==================================================
-- 20. DISTRIBUIDORA (actividades con usa_productos) (sql/01 bloque 27)
--   Lo crea TODO la empresa (no trae catálogo):
--     productos                -> artículo (ej. "Leche entera"), con código y categoría opcionales
--     producto_presentaciones  -> cómo se vende (ej. "Caja 12 x 1 L") y cuántas unidades trae
--     listas_precios           -> listas (ej. General, Zona Norte, Mayorista); una puede ser la general
--     precios                  -> precio SIN IVA de cada presentación en cada lista + % de IVA
--                                 (13 por defecto, se cambia al fijar el precio)
--     tiendas.lista_precios_id -> lista que usa la tienda (si no tiene, la general)
--     motivos_entrega_parcial  -> por qué el cliente recibió menos (los crea la empresa)
--   Operación del día (todo con funciones de la base, todo o nada):
--     bodegas_dia        -> bodega de UNA ruta en UNA fecha. La abre un G3 o superior
--                           (dist_bodega_abrir), la llena (ingreso) y reparte la carga entre
--                           los pilotos de la ruta (carga). Se puede pasar producto de un
--                           piloto a otro (traspaso).
--     bodega_movimientos -> ingreso, carga, devolución (buena o dañada), traspaso, ajuste y
--                           salida (al cerrar). Guardan el precio de ese momento.
--     pedido_productos   -> líneas del pedido (preventa) o de la venta en ruta (autoventa):
--                           cantidad pedida, entregada y motivo si se entregó menos.
--     cierres_mercaderia -> cuadre de cada piloto: cargado = entregado + vendido + devuelto
--                           + faltante, en unidades y en dinero (con IVA).
--     Cerrar la bodega devuelve lo que quedó (salida): queda en 0 y se guarda el resumen.
--   Funciones: dist_bodega_abrir, dist_movimiento, dist_entregar, dist_venta_ruta,
--   dist_cerrar_piloto, dist_cerrar_bodega (+ dist_bodega_saldo y dist_piloto_resumen
--   para leer). Sección Distribución (js/secciones/distribucion.js). Plan: "distribucion".
--   Se puede repetir.
-- ==================================================

-- ---------- Productos, presentaciones y precios (los crea la empresa) ----------
create table if not exists public.productos (
    id          bigint generated always as identity primary key,
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    codigo      text,
    nombre      text not null,
    categoria   text,
    activo      boolean not null default true,
    creado_en   timestamptz not null default now(),

    constraint productos_nombre_unico unique (empresa_id, nombre)
);

create table if not exists public.producto_presentaciones (
    id             bigint generated always as identity primary key,
    empresa_id     bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    producto_id    bigint not null references public.productos(id) on delete cascade,
    nombre         text not null,                    -- ej. "Caja 12 x 1 L"
    unidades       numeric(10,2) not null default 1, -- unidades que trae
    codigo_barras  text,
    activa         boolean not null default true,
    orden          smallint not null default 0,

    constraint presentaciones_unidades_validas check (unidades > 0),
    constraint presentaciones_nombre_unico unique (producto_id, nombre)
);
create index if not exists presentaciones_producto_idx on public.producto_presentaciones (producto_id);

create table if not exists public.listas_precios (
    id          bigint generated always as identity primary key,
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    nombre      text not null,
    general     boolean not null default false,  -- la de las tiendas que no eligieron otra
    activa      boolean not null default true,
    creado_en   timestamptz not null default now(),

    constraint listas_precios_nombre_unico unique (empresa_id, nombre)
);
create unique index if not exists listas_precios_una_general on public.listas_precios (empresa_id) where general;

create table if not exists public.precios (
    id               bigint generated always as identity primary key,
    empresa_id       bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    lista_id         bigint not null references public.listas_precios(id) on delete cascade,
    presentacion_id  bigint not null references public.producto_presentaciones(id) on delete cascade,
    precio           numeric(12,2) not null default 0,  -- SIN IVA
    iva_pct          numeric(5,2) not null default 13,  -- % de IVA (13 en Costa Rica; se cambia por precio)
    actualizado_en   timestamptz not null default now(),
    actualizado_por  bigint,                            -- sin llave: queda aunque se borre el usuario

    constraint precios_validos check (precio >= 0 and iva_pct >= 0 and iva_pct <= 100),
    constraint precios_unico unique (lista_id, presentacion_id)
);

alter table public.tiendas add column if not exists lista_precios_id bigint references public.listas_precios(id) on delete set null;

create table if not exists public.motivos_entrega_parcial (
    id          bigint generated always as identity primary key,
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    nombre      text not null,
    activo      boolean not null default true,
    orden       smallint not null default 0,

    constraint motivos_parcial_nombre_unico unique (empresa_id, nombre)
);

-- ---------- Bodega del día de cada ruta ----------
create table if not exists public.bodegas_dia (
    id                  bigint generated always as identity primary key,
    empresa_id          bigint not null references public.empresas(id) on delete cascade,
    ruta_id             bigint not null references public.rutas(id) on delete restrict,
    tienda_id           bigint not null references public.tiendas(id) on delete restrict,
    fecha               date not null,
    lista_id            bigint references public.listas_precios(id) on delete set null, -- precios con que se valora
    estado              text not null default 'abierta',
    abierta_por         bigint,
    abierta_por_nombre  text,
    abierta_en          timestamptz not null default now(),
    cerrada_por         bigint,
    cerrada_por_nombre  text,
    cerrada_en          timestamptz,
    notas               text,
    resumen             jsonb not null default '{}'::jsonb, -- lo que hubo, se cargó, vendió y devolvió (al cerrar)

    constraint bodegas_dia_estado_valido check (estado in ('abierta', 'cerrada')),
    constraint bodegas_dia_unica unique (ruta_id, fecha)
);
create index if not exists bodegas_dia_empresa_idx on public.bodegas_dia (empresa_id, fecha);

create table if not exists public.bodega_movimientos (
    id                 bigint generated always as identity primary key,
    empresa_id         bigint not null references public.empresas(id) on delete cascade,
    bodega_id          bigint not null references public.bodegas_dia(id) on delete cascade,
    presentacion_id    bigint not null references public.producto_presentaciones(id) on delete restrict,
    tipo               text not null,
    piloto_id          bigint references public.usuarios(id) on delete set null, -- carga, devolución; traspaso: el que entrega
    piloto_destino_id  bigint references public.usuarios(id) on delete set null, -- traspaso: el que recibe
    cantidad           numeric(12,2) not null,  -- positiva (ajuste: + o -)
    estado_producto    text,                    -- devolución: bueno | danado
    precio             numeric(12,2) not null default 0, -- sin IVA, de la lista de la bodega en ese momento
    iva_pct            numeric(5,2) not null default 0,
    nota               text,
    usuario_id         bigint,
    usuario_nombre     text,
    creado_en          timestamptz not null default now(),

    constraint movimientos_tipo_valido check (tipo in ('ingreso', 'carga', 'devolucion', 'traspaso', 'ajuste', 'salida')),
    constraint movimientos_cantidad_valida check (cantidad <> 0 and (tipo = 'ajuste' or cantidad > 0)),
    constraint movimientos_estado_valido check (estado_producto is null or estado_producto in ('bueno', 'danado'))
);
create index if not exists movimientos_bodega_idx on public.bodega_movimientos (bodega_id, piloto_id);

-- ---------- Productos del pedido (preventa) o de la venta en ruta ----------
create table if not exists public.pedido_productos (
    id                  bigint generated always as identity primary key,
    pedido_id           bigint not null references public.pedidos(id) on delete cascade,
    presentacion_id     bigint not null references public.producto_presentaciones(id) on delete restrict,
    descripcion         text not null,          -- producto + presentación al momento
    cantidad            numeric(12,2) not null, -- pedida
    cantidad_entregada  numeric(12,2),          -- la pone el piloto al entregar
    motivo              text,                   -- si entregó menos
    precio              numeric(12,2) not null default 0, -- sin IVA, de la lista del pedido
    iva_pct             numeric(5,2) not null default 0,
    bodega_id           bigint references public.bodegas_dia(id) on delete set null, -- de qué bodega salió

    constraint pedido_productos_validos check (cantidad > 0 and precio >= 0 and iva_pct >= 0
        and (cantidad_entregada is null or (cantidad_entregada >= 0 and cantidad_entregada <= cantidad)))
);
create index if not exists pedido_productos_pedido_idx on public.pedido_productos (pedido_id);
create index if not exists pedido_productos_bodega_idx on public.pedido_productos (bodega_id);

create sequence if not exists public.dist_ventas_seq;

-- ---------- Cierre de mercadería de cada piloto ----------
create table if not exists public.cierres_mercaderia (
    id                    bigint generated always as identity primary key,
    empresa_id            bigint not null references public.empresas(id) on delete cascade,
    bodega_id             bigint not null references public.bodegas_dia(id) on delete cascade,
    ruta_id               bigint,
    tienda_id             bigint,
    fecha                 date not null,
    piloto_id             bigint references public.usuarios(id) on delete set null,
    piloto_nombre         text not null,
    lineas                jsonb not null default '[]'::jsonb, -- una por presentación
    unidades_cargadas     numeric(12,2) not null default 0,   -- carga + traspasos recibidos - enviados
    unidades_entregadas   numeric(12,2) not null default 0,
    unidades_vendidas     numeric(12,2) not null default 0,
    unidades_devueltas    numeric(12,2) not null default 0,
    unidades_faltantes    numeric(12,2) not null default 0,
    valor_cargado         numeric(14,2) not null default 0,   -- con IVA, precios de la bodega
    valor_entregado       numeric(14,2) not null default 0,   -- con IVA, precios del pedido
    valor_vendido         numeric(14,2) not null default 0,
    valor_devuelto        numeric(14,2) not null default 0,
    valor_faltante        numeric(14,2) not null default 0,
    cobrado               numeric(14,2) not null default 0,   -- total a cobrar de sus pedidos y ventas
    notas                 text,
    cerrado_por           bigint,
    cerrado_por_nombre    text,
    cerrado_en            timestamptz not null default now(),

    constraint cierres_mercaderia_unico unique (bodega_id, piloto_id)
);
create index if not exists cierres_mercaderia_empresa_idx on public.cierres_mercaderia (empresa_id, fecha);

-- ---------- Ayudas ----------
-- ¿El usuario administra esa tienda? (G3 o superior en su alcance)
create or replace function public.dist_puede_tienda(u public.usuarios, p_tienda bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select case
        when u.rol = 'desarrollador' then true
        when u.rol in ('administrador', 'admin_g1') then exists (select 1 from public.tiendas t where t.id = p_tienda and t.empresa_id = u.empresa_id)
        when u.rol = 'admin_g2' then exists (select 1 from public.tiendas t where t.id = p_tienda and t.empresa_id = u.empresa_id and t.region = u.region)
        when u.rol = 'admin_g3' then u.tienda_id = p_tienda
        else false
    end;
$$;

-- Precio de una presentación en una lista (si no está, el de la lista general; si no, 0)
create or replace function public.dist_precio(p_lista bigint, p_presentacion bigint, out precio numeric, out iva_pct numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    select pr.precio, pr.iva_pct into precio, iva_pct
      from public.precios pr where pr.lista_id = p_lista and pr.presentacion_id = p_presentacion;
    if not found then
        select pr.precio, pr.iva_pct into precio, iva_pct
          from public.precios pr
          join public.listas_precios l on l.id = pr.lista_id and l.general
         where pr.presentacion_id = p_presentacion
         limit 1;
    end if;
    precio := coalesce(precio, 0);
    iva_pct := coalesce(iva_pct, 0);
end;
$$;

-- "Leche entera · Caja 12 x 1 L"
create or replace function public.dist_descripcion(p_presentacion bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select p.nombre || ' · ' || pp.nombre
      from public.producto_presentaciones pp join public.productos p on p.id = pp.producto_id
     where pp.id = p_presentacion;
$$;

-- Lo que hay en la bodega de cada presentación
create or replace function public.dist_bodega_saldo(p_bodega bigint)
returns table (presentacion_id bigint, ingresado numeric, cargado numeric, devuelto_bueno numeric,
               devuelto_danado numeric, ajustes numeric, salida numeric, en_bodega numeric)
language sql
stable
security definer
set search_path = ''
as $$
    select m.presentacion_id,
           coalesce(sum(m.cantidad) filter (where m.tipo = 'ingreso'), 0),
           coalesce(sum(m.cantidad) filter (where m.tipo = 'carga'), 0),
           coalesce(sum(m.cantidad) filter (where m.tipo = 'devolucion' and m.estado_producto = 'bueno'), 0),
           coalesce(sum(m.cantidad) filter (where m.tipo = 'devolucion' and m.estado_producto = 'danado'), 0),
           coalesce(sum(m.cantidad) filter (where m.tipo = 'ajuste'), 0),
           coalesce(sum(m.cantidad) filter (where m.tipo = 'salida'), 0),
           coalesce(sum(case m.tipo when 'ingreso' then m.cantidad when 'carga' then -m.cantidad
                                    when 'devolucion' then m.cantidad when 'ajuste' then m.cantidad
                                    when 'salida' then -m.cantidad else 0 end), 0)
      from public.bodega_movimientos m
     where m.bodega_id = p_bodega
     group by m.presentacion_id;
$$;

-- Lo que lleva un piloto de una bodega: cargado (+ recibido - enviado), devuelto, entregado
-- (preventa), vendido (venta en ruta) y lo que le queda en mano. valor_unidad: con IVA, con
-- los precios con que se le cargó (si no, los de la lista de la bodega).
create or replace function public.dist_piloto_resumen(p_bodega bigint, p_piloto bigint)
returns table (presentacion_id bigint, cargado numeric, recibido numeric, enviado numeric,
               devuelto_bueno numeric, devuelto_danado numeric, entregado numeric, vendido numeric,
               en_mano numeric, valor_unidad numeric, valor_entregado numeric, valor_vendido numeric)
language sql
stable
security definer
set search_path = ''
as $$
    with mov as (
        select m.presentacion_id,
               coalesce(sum(m.cantidad) filter (where m.tipo = 'carga' and m.piloto_id = p_piloto), 0) as cargado,
               coalesce(sum(m.cantidad) filter (where m.tipo = 'traspaso' and m.piloto_destino_id = p_piloto), 0) as recibido,
               coalesce(sum(m.cantidad) filter (where m.tipo = 'traspaso' and m.piloto_id = p_piloto), 0) as enviado,
               coalesce(sum(m.cantidad) filter (where m.tipo = 'devolucion' and m.piloto_id = p_piloto and m.estado_producto = 'bueno'), 0) as dev_b,
               coalesce(sum(m.cantidad) filter (where m.tipo = 'devolucion' and m.piloto_id = p_piloto and m.estado_producto = 'danado'), 0) as dev_d,
               sum(m.cantidad * m.precio * (1 + m.iva_pct / 100)) filter (where m.tipo = 'carga')
                   / nullif(sum(m.cantidad) filter (where m.tipo = 'carga'), 0) as valor_unidad
          from public.bodega_movimientos m
         where m.bodega_id = p_bodega and (m.piloto_id = p_piloto or m.piloto_destino_id = p_piloto)
         group by m.presentacion_id
    ), ven as (
        select pp.presentacion_id,
               coalesce(sum(pp.cantidad_entregada) filter (where not coalesce((pe.detalle ->> 'venta_ruta')::boolean, false)), 0) as entregado,
               coalesce(sum(pp.cantidad_entregada) filter (where coalesce((pe.detalle ->> 'venta_ruta')::boolean, false)), 0) as vendido,
               coalesce(sum(round(pp.cantidad_entregada * pp.precio * (1 + pp.iva_pct / 100), 2))
                   filter (where not coalesce((pe.detalle ->> 'venta_ruta')::boolean, false)), 0) as valor_entregado,
               coalesce(sum(round(pp.cantidad_entregada * pp.precio * (1 + pp.iva_pct / 100), 2))
                   filter (where coalesce((pe.detalle ->> 'venta_ruta')::boolean, false)), 0) as valor_vendido
          from public.pedido_productos pp
          join public.pedidos pe on pe.id = pp.pedido_id
         where pp.bodega_id = p_bodega and pe.piloto_id = p_piloto and not pe.anulado and coalesce(pp.cantidad_entregada, 0) > 0
         group by pp.presentacion_id
    ), ids as (
        select mov.presentacion_id from mov union select ven.presentacion_id from ven
    )
    select i.presentacion_id,
           coalesce(mov.cargado, 0), coalesce(mov.recibido, 0), coalesce(mov.enviado, 0),
           coalesce(mov.dev_b, 0), coalesce(mov.dev_d, 0), coalesce(ven.entregado, 0), coalesce(ven.vendido, 0),
           coalesce(mov.cargado, 0) + coalesce(mov.recibido, 0) - coalesce(mov.enviado, 0) - coalesce(mov.dev_b, 0)
               - coalesce(mov.dev_d, 0) - coalesce(ven.entregado, 0) - coalesce(ven.vendido, 0),
           round(coalesce(mov.valor_unidad, (select d.precio * (1 + d.iva_pct / 100)
                                               from public.bodegas_dia b, public.dist_precio(b.lista_id, i.presentacion_id) d
                                              where b.id = p_bodega)), 2),
           coalesce(ven.valor_entregado, 0), coalesce(ven.valor_vendido, 0)
      from ids i
      left join mov on mov.presentacion_id = i.presentacion_id
      left join ven on ven.presentacion_id = i.presentacion_id;
$$;

-- Bodega abierta de la que sale lo que entrega o vende un piloto: la de su carga (sin cerrar),
-- primero la de la ruta indicada y la más reciente
create or replace function public.dist_bodega_del_piloto(p_piloto bigint, p_ruta bigint default null)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
    select b.id
      from public.bodegas_dia b
     where b.estado = 'abierta'
       and exists (select 1 from public.bodega_movimientos m where m.bodega_id = b.id
                     and ((m.tipo = 'carga' and m.piloto_id = p_piloto) or (m.tipo = 'traspaso' and m.piloto_destino_id = p_piloto)))
       and not exists (select 1 from public.cierres_mercaderia c where c.bodega_id = b.id and c.piloto_id = p_piloto)
     order by (b.ruta_id = p_ruta) desc nulls last, b.fecha desc, b.id desc
     limit 1;
$$;

-- ---------- Abrir la bodega del día de una ruta ----------
-- p = { usuario_id, ruta_id, fecha, lista_id }. Si ya existe, la devuelve.
create or replace function public.dist_bodega_abrir(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u        public.usuarios;
    r        public.rutas;
    t        public.tiendas;
    v_fecha  date := coalesce((p ->> 'fecha')::date, (now() at time zone 'America/Costa_Rica')::date);
    v_lista  bigint := (p ->> 'lista_id')::bigint;
    v_id     bigint;
begin
    u := public.viaje_usuario((p ->> 'usuario_id')::bigint);
    select * into r from public.rutas where id = (p ->> 'ruta_id')::bigint;
    if not found then
        raise exception 'Esa ruta no existe.' using errcode = 'P0001';
    end if;
    select * into t from public.tiendas where id = r.tienda_id;
    if not public.dist_puede_tienda(u, r.tienda_id) then
        raise exception 'Solo un Admin G3 o superior de la tienda puede abrir su bodega del día.' using errcode = 'P0001';
    end if;
    if v_lista is not null and not exists (select 1 from public.listas_precios l where l.id = v_lista and l.empresa_id = t.empresa_id) then
        raise exception 'Esa lista de precios no es de la empresa.' using errcode = 'P0001';
    end if;
    v_lista := coalesce(v_lista, t.lista_precios_id,
                        (select l.id from public.listas_precios l where l.empresa_id = t.empresa_id and l.general limit 1));

    insert into public.bodegas_dia (empresa_id, ruta_id, tienda_id, fecha, lista_id, abierta_por, abierta_por_nombre)
    values (t.empresa_id, r.id, r.tienda_id, v_fecha, v_lista, u.id, u.nombre)
    on conflict (ruta_id, fecha) do nothing
    returning id into v_id;
    if v_id is null then
        select id into v_id from public.bodegas_dia where ruta_id = r.id and fecha = v_fecha;
    end if;
    return (select to_jsonb(b) from public.bodegas_dia b where b.id = v_id);
end;
$$;

-- ---------- Movimientos: ingreso, carga, devolución, traspaso, ajuste ----------
-- p = { usuario_id, bodega_id, tipo, piloto_id, piloto_destino_id, nota,
--       lineas: [{ presentacion_id, cantidad, estado (devolución: bueno | danado) }] }
-- Todo o nada: si una línea deja la bodega o al piloto en negativo, no se guarda nada.
create or replace function public.dist_movimiento(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u         public.usuarios;
    b         public.bodegas_dia;
    v_tipo    text := p ->> 'tipo';
    v_piloto  bigint := (p ->> 'piloto_id')::bigint;
    v_destino bigint := (p ->> 'piloto_destino_id')::bigint;
    v_nota    text := nullif(btrim(coalesce(p ->> 'nota', '')), '');
    l         record;
    v_precio  record;
    v_n       integer := 0;
    v_mal     text;
begin
    u := public.viaje_usuario((p ->> 'usuario_id')::bigint);
    select * into b from public.bodegas_dia where id = (p ->> 'bodega_id')::bigint;
    if not found then
        raise exception 'Esa bodega no existe.' using errcode = 'P0001';
    end if;
    if not public.dist_puede_tienda(u, b.tienda_id) then
        raise exception 'Solo un Admin G3 o superior de la tienda mueve la bodega.' using errcode = 'P0001';
    end if;
    if b.estado <> 'abierta' then
        raise exception 'La bodega de ese día ya está cerrada.' using errcode = 'P0001';
    end if;
    if v_tipo is null or v_tipo not in ('ingreso', 'carga', 'devolucion', 'traspaso', 'ajuste') then
        raise exception 'Movimiento no válido.' using errcode = 'P0001';
    end if;
    if v_tipo = 'ajuste' and v_nota is null then
        raise exception 'Escribe por qué se ajusta la bodega.' using errcode = 'P0001';
    end if;
    if v_tipo in ('carga', 'devolucion', 'traspaso') then
        if not exists (select 1 from public.usuarios x where x.id = v_piloto and x.rol = 'piloto' and x.empresa_id = b.empresa_id) then
            raise exception 'Elige el piloto.' using errcode = 'P0001';
        end if;
        if exists (select 1 from public.cierres_mercaderia c where c.bodega_id = b.id and c.piloto_id = v_piloto) then
            raise exception 'Ese piloto ya cerró su mercadería de esta bodega.' using errcode = 'P0001';
        end if;
    else
        v_piloto := null;
    end if;
    if v_tipo = 'traspaso' then
        if v_destino is null or v_destino = v_piloto
           or not exists (select 1 from public.usuarios x where x.id = v_destino and x.rol = 'piloto' and x.empresa_id = b.empresa_id) then
            raise exception 'Elige el piloto que recibe (otro distinto).' using errcode = 'P0001';
        end if;
        if exists (select 1 from public.cierres_mercaderia c where c.bodega_id = b.id and c.piloto_id = v_destino) then
            raise exception 'El piloto que recibe ya cerró su mercadería de esta bodega.' using errcode = 'P0001';
        end if;
    else
        v_destino := null;
    end if;
    if jsonb_array_length(coalesce(p -> 'lineas', '[]'::jsonb)) = 0 then
        raise exception 'Agrega al menos un producto.' using errcode = 'P0001';
    end if;

    -- Un movimiento a la vez por bodega
    perform pg_advisory_xact_lock(7304, b.id::integer);

    for l in select * from jsonb_to_recordset(p -> 'lineas') as x(presentacion_id bigint, cantidad numeric, estado text) loop
        if not exists (select 1 from public.producto_presentaciones pp where pp.id = l.presentacion_id and pp.empresa_id = b.empresa_id) then
            raise exception 'Un producto no es de la empresa.' using errcode = 'P0001';
        end if;
        if l.cantidad is null or l.cantidad = 0 or (v_tipo <> 'ajuste' and l.cantidad < 0) then
            raise exception 'Revisa las cantidades (mayores que 0).' using errcode = 'P0001';
        end if;
        select * into v_precio from public.dist_precio(b.lista_id, l.presentacion_id);
        insert into public.bodega_movimientos (empresa_id, bodega_id, presentacion_id, tipo, piloto_id, piloto_destino_id,
            cantidad, estado_producto, precio, iva_pct, nota, usuario_id, usuario_nombre)
        values (b.empresa_id, b.id, l.presentacion_id, v_tipo, v_piloto, v_destino, round(l.cantidad, 2),
            case when v_tipo = 'devolucion' then (case when l.estado = 'danado' then 'danado' else 'bueno' end) end,
            v_precio.precio, v_precio.iva_pct, v_nota, u.id, u.nombre);
        v_n := v_n + 1;
    end loop;

    -- Nada puede quedar en negativo
    select public.dist_descripcion(s.presentacion_id) into v_mal
      from public.dist_bodega_saldo(b.id) s where s.en_bodega < 0 limit 1;
    if v_mal is not null then
        raise exception 'No hay suficiente en la bodega: %.', v_mal using errcode = 'P0001';
    end if;
    if v_piloto is not null then
        select public.dist_descripcion(s.presentacion_id) into v_mal
          from public.dist_piloto_resumen(b.id, v_piloto) s where s.en_mano < 0 limit 1;
        if v_mal is not null then
            raise exception 'El piloto no tiene tanto en mano: %.', v_mal using errcode = 'P0001';
        end if;
    end if;
    return jsonb_build_object('movimientos', v_n);
end;
$$;

-- ---------- Entregar un pedido con productos (preventa) ----------
-- p = { usuario_id, pedido_id, cobro_forma, nota,
--       lineas: [{ id, entregada, motivo }] }   (una por cada línea del pedido)
-- Si entregó menos de lo pedido, el motivo es obligatorio y el pedido queda "Entregado con
-- incidencia". El total a cobrar se recalcula con lo entregado (+ el envío si se cobraba).
-- Si el piloto tiene carga en una bodega del día abierta, lo entregado sale de ella.
create or replace function public.dist_entregar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u          public.usuarios;
    pe         public.pedidos;
    l          record;
    v_bodega   bigint;
    v_forma    text := p ->> 'cobro_forma';
    v_nota     text := nullif(btrim(coalesce(p ->> 'nota', '')), '');
    v_prod_ant numeric;
    v_envio    numeric;
    v_prod     numeric;
    v_total    numeric;
    v_incomp   integer;
    v_estado   text;
    v_mal      text;
    v_faltan   jsonb;
begin
    u := public.viaje_usuario((p ->> 'usuario_id')::bigint);
    select * into pe from public.pedidos where id = (p ->> 'pedido_id')::bigint for update;
    if not found then
        raise exception 'Ese pedido no existe.' using errcode = 'P0001';
    end if;
    if u.id is distinct from pe.piloto_id and not public.dist_puede_tienda(u, pe.tienda_id) then
        raise exception 'Solo el piloto del pedido (o un G3 o superior de la tienda) lo entrega.' using errcode = 'P0001';
    end if;
    if pe.anulado or pe.estado not in ('en_ruta', 'en_entrega') then
        raise exception 'El pedido no está en ruta: no se puede entregar.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.pedido_productos x where x.pedido_id = pe.id) then
        raise exception 'El pedido no tiene productos.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.pedido_productos x where x.pedido_id = pe.id)
       <> (select count(*) from jsonb_to_recordset(coalesce(p -> 'lineas', '[]'::jsonb)) as x(id bigint, entregada numeric, motivo text)
             join public.pedido_productos pp on pp.id = x.id and pp.pedido_id = pe.id) then
        raise exception 'Escribe la cantidad entregada de cada producto.' using errcode = 'P0001';
    end if;

    v_bodega := public.dist_bodega_del_piloto(pe.piloto_id, pe.ruta_id);

    for l in select * from jsonb_to_recordset(p -> 'lineas') as x(id bigint, entregada numeric, motivo text) loop
        if l.entregada is null or l.entregada < 0 then
            raise exception 'Revisa las cantidades entregadas (0 o más).' using errcode = 'P0001';
        end if;
        if l.entregada > (select pp.cantidad from public.pedido_productos pp where pp.id = l.id) then
            raise exception 'No se puede entregar más de lo pedido.' using errcode = 'P0001';
        end if;
        if l.entregada < (select pp.cantidad from public.pedido_productos pp where pp.id = l.id)
           and nullif(btrim(coalesce(l.motivo, '')), '') is null then
            raise exception 'Escribe el motivo de cada producto que se entregó incompleto.' using errcode = 'P0001';
        end if;
        update public.pedido_productos
           set cantidad_entregada = round(l.entregada, 2),
               motivo = case when l.entregada < cantidad then btrim(l.motivo) end,
               bodega_id = v_bodega
         where id = l.id and pedido_id = pe.id;
    end loop;

    if not exists (select 1 from public.pedido_productos x where x.pedido_id = pe.id and x.cantidad_entregada > 0) then
        raise exception 'No se entregó ningún producto: márcalo como "No entregado".' using errcode = 'P0001';
    end if;

    -- Lo entregado tiene que haber salido de su carga
    if v_bodega is not null then
        select public.dist_descripcion(s.presentacion_id) into v_mal
          from public.dist_piloto_resumen(v_bodega, pe.piloto_id) s where s.en_mano < 0 limit 1;
        if v_mal is not null then
            raise exception 'El piloto no lleva suficiente en su carga: %.', v_mal using errcode = 'P0001';
        end if;
    end if;

    -- Total: productos entregados (con IVA) + el envío que se cobraba
    v_prod_ant := coalesce((pe.detalle #>> '{productos,total}')::numeric, 0);
    v_envio := greatest(pe.total_cobrar - v_prod_ant, 0);
    select coalesce(sum(round(x.cantidad_entregada * x.precio * (1 + x.iva_pct / 100), 2)), 0),
           count(*) filter (where x.cantidad_entregada < x.cantidad)
      into v_prod, v_incomp
      from public.pedido_productos x where x.pedido_id = pe.id;
    v_total := round(v_envio + v_prod, 2);
    if v_total > 0 and (v_forma is null or v_forma not in ('efectivo', 'sinpe', 'tarjeta')) then
        raise exception 'Elige cómo pagó el cliente.' using errcode = 'P0001';
    end if;
    v_estado := case when v_incomp > 0 then 'entregado_incidencia' else 'entregado' end;
    select coalesce(jsonb_agg(jsonb_build_object('producto', x.descripcion, 'pedido', x.cantidad,
                                                 'entregado', x.cantidad_entregada, 'motivo', x.motivo)), '[]'::jsonb)
      into v_faltan
      from public.pedido_productos x where x.pedido_id = pe.id and x.cantidad_entregada < x.cantidad;

    update public.pedidos
       set estado = v_estado,
           total_cobrar = v_total,
           cobro_forma = case when v_total > 0 then v_forma end,
           detalle = jsonb_set(detalle, '{productos}', coalesce(detalle -> 'productos', '{}'::jsonb)
                     || jsonb_build_object('total_pedido', v_prod_ant, 'total_entregado', v_prod, 'incompletos', v_incomp)),
           actualizado_en = now()
     where id = pe.id;

    insert into public.pedido_entregas (pedido_id, piloto_id, recibio_nombre, comentario)
    values (pe.id, pe.piloto_id, case when pe.recibe_tipo = 'autorizado' then pe.recibe_nombre else pe.cliente_nombre end,
            coalesce(v_nota, case when v_incomp > 0 then 'Entrega incompleta' else 'Entregado completo' end))
    on conflict (pedido_id) do update
       set piloto_id = excluded.piloto_id, entregado_en = now(), recibio_nombre = excluded.recibio_nombre, comentario = excluded.comentario;

    insert into public.pedido_historial (pedido_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id, usuario_nombre)
    values (pe.id, 'estado', pe.estado, v_estado,
            jsonb_build_object('cobro', case when v_total > 0 then v_forma end, 'total', v_total)
            || case when v_incomp > 0 then jsonb_build_object('incompletos', v_faltan) else '{}'::jsonb end
            || case when v_nota is not null then jsonb_build_object('nota', v_nota) else '{}'::jsonb end,
            u.id, u.nombre);

    return jsonb_build_object('estado', v_estado, 'total', v_total, 'incompletos', v_incomp, 'faltan', v_faltan);
end;
$$;

-- ---------- Venta en ruta (autoventa): el piloto vende de lo que lleva ----------
-- p = { usuario_id, piloto_id (si la registra un G3+), cliente_id, cliente_nombre, cliente_telefono,
--       direccion, lista_id, cobro_forma, nota, lineas: [{ presentacion_id, cantidad }] }
-- Queda como un pedido ya entregado (detalle.venta_ruta), así entra en la Caja del piloto.
create or replace function public.dist_venta_ruta(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u          public.usuarios;
    pil        public.usuarios;
    b          public.bodegas_dia;
    r          public.rutas;
    v_lista    bigint;
    v_act      text;
    v_forma    text := p ->> 'cobro_forma';
    v_ped      bigint;
    v_codigo   text;
    l          record;
    v_precio   record;
    v_sub      numeric := 0;
    v_iva      numeric := 0;
    v_total    numeric;
    v_mal      text;
begin
    u := public.viaje_usuario((p ->> 'usuario_id')::bigint);
    if u.rol = 'piloto' then
        pil := u;
    else
        select * into pil from public.usuarios where id = (p ->> 'piloto_id')::bigint and rol = 'piloto';
        if not found then
            raise exception 'Elige el piloto que vendió.' using errcode = 'P0001';
        end if;
    end if;

    select * into b from public.bodegas_dia where id = public.dist_bodega_del_piloto(pil.id, null);
    if not found then
        raise exception 'Para vender en ruta hace falta tener carga en una bodega del día abierta.' using errcode = 'P0001';
    end if;
    if u.rol <> 'piloto' and not public.dist_puede_tienda(u, b.tienda_id) then
        raise exception 'Solo el piloto o un G3 o superior de la tienda registra la venta.' using errcode = 'P0001';
    end if;
    if jsonb_array_length(coalesce(p -> 'lineas', '[]'::jsonb)) = 0 then
        raise exception 'Agrega al menos un producto.' using errcode = 'P0001';
    end if;
    if v_forma is null or v_forma not in ('efectivo', 'sinpe', 'tarjeta') then
        raise exception 'Elige cómo pagó el cliente.' using errcode = 'P0001';
    end if;
    v_lista := (p ->> 'lista_id')::bigint;
    if v_lista is null or not exists (select 1 from public.listas_precios x where x.id = v_lista and x.empresa_id = b.empresa_id) then
        v_lista := b.lista_id;
    end if;

    -- Actividad del pedido: la de la ruta o una de la empresa que use productos
    select * into r from public.rutas where id = b.ruta_id;
    v_act := r.actividad;
    if v_act is null then
        select a.codigo into v_act
          from public.actividades a, public.empresas e
         where e.id = b.empresa_id and a.codigo = any (e.actividades) and a.usa_productos
         order by a.orden limit 1;
    end if;
    v_act := coalesce(v_act, 'distribucion');

    v_codigo := 'VR-' || lpad(nextval('public.dist_ventas_seq')::text, 6, '0');
    -- Se crea ya entregada (con sus horas): no pasa por "Entregando" (uno a la vez por piloto)
    insert into public.pedidos (actividad, tienda_id, ruta_id, cliente_id, cliente_nombre, cliente_telefono,
        direccion_entrega, fecha_entrega, piloto_id, estado, forma_pago, detalle, notas, creado_por, codigo,
        entregando_en, finalizado_en)
    values (v_act, b.tienda_id, b.ruta_id, (p ->> 'cliente_id')::bigint,
        coalesce(nullif(btrim(coalesce(p ->> 'cliente_nombre', '')), ''), 'Cliente de contado'),
        coalesce(nullif(btrim(coalesce(p ->> 'cliente_telefono', '')), ''), ''),
        coalesce(nullif(btrim(coalesce(p ->> 'direccion', '')), ''), 'Venta en ruta'),
        b.fecha, pil.id, 'entregado', case when v_forma = 'tarjeta' then 'tarjeta' else 'efectivo' end,
        jsonb_build_object('venta_ruta', true, 'lista_id', v_lista),
        nullif(btrim(coalesce(p ->> 'nota', '')), ''), u.id, v_codigo, now(), now())
    returning id, codigo into v_ped, v_codigo;

    for l in select * from jsonb_to_recordset(p -> 'lineas') as x(presentacion_id bigint, cantidad numeric) loop
        if not exists (select 1 from public.producto_presentaciones pp where pp.id = l.presentacion_id and pp.empresa_id = b.empresa_id) then
            raise exception 'Un producto no es de la empresa.' using errcode = 'P0001';
        end if;
        if l.cantidad is null or l.cantidad <= 0 then
            raise exception 'Revisa las cantidades (mayores que 0).' using errcode = 'P0001';
        end if;
        select * into v_precio from public.dist_precio(v_lista, l.presentacion_id);
        insert into public.pedido_productos (pedido_id, presentacion_id, descripcion, cantidad, cantidad_entregada, precio, iva_pct, bodega_id)
        values (v_ped, l.presentacion_id, public.dist_descripcion(l.presentacion_id), round(l.cantidad, 2), round(l.cantidad, 2),
                v_precio.precio, v_precio.iva_pct, b.id);
        v_sub := v_sub + round(l.cantidad * v_precio.precio, 2);
        v_iva := v_iva + round(l.cantidad * v_precio.precio * v_precio.iva_pct / 100, 2);
    end loop;

    select public.dist_descripcion(s.presentacion_id) into v_mal
      from public.dist_piloto_resumen(b.id, pil.id) s where s.en_mano < 0 limit 1;
    if v_mal is not null then
        raise exception 'No llevas suficiente en tu carga: %.', v_mal using errcode = 'P0001';
    end if;

    select coalesce(sum(round(x.cantidad_entregada * x.precio * (1 + x.iva_pct / 100), 2)), 0) into v_total
      from public.pedido_productos x where x.pedido_id = v_ped;

    -- Total y forma de cobro (la Caja del piloto la ve como cualquier entrega)
    update public.pedidos
       set total_cobrar = v_total, cobro_forma = v_forma,
           detalle = detalle || jsonb_build_object('productos', jsonb_build_object('subtotal', v_sub, 'iva', v_iva, 'total', v_total,
                                                                                  'total_pedido', v_total, 'total_entregado', v_total, 'incompletos', 0))
     where id = v_ped;

    insert into public.pedido_entregas (pedido_id, piloto_id, recibio_nombre, comentario)
    values (v_ped, pil.id, coalesce(nullif(btrim(coalesce(p ->> 'cliente_nombre', '')), ''), 'Cliente de contado'), 'Venta en ruta')
    on conflict (pedido_id) do nothing;

    insert into public.pedido_historial (pedido_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id, usuario_nombre)
    values (v_ped, 'registrado', null, 'entregado', jsonb_build_object('venta_ruta', true, 'cobro', v_forma, 'total', v_total), u.id, u.nombre);

    return jsonb_build_object('id', v_ped, 'codigo', v_codigo, 'total', v_total);
end;
$$;

-- ---------- Cerrar la mercadería de un piloto (cuadre) ----------
-- p = { usuario_id, bodega_id, piloto_id, notas }
-- Lo que no entregó, vendió ni devolvió queda como FALTANTE (unidades y dinero).
create or replace function public.dist_cerrar_piloto(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u         public.usuarios;
    b         public.bodegas_dia;
    pil       public.usuarios;
    v_lineas  jsonb;
    v_cierre  bigint;
    v_cobrado numeric;
begin
    u := public.viaje_usuario((p ->> 'usuario_id')::bigint);
    select * into b from public.bodegas_dia where id = (p ->> 'bodega_id')::bigint;
    if not found then
        raise exception 'Esa bodega no existe.' using errcode = 'P0001';
    end if;
    if not public.dist_puede_tienda(u, b.tienda_id) then
        raise exception 'Solo un Admin G3 o superior de la tienda cierra la mercadería.' using errcode = 'P0001';
    end if;
    if b.estado <> 'abierta' then
        raise exception 'La bodega de ese día ya está cerrada.' using errcode = 'P0001';
    end if;
    select * into pil from public.usuarios where id = (p ->> 'piloto_id')::bigint and rol = 'piloto';
    if not found then
        raise exception 'Ese piloto no existe.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.cierres_mercaderia c where c.bodega_id = b.id and c.piloto_id = pil.id) then
        raise exception 'Ese piloto ya cerró su mercadería de esta bodega.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.pedidos pe
                where pe.piloto_id = pil.id and not pe.anulado and pe.estado in ('en_ruta', 'en_entrega')
                  and exists (select 1 from public.pedido_productos x where x.pedido_id = pe.id)) then
        raise exception 'El piloto todavía tiene pedidos en ruta: márcalos como entregados o no entregados.' using errcode = 'P0001';
    end if;

    perform pg_advisory_xact_lock(7304, b.id::integer);

    select coalesce(jsonb_agg(jsonb_build_object(
               'presentacion_id', s.presentacion_id, 'descripcion', public.dist_descripcion(s.presentacion_id),
               'cargado', s.cargado + s.recibido - s.enviado, 'entregado', s.entregado, 'vendido', s.vendido,
               'devuelto_bueno', s.devuelto_bueno, 'devuelto_danado', s.devuelto_danado, 'faltante', s.en_mano,
               'valor_unidad', s.valor_unidad, 'valor_entregado', s.valor_entregado, 'valor_vendido', s.valor_vendido)
               order by public.dist_descripcion(s.presentacion_id)), '[]'::jsonb)
      into v_lineas
      from public.dist_piloto_resumen(b.id, pil.id) s;
    if jsonb_array_length(v_lineas) = 0 then
        raise exception 'Ese piloto no tiene carga en esta bodega.' using errcode = 'P0001';
    end if;

    select coalesce(sum(pe.total_cobrar), 0) into v_cobrado
      from public.pedidos pe
     where pe.piloto_id = pil.id and not pe.anulado
       and exists (select 1 from public.pedido_productos x where x.pedido_id = pe.id and x.bodega_id = b.id);

    insert into public.cierres_mercaderia (empresa_id, bodega_id, ruta_id, tienda_id, fecha, piloto_id, piloto_nombre, lineas,
        unidades_cargadas, unidades_entregadas, unidades_vendidas, unidades_devueltas, unidades_faltantes,
        valor_cargado, valor_entregado, valor_vendido, valor_devuelto, valor_faltante, cobrado,
        notas, cerrado_por, cerrado_por_nombre)
    select b.empresa_id, b.id, b.ruta_id, b.tienda_id, b.fecha, pil.id, pil.nombre, v_lineas,
           sum((x ->> 'cargado')::numeric), sum((x ->> 'entregado')::numeric), sum((x ->> 'vendido')::numeric),
           sum((x ->> 'devuelto_bueno')::numeric + (x ->> 'devuelto_danado')::numeric), sum((x ->> 'faltante')::numeric),
           round(sum((x ->> 'cargado')::numeric * (x ->> 'valor_unidad')::numeric), 2),
           sum((x ->> 'valor_entregado')::numeric), sum((x ->> 'valor_vendido')::numeric),
           round(sum(((x ->> 'devuelto_bueno')::numeric + (x ->> 'devuelto_danado')::numeric) * (x ->> 'valor_unidad')::numeric), 2),
           round(sum((x ->> 'faltante')::numeric * (x ->> 'valor_unidad')::numeric), 2),
           v_cobrado, nullif(btrim(coalesce(p ->> 'notas', '')), ''), u.id, u.nombre
      from jsonb_array_elements(v_lineas) x
    returning id into v_cierre;

    return (select to_jsonb(c) from public.cierres_mercaderia c where c.id = v_cierre);
end;
$$;

-- ---------- Cerrar la bodega del día (queda en 0) ----------
-- p = { usuario_id, bodega_id, notas }
-- Todos los pilotos con carga tienen que estar cerrados. Lo que queda sale de la bodega
-- (devolución a la tienda) y se guarda el resumen del día.
create or replace function public.dist_cerrar_bodega(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u          public.usuarios;
    b          public.bodegas_dia;
    v_falta    text;
    v_resumen  jsonb;
begin
    u := public.viaje_usuario((p ->> 'usuario_id')::bigint);
    select * into b from public.bodegas_dia where id = (p ->> 'bodega_id')::bigint for update;
    if not found then
        raise exception 'Esa bodega no existe.' using errcode = 'P0001';
    end if;
    if not public.dist_puede_tienda(u, b.tienda_id) then
        raise exception 'Solo un Admin G3 o superior de la tienda cierra la bodega.' using errcode = 'P0001';
    end if;
    if b.estado <> 'abierta' then
        raise exception 'La bodega de ese día ya está cerrada.' using errcode = 'P0001';
    end if;

    perform pg_advisory_xact_lock(7304, b.id::integer);

    select string_agg(distinct x.nombre, ', ') into v_falta
      from public.bodega_movimientos m
      join public.usuarios x on x.id in (m.piloto_id, m.piloto_destino_id)
     where m.bodega_id = b.id and m.tipo in ('carga', 'traspaso')
       and not exists (select 1 from public.cierres_mercaderia c where c.bodega_id = b.id and c.piloto_id = x.id);
    if v_falta is not null then
        raise exception 'Primero cierra la mercadería de: %.', v_falta using errcode = 'P0001';
    end if;

    -- Lo que queda sale de la bodega (vuelve a la tienda)
    insert into public.bodega_movimientos (empresa_id, bodega_id, presentacion_id, tipo, cantidad, precio, iva_pct, nota, usuario_id, usuario_nombre)
    select b.empresa_id, b.id, s.presentacion_id, 'salida', s.en_bodega, d.precio, d.iva_pct, 'Cierre del día: vuelve a la tienda', u.id, u.nombre
      from public.dist_bodega_saldo(b.id) s, public.dist_precio(b.lista_id, s.presentacion_id) d
     where s.en_bodega > 0;

    -- Resumen del día por presentación (unidades) y totales (dinero con IVA)
    with s as (
        select * from public.dist_bodega_saldo(b.id)
    ), ven as (
        select pp.presentacion_id,
               coalesce(sum(pp.cantidad_entregada) filter (where not coalesce((pe.detalle ->> 'venta_ruta')::boolean, false)), 0) as entregado,
               coalesce(sum(pp.cantidad_entregada) filter (where coalesce((pe.detalle ->> 'venta_ruta')::boolean, false)), 0) as vendido,
               coalesce(sum(round(pp.cantidad_entregada * pp.precio * (1 + pp.iva_pct / 100), 2)), 0) as valor_vendido
          from public.pedido_productos pp join public.pedidos pe on pe.id = pp.pedido_id
         where pp.bodega_id = b.id and not pe.anulado
         group by pp.presentacion_id
    ), fal as (
        select (x ->> 'presentacion_id')::bigint as presentacion_id, sum((x ->> 'faltante')::numeric) as faltante,
               sum((x ->> 'faltante')::numeric * (x ->> 'valor_unidad')::numeric) as valor_faltante
          from public.cierres_mercaderia c, jsonb_array_elements(c.lineas) x
         where c.bodega_id = b.id
         group by 1
    ), lineas as (
        select s.presentacion_id, public.dist_descripcion(s.presentacion_id) as descripcion,
               s.ingresado, s.cargado, s.devuelto_bueno, s.devuelto_danado, s.ajustes, s.salida,
               coalesce(ven.entregado, 0) as entregado, coalesce(ven.vendido, 0) as vendido,
               coalesce(fal.faltante, 0) as faltante, coalesce(ven.valor_vendido, 0) as valor_vendido,
               coalesce(fal.valor_faltante, 0) as valor_faltante,
               round(d.precio * (1 + d.iva_pct / 100), 2) as valor_unidad
          from s
          left join ven on ven.presentacion_id = s.presentacion_id
          left join fal on fal.presentacion_id = s.presentacion_id
          cross join lateral public.dist_precio(b.lista_id, s.presentacion_id) d
    )
    select jsonb_build_object(
               'lineas', coalesce(jsonb_agg(to_jsonb(lineas) order by lineas.descripcion), '[]'::jsonb),
               'totales', jsonb_build_object(
                   'ingresado', coalesce(sum(lineas.ingresado), 0),
                   'cargado', coalesce(sum(lineas.cargado), 0),
                   'entregado', coalesce(sum(lineas.entregado), 0),
                   'vendido', coalesce(sum(lineas.vendido), 0),
                   'devuelto_bueno', coalesce(sum(lineas.devuelto_bueno), 0),
                   'devuelto_danado', coalesce(sum(lineas.devuelto_danado), 0),
                   'ajustes', coalesce(sum(lineas.ajustes), 0),
                   'salida', coalesce(sum(lineas.salida), 0),
                   'faltante', coalesce(sum(lineas.faltante), 0),
                   'valor_ingresado', round(coalesce(sum(lineas.ingresado * lineas.valor_unidad), 0), 2),
                   'valor_vendido', round(coalesce(sum(lineas.valor_vendido), 0), 2),
                   'valor_salida', round(coalesce(sum(lineas.salida * lineas.valor_unidad), 0), 2),
                   'valor_faltante', round(coalesce(sum(lineas.valor_faltante), 0), 2)),
               'pilotos', (select count(*) from public.cierres_mercaderia c where c.bodega_id = b.id))
      into v_resumen
      from lineas;

    update public.bodegas_dia
       set estado = 'cerrada', cerrada_por = u.id, cerrada_por_nombre = u.nombre, cerrada_en = now(),
           notas = nullif(btrim(coalesce(p ->> 'notas', '')), ''), resumen = v_resumen
     where id = b.id;

    return (select to_jsonb(x) from public.bodegas_dia x where x.id = b.id);
end;
$$;

-- ---------- Acceso desde la web (TEMPORAL, como las demás tablas) ----------
-- Productos, presentaciones, listas, precios y motivos: los administra la página.
do $$
declare
    t text;
begin
    foreach t in array array['productos', 'producto_presentaciones', 'listas_precios', 'precios', 'motivos_entrega_parcial'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('grant select, insert, update, delete on public.%I to anon', t);
        execute format('drop policy if exists "TEMPORAL - leer %s" on public.%I', t, t);
        execute format('drop policy if exists "TEMPORAL - crear %s" on public.%I', t, t);
        execute format('drop policy if exists "TEMPORAL - modificar %s" on public.%I', t, t);
        execute format('drop policy if exists "TEMPORAL - eliminar %s" on public.%I', t, t);
        execute format('create policy "TEMPORAL - leer %s" on public.%I for select to anon using (true)', t, t);
        execute format('create policy "TEMPORAL - crear %s" on public.%I for insert to anon with check (true)', t, t);
        execute format('create policy "TEMPORAL - modificar %s" on public.%I for update to anon using (true) with check (true)', t, t);
        execute format('create policy "TEMPORAL - eliminar %s" on public.%I for delete to anon using (true)', t, t);
    end loop;
    -- Bodega, movimientos y cierres: SOLO leer (se escriben con las funciones dist_*)
    foreach t in array array['bodegas_dia', 'bodega_movimientos', 'cierres_mercaderia'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('revoke insert, update, delete on public.%I from anon', t);
        execute format('grant select on public.%I to anon', t);
        execute format('drop policy if exists "TEMPORAL - leer %s" on public.%I', t, t);
        execute format('create policy "TEMPORAL - leer %s" on public.%I for select to anon using (true)', t, t);
    end loop;
end;
$$;

-- Productos del pedido: la página los crea con el pedido (preventa) y los lee;
-- lo entregado lo pone dist_entregar
alter table public.pedido_productos enable row level security;
revoke update on public.pedido_productos from anon;
grant select, insert, delete on public.pedido_productos to anon;
drop policy if exists "TEMPORAL - leer pedido_productos" on public.pedido_productos;
drop policy if exists "TEMPORAL - crear pedido_productos" on public.pedido_productos;
drop policy if exists "TEMPORAL - eliminar pedido_productos" on public.pedido_productos;
create policy "TEMPORAL - leer pedido_productos" on public.pedido_productos for select to anon using (true);
create policy "TEMPORAL - crear pedido_productos" on public.pedido_productos for insert to anon with check (true);
create policy "TEMPORAL - eliminar pedido_productos" on public.pedido_productos for delete to anon using (true);

grant execute on function public.dist_bodega_saldo(bigint) to anon;
grant execute on function public.dist_piloto_resumen(bigint, bigint) to anon;
grant execute on function public.dist_bodega_abrir(jsonb) to anon;
grant execute on function public.dist_movimiento(jsonb) to anon;
grant execute on function public.dist_entregar(jsonb) to anon;
grant execute on function public.dist_venta_ruta(jsonb) to anon;
grant execute on function public.dist_cerrar_piloto(jsonb) to anon;
grant execute on function public.dist_cerrar_bodega(jsonb) to anon;
-- Internas: no se llaman desde la página
revoke execute on function public.dist_puede_tienda(public.usuarios, bigint) from anon, public;
revoke execute on function public.dist_bodega_del_piloto(bigint, bigint) from anon, public;

-- tiendas tiene una columna nueva: la página tiene que poder leerla
notify pgrst, 'reload schema';



