-- 20 de 22 · sql/01_actualizacion_base_existente.sql · Clientes: persona o empresa, cédula y razón social (bloques 43 a 43).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 43. CLIENTES: PERSONA O EMPRESA, CÉDULA Y RAZÓN SOCIAL
--   Clientes -> Nuevo / Modificar (js/secciones/clientes.js): se elige si el cliente es
--   una PERSONA o una EMPRESA.
--   - tipo:          'persona' (los de antes) | 'empresa'
--   - cedula:        cédula de la persona o cédula jurídica de la empresa
--   - razon_social:  solo empresas (nombre legal). Su nombre y apellidos pasan a ser los
--                    de la persona de contacto (el apellido puede quedar vacío: '')
--   "busqueda" (el buscador de clientes) ahora también lleva la razón social y la cédula.
--   Se puede repetir.
-- ==================================================

alter table public.clientes add column if not exists tipo text not null default 'persona';
alter table public.clientes add column if not exists cedula text;
alter table public.clientes add column if not exists razon_social text;

alter table public.clientes drop constraint if exists clientes_tipo_valido;
alter table public.clientes add constraint clientes_tipo_valido check (tipo in ('persona', 'empresa'));
alter table public.clientes drop constraint if exists clientes_empresa_razon_social;
alter table public.clientes add constraint clientes_empresa_razon_social
    check (tipo <> 'empresa' or nullif(btrim(razon_social), '') is not null);

-- Búsqueda con la razón social y la cédula (se rehace solo si todavía no las tiene)
do $$
begin
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'clientes' and column_name = 'busqueda'
                      and generation_expression like '%razon_social%') then
        alter table public.clientes drop column if exists busqueda;
        alter table public.clientes
            add column busqueda text
                generated always as (lower(translate(
                    nombre || ' ' || apellido1 || ' ' || coalesce(apellido2, '') || ' ' ||
                    coalesce(razon_social, '') || ' ' || coalesce(cedula, '') || ' ' ||
                    coalesce(correo, '') || ' ' || regexp_replace(telefono, '\D', '', 'g'),
                    'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))) stored;
    end if;
end;
$$;

notify pgrst, 'reload schema';


