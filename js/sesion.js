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

// ¿Se bloquean secciones según la columna "permisos" de la tabla usuarios?
//   false -> POR AHORA: todo usuario que exista puede abrir todas las secciones.
//   true  -> cada usuario solo abre las secciones de su lista de permisos
//            (ej. {pedidos,rutas}; {*} = todas).
const USAR_PERMISOS = false;

// Secciones que cualquier usuario con sesión puede abrir, sin importar sus permisos
const SECCIONES_LIBRES = ['inicio', 'perfil'];

// Secciones permitidas SEGÚN EL ROL (se aplica siempre, aunque USAR_PERMISOS sea false).
// Si un rol aparece aquí, SOLO puede abrir estas secciones (más SECCIONES_LIBRES);
// el resto del menú le aparece bloqueado con candado.
// Si un rol NO aparece aquí, puede abrir todas.
// Para restringir otro rol, agregar una línea, ej.:  empleado: ['pedidos'],
const SECCIONES_POR_ROL = {
    piloto: ['inicio', 'pedidos', 'reportes'], // Reportes: solo sus pedidos de los últimos 7 días
};

// Secciones BLOQUEADAS según el rol: puede abrir todo MENOS estas
// (aparecen con candado en el menú). Útil cuando es más corto decir
// lo que NO puede ver. Ej.:  empleado: ['usuarios', 'reportes'],
const SECCIONES_BLOQUEADAS_POR_ROL = {
    empleado: ['usuarios', 'pilotos', 'reportes', 'rutas'], // sin Usuarios, Pilotos, Reportes ni Rutas
    admin_g3: ['usuarios', 'configuracion'],                 // sin Usuarios ni Configuración
};

// Guarda los datos del usuario:
//   { id, usuario, nombre, rol, tienda: { id, codigo, nombre } | null, region, permisos, foto_url,
//     empresa: { id, codigo, nombre, actividades } | null }
//   rol: 'desarrollador' | 'administrador' | 'admin_g1' | 'admin_g2' | 'admin_g3' | 'empleado' | 'piloto'
//   tienda: admin_g3, empleado y piloto (null para los demás)
//   region: solo admin_g2 (ej. 'NOR'; null para los demás)
function guardarSesion(datos) {
    try {
        sessionStorage.setItem(CLAVE_SESION, JSON.stringify(datos));
    } catch {
        // El navegador bloqueó el almacenamiento (ej. modo privado muy restrictivo)
    }
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

// Solo lo que la sesión necesita de una fila de la tabla empresas
function datosEmpresaSesion(empresa) {
    return empresa
        ? { id: empresa.id, codigo: empresa.codigo || null, nombre: empresa.nombre, actividades: empresa.actividades || [] }
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

// true si el usuario actual puede abrir esa sección.
// Orden de las reglas:
//   1. Sin sesión -> nada.
//   2. SECCIONES_LIBRES (inicio, perfil) -> siempre.
//   3. Si su rol está en SECCIONES_POR_ROL -> solo esas secciones.
//   4. Si la sección está en SECCIONES_BLOQUEADAS_POR_ROL de su rol -> no.
//   5. Si USAR_PERMISOS es false -> todo lo demás.
//   6. Si no, según la columna "permisos" del usuario.
function tienePermiso(seccion) {
    const sesion = obtenerSesion();
    if (!sesion) return false;
    if (SECCIONES_LIBRES.includes(seccion)) return true;

    // Empresas (pestaña de Tiendas): solo el Desarrollador
    if (seccion === 'empresas') return sesion.rol === 'desarrollador';

    const delRol = SECCIONES_POR_ROL[sesion.rol];
    if (delRol) return delRol.includes(seccion);

    const bloqueadas = SECCIONES_BLOQUEADAS_POR_ROL[sesion.rol] || [];
    if (bloqueadas.includes(seccion)) return false;

    if (!USAR_PERMISOS) return true;

    const permisos = sesion.permisos || [];
    return permisos.includes('*') || permisos.includes(seccion);
}
