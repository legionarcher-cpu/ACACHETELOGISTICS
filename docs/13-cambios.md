# 13. Registro de cambios

Lo más nuevo, arriba. Cada entrada dice qué SQL hay que ejecutar.

## 2026-10-02 · Mejoras traídas de SISCED

→ **Ejecutar `sql/01_actualizacion_base_existente.sql` completo** (agrega los **bloques 16 y 17**). Después,
cerrar sesión y volver a entrar. ⚠ **Los usuarios se renombran una sola vez**: `cen-001-jperez` →
`cenjperez01` (región + nombre + empresa, sin la tienda), `jlopez` → `jlopez01` (`admin` y `desar` no cambian).
Si dos quedarían iguales, el segundo recibe un número (`cenjperez201`). Avisar a cada uno su usuario nuevo.
Hacer una copia de las tablas antes (Table Editor → Export).

### Empresas internas con ID
Guía: [secciones/empresas.md](secciones/empresas.md).
- Tabla `empresas` (ID de 2 números `01`, nombre, actividades, activa) y `empresa_id` en regiones, tiendas,
  usuarios, clientes, rutas, vehículos, pedidos, categorías, tarifas y descuentos. Lo existente quedó en la
  empresa `01` "Empresa principal".
- Cada empresa hace **entregas de tienda, encomiendas o las dos** y tiene **su** mercadería (categorías,
  artículos y pesos), sus tarifas y sus descuentos; solo ve lo de sus actividades.
- **Configuración → Empresas** y **Tiendas → pestaña Empresas** (solo Desarrollador): crear, modificar (cambiar
  el ID renombra a sus usuarios), "Trabajar con esta" y eliminar. Al crear se puede copiar la configuración
  de pedidos de la empresa activa.
- **Usuarios con el ID de su empresa al final**: `jperez01` (Administrador, G1, G2) y `cenjperez01` (G3,
  Empleado, Piloto: región + nombre + empresa, **sin la tienda**; si cambia de sucursal en la región o es
  multisucursal, no cambia). Bloque 17: convierte a los que ya tenían `cen001jperez01`. Al crear un **Administrador** o G1, el Desarrollador elige la empresa
  **por su ID** (campo "Empresa (ID)").
- Cada usuario solo ve lo de su empresa (filtro automático en `js/supabase.js`, `db.fromTodas()` para todas).
  El Desarrollador cambia de empresa en el menú del usuario; todos ven ahí su empresa.
- Empresa inactiva: sus usuarios no entran.
- **Tiendas → Regiones**: crear, renombrar y eliminar regiones (antes solo en Supabase).

### Inicio simplificado (con el mapa)
Guía: [secciones/inicio.md](secciones/inicio.md).
- Tablero por rol: saludo, accesos rápidos y **4 cuadros** que abren Pedidos ya filtrado
  (`#pedidos?grupo=...`, `&fecha=todas`, `?tienda=`). Se quitaron la tabla desplegable y la actividad reciente.
- Administrador / G1 / G2: pedidos de hoy, en ruta, entregados, sin piloto + gráfica de 14 días, **Hoy por
  tienda** y **Pendientes** (sin piloto, no entregados, pilotos sin validar, clientes y usuarios por aprobar).
- **Mapa**: ahora muestra **cada entrega de hoy en su punto** con el color de su estado, las tiendas y la
  lista de pilotos de hoy. El piloto ve sus entregas numeradas en el orden de su ruta.
- Piloto: Mi ruta y Mis marcas igual que antes, con cuadros arriba.

### Clientes
- Pestañas **Tiendas | Clientes | Empresas**; se quitó "Agregar clientes" de Tiendas y el enlace "← Tiendas".
- Botón **Nuevo cliente** en cada tienda (abre el formulario con esa tienda marcada).
- **Primero la región** (quien ve varias), luego filtros región → tienda → **ruta de entrega**. Cada cliente
  tiene su ruta en cada tienda (`clientes_tiendas.ruta_id`).
- **Nuevo pedido** agrega solo a Clientes al cliente escrito a mano (con su dirección y su punto de entrega);
  si el teléfono ya existe, usa ese cliente. A un cliente elegido sin ubicación se le guarda la del pedido.
- Ubicación con coordenadas → "Ver en mapa".

### Otras mejoras
- Avisos: si una tienda no tiene Admin G3 ni su región G2, las solicitudes de clientes llegan al
  Administrador y G1 (antes no le llegaban a nadie).
- `herramientas/vaciar_base_datos.sql`: ya no deshace el vaciado si falla un contador y la comprobación
  cuenta las filas reales.
- `sql/01` bloques 8 y 11: se pueden repetir después del bloque 16 (antes fallarían por las reglas nuevas).
- Librerías (Chart.js, Excel, PDF): `LIBRERIAS` y `cargarLibreria()` en `js/componentes.js` (Inicio y Reportes).
- El botón del Cotizador se revisa al cambiar de empresa o iniciar sesión.

**Probar:** [11-pruebas.md](11-pruebas.md), secciones "Empresas internas", "Inicio", "Inicio: mapa",
"Pilotos · Tiendas · Clientes" y "Usuarios". Recargar con **Ctrl + F5** para que el navegador tome los
archivos nuevos.
