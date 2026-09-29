-- ==================================================
-- ROL: ADMIN G2 (administrador de una región)
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez, después de 06_roles_admin_g1_empleado.sql)
--
-- Qué hace en la tabla "usuarios":
--   1. Agrega la columna "region" (código de la región, ej. NOR).
--      Solo la usa el Admin G2.
--   2. Agrega el rol "admin_g2".
--   3. Actualiza la regla de tienda/región según el rol.
--
-- Roles después de este script:
--   administrador -> sin tienda ni región. Usuario simple (ej. admin).
--   admin_g1      -> sin tienda ni región (todo el país). Usuario simple.
--   admin_g2      -> sin tienda, CON región. Usuario simple (ej. jlopez).
--                    Gestiona Empleados y Pilotos de las tiendas de su región.
--   empleado      -> con tienda. Usuario compuesto (ej. cen-001-inavarro).
--   piloto        -> con tienda. Usuario compuesto (ej. cen-001-lgarcia).
--
-- ⚠ Lo que puede hacer cada rol lo controla la página (modo rápido).
--   La regla real en la base de datos llega en la Fase 7.
-- ==================================================

-- 1. Columna región (solo para Admin G2).
--    on delete restrict = no se puede borrar una región que tenga Admin G2.
alter table public.usuarios
    add column region text references public.regiones(codigo) on delete restrict;

-- 2. Quitar las reglas anteriores
alter table public.usuarios drop constraint usuarios_tienda_segun_rol;
alter table public.usuarios drop constraint usuarios_rol_valido;

-- 3. Roles permitidos
alter table public.usuarios
    add constraint usuarios_rol_valido
    check (rol in ('administrador', 'admin_g1', 'admin_g2', 'empleado', 'piloto'));

-- 4. Tienda y región según el rol:
--    administrador, admin_g1 -> sin tienda y sin región
--    admin_g2                -> sin tienda, CON región
--    empleado, piloto        -> CON tienda, sin región (la región sale de su tienda)
alter table public.usuarios
    add constraint usuarios_tienda_segun_rol check (
        (rol in ('administrador', 'admin_g1') and tienda_id is null and region is null)
        or (rol = 'admin_g2' and tienda_id is null and region is not null)
        or (rol in ('empleado', 'piloto') and tienda_id is not null and region is null)
    );

-- 5. Verificar (opcional)
select u.id, u.nombre, u.id_usuario, u.rol, t.codigo as tienda, u.region
from public.usuarios u
left join public.tiendas t on t.id = u.tienda_id
order by u.id;
