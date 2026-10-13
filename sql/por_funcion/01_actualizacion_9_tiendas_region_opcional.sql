-- 9 de 9 · sql/01_actualizacion_base_existente.sql · Tiendas sin región (la región es opcional) (bloques 31 a 31).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 31. TIENDAS: LA REGIÓN ES OPCIONAL
--   Una tienda (sucursal) se puede crear sin región. Sus usuarios (G3, Empleado,
--   Piloto) no llevan prefijo de región ("jperez01"); si después se le pone una,
--   se renombran solos ("norjperez01"), y al quitársela pierden el prefijo.
--   Una tienda sin región la ven el Administrador y el Admin G1 (el Admin G2 solo
--   ve las de su región). La empresa de la tienda sale de quien la crea.
--   Se puede repetir.
-- ==================================================

alter table public.tiendas alter column region drop not null;

-- Cambiar (o quitar, p_region vacío o null) la región de una tienda. Todo o nada.
create or replace function public.cambiar_region_tienda(p_tienda_id bigint, p_region text)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_region  text := nullif(btrim(coalesce(p_region, '')), '');
    v_vieja   text;
    v_codigo  text;
    v_emp_id  bigint;
    v_empresa text;
    r         record;
begin
    select t.region, t.codigo, t.empresa_id, e.codigo into v_vieja, v_codigo, v_emp_id, v_empresa
      from public.tiendas t
      left join public.empresas e on e.id = t.empresa_id
     where t.id = p_tienda_id
       for update of t;
    if not found then
        raise exception 'La tienda no existe.' using errcode = 'P0002';
    end if;
    if v_vieja is not distinct from v_region then
        return;
    end if;
    if v_region is not null
       and not exists (select 1 from public.regiones g where g.codigo = v_region and g.empresa_id = v_emp_id) then
        raise exception 'Esa región no existe en la empresa.' using errcode = 'P0001';
    end if;

    update public.tiendas set region = v_region where id = p_tienda_id;

    -- Se quita lo que el usuario llevaba de la tienda (código viejo o región) y se pone la región nueva
    for r in select u.id, u.id_usuario from public.usuarios u
              where u.tienda_id = p_tienda_id and u.id_usuario not in ('admin', 'desar') loop
        update public.usuarios
           set id_usuario = public.usuario_libre(
                   public.usuario_base(r.id_usuario, v_empresa,
                       case when v_vieja is not null and left(v_codigo, 3) = v_vieja then v_codigo else v_vieja end),
                   v_empresa, v_region, r.id)
         where id = r.id;
    end loop;
end;
$$;

grant execute on function public.cambiar_region_tienda(bigint, text) to anon;

notify pgrst, 'reload schema';
