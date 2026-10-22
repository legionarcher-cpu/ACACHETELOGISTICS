-- 22 de 24 · sql/00_instalacion_completa.sql · Teléfonos y cédulas: formato de Costa Rica y tope de largo (secciones 37 a 37).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 37. TELÉFONOS Y CÉDULAS: FORMATO DE COSTA RICA Y TOPE DE LARGO (sql/01 bloque 44)
-- Formato de Costa Rica en la pantalla (js/componentes.js, FORMATOS_CR): teléfono 8888-1234,
-- cédula física 1-0234-0567 (o DIMEX de 11 a 12 dígitos) y cédula jurídica 3-101-123456.
-- Aquí la base pone el TOPE, para que nadie guarde un dato desbordado aunque se salte la
-- pantalla: largo máximo y solo números, espacios, guiones, "+", "(", ")" y punto.
--   - clientes:  teléfono (20), cédula (20), razón social (150), nombre y apellidos (60), correo (120)
--   - usuarios:  teléfono (20), cédula (20), departamento (60)
--   - empresas:  teléfono (20), cédula jurídica (20), razón social (150), giro (200),
--                dirección (250), ubicación (300)
--   - tiendas:   teléfono (20)
--   - pedidos, viajes y solicitudes de pedido: teléfonos hasta 30 (copian el del cliente)
-- Cada regla se agrega SOLO si ningún dato que ya existe la incumple, así nada que ya
-- funciona deja de guardarse. Si alguno la incumple, sale un aviso (NOTICE) con la tabla y
-- cuántas filas: se corrigen y se vuelve a ejecutar. Para verlas, por ejemplo:
--   select id, telefono from public.clientes where not (char_length(telefono) <= 20
--       and telefono ~ '^[0-9 +().-]*$');
-- Se puede repetir.
-- ==================================================

do $$
declare
    r record;
    malos bigint;
begin
    for r in select * from (values
        ('clientes', 'clientes_telefono_formato',   $c$char_length(telefono) <= 20 and telefono ~ '^[0-9 +().-]*$'$c$),
        ('clientes', 'clientes_cedula_formato',     $c$char_length(cedula) <= 20 and cedula ~ '^[0-9-]*$'$c$),
        ('clientes', 'clientes_razon_social_largo', $c$char_length(razon_social) <= 150$c$),
        ('clientes', 'clientes_nombre_largo',       $c$char_length(nombre) <= 60 and char_length(apellido1) <= 60 and char_length(coalesce(apellido2, '')) <= 60$c$),
        ('clientes', 'clientes_correo_largo',       $c$char_length(correo) <= 120$c$),
        ('usuarios', 'usuarios_telefono_formato',   $c$char_length(telefono) <= 20 and telefono ~ '^[0-9 +().-]*$'$c$),
        ('usuarios', 'usuarios_cedula_formato',     $c$char_length(cedula) <= 20 and cedula ~ '^[0-9-]*$'$c$),
        ('usuarios', 'usuarios_departamento_largo', $c$char_length(departamento) <= 60$c$),
        ('empresas', 'empresas_telefono_formato',   $c$char_length(telefono) <= 20 and telefono ~ '^[0-9 +().-]*$'$c$),
        ('empresas', 'empresas_cedula_formato',     $c$char_length(cedula_juridica) <= 20 and cedula_juridica ~ '^[0-9-]*$'$c$),
        ('empresas', 'empresas_datos_largo',        $c$char_length(coalesce(razon_social, '')) <= 150 and char_length(coalesce(giro, '')) <= 200 and char_length(coalesce(direccion, '')) <= 250 and char_length(coalesce(ubicacion, '')) <= 300$c$),
        ('tiendas',  'tiendas_telefono_formato',    $c$char_length(telefono) <= 20 and telefono ~ '^[0-9 +().-]*$'$c$),
        ('pedidos',  'pedidos_telefonos_largo',     $c$char_length(cliente_telefono) <= 30 and char_length(coalesce(recibe_telefono, '')) <= 30$c$),
        ('viajes',   'viajes_telefono_largo',       $c$char_length(cliente_telefono) <= 30$c$),
        ('pedido_solicitudes', 'pedido_solicitudes_telefonos_largo',
                                                    $c$char_length(cliente_telefono) <= 30 and char_length(coalesce(recibe_telefono, '')) <= 30$c$)
    ) as v(tabla, nombre, condicion)
    loop
        -- Ya está: no se vuelve a revisar
        if exists (select 1 from pg_constraint
                    where conname = r.nombre and conrelid = to_regclass('public.' || r.tabla)) then
            continue;
        end if;
        begin
            execute format('select count(*) from public.%I where not (%s)', r.tabla, r.condicion) into malos;
        exception when undefined_table or undefined_column then
            raise notice 'Se salta %: falta la tabla o una columna (ejecute antes los bloques anteriores).', r.nombre;
            continue;
        end;
        if malos > 0 then
            raise notice 'NO se agregó %: % fila(s) de % no lo cumplen. Corríjalas y vuelva a ejecutar este bloque.',
                r.nombre, malos, r.tabla;
        else
            execute format('alter table public.%I add constraint %I check (%s)', r.tabla, r.nombre, r.condicion);
        end if;
    end loop;
end;
$$;

notify pgrst, 'reload schema';


