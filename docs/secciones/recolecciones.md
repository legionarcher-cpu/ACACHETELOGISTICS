# Recolecciones (`#recolecciones`) — actividad Recolección

Solo aparece si la empresa tiene la actividad **Recolección** (`recoleccion`, marca `usa_recolecciones`).
Es aparte de Transporte y de las demás actividades: tiene su propia marca, sus tablas y su sección, y **recicla**
lo de Viajes (mismo esquema de agenda, cambiar la hora "todo o nada", cancelar, estados del conductor, mapa A → B,
la ubicación de la ficha del cliente, rol cliente y sus estilos).

> OJO: `usa_recolecciones` no es `usa_punto_partida` (el punto A de los pedidos de Encomiendas).

| Archivo | Qué tiene |
|---|---|
| `secciones/recolecciones.html`, `js/secciones/recolecciones.js`, `css/secciones/recolecciones.css` | La sección (ids `rec`). El CSS importa `css/secciones/viajes.css` |
| Piezas recicladas | `js/viajes-comun.js` (`viaFecha`, `viaHora`, `viaRangoDia`, `viaElemento`, `viaBoton`, `textoDias`…), `js/mapa.js` (`crearMapaRuta`), `crearPestanas` y `palabrasDeBusqueda` (`js/componentes.js`) |
| Tablas | `recolecciones`, `recoleccion_config`, `recoleccion_bloqueos`, `recoleccion_tarifas`, `recoleccion_cargos` |
| SQL | `sql/instalacion/09_recolecciones.sql` (y `10_clientes_y_herramientas.sql`: solicitud de usuario y limpiar empresa) |

## Una sola agenda

Cada espacio de la agenda (30 min por defecto) lo toma **un solo cliente**. Horario de servicio, días, duración de
cada espacio, anticipación, días hacia adelante y hasta cuándo el cliente cambia o cancela: pestaña **Bloqueos y
horario** (`recoleccion_config`).

## Quién ve qué

| Quién | Ve | Puede |
|---|---|---|
| **Cliente** (rol `cliente`) | Sus próximas y anteriores, lo pendiente de pago | Solicitar, cambiar la hora y cancelar hasta `cancelar_horas` antes (si el espacio nuevo está libre) |
| **Quien atiende** (Administrador, Admin G1, piloto o función `recolecciones.atender`) | Agenda del día | "Voy en camino" → "Recogida" → "Entregada" · "No estaba" · "Ir a recoger / entregar" (Google Maps). Pestaña **Bloqueos y horario** |
| **Quien cobra** (función `recolecciones.cobrar`: Administrador y Admin G1) | Pestaña **Cobros** | Tarifa diaria por cliente, tarifa de la empresa, marcar cobrado, corregir el monto de un día |
| **Personal** | Agenda del día | Solicitar para un cliente (función `recolecciones.solicitar`), cambiar la hora y cancelar |

Un **admin que también es conductor** es simplemente el Administrador (o un Admin G1): ve las solicitudes y hace el
proceso del conductor. A cualquier otro usuario se le da con Usuarios → "Módulos y funciones" → Recolecciones →
"Atender como conductor y bloquear horas".

## Solicitud

0. **Cliente** (solo el personal).
1. **Qué se recoge:** **Depósitos** (cuántos, de 1 a 50, y **de quién es cada uno**) u **Otra cosa** (descripción).
2. **Dónde:** A = recoger (dirección o mapa; botón "Ubicación del cliente": la de su ficha). B = entregar **en la oficina** (la
   de la empresa: dirección y ubicación de Tiendas → Empresas) u **otro lugar** (dirección o mapa, ej. un banco).
3. **Día y hora:** `recolecciones_horas` da los espacios del día: libres, ocupados o bloqueados (en gris).
4. **Confirmar:** `recolecciones_solicitar` revisa todo otra vez con un candado por empresa. Si otro cliente tomó el
   espacio un instante antes, avisa y vuelve a cargar las horas.

## Bloqueos (almuerzo, entrada, salida)

"Todas las semanas" (días marcados) o "Un día" (una fecha), de una hora a otra, con motivo. Esos espacios salen como
"No disponible" para el cliente (quien atiende ve el motivo). Las recolecciones que ya estaban no se borran.

## Cobro semanal

- **Tarifa diaria como en las rutas** (`recoleccion_tarifas`): a cada cliente se le marcan los **días que se trabajan**
  (lun..dom), el **monto por día** y **desde** cuándo se cobra. Cada día marcado se cobra el monto, **haya o no
  recolecciones**. Un cliente sin tarifa no se cobra.
- `recoleccion_generar_cargos(empresa, desde, hasta)` arma en `recoleccion_cargos` los días marcados que falten (uno por
  cliente y día). La llaman Cobros (la semana que se ve) y la vista del cliente (la semana actual). Los ya cobrados o
  corregidos no se tocan.
- Al cambiar o quitar una tarifa se borran los días **por cobrar** del cliente desde el lunes de esta semana y se
  vuelven a armar con la tarifa nueva.
- Pestaña **Cobros**: semana de lunes a domingo, por cliente: días, por cobrar y cobrado. **Cobrado** marca los días
  pendientes. El lápiz corrige el monto de un día no cobrado (ej. un feriado en ₡0).
- El cliente ve en su sección lo que tiene pendiente de pago.

## Reglas que aplica la base (no la página)

La página **solo lee** `recolecciones`. Todo cambio pasa por funciones `security definer`:

| Función | Qué hace |
|---|---|
| `recolecciones_horas` | Espacios del día: libres, ocupados o bloqueados |
| `recolecciones_solicitar(p)` | Valida, candado por empresa (`pg_advisory_xact_lock(7303, …)`), guarda y avisa a quienes atienden |
| `recolecciones_cambiar_hora` | Todo o nada: si el espacio nuevo no está libre, sigue como estaba |
| `recolecciones_cancelar` | El cliente solo dentro del plazo |
| `recolecciones_avanzar` | Estados del conductor (no toca el cobro) |
| `recoleccion_generar_cargos` | Arma los días por cobrar según la tarifa de cada cliente (días marcados) |

Usa `usuario_activo` (01_base.sql). En `10_clientes_y_herramientas.sql`: `registro_clientes_empresa` y
`solicitar_acceso_cliente` (el cliente también puede pedir su usuario en una empresa de Recolección) y
`limpiar_empresa` (también borra las recolecciones).

## Estados

`confirmada` → `en_camino` → `recogida` → `entregada` · `cancelada` · `no_estaba`.

## Avisos (campana)

Recolección nueva, cancelada o con hora nueva → todos los que atienden. "Vamos en camino a recoger" y "Recolección
entregada" → el cliente (si tiene usuario).

## Inicio y pie

- Empresa de Recolección sin viajes: el cliente (y todos, si la empresa no hace pedidos) entra directo a Recolecciones.
- Empresa sin pedidos ni viajes: el botón "Crear" del pie abre la solicitud de recolección (`BOTONES_PIE_RECOLECCION`).

## Cómo activarla

1. Tener la base instalada (`sql/instalacion`).
2. Tiendas → Empresas → la empresa → marcar **Recolección**.
3. (Opcional) Tiendas → Empresas: dirección y ubicación de la oficina, para entregar "en la oficina".
4. Recolecciones → Bloqueos y horario: días, horas y bloqueos. Cobros: tarifas.
