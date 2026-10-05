# 12. Cambios aprobados, pendientes y decisiones abiertas

Última actualización: 2026-10-02.

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

- Hecho (2026-10-04, bloque 20): claves **cifradas** y no legibles desde la página; login dentro de la base;
  `update`/`delete` de la página siempre dentro de la empresa activa; vaciar la base pide la empresa.
- Hoy todavía: la base acepta leer y escribir las demás tablas con la clave pública (ej. cambiar `aprobado` o la
  clave de un usuario); las reglas por rol las aplica la página.
- Fase 7: login con **Supabase Auth** y reglas **RLS** en cada tabla con la jerarquía de permisos y la empresa, para
  que ninguna consulta o reporte devuelva lo que el rol no puede ver.
- Cambiar la clave de `admin`. (La protección del usuario `admin` queda asegurada con `sql/01`.)

## D. Pendientes de funcionalidad

- Horarios: que el piloto registre sus marcas y que Pedidos respete el máximo por marca en todos los casos.
- Clientes: calificación 1–5 por pedido y categoría A/B/C/D; aviso de cliente repetido (mismo teléfono; el
  correo repetido ya se bloquea);
  ubicación por WhatsApp. (Hecho 2026-10-02: el cliente escrito a mano en un pedido se guarda solo en Clientes.)
- Pedidos: corregir datos de un pedido registrado (evento `correccion`); borrado automático de fotos a los 12 meses.
- **App del piloto** (compañero): escanear QR (`ACACHETE-PEDIDO:<token_qr>`) o validar código, cierre de
  entrega, fotos, ubicación en tiempo real para el mapa de Inicio (el mapa gratis ya está puesto:
  falta la tabla de ubicaciones y dibujar un marcador por piloto con `L.marker`).
- Funciones de los roles Empleado y Piloto (columna "Funciones" en Pilotos).
- Botón "Cargar Pedidos": importar pedidos (Excel u otra app).
- Precio por km: **hecho en prueba** con servicios gratis (Nominatim + OSRM, `js/mapa.js`) en Pedidos y
  Cotizador. Pendiente: evaluar si los servidores públicos alcanzan con el uso real (si no, OSRM propio o
  un proveedor de pago, cambiando `MAPA_SERVICIOS`); cargar la ubicación de cada tienda. (Hecho: Clientes
  guarda las coordenadas de la entrega y Nuevo pedido las usa.)
- Reemplazar las regiones de ejemplo por las reales (ahora desde Tiendas → Regiones).
- Empresas internas: reglas reales en la base (Fase 7) para que una empresa no pueda leer otra aunque
  alguien cambie la página; marcadores de los pilotos en el mapa de Inicio cuando la app comparta el GPS.

## E. Actividad Transporte (hecha el 2026-10-04; seguridad parcial)

[14-transporte.md](14-transporte.md) · [secciones/viajes.md](secciones/viajes.md). Fases 1 a 7 hechas (`sql/01`
bloques 18 y 19): sección Viajes, rol cliente, franjas, recargos, costos del mes, días cerrados, cortesía, reporte de
viajes y exportaciones con el nombre y la paleta de la empresa.

- **Pendiente (seguridad):** las reservas ya pasan por funciones de la base, pero las lecturas siguen abiertas con la
  clave pública hasta la **Fase 7** (Supabase Auth + RLS, parte C). Hacerla antes de dar usuarios a clientes externos
  con datos reales.
- **Hecho (bloque 20):** el cliente solicita su usuario desde el login (`#registro?empresa=02`) y se aprueba en
  Clientes → Revisar. Posible mejora: confirmar el teléfono con un código por WhatsApp/SMS y "Olvidé mi contraseña".
- **Pendiente de decidir:** "Repetir viaje" / "Agregar regreso" y viajes recurrentes.
- **Para probar en la base real:** ejecutar el bloque 19, crear franjas, poner asientos a un vehículo con piloto y
  dar acceso a un cliente (lista en [11-pruebas.md](11-pruebas.md), "Transporte: viajes").

## F. Decisiones abiertas

- Documentos en encomiendas: hoy suman 0.2 kg cada uno al peso (cobro por peso). ¿Tarifa fija por sobre?
- ¿Página pública de seguimiento para quien recibe el pedido?
