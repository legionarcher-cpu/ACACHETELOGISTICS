# Configuración (`#configuracion`)

| Archivo | Qué tiene |
|---|---|
| `secciones/configuracion.html` | Tarjetas de módulos, cada módulo (`<section class="cfg-modulo">`) y sus ventanas |
| `js/secciones/configuracion.js` | Tarjetas, módulos Horarios y Vehículos, carga de módulos externos |
| `js/secciones/configuracion/pedidos.js` | Módulo Pedidos (catálogos, tarifa en palabras + simulador de precios peso × distancia con Python) |
| `js/secciones/configuracion/actividades.js` | Ventana flotante de Actividades |
| `css/secciones/configuracion.css` | Estilos (clases `cfg-`) |

## Cómo funciona

- Al entrar se ven solo **tarjetas** de los módulos que el rol puede usar.
- Un módulo se abre en su página (`#configuracion?modulo=horarios`) con botón para volver, **o** en una
  **ventana flotante** si en `CFG_MODULOS` tiene `ventana: true` (Actividades).
- Los módulos grandes viven en `js/secciones/configuracion/<nombre>.js` y se descargan la primera vez:

```js
registrarModuloConfig('nombre', (seccion, ctx) => {
    // ctx = { zona, aviso, pedirConfirmacion, esGeneral, regionG2 }
    return () => { /* limpieza */ };            // módulo de página
    // return { abrir() {...}, limpiar() {...} }; // módulo ventana (seccion llega en null)
});
```

- `data-solo-general` en el HTML: se oculta al Admin G2. `data-nota-g2`: nota que solo ve el G2.

## Módulos

| Módulo | Qué configura | Tablas | Quién |
|---|---|---|---|
| **Horarios** | Cantidad de horarios del piloto y pedidos máximos por horario; horas de cada horario; horario por día de la semana; pedidos por horario de una región o tienda (tienda > región > base) | `configuracion`, `marcas_horario`, `horario_dias`, `marcas_dia`, `capacidad_marcas` | Admin y G1 todo; G2 ve la base y ajusta su región/tiendas |
| **Slots** (`configuracion/slots.js`) | Rangos de horario de **despacho** de los pedidos (distintos de los horarios del piloto): cantidad de slots, horas de cada slot (desde / hasta, sin encimarse) y slots propios por día de la semana (0 = no se despacha). El empleado elige el slot al registrar y lo confirma en "Listo para despachar" | `configuracion` (`cantidad_slots`), `slots_horario`, `slot_dias`, `slots_dia` | Admin y G1 cambian; G2 solo ve |
| **Vehículos** | Resumen por estado; lista con búsqueda; agregar/modificar/eliminar (placa, **tipo**: camión, pick-up, panel, moto, automóvil, microbús; marca; estado). Si la empresa hace viajes: asientos, carga, acepta mascotas, km por litro, horas y km del mes | `vehiculos` | Admin y G1; G2 los de pilotos de su región (no agrega) |
| **Transporte** (`configuracion/transporte.js`; solo si la empresa hace viajes) | **Franjas y precio** (precio por km según la hora de recogida, base, mínimo; no se enciman; margen contra el costo), **recargos** fijos y redondeo, **agenda** (llegar a A, colchón, velocidad, anticipación, plazo para cancelar, zona horaria), **viaje de cortesía**, **simulador km × franja** y **días cerrados**. El margen usa los costos de "Costos de operación" | `transporte_config`, `transporte_franjas`, `transporte_dias_cerrados` | Admin y G1 |
| **Costos de operación** (`configuracion/costos.js`; todas las empresas si su plan lo incluye) | Gastos del mes fijos y variables (de un vehículo o de toda la empresa), precio del litro y velocidad promedio; costo por hora, por km, de 1 km con el tiempo y **por entrega o viaje**; por vehículo estimado (horas y km del mes) y **real** de 30 días (pedidos entregados con el vehículo de su piloto + viajes terminados) | `transporte_costos`, `transporte_config`, `vehiculos` (+ lee `pedidos`, `viajes`, `usuarios`) | Admin y G1 |
| **Cajas** (`configuracion/cajas.js`; si el plan incluye "caja") | Tipos de caja (nombre y monto) y el fondo de caja de cada piloto o conductor (un tipo o monto propio). El cierre se hace en la sección Caja ([caja.md](caja.md)) | `cajas`, `usuarios.caja_id` / `caja_monto` (bloque 24) | Admin y G1 |
| **Planes y funciones** (`configuracion/planes.js`) | Plan de pago de cada empresa (Básico, Profesional, Completo, Personalizado) y casillas de cada función. Lo no marcado desaparece para esa empresa (`funcionHabilitada`). Catálogo y planes: `FUNCIONES_PLAN` y `PLANES` en `empresas/empresas.js` | `empresas.plan`, `empresas.funciones` (bloque 22) | Solo Desarrollador |
| **Pedidos** | Tarifas, descuentos, categorías de mercadería, artículos frecuentes (pesos promedio), tamaños de bulto, motivos de retraso, número de pedido, código de respaldo, **simulador de precios peso × distancia (Python)** | ver [07-actividades-y-mercaderia.md](../07-actividades-y-mercaderia.md) | ver abajo |
| **Actividades** (ventana) | Todas las actividades del sistema (marca las que la empresa activa no realiza). **Nueva actividad**: código (sale del nombre, no se cambia), nombre, descripción, icono, activa, qué usa y "agregarla a la empresa con la que trabajas". Modificar: nombre, descripción, icono, activa, **qué usa** (bodega, punto de partida, tamaños, compra, alcohol). Activa = disponible en todas las tiendas | `actividades` (+ `empresas.actividades` al agregarla) | Solo Desarrollador |
| **Empresas** (abre Tiendas → Empresas con "Nueva empresa") | ID (01, 02...), nombre, actividades (una o varias) y estado de una empresa interna. Ver [empresas-internas.md](empresas-internas.md) | `empresas` | Solo Desarrollador |

**Por empresa:** Vehículos, tarifas, descuentos, categorías y artículos son de la empresa activa (y solo se
ven los de sus actividades de pedidos). Una empresa **solo de viajes** no ve las tarjetas Pedidos ni Slots; ve Transporte. Horarios, slots, tamaños, motivos, número de pedido y código de respaldo son
de todo el sistema. En Tarifas, la opción "General" aparece al crear mientras a alguna actividad de la
empresa le falte su tarifa general (ej. una empresa nueva que no copió la configuración).

"En uso" / "Disponible" del vehículo cambian solos (según los pedidos activos de su piloto);
"Mantenimiento" solo lo cambia una persona.

## Módulo Pedidos: el "motor de catálogos"

Cada lista es una entrada de `CATALOGOS` en `configuracion/pedidos.js`. Con esa descripción se arman
solas su tarjeta, su tabla y su formulario (ventana `#cfgPedDialogo`):

| Propiedad | Para qué |
|---|---|
| `titulo`, `texto`, `icono`, `singular` | Encabezado de la tarjeta y textos |
| `tabla`, `clave`, `select`, `orden`, `filtro(q)` | Cómo se lee de Supabase |
| `columnas: [[título, (fila) => texto o <td>]]` | Columnas de la tabla |
| `campos: [...]` | Formulario: tipos `texto`, `numero`, `opciones`, `si_no`, `casillas`; opciones `requerido`, `soloAlCrear`, `visible(valores)`, `porDefecto`, `min`, `max`, `entero`, `ayuda`... |
| `preparar(valores, fila)` | Objeto a guardar (o texto de error) |
| `agrupar`, `ordenar`, `visible(fila)` | Grupos, orden y filtro de filas |
| `mostrar()`, `puedeCrear()`, `puedeEditar(f)`, `puedeEliminar(f)` | Permisos |
| `sql` | Si falta ese script, solo esta tarjeta lo avisa |

**Para agregar una lista nueva de configuración:** una tabla en SQL + una entrada en `CATALOGOS`.

Permisos del módulo Pedidos: categorías solo Administrador; artículos, tamaños, motivos, número de
pedido y código de respaldo Admin y G1; tarifas y descuentos Admin y G1 los generales, G2 los de su región.

## Dónde tocar

| Quiero... | Dónde |
|---|---|
| Agregar un módulo (página) | Tarjeta en `#cfgInicio` + `<section class="cfg-modulo" data-modulo="x" hidden>` + entrada en `CFG_MODULOS` |
| Agregar un módulo en ventana flotante | Tarjeta + `<dialog>` + `CFG_MODULOS` con `ventana: true` + archivo en `configuracion/` que devuelva `{ abrir, limpiar }` |
| Agregar un tipo de vehículo | `<select id="cfgVehTipo">` + `CFG_TIPOS_VEHICULO` + regla `vehiculos_tipo_valido` (SQL) |
| Valores por defecto de horarios | `CFG_POR_DEFECTO`, `CFG_VENTANA_MIN`, `CFG_DURACION_MIN` |
