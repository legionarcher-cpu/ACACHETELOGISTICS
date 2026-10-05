# 14. Actividad Transporte (viajes) — diseño aprobado

Estado: acordado el 2026-10-02. **Fases 1 a 7 hechas** (2026-10-04, `sql/01` bloques 18 y 19); la Fase 0
(seguridad) está **parcial** (ver parte 10). Cómo quedó cada pantalla: [secciones/viajes.md](secciones/viajes.md).

Junta en ACACHETE lo que hace **Transportes Otoya-Valverde & Asociados** (servicio de transporte de personas
y mercadería, con un viaje de cortesía por fidelidad). Cuando una empresa marca la actividad **Transporte**,
recibe estas funciones. Si no la marca, no ve nada de esto. Con esto se puede crear después una empresa de
ejemplo de transporte.

> No había código previo de Otoya. La carpeta `F:\TRANSPORTE OTOYA-VALVERDE Y ASOC` solo tiene logos, la
> tarjeta, el uniforme, el QR de la promoción y los términos del viaje de cortesía. La paleta verde ya está
> lista (comentada) en `empresas/empresas.js` → `'otoya-valverde'`.

## Resumen de decisiones

| Tema | Decisión |
|---|---|
| Qué se transporta | **Personas y mercadería**, también las dos en el mismo viaje |
| Nombre del registro | "Pedido" se lee **"Viaje"** en la empresa de transporte. Al cambiar a otra empresa vuelve "Pedido" |
| Quién solicita | El **cliente**, con su propio usuario (rol nuevo `cliente`) |
| Confirmación | **Automática** si hay hora libre |
| Vehículo y conductor | **Asignación automática** |
| Precio | **Precio por km según la franja horaria** + mínimo + recargos de **monto fijo** |
| Costos | Módulo **Costos de transporte**: gasto mensual dividido para obtener el costo por km y por hora (referencia de margen) |
| Bloqueo de agenda | **Simple**: acercamiento fijo + minutos del mapa + colchón |
| Datos obligatorios | **Cuántas personas viajan** y **si lleva mascotas** |
| Cancelar / cambiar hora | **Sí**, hasta X horas antes (configurable, propuesta 2 h) |
| Cortesía | **Automática**: 5 viajes en 15 días = 1 cortesía; **vence a los 30 días**; cubre **solo el viaje** (no los recargos); **sin tope** por periodo |
| Público | Clientes fijos que van y vuelven del trabajo |
| Lugares guardados | **Solo 2: Casa y Trabajo**, como base para armar la ruta con un toque |

## 1. La actividad `transporte`

Fila nueva en la tabla `actividades`, con un uso nuevo (Configuración → Actividades, solo Desarrollador):

| Uso nuevo | Efecto |
|---|---|
| `usa_viajes` | La actividad trabaja con **viajes** (sección Viajes: personas, mascotas y mercadería; el cliente solicita; agenda; cortesía) y no con pedidos. Transporte = sí. (El diseño proponía tres usos: `usa_pasajeros`, `usa_solicitud_cliente` y `usa_cortesia`; quedaron en este solo, porque siempre van juntos) |

Se suma a `USO_ANTERIOR` en `empresas/empresas.js` y a la opción **4 · Transporte** de `herramientas\empresas.bat` (Nueva empresa).

### Palabras por actividad

Hoy "Pedido" está escrito directamente en unos **49 lugares** (menú, Inicio, Pedidos, Reportes, QR, Usuarios,
Configuración, `sesion.js`). Se cambian por un **diccionario de palabras** que define cada actividad:

| Clave | Tienda / Encomiendas | Transporte |
|---|---|---|
| registro (singular / plural) | Pedido / Pedidos | Viaje / Viajes |
| conductor | Piloto | Conductor |

- La empresa **solo con transporte**: en todo el sistema se lee "Viajes".
- La empresa con **transporte + otra actividad**: el menú dice "Pedidos" y aparece la pestaña "Viajes" (Pedidos ya
  separa las actividades en pestañas).
- Al **cambiar de empresa** (menú del usuario) las palabras cambian solas.

## 2. Rol `cliente`

| Qué | Cómo |
|---|---|
| Se crea | **Clientes → botón de llave "Acceso y lugares"** (Administrador, G1, G2, G3; cliente ya aprobado). Usuario con el ID de la empresa al final (`mramirez02`), ligado al cliente (`usuarios.cliente_id`). Ahí también se cambia la contraseña o se quita el acceso. No aparece en la sección Usuarios |
| Secciones | **Inicio, Viajes y Mi perfil**. Las demás no aparecen en su menú (ni con candado) |
| Ve | Solo **sus** viajes |
| Su Inicio | Botón grande **Solicitar viaje**, su próximo viaje con su estado y el conductor, su avance en la cortesía ("3 de 5 viajes" o "Tienes 1 cortesía · vence el 02/11") |

Se agrega a `SECCIONES_POR_ROL` (`js/sesion.js`) y a la tabla de [06-roles-y-permisos.md](06-roles-y-permisos.md).

⚠ **Requisito:** antes de dar usuarios a clientes **externos**, la base debe proteger por sí misma las tablas de
viajes, clientes y usuarios (Supabase Auth + RLS, parte de la Fase 7). Con las reglas solo en la página, alguien
con conocimientos técnicos podría leer los viajes de otros clientes con la clave pública.

## 3. Solicitud de viaje (cliente)

Una sola pantalla en 4 pasos, pensada para celular. **Primero la ruta y después la hora:** sin la distancia no se
sabe qué horas están libres.

```
┌───────────────────────────────────────────────┐
│ 1 · ¿Quiénes y qué viajan?                    │
│   Personas que viajan *     [ 2 ]             │
│   ¿Lleva mascotas? *        (○ Sí  ○ No)      │
│      └ si es Sí: cuántas [1] · nota           │
│   ¿Lleva mercadería?        (○ Sí  ○ No)      │
│      └ si es Sí: descripción y bultos         │
├───────────────────────────────────────────────┤
│ 2 · Ruta                                      │
│   A · Recoger en: [______________] 📍          │
│   B · Llevar a:   [______________] 📍          │
│   [ mapa A → B ]   12 km · unos 20 min        │
│   Estimado: ₡4 500   (o "Viaje de cortesía")  │
├───────────────────────────────────────────────┤
│ 3 · Día y hora                                │
│   [◀ Hoy  Mié 7  Jue 8  Vie 9 ▶]              │
│   07:00 07:15 07:30 ░░░░░ ░░░░░               │
│   08:30 08:45 ░░░░░ 09:30 09:45               │
│   (░ = no disponible · precio por franja)     │
├───────────────────────────────────────────────┤
│ 4 · Confirmar                                 │
│   Resumen + [ Solicitar viaje ]               │
└───────────────────────────────────────────────┘
```

| Campo | Regla |
|---|---|
| Personas | **Obligatorio**, mínimo 1. Puede ser 0 solo si marcó mercadería (envío sin pasajero) |
| Mascotas | **Obligatorio** Sí / No, sin respuesta marcada de inicio. Si es Sí: cantidad y nota |
| Mercadería | Opcional: descripción y bultos |
| Ruta | Reutiliza `js/mapa.js` (Nominatim + OSRM): devuelve **km y minutos**. Si cambia A o B, el paso 3 se recalcula |
| Día y hora | Horas cada **15 min**. Solo se ofrecen las que tienen franja de precio y vehículo libre |

### Lugares guardados: Casa y Trabajo

Cada cliente tiene **solo dos** lugares fijos: **Casa** y **Trabajo** (dirección + punto en el mapa).

| Qué | Cómo |
|---|---|
| Dónde se guardan | En el mismo cliente (tabla `clientes`): dirección y coordenadas de Casa y de Trabajo. Sin tabla aparte, porque siempre son dos |
| Quién los llena | El cliente en **Viajes** ("Guardar como Casa / Trabajo" al ubicar un punto; "Mis lugares" para quitarlos), o el personal en **Clientes → Acceso y lugares** (buscador de direcciones) y al solicitar un viaje por el cliente |
| En el paso 2 | Botones **🏠 Casa** y **💼 Trabajo** junto a A y B: con un toque se llena el punto. Se puede escribir cualquier otra dirección |
| Sin guardar | Si falta alguno, el botón dice "Guardar Casa" (o "Guardar Trabajo") y abre el mapa para marcarlo |

Ejemplo: ir al trabajo = A 🏠 Casa → B 💼 Trabajo. Volver = al revés.

Al tocar **Solicitar viaje**, el viaje queda **Confirmado** con vehículo y conductor, y el conductor recibe el
aviso (`js/notificaciones.js`).

## 4. Agenda: bloqueo simple

```
bloque = acercamiento fijo (ej. 15 min) + minutos del mapa A → B + colchón (ej. 10 min)
         redondeado hacia arriba a 15 min
```

- **Sin minutos del mapa** (OSRM caído, ruta aproximada): minutos = km ÷ velocidad promedio configurable (ej. 30 km/h).
- Se comparan **intervalos**, no casillas fijas: a un viaje largo se le bloquean más horas que a uno corto.
- **Días cerrados:** domingos y los días de cierre (calendario nuevo en Configuración) se bloquean completos.
  Horas sin franja de precio también.
- **Anticipación:** mínima (ej. 1 h antes) y máxima (ej. 14 días), configurables.

Ejemplo: acercamiento 15 min, viaje 20 min, colchón 10 min → bloque de 45 min. Si el cliente elige las 9:00, el
vehículo queda ocupado de **8:45 a 9:30**.

### Asignación automática

Una hora está libre si hay **al menos un vehículo** que:

1. está activo (no en mantenimiento) y tiene conductor ese día;
2. tiene **asientos** ≥ personas y **carga máxima** ≥ la mercadería;
3. **acepta mascotas**, si el cliente lleva;
4. está libre durante todo el bloque.

Entre los que cumplen, se asigna el que tiene **menos viajes ese día** (reparte el trabajo).

**Vehículos** suma tres datos: asientos, carga máxima (kg) y acepta mascotas (sí / no).

La reserva se guarda con **una sola función en la base** que vuelve a revisar que la hora siga libre, asigna y
guarda, todo junto. Si dos clientes eligen la misma hora a la vez, el segundo recibe "Esa hora acaba de ocuparse"
y la cuadrícula se actualiza.

### Cancelar o cambiar la hora

- Permitido **hasta X horas antes** (configurable, propuesta **2 h**). Pasado el límite, solo por teléfono.
- Cancelar **libera el bloque** al instante.
- Cambiar la hora es una sola operación: se verifica que la nueva esté libre y recién entonces se suelta la
  anterior. Si no está libre, el viaje queda como estaba.

## 5. Precio por franja horaria

Configuración → **Franjas y precio** (Admin y G1). Ejemplo:

| Franja | Días | Precio por km | Mínimo |
|---|---|---|---|
| 06:00–09:00 (hora pico) | L–V | ₡450 | ₡2 500 |
| 09:00–16:00 | L–S | ₡350 | ₡2 000 |
| 16:00–19:00 (hora pico) | L–V | ₡450 | ₡2 500 |
| 19:00–22:00 (noche) | L–S | ₡500 | ₡3 000 |

```
viaje = máximo(mínimo, cargo base + km × precio por km de la franja)
recargos = pasajeros adicionales × monto + mercadería (monto por viaje) + mascotas × monto
total = viaje + recargos
        → con cortesía: viaje = ₡0 (los recargos se cobran igual)
```

| Regla | Detalle |
|---|---|
| Franja que se cobra | La de la **hora de recogida**, aunque el viaje termine en otra |
| Franjas encimadas | No se permiten dentro del mismo día |
| Horas sin franja | No se pueden solicitar |
| Recargos | **Monto fijo**. Pasajero adicional: por persona arriba de las incluidas (ej. el precio cubre 1). Mercadería: por viaje. Mascota: por mascota. 0 = no se cobra |
| Al cliente | El precio de cada franja puede verse en la cuadrícula de horas (ve qué horas salen más baratas) |
| Reutiliza | "Tarifa en palabras" y el simulador de Configuración → Pedidos, que pasa a cruzar **km × franja** |

Cada viaje guarda una copia de la franja y del cálculo (como `costo_desglose` en los pedidos).

## 6. Costos de transporte

Configuración → **Costos de transporte** (Admin y G1). Solo aparece si la empresa tiene la actividad transporte.
Se arma con el "motor de catálogos" de `configuracion/pedidos.js` (ver [secciones/configuracion.md](secciones/configuracion.md)).

Sirve para **dividir el gasto del mes y saber cuánto cuesta cada km y cada hora**, y comparar ese costo con el
precio de cada franja.

| Tipo de gasto | Ejemplos | Se divide entre |
|---|---|---|
| **Fijos** (se pagan aunque no haya viajes) | Cuota del vehículo, seguro, marchamo, salario o pago al conductor, plan de teléfono, parqueo | Horas trabajadas en el mes |
| **Variables** (dependen de los km) | Combustible (precio del litro ÷ km que rinde), mantenimiento, llantas, lavado | Km recorridos en el mes |

```
costo por hora = gastos fijos del mes ÷ horas trabajadas del mes
costo por km   = gastos variables del mes ÷ km del mes
costo del viaje = minutos ÷ 60 × costo por hora + km × costo por km
```

- **Por vehículo:** cada vehículo tiene sus gastos. El viaje toma el costo del vehículo asignado.
- **Divisor híbrido:** se empieza con km, horas y viajes **estimados** (escritos a mano). Con un mes de historial,
  el sistema muestra los **reales** y la diferencia ("estimaste 3000 km, se recorrieron 2400 → costo real ₡X por km").
- **Margen por franja:** junto a cada franja se ve "costo ₡280 por km → ganancia 37 %", con aviso si el precio queda
  por debajo del costo.

## 7. Viaje de cortesía (automático)

Basado en `TERMINOS Y CONDICIONES VIAJE CORTESIA.docx`.

| Regla | Detalle |
|---|---|
| Se gana | **5 viajes terminados en 15 días** = 1 cortesía. Esos 5 viajes ya no cuentan para la siguiente |
| Tope | **Ninguno.** Un cliente que va y vuelve del trabajo puede ganar unas 4 cortesías en 15 días (decisión: refuerza la fidelidad) |
| Vence | A los **30 días** de ganarla |
| Se aplica | **Sola**, en la próxima solicitud que cumpla: dentro del radio (aprox. 5–8 km, configurable) y en día y horario permitidos |
| Cubre | **Solo el viaje.** Los recargos (pasajero adicional, mercadería, mascota) se cobran |
| No cuentan | Viajes cancelados |
| Si cancela el viaje de cortesía a tiempo | La cortesía **vuelve**, si no ha vencido |
| Personal | Es del cliente que hizo los viajes. No se transfiere ni se combina |

Los valores (5 viajes, 15 días, 30 días, radio) se configuran. Reportes muestra cuántas cortesías se dieron y cuánto costaron.

## 8. Reportes de Viajes

Pestaña **Viajes** en Reportes: ingresos por franja, km recorridos, ocupación por vehículo, costo contra ingreso
(con el módulo de costos), cortesías dadas y su costo, cancelaciones.

## 9. Empresa de ejemplo

Al crear una empresa con la actividad Transporte (Tiendas → Empresas → Nueva empresa) se puede copiar la
configuración base: franjas y recargos, costos de ejemplo, reglas de la cortesía y, en multimarca, la paleta
verde de Otoya. Reutiliza la opción "copiar configuración" que ya existe.

## 10. Fases (orden de implementación)

| Fase | Qué incluye | ¿SQL? |
|---|---|---|
| **0 · Seguridad** ◐ parcial | **Hecho:** viajes y cortesías solo se leen desde la página; reservar, cambiar la hora, cancelar y avanzar pasan por funciones de la base que revisan el rol, la empresa, el plazo y la disponibilidad (no se pueden saltar desde la página). **Falta:** Supabase Auth + RLS en todas las tablas (Fase 7 general), para que nadie lea datos de otros con la clave pública | Sí (bloque 19) |
| **1 · Actividad Transporte** ✔ 2026-10-04 | Actividad `transporte`; palabras por actividad (Pedido/Viaje, Piloto/Conductor) aplicadas en pantalla por `js/palabras.js`; botón Nueva actividad; opción 4 en `nueva_empresa.py`. En vez de `usa_pasajeros` / `usa_solicitud_cliente` / `usa_cortesia` quedó un solo uso: **`usa_viajes`** | Sí (bloque 18) |
| **2 · Costos de transporte** ✔ 2026-10-04 | Configuración → Transporte → Costos del mes: gastos fijos y variables (por vehículo o de toda la empresa), combustible, horas y km del mes; costo por hora y por km estimado y real (30 días) | Sí (bloque 19) |
| **3 · Franjas y precio** ✔ 2026-10-04 | Franjas (días, horario, precio por km, base, mínimo; no se enciman), recargos fijos, redondeo, margen contra el costo, simulador km × franja | Sí (bloque 19) |
| **4 · Rol Cliente** ✔ 2026-10-04 | Clientes → "Acceso y lugares" (usuario `mramirez02` + contraseña, Casa y Trabajo); menú solo Inicio/Viajes/Mi perfil; Inicio del cliente | Sí (bloque 19) |
| **5 · Solicitud y agenda** ✔ 2026-10-04 | Sección Viajes: 4 pasos, Casa y Trabajo, bloqueo simple, asientos/carga/mascotas en Vehículos (tipos Automóvil y Microbús), asignación y confirmación automáticas, cambiar hora y cancelar, días cerrados, agenda del personal y botones del conductor | Sí (bloque 19) |
| **6 · Cortesía** ✔ 2026-10-04 | Automática al terminar el 5.º viaje en 15 días, vence en 30, se aplica sola dentro del radio, vuelve si se cancela a tiempo | Sí (bloque 19) |
| **7 · Reportes** ✔ 2026-10-04 | Reportes → pestaña Viajes: resumen, por franja, por vehículo (con costo y margen) y detalle; Excel y PDF con el nombre y los colores de la empresa | No |

Detalle de cómo quedó: [secciones/viajes.md](secciones/viajes.md). Una empresa **solo de Transporte** no ve Pedidos,
Rutas, Cotizador ni Configuración → Pedidos / Slots; su Inicio y sus Reportes muestran los viajes.

⚠ Antes de dar usuarios a clientes **externos** con datos reales falta la parte de la Fase 0 que depende de la
Fase 7 general (Supabase Auth + RLS en todas las tablas).

## 11. Propuestas sin decidir

- Botones **"Repetir viaje"** y **"Agregar regreso"** (propone B → A más tarde el mismo día). Pensados para
  clientes fijos. Fase 5. (Los lugares guardados ya se decidieron: Casa y Trabajo, parte 3.)
- **Viajes recurrentes:** reservar de una vez "L–V 7:00, Casa → Trabajo". Confirma los días con hora libre y avisa
  los que no. Tope de anticipación (ej. 2 semanas). Fase 5 o fase propia.
