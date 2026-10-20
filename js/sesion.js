/* ==================================================
   SESIÓN DEL USUARIO (funciones compartidas)
   ACACHETE LOGISTICS

   Qué hace: guarda, lee y borra los datos del usuario
   que inició sesión, y dice si tiene permiso para una
   sección.

   Lo usan:
     - js/secciones/loggin.js -> guarda la sesión al entrar
     - js/permisos.js         -> bloquea las secciones del menú
     - js/pagina_inicial.js   -> muestra el login si no hay sesión
                                 y revisa permisos antes de cargar
     - js/menu-usuario.js     -> borra la sesión al cerrarla

   Dónde se guarda: sessionStorage del navegador. La sesión
   se borra sola al cerrar la pestaña. Si se quiere que dure
   aunque se cierre el navegador, cambiar sessionStorage por
   localStorage en las 3 funciones de abajo.

   ⚠ Esto es solo visual: alguien con conocimientos puede
   editar el sessionStorage. La protección real de los datos
   debe hacerla la base de datos (reglas RLS de Supabase).
   ================================================== */

// Nombre con el que se guarda la sesión en el navegador. Lleva la empresa
// activa (empresas/empresas.js): al cambiar de empresa no se mezclan sesiones.
const CLAVE_SESION = typeof EMPRESA_ACTIVA !== 'undefined' ? `acachete_sesion_${EMPRESA_ACTIVA}` : 'acachete_sesion';

// ¿Se usa la columna "permisos" de la tabla usuarios (Usuarios -> "Módulos y funciones")?
//   true  -> El ROL solo da lo que viene marcado al crear el usuario. Al personal
//            (Admin G1, G2, G3 y Empleado) se le puede QUITAR lo que trae su rol o DAR
//            módulos y funciones de otros roles (ej. un Empleado encargado de bodega que
//            cierra la caja de los pilotos). Lo de cada usuario manda sobre su rol.
//            Lo que ve sigue siendo SU alcance (G2 su región; G3 y Empleado su tienda).
//            Piloto: solo se le puede quitar (sus pantallas son las de su ruta).
//            Administrador y Desarrollador: todo, no se limitan.
//   false -> todos hacen lo de su rol (no se mira la lista).
// Cómo se guarda (columna permisos, text[]):
//   {} o {*}                -> lo de su rol (así quedan los usuarios de antes)
//   {inicio}                -> ningún módulo (solo Inicio y Mi perfil)
//   {pedidos,caja}          -> esos módulos (aunque su rol no los tenga), cada uno con
//                              las funciones que trae su rol
//   {pedidos,pedidos.ver,pedidos.alistar,caja,caja.ver,caja.cerrar}
//                           -> esos módulos con SOLO esas funciones (sean o no de su rol;
//                              "modulo.ver" = entra al módulo sin ninguna función)
const USAR_PERMISOS = true;

// Grupos de roles (sin Administrador ni Desarrollador: ellos no se limitan)
const ROLES_PERSONAL_TIENDA = ['admin_g1', 'admin_g2', 'admin_g3', 'empleado'];
const ROLES_ADMIN_G1_G3 = ['admin_g1', 'admin_g2', 'admin_g3'];
const ROLES_ADMIN_G1_G2 = ['admin_g1', 'admin_g2'];

// Módulos (en el orden del menú) y sus FUNCIONES. "roles" = los roles que la traen (vienen
// marcadas al crear el usuario); a cada usuario se le pueden quitar o dar otras. Las usa
// cada sección con puedeHacer('pedidos.alistar', loQueDaSuRol). Para agregar una: ponerla
// aquí y en la sección cambiar su regla "x" por "puedeHacer('modulo.funcion', x)".
const MODULOS_USUARIO = [
    { seccion: 'pedidos', nombre: 'Pedidos', icono: 'bi-box-seam', acciones: [
        { clave: 'crear', nombre: 'Registrar pedidos nuevos', roles: ROLES_PERSONAL_TIENDA },
        { clave: 'bodega', nombre: 'Marcar "Recibido en bodega"', roles: ROLES_PERSONAL_TIENDA },
        { clave: 'alistar', nombre: 'Alistar pedidos ("Alistando")', roles: ROLES_PERSONAL_TIENDA },
        { clave: 'despachar', nombre: 'Marcar "Listo para despachar" y aprobar la salida', roles: ROLES_PERSONAL_TIENDA },
        { clave: 'asignar', nombre: 'Asignar piloto y horario, y reprogramar', roles: ROLES_ADMIN_G1_G2 },
        { clave: 'solicitar', nombre: 'Solicitar reasignación', roles: ['admin_g3', 'empleado'] },
        { clave: 'cancelar', nombre: 'Cancelar, devolver y autorizar pedidos', roles: ROLES_ADMIN_G1_G3 },
        { clave: 'solicitudes', nombre: 'Aprobar solicitudes de envío de clientes', roles: ROLES_ADMIN_G1_G3 },
    ] },
    { seccion: 'viajes', nombre: 'Viajes', icono: 'bi-car-front', acciones: [
        { clave: 'solicitar', nombre: 'Registrar viajes para clientes', roles: ROLES_PERSONAL_TIENDA },
    ] },
    { seccion: 'pilotos', nombre: 'Pilotos', icono: 'bi-person-badge', acciones: [] },
    { seccion: 'caja', nombre: 'Caja', icono: 'bi-safe', acciones: [
        { clave: 'cerrar', nombre: 'Cerrar la caja de los pilotos', roles: ROLES_ADMIN_G1_G3 },
    ] },
    { seccion: 'distribucion', nombre: 'Distribución', icono: 'bi-boxes', acciones: [
        { clave: 'bodega', nombre: 'Manejar la bodega del día (carga, devoluciones y cierre)', roles: ROLES_ADMIN_G1_G3 },
        { clave: 'catalogo', nombre: 'Modificar productos y precios', roles: ['admin_g1'] },
    ] },
    { seccion: 'rutas', nombre: 'Rutas y asignaciones', icono: 'bi-signpost-split', acciones: [
        { clave: 'gestionar', nombre: 'Crear rutas y asignar pilotos', roles: ROLES_ADMIN_G1_G2 },
    ] },
    { seccion: 'tiendas', nombre: 'Tiendas y clientes', icono: 'bi-shop', acciones: [
        { clave: 'gestionar', nombre: 'Crear y modificar tiendas y regiones', roles: ['admin_g1'] },
        { clave: 'clientes_crear', nombre: 'Registrar y modificar clientes', roles: ROLES_PERSONAL_TIENDA },
        { clave: 'clientes_administrar', nombre: 'Aprobar y eliminar clientes', roles: ROLES_ADMIN_G1_G3 },
    ] },
    { seccion: 'reportes', nombre: 'Reportes', icono: 'bi-bar-chart', acciones: [
        { clave: 'exportar', nombre: 'Exportar reportes', roles: ['admin_g1', 'admin_g2', 'piloto'] },
    ] },
    { seccion: 'cotizador', nombre: 'Cotizador', icono: 'bi-calculator', acciones: [] },
    { seccion: 'usuarios', nombre: 'Usuarios', icono: 'bi-people', acciones: [
        { clave: 'crear', nombre: 'Crear usuarios (G3 y Empleado: empleados de su tienda, con aprobación)', roles: ROLES_ADMIN_G1_G3 },
        { clave: 'modificar', nombre: 'Modificar, eliminar y aprobar usuarios', roles: ROLES_ADMIN_G1_G2 },
    ] },
    { seccion: 'configuracion', nombre: 'Configuración', icono: 'bi-gear', acciones: [
        { clave: 'general', nombre: 'Cambiar la configuración (tarifas, horarios, vehículos...)', roles: ['admin_g1'] },
    ] },
];

// Secciones que van con el permiso de otro módulo (Clientes es una pestaña de Tiendas)
const MODULO_DE_SECCION = { clientes: 'tiendas' };

// Roles que nunca se limitan por la lista (no se pueden quedar sin acceso)
const ROLES_SIN_LIMITE = ['desarrollador', 'administrador'];

// Secciones que cualquier usuario con sesión puede abrir, sin importar sus permisos
const SECCIONES_LIBRES = ['inicio', 'perfil'];

// Secciones permitidas SEGÚN EL ROL (se aplica siempre, aunque USAR_PERMISOS sea false).
// Si un rol aparece aquí, SOLO puede abrir estas secciones (más SECCIONES_LIBRES);
// el resto del menú le aparece bloqueado con candado.
// Si un rol NO aparece aquí, puede abrir todas.
// Para restringir otro rol, agregar una línea, ej.:  empleado: ['pedidos'],
const SECCIONES_POR_ROL = {
    piloto: ['inicio', 'pedidos', 'reportes', 'viajes', 'caja', 'distribucion'], // Reportes: solo sus pedidos de los últimos 7 días; Viajes: los suyos; Caja: la suya (solo ver); Distribución: su carga y venta en ruta
    cliente: ['inicio', 'viajes', 'envios'],             // solicita y sigue SUS viajes (sql/01 bloque 19) y SUS envíos (bloque 23)
};

// Secciones que dependen de lo que hace la empresa (empresas/empresas.js):
//   viajes                      -> solo si hace viajes (actividad con usa_viajes, ej. Transporte)
//   pedidos, rutas, cotizador   -> solo si hace pedidos (una empresa solo de Transporte no los usa)
const SECCIONES_DE_VIAJES = ['viajes'];
const SECCIONES_DE_PEDIDOS = ['pedidos', 'rutas', 'cotizador'];

// Secciones que dependen del PLAN de la empresa (empresas/empresas.js: FUNCIONES_PLAN)
const SECCIONES_DEL_PLAN = ['pedidos', 'viajes', 'pilotos', 'rutas', 'reportes', 'cotizador', 'caja', 'distribucion'];

// Secciones BLOQUEADAS según el rol: puede abrir todo MENOS estas
// (aparecen con candado en el menú). Útil cuando es más corto decir
// lo que NO puede ver. Ej.:  empleado: ['usuarios', 'reportes'],
const SECCIONES_BLOQUEADAS_POR_ROL = {
    empleado: ['usuarios', 'pilotos', 'reportes', 'rutas', 'caja', 'distribucion'], // sin Usuarios, Pilotos, Reportes, Rutas, Caja ni Distribución
    admin_g3: ['usuarios', 'configuracion'],                 // sin Usuarios ni Configuración
};

// Guarda los datos del usuario:
//   { id, usuario, nombre, rol, tienda: { id, codigo, nombre } | null, region, permisos, foto_url,
//     empresa: { id, codigo, nombre, actividades } | null, cliente_id }
//   rol: 'desarrollador' | 'administrador' | 'admin_g1' | 'admin_g2' | 'admin_g3' | 'empleado' | 'piloto' | 'cliente'
//   cliente_id: solo el rol cliente (su fila en la tabla clientes)
//   tienda: admin_g3, empleado y piloto (null para los demás)
//   region: solo admin_g2 (ej. 'NOR'; null para los demás)
function guardarSesion(datos) {
    try {
        sessionStorage.setItem(CLAVE_SESION, JSON.stringify(datos));
    } catch {
        // El navegador bloqueó el almacenamiento (ej. modo privado muy restrictivo)
    }
    actualizarSegunEmpresa();
}

// Lo que depende de la empresa de la sesión: su paleta (empresas/empresas.js:
// aplicarColoresEmpresa, la de la base o COLORES_POR_EMPRESA), las imágenes de su
// encabezado (aplicarEncabezadoEmpresa -> css/encabezados.css), sus palabras (js/palabras.js: Pedido -> Viaje...), el menú
// (Viajes / Pedidos, js/permisos.js) y los botones del pie (js/pagina_inicial.js).
function actualizarSegunEmpresa() {
    if (typeof aplicarColoresEmpresa === 'function') aplicarColoresEmpresa();
    if (typeof aplicarEncabezadoEmpresa === 'function') aplicarEncabezadoEmpresa(); // css/encabezados.css
    if (typeof refrescarPalabras === 'function') refrescarPalabras();
    if (typeof aplicarPartesEmpresa === 'function') aplicarPartesEmpresa(); // vehículos, km, peso, productos
    if (typeof aplicarPermisos === 'function') aplicarPermisos();
    if (typeof ajustarPie === 'function') ajustarPie();
}

// Devuelve los datos del usuario, o null si no hay sesión
function obtenerSesion() {
    try {
        return JSON.parse(sessionStorage.getItem(CLAVE_SESION));
    } catch {
        return null;
    }
}

// Borra la sesión (se usa en "Cerrar sesión")
function cerrarSesion() {
    try {
        sessionStorage.removeItem(CLAVE_SESION);
    } catch {
        // nada que borrar
    }
    actualizarSegunEmpresa(); // vuelven los colores y las palabras de la marca
}

// ---------- Empresa (sql/01 bloque 16) ----------
// sesion.empresa = { id, codigo, nombre, actividades } o null si la base todavía
// no tiene empresas. Cada usuario trabaja con la suya; el Desarrollador elige con
// cuál en el menú del usuario (js/menu-usuario.js) o en Tiendas -> Empresas.
// js/supabase.js filtra por esta empresa todo lo que lee y la pone en lo que crea.
function empresaActual() {
    const sesion = obtenerSesion();
    return sesion && sesion.empresa ? sesion.empresa : null;
}

function empresaActivaId() {
    const empresa = empresaActual();
    return empresa ? empresa.id : null;
}

// Solo lo que la sesión necesita de una fila de la tabla empresas.
// colores: su paleta (sql/01 bloque 21); empresas/empresas.js la pinta al guardar la sesión.
function datosEmpresaSesion(empresa) {
    return empresa
        ? {
            id: empresa.id, codigo: empresa.codigo || null, nombre: empresa.nombre,
            actividades: empresa.actividades || [], colores: empresa.colores || {},
            // plan de pago y funciones habilitadas (sql/01 bloque 22); null = todas
            plan: empresa.plan || 'completo', funciones: Array.isArray(empresa.funciones) ? empresa.funciones : null,
        }
        : null;
}

// Cambia la empresa activa (Desarrollador, o al modificar la propia) y conserva lo demás
function cambiarEmpresaActiva(empresa) {
    const sesion = obtenerSesion();
    if (!sesion) return;
    guardarSesion({ ...sesion, empresa: datosEmpresaSesion(empresa) });
}

// ---------- Roles ----------
// administrador -> todo
// admin_g1      -> todo el país: gestiona Empleados y Pilotos; en Tiendas
//                  crea y modifica datos (no elimina ni cambia códigos)
// admin_g2      -> SOLO su región: gestiona Empleados y Pilotos de las
//                  tiendas de su región; en Tiendas solo ve (su región)
// admin_g3      -> administrador local de SU tienda: crea Empleados (quedan
//                  pendientes hasta que los apruebe G2 o superior), administra
//                  los clientes de su tienda; en Tiendas solo ve la suya
// empleado      -> usuario de una tienda (funciones por definir)
// piloto        -> conductor de una tienda (funciones por definir)
// Se usan para mostrar u ocultar acciones en las secciones.
// ⚠ Solo controlan la página; la protección real llegará en la Fase 7.

// Rol del usuario conectado ('administrador', 'admin_g1', 'admin_g2', 'admin_g3',
// 'empleado' o 'piloto') o null
function rolActual() {
    const sesion = obtenerSesion();
    return sesion ? sesion.rol : null;
}

// Desarrollador: por ENCIMA del Administrador (todos los privilegios). Nadie lo
// asigna desde la página y los demás usuarios no lo ven. Se crea solo por SQL.
function esDesarrollador() {
    return rolActual() === 'desarrollador';
}

// El Administrador es el de la empresa que usa el sistema. Todo lo que puede
// hacer el Administrador también lo puede hacer el Desarrollador.
function esAdministrador() {
    return rolActual() === 'administrador' || esDesarrollador();
}

function esAdminG1() {
    return rolActual() === 'admin_g1';
}

function esAdminG2() {
    return rolActual() === 'admin_g2';
}

function esAdminG3() {
    return rolActual() === 'admin_g3';
}

// Id de la tienda del usuario conectado (Admin G3, Empleado y Piloto) o null
function tiendaActual() {
    const sesion = obtenerSesion();
    return sesion && sesion.tienda ? sesion.tienda.id : null;
}

// Región del usuario conectado (ej. 'NOR'). Solo la tiene el Admin G2; los demás null.
function regionActual() {
    const sesion = obtenerSesion();
    return sesion ? sesion.region || null : null;
}

// Cliente con usuario (sql/01 bloque 19): solo ve Inicio, Viajes y Mi perfil
function esCliente() {
    return rolActual() === 'cliente';
}

// Id del cliente (tabla clientes) del usuario cliente conectado, o null
function clienteActual() {
    const sesion = obtenerSesion();
    return sesion ? sesion.cliente_id || null : null;
}

// ---------- Visitas (sql/01 bloque 36) ----------
// Cada ingreso y cada pantalla abierta se anota en la tabla visitas (la IP y el país
// los pone la base). El reporte solo lo ve el Desarrollador (Tiendas -> Visitas) y
// se guarda 3 días. Las visitas del Desarrollador no se anotan. Si falla, no se avisa.

// Sistema, tipo de equipo, navegador y si se abrió desde la app instalada
function datosDispositivo() {
    const ua = navigator.userAgent || '';
    const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const so = /Android/.test(ua) ? 'Android' : /iPhone|iPod/.test(ua) ? 'iPhone' : ipad ? 'iPad'
        : /Windows/.test(ua) ? 'Windows' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook'
        : /Linux/.test(ua) ? 'Linux' : 'Otro';
    const equipo = /Mobi|iPhone|iPod/.test(ua) ? 'celular' : (so === 'Android' || ipad) ? 'tableta' : 'PC';
    const navegadores = [
        ['Edge', /Edg(?:A|iOS)?\/(\d+)/], ['Samsung Internet', /SamsungBrowser\/(\d+)/], ['Opera', /OPR\/(\d+)/],
        ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/], ['Chrome', /(?:Chrome|CriOS)\/(\d+)/], ['Safari', /Version\/(\d+).*Safari/],
    ];
    const [nombre, version] = navegadores.map(([n, re]) => [n, (ua.match(re) || [])[1]]).find(([, v]) => v) || ['Otro'];
    let app = navigator.standalone === true;
    try { app = app || matchMedia('(display-mode: standalone)').matches; } catch { /* navegador viejo */ }
    return { dispositivo: `${so} · ${equipo}`, navegador: version ? `${nombre} ${version}` : nombre, app };
}

let ultimaVisita = { clave: '', hora: 0 };

// tipo: 'ingreso' (al iniciar sesión) o 'pantalla' (al abrir una sección)
function registrarVisita(tipo, seccion = null) {
    const sesion = obtenerSesion();
    if (!sesion || !sesion.id || sesion.rol === 'desarrollador' || typeof db === 'undefined') return;
    // La misma pantalla abierta dos veces seguidas (ej. al volver a cargar) cuenta una vez
    const clave = `${sesion.id}:${tipo}:${seccion}`;
    if (clave === ultimaVisita.clave && Date.now() - ultimaVisita.hora < 5000) return;
    ultimaVisita = { clave, hora: Date.now() };
    const d = datosDispositivo();
    db.rpc('registrar_visita', {
        p_usuario: sesion.id, p_tipo: tipo, p_seccion: seccion,
        p_dispositivo: d.dispositivo, p_navegador: d.navegador, p_app: d.app,
    }).then(({ error }) => {
        // PGRST202 / 42883: la base todavía no tiene el bloque 36
        if (error && !['PGRST202', '42883'].includes(error.code)) console.warn('No se anotó la visita:', error.message);
    }, () => { /* sin conexión: no importa */ });
}

// ¿La sección tiene sentido para lo que hace la empresa? (Viajes / Pedidos) ¿y su plan la incluye?
function seccionAplica(seccion) {
    if (SECCIONES_DEL_PLAN.includes(seccion) && typeof funcionHabilitada === 'function' && !funcionHabilitada(seccion)) return false;
    // "Mis envíos": solo el cliente, si la empresa hace encomiendas y su plan lo incluye (sql/01 bloque 23)
    if (seccion === 'envios') {
        return esCliente() && typeof empresaTieneRecoleccion === 'function' && empresaTieneRecoleccion()
            && (typeof funcionHabilitada !== 'function' || funcionHabilitada('envios_clientes'));
    }
    if (SECCIONES_DE_VIAJES.includes(seccion) && typeof empresaTieneViajes === 'function') return empresaTieneViajes();
    // Caja: solo si alguna actividad de la empresa cierra caja (sql/01 bloque 30)
    if (seccion === 'caja' && typeof empresaUsa === 'function' && !empresaUsa('caja')) return false;
    // Distribución: solo si alguna actividad de la empresa usa productos (sql/01 bloque 26)
    if (seccion === 'distribucion' && typeof empresaUsa === 'function' && !empresaUsa('productos')) return false;
    // Cotizador: cobra por peso y distancia; sin ninguna de las dos no tiene sentido (sql/01 bloque 26)
    if (seccion === 'cotizador' && typeof empresaUsa === 'function' && !empresaUsa('peso') && !empresaUsa('km')) return false;
    if (SECCIONES_DE_PEDIDOS.includes(seccion) && typeof empresaTienePedidos === 'function') return empresaTienePedidos();
    return true;
}

// ¿Su ROL le permite esa sección? (SECCIONES_POR_ROL y SECCIONES_BLOQUEADAS_POR_ROL)
function rolPermiteSeccion(rol, seccion) {
    const delRol = SECCIONES_POR_ROL[rol];
    if (delRol && !delRol.includes(seccion)) return false;
    return !(SECCIONES_BLOQUEADAS_POR_ROL[rol] || []).includes(seccion);
}

// Roles a los que se les puede DAR módulos y funciones de otros roles (el personal).
// Al piloto solo se le puede quitar.
const ROLES_CON_EXTRAS = ['admin_g1', 'admin_g2', 'admin_g3', 'empleado'];

// Módulos para el formulario de Usuarios ("Módulos y funciones") de un usuario de ese rol,
// en la empresa activa: [{ seccion, nombre, icono, delRol, acciones: [{ clave, nombre, delRol }] }].
// delRol = lo trae su rol (viene marcado al crearlo). Al personal se le ofrecen TODOS; al
// piloto, solo los suyos. [] para Administrador y Desarrollador.
function modulosDelRol(rol) {
    if (ROLES_SIN_LIMITE.includes(rol)) return [];
    const extras = ROLES_CON_EXTRAS.includes(rol);
    return MODULOS_USUARIO
        .filter((m) => seccionAplica(m.seccion) && (extras || rolPermiteSeccion(rol, m.seccion))
            && !(m.seccion === 'reportes' && rol === 'piloto' && typeof empresaTienePedidos === 'function' && !empresaTienePedidos()))
        .map((m) => ({
            ...m,
            delRol: rolPermiteSeccion(rol, m.seccion),
            acciones: m.acciones.filter((a) => extras || a.roles.includes(rol))
                .map((a) => ({ ...a, delRol: a.roles.includes(rol) })),
        }));
}

// ¿La lista dice algo? ({} o {*} = no: manda el rol)
const listaPermisosPropia = (permisos) => Array.isArray(permisos) && permisos.length > 0 && !permisos.includes('*');

// ¿Le toca ese módulo ('pedidos') o esa función ('pedidos.alistar') según su lista "permisos"?
// porRol = lo que le da su rol: es la respuesta si la lista no dice nada de eso (lista vacía
// o {*}; o el módulo está pero sin ninguna "modulo.x" = las funciones de su rol).
function permisoDeLista(permisos, clave, porRol) {
    if (!listaPermisosPropia(permisos)) return porRol;
    const [seccion, accion] = String(clave).split('.');
    const modulo = MODULO_DE_SECCION[seccion] || seccion;
    if (!permisos.includes(modulo)) return false;
    if (!accion) return true;
    const suyas = permisos.filter((p) => p.startsWith(`${modulo}.`));
    return suyas.length ? suyas.includes(`${modulo}.${accion}`) : porRol;
}

// ¿El usuario conectado puede hacer esa función? ('pedidos.crear', 'caja.cerrar'...)
//   porRol: lo que la sección le permite por su ROL (el valor de siempre).
//   Personal (G1, G2, G3, Empleado): manda lo marcado en SU usuario; sin nada marcado, su rol.
//   Piloto: su rol, y se le puede quitar. Administrador, Desarrollador y Cliente: su rol.
// Lo que VE (su región, su tienda) lo sigue decidiendo cada sección según el rol.
function puedeHacer(clave, porRol = true) {
    const sesion = obtenerSesion();
    if (!sesion) return false;
    if (!USAR_PERMISOS || ROLES_SIN_LIMITE.includes(sesion.rol) || sesion.rol === 'cliente') return porRol;
    if (!ROLES_CON_EXTRAS.includes(sesion.rol)) return porRol && permisoDeLista(sesion.permisos, clave, true);
    return permisoDeLista(sesion.permisos, clave, porRol);
}

// true si el usuario actual puede abrir esa sección.
// Orden de las reglas:
//   1. Sin sesión -> nada.
//   2. SECCIONES_LIBRES (inicio, perfil) -> siempre.
//   3. Lo de su ROL: SECCIONES_POR_ROL (solo esas) y SECCIONES_BLOQUEADAS_POR_ROL (menos esas).
//   4. Personal (G1, G2, G3, Empleado): manda su lista "permisos" (puede darle módulos que
//      su rol no tiene); sin lista, su rol. Piloto: su rol, y se le pueden quitar.
//      Administrador, Desarrollador y Cliente: su rol.
function tienePermiso(seccion) {
    const sesion = obtenerSesion();
    if (!sesion) return false;
    if (SECCIONES_LIBRES.includes(seccion)) return true;

    // Viajes solo si la empresa hace viajes; Pedidos, Rutas y Cotizador solo si hace pedidos
    if (!seccionAplica(seccion)) return false;
    // El conductor (piloto) de una empresa solo de viajes no tiene reporte: el de Reportes es de pedidos
    if (seccion === 'reportes' && sesion.rol === 'piloto' && typeof empresaTienePedidos === 'function' && !empresaTienePedidos()) return false;

    // Empresas internas y Visitas (pestañas de Tiendas): solo el Desarrollador
    if (seccion === 'empresas-internas' || seccion === 'visitas') return sesion.rol === 'desarrollador';

    return puedeHacer(seccion, rolPermiteSeccion(sesion.rol, seccion));
}
