-- ==================================================
-- NOTIFICACIONES
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez)
--
-- Qué hace: crea la tabla "notificaciones". Cada fila es un aviso
-- para UN usuario (la campana del encabezado, js/notificaciones.js):
--   tipo      -> pendiente | aprobado | rechazado | info
--   titulo, mensaje -> lo que se muestra
--   enlace    -> a dónde lleva al hacer clic (ej. "#usuarios",
--                "#clientes?tienda=1")
--   leida     -> false = cuenta en el número rojo de la campana
--   referencia_tipo / referencia_id -> a qué se refiere (ej. "cliente" 5).
--                Sirve para que, cuando alguien resuelve una solicitud,
--                el aviso "pendiente" se marque como leído para todos.
--
-- Si se elimina el usuario destinatario, se borran sus notificaciones.
-- ==================================================

create table public.notificaciones (
    id               bigint generated always as identity primary key,
    usuario_id       bigint not null references public.usuarios(id) on delete cascade,
    tipo             text not null default 'info',
    titulo           text not null,
    mensaje          text,
    enlace           text,
    referencia_tipo  text,       -- ej. 'usuario' | 'cliente'
    referencia_id    bigint,
    leida            boolean not null default false,
    creado_en        timestamptz not null default now(),

    constraint notificaciones_tipo_valido check (tipo in ('pendiente', 'aprobado', 'rechazado', 'info'))
);

-- Para que la consulta "mis notificaciones" sea rápida
create index notificaciones_usuario_idx on public.notificaciones (usuario_id, leida, creado_en desc);


-- ---------- Acceso desde la web (TEMPORAL) ----------
-- CUANDO SE PASE A LA VERSIÓN SEGURA (Fase 7): cada usuario solo lee y
-- marca las suyas.
alter table public.notificaciones enable row level security;
grant select, insert, update, delete on public.notificaciones to anon;

create policy "TEMPORAL - leer notificaciones"      on public.notificaciones for select to anon using (true);
create policy "TEMPORAL - crear notificaciones"     on public.notificaciones for insert to anon with check (true);
create policy "TEMPORAL - modificar notificaciones" on public.notificaciones for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar notificaciones"  on public.notificaciones for delete to anon using (true);
