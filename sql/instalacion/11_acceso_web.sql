-- ==================================================
-- 11. ACCESO DESDE LA WEB (REGLAS RLS) Y ARCHIVOS
-- ACACHETE LOGISTICS
--
-- Quién puede leer y cambiar cada tabla. La página entra con Supabase Auth: cada
-- consulta va con la sesión del usuario ("authenticated") y la base decide qué filas ve.
--   - Sin sesión (clave pública "anon"): NADA, salvo el registro de clientes, la
--     ubicación compartida por enlace y la lista de actividades.
--   - Cada empresa ve y cambia SOLO lo suyo.
--   - El Desarrollador ve la configuración y los usuarios de todas las empresas. La cambia
--     mientras la empresa no tenga Admin TI (puesta en marcha). Los datos (clientes, pedidos,
--     viajes, inventario, precios, cajas) los ve y los corrige solo con la llave de soporte
--     que le da la empresa (01_base.sql: soporte_empresas). Lo que cambia queda en la bitácora.
--   - El cliente (rol cliente) ve solo lo suyo: su ficha, sus viajes, sus envíos, sus
--     recolecciones y sus cobros, más los catálogos que necesita para pedir.
--   - Las tablas de movimientos (viajes, cajas, bodegas, marcas...) solo se cambian con
--     las funciones de cada módulo, que revisan quién es y qué puede hacer.
--   - Usuarios: lo revisa la base (01_base.sql, usuarios_revisar_cambio): nadie se sube
--     de rol ni toca usuarios fuera de su alcance.
--   - Pedidos y cierres de caja: cada uno lo de su alcance (G2 su región, G3 y Empleado su
--     tienda, Piloto los suyos). Clientes y usuarios se ven en toda la empresa.
--   - Catálogos y configuración: los cambia quien tiene la función (puede('...'), tablas
--     funciones y usuario_funciones de 01_base.sql).
-- Ejecutar DESPUÉS de los módulos 01 a 10. Se puede repetir.
-- ==================================================

-- RLS encendido en TODAS las tablas del sistema (sin regla = sin acceso desde la web)
do $$
declare
    r record;
begin
    for r in select tablename from pg_tables where schemaname = 'public' loop
        execute format('alter table public.%I enable row level security', r.tablename);
    end loop;
end;
$$;

-- Reglas de una tabla para el usuario con sesión. Borra las que tenga y crea:
--   "leer"   -> select con p_leer
--   "crear", "cambiar", "borrar" -> con p_escribir (si es null, no se crean: solo leer)
-- Qué comandos existen lo dicen además los permisos (grant) de más abajo.
create or replace function public.reglas_tabla(p_tabla text, p_leer text, p_escribir text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
    r record;
begin
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = p_tabla loop
        execute format('drop policy %I on public.%I', r.policyname, p_tabla);
    end loop;
    execute format('create policy "leer" on public.%I for select to authenticated using (%s)', p_tabla, p_leer);
    if p_escribir is not null then
        execute format('create policy "crear" on public.%I for insert to authenticated with check (%s)', p_tabla, p_escribir);
        execute format('create policy "cambiar" on public.%I for update to authenticated using (%s) with check (%s)',
                       p_tabla, p_escribir, p_escribir);
        execute format('create policy "borrar" on public.%I for delete to authenticated using (%s)', p_tabla, p_escribir);
    end if;
end;
$$;

do $$
declare
    -- De su empresa. "(select ...)" hace que se calcule una vez por consulta. El Desarrollador:
    --   v_emp     ver la configuración: todas las empresas
    --   v_emp_cfg cambiar la configuración: en la puesta en marcha o con llave "Ver y corregir"
    --   v_emp_ver ver los datos: con llave
    --   v_emp_cor cambiar los datos: con llave "Ver y corregir"
    v_emp     constant text := '(empresa_id = (select public.mi_empresa()) or (select public.es_desarrollador()))';
    v_emp_cfg constant text := '(empresa_id = (select public.mi_empresa()) or empresa_id in (select public.soporte_empresas(''config'')))';
    v_emp_ver constant text := '(empresa_id = (select public.mi_empresa()) or empresa_id in (select public.soporte_empresas(''ver'')))';
    v_emp_cor constant text := '(empresa_id = (select public.mi_empresa()) or empresa_id in (select public.soporte_empresas(''corregir'')))';
    -- Solo el personal de la empresa (no el rol cliente), con cada una de las de arriba
    v_pers    constant text := '(select public.es_personal())';
    v_per     constant text := '(' || v_pers || ' and ' || v_emp || ')';
    v_per_cfg constant text := '(' || v_pers || ' and ' || v_emp_cfg || ')';
    v_per_ver constant text := '(' || v_pers || ' and ' || v_emp_ver || ')';
    v_per_cor constant text := '(' || v_pers || ' and ' || v_emp_cor || ')';
    -- Lo del cliente conectado
    v_cli  constant text := '(cliente_id = (select public.mi_cliente()))';
    v_dev  constant text := '(select public.es_desarrollador())';
    -- Quien tiene una función (Usuarios -> "Módulos y funciones"; el Administrador las tiene todas)
    v_cfg  constant text := '(select public.puede(''configuracion.general''))';
    -- Admin G2 en lo de su región (columna region o tienda de su región)
    v_g2   constant text := '((select public.mi_rol()) = ''admin_g2'' and (region = (select public.mi_region())'
                            || ' or tienda_id in (select public.mis_tiendas())))';
    -- Pedidos y cajas de su alcance: Administrador y G1 todo; G2 su región; G3 y Empleado su
    -- tienda (y los pilotos de su tienda, aunque lleven pedidos de otra); Piloto los suyos
    v_alc  constant text := '((select public.ve_toda_la_empresa()) or tienda_id in (select public.mis_tiendas())'
                            || ' or piloto_id in (select public.mis_pilotos()) or piloto_id = (select public.yo()))';
    t text;
begin
    -- Catálogos y ajustes de la empresa: los ve también el cliente (para pedir).
    -- Los cambia quien tiene "Cambiar la configuración" (configuracion.general)...
    foreach t in array array[
        'motivos_retraso', 'horarios_dias', 'horarios', 'configuracion',
        'transporte_config', 'transporte_franjas', 'transporte_dias_cerrados', 'categorias_mercaderia'
    ] loop
        perform public.reglas_tabla(t, v_emp, '(' || v_per_cfg || ' and ' || v_cfg || ')');
    end loop;
    -- ... o el G2 en lo de su región (Configuración -> Pedidos y Horarios)
    foreach t in array array['tarifas', 'horarios_capacidad'] loop
        perform public.reglas_tabla(t, v_emp, '(' || v_per_cfg || ' and (' || v_cfg || ' or ' || v_g2 || '))');
    end loop;
    perform public.reglas_tabla('descuentos', v_emp, '(' || v_per_cfg || ' and (' || v_cfg
        || ' or ((select public.mi_rol()) = ''admin_g2'' and region = (select public.mi_region()))))');
    -- Vehículos: Configuración (el G2 modifica los de su región) y Usuarios (vehículo del piloto nuevo)
    perform public.reglas_tabla('vehiculos', v_emp, '(' || v_per_cfg || ' and (' || v_cfg
        || ' or (select public.mi_rol()) = ''admin_g2'' or (select public.puede(''usuarios.crear''))'
        || ' or (select public.puede(''usuarios.modificar''))))');
    -- Regiones: Tiendas -> Regiones. Tiendas: varias secciones guardan datos de la tienda (ubicación,
    -- lista de precios), así que la cambia el personal de la empresa.
    perform public.reglas_tabla('regiones', v_emp, '(' || v_per_cfg || ' and (select public.puede(''tiendas.gestionar'')))');
    perform public.reglas_tabla('tiendas', v_emp, v_per_cfg);
    -- Horario de servicio de las recolecciones: quien las atiende (o Configuración)
    perform public.reglas_tabla('recoleccion_config', v_emp, '(' || v_per_cfg || ' and ((select public.puede(''recolecciones.atender''))'
        || ' or ' || v_cfg || '))');

    -- Configuración que ve solo el personal de la empresa; se cambia con su función
    foreach t in array array['costos_config', 'cajas', 'transporte_bloqueos'] loop
        perform public.reglas_tabla(t, v_per, '(' || v_per_cfg || ' and ' || v_cfg || ')');
    end loop;
    perform public.reglas_tabla('motivos_entrega_parcial', v_per, '(' || v_per_cfg || ' and ((select public.puede(''distribucion.catalogo''))'
        || ' or ' || v_cfg || '))');
    perform public.reglas_tabla('rutas', v_per, '(' || v_per_cfg || ' and (select public.puede(''rutas.gestionar'')))');
    perform public.reglas_tabla('recoleccion_bloqueos', v_per, '(' || v_per_cfg || ' and (select public.puede(''recolecciones.atender'')))');

    -- Datos que ve solo el personal de la empresa (el Desarrollador, con la llave); se cambian con su función
    perform public.reglas_tabla('costos_operacion', v_per_ver, '(' || v_per_cor || ' and ' || v_cfg || ')');
    foreach t in array array['productos', 'producto_presentaciones', 'listas_precios', 'precios'] loop
        perform public.reglas_tabla(t, v_per_ver, '(' || v_per_cor || ' and ((select public.puede(''distribucion.catalogo''))'
            || ' or ' || v_cfg || '))');
    end loop;

    -- Solo el personal: ver (se cambian con las funciones de cada módulo)
    foreach t in array array['ubicaciones_pilotos', 'bodegas_dia', 'bodega_movimientos', 'cierres_mercaderia'] loop
        perform public.reglas_tabla(t, v_per_ver);
    end loop;
    perform public.reglas_tabla('cierres_caja', '(' || v_per_ver || ' and ' || v_alc || ')');

    -- El personal todo lo de la empresa; el cliente, lo suyo. (Clientes: en toda la empresa, así
    -- se encuentra al cliente aunque se haya registrado en otra tienda.)
    perform public.reglas_tabla('clientes', '(' || v_per_ver || ' or id = (select public.mi_cliente()))', v_per_cor);
    -- Pedidos: el personal los de su alcance; el cliente, los suyos
    perform public.reglas_tabla('pedidos', '((' || v_per_ver || ' and ' || v_alc || ') or ' || v_cli || ')',
        '(' || v_per_cor || ' and ' || v_alc || ')');
    foreach t in array array['recoleccion_tarifas', 'recoleccion_cargos'] loop
        perform public.reglas_tabla(t, '(' || v_per_ver || ' or ' || v_cli || ')',
            '(' || v_per_cor || ' and (select public.puede(''recolecciones.cobrar'')))');
    end loop;
    -- Viajes: el conductor (piloto) ve los suyos; el resto del personal, todos
    perform public.reglas_tabla('viajes', '((' || v_per_ver || ' and ((select public.mi_rol()) <> ''piloto'''
        || ' or conductor_id = (select public.yo()))) or ' || v_cli || ')');
    foreach t in array array['cortesias', 'recolecciones'] loop
        perform public.reglas_tabla(t, '(' || v_per_ver || ' or ' || v_cli || ')');
    end loop;

    -- Solicitudes de envío: el cliente crea las suyas y las cancela mientras están pendientes
    -- (lo demás lo revisa pedido_solicitudes_revisar_cliente, 04_rutas_y_pedidos.sql)
    perform public.reglas_tabla('pedido_solicitudes', '(' || v_per_ver || ' or ' || v_cli || ')',
        '(' || v_per_cor || ' or (' || v_cli || ' and empresa_id = (select public.mi_empresa())))');

    -- Partes de otra tabla: se ven si se ve la fila de la que dependen (y su regla ya filtra).
    -- Para cambiarlas, la fila de la que dependen debe ser de una empresa que se puede cambiar
    -- (x.empresa_id: las mismas reglas de arriba con la empresa de esa fila).
    perform public.reglas_tabla('clientes_tiendas',
        'exists (select 1 from public.clientes x where x.id = cliente_id)',
        v_pers || ' and exists (select 1 from public.clientes x where x.id = cliente_id and '
            || replace(v_emp_cor, 'empresa_id', 'x.empresa_id') || ')');
    perform public.reglas_tabla('articulos_catalogo',
        'exists (select 1 from public.categorias_mercaderia x where x.id = categoria_id)',
        v_pers || ' and ' || v_cfg || ' and exists (select 1 from public.categorias_mercaderia x where x.id = categoria_id and '
            || replace(v_emp_cfg, 'empresa_id', 'x.empresa_id') || ')');
    -- Pilotos de cada ruta: Rutas y Usuarios (al cambiar o borrar un piloto)
    perform public.reglas_tabla('rutas_pilotos',
        'exists (select 1 from public.rutas x where x.id = ruta_id)',
        v_pers || ' and ((select public.puede(''rutas.gestionar'')) or (select public.puede(''usuarios.modificar'')))'
        || ' and exists (select 1 from public.rutas x where x.id = ruta_id and '
            || replace(v_emp_cfg, 'empresa_id', 'x.empresa_id') || ')');
    foreach t in array array['pedido_articulos', 'pedido_entregas', 'pedido_evidencias', 'pedido_historial', 'pedido_productos'] loop
        perform public.reglas_tabla(t,
            'exists (select 1 from public.pedidos x where x.id = pedido_id)',
            v_pers || ' and exists (select 1 from public.pedidos x where x.id = pedido_id and '
                || replace(v_emp_cor, 'empresa_id', 'x.empresa_id') || ')');
    end loop;
    -- Marcas y QR del día de los pilotos: el personal de su empresa (se escriben con funciones)
    foreach t in array array['marcas_piloto', 'pilotos_dia'] loop
        perform public.reglas_tabla(t, v_pers || ' and exists (select 1 from public.usuarios x where x.id = piloto_id and '
            || replace(v_emp_ver, 'empresa_id', 'x.empresa_id') || ')');
    end loop;

    -- Empresas: cada uno la suya; crear y cambiar solo el Desarrollador (el plan y si está activa,
    -- siempre; lo demás lo revisa empresas_revisar_cambio, 01_base.sql); borrar, en la puesta en
    -- marcha o con la llave "Ver y corregir".
    -- (Se mira la empresa de su usuario aunque esté inactiva: así el login puede avisar.)
    perform public.reglas_tabla('empresas',
        '(id = (select u.empresa_id from public.usuarios u where u.auth_id = (select auth.uid())) or ' || v_dev || ')');
    create policy "crear" on public.empresas for insert to authenticated with check ((select public.es_desarrollador()));
    create policy "cambiar" on public.empresas for update to authenticated
        using ((select public.es_desarrollador())) with check ((select public.es_desarrollador()));
    create policy "borrar" on public.empresas for delete to authenticated
        using (id in (select public.soporte_empresas('config')));

    -- Actividades, tamaños de bulto y el catálogo de módulos y funciones: son de todo el sistema.
    -- Todos leen; solo el Desarrollador cambia.
    perform public.reglas_tabla('actividades', 'true', v_dev);
    perform public.reglas_tabla('tamanos_bulto', 'true', v_dev);
    perform public.reglas_tabla('funciones', 'true', v_dev);
    -- Lo que se le dio o quitó a cada usuario: él mismo y el personal de su empresa lo ven;
    -- se guarda solo con usuario_guardar_funciones (01_base.sql)
    perform public.reglas_tabla('usuario_funciones',
        '(usuario_id = (select public.yo()) or (' || v_pers || ' and exists (select 1 from public.usuarios x where x.id = usuario_id)))');

    -- Usuarios: cada uno se ve a sí mismo (aunque esté sin aprobar: el login lo avisa); el
    -- personal ve los de su empresa (el Desarrollador, el personal de todas; las cuentas de los
    -- clientes, con la llave); el cliente, además, al conductor de sus viajes (nombre y teléfono
    -- en Viajes). Quién cambia a quién lo revisa usuarios_revisar_cambio; el Desarrollador los
    -- cambia en la puesta en marcha o con llave "Ver y corregir" (bloquear, desbloquear y cerrar
    -- sesiones: soporte_emergencia, sin llave).
    perform public.reglas_tabla('usuarios',
        '(auth_id = (select auth.uid()) or (' || v_per || ' and rol <> ''cliente'') or ' || v_per_ver
            || ' or exists (select 1 from public.viajes v where v.conductor_id = usuarios.id'
            || ' and v.cliente_id = (select public.mi_cliente())))',
        '(' || v_per_cfg || ' or auth_id = (select auth.uid()))');

    -- Avisos: cada uno ve, marca y borra los suyos; el personal avisa a los de su empresa
    perform public.reglas_tabla('notificaciones', 'usuario_id = (select public.yo())');
    create policy "crear" on public.notificaciones for insert to authenticated
        with check ((select public.es_personal()) and exists (select 1 from public.usuarios x where x.id = usuario_id));
    create policy "cambiar" on public.notificaciones for update to authenticated
        using (usuario_id = (select public.yo())) with check (usuario_id = (select public.yo()));
    create policy "borrar" on public.notificaciones for delete to authenticated
        using (usuario_id = (select public.yo()));
    -- Bitácora de soporte: la ve el Admin TI y el Administrador de la empresa (y cada uno lo que
    -- hizo él); nadie la cambia (se escribe con las funciones soporte_*)
    perform public.reglas_tabla('soporte_bitacora',
        '((empresa_id = (select public.mi_empresa()) and (select public.es_admin_ti())) or usuario_id = (select public.yo()))');
    -- Sin regla (solo por funciones): visitas, QR fijo de las tiendas, ubicaciones compartidas y
    -- llaves de soporte (soporte_crear_llave, soporte_llaves_empresa...)
    foreach t in array array['visitas', 'qr_tiendas_fijo', 'ubicaciones_compartidas', 'soporte_llaves'] loop
        perform public.reglas_tabla(t, 'false');
    end loop;
end;
$$;

-- Bitácora de soporte: todo lo que crea, cambia o borra el Desarrollador, en todas las tablas
-- (01_base.sql: soporte_anotar_cambio). Se pone aquí porque ya existen todas las tablas.
do $$
declare
    r record;
begin
    for r in select tablename from pg_tables
              where schemaname = 'public'
                and tablename not in ('soporte_bitacora', 'soporte_llaves', 'visitas', 'notificaciones', 'ubicaciones_compartidas') loop
        execute format('drop trigger if exists soporte_anotar on public.%I', r.tablename);
        execute format('create trigger soporte_anotar after insert or update or delete on public.%I '
                       'for each row execute function public.soporte_anotar_cambio()', r.tablename);
    end loop;
end;
$$;


-- ==================================================
-- PERMISOS DE LAS TABLAS
-- ==================================================

-- Sin sesión: nada (salvo la lista de actividades, que la página lee al abrir)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select on public.actividades to anon;
create policy "leer sin sesion" on public.actividades for select to anon using (activa);

-- Con sesión: lo que digan las reglas de arriba
revoke all on all tables in schema public from authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- SOLO leer: se escriben con las funciones de cada módulo
revoke insert, update, delete on public.marcas_piloto, public.pilotos_dia, public.viajes, public.cortesias,
    public.cierres_caja, public.ubicaciones_pilotos, public.bodegas_dia, public.bodega_movimientos,
    public.cierres_mercaderia, public.recolecciones, public.usuario_funciones from authenticated;
-- Pedidos, entregas, evidencias y ajustes: nunca se borran desde la página
revoke delete on public.pedidos, public.pedido_entregas, public.pedido_evidencias, public.configuracion from authenticated;
-- Historial: solo leer y agregar
revoke update, delete on public.pedido_historial from authenticated;
-- Soporte: la bitácora solo se lee; las llaves, solo por sus funciones
revoke insert, update, delete on public.soporte_bitacora from authenticated;
revoke all on public.soporte_llaves from authenticated;
-- Productos del pedido: se crean con el pedido; lo entregado lo pone dist_entregar
revoke update on public.pedido_productos from authenticated;
-- Sin acceso directo (solo por funciones)
revoke all on public.visitas, public.qr_tiendas_fijo, public.ubicaciones_compartidas from authenticated;

-- Vistas del calculador interno (ven solo lo que el usuario puede ver: security_invoker)
revoke insert, update, delete on public.pedidos_pasos, public.pedidos_tiempos, public.slots_carga from authenticated;

-- La página no puede LEER la columna clave de usuarios (siempre vacía, pero por si acaso)
select public.usuarios_ocultar_clave();

-- Lo que se cree después (archivos de sql/actualizaciones) no queda abierto a la clave pública
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;


-- ==================================================
-- FUNCIONES QUE SE PUEDEN LLAMAR
-- Con sesión: todas, salvo las internas de abajo (cada una revisa quién llama:
-- usuario_activo confirma que el usuario que manda la página es el de la sesión).
-- Sin sesión: solo el registro de clientes y la ubicación compartida por enlace.
-- ==================================================

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- Sin sesión
grant execute on function public.ahora_local() to anon;
grant execute on function public.registro_clientes_empresa(text) to anon;
grant execute on function public.solicitar_acceso_cliente(jsonb) to anon;
grant execute on function public.ubicacion_ver(text) to anon;
grant execute on function public.ubicacion_guardar(text, numeric, numeric, integer) to anon;

-- Internas: no se llaman desde la página
revoke execute on function public.reglas_tabla(text, text, text) from authenticated;
revoke execute on function public.usuarios_ocultar_clave() from authenticated;
revoke execute on function public.usuario_activo(bigint) from authenticated;
revoke execute on function public.avisar_aprobadores(bigint, bigint, text, bigint, text, text, text) from authenticated;
revoke execute on function public.puede_tienda(public.usuarios, bigint) from authenticated;
revoke execute on function public.pedido_en_alcance(public.usuarios, public.pedidos) from authenticated;
revoke execute on function public.ubicacion_puede_tienda(public.usuarios, bigint) from authenticated;
revoke execute on function public.piloto_horario_abierto(bigint) from authenticated;
revoke execute on function public.transporte_cfg(bigint) from authenticated;
revoke execute on function public.viaje_validar_inicio(bigint, timestamptz) from authenticated;
revoke execute on function public.viaje_bloqueo(bigint, timestamptz, timestamptz) from authenticated;
revoke execute on function public.viaje_avisar(bigint, text, text, bigint) from authenticated;
revoke execute on function public.viaje_avisar_conductor(bigint) from authenticated;
revoke execute on function public.viaje_cerrar_avisos(bigint) from authenticated;
revoke execute on function public.viaje_reasignar(bigint, boolean, boolean) from authenticated;
revoke execute on function public.viaje_json(bigint) from authenticated;
revoke execute on function public.cortesia_revisar(bigint, bigint) from authenticated;
revoke execute on function public.dist_bodega_del_piloto(bigint, bigint) from authenticated;
revoke execute on function public.dist_disponible_de(bigint, bigint, date, bigint) from authenticated;
revoke execute on function public.recoleccion_cfg(bigint) from authenticated;
revoke execute on function public.recoleccion_bloqueo(bigint, timestamptz, timestamptz) from authenticated;
revoke execute on function public.recoleccion_ocupado(bigint, timestamptz, timestamptz, bigint) from authenticated;
revoke execute on function public.recoleccion_validar(bigint, timestamptz, bigint) from authenticated;
revoke execute on function public.recoleccion_json(bigint) from authenticated;
revoke execute on function public.recoleccion_avisar(bigint, bigint, text, text, bigint) from authenticated;
revoke execute on function public.soporte_anotar(bigint, text, text, text, jsonb) from authenticated;
revoke execute on function public.soporte_avisar(bigint, text, text) from authenticated;
revoke execute on function public.soporte_exigir(bigint, text) from authenticated;


-- ==================================================
-- ARCHIVOS (Supabase Storage)
-- Las fotos se ven por su enlace público; subir, reemplazar y borrar solo con sesión.
-- ==================================================

-- Se quitan las reglas anteriores del sistema, para crearlas de nuevo sin error
do $$
declare
    r record;
begin
    for r in select policyname from pg_policies
              where schemaname = 'storage' and tablename = 'objects'
                and (policyname like 'TEMPORAL - %' or policyname like 'ACACHETE - %') loop
        execute format('drop policy %I on storage.objects', r.policyname);
    end loop;
end;
$$;

-- Fotos de usuario: 2 MB, JPG / PNG / WEBP
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict do nothing;

create policy "ACACHETE - ver avatares"        on storage.objects for select to authenticated using (bucket_id = 'avatares');
create policy "ACACHETE - subir avatares"      on storage.objects for insert to authenticated with check (bucket_id = 'avatares');
create policy "ACACHETE - reemplazar avatares" on storage.objects for update to authenticated using (bucket_id = 'avatares') with check (bucket_id = 'avatares');
create policy "ACACHETE - borrar avatares"     on storage.objects for delete to authenticated using (bucket_id = 'avatares');

-- Fotos de entregas, carga y comprobantes (evidencias): 5 MB. Solo el personal las sube y borra.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict do nothing;

create policy "ACACHETE - ver evidencias"    on storage.objects for select to authenticated using (bucket_id = 'evidencias');
create policy "ACACHETE - subir evidencias"  on storage.objects for insert to authenticated
    with check (bucket_id = 'evidencias' and (select public.es_personal()));
create policy "ACACHETE - borrar evidencias" on storage.objects for delete to authenticated
    using (bucket_id = 'evidencias' and (select public.es_personal()));

notify pgrst, 'reload schema';
