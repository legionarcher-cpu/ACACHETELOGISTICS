# Pedidos (`#pedidos`)

| Archivo | Qué tiene |
|---|---|
| `secciones/pedidos.html` | Las 3 vistas y las ventanas (QR, asignar, confirmar acción, listo para despachar / slot, escanear despacho) |
| `js/secciones/pedidos.js` | Toda la lógica (~2250 líneas, organizado por bloques) |
| `css/secciones/pedidos.css` | Estilos propios (clases `ped-`) |
| Tablas | `pedidos`, `pedido_articulos`, `pedido_historial`, `pedido_entregas`, `pedido_evidencias`, `actividades`, `categorias_mercaderia`, `articulos_catalogo`, `tamanos_bulto`, `tarifas`, `descuentos`, `rutas`, `rutas_pilotos`, `capacidad_marcas`, `configuracion`, `clientes`, `slots_horario` / `slots_del_dia()` |

## Vistas (según el `#`)

| Dirección | Vista |
|---|---|
| `#pedidos` | **Lista**: una pestaña por actividad; filtros (fecha, tienda, ruta, estado), resumen por estado (clic = filtrar), buscador |
| `#pedidos?nuevo=1` | **Registrar** un pedido (`&actividad=encomiendas` la deja elegida) |
| `#pedidos?id=15` | **Detalle**: cliente y entrega, cobro, mercadería, cierre de entrega, línea de tiempo, acciones |
| `#pedidos?id=15&qr=1` | Detalle + abre el QR (al recién crearlo) |
| `#pedidos?id=15&abrir=reasignar` / `cancelar` | Detalle + abre esa ventana |
| `#pedidos?accion=reasignar` / `cancelar` | Lista de pendientes para elegir cuál (botones del pie) |
| `#pedidos?grupo=ruta` | Lista ya filtrada por ese grupo de estados (`pendientes`, `despacho`, `ruta`, `entregados`, `problemas`, `cancelados`). Lo usan los cuadros de Inicio |
| `&fecha=todas` · `?tienda=3` | Todas las fechas (ej. pedidos sin piloto) · solo esa tienda ("Hoy por tienda" de Inicio) |

## Lista: cada actividad por separado

Las actividades **no se mezclan**: arriba de la lista hay una **pestaña por actividad** de la empresa
(con el número de pedidos de cada una). Con una sola actividad no se muestran pestañas.

| Qué cambia con la pestaña | Cómo |
|---|---|
| Pedidos, resumen y contador | Solo los de esa actividad ("3 pedidos de Encomiendas para el ...") |
| Rutas (filtro y "Rutas del día") | Las de esa actividad y las que sirven para todas |
| Cuadro y estado "En bodega" | Solo si la actividad **usa bodega** |
| Columna propia | **Compra** si la actividad **usa compra**; si no, **Peso** |
| Celda del pedido / entrega | "Lleva alcohol" si **permite alcohol**; "Punto de partida: ..." si **usa punto de partida** (`usa_recoleccion`) |
| Botón "Nuevo pedido" | Abre el formulario con esa actividad elegida |

La pestaña elegida se recuerda mientras dure la sesión (`sessionStorage`, clave `ped_actividad`).
Se cargan los pedidos de todas las actividades (para el número de cada pestaña) y se separan en
`separarPorActividad()`; lo que depende de la actividad se arma en `prepararSegunActividad()`.

## Registrar un pedido: el formulario se arma según la actividad

1. **Actividad y tienda.** Tarjetas con las actividades **activas** (Configuración → Actividades; iguales
   en todas las tiendas) que realiza la empresa (`empresas.js`).
   Número de pedido a mano si Configuración lo pide.
2. **Cliente:** se busca por **teléfono o correo** (la clave del cliente), entre los clientes **aprobados de la
   tienda**, en la base (no se cargan todos). Con letras o "@" busca por correo; solo números, por teléfono
   ("8888-1234" = "88881234"; acepta el 506 de más o de menos).
   - **Coincidencia completa** (teléfono de 8+ dígitos o correo entero) con un solo cliente → se llenan solos
     nombre, apellidos, teléfono, dirección y el punto B, y queda la ficha con "Cambiar".
   - Varios clientes con ese teléfono (ej. familia) o dato incompleto → tarjetas para tocar el correcto
     (↑ ↓ Enter también).
   - Sin cliente → se escriben nombre y teléfono a mano (si se escribió un teléfono completo, ya queda
     puesto). **Al registrar el pedido el cliente se agrega solo a Clientes** (`clienteDesdePedido`):
     aprobado, en esa tienda y ruta, con la dirección y el **punto B** como ubicación (`9.93…, -84.08…`), así
     la próxima vez se encuentra con su punto en el mapa. Si su teléfono ya existe en la empresa, se usa ese
     cliente (y se le agrega la tienda). El nombre se parte en nombre y apellidos (`partesNombre`).
   - Cliente elegido sin dirección o sin ubicación → se le guardan las del pedido (`completarUbicacionCliente`;
     no se cambia lo que ya tiene).
3. **Entrega:** punto de partida (si la actividad lo usa; si no, A = la tienda), dirección, quién recibe, fecha,
   **slot de despacho** (Configuración → Slots; con cuántos pedidos tiene), **horario del piloto** (solo G2+;
   ocupación "2/5", lleno = no se puede elegir), ruta, piloto (solo G2+), notas.
   **Mapa A → B** (`js/mapa.js`, gratis):
   - **A** = la tienda (sus coordenadas guardadas o, si no tiene, su dirección). En Encomiendas, si se
     escribe el punto de partida, A = ese punto.
   - **B** = la dirección de entrega, o la ubicación guardada del cliente si tiene coordenadas o un enlace de mapas.
   - **Mientras se escribe** el punto de partida o la entrega aparecen **sugerencias** (primero las de la zona
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
Registrado → [En bodega] → (Asignado = ya tiene piloto)
  → Alistando → Listo para despachar (slot) → Recibido para ruta (QR) → Cargado (QR escaneado)
  → En ruta ("Saliendo a ruta", en Inicio) → Entregando (uno a la vez) → Entregado
                                                              ↘ No entregado → Reprogramar / Devuelto
Cancelado (antes de salir, con motivo; sale en Reportes). Ya no se anula.
```

| Acción | En qué estados | Quién |
|---|---|---|
| QR (ver, descargar, compartir, WhatsApp) | Siempre | Todos menos Piloto; el piloto lo ve en "Recibido para ruta" |
| Recibido en bodega | Registrado (si la actividad usa bodega) | Todos menos Piloto |
| **Alistando** | Registrado, En bodega, Asignado, Reprogramado | Empleado, G3 y superiores |
| **Listo para despachar** (elige / confirma el slot) | Alistando | Empleado, G3 y superiores |
| **Aprobar salida (escanear QR)** — dentro del pedido | Listo para despachar (desactivado hasta que el piloto lo reciba) / Recibido para ruta | Empleado, G3 y superiores |
| Asignar piloto y horario | Antes de salir | G2 o superior |
| Solicitar reasignación (de fecha) | Antes de salir / No entregado | Admin G3 y Empleado (le llega al G2) |
| **Recibido para ruta** (abre el QR) | Listo para despachar | **Solo el piloto del pedido** |
| **Entregar ahora** | En ruta (si no tiene otro "Entregando") | **Solo el piloto del pedido** |
| Entregado / No entregado | Entregando | **Solo el piloto del pedido** |
| Reprogramar | No entregado | G2 o superior |
| Devuelto / Cancelar | Según estado | Admin G3 o superior (el Empleado no) |

**Aprobar salida:** es la aprobación de salida de **cada pedido**, por eso está dentro de su detalle (no en la
lista). Cámara del celular o de la PC (librería gratis jsQR; solo funciona con https o en localhost). Solo vale
el QR de ese pedido (el de otro da aviso). Al leerlo, el pedido queda "Cargado" (`cargado_en`, `cargado_por`),
se muestra cómo va su slot ("Slot 2: 3 de 5 cargados") y la ventana se cierra sola. Sin cámara se escribe el
número del pedido.

"Saliendo a ruta" y el orden de entrega están en Inicio → **Mi ruta** (ver [inicio.md](inicio.md)).
"Entregado" de un pedido con alcohol pide confirmar la mayoría de edad.
Cada acción queda en la línea de tiempo (`pedido_historial`) y la base guarda la hora de cada paso para el
calculador interno (vistas `pedidos_tiempos` y `slots_carga`, ver [05-base-de-datos.md](../05-base-de-datos.md)).

## QR del pedido

Lleva solo `ACACHETE-PEDIDO:<token_qr>` (sin datos personales). Al escanearlo con **Escanear QR** (encabezado,
`js/qr.js`) se abre una **ventana flotante con toda la información** del pedido (estado, tienda, cliente,
teléfono, quién recibe, punto de partida y entrega, fecha, slot, horario del piloto solo para piloto y G2+,
piloto, peso, mercadería, cobro, notas) y el botón **Abrir pedido**. Cada quien solo ve los pedidos de su
alcance. La aprobación de salida sigue siendo **dentro** del pedido ("Aprobar salida").

## Notificaciones (campana; `avisar()` en `js/notificaciones.js`)

| Cuándo | A quién | Tipo |
|---|---|---|
| Piloto **marca su llegada** (horario, en Inicio) | Admin G3 y Empleados de cada tienda de sus pedidos de ese horario (o de su tienda) | Info: "despachar pedidos" con los números |
| Pedido nuevo **sin piloto** | Admin G2 de la región | Pendiente (asignar) — se cierra al asignar piloto |
| Pedido nuevo con piloto / piloto asignado | El piloto | Info |
| Solicitud de reasignación (G3 / Empleado) | Admin G2 | Pendiente — resultado a quien la pidió |
| Listo para despachar | El piloto | Info ("recíbelo para ruta") |
| Piloto: **Recibido para ruta** | Admin G3 de la tienda | Pendiente (aprobar salida) — se cierra al escanear |
| Salida aprobada (QR escaneado) | El piloto | Aprobado |
| Piloto: **Saliendo a ruta** | Admin G3 de la tienda | Info (qué pedidos salieron) |
| Piloto: **No entregado** (con motivo) | Admin G2 (pendiente: **reprogramar o cancelar**) + Admin G3 (info) | Se cierra al reprogramar, cancelar o devolver |
| G2 reprograma | Admin G3 + el piloto | Aprobado |
| Cancelado / Devuelto | Si lo hace G2+: Admin G3 + piloto · si lo hace la tienda: Admin G2 + piloto | Rechazado |
| Pedido quitado a un piloto | Ese piloto | Info |

Un "No entregado" se puede **cancelar** (además de reprogramar o marcar devuelto). Nunca se avisa a quien hizo
la acción. Sin Admin G2 en la región, los avisos de G2 van al Administrador y Admin G1.

## Quién ve qué

- Administrador / G1: todos los pedidos. G2: su región. G3 y Empleado: su tienda. Piloto: solo los suyos.
- El **horario del piloto** (marca) solo lo ven el piloto y G2 o superior; G3 y Empleado ven el **slot**.

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
