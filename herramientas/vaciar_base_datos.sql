-- ==================================================
-- VACIAR LA BASE DE DATOS (dejarla como recién instalada)
-- ACACHETE LOGISTICS
--
-- ⚠ BORRA TODO y no se puede deshacer: empresas, tiendas, usuarios,
-- vehículos, clientes, rutas, pedidos (con su historial, entregas y
-- evidencias), notificaciones y también la configuración (actividades,
-- tarifas, horarios, regiones...). Los contadores vuelven a empezar
-- (ids y P-000001). La estructura (tablas, funciones, triggers, reglas)
-- NO se toca.
--
-- Cómo usarlo:
--   1. Confirmar en empresas/empresas.js que es la base correcta.
--   2. Supabase -> SQL Editor -> New query -> pegar ESTE archivo -> Run.
--   3. Ejecutar sql/01_actualizacion_base_existente.sql: pone las tablas en
--      su versión más nueva (00 no modifica tablas que ya existen) y vuelve
--      a crear la empresa "01".
--   4. Ejecutar sql/00_instalacion_completa.sql completo: vuelve a cargar
--      los valores de fábrica (desar, admin con clave admin123, regiones,
--      actividades, categorías, pesos, tarifas y horarios de ejemplo).
--   5. Fotos (opcional): las de Storage no se borran por SQL. Supabase ->
--      Storage -> avatares / evidencias -> seleccionar todo -> Delete.
--      Si se quedan no estorban: ningún registro apunta a ellas.
-- ==================================================

do $$
declare
    tablas text;
    s      record;
begin
    -- Todas las tablas de public (también las viejas que ya no se usen)
    select string_agg(format('public.%I', tablename), ', ')
      into tablas
      from pg_tables
     where schemaname = 'public';

    if tablas is not null then
        -- truncate no dispara el trigger proteger_admin: desar y admin se
        -- vuelven a crear en el paso 4
        execute 'truncate table ' || tablas || ' restart identity cascade';
    end if;

    -- Contadores sueltos (ej. pedidos_codigo_seq). Los de las columnas identity
    -- ya los reinició "restart identity" y no se tocan aquí (pg_depend 'i'): antes
    -- ese "alter sequence" podía fallar y deshacía TODO el vaciado.
    for s in select c.relname
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where c.relkind = 'S' and n.nspname = 'public'
                and not exists (select 1 from pg_depend d
                                 where d.objid = c.oid and d.deptype = 'i') loop
        begin
            execute format('alter sequence public.%I restart', s.relname);
        exception when others then
            raise notice 'No se reinició el contador %: %', s.relname, sqlerrm;
        end;
    end loop;
end;
$$;

-- Comprobación: cuenta real de filas de cada tabla (todas deben salir en 0).
-- (Antes se usaban las estadísticas de Postgres, que tardan en actualizarse y
-- mostraban números viejos aunque la tabla ya estuviera vacía.)
select t.tablename as tabla,
       (xpath('/row/n/text()',
              query_to_xml(format('select count(*) as n from public.%I', t.tablename), false, true, '')))[1]::text::bigint as filas
  from pg_tables t
 where t.schemaname = 'public'
 order by 1;
