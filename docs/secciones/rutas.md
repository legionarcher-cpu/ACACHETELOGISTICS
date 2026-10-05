# Rutas y asignaciones (`#rutas`)

| Archivo | Qué tiene |
|---|---|
| `secciones/rutas.html`, `js/secciones/rutas.js`, `css/secciones/rutas.css` | Clases e ids `rut` |
| Tablas | `rutas`, `rutas_pilotos`, `usuarios` (pilotos), `tiendas`, `actividades` |

## Qué hace

Calendario de **una semana** (lunes a domingo) de **una tienda**:
- Una fila por ruta (nombre, actividad o "todas", activa).
- Una columna por día con los pilotos asignados ese día.

Acciones (Administrador, G1 y G2 de la región):
- Crear, modificar y eliminar rutas. Una ruta puede ser solo de una actividad.
- Asignar un piloto **por un día** ("+" del día) o **por toda la semana** (botón de la ruta). Varios
  pilotos por ruta el mismo día.
- Quitar (×): solo ese día (si era toda la semana, el período se parte en dos) o la semana completa.
- Pilotos disponibles: los de la tienda y los **multitienda** de otras tiendas de la región.
  **Nunca** un piloto en dos tiendas el mismo día.

Uso en Pedidos: al registrar se elige la ruta y el piloto sale solo según esta asignación.

## Quién ve qué

G3: su tienda, solo ver. Empleado y Piloto: sin acceso (ven su ruta del día en Pedidos).

## Validación del día (QR de cada piloto)

Debajo del calendario (Administrador, G1 y G2): los pilotos de la tienda con su foto, si la tienda ya los
validó hoy y el botón **QR de hoy** (`qr_piloto_dia`): QR con su nombre y foto para descargar o imprimir. Solo
sirve ese día. La tienda lo escanea con **Escanear QR** (encabezado) al empezar el día, ve su nombre y foto
para confirmar que es él (`validar_piloto`), y desde ese momento el piloto puede marcar sus horarios. El
piloto también lo ve en su Inicio ("Mi QR del día").

## Reglas relacionadas

- Una asignación dura como máximo 31 días (regla de la base de datos).
- Si un piloto cambia de tienda (en Usuarios) y no es multitienda: se quitan sus asignaciones futuras en
  la tienda anterior y sus pedidos pendientes allá quedan sin piloto (se avisa al G2).

## Dónde tocar

| Quiero... | Dónde |
|---|---|
| Nombres de los días | `RUT_DIAS` |
| Quién puede gestionar | `puedeGestionar` al inicio de `rutas.js` |
