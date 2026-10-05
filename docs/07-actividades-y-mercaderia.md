# 7. Actividades, mercadería, pesos y cobro

## Tres niveles

```
Empresa (tabla empresas, ID "01")  ──► qué ACTIVIDADES realiza (una o varias: multifunción)
Actividad (tabla actividades)      ──► qué USA en el pedido (igual para todas las empresas)
Empresa + actividad                ──► sus CATEGORÍAS (con artículos y pesos), su TARIFA y sus DESCUENTOS
Categoría (categorias_mercaderia)  ──► qué se registra (conteo, artículos, bultos, documentos)
```

Desde el bloque 16 de sql/01 (empresas internas, ver [secciones/empresas-internas.md](secciones/empresas-internas.md)) cada
empresa tiene **su propia** mercadería, tarifas y descuentos, y solo ve los de las actividades que realiza.
Una empresa nueva puede copiar los de la empresa activa al crearse.

## Actividades actuales

| Código | Nombre | Qué usa |
|---|---|---|
| `tienda` | Entregas de tienda (supermercado) | Compra (monto, envío gratis, cobrar la compra), alcohol |
| `encomiendas` | Encomiendas | Bodega ("Recibido en bodega"), punto de partida, tamaños S/M/L/XL |
| `transporte` | Transporte | **Viajes con agenda** (`usa_viajes`): sección Viajes en vez de Pedidos, precio por franja, cortesía. Se llama "viaje" y "conductor" ([secciones/viajes.md](secciones/viajes.md)) |

**Palabras de la actividad** (sql/01 bloque 18): cada actividad puede llamar distinto al registro y al conductor
(Configuración → Actividades; vacío = pedido / piloto). Si **todas** las actividades de la empresa usan la misma,
`js/palabras.js` la muestra en todo lo que se ve (menú, pie, secciones, ventanas, avisos, confirmaciones). Una
empresa solo de Transporte lee "Viajes" y "Conductores"; con Transporte y otra actividad sigue "Pedidos". No cambia
ids, enlaces ni la base. Para datos escritos por personas: `data-sin-palabras`. Para textos que no pasan por la
pantalla (Excel, PDF): `cambiarPalabras(texto)` o `palabra('registros')`.

- **Qué realiza la empresa:** Tiendas → Empresas (casillas de actividades de cada empresa interna; si la
  base no tiene empresas, `empresas.js` → `actividades`). Las demás no aparecen en ningún lado.
- **Qué usa cada una:** Configuración → Actividades (ventana, **solo Desarrollador**).
- **Tiendas:** una actividad **activa** queda disponible en **todas** las tiendas (no se elige por tienda).
- Las rutas pueden ser de una sola actividad; tarifas y descuentos son por actividad.
- **Pedidos y Reportes separan las actividades** con una pestaña por cada una (nunca revueltas). Lo
  que muestra cada pestaña (columnas, tarjetas, gráficas) sale de lo que **usa** la actividad
  (tabla de abajo), no de su nombre. Ver [secciones/pedidos.md](secciones/pedidos.md) y
  [secciones/reportes.md](secciones/reportes.md).

| Uso | Efecto en el formulario de Pedidos |
|---|---|
| `usa_bodega` | Estado inicial "En bodega" si no hay piloto; botón "Recibido en bodega" |
| `usa_recoleccion` | Campo "A · Punto de partida" del mapa A → B se puede escribir (si no, queda desactivado y A es la tienda) |
| `usa_tamanos` | Columna de tamaño en los bultos |
| `usa_compra` | "Monto de la compra", aviso de envío gratis, "el piloto cobra la compra" |
| `permite_alcohol` | Casilla "Lleva alcohol" en abarrotes; el piloto confirma mayoría de edad al entregar |
| `usa_viajes` | No es de pedidos: va a la sección **Viajes** (el cliente solicita día y hora; vehículo y conductor automáticos). No aparece en Pedidos, Rutas ni Configuración → Pedidos; su precio está en Configuración → Transporte |

## Categorías de mercadería

Configuración → Pedidos → Categorías (solo Administrador). Cada una pertenece a **una actividad**.

| Tipo | Qué se registra | Ejemplos actuales |
|---|---|---|
| `conteo` | Cajas, bolsas, hieleras, peso aproximado (+ alcohol) | Tienda: Abarrotes |
| `articulos` | Artículo + cantidad + peso (del catálogo, editable) | Tienda y Encomiendas: Línea blanca, Electrónica; Encomiendas: Otros artículos |
| `bulto` | Descripción, cantidad, tamaño, peso de cada uno | Encomiendas: Cajas, Bolsas |
| `documento` | Solo cantidad; peso = `peso_referencia` (0.2 kg) | Encomiendas: Documentos |

Una categoría desactivada deja de aparecer como casilla; los pedidos viejos no cambian.

## Pesos promedio (catálogo de artículos)

- Configuración → Pedidos → **Artículos frecuentes (pesos promedio)** (Administrador y G1).
- En el pedido, al elegir el artículo **el peso se llena solo** y el empleado **lo puede cambiar**.
- `python python/pesos_promedio.py` compara el catálogo con los pesos reales de los pedidos
  (`--aplicar` para guardar, `--agregar` para sumar artículos que se escriben a mano seguido).
- **Hoy** cada actividad tiene su propia copia de Línea blanca y Electrónica.
  **Aprobado:** un solo catálogo compartido (ver [12-pendientes.md](12-pendientes.md)).

## Cobro del envío

```
envío = cargo fijo + mínimo + max(0, peso total − kg que cubre el mínimo) × precio por kg
      + km por calle de A a B × precio por km
      → gratis si la compra ≥ "envío gratis desde"
      → menos el descuento (máximo 1, % o monto fijo)
total a cobrar = envío (si lo cobra el piloto) + compra (si lo cobra el piloto)
```

- **Tarifa que aplica:** la de la tienda; si no hay, la de la región; si no, la general (una por actividad).
- **Precio por km:** los km salen del mapa A → B del pedido y del cotizador (gratis: OpenStreetMap +
  OSRM, `js/mapa.js`). A = la tienda (o el punto de partida en Encomiendas, si se escribió); B = la entrega.
  Si la tarifa tiene precio por km, el pedido no se guarda sin A y B ubicados. 0 = no se cobra distancia.
- Cada pedido guarda una copia de la tarifa y del cálculo (`costo_desglose`).
- **La tarifa en palabras:** al crear o modificar una tarifa, abajo del formulario se lee la regla
  mientras se escribe ("Hasta 3 kg: ₡X · Más de 3 kg: + ₡Y por cada kg · Distancia: + ₡Z por km" y un
  ejemplo con 10 km). Lo arma `tarifaEnPalabras()` en `js/secciones/configuracion/pedidos.js`.
- **Simulador de precios (peso × distancia):** Configuración → Pedidos. Tabla cruzada con el precio
  para cada **peso** (filas) y cada **distancia en km** (columnas), con el precio por km de la tarifa
  (si la tarifa no cobra por km, una sola columna). Una línea marca desde qué peso se cobran kg
  adicionales. Cada simulación queda como tarjeta: ✕ borra una, "Borrar todas" las quita. No se guardan.
  Máximo 600 precios por simulación (`CALC_MAX_CELDAS`).

Ejemplo (mínimo ₡2500 cubre 2 kg, ₡500 por kg adicional): 1.5 kg → ₡2500 · 4 kg → ₡3500 · 8 kg → ₡5500.

## Agregar una actividad nueva (ej. transporte, farmacia)

Desde la página, sin SQL (solo Desarrollador):

1. Configuración → Actividades → **Nueva actividad**: nombre, código (sale solo del nombre, ej.
   `transporte`; no se cambia después), descripción, icono, activa y qué usa.
2. Dejar marcada **"Agregarla a la empresa con la que trabajas"**. Las demás empresas la marcan en
   Tiendas → Empresas (la casilla aparece sola). Sin empresas internas: agregar el código a
   `actividades` en `empresas.js`.
3. Configuración → Pedidos: su **tarifa general** y sus **categorías** de mercadería.

No hace falta programar el formulario: se arma con sus categorías y lo que usa. Una actividad con
**"Viajes con agenda"** (`usa_viajes`, como Transporte) no usa categorías ni tarifas: se configura en
Configuración → Transporte ([secciones/viajes.md](secciones/viajes.md)).
