# Reportes (`#reportes`)

| Archivo | Qué tiene |
|---|---|
| `secciones/reportes.html`, `js/secciones/reportes.js`, `css/secciones/reportes.css` | Clases e ids `rep` |
| Tablas | `pedidos` (+ artículos y cierre de entrega), `tiendas`, `regiones`, `actividades`, `usuarios` |
| Librerías (CDN, se descargan al usarlas) | Chart.js (gráficas), SheetJS (Excel), jsPDF + autotable (PDF) |

## Qué hace

- **Una pestaña por actividad** (Entregas de tienda | Encomiendas): cada reporte es de **una sola
  actividad**, nunca revueltas. Con una sola actividad no se muestran pestañas.
- **Filtros en cascada:** Región → Tienda → Cliente / Empleado / Piloto (con una tienda elegida).
  Además fechas (con atajos: hoy, semana, mes, mes anterior, año).
- Los filtros y la actividad quedan en la dirección (`#reportes?actividad=tienda&region=CEN&...`):
  "atrás" y los enlaces funcionan. "Limpiar" no cambia la pestaña.
- Muestra: tarjetas de resumen, gráficas (una serie, un color), récord del cliente o rendimiento del
  empleado/piloto, y tabla detallada.
- **Exportar** a Excel y PDF exactamente lo que se ve, con la actividad en el título, en los filtros y
  en el nombre del archivo (`reporte-encomiendas-2026-09-01-a-2026-09-30.pdf`). El PDF usa "CRC"
  porque su letra no tiene "₡".

## Qué cambia según la actividad

Depende de lo que **usa** la actividad (Configuración → Actividades), no de su nombre:

| La actividad... | Tarjetas | Gráfica propia | Columnas |
|---|---|---|---|
| (todas) | Pedidos, Entregados, A tiempo, Satisfechos, Incidencias, Cancelados, Envíos cobrados | Por día, por estado, **mercadería por categoría**, por piloto, retrasos | Pedido, fecha, tienda, cliente, piloto, estado, envío, a cobrar, peso |
| usa compra | Compras (+ con envío gratis) | Compras por tienda | Compra |
| permite alcohol | Con alcohol | — | Alcohol |
| no usa compra | Peso transportado (+ bultos) | — | Bultos |
| usa bodega | En bodega | — | — |
| usa recolección | Con recolección | — | Recolección |
| usa tamaños | — | Bultos por tamaño | — |

El récord también cambia: con compra, "Monto total (compras + envíos)"; sin compra, "Monto total
(envíos)" y el peso enviado.

## Quién ve qué

Administrador y G1: todo, exportan · G2: su región (fija), exporta · G3: su región y tienda (fijas),
**solo ve** · Empleado y Piloto: sin acceso.

## Dónde tocar

| Quiero... | Dónde |
|---|---|
| Agregar una tarjeta propia de una actividad | `TARJETAS_ACTIVIDAD` (`si` = cuándo aparece) |
| Agregar una columna propia de una actividad | `TODAS_COLUMNAS` (campo `si`) |
| Cambiar la gráfica propia de la actividad | `graficaExtra()` |
| Versiones de las librerías | `REP_LIBRERIAS` |
| Colores de las gráficas | `REP_COLORES` |
| Moneda | `REP_MONEDA`, `REP_MONEDA_PDF` |
| Textos de estados / qué cuenta como entregado o pendiente | `REP_ESTADOS`, `REP_ENTREGADOS`, `REP_PENDIENTES` (repetidos de Pedidos) |
