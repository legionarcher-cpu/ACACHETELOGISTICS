-- ==================================================
-- 00. REINICIAR LA BASE (BORRA TODO)
-- ACACHETE LOGISTICS
--
-- Para qué sirve: dejar el esquema "public" de Supabase VACÍO para instalar el
-- sistema desde cero con los archivos 01 a 12 de esta carpeta.
--
-- ⚠ BORRA TODAS LAS TABLAS, FUNCIONES, VISTAS Y DATOS del sistema (empresas,
--   usuarios, pedidos, viajes, recolecciones...). No se puede deshacer.
--   Solo para una base de PRUEBA o con datos que ya no sirven.
--
-- De lo interno de Supabase solo borra los accesos de los usuarios del sistema
-- (Authentication -> Users, los que terminan en @acachete.interno); el resto de auth,
-- storage y las extensiones no se tocan. Las fotos de los buckets "avatares" y
-- "evidencias" se intentan borrar al final; si Supabase no lo permite desde SQL,
-- sale un aviso: se borran en Storage -> el bucket -> seleccionar todo -> Delete.
--
-- Cómo ejecutarlo: SQL Editor -> New query -> pegar este archivo -> Run.
-- Después: 01_base.sql, 02..., en orden, hasta 12_datos_arranque.sql.
-- ==================================================

do $$
declare
    r record;
begin
    -- Vistas
    for r in select c.oid::regclass as nombre
               from pg_class c
              where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
                and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
        execute format('drop view if exists %s cascade', r.nombre);
    end loop;

    -- Tablas (con sus índices, reglas y triggers)
    for r in select c.oid::regclass as nombre
               from pg_class c
              where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
                and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
        execute format('drop table if exists %s cascade', r.nombre);
    end loop;

    -- Secuencias sueltas (números de pedido, viaje, recolección...)
    for r in select c.oid::regclass as nombre
               from pg_class c
              where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
                and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
        execute format('drop sequence if exists %s cascade', r.nombre);
    end loop;

    -- Funciones (las de las extensiones no se tocan)
    for r in select p.oid::regprocedure as firma
               from pg_proc p
              where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
                and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
        execute format('drop function if exists %s cascade', r.firma);
    end loop;

    -- Reglas de las fotos (las vuelve a crear 11_acceso_web.sql)
    for r in select policyname from pg_policies
              where schemaname = 'storage' and tablename = 'objects'
                and (policyname like 'TEMPORAL - %' or policyname like 'ACACHETE - %') loop
        execute format('drop policy %I on storage.objects', r.policyname);
    end loop;
end;
$$;

-- Accesos de los usuarios del sistema en Supabase Auth (12_datos_arranque.sql crea de nuevo desar y admin)
delete from auth.users where email like '%@acachete.interno';

-- Fotos de ejemplo (usuarios y evidencias de entregas)
do $$
begin
    delete from storage.objects where bucket_id in ('avatares', 'evidencias');
exception when others then
    raise notice 'Las fotos no se pudieron borrar desde SQL (%). Bórrelas en Storage -> avatares / evidencias.', sqlerrm;
end;
$$;

notify pgrst, 'reload schema';
