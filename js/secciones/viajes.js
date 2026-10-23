/* ==================================================
   SECCIÓN: VIAJES (Transporte) - LÓGICA
   ACACHETE LOGISTICS

   Diseño: docs/14-transporte.md · Guía: docs/secciones/viajes.md
   Base: sql/01 bloque 19. Piezas comunes (estados, tarjeta, cortesía): js/viajes-comun.js

   QUIÉN VE QUÉ:
     Cliente (rol cliente)   -> SUS viajes: próximos y anteriores; cambia la hora o cancela
                                hasta "cancelar_horas" antes; su cortesía; su ubicación.
     Conductor (rol piloto)  -> arriba, los viajes que le llegaron: "Aceptar" o "Rechazar"
                                (viajes_responder; si no responde a tiempo pasa a otro). Al
                                aceptar: "Enviar confirmación" (imagen con el QR del viaje +
                                mensaje, por Compartir o WhatsApp). Sus viajes del día:
                                "Voy en camino" -> "Escanear QR" del cliente (o "A bordo") ->
                                "Terminar" (o "No se presentó") y enlaces para navegar.
     Cliente: "Mi QR" en sus viajes por hacer (lo muestra al subir).
     Personal (Administrador, G1, G2, G3, Empleado) -> agenda del día de la empresa:
                                filtros, resumen, cambiar la hora, cancelar y avanzar.
                                Viaje "Sin conductor": "Buscar conductor" y WhatsApp al cliente.
                                Solicita viajes eligiendo al cliente (paso 0).

   SOLICITUD (4 pasos, primero la ruta y después la hora):
     1. Personas (al menos 1) y mascotas Sí/No (obligatorio, sin respuesta marcada). Con
        mascotas solo sirven los vehículos que las aceptan. (La mercadería ya no se pide.)
     2. Ruta A -> B con el mapa (js/mapa.js: km y minutos por calle). Botón "Ubicación del
        cliente" para llenar un punto con la dirección y la ubicación de su ficha; "Guardar
        como ubicación del cliente" guarda el punto en su ficha (clientes.direccion y ubicacion).
     3. Día y hora: la base (viajes_horas_disponibles) da las horas cada 15 min dentro de
        las franjas, si hay vehículo libre para el bloque y el precio de cada una.
     4. Confirmar: viajes_solicitar revisa otra vez, asigna vehículo y conductor y confirma.
        Si otra persona tomó la hora un instante antes, avisa y vuelve a cargar las horas.
   El precio final lo calcula la base (franja de la hora de recogida + recargos fijos;
   con cortesía el viaje sale en ₡0 y solo se cobran los recargos).

   ⚠ Los permisos los aplica la página y las funciones de la base (que revisan el rol y el
   plazo). La protección completa de las lecturas llega con la Fase 7 (Supabase Auth + RLS).
   ================================================== */

registrarSeccion('viajes', (zona) => {

    const $ = (selector) => zona.querySelector(selector);
    const aviso = crearAviso($('#viaAviso'), 7000);
    const sesion = obtenerSesion() || {};

    // ---------- Quién entra ----------
    const cliente = esCliente();
    const conductor = rolActual() === 'piloto';
    const personal = !cliente && !conductor;
    // El personal: según su función en Usuarios -> "Módulos y funciones" (js/sesion.js)
    const puedeSolicitar = cliente || (personal && puedeHacer('viajes.solicitar', true));

    // ---------- Estado ----------
    let config = { ...VIA_CONFIG_BASE };
    let viajes = [];            // los de la lista (día elegido, o los del cliente)
    let vehiculos = [];
    let estadoCliente = null;   // cortesía del cliente del viaje (viajes_estado_cliente)
    let clienteViaje = null;    // { id, nombre, apellido1, apellido2, telefono, direccion, ubicacion } del viaje que se solicita
    let mapa = null;
    let ruta = null;            // { km, minutos, aproximada } de A -> B
    let horaElegida = null;     // { inicio, hora, total, franja }
    let viajeCambiando = null;
    let viajeCancelando = null;
    let activa = true;
    let enFormulario = false;

    // ==================================================
    // AYUDAS
    // ==================================================

    const nombreCliente = (c) => [c.nombre, c.apellido1, c.apellido2].filter(Boolean).join(' ');
    // Punto de la ficha del cliente ({ lat, lng } de su ubicación) o null
    const puntoCliente = (c) => (c ? puntoDeTexto(c.ubicacion) : null);
    const mismoDia = (t, fecha) => viaFechaISO(new Date(t)) === fecha;
    // ¿El cliente todavía puede cambiar o cancelar? (la base lo vuelve a revisar)
    const clientePuedeCambiar = (v) => ['pendiente', 'sin_conductor', 'confirmado'].includes(v.estado)
        && Date.now() <= new Date(v.inicio).getTime() - Number(config.cancelar_horas || 0) * 3600000;

    function mostrarError(error, accion) {
        console.error(`Error al ${accion}:`, error);
        aviso.mostrar(viaErrorTexto(error, accion), 'error');
    }

    // ==================================================
    // LISTA / AGENDA
    // ==================================================

    function accionesDe(v) {
        const acciones = [];
        const nav = (lado, texto) => {
            const destino = { lat: Number(v[`${lado}_lat`]), lng: Number(v[`${lado}_lng`]) };
            return { texto, icono: 'bi-sign-turn-right', href: enlacesNavegacion(null, destino).google, externo: true };
        };
        // QR del viaje: solo si la base ya lo tiene (viajes.token_qr)
        const qr = (texto, clase = 'boton-secundario') => (v.token_qr ? [{ texto, icono: 'bi-qr-code', accion: 'qr', clase }] : []);
        if (cliente) {
            if (VIA_POR_HACER.includes(v.estado)) acciones.push(...qr('Mi QR'));
            if (clientePuedeCambiar(v)) {
                acciones.push({ texto: 'Cambiar hora', icono: 'bi-clock', accion: 'cambiar' });
                acciones.push({ texto: 'Cancelar', icono: 'bi-x-circle', accion: 'cancelar', clase: 'boton-secundario via-boton-peligro' });
            }
            return acciones;
        }
        // WhatsApp al cliente con el mensaje listo (si tiene teléfono)
        const whatsapp = (tipo, texto) => {
            const href = viaWhatsappCliente(v, tipo);
            return href ? { texto, icono: 'bi-whatsapp', href, externo: true, clase: 'boton-secundario via-boton-whatsapp' } : null;
        };
        if (conductor) {
            // Le llegó: lo acepta o lo rechaza (si no responde a tiempo, pasa a otro conductor)
            if (v.estado === 'pendiente') {
                acciones.push({ texto: 'Aceptar', icono: 'bi-check-lg', accion: 'aceptar', clase: 'boton-principal' });
                acciones.push({ texto: 'Rechazar', icono: 'bi-x-lg', accion: 'rechazar', clase: 'boton-secundario via-boton-peligro' });
                return acciones;
            }
            // Confirmación al cliente: la imagen con el QR del viaje + el mensaje (WhatsApp o Compartir)
            if (v.estado === 'confirmado') {
                if (v.token_qr) acciones.push(...qr('Enviar confirmación', 'boton-secundario via-boton-whatsapp'));
                else { const w = whatsapp('confirmado', 'Avisar al cliente'); if (w) acciones.push(w); }
            }
            if (v.estado === 'confirmado') acciones.push({ texto: 'Voy en camino', icono: 'bi-car-front', accion: 'en_camino', clase: 'boton-principal' });
            if (['confirmado', 'en_camino'].includes(v.estado)) {
                // Al recoger: escanea el QR que muestra el cliente (o "A bordo" si no lo tiene)
                if (v.token_qr) acciones.push({ texto: 'Escanear QR', icono: 'bi-qr-code-scan', accion: 'escanear', clase: v.estado === 'en_camino' ? 'boton-principal' : 'boton-secundario' });
                acciones.push({ texto: 'A bordo', icono: 'bi-person-check', accion: 'en_curso', clase: v.estado === 'en_camino' && !v.token_qr ? 'boton-principal' : 'boton-secundario' });
                acciones.push(nav('origen', 'Ir a A'));
                acciones.push({ texto: 'No se presentó', icono: 'bi-person-x', accion: 'no_se_presento' });
            }
            if (['en_camino', 'en_curso'].includes(v.estado)) {
                if (v.estado === 'en_curso') acciones.push(nav('destino', 'Ir a B'));
                acciones.push({ texto: 'Terminar viaje', icono: 'bi-flag', accion: 'terminado', clase: v.estado === 'en_curso' ? 'boton-principal' : 'boton-secundario' });
            }
            return acciones;
        }
        // Personal
        if (['pendiente', 'confirmado', 'en_camino'].includes(v.estado)) acciones.push(...qr('QR'));
        if (v.estado === 'sin_conductor') {
            acciones.push({ texto: 'Buscar conductor', icono: 'bi-arrow-repeat', accion: 'buscar', clase: 'boton-principal' });
            const w = whatsapp('sin_conductor', 'Avisar al cliente');
            if (w) acciones.push(w);
        }
        if (['pendiente', 'sin_conductor'].includes(v.estado)) {
            acciones.push({ texto: 'Cambiar hora', icono: 'bi-clock', accion: 'cambiar' });
            acciones.push({ texto: 'Cancelar', icono: 'bi-x-circle', accion: 'cancelar', clase: 'boton-secundario via-boton-peligro' });
        }
        if (['confirmado', 'en_camino'].includes(v.estado)) {
            acciones.push({ texto: 'Cambiar hora', icono: 'bi-clock', accion: 'cambiar' });
            if (v.estado === 'confirmado') acciones.push({ texto: 'En camino', icono: 'bi-car-front', accion: 'en_camino' });
            acciones.push({ texto: 'A bordo', icono: 'bi-person-check', accion: 'en_curso' });
            acciones.push({ texto: 'No se presentó', icono: 'bi-person-x', accion: 'no_se_presento' });
            acciones.push({ texto: 'Cancelar', icono: 'bi-x-circle', accion: 'cancelar', clase: 'boton-secundario via-boton-peligro' });
        }
        if (['en_camino', 'en_curso'].includes(v.estado)) acciones.push({ texto: 'Terminar', icono: 'bi-flag', accion: 'terminado' });
        return acciones;
    }

    async function cargarLista() {
        let q = db.from('viajes').select(VIA_SELECT);
        if (cliente) {
            q = q.eq('cliente_id', clienteActual() || 0).order('inicio', { ascending: false }).limit(60);
        } else {
            const [ini, fin] = viaRangoDia($('#viaFecha').value);
            q = q.gte('inicio', ini).lt('inicio', fin).order('inicio');
            if (conductor) q = q.eq('conductor_id', sesion.id || 0);
        }
        // Conductor: los que tiene por aceptar se ven arriba, aunque sean de otro día
        const [{ data, error }, porAceptar] = await Promise.all([q, conductor
            ? db.from('viajes').select(VIA_SELECT).eq('conductor_id', sesion.id || 0).eq('estado', 'pendiente').order('inicio')
            : Promise.resolve({ data: [] })]);
        if (!activa) return;
        if (error) {
            mostrarError(error, 'cargar los viajes');
            $('#viaListaViajes').replaceChildren(viaElemento('p', 'via-vacio', 'Sin datos.'));
            return;
        }
        const ids = new Set(data.map((v) => v.id));
        viajes = [...(porAceptar.data || []).filter((v) => !ids.has(v.id)), ...data]
            .sort((a, b) => (a.estado === 'pendiente' ? 0 : 1) - (b.estado === 'pendiente' ? 0 : 1));
        dibujarLista();
    }

    function dibujarLista() {
        const lista = $('#viaListaViajes');
        if (cliente) {
            const limite = Date.now() - 6 * 3600000;
            const proximos = viajes.filter((v) => VIA_ACTIVOS.includes(v.estado) && new Date(v.inicio).getTime() >= limite)
                .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
            const anteriores = viajes.filter((v) => !proximos.includes(v));
            lista.replaceChildren(...(proximos.length
                ? proximos.map((v) => tarjetaViaje(v, { acciones: accionesDe(v) }))
                : [viaElemento('p', 'via-vacio', 'No tienes viajes próximos. Usa "Solicitar viaje".')]));
            $('#viaHistorialCaja').hidden = !anteriores.length;
            $('#viaHistorial').replaceChildren(...anteriores.slice(0, 30).map((v) => tarjetaViaje(v)));
            marcarPedido();
            return;
        }

        const estado = $('#viaFiltroEstado').value;
        const vehiculo = Number($('#viaFiltroVehiculo').value) || null;
        const texto = $('#viaBuscar').value.trim();
        const visibles = viajes.filter((v) => (!estado || v.estado === estado) && (!vehiculo || v.vehiculo_id === vehiculo)
            && coincideBusqueda([v.codigo, v.cliente_nombre, v.cliente_telefono, v.origen_direccion, v.destino_direccion], texto));

        // Resumen del día
        const validos = viajes.filter((v) => !['cancelado', 'no_se_presento'].includes(v.estado));
        const cuadro = (numero, textoCuadro, color) => {
            const el = viaElemento('div', `resumen-item ${color} via-kpi`);
            el.append(viaElemento('span', 'resumen-texto', textoCuadro), viaElemento('span', 'resumen-numero', String(numero)));
            return el;
        };
        $('#viaResumen').hidden = false;
        $('#viaResumen').replaceChildren(
            cuadro(validos.length, 'Viajes del día', 'resumen-azul'),
            cuadro(validos.filter((v) => VIA_POR_HACER.includes(v.estado)).length, 'Por hacer', 'resumen-naranja'),
            cuadro(validos.filter((v) => v.estado === 'en_curso').length, 'En curso', 'resumen-morada'),
            cuadro(validos.filter((v) => v.estado === 'terminado').length, 'Terminados', 'resumen-verde'),
            ...(personal ? [cuadro(viaDinero(validos.reduce((s, v) => s + Number(v.total || 0), 0)), 'Ingresos del día', 'resumen-azul')] : []),
        );

        const fecha = $('#viaFecha').value;
        $('#viaListaTitulo').textContent = `${conductor ? 'Mis viajes' : 'Viajes'} del ${new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })}`;
        lista.replaceChildren(...(visibles.length
            ? visibles.map((v) => tarjetaViaje(v, { verCliente: true, acciones: accionesDe(v) }))
            : [viaElemento('p', 'via-vacio', viajes.length ? 'Ningún viaje coincide con los filtros.' : 'No hay viajes este día.')]));
        marcarPedido();
    }

    // #viajes?id=15 (desde una notificación): resalta ese viaje
    let pedidoMarcado = false;
    function marcarPedido() {
        const id = Number(parametrosSeccion().get('id'));
        if (!id || pedidoMarcado) return;
        const tarjeta = zona.querySelector(`.via-viaje[data-id="${id}"]`);
        if (!tarjeta) return;
        pedidoMarcado = true;
        tarjeta.classList.add('via-resaltado');
        tarjeta.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    // Acciones de las tarjetas (un solo escuchador)
    zona.querySelector('#viaVistaLista').addEventListener('click', async (evento) => {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton) return;
        const v = viajes.find((x) => x.id === Number(boton.dataset.id));
        if (!v) return;
        const accion = boton.dataset.accion;
        if (accion === 'cambiar') { abrirCambiar(v); return; }
        if (accion === 'cancelar') { abrirCancelar(v); return; }
        if (accion === 'aceptar' || accion === 'rechazar') { responder(v, accion === 'aceptar', boton); return; }
        if (accion === 'buscar') { buscarConductor(v, boton); return; }
        if (accion === 'qr') { abrirQr(v); return; }
        if (accion === 'escanear') { escanearAbordo(v); return; }
        const preguntas = {
            terminado: `¿Terminar el viaje ${v.codigo}?`,
            no_se_presento: `¿Marcar que ${v.cliente_nombre} no se presentó (${v.codigo})?`,
        };
        if (preguntas[accion] && !confirm(preguntas[accion])) return;
        boton.disabled = true;
        const { error } = await db.rpc('viajes_avanzar', { p_viaje: v.id, p_usuario: sesion.id || 0, p_estado: accion });
        if (!activa) return;
        boton.disabled = false;
        if (error) { mostrarError(error, 'cambiar el estado del viaje'); return; }
        aviso.mostrar(`${v.codigo}: ${(VIA_ESTADOS[accion] || [accion])[0]}.`);
        cargarLista();
    });

    // ---------- El conductor acepta o rechaza (viajes_responder) ----------
    // Al aceptar, la tarjeta muestra "Avisar al cliente" (WhatsApp con el mensaje listo). No se
    // abre sola: después de esperar a la base, el celular bloquea la ventana nueva.
    async function responder(v, acepta, boton) {
        if (!acepta && !confirm(`¿Rechazar el viaje ${v.codigo}? Se le pasa a otro conductor.`)) return;
        boton.disabled = true;
        const { data, error } = await db.rpc('viajes_responder', { p_viaje: v.id, p_usuario: sesion.id || 0, p_acepta: acepta });
        if (!activa) return;
        boton.disabled = false;
        if (error) {
            mostrarError(error, acepta ? 'aceptar el viaje' : 'rechazar el viaje');
            if (error.hint === 'cambiado') cargarLista();
            return;
        }
        aviso.mostrar(acepta
            ? `Viaje ${v.codigo} aceptado.${data && data.cliente_telefono ? ' Avísale al cliente con el botón de WhatsApp.' : ''}`
            : `Viaje ${v.codigo} rechazado: se le pasó a otro conductor.`);
        cargarLista();
    }

    // ---------- Personal: viaje sin conductor -> buscar otra vez (viajes_buscar_conductor) ----------
    async function buscarConductor(v, boton) {
        boton.disabled = true;
        const { data, error } = await db.rpc('viajes_buscar_conductor', { p_viaje: v.id, p_usuario: sesion.id || 0 });
        if (!activa) return;
        boton.disabled = false;
        if (error) { mostrarError(error, 'buscar conductor'); if (error.hint === 'cambiado') cargarLista(); return; }
        aviso.mostrar(`${v.codigo}: se le ofreció a ${(data.conductor || {}).nombre || 'otro conductor'}. Queda esperando que lo acepte.`);
        cargarLista();
    }

    // ==================================================
    // QR DEL VIAJE (ACACHETE-VIAJE:<token>, viajes.token_qr)
    //   Conductor y personal: la imagen se manda al cliente con la confirmación (Compartir
    //   o WhatsApp). Cliente: "Mi QR" para mostrarlo al subir. El conductor lo escanea
    //   ("Escanear QR" aquí o el botón del encabezado, js/qr.js) y el viaje pasa a "En curso".
    // ==================================================
    const lienzoQr = $('#viaQrCanvas');
    let viajeQr = null;

    // Tarjeta: empresa, QR, código, día y hora, recogida y vehículo
    function dibujarTarjetaQr(v) {
        const ctx = lienzoQr.getContext('2d');
        const ancho = lienzoQr.width;
        const alto = lienzoQr.height;
        // Recorta un texto largo con "..." para que quepa en el ancho
        const recortar = (texto, max) => {
            let t = String(texto || '');
            if (ctx.measureText(t).width <= max) return t;
            while (t && ctx.measureText(`${t}...`).width > max) t = t.slice(0, -1);
            return `${t}...`;
        };
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, ancho, alto);
        ctx.textAlign = 'center';

        // Encabezado azul marino con el nombre
        ctx.fillStyle = '#07305C';
        ctx.fillRect(0, 0, ancho, 90);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 34px Arial, sans-serif';
        ctx.fillText(recortar((typeof empresaActual === 'function' && empresaActual() || {}).nombre || 'ACACHETE', ancho - 40), ancho / 2, 48);
        ctx.fillStyle = '#F2660F';
        ctx.font = 'bold 16px Arial, sans-serif';
        ctx.fillText('V I A J E', ancho / 2, 74);

        // QR
        const qr = window.qrcode(0, 'M');
        qr.addData(QR_PREFIJO.viaje + v.token_qr);
        qr.make();
        const modulos = qr.getModuleCount();
        const celda = Math.floor(400 / modulos);
        const tam = celda * modulos;
        const x0 = Math.round((ancho - tam) / 2);
        const y0 = 120;
        ctx.fillStyle = '#000000';
        for (let f = 0; f < modulos; f++) {
            for (let c = 0; c < modulos; c++) if (qr.isDark(f, c)) ctx.fillRect(x0 + c * celda, y0 + f * celda, celda, celda);
        }

        // Textos
        let y = y0 + tam + 56;
        ctx.fillStyle = '#1F2937';
        ctx.font = 'bold 40px Arial, sans-serif';
        ctx.fillText(v.codigo, ancho / 2, y);
        y += 40;
        ctx.font = '24px Arial, sans-serif';
        ctx.fillStyle = '#374151';
        ctx.fillText(`${viaFecha(v.inicio, true)} · ${viaHora(v.inicio)}`, ancho / 2, y);
        y += 34;
        ctx.font = '20px Arial, sans-serif';
        ctx.fillStyle = '#4B5563';
        ctx.fillText(recortar(`Recogida: ${v.origen_direccion}`, ancho - 60), ancho / 2, y);
        if (v.vehiculos) {
            y += 30;
            ctx.fillText(recortar(`Vehículo: ${v.vehiculos.marca} ${v.vehiculos.placa}`, ancho - 60), ancho / 2, y);
        }
        ctx.font = '18px Arial, sans-serif';
        ctx.fillStyle = '#6B7280';
        ctx.fillText('Al subir, muestre este QR al conductor.', ancho / 2, alto - 28);
    }

    async function abrirQr(v) {
        viajeQr = v;
        $('#viaQrTitulo').textContent = `QR del viaje ${v.codigo}`;
        try {
            await qrCargar(QR_LIB_DIBUJAR, 'qrcode'); // js/qr.js
            dibujarTarjetaQr(v);
        } catch (e) {
            console.error(e);
            aviso.mostrar('No se pudo generar el QR (revisa la conexión a internet).', 'error');
            return;
        }
        if (!activa) return;
        $('#viaQrTexto').textContent = cliente
            ? 'Muestra este QR al conductor al subir: con él empieza tu viaje.'
            : 'Envíale esta imagen al cliente con la confirmación: al subir la muestra y el conductor la escanea.';
        const mensaje = viaMensajeCliente(v, 'confirmado');
        const whatsapp = cliente ? null : viaWhatsappCliente(v, 'confirmado');
        $('#viaQrWhatsapp').hidden = !whatsapp;
        if (whatsapp) $('#viaQrWhatsapp').href = whatsapp;

        // "Compartir" (imagen + mensaje) solo si el navegador puede compartir archivos (celulares)
        const compartir = $('#viaQrCompartir');
        compartir.hidden = true;
        lienzoQr.toBlob((blob) => {
            if (!blob) return;
            const archivo = new File([blob], `viaje-${v.codigo}.png`, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
                compartir.hidden = false;
                compartir.onclick = () => navigator.share(cliente ? { files: [archivo] } : { files: [archivo], text: mensaje }).catch(() => {});
            }
        }, 'image/png');
        $('#viaQrDialogo').showModal();
    }

    $('#viaQrDescargar').addEventListener('click', () => {
        if (!viajeQr) return;
        const a = document.createElement('a');
        a.href = lienzoQr.toDataURL('image/png');
        a.download = `viaje-${viajeQr.codigo}.png`;
        a.click();
    });
    $('#viaQrCerrar').addEventListener('click', () => $('#viaQrDialogo').close());

    // Conductor: escanea el QR que muestra el cliente (o escribe el número del viaje) -> "En curso"
    function escanearAbordo(v) {
        const revisar = async (esEste) => {
            if (!esEste) return { tipo: 'error', mensaje: `Ese no es el QR del viaje ${v.codigo}.` };
            const { error } = await db.rpc('viajes_avanzar', { p_viaje: v.id, p_usuario: sesion.id || 0, p_estado: 'en_curso' });
            if (error) return { tipo: 'error', mensaje: viaErrorTexto(error, 'marcar "A bordo"') };
            if (activa) { aviso.mostrar(`${v.codigo}: cliente a bordo, viaje en curso.`); cargarLista(); }
            return { tipo: 'ok', mensaje: `✔ ${v.codigo}: cliente a bordo.`, cerrar: 1200 };
        };
        const numero = (t) => Number(String(t).replace(/\D/g, '')) || 0;
        abrirLectorQr({ // js/qr.js
            titulo: `Recoger ${v.codigo}`,
            ayuda: 'Escanea el QR del viaje que muestra el cliente.',
            alLeer: (texto) => (texto.startsWith(QR_PREFIJO.viaje)
                ? revisar(texto === QR_PREFIJO.viaje + v.token_qr)
                : { tipo: 'error', mensaje: 'Ese no es el QR de un viaje.' }),
            manual: {
                etiqueta: '¿No se puede leer el QR? Escribe el número del viaje que te dice el cliente:',
                alEscribir: (texto) => revisar(numero(texto) > 0 && numero(texto) === numero(v.codigo)),
            },
        });
    }

    // El QR del viaje se escaneó con el botón del encabezado (js/qr.js): recarga la lista
    const alEscanearViaje = () => { if (activa && !enFormulario) cargarLista(); };
    window.addEventListener('acachete:viaje', alEscanearViaje);

    // ---------- Filtros del día ----------
    function moverDia(dias) {
        const actual = new Date(`${$('#viaFecha').value || viaFechaISO()}T12:00:00`);
        $('#viaFecha').value = viaFechaISO(actual, dias);
        cargarLista();
    }
    zona.querySelectorAll('[data-dia]').forEach((b) => b.addEventListener('click', () => moverDia(Number(b.dataset.dia))));
    $('#viaHoy').addEventListener('click', () => { $('#viaFecha').value = viaFechaISO(); cargarLista(); });
    $('#viaFecha').addEventListener('change', cargarLista);
    ['#viaFiltroEstado', '#viaFiltroVehiculo'].forEach((s) => $(s).addEventListener('change', dibujarLista));
    $('#viaBuscar').addEventListener('input', dibujarLista);

    // ==================================================
    // CLIENTE: CORTESÍA Y SU UBICACIÓN
    // ==================================================

    async function cargarDatosCliente(id) {
        const [cli, est] = await Promise.all([
            db.from('clientes').select('id, nombre, apellido1, apellido2, telefono, direccion, ubicacion')
                .eq('id', id).maybeSingle(),
            db.rpc('viajes_estado_cliente', { p_cliente: id }),
        ]);
        if (cli.error) { mostrarError(cli.error, 'cargar los datos del cliente'); return null; }
        estadoCliente = est.error ? null : est.data;
        return cli.data;
    }

    // "Mi ubicación": la dirección y el punto de la ficha del cliente
    function pintarMisLugares() {
        const li = viaElemento('li', 'via-lugar');
        const textos = viaElemento('span', 'via-lugar-textos');
        const punto = puntoCliente(clienteViaje);
        textos.append(viaElemento('strong', null, 'Mi ubicación'),
            viaElemento('small', null, punto ? (clienteViaje.direccion || 'Ubicada en el mapa') : 'Sin guardar'));
        li.append(viaElemento('i', 'bi bi-geo-alt'), textos);
        if (punto) li.appendChild(viaBoton('Quitar', 'bi-x-lg', 'boton-secundario', { quitar: '1' }));
        $('#viaLugaresLista').replaceChildren(li);
    }

    $('#viaLugaresLista').addEventListener('click', async (evento) => {
        const b = evento.target.closest('button[data-quitar]');
        if (!b || !clienteViaje) return;
        if (!confirm('¿Quitar tu ubicación guardada?')) return;
        await guardarUbicacionCliente(null);
    });

    // Guarda la dirección y la ubicación en la ficha del cliente (punto = { direccion, lat, lng } o null)
    async function guardarUbicacionCliente(punto) {
        if (!clienteViaje) return;
        const datos = punto
            ? { direccion: punto.direccion, ubicacion: `${punto.lat.toFixed(6)}, ${punto.lng.toFixed(6)}` }
            : { ubicacion: null };
        const { error } = await db.from('clientes').update(datos).eq('id', clienteViaje.id);
        if (error) { mostrarError(error, 'guardar la ubicación'); return; }
        Object.assign(clienteViaje, datos);
        aviso.mostrar(punto ? 'Ubicación del cliente guardada.' : 'Ubicación del cliente quitada.');
        pintarMisLugares();
        pintarBotonesLugares();
    }

    // ==================================================
    // SOLICITAR UN VIAJE
    // ==================================================

    const entradaA = $('#viaOrigen');
    const entradaB = $('#viaDestino');
    const opcionMascotas = () => (zona.querySelector('input[name="viaMascotas"]:checked') || {}).value || null;

    // Viajes solo de personas (con o sin mascotas): la mercadería ya no se pide
    function datosViajeros() {
        const personas = Number($('#viaPersonas').value);
        const conMascotas = opcionMascotas() === 'si';
        return {
            personas: Number.isInteger(personas) && personas >= 1 ? personas : null,
            mascotas: opcionMascotas() === null ? null : conMascotas ? Math.max(1, Number($('#viaMascotasCantidad').value) || 1) : 0,
        };
    }

    // ---------- Selector de día y hora (formulario y "Cambiar la hora") ----------
    function crearSelectorHoras(cajaDias, cajaHoras, alElegir) {
        let fecha = viaFechaISO();
        let parametros = null;
        let turno = 0;

        function pintarDias() {
            const dias = Math.max(0, Number(config.anticipacion_dias || 0));
            cajaDias.replaceChildren(...Array.from({ length: dias + 1 }, (_, i) => {
                const f = viaFechaISO(new Date(), i);
                const d = new Date(`${f}T12:00:00`);
                const b = viaElemento('button', 'via-dia-boton');
                b.type = 'button';
                b.dataset.fecha = f;
                b.append(viaElemento('strong', null, i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-CR', { weekday: 'short' })),
                    viaElemento('small', null, d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })));
                return b;
            }));
            marcarDia();
        }

        function marcarDia() {
            cajaDias.querySelectorAll('.via-dia-boton').forEach((b) => {
                const si = b.dataset.fecha === fecha;
                b.classList.toggle('activo', si);
                b.setAttribute('aria-pressed', String(si));
            });
        }

        cajaDias.addEventListener('click', (e) => {
            const b = e.target.closest('.via-dia-boton');
            if (!b) return;
            fecha = b.dataset.fecha;
            marcarDia();
            cargar();
        });

        async function cargar(nuevos) {
            if (nuevos !== undefined) parametros = nuevos;
            alElegir(null);
            if (!parametros) {
                cajaHoras.replaceChildren();
                return;
            }
            const mio = ++turno;
            cajaHoras.replaceChildren(viaElemento('p', 'via-vacio', 'Buscando horas libres...'));
            const { data, error } = await db.rpc('viajes_horas_disponibles', { ...parametros, p_fecha: fecha });
            if (mio !== turno || !activa) return;
            if (error) {
                cajaHoras.replaceChildren(viaElemento('p', 'via-vacio', viaErrorTexto(error, 'buscar las horas')));
                return;
            }
            if (data.length === 1 && !data[0].inicio) {
                cajaHoras.replaceChildren(viaElemento('p', 'via-vacio', data[0].motivo || 'Ese día no se puede reservar.'));
                return;
            }
            if (!data.length) {
                cajaHoras.replaceChildren(viaElemento('p', 'via-vacio', 'Ese día no hay servicio o ya pasaron las horas disponibles. Elige otro día.'));
                return;
            }
            // Agrupadas por franja (cada una con su precio)
            const grupos = new Map();
            data.forEach((h) => { if (!grupos.has(h.franja)) grupos.set(h.franja, []); grupos.get(h.franja).push(h); });
            const libres = data.filter((h) => h.disponible).length;
            cajaHoras.replaceChildren(
                viaElemento('p', 'via-nota-chica', libres ? `${plural(libres, 'hora libre', 'horas libres')} · las grises ya están ocupadas.` : 'Todas las horas de este día están ocupadas: elige otro día.'),
                ...[...grupos.entries()].map(([franja, horas]) => {
                    const g = viaElemento('div', 'via-horas-grupo');
                    g.appendChild(viaElemento('h4', 'via-horas-franja', franja));
                    const fila = viaElemento('div', 'via-horas-fila');
                    horas.forEach((h) => {
                        const b = viaElemento('button', `via-hora${h.disponible ? '' : ' via-hora-ocupada'}`);
                        b.type = 'button';
                        b.disabled = !h.disponible;
                        b.dataset.inicio = h.inicio;
                        b.title = h.disponible ? `${h.hora} · ${viaDinero(h.total)}` : h.motivo || 'Ocupado';
                        b.append(viaElemento('strong', null, h.hora), viaElemento('small', null, h.disponible ? viaDinero(h.total) : h.motivo || 'Ocupado'));
                        b.addEventListener('click', () => {
                            cajaHoras.querySelectorAll('.via-hora.activo').forEach((x) => x.classList.remove('activo'));
                            b.classList.add('activo');
                            alElegir({ ...h, franja });
                        });
                        fila.appendChild(b);
                    });
                    g.appendChild(fila);
                    return g;
                }));
        }

        return { pintarDias, cargar, fecha: () => fecha };
    }

    const selectorForm = crearSelectorHoras($('#viaDias'), $('#viaHoras'), (h) => { horaElegida = h; pintarConfirmar(); });

    // Parámetros para buscar horas (null si todavía falta la ruta o los datos del paso 1)
    function parametrosHoras() {
        const d = datosViajeros();
        if (!ruta || d.personas === null || d.mascotas === null) return null;
        return {
            p_empresa: empresaActivaId(), p_km: ruta.km, p_minutos: ruta.minutos,
            p_personas: d.personas, p_mascotas: d.mascotas, p_mercaderia: false, p_kg: 0,
        };
    }

    let esperaHoras = null;
    function refrescarHoras() {
        clearTimeout(esperaHoras);
        esperaHoras = setTimeout(() => {
            const p = parametrosHoras();
            const d = datosViajeros();
            $('#viaHoraAyuda').textContent = p ? 'Elige el día y una hora libre. El precio es el de la franja de la hora de recogida.'
                : !ruta ? 'Primero ubica A y B: la duración del viaje decide qué horas están libres.'
                    : d.mascotas === null ? 'Indica si lleva mascotas (paso 1).'
                        : 'Indica cuántas personas viajan: al menos 1 (paso 1).';
            selectorForm.cargar(p);
        }, 350);
    }

    // ---------- Paso 1 ----------
    function mostrarCondicionales() {
        zona.querySelectorAll('[data-si="mascotas"]').forEach((el) => { el.hidden = opcionMascotas() !== 'si'; });
    }
    ['#viaPersonas', '#viaMascotasCantidad'].forEach((s) => $(s).addEventListener('input', refrescarHoras));
    zona.querySelectorAll('input[name="viaMascotas"]').forEach((r) => r.addEventListener('change', () => {
        mostrarCondicionales();
        refrescarHoras();
    }));

    // ---------- Paso 0 (personal): elegir al cliente ----------
    let esperaCliente = null;
    $('#viaCliBuscar').addEventListener('input', () => {
        clearTimeout(esperaCliente);
        esperaCliente = setTimeout(buscarClientes, 300);
    });

    async function buscarClientes() {
        const palabras = palabrasDeBusqueda($('#viaCliBuscar').value);
        const caja = $('#viaCliResultados');
        if (!palabras.length || palabras.join('').length < 2) { caja.hidden = true; return; }
        let q = db.from('clientes').select('id, nombre, apellido1, apellido2, telefono, correo').eq('aprobado', true);
        palabras.forEach((p) => { q = q.ilike('busqueda', `%${p}%`); });
        const { data, error } = await q.order('apellido1').order('apellido2').limit(8);
        if (!activa) return;
        if (error) { mostrarError(error, 'buscar clientes'); return; }
        caja.hidden = false;
        caja.replaceChildren(...(data.length ? data.map((c) => {
            const li = viaElemento('li');
            const b = viaElemento('button', 'via-cli-opcion');
            b.type = 'button';
            b.dataset.id = c.id;
            b.append(viaElemento('strong', null, nombreCliente(c)), viaElemento('small', null, [c.telefono, c.correo].filter(Boolean).join(' · ')));
            li.appendChild(b);
            return li;
        }) : [viaElemento('li', 'via-vacio', 'Sin resultados.')]));
    }

    $('#viaCliResultados').addEventListener('click', async (e) => {
        const b = e.target.closest('button[data-id]');
        if (!b) return;
        $('#viaCliResultados').hidden = true;
        await elegirCliente(Number(b.dataset.id));
    });

    async function elegirCliente(id) {
        clienteViaje = await cargarDatosCliente(id);
        const caja = $('#viaCliElegido');
        caja.hidden = !clienteViaje;
        if (clienteViaje) {
            caja.replaceChildren();
            const i = viaElemento('i', 'bi bi-person-check');
            caja.append(i, ' ', viaElemento('strong', null, nombreCliente(clienteViaje)), ` · ${clienteViaje.telefono || ''} `);
            caja.appendChild(viaBoton('Cambiar', 'bi-arrow-repeat', 'boton-secundario', { cambiarCliente: '1' }));
            $('#viaCliBuscar').value = '';
            $('#viaCliBuscar').closest('.buscador').hidden = true;
        }
        pintarBotonesLugares();
        pintarConfirmar();
    }

    $('#viaCliElegido').addEventListener('click', (e) => {
        if (!e.target.closest('button[data-cambiar-cliente]')) return;
        clienteViaje = null;
        estadoCliente = null;
        $('#viaCliElegido').hidden = true;
        $('#viaCliBuscar').closest('.buscador').hidden = false;
        $('#viaCliBuscar').focus();
        pintarBotonesLugares();
        pintarConfirmar();
    });

    // ---------- Paso 2: ruta ----------
    function crearMapa() {
        if (mapa) return;
        mapa = crearMapaRuta($('#viaMapa'), {
            etiquetaA: 'Recoger', etiquetaB: 'Destino',
            textoA: () => entradaA.value, textoB: () => entradaB.value,
            entradaA, entradaB,
            alCambiar: async (r) => {
                ruta = r;
                await completarDirecciones();
                pintarRuta();
                pintarBotonesLugares();
                refrescarHoras();
                pintarConfirmar();
            },
        });
    }

    // Si un punto se marcó con un clic (sin escribir), se busca el nombre del lugar
    async function completarDirecciones() {
        if (!mapa) return;
        const { a, b } = mapa.puntos();
        for (const [punto, entrada] of [[a, entradaA], [b, entradaB]]) {
            if (punto && !entrada.value.trim()) {
                const texto = await direccionDePunto(punto);
                if (texto && !entrada.value.trim()) {
                    entrada.value = texto.split(',').slice(0, 3).map((s) => s.trim()).join(', ');
                    entrada.dataset.ubicado = entrada.value;
                }
            }
        }
    }

    function pintarRuta() {
        const caja = $('#viaRutaResumen');
        caja.hidden = !ruta;
        if (!ruta) return;
        caja.replaceChildren();
        const minutos = ruta.minutos != null ? ruta.minutos : Math.ceil((ruta.km / Number(config.velocidad_kmh || 30)) * 60);
        caja.append(viaElemento('strong', null, viaKm(ruta.km)), ` · unos ${minutos} min${ruta.aproximada ? ' (aproximado)' : ''}`);
        if (estadoCliente && (estadoCliente.cortesias || []).length) {
            caja.append(' · ');
            caja.appendChild(viaElemento('span', 'etiqueta etiqueta-naranja', ruta.km <= Number(estadoCliente.radio_km)
                ? 'Se aplicará el viaje de cortesía' : `La cortesía es para viajes de hasta ${estadoCliente.radio_km} km`));
        }
    }

    // Botón "Ubicación del cliente" de cada punto y "Guardar como ubicación del cliente"
    function pintarBotonesLugares() {
        const puntos = mapa ? mapa.puntos() : { a: null, b: null };
        const suyo = puntoCliente(clienteViaje);
        zona.querySelectorAll('.via-lugares-botones').forEach((caja) => {
            const lado = caja.dataset.lado;
            caja.replaceChildren();
            if (!clienteViaje) return;
            const b = viaBoton('Ubicación del cliente', 'bi-geo-alt', 'boton-secundario', { usar: '1', lado });
            b.disabled = !suyo;
            b.title = suyo ? clienteViaje.direccion || '' : 'Sin guardar: ubica el punto y usa "Guardar como ubicación del cliente"';
            caja.appendChild(b);
            if (puntos[lado]) {
                caja.appendChild(viaBoton('Guardar como ubicación del cliente', 'bi-bookmark-plus', 'boton-secundario via-boton-suave', { guardar: '1', lado }));
            }
        });
    }

    zona.querySelectorAll('.via-lugares-botones').forEach((caja) => caja.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b || !clienteViaje) return;
        const lado = b.dataset.lado;
        const entrada = lado === 'a' ? entradaA : entradaB;
        if (b.dataset.usar) {
            const punto = puntoCliente(clienteViaje);
            if (!punto) return;
            entrada.value = clienteViaje.direccion || 'Ubicación del cliente';
            entrada.dataset.ubicado = entrada.value;
            if (lado === 'a') mapa.ponerA(punto); else mapa.ponerB(punto);
        }
        if (b.dataset.guardar) {
            const punto = mapa.puntos()[lado];
            if (!punto) return;
            if (puntoCliente(clienteViaje) && !confirm(`¿Reemplazar la ubicación guardada del cliente (${clienteViaje.direccion || 'sin dirección'})?`)) return;
            await guardarUbicacionCliente({ direccion: entrada.value.trim() || `Punto ${lado.toUpperCase()}`, lat: punto.lat, lng: punto.lng });
        }
    }));

    // ---------- Paso 4: forma de pago (efectivo con cuánto paga, o SINPE; sin tarjeta) ----------
    let totalEstimado = null;   // total del paso 4 (null mientras no hay hora elegida)
    const formaPago = () => (zona.querySelector('input[name="viaPago"]:checked') || {}).value || null;

    function pintarPago() {
        const sinCobro = totalEstimado === 0; // cortesía sin recargos
        $('#viaPagoCaja').hidden = sinCobro;
        zona.querySelectorAll('[data-si="efectivo"]').forEach((el) => { el.hidden = sinCobro || formaPago() !== 'efectivo'; });
        const pagaCon = Number($('#viaPagaCon').value);
        const vuelto = $('#viaVuelto');
        if (formaPago() === 'efectivo' && totalEstimado && $('#viaPagaCon').value.trim() !== '' && Number.isFinite(pagaCon)) {
            vuelto.textContent = pagaCon >= totalEstimado
                ? `Vuelto: ${viaDinero(pagaCon - totalEstimado)}.`
                : `No alcanza: el viaje cuesta ${viaDinero(totalEstimado)}.`;
        } else {
            vuelto.textContent = 'Para que el conductor lleve el vuelto.';
        }
    }
    zona.querySelectorAll('input[name="viaPago"]').forEach((r) => r.addEventListener('change', () => {
        // Efectivo: se propone el monto exacto (se cambia si paga con un billete más grande)
        if (formaPago() === 'efectivo' && !$('#viaPagaCon').value && totalEstimado) $('#viaPagaCon').value = Math.ceil(totalEstimado);
        pintarPago();
    }));
    $('#viaPagaCon').addEventListener('input', pintarPago);

    // ---------- Paso 4: confirmar ----------
    function pintarConfirmar() {
        const caja = $('#viaConfirmar');
        caja.replaceChildren();
        totalEstimado = null;
        const d = datosViajeros();
        const fila = (titulo, texto) => {
            const p = viaElemento('p', 'via-confirmar-fila');
            p.append(viaElemento('span', null, titulo), viaElemento('strong', null, texto));
            caja.appendChild(p);
        };
        if (personal) fila('Cliente', clienteViaje ? nombreCliente(clienteViaje) : 'Falta elegirlo (paso 0)');
        fila('Viajan', [d.personas === null ? 'Falta indicar las personas' : plural(d.personas, 'persona', 'personas'),
            d.mascotas === null ? 'falta indicar si lleva mascotas' : d.mascotas ? plural(d.mascotas, 'mascota', 'mascotas') : 'sin mascotas'].join(' · '));
        fila('Ruta', ruta ? `${entradaA.value || 'A'} → ${entradaB.value || 'B'} · ${viaKm(ruta.km)}` : 'Falta ubicar A y B (paso 2)');
        if (horaElegida) {
            fila('Día y hora', `${new Date(horaElegida.inicio).toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })} · ${horaElegida.hora}`);
            fila('Franja', horaElegida.franja);
            const recargos = recargosViaje({ personas: d.personas || 0, mascotas: d.mascotas || 0 }, config);
            const cortesia = estadoCliente && (estadoCliente.cortesias || []).length && ruta && ruta.km <= Number(estadoCliente.radio_km);
            const total = cortesia ? recargos.total : Number(horaElegida.total || 0);
            totalEstimado = total;
            const p = viaElemento('p', 'via-confirmar-total');
            p.append(viaElemento('span', null, cortesia ? 'Total (viaje de cortesía)' : 'Total estimado'), viaElemento('strong', null, viaDinero(total)));
            caja.appendChild(p);
            if (recargos.total > 0) {
                caja.appendChild(viaElemento('p', 'via-nota-chica', `Incluye recargos: ${[
                    recargos.pasajeros ? `pasajeros adicionales ${viaDinero(recargos.pasajeros)}` : null,
                    recargos.mascotas ? `mascotas ${viaDinero(recargos.mascotas)}` : null].filter(Boolean).join(', ')}.`));
            }
            caja.appendChild(viaElemento('p', 'via-nota-chica',
                `El vehículo y el conductor se asignan solos al confirmar. ${cliente ? `Puedes cambiar la hora o cancelar hasta ${config.cancelar_horas} horas antes.` : ''}`));
        } else {
            fila('Día y hora', 'Falta elegir (paso 3)');
        }
        pintarPago();
        $('#viaSolicitar').disabled = !(horaElegida && ruta && (!personal || clienteViaje));
    }

    // ---------- Abrir / cerrar ----------
    async function abrirFormulario() {
        if (!puedeSolicitar) return;
        enFormulario = true;
        $('#viaForm').reset();
        $('#viaFormError').textContent = '';
        $('#viaPersonas').value = '1';
        zona.querySelectorAll('input[name="viaMascotas"], input[name="viaPago"]').forEach((r) => { r.checked = false; }); // sin respuesta marcada
        delete entradaA.dataset.ubicado;
        delete entradaB.dataset.ubicado;
        mostrarCondicionales();
        horaElegida = null;
        ruta = null;
        $('#viaVistaLista').hidden = true;
        $('#viaNuevo').hidden = true;
        $('#viaForm').hidden = false;
        $('#viaPasoCliente').hidden = !personal;
        if (personal) {
            clienteViaje = null;
            estadoCliente = null;
            $('#viaCliElegido').hidden = true;
            $('#viaCliBuscar').closest('.buscador').hidden = false;
        }
        crearMapa();
        if (mapa) await mapa.limpiar();
        selectorForm.pintarDias();
        pintarRuta();
        pintarBotonesLugares();
        refrescarHoras();
        pintarConfirmar();
        (personal ? $('#viaCliBuscar') : $('#viaPersonas')).focus();
    }

    function cerrarFormulario() {
        enFormulario = false;
        $('#viaForm').hidden = true;
        $('#viaVistaLista').hidden = false;
        $('#viaNuevo').hidden = !puedeSolicitar;
        if (parametrosSeccion().get('nuevo')) history.replaceState(null, '', '#viajes');
    }

    $('#viaNuevo').addEventListener('click', abrirFormulario);
    $('#viaVolver').addEventListener('click', cerrarFormulario);

    // ---------- Enviar ----------
    $('#viaForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const error = $('#viaFormError');
        error.textContent = '';
        const d = datosViajeros();
        const puntos = mapa ? mapa.puntos() : {};
        const falta = (personal && !clienteViaje) ? 'Elige el cliente (paso 0).'
            : d.personas === null ? 'Indica cuántas personas viajan (al menos 1).'
                : d.mascotas === null ? 'Indica si lleva mascotas.'
                    : !puntos.a || !puntos.b || !ruta ? 'Ubica el punto A y el punto B en el mapa.'
                        : !horaElegida ? 'Elige el día y una hora libre.' : '';
        if (falta) { error.textContent = falta; return; }
        // Forma de pago (la base lo vuelve a revisar con el total final)
        const cobra = totalEstimado !== 0;
        const pagaCon = Number($('#viaPagaCon').value);
        if (cobra && !formaPago()) { error.textContent = 'Elige la forma de pago: efectivo o SINPE Móvil.'; return; }
        if (cobra && formaPago() === 'efectivo') {
            if ($('#viaPagaCon').value.trim() === '' || !Number.isFinite(pagaCon) || pagaCon <= 0) {
                error.textContent = 'Indica con cuánto paga en efectivo (para llevar el vuelto).';
                $('#viaPagaCon').focus();
                return;
            }
            if (totalEstimado && pagaCon < totalEstimado) {
                error.textContent = `Con ${viaDinero(pagaCon)} no alcanza: el viaje cuesta ${viaDinero(totalEstimado)}.`;
                $('#viaPagaCon').focus();
                return;
            }
        }

        const boton = $('#viaSolicitar');
        boton.disabled = true;
        boton.querySelector('span').textContent = 'Reservando...';
        const { data, error: errorBase } = await db.rpc('viajes_solicitar', {
            p: {
                usuario_id: sesion.id || 0,
                empresa_id: empresaActivaId(),
                cliente_id: clienteViaje ? clienteViaje.id : clienteActual(),
                origen: { direccion: entradaA.value.trim(), lat: puntos.a.lat, lng: puntos.a.lng },
                destino: { direccion: entradaB.value.trim(), lat: puntos.b.lat, lng: puntos.b.lng },
                km: ruta.km, minutos: ruta.minutos, aproximada: !!ruta.aproximada,
                personas: d.personas, mascotas: d.mascotas, mascotas_nota: $('#viaMascotasNota').value.trim(),
                inicio: horaElegida.inicio,
                notas: $('#viaNotas').value.trim(),
                forma_pago: cobra ? formaPago() : null,
                paga_con: cobra && formaPago() === 'efectivo' ? pagaCon : null,
            },
        });
        if (!activa) return;
        boton.querySelector('span').textContent = 'Solicitar viaje';
        if (errorBase) {
            console.error('Error al solicitar el viaje:', errorBase);
            error.textContent = viaErrorTexto(errorBase, 'reservar el viaje');
            boton.disabled = false;
            if (errorBase.hint === 'ocupado') { horaElegida = null; refrescarHoras(); pintarConfirmar(); }
            return;
        }
        cerrarFormulario();
        const quien = [data.vehiculo ? `${data.vehiculo.marca} ${data.vehiculo.placa}` : null, data.conductor ? data.conductor.nombre : null].filter(Boolean).join(' · ');
        aviso.mostrar(`Viaje ${data.codigo} reservado: ${viaFecha(data.inicio, true)} a las ${viaHora(data.inicio)}${quien ? ` · ${quien}` : ''}${data.es_cortesia ? ' · ¡viaje de cortesía!' : ''}.`
            + (data.estado === 'pendiente' ? ' Queda esperando que el conductor lo acepte (te llega un aviso).' : ''));
        if (!cliente) $('#viaFecha').value = viaFechaISO(new Date(data.inicio));
        if (cliente) cargarCliente();
        cargarLista();
    });

    // ==================================================
    // CAMBIAR LA HORA
    // ==================================================
    let horaNueva = null;
    const selectorCambio = crearSelectorHoras($('#viaCambiarDias'), $('#viaCambiarHoras'), (h) => {
        horaNueva = h;
        $('#viaCambiarSi').disabled = !h;
    });

    function abrirCambiar(v) {
        viajeCambiando = v;
        horaNueva = null;
        $('#viaCambiarError').textContent = '';
        $('#viaCambiarSi').disabled = true;
        $('#viaCambiarTexto').textContent = `${v.codigo} · ahora: ${viaFecha(v.inicio, true)} a las ${viaHora(v.inicio)}. Elige la hora nueva: si no está libre, el viaje sigue como está.`;
        selectorCambio.pintarDias();
        $('#viaCambiarDialogo').showModal();
        selectorCambio.cargar({
            p_empresa: v.empresa_id, p_km: v.km, p_minutos: v.minutos, p_personas: v.personas, p_mascotas: v.mascotas,
            p_mercaderia: v.lleva_mercaderia, p_kg: Number(v.mercaderia_kg || 0), p_excluir: v.id,
        });
    }

    $('#viaCambiarNo').addEventListener('click', () => $('#viaCambiarDialogo').close());
    $('#viaCambiarSi').addEventListener('click', async () => {
        if (!viajeCambiando || !horaNueva) return;
        $('#viaCambiarSi').disabled = true;
        const { data, error } = await db.rpc('viajes_cambiar_hora', { p_viaje: viajeCambiando.id, p_usuario: sesion.id || 0, p_inicio: horaNueva.inicio });
        if (!activa) return;
        if (error) {
            $('#viaCambiarError').textContent = viaErrorTexto(error, 'cambiar la hora');
            if (error.hint === 'ocupado') selectorCambio.cargar();
            return;
        }
        $('#viaCambiarDialogo').close();
        aviso.mostrar(`${data.codigo}: hora nueva ${viaFecha(data.inicio, true)} a las ${viaHora(data.inicio)} (${viaDinero(data.total)}).`);
        if (!cliente) $('#viaFecha').value = viaFechaISO(new Date(data.inicio));
        cargarLista();
    });

    // ==================================================
    // CANCELAR
    // ==================================================
    function abrirCancelar(v) {
        viajeCancelando = v;
        $('#viaCancelarError').textContent = '';
        $('#viaCancelarMotivo').value = '';
        $('#viaCancelarTexto').textContent = `¿Cancelar ${v.codigo} del ${viaFecha(v.inicio, true)} a las ${viaHora(v.inicio)}?`
            + (v.es_cortesia ? ' Tu viaje de cortesía vuelve a quedar disponible (si no ha vencido).' : '');
        $('#viaCancelarDialogo').showModal();
    }

    $('#viaCancelarNo').addEventListener('click', () => $('#viaCancelarDialogo').close());
    $('#viaCancelarSi').addEventListener('click', async () => {
        if (!viajeCancelando) return;
        $('#viaCancelarSi').disabled = true;
        const { error } = await db.rpc('viajes_cancelar', {
            p_viaje: viajeCancelando.id, p_usuario: sesion.id || 0, p_motivo: $('#viaCancelarMotivo').value.trim() || null,
        });
        if (!activa) return;
        $('#viaCancelarSi').disabled = false;
        if (error) { $('#viaCancelarError').textContent = viaErrorTexto(error, 'cancelar el viaje'); return; }
        $('#viaCancelarDialogo').close();
        aviso.mostrar(`Viaje ${viajeCancelando.codigo} cancelado.`);
        if (cliente) cargarCliente();
        cargarLista();
    });

    // ==================================================
    // ARRANQUE
    // ==================================================

    async function cargarCliente() {
        clienteViaje = await cargarDatosCliente(clienteActual() || 0);
        if (!activa) return;
        pintarCortesia($('#viaCortesia'), estadoCliente);
        pintarMisLugares();
    }

    async function cargarVehiculos() {
        const { data } = await db.from('vehiculos').select('id, placa, marca').order('placa');
        vehiculos = data || [];
        const sel = $('#viaFiltroVehiculo');
        sel.replaceChildren(new Option('Todos los vehículos', ''), ...vehiculos.map((v) => new Option(`${v.placa} · ${v.marca}`, v.id)));
        sel.hidden = vehiculos.length < 2;
    }

    // Abre el viaje de #viajes?id=N en su día (personal y conductor)
    async function irAlViajePedido() {
        const id = Number(parametrosSeccion().get('id'));
        if (!id || cliente) return;
        const { data } = await db.from('viajes').select('inicio').eq('id', id).maybeSingle();
        if (data) $('#viaFecha').value = viaFechaISO(new Date(data.inicio));
    }

    $('#viaSubtitulo').textContent = cliente ? 'Solicita tus viajes y síguelos'
        : conductor ? 'Tus viajes del día: avisa cuando vas en camino, cuando sube el pasajero y al terminar'
            : 'Agenda de viajes: confirmados, en camino y terminados';
    $('#viaNuevo').hidden = !puedeSolicitar;
    $('#viaCliente').hidden = !cliente;
    $('#viaFiltros').hidden = cliente;
    Object.entries(VIA_ESTADOS).forEach(([valor, [texto]]) => $('#viaFiltroEstado').appendChild(new Option(texto, valor)));
    $('#viaFecha').value = viaFechaISO();

    (async () => {
        const cfg = await cargarConfigTransporte();
        if (!activa) return;
        config = cfg.config;
        if (cfg.error && cfg.error.code !== 'PGRST116') {
            mostrarError(cfg.error, 'cargar las reglas de transporte');
        }
        if (cliente) {
            if (!clienteActual()) aviso.mostrar('Tu usuario no está ligado a un cliente. Consulta con la empresa.', 'error');
            await cargarCliente();
        } else {
            await irAlViajePedido();
            if (personal) cargarVehiculos();
        }
        await cargarLista();
        if (parametrosSeccion().get('nuevo') === '1' && puedeSolicitar) abrirFormulario();
    })();

    // Cada minuto se actualiza la lista (otro equipo cambia los estados)
    const reloj = setInterval(() => { if (!enFormulario) cargarLista(); }, 60000);

    return () => {
        activa = false;
        clearInterval(reloj);
        window.removeEventListener('acachete:viaje', alEscanearViaje);
        clearTimeout(esperaHoras);
        clearTimeout(esperaCliente);
        aviso.limpiar();
        if (mapa) mapa.destruir();
        ['#viaCambiarDialogo', '#viaCancelarDialogo', '#viaQrDialogo'].forEach((s) => { const d = $(s); if (d && d.open) d.close(); });
    };
});
