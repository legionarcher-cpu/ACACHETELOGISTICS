/* ==================================================
   SECCIÓN: USUARIOS - LÓGICA
   ACACHETE LOGISTICS

   Qué hace (tabla "usuarios" de Supabase, conexión en js/supabase.js):
     - Listar:    muestra todos los usuarios con su rol y tienda (con buscador).
     - Crear:     botón "Nuevo usuario" -> formulario -> insert.
     - Modificar: icono del lápiz -> mismo formulario con los datos -> update.
     - Eliminar:  icono del basurero -> ventana de confirmación -> delete.
     - Foto:      en el formulario, "Elegir foto" / "Quitar". Se aplica al
                  presionar Guardar. Funciones en js/avatar.js (bucket "avatares").
     - Vehículo:  solo para Pilotos. Se elige uno de la tabla "vehiculos" (agrupados
                  por tipo: camión, pick-up, panel, moto) o se registra uno nuevo
                  (tipo + marca + placa) desde el mismo formulario
                  (sql/00, sección 2).

   Roles (ver PROPUESTA-ESTRUCTURADA-V2.md, sección 13.1). Todos llevan al final
   el ID de su EMPRESA ("01", sql/01 bloque 16):
     administrador -> sin tienda. Usuario: "jperez01" ("admin" no cambia)
     admin_g1      -> sin tienda (todo el país). Usuario: "jlopez01"
     admin_g2      -> sin tienda, con REGIÓN. Usuario: "mruiz01"
     admin_g3      -> con tienda (admin local). Usuario compuesto: "cenmlopez01"
     empleado      -> con tienda. Usuario compuesto: "cenjperez01"
     piloto        -> con tienda. Usuario compuesto: "cenlgarcia01"

   Empresa: cada usuario es de UNA empresa y solo ve los de su empresa (filtro de
   js/supabase.js). Al crear o modificar un Administrador o Admin G1, el
   Desarrollador elige la empresa por su ID (campo "Empresa"); los demás roles
   quedan en la empresa de su tienda o región. Un Administrador crea en la suya.

   Quién puede qué en esta sección (según el rol del usuario conectado):
     administrador -> crear, modificar y eliminar a cualquiera (cualquier rol).
                      Es el ÚNICO que asigna roles de administración.
     admin_g1      -> crear, modificar y eliminar SOLO Empleados y Pilotos
                      (de cualquier tienda). Los administradores los ve,
                      pero no los puede tocar.
     admin_g2      -> crear, modificar y eliminar SOLO Empleados y Pilotos
                      de las tiendas de SU región. Solo ve esos usuarios.
     admin_g3      -> solo ve a los usuarios de SU tienda. Solo CREA
                      Empleados de su tienda, y quedan PENDIENTES (no pueden
                      iniciar sesión) hasta que los apruebe un Admin G2 de la
                      región, un Admin G1 o el Administrador (botón "Revisar").
                      No modifica ni elimina usuarios.
     empleado / piloto -> solo ver la lista.

   Aprobación de usuarios (columna aprobado): false mientras está pendiente.
     Aprobar -> puede iniciar sesión | Rechazar -> el usuario se elimina.
     Notificaciones (js/notificaciones.js): al crearlo se avisa a quienes lo
     aprueban; al aprobar/rechazar se avisa al Admin G3 que lo creó.
     ⚠ Lo controla la página; la regla real llega en la Fase 7.

   Usuario compuesto: en el formulario se escribe solo "jperez"; el prefijo
   de la región de su tienda ("cen", sin el número de la tienda) y el ID de la empresa ("01") los agrega este archivo
   al guardar (usuarioCompuesto, js/componentes.js).
   La lista de tiendas se lee de la tabla "tiendas" (solo lectura aquí).

   Reglas:
     - El usuario se guarda en minúsculas y sin espacios
       (el login lo compara así, ver js/secciones/loggin.js).
     - La clave NUNCA se trae a la página. Al modificar, si el campo
       clave se deja vacío, se conserva la clave actual.
     - No se puede eliminar ni cambiar el rol del usuario con el que
       se inició sesión (para no quedarse sin acceso).
     - El usuario "admin" está protegido: no se puede eliminar ni
       cambiarle el usuario o el rol (ver USR_PROTEGIDO).

   ⚠ VERSIÓN RÁPIDA: cualquiera con la página puede hacer estos
   cambios (reglas temporales, sql/00 sección 10).

   HTML: secciones/usuarios.html
   Estilos: css/secciones/usuarios.css (propios) + css/componentes.css (comunes)
   ================================================== */

// Columnas que se traen (la clave NO). "tiendas(codigo, nombre)" trae
// también los datos de la tienda enlazada por tienda_id.
// "regiones(nombre)" trae el nombre de la región del Admin G2.
// "vehiculos(placa, marca)" trae el vehículo asignado al piloto.
// "solicitante:usuarios!solicitado_por(nombre)" = quién creó un usuario pendiente.
const USR_COLUMNAS = 'id, nombre, id_usuario, telefono, rol, tienda_id, region, vehiculo_id, permisos, foto_url, ' +
    'aprobado, solicitado_por, solicitado_en, ' +
    'tiendas(codigo, nombre, region), regiones(nombre), vehiculos(placa, marca, tipo), ' +
    'solicitante:usuarios!solicitado_por(nombre)';

// Valor especial del selector de vehículo para registrar uno nuevo
const USR_VEHICULO_NUEVO = 'nuevo';

// Tipos de vehículo (los mismos de Configuración -> Vehículos y de la regla vehiculos_tipo_valido)
const USR_TIPOS_VEHICULO = { camion: 'Camión', pickup: 'Pick-up', panel: 'Panel', moto: 'Moto', auto: 'Automóvil', microbus: 'Microbús' };

// Nombre para mostrar de cada rol (el valor guardado es la clave)
const USR_ROLES = {
    administrador: 'Administrador',
    admin_g1: 'Admin G1',
    admin_g2: 'Admin G2',
    admin_g3: 'Admin G3',
    empleado: 'Empleado',
    piloto: 'Piloto',
};

// Color de la etiqueta de cada rol en la tabla (clases de css/componentes.css)
const USR_COLOR_ROL = {
    administrador: 'etiqueta-naranja',
    admin_g1: 'etiqueta-morada',
    admin_g2: 'etiqueta-turquesa',
    admin_g3: 'etiqueta-rosada',
    empleado: 'etiqueta-azul',
    piloto: 'etiqueta-verde',
};

// Roles que NO llevan tienda (usuario sin prefijo de tienda: "jperez01")
const USR_ROLES_SIN_TIENDA = ['administrador', 'admin_g1', 'admin_g2'];

// Roles a los que el Desarrollador les elige la empresa (los demás la toman de su tienda o región)
const USR_ROLES_CON_EMPRESA = ['administrador', 'admin_g1'];

// Roles de "personal" que Admin G1 y Admin G2 pueden crear, modificar y eliminar.
// Los roles de administración solo los asigna el Administrador.
const USR_ROLES_PERSONAL = ['empleado', 'piloto'];

// Tiempo que se muestra el aviso verde de "Usuario creado", etc. (ms)
const USR_DURACION_AVISO = 4000;

// Usuario protegido: no se puede eliminar ni cambiarle el usuario o el rol.
// La base de datos también lo impide (trigger proteger_admin, sql/00 sección 3).
const USR_PROTEGIDO = 'admin';

registrarSeccion('usuarios', (zona) => {

    // ---------- Elementos de la página ----------
    const $ = (selector) => zona.querySelector(selector);

    const contador   = $('#usrContador');
    const buscador   = $('#usrBuscar');
    const filtroRegion = $('#usrFiltroRegion');
    const filtroTienda = $('#usrFiltroTienda');
    const filtroRol    = $('#usrFiltroRol');
    const cuerpo     = $('#usrCuerpo');

    // Avisos verdes/rojos (crearAviso está en js/componentes.js)
    const aviso = crearAviso($('#usrAviso'), USR_DURACION_AVISO);
    const mostrarAviso = aviso.mostrar;

    const dialogo      = $('#usrDialogo');
    const form         = $('#usrForm');
    const tituloForm   = $('#usrDialogoTitulo');
    const errorForm    = $('#usrFormError');
    const botonGuardar = $('#usrGuardar');
    const campos = {
        nombre:     $('#usrNombre'),
        rol:        $('#usrRol'),
        tienda:     $('#usrTienda'),
        region:     $('#usrRegion'),
        vehiculo:   $('#usrVehiculo'),
        vehTipo:    $('#usrVehTipo'),
        vehMarca:   $('#usrVehMarca'),
        vehPlaca:   $('#usrVehPlaca'),
        id_usuario: $('#usrIdUsuario'),
        clave:      $('#usrClave'),
        telefono:   $('#usrTelefono'),
        permisos:   $('#usrPermisos'),
    };
    const prefijo           = $('#usrPrefijo');
    const sufijo            = $('#usrSufijo');
    const vistaPrevia       = $('#usrVistaPrevia');
    const campoEmpresa      = $('#usrCampoEmpresa');
    const selEmpresa        = $('#usrEmpresa');
    const tiendaObligatoria = $('#usrTiendaObligatoria');
    const campoTienda       = $('#usrCampoTienda');
    const campoRegion       = $('#usrCampoRegion');
    const campoVehiculo     = $('#usrCampoVehiculo');
    const campoMultitienda  = $('#usrCampoMultitienda');
    const casillaMultitienda = $('#usrMultitienda');
    const avisoCambioTienda = $('#usrAvisoCambioTienda');
    const vehiculoNuevo     = $('#usrVehiculoNuevo');
    const claveObligatoria  = $('#usrClaveObligatoria');
    const claveAyuda        = $('#usrClaveAyuda');

    const fotoAvatar  = $('#usrFotoAvatar');
    const fotoArchivo = $('#usrFotoArchivo');
    const fotoQuitar  = $('#usrFotoQuitar');

    const confirmar       = $('#usrConfirmar');
    const confirmarTexto  = $('#usrConfirmarTexto');
    const botonSiEliminar = $('#usrSiEliminar');

    const revisar      = $('#usrRevisar');
    const revisarTexto = $('#usrRevisarTexto');

    // ---------- Estado ----------
    let usuarios = [];       // lista traída de la base de datos
    let tiendas = [];        // tiendas para el selector del formulario
    let editandoId = null;   // null = creando; número = id del usuario que se modifica
    let eliminandoId = null; // id del usuario a eliminar (mientras se confirma)
    let revisando = null;    // usuario pendiente que se está revisando
    let vehiculoPorRegistrar = null; // { marca, placa } si en el formulario se registra un vehículo nuevo
    let usuarioEditando = null;      // usuario tal como estaba antes de modificarlo
    let hayMultitienda = false;      // true si existe la columna multitienda
    let empresas = [];               // solo el Desarrollador: [{ id, codigo, nombre, activa }]

    // Foto en el formulario (se aplica al guardar)
    let fotoActual = null;   // enlace de la foto que ya tiene el usuario
    let fotoElegida = null;  // archivo nuevo elegido (aún sin subir)
    let quitarFoto = false;  // true = al guardar se borra la foto actual
    let fotoPrevia = null;   // enlace temporal para ver la foto elegida antes de subirla

    const sesion = obtenerSesion(); // usuario que inició sesión (js/sesion.js)

    // ==================================================
    // PERMISOS DEL USUARIO CONECTADO (esAdministrador / esAdminG1 en js/sesion.js)
    // ==================================================

    const admin = esAdministrador();
    const g1 = esAdminG1();
    const g2 = esAdminG2();
    const g3 = esAdminG3();
    const miRegion = regionActual(); // solo Admin G2 (ej. 'NOR')
    const miTienda = tiendaActual(); // Admin G3 (y empleados/pilotos)
    const puedeGestionarUsuarios = admin || g1 || g2;           // modificar / eliminar
    const puedeCrearUsuarios = puedeGestionarUsuarios || g3;    // crear (G3: con aprobación)

    // Región de la tienda de un usuario (Admin G3, empleados y pilotos), ej. 'NOR'
    const regionDeUsuario = (u) => (u.tiendas ? u.tiendas.region : null);

    // ¿Puede aprobar o rechazar a este usuario pendiente?
    //   Administrador, Admin G1 o el Admin G2 de la región de su tienda
    const puedeAprobar = (u) =>
        u.aprobado === false && (admin || g1 || (g2 && regionDeUsuario(u) === miRegion));

    // ¿El usuario conectado puede modificar o eliminar a este usuario?
    //   Administrador -> a cualquiera
    //   Admin G1      -> solo Empleados y Pilotos
    //   Admin G2      -> solo Empleados y Pilotos de SU región
    function puedeGestionar(u) {
        if (admin) return true;
        if (g1) return USR_ROLES_PERSONAL.includes(u.rol);
        if (g2) return USR_ROLES_PERSONAL.includes(u.rol) && regionDeUsuario(u) === miRegion;
        return false;
    }

    // Empleados y pilotos: solo ven la lista (sin "Nuevo usuario" ni acciones)
    if (!puedeCrearUsuarios) {
        $('#usrNuevo').hidden = true;
        $('.usr-tabla th.tabla-col-acciones').remove();
    }

    // Solo el Administrador asigna roles de administración:
    //   Admin G1 / G2 -> Empleado y Piloto
    //   Admin G3      -> solo Empleado
    if (!admin) {
        const permitidos = g3 ? ['empleado'] : USR_ROLES_PERSONAL;
        [...campos.rol.options].forEach((opcion) => {
            if (!permitidos.includes(opcion.value)) opcion.remove();
        });
    }

    // Número de columnas de la tabla (para las filas que ocupan todo el ancho)
    const columnasTabla = puedeCrearUsuarios ? 9 : 8;

    // ==================================================
    // CARGAR DATOS (usuarios, tiendas y regiones)
    // ==================================================

    async function cargarUsuarios() {
        // Con la columna "multitienda". Si la base todavía no la tiene, se
        // carga sin ella y la casilla "Piloto multitienda" no aparece.
        let { data, error } = await db
            .from('usuarios')
            .select(`${USR_COLUMNAS}, multitienda`)
            .neq('rol', 'desarrollador') // el Desarrollador no aparece para nadie
            .neq('rol', 'cliente')       // los clientes con usuario se manejan en Clientes (sql/01 bloque 19)
            .order('nombre'); // orden alfabético
        hayMultitienda = !error;
        if (error && error.code === '42703') {
            ({ data, error } = await db.from('usuarios').select(USR_COLUMNAS).neq('rol', 'desarrollador').neq('rol', 'cliente').order('nombre'));
        }

        if (error) {
            console.error('Error al cargar usuarios:', error);
            contador.textContent = 'No se pudo cargar la lista.';
            mostrarAviso('No se pudieron cargar los usuarios. Revisa la conexión.', 'error');
            return;
        }

        // Admin G2: solo ve usuarios de las tiendas de su región
        // Admin G3: solo ve usuarios de su tienda
        usuarios = g2 ? data.filter((u) => regionDeUsuario(u) === miRegion)
            : g3 ? data.filter((u) => u.tienda_id === miTienda)
            : data;
        dibujarTabla();
    }

    async function cargarTiendas() {
        const { data, error } = await db
            .from('tiendas')
            .select('id, codigo, nombre, estado, region')
            .order('codigo');

        if (error) {
            console.error('Error al cargar tiendas:', error);
            return;
        }

        // Admin G2: solo puede asignar tiendas de su región | Admin G3: solo la suya
        tiendas = g2 ? data.filter((t) => t.region === miRegion)
            : g3 ? data.filter((t) => t.id === miTienda)
            : data;

        // Opciones del selector: "CEN-001 · Tienda Central"
        campos.tienda.replaceChildren();
        const vacia = new Option(tiendas.length ? 'Selecciona una tienda' : 'No hay tiendas registradas', '');
        campos.tienda.appendChild(vacia);
        tiendas.forEach((t) => {
            const texto = `${t.codigo} · ${t.nombre}${t.estado === 'inactiva' ? ' (inactiva)' : ''}`;
            campos.tienda.appendChild(new Option(texto, t.id));
        });

        actualizarFiltroTiendas(); // el filtro de tiendas usa la misma lista
    }

    // Vehículos para el selector del piloto, agrupados por tipo:
    //   "Sin vehículo" + Camión / Pick-up / Panel / Moto / Sin tipo ("P123ABC · Toyota · Camión")
    //   + "Registrar vehículo nuevo..."
    async function cargarVehiculos() {
        let { data, error } = await db.from('vehiculos').select('id, placa, marca, tipo').order('placa');
        if (error && error.code === '42703') ({ data, error } = await db.from('vehiculos').select('id, placa, marca').order('placa')); // base sin "tipo"
        if (error) {
            console.error('Error al cargar vehículos:', error);
            return;
        }
        const elegido = campos.vehiculo.value; // se conserva la opción elegida al recargar
        campos.vehiculo.replaceChildren(new Option('Sin vehículo', ''));
        [...Object.keys(USR_TIPOS_VEHICULO), null].forEach((tipo) => {
            const delTipo = data.filter((v) => (tipo ? v.tipo === tipo : !USR_TIPOS_VEHICULO[v.tipo]));
            if (!delTipo.length) return;
            const grupo = document.createElement('optgroup');
            grupo.label = tipo ? USR_TIPOS_VEHICULO[tipo] : 'Sin tipo';
            delTipo.forEach((v) => grupo.appendChild(new Option(textoUnVehiculo(v), v.id)));
            campos.vehiculo.appendChild(grupo);
        });
        campos.vehiculo.appendChild(new Option('➕ Registrar vehículo nuevo...', USR_VEHICULO_NUEVO));
        campos.vehiculo.value = elegido;
    }

    // Empresas (solo el Desarrollador): para elegir la de un Administrador o Admin G1
    // por su ID. Sin el bloque 16 de sql/01 no hay empresas y el campo no aparece.
    async function cargarEmpresas() {
        if (!esDesarrollador()) return;
        const { data, error } = await db.from('empresas').select('id, codigo, nombre, activa').order('codigo');
        if (error) return;
        empresas = data;
        selEmpresa.replaceChildren(...empresas.map((e) =>
            new Option(`${e.codigo} · ${e.nombre}${e.activa ? '' : ' (inactiva)'}`, e.id)));
    }

    // "P123ABC · Toyota · Camión"
    const textoUnVehiculo = (v) => [v.placa, v.marca, USR_TIPOS_VEHICULO[v.tipo]].filter(Boolean).join(' · ');

    // Regiones: para el filtro de la cabecera y para el selector del
    // formulario al crear un Admin G2 (eso solo lo hace el Administrador)
    async function cargarRegiones() {
        const { data, error } = await db.from('regiones').select('codigo, nombre').order('nombre');
        if (error) {
            console.error('Error al cargar regiones:', error);
            return;
        }

        // Formulario
        campos.region.replaceChildren(new Option('Selecciona una región', ''));
        data.forEach((r) => campos.region.appendChild(new Option(`${r.nombre} (${r.codigo})`, r.codigo)));

        // Filtro: "Todas las regiones" + cada región
        data.forEach((r) => filtroRegion.appendChild(new Option(r.nombre, r.codigo)));

        // Admin G2: el filtro queda fijo en su región
        if (g2) {
            filtroRegion.value = miRegion;
            filtroRegion.disabled = true;
            filtroRegion.title = 'Solo puedes ver los usuarios de tu región';
        }

        // Admin G3: solo ve su tienda, así que los filtros de región y tienda no aplican
        if (g3) {
            filtroRegion.hidden = true;
            filtroTienda.hidden = true;
        }
    }

    // ==================================================
    // FILTROS (región, tienda y rol)
    // ==================================================

    // Región de cualquier usuario para el filtro:
    //   Empleado/Piloto -> la de su tienda | Admin G2 -> la suya | otros -> ninguna
    const regionParaFiltro = (u) => (u.rol === 'admin_g2' ? u.region : regionDeUsuario(u));

    // Filtro de roles: "Todos los roles" + cada rol
    Object.entries(USR_ROLES).forEach(([valor, texto]) => filtroRol.appendChild(new Option(texto, valor)));

    // Filtro de tiendas: solo las de la región elegida (o todas si no hay región)
    function actualizarFiltroTiendas() {
        const region = filtroRegion.value;
        const elegida = filtroTienda.value;
        const disponibles = tiendas.filter((t) => !region || t.region === region);

        filtroTienda.replaceChildren(new Option('Todas las tiendas', ''));
        disponibles.forEach((t) => filtroTienda.appendChild(new Option(`${t.codigo} · ${t.nombre}`, t.id)));

        // Si la tienda elegida no es de la nueva región, se vuelve a "Todas"
        filtroTienda.value = disponibles.some((t) => String(t.id) === elegida) ? elegida : '';
    }

    // ¿Hay algún filtro o búsqueda activa? (la región fija del Admin G2 no cuenta)
    const hayFiltros = () =>
        !!(buscador.value.trim() || filtroTienda.value || filtroRol.value || (!g2 && filtroRegion.value));

    filtroRegion.addEventListener('change', () => {
        actualizarFiltroTiendas();
        dibujarTabla();
    });
    filtroTienda.addEventListener('change', dibujarTabla);
    filtroRol.addEventListener('change', dibujarTabla);

    $('#usrLimpiarFiltros').addEventListener('click', () => {
        buscador.value = '';
        if (!g2) filtroRegion.value = '';
        filtroRol.value = '';
        filtroTienda.value = '';
        actualizarFiltroTiendas();
        dibujarTabla();
    });

    // ==================================================
    // TABLA
    // ==================================================

    // Texto de la columna Permisos
    function textoPermisos(permisos) {
        if (!permisos || permisos.length === 0) return '—';
        if (permisos.includes('*')) return 'Todas';
        return permisos.join(', ');
    }

    // Texto de la columna Vehículo (solo pilotos): "P123ABC · Toyota"
    function textoVehiculo(u) {
        return u.vehiculos ? textoUnVehiculo(u.vehiculos) : '—';
    }

    // Texto de la columna Tienda (para el Admin G2 muestra su región)
    function textoTienda(u) {
        if (u.rol === 'admin_g2') return `Región ${u.regiones ? u.regiones.nombre : u.region}`;
        return u.tiendas ? `${u.tiendas.codigo} · ${u.tiendas.nombre}` : '—';
    }

    // Dibuja las filas según los filtros (región, tienda, rol) y el buscador.
    // crearCelda, crearCeldaEtiqueta, crearBotonIcono, crearCeldaAcciones,
    // crearFilaVacia y coincideBusqueda están en js/componentes.js
    function dibujarTabla() {
        const filtro = buscador.value.trim();
        const region = filtroRegion.value;
        const tienda = filtroTienda.value;
        const rol    = filtroRol.value;

        const visibles = usuarios.filter((u) =>
            (!region || regionParaFiltro(u) === region) &&
            (!tienda || String(u.tienda_id) === tienda) &&
            (!rol || u.rol === rol) &&
            coincideBusqueda([u.nombre, u.id_usuario, u.telefono, USR_ROLES[u.rol], textoTienda(u), textoVehiculo(u)], filtro)
        );

        cuerpo.replaceChildren();

        // Sin filas: mensaje dentro de la tabla
        if (visibles.length === 0) {
            cuerpo.appendChild(crearFilaVacia(
                usuarios.length ? 'No hay usuarios que coincidan con los filtros.' : 'Aún no hay usuarios.', columnasTabla
            ));
        }

        visibles.forEach((u) => {
            const tr = document.createElement('tr');
            const esYo = sesion && sesion.id === u.id;
            const protegido = u.id_usuario === USR_PROTEGIDO;

            // Si el usuario conectado no tiene permiso sobre este usuario (ej. Admin G1
            // frente a un administrador, o Admin G3 que solo crea), se explica el motivo.
            const sinPermiso = puedeGestionar(u)
                ? null
                : g3 ? 'El Admin G3 solo puede crear empleados nuevos'
                : `Solo el Administrador puede modificar a un ${USR_ROLES[u.rol] || u.rol}`;

            // Motivo por el que no se puede eliminar (o null si se puede)
            const noEliminable = protegido
                ? 'El usuario admin está protegido y no se puede eliminar'
                : esYo ? 'No puedes eliminar tu propio usuario' : sinPermiso;

            // Mini foto (o iniciales). pintarAvatar está en js/avatar.js
            const tdFoto = document.createElement('td');
            tdFoto.className = 'usr-col-foto';
            const mini = document.createElement('div');
            mini.className = 'avatar avatar-chico';
            pintarAvatar(mini, u.nombre, u.foto_url);
            tdFoto.appendChild(mini);
            tr.appendChild(tdFoto);

            // Nombre (+ "Pendiente de aprobación · creado por ... el ..." si aún no se aprueba)
            const tdNombre = crearCelda(u.nombre + (esYo ? ' (tú)' : ''));
            if (u.aprobado === false) {
                const detalle = document.createElement('span');
                detalle.className = 'celda-detalle'; // css/componentes.css
                const fecha = u.solicitado_en ? ` el ${new Date(u.solicitado_en).toLocaleDateString('es')}` : '';
                const quien = u.solicitante ? ` · creado por ${u.solicitante.nombre}` : '';
                detalle.textContent = `⏳ Pendiente de aprobación${quien}${fecha}`;
                tdNombre.appendChild(detalle);
            }
            tr.appendChild(tdNombre);
            tr.appendChild(crearCelda(u.id_usuario, 'texto-codigo'));
            tr.appendChild(crearCeldaEtiqueta(USR_ROLES[u.rol] || u.rol, USR_COLOR_ROL[u.rol] || 'etiqueta-azul'));
            tr.appendChild(crearCelda(textoTienda(u)));
            tr.appendChild(crearCelda(textoVehiculo(u)));
            tr.appendChild(crearCelda(u.telefono));
            tr.appendChild(crearCelda(textoPermisos(u.permisos)));
            // Acciones: Administrador, Admin G1, G2 y G3 (G3 las ve desactivadas)
            if (puedeCrearUsuarios) {
                const botones = [];
                // Revisar (aprobar/rechazar) un usuario pendiente
                if (puedeAprobar(u)) {
                    botones.push(crearBotonIcono('revisar', u.id, 'bi-clipboard-check', 'Revisar: aprobar o rechazar este usuario'));
                }
                botones.push(crearBotonIcono('editar', u.id, 'bi-pencil', sinPermiso || `Modificar a ${u.nombre}`, !!sinPermiso));
                botones.push(crearBotonIcono('eliminar', u.id, 'bi-trash3', noEliminable || `Eliminar a ${u.nombre}`, !!noEliminable));
                tr.appendChild(crearCeldaAcciones(...botones));
            }

            cuerpo.appendChild(tr);
        });

        // "5 usuarios registrados · 1 pendiente" o, con filtros, "2 de 5 usuarios"
        const filtrando = hayFiltros();
        const pendientes = usuarios.filter((u) => u.aprobado === false).length;
        contador.textContent = (filtrando
            ? `${visibles.length} de ${plural(usuarios.length, 'usuario', 'usuarios')}`
            : plural(usuarios.length, 'usuario registrado', 'usuarios registrados')) +
            (pendientes ? ` · ${plural(pendientes, 'pendiente', 'pendientes')} de aprobación` : '') +
            // Solo el Desarrollador ve de qué empresa son (los demás solo conocen la suya)
            (esDesarrollador() && empresaActual() ? ` · empresa ${empresaActual().codigo || ''} ${empresaActual().nombre}` : '');
        $('#usrLimpiarFiltros').hidden = !filtrando;
    }

    buscador.addEventListener('input', dibujarTabla);

    // Un solo "escuchador" para todos los botones de la tabla
    cuerpo.addEventListener('click', (evento) => {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton || boton.disabled) return;

        const usuario = usuarios.find((u) => u.id === Number(boton.dataset.id));
        if (!usuario) return;

        if (boton.dataset.accion === 'revisar' && puedeAprobar(usuario)) abrirRevision(usuario);
        if (!puedeGestionar(usuario)) return;
        if (boton.dataset.accion === 'editar') abrirFormulario(usuario);
        if (boton.dataset.accion === 'eliminar') pedirConfirmacion(usuario);
    });

    // ==================================================
    // REVISAR USUARIO PENDIENTE (creado por un Admin G3)
    // Aprobar -> ya puede iniciar sesión | Rechazar -> se elimina
    // ==================================================

    function abrirRevision(usuario) {
        revisando = usuario;
        const quien = usuario.solicitante ? usuario.solicitante.nombre : 'un Admin G3';
        revisarTexto.textContent =
            `${quien} creó al ${USR_ROLES[usuario.rol] || usuario.rol} "${usuario.nombre}" ` +
            `(${usuario.id_usuario}) en ${textoTienda(usuario)}. ` +
            'Si lo apruebas podrá iniciar sesión; si lo rechazas, el usuario se elimina.';
        revisar.showModal();
    }

    $('#usrRevisarCerrar').addEventListener('click', () => revisar.close());

    $('#usrAprobar').addEventListener('click', async () => {
        const u = revisando;
        if (!u || !puedeAprobar(u)) return revisar.close();

        const { error } = await db.from('usuarios')
            .update({ aprobado: true, solicitado_por: null, solicitado_en: null })
            .eq('id', u.id);
        revisar.close();
        if (error) {
            console.error('Error al aprobar usuario:', error);
            mostrarAviso('No se pudo aprobar el usuario. Intenta de nuevo.', 'error');
            return;
        }
        // Notificaciones (js/notificaciones.js): avisar a quien lo creó y cerrar los "pendiente"
        notificarResultado({
            usuarioId: u.solicitado_por, aprobado: true,
            titulo: 'Empleado aprobado',
            mensaje: `${u.nombre} (${u.id_usuario}) ya puede iniciar sesión.`,
            enlace: '#usuarios', referenciaTipo: 'usuario', referenciaId: u.id,
        });
        resolverPendientes('usuario', u.id);

        mostrarAviso(`Usuario "${u.id_usuario}" aprobado: ya puede iniciar sesión.`);
        cargarUsuarios();
    });

    $('#usrRechazar').addEventListener('click', async () => {
        const u = revisando;
        if (!u || !puedeAprobar(u)) return revisar.close();

        const { error } = await db.from('usuarios').delete().eq('id', u.id);
        revisar.close();
        if (error) {
            console.error('Error al rechazar usuario:', error);
            mostrarAviso('No se pudo rechazar el usuario. Intenta de nuevo.', 'error');
            return;
        }
        if (u.foto_url) borrarArchivoFoto(u.id); // js/avatar.js
        // Notificaciones: avisar a quien lo creó y cerrar los "pendiente"
        notificarResultado({
            usuarioId: u.solicitado_por, aprobado: false,
            titulo: 'Empleado rechazado',
            mensaje: `La solicitud de ${u.nombre} (${u.id_usuario}) fue rechazada y el usuario se eliminó.`,
            enlace: '#usuarios',
        });
        resolverPendientes('usuario', u.id);

        mostrarAviso(`Usuario "${u.id_usuario}" rechazado y eliminado.`);
        cargarUsuarios();
    });

    // ==================================================
    // USUARIO COMPUESTO (prefijo de tienda + ID de la empresa al final)
    // prefijoUsuario, usuarioCompuesto y usuarioSinPrefijo: js/componentes.js
    // ==================================================

    // Región de la tienda: "CEN-001" -> "cen"
    function prefijoDeTienda(tiendaId) {
        const tienda = tiendas.find((t) => t.id === Number(tiendaId));
        return tienda ? prefijoUsuario(tienda.codigo) : '';
    }

    // Quita la tienda y el ID de la empresa para mostrar solo "jperez" en el formulario
    // (la lista es de la empresa activa: su ID es el de la sesión)
    const quitarPrefijo = (u) => usuarioSinPrefijo(u.id_usuario, u.tiendas ? u.tiendas.codigo : null);

    // ¿El rol elegido en el formulario va sin tienda? (Administrador / Admin G1 / Admin G2)
    const rolSinTienda = () => USR_ROLES_SIN_TIENDA.includes(campos.rol.value);

    // ¿El Desarrollador elige la empresa? (Administrador y Admin G1, si hay empresas)
    const eligeEmpresa = () => esDesarrollador() && empresas.length > 0 && USR_ROLES_CON_EMPRESA.includes(campos.rol.value);

    // Empresa a la que queda ligado el usuario: la elegida (Desarrollador) o la activa
    function empresaDelUsuario() {
        if (eligeEmpresa()) return empresas.find((e) => String(e.id) === selEmpresa.value) || empresaActual();
        return empresaActual();
    }

    // Usuario final que se guarda (y con el que se inicia sesión):
    //   Administrador / G1 / G2 -> "jperez" + "01"  |  tienda -> "cen" + "jperez" + "01"
    function usuarioDelFormulario() {
        // Usuarios protegidos: no cambian de nombre
        if (usuarioEditando && ['admin', 'desar'].includes(usuarioEditando.id_usuario)) return usuarioEditando.id_usuario;
        const base = campos.id_usuario.value.trim().toLowerCase();
        const tienda = rolSinTienda() ? null : (tiendas.find((t) => t.id === Number(campos.tienda.value)) || {}).codigo;
        return usuarioCompuesto(base, tienda || null, codigoEmpresa(empresaDelUsuario()));
    }

    // Ajusta el formulario al rol elegido:
    //   Administrador / Admin G1 -> sin tienda (desactivada); el Desarrollador elige la empresa
    //   Admin G2                 -> "Región" en lugar de "Tienda"
    //   Empleado / Piloto        -> tienda obligatoria y prefijo de su región "cen"
    //   Todos: el ID de la empresa al final ("01")
    function ajustarSegunRol() {
        const sinTienda = rolSinTienda();
        const esRolG2 = campos.rol.value === 'admin_g2';
        campoEmpresa.hidden = !eligeEmpresa();

        campos.tienda.disabled = sinTienda;
        tiendaObligatoria.hidden = sinTienda;
        if (sinTienda) campos.tienda.value = '';

        campoTienda.hidden = esRolG2;
        campoRegion.hidden = !esRolG2;
        if (!esRolG2) campos.region.value = '';

        // Vehículo y multitienda: solo para Pilotos
        const esPiloto = campos.rol.value === 'piloto';
        campoVehiculo.hidden = !esPiloto;
        if (!esPiloto) campos.vehiculo.value = '';
        mostrarVehiculoNuevo();
        campoMultitienda.hidden = !esPiloto || !hayMultitienda;
        if (!esPiloto) casillaMultitienda.checked = false;

        actualizarVistaPrevia();
        actualizarAvisoTienda();
    }

    // Al modificar un PILOTO: avisa qué pasará con sus rutas y pedidos si
    // cambia de tienda, deja de ser multitienda o deja de ser piloto
    function actualizarAvisoTienda() {
        const antes = usuarioEditando;
        avisoCambioTienda.hidden = true;
        if (!antes || antes.rol !== 'piloto') return;

        const esPiloto = campos.rol.value === 'piloto';
        const tiendaNueva = esPiloto && campos.tienda.value ? Number(campos.tienda.value) : null;
        const multi = esPiloto && casillaMultitienda.checked;
        const anterior = antes.tiendas ? antes.tiendas.codigo : 'la tienda anterior';

        let texto = '';
        if (!esPiloto) {
            texto = `Al guardar deja de ser piloto: se quitan sus rutas desde hoy y sus pedidos pendientes quedan sin piloto (se avisa al G2).`;
        } else if (tiendaNueva !== antes.tienda_id && !multi) {
            texto = `Al guardar se quitan sus rutas de ${anterior} desde hoy y sus pedidos pendientes allá quedan sin piloto (se avisa al G2). ` +
                'Si seguirá yendo algunos días, márcalo como multitienda.';
        } else if (tiendaNueva !== antes.tienda_id && multi) {
            texto = `Es multitienda: conserva sus rutas y pedidos de ${anterior}.`;
        } else if (antes.multitienda && !multi) {
            texto = 'Al dejar de ser multitienda se quitan sus rutas de otras tiendas desde hoy y sus pedidos pendientes allá quedan sin piloto.';
        }
        avisoCambioTienda.textContent = texto;
        avisoCambioTienda.hidden = !texto;
    }

    casillaMultitienda.addEventListener('change', actualizarAvisoTienda);

    // Muestra tipo + marca + placa solo si se eligió "Registrar vehículo nuevo..."
    function mostrarVehiculoNuevo() {
        const nuevo = campos.vehiculo.value === USR_VEHICULO_NUEVO;
        vehiculoNuevo.hidden = !nuevo;
        if (!nuevo) {
            campos.vehTipo.value = '';
            campos.vehMarca.value = '';
            campos.vehPlaca.value = '';
        }
    }

    campos.vehiculo.addEventListener('change', () => {
        mostrarVehiculoNuevo();
        if (campos.vehiculo.value === USR_VEHICULO_NUEVO) campos.vehTipo.focus();
    });

    // Placa: "p 123 abc" -> "P123ABC" (mayúsculas, sin espacios)
    const normalizarPlaca = (texto) => texto.toUpperCase().replace(/\s+/g, '');

    function actualizarVistaPrevia() {
        const protegido = usuarioEditando && ['admin', 'desar'].includes(usuarioEditando.id_usuario);
        prefijo.textContent = protegido || rolSinTienda() ? '' : (prefijoDeTienda(campos.tienda.value) || 'región');
        sufijo.textContent = protegido ? '' : codigoEmpresa(empresaDelUsuario());
        vistaPrevia.textContent = campos.id_usuario.value.trim() ? usuarioDelFormulario() : '—';
    }

    campos.rol.addEventListener('change', ajustarSegunRol);
    selEmpresa.addEventListener('change', actualizarVistaPrevia);
    campos.tienda.addEventListener('change', () => { actualizarVistaPrevia(); actualizarAvisoTienda(); });
    campos.id_usuario.addEventListener('input', actualizarVistaPrevia);

    // ==================================================
    // FOTO EN EL FORMULARIO
    // Elegir o quitar solo cambia la vista previa; la subida o el
    // borrado real se hace al presionar "Guardar".
    // ==================================================

    function liberarPrevia() {
        if (fotoPrevia) URL.revokeObjectURL(fotoPrevia);
        fotoPrevia = null;
    }

    function pintarFotoFormulario() {
        const nombre = campos.nombre.value;
        if (fotoElegida) {
            // Vista previa del archivo elegido (enlace temporal "blob:")
            fotoAvatar.classList.add('avatar-con-foto');
            fotoAvatar.style.backgroundImage = `url("${fotoPrevia}")`;
            fotoAvatar.textContent = '';
        } else {
            pintarAvatar(fotoAvatar, nombre, quitarFoto ? null : fotoActual);
        }
        // "Quitar" solo aparece si hay una foto que quitar
        fotoQuitar.hidden = !(fotoElegida || (fotoActual && !quitarFoto));
    }

    $('#usrFotoElegir').addEventListener('click', () => fotoArchivo.click());

    fotoArchivo.addEventListener('change', () => {
        const elegido = fotoArchivo.files[0];
        fotoArchivo.value = ''; // permite volver a elegir el mismo archivo
        if (!elegido) return;

        const problema = validarFoto(elegido); // js/avatar.js (tipo y 2 MB)
        if (problema) {
            errorForm.textContent = problema;
            return;
        }

        errorForm.textContent = '';
        liberarPrevia();
        fotoElegida = elegido;
        fotoPrevia = URL.createObjectURL(elegido);
        quitarFoto = false;
        pintarFotoFormulario();
    });

    fotoQuitar.addEventListener('click', () => {
        liberarPrevia();
        fotoElegida = null;
        quitarFoto = true;
        pintarFotoFormulario();
    });

    // Las iniciales cambian mientras se escribe el nombre
    campos.nombre.addEventListener('input', () => {
        if (!fotoElegida) pintarFotoFormulario();
    });

    // Aplica el cambio de foto después de guardar el usuario.
    // Devuelve un mensaje de error o null.
    async function aplicarCambioDeFoto(usuarioId) {
        try {
            if (fotoElegida) await subirFotoUsuario(usuarioId, fotoElegida);   // js/avatar.js
            else if (quitarFoto && fotoActual) await quitarFotoUsuario(usuarioId);
            return null;
        } catch (err) {
            return err.message;
        }
    }

    // ==================================================
    // CREAR / MODIFICAR (formulario)
    // ==================================================

    // usuario = null -> crear; usuario = objeto -> modificar
    function abrirFormulario(usuario = null) {
        editandoId = usuario ? usuario.id : null;
        usuarioEditando = usuario;
        form.reset();
        errorForm.textContent = '';

        tituloForm.textContent = usuario ? 'Modificar usuario' : 'Nuevo usuario';
        // Empresa: la activa (la lista es de esa empresa). El Desarrollador la puede
        // cambiar para un Administrador o Admin G1 (campo "Empresa").
        if (empresaActual()) selEmpresa.value = String(empresaActual().id);
        if (esDesarrollador() && empresaActual()) tituloForm.textContent += ` · empresa ${empresaActual().codigo || ''} ${empresaActual().nombre}`;
        claveObligatoria.hidden = !!usuario;
        claveAyuda.textContent = usuario
            ? 'Déjala vacía para conservar la clave actual.'
            : 'Mínimo 4 caracteres.';

        if (usuario) {
            campos.nombre.value     = usuario.nombre || '';
            campos.rol.value        = usuario.rol;
            campos.tienda.value     = usuario.tienda_id || '';
            campos.region.value     = usuario.region || '';
            campos.vehiculo.value   = usuario.vehiculo_id || '';
            casillaMultitienda.checked = !!usuario.multitienda;
            campos.id_usuario.value = quitarPrefijo(usuario);
            campos.telefono.value   = usuario.telefono || '';
            campos.permisos.value   = (usuario.permisos || []).join(', ');
        }

        // No se puede cambiar el rol propio (evita quitarse el acceso de administrador)
        // ni el rol o el usuario de "admin" (usuario protegido)
        const esYo = usuario && sesion && sesion.id === usuario.id;
        const protegido = usuario && usuario.id_usuario === USR_PROTEGIDO;
        campos.rol.disabled = !!(esYo || protegido);
        campos.rol.title = protegido ? 'El usuario admin siempre es Administrador'
            : esYo ? 'No puedes cambiar tu propio rol' : '';
        campos.id_usuario.disabled = !!protegido;
        campos.id_usuario.title = protegido ? 'El usuario admin no se puede renombrar' : '';

        // Foto: se parte de la que ya tiene (o ninguna si es nuevo)
        liberarPrevia();
        fotoActual = usuario ? usuario.foto_url : null;
        fotoElegida = null;
        quitarFoto = false;
        pintarFotoFormulario();

        ajustarSegunRol();

        // Admin G3: la tienda es siempre la suya (no se puede cambiar)
        if (g3) {
            campos.tienda.value = miTienda || '';
            campos.tienda.disabled = true;
            campos.tienda.title = 'Solo puedes crear empleados de tu tienda';
            actualizarVistaPrevia();
        }

        dialogo.showModal();
        campos.nombre.focus();
    }

    $('#usrNuevo').addEventListener('click', () => {
        if (puedeCrearUsuarios) abrirFormulario();
    });
    $('#usrCancelar').addEventListener('click', () => dialogo.close());

    // Al cerrar la ventana (Cancelar, Esc o después de guardar) se libera la vista previa
    dialogo.addEventListener('close', liberarPrevia);

    // Lee y valida el formulario. Devuelve los datos o null si hay error.
    function leerFormulario() {
        const nombre   = campos.nombre.value.trim();
        const rol      = campos.rol.value;
        const tiendaId = campos.tienda.value ? Number(campos.tienda.value) : null;
        const region   = campos.region.value || null;
        const base     = campos.id_usuario.value.trim().toLowerCase();
        const clave    = campos.clave.value;
        const telefono = campos.telefono.value.trim();
        const permisos = campos.permisos.value
            .split(',')
            .map((p) => p.trim().toLowerCase())
            .filter(Boolean); // "pedidos, rutas" -> ['pedidos', 'rutas']

        if (!nombre) return fallo('Escribe el nombre.', campos.nombre);

        // Solo el Administrador asigna roles de administración
        if (!admin && !USR_ROLES_PERSONAL.includes(rol)) {
            return fallo('Solo puedes crear o modificar Empleados y Pilotos.', campos.rol);
        }
        // Admin G3: solo crea Empleados de su tienda
        if (g3 && (rol !== 'empleado' || tiendaId !== miTienda)) {
            return fallo('Solo puedes crear Empleados de tu tienda.', campos.rol);
        }

        // Empleado y piloto deben tener tienda
        if (!USR_ROLES_SIN_TIENDA.includes(rol) && !tiendaId) {
            return fallo(tiendas.length
                ? 'Elige la tienda a la que pertenece.'
                : 'No hay tiendas registradas. Crea una en Tiendas primero.', campos.tienda);
        }

        // Admin G2: la tienda debe ser de su región (la lista ya viene filtrada)
        if (g2 && tiendaId && !tiendas.some((t) => t.id === tiendaId)) {
            return fallo('Solo puedes asignar tiendas de tu región.', campos.tienda);
        }

        // Admin G2 (el rol) debe tener región
        if (rol === 'admin_g2' && !region) {
            return fallo('Elige la región que administrará.', campos.region);
        }

        // Vehículo (solo pilotos): ninguno, uno existente o uno nuevo por registrar
        vehiculoPorRegistrar = null;
        let vehiculoId = null;
        if (rol === 'piloto') {
            if (campos.vehiculo.value === USR_VEHICULO_NUEVO) {
                const tipo = campos.vehTipo.value;
                const marca = campos.vehMarca.value.trim();
                const placa = normalizarPlaca(campos.vehPlaca.value);
                if (!tipo) return fallo('Elige el tipo de vehículo.', campos.vehTipo);
                if (!marca) return fallo('Escribe la marca del vehículo.', campos.vehMarca);
                if (!placa) return fallo('Escribe la placa del vehículo.', campos.vehPlaca);
                if (!/^[A-Z0-9-]+$/.test(placa)) {
                    return fallo('La placa solo puede tener letras, números y guion.', campos.vehPlaca);
                }
                vehiculoPorRegistrar = { tipo, marca, placa }; // se crea al guardar
            } else if (campos.vehiculo.value) {
                vehiculoId = Number(campos.vehiculo.value);
            }
        }

        if (!base) return fallo('Escribe el usuario.', campos.id_usuario);
        if (!/^[a-z0-9._-]+$/.test(base)) {
            return fallo('El usuario solo puede tener letras, números, punto, guion y guion bajo (sin espacios ni tildes).', campos.id_usuario);
        }

        // Al crear la clave es obligatoria; al modificar, solo si se escribe algo
        if (!editandoId && !clave) return fallo('Escribe una clave.', campos.clave);
        if (clave && clave.length < 4) return fallo('La clave debe tener al menos 4 caracteres.', campos.clave);

        const datos = {
            nombre,
            rol,
            tienda_id: USR_ROLES_SIN_TIENDA.includes(rol) ? null : tiendaId,
            region: rol === 'admin_g2' ? region : null,
            vehiculo_id: vehiculoId, // si es nuevo, se completa al guardar
            id_usuario: usuarioDelFormulario(),
            telefono: telefono || null,
            permisos,
        };
        // Empresa elegida por el Desarrollador (Administrador / Admin G1). Los demás:
        // la empresa activa (js/supabase.js) o la de su tienda o región (la base la corrige).
        if (eligeEmpresa()) {
            const empresa = empresaDelUsuario();
            if (!empresa) return fallo('Elige la empresa.', selEmpresa);
            datos.empresa_id = empresa.id;
        }
        if (clave) datos.clave = clave; // si está vacía (al modificar), no se cambia
        if (hayMultitienda) datos.multitienda = rol === 'piloto' && casillaMultitienda.checked;
        return datos;
    }

    function fallo(mensaje, campo) {
        errorForm.textContent = mensaje;
        campo.focus();
        return null;
    }

    // Traduce los errores de la base de datos a mensajes entendibles
    function mensajeDeError(error) {
        // unique: en una tienda el usuario lleva la región, no la tienda: otro "jperez" de la región lo choca
        if (error.code === '23505') return 'Ese usuario ya existe (puede ser de otra tienda de la región). Elige otro, ej. agrega un número: jperez2.';
        if (error.code === '23514') return 'Los datos no cumplen las reglas de rol y tienda.';     // check
        if (error.code === '23503') return 'La tienda elegida ya no existe. Recarga la página.';   // foreign key
        if (error.code === 'P0001') return error.message;  // trigger proteger_admin (usuario admin protegido)
        return 'No se pudo guardar. Revisa la conexión e intenta de nuevo.';
    }

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        // Crear: Admin, G1, G2 y G3 | Modificar: Admin, G1 y G2
        if (editandoId ? !puedeGestionarUsuarios : !puedeCrearUsuarios) return;
        errorForm.textContent = '';

        const datos = leerFormulario();
        if (!datos) return;

        botonGuardar.disabled = true;
        botonGuardar.textContent = 'Guardando...';

        // Si se registra un vehículo nuevo, primero se crea y se usa su id
        if (vehiculoPorRegistrar) {
            const { data: vehiculo, error: errorVehiculo } = await db
                .from('vehiculos')
                .insert(vehiculoPorRegistrar)
                .select('id')
                .single();

            if (errorVehiculo) {
                botonGuardar.disabled = false;
                botonGuardar.textContent = 'Guardar';
                console.error('Error al registrar vehículo:', errorVehiculo);
                errorForm.textContent = errorVehiculo.code === '23505'
                    ? `Ya existe un vehículo con la placa ${vehiculoPorRegistrar.placa}. Elígelo de la lista.`
                    : 'No se pudo registrar el vehículo. Revisa la marca y la placa.';
                return;
            }

            datos.vehiculo_id = vehiculo.id;
            cargarVehiculos(); // para que aparezca en la lista
        }

        // Admin G3: el usuario que crea queda PENDIENTE de aprobación (aprobado = false)
        if (g3 && !editandoId) {
            datos.aprobado = false;
            datos.solicitado_por = sesion.id;
            datos.solicitado_en = new Date().toISOString();
        }

        // Al crear se pide que devuelva el id nuevo (se necesita para la foto)
        const consulta = editandoId
            ? db.from('usuarios').update(datos).eq('id', editandoId)
            : db.from('usuarios').insert(datos).select('id').single();
        const { data, error } = await consulta;

        if (error) {
            botonGuardar.disabled = false;
            botonGuardar.textContent = 'Guardar';
            console.error('Error al guardar usuario:', error);
            errorForm.textContent = mensajeDeError(error);
            return;
        }

        const usuarioId = editandoId || data.id;

        // Piloto que cambió de tienda, dejó de ser multitienda o dejó de ser
        // piloto: se libera de las rutas y pedidos de las otras tiendas
        let liberado = null;
        const antes = usuarioEditando;
        if (editandoId && antes && antes.rol === 'piloto') {
            const conserva = datos.rol === 'piloto' ? datos.tienda_id : null;
            const multi = !!datos.multitienda;
            const cambioTienda = antes.tienda_id !== conserva;
            const dejoMulti = !!antes.multitienda && !multi;
            if ((cambioTienda && !multi) || dejoMulti || datos.rol !== 'piloto') {
                botonGuardar.textContent = 'Actualizando rutas...';
                liberado = await liberarPiloto(usuarioId, datos.nombre, conserva);
            }
        }

        // Admin G3 creó un empleado pendiente: avisar a quienes lo aprueban
        // (Administrador, Admin G1 y Admin G2 de la región) - js/notificaciones.js.
        // Solo al CREARLO (si lo corrige mientras sigue pendiente, no se repite el aviso).
        if (datos.aprobado === false && !editandoId) {
            const tienda = tiendas.find((t) => t.id === datos.tienda_id);
            notificarPendiente({
                referenciaTipo: 'usuario', referenciaId: usuarioId, tiendaId: datos.tienda_id,
                titulo: 'Empleado por aprobar',
                mensaje: `${sesion.nombre} creó a ${datos.nombre} (${datos.id_usuario})` +
                    `${tienda ? ' en ' + tienda.codigo : ''}.`,
                enlace: '#usuarios',
            });
        }

        // Si se modificó el propio usuario, se actualiza la sesión
        // (así el nombre del encabezado cambia sin volver a iniciar sesión).
        // Se lee la sesión de nuevo por si la foto cambió desde "Mi perfil".
        const sesionActual = obtenerSesion();
        if (editandoId && sesionActual && sesionActual.id === editandoId) {
            const tienda = tiendas.find((t) => t.id === datos.tienda_id);
            guardarSesion({
                ...sesionActual,
                usuario: datos.id_usuario,
                nombre: datos.nombre,
                permisos: datos.permisos,
                tienda: tienda ? { id: tienda.id, codigo: tienda.codigo, nombre: tienda.nombre } : null,
            });
            aplicarPermisos(); // js/permisos.js
        }

        // Foto (después de guardar, porque al crear se necesita el id)
        botonGuardar.textContent = 'Guardando foto...';
        const errorFoto = await aplicarCambioDeFoto(usuarioId);

        botonGuardar.disabled = false;
        botonGuardar.textContent = 'Guardar';
        dialogo.close();

        const accion = editandoId ? 'actualizado' : 'creado';
        // Los pilotos aparecen solos en la sección Pilotos (js/secciones/pilotos.js)
        const notaPiloto = datos.rol === 'piloto' ? ' Ya aparece en la sección Pilotos.' : '';
        // Creado por un Admin G3: todavía no puede entrar
        const notaAprobacion = datos.aprobado === false
            ? ' Queda pendiente: podrá iniciar sesión cuando lo apruebe un Admin G2 o superior.'
            : '';
        // Qué se liberó al cambiarlo de tienda
        const notaRutas = liberado && (liberado.rutas || liberado.pedidos)
            ? ` Se quitaron ${plural(liberado.rutas, 'asignación', 'asignaciones')} de rutas y ` +
              `${plural(liberado.pedidos, 'pedido quedó', 'pedidos quedaron')} sin piloto (se avisó al G2).`
            : '';
        // Ligado a otra empresa (Desarrollador): no sale en esta lista
        const otra = datos.empresa_id && empresaActual() && datos.empresa_id !== empresaActual().id
            ? empresas.find((e) => e.id === datos.empresa_id) : null;
        const notaEmpresa = otra
            ? ` Quedó en la empresa ${otra.codigo} · ${otra.nombre}: para verlo, cámbiate a esa empresa en tu menú.`
            : '';
        if (errorFoto) {
            mostrarAviso(`Usuario "${datos.id_usuario}" ${accion}, pero la foto no: ${errorFoto}`, 'error');
        } else {
            mostrarAviso(`Usuario "${datos.id_usuario}" ${accion}.${notaPiloto}${notaAprobacion}${notaRutas}${notaEmpresa}`);
        }
        cargarUsuarios();
    });

    // ==================================================
    // LIBERAR A UN PILOTO DE OTRAS TIENDAS (rutas y piloto multitienda)
    // Deja al piloto solo en la tienda que conserva (null = ninguna):
    //   1. Sus asignaciones de rutas de OTRAS tiendas, de hoy en adelante, se
    //      quitan (si empezaron antes de hoy, terminan ayer: el pasado no cambia).
    //   2. Sus pedidos pendientes de otras tiendas quedan SIN piloto
    //      (Asignado -> Registrado / En bodega) y queda en su línea de tiempo.
    //   3. Se avisa al Admin G2 de cada tienda afectada para reasignarlos.
    // Devuelve { rutas, pedidos } con cuántos se liberaron.
    // ==================================================

    // Fecha local "2026-09-29" (desplazada n días)
    function fechaLocal(desplazamiento = 0) {
        const d = new Date();
        d.setDate(d.getDate() + desplazamiento);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    async function liberarPiloto(pilotoId, nombre, tiendaQueConserva) {
        const hoy = fechaLocal();
        const ayer = fechaLocal(-1);
        const resultado = { rutas: 0, pedidos: 0 };

        // 1. Rutas (si la base no tiene rutas, no hay nada que quitar)
        const asig = await db.from('rutas_pilotos').select('id, fecha_desde, fecha_hasta, rutas(tienda_id)')
            .eq('piloto_id', pilotoId).gte('fecha_hasta', hoy);
        if (!asig.error) {
            const fuera = asig.data.filter((a) => a.rutas && a.rutas.tienda_id !== tiendaQueConserva);
            for (const a of fuera) {
                const r = a.fecha_desde >= hoy
                    ? await db.from('rutas_pilotos').delete().eq('id', a.id)
                    : await db.from('rutas_pilotos').update({ fecha_hasta: ayer }).eq('id', a.id);
                if (r.error) console.error('Error al quitar una asignación de ruta:', r.error);
                else resultado.rutas++;
            }
        }

        // 2. Pedidos pendientes de otras tiendas
        const [ped, act] = await Promise.all([
            db.from('pedidos').select('id, codigo, tienda_id, actividad, estado')
                .eq('piloto_id', pilotoId).eq('anulado', false)
                .in('estado', ['registrado', 'recibido_bodega', 'asignado', 'reprogramado', 'alistando', 'listo_despacho']),
            db.from('actividades').select('codigo, usa_bodega'),
        ]);
        if (ped.error) return resultado; // sin tabla de pedidos: nada más que hacer
        const conBodega = new Set((act.data || []).filter((a) => a.usa_bodega).map((a) => a.codigo));
        const afectados = ped.data.filter((p) => p.tienda_id !== tiendaQueConserva);
        const porTienda = {};
        for (const p of afectados) {
            const nuevo = p.estado === 'asignado' ? (conBodega.has(p.actividad) ? 'recibido_bodega' : 'registrado') : p.estado;
            const upd = await db.from('pedidos')
                .update({ piloto_id: null, estado: nuevo, actualizado_en: new Date().toISOString() }).eq('id', p.id);
            if (upd.error) {
                console.error(`Error al liberar el pedido ${p.codigo}:`, upd.error);
                continue;
            }
            await db.from('pedido_historial').insert({
                pedido_id: p.id, evento: 'asignado', estado_anterior: p.estado, estado_nuevo: nuevo,
                detalle: { piloto: 'Sin piloto', motivo: `${nombre} ya no trabaja en esta tienda` },
                usuario_id: sesion.id || null, usuario_nombre: sesion.nombre || null,
            });
            resultado.pedidos++;
            porTienda[p.tienda_id] = (porTienda[p.tienda_id] || 0) + 1;
        }

        // 3. Aviso al Admin G2 de cada tienda (js/notificaciones.js)
        for (const [tiendaId, cuantos] of Object.entries(porTienda)) {
            const tienda = tiendas.find((t) => t.id === Number(tiendaId));
            await notificarPendiente({
                referenciaTipo: 'pedidos_sin_piloto', referenciaId: pilotoId, tiendaId: Number(tiendaId), soloRegion: true,
                titulo: 'Pedidos sin piloto',
                mensaje: `${plural(cuantos, 'pedido quedó', 'pedidos quedaron')} sin piloto` +
                    `${tienda ? ` en ${tienda.codigo}` : ''} porque ${nombre} cambió de tienda. Reasígnalos.`,
                enlace: '#pedidos?accion=reasignar',
            });
        }
        return resultado;
    }

    // ==================================================
    // ELIMINAR (con confirmación)
    // ==================================================

    function pedirConfirmacion(usuario) {
        eliminandoId = usuario.id;
        confirmarTexto.textContent = `¿Seguro que quieres eliminar a "${usuario.nombre}" (${usuario.id_usuario})? Esta acción no se puede deshacer.`;
        confirmar.showModal();
    }

    $('#usrNoEliminar').addEventListener('click', () => confirmar.close());

    botonSiEliminar.addEventListener('click', async () => {
        const usuario = usuarios.find((u) => u.id === eliminandoId);
        if (!usuario || !puedeGestionar(usuario)) return confirmar.close();

        botonSiEliminar.disabled = true;
        botonSiEliminar.textContent = 'Eliminando...';

        const { error } = await db.from('usuarios').delete().eq('id', eliminandoId);

        botonSiEliminar.disabled = false;
        botonSiEliminar.textContent = 'Eliminar';
        confirmar.close();

        if (error) {
            console.error('Error al eliminar usuario:', error);
            mostrarAviso(error.code === 'P0001'
                ? error.message
                : 'No se pudo eliminar el usuario. Intenta de nuevo.', 'error');
            return;
        }

        // También se borra su foto del bucket (si tenía)
        if (usuario.foto_url) borrarArchivoFoto(usuario.id); // js/avatar.js

        // Si estaba pendiente, sus avisos "pendiente" ya no aplican
        if (usuario.aprobado === false) resolverPendientes('usuario', usuario.id);

        mostrarAviso(`Usuario "${usuario.id_usuario}" eliminado.`);
        cargarUsuarios();
    });

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================

    // (los vehículos solo hacen falta para asignarlos a pilotos)
    if (puedeGestionarUsuarios) cargarVehiculos();

    // Primero regiones y tiendas (las usan los filtros y el formulario),
    // luego los usuarios
    Promise.all([cargarRegiones(), cargarTiendas(), cargarEmpresas()]).then(() => {
        actualizarFiltroTiendas();
        cargarUsuarios();
    });

    // Se ejecuta al salir de la sección (js/pagina_inicial.js)
    return () => {
        aviso.limpiar();
        liberarPrevia();
        if (dialogo.open) dialogo.close();
        if (confirmar.open) confirmar.close();
        if (revisar.open) revisar.close();
    };
});
