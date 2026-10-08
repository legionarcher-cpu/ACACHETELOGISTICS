# 11. Lista de pruebas

Usar después de cada cambio, en la sección afectada (y en **General** siempre).
Probar con al menos 3 usuarios: **Administrador**, un **Admin G2** y un **Empleado** (y el **Piloto**
si se tocó Pedidos o Inicio). Tener la consola abierta (F12): no debe aparecer ningún error rojo.

## General

- [ ] El login entra con usuario correcto y rechaza uno incorrecto (mensaje + sacudida).
- [ ] Se ven el logo animado, el logo y título de la empresa, la fecha y el pie correctos.
- [ ] El menú muestra candados según el rol; una sección bloqueada no se abre ni escribiendo el `#`.
- [ ] Cambiar entre secciones con el menú y con atrás/adelante del navegador.
- [ ] Cerrar sesión vuelve al login y otro usuario no ve la última sección del anterior.
- [ ] Celular (F12 → modo dispositivo, 390 px): botón ☰, menú, pie solo con iconos, sin barra horizontal.
- [ ] Computadora (F12 → modo dispositivo, "Responsive"): en 1366×768, 1920×1080 y 2560×1440 la pantalla se
      ve igual de proporcionada (solo más chica o más grande); la foto del usuario cabe en el encabezado, nada
      se sale ni queda una barra horizontal. En un monitor ultra ancho la sección queda centrada.

## Empresas internas (sql/01 bloque 16)
- [ ] Después de los bloques 16 y 17: los usuarios de tienda quedaron como `cenjperez01` (región + nombre +
      empresa, sin la tienda) y los administradores `jlopez01` (`admin` y `desar` igual); entran con el nombre
      nuevo. Dos "jperez" de tiendas de la misma región: el segundo queda `cenjperez201`. Repetir el archivo
      01 completo no da error ni los vuelve a renombrar.
- [ ] Cambiar a un empleado de tienda dentro de la misma región: su usuario no cambia.
- [ ] Menú del usuario: todos ven "Empresa · 01 · Empresa principal"; el **Desarrollador** ve un selector y al
      cambiar de empresa la sección se recarga solo con lo de esa empresa (tiendas, usuarios, pedidos...).
- [ ] Tiendas → pestaña **Empresas** solo la ve el Desarrollador (otros: ni la pestaña ni `#empresas-internas`).
- [ ] Nueva empresa: propone el siguiente ID (02); no deja un ID repetido ni sin actividades; con "Copiar la
      configuración" la nueva tiene las categorías, artículos, tarifas y descuentos generales de sus actividades.
- [ ] Cambiar el ID de una empresa con usuarios avisa cuántos se renombran y los renombra (…01 → …05).
- [ ] Empresa **Inactiva**: sus usuarios no entran ("Tu empresa está inactiva").
- [ ] Empresa solo de Encomiendas: no aparece "Entregas de tienda" en Pedidos, Reportes, Rutas ni
      Configuración; con solo Entregas de tienda no aparece el botón del Cotizador.
- [ ] Usuarios (Desarrollador): al elegir rol Administrador o Admin G1 aparece **Empresa (ID)**; el usuario
      muestra el ID al final y "Inicia sesión como jperez02". Si es otra empresa, el aviso lo dice y no sale en
      la lista hasta cambiarse a esa empresa.
- [ ] Un Administrador solo ve los usuarios, tiendas, clientes y pedidos de **su** empresa; no ve el
      selector de empresa ni la pestaña Empresas.
- [ ] Tiendas → **Regiones** (Administrador y G1): crear, renombrar y eliminar (no deja con tiendas).
- [ ] Configuración → tarjeta **Empresas** (solo Desarrollador) abre "Nueva empresa".

## Inicio
- [ ] Saludo con nombre, fecha, empresa y alcance; accesos rápidos según el rol.
- [ ] Administrador / G1 / G2: cuadros **Pedidos de hoy · En ruta · Entregados · Sin piloto** con números
      correctos (G2 solo su región); cada uno abre Pedidos ya filtrado.
- [ ] Gráfica de 14 días (entregados, no entregados, sin terminar); "Hoy por tienda" abre Pedidos de esa tienda;
      "Pendientes" lista sin piloto, no entregados, pilotos sin validar, clientes y usuarios por aprobar.
- [ ] Admin G3: lo mismo de su tienda, sin "Hoy por tienda". Empleado: cuadros de su tienda y "Mis solicitudes".
- [ ] Piloto: cuadros (por recibir, en ruta, entregados, marcas), **Mi ruta** con su botón por estado y
      "Saliendo a ruta", **Mis marcas de hoy** (validación del QR, escanear, Mi QR del día).
- [ ] Se actualiza solo cada minuto (cambiar un pedido en otra ventana y esperar).
- [ ] Celular: cuadros de 2 en 2, todo en una columna, botones de Mi ruta a lo ancho.

## Inicio: mapa
- [ ] El mapa gratis (OpenStreetMap) carga y se encuadra con las entregas de hoy; se puede mover y acercar.
- [ ] Cada pedido de hoy con punto B aparece en su lugar con el color de su estado (leyenda al lado); al
      tocarlo se ve el pedido, cliente, dirección y piloto, con enlace al detalle. Las tiendas con ubicación se
      ven como cuadro. Abajo dice cuántos pedidos no tienen punto.
- [ ] Filtros de región y tienda según el rol (Admin / G1 ambos, G2 solo tienda, G3 / Empleado / Piloto ninguno):
      filtran los marcadores y la lista "Pilotos de hoy".
- [ ] Piloto: sus entregas numeradas en el orden de Mi ruta.
- [ ] El mapa no tapa el menú del usuario, la campana ni el menú ☰ en celular; se reacomoda al cambiar el tamaño.
- [ ] Salir de Inicio y volver: el mapa aparece de nuevo sin errores en la consola.

## Pedidos cercanos (plan piloto: un solo viaje)
- [ ] Registrar una encomienda con recolección y entrega en el mapa (piloto Juan, hoy).
- [ ] Registrar otra para hoy con la recolección o la entrega a menos de 1 km: aparece "Pedidos cerca de este
      recorrido" con el primero, su piloto y su estado. Una a más de 1 km: no aparece.
- [ ] Como G2: "Asignar a Juan" pone ese piloto y el botón queda "Asignado a este piloto". Registrar: Juan recibe
      "Nuevo pedido cerca de tu recorrido … aprovecha el mismo viaje".
- [ ] Como Empleado (sin elegir piloto): el G2 recibe "Pedido nuevo sin piloto, cerca de otro recorrido" con la sugerencia.
- [ ] Con otro piloto asignado: el G2 recibe "Pedido cerca de otro recorrido … valora reasignarlo".
- [ ] Detalle del pedido: fila "Cerca de este pedido" con enlaces; el piloto solo ve los suyos. Un pedido entregado o
      cancelado ya no aparece como cercano.
- [ ] Pedidos que salen de la tienda (A = tienda): no se consideran cercanos solo por salir del mismo lugar.
- [ ] Medición: en el historial del pedido (evento "registrado") quedan los cercanos y si quedó con el mismo piloto.

## Pedidos
- [ ] Lista: una **pestaña por actividad** con su número; cada pestaña muestra solo sus pedidos, sus
      rutas y su columna (Tienda: "Compra" + "Lleva alcohol"; Encomiendas: "Peso", "Punto de partida:" y el
      cuadro "En bodega"). La pestaña se recuerda al volver; con una sola actividad no hay pestañas.
- [ ] Filtros de fecha, tienda, ruta y estado; resumen filtra; buscador.
- [ ] "Nuevo pedido" desde una pestaña abre el formulario con esa actividad elegida.
- [ ] Nuevo pedido **Entregas de tienda**: abarrotes (con alcohol), línea blanca con peso automático y
      cambiado a mano, monto de compra, envío gratis, cobrar la compra, vuelto.
- [ ] Abarrotes con 5 cajas y 2 bolsas: en el detalle salen dos líneas, "Cajas · 5" y "Bolsas · 2" (no "Cant. 1"),
      y el peso total suma el peso aproximado. Escribir 2.5 cajas muestra un mensaje y no guarda.
- [ ] "¿El cliente ya pagó en línea?": "Envío pagado" y "Compra pagada" vienen **sin marcar** y el total a cobrar
      incluye todo (en todas las empresas). Marcar "Compra pagada" la quita del total; marcar todo deja ₡0, el botón
      verde, "Todo pagado en línea" y oculta Forma de pago y Paga con. En el detalle sale "Pagado en línea: …".
- [ ] Nuevo pedido **Encomiendas**: punto de partida, cajas con tamaño y peso, documentos, línea blanca;
      estado inicial "En bodega" sin piloto.
- [ ] Horario lleno no se puede elegir; ruta sugiere el piloto; descuento aplica; total correcto.
- [ ] Se abre el QR; descargar y WhatsApp funcionan.
- [ ] Detalle: acciones según rol y estado (G2 asigna, Empleado solicita, Piloto entrega). Ya **no hay botón
      Anular** ni "Ver anulados": solo Cancelar (con motivo).
- [ ] Botones del pie "Reasignar horario" y "Cancelar pedido" abren la lista en ese modo.

## Slots y flujo de despacho (antes: sql/01 bloque 12)
- [ ] Configuración → Slots: cambiar la cantidad (subir crea después del último; bajar pide confirmación),
      las horas de un slot (no se pueden encimar) y los slots de un día ("Usar base" los quita). G2 solo ve.
- [ ] Nuevo pedido: el Empleado elige el **Slot** y NO ve "Horario del piloto"; G2+ ve los dos.
      Lista, detalle e Inicio: G3 / Empleado ven el slot, no la marca; Piloto y G2+ ven ambos.
- [ ] Empleado: **Alistando** → **Listo para despachar** (pide el slot, viene el del registro) → el pedido
      queda "Listo para despachar" en ese slot.
- [ ] Piloto (en Inicio → Mi ruta o en el detalle): **Recibido para ruta** abre el QR (sin WhatsApp).
- [ ] La lista de Pedidos ya NO tiene "Escanear despacho". En el detalle de un pedido "Listo para despachar"
      está **Aprobar salida**, desactivado (con globo) hasta que el piloto marca "Recibido para ruta".
- [ ] Empleado: **Aprobar salida** (https o localhost) lee el QR de ESE pedido → "✔ Salida aprobada… Slot 2: 1 de 3
      cargados" y la ventana se cierra; el QR de otro pedido da aviso y no carga nada. Sin cámara: escribir el
      número del pedido.
- [ ] Piloto, Inicio → **Mis marcas de hoy** (en vez de la actividad reciente): antes de "inicia desde" dice "Todavía no se habilita"
      (sin mostrar esa hora); luego se abre solo (máx. 30 s); después de la **hora inicio** dice "Marca tardía" y al
      escanear pide escribir por qué (sin motivo no marca); G2 recibe el aviso con el motivo. Después de "termina"
      ya no se puede marcar. Marcar dos veces: mensaje de la base.
- [ ] Configuración → Horarios: la tabla muestra Inicia desde / Hora inicio / Termina; el piloto en Pedidos e
      Inicio solo ve "hora de inicio … termina …".
- [ ] Piloto: el menú deja abrir **Reportes**; solo ve sus pedidos, las fechas no salen de los últimos 7 días,
      no hay región / tienda / "ver por" y puede exportar Excel / PDF de lo suyo.
- [ ] Piloto: **Saliendo a ruta (N)** pasa los cargados a En ruta; la lista queda ordenada en cadena desde la
      tienda con "Siguiente" y la distancia al anterior.
- [ ] **Entregar ahora** en uno: los demás quedan desactivados hasta cerrar ese con Entregado / No entregado.
- [ ] En Supabase: `select * from pedidos_tiempos` y `select * from slots_carga` muestran los minutos de cada
      paso y la carga del slot (5 pedidos, 3 cargados → completo = false; min_carga corre hasta la salida).
- [ ] Reportes: "Cancelaciones por motivo" cuenta los cancelados agrupados por su motivo.

## Notificaciones (probar con dos navegadores o una ventana privada, cada uno con su usuario)
- [ ] Empleado crea un pedido sin piloto → al G2 de la región le llega "Pedido nuevo sin piloto"; al asignarle
      piloto el aviso se cierra y al piloto le llega "Nuevo pedido asignado".
- [ ] "Listo para despachar" → el piloto recibe el aviso; "Recibido para ruta" → al G3 de la tienda le llega
      "Aprobar salida"; al escanear el QR se cierra y al piloto le llega "Salida aprobada".
- [ ] "Saliendo a ruta" → el G3 recibe "Piloto en ruta" con los números de pedido.
- [ ] Piloto marca **No entregado** con motivo → el G2 recibe "Pedido no entregado: reprogramar o cancelar" (con
      el motivo) y el G3 un aviso informativo. El G2 reprograma (o cancela) → su aviso se cierra y el G3 y el
      piloto reciben el resultado.
- [ ] La tienda cancela → al G2 y al piloto les llega "Pedido cancelado" con el motivo.
- [ ] Siguen funcionando: cliente de un Empleado → G3; empleado creado por un G3 → G2 y administradores (solo al
      crearlo, no al corregirlo); solicitud de reasignación → G2 y su resultado → quien la pidió.
- [ ] Al piloto, la tarjeta del QR NO le muestra el código de entrega del cliente.
- [ ] Piloto marca un horario (Inicio → Mis marcas de hoy) → al Admin G3 y a los Empleados de la tienda de sus
      pedidos de ese horario les llega "Piloto en tienda: despachar pedidos" con los números.

## QR (antes: sql/01 bloque 14; con https o localhost para la cámara)
- [ ] Encabezado: botón **Escanear QR** junto a la campana (sin sesión no se ve).
- [ ] Tiendas → icono QR de una tienda: QR de marcas "válido en <mes>", se descarga e imprime.
- [ ] Rutas y asignaciones (G2): lista de pilotos con "Sin validar hoy" y **QR de hoy** (nombre + foto).
- [ ] Piloto sin validar escanea el QR de marcas → "La tienda todavía no te ha validado hoy...".
- [ ] Tienda (G3 o Empleado) escanea el QR de hoy del piloto → ficha con foto grande y nombre, "Validado hoy a
      las…"; en Rutas pasa a "Validado HH:MM"; en el Inicio del piloto: "La tienda te validó hoy…".
- [ ] Piloto escanea el QR de marcas con un horario abierto → "✔ Horario N marcado…", la marca queda en verde y
      a la tienda le llega "Piloto en tienda: despachar pedidos". Sin horario abierto → "el próximo se habilita a
      las…". Un QR de marcas del mes anterior → "ya no sirve (cambia cada mes)".
- [ ] Cualquiera escanea el QR de un pedido de su alcance → ventana con toda su información y "Abrir pedido";
      de otro alcance → "no tienes acceso".
- [ ] El botón "Marcar" por horario ya no existe: solo se marca con el QR.

## Accesos del Admin G3
- [ ] Usuarios y Configuración aparecen con candado; escribir `#usuarios` o `#configuracion` muestra "No tienes
      permiso"; el menú del usuario ya no muestra "Configuración" (tampoco al Empleado ni al Piloto).

## Mapa A → B (Pedidos y Cotizador)
- [ ] Antes: ejecutar `sql/01_actualizacion_base_existente.sql` (bloque 9: ubicación de las tiendas).
- [ ] Poner precio por km en una tarifa (Configuración → Pedidos → Tarifas) para probar el cobro.
- [ ] Pedidos muestra el mismo bloque que el Cotizador: "A · Punto de partida" y "B · Entrega" juntos, con el mapa debajo (aparece siempre, aunque aún no haya tiendas).
- [ ] Entregas de tienda: el campo A dice "A · Tienda", está desactivado y muestra la tienda; al escribir la entrega
      y salir del campo, B se ubica solo y aparecen los km.
- [ ] Encomiendas: con punto de partida escrito, A = ese punto; sin él, A = la tienda. Escribir un punto de partida,
      cambiar a Entregas de tienda y volver: lo escrito sigue ahí.
- [ ] Mover A o B (clic con "Clic en el mapa pone" o arrastrando) cambia los km y el precio.
- [ ] Pegar "9.93, -84.08" o un enlace de Google Maps en la dirección ubica el punto exacto.
- [ ] Con precio por km y sin A o B, el pedido no se guarda (mensaje claro).
- [ ] Admin/G1: "Guardar A como ubicación de la tienda"; el siguiente pedido ya sale de ese punto.
- [ ] Detalle del pedido: distancia y enlaces "Ir con Google Maps / Waze"; desglose con la línea de distancia.
- [ ] Mismo A, B, peso y tienda en el Cotizador y en Pedidos → mismo precio.
- [ ] Escribir en punto de partida o entrega: tras una pausa aparecen sugerencias (↑ ↓ Enter funcionan);
      al elegir una, el punto se pone y NO se mueve al salir del campo.
- [ ] Mover el mapa a otra zona y buscar: salen primero los lugares de esa zona.
- [ ] La rueda del mouse baja la página; tras un clic en el mapa, acerca el mapa.
- [ ] Celular (≤ 600 px): botones del mapa a lo ancho, "Ampliar mapa" agranda y achica; en el Cotizador
      la barra del precio queda fija abajo, "Ver detalle" baja al desglose y los bultos se ven como tarjetas.

## Cotizador
- [ ] El botón "Cotizador" aparece solo si la empresa realiza Encomiendas; el Piloto no lo ve.
- [ ] Mismo peso y tienda que un pedido de Encomiendas → mismo precio (ej. 2500 mínimo / 2 kg / 500 → 4 kg = 3500).
- [ ] Artículo del catálogo llena su peso; documentos usan 0.2 kg; tamaño solo en cajas y bolsas.
- [ ] Tarifa de tienda / región / general según la tienda elegida; descuento se resta.
- [ ] Copiar y WhatsApp llevan el detalle; "Registrar pedido" abre el formulario con Encomiendas.

## Rutas
- [ ] Crear ruta (con y sin actividad), asignar piloto un día y la semana, quitar un día.
- [ ] Un piloto multitienda no se puede poner en dos tiendas el mismo día.
- [ ] G3 solo ve; Empleado no entra.

## Pilotos · Tiendas · Clientes
- [ ] Pilotos: filtro de región y buscador; G2 solo su región.
- [ ] Tiendas: crear (número sugerido), modificar, cambiar código: con otro número en la misma región los
      usuarios no cambian (sin aviso); con otra región avisa y se renombran (`cen…01` → `nor…01`). Eliminar sin usuarios.
- [ ] Pestañas **Tiendas | Clientes** arriba de las dos secciones (Empresas solo el Desarrollador); ya no hay
      botón "Agregar clientes" en Tiendas.
- [ ] Tiendas: el botón **Nuevo cliente** de una fila abre Clientes con el formulario y esa tienda marcada.
- [ ] Clientes (Administrador con varias regiones): primero pide la **región** (cuadros con el número de
      clientes); luego filtros región → tienda → ruta. G2, G3 y Empleado van directo a la lista.
- [ ] Clientes: en cada tienda marcada se elige su **ruta de entrega**; la columna "Tiendas y rutas" la muestra
      y el filtro de ruta la encuentra.
- [ ] Clientes: una ubicación con coordenadas (`9.93, -84.08`) se ve como "Ver en mapa".
- [ ] Nuevo pedido con el cliente escrito a mano: al registrar, el cliente aparece en Clientes (aprobado, en esa
      tienda y ruta) con su dirección y su ubicación; el siguiente pedido lo encuentra por teléfono y pone el
      punto B solo. Con un teléfono que ya existe no se duplica (se usa ese cliente).
- [ ] Nuevo pedido con un cliente elegido sin ubicación: después del pedido ya tiene ubicación.
- [ ] Clientes: Empleado crea → queda pendiente → G3 aprueba desde "Revisar" → llega la notificación. En una
      tienda sin G3 ni G2 en su región, el aviso llega al Administrador y G1.
- [ ] Clientes: formulario con Nombre, Primer y Segundo apellido, Teléfono y Correo. Sin primer apellido o con
      teléfono de menos de 8 dígitos no guarda; un correo mal escrito avisa; un correo que ya tiene otro
      cliente avisa "Ya hay un cliente con ese correo". La tabla muestra la columna Correo.
- [ ] Clientes: el buscador encuentra "perez" en "Pérez", "8888 1234" en "8888-1234" y por correo.
- [ ] Pedidos → Cliente (por teléfono o correo): escribir el teléfono completo ("8888-1234", "88881234" o
      "+506 8888 1234") o el correo entero llena **solo** nombre, teléfono, dirección y punto B (sin tocar nada).
- [ ] Con parte del teléfono o del correo salen tarjetas para tocar; dos clientes con el mismo teléfono → salen
      los dos para elegir. Escribir un nombre no busca (pide teléfono o correo). ↑ ↓ Enter eligen; Escape
      cierra; Enter no envía el formulario.
- [ ] Teléfono completo que no existe: aviso y el teléfono queda escrito en "Teléfono"; falta solo el nombre.
- [ ] Al elegir: aparece la ficha verde con "Cambiar".
      Cambiar de tienda o "Cambiar" vuelve al buscador vacío. Solo salen clientes aprobados de la tienda.
- [ ] Celular (390 px) y PC (1366 / 1920 / 2560): tarjetas fáciles de tocar, la lista se desliza sin elegir por error,
      el botón "Cambiar" queda a lo ancho en celular.

## Usuarios
- [ ] Crear cada rol (el G3 ya no entra a Usuarios); foto; al crear un Piloto, la lista de vehículos sale
      agrupada por tipo ("P123ABC · Toyota · Camión"); "Registrar vehículo nuevo" pide tipo, marca y placa
      (sin tipo no guarda) y el vehículo aparece con su tipo en Configuración → Vehículos.
- [ ] Cambiar de tienda a un piloto: asignaciones y pedidos pendientes liberados, aviso al G2.
- [ ] El usuario `admin` no se puede eliminar ni cambiar de rol.
- [ ] Crear un Empleado: el campo muestra `cen` + nombre + `01` y "Inicia sesión como cenjperez01";
      modificarlo muestra solo `jperez` en el campo.

## Reportes
- [ ] Una **pestaña por actividad**: los números, gráficas y tabla son solo de esa actividad (comparar
      con la lista de Pedidos de la misma pestaña y fechas).
- [ ] Entregas de tienda: tarjetas "Compras" y "Con alcohol", gráfica "Compras por tienda", columnas
      Compra y Alcohol. Encomiendas: "Peso transportado", "En bodega", "Con punto de partida", gráfica
      "Bultos por tamaño", columnas Punto de partida y Bultos.
- [ ] Filtros en cascada; la dirección guarda los filtros y la actividad; "Limpiar" no cambia la pestaña.
- [ ] Excel y PDF llevan la actividad en el título, en los filtros y en el nombre del archivo.
- [ ] Exportar Excel y PDF (G2); G3 no ve los botones de exportar.

## Configuración
- [ ] Horarios: base, horas, horario por día (incluido domingo sin horarios), ajuste por región/tienda.
- [ ] Vehículos: agregar con tipo; "Sin tipo" en los viejos; filtro y buscador.
- [ ] Pedidos: tarifas, descuentos, categorías por actividad, artículos (pesos promedio), tamaños,
      motivos, número de pedido, código de respaldo.
- [ ] Calculadora de precios (Python): primera carga y tabla correcta (ej. 2500 mínimo / 2 kg / 500 → 4 kg = 3500).
- [ ] Tarifas → crear o modificar: abajo se lee la regla en palabras y cambia al escribir ("Hasta 2 kg: ₡2500.00",
      "Más de 2 kg: + ₡500.00 por cada kg...", "Distancia: + ₡X por km" y el ejemplo con 10 km).
- [ ] Simulador con una tarifa CON precio por km: columnas 0, 5, 10... km; cada precio = el de 0 km + km × precio por km.
- [ ] Simulador con una tarifa SIN precio por km: el grupo "Distancia" se ve apagado y sale una sola columna "Envío".
- [ ] La línea naranja aparece justo antes del primer peso con kg adicionales; en celular la columna Peso queda fija al deslizar.
- [ ] Varias simulaciones se apilan (la nueva arriba); ✕ borra una; "Borrar todos" las quita y oculta el contador.
- [ ] Si ya se había usado la calculadora antes del cambio, recargar la página (F5) para que tome el Python nuevo.
- [ ] Actividades (Desarrollador): la ventana se abre sobre las tarjetas; cambiar "qué usa" se refleja en Pedidos.
- [ ] Actividades → Nueva actividad: el código sigue al nombre ("Envíos Exprés" → `envios_expres`) hasta que se
      escribe a mano; código repetido o inválido avisa; con "Agregarla a la empresa" aparece enseguida su pestaña en
      Pedidos y su casilla en Tiendas → Empresas. Las que la empresa no hace dicen "No la realiza esta empresa".
- [ ] Palabras: escribir solo el singular (o solo el plural) avisa; guardar "viaje / viajes" muestra "Se llama: viaje…".
- [ ] Costos de operación (empresa de pedidos y de transporte): nuevo gasto fijo y variable, horas/km/km por litro de un
      vehículo y precio del litro → cambian costo por hora y por km; "Costo por entrega" con pedidos entregados de 30 días.
- [ ] Transporte ya no muestra "Costos del mes"; la columna Margen de las franjas sigue saliendo.

## Caja de pilotos y conductores (sql/01 bloque 24)
- [ ] Configuración → Cajas: crear "Caja básica ₡50 000", asignarla a un piloto; cambiar el monto del tipo cambia su fondo.
- [ ] Piloto: marcar Entregado un pedido con cobro → pide Efectivo / SINPE / Tarjeta; el detalle muestra "Cómo pagó".
- [ ] Caja (G3): el piloto aparece con "N cobros sin cerrar"; efectivo a entregar = fondo + efectivo.
- [ ] SINPE sin verificar no entra al cierre; al marcar Verificado sí. Cambiar la forma de un cobro recalcula.
- [ ] Efectivo contado → Cuadra / Sobrante / Faltante. Cerrar caja → aparece en Cierres anteriores y los cobros salen.
- [ ] G3 de otra tienda no ve al piloto; el piloto ve su caja sin arqueo ni botón de cerrar.
- [ ] Empresa con el plan sin "Caja": no aparece en el menú ni la tarjeta Cajas.

## Mis envíos: el cliente solicita recolección y entrega (sql/01 bloque 23)
- [ ] Cliente de una empresa de encomiendas: el menú muestra "Mis envíos"; sin viajes, Inicio lo lleva ahí.
- [ ] Solicitar: sin ubicar A o B en el mapa no deja enviar; "Otra persona" pide nombre y teléfono.
- [ ] Al enviar, al G3 de la tienda le llega "Solicitud de envío de un cliente" (sin G3: al G2).
- [ ] Pedidos (G3): la bandeja la muestra; "Revisar y registrar" abre el formulario lleno con A y B en los puntos del
      cliente, el bulto y las referencias en Notas. Registrar → el cliente ve "Aprobada", el pedido y su avance.
- [ ] El detalle del pedido muestra "Referencia al recoger / al entregar"; el piloto recibe su aviso de siempre.
- [ ] Rechazar con motivo → el cliente recibe el aviso y ve el motivo. Cancelar una pendiente desde Mis envíos.
- [ ] Login → "Solicita tu usuario" con el código de una empresa solo de encomiendas: la acepta; se aprueba en Clientes.

## Planes y funciones (sql/01 bloque 22)
- [ ] Sin el bloque 22, Configuración → Planes y funciones avisa "Falta ejecutar ... bloque 22".
- [ ] Las empresas existentes salen en Completo (16 de 16).
- [ ] Elegir Básico marca sus funciones; quitar una casilla pasa a Personalizado; Guardar avisa.
- [ ] Entrar con un Administrador de esa empresa: no ve Rutas, Cotizador, Slots, Costos ni el botón Exportar;
      el pie no muestra Asignar Piloto ni Cotizador. El Desarrollador sigue viendo todo.
- [ ] Sin "Solicitud de usuario de clientes", `#registro?empresa=02` dice que la empresa no recibe solicitudes.
- [ ] Volver a Completo: todo reaparece (cerrar sesión y entrar, o F5).

## Transporte: Pedido → Viaje (sql/01 bloque 18)
- [ ] Ejecutar el bloque 18: aparece la actividad Transporte con "Se llama: viaje · conductor".
- [ ] Empresa SOLO con Transporte: menú "Viajes" y "Conductores"; pie "Crear Viaje", "Asignar Conductor",
      "Cancelar viaje"; Pedidos ("Nuevo viaje"), Inicio, Reportes, avisos y ventanas de confirmar dicen viaje.
- [ ] Empresa con Transporte + otra actividad: todo sigue diciendo "Pedidos" y Pedidos tiene la pestaña Transporte.
- [ ] Desarrollador: cambiar de empresa en el menú del usuario cambia las palabras sin recargar, en los dos sentidos.
- [ ] Cerrar sesión: el login y el menú vuelven a "Pedidos".
- [ ] No cambia nada guardado: ids, enlaces (#pedidos), valores de los campos y la base siguen igual.
- [ ] Paleta de empresa interna (sql/01 bloque 21): Tiendas → Empresas → Nueva empresa no deja guardar sin elegir
      la paleta; al elegir un modelo o 2 colores la muestra cambia. Al entrar con un usuario de esa empresa toda la
      página usa esa paleta; al cerrar sesión vuelven los colores de la marca. El punto de color de la lista la muestra.
- [ ] Encabezados (`css/encabezados.css`): sin sesión se ve la imagen de la marca activa; al entrar con un usuario
      de la empresa 01 cambia a la de su regla `html[data-empresa="01"]`; al cerrar sesión vuelve la de la marca.
      El Desarrollador, al cambiar de empresa en su menú, ve cambiar el encabezado sin recargar. Una marca o empresa
      sin regla de imagen muestra el título en texto. `--encabezado-ajuste: contain` = completa con lados difuminados.
- [ ] `herramientas\empresas.bat`: opción 1 agrega la marca con su paleta y deja su regla en `css/encabezados.css`;
      3 cambia la paleta; 4 la activa.
- [ ] Paleta: con una clave en `COLORES_POR_EMPRESA`, al entrar con un usuario de esa empresa (o cambiar a ella)
      cambian los colores; al salir vuelven los de la marca.

## Transporte: viajes (sql/01 bloque 19)
Antes: abrir `herramientas/prueba_logica_viajes.html` (doble clic): todo debe decir OK.
- [ ] Empresa solo de Transporte: el menú muestra **Viajes** y no Pedidos, Rutas ni Cotizador; Configuración muestra
      **Transporte** y no Pedidos ni Slots; Inicio y Reportes muestran viajes.
- [ ] Empresa con Transporte + Encomiendas: menú con Pedidos y Viajes; Reportes con la pestaña **Viajes**; Pedidos sin
      pestaña Transporte.
- [ ] Configuración → Transporte: crear una franja L–S 06:00–22:00; otra que se encime avisa y no se guarda; el
      simulador y "en palabras" muestran los precios; guardar recargos, agenda y cortesía.
- [ ] Costos: agregar gastos fijos y variables (de un vehículo y de toda la empresa), precio del litro y horas/km del
      mes de un vehículo: aparecen costo por hora, por km y el margen de cada franja.
- [ ] Vehículos: un Automóvil con 4 asientos y un piloto asignado (Usuarios). Sin asientos o sin piloto, no recibe viajes.
- [ ] Clientes → llave "Acceso y lugares": crear usuario (sale `nombre + ID`), ubicar Casa y Trabajo; el usuario no
      aparece en Usuarios; "Quitar acceso" lo elimina.
- [ ] Entrar como cliente: solo Inicio, Viajes y Mi perfil (sin pie ni QR); Inicio con "Solicitar viaje" y la cortesía.
- [ ] Solicitar: sin marcar mascotas no deja buscar horas; 0 personas sin mercadería avisa; Casa / Trabajo llenan A y B;
      "Guardar como Casa" guarda el punto; las horas salen cada 15 min con precio y las ocupadas en gris.
- [ ] Confirmar: queda **Confirmado** con vehículo y conductor; el conductor recibe el aviso en la campana.
- [ ] Dos navegadores piden la misma hora con un solo vehículo: el segundo recibe "Esa hora acaba de ocuparse".
- [ ] Un viaje de 30 min bloquea al vehículo desde 15 min antes hasta 10 min después (horas vecinas en gris).
- [ ] Día cerrado y domingo sin franja: "Ese día no hay servicio".
- [ ] Cliente: "Cambiar hora" y "Cancelar" solo hasta 2 h antes; después ya no salen (y la base lo rechaza).
- [ ] Conductor: "Voy en camino" (el cliente recibe el aviso) → "A bordo" → "Terminar".
- [ ] Cortesía: al terminar el 5.º viaje en 15 días el cliente recibe el aviso; el siguiente viaje dentro del radio sale
      en ₡0 + recargos; al cancelarlo a tiempo la cortesía vuelve.
- [ ] Reportes → Viajes: resumen, por franja, por vehículo (costo y margen), detalle; Excel y PDF con el nombre y los
      colores de la empresa.
- [ ] Reportes de pedidos: Excel y PDF dicen el nombre de la empresa (no "ACACHETE LOGISTICS") y usan su paleta.
- [ ] Con otra empresa activa, Configuración → Pedidos y Vehículos muestran solo lo de esa empresa; en una
      empresa nueva sin tarifas, "Nueva tarifa" ofrece "General".

## Seguridad y solicitud de usuario (sql/01 bloque 20)
- [ ] Después de ejecutar el bloque 20, `admin`, un piloto y un cliente entran con su **misma** contraseña.
- [ ] Table Editor → usuarios: la columna `clave` empieza con `$2a$` / `$2b$` (cifrada). Crear un usuario y cambiar
      una contraseña: también quedan cifradas y se puede entrar con ellas.
- [ ] Consola del navegador: `await db.from('usuarios').select('clave')` da error de permiso (no se puede leer).
- [ ] Clave equivocada: "Usuario o contraseña incorrectos".
- [ ] Consola sin sesión: `await db.from('clientes').delete().gt('id', 0)` → error `SIN_EMPRESA`, no borra nada.
- [ ] Con sesión en la empresa 01, un `update` / `delete` por id de una fila de la empresa 02 no la cambia.
- [ ] `herramientas/vaciar_base_datos.sql` sin escribir la empresa: se detiene sin borrar. Con un ID que no existe o un
      nombre que no coincide: se detiene. Con ID + nombre correctos (en una base de PRUEBA): solo esa empresa queda en
      0 en la comprobación; las demás conservan sus datos y los Administradores de la limpiada siguen entrando.
- [ ] `app.html#registro?empresa=02` (sin sesión): abre "Solicitar usuario · Clientes de ...". Con una empresa sin
      Transporte o inexistente: "Este enlace de registro no es válido".
- [ ] El login de cualquier marca muestra "¿Eres cliente? Solicita tu usuario" (con `registroClientes: false`, no).
      Sin enlace: pide el código de la empresa; al escribir `02` muestra "✔ Transportes Otoya..."; un código sin
      Transporte o inexistente: "Ese código no recibe solicitudes". Con `#registro?empresa=02` o
      `registroClientes: '02'` el código no se pregunta.
- [ ] Enviar la solicitud: "Solicitud enviada · Tu usuario será aramirez02". Al intentar entrar: "Tu solicitud
      todavía está en revisión". Repetir con el mismo teléfono: "Ya hay un usuario o una solicitud...".
- [ ] El Administrador y el G1 reciben "Solicitud de acceso a viajes"; en Clientes sale "Nuevo · pendiente" con
      "Pidió su usuario ... desde el login". Revisar → Aprobar: el cliente entra y ve solo Inicio, Viajes y Mi perfil.
- [ ] Rechazar una solicitud nueva: desaparecen el cliente y su usuario. Con el teléfono de un cliente que ya existía:
      sale "Acceso pendiente"; rechazar borra solo el usuario.

## Multimarca
- [ ] Cambiar `EMPRESA_ACTIVA`: cambian logo, título/imagen, pie, colores y actividades; pide iniciar sesión.
- [ ] Una empresa con una sola actividad no muestra la otra en Pedidos, Rutas, Reportes ni Configuración.
