-- ==================================================
-- TABLA DE USUARIOS - VERSIÓN RÁPIDA (SOLO DESARROLLO)
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--
-- ⚠ VERSIÓN RÁPIDA / INSEGURA ⚠
--   - La contraseña (clave) se guarda tal cual, sin cifrar.
--   - Cualquiera que tenga la clave "anon" (va en la página web)
--     puede leer, crear, modificar y borrar usuarios.
--   Sirve SOLO para desarrollar y probar. No usar contraseñas reales.
--   Antes de usarlo en serio hay que pasar a Supabase Auth + reglas RLS.
-- ==================================================


-- ---------- 1. Crear la tabla ----------
-- Los nombres van en minúscula y sin espacios ni tildes para que
-- sea fácil usarlos desde la web y desde la app.
--
--   Columna en la imagen  ->  columna en la base de datos
--   Nombre                ->  nombre
--   ID Usuario            ->  id_usuario   (lo que se escribe en el login)
--   Telefono              ->  telefono
--   Tienda                ->  tienda
--   Clave                 ->  clave        (contraseña del login)
--   Permisos              ->  permisos
--
-- Se agregan 2 columnas automáticas:
--   id         -> número interno único (lo usa la página para editar/borrar)
--   creado_en  -> fecha y hora en que se creó el usuario

create table public.usuarios (
    id          bigint generated always as identity primary key,
    nombre      text        not null,
    id_usuario  text        not null unique,   -- no se pueden repetir
    telefono    text,                          -- texto para conservar ceros y el "+"
    tienda      text,
    clave       text        not null,
    permisos    text[]      not null default '{}',
    -- permisos: lista de secciones que puede abrir, ej. {pedidos,rutas}
    --           {*} = todas. Vacío = solo inicio y perfil.
    --           (por ahora no se usa; se deja lista para después)
    creado_en   timestamptz not null default now()
);


-- ---------- 2. Permitir el acceso desde la web (TEMPORAL) ----------
-- RLS = reglas de quién puede hacer qué con la tabla.
-- Aquí se activa pero con reglas que dejan pasar a todos
-- (rol "anon" = cualquiera que use la clave pública).
-- CUANDO SE PASE A LA VERSIÓN SEGURA: borrar estas 4 reglas.

alter table public.usuarios enable row level security;

grant select, insert, update, delete on public.usuarios to anon;

create policy "TEMPORAL - leer usuarios"      on public.usuarios for select to anon using (true);
create policy "TEMPORAL - crear usuarios"     on public.usuarios for insert to anon with check (true);
create policy "TEMPORAL - modificar usuarios" on public.usuarios for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar usuarios"  on public.usuarios for delete to anon using (true);


-- ---------- 3. Usuarios de prueba (opcional) ----------
-- Cambiar los datos por los de sus 2 usuarios y ejecutar.
-- (Si los van a crear desde la página de administrador, omitir esta parte.)

insert into public.usuarios (nombre, id_usuario, telefono, tienda, clave, permisos) values
    ('Administrador', 'admin',    '00000000', 'Central', 'admin123', '{*}'),
    ('Operador',      'operador', '00000000', 'Central', 'opera123', '{}');
