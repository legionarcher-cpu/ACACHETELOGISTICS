/* ==================================================
   SECCIÓN: MIS ENVÍOS (cliente con usuario de una empresa de encomiendas)
   ACACHETE LOGISTICS

   Guía: docs/secciones/envios.md · Tabla: pedido_solicitudes (sql/01 bloque 23).

   El cliente:
     - Solicita un envío: qué envía (descripción, bultos, peso), dónde se recoge (A) y a
       dónde se lleva (B) con PUNTOS DE REFERENCIA y los puntos en el mapa, quién recibe
       y para qué día. Se avisa (campana) al Admin G3 de su tienda; si la tienda no tiene
       G3, al G2 de la región y si tampoco, al Administrador y G1 (notificarPendiente).
     - Ve sus solicitudes: Pendiente | Aprobada (con su pedido y el avance) | Rechazada
       (con el motivo) | Cancelada. Puede cancelar las que siguen pendientes.
   La tienda la aprueba en Pedidos ("Revisar y registrar"): se registra el pedido con
   todo lo de siempre (tarifa, piloto, pedidos cercanos y avisos) y se le avisa al cliente.
   ================================================== */

// Lo que ve el cliente del avance de su pedido (estados de js/secciones/pedidos.js, más simples)
const ENV_AVANCE = {
    registrado: ['Programado', 'etiqueta-azul'], recibido_bodega: ['Programado', 'etiqueta-azul'],
    asignado: ['Programado', 'etiqueta-azul'], reprogramado: ['Reprogramado', 'etiqueta-azul'],
    alistando: ['Preparando', 'etiqueta-naranja'], listo_despacho: ['Preparando', 'etiqueta-naranja'],
    recibido_ruta: ['Preparando', 'etiqueta-naranja'], cargado: ['Preparando', 'etiqueta-naranja'],
    en_ruta: ['En camino', 'etiqueta-turquesa'], en_entrega: ['Entregando', 'etiqueta-turquesa'],
    entregado: ['Entregado', 'etiqueta-verde'], entregado_incidencia: ['Entregado', 'etiqueta-verde'],
    no_entregado: ['No se pudo entregar', 'etiqueta-rosada'], devuelto: ['Devuelto', 'etiqueta-rosada'],
    cancelado: ['Cancelado', 'etiqueta-gris'],
};
const ENV_TERMINADOS = ['entregado', 'entregado_incidencia', 'devuelto', 'cancelado'];
const ENV_SOLICITUD = {
    pendiente: ['Por aprobar', 'etiqueta-naranja'],
    aprobada: ['Aprobada', 'etiqueta-verde'],
    rechazada: ['Rechazada', 'etiqueta-rosada'],
    cancelada: ['Cancelada', 'etiqueta-gris'],
};

registrarSeccion('envios', (zona) => {
    const $ = (selector) => zona.querySelector(selector);
    const aviso = crearAviso($('#envAviso'), 6000);
    const sesion = obtenerSesion() || {};
    const el = viaElemento; // js/viajes-comun.js
    let activa = true;

    // ---------- Estado ----------
    let cliente = null;        // su ficha en Clientes
    let tiendas = [];          // sus tiendas (clientes_tiendas)
    let actividades = [];      // actividades de la empresa con recolección
    let solicitudes = [];
    let pedidosDe = new Map(); // pedido_id -> { codigo, estado, fecha_entrega, total_cobrar }
    let mapa = null;
    let ruta = null;           // { km, minutos, aproximada } o null
    let cancelando = null;

    const faltaTabla = (e) => !!e && ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(e.code);
    const fechaLarga = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
    const nombreCliente = (c) => [c.nombre, c.apellido1, c.apellido2].filter((x) => x && x !== '-').join(' ');

    // ==================================================
    // CARGAR
    // ==================================================

    async function cargarBase() {
        const [cli, ct, act] = await Promise.all([
            db.from('clientes').select('id, nombre, apellido1, apellido2, telefono, direccion, ubicacion').eq('id', clienteActual() || 0).maybeSingle(),
            db.from('clientes_tiendas').select('tienda_id, tiendas(id, codigo, nombre)').eq('cliente_id', clienteActual() || 0),
            db.from('actividades').select('codigo, nombre, activa, usa_recoleccion, usa_viajes').order('orden'),
        ]);
        cliente = cli.data || null;
        tiendas = (ct.data || []).map((x) => x.tiendas).filter(Boolean);
        const lista = act.error ? [] : act.data;
        actividades = lista.filter((a) => a.activa !== false && empresaTieneActividad(a.codigo) && !a.usa_viajes
            && (a.usa_recoleccion !== undefined ? a.usa_recoleccion : esActividadDeRecoleccion(a.codigo)));
    }

    async function cargarLista() {
        const { data, error } = await db.from('pedido_solicitudes').select('*')
            .eq('cliente_id', clienteActual() || 0).order('creado_en', { ascending: false }).limit(40);
        if (!activa) return;
        if (error) {
            console.error('Error al cargar las solicitudes:', error);
            if (faltaTabla(error)) {
                $('#envFaltaSql').hidden = false;
                $('#envNuevo').hidden = true;
            } else {
                aviso.mostrar('No se pudieron cargar tus envíos. Revisa la conexión.', 'error');
            }
            return;
        }
        solicitudes = data;
        const ids = data.map((s) => s.pedido_id).filter(Boolean);
        pedidosDe = new Map();
        if (ids.length) {
            const ped = await db.from('pedidos').select('id, codigo, estado, fecha_entrega, total_cobrar').in('id', ids);
            (ped.data || []).forEach((p) => pedidosDe.set(p.id, p));
        }
        if (!activa) return;
        dibujarLista();
    }

    // ==================================================
    // LISTA
    // ==================================================

    // ¿Sigue en curso? (pendiente, o aprobada y su pedido todavía no termina)
    function enCurso(s) {
        if (s.estado === 'pendiente') return true;
        if (s.estado !== 'aprobada') return false;
        const p = pedidosDe.get(s.pedido_id);
        return !p || !ENV_TERMINADOS.includes(p.estado);
    }

    function etiqueta([texto, color]) {
        return el('span', `etiqueta ${color}`, texto);
    }

    function punto(letra, direccion, referencia) {
        const p = el('p', 'via-ruta');
        const textos = el('span');
        textos.append(direccion || '');
        if (referencia) textos.append(el('small', 'env-ref', `Referencia: ${referencia}`));
        p.append(el('b', `via-punto via-punto-${letra}`, letra.toUpperCase()), textos);
        return p;
    }

    function tarjeta(s) {
        const art = el('article', `tarjeta env-tarjeta env-${s.estado}`);
        const cab = el('div', 'env-tarjeta-cabecera');
        cab.append(el('span', 'texto-codigo', `S-${s.id}`), etiqueta(ENV_SOLICITUD[s.estado] || [s.estado, 'etiqueta-gris']));
        const p = s.pedido_id ? pedidosDe.get(s.pedido_id) : null;
        if (p) cab.appendChild(etiqueta(ENV_AVANCE[p.estado] || [p.estado, 'etiqueta-gris']));
        art.appendChild(cab);

        art.appendChild(el('p', 'env-fecha', `Para el ${fechaLarga(p ? p.fecha_entrega : s.fecha)}`));
        art.append(punto('a', s.recoleccion_direccion, s.recoleccion_referencia), punto('b', s.entrega_direccion, s.entrega_referencia));

        const datos = [s.descripcion, plural(s.bultos, 'bulto', 'bultos'), s.peso_kg ? `${Number(s.peso_kg)} kg aprox.` : null,
            s.recibe_nombre ? `Recibe: ${s.recibe_nombre}` : null].filter(Boolean).join(' · ');
        art.appendChild(el('p', 'env-datos', datos));

        if (p) {
            const linea = el('p', 'env-pedido');
            linea.innerHTML = '<i class="bi bi-box-seam"></i> ';
            linea.append(`Pedido ${p.codigo}`, Number(p.total_cobrar) > 0 ? ` · Total a pagar ${viaDinero(p.total_cobrar)}` : '');
            art.appendChild(linea);
        }
        if (s.estado === 'rechazada' && s.motivo) art.appendChild(el('p', 'env-motivo', `Motivo: ${s.motivo}`));
        if (s.estado === 'pendiente') {
            art.appendChild(el('p', 'env-espera', 'La tienda la está revisando. Te avisaremos al aprobarla.'));
            const b = viaBoton('Cancelar solicitud', 'bi-x-circle', 'boton-secundario', { accion: 'cancelar', id: s.id });
            const botones = el('div', 'env-botones');
            botones.appendChild(b);
            art.appendChild(botones);
        }
        return art;
    }

    function dibujarLista() {
        const actuales = solicitudes.filter(enCurso);
        const anteriores = solicitudes.filter((s) => !enCurso(s)).slice(0, 15);
        $('#envEnCurso').replaceChildren(...(actuales.length ? actuales.map(tarjeta)
            : [el('p', 'via-vacio', 'No tienes envíos en curso. Usa "Solicitar envío".')]));
        $('#envAnterioresCaja').hidden = !anteriores.length;
        $('#envAnteriores').replaceChildren(...anteriores.map(tarjeta));
    }

    zona.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion="cancelar"]');
        if (!b) return;
        cancelando = solicitudes.find((s) => s.id === Number(b.dataset.id)) || null;
        if (!cancelando) return;
        $('#envCancelarTexto').textContent = `¿Cancelar la solicitud S-${cancelando.id} (${cancelando.descripcion})? La tienda ya no la verá.`;
        $('#envCancelarDialogo').showModal();
    });
    $('#envCancelarNo').addEventListener('click', () => $('#envCancelarDialogo').close());
    $('#envCancelarSi').addEventListener('click', async () => {
        const s = cancelando;
        $('#envCancelarDialogo').close();
        if (!s) return;
        // Solo si sigue pendiente (la tienda pudo aprobarla mientras tanto)
        const { data, error } = await db.from('pedido_solicitudes').update({ estado: 'cancelada' })
            .eq('id', s.id).eq('estado', 'pendiente').select('id');
        if (error) { aviso.mostrar('No se pudo cancelar. Revisa la conexión.', 'error'); return; }
        if (!data.length) aviso.mostrar('La tienda ya la revisó: no se puede cancelar.', 'error');
        else {
            resolverPendientes('solicitud_envio', s.id); // js/notificaciones.js
            aviso.mostrar(`Solicitud S-${s.id} cancelada.`);
        }
        cargarLista();
    });

    // ==================================================
    // SOLICITAR
    // ==================================================

    const form = $('#envForm');
    const inputA = $('#envRecoger');
    const inputB = $('#envEntregar');
    const hoy = () => viaFechaISO();

    function mostrarFormulario(si) {
        form.hidden = !si;
        $('#envVistaLista').hidden = si;
        $('#envNuevo').hidden = si;
        if (si && !mapa) {
            mapa = crearMapaRuta($('#envMapa'), {
                etiquetaA: 'Recoger', etiquetaB: 'Entregar',
                textoA: () => inputA.value, textoB: () => inputB.value,
                entradaA: inputA, entradaB: inputB,
                alCambiar: (r) => { ruta = r; },
            });
        }
    }

    async function abrirFormulario() {
        if (!actividades.length) {
            aviso.mostrar('Tu empresa no tiene un servicio de encomiendas activo. Comunícate con ella.', 'error');
            return;
        }
        $('#envFormError').textContent = '';
        mostrarFormulario(true);

        const selAct = $('#envActividad');
        selAct.replaceChildren(...actividades.map((a) => new Option(a.nombre, a.codigo)));
        $('#envCampoActividad').hidden = actividades.length <= 1;
        const selTienda = $('#envTienda');
        selTienda.replaceChildren(...tiendas.map((t) => new Option(`${t.codigo} · ${t.nombre}`, t.id)));
        $('#envCampoTienda').hidden = tiendas.length <= 1;

        $('#envFecha').min = hoy();
        if (!$('#envFecha').value) $('#envFecha').value = hoy();

        // A: su dirección y su ubicación guardadas (casi siempre se envía desde la casa)
        if (cliente && !inputA.value && cliente.direccion) {
            inputA.value = cliente.direccion;
            const p = puntoDeTexto(cliente.ubicacion); // js/mapa.js
            if (p) mapa.ponerA(p);
            else mapa.ubicarA();
        }
        $('#envDescripcion').focus();
    }

    $('#envNuevo').addEventListener('click', () => { location.hash = 'envios?nuevo=1'; });
    $('#envVolver').addEventListener('click', () => { location.hash = 'envios'; });

    inputA.addEventListener('change', () => { if (mapa && !entradaYaUbicada(inputA) && inputA.value.trim().length >= 4) mapa.ubicarA(); });
    inputB.addEventListener('change', () => { if (mapa && !entradaYaUbicada(inputB) && inputB.value.trim().length >= 4) mapa.ubicarB(); });

    form.addEventListener('change', (e) => {
        if (e.target.name === 'envRecibe') {
            const otra = e.target.value === 'otra';
            zona.querySelectorAll('[data-env-otra]').forEach((c) => { c.hidden = !otra; });
        }
    });

    function fallo(texto, campo = null) {
        $('#envFormError').textContent = texto;
        if (campo) campo.focus();
        return null;
    }

    // Revisa y arma la fila de pedido_solicitudes (o null si falta algo)
    function leerFormulario() {
        $('#envFormError').textContent = '';
        const descripcion = $('#envDescripcion').value.trim();
        const bultos = Number($('#envBultos').value);
        const pesoTexto = $('#envPeso').value.trim();
        const peso = pesoTexto === '' ? null : Number(pesoTexto);
        const puntos = mapa ? mapa.puntos() : {};
        const otra = form.querySelector('input[name="envRecibe"]:checked').value === 'otra';
        const recibeNombre = $('#envRecibeNombre').value.trim();
        const recibeTel = $('#envRecibeTelefono').value.trim();
        const fecha = $('#envFecha').value;

        if (!descripcion) return fallo('Escribe qué envías.', $('#envDescripcion'));
        if (!Number.isInteger(bultos) || bultos < 1 || bultos > 999) return fallo('La cantidad de bultos debe ser un número entero de 1 o más.', $('#envBultos'));
        if (peso !== null && (!Number.isFinite(peso) || peso < 0)) return fallo('El peso debe ser un número (o déjalo vacío).', $('#envPeso'));
        if (!inputA.value.trim()) return fallo('Escribe dónde recogemos el paquete (A).', inputA);
        if (!inputB.value.trim()) return fallo('Escribe a dónde lo llevamos (B).', inputB);
        if (!puntos.a || !puntos.b) return fallo('Ubica A y B en el mapa: con "Ubicar", tocando el mapa o pegando la ubicación.');
        if (otra && !recibeNombre) return fallo('Escribe el nombre de quien recibe.', $('#envRecibeNombre'));
        if (otra && recibeTel.replace(/\D/g, '').length < 8) return fallo('Escribe el teléfono de quien recibe (al menos 8 dígitos).', $('#envRecibeTelefono'));
        if (!fecha || fecha < hoy()) return fallo('Elige la fecha de entrega (hoy o después).', $('#envFecha'));

        const redondo = (n) => Math.round(Number(n) * 1e6) / 1e6;
        return {
            tienda_id: Number($('#envTienda').value) || (tiendas[0] ? tiendas[0].id : null),
            actividad: $('#envActividad').value || actividades[0].codigo,
            cliente_id: clienteActual(),
            usuario_id: sesion.id || null,
            cliente_nombre: cliente ? nombreCliente(cliente) : (sesion.nombre || ''),
            cliente_telefono: cliente ? cliente.telefono : '',
            recoleccion_direccion: inputA.value.trim(),
            recoleccion_referencia: $('#envRecogerRef').value.trim() || null,
            recoleccion_lat: redondo(puntos.a.lat), recoleccion_lng: redondo(puntos.a.lng),
            entrega_direccion: inputB.value.trim(),
            entrega_referencia: $('#envEntregarRef').value.trim() || null,
            entrega_lat: redondo(puntos.b.lat), entrega_lng: redondo(puntos.b.lng),
            km: ruta ? ruta.km : null,
            minutos: ruta ? ruta.minutos : null,
            recibe_nombre: otra ? recibeNombre : null,
            recibe_telefono: otra ? recibeTel : null,
            fecha,
            descripcion,
            bultos,
            peso_kg: peso,
            notas: $('#envNotas').value.trim() || null,
        };
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fila = leerFormulario();
        if (!fila) return;
        const boton = $('#envEnviar');
        boton.disabled = true;
        const { data, error } = await db.from('pedido_solicitudes').insert(fila).select('id').single();
        boton.disabled = false;
        if (error) {
            console.error('Error al enviar la solicitud:', error);
            $('#envFormError').textContent = faltaTabla(error)
                ? 'Esta función todavía no está lista. Comunícate con la empresa.'
                : 'No se pudo enviar la solicitud. Revisa la conexión e intenta de nuevo.';
            return;
        }
        // Aviso a quien aprueba: G3 de la tienda (si no hay, G2; si tampoco, Administrador y G1)
        await notificarPendiente({
            referenciaTipo: 'solicitud_envio', referenciaId: data.id, tiendaId: fila.tienda_id, soloTienda: true,
            titulo: 'Solicitud de envío de un cliente',
            mensaje: `${fila.cliente_nombre} pide recoger en ${fila.recoleccion_direccion} y entregar en ${fila.entrega_direccion} `
                + `el ${fila.fecha.split('-').reverse().join('/')} (${plural(fila.bultos, 'bulto', 'bultos')}). Revísala en Pedidos.`,
            enlace: '#pedidos?solicitudes=1',
        });
        form.reset();
        if (mapa) mapa.limpiar();
        zona.querySelectorAll('[data-env-otra]').forEach((c) => { c.hidden = true; });
        try { sessionStorage.setItem('env_aviso', `Solicitud S-${data.id} enviada. La tienda la revisará y te avisará.`); } catch { /* sin almacenamiento */ }
        location.hash = 'envios';
    });

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================
    (async () => {
        await cargarBase();
        if (!activa) return;
        let pendiente = null;
        try { pendiente = sessionStorage.getItem('env_aviso'); sessionStorage.removeItem('env_aviso'); } catch { /* sin almacenamiento */ }
        if (pendiente) aviso.mostrar(pendiente);
        if (parametrosSeccion().get('nuevo')) abrirFormulario();
        else {
            mostrarFormulario(false);
            cargarLista();
        }
    })();

    return () => {
        activa = false;
        aviso.limpiar();
        const d = $('#envCancelarDialogo');
        if (d && d.open) d.close();
        if (mapa) mapa.destruir();
    };
});
