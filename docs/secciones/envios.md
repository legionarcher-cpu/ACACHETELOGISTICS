# Mis envíos (`#envios`)

Sección del **cliente con usuario** de una empresa que hace encomiendas (actividad con `usa_recoleccion`).
Archivos: `secciones/envios.html`, `js/secciones/envios.js`, `css/secciones/envios.css`.
Tabla: `pedido_solicitudes` (sql/01 bloque 23). Plan: función `envios_clientes`.

## Flujo

1. **El cliente solicita** (`#envios?nuevo=1`): qué envía (descripción, bultos, peso aproximado), **A · Recoger en** y
   **B · Entregar en**, cada uno con su **punto de referencia** y ubicado en el mapa (obligatorio), quién recibe
   (él mismo u otra persona con teléfono) y la fecha. La solicitud queda **Por aprobar**.
2. **Aviso**: al Admin G3 de su tienda (sin G3: G2 de la región; si tampoco: Administrador y G1),
   tipo "pendiente", enlace `#pedidos?solicitudes=1`.
3. **La tienda la revisa** en Pedidos (bandeja "Solicitudes de envío de clientes", G3 o superior):
   - **Revisar y registrar** → `#pedidos?nuevo=1&actividad=...&solicitud=ID`: el formulario sale lleno (cliente, A y B
     con los puntos del cliente, quién recibe, fecha, un bulto y las referencias en Notas). Se completa el peso real,
     la tarifa y el piloto, y se registra. La solicitud pasa a **Aprobada** con su `pedido_id`; el pedido guarda
     `detalle.solicitud` (número y referencias) y siguen los avisos de siempre (piloto, G2, pedidos cercanos).
     Al cliente: "Tu envío fue aprobado" con el número de pedido y el total.
   - **Rechazar**: motivo obligatorio; el cliente lo ve en la campana y en su tarjeta.
4. **El cliente sigue el avance** en Mis envíos: Programado, Preparando, En camino, Entregado... (estados del pedido
   simplificados, `ENV_AVANCE`). Puede **cancelar** mientras siga pendiente.

## Quién la ve

- Menú "Mis envíos": solo el rol cliente, si la empresa hace encomiendas y el plan incluye `envios_clientes`
  (`seccionAplica` en `js/sesion.js`).
- Un cliente de una empresa **sin viajes** entra directo a Mis envíos (Inicio lo redirige). Si la empresa también
  hace viajes, su Inicio de viajes tiene el botón "Solicitar envío".
- El usuario del cliente se pide desde el login ("¿Eres cliente? Solicita tu usuario") o lo crea la tienda en
  Clientes → "Dar acceso al cliente".
