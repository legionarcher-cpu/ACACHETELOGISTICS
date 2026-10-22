# 13. Registro de cambios

Lo más nuevo, arriba. Cada entrada dice qué SQL hay que ejecutar.

## 2026-10-21 · El aviso de soporte pasa a la campana

SQL: ninguno. Ctrl+F5 (versión `20261021e`).

- El aviso del Desarrollador ("Puesta en marcha…", "tiene Admin TI…", "Modo soporte… vence a las…") ya no es una franja
  flotante debajo del encabezado, que tapaba información según la resolución de la pantalla. Ahora es un cuadro fijo
  arriba de la lista de la **campana**, con el botón "Usar llave" (`js/soporte.js`, `#soporteAviso` en `app.html`).
- Mientras dura la llave, la campana lleva un **punto naranja**. Al usar la llave y al vencer sale un aviso emergente
  de unos segundos.

## 2026-10-21 · Estados del pedido solo por la base, y las horas al historial (Etapa 2D)

SQL: **instalación desde cero** con `sql/instalacion/` (00 a 12; se pueden hacer juntas 2A a 2D). Pruebas:
[11-pruebas.md](11-pruebas.md), "Etapa 2D".

- **Funciones nuevas** (`04_rutas_y_pedidos.sql`), que revisan quién puede (función del usuario y su alcance) y que el
  pedido siga en el estado que se veía, y escriben el historial:
  - `pedido_estado`: todos los botones de estado del pedido (En bodega, Alistando, Listo para despachar, aprobar la
    salida escaneando, Entregado, No entregado, Devuelto, Cancelado). "Entregado" guarda además el cierre en
    `pedido_entregas` y exige la forma de cobro y la mayoría de edad.
  - `pedido_asignar`: asignar piloto, fecha, horario y ruta, o reprogramar.
  - `pedidos_liberar_piloto`: Usuarios, cuando un piloto deja una tienda.
- **La página ya no cambia el estado directo** (`pedidos_revisar_cambio`): ni el estado, piloto, fecha, horario, slot,
  ruta, carga, cobro o caja. Sí los datos del pedido. Lo que agrega al historial va a nombre de quien está conectado y
  no puede ser un cambio de estado.
- **Red de seguridad:** si algún cambio de estado no quedó en el historial, la base lo anota al terminar.
- **Horas de cada paso:** se quitan de `pedidos` las columnas `alistando_en`, `listo_en`, `recibido_ruta_en`,
  `cargado_en`, `salida_en`, `entregando_en` y `finalizado_en`. Salen del historial con la vista nueva `pedidos_pasos`;
  `pedidos_tiempos` y `slots_carga` la usan. La Caja toma la fecha de la entrega de `pedido_entregas`.
- De paso: "Cargar con foto" también respeta la autorización pendiente de un pedido sin bodega del día.

## 2026-10-21 · Llave de soporte del Admin TI y límite del Desarrollador (Etapa 2C)

SQL: **instalación desde cero** con `sql/instalacion/` (00 a 12; se pueden hacer juntas 2A, 2B y 2C). Pruebas:
[11-pruebas.md](11-pruebas.md), "Etapa 2C".

- **Admin TI**: casilla del usuario (columna `usuarios.admin_ti`), no un rol. La pone o la quita solo el Administrador
  de la empresa; el Desarrollador la puede poner, pero no quitarla. No la pueden tener Pilotos ni clientes.
- **Lo que ve el Desarrollador** (reglas de `11_acceso_web.sql` con `soporte_empresas`):
  - siempre: la configuración y los usuarios de todas las empresas (sin las cuentas de los clientes), el plan y si la
    empresa está activa;
  - **puesta en marcha** (la empresa no tiene Admin TI): además cambia su configuración, tiendas y usuarios;
  - con la **llave**: ve los clientes, pedidos, viajes, inventario, precios, cajas y costos; con "Ver y corregir"
    también los cambia (y la configuración). Las funciones que lo dejaban pasar ahora piden la llave (`soporte_exigir`).
- **La llave** (Configuración → Soporte, `js/secciones/configuracion/soporte.js`): la crea el Admin TI o el
  Administrador; dura 1, 4 o 24 horas; "Solo ver" o "Ver y corregir"; es un código como `K7M2-Q9XP` que se ve una vez y
  se guarda cifrado. Una nueva anula la anterior; se puede anular. Cuando el Desarrollador entra con ella se avisa al
  Administrador y al Admin TI. Con 5 códigos equivocados en 30 minutos se anula y se avisa.
- **Franja de soporte** (`js/soporte.js`, solo el Desarrollador): dice en qué modo está con la empresa activa y tiene
  el botón "Usar llave". (Desde el mismo día está dentro de la campana; ver la entrada de arriba.)
- **Bitácora** (`soporte_bitacora`): llaves creadas, usadas y anuladas, códigos equivocados, pantallas que abrió el
  Desarrollador con la llave y todo lo que creó, cambió o borró (un trigger en todas las tablas). Nadie la cambia ni la
  borra.
- **Emergencia sin llave** (Usuarios, solo el Desarrollador): bloquear, desbloquear y cerrar las sesiones de un
  usuario (`soporte_emergencia`). Queda en la bitácora y avisa al Administrador y al Admin TI.
- De paso: `piloto_salir_ruta` revisa que el piloto sea de una tienda que administra quien lo hace (antes, cualquier
  administrador podía mandar el piloto de otra empresa); Usuarios avisa si la base no dejó guardar un cambio.
- Pendiente: forzar el cambio de contraseña y "ver errores" (del diseño) no se hicieron; los cambios de estado del
  pedido por funciones (2D).

## 2026-10-21 · Alcance por región y tienda, y funciones de cada usuario en la base (Etapa 2B)

SQL: **instalación desde cero** con `sql/instalacion/` (00 a 12, igual que la 2A; se pueden hacer juntas). Pruebas:
[11-pruebas.md](11-pruebas.md), "Etapa 2B".

- **Módulos y funciones en tablas:**
  - `funciones` es el catálogo, con los roles que traen cada módulo y función. Es la única lista: la página la lee de
    la base y ya no está repetida en `js/sesion.js`.
  - `usuario_funciones` guarda lo que se le dio o se le quitó a cada usuario.
  - Se quita la columna `usuarios.permisos` y la copia `funcion_del_rol`.
  - La página lee lo suyo con `mis_funciones()` y el formulario de Usuarios guarda con `usuario_guardar_funciones`,
    que revisa quién puede.
- **Alcance en la base (RLS):**
  - **Pedidos** (con su historial, artículos, entregas y fotos) y **cierres de caja**: Administrador y G1 toda la
    empresa; G2 su región; G3 y Empleado su tienda, más los pilotos de su tienda; Piloto solo los suyos.
  - **Viajes**: el conductor ve solo los suyos.
  - Clientes y usuarios siguen viéndose en toda la empresa. Así se encuentra al cliente aunque esté en otra tienda, y
    llegan los avisos a los administradores.
- **Escribir según la función:**
  - tarifas, horarios, ajustes, transporte, costos, cajas, categorías y artículos: "Cambiar la configuración";
  - el G2 cambia tarifas, descuentos y pedidos por horario de su región;
  - productos y precios: "Modificar productos y precios";
  - rutas: "Crear rutas y asignar pilotos";
  - regiones: "Crear y modificar tiendas y regiones";
  - recolecciones: "Atender" (bloqueos y horario) y "Cobrar" (tarifas y cobros).
- Pendiente: la llave de soporte del Admin TI (2C) y los cambios de estado del pedido por funciones (2D).

## 2026-10-21 · Inicio de sesión real y candado por empresa (Etapa 2A)

SQL: **instalación desde cero otra vez** con `sql/instalacion/` (00 a 12, en orden; los datos siguen siendo de prueba).
En Supabase: Authentication → Sign In / Providers → **desactivar "Allow new users to sign up"** (los accesos los crea la
base). Pruebas: [11-pruebas.md](11-pruebas.md), "Etapa 2A".

- **Supabase Auth**: cada usuario entra con su usuario de siempre (`jperez01`); por detrás la base le crea un acceso con
  un correo interno que nadie ve (`jperez01@acachete.interno`). La contraseña vive solo en Supabase Auth:
  `usuarios.clave` queda siempre vacía (es un buzón: la página escribe ahí la contraseña nueva y la base la pasa a Auth).
  Se quitan `iniciar_sesion`, `cifrar_clave` y `clave_cifrada`. Cerrar sesión cierra también la de Supabase; si la
  sesión vence, la página vuelve al login.
- **Reglas RLS reales** (`11_acceso_web.sql`) en vez de las TEMPORAL abiertas a la clave pública:
  - Sin sesión no se lee ni se cambia nada. Solo quedan el registro de clientes, la ubicación compartida por enlace y
    la lista de actividades.
  - Cada empresa ve y cambia solo lo suyo; el Desarrollador ve todas.
  - El rol **cliente** solo ve lo suyo: su ficha, sus viajes (con el nombre y el teléfono del conductor), sus envíos,
    sus recolecciones y sus cobros, más los catálogos para pedir.
  - Las tablas de movimientos se cambian solo con las funciones de cada módulo.
- **Funciones**: todas las que reciben el usuario (`usuario_activo`) confirman que es el de la sesión: ya nadie puede
  actuar en nombre de otro. Las de marcas y QR, ubicación del piloto, visitas, horas de viajes y recolecciones, y
  bodega revisan además la empresa. Sin sesión ya no se puede ejecutar ninguna función (antes, todas).
- **Usuarios**: la base revisa quién cambia a quién (`usuarios_revisar_cambio`), con las mismas reglas de la página:
  - nadie se cambia su propio rol, tienda ni permisos;
  - G1 maneja Empleados y Pilotos; G2, los de su región; G3 y Empleado, Empleados de su tienda, que quedan por aprobar.
- **Ajustes por empresa**: `configuracion` lleva `empresa_id` (número de pedido, código de respaldo, radio de marca); se
  copian al crear una empresa.
- **Avisos que manda la base**:
  - la solicitud de envío del cliente avisa sola a quien la aprueba, y se cierra sola si el cliente la cancela;
  - "cerrar los avisos pendientes" es la función `resolver_pendientes`;
  - cada usuario solo marca sus propios avisos.
- Solo el Desarrollador cambia las **actividades** y los **tamaños de bulto**, que son de todo el sistema, y las
  **empresas**.
- **Pendiente** (Etapa 2B y siguientes):
  - que G2, G3, Empleado y Piloto vean solo su región o su tienda también en la base;
  - las funciones de cada usuario en tablas;
  - permisos por función en cada tabla;
  - la llave de soporte del Admin TI;
  - las horas de cada paso del pedido en el historial.

## 2026-10-20 · Base reconstruida y ordenada (Etapa 1)

SQL: **instalación desde cero** con `sql/instalacion/` (00 a 12, en orden; `00_reiniciar_base.sql` borra todo: los
datos eran de prueba). Guía: [`sql/LEEME.md`](../sql/LEEME.md). Los scripts viejos (`00`, `01` con los bloques 0 a
46, `por_funcion/`, `dividir_sql`, `vaciar_base_datos.sql`) pasan a `sql/historial/` y ya no se ejecutan. Desde
ahora cada cambio es un archivo con fecha en `sql/actualizaciones/` (y se actualiza su módulo de instalación).

- **Un archivo por módulo**: cada tabla se crea una sola vez con todas sus columnas y cada función en su versión
  final (antes: 61 tablas parchadas con 120 `alter table` y funciones reescritas hasta 4 veces).
- **Horarios en una sola estructura** (por empresa): `horarios_dias`, `horarios` y `horarios_capacidad` con `tipo`
  `turno` (horarios del piloto) o `despacho` (slots). Reemplazan `marcas_horario`, `horario_dias`, `marcas_dia`,
  `capacidad_marcas`, `slots_horario`, `slot_dias`, `slots_dia` y las claves `cantidad_marcas`, `pedidos_por_marca`
  y `cantidad_slots` de `configuracion`. `marcas_del_dia` y `slots_del_dia` reciben la empresa.
- **Nombres claros**: `usa_recoleccion` → `usa_punto_partida`, `usa_agenda_recoleccion` → `usa_recolecciones`,
  `pedidos.direccion_recoleccion` → `direccion_partida`, `pedido_solicitudes.recoleccion_*` → `partida_*`,
  `transporte_costos` → `costos_operacion` (sin vehículo) y el margen y los trabajos al mes en `costos_config`.
  En SQL: `viaje_usuario` → `usuario_activo`, `dist_puede_tienda` → `puede_tienda`, nueva `nombre_completo`.
- **Quitado**: `tiendas_actividades` (no se usaba), el QR de marcas mensual (`qr_marcas`, `qr_marca_mes`,
  `marcar_por_qr`: queda el QR fijo con GPS), `vehiculos.km_por_litro`, `horas_mes`, `km_mes`,
  `transporte_config.precio_litro`, `clientes.apellidos` (apellido1 y apellido2 siempre separados) y Casa / Trabajo
  del cliente (Viajes y Recolecciones usan su dirección y ubicación de la ficha; Clientes → "Acceso del cliente").
- **Motivos de retraso** por empresa y por actividad (vacía = todas).
- **Costo del reporte de Viajes**: gastos del mes ÷ viajes del mes (antes, por vehículo con precio del litro: el
  combustible podía contarse doble). En Configuración → Transporte, el margen de cada franja usa el viaje promedio.
- Configuración → Actividades muestra la casilla **Recolecciones con agenda**. Al crear una empresa se le copian
  también los motivos, los horarios y los slots.
- Sin cambio en esta etapa (van con la Etapa 2, cuando la base haga cumplir las reglas): las horas de cada paso del
  pedido siguen en `pedidos` (la página todavía escribe el historial), el rol + funciones del usuario sigue en
  `usuarios.permisos`, y la región ya era opcional y con llave real.

## 2026-10-20 · Actividad Recolección (agenda del cliente, depósitos, bloqueos y cobro semanal)

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 46** (= `sql/por_funcion/01_actualizacion_23_recoleccion.sql`;
instalación nueva: `sql/00`, sección 39). Guía: [secciones/recolecciones.md](secciones/recolecciones.md).

- **Actividad nueva `recoleccion`** con su sección **Recolecciones** (`#recolecciones`), aparte de Transporte y sin
  cambiar las demás actividades. Marca nueva `actividades.usa_agenda_recoleccion` (no es `usa_recoleccion`).
- **Una sola agenda** por empresa: el cliente elige el día y un espacio libre, dónde se recoge (mapa; Casa / Trabajo),
  qué (**depósitos**: cuántos y de quién es cada uno, u **otra cosa**) y dónde se entrega (**la oficina de la
  empresa** u **otro lugar**). Cambia la hora (todo o nada) o cancela mientras el espacio esté libre y hasta
  `cancelar_horas` antes.
- **Quien atiende** (Administrador, Admin G1, piloto o la función nueva `recolecciones.atender`) hace el proceso del
  conductor: En camino → Recogida → Entregada (o No estaba). Pestaña **Bloqueos y horario**: bloquear horas (almuerzo,
  entrada, salida: todas las semanas o un día) y el horario de servicio.
- **Cobro semanal** (función `recolecciones.cobrar`): tarifa diaria por cliente **como en las rutas**: se marcan los
  días que se trabajan y desde cuándo, y **cada día marcado se cobra el monto fijo, haya o no recolecciones**
  (`recoleccion_generar_cargos` arma los días que falten). Pestaña **Cobros** por semana, "Cobrado" y corregir el
  monto de un día (ej. feriado en ₡0). Un cliente sin tarifa no se cobra. El cliente ve lo que tiene pendiente.
- Tablas nuevas: `recolecciones` (solo lectura para la página), `recoleccion_config`, `recoleccion_bloqueos`,
  `recoleccion_tarifas`, `recoleccion_cargos`. Funciones: `recolecciones_horas`, `_solicitar`, `_cambiar_hora`,
  `_cancelar`, `_avanzar` (recicla `viaje_usuario`). El bloque vuelve a crear `registro_clientes_empresa` y
  `solicitar_acceso_cliente` (el cliente pide su usuario también en Recolección) y `limpiar_empresa` (también borra
  las recolecciones).
- Lo común que se tocó, sin cambiar lo que ya existe: `empresas/empresas.js` (`esActividadDeRecolecciones`,
  `empresaTieneRecolecciones`, `esActividadSinPedidos`: la actividad no sale en Pedidos, Rutas, Artículos ni
  Configuración → Pedidos), `js/palabras.js` (lee la marca), `js/sesion.js` (sección, módulo y funciones; piloto y
  cliente la ven), menú (`app.html`), pie (`BOTONES_PIE_RECOLECCION`), Inicio (empresa de Recolección sin viajes →
  directo a Recolecciones), Clientes ("Acceso y lugares" también con Recolección) y `js/supabase.js` (tablas por empresa).
- Se activa en Tiendas → Empresas marcando **Recolección**. La marca no aparece en Configuración → Actividades (se
  pone con el SQL).

## 2026-10-19 · Limpiar una empresa con un botón, datos de la empresa, usuarios y clientes persona / empresa

SQL: **`sql/01_actualizacion_base_existente.sql` bloques 40 a 45** (=
`sql/por_funcion/01_actualizacion_17_limpiar_empresa.sql`, `01_actualizacion_18_datos_empresa.sql`,
`01_actualizacion_19_usuarios_cedula.sql`, `01_actualizacion_20_clientes_persona_empresa.sql`,
`01_actualizacion_21_telefonos_y_cedulas.sql` y `01_actualizacion_22_costos_margen.sql`; instalación nueva:
`sql/00`, secciones 33 a 38).

- **Todo lo de artículos en Configuración → Artículos** (sin SQL). Las tarjetas **Categorías de mercadería** y
  **Artículos frecuentes** salen de Configuración → Pedidos (ahí quedan tarifas, descuentos, tamaños, motivos,
  numeración y código de respaldo) y pasan al módulo **Artículos** (antes "Artículos de venta y precios"), con
  las mismas tablas (`categorias_mercaderia`, `articulos_catalogo`): Pedidos y Cotizador funcionan igual.
  Tres tarjetas: **Categorías** (crear y cambiar solo el Administrador; G1 las ve; dice cuántos artículos con peso
  y de venta tiene cada una), **Artículos de venta** y **Pesos para el envío** (antes "artículos frecuentes").
  **Ligadas**: la categoría de un artículo de venta ya no es texto libre, se elige de la lista de Categorías (las
  viejas escritas a mano se conservan); al renombrar una categoría, sus artículos de venta pasan al nombre nuevo.
  Si los artículos de venta tienen categorías que no están en la lista, la tarjeta lo avisa y el Administrador
  las trae con **"Traerlas a Categorías"**: van a la actividad que usa productos (tipo Artículos, activas); si
  ninguna usa productos, a la primera actividad pero inactivas (para no agregar casillas a sus pedidos).
  `crearListaConNuevo` acepta `textoNuevo: null` (lista sin "+ Nuevo…"). Además, Costos de operación ya no
  exige que alguna actividad use vehículos para aparecer.

- **Costos de operación sin vehículos, con margen y precio** (bloque 45). Antes el gasto del mes y los costos
  salían de los vehículos (sin vehículos: gasto ₡0 y sin costo por entrega). Ahora todo lo que cuesta operar se
  escribe como **gasto del mes** (el combustible también, como gasto variable) y se reparte entre las entregas o
  viajes del mes (las reales de 30 días o un estimado). Se quitaron la tarjeta **Por vehículo** (y su ventana), el
  campo Vehículo del gasto y los datos de combustible y velocidad de este módulo (la velocidad sigue en
  Transporte). Los gastos viejos que tenían vehículo lo conservan para el reporte de Viajes.
  **Cuánto cuesta operar**: gasto del mes (fijo y variable), entregas al mes, costo por entrega y costo por km
  (con los km de 30 días). **Margen y precio**: precio mínimo para cubrir gastos (= costo por entrega), precio
  sugerido con el margen de utilidad deseado (costo ÷ (1 − margen); también dice "costo + X %"), ingreso del mes
  para cubrir gastos y para la utilidad, y margen real de 30 días (cobrado − gastos, en verde o rojo). Con el
  precio promedio de hoy dice si se pierde, si falta para el margen y cuántas entregas al mes hacen falta.
  Cobrado = `pedidos.costo_envio` de los entregados + `viajes.total` de los terminados. Todo se recalcula
  mientras se escribe. Columnas nuevas de `transporte_config`: `margen_objetivo` (0 a 90, 20 por defecto) y
  `trabajos_mes` (opcional). Sin el bloque 45 calcula igual, pero no las guarda.

- **Listas dentro de ventanas sin `<datalist>`** (sin SQL). Dentro de una ventana (`dialog`) el navegador dibuja
  el `datalist` fuera de lugar. Ahora son una lista (`select`) con los valores que ya existen y, al final,
  "+ Nuevo…", que muestra un campo para escribir uno nuevo (si ya existía con otras mayúsculas o tildes, se usa el
  que había). Pieza común: `crearListaConNuevo` en `js/componentes.js` (estilo `.campo-nuevo` en
  `css/componentes.css`). Se usa en Configuración → Artículos de venta (artículo, categoría y presentación; al
  modificar, el nombre del artículo se escribe directo para poder cambiarlo) y en Costos de operación (concepto del
  gasto: los sugeridos y los que ya usa la empresa). Usuarios → departamento ya lo hacía así. Las listas de
  artículos de Pedidos y del Cotizador siguen con `datalist`: están en la página, no en una ventana.

- **Teléfonos y cédulas con el formato de Costa Rica** (bloque 44). Los campos con `data-formato` se acomodan
  solos al escribir o pegar (quitan letras, ponen guiones y no dejan pasar más dígitos de la cuenta) y se validan
  al guardar (`FORMATOS_CR`, `validarDato`, `datoConFormato` y `ponerDato` en `js/componentes.js`):
  - Teléfono: 8 dígitos, empieza con 2, 4, 5, 6, 7 u 8 → `8888-1234` (al pegar `+506 8888 1234` quita el 506).
  - Cédula física: 9 dígitos → `1-0234-0567`. DIMEX (extranjero): 11 o 12 dígitos, sin guiones.
  - Cédula jurídica: 10 dígitos, empieza con 2, 3, 4 o 5 → `3-101-123456`.
  Dónde: Clientes (teléfono; cédula según Persona o Empresa), Usuarios (teléfono y cédula), Empresas (teléfono y
  cédula jurídica), Tiendas, registro de usuario (login), Pedidos (cliente y quien recibe), Envíos y venta en ruta
  (Distribución). Se guardan siempre con guiones. Un dato viejo que no cumple se muestra tal cual al editar y pide
  corregirlo al guardar. Los buscadores de las listas encuentran `8888-1234` escribiendo `88881234`.
  En la base el bloque pone topes de largo y de caracteres (teléfono 20, cédula 20, razón social 150, nombre 60…;
  teléfonos de pedidos, viajes y solicitudes 30). Cada tope se agrega solo si ningún dato existente lo incumple;
  si alguno lo incumple sale un aviso (NOTICE) con la tabla y cuántas filas, para corregirlas y repetir el bloque.

- **Clientes: persona o empresa** (bloque 43). Al crear o modificar se elige **Persona** (nombre, apellidos y
  cédula opcional) o **Empresa** (razón social y cédula jurídica obligatorias; el nombre pasa a ser el de la
  persona de contacto y su apellido es opcional). Columnas nuevas `clientes.tipo` ('persona' | 'empresa'),
  `cedula` y `razon_social`; "busqueda" se rehace para incluir la razón social y la cédula. En la lista la empresa
  sale con su razón social y la etiqueta "Empresa" (debajo el contacto y la cédula). En Pedidos el buscador de
  clientes ahora también busca **por nombre o razón social** (con letras; con "@" por correo, con números por
  teléfono) y la empresa sale como "Razón social (contacto)". Sin el bloque 43 todo funciona como antes.

- **Responsive** (`responsive/responsive.css`, sin SQL): en tablet y celular los campos usan letra de 16px (el
  iPhone ya no acerca la pantalla al tocar un campo); en tablas anchas la columna de acciones (lápiz, basurero)
  queda fija a la derecha mientras la tabla se desliza; en celular los botones de las ventanas bajan de línea si
  no caben y se estiran. En pantallas táctiles (`pointer: coarse`) los botones de icono miden ~40px y las
  casillas son más grandes. Las ventanas nuevas (Limpiar datos, datos de la empresa, regiones, módulos y
  funciones) se acomodan a 1 columna en celular.
- **Usuarios: módulos y funciones de cada uno** (Nuevo / Modificar usuario, sin SQL nuevo). Dos usuarios con
  el mismo rol pueden hacer cosas distintas (ej. dos Empleados: el de bodega alista, despacha y cierra la caja
  de los pilotos, pero no registra pedidos; el de ventas registra y ve cómo van, pero no alista ni despacha).
  Casillas por módulo (Pedidos, Viajes, Pilotos, Caja, Distribución, Rutas, Tiendas y clientes, Reportes,
  Cotizador, Usuarios, Configuración) y, debajo, sus funciones. **El rol solo da lo que viene marcado al crear
  el usuario**: al personal (G1, G2, G3, Empleado) se le puede quitar o DAR cualquier módulo o función de la
  empresa (lo de otros roles dice "otro rol"). Lo que ve sigue siendo su alcance (G2 su región; G3 y Empleado su
  tienda: Caja, Distribución, Reportes y Usuarios ahora limitan también al Empleado a su tienda). Al piloto solo
  se le puede quitar. "Volver a los de su rol" deja lo de su rol.
  Funciones (`MODULOS_USUARIO` en `js/sesion.js`; cada sección las revisa con `puedeHacer('modulo.funcion')`):
  - Pedidos: registrar · recibido en bodega · alistar · listo para despachar y aprobar salida · asignar piloto,
    horario y reprogramar · solicitar reasignación · cancelar, devolver y autorizar · aprobar solicitudes de clientes.
  - Viajes: registrar viajes. Caja: cerrar caja. Distribución: bodega del día · productos y precios.
    Rutas: crear rutas y asignar pilotos. Tiendas: crear y modificar tiendas y regiones · registrar y modificar
    clientes · aprobar y eliminar clientes. Reportes: exportar. Usuarios: crear · modificar, eliminar y aprobar.
    Configuración (Admin G1): cambiarla (sin ella, solo la ve).
  - Las acciones del piloto (cargar, salir a ruta, entregar) siguen por su rol.
  Se guarda en la columna `permisos` (ya existía): igual que su rol = `{*}`; nada = `{inicio}`; un módulo con
  las funciones de su rol = su nombre; con otras = nombre + `modulo.ver` + las marcadas (ej. `{pedidos,pedidos.ver,
  pedidos.alistar,pedidos.despachar,caja,caja.ver,caja.cerrar}`). Cada sección usa
  `puedeHacer('modulo.funcion', loQueDaSuRol)`. `USAR_PERMISOS` pasa a `true`; los usuarios de antes (lista
  vacía o `{*}`) siguen con lo de su rol. El Administrador y el Desarrollador no se limitan. Al abrir o recargar la
  página se vuelven a leer de la base (`js/permisos.js`). Los botones del pie también se ocultan sin la función
  (Crear pedido, Asignar piloto, Cancelar). La columna de la lista se llama ahora "Módulos" (ej. "Pedidos (3 de 8)").
  ⚠ Como el resto de los permisos, lo controla la página (la protección en la base es la Fase 7).
- **Usuarios: cédula y departamento** (opcionales, Nuevo / Modificar usuario). El buscador de Usuarios
  también busca por ellos y se ven bajo el nombre. Departamento es una lista con los que ya existen en la empresa
  y "+ Nuevo departamento…" para escribir uno (si ya existía con otras mayúsculas o tildes, se usa el que había). Columnas nuevas `usuarios.cedula` y `usuarios.departamento`; el bloque vuelve a
  ejecutar `usuarios_ocultar_clave()` para que la página las pueda leer. Sin el bloque 42 los campos no aparecen.

- **Datos de la empresa** (Tiendas → Empresas → Nueva / Modificar): razón social, cédula jurídica, teléfono, a qué se dedica
  (por escrito), dirección y ubicación (con botón **Mapa**). Todos opcionales; columnas nuevas en `empresas`
  (`razon_social`, `cedula_juridica`, `telefono`, `giro`, `direccion`, `ubicacion`). La lista los muestra bajo el nombre. Sin el
  bloque 41 la empresa se sigue guardando, pero sin estos datos.

- **Tiendas → Empresas → Limpiar datos** (goma de borrar en cada empresa): hace lo mismo que
  `herramientas/vaciar_base_datos.sql` en modo empresa sin abrir Supabase. Se escribe el ID de la empresa y la
  contraseña del Desarrollador; la base la comprueba (`limpiar_empresa`), así que la clave pública sola no
  alcanza. Opciones: conservar Administradores y borrar la empresa al final (nunca la principal ni la activa).
  Al terminar dice cuánto se borró.
- `herramientas/vaciar_base_datos.sql`: el nombre para confirmar ya no tiene que ser exacto (no importan
  mayúsculas, tildes ni espacios de más).

## 2026-10-13 · Punto B más fácil: mapa a pantalla completa y ubicación compartida por el cliente

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 39** (=
`sql/por_funcion/01_actualizacion_16_ubicacion_del_cliente.sql`; instalación nueva: `sql/00`, sección 32).
Solo hace falta para "Pedir ubicación al cliente"; el mapa a pantalla completa funciona sin él.

- **Elegir A / B a pantalla completa** (todos los mapas A → B: Pedidos, Cotizador, Envíos, Viajes): los
  botones "Ubicar", los radios "Clic en el mapa pone" y "Ampliar mapa" se cambian por **Elegir A / Elegir B**.
  Abren el mapa en toda la pantalla con un **pin fijo en el centro**: se mueve el mapa y se toca **Confirmar**.
  Tiene buscador (con sugerencias), **Mi ubicación** (GPS) y el nombre del lugar donde está el pin. Un clic
  en el mapa chico abre lo mismo en ese lugar. En celular el mapa chico ya no atrapa el dedo (la página baja).
  Si B se elige en el mapa sin dirección escrita, la dirección se escribe sola. (`js/mapa.js`:
  `elegirPuntoEnMapa`, `miUbicacionGps`; estilos `.mapa-elegir` en `css/componentes.css`.)
- **Pedir ubicación al cliente** (Nuevo pedido, junto a B): manda por WhatsApp un enlace a la página
  `ubicacion.html?t=...` (sin iniciar sesión). El cliente toca **Usar mi ubicación actual** o **Buscar en el
  mapa** y confirma. El punto llega solo al formulario (se revisa cada 5 s) y queda en su ficha de Clientes.
  Si el formulario se cerró, a quien mandó el enlace le llega un aviso que abre "Nuevo pedido" con el
  cliente y su punto. Se puede cambiar hasta que se **registre el pedido** (ahí el enlace se cierra);
  vence en 24 horas. Si se vuelve a pedir para el mismo teléfono, se reusa el mismo enlace. **No cambia
  ningún precio.** Base: tabla `ubicaciones_compartidas` (solo por funciones), `ubicacion_pedir`,
  `ubicacion_estado`, `ubicacion_usar` (la tienda) y `ubicacion_ver`, `ubicacion_guardar` (el cliente;
  solo puntos dentro de Costa Rica). `_headers`: `ubicacion` sin buscadores.
- `VERSION_APP` y todos los `?v=` = `20261013p`.

## 2026-10-13 · Entrega con QR obligatorio, fotos livianas y pedidos solo con producto en bodega

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 38** (=
`sql/por_funcion/01_actualizacion_15_entrega_qr_y_bodega.sql`; instalación nueva: `sql/00`, sección 31).
Sin él, "Escanear QR" avisa que falta el bloque 38 y los pedidos con productos se registran como antes.

- **Entrega con QR**: en "Mi ruta" (Inicio) y en el detalle del pedido, el botón "Entregar ahora" ahora es
  **Escanear QR**. El piloto escanea el QR del pedido que tiene el cliente y el pedido pasa a **Entregando**
  (`pedido_iniciar_entrega`: solo su piloto, solo desde "En ruta", uno a la vez, y el QR tiene que ser de ESE
  pedido). Si el QR no se lee, se escribe el **código de entrega** que da el cliente. También sirve el botón
  "Escanear QR" del encabezado. La línea de tiempo dice si fue con el QR o con el código.
- **La base lo exige** (trigger `pedidos_entrega_con_qr`): no se pasa a "Entregando" sin escanear, ni se marca
  "Entregado" sin haber pasado por "Entregando". **"No entregado"** ahora también se puede desde "En ruta" (el
  cliente no estaba: no hay QR que escanear).
- **Fotos** (carga, entrega y comprobante de pago): dos botones, **Cámara** (una por vez) y **Galería** (varias a
  la vez, o la captura del SINPE), hasta 6. Se achican a JPEG liviano: lado de 1024 px y, si pasa de 150 KB, se
  baja la calidad y el tamaño (una foto de celular de 3-10 MB queda en 50-150 KB). Cada miniatura muestra su peso
  y abajo dice "2 de 6 fotos · 196 KB". Archivo: `js/carga-comun.js` (`CARGA_FOTO_INTENTOS`, `CARGA_FOTO_MAX_BYTES`).
- **Pedidos con productos (Distribuidora)**: al registrar se revisa la **bodega del día** de la ruta y fecha
  (`dist_disponible`): disponible = lo que entró ese día (ingresos + ajustes − salida − devuelto dañado) − lo ya
  pedido en otros pedidos (los entregados y las ventas en ruta cuentan lo entregado; los cancelados, devueltos,
  no entregados, no salió y reprogramados no cuentan). Si falta, **no se registra** y dice qué falta. La base
  también lo revisa al guardar los productos (trigger `pedido_productos_revisar_bodega`).
- **Sin bodega ese día** (ej. pedido para mañana): si lo registra un Admin G3 o superior, confirma y queda
  autorizado; si lo registra un Empleado, queda **por autorizar** (`detalle.autorizacion`), se avisa al G3 y al
  G2, y no se puede alistar, asignar ni cargar hasta que un G3 o superior toque **Autorizar** en el detalle (o lo
  cancele con su motivo).
- `VERSION_APP` y todos los `?v=` = `20261013o`.

## 2026-10-13 · Detalle del pedido: "Cliente y entrega" en bloques

SQL: **ninguno**.

- El cuadro "Cliente y entrega" del detalle del pedido ocupa todo el ancho y se divide en bloques: **Cliente**
  (nombre, teléfono, quién recibe, notas), **Dirección y recorrido** (partida, entrega, km y botones de Google Maps
  / Waze), **Despacho** (fecha, slot, horario, ruta asignada, piloto, peso), **Control** (carga, cómo pagó, caja,
  código de respaldo) y **Cobro** (el desglose que antes era otro cuadro). Máximo 3 por fila; 2 en tableta y 1 en
  celular, donde cada etiqueta va arriba de su valor. Los bloques vacíos no se muestran.
- Etiquetas más cortas ("Recorrido", "Ruta asignada", "Slot") y la columna de la etiqueta con ancho tope: ya no
  aprieta los valores. Archivos: `secciones/pedidos.html`, `js/secciones/pedidos.js` (`dibujarDetalle`),
  `css/secciones/pedidos.css` (`.ped-grupos`, `.ped-grupo`, `.ped-datos`).
- `VERSION_APP` y todos los `?v=` = `20261013n`.

## 2026-10-13 · Comprobante de pago en la entrega y solo SINPE se verifica en la caja

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 37** (=
`sql/por_funcion/01_actualizacion_14_comprobante_de_pago.sql`; instalación nueva: `sql/00`, sección 30).
Agrega el tipo `pago` a `pedido_evidencias`. Sin él la app funciona: el comprobante se guarda como foto de `entrega`.

- **Entrega con cobro** (Pedidos → "Entregado" y entrega por producto de la Distribuidora): además de las fotos de
  lo entregado, una caja de fotos del **comprobante de pago** que cambia según cómo pagó el cliente: *Foto del
  efectivo recibido*, *Foto del voucher* (tarjeta) o *Comprobante de SINPE Móvil*. Va a `evidencias/pago/<pedido>/`
  y a `pedido_evidencias` tipo `pago`. Textos y si son obligatorias: `PAGO_FOTO` en `js/carga-comun.js`
  (`crearFotosPago`); hoy recomendadas. En el detalle del pedido cada foto dice de qué es.
- **Caja**: solo el **SINPE** se marca "Verificado" (llega por el banco); la **tarjeta** entra directo al cierre.
  Cada cobro con comprobante tiene **Ver comprobante** para compararlo con el banco.
- **Reportes → Cajas**: el detalle del cierre muestra el comprobante de cada cobro; "Tarjeta" ya no dice "verificada".
- `VERSION_APP` y todos los `?v=` = `20261013m`.

## 2026-10-13 · Fotos de la entrega, ventana del pedido y reporte de cajas

SQL: **ninguno** (usa `pedido_evidencias` y el Storage `evidencias`, que ya existen; y `cierres_caja`, bloque 24).

- **Fotos de lo que entrega el piloto**: al marcar "Entregado" (Pedidos) y en la entrega por producto
  (Distribuidora) hay "Tomar foto" (hasta 6, se achican). Se suben a `evidencias/entrega/<pedido>/` antes de marcar;
  si la base rechaza la entrega se borran; si se marca, quedan en `pedido_evidencias` (tipo `entrega`) y se ven en
  el detalle del pedido. Recomendadas, no obligatorias: `ENTREGA_FOTO_OBLIGATORIA` en `js/carga-comun.js`
  (`crearFotosEntrega`).
- **Ventana con los datos del pedido** (al escanear su QR, `mostrarPedidoQr` en `js/qr.js`): rediseñada por grupos
  (Cliente, Entrega, Cobro con el total destacado, Notas, Mercadería en tabla), teléfonos para llamar con un toque,
  aviso de alcohol arriba, montos con separador de miles (₡47 750,00), nombre de la actividad (no su código),
  cabecera y botones fijos con scroll solo en el medio; en celular no se apila etiqueta sobre valor.
  Pedidos también muestra los montos con separador de miles.
- **Reportes → pestaña Cajas**: cierres de caja con faltante / sobrante y su motivo; al abrir uno, su detalle y los
  cobros incluidos. Excel. Ver `docs/secciones/reportes.md`.
- **Caja**: con faltante o sobrante el motivo es obligatorio para cerrar.
- `app.html`: todas las versiones `?v=` en `20261013l` (las etiquetas de los scripts habían quedado en `j` en el
  cambio anterior).

## 2026-10-13 · Reporte de visitas (solo Desarrollador)

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 36** (=
`sql/por_funcion/01_actualizacion_13_visitas.sql`; instalación nueva: `sql/00`, sección 29).

- Tabla `visitas`: cada **ingreso** (al iniciar sesión, `js/secciones/loggin.js`) y cada **pantalla** abierta
  (`js/pagina_inicial.js`) se anota con `registrarVisita` (`js/sesion.js`): usuario, empresa, dispositivo
  ("Android · celular"), navegador, si es la app instalada, y la **IP y el país** (los toma la base de la llamada).
- **Se guarda 3 días**: cada registro y cada reporte borran lo más viejo.
- Pestaña **Tiendas → Visitas** (`secciones/visitas.html`), solo el Desarrollador: totales, vista "Por usuario"
  (agrupada por empresa: ingresos, pantallas, último acceso, pantalla más usada, dispositivo, IP) y "Detalle";
  filtros por empresa, tipo, día y búsqueda; Excel. Tocar una IP abre su ciudad aproximada (ipinfo.io).
- La tabla no se lee directo desde la web: solo con `reporte_visitas`, que exige rol Desarrollador. Las visitas
  del Desarrollador no se anotan. Sin el bloque 36 la app funciona igual (no anota nada).
- `VERSION_APP` = `20261013k`.

## 2026-10-13 · QR fijo: solo se marca estando en la tienda (GPS)

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 35** (va en el mismo archivo que el 34:
`sql/por_funcion/01_actualizacion_12_qr_fijo_tienda.sql`; instalación nueva: `sql/00`, sección 28).

- Al escanear el QR fijo, el celular del piloto manda su ubicación (GPS) y `marcar_por_qr_fijo` mide la
  distancia a la tienda (`tiendas.lat/lng`). Más lejos que el radio = no marca ("Estás a 1112 m de la tienda...").
  Se descuenta la precisión del GPS hasta 50 m. Sin permiso de ubicación o sin GPS: no marca.
- **Radio**: `configuracion.radio_marca_m` (150 m por defecto); Administrador y G1 lo cambian en la tarjeta del QR
  del Inicio ("Distancia máxima para marcar").
- **Ubicación de la tienda**: la tarjeta dice si falta; "Usar mi ubicación actual" (Administrador, G1, G3) guarda el
  GPS del dispositivo como la de la tienda. Sin ubicación, el QR fijo no marca.
- Cada marca guarda dónde se hizo: `marcas_piloto.lat`, `lng`, `distancia_m`.
- "Validar y marcar" (la tienda escanea al piloto en persona) y el QR del mes no cambian.
- `VERSION_APP` = `20261013j`.

## 2026-10-13 · QR fijo de la tienda (marca automática)

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 34** (=
`sql/por_funcion/01_actualizacion_12_qr_fijo_tienda.sql`; instalación nueva: `sql/00`, sección 27).

- Cada tienda tiene un **QR fijo** (`qr_tienda_fija`, tabla `qr_tiendas_fijo`) que no cambia cada mes. Se ve
  siempre en el **Inicio** (G3 y Empleado: su tienda; Administrador, G1 y G2: eligen la tienda) con
  "Ver, descargar o imprimir". El botón QR de Tiendas también muestra este.
- El piloto lo escanea ("Escanear QR") y su horario abierto se **marca solo con la fecha y la hora del sistema**
  (hora de Costa Rica), **sin validación previa** (`marcar_por_qr_fijo`). Marca tardía: pide el motivo. Se avisa
  a la tienda para despachar.
- **Generar uno nuevo** (Administrador, G1 y G3): el impreso deja de servir (por si se copió o se perdió).
- El QR del mes y "Validar y marcar" con el QR del piloto siguen funcionando.
- `VERSION_APP` = `20261013i`.

## 2026-10-13 · QR del piloto: "Validar y marcar" en un solo paso

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 33** (=
`sql/por_funcion/01_actualizacion_11_qr_validar_y_marcar.sql`; instalación nueva: `sql/00`, sección 26).

- La tienda escanea "Mi QR del día" del piloto: sale su ficha (foto, nombre, tienda y el horario que puede marcar,
  a tiempo o tardío) con el botón **Validar y marcar**. Valida al piloto y marca su horario abierto en un solo paso
  (`piloto_qr_info`, `validar_y_marcar_piloto`) y avisa a la tienda para despachar.
- Marca tardía: en la misma ficha se escribe el motivo; sin motivo no se guarda nada (todo o nada).
- Sin horario abierto, o si ya lo marcó: solo se valida y se dice por qué.
- La marca queda con la tienda de quien escanea (si no tiene, la del piloto).
- El QR de marcas de la tienda sigue funcionando igual (el piloto ya validado lo escanea para marcar).
- Sin el bloque 33 la página solo valida, como antes.
- `VERSION_APP` = `20261013h`.

## 2026-10-13 · Logos de empresa por número interno (no por ID)

Sin SQL.

- **Problema:** las imágenes del encabezado de cada empresa iban por su ID (`html[data-empresa="02"]`). Al borrar
  una empresa su ID se vuelve a usar, y la nueva (ej. "Corporación Dinant", 02) heredaba los logos de la borrada
  (Transportes Otoya-Valverde). En la base no quedaba nada de las borradas (revisado).
- **Ahora:** `empresas/empresas.js` marca también `data-empresa-id` (empresas.id, nunca se repite) y
  `css/encabezados.css` usa `html[data-empresa-id="N"]`. Se quitó la regla vieja de la 02.
- **Empresa sin logos propios:** usa el encabezado y los logos de ACACHETE (los de la 01).
- Tiendas → Empresas muestra el **N.º interno** de cada una; al eliminar una empresa recuerda borrar su bloque
  de `css/encabezados.css`.
- `VERSION_APP` = `20261013f`.

## 2026-10-13 · Configuración → Artículos de venta y precios

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 32** (=
`sql/por_funcion/01_actualizacion_10_articulos_de_venta.sql`; instalación nueva: `sql/00`, sección 25).

- Tarjeta nueva en Configuración (Administrador y G1): crear un artículo de venta en **una ventana** con
  artículo, categoría, código, presentación, unidad, cantidad que trae, costo y precio de venta con IVA (IVA 13 %
  cambiable). Tabla con costo, precio y margen; filtro por lista de precios; modificar y eliminar. Mismo catálogo
  que Distribución → Productos y precios ([15-distribuidora.md](15-distribuidora.md)).
- `producto_presentaciones.unidad` y `.costo` (bloque 32). Sin el bloque se guarda lo demás y se avisa.
- El selector de productos del pedido y de la venta en ruta muestra el **precio con IVA** de cada opción.
- Configuración → Pedidos → Categorías y Artículos frecuentes indican dónde se crean los artículos de venta.
- `VERSION_APP` = `20261013e`.

## 2026-10-13 · Tiendas: región opcional · usuarios sin región

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 31** (=
`sql/por_funcion/01_actualizacion_9_tiendas_region_opcional.sql`; instalación nueva: `sql/00`, sección 24).

- Una tienda se crea **sin región** ("Sin región" en el formulario; código sugerido `SUC-001`). En la lista va
  en el grupo "Sin región" y el filtro tiene esa opción. La ven el Administrador y el Admin G1 (el G2 solo ve
  su región). Los pilotos multitienda de otra tienda no se le ofrecen (se cruzan por región).
- **Los usuarios ya no llevan la región:** todos los roles son nombre + ID de la empresa (`jperez01`).
  Cambiar, poner o quitar la región de una tienda no toca a los usuarios.
- ⚠ Al ejecutar el bloque 31, los usuarios de tienda que ya existían se renombran **una sola vez**
  (`cenjperez01` → `jperez01`; si dos quedarían iguales, el segundo queda `jperez201`). Marca
  `usuarios_sin_region` en `configuracion`; el bloque 17 ya no les vuelve a poner la región. **Avisar a cada
  uno su usuario nuevo** (la clave no cambia).
- `cambiar_codigo_empresa` solo cambia el ID del final.
- `VERSION_APP` = `20261013d`.

## 2026-10-13 · Caja de pilotos como parte de cada actividad · versión de los archivos

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 30** (incluido en
`sql/por_funcion/01_actualizacion_8_despacho_carga_y_salida.sql`; instalación nueva: `sql/00`, sección 23).

- **Caja de pilotos** es una casilla más en Configuración → Actividades → "Qué usa en todo el sistema"
  (`actividades.usa_caja`). La sección Caja y Configuración → Cajas aparecen si alguna actividad de la empresa la
  usa (y su plan incluye "caja"). Todas las actividades vienen con caja: no desaparece nada.
- **Distribución**: después de cerrar la mercadería de un piloto, botón de **caja fuerte** que abre su Caja
  (`#caja?piloto=ID`) para cuadrar el dinero.
- **Versión de los archivos** (`VERSION_APP` en `app.html`): cada JS, CSS y HTML se descarga con `?v=...`, así el
  navegador no mezcla archivos nuevos con viejos (por eso Configuración no cargaba). Subirla al publicar
  ([10-recetas.md](10-recetas.md)).

## 2026-10-12 · Despacho: carga con evidencia por pedido y salida a ruta por slot

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 29** (o `sql/por_funcion/01_actualizacion_8_despacho_carga_y_salida.sql`;
instalación nueva: `sql/00`, sección 22). Probado en Postgres (PGlite) y la pantalla con datos simulados.

- El piloto **solo toca** los pedidos que la tienda marcó **"Listo para despachar"** (la base lo revisa).
- **Cargar por pedido** (botón "Cargar" en Mi ruta y en el detalle; `js/carga-comun.js` → `pedido_cargar`): foto(s) de
  lo que recibe (se achican y se suben a Storage `evidencias/carga/<pedido>/`), **bultos recibidos** (sugiere los
  registrados) y **efectivo** que lleva para ese pedido (muestra el vuelto previsto). Queda "Cargado"; ya no hace falta
  "Recibido para ruta" ni escanear el QR (los que quedaron así con el flujo anterior se cargan igual o se escanean).
  Columnas nuevas `pedidos.carga_bultos`, `carga_efectivo`, `carga_nota`; evidencia tipo `carga`.
- **Salir a ruta POR SLOT** (Inicio → Mi ruta, un renglón por slot; `piloto_salir_ruta`): los cargados del slot pasan
  a "En ruta". Los listos que no se cargaron quedan **"No salió a ruta"** (estado nuevo `no_salio`): aviso pendiente al
  G2 para **reprogramar** o cancelar, y aviso al G3. El cliente lo ve como "Reprogramando".
- Detalle del pedido: "Carga" (bultos, efectivo, nota) y bloque "Carga y entrega" con las fotos.

## 2026-10-12 · Tiendas: código libre (sin región) y tiendas con o sin rutas

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 28** (o `sql/por_funcion/01_actualizacion_7_tiendas_codigo_y_rutas.sql`;
instalación nueva: `sql/00`, sección 21). Probado en Postgres (PGlite), también volviendo a ejecutar todo `01`.

- El código de la tienda ya **no depende de la región**: es libre (letras, números y guion; ej. `SUC-CENTRO`) y la
  región se elige aparte. Las tiendas que ya existían no cambian.
- Cambiar el código ya no cambia la región ni los usuarios. Cambiar la **región** renombra a sus usuarios
  (`cambiar_region_tienda`): el usuario de G3, Empleado y Piloto lleva la región (`cenjperez01`), no el código.
  `cambiar_codigo_empresa` y el bloque 17 también toman la región (así un código libre nunca cambia un usuario).
- **Tiene rutas** (`tiendas.usa_rutas`): las tiendas que no envían pedidos no aparecen en Nuevo pedido, Rutas,
  Cotizador ni Distribución. Columna "Envíos" en la lista de Tiendas.
- `js/componentes.js`: `prefijoUsuario(region)`, `claveTiendaUsuario(tienda)` y `tiendasSinRutas()`.

## 2026-10-12 · Distribuidora y partes por actividad (vehículos, km, peso)

SQL: **`sql/01_actualizacion_base_existente.sql` bloques 26 y 27** (instalación nueva: `sql/00`, secciones 19 y 20).
Probados en Postgres (PGlite): `00` completo, `01` encima dos veces y un día completo de distribuidora.

- **Partes por actividad** (bloque 26): cada actividad dice si usa **vehículos**, **cobro por km**, **peso** y
  **productos** (Configuración → Actividades → "Qué usa en todo el sistema"). Lo que ninguna actividad de la empresa
  usa desaparece: Vehículos y Costos de operación, vehículo del piloto (Usuarios, Pilotos, Mi perfil), campos de kg y
  km de las tarifas, peso del pedido, ayuda del cobro por km, Cotizador y simulador (sin peso ni km). Clases
  `.solo-vehiculos`, `.solo-km`, `.solo-peso`, `.solo-peso-o-km`, `.solo-productos` (`css/base.css`). Ver
  [07-actividades-y-mercaderia.md](07-actividades-y-mercaderia.md).
- Actividad **Masajes** (la usaba la empresa 03 y no estaba en la tabla): sin vehículos, km ni peso.
- Actividad **Distribución** y sección nueva **Distribución** (bloque 27): productos, presentaciones, listas de
  precios con IVA (13 % por defecto, modificable en cada precio), lista de cada tienda, motivos de entrega
  incompleta, **bodega del día por ruta** (ingreso, carga dividida entre pilotos, traspaso, ajuste, devolución buena o
  dañada), **cierre de mercadería por piloto** (faltante con aviso y reporte), **cierre de bodega** (queda en 0 con el
  resumen del día), **Mi carga** y **venta en ruta** del piloto, historial y **reporte de faltantes** (CSV).
- **Pedidos**: una actividad con productos elige productos y lista de precios en vez de categorías; el piloto
  entrega por producto (si es menos, motivo obligatorio → "Entregado con incidencia" + aviso al G3). El total a
  cobrar se recalcula con lo entregado. El detalle muestra los productos pedidos y entregados.
- Plan: función nueva **"Distribución"** (`distribucion`; Profesional y Completo).
- `herramientas/vaciar_base_datos.sql` también limpia bodegas, productos, listas y motivos.
- Ver [15-distribuidora.md](15-distribuidora.md).

## 2026-10-08 · Caja de pilotos y conductores (como en SISCED)

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 24** (instalación nueva: `sql/00`, sección 17).

- Sección nueva **Caja** (`#caja`): fondo de caja, cobros sin cerrar (pedidos entregados y viajes terminados), SINPE y
  tarjeta "Verificado", arqueo con diferencia y **Cerrar caja** (función `caja_cerrar` en la base, todo o nada).
  Cierres anteriores. G3 cierra los de su tienda, G2 los de su región, G1 y Administrador todos; el piloto ve la suya.
- **Configuración → Cajas**: tipos de caja (nombre y monto) y el fondo de cada piloto o conductor.
- **Entregado**: si el pedido tiene monto a cobrar, el piloto marca cómo pagó el cliente (efectivo, SINPE o tarjeta).
  El detalle del pedido muestra "Cómo pagó" y si su caja ya se cerró.
- Plan: función nueva **"Caja de pilotos y conductores"** (`caja`; Profesional y Completo). Se habilita o quita por
  empresa en Configuración → Planes y funciones.
- Ver [secciones/caja.md](secciones/caja.md).

## 2026-10-06 · Encomiendas: el cliente solicita recolección y entrega ("Mis envíos")

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 23** (instalación nueva: `sql/00`, sección 16).

- Tabla `pedido_solicitudes`. El cliente con usuario de una empresa con encomiendas (actividad con
  `usa_recoleccion`) ve **Mis envíos** (`secciones/envios.html`, `js/secciones/envios.js`): qué envía, A (recoger) y
  B (entregar) con **puntos de referencia** y los puntos en el mapa, quién recibe y la fecha. Ve el avance y puede
  cancelar las pendientes.
- Aviso (campana) al **Admin G3** de su tienda; sin G3, al G2 de la región; si tampoco, al Administrador y G1.
- **Pedidos → "Solicitudes de envío de clientes"** (G3 o superior): **Revisar y registrar** abre "Nuevo pedido" ya
  lleno (cliente, A y B con sus puntos, quién recibe, fecha, un bulto y las referencias en Notas). Al registrarlo la
  solicitud queda aprobada y siguen los avisos de siempre (piloto, G2, pedidos cercanos); al cliente le llega
  "Tu envío fue aprobado". **Rechazar** pide el motivo y se lo avisa.
- El detalle del pedido muestra las referencias al recoger y al entregar (para el piloto).
- La **solicitud de usuario** desde el login ahora también la reciben las empresas de encomiendas, y en Clientes se
  puede dar o aprobar el acceso del cliente en esas empresas.
- Plan: función nueva **"El cliente solicita envíos"** (`envios_clientes`; Profesional y Completo).
- `js/mapa.js`: un punto puesto a mano gana a una búsqueda de dirección que todavía no terminó.

## 2026-10-06 · Planes y funciones por empresa; Costos de operación para todas

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 22** (en una instalación nueva ya va en `sql/00`, sección 15).
Las empresas que ya existían quedan en plan **Completo** (no cambia nada hasta que se les asigne otro).

- `empresas.plan` (`basico` | `profesional` | `completo` | `personalizado`) y `empresas.funciones` (lista; null = todas).
- **Configuración → Planes y funciones** (solo el Desarrollador): una tarjeta por empresa con el plan y las casillas
  de cada función (Secciones, Configuración, Extras). Elegir un plan marca sus funciones; cambiar una casilla lo deja
  en Personalizado. Catálogo y planes: `FUNCIONES_PLAN` y `PLANES` en `empresas/empresas.js` (ahí se editan).
- Lo que el plan no incluye desaparece para los administradores y usuarios de esa empresa (`funcionHabilitada`):
  secciones del menú, botones del pie, botón QR, tarjetas de Configuración, exportar en Reportes, pedidos cercanos.
  La base respeta "Solicitud de usuario de clientes" (`registro_clientes_empresa` y `solicitar_acceso_cliente`).
- **Configuración → Costos de operación** (`js/secciones/configuracion/costos.js`): el calculador de costos salió de
  Transporte y ahora lo tienen todas las empresas (si su plan lo incluye). Suma el **costo por entrega o viaje** de los
  últimos 30 días: pedidos entregados (vehículo del piloto, `distancia_km` y minutos del mapa) y viajes terminados.
  Transporte conserva el margen de cada franja.

## 2026-10-06 · Pedidos: "Pagado en línea"

Sin SQL. Subir `js/secciones/pedidos.js`, `secciones/pedidos.html` y `css/secciones/pedidos.css`; Ctrl + F5.

- En Cobro, las casillas "El piloto cobra al entregar" (marcadas, había que desmarcar) se cambiaron por
  **"¿El cliente ya pagó en línea?": Envío pagado / Compra pagada**, **sin marcar por defecto** = el piloto cobra el
  total, igual en todas las empresas. Marcadas se ponen verdes; si todo está pagado se ocultan Forma de pago y Paga con.
- El pedido guarda `detalle.pagado_en_linea` y el detalle muestra "Pagado en línea: envío / compra".

## 2026-10-06 · Pedidos cercanos: aprovechar un mismo viaje (fase 1)

Sin SQL. Subir `js/secciones/pedidos.js`, `secciones/pedidos.html` y `css/secciones/pedidos.css`; Ctrl + F5.

- Al registrar un pedido se buscan los del mismo día, sin entregar, cuya recolección o entrega quede a menos de 1 km
  (`PED_RADIO_CERCANO_KM`). El formulario los muestra y el G2 puede **asignar el mismo piloto** con un toque.
- Avisos: al piloto ("Nuevo pedido cerca de tu recorrido"), o al G2 con la sugerencia de piloto si no tiene o si lo
  cercano lo lleva otro.
- Detalle del pedido: fila "Cerca de este pedido". El historial guarda los cercanos para medir el plan piloto.
  Ver [secciones/pedidos.md](secciones/pedidos.md), "Pedidos cercanos".

## 2026-10-05 · Web: portada compacta y una página de solución por tipo de empresa

Sin SQL. Recargar con **Ctrl + F5**.

- Portada más compacta: bienvenida (con los 3 beneficios en una línea), una sola sección "Soluciones" y la galería
  "Conozca más". Se quitó la sección "Para quién", que repetía lo mismo.
- **Mensajerías, Distribuidoras y Transporte abren cada una su propia página** (`web/paginas/solucion-*.html`): lo que
  resolvemos (antes / con ACACHETE), así trabaja su operación, funciones incluidas explicadas, un destacado y el llamado
  a la demostración (con enlace al detalle de cada función ya filtrado).
- Visión: se quitaron "Hacia dónde vamos" y "Para quién".
- Menú de arriba: nueva opción "Soluciones"; el pie enlaza las tres soluciones.

## 2026-10-05 · Revisión responsive (web y app) en 12 resoluciones

Sin SQL. Recargar con **Ctrl + F5**.

- Medido en 320, 360, 390 y 414 px (celular), 844 × 390 (celular acostado), 768, 820 y 1024 px (tablet) y 1280, 1366,
  1440 y 1920 px: la web (portada, Productos, Visión, Contacto, la App en ventana, el visor) y todas las secciones de la
  app, sus formularios y el login. Ninguna página queda con scroll horizontal; las tablas se desplazan dentro de su caja.
- Corregido: Contacto de la web en celulares (las listas desplegables ensanchaban el formulario); visor de productos en
  celular angosto (título) y en pantallas bajas (más compacto); lista de tiendas del formulario de Clientes en 320 px.
- Las columnas automáticas de todos los CSS (`repeat(auto-fit, minmax(Xrem, 1fr))`) ya no superan el ancho de la
  pantalla: `minmax(min(Xrem, 100%), 1fr)`. En computadora no cambia nada.

## 2026-10-05 · La página web carga primero: la app ahora es `app.html`

Sin SQL. Recargar con **Ctrl + F5**.

- **`index.html` es la página web de presentación** (antes `web.html`), así abre primero en cualquier servidor.
  **La app ahora es `app.html`** (antes `index.html`). Se actualizaron todas las referencias (las secciones,
  comentarios y documentación).
- Enlaces viejos de la app (`index.html#registro?empresa=02`, `index.html#pedidos`...) se pasan solos a `app.html`.
- Página de inicio más liviana: 3 beneficios con textos nuevos ("Entregas confirmadas", etc.), "Para quién" sin listas
  y la galería. "Cómo funciona" pasó a la ventana Productos.

## 2026-10-05 · Solicitud de usuario para todas las empresas

Sin SQL. Subir `secciones/loggin.html`, `js/secciones/loggin.js` y `empresas/empresas.js`; recargar con **Ctrl + F5**.

- "¿Eres cliente? Solicita tu usuario" aparece **siempre** en el login. Si la empresa no viene en el enlace
  (`#registro?empresa=02`) ni en la marca (`registroClientes: '02'`), el formulario pide el **código de la empresa**
  y muestra su nombre al confirmarlo. Vale para todas las empresas activas con Transporte (lo revisa la base).
- `registroClientes: false` en una marca oculta el botón.

## 2026-10-05 · Imágenes del encabezado solo desde `css/encabezados.css`

Sin SQL. Recargar con **Ctrl + F5**.

- **Un solo archivo para las imágenes del encabezado:** `css/encabezados.css` (imagen del título, logos de la
  esquina y logo chico), con una regla por **marca** (`html[data-marca="..."]`) y por **empresa interna**
  (`html[data-empresa="01"]`). Se elige según lo activo y cambia al iniciar sesión, cambiar de empresa o salir.
- Se quitaron de `empresas/empresas.js` los campos `encabezado`, `encabezadoAjuste`, `encabezadoEnfoque`, `logo` y
  `logoFondo` (y las imágenes de `css/index.css`). `icono` queda solo para la pestaña del navegador.
- Ya cargadas: ACACHETE (banner), marca Otoya y empresa **02** · Transportes Otoya (`img/img-encabezado.jpg`, completa).
- **Empresa principal = 01, siempre distinta:** encabezado y logos de ACACHETE y **colores originales** en cualquier
  marca (ni la paleta de la marca ni una guardada la cambian). En Tiendas → Empresas su ID y su paleta no se
  pueden cambiar, y ninguna otra empresa puede usar el 01: las demás parten de la 02. `registroClientes` de la
  marca Otoya corregido a `'02'`.
- `herramientas\empresas.bat`: la marca nueva deja su regla en `css/encabezados.css`; se quitó la opción "Logos".

## 2026-10-05 · Sección Empresas renombrada y modelos de paleta en un solo lugar

Sin SQL. Recargar con **Ctrl + F5**.

- La sección **Empresas** (pestaña de Tiendas) ahora es **`empresas-internas`**: `secciones/empresas-internas.html`,
  `js/secciones/empresas-internas.js`, `css/secciones/empresas-internas.css` y la guía
  [secciones/empresas-internas.md](secciones/empresas-internas.md). Así ya no se confunde con `empresas/empresas.js`
  (marcas). Un enlace viejo a `#empresas` abre la nueva.
- **Modelos de paleta en un solo lugar:** `PALETAS_MODELO` en `empresas/empresas.js`. Los ofrecen Tiendas → Empresas
  y `herramientas\empresas.bat` (antes cada uno tenía su copia). Se agregó **"Verde Otoya"**.
- La muestra "Colores de la marca" lee los colores originales de `css/variables.css` (se quitó la copia que tenía la
  sección).

## 2026-10-05 · Paleta por empresa al iniciar sesión, logos por marca y limpieza

→ **Ejecutar `sql/01_actualizacion_base_existente.sql` completo** (agrega el **bloque 21**). Recargar con **Ctrl + F5**.

- **Corrección:** Tiendas daba "No se pudieron cargar las tiendas. Revisa la conexión" después del bloque 20 (contaba
  usuarios con `usuarios(count)`, que ya no se permite). Ahora trae `usuarios(id)` y cuenta en la página.
- **Paleta de cada empresa interna:** Tiendas → Empresas → Nueva / Modificar pide la **paleta de colores**
  (modelo o 2 colores propios). Se guarda en `empresas.colores` y la página se pinta con ella **al iniciar sesión**
  con un usuario de esa empresa (por su ID); al cerrar sesión vuelven los de la marca.
- **Logos por marca** en `empresas/empresas.js` (`logo`, `logoFondo`, `icono`): un solo `app.html` para todas
  las marcas (no hace falta un index por empresa).
- **`herramientas\empresas.bat`**: una sola herramienta (sin Python) para nueva empresa con logos y paleta, cambiar
  su base, su paleta, sus logos o la empresa activa. Reemplaza a `python/nueva_empresa.py` y
  `herramientas/cambiar_supabase.*`.
- `registroClientes` de Otoya corregido a `'01'` (su ID real en la base).
- **A la papelera de reciclaje** (sin uso o repetidos): `python/nueva_empresa.py`, `herramientas/cambiar_supabase.ps1`
  y `.bat`, `img/imagen-muestra.png`, `img/img-logo.png`, `img/logo-web.png`, `img/logo.jpg`, `img/secur-icon.png` y
  `logo app.png` (copia exacta de `img/logo.png`).

## 2026-10-04 · Seguridad: claves cifradas, borrar solo en la empresa y el cliente solicita su usuario

→ **Ejecutar `sql/01_actualizacion_base_existente.sql` completo** (agrega el **bloque 20**). Recargar con **Ctrl + F5**.
Los usuarios siguen entrando con la **misma contraseña** (se cifra la que ya tenían).

- **Contraseñas cifradas (bcrypt):** la base cifra la clave sola al crear o cambiar un usuario. El login la compara
  dentro de la base (`iniciar_sesion`) y la página **ya no puede leer** la columna `clave`. ⚠ Si se agrega una columna a
  `usuarios`, ejecutar `select public.usuarios_ocultar_clave();`.
- **Borrar y modificar solo dentro de la empresa:** en `js/supabase.js`, `update` y `delete` de las tablas por empresa
  llevan siempre la empresa activa; sin empresa activa **no se borra nada** (error `SIN_EMPRESA`).
- **`herramientas/vaciar_base_datos.sql` pregunta qué empresa:** se escribe el ID (`'02'`) y su nombre exacto para
  confirmar; borra solo lo de esa empresa (puede conservar sus Administradores). Para toda la base: `'TODAS'` +
  `'BORRAR TODO'`. Sin escribir la empresa se detiene sin borrar.
- **El cliente solicita su usuario** (empresas con Transporte): enlace `app.html#registro?empresa=02` o
  "¿Eres cliente? Solicita tu usuario" en el login (`registroClientes` en `empresas/empresas.js`). Queda pendiente;
  aviso al Administrador y G1; se aprueba en **Clientes → Revisar**. Ver [secciones/viajes.md](secciones/viajes.md).

**Probar:** [11-pruebas.md](11-pruebas.md), sección "Seguridad y solicitud de usuario".

## 2026-10-04 · Transporte, fases 2 a 7: viajes con agenda, clientes con usuario, costos y cortesía

→ **Ejecutar `sql/01_actualizacion_base_existente.sql` completo** (agrega el **bloque 19**). Recargar con **Ctrl + F5**.
Diseño: [14-transporte.md](14-transporte.md) · Guía: [secciones/viajes.md](secciones/viajes.md).

- **Sección Viajes** (solo si la empresa hace viajes): solicitud en 4 pasos (personas y mascotas obligatorias, ruta A → B
  con Casa y Trabajo, día y hora libres con su precio, confirmar), agenda del personal (resumen, filtros, cambiar la
  hora, cancelar, avanzar) y botones del conductor ("Voy en camino", "A bordo", "Terminar", "No se presentó").
- **Reservas seguras en la base:** `viajes_solicitar`, `viajes_cambiar_hora`, `viajes_cancelar`, `viajes_avanzar` y
  `viajes_horas_disponibles` revisan las reglas, asignan vehículo y conductor y evitan que dos clientes tomen la misma
  hora. La página solo lee `viajes` y `cortesias`.
- **Rol cliente:** Clientes → botón de llave "Acceso y lugares" (usuario `mramirez02`, contraseña, Casa y Trabajo). El
  cliente solo ve Inicio, Viajes y Mi perfil; no aparece en Usuarios.
- **Configuración → Transporte:** franjas de precio por km (no se enciman), recargos fijos, agenda, días cerrados,
  **costos del mes** (gasto ÷ horas y km = costo por hora y por km, estimado y real) con el margen de cada franja,
  simulador km × franja y reglas del viaje de cortesía.
- **Vehículos:** asientos, carga, acepta mascotas, km por litro, horas y km del mes; tipos **Automóvil** y **Microbús**.
- **Viaje de cortesía automático:** 5 viajes terminados en 15 días = 1 cortesía (vence en 30 días, se aplica sola, vuelve
  si se cancela a tiempo).
- **Empresa solo de Transporte:** no ve Pedidos, Rutas, Cotizador ni Configuración → Pedidos / Slots; su **Inicio** y su
  **Reportes** muestran los viajes; el pie "Crear Viaje" abre la solicitud. Con Transporte + otra actividad, Reportes
  suma la pestaña **Viajes**.
- **Exportaciones con el dato correcto:** Excel y PDF de Reportes (y la impresión de QR) llevan el **nombre de la
  empresa** con la que se trabaja (ya no "ACACHETE LOGISTICS"), los **colores de su paleta** y sus palabras
  (Pedido → Viaje, Piloto → Conductor).
- `herramientas/prueba_logica_viajes.html`: prueba sin base de datos de precios, costos y palabras (abrir con doble clic).

**Probar:** [11-pruebas.md](11-pruebas.md), sección "Transporte: viajes".

## 2026-10-04 · Transporte, fase 1: Pedido → Viaje

→ **Ejecutar `sql/01_actualizacion_base_existente.sql` completo** (agrega el **bloque 18**). Recargar con **Ctrl + F5**.

- Actividad **Transporte** (`transporte`) en la base, con sus palabras: viaje / viajes, conductor / conductores.
  Si ya se había creado desde la página con ese código, solo se le ponen las palabras.
- **Palabras por actividad** (`palabra_registro`, `palabra_registros`, `palabra_conductor`, `palabra_conductores`),
  editables en Configuración → Actividades.
- **`js/palabras.js`**: si todas las actividades de la empresa usan la misma palabra, la página dice "Viaje(s)" y
  "Conductor(es)" en vez de "Pedido(s)" y "Piloto(s)" en todo lo que se ve, incluidos alert/confirm. Cambia al entrar,
  al cambiar de empresa y al salir (`actualizarSegunEmpresa()` en `js/sesion.js`). No toca ids, enlaces ni la base.
- `python/nueva_empresa.py`: opción **4 · Transporte**.
- (Los Excel y PDF de Reportes quedaron corregidos en la entrada de arriba.)

**Probar:** [11-pruebas.md](11-pruebas.md), sección "Transporte: Pedido → Viaje".

## 2026-10-04 · Nueva actividad y paleta por empresa

→ **Sin SQL.** Recargar con **Ctrl + F5**.

- **Configuración → Actividades → Nueva actividad** (solo Desarrollador): nombre, código (sale del nombre),
  descripción, icono, activa y qué usa; se puede agregar de una vez a la empresa con la que se trabaja.
  La ventana ahora muestra **todas** las actividades y marca "No la realiza esta empresa". El icono también
  se puede cambiar al modificar. Primer uso previsto: **Transporte** ([14-transporte.md](14-transporte.md)).
- **Paleta por empresa interna**: `COLORES_POR_EMPRESA` en `empresas/empresas.js` (clave = ID de la
  empresa). Se aplica al entrar, al cambiar de empresa y vuelve a la de la marca al cerrar sesión
  (`aplicarColoresEmpresa()`, llamada desde `guardarSesion` / `cerrarSesion` en `js/sesion.js`).

## 2026-10-02 · Mejoras traídas de SISCED

→ **Ejecutar `sql/01_actualizacion_base_existente.sql` completo** (agrega los **bloques 16 y 17**). Después,
cerrar sesión y volver a entrar. ⚠ **Los usuarios se renombran una sola vez**: `cen-001-jperez` →
`cenjperez01` (región + nombre + empresa, sin la tienda), `jlopez` → `jlopez01` (`admin` y `desar` no cambian).
Si dos quedarían iguales, el segundo recibe un número (`cenjperez201`). Avisar a cada uno su usuario nuevo.
Hacer una copia de las tablas antes (Table Editor → Export).

### Empresas internas con ID
Guía: [secciones/empresas-internas.md](secciones/empresas-internas.md).
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
