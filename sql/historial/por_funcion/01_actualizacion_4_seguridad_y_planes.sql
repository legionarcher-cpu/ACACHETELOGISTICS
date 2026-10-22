-- 4 de 23 · sql/01_actualizacion_base_existente.sql · Contraseñas cifradas, paleta, planes por empresa y solicitudes de envío de clientes (bloques 20 a 23).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 20. SEGURIDAD: CONTRASEÑAS CIFRADAS Y SOLICITUD DE USUARIO DEL CLIENTE
--   Lo usan js/secciones/loggin.js (iniciar sesión y "Solicita tu usuario") y
--   js/secciones/clientes.js (aprobar la solicitud). Ver docs/secciones/viajes.md.
--   - Las contraseñas se guardan CIFRADAS (bcrypt). Las que ya existían se
--     cifran aquí; los usuarios siguen entrando con la misma contraseña.
--   - iniciar_sesion(usuario, clave): compara la clave dentro de la base. La
--     página ya no puede leer la columna clave.
--   - El cliente de una empresa con Transporte pide su usuario desde el enlace
--     index.html#registro?empresa=02. Queda PENDIENTE (cliente y usuario sin
--     aprobar) y se avisa al Administrador y al G1 de esa empresa.
--   ⚠ Después de este bloque, si se agrega una columna a usuarios, ejecutar
--     select public.usuarios_ocultar_clave();  (si no, la página no la puede leer)
--   Se puede repetir.
-- ==================================================
-- ---------- Contraseñas cifradas (bcrypt, extensión pgcrypto) ----------
create extension if not exists pgcrypto with schema extensions;

-- ¿Ya está cifrada? ($2a$10$..., $2b$..., formato bcrypt)
create or replace function public.clave_cifrada(p_clave text)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select coalesce(p_clave ~ '^[$]2[abxy][$][0-9]{2}[$]', false);
$$;

-- La base cifra la clave sola al crear el usuario o al cambiarle la clave
-- (Usuarios, Clientes -> "Acceso y lugares", solicitud del cliente)
create or replace function public.cifrar_clave()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.clave is not null and not public.clave_cifrada(new.clave) then
        new.clave := extensions.crypt(new.clave, extensions.gen_salt('bf', 10));
    end if;
    return new;
end;
$$;

drop trigger if exists usuarios_cifrar_clave on public.usuarios;
create trigger usuarios_cifrar_clave before insert or update of clave on public.usuarios
    for each row execute function public.cifrar_clave();

-- Las claves que ya existían se cifran (las ya cifradas no se tocan). Los
-- usuarios siguen entrando con la misma contraseña.
update public.usuarios set clave = clave where not public.clave_cifrada(clave);

-- Iniciar sesión: la clave se compara DENTRO de la base. Devuelve el id del
-- usuario o null (sin decir si falló el usuario o la clave).
create or replace function public.iniciar_sesion(p_usuario text, p_clave text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_id    bigint;
    v_clave text;
begin
    select u.id, u.clave into v_id, v_clave
      from public.usuarios u
     where u.id_usuario = lower(btrim(coalesce(p_usuario, '')));
    if v_id is not null and public.clave_cifrada(v_clave)
       and v_clave = extensions.crypt(coalesce(p_clave, ''), v_clave) then
        return v_id;
    end if;
    perform pg_sleep(0.4); -- frena a quien prueba claves al azar
    return null;
end;
$$;

-- La página ya no puede LEER la columna clave (ni cifrada): se le da permiso
-- de lectura a todas las demás columnas de usuarios. Crear y cambiar la clave
-- sigue igual. ⚠ Si se agrega una columna a usuarios, volver a ejecutar:
--   select public.usuarios_ocultar_clave();
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
    execute 'revoke select on public.usuarios from anon';
    execute format('grant select (%s) on public.usuarios to anon', v_columnas);
end;
$$;

select public.usuarios_ocultar_clave();

-- ---------- El cliente solicita su usuario (empresas con Transporte) ----------
-- Enlace: index.html#registro?empresa=02 (o el botón del login si la marca tiene
-- "registroClientes" en empresas/empresas.js).

-- ¿Esa empresa recibe solicitudes? (activa y con una actividad de viajes)
-- Devuelve { nombre } o null.
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
       and exists (select 1 from public.actividades a where a.codigo = any (e.actividades) and a.usa_viajes);
$$;

-- Guarda la solicitud: cliente (si su teléfono no existe en la empresa) + usuario
-- rol cliente, los dos SIN APROBAR (el login no lo deja entrar), y avisa al
-- Administrador y al G1 de la empresa. Se aprueba en Clientes -> "Revisar".
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
       and exists (select 1 from public.actividades a where a.codigo = any (e.actividades) and a.usa_viajes);
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
    v_completo := btrim(v_nombre || ' ' || v_ape1 || ' ' || coalesce(v_ape2, ''));
    v_usuario := public.usuario_libre(v_base, v_empresa.codigo, null, 0);
    insert into public.usuarios (nombre, id_usuario, telefono, clave, permisos, rol, cliente_id, aprobado, solicitado_en)
    values (v_completo, v_usuario, v_tel, v_clave, '{}', 'cliente', v_cliente, false, now());

    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, enlace, referencia_tipo, referencia_id)
    select u.id, 'pendiente', 'Solicitud de acceso a viajes',
           format('%s (tel. %s) pidió su usuario "%s". Revísala en Clientes.', v_completo, v_tel, v_usuario),
           case when v_tienda is null then '#clientes' else '#clientes?tienda=' || v_tienda end,
           'acceso_cliente', v_cliente
      from public.usuarios u
     where u.empresa_id = v_empresa.id and u.rol in ('administrador', 'admin_g1') and u.aprobado;

    return jsonb_build_object('usuario', v_usuario, 'empresa', v_empresa.nombre);
end;
$$;

grant execute on function public.iniciar_sesion(text, text) to anon;
grant execute on function public.registro_clientes_empresa(text) to anon;
grant execute on function public.solicitar_acceso_cliente(jsonb) to anon;
-- Internas: no se llaman desde la página
revoke execute on function public.usuarios_ocultar_clave() from anon, public;
revoke execute on function public.cifrar_clave() from anon, public;

notify pgrst, 'reload schema';


-- ==================================================
-- 21. PALETA DE COLORES DE CADA EMPRESA INTERNA
--   empresas.colores: la paleta que el Desarrollador elige al crear o modificar la
--   empresa (Tiendas -> Empresas). Se pinta al iniciar sesión con un usuario de esa
--   empresa (empresas/empresas.js: aplicarColoresEmpresa). {} = colores de la marca.
--   Ej.: {"color-azul": "#5A6B34", "color-naranja": "#C8A13A", ...}
--   Se puede repetir.
-- ==================================================

alter table public.empresas add column if not exists colores jsonb not null default '{}'::jsonb;
alter table public.empresas drop constraint if exists empresas_colores_objeto;
alter table public.empresas add constraint empresas_colores_objeto check (jsonb_typeof(colores) = 'object');

notify pgrst, 'reload schema';


-- ==================================================
-- 22. PLAN DE CADA EMPRESA: FUNCIONES HABILITADAS
--   empresas.plan: 'basico' | 'profesional' | 'completo' | 'personalizado'
--   empresas.funciones: lista de funciones habilitadas (null = todas, como "Completo").
--   Las marca el Desarrollador en Configuración -> Planes y funciones
--   (js/secciones/configuracion/planes.js; catálogo y planes en empresas/empresas.js:
--   FUNCIONES_PLAN y PLANES). La página oculta a los administradores de la empresa lo
--   que su plan no incluye.
--   La base respeta "registro_clientes" (solicitud de usuario de clientes) en
--   registro_clientes_empresa y solicitar_acceso_cliente.
--   Las empresas que ya existían quedan en "completo" (no cambia nada).
--   Se puede repetir.
-- ==================================================

alter table public.empresas add column if not exists plan text not null default 'completo';
alter table public.empresas add column if not exists funciones text[];
alter table public.empresas drop constraint if exists empresas_plan_valido;
alter table public.empresas add constraint empresas_plan_valido
    check (plan in ('basico', 'profesional', 'completo', 'personalizado'));
-- ¿Esa empresa recibe solicitudes? (activa, con una actividad de viajes y su plan lo incluye)
-- Devuelve { nombre } o null.
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
       and exists (select 1 from public.actividades a where a.codigo = any (e.actividades) and a.usa_viajes)
       and (e.funciones is null or 'registro_clientes' = any (e.funciones)); -- plan (bloque 22)
$$;

-- Guarda la solicitud: cliente (si su teléfono no existe en la empresa) + usuario
-- rol cliente, los dos SIN APROBAR (el login no lo deja entrar), y avisa al
-- Administrador y al G1 de la empresa. Se aprueba en Clientes -> "Revisar".
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
       and exists (select 1 from public.actividades a where a.codigo = any (e.actividades) and a.usa_viajes)
       and (e.funciones is null or 'registro_clientes' = any (e.funciones)); -- plan (bloque 22)
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
    v_completo := btrim(v_nombre || ' ' || v_ape1 || ' ' || coalesce(v_ape2, ''));
    v_usuario := public.usuario_libre(v_base, v_empresa.codigo, null, 0);
    insert into public.usuarios (nombre, id_usuario, telefono, clave, permisos, rol, cliente_id, aprobado, solicitado_en)
    values (v_completo, v_usuario, v_tel, v_clave, '{}', 'cliente', v_cliente, false, now());

    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, enlace, referencia_tipo, referencia_id)
    select u.id, 'pendiente', 'Solicitud de acceso a viajes',
           format('%s (tel. %s) pidió su usuario "%s". Revísala en Clientes.', v_completo, v_tel, v_usuario),
           case when v_tienda is null then '#clientes' else '#clientes?tienda=' || v_tienda end,
           'acceso_cliente', v_cliente
      from public.usuarios u
     where u.empresa_id = v_empresa.id and u.rol in ('administrador', 'admin_g1') and u.aprobado;

    return jsonb_build_object('usuario', v_usuario, 'empresa', v_empresa.nombre);
end;
$$;

grant execute on function public.registro_clientes_empresa(text) to anon;
grant execute on function public.solicitar_acceso_cliente(jsonb) to anon;

notify pgrst, 'reload schema';


-- ==================================================
-- 23. SOLICITUDES DE ENVÍO DE LOS CLIENTES (recolección y entrega)
--   El cliente con usuario de una empresa de encomiendas (actividad con
--   usa_recoleccion) pide en "Mis envíos" (js/secciones/envios.js) que le
--   recojan un paquete en A y lo entreguen en B, con puntos de referencia.
--   Queda "pendiente" hasta que el Admin G3 de su tienda (o G2, G1, Administrador)
--   la revisa en Pedidos: "Revisar y registrar" abre el formulario ya lleno y, al
--   registrar el pedido, la solicitud pasa a "aprobada" con su pedido_id (desde ahí
--   siguen los avisos de siempre: piloto, G2, pedidos cercanos). "Rechazar" la
--   cierra con un motivo. El cliente ve el avance en "Mis envíos".
--   Plan: función "envios_clientes" (Configuración -> Planes y funciones).
--   También: la solicitud de usuario de clientes ahora la reciben las empresas con
--   viajes O con encomiendas (registro_clientes_empresa y solicitar_acceso_cliente).
--   Se puede repetir.
-- ==================================================

create table if not exists public.pedido_solicitudes (
    id                      bigint generated always as identity primary key,
    empresa_id              bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    tienda_id               bigint references public.tiendas(id) on delete set null,
    actividad               text not null,
    cliente_id              bigint not null references public.clientes(id) on delete cascade,
    usuario_id              bigint references public.usuarios(id) on delete set null,
    cliente_nombre          text not null,
    cliente_telefono        text not null,
    recoleccion_direccion   text not null,
    recoleccion_referencia  text,
    recoleccion_lat         numeric(9,6),
    recoleccion_lng         numeric(9,6),
    entrega_direccion       text not null,
    entrega_referencia      text,
    entrega_lat             numeric(9,6),
    entrega_lng             numeric(9,6),
    km                      numeric(8,2),
    minutos                 integer,
    recibe_nombre           text,
    recibe_telefono         text,
    fecha                   date not null,
    descripcion             text not null,
    bultos                  smallint not null default 1,
    peso_kg                 numeric(8,2),
    notas                   text,
    estado                  text not null default 'pendiente',
    motivo                  text,
    pedido_id               bigint references public.pedidos(id) on delete set null,
    revisado_por            bigint references public.usuarios(id) on delete set null,
    revisado_en             timestamptz,
    creado_en               timestamptz not null default now(),

    constraint pedsol_estado_valido check (estado in ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
    constraint pedsol_bultos_valido check (bultos between 1 and 999),
    constraint pedsol_peso_valido   check (peso_kg is null or peso_kg >= 0)
);
create index if not exists pedido_solicitudes_empresa_idx on public.pedido_solicitudes (empresa_id, estado);
create index if not exists pedido_solicitudes_cliente_idx on public.pedido_solicitudes (cliente_id);

-- La página la lee y la cambia (como las demás tablas de pedidos, por ahora)
alter table public.pedido_solicitudes enable row level security;
grant select, insert, update, delete on public.pedido_solicitudes to anon;
drop policy if exists "TEMPORAL - leer pedido_solicitudes" on public.pedido_solicitudes;
drop policy if exists "TEMPORAL - crear pedido_solicitudes" on public.pedido_solicitudes;
drop policy if exists "TEMPORAL - modificar pedido_solicitudes" on public.pedido_solicitudes;
drop policy if exists "TEMPORAL - eliminar pedido_solicitudes" on public.pedido_solicitudes;
create policy "TEMPORAL - leer pedido_solicitudes" on public.pedido_solicitudes for select to anon using (true);
create policy "TEMPORAL - crear pedido_solicitudes" on public.pedido_solicitudes for insert to anon with check (true);
create policy "TEMPORAL - modificar pedido_solicitudes" on public.pedido_solicitudes for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar pedido_solicitudes" on public.pedido_solicitudes for delete to anon using (true);

-- Solicitud de usuario: también para las empresas de encomiendas (recolección)
-- ¿Esa empresa recibe solicitudes? (activa, con viajes o encomiendas y su plan lo incluye)
-- Devuelve { nombre } o null.
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
       and exists (select 1 from public.actividades a where a.codigo = any (e.actividades) and (a.usa_viajes or a.usa_recoleccion))
       and (e.funciones is null or 'registro_clientes' = any (e.funciones)); -- plan (bloque 22)
$$;

-- Guarda la solicitud: cliente (si su teléfono no existe en la empresa) + usuario
-- rol cliente, los dos SIN APROBAR (el login no lo deja entrar), y avisa al
-- Administrador y al G1 de la empresa. Se aprueba en Clientes -> "Revisar".
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
       and exists (select 1 from public.actividades a where a.codigo = any (e.actividades) and (a.usa_viajes or a.usa_recoleccion))
       and (e.funciones is null or 'registro_clientes' = any (e.funciones)); -- plan (bloque 22)
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
    v_completo := btrim(v_nombre || ' ' || v_ape1 || ' ' || coalesce(v_ape2, ''));
    v_usuario := public.usuario_libre(v_base, v_empresa.codigo, null, 0);
    insert into public.usuarios (nombre, id_usuario, telefono, clave, permisos, rol, cliente_id, aprobado, solicitado_en)
    values (v_completo, v_usuario, v_tel, v_clave, '{}', 'cliente', v_cliente, false, now());

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

grant execute on function public.registro_clientes_empresa(text) to anon;
grant execute on function public.solicitar_acceso_cliente(jsonb) to anon;

notify pgrst, 'reload schema';


