# 15. Distribuidora (productos, bodega del día, venta en ruta y cierres)

Para una empresa que distribuye productos (ej. alimentos): la empresa crea sus productos y precios, llena cada
día la bodega de cada ruta, reparte la carga entre los pilotos, el piloto entrega (puede ser menos de lo pedido) o
vende en ruta, devuelve lo no vendido y se cuadra todo en **unidades y en dinero con IVA**.

SQL: **`sql/01_actualizacion_base_existente.sql` bloques 26 y 27** (instalación nueva: `sql/00`, secciones 19 y 20).
Sección: **Distribución** (`#distribucion`): `secciones/distribucion.html`, `js/secciones/distribucion.js`,
`css/secciones/distribucion.css`. Piezas comunes con Pedidos: `js/distribucion-comun.js` y `css/distribucion.css`.

## Cuándo aparece

- Una actividad con **"Productos de distribuidora"** marcado (Configuración → Actividades → "Qué usa en todo el
  sistema", columna `usa_productos`). El bloque 26 crea la actividad **Distribución** (`distribucion`) con productos
  y vehículos (sin km ni peso). Se agrega a la empresa en Tiendas → Empresas.
- Y el plan de la empresa incluye **"Distribución"** (`distribucion`, Configuración → Planes y funciones; viene en
  Profesional y Completo).
- Las **rutas** de productos son las de la tienda sin actividad o con una actividad que use productos
  (Rutas y asignaciones).

## Quién hace qué

| Rol | Puede |
|---|---|
| Administrador, Admin G1 | Todo: productos, presentaciones, listas, precios, lista de cada tienda, motivos; bodegas de todas las tiendas |
| Admin G2 | Bodegas de las tiendas de su región; ve productos y precios |
| Admin G3 | Bodegas de su tienda; ve productos y precios |
| Piloto | **Mi carga**: lo que lleva, sus pedidos del día, **venta en ruta** y sus cierres; ve los precios |
| Empleado | No ve la sección (registra pedidos de productos en Pedidos) |

Las funciones de la base (`dist_*`) revisan quién mueve la bodega (G3 o superior en su alcance) aunque la página
también lo controle.

## 1. Productos y precios (los crea la empresa)

No trae catálogo: todo lo crea la empresa en **Distribución → Productos y precios**.

- **Producto** (`productos`): nombre, código y categoría opcionales, activo.
- **Presentación** (`producto_presentaciones`): cómo se vende ("Unidad", "Caja 12 x 1 L"), unidades que trae,
  código de barras, activa. Al crear un producto se pide su primera presentación (y su precio).
- **Listas de precios** (`listas_precios`): ej. General, Zona Norte, Mayorista. Una puede ser la **general**: la usan
  las tiendas sin lista propia y cuando a una lista le falta un precio.
- **Precio** (`precios`): por presentación y por lista, **sin IVA** + **% de IVA** (13 por defecto, se cambia en cada
  precio). El precio con IVA se calcula solo. Se cambian en la tabla y se guardan con **Guardar precios**; dejar un
  precio vacío lo quita de esa lista (usa el de la general).
- **Lista de cada tienda** (`tiendas.lista_precios_id`): la que viene puesta en sus pedidos y en su bodega del día.
  Se puede cambiar en cada pedido y al abrir cada bodega.
- **Motivos de entrega incompleta** (`motivos_entrega_parcial`): los elige el piloto cuando el cliente recibe menos
  (o escribe otro).

Un producto o presentación que ya se usó en bodegas o pedidos no se puede eliminar: se desactiva.

## 2. Preventa: pedido con productos (Pedidos)

En **Nuevo pedido**, al elegir una actividad con productos, el bloque "Mercadería" cambia: en vez de categorías
se elige la **lista de precios** y los **productos con su cantidad** (`crearSelectorProductos`). El cobro suma los
productos con IVA (más el envío, si la actividad tiene tarifa). Se guarda en `pedido_productos` (cantidad pedida,
precio sin IVA e IVA de ese momento) y el resumen en `pedidos.detalle.productos` (`lista_id`, `subtotal`, `iva`, `total`).

**Entrega** (piloto, botón "Entregado"): se abre la ventana **cuánto recibió de cada producto**
(`abrirEntregaProductos`). Si es menos, el **motivo es obligatorio**. La base (`dist_entregar`):

- guarda lo entregado y el motivo, y de qué bodega salió (la de la carga del piloto, si tiene);
- revisa que el piloto lleve suficiente;
- recalcula **A cobrar** = envío que se cobraba + productos entregados con IVA;
- deja el pedido **Entregado** o, si faltó algo, **Entregado con incidencia** (+ aviso al G3 de la tienda);
- guarda cómo pagó el cliente (lo usa la **Caja** del piloto).

## 3. Bodega del día (por ruta)

Distribución → **Bodega del día**: elegir tienda, ruta y fecha.

1. **Abrir bodega** (`dist_bodega_abrir`): una por ruta y fecha, con la lista de precios con que se valora.
2. **Ingresar producto**: lo que hubo ese día.
3. **Cargar a piloto**: se puede dividir entre varios pilotos (primero salen los asignados a la ruta ese día).
   "Sugerir según sus pedidos" pone lo que suman sus pedidos del día menos lo que ya lleva; se puede agregar más
   para la venta en ruta. No se puede cargar más de lo que hay en la bodega.
4. **Pasar entre pilotos** (traspaso), **Ajuste** (+/−, con motivo obligatorio).
5. **Devolución de piloto**: lo que trae de vuelta, **bueno** o **dañado / vencido** ("Todo lo que lleva" lo sugiere).
6. **Cerrar la mercadería del piloto** (`dist_cerrar_piloto`): cuadre por producto
   **cargado = entregado + vendido + devuelto + faltante**, en unidades y en dinero. Lo que no entregó, vendió ni
   devolvió queda como **faltante**: aviso al G3 y G2 de la tienda y al piloto, y sale en el **reporte de faltantes**.
   Pide que no tenga pedidos de productos en ruta. Después ya no se le puede cargar de esa bodega.
7. **Cerrar bodega** (`dist_cerrar_bodega`): con todos los pilotos cerrados. Lo que queda **sale** (vuelve a la
   tienda), la bodega queda **en 0** y se guarda el **resumen del día** (`bodegas_dia.resumen`: lo que hubo,
   cargado, entregado, vendido, devuelto bueno y dañado, faltante y salida, por producto y en dinero).

Cada movimiento (`bodega_movimientos`) guarda quién, cuándo y el precio de la lista de la bodega en ese momento.

## 4. Venta en ruta (autoventa, piloto)

Distribución → **Mi carga** → **Venta en ruta**: cliente (vacío = de contado), lista de precios, productos de lo que
lleva (no deja vender más de lo que tiene en mano) y cómo pagó. La base (`dist_venta_ruta`) la registra como un
**pedido ya entregado** (`detalle.venta_ruta = true`) con sus productos, así entra en la Caja del piloto y en el cuadre.

## 5. Historial y faltantes

Distribución → **Historial y faltantes** (G3 o superior), por fechas y ruta:

- **Reporte de faltantes**: cierres con faltante, por piloto y producto, en unidades y dinero. **Exportar
  faltantes** (CSV, se abre en Excel) si el plan incluye "Exportar reportes".
- **Cierres de pilotos**: cargado, entregado, vendido, devuelto, faltante, valor cargado, entregado + vendido y a cobrar.
- **Bodegas del día**: resumen de cada una ("Ver"); una abierta se abre en la pestaña Bodega del día.

## Valores (dinero)

- Línea = cantidad × precio sin IVA × (1 + IVA/100), redondeada a 2 decimales (igual en la página y en la base).
- **Cargado, devuelto y faltante** se valoran con los precios con que se cargó (lista de la bodega).
- **Entregado y vendido** con los precios de cada pedido o venta (su lista). Por eso, si la lista del pedido es
  distinta a la de la bodega, "valor cargado" y "entregado + vendido + devuelto + faltante" pueden no coincidir en
  dinero; en unidades siempre cuadra.
- El dinero cobrado se cuadra en la **Caja** (`caja_cerrar`), como cualquier entrega.

## Funciones de la base (sql/01 bloque 27)

| Función | Qué hace |
|---|---|
| `dist_bodega_abrir(p)` | Abre (o devuelve) la bodega de una ruta en una fecha |
| `dist_movimiento(p)` | Ingreso, carga, devolución, traspaso o ajuste; todo o nada (nada queda en negativo) |
| `dist_entregar(p)` | Entrega por producto de un pedido (preventa) |
| `dist_venta_ruta(p)` | Venta en ruta (pedido ya entregado) |
| `dist_cerrar_piloto(p)` | Cuadre y cierre de la mercadería de un piloto |
| `dist_cerrar_bodega(p)` | Salida de lo que queda, bodega en 0 y resumen del día |
| `dist_bodega_saldo(bodega)` | Lo que hay en la bodega por producto (para leer) |
| `dist_piloto_resumen(bodega, piloto)` | Lo que lleva un piloto por producto (para leer) |

Las tablas `bodegas_dia`, `bodega_movimientos` y `cierres_mercaderia` la página solo las lee; `pedido_productos` la
página la crea con el pedido y solo la base pone lo entregado.

## Pendiente / ideas

- Inventario permanente de la tienda (hoy la bodega es solo del día y se vacía al cerrar).
- Descontar el faltante al piloto (hoy solo se reporta y se avisa).
- Lista de precios por cliente (hoy por tienda, y se elige en cada pedido).
- Que la app del piloto use las mismas funciones (`dist_entregar`, `dist_venta_ruta`).
