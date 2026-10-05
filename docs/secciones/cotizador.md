# Cotizador de encomiendas (`#cotizador`)

| Archivo | Qué tiene |
|---|---|
| `secciones/cotizador.html`, `js/secciones/cotizador.js`, `css/secciones/cotizador.css` | Clases e ids `cot` |
| Tablas (solo lee) | `actividades`, `tiendas`, `tarifas`, `descuentos`, `categorias_mercaderia`, `articulos_catalogo`, `tamanos_bulto` |

## Qué hace

Calcula el precio de un envío de **Encomiendas** sin registrar nada, con lo que se define en
Configuración:

1. **Tienda:** decide la tarifa (tienda > región > general). Admin y G1 pueden elegir "Tarifa general";
   el G2, "Tarifa de la región". G3 y Empleado usan la de su tienda.
2. **Ruta A → B** (mapa gratis, `js/mapa.js`): A = el punto de partida escrito o, si está vacío, la tienda;
   B = la entrega. **Mientras se escribe aparecen sugerencias** (primero las de la zona que se ve en el
   mapa); al elegir una, el punto se pone solo. También se corrigen con clic o arrastrando. Si la tarifa
   tiene **precio por km**, los km por calle se suman al precio (la tabla rápida es solo por peso).

**En tablet y celular:** barra fija abajo con el precio, el peso y los km ("Ver detalle" lleva al
desglose); cada bulto se ve como tarjeta (sin deslizar de lado); botón "Ampliar mapa" para poner los
puntos con el dedo.
3. **Mercadería:** una fila por bulto (o grupo de bultos iguales), con las **categorías de Encomiendas**:
   - `bulto` (cajas, bolsas): descripción, cantidad, tamaño S/M/L/XL (si la actividad **usa tamaños**) y peso.
   - `articulos` (línea blanca, electrónica...): al elegir un artículo del catálogo el **peso promedio se llena
     solo** y se puede cambiar.
   - `documento`: peso fijo de la categoría (`peso_referencia`, 0.2 kg).
4. **Descuento** pre-establecido (máximo 1).
5. Muestra el **desglose** (cargo fijo, mínimo, peso adicional, distancia, descuento) y el **precio del envío**.
6. **Precios rápidos por peso:** tabla de 1 a 50 kg con la tarifa elegida (`COT_PESOS_RAPIDOS`).
7. **Copiar** o **WhatsApp**: texto listo para enviar al cliente, con el detalle y la aclaración de que
   el precio final se confirma con el peso real al recibir la encomienda.
8. **Registrar pedido** abre el formulario de Pedidos con Encomiendas elegida.

La fórmula es **la misma de Pedidos** (`buscarTarifa`, `calcularEnvioTarifa` y `montoDescuento` en
`js/componentes.js`): la cotización y el pedido registrado dan el mismo precio.

## Quién

- El botón **Cotizador** del pie solo aparece si la empresa realiza Encomiendas (`empresas.js`).
- Todos los roles menos el Piloto (el Piloto no ve el pie ni tiene permiso para la sección).
- Si Encomiendas está desactivada en Configuración → Actividades, avisa que es solo de referencia.

## Dónde tocar

| Quiero... | Dónde |
|---|---|
| Cambiar los precios | Configuración → Pedidos → Tarifas y Descuentos (no el código) |
| Pesos de la tabla rápida | `COT_PESOS_RAPIDOS` |
| Texto que se comparte | `recalcular()` → `textoCotizacion` |
| Moneda | `COT_MONEDA` |
| Cotizar otra actividad | `COT_ACTIVIDAD` (y el botón en `pagina_inicial.js`) |
