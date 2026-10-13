-- 13 de 14 · sql/01_actualizacion_base_existente.sql · Visitas (solo Desarrollador): quién entra, desde dónde y a qué pantallas (3 días) (bloques 36 a 36).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 36. VISITAS: QUIÉN ENTRA, DESDE DÓNDE Y A QUÉ PANTALLAS (solo Desarrollador)
--   Reporte SOLO para el Desarrollador (Tiendas -> pestaña Visitas): quién entró, de qué
--   empresa, desde qué dispositivo y dirección (IP) y a qué pantallas.
--   - registrar_visita(usuario, tipo, sección, dispositivo, navegador, app): la llama la
--     página al iniciar sesión (tipo 'ingreso') y al abrir cada pantalla ('pantalla').
--     La IP y el país los toma la base de la llamada (no los manda la página).
--     Las visitas del Desarrollador no se guardan.
--   - reporte_visitas(usuario, empresa): las visitas (solo si quien pide es Desarrollador).
--   - Se guardan SOLO 3 DÍAS: cada registro y cada reporte borran lo más viejo.
--   - La tabla no se lee directo desde la web (sin reglas TEMPORAL): solo por las funciones.
--   Se puede repetir.
-- ==================================================

create table if not exists public.visitas (
    id          bigint generated always as identity primary key,
    creado_en   timestamptz not null default now(),
    usuario_id  bigint references public.usuarios(id) on delete cascade,
    empresa_id  bigint references public.empresas(id) on delete cascade,
    tipo        text not null default 'pantalla' check (tipo in ('ingreso', 'pantalla')),
    seccion     text,
    dispositivo text,
    navegador   text,
    app         boolean not null default false,
    ip          text,
    pais        text
);
create index if not exists visitas_creado_en_idx on public.visitas (creado_en);
alter table public.visitas enable row level security; -- sin reglas: solo por las funciones
revoke all on public.visitas from anon, public;

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
    if not exists (select 1 from public.usuarios x where x.id = p_usuario and x.rol = 'desarrollador') then
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

grant execute on function public.registrar_visita(bigint, text, text, text, text, boolean) to anon;
grant execute on function public.reporte_visitas(bigint, bigint) to anon;

notify pgrst, 'reload schema';



