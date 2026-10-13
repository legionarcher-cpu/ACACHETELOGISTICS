-- 11 de 11 · sql/01_actualizacion_base_existente.sql · QR del piloto: validar y marcar en un solo paso (bloques 33 a 33).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 33. QR DEL PILOTO: VALIDAR Y MARCAR EN UN SOLO PASO
--   La tienda escanea el QR del día del piloto y ve su ficha (piloto_qr_info: foto,
--   nombre, si ya está validado y qué horario puede marcar ahora). Con el botón
--   "Validar y marcar" (validar_y_marcar_piloto) se valida al piloto Y se marca su
--   horario abierto en un solo paso: el piloto ya no tiene que escanear el QR de
--   la tienda (sigue funcionando, marcar_por_qr no cambia).
--   - Marca tardía: la base responde "JUSTIFICAR:..." y la página pide el motivo.
--     Nada se guarda hasta que se envía (todo o nada).
--   - Sin horario abierto (o ya marcado): solo se valida y se dice por qué.
--   Se puede repetir.
-- ==================================================

-- Horario que el piloto puede marcar ahora: { numero, inicio_hasta, ya_marcado } o nada
create or replace function public.piloto_horario_abierto(p_piloto bigint)
returns table (numero smallint, inicio_hasta time, ya_marcado boolean)
language sql
stable
security definer
set search_path = ''
as $$
    select x.numero, x.inicio_hasta,
           exists (select 1 from public.marcas_piloto mp
                    where mp.piloto_id = p_piloto and mp.fecha = public.ahora_local()::date and mp.numero = x.numero)
      from public.marcas_del_dia(public.ahora_local()::date) x
     where public.ahora_local()::time between x.inicio_desde and x.fin
     order by 3, x.numero   -- primero el que falta marcar
     limit 1;
$$;

-- Ficha del QR del piloto (no guarda nada)
create or replace function public.piloto_qr_info(p_token uuid)
returns table (piloto_id bigint, nombre text, foto_url text, tienda text, validado_en timestamptz,
               horario smallint, inicio_hasta time, ya_marcado boolean, tarde boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
    v_hoy date := public.ahora_local()::date;
    d     record;
    h     record;
begin
    select * into d from public.pilotos_dia x where x.token = p_token;
    if not found then
        raise exception 'Ese QR de piloto no existe.' using errcode = 'P0001';
    end if;
    if d.fecha <> v_hoy then
        raise exception 'Ese QR es del %: pide el QR de hoy.', to_char(d.fecha, 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
    select * into h from public.piloto_horario_abierto(d.piloto_id);
    return query
        select u.id, u.nombre, u.foto_url, t.codigo || ' · ' || t.nombre, d.validado_en,
               h.numero, h.inicio_hasta, coalesce(h.ya_marcado, false),
               h.numero is not null and not coalesce(h.ya_marcado, false) and public.ahora_local()::time > h.inicio_hasta
          from public.usuarios u
          left join public.tiendas t on t.id = u.tienda_id
         where u.id = d.piloto_id;
end;
$$;

-- Validar al piloto y marcar su horario abierto (todo o nada)
create or replace function public.validar_y_marcar_piloto(p_token uuid, p_usuario bigint, p_justificacion text default null)
returns table (piloto_id bigint, nombre text, validado_en timestamptz, numero smallint, marcado_en timestamptz,
               a_tiempo boolean, tienda_id bigint, justificacion text, nota text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
    v_ahora  timestamp := public.ahora_local();
    v_hoy    date := v_ahora::date;
    v_hora   time := v_ahora::time;
    v_tienda bigint;
    v_nota   text;
    d        record;
    h        record;
begin
    select * into d from public.pilotos_dia x where x.token = p_token for update;
    if not found then
        raise exception 'Ese QR de piloto no existe.' using errcode = 'P0001';
    end if;
    if d.fecha <> v_hoy then
        raise exception 'Ese QR es del %: pide el QR de hoy.', to_char(d.fecha, 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
    -- Tienda de la marca: la de quien escanea; si no tiene (G1, G2...), la del piloto
    select coalesce(q.tienda_id, p.tienda_id) into v_tienda
      from public.usuarios p left join public.usuarios q on q.id = p_usuario
     where p.id = d.piloto_id;

    select * into h from public.piloto_horario_abierto(d.piloto_id);
    -- Marca tardía sin motivo: se pide antes de guardar nada
    if h.numero is not null and not h.ya_marcado and v_hora > h.inicio_hasta and coalesce(btrim(p_justificacion), '') = '' then
        raise exception 'JUSTIFICAR:Horario % · la hora de inicio era %. Es una marca tardía: escribe por qué.',
            h.numero, to_char(h.inicio_hasta, 'HH24:MI') using errcode = 'P0001';
    end if;

    if d.validado_en is null then
        update public.pilotos_dia x set validado_en = now(), validado_por = p_usuario
         where x.piloto_id = d.piloto_id and x.fecha = v_hoy;
    end if;

    delete from public.marcas_piloto mp where mp.fecha < date_trunc('month', v_ahora)::date;

    if h.numero is null then
        v_nota := 'No hay un horario abierto para marcar ahora: solo quedó validado.';
    elsif h.ya_marcado then
        v_nota := 'Ya tenía marcado el horario ' || h.numero || ': solo quedó validado.';
    else
        insert into public.marcas_piloto (piloto_id, fecha, numero, a_tiempo, justificacion)
        values (d.piloto_id, v_hoy, h.numero, v_hora <= h.inicio_hasta,
                case when v_hora > h.inicio_hasta then left(btrim(p_justificacion), 200) end);
    end if;

    return query
        select u.id, u.nombre, coalesce(d.validado_en, now()),
               mp.numero, mp.marcado_en, mp.a_tiempo, v_tienda, mp.justificacion, v_nota
          from public.usuarios u
          left join public.marcas_piloto mp
                 on v_nota is null and mp.piloto_id = u.id and mp.fecha = v_hoy and mp.numero = h.numero
         where u.id = d.piloto_id;
end;
$$;

grant execute on function public.piloto_qr_info(uuid) to anon;
grant execute on function public.validar_y_marcar_piloto(uuid, bigint, text) to anon;
revoke execute on function public.piloto_horario_abierto(bigint) from anon, public;

notify pgrst, 'reload schema';
