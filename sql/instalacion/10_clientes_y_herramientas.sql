-- ==================================================
-- 10. SOLICITUD DE USUARIO DEL CLIENTE Y LIMPIAR UNA EMPRESA
-- ACACHETE LOGISTICS
--
-- SOLICITUD DE USUARIO (js/secciones/loggin.js, "Solicita tu usuario"):
--   El cliente de una empresa con Viajes, Encomiendas (punto de partida) o Recolecciones
--   pide su usuario desde index.html#registro?empresa=02. Queda PENDIENTE (cliente y
--   usuario sin aprobar) y se avisa al Administrador y al G1. Se aprueba en Clientes.
--   El plan de la empresa debe incluir "registro_clientes".
-- LIMPIAR UNA EMPRESA (Tiendas -> Empresas, botón del Desarrollador):
--   Solo el Desarrollador y con SU CONTRASEÑA (la de Supabase Auth). Borra los datos de
--   ESA empresa; las demás no se tocan. "admin" y "desar" nunca se borran.
-- Se puede repetir.
-- ==================================================

-- ¿Esa empresa recibe solicitudes? Devuelve { nombre } o null.
create or replace function public.registro_clientes_empresa(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object('nombre', e.nombre)
      from public.empresas e
     where e.codigo = btrim(coalesce(p_codigo, ''))
       and e.activa
       and exists (select 1 from public.actividades a where a.codigo = any (e.actividades)
                     and (a.usa_viajes or a.usa_punto_partida or a.usa_recolecciones))
       and (e.funciones is null or 'registro_clientes' = any (e.funciones));
$$;

-- Guarda la solicitud: cliente (si su teléfono no existe en la empresa) + usuario rol
-- cliente, los dos SIN APROBAR, y avisa al Administrador y al G1 de la empresa.
--   p = { empresa: '02', nombre, apellido1, apellido2, telefono, correo, usuario, clave }
--   Devuelve { usuario: 'aramirez02', empresa: 'Transportes ...' }
create or replace function public.solicitar_acceso_cliente(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_empresa  record;
    v_nombre   text := regexp_replace(btrim(coalesce(p->>'nombre', '')), '\s+', ' ', 'g');
    v_ape1     text := regexp_replace(btrim(coalesce(p->>'apellido1', '')), '\s+', ' ', 'g');
    v_ape2     text := nullif(regexp_replace(btrim(coalesce(p->>'apellido2', '')), '\s+', ' ', 'g'), '');
    v_tel      text := regexp_replace(coalesce(p->>'telefono', ''), '\D', '', 'g');
    v_correo   text := nullif(lower(btrim(coalesce(p->>'correo', ''))), '');
    v_base     text := lower(btrim(coalesce(p->>'usuario', '')));
    v_clave    text := coalesce(p->>'clave', '');
    v_cliente  bigint;
    v_tienda   bigint;
    v_usuario  text;
    v_completo text;
begin
    select e.id, e.codigo, e.nombre into v_empresa
      from public.empresas e
     where e.codigo = btrim(coalesce(p->>'empresa', ''))
       and e.activa
       and exists (select 1 from public.actividades a where a.codigo = any (e.actividades)
                     and (a.usa_viajes or a.usa_punto_partida or a.usa_recolecciones))
       and (e.funciones is null or 'registro_clientes' = any (e.funciones));
    if not found then
        raise exception 'Este enlace de registro no es válido. Pide a la empresa el enlace correcto.' using errcode = 'P0001';
    end if;

    if length(v_nombre) not between 2 and 60 or length(v_ape1) not between 2 and 60 or length(coalesce(v_ape2, '')) > 60 then
        raise exception 'Escribe tu nombre y tu primer apellido (de 2 a 60 letras).' using errcode = 'P0001';
    end if;
    if length(v_tel) not between 8 and 15 then
        raise exception 'El teléfono debe tener al menos 8 dígitos.' using errcode = 'P0001';
    end if;
    if v_correo is not null and v_correo !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'El correo no es válido.' using errcode = 'P0001';
    end if;
    if v_base !~ '^[a-z0-9]{3,20}$' then
        raise exception 'El usuario: de 3 a 20 letras o números, sin espacios.' using errcode = 'P0001';
    end if;
    if length(v_clave) not between 6 and 72 then
        raise exception 'La contraseña debe tener de 6 a 72 caracteres.' using errcode = 'P0001';
    end if;

    -- Una solicitud a la vez por empresa (evita duplicados si se envía dos veces)
    perform pg_advisory_xact_lock(7302, v_empresa.id::integer);

    -- Freno contra solicitudes falsas en cantidad
    if (select count(*) from public.usuarios u
         where u.empresa_id = v_empresa.id and u.rol = 'cliente' and not u.aprobado
           and u.creado_en > now() - interval '1 hour') >= 20 then
        raise exception 'Hay muchas solicitudes en este momento. Intenta de nuevo en una hora.' using errcode = 'P0001';
    end if;

    -- ¿Ya es cliente de la empresa? (mismo teléfono)
    select c.id into v_cliente
      from public.clientes c
     where c.empresa_id = v_empresa.id and regexp_replace(c.telefono, '\D', '', 'g') = v_tel
     order by c.aprobado desc, c.id
     limit 1;

    if v_cliente is not null then
        if exists (select 1 from public.usuarios u where u.cliente_id = v_cliente) then
            raise exception 'Ya hay un usuario o una solicitud con ese teléfono. Si olvidaste tu contraseña, comunícate con la empresa.' using errcode = 'P0001';
        end if;
    else
        if v_correo is not null and exists (select 1 from public.clientes c
                                             where c.empresa_id = v_empresa.id and lower(c.correo) = v_correo) then
            raise exception 'Ese correo ya está registrado con otro teléfono. Comunícate con la empresa.' using errcode = 'P0001';
        end if;
        insert into public.clientes (nombre, apellido1, apellido2, telefono, correo, aprobado, solicitado_en, empresa_id)
        values (v_nombre, v_ape1, v_ape2, v_tel, v_correo, false, now(), v_empresa.id)
        returning id into v_cliente;
        -- En la primera tienda activa de la empresa (así aparece en Clientes y lo ve su G3)
        select t.id into v_tienda
          from public.tiendas t
         where t.empresa_id = v_empresa.id and t.estado = 'activa'
         order by t.codigo
         limit 1;
        if v_tienda is not null then
            insert into public.clientes_tiendas (cliente_id, tienda_id) values (v_cliente, v_tienda);
        end if;
    end if;

    select ct.tienda_id into v_tienda
      from public.clientes_tiendas ct
     where ct.cliente_id = v_cliente
     order by ct.tienda_id
     limit 1;

    -- Usuario: el que pidió + ID de la empresa (aramirez02); si ya existe, aramirez202...
    v_completo := public.nombre_completo(v_nombre, v_ape1, v_ape2);
    v_usuario := public.usuario_libre(v_base, v_empresa.codigo, null, 0);
    insert into public.usuarios (nombre, id_usuario, telefono, clave, rol, cliente_id, aprobado, solicitado_en)
    values (v_completo, v_usuario, v_tel, v_clave, 'cliente', v_cliente, false, now());

    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, enlace, referencia_tipo, referencia_id)
    select u.id, 'pendiente', 'Solicitud de acceso de cliente',
           format('%s (tel. %s) pidió su usuario "%s". Revísala en Clientes.', v_completo, v_tel, v_usuario),
           case when v_tienda is null then '#clientes' else '#clientes?tienda=' || v_tienda end,
           'acceso_cliente', v_cliente
      from public.usuarios u
     where u.empresa_id = v_empresa.id and u.rol in ('administrador', 'admin_g1') and u.aprobado;

    return jsonb_build_object('usuario', v_usuario, 'empresa', v_empresa.nombre);
end;
$$;

-- Limpiar los datos de una empresa.
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
    v_hash      text;
    v_empresa   record;
    v_admins    boolean := coalesce((p ->> 'conservar_administradores')::boolean, true);
    v_borrar    boolean := coalesce((p ->> 'borrar_empresa')::boolean, false);
    v_filas     jsonb := '{}'::jsonb;
    v_borrada   boolean := false;
    n           bigint;
begin
    -- Solo el Desarrollador de la sesión, con su contraseña
    if (public.usuario_activo(v_usuario)).rol is distinct from 'desarrollador' then
        raise exception 'Solo el Desarrollador limpia una empresa: no se borró nada.' using errcode = 'P0001';
    end if;
    select a.encrypted_password into v_hash
      from public.usuarios u join auth.users a on a.id = u.auth_id
     where u.id = v_usuario;
    if v_hash is null or v_hash <> extensions.crypt(coalesce(p ->> 'clave', ''), v_hash) then
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
    -- Con Admin TI, solo con la llave de soporte "Ver y corregir" de la empresa
    perform public.soporte_exigir(v_empresa.id, 'config');

    -- Viajes y cortesías (se apuntan entre sí con "on delete set null")
    delete from public.viajes where empresa_id = v_empresa.id;
    get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('viajes', n);
    delete from public.cortesias where empresa_id = v_empresa.id;

    -- Recolecciones, sus cargos, tarifas, bloqueos y reglas
    delete from public.recolecciones where empresa_id = v_empresa.id;
    get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('recolecciones', n);
    delete from public.recoleccion_cargos where empresa_id = v_empresa.id;
    delete from public.recoleccion_tarifas where empresa_id = v_empresa.id;
    delete from public.recoleccion_bloqueos where empresa_id = v_empresa.id;
    delete from public.recoleccion_config where empresa_id = v_empresa.id;

    -- Solicitudes de envío y ubicaciones compartidas por los clientes
    delete from public.pedido_solicitudes where empresa_id = v_empresa.id;
    delete from public.ubicaciones_compartidas where empresa_id = v_empresa.id;

    -- Pedidos (su historial, artículos, entregas y evidencias se van con ellos)
    delete from public.pedidos where empresa_id = v_empresa.id;
    get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('pedidos', n);

    -- Cierres y tipos de caja
    delete from public.cierres_caja where empresa_id = v_empresa.id;
    update public.usuarios set caja_id = null where empresa_id = v_empresa.id;
    delete from public.cajas where empresa_id = v_empresa.id;

    -- Distribuidora: bodegas del día (sus movimientos y cierres se van con ellas) antes que
    -- las rutas; luego productos, listas de precios y motivos
    delete from public.bodegas_dia where empresa_id = v_empresa.id;
    update public.tiendas set lista_precios_id = null where empresa_id = v_empresa.id;
    delete from public.listas_precios where empresa_id = v_empresa.id;
    delete from public.productos where empresa_id = v_empresa.id;
    get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('productos', n);
    delete from public.motivos_entrega_parcial where empresa_id = v_empresa.id;

    -- Rutas (y sus pilotos por ruta)
    delete from public.rutas where empresa_id = v_empresa.id;
    get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('rutas', n);

    -- Usuarios (sus notificaciones, marcas y QR del día se van con ellos).
    -- "admin" y "desar" nunca; el Admin TI tampoco (lo quita solo su empresa); los
    -- Administradores si se conservan.
    delete from public.usuarios
     where empresa_id = v_empresa.id
       and id_usuario not in ('admin', 'desar')
       and not admin_ti
       and (not v_admins or rol <> 'administrador');
    get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('usuarios', n);

    -- Clientes (sus tiendas y su usuario se van con ellos)
    delete from public.clientes where empresa_id = v_empresa.id;
    get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('clientes', n);

    -- Transporte, costos y horarios de la empresa
    delete from public.transporte_franjas where empresa_id = v_empresa.id;
    delete from public.transporte_dias_cerrados where empresa_id = v_empresa.id;
    delete from public.transporte_bloqueos where empresa_id = v_empresa.id;
    delete from public.transporte_config where empresa_id = v_empresa.id;
    delete from public.costos_operacion where empresa_id = v_empresa.id;
    delete from public.costos_config where empresa_id = v_empresa.id;
    delete from public.horarios_dias where empresa_id = v_empresa.id;   -- sus horarios se van con ellos
    delete from public.horarios_capacidad where empresa_id = v_empresa.id;
    delete from public.configuracion where empresa_id = v_empresa.id;

    delete from public.vehiculos where empresa_id = v_empresa.id;
    get diagnostics n = row_count; v_filas := v_filas || jsonb_build_object('vehiculos', n);
    delete from public.tarifas where empresa_id = v_empresa.id;
    delete from public.descuentos where empresa_id = v_empresa.id;
    delete from public.motivos_retraso where empresa_id = v_empresa.id;
    -- Categorías de mercadería (sus artículos frecuentes se van con ellas)
    delete from public.categorias_mercaderia where empresa_id = v_empresa.id;

    -- Tiendas y regiones (sus QR se van con ellas)
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
