/* ==================================================
   SECCIÓN: PEDIDOS - LÓGICA
   ACACHETE LOGISTICS

   Diseño: PROPUESTA-ESTRUCTURADA-V2.md, sección 31.
   Tablas: sql/00_instalacion_completa.sql, secciones 6 (configuración de pedidos), 7 (rutas) y 8 (pedidos).

   NOMBRES: en pantalla se dice "HORARIO"; en la base de datos se sigue
   llamando marca (marca_numero, marcas_del_dia...).

   RUTAS (sql/00, sección 7): cada tienda tiene sus rutas; el G2 asigna el o los pilotos
   de cada ruta por día o por semana (sección #rutas). Al registrar, el
   empleado elige la ruta y el piloto sale SOLO: el asignado a esa ruta ese
   día (si hay varios, el que tenga menos pedidos ese día).

   VISTAS (según la dirección, ver secciones/pedidos.html):
     #pedidos            -> LISTA: filtros (fecha, tienda, actividad, estado),
                            resumen por estado y búsqueda
     #pedidos?nuevo=1    -> REGISTRAR: el formulario cambia según la actividad:
                              Encomiendas        -> bultos (cantidad, tamaño de referencia, peso)
                              Entregas de tienda -> casillas de mercadería (abarrotes = conteo;
                                                    línea blanca / electrónica = artículos del
                                                    catálogo con su peso)
                            Calcula el envío con la tarifa (tienda > región > general),
                            el descuento (máx. 1), lo que cobra el piloto y el vuelto.
                            Mapa A -> B (js/mapa.js, gratis): A = tienda o recolección,
                            B = entrega; los km por calle se cobran si la tarifa tiene
                            precio por km (distancia_km + detalle.ruta con los puntos).
     #pedidos?id=15      -> DETALLE: datos, mercadería, cobro, entrega, línea de tiempo,
                            QR y acciones según el estado. (&qr=1 abre el QR al entrar)

   QUIÉN VE QUÉ (lo controla la página; la regla real llega en la Fase 7):
     - Administrador y Admin G1: todos los pedidos. Anulan pedidos.
     - Admin G2: pedidos de las tiendas de su región.
     - Admin G3 y Empleado: pedidos de su tienda.
     - Registran pedidos: todos menos el Piloto. El piloto sale de la ruta
       (solo G2 o superior pueden elegir otro a mano).
     - ASIGNAR piloto y REASIGNAR horario / fecha / ruta: SOLO G2 o superior.
       Admin G3 y Empleado solo pueden SOLICITAR la reasignación (le llega al
       G2 de la región por la campana; el G2 la aplica o la rechaza).
     - CANCELAR: Admin G3 o superior (el Empleado no).
     - "Salió a entregar", "Entregado" y "No entregado": SOLO el Piloto del
       pedido (desde aquí o, más adelante, desde su app).
     - Piloto: solo SUS pedidos asignados.

   REGLAS:
     - Un pedido NUNCA se borra: se cancela (con motivo) o se anula (Admin/G1).
     - Cada cambio queda en la línea de tiempo (tabla pedido_historial).
     - El número de pedido lo pone la base de datos (automático) o lo escribe
       el empleado (manual), según Configuración -> Pedidos.
     - El QR lleva solo un código seguro (token_qr), no datos personales.

   Estilos: css/secciones/pedidos.css + css/componentes.css
   ================================================== */

// Librería para dibujar el QR (se descarga solo al abrir un QR)
const PED_QR_LIBRERIA = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
// Lo que va dentro del QR: prefijo + token del pedido (la app del piloto lo lee)
const PED_QR_PREFIJO = 'ACACHETE-PEDIDO:';
// Código de país para WhatsApp cuando el teléfono tiene 8 dígitos (Costa Rica = 506)
const PED_CODIGO_PAIS = '506';
const PED_MONEDA = '₡'; // colón costarricense

// Estados: texto y color de su etiqueta (css/componentes.css)
const PED_ESTADOS = {
    registrado:           { texto: 'Registrado',               color: 'etiqueta-gris' },
    recibido_bodega:      { texto: 'En bodega',                color: 'etiqueta-morada' },
    asignado:             { texto: 'Asignado',                 color: 'etiqueta-azul' },
    en_ruta:              { texto: 'En ruta',                  color: 'etiqueta-turquesa' },
    entregado:            { texto: 'Entregado',                color: 'etiqueta-verde' },
    entregado_incidencia: { texto: 'Entregado con incidencia', color: 'etiqueta-naranja' },
    no_entregado:         { texto: 'No entregado',             color: 'etiqueta-rosada' },
    reprogramado:         { texto: 'Reprogramado',             color: 'etiqueta-azul' },
    devuelto:             { texto: 'Devuelto',                 color: 'etiqueta-rosada' },
    cancelado:            { texto: 'Cancelado',                color: 'etiqueta-gris' },
};

// Grupos del resumen (cuadros de arriba de la lista).
// uso: el cuadro solo aparece si la actividad de la pestaña lo usa (Configuración -> Actividades)
const PED_GRUPOS = [
    { id: 'pendientes',  texto: 'Pendientes',    color: 'resumen-gris',     estados: ['registrado', 'recibido_bodega', 'asignado', 'reprogramado'] },
    { id: 'bodega',      texto: 'En bodega',     color: 'resumen-azul',     estados: ['recibido_bodega'], uso: 'usa_bodega' },
    { id: 'ruta',        texto: 'En ruta',       color: 'resumen-turquesa', estados: ['en_ruta'] },
    { id: 'entregados',  texto: 'Entregados',    color: 'resumen-verde',    estados: ['entregado', 'entregado_incidencia'] },
    { id: 'problemas',   texto: 'No entregados', color: 'resumen-rosada',   estados: ['no_entregado', 'devuelto'] },
    { id: 'cancelados',  texto: 'Cancelados',    color: 'resumen-naranja',  estados: ['cancelado'] },
];

// Estados en los que el pedido todavía no salió (se puede asignar o cancelar)
const PED_ANTES_DE_SALIR = ['registrado', 'recibido_bodega', 'asignado', 'reprogramado'];

// Descarga la librería del QR una sola vez
let pedPromesaQr = null;
function cargarLibreriaQr() {
    if (!pedPromesaQr) {
        pedPromesaQr = new Promise((resolve, reject) => {
            if (window.qrcode) { resolve(); return; }
            const script = document.createElement('script');
            script.src = PED_QR_LIBRERIA;
            script.onload = () => resolve();
            script.onerror = () => { pedPromesaQr = null; script.remove(); reject(new Error('No se pudo descargar la librería del QR')); };
            document.head.appendChild(script);
        });
    }
    return pedPromesaQr;
}

registrarSeccion('pedidos', (zona) => {

    const $ = (selector) => zona.querySelector(selector);
    const aviso = crearAviso($('#pedAviso'), 5000); // js/componentes.js

    // ==================================================
    // PERMISOS (js/sesion.js)
    // ==================================================

    const sesion = obtenerSesion() || {};
    const esGeneral = esAdministrador() || esAdminG1();
    const regionG2 = esAdminG2() ? regionActual() : null;
    const esPiloto = rolActual() === 'piloto';
    const esEmpleado = rolActual() === 'empleado';
    const tiendaPropia = tiendaActual();            // G3, Empleado y Piloto
    const puedeGestionar = !esPiloto;               // registrar pedidos y ver su QR
    const puedeAsignar = esGeneral || !!regionG2;   // piloto, ruta y horario (fecha): G2 o superior
    const puedeSolicitar = esAdminG3() || esEmpleado; // G3 y Empleado solo SOLICITAN la reasignación
    const puedeCancelar = puedeGestionar && !esEmpleado; // el Empleado no cancela
    const puedeAnular = esGeneral;

    // ==================================================
    // AYUDAS
    // ==================================================

    const dinero = (n) => `${PED_MONEDA}${Number(n || 0).toFixed(2)}`;
    const redondear = (n) => Math.round(Number(n || 0) * 100) / 100;
    const kilos = (n) => `${redondear(n)} kg`;
    const hhmm = (hora) => (hora || '').slice(0, 5);
    const numero = (el) => (el.value === '' ? 0 : Number(el.value)); // input vacío = 0

    // Fecha local de hoy "2026-09-28" (no la de UTC)
    function fechaHoy() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // "2026-09-28" -> "28/09/2026"
    const fechaCorta = (f) => (f ? f.split('-').reverse().join('/') : '—');

    // timestamptz -> "28/09/2026 14:05"
    const fechaHora = (t) => new Date(t).toLocaleString('es-CR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    function etiquetaEstado(p) {
        const span = document.createElement('span');
        if (p.anulado) {
            span.className = 'etiqueta etiqueta-gris';
            span.textContent = 'Anulado';
        } else {
            const info = PED_ESTADOS[p.estado] || { texto: p.estado, color: 'etiqueta-gris' };
            span.className = `etiqueta ${info.color}`;
            span.textContent = info.texto;
        }
        return span;
    }

    // Mensaje de error común de Supabase
    const faltaTabla = (e) => !!e && (e.code === 'PGRST205' || e.code === '42P01');

    function mostrarVista(id) {
        zona.querySelectorAll('.ped-vista').forEach((v) => { v.hidden = v.id !== id; });
    }

    // ==================================================
    // DATOS COMUNES (tiendas, actividades, pilotos, configuración)
    // ==================================================

    let tiendas = [];            // tiendas que el usuario puede ver
    let actividades = [];        // todas las actividades
    let pilotos = [];            // pilotos de esas tiendas
    let capacidades = [];        // pedidos por horario por región o tienda (tabla capacidad_marcas)
    let rutas = [];              // rutas de esas tiendas (vacío si la base aún no tiene la tabla rutas)
    let config = { numero_pedido: 'automatico', pedidos_por_marca: 5 };

    async function cargarBase() {
        // lat / lng: ubicación de la tienda en el mapa (punto A de sus entregas).
        // Sin el bloque 9 de sql/01 no existen: se leen las columnas de antes.
        const consultaTiendas = (columnas) => {
            let q = db.from('tiendas').select(columnas).order('codigo');
            if (regionG2) q = q.eq('region', regionG2);
            else if (!esGeneral && !esPiloto) q = q.eq('id', tiendaPropia || 0);
            return q;
        };
        const columnasTienda = 'id, codigo, nombre, region, direccion';
        const tiendasConUbicacion = consultaTiendas(`${columnasTienda}, lat, lng`)
            .then((r) => (r.error && r.error.code === '42703' ? consultaTiendas(columnasTienda) : r));

        const columnasAct = 'codigo, nombre, descripcion, icono, usa_bodega, activa, orden';
        const [tie, actNueva, conf, cap] = await Promise.all([
            tiendasConUbicacion,
            db.from('actividades').select(`${columnasAct}, usa_recoleccion, usa_compra, usa_tamanos, permite_alcohol`).order('orden'),
            db.from('configuracion').select('clave, valor').in('clave', ['numero_pedido', 'pedidos_por_marca']),
            db.from('capacidad_marcas').select('region, tienda_id, pedidos_por_marca'),
        ]);
        // Sin sql/01_actualizacion_base_existente no existen las columnas de "qué usa": se leen las básicas
        // y usaActividad() deduce lo que usa por el código (como antes)
        const act = actNueva.error && actNueva.error.code === '42703'
            ? await db.from('actividades').select(columnasAct).order('orden')
            : actNueva;
        const error = tie.error || act.error || conf.error || cap.error;
        if (error) return error;

        tiendas = tie.data;
        // Solo las actividades que realiza la empresa (empresas/empresas.js)
        actividades = actividadesDeLaEmpresa(act.data);
        capacidades = cap.data;
        conf.data.forEach((f) => { config[f.clave] = f.valor; });

        // Rutas. Si la base no tiene la tabla, se trabaja sin rutas.
        const rut = await db.from('rutas').select('id, tienda_id, nombre, actividad, activa, orden').order('orden').order('nombre');
        if (rut.error && !faltaTabla(rut.error)) return rut.error;
        rutas = rut.error ? [] : rut.data;

        // Pilotos aprobados de esas tiendas + los MULTITIENDA de sus regiones
        // (el Piloto no necesita la lista)
        if (!esPiloto && tiendas.length) {
            const ids = tiendas.map((t) => t.id);
            const regiones = new Set(tiendas.map((t) => t.region));
            const columnas = 'id, nombre, id_usuario, tienda_id, tiendas(region)';
            let pil = await db.from('usuarios').select(`${columnas}, multitienda`).eq('rol', 'piloto').eq('aprobado', true)
                .or(`tienda_id.in.(${ids.join(',')}),multitienda.eq.true`).order('nombre');
            if (pil.error && pil.error.code === '42703') { // base sin la columna multitienda
                pil = await db.from('usuarios').select(columnas).eq('rol', 'piloto').eq('aprobado', true).in('tienda_id', ids).order('nombre');
            }
            if (pil.error) return pil.error;
            pilotos = pil.data.filter((p) => ids.includes(p.tienda_id) || (p.multitienda && p.tiendas && regiones.has(p.tiendas.region)));
        }
        return null;
    }

    const tiendaPorId = (id) => tiendas.find((t) => t.id === id);
    const nombreTienda = (id) => { const t = tiendaPorId(id); return t ? `${t.codigo} · ${t.nombre}` : '—'; };
    const actividadPorCodigo = (c) => actividades.find((a) => a.codigo === c) || { codigo: c, nombre: c, icono: 'bi-box' };

    // ¿La actividad usa esta parte del pedido? -> usaActividad() en empresas/empresas.js
    const nombrePiloto = (id) => (pilotos.find((p) => p.id === id) || {}).nombre;
    const nombreRuta = (id) => (rutas.find((r) => r.id === id) || {}).nombre || null;

    // Rutas activas de una tienda que sirven para una actividad (vacía = todas)
    const rutasDe = (tiendaId, actividad) => rutas.filter((r) => r.activa && r.tienda_id === tiendaId && (!r.actividad || r.actividad === actividad));

    // Pilotos que el G2 asignó a una ruta para una fecha (por día o semana)
    async function pilotosDeRuta(rutaId, fecha) {
        if (!rutaId || !fecha) return [];
        const { data, error } = await db.from('rutas_pilotos').select('piloto_id')
            .eq('ruta_id', rutaId).lte('fecha_desde', fecha).gte('fecha_hasta', fecha);
        if (error) {
            console.error('Error al cargar los pilotos de la ruta:', error);
            return [];
        }
        return [...new Set(data.map((f) => f.piloto_id))];
    }

    // Piloto automático: el de la ruta ese día; si hay varios, el que tenga
    // menos pedidos ese día (para repartir la carga)
    async function pilotoAutomatico(rutaId, fecha, excluirPedido = null) {
        const ids = await pilotosDeRuta(rutaId, fecha);
        if (ids.length <= 1) return ids[0] || null;
        const { data, error } = await db.from('pedidos').select('id, piloto_id')
            .eq('fecha_entrega', fecha).eq('anulado', false).neq('estado', 'cancelado').in('piloto_id', ids);
        if (error) return ids[0];
        const carga = (id) => data.filter((p) => p.piloto_id === id && p.id !== excluirPedido).length;
        return ids.reduce((mejor, id) => (carga(id) < carga(mejor) ? id : mejor), ids[0]);
    }

    // Actividades de una tienda: TODAS las activas de la empresa (se eligen en
    // Configuración -> Actividades y se aplican a todas las tiendas)
    const actividadesDeTienda = () => actividades.filter((a) => a.activa);

    // Pedidos máximos por marca de una tienda: tienda > región > base
    function capacidadMarca(tiendaId) {
        const tienda = tiendaPorId(tiendaId) || {};
        const deTienda = capacidades.find((c) => c.tienda_id === tiendaId);
        if (deTienda) return deTienda.pedidos_por_marca;
        const deRegion = capacidades.find((c) => c.region && c.region === tienda.region);
        if (deRegion) return deRegion.pedidos_por_marca;
        return Number(config.pedidos_por_marca) || 5;
    }

    // Marcas de una fecha con cuántos pedidos ya tiene cada una en esa tienda.
    // excluirId: el pedido que se está reasignando (no cuenta contra sí mismo).
    async function marcasConOcupacion(fecha, tiendaId, excluirId = null) {
        const [marcas, ocupados] = await Promise.all([
            db.rpc('marcas_del_dia', { p_fecha: fecha }),
            db.from('pedidos').select('id, marca_numero')
                .eq('tienda_id', tiendaId).eq('fecha_entrega', fecha).eq('anulado', false)
                .neq('estado', 'cancelado').not('marca_numero', 'is', null),
        ]);
        if (marcas.error || ocupados.error) {
            console.error('Error al cargar las marcas:', marcas.error || ocupados.error);
            return [];
        }
        const maximo = capacidadMarca(tiendaId);
        return marcas.data.map((m) => {
            const usados = ocupados.data.filter((p) => p.marca_numero === m.numero && p.id !== excluirId).length;
            return { ...m, usados, maximo, llena: usados >= maximo };
        });
    }

    // Llena un <select> de horarios: "Horario 1 · 07:00–09:30 (2/5)"
    function llenarMarcas(select, marcas, actual = null) {
        select.replaceChildren(new Option('Sin horario (se asigna después)', ''));
        marcas.forEach((m) => {
            const texto = `Horario ${m.numero} · ${hhmm(m.inicio_desde)}–${hhmm(m.fin)} (${m.usados}/${m.maximo})${m.llena ? ' — lleno' : ''}`;
            const opcion = new Option(texto, m.numero);
            // Un horario lleno no se puede elegir (salvo que ya sea el del pedido)
            opcion.disabled = m.llena && m.numero !== actual;
            select.appendChild(opcion);
        });
        if (!marcas.length) select.appendChild(new Option('No hay horarios ese día', '', false, false)).disabled = true;
        select.value = actual == null ? '' : String(actual);
    }

    // deRuta: ids de los pilotos de la ruta ese día (se marcan en la lista)
    function llenarPilotos(select, tiendaId, actual = null, deRuta = []) {
        select.replaceChildren(new Option(rutas.length ? 'Automático (el de la ruta)' : 'Sin piloto (se asigna después)', ''));
        // Los de la tienda + los multitienda de la misma región
        const region = (tiendaPorId(tiendaId) || {}).region;
        pilotos.filter((p) => p.tienda_id === tiendaId || (p.multitienda && p.tiendas && p.tiendas.region === region))
            .forEach((p) => select.appendChild(new Option(
                `${p.nombre} (${p.id_usuario})${p.tienda_id !== tiendaId ? ' · multitienda' : ''}${deRuta.includes(p.id) ? ' · de la ruta' : ''}`, p.id)));
        select.value = actual == null ? '' : String(actual);
    }

    function llenarRutas(select, lista, actual = null) {
        select.replaceChildren();
        lista.forEach((r) => select.appendChild(new Option(
            r.actividad ? `${r.nombre} · solo ${actividadPorCodigo(r.actividad).nombre}` : r.nombre, r.id)));
        if (!lista.length) select.appendChild(new Option('Sin rutas para esta actividad', ''));
        select.value = actual && lista.some((r) => r.id === actual) ? String(actual) : (lista[0] ? String(lista[0].id) : '');
    }

    // Agrega un evento a la línea de tiempo del pedido
    function registrarEvento(pedidoId, evento, { antes = null, despues = null, detalle = null } = {}) {
        return db.from('pedido_historial').insert({
            pedido_id: pedidoId, evento, estado_anterior: antes, estado_nuevo: despues, detalle,
            usuario_id: sesion.id || null, usuario_nombre: sesion.nombre || null,
        });
    }

    // ¿El usuario puede ver este pedido?
    function puedeVer(p) {
        if (esPiloto) return p.piloto_id === sesion.id;
        return !!tiendaPorId(p.tienda_id);
    }

    // ==================================================
    // VISTA 1: LISTA
    // ==================================================

    const cuerpoLista = $('#pedCuerpo');
    const filtroFecha = $('#pedFiltroFecha');
    const filtroTienda = $('#pedFiltroTienda');
    const filtroEstado = $('#pedFiltroEstado');
    const verAnulados = $('#pedVerAnulados');
    const filtroRuta = $('#pedFiltroRuta');
    const buscar = $('#pedBuscar');
    let pedidosCargados = []; // todas las actividades (para el número de cada pestaña)
    let pedidos = [];         // solo los de la actividad de la pestaña

    // ---------- Actividad de la lista (una pestaña por actividad) ----------
    // Cada actividad se ve por separado: su resumen, sus rutas, sus estados y
    // su columna propia. La pestaña elegida se recuerda mientras dure la sesión.
    const PED_CLAVE_ACTIVIDAD = 'ped_actividad';
    let actividadLista = null; // código de la actividad de la pestaña
    let pestanas = null;
    const actLista = () => (actividadLista ? actividadPorCodigo(actividadLista) : null);
    const usaLista = (uso) => usaActividad(actLista(), uso);

    function actividadInicial() {
        let guardada = null;
        try { guardada = sessionStorage.getItem(PED_CLAVE_ACTIVIDAD); } catch (e) { /* sin almacenamiento */ }
        const pedida = parametrosSeccion().get('actividad') || guardada;
        return actividades.some((a) => a.codigo === pedida) ? pedida : ((actividades[0] || {}).codigo || null);
    }

    function alCambiarActividadLista(codigo) {
        actividadLista = codigo;
        try { sessionStorage.setItem(PED_CLAVE_ACTIVIDAD, codigo); } catch (e) { /* sin almacenamiento */ }
        prepararSegunActividad();
        separarPorActividad();
        dibujarLista();
        dibujarRutasDia();
    }

    // Deja en "pedidos" solo los de la pestaña y pone el número de cada pestaña
    function separarPorActividad() {
        pedidos = actividadLista ? pedidosCargados.filter((p) => p.actividad === actividadLista) : pedidosCargados;
        if (pestanas) {
            const cuentas = {};
            actividades.forEach((a) => { cuentas[a.codigo] = pedidosCargados.filter((p) => p.actividad === a.codigo).length; });
            pestanas.cuentas(cuentas);
        }
    }

    // Lo que cambia con la actividad: rutas, estados, cuadros del resumen,
    // columna propia y el enlace de "Nuevo pedido"
    function prepararSegunActividad() {
        const conBodega = usaLista('usa_bodega');

        // Rutas: las de la actividad (o de todas)
        const rutaAntes = filtroRuta.value;
        filtroRuta.replaceChildren(new Option('Todas las rutas', ''));
        rutasVisibles().filter((r) => !r.actividad || !actividadLista || r.actividad === actividadLista)
            .forEach((r) => filtroRuta.appendChild(new Option(
                tiendas.length > 1 ? `${r.nombre} · ${(tiendaPorId(r.tienda_id) || {}).codigo || ''}` : r.nombre, r.id)));
        filtroRuta.value = [...filtroRuta.options].some((o) => o.value === rutaAntes) ? rutaAntes : '';
        filtroRuta.hidden = filtroRuta.options.length <= 1;

        // Estados: "En bodega" solo si la actividad usa bodega
        const estadoAntes = filtroEstado.value;
        filtroEstado.replaceChildren(new Option('Todos los estados', ''));
        PED_GRUPOS.filter((g) => !g.uso || usaLista(g.uso))
            .forEach((g) => filtroEstado.appendChild(new Option(`${g.texto} (grupo)`, `g:${g.id}`)));
        Object.entries(PED_ESTADOS).filter(([codigo]) => codigo !== 'recibido_bodega' || conBodega)
            .forEach(([codigo, e]) => filtroEstado.appendChild(new Option(e.texto, `e:${codigo}`)));
        filtroEstado.value = [...filtroEstado.options].some((o) => o.value === estadoAntes) ? estadoAntes : '';

        // Cuadros del resumen
        PED_GRUPOS.forEach((g) => {
            const cuadro = zona.querySelector(`#pedResumen [data-filtro="g:${g.id}"]`);
            if (cuadro) cuadro.hidden = !!g.uso && !usaLista(g.uso);
        });

        // Columna propia: la compra (si la actividad la usa) o el peso
        $('#pedColExtra').textContent = usaLista('usa_compra') ? 'Compra' : 'Peso';

        // "Nuevo pedido" abre el formulario con esta actividad ya elegida
        $('#pedNuevo').href = actividadLista ? `#pedidos?nuevo=1&actividad=${encodeURIComponent(actividadLista)}` : '#pedidos?nuevo=1';
    }

    // Modos que abren los botones del pie (#pedidos?accion=...): la lista muestra
    // los pendientes y cada fila tiene un botón que abre directamente esa acción
    const MODOS_LISTA = {
        reasignar: {
            icono: 'bi-calendar-event',
            permitido: () => puedeAsignar || puedeSolicitar,
            texto: () => (puedeAsignar
                ? 'Reasignar horario: elige el pedido al que quieres cambiar fecha, horario, ruta o piloto.'
                : 'Reasignar horario: elige el pedido para solicitar la reasignación al Admin G2.'),
            estados: [...PED_ANTES_DE_SALIR, 'no_entregado'],
        },
        cancelar: {
            icono: 'bi-slash-circle',
            permitido: () => puedeCancelar,
            texto: () => 'Cancelar pedido: elige el pedido que quieres cancelar. Los pedidos no se borran; quedan como cancelados en el historial.',
            estados: PED_ANTES_DE_SALIR,
        },
    };
    const modoPedido = parametrosSeccion().get('accion');
    const modoLista = MODOS_LISTA[modoPedido] && MODOS_LISTA[modoPedido].permitido() ? modoPedido : null;

    function prepararFiltros() {
        filtroFecha.value = fechaHoy();

        tiendas.forEach((t) => filtroTienda.appendChild(new Option(`${t.codigo} · ${t.nombre}`, t.id)));
        filtroTienda.hidden = tiendas.length <= 1 || esPiloto;

        // Una pestaña por actividad (con una sola no hace falta mostrarlas)
        actividadLista = actividadInicial();
        pestanas = crearPestanas($('#pedPestanas'),
            actividades.map((a) => ({ valor: a.codigo, texto: a.nombre, icono: a.icono })),
            actividadLista, alCambiarActividadLista);
        $('#pedPestanas').hidden = actividades.length <= 1;

        $('#pedVerAnuladosCaja').hidden = !puedeAnular;
        $('#pedNuevo').hidden = !puedeGestionar;

        // Cuadros del resumen
        const resumen = $('#pedResumen');
        const total = document.createElement('button');
        total.type = 'button';
        total.className = 'resumen-item';
        total.dataset.filtro = '';
        total.innerHTML = '<span class="resumen-numero" data-cuenta="">0</span><span class="resumen-texto">Total</span>';
        resumen.appendChild(total);
        PED_GRUPOS.forEach((g) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `resumen-item ${g.color}`;
            b.dataset.filtro = `g:${g.id}`;
            const n = document.createElement('span');
            n.className = 'resumen-numero';
            n.dataset.cuenta = g.id;
            n.textContent = '0';
            const t = document.createElement('span');
            t.className = 'resumen-texto';
            t.textContent = g.texto;
            b.append(n, t);
            resumen.appendChild(b);
        });

        // Rutas, estados, cuadros y columna según la actividad de la pestaña
        prepararSegunActividad();

        // Modo del pie: todas las fechas, solo pendientes y el aviso arriba
        if (modoLista) {
            const modo = MODOS_LISTA[modoLista];
            filtroFecha.value = '';
            filtroEstado.value = 'g:pendientes';
            $('#pedModoIcono').className = `bi ${modo.icono}`;
            $('#pedModoTexto').textContent = modo.texto();
            $('#pedModo').hidden = false;
        }
    }

    async function cargarLista() {
        $('#pedContador').textContent = 'Cargando pedidos...';
        let q = db.from('pedidos').select(
            'id, codigo, actividad, tienda_id, cliente_nombre, cliente_telefono, direccion_recoleccion, direccion_entrega, ' +
            'fecha_entrega, marca_numero, piloto_id, estado, anulado, monto_compra, total_cobrar, peso_total_kg, lleva_alcohol, creado_en' +
            (rutas.length ? ', ruta_id' : '')); // ruta_id existe solo si la base tiene rutas

        // Alcance del rol
        if (esPiloto) q = q.eq('piloto_id', sesion.id || 0);
        else if (!esGeneral) q = q.in('tienda_id', tiendas.length ? tiendas.map((t) => t.id) : [0]);

        // Se cargan todas las actividades de la empresa (para el número de cada
        // pestaña); la lista muestra solo la de la pestaña (separarPorActividad)
        if (actividades.length) q = q.in('actividad', actividades.map((a) => a.codigo));
        if (filtroFecha.value) q = q.eq('fecha_entrega', filtroFecha.value);
        if (filtroTienda.value) q = q.eq('tienda_id', Number(filtroTienda.value));
        if (!verAnulados.checked) q = q.eq('anulado', false);

        const { data, error } = await q.order('fecha_entrega', { ascending: false })
            .order('marca_numero', { ascending: true, nullsFirst: false })
            .order('creado_en', { ascending: false }).limit(500);

        if (error) {
            console.error('Error al cargar pedidos:', error);
            if (faltaTabla(error)) $('#pedFaltaSql').hidden = false;
            else aviso.mostrar('No se pudieron cargar los pedidos. Revisa la conexión.', 'error');
            $('#pedContador').textContent = '';
            return;
        }
        pedidosCargados = data;
        separarPorActividad();
        dibujarLista();
        dibujarRutasDia();
    }

    // Rutas que el usuario puede ver en la lista
    const rutasVisibles = () => (esPiloto ? rutas : rutas.filter((r) => tiendaPorId(r.tienda_id)));

    // ---------- Rutas del día (sobre la tabla) ----------
    // Piloto: SU ruta de ese día. Los demás: cada ruta con su piloto (lo que asignó el G2).
    async function dibujarRutasDia() {
        const caja = $('#pedRutasDia');
        const fecha = filtroFecha.value || fechaHoy();
        // Solo las rutas de la actividad de la pestaña (o las que sirven para todas)
        let lista = rutasVisibles().filter((r) => r.activa && (!r.actividad || !actividadLista || r.actividad === actividadLista));
        if (filtroTienda.value) lista = lista.filter((r) => r.tienda_id === Number(filtroTienda.value));
        if (!lista.length) {
            caja.hidden = true;
            return;
        }

        let q = db.from('rutas_pilotos').select('ruta_id, piloto_id').lte('fecha_desde', fecha).gte('fecha_hasta', fecha);
        q = esPiloto ? q.eq('piloto_id', sesion.id || 0) : q.in('ruta_id', lista.map((r) => r.id));
        const { data, error } = await q;
        if (error) {
            console.error('Error al cargar las rutas del día:', error);
            caja.hidden = true;
            return;
        }

        caja.replaceChildren();
        const icono = document.createElement('i');
        icono.className = 'bi bi-signpost-split';
        const titulo = document.createElement('strong');
        caja.append(icono, titulo);

        const etiqueta = (texto, color) => {
            const e = document.createElement('span');
            e.className = `etiqueta ${color}`;
            e.textContent = texto;
            caja.appendChild(e);
        };

        if (esPiloto) {
            const mias = [...new Set(data.map((a) => a.ruta_id))].map((id) => rutas.find((r) => r.id === id)).filter(Boolean);
            titulo.textContent = `Tu ruta el ${fechaCorta(fecha)}:`;
            if (!mias.length) etiqueta('Sin ruta asignada ese día', 'etiqueta-gris');
            mias.forEach((r) => etiqueta(`${r.nombre} · ${nombreTienda(r.tienda_id)}`, 'etiqueta-azul'));
        } else {
            titulo.textContent = `Rutas del ${fechaCorta(fecha)}:`;
            lista.forEach((r) => {
                const ids = [...new Set(data.filter((a) => a.ruta_id === r.id).map((a) => a.piloto_id))];
                etiqueta(ids.length
                    ? `${r.nombre}: ${ids.map((id) => nombrePiloto(id) || 'Piloto').join(', ')}`
                    : `${r.nombre}: sin piloto`, ids.length ? 'etiqueta-azul' : 'etiqueta-gris');
            });
        }
        caja.hidden = false;
    }

    // ¿El pedido entra en el filtro de estado? (valor "g:grupo" o "e:estado")
    function cumpleEstado(p, filtro) {
        if (!filtro) return true;
        const [tipo, valor] = filtro.split(':');
        if (tipo === 'e') return p.estado === valor;
        const grupo = PED_GRUPOS.find((g) => g.id === valor);
        return !!grupo && grupo.estados.includes(p.estado);
    }

    function dibujarLista() {
        // Resumen (sobre lo cargado, sin el filtro de estado ni la búsqueda)
        $('[data-cuenta=""]').textContent = pedidos.length;
        PED_GRUPOS.forEach((g) => {
            zona.querySelector(`[data-cuenta="${g.id}"]`).textContent = pedidos.filter((p) => g.estados.includes(p.estado)).length;
        });
        zona.querySelectorAll('#pedResumen .resumen-item').forEach((b) => {
            b.classList.toggle('activo', b.dataset.filtro === filtroEstado.value);
        });

        const texto = buscar.value.trim();
        const visibles = pedidos.filter((p) => cumpleEstado(p, filtroEstado.value) &&
            (!filtroRuta.value || p.ruta_id === Number(filtroRuta.value)) &&
            coincideBusqueda([p.codigo, p.cliente_nombre, p.cliente_telefono, p.direccion_entrega], texto));

        const cuando = filtroFecha.value ? `para el ${fechaCorta(filtroFecha.value)}` : 'en todas las fechas';
        // Con varias actividades se dice de cuál es la lista: "3 pedidos de Encomiendas ..."
        const deActividad = actividades.length > 1 && actLista() ? ` de ${actLista().nombre}` : '';
        $('#pedContador').textContent = visibles.length === pedidos.length
            ? `${plural(pedidos.length, 'pedido', 'pedidos')}${deActividad} ${cuando}`
            : `${visibles.length} de ${plural(pedidos.length, 'pedido', 'pedidos')}${deActividad} ${cuando}`;

        cuerpoLista.replaceChildren();
        if (!visibles.length) {
            cuerpoLista.appendChild(crearFilaVacia(pedidos.length
                ? 'Ningún pedido coincide con los filtros.'
                : (esPiloto ? `No tienes pedidos${deActividad} asignados en esta fecha.` : `No hay pedidos${deActividad} en esta fecha.`), 9));
            return;
        }

        const conCompra = usaLista('usa_compra');
        visibles.forEach((p) => {
            const tr = document.createElement('tr');
            const act = actividadPorCodigo(p.actividad);

            // Pedido: código + tienda si ve varias (la actividad ya la dice la pestaña)
            // + "Lleva alcohol" si la actividad lo permite y el pedido lo lleva
            const tdPedido = document.createElement('td');
            const caja = document.createElement('div');
            caja.className = 'ped-codigo';
            const codigo = document.createElement('strong');
            codigo.textContent = p.codigo;
            const partes = [];
            if (actividades.length <= 1) partes.push(act.nombre);
            if (tiendas.length > 1) partes.push(nombreTienda(p.tienda_id));
            if (p.lleva_alcohol && usaActividad(act, 'permite_alcohol')) partes.push('Lleva alcohol');
            const sub = document.createElement('small');
            sub.textContent = partes.join(' · ');
            caja.append(codigo, sub);
            tdPedido.appendChild(caja);
            tr.appendChild(tdPedido);

            // Cliente
            const tdCliente = document.createElement('td');
            const nom = document.createElement('div');
            nom.textContent = p.cliente_nombre;
            const tel = document.createElement('small');
            tel.className = 'ped-sub';
            tel.textContent = p.cliente_telefono;
            tdCliente.append(nom, tel);
            tr.appendChild(tdCliente);

            // Entrega: dirección (recortada) + recolección si la actividad la usa + fecha si se ven todas
            const tdEntrega = document.createElement('td');
            const dir = document.createElement('span');
            dir.className = 'ped-corto';
            dir.title = p.direccion_entrega;
            dir.textContent = p.direccion_entrega;
            tdEntrega.appendChild(dir);
            if (p.direccion_recoleccion && usaActividad(act, 'usa_recoleccion')) {
                const rec = document.createElement('small');
                rec.className = 'ped-sub ped-corto';
                rec.title = p.direccion_recoleccion;
                rec.textContent = `Recoger en: ${p.direccion_recoleccion}`;
                tdEntrega.appendChild(rec);
            }
            if (!filtroFecha.value) {
                const f = document.createElement('small');
                f.className = 'ped-sub';
                f.textContent = fechaCorta(p.fecha_entrega);
                tdEntrega.appendChild(f);
            }
            tr.appendChild(tdEntrega);

            // Horario y ruta: "Horario 2 · Ruta 1"
            tr.appendChild(crearCelda([p.marca_numero ? `Horario ${p.marca_numero}` : null, nombreRuta(p.ruta_id)]
                .filter(Boolean).join(' · ') || null));
            tr.appendChild(crearCelda(esPiloto ? sesion.nombre : nombrePiloto(p.piloto_id)));

            const tdEstado = document.createElement('td');
            tdEstado.appendChild(etiquetaEstado(p));
            tr.appendChild(tdEstado);

            // Columna propia de la actividad: monto de la compra o peso total
            tr.appendChild(crearCelda(conCompra
                ? (p.monto_compra == null ? null : dinero(p.monto_compra))
                : kilos(p.peso_total_kg)));
            tr.appendChild(crearCelda(dinero(p.total_cobrar)));

            const botones = [crearBotonIcono('ver', p.id, 'bi-eye', `Ver pedido ${p.codigo}`)];
            if (puedeGestionar) botones.push(crearBotonIcono('revisar', p.id, 'bi-qr-code', `QR del pedido ${p.codigo}`));
            // Modo del pie: botón directo para reasignar o cancelar este pedido
            if (modoLista && !p.anulado && MODOS_LISTA[modoLista].estados.includes(p.estado)) {
                const directo = crearBotonIcono(modoLista === 'cancelar' ? 'eliminar' : 'editar', p.id, MODOS_LISTA[modoLista].icono,
                    modoLista === 'cancelar' ? `Cancelar el pedido ${p.codigo}` : `Reasignar el pedido ${p.codigo}`);
                directo.dataset.modo = modoLista;
                botones.unshift(directo);
            }
            tr.appendChild(crearCeldaAcciones(...botones));
            cuerpoLista.appendChild(tr);
        });
    }

    cuerpoLista.addEventListener('click', (evento) => {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton) return;
        if (boton.dataset.accion === 'ver') location.hash = `pedidos?id=${boton.dataset.id}`;
        if (boton.dataset.accion === 'revisar') location.hash = `pedidos?id=${boton.dataset.id}&qr=1`;
        if (boton.dataset.modo) location.hash = `pedidos?id=${boton.dataset.id}&abrir=${boton.dataset.modo}`;
    });

    [filtroFecha, filtroTienda, verAnulados].forEach((el) => el.addEventListener('change', cargarLista));
    filtroEstado.addEventListener('change', dibujarLista);
    filtroRuta.addEventListener('change', dibujarLista);
    buscar.addEventListener('input', dibujarLista);
    $('#pedTodasFechas').addEventListener('click', () => { filtroFecha.value = ''; cargarLista(); });
    $('#pedResumen').addEventListener('click', (evento) => {
        const item = evento.target.closest('.resumen-item');
        if (!item) return;
        filtroEstado.value = filtroEstado.value === item.dataset.filtro ? '' : item.dataset.filtro;
        dibujarLista();
    });

    // ==================================================
    // VISTA 2: REGISTRAR UN PEDIDO
    // ==================================================

    const form = $('#pedForm');
    const selTienda = $('#pedTienda');
    const cajaActividades = $('#pedActividades');
    const selMarca = $('#pedMarca');
    const selPiloto = $('#pedPiloto');
    const inputFecha = $('#pedFecha');
    const cajaCategorias = $('#pedCategorias');
    const cajaDetalleCat = $('#pedCategoriasDetalle');
    const inputMonto = $('#pedMontoCompra');
    const selDescuento = $('#pedDescuento');
    const formError = $('#pedFormError');

    // Datos del formulario
    let clientes = [];     // clientes de la tienda elegida
    let clienteId = null;  // cliente elegido de la lista (null = escrito a mano)
    let categorias = [];   // categorías de mercadería activas de TODAS las actividades de la empresa
    let catalogo = [];     // artículos frecuentes = pesos promedio (tabla articulos_catalogo)
    let tamanos = [];      // S / M / L / XL
    let tarifas = [];      // todas las tarifas
    let descuentos = [];   // descuentos activos
    let marcasForm = [];   // horarios de la fecha elegida con su ocupación
    let pilotosRutaForm = []; // pilotos que el G2 asignó a la ruta elegida ese día
    const selRuta = $('#pedRuta');

    const tiendaElegida = () => Number(selTienda.value) || null;
    const rutaElegida = () => Number(selRuta.value) || null;
    const actividadElegida = () => {
        const r = cajaActividades.querySelector('input:checked');
        return r ? actividadPorCodigo(r.value) : null;
    };
    // ¿La actividad elegida usa esta parte? (ver usaActividad)
    const usa = (uso) => usaActividad(actividadElegida(), uso);

    // ---------- Mapa A -> B (js/mapa.js): distancia por calle para el cobro por km ----------
    //   A = la tienda (sus coordenadas guardadas o su dirección). Si la actividad usa
    //       recolección y se escribió, A = la dirección de recolección.
    //   B = la dirección de entrega (o la ubicación guardada del cliente).
    // Cada dirección se ubica sola al terminar de escribirla; los puntos se pueden
    // mover con un clic en el mapa o arrastrándolos.
    let mapaRuta = null;
    let rutaForm = null; // { km, minutos, aproximada } o null
    const inputRecoleccion = $('#pedRecoleccion');
    const inputDireccion = $('#pedDireccion');
    const origenEsTienda = () => !usa('usa_recoleccion') || !inputRecoleccion.value.trim();
    const tiendaForm = () => tiendaPorId(tiendaElegida()) || null;
    const textoTienda = () => { const t = tiendaForm() || {}; return t.direccion || ''; };

    function prepararMapa() {
        if (mapaRuta || typeof crearMapaRuta !== 'function') return;
        mapaRuta = crearMapaRuta($('#pedMapa'), {
            etiquetaA: 'Tienda', etiquetaB: 'Entrega',
            textoA: () => (origenEsTienda() ? textoTienda() : inputRecoleccion.value),
            textoB: () => inputDireccion.value,
            // Sugerencias mientras se escribe (prioridad: la zona que se ve en el mapa)
            entradaA: inputRecoleccion,
            entradaB: inputDireccion,
            alCambiar: (ruta) => {
                rutaForm = ruta;
                actualizarBotonUbicacionTienda();
                recalcular();
            },
        });
    }

    // Punto A según la tienda y la recolección
    async function actualizarPuntoA() {
        if (!mapaRuta) return;
        mapaRuta.etiquetas(origenEsTienda() ? 'Tienda' : 'Recolección', 'Entrega');
        if (!origenEsTienda()) {
            await mapaRuta.ubicarA();
            return;
        }
        const t = tiendaForm();
        if (t && t.lat != null && t.lng != null) await mapaRuta.ponerA({ lat: Number(t.lat), lng: Number(t.lng) });
        else if (textoTienda()) await mapaRuta.ubicarA();
        else await mapaRuta.ponerA(null);
    }

    // Administrador y Admin G1 pueden guardar el punto A como ubicación de la tienda
    // (así las próximas entregas ya salen de ahí). Tabla tiendas: lat, lng (sql/01, bloque 9).
    function actualizarBotonUbicacionTienda() {
        const boton = $('#pedGuardarUbicacionTienda');
        const a = mapaRuta && mapaRuta.puntos().a;
        const t = tiendaForm();
        const igual = t && a && t.lat != null && Math.abs(Number(t.lat) - a.lat) < 1e-5 && Math.abs(Number(t.lng) - a.lng) < 1e-5;
        boton.hidden = !esGeneral || !a || !t || !origenEsTienda() || igual;
    }

    $('#pedGuardarUbicacionTienda').addEventListener('click', async () => {
        const a = mapaRuta && mapaRuta.puntos().a;
        const t = tiendaForm();
        if (!a || !t) return;
        const lat = Math.round(a.lat * 1e6) / 1e6;
        const lng = Math.round(a.lng * 1e6) / 1e6;
        const { error } = await db.from('tiendas').update({ lat, lng }).eq('id', t.id);
        if (error) {
            console.error('Error al guardar la ubicación de la tienda:', error);
            aviso.mostrar(error.code === '42703'
                ? 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 9: ubicación de las tiendas).'
                : 'No se pudo guardar la ubicación de la tienda.', 'error');
            return;
        }
        t.lat = lat;
        t.lng = lng;
        actualizarBotonUbicacionTienda();
        aviso.mostrar(`Ubicación de ${t.codigo} guardada: sus próximas entregas salen de ese punto.`);
    });

    // Al terminar de escribir una dirección, se ubica sola en el mapa.
    // Si se eligió una sugerencia (entradaYaUbicada, js/mapa.js), el punto ya está puesto.
    inputRecoleccion.addEventListener('change', () => {
        if (entradaYaUbicada(inputRecoleccion)) {
            if (mapaRuta) mapaRuta.etiquetas('Recolección', 'Entrega');
            actualizarBotonUbicacionTienda();
            return;
        }
        actualizarPuntoA();
    });
    inputDireccion.addEventListener('change', () => {
        if (!mapaRuta || entradaYaUbicada(inputDireccion)) return;
        if (inputDireccion.value.trim().length >= 4) mapaRuta.ubicarB();
        else mapaRuta.ponerB(null);
    });

    async function abrirNuevo() {
        mostrarVista('pedNuevoVista');
        const columnasCat = 'id, actividad, nombre, tipo, icono, orden';
        const [catNueva, catA, tam, tar, des] = await Promise.all([
            db.from('categorias_mercaderia').select(`${columnasCat}, peso_referencia`).eq('activa', true).order('orden'),
            db.from('articulos_catalogo').select('categoria_id, nombre, peso_kg').eq('activo', true).order('orden'),
            db.from('tamanos_bulto').select('codigo, nombre').order('orden'),
            db.from('tarifas').select('*'), // '*': funciona con o sin km_incluidos (sql/01, bloque 10)
            db.from('descuentos').select('id, nombre, tipo, valor, actividad, region').eq('activo', true).order('nombre'),
        ]);
        // Sin sql/01_actualizacion_base_existente no existe peso_referencia: se leen las columnas de antes
        let cat = catNueva;
        if (cat.error && cat.error.code === '42703') {
            cat = await db.from('categorias_mercaderia').select(columnasCat).eq('activa', true).order('orden');
        }
        const error = cat.error || tam.error || tar.error || des.error;
        if (error) {
            console.error('Error al preparar el formulario:', error);
            aviso.mostrar('No se pudo preparar el formulario. Revisa la conexión.', 'error');
            return;
        }
        categorias = cat.data.filter((c) => empresaTieneActividad(c.actividad));
        catalogo = catA.error ? [] : catA.data; // si falta la tabla, sin catálogo
        tamanos = tam.data;
        tarifas = tar.data;
        descuentos = des.data;

        // Tienda (G3, Empleado: la suya y bloqueada)
        tiendas.forEach((t) => selTienda.appendChild(new Option(`${t.codigo} · ${t.nombre}`, t.id)));
        if (!tiendas.length) {
            formError.textContent = 'No tienes una tienda asignada para registrar pedidos.';
            $('#pedGuardar').disabled = true;
            return;
        }
        selTienda.value = String(tiendaPropia && tiendaPorId(tiendaPropia) ? tiendaPropia : tiendas[0].id);
        selTienda.disabled = tiendas.length === 1;

        // Número manual (Configuración -> Pedidos -> Número de pedido)
        $('#pedCampoCodigo').hidden = config.numero_pedido !== 'manual';

        inputFecha.value = fechaHoy();
        inputFecha.min = fechaHoy();

        // El piloto solo lo asigna G2 o superior (G3 y Empleado no ven el campo)
        selPiloto.closest('.campo').hidden = !puedeAsignar;

        // Mapa A -> B (antes de elegir la tienda: la tienda pone el punto A)
        prepararMapa();

        // Las casillas de mercadería se arman al elegir la actividad (llenarCategorias)
        await alCambiarTienda();
    }

    // Casillas de mercadería de la actividad elegida (se borra lo marcado antes)
    let actividadDeCasillas = null;
    function llenarCategorias() {
        const act = actividadElegida();
        const codigo = act ? act.codigo : null;
        if (codigo === actividadDeCasillas) return; // misma actividad: se conserva lo marcado
        actividadDeCasillas = codigo;

        cajaCategorias.replaceChildren();
        cajaDetalleCat.replaceChildren();
        const lista = categorias.filter((c) => c.actividad === codigo);
        lista.forEach((c) => {
            const label = document.createElement('label');
            label.className = 'ped-casilla';
            const casilla = document.createElement('input');
            casilla.type = 'checkbox';
            casilla.value = c.id;
            const icono = document.createElement('i');
            icono.className = `bi ${c.icono}`;
            label.append(casilla, icono, ` ${c.nombre}`);
            cajaCategorias.appendChild(label);
        });
        if (!lista.length) cajaCategorias.textContent = 'Esta actividad no tiene categorías activas (Configuración → Pedidos → Categorías de mercadería).';
    }

    // ---------- Tienda: actividades, clientes, pilotos y marcas ----------
    async function alCambiarTienda() {
        const tiendaId = tiendaElegida();
        // La que ya estaba elegida o, al abrir, la de la pestaña de la lista
        // (#pedidos?nuevo=1&actividad=... o la última pestaña usada)
        const elegida = (actividadElegida() || {}).codigo || actividadInicial();

        // Actividades de la tienda como tarjetas
        cajaActividades.replaceChildren();
        const lista = actividadesDeTienda(tiendaId);
        lista.forEach((a, i) => {
            const label = document.createElement('label');
            label.className = 'ped-actividad';
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'pedActividad';
            radio.value = a.codigo;
            radio.checked = a.codigo === elegida || (!elegida && i === 0);
            const icono = document.createElement('i');
            icono.className = `bi ${a.icono}`;
            const textos = document.createElement('span');
            textos.textContent = a.nombre;
            const desc = document.createElement('small');
            desc.textContent = a.descripcion || '';
            textos.appendChild(desc);
            label.append(radio, icono, textos);
            cajaActividades.appendChild(label);
        });
        if (!lista.length) cajaActividades.textContent = 'Esta tienda no tiene actividades activas.';
        if (!cajaActividades.querySelector('input:checked') && lista.length) cajaActividades.querySelector('input').checked = true;

        llenarPilotos(selPiloto, tiendaId);

        // Clientes aprobados de la tienda
        const { data, error } = await db.from('clientes')
            .select('id, nombre, apellidos, telefono, direccion, ubicacion, clientes_tiendas!inner(tienda_id)')
            .eq('clientes_tiendas.tienda_id', tiendaId).eq('aprobado', true).order('nombre');
        clientes = error ? [] : data;
        if (error) console.error('Error al cargar clientes:', error);
        const listaClientes = $('#pedClientesLista');
        listaClientes.replaceChildren();
        clientes.forEach((c) => listaClientes.appendChild(new Option(textoCliente(c))));

        alCambiarActividad();
        actualizarPuntoA(); // A = la nueva tienda (si no hay recolección)
        await actualizarMarcas();
    }

    const textoCliente = (c) => `${c.nombre} ${c.apellidos} · ${c.telefono}`;

    // ---------- Ruta: la lista depende de la tienda y la actividad ----------
    function actualizarRutas() {
        const lista = rutasDe(tiendaElegida(), (actividadElegida() || {}).codigo);
        $('#pedCampoRuta').hidden = !rutas.length; // sin tabla de rutas: sin campo
        llenarRutas(selRuta, lista, rutaElegida());
        actualizarPilotosRuta();
    }

    // Muestra el o los pilotos de la ruta ese día (los asignó el G2)
    async function actualizarPilotosRuta() {
        const ayuda = $('#pedRutaPilotos');
        pilotosRutaForm = await pilotosDeRuta(rutaElegida(), inputFecha.value);
        if (!rutaElegida()) {
            ayuda.textContent = rutas.length ? 'Esta tienda no tiene rutas para esta actividad (las crea el G2 en Rutas).' : '';
        } else if (!pilotosRutaForm.length) {
            ayuda.textContent = '⚠ Sin piloto asignado a esta ruta ese día: el G2 lo asignará.';
        } else {
            ayuda.textContent = `Piloto${pilotosRutaForm.length > 1 ? 's' : ''} de la ruta ese día: ` +
                pilotosRutaForm.map((id) => nombrePiloto(id) || `#${id}`).join(', ') +
                (pilotosRutaForm.length > 1 ? ' (se asigna el que tenga menos pedidos).' : '.');
        }
        // G2+: en su lista se marcan los pilotos de la ruta
        if (puedeAsignar) llenarPilotos(selPiloto, tiendaElegida(), selPiloto.value ? Number(selPiloto.value) : null, pilotosRutaForm);
    }

    selRuta.addEventListener('change', actualizarPilotosRuta);

    async function actualizarMarcas() {
        const actual = selMarca.value ? Number(selMarca.value) : null;
        marcasForm = inputFecha.value ? await marcasConOcupacion(inputFecha.value, tiendaElegida()) : [];
        llenarMarcas(selMarca, marcasForm, actual && marcasForm.some((m) => m.numero === actual && !m.llena) ? actual : null);
    }

    // ---------- Actividad: muestra lo que usa (Configuración -> Actividades) ----------
    function alCambiarActividad() {
        llenarCategorias();
        const recoleccionAntes = !$('#pedCampoRecoleccion').hidden && !!inputRecoleccion.value.trim();
        $('#pedCampoRecoleccion').hidden = !usa('usa_recoleccion');
        // Si cambia de dónde sale el pedido (tienda o recolección), se mueve el punto A
        if (mapaRuta && recoleccionAntes !== !origenEsTienda()) actualizarPuntoA();
        $('#pedCompraCaja').hidden = !usa('usa_compra');
        $('#pedCobrarCompraCaja').hidden = !usa('usa_compra');
        llenarDescuentos();
        actualizarRutas();
        recalcular();
    }

    // ---------- Cliente de la lista ----------
    $('#pedBuscarCliente').addEventListener('input', (evento) => {
        const c = clientes.find((x) => textoCliente(x) === evento.target.value);
        if (!c) return;
        clienteId = c.id;
        $('#pedClienteNombre').value = `${c.nombre} ${c.apellidos}`;
        $('#pedClienteTelefono').value = c.telefono;
        const direccionVacia = !inputDireccion.value;
        if (c.direccion && direccionVacia) inputDireccion.value = c.direccion;
        // Punto B: la ubicación guardada del cliente (coordenadas o enlace de mapas) o su dirección
        if (mapaRuta && direccionVacia) {
            const punto = puntoDeTexto(c.ubicacion);
            if (punto) mapaRuta.ponerB(punto);
            else if (c.direccion) mapaRuta.ubicarB();
        }
        $('#pedClienteElegido').textContent = `✔ Cliente de la base: ${c.nombre} ${c.apellidos}. Puedes corregir los datos para este pedido.`;
    });

    // ---------- Quién recibe ----------
    form.addEventListener('change', (evento) => {
        if (evento.target.name === 'pedRecibe') {
            const autorizado = evento.target.value === 'autorizado';
            zona.querySelectorAll('[data-solo-autorizado]').forEach((el) => { el.hidden = !autorizado; });
        }
        if (evento.target.name === 'pedActividad') alCambiarActividad();
        if (evento.target.name === 'pedPago') $('#pedCampoPagaCon').hidden = evento.target.value !== 'efectivo';
    });

    selTienda.addEventListener('change', alCambiarTienda);
    inputFecha.addEventListener('change', () => { actualizarMarcas(); actualizarPilotosRuta(); });

    // Input numérico de las filas (cantidad o peso)
    function inputNumero(clave, dato, valor, etiqueta, entero) {
        const input = document.createElement('input');
        input.className = 'campo-input';
        input.type = 'number';
        input.min = entero ? 1 : 0;
        input.step = entero ? 1 : 'any';
        input.dataset[clave] = dato;
        if (valor !== undefined) input.value = valor;
        if (!entero) input.placeholder = 'kg';
        input.setAttribute('aria-label', etiqueta);
        return input;
    }

    function botonQuitar() {
        const quitar = crearBotonIcono('eliminar', '', 'bi-x-lg', 'Quitar fila');
        quitar.dataset.quitar = '1';
        return quitar;
    }

    // Quitar una fila, o agregar un artículo / bulto a su categoría
    form.addEventListener('click', (evento) => {
        const quitar = evento.target.closest('button[data-quitar]');
        if (quitar) {
            quitar.closest('.ped-fila').remove();
            recalcular();
        }
        const agregar = evento.target.closest('button[data-agregar-articulo]');
        if (agregar) agregarArticulo(Number(agregar.dataset.agregarArticulo));
        const agregarB = evento.target.closest('button[data-agregar-bulto]');
        if (agregarB) agregarBulto(Number(agregarB.dataset.agregarBulto));
    });

    // ---------- Bultos (tipo "bulto": cajas, bolsas...) ----------
    // Fila: descripción | cantidad | tamaño (si la actividad usa tamaños) | peso c/u | quitar
    function agregarBulto(categoriaId) {
        const panel = cajaDetalleCat.querySelector(`[data-categoria="${categoriaId}"]`);
        if (!panel) return;
        const categoria = categorias.find((c) => c.id === categoriaId) || {};
        const conTamano = usa('usa_tamanos');
        const fila = document.createElement('div');
        fila.className = `ped-fila ${conTamano ? 'ped-fila-bulto' : 'ped-fila-articulo'}`;

        const desc = document.createElement('input');
        desc.className = 'campo-input';
        desc.dataset.b = 'descripcion';
        desc.maxLength = 60;
        desc.placeholder = `Ej. ${categoria.nombre || 'Caja'} con ropa`;
        desc.setAttribute('aria-label', 'Descripción (opcional)');

        const elementos = [desc, inputNumero('b', 'cantidad', 1, 'Cantidad', true)];
        if (conTamano) {
            const tam = document.createElement('select');
            tam.className = 'campo-input';
            tam.dataset.b = 'tamano';
            tam.appendChild(new Option('—', ''));
            tamanos.forEach((t) => tam.appendChild(new Option(`${t.codigo} · ${t.nombre}`, t.codigo)));
            tam.setAttribute('aria-label', 'Tamaño de referencia');
            elementos.push(tam);
        }
        elementos.push(inputNumero('b', 'peso', undefined, 'Peso de cada uno en kg', false), botonQuitar());
        fila.append(...elementos);
        panel.querySelector('[data-filas]').appendChild(fila);
        recalcular();
    }

    // Encabezado de una lista de filas: [títulos...]
    function encabezadoFilas(clase, titulos) {
        const encabezado = document.createElement('div');
        encabezado.className = `ped-fila ${clase} ped-fila-encabezado`;
        encabezado.setAttribute('aria-hidden', 'true');
        titulos.forEach((t) => {
            const s = document.createElement('span');
            s.textContent = t;
            encabezado.appendChild(s);
        });
        return encabezado;
    }

    // Cabecera con texto y botón "Agregar ..."
    function cabeceraLista(texto, dato, id, textoBoton) {
        const cabecera = document.createElement('div');
        cabecera.className = 'ped-lista-cabecera';
        const span = document.createElement('span');
        span.textContent = texto;
        const agregar = document.createElement('button');
        agregar.type = 'button';
        agregar.className = 'boton boton-secundario boton-chico';
        agregar.dataset[dato] = id;
        agregar.innerHTML = '<i class="bi bi-plus-lg"></i> <span></span>';
        agregar.querySelector('span').textContent = textoBoton;
        cabecera.append(span, agregar);
        return cabecera;
    }

    // ---------- Casillas de mercadería (de la actividad elegida) ----------
    cajaCategorias.addEventListener('change', (evento) => {
        const casilla = evento.target;
        const categoria = categorias.find((c) => c.id === Number(casilla.value));
        if (!categoria) return;
        const panel = cajaDetalleCat.querySelector(`[data-categoria="${categoria.id}"]`);
        if (casilla.checked && !panel) crearPanelCategoria(categoria);
        if (!casilla.checked && panel) panel.remove();
        recalcular();
    });

    function crearPanelCategoria(categoria) {
        const panel = document.createElement('div');
        panel.className = 'ped-categoria';
        panel.dataset.categoria = categoria.id;
        panel.dataset.tipo = categoria.tipo;

        const titulo = document.createElement('h4');
        titulo.className = 'ped-categoria-titulo';
        const icono = document.createElement('i');
        icono.className = `bi ${categoria.icono}`;
        titulo.append(icono, ` ${categoria.nombre}`);
        panel.appendChild(titulo);

        if (categoria.tipo === 'conteo') {
            // Abarrotes: cajas, bolsas, hieleras, peso aproximado y alcohol
            const conteo = document.createElement('div');
            conteo.className = 'ped-conteo';
            [['cajas', 'Cajas'], ['bolsas', 'Bolsas'], ['hieleras', 'Hieleras / "fríos"'], ['peso', 'Peso aprox. (kg)']].forEach(([clave, texto]) => {
                const campo = document.createElement('div');
                campo.className = 'campo';
                const label = document.createElement('label');
                label.className = 'campo-etiqueta';
                label.textContent = texto;
                const input = document.createElement('input');
                input.className = 'campo-input';
                input.type = 'number';
                input.min = 0;
                input.step = clave === 'peso' ? 'any' : 1;
                input.dataset.c = clave;
                label.htmlFor = input.id = `pedConteo_${categoria.id}_${clave}`;
                campo.append(label, input);
                conteo.appendChild(campo);
            });
            // "Lleva alcohol" solo si la actividad lo permite
            if (usa('permite_alcohol')) {
                const alcohol = document.createElement('label');
                alcohol.className = 'ped-si-no';
                const casilla = document.createElement('input');
                casilla.type = 'checkbox';
                casilla.dataset.c = 'alcohol';
                alcohol.append(casilla, ' Lleva alcohol');
                conteo.appendChild(alcohol);
            }
            panel.appendChild(conteo);
        } else if (categoria.tipo === 'documento') {
            // Documentos / sobres: solo cantidad; el peso sale de la categoría
            const pesoUno = Number(categoria.peso_referencia || 0);
            const campo = document.createElement('div');
            campo.className = 'campo ped-documentos';
            const label = document.createElement('label');
            label.className = 'campo-etiqueta';
            label.textContent = 'Cantidad de documentos / sobres';
            const input = inputNumero('d', 'cantidad', 1, 'Cantidad de documentos', true);
            label.htmlFor = input.id = `pedDocs_${categoria.id}`;
            const ayuda = document.createElement('small');
            ayuda.className = 'campo-ayuda';
            ayuda.textContent = pesoUno ? `Cada uno cuenta ${kilos(pesoUno)} en el peso total.` : '';
            campo.append(label, input, ayuda);
            panel.appendChild(campo);
        } else if (categoria.tipo === 'bulto') {
            // Cajas, bolsas...: bultos con cantidad, tamaño y peso de cada uno
            const conTamano = usa('usa_tamanos');
            const filas = document.createElement('div');
            filas.className = 'ped-filas';
            filas.dataset.filas = '1';
            panel.append(
                cabeceraLista('Bultos (cada fila puede tener varios iguales)', 'agregarBulto', categoria.id, 'Agregar bulto'),
                encabezadoFilas(conTamano ? 'ped-fila-bulto' : 'ped-fila-articulo',
                    conTamano ? ['Descripción', 'Cant.', 'Tamaño (ref.)', 'Peso c/u (kg)', ''] : ['Descripción', 'Cant.', 'Peso c/u (kg)', '']),
                filas,
            );
        } else {
            // Línea blanca, electrónica...: artículos con su peso promedio (del
            // catálogo; el empleado lo puede cambiar)
            const lista = document.createElement('datalist');
            lista.id = `pedCatalogo_${categoria.id}`;
            catalogo.filter((a) => a.categoria_id === categoria.id)
                .forEach((a) => lista.appendChild(new Option(a.nombre)));

            const filas = document.createElement('div');
            filas.className = 'ped-filas';
            filas.dataset.filas = '1';
            panel.append(
                cabeceraLista('Artículos (elige de la lista o escribe uno nuevo; el peso se puede cambiar)', 'agregarArticulo', categoria.id, 'Agregar artículo'),
                encabezadoFilas('ped-fila-articulo', ['Artículo', 'Cant.', 'Peso c/u (kg)', '']),
                filas, lista,
            );
        }
        cajaDetalleCat.appendChild(panel);
        if (categoria.tipo === 'articulos') agregarArticulo(categoria.id);
        if (categoria.tipo === 'bulto') agregarBulto(categoria.id);
    }

    function agregarArticulo(categoriaId) {
        const panel = cajaDetalleCat.querySelector(`[data-categoria="${categoriaId}"]`);
        if (!panel) return;
        const fila = document.createElement('div');
        fila.className = 'ped-fila ped-fila-articulo';

        const nombre = document.createElement('input');
        nombre.className = 'campo-input';
        nombre.dataset.a = 'nombre';
        nombre.maxLength = 60;
        nombre.setAttribute('list', `pedCatalogo_${categoriaId}`);
        nombre.placeholder = 'Ej. Refrigeradora';
        nombre.setAttribute('aria-label', 'Artículo');

        const cant = document.createElement('input');
        cant.className = 'campo-input';
        cant.type = 'number';
        cant.min = 1;
        cant.step = 1;
        cant.value = 1;
        cant.dataset.a = 'cantidad';
        cant.setAttribute('aria-label', 'Cantidad');

        const peso = document.createElement('input');
        peso.className = 'campo-input';
        peso.type = 'number';
        peso.min = 0;
        peso.step = 'any';
        peso.dataset.a = 'peso';
        peso.placeholder = 'kg';
        peso.setAttribute('aria-label', 'Peso de cada uno en kg');

        // Al elegir un artículo del catálogo, su peso se llena solo (si no lo cambiaron a mano)
        nombre.addEventListener('input', () => {
            const del = catalogo.find((a) => a.categoria_id === categoriaId && a.nombre.toLowerCase() === nombre.value.trim().toLowerCase());
            if (del && (peso.value === '' || peso.dataset.auto === '1')) {
                peso.value = Number(del.peso_kg);
                peso.dataset.auto = '1';
                recalcular();
            }
        });
        peso.addEventListener('input', () => { peso.dataset.auto = '0'; });

        fila.append(nombre, cant, peso, botonQuitar());
        panel.querySelector('[data-filas]').appendChild(fila);
    }

    // Lee lo marcado: [{ categoria, tipo, conteo | articulos | bultos | documentos }]
    function leerMercaderia() {
        return [...cajaDetalleCat.children].map((panel) => {
            const categoria = categorias.find((c) => c.id === Number(panel.dataset.categoria));
            const filasDe = () => [...panel.querySelectorAll('[data-filas] > .ped-fila')];
            if (panel.dataset.tipo === 'conteo') {
                const v = (c) => panel.querySelector(`[data-c="${c}"]`);
                return {
                    categoria, tipo: 'conteo',
                    conteo: {
                        cajas: numero(v('cajas')), bolsas: numero(v('bolsas')), hieleras: numero(v('hieleras')),
                        peso: numero(v('peso')), alcohol: !!v('alcohol') && v('alcohol').checked,
                    },
                };
            }
            if (panel.dataset.tipo === 'documento') {
                const cantidad = Number(panel.querySelector('[data-d="cantidad"]').value) || 0;
                return { categoria, tipo: 'documento', documentos: { cantidad, pesoUno: Number(categoria.peso_referencia || 0) } };
            }
            if (panel.dataset.tipo === 'bulto') {
                return {
                    categoria, tipo: 'bulto',
                    bultos: filasDe().map((fila) => ({
                        descripcion: fila.querySelector('[data-b="descripcion"]').value.trim(),
                        cantidad: Number(fila.querySelector('[data-b="cantidad"]').value) || 0,
                        tamano: (fila.querySelector('[data-b="tamano"]') || {}).value || null,
                        peso: numero(fila.querySelector('[data-b="peso"]')),
                    })),
                };
            }
            return {
                categoria, tipo: 'articulos',
                articulos: filasDe().map((fila) => ({
                    nombre: fila.querySelector('[data-a="nombre"]').value.trim(),
                    cantidad: Number(fila.querySelector('[data-a="cantidad"]').value) || 0,
                    peso: numero(fila.querySelector('[data-a="peso"]')),
                })),
            };
        });
    }

    // ---------- Peso, tarifa, descuento y total ----------

    // Peso de lo marcado en una categoría
    function pesoDe(m) {
        if (m.tipo === 'conteo') return m.conteo.peso;
        if (m.tipo === 'documento') return m.documentos.cantidad * m.documentos.pesoUno;
        const filas = m.tipo === 'bulto' ? m.bultos : m.articulos;
        return filas.reduce((s, f) => s + f.cantidad * f.peso, 0);
    }

    const pesoTotal = () => redondear(leerMercaderia().reduce((s, m) => s + pesoDe(m), 0));

    const llevaAlcohol = () => usa('permite_alcohol') && leerMercaderia().some((m) => m.tipo === 'conteo' && m.conteo.alcohol);

    // Tarifa que aplica (tienda > región > general) y cálculo del envío (sección 31.5):
    // funciones compartidas con el Cotizador (js/componentes.js), así dan el mismo precio
    const tarifaAplicable = (actividad, tiendaId) => buscarTarifa(tarifas, actividad, tiendaPorId(tiendaId));
    // km: distancia por calle de A a B del mapa (0 si todavía no están los dos puntos)
    const calcularEnvio = (t, peso, montoCompra, km = 0) => calcularEnvioTarifa(t, peso, montoCompra, km);
    const cobraKm = (t) => !!t && Number(t.precio_km) > 0;

    // Descuentos que aplican a la actividad y a la región de la tienda
    function llenarDescuentos() {
        const actual = selDescuento.value;
        const act = (actividadElegida() || {}).codigo;
        const region = (tiendaPorId(tiendaElegida()) || {}).region;
        selDescuento.replaceChildren(new Option('Sin descuento', ''));
        descuentos.filter((d) => (!d.actividad || d.actividad === act) && (!d.region || d.region === region))
            .forEach((d) => selDescuento.appendChild(new Option(
                `${d.nombre} (${d.tipo === 'porcentaje' ? `${Number(d.valor)} %` : dinero(d.valor)})`, d.id)));
        selDescuento.value = [...selDescuento.options].some((o) => o.value === actual) ? actual : '';
    }

    // Arma todo el cálculo; lo usan la pantalla y el guardado
    function calcularCobro() {
        const act = actividadElegida();
        const tiendaId = tiendaElegida();
        const peso = pesoTotal();
        const monto = usa('usa_compra') ? numero(inputMonto) : 0;
        const tarifa = act ? tarifaAplicable(act.codigo, tiendaId) : null;
        const km = rutaForm ? rutaForm.km : 0;
        const calc = tarifa ? calcularEnvio(tarifa, peso, monto, km)
            : { kgAdicional: 0, montoKg: 0, km: 0, montoKm: 0, bruto: 0, gratis: false, envio: 0 };

        const desc = descuentos.find((d) => String(d.id) === selDescuento.value) || null;
        const descuentoEnvio = montoDescuento(desc, calc.envio); // js/componentes.js
        const costoEnvio = redondear(calc.envio - descuentoEnvio);
        const cobrarEnvio = $('#pedCobrarEnvio').checked;
        const cobrarCompra = usa('usa_compra') && $('#pedCobrarCompra').checked;
        const total = redondear((cobrarEnvio ? costoEnvio : 0) + (cobrarCompra ? monto : 0));

        return { act, tarifa, peso, monto, calc, desc, montoDescuento: descuentoEnvio, costoEnvio, cobrarEnvio, cobrarCompra, total };
    }

    // Fila del desglose: texto (+ nota chica) y monto
    function filaDesglose(tbody, texto, monto, nota = '', clase = '') {
        const tr = document.createElement('tr');
        if (clase) tr.className = clase;
        const td1 = document.createElement('td');
        td1.textContent = texto;
        if (nota) {
            const s = document.createElement('small');
            s.textContent = nota;
            td1.appendChild(s);
        }
        const td2 = document.createElement('td');
        td2.textContent = monto;
        tr.append(td1, td2);
        tbody.appendChild(tr);
    }

    function recalcular() {
        const c = calcularCobro();

        $('#pedPesoTotal').textContent = kilos(c.peso);
        $('#pedAlcoholAviso').hidden = !llevaAlcohol();

        const tbody = $('#pedDesglose');
        tbody.replaceChildren();
        if (!c.tarifa) {
            filaDesglose(tbody, 'No hay tarifa para esta actividad (Configuración → Pedidos → Tarifas).', dinero(0));
        } else {
            const t = c.tarifa;
            if (Number(t.cargo_fijo)) filaDesglose(tbody, 'Envío fijo', dinero(t.cargo_fijo), `Tarifa: ${t.alcance}`);
            if (Number(t.minimo)) {
                filaDesglose(tbody, 'Mínimo', dinero(t.minimo), `Cubre hasta ${kilos(t.kg_incluidos)}` +
                    (cobraKm(t) && Number(t.km_incluidos) > 0 ? ` y ${Number(t.km_incluidos)} km` : ''));
            }
            if (c.calc.kgAdicional > 0 && Number(t.precio_kg)) {
                filaDesglose(tbody, `Peso adicional: ${kilos(c.calc.kgAdicional)} × ${dinero(t.precio_kg)}`, dinero(c.calc.montoKg),
                    `Peso total ${kilos(c.peso)} − ${kilos(t.kg_incluidos)} incluidos`);
            }
            // Distancia: km por calle de A a B (mapa) × precio por km
            if (cobraKm(t)) {
                if (rutaForm) {
                    const incl = Number(t.km_incluidos || 0);
                    const nota = [
                        incl > 0 ? `${rutaForm.km} km − ${incl} km incluidos en el mínimo` : null,
                        rutaForm.aproximada ? 'aproximada (línea recta): revisa los puntos en el mapa' : 'por calle, de A a B',
                    ].filter(Boolean).join(' · ');
                    filaDesglose(tbody, c.calc.kmAdicional > 0
                        ? `Distancia adicional: ${c.calc.kmAdicional} km × ${dinero(t.precio_km)}`
                        : `Distancia: ${rutaForm.km} km (incluida en el mínimo)`, dinero(c.calc.montoKm), nota);
                } else {
                    filaDesglose(tbody, 'Distancia: falta ubicar A y B en el mapa', dinero(0), `${dinero(t.precio_km)} por km`);
                }
            }
            if (c.calc.gratis) filaDesglose(tbody, 'Envío gratis', `−${dinero(c.calc.bruto)}`, `Compra desde ${dinero(t.envio_gratis_desde)}`);
            if (c.montoDescuento) filaDesglose(tbody, `Descuento: ${c.desc.nombre}`, `−${dinero(c.montoDescuento)}`);
            filaDesglose(tbody, 'Costo del envío', dinero(c.costoEnvio), '', 'ped-desglose-total');
        }

        // Ayuda del envío gratis
        const t = c.tarifa;
        $('#pedAyudaGratis').textContent = t && t.envio_gratis_desde != null
            ? (c.calc.gratis ? '✔ Envío gratis por el monto de la compra.' : `Envío gratis desde ${dinero(t.envio_gratis_desde)}.`)
            : '';

        $('#pedTotal').textContent = dinero(c.total);

        // Vuelto (efectivo)
        const pagaCon = numero($('#pedPagaCon'));
        const efectivo = form.querySelector('input[name="pedPago"]:checked').value === 'efectivo';
        $('#pedVuelto').textContent = efectivo && pagaCon > 0
            ? (pagaCon >= c.total ? `Vuelto: ${dinero(pagaCon - c.total)}` : `⚠ Faltan ${dinero(c.total - pagaCon)}`)
            : '';
    }

    form.addEventListener('input', (evento) => {
        if (evento.target.closest('#pedBuscarCliente')) return;
        recalcular();
    });
    form.addEventListener('change', recalcular);

    // ---------- Guardar ----------
    function fallo(texto, elemento = null) {
        formError.textContent = texto;
        if (elemento) elemento.focus();
        return false;
    }

    // Revisa el formulario; devuelve true si está completo
    function validarFormulario(c) {
        formError.textContent = '';
        if (!tiendaElegida()) return fallo('Elige la tienda.', selTienda);
        if (!c.act) return fallo('Elige la actividad.');
        if (config.numero_pedido === 'manual') {
            const cod = $('#pedCodigo').value.trim();
            if (!cod) return fallo('Escribe el número de pedido.', $('#pedCodigo'));
            if (!/^[A-Za-z0-9._\-/]+$/.test(cod)) return fallo('El número de pedido solo puede tener letras, números, punto, guion y barra.', $('#pedCodigo'));
        }
        if (!$('#pedClienteNombre').value.trim()) return fallo('Escribe el nombre del cliente.', $('#pedClienteNombre'));
        if ($('#pedClienteTelefono').value.replace(/\D/g, '').length < 8) return fallo('Escribe el teléfono del cliente (al menos 8 dígitos).', $('#pedClienteTelefono'));
        if (!$('#pedDireccion').value.trim()) return fallo('Escribe la dirección de entrega.', $('#pedDireccion'));
        const autorizado = form.querySelector('input[name="pedRecibe"]:checked').value === 'autorizado';
        if (autorizado && !$('#pedRecibeNombre').value.trim()) return fallo('Escribe el nombre de la persona autorizada.', $('#pedRecibeNombre'));
        if (!inputFecha.value) return fallo('Elige la fecha de entrega.', inputFecha);
        // Si la tarifa cobra por km, hace falta la distancia (A y B en el mapa)
        if (cobraKm(c.tarifa) && !rutaForm) {
            return fallo('Esta tarifa cobra por distancia: ubica A y B en el mapa (con "Ubicar" o con un clic).');
        }

        const marca = marcasForm.find((m) => String(m.numero) === selMarca.value);
        if (marca && marca.llena) return fallo(`El horario ${marca.numero} ya está lleno. Elige otro.`, selMarca);

        const merc = leerMercaderia();
        if (!merc.length) return fallo('Selecciona al menos un tipo de mercadería.');
        const entero = (n) => Number.isInteger(n) && n >= 1;
        for (const m of merc) {
            const nombre = m.categoria.nombre;
            if (m.tipo === 'conteo' && m.conteo.cajas + m.conteo.bolsas + m.conteo.hieleras <= 0) {
                return fallo(`${nombre}: escribe cuántas cajas, bolsas o hieleras lleva.`);
            }
            if (m.tipo === 'documento' && !entero(m.documentos.cantidad)) {
                return fallo(`${nombre}: la cantidad debe ser un número entero de 1 o más.`);
            }
            if (m.tipo === 'bulto') {
                if (!m.bultos.length) return fallo(`${nombre}: agrega al menos un bulto.`);
                if (m.bultos.some((b) => !entero(b.cantidad))) return fallo(`${nombre}: la cantidad de cada bulto debe ser un número entero de 1 o más.`);
                if (m.bultos.some((b) => b.peso <= 0)) return fallo(`${nombre}: escribe el peso de cada bulto.`);
            }
            if (m.tipo === 'articulos') {
                if (!m.articulos.length) return fallo(`${nombre}: agrega al menos un artículo.`);
                if (m.articulos.some((a) => !a.nombre)) return fallo(`${nombre}: escribe el nombre de cada artículo.`);
                if (m.articulos.some((a) => !entero(a.cantidad))) return fallo(`${nombre}: la cantidad debe ser 1 o más.`);
            }
        }

        const efectivo = form.querySelector('input[name="pedPago"]:checked').value === 'efectivo';
        const pagaCon = numero($('#pedPagaCon'));
        if (efectivo && pagaCon > 0 && pagaCon < c.total) return fallo('"Paga con" es menor que el total a cobrar.', $('#pedPagaCon'));
        return true;
    }

    // Filas de pedido_articulos (peso_kg = peso de CADA uno)
    function armarArticulos(pedidoId) {
        const filas = [];
        leerMercaderia().forEach((m) => {
            const base = { pedido_id: pedidoId, categoria_id: m.categoria.id, categoria: m.categoria.nombre };
            if (m.tipo === 'documento') {
                filas.push({ ...base, descripcion: 'Documentos / sobres', cantidad: m.documentos.cantidad, peso_kg: m.documentos.pesoUno });
            } else if (m.tipo === 'bulto') {
                m.bultos.forEach((b) => filas.push({
                    ...base, descripcion: b.descripcion || m.categoria.nombre, cantidad: b.cantidad, tamano: b.tamano, peso_kg: b.peso,
                }));
            } else if (m.tipo === 'conteo') {
                // Una fila con el resumen del conteo y el peso aproximado total
                const partes = [['cajas', 'caja', 'cajas'], ['bolsas', 'bolsa', 'bolsas'], ['hieleras', 'hielera', 'hieleras']]
                    .filter(([k]) => m.conteo[k] > 0).map(([k, s, p]) => plural(m.conteo[k], s, p));
                filas.push({
                    pedido_id: pedidoId, categoria_id: m.categoria.id, categoria: m.categoria.nombre,
                    descripcion: partes.join(', ') + (m.conteo.alcohol ? ' (con alcohol)' : ''), cantidad: 1, peso_kg: m.conteo.peso,
                });
            } else {
                m.articulos.forEach((a) => filas.push({
                    pedido_id: pedidoId, categoria_id: m.categoria.id, categoria: m.categoria.nombre,
                    descripcion: a.nombre, cantidad: a.cantidad, peso_kg: a.peso,
                }));
            }
        });
        return filas;
    }

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!puedeGestionar) return;
        const c = calcularCobro();
        if (!validarFormulario(c)) return;

        const tiendaId = tiendaElegida();
        const autorizado = form.querySelector('input[name="pedRecibe"]:checked').value === 'autorizado';
        const efectivo = form.querySelector('input[name="pedPago"]:checked').value === 'efectivo';
        const pagaCon = efectivo ? numero($('#pedPagaCon')) : 0;

        // Ruta y piloto: G2+ puede elegir el piloto a mano; si no, sale de la
        // ruta ese día (si hay varios, el que tenga menos pedidos)
        const rutaId = rutas.length ? rutaElegida() : null;
        const pilotoManual = puedeAsignar && selPiloto.value ? Number(selPiloto.value) : null;
        const pilotoId = pilotoManual || await pilotoAutomatico(rutaId, inputFecha.value);

        // Estado inicial: con piloto -> Asignado; encomienda en bodega -> En bodega; si no, Registrado
        const estado = pilotoId ? 'asignado' : (c.act.usa_bodega ? 'recibido_bodega' : 'registrado');

        // Detalle propio de la actividad (JSON)
        const merc = leerMercaderia();
        const detalle = { cobrar_envio: c.cobrarEnvio, categorias: merc.map((m) => m.categoria.nombre) };
        const conteo = merc.find((m) => m.tipo === 'conteo');
        if (conteo) detalle.abarrotes = conteo.conteo;
        const documentos = merc.find((m) => m.tipo === 'documento');
        if (documentos) detalle.documentos = documentos.documentos.cantidad;
        // Puntos del mapa: A (tienda o recolección) y B (entrega), para el piloto y los reportes
        const puntos = mapaRuta ? mapaRuta.puntos() : {};
        if (puntos.a || puntos.b) {
            const redondo = (p) => (p ? { lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 } : null);
            detalle.ruta = {
                origen: origenEsTienda() ? 'tienda' : 'recoleccion',
                a: redondo(puntos.a), b: redondo(puntos.b),
                km: rutaForm ? rutaForm.km : null,
                minutos: rutaForm ? rutaForm.minutos : null,
                aproximada: rutaForm ? rutaForm.aproximada : null,
            };
        }

        const pedido = {
            actividad: c.act.codigo,
            tienda_id: tiendaId,
            cliente_id: clienteId,
            cliente_nombre: $('#pedClienteNombre').value.trim(),
            cliente_telefono: $('#pedClienteTelefono').value.trim(),
            direccion_recoleccion: usa('usa_recoleccion') ? ($('#pedRecoleccion').value.trim() || null) : null,
            direccion_entrega: $('#pedDireccion').value.trim(),
            distancia_km: rutaForm ? rutaForm.km : null,
            recibe_tipo: autorizado ? 'autorizado' : 'cliente',
            recibe_nombre: autorizado ? $('#pedRecibeNombre').value.trim() : null,
            recibe_telefono: autorizado ? ($('#pedRecibeTelefono').value.trim() || null) : null,
            fecha_entrega: inputFecha.value,
            marca_numero: selMarca.value ? Number(selMarca.value) : null,
            piloto_id: pilotoId,
            peso_total_kg: c.peso,
            lleva_alcohol: llevaAlcohol(),
            detalle,
            monto_compra: usa('usa_compra') ? (c.monto || null) : null,
            cobrar_compra: c.cobrarCompra,
            costo_envio: c.costoEnvio,
            descuento_id: c.desc ? c.desc.id : null,
            costo_desglose: {
                tarifa: c.tarifa ? {
                    alcance: c.tarifa.alcance, cargo_fijo: Number(c.tarifa.cargo_fijo), minimo: Number(c.tarifa.minimo),
                    kg_incluidos: Number(c.tarifa.kg_incluidos), precio_kg: Number(c.tarifa.precio_kg),
                    precio_km: Number(c.tarifa.precio_km || 0), km_incluidos: Number(c.tarifa.km_incluidos || 0),
                    envio_gratis_desde: c.tarifa.envio_gratis_desde == null ? null : Number(c.tarifa.envio_gratis_desde),
                } : null,
                peso_total: c.peso, kg_adicional: c.calc.kgAdicional, monto_kg: c.calc.montoKg,
                km: c.calc.km, km_adicional: c.calc.kmAdicional, monto_km: c.calc.montoKm, km_aproximada: rutaForm ? rutaForm.aproximada : null,
                envio_bruto: c.calc.bruto, envio_gratis: c.calc.gratis,
                descuento: c.desc ? { id: c.desc.id, nombre: c.desc.nombre, tipo: c.desc.tipo, valor: Number(c.desc.valor), monto: c.montoDescuento } : null,
                costo_envio: c.costoEnvio, monto_compra: c.monto,
                cobrar_envio: c.cobrarEnvio, cobrar_compra: c.cobrarCompra, total: c.total,
            },
            total_cobrar: c.total,
            forma_pago: efectivo ? 'efectivo' : 'tarjeta',
            paga_con: pagaCon > 0 ? pagaCon : null,
            vuelto: pagaCon > 0 ? redondear(pagaCon - c.total) : null,
            estado,
            notas: $('#pedNotas').value.trim() || null,
            creado_por: sesion.id || null,
        };
        if (config.numero_pedido === 'manual') pedido.codigo = $('#pedCodigo').value.trim().toUpperCase();
        if (rutas.length) pedido.ruta_id = rutaId; // la columna existe si la base tiene rutas

        const boton = $('#pedGuardar');
        boton.disabled = true;
        const { data, error } = await db.from('pedidos').insert(pedido).select('id, codigo').single();
        if (error) {
            boton.disabled = false;
            console.error('Error al registrar el pedido:', error);
            formError.textContent = error.code === '23505'
                ? 'Ese número de pedido ya existe. Usa otro.'
                : error.code === '23502' && /número de pedido/.test(error.message || '')
                    ? 'Falta el número de pedido (la empresa usa números manuales).'
                    : 'No se pudo registrar el pedido. Intenta de nuevo.';
            return;
        }

        // Artículos y línea de tiempo
        const [art, his] = await Promise.all([
            db.from('pedido_articulos').insert(armarArticulos(data.id)),
            registrarEvento(data.id, 'registrado', {
                despues: estado,
                detalle: {
                    marca: pedido.marca_numero, ruta: nombreRuta(rutaId),
                    piloto: pilotoId ? `${nombrePiloto(pilotoId) || ''}${pilotoManual ? '' : ' (de la ruta)'}` : null,
                },
            }),
        ]);
        if (art.error || his.error) {
            console.error('Error al guardar artículos o historial:', art.error || his.error);
            sessionStorage.setItem('ped_aviso', `Pedido ${data.codigo} registrado, pero no se guardó todo el detalle. Revísalo.`);
        } else {
            sessionStorage.setItem('ped_aviso', `Pedido ${data.codigo} registrado.`);
        }
        location.hash = `pedidos?id=${data.id}&qr=1`;
    });

    // ==================================================
    // VISTA 3: DETALLE
    // ==================================================

    let pedido = null;       // pedido abierto
    let articulosDet = [];
    let marcasDet = [];      // marcas de su fecha (para mostrar las horas)
    let solicitud = null;    // solicitud de reasignación pendiente (evento del historial) o null

    // La última solicitud de reasignación sigue pendiente si después no hubo
    // una asignación, una reprogramación ni un rechazo
    function solicitudPendiente(eventos) {
        let pendiente = null;
        eventos.forEach((e) => {
            if (e.evento === 'solicitud_reasignacion') pendiente = e;
            else if (['asignado', 'reprogramado', 'solicitud_rechazada'].includes(e.evento)) pendiente = null;
        });
        return pendiente;
    }

    // abrir: 'reasignar' | 'cancelar' (viene de los botones del pie) -> abre esa ventana
    async function abrirDetalle(id, abrirQr, abrir = null) {
        mostrarVista('pedDetalle');
        const { data, error } = await db.from('pedidos').select('*').eq('id', id).maybeSingle();
        if (error || !data || !puedeVer(data)) {
            if (error) console.error('Error al cargar el pedido:', error);
            $('#pedDetCodigo').textContent = 'Pedido no encontrado';
            $('#pedDetSubtitulo').textContent = error ? 'No se pudo cargar. Revisa la conexión.' : 'No existe o no tienes acceso a él.';
            return;
        }
        pedido = data;

        const [art, his, ent, evi, marcas] = await Promise.all([
            db.from('pedido_articulos').select('categoria, descripcion, cantidad, tamano, peso_kg').eq('pedido_id', id).order('id'),
            db.from('pedido_historial').select('evento, estado_anterior, estado_nuevo, detalle, usuario_id, usuario_nombre, creado_en').eq('pedido_id', id).order('creado_en'),
            db.from('pedido_entregas').select('*').eq('pedido_id', id).maybeSingle(),
            db.from('pedido_evidencias').select('tipo, url, creado_en, eliminada_en').eq('pedido_id', id).order('creado_en'),
            db.rpc('marcas_del_dia', { p_fecha: data.fecha_entrega }),
        ]);
        articulosDet = art.data || [];
        marcasDet = marcas.data || [];
        solicitud = solicitudPendiente(his.data || []);

        dibujarDetalle();
        dibujarSolicitud();
        dibujarArticulos();
        dibujarCobro();
        dibujarEntrega(ent.data, evi.data || []);
        dibujarHistorial(his.data || []);
        dibujarAcciones();

        // Aviso que dejó el registro ("Pedido P-000001 registrado")
        const pendiente = sessionStorage.getItem('ped_aviso');
        if (pendiente) {
            sessionStorage.removeItem('ped_aviso');
            aviso.mostrar(pendiente);
        }
        if (abrirQr && puedeGestionar) abrirVentanaQr();
        if (abrir) abrirDesdePie(abrir);
    }

    // Botones del pie: abre la ventana de reasignar o de cancelar del pedido
    function abrirDesdePie(abrir) {
        const p = pedido;
        if (abrir === 'reasignar') {
            if (p.anulado || !MODOS_LISTA.reasignar.estados.includes(p.estado)) {
                aviso.mostrar('Este pedido ya no se puede reasignar.', 'error');
            } else if (puedeAsignar) {
                abrirAsignar(p.estado === 'no_entregado' ? 'reprogramar' : 'asignar');
            } else if (puedeSolicitar) {
                if (solicitud) aviso.mostrar('Ya hay una solicitud de reasignación pendiente para este pedido.', 'error');
                else abrirAsignar('solicitar');
            }
        }
        if (abrir === 'cancelar' && puedeCancelar) {
            if (p.anulado || !PED_ANTES_DE_SALIR.includes(p.estado)) aviso.mostrar('Este pedido ya no se puede cancelar.', 'error');
            else abrirAccion(PED_ACCIONES.find((a) => a.id === 'cancelar'));
        }
    }

    // Lista "Etiqueta: valor"
    function dato(dl, etiqueta, valor) {
        if (valor == null || valor === '') return;
        const dt = document.createElement('dt');
        dt.textContent = etiqueta;
        const dd = document.createElement('dd');
        if (valor instanceof HTMLElement) dd.appendChild(valor);
        else dd.textContent = valor;
        dl.append(dt, dd);
    }

    function textoMarca(p) {
        if (!p.marca_numero) return 'Sin horario';
        const m = marcasDet.find((x) => x.numero === p.marca_numero);
        return m ? `Horario ${m.numero} · ${hhmm(m.inicio_desde)} a ${hhmm(m.inicio_hasta)}, termina ${hhmm(m.fin)}` : `Horario ${p.marca_numero}`;
    }

    function dibujarDetalle() {
        const p = pedido;
        const act = actividadPorCodigo(p.actividad);
        $('#pedDetCodigo').textContent = `Pedido ${p.codigo}`;
        $('#pedDetEstado').replaceChildren(etiquetaEstado(p));
        $('#pedDetSubtitulo').textContent = `${act.nombre} · ${nombreTienda(p.tienda_id)} · registrado el ${fechaHora(p.creado_en)}`;

        const dl = $('#pedDetEntrega');
        dl.replaceChildren();
        dato(dl, 'Cliente', p.cliente_nombre);
        dato(dl, 'Teléfono', p.cliente_telefono);
        dato(dl, 'Recolección', p.direccion_recoleccion);
        dato(dl, 'Entrega en', p.direccion_entrega);
        // Ruta del mapa (A -> B): distancia y enlaces para navegar (Google Maps / Waze)
        const ruta = (p.detalle || {}).ruta;
        if (ruta && ruta.b) {
            const caja = document.createElement('span');
            caja.className = 'ped-navegar';
            if (ruta.km != null) caja.append(`${ruta.km} km${ruta.minutos != null ? ` · unos ${ruta.minutos} min` : ''}${ruta.aproximada ? ' (aproximada)' : ''} `);
            const nav = enlacesNavegacion(ruta.a, ruta.b); // js/mapa.js
            [['Ir con Google Maps', nav.google], ['Ir con Waze', nav.waze]].forEach(([texto, href]) => {
                const a = document.createElement('a');
                a.href = href;
                a.target = '_blank';
                a.rel = 'noopener';
                a.textContent = texto;
                caja.appendChild(a);
            });
            dato(dl, ruta.origen === 'recoleccion' ? 'Ruta (recolección → entrega)' : 'Ruta (tienda → entrega)', caja);
        } else if (p.distancia_km != null) {
            dato(dl, 'Distancia', `${p.distancia_km} km`);
        }
        dato(dl, 'Recibe', p.recibe_tipo === 'autorizado'
            ? `${p.recibe_nombre} (autorizado)${p.recibe_telefono ? ` · ${p.recibe_telefono}` : ''}`
            : 'El mismo cliente');
        dato(dl, 'Fecha', fechaCorta(p.fecha_entrega));
        dato(dl, 'Horario', textoMarca(p));
        dato(dl, 'Ruta', nombreRuta(p.ruta_id));
        dato(dl, 'Piloto', esPiloto ? sesion.nombre : (nombrePiloto(p.piloto_id) || 'Sin asignar'));
        dato(dl, 'Peso total', kilos(p.peso_total_kg));
        if (p.lleva_alcohol) {
            const e = document.createElement('span');
            e.className = 'etiqueta etiqueta-rosada';
            e.textContent = 'Lleva alcohol: confirmar mayoría de edad';
            dato(dl, 'Alcohol', e);
        }
        dato(dl, 'Notas', p.notas);
        // El código de respaldo no se le muestra al piloto (lo da el cliente)
        if (!esPiloto) {
            dato(dl, 'Código de respaldo', p.codigo_telefono && p.codigo_telefono !== p.codigo_respaldo
                ? `${p.codigo_respaldo} (o últimos 4 del teléfono: ${p.codigo_telefono})`
                : p.codigo_respaldo);
        }
        if (p.anulado || p.estado === 'cancelado') dato(dl, p.anulado ? 'Motivo de anulación' : 'Motivo de cancelación', p.motivo_cancelacion);
    }

    function dibujarArticulos() {
        const tbody = $('#pedDetArticulos');
        tbody.replaceChildren();
        if (!articulosDet.length) {
            tbody.appendChild(crearFilaVacia('Sin artículos registrados.', 6));
            return;
        }
        articulosDet.forEach((a) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(a.categoria));
            tr.appendChild(crearCelda(a.descripcion));
            tr.appendChild(crearCelda(a.cantidad));
            tr.appendChild(crearCelda(a.tamano));
            tr.appendChild(crearCelda(kilos(a.peso_kg)));
            tr.appendChild(crearCelda(kilos(a.cantidad * a.peso_kg)));
            tbody.appendChild(tr);
        });
    }

    function dibujarCobro() {
        const p = pedido;
        const d = p.costo_desglose || {};
        const tbody = $('#pedDetCobro');
        tbody.replaceChildren();
        const t = d.tarifa;
        if (t) {
            if (t.cargo_fijo) filaDesglose(tbody, 'Envío fijo', dinero(t.cargo_fijo), `Tarifa: ${t.alcance}`);
            if (t.minimo) {
                filaDesglose(tbody, 'Mínimo', dinero(t.minimo), `Cubre hasta ${kilos(t.kg_incluidos)}` +
                    (t.precio_km && t.km_incluidos ? ` y ${t.km_incluidos} km` : ''));
            }
            if (d.kg_adicional > 0 && t.precio_kg) filaDesglose(tbody, `Peso adicional: ${kilos(d.kg_adicional)} × ${dinero(t.precio_kg)}`, dinero(d.monto_kg));
            if (d.monto_km > 0 && t.precio_km) {
                // Pedidos viejos no tienen km_adicional: se cobraban todos los km
                const adicional = d.km_adicional != null ? d.km_adicional : d.km;
                filaDesglose(tbody, `Distancia adicional: ${adicional} km × ${dinero(t.precio_km)}`, dinero(d.monto_km),
                    [t.km_incluidos ? `${d.km} km − ${t.km_incluidos} km incluidos` : null,
                        d.km_aproximada ? 'aproximada (línea recta)' : 'por calle, de A a B'].filter(Boolean).join(' · '));
            }
        }
        if (d.envio_gratis) filaDesglose(tbody, 'Envío gratis', `−${dinero(d.envio_bruto)}`, 'Por el monto de la compra');
        if (d.descuento) filaDesglose(tbody, `Descuento: ${d.descuento.nombre}`, `−${dinero(d.descuento.monto)}`);
        filaDesglose(tbody, 'Costo del envío', dinero(p.costo_envio));
        if (p.monto_compra != null) filaDesglose(tbody, 'Monto de la compra', dinero(p.monto_compra));
        const cobra = [d.cobrar_envio !== false ? 'envío' : null, p.cobrar_compra ? 'compra' : null].filter(Boolean).join(' + ') || 'nada (ya pagado)';
        filaDesglose(tbody, 'A cobrar al entregar', dinero(p.total_cobrar), `Cobra: ${cobra} · ${p.forma_pago === 'tarjeta' ? 'Tarjeta' : 'Efectivo'}`, 'ped-desglose-total');
        if (p.paga_con) filaDesglose(tbody, `Paga con ${dinero(p.paga_con)}`, `Vuelto ${dinero(p.vuelto)}`);
    }

    function dibujarEntrega(entrega, evidencias) {
        const caja = $('#pedDetEntregaCaja');
        caja.hidden = !entrega && !evidencias.length;
        if (caja.hidden) return;

        const dl = $('#pedDetCierre');
        dl.replaceChildren();
        if (entrega) {
            dato(dl, 'Entregado', fechaHora(entrega.entregado_en));
            dato(dl, 'Validado con', entrega.validado_con === 'qr' ? 'QR' : entrega.validado_con === 'codigo' ? 'Código de 4 dígitos' : 'Marcado desde el panel');
            dato(dl, 'Recibió', entrega.recibio_nombre);
            dato(dl, 'Cliente satisfecho', entrega.satisfecho == null ? null : entrega.satisfecho ? 'Sí' : 'No');
            dato(dl, 'Mercadería', entrega.mercaderia_buena == null ? null : entrega.mercaderia_buena ? 'En buen estado' : 'En mal estado');
            dato(dl, 'Retraso', entrega.hubo_retraso ? 'Sí' : null);
            dato(dl, 'Mayoría de edad', entrega.confirma_mayor_edad ? 'Confirmada' : null);
            dato(dl, 'Comentario', entrega.comentario);
        }

        const fotos = $('#pedDetFotos');
        fotos.replaceChildren();
        const tipos = { entrega: 'Entrega', mal_estado: 'Mal estado', retraso: 'Retraso', recepcion: 'Recepción' };
        evidencias.forEach((e) => {
            if (e.eliminada_en || !e.url) {
                const borrada = document.createElement('div');
                borrada.className = 'ped-foto-borrada';
                borrada.textContent = `Foto de ${tipos[e.tipo] || e.tipo} eliminada por antigüedad`;
                fotos.appendChild(borrada);
                return;
            }
            const a = document.createElement('a');
            a.href = e.url;
            a.target = '_blank';
            a.rel = 'noopener';
            a.title = `${tipos[e.tipo] || e.tipo} · ${fechaHora(e.creado_en)}`;
            const img = document.createElement('img');
            img.src = e.url;
            img.alt = a.title;
            img.loading = 'lazy';
            a.appendChild(img);
            fotos.appendChild(a);
        });
    }

    const PED_EVENTOS = {
        registrado: 'Pedido registrado',
        estado: 'Cambio de estado',
        asignado: 'Asignación',
        reprogramado: 'Reprogramado',
        escaneo: 'QR escaneado',
        correccion: 'Corrección',
        anulado: 'Pedido anulado',
        solicitud_reasignacion: 'Solicitud de reasignación',
        solicitud_rechazada: 'Solicitud de reasignación rechazada',
    };

    function dibujarHistorial(eventos) {
        const ol = $('#pedDetHistorial');
        ol.replaceChildren();
        if (!eventos.length) {
            const li = document.createElement('li');
            li.textContent = 'Sin eventos.';
            ol.appendChild(li);
            return;
        }
        eventos.forEach((e) => {
            const li = document.createElement('li');
            const t = document.createElement('time');
            t.dateTime = e.creado_en;
            t.textContent = fechaHora(e.creado_en);
            const titulo = document.createElement('strong');
            let texto = PED_EVENTOS[e.evento] || e.evento;
            if (e.estado_nuevo && e.estado_nuevo !== e.estado_anterior && e.evento !== 'asignado') {
                texto += ` → ${(PED_ESTADOS[e.estado_nuevo] || {}).texto || e.estado_nuevo}`;
            }
            titulo.textContent = texto;
            li.append(t, titulo);

            // Detalles: motivo, marca, piloto, quién
            const d = e.detalle || {};
            const partes = [];
            if (d.fecha) partes.push(`Fecha ${fechaCorta(d.fecha)}`);
            if (d.marca) partes.push(`Horario ${d.marca}`);
            if (d.ruta) partes.push(`Ruta: ${d.ruta}`);
            if (d.piloto) partes.push(`Piloto: ${d.piloto}`);
            if (d.motivo) partes.push(`Motivo: ${d.motivo}`);
            if (d.nota) partes.push(d.nota);
            if (e.usuario_nombre) partes.push(`Por ${e.usuario_nombre}`);
            if (partes.length) {
                const s = document.createElement('small');
                s.textContent = partes.join(' · ');
                li.appendChild(s);
            }
            ol.appendChild(li);
        });
    }

    // ---------- Acciones según el estado y el rol ----------
    //   quien()  -> qué roles ven el botón
    //   estados  -> en qué estados aparece | si(p) -> condición extra
    //   nuevo    -> estado al que pasa     | motivo -> 'requerido' / 'opcional'
    const esSuPiloto = (p) => esPiloto && p.piloto_id === sesion.id;
    const PED_ACCIONES = [
        { id: 'qr', texto: 'QR', icono: 'bi-qr-code', clase: 'boton-secundario', siempre: true, quien: () => puedeGestionar },
        { id: 'bodega', texto: 'Recibido en bodega', icono: 'bi-building-check', estados: ['registrado'], quien: () => puedeGestionar,
          si: (p) => actividadPorCodigo(p.actividad).usa_bodega, nuevo: 'recibido_bodega' },
        // Piloto y horario: SOLO G2 o superior
        { id: 'asignar', texto: 'Asignar piloto y horario', icono: 'bi-person-check', estados: PED_ANTES_DE_SALIR, quien: () => puedeAsignar },
        // El Admin G3 solo lo pide (si no hay otra solicitud pendiente)
        { id: 'solicitar', texto: 'Solicitar reasignación', icono: 'bi-calendar2-week', clase: 'boton-secundario',
          estados: [...PED_ANTES_DE_SALIR, 'no_entregado'], quien: () => puedeSolicitar, si: () => !solicitud },
        // Entrega: SOLO el piloto del pedido
        { id: 'ruta', texto: 'Salí a entregar', icono: 'bi-truck', estados: ['asignado', 'reprogramado'], quien: () => esPiloto,
          si: esSuPiloto, nuevo: 'en_ruta' },
        { id: 'entregado', texto: 'Entregado', icono: 'bi-check2-circle', estados: ['en_ruta'], quien: () => esPiloto, si: esSuPiloto,
          nuevo: 'entregado', motivo: 'opcional',
          ayuda: 'Confirma que entregaste el pedido. (Más adelante se hará desde la app con el QR y la foto.)' },
        { id: 'no_entregado', texto: 'No entregado', icono: 'bi-x-circle', estados: ['en_ruta'], quien: () => esPiloto, si: esSuPiloto,
          nuevo: 'no_entregado', motivo: 'requerido' },
        { id: 'reprogramar', texto: 'Reprogramar', icono: 'bi-calendar-event', estados: ['no_entregado'], quien: () => puedeAsignar },
        { id: 'devuelto', texto: 'Devuelto', icono: 'bi-arrow-return-left', estados: ['no_entregado'], quien: () => puedeCancelar,
          nuevo: 'devuelto', motivo: 'requerido' },
        // Cancelar: Admin G3 o superior (el Empleado no)
        { id: 'cancelar', texto: 'Cancelar pedido', icono: 'bi-slash-circle', clase: 'boton-peligro', estados: PED_ANTES_DE_SALIR,
          quien: () => puedeCancelar, nuevo: 'cancelado', motivo: 'requerido' },
        { id: 'anular', texto: 'Anular', icono: 'bi-trash3', clase: 'boton-peligro', quien: () => puedeAnular,
          estados: ['registrado', 'recibido_bodega', 'asignado', 'reprogramado', 'no_entregado', 'devuelto', 'cancelado'], motivo: 'requerido',
          ayuda: 'Para pedidos registrados por error. El pedido no se borra: queda oculto de las listas y en la auditoría.' },
    ];

    // Acción de la ventana de confirmación para rechazar una solicitud (G2 o superior)
    const ACCION_RECHAZAR = {
        id: 'rechazar_solicitud', texto: 'Rechazar solicitud', clase: 'boton-peligro', motivo: 'requerido',
        ayuda: 'Se le avisará a quien la pidió con el motivo.',
    };

    function dibujarAcciones() {
        const caja = $('#pedDetAcciones');
        caja.replaceChildren();
        const p = pedido;
        PED_ACCIONES.forEach((a) => {
            if (!a.quien()) return;
            const disponible = a.siempre || (!p.anulado && a.estados.includes(p.estado) && (!a.si || a.si(p)));
            if (!disponible) return;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `boton ${a.clase || 'boton-principal'} boton-chico`;
            b.dataset.accionPedido = a.id;
            b.innerHTML = `<i class="bi ${a.icono}"></i> <span></span>`;
            b.querySelector('span').textContent = a.texto;
            caja.appendChild(b);
        });
    }

    $('#pedDetAcciones').addEventListener('click', (evento) => {
        const b = evento.target.closest('button[data-accion-pedido]');
        if (!b || !pedido) return;
        const accion = PED_ACCIONES.find((a) => a.id === b.dataset.accionPedido);
        if (!accion.quien()) return;
        if (accion.id === 'qr') abrirVentanaQr();
        else if (accion.id === 'asignar') abrirAsignar('asignar');
        else if (accion.id === 'reprogramar') abrirAsignar('reprogramar');
        else if (accion.id === 'solicitar') abrirAsignar('solicitar');
        else abrirAccion(accion);
    });

    // ---------- Solicitud de reasignación pendiente ----------
    function dibujarSolicitud() {
        const caja = $('#pedDetSolicitud');
        caja.hidden = !solicitud || pedido.anulado || !puedeGestionar;
        if (caja.hidden) return;
        const d = solicitud.detalle || {};
        const donde = [d.fecha ? `al ${fechaCorta(d.fecha)}` : null, d.marca ? `horario ${d.marca}` : null].filter(Boolean).join(', ');
        $('#pedDetSolicitudTexto').textContent =
            `${solicitud.usuario_nombre || 'El Admin G3'} solicitó reasignar la entrega ${donde}. Motivo: ${d.motivo || '—'}.` +
            (puedeAsignar ? '' : ' Esperando la respuesta del Admin G2.');

        const botones = $('#pedDetSolicitudBotones');
        botones.replaceChildren();
        if (!puedeAsignar) return;
        [['aplicar', 'Aplicar', 'boton-principal'], ['rechazar', 'Rechazar', 'boton-secundario']].forEach(([id, texto, clase]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `boton ${clase} boton-chico`;
            b.dataset.solicitud = id;
            b.textContent = texto;
            botones.appendChild(b);
        });
    }

    $('#pedDetSolicitudBotones').addEventListener('click', (evento) => {
        const b = evento.target.closest('button[data-solicitud]');
        if (!b || !solicitud || !puedeAsignar) return;
        if (b.dataset.solicitud === 'aplicar') abrirAsignar('aplicar');
        else abrirAccion(ACCION_RECHAZAR);
    });

    // Al resolver una solicitud: se cierran los avisos y se avisa a quien la pidió (js/notificaciones.js)
    async function cerrarSolicitud(aprobada, motivo = '') {
        if (!solicitud) return;
        await resolverPendientes('pedido_reasignacion', pedido.id);
        await notificarResultado({
            usuarioId: solicitud.usuario_id,
            aprobado: aprobada,
            titulo: aprobada ? 'Reasignación aplicada' : 'Reasignación rechazada',
            mensaje: aprobada
                ? `Se reasignó el pedido ${pedido.codigo}.`
                : `No se reasignó el pedido ${pedido.codigo}. Motivo: ${motivo}`,
            enlace: `#pedidos?id=${pedido.id}`,
            referenciaTipo: 'pedido_reasignacion',
            referenciaId: pedido.id,
        });
    }

    // Recarga el detalle después de un cambio
    const recargarDetalle = () => abrirDetalle(pedido.id, false);

    // Cambia el estado solo si el pedido sigue en el estado que se ve
    // (si otra persona lo cambió mientras tanto, avisa en vez de pisarlo)
    async function cambiarEstado(nuevo, cambios = {}, detalleEvento = {}) {
        const antes = pedido.estado;
        const { data, error } = await db.from('pedidos')
            .update({ estado: nuevo, actualizado_en: new Date().toISOString(), ...cambios })
            .eq('id', pedido.id).eq('estado', antes).select('id');
        if (error) return error;
        if (!data.length) return { mensajePropio: 'Otra persona cambió este pedido. Se recargó con los datos actuales.' };
        const his = await registrarEvento(pedido.id, 'estado', { antes, despues: nuevo, detalle: detalleEvento });
        return his.error || null;
    }

    // ---------- Ventana de confirmación (con motivo) ----------
    const dlgAccion = $('#pedAccionDialogo');
    let accionActual = null;

    function abrirAccion(accion) {
        accionActual = accion;
        $('#pedAccionTitulo').textContent = accion.texto;
        const estadoNuevo = accion.nuevo ? (PED_ESTADOS[accion.nuevo] || {}).texto : null;
        $('#pedAccionTexto').textContent = [
            estadoNuevo ? `El pedido ${pedido.codigo} pasará a "${estadoNuevo}".` : `Pedido ${pedido.codigo}.`,
            accion.ayuda || '',
        ].join(' ');
        $('#pedAccionMotivoCaja').hidden = !accion.motivo;
        $('#pedAccionMotivoEtiqueta').textContent = accion.motivo === 'requerido' ? 'Motivo *' : 'Nota (opcional)';
        $('#pedAccionMotivo').value = '';
        // Entregado con alcohol: confirmar mayoría de edad (sin excepción)
        const pideEdad = accion.id === 'entregado' && pedido.lleva_alcohol;
        $('#pedAccionEdadCaja').hidden = !pideEdad;
        $('#pedAccionEdad').checked = false;
        $('#pedAccionError').textContent = '';
        const si = $('#pedAccionSi');
        si.className = `boton ${accion.clase === 'boton-peligro' ? 'boton-peligro' : 'boton-principal'}`;
        dlgAccion.showModal();
        if (accion.motivo) $('#pedAccionMotivo').focus();
    }

    $('#pedAccionCancelar').addEventListener('click', () => dlgAccion.close());

    $('#pedAccionForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const accion = accionActual;
        if (!accion || !pedido) return;
        if (accion.quien ? !accion.quien() : !puedeAsignar) return;
        const motivo = $('#pedAccionMotivo').value.trim();
        const error = $('#pedAccionError');
        if (accion.motivo === 'requerido' && !motivo) {
            error.textContent = 'Escribe el motivo.';
            return;
        }
        if (!$('#pedAccionEdadCaja').hidden && !$('#pedAccionEdad').checked) {
            error.textContent = 'El pedido lleva alcohol: hay que confirmar la mayoría de edad.';
            return;
        }

        const si = $('#pedAccionSi');
        si.disabled = true;
        let resultado = null;

        if (accion.id === 'rechazar_solicitud') {
            // Rechazar la solicitud de reasignación del Admin G3 (no cambia el pedido)
            resultado = (await registrarEvento(pedido.id, 'solicitud_rechazada', { detalle: { motivo } })).error || null;
            if (!resultado) await cerrarSolicitud(false, motivo);
        } else if (accion.id === 'anular') {
            // Anular: no cambia el estado; se marca y queda en la auditoría
            const upd = await db.from('pedidos')
                .update({ anulado: true, motivo_cancelacion: motivo, actualizado_en: new Date().toISOString() })
                .eq('id', pedido.id).select('id');
            resultado = upd.error || (await registrarEvento(pedido.id, 'anulado', { antes: pedido.estado, detalle: { motivo } })).error;
        } else {
            const cambios = accion.nuevo === 'cancelado' ? { motivo_cancelacion: motivo } : {};
            resultado = await cambiarEstado(accion.nuevo, cambios, motivo ? (accion.motivo === 'requerido' ? { motivo } : { nota: motivo }) : {});
            // Entregado por el piloto desde el panel: se guarda un cierre mínimo
            // (la app guardará además el QR / código, la satisfacción y las fotos)
            if (!resultado && accion.id === 'entregado') {
                const ent = await db.from('pedido_entregas').upsert({
                    pedido_id: pedido.id, piloto_id: sesion.id || pedido.piloto_id,
                    recibio_nombre: pedido.recibe_tipo === 'autorizado' ? pedido.recibe_nombre : pedido.cliente_nombre,
                    confirma_mayor_edad: pedido.lleva_alcohol ? true : null,
                    comentario: motivo || 'Marcado como entregado por el piloto desde el panel',
                });
                resultado = ent.error || null;
            }
        }

        si.disabled = false;
        dlgAccion.close();
        if (resultado) {
            console.error(`Error en la acción ${accion.id}:`, resultado);
            aviso.mostrar(resultado.mensajePropio || 'No se pudo completar la acción. Intenta de nuevo.', 'error');
        } else {
            aviso.mostrar(accion.id === 'anular' ? `Pedido ${pedido.codigo} anulado.`
                : accion.id === 'rechazar_solicitud' ? 'Solicitud rechazada; se avisó a quien la pidió.'
                    : `Pedido ${pedido.codigo}: ${(PED_ESTADOS[accion.nuevo] || {}).texto}.`);
        }
        recargarDetalle();
    });

    // ---------- Asignar / Reprogramar / Solicitar / Aplicar solicitud ----------
    // Modos de la misma ventana:
    //   'asignar'     -> G2+: fecha, horario, ruta y piloto (vacío = el de la ruta)
    //   'reprogramar' -> G2+: después de "No entregado" (con motivo)
    //   'solicitar'   -> Admin G3 / Empleado: pide otra fecha / horario (con motivo); NO cambia el pedido
    //   'aplicar'     -> G2+: aplica lo que se pidió (viene prellenado)
    const dlgAsignar = $('#pedAsignarDialogo');
    let modoAsig = 'asignar';
    let marcasAsig = [];

    const TITULOS_ASIG = {
        asignar: 'Asignar piloto y horario',
        reprogramar: 'Reprogramar entrega',
        solicitar: 'Solicitar reasignación de horario',
        aplicar: 'Aplicar la reasignación solicitada',
    };

    async function abrirAsignar(modo) {
        if (modo === 'solicitar' ? !puedeSolicitar : !puedeAsignar) return;
        modoAsig = modo;
        const d = modo === 'aplicar' && solicitud ? (solicitud.detalle || {}) : {};
        $('#pedAsignarTitulo').textContent = TITULOS_ASIG[modo];
        $('#pedAsigPilotoCaja').hidden = modo === 'solicitar'; // quien solicita no elige piloto ni ruta
        $('#pedAsigRutaCaja').hidden = modo === 'solicitar' || !rutas.length;
        $('#pedAsigMotivoCaja').hidden = !['reprogramar', 'solicitar'].includes(modo);
        $('#pedAsigMotivo').value = '';
        $('#pedAsignarError').textContent = '';

        const fecha = $('#pedAsigFecha');
        fecha.min = fechaHoy();
        let inicial = pedido.fecha_entrega < fechaHoy() ? fechaHoy() : pedido.fecha_entrega;
        if (modo === 'reprogramar') inicial = fechaHoy();
        if (d.fecha) inicial = d.fecha < fechaHoy() ? fechaHoy() : d.fecha;
        fecha.value = inicial;

        llenarRutas($('#pedAsigRuta'), rutasDe(pedido.tienda_id, pedido.actividad), pedido.ruta_id);
        await Promise.all([
            actualizarMarcasAsig(d.marca || (modo === 'reprogramar' ? null : pedido.marca_numero)),
            actualizarPilotosAsig(pedido.piloto_id),
        ]);
        dlgAsignar.showModal();
    }

    // Lista de pilotos marcando los de la ruta elegida esa fecha
    async function actualizarPilotosAsig(actual) {
        const deRuta = await pilotosDeRuta(Number($('#pedAsigRuta').value) || null, $('#pedAsigFecha').value);
        llenarPilotos($('#pedAsigPiloto'), pedido.tienda_id, actual, deRuta);
    }
    $('#pedAsigRuta').addEventListener('change', () => actualizarPilotosAsig(Number($('#pedAsigPiloto').value) || null));

    async function actualizarMarcasAsig(actual) {
        const fecha = $('#pedAsigFecha').value;
        marcasAsig = fecha ? await marcasConOcupacion(fecha, pedido.tienda_id, pedido.id) : [];
        // Se deja elegida la marca si existe ese día y no está llena
        const sirve = marcasAsig.some((m) => m.numero === actual && !m.llena);
        const mismaFecha = fecha === pedido.fecha_entrega;
        llenarMarcas($('#pedAsigMarca'), marcasAsig, sirve || mismaFecha ? actual : null);
    }

    $('#pedAsigFecha').addEventListener('change', () => {
        actualizarMarcasAsig(pedido.marca_numero);
        actualizarPilotosAsig(Number($('#pedAsigPiloto').value) || null);
    });
    $('#pedAsignarCancelar').addEventListener('click', () => dlgAsignar.close());

    $('#pedAsignarForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const error = $('#pedAsignarError');
        error.textContent = '';
        const modo = modoAsig;
        if (modo === 'solicitar' ? !puedeSolicitar : !puedeAsignar) return;
        const fecha = $('#pedAsigFecha').value;
        const marca = $('#pedAsigMarca').value ? Number($('#pedAsigMarca').value) : null;
        const ruta = rutas.length && $('#pedAsigRuta').value ? Number($('#pedAsigRuta').value) : null;
        const pilotoManual = $('#pedAsigPiloto').value ? Number($('#pedAsigPiloto').value) : null;
        const motivo = $('#pedAsigMotivo').value.trim();
        if (!fecha) { error.textContent = 'Elige la fecha.'; return; }
        const m = marcasAsig.find((x) => x.numero === marca);
        if (m && m.llena) { error.textContent = `El horario ${marca} ya está lleno.`; return; }
        if (['reprogramar', 'solicitar'].includes(modo) && !motivo) { error.textContent = 'Escribe el motivo.'; return; }

        // ----- Admin G3 / Empleado: solo deja la solicitud y avisa al G2 de la región -----
        if (modo === 'solicitar') {
            const his = await registrarEvento(pedido.id, 'solicitud_reasignacion', {
                antes: pedido.estado, despues: pedido.estado, detalle: { fecha, marca, motivo },
            });
            dlgAsignar.close();
            if (his.error) {
                console.error('Error al solicitar la reasignación:', his.error);
                aviso.mostrar('No se pudo enviar la solicitud.', 'error');
            } else {
                await notificarPendiente({ // js/notificaciones.js
                    referenciaTipo: 'pedido_reasignacion', referenciaId: pedido.id, tiendaId: pedido.tienda_id,
                    soloRegion: true,
                    titulo: 'Reasignación de horario solicitada',
                    mensaje: `${sesion.nombre || 'La tienda'} pide mover el pedido ${pedido.codigo} al ${fechaCorta(fecha)}` +
                        `${marca ? `, horario ${marca}` : ''}. Motivo: ${motivo}`,
                    enlace: `#pedidos?id=${pedido.id}`,
                });
                aviso.mostrar('Solicitud enviada al Admin G2 de la región.');
            }
            recargarDetalle();
            return;
        }

        // ----- G2 o superior: asigna / reprograma / aplica -----
        // "Aplicar" sobre un pedido no entregado cuenta como reprogramación
        const reprograma = modo === 'reprogramar' || (modo === 'aplicar' && pedido.estado === 'no_entregado');
        // Piloto vacío = el de la ruta esa fecha
        const piloto = pilotoManual || await pilotoAutomatico(ruta, fecha, pedido.id);
        const act = actividadPorCodigo(pedido.actividad);
        let nuevo = pedido.estado;
        if (reprograma) nuevo = 'reprogramado';
        else if (piloto && ['registrado', 'recibido_bodega'].includes(pedido.estado)) nuevo = 'asignado';
        else if (!piloto && pedido.estado === 'asignado') nuevo = act.usa_bodega ? 'recibido_bodega' : 'registrado';

        const motivoFinal = motivo || (modo === 'aplicar' && solicitud ? `Solicitado por ${solicitud.usuario_nombre || 'Admin G3'}: ${(solicitud.detalle || {}).motivo || ''}` : '');
        const cambios = { fecha_entrega: fecha, marca_numero: marca, piloto_id: piloto, actualizado_en: new Date().toISOString() };
        if (rutas.length) cambios.ruta_id = ruta; // la columna existe si la base tiene rutas
        const antes = pedido.estado;
        const upd = await db.from('pedidos').update({ ...cambios, estado: nuevo }).eq('id', pedido.id).eq('estado', antes).select('id');
        let fallo = upd.error || (!upd.data.length ? { mensajePropio: 'Otra persona cambió este pedido. Se recargó con los datos actuales.' } : null);
        if (!fallo) {
            const his = await registrarEvento(pedido.id, reprograma ? 'reprogramado' : 'asignado', {
                antes, despues: nuevo,
                detalle: {
                    fecha, marca, ruta: nombreRuta(ruta) || undefined,
                    piloto: piloto ? `${nombrePiloto(piloto) || ''}${pilotoManual ? '' : ' (de la ruta)'}` : 'Sin piloto',
                    motivo: motivoFinal || undefined,
                },
            });
            fallo = his.error || null;
        }
        // Cualquier asignación cierra la solicitud pendiente del G3 (se le avisa)
        if (!fallo && solicitud) await cerrarSolicitud(true);

        dlgAsignar.close();
        if (fallo) {
            console.error('Error al asignar:', fallo);
            aviso.mostrar(fallo.mensajePropio || 'No se pudo guardar la asignación.', 'error');
        } else {
            aviso.mostrar(reprograma ? 'Entrega reprogramada.' : 'Asignación guardada.');
        }
        recargarDetalle();
    });

    // ==================================================
    // QR: tarjeta para el cliente (imagen), descargar, compartir y WhatsApp
    // ==================================================

    const dlgQr = $('#pedQrDialogo');
    const lienzo = $('#pedQrCanvas');

    // Dibuja la tarjeta: logo en texto, QR, código del pedido y código de respaldo
    function dibujarTarjetaQr(p) {
        const ctx = lienzo.getContext('2d');
        const ancho = lienzo.width;
        const alto = lienzo.height;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, ancho, alto);

        // Encabezado azul marino con el nombre
        ctx.fillStyle = '#07305C';
        ctx.fillRect(0, 0, ancho, 90);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 34px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ACACHETE', ancho / 2, 48);
        ctx.fillStyle = '#F2660F';
        ctx.font = 'bold 16px Arial, sans-serif';
        ctx.fillText('L O G I S T I C S', ancho / 2, 74);

        // QR
        const qr = window.qrcode(0, 'M');
        qr.addData(PED_QR_PREFIJO + p.token_qr);
        qr.make();
        const modulos = qr.getModuleCount();
        const lado = 400;
        const celda = Math.floor(lado / modulos);
        const tam = celda * modulos;
        const x0 = Math.round((ancho - tam) / 2);
        const y0 = 120;
        ctx.fillStyle = '#000000';
        for (let f = 0; f < modulos; f++) {
            for (let c = 0; c < modulos; c++) {
                if (qr.isDark(f, c)) ctx.fillRect(x0 + c * celda, y0 + f * celda, celda, celda);
            }
        }

        // Textos
        let y = y0 + tam + 60;
        ctx.fillStyle = '#1F2937';
        ctx.font = 'bold 40px Arial, sans-serif';
        ctx.fillText(p.codigo, ancho / 2, y);
        y += 44;
        ctx.font = '22px Arial, sans-serif';
        ctx.fillStyle = '#4B5563';
        ctx.fillText(`Código de entrega: ${p.codigo_respaldo}`, ancho / 2, y);
        if (p.codigo_telefono && p.codigo_telefono !== p.codigo_respaldo) {
            y += 30;
            ctx.font = '18px Arial, sans-serif';
            ctx.fillText('(o los últimos 4 dígitos de tu teléfono)', ancho / 2, y);
        }
        y += 40;
        ctx.font = '18px Arial, sans-serif';
        ctx.fillStyle = '#6B7280';
        ctx.fillText('Muestra este QR a quien te entrega el pedido.', ancho / 2, Math.min(y, alto - 20));
    }

    // Teléfono para WhatsApp: solo dígitos y con código de país si tiene 8
    function telefonoWhatsapp(tel) {
        const d = (tel || '').replace(/\D/g, '');
        return d.length === 8 ? PED_CODIGO_PAIS + d : d;
    }

    function mensajeCliente(p) {
        const tienda = tiendaPorId(p.tienda_id);
        return [
            `Hola ${p.cliente_nombre}, tu pedido ${p.codigo}${tienda ? ` de ${tienda.nombre}` : ''} está registrado.`,
            `Entrega: ${fechaCorta(p.fecha_entrega)}.`,
            `Código de entrega: ${p.codigo_respaldo}.`,
            'Guarda la imagen del QR y muéstrala (o di el código) a quien te entregue el pedido.',
        ].join('\n');
    }

    async function abrirVentanaQr() {
        const p = pedido;
        $('#pedQrTitulo').textContent = `QR del pedido ${p.codigo}`;
        try {
            await cargarLibreriaQr();
            dibujarTarjetaQr(p);
        } catch (e) {
            console.error(e);
            aviso.mostrar('No se pudo generar el QR (revisa la conexión a internet).', 'error');
            return;
        }
        $('#pedQrTexto').textContent = 'Envíale esta imagen al cliente (o que le tome una foto) para que la reenvíe a quien recibe.';
        $('#pedQrWhatsapp').href = `https://wa.me/${telefonoWhatsapp(p.cliente_telefono)}?text=${encodeURIComponent(mensajeCliente(p))}`;

        // "Compartir" solo si el navegador puede compartir archivos (celulares)
        const compartir = $('#pedQrCompartir');
        compartir.hidden = true;
        lienzo.toBlob((blob) => {
            if (!blob) return;
            const archivo = new File([blob], `pedido-${p.codigo}.png`, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
                compartir.hidden = false;
                compartir.onclick = () => navigator.share({ files: [archivo], text: mensajeCliente(p) }).catch(() => {});
            }
        }, 'image/png');

        dlgQr.showModal();
    }

    $('#pedQrDescargar').addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = lienzo.toDataURL('image/png');
        a.download = `pedido-${pedido.codigo}.png`;
        a.click();
    });
    $('#pedQrCerrar').addEventListener('click', () => dlgQr.close());

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================

    (async () => {
        const error = await cargarBase();
        if (error) {
            console.error('Error al cargar pedidos:', error);
            if (faltaTabla(error)) $('#pedFaltaSql').hidden = false;
            else aviso.mostrar('No se pudo cargar la información. Revisa la conexión.', 'error');
            return;
        }

        const params = parametrosSeccion(); // js/pagina_inicial.js
        if (params.get('nuevo') && puedeGestionar) {
            abrirNuevo();
        } else if (params.get('id')) {
            abrirDetalle(Number(params.get('id')), params.get('qr') === '1', params.get('abrir'));
        } else {
            mostrarVista('pedLista');
            prepararFiltros();
            cargarLista();
        }
    })();

    return () => {
        aviso.limpiar();
        [dlgQr, dlgAsignar, dlgAccion].forEach((d) => { if (d.open) d.close(); });
        if (mapaRuta) mapaRuta.destruir();
    };
});
