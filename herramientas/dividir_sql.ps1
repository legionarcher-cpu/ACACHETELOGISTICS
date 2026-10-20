# ==================================================
# DIVIDIR LOS SCRIPTS SQL POR FUNCIÓN (para el SQL Editor de Supabase)
# ACACHETE LOGISTICS
#
# El SQL Editor de Supabase falla con archivos muy grandes (no guarda la
# consulta o se corta). Esta herramienta copia sql/00 y sql/01 en archivos más
# chicos, uno por FUNCIÓN del sistema (pedidos, empresas, transporte, caja,
# distribuidora...), en la carpeta sql/por_funcion/, SIN cambiar nada:
#   - cada archivo tiene bloques completos (nunca corta un bloque);
#   - se numeran en el orden original y hay que ejecutarlos EN ESE ORDEN
#     (algunos bloques reemplazan funciones de bloques anteriores);
#   - pegados uno tras otro son exactamente el archivo original (se comprueba).
# Los originales siguen siendo sql/00 y sql/01: se editan ahí y se vuelve a
# ejecutar esta herramienta (doble clic en herramientas\dividir_sql.bat).
# Un bloque nuevo (28, 29...) que no esté en GRUPOS va a un archivo "otros".
# ==================================================

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$salida = Join-Path $raiz 'sql\por_funcion'
$utf8 = New-Object Text.UTF8Encoding($false)
$separador = '-- =================================================='

# Qué bloques (01) o secciones (00) van en cada archivo, en orden
$GRUPOS = @{
    '00_instalacion_completa' = @(
        @{ nombre = 'base_y_pedidos';        bloques = 0..9;   que = 'Regiones, tiendas, vehículos, usuarios, clientes, configuración, horarios, actividades, rutas, pedidos' },
        @{ nombre = 'acceso_y_archivos';     bloques = 10..11; que = 'Acceso desde la web (temporal) y fotos (Storage)' },
        @{ nombre = 'empresas_internas';     bloques = 12..12; que = 'Empresas internas con ID (01, 02...)' },
        @{ nombre = 'transporte';            bloques = 13..13; que = 'Viajes, rol cliente, franjas, costos y cortesía' },
        @{ nombre = 'seguridad_y_planes';    bloques = 14..16; que = 'Contraseñas cifradas, planes por empresa y solicitudes de envío de clientes' },
        @{ nombre = 'caja_y_ubicacion';      bloques = 17..18; que = 'Caja de pilotos y ubicación en tiempo real' },
        @{ nombre = 'distribuidora';         bloques = 19..20; que = 'Partes por actividad y distribuidora (productos, bodega del día, cierres)' },
        @{ nombre = 'tiendas_codigo_y_rutas'; bloques = 21..21; que = 'Código de tienda libre (sin región) y tiendas con o sin rutas' },
        @{ nombre = 'despacho_carga_y_salida'; bloques = 22..23; que = 'Carga con evidencia por pedido, salida a ruta por slot y caja por actividad' },
        @{ nombre = 'tiendas_region_opcional'; bloques = 24..24; que = 'Tiendas sin región (opcional) y usuarios sin región (jperez01)' },
        @{ nombre = 'articulos_de_venta';    bloques = 25..25; que = 'Artículos de venta: unidad y costo de cada presentación' },
        @{ nombre = 'qr_validar_y_marcar';   bloques = 26..26; que = 'QR del piloto: validar y marcar en un solo paso' },
        @{ nombre = 'qr_fijo_tienda';        bloques = 27..28; que = 'QR fijo de la tienda: el piloto lo escanea y se marca solo, estando en la tienda (GPS)' },
        @{ nombre = 'visitas';               bloques = 29..29; que = 'Visitas (solo Desarrollador): quién entra, desde dónde y a qué pantallas (3 días)' },
        @{ nombre = 'comprobante_de_pago';   bloques = 30..30; que = 'Entrega: foto del comprobante de pago (efectivo, voucher o SINPE)' },
        @{ nombre = 'entrega_qr_y_bodega';   bloques = 31..31; que = 'Entrega con QR obligatorio y pedidos con productos solo si hay en la bodega del día' },
        @{ nombre = 'ubicacion_del_cliente'; bloques = 32..32; que = 'Ubicación compartida por el cliente (enlace antes de registrar el pedido)' },
        @{ nombre = 'limpiar_empresa';       bloques = 33..33; que = 'Limpiar los datos de una empresa (botón del Desarrollador)' }
    )
    '01_actualizacion_base_existente' = @(
        @{ nombre = 'base_y_pedidos';        bloques = 0..15;  que = 'Admin protegido, número de pedido, rutas, vehículos, actividades, mercadería, clientes, slots, marcas y QR' },
        @{ nombre = 'empresas_internas';     bloques = 16..18; que = 'Empresas internas, usuarios con el ID de la empresa y palabras por actividad' },
        @{ nombre = 'transporte';            bloques = 19..19; que = 'Viajes, rol cliente, franjas, costos y cortesía' },
        @{ nombre = 'seguridad_y_planes';    bloques = 20..23; que = 'Contraseñas cifradas, paleta, planes por empresa y solicitudes de envío de clientes' },
        @{ nombre = 'caja_y_ubicacion';      bloques = 24..25; que = 'Caja de pilotos y ubicación en tiempo real' },
        @{ nombre = 'distribuidora';         bloques = 26..27; que = 'Partes por actividad y distribuidora (productos, bodega del día, cierres)' },
        @{ nombre = 'tiendas_codigo_y_rutas'; bloques = 28..28; que = 'Código de tienda libre (sin región) y tiendas con o sin rutas' },
        @{ nombre = 'despacho_carga_y_salida'; bloques = 29..30; que = 'Carga con evidencia por pedido, salida a ruta por slot y caja por actividad' },
        @{ nombre = 'tiendas_region_opcional'; bloques = 31..31; que = 'Tiendas sin región (opcional) y usuarios sin región (jperez01)' },
        @{ nombre = 'articulos_de_venta';    bloques = 32..32; que = 'Artículos de venta: unidad y costo de cada presentación' },
        @{ nombre = 'qr_validar_y_marcar';   bloques = 33..33; que = 'QR del piloto: validar y marcar en un solo paso' },
        @{ nombre = 'qr_fijo_tienda';        bloques = 34..35; que = 'QR fijo de la tienda: el piloto lo escanea y se marca solo, estando en la tienda (GPS)' },
        @{ nombre = 'visitas';               bloques = 36..36; que = 'Visitas (solo Desarrollador): quién entra, desde dónde y a qué pantallas (3 días)' },
        @{ nombre = 'comprobante_de_pago';   bloques = 37..37; que = 'Entrega: foto del comprobante de pago (efectivo, voucher o SINPE)' },
        @{ nombre = 'entrega_qr_y_bodega';   bloques = 38..38; que = 'Entrega con QR obligatorio y pedidos con productos solo si hay en la bodega del día' },
        @{ nombre = 'ubicacion_del_cliente'; bloques = 39..39; que = 'Ubicación compartida por el cliente (enlace antes de registrar el pedido)' },
        @{ nombre = 'limpiar_empresa';       bloques = 40..40; que = 'Limpiar los datos de una empresa (botón del Desarrollador)' }
    )
}

# Carpeta limpia (también se quita la división anterior por tamaño, sql/partes)
foreach ($vieja in (Join-Path $raiz 'sql\partes'), $salida) {
    if (Test-Path $vieja) { Remove-Item $vieja -Recurse -Force }
}
New-Item -ItemType Directory -Path $salida | Out-Null

foreach ($nombre in '00_instalacion_completa', '01_actualizacion_base_existente') {
    $texto = [IO.File]::ReadAllText((Join-Path $raiz "sql\$nombre.sql"), [Text.Encoding]::UTF8)
    $lineas = $texto -split "`n"   # se conserva el `r de cada línea: al unir con `n queda igual

    # Bloques: [número, línea donde empieza] (el encabezado del archivo es el bloque -1)
    $bloques = @(@{ numero = -1; desde = 0 })
    for ($i = 1; $i -lt $lineas.Count; $i++) {
        if ($lineas[$i - 1].TrimEnd("`r") -eq $separador -and $lineas[$i] -match '^-- (\d+)\. ') {
            $bloques += @{ numero = [int]$Matches[1]; desde = $i - 1 }
        }
    }
    for ($k = 0; $k -lt $bloques.Count; $k++) {
        $bloques[$k].hasta = if ($k + 1 -lt $bloques.Count) { $bloques[$k + 1].desde } else { $lineas.Count }
    }

    # Cada bloque va al grupo que lo nombra; el encabezado, al primero; los nuevos, a "otros"
    $listaGrupos = @($GRUPOS[$nombre] | ForEach-Object { @{ nombre = $_.nombre; que = $_.que; bloques = $_.bloques; partes = @() } })
    $otros = @{ nombre = 'otros'; que = 'Bloques nuevos que todavía no tienen grupo (agregarlos a GRUPOS en herramientas\dividir_sql.ps1)'; bloques = @(); partes = @() }
    $actual = $listaGrupos[0]
    foreach ($b in $bloques) {
        if ($b.numero -ge 0) {
            $g = $listaGrupos | Where-Object { $_.bloques -contains $b.numero } | Select-Object -First 1
            $actual = if ($g) { $g } else { $otros }
        }
        $actual.partes += , @($b.desde, $b.hasta, $b.numero)
    }
    if ($otros.partes.Count) { $listaGrupos += $otros }

    # El orden de los archivos tiene que seguir el del original
    $ultimo = -1
    foreach ($g in ($listaGrupos | Where-Object { $_.partes.Count })) {
        if ($g.partes[0][0] -lt $ultimo) { throw "En $nombre el grupo '$($g.nombre)' cambia el orden de los bloques: revisa GRUPOS." }
        $ultimo = $g.partes[-1][1]
    }

    $unidos = @()
    $n = 0
    $usados = @($listaGrupos | Where-Object { $_.partes.Count })
    foreach ($g in $usados) {
        $n++
        $cuerpo = ($g.partes | ForEach-Object { $lineas[$_[0]..($_[1] - 1)] -join "`n" }) -join "`n"
        $unidos += $cuerpo
        $numeros = @($g.partes | Where-Object { $_[2] -ge 0 } | ForEach-Object { $_[2] })
        $texBloques = if ($numeros.Count) { "$($numeros[0]) a $($numeros[-1])" } else { '-' }
        $tipo = if ($nombre -like '00*') { 'secciones' } else { 'bloques' }
        $cabecera = "-- $n de $($usados.Count) · sql/$nombre.sql · $($g.que) ($tipo $texBloques).`r`n" +
                    "-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).`r`n" +
                    "-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.`r`n`r`n"
        $prefijo = if ($nombre -like '00*') { '00_instalacion' } else { '01_actualizacion' }
        $archivo = Join-Path $salida ("{0}_{1}_{2}.sql" -f $prefijo, $n, $g.nombre)
        [IO.File]::WriteAllText($archivo, $cabecera + $cuerpo + "`r`n", $utf8)
        "{0,-48} {1,4} KB  ({2} {3})" -f (Split-Path $archivo -Leaf), [Math]::Round((Get-Item $archivo).Length / 1KB), $tipo, $texBloques
    }

    if (($unidos -join "`n") -ne $texto) { throw "Los archivos de $nombre no coinciden con el original." }
    "  OK: los $($usados.Count) archivos de $nombre, uno tras otro, son idénticos al original."
}
