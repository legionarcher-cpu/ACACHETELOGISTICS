/* ==================================================
   SECCIÓN: PILOTOS - LÓGICA
   ACACHETE LOGISTICS

   Qué hace:
     - Lista a todos los usuarios con rol "piloto" (tabla "usuarios"
       de Supabase), agrupados por tienda, con su foto, usuario,
       teléfono y vehículo asignado.
     - Filtro por región y buscador (nombre, usuario, tienda, placa).
     - Columna "Funciones": por ahora "Por definir". Aquí se asignarán
       las funciones de cada piloto cuando se definan.

   No hay que hacer nada para que un piloto aparezca: basta con que en
   la sección Usuarios tenga el rol "Piloto". Sus datos se modifican
   allá (esta sección solo los muestra).

   Quién ve qué:
     - Admin G2: solo los pilotos de las tiendas de SU región
       (el filtro de región queda fijo).
     - Admin G3: solo los pilotos de SU tienda.
     - Los demás roles: todos los pilotos.

   HTML: secciones/pilotos.html
   Estilos: css/secciones/pilotos.css (propios) + css/componentes.css (comunes)
   Funciones comunes (celdas, grupos, avisos): js/componentes.js
   ================================================== */

// Columnas que se traen: datos del piloto + su tienda + su vehículo (la clave NO)
const PLT_COLUMNAS = 'id, nombre, id_usuario, telefono, foto_url, tienda_id, ' +
    'tiendas(codigo, nombre, region), vehiculos(placa, marca)';

// Número de columnas de la tabla (para las filas que ocupan todo el ancho)
const PLT_COLUMNAS_TABLA = 6;

registrarSeccion('pilotos', (zona) => {

    // ---------- Elementos de la página ----------
    const $ = (selector) => zona.querySelector(selector);

    const contador     = $('#pltContador');
    const filtroRegion = $('#pltFiltroRegion');
    const buscador     = $('#pltBuscar');
    const tabla        = $('#pltTabla');

    // Avisos rojos si algo falla (crearAviso está en js/componentes.js)
    const aviso = crearAviso($('#pltAviso'));

    // ---------- Permisos (js/sesion.js) ----------
    const regionFija = esAdminG2() ? regionActual() : null; // Admin G2: solo su región
    const tiendaFija = esAdminG3() ? tiendaActual() : null; // Admin G3: solo su tienda
    if (tiendaFija) filtroRegion.hidden = true;             // (el filtro de región no aplica)

    // ---------- Estado ----------
    let pilotos = [];   // lista traída de la base de datos
    let regiones = [];  // [{ codigo: 'NOR', nombre: 'Norte' }, ...]

    const nombreRegion = (codigo) => (regiones.find((r) => r.codigo === codigo) || {}).nombre || codigo;

    // Textos de cada piloto
    const regionDe   = (p) => (p.tiendas ? p.tiendas.region : null);
    const textoTienda = (p) => (p.tiendas ? `${p.tiendas.codigo} · ${p.tiendas.nombre}` : 'Sin tienda');
    const textoVehiculo = (p) => (p.vehiculos ? `${p.vehiculos.placa} · ${p.vehiculos.marca}` : 'Sin vehículo');

    // ==================================================
    // CARGAR DATOS
    // ==================================================

    async function cargarRegiones() {
        const { data, error } = await db.from('regiones').select('codigo, nombre').order('nombre');
        if (error) {
            console.error('Error al cargar regiones:', error);
            return;
        }
        regiones = data;
        regiones.forEach((r) => filtroRegion.appendChild(new Option(r.nombre, r.codigo)));

        // Admin G2: el filtro queda fijo en su región
        if (regionFija) {
            filtroRegion.value = regionFija;
            filtroRegion.disabled = true;
            filtroRegion.title = 'Solo puedes ver los pilotos de tu región';
        }
    }

    async function cargarPilotos() {
        const { data, error } = await db
            .from('usuarios')
            .select(PLT_COLUMNAS)
            .eq('rol', 'piloto')
            .order('nombre');

        if (error) {
            console.error('Error al cargar pilotos:', error);
            contador.textContent = 'No se pudo cargar la lista.';
            aviso.mostrar('No se pudieron cargar los pilotos. Revisa la conexión.', 'error');
            return;
        }

        // Admin G2: solo los pilotos de su región | Admin G3: solo los de su tienda
        pilotos = regionFija ? data.filter((p) => regionDe(p) === regionFija)
            : tiendaFija ? data.filter((p) => p.tienda_id === tiendaFija)
            : data;
        dibujarTabla();
    }

    // ==================================================
    // TABLA (un grupo por tienda)
    // ==================================================

    function crearFilaPiloto(p) {
        const tr = document.createElement('tr');

        // Mini foto (o iniciales). pintarAvatar está en js/avatar.js
        const tdFoto = document.createElement('td');
        tdFoto.className = 'plt-col-foto';
        const mini = document.createElement('div');
        mini.className = 'avatar avatar-chico';
        pintarAvatar(mini, p.nombre, p.foto_url);
        tdFoto.appendChild(mini);
        tr.appendChild(tdFoto);

        tr.appendChild(crearCelda(p.nombre));
        tr.appendChild(crearCelda(p.id_usuario, 'texto-codigo'));
        tr.appendChild(crearCelda(p.telefono));
        tr.appendChild(crearCelda(p.vehiculos ? textoVehiculo(p) : null));

        // Funciones: pendiente de definir (aquí se asignarán más adelante)
        tr.appendChild(crearCeldaEtiqueta('Por definir', 'etiqueta-gris'));
        return tr;
    }

    function dibujarTabla() {
        const region = filtroRegion.value;
        const filtro = buscador.value.trim();

        const visibles = pilotos.filter((p) =>
            (!region || regionDe(p) === region) &&
            coincideBusqueda([p.nombre, p.id_usuario, p.telefono, textoTienda(p), textoVehiculo(p)], filtro)
        );

        // Se borran los grupos anteriores (queda solo el encabezado <thead>)
        tabla.querySelectorAll('tbody').forEach((tb) => tb.remove());

        if (visibles.length === 0) {
            const tbody = document.createElement('tbody');
            const texto = pilotos.length > 0
                ? 'No hay pilotos que coincidan con el filtro.'
                : 'Aún no hay pilotos. Se crean en Usuarios con el rol "Piloto".';
            tbody.appendChild(crearFilaVacia(texto, PLT_COLUMNAS_TABLA));
            tabla.appendChild(tbody);
        }

        // Agrupar por tienda (ordenadas por código: CEN-001, NOR-001...)
        const grupos = new Map(); // clave: código de tienda -> { tienda, pilotos: [] }
        visibles.forEach((p) => {
            const clave = p.tiendas ? p.tiendas.codigo : '';
            if (!grupos.has(clave)) grupos.set(clave, { tienda: p.tiendas, pilotos: [] });
            grupos.get(clave).pilotos.push(p);
        });

        [...grupos.keys()].sort().forEach((clave) => {
            const { tienda, pilotos: deLaTienda } = grupos.get(clave);
            const tbody = document.createElement('tbody');

            // Título: "TIENDA CENTRAL  CEN-001 ........ Central · 2 pilotos"
            const cuenta = `${tienda ? nombreRegion(tienda.region) + ' · ' : ''}${plural(deLaTienda.length, 'piloto', 'pilotos')}`;
            tbody.appendChild(crearFilaGrupo(
                tienda ? tienda.nombre : 'Sin tienda',
                tienda ? tienda.codigo : '',
                cuenta,
                PLT_COLUMNAS_TABLA
            ));

            deLaTienda.forEach((p) => tbody.appendChild(crearFilaPiloto(p)));
            tabla.appendChild(tbody);
        });

        // "3 pilotos en 2 tiendas"
        const tiendasConPilotos = new Set(pilotos.map((p) => p.tienda_id)).size;
        contador.textContent = `${plural(pilotos.length, 'piloto', 'pilotos')} en ${plural(tiendasConPilotos, 'tienda', 'tiendas')}`;
    }

    filtroRegion.addEventListener('change', dibujarTabla);
    buscador.addEventListener('input', dibujarTabla);

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================

    // Primero las regiones (para los nombres y el filtro), luego los pilotos
    cargarRegiones().then(cargarPilotos);

    // Se ejecuta al salir de la sección (js/pagina_inicial.js)
    return () => aviso.limpiar();
});
