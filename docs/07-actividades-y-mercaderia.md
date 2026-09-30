# 7. Actividades, mercadería, pesos y cobro

## Tres niveles

```
Empresa (empresas/empresas.js)  ──► qué ACTIVIDADES realiza
Actividad (tabla actividades)   ──► qué USA en el pedido + sus CATEGORÍAS + su TARIFA
Categoría (categorias_mercaderia) ──► qué se registra (conteo, artículos, bultos, documentos)
```

## Actividades actuales

| Código | Nombre | Qué usa |
|---|---|---|
| `tienda` | Entregas de tienda (supermercado) | Compra (monto, envío gratis, cobrar la compra), alcohol |
| `encomiendas` | Encomiendas | Bodega ("Recibido en bodega"), recolección, tamaños S/M/L/XL |

- **Qué realiza la empresa:** `empresas.js` → `actividades`. Las demás no aparecen en ningún lado.
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
| `usa_recoleccion` | Campo "Dirección de recolección" |
| `usa_tamanos` | Columna de tamaño en los bultos |
| `usa_compra` | "Monto de la compra", aviso de envío gratis, "el piloto cobra la compra" |
| `permite_alcohol` | Casilla "Lleva alcohol" en abarrotes; el piloto confirma mayoría de edad al entregar |

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
  OSRM, `js/mapa.js`). A = la tienda (o la recolección en Encomiendas, si se escribió); B = la entrega.
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

## Agregar una actividad nueva (ej. farmacia)

1. SQL nuevo: `insert into actividades (codigo, nombre, ..., usa_*)`, su tarifa general y sus categorías.
2. Agregar el código a `actividades` de las empresas que la realicen (`empresas.js`).
3. Marcar qué usa y activarla (Configuración → Actividades): queda en todas las tiendas.
No hace falta programar el formulario: se arma con sus categorías y lo que usa.
