# Caja de pilotos y conductores (`#caja`)

Basada en el cierre de caja de SISCED. Aparece si el plan de la empresa incluye **"Caja de pilotos y conductores"**
(Configuración → Planes y funciones). `#caja?piloto=8` abre directo ese piloto.

| Archivo | Qué tiene |
|---|---|
| `secciones/caja.html`, `js/secciones/caja.js`, `css/secciones/caja.css` | Sección (ids y clases `caj`) |
| `js/secciones/configuracion/cajas.js` | Configuración → Cajas (tipos de caja y fondo de cada piloto) |
| Tablas | `cajas`, `cierres_caja`, `usuarios.caja_id` / `caja_monto`, `pedidos.cobro_forma` / `cierre_id`, `viajes.cobro_forma` / `cierre_id` |
| SQL | `sql/01` **bloque 24** (en `sql/00`, sección 17). Función `caja_cerrar` |

## Cómo funciona

1. **Fondo de caja** (Configuración → Cajas): tipos de caja con nombre y monto ("Caja básica" ₡50 000) o un monto propio
   para cada piloto o conductor. Es el dinero con el que sale para dar vuelto.
2. **Cobro al entregar**: al marcar **Entregado** un pedido con monto a cobrar, el piloto elige cómo pagó el cliente
   (Efectivo, SINPE Móvil o Tarjeta → `pedidos.cobro_forma`). Los viajes terminados cuentan como efectivo (se puede
   cambiar en la caja).
3. **Cobros sin cerrar**: pedidos entregados (`total_cobrar` > 0) y viajes terminados (`total` > 0) del piloto que todavía
   no tienen `cierre_id`. Quien cierra puede corregir la forma de pago.
4. **SINPE y tarjeta**: se marcan **Verificado** al verlos en el banco. Solo los verificados entran al cierre; los demás
   quedan para el siguiente.
5. **Arqueo**: efectivo a entregar = **fondo + efectivo cobrado**. Se escribe el efectivo contado y se ve la diferencia en
   vivo (*Cuadra exacto*, *Sobrante* o *Faltante*). Notas.
6. **Cerrar caja**: confirma un resumen y la base (`caja_cerrar`) hace todo o nada. Revisa quién cierra, toma los montos de
   los pedidos y viajes (no de la página), guarda el cierre (fondo, efectivo, SINPE, tarjeta, contado, diferencia, cantidad,
   notas, quién) y les pone `cierre_id`. Los cierres no se borran.
7. **Cierres anteriores**: los últimos 20 del piloto.

| Rol | Puede |
|---|---|
| Administrador / G1 | Todos los pilotos; Configuración → Cajas |
| Admin G2 | Cerrar los de su región |
| Admin G3 | Cerrar los de su tienda |
| Piloto / conductor | Ver su propia caja (sin arqueo ni cierre) |
| Empleado / Cliente | Sin acceso |

## Pendiente (ideas)

- Foto del comprobante SINPE al entregar (como en SISCED).
- Ver el detalle de un cierre anterior y reimprimirlo.
