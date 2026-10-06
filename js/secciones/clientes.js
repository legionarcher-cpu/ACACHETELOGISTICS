/* ==================================================
   SECCIÓN: CLIENTES - LÓGICA
   ACACHETE LOGISTICS

   Base de datos de clientes compartida: un cliente puede estar
   asignado a VARIAS tiendas (tabla "clientes_tiendas").
   Tablas: "clientes" y "clientes_tiendas" (sql/00, sección 4).

   Se abre con la pestaña "Clientes" de Tiendas (o el botón de cada tienda).
   Parámetros del # (js/pagina_inicial.js):
     #clientes?tienda=3          -> filtra por esa tienda (y la marca al crear)
     #clientes?nuevo=1           -> abre el formulario "Nuevo cliente"
     #clientes?tienda=3&nuevo=1  -> "Nuevo cliente" ya marcado en esa tienda
                                    (botón de persona con + en Tiendas)
   También se agregan solos desde Nuevo pedido (js/secciones/pedidos.js): si el
   cliente no se eligió del buscador, al registrar el pedido queda en Clientes con
   su dirección y su punto en el mapa (o, si su teléfono ya existe, se usa ese).

   QUIÉN VE QUÉ (alcance; todo dentro de la empresa activa, js/supabase.js):
     Administrador / Admin G1 -> todos los clientes
     Admin G2                 -> clientes de tiendas de SU región
     Admin G3                 -> clientes de SU tienda
     Empleado                 -> clientes de SU tienda
     Piloto                   -> sin acceso (SECCIONES_POR_ROL en js/sesion.js)

   FILTROS: región -> tienda -> ruta de entrega (+ estado y buscador). Quien ve
   varias regiones elige primero la región (cuadros con el número de clientes).
   Un cliente puede ser de varias tiendas (clientes_tiendas) y en cada una tiene
   su ruta de entrega (clientes_tiendas.ruta_id, sql/01 bloque 16).

   QUIÉN HACE QUÉ:
     Administrador / Admin G1 -> crear, modificar, eliminar, aprobar
     Admin G2                 -> lo mismo, solo en su región
     Admin G3                 -> lo mismo, solo en su tienda (aprueba a sus Empleados)
     Empleado                 -> crear y modificar, pero queda PENDIENTE
                                 DE APROBACIÓN; no elimina
       - Cliente nuevo: se guarda con aprobado = false y su tienda.
       - Modificación: se guarda en "cambios_pendientes" y los datos
         reales NO cambian hasta que se aprueba.
     Aprobar / rechazar: botón naranja "Revisar" (solo quien administra).
       - Rechazar un cliente nuevo lo elimina.
       - Rechazar cambios los descarta.
     Solicitud de usuario desde el login (Transporte, sql/01 bloque 20): el cliente
       queda "Nuevo · pendiente" (o "Acceso pendiente" si su teléfono ya existía) con
       su usuario sin aprobar. "Revisar" -> aprobar activa cliente y usuario;
       rechazar borra el cliente nuevo (o solo el usuario, si el cliente ya existía).
     Notificaciones (js/notificaciones.js): lo que propone un Empleado avisa
     SOLO al Admin G3 de su tienda (o al G2 de la región si la tienda no
     tiene G3); al aprobar/rechazar se avisa al Empleado.

   UBICACIÓN: texto, enlace de mapas o coordenadas "9.93, -84.08" (las guarda
   Nuevo pedido con el punto B del mapa). En la tabla, "Ver en mapa".

   PENDIENTE (Fase 2 - Pedidos): calificación 1 a 5 por pedido y
   categoría según el promedio: A ≥ 4.5, B ≥ 3.5, C ≥ 2.5, D < 2.5.
   Por ahora todos aparecen como "Nuevo". Qué permite o bloquea cada
   categoría se definirá al construir Pedidos.

   ⚠ Modo rápido: estas reglas las aplica la página (Fase 7: base de datos).

   HTML: secciones/clientes.html
   Estilos: css/secciones/clientes.css (propios) + css/componentes.css (comunes)
   Funciones comunes: js/componentes.js
   ================================================== */

// Columnas que se traen. "clientes_tiendas(tienda_id)" = tiendas del cliente;
// "solicitante:usuarios!solicitado_por(nombre)" = quién pidió la aprobación.
// "apellidos" la calcula la base (apellido1 + apellido2): solo se lee.
// clientes_tiendas.ruta_id = ruta de entrega del cliente en esa tienda (sql/01 bloque 16).
const CLI_COLUMNAS = 'id, nombre, apellido1, apellido2, apellidos, telefono, correo, direccion, ubicacion, aprobado, ' +
    'cambios_pendientes, solicitado_por, solicitado_en, ' +
    'clientes_tiendas(tienda_id, ruta_id), solicitante:usuarios!solicitado_por(nombre)';
const CLI_COLUMNAS_SIN_RUTA = CLI_COLUMNAS.replace('clientes_tiendas(tienda_id, ruta_id)', 'clientes_tiendas(tienda_id)');

// Datos del cliente que se pueden modificar (y su nombre para mostrar)
const CLI_CAMPOS = {
    nombre: 'Nombre',
    apellido1: 'Primer apellido',
    apellido2: 'Segundo apellido',
    telefono: 'Teléfono',
    correo: 'Correo',
    direccion: 'Dirección',
    ubicacion: 'Ubicación',
};

// Número de columnas de la tabla (para las filas que ocupan todo el ancho)
const CLI_COLUMNAS_TABLA = 9;

// "Nombre Apellido1 Apellido2" de un cliente o de los datos del formulario
const cliNombreCompleto = (c) => [c.nombre, c.apellido1, c.apellido2].filter(Boolean).join(' ');

registrarSeccion('clientes', (zona) => {

    // ---------- Elementos de la página ----------
    const $ = (selector) => zona.querySelector(selector);

    const contador     = $('#cliContador');
    const buscador     = $('#cliBuscar');
    const filtroRegion = $('#cliFiltroRegion');
    const filtroTienda = $('#cliFiltroTienda');
    const filtroRuta   = $('#cliFiltroRuta');
    const filtroEstado = $('#cliFiltroEstado');
    const cuerpo       = $('#cliCuerpo');
    const botonNuevo   = $('#cliNuevo');

    const dialogo      = $('#cliDialogo');
    const form         = $('#cliForm');
    const tituloForm   = $('#cliDialogoTitulo');
    const errorForm    = $('#cliFormError');
    const botonGuardar = $('#cliGuardar');
    const campoTiendas = $('#cliCampoTiendas');
    const cajaTiendas  = $('#cliTiendas');
    const campos = {
        nombre:    $('#cliNombre'),
        apellido1: $('#cliApellido1'),
        apellido2: $('#cliApellido2'),
        telefono:  $('#cliTelefono'),
        correo:    $('#cliCorreo'),
        direccion: $('#cliDireccion'),
        ubicacion: $('#cliUbicacion'),
    };

    const revisar        = $('#cliRevisar');
    const revisarTexto   = $('#cliRevisarTexto');
    const revisarCambios = $('#cliRevisarCambios');

    const confirmar       = $('#cliConfirmar');
    const confirmarTexto  = $('#cliConfirmarTexto');
    const botonSiEliminar = $('#cliSiEliminar');

    // Avisos verdes/rojos (crearAviso está en js/componentes.js)
    const aviso = crearAviso($('#cliAviso'), 5000);

    // ---------- Permisos del usuario conectado (js/sesion.js) ----------
    const sesion     = obtenerSesion();
    const admin      = esAdministrador();
    const g1         = esAdminG1();
    const g2         = esAdminG2();
    const g3         = esAdminG3();
    const miRegion   = regionActual();
    const esEmpleado = rolActual() === 'empleado';
    const miTienda   = tiendaActual(); // Admin G3 y Empleado

    const administra = admin || g1 || g2 || g3;    // crea/modifica directo, elimina, aprueba
    const puedeCrear = administra || esEmpleado;   // el Empleado crea con aprobación

    if (!puedeCrear) {
        botonNuevo.hidden = true;
        zona.querySelector('th.tabla-col-acciones').remove();
    }
    const columnas = puedeCrear ? CLI_COLUMNAS_TABLA : CLI_COLUMNAS_TABLA - 1;

    // ---------- Estado ----------
    let clientes = [];          // clientes dentro del alcance del usuario
    let todasTiendas = [];      // todas las tiendas (para mostrar códigos)
    let tiendasAlcance = [];    // tiendas que el usuario puede ver/asignar
    let regiones = [];          // regiones de esas tiendas [{ codigo, nombre }]
    let rutas = [];             // rutas de entrega de esas tiendas (sección Rutas)
    let hayRutas = true;        // false si la base no tiene clientes_tiendas.ruta_id (bloque 16)
    let editando = null;        // null = creando; objeto = cliente que se modifica
    let revisando = null;       // cliente cuya solicitud se revisa
    let eliminandoId = null;

    // Viajes (Transporte): acceso del cliente y sus lugares Casa / Trabajo (sql/01 bloque 19)
    const conViajes = typeof empresaTieneViajes === 'function' && empresaTieneViajes();
    // Usuario del cliente: si la empresa hace viajes o encomiendas ("Mis envíos", sql/01 bloque 23)
    const conAcceso = conViajes || (typeof empresaTieneRecoleccion === 'function' && empresaTieneRecoleccion());
    let accesos = new Map();    // cliente_id -> { id, id_usuario } de su usuario
    let enAcceso = null;        // cliente de la ventana "Acceso y lugares"

    const idsAlcance = () => new Set(tiendasAlcance.map((t) => t.id));
    const idsTiendasDe = (c) => (c.clientes_tiendas || []).map((ct) => ct.tienda_id);
    const tiendaDe = (id) => todasTiendas.find((t) => t.id === id) || {};
    const rutaDe = (id) => rutas.find((r) => r.id === id) || null;

    // ¿El cliente está dentro del alcance del usuario?
    function enAlcance(c) {
        if (admin || g1) return true;
        const alcance = idsAlcance();
        return idsTiendasDe(c).some((id) => alcance.has(id));
    }

    // ¿Puede modificarlo directo, eliminarlo y aprobar sus solicitudes?
    //   Admin / G1 -> todos | G2 -> su región | G3 -> su tienda
    const puedeAdministrar = (c) => (admin || g1) || ((g2 || g3) && enAlcance(c));

    // ¿Puede abrir el formulario de modificar? (el Empleado, con aprobación)
    const puedeModificar = (c) => puedeAdministrar(c) || (esEmpleado && enAlcance(c));

    // Usuario de viajes que el cliente SOLICITÓ desde el login y aún no se aprueba
    // (sql/01 bloque 20): { id, id_usuario, aprobado: false } o null
    const accesoPendiente = (c) => {
        const acceso = accesos.get(c.id);
        return acceso && acceso.aprobado === false ? acceso : null;
    };

    // ¿Tiene algo esperando aprobación?
    const esPendiente = (c) => !c.aprobado || !!c.cambios_pendientes || !!accesoPendiente(c);

    // ==================================================
    // CARGAR DATOS
    // ==================================================

    async function cargarTiendas() {
        const { data, error } = await db.from('tiendas').select('id, codigo, nombre, region, estado').order('codigo');
        if (error) {
            console.error('Error al cargar tiendas:', error);
            return;
        }
        todasTiendas = data;

        // Tiendas que el usuario puede ver y asignar
        if (admin || g1) tiendasAlcance = data;
        else if (g2) tiendasAlcance = data.filter((t) => t.region === miRegion);
        else if (g3 || esEmpleado) tiendasAlcance = data.filter((t) => t.id === miTienda);
        else tiendasAlcance = [];

        // Regiones y rutas de entrega (si faltan las tablas, se trabaja sin ellas)
        const ids = tiendasAlcance.map((t) => t.id);
        const [reg, rut] = await Promise.all([
            db.from('regiones').select('codigo, nombre').order('nombre'),
            db.from('rutas').select('id, tienda_id, nombre, activa').in('tienda_id', ids.length ? ids : [0]).order('orden').order('nombre'),
        ]);
        const codigosRegion = new Set(tiendasAlcance.map((t) => t.region));
        regiones = (reg.data || []).filter((r) => codigosRegion.has(r.codigo));
        rutas = (rut.data || []).filter((r) => r.activa);

        // Filtro de región: solo si ve más de una (G2, G3 y Empleado la tienen fija)
        regiones.forEach((r) => filtroRegion.appendChild(new Option(r.nombre, r.codigo)));
        filtroRegion.hidden = regiones.length <= 1;
        llenarFiltroTiendas();

        // Casillas del formulario: tienda + su ruta de entrega
        cajaTiendas.replaceChildren();
        tiendasAlcance.forEach((t) => {
            const fila = document.createElement('div');
            fila.className = 'cli-tienda-fila';
            const etiqueta = document.createElement('label');
            etiqueta.className = 'cli-tienda-opcion';
            const casilla = document.createElement('input');
            casilla.type = 'checkbox';
            casilla.value = t.id;
            const texto = document.createElement('span');
            texto.textContent = `${t.codigo} · ${t.nombre}`;
            etiqueta.append(casilla, texto);
            fila.appendChild(etiqueta);
            const deTienda = rutas.filter((r) => r.tienda_id === t.id);
            if (deTienda.length) {
                const sel = document.createElement('select');
                sel.className = 'campo-input cli-ruta';
                sel.dataset.tienda = t.id;
                sel.setAttribute('aria-label', `Ruta de entrega en ${t.codigo}`);
                sel.appendChild(new Option('Sin ruta', ''));
                deTienda.forEach((r) => sel.appendChild(new Option(textoRuta(r), r.id)));
                fila.appendChild(sel);
            }
            cajaTiendas.appendChild(fila);
        });
    }

    const textoRuta = (r) => r.nombre;

    // Tiendas del filtro según la región elegida
    function llenarFiltroTiendas() {
        const actual = filtroTienda.value;
        filtroTienda.replaceChildren(new Option(filtroRegion.value ? 'Todas las tiendas de la región' : 'Todas mis tiendas', ''));
        tiendasAlcance.filter((t) => !filtroRegion.value || t.region === filtroRegion.value)
            .forEach((t) => filtroTienda.appendChild(new Option(`${t.codigo} · ${t.nombre}`, t.id)));
        filtroTienda.value = [...filtroTienda.options].some((o) => o.value === actual) ? actual : '';
        filtroTienda.hidden = filtroTienda.options.length <= 2 && !!filtroTienda.options[1] && tiendasAlcance.length === 1;
        llenarFiltroRutas();
    }

    // Rutas del filtro: las de la tienda elegida (o de las tiendas de la región)
    function llenarFiltroRutas() {
        const actual = filtroRuta.value;
        const tienda = Number(filtroTienda.value) || null;
        const lista = rutas.filter((r) => (tienda ? r.tienda_id === tienda
            : !filtroRegion.value || tiendaDe(r.tienda_id).region === filtroRegion.value));
        filtroRuta.replaceChildren(new Option('Todas las rutas', ''));
        lista.forEach((r) => filtroRuta.appendChild(new Option(
            tienda ? textoRuta(r) : `${textoRuta(r)} · ${tiendaDe(r.tienda_id).codigo || ''}`, r.id)));
        filtroRuta.value = [...filtroRuta.options].some((o) => o.value === actual) ? actual : '';
        filtroRuta.hidden = !lista.length;
    }

    async function cargarClientes() {
        const columnas = () => (hayRutas ? CLI_COLUMNAS : CLI_COLUMNAS_SIN_RUTA);
        let { data, error } = await db.from('clientes').select(columnas()).order('apellidos');
        if (error && error.code === '42703' && hayRutas) { // falta clientes_tiendas.ruta_id (sql/01 bloque 16)
            hayRutas = false;
            ({ data, error } = await db.from('clientes').select(columnas()).order('apellidos'));
            cajaTiendas.querySelectorAll('.cli-ruta').forEach((s) => s.remove());
        }
        if (error) {
            console.error('Error al cargar clientes:', error);
            contador.textContent = 'No se pudo cargar la lista.';
            aviso.mostrar(error.code === '42P01' || error.code === 'PGRST205'
                ? 'Falta instalar la base de datos (sql/00_instalacion_completa.sql).'
                : 'No se pudieron cargar los clientes. Revisa la conexión.', 'error');
            return;
        }
        clientes = data.filter(enAlcance);
        await cargarAccesos();
        dibujarTabla();
    }

    // Usuarios de los clientes (rol cliente, sql/01 bloque 19): cliente_id -> { id, id_usuario, aprobado }
    async function cargarAccesos() {
        accesos = new Map();
        if (!conAcceso) return;
        const { data, error } = await db.from('usuarios').select('id, id_usuario, cliente_id, aprobado').eq('rol', 'cliente');
        if (!error) data.forEach((u) => accesos.set(u.cliente_id, u));
    }

    // ==================================================
    // TABLA
    // ==================================================

    // ¿Es un enlace web? (solo http/https, por seguridad)
    function esEnlace(texto) {
        if (!/^https?:\/\//i.test(texto || '')) return false;
        try { new URL(texto); return true; } catch { return false; }
    }

    // Coordenadas "9.93, -84.08" (las guarda Nuevo pedido) -> enlace de Google Maps
    function enlaceDeCoordenadas(texto) {
        const m = String(texto || '').trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
        return m ? `https://www.google.com/maps/search/?api=1&query=${m[1]},${m[2]}` : null;
    }

    // Celda de ubicación: enlace "Ver en mapa" o el texto de referencia
    function celdaUbicacion(ubicacion) {
        const destino = esEnlace(ubicacion) ? ubicacion : enlaceDeCoordenadas(ubicacion);
        if (!destino) return crearCelda(ubicacion);
        const td = document.createElement('td');
        const enlace = document.createElement('a');
        enlace.className = 'cli-mapa';
        enlace.href = destino;
        enlace.target = '_blank';
        enlace.rel = 'noopener noreferrer';
        enlace.innerHTML = '<i class="bi bi-geo-alt"></i>';
        enlace.append(' Ver en mapa');
        td.appendChild(enlace);
        return td;
    }

    // Celda "Nombre Apellidos" + (si está pendiente) "Solicitado por ..."
    function celdaCliente(c) {
        const td = crearCelda(cliNombreCompleto(c));
        const acceso = accesoPendiente(c);
        if (esPendiente(c) && (c.solicitante || acceso)) {
            const detalle = document.createElement('span');
            detalle.className = 'celda-detalle'; // css/componentes.css
            const fecha = c.solicitado_en ? new Date(c.solicitado_en).toLocaleDateString('es') : '';
            detalle.textContent = c.solicitante
                ? `Solicitado por ${c.solicitante.nombre}${fecha ? ' el ' + fecha : ''}`
                : `Pidió su usuario "${acceso.id_usuario}" desde el login`;
            td.appendChild(detalle);
        }
        return td;
    }

    // Tiendas del cliente con su ruta: "CEN-001 · Ruta Norte, NOR-002"
    function textoTiendas(c) {
        return (c.clientes_tiendas || [])
            .map((ct) => {
                const codigo = tiendaDe(ct.tienda_id).codigo;
                const ruta = rutaDe(ct.ruta_id);
                return codigo ? `${codigo}${ruta ? ` · ${ruta.nombre}` : ''}` : null;
            })
            .filter(Boolean)
            .sort()
            .join(', ');
    }

    function celdaEstado(c) {
        if (!c.aprobado) return crearCeldaEtiqueta('Nuevo · pendiente', 'etiqueta-naranja');
        if (c.cambios_pendientes) return crearCeldaEtiqueta('Cambios pendientes', 'etiqueta-naranja');
        if (accesoPendiente(c)) return crearCeldaEtiqueta('Acceso pendiente', 'etiqueta-naranja');
        return crearCeldaEtiqueta('Aprobado', 'etiqueta-verde');
    }

    function crearFilaCliente(c) {
        const tr = document.createElement('tr');
        tr.appendChild(celdaCliente(c));
        tr.appendChild(crearCelda(c.telefono));
        tr.appendChild(crearCelda(c.correo));
        tr.appendChild(crearCelda(c.direccion));
        tr.appendChild(celdaUbicacion(c.ubicacion));
        tr.appendChild(crearCelda(textoTiendas(c), 'texto-codigo'));
        // Categoría: se calculará con las calificaciones de Pedidos (Fase 2)
        tr.appendChild(crearCeldaEtiqueta('Nuevo', 'etiqueta-gris'));
        tr.appendChild(celdaEstado(c));

        if (puedeCrear) {
            const botones = [];

            // Revisar (aprobar/rechazar): solo quien administra y si hay algo pendiente
            if (esPendiente(c) && puedeAdministrar(c)) {
                botones.push(crearBotonIcono('revisar', c.id, 'bi-clipboard-check', 'Revisar solicitud (aprobar o rechazar)'));
            }

            botones.push(crearBotonIcono('editar', c.id, 'bi-pencil',
                puedeModificar(c)
                    ? (esEmpleado ? 'Proponer cambios (requieren aprobación)' : `Modificar a ${c.nombre}`)
                    : 'No tienes permiso para modificar este cliente',
                !puedeModificar(c)));

            // Viajes: usuario del cliente y Casa / Trabajo (solo quien administra, ya aprobado
            // y sin una solicitud de acceso por revisar: esa se aprueba con "Revisar")
            if (conAcceso && puedeAdministrar(c) && c.aprobado && !accesoPendiente(c)) {
                const acceso = accesos.get(c.id);
                botones.push(crearBotonIcono('acceso', c.id, acceso ? 'bi-person-check' : 'bi-key',
                    acceso ? `Acceso del cliente: ${acceso.id_usuario} · Casa y Trabajo` : 'Dar acceso al cliente (usuario) y guardar Casa y Trabajo'));
            }

            botones.push(crearBotonIcono('eliminar', c.id, 'bi-trash3',
                puedeAdministrar(c) ? `Eliminar a ${c.nombre}` : 'Solo un administrador puede eliminar clientes',
                !puedeAdministrar(c)));

            tr.appendChild(crearCeldaAcciones(...botones));
        }
        return tr;
    }

    function dibujarTabla() {
        const tienda = filtroTienda.value;
        const estado = filtroEstado.value;
        // Cada palabra debe aparecer en algún dato (ej. "ana mora" o "8888 1234"); sin tildes
        const palabras = palabrasDeBusqueda(buscador.value);
        const textoDe = (c) => textoParaBuscar(
            `${cliNombreCompleto(c)} ${c.correo || ''} ${String(c.telefono || '').replace(/\D/g, '')} ${c.direccion || ''}`);

        const region = filtroRegion.value;
        const ruta = Number(filtroRuta.value) || null;
        // Relaciones cliente-tienda que entran en región / tienda (para la ruta)
        const relaciones = (c) => (c.clientes_tiendas || []).filter((ct) =>
            (!region || tiendaDe(ct.tienda_id).region === region) && (!tienda || ct.tienda_id === Number(tienda)));
        // Sin tienda (ej. se registró solo y la empresa no tiene tiendas): se ve sin filtro de lugar
        const sinTienda = (c) => !(c.clientes_tiendas || []).length && !region && !tienda;
        const visibles = clientes.filter((c) =>
            (relaciones(c).length > 0 || sinTienda(c)) &&
            (!ruta || relaciones(c).some((ct) => ct.ruta_id === ruta)) &&
            (!estado || (estado === 'pendiente' ? esPendiente(c) : !esPendiente(c))) &&
            (!palabras.length || palabras.every((p) => textoDe(c).includes(p)))
        );

        cuerpo.replaceChildren();
        if (visibles.length === 0) {
            cuerpo.appendChild(crearFilaVacia(
                clientes.length ? 'No hay clientes que coincidan con los filtros.' : 'Aún no hay clientes. Agrega el primero con "Nuevo cliente".',
                columnas
            ));
        }
        visibles.forEach((c) => cuerpo.appendChild(crearFilaCliente(c)));

        // "12 clientes · 2 pendientes de aprobación"
        const pendientes = clientes.filter(esPendiente).length;
        contador.textContent = plural(clientes.length, 'cliente', 'clientes') +
            (pendientes ? ` · ${plural(pendientes, 'pendiente', 'pendientes')} de aprobación` : '');
    }

    buscador.addEventListener('input', dibujarTabla);
    filtroRegion.addEventListener('change', () => { llenarFiltroTiendas(); dibujarTabla(); });
    filtroTienda.addEventListener('change', () => { llenarFiltroRutas(); dibujarTabla(); });
    filtroRuta.addEventListener('change', dibujarTabla);
    filtroEstado.addEventListener('change', dibujarTabla);

    // ---------- Primero la región ----------
    // Quien ve varias regiones elige una antes de ver la lista (botón por región
    // con su número de clientes, y "Todas"). Luego se cambia con el filtro.
    function mostrarElegirRegion() {
        const caja = $('#cliRegiones');
        caja.replaceChildren();
        const cuenta = (codigo) => clientes.filter((c) => idsTiendasDe(c).some((id) => !codigo || tiendaDe(id).region === codigo)).length;
        [...regiones.map((r) => ({ valor: r.codigo, texto: r.nombre })), { valor: '', texto: 'Todas las regiones' }].forEach((r) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'cli-region-boton';
            b.dataset.region = r.valor;
            const nombre = document.createElement('strong');
            nombre.textContent = r.texto;
            const n = document.createElement('small');
            n.textContent = plural(cuenta(r.valor), 'cliente', 'clientes');
            b.append(nombre, n);
            caja.appendChild(b);
        });
        $('#cliElegirRegion').hidden = false;
        $('#cliFiltros').hidden = true;
        $('#cliTablaCaja').hidden = true;
        contador.textContent = 'Elige la región para ver sus clientes.';
    }

    $('#cliRegiones').addEventListener('click', (evento) => {
        const b = evento.target.closest('button[data-region]');
        if (!b) return;
        filtroRegion.value = b.dataset.region;
        llenarFiltroTiendas();
        $('#cliElegirRegion').hidden = true;
        $('#cliFiltros').hidden = false;
        $('#cliTablaCaja').hidden = false;
        dibujarTabla();
    });

    // Un solo "escuchador" para todos los botones de la tabla
    cuerpo.addEventListener('click', (evento) => {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton || boton.disabled) return;
        const cliente = clientes.find((c) => c.id === Number(boton.dataset.id));
        if (!cliente) return;

        if (boton.dataset.accion === 'revisar' && puedeAdministrar(cliente)) abrirRevision(cliente);
        if (boton.dataset.accion === 'editar' && puedeModificar(cliente)) abrirFormulario(cliente);
        if (boton.dataset.accion === 'eliminar' && puedeAdministrar(cliente)) pedirConfirmacion(cliente);
        if (boton.dataset.accion === 'acceso' && conAcceso && puedeAdministrar(cliente)) abrirAcceso(cliente);
    });

    // ==================================================
    // ACCESO Y LUGARES (Viajes, sql/01 bloque 19)
    //   - Usuario rol "cliente": nombre + ID de la empresa (mramirez02), con su
    //     contraseña. Entra a Inicio, Viajes y Mi perfil para solicitar sus viajes.
    //   - Casa y Trabajo: dirección + punto (se ubica con el buscador de js/mapa.js).
    // ==================================================
    const accesoDialogo = $('#cliAcceso');
    const lugares = {
        casa: { texto: $('#cliCasaTexto'), opciones: $('#cliCasaOpciones'), estado: $('#cliCasaEstado'), punto: null, resultados: [] },
        trabajo: { texto: $('#cliTrabajoTexto'), opciones: $('#cliTrabajoOpciones'), estado: $('#cliTrabajoEstado'), punto: null, resultados: [] },
    };

    // "Ana María Ramírez" -> "aramirez"
    const usuarioPropuesto = (c) => textoParaBuscar(`${(c.nombre || '').trim().charAt(0)}${(c.apellido1 || '').split(' ')[0]}`)
        .replace(/[^a-z0-9]/g, '');

    function pintarEjemploUsuario() {
        const base = $('#cliAccesoUsuario').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        $('#cliAccesoEjemplo').textContent = base ? `Entrará como "${usuarioCompuesto(base)}"` : 'Letras y números, sin espacios';
    }
    $('#cliAccesoUsuario').addEventListener('input', pintarEjemploUsuario);

    function pintarLugar(lugar) {
        const l = lugares[lugar];
        l.estado.textContent = l.punto ? `Ubicado: ${Number(l.punto.lat).toFixed(5)}, ${Number(l.punto.lng).toFixed(5)}` : 'Sin ubicar';
    }

    async function abrirAcceso(c) {
        enAcceso = c;
        $('#cliAccesoError').textContent = '';
        $('#cliAccesoTitulo').textContent = `Acceso y lugares: ${cliNombreCompleto(c)}`;
        const acceso = accesos.get(c.id);
        $('#cliAccesoNuevo').hidden = !!acceso;
        $('#cliAccesoTiene').hidden = !acceso;
        $('#cliAccesoUsuario').value = acceso ? '' : usuarioPropuesto(c);
        $('#cliAccesoClave').value = '';
        $('#cliAccesoClaveNueva').value = '';
        if (acceso) $('#cliAccesoActual').textContent = acceso.id_usuario;
        pintarEjemploUsuario();

        const { data, error } = await db.from('clientes')
            .select('casa_direccion, casa_lat, casa_lng, trabajo_direccion, trabajo_lat, trabajo_lng').eq('id', c.id).maybeSingle();
        if (error) {
            aviso.mostrar(error.code === '42703' ? 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 19: transporte).'
                : 'No se pudieron cargar los lugares del cliente.', 'error');
            return;
        }
        ['casa', 'trabajo'].forEach((lugar) => {
            const l = lugares[lugar];
            l.texto.value = (data && data[`${lugar}_direccion`]) || '';
            l.punto = data && data[`${lugar}_lat`] != null ? { lat: Number(data[`${lugar}_lat`]), lng: Number(data[`${lugar}_lng`]) } : null;
            l.opciones.hidden = true;
            pintarLugar(lugar);
        });
        accesoDialogo.showModal();
    }

    // "Ubicar": busca la dirección (o lee coordenadas / enlace) y pone el primer resultado
    accesoDialogo.addEventListener('click', async (e) => {
        const b = e.target.closest('button[data-buscar-lugar]');
        if (!b) return;
        const l = lugares[b.dataset.buscarLugar];
        const texto = l.texto.value.trim();
        if (!texto) { l.estado.textContent = 'Escribe primero la dirección.'; return; }
        l.estado.textContent = 'Buscando...';
        try {
            l.resultados = await buscarDireccion(texto); // js/mapa.js
        } catch (err) {
            l.estado.textContent = 'No se pudo buscar (revisa internet).';
            return;
        }
        if (!l.resultados.length) { l.estado.textContent = 'No se encontró: escribe barrio y cantón, o pega las coordenadas.'; return; }
        l.opciones.replaceChildren(...l.resultados.map((r, i) => new Option(r.texto, i)));
        l.opciones.hidden = l.resultados.length < 2;
        l.punto = { lat: l.resultados[0].lat, lng: l.resultados[0].lng };
        pintarLugar(b.dataset.buscarLugar);
    });
    Object.entries(lugares).forEach(([lugar, l]) => {
        l.opciones.addEventListener('change', () => {
            const r = l.resultados[Number(l.opciones.value)];
            if (r) { l.punto = { lat: r.lat, lng: r.lng }; pintarLugar(lugar); }
        });
        // Si se borra la dirección, se quita el lugar al guardar
        l.texto.addEventListener('input', () => { if (!l.texto.value.trim()) { l.punto = null; pintarLugar(lugar); } });
    });

    $('#cliAccesoCancelar').addEventListener('click', () => accesoDialogo.close());

    $('#cliAccesoQuitar').addEventListener('click', async () => {
        const acceso = enAcceso && accesos.get(enAcceso.id);
        if (!acceso || !confirm(`¿Quitar el acceso de ${cliNombreCompleto(enAcceso)} (${acceso.id_usuario})? Ya no podrá entrar a la app.`)) return;
        const { error } = await db.from('usuarios').delete().eq('id', acceso.id);
        if (error) { $('#cliAccesoError').textContent = 'No se pudo quitar el acceso.'; return; }
        accesoDialogo.close();
        aviso.mostrar(`Acceso de ${cliNombreCompleto(enAcceso)} quitado.`);
        cargarClientes();
    });

    $('#cliAccesoForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const c = enAcceso;
        if (!c) return;
        const errorCaja = $('#cliAccesoError');
        errorCaja.textContent = '';
        const acceso = accesos.get(c.id);

        // Lugares: con texto y sin punto ubicado -> hay que presionar "Ubicar"
        const datosLugares = {};
        for (const [lugar, l] of Object.entries(lugares)) {
            const texto = l.texto.value.trim();
            if (texto && !l.punto) { errorCaja.textContent = `Presiona "Ubicar" en ${lugar === 'casa' ? 'Casa' : 'Trabajo'} (o borra la dirección).`; return; }
            datosLugares[`${lugar}_direccion`] = texto || null;
            datosLugares[`${lugar}_lat`] = texto ? Number(Number(l.punto.lat).toFixed(6)) : null;
            datosLugares[`${lugar}_lng`] = texto ? Number(Number(l.punto.lng).toFixed(6)) : null;
        }

        const boton = $('#cliAccesoGuardar');
        boton.disabled = true;
        const listo = (texto, tipo = 'error') => { boton.disabled = false; if (tipo === 'error') errorCaja.textContent = texto; };

        const { error: errLugares } = await db.from('clientes').update(datosLugares).eq('id', c.id);
        if (errLugares) { listo('No se pudieron guardar los lugares.'); return; }

        let mensaje = 'Lugares guardados.';
        if (!acceso) {
            const base = $('#cliAccesoUsuario').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            const clave = $('#cliAccesoClave').value;
            // Sin usuario ni contraseña escritos: solo se guardan los lugares
            if (base || clave) {
                if (!/^[a-z0-9]{3,20}$/.test(base)) { listo('El usuario: de 3 a 20 letras o números, sin espacios.'); return; }
                if (clave.length < 6) { listo('La contraseña debe tener al menos 6 caracteres.'); return; }
                const libre = await db.rpc('usuario_libre', { p_base: base, p_codigo_empresa: codigoEmpresa(), p_codigo_tienda: null, p_usuario_id: 0 });
                const idUsuario = libre.error ? usuarioCompuesto(base) : libre.data;
                const { error } = await db.from('usuarios').insert({
                    nombre: cliNombreCompleto(c), id_usuario: idUsuario, telefono: c.telefono || null, clave,
                    permisos: [], rol: 'cliente', cliente_id: c.id, aprobado: true,
                });
                if (error) {
                    console.error('Error al dar acceso:', error);
                    listo(error.code === '23505' ? 'Ese usuario ya existe: prueba otro.'
                        : ['42703', '23514'].includes(error.code) ? 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 19: transporte).'
                            : 'No se pudo crear el usuario.');
                    return;
                }
                mensaje = `Listo: ${cliNombreCompleto(c)} entra con el usuario "${idUsuario}" y la contraseña que escribiste.`;
            }
        } else if ($('#cliAccesoClaveNueva').value) {
            const clave = $('#cliAccesoClaveNueva').value;
            if (clave.length < 6) { listo('La contraseña debe tener al menos 6 caracteres.'); return; }
            const { error } = await db.from('usuarios').update({ clave }).eq('id', acceso.id);
            if (error) { listo('No se pudo cambiar la contraseña.'); return; }
            mensaje = `Contraseña de ${acceso.id_usuario} cambiada y lugares guardados.`;
        }
        listo('', 'ok');
        accesoDialogo.close();
        aviso.mostrar(mensaje);
        cargarClientes();
    });

    // ==================================================
    // CREAR / MODIFICAR
    // ==================================================

    function abrirFormulario(cliente = null) {
        editando = cliente;
        form.reset();
        errorForm.textContent = '';
        tituloForm.textContent = cliente ? 'Modificar cliente' : 'Nuevo cliente';

        // Empleado: aviso de aprobación y sin casillas de tienda (va su tienda)
        $('#cliAvisoAprobacion').hidden = !esEmpleado;
        campoTiendas.hidden = esEmpleado;

        // Datos: si el Empleado ya propuso cambios, se muestran los propuestos
        const datos = cliente
            ? { ...cliente, ...(esEmpleado && cliente.cambios_pendientes ? cliente.cambios_pendientes : {}) }
            : {};
        Object.keys(CLI_CAMPOS).forEach((campo) => { campos[campo].value = datos[campo] || ''; });

        // Casillas: tiendas del cliente; al crear, la del filtro
        // (o la única que tiene, ej. el Admin G3)
        const marcadas = cliente
            ? idsTiendasDe(cliente)
            : filtroTienda.value ? [Number(filtroTienda.value)]
            : tiendasAlcance.length === 1 ? [tiendasAlcance[0].id]
            : [];
        cajaTiendas.querySelectorAll('input').forEach((casilla) => {
            casilla.checked = marcadas.includes(Number(casilla.value));
        });
        // Ruta de entrega en cada tienda
        cajaTiendas.querySelectorAll('select.cli-ruta').forEach((sel) => {
            const rel = cliente ? (cliente.clientes_tiendas || []).find((ct) => ct.tienda_id === Number(sel.dataset.tienda)) : null;
            const deFiltro = !cliente && filtroRuta.value && rutaDe(Number(filtroRuta.value))
                && rutaDe(Number(filtroRuta.value)).tienda_id === Number(sel.dataset.tienda) ? filtroRuta.value : '';
            sel.value = rel && rel.ruta_id ? String(rel.ruta_id) : deFiltro;
        });

        dialogo.showModal();
        campos.nombre.focus();
    }

    botonNuevo.addEventListener('click', () => {
        if (puedeCrear) abrirFormulario();
    });
    $('#cliCancelar').addEventListener('click', () => dialogo.close());

    function fallo(mensaje, campo) {
        errorForm.textContent = mensaje;
        if (campo) campo.focus();
        return null;
    }

    // Lee y valida. Devuelve { datos, tiendas } o null.
    function leerFormulario() {
        const datos = {};
        Object.keys(CLI_CAMPOS).forEach((campo) => {
            datos[campo] = campos[campo].value.trim() || null;
        });

        if (datos.correo) datos.correo = datos.correo.toLowerCase();

        if (!datos.nombre) return fallo('Escribe el nombre.', campos.nombre);
        if (!datos.apellido1) return fallo('Escribe el primer apellido.', campos.apellido1);
        if (!datos.telefono) return fallo('Escribe el teléfono.', campos.telefono);
        if (datos.telefono.replace(/\D/g, '').length < 8) return fallo('El teléfono debe tener al menos 8 dígitos.', campos.telefono);
        if (datos.correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.correo)) {
            return fallo('Revisa el correo (ejemplo: nombre@correo.com).', campos.correo);
        }

        const tiendas = [...cajaTiendas.querySelectorAll('input:checked')].map((c) => Number(c.value));
        // Ruta elegida en cada tienda marcada: { tienda_id: ruta_id | null }
        const rutasElegidas = {};
        cajaTiendas.querySelectorAll('select.cli-ruta').forEach((sel) => {
            rutasElegidas[Number(sel.dataset.tienda)] = sel.value ? Number(sel.value) : null;
        });
        if (!esEmpleado && tiendas.length === 0) {
            return fallo('Marca al menos una tienda que atienda a este cliente.');
        }
        if (esEmpleado && !miTienda) {
            return fallo('Tu usuario no tiene tienda asignada. Pide a un administrador que lo revise.');
        }
        return { datos, tiendas, rutasElegidas };
    }

    // Asigna/quita tiendas (solo dentro del alcance del usuario) y su ruta de entrega.
    // rutasElegidas: { tienda_id: ruta_id | null } (solo las tiendas que tienen rutas)
    async function sincronizarTiendas(clienteId, actuales, elegidas, rutasElegidas = {}, relacionesActuales = []) {
        const alcance = idsAlcance();
        const agregar = elegidas.filter((id) => !actuales.includes(id));
        const quitar = actuales.filter((id) => alcance.has(id) && !elegidas.includes(id));
        const conRuta = (tienda_id) => (hayRutas && tienda_id in rutasElegidas ? { ruta_id: rutasElegidas[tienda_id] } : {});

        if (agregar.length) {
            const { error } = await db.from('clientes_tiendas')
                .insert(agregar.map((tienda_id) => ({ cliente_id: clienteId, tienda_id, ...conRuta(tienda_id) })));
            if (error) return error;
        }
        // Tiendas que ya tenía: se actualiza la ruta si cambió
        for (const tienda_id of elegidas.filter((id) => actuales.includes(id))) {
            if (!hayRutas || !(tienda_id in rutasElegidas)) continue;
            const antes = (relacionesActuales.find((ct) => ct.tienda_id === tienda_id) || {}).ruta_id || null;
            if (antes === rutasElegidas[tienda_id]) continue;
            const { error } = await db.from('clientes_tiendas').update({ ruta_id: rutasElegidas[tienda_id] })
                .eq('cliente_id', clienteId).eq('tienda_id', tienda_id);
            if (error) return error;
        }
        if (quitar.length) {
            const { error } = await db.from('clientes_tiendas')
                .delete().eq('cliente_id', clienteId).in('tienda_id', quitar);
            if (error) return error;
        }
        return null;
    }

    // Guarda según quién es y si crea o modifica. Devuelve { error, mensaje }.
    async function guardar({ datos, tiendas, rutasElegidas }) {
        const ahora = new Date().toISOString();

        // --- Empleado: todo queda pendiente de aprobación ---
        if (esEmpleado) {
            if (!editando) {
                const { data, error } = await db.from('clientes')
                    .insert({ ...datos, aprobado: false, solicitado_por: sesion.id, solicitado_en: ahora })
                    .select('id').single();
                if (error) return { error };
                const errorTienda = await sincronizarTiendas(data.id, [], [miTienda]);
                if (errorTienda) return { error: errorTienda };

                // Solicitud de tienda: se avisa SOLO al Admin G3 de la tienda
                // (o al G2 de la región si no hay G3) - js/notificaciones.js
                notificarPendiente({
                    referenciaTipo: 'cliente', referenciaId: data.id, tiendaId: miTienda, soloTienda: true,
                    titulo: 'Cliente nuevo por aprobar',
                    mensaje: `${sesion.nombre} agregó a ${cliNombreCompleto(datos)} (tel. ${datos.telefono}).`,
                    enlace: `#clientes?tienda=${miTienda}`,
                });
                return { id: data.id, mensaje: 'Solicitud enviada: el cliente quedará pendiente hasta que un administrador lo apruebe.' };
            }

            // Un cliente nuevo que aún no se aprueba se corrige directo (sigue pendiente)
            if (!editando.aprobado) {
                const { error } = await db.from('clientes')
                    .update({ ...datos, solicitado_por: sesion.id, solicitado_en: ahora }).eq('id', editando.id);
                return error ? { error } : { mensaje: 'Solicitud actualizada. Sigue pendiente de aprobación.' };
            }

            // Cliente aprobado: solo se guardan los datos que cambian, como propuesta
            const cambios = {};
            Object.keys(CLI_CAMPOS).forEach((campo) => {
                if ((datos[campo] || null) !== (editando[campo] || null)) cambios[campo] = datos[campo];
            });
            if (Object.keys(cambios).length === 0) {
                return { error: { mensajePropio: 'No cambiaste ningún dato.' } };
            }
            const { error } = await db.from('clientes')
                .update({ cambios_pendientes: cambios, solicitado_por: sesion.id, solicitado_en: ahora })
                .eq('id', editando.id);
            if (error) return { error };

            // Solicitud de tienda: se avisa SOLO al Admin G3 de la tienda (o al G2 si no hay G3)
            notificarPendiente({
                referenciaTipo: 'cliente', referenciaId: editando.id, tiendaId: miTienda, soloTienda: true,
                titulo: 'Cambios de cliente por aprobar',
                mensaje: `${sesion.nombre} propuso cambios para ${cliNombreCompleto(editando)} ` +
                    `(${Object.keys(cambios).map((c) => CLI_CAMPOS[c].toLowerCase()).join(', ')}).`,
                enlace: `#clientes?tienda=${miTienda}`,
            });
            return { mensaje: 'Cambios enviados para aprobación.' };
        }

        // --- Administrador / Admin G1 / Admin G2: se guarda directo ---
        if (!editando) {
            const { data, error } = await db.from('clientes').insert(datos).select('id').single();
            if (error) return { error };
            const errorTiendas = await sincronizarTiendas(data.id, [], tiendas, rutasElegidas);
            if (errorTiendas) return { error: errorTiendas };
            return { id: data.id, mensaje: `Cliente "${cliNombreCompleto(datos)}" creado.` };
        }

        const { error } = await db.from('clientes').update(datos).eq('id', editando.id);
        if (error) return { error };
        const errorTiendas = await sincronizarTiendas(editando.id, idsTiendasDe(editando), tiendas, rutasElegidas, editando.clientes_tiendas || []);
        if (errorTiendas) return { error: errorTiendas };
        return { mensaje: `Cliente "${cliNombreCompleto(datos)}" actualizado.` };
    }

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!puedeCrear) return;
        errorForm.textContent = '';

        const leido = leerFormulario();
        if (!leido) return;

        botonGuardar.disabled = true;
        botonGuardar.textContent = 'Guardando...';
        const { error, mensaje } = await guardar(leido);
        botonGuardar.disabled = false;
        botonGuardar.textContent = 'Guardar';

        if (error) {
            console.error('Error al guardar cliente:', error);
            errorForm.textContent = error.mensajePropio
                // Correo repetido (índice clientes_correo_unico): puede ser de un cliente de otra tienda
                || (error.code === '23505' ? 'Ya hay un cliente con ese correo (puede estar en otra tienda). Búscalo o usa otro correo.'
                : error.code === '42703' || error.code === 'PGRST204' ? 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloques 11 y 16: clientes).'
                : 'No se pudo guardar. Revisa la conexión e intenta de nuevo.');
            if (error.code === '23505') campos.correo.focus();
            return;
        }

        dialogo.close();
        aviso.mostrar(mensaje);
        cargarClientes();
    });

    // ==================================================
    // REVISAR SOLICITUD (aprobar / rechazar)
    // ==================================================

    function abrirRevision(cliente) {
        revisando = cliente;
        const quien = cliente.solicitante ? cliente.solicitante.nombre : 'un empleado';
        const cuerpoCambios = revisarCambios.querySelector('tbody');
        cuerpoCambios.replaceChildren();

        const acceso = accesoPendiente(cliente);
        if (!cliente.aprobado && acceso && !cliente.solicitante) {
            // Se registró solo desde el login (sql/01 bloque 20)
            revisarTexto.textContent = `"${cliNombreCompleto(cliente)}" (tel. ${cliente.telefono}` +
                `${cliente.correo ? `, ${cliente.correo}` : ''}) se registró desde el login y pide el usuario ` +
                `"${acceso.id_usuario}". Si lo apruebas, ya puede entrar a solicitar sus viajes o envíos. Si lo rechazas, se elimina.`;
            revisarCambios.hidden = true;
        } else if (!cliente.aprobado) {
            // Cliente nuevo
            revisarTexto.textContent = `${quien} pidió agregar a "${cliNombreCompleto(cliente)}" ` +
                `(tel. ${cliente.telefono}) en ${textoTiendas(cliente) || 'su tienda'}. ` +
                'Si lo rechazas, el cliente se elimina.';
            revisarCambios.hidden = true;
        } else if (acceso && !cliente.cambios_pendientes) {
            // Cliente que ya existía y pidió su usuario desde el login con el mismo teléfono
            revisarTexto.textContent = `Alguien con el teléfono de "${cliNombreCompleto(cliente)}" (${cliente.telefono}) ` +
                `pidió el usuario "${acceso.id_usuario}" desde el login. ⚠ Confirma con el cliente que fue él antes de aprobar: ` +
                'el usuario verá y pedirá viajes o envíos a su nombre. Si lo rechazas, solo se borra la solicitud de acceso.';
            revisarCambios.hidden = true;
        } else {
            // Cambios propuestos: tabla Dato | Actual | Propuesto
            revisarTexto.textContent = `${quien} propuso estos cambios para "${cliNombreCompleto(cliente)}":`;
            Object.entries(cliente.cambios_pendientes || {}).forEach(([campo, propuesto]) => {
                const tr = document.createElement('tr');
                tr.appendChild(crearCelda(CLI_CAMPOS[campo] || campo));
                tr.appendChild(crearCelda(cliente[campo]));
                tr.appendChild(crearCelda(propuesto));
                cuerpoCambios.appendChild(tr);
            });
            revisarCambios.hidden = false;
        }
        revisar.showModal();
    }

    $('#cliRevisarCerrar').addEventListener('click', () => revisar.close());

    // Enlace a la sección Clientes filtrada por la (primera) tienda del cliente
    const enlaceDeCliente = (c) => {
        const tienda = idsTiendasDe(c)[0];
        return tienda ? `#clientes?tienda=${tienda}` : '#clientes';
    };

    // Limpia los datos de la solicitud
    const sinSolicitud = { cambios_pendientes: null, solicitado_por: null, solicitado_en: null };

    $('#cliAprobar').addEventListener('click', async () => {
        const c = revisando;
        if (!c || !puedeAdministrar(c)) return revisar.close();

        // Solo los datos que existen hoy (una propuesta vieja podía traer "apellidos", que ahora calcula la base)
        const propuestos = Object.fromEntries(Object.entries(c.cambios_pendientes || {}).filter(([k]) => k in CLI_CAMPOS));
        const cambios = c.aprobado
            ? { ...propuestos, ...sinSolicitud }   // aplica los cambios propuestos
            : { aprobado: true, ...sinSolicitud }; // aprueba el cliente nuevo
        const acceso = accesoPendiente(c);

        // Solo el acceso pendiente (cliente ya aprobado y sin cambios): no se toca el cliente
        const { error } = !c.aprobado || c.cambios_pendientes
            ? await db.from('clientes').update(cambios).eq('id', c.id)
            : { error: null };
        // Usuario que pidió desde el login: queda activo (ya puede entrar)
        const { error: errorAcceso } = !error && acceso
            ? await db.from('usuarios').update({ aprobado: true }).eq('id', acceso.id)
            : { error: null };
        revisar.close();
        if (error || errorAcceso) {
            console.error('Error al aprobar:', error || errorAcceso);
            aviso.mostrar(error && error.code === '23505'
                ? 'No se pudo aprobar: el correo propuesto ya lo tiene otro cliente. Rechaza los cambios y pide otro correo.'
                : errorAcceso ? 'El cliente quedó aprobado, pero no se pudo activar su usuario. Intenta de nuevo con "Revisar".'
                    : 'No se pudo aprobar. Intenta de nuevo.', 'error');
            cargarClientes();
            return;
        }
        // Notificaciones (js/notificaciones.js): avisar al empleado y cerrar los "pendiente"
        notificarResultado({
            usuarioId: c.solicitado_por, aprobado: true,
            titulo: c.aprobado ? 'Cambios de cliente aprobados' : 'Cliente aprobado',
            mensaje: c.aprobado
                ? `Se aplicaron tus cambios a ${cliNombreCompleto(c)}.`
                : `${cliNombreCompleto(c)} ya está aprobado.`,
            enlace: enlaceDeCliente(c), referenciaTipo: 'cliente', referenciaId: c.id,
        });
        resolverPendientes('cliente', c.id);
        if (acceso) resolverPendientes('acceso_cliente', c.id);

        aviso.mostrar(acceso
            ? `Listo: ${cliNombreCompleto(c)} ya puede entrar con el usuario "${acceso.id_usuario}". Avísale por teléfono o WhatsApp.`
            : c.aprobado ? 'Cambios aprobados y aplicados.' : `Cliente "${cliNombreCompleto(c)}" aprobado.`);
        cargarClientes();
    });

    $('#cliRechazar').addEventListener('click', async () => {
        const c = revisando;
        if (!c || !puedeAdministrar(c)) return revisar.close();

        // Cliente nuevo rechazado -> se elimina (su usuario solicitado también) |
        // Cambios rechazados -> se descartan | Acceso pedido por un cliente que ya existía -> se borra ese usuario
        const acceso = accesoPendiente(c);
        let error = null;
        if (!c.aprobado) ({ error } = await db.from('clientes').delete().eq('id', c.id));
        else {
            if (c.cambios_pendientes) ({ error } = await db.from('clientes').update(sinSolicitud).eq('id', c.id));
            if (!error && acceso) ({ error } = await db.from('usuarios').delete().eq('id', acceso.id));
        }

        revisar.close();
        if (error) {
            console.error('Error al rechazar:', error);
            aviso.mostrar('No se pudo rechazar. Intenta de nuevo.', 'error');
            cargarClientes();
            return;
        }
        if (acceso) resolverPendientes('acceso_cliente', c.id);
        // Notificaciones: avisar al empleado y cerrar los "pendiente"
        notificarResultado({
            usuarioId: c.solicitado_por, aprobado: false,
            titulo: c.aprobado ? 'Cambios de cliente rechazados' : 'Cliente rechazado',
            mensaje: c.aprobado
                ? `No se aplicaron tus cambios a ${cliNombreCompleto(c)}.`
                : `${cliNombreCompleto(c)} no se agregó.`,
            enlace: enlaceDeCliente(c),
        });
        resolverPendientes('cliente', c.id);

        aviso.mostrar(c.aprobado
            ? (c.cambios_pendientes ? 'Cambios rechazados.' : 'Solicitud de acceso rechazada: se borró ese usuario.')
            : 'Solicitud rechazada: el cliente no se agregó.');
        cargarClientes();
    });

    // ==================================================
    // ELIMINAR (solo quien administra)
    // ==================================================

    function pedirConfirmacion(cliente) {
        eliminandoId = cliente.id;
        confirmarTexto.textContent = `¿Seguro que quieres eliminar a "${cliNombreCompleto(cliente)}"? ` +
            'Se quitará de todas sus tiendas. Esta acción no se puede deshacer.';
        confirmar.showModal();
    }

    $('#cliNoEliminar').addEventListener('click', () => confirmar.close());

    botonSiEliminar.addEventListener('click', async () => {
        const c = clientes.find((x) => x.id === eliminandoId);
        if (!c || !puedeAdministrar(c)) return confirmar.close();

        botonSiEliminar.disabled = true;
        const { error } = await db.from('clientes').delete().eq('id', c.id);
        botonSiEliminar.disabled = false;
        confirmar.close();

        if (error) {
            console.error('Error al eliminar cliente:', error);
            aviso.mostrar('No se pudo eliminar el cliente. Intenta de nuevo.', 'error');
            return;
        }
        // Si tenía algo pendiente, esos avisos ya no aplican
        if (esPendiente(c)) resolverPendientes('cliente', c.id);
        if (accesoPendiente(c)) resolverPendientes('acceso_cliente', c.id);

        aviso.mostrar(`Cliente "${cliNombreCompleto(c)}" eliminado.`);
        cargarClientes();
    });

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================

    // Parámetros del # (ej. #clientes?tienda=3&nuevo=1) - js/pagina_inicial.js
    const parametros = parametrosSeccion();

    cargarTiendas().then(async () => {
        // ?tienda=3 -> se filtra por esa tienda (si está en su alcance)
        const tiendaPedida = parametros.get('tienda');
        if (tiendaPedida && tiendasAlcance.some((t) => String(t.id) === tiendaPedida)) {
            filtroRegion.value = tiendaDe(Number(tiendaPedida)).region || '';
            llenarFiltroTiendas();
            filtroTienda.value = tiendaPedida;
            llenarFiltroRutas();
        }

        await cargarClientes();

        // Primero la región (si ve varias y no se pidió una tienda)
        if (regiones.length > 1 && !filtroTienda.value && parametros.get('nuevo') !== '1') mostrarElegirRegion();

        // ?nuevo=1 -> abre el formulario directamente
        if (parametros.get('nuevo') === '1' && puedeCrear) abrirFormulario();
    });

    // Se ejecuta al salir de la sección (js/pagina_inicial.js)
    return () => {
        aviso.limpiar();
        [dialogo, revisar, confirmar, accesoDialogo].forEach((d) => { if (d.open) d.close(); });
    };
});
