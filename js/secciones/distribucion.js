/* ==================================================
   SECCIÓN: DISTRIBUCIÓN (distribuidora) - LÓGICA
   ACACHETE LOGISTICS

   Guía: docs/15-distribuidora.md. Tablas y funciones: sql/01 bloque 27.
   Piezas comunes (precios con IVA, catálogo, selector de productos):
   js/distribucion-comun.js.

   Pestañas:
     - Bodega del día (G3 o superior): la bodega es de UNA ruta en UNA fecha.
       Abrir (dist_bodega_abrir) -> ingresar producto -> cargar a cada piloto
       (dist_movimiento: ingreso, carga, devolución, traspaso, ajuste) -> cerrar la
       mercadería de cada piloto (dist_cerrar_piloto: lo que no entregó, vendió ni
       devolvió es FALTANTE, con aviso) -> cerrar la bodega (dist_cerrar_bodega: lo
       que quedó sale y queda en 0; se guarda el resumen del día).
     - Mi carga (piloto): lo que lleva, sus pedidos del día, venta en ruta
       (dist_venta_ruta) y sus cierres.
     - Productos y precios: productos, presentaciones, precios por lista (sin IVA +
       % de IVA), listas, lista de cada tienda y motivos de entrega incompleta.
       Los cambian el Administrador y el Admin G1; los demás los ven.
     - Historial y faltantes (G3 o superior): bodegas, cierres de pilotos y reporte
       de faltantes (exportable a CSV si el plan incluye "exportar").
   Alcance: G3 su tienda | G2 su región | G1 y Administrador todas.
   ⚠ Lo controla la página; las funciones de la base revisan quién mueve la bodega.
   ================================================== */

const DIS_MOVIMIENTOS = {
    ingreso: {
        titulo: 'Ingresar producto a la bodega', boton: 'Ingresar', hecho: 'Ingreso guardado',
        texto: 'Lo que entra a la bodega de la ruta para repartir hoy.',
    },
    carga: {
        titulo: 'Cargar a un piloto', boton: 'Cargar', hecho: 'Carga guardada', piloto: true, disponible: 'bodega',
        texto: 'Sale de la bodega y queda a cargo del piloto. Se valora con la lista de la bodega.',
        sugerir: 'Sugerir según sus pedidos',
    },
    devolucion: {
        titulo: 'Devolución de un piloto', boton: 'Registrar devolución', hecho: 'Devolución guardada', piloto: true, disponible: 'mano', estado: true,
        texto: 'Lo que el piloto trae de vuelta. Marca aparte lo dañado o vencido.',
        sugerir: 'Todo lo que lleva',
    },
    traspaso: {
        titulo: 'Pasar producto entre pilotos', boton: 'Pasar', hecho: 'Traspaso guardado', piloto: true, destino: true, disponible: 'mano',
        texto: 'El producto pasa de un piloto a otro de la misma bodega.',
    },
    ajuste: {
        titulo: 'Ajuste de bodega', boton: 'Ajustar', hecho: 'Ajuste guardado', disponible: 'bodega', negativo: true, nota: true,
        texto: 'Corrige lo que hay en la bodega: cantidad positiva suma, negativa resta. El motivo es obligatorio.',
    },
};
const DIS_TIPOS = { ingreso: 'Ingreso', carga: 'Carga', devolucion: 'Devolución', traspaso: 'Traspaso', ajuste: 'Ajuste', salida: 'Salida (cierre)' };
const DIS_ESTADOS = {
    registrado: 'Registrado', asignado: 'Asignado', alistando: 'Alistando', listo_despacho: 'Listo para despachar',
    recibido_ruta: 'Recibido para ruta', cargado: 'Cargado', en_ruta: 'En ruta', en_entrega: 'Entregando',
    entregado: 'Entregado', entregado_incidencia: 'Entregado incompleto', no_entregado: 'No entregado', no_salio: 'No salió a ruta',
    reprogramado: 'Reprogramado', devuelto: 'Devuelto', cancelado: 'Cancelado',
};
const DIS_SIN_CARGA = ['entregado', 'entregado_incidencia', 'no_entregado', 'no_salio', 'cancelado', 'devuelto'];

const disFecha = (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '—');
const disHora = (ts) => (ts ? new Date(ts).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }) : '—');
// "1 unidad" / "2,5 unidades"
const disUnidades = (n) => `${distCantidad(n)} ${Number(n) === 1 ? 'unidad' : 'unidades'}`;
const disFechaLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

registrarSeccion('distribucion', (zona) => {
    const $ = (selector) => zona.querySelector(selector);
    const aviso = crearAviso($('#disAviso'), 7000);
    const sesion = obtenerSesion() || {};

    // ---------- Permisos (js/sesion.js) ----------
    const esGeneral = esAdministrador() || esAdminG1();
    const regionFija = esAdminG2() ? regionActual() : null;
    // Solo su tienda: Admin G3, y el Empleado al que se le dio Distribución (ej. encargado de inventario)
    const tiendaFija = esAdminG3() || rolActual() === 'empleado' ? tiendaActual() : null;
    const esPiloto = rolActual() === 'piloto';
    // Por rol, salvo que a ESTE usuario se le quite o se le dé (Usuarios -> "Módulos y funciones", js/sesion.js)
    const puedeBodega = puedeHacer('distribucion.bodega', esGeneral || !!regionFija || esAdminG3());
    const puedeCatalogo = puedeHacer('distribucion.catalogo', esGeneral);
    let activa = true;

    // ---------- Datos ----------
    let cat = null;              // distCargarCatalogo()
    let tiendas = [];            // tiendas de mi alcance
    let rutas = [];              // rutas de productos de mi alcance
    let pilotos = [];            // pilotos aprobados de la empresa
    let bodega = null;           // bodega del día elegida
    let saldo = [];              // dist_bodega_saldo
    let movimientos = [];
    let resumenPilotos = [];     // [{ id, lineas (dist_piloto_resumen), cierre }]

    const hoy = () => disFechaLocal(new Date());
    const presentacion = (id) => (cat ? cat.presentaciones.find((x) => x.id === id) : null);
    const descPres = (id) => distDescripcion(presentacion(id));
    const nombrePiloto = (id) => (pilotos.find((p) => p.id === id) || {}).nombre || `Piloto #${id}`;
    const nombreRuta = (id) => (rutas.find((r) => r.id === id) || {}).nombre || `Ruta #${id}`;
    const tiendaPorId = (id) => (cat ? cat.tiendas.find((t) => t.id === id) : null);
    const nombreTienda = (id) => { const t = tiendaPorId(id); return t ? `${t.codigo} · ${t.nombre}` : '—'; };
    const nombreLista = (id) => (cat && cat.listas.find((l) => l.id === id) || {}).nombre || 'Sin lista';
    const enAlcance = (tiendaId) => tiendas.some((t) => t.id === tiendaId);
    const textoError = (e, accion) => (e.code === 'P0001' ? e.message
        : distFaltaSql(e) ? 'Falta ejecutar sql/01 (bloques 26 y 27: distribuidora).' : `No se pudo ${accion}. Revisa la conexión.`);
    // Precio con IVA de una presentación en la lista de la bodega
    const valorBodega = (presId) => { const pr = distPrecio(cat, bodega ? bodega.lista_id : null, presId); return distConIva(pr.precio, pr.iva_pct); };
    const celdaNum = (n, clase = '') => crearCelda(distCantidad(n), `dist-num ${clase}`.trim());
    const etiqueta = (texto, color) => { const s = document.createElement('span'); s.className = `etiqueta ${color}`; s.textContent = texto; return s; };

    // ==================================================
    // PESTAÑAS
    // ==================================================

    const opciones = [];
    if (puedeBodega) opciones.push({ valor: 'bodega', texto: 'Bodega del día', icono: 'bi-box-seam' });
    if (esPiloto) opciones.push({ valor: 'carga', texto: 'Mi carga', icono: 'bi-truck' });
    opciones.push({ valor: 'productos', texto: 'Productos y precios', icono: 'bi-tags' });
    if (puedeBodega) opciones.push({ valor: 'historial', texto: 'Historial y faltantes', icono: 'bi-clock-history' });

    const VISTAS = { bodega: '#disVistaBodega', carga: '#disVistaCarga', productos: '#disVistaProductos', historial: '#disVistaHistorial' };
    const CARGAR = { bodega: () => cargarBodega(), carga: () => cargarCarga(), productos: () => cargarProductos(), historial: () => cargarHistorial() };

    function mostrarPestana(valor) {
        Object.entries(VISTAS).forEach(([k, sel]) => { $(sel).hidden = k !== valor; });
        history.replaceState(null, '', `#distribucion?pestana=${valor}`);
        if (cat) CARGAR[valor]();
    }

    const pedida = parametrosSeccion().get('pestana');
    const inicial = opciones.some((o) => o.valor === pedida) ? pedida : opciones[0].valor;
    const pestanas = crearPestanas($('#disPestanas'), opciones, inicial, mostrarPestana);

    // ==================================================
    // DATOS BASE
    // ==================================================

    async function cargarBase() {
        const nuevo = await distCargarCatalogo();
        if (nuevo.error) {
            console.error('Error al cargar la distribuidora:', nuevo.error);
            $('#disFaltaSql').hidden = !distFaltaSql(nuevo.error);
            $('#disSubtitulo').textContent = 'No se pudo cargar.';
            if (!distFaltaSql(nuevo.error)) aviso.mostrar('No se pudieron cargar los productos. Revisa la conexión.', 'error');
            return false;
        }
        cat = nuevo;
        tiendas = cat.tiendas.filter((t) => (tiendaFija ? t.id === tiendaFija : regionFija ? t.region === regionFija : true));
        const [rut, pil] = await Promise.all([
            db.from('rutas').select('id, tienda_id, nombre, actividad, activa').order('orden').order('nombre'),
            db.from('usuarios').select('id, nombre, tienda_id').eq('rol', 'piloto').eq('aprobado', true).order('nombre'),
        ]);
        if (rut.error || pil.error) {
            console.error('Error al cargar rutas o pilotos:', rut.error || pil.error);
            aviso.mostrar('No se pudieron cargar las rutas o los pilotos.', 'error');
            return false;
        }
        // Rutas de productos: sin actividad o con una actividad que use productos
        rutas = rut.data.filter((r) => (esPiloto || enAlcance(r.tienda_id))
            && (!r.actividad || actividadUsaParte(r.actividad, 'productos')));
        pilotos = pil.data;
        $('#disSubtitulo').textContent = esPiloto
            ? 'Tu carga del día, tus pedidos y la venta en ruta'
            : `${plural(cat.productos.length, 'producto', 'productos')} · ${plural(rutas.length, 'ruta', 'rutas')} para productos`;
        return true;
    }

    // Catálogo fresco (precios o productos cambiaron)
    async function recargarCatalogo() {
        const nuevo = await distCargarCatalogo();
        if (!nuevo.error) cat = nuevo;
        return !nuevo.error;
    }

    // ==================================================
    // BODEGA DEL DÍA
    // ==================================================

    const selTienda = $('#disTienda');
    const selRuta = $('#disRuta');
    const inputFecha = $('#disFecha');

    // Solo tiendas con rutas (envían pedidos; sql/01 bloque 28)
    let tiendasBodega = [];

    async function llenarFiltrosBodega() {
        const sinRutas = await tiendasSinRutas(); // js/componentes.js
        tiendasBodega = tiendas.filter((t) => !sinRutas.has(t.id));
        selTienda.replaceChildren(...tiendasBodega.map((t) => new Option(`${t.codigo} · ${t.nombre}`, t.id)));
        selTienda.hidden = tiendasBodega.length <= 1;
        if (!inputFecha.value) inputFecha.value = hoy();
        llenarRutas();
    }

    function llenarRutas() {
        const tiendaId = Number(selTienda.value) || null;
        const actual = selRuta.value;
        const lista = rutas.filter((r) => r.activa && r.tienda_id === tiendaId);
        selRuta.replaceChildren(...lista.map((r) => new Option(r.nombre, r.id)));
        if (lista.some((r) => String(r.id) === actual)) selRuta.value = actual;
        selRuta.hidden = !lista.length;
    }

    selTienda.addEventListener('change', () => { llenarRutas(); cargarBodega(); });
    selRuta.addEventListener('change', cargarBodega);
    inputFecha.addEventListener('change', cargarBodega);

    let turnoBodega = 0;
    async function cargarBodega() {
        if (!selTienda.options.length) await llenarFiltrosBodega();
        const turno = ++turnoBodega;
        const rutaId = Number(selRuta.value) || null;
        $('#disSinRutas').hidden = !!rutaId;
        $('#disAbrirCaja').hidden = true;
        $('#disBodegaCaja').hidden = true;
        bodega = null;
        if (!rutaId || !inputFecha.value) return;

        const { data, error } = await db.from('bodegas_dia').select('*').eq('ruta_id', rutaId).eq('fecha', inputFecha.value).maybeSingle();
        if (turno !== turnoBodega || !activa) return;
        if (error) {
            console.error('Error al cargar la bodega:', error);
            aviso.mostrar(textoError(error, 'cargar la bodega'), 'error');
            return;
        }
        if (!data) {
            const sel = $('#disAbrirLista');
            sel.replaceChildren(...cat.listas.filter((l) => l.activa).map((l) => new Option(`${l.nombre}${l.general ? ' (general)' : ''}`, l.id)));
            sel.value = String(distListaDeTienda(cat, Number(selTienda.value)) || '');
            $('#disAbrirCaja').hidden = false;
            return;
        }
        bodega = data;
        const [sal, mov, cie] = await Promise.all([
            db.rpc('dist_bodega_saldo', { p_bodega: bodega.id }),
            db.from('bodega_movimientos')
                .select('id, presentacion_id, tipo, piloto_id, piloto_destino_id, cantidad, estado_producto, nota, usuario_nombre, creado_en')
                .eq('bodega_id', bodega.id).order('creado_en', { ascending: false }),
            db.from('cierres_mercaderia').select('*').eq('bodega_id', bodega.id),
        ]);
        if (turno !== turnoBodega || !activa) return;
        const err = sal.error || mov.error || cie.error;
        if (err) {
            console.error('Error al cargar la bodega:', err);
            aviso.mostrar(textoError(err, 'cargar la bodega'), 'error');
            return;
        }
        saldo = sal.data;
        movimientos = mov.data;
        const ids = [...new Set(movimientos.flatMap((m) => [m.piloto_id, m.piloto_destino_id]).filter(Boolean))];
        resumenPilotos = await Promise.all(ids.map(async (id) => {
            const r = await db.rpc('dist_piloto_resumen', { p_bodega: bodega.id, p_piloto: id });
            return { id, lineas: r.data || [], cierre: cie.data.find((c) => c.piloto_id === id) || null };
        }));
        if (turno !== turnoBodega || !activa) return;
        dibujarBodega();
    }

    $('#disAbrir').addEventListener('click', async () => {
        const boton = $('#disAbrir');
        boton.disabled = true;
        const { error } = await db.rpc('dist_bodega_abrir', {
            p: { usuario_id: sesion.id || null, ruta_id: Number(selRuta.value), fecha: inputFecha.value, lista_id: Number($('#disAbrirLista').value) || null },
        });
        boton.disabled = false;
        if (error) {
            console.error('Error al abrir la bodega:', error);
            aviso.mostrar(textoError(error, 'abrir la bodega'), 'error');
            return;
        }
        aviso.mostrar(`Bodega de ${nombreRuta(Number(selRuta.value))} abierta. Ingresa el producto del día.`);
        cargarBodega();
    });

    // Totales de un piloto (unidades y valor)
    function totalesPiloto(r) {
        const t = { cargado: 0, entregado: 0, vendido: 0, devuelto: 0, enMano: 0, valorMano: 0 };
        r.lineas.forEach((l) => {
            t.cargado += Number(l.cargado) + Number(l.recibido) - Number(l.enviado);
            t.entregado += Number(l.entregado);
            t.vendido += Number(l.vendido);
            t.devuelto += Number(l.devuelto_bueno) + Number(l.devuelto_danado);
            t.enMano += Number(l.en_mano);
            t.valorMano += Number(l.en_mano) * Number(l.valor_unidad);
        });
        return t;
    }

    function dibujarBodega() {
        const abierta = bodega.estado === 'abierta';
        $('#disBodegaCaja').hidden = false;
        $('#disBodegaTitulo').textContent = `${nombreRuta(bodega.ruta_id)} · ${disFecha(bodega.fecha)}`;
        $('#disBodegaDetalle').textContent = [
            `Lista: ${nombreLista(bodega.lista_id)}`,
            `Abierta por ${bodega.abierta_por_nombre || '—'} a las ${disHora(bodega.abierta_en)}`,
            bodega.cerrada_en ? `Cerrada por ${bodega.cerrada_por_nombre || '—'} a las ${disHora(bodega.cerrada_en)}` : null,
            bodega.notas,
        ].filter(Boolean).join(' · ');
        $('#disBodegaEstado').replaceChildren(abierta ? etiqueta('Abierta', 'etiqueta-verde') : etiqueta('Cerrada', 'etiqueta-gris'));
        $('#disBodegaBotones').hidden = !abierta;

        // Totales
        const suma = (lista, f) => lista.reduce((s, x) => s + Number(f(x) || 0), 0);
        const vendido = suma(resumenPilotos, (r) => totalesPiloto(r).entregado + totalesPiloto(r).vendido);
        const enBodega = suma(saldo, (s) => s.en_bodega);
        $('#disTotIngresado').textContent = distCantidad(suma(saldo, (s) => s.ingresado));
        $('#disTotCargado').textContent = distCantidad(suma(saldo, (s) => s.cargado));
        $('#disTotVendido').textContent = distCantidad(vendido);
        $('#disTotBodega').textContent = distCantidad(enBodega);
        $('#disTotBodegaTexto').textContent = `En bodega · ${distDinero(suma(saldo, (s) => Number(s.en_bodega) * valorBodega(s.presentacion_id)))}`;

        // Bodega por producto
        const cuerpo = $('#disSaldo');
        cuerpo.replaceChildren();
        if (!saldo.length) cuerpo.appendChild(crearFilaVacia(abierta ? 'Todavía no hay producto: usa "Ingresar producto".' : 'Sin movimientos.', 9));
        [...saldo].sort((a, b) => descPres(a.presentacion_id).localeCompare(descPres(b.presentacion_id))).forEach((s) => {
            const tr = document.createElement('tr');
            tr.append(crearCelda(descPres(s.presentacion_id)), celdaNum(s.ingresado), celdaNum(s.cargado), celdaNum(s.devuelto_bueno),
                celdaNum(s.devuelto_danado), celdaNum(s.ajustes), celdaNum(s.salida), celdaNum(s.en_bodega, Number(s.en_bodega) < 0 ? 'dis-texto-falta' : ''),
                crearCelda(distDinero(Number(s.en_bodega) * valorBodega(s.presentacion_id)), 'dist-num'));
            cuerpo.appendChild(tr);
        });

        // Pilotos
        const cuerpoP = $('#disPilotos');
        cuerpoP.replaceChildren();
        if (!resumenPilotos.length) cuerpoP.appendChild(crearFilaVacia('Ningún piloto tiene carga de esta bodega.', 9));
        resumenPilotos.forEach((r) => {
            const t = totalesPiloto(r);
            const tr = document.createElement('tr');
            const tdEstado = document.createElement('td');
            if (r.cierre) {
                const falta = Number(r.cierre.unidades_faltantes) > 0;
                tdEstado.appendChild(falta ? etiqueta(`Cerrado · faltan ${distCantidad(r.cierre.unidades_faltantes)}`, 'etiqueta-naranja')
                    : etiqueta('Cerrado · cuadra', 'etiqueta-verde'));
            } else {
                tdEstado.appendChild(etiqueta(t.enMano > 0 ? 'Con producto' : 'Sin producto en mano', 'etiqueta-azul'));
            }
            const botones = [crearBotonIcono('editar', r.id, 'bi-eye', `Ver el cuadre de ${nombrePiloto(r.id)}`)];
            botones[0].dataset.accion = 'ver';
            if (!r.cierre && abierta) {
                const b = crearBotonIcono('editar', r.id, 'bi-lock', `Cerrar la mercadería de ${nombrePiloto(r.id)}`);
                b.dataset.accion = 'cerrar';
                botones.push(b);
            }
            // Mercadería cerrada: el dinero se cuadra en la Caja del piloto (si la empresa la usa)
            if (r.cierre && typeof tienePermiso === 'function' && tienePermiso('caja')) {
                const b = crearBotonIcono('editar', r.id, 'bi-safe', `Cerrar la caja de ${nombrePiloto(r.id)}`);
                b.dataset.accion = 'caja';
                botones.push(b);
            }
            tr.append(crearCelda(nombrePiloto(r.id)), celdaNum(t.cargado), celdaNum(t.entregado), celdaNum(t.vendido), celdaNum(t.devuelto),
                celdaNum(t.enMano), crearCelda(distDinero(t.valorMano), 'dist-num'), tdEstado, crearCeldaAcciones(...botones));
            cuerpoP.appendChild(tr);
        });

        // Movimientos
        const cuerpoM = $('#disMovimientos');
        cuerpoM.replaceChildren();
        if (!movimientos.length) cuerpoM.appendChild(crearFilaVacia('Sin movimientos.', 7));
        movimientos.forEach((m) => {
            const tr = document.createElement('tr');
            const quien = m.tipo === 'traspaso' ? `${nombrePiloto(m.piloto_id)} → ${nombrePiloto(m.piloto_destino_id)}` : (m.piloto_id ? nombrePiloto(m.piloto_id) : null);
            const tipo = DIS_TIPOS[m.tipo] + (m.estado_producto === 'danado' ? ' (dañado)' : '');
            tr.append(crearCelda(disHora(m.creado_en)), crearCelda(tipo), crearCelda(quien), crearCelda(descPres(m.presentacion_id)),
                celdaNum(m.cantidad), crearCelda(m.usuario_nombre), crearCelda(m.nota));
            cuerpoM.appendChild(tr);
        });
    }

    $('#disPilotos').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion]');
        if (!b) return;
        if (b.dataset.accion === 'caja') { location.hash = `caja?piloto=${b.dataset.id}`; return; } // js/secciones/caja.js
        abrirCuadre(Number(b.dataset.id), b.dataset.accion === 'cerrar');
    });

    // ---------- Movimientos (ventana) ----------
    const dlgMov = $('#disMovDialogo');
    const selMovPiloto = $('#disMovPiloto');
    const selMovDestino = $('#disMovDestino');
    const selMovProducto = $('#disMovProducto');
    let movTipo = null;
    let movLineas = []; // [{ presentacion_id, cantidad, estado }]
    let pilotosRuta = [];

    const resumenDe = (pilotoId) => resumenPilotos.find((r) => r.id === pilotoId) || { lineas: [], cierre: null };
    const enManoDe = (pilotoId) => new Map(resumenDe(pilotoId).lineas.map((l) => [l.presentacion_id, Number(l.en_mano)]));
    const enBodegaDe = () => new Map(saldo.map((s) => [s.presentacion_id, Number(s.en_bodega)]));

    // Lo que hay disponible de cada producto para este movimiento (null = sin límite)
    function disponibles() {
        const def = DIS_MOVIMIENTOS[movTipo];
        if (def.disponible === 'bodega') return enBodegaDe();
        if (def.disponible === 'mano') return enManoDe(Number(selMovPiloto.value));
        return null;
    }

    // Pilotos en grupos: los de la ruta ese día, los de la tienda y los demás
    function llenarPilotosMov(select, { soloConProducto = false, excluir = null } = {}) {
        const cerrados = new Set(resumenPilotos.filter((r) => r.cierre).map((r) => r.id));
        const usable = pilotos.filter((p) => !cerrados.has(p.id) && p.id !== excluir
            && (!soloConProducto || [...enManoDe(p.id).values()].some((n) => n > 0)));
        const grupos = [
            ['De la ruta hoy', usable.filter((p) => pilotosRuta.includes(p.id))],
            ['De la tienda', usable.filter((p) => !pilotosRuta.includes(p.id) && p.tienda_id === bodega.tienda_id)],
            ['Otros', usable.filter((p) => !pilotosRuta.includes(p.id) && p.tienda_id !== bodega.tienda_id)],
        ];
        const actual = select.value;
        select.replaceChildren(new Option(usable.length ? 'Elige el piloto' : 'No hay pilotos', ''));
        grupos.filter(([, l]) => l.length).forEach(([titulo, lista]) => {
            const g = document.createElement('optgroup');
            g.label = titulo;
            lista.forEach((p) => g.appendChild(new Option(p.nombre, p.id)));
            select.appendChild(g);
        });
        if ([...select.options].some((o) => o.value === actual)) select.value = actual;
    }

    function llenarProductosMov() {
        const disp = disponibles();
        const soloIds = disp && movTipo !== 'ajuste' ? new Set([...disp.entries()].filter(([, n]) => n > 0).map(([id]) => id)) : null;
        distLlenarPresentaciones(selMovProducto, cat, { soloIds, vacio: soloIds && !soloIds.size ? 'No hay producto disponible' : 'Elige un producto' });
    }

    function dibujarMovLineas() {
        const def = DIS_MOVIMIENTOS[movTipo];
        const disp = disponibles();
        const cuerpo = $('#disMovLineas');
        cuerpo.replaceChildren();
        if (!movLineas.length) cuerpo.appendChild(crearFilaVacia('Agrega los productos con su cantidad.', 5));
        movLineas.forEach((l, i) => {
            const tr = document.createElement('tr');
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.step = 'any';
            inp.inputMode = 'decimal';
            inp.className = 'campo-input dist-cantidad';
            inp.value = l.cantidad;
            inp.dataset.linea = i;
            inp.setAttribute('aria-label', `Cantidad de ${descPres(l.presentacion_id)}`);
            const tdCant = document.createElement('td');
            tdCant.className = 'dist-num';
            tdCant.appendChild(inp);
            const tdEstado = crearCelda(def.estado ? (l.estado === 'danado' ? 'Dañado / vencido' : 'Bueno') : '');
            tdEstado.hidden = !def.estado;
            const disponible = disp ? Number(disp.get(l.presentacion_id) || 0) : null;
            tr.append(crearCelda(descPres(l.presentacion_id)), crearCelda(disponible == null ? '—' : distCantidad(disponible), 'dist-num'),
                tdCant, tdEstado, crearCeldaAcciones(crearBotonIcono('eliminar', i, 'bi-x-lg', 'Quitar')));
            cuerpo.appendChild(tr);
        });
        $('#disMovColEstado').hidden = !def.estado;
        $('#disMovColDisponible').hidden = !def.disponible;
        zona.querySelectorAll('#disMovLineas td:nth-child(2)').forEach((td) => { td.hidden = !def.disponible; });
    }

    async function abrirMovimiento(tipo) {
        if (!bodega || bodega.estado !== 'abierta') return;
        movTipo = tipo;
        movLineas = [];
        const def = DIS_MOVIMIENTOS[tipo];
        $('#disMovTitulo').textContent = def.titulo;
        $('#disMovTexto').textContent = def.texto;
        $('#disMovGuardar').textContent = def.boton;
        $('#disMovPilotoCaja').hidden = !def.piloto;
        $('#disMovDestinoCaja').hidden = !def.destino;
        $('#disMovPilotoEtiqueta').textContent = def.destino ? 'Piloto que entrega *' : 'Piloto *';
        $('#disMovEstado').hidden = !def.estado;
        $('#disMovEstado').value = 'bueno';
        $('#disMovSugerirCaja').hidden = !def.sugerir;
        $('#disMovSugerirTexto').textContent = def.sugerir || '';
        $('#disMovSugerirAyuda').textContent = '';
        $('#disMovNotaEtiqueta').textContent = def.nota ? 'Motivo del ajuste *' : 'Nota';
        $('#disMovNota').value = '';
        $('#disMovCantidad').value = '1';
        $('#disMovCantidad').min = def.negativo ? '' : '0';
        $('#disMovError').textContent = '';

        if (def.piloto) {
            const { data } = await db.from('rutas_pilotos').select('piloto_id')
                .eq('ruta_id', bodega.ruta_id).lte('fecha_desde', bodega.fecha).gte('fecha_hasta', bodega.fecha);
            pilotosRuta = (data || []).map((x) => x.piloto_id);
            selMovPiloto.value = '';
            llenarPilotosMov(selMovPiloto, { soloConProducto: def.disponible === 'mano' });
            if (def.destino) llenarPilotosMov(selMovDestino, { excluir: Number(selMovPiloto.value) || null });
        }
        llenarProductosMov();
        dibujarMovLineas();
        dlgMov.showModal();
    }

    $('#disBodegaBotones').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-mov]');
        if (b) abrirMovimiento(b.dataset.mov);
    });

    selMovPiloto.addEventListener('change', () => {
        const def = DIS_MOVIMIENTOS[movTipo];
        if (def.destino) llenarPilotosMov(selMovDestino, { excluir: Number(selMovPiloto.value) || null });
        if (def.disponible === 'mano') { movLineas = []; llenarProductosMov(); }
        dibujarMovLineas();
    });

    $('#disMovAgregar').addEventListener('click', () => {
        const def = DIS_MOVIMIENTOS[movTipo];
        const error = $('#disMovError');
        error.textContent = '';
        const id = Number(selMovProducto.value);
        const n = distRedondo($('#disMovCantidad').value);
        const estado = def.estado ? $('#disMovEstado').value : null;
        if (!id) { error.textContent = 'Elige el producto.'; selMovProducto.focus(); return; }
        if (!n || (!def.negativo && n < 0)) { error.textContent = def.negativo ? 'Escribe una cantidad distinta de 0.' : 'Escribe una cantidad mayor que 0.'; return; }
        const ya = movLineas.find((l) => l.presentacion_id === id && l.estado === estado);
        if (ya) ya.cantidad = distRedondo(ya.cantidad + n);
        else movLineas.push({ presentacion_id: id, cantidad: n, estado });
        selMovProducto.value = '';
        $('#disMovCantidad').value = '1';
        dibujarMovLineas();
    });

    $('#disMovLineas').addEventListener('input', (e) => {
        const inp = e.target.closest('input[data-linea]');
        if (inp) movLineas[Number(inp.dataset.linea)].cantidad = distRedondo(inp.value);
    });
    $('#disMovLineas').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion="eliminar"]');
        if (!b) return;
        movLineas.splice(Number(b.dataset.id), 1);
        dibujarMovLineas();
    });

    // Sugerencias: carga = lo de sus pedidos del día que todavía no lleva; devolución = todo lo que lleva
    $('#disMovSugerir').addEventListener('click', async () => {
        const pilotoId = Number(selMovPiloto.value);
        const ayuda = $('#disMovSugerirAyuda');
        if (!pilotoId) { $('#disMovError').textContent = 'Primero elige el piloto.'; return; }
        if (movTipo === 'devolucion') {
            movLineas = [...enManoDe(pilotoId).entries()].filter(([, n]) => n > 0).map(([id, n]) => ({ presentacion_id: id, cantidad: n, estado: 'bueno' }));
            ayuda.textContent = movLineas.length ? 'Cambia a "Dañado" lo que venga en mal estado (quita la línea y agrégala con ese estado).' : 'No lleva producto.';
            dibujarMovLineas();
            return;
        }
        const { data, error } = await db.from('pedidos').select('id, estado, pedido_productos(presentacion_id, cantidad)')
            .eq('piloto_id', pilotoId).eq('fecha_entrega', bodega.fecha).eq('anulado', false);
        if (error) {
            console.error('Error al leer sus pedidos:', error);
            ayuda.textContent = 'No se pudieron leer sus pedidos.';
            return;
        }
        const pedidos = data.filter((p) => !DIS_SIN_CARGA.includes(p.estado));
        const falta = new Map();
        pedidos.forEach((p) => (p.pedido_productos || []).forEach((x) => falta.set(x.presentacion_id, (falta.get(x.presentacion_id) || 0) + Number(x.cantidad))));
        const mano = enManoDe(pilotoId);
        movLineas = [...falta.entries()].map(([id, n]) => ({ presentacion_id: id, cantidad: distRedondo(n - (mano.get(id) || 0)), estado: null }))
            .filter((l) => l.cantidad > 0);
        ayuda.textContent = pedidos.length
            ? `${plural(pedidos.length, 'pedido', 'pedidos')} del día${movLineas.length ? '' : ': ya lleva todo lo que necesita'}. Puedes agregar más para la venta en ruta.`
            : 'No tiene pedidos con productos ese día: agrega lo que llevará para vender en ruta.';
        dibujarMovLineas();
    });

    $('#disMovCancelar').addEventListener('click', () => dlgMov.close());

    $('#disMovForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const def = DIS_MOVIMIENTOS[movTipo];
        const error = $('#disMovError');
        error.textContent = '';
        const lineas = movLineas.filter((l) => l.cantidad);
        if (def.piloto && !selMovPiloto.value) { error.textContent = 'Elige el piloto.'; return; }
        if (def.destino && !selMovDestino.value) { error.textContent = 'Elige el piloto que recibe.'; return; }
        if (!lineas.length) { error.textContent = 'Agrega al menos un producto.'; return; }
        if (!def.negativo && lineas.some((l) => l.cantidad < 0)) { error.textContent = 'Las cantidades deben ser mayores que 0.'; return; }
        if (def.nota && !$('#disMovNota').value.trim()) { error.textContent = 'Escribe el motivo del ajuste.'; $('#disMovNota').focus(); return; }
        const boton = $('#disMovGuardar');
        boton.disabled = true;
        const { error: err } = await db.rpc('dist_movimiento', {
            p: {
                usuario_id: sesion.id || null, bodega_id: bodega.id, tipo: movTipo,
                piloto_id: def.piloto ? Number(selMovPiloto.value) : null,
                piloto_destino_id: def.destino ? Number(selMovDestino.value) : null,
                nota: $('#disMovNota').value.trim() || null,
                lineas: lineas.map((l) => ({ presentacion_id: l.presentacion_id, cantidad: l.cantidad, estado: l.estado })),
            },
        });
        boton.disabled = false;
        if (err) {
            console.error('Error al guardar el movimiento:', err);
            error.textContent = textoError(err, 'guardar el movimiento');
            return;
        }
        dlgMov.close();
        const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
        aviso.mostrar(`${def.hecho}: ${disUnidades(unidades)}${def.piloto ? ` · ${nombrePiloto(Number(selMovPiloto.value))}` : ''}.`);
        // Avisos: al piloto que se le cargó o se le pasó producto
        if (movTipo === 'carga' || movTipo === 'traspaso') {
            const a = movTipo === 'carga' ? Number(selMovPiloto.value) : Number(selMovDestino.value);
            await avisar({
                usuarios: [a], enlace: '#distribucion?pestana=carga', referenciaTipo: 'bodega_dia', referenciaId: bodega.id,
                titulo: movTipo === 'carga' ? 'Te cargaron producto' : 'Te pasaron producto',
                mensaje: `${disUnidades(unidades)} de la bodega ${nombreRuta(bodega.ruta_id)} (${disFecha(bodega.fecha)}). Revísalo en Distribución → Mi carga.`,
            });
        }
        cargarBodega();
    });

    // ---------- Cuadre de un piloto (ver o cerrar) ----------
    const dlgCuadre = $('#disCuadreDialogo');
    let cuadrePiloto = null;

    // Líneas del cuadre: del cierre guardado o calculadas ahora
    function lineasCuadre(r) {
        if (r.cierre) return r.cierre.lineas.map((x) => ({ ...x, devuelto: Number(x.devuelto_bueno) + Number(x.devuelto_danado) }));
        return r.lineas.map((l) => ({
            presentacion_id: l.presentacion_id, descripcion: descPres(l.presentacion_id),
            cargado: Number(l.cargado) + Number(l.recibido) - Number(l.enviado), entregado: Number(l.entregado), vendido: Number(l.vendido),
            devuelto: Number(l.devuelto_bueno) + Number(l.devuelto_danado), faltante: Number(l.en_mano), valor_unidad: Number(l.valor_unidad),
            valor_entregado: Number(l.valor_entregado), valor_vendido: Number(l.valor_vendido),
        }));
    }

    function datoLista(ul, filas) {
        ul.replaceChildren(...filas.map(([texto, valor, clase]) => {
            const li = document.createElement('li');
            const s = document.createElement('span');
            s.textContent = texto;
            const b = document.createElement('strong');
            b.textContent = valor;
            if (clase) b.className = clase;
            li.append(s, b);
            return li;
        }));
    }

    async function abrirCuadre(pilotoId, cerrar) {
        const r = resumenDe(pilotoId);
        cuadrePiloto = pilotoId;
        const lineas = lineasCuadre(r);
        const cuerpo = $('#disCuadreLineas');
        cuerpo.replaceChildren();
        const t = { cargado: 0, entregado: 0, vendido: 0, devuelto: 0, faltante: 0, valorFaltante: 0, valorCargado: 0, valorDevuelto: 0, valorEntregado: 0, valorVendido: 0 };
        lineas.forEach((l) => {
            const valorFalta = distRedondo(Number(l.faltante) * Number(l.valor_unidad));
            t.cargado += Number(l.cargado); t.entregado += Number(l.entregado); t.vendido += Number(l.vendido);
            t.devuelto += Number(l.devuelto); t.faltante += Number(l.faltante); t.valorFaltante += valorFalta;
            t.valorCargado += Number(l.cargado) * Number(l.valor_unidad);
            t.valorDevuelto += Number(l.devuelto) * Number(l.valor_unidad);
            t.valorEntregado += Number(l.valor_entregado || 0); t.valorVendido += Number(l.valor_vendido || 0);
            const tr = document.createElement('tr');
            if (Number(l.faltante) > 0) tr.className = 'dist-fila-incompleta';
            tr.append(crearCelda(l.descripcion), celdaNum(l.cargado), celdaNum(l.entregado), celdaNum(l.vendido), celdaNum(l.devuelto),
                celdaNum(l.faltante, Number(l.faltante) > 0 ? 'dis-texto-falta' : ''), crearCelda(distDinero(valorFalta), 'dist-num'));
            cuerpo.appendChild(tr);
        });
        if (!lineas.length) cuerpo.appendChild(crearFilaVacia('Sin carga.', 7));
        const pie = $('#disCuadreTotales');
        pie.replaceChildren();
        const trT = document.createElement('tr');
        trT.className = 'dist-total';
        const th = document.createElement('th');
        th.textContent = 'Total';
        trT.append(th, celdaNum(t.cargado), celdaNum(t.entregado), celdaNum(t.vendido), celdaNum(t.devuelto), celdaNum(t.faltante),
            crearCelda(distDinero(t.valorFaltante), 'dist-num'));
        pie.appendChild(trT);

        // Lo que debe cobrar (sus pedidos y ventas que salieron de esta bodega)
        let cobrado = r.cierre ? Number(r.cierre.cobrado) : null;
        if (cobrado == null) {
            const { data } = await db.from('pedido_productos').select('pedido_id, pedidos(total_cobrar, piloto_id, anulado)').eq('bodega_id', bodega.id);
            const vistos = new Map();
            (data || []).filter((x) => x.pedidos && x.pedidos.piloto_id === pilotoId && !x.pedidos.anulado)
                .forEach((x) => vistos.set(x.pedido_id, Number(x.pedidos.total_cobrar)));
            cobrado = [...vistos.values()].reduce((s, n) => s + n, 0);
        }
        datoLista($('#disCuadreDinero'), [
            ['Valor cargado (lista de la bodega, con IVA)', distDinero(r.cierre ? r.cierre.valor_cargado : t.valorCargado)],
            ['Entregado en pedidos (con IVA)', distDinero(r.cierre ? r.cierre.valor_entregado : t.valorEntregado)],
            ['Vendido en ruta (con IVA)', distDinero(r.cierre ? r.cierre.valor_vendido : t.valorVendido)],
            ['Devuelto a la bodega', distDinero(r.cierre ? r.cierre.valor_devuelto : t.valorDevuelto)],
            ['Faltante', distDinero(r.cierre ? r.cierre.valor_faltante : t.valorFaltante), t.faltante > 0 ? 'dis-texto-falta' : 'dis-texto-ok'],
            ['Total a cobrar de sus pedidos y ventas (lo cuadra la Caja)', distDinero(cobrado)],
        ]);

        const modoCerrar = cerrar && !r.cierre && bodega.estado === 'abierta';
        $('#disCuadreTitulo').textContent = `${modoCerrar ? 'Cerrar la mercadería de' : 'Cuadre de'} ${nombrePiloto(pilotoId)}`;
        $('#disCuadreTexto').textContent = r.cierre
            ? `Cerrado por ${r.cierre.cerrado_por_nombre || '—'} el ${disFecha(r.cierre.fecha)} a las ${disHora(r.cierre.cerrado_en)}.${r.cierre.notas ? ` Notas: ${r.cierre.notas}` : ''}`
            : modoCerrar
                ? (t.faltante > 0
                    ? `Todavía tiene ${disUnidades(t.faltante)} sin entregar, vender ni devolver. Si las trae, registra primero su devolución; si no, quedan como FALTANTE (se avisa y sale en el reporte).`
                    : 'Cargado = entregado + vendido + devuelto: cuadra. Al cerrar ya no se le puede cargar más de esta bodega.')
                : 'Cuadre al momento (todavía no se cierra).';
        $('#disCuadreNotasCaja').hidden = !modoCerrar;
        $('#disCuadreNotas').value = '';
        $('#disCuadreCerrar').hidden = !modoCerrar;
        $('#disCuadreCerrar').className = `boton ${t.faltante > 0 ? 'boton-peligro' : 'boton-principal'}`;
        $('#disCuadreError').textContent = '';
        dlgCuadre.showModal();
    }

    $('#disCuadreVolver').addEventListener('click', () => dlgCuadre.close());
    $('#disCuadreForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!cuadrePiloto || !bodega) return;
        const boton = $('#disCuadreCerrar');
        boton.disabled = true;
        const { data, error } = await db.rpc('dist_cerrar_piloto', {
            p: { usuario_id: sesion.id || null, bodega_id: bodega.id, piloto_id: cuadrePiloto, notas: $('#disCuadreNotas').value.trim() || null },
        });
        boton.disabled = false;
        if (error) {
            console.error('Error al cerrar la mercadería:', error);
            $('#disCuadreError').textContent = textoError(error, 'cerrar la mercadería');
            return;
        }
        dlgCuadre.close();
        const falta = Number(data.unidades_faltantes) > 0;
        const conCaja = typeof tienePermiso === 'function' && tienePermiso('caja');
        aviso.mostrar(`Mercadería de ${data.piloto_nombre} cerrada${conCaja ? ' (cierra su caja con el botón de la caja fuerte)' : ''}: ${falta
            ? `${Number(data.unidades_faltantes) === 1 ? 'falta' : 'faltan'} ${disUnidades(data.unidades_faltantes)} (${distDinero(data.valor_faltante)}).` : 'cuadra.'}`, falta ? 'error' : 'ok');
        // Faltante: aviso al G3 y al G2 de la tienda y al piloto; queda en el reporte (Historial)
        if (falta) {
            const detalle = (data.lineas || []).filter((l) => Number(l.faltante) > 0).map((l) => `${l.descripcion}: ${distCantidad(l.faltante)}`).join('; ');
            await avisar({
                tiendaId: bodega.tienda_id, a: ['g3', 'g2'], usuarios: [data.piloto_id], tipo: 'pendiente',
                enlace: '#distribucion?pestana=historial', referenciaTipo: 'cierre_mercaderia', referenciaId: data.id,
                titulo: 'Faltante de mercadería',
                mensaje: `${data.piloto_nombre} cerró la ruta ${nombreRuta(bodega.ruta_id)} (${disFecha(bodega.fecha)}) con faltante de `
                    + `${disUnidades(data.unidades_faltantes)} (${distDinero(data.valor_faltante)}): ${detalle}.`,
            });
        }
        cargarBodega();
    });

    // ---------- Cerrar la bodega / ver el resumen de una bodega ----------
    const dlgCierre = $('#disCierreDialogo');
    let bodegaCierre = null;

    function dibujarResumenBodega(lineas, totales) {
        const cuerpo = $('#disCierreLineas');
        cuerpo.replaceChildren();
        if (!lineas.length) cuerpo.appendChild(crearFilaVacia('Sin productos.', 8));
        lineas.forEach((l) => {
            const tr = document.createElement('tr');
            tr.append(crearCelda(l.descripcion), celdaNum(Number(l.ingresado) + Number(l.ajustes || 0)), celdaNum(l.cargado), celdaNum(l.entregado),
                celdaNum(l.vendido), celdaNum(Number(l.devuelto_bueno) + Number(l.devuelto_danado)),
                celdaNum(l.faltante, Number(l.faltante) > 0 ? 'dis-texto-falta' : ''), celdaNum(l.salida));
            cuerpo.appendChild(tr);
        });
        datoLista($('#disCierreDinero'), [
            ['Hubo en bodega (con ajustes)', `${disUnidades(Number(totales.ingresado) + Number(totales.ajustes || 0))} · ${distDinero(totales.valor_ingresado)}`],
            ['Entregado y vendido (con IVA)', `${disUnidades(Number(totales.entregado) + Number(totales.vendido))} · ${distDinero(totales.valor_vendido)}`],
            ['Devuelto por los pilotos', `${disUnidades(Number(totales.devuelto_bueno) + Number(totales.devuelto_danado))} (${distCantidad(totales.devuelto_danado)} dañadas)`],
            ['Faltante', `${disUnidades(totales.faltante)} · ${distDinero(totales.valor_faltante)}`, Number(totales.faltante) > 0 ? 'dis-texto-falta' : 'dis-texto-ok'],
            ['Sale de la bodega (vuelve a la tienda)', `${disUnidades(totales.salida)} · ${distDinero(totales.valor_salida)}`],
        ]);
    }

    // Ver el resumen guardado de una bodega cerrada (Historial)
    function verResumenBodega(b) {
        bodegaCierre = null;
        const r = b.resumen || {};
        $('#disCierreTitulo').textContent = `Bodega ${nombreRuta(b.ruta_id)} · ${disFecha(b.fecha)}`;
        $('#disCierreTexto').textContent = b.estado === 'cerrada'
            ? `Cerrada por ${b.cerrada_por_nombre || '—'} a las ${disHora(b.cerrada_en)} · ${plural(Number(r.pilotos || 0), 'piloto', 'pilotos')} · lista ${nombreLista(b.lista_id)}.${b.notas ? ` Notas: ${b.notas}` : ''}`
            : 'Todavía está abierta.';
        dibujarResumenBodega(r.lineas || [], r.totales || {});
        $('#disCierreNotasCaja').hidden = true;
        $('#disCierreSi').hidden = true;
        $('#disCierreError').textContent = '';
        dlgCierre.showModal();
    }

    $('#disCerrarBodega').addEventListener('click', () => {
        if (!bodega || bodega.estado !== 'abierta') return;
        bodegaCierre = bodega;
        const sinCerrar = resumenPilotos.filter((r) => !r.cierre).map((r) => nombrePiloto(r.id));
        // Cómo quedaría (la base lo vuelve a calcular al cerrar)
        const porPres = new Map();
        const de = (id) => {
            if (!porPres.has(id)) porPres.set(id, { descripcion: descPres(id), ingresado: 0, ajustes: 0, cargado: 0, entregado: 0, vendido: 0, devuelto_bueno: 0, devuelto_danado: 0, faltante: 0, salida: 0 });
            return porPres.get(id);
        };
        saldo.forEach((s) => Object.assign(de(s.presentacion_id), {
            ingresado: Number(s.ingresado), ajustes: Number(s.ajustes), cargado: Number(s.cargado),
            devuelto_bueno: Number(s.devuelto_bueno), devuelto_danado: Number(s.devuelto_danado), salida: Math.max(Number(s.en_bodega), 0),
        }));
        resumenPilotos.forEach((r) => r.lineas.forEach((l) => {
            const x = de(l.presentacion_id);
            x.entregado += Number(l.entregado);
            x.vendido += Number(l.vendido);
            x.faltante += Number(l.en_mano);
        }));
        const lineas = [...porPres.values()].sort((a, b) => a.descripcion.localeCompare(b.descripcion));
        const suma = (k) => lineas.reduce((s, l) => s + Number(l[k]), 0);
        const valor = (k) => [...porPres.entries()].reduce((s, [id, l]) => s + Number(l[k]) * valorBodega(id), 0);
        let valorVendido = 0;
        resumenPilotos.forEach((r) => r.lineas.forEach((l) => { valorVendido += Number(l.valor_entregado) + Number(l.valor_vendido); }));
        dibujarResumenBodega(lineas, {
            ingresado: suma('ingresado'), ajustes: suma('ajustes'), entregado: suma('entregado'), vendido: suma('vendido'),
            devuelto_bueno: suma('devuelto_bueno'), devuelto_danado: suma('devuelto_danado'), faltante: suma('faltante'), salida: suma('salida'),
            valor_ingresado: valor('ingresado'), valor_vendido: valorVendido, valor_faltante: valor('faltante'), valor_salida: valor('salida'),
        });
        $('#disCierreTitulo').textContent = `Cerrar la bodega ${nombreRuta(bodega.ruta_id)} · ${disFecha(bodega.fecha)}`;
        $('#disCierreTexto').textContent = sinCerrar.length
            ? `Primero cierra la mercadería de: ${sinCerrar.join(', ')}.`
            : 'Lo que queda sale de la bodega (vuelve a la tienda) y la bodega queda en 0. Se guarda el resumen del día; ya no se podrá mover.';
        $('#disCierreNotasCaja').hidden = false;
        $('#disCierreNotas').value = '';
        $('#disCierreSi').hidden = false;
        $('#disCierreSi').disabled = sinCerrar.length > 0;
        $('#disCierreError').textContent = '';
        dlgCierre.showModal();
    });

    $('#disCierreVolver').addEventListener('click', () => dlgCierre.close());
    $('#disCierreForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!bodegaCierre) return;
        const boton = $('#disCierreSi');
        boton.disabled = true;
        const { data, error } = await db.rpc('dist_cerrar_bodega', {
            p: { usuario_id: sesion.id || null, bodega_id: bodegaCierre.id, notas: $('#disCierreNotas').value.trim() || null },
        });
        boton.disabled = false;
        if (error) {
            console.error('Error al cerrar la bodega:', error);
            $('#disCierreError').textContent = textoError(error, 'cerrar la bodega');
            return;
        }
        dlgCierre.close();
        const t = (data.resumen || {}).totales || {};
        aviso.mostrar(`Bodega cerrada: ${disUnidades(Number(t.entregado || 0) + Number(t.vendido || 0))} entregadas o vendidas, `
            + `${distCantidad(t.salida)} vuelven a la tienda${Number(t.faltante) > 0 ? `, faltante de ${distCantidad(t.faltante)} (${distDinero(t.valor_faltante)})` : ''}.`);
        cargarBodega();
    });

    // ==================================================
    // MI CARGA (piloto)
    // ==================================================

    const selCargaBodega = $('#disCargaBodega');
    let misBodegas = [];
    let miBodega = null;
    let miResumen = [];

    async function cargarCarga() {
        const yo = sesion.id || 0;
        const [mov, cie] = await Promise.all([
            db.from('bodega_movimientos').select('bodega_id').or(`piloto_id.eq.${yo},piloto_destino_id.eq.${yo}`).in('tipo', ['carga', 'traspaso']),
            db.from('cierres_mercaderia').select('*').eq('piloto_id', yo).order('cerrado_en', { ascending: false }).limit(30),
        ]);
        if (!activa) return;
        if (mov.error || cie.error) {
            console.error('Error al cargar tu carga:', mov.error || cie.error);
            aviso.mostrar(textoError(mov.error || cie.error, 'cargar tu carga'), 'error');
            return;
        }
        dibujarMisCierres(cie.data);
        const cerradas = new Set(cie.data.map((c) => c.bodega_id));
        const ids = [...new Set(mov.data.map((m) => m.bodega_id))].filter((id) => !cerradas.has(id));
        misBodegas = [];
        if (ids.length) {
            const { data } = await db.from('bodegas_dia').select('*').in('id', ids).eq('estado', 'abierta').order('fecha', { ascending: false });
            misBodegas = data || [];
        }
        $('#disSinCarga').hidden = misBodegas.length > 0;
        $('#disCargaCaja').hidden = !misBodegas.length;
        if (!misBodegas.length) return;
        const actual = Number(selCargaBodega.value);
        selCargaBodega.replaceChildren(...misBodegas.map((b) => new Option(`${nombreRuta(b.ruta_id)} · ${disFecha(b.fecha)}`, b.id)));
        selCargaBodega.hidden = misBodegas.length < 2;
        if (misBodegas.some((b) => b.id === actual)) selCargaBodega.value = String(actual);
        await elegirMiBodega();
    }

    async function elegirMiBodega() {
        miBodega = misBodegas.find((b) => b.id === Number(selCargaBodega.value)) || misBodegas[0];
        $('#disCargaTitulo').textContent = `${nombreRuta(miBodega.ruta_id)} · ${disFecha(miBodega.fecha)}`;
        $('#disCargaDetalle').textContent = `${nombreTienda(miBodega.tienda_id)} · lista ${nombreLista(miBodega.lista_id)}`;
        const yo = sesion.id || 0;
        const [res, ped] = await Promise.all([
            db.rpc('dist_piloto_resumen', { p_bodega: miBodega.id, p_piloto: yo }),
            db.from('pedidos').select('id, codigo, cliente_nombre, estado, total_cobrar, detalle')
                .eq('piloto_id', yo).eq('fecha_entrega', miBodega.fecha).eq('anulado', false).order('id'),
        ]);
        if (!activa) return;
        miResumen = res.data || [];
        const cuerpo = $('#disCargaLineas');
        cuerpo.replaceChildren();
        if (!miResumen.length) cuerpo.appendChild(crearFilaVacia('Sin carga.', 6));
        miResumen.forEach((l) => {
            const tr = document.createElement('tr');
            tr.append(crearCelda(descPres(l.presentacion_id)), celdaNum(Number(l.cargado) + Number(l.recibido) - Number(l.enviado)),
                celdaNum(l.entregado), celdaNum(l.vendido), celdaNum(Number(l.devuelto_bueno) + Number(l.devuelto_danado)), celdaNum(l.en_mano));
            cuerpo.appendChild(tr);
        });
        $('#disVender').disabled = !miResumen.some((l) => Number(l.en_mano) > 0);

        const cuerpoP = $('#disCargaPedidos');
        cuerpoP.replaceChildren();
        const lista = (ped.data || []).filter((p) => p.detalle && (p.detalle.productos || p.detalle.venta_ruta));
        if (!lista.length) cuerpoP.appendChild(crearFilaVacia('Sin pedidos con productos ese día.', 4));
        lista.forEach((p) => {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            const a = document.createElement('a');
            a.href = `#pedidos?id=${p.id}`;
            a.className = 'texto-codigo';
            a.textContent = p.codigo;
            td.appendChild(a);
            if (p.detalle.venta_ruta) td.append(' ', etiqueta('Venta en ruta', 'etiqueta-morada'));
            tr.append(td, crearCelda(p.cliente_nombre), crearCelda(DIS_ESTADOS[p.estado] || p.estado), crearCelda(distDinero(p.total_cobrar), 'dist-num'));
            cuerpoP.appendChild(tr);
        });
    }

    selCargaBodega.addEventListener('change', elegirMiBodega);

    function dibujarMisCierres(lista) {
        const cuerpo = $('#disMisCierres');
        cuerpo.replaceChildren();
        if (!lista.length) cuerpo.appendChild(crearFilaVacia('Todavía no tienes cierres.', 8));
        lista.forEach((c) => {
            const tr = document.createElement('tr');
            const falta = Number(c.unidades_faltantes) > 0;
            tr.append(crearCelda(disFecha(c.fecha)), crearCelda(nombreRuta(c.ruta_id)), celdaNum(c.unidades_cargadas), celdaNum(c.unidades_entregadas),
                celdaNum(c.unidades_vendidas), celdaNum(c.unidades_devueltas), celdaNum(c.unidades_faltantes, falta ? 'dis-texto-falta' : ''),
                crearCelda(distDinero(c.valor_faltante), `dist-num${falta ? ' dis-texto-falta' : ''}`));
            cuerpo.appendChild(tr);
        });
    }

    // ---------- Venta en ruta ----------
    const dlgVenta = $('#disVentaDialogo');
    let selectorVenta = null;

    $('#disVender').addEventListener('click', async () => {
        if (!miBodega) return;
        await recargarCatalogo(); // precios al día
        const selLista = $('#disVentaLista');
        selLista.replaceChildren(...cat.listas.filter((l) => l.activa).map((l) => new Option(`${l.nombre}${l.general ? ' (general)' : ''}`, l.id)));
        selLista.value = String(miBodega.lista_id || distListaDeTienda(cat, miBodega.tienda_id) || '');
        const disponibles = new Map(miResumen.map((l) => [l.presentacion_id, Number(l.en_mano)]));
        selectorVenta = crearSelectorProductos($('#disVentaProductos'), { catalogo: cat, listaId: Number(selLista.value) || null, disponibles });
        ['#disVentaCliente', '#disVentaTelefono', '#disVentaDireccion', '#disVentaNota'].forEach((s) => { $(s).value = ''; });
        zona.querySelector('input[name="disVentaCobro"][value="efectivo"]').checked = true;
        $('#disVentaError').textContent = '';
        dlgVenta.showModal();
    });

    $('#disVentaLista').addEventListener('change', () => { if (selectorVenta) selectorVenta.cambiarLista(Number($('#disVentaLista').value) || null); });
    $('#disVentaCancelar').addEventListener('click', () => dlgVenta.close());

    $('#disVentaForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const error = $('#disVentaError');
        error.textContent = '';
        const lineas = selectorVenta ? selectorVenta.lineas() : [];
        if (!lineas.length) { error.textContent = 'Agrega al menos un producto.'; return; }
        const pasada = selectorVenta.revisar();
        if (pasada) { error.textContent = pasada; return; }
        const malTelefono = validarDato('telefono', $('#disVentaTelefono').value); // formato de Costa Rica (js/componentes.js)
        if (malTelefono) { error.textContent = malTelefono; $('#disVentaTelefono').focus(); return; }
        const forma = (zona.querySelector('input[name="disVentaCobro"]:checked') || {}).value;
        const boton = $('#disVentaGuardar');
        boton.disabled = true;
        const { data, error: err } = await db.rpc('dist_venta_ruta', {
            p: {
                usuario_id: sesion.id || null, cliente_nombre: $('#disVentaCliente').value.trim() || null,
                cliente_telefono: datoConFormato('telefono', $('#disVentaTelefono').value), direccion: $('#disVentaDireccion').value.trim() || null,
                lista_id: Number($('#disVentaLista').value) || null, cobro_forma: forma, nota: $('#disVentaNota').value.trim() || null,
                lineas: lineas.map((l) => ({ presentacion_id: l.presentacion_id, cantidad: l.cantidad })),
            },
        });
        boton.disabled = false;
        if (err) {
            console.error('Error al registrar la venta:', err);
            error.textContent = textoError(err, 'registrar la venta');
            return;
        }
        dlgVenta.close();
        aviso.mostrar(`Venta ${data.codigo} registrada: ${distDinero(data.total)} (${DIST_FORMAS[forma]}).`);
        elegirMiBodega();
    });

    // ==================================================
    // PRODUCTOS Y PRECIOS
    // ==================================================

    const selProdLista = $('#disProdLista');
    const cambiosPrecio = new Map(); // presentacion_id -> { precio, iva_pct }

    async function cargarProductos() {
        if (!(await recargarCatalogo())) return;
        zona.querySelectorAll('[data-solo-catalogo]').forEach((el) => { el.hidden = !puedeCatalogo; });
        const actual = selProdLista.value;
        selProdLista.replaceChildren(...cat.listas.map((l) => new Option(`${l.nombre}${l.general ? ' (general)' : ''}${l.activa ? '' : ' · inactiva'}`, l.id)));
        if (!cat.listas.length) selProdLista.appendChild(new Option('Sin listas de precios', ''));
        selProdLista.value = cat.listas.some((l) => String(l.id) === actual) ? actual : String(cat.general || (cat.listas[0] || {}).id || '');
        cambiosPrecio.clear();
        dibujarProductos();
        dibujarListas();
        dibujarTiendasListas();
        dibujarMotivos();
    }

    function dibujarProductos() {
        const lista = Number(selProdLista.value) || null;
        const filtro = $('#disProdBuscar').value;
        const cuerpo = $('#disProductos');
        cuerpo.replaceChildren();
        const productos = cat.productos.filter((p) => coincideBusqueda([p.nombre, p.codigo, p.categoria,
            ...cat.presentaciones.filter((x) => x.producto_id === p.id).map((x) => `${x.nombre} ${x.codigo_barras || ''}`)], filtro));
        if (!productos.length) {
            cuerpo.appendChild(crearFilaVacia(cat.productos.length ? 'Ningún producto coincide.' : 'Todavía no hay productos: usa "Nuevo producto".', 8));
        }
        productos.forEach((p) => {
            const suyas = cat.presentaciones.filter((x) => x.producto_id === p.id);
            const grupo = crearFilaGrupo(p.nombre, p.codigo || null, [p.categoria, p.activo ? null : 'inactivo', plural(suyas.length, 'presentación', 'presentaciones')].filter(Boolean).join(' · '), 8);
            if (puedeCatalogo) {
                const acciones = document.createElement('span');
                acciones.className = 'dis-grupo-acciones';
                const nueva = crearBotonIcono('editar', p.id, 'bi-plus-lg', `Nueva presentación de ${p.nombre}`);
                nueva.dataset.accion = 'nueva-pres';
                const editar = crearBotonIcono('editar', p.id, 'bi-pencil', `Modificar ${p.nombre}`);
                editar.dataset.accion = 'editar-prod';
                const borrar = crearBotonIcono('eliminar', p.id, 'bi-trash', `Eliminar ${p.nombre}`);
                borrar.dataset.accion = 'borrar-prod';
                acciones.append(nueva, editar, borrar);
                grupo.querySelector('th').appendChild(acciones);
            }
            cuerpo.appendChild(grupo);
            if (!suyas.length) cuerpo.appendChild(crearFilaVacia('Sin presentaciones: agrega una con el botón +.', 8));
            suyas.forEach((x) => {
                const guardado = lista ? cat.precios.get(`${lista}:${x.id}`) : null;
                const cambio = cambiosPrecio.get(x.id);
                const precio = cambio ? cambio.precio : guardado ? Number(guardado.precio) : '';
                const iva = cambio ? cambio.iva_pct : guardado ? Number(guardado.iva_pct) : DIST_IVA;
                const tr = document.createElement('tr');
                tr.dataset.pres = x.id;
                if (cambio) tr.classList.add('dis-cambiado');
                if (!x.activa || !p.activo) tr.classList.add('dis-inactivo');
                const tdPrecio = document.createElement('td');
                tdPrecio.className = 'dist-num';
                const tdIva = document.createElement('td');
                tdIva.className = 'dist-num';
                if (puedeCatalogo && lista) {
                    const inPrecio = document.createElement('input');
                    inPrecio.type = 'number';
                    inPrecio.min = '0';
                    inPrecio.step = '0.01';
                    inPrecio.inputMode = 'decimal';
                    inPrecio.className = 'campo-input dist-cantidad';
                    inPrecio.value = precio;
                    inPrecio.placeholder = 'Sin precio';
                    inPrecio.dataset.campo = 'precio';
                    inPrecio.setAttribute('aria-label', `Precio sin IVA de ${distDescripcion(x)}`);
                    const inIva = document.createElement('input');
                    inIva.type = 'number';
                    inIva.min = '0';
                    inIva.max = '100';
                    inIva.step = '0.01';
                    inIva.inputMode = 'decimal';
                    inIva.className = 'campo-input dist-cantidad';
                    inIva.value = iva;
                    inIva.dataset.campo = 'iva';
                    inIva.setAttribute('aria-label', `IVA de ${distDescripcion(x)}`);
                    tdPrecio.appendChild(inPrecio);
                    tdIva.appendChild(inIva);
                } else {
                    tdPrecio.textContent = precio === '' ? 'Sin precio' : distDinero(precio);
                    tdIva.textContent = `${distCantidad(iva)} %`;
                }
                const acciones = puedeCatalogo ? crearCeldaAcciones(
                    crearBotonIcono('editar', x.id, 'bi-pencil', `Modificar ${x.nombre}`),
                    crearBotonIcono('eliminar', x.id, 'bi-trash', `Eliminar ${x.nombre}`),
                ) : crearCelda('');
                if (puedeCatalogo) {
                    acciones.querySelector('[data-accion="editar"]').dataset.accion = 'editar-pres';
                    acciones.querySelector('[data-accion="eliminar"]').dataset.accion = 'borrar-pres';
                }
                tr.append(crearCelda(x.nombre), crearCelda(distCantidad(x.unidades), 'dist-num'), crearCelda(x.codigo_barras), tdPrecio, tdIva,
                    crearCelda(precio === '' ? '—' : distDinero(distConIva(precio, iva)), 'dist-num'),
                    x.activa ? crearCeldaEtiqueta('Activa', 'etiqueta-verde') : crearCeldaEtiqueta('Inactiva', 'etiqueta-gris'), acciones);
                cuerpo.appendChild(tr);
            });
        });
        actualizarCambios();
    }

    function actualizarCambios() {
        const n = cambiosPrecio.size;
        $('#disPreciosCambios').textContent = n ? `${plural(n, 'precio cambiado', 'precios cambiados')} sin guardar` : '';
        $('#disGuardarPrecios').disabled = !n;
    }

    // Escribir un precio o un IVA: se marca la fila y se recalcula el precio con IVA
    $('#disProductos').addEventListener('input', (e) => {
        const inp = e.target.closest('input[data-campo]');
        if (!inp) return;
        const tr = inp.closest('tr');
        const id = Number(tr.dataset.pres);
        const precio = tr.querySelector('input[data-campo="precio"]').value;
        const iva = tr.querySelector('input[data-campo="iva"]').value;
        cambiosPrecio.set(id, { precio: precio === '' ? '' : distRedondo(precio), iva_pct: iva === '' ? DIST_IVA : distRedondo(iva) });
        tr.classList.add('dis-cambiado');
        tr.cells[5].textContent = precio === '' ? '—' : distDinero(distConIva(precio, iva === '' ? DIST_IVA : iva));
        actualizarCambios();
    });

    $('#disProductos').addEventListener('click', async (e) => {
        const b = e.target.closest('button[data-accion]');
        if (!b || !puedeCatalogo) return;
        const id = Number(b.dataset.id);
        if (b.dataset.accion === 'nueva-pres') editarPresentacion(null, id);
        if (b.dataset.accion === 'editar-prod') editarProducto(cat.productos.find((p) => p.id === id));
        if (b.dataset.accion === 'editar-pres') editarPresentacion(cat.presentaciones.find((x) => x.id === id));
        if (b.dataset.accion === 'borrar-prod') borrar('productos', id, `el producto "${(cat.productos.find((p) => p.id === id) || {}).nombre}" con sus presentaciones y precios`);
        if (b.dataset.accion === 'borrar-pres') borrar('producto_presentaciones', id, `la presentación "${descPres(id)}" y sus precios`);
    });

    let listaAnterior = null;
    selProdLista.addEventListener('focus', () => { listaAnterior = selProdLista.value; });
    selProdLista.addEventListener('change', () => {
        if (cambiosPrecio.size && !confirm('Hay precios sin guardar en la lista anterior. ¿Descartarlos?')) {
            selProdLista.value = listaAnterior;
            return;
        }
        cambiosPrecio.clear();
        dibujarProductos();
    });
    $('#disProdBuscar').addEventListener('input', dibujarProductos);

    $('#disGuardarPrecios').addEventListener('click', async () => {
        const lista = Number(selProdLista.value);
        if (!lista || !cambiosPrecio.size) return;
        const filas = [...cambiosPrecio.entries()].filter(([, c]) => c.precio !== '');
        const malo = filas.find(([, c]) => !(c.precio >= 0) || !(c.iva_pct >= 0 && c.iva_pct <= 100));
        if (malo) { aviso.mostrar(`Revisa el precio de ${descPres(malo[0])}: 0 o más, IVA de 0 a 100.`, 'error'); return; }
        const sinPrecio = [...cambiosPrecio.entries()].filter(([, c]) => c.precio === '').map(([id]) => id);
        const boton = $('#disGuardarPrecios');
        boton.disabled = true;
        const ahora = new Date().toISOString();
        const [up, del] = await Promise.all([
            filas.length ? db.from('precios').upsert(filas.map(([id, c]) => ({
                lista_id: lista, presentacion_id: id, precio: c.precio, iva_pct: c.iva_pct, actualizado_en: ahora, actualizado_por: sesion.id || null,
            })), { onConflict: 'lista_id,presentacion_id' }) : Promise.resolve({ error: null }),
            // Precio borrado: se quita de la lista (usará el de la lista general)
            sinPrecio.length ? db.from('precios').delete().eq('lista_id', lista).in('presentacion_id', sinPrecio) : Promise.resolve({ error: null }),
        ]);
        boton.disabled = false;
        if (up.error || del.error) {
            console.error('Error al guardar los precios:', up.error || del.error);
            aviso.mostrar(textoError(up.error || del.error, 'guardar los precios'), 'error');
            return;
        }
        aviso.mostrar(`${plural(cambiosPrecio.size, 'precio guardado', 'precios guardados')} en la lista ${nombreLista(lista)}.`);
        cargarProductos();
    });

    // ---------- Formulario corto (producto, presentación, lista, motivo) ----------
    // campos: [{ nombre, etiqueta, tipo: 'texto' | 'numero' | 'si_no', requerido, min, max, paso, ayuda, valor }]
    // guardar(valores) -> texto de error o null (la ventana queda abierta si hay error)
    const dlgForm = $('#disFormDialogo');
    let guardarForm = null;

    function pedirDatos({ titulo, campos, guardar, boton = 'Guardar' }) {
        $('#disFormTitulo').textContent = titulo;
        $('#disFormGuardar').textContent = boton;
        $('#disFormError').textContent = '';
        const caja = $('#disFormCampos');
        caja.replaceChildren();
        campos.forEach((c) => {
            const div = document.createElement('div');
            div.className = 'campo';
            const id = `disF_${c.nombre}`;
            if (c.tipo === 'si_no') {
                const label = document.createElement('label');
                label.className = 'dis-si-no';
                const ch = document.createElement('input');
                ch.type = 'checkbox';
                ch.id = id;
                ch.dataset.f = c.nombre;
                ch.checked = !!c.valor;
                label.append(ch, ` ${c.etiqueta}`);
                div.appendChild(label);
            } else {
                const label = document.createElement('label');
                label.className = 'campo-etiqueta';
                label.htmlFor = id;
                label.textContent = `${c.etiqueta}${c.requerido ? ' *' : ''}`;
                const inp = document.createElement('input');
                inp.id = id;
                inp.dataset.f = c.nombre;
                inp.className = 'campo-input';
                inp.autocomplete = 'off';
                if (c.tipo === 'numero') {
                    inp.type = 'number';
                    inp.step = c.paso || 'any';
                    inp.inputMode = 'decimal';
                    if (c.min != null) inp.min = c.min;
                    if (c.max != null) inp.max = c.max;
                } else {
                    inp.type = 'text';
                    inp.maxLength = c.largo || 120;
                }
                inp.value = c.valor == null ? '' : c.valor;
                div.append(label, inp);
            }
            if (c.ayuda) {
                const s = document.createElement('small');
                s.className = 'campo-ayuda';
                s.textContent = c.ayuda;
                div.appendChild(s);
            }
            caja.appendChild(div);
        });
        guardarForm = async () => {
            const valores = {};
            for (const c of campos) {
                const el = caja.querySelector(`[data-f="${c.nombre}"]`);
                if (c.tipo === 'si_no') { valores[c.nombre] = el.checked; continue; }
                const texto = el.value.trim();
                if (c.requerido && texto === '') return `Completa "${c.etiqueta}".`;
                if (c.tipo === 'numero' && texto !== '') {
                    const n = Number(texto);
                    if (!Number.isFinite(n)) return `"${c.etiqueta}" debe ser un número.`;
                    if (c.min != null && n < c.min) return `"${c.etiqueta}" no puede ser menor que ${c.min}.`;
                    if (c.max != null && n > c.max) return `"${c.etiqueta}" no puede ser mayor que ${c.max}.`;
                    valores[c.nombre] = n;
                } else {
                    valores[c.nombre] = texto === '' ? null : texto;
                }
            }
            return guardar(valores);
        };
        dlgForm.showModal();
        const primero = caja.querySelector('input:not([type="checkbox"])');
        if (primero) primero.focus();
    }

    $('#disFormCancelar').addEventListener('click', () => dlgForm.close());
    $('#disForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!guardarForm) return;
        const boton = $('#disFormGuardar');
        boton.disabled = true;
        const error = await guardarForm();
        boton.disabled = false;
        if (error) { $('#disFormError').textContent = error; return; }
        dlgForm.close();
    });

    const textoGuardar = (err, duplicado) => (err.code === '23505' ? duplicado : textoError(err, 'guardar'));

    function editarProducto(p) {
        pedirDatos({
            titulo: p ? `Modificar: ${p.nombre}` : 'Nuevo producto',
            campos: [
                { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, valor: p ? p.nombre : '', ayuda: 'Ej. Leche entera, Arroz 99 % grano entero' },
                { nombre: 'codigo', etiqueta: 'Código (opcional)', valor: p ? p.codigo : '' },
                { nombre: 'categoria', etiqueta: 'Categoría (opcional)', valor: p ? p.categoria : '', ayuda: 'Ej. Lácteos, Bebidas, Granos' },
                { nombre: 'activo', etiqueta: 'Activo (se puede pedir y cargar)', tipo: 'si_no', valor: p ? p.activo : true },
            ],
            guardar: async (v) => {
                const datos = { nombre: v.nombre, codigo: v.codigo, categoria: v.categoria, activo: v.activo };
                const r = p ? await db.from('productos').update(datos).eq('id', p.id).select('id').single()
                    : await db.from('productos').insert(datos).select('id').single();
                if (r.error) { console.error('Error al guardar el producto:', r.error); return textoGuardar(r.error, 'Ya existe un producto con ese nombre.'); }
                aviso.mostrar(p ? `Producto "${v.nombre}" actualizado.` : `Producto "${v.nombre}" creado. Agrégale su presentación y su precio.`);
                await cargarProductos();
                if (!p) setTimeout(() => editarPresentacion(null, r.data.id), 0);
                return null;
            },
        });
    }

    function editarPresentacion(x, productoId = null) {
        const producto = cat.productos.find((p) => p.id === (x ? x.producto_id : productoId)) || {};
        const lista = Number(selProdLista.value) || null;
        const campos = [
            { nombre: 'nombre', etiqueta: 'Presentación', requerido: true, valor: x ? x.nombre : (cat.presentaciones.some((y) => y.producto_id === producto.id) ? '' : 'Unidad'), ayuda: 'Ej. Unidad, Caja 12 x 1 L, Paca 6' },
            { nombre: 'unidades', etiqueta: 'Unidades que trae', tipo: 'numero', requerido: true, min: 0.01, valor: x ? Number(x.unidades) : 1 },
            { nombre: 'codigo_barras', etiqueta: 'Código de barras (opcional)', valor: x ? x.codigo_barras : '' },
            { nombre: 'activa', etiqueta: 'Activa', tipo: 'si_no', valor: x ? x.activa : true },
        ];
        if (!x && lista) {
            campos.push({ nombre: 'precio', etiqueta: `Precio sin IVA en "${nombreLista(lista)}" (₡)`, tipo: 'numero', min: 0, paso: '0.01' });
            campos.push({ nombre: 'iva', etiqueta: 'IVA %', tipo: 'numero', min: 0, max: 100, paso: '0.01', valor: DIST_IVA });
        }
        pedirDatos({
            titulo: x ? `Modificar: ${distDescripcion(x)}` : `Nueva presentación de ${producto.nombre}`,
            campos,
            guardar: async (v) => {
                const datos = { nombre: v.nombre, unidades: v.unidades, codigo_barras: v.codigo_barras, activa: v.activa };
                const r = x ? await db.from('producto_presentaciones').update(datos).eq('id', x.id).select('id').single()
                    : await db.from('producto_presentaciones').insert({ ...datos, producto_id: producto.id }).select('id').single();
                if (r.error) { console.error('Error al guardar la presentación:', r.error); return textoGuardar(r.error, 'Ese producto ya tiene una presentación con ese nombre.'); }
                if (!x && lista && v.precio != null) {
                    const pr = await db.from('precios').insert({ lista_id: lista, presentacion_id: r.data.id, precio: v.precio, iva_pct: v.iva == null ? DIST_IVA : v.iva, actualizado_por: sesion.id || null });
                    if (pr.error) console.error('Error al guardar el precio:', pr.error);
                }
                aviso.mostrar(x ? `Presentación "${v.nombre}" actualizada.` : `Presentación "${v.nombre}" creada.`);
                await cargarProductos();
                return null;
            },
        });
    }

    // Eliminar: si ya se usó en bodegas o pedidos, la base no deja (se desactiva)
    async function borrar(tabla, id, texto) {
        if (!confirm(`¿Eliminar ${texto}? No se puede deshacer.`)) return;
        const { error } = await db.from(tabla).delete().eq('id', id);
        if (error) {
            console.error('Error al eliminar:', error);
            aviso.mostrar(error.code === '23503' ? 'Ya se usó en bodegas o pedidos: desactívalo en vez de eliminarlo.' : textoError(error, 'eliminar'), 'error');
            return;
        }
        aviso.mostrar('Eliminado.');
        cargarProductos();
    }

    $('#disProdNuevo').addEventListener('click', () => { if (puedeCatalogo) editarProducto(null); });

    // ---------- Listas de precios ----------
    function dibujarListas() {
        const cuerpo = $('#disListas');
        cuerpo.replaceChildren();
        if (!cat.listas.length) cuerpo.appendChild(crearFilaVacia('Sin listas: crea la primera (será la general).', 4));
        cat.listas.forEach((l) => {
            const tr = document.createElement('tr');
            const td = crearCelda(l.nombre);
            if (l.general) td.append(' ', etiqueta('General', 'etiqueta-azul'));
            const usan = cat.tiendas.filter((t) => t.lista_precios_id === l.id).length;
            tr.append(td, crearCelda(l.general ? `${usan} + las que no eligieron` : String(usan)),
                l.activa ? crearCeldaEtiqueta('Activa', 'etiqueta-verde') : crearCeldaEtiqueta('Inactiva', 'etiqueta-gris'),
                puedeCatalogo ? crearCeldaAcciones(crearBotonIcono('editar', l.id, 'bi-pencil', `Modificar ${l.nombre}`),
                    crearBotonIcono('eliminar', l.id, 'bi-trash', `Eliminar ${l.nombre}`)) : crearCelda(''));
            cuerpo.appendChild(tr);
        });
    }

    function editarLista(l) {
        pedirDatos({
            titulo: l ? `Modificar: ${l.nombre}` : 'Nueva lista de precios',
            campos: [
                { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, valor: l ? l.nombre : '', ayuda: 'Ej. General, Zona Norte, Mayorista' },
                { nombre: 'general', etiqueta: 'Es la lista general', tipo: 'si_no', valor: l ? l.general : !cat.listas.length },
                { nombre: 'activa', etiqueta: 'Activa', tipo: 'si_no', valor: l ? l.activa : true },
            ],
            guardar: async (v) => {
                // Solo una general por empresa: primero se le quita a la otra
                if (v.general) {
                    const q = db.from('listas_precios').update({ general: false }).eq('general', true);
                    const r0 = l ? await q.neq('id', l.id) : await q;
                    if (r0.error) { console.error('Error al cambiar la lista general:', r0.error); return textoError(r0.error, 'guardar'); }
                }
                const datos = { nombre: v.nombre, general: v.general, activa: v.activa };
                const r = l ? await db.from('listas_precios').update(datos).eq('id', l.id) : await db.from('listas_precios').insert(datos);
                if (r.error) { console.error('Error al guardar la lista:', r.error); return textoGuardar(r.error, 'Ya existe una lista con ese nombre.'); }
                aviso.mostrar(l ? `Lista "${v.nombre}" actualizada.` : `Lista "${v.nombre}" creada.`);
                await cargarProductos();
                return null;
            },
        });
    }

    $('#disListaNueva').addEventListener('click', () => { if (puedeCatalogo) editarLista(null); });
    $('#disListas').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion]');
        if (!b || !puedeCatalogo) return;
        const l = cat.listas.find((x) => x.id === Number(b.dataset.id));
        if (b.dataset.accion === 'editar') editarLista(l);
        else borrar('listas_precios', l.id, `la lista "${l.nombre}" y todos sus precios`);
    });

    // ---------- Lista de cada tienda ----------
    function dibujarTiendasListas() {
        const cuerpo = $('#disTiendasListas');
        cuerpo.replaceChildren();
        if (!tiendas.length) cuerpo.appendChild(crearFilaVacia('Sin tiendas.', 2));
        tiendas.forEach((t) => {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            if (puedeCatalogo) {
                const sel = document.createElement('select');
                sel.className = 'campo-input';
                sel.dataset.tienda = t.id;
                sel.setAttribute('aria-label', `Lista de precios de ${t.nombre}`);
                sel.appendChild(new Option('La general', ''));
                cat.listas.filter((l) => l.activa).forEach((l) => sel.appendChild(new Option(l.nombre, l.id)));
                sel.value = t.lista_precios_id ? String(t.lista_precios_id) : '';
                td.appendChild(sel);
            } else {
                td.textContent = t.lista_precios_id ? nombreLista(t.lista_precios_id) : 'La general';
            }
            tr.append(crearCelda(`${t.codigo} · ${t.nombre}`), td);
            cuerpo.appendChild(tr);
        });
    }

    $('#disTiendasListas').addEventListener('change', async (e) => {
        const sel = e.target.closest('select[data-tienda]');
        if (!sel || !puedeCatalogo) return;
        const { error } = await db.from('tiendas').update({ lista_precios_id: Number(sel.value) || null }).eq('id', Number(sel.dataset.tienda));
        if (error) {
            console.error('Error al cambiar la lista de la tienda:', error);
            aviso.mostrar(textoError(error, 'cambiar la lista'), 'error');
            return;
        }
        aviso.mostrar('Lista de la tienda actualizada.');
        await recargarCatalogo();
        tiendas = cat.tiendas.filter((t) => tiendas.some((x) => x.id === t.id));
        dibujarListas();
    });

    // ---------- Motivos de entrega incompleta ----------
    function dibujarMotivos() {
        const cuerpo = $('#disMotivos');
        cuerpo.replaceChildren();
        if (!cat.motivos.length) cuerpo.appendChild(crearFilaVacia('Sin motivos: el piloto escribe el suyo.', 3));
        cat.motivos.forEach((m) => {
            const tr = document.createElement('tr');
            tr.append(crearCelda(m.nombre), m.activo ? crearCeldaEtiqueta('Activo', 'etiqueta-verde') : crearCeldaEtiqueta('Inactivo', 'etiqueta-gris'),
                puedeCatalogo ? crearCeldaAcciones(crearBotonIcono('editar', m.id, 'bi-pencil', `Modificar ${m.nombre}`),
                    crearBotonIcono('eliminar', m.id, 'bi-trash', `Eliminar ${m.nombre}`)) : crearCelda(''));
            cuerpo.appendChild(tr);
        });
    }

    function editarMotivo(m) {
        pedirDatos({
            titulo: m ? 'Modificar motivo' : 'Nuevo motivo',
            campos: [
                { nombre: 'nombre', etiqueta: 'Motivo', requerido: true, valor: m ? m.nombre : '', ayuda: 'Ej. Cliente no lo quiso, Producto dañado, Vencido, No alcanzó' },
                { nombre: 'orden', etiqueta: 'Orden', tipo: 'numero', min: 0, paso: '1', valor: m ? m.orden : cat.motivos.length + 1 },
                { nombre: 'activo', etiqueta: 'Activo', tipo: 'si_no', valor: m ? m.activo : true },
            ],
            guardar: async (v) => {
                const datos = { nombre: v.nombre, orden: Math.round(v.orden || 0), activo: v.activo };
                const r = m ? await db.from('motivos_entrega_parcial').update(datos).eq('id', m.id) : await db.from('motivos_entrega_parcial').insert(datos);
                if (r.error) { console.error('Error al guardar el motivo:', r.error); return textoGuardar(r.error, 'Ese motivo ya existe.'); }
                await cargarProductos();
                return null;
            },
        });
    }

    $('#disMotivoNuevo').addEventListener('click', () => { if (puedeCatalogo) editarMotivo(null); });
    $('#disMotivos').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion]');
        if (!b || !puedeCatalogo) return;
        const m = cat.motivos.find((x) => x.id === Number(b.dataset.id));
        if (b.dataset.accion === 'editar') editarMotivo(m);
        else borrar('motivos_entrega_parcial', m.id, `el motivo "${m.nombre}"`);
    });

    // ==================================================
    // HISTORIAL Y FALTANTES
    // ==================================================

    const hisDesde = $('#disHisDesde');
    const hisHasta = $('#disHisHasta');
    const hisRuta = $('#disHisRuta');
    let hisCierres = [];
    let hisBodegas = [];

    async function cargarHistorial() {
        if (!hisHasta.value) {
            const d = new Date();
            hisHasta.value = disFechaLocal(d);
            d.setDate(d.getDate() - 30);
            hisDesde.value = disFechaLocal(d);
        }
        if (hisRuta.options.length !== rutas.length + 1) {
            hisRuta.replaceChildren(new Option('Todas las rutas', ''), ...rutas.map((r) => new Option(`${r.nombre} · ${nombreTienda(r.tienda_id)}`, r.id)));
        }
        $('#disHisExportar').hidden = typeof funcionHabilitada === 'function' && !funcionHabilitada('exportar');
        const rutaId = Number(hisRuta.value) || null;
        let qB = db.from('bodegas_dia').select('*').gte('fecha', hisDesde.value).lte('fecha', hisHasta.value).order('fecha', { ascending: false });
        let qC = db.from('cierres_mercaderia').select('*').gte('fecha', hisDesde.value).lte('fecha', hisHasta.value).order('fecha', { ascending: false });
        if (rutaId) { qB = qB.eq('ruta_id', rutaId); qC = qC.eq('ruta_id', rutaId); }
        const [b, c] = await Promise.all([qB, qC]);
        if (!activa) return;
        if (b.error || c.error) {
            console.error('Error al cargar el historial:', b.error || c.error);
            aviso.mostrar(textoError(b.error || c.error, 'cargar el historial'), 'error');
            return;
        }
        hisBodegas = b.data.filter((x) => enAlcance(x.tienda_id));
        hisCierres = c.data.filter((x) => enAlcance(x.tienda_id));
        dibujarHistorial();
    }

    [hisDesde, hisHasta, hisRuta].forEach((el) => el.addEventListener('change', cargarHistorial));

    function dibujarHistorial() {
        const conFaltante = hisCierres.filter((c) => Number(c.unidades_faltantes) > 0);
        const suma = (lista, k) => lista.reduce((s, x) => s + Number(x[k] || 0), 0);
        $('#disHisBodegas').textContent = String(hisBodegas.length);
        $('#disHisVendido').textContent = distDinero(suma(hisCierres, 'valor_entregado') + suma(hisCierres, 'valor_vendido'));
        $('#disHisFaltantes').textContent = String(conFaltante.length);
        $('#disHisValorFaltante').textContent = distDinero(suma(conFaltante, 'valor_faltante'));

        const cuerpoF = $('#disHisFaltantesTabla');
        cuerpoF.replaceChildren();
        if (!conFaltante.length) cuerpoF.appendChild(crearFilaVacia('Sin faltantes en esas fechas.', 7));
        conFaltante.forEach((c) => {
            const tr = document.createElement('tr');
            const detalle = (c.lineas || []).filter((l) => Number(l.faltante) > 0).map((l) => `${l.descripcion}: ${distCantidad(l.faltante)}`).join('; ');
            tr.append(crearCelda(disFecha(c.fecha)), crearCelda(nombreRuta(c.ruta_id)), crearCelda(c.piloto_nombre), crearCelda(detalle),
                celdaNum(c.unidades_faltantes, 'dis-texto-falta'), crearCelda(distDinero(c.valor_faltante), 'dist-num dis-texto-falta'),
                crearCelda(c.cerrado_por_nombre));
            if (c.notas) tr.title = c.notas;
            cuerpoF.appendChild(tr);
        });

        const cuerpoC = $('#disHisCierres');
        cuerpoC.replaceChildren();
        if (!hisCierres.length) cuerpoC.appendChild(crearFilaVacia('Sin cierres en esas fechas.', 11));
        hisCierres.forEach((c) => {
            const tr = document.createElement('tr');
            const falta = Number(c.unidades_faltantes) > 0;
            tr.append(crearCelda(disFecha(c.fecha)), crearCelda(nombreRuta(c.ruta_id)), crearCelda(c.piloto_nombre), celdaNum(c.unidades_cargadas),
                celdaNum(c.unidades_entregadas), celdaNum(c.unidades_vendidas), celdaNum(c.unidades_devueltas),
                celdaNum(c.unidades_faltantes, falta ? 'dis-texto-falta' : ''), crearCelda(distDinero(c.valor_cargado), 'dist-num'),
                crearCelda(distDinero(Number(c.valor_entregado) + Number(c.valor_vendido)), 'dist-num'), crearCelda(distDinero(c.cobrado), 'dist-num'));
            cuerpoC.appendChild(tr);
        });

        const cuerpoB = $('#disHisBodegasTabla');
        cuerpoB.replaceChildren();
        if (!hisBodegas.length) cuerpoB.appendChild(crearFilaVacia('Sin bodegas en esas fechas.', 10));
        hisBodegas.forEach((b) => {
            const t = (b.resumen || {}).totales || null;
            const tr = document.createElement('tr');
            const n = (k) => (t ? celdaNum(t[k]) : crearCelda('—', 'dist-num'));
            const tdEstado = document.createElement('td');
            tdEstado.appendChild(b.estado === 'abierta' ? etiqueta('Abierta', 'etiqueta-verde') : etiqueta('Cerrada', 'etiqueta-gris'));
            tr.append(crearCelda(disFecha(b.fecha)), crearCelda(nombreRuta(b.ruta_id)), tdEstado,
                t ? celdaNum(Number(t.ingresado) + Number(t.ajustes || 0)) : crearCelda('—', 'dist-num'), n('cargado'),
                t ? celdaNum(Number(t.entregado) + Number(t.vendido)) : crearCelda('—', 'dist-num'),
                t ? celdaNum(Number(t.devuelto_bueno) + Number(t.devuelto_danado)) : crearCelda('—', 'dist-num'), n('salida'),
                t ? celdaNum(t.faltante, Number(t.faltante) > 0 ? 'dis-texto-falta' : '') : crearCelda('—', 'dist-num'),
                crearCeldaAcciones(crearBotonIcono('editar', b.id, 'bi-eye', 'Ver el resumen')));
            cuerpoB.appendChild(tr);
        });
    }

    $('#disHisBodegasTabla').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion]');
        if (!b) return;
        const bod = hisBodegas.find((x) => x.id === Number(b.dataset.id));
        if (!bod) return;
        if (bod.estado === 'abierta') {
            // Abierta: se abre en la pestaña Bodega del día
            const ruta = rutas.find((r) => r.id === bod.ruta_id);
            if (ruta) { selTienda.value = String(ruta.tienda_id); llenarRutas(); selRuta.value = String(ruta.id); }
            inputFecha.value = bod.fecha;
            zona.querySelector('#disPestanas .pestana[data-valor="bodega"]').click();
            return;
        }
        verResumenBodega(bod);
    });

    // Reporte de faltantes en CSV (una fila por producto faltante); se abre en Excel
    $('#disHisExportar').addEventListener('click', () => {
        const filas = [['Fecha', 'Ruta', 'Tienda', 'Piloto', 'Producto', 'Faltante', 'Valor por unidad (con IVA)', 'Valor faltante', 'Cerró', 'Notas']];
        hisCierres.filter((c) => Number(c.unidades_faltantes) > 0).forEach((c) => {
            (c.lineas || []).filter((l) => Number(l.faltante) > 0).forEach((l) => {
                filas.push([disFecha(c.fecha), nombreRuta(c.ruta_id), nombreTienda(c.tienda_id), c.piloto_nombre, l.descripcion,
                    String(l.faltante).replace('.', ','), String(l.valor_unidad).replace('.', ','),
                    String(distRedondo(Number(l.faltante) * Number(l.valor_unidad))).replace('.', ','), c.cerrado_por_nombre || '', c.notas || '']);
            });
        });
        if (filas.length === 1) { aviso.mostrar('No hay faltantes en esas fechas.', 'error'); return; }
        const csv = filas.map((f) => f.map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `faltantes-${hisDesde.value}-a-${hisHasta.value}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================

    (async () => {
        if (!(await cargarBase()) || !activa) return;
        if (puedeBodega) await llenarFiltrosBodega();
        mostrarPestana(pestanas.valor());
    })();

    return () => {
        activa = false;
        aviso.limpiar();
        [dlgMov, dlgCuadre, dlgCierre, dlgVenta, dlgForm].forEach((d) => { if (d.open) d.close(); });
    };
});
