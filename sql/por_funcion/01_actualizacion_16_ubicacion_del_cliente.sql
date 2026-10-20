-- 16 de 22 · sql/01_actualizacion_base_existente.sql · Ubicación compartida por el cliente (enlace antes de registrar el pedido) (bloques 39 a 39).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 39. UBICACIÓN COMPARTIDA POR EL CLIENTE (ENLACE ANTES DE REGISTRAR EL PEDIDO)
--   Antes de registrar un pedido, la tienda le manda al cliente un enlace por WhatsApp
--   (ubicacion.html?t=<token>). El cliente marca dónde entregar (con su GPS o moviendo el
--   mapa) y el punto le llega al formulario de "Nuevo pedido" (punto B). Se puede cambiar
--   hasta que se registre el pedido; después el enlace ya no cambia nada. Vence en 24 horas.
--   La ubicación también queda en la ficha del cliente. No cambia ningún precio.
--   Tabla ubicaciones_compartidas (solo por funciones) y ubicacion_pedir / _estado / _usar
--   (la tienda) y ubicacion_ver / _guardar (la página del cliente, sin sesión).
--   Se puede repetir.
-- ==================================================

create table if not exists public.ubicaciones_compartidas (
    id                 bigint generated always as identity primary key,
    token              uuid not null default gen_random_uuid() unique, -- va en el enlace (ubicacion.html?t=...)
    empresa_id         bigint references public.empresas(id) on delete cascade,
    tienda_id          bigint not null references public.tiendas(id) on delete cascade,
    cliente_id         bigint references public.clientes(id) on delete set null,
    cliente_nombre     text,
    telefono           text not null,          -- solo dígitos
    pedida_por         bigint,                 -- quién mandó el enlace (sin llave: queda aunque se borre)
    pedida_por_nombre  text,
    creado_en          timestamptz not null default now(),
    vence_en           timestamptz not null default now() + interval '24 hours',
    lat                numeric(9,6),
    lng                numeric(9,6),
    precision_m        integer,                -- metros del GPS (si la marcó con "Mi ubicación")
    compartida_en      timestamptz,
    pedido_id          bigint references public.pedidos(id) on delete set null,
    usada_en           timestamptz,            -- se registró el pedido: el enlace ya no cambia nada

    constraint ubicaciones_compartidas_punto check ((lat is null) = (lng is null))
);
create index if not exists ubicaciones_compartidas_tel_idx on public.ubicaciones_compartidas (tienda_id, telefono, creado_en desc);

-- Solo por las funciones de abajo (la página del cliente no inicia sesión)
alter table public.ubicaciones_compartidas enable row level security;
revoke all on public.ubicaciones_compartidas from anon, authenticated;

-- ¿El usuario registra pedidos de esa tienda? (Empleado y G3 de la tienda; G2, G1 y Administrador en su alcance)
create or replace function public.ubicacion_puede_tienda(u public.usuarios, p_tienda bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select u.rol not in ('piloto', 'cliente')
       and (u.tienda_id = p_tienda or public.dist_puede_tienda(u, p_tienda));
$$;

-- ---------- La tienda pide la ubicación (antes de registrar el pedido) ----------
-- p = { usuario_id, tienda_id, cliente_id, nombre, telefono }
-- Si ya hay un enlace vigente sin usar para ese teléfono en esa tienda, se devuelve ese (con la
-- ubicación, si el cliente ya la marcó) y se alarga 24 horas. -> { id, token, lat, lng, compartida_en, vence_en }
create or replace function public.ubicacion_pedir(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u        public.usuarios;
    v_tienda bigint := (p ->> 'tienda_id')::bigint;
    v_tel    text := regexp_replace(coalesce(p ->> 'telefono', ''), '\D', '', 'g');
    r        public.ubicaciones_compartidas;
begin
    u := public.viaje_usuario((p ->> 'usuario_id')::bigint);
    if v_tienda is null or not public.ubicacion_puede_tienda(u, v_tienda) then
        raise exception 'No registras pedidos de esa tienda.' using errcode = 'P0001';
    end if;
    if length(v_tel) < 8 then
        raise exception 'Escribe el teléfono del cliente (al menos 8 dígitos).' using errcode = 'P0001';
    end if;

    select * into r from public.ubicaciones_compartidas
     where tienda_id = v_tienda and right(telefono, 8) = right(v_tel, 8)
       and usada_en is null and vence_en > now()
     order by creado_en desc
     limit 1;
    if found then
        update public.ubicaciones_compartidas
           set vence_en = now() + interval '24 hours',
               cliente_id = coalesce((p ->> 'cliente_id')::bigint, cliente_id),
               cliente_nombre = coalesce(nullif(btrim(p ->> 'nombre'), ''), cliente_nombre)
         where id = r.id
        returning * into r;
    else
        insert into public.ubicaciones_compartidas (empresa_id, tienda_id, cliente_id, cliente_nombre, telefono, pedida_por, pedida_por_nombre)
        values ((select empresa_id from public.tiendas where id = v_tienda), v_tienda, (p ->> 'cliente_id')::bigint,
                nullif(btrim(p ->> 'nombre'), ''), v_tel, u.id, u.nombre)
        returning * into r;
    end if;
    return jsonb_build_object('id', r.id, 'token', r.token, 'lat', r.lat, 'lng', r.lng, 'precision_m', r.precision_m,
                              'compartida_en', r.compartida_en, 'vence_en', r.vence_en);
end;
$$;

-- ---------- La tienda revisa si el cliente ya la marcó ----------
-- p = { usuario_id, id } -> { id, lat, lng, precision_m, compartida_en, usada_en, vence_en, cliente_nombre, telefono }
create or replace function public.ubicacion_estado(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u public.usuarios;
    r public.ubicaciones_compartidas;
begin
    u := public.viaje_usuario((p ->> 'usuario_id')::bigint);
    select * into r from public.ubicaciones_compartidas where id = (p ->> 'id')::bigint;
    if not found or not public.ubicacion_puede_tienda(u, r.tienda_id) then
        raise exception 'No se encontró esa solicitud de ubicación.' using errcode = 'P0001';
    end if;
    return jsonb_build_object('id', r.id, 'tienda_id', r.tienda_id, 'lat', r.lat, 'lng', r.lng, 'precision_m', r.precision_m,
                              'compartida_en', r.compartida_en, 'usada_en', r.usada_en, 'vence_en', r.vence_en,
                              'cliente_id', r.cliente_id, 'cliente_nombre', r.cliente_nombre, 'telefono', r.telefono);
end;
$$;

-- ---------- Al registrar el pedido: el enlace se cierra ----------
-- p = { usuario_id, id, pedido_id }
create or replace function public.ubicacion_usar(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    u public.usuarios;
    r public.ubicaciones_compartidas;
begin
    u := public.viaje_usuario((p ->> 'usuario_id')::bigint);
    select * into r from public.ubicaciones_compartidas where id = (p ->> 'id')::bigint;
    if not found or not public.ubicacion_puede_tienda(u, r.tienda_id) then
        raise exception 'No se encontró esa solicitud de ubicación.' using errcode = 'P0001';
    end if;
    update public.ubicaciones_compartidas
       set pedido_id = (p ->> 'pedido_id')::bigint, usada_en = now()
     where id = r.id and usada_en is null;
end;
$$;

-- ---------- Página del cliente (ubicacion.html, sin iniciar sesión) ----------
-- Solo con el token del enlace. No devuelve datos personales: el primer nombre y la tienda.
-- -> { estado: 'pendiente' | 'compartida' | 'usada' | 'vencida' | 'no_existe', nombre, tienda, lat, lng }
create or replace function public.ubicacion_ver(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    r      public.ubicaciones_compartidas;
    v_uuid uuid;
begin
    begin
        v_uuid := p_token::uuid;
    exception when others then
        return jsonb_build_object('estado', 'no_existe');
    end;
    select * into r from public.ubicaciones_compartidas where token = v_uuid;
    if not found then
        return jsonb_build_object('estado', 'no_existe');
    end if;
    return jsonb_build_object(
        'estado', case when r.usada_en is not null then 'usada' when r.vence_en <= now() then 'vencida'
                       when r.compartida_en is not null then 'compartida' else 'pendiente' end,
        'nombre', split_part(btrim(coalesce(r.cliente_nombre, '')), ' ', 1),
        'tienda', (select t.nombre from public.tiendas t where t.id = r.tienda_id),
        'lat', r.lat, 'lng', r.lng);
end;
$$;

-- El cliente guarda (o cambia) su ubicación. Se puede cambiar hasta que se registre el pedido.
-- También queda en su ficha de Clientes (así su próximo pedido ya trae el punto) y la primera
-- vez se avisa a quien mandó el enlace (campana).
create or replace function public.ubicacion_guardar(p_token text, p_lat numeric, p_lng numeric, p_precision integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    r      public.ubicaciones_compartidas;
    v_uuid uuid;
    v_txt  text;
begin
    begin
        v_uuid := p_token::uuid;
    exception when others then
        raise exception 'Este enlace no es válido.' using errcode = 'P0001';
    end;
    select * into r from public.ubicaciones_compartidas where token = v_uuid for update;
    if not found then
        raise exception 'Este enlace no es válido.' using errcode = 'P0001';
    end if;
    if r.usada_en is not null then
        raise exception 'Tu pedido ya se registró con esta ubicación. Si cambió, avísale a la tienda.' using errcode = 'P0001';
    end if;
    if r.vence_en <= now() then
        raise exception 'Este enlace venció. Pídele a la tienda uno nuevo.' using errcode = 'P0001';
    end if;
    -- Costa Rica (con la isla del Coco)
    if p_lat is null or p_lng is null or p_lat not between 5.0 and 11.6 or p_lng not between -87.6 and -82.4 then
        raise exception 'Ese punto está fuera de Costa Rica. Mueve el mapa hasta el lugar de entrega.' using errcode = 'P0001';
    end if;

    update public.ubicaciones_compartidas
       set lat = round(p_lat, 6), lng = round(p_lng, 6),
           precision_m = case when p_precision > 0 then p_precision end, compartida_en = now()
     where id = r.id;

    -- Ficha del cliente: la suya o la de la empresa con ese teléfono
    v_txt := trim(to_char(round(p_lat, 6), 'FM990.000000')) || ', ' || trim(to_char(round(p_lng, 6), 'FM990.000000'));
    update public.clientes c
       set ubicacion = v_txt
     where (r.cliente_id is not null and c.id = r.cliente_id)
        or (r.cliente_id is null and c.empresa_id is not distinct from r.empresa_id
            and right(regexp_replace(c.telefono, '\D', '', 'g'), 8) = right(r.telefono, 8));

    -- Aviso (solo la primera vez) a quien mandó el enlace: lo abre en "Nuevo pedido" ya con el punto
    if r.compartida_en is null then
        insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, enlace, referencia_tipo, referencia_id)
        select us.id, 'info', 'El cliente compartió su ubicación',
               format('%s (tel. %s) marcó dónde entregar. Ya puedes registrar su pedido.',
                      coalesce(nullif(r.cliente_nombre, ''), 'El cliente'), right(r.telefono, 8)),
               '#pedidos?nuevo=1&ubicacion=' || r.id, 'ubicacion_compartida', r.id
          from public.usuarios us
         where us.id = r.pedida_por;
    end if;
    return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.ubicacion_pedir(jsonb) to anon;
grant execute on function public.ubicacion_estado(jsonb) to anon;
grant execute on function public.ubicacion_usar(jsonb) to anon;
grant execute on function public.ubicacion_ver(text) to anon;
grant execute on function public.ubicacion_guardar(text, numeric, numeric, integer) to anon;

notify pgrst, 'reload schema';


