-- ==================================================
-- 01. BASE: EMPRESAS, REGIONES, TIENDAS, VEHÍCULOS, CLIENTES Y USUARIOS
-- ACACHETE LOGISTICS
--
-- Lo que usan todos los módulos. Ejecutar PRIMERO (después de 00 si se reinicia).
--   - Funciones generales: ahora_local (hora de Costa Rica), km_recta, usuario_activo.
--   - empresas: empresas internas en la misma base (ID "01", "02"...), sus
--     actividades, plan, colores y datos legales. empresa_principal() es la primera.
--   - regiones (opcionales), tiendas (sucursales), vehículos.
--   - clientes: persona o empresa. La dirección escrita y la ubicación (coordenadas
--     o enlace de Google Maps) son campos distintos. busqueda la calcula la base.
--   - usuarios: rol + funciones propias (tablas funciones y usuario_funciones). Inician
--     sesión con Supabase Auth: la contraseña vive allá, nunca en esta tabla.
--   - Seguridad: quién es el usuario de la sesión (yo, mi_empresa, puede...) para las
--     reglas de acceso de 11_acceso_web.sql.
--   - notificaciones (campana), configuracion (ajustes de cada empresa) y visitas.
-- Formato de Costa Rica (js/componentes.js, FORMATOS_CR): aquí la base pone el
-- TOPE de largo y los caracteres permitidos, para que nadie guarde un dato desbordado.
-- Se puede repetir.
-- ==================================================

create extension if not exists pgcrypto with schema extensions;


-- ==================================================
-- FUNCIONES GENERALES
-- ==================================================

-- Fecha y hora de la empresa (Costa Rica). Cambiar aquí si la empresa está en otra zona.
create or replace function public.ahora_local()
returns timestamp
language sql
stable
as $$ select now() at time zone 'America/Costa_Rica' $$;

-- Distancia en línea recta (km): nadie puede cobrar menos que esto
create or replace function public.km_recta(a_lat numeric, a_lng numeric, b_lat numeric, b_lng numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
    select (6371 * 2 * asin(sqrt(
        power(sin(radians((b_lat - a_lat)::float8) / 2), 2)
        + cos(radians(a_lat::float8)) * cos(radians(b_lat::float8)) * power(sin(radians((b_lng - a_lng)::float8) / 2), 2))))::numeric;
$$;

-- "Ana Ramírez Soto": nombre y apellidos sin espacios de más (el apellido puede estar vacío)
create or replace function public.nombre_completo(p_nombre text, p_apellido1 text, p_apellido2 text)
returns text
language sql
immutable
set search_path = ''
as $$
    select concat_ws(' ', nullif(btrim(p_nombre), ''), nullif(btrim(p_apellido1), ''), nullif(btrim(p_apellido2), ''));
$$;


-- ==================================================
-- EMPRESAS
-- ==================================================

create table if not exists public.empresas (
    id               bigint generated always as identity primary key,
    codigo           text not null unique,   -- ID de la empresa: "01", "02"... (va al final de sus usuarios)
    nombre           text not null unique,
    actividades      text[] not null default '{tienda,encomiendas}', -- códigos de la tabla actividades
    activa           boolean not null default true,  -- inactiva: sus usuarios no inician sesión
    colores          jsonb not null default '{}'::jsonb, -- paleta (Tiendas -> Empresas); {} = la de la marca
    plan             text not null default 'completo',
    funciones        text[],                 -- funciones del plan (null = todas)
    razon_social     text,
    cedula_juridica  text,
    telefono         text,
    direccion        text,                   -- dirección escrita de la oficina
    ubicacion        text,                   -- coordenadas "9.93, -84.08" o enlace de Google Maps
    giro             text,                   -- a qué se dedica
    creado_en        timestamptz not null default now(),

    constraint empresas_codigo_valido       check (codigo ~ '^[0-9]{2}$'),
    constraint empresas_actividades_validas check (cardinality(actividades) > 0),
    constraint empresas_colores_objeto      check (jsonb_typeof(colores) = 'object'),
    constraint empresas_plan_valido         check (plan in ('basico', 'profesional', 'completo', 'personalizado')),
    constraint empresas_telefono_formato    check (char_length(telefono) <= 20 and telefono ~ '^[0-9 +().-]*$'),
    constraint empresas_cedula_formato      check (char_length(cedula_juridica) <= 20 and cedula_juridica ~ '^[0-9-]*$'),
    constraint empresas_datos_largo         check (char_length(coalesce(razon_social, '')) <= 150 and char_length(coalesce(giro, '')) <= 200
                                                   and char_length(coalesce(direccion, '')) <= 250 and char_length(coalesce(ubicacion, '')) <= 300)
);

-- La primera empresa: valor por defecto de empresa_id. Si no hay ninguna, la crea
-- (así las inserciones no fallan).
create or replace function public.empresa_principal()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
    v_id bigint;
begin
    select id into v_id from public.empresas order by codigo, id limit 1;
    if v_id is null then
        insert into public.empresas (codigo, nombre) values ('01', 'Empresa principal') returning id into v_id;
    end if;
    return v_id;
end;
$$;


-- ==================================================
-- REGIONES Y TIENDAS
-- ==================================================

-- Región (opcional): 3 letras MAYÚSCULAS. Se administran en Tiendas -> Regiones.
create table if not exists public.regiones (
    codigo      text primary key,
    nombre      text not null,
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict,

    constraint regiones_codigo_valido check (codigo ~ '^[A-Z]{3}$')
);

-- Tienda (sucursal). Código libre (CEN-001, SUC-CENTRO, 25); la región es opcional.
--   usa_rutas: si envía pedidos (una tienda sin rutas no aparece para pedidos ni bodegas).
--   lista_precios_id (distribuidora): su llave está en 08_distribuidora.sql.
create table if not exists public.tiendas (
    id                bigint generated always as identity primary key,
    codigo            text not null unique,
    region            text references public.regiones(codigo),
    nombre            text not null,
    direccion         text,
    telefono          text,
    estado            text not null default 'activa',
    lat               numeric(9,6),   -- ubicación en el mapa (punto de salida y QR fijo con GPS)
    lng               numeric(9,6),
    usa_rutas         boolean not null default true,
    lista_precios_id  bigint,
    empresa_id        bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict,
    creado_en         timestamptz not null default now(),

    constraint tiendas_codigo_formato   check (codigo ~ '^[A-Z0-9][A-Z0-9-]{0,19}$'),
    constraint tiendas_estado_valido    check (estado in ('activa', 'inactiva')),
    constraint tiendas_telefono_formato check (char_length(telefono) <= 20 and telefono ~ '^[0-9 +().-]*$')
);
create index if not exists tiendas_empresa_idx on public.tiendas (empresa_id);


-- ==================================================
-- VEHÍCULOS
-- ==================================================

-- asientos, carga y mascotas: los usa la agenda de Viajes (vehículo libre).
-- Los costos ya no van por vehículo: están en 06_costos.sql (costos_operacion).
create table if not exists public.vehiculos (
    id               bigint generated always as identity primary key,
    placa            text not null unique,
    tipo             text,
    marca            text not null,
    estado           text not null default 'disponible',
    asientos         smallint,       -- pasajeros (sin contar al conductor)
    carga_kg         numeric(8,2),   -- carga máxima
    acepta_mascotas  boolean not null default false,
    empresa_id       bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict,
    creado_en        timestamptz not null default now(),

    constraint vehiculos_placa_formato     check (placa ~ '^[A-Z0-9-]+$'),
    constraint vehiculos_estado_valido     check (estado in ('disponible', 'en_uso', 'mantenimiento')),
    constraint vehiculos_tipo_valido       check (tipo is null or tipo in ('camion', 'pickup', 'panel', 'moto', 'auto', 'microbus')),
    constraint vehiculos_transporte_valido check ((asientos is null or asientos between 0 and 60) and (carga_kg is null or carga_kg >= 0))
);


-- ==================================================
-- CLIENTES
-- ==================================================

-- tipo: 'persona' | 'empresa' (empresa: razón social obligatoria; nombre y apellidos
-- son los de la persona de contacto, el apellido puede quedar vacío '').
-- busqueda la calcula la base: nombre, apellidos, razón social, cédula, correo y
-- teléfono (solo dígitos) en minúsculas y sin tildes (buscador de clientes).
-- cambios_pendientes: lo que un Empleado propone cambiar (lo aprueba un G3 o superior).
create table if not exists public.clientes (
    id                  bigint generated always as identity primary key,
    tipo                text not null default 'persona',
    nombre              text not null,
    apellido1           text not null,
    apellido2           text,
    razon_social        text,
    cedula              text,
    telefono            text not null,
    correo              text,
    direccion           text,       -- dirección escrita
    ubicacion           text,       -- coordenadas "9.93, -84.08" o enlace de Google Maps
    busqueda            text generated always as (lower(translate(
                            nombre || ' ' || apellido1 || ' ' || coalesce(apellido2, '') || ' ' ||
                            coalesce(razon_social, '') || ' ' || coalesce(cedula, '') || ' ' ||
                            coalesce(correo, '') || ' ' || regexp_replace(telefono, '\D', '', 'g'),
                            'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))) stored,
    aprobado            boolean not null default true,
    cambios_pendientes  jsonb,
    solicitado_por      bigint,     -- llave a usuarios: más abajo (usuarios se crea después)
    solicitado_en       timestamptz,
    empresa_id          bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict,
    creado_en           timestamptz not null default now(),

    constraint clientes_tipo_valido          check (tipo in ('persona', 'empresa')),
    constraint clientes_empresa_razon_social check (tipo <> 'empresa' or nullif(btrim(razon_social), '') is not null),
    constraint clientes_correo_formato       check (correo is null or correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    constraint clientes_telefono_formato     check (char_length(telefono) <= 20 and telefono ~ '^[0-9 +().-]*$'),
    constraint clientes_cedula_formato       check (char_length(cedula) <= 20 and cedula ~ '^[0-9-]*$'),
    constraint clientes_razon_social_largo   check (char_length(razon_social) <= 150),
    constraint clientes_nombre_largo         check (char_length(nombre) <= 60 and char_length(apellido1) <= 60 and char_length(coalesce(apellido2, '')) <= 60),
    constraint clientes_correo_largo         check (char_length(correo) <= 120)
);
create index if not exists clientes_empresa_idx on public.clientes (empresa_id);
-- El correo identifica al cliente: no se repite (sin importar mayúsculas) dentro de cada empresa
create unique index if not exists clientes_correo_unico_empresa on public.clientes (empresa_id, lower(correo)) where correo is not null;


-- ==================================================
-- USUARIOS
-- Roles:
--   desarrollador               -> por encima del Administrador; no es de ninguna empresa
--   administrador, admin_g1     -> sin tienda ni región
--   admin_g2                    -> con región
--   admin_g3, empleado, piloto  -> con tienda
--   cliente                     -> ligado a un cliente (Viajes, Envíos, Recolecciones)
-- Usuario: nombre + ID de la empresa ("jperez01"). "admin" y "desar" no cambian.
-- Qué módulos y funciones tiene: los de su ROL (tabla funciones) más lo que se le dio o
-- se le quitó a él (tabla usuario_funciones). Ver "MÓDULOS Y FUNCIONES" más abajo.
-- ==================================================

create table if not exists public.usuarios (
    id              bigint generated always as identity primary key,
    nombre          text        not null,
    id_usuario      text        not null unique,
    telefono        text,
    cedula          text,
    departamento    text,       -- área donde trabaja (ej. Bodega, Ventas)
    clave           text,       -- buzón: la página escribe aquí la contraseña nueva y la base la pasa a Supabase Auth (queda vacía)
    auth_id         uuid unique references auth.users(id) on delete set null, -- su acceso en Supabase Auth (lo pone la base)
    rol             text        not null,
    tienda_id       bigint references public.tiendas(id) on delete restrict,
    region          text references public.regiones(codigo) on delete restrict,
    cliente_id      bigint references public.clientes(id) on delete cascade,
    vehiculo_id     bigint references public.vehiculos(id) on delete set null,
    multitienda     boolean     not null default false,
    caja_id         bigint,     -- tipo de caja del piloto: llave en 07_caja_y_ubicacion.sql
    caja_monto      numeric(12,2) not null default 0,  -- fondo de caja propio
    foto_url        text,
    aprobado        boolean     not null default true,
    admin_ti        boolean     not null default false, -- Admin TI: da la llave de soporte al Desarrollador (Configuración -> Soporte)
    solicitado_por  bigint references public.usuarios(id) on delete set null,
    solicitado_en   timestamptz,
    empresa_id      bigint default public.empresa_principal() references public.empresas(id) on delete restrict,
    creado_en       timestamptz not null default now(),

    constraint usuarios_rol_valido check (
        rol in ('desarrollador', 'administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado', 'piloto', 'cliente')),
    constraint usuarios_tienda_segun_rol check (
        (rol in ('desarrollador', 'administrador', 'admin_g1') and tienda_id is null and region is null)
        or (rol = 'admin_g2' and tienda_id is null and region is not null)
        or (rol in ('admin_g3', 'empleado', 'piloto') and tienda_id is not null and region is null)
        or (rol = 'cliente' and tienda_id is null and region is null and cliente_id is not null)),
    constraint usuarios_empresa_segun_rol       check (rol = 'desarrollador' or empresa_id is not null),
    constraint usuarios_clave_vacia             check (clave is null),
    -- Vehículo asignado: cualquier persona de la empresa (piloto, empleado o administración); no el cliente ni el Desarrollador
    constraint usuarios_vehiculo_personal       check (vehiculo_id is null or rol in ('administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado', 'piloto')),
    constraint usuarios_multitienda_solo_piloto check (not multitienda or rol = 'piloto'),
    constraint usuarios_cliente_solo_cliente    check (cliente_id is null or rol = 'cliente'),
    constraint usuarios_admin_ti_personal       check (not admin_ti or rol in ('administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado')),
    constraint usuarios_caja_valida             check (caja_monto >= 0),
    constraint usuarios_telefono_formato        check (char_length(telefono) <= 20 and telefono ~ '^[0-9 +().-]*$'),
    constraint usuarios_cedula_formato          check (char_length(cedula) <= 20 and cedula ~ '^[0-9-]*$'),
    constraint usuarios_departamento_largo      check (char_length(departamento) <= 60)
);
create index if not exists usuarios_empresa_idx on public.usuarios (empresa_id);
create index if not exists usuarios_cedula_idx on public.usuarios (cedula) where cedula is not null;
create unique index if not exists usuarios_un_acceso_por_cliente on public.usuarios (cliente_id) where cliente_id is not null;

-- Base ya instalada: la regla vieja (vehículo solo para pilotos) pasa a la de todo el personal
alter table public.usuarios drop constraint if exists usuarios_vehiculo_solo_piloto;
alter table public.usuarios drop constraint if exists usuarios_vehiculo_personal;
alter table public.usuarios add constraint usuarios_vehiculo_personal
    check (vehiculo_id is null or rol in ('administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado', 'piloto'));


-- ==================================================
-- MÓDULOS Y FUNCIONES DE LOS USUARIOS (Usuarios -> "Módulos y funciones")
-- funciones: el catálogo. clave = el módulo ('pedidos', una sección del menú) o una
--   función de él ('pedidos.alistar'). roles = los roles que la traen: vienen marcadas al
--   crear el usuario. Es la ÚNICA lista: la página la lee de aquí (js/sesion.js).
-- usuario_funciones: lo que a un usuario se le dio (permitido) o se le quitó respecto de
--   su rol. Al piloto solo se le puede quitar. Administrador y Desarrollador: todo.
-- Sin el módulo, sus funciones no sirven. Lo calcula tiene_funcion / puede (más abajo).
-- Para agregar una función: una fila aquí y en la sección "puedeHacer('modulo.funcion', ...)".
-- ==================================================

create table if not exists public.funciones (
    clave   text primary key,
    modulo  text not null,
    nombre  text not null,
    icono   text,                                -- solo los módulos (Bootstrap Icons)
    roles   text[] not null default '{}',
    orden   smallint not null default 0,

    constraint funciones_clave_valida check (clave = modulo or clave like modulo || '.%')
);

create table if not exists public.usuario_funciones (
    usuario_id  bigint not null references public.usuarios(id) on delete cascade,
    funcion     text not null references public.funciones(clave) on update cascade on delete cascade,
    permitido   boolean not null,
    primary key (usuario_id, funcion)
);

insert into public.funciones (clave, modulo, nombre, icono, roles, orden) values
    ('pedidos',                       'pedidos', 'Pedidos', 'bi-box-seam', '{admin_g1,admin_g2,admin_g3,empleado,piloto}', 10),
    ('pedidos.crear',                 'pedidos', 'Registrar pedidos nuevos', null, '{admin_g1,admin_g2,admin_g3,empleado}', 11),
    ('pedidos.bodega',                'pedidos', 'Marcar "Recibido en bodega"', null, '{admin_g1,admin_g2,admin_g3,empleado}', 12),
    ('pedidos.alistar',               'pedidos', 'Alistar pedidos ("Alistando")', null, '{admin_g1,admin_g2,admin_g3,empleado}', 13),
    ('pedidos.despachar',             'pedidos', 'Marcar "Listo para despachar" y aprobar la salida', null, '{admin_g1,admin_g2,admin_g3,empleado}', 14),
    ('pedidos.asignar',               'pedidos', 'Asignar piloto y horario, y reprogramar', null, '{admin_g1,admin_g2}', 15),
    ('pedidos.solicitar',             'pedidos', 'Solicitar reasignación', null, '{admin_g3,empleado}', 16),
    ('pedidos.cancelar',              'pedidos', 'Cancelar, devolver y autorizar pedidos', null, '{admin_g1,admin_g2,admin_g3}', 17),
    ('pedidos.solicitudes',           'pedidos', 'Aprobar solicitudes de envío de clientes', null, '{admin_g1,admin_g2,admin_g3}', 18),
    ('viajes',                        'viajes', 'Viajes', 'bi-car-front', '{admin_g1,admin_g2,admin_g3,empleado,piloto,cliente}', 20),
    ('viajes.solicitar',              'viajes', 'Registrar viajes para clientes', null, '{admin_g1,admin_g2,admin_g3,empleado}', 21),
    ('recolecciones',                 'recolecciones', 'Recolecciones', 'bi-inbox', '{admin_g1,admin_g2,admin_g3,empleado,piloto,cliente}', 30),
    ('recolecciones.solicitar',       'recolecciones', 'Registrar recolecciones para clientes', null, '{admin_g1,admin_g2,admin_g3,empleado}', 31),
    ('recolecciones.atender',         'recolecciones', 'Atender como conductor y bloquear horas', null, '{admin_g1,piloto}', 32),
    ('recolecciones.cobrar',          'recolecciones', 'Tarifa diaria de los clientes y cobro semanal', null, '{admin_g1}', 33),
    ('pilotos',                       'pilotos', 'Pilotos', 'bi-person-badge', '{admin_g1,admin_g2,admin_g3}', 40),
    ('caja',                          'caja', 'Caja', 'bi-safe', '{admin_g1,admin_g2,admin_g3,piloto}', 50),
    ('caja.cerrar',                   'caja', 'Cerrar la caja de los pilotos', null, '{admin_g1,admin_g2,admin_g3}', 51),
    ('distribucion',                  'distribucion', 'Distribución', 'bi-boxes', '{admin_g1,admin_g2,admin_g3,piloto}', 60),
    ('distribucion.bodega',           'distribucion', 'Manejar la bodega del día (carga, devoluciones y cierre)', null, '{admin_g1,admin_g2,admin_g3}', 61),
    ('distribucion.catalogo',         'distribucion', 'Modificar productos y precios', null, '{admin_g1}', 62),
    ('rutas',                         'rutas', 'Rutas y asignaciones', 'bi-signpost-split', '{admin_g1,admin_g2,admin_g3}', 70),
    ('rutas.gestionar',               'rutas', 'Crear rutas y asignar pilotos', null, '{admin_g1,admin_g2}', 71),
    ('tiendas',                       'tiendas', 'Tiendas y clientes', 'bi-shop', '{admin_g1,admin_g2,admin_g3,empleado}', 80),
    ('tiendas.gestionar',             'tiendas', 'Crear y modificar tiendas y regiones', null, '{admin_g1}', 81),
    ('tiendas.clientes_crear',        'tiendas', 'Registrar y modificar clientes', null, '{admin_g1,admin_g2,admin_g3,empleado}', 82),
    ('tiendas.clientes_administrar',  'tiendas', 'Aprobar y eliminar clientes', null, '{admin_g1,admin_g2,admin_g3}', 83),
    ('reportes',                      'reportes', 'Reportes', 'bi-bar-chart', '{admin_g1,admin_g2,admin_g3,piloto}', 90),
    ('reportes.exportar',             'reportes', 'Exportar reportes', null, '{admin_g1,admin_g2,piloto}', 91),
    ('cotizador',                     'cotizador', 'Cotizador', 'bi-calculator', '{admin_g1,admin_g2,admin_g3,empleado}', 100),
    ('usuarios',                      'usuarios', 'Usuarios', 'bi-people', '{admin_g1,admin_g2}', 110),
    ('usuarios.crear',                'usuarios', 'Crear usuarios (G3 y Empleado: empleados de su tienda, con aprobación)', null, '{admin_g1,admin_g2,admin_g3}', 111),
    ('usuarios.modificar',            'usuarios', 'Modificar, eliminar y aprobar usuarios', null, '{admin_g1,admin_g2}', 112),
    ('configuracion',                 'configuracion', 'Configuración', 'bi-gear', '{admin_g1,admin_g2,empleado}', 120),
    ('configuracion.general',         'configuracion', 'Cambiar la configuración (tarifas, horarios, vehículos...)', null, '{admin_g1}', 121),
    ('envios',                        'envios', 'Mis envíos', 'bi-send', '{cliente}', 130)
on conflict (clave) do update
    set modulo = excluded.modulo, nombre = excluded.nombre, icono = excluded.icono,
        roles = excluded.roles, orden = excluded.orden;

-- Llave de clientes.solicitado_por (usuarios ya existe)
alter table public.clientes drop constraint if exists clientes_solicitado_por_fkey;
alter table public.clientes add constraint clientes_solicitado_por_fkey
    foreign key (solicitado_por) references public.usuarios(id) on delete set null;

-- Tiendas de cada cliente y su ruta de entrega en cada una (la llave de ruta_id está
-- en 04_rutas_y_pedidos.sql)
create table if not exists public.clientes_tiendas (
    cliente_id  bigint not null references public.clientes(id) on delete cascade,
    tienda_id   bigint not null references public.tiendas(id) on delete cascade,
    ruta_id     bigint,
    primary key (cliente_id, tienda_id)
);


-- ==================================================
-- NOTIFICACIONES, CONFIGURACIÓN Y VISITAS
-- ==================================================

create table if not exists public.notificaciones (
    id               bigint generated always as identity primary key,
    usuario_id       bigint not null references public.usuarios(id) on delete cascade,
    tipo             text not null default 'info',
    titulo           text not null,
    mensaje          text,
    enlace           text,
    referencia_tipo  text,
    referencia_id    bigint,
    leida            boolean not null default false,
    creado_en        timestamptz not null default now(),

    constraint notificaciones_tipo_valido check (tipo in ('pendiente', 'aprobado', 'rechazado', 'info'))
);
create index if not exists notificaciones_usuario_idx on public.notificaciones (usuario_id, leida, creado_en desc);

-- Ajustes de cada empresa (clave -> valor). Sin la fila, vale lo que va entre paréntesis:
--   numero_pedido   "automatico" | "manual"                      ("automatico")
--   codigo_respaldo ["aleatorio"] | ["telefono"] | los dos       (["aleatorio"])
--   radio_marca_m   metros para marcar con el QR fijo de la tienda (150)
create table if not exists public.configuracion (
    empresa_id      bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    clave           text not null,
    valor           jsonb not null,
    actualizado_en  timestamptz not null default now(),
    primary key (empresa_id, clave)
);

-- Visitas (solo Desarrollador): quién entra, desde dónde y a qué pantallas. Se guardan 3 días.
-- Sin acceso directo desde la web: solo registrar_visita y reporte_visitas.
create table if not exists public.visitas (
    id           bigint generated always as identity primary key,
    creado_en    timestamptz not null default now(),
    usuario_id   bigint references public.usuarios(id) on delete cascade,
    empresa_id   bigint references public.empresas(id) on delete cascade,
    tipo         text not null default 'pantalla',
    seccion      text,
    dispositivo  text,
    navegador    text,
    app          boolean not null default false,
    ip           text,
    pais         text,

    constraint visitas_tipo_valido check (tipo in ('ingreso', 'pantalla'))
);
create index if not exists visitas_creado_en_idx on public.visitas (creado_en);

-- Llaves de soporte (Configuración -> Soporte). El Admin TI o un Administrador de la empresa
-- le da una llave al Desarrollador para que vea (o corrija) los datos de la empresa por 1, 4
-- o 24 horas. Del código solo se guarda su versión cifrada: se ve una vez, al crearla.
-- Sin acceso directo desde la web: solo las funciones soporte_* (más abajo).
create table if not exists public.soporte_llaves (
    id           bigint generated always as identity primary key,
    empresa_id   bigint not null references public.empresas(id) on delete cascade,
    codigo       text not null,          -- cifrado (extensions.crypt)
    alcance      text not null,          -- 'ver' o 'corregir' (ver y corregir)
    creada_por   bigint references public.usuarios(id) on delete set null,
    creada_en    timestamptz not null default now(),
    vence_en     timestamptz not null,
    usada_por    bigint references public.usuarios(id) on delete set null, -- el Desarrollador que entró con ella
    usada_en     timestamptz,
    anulada_por  bigint references public.usuarios(id) on delete set null,
    anulada_en   timestamptz,

    constraint soporte_llaves_alcance_valido check (alcance in ('ver', 'corregir'))
);
create index if not exists soporte_llaves_empresa_idx on public.soporte_llaves (empresa_id, vence_en desc);

-- Bitácora de soporte: lo que vio y cambió el Desarrollador en cada empresa, y quién dio,
-- usó o anuló las llaves. Nadie la cambia ni la borra (solo desde el SQL Editor).
-- La ve el Admin TI y el Administrador de la empresa (Configuración -> Soporte).
create table if not exists public.soporte_bitacora (
    id          bigint generated always as identity primary key,
    creado_en   timestamptz not null default now(),
    empresa_id  bigint,          -- sin llave foránea: se conserva aunque se borre la empresa
    usuario_id  bigint,          -- quién lo hizo
    usuario     text,            -- su usuario en ese momento (ej. desar)
    accion      text not null,
    tabla       text,
    registro    text,            -- id (o clave) de la fila
    detalle     jsonb,

    constraint soporte_bitacora_accion_valida check (accion in (
        'llave_creada', 'llave_usada', 'llave_anulada', 'codigo_equivocado', 'llaves_bloqueadas',
        'vio', 'creo', 'cambio', 'borro', 'bloqueo', 'desbloqueo', 'cerro_sesiones'))
);
create index if not exists soporte_bitacora_empresa_idx on public.soporte_bitacora (empresa_id, creado_en desc);
create index if not exists soporte_bitacora_usuario_idx on public.soporte_bitacora (usuario_id, accion, creado_en desc);


-- ==================================================
-- EMPRESA DE CADA FILA (triggers)
-- La página pone la empresa activa; la base la corrige según la tienda o la región.
-- ==================================================

-- De su tienda (pedidos, rutas)
create or replace function public.empresa_de_tienda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.tienda_id is not null then
        select t.empresa_id into new.empresa_id from public.tiendas t where t.id = new.tienda_id;
    end if;
    return new;
end;
$$;

-- De su región (tiendas, descuentos)
create or replace function public.empresa_de_region()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.region is not null then
        select r.empresa_id into new.empresa_id from public.regiones r where r.codigo = new.region;
    end if;
    return new;
end;
$$;

-- De su tienda o de su región (tarifas; la general queda con la empresa que la crea)
create or replace function public.empresa_de_lugar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.tienda_id is not null then
        select t.empresa_id into new.empresa_id from public.tiendas t where t.id = new.tienda_id;
    elsif new.region is not null then
        select r.empresa_id into new.empresa_id from public.regiones r where r.codigo = new.region;
    end if;
    return new;
end;
$$;

-- Usuarios: de su tienda, su región o (cliente) su cliente. El Desarrollador: ninguna.
create or replace function public.empresa_de_usuario()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.rol = 'desarrollador' then
        new.empresa_id := null;
    elsif new.tienda_id is not null then
        select t.empresa_id into new.empresa_id from public.tiendas t where t.id = new.tienda_id;
    elsif new.region is not null then
        select r.empresa_id into new.empresa_id from public.regiones r where r.codigo = new.region;
    elsif new.cliente_id is not null then
        select c.empresa_id into new.empresa_id from public.clientes c where c.id = new.cliente_id;
    end if;
    return new;
end;
$$;

drop trigger if exists tiendas_empresa on public.tiendas;
create trigger tiendas_empresa before insert or update of region on public.tiendas
    for each row execute function public.empresa_de_region();
drop trigger if exists usuarios_empresa on public.usuarios;
create trigger usuarios_empresa before insert or update of tienda_id, region, rol, cliente_id on public.usuarios
    for each row execute function public.empresa_de_usuario();


-- ==================================================
-- USUARIOS: PROTEGIDOS, INICIO DE SESIÓN (SUPABASE AUTH) Y SEGURIDAD
-- Cada usuario tiene su acceso en Supabase Auth (auth.users) con un correo interno que
-- nadie ve: "jperez01" -> jperez01@acachete.interno. La persona solo escribe su usuario;
-- js/secciones/loggin.js arma el correo (js/supabase.js: correoInterno).
-- La contraseña vive SOLO en Supabase Auth. La columna usuarios.clave es un buzón: la
-- página escribe ahí la contraseña al crear el usuario o al cambiarla, la base la pasa a
-- Supabase Auth y la deja vacía.
-- Las reglas de acceso (11_acceso_web.sql) y las funciones preguntan "¿quién soy?" con
-- yo(), mi_empresa(), mi_cliente(), es_desarrollador(), es_personal() y puede('x.y').
-- ==================================================

-- "desar" y "admin" no se pueden eliminar ni cambiar de usuario o rol
create or replace function public.proteger_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' and old.id_usuario in ('admin', 'desar') then
        raise exception 'El usuario % está protegido y no se puede eliminar.', old.id_usuario
            using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and old.id_usuario in ('admin', 'desar')
       and (new.id_usuario <> old.id_usuario or new.rol <> old.rol) then
        raise exception 'Al usuario % no se le puede cambiar el usuario ni el rol.', old.id_usuario
            using errcode = 'P0001';
    end if;
    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

drop trigger if exists usuarios_proteger_admin on public.usuarios;
create trigger usuarios_proteger_admin
    before update or delete on public.usuarios
    for each row execute function public.proteger_admin();

-- Correo interno del usuario en Supabase Auth (el mismo que arma js/supabase.js: correoInterno)
create or replace function public.correo_interno(p_id_usuario text)
returns text
language sql
immutable
set search_path = ''
as $$
    select lower(btrim(coalesce(p_id_usuario, ''))) || '@acachete.interno';
$$;

-- Crea o actualiza el acceso del usuario en Supabase Auth: al crearlo, al cambiarle la
-- contraseña o al cambiarle el usuario (ej. cambió el ID de la empresa). auth_id lo pone
-- SOLO la base. Si a alguien le borraron el acceso en Supabase, se crea de nuevo cuando
-- le pongan una contraseña.
create or replace function public.usuarios_sincronizar_acceso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_correo text := public.correo_interno(new.id_usuario);
    v_clave  text := nullif(new.clave, '');
    v_id     uuid;
begin
    if tg_op = 'INSERT' then
        new.auth_id := null;
    else
        new.auth_id := old.auth_id;
    end if;
    if v_clave is not null and char_length(v_clave) not between 4 and 72 then
        raise exception 'La contraseña debe tener de 4 a 72 caracteres.' using errcode = 'P0001';
    end if;

    if new.auth_id is null then
        if v_clave is null then
            if tg_op = 'INSERT' then
                raise exception 'Falta la contraseña del usuario.' using errcode = 'P0001';
            end if;
        else
            if exists (select 1 from auth.users a join public.usuarios u on u.auth_id = a.id
                        where a.email = v_correo and u.id is distinct from new.id) then
                raise exception 'El usuario "%" ya existe.', new.id_usuario using errcode = '23505';
            end if;
            -- Acceso suelto con ese correo (ej. de una instalación anterior): se reutiliza
            select a.id into v_id
              from auth.users a
             where a.email = v_correo
               and not exists (select 1 from public.usuarios u where u.auth_id = a.id);
            if v_id is null then
                v_id := gen_random_uuid();
                insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                                        confirmation_token, recovery_token, email_change_token_new, email_change)
                values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_correo,
                        extensions.crypt(v_clave, extensions.gen_salt('bf', 10)), now(),
                        '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now(),
                        '', '', '', '');
                insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
                values (gen_random_uuid(), v_id, v_id::text,
                        jsonb_build_object('sub', v_id::text, 'email', v_correo, 'email_verified', true),
                        'email', now(), now(), now());
            else
                update auth.users
                   set encrypted_password = extensions.crypt(v_clave, extensions.gen_salt('bf', 10)),
                       email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
                 where id = v_id;
            end if;
            new.auth_id := v_id;
        end if;
    else
        if tg_op = 'UPDATE' then
            if new.id_usuario is distinct from old.id_usuario then
                update auth.users set email = v_correo, updated_at = now() where id = new.auth_id;
                update auth.identities
                   set identity_data = identity_data || jsonb_build_object('email', v_correo), updated_at = now()
                 where user_id = new.auth_id and provider = 'email';
            end if;
        end if;
        if v_clave is not null then
            update auth.users
               set encrypted_password = extensions.crypt(v_clave, extensions.gen_salt('bf', 10)), updated_at = now()
             where id = new.auth_id;
        end if;
    end if;

    new.clave := null;  -- la contraseña queda solo en Supabase Auth
    return new;
end;
$$;

-- Al borrar el usuario se borra también su acceso (y sus sesiones abiertas)
create or replace function public.usuarios_borrar_acceso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if old.auth_id is not null then
        delete from auth.users where id = old.auth_id;
    end if;
    return old;
end;
$$;

drop trigger if exists usuarios_sincronizar_acceso on public.usuarios;
create trigger usuarios_sincronizar_acceso before insert or update on public.usuarios
    for each row execute function public.usuarios_sincronizar_acceso();
drop trigger if exists usuarios_borrar_acceso on public.usuarios;
create trigger usuarios_borrar_acceso after delete on public.usuarios
    for each row execute function public.usuarios_borrar_acceso();

-- ---------- ¿Quién soy? ----------

-- ¿La llamada viene de adentro (SQL Editor, tareas de la base o la clave de servidor)?
-- Ahí no hay sesión de la página y se confía en los datos que llegan. La página siempre
-- llama con la clave pública ("anon") o con la sesión de un usuario ("authenticated").
create or replace function public.llamada_interna()
returns boolean
language sql
stable
set search_path = ''
as $$
    select auth.uid() is null
       and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') not in ('anon', 'authenticated');
$$;

-- El usuario de la sesión: aprobado y de una empresa activa (el Desarrollador no tiene
-- empresa). Sin sesión, o si no cumple, una fila vacía (id null).
create or replace function public.yo_usuario()
returns public.usuarios
language sql
stable
security definer
set search_path = ''
as $$
    select u.*
      from public.usuarios u
     where u.auth_id = auth.uid()
       and u.aprobado
       and (u.rol = 'desarrollador' or exists (select 1 from public.empresas e where e.id = u.empresa_id and e.activa));
$$;

create or replace function public.yo()
returns bigint
language sql
stable
set search_path = ''
as $$ select (public.yo_usuario()).id; $$;

create or replace function public.mi_empresa()
returns bigint
language sql
stable
set search_path = ''
as $$ select (public.yo_usuario()).empresa_id; $$;

-- Solo el rol cliente: su fila en la tabla clientes
create or replace function public.mi_cliente()
returns bigint
language sql
stable
set search_path = ''
as $$ select (public.yo_usuario()).cliente_id; $$;

create or replace function public.es_desarrollador()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce((public.yo_usuario()).rol = 'desarrollador', false); $$;

-- Personal de la empresa (todos menos el rol cliente). Incluye al Desarrollador.
create or replace function public.es_personal()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce((public.yo_usuario()).rol <> 'cliente', false); $$;

-- ---------- Soporte: lo que el Desarrollador puede hacer en cada empresa ----------
-- El Desarrollador SIEMPRE ve la configuración y la lista de usuarios de todas las empresas,
-- y puede hacer las acciones de emergencia (soporte_emergencia). Lo demás depende de la
-- empresa (Configuración -> Soporte):
--   'config'   -> cambiar su configuración, tiendas y usuarios: mientras la empresa no tenga
--                 Admin TI (puesta en marcha) o con una llave "ver y corregir"
--   'ver'      -> ver sus datos (clientes, pedidos, viajes, inventario, precios, cajas): con llave
--   'corregir' -> cambiar esos datos: con llave "ver y corregir"
-- Lo hace cumplir 11_acceso_web.sql (reglas) y cada función con soporte_exigir.

-- Empresas en las que el Desarrollador de la sesión puede eso. Los demás: ninguna (trabajan con
-- la suya, mi_empresa()).
create or replace function public.soporte_empresas(p_nivel text)
returns setof bigint
language sql
stable
security definer
set search_path = ''
as $$
    select e.id
      from public.empresas e, public.yo_usuario() u
     where u.rol = 'desarrollador'
       and case p_nivel
               when 'ver' then exists (
                   select 1 from public.soporte_llaves l
                    where l.empresa_id = e.id and l.usada_por = u.id and l.anulada_en is null and l.vence_en > now())
               when 'corregir' then exists (
                   select 1 from public.soporte_llaves l
                    where l.empresa_id = e.id and l.usada_por = u.id and l.anulada_en is null and l.vence_en > now()
                      and l.alcance = 'corregir')
               when 'config' then not exists (select 1 from public.usuarios a where a.empresa_id = e.id and a.admin_ti)
                   or exists (
                   select 1 from public.soporte_llaves l
                    where l.empresa_id = e.id and l.usada_por = u.id and l.anulada_en is null and l.vence_en > now()
                      and l.alcance = 'corregir')
               else false
           end;
$$;

-- ¿El Desarrollador de la sesión puede eso en esa empresa? (desde el SQL Editor, sí)
create or replace function public.soporte_puede(p_empresa bigint, p_nivel text)
returns boolean
language sql
stable
set search_path = ''
as $$
    select public.llamada_interna() or coalesce(p_empresa in (select public.soporte_empresas(p_nivel)), false);
$$;

-- Para las funciones que dejan pasar al Desarrollador: si no tiene la llave, error.
-- (A los demás usuarios no les hace nada: sus reglas son las de siempre.)
create or replace function public.soporte_exigir(p_empresa bigint, p_nivel text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
    if public.es_desarrollador() and not public.soporte_puede(p_empresa, p_nivel) then
        raise exception '%', case p_nivel
            when 'config' then 'Esta empresa ya tiene Admin TI: para cambiar su configuración pide una llave de soporte "Ver y corregir".'
            when 'ver'    then 'Para ver los datos de esta empresa pide una llave de soporte a su Admin TI.'
            else 'Para cambiar los datos de esta empresa pide una llave de soporte "Ver y corregir" a su Admin TI.'
        end using errcode = '42501';
    end if;
end;
$$;

-- ¿Puede ver los datos de esa empresa? (la suya; el Desarrollador, con la llave de soporte)
create or replace function public.ve_empresa(p_empresa bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
    select public.llamada_interna() or coalesce(p_empresa = public.mi_empresa(), false) or public.soporte_puede(p_empresa, 'ver');
$$;

-- ¿Puede cambiar la configuración de esa empresa (tiendas, regiones, usuarios...)? La suya; el
-- Desarrollador, en la puesta en marcha o con la llave "Ver y corregir".
create or replace function public.configura_empresa(p_empresa bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
    select public.llamada_interna() or coalesce(p_empresa = public.mi_empresa(), false) or public.soporte_puede(p_empresa, 'config');
$$;

create or replace function public.mi_rol()
returns text
language sql
stable
set search_path = ''
as $$ select (public.yo_usuario()).rol; $$;

-- Solo el Admin G2: su región (ej. 'NOR')
create or replace function public.mi_region()
returns text
language sql
stable
set search_path = ''
as $$ select (public.yo_usuario()).region; $$;

-- ---------- Alcance dentro de la empresa (lo mismo que filtra cada sección) ----------
-- ¿Ve todos los pedidos y cajas de su empresa? Administrador, G1 y el Desarrollador.
create or replace function public.ve_toda_la_empresa()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(public.mi_rol() in ('desarrollador', 'administrador', 'admin_g1'), false); $$;

-- Tiendas de su alcance: G2 las de su región; G3 y Empleado la suya. (Administrador y G1:
-- todas las de su empresa; Piloto y cliente: ninguna, el piloto ve sus propios pedidos.)
create or replace function public.mis_tiendas()
returns setof bigint
language sql
stable
security definer
set search_path = ''
as $$
    select t.id
      from public.tiendas t, public.yo_usuario() u
     where u.id is not null
       and (u.rol = 'desarrollador'
            or (t.empresa_id = u.empresa_id
                and (u.rol in ('administrador', 'admin_g1')
                     or (u.rol = 'admin_g2' and t.region = u.region)
                     or (u.rol in ('admin_g3', 'empleado') and t.id = u.tienda_id))));
$$;

-- Pilotos de esas tiendas: sus pedidos y su caja se ven aunque sean de otra tienda (multitienda)
create or replace function public.mis_pilotos()
returns setof bigint
language sql
stable
security definer
set search_path = ''
as $$
    select p.id from public.usuarios p
     where p.rol = 'piloto' and p.tienda_id in (select public.mis_tiendas());
$$;

-- ---------- Funciones del usuario (tablas funciones y usuario_funciones) ----------

-- ¿El usuario tiene esa función ('pedidos.alistar') o ese módulo ('pedidos')? Lo de su
-- rol, salvo lo que se le dio o se le quitó a él; una función pide además su módulo.
-- Al piloto y al cliente solo se les puede quitar. Administrador y Desarrollador: todo.
-- ('clientes' es una pestaña de Tiendas: cuenta como el módulo 'tiendas'.)
create or replace function public.tiene_funcion(u public.usuarios, p_clave text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select case
        when u.id is null then false
        when u.rol in ('desarrollador', 'administrador') then true
        else coalesce((
            select bool_and(case when u.rol in ('piloto', 'cliente') then x.por_rol and coalesce(x.propio, true)
                                 else coalesce(x.propio, x.por_rol) end)
              from (select u.rol = any (f.roles) as por_rol,
                           (select uf.permitido from public.usuario_funciones uf
                             where uf.usuario_id = u.id and uf.funcion = f.clave) as propio
                      from public.funciones f
                     where f.clave in (c.clave, split_part(c.clave, '.', 1))) x
            having count(*) = case when c.clave like '%.%' then 2 else 1 end
        ), false)
    end
      from (select regexp_replace(coalesce(p_clave, ''), '^clientes(\.|$)', 'tiendas\1') as clave) c;
$$;

-- Módulos y funciones del usuario de la sesión: { "pedidos": true, "pedidos.asignar": false, ... }
-- (js/sesion.js: puedeHacer y tienePermiso; lo lee al iniciar sesión y al abrir la página)
create or replace function public.mis_funciones()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(jsonb_object_agg(f.clave, public.tiene_funcion(u, f.clave)), '{}'::jsonb)
      from public.funciones f, public.yo_usuario() u
     where u.id is not null;
$$;

-- ¿El usuario de la sesión puede hacer eso? Ej.: public.puede('configuracion.general')
create or replace function public.puede(p_clave text)
returns boolean
language sql
stable
set search_path = ''
as $$ select public.llamada_interna() or public.tiene_funcion(public.yo_usuario(), p_clave); $$;

-- Usuario que hace una acción (lo usan las funciones de Viajes, Caja, Distribuidora,
-- Recolecciones...): la página manda su id y la base confirma que es el de la sesión,
-- aprobado y de una empresa activa. Desde adentro (SQL Editor) se confía en el id.
create or replace function public.usuario_activo(p_usuario bigint)
returns public.usuarios
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    u public.usuarios;
begin
    if public.llamada_interna() then
        select * into u from public.usuarios where id = p_usuario and aprobado;
    else
        u := public.yo_usuario();
    end if;
    if u.id is null or u.id is distinct from p_usuario then
        raise exception 'Usuario no válido: vuelve a iniciar sesión.' using errcode = 'P0001';
    end if;
    return u;
end;
$$;

-- ---------- Quién cambia qué en la tabla usuarios ----------

-- ¿"yo" puede crear, modificar o borrar al usuario u? (p_funcion: 'usuarios.crear' o
-- 'usuarios.modificar'). Las mismas reglas que js/secciones/usuarios.js (puedeGestionar):
--   Administrador -> cualquiera de su empresa (menos el Desarrollador)
--   Clientes      -> quien registra o administra clientes (Tiendas -> Clientes)
--   Admin G1      -> Empleados y Pilotos
--   Admin G2      -> Empleados y Pilotos de las tiendas de SU región
--   G3 / Empleado -> Empleados de SU tienda (menos él mismo)
create or replace function public.puede_manejar_usuario(yo public.usuarios, u public.usuarios, p_funcion text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select case
        when u.rol = 'desarrollador' then false
        when yo.rol = 'administrador' then true
        when u.rol = 'cliente' then public.tiene_funcion(yo, 'tiendas.clientes_crear')
                                    or public.tiene_funcion(yo, 'tiendas.clientes_administrar')
        when not public.tiene_funcion(yo, p_funcion) then false
        when yo.rol = 'admin_g1' then u.rol in ('empleado', 'piloto')
        when yo.rol = 'admin_g2' then u.rol in ('empleado', 'piloto')
             and exists (select 1 from public.tiendas t where t.id = u.tienda_id and t.region = yo.region)
        when yo.rol in ('admin_g3', 'empleado') then u.rol = 'empleado' and u.tienda_id = yo.tienda_id
             and u.id is distinct from yo.id
        else false
    end;
$$;

-- Guarda los módulos y funciones de un usuario (Usuarios -> "Módulos y funciones").
-- p_marcadas: las claves marcadas en el formulario; null = "lo de su rol". Se guarda solo
-- lo distinto a su rol (al piloto solo lo que se le quita). Quién: el que puede crear o
-- modificar a ese usuario (puede_manejar_usuario); nadie cambia los suyos.
create or replace function public.usuario_guardar_funciones(p_usuario bigint, p_marcadas text[] default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    yo public.usuarios := public.yo_usuario();
    u  public.usuarios;
begin
    select * into u from public.usuarios where id = p_usuario;
    if not found then
        raise exception 'Ese usuario no existe.' using errcode = 'P0001';
    end if;
    if not public.llamada_interna() and coalesce(yo.rol, '') <> 'desarrollador' then
        if yo.id is null or yo.id = u.id or not public.ve_empresa(u.empresa_id)
           or not (public.puede_manejar_usuario(yo, u, 'usuarios.modificar')
                   or public.puede_manejar_usuario(yo, u, 'usuarios.crear')) then
            raise exception 'No tienes permiso para cambiar los módulos de este usuario.' using errcode = '42501';
        end if;
    end if;
    perform public.soporte_exigir(u.empresa_id, 'config');

    delete from public.usuario_funciones where usuario_id = u.id;
    if p_marcadas is null or u.rol in ('desarrollador', 'administrador', 'cliente') then
        return;
    end if;
    insert into public.usuario_funciones (usuario_id, funcion, permitido)
    select u.id, f.clave, f.clave = any (p_marcadas)
      from public.funciones f
     where (f.clave = any (p_marcadas)) <> (u.rol = any (f.roles))
       and (u.rol <> 'piloto' or u.rol = any (f.roles));
end;
$$;

-- Revisa lo que la página cambia DIRECTO en usuarios (Usuarios, Clientes, Mi perfil, foto,
-- cajas). Cada uno puede cambiar en su propio usuario solo sus datos personales, su foto y
-- su contraseña (nunca su rol, tienda, permisos ni aprobación). Lo que hacen las funciones
-- de la base (registro de clientes, cambiar el ID de la empresa...) no pasa por aquí.
-- Admin TI (columna admin_ti): lo nombra o lo quita solo un Administrador de la empresa. El
-- Desarrollador puede nombrarlo (al dejar lista la empresa), pero nunca quitarlo, borrarlo ni
-- moverlo: así no recupera la puesta en marcha. (En qué empresas puede cambiar usuarios lo
-- dicen las reglas de 11_acceso_web.sql: configura_empresa.)
create or replace function public.usuarios_revisar_cambio()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    yo       public.usuarios;
    v_libres constant text[] := array['nombre', 'telefono', 'cedula', 'departamento', 'clave', 'foto_url'];
    v_funcion text := case when tg_op = 'INSERT' then 'usuarios.crear' else 'usuarios.modificar' end;
begin
    if current_user <> 'authenticated' then
        return case when tg_op = 'DELETE' then old else new end;
    end if;
    yo := public.yo_usuario();
    if yo.id is null then
        raise exception 'Tu sesión no es válida: vuelve a iniciar sesión.' using errcode = '42501';
    end if;
    if yo.rol = 'desarrollador' then
        if tg_op in ('UPDATE', 'DELETE') and old.admin_ti
           and (tg_op = 'DELETE' or not new.admin_ti or new.empresa_id is distinct from old.empresa_id) then
            raise exception 'Al Admin TI solo lo quita o lo borra un Administrador de su empresa.' using errcode = '42501';
        end if;
        return case when tg_op = 'DELETE' then old else new end;
    end if;

    if (tg_op = 'INSERT' and new.admin_ti) or (tg_op = 'UPDATE' and new.admin_ti is distinct from old.admin_ti) then
        if yo.rol <> 'administrador' then
            raise exception 'Solo un Administrador nombra o quita al Admin TI.' using errcode = '42501';
        end if;
    end if;

    if tg_op = 'UPDATE' then
        if old.id = yo.id and yo.rol <> 'administrador' then
            if (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
                raise exception 'En tu usuario solo puedes cambiar tus datos, tu foto y tu contraseña.' using errcode = '42501';
            end if;
            return new;
        end if;
    end if;

    if tg_op in ('UPDATE', 'DELETE') then
        if not public.puede_manejar_usuario(yo, old, v_funcion) then
            raise exception 'No tienes permiso para cambiar a este usuario.' using errcode = '42501';
        end if;
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
        if not public.puede_manejar_usuario(yo, new, v_funcion) then
            raise exception 'No tienes permiso para dejar al usuario así (rol, tienda o región).' using errcode = '42501';
        end if;
        -- Lo que crea un G3 o un Empleado queda por aprobar
        if tg_op = 'INSERT' and yo.rol in ('admin_g3', 'empleado') and new.rol <> 'cliente' and new.aprobado then
            raise exception 'Los usuarios que crea un G3 o un Empleado quedan por aprobar.' using errcode = '42501';
        end if;
    end if;
    return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists usuarios_revisar_cambio on public.usuarios;
create trigger usuarios_revisar_cambio before insert or update or delete on public.usuarios
    for each row execute function public.usuarios_revisar_cambio();

-- La página NO puede leer la columna clave: se le da permiso de lectura a todas las
-- demás columnas de usuarios. Se llama en 11_acceso_web.sql y, si algún día se agrega
-- una columna a usuarios, hay que volver a llamarla: select public.usuarios_ocultar_clave();
create or replace function public.usuarios_ocultar_clave()
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_columnas text;
begin
    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) into v_columnas
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = 'usuarios' and c.column_name <> 'clave';
    execute 'revoke select on public.usuarios from anon, authenticated';
    execute format('grant select (%s) on public.usuarios to authenticated', v_columnas);
end;
$$;


-- ==================================================
-- AVISOS (campana) QUE MANDA LA BASE
-- ==================================================

-- Algo ya se resolvió (aprobado, rechazado o eliminado): sus avisos "pendiente" quedan
-- leídos para todos los que los recibieron en la empresa (js/notificaciones.js: resolverPendientes)
create or replace function public.resolver_pendientes(p_tipo text, p_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
    update public.notificaciones n
       set leida = true
     where n.tipo = 'pendiente' and n.referencia_tipo = p_tipo and n.referencia_id = p_id and not n.leida
       and public.es_personal()
       and exists (select 1 from public.usuarios u where u.id = n.usuario_id and public.ve_empresa(u.empresa_id));
$$;

-- Aviso "pendiente" a quien aprueba algo de una tienda: su Admin G3; si no tiene, el G2
-- de la región; si tampoco (o no hay tienda), el Administrador y el G1 de la empresa.
-- Lo mismo que js/notificaciones.js (notificarPendiente con soloTienda).
create or replace function public.avisar_aprobadores(p_empresa bigint, p_tienda bigint, p_tipo text, p_id bigint,
    p_titulo text, p_mensaje text, p_enlace text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_region text;
    v_ids    bigint[];
begin
    select t.region into v_region from public.tiendas t where t.id = p_tienda and t.empresa_id = p_empresa;
    if p_tienda is not null then
        select array_agg(u.id) into v_ids from public.usuarios u
         where u.aprobado and u.rol = 'admin_g3' and u.tienda_id = p_tienda;
    end if;
    if v_ids is null and v_region is not null then
        select array_agg(u.id) into v_ids from public.usuarios u
         where u.aprobado and u.rol = 'admin_g2' and u.empresa_id = p_empresa and u.region = v_region;
    end if;
    if v_ids is null then
        select array_agg(u.id) into v_ids from public.usuarios u
         where u.aprobado and u.rol in ('administrador', 'admin_g1') and u.empresa_id = p_empresa;
    end if;
    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, enlace, referencia_tipo, referencia_id)
    select x, 'pendiente', p_titulo, p_mensaje, p_enlace, p_tipo, p_id
      from unnest(coalesce(v_ids, '{}'::bigint[])) x;
end;
$$;


-- ==================================================
-- USUARIO CON EL ID DE LA EMPRESA ("jperez01")
-- ==================================================

-- "jperez" a partir del usuario completo, en cualquier formato:
--   cenjperez01 / cen001jperez01 / cen-001-jperez / jperez01 / jperez
create or replace function public.usuario_base(p_id_usuario text, p_codigo_empresa text, p_codigo_tienda text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
    v_id     text := coalesce(p_id_usuario, '');
    v_tienda text := regexp_replace(lower(coalesce(p_codigo_tienda, '')), '[^a-z0-9]', '', 'g');
    v_region text := lower(left(coalesce(p_codigo_tienda, ''), 3));
    v_emp    text := coalesce(p_codigo_empresa, '');
begin
    if p_codigo_tienda is not null then
        if v_id like lower(p_codigo_tienda) || '-%' then                                   -- cen-001-jperez
            v_id := substr(v_id, length(p_codigo_tienda) + 2);
        elsif v_tienda <> '' and v_id like v_tienda || '%' and length(v_id) > length(v_tienda) then -- cen001jperez
            v_id := substr(v_id, length(v_tienda) + 1);
        elsif v_region <> '' and v_id like v_region || '%' and length(v_id) > length(v_region) then -- cenjperez
            v_id := substr(v_id, length(v_region) + 1);
        end if;
    end if;
    if v_emp <> '' and right(v_id, length(v_emp)) = v_emp and length(v_id) > length(v_emp) then
        v_id := left(v_id, length(v_id) - length(v_emp));
    end if;
    return v_id;
end;
$$;

-- prefijo (opcional) + nombre + ID de la empresa: "jperez" + "01"
create or replace function public.usuario_completo(p_base text, p_codigo_empresa text, p_codigo_tienda text)
returns text
language sql
immutable
set search_path = ''
as $$
    select coalesce(lower(left(p_codigo_tienda, 3)), '') || p_base || coalesce(p_codigo_empresa, '');
$$;

-- Usuario completo que no choque con OTRO usuario: si "jperez01" ya existe, prueba
-- "jperez201", "jperez301"...
create or replace function public.usuario_libre(p_base text, p_codigo_empresa text, p_codigo_tienda text, p_usuario_id bigint)
returns text
language plpgsql
set search_path = ''
as $$
declare
    v_n  integer := 1;
    v_id text := public.usuario_completo(p_base, p_codigo_empresa, p_codigo_tienda);
begin
    while exists (select 1 from public.usuarios where id_usuario = v_id and id <> p_usuario_id) loop
        v_n := v_n + 1;
        v_id := public.usuario_completo(p_base || v_n, p_codigo_empresa, p_codigo_tienda);
    end loop;
    return v_id;
end;
$$;

-- Cambiar el ID de una empresa (solo el Desarrollador): sus usuarios cambian solo el ID
-- del final (jperez01 -> jperez07) y su acceso en Supabase Auth con ellos
create or replace function public.cambiar_codigo_empresa(p_empresa_id bigint, p_codigo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_viejo text;
    v_nuevo text := btrim(coalesce(p_codigo, ''));
    r       record;
begin
    if not (public.llamada_interna() or public.es_desarrollador()) then
        raise exception 'Solo el Desarrollador cambia el ID de una empresa.' using errcode = '42501';
    end if;
    perform public.soporte_exigir(p_empresa_id, 'config');
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

-- ¿El usuario de la sesión administra las tiendas de esa tienda? (Tiendas -> "Crear y
-- modificar tiendas y regiones")
create or replace function public.puede_cambiar_tienda(p_tienda_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (select 1 from public.tiendas t where t.id = p_tienda_id and public.configura_empresa(t.empresa_id))
       and public.puede('tiendas.gestionar');
$$;

-- Cambiar SOLO el código de una tienda (no cambia la región ni los usuarios)
create or replace function public.cambiar_codigo_tienda(p_tienda_id bigint, p_nuevo_codigo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_codigo text := upper(btrim(coalesce(p_nuevo_codigo, '')));
begin
    if not exists (select 1 from public.tiendas where id = p_tienda_id) then
        raise exception 'La tienda no existe.' using errcode = 'P0002';
    end if;
    if not public.puede_cambiar_tienda(p_tienda_id) then
        raise exception 'No tienes permiso para cambiar esta tienda.' using errcode = '42501';
    end if;
    update public.tiendas set codigo = v_codigo where id = p_tienda_id and codigo <> v_codigo;
end;
$$;

-- Poner, cambiar o quitar (p_region vacío o null) la región de una tienda
create or replace function public.cambiar_region_tienda(p_tienda_id bigint, p_region text)
returns void
language plpgsql
security definer
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
    if not public.puede_cambiar_tienda(p_tienda_id) then
        raise exception 'No tienes permiso para cambiar esta tienda.' using errcode = '42501';
    end if;
    if v_region is not null
       and not exists (select 1 from public.regiones g where g.codigo = v_region and g.empresa_id = v_emp_id) then
        raise exception 'Esa región no existe en la empresa.' using errcode = 'P0001';
    end if;
    update public.tiendas set region = v_region
     where id = p_tienda_id and region is distinct from v_region;
end;
$$;


-- ==================================================
-- VISITAS (solo Desarrollador: Tiendas -> pestaña Visitas)
-- ==================================================

-- La página la llama al iniciar sesión ('ingreso') y al abrir cada pantalla ('pantalla').
-- La IP y el país los toma la base de la llamada. Las del Desarrollador no se guardan.
create or replace function public.registrar_visita(
    p_usuario bigint, p_tipo text default 'pantalla', p_seccion text default null,
    p_dispositivo text default null, p_navegador text default null, p_app boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    u          record;
    v_headers  jsonb;
    v_ip       text;
begin
    -- Solo el usuario de la sesión anota sus propias visitas
    if not public.llamada_interna() and p_usuario is distinct from public.yo() then
        return;
    end if;
    select x.rol, x.empresa_id into u from public.usuarios x where x.id = p_usuario;
    if not found or u.rol = 'desarrollador' or coalesce(p_tipo, '') not in ('ingreso', 'pantalla') then
        return;
    end if;

    -- Encabezados de la llamada (Supabase): IP real y país
    begin
        v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    exception when others then
        v_headers := null;
    end;
    v_ip := coalesce(nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
                     nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), ''),
                     nullif(btrim(v_headers ->> 'x-real-ip'), ''));

    delete from public.visitas where creado_en < now() - interval '3 days';

    insert into public.visitas (usuario_id, empresa_id, tipo, seccion, dispositivo, navegador, app, ip, pais)
    values (p_usuario, u.empresa_id, p_tipo, left(nullif(btrim(p_seccion), ''), 40),
            left(nullif(btrim(p_dispositivo), ''), 60), left(nullif(btrim(p_navegador), ''), 60),
            coalesce(p_app, false), left(v_ip, 60), left(nullif(btrim(v_headers ->> 'cf-ipcountry'), ''), 5));
end;
$$;

create or replace function public.reporte_visitas(p_usuario bigint, p_empresa bigint default null)
returns table (id bigint, creado_en timestamptz, empresa_id bigint, empresa_codigo text, empresa_nombre text,
               usuario_id bigint, usuario text, nombre text, rol text, tienda text, tipo text, seccion text,
               dispositivo text, navegador text, app boolean, ip text, pais text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
    if not (public.llamada_interna() or (public.es_desarrollador() and p_usuario = public.yo())) then
        raise exception 'Solo el Desarrollador ve el reporte de visitas.' using errcode = 'P0001';
    end if;

    delete from public.visitas v where v.creado_en < now() - interval '3 days';

    return query
        select v.id, v.creado_en, v.empresa_id, e.codigo::text, e.nombre::text,
               v.usuario_id, u.id_usuario::text, u.nombre::text, u.rol::text, t.nombre::text, v.tipo, v.seccion,
               v.dispositivo, v.navegador, v.app, v.ip, v.pais
          from public.visitas v
          left join public.usuarios u on u.id = v.usuario_id
          left join public.empresas e on e.id = v.empresa_id
          left join public.tiendas t on t.id = u.tienda_id
         where p_empresa is null or v.empresa_id = p_empresa
         order by v.creado_en desc
         limit 5000;
end;
$$;


-- ==================================================
-- SOPORTE: LLAVE DEL ADMIN TI, BITÁCORA Y ACCIONES DE EMERGENCIA
-- Tablas soporte_llaves y soporte_bitacora. Qué puede el Desarrollador en cada empresa:
-- soporte_empresas (arriba, "¿Quién soy?").
--   Configuración -> Soporte (Admin TI o Administrador): crear y anular la llave, ver la bitácora
--     (js/secciones/configuracion/soporte.js)
--   Franja de soporte (solo el Desarrollador): usar la llave (js/soporte.js)
--   Usuarios (solo el Desarrollador): bloquear, desbloquear y cerrar sesiones, sin llave
-- ==================================================

-- ¿El usuario de la sesión da las llaves de su empresa? (Admin TI o Administrador)
create or replace function public.es_admin_ti()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(u.rol = 'administrador' or u.admin_ti, false) from public.yo_usuario() u; $$;

-- Anota en la bitácora a nombre del usuario de la sesión
create or replace function public.soporte_anotar(p_empresa bigint, p_accion text, p_tabla text default null,
    p_registro text default null, p_detalle jsonb default null)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.soporte_bitacora (empresa_id, usuario_id, usuario, accion, tabla, registro, detalle)
    select p_empresa, u.id, u.id_usuario, p_accion, p_tabla, p_registro, p_detalle
      from public.yo_usuario() u;
$$;

-- Aviso (campana) al Administrador y al Admin TI de la empresa
create or replace function public.soporte_avisar(p_empresa bigint, p_titulo text, p_mensaje text)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, enlace)
    select u.id, 'info', p_titulo, p_mensaje, '#configuracion?modulo=soporte'
      from public.usuarios u
     where u.empresa_id = p_empresa and u.aprobado and (u.rol = 'administrador' or u.admin_ti);
$$;

-- La bitácora no se cambia ni se borra (salvo desde el SQL Editor)
create or replace function public.soporte_bitacora_fija()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if not public.llamada_interna() then
        raise exception 'La bitácora de soporte no se cambia ni se borra.' using errcode = '42501';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists soporte_bitacora_fija on public.soporte_bitacora;
create trigger soporte_bitacora_fija before update or delete on public.soporte_bitacora
    for each row execute function public.soporte_bitacora_fija();

-- Empresas (Tiendas -> Empresas, Configuración -> Planes): el plan y si está activa los cambia
-- el Desarrollador siempre (es su contrato con la empresa). Lo demás (nombre, paleta,
-- actividades, datos), en la puesta en marcha o con la llave "Ver y corregir".
create or replace function public.empresas_revisar_cambio()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_libres constant text[] := array['plan', 'funciones', 'activa'];
begin
    if current_user = 'authenticated' and not public.soporte_puede(old.id, 'config')
       and (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
        raise exception 'Esta empresa ya tiene Admin TI: para cambiar sus datos, colores o actividades pide una llave de soporte "Ver y corregir".'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists empresas_revisar_cambio on public.empresas;
create trigger empresas_revisar_cambio before update on public.empresas
    for each row execute function public.empresas_revisar_cambio();

-- Anota lo que crea, cambia o borra el Desarrollador en cualquier tabla (11_acceso_web.sql le
-- pone este trigger a todas). A los demás usuarios no les hace nada. De un cambio se guardan
-- los campos que cambiaron, no sus valores.
create or replace function public.soporte_anotar_cambio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_nueva   jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
    v_vieja   jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
    v_fila    jsonb := coalesce(to_jsonb(new), to_jsonb(old));
    v_empresa bigint;
    v_campos  jsonb;
begin
    if auth.uid() is null or not public.es_desarrollador() then
        return null;
    end if;
    -- Su propio usuario (perfil, foto) no se anota
    if tg_table_name = 'usuarios' and (v_fila ->> 'id')::bigint = public.yo() then
        return null;
    end if;
    if tg_op = 'UPDATE' then
        select jsonb_agg(n.key order by n.key) into v_campos
          from jsonb_each(v_nueva) n
         where n.value is distinct from (v_vieja -> n.key) and n.key not in ('clave', 'actualizado_en');
        if v_campos is null then
            return null;
        end if;
    end if;
    -- La empresa de la fila; si la tabla no la tiene (ej. pedido_historial), la de su llave en uso
    v_empresa := coalesce(case when tg_table_name = 'empresas' then (v_fila ->> 'id')::bigint
                               else (v_fila ->> 'empresa_id')::bigint end,
                          (select l.empresa_id from public.soporte_llaves l
                            where l.usada_por = public.yo() and l.anulada_en is null and l.vence_en > now()
                            order by l.usada_en desc limit 1));
    perform public.soporte_anotar(v_empresa,
        case tg_op when 'INSERT' then 'creo' when 'UPDATE' then 'cambio' else 'borro' end,
        tg_table_name, coalesce(v_fila ->> 'id', v_fila ->> 'clave', v_fila ->> 'codigo'),
        case when v_campos is not null then jsonb_build_object('campos', v_campos) end);
    return null;
end;
$$;

-- Nueva llave (Configuración -> Soporte). Reemplaza a la que esté vigente. El código
-- ("K7M2-Q9XP") se devuelve UNA sola vez: se le dicta o se le manda al Desarrollador.
-- p_horas: 1, 4 o 24 · p_alcance: 'ver' o 'corregir' (ver y corregir)
create or replace function public.soporte_crear_llave(p_horas integer, p_alcance text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    yo       public.usuarios := public.yo_usuario();
    v_letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- sin 0, O, 1, I ni L: no se confunden al dictarlas
    v_azar   bytea := extensions.gen_random_bytes(8);
    v_codigo text := '';
    l        public.soporte_llaves;
begin
    if yo.id is null or not (yo.rol = 'administrador' or yo.admin_ti) then
        raise exception 'Solo el Admin TI o un Administrador de la empresa da llaves de soporte.' using errcode = '42501';
    end if;
    if p_horas is null or p_horas not in (1, 4, 24) then
        raise exception 'La llave dura 1, 4 o 24 horas.' using errcode = 'P0001';
    end if;
    if p_alcance is null or p_alcance not in ('ver', 'corregir') then
        raise exception 'Elige si la llave es para ver o para ver y corregir.' using errcode = 'P0001';
    end if;
    for i in 0..7 loop
        v_codigo := v_codigo || substr(v_letras, get_byte(v_azar, i) % length(v_letras) + 1, 1)
                    || case when i = 3 then '-' else '' end;
    end loop;

    update public.soporte_llaves set anulada_en = now(), anulada_por = yo.id
     where empresa_id = yo.empresa_id and anulada_en is null and vence_en > now();
    insert into public.soporte_llaves (empresa_id, codigo, alcance, creada_por, vence_en)
    values (yo.empresa_id, extensions.crypt(v_codigo, extensions.gen_salt('bf', 8)), p_alcance, yo.id,
            now() + make_interval(hours => p_horas))
    returning * into l;
    perform public.soporte_anotar(yo.empresa_id, 'llave_creada', 'soporte_llaves', l.id::text,
        jsonb_build_object('alcance', p_alcance, 'horas', p_horas));
    return jsonb_build_object('id', l.id, 'codigo', v_codigo, 'alcance', l.alcance, 'vence_en', l.vence_en);
end;
$$;

-- Anular una llave de la empresa antes de que venza (el Desarrollador deja de ver al momento)
create or replace function public.soporte_anular_llave(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    yo public.usuarios := public.yo_usuario();
    l  public.soporte_llaves;
begin
    select * into l from public.soporte_llaves where id = p_id for update;
    if l.id is null or yo.id is null or l.empresa_id is distinct from yo.empresa_id
       or not (yo.rol = 'administrador' or yo.admin_ti) then
        raise exception 'Solo el Admin TI o un Administrador de la empresa anula sus llaves.' using errcode = '42501';
    end if;
    if l.anulada_en is not null or l.vence_en <= now() then
        return; -- ya no servía
    end if;
    update public.soporte_llaves set anulada_en = now(), anulada_por = yo.id where id = l.id;
    perform public.soporte_anotar(l.empresa_id, 'llave_anulada', 'soporte_llaves', l.id::text);
end;
$$;

-- Llaves de la empresa del usuario de la sesión (las últimas 30), sin el código
create or replace function public.soporte_llaves_empresa()
returns table (id bigint, alcance text, creada_en timestamptz, vence_en timestamptz, creada_por text,
               usada_en timestamptz, usada_por text, anulada_en timestamptz, anulada_por text, vigente boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
    if not public.es_admin_ti() then
        raise exception 'Solo el Admin TI o un Administrador de la empresa ve las llaves de soporte.' using errcode = '42501';
    end if;
    return query
        select l.id, l.alcance, l.creada_en, l.vence_en, c.nombre::text, l.usada_en, us.nombre::text,
               l.anulada_en, a.nombre::text, l.anulada_en is null and l.vence_en > now()
          from public.soporte_llaves l
          left join public.usuarios c on c.id = l.creada_por
          left join public.usuarios us on us.id = l.usada_por
          left join public.usuarios a on a.id = l.anulada_por
         where l.empresa_id = public.mi_empresa()
         order by l.creada_en desc
         limit 30;
end;
$$;

-- El Desarrollador entra con la llave que le dieron (franja de soporte, js/soporte.js).
-- Devuelve { ok: true, alcance, vence_en } o { ok: false, mensaje }. No lanza error con un
-- código equivocado: así queda en la bitácora. Con 5 equivocados en 30 minutos se anulan las
-- llaves sin usar de la empresa y se avisa a su Administrador y Admin TI.
create or replace function public.soporte_usar_llave(p_empresa bigint, p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    yo       public.usuarios := public.yo_usuario();
    v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
    v_fallos integer;
    l        public.soporte_llaves;
begin
    if yo.id is null or yo.rol <> 'desarrollador' then
        raise exception 'Solo el Desarrollador usa llaves de soporte.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.empresas e where e.id = p_empresa) then
        raise exception 'La empresa no existe.' using errcode = 'P0001';
    end if;
    select count(*) into v_fallos from public.soporte_bitacora b
     where b.usuario_id = yo.id and b.empresa_id = p_empresa and b.accion = 'codigo_equivocado'
       and b.creado_en > now() - interval '30 minutes';
    if v_fallos >= 5 then
        return jsonb_build_object('ok', false, 'mensaje', 'Demasiados códigos equivocados: espera 30 minutos y pide una llave nueva.');
    end if;
    v_codigo := left(v_codigo, 4) || '-' || substr(v_codigo, 5);

    select * into l from public.soporte_llaves s
     where s.empresa_id = p_empresa and s.anulada_en is null and s.vence_en > now()
       and (s.usada_por is null or s.usada_por = yo.id)
       and s.codigo = extensions.crypt(v_codigo, s.codigo)
     order by s.creada_en desc
     limit 1
       for update;
    if l.id is null then
        perform pg_sleep(0.4); -- frena a quien prueba códigos al azar
        perform public.soporte_anotar(p_empresa, 'codigo_equivocado');
        if v_fallos + 1 >= 5 then
            update public.soporte_llaves set anulada_en = now()
             where empresa_id = p_empresa and anulada_en is null and vence_en > now() and usada_en is null;
            perform public.soporte_anotar(p_empresa, 'llaves_bloqueadas');
            perform public.soporte_avisar(p_empresa, 'Llave de soporte bloqueada',
                'Se escribieron 5 códigos equivocados y se anuló la llave sin usar. Si era el Desarrollador, dale una nueva.');
            return jsonb_build_object('ok', false, 'mensaje', 'Demasiados códigos equivocados: la llave se anuló. Pide una nueva.');
        end if;
        return jsonb_build_object('ok', false, 'mensaje', 'Código equivocado, vencido o anulado.');
    end if;

    if l.usada_en is null then
        update public.soporte_llaves set usada_por = yo.id, usada_en = now() where id = l.id;
        perform public.soporte_anotar(p_empresa, 'llave_usada', 'soporte_llaves', l.id::text,
            jsonb_build_object('alcance', l.alcance));
        perform public.soporte_avisar(p_empresa, 'El Desarrollador entró con la llave de soporte',
            format('%s hasta las %s. La puedes anular en Configuración → Soporte.',
                   case when l.alcance = 'corregir' then 'Puede ver y corregir los datos' else 'Puede ver los datos (sin cambiarlos)' end,
                   to_char(l.vence_en at time zone 'America/Costa_Rica', 'HH24:MI')));
    end if;
    return jsonb_build_object('ok', true, 'alcance', l.alcance, 'vence_en', l.vence_en);
end;
$$;

-- Para la franja del Desarrollador (js/soporte.js): ¿la empresa tiene Admin TI? ¿hay una llave en uso?
-- { admin_ti, llave: { alcance, vence_en } | null }. A los demás usuarios: null.
create or replace function public.soporte_estado(p_empresa bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select case when public.es_desarrollador() then jsonb_build_object(
        'admin_ti', exists (select 1 from public.usuarios a where a.empresa_id = p_empresa and a.admin_ti),
        'llave', (select jsonb_build_object('alcance', l.alcance, 'vence_en', l.vence_en)
                    from public.soporte_llaves l
                   where l.empresa_id = p_empresa and l.usada_por = public.yo() and l.anulada_en is null and l.vence_en > now()
                   order by l.vence_en desc
                   limit 1))
    end;
$$;

-- El Desarrollador abrió una pantalla con la llave en uso (js/sesion.js: registrarVisita).
-- La misma pantalla dentro de 5 minutos se anota una vez.
create or replace function public.soporte_anotar_vista(p_empresa bigint, p_seccion text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_seccion text := left(nullif(btrim(coalesce(p_seccion, '')), ''), 40);
begin
    if not public.es_desarrollador() or v_seccion is null or not public.soporte_puede(p_empresa, 'ver') then
        return;
    end if;
    if exists (select 1 from public.soporte_bitacora b
                where b.usuario_id = public.yo() and b.empresa_id = p_empresa and b.accion = 'vio'
                  and b.registro = v_seccion and b.creado_en > now() - interval '5 minutes') then
        return;
    end if;
    perform public.soporte_anotar(p_empresa, 'vio', 'pantalla', v_seccion);
end;
$$;

-- Acciones de emergencia del Desarrollador, SIN llave (Usuarios): 'bloquear' (no entra más y
-- se cierran sus sesiones), 'desbloquear' o 'cerrar_sesiones'. Quedan en la bitácora y se
-- avisa al Administrador y al Admin TI de la empresa.
create or replace function public.soporte_emergencia(p_usuario bigint, p_accion text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    yo public.usuarios := public.yo_usuario();
    u  public.usuarios;
begin
    if yo.id is null or yo.rol <> 'desarrollador' then
        raise exception 'Solo el Desarrollador usa las acciones de emergencia.' using errcode = '42501';
    end if;
    if p_accion is null or p_accion not in ('bloquear', 'desbloquear', 'cerrar_sesiones') then
        raise exception 'Acción no válida.' using errcode = 'P0001';
    end if;
    select * into u from public.usuarios where id = p_usuario for update;
    if u.id is null or u.rol = 'desarrollador' then
        raise exception 'Ese usuario no existe o no se puede tocar.' using errcode = 'P0001';
    end if;

    if p_accion in ('bloquear', 'desbloquear') then
        update public.usuarios set aprobado = (p_accion = 'desbloquear') where id = u.id;
    end if;
    if p_accion in ('bloquear', 'cerrar_sesiones') and u.auth_id is not null then
        delete from auth.sessions where user_id = u.auth_id; -- con ellas se van sus tokens de renovación
    end if;

    perform public.soporte_anotar(u.empresa_id,
        case p_accion when 'bloquear' then 'bloqueo' when 'desbloquear' then 'desbloqueo' else 'cerro_sesiones' end,
        'usuarios', u.id::text, jsonb_build_object('usuario', u.id_usuario));
    perform public.soporte_avisar(u.empresa_id, 'Acción de emergencia del Desarrollador',
        format('%s %s (%s).',
               case p_accion when 'bloquear' then 'Bloqueó a' when 'desbloquear' then 'Desbloqueó a' else 'Cerró las sesiones de' end,
               u.nombre, u.id_usuario));
end;
$$;
