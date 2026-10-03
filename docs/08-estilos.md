# 8. Estilos (CSS)

## Dónde va cada cosa

| Archivo | Qué contiene | Cuándo tocarlo |
|---|---|---|
| `css/variables.css` | Colores, fuentes, bordes y sombras con nombre | Cambiar un color para todo el sistema |
| `css/base.css` | Reinicio, fuente general, `[hidden]` siempre oculto | Casi nunca |
| `css/animaciones.css` | `@keyframes` compartidos | Animación que usen varias secciones |
| `css/componentes.css` | Piezas comunes (ver abajo) | Cambiar cómo se ven TODOS los botones, tablas... |
| `css/index.css` | Encabezado, menú, pie, notificaciones | El marco que se ve siempre |
| `css/secciones/<nombre>.css` | Lo propio de una sección (prefijo de clases) | Solo esa sección; gana sobre lo anterior |
| `responsive/responsive.css` | Tablet y celular (solo `@media`) | Pantallas ≤ 1200 px |

## Medidas: todo en `rem` (multirresolución)

**No usar `px`** en estilos nuevos (salvo bordes finos de 1–2 px y los cortes de `@media`).
1rem es la escala de todo el sistema y la calcula `css/base.css` según la ventana (gana el menor
entre ancho y alto, así cabe en pantallas bajas y no se agiganta en ultra anchas):

| Pantalla | 1rem |
|---|---|
| 1366×768 | 15 px (mínimo en computadora) |
| 1536×864 (1920×1080 con Windows al 125 %) | 16 px |
| **1920×1080 (referencia)** | **18 px** |
| 2560×1440 | 21.5 px |
| 3840×2160 (4K) | 28 px (máximo) |
| Tablet y celular (≤ 900 px) | 16 px fijo |

Para pasar una medida de diseño a rem: **px ÷ 18** (ej. 24px → `1.333rem`); en los bloques de celular
de `responsive.css`, **px ÷ 16**. Como todo está en rem, de 1366 a 4K no hacen falta cortes de `@media`:
la pantalla entera se escala junta.

Medidas del marco en `css/variables.css`: `--alto-encabezado`, `--alto-pie` (mínimo; crece si los
botones bajan de línea), `--ancho-menu` (15 % con mínimo y máximo) y `--ancho-max-pagina` (en monitores
ultra anchos la sección se centra).

## Variables (`css/variables.css`)

| Variable | Valor ACACHETE | Se usa en |
|---|---|---|
| `--color-fondo-oscuro` | `#001C3B` | Fondo general, menú, pie, franja del login |
| `--color-azul-marino` | `#07305C` | Bordes, etiquetas, avatar sin foto, fecha |
| `--color-azul` | `#1258A6` | Enlaces, foco de los campos, iconos de editar |
| `--color-azul-claro` | `#E8F2FC` | Fondos suaves: títulos de tabla, hover |
| `--color-naranja` | `#F2660F` | Acción principal: botones, opción activa del menú |
| `--color-naranja-oscuro` | `#D9570A` | Hover de los botones naranjas |
| `--color-naranja-claro` | `#FDEBDD` | Etiqueta "Administrador" |
| `--color-blanco`, `--color-fondo` | `#FFFFFF`, `#F6F9FC` | Fondos de tarjetas y secciones |
| `--color-texto`, `--color-gris`, `--color-placeholder` | `#222B37`, `#66707D`, `#9AA3AE` | Textos |
| `--color-borde`, `--color-borde-suave` | `#DDE3EA`, `#EEF1F5` | Bordes y líneas |
| `--color-verde`, `-claro` / `--color-rojo`, `-oscuro`, `-claro` | | Éxito / error |
| `--fuente-base`, `--fuente-codigo` | Segoe UI / Consolas | Textos / usuarios y códigos |
| `--radio`, `--radio-grande` | 0.444rem / 0.667rem (8 / 12 px en 1920×1080) | Esquinas redondeadas |
| `--sombra-tarjeta`, `--sombra-foco`, `--sombra-boton` | | Sombras |

Una empresa puede cambiar cualquiera de estas en su campo `colores` ([02-empresa-nueva.md](02-empresa-nueva.md)).

⚠ **Colores escritos directamente** (no cambian con la paleta de la empresa): hay unos 90, por ejemplo
`#B34A07` (texto de "pendiente", en varias secciones), los colores de los botones del pie, de las
etiquetas turquesa/rosada/morada, de las gráficas de Reportes y del QR. Aprobado pasarlos a variables
**con el mismo valor** (sin cambio visual). Ver [12-pendientes.md](12-pendientes.md).

## Piezas de `css/componentes.css`

| Pieza | Clases |
|---|---|
| Página | `pagina`, `pagina-cabecera`, `pagina-titulo`, `pagina-subtitulo`, `pagina-acciones`, `tarjeta` |
| Buscador | `buscador`, `buscador-input` |
| Botones | `boton` + `boton-principal` / `boton-secundario` / `boton-peligro`, `boton-chico`; de icono: `boton-icono` + `-editar`, `-eliminar`, `-revisar`, `-ver` |
| Avisos | `aviso` (+ `visible`, `ok` / `error`) |
| Tablas | `tabla-caja`, `tabla`, `tabla-col-acciones`, `tabla-botones`, filas de grupo, `celda-detalle`, `texto-codigo` |
| Etiquetas | `etiqueta` + `-naranja`, `-azul`, `-verde`, `-morada`, `-turquesa`, `-rosada`, `-gris` |
| Avatar | `avatar` + `-chico`, `-mediano`, `-grande` |
| Formularios | `campos`, `campo`, `campo-ancho`, `campo-etiqueta`, `campo-input`, `campo-ayuda`, `form-error` |
| Filtros y resumen | `filtros`, `filtro`, `resumen`, `resumen-item` (+ color), `resumen-numero`, `resumen-texto` |
| Pestañas | `pestanas`, `pestana` (`.activo` = elegida), `pestana-cuenta` — las arma `crearPestanas()` |
| Ventanas | `<dialog class="dialogo">` (+ `dialogo-chico`), `dialogo-form`, `dialogo-titulo`, `dialogo-texto`, `dialogo-botones` |

Antes de crear un estilo nuevo, buscar aquí: casi todo ya existe.

## Reglas

- Un estilo nuevo de una sección va en su CSS, con el prefijo de la sección (`ped-`, `cfg-`...).
- Para ocultar algo desde JS: `elemento.hidden = true` (base.css lo oculta siempre).
- Iconos: Bootstrap Icons 1.11.3 (`<i class="bi bi-truck"></i>`), https://icons.getbootstrap.com.
  `base.css` hace que los `.bi` nunca se encojan (por el `min-width: 0` general, en pantallas medianas el
  texto de al lado los dejaba en 0 de ancho y el dibujo quedaba encima de las letras). Si un icono va al lado
  de un texto largo en un `flex`, darle además un ancho fijo y al texto `flex: 1` (ej. `.ped-actividad`).
- Animaciones y transiciones: respetar las que existen (cambiar la duración de salida de sección exige
  cambiar también `DURACION_SALIDA` en `pagina_inicial.js`).
- Responsive: reglas nuevas solo dentro de los `@media` de `responsive.css`; las de secciones con el
  prefijo `html body` para ganarle al CSS de la sección; subir `?v=N` en `index.html`.
