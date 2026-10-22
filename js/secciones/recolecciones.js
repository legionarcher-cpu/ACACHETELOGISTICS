/* ==================================================
   SECCIÓN: RECOLECCIONES (actividad "recoleccion") - LÓGICA
   ACACHETE LOGISTICS

   Guía: docs/secciones/recolecciones.md · Base: sql/instalacion/09_recolecciones.sql
   Recicla de Viajes: el mismo esquema (selector de día y hora, cambiar la hora todo o
   nada, cancelar, estados del conductor), sus piezas comunes (js/viajes-comun.js:
   viaFecha, viaHora, viaRangoDia, viaElemento, viaBoton, textoDias...), sus estilos
   (css/secciones/recolecciones.css importa los de Viajes), el mapa A -> B (js/mapa.js)
   y la ubicación de la ficha del cliente. Transporte no cambia.

   UNA SOLA AGENDA por empresa: cada espacio lo toma un solo cliente.

   QUIÉN VE QUÉ:
     Cliente (rol cliente) -> SUS recolecciones (próximas y anteriores) y lo que debe;
                              solicita, cambia la hora o cancela hasta "cancelar_horas" antes.
     Quien atiende         -> (Administrador, Admin G1, piloto o "recolecciones.atender")
                              agenda del día con el proceso del conductor: En camino ->
                              Recogida -> Entregada (o "No estaba"); pestaña Bloqueos
                              (almuerzo, entrada, salida) y horario de servicio.
     Cobra                 -> ("recolecciones.cobrar": Administrador y Admin G1) pestaña
                              Cobros: tarifa diaria por cliente COMO LAS RUTAS (días que se
                              trabajan + monto fijo: cada día marcado se cobra, haya o no
                              recolecciones; la base arma los cargos con
                              recoleccion_generar_cargos) y cobro de la semana.
     Personal              -> agenda del día; solicita para un cliente, cambia la hora y cancela.

   La página SOLO LEE recolecciones: solicitar, cambiar, cancelar y avanzar van por
   funciones de la base, que revisan las reglas y que nadie tome un espacio ocupado.
   ================================================== */

// Valores de siempre de recoleccion_config (si la empresa todavía no guardó los suyos)
const REC_CONFIG_BASE = {
    dias: [1, 2, 3, 4, 5], hora_inicio: '08:00', hora_fin: '17:00', espacio_min: 30,
    anticipacion_min: 60, anticipacion_dias: 14, cancelar_horas: 1,
};

// Estado -> [texto, color de la etiqueta]
const REC_ESTADOS = {
    confirmada: ['Confirmada', 'etiqueta-azul'],
    en_camino: ['En camino', 'etiqueta-naranja'],
    recogida: ['Recogida', 'etiqueta-naranja'],
    entregada: ['Entregada', 'etiqueta-verde'],
    cancelada: ['Cancelada', 'etiqueta-gris'],
    no_estaba: ['No estaba', 'etiqueta-rosada'],
};
const REC_ACTIVAS = ['confirmada', 'en_camino', 'recogida'];

registrarSeccion('recolecciones', (zona) => {

    const $ = (selector) => zona.querySelector(selector);
    const aviso = crearAviso($('#recAviso'), 7000);
    const sesion = obtenerSesion() || {};

    // ---------- Quién entra ----------
    const cliente = esCliente();
    const esPiloto = rolActual() === 'piloto';
    // Funciones de Usuarios -> "Módulos y funciones" (js/sesion.js); la base vuelve a revisarlas
    const atiende = !cliente && puedeHacer('recolecciones.atender', esAdministrador() || esAdminG1() || esPiloto);
    const cobra = !cliente && puedeHacer('recolecciones.cobrar', esAdministrador() || esAdminG1());
    const puedeSolicitar = cliente || (!esPiloto && puedeHacer('recolecciones.solicitar', true));

    // ---------- Estado ----------
    let config = { ...REC_CONFIG_BASE };
    let lista = [];               // las de la agenda (día elegido) o las del cliente
    let oficina = null;           // { direccion, punto } de la empresa (Tiendas -> Empresas, bloque 41)
    let clienteSel = null;        // { id, nombre, apellido1, apellido2, telefono, direccion, ubicacion } de la solicitud
    let mapa = null;
    let horaElegida = null;       // { inicio, hora }
    let cambiando = null;
    let cancelando = null;
    let activa = true;
    let enFormulario = false;
    let faltaSql = false;

    // ==================================================
    // AYUDAS
    // ==================================================

    const hhmm = (t) => String(t || '').slice(0, 5);
    const nombreCliente = (c) => [c.nombre, c.apellido1, c.apellido2].filter(Boolean).join(' ');
    const fechaLarga = (t) => new Date(t).toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
    // ¿El cliente todavía puede cambiar o cancelar? (la base lo vuelve a revisar)
    const clientePuedeCambiar = (r) => r.estado === 'confirmada'
        && Date.now() <= new Date(r.inicio).getTime() - Number(config.cancelar_horas || 0) * 3600000;
    const sinSql = (e) => !!e && ['PGRST202', '42883', '42P01', 'PGRST205', '42703', 'PGRST200'].includes(e.code);

    function textoError(error, accion) {
        if (!error) return '';
        if (error.code === 'P0001') return error.message;
        // Con el detalle de la base (qué tabla, columna o función falta), para saber qué pasó
        if (sinSql(error)) {
            return 'Falta instalar la base de datos (sql/instalacion).'
                + (error.message ? ` Detalle: ${error.message}` : '');
        }
        return `No se pudo ${accion}. Revisa la conexión e intenta de nuevo.`;
    }

    function mostrarError(error, accion) {
        console.error(`Error al ${accion}:`, error);
        aviso.mostrar(textoError(error, accion), 'error');
    }

    // Lunes (ISO "2026-10-19") de la semana de una fecha
    function lunesDe(fechaISO) {
        const d = new Date(`${fechaISO}T12:00:00`);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return viaFechaISO(d);
    }

    // Casillas Lun..Dom dentro de una caja (bloqueos y horario)
    function pintarCasillasDias(caja, marcados) {
        caja.replaceChildren(...[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const label = viaElemento('label');
            const c = viaElemento('input');
            c.type = 'checkbox';
            c.value = d;
            c.checked = marcados.includes(d);
            label.append(c, ` ${VIA_DIAS_CORTOS[d]}`);
            return label;
        }));
    }
    const diasMarcados = (caja) => [...caja.querySelectorAll('input:checked')].map((c) => Number(c.value));

    // ==================================================
    // TARJETA DE UNA RECOLECCIÓN (con las clases de la tarjeta de viaje)
    // ==================================================

    function tarjeta(r, acciones = []) {
        const art = viaElemento('article', `via-viaje rec-estado-${r.estado}`);
        art.dataset.id = r.id;

        const hora = viaElemento('div', 'via-viaje-hora');
        hora.append(viaElemento('strong', null, viaHora(r.inicio)), viaElemento('small', null, viaFecha(r.inicio)));

        const cuerpo = viaElemento('div', 'via-viaje-cuerpo');
        const cab = viaElemento('div', 'via-viaje-cabecera');
        const [texto, color] = REC_ESTADOS[r.estado] || [r.estado, 'etiqueta-gris'];
        cab.append(viaElemento('strong', null, r.codigo || ''), viaElemento('span', `etiqueta ${color}`, texto));
        cuerpo.appendChild(cab);
        if (!cliente) {
            cuerpo.appendChild(viaElemento('p', 'via-viaje-cliente',
                [r.cliente_nombre, r.cliente_telefono].filter(Boolean).join(' · ')));
        }

        const punto = (letra, clase, textoPunto) => {
            const p = viaElemento('p', 'via-ruta');
            p.append(viaElemento('b', `via-punto ${clase}`, letra), viaElemento('span', null, textoPunto));
            return p;
        };
        cuerpo.appendChild(punto('A', '', `Recoger: ${r.recoger_direccion}`));
        cuerpo.appendChild(punto('B', 'via-punto-b', `Entregar: ${r.entrega === 'oficina' ? `oficina · ${r.entrega_direccion || ''}` : r.entrega_direccion || ''}`));

        // Qué se recoge: depósitos (de quién es cada uno) u otra cosa
        const chips = viaElemento('div', 'via-chips');
        if (r.que === 'depositos') {
            const deps = Array.isArray(r.depositos) ? r.depositos : [];
            chips.appendChild(viaElemento('span', 'via-chip', plural(deps.length, 'depósito', 'depósitos')));
            deps.forEach((d, i) => chips.appendChild(viaElemento('span', 'via-chip', `${i + 1}. ${d}`)));
        } else {
            chips.appendChild(viaElemento('span', 'via-chip', r.descripcion || 'Otra cosa'));
        }
        cuerpo.appendChild(chips);
        if (r.notas) cuerpo.appendChild(viaElemento('p', 'via-viaje-nota', `Nota: ${r.notas}`));
        if (r.motivo_cancelacion) cuerpo.appendChild(viaElemento('p', 'via-viaje-nota', `Motivo: ${r.motivo_cancelacion}`));

        if (acciones.length) {
            const caja = viaElemento('div', 'via-viaje-acciones');
            acciones.forEach((a) => {
                if (a.href) {
                    const enlace = viaElemento('a', `boton ${a.clase || 'boton-secundario'} boton-chico`);
                    enlace.href = a.href;
                    enlace.target = '_blank';
                    enlace.rel = 'noopener';
                    enlace.append(viaElemento('i', `bi ${a.icono}`), viaElemento('span', null, a.texto));
                    caja.appendChild(enlace);
                } else {
                    caja.appendChild(viaBoton(a.texto, a.icono, a.clase || 'boton-secundario', { accion: a.accion, id: r.id }));
                }
            });
            cuerpo.appendChild(caja);
        }
        art.append(hora, cuerpo);
        return art;
    }

    function accionesDe(r) {
        const acciones = [];
        const cambiarYCancelar = () => {
            acciones.push({ texto: 'Cambiar hora', icono: 'bi-clock', accion: 'cambiar' });
            acciones.push({ texto: 'Cancelar', icono: 'bi-x-circle', accion: 'cancelar', clase: 'boton-secundario via-boton-peligro' });
        };
        if (cliente) {
            if (clientePuedeCambiar(r)) cambiarYCancelar();
            return acciones;
        }
        const ir = (lado, texto) => {
            const lat = Number(r[`${lado}_lat`]);
            const lng = Number(r[`${lado}_lng`]);
            if (!r[`${lado}_lat`] || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
            acciones.push({ texto, icono: 'bi-sign-turn-right', href: enlacesNavegacion(null, { lat, lng }).google });
        };
        if (atiende) {
            if (r.estado === 'confirmada') acciones.push({ texto: 'Voy en camino', icono: 'bi-car-front', accion: 'en_camino', clase: 'boton-principal' });
            if (['confirmada', 'en_camino'].includes(r.estado)) {
                acciones.push({ texto: 'Recogida', icono: 'bi-box-arrow-in-down', accion: 'recogida', clase: r.estado === 'en_camino' ? 'boton-principal' : 'boton-secundario' });
                ir('recoger', 'Ir a recoger');
                acciones.push({ texto: 'No estaba', icono: 'bi-person-x', accion: 'no_estaba' });
            }
            if (r.estado === 'recogida') {
                acciones.push({ texto: 'Entregada', icono: 'bi-flag', accion: 'entregada', clase: 'boton-principal' });
                ir('entrega', 'Ir a entregar');
            }
        }
        if (['confirmada', 'en_camino'].includes(r.estado)) cambiarYCancelar();
        return acciones;
    }

    // ==================================================
    // AGENDA / LISTA
    // ==================================================

    async function cargarLista() {
        let q = db.from('recolecciones').select('*');
        if (cliente) {
            q = q.eq('cliente_id', clienteActual() || 0).order('inicio', { ascending: false }).limit(60);
        } else {
            const [ini, fin] = viaRangoDia($('#recFecha').value);
            q = q.gte('inicio', ini).lt('inicio', fin).order('inicio');
        }
        const { data, error } = await q;
        if (!activa) return;
        if (error) {
            faltaSql = sinSql(error);
            $('#recFaltaSql').hidden = !faltaSql;
            if (!faltaSql) mostrarError(error, 'cargar las recolecciones');
            $('#recLista').replaceChildren(viaElemento('p', 'via-vacio', 'Sin datos.'));
            return;
        }
        lista = data;
        dibujarLista();
    }

    function dibujarLista() {
        const caja = $('#recLista');
        if (cliente) {
            const limite = Date.now() - 6 * 3600000;
            const proximas = lista.filter((r) => REC_ACTIVAS.includes(r.estado) && new Date(r.inicio).getTime() >= limite)
                .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
            const anteriores = lista.filter((r) => !proximas.includes(r));
            caja.replaceChildren(...(proximas.length
                ? proximas.map((r) => tarjeta(r, accionesDe(r)))
                : [viaElemento('p', 'via-vacio', 'No tienes recolecciones próximas. Usa "Solicitar recolección".')]));
            $('#recHistorialCaja').hidden = !anteriores.length;
            $('#recHistorial').replaceChildren(...anteriores.slice(0, 30).map((r) => tarjeta(r)));
            marcarPedida();
            return;
        }

        const estado = $('#recFiltroEstado').value;
        const texto = $('#recBuscar').value.trim();
        const visibles = lista.filter((r) => (!estado || r.estado === estado)
            && coincideBusqueda([r.codigo, r.cliente_nombre, r.cliente_telefono, r.recoger_direccion, r.entrega_direccion,
                ...(Array.isArray(r.depositos) ? r.depositos : [])], texto));

        const validas = lista.filter((r) => !['cancelada', 'no_estaba'].includes(r.estado));
        const cuadro = (numero, textoCuadro, color) => {
            const el = viaElemento('div', `resumen-item ${color} via-kpi`);
            el.append(viaElemento('span', 'resumen-texto', textoCuadro), viaElemento('span', 'resumen-numero', String(numero)));
            return el;
        };
        $('#recResumen').hidden = false;
        $('#recResumen').replaceChildren(
            cuadro(validas.length, 'Del día', 'resumen-azul'),
            cuadro(validas.filter((r) => ['confirmada', 'en_camino'].includes(r.estado)).length, 'Por recoger', 'resumen-naranja'),
            cuadro(validas.filter((r) => r.estado === 'recogida').length, 'Por entregar', 'resumen-morada'),
            cuadro(validas.filter((r) => r.estado === 'entregada').length, 'Entregadas', 'resumen-verde'),
        );

        const fecha = $('#recFecha').value;
        $('#recListaTitulo').textContent = `Recolecciones del ${new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })}`;
        caja.replaceChildren(...(visibles.length
            ? visibles.map((r) => tarjeta(r, accionesDe(r)))
            : [viaElemento('p', 'via-vacio', lista.length ? 'Ninguna coincide con los filtros.' : 'No hay recolecciones este día.')]));
        marcarPedida();
    }

    // #recolecciones?id=15 (desde una notificación): resalta esa
    let pedidaMarcada = false;
    function marcarPedida() {
        const id = Number(parametrosSeccion().get('id'));
        if (!id || pedidaMarcada) return;
        const t = zona.querySelector(`.via-viaje[data-id="${id}"]`);
        if (!t) return;
        pedidaMarcada = true;
        t.classList.add('via-resaltado');
        t.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    // Botones de las tarjetas (un solo escuchador para la agenda y el historial)
    $('#recVistaAgenda').addEventListener('click', async (evento) => {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton) return;
        const r = lista.find((x) => x.id === Number(boton.dataset.id));
        if (!r) return;
        const accion = boton.dataset.accion;
        if (accion === 'cambiar') { abrirCambiar(r); return; }
        if (accion === 'cancelar') { abrirCancelar(r); return; }
        const preguntas = {
            entregada: `¿Marcar ${r.codigo} como entregada?`,
            no_estaba: `¿Marcar que ${r.cliente_nombre} no estaba (${r.codigo})?`,
        };
        if (preguntas[accion] && !confirm(preguntas[accion])) return;
        boton.disabled = true;
        const { error } = await db.rpc('recolecciones_avanzar', { p_id: r.id, p_usuario: sesion.id || 0, p_estado: accion });
        if (!activa) return;
        boton.disabled = false;
        if (error) { mostrarError(error, 'cambiar el estado'); return; }
        aviso.mostrar(`${r.codigo}: ${(REC_ESTADOS[accion] || [accion])[0]}.`);
        cargarLista();
    });

    // ---------- Día de la agenda y filtros ----------
    function moverDia(dias) {
        const actual = new Date(`${$('#recFecha').value || viaFechaISO()}T12:00:00`);
        $('#recFecha').value = viaFechaISO(actual, dias);
        cargarLista();
    }
    $('#recFiltros').querySelectorAll('[data-dia]').forEach((b) => b.addEventListener('click', () => moverDia(Number(b.dataset.dia))));
    $('#recHoy').addEventListener('click', () => { $('#recFecha').value = viaFechaISO(); cargarLista(); });
    $('#recFecha').addEventListener('change', cargarLista);
    $('#recFiltroEstado').addEventListener('change', dibujarLista);
    $('#recBuscar').addEventListener('input', dibujarLista);

    // ==================================================
    // CLIENTE: LO QUE LLEVA PENDIENTE DE PAGO
    // ==================================================

    async function pintarSemanaCliente() {
        const caja = $('#recSemanaCliente');
        // Los días marcados de esta semana (la base arma los que falten)
        const lunes = lunesDe(viaFechaISO());
        await db.rpc('recoleccion_generar_cargos', { p_empresa: empresaActivaId(), p_desde: lunes, p_hasta: viaFechaISO(new Date(`${lunes}T12:00:00`), 6) });
        const { data, error } = await db.from('recoleccion_cargos').select('fecha, monto, cobrado_en')
            .eq('cliente_id', clienteActual() || 0).is('cobrado_en', null).order('fecha');
        if (!activa) return;
        caja.hidden = !!error || !data.length;
        if (error || !data.length) return;
        const total = data.reduce((s, c) => s + Number(c.monto || 0), 0);
        caja.replaceChildren(
            viaElemento('h3', 'via-tarjeta-titulo', 'Pendiente de pago'),
            viaElemento('p', 'via-confirmar-total', `${plural(data.length, 'día', 'días')} de servicio · ${viaDinero(total)}`),
            viaElemento('p', 'via-nota-chica', 'Se cobra al final de la semana.'));
    }

    // ==================================================
    // SOLICITAR
    // ==================================================

    const entradaA = $('#recRecoger');
    const entradaB = $('#recEntregar');
    const tipoQue = () => (zona.querySelector('input[name="recQue"]:checked') || {}).value || 'depositos';
    const tipoEntrega = () => (zona.querySelector('input[name="recEntrega"]:checked') || {}).value || 'oficina';

    // ---------- 1 · Depósitos: un campo por cada uno ----------
    function pintarDepositos() {
        const n = Math.min(50, Math.max(1, Math.round(Number($('#recCantidad').value) || 1)));
        const caja = $('#recDepositos');
        const antes = [...caja.querySelectorAll('input')].map((i) => i.value);
        caja.replaceChildren(...Array.from({ length: n }, (_, i) => {
            const campo = viaElemento('div', 'campo');
            const id = `recDeposito${i}`;
            const label = viaElemento('label', 'campo-etiqueta', `Depósito ${i + 1}: ¿de quién es? *`);
            label.htmlFor = id;
            const input = viaElemento('input', 'campo-input');
            input.id = id;
            input.type = 'text';
            input.maxLength = 80;
            input.placeholder = 'Nombre o empresa dueña del depósito';
            input.value = antes[i] || '';
            campo.append(label, input);
            return campo;
        }));
        pintarConfirmar();
    }
    const depositos = () => [...$('#recDepositos').querySelectorAll('input')].map((i) => i.value.trim().replace(/\s+/g, ' '));

    function mostrarTipo() {
        zona.querySelectorAll('[data-si="depositos"]').forEach((el) => { el.hidden = tipoQue() !== 'depositos'; });
        zona.querySelectorAll('[data-si="otro"]').forEach((el) => { el.hidden = tipoQue() !== 'otro'; });
        pintarConfirmar();
    }
    zona.querySelectorAll('input[name="recQue"]').forEach((r) => r.addEventListener('change', mostrarTipo));
    $('#recCantidad').addEventListener('input', pintarDepositos);
    $('#recDepositos').addEventListener('input', pintarConfirmar);
    $('#recDescripcion').addEventListener('input', pintarConfirmar);

    // ---------- 0 · Cliente (personal) ----------
    let esperaCliente = null;
    $('#recCliBuscar').addEventListener('input', () => {
        clearTimeout(esperaCliente);
        esperaCliente = setTimeout(buscarClientes, 300);
    });

    async function buscarClientes() {
        const palabras = palabrasDeBusqueda($('#recCliBuscar').value);
        const caja = $('#recCliResultados');
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

    async function cargarCliente(id) {
        const { data, error } = await db.from('clientes')
            .select('id, nombre, apellido1, apellido2, telefono, direccion, ubicacion')
            .eq('id', id).maybeSingle();
        if (error) { mostrarError(error, 'cargar los datos del cliente'); return null; }
        return data;
    }

    $('#recCliResultados').addEventListener('click', async (e) => {
        const b = e.target.closest('button[data-id]');
        if (!b) return;
        $('#recCliResultados').hidden = true;
        clienteSel = await cargarCliente(Number(b.dataset.id));
        const caja = $('#recCliElegido');
        caja.hidden = !clienteSel;
        if (clienteSel) {
            caja.replaceChildren(viaElemento('i', 'bi bi-person-check'), ' ', viaElemento('strong', null, nombreCliente(clienteSel)),
                ` · ${clienteSel.telefono || ''} `, viaBoton('Cambiar', 'bi-arrow-repeat', 'boton-secundario', { cambiarCliente: '1' }));
            $('#recCliBuscar').value = '';
            $('#recCliBuscar').closest('.buscador').hidden = true;
        }
        pintarLugares();
        pintarConfirmar();
    });

    $('#recCliElegido').addEventListener('click', (e) => {
        if (!e.target.closest('button[data-cambiar-cliente]')) return;
        clienteSel = null;
        $('#recCliElegido').hidden = true;
        $('#recCliBuscar').closest('.buscador').hidden = false;
        $('#recCliBuscar').focus();
        pintarLugares();
        pintarConfirmar();
    });

    // ---------- 2 · Dónde: mapa A (recoger) -> B (entregar) ----------
    function crearMapa() {
        if (mapa) return;
        mapa = crearMapaRuta($('#recMapa'), {
            etiquetaA: 'Recoger', etiquetaB: 'Entregar',
            textoA: () => entradaA.value, textoB: () => entradaB.value,
            entradaA, entradaB,
            alCambiar: async () => {
                await completarDireccion();
                pintarConfirmar();
            },
        });
    }

    // Si se marcó A con un clic (sin escribir), se busca el nombre del lugar
    async function completarDireccion() {
        if (!mapa) return;
        const { a, b } = mapa.puntos();
        for (const [p, entrada] of [[a, entradaA], [tipoEntrega() === 'otro' ? b : null, entradaB]]) {
            if (p && !entrada.value.trim()) {
                const texto = await direccionDePunto(p);
                if (texto && !entrada.value.trim()) entrada.value = texto.split(',').slice(0, 3).map((s) => s.trim()).join(', ');
            }
        }
    }

    // Ubicación de la ficha del cliente para el punto A
    function pintarLugares() {
        const caja = $('#recLugares');
        caja.replaceChildren();
        if (!clienteSel) return;
        const punto = puntoDeTexto(clienteSel.ubicacion); // js/mapa.js
        const b = viaBoton('Ubicación del cliente', 'bi-geo-alt', 'boton-secundario', { usar: '1' });
        b.disabled = !punto;
        b.title = punto ? clienteSel.direccion || '' : 'Sin ubicación (se guarda en Clientes -> Modificar)';
        caja.appendChild(b);
    }

    $('#recLugares').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-usar]');
        if (!b || !clienteSel || !mapa) return;
        const punto = puntoDeTexto(clienteSel.ubicacion);
        if (!punto) return;
        entradaA.value = clienteSel.direccion || 'Ubicación del cliente';
        mapa.ponerA(punto);
    });

    // Entregar en la oficina (la de la empresa) u otro lugar
    async function aplicarEntrega() {
        const enOficina = tipoEntrega() === 'oficina';
        entradaB.readOnly = enOficina;
        const ayuda = $('#recOficinaAyuda');
        if (enOficina) {
            entradaB.value = oficina ? oficina.direccion : 'Oficina';
            ayuda.textContent = oficina && oficina.punto ? 'La oficina de la empresa.'
                : 'La oficina de la empresa (sin ubicación en el mapa: se pone en Tiendas -> Empresas).';
            if (mapa) {
                if (oficina && oficina.punto) await mapa.ponerB(oficina.punto);
                else if (mapa.puntos().b) await mapa.ponerB(null);
            }
        } else {
            if (entradaB.value === (oficina ? oficina.direccion : 'Oficina')) entradaB.value = '';
            ayuda.textContent = 'Escribe la dirección o marca el punto B en el mapa (ej. un banco).';
            if (mapa && mapa.puntos().b && oficina && oficina.punto) await mapa.ponerB(null);
            entradaB.focus();
        }
        pintarConfirmar();
    }
    zona.querySelectorAll('input[name="recEntrega"]').forEach((r) => r.addEventListener('change', aplicarEntrega));

    // ---------- 3 · Día y hora (mismo selector que Viajes, sin precio) ----------
    function crearSelectorHoras(cajaDias, cajaHoras, alElegir) {
        let fecha = null;
        let excluir = null;
        let turno = 0;

        function pintarDias() {
            const dias = Math.max(0, Number(config.anticipacion_dias || 0));
            const servicio = (config.dias || []).map(Number);
            const fechas = Array.from({ length: dias + 1 }, (_, i) => viaFechaISO(new Date(), i))
                .filter((f) => servicio.includes(((new Date(`${f}T12:00:00`).getDay() + 6) % 7) + 1));
            if (!fechas.includes(fecha)) fecha = fechas[0] || null;
            cajaDias.replaceChildren(...fechas.map((f) => {
                const d = new Date(`${f}T12:00:00`);
                const b = viaElemento('button', 'via-dia-boton');
                b.type = 'button';
                b.dataset.fecha = f;
                const hoy = viaFechaISO();
                b.append(viaElemento('strong', null, f === hoy ? 'Hoy' : f === viaFechaISO(new Date(), 1) ? 'Mañana' : d.toLocaleDateString('es-CR', { weekday: 'short' })),
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

        async function cargar(nuevoExcluir) {
            if (nuevoExcluir !== undefined) excluir = nuevoExcluir;
            alElegir(null);
            if (!fecha) {
                cajaHoras.replaceChildren(viaElemento('p', 'via-vacio', 'No hay días de servicio para elegir.'));
                return;
            }
            const mio = ++turno;
            cajaHoras.replaceChildren(viaElemento('p', 'via-vacio', 'Buscando horas libres...'));
            const { data, error } = await db.rpc('recolecciones_horas', {
                p_empresa: empresaActivaId(), p_fecha: fecha, p_excluir: excluir, p_detalle: atiende,
            });
            if (mio !== turno || !activa) return;
            if (error) {
                cajaHoras.replaceChildren(viaElemento('p', 'via-vacio', textoError(error, 'buscar las horas')));
                return;
            }
            if (data.length === 1 && !data[0].inicio) {
                cajaHoras.replaceChildren(viaElemento('p', 'via-vacio', data[0].motivo || 'Ese día no se puede.'));
                return;
            }
            if (!data.length) {
                cajaHoras.replaceChildren(viaElemento('p', 'via-vacio', 'Ya pasaron las horas de este día. Elige otro día.'));
                return;
            }
            const libres = data.filter((h) => h.disponible).length;
            const fila = viaElemento('div', 'via-horas-fila');
            data.forEach((h) => {
                const b = viaElemento('button', `via-hora${h.disponible ? '' : ' via-hora-ocupada'}`);
                b.type = 'button';
                b.disabled = !h.disponible;
                b.title = h.disponible ? h.hora : h.motivo || 'Ocupado';
                b.append(viaElemento('strong', null, h.hora), viaElemento('small', null, h.disponible ? 'Libre' : h.motivo || 'Ocupado'));
                b.addEventListener('click', () => {
                    cajaHoras.querySelectorAll('.via-hora.activo').forEach((x) => x.classList.remove('activo'));
                    b.classList.add('activo');
                    alElegir(h);
                });
                fila.appendChild(b);
            });
            cajaHoras.replaceChildren(
                viaElemento('p', 'via-nota-chica', libres ? `${plural(libres, 'hora libre', 'horas libres')} · las grises ya están ocupadas.` : 'Todas las horas de este día están ocupadas: elige otro día.'),
                fila);
        }

        return { pintarDias, cargar };
    }

    const selectorForm = crearSelectorHoras($('#recDias'), $('#recHoras'), (h) => { horaElegida = h; pintarConfirmar(); });

    // ---------- 4 · Confirmar ----------
    // Lo que falta para poder solicitar ('' = nada)
    function faltante() {
        const puntos = mapa ? mapa.puntos() : {};
        if (!cliente && !clienteSel) return 'Elige el cliente (paso 0).';
        if (tipoQue() === 'depositos' && depositos().some((d) => !d)) return 'Escribe de quién es cada depósito (paso 1).';
        if (tipoQue() === 'otro' && !$('#recDescripcion').value.trim()) return 'Escribe qué hay que recoger (paso 1).';
        if (!puntos.a) return 'Ubica en el mapa dónde se recoge (paso 2).';
        if (tipoEntrega() === 'otro' && !puntos.b) return 'Ubica en el mapa dónde se entrega (paso 2).';
        if (!horaElegida) return 'Elige el día y una hora libre (paso 3).';
        return '';
    }

    function pintarConfirmar() {
        const caja = $('#recConfirmar');
        caja.replaceChildren();
        const fila = (titulo, texto) => {
            const p = viaElemento('p', 'via-confirmar-fila');
            p.append(viaElemento('span', null, titulo), viaElemento('strong', null, texto));
            caja.appendChild(p);
        };
        if (!cliente) fila('Cliente', clienteSel ? nombreCliente(clienteSel) : 'Falta elegirlo (paso 0)');
        const deps = depositos();
        fila('Recoger', tipoQue() === 'depositos'
            ? `${plural(deps.length, 'depósito', 'depósitos')}${deps.filter(Boolean).length ? `: ${deps.filter(Boolean).join(', ')}` : ''}`
            : $('#recDescripcion').value.trim() || 'Falta escribir qué');
        fila('En', entradaA.value.trim() || 'Falta ubicar A (paso 2)');
        fila('Entregar en', tipoEntrega() === 'oficina' ? `La oficina${oficina ? ` · ${oficina.direccion}` : ''}` : entradaB.value.trim() || 'Falta ubicar B (paso 2)');
        fila('Día y hora', horaElegida ? `${fechaLarga(horaElegida.inicio)} · ${horaElegida.hora}` : 'Falta elegir (paso 3)');
        if (cliente) caja.appendChild(viaElemento('p', 'via-nota-chica', `Puedes cambiar la hora o cancelar hasta ${config.cancelar_horas} horas antes, si el espacio nuevo está libre.`));
        $('#recSolicitar').disabled = !!faltante();
    }

    // ---------- Abrir / cerrar ----------
    async function abrirFormulario() {
        if (!puedeSolicitar) return;
        enFormulario = true;
        $('#recForm').reset();
        $('#recFormError').textContent = '';
        $('#recCantidad').value = '1';
        $('#recDepositos').replaceChildren();
        horaElegida = null;
        $('#recVistaAgenda').hidden = true;
        $('#recPestanas').hidden = true;
        $('#recNuevo').hidden = true;
        $('#recForm').hidden = false;
        $('#recPasoCliente').hidden = cliente;
        if (!cliente) {
            clienteSel = null;
            $('#recCliElegido').hidden = true;
            $('#recCliBuscar').closest('.buscador').hidden = false;
        } else {
            clienteSel = await cargarCliente(clienteActual() || 0);
        }
        pintarDepositos();
        mostrarTipo();
        crearMapa();
        if (mapa) await mapa.limpiar();
        await aplicarEntrega();
        pintarLugares();
        selectorForm.pintarDias();
        selectorForm.cargar(null);
        pintarConfirmar();
        (cliente ? $('#recDeposito0') : $('#recCliBuscar')).focus();
    }

    function cerrarFormulario() {
        enFormulario = false;
        $('#recForm').hidden = true;
        $('#recVistaAgenda').hidden = vista !== 'agenda';
        $('#recPestanas').hidden = !pestanas;
        $('#recNuevo').hidden = !puedeSolicitar;
        if (parametrosSeccion().get('nuevo')) history.replaceState(null, '', '#recolecciones');
    }

    $('#recNuevo').addEventListener('click', () => { mostrarVista('agenda'); abrirFormulario(); });
    $('#recVolver').addEventListener('click', cerrarFormulario);

    // ---------- Enviar ----------
    $('#recForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const error = $('#recFormError');
        const falta = faltante();
        error.textContent = falta;
        if (falta) return;
        const puntos = mapa.puntos();
        const boton = $('#recSolicitar');
        boton.disabled = true;
        boton.querySelector('span').textContent = 'Reservando...';
        const { data, error: errorBase } = await db.rpc('recolecciones_solicitar', {
            p: {
                usuario_id: sesion.id || 0,
                empresa_id: empresaActivaId(),
                cliente_id: clienteSel ? clienteSel.id : clienteActual(),
                inicio: horaElegida.inicio,
                recoger: { direccion: entradaA.value.trim(), lat: puntos.a.lat, lng: puntos.a.lng },
                que: tipoQue(),
                depositos: tipoQue() === 'depositos' ? depositos() : [],
                descripcion: $('#recDescripcion').value.trim(),
                entrega: tipoEntrega(),
                entrega_lugar: tipoEntrega() === 'otro' && puntos.b
                    ? { direccion: entradaB.value.trim(), lat: puntos.b.lat, lng: puntos.b.lng } : null,
                notas: $('#recNotas').value.trim(),
            },
        });
        if (!activa) return;
        boton.querySelector('span').textContent = 'Solicitar recolección';
        if (errorBase) {
            console.error('Error al solicitar la recolección:', errorBase);
            error.textContent = textoError(errorBase, 'reservar la recolección');
            boton.disabled = false;
            if (errorBase.hint === 'ocupado') { horaElegida = null; selectorForm.cargar(); pintarConfirmar(); }
            return;
        }
        cerrarFormulario();
        aviso.mostrar(`Recolección ${data.codigo} confirmada: ${fechaLarga(data.inicio)} a las ${viaHora(data.inicio)}.`);
        if (!cliente) $('#recFecha').value = viaFechaISO(new Date(data.inicio));
        cargarLista();
    });

    // ==================================================
    // CAMBIAR LA HORA (todo o nada)
    // ==================================================
    let horaNueva = null;
    const selectorCambio = crearSelectorHoras($('#recCambiarDias'), $('#recCambiarHoras'), (h) => {
        horaNueva = h;
        $('#recCambiarSi').disabled = !h;
    });

    function abrirCambiar(r) {
        cambiando = r;
        horaNueva = null;
        $('#recCambiarError').textContent = '';
        $('#recCambiarSi').disabled = true;
        $('#recCambiarTexto').textContent = `${r.codigo} · ahora: ${fechaLarga(r.inicio)} a las ${viaHora(r.inicio)}. `
            + 'Elige la hora nueva: si ya no está libre, la recolección sigue como está.';
        selectorCambio.pintarDias();
        $('#recCambiarDialogo').showModal();
        selectorCambio.cargar(r.id);
    }

    $('#recCambiarNo').addEventListener('click', () => $('#recCambiarDialogo').close());
    $('#recCambiarSi').addEventListener('click', async () => {
        if (!cambiando || !horaNueva) return;
        $('#recCambiarSi').disabled = true;
        const { data, error } = await db.rpc('recolecciones_cambiar_hora', { p_id: cambiando.id, p_usuario: sesion.id || 0, p_inicio: horaNueva.inicio });
        if (!activa) return;
        if (error) {
            $('#recCambiarError').textContent = textoError(error, 'cambiar la hora');
            if (error.hint === 'ocupado') selectorCambio.cargar();
            return;
        }
        $('#recCambiarDialogo').close();
        aviso.mostrar(`${data.codigo}: hora nueva ${fechaLarga(data.inicio)} a las ${viaHora(data.inicio)}.`);
        if (!cliente) $('#recFecha').value = viaFechaISO(new Date(data.inicio));
        cargarLista();
    });

    // ==================================================
    // CANCELAR
    // ==================================================
    function abrirCancelar(r) {
        cancelando = r;
        $('#recCancelarError').textContent = '';
        $('#recCancelarMotivo').value = '';
        $('#recCancelarTexto').textContent = `¿Cancelar ${r.codigo} del ${fechaLarga(r.inicio)} a las ${viaHora(r.inicio)}? El espacio queda libre para otro cliente.`;
        $('#recCancelarDialogo').showModal();
    }

    $('#recCancelarNo').addEventListener('click', () => $('#recCancelarDialogo').close());
    $('#recCancelarSi').addEventListener('click', async () => {
        if (!cancelando) return;
        $('#recCancelarSi').disabled = true;
        const { error } = await db.rpc('recolecciones_cancelar', {
            p_id: cancelando.id, p_usuario: sesion.id || 0, p_motivo: $('#recCancelarMotivo').value.trim() || null,
        });
        if (!activa) return;
        $('#recCancelarSi').disabled = false;
        if (error) { $('#recCancelarError').textContent = textoError(error, 'cancelar la recolección'); return; }
        $('#recCancelarDialogo').close();
        aviso.mostrar(`Recolección ${cancelando.codigo} cancelada.`);
        cargarLista();
    });

    // ==================================================
    // BLOQUEOS Y HORARIO (quien atiende)
    // ==================================================
    let bloqueos = [];

    async function cargarBloqueos() {
        const { data, error } = await db.from('recoleccion_bloqueos').select('*').order('desde');
        if (!activa) return;
        if (error) { mostrarError(error, 'cargar los bloqueos'); return; }
        const hoy = viaFechaISO();
        // Los de un día que ya pasó no se muestran
        bloqueos = data.filter((b) => !b.fecha || b.fecha >= hoy)
            .sort((a, b) => (a.fecha ? 1 : 0) - (b.fecha ? 1 : 0) || String(a.fecha || '').localeCompare(String(b.fecha || '')) || a.desde.localeCompare(b.desde));
        const cuerpo = $('#recBloqueosTabla');
        cuerpo.replaceChildren();
        if (!bloqueos.length) { cuerpo.appendChild(crearFilaVacia('Sin horas bloqueadas. Usa "Bloquear horas" (ej. almuerzo de 12:00 a 13:00).', 4)); return; }
        bloqueos.forEach((b) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(b.fecha ? viaFecha(`${b.fecha}T12:00:00`, true) : `Todas las semanas: ${textoDias(b.dias)}`));
            tr.appendChild(crearCelda(`${hhmm(b.desde)} – ${hhmm(b.hasta)}`));
            tr.appendChild(crearCelda(b.motivo));
            tr.appendChild(crearCeldaAcciones(crearBotonIcono('eliminar', b.id, 'bi-trash3', 'Quitar el bloqueo')));
            cuerpo.appendChild(tr);
        });
    }

    $('#recBloqueosTabla').addEventListener('click', (e) => {
        const boton = e.target.closest('button[data-accion="eliminar"]');
        if (!boton) return;
        const b = bloqueos.find((x) => x.id === Number(boton.dataset.id));
        if (!b || !confirm(`¿Quitar el bloqueo de ${hhmm(b.desde)} a ${hhmm(b.hasta)}${b.motivo ? ` (${b.motivo})` : ''}?`)) return;
        db.from('recoleccion_bloqueos').delete().eq('id', b.id).then(({ error }) => {
            if (error) { mostrarError(error, 'quitar el bloqueo'); return; }
            aviso.mostrar('Bloqueo quitado.');
            cargarBloqueos();
        });
    });

    const cuandoBloqueo = () => (zona.querySelector('input[name="recBloqueoCuando"]:checked') || {}).value || 'semana';
    function mostrarCuando() {
        zona.querySelectorAll('[data-bloqueo]').forEach((el) => { el.hidden = el.dataset.bloqueo !== cuandoBloqueo(); });
    }
    zona.querySelectorAll('input[name="recBloqueoCuando"]').forEach((r) => r.addEventListener('change', mostrarCuando));

    $('#recBloqueoNuevo').addEventListener('click', () => {
        $('#recBloqueoForm').reset();
        $('#recBloqueoError').textContent = '';
        pintarCasillasDias($('#recBloqueoDias'), (config.dias || []).map(Number));
        $('#recBloqueoFecha').value = viaFechaISO();
        $('#recBloqueoDesde').value = '12:00';
        $('#recBloqueoHasta').value = '13:00';
        mostrarCuando();
        $('#recBloqueoDialogo').showModal();
    });
    $('#recBloqueoCancelar').addEventListener('click', () => $('#recBloqueoDialogo').close());

    $('#recBloqueoForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const error = $('#recBloqueoError');
        const semana = cuandoBloqueo() === 'semana';
        const dias = diasMarcados($('#recBloqueoDias'));
        const fecha = $('#recBloqueoFecha').value;
        const desde = $('#recBloqueoDesde').value;
        const hasta = $('#recBloqueoHasta').value;
        if (semana && !dias.length) { error.textContent = 'Marca al menos un día.'; return; }
        if (!semana && !fecha) { error.textContent = 'Elige la fecha.'; return; }
        if (!desde || !hasta || hasta <= desde) { error.textContent = '"Hasta" debe ser después de "Desde".'; return; }
        const { error: err } = await db.from('recoleccion_bloqueos').insert({
            fecha: semana ? null : fecha, dias: semana ? dias : null, desde, hasta,
            motivo: $('#recBloqueoMotivo').value.trim() || null, creado_por: sesion.id || null,
        });
        if (err) { error.textContent = textoError(err, 'bloquear las horas'); return; }
        $('#recBloqueoDialogo').close();
        aviso.mostrar(`Horas bloqueadas: ${desde} a ${hasta}.`);
        cargarBloqueos();
    });

    // ---------- Horario de servicio (recoleccion_config) ----------
    function pintarHorario() {
        pintarCasillasDias($('#recHorarioDias'), (config.dias || []).map(Number));
        $('#recHoraInicio').value = hhmm(config.hora_inicio);
        $('#recHoraFin').value = hhmm(config.hora_fin);
        $('#recEspacio').value = config.espacio_min;
        $('#recAnticipacion').value = config.anticipacion_min;
        $('#recDiasAdelante').value = config.anticipacion_dias;
        $('#recCancelarHoras').value = Number(config.cancelar_horas);
    }

    async function guardarConfig(datos, mensaje) {
        const { error } = await db.from('recoleccion_config').upsert({ ...datos, actualizado_en: new Date().toISOString() }, { onConflict: 'empresa_id' });
        if (error) { mostrarError(error, 'guardar el horario'); return false; }
        Object.assign(config, datos);
        aviso.mostrar(mensaje);
        return true;
    }

    $('#recHorarioForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const numero = (s) => Number($(s).value);
        const datos = {
            dias: diasMarcados($('#recHorarioDias')), hora_inicio: $('#recHoraInicio').value, hora_fin: $('#recHoraFin').value,
            espacio_min: Math.round(numero('#recEspacio')), anticipacion_min: Math.round(numero('#recAnticipacion')),
            anticipacion_dias: Math.round(numero('#recDiasAdelante')), cancelar_horas: numero('#recCancelarHoras'),
        };
        const falla = !datos.dias.length ? 'Marca al menos un día de servicio.'
            : !datos.hora_inicio || !datos.hora_fin || datos.hora_fin <= datos.hora_inicio ? '"Hasta" debe ser después de "Desde".'
                : !(datos.espacio_min >= 5 && datos.espacio_min <= 240) ? 'Cada espacio: de 5 a 240 minutos.'
                    : !(datos.anticipacion_min >= 0) || !(datos.anticipacion_dias >= 0 && datos.anticipacion_dias <= 90) || !(datos.cancelar_horas >= 0)
                        ? 'Revisa los números (0 o más; hasta 90 días adelante).' : '';
        if (falla) { aviso.mostrar(falla, 'error'); return; }
        await guardarConfig(datos, 'Horario de servicio guardado.');
    });

    // ==================================================
    // COBROS (tarifa diaria por cliente, como las rutas, y cobro de la semana)
    // Cada día marcado en la tarifa se cobra su monto, haya o no recolecciones.
    // ==================================================
    let semana = lunesDe(viaFechaISO());
    let cargos = [];
    let tarifas = [];
    let clienteDias = null; // cliente_id de la ventana de días

    const nombreDeCargo = (c) => (c.clientes ? nombreCliente(c.clientes) : 'Cliente eliminado');

    async function cargarCobros() {
        const domingo = viaFechaISO(new Date(`${semana}T12:00:00`), 6);
        const fin = new Date(`${domingo}T12:00:00`);
        $('#recSemanaTexto').textContent = `${new Date(`${semana}T12:00:00`).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })} – ${fin.toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        // La base arma los días marcados que falten en la semana (los cobrados o corregidos no se tocan)
        const gen = await db.rpc('recoleccion_generar_cargos', { p_empresa: empresaActivaId(), p_desde: semana, p_hasta: domingo });
        if (gen.error) mostrarError(gen.error, 'armar los cobros de la semana');
        const [ca, ta] = await Promise.all([
            db.from('recoleccion_cargos').select('id, cliente_id, fecha, monto, cobrado_en, clientes(nombre, apellido1, apellido2)')
                .gte('fecha', semana).lte('fecha', domingo).order('fecha'),
            db.from('recoleccion_tarifas').select('cliente_id, monto_dia, dias, desde, clientes(nombre, apellido1, apellido2)'),
        ]);
        if (!activa) return;
        if (ca.error || ta.error) { mostrarError(ca.error || ta.error, 'cargar los cobros'); return; }
        cargos = ca.data;
        tarifas = ta.data.sort((a, b) => nombreDeCargo(a).localeCompare(nombreDeCargo(b), 'es'));
        dibujarCobros();
        dibujarTarifas();
    }

    function dibujarCobros() {
        const porCliente = new Map();
        cargos.forEach((c) => {
            if (!porCliente.has(c.cliente_id)) porCliente.set(c.cliente_id, { nombre: nombreDeCargo(c), dias: 0, pendiente: 0, cobrado: 0 });
            const g = porCliente.get(c.cliente_id);
            g.dias++;
            if (c.cobrado_en) g.cobrado += Number(c.monto || 0); else g.pendiente += Number(c.monto || 0);
        });
        const grupos = [...porCliente.entries()].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, 'es'));
        const pendiente = grupos.reduce((s, [, g]) => s + g.pendiente, 0);
        const cobrado = grupos.reduce((s, [, g]) => s + g.cobrado, 0);
        const cuadro = (valor, texto, color) => {
            const el = viaElemento('div', `resumen-item ${color} via-kpi`);
            el.append(viaElemento('span', 'resumen-texto', texto), viaElemento('span', 'resumen-numero', valor));
            return el;
        };
        $('#recCobrosResumen').replaceChildren(
            cuadro(viaDinero(pendiente), 'Por cobrar', 'resumen-naranja'),
            cuadro(viaDinero(cobrado), 'Cobrado', 'resumen-verde'),
            cuadro(String(grupos.length), 'Clientes', 'resumen-azul'));

        const cuerpo = $('#recCobrosTabla');
        cuerpo.replaceChildren();
        if (!grupos.length) { cuerpo.appendChild(crearFilaVacia('Esta semana no hay días por cobrar: ponle su tarifa a cada cliente (abajo).', 5)); return; }
        grupos.forEach(([id, g]) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(g.nombre));
            tr.appendChild(crearCelda(plural(g.dias, 'día', 'días')));
            tr.appendChild(crearCelda(viaDinero(g.pendiente), 'via-num'));
            tr.appendChild(crearCelda(viaDinero(g.cobrado), 'via-num'));
            const botones = [crearBotonIcono('editar', id, 'bi-pencil', `Ver y corregir los días de ${g.nombre}`)];
            if (g.pendiente > 0) {
                const b = viaBoton('Cobrado', 'bi-check2-circle', 'boton-principal', { cobrar: id });
                b.title = `Marcar como cobrado ${viaDinero(g.pendiente)}`;
                botones.push(b);
            }
            tr.appendChild(crearCeldaAcciones(...botones));
            cuerpo.appendChild(tr);
        });
    }

    $('#recCobrosTabla').addEventListener('click', async (e) => {
        const cobrar = e.target.closest('button[data-cobrar]');
        const editar = e.target.closest('button[data-accion="editar"]');
        if (cobrar) {
            const id = Number(cobrar.dataset.cobrar);
            const pendientes = cargos.filter((c) => c.cliente_id === id && !c.cobrado_en);
            const total = pendientes.reduce((s, c) => s + Number(c.monto || 0), 0);
            if (!pendientes.length || !confirm(`¿Marcar como cobrado ${viaDinero(total)} (${plural(pendientes.length, 'día', 'días')}) de ${nombreDeCargo(pendientes[0])}?`)) return;
            cobrar.disabled = true;
            const { error } = await db.from('recoleccion_cargos').update({ cobrado_en: new Date().toISOString(), cobrado_por: sesion.id || null })
                .in('id', pendientes.map((c) => c.id));
            if (error) { cobrar.disabled = false; mostrarError(error, 'marcar como cobrado'); return; }
            aviso.mostrar(`Cobrado: ${viaDinero(total)}.`);
            cargarCobros();
        }
        if (editar) abrirDias(Number(editar.dataset.id));
    });

    // Días de un cliente en la semana: corregir el monto de los que no se han cobrado
    function abrirDias(clienteId) {
        clienteDias = clienteId;
        const suyos = cargos.filter((c) => c.cliente_id === clienteId);
        if (!suyos.length) return;
        $('#recDiasTitulo').textContent = `Días de ${nombreDeCargo(suyos[0])}`;
        $('#recDiasError').textContent = '';
        const cuerpo = $('#recDiasTabla');
        cuerpo.replaceChildren(...suyos.map((c) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(viaFecha(`${c.fecha}T12:00:00`, true)));
            const td = document.createElement('td');
            td.className = 'via-num';
            if (c.cobrado_en) {
                td.textContent = viaDinero(c.monto);
            } else {
                const input = viaElemento('input', 'campo-input rec-monto-dia');
                input.type = 'number';
                input.min = '0';
                input.step = '100';
                input.value = Number(c.monto);
                input.dataset.id = c.id;
                input.setAttribute('aria-label', `Monto del ${c.fecha}`);
                td.appendChild(input);
            }
            tr.appendChild(td);
            tr.appendChild(c.cobrado_en ? crearCeldaEtiqueta('Cobrado', 'etiqueta-verde') : crearCeldaEtiqueta('Por cobrar', 'etiqueta-naranja'));
            return tr;
        }));
        $('#recDiasGuardar').hidden = suyos.every((c) => c.cobrado_en);
        $('#recDiasDialogo').showModal();
    }

    $('#recDiasCerrar').addEventListener('click', () => $('#recDiasDialogo').close());
    $('#recDiasGuardar').addEventListener('click', async () => {
        const cambios = [...$('#recDiasTabla').querySelectorAll('input[data-id]')]
            .map((i) => ({ id: Number(i.dataset.id), monto: Number(i.value) }))
            .filter((x) => { const c = cargos.find((y) => y.id === x.id); return c && Number(c.monto) !== x.monto; });
        if (cambios.some((x) => !(x.monto >= 0))) { $('#recDiasError').textContent = 'Los montos deben ser 0 o más.'; return; }
        for (const x of cambios) {
            const { error } = await db.from('recoleccion_cargos').update({ monto: x.monto }).eq('id', x.id);
            if (error) { $('#recDiasError').textContent = textoError(error, 'guardar los montos'); return; }
        }
        $('#recDiasDialogo').close();
        if (cambios.length) aviso.mostrar(`${plural(cambios.length, 'monto corregido', 'montos corregidos')}.`);
        cargarCobros();
    });

    $('#recVistaCobros').querySelectorAll('[data-semana]').forEach((b) => b.addEventListener('click', () => {
        semana = viaFechaISO(new Date(`${semana}T12:00:00`), Number(b.dataset.semana) * 7);
        cargarCobros();
    }));

    // ---------- Tarifa diaria de cada cliente (días que se trabajan + monto fijo) ----------
    function dibujarTarifas() {
        const cuerpo = $('#recTarifasTabla');
        cuerpo.replaceChildren();
        if (!tarifas.length) {
            cuerpo.appendChild(crearFilaVacia('Sin tarifas. Usa "Poner tarifa": marca los días que se trabajan y el monto por día.', 5));
            return;
        }
        tarifas.forEach((t) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(nombreDeCargo(t)));
            tr.appendChild(crearCelda(textoDias(t.dias)));
            tr.appendChild(crearCelda(t.desde ? viaFecha(`${t.desde}T12:00:00`) : '—'));
            tr.appendChild(crearCelda(viaDinero(t.monto_dia), 'via-num'));
            tr.appendChild(crearCeldaAcciones(
                crearBotonIcono('editar', t.cliente_id, 'bi-pencil', 'Cambiar la tarifa'),
                crearBotonIcono('eliminar', t.cliente_id, 'bi-trash3', 'Quitar la tarifa (deja de cobrarse)')));
            cuerpo.appendChild(tr);
        });
    }

    // Al cambiar o quitar una tarifa: se borran los días POR COBRAR del cliente desde el lunes
    // de esta semana (los cobrados no); al volver a cargar, la base los arma con la tarifa nueva
    const borrarPendientes = (clienteId) => db.from('recoleccion_cargos').delete()
        .eq('cliente_id', clienteId).is('cobrado_en', null).gte('fecha', lunesDe(viaFechaISO()));

    async function abrirTarifa(clienteId = null) {
        $('#recTarifaError').textContent = '';
        const sel = $('#recTarifaCliente');
        const { data, error } = await db.from('clientes').select('id, nombre, apellido1, apellido2').eq('aprobado', true).order('nombre').limit(1000);
        if (error) { mostrarError(error, 'cargar los clientes'); return; }
        sel.replaceChildren(...data.map((c) => new Option(nombreCliente(c), c.id)));
        sel.value = clienteId ? String(clienteId) : '';
        sel.disabled = !!clienteId;
        const actual = tarifas.find((t) => t.cliente_id === clienteId);
        $('#recTarifaMonto').value = actual ? Number(actual.monto_dia) : '';
        pintarCasillasDias($('#recTarifaDias'), actual ? (actual.dias || []).map(Number) : (config.dias || [1, 2, 3, 4, 5]).map(Number));
        $('#recTarifaDesde').value = actual && actual.desde ? actual.desde : viaFechaISO();
        $('#recTarifaDialogo').showModal();
        (clienteId ? $('#recTarifaMonto') : sel).focus();
    }

    $('#recTarifaNueva').addEventListener('click', () => abrirTarifa());
    $('#recTarifaCancelar').addEventListener('click', () => $('#recTarifaDialogo').close());
    $('#recTarifasTabla').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion]');
        if (!b) return;
        const id = Number(b.dataset.id);
        if (b.dataset.accion === 'editar') abrirTarifa(id);
        if (b.dataset.accion === 'eliminar') {
            const t = tarifas.find((x) => x.cliente_id === id);
            if (!t || !confirm(`¿Quitar la tarifa de ${nombreDeCargo(t)}? Deja de cobrarse desde esta semana (lo ya cobrado no cambia).`)) return;
            db.from('recoleccion_tarifas').delete().eq('cliente_id', id).then(async ({ error }) => {
                if (error) { mostrarError(error, 'quitar la tarifa'); return; }
                await borrarPendientes(id);
                aviso.mostrar('Tarifa quitada.');
                cargarCobros();
            });
        }
    });

    $('#recTarifaForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const clienteId = Number($('#recTarifaCliente').value);
        const texto = $('#recTarifaMonto').value.trim();
        const monto = Number(texto);
        const dias = diasMarcados($('#recTarifaDias'));
        const desde = $('#recTarifaDesde').value;
        if (!clienteId) { $('#recTarifaError').textContent = 'Elige el cliente.'; return; }
        if (!dias.length) { $('#recTarifaError').textContent = 'Marca los días que se trabajan.'; return; }
        if (texto === '' || !(monto >= 0)) { $('#recTarifaError').textContent = 'Escribe el monto por día (0 o más).'; return; }
        if (!desde) { $('#recTarifaError').textContent = 'Elige desde qué día se cobra.'; return; }
        const { error } = await db.from('recoleccion_tarifas').upsert({
            cliente_id: clienteId, monto_dia: monto, dias, desde,
            actualizado_por: sesion.id || null, actualizado_en: new Date().toISOString(),
        }, { onConflict: 'cliente_id' });
        if (error) { $('#recTarifaError').textContent = textoError(error, 'guardar la tarifa'); return; }
        await borrarPendientes(clienteId); // se vuelven a armar con la tarifa nueva
        $('#recTarifaDialogo').close();
        aviso.mostrar(`Tarifa guardada: ${viaDinero(monto)} por día · ${textoDias(dias)}.`);
        cargarCobros();
    });

    // ==================================================
    // PESTAÑAS Y ARRANQUE
    // ==================================================
    let vista = 'agenda';
    let pestanas = null;
    const VISTAS = { agenda: '#recVistaAgenda', bloqueos: '#recVistaBloqueos', cobros: '#recVistaCobros' };

    function mostrarVista(v) {
        vista = v;
        Object.entries(VISTAS).forEach(([nombre, sel]) => { $(sel).hidden = nombre !== v; });
        $('#recNuevo').hidden = v !== 'agenda' || !puedeSolicitar;
        if (v === 'bloqueos') { pintarHorario(); cargarBloqueos(); }
        if (v === 'cobros') { pintarHorario(); cargarCobros(); }
    }

    const opciones = [{ valor: 'agenda', texto: 'Agenda', icono: 'bi-calendar-event' }];
    if (atiende) opciones.push({ valor: 'bloqueos', texto: 'Bloqueos y horario', icono: 'bi-slash-circle' });
    if (cobra) opciones.push({ valor: 'cobros', texto: 'Cobros', icono: 'bi-cash-coin' });
    if (opciones.length > 1) {
        pestanas = crearPestanas($('#recPestanas'), opciones, 'agenda', mostrarVista);
        $('#recPestanas').hidden = false;
    }

    $('#recSubtitulo').textContent = cliente ? 'Solicita tus recolecciones y síguelas'
        : atiende ? 'Agenda del día: avisa cuando vas en camino, cuando recoges y al entregar'
            : 'Agenda de recolecciones del día';
    $('#recNuevo').hidden = !puedeSolicitar;
    $('#recFiltros').hidden = cliente;
    Object.entries(REC_ESTADOS).forEach(([valor, [texto]]) => $('#recFiltroEstado').appendChild(new Option(texto, valor)));
    $('#recFecha').value = viaFechaISO();

    // Abre la de #recolecciones?id=N en su día (personal)
    async function irALaPedida() {
        const id = Number(parametrosSeccion().get('id'));
        if (!id || cliente) return;
        const { data } = await db.from('recolecciones').select('inicio').eq('id', id).maybeSingle();
        if (data) $('#recFecha').value = viaFechaISO(new Date(data.inicio));
    }

    // Oficina de la empresa: dirección y punto (Tiendas -> Empresas, sql/01 bloque 41)
    async function cargarOficina() {
        const { data } = await db.from('empresas').select('*').eq('id', empresaActivaId() || 0).maybeSingle();
        if (!data) return;
        oficina = {
            direccion: (data.direccion || '').trim() || `Oficina de ${data.nombre}`,
            punto: typeof puntoDeTexto === 'function' ? puntoDeTexto(data.ubicacion || '') : null,
        };
    }

    (async () => {
        const [cfg] = await Promise.all([db.from('recoleccion_config').select('*').maybeSingle(), cargarOficina()]);
        if (!activa) return;
        if (cfg.error && sinSql(cfg.error)) {
            faltaSql = true;
            $('#recFaltaSql').hidden = false;
        }
        config = { ...REC_CONFIG_BASE, ...(cfg.data || {}) };
        if (cliente) {
            if (!clienteActual()) aviso.mostrar('Tu usuario no está ligado a un cliente. Consulta con la empresa.', 'error');
            pintarSemanaCliente();
        } else {
            await irALaPedida();
        }
        await cargarLista();
        if (parametrosSeccion().get('nuevo') === '1' && puedeSolicitar && !faltaSql) abrirFormulario();
    })();

    // Cada minuto se actualiza la agenda (quien atiende cambia los estados desde otro equipo)
    const reloj = setInterval(() => { if (!enFormulario && vista === 'agenda') cargarLista(); }, 60000);

    return () => {
        activa = false;
        clearInterval(reloj);
        clearTimeout(esperaCliente);
        aviso.limpiar();
        if (mapa) mapa.destruir();
        ['#recCambiarDialogo', '#recCancelarDialogo', '#recBloqueoDialogo', '#recTarifaDialogo', '#recDiasDialogo']
            .forEach((s) => { const d = $(s); if (d && d.open) d.close(); });
    };
});
