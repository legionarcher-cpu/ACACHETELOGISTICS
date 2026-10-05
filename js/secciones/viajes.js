/* ==================================================
   SECCIÓN: VIAJES (Transporte) - LÓGICA
   ACACHETE LOGISTICS

   Diseño: docs/14-transporte.md · Guía: docs/secciones/viajes.md
   Base: sql/01 bloque 19. Piezas comunes (estados, tarjeta, cortesía): js/viajes-comun.js

   QUIÉN VE QUÉ:
     Cliente (rol cliente)   -> SUS viajes: próximos y anteriores; cambia la hora o cancela
                                hasta "cancelar_horas" antes; su cortesía; Casa y Trabajo.
     Conductor (rol piloto)  -> sus viajes del día: "Voy en camino" -> "A bordo" ->
                                "Terminar" (o "No se presentó") y enlaces para navegar.
     Personal (Administrador, G1, G2, G3, Empleado) -> agenda del día de la empresa:
                                filtros, resumen, cambiar la hora, cancelar y avanzar.
                                Solicita viajes eligiendo al cliente (paso 0).

   SOLICITUD (4 pasos, primero la ruta y después la hora):
     1. Personas (obligatorio), mascotas Sí/No (obligatorio, sin respuesta marcada) y mercadería.
     2. Ruta A -> B con el mapa (js/mapa.js: km y minutos por calle). Botones Casa y Trabajo
        para llenar un punto; "Guardar como Casa/Trabajo" guarda el punto en el cliente.
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
    const puedeSolicitar = cliente || personal;

    // ---------- Estado ----------
    let config = { ...VIA_CONFIG_BASE };
    let viajes = [];            // los de la lista (día elegido, o los del cliente)
    let vehiculos = [];
    let estadoCliente = null;   // cortesía del cliente del viaje (viajes_estado_cliente)
    let clienteViaje = null;    // { id, nombre, apellidos, telefono, casa_*, trabajo_* } del viaje que se solicita
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

    const nombreCliente = (c) => [c.nombre, c.apellidos].filter(Boolean).join(' ');
    const mismoDia = (t, fecha) => viaFechaISO(new Date(t)) === fecha;
    // ¿El cliente todavía puede cambiar o cancelar? (la base lo vuelve a revisar)
    const clientePuedeCambiar = (v) => v.estado === 'confirmado'
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
        if (cliente) {
            if (clientePuedeCambiar(v)) {
                acciones.push({ texto: 'Cambiar hora', icono: 'bi-clock', accion: 'cambiar' });
                acciones.push({ texto: 'Cancelar', icono: 'bi-x-circle', accion: 'cancelar', clase: 'boton-secundario via-boton-peligro' });
            }
            return acciones;
        }
        if (conductor) {
            if (v.estado === 'confirmado') acciones.push({ texto: 'Voy en camino', icono: 'bi-car-front', accion: 'en_camino', clase: 'boton-principal' });
            if (['confirmado', 'en_camino'].includes(v.estado)) {
                acciones.push({ texto: 'A bordo', icono: 'bi-person-check', accion: 'en_curso', clase: v.estado === 'en_camino' ? 'boton-principal' : 'boton-secundario' });
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
        const { data, error } = await q;
        if (!activa) return;
        if (error) {
            mostrarError(error, 'cargar los viajes');
            $('#viaListaViajes').replaceChildren(viaElemento('p', 'via-vacio', 'Sin datos.'));
            return;
        }
        viajes = data;
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
            cuadro(validos.filter((v) => ['confirmado', 'en_camino'].includes(v.estado)).length, 'Por hacer', 'resumen-naranja'),
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
    // CLIENTE: CORTESÍA Y LUGARES
    // ==================================================

    async function cargarDatosCliente(id) {
        const [cli, est] = await Promise.all([
            db.from('clientes').select('id, nombre, apellidos, telefono, casa_direccion, casa_lat, casa_lng, trabajo_direccion, trabajo_lat, trabajo_lng')
                .eq('id', id).maybeSingle(),
            db.rpc('viajes_estado_cliente', { p_cliente: id }),
        ]);
        if (cli.error) { mostrarError(cli.error, 'cargar los datos del cliente'); return null; }
        estadoCliente = est.error ? null : est.data;
        return cli.data;
    }

    function pintarMisLugares() {
        const ul = $('#viaLugaresLista');
        ul.replaceChildren(...['casa', 'trabajo'].map((lugar) => {
            const li = viaElemento('li', 'via-lugar');
            const icono = viaElemento('i', `bi ${lugar === 'casa' ? 'bi-house' : 'bi-briefcase'}`);
            const textos = viaElemento('span', 'via-lugar-textos');
            textos.append(viaElemento('strong', null, lugar === 'casa' ? 'Casa' : 'Trabajo'),
                viaElemento('small', null, (clienteViaje && clienteViaje[`${lugar}_direccion`]) || 'Sin guardar'));
            li.append(icono, textos);
            if (clienteViaje && clienteViaje[`${lugar}_lat`] != null) {
                li.appendChild(viaBoton('Quitar', 'bi-x-lg', 'boton-secundario', { quitar: lugar }));
            }
            return li;
        }));
    }

    $('#viaLugaresLista').addEventListener('click', async (evento) => {
        const b = evento.target.closest('button[data-quitar]');
        if (!b || !clienteViaje) return;
        const lugar = b.dataset.quitar;
        if (!confirm(`¿Quitar ${lugar === 'casa' ? 'Casa' : 'Trabajo'}?`)) return;
        await guardarLugar(lugar, null);
    });

    // Guarda Casa o Trabajo en el cliente del viaje (punto = { direccion, lat, lng } o null)
    async function guardarLugar(lugar, punto) {
        if (!clienteViaje) return;
        const datos = {
            [`${lugar}_direccion`]: punto ? punto.direccion : null,
            [`${lugar}_lat`]: punto ? Number(punto.lat.toFixed(6)) : null,
            [`${lugar}_lng`]: punto ? Number(punto.lng.toFixed(6)) : null,
        };
        const { error } = await db.from('clientes').update(datos).eq('id', clienteViaje.id);
        if (error) { mostrarError(error, 'guardar el lugar'); return; }
        Object.assign(clienteViaje, datos);
        aviso.mostrar(punto ? `${lugar === 'casa' ? 'Casa' : 'Trabajo'} guardado.` : `${lugar === 'casa' ? 'Casa' : 'Trabajo'} quitado.`);
        pintarMisLugares();
        pintarBotonesLugares();
    }

    // ==================================================
    // SOLICITAR UN VIAJE
    // ==================================================

    const entradaA = $('#viaOrigen');
    const entradaB = $('#viaDestino');
    const opcionMascotas = () => (zona.querySelector('input[name="viaMascotas"]:checked') || {}).value || null;
    const llevaMercaderia = () => (zona.querySelector('input[name="viaMercaderia"]:checked') || {}).value === 'si';

    function datosViajeros() {
        const personas = Number($('#viaPersonas').value);
        const conMascotas = opcionMascotas() === 'si';
        return {
            personas: Number.isInteger(personas) && personas >= 0 ? personas : null,
            mascotas: opcionMascotas() === null ? null : conMascotas ? Math.max(1, Number($('#viaMascotasCantidad').value) || 1) : 0,
            mercaderia: llevaMercaderia(),
            kg: llevaMercaderia() ? Number($('#viaMercKg').value) || 0 : 0,
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
                        b.title = h.disponible ? `${h.hora} · ${viaDinero(h.total)}` : 'Ocupado';
                        b.append(viaElemento('strong', null, h.hora), viaElemento('small', null, h.disponible ? viaDinero(h.total) : 'Ocupado'));
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
        if (!ruta || d.personas === null || d.mascotas === null || (d.personas === 0 && !d.mercaderia)) return null;
        return {
            p_empresa: empresaActivaId(), p_km: ruta.km, p_minutos: ruta.minutos,
            p_personas: d.personas, p_mascotas: d.mascotas, p_mercaderia: d.mercaderia, p_kg: d.kg,
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
                        : d.personas === null ? 'Indica cuántas personas viajan (paso 1).'
                            : 'Si no viaja nadie, marca que lleva mercadería (paso 1).';
            selectorForm.cargar(p);
        }, 350);
    }

    // ---------- Paso 1 ----------
    function mostrarCondicionales() {
        zona.querySelectorAll('[data-si="mascotas"]').forEach((el) => { el.hidden = opcionMascotas() !== 'si'; });
        zona.querySelectorAll('[data-si="mercaderia"]').forEach((el) => { el.hidden = !llevaMercaderia(); });
    }
    ['#viaPersonas', '#viaMascotasCantidad', '#viaMercKg'].forEach((s) => $(s).addEventListener('input', refrescarHoras));
    zona.querySelectorAll('input[name="viaMascotas"], input[name="viaMercaderia"]').forEach((r) => r.addEventListener('change', () => {
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
        let q = db.from('clientes').select('id, nombre, apellidos, telefono, correo').eq('aprobado', true);
        palabras.forEach((p) => { q = q.ilike('busqueda', `%${p}%`); });
        const { data, error } = await q.order('apellidos').limit(8);
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

    // Botones Casa / Trabajo de cada punto y "Guardar como..."
    function pintarBotonesLugares() {
        const puntos = mapa ? mapa.puntos() : { a: null, b: null };
        zona.querySelectorAll('.via-lugares-botones').forEach((caja) => {
            const lado = caja.dataset.lado;
            caja.replaceChildren();
            if (!clienteViaje) return;
            ['casa', 'trabajo'].forEach((lugar) => {
                const tiene = clienteViaje[`${lugar}_lat`] != null;
                const b = viaBoton(lugar === 'casa' ? 'Casa' : 'Trabajo', lugar === 'casa' ? 'bi-house' : 'bi-briefcase', 'boton-secundario', { usar: lugar, lado });
                b.disabled = !tiene;
                b.title = tiene ? clienteViaje[`${lugar}_direccion`] || '' : `Sin guardar: ubica el punto y usa "Guardar como ${lugar === 'casa' ? 'Casa' : 'Trabajo'}"`;
                caja.appendChild(b);
            });
            if (puntos[lado]) {
                ['casa', 'trabajo'].forEach((lugar) => {
                    caja.appendChild(viaBoton(`Guardar como ${lugar === 'casa' ? 'Casa' : 'Trabajo'}`, 'bi-bookmark-plus', 'boton-secundario via-boton-suave', { guardar: lugar, lado }));
                });
            }
        });
    }

    zona.querySelectorAll('.via-lugares-botones').forEach((caja) => caja.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b || !clienteViaje) return;
        const lado = b.dataset.lado;
        const entrada = lado === 'a' ? entradaA : entradaB;
        if (b.dataset.usar) {
            const lugar = b.dataset.usar;
            entrada.value = clienteViaje[`${lugar}_direccion`] || (lugar === 'casa' ? 'Casa' : 'Trabajo');
            entrada.dataset.ubicado = entrada.value;
            const punto = { lat: Number(clienteViaje[`${lugar}_lat`]), lng: Number(clienteViaje[`${lugar}_lng`]) };
            if (lado === 'a') mapa.ponerA(punto); else mapa.ponerB(punto);
        }
        if (b.dataset.guardar) {
            const punto = mapa.puntos()[lado];
            if (!punto) return;
            const lugar = b.dataset.guardar;
            const anterior = clienteViaje[`${lugar}_direccion`];
            if (anterior && !confirm(`¿Reemplazar ${lugar === 'casa' ? 'Casa' : 'Trabajo'} (${anterior})?`)) return;
            await guardarLugar(lugar, { direccion: entrada.value.trim() || `Punto ${lado.toUpperCase()}`, lat: punto.lat, lng: punto.lng });
        }
    }));

    // ---------- Paso 4: confirmar ----------
    function pintarConfirmar() {
        const caja = $('#viaConfirmar');
        caja.replaceChildren();
        const d = datosViajeros();
        const fila = (titulo, texto) => {
            const p = viaElemento('p', 'via-confirmar-fila');
            p.append(viaElemento('span', null, titulo), viaElemento('strong', null, texto));
            caja.appendChild(p);
        };
        if (personal) fila('Cliente', clienteViaje ? nombreCliente(clienteViaje) : 'Falta elegirlo (paso 0)');
        fila('Viajan', [d.personas === null ? 'Falta indicar las personas' : plural(d.personas, 'persona', 'personas'),
            d.mascotas === null ? 'falta indicar si lleva mascotas' : d.mascotas ? plural(d.mascotas, 'mascota', 'mascotas') : 'sin mascotas',
            d.mercaderia ? 'con mercadería' : null].filter(Boolean).join(' · '));
        fila('Ruta', ruta ? `${entradaA.value || 'A'} → ${entradaB.value || 'B'} · ${viaKm(ruta.km)}` : 'Falta ubicar A y B (paso 2)');
        if (horaElegida) {
            fila('Día y hora', `${new Date(horaElegida.inicio).toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })} · ${horaElegida.hora}`);
            fila('Franja', horaElegida.franja);
            const recargos = recargosViaje({ personas: d.personas || 0, mascotas: d.mascotas || 0, mercaderia: d.mercaderia }, config);
            const cortesia = estadoCliente && (estadoCliente.cortesias || []).length && ruta && ruta.km <= Number(estadoCliente.radio_km);
            const total = cortesia ? recargos.total : Number(horaElegida.total || 0);
            const p = viaElemento('p', 'via-confirmar-total');
            p.append(viaElemento('span', null, cortesia ? 'Total (viaje de cortesía)' : 'Total estimado'), viaElemento('strong', null, viaDinero(total)));
            caja.appendChild(p);
            if (recargos.total > 0) {
                caja.appendChild(viaElemento('p', 'via-nota-chica', `Incluye recargos: ${[
                    recargos.pasajeros ? `pasajeros adicionales ${viaDinero(recargos.pasajeros)}` : null,
                    recargos.mercaderia ? `mercadería ${viaDinero(recargos.mercaderia)}` : null,
                    recargos.mascotas ? `mascotas ${viaDinero(recargos.mascotas)}` : null].filter(Boolean).join(', ')}.`));
            }
            caja.appendChild(viaElemento('p', 'via-nota-chica',
                `El vehículo y el conductor se asignan solos al confirmar. ${cliente ? `Puedes cambiar la hora o cancelar hasta ${config.cancelar_horas} horas antes.` : ''}`));
        } else {
            fila('Día y hora', 'Falta elegir (paso 3)');
        }
        $('#viaSolicitar').disabled = !(horaElegida && ruta && (!personal || clienteViaje));
    }

    // ---------- Abrir / cerrar ----------
    async function abrirFormulario() {
        if (!puedeSolicitar) return;
        enFormulario = true;
        $('#viaForm').reset();
        $('#viaFormError').textContent = '';
        $('#viaPersonas').value = '1';
        zona.querySelectorAll('input[name="viaMascotas"]').forEach((r) => { r.checked = false; }); // sin respuesta marcada
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
            : d.personas === null ? 'Indica cuántas personas viajan.'
                : d.mascotas === null ? 'Indica si lleva mascotas.'
                    : d.personas === 0 && !d.mercaderia ? 'Si no viaja nadie, marca que lleva mercadería.'
                        : !puntos.a || !puntos.b || !ruta ? 'Ubica el punto A y el punto B en el mapa.'
                            : !horaElegida ? 'Elige el día y una hora libre.' : '';
        if (falta) { error.textContent = falta; return; }

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
                lleva_mercaderia: d.mercaderia, mercaderia_descripcion: $('#viaMercDescripcion').value.trim(),
                mercaderia_bultos: d.mercaderia ? Number($('#viaMercBultos').value) || null : null,
                mercaderia_kg: d.mercaderia ? d.kg || null : null,
                inicio: horaElegida.inicio,
                notas: $('#viaNotas').value.trim(),
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
        aviso.mostrar(`Viaje ${data.codigo} confirmado: ${viaFecha(data.inicio, true)} a las ${viaHora(data.inicio)}${quien ? ` · ${quien}` : ''}${data.es_cortesia ? ' · ¡viaje de cortesía!' : ''}.`);
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
        clearTimeout(esperaHoras);
        clearTimeout(esperaCliente);
        aviso.limpiar();
        if (mapa) mapa.destruir();
        ['#viaCambiarDialogo', '#viaCancelarDialogo'].forEach((s) => { const d = $(s); if (d && d.open) d.close(); });
    };
});
