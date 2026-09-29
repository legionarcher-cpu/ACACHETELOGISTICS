-- ==================================================
-- PROTEGER EL USUARIO "admin"
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez, después de 02_roles_y_tiendas.sql)
--
-- Qué hace: la base de datos RECHAZA, venga de donde venga
-- (página web, app del compañero o la API directa):
--   - eliminar el usuario "admin"
--   - cambiarle el usuario (id_usuario) o el rol
--     (si se pudiera renombrar, dejaría de estar protegido)
-- Sí se le puede cambiar el nombre, teléfono, clave y permisos.
--
-- La página de Usuarios también desactiva esos botones/campos
-- (js/secciones/usuarios.js), pero la protección real es esta.
--
-- Para quitar la protección en el futuro:
--   drop trigger usuarios_proteger_admin on public.usuarios;
--   drop function public.proteger_admin();
-- ==================================================

create or replace function public.proteger_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    -- No se puede eliminar
    if tg_op = 'DELETE' and old.id_usuario = 'admin' then
        raise exception 'El usuario admin está protegido y no se puede eliminar.'
            using errcode = 'P0001';
    end if;

    -- No se le puede cambiar el usuario ni el rol
    if tg_op = 'UPDATE' and old.id_usuario = 'admin'
       and (new.id_usuario <> 'admin' or new.rol <> 'administrador') then
        raise exception 'Al usuario admin no se le puede cambiar el usuario ni el rol.'
            using errcode = 'P0001';
    end if;

    -- Todo lo demás se permite
    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

-- Se ejecuta ANTES de cada modificación o eliminación en la tabla usuarios
create trigger usuarios_proteger_admin
    before update or delete on public.usuarios
    for each row
    execute function public.proteger_admin();
