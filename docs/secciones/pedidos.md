# Pedidos (`#pedidos`)

| Archivo | Qué tiene |
|---|---|
| `secciones/pedidos.html` | Las 3 vistas y las ventanas (QR, asignar, confirmar acción) |
| `js/secciones/pedidos.js` | Toda la lógica (~2250 líneas, organizado por bloques) |
| `css/secciones/pedidos.css` | Estilos propios (clases `ped-`) |
| Tablas | `pedidos`, `pedido_articulos`, `pedido_historial`, `pedido_entregas`, `pedido_evidencias`, `actividades`, `categorias_mercaderia`, `articulos_catalogo`, `tamanos_bulto`, `tarifas`, `descuentos`, `rutas`, `rutas_pilotos`, `capacidad_marcas`, `configuracion`, `clientes` |

## Vistas (según el `#`)

| Dirección | Vista |
|---|---|
| `#pedidos` | **Lista**: una pestaña por actividad; filtros (fecha, tienda, ruta, estado, ver anulados), resumen por estado (clic = filtrar), buscador |
| `#pedidos?nuevo=1` | **Registrar** un pedido (`&actividad=encomiendas` la deja elegida) |
| `#pedidos?id=15` | **Detalle**: cliente y entrega, cobro, mercadería, cierre de entrega, línea de tiempo, acciones |
| `#pedidos?id=15&qr=1` | Detalle + abre el QR (al recién crearlo) |
| `#pedidos?id=15&abrir=reasignar` / `cancelar` | Detalle + abre esa ventana |
| `#pedidos?accion=reasignar` / `cancelar` | Lista de pendientes para elegir cuál (botones del pie) |

## Lista: cada actividad por separado

Las actividades **no se mezclan**: arriba de la lista hay una **pestaña por actividad** de la empresa
(con el número de pedidos de cada una). Con una sola actividad no se muestran pestañas.

| Qué cambia con la pestaña | Cómo |
|---|---|
| Pedidos, resumen y contador | Solo los de esa actividad ("3 pedidos de Encomiendas para el ...") |
| Rutas (filtro y "Rutas del día") | Las de esa actividad y las que sirven para todas |
| Cuadro y estado "En bodega" | Solo si la actividad **usa bodega** |
| Columna propia | **Compra** si la actividad **usa compra**; si no, **Peso** |
| Celda del pedido / entrega | "Lleva alcohol" si **permite alcohol**; "Recoger en: ..." si **usa recolección** |
| Botón "Nuevo pedido" | Abre el formulario con esa actividad elegida |

La pestaña elegida se recuerda mientras dure la sesión (`sessionStorage`, clave `ped_actividad`).
Se cargan los pedidos de todas las actividades (para el número de cada pestaña) y se separan en
`separarPorActividad()`; lo que depende de la actividad se arma en `prepararSegunActividad()`.

## Registrar un pedido: el formulario se arma según la actividad

1. **Actividad y tienda.** Tarjetas con las actividades **activas** (Configuración → Actividades; iguales
   en todas las tiendas) que realiza la empresa (`empresas.js`).
   Número de pedido a mano si Configuración lo pide.
2. **Cliente:** buscar de la tienda o escribir nombre y teléfono.
3. **Entrega:** recolección (si la actividad **usa recolección**), dirección, quién recibe, fecha,
   horario (con ocupación "2/5"; lleno = no se puede elegir), ruta, piloto (solo G2+), notas.
   **Mapa A → B** (`js/mapa.js`, gratis):
   - **A** = la tienda (sus coordenadas guardadas o, si no tiene, su dirección). En Encomiendas, si se
     escribe la recolección, A = la recolección.
   - **B** = la dirección de entrega, o la ubicación guardada del cliente si tiene coordenadas o un enlace de mapas.
   - **Mientras se escribe** la recolección o la entrega aparecen **sugerencias** (primero las de la zona
     que se ve en el mapa); al elegir una, el punto se pone solo. Si no se elige, la dirección se busca al
     salir del campo. Los puntos se corrigen con un clic en el mapa o arrastrándolos, y se pueden pegar
     coordenadas o un enlace de Google Maps. "Ampliar mapa" lo agranda (útil en celular).
   - Muestra los **km por calle** (OSRM) y los minutos; si la tarifa tiene **precio por km**, se suman al
     envío y el pedido no se guarda sin A y B.
   - Administrador y G1 ven **"Guardar A como ubicación de la tienda"** (tabla `tiendas`: `lat`, `lng`).
   - Se guarda `distancia_km`, `detalle.ruta` (puntos A y B) y el km en `costo_desglose`. En el detalle
     del pedido aparecen la distancia y los enlaces **Ir con Google Maps / Waze** (para el piloto).
4. **Mercadería:** casillas con las **categorías de esa actividad**. Cada una abre sus campos según el tipo:
   - `conteo`: cajas, bolsas, hieleras, peso aprox. (+ "lleva alcohol" si la actividad lo permite)
   - `articulos`: artículo (lista del catálogo) + cantidad + **peso que se llena solo y se puede cambiar**
   - `bulto`: descripción, cantidad, tamaño (si **usa tamaños**) y peso de cada uno
   - `documento`: solo cantidad (peso = `peso_referencia` de la categoría)
   Peso total abajo (lo ve el piloto).
5. **Cobro:** desglose con la tarifa (tienda > región > general), descuento (máx. 1), qué cobra el piloto
   (envío / la compra si **usa compra**), forma de pago, "paga con" y vuelto.

Lo que "usa" cada actividad se marca en **Configuración → Actividades**; en el código se consulta con
`usa('usa_recoleccion')`, `usa('usa_tamanos')`, `usa('usa_compra')`, `usa('permite_alcohol')`
(formulario) o `usaLista(...)` (lista). Ambas llaman a `usaActividad()` de `empresas/empresas.js`,
que también usa Reportes.

Al guardar:
- **Piloto:** el elegido a mano (G2+) o el de la ruta ese día (`pilotoAutomatico`: si hay varios,
  el que tenga menos pedidos).
- **Estado inicial:** con piloto → `asignado`; sin piloto y la actividad **usa bodega** →
  `recibido_bodega`; si no → `registrado`.
- Se guarda el pedido, sus filas en `pedido_articulos` (peso **de cada uno**), el evento en
  `pedido_historial` y se abre el QR.
- El número (`P-000001`) y el código de respaldo de 4 dígitos los pone la base de datos.

### Cálculo del envío (`calcularEnvioTarifa` en `js/componentes.js`, compartido con el Cotizador)

```
envío = cargo fijo + mínimo + max(0, peso − kg que cubre el mínimo) × precio por kg
        + km (mapa A → B) × precio por km
gratis si la compra ≥ "envío gratis desde"
luego se resta el descuento (% o monto, máx. 1)
```

La misma fórmula está en `python/tarifas.py` (calculadora de Configuración). **Si se cambia una, cambiar la otra.**

## Estados y acciones del detalle (`PED_ACCIONES`)

```
Registrado → [En bodega] → Asignado → En ruta → Entregado
                                             ↘ No entregado → Reprogramar / Devuelto
Cancelado (antes de salir)        Anulado (registrado por error; oculto, no se borra)
```

| Acción | En qué estados | Quién |
|---|---|---|
| QR (ver, descargar, compartir, WhatsApp) | Siempre | Todos menos Piloto |
| Recibido en bodega | Registrado (si la actividad usa bodega) | Todos menos Piloto |
| Asignar piloto y horario | Antes de salir | G2 o superior |
| Solicitar reasignación | Antes de salir / No entregado | Admin G3 y Empleado (le llega al G2) |
| Salí a entregar / Entregado / No entregado | Asignado → En ruta → ... | **Solo el piloto del pedido** |
| Reprogramar | No entregado | G2 o superior |
| Devuelto / Cancelar | Según estado | Admin G3 o superior (el Empleado no) |
| Anular | Casi todos | Administrador y Admin G1 |

"Entregado" de un pedido con alcohol pide confirmar la mayoría de edad.
Cada acción queda en la línea de tiempo (`pedido_historial`) con quién y cuándo.

## Quién ve qué

- Administrador / G1: todos los pedidos. G2: su región. G3 y Empleado: su tienda. Piloto: solo los suyos.

## Dónde tocar

| Quiero... | Dónde |
|---|---|
| Cambiar textos o colores de estados | `PED_ESTADOS` (y los mismos estados en `inicio.js` y `reportes.js`) |
| Cambiar los grupos del resumen | `PED_GRUPOS` (con `uso` = solo aparece si la actividad lo usa) |
| Cambiar lo que muestra cada pestaña de actividad | `prepararSegunActividad()` y `dibujarLista()` |
| Agregar una acción del detalle | `PED_ACCIONES` (id, estados, quién, estado nuevo, motivo) |
| Cambiar el código de país de WhatsApp | `PED_CODIGO_PAIS` |
| Cambiar la moneda | `PED_MONEDA` (y `CFG_MONEDA`, `REP_MONEDA`) |
| Agregar un campo al pedido | Ver [10-recetas.md](../10-recetas.md) |
| Agregar un tipo de categoría | `crearPanelCategoria`, `leerMercaderia`, `pesoDe`, `validarFormulario`, `armarArticulos` + regla en SQL |
