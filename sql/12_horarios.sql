-- ==================================================
-- CONFIGURACIÓN: HORARIOS (marcas del piloto y pedidos por marca)
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez)
--
-- Qué es una MARCA: cada uno de los registros de horario que el piloto
-- debe hacer en el día (mínimo "cantidad_marcas", base 5). Cada marca
-- tiene horas predeterminadas que define el administrador:
--   inicio_desde / inicio_hasta -> ventana para iniciarla (ej. 07:00 a 07:30)
--   fin                         -> hora en que termina     (ej. 09:00)
-- En cada marca caben como máximo "pedidos_por_marca" pedidos (base 5).
--
-- Qué hace:
--   1. Tabla "configuracion": valores generales (clave -> valor):
--        cantidad_marcas   = 5
--        pedidos_por_marca = 5
--      Más adelante se agregan otras claves sin crear tablas nuevas.
--   2. Tabla "marcas_horario": las marcas 1, 2, 3... con sus horas.
--      Se cargan 5 de ejemplo (marca 1: inicia 07:00-07:30, termina 09:00).
--   3. Tabla "capacidad_marcas": pedidos por marca distintos para una
--      REGIÓN o una TIENDA. Prioridad: tienda > región > base general.
--   4. Reglas de acceso TEMPORALES (igual que las demás tablas).
--
-- Quién modifica: Administrador y Admin G1 (lo controla la página,
-- js/secciones/configuracion.js; la regla real llega en la Fase 7).
-- ==================================================


-- ---------- 1. Configuración general ----------
create table public.configuracion (
    clave           text primary key,
    valor           jsonb not null,
    actualizado_en  timestamptz not null default now()
);

insert into public.configuracion (clave, valor) values
    ('cantidad_marcas', '5'),
    ('pedidos_por_marca', '5');


-- ---------- 2. Marcas del día ----------
create table public.marcas_horario (
    numero          smallint primary key,  -- 1, 2, 3...
    inicio_desde    time not null,          -- se puede iniciar desde...
    inicio_hasta    time not null,          -- ...hasta
    fin             time not null,          -- hora en que termina la marca
    actualizado_en  timestamptz not null default now(),

    constraint marcas_numero_valido  check (numero between 1 and 24),
    constraint marcas_ventana_valida check (inicio_hasta >= inicio_desde),
    constraint marcas_fin_valido     check (fin > inicio_hasta)
);

-- 5 marcas de ejemplo (se modifican desde Configuración)
insert into public.marcas_horario (numero, inicio_desde, inicio_hasta, fin) values
    (1, '07:00', '07:30', '09:00'),
    (2, '09:00', '09:30', '11:00'),
    (3, '11:00', '11:30', '13:00'),
    (4, '13:00', '13:30', '15:00'),
    (5, '15:00', '15:30', '17:00');


-- ---------- 3. Pedidos por marca según región o tienda ----------
-- Cada fila es para UNA región o UNA tienda (nunca las dos).
-- on delete cascade: si se elimina la región o la tienda, se borra su ajuste.
create table public.capacidad_marcas (
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


-- ---------- 4. Acceso desde la web (TEMPORAL) ----------
alter table public.configuracion enable row level security;
grant select, insert, update on public.configuracion to anon;
create policy "TEMPORAL - leer configuracion"      on public.configuracion for select to anon using (true);
create policy "TEMPORAL - crear configuracion"     on public.configuracion for insert to anon with check (true);
create policy "TEMPORAL - modificar configuracion" on public.configuracion for update to anon using (true) with check (true);

alter table public.marcas_horario enable row level security;
grant select, insert, update, delete on public.marcas_horario to anon;
create policy "TEMPORAL - leer marcas"      on public.marcas_horario for select to anon using (true);
create policy "TEMPORAL - crear marcas"     on public.marcas_horario for insert to anon with check (true);
create policy "TEMPORAL - modificar marcas" on public.marcas_horario for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar marcas"  on public.marcas_horario for delete to anon using (true);

alter table public.capacidad_marcas enable row level security;
grant select, insert, update, delete on public.capacidad_marcas to anon;
create policy "TEMPORAL - leer capacidad"      on public.capacidad_marcas for select to anon using (true);
create policy "TEMPORAL - crear capacidad"     on public.capacidad_marcas for insert to anon with check (true);
create policy "TEMPORAL - modificar capacidad" on public.capacidad_marcas for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar capacidad"  on public.capacidad_marcas for delete to anon using (true);
