-- ==================================================
-- 09. RECOLECCIONES (actividades con usa_recolecciones)
-- ACACHETE LOGISTICS
--
-- Sección #recolecciones (docs/secciones/recolecciones.md). Aparte de las demás actividades.
--   - El cliente elige día y hora (UNA sola agenda por empresa: cada espacio lo toma un
--     solo cliente), dónde se recoge, qué (DEPÓSITOS: cuántos y de quién es cada uno, u
--     OTRO: descripción) y dónde se entrega: la OFICINA de la empresa (empresas.direccion
--     y ubicacion) u OTRO lugar en el mapa. Cambia la hora o cancela mientras el espacio
--     nuevo esté libre y hasta "cancelar_horas" antes.
--   - Quien atiende (Administrador, Admin G1, piloto o la función "recolecciones.atender")
--     hace el proceso del conductor: en camino -> recogida -> entregada (o "no estaba").
--     Bloquea horas (almuerzo, entrada, salida): un día o todas las semanas.
--   - Tarifa DIARIA por cliente, como las rutas: se marcan los días que se trabajan y
--     cada día marcado se cobra el monto fijo, HAYA O NO recolecciones (recoleccion_cargos,
--     los arma recoleccion_generar_cargos). Al final de la semana se marca como cobrado.
--   La página SOLO LEE recolecciones: reservar, cambiar, cancelar y avanzar va por funciones.
-- Se puede repetir.
-- ==================================================

-- ==================================================
-- TABLAS
-- ==================================================

create table if not exists public.recoleccion_config (
    empresa_id         bigint primary key references public.empresas(id) on delete cascade,
    zona_horaria       text          not null default 'America/Costa_Rica',
    dias               smallint[]    not null default '{1,2,3,4,5}', -- 1 = lunes ... 7 = domingo
    hora_inicio        time          not null default '08:00',
    hora_fin           time          not null default '17:00',
    espacio_min        smallint      not null default 30,   -- lo que dura cada espacio de la agenda
    anticipacion_min   smallint      not null default 60,   -- solicitar al menos N minutos antes
    anticipacion_dias  smallint      not null default 14,   -- solicitar hasta N días después
    cancelar_horas     numeric(4,1)  not null default 1,    -- el cliente cambia o cancela hasta N horas antes
    actualizado_en     timestamptz   not null default now(),

    constraint recoleccion_config_valida check (
        hora_fin > hora_inicio and espacio_min between 5 and 240
        and anticipacion_min between 0 and 10080 and anticipacion_dias between 0 and 90
        and cancelar_horas >= 0
        and cardinality(dias) > 0 and dias <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
);

-- Horas bloqueadas por quien atiende: un día (fecha) o todas las semanas (dias).
-- Una recolección que ya existía no se borra.
create table if not exists public.recoleccion_bloqueos (
    id          bigint generated always as identity primary key,
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    fecha       date,
    dias        smallint[],
    desde       time not null,
    hasta       time not null,
    motivo      text,
    creado_por  bigint references public.usuarios(id) on delete set null,
    creado_en   timestamptz not null default now(),

    constraint recoleccion_bloqueos_validos check (
        hasta > desde
        and ((fecha is not null) <> (coalesce(cardinality(dias), 0) > 0))
        and (dias is null or dias <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]))
);
create index if not exists recoleccion_bloqueos_empresa_idx on public.recoleccion_bloqueos (empresa_id);

-- Tarifa diaria de cada cliente: cada día marcado (desde "desde") se cobra monto_dia
create table if not exists public.recoleccion_tarifas (
    cliente_id       bigint primary key references public.clientes(id) on delete cascade,
    empresa_id       bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    monto_dia        numeric(10,2) not null,
    dias             smallint[] not null default '{1,2,3,4,5}', -- 1 = lunes ... 7 = domingo
    desde            date not null default current_date,
    actualizado_por  bigint references public.usuarios(id) on delete set null,
    actualizado_en   timestamptz not null default now(),

    constraint recoleccion_tarifas_monto check (monto_dia >= 0),
    constraint recoleccion_tarifas_dias  check (cardinality(dias) > 0 and dias <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
);
create index if not exists recoleccion_tarifas_empresa_idx on public.recoleccion_tarifas (empresa_id);

create sequence if not exists public.recolecciones_codigo_seq;

create table if not exists public.recolecciones (
    id                  bigint generated always as identity primary key,
    codigo              text unique,
    empresa_id          bigint not null references public.empresas(id) on delete cascade,
    cliente_id          bigint references public.clientes(id) on delete set null,
    cliente_nombre      text not null,
    cliente_telefono    text,
    solicitado_por      bigint references public.usuarios(id) on delete set null,

    inicio              timestamptz not null,   -- espacio de la agenda
    fin                 timestamptz not null,

    recoger_direccion   text not null,
    recoger_lat         numeric(9,6) not null,
    recoger_lng         numeric(9,6) not null,
    que                 text not null default 'depositos',  -- 'depositos' | 'otro'
    depositos           jsonb not null default '[]'::jsonb, -- de quién es cada depósito: ["Juan Pérez", ...]
    descripcion         text,                               -- 'otro': qué se recoge
    entrega             text not null default 'oficina',    -- 'oficina' (la de la empresa) | 'otro'
    entrega_direccion   text,
    entrega_lat         numeric(9,6),
    entrega_lng         numeric(9,6),
    notas               text,

    estado              text not null default 'confirmada',
    conductor_id        bigint references public.usuarios(id) on delete set null, -- quien la atendió
    motivo_cancelacion  text,
    cancelado_por       bigint references public.usuarios(id) on delete set null,
    cancelado_en        timestamptz,
    en_camino_en        timestamptz,
    recogida_en         timestamptz,
    entregada_en        timestamptz,
    creado_en           timestamptz not null default now(),
    actualizado_en      timestamptz not null default now(),

    constraint recolecciones_estado_valido check (estado in ('confirmada', 'en_camino', 'recogida', 'entregada', 'cancelada', 'no_estaba')),
    constraint recolecciones_que_valido check (
        que in ('depositos', 'otro')
        and (que <> 'depositos' or jsonb_array_length(depositos) between 1 and 50)
        and (que <> 'otro' or nullif(btrim(descripcion), '') is not null)),
    constraint recolecciones_entrega_valida check (
        entrega in ('oficina', 'otro') and (entrega <> 'otro' or (entrega_lat is not null and entrega_lng is not null))),
    constraint recolecciones_horas_validas check (fin > inicio)
);
create index if not exists recolecciones_empresa_inicio_idx on public.recolecciones (empresa_id, inicio);
create index if not exists recolecciones_cliente_idx        on public.recolecciones (cliente_id, estado);
-- Un solo cliente por espacio (además del candado de las funciones)
create unique index if not exists recolecciones_un_espacio on public.recolecciones (empresa_id, inicio) where estado <> 'cancelada';

-- Código (R-000001) y fecha de modificación
create or replace function public.recolecciones_antes_de_guardar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' and new.codigo is null then
        new.codigo := 'R-' || lpad(nextval('public.recolecciones_codigo_seq')::text, 6, '0');
    end if;
    new.actualizado_en := now();
    return new;
end;
$$;

drop trigger if exists recolecciones_antes_de_guardar on public.recolecciones;
create trigger recolecciones_antes_de_guardar before insert or update on public.recolecciones
    for each row execute function public.recolecciones_antes_de_guardar();

-- Lo que se cobra: un monto por cliente y por día marcado en su tarifa
create table if not exists public.recoleccion_cargos (
    id           bigint generated always as identity primary key,
    empresa_id   bigint not null references public.empresas(id) on delete cascade,
    cliente_id   bigint not null references public.clientes(id) on delete cascade,
    fecha        date not null,
    monto        numeric(10,2) not null,
    cobrado_en   timestamptz,
    cobrado_por  bigint references public.usuarios(id) on delete set null,
    creado_en    timestamptz not null default now(),

    constraint recoleccion_cargos_unico unique (empresa_id, cliente_id, fecha),
    constraint recoleccion_cargos_monto check (monto >= 0)
);
create index if not exists recoleccion_cargos_fecha_idx on public.recoleccion_cargos (empresa_id, fecha);


-- ==================================================
-- FUNCIONES
-- ==================================================

-- Reglas de la empresa (si no tiene, las crea con los valores de siempre)
create or replace function public.recoleccion_cfg(p_empresa bigint)
returns public.recoleccion_config
language plpgsql
security definer
set search_path = ''
as $$
declare
    v public.recoleccion_config;
begin
    select * into v from public.recoleccion_config where empresa_id = p_empresa;
    if not found then
        insert into public.recoleccion_config (empresa_id) values (p_empresa) on conflict (empresa_id) do nothing;
        select * into v from public.recoleccion_config where empresa_id = p_empresa;
    end if;
    return v;
end;
$$;

-- ¿El espacio cae en una hora bloqueada? Devuelve el motivo ('' si no tiene) o null
create or replace function public.recoleccion_bloqueo(p_empresa bigint, p_inicio timestamptz, p_fin timestamptz)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(b.motivo, '')
      from public.recoleccion_bloqueos b,
           lateral (select coalesce((select zona_horaria from public.recoleccion_config where empresa_id = p_empresa),
                                    'America/Costa_Rica') as zona) z
     where b.empresa_id = p_empresa
       and (b.fecha = (p_inicio at time zone z.zona)::date
            or extract(isodow from (p_inicio at time zone z.zona))::smallint = any(b.dias))
       and b.desde < (p_fin at time zone z.zona)::time
       and b.hasta > (p_inicio at time zone z.zona)::time
     order by b.desde
     limit 1;
$$;

-- ¿Otra recolección activa ocupa el espacio?
create or replace function public.recoleccion_ocupado(p_empresa bigint, p_inicio timestamptz, p_fin timestamptz, p_excluir bigint default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.recolecciones r
         where r.empresa_id = p_empresa and r.estado <> 'cancelada'
           and (p_excluir is null or r.id <> p_excluir)
           and r.inicio < p_fin and r.fin > p_inicio);
$$;

-- ¿Se puede tomar ese espacio? (lanza el error con el motivo; hint 'ocupado' si ya lo tomó otro)
create or replace function public.recoleccion_validar(p_empresa bigint, p_inicio timestamptz, p_excluir bigint default null)
returns timestamptz   -- el fin del espacio
language plpgsql
security definer
set search_path = ''
as $$
declare
    c       public.recoleccion_config;
    v_local timestamp;
    v_fin   timestamptz;
begin
    c := public.recoleccion_cfg(p_empresa);
    v_local := p_inicio at time zone c.zona_horaria;
    v_fin := p_inicio + make_interval(mins => c.espacio_min);
    if p_inicio < now() + make_interval(mins => c.anticipacion_min) then
        raise exception 'Solicita con al menos % minutos de anticipación.', c.anticipacion_min using errcode = 'P0001';
    end if;
    if v_local::date > (now() at time zone c.zona_horaria)::date + c.anticipacion_dias then
        raise exception 'Solo se puede solicitar hasta % días después de hoy.', c.anticipacion_dias using errcode = 'P0001';
    end if;
    if not (extract(isodow from v_local)::smallint = any(c.dias))
       or v_local::time < c.hora_inicio or (v_fin at time zone c.zona_horaria)::time > c.hora_fin
       or (extract(epoch from (v_local::time - c.hora_inicio))::integer / 60) % c.espacio_min <> 0 then
        raise exception 'A esa hora no hay servicio: elige una hora de la lista.' using errcode = 'P0001';
    end if;
    if public.recoleccion_bloqueo(p_empresa, p_inicio, v_fin) is not null then
        raise exception 'Esa hora no está disponible: elige otra.' using errcode = 'P0001', hint = 'ocupado';
    end if;
    if public.recoleccion_ocupado(p_empresa, p_inicio, v_fin, p_excluir) then
        raise exception 'Esa hora acaba de ocuparse: elige otra.' using errcode = 'P0001', hint = 'ocupado';
    end if;
    return v_fin;
end;
$$;

-- Horas de un día: cada espacio dentro del horario, libre o no. Si el día no se puede,
-- una sola fila con el motivo. p_excluir: la que se está cambiando de hora.
-- p_detalle (quien atiende): el motivo del bloqueo y el código de quien ocupa.
create or replace function public.recolecciones_horas(p_empresa bigint, p_fecha date, p_excluir bigint default null,
    p_detalle boolean default false)
returns table (inicio timestamptz, hora text, disponible boolean, motivo text)
language plpgsql
security definer
set search_path = ''
as $$
declare
    c        public.recoleccion_config;
    v_hoy    date;
    v_ini    timestamptz;
    v_fin    timestamptz;
    v_bloq   text;
    v_ocupa  text;
    t        timestamp;
begin
    if not public.ve_empresa(p_empresa) then
        raise exception 'No tienes acceso a esa empresa.' using errcode = '42501';
    end if;
    c := public.recoleccion_cfg(p_empresa);
    v_hoy := (now() at time zone c.zona_horaria)::date;
    if p_fecha < v_hoy or p_fecha > v_hoy + c.anticipacion_dias then
        return query select null::timestamptz, null::text, false,
            format('Solo se puede solicitar desde hoy hasta %s días después.', c.anticipacion_dias);
        return;
    end if;
    if not (extract(isodow from p_fecha)::smallint = any(c.dias)) then
        return query select null::timestamptz, null::text, false, 'Ese día no hay servicio.'::text;
        return;
    end if;
    for t in select g from generate_series(p_fecha + c.hora_inicio,
                                           p_fecha + c.hora_fin - make_interval(mins => c.espacio_min),
                                           make_interval(mins => c.espacio_min)) g loop
        v_ini := t at time zone c.zona_horaria;
        continue when v_ini < now() + make_interval(mins => c.anticipacion_min);
        v_fin := v_ini + make_interval(mins => c.espacio_min);
        v_bloq := public.recoleccion_bloqueo(p_empresa, v_ini, v_fin);
        v_ocupa := null;
        if v_bloq is null then
            select r.codigo into v_ocupa from public.recolecciones r
             where r.empresa_id = p_empresa and r.estado <> 'cancelada'
               and (p_excluir is null or r.id <> p_excluir)
               and r.inicio < v_fin and r.fin > v_ini
             limit 1;
        end if;
        return query select v_ini, to_char(t, 'HH24:MI'), v_bloq is null and v_ocupa is null,
            case when v_bloq is not null then (case when p_detalle and v_bloq <> '' then v_bloq else 'No disponible' end)
                 when v_ocupa is not null then (case when p_detalle then 'Ocupado · ' || v_ocupa else 'Ocupado' end) end;
    end loop;
end;
$$;

-- Recolección como json (lo que devuelven las funciones)
create or replace function public.recoleccion_json(p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select to_jsonb(r) || jsonb_build_object(
        'conductor', (select jsonb_build_object('nombre', u.nombre, 'telefono', u.telefono) from public.usuarios u where u.id = r.conductor_id))
      from public.recolecciones r where r.id = p_id;
$$;

-- ¿Este usuario atiende las recolecciones? (hace el proceso del conductor y bloquea horas:
-- función "recolecciones.atender", de su rol o dada a él en Usuarios)
create or replace function public.recoleccion_atiende(u public.usuarios)
returns boolean
language sql
stable
set search_path = ''
as $$
    select public.tiene_funcion(u, 'recolecciones.atender');
$$;

-- Aviso a un usuario, o a todos los que atienden la empresa (p_usuario null)
create or replace function public.recoleccion_avisar(p_empresa bigint, p_usuario bigint, p_titulo text, p_mensaje text, p_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, enlace, referencia_tipo, referencia_id)
    select u.id, 'info', p_titulo, p_mensaje, '#recolecciones?id=' || p_id, 'recoleccion', p_id
      from public.usuarios u
     where u.aprobado
       and (case when p_usuario is not null then u.id = p_usuario
                 else u.empresa_id = p_empresa and public.recoleccion_atiende(u) and u.rol <> 'desarrollador' end);
$$;

-- ---------- Solicitar ----------
-- p: { usuario_id, empresa_id (solo Desarrollador), cliente_id (personal; el cliente es él mismo),
--      inicio, recoger: { direccion, lat, lng }, que: 'depositos' | 'otro',
--      depositos: ['de quién es', ...], descripcion, entrega: 'oficina' | 'otro',
--      entrega_lugar: { direccion, lat, lng } (si es 'otro'), notas }
create or replace function public.recolecciones_solicitar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u          public.usuarios;
    c          public.recoleccion_config;
    v_empresa  bigint;
    v_emp      public.empresas;
    v_cliente  record;
    v_inicio   timestamptz;
    v_fin      timestamptz;
    v_que      text := coalesce(p ->> 'que', 'depositos');
    v_dep      jsonb := '[]'::jsonb;
    v_texto    text;
    v_entrega  text := coalesce(p ->> 'entrega', 'oficina');
    v_ent_dir  text;
    v_ent_lat  numeric;
    v_ent_lng  numeric;
    v_punto    text[];
    v_r        public.recolecciones;
begin
    u := public.usuario_activo((p ->> 'usuario_id')::bigint);
    if u.rol not in ('cliente', 'administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado', 'desarrollador') then
        raise exception 'Tu usuario no puede solicitar recolecciones.' using errcode = 'P0001';
    end if;
    v_empresa := case when u.rol = 'desarrollador' then (p ->> 'empresa_id')::bigint else u.empresa_id end;
    perform public.soporte_exigir(v_empresa, 'corregir');
    select id, public.nombre_completo(nombre, apellido1, apellido2) as nombre, telefono, empresa_id into v_cliente
      from public.clientes
     where id = case when u.rol = 'cliente' then u.cliente_id else (p ->> 'cliente_id')::bigint end;
    if v_cliente.id is null or v_cliente.empresa_id is distinct from v_empresa then
        raise exception 'Elige el cliente de la recolección.' using errcode = 'P0001';
    end if;
    select * into v_emp from public.empresas e where e.id = v_empresa;
    if not exists (select 1 from public.empresas e join public.actividades a on a.codigo = any (e.actividades)
                    where e.id = v_empresa and a.usa_recolecciones and a.activa) then
        raise exception 'La empresa no tiene la actividad Recolección activa.' using errcode = 'P0001';
    end if;

    -- Dónde se recoge
    if (p #>> '{recoger,lat}') is null or (p #>> '{recoger,lng}') is null then
        raise exception 'Ubica en el mapa dónde se recoge.' using errcode = 'P0001';
    end if;

    -- Qué se recoge
    if v_que = 'depositos' then
        for v_texto in select btrim(x) from jsonb_array_elements_text(coalesce(p -> 'depositos', '[]'::jsonb)) x loop
            if v_texto = '' then
                raise exception 'Escribe de quién es cada depósito.' using errcode = 'P0001';
            end if;
            v_dep := v_dep || to_jsonb(left(regexp_replace(v_texto, '\s+', ' ', 'g'), 80));
        end loop;
        if jsonb_array_length(v_dep) not between 1 and 50 then
            raise exception 'Indica cuántos depósitos son (de 1 a 50).' using errcode = 'P0001';
        end if;
    elsif v_que = 'otro' then
        if nullif(btrim(coalesce(p ->> 'descripcion', '')), '') is null then
            raise exception 'Escribe qué hay que recoger.' using errcode = 'P0001';
        end if;
    else
        raise exception 'Indica qué hay que recoger.' using errcode = 'P0001';
    end if;

    -- Dónde se entrega: la oficina de la empresa u otro lugar
    if v_entrega = 'oficina' then
        v_ent_dir := coalesce(nullif(btrim(coalesce(v_emp.direccion, '')), ''), 'Oficina de ' || v_emp.nombre);
        v_punto := regexp_match(coalesce(v_emp.ubicacion, ''), '(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)');
        if v_punto is not null then
            v_ent_lat := v_punto[1]::numeric;
            v_ent_lng := v_punto[2]::numeric;
        end if;
    elsif v_entrega = 'otro' then
        if (p #>> '{entrega_lugar,lat}') is null or (p #>> '{entrega_lugar,lng}') is null then
            raise exception 'Ubica en el mapa dónde se entrega.' using errcode = 'P0001';
        end if;
        v_ent_dir := coalesce(nullif(btrim(p #>> '{entrega_lugar,direccion}'), ''), 'Punto de entrega');
        v_ent_lat := (p #>> '{entrega_lugar,lat}')::numeric;
        v_ent_lng := (p #>> '{entrega_lugar,lng}')::numeric;
    else
        raise exception 'Indica dónde se entrega.' using errcode = 'P0001';
    end if;

    v_inicio := (p ->> 'inicio')::timestamptz;
    if v_inicio is null then
        raise exception 'Elige el día y la hora.' using errcode = 'P0001';
    end if;

    -- Una solicitud a la vez por empresa: dos clientes no toman el mismo espacio
    perform pg_advisory_xact_lock(7306, v_empresa::integer);
    c := public.recoleccion_cfg(v_empresa);
    v_fin := public.recoleccion_validar(v_empresa, v_inicio, null);

    insert into public.recolecciones (
        empresa_id, cliente_id, cliente_nombre, cliente_telefono, solicitado_por, inicio, fin,
        recoger_direccion, recoger_lat, recoger_lng, que, depositos, descripcion,
        entrega, entrega_direccion, entrega_lat, entrega_lng, notas)
    values (
        v_empresa, v_cliente.id, v_cliente.nombre, v_cliente.telefono, u.id,
        v_inicio, v_fin,
        coalesce(nullif(btrim(p #>> '{recoger,direccion}'), ''), 'Punto de recogida'),
        (p #>> '{recoger,lat}')::numeric, (p #>> '{recoger,lng}')::numeric,
        v_que, v_dep, case when v_que = 'otro' then left(btrim(p ->> 'descripcion'), 200) end,
        v_entrega, v_ent_dir, v_ent_lat, v_ent_lng, nullif(left(btrim(coalesce(p ->> 'notas', '')), 200), ''))
    returning * into v_r;

    perform public.recoleccion_avisar(v_empresa, null, 'Recolección nueva ' || v_r.codigo,
        format('%s · %s · %s', to_char(v_inicio at time zone c.zona_horaria, 'DD/MM HH24:MI'), v_r.cliente_nombre,
               case when v_que = 'depositos' then jsonb_array_length(v_dep) || ' depósito(s)' else v_r.descripcion end), v_r.id);
    return public.recoleccion_json(v_r.id);
end;
$$;

-- ¿Puede esta persona cambiar o cancelar? (lanza el error si no)
create or replace function public.recoleccion_permiso(u public.usuarios, r public.recolecciones, c public.recoleccion_config)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
    if u.rol = 'cliente' then
        if r.cliente_id is distinct from u.cliente_id then
            raise exception 'Esa recolección no es tuya.' using errcode = 'P0001';
        end if;
        if r.estado <> 'confirmada' then
            raise exception 'La recolección ya empezó: llama a la empresa.' using errcode = 'P0001';
        end if;
        if now() > r.inicio - make_interval(secs => (c.cancelar_horas * 3600)::integer) then
            raise exception 'Solo se puede cambiar o cancelar hasta % horas antes. Llama a la empresa.', c.cancelar_horas
                using errcode = 'P0001';
        end if;
    elsif u.rol in ('administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado', 'piloto') then
        if u.empresa_id is distinct from r.empresa_id then
            raise exception 'Esa recolección es de otra empresa.' using errcode = 'P0001';
        end if;
        if r.estado not in ('confirmada', 'en_camino') then
            raise exception 'Esa recolección ya no se puede cambiar.' using errcode = 'P0001';
        end if;
    elsif u.rol = 'desarrollador' then
        perform public.soporte_exigir(r.empresa_id, 'corregir');
        if r.estado not in ('confirmada', 'en_camino') then
            raise exception 'Esa recolección ya no se puede cambiar.' using errcode = 'P0001';
        end if;
    else
        raise exception 'Tu usuario no puede cambiar recolecciones.' using errcode = 'P0001';
    end if;
end;
$$;

-- ---------- Cambiar la hora (todo o nada: si el espacio nuevo no está libre, sigue como estaba) ----------
create or replace function public.recolecciones_cambiar_hora(p_id bigint, p_usuario bigint, p_inicio timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u     public.usuarios;
    r     public.recolecciones;
    c     public.recoleccion_config;
    v_fin timestamptz;
begin
    u := public.usuario_activo(p_usuario);
    select * into r from public.recolecciones where id = p_id for update;
    if not found then
        raise exception 'La recolección no existe.' using errcode = 'P0001';
    end if;
    c := public.recoleccion_cfg(r.empresa_id);
    perform public.recoleccion_permiso(u, r, c);
    perform pg_advisory_xact_lock(7306, r.empresa_id::integer);
    begin
        v_fin := public.recoleccion_validar(r.empresa_id, p_inicio, r.id);
    exception when sqlstate 'P0001' then
        raise exception '% Tu recolección sigue como estaba.', sqlerrm using errcode = 'P0001', hint = 'ocupado';
    end;

    update public.recolecciones
       set inicio = p_inicio, fin = v_fin, estado = 'confirmada', en_camino_en = null
     where id = r.id;
    perform public.recoleccion_avisar(r.empresa_id, null, 'Recolección con hora nueva ' || r.codigo,
        format('%s · %s', to_char(p_inicio at time zone c.zona_horaria, 'DD/MM HH24:MI'), r.cliente_nombre), r.id);
    return public.recoleccion_json(r.id);
end;
$$;

-- ---------- Cancelar ----------
create or replace function public.recolecciones_cancelar(p_id bigint, p_usuario bigint, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u public.usuarios;
    r public.recolecciones;
    c public.recoleccion_config;
begin
    u := public.usuario_activo(p_usuario);
    select * into r from public.recolecciones where id = p_id for update;
    if not found then
        raise exception 'La recolección no existe.' using errcode = 'P0001';
    end if;
    c := public.recoleccion_cfg(r.empresa_id);
    perform public.recoleccion_permiso(u, r, c);

    update public.recolecciones
       set estado = 'cancelada', cancelado_por = u.id, cancelado_en = now(),
           motivo_cancelacion = nullif(left(btrim(coalesce(p_motivo, '')), 150), '')
     where id = r.id;
    perform public.recoleccion_avisar(r.empresa_id, null, 'Recolección cancelada ' || r.codigo,
        format('%s · %s', to_char(r.inicio at time zone c.zona_horaria, 'DD/MM HH24:MI'), r.cliente_nombre), r.id);
    return public.recoleccion_json(r.id);
end;
$$;

-- ---------- Avanzar (quien atiende hace el proceso del conductor) ----------
--   confirmada -> en_camino -> recogida -> entregada · confirmada / en_camino -> no_estaba
create or replace function public.recolecciones_avanzar(p_id bigint, p_usuario bigint, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u       public.usuarios;
    r       public.recolecciones;
    c       public.recoleccion_config;
begin
    u := public.usuario_activo(p_usuario);
    select * into r from public.recolecciones where id = p_id for update;
    if not found then
        raise exception 'La recolección no existe.' using errcode = 'P0001';
    end if;
    if not public.recoleccion_atiende(u) or (u.rol <> 'desarrollador' and u.empresa_id is distinct from r.empresa_id) then
        raise exception 'Tu usuario no atiende las recolecciones.' using errcode = 'P0001';
    end if;
    perform public.soporte_exigir(r.empresa_id, 'corregir');
    if not ((p_estado = 'en_camino' and r.estado = 'confirmada')
            or (p_estado = 'recogida' and r.estado in ('confirmada', 'en_camino'))
            or (p_estado = 'entregada' and r.estado in ('en_camino', 'recogida'))
            or (p_estado = 'no_estaba' and r.estado in ('confirmada', 'en_camino'))) then
        raise exception 'La recolección está "%": no puede pasar a "%".', r.estado, p_estado using errcode = 'P0001';
    end if;
    c := public.recoleccion_cfg(r.empresa_id);

    update public.recolecciones
       set estado = p_estado,
           conductor_id = coalesce(conductor_id, u.id),
           en_camino_en = case when p_estado = 'en_camino' then now() else en_camino_en end,
           recogida_en  = case when p_estado = 'recogida' then now() else recogida_en end,
           entregada_en = case when p_estado = 'entregada' then now() else entregada_en end
     where id = r.id;

    if p_estado = 'en_camino' then
        perform public.recoleccion_avisar(r.empresa_id, x.id, 'Vamos en camino a recoger',
            format('%s · %s cerca de las %s', r.codigo, r.recoger_direccion, to_char(r.inicio at time zone c.zona_horaria, 'HH24:MI')), r.id)
          from public.usuarios x where x.cliente_id = r.cliente_id;
    elsif p_estado = 'entregada' then
        perform public.recoleccion_avisar(r.empresa_id, x.id, 'Recolección entregada ' || r.codigo,
            format('Se entregó en %s.', coalesce(r.entrega_direccion, 'el destino')), r.id)
          from public.usuarios x where x.cliente_id = r.cliente_id;
    end if;
    return public.recoleccion_json(r.id);
end;
$$;

-- ---------- Cobro: un cargo por cada día marcado en la tarifa del cliente ----------
-- Arma los cargos de los días entre p_desde y p_hasta (máximo 62 días) que faltan. Los que
-- ya existen (cobrados o corregidos a mano) no se tocan. La llaman Cobros y la vista del cliente.
create or replace function public.recoleccion_generar_cargos(p_empresa bigint, p_desde date, p_hasta date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    n integer;
begin
    if p_hasta < p_desde or p_hasta - p_desde > 62 then
        raise exception 'Elige un periodo de hasta 62 días.' using errcode = 'P0001';
    end if;
    insert into public.recoleccion_cargos (empresa_id, cliente_id, fecha, monto)
    select t.empresa_id, t.cliente_id, d::date, t.monto_dia
      from public.recoleccion_tarifas t
      cross join lateral generate_series(greatest(p_desde, t.desde), p_hasta, interval '1 day') d
     where t.empresa_id = p_empresa
       and t.monto_dia > 0
       and extract(isodow from d)::smallint = any(t.dias)
    on conflict (empresa_id, cliente_id, fecha) do nothing;
    get diagnostics n = row_count;
    return n;
end;
$$;
