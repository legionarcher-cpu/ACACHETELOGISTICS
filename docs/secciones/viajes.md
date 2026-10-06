# Viajes (`#viajes`) — Transporte

Solo aparece si la empresa hace **viajes** (actividad con `usa_viajes`, ej. Transporte). Diseño completo:
[14-transporte.md](../14-transporte.md).

| Archivo | Qué tiene |
|---|---|
| `secciones/viajes.html`, `js/secciones/viajes.js`, `css/secciones/viajes.css` | La sección (ids `via`) |
| `js/viajes-comun.js`, `css/viajes.css` | Lo común: estados, tarjeta de viaje, cortesía, precios por franja, costos, **Inicio de viajes** y **reporte de viajes** |
| Tablas | `viajes`, `cortesias`, `transporte_config`, `transporte_franjas`, `transporte_dias_cerrados`, `transporte_costos` |
| SQL | `sql/01` **bloque 19** (también en `sql/00`, sección 13) |

## Quién ve qué

| Quién | Ve | Puede |
|---|---|---|
| **Cliente** (rol `cliente`) | Sus próximos viajes y los anteriores, su cortesía, Casa y Trabajo | Solicitar, cambiar la hora y cancelar hasta `cancelar_horas` antes |
| **Conductor** (rol `piloto` con vehículo) | Sus viajes del día | "Voy en camino" → "A bordo" → "Terminar" · "No se presentó" · "Ir a A / B" (Google Maps) |
| **Personal** (Administrador, G1, G2, G3, Empleado) | Agenda del día: resumen, filtros por estado, vehículo y texto | Solicitar para un cliente (paso 0), cambiar la hora, cancelar y avanzar el estado |

Parámetros: `#viajes?nuevo=1` abre la solicitud · `#viajes?id=15` muestra ese viaje (lo usan las notificaciones).

## Cómo obtiene el cliente su usuario

| Cómo | Dónde |
|---|---|
| Se lo crea la empresa | Clientes → botón de llave **"Acceso y lugares"** |
| **Lo solicita él mismo** (sql/01 bloque 20) | "¿Eres cliente? Solicita tu usuario" en el login de cualquier marca: escribe el **código de su empresa** (o le llega puesto con el enlace **`app.html#registro?empresa=02`**). Sirve para todas las empresas activas con Transporte. Queda pendiente y se aprueba en Clientes → **Revisar**. Detalle: [login-y-perfil.md](login-y-perfil.md) |

## Solicitud en 4 pasos

1. **¿Quiénes y qué viajan?** Personas (obligatorio; 0 solo con mercadería), **¿lleva mascotas?** Sí/No (obligatorio,
   sin respuesta marcada), mercadería (descripción, bultos, kg).
2. **Ruta:** mapa A → B (`crearMapaRuta`, `js/mapa.js`: km y minutos por calle). Botones **Casa** y **Trabajo** llenan el
   punto; **"Guardar como Casa / Trabajo"** guarda el punto ubicado en el cliente.
3. **Día y hora:** días de hoy a `anticipacion_dias`. La base (`viajes_horas_disponibles`) devuelve las horas cada 15 min
   dentro de las franjas, si hay vehículo libre y el precio de cada una. Las ocupadas salen en gris.
4. **Confirmar:** resumen con el total estimado (con cortesía: solo recargos). **Solicitar viaje** llama a
   `viajes_solicitar`, que revisa todo otra vez, asigna vehículo y conductor y confirma. Si otra persona tomó la hora un
   instante antes, avisa ("Esa hora acaba de ocuparse") y recarga las horas.

## Reglas que aplica la base (no la página)

La página **solo lee** `viajes` y `cortesias`. Todo cambio pasa por funciones de la base (`security definer`):

| Función | Qué hace |
|---|---|
| `viajes_horas_disponibles` | Horas del día con disponibilidad y precio |
| `viajes_solicitar(p)` | Valida, bloquea la empresa un instante (`pg_advisory_xact_lock`), elige vehículo, aplica la cortesía, calcula el precio y guarda |
| `viajes_cambiar_hora` | Todo o nada: si la hora nueva no está libre, el viaje sigue igual |
| `viajes_cancelar` | El cliente solo dentro del plazo; la cortesía vuelve si no venció |
| `viajes_avanzar` | Estados del conductor; al terminar revisa si el cliente ganó una cortesía |
| `viajes_estado_cliente` | Avance hacia la cortesía y cortesías disponibles |

- **Bloque del vehículo:** `acercamiento_min` antes de la hora + minutos del mapa + `colchon_min`, redondeado a 15 min.
- **Vehículo:** activo (no en mantenimiento), con un piloto asignado (Usuarios), asientos ≥ personas, carga ≥ kg,
  acepta mascotas si hacen falta y sin otro viaje que choque. Entre los que sirven, el de menos viajes ese día.
- **Precio:** `máximo(mínimo, cargo base + km × precio por km)` de la franja de la **hora de recogida**, redondeado hacia
  arriba + recargos fijos. Nadie puede cobrar menos km que la línea recta entre A y B.
- **Cortesía:** 5 viajes terminados en 15 días (configurable) = 1 cortesía que vence a los 30 días y se aplica sola en el
  próximo viaje dentro del radio. Los viajes de cortesía no cuentan para la siguiente.

## Estados

`confirmado` → `en_camino` → `en_curso` → `terminado` · `cancelado` · `no_se_presento`.

## Avisos (campana)

Viaje nuevo, cancelado o con hora nueva → el conductor. "Tu conductor va en camino" y "¡Ganaste un viaje de cortesía!"
→ el cliente (si tiene usuario).

## Dónde tocar

| Quiero... | Dónde |
|---|---|
| Cambiar la tarjeta de un viaje | `tarjetaViaje()` en `js/viajes-comun.js` |
| Cambiar qué botones ve cada uno | `accionesDe()` en `js/secciones/viajes.js` |
| Cambiar la regla de precio | `viaje_precio` (SQL) **y** `precioFranja()` / `recargosViaje()` (JS) |
| Cambiar cómo se elige el vehículo | `viaje_vehiculo_libre` (SQL) |
| Cambiar la cortesía | `cortesia_revisar` y `viajes_estado_cliente` (SQL) + Configuración → Transporte |
