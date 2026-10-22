/* ==================================================
   SECCIÓN: USUARIOS - LÓGICA
   ACACHETE LOGISTICS

   Qué hace (tabla "usuarios" de Supabase, conexión en js/supabase.js):
     - Listar:    muestra todos los usuarios con su rol y tienda (con buscador).
     - Crear:     botón "Nuevo usuario" -> formulario -> insert.
     - Modificar: icono del lápiz -> mismo formulario con los datos -> update.
     - Eliminar:  icono del basurero -> ventana de confirmación -> delete.
     - Cédula y departamento (sql/01 bloque 42): opcionales, el buscador los usa.
                  Departamento: lista de los que ya hay + "Nuevo departamento…" (no datalist:
                  en la ventana el navegador la dibuja fuera de lugar). Sin el bloque, no aparecen.
     - Foto:      en el formulario, "Elegir foto" / "Quitar". Se aplica al
                  presionar Guardar. Funciones en js/avatar.js (bucket "avatares").
     - Vehículo:  para todo el personal (piloto, empleado y administración; no el
                  cliente). Solo el del piloto cuenta en pedidos y viajes. Se elige uno
                  de la tabla "vehiculos" (agrupados
                  por tipo: camión, pick-up, panel, moto) o se registra uno nuevo
                  (tipo + marca + placa) desde el mismo formulario
                  (sql/00, sección 2).

   Roles (ver PROPUESTA-ESTRUCTURADA-V2.md, sección 13.1). Todos llevan al final
   el ID de su EMPRESA ("01", sql/01 bloque 16):
     administrador -> sin tienda. Usuario: "jperez01" ("admin" no cambia)
     admin_g1      -> sin tienda (todo el país). Usuario: "jlopez01"
     admin_g2      -> sin tienda, con REGIÓN. Usuario: "mruiz01"
     admin_g3      -> con tienda (admin local). Usuario: "mlopez01"
     empleado      -> con tienda. Usuario: "jperez01"
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
     La base revisa lo mismo (sql/instalacion/01_base.sql: usuarios_revisar_cambio).

   Admin TI (columna admin_ti, casilla del formulario): da la llave de soporte al
   Desarrollador (Configuración -> Soporte). Lo marca o lo quita el Administrador; el
   Desarrollador solo lo marca. Mientras la empresa no tenga Admin TI, el Desarrollador
   puede configurarla; después, sus usuarios los cambia solo con la llave "Ver y corregir".
   Emergencia (solo el Desarrollador, sin llave): bloquear, desbloquear y cerrar las
   sesiones de un usuario (soporte_emergencia; queda en la bitácora de la empresa).

   Usuario compuesto: en el formulario se escribe solo "jperez"; el ID de la
   empresa ("01") lo agrega este archivo al guardar (usuarioCompuesto, js/componentes.js).
   No lleva la región ni la tienda (sql/01 bloque 31): cambiar de tienda o de región no lo cambia.
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

   HTML: secciones/usuarios.html
   Estilos: css/secciones/usuarios.css (propios) + css/componentes.css (comunes)
   ================================================== */

// Columnas que se traen (la clave NO). "tiendas(codigo, nombre)" trae
// también los datos de la tienda enlazada por tienda_id.
// "regiones(nombre)" trae el nombre de la región del Admin G2.
// "vehiculos(placa, marca)" trae el vehículo asignado (piloto, empleado o administración).
// "solicitante:usuarios!solicitado_por(nombre)" = quién creó un usuario pendiente.
const USR_COLUMNAS = 'id, nombre, id_usuario, telefono, rol, tienda_id, region, vehiculo_id, foto_url, ' +
    'aprobado, admin_ti, solicitado_por, solicitado_en, ' +
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

// Roles que NO llevan tienda
const USR_ROLES_SIN_TIENDA = ['administrador', 'admin_g1', 'admin_g2'];

// Roles a los que el Desarrollador les elige la empresa (los demás la toman de su tienda o región)
const USR_ROLES_CON_EMPRESA = ['administrador', 'admin_g1'];

// Roles de "personal" que Admin G1 y Admin G2 pueden crear, modificar y eliminar.
// Los roles de administración solo los asigna el Administrador.
const USR_ROLES_PERSONAL = ['empleado', 'piloto'];

// Roles que pueden ser Admin TI (dan la llave de soporte; regla usuarios_admin_ti_personal de la base)
const USR_ROLES_ADMIN_TI = ['administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado'];

// Roles que pueden tener vehículo asignado (regla usuarios_vehiculo_personal de la base)
const USR_ROLES_CON_VEHICULO = ['administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado', 'piloto'];

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
        cedula:     $('#usrCedula'),
        departamento: $('#usrDepartamento'),
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
    const campoAdminTI      = $('#usrCampoAdminTI');
    const casillaAdminTI    = $('#usrAdminTI');
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
    let hayCedula = false;           // true si existen cedula y departamento (sql/01 bloque 42)
    let departamentos = [];          // los que ya usa la empresa, para la lista del formulario
    let modulosMarcados = null;      // casillas del formulario: null = lo de su rol; Set = las marcadas
    let funcionesPropias = new Map(); // id del usuario -> { 'pedidos.cancelar': true, ... } (tabla usuario_funciones)
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
    // Admin G3, y el Empleado al que se le da Usuarios (Usuarios -> "Módulos y funciones"): los dos
    // solo ven su tienda y solo crean Empleados de su tienda, que quedan pendientes de aprobación
    const g3 = esAdminG3() || rolActual() === 'empleado';
    const miRegion = regionActual(); // solo Admin G2 (ej. 'NOR')
    const miTienda = tiendaActual(); // Admin G3 (y empleados/pilotos)
    // Por rol, salvo que a ESTE usuario se le quite o se le dé (Usuarios -> "Módulos y funciones", js/sesion.js)
    const modificaUsuarios = puedeHacer('usuarios.modificar', admin || g1 || g2);
    const puedeGestionarUsuarios = modificaUsuarios;                                         // modificar / eliminar
    const puedeCrearUsuarios = puedeHacer('usuarios.crear', admin || g1 || g2 || esAdminG3()); // crear (G3: con aprobación)
    const conAcciones = puedeCrearUsuarios || puedeGestionarUsuarios; // columna de acciones

    // Región de la tienda de un usuario (Admin G3, empleados y pilotos), ej. 'NOR'
    const regionDeUsuario = (u) => (u.tiendas ? u.tiendas.region : null);

    // ¿Puede aprobar o rechazar a este usuario pendiente?
    //   Administrador, Admin G1 o el Admin G2 de la región de su tienda
    //   (G3 / Empleado solo si se le dio "Modificar, eliminar y aprobar usuarios": los de su tienda)
    const puedeAprobar = (u) =>
        u.aprobado === false && modificaUsuarios && (admin || g1 || (g2 && regionDeUsuario(u) === miRegion)
            || (g3 && u.tienda_id === miTienda && u.id !== sesion.id));

    // ¿El usuario conectado puede modificar o eliminar a este usuario?
    //   Administrador -> a cualquiera
    //   Admin G1      -> solo Empleados y Pilotos
    //   Admin G2      -> solo Empleados y Pilotos de SU región
    //   G3 / Empleado -> (si se le dio la función) solo Empleados de SU tienda, menos él mismo
    function puedeGestionar(u) {
        if (!modificaUsuarios) return false;
        if (admin) return true;
        if (g1) return USR_ROLES_PERSONAL.includes(u.rol);
        if (g2) return USR_ROLES_PERSONAL.includes(u.rol) && regionDeUsuario(u) === miRegion;
        if (g3) return u.rol === 'empleado' && u.tienda_id === miTienda && u.id !== sesion.id;
        return false;
    }

    // Empleados y pilotos: solo ven la lista (sin "Nuevo usuario" ni acciones)
    if (!puedeCrearUsuarios) $('#usrNuevo').hidden = true;
    if (!conAcciones) $('.usr-tabla th.tabla-col-acciones').remove();

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
    const columnasTabla = conAcciones ? 9 : 8;

    // ==================================================
    // CARGAR DATOS (usuarios, tiendas y regiones)
    // ==================================================

    async function cargarUsuarios() {
        // Catálogo de módulos y funciones (tabla funciones; js/sesion.js), una vez
        if (!MODULOS_USUARIO.length) {
            const errorCatalogo = await cargarCatalogoFunciones();
            if (errorCatalogo) console.error('Error al cargar los módulos y funciones:', errorCatalogo);
        }
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

        // Cédula y departamento (sql/01 bloque 42): aparte, así la lista carga aunque la
        // base todavía no los tenga (sin ellos los campos del formulario se ocultan)
        const extra = await db.from('usuarios').select('id, cedula, departamento');
        hayCedula = !extra.error;
        if (hayCedula) {
            const porId = new Map(extra.data.map((x) => [x.id, x]));
            data.forEach((u) => Object.assign(u, porId.get(u.id) || {}));
        }
        $('#usrCampoCedula').hidden = $('#usrCampoDepartamento').hidden = !hayCedula;
        // Lo que a cada uno se le dio o se le quitó respecto de su rol
        const propias = await db.from('usuario_funciones').select('usuario_id, funcion, permitido');
        if (propias.error) console.error('Error al cargar los módulos de los usuarios:', propias.error);
        funcionesPropias = new Map();
        (propias.data || []).forEach((f) => {
            if (!funcionesPropias.has(f.usuario_id)) funcionesPropias.set(f.usuario_id, {});
            funcionesPropias.get(f.usuario_id)[f.funcion] = f.permitido;
        });
        // Departamentos que ya usa la empresa (así se escriben igual)
        departamentos = [...new Set(data.map((u) => u.departamento).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'es'));

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

    // Texto de la columna Módulos: "Los de su rol", "Ninguno" o sus módulos con cuántas
    // funciones tiene: "Pedidos (3 funciones), Caja (1 función)" (js/sesion.js: funcionesEfectivas)
    function textoPermisos(u) {
        const modulos = modulosDelRol(u.rol);
        if (!modulos.length) return 'Todo';
        const propias = funcionesPropias.get(u.id);
        if (!propias) return 'Los de su rol';
        const suyas = funcionesEfectivas(u.rol, propias);
        const partes = modulos.filter((m) => suyas.has(m.seccion)).map((m) => {
            if (!m.acciones.length) return m.nombre;
            const n = m.acciones.filter((a) => suyas.has(`${m.seccion}.${a.clave}`)).length;
            return `${m.nombre} (${n ? plural(n, 'función', 'funciones') : 'solo ver'})`;
        });
        return partes.length ? partes.join(', ') : 'Ninguno';
    }

    // Texto de la columna Vehículo: "P123ABC · Toyota"
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
            coincideBusqueda([u.nombre, u.id_usuario, u.telefono, u.cedula, u.departamento,
                USR_ROLES[u.rol], textoTienda(u), textoVehiculo(u)], filtro)
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
                : !modificaUsuarios ? 'No tienes la función "Modificar, eliminar y aprobar usuarios"'
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
            // Departamento y cédula (sql/01 bloque 42), si los tiene
            const datosPersona = [u.departamento, u.cedula && `Céd. ${u.cedula}`].filter(Boolean).join(' · ');
            if (datosPersona) {
                const detalle = document.createElement('span');
                detalle.className = 'celda-detalle';
                detalle.textContent = datosPersona;
                tdNombre.appendChild(detalle);
            }
            // Admin TI: da la llave de soporte (Configuración -> Soporte)
            if (u.admin_ti) {
                const detalle = document.createElement('span');
                detalle.className = 'celda-detalle';
                const icono = document.createElement('i');
                icono.className = 'bi bi-shield-lock';
                detalle.append(icono, ' Admin TI');
                tdNombre.appendChild(detalle);
            }
            tr.appendChild(tdNombre);
            tr.appendChild(crearCelda(u.id_usuario, 'texto-codigo'));
            tr.appendChild(crearCeldaEtiqueta(USR_ROLES[u.rol] || u.rol, USR_COLOR_ROL[u.rol] || 'etiqueta-azul'));
            tr.appendChild(crearCelda(textoTienda(u)));
            tr.appendChild(crearCelda(textoVehiculo(u), 'solo-vehiculos'));
            tr.appendChild(crearCelda(u.telefono));
            tr.appendChild(crearCelda(textoPermisos(u)));
            // Acciones: Administrador, Admin G1, G2 y G3 (G3 las ve desactivadas)
            if (conAcciones) {
                const botones = [];
                // Revisar (aprobar/rechazar) un usuario pendiente
                if (puedeAprobar(u)) {
                    botones.push(crearBotonIcono('revisar', u.id, 'bi-clipboard-check', 'Revisar: aprobar o rechazar este usuario'));
                }
                botones.push(crearBotonIcono('editar', u.id, 'bi-pencil', sinPermiso || `Modificar a ${u.nombre}`, !!sinPermiso));
                botones.push(crearBotonIcono('eliminar', u.id, 'bi-trash3', noEliminable || `Eliminar a ${u.nombre}`, !!noEliminable));
                // Emergencia (solo el Desarrollador, sin llave de soporte)
                if (esDesarrollador()) {
                    botones.push(u.aprobado === false
                        ? crearBotonIcono('desbloquear', u.id, 'bi-unlock', `Emergencia: desbloquear a ${u.nombre}`)
                        : crearBotonIcono('bloquear', u.id, 'bi-lock', `Emergencia: bloquear a ${u.nombre} (no entra y se cierran sus sesiones)`));
                    botones.push(crearBotonIcono('sesiones', u.id, 'bi-box-arrow-right', `Emergencia: cerrar las sesiones de ${u.nombre}`));
                }
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
        if (['bloquear', 'desbloquear', 'sesiones'].includes(boton.dataset.accion) && esDesarrollador()) {
            emergencia(usuario, boton.dataset.accion);
            return;
        }
        if (!puedeGestionar(usuario)) return;
        if (boton.dataset.accion === 'editar') abrirFormulario(usuario);
        if (boton.dataset.accion === 'eliminar') pedirConfirmacion(usuario);
    });

    // ==================================================
    // ACCIONES DE EMERGENCIA (solo el Desarrollador, sin llave de soporte)
    // Bloquear (no entra y se cierran sus sesiones), desbloquear y cerrar sesiones
    // (sql/instalacion/01_base.sql: soporte_emergencia). Quedan en la bitácora de la
    // empresa y se avisa a su Administrador y Admin TI.
    // ==================================================

    async function emergencia(u, accion) {
        const quien = `${u.nombre} (${u.id_usuario})`;
        const pregunta = {
            bloquear: `¿Bloquear a ${quien}? No podrá entrar y se cierran sus sesiones.`,
            desbloquear: `¿Desbloquear a ${quien}? Podrá entrar de nuevo.`,
            sesiones: `¿Cerrar las sesiones de ${quien}? Tendrá que volver a iniciar sesión.`,
        }[accion];
        if (!confirm(`${pregunta} Se avisa al Administrador y al Admin TI de la empresa.`)) return;
        const { error } = await db.rpc('soporte_emergencia', {
            p_usuario: u.id, p_accion: accion === 'sesiones' ? 'cerrar_sesiones' : accion,
        });
        if (error) {
            console.error('Error en la acción de emergencia:', error);
            mostrarAviso(error.code === 'PGRST202' ? 'Falta instalar la base de datos (sql/instalacion).'
                : ['P0001', '42501'].includes(error.code) ? error.message : 'No se pudo. Revisa la conexión.', 'error');
            return;
        }
        mostrarAviso({
            bloquear: `${quien} bloqueado: ya no puede entrar.`,
            desbloquear: `${quien} desbloqueado: ya puede entrar.`,
            sesiones: `Se cerraron las sesiones de ${quien}.`,
        }[accion]);
        cargarUsuarios();
    }

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
    // USUARIO COMPUESTO (nombre + ID de la empresa al final; sin región, sql/01 bloque 31)
    // usuarioCompuesto y usuarioSinPrefijo: js/componentes.js
    // ==================================================

    // Quita el ID de la empresa para mostrar solo "jperez" en el formulario
    // (la lista es de la empresa activa: su ID es el de la sesión)
    const quitarPrefijo = (u) => usuarioSinPrefijo(u.id_usuario);

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
    //   todos los roles -> "jperez" + "01" (la tienda y la región no van en el usuario)
    function usuarioDelFormulario() {
        // Usuarios protegidos: no cambian de nombre
        if (usuarioEditando && ['admin', 'desar'].includes(usuarioEditando.id_usuario)) return usuarioEditando.id_usuario;
        const base = campos.id_usuario.value.trim().toLowerCase();
        return usuarioCompuesto(base, null, codigoEmpresa(empresaDelUsuario()));
    }

    // Ajusta el formulario al rol elegido:
    //   Administrador / Admin G1 -> sin tienda (desactivada); el Desarrollador elige la empresa
    //   Admin G2                 -> "Región" en lugar de "Tienda"
    //   Empleado / Piloto        -> tienda obligatoria
    //   Todos: el ID de la empresa al final ("01")
    function ajustarSegunRol() {
        pintarModulos(); // los módulos que permite el rol elegido
        const sinTienda = rolSinTienda();
        const esRolG2 = campos.rol.value === 'admin_g2';
        campoEmpresa.hidden = !eligeEmpresa();

        campos.tienda.disabled = sinTienda;
        tiendaObligatoria.hidden = sinTienda;
        if (sinTienda) campos.tienda.value = '';

        campoTienda.hidden = esRolG2;
        campoRegion.hidden = !esRolG2;
        if (!esRolG2) campos.region.value = '';

        // Vehículo: todo el personal. Multitienda: solo Pilotos
        const conVehiculo = USR_ROLES_CON_VEHICULO.includes(campos.rol.value);
        campoVehiculo.hidden = !conVehiculo;
        if (!conVehiculo) campos.vehiculo.value = '';
        mostrarVehiculoNuevo();
        const esPiloto = campos.rol.value === 'piloto';
        campoMultitienda.hidden = !esPiloto || !hayMultitienda;
        if (!esPiloto) casillaMultitienda.checked = false;

        // Admin TI: lo marca o lo quita el Administrador; el Desarrollador solo lo marca (no lo quita)
        const rolConAdminTI = USR_ROLES_ADMIN_TI.includes(campos.rol.value);
        campoAdminTI.hidden = !rolConAdminTI || !(rolActual() === 'administrador' || esDesarrollador());
        if (!rolConAdminTI) casillaAdminTI.checked = false;
        casillaAdminTI.disabled = esDesarrollador() && !!(usuarioEditando && usuarioEditando.admin_ti);
        campoAdminTI.title = casillaAdminTI.disabled ? 'Al Admin TI solo lo quita un Administrador de su empresa' : '';

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
        prefijo.textContent = ''; // sin prefijo de región (sql/01 bloque 31)
        sufijo.textContent = protegido ? '' : codigoEmpresa(empresaDelUsuario());
        vistaPrevia.textContent = campos.id_usuario.value.trim() ? usuarioDelFormulario() : '—';
    }

    campos.rol.addEventListener('change', ajustarSegunRol);

    // ==================================================
    // MÓDULOS Y FUNCIONES (catálogo en la base, tabla funciones; js/sesion.js: modulosDelRol,
    // funcionesEfectivas). Al personal se le ofrecen TODOS los módulos que usa la empresa,
    // cada uno con sus funciones debajo; vienen marcados los de su ROL y los de otros roles
    // dicen "otro rol" (se pueden dar igual, ej. un Empleado de bodega que cierra caja). Al
    // piloto, solo los suyos (solo se le quitan). Sin marcar el módulo, sus funciones quedan
    // apagadas. Se guarda con usuario_guardar_funciones: la base anota solo lo distinto a su
    // rol (tabla usuario_funciones). El Administrador no se limita (no se muestran).
    // ==================================================

    const cajaModulos = $('#usrModulos');

    function casilla(valor, marcada, extra = {}) {
        const c = document.createElement('input');
        c.type = 'checkbox';
        c.value = valor;
        c.checked = marcada;
        Object.assign(c.dataset, extra);
        return c;
    }

    // "otro rol": lo que no trae su rol (se le puede dar igual)
    function marcaOtroRol() {
        const s = document.createElement('span');
        s.className = 'usr-otro-rol';
        s.textContent = 'otro rol';
        s.title = 'Su rol no lo trae: se le da solo a este usuario';
        return s;
    }

    function pintarModulos() {
        const modulos = modulosDelRol(campos.rol.value); // js/sesion.js
        const marcadas = modulosMarcados || funcionesEfectivas(campos.rol.value); // sin cambios: los de su rol
        $('#usrCampoModulos').hidden = !modulos.length;
        cajaModulos.replaceChildren(...modulos.map((m) => {
            const bloque = document.createElement('div');
            bloque.className = 'usr-modulo-bloque';
            const entra = marcadas.has(m.seccion);
            const label = document.createElement('label');
            label.className = 'usr-modulo';
            const icono = document.createElement('i');
            icono.className = `bi ${m.icono}`;
            label.append(casilla(m.seccion, entra, { tipo: 'modulo' }), icono, m.nombre);
            if (!m.delRol) label.appendChild(marcaOtroRol());
            bloque.appendChild(label);
            if (m.acciones.length) {
                const lista = document.createElement('div');
                lista.className = 'usr-acciones';
                m.acciones.forEach((a) => {
                    const clave = `${m.seccion}.${a.clave}`;
                    const fila = document.createElement('label');
                    fila.className = 'usr-accion';
                    const c = casilla(clave, entra && marcadas.has(clave), { modulo: m.seccion });
                    c.disabled = !entra;
                    const texto = document.createElement('span');
                    texto.textContent = a.nombre;
                    if (!a.delRol) texto.append(' ', marcaOtroRol());
                    fila.append(c, texto);
                    lista.appendChild(fila);
                });
                bloque.appendChild(lista);
            }
            return bloque;
        }));
    }

    // Lo que dicen las casillas: null = igual que su rol; si no, un Set con TODAS las claves
    // que tendrá (las marcadas y, de lo que no se ofrece aquí porque la empresa no lo usa, lo
    // de su rol: así no se le quita sin querer)
    function marcadasDeCasillas() {
        const rol = campos.rol.value;
        const modulos = modulosDelRol(rol);
        if (!modulos.length) return null;
        const ofrecidas = new Set(modulos.flatMap((m) => [m.seccion, ...m.acciones.map((a) => `${m.seccion}.${a.clave}`)]));
        const delRol = funcionesEfectivas(rol);
        const marcadas = new Set([...cajaModulos.querySelectorAll('input:checked')]
            .filter((c) => !c.disabled).map((c) => c.value));
        delRol.forEach((clave) => { if (!ofrecidas.has(clave)) marcadas.add(clave); });
        const igual = marcadas.size === delRol.size && [...marcadas].every((clave) => delRol.has(clave));
        return igual ? null : marcadas;
    }

    cajaModulos.addEventListener('change', (evento) => {
        const c = evento.target;
        // Al marcar un módulo se marcan todas sus funciones (después se quitan las que no);
        // al quitarlo, sus funciones se apagan
        if (c.dataset.tipo === 'modulo') {
            cajaModulos.querySelectorAll(`input[data-modulo="${c.value}"]`).forEach((x) => {
                x.checked = c.checked;
                x.disabled = !c.checked;
            });
        }
        modulosMarcados = marcadasDeCasillas();
    });
    $('#usrModulosTodos').addEventListener('click', () => { modulosMarcados = null; pintarModulos(); });       // los de su rol
    $('#usrModulosNinguno').addEventListener('click', () => { modulosMarcados = new Set(); pintarModulos(); }); // solo Inicio y Mi perfil
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
            casillaAdminTI.checked = !!usuario.admin_ti;
            campos.id_usuario.value = quitarPrefijo(usuario);
            ponerDato(campos.telefono, usuario.telefono);
            ponerDato(campos.cedula, usuario.cedula);
        }

        ponerDepartamento(usuario ? usuario.departamento : '');
        // Módulos y funciones: los de su rol más lo que se le dio o quitó. Se pintan en ajustarSegunRol.
        const propias = usuario ? funcionesPropias.get(usuario.id) : null;
        modulosMarcados = propias ? funcionesEfectivas(usuario.rol, propias) : null;

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

    // ---------- Departamento: lista + "Nuevo departamento…" ----------
    const listaDepartamento = $('#usrDepartamentoLista');
    const USR_DEPARTAMENTO_NUEVO = '__nuevo';

    // Llena la lista y deja elegido "valor" (vacío = sin departamento)
    function ponerDepartamento(valor) {
        listaDepartamento.replaceChildren(
            new Option('Sin departamento', ''),
            ...departamentos.map((d) => new Option(d, d)),
            new Option('+ Nuevo departamento…', USR_DEPARTAMENTO_NUEVO));
        listaDepartamento.value = valor && departamentos.includes(valor) ? valor : '';
        campos.departamento.value = '';
        campos.departamento.hidden = true;
    }

    listaDepartamento.addEventListener('change', () => {
        const nuevo = listaDepartamento.value === USR_DEPARTAMENTO_NUEVO;
        campos.departamento.hidden = !nuevo;
        if (nuevo) campos.departamento.focus();
    });

    // Departamento elegido o escrito. Si el escrito ya existe con otras mayúsculas o
    // tildes ("bodega" / "Bodega"), se usa el que ya existe (así la búsqueda los junta).
    function departamentoElegido() {
        if (listaDepartamento.value !== USR_DEPARTAMENTO_NUEVO) return listaDepartamento.value || null;
        const escrito = campos.departamento.value.trim().replace(/\s+/g, ' ');
        if (!escrito) return null;
        const igual = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        return departamentos.find((d) => igual(d) === igual(escrito)) || escrito;
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

        if (!nombre) return fallo('Escribe el nombre.', campos.nombre);
        // Teléfono y cédula (opcionales) con el formato de Costa Rica (js/componentes.js)
        const malTelefono = validarDato('telefono', telefono);
        if (malTelefono) return fallo(malTelefono, campos.telefono);
        const malaCedula = hayCedula ? validarDato('identificacion', campos.cedula.value) : '';
        if (malaCedula) return fallo(malaCedula, campos.cedula);

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

        // Vehículo (todo el personal): ninguno, uno existente o uno nuevo por registrar
        vehiculoPorRegistrar = null;
        let vehiculoId = null;
        if (USR_ROLES_CON_VEHICULO.includes(rol)) {
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
            telefono: datoConFormato('telefono', telefono),
        };
        // Empresa elegida por el Desarrollador (Administrador / Admin G1). Los demás:
        // la empresa activa (js/supabase.js) o la de su tienda o región (la base la corrige).
        if (eligeEmpresa()) {
            const empresa = empresaDelUsuario();
            if (!empresa) return fallo('Elige la empresa.', selEmpresa);
            datos.empresa_id = empresa.id;
        }
        if (hayCedula) {
            datos.cedula = datoConFormato('identificacion', campos.cedula.value);
            datos.departamento = departamentoElegido();
        }
        if (clave) datos.clave = clave; // si está vacía (al modificar), no se cambia
        if (hayMultitienda) datos.multitienda = rol === 'piloto' && casillaMultitienda.checked;
        // Admin TI: el Administrador lo pone o lo quita; el Desarrollador solo lo pone (la base lo revisa)
        if (rolActual() === 'administrador') {
            datos.admin_ti = USR_ROLES_ADMIN_TI.includes(rol) && casillaAdminTI.checked;
        } else if (esDesarrollador() && casillaAdminTI.checked && !(usuarioEditando && usuarioEditando.admin_ti)) {
            datos.admin_ti = true;
        }
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
        // Reglas de la base (usuarios_revisar_cambio o RLS). El Desarrollador: la empresa ya tiene
        // Admin TI y no tiene la llave de soporte "Ver y corregir" (js/soporte.js)
        if (error.code === '42501' || error.code === 'SIN_CAMBIO') {
            return esDesarrollador()
                ? 'Esta empresa ya tiene Admin TI: para cambiar sus usuarios pide una llave de soporte "Ver y corregir".'
                : (error.code === '42501' && !/row-level security/i.test(error.message) ? error.message : 'No tienes permiso para guardar este usuario.');
        }
        return 'No se pudo guardar. Revisa la conexión e intenta de nuevo.';
    }

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        // Crear: Admin, G1, G2 y G3 | Modificar: Admin, G1 y G2
        if (editandoId ? !puedeGestionarUsuarios : !puedeCrearUsuarios) return;
        errorForm.textContent = '';

        const datos = leerFormulario();
        if (!datos) return;
        const marcadas = marcadasDeCasillas(); // módulos y funciones (null = los de su rol)

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

        // Al crear se pide que devuelva el id nuevo (se necesita para la foto). Al modificar también:
        // si la base no dejó cambiar la fila (sus reglas), no devuelve nada y se avisa.
        const consulta = editandoId
            ? db.from('usuarios').update(datos).eq('id', editandoId).select('id')
            : db.from('usuarios').insert(datos).select('id').single();
        const resultado = await consulta;
        const data = resultado.data;
        const error = resultado.error || (editandoId && !(data && data.length)
            ? { code: 'SIN_CAMBIO', message: 'La base no dejó cambiar el usuario.' } : null);

        if (error) {
            botonGuardar.disabled = false;
            botonGuardar.textContent = 'Guardar';
            console.error('Error al guardar usuario:', error);
            errorForm.textContent = mensajeDeError(error);
            return;
        }

        const usuarioId = editandoId || data.id;

        // Módulos y funciones: la base guarda solo lo distinto a su rol (usuario_guardar_funciones).
        // Solo si cambió algo (al crear, si no son los de su rol); nadie cambia los suyos.
        const antesPropias = editandoId ? funcionesPropias.get(editandoId) : null;
        if ((marcadas || antesPropias) && usuarioId !== sesion.id) {
            const { error: errorFunciones } = await db.rpc('usuario_guardar_funciones',
                { p_usuario: usuarioId, p_marcadas: marcadas ? [...marcadas] : null });
            if (errorFunciones) {
                console.error('Error al guardar los módulos y funciones:', errorFunciones);
                mostrarAviso(`Se guardó el usuario, pero no sus módulos y funciones: ${errorFunciones.message}`, 'error');
            }
        }

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

        // 2. Pedidos pendientes de otras tiendas: los deja sin piloto la base (pedidos_liberar_piloto,
        //    sql/instalacion/04_rutas_y_pedidos.sql), con su historial
        const lib = await db.rpc('pedidos_liberar_piloto', {
            p_usuario: sesion.id, p_piloto: pilotoId, p_tienda_conserva: tiendaQueConserva || null,
        });
        if (lib.error) {
            console.error('Error al liberar los pedidos del piloto:', lib.error);
            return resultado;
        }
        resultado.pedidos = lib.data.pedidos || 0;
        const porTienda = lib.data.por_tienda || {};

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

    // (los vehículos solo hacen falta para asignarlos en el formulario)
    if (conAcciones) cargarVehiculos();

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
