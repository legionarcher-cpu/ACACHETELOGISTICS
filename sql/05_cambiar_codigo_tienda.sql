-- ==================================================
-- CAMBIAR EL CÓDIGO DE UNA TIENDA (y renombrar a sus usuarios)
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez)
--
-- Qué hace: crea la función cambiar_codigo_tienda(id, nuevo_codigo)
-- que la sección Tiendas llama cuando el administrador cambia el
-- código de una tienda. En UNA sola operación:
--   1. Cambia el código y la región de la tienda
--      (ej. CEN-001 -> NOR-005, región CEN -> NOR).
--   2. Renombra a los usuarios de esa tienda
--      (ej. cen-001-jperez -> nor-005-jperez).
-- Si algo falla (ej. el código ya existe), NO se cambia nada.
--
-- Los usuarios renombrados deben iniciar sesión con su usuario nuevo.
--
-- ⚠ Modo rápido: la base de datos no sabe quién la llama; que solo el
-- administrador pueda usarla lo controla la página (Fase 7: pasarlo
-- a una regla real con Supabase Auth).
-- ==================================================

create or replace function public.cambiar_codigo_tienda(p_tienda_id bigint, p_nuevo_codigo text)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_codigo_viejo text;
begin
    -- Código actual (y se "bloquea" la fila mientras se hace el cambio)
    select codigo into v_codigo_viejo
    from public.tiendas
    where id = p_tienda_id
    for update;

    if not found then
        raise exception 'La tienda no existe.' using errcode = 'P0002';
    end if;

    -- Si es el mismo código, no hay nada que hacer
    if v_codigo_viejo = p_nuevo_codigo then
        return;
    end if;

    -- 1. Tienda: código y región (las 3 primeras letras del código).
    --    Las reglas de la tabla validan el formato y que no se repita.
    update public.tiendas
    set codigo = p_nuevo_codigo,
        region = left(p_nuevo_codigo, 3)
    where id = p_tienda_id;

    -- 2. Usuarios de la tienda: se cambia solo el prefijo
    --    "cen-001-jperez" -> "nor-005-" + "jperez"
    update public.usuarios
    set id_usuario = lower(p_nuevo_codigo) || '-' || substr(id_usuario, length(v_codigo_viejo) + 2)
    where tienda_id = p_tienda_id
      and id_usuario like lower(v_codigo_viejo) || '-%';
end;
$$;

-- Permitir que la página (clave pública "anon") use la función (TEMPORAL)
grant execute on function public.cambiar_codigo_tienda(bigint, text) to anon;
