# 12. Cambios aprobados, pendientes y decisiones abiertas

Última actualización: 2026-10-12.

> **2026-10-12 · distribuidora y partes por actividad (sql/01 bloques 26 y 27):** hecho. Cada actividad dice si usa
> vehículos, km, peso y productos; sección Distribución con productos, precios con IVA, bodega del día por ruta,
> carga entre varios pilotos, entrega parcial con motivo, venta en ruta, devolución, cierres y reporte de faltantes
> ([15-distribuidora.md](15-distribuidora.md)). Pendiente: inventario permanente de tienda, descontar faltantes
> al piloto, lista de precios por cliente y que la app del piloto use `dist_entregar` / `dist_venta_ruta`.
>
> **2026-10-12 · modo mixto (nube + instalado):** diseño aprobado, sin código. Estatus, fases y decisiones
> pendientes (la principal: cómo llegan los pilotos a una base instalada) en [16-modo-mixto.md](16-modo-mixto.md).

> **2026-10-02 · empresas internas (sql/01 bloque 16):** el usuario pasó a ser `cenjperez01` (región +
> nombre + ID de la empresa, **sin la tienda**: cambiar de sucursal en la región no lo cambia) y `jperez01`
> para Administrador, G1 y G2. Esto **resuelve la "opción C"** (cambio 4), que ya no hace falta. Hechos también: guardar como
> cliente al que se escribe a mano en un pedido (con su ubicación) y administrar las regiones desde la
> página (Tiendas → Regiones). Registro completo: [13-cambios.md](13-cambios.md).

## A. Cambios aprobados (por hacer, en este orden)

| # | Cambio | Qué implica | ¿Cambia SQL? |
|---|---|---|---|
| 1 | **Optimización de mantenimiento** | Ayudas comunes en un solo archivo (dinero, kilos, fechas, confirmar, avisos de "falta SQL"); dividir `pedidos.js`, `configuracion.js` y `usuarios.js` por partes; quitar el código de transición ("si la base no tiene tal tabla o columna...", posible cuando todas las bases tengan `sql/01`) | No |
| 2 | **Consultas por jerarquía de permisos** | Una sola función de "alcance del usuario" que usan todas las consultas y reportes: Admin/G1 todo, G2 su región, G3/Empleado su tienda, Piloto sus pedidos | No (la versión definitiva es la Fase 7) |
| 3 | **Colores a variables sin cambio visual** | Los ~90 colores escritos a mano pasan a variables **con el mismo valor**. Si algún caso cambiara la estética, se deja como está. Animaciones y transiciones no se tocan | No |
| 4 | ~~**Usuario: opción C**~~ **Resuelto** (sql/01 bloques 16 y 17) | El usuario ya no lleva la tienda: `cenjperez01` (región + nombre + empresa). Solo cambia si la tienda cambia de región | Hecho |
| 5 | **Un solo catálogo de artículos** | Línea blanca, Electrónica, etc. existen una vez con su peso promedio, compartido por todas las actividades; el peso sigue siendo modificable en cada pedido | **Sí** |
| 6 | **Normalización sencilla** | Abarrotes como filas (cajas, bolsas, hieleras) y no repetido en `detalle`; estados del pedido en una sola definición; unir horario base y horario por día | **Sí** |
| 7 | **Pilotos en tabla propia** | Vehículo y multitienda pasan a una tabla `pilotos` (uno a uno con `usuarios`) | **Sí** |

### Detalle del cambio 4 (usuario, opción C)

- Hoy: `id_usuario = 'cen-001-inavarro'`. Si la tienda cambia de código, hay que renombrar a todos sus
  usuarios (función `cambiar_codigo_tienda`).
- Nuevo: `id_usuario = 't' || tienda_id || '-' || usuario` → `t4-inavarro`. El número de la tienda no
  cambia nunca, así que cambiar el código de la tienda ya no toca a los usuarios.
- Migración: convertir los usuarios existentes (`cen-001-inavarro` → `t4-inavarro`); cambiar la función
  `cambiar_codigo_tienda` (solo código y región); en la página: Usuarios (prefijo al guardar), Tiendas
  (mensaje de renombrado), Login (texto de ayuda) y mostrar la tienda junto al usuario donde haga falta.
- ⚠ Avisar a cada usuario su usuario nuevo. **Coordinar con la app del piloto** (usa las mismas reglas).

### Detalle del cambio 5 (catálogo único)

- Hoy: `articulos_catalogo` depende de `categorias_mercaderia`, que es por actividad → la refrigeradora
  existe dos veces (tienda y encomiendas).
- Nuevo (propuesta): tabla de **grupos de artículos** (Línea blanca, Electrónica, Otros); cada categoría
  de tipo `articulos` apunta a un grupo; el catálogo es por grupo. Dos actividades con "Línea blanca"
  comparten el mismo catálogo y los mismos pesos promedio.
- Migración: unir los artículos duplicados (quedarse con un peso) y reenlazar.

## B. Efecto en los scripts SQL

Desde el 2026-10-20 la base se instala por módulos con `sql/instalacion/` (01 a 12) y cada cambio nuevo es un
archivo con fecha en `sql/actualizaciones/` (ver `sql/LEEME.md`). Los scripts `00` y `01` anteriores quedaron en
`sql/historial/`. **Copia de seguridad antes** de ejecutar una actualización que cambie datos.

**Etapa 2A hecha (2026-10-21, sin probar):**
- Supabase Auth.
- RLS por empresa y para el cliente, sin las reglas TEMPORAL.
- Las funciones confirman al usuario de la sesión.
- La base revisa quién cambia a quién en usuarios.
- Ajustes por empresa.

Ver [13-cambios.md](13-cambios.md).

**Etapa 2B hecha (2026-10-21, sin probar):**
- alcance por región o tienda en pedidos, cajas y viajes del conductor;
- funciones de cada usuario en tablas;
- permisos por función al escribir.

**Etapa 2C hecha (2026-10-21, sin probar):**
- llave de soporte del Admin TI (Configuración → Soporte), con su bitácora;
- el Desarrollador, sin llave, solo ve la configuración y los usuarios; configura la empresa mientras no tenga Admin TI;
- acciones de emergencia sin llave (bloquear, desbloquear, cerrar sesiones).
- Quedó fuera del diseño original: **forzar el cambio de contraseña** y **ver errores**.

**Etapa 2D hecha (2026-10-21, sin probar):** los cambios de estado del pedido solo por funciones de la base
(`pedido_estado`, `pedido_asignar`...), que escriben el historial; las horas de cada paso salen del historial
(vista `pedidos_pasos`). Con esto termina la Etapa 2.

Copia de seguridad en Supabase: Database → Backups (plan de pago) o, en el gratuito, exportar las
tablas (Table Editor → Export) antes de cada script que cambie datos.

## C. Seguridad — Fase 7 (antes de usar datos reales)

- Hecho (2026-10-04, bloque 20): claves **cifradas** y no legibles desde la página; login dentro de la base;
  `update`/`delete` de la página siempre dentro de la empresa activa; vaciar la base pide la empresa.
- Hecho (2026-10-21, Etapa 2A): login con **Supabase Auth** y reglas **RLS** por empresa y para el cliente; sin sesión
  no se lee ni se escribe nada; nadie cambia su propio rol ni actúa en nombre de otro.
- Hecho (2026-10-21, Etapa 2B): la jerarquía dentro de la empresa (G2 su región, G3 y Empleado su tienda, Piloto sus
  pedidos) en pedidos, cajas y viajes, y permisos por función al escribir. Clientes y usuarios siguen viéndose en
  toda la empresa (a propósito, ver [05-base-de-datos.md](05-base-de-datos.md)).
- Hecho (2026-10-21, Etapa 2C): el Desarrollador ve los datos de una empresa solo con la llave de su Admin TI, y queda
  en la bitácora. Límite que sigue: el dueño del proyecto de Supabase ve todo desde su panel (opciones: acuerdo de
  confidencialidad, cifrar campos o un proyecto por empresa, [16-modo-mixto.md](16-modo-mixto.md)).
- Cambiar la clave de `admin`. (La protección del usuario `admin` queda asegurada con `sql/01`.)

## D. Pendientes de funcionalidad

- Horarios: que el piloto registre sus marcas y que Pedidos respete el máximo por marca en todos los casos.
- Clientes: calificación 1–5 por pedido y categoría A/B/C/D; aviso de cliente repetido (mismo teléfono; el
  correo repetido ya se bloquea);
  ubicación por WhatsApp. (Hecho 2026-10-02: el cliente escrito a mano en un pedido se guarda solo en Clientes.)
- Pedidos: corregir datos de un pedido registrado (evento `correccion`); borrado automático de fotos a los 12 meses.
- **App del piloto** (compañero): escanear QR (`ACACHETE-PEDIDO:<token_qr>`) o validar código, cierre de
  entrega, fotos, ubicación en segundo plano. (Hecho 2026-10-08, bloque 25: `ubicaciones_pilotos`,
  `piloto_en_ruta` / `piloto_ubicacion`; la web la manda cada 2 min en ruta (`js/ubicacion.js`) y
  Inicio dibuja un camión por piloto. La app debe llamar `piloto_ubicacion` con `p_origen = 'app'`.)
- Funciones de los roles Empleado y Piloto (columna "Funciones" en Pilotos).
- Botón "Cargar Pedidos": importar pedidos (Excel u otra app).
- Precio por km: **hecho en prueba** con servicios gratis (Nominatim + OSRM, `js/mapa.js`) en Pedidos y
  Cotizador. Pendiente: evaluar si los servidores públicos alcanzan con el uso real (si no, OSRM propio o
  un proveedor de pago, cambiando `MAPA_SERVICIOS`); cargar la ubicación de cada tienda. (Hecho: Clientes
  guarda las coordenadas de la entrega y Nuevo pedido las usa.)
- Reemplazar las regiones de ejemplo por las reales (ahora desde Tiendas → Regiones).
- ~~Empresas internas: reglas reales en la base para que una empresa no pueda leer otra~~ Hecho (Etapa 2A).

## E. Actividad Transporte (hecha el 2026-10-04; seguridad parcial)

[14-transporte.md](14-transporte.md) · [secciones/viajes.md](secciones/viajes.md). Fases 1 a 7 hechas (`sql/01`
bloques 18 y 19): sección Viajes, rol cliente, franjas, recargos, costos del mes, días cerrados, cortesía, reporte de
viajes y exportaciones con el nombre y la paleta de la empresa.

- **Seguridad:** hecho en la Etapa 2A (2026-10-21). El cliente solo ve sus viajes y las lecturas ya no están abiertas
  con la clave pública. Probarlo antes de dar usuarios a clientes externos con datos reales.
- **Hecho (bloque 20):** el cliente solicita su usuario desde el login (`#registro?empresa=02`) y se aprueba en
  Clientes → Revisar. Posible mejora: confirmar el teléfono con un código por WhatsApp/SMS y "Olvidé mi contraseña".
- **Pendiente de decidir:** "Repetir viaje" / "Agregar regreso" y viajes recurrentes.
- **Para probar en la base real:** ejecutar el bloque 19, crear franjas, poner asientos a un vehículo con piloto y
  dar acceso a un cliente (lista en [11-pruebas.md](11-pruebas.md), "Transporte: viajes").

## F. Decisiones abiertas

- Documentos en encomiendas: hoy suman 0.2 kg cada uno al peso (cobro por peso). ¿Tarifa fija por sobre?
- ¿Página pública de seguimiento para quien recibe el pedido?
