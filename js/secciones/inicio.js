/* ==================================================
   SECCIÓN: INICIO - LÓGICA (tablero "qué pasa hoy")
   ACACHETE LOGISTICS

   Guía: docs/secciones/inicio.md. Todo se lee de la empresa activa (js/supabase.js).
   Modos según el rol (js/sesion.js):
     admin    (Administrador, G1 todo · G2 su región)
       Cuadros: pedidos de hoy, en ruta, entregados (% del día) y sin piloto (hoy y
       próximos). Mapa de las entregas de hoy + pilotos, gráfica de 14 días
       (entregados / no entregados), "Hoy por tienda" y "Pendientes".
     tienda   (Admin G3) lo mismo de su tienda (sin "Hoy por tienda").
     empleado cuadros de su tienda (por alistar, en despacho, entregados), mapa y
              sus solicitudes de clientes por aprobar.
     piloto   "Mi ruta" (en cadena del más cercano al más lejano, con el botón de
              cada estado), "Mis marcas de hoy" (QR) y el mapa con sus entregas numeradas.
   Cada cuadro abre Pedidos ya filtrado (#pedidos?grupo=ruta, &fecha=todas...).
   Se actualiza cada minuto (el despachador escanea desde otro equipo).
   No cuenta los pedidos anulados.

   VIAJES: el cliente con usuario y las empresas solo de Transporte ven otro Inicio
   (montarInicioViajes, js/viajes-comun.js): viajes de hoy, próximos y la cortesía.

   MAPA: gratis (Leaflet + OpenStreetMap, js/mapa.js) o Google (INI_MAPA). Cada
   entrega de hoy se dibuja en su punto B (detalle.ruta.b, lo guarda Nuevo pedido)
   con el color de su estado; las tiendas con ubicación, como cuadro. Filtros de
   región y tienda según el rol. Cuando la app del piloto comparta su GPS, sus
   marcadores se agregan en dibujarMarcadores() con pilotosDelFiltro().
   ================================================== */

// Grupos de estados (los mismos de los cuadros de Pedidos: PED_GRUPOS)
const INI_GRUPOS = {
    pendientes: ['registrado', 'recibido_bodega', 'asignado', 'reprogramado'],
    despacho: ['alistando', 'listo_despacho', 'recibido_ruta', 'cargado'],
    ruta: ['en_ruta', 'en_entrega'],
    entregados: ['entregado', 'entregado_incidencia'],
    problemas: ['no_entregado', 'devuelto'],
    cancelados: ['cancelado'],
};
const INI_DIAS_GRAFICA = 14;

// Color de cada grupo en el mapa y la leyenda: [texto, variable CSS, color de respaldo]
const INI_COLOR_GRUPO = {
    pendientes: ['Por despachar', '--color-naranja', '#F28C28'],
    despacho: ['En despacho', '--color-azul', '#1F6FB2'],
    ruta: ['En ruta', null, '#0E6B63'],
    entregados: ['Entregado', '--color-verde', '#1E8449'],
    problemas: ['No entregado', null, '#9D174D'],
    cancelados: ['Cancelado', '--color-gris', '#6B7280'],
};

// ---------- Mapa ----------
// Qué mapa se usa:
//   'libre'  -> Leaflet + OpenStreetMap: GRATIS, sin clave ni tarjeta (con marcadores)
//   'google' -> Google Maps: necesita INI_MAPS_CLAVE con facturación activa (sin marcadores)
const INI_MAPA = 'libre';
// Centro, acercamiento, Leaflet y el dibujo de las calles: js/mapa.js
// (MAPA_CENTRO, MAPA_ZOOM, MAPA_CAPA, cargarLeaflet), compartidos con Pedidos y Cotizador.
const INI_MAPS_CENTRO = MAPA_CENTRO;
const INI_MAPA_ZOOM = MAPA_ZOOM;

// Clave de Google Maps (solo si INI_MAPA = 'google'). Es PÚBLICA (va en la página):
// debe estar restringida en Google Cloud por sitio web (referentes HTTP) y a la
// "Maps JavaScript API", para que nadie la pueda usar desde otro dominio.
const INI_MAPS_CLAVE = 'AIzaSyA1R5Y5ZESzhSz4pSdkBCxyF6JCIXKNuNI';

// Carga la librería de Google Maps una sola vez (aunque se entre varias veces a Inicio)
let iniMapsPromesa = null;
function cargarGoogleMaps() {
    if (window.google && window.google.maps && window.google.maps.importLibrary) return Promise.resolve();
    if (iniMapsPromesa) return iniMapsPromesa;
    iniMapsPromesa = new Promise((listo, falla) => {
        window.iniMapsListo = listo;
        const s = document.createElement('script');
        s.src = `https://maps.googleapis.com/maps/api/js?key=${INI_MAPS_CLAVE}&loading=async&callback=iniMapsListo&language=es&region=CR`;
        s.async = true;
        s.onerror = () => { iniMapsPromesa = null; falla(new Error('No se pudo cargar Google Maps')); };
        document.head.appendChild(s);
    });
    return iniMapsPromesa;
}

// Texto y color de cada estado (etiquetas de css/componentes.css; repetido de Pedidos)
const INI_ESTADOS = {
    registrado: ['Registrado', 'etiqueta-gris'], recibido_bodega: ['En bodega', 'etiqueta-morada'],
    asignado: ['Asignado', 'etiqueta-azul'], reprogramado: ['Reprogramado', 'etiqueta-azul'],
    alistando: ['Alistando', 'etiqueta-naranja'], listo_despacho: ['Listo para despachar', 'etiqueta-azul'],
    recibido_ruta: ['Recibido para ruta', 'etiqueta-morada'], cargado: ['Cargado', 'etiqueta-turquesa'],
    en_ruta: ['En ruta', 'etiqueta-turquesa'], en_entrega: ['Entregando', 'etiqueta-turquesa'], entregado: ['Entregado', 'etiqueta-verde'],
    entregado_incidencia: ['Entregado con incidencia', 'etiqueta-naranja'], no_entregado: ['No entregado', 'etiqueta-rosada'],
    devuelto: ['Devuelto', 'etiqueta-rosada'], cancelado: ['Cancelado', 'etiqueta-gris'],
};

const iniGrupoDe = (estado) => Object.keys(INI_GRUPOS).find((g) => INI_GRUPOS[g].includes(estado)) || 'pendientes';
const iniFechaCorta = (f) => (f ? f.split('-').reverse().slice(0, 2).join('/') : '');
const iniDinero = (n) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;

registrarSeccion('inicio', (zona) => {

    // Cliente con usuario o empresa solo de viajes (Transporte): el Inicio es el de
    // viajes (montarInicioViajes, js/viajes-comun.js), con sus datos, no los de pedidos.
    // El cliente de una empresa sin viajes (solo encomiendas) va directo a "Mis envíos".
    if (esCliente() && !empresaTieneViajes() && tienePermiso('envios')) {
        location.replace('#envios'); // replace: "atrás" no vuelve a Inicio
        return undefined;
    }
    if (esCliente() || !empresaTienePedidos()) return montarInicioViajes(zona);

    const $ = (selector) => zona.querySelector(selector);
    const aviso = crearAviso($('#iniAviso'), 5000);
    const sesion = obtenerSesion() || {};

    // ---------- Rol y alcance (js/sesion.js) ----------
    const esGeneral = esAdministrador() || esAdminG1();
    const regionG2 = esAdminG2() ? regionActual() : null;
    const esG3 = esAdminG3();
    const esEmpleado = rolActual() === 'empleado';
    const esPiloto = rolActual() === 'piloto';
    const modo = esPiloto ? 'piloto' : esEmpleado ? 'empleado' : esG3 ? 'tienda' : 'admin';

    // Fecha local de hoy "2026-09-29" (desplazada n días)
    const fechaLocal = (dias = 0) => {
        const d = new Date();
        d.setDate(d.getDate() + dias);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const hoy = fechaLocal();

    let tiendas = [];        // tiendas del alcance [{ id, codigo, nombre, region, lat, lng }]
    let pedidos = [];        // pedidos de HOY del alcance
    const pilotos = {};      // id -> nombre
    let grafica = null;
    let activa = true;

    // ==================================================
    // AYUDAS DE DIBUJO
    // ==================================================

    function saludo() {
        const h = new Date().getHours();
        const parte = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
        const nombre = (sesion.nombre || '').split(' ')[0];
        $('#iniSaludo').textContent = nombre ? `${parte}, ${nombre}` : parte;
        const fecha = new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const empresa = empresaActual();
        const alcance = esPiloto ? 'Mis pedidos'
            : regionG2 ? `Región ${regionG2}`
            : (esG3 || esEmpleado) ? (sesion.tienda ? sesion.tienda.nombre : 'Mi tienda')
            : null;
        $('#iniFecha').textContent = [fecha.charAt(0).toUpperCase() + fecha.slice(1), empresa ? empresa.nombre : null, alcance]
            .filter(Boolean).join(' · ');
    }

    // Cuadro grande: número + texto + detalle; enlace = lista ya filtrada
    function kpi({ valor, texto, detalle = '', color = 'resumen-azul', enlace = null, icono = '' }) {
        const el = document.createElement(enlace ? 'a' : 'div');
        el.className = `resumen-item ${color} ini-kpi`;
        if (enlace) el.href = enlace;
        const cab = document.createElement('span');
        cab.className = 'resumen-texto';
        if (icono) cab.innerHTML = `<i class="bi ${icono}"></i> `;
        cab.append(texto);
        const n = document.createElement('span');
        n.className = 'resumen-numero';
        n.textContent = valor;
        el.append(cab, n);
        if (detalle) {
            const d = document.createElement('span');
            d.className = 'ini-kpi-detalle';
            d.textContent = detalle;
            el.appendChild(d);
        }
        return el;
    }

    function pintarKpis(lista) {
        const caja = $('#iniKpis');
        caja.replaceChildren(...lista.map(kpi));
        caja.removeAttribute('aria-busy');
    }

    function accesos(botones) {
        const caja = $('#iniAccesos');
        caja.replaceChildren(...botones.map(([texto, icono, enlace, principal]) => {
            const a = document.createElement('a');
            a.href = enlace;
            a.className = `boton ${principal ? 'boton-principal' : 'boton-secundario'}`;
            a.innerHTML = `<i class="bi ${icono}"></i> `;
            const s = document.createElement('span');
            s.textContent = texto;
            a.appendChild(s);
            return a;
        }));
        caja.hidden = !botones.length;
    }

    // Fila de una lista: icono, texto principal, detalle, valor a la derecha y enlace
    function filaLista({ icono, titulo, detalle = '', valor = '', enlace = null, color = '' }) {
        const li = document.createElement('li');
        const el = document.createElement(enlace ? 'a' : 'div');
        el.className = `ini-fila ${color}`;
        if (enlace) el.href = enlace;
        const i = document.createElement('i');
        i.className = `bi ${icono} ini-fila-icono`;
        const textos = document.createElement('span');
        textos.className = 'ini-fila-textos';
        const t = document.createElement('strong');
        t.textContent = titulo;
        textos.appendChild(t);
        if (detalle) {
            const d = document.createElement('small');
            d.textContent = detalle;
            textos.appendChild(d);
        }
        el.append(i, textos);
        if (valor !== '') {
            const v = document.createElement('span');
            v.className = 'ini-fila-valor';
            v.textContent = valor;
            el.appendChild(v);
        }
        li.appendChild(el);
        return li;
    }

    function listaVacia(texto) {
        const li = document.createElement('li');
        li.className = 'ini-vacio';
        li.textContent = texto;
        return li;
    }

    function mostrarError(error, que) {
        console.error(`Error al cargar ${que}:`, error);
        aviso.mostrar(error && error.code === '42703'
            ? 'Falta ejecutar sql/01_actualizacion_base_existente.sql en Supabase.'
            : 'No se pudo cargar el resumen. Revisa la conexión.', 'error');
    }

    const cuenta = (lista, grupo) => lista.filter((p) => INI_GRUPOS[grupo].includes(p.estado)).length;
    const porcentaje = (parte, total) => (total ? Math.round((parte / total) * 100) : 0);

    // Color real de un grupo (variables de css/variables.css)
    const estiloRaiz = getComputedStyle(document.documentElement);
    function colorGrupo(grupo) {
        const [, variable, respaldo] = INI_COLOR_GRUPO[grupo] || INI_COLOR_GRUPO.pendientes;
        return (variable && estiloRaiz.getPropertyValue(variable).trim()) || respaldo;
    }

    // ==================================================
    // DATOS
    // ==================================================

    async function cargarTiendas() {
        let r = await db.from('tiendas').select('id, codigo, nombre, region, lat, lng').order('codigo');
        if (r.error && r.error.code === '42703') r = await db.from('tiendas').select('id, codigo, nombre, region').order('codigo');
        if (r.error) throw r.error;
        tiendas = regionG2 ? r.data.filter((t) => t.region === regionG2)
            : (esG3 || esEmpleado) ? r.data.filter((t) => t.id === tiendaActual())
            : esPiloto ? r.data // el piloto puede ser multitienda: sus pedidos dicen de qué tienda son
            : r.data;
    }

    const idsTiendas = () => (tiendas.length ? tiendas.map((t) => t.id) : [0]);
    const tiendaDe = (id) => tiendas.find((t) => t.id === id) || null;
    const nombreTienda = (id) => { const t = tiendaDe(id); return t ? `${t.codigo} · ${t.nombre}` : 'Tienda'; };

    // Lo que el rol puede ver: piloto sus pedidos; G2 su región; G3 / Empleado su tienda
    function conAlcance(q) {
        if (esPiloto) return q.eq('piloto_id', sesion.id || 0);
        if (!esGeneral || regionG2) return q.in('tienda_id', idsTiendas());
        return q;
    }

    // Pedidos de HOY (slot_numero: sql/01 bloque 12; si falta, sin él)
    async function cargarPedidosHoy() {
        const consulta = (conSlot) => conAlcance(db.from('pedidos')
            .select(`id, codigo, tienda_id, cliente_nombre, direccion_entrega, estado, piloto_id, marca_numero, ${conSlot ? 'slot_numero, ' : ''}detalle, total_cobrar, rutas(nombre)`)
            .eq('fecha_entrega', hoy).eq('anulado', false));
        let { data, error } = await consulta(true);
        if (error && error.code === '42703') ({ data, error } = await consulta(false));
        if (error) throw error;
        pedidos = data;
        // Nombre del piloto de cada pedido
        const ids = [...new Set(pedidos.map((p) => p.piloto_id).filter((id) => id && !pilotos[id]))];
        if (ids.length) {
            const r = await db.from('usuarios').select('id, nombre').in('id', ids);
            (r.data || []).forEach((u) => { pilotos[u.id] = u.nombre; });
        }
    }

    // Pedidos sin piloto de hoy en adelante (por despachar)
    async function contarSinPiloto() {
        const { count, error } = await conAlcance(db.from('pedidos').select('id', { count: 'exact', head: true })
            .gte('fecha_entrega', hoy).eq('anulado', false).is('piloto_id', null).in('estado', INI_GRUPOS.pendientes));
        return error ? 0 : count || 0;
    }

    // ==================================================
    // ADMINISTRADOR, G1, G2 Y G3
    // ==================================================

    async function pintarAdmin() {
        const sinPiloto = await contarSinPiloto();
        if (!activa) return;
        const total = pedidos.filter((p) => p.estado !== 'cancelado').length;
        const entregados = cuenta(pedidos, 'entregados');
        const incidencias = pedidos.filter((p) => p.estado === 'entregado_incidencia').length;
        const enRuta = cuenta(pedidos, 'ruta');
        const pilotosEnRuta = new Set(pedidos.filter((p) => INI_GRUPOS.ruta.includes(p.estado)).map((p) => p.piloto_id)).size;
        const problemas = cuenta(pedidos, 'problemas');

        pintarKpis([
            { valor: String(total), texto: 'Pedidos de hoy', icono: 'bi-box-seam', color: 'resumen-azul', enlace: '#pedidos',
              detalle: `${cuenta(pedidos, 'pendientes')} por despachar · ${cuenta(pedidos, 'despacho')} en despacho` },
            { valor: String(enRuta), texto: 'En ruta', icono: 'bi-truck', color: 'resumen-turquesa', enlace: '#pedidos?grupo=ruta',
              detalle: enRuta ? `${plural(pilotosEnRuta, 'piloto', 'pilotos')} en la calle` : 'Nadie en ruta ahora' },
            { valor: String(entregados), texto: 'Entregados', icono: 'bi-check-circle', color: 'resumen-verde', enlace: '#pedidos?grupo=entregados',
              detalle: `${porcentaje(entregados, total)} % de hoy${incidencias ? ` · ${incidencias} con incidencia` : ''}${problemas ? ` · ${problemas} no entregado${problemas === 1 ? '' : 's'}` : ''}` },
            { valor: String(sinPiloto), texto: 'Sin piloto', icono: 'bi-person-x', color: sinPiloto ? 'resumen-rosada' : 'resumen-gris',
              enlace: '#pedidos?grupo=pendientes&fecha=todas',
              detalle: sinPiloto ? 'Hoy y próximos días: asígnales piloto' : 'Todo tiene piloto' },
        ]);

        if (!esG3) pintarPorTienda();
        await pintarPendientes(sinPiloto, problemas);
    }

    // Hoy por tienda: cuántos, cuántos entregados y cuántos faltan (los que más faltan primero)
    function pintarPorTienda() {
        const grupos = new Map();
        pedidos.filter((p) => p.estado !== 'cancelado').forEach((p) => {
            if (!grupos.has(p.tienda_id)) grupos.set(p.tienda_id, { total: 0, entregados: 0, faltan: 0, problemas: 0 });
            const g = grupos.get(p.tienda_id);
            g.total++;
            const grupo = iniGrupoDe(p.estado);
            if (grupo === 'entregados') g.entregados++;
            else if (grupo === 'problemas') g.problemas++;
            else g.faltan++;
        });
        const lista = $('#iniTiendasLista');
        const filas = [...grupos.entries()].sort((a, b) => b[1].faltan - a[1].faltan || b[1].total - a[1].total).slice(0, 8);
        lista.replaceChildren(...(filas.length ? filas.map(([id, g]) => filaLista({
            icono: 'bi-shop', titulo: nombreTienda(id), enlace: `#pedidos?tienda=${id}`,
            color: g.problemas ? 'ini-fila-mal' : g.faltan ? 'ini-fila-alerta' : 'ini-fila-bien',
            detalle: `${plural(g.total, 'pedido', 'pedidos')} · ${g.entregados} entregado${g.entregados === 1 ? '' : 's'}` +
                `${g.faltan ? ` · faltan ${g.faltan}` : ''}${g.problemas ? ` · ${g.problemas} no entregado${g.problemas === 1 ? '' : 's'}` : ''}`,
            valor: `${porcentaje(g.entregados, g.total)} %`,
        })) : [listaVacia('Hoy todavía no hay pedidos.')]));
        $('#iniTiendas').hidden = false;
    }

    // Pendientes: cada uno lleva a donde se resuelve
    async function pintarPendientes(sinPiloto, problemas) {
        const items = [];
        if (sinPiloto) items.push({ icono: 'bi-person-x', titulo: 'Pedidos sin piloto', enlace: '#pedidos?grupo=pendientes&fecha=todas',
            detalle: 'Hoy y próximos días', valor: String(sinPiloto) });
        if (problemas) items.push({ icono: 'bi-x-circle', titulo: 'No entregados hoy', enlace: '#pedidos?grupo=problemas',
            detalle: 'Revisa el motivo y reprograma', valor: String(problemas), color: 'ini-fila-mal' });

        // Pilotos con pedidos hoy que la tienda todavía no validó (QR del día, sql/01 bloque 14)
        const conPedidos = [...new Set(pedidos.filter((p) => p.piloto_id && !['entregados', 'problemas', 'cancelados'].includes(iniGrupoDe(p.estado)))
            .map((p) => p.piloto_id))];
        if (conPedidos.length) {
            const v = await db.from('pilotos_dia').select('piloto_id, validado_en').eq('fecha', hoy).in('piloto_id', conPedidos);
            if (!v.error) {
                const validados = new Set(v.data.filter((x) => x.validado_en).map((x) => x.piloto_id));
                const faltan = conPedidos.filter((id) => !validados.has(id));
                if (faltan.length) items.push({ icono: 'bi-qr-code', titulo: 'Pilotos sin validar hoy',
                    detalle: faltan.map((id) => pilotos[id] || 'Piloto').slice(0, 4).join(', ') + (faltan.length > 4 ? '…' : '') +
                        ' · la tienda escanea su "QR del día"', valor: String(faltan.length) });
            }
        }

        // Clientes y usuarios por aprobar
        let qCli = db.from('clientes').select('id, clientes_tiendas!inner(tienda_id)').or('aprobado.eq.false,cambios_pendientes.not.is.null');
        if (!esGeneral || regionG2) qCli = qCli.in('clientes_tiendas.tienda_id', idsTiendas());
        const cli = await qCli.limit(500);
        if (!cli.error && cli.data.length) items.push({ icono: 'bi-person-plus', titulo: 'Clientes por aprobar',
            enlace: '#clientes', detalle: 'Agregados o modificados por un empleado', valor: String(new Set(cli.data.map((c) => c.id)).size) });
        if (!esG3) {
            const usr = await db.from('usuarios').select('id, tienda_id, region, tiendas(region)').eq('aprobado', false).limit(500);
            const mios = (usr.data || []).filter((u) => (esGeneral && !regionG2) || (u.tiendas && u.tiendas.region === regionG2));
            if (mios.length) items.push({ icono: 'bi-people', titulo: 'Usuarios por aprobar', enlace: '#usuarios',
                detalle: 'Creados por un Admin G3', valor: String(mios.length) });
        }
        if (!activa) return;
        const lista = $('#iniPendientesLista');
        lista.replaceChildren(...(items.length ? items.map((x) => filaLista({ color: 'ini-fila-alerta', ...x }))
            : [listaVacia('No hay nada pendiente. ¡Todo al día!')]));
        $('#iniPendientes').hidden = false;
    }

    // Gráfica: pedidos por día de los últimos 14 días (entregados / no entregados / otros)
    async function pintarGrafica() {
        const desde = fechaLocal(-(INI_DIAS_GRAFICA - 1));
        const { data, error } = await conAlcance(db.from('pedidos').select('fecha_entrega, estado')
            .gte('fecha_entrega', desde).lte('fecha_entrega', hoy).eq('anulado', false)).limit(10000);
        if (error || !activa) return;
        const dias = Array.from({ length: INI_DIAS_GRAFICA }, (_, i) => fechaLocal(i - (INI_DIAS_GRAFICA - 1)));
        const del = (d, grupo) => data.filter((p) => p.fecha_entrega === d && INI_GRUPOS[grupo].includes(p.estado)).length;
        const entregados = dias.map((d) => del(d, 'entregados'));
        const fallidos = dias.map((d) => del(d, 'problemas'));
        const otros = dias.map((d) => data.filter((p) => p.fecha_entrega === d && !['entregados', 'problemas', 'cancelados'].includes(iniGrupoDe(p.estado))).length);
        $('#iniGrafica').hidden = false;
        try {
            await cargarLibreria(LIBRERIAS.chart); // js/componentes.js
        } catch {
            $('#iniGrafica').hidden = true;
            return;
        }
        if (!activa) return;
        if (grafica) grafica.destroy();
        grafica = new window.Chart($('#iniGraficaLienzo'), {
            type: 'bar',
            data: {
                labels: dias.map(iniFechaCorta),
                datasets: [
                    { label: 'Entregados', data: entregados, backgroundColor: colorGrupo('entregados'), borderRadius: 3, maxBarThickness: 18 },
                    { label: 'No entregados', data: fallidos, backgroundColor: colorGrupo('problemas'), borderRadius: 3, maxBarThickness: 18 },
                    { label: 'Sin terminar', data: otros, backgroundColor: colorGrupo('pendientes'), borderRadius: 3, maxBarThickness: 18 },
                ],
            },
            options: {
                maintainAspectRatio: false,
                animation: { duration: 250 },
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
                },
            },
        });
    }

    // ==================================================
    // EMPLEADO
    // ==================================================

    async function pintarEmpleado() {
        const total = pedidos.filter((p) => p.estado !== 'cancelado').length;
        const entregados = cuenta(pedidos, 'entregados');
        pintarKpis([
            { valor: String(total), texto: 'Pedidos de hoy', icono: 'bi-box-seam', color: 'resumen-azul', enlace: '#pedidos',
              detalle: `${cuenta(pedidos, 'ruta')} en ruta` },
            { valor: String(cuenta(pedidos, 'pendientes')), texto: 'Por alistar', icono: 'bi-hourglass-split', color: 'resumen-naranja',
              enlace: '#pedidos?grupo=pendientes', detalle: 'Registrados o asignados' },
            { valor: String(cuenta(pedidos, 'despacho')), texto: 'En despacho', icono: 'bi-box2', color: 'resumen-azul',
              enlace: '#pedidos?grupo=despacho', detalle: 'Alistando, listos o cargados' },
            { valor: String(entregados), texto: 'Entregados', icono: 'bi-check-circle', color: 'resumen-verde',
              enlace: '#pedidos?grupo=entregados', detalle: `${porcentaje(entregados, total)} % de hoy` },
        ]);
        const cli = await db.from('clientes').select('id, nombre, apellido1, aprobado, cambios_pendientes, solicitado_en')
            .eq('solicitado_por', sesion.id || 0).or('aprobado.eq.false,cambios_pendientes.not.is.null');
        if (!activa) return;
        const clientes = cli.data || [];
        const lista = $('#iniSolicitudesLista');
        lista.replaceChildren(...(clientes.length ? clientes.map((c) => filaLista({
            icono: 'bi-person', titulo: `${c.nombre} ${c.apellido1}`, enlace: '#clientes',
            detalle: c.aprobado ? 'Cambios esperando aprobación' : 'Cliente nuevo esperando aprobación',
        })) : [listaVacia('No tienes solicitudes pendientes.')]));
        $('#iniSolicitudes').hidden = false;
    }

    // ==================================================
    // PILOTO: cuadros
    // ==================================================

    function pintarKpisPiloto() {
        const porRecibir = miRuta.filter((p) => ['listo_despacho', 'recibido_ruta'].includes(p.estado)).length;
        const enRuta = miRuta.filter((p) => ['cargado', 'en_ruta', 'en_entrega'].includes(p.estado)).length;
        const entregados = cuenta(pedidos, 'entregados');
        const hechas = marcasHoy.filter((m) => marcadas[m.numero]).length;
        pintarKpis([
            { valor: String(porRecibir), texto: 'Por recibir', icono: 'bi-hand-thumbs-up', color: 'resumen-naranja',
              detalle: 'Listos para despachar' },
            { valor: String(enRuta), texto: 'En ruta', icono: 'bi-truck', color: 'resumen-turquesa', detalle: 'Cargados y por entregar' },
            { valor: String(entregados), texto: 'Entregados hoy', icono: 'bi-check-circle', color: 'resumen-verde',
              enlace: '#pedidos?grupo=entregados', detalle: `${cuenta(pedidos, 'problemas')} no entregados` },
            { valor: marcasCargadas ? `${hechas}/${marcasHoy.length}` : '—', texto: 'Mis marcas', icono: 'bi-alarm', color: 'resumen-azul',
              detalle: marcasHoy.length ? 'Horarios marcados hoy' : 'Hoy sin horarios' },
        ]);
    }

    // ==================================================
    // MAPA (todos): entregas de hoy, tiendas y pilotos
    // ==================================================

    let mapaLibre = null;     // mapa de Leaflet (para quitarlo al salir de Inicio)
    let capaMarcadores = null;
    let vigiaTamano = null;   // ResizeObserver: el mapa se reacomoda si cambia el tamaño
    let yaEncuadrado = false; // el mapa se encuadra con los puntos solo la primera vez

    // Mensaje dentro de la caja del mapa (cuando no carga)
    function avisoMapa(caja, titulo, texto) {
        caja.classList.remove('conectado');
        caja.replaceChildren();
        const i = document.createElement('i');
        i.className = 'bi bi-exclamation-triangle';
        const t = document.createElement('strong');
        t.textContent = titulo;
        const s = document.createElement('span');
        s.textContent = texto;
        caja.append(i, t, s);
    }

    function mostrarMapa() {
        const caja = $('#iniMapa');
        if (INI_MAPA === 'google') mostrarMapaGoogle(caja);
        else mostrarMapaLibre(caja);
    }

    // Leaflet + OpenStreetMap: gratis y sin clave
    function mostrarMapaLibre(caja) {
        cargarLeaflet()
            .then(() => {
                if (!caja.isConnected) return; // ya se salió de Inicio
                caja.replaceChildren();
                caja.classList.add('conectado');
                mapaLibre = window.L.map(caja, { zoomControl: true, attributionControl: true })
                    .setView([INI_MAPS_CENTRO.lat, INI_MAPS_CENTRO.lng], INI_MAPA_ZOOM);
                window.L.tileLayer(MAPA_CAPA.url, { maxZoom: MAPA_CAPA.zoomMaximo, attribution: MAPA_CAPA.credito }).addTo(mapaLibre);
                capaMarcadores = window.L.layerGroup().addTo(mapaLibre);
                if (window.ResizeObserver) {
                    vigiaTamano = new ResizeObserver(() => mapaLibre && mapaLibre.invalidateSize());
                    vigiaTamano.observe(caja);
                }
                dibujarMarcadores();
            })
            .catch((error) => {
                console.error('Error al cargar el mapa:', error);
                avisoMapa(caja, 'No se pudo cargar el mapa', 'Revisa la conexión a internet.');
            });
    }

    // Google Maps: necesita INI_MAPS_CLAVE con facturación activa (sin marcadores)
    function mostrarMapaGoogle(caja) {
        window.gm_authFailure = () => avisoMapa(caja, 'Google Maps rechazó la clave',
            'Revisa en Google Cloud que la clave esté activa, con facturación y permitida para este sitio. O usa el mapa libre (INI_MAPA = \'libre\').');
        cargarGoogleMaps()
            .then(() => google.maps.importLibrary('maps'))
            .then(({ Map }) => {
                if (!caja.isConnected) return;
                caja.replaceChildren();
                caja.classList.add('conectado');
                new Map(caja, { center: INI_MAPS_CENTRO, zoom: INI_MAPA_ZOOM, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
            })
            .catch((error) => console.error('Error al cargar Google Maps:', error));
    }

    const puntoB = (p) => { const r = (p.detalle || {}).ruta; return r && r.b && r.b.lat != null ? r.b : null; };

    // ---------- Filtros del mapa (región y tienda, según el rol) ----------
    //   Admin / G1 -> región y tienda | G2 -> tienda (de su región) | G3 / Empleado / Piloto -> sin filtros
    const selMapaRegion = $('#iniMapaRegion');
    const selMapaTienda = $('#iniMapaTienda');

    function prepararFiltrosMapa() {
        if (esGeneral && !regionG2) {
            const regiones = [...new Set(tiendas.map((t) => t.region))].sort();
            selMapaRegion.replaceChildren(new Option('Todas las regiones', ''), ...regiones.map((r) => new Option(`Región ${r}`, r)));
            selMapaRegion.hidden = regiones.length <= 1;
        }
        if ((esGeneral || regionG2) && tiendas.length > 1) {
            llenarTiendasMapa();
            selMapaTienda.hidden = false;
        }
    }

    function llenarTiendasMapa() {
        const lista = tiendas.filter((t) => !selMapaRegion.value || t.region === selMapaRegion.value);
        selMapaTienda.replaceChildren(new Option('Todas las tiendas', ''), ...lista.map((t) => new Option(`${t.codigo} · ${t.nombre}`, t.id)));
    }

    // Ids de las tiendas que pide el filtro del mapa (null = sin filtro: todo lo del alcance)
    function tiendasDelMapa() {
        if (selMapaTienda.value) return [Number(selMapaTienda.value)];
        if (selMapaRegion.value) return tiendas.filter((t) => t.region === selMapaRegion.value).map((t) => t.id);
        return null;
    }

    const pedidosDelFiltro = () => { const t = tiendasDelMapa(); return pedidos.filter((p) => !t || t.includes(p.tienda_id)); };

    // Pilotos que muestra el mapa: los que tienen pedidos hoy en las tiendas del filtro.
    // La usarán los marcadores en tiempo real cuando la app del piloto comparta su GPS.
    const pilotosDelFiltro = () => new Set(pedidosDelFiltro().filter((p) => p.piloto_id).map((p) => p.piloto_id));

    selMapaRegion.addEventListener('change', () => { llenarTiendasMapa(); yaEncuadrado = false; dibujarMapaYPilotos(); });
    selMapaTienda.addEventListener('change', () => { yaEncuadrado = false; dibujarMapaYPilotos(); });

    function dibujarMapaYPilotos() {
        dibujarMarcadores();
        if (!esPiloto) dibujarPilotosActivos();
    }

    // Leyenda de colores (solo los grupos que hay hoy)
    function dibujarLeyenda(lista) {
        const ul = $('#iniMapaLeyenda');
        const grupos = Object.keys(INI_COLOR_GRUPO).filter((g) => lista.some((p) => iniGrupoDe(p.estado) === g));
        ul.replaceChildren(...grupos.map((g) => {
            const li = document.createElement('li');
            const punto = document.createElement('span');
            punto.className = 'ini-leyenda-punto';
            punto.style.backgroundColor = colorGrupo(g);
            li.append(punto, `${INI_COLOR_GRUPO[g][0]} (${lista.filter((p) => iniGrupoDe(p.estado) === g).length})`);
            return li;
        }));
        ul.hidden = !grupos.length;
    }

    // Ventanita de un pedido en el mapa (con DOM: nunca se interpreta texto como HTML)
    function contenidoPedido(p, numero = null) {
        const div = document.createElement('div');
        div.className = 'ini-popup';
        const a = document.createElement('a');
        a.href = `#pedidos?id=${p.id}`;
        a.textContent = numero ? `${numero}. ${p.codigo}` : p.codigo;
        const [texto, color] = INI_ESTADOS[p.estado] || [p.estado, 'etiqueta-gris'];
        const etiqueta = document.createElement('span');
        etiqueta.className = `etiqueta ${color}`;
        etiqueta.textContent = texto;
        const linea = document.createElement('div');
        linea.append(a, ' ', etiqueta);
        const detalle = document.createElement('small');
        detalle.textContent = [p.cliente_nombre, p.direccion_entrega,
            p.piloto_id && !esPiloto ? `Piloto: ${pilotos[p.piloto_id] || '—'}` : null,
            !esPiloto && tiendas.length > 1 ? nombreTienda(p.tienda_id) : null].filter(Boolean).join(' · ');
        div.append(linea, detalle);
        return div;
    }

    // Marcadores: tiendas (cuadro) y entregas de hoy (círculo del color de su estado).
    // El piloto ve sus entregas numeradas en el orden de "Mi ruta".
    function dibujarMarcadores() {
        const lista = esPiloto ? pedidos.concat(miRuta.filter((p) => !pedidos.some((x) => x.id === p.id))) : pedidosDelFiltro();
        dibujarLeyenda(lista);
        if (!mapaLibre || !capaMarcadores) return;
        const L = window.L;
        capaMarcadores.clearLayers();
        const puntos = [];

        // Tiendas con ubicación (punto de salida de sus entregas)
        const filtro = tiendasDelMapa();
        tiendas.filter((t) => t.lat != null && t.lng != null && (!filtro || filtro.includes(t.id))
            && (!esPiloto || lista.some((p) => p.tienda_id === t.id))).forEach((t) => {
            const icono = L.divIcon({ className: 'ini-marcador-tienda', html: '<i class="bi bi-shop"></i>', iconSize: [26, 26], iconAnchor: [13, 13] });
            L.marker([Number(t.lat), Number(t.lng)], { icon: icono, title: `${t.codigo} · ${t.nombre}` })
                .bindTooltip(`${t.codigo} · ${t.nombre}`).addTo(capaMarcadores);
            puntos.push([Number(t.lat), Number(t.lng)]);
        });

        // Piloto: número de cada entrega según el orden de su ruta
        const numeroDe = new Map(ordenRuta.map((x, i) => [x.p.id, i + 1]));
        let sinPunto = 0;
        lista.forEach((p) => {
            const b = puntoB(p);
            if (!b) { sinPunto++; return; }
            const grupo = iniGrupoDe(p.estado);
            const numero = numeroDe.get(p.id) || null;
            // Número del piloto: círculo con el color del estado (el color sale de las
            // variables de la empresa, no de lo escrito por el usuario)
            const marcador = numero
                ? L.marker([b.lat, b.lng], { icon: L.divIcon({ className: 'ini-marcador-numero', iconSize: [26, 26], iconAnchor: [13, 13],
                    html: `<span style="background-color:${colorGrupo(grupo)}">${numero}</span>` }) })
                : L.circleMarker([b.lat, b.lng], { radius: 8, weight: 2, color: '#FFFFFF', fillColor: colorGrupo(grupo), fillOpacity: 0.95 });
            marcador.bindPopup(contenidoPedido(p, numero)).addTo(capaMarcadores);
            puntos.push([b.lat, b.lng]);
        });

        const nota = $('#iniMapaNota');
        nota.textContent = !lista.length ? 'Hoy no hay entregas para mostrar.'
            : sinPunto ? `${plural(sinPunto, 'pedido no tiene', 'pedidos no tienen')} punto en el mapa (se marca en Nuevo pedido, mapa A → B).`
            : '';
        if (puntos.length && !yaEncuadrado) {
            mapaLibre.fitBounds(puntos, { padding: [30, 30], maxZoom: 15 });
            yaEncuadrado = true;
        }
    }

    // Lista "Pilotos de hoy": en ruta, cuántos les faltan y cuántos entregaron
    function dibujarPilotosActivos() {
        const ul = $('#iniMapaPilotos');
        ul.replaceChildren();
        const porPiloto = {};
        pedidosDelFiltro().filter((p) => p.piloto_id).forEach((p) => { (porPiloto[p.piloto_id] = porPiloto[p.piloto_id] || []).push(p); });
        const lista = Object.entries(porPiloto).map(([id, suyos]) => {
            const enRuta = suyos.some((p) => INI_GRUPOS.ruta.includes(p.estado));
            const porSalir = suyos.filter((p) => ['pendientes', 'despacho'].includes(iniGrupoDe(p.estado))).length;
            const hechos = suyos.filter((p) => iniGrupoDe(p.estado) === 'entregados').length;
            const detalle = [enRuta ? 'En ruta' : null, porSalir ? `${porSalir} por salir` : null, `${hechos}/${suyos.length} entregados`].filter(Boolean).join(' · ');
            return { id, clase: enRuta ? 'ruta' : porSalir ? 'pendientes' : '', detalle, orden: enRuta ? 0 : porSalir ? 1 : 2 };
        }).sort((a, b) => a.orden - b.orden || (pilotos[a.id] || '').localeCompare(pilotos[b.id] || ''));

        if (!lista.length) {
            const li = document.createElement('li');
            li.textContent = 'Sin pilotos con pedidos hoy.';
            ul.appendChild(li);
            return;
        }
        lista.forEach((x) => {
            const li = document.createElement('li');
            const punto = document.createElement('span');
            punto.className = `ini-punto ${x.clase}`;
            const textos = document.createElement('div');
            const nombre = document.createElement('strong');
            nombre.textContent = pilotos[x.id] || 'Piloto';
            const estado = document.createElement('small');
            estado.className = x.clase;
            estado.textContent = x.detalle;
            textos.append(nombre, estado);
            li.append(punto, textos);
            ul.appendChild(li);
        });
    }

    // ==================================================
    // MI RUTA (solo el PILOTO)
    //   Por recibir  -> "Listo para despachar": "Recibido para ruta" (abre el QR)
    //                   "Recibido para ruta": "Mostrar QR" (el despachador lo escanea)
    //   Cargados     -> esperan "Saliendo a ruta" (pasan todos a En ruta y se
    //                   detiene el cronómetro de carga del slot: salida_en)
    //   En ruta      -> ordenados del más cercano al más lejano: cadena desde la
    //                   tienda (cada uno, el más cercano al anterior). "Entregar
    //                   ahora" en UNO a la vez (la base no deja dos "Entregando").
    //   Entregando   -> se cierra en el detalle (Entregado / No entregado).
    // ==================================================

    const INI_MI_RUTA = ['listo_despacho', 'recibido_ruta', 'cargado', 'en_ruta', 'en_entrega'];
    const avisoRuta = crearAviso($('#iniMiRutaAviso'), 5000);
    let miRuta = [];
    let ordenRuta = []; // [{ p, km }] en el orden en que se ven (numera los marcadores)

    // Distancia en línea recta entre dos puntos { lat, lng } (km)
    function kmEntre(a, b) {
        const rad = (x) => (x * Math.PI) / 180;
        const dLat = rad(b.lat - a.lat);
        const dLng = rad(b.lng - a.lng);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
        return 6371 * 2 * Math.asin(Math.sqrt(h));
    }

    function puntoTienda(p) {
        const t = p.tiendas;
        if (t && t.lat != null && t.lng != null) return { lat: Number(t.lat), lng: Number(t.lng) };
        const r = (p.detalle || {}).ruta;
        return r && r.a && r.a.lat != null ? r.a : null;
    }

    // Cadena: desde "inicio", siempre el más cercano al punto anterior. Los que no
    // tienen ubicación van al final. Devuelve [{ p, km }] (km desde el anterior).
    function ordenarEnCadena(lista, inicio) {
        const conPunto = lista.filter(puntoB);
        const sinPunto = lista.filter((p) => !puntoB(p));
        const orden = [];
        let actual = inicio;
        while (conPunto.length) {
            let mejor = 0;
            if (actual) {
                conPunto.forEach((p, i) => { if (kmEntre(actual, puntoB(p)) < kmEntre(actual, puntoB(conPunto[mejor]))) mejor = i; });
            }
            const [p] = conPunto.splice(mejor, 1);
            orden.push({ p, km: actual ? kmEntre(actual, puntoB(p)) : null });
            actual = puntoB(p);
        }
        return orden.concat(sinPunto.map((p) => ({ p, km: null })));
    }

    async function cargarMiRuta() {
        if (!esPiloto) return;
        const consulta = (columnasTienda) => db.from('pedidos')
            .select(`id, codigo, tienda_id, cliente_nombre, direccion_entrega, estado, slot_numero, fecha_entrega, detalle, tiendas(${columnasTienda})`)
            .eq('piloto_id', sesion.id || 0).eq('anulado', false).in('estado', INI_MI_RUTA)
            .lte('fecha_entrega', hoy).order('fecha_entrega').order('id');
        let { data, error } = await consulta('lat, lng');
        if (error && error.code === '42703') ({ data, error } = await consulta('id'));
        if (error) {
            console.error('Error al cargar mi ruta:', error);
            $('#iniMiRutaResumen').textContent = error.code === '42703' || error.code === '22P02'
                ? 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 12: despacho).'
                : 'No se pudo cargar tu ruta.';
            return;
        }
        miRuta = data;
        dibujarMiRuta();
    }

    function dibujarMiRuta() {
        const ol = $('#iniMiRutaLista');
        ol.replaceChildren();
        const porEstado = (e) => miRuta.filter((p) => p.estado === e);
        const entregando = porEstado('en_entrega')[0] || null;
        const cargados = porEstado('cargado');
        const enRuta = porEstado('en_ruta');
        const porRecibir = miRuta.filter((p) => ['listo_despacho', 'recibido_ruta'].includes(p.estado));

        // Orden: el que está entregando, luego en cadena los de la ruta (o los cargados), y al final los por recibir
        const inicio = entregando ? puntoB(entregando) : (miRuta[0] ? puntoTienda(miRuta[0]) : null);
        const filas = [
            ...(entregando ? [{ p: entregando, km: null }] : []),
            ...ordenarEnCadena(enRuta.length ? enRuta : cargados, inicio),
            ...(enRuta.length ? ordenarEnCadena(cargados, null) : []),
            ...porRecibir.map((p) => ({ p, km: null })),
        ];
        ordenRuta = filas.filter((x) => ['en_entrega', 'en_ruta', 'cargado'].includes(x.p.estado));

        $('#iniMiRutaResumen').textContent = miRuta.length
            ? [
                porRecibir.length ? plural(porRecibir.length, 'por recibir', 'por recibir') : null,
                cargados.length ? plural(cargados.length, 'cargado', 'cargados') : null,
                enRuta.length + (entregando ? 1 : 0) ? `${enRuta.length + (entregando ? 1 : 0)} en ruta` : null,
            ].filter(Boolean).join(' · ') + ' · del más cercano al más lejano'
            : 'No tienes pedidos por despachar ni en ruta.';
        $('#iniSaliendo').disabled = !cargados.length;
        $('#iniSaliendo').querySelector('span').textContent = cargados.length ? `Saliendo a ruta (${cargados.length})` : 'Saliendo a ruta';

        if (!filas.length) {
            const li = document.createElement('li');
            li.className = 'ini-mi-ruta-vacio';
            li.textContent = 'Cuando un pedido tuyo esté listo para despachar aparecerá aquí.';
            ol.appendChild(li);
        }

        let sugerido = !entregando; // el primero "En ruta" de la cadena es el siguiente sugerido
        let numero = 0;
        filas.forEach(({ p, km }) => {
            const li = document.createElement('li');
            li.className = `ini-mi-ruta-item ${p.estado}`;
            const n = document.createElement('span');
            n.className = 'ini-mi-ruta-numero';
            n.textContent = ['en_entrega', 'en_ruta', 'cargado'].includes(p.estado) ? String(++numero) : '·';

            const textos = document.createElement('div');
            textos.className = 'ini-mi-ruta-textos';
            const linea = document.createElement('span');
            const a = document.createElement('a');
            a.href = `#pedidos?id=${p.id}`;
            a.textContent = p.codigo;
            const [texto, color] = INI_ESTADOS[p.estado] || [p.estado, 'etiqueta-gris'];
            const etiqueta = document.createElement('span');
            etiqueta.className = `etiqueta ${color}`;
            etiqueta.textContent = texto;
            linea.append(a, ' ', etiqueta);
            if (sugerido && p.estado === 'en_ruta') {
                const s = document.createElement('span');
                s.className = 'etiqueta etiqueta-verde';
                s.textContent = 'Siguiente';
                linea.append(' ', s);
                sugerido = false;
            }
            const detalle = document.createElement('small');
            detalle.textContent = [
                p.cliente_nombre, p.direccion_entrega,
                p.slot_numero ? `Slot ${p.slot_numero}` : null,
                km != null ? `a ${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} del anterior` : null,
            ].filter(Boolean).join(' · ');
            textos.append(linea, detalle);

            const accion = botonMiRuta(p, !!entregando);
            li.append(n, textos);
            if (accion) li.appendChild(accion);
            ol.appendChild(li);
        });
        pintarKpisPiloto();
        dibujarMarcadores();
    }

    // Botón de cada pedido según su estado
    function botonMiRuta(p, hayEntregando) {
        const crear = (texto, icono, clase, alClic) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `boton ${clase} boton-chico`;
            b.innerHTML = `<i class="bi ${icono}"></i> <span></span>`;
            b.querySelector('span').textContent = texto;
            b.addEventListener('click', alClic);
            return b;
        };
        if (p.estado === 'listo_despacho') return crear('Recibido para ruta', 'bi-hand-thumbs-up', 'boton-principal', () => recibirParaRuta(p));
        if (p.estado === 'recibido_ruta') return crear('Mostrar QR', 'bi-qr-code', 'boton-secundario', () => { location.hash = `pedidos?id=${p.id}&qr=1`; });
        if (p.estado === 'en_entrega') return crear('Cerrar entrega', 'bi-check2-circle', 'boton-principal', () => { location.hash = `pedidos?id=${p.id}`; });
        if (p.estado === 'en_ruta') {
            const b = crear('Entregar ahora', 'bi-geo-alt', 'boton-secundario', () => entregarAhora(p));
            b.disabled = hayEntregando;
            if (hayEntregando) b.title = 'Primero termina el pedido que estás entregando';
            return b;
        }
        return null; // cargado: espera "Saliendo a ruta"
    }

    // Cambia el estado (solo si sigue en el que se ve) y lo deja en la línea de tiempo
    async function cambiarMiPedido(ids, antes, despues, evento = 'estado') {
        const { data, error } = await db.from('pedidos')
            .update({ estado: despues, actualizado_en: new Date().toISOString() })
            .in('id', ids).eq('estado', antes).eq('piloto_id', sesion.id || 0).select('id');
        if (error) return { error };
        if (data.length) {
            await db.from('pedido_historial').insert(data.map((p) => ({
                pedido_id: p.id, evento, estado_anterior: antes, estado_nuevo: despues,
                usuario_id: sesion.id || null, usuario_nombre: sesion.nombre || null,
            })));
        }
        return { cambiados: data.length };
    }

    async function recibirParaRuta(p) {
        const r = await cambiarMiPedido([p.id], 'listo_despacho', 'recibido_ruta');
        if (r.error) { console.error(r.error); avisoRuta.mostrar('No se pudo marcar. Intenta de nuevo.', 'error'); return; }
        // Aviso al Admin G3 de la tienda: aprobar la salida (js/notificaciones.js)
        if (r.cambiados) {
            await avisar({
                tiendaId: p.tienda_id, a: ['g3'], tipo: 'pendiente', enlace: `#pedidos?id=${p.id}`,
                referenciaTipo: 'pedido_salida', referenciaId: p.id,
                titulo: 'Aprobar salida de un pedido',
                mensaje: `${sesion.nombre || 'El piloto'} recibió el pedido ${p.codigo} para ruta. Ábrelo y escanea su QR para aprobar la salida.`,
            });
        }
        location.hash = `pedidos?id=${p.id}&qr=1`; // el QR para que lo escanee el despachador
    }

    async function entregarAhora(p) {
        const r = await cambiarMiPedido([p.id], 'en_ruta', 'en_entrega');
        if (r.error) {
            console.error(r.error);
            avisoRuta.mostrar(r.error.code === '23505'
                ? 'Primero marca como entregado (o no entregado) el pedido que estás entregando.'
                : 'No se pudo marcar. Intenta de nuevo.', 'error');
        } else {
            avisoRuta.mostrar(`Pedido ${p.codigo}: entregando. Ciérralo en su detalle al terminar.`);
        }
        cargarMiRuta();
    }

    $('#iniSaliendo').addEventListener('click', async () => {
        const boton = $('#iniSaliendo');
        const ids = miRuta.filter((p) => p.estado === 'cargado').map((p) => p.id);
        if (!ids.length) return;
        boton.disabled = true;
        const r = await cambiarMiPedido(ids, 'cargado', 'en_ruta', 'salida');
        if (r.error) {
            console.error(r.error);
            avisoRuta.mostrar('No se pudo marcar la salida. Intenta de nuevo.', 'error');
        } else {
            avisoRuta.mostrar(`¡Buen viaje! ${plural(r.cambiados, 'pedido', 'pedidos')} en ruta. Marca "Entregar ahora" en el que vas a entregar.`);
            // Aviso al Admin G3 de cada tienda: qué pedidos salieron (js/notificaciones.js)
            const porTienda = {};
            miRuta.filter((p) => ids.includes(p.id)).forEach((p) => { (porTienda[p.tienda_id] = porTienda[p.tienda_id] || []).push(p.codigo); });
            await Promise.all(Object.entries(porTienda).map(([tiendaId, codigos]) => avisar({
                tiendaId: Number(tiendaId), a: ['g3'], enlace: '#pedidos', referenciaTipo: 'salida_ruta', referenciaId: sesion.id || null,
                titulo: 'Piloto en ruta',
                mensaje: `${sesion.nombre || 'El piloto'} salió a ruta con ${plural(codigos.length, 'pedido', 'pedidos')}: ${codigos.join(', ')}.`,
            })));
        }
        cargarMiRuta();
    });

    // ==================================================
    // MIS MARCAS DE HOY (solo el PILOTO)
    //   Las marcas del día salen de marcas_del_dia (Configuración -> Horarios).
    //   SE MARCA CON QR (js/qr.js): al llegar, el piloto escanea el QR de marcas de la
    //   tienda (cambia cada mes) y la base marca sola el horario abierto (marcar_por_qr,
    //   hora de Costa Rica) y avisa a la tienda para despachar. Antes, la tienda debe
    //   haberlo VALIDADO hoy con su "Mi QR del día" (nombre y foto).
    //   El piloto ve solo "HORA INICIO" (inicio_hasta) y "TERMINA" (fin); "inicia desde"
    //   (desde cuándo se puede marcar) solo lo ven G2 o superior.
    //   Se redibuja cada 30 s y se recarga al marcar (evento "acachete:marca").
    // ==================================================

    const avisoMarcas = crearAviso($('#iniMarcasAviso'), 5000);
    let marcasHoy = [];   // [{ numero, inicio_desde, inicio_hasta, fin }]
    let marcadas = {};    // numero -> { marcado_en, a_tiempo }
    let marcasSinTabla = false; // true si la base aún no tiene marcas_piloto (sql/01 bloque 13)
    let marcasCargadas = false; // para no dibujar "día de descanso" antes de saberlo
    const minutosDe = (hora) => { const [h, m] = hora.slice(0, 5).split(':').map(Number); return h * 60 + m; };
    const hhmmIni = (hora) => hora.slice(0, 5);

    async function cargarMarcas() {
        if (!esPiloto) return;
        const [mar, hechas, val] = await Promise.all([
            db.rpc('marcas_del_dia', { p_fecha: hoy }),
            db.from('marcas_piloto').select('numero, marcado_en, a_tiempo, justificacion').eq('piloto_id', sesion.id || 0).eq('fecha', hoy)
                // sin el bloque 15 de sql/01 no existe "justificacion": se lee sin ella
                .then((r) => (r.error && r.error.code === '42703'
                    ? db.from('marcas_piloto').select('numero, marcado_en, a_tiempo').eq('piloto_id', sesion.id || 0).eq('fecha', hoy)
                    : r)),
            db.from('pilotos_dia').select('validado_en').eq('piloto_id', sesion.id || 0).eq('fecha', hoy).maybeSingle(),
        ]);
        // ¿La tienda ya lo validó hoy con su QR del día? (sql/01 bloque 14)
        const linea = $('#iniValidacion');
        if (val.error) {
            linea.textContent = 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 14: QR).';
            linea.className = 'ini-validacion pendiente';
        } else if (val.data && val.data.validado_en) {
            linea.textContent = `✔ La tienda te validó hoy a las ${new Date(val.data.validado_en).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}. Ya puedes marcar.`;
            linea.className = 'ini-validacion hecha';
        } else {
            linea.textContent = 'Primero muestra "Mi QR del día" en la tienda para que te validen; después podrás marcar.';
            linea.className = 'ini-validacion pendiente';
        }
        if (mar.error) {
            console.error('Error al cargar las marcas:', mar.error);
            $('#iniMarcasResumen').textContent = 'No se pudieron cargar tus marcas.';
            return;
        }
        marcasHoy = mar.data || [];
        marcadas = {};
        marcasCargadas = true;
        marcasSinTabla = !!hechas.error;
        if (hechas.error) console.error('Error al cargar lo marcado (¿falta sql/01, bloque 13?):', hechas.error);
        else hechas.data.forEach((m) => { marcadas[m.numero] = m; });
        dibujarMarcas();
        pintarKpisPiloto();
    }

    // Estado de una marca según la hora: { clase, texto }
    function estadoMarca(m, ahora) {
        const hecha = marcadas[m.numero];
        if (hecha) {
            const hora = new Date(hecha.marcado_en).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
            return {
                clase: hecha.a_tiempo ? 'hecha' : 'tarde',
                texto: hecha.a_tiempo ? `Marcada a las ${hora}`
                    : `Marca tardía a las ${hora}${hecha.justificacion ? ` · Motivo: ${hecha.justificacion}` : ''}`,
            };
        }
        if (ahora < minutosDe(m.inicio_desde)) return { clase: 'espera', texto: 'Todavía no se habilita' };
        if (ahora <= minutosDe(m.inicio_hasta)) return { clase: 'abierta', texto: `Abierto: marca con el QR antes de las ${hhmmIni(m.inicio_hasta)} para quedar a tiempo` };
        if (ahora <= minutosDe(m.fin)) return { clase: 'atrasada', texto: `Marca tardía: aún puedes marcar hasta las ${hhmmIni(m.fin)} y escribir por qué` };
        return { clase: 'perdida', texto: 'No marcada' };
    }

    function dibujarMarcas() {
        if (!esPiloto || !marcasCargadas) return;
        const ol = $('#iniMarcasLista');
        ol.replaceChildren();
        const d = new Date();
        const ahora = d.getHours() * 60 + d.getMinutes();
        if (!marcasHoy.length) {
            $('#iniMarcasResumen').textContent = 'Hoy no tienes horarios (día de descanso).';
            return;
        }
        const hechas = marcasHoy.filter((m) => marcadas[m.numero]).length;
        const proxima = marcasHoy.find((m) => !marcadas[m.numero] && ahora < minutosDe(m.inicio_desde));
        $('#iniMarcasResumen').textContent = !marcasSinTabla
            ? `${hechas} de ${marcasHoy.length} marcadas` + (proxima ? ` · próximo horario: hora de inicio ${hhmmIni(proxima.inicio_hasta)}` : '')
            : 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 13: marcas del piloto).';
        marcasHoy.forEach((m) => {
            const e = estadoMarca(m, ahora);
            const li = document.createElement('li');
            li.className = `ini-marca ${e.clase}`;
            const numero = document.createElement('span');
            numero.className = 'ini-marca-numero';
            numero.textContent = m.numero;
            const textos = document.createElement('div');
            textos.className = 'ini-marca-textos';
            const titulo = document.createElement('strong');
            titulo.textContent = `Horario ${m.numero} · hora de inicio ${hhmmIni(m.inicio_hasta)}, termina ${hhmmIni(m.fin)}`;
            const detalle = document.createElement('small');
            const deEsta = pedidos.filter((p) => p.marca_numero === m.numero).length; // sus pedidos de hoy en ese horario
            detalle.textContent = [e.texto, deEsta ? plural(deEsta, 'pedido', 'pedidos') : null].filter(Boolean).join(' · ');
            textos.append(titulo, detalle);
            li.append(numero, textos);
            ol.appendChild(li);
        });
    }

    // "Escanear QR de la tienda": marca el horario abierto y avisa a la tienda (js/qr.js:
    // qrLeerMarca -> marcar_por_qr + qrAvisarLlegada). Al terminar, qr.js lanza "acachete:marca".
    $('#iniEscanearMarca').addEventListener('click', () => abrirLectorQr({
        titulo: 'Marcar llegada',
        ayuda: 'Escanea el QR de marcas que está en la tienda.',
        alLeer: qrLeerGeneral,
    }));

    // "Mi QR del día": la tienda lo escanea para validarlo (nombre y foto). Solo sirve hoy
    $('#iniMiQr').addEventListener('click', async () => {
        const { data, error } = await db.rpc('qr_piloto_dia', { p_piloto: sesion.id || 0 });
        if (error) {
            console.error('Error al obtener mi QR del día:', error);
            avisoMarcas.mostrar(error.code === 'PGRST202' || error.code === '42883'
                ? 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 14: QR).'
                : 'No se pudo obtener tu QR del día.', 'error');
            return;
        }
        mostrarQrEnVentana({
            titulo: 'Mi QR del día',
            subtitulo: new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' }),
            texto: data, nombre: sesion.nombre, foto: sesion.foto_url,
            nota: 'Muéstralo en la tienda al empezar el día: lo escanean y confirman su foto. Solo sirve hoy.',
            archivo: `mi-qr-${hoy}`,
        });
    });

    // ==================================================
    // ARRANQUE, ACTUALIZACIÓN Y LIMPIEZA
    // ==================================================

    // Lo de hoy (cuadros, mapa, listas). Se repite cada minuto.
    async function actualizar() {
        try {
            await cargarPedidosHoy();
            if (!activa) return;
            if (modo === 'admin' || modo === 'tienda') await pintarAdmin();
            else if (modo === 'empleado') await pintarEmpleado();
            else pintarKpisPiloto();
            if (!activa) return;
            dibujarMapaYPilotos();
            if (esPiloto) dibujarMarcas();
        } catch (error) {
            if (activa) {
                mostrarError(error, 'el inicio');
                $('#iniKpis').replaceChildren();
            }
        }
    }

    saludo();
    $('#iniKpis').replaceChildren(...Array.from({ length: 4 }, () => {
        const d = document.createElement('div');
        d.className = 'resumen-item ini-kpi ini-cargando';
        return d;
    }));

    // Accesos rápidos según el rol
    if (modo === 'admin') accesos([['Crear pedido', 'bi-plus-circle', '#pedidos?nuevo=1', true], ['Asignar pilotos', 'bi-person-check', '#rutas'], ['Reportes', 'bi-bar-chart-line', '#reportes']]);
    if (modo === 'tienda') accesos([['Crear pedido', 'bi-plus-circle', '#pedidos?nuevo=1', true], ['Ver pedidos', 'bi-list-ul', '#pedidos'], ['Clientes', 'bi-people', '#clientes']]);
    if (modo === 'empleado') accesos([['Crear pedido', 'bi-plus-circle', '#pedidos?nuevo=1', true], ['Ver pedidos', 'bi-list-ul', '#pedidos'], ['Buscar cliente', 'bi-search', '#clientes']]);
    if (modo === 'piloto') {
        accesos([['Mis pedidos', 'bi-list-ul', '#pedidos', true]]);
        $('#iniPiloto').hidden = false;
        $('#iniMapaTitulo span').textContent = 'Mis entregas en el mapa';
        $('#iniPilotosTitulo').hidden = true;
        $('#iniMapaPilotos').hidden = true;
    }

    (async () => {
        try {
            await cargarTiendas();
        } catch (error) {
            if (activa) mostrarError(error, 'las tiendas');
            return;
        }
        if (!activa) return;
        prepararFiltrosMapa();
        mostrarMapa();
        await actualizar();
        if (esPiloto) { cargarMiRuta(); cargarMarcas(); }
        if (modo === 'admin' || modo === 'tienda') pintarGrafica();
    })();

    // Cada minuto: lo de hoy y, para el piloto, su ruta. Cada 30 s se redibujan las
    // marcas: así cada una se habilita sola a su hora.
    const reloj = setInterval(() => { actualizar(); cargarMiRuta(); }, 60000);
    const relojMarcas = esPiloto ? setInterval(() => dibujarMarcas(), 30000) : null;
    const alMarcar = () => { cargarMarcas(); actualizar(); };
    window.addEventListener('acachete:marca', alMarcar);

    return () => {
        activa = false;
        clearInterval(reloj);
        if (relojMarcas) clearInterval(relojMarcas);
        window.removeEventListener('acachete:marca', alMarcar);
        aviso.limpiar();
        avisoRuta.limpiar();
        avisoMarcas.limpiar();
        if (grafica) grafica.destroy();
        // Al salir de Inicio se quita el mapa libre (se vuelve a crear al entrar)
        if (vigiaTamano) vigiaTamano.disconnect();
        if (mapaLibre) mapaLibre.remove();
    };
});
