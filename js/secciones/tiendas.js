/* ==================================================
   SECCIÓN: TIENDAS - LÓGICA
   ACACHETE LOGISTICS

   Qué hace (tablas "tiendas" y "regiones" de Supabase, conexión en js/supabase.js):
     - Listar:    tiendas agrupadas por región, con filtro de región y buscador.
                  Muestra cuántos usuarios tiene cada tienda.
     - Crear:     "Nueva tienda" -> región + código LIBRE (sql/01 bloque 28: el
                  código ya no depende de la región; ej. SUC-01, CENTRO, 25).
                  Al elegir la región se sugiere un código (REGIÓN-número libre).
                  "Tiene rutas" (usa_rutas): si envía pedidos; sin rutas no aparece
                  para crear pedidos, rutas ni bodegas del día.
     - Modificar: lápiz -> todo. Cambiar el código no toca a los usuarios
                  (cambiar_codigo_tienda). Cambiar la REGIÓN renombra a sus usuarios
                  (cenjperez01 -> norjperez01; llevan la región) con
                  cambiar_region_tienda.
     - Eliminar:  basurero -> confirmación. Solo si NO tiene usuarios
                  (primero hay que moverlos a otra tienda desde Usuarios).

   Quién puede qué (esAdministrador / esAdminG1 / esAdminG2 en js/sesion.js):
     - Administrador: crear, modificar (incluido el código) y eliminar.
     - Admin G1: crear tiendas y modificar datos (nombre, dirección,
       teléfono, estado). No elimina y no cambia el código de una tienda existente.
     - Admin G2: SOLO VER, y solo las tiendas de SU región.
     - Admin G3: SOLO VER, y solo SU tienda.
     - Empleado: SOLO VER (no aparece "Nueva tienda" ni modificar/eliminar).
     - Piloto: no entra a Tiendas (SECCIONES_POR_ROL en js/sesion.js).

   Clientes: pestaña "Clientes" arriba (secciones/tiendas.html), el botón
   de personas de cada fila (sus clientes) y el de "Nuevo cliente" de cada fila
   (abre el formulario con esa tienda marcada) llevan a js/secciones/clientes.js.
   Cada rol solo ve los clientes de su alcance.
   Empresas: tercera pestaña, solo el Desarrollador (js/secciones/empresas-internas.js).
     ⚠ Esto lo controla la página; la protección real en la base de datos
       llega en la Fase 7 (Supabase Auth).

   Otras reglas:
     - La base de datos valida el formato del código (letras, números y guion,
       hasta 20; sql/01 bloque 28).
     - Una tienda con usuarios no se puede eliminar (la base de datos lo
       impide). Se puede marcar como "Inactiva".
     - Regiones: botón "Regiones" (Administrador y Admin G1). Cada empresa
       tiene las suyas (sql/01 bloque 16); el código no se repite entre empresas.

   Más adelante (según PROPUESTA-ESTRUCTURADA-V2.md) cada tienda se
   enlazará con sus pedidos, solicitudes de transporte y reportes.

   HTML: secciones/tiendas.html
   Estilos: css/secciones/tiendas.css (propios) + css/componentes.css (comunes)
   Funciones comunes (avisos, celdas, botones): js/componentes.js
   ================================================== */

// Columnas que se traen. "usuarios(id)" trae los usuarios de cada tienda para contarlos.
// (No "usuarios(count)": desde sql/01 bloque 20 la página no puede leer la columna clave,
// y count pide permiso sobre toda la tabla -> "permission denied for table usuarios".)
const TND_COLUMNAS = 'id, codigo, region, nombre, direccion, telefono, estado, usuarios(id)';
// usa_rutas: si la tienda envía pedidos (sql/01 bloque 28). Sin la columna, todas envían.
const TND_COLUMNAS_RUTAS = `${TND_COLUMNAS}, usa_rutas`;

// Estado -> texto y color de la etiqueta (clases de css/componentes.css)
const TND_ESTADOS = {
    activa:   { texto: 'Activa',   color: 'etiqueta-verde' },
    inactiva: { texto: 'Inactiva', color: 'etiqueta-gris' },
};

registrarSeccion('tiendas', (zona) => {

    // ---------- Elementos de la página ----------
    const $ = (selector) => zona.querySelector(selector);

    const contador     = $('#tndContador');
    const filtroRegion = $('#tndFiltroRegion');
    const buscador     = $('#tndBuscar');
    const tabla        = $('#tndTabla');
    const botonNueva   = $('#tndNueva');

    const dialogo      = $('#tndDialogo');
    const form         = $('#tndForm');
    const tituloForm   = $('#tndDialogoTitulo');
    const errorForm    = $('#tndFormError');
    const botonGuardar = $('#tndGuardar');
    const avisoCodigo  = $('#tndAvisoCodigo');
    const campos = {
        region:    $('#tndRegion'),
        codigo:    $('#tndCodigo'),
        usaRutas:  $('#tndUsaRutas'),
        nombre:    $('#tndNombre'),
        direccion: $('#tndDireccion'),
        telefono:  $('#tndTelefono'),
        estado:    $('#tndEstado'),
    };

    const confirmar       = $('#tndConfirmar');
    const confirmarTexto  = $('#tndConfirmarTexto');
    const botonSiEliminar = $('#tndSiEliminar');

    // Avisos verdes/rojos (crearAviso está en js/componentes.js)
    const aviso = crearAviso($('#tndAviso'));

    // ---------- Permisos (js/sesion.js) ----------
    const admin = esAdministrador();             // crear, modificar todo, eliminar
    const g1 = esAdminG1();                      // crear y modificar datos
    const puedeCrear = admin || g1;
    const puedeModificar = admin || g1;
    const regionFija = esAdminG2() ? regionActual() : null; // Admin G2: solo su región
    const tiendaFija = esAdminG3() ? tiendaActual() : null; // Admin G3: solo su tienda

    // "Nueva tienda": Administrador y Admin G1
    if (!puedeCrear) botonNueva.hidden = true;

    // ---------- Clientes (sección Clientes, js/secciones/clientes.js) ----------
    // "Agregar clientes" y el botón de clientes de cada fila los ve todo el que
    // entra a Tiendas (los Pilotos no entran). Cada rol ve los clientes de su alcance:
    //   Administrador / G1 -> cualquier tienda | G2 -> su región | Empleado -> su tienda
    const sesionTnd = obtenerSesion();
    const miTienda = sesionTnd && sesionTnd.tienda ? sesionTnd.tienda.id : null;
    const esEmpleado = rolActual() === 'empleado';
    function puedeVerClientesDe(t) {
        if (admin || g1) return true;
        if (regionFija) return t.region === regionFija;
        if (tiendaFija || esEmpleado) return t.id === miTienda; // Admin G3 y Empleado: su tienda
        return false;
    }

    // Número de columnas de la tabla (para las filas que ocupan todo el ancho)
    const columnas = 8;

    // ---------- Estado ----------
    let tiendas = [];        // lista traída de la base de datos
    let regiones = [];       // [{ codigo: 'NOR', nombre: 'Norte' }, ...]
    let editando = null;     // null = creando; objeto = tienda que se modifica
    let eliminandoId = null; // id de la tienda a eliminar (mientras se confirma)
    let tieneUsaRutas = true; // false si falta el bloque 28 de sql/01 (sin la columna usa_rutas)

    // Cantidad de usuarios de una tienda (viene como usuarios: [{ id: 4 }, { id: 9 }])
    const cantidadUsuarios = (t) => (t.usuarios || []).length;

    // Nombre de una región por su código ("NOR" -> "Norte")
    const nombreRegion = (codigo) => (codigo ? (regiones.find((r) => r.codigo === codigo) || {}).nombre || codigo : 'Sin región');

    // Valor del filtro de la cabecera para las tiendas sin región (la región es opcional, sql/01 bloque 31)
    const SIN_REGION = '__sin_region';

    // ==================================================
    // CARGAR DATOS
    // ==================================================

    async function cargarRegiones() {
        const { data, error } = await db.from('regiones').select('codigo, nombre').order('nombre');
        if (error) {
            console.error('Error al cargar regiones:', error);
            aviso.mostrar('No se pudieron cargar las regiones. Revisa la conexión.', 'error');
            return;
        }
        regiones = data;

        // Filtro de la cabecera: "Todas las regiones" + cada región
        regiones.forEach((r) => filtroRegion.appendChild(new Option(r.nombre, r.codigo)));
        filtroRegion.appendChild(new Option('Sin región', SIN_REGION));

        // Admin G2: el filtro queda fijo en su región
        if (regionFija) {
            filtroRegion.value = regionFija;
            filtroRegion.disabled = true;
            filtroRegion.title = 'Solo puedes ver las tiendas de tu región';
        }

        // Selector del formulario
        campos.region.replaceChildren(new Option('Sin región', ''));
        regiones.forEach((r) => campos.region.appendChild(new Option(`${r.nombre} (${r.codigo})`, r.codigo)));
    }

    async function cargarTiendas() {
        let { data, error } = await db.from('tiendas').select(TND_COLUMNAS_RUTAS).order('codigo');
        tieneUsaRutas = !(error && error.code === '42703');
        if (!tieneUsaRutas) ({ data, error } = await db.from('tiendas').select(TND_COLUMNAS).order('codigo'));
        if (error) {
            console.error('Error al cargar tiendas:', error);
            contador.textContent = 'No se pudo cargar la lista.';
            aviso.mostrar('No se pudieron cargar las tiendas. Revisa la conexión.', 'error');
            return;
        }
        // Admin G2: solo las tiendas de su región | Admin G3: solo la suya
        tiendas = regionFija ? data.filter((t) => t.region === regionFija)
            : tiendaFija ? data.filter((t) => t.id === tiendaFija)
            : data;

        // Admin G3: el filtro de región no aplica (solo ve una tienda)
        if (tiendaFija) filtroRegion.hidden = true;
        dibujarTabla();
    }

    // ==================================================
    // TABLA (un grupo por región)
    // ==================================================

    // Fila con el título de la región: "NORTE  NOR ........ 2 tiendas"
    // (crearFilaGrupo y plural están en js/componentes.js)
    function crearFilaRegion(region, cantidad) {
        return crearFilaGrupo(nombreRegion(region), region || '', plural(cantidad, 'tienda', 'tiendas'), columnas);
    }

    function crearFilaTienda(t) {
        const tr = document.createElement('tr');
        const usuariosTienda = cantidadUsuarios(t);
        const estado = TND_ESTADOS[t.estado] || { texto: t.estado, color: 'etiqueta-gris' };

        tr.appendChild(crearCelda(t.codigo, 'texto-codigo'));
        tr.appendChild(crearCelda(t.nombre));
        tr.appendChild(crearCelda(t.direccion));
        tr.appendChild(crearCelda(t.telefono));
        tr.appendChild(crearCelda(usuariosTienda, 'tnd-col-numero'));
        tr.appendChild(t.usa_rutas === false ? crearCeldaEtiqueta('Sin rutas', 'etiqueta-gris') : crearCeldaEtiqueta('Con rutas', 'etiqueta-azul'));
        tr.appendChild(crearCeldaEtiqueta(estado.texto, estado.color));

        // Acciones:
        //   clientes de la tienda -> según alcance (puedeVerClientesDe)
        //   modificar             -> Administrador y Admin G1
        //   eliminar              -> solo Administrador
        const botones = [];
        if (puedeVerClientesDe(t)) {
            // QR de marcas del mes (js/qr.js): se imprime y los pilotos lo escanean al llegar
            botones.push(crearBotonIcono('qr', t.id, 'bi-qr-code', `QR de marcas del mes de ${t.codigo}`));
            botones.push(crearBotonIcono('ver', t.id, 'bi-people', `Clientes de ${t.codigo}`));
            // Nuevo cliente ya marcado en esta tienda (#clientes?tienda=ID&nuevo=1)
            botones.push(crearBotonIcono('cliente', t.id, 'bi-person-plus', `Nuevo cliente en ${t.codigo}`));
        }
        if (puedeModificar) {
            botones.push(crearBotonIcono('editar', t.id, 'bi-pencil', `Modificar ${t.nombre}`));
        }
        if (admin) {
            // Motivo por el que no se puede eliminar (o null si se puede)
            const noEliminable = usuariosTienda > 0
                ? `No se puede eliminar: tiene ${plural(usuariosTienda, 'usuario asignado', 'usuarios asignados')}. Muévelos a otra tienda desde Usuarios.`
                : null;
            botones.push(crearBotonIcono('eliminar', t.id, 'bi-trash3', noEliminable || `Eliminar ${t.nombre}`, !!noEliminable));
        }
        tr.appendChild(crearCeldaAcciones(...botones));
        return tr;
    }

    // Dibuja la tabla según el filtro de región y el buscador
    function dibujarTabla() {
        const region = filtroRegion.value;
        const filtro = buscador.value.trim();

        const visibles = tiendas.filter((t) =>
            (!region || (region === SIN_REGION ? !t.region : t.region === region)) &&
            coincideBusqueda([t.codigo, t.nombre, t.direccion, t.telefono, nombreRegion(t.region)], filtro)
        );

        // Se borran los grupos anteriores (se deja solo el encabezado <thead>)
        tabla.querySelectorAll('tbody').forEach((tb) => tb.remove());

        if (visibles.length === 0) {
            const tbody = document.createElement('tbody');
            const texto = tiendas.length > 0
                ? 'No hay tiendas que coincidan con el filtro.'
                : admin ? 'Aún no hay tiendas. Crea la primera con "Nueva tienda".' : 'Aún no hay tiendas.';
            tbody.appendChild(crearFilaVacia(texto, columnas));
            tabla.appendChild(tbody);
        }

        // Un <tbody> por región, en el orden de la lista de regiones.
        // Las regiones sin tiendas visibles no se muestran. Al final, las tiendas sin región (null).
        const ordenRegiones = [...regiones.map((r) => r.codigo),
            ...new Set(visibles.map((t) => t.region).filter((c) => c && !regiones.some((r) => r.codigo === c))), null];

        ordenRegiones.forEach((codigoRegion) => {
            const deLaRegion = visibles.filter((t) => (t.region || null) === codigoRegion);
            if (deLaRegion.length === 0) return;

            const tbody = document.createElement('tbody');
            tbody.appendChild(crearFilaRegion(codigoRegion, deLaRegion.length));
            deLaRegion.forEach((t) => tbody.appendChild(crearFilaTienda(t)));
            tabla.appendChild(tbody);
        });

        // "3 tiendas en 2 regiones"
        const regionesConTiendas = new Set(tiendas.map((t) => t.region).filter(Boolean)).size;
        contador.textContent = `${plural(tiendas.length, 'tienda', 'tiendas')} en ${plural(regionesConTiendas, 'región', 'regiones')}`;
    }

    filtroRegion.addEventListener('change', dibujarTabla);
    buscador.addEventListener('input', dibujarTabla);

    // Un solo "escuchador" para todos los botones de la tabla
    tabla.addEventListener('click', (evento) => {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton || boton.disabled) return;

        const tienda = tiendas.find((t) => t.id === Number(boton.dataset.id));
        if (!tienda) return;

        // Clientes de la tienda: abre la sección Clientes filtrada (#clientes?tienda=ID)
        if (boton.dataset.accion === 'ver' && puedeVerClientesDe(tienda)) location.hash = `clientes?tienda=${tienda.id}`;
        if (boton.dataset.accion === 'cliente' && puedeVerClientesDe(tienda)) location.hash = `clientes?tienda=${tienda.id}&nuevo=1`;
        if (boton.dataset.accion === 'qr' && puedeVerClientesDe(tienda)) mostrarQrMarcas(tienda);
        if (boton.dataset.accion === 'editar' && puedeModificar) abrirFormulario(tienda);
        if (boton.dataset.accion === 'eliminar' && admin) pedirConfirmacion(tienda);
    });

    // QR de marcas del mes de una tienda (sql: qr_marca_mes). Cambia solo el día 1 de cada mes:
    // el del mes anterior deja de servir. Los pilotos lo escanean al llegar ("Escanear QR")
    async function mostrarQrMarcas(t) {
        const { data, error } = await db.rpc('qr_marca_mes', { p_tienda: t.id });
        if (error) {
            console.error('Error al obtener el QR de marcas:', error);
            aviso.mostrar(error.code === 'PGRST202' || error.code === '42883'
                ? 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 14: QR).'
                : 'No se pudo obtener el QR de marcas.', 'error');
            return;
        }
        const mes = new Date().toLocaleDateString('es-CR', { month: 'long', year: 'numeric' });
        mostrarQrEnVentana({ // js/qr.js
            titulo: `QR de marcas · ${t.codigo}`,
            subtitulo: `${t.nombre} · válido en ${mes}`,
            texto: data,
            nota: 'Imprímelo y déjalo visible en la tienda: el piloto lo escanea al llegar para marcar su horario. ' +
                'Cambia cada mes; el día 1 imprime el nuevo.',
            archivo: `qr-marcas-${t.codigo}-${new Date().toISOString().slice(0, 7)}`,
        });
    }

    // ==================================================
    // CÓDIGO DE LA TIENDA (libre; la región va aparte, sql/01 bloque 28)
    // ==================================================

    // Letras, números y guion; de 1 a 20; en mayúsculas (regla tiendas_codigo_formato)
    const TND_CODIGO_VALIDO = /^[A-Z0-9][A-Z0-9-]{0,19}$/;
    const codigoDelFormulario = () => campos.codigo.value.trim().toUpperCase();

    // Sugerencia: REGIÓN-siguiente número libre (ej. si existen NOR-001 y NOR-003 -> "NOR-004");
    // sin región: SUC-001, SUC-002... Solo es una sugerencia: se puede cambiar por cualquier otro.
    function codigoSugerido(region) {
        region = region || 'SUC';
        const patron = new RegExp(`^${region}-(\\d{1,3})$`);
        const usados = tiendas.map((t) => (patron.exec(t.codigo) || [])[1]).filter(Boolean).map(Number);
        const siguiente = (usados.length ? Math.max(...usados) : 0) + 1;
        return siguiente > 999 ? '' : `${region}-${String(siguiente).padStart(3, '0')}`;
    }

    // Si se está cambiando la REGIÓN de una tienda con usuarios: advertencia de que se renombran
    function actualizarVistaPrevia() {
        const usuariosTienda = editando ? cantidadUsuarios(editando) : 0;
        const region = campos.region.value || null;
        const cambia = editando && region !== (editando.region || null);
        avisoCodigo.hidden = !(cambia && usuariosTienda > 0);
        if (!avisoCodigo.hidden) {
            // Sin región el usuario no lleva prefijo (jperez01)
            const prefijo = (r) => (r ? `${prefijoUsuario(r)}…` : 'sin prefijo de región');
            avisoCodigo.textContent =
                `Al guardar, ${usuariosTienda === 1 ? 'el usuario' : `los ${usuariosTienda} usuarios`} de esta tienda cambiará` +
                `${usuariosTienda === 1 ? '' : 'n'} de ${prefijo(editando.region)} a ${prefijo(region)} ` +
                `y deberá${usuariosTienda === 1 ? '' : 'n'} iniciar sesión con el usuario nuevo.`;
        }
    }

    // Al crear: al elegir la región se sugiere un código (si no se escribió uno a mano)
    let codigoTocado = false;
    campos.region.addEventListener('change', () => {
        if (!editando && !codigoTocado) campos.codigo.value = codigoSugerido(campos.region.value);
        actualizarVistaPrevia();
    });

    campos.codigo.addEventListener('input', () => {
        codigoTocado = true;
        campos.codigo.value = campos.codigo.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
    });

    // ==================================================
    // CREAR Y MODIFICAR (Administrador y Admin G1; solo el Administrador cambia código y región)
    // ==================================================

    // tienda = null -> crear; tienda = objeto -> modificar
    function abrirFormulario(tienda = null) {
        editando = tienda;
        codigoTocado = false;
        form.reset();
        errorForm.textContent = '';
        tituloForm.textContent = tienda ? 'Modificar tienda' : 'Nueva tienda';

        if (tienda) {
            campos.region.value    = tienda.region || '';
            campos.codigo.value    = tienda.codigo || '';
            campos.nombre.value    = tienda.nombre || '';
            campos.direccion.value = tienda.direccion || '';
            campos.telefono.value  = tienda.telefono || '';
            campos.estado.value    = tienda.estado || 'activa';
            campos.usaRutas.checked = tienda.usa_rutas !== false;
        } else {
            campos.usaRutas.checked = true;
            // Si hay una región filtrada, se propone esa
            if (filtroRegion.value && filtroRegion.value !== SIN_REGION) campos.region.value = filtroRegion.value;
            campos.codigo.value = codigoSugerido(campos.region.value);
        }
        // Sin el bloque 28 no existe usa_rutas: no se muestra la casilla
        $('#tndRutasCaja').hidden = !tieneUsaRutas;

        // Código y región se eligen al crear. En una tienda existente solo el Administrador los cambia.
        const bloquear = !!tienda && !admin;
        const motivo = bloquear ? 'Solo el Administrador puede cambiar el código o la región de la tienda' : '';
        campos.region.disabled = bloquear;
        campos.codigo.disabled = bloquear;
        campos.region.title = motivo;
        campos.codigo.title = motivo;

        actualizarVistaPrevia();
        dialogo.showModal();
        (tienda ? campos.nombre : campos.region).focus();
    }

    botonNueva.addEventListener('click', () => {
        if (puedeCrear) abrirFormulario();
    });
    $('#tndCancelar').addEventListener('click', () => dialogo.close());

    function fallo(mensaje, campo) {
        errorForm.textContent = mensaje;
        campo.focus();
        return null;
    }

    // Lee y valida el formulario. Devuelve los datos o null si hay error.
    function leerFormulario() {
        const nombre = campos.nombre.value.trim();
        const codigo = codigoDelFormulario();

        if (!TND_CODIGO_VALIDO.test(codigo)) {
            return fallo('El código: letras, números y guion (hasta 20), sin espacios. Ej. SUC-01.', campos.codigo);
        }
        if (!nombre) return fallo('Escribe el nombre de la tienda.', campos.nombre);

        const datos = {
            codigo,
            region: campos.region.value || null, // opcional (sql/01 bloque 31)
            nombre,
            direccion: campos.direccion.value.trim() || null,
            telefono: campos.telefono.value.trim() || null,
            estado: campos.estado.value,
        };
        if (tieneUsaRutas) datos.usa_rutas = campos.usaRutas.checked;
        return datos;
    }

    // Traduce los errores de la base de datos a mensajes entendibles
    function mensajeDeError(error) {
        if (error.code === '23505') return 'Ya existe una tienda con ese código (o un usuario con ese nombre). Usa otro código.';
        if (error.code === '23514') return 'El código no es válido: letras, números y guion (hasta 20). Si el formato viejo REGIÓN-000 lo rechaza, falta ejecutar sql/01 (bloque 28).';
        if (error.code === '23502') return 'Para guardar una tienda sin región falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 31).';
        if (error.code === 'P0002') return 'La tienda ya no existe. Recarga la página.';
        if (error.code === 'P0001') return error.message;
        if (error.code === 'PGRST202' || error.code === '42883') return 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 28: código y región de la tienda).';
        return 'No se pudo guardar. Revisa la conexión e intenta de nuevo.';
    }

    // Guarda: crea la tienda, o la modifica. El código y la región se cambian con sus
    // funciones (la región renombra a los usuarios de la tienda); luego el resto.
    async function guardar(datos) {
        if (!editando) {
            return db.from('tiendas').insert(datos);
        }

        // 1. Código (no toca a los usuarios)
        if (datos.codigo !== editando.codigo) {
            const { error } = await db.rpc('cambiar_codigo_tienda', { p_tienda_id: editando.id, p_nuevo_codigo: datos.codigo });
            if (error) return { error };
        }
        // 2. Región (renombra a sus usuarios: llevan la región)
        if (datos.region !== (editando.region || null)) {
            const { error } = await db.rpc('cambiar_region_tienda', { p_tienda_id: editando.id, p_region: datos.region });
            if (error) return { error };
        }

        // 3. El resto de los datos
        const { codigo, region, ...resto } = datos;
        return db.from('tiendas').update(resto).eq('id', editando.id);
    }

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        // Crear y modificar: Administrador y Admin G1
        if (editando ? !puedeModificar : !puedeCrear) return;
        errorForm.textContent = '';

        const datos = leerFormulario();
        if (!datos) return;

        // El Admin G1 nunca cambia el código ni la región (por si acaso, se fuerzan los originales)
        if (!admin && editando) {
            datos.codigo = editando.codigo;
            datos.region = editando.region || null;
        }

        botonGuardar.disabled = true;
        botonGuardar.textContent = 'Guardando...';

        const { error } = await guardar(datos);

        botonGuardar.disabled = false;
        botonGuardar.textContent = 'Guardar';

        if (error) {
            console.error('Error al guardar tienda:', error);
            errorForm.textContent = mensajeDeError(error);
            return;
        }

        // Mensaje según lo que se hizo
        let mensaje = `Tienda ${datos.codigo} creada.`;
        if (editando) {
            const usuariosTienda = cantidadUsuarios(editando);
            const partes = [];
            if (datos.codigo !== editando.codigo) partes.push(`Tienda ${editando.codigo} ahora es ${datos.codigo}.`);
            if (datos.region !== (editando.region || null)) {
                partes.push((datos.region ? `Ahora es de la región ${nombreRegion(datos.region)}.` : 'Ahora no tiene región.') +
                    (usuariosTienda ? ` ${plural(usuariosTienda, 'usuario renombrado', 'usuarios renombrados')}.` : ''));
            }
            mensaje = partes.join(' ') || `Tienda "${datos.nombre}" actualizada.`;
        }

        dialogo.close();
        aviso.mostrar(mensaje);
        cargarTiendas();
    });

    // ==================================================
    // ELIMINAR (con confirmación, solo administrador)
    // ==================================================

    function pedirConfirmacion(tienda) {
        eliminandoId = tienda.id;
        confirmarTexto.textContent = `¿Seguro que quieres eliminar la tienda "${tienda.nombre}" (${tienda.codigo})? Esta acción no se puede deshacer.`;
        confirmar.showModal();
    }

    $('#tndNoEliminar').addEventListener('click', () => confirmar.close());

    botonSiEliminar.addEventListener('click', async () => {
        const tienda = tiendas.find((t) => t.id === eliminandoId);
        if (!admin || !tienda) return confirmar.close();

        botonSiEliminar.disabled = true;
        botonSiEliminar.textContent = 'Eliminando...';

        const { error } = await db.from('tiendas').delete().eq('id', eliminandoId);

        botonSiEliminar.disabled = false;
        botonSiEliminar.textContent = 'Eliminar';
        confirmar.close();

        if (error) {
            console.error('Error al eliminar tienda:', error);
            // 23503 = tiene usuarios enlazados (la base de datos no deja borrarla)
            aviso.mostrar(error.code === '23503'
                ? 'No se puede eliminar: la tienda tiene usuarios asignados. Muévelos a otra tienda desde Usuarios.'
                : 'No se pudo eliminar la tienda. Intenta de nuevo.', 'error');
            return;
        }

        aviso.mostrar(`Tienda ${tienda.codigo} eliminada.`);
        cargarTiendas();
    });

    // ==================================================
    // REGIONES DE LA EMPRESA (Administrador y Admin G1; sql/01 bloque 16)
    // Las regiones se leen y se crean en la empresa activa (js/supabase.js).
    // Una región con tiendas no se elimina (la base lo impide).
    // ==================================================

    const dlgRegiones = $('#tndRegDialogo');
    const errorReg = $('#tndRegError');
    const botonRegiones = $('#tndRegiones');
    botonRegiones.hidden = !puedeModificar;

    function dibujarRegiones() {
        const cuerpo = $('#tndRegLista');
        cuerpo.replaceChildren();
        if (!regiones.length) {
            cuerpo.appendChild(crearFilaVacia('Esta empresa todavía no tiene regiones: agrega la primera.', 4));
            return;
        }
        regiones.forEach((r) => {
            const tr = document.createElement('tr');
            const enUso = tiendas.filter((t) => t.region === r.codigo).length;
            tr.appendChild(crearCelda(r.codigo, 'texto-codigo'));
            tr.appendChild(crearCelda(r.nombre));
            tr.appendChild(crearCelda(enUso, 'tnd-col-numero'));
            tr.appendChild(crearCeldaAcciones(
                crearBotonIcono('editar', r.codigo, 'bi-pencil', `Cambiar el nombre de ${r.nombre}`),
                crearBotonIcono('eliminar', r.codigo, 'bi-trash3',
                    enUso ? 'No se puede eliminar: tiene tiendas.' : `Eliminar ${r.nombre}`, enUso > 0)));
            cuerpo.appendChild(tr);
        });
    }

    async function recargarRegiones() {
        filtroRegion.querySelectorAll('option:not([value=""])').forEach((o) => o.remove());
        await cargarRegiones();
        dibujarRegiones();
        dibujarTabla();
    }

    botonRegiones.addEventListener('click', () => {
        errorReg.textContent = '';
        $('#tndRegForm').reset();
        dibujarRegiones();
        dlgRegiones.showModal();
        $('#tndRegCodigo').focus();
    });
    $('#tndRegCerrar').addEventListener('click', () => dlgRegiones.close());
    $('#tndRegCodigo').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });

    $('#tndRegForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        errorReg.textContent = '';
        const codigo = $('#tndRegCodigo').value.trim();
        const nombre = $('#tndRegNombre').value.trim();
        if (!/^[A-Z]{3}$/.test(codigo)) {
            errorReg.textContent = 'El código son 3 letras (ej. NOR).';
            $('#tndRegCodigo').focus();
            return;
        }
        if (!nombre) {
            errorReg.textContent = 'Escribe el nombre de la región.';
            $('#tndRegNombre').focus();
            return;
        }
        const { error } = await db.from('regiones').insert({ codigo, nombre });
        if (error) {
            console.error('Error al crear la región:', error);
            errorReg.textContent = error.code === '23505'
                ? 'Ese código ya existe (en esta u otra empresa). Usa otro.'
                : error.code === '42501' ? 'Falta ejecutar sql/01 (bloque 16) para crear regiones desde aquí.'
                : 'No se pudo guardar la región.';
            return;
        }
        $('#tndRegForm').reset();
        aviso.mostrar(`Región ${codigo} creada.`);
        recargarRegiones();
    });

    $('#tndRegLista').addEventListener('click', async (evento) => {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton || boton.disabled) return;
        const region = regiones.find((r) => r.codigo === boton.dataset.id);
        if (!region) return;
        errorReg.textContent = '';
        if (boton.dataset.accion === 'editar') {
            const nombre = (prompt(`Nombre de la región ${region.codigo}:`, region.nombre) || '').trim();
            if (!nombre || nombre === region.nombre) return;
            const { error } = await db.from('regiones').update({ nombre }).eq('codigo', region.codigo);
            if (error) {
                console.error('Error al modificar la región:', error);
                errorReg.textContent = 'No se pudo cambiar el nombre.';
                return;
            }
        }
        if (boton.dataset.accion === 'eliminar') {
            if (!confirm(`¿Eliminar la región ${region.nombre} (${region.codigo})?`)) return;
            const { error } = await db.from('regiones').delete().eq('codigo', region.codigo);
            if (error) {
                console.error('Error al eliminar la región:', error);
                errorReg.textContent = error.code === '23503'
                    ? 'No se puede eliminar: tiene tiendas o usuarios (Admin G2).'
                    : 'No se pudo eliminar la región.';
                return;
            }
        }
        recargarRegiones();
    });

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================

    // Primero las regiones (se necesitan para agrupar), luego las tiendas
    cargarRegiones().then(cargarTiendas);

    // Se ejecuta al salir de la sección (js/pagina_inicial.js)
    return () => {
        aviso.limpiar();
        if (dialogo.open) dialogo.close();
        if (confirmar.open) confirmar.close();
        if (dlgRegiones.open) dlgRegiones.close();
    };
});
