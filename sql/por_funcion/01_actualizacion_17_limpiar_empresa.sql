-- 17 de 22 · sql/01_actualizacion_base_existente.sql · Limpiar los datos de una empresa (botón del Desarrollador) (bloques 40 a 40).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 40. LIMPIAR LOS DATOS DE UNA EMPRESA (solo Desarrollador)
--   Botón "Limpiar datos" de Tiendas -> Empresas (js/secciones/empresas-internas.js): hace
--   lo mismo que herramientas/vaciar_base_datos.sql (modo empresa) sin abrir Supabase.
--   - limpiar_empresa(p): SOLO el Desarrollador y con SU CONTRASEÑA (se comprueba en la
--     base: la clave pública sola no alcanza). Hay que escribir el ID de la empresa
--     para confirmar. Borra pedidos, viajes, clientes, rutas, vehículos, usuarios,
--     tiendas, regiones, tarifas, descuentos, mercadería, caja, distribuidora y
--     transporte de ESA empresa. Las demás empresas no se tocan.
--   - "admin" y "desar" nunca se borran; los Administradores si se conservan.
--   - borrar_empresa: al final borra también la empresa (no la principal, ni si le
--     quedan usuarios).
--   Las fotos de Storage no se borran (no estorban).
--   Se puede repetir.
-- ==================================================

-- p = { usuario_id, clave, empresa_id, confirmar (el ID de la empresa: '02'),
--       conservar_administradores (true), borrar_empresa (false) }
-- -> { empresa, nombre, borrada, filas: { pedidos: n, ... } }
create or replace function public.limpiar_empresa(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_usuario   bigint := (p ->> 'usuario_id')::bigint;
    v_clave     text;
    v_empresa   record;
    v_admins    boolean := coalesce((p ->> 'conservar_administradores')::boolean, true);
    v_borrar    boolean := coalesce((p ->> 'borrar_empresa')::boolean, false);
    v_filas     jsonb := '{}'::jsonb;
    v_borrada   boolean := false;
    n           bigint;
begin
    -- Solo el Desarrollador, con su contraseña
    select u.clave into v_clave from public.usuarios u where u.id = v_usuario and u.rol = 'desarrollador';
    if v_clave is null or not public.clave_cifrada(v_clave)
       or v_clave <> extensions.crypt(coalesce(p ->> 'clave', ''), v_clave) then
        perform pg_sleep(0.4); -- frena a quien prueba claves al azar
        raise exception 'Contraseña del Desarrollador incorrecta: no se borró nada.' using errcode = 'P0001';
    end if;

    select e.id, e.codigo, e.nombre into v_empresa from public.empresas e where e.id = (p ->> 'empresa_id')::bigint;
    if not found then
        raise exception 'No existe esa empresa: no se borró nada.' using errcode = 'P0001';
    end if;
    if btrim(coalesce(p ->> 'confirmar', '')) <> v_empresa.codigo then
        raise exception 'Para confirmar escriba el ID de la empresa (%): no se borró nada.', v_empresa.codigo using errcode = 'P0001';
    end if;

    -- Viajes y cortesías (se apuntan entre sí con "on delete set null")
    if to_regclass('public.viajes') is not null then
        delete from public.viajes where empresa_id = v_empresa.id;
        get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('viajes', n);
        delete from public.cortesias where empresa_id = v_empresa.id;
    end if;

    -- Solicitudes de envío y ubicaciones compartidas por los clientes
    if to_regclass('public.pedido_solicitudes') is not null then
        delete from public.pedido_solicitudes where empresa_id = v_empresa.id;
    end if;
    if to_regclass('public.ubicaciones_compartidas') is not null then
        delete from public.ubicaciones_compartidas where empresa_id = v_empresa.id;
    end if;

    -- Pedidos (su historial, artículos, entregas y evidencias se van con ellos)
    delete from public.pedidos where empresa_id = v_empresa.id;
    get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('pedidos', n);

    -- Cierres y tipos de caja
    if to_regclass('public.cierres_caja') is not null then
        delete from public.cierres_caja where empresa_id = v_empresa.id;
        update public.usuarios set caja_id = null where empresa_id = v_empresa.id;
        delete from public.cajas where empresa_id = v_empresa.id;
    end if;

    -- Distribuidora: bodegas del día (sus movimientos y cierres se van con ellas) antes
    -- que las rutas; luego productos, listas de precios y motivos
    if to_regclass('public.bodegas_dia') is not null then
        delete from public.bodegas_dia where empresa_id = v_empresa.id;
        update public.tiendas set lista_precios_id = null where empresa_id = v_empresa.id;
        delete from public.listas_precios where empresa_id = v_empresa.id;
        delete from public.productos where empresa_id = v_empresa.id;
        get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('productos', n);
        delete from public.motivos_entrega_parcial where empresa_id = v_empresa.id;
    end if;

    -- Rutas (y sus pilotos por ruta)
    delete from public.rutas where empresa_id = v_empresa.id;
    get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('rutas', n);

    -- Usuarios (sus notificaciones, marcas y QR del día se van con ellos).
    -- "admin" y "desar" nunca; los Administradores si se conservan.
    delete from public.usuarios
     where empresa_id = v_empresa.id
       and id_usuario not in ('admin', 'desar')
       and (not v_admins or rol <> 'administrador');
    get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('usuarios', n);

    -- Clientes (sus tiendas y su usuario de viajes se van con ellos)
    delete from public.clientes where empresa_id = v_empresa.id;
    get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('clientes', n);

    -- Configuración de transporte de la empresa
    if to_regclass('public.transporte_costos') is not null then
        delete from public.transporte_costos where empresa_id = v_empresa.id;
        delete from public.transporte_franjas where empresa_id = v_empresa.id;
        delete from public.transporte_dias_cerrados where empresa_id = v_empresa.id;
        delete from public.transporte_config where empresa_id = v_empresa.id;
    end if;

    delete from public.vehiculos where empresa_id = v_empresa.id;
    get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('vehiculos', n);
    delete from public.tarifas where empresa_id = v_empresa.id;
    delete from public.descuentos where empresa_id = v_empresa.id;
    -- Categorías de mercadería (sus artículos frecuentes se van con ellas)
    delete from public.categorias_mercaderia where empresa_id = v_empresa.id;

    -- Tiendas y regiones (sus marcas, capacidades y QR se van con ellas)
    delete from public.tiendas where empresa_id = v_empresa.id;
    get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('tiendas', n);
    delete from public.regiones where empresa_id = v_empresa.id;
    get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('regiones', n);

    -- La empresa misma: nunca la principal, ni si le quedan usuarios
    if v_borrar and v_empresa.id <> public.empresa_principal()
       and not exists (select 1 from public.usuarios where empresa_id = v_empresa.id) then
        delete from public.empresas where id = v_empresa.id;
        v_borrada := true;
    end if;

    return jsonb_build_object('empresa', v_empresa.codigo, 'nombre', v_empresa.nombre,
                              'borrada', v_borrada, 'filas', v_filas);
end;
$$;

revoke execute on function public.limpiar_empresa(jsonb) from public;
grant execute on function public.limpiar_empresa(jsonb) to anon;

notify pgrst, 'reload schema';


