-- ==================================================
-- ROL: ADMIN G3 (administrador local de UNA tienda)
-- y APROBACIÓN de usuarios nuevos
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez, después de 07_rol_admin_g2.sql)
--
-- Qué hace en la tabla "usuarios":
--   1. Agrega el rol "admin_g3": pertenece a una tienda y usa usuario
--      compuesto (ej. cen-001-mlopez), como los empleados.
--   2. Agrega la APROBACIÓN de usuarios:
--        aprobado       -> false = usuario creado por un Admin G3 que
--                          todavía NO puede iniciar sesión
--        solicitado_por / solicitado_en -> quién y cuándo lo creó
--      Lo aprueban: Administrador, Admin G1 o el Admin G2 de la región.
--      Los usuarios que ya existen quedan aprobados.
--
-- Roles después de este script:
--   administrador, admin_g1 -> sin tienda ni región
--   admin_g2                -> con región
--   admin_g3, empleado, piloto -> con tienda
-- ==================================================

-- 1. Aprobación de usuarios (los existentes quedan aprobados)
alter table public.usuarios
    add column aprobado boolean not null default true;

alter table public.usuarios
    add column solicitado_por bigint references public.usuarios(id) on delete set null;

alter table public.usuarios
    add column solicitado_en timestamptz;

-- 2. Reglas de rol (se reemplazan las anteriores)
alter table public.usuarios drop constraint usuarios_tienda_segun_rol;
alter table public.usuarios drop constraint usuarios_rol_valido;

alter table public.usuarios
    add constraint usuarios_rol_valido
    check (rol in ('administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado', 'piloto'));

--    administrador, admin_g1     -> sin tienda y sin región
--    admin_g2                    -> sin tienda, CON región
--    admin_g3, empleado, piloto  -> CON tienda, sin región
alter table public.usuarios
    add constraint usuarios_tienda_segun_rol check (
        (rol in ('administrador', 'admin_g1') and tienda_id is null and region is null)
        or (rol = 'admin_g2' and tienda_id is null and region is not null)
        or (rol in ('admin_g3', 'empleado', 'piloto') and tienda_id is not null and region is null)
    );

-- 3. Verificar (opcional)
select id, nombre, id_usuario, rol, tienda_id, region, aprobado
from public.usuarios
order by id;
