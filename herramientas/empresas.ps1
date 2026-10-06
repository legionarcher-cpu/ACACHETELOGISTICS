# ==================================================
# EMPRESAS (MARCAS) DEL SISTEMA - herramienta única
# ACACHETE LOGISTICS
#
# Uso: doble clic en herramientas\empresas.bat
#      (o en la terminal de VS Code:
#       powershell -ExecutionPolicy Bypass -File herramientas\empresas.ps1)
#
# Se guarda en empresas/empresas.js (la página lo lee al abrir; no hace falta
# otro app.html por empresa). Opciones:
#   1. Nueva empresa: nombre, actividad, pie, base de datos y PALETA DE COLORES
#      (2 colores: principal y botones -> las 7 de la marca; los modelos se leen
#      de PALETAS_MODELO en empresas/empresas.js). Su IMAGEN DE ENCABEZADO se
#      agrega como regla en css/encabezados.css (los logos se cambian ahí, a mano).
#   2. Cambiar la base de datos (Supabase) de una empresa.
#   3. Cambiar la paleta de colores de una empresa.
#   4. Elegir la empresa activa (la que usa esta copia del sistema).
#
# La paleta de cada EMPRESA INTERNA (01, 02... de Tiendas -> Empresas) se elige
# en la página, al crearla o modificarla (se guarda en la base).
# Recordatorio: en un proyecto NUEVO de Supabase hay que ejecutar primero
# sql/00_instalacion_completa.sql.
# ==================================================

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$archivo = Join-Path $raiz 'empresas\empresas.js'
$archivoCss = Join-Path $raiz 'css\encabezados.css'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$MARCA_FIN = '    // <<< FIN DE EMPRESAS'
$CSS_FIN = '/* <<< FIN DE MARCAS'

if (-not (Test-Path $archivo)) { Write-Host "No se encontró $archivo" -ForegroundColor Red; exit 1 }
$texto = [System.IO.File]::ReadAllText($archivo, $utf8)

# Modelos de paleta: se leen de PALETAS_MODELO en empresas/empresas.js (el mismo lugar
# que usa la página). Cada uno: @(texto, principal, botones), numerados desde 1.
function LeerModelos {
    $modelos = [ordered]@{}
    $inicio = $script:texto.IndexOf('const PALETAS_MODELO = {')
    if ($inicio -lt 0) { return $modelos }
    $fin = $script:texto.IndexOf("`n};", $inicio)
    $bloque = $script:texto.Substring($inicio, $fin - $inicio)
    $n = 0
    foreach ($m in [regex]::Matches($bloque, "(?m)^\s*[a-z0-9_-]+:\s*\{\s*texto:\s*'([^']+)',\s*colores:\s*\[\s*'(#[0-9A-Fa-f]{6})',\s*'(#[0-9A-Fa-f]{6})'\s*\]")) {
        $n++
        $modelos["$n"] = @($m.Groups[1].Value, $m.Groups[2].Value.ToUpper(), $m.Groups[3].Value.ToUpper())
    }
    return $modelos
}
$MODELOS = LeerModelos

$ACTIVIDADES = [ordered]@{
    '1' = @(@('tienda'), 'Entregas de tienda (supermercado: abarrotes, línea blanca, electrónica...)')
    '2' = @(@('encomiendas'), 'Encomiendas (cajas, bolsas, documentos, línea blanca...)')
    '3' = @(@('tienda', 'encomiendas'), 'Entregas de tienda y Encomiendas')
    '4' = @(@('transporte'), 'Transporte (viajes de personas y mercadería; "Pedido" se lee "Viaje")')
}

# ---------- Utilidades ----------
function Preguntar($pregunta, $porDefecto = '') {
    $extra = if ($porDefecto) { " [$porDefecto]" } else { '' }
    $r = Read-Host "$pregunta$extra"
    if ([string]::IsNullOrWhiteSpace($r)) { return $porDefecto }
    return $r.Trim()
}

# Texto entre comillas simples para JavaScript
function Js($valor) { return "'" + ($valor -replace '\\', '\\' -replace "'", "\'") + "'" }

function Activa { return [regex]::Match($script:texto, "const EMPRESA_ACTIVA\s*=\s*'([^']+)'").Groups[1].Value }

function Claves { return [regex]::Matches($script:texto, "(?m)^\s{4}'([a-z0-9-]+)':\s*\{") | ForEach-Object { $_.Groups[1].Value } }

function ElegirEmpresa {
    $activa = Activa
    Write-Host ''
    Write-Host 'Empresas en empresas/empresas.js:' -ForegroundColor Cyan
    foreach ($c in Claves) { Write-Host ("  - $c" + $(if ($c -eq $activa) { '  <- activa' } else { '' })) }
    $e = Preguntar 'Empresa' $activa
    if ((Claves) -notcontains $e) { Write-Host "No existe la empresa '$e'." -ForegroundColor Red; exit 1 }
    return $e
}

# Inicio y fin del bloque de una empresa en el texto
function Bloque($clave) {
    $inicio = $script:texto.IndexOf("    '$clave': {")
    if ($inicio -lt 0) { throw "No se encontró la empresa '$clave'." }
    $fin = $script:texto.IndexOf("`n    },", $inicio)
    return @($inicio, $fin)
}

# Mezcla un color con otro (0 = igual, 1 = el otro). Misma fórmula que paletaDesdeColores (empresas.js)
function Mezclar($hex, $con, $cuanto) {
    $salida = '#'
    for ($i = 1; $i -le 5; $i += 2) {
        $a = [Convert]::ToInt32($hex.Substring($i, 2), 16)
        $b = [Convert]::ToInt32($con.Substring($i, 2), 16)
        $salida += ([int][Math]::Round($a + ($b - $a) * $cuanto, [MidpointRounding]::AwayFromZero)).ToString('X2')
    }
    return $salida
}

# Pide la paleta: un modelo, 2 colores propios o la de ACACHETE. Devuelve el texto JS de "colores".
function PedirPaleta {
    Write-Host ''
    Write-Host 'Paleta de colores de la empresa:' -ForegroundColor Cyan
    Write-Host '  0. Colores originales de ACACHETE (sin paleta propia)'
    foreach ($k in $MODELOS.Keys) { Write-Host "  $k. $($MODELOS[$k][0])  ($($MODELOS[$k][1]) y $($MODELOS[$k][2]))" }
    $propia = "$($MODELOS.Count + 1)"
    Write-Host "  $propia. Personalizada (escribir los 2 colores, ej. #5A6B34)"
    $op = Preguntar "Elige 0 a $propia" '0'
    if ($op -eq '0') { return '{}' }
    if ($MODELOS.Contains($op)) {
        $principal = $MODELOS[$op][1]; $accion = $MODELOS[$op][2]
    } elseif ($op -eq $propia) {
        $principal = (Preguntar '  Color principal (menú, encabezado, enlaces)' '#1258A6').ToUpper()
        $accion = (Preguntar '  Color de los botones' '#F2660F').ToUpper()
        foreach ($c in $principal, $accion) {
            if ($c -notmatch '^#[0-9A-F]{6}$') { Write-Host "Color no válido: $c (debe ser como #5A6B34)." -ForegroundColor Red; exit 1 }
        }
    } else { Write-Host 'Opción no válida.' -ForegroundColor Red; exit 1 }

    $p = [ordered]@{
        'color-fondo-oscuro'   = Mezclar $principal '#000000' 0.75
        'color-azul-marino'    = Mezclar $principal '#000000' 0.5
        'color-azul'           = $principal
        'color-azul-claro'     = Mezclar $principal '#FFFFFF' 0.9
        'color-naranja'        = $accion
        'color-naranja-oscuro' = Mezclar $accion '#000000' 0.12
        'color-naranja-claro'  = Mezclar $accion '#FFFFFF' 0.85
    }
    $lineas = $p.Keys | ForEach-Object { "            '$_': '$($p[$_])'," }
    return "{`n" + ($lineas -join "`n") + "`n        }"
}

# Pide una imagen (ruta desde la carpeta del proyecto) y avisa si no existe
function PedirImagen($pregunta, $porDefecto = '') {
    $ruta = Preguntar $pregunta $porDefecto
    if ($ruta -and -not (Test-Path (Join-Path $raiz $ruta))) { Write-Host "  ⚠ No existe $ruta : copia la imagen ahí antes de abrir la página." -ForegroundColor Yellow }
    return ($ruta -replace '\\', '/')
}

# Agrega la regla del encabezado de una marca nueva en css/encabezados.css (antes de
# "<<< FIN DE MARCAS"). Sin imagen: la deja comentada como ejemplo para llenarla después.
function AgregarEncabezado($clave, $nombre, $imagen, $completa) {
    if (-not (Test-Path $archivoCss)) { return "⚠ No se encontró css/encabezados.css: agrega ahí su imagen." }
    $css = [System.IO.File]::ReadAllText($archivoCss, $utf8)
    if (-not $css.Contains($CSS_FIN)) { return "⚠ No se encontró '<<< FIN DE MARCAS' en css/encabezados.css: agrega ahí su imagen." }
    $ajuste = if ($completa) { "`n    --encabezado-ajuste: contain;" } else { '' }
    $regla = "html[data-marca=`"$clave`"] .encabezado-imagen {`n    background-image: url(`"../$imagen`");$ajuste`n}"
    if (-not $imagen) {
        $regla = "/* Sin imagen todavía (se ve el título en texto). Para ponerla, quitar los comentarios:`nhtml[data-marca=`"$clave`"] .encabezado-imagen {`n    background-image: url(`"../img/encabezado-$clave.jpg`");`n}`n*/"
    }
    $css = $css.Replace($CSS_FIN, "/* ---------- $nombre ---------- */`n$regla`n`n" + $CSS_FIN)
    [System.IO.File]::WriteAllText($archivoCss, $css, $utf8)
    return 'Su encabezado está en css/encabezados.css (ahí también se cambian los logos).'
}

function PedirSupabase {
    Write-Host ''
    Write-Host 'Base de datos: Supabase -> tu proyecto -> Project Settings -> API' -ForegroundColor Cyan
    $url = (Preguntar 'Project URL (vacío = la base de js/supabase.js, compartida)').TrimEnd('/')
    $clave = ''
    if ($url) {
        if ($url -notmatch '^https://[a-z0-9-]+\.supabase\.co$') { Write-Host 'La URL debe ser https://xxxx.supabase.co' -ForegroundColor Red; exit 1 }
        $clave = Preguntar 'Clave anon public (empieza con eyJ...)'
        if ($clave -notmatch '^eyJ[\w-]+\.[\w-]+\.[\w-]+$') { Write-Host "La clave no parece válida (la 'anon public' empieza con eyJ)." -ForegroundColor Red; exit 1 }
    }
    return @($url, $clave)
}

function PreguntarActiva($clave) {
    if ($clave -ne (Activa) -and (Preguntar "¿Dejar '$clave' como empresa activa? (s/n)" 's') -match '^[sS]') {
        $script:texto = [regex]::Replace($script:texto, "const EMPRESA_ACTIVA\s*=\s*'[^']*';", "const EMPRESA_ACTIVA = '$clave';")
    }
}

# ---------- Menú ----------
Write-Host ''
Write-Host 'EMPRESAS (empresas/empresas.js)' -ForegroundColor Cyan
Write-Host '  1. Nueva empresa (datos, imagen de encabezado, paleta y base de datos)'
Write-Host '  2. Cambiar la base de datos (Supabase) de una empresa'
Write-Host '  3. Cambiar la paleta de colores de una empresa'
Write-Host '  4. Elegir la empresa activa'
Write-Host '  (Imágenes del encabezado y logos: se cambian en css/encabezados.css)'
$opcion = Preguntar 'Elige 1 a 4' '1'

switch ($opcion) {
    '1' {
        if (-not $texto.Contains($MARCA_FIN)) { Write-Host 'No se encontró la línea "<<< FIN DE EMPRESAS" en empresas.js.' -ForegroundColor Red; exit 1 }
        $nombre = Preguntar 'Nombre de la empresa'
        if (-not $nombre) { Write-Host 'Falta el nombre.' -ForegroundColor Red; exit 1 }
        $sugerida = ($nombre.Normalize([Text.NormalizationForm]::FormD) -replace '\p{Mn}', '').ToLower() -replace '[^a-z0-9]+', '-'
        $clave = Preguntar 'Clave (sin espacios)' $sugerida.Trim('-')
        if ((Claves) -contains $clave) { Write-Host "Ya existe una empresa con la clave '$clave'." -ForegroundColor Red; exit 1 }
        $titulo = Preguntar 'Título del encabezado (se ve si no tiene imagen)' $nombre
        $subtitulo = Preguntar 'Subtítulo' 'Panel de Control de Operaciones'
        $encabezado = PedirImagen 'Imagen de encabezado, ej. img/encabezado-x.jpg (vacío = el título en texto)'
        $completa = $false
        if ($encabezado) { $completa = (Preguntar '¿Verla completa con los lados difuminados? (s = completa, n = llenar y recortar)' 'n') -match '^[sS]' }
        $icono = PedirImagen 'Ícono de la pestaña del navegador (vacío = img/logo.png)'

        Write-Host ''
        Write-Host '¿Qué actividad realiza?' -ForegroundColor Cyan
        foreach ($k in $ACTIVIDADES.Keys) { Write-Host "  $k. $($ACTIVIDADES[$k][1])" }
        $act = Preguntar 'Elige 1 a 4' '3'
        if (-not $ACTIVIDADES.Contains($act)) { Write-Host 'Opción no válida.' -ForegroundColor Red; exit 1 }
        $actividades = ($ACTIVIDADES[$act][0] | ForEach-Object { Js $_ }) -join ', '

        $pie = @(Preguntar 'Texto del pie' 'Derechos Reservados Achete Logistics S.A.')
        $extra = Preguntar 'Segunda línea del pie (vacío = ninguna)'
        if ($extra) { $pie += $extra }
        $base = PedirSupabase
        $colores = PedirPaleta

        $bloque = @"
    // ---------- $nombre ----------
    $(Js $clave): {
        nombre: $(Js $nombre),
        titulo: $(Js $titulo),
        subtitulo: $(Js $subtitulo),
        icono: $(Js $icono),
        // Imágenes del encabezado: css/encabezados.css (html[data-marca="$clave"])
        pie: [$(($pie | ForEach-Object { Js $_ }) -join ', ')],
        actividades: [$actividades],
        registroClientes: '',
        supabase: { url: $(Js $base[0]), anonKey: $(Js $base[1]) },
        colores: $colores,
    },


"@ -replace "`r`n", "`n"
        $texto = $texto.Replace($MARCA_FIN, $bloque + $MARCA_FIN)
        PreguntarActiva $clave
        $mensaje = "Empresa '$nombre' agregada. " + (AgregarEncabezado $clave $nombre $encabezado $completa)
        if ($base[0]) { $mensaje += ' Ejecuta sql/00_instalacion_completa.sql en su proyecto de Supabase.' }
        if ($act -eq '4') { $mensaje += ' Transporte: para que sus clientes soliciten usuario, pon su ID en registroClientes.' }
    }
    '2' {
        $clave = ElegirEmpresa
        $base = PedirSupabase
        $b = Bloque $clave
        $regex = [regex]"supabase:\s*\{\s*url:\s*'[^']*',\s*anonKey:\s*'[^']*'\s*\}"
        $m = $regex.Match($texto, $b[0])
        if (-not $m.Success -or $m.Index -gt $b[1]) { Write-Host "No se encontró el campo supabase de '$clave'." -ForegroundColor Red; exit 1 }
        $texto = $texto.Substring(0, $m.Index) + "supabase: { url: $(Js $base[0]), anonKey: $(Js $base[1]) }" + $texto.Substring($m.Index + $m.Length)
        PreguntarActiva $clave
        $mensaje = if ($base[0]) { "'$clave' usa el proyecto $($base[0]). Si es NUEVO, ejecuta sql\00_instalacion_completa.sql." } else { "'$clave' usa la base de js/supabase.js (compartida)." }
    }
    '3' {
        $clave = ElegirEmpresa
        $colores = PedirPaleta
        $b = Bloque $clave
        $dentro = $texto.Substring($b[0], $b[1] - $b[0])
        $regex = [regex]'colores:\s*\{[^{}]*\}'
        if (-not $regex.IsMatch($dentro)) { Write-Host "No se encontró el campo colores de '$clave'." -ForegroundColor Red; exit 1 }
        $dentro = $regex.Replace($dentro, "colores: $colores", 1)
        $texto = $texto.Substring(0, $b[0]) + $dentro + $texto.Substring($b[1])
        $mensaje = "Paleta de '$clave' guardada."
    }
    '4' {
        $clave = ElegirEmpresa
        $texto = [regex]::Replace($texto, "const EMPRESA_ACTIVA\s*=\s*'[^']*';", "const EMPRESA_ACTIVA = '$clave';")
        $mensaje = "Empresa activa: $clave."
    }
    default { Write-Host 'Opción no válida.' -ForegroundColor Red; exit 1 }
}

[System.IO.File]::WriteAllText($archivo, $texto, $utf8)
Write-Host ''
Write-Host "Listo: $mensaje" -ForegroundColor Green
Write-Host "Empresa activa: $(Activa). Recarga la página con Ctrl + F5 (si cambió la empresa activa, inicia sesión de nuevo)."
Write-Host ''
