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
| `--radio`, `--radio-grande` | 8px / 12px | Esquinas redondeadas |
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
- Animaciones y transiciones: respetar las que existen (cambiar la duración de salida de sección exige
  cambiar también `DURACION_SALIDA` en `pagina_inicial.js`).
- Responsive: reglas nuevas solo dentro de los `@media` de `responsive.css`; las de secciones con el
  prefijo `html body` para ganarle al CSS de la sección; subir `?v=N` en `index.html`.
