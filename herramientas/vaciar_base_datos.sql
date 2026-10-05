-- ==================================================
-- VACIAR LA BASE DE DATOS (una empresa o toda la base)
-- ACACHETE LOGISTICS
--
-- ⚠ BORRA y no se puede deshacer. PRIMERO se elige QUÉ empresa se limpia
-- (paso 1, abajo); si no se escribe, el script se detiene sin borrar nada.
--
-- MODO EMPRESA (lo normal): se escribe el ID de la empresa ('01', '02'...,
-- Tiendas -> Empresas) y, para confirmar, su nombre EXACTO. Se borra SOLO lo de
-- esa empresa: pedidos (con historial, entregas y evidencias), viajes y
-- cortesías, clientes, rutas, vehículos, usuarios (y sus notificaciones y
-- marcas), tiendas, regiones, tarifas, descuentos, categorías de mercadería y
-- su configuración de transporte. Las demás empresas NO se tocan.
--   - Lo que es de TODO el sistema no se borra: actividades, horarios, slots,
--     tamaños de bulto, motivos de retraso y la tabla configuracion.
--   - conservar_administradores = true: quedan sus usuarios Administrador
--     (para volver a entrar y cargar datos nuevos). El usuario "admin" y el
--     "desar" nunca se borran en este modo.
--   - borrar_empresa = true: al final borra también la empresa (desaparece de
--     Tiendas -> Empresas). Si conserva administradores, la empresa se queda.
--
-- MODO TODA LA BASE: empresa = 'TODAS' y confirmar = 'BORRAR TODO'. Deja la
-- base como recién instalada (todas las empresas, configuración incluida).
-- Después:
--   1. Ejecutar sql/01_actualizacion_base_existente.sql (vuelve a crear la
--      empresa "01").
--   2. Ejecutar sql/00_instalacion_completa.sql completo (desar, admin con
--      clave admin123, regiones, actividades, tarifas y horarios de ejemplo).
--
-- Cómo usarlo:
--   1. Confirmar en empresas/empresas.js que es la base correcta.
--   2. Escribir la empresa y la confirmación en el PASO 1 de abajo.
--   3. Supabase -> SQL Editor -> New query -> pegar ESTE archivo -> Run.
--   4. Fotos (opcional): las de Storage no se borran por SQL. Supabase ->
--      Storage -> avatares / evidencias. Si se quedan no estorban.
-- ==================================================

do $$
declare
    -- ============ PASO 1: QUÉ SE VA A LIMPIAR (escribir aquí) ============
    empresa                   text    := '';     -- ID de la empresa: '01', '02'... o 'TODAS'
    confirmar                 text    := '';     -- su nombre EXACTO (Tiendas -> Empresas) o 'BORRAR TODO'
    conservar_administradores boolean := true;   -- deja los usuarios Administrador de la empresa
    borrar_empresa            boolean := false;  -- borra también la empresa (solo si no conserva administradores)
    -- =====================================================================

    v_id      bigint;
    v_nombre  text;
    tablas    text;
    s         record;
    n         bigint;   -- filas borradas (se muestran en "Messages")
begin
    empresa := btrim(coalesce(empresa, ''));
    confirmar := btrim(coalesce(confirmar, ''));

    if empresa = '' then
        raise exception 'No se borró nada: escriba en el PASO 1 el ID de la empresa que quiere limpiar (ej. ''02'') y su nombre en "confirmar".';
    end if;

    -- ---------- TODA LA BASE ----------
    if upper(empresa) = 'TODAS' then
        if confirmar <> 'BORRAR TODO' then
            raise exception 'No se borró nada: para vaciar TODA la base escriba confirmar := ''BORRAR TODO''.';
        end if;

        select string_agg(format('public.%I', tablename), ', ')
          into tablas
          from pg_tables
         where schemaname = 'public';

        if tablas is not null then
            -- truncate no dispara el trigger proteger_admin: desar y admin se
            -- vuelven a crear con sql/00
            execute 'truncate table ' || tablas || ' restart identity cascade';
        end if;

        -- Contadores sueltos (ej. pedidos_codigo_seq). Los de las columnas identity
        -- ya los reinició "restart identity" (pg_depend 'i').
        for s in select c.relname
                   from pg_class c
                   join pg_namespace ns on ns.oid = c.relnamespace
                  where c.relkind = 'S' and ns.nspname = 'public'
                    and not exists (select 1 from pg_depend d
                                     where d.objid = c.oid and d.deptype = 'i') loop
            begin
                execute format('alter sequence public.%I restart', s.relname);
            exception when others then
                raise notice 'No se reinició el contador %: %', s.relname, sqlerrm;
            end;
        end loop;

        raise notice 'Base vaciada por completo. Ahora ejecute sql/01 y luego sql/00.';
        return;
    end if;

    -- ---------- UNA EMPRESA ----------
    select e.id, e.nombre into v_id, v_nombre from public.empresas e where e.codigo = empresa;
    if v_id is null then
        raise exception 'No se borró nada: no existe la empresa con ID "%". Revise Tiendas -> Empresas.', empresa;
    end if;
    if confirmar <> v_nombre then
        raise exception 'No se borró nada: para limpiar la empresa % escriba en "confirmar" su nombre exacto: "%".', empresa, v_nombre;
    end if;

    raise notice 'Limpiando la empresa % (%)...', empresa, v_nombre;

    -- Viajes y cortesías (se apuntan entre sí con "on delete set null")
    if to_regclass('public.viajes') is not null then
        delete from public.viajes where empresa_id = v_id;
        get diagnostics n = row_count; raise notice '  viajes: %', n;
        delete from public.cortesias where empresa_id = v_id;
        get diagnostics n = row_count; raise notice '  cortesías: %', n;
    end if;

    -- Pedidos (su historial, artículos, entregas y evidencias se van con ellos)
    delete from public.pedidos where empresa_id = v_id;
    get diagnostics n = row_count; raise notice '  pedidos: %', n;

    -- Rutas (y sus pilotos por ruta)
    delete from public.rutas where empresa_id = v_id;
    get diagnostics n = row_count; raise notice '  rutas: %', n;

    -- Usuarios (sus notificaciones, marcas y QR del día se van con ellos).
    -- "admin" y "desar" nunca; los Administradores si se conservan.
    delete from public.usuarios
     where empresa_id = v_id
       and id_usuario not in ('admin', 'desar')
       and (not conservar_administradores or rol <> 'administrador');
    get diagnostics n = row_count; raise notice '  usuarios: %', n;

    -- Clientes (sus tiendas y su usuario de viajes se van con ellos)
    delete from public.clientes where empresa_id = v_id;
    get diagnostics n = row_count; raise notice '  clientes: %', n;

    -- Configuración de transporte de la empresa
    if to_regclass('public.transporte_costos') is not null then
        delete from public.transporte_costos where empresa_id = v_id;
        delete from public.transporte_franjas where empresa_id = v_id;
        delete from public.transporte_dias_cerrados where empresa_id = v_id;
        delete from public.transporte_config where empresa_id = v_id;
    end if;

    delete from public.vehiculos where empresa_id = v_id;
    get diagnostics n = row_count; raise notice '  vehículos: %', n;
    delete from public.tarifas where empresa_id = v_id;
    delete from public.descuentos where empresa_id = v_id;
    -- Categorías de mercadería (sus artículos frecuentes se van con ellas)
    delete from public.categorias_mercaderia where empresa_id = v_id;

    -- Tiendas y regiones (sus marcas, capacidades y QR se van con ellas)
    delete from public.tiendas where empresa_id = v_id;
    get diagnostics n = row_count; raise notice '  tiendas: %', n;
    delete from public.regiones where empresa_id = v_id;
    get diagnostics n = row_count; raise notice '  regiones: %', n;

    -- La empresa misma (solo si ya no le queda ningún usuario)
    if borrar_empresa then
        if exists (select 1 from public.usuarios where empresa_id = v_id) then
            raise notice 'La empresa % se conserva: todavía tiene usuarios (Administradores o "admin").', empresa;
        else
            delete from public.empresas where id = v_id;
            raise notice 'Empresa % borrada.', empresa;
        end if;
    end if;

    raise notice 'Listo: la empresa % (%) quedó limpia. Las demás empresas no se tocaron.', empresa, v_nombre;
end;
$$;

-- Comprobación: filas que quedan por empresa en las tablas principales
select e.codigo as empresa, e.nombre,
       (select count(*) from public.tiendas   t where t.empresa_id = e.id) as tiendas,
       (select count(*) from public.usuarios  u where u.empresa_id = e.id) as usuarios,
       (select count(*) from public.clientes  c where c.empresa_id = e.id) as clientes,
       (select count(*) from public.pedidos   p where p.empresa_id = e.id) as pedidos,
       (select count(*) from public.vehiculos v where v.empresa_id = e.id) as vehiculos
  from public.empresas e
 order by e.codigo;
