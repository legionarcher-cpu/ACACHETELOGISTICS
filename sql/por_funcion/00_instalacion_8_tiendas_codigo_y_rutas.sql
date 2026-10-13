-- 8 de 15 · sql/00_instalacion_completa.sql · Código de tienda libre (sin región) y tiendas con o sin rutas (secciones 21 a 21).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 21. TIENDAS: CÓDIGO LIBRE (NO DEPENDE DE LA REGIÓN) Y CON O SIN RUTAS (sql/01 bloque 28)
--   - El código de la tienda (sucursal) ya no es "REGIÓN-NÚMERO": es libre
--     (letras, números y guion; ej. CEN-001, SUC-CENTRO, 25). La región se elige
--     aparte. Las tiendas que ya existían no cambian.
--   - Cambiar el código (cambiar_codigo_tienda) ya NO cambia la región ni los
--     usuarios. Cambiar la región (cambiar_region_tienda) renombra a sus usuarios,
--     porque el usuario de G3, Empleado y Piloto lleva la REGIÓN (cenjperez01 ->
--     norjperez01).
--   - tiendas.usa_rutas: si la tienda envía pedidos (tiene rutas). Una tienda sin
--     rutas no aparece para crear pedidos, rutas ni bodegas del día.
--   Se puede repetir.
-- ==================================================

alter table public.tiendas drop constraint if exists tiendas_codigo_formato;
alter table public.tiendas drop constraint if exists tiendas_codigo_region;
alter table public.tiendas add constraint tiendas_codigo_formato check (codigo ~ '^[A-Z0-9][A-Z0-9-]{0,19}$');

alter table public.tiendas add column if not exists usa_rutas boolean not null default true;

-- Cambiar SOLO el código de una tienda (no cambia la región ni los usuarios)
create or replace function public.cambiar_codigo_tienda(p_tienda_id bigint, p_nuevo_codigo text)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_codigo text := upper(btrim(coalesce(p_nuevo_codigo, '')));
begin
    if not exists (select 1 from public.tiendas where id = p_tienda_id) then
        raise exception 'La tienda no existe.' using errcode = 'P0002';
    end if;
    update public.tiendas set codigo = v_codigo where id = p_tienda_id and codigo <> v_codigo;
end;
$$;

-- Cambiar la región de una tienda: sus usuarios (G3, Empleado, Piloto) llevan la región
-- y se renombran solos (cenjperez01 -> norjperez01). Todo o nada.
create or replace function public.cambiar_region_tienda(p_tienda_id bigint, p_region text)
returns void
language plpgsql
set search_path = ''
as $$
declare
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
    if v_vieja = p_region then
        return;
    end if;
    if not exists (select 1 from public.regiones g where g.codigo = p_region and g.empresa_id = v_emp_id) then
        raise exception 'Esa región no existe en la empresa.' using errcode = 'P0001';
    end if;

    update public.tiendas set region = p_region where id = p_tienda_id;

    for r in select u.id, u.id_usuario from public.usuarios u
              where u.tienda_id = p_tienda_id and u.id_usuario not in ('admin', 'desar') loop
        update public.usuarios
           set id_usuario = public.usuario_libre(
                   public.usuario_base(r.id_usuario, v_empresa, case when left(v_codigo, 3) = v_vieja then v_codigo else v_vieja end),
                   v_empresa, p_region, r.id)
         where id = r.id;
    end loop;
end;
$$;

-- Cambiar el ID de una empresa: sus usuarios de tienda llevan la REGIÓN de su tienda
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

    for r in select u.id, u.id_usuario, t.region,
                    case when left(t.codigo, 3) = t.region then t.codigo else t.region end as tienda
               from public.usuarios u
               left join public.tiendas t on t.id = u.tienda_id
              where u.empresa_id = p_empresa_id
                and u.id_usuario not in ('admin', 'desar') loop
        update public.usuarios
           set id_usuario = public.usuario_libre(public.usuario_base(r.id_usuario, v_viejo, r.tienda), v_nuevo, r.region, r.id)
         where id = r.id;
    end loop;
end;
$$;

grant execute on function public.cambiar_codigo_tienda(bigint, text) to anon;
grant execute on function public.cambiar_region_tienda(bigint, text) to anon;
grant execute on function public.cambiar_codigo_empresa(bigint, text) to anon;

notify pgrst, 'reload schema';



