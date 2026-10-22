# Base de datos (Supabase)

## Carpetas

| Carpeta | Qué tiene | Cuándo se usa |
|---|---|---|
| `instalacion/` | La base completa, un archivo por módulo. Cada tabla se crea una sola vez y cada función está en su versión final. | Base **nueva** o **reiniciada** |
| `actualizaciones/` | Un archivo pequeño con fecha por cada cambio (`AAAA-MM-DD_tema.sql`). | Base que **ya está instalada** |
| `historial/` | Los scripts viejos (`00_instalacion_completa.sql`, `01_actualizacion_base_existente.sql` con los bloques 0 a 46, `por_funcion/`, `dividir_sql` y `vaciar_base_datos.sql`). Solo de consulta: **no se ejecutan**. | Nunca |

Los comentarios del código que dicen "sql/01 bloque N" se refieren a `historial/01_actualizacion_base_existente.sql`.

## Instalar desde cero

En Supabase → **SQL Editor** → New query, se pega y se ejecuta (Run) cada archivo de `instalacion/`, **en orden**:

| Archivo | Qué crea |
|---|---|
| `00_reiniciar_base.sql` | ⚠ **Borra todo** el esquema public (tablas, funciones y datos). Solo si se quiere empezar de cero. |
| `01_base.sql` | Empresas, regiones, tiendas, vehículos, clientes, usuarios, notificaciones, configuración y visitas |
| `02_actividades_y_catalogos.sql` | Actividades, categorías y artículos, tamaños, tarifas, descuentos y motivos de retraso |
| `03_horarios_y_marcas.sql` | Horarios (turnos del piloto y slots de despacho), marcas y QR |
| `04_rutas_y_pedidos.sql` | Rutas, pedidos, despacho, solicitudes de envío y ubicación compartida |
| `05_transporte.sql` | Viajes, franjas y cortesía |
| `06_costos.sql` | Costos de operación |
| `07_caja_y_ubicacion.sql` | Caja de pilotos y ubicación en tiempo real |
| `08_distribuidora.sql` | Productos, precios, bodega del día y cierres |
| `09_recolecciones.sql` | Agenda de recolecciones y cobro semanal |
| `10_clientes_y_herramientas.sql` | Solicitud de usuario del cliente y "Limpiar datos" de una empresa |
| `11_acceso_web.sql` | Quién puede leer y cambiar cada tabla (reglas RLS por empresa y por rol), qué funciones se pueden llamar y los buckets de fotos |
| `12_datos_arranque.sql` | Actividades, empresa 01 de prueba con datos de ejemplo y los usuarios `desar` (clave `ak7desa`) y `admin` (clave `admin123`) |

Todos se pueden volver a ejecutar sin duplicar nada.

**Una sola vez en Supabase** (Authentication → Sign In / Providers): desactivar **"Allow new users to sign up"**. Los
accesos de los usuarios los crea la base, nadie debe poder crearse uno por su cuenta.

## Cuando hay un cambio

Cada cambio de la base se hace en **dos** lugares:

1. **El módulo de `instalacion/`** que corresponde, para que una base nueva nazca completa.
2. **Un archivo nuevo en `actualizaciones/`** (`AAAA-MM-DD_tema.sql`) con lo que le falta a una base ya instalada. Es el **único** que se ejecuta en la base real.

Ojo: `create table if not exists` **no agrega columnas** a una tabla que ya existe. Una columna nueva necesita `alter table ... add column if not exists ...` en el archivo de actualización.

## Reglas de la base

- **Llaves de empresa:** casi todas las tablas tienen `empresa_id`. La página lo pone sola y filtra por la empresa activa (`js/supabase.js`, `TABLAS_POR_EMPRESA`).
- **Lo que la página solo lee** (pedidos de caja, viajes, recolecciones, bodegas, marcas...) se cambia con funciones `security definer` que revisan las reglas.
- **Formatos de Costa Rica:** la base pone el tope de largo y los caracteres permitidos de teléfonos y cédulas.
- **Inicio de sesión con Supabase Auth:** cada usuario de la tabla `usuarios` tiene su acceso en Authentication →
  Users con un correo interno (`jperez01@acachete.interno`). Lo crea, cambia y borra la base sola al crear, cambiar
  la contraseña o borrar el usuario. La contraseña nunca queda en `usuarios`.
- **Reglas RLS** (`11_acceso_web.sql`): sin sesión no se ve nada; cada empresa ve solo lo suyo y el cliente solo lo
  suyo. Las funciones confirman que el usuario que manda la página es el de la sesión (`usuario_activo`).
- **Tabla nueva:** `11_acceso_web.sql` le pone RLS a todas las tablas, pero hay que darle sus reglas
  (`public.reglas_tabla(...)`) en ese archivo y en la actualización. Sin regla, la página no la ve.
- **Columna nueva en `usuarios`:** volver a ejecutar `select public.usuarios_ocultar_clave();` para que la página la pueda leer.
