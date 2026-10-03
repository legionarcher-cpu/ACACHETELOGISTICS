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
| **Vehículos** | Resumen por estado; lista con búsqueda; agregar/modificar/eliminar (placa, **tipo**: camión, pick-up, panel, moto; marca; estado) | `vehiculos` | Admin y G1; G2 los de pilotos de su región (no agrega) |
| **Pedidos** | Tarifas, descuentos, categorías de mercadería, artículos frecuentes (pesos promedio), tamaños de bulto, motivos de retraso, número de pedido, código de respaldo, **simulador de precios peso × distancia (Python)** | ver [07-actividades-y-mercaderia.md](../07-actividades-y-mercaderia.md) | ver abajo |
| **Actividades** (ventana) | Nombre, descripción, activa, **qué usa** (bodega, punto de partida, tamaños, compra, alcohol). Activa = disponible en todas las tiendas | `actividades` | Solo Desarrollador |
| **Empresas** (abre Tiendas → Empresas con "Nueva empresa") | ID (01, 02...), nombre, actividades (una o varias) y estado de una empresa interna. Ver [empresas.md](empresas.md) | `empresas` | Solo Desarrollador |

**Por empresa:** Vehículos, tarifas, descuentos, categorías y artículos son de la empresa activa (y solo se
ven los de sus actividades). Horarios, slots, tamaños, motivos, número de pedido y código de respaldo son
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
