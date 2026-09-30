# ==================================================
# CAMBIAR EL PROYECTO DE SUPABASE DE UNA EMPRESA
# ACACHETE LOGISTICS
#
# Uso: doble clic en herramientas\cambiar_supabase.bat
#      (o en la terminal de VS Code:
#       powershell -ExecutionPolicy Bypass -File herramientas\cambiar_supabase.ps1)
#
# Pregunta:
#   1. La empresa (Enter = la activa).
#   2. La "Project URL" y la clave "anon public" del proyecto de Supabase
#      (Supabase -> Project Settings -> API).
#   3. Si se deja como empresa activa.
# y lo guarda en empresas/empresas.js (campo supabase de esa empresa).
#
# Dejar la URL vacía = la empresa vuelve a usar la base de js/supabase.js.
# Recordatorio: en un proyecto NUEVO de Supabase hay que ejecutar primero
# sql/00_instalacion_completa.sql.
# ==================================================

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$archivo = Join-Path $raiz 'empresas\empresas.js'
$utf8 = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $archivo)) { Write-Host "No se encontró $archivo" -ForegroundColor Red; exit 1 }
$texto = [System.IO.File]::ReadAllText($archivo, $utf8)

# ---------- Empresas y empresa activa ----------
$activa = [regex]::Match($texto, "const EMPRESA_ACTIVA\s*=\s*'([^']+)'").Groups[1].Value
$claves = [regex]::Matches($texto, "(?m)^\s{4}'([a-z0-9-]+)':\s*\{") | ForEach-Object { $_.Groups[1].Value }

Write-Host ""
Write-Host "Empresas en empresas/empresas.js:" -ForegroundColor Cyan
foreach ($c in $claves) {
    $marca = if ($c -eq $activa) { '  <- activa' } else { '' }
    Write-Host "  - $c$marca"
}
Write-Host ""

$empresa = Read-Host "Empresa a cambiar (Enter = $activa)"
if ([string]::IsNullOrWhiteSpace($empresa)) { $empresa = $activa }
$empresa = $empresa.Trim()
if ($claves -notcontains $empresa) { Write-Host "No existe la empresa '$empresa'." -ForegroundColor Red; exit 1 }

# ---------- Datos del proyecto de Supabase ----------
Write-Host ""
Write-Host "Supabase -> tu proyecto -> Project Settings -> API" -ForegroundColor Cyan
$url = (Read-Host "Project URL (ej. https://abcd1234.supabase.co; vacío = usar la base de js/supabase.js)").Trim().TrimEnd('/')
$clave = ''
if ($url) {
    if ($url -notmatch '^https://[a-z0-9-]+\.supabase\.co$') {
        Write-Host "La URL no parece de Supabase (debe ser https://xxxx.supabase.co)." -ForegroundColor Red; exit 1
    }
    $clave = (Read-Host "Clave anon public (empieza con eyJ...)").Trim()
    if ($clave -notmatch '^eyJ[\w-]+\.[\w-]+\.[\w-]+$') {
        Write-Host "La clave no parece válida (debe ser la 'anon public', empieza con eyJ)." -ForegroundColor Red; exit 1
    }
}

# ---------- Reemplazar el campo supabase de esa empresa ----------
$inicio = $texto.IndexOf("'$empresa': {")
$regex = [regex]"supabase:\s*\{\s*url:\s*'[^']*',\s*anonKey:\s*'[^']*'\s*\}"
$coincidencia = $regex.Match($texto, $inicio)
if (-not $coincidencia.Success) { Write-Host "No se encontró el campo supabase de '$empresa'." -ForegroundColor Red; exit 1 }
$nuevo = "supabase: { url: '$url', anonKey: '$clave' }"
$texto = $texto.Substring(0, $coincidencia.Index) + $nuevo + $texto.Substring($coincidencia.Index + $coincidencia.Length)

# ---------- ¿Empresa activa? ----------
if ($empresa -ne $activa) {
    $resp = Read-Host "¿Dejar '$empresa' como empresa activa? (s/n)"
    if ($resp -match '^[sS]') {
        $texto = [regex]::Replace($texto, "const EMPRESA_ACTIVA\s*=\s*'[^']*';", "const EMPRESA_ACTIVA = '$empresa';")
        $activa = $empresa
    }
}

[System.IO.File]::WriteAllText($archivo, $texto, $utf8)

Write-Host ""
if ($url) {
    Write-Host "Listo: '$empresa' usa el proyecto $url" -ForegroundColor Green
    Write-Host "Si el proyecto es NUEVO, ejecuta en su SQL Editor: sql\00_instalacion_completa.sql" -ForegroundColor Yellow
} else {
    Write-Host "Listo: '$empresa' usa la base de js/supabase.js (compartida)." -ForegroundColor Green
}
Write-Host "Empresa activa: $activa. Recarga la página con Ctrl + F5 e inicia sesión de nuevo."
Write-Host ""
