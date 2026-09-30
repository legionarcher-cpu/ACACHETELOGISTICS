# 12. Cambios aprobados, pendientes y decisiones abiertas

Última actualización: 2026-09-30.

## A. Cambios aprobados (por hacer, en este orden)

| # | Cambio | Qué implica | ¿Cambia SQL? |
|---|---|---|---|
| 1 | **Optimización de mantenimiento** | Ayudas comunes en un solo archivo (dinero, kilos, fechas, confirmar, avisos de "falta SQL"); dividir `pedidos.js`, `configuracion.js` y `usuarios.js` por partes; quitar el código de transición ("si la base no tiene tal tabla o columna...", posible cuando todas las bases tengan `sql/01`) | No |
| 2 | **Consultas por jerarquía de permisos** | Una sola función de "alcance del usuario" que usan todas las consultas y reportes: Admin/G1 todo, G2 su región, G3/Empleado su tienda, Piloto sus pedidos | No (la versión definitiva es la Fase 7) |
| 3 | **Colores a variables sin cambio visual** | Los ~90 colores escritos a mano pasan a variables **con el mismo valor**. Si algún caso cambiara la estética, se deja como está. Animaciones y transiciones no se tocan | No |
| 4 | **Usuario: opción C** | El usuario deja de llevar el código de la tienda (`cen-001-inavarro`) y usa el número interno de la tienda, que nunca cambia: `t4-inavarro`. Administradores, G1 y G2 siguen con su usuario simple | **Sí** |
| 5 | **Un solo catálogo de artículos** | Línea blanca, Electrónica, etc. existen una vez con su peso promedio, compartido por todas las actividades; el peso sigue siendo modificable en cada pedido | **Sí** |
| 6 | **Normalización sencilla** | Abarrotes como filas (cajas, bolsas, hieleras) y no repetido en `detalle`; estados del pedido en una sola definición; quitar la columna `permisos`; unir horario base y horario por día | **Sí** |
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

Desde el 2026-09-30 hay **solo dos** scripts (los 21 anteriores se eliminaron):

| Script | Estado | Qué hacer |
|---|---|---|
| `00_instalacion_completa.sql` | Listo | Base nueva en blanco. Se irá actualizando con cada cambio de la tabla A |
| `01_actualizacion_base_existente.sql` | Listo | **Ejecutarlo ya en la base actual.** Asegura todas las funciones (admin protegido, cambiar código de tienda, horarios del día, número y código de respaldo, validar código, vehículo en uso), rutas y multitienda, tipo de vehículo, qué usa cada actividad y categorías de encomiendas. Se puede repetir sin error |

Los cambios 4 a 7 de la tabla A **no crean archivos nuevos**: cada uno se agrega en su sección de `00`
y como un bloque al final de `01` (con su migración de datos). **Copia de seguridad antes** de
ejecutar `01` cuando incluya cambios de datos (usuarios opción C, catálogo único).

Copia de seguridad en Supabase: Database → Backups (plan de pago) o, en el gratuito, exportar las
tablas (Table Editor → Export) antes de cada script que cambie datos.

## C. Seguridad — Fase 7 (antes de usar datos reales)

- Hoy: claves sin cifrar y la base acepta todo con la clave pública; las reglas las aplica la página.
- Fase 7: login con **Supabase Auth** (claves cifradas) y reglas **RLS** en cada tabla con la jerarquía
  de permisos, para que ninguna consulta o reporte devuelva lo que el rol no puede ver.
- Cambiar la clave de `admin`. (La protección del usuario `admin` queda asegurada con `sql/01`.)

## D. Pendientes de funcionalidad

- Horarios: que el piloto registre sus marcas y que Pedidos respete el máximo por marca en todos los casos.
- Clientes: calificación 1–5 por pedido y categoría A/B/C/D; aviso de cliente repetido (mismo teléfono);
  ubicación por WhatsApp; guardar como cliente al que se escribe a mano en un pedido.
- Pedidos: corregir datos de un pedido registrado (evento `correccion`); borrado automático de fotos a los 12 meses.
- **App del piloto** (compañero): escanear QR (`ACACHETE-PEDIDO:<token_qr>`) o validar código, cierre de
  entrega, fotos, ubicación en tiempo real para el mapa de Inicio (el mapa gratis ya está puesto:
  falta la tabla de ubicaciones y dibujar un marcador por piloto con `L.marker`).
- Funciones de los roles Empleado y Piloto (columna "Funciones" en Pilotos).
- Botón "Cargar Pedidos": importar pedidos (Excel u otra app).
- Precio por km: **hecho en prueba** con servicios gratis (Nominatim + OSRM, `js/mapa.js`) en Pedidos y
  Cotizador. Pendiente: evaluar si los servidores públicos alcanzan con el uso real (si no, OSRM propio o
  un proveedor de pago, cambiando `MAPA_SERVICIOS`); cargar la ubicación de cada tienda; que Clientes
  guarde las coordenadas de la entrega para no buscarlas de nuevo.
- Reemplazar las regiones de ejemplo por las reales.

## E. Decisiones abiertas

- Documentos en encomiendas: hoy suman 0.2 kg cada uno al peso (cobro por peso). ¿Tarifa fija por sobre?
- ¿Página pública de seguimiento para quien recibe el pedido?
