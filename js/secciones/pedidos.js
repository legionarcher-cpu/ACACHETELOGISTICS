/* ==================================================
   SECCIÓN: PEDIDOS - LÓGICA
   ACACHETE LOGISTICS

   Diseño: PROPUESTA-ESTRUCTURADA-V2.md, sección 31.
   Tablas: sql/14_pedidos.sql, 15_codigos_pedido.sql, 16_articulos_catalogo.sql.

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
     #pedidos?id=15      -> DETALLE: datos, mercadería, cobro, entrega, línea de tiempo,
                            QR y acciones según el estado. (&qr=1 abre el QR al entrar)

   QUIÉN VE QUÉ (lo controla la página; la regla real llega en la Fase 7):
     - Administrador y Admin G1: todos los pedidos. Anulan pedidos.
     - Admin G2: pedidos de las tiendas de su región.
     - Admin G3 y Empleado: pedidos de su tienda.
     - Todos ellos registran pedidos y cambian su estado.
     - Piloto: solo SUS pedidos asignados, sin acciones (su trabajo es en la app).

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
// Código de país para WhatsApp cuando el teléfono tiene 8 dígitos (Guatemala = 502)
const PED_CODIGO_PAIS = '506';
const PED_MONEDA = '¢';

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

// Grupos del resumen (cuadros de arriba de la lista)
const PED_GRUPOS = [
    { id: 'pendientes',  texto: 'Pendientes',    color: 'resumen-gris',     estados: ['registrado', 'recibido_bodega', 'asignado', 'reprogramado'] },
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
    const tiendaPropia = tiendaActual();            // G3, Empleado y Piloto
    const puedeGestionar = !esPiloto;               // registrar y cambiar estados
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
    const fechaHora = (t) => new Date(t).toLocaleString('es-GT', {
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
    let tiendasActividades = []; // qué actividades ofrece cada tienda
    let pilotos = [];            // pilotos de esas tiendas
    let capacidades = [];        // pedidos por marca por región o tienda (sql/12)
    let config = { numero_pedido: 'automatico', pedidos_por_marca: 5 };

    async function cargarBase() {
        let qTiendas = db.from('tiendas').select('id, codigo, nombre, region').order('codigo');
        if (regionG2) qTiendas = qTiendas.eq('region', regionG2);
        else if (!esGeneral && !esPiloto) qTiendas = qTiendas.eq('id', tiendaPropia || 0);

        const [tie, act, ta, conf, cap] = await Promise.all([
            qTiendas,
            db.from('actividades').select('codigo, nombre, descripcion, icono, usa_bodega, activa, orden').order('orden'),
            db.from('tiendas_actividades').select('tienda_id, actividad'),
            db.from('configuracion').select('clave, valor').in('clave', ['numero_pedido', 'pedidos_por_marca']),
            db.from('capacidad_marcas').select('region, tienda_id, pedidos_por_marca'),
        ]);
        const error = tie.error || act.error || ta.error || conf.error || cap.error;
        if (error) return error;

        tiendas = tie.data;
        actividades = act.data;
        tiendasActividades = ta.data;
        capacidades = cap.data;
        conf.data.forEach((f) => { config[f.clave] = f.valor; });

        // Pilotos aprobados de esas tiendas (el Piloto no necesita la lista)
        if (!esPiloto && tiendas.length) {
            const pil = await db.from('usuarios').select('id, nombre, id_usuario, tienda_id')
                .eq('rol', 'piloto').eq('aprobado', true).in('tienda_id', tiendas.map((t) => t.id)).order('nombre');
            if (pil.error) return pil.error;
            pilotos = pil.data;
        }
        return null;
    }

    const tiendaPorId = (id) => tiendas.find((t) => t.id === id);
    const nombreTienda = (id) => { const t = tiendaPorId(id); return t ? `${t.codigo} · ${t.nombre}` : '—'; };
    const actividadPorCodigo = (c) => actividades.find((a) => a.codigo === c) || { codigo: c, nombre: c, icono: 'bi-box' };
    const nombrePiloto = (id) => (pilotos.find((p) => p.id === id) || {}).nombre;

    // Actividades que ofrece una tienda (si no tiene ninguna marcada: todas las activas)
    function actividadesDeTienda(tiendaId) {
        const activas = actividades.filter((a) => a.activa);
        const propias = tiendasActividades.filter((ta) => ta.tienda_id === tiendaId).map((ta) => ta.actividad);
        return propias.length ? activas.filter((a) => propias.includes(a.codigo)) : activas;
    }

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

    // Llena un <select> de marcas: "Marca 1 · 07:00–09:30 (2/5)"
    function llenarMarcas(select, marcas, actual = null) {
        select.replaceChildren(new Option('Sin marca (se asigna después)', ''));
        marcas.forEach((m) => {
            const texto = `Marca ${m.numero} · ${hhmm(m.inicio_desde)}–${hhmm(m.fin)} (${m.usados}/${m.maximo})${m.llena ? ' — llena' : ''}`;
            const opcion = new Option(texto, m.numero);
            // Una marca llena no se puede elegir (salvo que ya sea la del pedido)
            opcion.disabled = m.llena && m.numero !== actual;
            select.appendChild(opcion);
        });
        if (!marcas.length) select.appendChild(new Option('No hay marcas ese día', '', false, false)).disabled = true;
        select.value = actual == null ? '' : String(actual);
    }

    function llenarPilotos(select, tiendaId, actual = null) {
        select.replaceChildren(new Option('Sin piloto (se asigna después)', ''));
        pilotos.filter((p) => p.tienda_id === tiendaId)
            .forEach((p) => select.appendChild(new Option(`${p.nombre} (${p.id_usuario})`, p.id)));
        select.value = actual == null ? '' : String(actual);
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
    const filtroActividad = $('#pedFiltroActividad');
    const filtroEstado = $('#pedFiltroEstado');
    const verAnulados = $('#pedVerAnulados');
    const buscar = $('#pedBuscar');
    let pedidos = [];

    function prepararFiltros() {
        filtroFecha.value = fechaHoy();

        tiendas.forEach((t) => filtroTienda.appendChild(new Option(`${t.codigo} · ${t.nombre}`, t.id)));
        filtroTienda.hidden = tiendas.length <= 1 || esPiloto;

        actividades.forEach((a) => filtroActividad.appendChild(new Option(a.nombre, a.codigo)));

        // Estado: grupos del resumen y cada estado suelto
        PED_GRUPOS.forEach((g) => filtroEstado.appendChild(new Option(`${g.texto} (grupo)`, `g:${g.id}`)));
        Object.entries(PED_ESTADOS).forEach(([codigo, e]) => filtroEstado.appendChild(new Option(e.texto, `e:${codigo}`)));

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
    }

    async function cargarLista() {
        $('#pedContador').textContent = 'Cargando pedidos...';
        let q = db.from('pedidos').select(
            'id, codigo, actividad, tienda_id, cliente_nombre, cliente_telefono, direccion_entrega, fecha_entrega, ' +
            'marca_numero, piloto_id, estado, anulado, total_cobrar, peso_total_kg, lleva_alcohol, creado_en');

        // Alcance del rol
        if (esPiloto) q = q.eq('piloto_id', sesion.id || 0);
        else if (!esGeneral) q = q.in('tienda_id', tiendas.length ? tiendas.map((t) => t.id) : [0]);

        if (filtroFecha.value) q = q.eq('fecha_entrega', filtroFecha.value);
        if (filtroTienda.value) q = q.eq('tienda_id', Number(filtroTienda.value));
        if (filtroActividad.value) q = q.eq('actividad', filtroActividad.value);
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
        pedidos = data;
        dibujarLista();
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
            coincideBusqueda([p.codigo, p.cliente_nombre, p.cliente_telefono, p.direccion_entrega], texto));

        const cuando = filtroFecha.value ? `para el ${fechaCorta(filtroFecha.value)}` : 'en todas las fechas';
        $('#pedContador').textContent = visibles.length === pedidos.length
            ? `${plural(pedidos.length, 'pedido', 'pedidos')} ${cuando}`
            : `${visibles.length} de ${plural(pedidos.length, 'pedido', 'pedidos')} ${cuando}`;

        cuerpoLista.replaceChildren();
        if (!visibles.length) {
            cuerpoLista.appendChild(crearFilaVacia(pedidos.length
                ? 'Ningún pedido coincide con los filtros.'
                : (esPiloto ? 'No tienes pedidos asignados en esta fecha.' : 'No hay pedidos en esta fecha.'), 8));
            return;
        }

        visibles.forEach((p) => {
            const tr = document.createElement('tr');
            const act = actividadPorCodigo(p.actividad);

            // Pedido: código + actividad (+ tienda si ve varias)
            const tdPedido = document.createElement('td');
            const caja = document.createElement('div');
            caja.className = 'ped-codigo';
            const codigo = document.createElement('strong');
            codigo.textContent = p.codigo;
            const sub = document.createElement('small');
            sub.textContent = tiendas.length > 1 ? `${act.nombre} · ${nombreTienda(p.tienda_id)}` : act.nombre;
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

            // Entrega: dirección (recortada) + fecha si se ven todas
            const tdEntrega = document.createElement('td');
            const dir = document.createElement('span');
            dir.className = 'ped-corto';
            dir.title = p.direccion_entrega;
            dir.textContent = p.direccion_entrega;
            tdEntrega.appendChild(dir);
            if (!filtroFecha.value) {
                const f = document.createElement('small');
                f.className = 'ped-sub';
                f.textContent = fechaCorta(p.fecha_entrega);
                tdEntrega.appendChild(f);
            }
            tr.appendChild(tdEntrega);

            tr.appendChild(crearCelda(p.marca_numero ? `Marca ${p.marca_numero}` : null));
            tr.appendChild(crearCelda(esPiloto ? sesion.nombre : nombrePiloto(p.piloto_id)));

            const tdEstado = document.createElement('td');
            tdEstado.appendChild(etiquetaEstado(p));
            tr.appendChild(tdEstado);

            tr.appendChild(crearCelda(dinero(p.total_cobrar)));

            const botones = [crearBotonIcono('ver', p.id, 'bi-eye', `Ver pedido ${p.codigo}`)];
            if (puedeGestionar) botones.push(crearBotonIcono('revisar', p.id, 'bi-qr-code', `QR del pedido ${p.codigo}`));
            tr.appendChild(crearCeldaAcciones(...botones));
            cuerpoLista.appendChild(tr);
        });
    }

    cuerpoLista.addEventListener('click', (evento) => {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton) return;
        if (boton.dataset.accion === 'ver') location.hash = `pedidos?id=${boton.dataset.id}`;
        if (boton.dataset.accion === 'revisar') location.hash = `pedidos?id=${boton.dataset.id}&qr=1`;
    });

    [filtroFecha, filtroTienda, filtroActividad, verAnulados].forEach((el) => el.addEventListener('change', cargarLista));
    filtroEstado.addEventListener('change', dibujarLista);
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
    const cajaBultos = $('#pedBultos');
    const cajaCategorias = $('#pedCategorias');
    const cajaDetalleCat = $('#pedCategoriasDetalle');
    const inputMonto = $('#pedMontoCompra');
    const selDescuento = $('#pedDescuento');
    const formError = $('#pedFormError');

    // Datos del formulario
    let clientes = [];     // clientes de la tienda elegida
    let clienteId = null;  // cliente elegido de la lista (null = escrito a mano)
    let categorias = [];   // categorías de mercadería activas (entregas de tienda)
    let catalogo = [];     // artículos frecuentes (sql/16)
    let tamanos = [];      // S / M / L / XL
    let tarifas = [];      // todas las tarifas
    let descuentos = [];   // descuentos activos
    let marcasForm = [];   // marcas de la fecha elegida con su ocupación

    const tiendaElegida = () => Number(selTienda.value) || null;
    const actividadElegida = () => {
        const r = cajaActividades.querySelector('input:checked');
        return r ? actividadPorCodigo(r.value) : null;
    };
    const esEncomienda = () => (actividadElegida() || {}).codigo === 'encomiendas';

    async function abrirNuevo() {
        mostrarVista('pedNuevoVista');
        const [cat, catA, tam, tar, des] = await Promise.all([
            db.from('categorias_mercaderia').select('id, nombre, tipo, icono, orden').eq('activa', true).eq('actividad', 'tienda').order('orden'),
            db.from('articulos_catalogo').select('categoria_id, nombre, peso_kg').eq('activo', true).order('orden'),
            db.from('tamanos_bulto').select('codigo, nombre').order('orden'),
            db.from('tarifas').select('actividad, region, tienda_id, cargo_fijo, minimo, kg_incluidos, precio_kg, precio_km, envio_gratis_desde'),
            db.from('descuentos').select('id, nombre, tipo, valor, actividad, region').eq('activo', true).order('nombre'),
        ]);
        const error = cat.error || tam.error || tar.error || des.error;
        if (error) {
            console.error('Error al preparar el formulario:', error);
            aviso.mostrar('No se pudo preparar el formulario. Revisa la conexión.', 'error');
            return;
        }
        categorias = cat.data;
        catalogo = catA.error ? [] : catA.data; // si falta sql/16, sin catálogo
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

        // Número manual (sql/15)
        $('#pedCampoCodigo').hidden = config.numero_pedido !== 'manual';

        inputFecha.value = fechaHoy();
        inputFecha.min = fechaHoy();

        // Casillas de mercadería
        categorias.forEach((c) => {
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
        if (!categorias.length) cajaCategorias.textContent = 'No hay categorías activas (Configuración → Pedidos).';

        await alCambiarTienda();
    }

    // ---------- Tienda: actividades, clientes, pilotos y marcas ----------
    async function alCambiarTienda() {
        const tiendaId = tiendaElegida();
        const elegida = (actividadElegida() || {}).codigo;

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
            .select('id, nombre, apellidos, telefono, direccion, clientes_tiendas!inner(tienda_id)')
            .eq('clientes_tiendas.tienda_id', tiendaId).eq('aprobado', true).order('nombre');
        clientes = error ? [] : data;
        if (error) console.error('Error al cargar clientes:', error);
        const listaClientes = $('#pedClientesLista');
        listaClientes.replaceChildren();
        clientes.forEach((c) => listaClientes.appendChild(new Option(textoCliente(c))));

        alCambiarActividad();
        await actualizarMarcas();
    }

    const textoCliente = (c) => `${c.nombre} ${c.apellidos} · ${c.telefono}`;

    async function actualizarMarcas() {
        const actual = selMarca.value ? Number(selMarca.value) : null;
        marcasForm = inputFecha.value ? await marcasConOcupacion(inputFecha.value, tiendaElegida()) : [];
        llenarMarcas(selMarca, marcasForm, actual && marcasForm.some((m) => m.numero === actual && !m.llena) ? actual : null);
    }

    // ---------- Actividad: muestra lo que corresponde ----------
    function alCambiarActividad() {
        const encomienda = esEncomienda();
        $('#pedBultosCaja').hidden = !encomienda;
        $('#pedMercaderiaCaja').hidden = encomienda;
        $('#pedCampoRecoleccion').hidden = !encomienda;
        $('#pedCobrarCompraCaja').hidden = encomienda;
        if (encomienda && !cajaBultos.children.length) agregarBulto();
        llenarDescuentos();
        recalcular();
    }

    // ---------- Cliente de la lista ----------
    $('#pedBuscarCliente').addEventListener('input', (evento) => {
        const c = clientes.find((x) => textoCliente(x) === evento.target.value);
        if (!c) return;
        clienteId = c.id;
        $('#pedClienteNombre').value = `${c.nombre} ${c.apellidos}`;
        $('#pedClienteTelefono').value = c.telefono;
        if (c.direccion && !$('#pedDireccion').value) $('#pedDireccion').value = c.direccion;
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
    inputFecha.addEventListener('change', actualizarMarcas);

    // ---------- Bultos (encomiendas) ----------
    function agregarBulto(valores = { descripcion: 'Caja', cantidad: 1 }) {
        const fila = document.createElement('div');
        fila.className = 'ped-fila ped-fila-bulto';

        const desc = document.createElement('input');
        desc.className = 'campo-input';
        desc.dataset.b = 'descripcion';
        desc.maxLength = 60;
        desc.value = valores.descripcion || '';
        desc.setAttribute('aria-label', 'Descripción del bulto');

        const cant = document.createElement('input');
        cant.className = 'campo-input';
        cant.type = 'number';
        cant.min = 1;
        cant.step = 1;
        cant.dataset.b = 'cantidad';
        cant.value = valores.cantidad || 1;
        cant.setAttribute('aria-label', 'Cantidad');

        const tam = document.createElement('select');
        tam.className = 'campo-input';
        tam.dataset.b = 'tamano';
        tam.appendChild(new Option('—', ''));
        tamanos.forEach((t) => tam.appendChild(new Option(`${t.codigo} · ${t.nombre}`, t.codigo)));
        tam.setAttribute('aria-label', 'Tamaño de referencia');

        const peso = document.createElement('input');
        peso.className = 'campo-input';
        peso.type = 'number';
        peso.min = 0;
        peso.step = 'any';
        peso.dataset.b = 'peso';
        peso.placeholder = 'kg';
        peso.setAttribute('aria-label', 'Peso de cada bulto en kg');

        fila.append(desc, cant, tam, peso, botonQuitar());
        cajaBultos.appendChild(fila);
        recalcular();
    }

    function botonQuitar() {
        const quitar = crearBotonIcono('eliminar', '', 'bi-x-lg', 'Quitar fila');
        quitar.dataset.quitar = '1';
        return quitar;
    }

    $('#pedAgregarBulto').addEventListener('click', () => agregarBulto());

    // Quitar una fila (bulto o artículo)
    form.addEventListener('click', (evento) => {
        const quitar = evento.target.closest('button[data-quitar]');
        if (quitar) {
            quitar.closest('.ped-fila').remove();
            recalcular();
        }
        const agregar = evento.target.closest('button[data-agregar-articulo]');
        if (agregar) agregarArticulo(Number(agregar.dataset.agregarArticulo));
    });

    const leerBultos = () => [...cajaBultos.children].map((fila) => ({
        descripcion: fila.querySelector('[data-b="descripcion"]').value.trim(),
        cantidad: Number(fila.querySelector('[data-b="cantidad"]').value) || 0,
        tamano: fila.querySelector('[data-b="tamano"]').value || null,
        peso: numero(fila.querySelector('[data-b="peso"]')),
    }));

    // ---------- Casillas de mercadería (entregas de tienda) ----------
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
            const alcohol = document.createElement('label');
            alcohol.className = 'ped-si-no';
            const casilla = document.createElement('input');
            casilla.type = 'checkbox';
            casilla.dataset.c = 'alcohol';
            alcohol.append(casilla, ' Lleva alcohol');
            conteo.appendChild(alcohol);
            panel.appendChild(conteo);
        } else {
            // Línea blanca, electrónica...: artículos con peso (del catálogo)
            const cabecera = document.createElement('div');
            cabecera.className = 'ped-lista-cabecera';
            const texto = document.createElement('span');
            texto.textContent = 'Artículos (elige de la lista o escribe uno nuevo)';
            const agregar = document.createElement('button');
            agregar.type = 'button';
            agregar.className = 'boton boton-secundario boton-chico';
            agregar.dataset.agregarArticulo = categoria.id;
            agregar.innerHTML = '<i class="bi bi-plus-lg"></i> <span>Agregar artículo</span>';
            cabecera.append(texto, agregar);

            const encabezado = document.createElement('div');
            encabezado.className = 'ped-fila ped-fila-articulo ped-fila-encabezado';
            encabezado.setAttribute('aria-hidden', 'true');
            ['Artículo', 'Cant.', 'Peso c/u (kg)', ''].forEach((t) => {
                const s = document.createElement('span');
                s.textContent = t;
                encabezado.appendChild(s);
            });

            // Lista de sugerencias con los artículos de esta categoría
            const lista = document.createElement('datalist');
            lista.id = `pedCatalogo_${categoria.id}`;
            catalogo.filter((a) => a.categoria_id === categoria.id)
                .forEach((a) => lista.appendChild(new Option(a.nombre)));

            const filas = document.createElement('div');
            filas.className = 'ped-filas';
            filas.dataset.filas = '1';
            panel.append(cabecera, encabezado, filas, lista);
        }
        cajaDetalleCat.appendChild(panel);
        if (categoria.tipo !== 'conteo') agregarArticulo(categoria.id);
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

    // Lee lo marcado: [{ categoria, tipo, conteo | articulos }]
    function leerMercaderia() {
        return [...cajaDetalleCat.children].map((panel) => {
            const categoria = categorias.find((c) => c.id === Number(panel.dataset.categoria));
            if (panel.dataset.tipo === 'conteo') {
                const v = (c) => panel.querySelector(`[data-c="${c}"]`);
                return {
                    categoria, tipo: 'conteo',
                    conteo: {
                        cajas: numero(v('cajas')), bolsas: numero(v('bolsas')), hieleras: numero(v('hieleras')),
                        peso: numero(v('peso')), alcohol: v('alcohol').checked,
                    },
                };
            }
            return {
                categoria, tipo: 'articulos',
                articulos: [...panel.querySelectorAll('.ped-fila-articulo:not(.ped-fila-encabezado)')].map((fila) => ({
                    nombre: fila.querySelector('[data-a="nombre"]').value.trim(),
                    cantidad: Number(fila.querySelector('[data-a="cantidad"]').value) || 0,
                    peso: numero(fila.querySelector('[data-a="peso"]')),
                })),
            };
        });
    }

    // ---------- Peso, tarifa, descuento y total ----------

    function pesoTotal() {
        if (esEncomienda()) return redondear(leerBultos().reduce((s, b) => s + b.cantidad * b.peso, 0));
        return redondear(leerMercaderia().reduce((s, m) => s + (m.tipo === 'conteo'
            ? m.conteo.peso
            : m.articulos.reduce((x, a) => x + a.cantidad * a.peso, 0)), 0));
    }

    const llevaAlcohol = () => !esEncomienda() && leerMercaderia().some((m) => m.tipo === 'conteo' && m.conteo.alcohol);

    // Tarifa que aplica: tienda > región > general
    function tarifaAplicable(actividad, tiendaId) {
        const tienda = tiendaPorId(tiendaId) || {};
        const deAct = tarifas.filter((t) => t.actividad === actividad);
        const deTienda = deAct.find((t) => t.tienda_id === tiendaId);
        if (deTienda) return { ...deTienda, alcance: `Tienda ${tienda.codigo}` };
        const deRegion = deAct.find((t) => t.region && t.region === tienda.region);
        if (deRegion) return { ...deRegion, alcance: `Región ${deRegion.region}` };
        const general = deAct.find((t) => !t.region && !t.tienda_id);
        return general ? { ...general, alcance: 'General' } : null;
    }

    // Cálculo del envío (sección 31.5):
    //   fijo + mínimo + max(0, peso - kg incluidos) × precio kg ; gratis si la compra llega al monto
    function calcularEnvio(t, peso, montoCompra) {
        const kgAdicional = redondear(Math.max(0, peso - Number(t.kg_incluidos || 0)));
        const montoKg = redondear(kgAdicional * Number(t.precio_kg || 0));
        const bruto = redondear(Number(t.cargo_fijo || 0) + Number(t.minimo || 0) + montoKg);
        const gratis = t.envio_gratis_desde != null && montoCompra > 0 && montoCompra >= Number(t.envio_gratis_desde);
        return { kgAdicional, montoKg, bruto, gratis, envio: gratis ? 0 : bruto };
    }

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
        const monto = esEncomienda() ? 0 : numero(inputMonto);
        const tarifa = act ? tarifaAplicable(act.codigo, tiendaId) : null;
        const calc = tarifa ? calcularEnvio(tarifa, peso, monto) : { kgAdicional: 0, montoKg: 0, bruto: 0, gratis: false, envio: 0 };

        const desc = descuentos.find((d) => String(d.id) === selDescuento.value) || null;
        let montoDescuento = 0;
        if (desc && calc.envio > 0) {
            montoDescuento = desc.tipo === 'porcentaje'
                ? redondear(calc.envio * Number(desc.valor) / 100)
                : Math.min(Number(desc.valor), calc.envio);
        }
        const costoEnvio = redondear(calc.envio - montoDescuento);
        const cobrarEnvio = $('#pedCobrarEnvio').checked;
        const cobrarCompra = !esEncomienda() && $('#pedCobrarCompra').checked;
        const total = redondear((cobrarEnvio ? costoEnvio : 0) + (cobrarCompra ? monto : 0));

        return { act, tarifa, peso, monto, calc, desc, montoDescuento, costoEnvio, cobrarEnvio, cobrarCompra, total };
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
            if (Number(t.minimo)) filaDesglose(tbody, 'Mínimo', dinero(t.minimo), `Cubre hasta ${kilos(t.kg_incluidos)}`);
            if (c.calc.kgAdicional > 0 && Number(t.precio_kg)) {
                filaDesglose(tbody, `Peso adicional: ${kilos(c.calc.kgAdicional)} × ${dinero(t.precio_kg)}`, dinero(c.calc.montoKg),
                    `Peso total ${kilos(c.peso)} − ${kilos(t.kg_incluidos)} incluidos`);
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

        const marca = marcasForm.find((m) => String(m.numero) === selMarca.value);
        if (marca && marca.llena) return fallo(`La marca ${marca.numero} ya está llena. Elige otra.`, selMarca);

        if (esEncomienda()) {
            const bultos = leerBultos();
            if (!bultos.length) return fallo('Agrega al menos un bulto.');
            if (bultos.some((b) => b.cantidad < 1 || !Number.isInteger(b.cantidad))) return fallo('La cantidad de cada bulto debe ser un número entero de 1 o más.');
            if (bultos.some((b) => b.peso <= 0)) return fallo('Escribe el peso de cada bulto.');
        } else {
            const merc = leerMercaderia();
            if (!merc.length) return fallo('Marca al menos un tipo de mercadería.');
            for (const m of merc) {
                if (m.tipo === 'conteo' && m.conteo.cajas + m.conteo.bolsas + m.conteo.hieleras <= 0) {
                    return fallo(`${m.categoria.nombre}: escribe cuántas cajas, bolsas o hieleras lleva.`);
                }
                if (m.tipo === 'articulos') {
                    if (!m.articulos.length) return fallo(`${m.categoria.nombre}: agrega al menos un artículo.`);
                    if (m.articulos.some((a) => !a.nombre)) return fallo(`${m.categoria.nombre}: escribe el nombre de cada artículo.`);
                    if (m.articulos.some((a) => a.cantidad < 1)) return fallo(`${m.categoria.nombre}: la cantidad debe ser 1 o más.`);
                }
            }
        }

        const efectivo = form.querySelector('input[name="pedPago"]:checked').value === 'efectivo';
        const pagaCon = numero($('#pedPagaCon'));
        if (efectivo && pagaCon > 0 && pagaCon < c.total) return fallo('"Paga con" es menor que el total a cobrar.', $('#pedPagaCon'));
        return true;
    }

    // Filas de pedido_articulos
    function armarArticulos(pedidoId) {
        if (esEncomienda()) {
            return leerBultos().map((b) => ({
                pedido_id: pedidoId, categoria: 'Encomienda', descripcion: b.descripcion || 'Bulto',
                cantidad: b.cantidad, tamano: b.tamano, peso_kg: b.peso,
            }));
        }
        const filas = [];
        leerMercaderia().forEach((m) => {
            if (m.tipo === 'conteo') {
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
        const pilotoId = selPiloto.value ? Number(selPiloto.value) : null;
        const pagaCon = efectivo ? numero($('#pedPagaCon')) : 0;

        // Estado inicial: con piloto -> Asignado; encomienda en bodega -> En bodega; si no, Registrado
        const estado = pilotoId ? 'asignado' : (c.act.usa_bodega ? 'recibido_bodega' : 'registrado');

        // Detalle propio de la actividad (JSON)
        const detalle = { cobrar_envio: c.cobrarEnvio };
        if (!esEncomienda()) {
            const merc = leerMercaderia();
            detalle.categorias = merc.map((m) => m.categoria.nombre);
            const conteo = merc.find((m) => m.tipo === 'conteo');
            if (conteo) detalle.abarrotes = conteo.conteo;
        }

        const pedido = {
            actividad: c.act.codigo,
            tienda_id: tiendaId,
            cliente_id: clienteId,
            cliente_nombre: $('#pedClienteNombre').value.trim(),
            cliente_telefono: $('#pedClienteTelefono').value.trim(),
            direccion_recoleccion: esEncomienda() ? ($('#pedRecoleccion').value.trim() || null) : null,
            direccion_entrega: $('#pedDireccion').value.trim(),
            recibe_tipo: autorizado ? 'autorizado' : 'cliente',
            recibe_nombre: autorizado ? $('#pedRecibeNombre').value.trim() : null,
            recibe_telefono: autorizado ? ($('#pedRecibeTelefono').value.trim() || null) : null,
            fecha_entrega: inputFecha.value,
            marca_numero: selMarca.value ? Number(selMarca.value) : null,
            piloto_id: pilotoId,
            peso_total_kg: c.peso,
            lleva_alcohol: llevaAlcohol(),
            detalle,
            monto_compra: esEncomienda() ? null : (c.monto || null),
            cobrar_compra: c.cobrarCompra,
            costo_envio: c.costoEnvio,
            descuento_id: c.desc ? c.desc.id : null,
            costo_desglose: {
                tarifa: c.tarifa ? {
                    alcance: c.tarifa.alcance, cargo_fijo: Number(c.tarifa.cargo_fijo), minimo: Number(c.tarifa.minimo),
                    kg_incluidos: Number(c.tarifa.kg_incluidos), precio_kg: Number(c.tarifa.precio_kg),
                    envio_gratis_desde: c.tarifa.envio_gratis_desde == null ? null : Number(c.tarifa.envio_gratis_desde),
                } : null,
                peso_total: c.peso, kg_adicional: c.calc.kgAdicional, monto_kg: c.calc.montoKg,
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
                detalle: { marca: pedido.marca_numero, piloto: pilotoId ? nombrePiloto(pilotoId) : null },
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

    async function abrirDetalle(id, abrirQr) {
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
            db.from('pedido_historial').select('evento, estado_anterior, estado_nuevo, detalle, usuario_nombre, creado_en').eq('pedido_id', id).order('creado_en'),
            db.from('pedido_entregas').select('*').eq('pedido_id', id).maybeSingle(),
            db.from('pedido_evidencias').select('tipo, url, creado_en, eliminada_en').eq('pedido_id', id).order('creado_en'),
            db.rpc('marcas_del_dia', { p_fecha: data.fecha_entrega }),
        ]);
        articulosDet = art.data || [];
        marcasDet = marcas.data || [];

        dibujarDetalle();
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
        if (!p.marca_numero) return 'Sin marca';
        const m = marcasDet.find((x) => x.numero === p.marca_numero);
        return m ? `Marca ${m.numero} · ${hhmm(m.inicio_desde)} a ${hhmm(m.inicio_hasta)}, termina ${hhmm(m.fin)}` : `Marca ${p.marca_numero}`;
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
        dato(dl, 'Recibe', p.recibe_tipo === 'autorizado'
            ? `${p.recibe_nombre} (autorizado)${p.recibe_telefono ? ` · ${p.recibe_telefono}` : ''}`
            : 'El mismo cliente');
        dato(dl, 'Fecha', fechaCorta(p.fecha_entrega));
        dato(dl, 'Marca', textoMarca(p));
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
            if (t.minimo) filaDesglose(tbody, 'Mínimo', dinero(t.minimo), `Cubre hasta ${kilos(t.kg_incluidos)}`);
            if (d.kg_adicional > 0 && t.precio_kg) filaDesglose(tbody, `Peso adicional: ${kilos(d.kg_adicional)} × ${dinero(t.precio_kg)}`, dinero(d.monto_kg));
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
            if (e.estado_nuevo && e.evento !== 'asignado') texto += ` → ${(PED_ESTADOS[e.estado_nuevo] || {}).texto || e.estado_nuevo}`;
            titulo.textContent = texto;
            li.append(t, titulo);

            // Detalles: motivo, marca, piloto, quién
            const d = e.detalle || {};
            const partes = [];
            if (d.fecha) partes.push(`Fecha ${fechaCorta(d.fecha)}`);
            if (d.marca) partes.push(`Marca ${d.marca}`);
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

    // ---------- Acciones según el estado ----------
    // estados: en cuáles aparece | nuevo: estado al que pasa | motivo: 'requerido' / 'opcional'
    const PED_ACCIONES = [
        { id: 'qr', texto: 'QR', icono: 'bi-qr-code', clase: 'boton-secundario', siempre: true },
        { id: 'bodega', texto: 'Recibido en bodega', icono: 'bi-building-check', estados: ['registrado'],
          si: (p) => actividadPorCodigo(p.actividad).usa_bodega, nuevo: 'recibido_bodega' },
        { id: 'asignar', texto: 'Asignar', icono: 'bi-person-check', estados: PED_ANTES_DE_SALIR },
        { id: 'ruta', texto: 'Salió a entregar', icono: 'bi-truck', estados: ['asignado', 'reprogramado'],
          si: (p) => !!p.piloto_id, nuevo: 'en_ruta' },
        { id: 'entregado', texto: 'Entregado', icono: 'bi-check2-circle', estados: ['en_ruta'], nuevo: 'entregado', motivo: 'opcional',
          ayuda: 'Normalmente lo marca el piloto desde su app con el QR y la foto. Úsalo solo si hace falta.' },
        { id: 'no_entregado', texto: 'No entregado', icono: 'bi-x-circle', estados: ['en_ruta'], nuevo: 'no_entregado', motivo: 'requerido' },
        { id: 'reprogramar', texto: 'Reprogramar', icono: 'bi-calendar-event', estados: ['no_entregado'] },
        { id: 'devuelto', texto: 'Devuelto', icono: 'bi-arrow-return-left', estados: ['no_entregado'], nuevo: 'devuelto', motivo: 'requerido' },
        { id: 'cancelar', texto: 'Cancelar pedido', icono: 'bi-slash-circle', clase: 'boton-peligro', estados: PED_ANTES_DE_SALIR,
          nuevo: 'cancelado', motivo: 'requerido' },
        { id: 'anular', texto: 'Anular', icono: 'bi-trash3', clase: 'boton-peligro', solo: () => puedeAnular,
          estados: ['registrado', 'recibido_bodega', 'asignado', 'reprogramado', 'no_entregado', 'devuelto', 'cancelado'], motivo: 'requerido',
          ayuda: 'Para pedidos registrados por error. El pedido no se borra: queda oculto de las listas y en la auditoría.' },
    ];

    function dibujarAcciones() {
        const caja = $('#pedDetAcciones');
        caja.replaceChildren();
        if (!puedeGestionar) return;
        const p = pedido;
        PED_ACCIONES.forEach((a) => {
            const disponible = a.siempre || (!p.anulado && a.estados.includes(p.estado) && (!a.si || a.si(p)) && (!a.solo || a.solo()));
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
        if (accion.id === 'qr') abrirVentanaQr();
        else if (accion.id === 'asignar') abrirAsignar(false);
        else if (accion.id === 'reprogramar') abrirAsignar(true);
        else abrirAccion(accion);
    });

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

        if (accion.id === 'anular') {
            // Anular: no cambia el estado; se marca y queda en la auditoría
            const upd = await db.from('pedidos')
                .update({ anulado: true, motivo_cancelacion: motivo, actualizado_en: new Date().toISOString() })
                .eq('id', pedido.id).select('id');
            resultado = upd.error || (await registrarEvento(pedido.id, 'anulado', { antes: pedido.estado, detalle: { motivo } })).error;
        } else {
            const cambios = accion.nuevo === 'cancelado' ? { motivo_cancelacion: motivo } : {};
            resultado = await cambiarEstado(accion.nuevo, cambios, motivo ? (accion.motivo === 'requerido' ? { motivo } : { nota: motivo }) : {});
            // Entregado desde el panel: se guarda un cierre mínimo
            if (!resultado && accion.id === 'entregado') {
                const ent = await db.from('pedido_entregas').upsert({
                    pedido_id: pedido.id, piloto_id: pedido.piloto_id,
                    recibio_nombre: pedido.recibe_tipo === 'autorizado' ? pedido.recibe_nombre : pedido.cliente_nombre,
                    confirma_mayor_edad: pedido.lleva_alcohol ? true : null,
                    comentario: motivo || 'Marcado como entregado desde el panel',
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
            aviso.mostrar(accion.id === 'anular' ? `Pedido ${pedido.codigo} anulado.` : `Pedido ${pedido.codigo}: ${(PED_ESTADOS[accion.nuevo] || {}).texto}.`);
        }
        recargarDetalle();
    });

    // ---------- Asignar / Reprogramar ----------
    const dlgAsignar = $('#pedAsignarDialogo');
    let reprogramando = false;
    let marcasAsig = [];

    async function abrirAsignar(reprogramar) {
        reprogramando = reprogramar;
        $('#pedAsignarTitulo').textContent = reprogramar ? 'Reprogramar entrega' : 'Asignar marca y piloto';
        $('#pedAsigMotivoCaja').hidden = !reprogramar;
        $('#pedAsigMotivo').value = '';
        $('#pedAsignarError').textContent = '';
        const fecha = $('#pedAsigFecha');
        fecha.min = fechaHoy();
        fecha.value = reprogramar || pedido.fecha_entrega < fechaHoy() ? fechaHoy() : pedido.fecha_entrega;
        llenarPilotos($('#pedAsigPiloto'), pedido.tienda_id, pedido.piloto_id);
        await actualizarMarcasAsig(reprogramar ? null : pedido.marca_numero);
        dlgAsignar.showModal();
    }

    async function actualizarMarcasAsig(actual) {
        const fecha = $('#pedAsigFecha').value;
        marcasAsig = fecha ? await marcasConOcupacion(fecha, pedido.tienda_id, pedido.id) : [];
        const mismaFecha = fecha === pedido.fecha_entrega;
        llenarMarcas($('#pedAsigMarca'), marcasAsig, mismaFecha ? actual : null);
    }

    $('#pedAsigFecha').addEventListener('change', () => actualizarMarcasAsig(pedido.marca_numero));
    $('#pedAsignarCancelar').addEventListener('click', () => dlgAsignar.close());

    $('#pedAsignarForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const error = $('#pedAsignarError');
        error.textContent = '';
        const fecha = $('#pedAsigFecha').value;
        const marca = $('#pedAsigMarca').value ? Number($('#pedAsigMarca').value) : null;
        const piloto = $('#pedAsigPiloto').value ? Number($('#pedAsigPiloto').value) : null;
        const motivo = $('#pedAsigMotivo').value.trim();
        if (!fecha) { error.textContent = 'Elige la fecha.'; return; }
        const m = marcasAsig.find((x) => x.numero === marca);
        if (m && m.llena) { error.textContent = `La marca ${marca} ya está llena.`; return; }
        if (reprogramando && !motivo) { error.textContent = 'Escribe el motivo de la reprogramación.'; return; }

        // Nuevo estado según haya piloto
        const act = actividadPorCodigo(pedido.actividad);
        let nuevo = pedido.estado;
        if (reprogramando) nuevo = 'reprogramado';
        else if (piloto && ['registrado', 'recibido_bodega'].includes(pedido.estado)) nuevo = 'asignado';
        else if (!piloto && pedido.estado === 'asignado') nuevo = act.usa_bodega ? 'recibido_bodega' : 'registrado';

        const cambios = { fecha_entrega: fecha, marca_numero: marca, piloto_id: piloto, actualizado_en: new Date().toISOString() };
        const antes = pedido.estado;
        const upd = await db.from('pedidos').update({ ...cambios, estado: nuevo }).eq('id', pedido.id).eq('estado', antes).select('id');
        let fallo = upd.error || (!upd.data.length ? { mensajePropio: 'Otra persona cambió este pedido. Se recargó con los datos actuales.' } : null);
        if (!fallo) {
            const his = await registrarEvento(pedido.id, reprogramando ? 'reprogramado' : 'asignado', {
                antes, despues: nuevo,
                detalle: { fecha, marca, piloto: piloto ? nombrePiloto(piloto) : 'Sin piloto', motivo: motivo || undefined },
            });
            fallo = his.error || null;
        }
        dlgAsignar.close();
        if (fallo) {
            console.error('Error al asignar:', fallo);
            aviso.mostrar(fallo.mensajePropio || 'No se pudo guardar la asignación.', 'error');
        } else {
            aviso.mostrar(reprogramando ? 'Entrega reprogramada.' : 'Asignación guardada.');
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
            abrirDetalle(Number(params.get('id')), params.get('qr') === '1');
        } else {
            mostrarVista('pedLista');
            prepararFiltros();
            cargarLista();
        }
    })();

    return () => {
        aviso.limpiar();
        [dlgQr, dlgAsignar, dlgAccion].forEach((d) => { if (d.open) d.close(); });
    };
});
