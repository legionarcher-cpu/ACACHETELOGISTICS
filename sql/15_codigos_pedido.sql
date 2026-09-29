-- ==================================================
-- NÚMERO DE PEDIDO (manual o automático) Y CÓDIGO DE RESPALDO (ambas opciones)
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez, DESPUÉS de sql/14_pedidos.sql)
--
-- Qué hace:
--   1. Nueva opción en "configuracion":
--        numero_pedido = 'automatico' -> el sistema pone P-000001, P-000002...
--                        'manual'     -> el empleado escribe el número (no se repite)
--   2. El código de respaldo ahora es una LISTA de opciones activas
--      (se pueden marcar las dos):
--        codigo_respaldo = ["aleatorio"] | ["telefono"] | ["aleatorio", "telefono"]
--      Con las dos: el pedido tiene un número aleatorio de 4 dígitos Y
--      además se aceptan los últimos 4 dígitos del teléfono del cliente.
--   3. Columna pedidos.codigo_telefono: últimos 4 dígitos del teléfono
--      (solo si esa opción está activa).
--   4. Se reemplaza la función que asigna los códigos al crear un pedido.
--   5. Función validar_codigo_respaldo(pedido, código): true si el código
--      de 4 dígitos es válido para ese pedido (la usa la app del piloto).
-- ==================================================


-- ---------- 1. Opción de número de pedido ----------
insert into public.configuracion (clave, valor) values ('numero_pedido', '"automatico"')
on conflict (clave) do nothing;


-- ---------- 2. Código de respaldo como lista ----------
-- Si ya estaba guardado como texto ("aleatorio"), pasa a lista (["aleatorio"])
update public.configuracion
   set valor = jsonb_build_array(valor)
 where clave = 'codigo_respaldo' and jsonb_typeof(valor) = 'string';


-- ---------- 3. Últimos 4 dígitos del teléfono ----------
alter table public.pedidos add column codigo_telefono text;


-- ---------- 4. Códigos al crear un pedido ----------
create or replace function public.pedidos_antes_de_crear()
returns trigger
language plpgsql
as $$
declare
    modo_numero  text;
    opciones     jsonb;
    digitos      text;
    usa_aleatorio boolean;
    usa_telefono  boolean;
begin
    -- ----- Número de pedido -----
    select valor #>> '{}' into modo_numero from public.configuracion where clave = 'numero_pedido';

    if modo_numero = 'manual' then
        -- Lo escribe el empleado: sin espacios a los lados y en MAYÚSCULAS
        new.codigo := upper(trim(coalesce(new.codigo, '')));
        if new.codigo = '' then
            raise exception 'Falta el número de pedido (la empresa usa números manuales).'
                using errcode = '23502';
        end if;
    else
        -- Automático: P-000001, P-000002...
        new.codigo := 'P-' || lpad(nextval('public.pedidos_codigo_seq')::text, 6, '0');
    end if;

    -- ----- Código de respaldo (4 dígitos) -----
    select valor into opciones from public.configuracion where clave = 'codigo_respaldo';
    if opciones is null then
        opciones := '["aleatorio"]';
    elsif jsonb_typeof(opciones) = 'string' then
        opciones := jsonb_build_array(opciones);
    end if;

    digitos := regexp_replace(coalesce(new.cliente_telefono, ''), '\D', '', 'g');
    usa_aleatorio := opciones ? 'aleatorio';
    usa_telefono  := opciones ? 'telefono' and length(digitos) >= 4;

    new.codigo_telefono := case when usa_telefono then right(digitos, 4) end;

    -- Número aleatorio si esa opción está activa, o si el teléfono no sirve
    -- (menos de 4 dígitos); si solo se usa el teléfono, el código es el teléfono.
    if usa_aleatorio or not usa_telefono then
        new.codigo_respaldo := lpad(floor(random() * 10000)::int::text, 4, '0');
    else
        new.codigo_respaldo := new.codigo_telefono;
    end if;

    return new;
end;
$$;


-- ---------- 5. Validar un código de respaldo ----------
-- Uso: select validar_codigo_respaldo(15, '1234');
-- Desde la página / app: db.rpc('validar_codigo_respaldo', { p_pedido: 15, p_codigo: '1234' })
create or replace function public.validar_codigo_respaldo(p_pedido bigint, p_codigo text)
returns boolean
language sql
stable
as $$
    select exists (
        select 1 from public.pedidos
        where id = p_pedido
          and trim(p_codigo) in (codigo_respaldo, codigo_telefono)
    );
$$;

grant execute on function public.validar_codigo_respaldo(bigint, text) to anon;
