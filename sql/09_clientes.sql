-- ==================================================
-- CLIENTES (base de datos compartida, asignables a varias tiendas)
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez)
--
-- Qué hace:
--   1. Tabla "clientes": nombre, apellidos, teléfono, dirección y
--      ubicación (texto o enlace de mapas; más adelante, ubicación
--      de WhatsApp).
--      Incluye lo necesario para la APROBACIÓN de lo que hacen los
--      Empleados:
--        aprobado            -> false = cliente nuevo creado por un
--                               Empleado, esperando aprobación
--        cambios_pendientes  -> cambios que un Empleado propuso y que
--                               aún no se aplican (hasta que se aprueben)
--        solicitado_por / solicitado_en -> quién y cuándo lo pidió
--   2. Tabla "clientes_tiendas": qué tiendas atienden a cada cliente
--      (un cliente puede estar en varias tiendas).
--   3. Reglas de acceso TEMPORALES (igual que las demás tablas).
--
-- Pendiente para la Fase 2 (Pedidos): calificación 1 a 5 por pedido
-- y categoría A/B/C/D según el promedio.
-- ==================================================


-- ---------- 1. Clientes ----------
create table public.clientes (
    id                  bigint generated always as identity primary key,
    nombre              text not null,
    apellidos           text not null,
    telefono            text not null,
    direccion           text,
    ubicacion           text,        -- referencia o enlace de mapas (WhatsApp más adelante)

    -- Aprobación (lo que crean o cambian los Empleados)
    aprobado            boolean not null default true,
    cambios_pendientes  jsonb,       -- ej. {"telefono": "5555-1234", "direccion": "..."}
    solicitado_por      bigint references public.usuarios(id) on delete set null,
    solicitado_en       timestamptz,

    creado_en           timestamptz not null default now()
);


-- ---------- 2. Tiendas de cada cliente ----------
-- on delete cascade: si se elimina el cliente o la tienda, se borra solo la asignación
create table public.clientes_tiendas (
    cliente_id  bigint not null references public.clientes(id) on delete cascade,
    tienda_id   bigint not null references public.tiendas(id) on delete cascade,
    primary key (cliente_id, tienda_id)
);


-- ---------- 3. Acceso desde la web (TEMPORAL) ----------
-- Quién ve, crea, aprueba o elimina lo controla la página (ver
-- js/secciones/clientes.js). CUANDO SE PASE A LA VERSIÓN SEGURA
-- (Fase 7): borrar estas reglas y crear las reales por rol.

alter table public.clientes enable row level security;
grant select, insert, update, delete on public.clientes to anon;
create policy "TEMPORAL - leer clientes"      on public.clientes for select to anon using (true);
create policy "TEMPORAL - crear clientes"     on public.clientes for insert to anon with check (true);
create policy "TEMPORAL - modificar clientes" on public.clientes for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar clientes"  on public.clientes for delete to anon using (true);

alter table public.clientes_tiendas enable row level security;
grant select, insert, delete on public.clientes_tiendas to anon;
create policy "TEMPORAL - leer clientes_tiendas"     on public.clientes_tiendas for select to anon using (true);
create policy "TEMPORAL - asignar clientes_tiendas"  on public.clientes_tiendas for insert to anon with check (true);
create policy "TEMPORAL - quitar clientes_tiendas"   on public.clientes_tiendas for delete to anon using (true);
