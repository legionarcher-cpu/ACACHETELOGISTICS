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

## Inicio
- [ ] Cuadros de hoy con números correctos; clic filtra la lista.
- [ ] Estadística de la semana y globos de los iconos.
- [ ] Mapa y lista de pilotos activos. Actividad reciente con filtros según el rol.
- [ ] El Piloto solo ve sus pedidos; el G2 solo su región.

## Inicio: mapa
- [ ] El mapa gratis (OpenStreetMap) carga centrado en San José; se puede mover y acercar; crédito abajo a la derecha.
- [ ] El mapa no tapa el menú del usuario, la campana ni el menú ☰ en celular; se reacomoda al cambiar el tamaño.
- [ ] Salir de Inicio y volver: el mapa aparece de nuevo sin errores en la consola.

## Pedidos
- [ ] Lista: una **pestaña por actividad** con su número; cada pestaña muestra solo sus pedidos, sus
      rutas y su columna (Tienda: "Compra" + "Lleva alcohol"; Encomiendas: "Peso", "Recoger en:" y el
      cuadro "En bodega"). La pestaña se recuerda al volver; con una sola actividad no hay pestañas.
- [ ] Filtros de fecha, tienda, ruta y estado; resumen filtra; buscador.
- [ ] "Nuevo pedido" desde una pestaña abre el formulario con esa actividad elegida.
- [ ] Nuevo pedido **Entregas de tienda**: abarrotes (con alcohol), línea blanca con peso automático y
      cambiado a mano, monto de compra, envío gratis, cobrar la compra, vuelto.
- [ ] Nuevo pedido **Encomiendas**: recolección, cajas con tamaño y peso, documentos, línea blanca;
      estado inicial "En bodega" sin piloto.
- [ ] Horario lleno no se puede elegir; ruta sugiere el piloto; descuento aplica; total correcto.
- [ ] Se abre el QR; descargar y WhatsApp funcionan.
- [ ] Detalle: acciones según rol y estado (G2 asigna, Empleado solicita, Piloto entrega, G1 anula).
- [ ] Botones del pie "Reasignar horario" y "Cancelar pedido" abren la lista en ese modo.

## Mapa A → B (Pedidos y Cotizador)
- [ ] Antes: ejecutar `sql/01_actualizacion_base_existente.sql` (bloque 9: ubicación de las tiendas).
- [ ] Poner precio por km en una tarifa (Configuración → Pedidos → Tarifas) para probar el cobro.
- [ ] Entregas de tienda: A sale de la tienda; al escribir la entrega y salir del campo, B se ubica solo y aparecen los km.
- [ ] Encomiendas: con recolección escrita, A = recolección; sin ella, A = la tienda.
- [ ] Mover A o B (clic con "Clic en el mapa pone" o arrastrando) cambia los km y el precio.
- [ ] Pegar "9.93, -84.08" o un enlace de Google Maps en la dirección ubica el punto exacto.
- [ ] Con precio por km y sin A o B, el pedido no se guarda (mensaje claro).
- [ ] Admin/G1: "Guardar A como ubicación de la tienda"; el siguiente pedido ya sale de ese punto.
- [ ] Detalle del pedido: distancia y enlaces "Ir con Google Maps / Waze"; desglose con la línea de distancia.
- [ ] Mismo A, B, peso y tienda en el Cotizador y en Pedidos → mismo precio.
- [ ] Escribir en recolección o entrega: tras una pausa aparecen sugerencias (↑ ↓ Enter funcionan);
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
- [ ] Tiendas: crear (número sugerido), modificar, cambiar código (sus usuarios se renombran), eliminar sin usuarios.
- [ ] Clientes: Empleado crea → queda pendiente → G3 aprueba desde "Revisar" → llega la notificación.

## Usuarios
- [ ] Crear cada rol; G3 crea Empleado pendiente y G2 lo aprueba; foto; vehículo nuevo desde el formulario.
- [ ] Cambiar de tienda a un piloto: asignaciones y pedidos pendientes liberados, aviso al G2.
- [ ] El usuario `admin` no se puede eliminar ni cambiar de rol.

## Reportes
- [ ] Una **pestaña por actividad**: los números, gráficas y tabla son solo de esa actividad (comparar
      con la lista de Pedidos de la misma pestaña y fechas).
- [ ] Entregas de tienda: tarjetas "Compras" y "Con alcohol", gráfica "Compras por tienda", columnas
      Compra y Alcohol. Encomiendas: "Peso transportado", "En bodega", "Con recolección", gráfica
      "Bultos por tamaño", columnas Recolección y Bultos.
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
- [ ] Actividades (Administrador): la ventana se abre sobre las tarjetas; cambiar "qué usa" se refleja en Pedidos.

## Multimarca
- [ ] Cambiar `EMPRESA_ACTIVA`: cambian logo, título/imagen, pie, colores y actividades; pide iniciar sesión.
- [ ] Una empresa con una sola actividad no muestra la otra en Pedidos, Rutas, Reportes ni Configuración.
