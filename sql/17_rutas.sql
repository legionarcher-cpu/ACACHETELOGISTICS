-- ==================================================
-- RUTAS DE CADA TIENDA Y PILOTOS ASIGNADOS (por día o por semana)
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez, DESPUÉS de sql/14_pedidos.sql)
--
-- Para qué sirve:
--   - Cada tienda tiene las RUTAS que necesite (Ruta 1, Ruta Norte...).
--     Una ruta puede ser solo de una actividad (ej. solo Encomiendas o solo
--     Entregas de tienda) o de todas.
--   - El Admin G2 (o superior) asigna el o los PILOTOS de cada ruta por un
--     DÍA o por una SEMANA (sección "Rutas y asignaciones").
--   - Al registrar un pedido, el empleado elige la ruta y el piloto sale
--     solo según esa asignación (si hay varios, el que tenga menos pedidos
--     ese día). El empleado no elige piloto.
--
-- Qué hace:
--   1. Tabla "rutas": tienda, nombre, actividad (vacía = todas), activa, orden.
--   2. Tabla "rutas_pilotos": piloto asignado a una ruta desde / hasta una fecha.
--   3. Columna pedidos.ruta_id: la ruta del pedido.
--   4. Crea "Ruta 1" en cada tienda que ya existe.
--   5. Reglas de acceso TEMPORALES.
-- ==================================================


-- ---------- 1. Rutas ----------
create table public.rutas (
    id          bigint generated always as identity primary key,
    tienda_id   bigint not null references public.tiendas(id) on delete cascade,
    nombre      text not null,
    actividad   text references public.actividades(codigo) on delete set null, -- vacío = todas
    activa      boolean not null default true,
    orden       smallint not null default 0,
    creado_en   timestamptz not null default now(),

    constraint rutas_nombre_unico unique (tienda_id, nombre)
);


-- ---------- 2. Pilotos de cada ruta (por día o por semana) ----------
-- Un día: fecha_desde = fecha_hasta. Una semana: lunes a domingo.
-- Una ruta puede tener varios pilotos el mismo día.
create table public.rutas_pilotos (
    id           bigint generated always as identity primary key,
    ruta_id      bigint not null references public.rutas(id) on delete cascade,
    piloto_id    bigint not null references public.usuarios(id) on delete cascade,
    fecha_desde  date not null,
    fecha_hasta  date not null,
    creado_por   bigint references public.usuarios(id) on delete set null,
    creado_en    timestamptz not null default now(),

    constraint rutas_pilotos_fechas_validas check (fecha_hasta >= fecha_desde and fecha_hasta - fecha_desde <= 31)
);

create index rutas_pilotos_fechas_idx on public.rutas_pilotos (ruta_id, fecha_desde, fecha_hasta);


-- ---------- 3. Ruta del pedido ----------
alter table public.pedidos
    add column ruta_id bigint references public.rutas(id) on delete set null;


-- ---------- 4. Una ruta inicial por tienda ----------
insert into public.rutas (tienda_id, nombre, orden)
select id, 'Ruta 1', 1 from public.tiendas;


-- ---------- 5. Acceso desde la web (TEMPORAL) ----------
alter table public.rutas enable row level security;
grant select, insert, update, delete on public.rutas to anon;
create policy "TEMPORAL - leer rutas"      on public.rutas for select to anon using (true);
create policy "TEMPORAL - crear rutas"     on public.rutas for insert to anon with check (true);
create policy "TEMPORAL - modificar rutas" on public.rutas for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar rutas"  on public.rutas for delete to anon using (true);

alter table public.rutas_pilotos enable row level security;
grant select, insert, update, delete on public.rutas_pilotos to anon;
create policy "TEMPORAL - leer rutas_pilotos"      on public.rutas_pilotos for select to anon using (true);
create policy "TEMPORAL - crear rutas_pilotos"     on public.rutas_pilotos for insert to anon with check (true);
create policy "TEMPORAL - modificar rutas_pilotos" on public.rutas_pilotos for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar rutas_pilotos"  on public.rutas_pilotos for delete to anon using (true);
