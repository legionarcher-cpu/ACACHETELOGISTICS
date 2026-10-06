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
                            Mapa A -> B (js/mapa.js, gratis), igual que en el Cotizador:
                            campos "A · Punto de partida" (vacío = la tienda; desactivado si la
                            actividad no usa punto de partida) y "B · Entrega" juntos sobre el
                            mapa; los km por calle se cobran si la tarifa tiene
                            precio por km (distancia_km + detalle.ruta con los puntos).
     #pedidos?id=15      -> DETALLE: datos, mercadería, cobro, entrega, línea de tiempo,
                            QR y acciones según el estado. (&qr=1 abre el QR al entrar)

   QUIÉN VE QUÉ (lo controla la página; la regla real llega en la Fase 7):
     - Administrador y Admin G1: todos los pedidos.
     - Admin G2: pedidos de las tiendas de su región.
     - Admin G3 y Empleado: pedidos de su tienda.
     - Registran pedidos: todos menos el Piloto. El piloto sale de la ruta
       (solo G2 o superior pueden elegir otro a mano).
     - ASIGNAR piloto y REASIGNAR horario / fecha / ruta: SOLO G2 o superior.
       Admin G3 y Empleado solo pueden SOLICITAR la reasignación (le llega al
       G2 de la región por la campana; el G2 la aplica o la rechaza).
     - CANCELAR: Admin G3 o superior (el Empleado no). Ya no se anula.
     - SLOT (rango de despacho, Configuración -> Slots): lo elige el empleado al
       registrar y lo confirma al marcar "Listo para despachar". El HORARIO del
       piloto (marca) solo lo ven el piloto y G2 o superior.
     - DESPACHO (Empleado, G3 y superiores): "Alistando" -> "Listo para despachar"
       (slot) -> "Aprobar salida": dentro del pedido, escanear el QR que muestra el piloto.
     - PILOTO (solo sus pedidos): "Recibido para ruta" (abre el QR), "Saliendo a
       ruta" (en Inicio), "Entregar ahora" (uno a la vez) y "Entregado" / "No entregado".

   REGLAS:
     - Un pedido NUNCA se borra: se cancela (con motivo).
     - Cada cambio queda en la línea de tiempo (tabla pedido_historial).
     - El número de pedido lo pone la base de datos (automático) o lo escribe
       el empleado (manual), según Configuración -> Pedidos.
     - El QR lleva solo un código seguro (token_qr), no datos personales.

   Estilos: css/secciones/pedidos.css + css/componentes.css
   ================================================== */

// Librería para dibujar el QR (se descarga solo al abrir un QR)
const PED_QR_LIBRERIA = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
// Librería GRATIS para LEER el QR con la cámara (se descarga solo al abrir "Aprobar salida")
const PED_LECTOR_QR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
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
    alistando:            { texto: 'Alistando',                color: 'etiqueta-naranja' },
    listo_despacho:       { texto: 'Listo para despachar',     color: 'etiqueta-azul' },
    recibido_ruta:        { texto: 'Recibido para ruta',       color: 'etiqueta-morada' },
    cargado:              { texto: 'Cargado',                  color: 'etiqueta-turquesa' },
    en_ruta:              { texto: 'En ruta',                  color: 'etiqueta-turquesa' },
    en_entrega:           { texto: 'Entregando',               color: 'etiqueta-turquesa' },
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
    { id: 'despacho',    texto: 'En despacho',   color: 'resumen-azul',     estados: ['alistando', 'listo_despacho', 'recibido_ruta', 'cargado'] },
    { id: 'ruta',        texto: 'En ruta',       color: 'resumen-turquesa', estados: ['en_ruta', 'en_entrega'] },
    { id: 'entregados',  texto: 'Entregados',    color: 'resumen-verde',    estados: ['entregado', 'entregado_incidencia'] },
    { id: 'problemas',   texto: 'No entregados', color: 'resumen-rosada',   estados: ['no_entregado', 'devuelto'] },
    { id: 'cancelados',  texto: 'Cancelados',    color: 'resumen-naranja',  estados: ['cancelado'] },
];

// Estados desde los que se puede empezar a alistar
const PED_POR_ALISTAR = ['registrado', 'recibido_bodega', 'asignado', 'reprogramado'];
// Estados en los que el pedido todavía no salió (se puede asignar o cancelar)
const PED_ANTES_DE_SALIR = [...PED_POR_ALISTAR, 'alistando', 'listo_despacho', 'recibido_ruta', 'cargado'];

// ---------- PEDIDOS CERCANOS (aprovechar un mismo viaje) ----------
// Al registrar un pedido (y en su detalle) se buscan los pedidos del MISMO DÍA, todavía
// sin entregar, cuya recolección o entrega quede a menos de PED_RADIO_CERCANO_KM en línea
// recta de la recolección o la entrega de este. Se sugiere el mismo piloto y se le avisa.
// (Cuando A es la tienda no se compara: todos los pedidos de la tienda salen de ahí.)
const PED_RADIO_CERCANO_KM = 1;   // subir o bajar para el plan piloto
const PED_PENDIENTES_DE_VIAJE = [...PED_ANTES_DE_SALIR, 'en_ruta', 'en_entrega'];

// Kilómetros en línea recta entre dos puntos { lat, lng }
function pedKmRecta(a, b) {
    const rad = (g) => (g * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// Puntos que cuentan de una ruta { origen, a, b }: la recolección (si no es la tienda) y la entrega
function pedPuntosDeRuta(ruta) {
    if (!ruta) return [];
    return [
        ruta.origen === 'recoleccion' && ruta.a ? { tipo: 'recoleccion', punto: ruta.a } : null,
        ruta.b ? { tipo: 'entrega', punto: ruta.b } : null,
    ].filter(Boolean);
}

// Pedidos de "otros" cercanos a la ruta: [{ pedido, km, mio, suyo }] del más cercano al más lejano.
// mio / suyo: 'recoleccion' | 'entrega' (qué punto de cada uno queda cerca)
function pedCercanosDe(ruta, otros, radioKm = PED_RADIO_CERCANO_KM) {
    const mios = pedPuntosDeRuta(ruta);
    if (!mios.length) return [];
    const cercanos = [];
    otros.forEach((o) => {
        let mejor = null;
        mios.forEach((m) => pedPuntosDeRuta((o.detalle || {}).ruta).forEach((s) => {
            const km = pedKmRecta(m.punto, s.punto);
            if (km <= radioKm && (!mejor || km < mejor.km)) mejor = { km, mio: m.tipo, suyo: s.tipo };
        }));
        if (mejor) cercanos.push({ pedido: o, ...mejor });
    });
    return cercanos.sort((x, y) => x.km - y.km);
}

// "600 m" / "1.2 km"
const pedTextoDistancia = (km) => (km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} m` : `${km.toFixed(1)} km`);

// "La entrega queda a 600 m de la recolección de P-000123"
function pedTextoCercano(c, sujeto = 'Esta') {
    const nombre = { recoleccion: 'recolección', entrega: 'entrega' };
    return `${sujeto} ${nombre[c.mio]} queda a ${pedTextoDistancia(c.km)} de la ${nombre[c.suyo]} de ${c.pedido.codigo}`;
}

// Descarga un script una sola vez (librerías gratis de jsDelivr)
const pedScripts = new Map();
function cargarScriptPed(url, global) {
    if (window[global]) return Promise.resolve();
    if (!pedScripts.has(url)) {
        pedScripts.set(url, new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = () => resolve();
            script.onerror = () => { pedScripts.delete(url); script.remove(); reject(new Error(`No se pudo descargar ${url}`)); };
            document.head.appendChild(script);
        }));
    }
    return pedScripts.get(url);
}

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
    // Alistar, marcar listo para despachar (con su slot) y escanear el QR del piloto:
    // Empleado, Admin G3 y superiores (todos menos el piloto)
    const puedeDespachar = puedeGestionar;
    // El horario del piloto (marca) solo lo ven el piloto y Admin G2 en adelante
    const verMarca = esPiloto || puedeAsignar;

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
        // Solo las actividades de pedidos que realiza la empresa (empresas/empresas.js);
        // las de viajes (Transporte) se manejan en la sección Viajes
        actividades = actividadesDePedidos(act.data);
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

    // Pedidos del mismo día, sin entregar, cerca de una ruta { origen, a, b } (ver PED_RADIO_CERCANO_KM).
    // Devuelve [{ pedido: { id, codigo, estado, piloto_id, tienda_id }, km, mio, suyo }] o [] si falla.
    async function buscarCercanos(ruta, fecha, excluirId = null) {
        if (!fecha || !pedPuntosDeRuta(ruta).length) return [];
        const { data, error } = await db.from('pedidos')
            .select('id, codigo, estado, piloto_id, tienda_id, detalle')
            .eq('fecha_entrega', fecha).eq('anulado', false).in('estado', PED_PENDIENTES_DE_VIAJE).limit(500);
        if (error) {
            console.error('Error al buscar pedidos cercanos:', error);
            return [];
        }
        return pedCercanosDe(ruta, data.filter((p) => p.id !== excluirId));
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

    // ---------- Slots de despacho (Configuración -> Slots; slots_del_dia en sql/00) ----------
    // Slots de una fecha con cuántos pedidos tiene ya cada uno en esa tienda (sin límite).
    // Sin el bloque 12 de sql/01 la función no existe: se trabaja sin slots.
    async function slotsConOcupacion(fecha, tiendaId, excluirId = null) {
        if (!fecha) return [];
        const [slots, ocupados] = await Promise.all([
            db.rpc('slots_del_dia', { p_fecha: fecha }),
            db.from('pedidos').select('id, slot_numero')
                .eq('tienda_id', tiendaId || 0).eq('fecha_entrega', fecha).eq('anulado', false)
                .neq('estado', 'cancelado').not('slot_numero', 'is', null),
        ]);
        if (slots.error) {
            console.error('Error al cargar los slots (¿falta sql/01, bloque 12?):', slots.error);
            return [];
        }
        const lista = ocupados.error ? [] : ocupados.data;
        return slots.data.map((s) => ({ ...s, usados: lista.filter((p) => p.slot_numero === s.numero && p.id !== excluirId).length }));
    }

    // "Slot 2 · 10:00–12:00"
    const textoSlot = (s) => `Slot ${s.numero} · ${hhmm(s.inicio)}–${hhmm(s.fin)}`;

    // Llena un <select> de slots: "Slot 2 · 10:00–12:00 (3 pedidos)"
    function llenarSlots(select, slots, actual = null, conVacio = true) {
        select.replaceChildren();
        if (conVacio) select.appendChild(new Option('Sin slot (se elige al marcarlo listo)', ''));
        slots.forEach((s) => select.appendChild(new Option(`${textoSlot(s)} (${plural(s.usados, 'pedido', 'pedidos')})`, s.numero)));
        if (!slots.length) select.appendChild(new Option('No hay slots ese día (Configuración → Slots)', '', false, false)).disabled = true;
        select.value = actual != null && slots.some((s) => s.numero === actual) ? String(actual) : (conVacio || !slots[0] ? '' : String(slots[0].numero));
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

        // Enlaces de los cuadros de Inicio: #pedidos?grupo=ruta (lista ya filtrada)
        // y &fecha=todas (todas las fechas, ej. pedidos sin piloto)
        const params = parametrosSeccion();
        const grupo = params.get('grupo');
        if (grupo && PED_GRUPOS.some((g) => g.id === grupo)) {
            filtroEstado.value = `g:${grupo}`;
            if (filtroEstado.value !== `g:${grupo}`) filtroEstado.value = ''; // grupo que la actividad no usa
        }
        if (params.get('fecha') === 'todas') filtroFecha.value = '';
        // #pedidos?tienda=3 ("Hoy por tienda" de Inicio)
        const tiendaPedida = params.get('tienda');
        if (tiendaPedida && tiendas.some((t) => String(t.id) === tiendaPedida)) filtroTienda.value = tiendaPedida;
    }

    async function cargarLista() {
        $('#pedContador').textContent = 'Cargando pedidos...';
        const consulta = (conSlot) => {
            let q = db.from('pedidos').select(
                'id, codigo, actividad, tienda_id, cliente_nombre, cliente_telefono, direccion_recoleccion, direccion_entrega, ' +
                'fecha_entrega, marca_numero, piloto_id, estado, anulado, monto_compra, total_cobrar, peso_total_kg, lleva_alcohol, creado_en' +
                (conSlot ? ', slot_numero' : '') + // slot_numero: sql/01 bloque 12
                (rutas.length ? ', ruta_id' : '')); // ruta_id existe solo si la base tiene rutas

            // Alcance del rol
            if (esPiloto) q = q.eq('piloto_id', sesion.id || 0);
            else if (!esGeneral) q = q.in('tienda_id', tiendas.length ? tiendas.map((t) => t.id) : [0]);

            // Se cargan todas las actividades de la empresa (para el número de cada
            // pestaña); la lista muestra solo la de la pestaña (separarPorActividad)
            if (actividades.length) q = q.in('actividad', actividades.map((a) => a.codigo));
            if (filtroFecha.value) q = q.eq('fecha_entrega', filtroFecha.value);
            if (filtroTienda.value) q = q.eq('tienda_id', Number(filtroTienda.value));
            q = q.eq('anulado', false); // los anulados de antes no se muestran (ya no se anula: se cancela)

            q = q.order('fecha_entrega', { ascending: false });
            if (conSlot) q = q.order('slot_numero', { ascending: true, nullsFirst: false });
            return q.order('marca_numero', { ascending: true, nullsFirst: false })
                .order('creado_en', { ascending: false }).limit(500);
        };
        let { data, error } = await consulta(true);
        if (error && error.code === '42703') ({ data, error } = await consulta(false));

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
                rec.textContent = `Punto de partida: ${p.direccion_recoleccion}`;
                tdEntrega.appendChild(rec);
            }
            if (!filtroFecha.value) {
                const f = document.createElement('small');
                f.className = 'ped-sub';
                f.textContent = fechaCorta(p.fecha_entrega);
                tdEntrega.appendChild(f);
            }
            tr.appendChild(tdEntrega);

            // Slot, horario del piloto (solo piloto y G2+) y ruta: "Slot 1 · Horario 2 · Ruta 1"
            tr.appendChild(crearCelda([
                p.slot_numero ? `Slot ${p.slot_numero}` : null,
                verMarca && p.marca_numero ? `Horario ${p.marca_numero}` : null,
                nombreRuta(p.ruta_id),
            ].filter(Boolean).join(' · ') || null));
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

    [filtroFecha, filtroTienda].forEach((el) => el.addEventListener('change', cargarLista));
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
    const selSlot = $('#pedSlot');
    const selPiloto = $('#pedPiloto');
    const inputFecha = $('#pedFecha');
    const cajaCategorias = $('#pedCategorias');
    const cajaDetalleCat = $('#pedCategoriasDetalle');
    const inputMonto = $('#pedMontoCompra');
    const selDescuento = $('#pedDescuento');
    const formError = $('#pedFormError');

    // Datos del formulario
    let clienteId = null;  // cliente elegido en el buscador (null = escrito a mano)
    let clienteElegido = null; // su ficha (dirección y ubicación guardadas)
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

    // Campo A (como en el Cotizador). Sin recolección en la actividad: desactivado, A = la tienda.
    // Lo escrito se guarda aparte por si se vuelve a una actividad con recolección.
    function actualizarCampoA() {
        const conRecoleccion = usa('usa_recoleccion');
        if (!conRecoleccion && inputRecoleccion.value) {
            inputRecoleccion.dataset.guardado = inputRecoleccion.value;
            inputRecoleccion.value = '';
        } else if (conRecoleccion && inputRecoleccion.dataset.guardado) {
            inputRecoleccion.value = inputRecoleccion.dataset.guardado;
            delete inputRecoleccion.dataset.guardado;
        }
        inputRecoleccion.disabled = !conRecoleccion;
        const t = tiendaForm();
        const tienda = t ? `${t.codigo}${t.direccion ? ` · ${t.direccion}` : ''}` : 'la tienda';
        inputRecoleccion.placeholder = conRecoleccion ? `Vacío = sale de la tienda (${tienda})` : `Sale de la tienda: ${tienda}`;
        $('#pedEtiquetaA').textContent = conRecoleccion ? 'A · Punto de partida' : 'A · Tienda';
    }

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
                programarCercanos();
            },
        });
    }

    // ---------- Pedidos cercanos (un solo viaje) ----------
    // Con A o B ubicados y la fecha elegida, se muestran los pedidos del mismo día, sin
    // entregar, que quedan cerca (PED_RADIO_CERCANO_KM). G2 o superior puede asignar el
    // nuevo pedido al mismo piloto con un toque; al registrarlo se avisa (ver más abajo).
    let cercanosForm = [];        // [{ pedido, km, mio, suyo }]
    let cercanosTemporizador = null;
    let cercanosConsulta = 0;

    function rutaDelFormulario() {
        const puntos = mapaRuta ? mapaRuta.puntos() : {};
        return { origen: origenEsTienda() ? 'tienda' : 'recoleccion', a: puntos.a || null, b: puntos.b || null };
    }

    function programarCercanos() {
        clearTimeout(cercanosTemporizador);
        cercanosTemporizador = setTimeout(actualizarCercanos, 500);
    }

    function textoPilotoCercano(id) {
        return id ? (nombrePiloto(id) || 'otro piloto') : 'sin piloto';
    }

    // El piloto puede no estar en la lista del formulario (ej. de otra tienda): se agrega
    function elegirPilotoCercano(id) {
        if (![...selPiloto.options].some((o) => o.value === String(id))) {
            selPiloto.appendChild(new Option(`${textoPilotoCercano(id)} · pedido cercano`, id));
        }
        selPiloto.value = String(id);
        selPiloto.dispatchEvent(new Event('change'));
        pintarCercanos();
    }

    function pintarCercanos() {
        const caja = $('#pedCercanos');
        const lista = $('#pedCercanosLista');
        lista.replaceChildren();
        caja.hidden = !cercanosForm.length;
        if (!cercanosForm.length) return;
        cercanosForm.slice(0, 5).forEach((c) => {
            const li = document.createElement('li');
            const textos = document.createElement('span');
            const titulo = document.createElement('strong');
            titulo.textContent = pedTextoCercano(c);
            const detalle = document.createElement('small');
            const estado = (PED_ESTADOS[c.pedido.estado] || {}).texto || c.pedido.estado;
            detalle.textContent = `Piloto: ${textoPilotoCercano(c.pedido.piloto_id)} · ${estado} · ${nombreTienda(c.pedido.tienda_id)}`;
            textos.append(titulo, detalle);
            li.appendChild(textos);
            if (puedeAsignar && c.pedido.piloto_id) {
                const elegido = selPiloto.value === String(c.pedido.piloto_id);
                const b = document.createElement('button');
                b.type = 'button';
                b.className = `boton boton-chico ${elegido ? 'boton-secundario' : 'boton-principal'}`;
                b.disabled = elegido;
                b.innerHTML = elegido ? '<i class="bi bi-check2"></i> ' : '<i class="bi bi-person-check"></i> ';
                b.append(elegido ? 'Asignado a este piloto' : `Asignar a ${textoPilotoCercano(c.pedido.piloto_id)}`);
                b.addEventListener('click', () => elegirPilotoCercano(c.pedido.piloto_id));
                li.appendChild(b);
            }
            lista.appendChild(li);
        });
        $('#pedCercanosAyuda').textContent = puedeAsignar
            ? 'Asignarlo al mismo piloto permite atender estos pedidos en un solo viaje. Al registrarlo se le avisa.'
            : 'Al registrar el pedido se avisará para que se valore asignarlo al mismo piloto.';
    }

    async function actualizarCercanos() {
        const consulta = ++cercanosConsulta;
        const encontrados = await buscarCercanos(rutaDelFormulario(), inputFecha.value);
        if (consulta !== cercanosConsulta) return; // ya cambió algo más
        cercanosForm = encontrados;
        pintarCercanos();
    }

    // Punto A según la tienda y la recolección
    async function actualizarPuntoA() {
        if (!mapaRuta) return;
        mapaRuta.etiquetas(origenEsTienda() ? 'Tienda' : 'Punto de partida', 'Entrega');
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
            if (mapaRuta) mapaRuta.etiquetas('Punto de partida', 'Entrega');
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
        // Mapa A -> B: se dibuja de una vez, haya o no tienda (la tienda pone luego el punto A)
        prepararMapa();
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
        categorias = cat.data.filter((c) => empresaTieneActividad(c.actividad) && !esActividadDeViajes(c.actividad));
        catalogo = catA.error ? [] : catA.data; // si falta la tabla, sin catálogo
        tamanos = tam.data;
        tarifas = tar.data;
        descuentos = des.data;

        // Tienda (G3, Empleado: la suya y bloqueada)
        tiendas.forEach((t) => selTienda.appendChild(new Option(`${t.codigo} · ${t.nombre}`, t.id)));
        if (!tiendas.length) {
            formError.textContent = esGeneral
                ? 'Aún no hay tiendas registradas: crea una en Tiendas para poder registrar pedidos.'
                : 'No tienes una tienda asignada para registrar pedidos.';
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
        // El horario del piloto (marca) solo lo eligen G2 o superior; el empleado elige el slot
        $('#pedCampoMarca').hidden = !puedeAsignar;

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

        // Clientes: se buscan en la base al escribir (ver "Buscar cliente"). Otra tienda = otra búsqueda
        reiniciarBuscadorClientes();

        alCambiarActividad();
        actualizarPuntoA(); // A = la nueva tienda (si no hay recolección)
        await actualizarMarcas();
    }

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

    // Horarios del piloto (solo G2+) y slots de la fecha y tienda elegidas
    async function actualizarMarcas() {
        const actualSlot = selSlot.value ? Number(selSlot.value) : null;
        llenarSlots(selSlot, await slotsConOcupacion(inputFecha.value, tiendaElegida()), actualSlot);
        if (!puedeAsignar) return;
        const actual = selMarca.value ? Number(selMarca.value) : null;
        marcasForm = inputFecha.value ? await marcasConOcupacion(inputFecha.value, tiendaElegida()) : [];
        llenarMarcas(selMarca, marcasForm, actual && marcasForm.some((m) => m.numero === actual && !m.llena) ? actual : null);
    }

    // ---------- Actividad: muestra lo que usa (Configuración -> Actividades) ----------
    function alCambiarActividad() {
        llenarCategorias();
        const recoleccionAntes = !inputRecoleccion.disabled && !!inputRecoleccion.value.trim();
        actualizarCampoA();
        // Si cambia de dónde sale el pedido (tienda o recolección), se mueve el punto A
        if (mapaRuta && recoleccionAntes !== !origenEsTienda()) actualizarPuntoA();
        $('#pedCompraCaja').hidden = !usa('usa_compra');
        $('#pedCobrarCompraCaja').hidden = !usa('usa_compra');
        llenarDescuentos();
        actualizarRutas();
        recalcular();
    }

    // ---------- Buscar cliente (por TELÉFONO o CORREO) ----------
    // El teléfono y el correo son la clave del cliente. Se busca en la base (no se cargan
    // todos los clientes) entre los clientes APROBADOS de la tienda elegida:
    //   - con letras o "@" -> por correo ("ana@", "ana@correo.com")
    //   - solo números     -> por teléfono, sin importar guiones o espacios ("8888-1234")
    // Si el teléfono (8+ dígitos) o el correo coinciden COMPLETOS con un solo cliente, se
    // elige solo y se llenan sus datos. Si coinciden con varios (ej. un teléfono de familia)
    // o todavía está incompleto, se muestran las tarjetas para tocar el correcto.
    // Teclado: ↑ ↓ para moverse, Enter para elegir, Escape para cerrar.
    const CLI_PAUSA = 250;   // ms sin escribir antes de buscar
    const CLI_MAXIMO = 20;   // resultados que se muestran (más = "sigue escribiendo")
    const inputBuscarCli = $('#pedBuscarCliente');
    const listaCli = $('#pedClientesResultados');
    const estadoCli = $('#pedClientesEstado');
    let resultadosCli = [];
    let marcadoCli = -1;
    let esperaCli = null;
    let turnoCli = 0;

    const nombreCliente = (c) => [c.nombre, c.apellido1, c.apellido2].filter(Boolean).join(' ');
    const inicialesCliente = (c) => `${(c.nombre || '?')[0]}${(c.apellido1 || '')[0] || ''}`.toUpperCase();

    // ¿Escribió un correo (letras o @) o un teléfono (solo números)? -> { modo, valor }
    function claveCliente(texto) {
        const t = texto.trim();
        return /[a-z@]/i.test(t)
            ? { modo: 'correo', valor: t.toLowerCase() }
            : { modo: 'telefono', valor: t.replace(/\D/g, '') };
    }

    // Mismo teléfono completo (8+ dígitos). Acepta el código de país de más o de menos (506)
    function mismoTelefono(telefono, digitos) {
        const t = String(telefono || '').replace(/\D/g, '');
        const corto = Math.min(t.length, digitos.length);
        return corto >= 8 && (t.endsWith(digitos) || digitos.endsWith(t));
    }

    // Devuelve { lista, exactos }: exactos = los que coinciden completos por correo o teléfono
    async function buscarClientes(texto) {
        const { modo, valor } = claveCliente(texto);
        const patron = `%${valor.replace(/[%_\\]/g, '\\$&')}%`;
        let q = db.from('clientes')
            .select('id, nombre, apellido1, apellido2, telefono, correo, direccion, ubicacion, clientes_tiendas!inner(tienda_id)')
            .eq('clientes_tiendas.tienda_id', tiendaElegida()).eq('aprobado', true);
        // "busqueda" lleva el teléfono solo en dígitos (sql/01 bloque 11)
        q = modo === 'correo' ? q.ilike('correo', patron) : q.ilike('busqueda', patron);
        const { data, error } = await q.order('nombre').order('apellido1').limit(CLI_MAXIMO + 1);
        if (error) throw error;

        const exacto = (c) => (modo === 'correo'
            ? (c.correo || '').toLowerCase() === valor
            : mismoTelefono(c.telefono, valor));
        const exactos = data.filter(exacto);
        return { modo, valor, exactos, lista: data.sort((a, b) => exacto(b) - exacto(a)) };
    }

    function mostrarEstadoCli(texto) {
        estadoCli.textContent = texto;
        estadoCli.hidden = !texto;
    }

    function cerrarResultadosCli() {
        listaCli.hidden = true;
        listaCli.replaceChildren();
        marcadoCli = -1;
        inputBuscarCli.setAttribute('aria-expanded', 'false');
        inputBuscarCli.removeAttribute('aria-activedescendant');
    }

    function pintarResultadosCli(lista, mensaje) {
        resultadosCli = lista;
        marcadoCli = -1;
        listaCli.replaceChildren();
        lista.forEach((c, i) => {
            const li = document.createElement('li');
            li.id = `pedCliOpcion${i}`;
            li.className = 'ped-cli-opcion';
            li.setAttribute('role', 'option');
            li.dataset.i = i;
            const avatar = document.createElement('span');
            avatar.className = 'ped-cli-avatar';
            avatar.textContent = inicialesCliente(c);
            const datos = document.createElement('span');
            datos.className = 'ped-cli-datos';
            const nombre = document.createElement('strong');
            nombre.className = 'ped-cli-nombre';
            nombre.textContent = nombreCliente(c);
            const contacto = document.createElement('span');
            contacto.className = 'ped-cli-contacto';
            contacto.append(...lineaContacto(c));
            datos.append(nombre, contacto);
            if (c.direccion) {
                const dir = document.createElement('small');
                dir.className = 'ped-cli-direccion';
                dir.textContent = c.direccion;
                datos.appendChild(dir);
            }
            li.append(avatar, datos);
            listaCli.appendChild(li);
        });
        listaCli.hidden = !lista.length;
        inputBuscarCli.setAttribute('aria-expanded', String(!!lista.length));

        mostrarEstadoCli(mensaje);
        if (lista.length === 1) marcarCli(0);
    }

    // Teléfono y correo con icono: [<i> 8888-1234] [<i> ana@correo.com]
    function lineaContacto(c) {
        return [['bi-telephone', c.telefono], ['bi-envelope', c.correo]].filter(([, v]) => v).map(([icono, valor]) => {
            const s = document.createElement('span');
            const i = document.createElement('i');
            i.className = `bi ${icono}`;
            i.setAttribute('aria-hidden', 'true');
            s.append(i, ` ${valor}`);
            return s;
        });
    }

    function marcarCli(i) {
        const items = listaCli.querySelectorAll('.ped-cli-opcion');
        if (!items.length) return;
        marcadoCli = (i + items.length) % items.length;
        items.forEach((li, j) => li.classList.toggle('activo', j === marcadoCli));
        items[marcadoCli].scrollIntoView({ block: 'nearest' });
        inputBuscarCli.setAttribute('aria-activedescendant', items[marcadoCli].id);
    }

    function elegirCliente(c) {
        if (!c) return;
        clienteId = c.id;
        clienteElegido = c;
        $('#pedClienteNombre').value = nombreCliente(c);
        $('#pedClienteTelefono').value = c.telefono;
        const direccionVacia = !inputDireccion.value;
        if (c.direccion && direccionVacia) inputDireccion.value = c.direccion;
        // Punto B: la ubicación guardada del cliente (coordenadas o enlace de mapas) o su dirección
        if (mapaRuta && direccionVacia) {
            const punto = puntoDeTexto(c.ubicacion);
            if (punto) mapaRuta.ponerB(punto);
            else if (c.direccion) mapaRuta.ubicarB();
        }
        // Ficha del cliente en lugar del buscador
        const ficha = $('#pedClienteElegido');
        ficha.querySelector('.ped-cli-avatar').textContent = inicialesCliente(c);
        ficha.querySelector('.ped-cli-nombre').textContent = nombreCliente(c);
        ficha.querySelector('.ped-cli-contacto').replaceChildren(...lineaContacto(c));
        ficha.hidden = false;
        $('#pedClienteBuscarCaja').hidden = true;
        cerrarResultadosCli();
        recalcular();
    }

    // Vuelve al buscador vacío (botón "Cambiar" o al cambiar de tienda)
    function reiniciarBuscadorClientes(enfocar = false) {
        clearTimeout(esperaCli);
        turnoCli++;
        clienteId = null;
        clienteElegido = null;
        inputBuscarCli.value = '';
        cerrarResultadosCli();
        mostrarEstadoCli('');
        $('#pedClienteElegido').hidden = true;
        $('#pedClienteBuscarCaja').hidden = false;
        if (enfocar) inputBuscarCli.focus();
    }

    $('#pedClienteCambiar').addEventListener('click', () => reiniciarBuscadorClientes(true));

    // Qué hacer con lo encontrado (ver "Buscar cliente")
    function resolverBusquedaCli({ modo, valor, exactos, lista }) {
        const dato = modo === 'correo' ? 'correo' : 'teléfono';
        // Coincidencia completa con un solo cliente: se elige solo y se llenan sus datos
        if (exactos.length === 1) {
            elegirCliente(exactos[0]);
            return;
        }
        if (exactos.length > 1) {
            pintarResultadosCli(exactos, `Este ${dato} lo tienen ${exactos.length} clientes: toca el correcto.`);
            return;
        }
        if (lista.length) {
            pintarResultadosCli(lista.slice(0, CLI_MAXIMO), lista.length > CLI_MAXIMO
                ? `Hay más de ${CLI_MAXIMO} coincidencias: sigue escribiendo el ${dato}.`
                : `Escribe el ${dato} completo para llenar los datos, o toca el cliente.`);
            return;
        }
        // Sin cliente: el teléfono completo ya queda escrito en el formulario
        const inputTel = $('#pedClienteTelefono');
        const telefonoCompleto = modo === 'telefono' && valor.length >= 8;
        if (telefonoCompleto && !inputTel.value.trim()) inputTel.value = inputBuscarCli.value.trim();
        pintarResultadosCli([], telefonoCompleto
            ? 'No hay un cliente con ese teléfono en esta tienda: escribe el nombre abajo (el teléfono ya quedó puesto).'
            : `No hay un cliente con ese ${dato} en esta tienda. Revisa lo escrito o llena los datos abajo.`);
    }

    inputBuscarCli.addEventListener('input', () => {
        clearTimeout(esperaCli);
        const texto = inputBuscarCli.value.trim();
        const { modo, valor } = claveCliente(texto);
        // Mínimo 3 caracteres del correo o 3 dígitos del teléfono
        if (valor.length < 3) {
            turnoCli++;
            cerrarResultadosCli();
            mostrarEstadoCli(texto && modo === 'telefono' && !valor ? 'Escribe un teléfono (números) o un correo.' : '');
            return;
        }
        esperaCli = setTimeout(async () => {
            const mio = ++turnoCli;
            mostrarEstadoCli('Buscando...');
            try {
                const resultado = await buscarClientes(texto);
                if (mio !== turnoCli) return; // ya escribió otra cosa
                resolverBusquedaCli(resultado);
            } catch (error) {
                if (mio !== turnoCli) return;
                console.error('Error al buscar clientes:', error);
                cerrarResultadosCli();
                mostrarEstadoCli(error.code === '42703'
                    ? 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 11: clientes).'
                    : 'No se pudo buscar. Revisa la conexión.');
            }
        }, CLI_PAUSA);
    });

    inputBuscarCli.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') e.preventDefault(); // Enter nunca envía el formulario desde aquí
        if (listaCli.hidden) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); marcarCli(marcadoCli + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); marcarCli(marcadoCli - 1); }
        else if (e.key === 'Enter' && marcadoCli >= 0) elegirCliente(resultadosCli[marcadoCli]);
        else if (e.key === 'Escape') { e.preventDefault(); cerrarResultadosCli(); }
    });

    // click (no mousedown): la lista no es flotante, así en celular se puede deslizar sin elegir
    listaCli.addEventListener('click', (e) => {
        const li = e.target.closest('.ped-cli-opcion');
        if (li) elegirCliente(resultadosCli[Number(li.dataset.i)]);
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
    inputFecha.addEventListener('change', () => { actualizarMarcas(); actualizarPilotosRuta(); programarCercanos(); });
    selPiloto.addEventListener('change', () => { if (cercanosForm.length) pintarCercanos(); });

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
            if (m.tipo === 'conteo' && ['cajas', 'bolsas', 'hieleras'].some((k) => !Number.isInteger(m.conteo[k]))) {
                return fallo(`${nombre}: las cajas, bolsas y hieleras deben ser números enteros.`);
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
                // Una fila por tipo con la cantidad que se eligió (Cajas 5, Bolsas 2...), así el
                // detalle y los reportes muestran lo mismo que se registró. El peso del conteo es
                // aproximado y total: se reparte por igual entre las piezas (peso c/u promedio).
                const tipos = [['cajas', 'Cajas'], ['bolsas', 'Bolsas'], ['hieleras', 'Hieleras']].filter(([k]) => m.conteo[k] > 0);
                const piezas = tipos.reduce((s, [k]) => s + m.conteo[k], 0);
                const alcohol = m.conteo.alcohol ? ' (con alcohol)' : '';
                if (!piezas) {
                    filas.push({ ...base, descripcion: m.categoria.nombre + alcohol, cantidad: 1, peso_kg: m.conteo.peso });
                } else {
                    const pesoUno = Math.round((m.conteo.peso / piezas) * 100) / 100;
                    tipos.forEach(([k, nombre]) => filas.push({ ...base, descripcion: nombre + alcohol, cantidad: m.conteo[k], peso_kg: pesoUno }));
                }
            } else {
                m.articulos.forEach((a) => filas.push({
                    pedido_id: pedidoId, categoria_id: m.categoria.id, categoria: m.categoria.nombre,
                    descripcion: a.nombre, cantidad: a.cantidad, peso_kg: a.peso,
                }));
            }
        });
        return filas;
    }

    // ---------- Cliente del pedido en Clientes ----------
    // "Ana María Pérez Solís" -> { nombre: 'Ana María', apellido1: 'Pérez', apellido2: 'Solís' }
    // (3+ palabras: nombre + 2 apellidos; 2: nombre + apellido; 1: apellido "-")
    function partesNombre(texto) {
        const p = texto.trim().split(/\s+/).filter(Boolean);
        if (p.length < 2) return { nombre: p[0] || '', apellido1: '-', apellido2: null };
        if (p.length === 2) return { nombre: p[0], apellido1: p[1], apellido2: null };
        return { nombre: p.slice(0, p.length - 2).join(' '), apellido1: p[p.length - 2], apellido2: p[p.length - 1] };
    }

    // Punto B del mapa como texto "9.934512, -84.087654" (lo lee puntoDeTexto, js/mapa.js)
    function textoPuntoEntrega() {
        const b = mapaRuta ? mapaRuta.puntos().b : null;
        return b ? `${Number(b.lat).toFixed(6)}, ${Number(b.lng).toFixed(6)}` : null;
    }

    // Cliente que no se eligió del buscador: si ya existe en la empresa con ese
    // teléfono se usa ese (y se agrega a esta tienda); si no, se crea en Clientes
    // con su dirección y su punto de entrega (aprobado: lo registró la tienda).
    // Devuelve el id o null (el pedido se registra igual, sin cliente enlazado).
    async function clienteDesdePedido(tiendaId, rutaId) {
        const telefono = $('#pedClienteTelefono').value.trim();
        const digitos = telefono.replace(/\D/g, '');
        if (digitos.length < 8) return null;
        let id = null;
        const buscado = await db.from('clientes').select('id, telefono, clientes_tiendas(tienda_id)')
            .ilike('busqueda', `%${digitos.slice(-8)}%`).limit(10);
        const existente = (buscado.data || []).find((c) => mismoTelefono(c.telefono, digitos));
        if (existente) {
            id = existente.id;
            if ((existente.clientes_tiendas || []).some((ct) => ct.tienda_id === tiendaId)) return id;
        } else {
            const nombre = partesNombre($('#pedClienteNombre').value);
            const ins = await db.from('clientes').insert({
                nombre: nombre.nombre, apellido1: nombre.apellido1, apellido2: nombre.apellido2, telefono,
                direccion: inputDireccion.value.trim() || null, ubicacion: textoPuntoEntrega(), aprobado: true,
            }).select('id').single();
            if (ins.error) {
                console.error('Error al agregar el cliente desde el pedido:', ins.error);
                return null;
            }
            id = ins.data.id;
        }
        const relacion = { cliente_id: id, tienda_id: tiendaId };
        if (rutaId) relacion.ruta_id = rutaId;
        let rel = await db.from('clientes_tiendas').insert(relacion);
        if (rel.error && relacion.ruta_id && ['42703', 'PGRST204'].includes(rel.error.code)) { // sin sql/01 bloque 16
            delete relacion.ruta_id;
            rel = await db.from('clientes_tiendas').insert(relacion);
        }
        if (rel.error && rel.error.code !== '23505') console.error('Error al enlazar el cliente con la tienda:', rel.error);
        return id;
    }

    // Cliente elegido del buscador sin dirección o sin ubicación: se le guardan las del
    // pedido (así la próxima vez el mapa ya sale con su punto). No se cambia lo que ya tiene.
    async function completarUbicacionCliente() {
        const c = clienteElegido;
        if (!c) return;
        const cambios = {};
        if (!c.direccion && inputDireccion.value.trim()) cambios.direccion = inputDireccion.value.trim();
        if (!c.ubicacion && textoPuntoEntrega()) cambios.ubicacion = textoPuntoEntrega();
        if (!Object.keys(cambios).length) return;
        const { error } = await db.from('clientes').update(cambios).eq('id', c.id);
        if (error) console.error('Error al guardar la ubicación del cliente:', error);
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
            marca_numero: puedeAsignar && selMarca.value ? Number(selMarca.value) : null,
            ...(selSlot.value ? { slot_numero: Number(selSlot.value) } : {}), // slot de despacho (sql/01 bloque 12)
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
        // Cliente escrito a mano (no elegido del buscador): se agrega solo a Clientes
        if (!clienteId) {
            clienteId = await clienteDesdePedido(tiendaId, rutaId);
            pedido.cliente_id = clienteId;
        } else {
            await completarUbicacionCliente();
        }
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

        // Pedidos del mismo día cerca de este (se guardan en la línea de tiempo para medir el plan piloto)
        const cercanos = await buscarCercanos(detalle.ruta, inputFecha.value, data.id);
        const conMiPiloto = pilotoId ? cercanos.filter((x) => x.pedido.piloto_id === pilotoId) : [];
        const conOtroPiloto = cercanos.filter((x) => x.pedido.piloto_id && x.pedido.piloto_id !== pilotoId);

        // Artículos y línea de tiempo
        const [art, his] = await Promise.all([
            db.from('pedido_articulos').insert(armarArticulos(data.id)),
            registrarEvento(data.id, 'registrado', {
                despues: estado,
                detalle: {
                    marca: pedido.marca_numero, ruta: nombreRuta(rutaId),
                    piloto: pilotoId ? `${nombrePiloto(pilotoId) || ''}${pilotoManual ? '' : ' (de la ruta)'}` : null,
                    ...(cercanos.length ? {
                        cercanos: cercanos.slice(0, 5).map((x) => ({
                            pedido: x.pedido.codigo, km: Math.round(x.km * 100) / 100, piloto: x.pedido.piloto_id || null,
                        })),
                        mismo_piloto: conMiPiloto.length > 0,
                    } : {}),
                },
            }),
        ]);
        if (art.error || his.error) {
            console.error('Error al guardar artículos o historial:', art.error || his.error);
            sessionStorage.setItem('ped_aviso', `Pedido ${data.codigo} registrado, pero no se guardó todo el detalle. Revísalo.`);
        } else {
            sessionStorage.setItem('ped_aviso', `Pedido ${data.codigo} registrado.`);
        }

        // Avisos (js/notificaciones.js): sin piloto -> el G2 debe asignarlo; con piloto -> al piloto.
        // Pedidos cercanos: al piloto se le dice que puede aprovechar el viaje; si el más cercano
        // lo lleva otro piloto, se sugiere al G2 asignárselo (o reasignarlo) para un solo viaje.
        const enlace = `#pedidos?id=${data.id}`;
        const sugerencia = (x) => `${pedTextoCercano(x, 'Su')} (piloto ${textoPilotoCercano(x.pedido.piloto_id)})`;
        if (!pilotoId) {
            await avisar({
                tiendaId, a: ['g2'], tipo: 'pendiente', enlace, referenciaTipo: 'pedido_asignar', referenciaId: data.id,
                titulo: conOtroPiloto.length ? 'Pedido nuevo sin piloto, cerca de otro recorrido' : 'Pedido nuevo sin piloto',
                mensaje: `${nombreTienda(tiendaId)} registró el pedido ${data.codigo} para el ${fechaCorta(inputFecha.value)}. ` +
                    (conOtroPiloto.length
                        ? `Sugerencia: ${sugerencia(conOtroPiloto[0])}; asignárselo permite un solo viaje.`
                        : 'Asígnale piloto y horario.'),
            });
        } else {
            await avisar({
                usuarios: [pilotoId], enlace, referenciaTipo: 'pedido', referenciaId: data.id,
                titulo: conMiPiloto.length ? 'Nuevo pedido cerca de tu recorrido' : 'Nuevo pedido asignado',
                mensaje: `Tienes el pedido ${data.codigo} (${nombreTienda(tiendaId)}) para el ${fechaCorta(inputFecha.value)}.` +
                    (conMiPiloto.length ? ` ${pedTextoCercano(conMiPiloto[0], 'Su')}: aprovecha el mismo viaje.` : ''),
            });
            // Quedó con un piloto, pero lo más cercano lo lleva otro: se sugiere al G2 revisarlo
            if (!conMiPiloto.length && conOtroPiloto.length) {
                await avisar({
                    tiendaId, a: ['g2'], tipo: 'info', enlace, referenciaTipo: 'pedido', referenciaId: data.id,
                    titulo: 'Pedido cerca de otro recorrido',
                    mensaje: `${data.codigo} quedó con ${textoPilotoCercano(pilotoId)}, pero ${sugerencia(conOtroPiloto[0]).charAt(0).toLowerCase()}${sugerencia(conOtroPiloto[0]).slice(1)}. Valora reasignarlo para un solo viaje.`,
                });
            }
        }
        location.hash = `pedidos?id=${data.id}&qr=1`;
    });

    // ==================================================
    // VISTA 3: DETALLE
    // ==================================================

    let pedido = null;       // pedido abierto
    let articulosDet = [];
    let marcasDet = [];      // marcas de su fecha (para mostrar las horas)
    let slotsDet = [];       // slots de su fecha
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

        const [art, his, ent, evi, marcas, slots] = await Promise.all([
            db.from('pedido_articulos').select('categoria, descripcion, cantidad, tamano, peso_kg').eq('pedido_id', id).order('id'),
            db.from('pedido_historial').select('evento, estado_anterior, estado_nuevo, detalle, usuario_id, usuario_nombre, creado_en').eq('pedido_id', id).order('creado_en'),
            db.from('pedido_entregas').select('*').eq('pedido_id', id).maybeSingle(),
            db.from('pedido_evidencias').select('tipo, url, creado_en, eliminada_en').eq('pedido_id', id).order('creado_en'),
            db.rpc('marcas_del_dia', { p_fecha: data.fecha_entrega }),
            db.rpc('slots_del_dia', { p_fecha: data.fecha_entrega }),
        ]);
        articulosDet = art.data || [];
        marcasDet = marcas.data || [];
        slotsDet = slots.data || [];
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
        if (abrirQr && puedeVerQr(pedido)) abrirVentanaQr();
        if (abrir) abrirDesdePie(abrir);
    }

    // El QR lo ven quienes gestionan pedidos y, mientras espera que lo escaneen
    // ("Recibido para ruta"), el piloto del pedido para mostrarlo al despachador
    const puedeVerQr = (p) => puedeGestionar || (esSuPiloto(p) && p.estado === 'recibido_ruta');

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
    // "Cerca de este pedido": se agrega la fila y se llena al llegar la respuesta. Al piloto solo
    // se le muestran sus propios pedidos cercanos (los que puede aprovechar en su viaje).
    function mostrarCercanosDetalle(dl, p, ruta) {
        const caja = document.createElement('span');
        caja.className = 'ped-cercanos-detalle';
        caja.textContent = 'Buscando...';
        dato(dl, 'Cerca de este pedido', caja);
        const dd = caja.parentElement;
        const dt = dd ? dd.previousElementSibling : null;
        buscarCercanos(ruta, p.fecha_entrega, p.id).then((lista) => {
            const visibles = esPiloto ? lista.filter((x) => x.pedido.piloto_id === sesion.id) : lista;
            if (!visibles.length) { // nada cerca: la fila no se muestra
                if (dt) dt.remove();
                if (dd) dd.remove();
                return;
            }
            caja.replaceChildren(...visibles.slice(0, 5).map((x) => {
                const a = document.createElement('a');
                a.href = `#pedidos?id=${x.pedido.id}`;
                a.textContent = `${pedTextoCercano(x, 'Su')} · piloto ${esPiloto ? 'tú' : textoPilotoCercano(x.pedido.piloto_id)}`;
                return a;
            }));
        });
    }

    function dato(dl, etiqueta, valor) {
        if (valor == null || valor === '') return;
        const dt = document.createElement('dt');
        dt.textContent = etiqueta;
        const dd = document.createElement('dd');
        if (valor instanceof HTMLElement) dd.appendChild(valor);
        else dd.textContent = valor;
        dl.append(dt, dd);
    }

    function textoSlotDet(p) {
        if (!p.slot_numero) return 'Sin slot';
        const s = slotsDet.find((x) => x.numero === p.slot_numero);
        return s ? textoSlot(s) : `Slot ${p.slot_numero}`;
    }

    function textoMarca(p) {
        if (!p.marca_numero) return 'Sin horario';
        const m = marcasDet.find((x) => x.numero === p.marca_numero);
        if (!m) return `Horario ${p.marca_numero}`;
        // "Inicia desde" solo lo ven G2 o superior; el piloto ve la hora de inicio y el término
        return puedeAsignar
            ? `Horario ${m.numero} · inicia desde ${hhmm(m.inicio_desde)}, hora de inicio ${hhmm(m.inicio_hasta)}, termina ${hhmm(m.fin)}`
            : `Horario ${m.numero} · hora de inicio ${hhmm(m.inicio_hasta)}, termina ${hhmm(m.fin)}`;
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
        dato(dl, 'Punto de partida', p.direccion_recoleccion);
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
            dato(dl, ruta.origen === 'recoleccion' ? 'Ruta (punto de partida → entrega)' : 'Ruta (tienda → entrega)', caja);
        } else if (p.distancia_km != null) {
            dato(dl, 'Distancia', `${p.distancia_km} km`);
        }
        dato(dl, 'Recibe', p.recibe_tipo === 'autorizado'
            ? `${p.recibe_nombre} (autorizado)${p.recibe_telefono ? ` · ${p.recibe_telefono}` : ''}`
            : 'El mismo cliente');
        dato(dl, 'Fecha', fechaCorta(p.fecha_entrega));
        dato(dl, 'Slot de despacho', textoSlotDet(p));
        if (verMarca) dato(dl, 'Horario del piloto', textoMarca(p));
        dato(dl, 'Ruta', nombreRuta(p.ruta_id));
        dato(dl, 'Piloto', esPiloto ? sesion.nombre : (nombrePiloto(p.piloto_id) || 'Sin asignar'));
        // Pedidos del mismo día, sin entregar, cerca de este (para hacerlos en un solo viaje)
        if (ruta && !p.anulado && PED_PENDIENTES_DE_VIAJE.includes(p.estado)) mostrarCercanosDetalle(dl, p, ruta);
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
        escaneo: 'QR escaneado (cargado)',
        salida: 'Saliendo a ruta',
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
            if (d.slot) partes.push(`Slot ${d.slot}`);
            if (d.marca && verMarca) partes.push(`Horario ${d.marca}`);
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
    //
    //   FLUJO DE DESPACHO (sql/00 sección 8; la hora de cada paso la guarda la base):
    //     Alistando -> Listo para despachar (elige el slot) -> [piloto] Recibido para ruta
    //     (muestra el QR) -> [despachador] escanea el QR = Cargado -> [piloto, en Inicio]
    //     Saliendo a ruta = En ruta -> [piloto] Entregar ahora (UNO a la vez) -> Entregado /
    //     No entregado. Ya no se anula: solo se cancela (con motivo, para los reportes).
    const esSuPiloto = (p) => esPiloto && p.piloto_id === sesion.id;
    const PED_ACCIONES = [
        { id: 'qr', texto: 'QR', icono: 'bi-qr-code', clase: 'boton-secundario', siempre: true, quien: () => true, si: (p) => puedeVerQr(p) },
        { id: 'bodega', texto: 'Recibido en bodega', icono: 'bi-building-check', estados: ['registrado'], quien: () => puedeGestionar,
          si: (p) => actividadPorCodigo(p.actividad).usa_bodega, nuevo: 'recibido_bodega' },
        // Despacho: Empleado, Admin G3 y superiores
        { id: 'alistar', texto: 'Alistando', icono: 'bi-box2', estados: PED_POR_ALISTAR, quien: () => puedeDespachar, nuevo: 'alistando',
          ayuda: 'Empieza a preparar el pedido. Cuando esté listo, márcalo "Listo para despachar".' },
        { id: 'listo', texto: 'Listo para despachar', icono: 'bi-box-seam', estados: ['alistando'], quien: () => puedeDespachar },
        // Aprobación de salida de ESTE pedido: se escanea el QR que muestra el piloto.
        // Visible desde "Listo para despachar"; se habilita cuando el piloto lo recibe.
        { id: 'escanear', texto: 'Aprobar salida (escanear QR)', icono: 'bi-qr-code-scan', estados: ['listo_despacho', 'recibido_ruta'],
          quien: () => puedeDespachar, bloqueado: (p) => (p.estado === 'listo_despacho'
              ? 'Se habilita cuando el piloto marque "Recibido para ruta" y muestre el QR.' : '') },
        // Piloto y horario: SOLO G2 o superior
        { id: 'asignar', texto: 'Asignar piloto y horario', icono: 'bi-person-check', clase: 'boton-secundario', estados: PED_ANTES_DE_SALIR, quien: () => puedeAsignar },
        // El Admin G3 solo lo pide (si no hay otra solicitud pendiente)
        { id: 'solicitar', texto: 'Solicitar reasignación', icono: 'bi-calendar2-week', clase: 'boton-secundario',
          estados: [...PED_ANTES_DE_SALIR, 'no_entregado'], quien: () => puedeSolicitar, si: () => !solicitud },
        // Piloto del pedido: recibe el pedido para la ruta y muestra su QR al despachador
        { id: 'recibir', texto: 'Recibido para ruta', icono: 'bi-hand-thumbs-up', estados: ['listo_despacho'], quien: () => esPiloto,
          si: esSuPiloto, nuevo: 'recibido_ruta',
          ayuda: 'Se abrirá el QR del pedido: muéstraselo al despachador para que lo escanee y quede cargado.' },
        // Ya en ruta: marca cuál entrega AHORA (uno a la vez) y luego lo cierra
        { id: 'entregar_ahora', texto: 'Entregar ahora', icono: 'bi-geo-alt', estados: ['en_ruta'], quien: () => esPiloto, si: esSuPiloto,
          nuevo: 'en_entrega', ayuda: 'Hasta que lo marques entregado o no entregado no podrás empezar otro pedido.' },
        { id: 'entregado', texto: 'Entregado', icono: 'bi-check2-circle', estados: ['en_entrega'], quien: () => esPiloto, si: esSuPiloto,
          nuevo: 'entregado', motivo: 'opcional',
          ayuda: 'Confirma que entregaste el pedido. (Más adelante se hará desde la app con el QR y la foto.)' },
        { id: 'no_entregado', texto: 'No entregado', icono: 'bi-x-circle', estados: ['en_entrega'], quien: () => esPiloto, si: esSuPiloto,
          nuevo: 'no_entregado', motivo: 'requerido' },
        { id: 'reprogramar', texto: 'Reprogramar', icono: 'bi-calendar-event', estados: ['no_entregado'], quien: () => puedeAsignar },
        { id: 'devuelto', texto: 'Devuelto', icono: 'bi-arrow-return-left', estados: ['no_entregado'], quien: () => puedeCancelar,
          nuevo: 'devuelto', motivo: 'requerido' },
        // Cancelar: Admin G3 o superior (el Empleado no). El motivo sale en Reportes.
        // También un "No entregado" (el G2 decide: reprogramar o cancelar según el motivo del piloto).
        { id: 'cancelar', texto: 'Cancelar pedido', icono: 'bi-slash-circle', clase: 'boton-peligro', estados: [...PED_ANTES_DE_SALIR, 'no_entregado'],
          quien: () => puedeCancelar, nuevo: 'cancelado', motivo: 'requerido',
          ayuda: 'El pedido no se borra: queda cancelado con su motivo (se ve en Reportes).' },
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
            const disponible = a.siempre ? (!a.si || a.si(p)) : (!p.anulado && a.estados.includes(p.estado) && (!a.si || a.si(p)));
            if (!disponible) return;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `boton ${a.clase || 'boton-principal'} boton-chico`;
            b.dataset.accionPedido = a.id;
            b.innerHTML = `<i class="bi ${a.icono}"></i> <span></span>`;
            b.querySelector('span').textContent = a.texto;
            // Se ve pero todavía no se puede usar (el motivo queda en el globo)
            const motivo = a.bloqueado ? a.bloqueado(p) : '';
            if (motivo) { b.disabled = true; b.title = motivo; }
            caja.appendChild(b);
        });
    }

    $('#pedDetAcciones').addEventListener('click', (evento) => {
        const b = evento.target.closest('button[data-accion-pedido]');
        if (!b || !pedido) return;
        const accion = PED_ACCIONES.find((a) => a.id === b.dataset.accionPedido);
        if (!accion.quien()) return;
        if (accion.id === 'qr') abrirVentanaQr();
        else if (accion.id === 'listo') abrirListo();
        else if (accion.id === 'escanear') abrirEscaner();
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
            aviso.mostrar(resultado.mensajePropio
                // Índice pedidos_un_en_entrega: ya tiene otro pedido "Entregando"
                || (resultado.code === '23505' && accion.id === 'entregar_ahora'
                    ? 'Primero marca como entregado (o no entregado) el pedido que estás entregando.'
                    : resultado.code === '23514' ? 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 12: despacho).'
                        : 'No se pudo completar la acción. Intenta de nuevo.'), 'error');
        } else {
            aviso.mostrar(accion.id === 'rechazar_solicitud' ? 'Solicitud rechazada; se avisó a quien la pidió.'
                : `Pedido ${pedido.codigo}: ${(PED_ESTADOS[accion.nuevo] || {}).texto}.`);
        }
        if (!resultado) await avisosDeAccion(accion.id, motivo);
        // "Recibido para ruta": se abre el QR para que el despachador lo escanee
        if (!resultado && accion.id === 'recibir') abrirDetalle(pedido.id, true);
        else recargarDetalle();
    });

    // ---------- Avisos de las acciones (js/notificaciones.js) ----------
    //   Piloto "Recibido para ruta" -> G3 de la tienda: aprobar la salida (pendiente)
    //   Piloto "No entregado"       -> G2: reprogramar o cancelar (pendiente) + G3 (info)
    //   Cancelar / Devuelto         -> si lo hace G2+: G3 + piloto | si lo hace la tienda: G2 + piloto
    // Los pendientes que ya no aplican se cierran (resolverPendientes).
    async function avisosDeAccion(accionId, motivo = '') {
        const p = pedido;
        const enlace = `#pedidos?id=${p.id}`;
        const tienda = nombreTienda(p.tienda_id);
        const quien = sesion.nombre || 'Alguien';
        if (accionId === 'recibir') {
            await avisar({
                tiendaId: p.tienda_id, a: ['g3'], tipo: 'pendiente', enlace, referenciaTipo: 'pedido_salida', referenciaId: p.id,
                titulo: 'Aprobar salida de un pedido',
                mensaje: `${quien} recibió el pedido ${p.codigo} para ruta. Ábrelo y escanea su QR para aprobar la salida.`,
            });
        } else if (accionId === 'no_entregado') {
            await avisar({
                tiendaId: p.tienda_id, a: ['g2'], tipo: 'pendiente', enlace, referenciaTipo: 'pedido_no_entregado', referenciaId: p.id,
                titulo: 'Pedido no entregado: reprogramar o cancelar',
                mensaje: `${quien} no entregó el pedido ${p.codigo} (${tienda}). Motivo: ${motivo}. Revísalo y reprográmalo o cancélalo.`,
            });
            await avisar({
                tiendaId: p.tienda_id, a: ['g3'], enlace, referenciaTipo: 'pedido', referenciaId: p.id,
                titulo: 'Pedido no entregado',
                mensaje: `El pedido ${p.codigo} no se entregó. Motivo: ${motivo}. El Admin G2 lo reprogramará o cancelará.`,
            });
        } else if (accionId === 'cancelar' || accionId === 'devuelto') {
            await Promise.all(['pedido_no_entregado', 'pedido_asignar', 'pedido_salida', 'pedido_reasignacion']
                .map((tipo) => resolverPendientes(tipo, p.id)));
            const texto = accionId === 'cancelar' ? 'cancelado' : 'devuelto';
            await avisar({
                tiendaId: p.tienda_id, a: puedeAsignar ? ['g3'] : ['g2'], usuarios: [p.piloto_id], enlace,
                referenciaTipo: 'pedido', referenciaId: p.id, tipo: 'rechazado',
                titulo: `Pedido ${texto}`,
                mensaje: `${quien} marcó el pedido ${p.codigo} (${tienda}) como ${texto}. Motivo: ${motivo}.`,
            });
        }
    }

    // ---------- Listo para despachar: elegir o confirmar el slot ----------
    const dlgSlot = $('#pedSlotDialogo');

    async function abrirListo() {
        if (!puedeDespachar || pedido.estado !== 'alistando') return;
        $('#pedSlotError').textContent = '';
        $('#pedSlotTexto').textContent = `El pedido ${pedido.codigo} pasará a "Listo para despachar". Confirma el slot al que se va a cargar.`;
        const slots = await slotsConOcupacion(pedido.fecha_entrega, pedido.tienda_id, pedido.id);
        llenarSlots($('#pedSlotElegir'), slots, pedido.slot_numero, false);
        $('#pedSlotSi').disabled = !slots.length;
        if (!slots.length) $('#pedSlotError').textContent = 'No hay slots para la fecha de este pedido. Revisa Configuración → Slots.';
        dlgSlot.showModal();
    }

    $('#pedSlotCancelar').addEventListener('click', () => dlgSlot.close());

    $('#pedSlotForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const slot = Number($('#pedSlotElegir').value);
        if (!slot) {
            $('#pedSlotError').textContent = 'Elige el slot.';
            return;
        }
        $('#pedSlotSi').disabled = true;
        const resultado = await cambiarEstado('listo_despacho', { slot_numero: slot }, { slot });
        $('#pedSlotSi').disabled = false;
        if (resultado) {
            console.error('Error al marcar listo para despachar:', resultado);
            $('#pedSlotError').textContent = resultado.mensajePropio || 'No se pudo guardar. Intenta de nuevo.';
            return;
        }
        dlgSlot.close();
        aviso.mostrar(`Pedido ${pedido.codigo}: listo para despachar en el slot ${slot}.`);
        // Aviso al piloto: que lo reciba para la ruta (js/notificaciones.js)
        await avisar({
            usuarios: [pedido.piloto_id], enlace: `#pedidos?id=${pedido.id}`, referenciaTipo: 'pedido', referenciaId: pedido.id,
            titulo: 'Pedido listo para despachar',
            mensaje: `El pedido ${pedido.codigo} (${nombreTienda(pedido.tienda_id)}) está listo en el slot ${slot}. Márcalo "Recibido para ruta" y muestra el QR.`,
        });
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
        solicitar: 'Solicitar reasignación de fecha',
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
        // G3 y Empleado no ven el horario del piloto: solo piden otra fecha
        $('#pedAsigMarca').closest('.campo').hidden = !verMarca;
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
        const marca = verMarca && $('#pedAsigMarca').value ? Number($('#pedAsigMarca').value) : null;
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

        // Avisos (js/notificaciones.js)
        if (!fallo) {
            const enlace = `#pedidos?id=${pedido.id}`;
            if (piloto) await resolverPendientes('pedido_asignar', pedido.id); // ya tiene piloto
            if (reprograma) {
                // El "No entregado" que avisó el piloto ya se resolvió: la tienda y el piloto lo saben
                await resolverPendientes('pedido_no_entregado', pedido.id);
                await avisar({
                    tiendaId: pedido.tienda_id, a: ['g3'], usuarios: [piloto], enlace, referenciaTipo: 'pedido', referenciaId: pedido.id,
                    tipo: 'aprobado', titulo: 'Pedido reprogramado',
                    mensaje: `El pedido ${pedido.codigo} se reprogramó para el ${fechaCorta(fecha)}${motivoFinal ? `. ${motivoFinal}` : ''}.`,
                });
            } else if (piloto && piloto !== pedido.piloto_id) {
                await avisar({
                    usuarios: [piloto], enlace, referenciaTipo: 'pedido', referenciaId: pedido.id,
                    titulo: 'Nuevo pedido asignado',
                    mensaje: `Tienes el pedido ${pedido.codigo} (${nombreTienda(pedido.tienda_id)}) para el ${fechaCorta(fecha)}.`,
                });
            }
            // Al piloto que ya no lo tiene, se le avisa
            if (pedido.piloto_id && piloto !== pedido.piloto_id) {
                await avisar({
                    usuarios: [pedido.piloto_id], enlace: '#inicio', referenciaTipo: 'pedido', referenciaId: pedido.id,
                    titulo: 'Pedido reasignado', mensaje: `El pedido ${pedido.codigo} ya no está en tu ruta.`,
                });
            }
        }

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
        // El código de entrega lo da el CLIENTE al recibir: el piloto no lo ve (solo muestra el QR al despachador)
        if (!esPiloto) {
            ctx.fillText(`Código de entrega: ${p.codigo_respaldo}`, ancho / 2, y);
            if (p.codigo_telefono && p.codigo_telefono !== p.codigo_respaldo) {
                y += 30;
                ctx.font = '18px Arial, sans-serif';
                ctx.fillText('(o los últimos 4 dígitos de tu teléfono)', ancho / 2, y);
            }
        }
        y += 40;
        ctx.font = '18px Arial, sans-serif';
        ctx.fillStyle = '#6B7280';
        ctx.fillText(esPiloto ? 'Muestra este QR al despachador para aprobar la salida.' : 'Muestra este QR a quien te entrega el pedido.',
            ancho / 2, Math.min(y, alto - 20));
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
        // Piloto ("Recibido para ruta"): lo muestra al despachador para que lo escanee
        $('#pedQrTexto').textContent = esPiloto
            ? 'Muéstrale este QR al despachador: al escanearlo, el pedido queda cargado en tu ruta.'
            : 'Envíale esta imagen al cliente (o que le tome una foto) para que la reenvíe a quien recibe.';
        $('#pedQrWhatsapp').hidden = esPiloto;
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
    // APROBAR SALIDA (Empleado, Admin G3 y superiores) — DENTRO de cada pedido
    // El piloto marca "Recibido para ruta" y muestra el QR; en el detalle de ESE
    // pedido se presiona "Aprobar salida" y se escanea con la cámara (librería
    // gratis jsQR). Solo vale el QR de ese pedido: el pedido pasa a "Cargado" y la
    // base guarda la hora (cargado_en) y quién lo aprobó. Esas horas alimentan el
    // cronómetro del slot (vista slots_carga). Sin cámara (o sin https) se escribe
    // el número del pedido.
    // ==================================================

    const dlgEscaner = $('#pedEscanerDialogo');
    const video = $('#pedEscanerVideo');
    const estadoEscaner = $('#pedEscanerEstado');
    let camara = null;          // MediaStream abierto
    let lazoEscaner = null;     // requestAnimationFrame en curso
    let ultimoLeido = { texto: '', hora: 0 }; // para no procesar el mismo QR varias veces seguidas
    let procesando = false;
    let aprobado = false;       // true cuando se aprobó la salida (se recarga el detalle al cerrar)

    function mostrarEstadoEscaner(texto, tipo = '') {
        estadoEscaner.textContent = texto;
        estadoEscaner.className = `ped-escaner-estado${tipo ? ` ${tipo}` : ''}`;
    }

    async function abrirEscaner() {
        if (!puedeDespachar || !pedido || pedido.estado !== 'recibido_ruta') return;
        aprobado = false;
        ultimoLeido = { texto: '', hora: 0 };
        $('#pedEscanerTitulo').lastChild.textContent = ` Aprobar salida del pedido ${pedido.codigo}`;
        $('#pedEscanerCodigo').value = '';
        mostrarEstadoEscaner(`Apunta la cámara al QR del pedido ${pedido.codigo} que muestra el piloto.`);
        dlgEscaner.showModal();
        await encenderCamara();
    }

    async function encenderCamara() {
        const sinCamara = $('#pedEscanerSinCamara');
        sinCamara.hidden = true;
        video.hidden = false;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            mostrarSinCamara('La cámara solo funciona si la página se abre con https (o en localhost). Escribe el número del pedido abajo.');
            return;
        }
        try {
            await cargarScriptPed(PED_LECTOR_QR, 'jsQR');
            camara = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
            if (!dlgEscaner.open) { apagarCamara(); return; } // se cerró mientras pedía permiso
            video.srcObject = camara;
            await video.play();
            leerCuadro();
        } catch (e) {
            console.error('No se pudo abrir la cámara:', e);
            mostrarSinCamara(e && e.name === 'NotAllowedError'
                ? 'No hay permiso para usar la cámara. Actívalo en el navegador o escribe el número del pedido.'
                : 'No se pudo abrir la cámara. Escribe el número del pedido abajo.');
        }
    }

    function mostrarSinCamara(texto) {
        video.hidden = true;
        const caja = $('#pedEscanerSinCamara');
        caja.textContent = texto;
        caja.hidden = false;
    }

    function apagarCamara() {
        if (lazoEscaner) cancelAnimationFrame(lazoEscaner);
        lazoEscaner = null;
        if (camara) camara.getTracks().forEach((t) => t.stop());
        camara = null;
        video.srcObject = null;
    }

    // Lee el cuadro actual del video y busca un QR (unas 60 veces por segundo)
    const lienzoLector = document.createElement('canvas');
    function leerCuadro() {
        if (!camara) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA && !procesando) {
            const ancho = video.videoWidth;
            const alto = video.videoHeight;
            lienzoLector.width = ancho;
            lienzoLector.height = alto;
            const ctx = lienzoLector.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(video, 0, 0, ancho, alto);
            const codigo = window.jsQR(ctx.getImageData(0, 0, ancho, alto).data, ancho, alto, { inversionAttempts: 'dontInvert' });
            const ahora = Date.now();
            if (codigo && codigo.data && !(codigo.data === ultimoLeido.texto && ahora - ultimoLeido.hora < 4000)) {
                ultimoLeido = { texto: codigo.data, hora: ahora };
                if (codigo.data.startsWith(PED_QR_PREFIJO)) cargarPedido({ token: codigo.data.slice(PED_QR_PREFIJO.length) });
                else mostrarEstadoEscaner('Ese QR no es de un pedido de ACACHETE.', 'error');
            }
        }
        lazoEscaner = requestAnimationFrame(leerCuadro);
    }

    // Carga un pedido por su token (QR) o por su número (escrito a mano)
    async function cargarPedido({ token = null, codigo = null }) {
        procesando = true;
        mostrarEstadoEscaner('Revisando el pedido...');
        try {
            let q = db.from('pedidos').select('id, codigo, estado, tienda_id, piloto_id, slot_numero, fecha_entrega, anulado');
            q = token ? q.eq('token_qr', token) : q.eq('codigo', codigo);
            const { data: p, error } = await q.maybeSingle();
            if (error) throw error;
            if (!p || p.anulado || !tiendaPorId(p.tienda_id)) {
                mostrarEstadoEscaner(codigo ? `No se encontró el pedido ${codigo} en tus tiendas.` : 'No se encontró ese pedido en tus tiendas.', 'error');
                return;
            }
            // Es la aprobación de salida de ESTE pedido: el QR de otro no sirve
            if (p.id !== pedido.id) {
                mostrarEstadoEscaner(`Ese QR es del pedido ${p.codigo}, no del ${pedido.codigo}. Ábrelo y apruébalo desde su propio detalle.`, 'error');
                return;
            }
            if (p.estado === 'cargado') {
                mostrarEstadoEscaner(`El pedido ${p.codigo} ya estaba cargado.`, 'ok');
                return;
            }
            if (p.estado !== 'recibido_ruta') {
                mostrarEstadoEscaner(p.estado === 'listo_despacho'
                    ? `El piloto aún no marcó "Recibido para ruta" en el pedido ${p.codigo}.`
                    : `El pedido ${p.codigo} está "${(PED_ESTADOS[p.estado] || {}).texto || p.estado}": no se puede cargar.`, 'error');
                return;
            }
            // Solo si sigue "Recibido para ruta" (si otro ya lo escaneó, no se repite)
            const upd = await db.from('pedidos')
                .update({ estado: 'cargado', cargado_por: sesion.id || null, actualizado_en: new Date().toISOString() })
                .eq('id', p.id).eq('estado', 'recibido_ruta').select('id');
            if (upd.error) throw upd.error;
            if (!upd.data.length) {
                mostrarEstadoEscaner(`El pedido ${p.codigo} ya lo cargó otra persona.`, 'ok');
                return;
            }
            await registrarEvento(p.id, 'escaneo', { antes: 'recibido_ruta', despues: 'cargado', detalle: { slot: p.slot_numero } });

            // Cómo va el slot: cuántos de sus pedidos ya están cargados
            let avance = '';
            if (p.slot_numero) {
                const { data: delSlot } = await db.from('pedidos').select('estado')
                    .eq('tienda_id', p.tienda_id).eq('fecha_entrega', p.fecha_entrega).eq('slot_numero', p.slot_numero)
                    .eq('anulado', false).neq('estado', 'cancelado');
                if (delSlot) {
                    const listos = delSlot.filter((x) => ['cargado', 'en_ruta', 'en_entrega', 'entregado', 'entregado_incidencia', 'no_entregado', 'devuelto'].includes(x.estado)).length;
                    avance = ` · Slot ${p.slot_numero}: ${listos} de ${delSlot.length} cargados`;
                }
            }
            aprobado = true;
            apagarCamara();
            // El aviso "aprobar salida" ya se cumplió; al piloto se le confirma la carga
            resolverPendientes('pedido_salida', p.id);
            avisar({
                usuarios: [p.piloto_id], enlace: `#pedidos?id=${p.id}`, referenciaTipo: 'pedido', referenciaId: p.id, tipo: 'aprobado',
                titulo: 'Salida aprobada', mensaje: `El pedido ${p.codigo} quedó cargado en tu ruta.`,
            });
            mostrarEstadoEscaner(`✔ Salida aprobada: pedido ${p.codigo} cargado${avance}.`, 'ok');
            if (navigator.vibrate) navigator.vibrate(120);
            setTimeout(() => { if (dlgEscaner.open) dlgEscaner.close(); }, 1800);
        } catch (e) {
            console.error('Error al cargar el pedido escaneado:', e);
            mostrarEstadoEscaner(e && e.code === '23514'
                ? 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 12: despacho).'
                : 'No se pudo cargar. Revisa la conexión e intenta de nuevo.', 'error');
        } finally {
            procesando = false;
        }
    }

    $('#pedEscanerManual').addEventListener('submit', (evento) => {
        evento.preventDefault();
        const codigo = $('#pedEscanerCodigo').value.trim().toUpperCase();
        if (!codigo) return;
        $('#pedEscanerCodigo').value = '';
        cargarPedido({ codigo });
    });
    $('#pedEscanerCerrar').addEventListener('click', () => dlgEscaner.close());
    // Al cerrar (botón, Escape...) se apaga la cámara y, si se aprobó, se recarga el pedido
    dlgEscaner.addEventListener('close', () => {
        apagarCamara();
        if (aprobado && pedido) recargarDetalle();
    });

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
        apagarCamara();
        [dlgQr, dlgAsignar, dlgAccion, dlgSlot, dlgEscaner].forEach((d) => { if (d.open) d.close(); });
        if (mapaRuta) mapaRuta.destruir();
    };
});
