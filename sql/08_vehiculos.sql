-- ==================================================
-- VEHÍCULOS (y vehículo asignado a cada piloto)
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez)
--
-- Qué hace:
--   1. Crea la tabla "vehiculos" (de uso general de la empresa):
--        placa  -> única, en MAYÚSCULAS y sin espacios (ej. P123ABC)
--        marca  -> ej. Toyota
--        estado -> disponible | en_uso | mantenimiento (para la Fase 5)
--   2. Agrega a "usuarios" la columna vehiculo_id: el vehículo que
--      tiene asignado un piloto. Solo los pilotos pueden tener vehículo.
--      Un mismo vehículo puede estar asignado a más de un piloto (turnos).
--   3. Reglas de acceso TEMPORALES (igual que las demás tablas).
--
-- Los vehículos se registran desde la sección Usuarios, al asignarle
-- un vehículo a un piloto ("Registrar vehículo nuevo...").
-- Más adelante (Fase 5) se usarán en solicitudes de transporte.
-- ==================================================


-- ---------- 1. Tabla de vehículos ----------
create table public.vehiculos (
    id         bigint generated always as identity primary key,
    placa      text not null unique,
    marca      text not null,
    estado     text not null default 'disponible',
    creado_en  timestamptz not null default now(),

    -- Placa en mayúsculas, sin espacios, solo letras, números y guion
    constraint vehiculos_placa_formato check (placa ~ '^[A-Z0-9-]+$'),
    constraint vehiculos_estado_valido check (estado in ('disponible', 'en_uso', 'mantenimiento'))
);


-- ---------- 2. Vehículo asignado al piloto ----------
-- on delete set null = si se elimina el vehículo, el piloto queda sin vehículo
alter table public.usuarios
    add column vehiculo_id bigint references public.vehiculos(id) on delete set null;

-- Solo los pilotos pueden tener vehículo
alter table public.usuarios
    add constraint usuarios_vehiculo_solo_piloto
    check (vehiculo_id is null or rol = 'piloto');


-- ---------- 3. Acceso desde la web (TEMPORAL) ----------
-- CUANDO SE PASE A LA VERSIÓN SEGURA (Fase 7): borrar estas reglas.
alter table public.vehiculos enable row level security;
grant select, insert, update, delete on public.vehiculos to anon;

create policy "TEMPORAL - leer vehiculos"      on public.vehiculos for select to anon using (true);
create policy "TEMPORAL - crear vehiculos"     on public.vehiculos for insert to anon with check (true);
create policy "TEMPORAL - modificar vehiculos" on public.vehiculos for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar vehiculos"  on public.vehiculos for delete to anon using (true);
