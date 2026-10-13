# Convierte docs/MANUAL-DE-USO.md en docs/Manual-de-uso-ACACHETE.docx para imprimir.
# Necesita Microsoft Word instalado. Uso: clic derecho -> Ejecutar con PowerShell, o
#   powershell -ExecutionPolicy Bypass -File herramientas\manual_a_docx.ps1
# Volver a correrlo cada vez que se cambie el manual.
param([string]$Md = "$PSScriptRoot\..\docs\MANUAL-DE-USO.md", [string]$Docx = "$PSScriptRoot\..\docs\Manual-de-uso-ACACHETE.docx", [string]$Html = "$env:TEMP\manual-acachete.html")
$Md = [IO.Path]::GetFullPath($Md); $Docx = [IO.Path]::GetFullPath($Docx)
$ErrorActionPreference = 'Stop'
$lineas = [IO.File]::ReadAllLines($Md, [Text.Encoding]::UTF8)

function Esc([string]$t) { return $t.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;') }
function EnLinea([string]$t) {
    $t = Esc $t
    $t = [regex]::Replace($t, '\[([^\]]+)\]\([^)]+\)', '$1')            # enlaces -> solo el texto
    $t = [regex]::Replace($t, '\*\*([^*]+)\*\*', '<b>$1</b>')
    $t = [regex]::Replace($t, '`([^`]+)`', '<span class="cod">$1</span>')
    return $t
}

$sb = New-Object Text.StringBuilder
$hoy = (Get-Date).ToString('d \de MMMM \de yyyy', [Globalization.CultureInfo]::GetCultureInfo('es-CR'))
[void]$sb.Append(@"
<html><head><meta charset="utf-8"><style>
body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1F2933; }
h1 { font-size: 24pt; color: #1258A6; }
h2 { font-size: 16pt; color: #1258A6; border-bottom: 1.5pt solid #F2660F; padding-bottom: 2pt; margin-top: 14pt; }
h3 { font-size: 13pt; color: #0B3C70; margin-top: 12pt; }
p { margin: 4pt 0 6pt 0; line-height: 1.2; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt 0; }
th { background: #1258A6; color: #FFFFFF; font-weight: bold; border: 0.75pt solid #1258A6; padding: 3pt 5pt; text-align: left; font-size: 10pt; }
td { border: 0.75pt solid #A9B4C0; padding: 3pt 5pt; vertical-align: top; font-size: 10pt; }
.nota { background: #FFF4EC; border-left: 3pt solid #F2660F; padding: 5pt 8pt; margin: 6pt 0 8pt 0; }
.flujo { font-family: Consolas, 'Courier New', monospace; font-size: 9pt; background: #EEF3F9; border: 0.75pt solid #A9B4C0; padding: 6pt; margin: 6pt 0 8pt 0; }
.cod { font-family: Consolas, 'Courier New', monospace; font-size: 10pt; color: #0B3C70; }
.portada-titulo { font-size: 32pt; color: #1258A6; font-weight: bold; text-align: center; margin-top: 160pt; }
.portada-sub { font-size: 16pt; color: #F2660F; text-align: center; margin-top: 10pt; }
.portada-pie { font-size: 11pt; color: #66707D; text-align: center; margin-top: 220pt; }
li { margin: 2pt 0; }
</style></head><body>
<p class="portada-titulo">Manual de uso</p>
<p class="portada-sub">ACACHETE Logistics</p>
<p style="text-align:center;font-size:12pt;color:#1F2933">Desde la puesta en marcha hasta la entrega del pedido y los cierres del día</p>
<p class="portada-pie">Versión del $hoy</p>
<br style="page-break-before:always" clear="all">
"@)

$i = 0
$enLista = $null      # 'ul' | 'ol'
$enContenido = $false
$primeraParte = $true
function CerrarLista { if ($script:enLista) { [void]$script:sb.Append("</$($script:enLista)>"); $script:enLista = $null } }

while ($i -lt $lineas.Count) {
    $l = $lineas[$i]

    # Se salta el título (va en la portada) y la sección "Contenido" (la reemplaza el índice de Word)
    if ($l -match '^# ') { $i++; continue }
    if ($l -match '^## Contenido') { CerrarLista; [void]$sb.Append('<p style="font-size:16pt;color:#1258A6;font-weight:bold;margin-top:12pt">Contenido</p><p>[[INDICE]]</p>'); $enContenido = $true; $i++; continue }
    if ($enContenido) { if ($l -match '^## ') { $enContenido = $false } else { $i++; continue } }

    if ($l -match '^```') {
        CerrarLista
        $bloque = @(); $i++
        while ($i -lt $lineas.Count -and $lineas[$i] -notmatch '^```') { $bloque += (Esc $lineas[$i]); $i++ }
        [void]$sb.Append("<p class=""flujo"">$($bloque -join '<br>')</p>"); $i++; continue
    }
    if ($l -match '^\|') {
        CerrarLista
        $filas = @()
        while ($i -lt $lineas.Count -and $lineas[$i] -match '^\|') { $filas += $lineas[$i]; $i++ }
        [void]$sb.Append('<table>')
        $k = 0
        foreach ($f in $filas) {
            if ($f -match '^\|[\s:|-]+\|$') { continue }
            $celdas = $f.Trim().Trim('|').Split('|') | ForEach-Object { EnLinea $_.Trim() }
            $tag = if ($k -eq 0) { 'th' } else { 'td' }
            [void]$sb.Append('<tr>' + (($celdas | ForEach-Object { "<$tag>$_</$tag>" }) -join '') + '</tr>')
            $k++
        }
        [void]$sb.Append('</table>'); continue
    }
    if ($l -match '^> ?(.*)') {
        CerrarLista
        $texto = @()
        while ($i -lt $lineas.Count -and $lineas[$i] -match '^>') { $texto += ($lineas[$i] -replace '^> ?', ''); $i++ }
        $parrafos = (($texto -join "`n") -split "`n\s*`n") | ForEach-Object { EnLinea (($_ -split "`n") -join ' ') }
        [void]$sb.Append('<p class="nota">' + ($parrafos -join '<br><br>') + '</p>'); continue
    }
    if ($l -match '^---\s*$') { CerrarLista; $i++; continue }
    if ($l -match '^## (.*)') {
        CerrarLista
        $titulo = $Matches[1]
        # Cada parte grande empieza en una página nueva
        if ($titulo -match '^(Parte|Antes de empezar|Lista rápida|Preguntas)') {
            [void]$sb.Append('<br style="page-break-before:always" clear="all">')
        }
        [void]$sb.Append("<h1>$(EnLinea $titulo)</h1>"); $i++; continue
    }
    if ($l -match '^### (.*)') { CerrarLista; [void]$sb.Append("<h2>$(EnLinea $Matches[1])</h2>"); $i++; continue }
    if ($l -match '^\*\*(.+)\*\*\s*$' -and $l -notmatch '^\*\*.*\*\*.+\*\*') {
        CerrarLista; [void]$sb.Append("<h3>$(EnLinea $Matches[1])</h3>"); $i++; continue
    }
    if ($l -match '^(\s*)[-*] (.*)') {
        $sangria = $Matches[1].Length; $texto = $Matches[2]; $i++
        while ($i -lt $lineas.Count -and $lineas[$i] -match '^\s{2,}\S' -and $lineas[$i] -notmatch '^\s*([-*]|\d+\.) ') { $texto += ' ' + $lineas[$i].Trim(); $i++ }
        if ($sangria -gt 0 -and $enLista) { [void]$sb.Append("<ul><li>$(EnLinea $texto)</li></ul>"); continue }
        if ($enLista -ne 'ul') { CerrarLista; [void]$sb.Append('<ul>'); $enLista = 'ul' }
        [void]$sb.Append("<li>$(EnLinea $texto)</li>"); continue
    }
    if ($l -match '^(\s*)\d+\. (.*)') {
        $texto = $Matches[2]; $i++
        while ($i -lt $lineas.Count -and $lineas[$i] -match '^\s{2,}\S' -and $lineas[$i] -notmatch '^\s*([-*]|\d+\.) ') { $texto += ' ' + $lineas[$i].Trim(); $i++ }
        if ($enLista -ne 'ol') { CerrarLista; [void]$sb.Append('<ol>'); $enLista = 'ol' }
        [void]$sb.Append("<li>$(EnLinea $texto)</li>"); continue
    }
    if ($l.Trim() -eq '') {
        # Una línea vacía no corta una lista si sigue otro elemento de la misma lista o una sublista
        $sig = if ($i + 1 -lt $lineas.Count) { $lineas[$i + 1] } else { '' }
        if (-not ($enLista -and $sig -match '^\s*([-*]|\d+\.) ')) { CerrarLista }
        $i++; continue
    }
    # Párrafo (une las líneas seguidas)
    CerrarLista
    $texto = $l.Trim(); $i++
    while ($i -lt $lineas.Count -and $lineas[$i].Trim() -ne '' -and $lineas[$i] -notmatch '^(#|\||>|```|\s*[-*] |\s*\d+\. |---)') { $texto += ' ' + $lineas[$i].Trim(); $i++ }
    [void]$sb.Append("<p>$(EnLinea $texto)</p>")
}
CerrarLista
[void]$sb.Append('</body></html>')
[IO.File]::WriteAllText($Html, $sb.ToString(), (New-Object Text.UTF8Encoding($true)))

# ---------- Word: abrir el HTML, índice, márgenes, pie con número de página y guardar .docx ----------
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open($Html, $false, $false, $false)
    $doc.ActiveWindow.View.Type = 3   # vista de diseño de impresión
    $ps = $doc.PageSetup
    $ps.PaperSize = 7                 # carta (wdPaperLetter)
    $ps.TopMargin = 72; $ps.BottomMargin = 72; $ps.LeftMargin = 72; $ps.RightMargin = 72

    # Índice automático en lugar de [[INDICE]] (títulos de nivel 1 y 2)
    $rango = $doc.Content
    $f = $rango.Find
    if ($f.Execute('[[INDICE]]')) {
        $rango.Text = ''
        $toc = $doc.TablesOfContents.Add($rango, $true, 1, 2)
        $toc.Range.ParagraphFormat.SpaceBefore = 0; $toc.Range.ParagraphFormat.SpaceAfter = 0; $toc.Range.Font.Size = 10
    }

    # Pie: "ACACHETE Logistics · Manual de uso" y número de página (sin pie en la portada)
    $sec = $doc.Sections.Item(1)
    $ps.DifferentFirstPageHeaderFooter = -1
    $pie = $sec.Footers.Item(1).Range
    $pie.Text = 'ACACHETE Logistics · Manual de uso · Página '
    $pie.Font.Size = 9
    $pie.Font.Name = 'Calibri'
    $pie.Font.Color = 0x7D7066
    $pie.ParagraphFormat.Alignment = 1
    $fin = $sec.Footers.Item(1).Range
    $fin.Collapse(0)
    [void]$doc.Fields.Add($fin, 33)   # wdFieldPage

    # Tablas: que no se partan las filas y que el encabezado se repita en cada página
    foreach ($t in $doc.Tables) {
        $t.Rows.AllowBreakAcrossPages = 0
        $t.Rows.Item(1).HeadingFormat = -1
        $t.AutoFitBehavior(2)          # ajustar al ancho de la página
        $t.Range.ParagraphFormat.SpaceBefore = 0; $t.Range.ParagraphFormat.SpaceAfter = 0
        $t.TopPadding = 2; $t.BottomPadding = 2
    }
    if ($doc.TablesOfContents.Count -gt 0) { $doc.TablesOfContents.Item(1).Update(); $r = $doc.TablesOfContents.Item(1).Range; $r.ParagraphFormat.SpaceBefore = 0; $r.ParagraphFormat.SpaceAfter = 0; $r.Font.Size = 10 }

    $doc.SaveAs2($Docx, 16)           # wdFormatDocumentDefault (.docx)
    $paginas = $doc.ComputeStatistics(2)
    $tablas = $doc.Tables.Count
    $doc.Close($false)
    "OK: $Docx · $paginas páginas · $tablas tablas"
} finally {
    $word.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
