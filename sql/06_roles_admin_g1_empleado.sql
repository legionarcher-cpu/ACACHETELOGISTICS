-- ==================================================
-- ROLES: ADMIN G1 y EMPLEADO
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez, después de 02_roles_y_tiendas.sql)
--
-- Qué hace en la tabla "usuarios":
--   1. El rol "tienda" pasa a llamarse "empleado"
--      (los usuarios que ya lo tienen se actualizan solos).
--   2. Agrega el rol "admin_g1".
--   3. Actualiza la regla de tienda según el rol.
--
-- Roles después de este script:
--   administrador -> sin tienda. Usuario simple (ej. admin). Todo.
--   admin_g1      -> sin tienda (todo el país). Usuario simple (ej. jlopez).
--                    Crea, modifica y elimina Empleados y Pilotos.
--                    En Tiendas solo modifica datos (nombre, dirección...).
--   empleado      -> con tienda. Usuario compuesto (ej. cen-001-inavarro).
--   piloto        -> con tienda. Usuario compuesto (ej. cen-001-lgarcia).
--
-- ⚠ Lo que puede hacer cada rol lo controla la página (modo rápido).
--   La regla real en la base de datos llega en la Fase 7.
-- ==================================================

-- 1. Quitar las reglas viejas (usan el rol "tienda")
alter table public.usuarios drop constraint usuarios_tienda_segun_rol;
alter table public.usuarios drop constraint usuarios_rol_valido;

-- 2. "tienda" -> "empleado"
update public.usuarios
set rol = 'empleado'
where rol = 'tienda';

-- 3. Roles permitidos
alter table public.usuarios
    add constraint usuarios_rol_valido
    check (rol in ('administrador', 'admin_g1', 'empleado', 'piloto'));

-- 4. Tienda según el rol:
--    administrador y admin_g1 -> SIN tienda
--    empleado y piloto        -> CON tienda
alter table public.usuarios
    add constraint usuarios_tienda_segun_rol check (
        (rol in ('administrador', 'admin_g1') and tienda_id is null)
        or (rol in ('empleado', 'piloto') and tienda_id is not null)
    );

-- 5. Verificar (opcional): usuarios con su rol y tienda
select u.id, u.nombre, u.id_usuario, u.rol, t.codigo as tienda
from public.usuarios u
left join public.tiendas t on t.id = u.tienda_id
order by u.id;
