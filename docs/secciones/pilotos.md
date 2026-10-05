# Pilotos (`#pilotos`)

| Archivo | Qué tiene |
|---|---|
| `secciones/pilotos.html`, `js/secciones/pilotos.js`, `css/secciones/pilotos.css` | Clases e ids `plt` |
| Tablas | `usuarios` (rol `piloto`), `tiendas`, `vehiculos` |

## Qué hace

Solo **muestra** los usuarios con rol Piloto, agrupados por tienda: foto, usuario, teléfono, vehículo.
Filtro por región y buscador (nombre, usuario, tienda, placa). Columna "Funciones": por definir.

Un piloto aparece solo con tener el rol Piloto en **Usuarios**; sus datos se cambian allá.

## Quién ve qué

G2: pilotos de su región (filtro fijo) · G3: su tienda · Administrador y G1: todos ·
Empleado y Piloto: sin acceso.

## Dónde tocar

| Quiero... | Dónde |
|---|---|
| Columnas que se leen | `PLT_COLUMNAS` |
| Número de columnas de la tabla | `PLT_COLUMNAS_TABLA` |
