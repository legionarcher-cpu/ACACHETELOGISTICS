# Manual de uso · ACACHETE Logistics

Guía paso a paso para usar el sistema: desde la primera vez que se entra hasta la entrega del pedido
y los cierres del día (caja y mercadería).

> **Cómo leer este manual.** La **Parte 1** se hace **una sola vez**, al empezar a usar el sistema (la
> hace el Administrador). La **Parte 2** es **el día a día**, en el orden en que pasan las cosas. La
> **Parte 3** es solo para empresas que **distribuyen productos**. La **Parte 4** son los **cierres**.
> Al final hay una lista rápida por rol y preguntas frecuentes.

---

## Contenido

- [Antes de empezar: quién es quién](#antes-de-empezar-quién-es-quién)
- [Parte 1 · Puesta en marcha (una sola vez)](#parte-1--puesta-en-marcha-una-sola-vez)
- [Parte 2 · El día a día de un pedido](#parte-2--el-día-a-día-de-un-pedido)
- [Parte 3 · Distribuidora: bodega del día y venta en ruta](#parte-3--distribuidora-bodega-del-día-y-venta-en-ruta)
- [Parte 4 · Cierres del día](#parte-4--cierres-del-día)
- [Parte 5 · Avisos, QR y reportes](#parte-5--avisos-qr-y-reportes)
- [Lista rápida por rol](#lista-rápida-por-rol)
- [Preguntas frecuentes y problemas comunes](#preguntas-frecuentes-y-problemas-comunes)

---

## Antes de empezar: quién es quién

| Rol | Quién es | Qué ve |
|---|---|---|
| **Administrador** | Dueño o encargado general de la empresa | Todo |
| **Admin G1** | Administración de todo el país | Todo (casi toda la configuración) |
| **Admin G2** | Encargado de una **región** | Solo su región |
| **Admin G3** | Encargado de **una tienda** | Solo su tienda |
| **Empleado** | Personal de la tienda: registra y despacha pedidos | Solo su tienda |
| **Piloto** | Conductor que entrega | Solo sus pedidos |

**Cómo es un usuario:** el nombre más el número de la empresa al final, todo en minúsculas. Ejemplo:
`jperez01`. La contraseña sí distingue mayúsculas y minúsculas.

**Dónde está cada cosa:**

- **Menú** (izquierda): Inicio, Pedidos, Pilotos, Rutas, Tiendas / Clientes, Reportes, Usuarios, Caja,
  Distribución, Configuración. Lo que tiene un **candado** es porque tu rol no lo usa.
- **Campana** (arriba): avisos y cosas por aprobar.
- **Escanear QR** (arriba): abre la cámara para leer cualquier QR del sistema.
- **Tu foto o tus iniciales** (arriba): Mi perfil, cambiar de empresa (solo el Desarrollador) y Salir.

> Para usar la cámara y el GPS, la página debe abrirse con **https** (o desde la computadora del
> sistema). El navegador pide permiso la primera vez: hay que presionar **Permitir**.

---

## Parte 1 · Puesta en marcha (una sola vez)

La hace el **Administrador**, en este orden. Algunas partes también las puede hacer el Admin G1.

### Paso 1 · Entrar por primera vez

1. Abre el sistema y escribe tu **usuario** y tu **contraseña**. Presiona **Ingresar**.
2. Si entras con el usuario `admin`, **cambia su contraseña** en cuanto entres (Usuarios → lápiz).
3. En **Mi perfil** (menú de tu foto) puedes poner tu foto. Se ve en el encabezado y en los avisos.

### Paso 2 · Regiones y tiendas

Menú **Tiendas**.

1. **Regiones** (opcional): botón **Regiones** → crea cada región con un código de 3 letras y su nombre
   (ejemplo: `NOR` · Norte). Una tienda puede quedar **sin región**.
2. **Nueva tienda**: región (o "Sin región"), **código** (libre: letras, números y guion, por ejemplo
   `NOR-001` o `SUC-CENTRO`), nombre, dirección, teléfono y estado.
3. Casilla **"Tiene rutas (envía pedidos)"**: márcala si la tienda despacha pedidos. Una tienda **sin rutas**
   no aparece para crear pedidos ni rutas.

### Paso 3 · Ubicación de la tienda y QR de marcas

Esto se hace **estando físicamente en cada tienda**, desde su **Inicio**:

1. En la tarjeta **"QR de marcas de la tienda"** presiona **Usar mi ubicación actual** y confirma que estás
   en la tienda. Sin esa ubicación los pilotos **no pueden marcar** con el QR de la tienda.
2. Presiona **Ver, descargar o imprimir**, imprime el QR y **pégalo en un lugar visible** de la tienda. Este
   QR **no cambia**. Si alguien lo fotografía o se pierde, usa **Generar uno nuevo** (el impreso deja de
   servir).
3. (Administrador y G1) **Distancia máxima para marcar**: cuántos metros alrededor de la tienda se acepta
   la marca (150 m por defecto).

### Paso 4 · Vehículos

**Configuración → Vehículos** → **Agregar**: placa, tipo (camión, pick-up, panel, moto, automóvil,
microbús), marca y estado. El estado "En uso" o "Disponible" cambia solo; "Mantenimiento" lo pones tú.

### Paso 5 · Usuarios

Menú **Usuarios** → **Nuevo usuario**.

1. Nombre, teléfono, **rol**, tienda (o región para el Admin G2) y contraseña.
2. En **Usuario** escribe solo el nombre (`jperez`). El sistema le agrega el número de la empresa y abajo
   muestra cómo iniciará sesión ("Inicia sesión como **jperez01**").
3. **Pilotos:** asígnales su **vehículo** (o regístralo ahí mismo). **Multitienda** = puede trabajar en
   otras tiendas de su región.
4. Foto (opcional): ayuda a que la tienda reconozca al piloto.

> Los empleados que crea un **Admin G3** quedan **pendientes** hasta que los apruebe el G2, el G1 o el
> Administrador (le llega a la campana). Mientras tanto no pueden entrar.

### Paso 6 · Horarios de los pilotos y slots de despacho

**Configuración → Horarios** (los horarios en que el piloto **marca**):

- Cuántos horarios hay al día y cuántos pedidos puede llevar cada uno.
- Para cada horario: **desde** cuándo se puede marcar, **hora de inicio** (hasta ahí es a tiempo) y
  **termina** (después de la hora de inicio y antes de que termine es **marca tardía**, con motivo).
- Se puede poner un horario distinto por día de la semana, o por región o tienda.

**Configuración → Slots** (los horarios en que **salen los pedidos** de la tienda): cantidad de slots y
las horas de cada uno. El empleado elige el slot al registrar el pedido.

### Paso 7 · Cobro del envío y mercadería

**Configuración → Pedidos**:

- **Tarifas**: cuánto se cobra por el envío (cargo fijo, mínimo, precio por kg y por km, envío gratis
  desde cierto monto). Hay una tarifa **general** por actividad y se pueden hacer tarifas por región o por
  tienda. Debajo del formulario se lee la regla en palabras.
- **Descuentos**: los que el empleado puede elegir (máximo uno por pedido).
- **Categorías de mercadería** (solo Administrador): lo que se marca en cada pedido (abarrotes, línea
  blanca, cajas, documentos...).
- **Artículos frecuentes**: el peso promedio de cada artículo (al elegirlo en el pedido el peso se llena solo).
- Número de pedido (automático o a mano) y código de respaldo de 4 dígitos.

### Paso 8 · Artículos de venta y precios (si vendes productos)

**Configuración → Artículos de venta y precios** → **Nuevo artículo**: artículo, categoría, presentación
(Unidad, Caja...), **unidad**, **cantidad que trae**, **costo** (opcional, para ver el margen) y **precio de
venta con IVA** (13 % por defecto, se puede cambiar). Ese precio es el que ven los usuarios al hacer un pedido.

### Paso 9 · Caja de los pilotos

**Configuración → Cajas**: crea tipos de caja (por ejemplo "Caja básica" ₡50 000) y asigna a cada piloto su
**fondo**: el dinero con el que sale para dar vuelto.

### Paso 10 · Rutas y asignación de pilotos

Menú **Rutas y asignaciones** (Administrador, G1 y G2):

1. Elige la tienda y la semana.
2. **Nueva ruta**: nombre y, si quieres, para qué actividad es.
3. Asigna pilotos **por día** (el **+** de cada día) o **por toda la semana**. Una ruta puede tener varios
   pilotos el mismo día.
4. Debajo está el **QR de hoy** de cada piloto (también lo ve él en su Inicio).

Al registrar un pedido con ruta, **el piloto se pone solo** según esta asignación.

### Paso 11 · Clientes

Menú **Clientes** → **Nuevo cliente**: nombre, apellidos, **teléfono** (es la clave del cliente), correo,
dirección, **ubicación** (coordenadas o enlace de Google Maps) y sus tiendas con su ruta de entrega.

> No hace falta cargarlos todos antes: al registrar un pedido con un cliente nuevo, **se agrega solo** a
> Clientes con su dirección y su punto en el mapa.

---

## Parte 2 · El día a día de un pedido

El recorrido completo de un pedido:

```
Registrado → Asignado → Alistando → Listo para despachar
   → Cargado → En ruta → Entregando → Entregado
Si el piloto no lo cargó al salir: "No salió a ruta"
Si no se pudo entregar: "No entregado"
```

### Paso 1 · El piloto llega y marca su horario

El piloto marca al llegar a la tienda. Hay **tres formas** (usa la que tu empresa prefiera):

| Forma | Quién escanea | Qué pasa |
|---|---|---|
| **A. QR fijo de la tienda** (el impreso) | El **piloto**, con **Escanear QR de la tienda** en su Inicio | Se marca solo con la hora del sistema, **si su GPS dice que está en la tienda** |
| **B. "Mi QR del día" del piloto** | La **tienda**, con **Escanear QR** (arriba) | Sale la foto del piloto; si es él, presiona **Validar y marcar**: queda validado y marcado |
| **C. QR del mes** (Tiendas) | El piloto, ya validado ese día | Marca su horario |

- **Marca tardía:** si pasó la hora de inicio, el sistema pide el **motivo** (por ejemplo "tráfico en la
  ruta 1"). Sin motivo no se marca. El motivo le llega a la tienda y al G2.
- Al marcar, la tienda recibe el aviso **"Piloto en tienda: despachar pedidos"** con los números de sus pedidos.
- El piloto ve en su Inicio **Mis marcas de hoy**: qué horario ya marcó, cuál sigue y a qué hora se habilita.

### Paso 2 · Registrar el pedido (Empleado, G3 o superior)

Menú **Pedidos** → **Nuevo pedido** (o "Crear pedido" en el Inicio).

1. **Actividad y tienda.** Si la empresa tiene varias actividades (entregas de tienda, encomiendas,
   distribución...), elige la que corresponde.
2. **Cliente.** Escribe su **teléfono o correo**: si ya existe, sus datos y su punto de entrega se llenan
   solos. Si no existe, escribe nombre y teléfono (se guardará solo al registrar).
3. **Entrega.** Dirección, quién recibe (el cliente o un autorizado), fecha, **slot de despacho** y ruta.
   En el **mapa A → B**, A es la tienda y B el lugar de entrega: se pueden mover los puntos, pegar un enlace
   de Google Maps o tocar el mapa. Se ven los km y los minutos.
4. **Mercadería.** Marca las categorías y llena sus datos (cajas, artículos con su peso, bultos...). Si la
   actividad vende **productos**, eliges la lista de precios y los productos con su cantidad (cada uno muestra
   su precio).
5. **Cobro.** Se calcula solo con la tarifa. Elige el descuento (si hay), qué cobra el piloto (el envío y/o la
   compra), la forma de pago y "paga con" para el vuelto.
6. **Registrar.** El pedido recibe su número (`P-000123`), su **código de entrega de 4 dígitos** y su **QR**.
   Puedes enviarlo al cliente por WhatsApp.

> **Pedidos cercanos:** si la entrega queda cerca de otro pedido del día, el formulario lo avisa para
> aprovechar el mismo viaje.

### Paso 3 · Asignar piloto (si no se asignó solo) · Admin G2 o superior

Los pedidos **sin piloto** aparecen en **Pendientes** del Inicio y en la campana del G2. Entra al pedido →
**Asignar piloto y horario**. El G3 y el Empleado no asignan: usan **Solicitar reasignación** y le llega al G2.

### Paso 4 · Alistar y dejar listo para despachar (tienda)

Dentro del pedido (Empleado, G3 o superior):

1. **Alistando**: se está preparando la mercadería.
2. **Listo para despachar**: confirma el **slot**. Desde aquí el **piloto ya ve el pedido** y le llega el
   aviso. **El piloto solo puede tocar los pedidos que estén "Listo para despachar".**

### Paso 5 · El piloto carga cada pedido

En el Inicio del piloto, **Mi ruta**, cada pedido listo tiene el botón **Cargar**:

1. Toma **foto(s)** de lo que recibe (bultos, cajas).
2. Escribe **cuántos bultos** recibió.
3. Si lleva **efectivo** (por ejemplo, para dar vuelto), escribe cuánto.
4. **Guardar**: el pedido queda **Cargado**.

> La tienda también puede **aprobar la salida** de un pedido escaneando su QR dentro del pedido.

### Paso 6 · Salir a ruta (por slot)

En **Mi ruta** del piloto hay un renglón por **slot** con el botón **Salir a ruta**:

- Pasa a **En ruta** todos los pedidos **cargados** de ese slot.
- Los pedidos listos de ese slot que **no se cargaron** quedan como **No salió a ruta**; el G2 recibe el
  aviso para **reprogramarlos**.
- Mientras está en ruta, el celular del piloto comparte su ubicación y se ve en el mapa del Inicio.

### Paso 7 · Entregar

En **Mi ruta**, los pedidos salen **ordenados del más cercano al más lejano**; el primero dice **Siguiente**.

1. Al llegar donde el cliente, toca **Escanear QR** y escanea el **QR del pedido** que te muestra el cliente:
   el pedido pasa a **Entregando** (solo uno a la vez). Si el QR no se puede leer, escribe el **código de
   entrega** que te dice el cliente. Sin escanear no se puede marcar "Entregado". Arriba están los enlaces
   **Ir con Google Maps / Waze**.
2. **Cerrar entrega** → dentro del pedido:
   - **Entregado**: si hay que cobrar, elige **cómo pagó** el cliente (Efectivo, SINPE Móvil o Tarjeta). Si
     lleva **alcohol**, confirma la **mayoría de edad**. Si son **productos**, escribe **cuánto recibió de
     cada uno**; si es menos, el **motivo** es obligatorio (queda "Entregado con incidencia"). Con **Cámara**
     (una foto por vez) o **Galería** (varias a la vez) guarda hasta 6 fotos de lo que entregas (y de dónde lo
     dejas); se achican solas a unos 50-150 KB y quedan en el pedido como prueba de entrega.
     Si cobraste, toma también la foto del **comprobante de pago**: el **efectivo** recibido, el **voucher** de
     la tarjeta o el **comprobante de SINPE** del cliente (con él la tienda verifica el SINPE en la caja).
   - **No entregado**: escribe el **motivo** (cliente ausente, dirección errada...). Le llega al G2. Se puede
     marcar también sin escanear (desde "En ruta"), por ejemplo si el cliente no estaba.
3. El **código de entrega de 4 dígitos** (o el QR del pedido) sirve para confirmar que la persona que
   recibe es la correcta.

### Paso 8 · Lo que no se entregó

| Situación | Quién | Qué hace |
|---|---|---|
| **No entregado** | Admin G2 o superior | **Reprogramar** (nueva fecha y piloto), **Cancelar** (con motivo) o **Devuelto** |
| **No salió a ruta** | Admin G2 o superior | **Reprogramar** |
| Cancelar antes de salir | Admin G3 o superior | **Cancelar** con motivo (sale en Reportes) |

Cada cambio queda en la **línea de tiempo** del pedido (quién, cuándo y por qué).

---

## Parte 3 · Distribuidora: bodega del día y venta en ruta

Solo si tu empresa distribuye productos (menú **Distribución**).

### Paso 1 · Abrir la bodega del día (Admin G3 o superior)

**Distribución → Bodega del día**: elige tienda, **ruta** y fecha → **Abrir bodega**.

### Paso 2 · Llenarla y cargar a los pilotos

1. **Ingresar producto**: lo que hay ese día para esa ruta.
2. **Cargar a piloto**: lo que se lleva cada piloto. Se puede repartir entre varios. **Sugerir según sus
   pedidos** pone lo que suman sus pedidos del día; se puede agregar más para vender en ruta. No deja cargar más
   de lo que hay.
3. Si hace falta: **Pasar entre pilotos** o **Ajuste** (con motivo).

### Paso 3 · En la calle (piloto)

- **Pedidos de preventa:** se entregan como en la Parte 2. Al marcar **Entregado** se escribe cuánto recibió el
  cliente de cada producto.
- **Venta en ruta:** **Distribución → Mi carga → Venta en ruta**: cliente (o de contado), productos de lo que
  lleva y cómo pagó. Queda como un pedido entregado y entra en su caja.

### Paso 4 · Devolución y cierre de mercadería del piloto

1. **Devolución de piloto**: lo que trae de vuelta, **bueno** o **dañado / vencido** ("Todo lo que lleva" lo sugiere).
2. **Cerrar la mercadería del piloto**: el sistema cuadra **cargado = entregado + vendido + devuelto +
   faltante**, en unidades y en dinero. Lo que no cuadra queda como **faltante**: aviso al G3, al G2 y al
   piloto, y sale en el reporte de faltantes.
3. Después de cerrar la mercadería, en su fila aparece el botón de **caja fuerte** para ir a su **Caja**.

### Paso 5 · Cerrar la bodega

Con todos los pilotos cerrados → **Cerrar bodega**: lo que sobra vuelve a la tienda, la bodega queda **en 0**
y se guarda el **resumen del día**.

---

## Parte 4 · Cierres del día

### Cierre de caja de cada piloto (Admin G3 o superior)

Menú **Caja** → elige al piloto.

1. Se ven sus **cobros sin cerrar**: pedidos entregados y ventas con monto, con su forma de pago (se puede
   corregir).
2. **SINPE**: márcalo **Verificado** cuando lo veas en el banco; compáralo con **Ver comprobante** (la foto que
   tomó el piloto). Los no verificados quedan para el siguiente cierre. La **tarjeta** entra directo, sin verificar.
3. **Arqueo**: el efectivo que debe entregar es **fondo + efectivo cobrado**. Escribe el **efectivo contado**
   y el sistema dice en vivo si **cuadra exacto**, hay **sobrante** o **faltante**. Si no cuadra, el **motivo**
   es obligatorio (ej. "vuelto de más al cliente del pedido P-000123").
4. **Cerrar caja**: confirma el resumen. El cierre queda guardado y no se borra (se ven los últimos 20).
5. **Revisar cierres**: en **Reportes → Cajas** se ven todos los cierres con su faltante o sobrante y el motivo;
   al tocar uno se abre su detalle con los cobros que incluyó.

> El piloto puede ver su propia caja, pero no cerrarla.

### Cierre de mercadería y bodega (distribuidora)

Ver la [Parte 3](#parte-3--distribuidora-bodega-del-día-y-venta-en-ruta), pasos 4 y 5. El orden recomendado al
final del día es:

```
Devolución del piloto → Cerrar su mercadería → Cerrar su caja → (todos) → Cerrar la bodega
```

### Revisión del día

- **Inicio**: cuántos pedidos hubo, cuántos se entregaron, los no entregados y los pendientes.
- **Reportes**: por fechas, tienda y actividad; exportar a Excel o PDF (según el plan). La pestaña **Cajas**
  muestra los cierres de caja con faltantes, sobrantes y sus motivos.
- **Distribución → Historial y faltantes**: faltantes por piloto y producto, cierres y resumen de cada bodega.

---

## Parte 5 · Avisos, QR y reportes

### La campana

Los avisos llegan solos según el rol. Los más comunes:

| Aviso | A quién |
|---|---|
| Piloto en tienda: despachar pedidos | Tienda (G3 y Empleados) |
| Pedido nuevo sin piloto | Admin G2 |
| Listo para despachar | El piloto |
| Piloto no entregó / pedido no salió a ruta | Admin G2 (reprogramar) y G3 |
| Usuarios o clientes por aprobar | Quien aprueba |
| Faltante de mercadería | G3, G2 y el piloto |

Los avisos "pendientes" se cierran solos cuando alguien resuelve el asunto.

### Los QR del sistema

| QR | Para qué |
|---|---|
| **QR del pedido** | Al escanearlo se ve toda la información del pedido |
| **QR fijo de la tienda** (Inicio de la tienda) | El piloto lo escanea para marcar estando en la tienda |
| **Mi QR del día** (Inicio del piloto) | La tienda lo escanea para **Validar y marcar** al piloto |
| **QR del mes** (Tiendas) | Forma anterior de marcar (el piloto, ya validado) |

---

## Lista rápida por rol

**Administrador / Admin G1**
- Puesta en marcha (Parte 1).
- Revisar Inicio: pendientes, pedidos sin piloto, hoy por tienda.
- Reportes y configuración.

**Admin G2 (su región)**
- Asignar pilotos a los pedidos sin piloto.
- Rutas y asignaciones de la semana.
- Reprogramar o cancelar los **No entregados** y **No salió a ruta**.
- Aprobar usuarios que crea el G3.

**Admin G3 (su tienda)**
- Validar y marcar a los pilotos (o tener el QR fijo impreso).
- Registrar, alistar y dejar **Listo para despachar**.
- Abrir y cerrar la bodega del día (distribuidora).
- Cerrar la mercadería y la **caja** de cada piloto.

**Empleado (su tienda)**
- Registrar pedidos y clientes.
- **Alistando** → **Listo para despachar**.
- Atender el aviso "Piloto en tienda: despachar pedidos".

**Piloto**
1. Al llegar: **marcar** (QR de la tienda o "Mi QR del día").
2. **Cargar** cada pedido listo (foto, bultos, efectivo).
3. **Salir a ruta** por slot.
4. **Escanear QR** del pedido (o el código del cliente) → **Entregado** (cómo pagó y fotos) o **No entregado** (motivo).
5. Al terminar: devolver la mercadería (distribuidora) y entregar el efectivo para el **cierre de caja**.

---

## Preguntas frecuentes y problemas comunes

**No puedo entrar.**
Revisa el usuario (termina en el número de la empresa, por ejemplo `jperez01`) y las mayúsculas de la
contraseña. Si te crearon hace poco, puede que todavía no te aprueben.

**El piloto no puede marcar con el QR de la tienda.**
- "La tienda no tiene su ubicación guardada": alguien en la tienda debe presionar **Usar mi ubicación actual**
  en el Inicio.
- "Estás a X m de la tienda": tiene que estar dentro de la tienda. Si el GPS es impreciso, que salga a un lugar
  abierto o active la **ubicación precisa** del celular.
- "No hay permiso para la ubicación": en el navegador, permitir la ubicación para esta página.
- "Este QR ya no sirve": se generó uno nuevo; escanea el que está impreso ahora.
- "Todavía no se puede marcar": aún no se habilita el horario; espera la hora indicada.

**El piloto no ve un pedido.**
El pedido debe estar **Listo para despachar** y asignado a él.

**La cámara no abre.**
La página debe abrirse con **https** y hay que dar permiso a la cámara. Sin cámara, dentro del pedido se puede
escribir su número.

**Un pedido quedó "No salió a ruta".**
El piloto salió sin cargarlo. El G2 lo **reprograma** (nueva fecha o piloto).

**La caja no cuadra.**
Revisa que cada pedido tenga la **forma de pago** correcta y que los SINPE o tarjetas estén **verificados**. La
diferencia queda registrada en el cierre con sus notas.

**No veo una sección del menú.**
Tiene candado o no aparece porque tu rol no la usa o el plan de la empresa no la incluye. Pregunta al
Administrador.

**Veo datos viejos después de una actualización.**
Recarga la página con **Ctrl + F5** (en el celular, cierra y vuelve a abrir el navegador).
