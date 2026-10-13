-- 9 de 13 · sql/01_actualizacion_base_existente.sql · Tiendas sin región (opcional) y usuarios sin región (jperez01) (bloques 31 a 31).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 31. TIENDAS: REGIÓN OPCIONAL Y USUARIOS SIN REGIÓN
--   - Una tienda (sucursal) se puede crear sin región: tiendas.region acepta null.
--     Una tienda sin región la ven el Administrador y el Admin G1 (el Admin G2 solo
--     ve las de su región). La empresa de la tienda sale de quien la crea.
--   - Los usuarios ya NO llevan la región (ni la tienda): todos son nombre + ID de
--     la empresa ("jperez01"). Cambiar la región o la tienda no cambia el usuario.
--     Los que ya existían se renombran UNA sola vez (cenjperez01 -> jperez01; si dos
--     quedarían iguales, al segundo se le agrega un número: jperez201). Marca en
--     configuracion: 'usuarios_sin_region'.
--   - cambiar_region_tienda pone, cambia o quita (vacío/null) la región y no toca a
--     los usuarios. cambiar_codigo_empresa solo cambia el ID de la empresa al final.
--   Se puede repetir.
-- ==================================================

alter table public.tiendas alter column region drop not null;

-- Poner, cambiar o quitar (p_region vacío o null) la región de una tienda
create or replace function public.cambiar_region_tienda(p_tienda_id bigint, p_region text)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_region text := nullif(upper(btrim(coalesce(p_region, ''))), '');
    v_emp_id bigint;
begin
    select t.empresa_id into v_emp_id from public.tiendas t where t.id = p_tienda_id for update;
    if not found then
        raise exception 'La tienda no existe.' using errcode = 'P0002';
    end if;
    if v_region is not null
       and not exists (select 1 from public.regiones g where g.codigo = v_region and g.empresa_id = v_emp_id) then
        raise exception 'Esa región no existe en la empresa.' using errcode = 'P0001';
    end if;
    update public.tiendas set region = v_region
     where id = p_tienda_id and region is distinct from v_region;
end;
$$;

-- Cambiar el ID de una empresa: sus usuarios cambian solo el ID del final (jperez01 -> jperez07)
create or replace function public.cambiar_codigo_empresa(p_empresa_id bigint, p_codigo text)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_viejo text;
    v_nuevo text := btrim(coalesce(p_codigo, ''));
    r       record;
begin
    select codigo into v_viejo from public.empresas where id = p_empresa_id for update;
    if not found then
        raise exception 'La empresa no existe.' using errcode = 'P0002';
    end if;
    if v_viejo = v_nuevo then
        return;
    end if;

    update public.empresas set codigo = v_nuevo where id = p_empresa_id;

    for r in select u.id, u.id_usuario from public.usuarios u
              where u.empresa_id = p_empresa_id and u.id_usuario not in ('admin', 'desar')
              order by u.id loop
        update public.usuarios
           set id_usuario = public.usuario_libre(public.usuario_base(r.id_usuario, v_viejo, null), v_nuevo, null, r.id)
         where id = r.id;
    end loop;
end;
$$;

-- Usuarios de tienda que ya existían: se les quita la región UNA sola vez
do $$
declare
    r    record;
    v_id text;
begin
    if exists (select 1 from public.configuracion where clave = 'usuarios_sin_region') then
        return;
    end if;
    for r in select u.id, u.id_usuario, e.codigo as empresa,
                    case when t.region is not null and left(t.codigo, 3) = t.region then t.codigo else t.region end as tienda
               from public.usuarios u
               join public.tiendas t on t.id = u.tienda_id
               left join public.empresas e on e.id = u.empresa_id
              where u.id_usuario not in ('admin', 'desar')
              order by u.id loop
        v_id := public.usuario_libre(public.usuario_base(r.id_usuario, r.empresa, r.tienda), r.empresa, null, r.id);
        if v_id <> r.id_usuario then
            update public.usuarios set id_usuario = v_id where id = r.id;
        end if;
    end loop;
    insert into public.configuracion (clave, valor) values ('usuarios_sin_region', 'true');
end;
$$;

grant execute on function public.cambiar_region_tienda(bigint, text) to anon;
grant execute on function public.cambiar_codigo_empresa(bigint, text) to anon;

notify pgrst, 'reload schema';



