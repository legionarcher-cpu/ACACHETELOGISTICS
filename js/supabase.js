/* ==================================================
   CONEXIÓN CON SUPABASE (base de datos)
   ACACHETE LOGISTICS

   Qué hace: crea "db", el objeto con el que todo el
   proyecto lee y escribe en la base de datos.

   Lo usan:
     - js/secciones/loggin.js   -> valida usuario y clave
     - js/secciones/usuarios.js -> lista, crea, modifica y elimina usuarios

   Necesita: la librería de Supabase cargada antes en app.html
   (https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2).

   Dónde se sacan estos datos:
     Supabase -> tu proyecto -> Project Settings -> API
       SUPABASE_URL      -> "Project URL"
       SUPABASE_ANON_KEY -> "anon public"

   La clave "anon" es PÚBLICA: está hecha para ir en la página.
   NUNCA poner aquí la clave "service_role" (da control total).

   SESIÓN (Supabase Auth): al iniciar sesión (js/secciones/loggin.js)
   cada consulta va con la sesión del usuario y la base decide qué
   puede ver y cambiar (reglas RLS, sql/instalacion/11_acceso_web.sql).
   La sesión de Supabase se guarda en sessionStorage, como la de la
   página (js/sesion.js): se cierra al cerrar la pestaña.

   Estructura de la base: sql/instalacion/ (un archivo por módulo, ver sql/LEEME.md)

   MULTIMARCA: si la empresa activa tiene su propia base de datos
   (campo "supabase" en empresas/empresas.js), se usa esa. Si no, la
   de abajo.
   ================================================== */

const SUPABASE_URL_BASE = 'https://cfypcaejgdomytgyltdf.supabase.co';
const SUPABASE_ANON_KEY_BASE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmeXBjYWVqZ2RvbXl0Z3lsdGRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MjYwMDYsImV4cCI6MjEwNjIwMjAwNn0.vs8RTsi5yg0sCPHA-RajOvV71Dwrh9WV1YGOjEynT2o';

const conexionEmpresa = (typeof EMPRESA !== 'undefined' && EMPRESA.supabase) || {};
const SUPABASE_URL = conexionEmpresa.url || SUPABASE_URL_BASE;
const SUPABASE_ANON_KEY = conexionEmpresa.anonKey || SUPABASE_ANON_KEY_BASE;

// sessionStorage o, si el navegador lo bloquea, el almacén por defecto de Supabase
function almacenSesionAuth() {
    try {
        return window.sessionStorage;
    } catch {
        return undefined;
    }
}

// Cliente de la base de datos. Ejemplo de uso:
//   const { data, error } = await db.from('tiendas').select('*');
// (En usuarios no se usa '*': la columna clave no se puede leer. Nombrar las columnas.)
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: almacenSesionAuth(),
        // Una sesión por marca (como CLAVE_SESION en js/sesion.js)
        storageKey: `acachete-auth-${typeof EMPRESA_ACTIVA !== 'undefined' ? EMPRESA_ACTIVA : 'base'}`,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
    },
});

// Correo interno con el que cada usuario entra a Supabase Auth: "jperez01" ->
// "jperez01@acachete.interno". Nadie lo ve ni lo escribe: la persona solo pone su usuario.
// Debe ser igual al de la base (correo_interno en sql/instalacion/01_base.sql).
const DOMINIO_USUARIOS = 'acachete.interno';

function correoInterno(usuario) {
    return `${String(usuario || '').trim().toLowerCase()}@${DOMINIO_USUARIOS}`;
}

// Si se perdió la sesión de Supabase (venció, se cerró en otra pestaña o se borró el
// usuario) pero la página todavía cree tener una, se vuelve al login
function salirSinAcceso() {
    if (typeof obtenerSesion !== 'function' || !obtenerSesion()) return;
    cerrarSesion(); // js/sesion.js
    if (typeof aplicarPermisos === 'function') aplicarPermisos();         // js/permisos.js
    if (typeof mostrarSeccionActual === 'function') mostrarSeccionActual(); // js/pagina_inicial.js
}

// (setTimeout: Supabase pide no llamar a sus funciones de sesión dentro de este aviso)
db.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') setTimeout(salirSinAcceso, 0);
});
document.addEventListener('DOMContentLoaded', () => {
    db.auth.getSession().then(({ data }) => {
        if (!data || !data.session) salirSinAcceso();
    }, () => { /* sin conexión: se revisa en la próxima consulta */ });
});

// ---------- Empresa ----------
// Tablas que tienen empresa_id. Con sesión iniciada, db.from() de estas tablas:
//   - select          -> solo las filas de la empresa activa (empresaActivaId(), js/sesion.js)
//   - insert / upsert -> les pone empresa_id si no lo traen
//   - update / delete -> SOLO tocan filas de la empresa activa (aunque la condición
//                        sea amplia, nunca alcanzan a otra empresa)
//   - delete SIN empresa activa -> no se borra nada: devuelve un error
//     (code 'SIN_EMPRESA'). Primero hay que saber qué empresa se está limpiando.
// Usuarios: solo los de la empresa; el Desarrollador además ve las filas sin
// empresa (la suya). Nadie, salvo el Desarrollador, sabe qué otras empresas existen.
// La base hace cumplir lo mismo con sus reglas (RLS): este filtro es para que cada
// consulta traiga solo la empresa activa (el Desarrollador ve todas en la base).
// Para leer de TODAS las empresas (sección Empresas): db.fromTodas('tiendas').
// En pedidos, rutas, tiendas, usuarios, tarifas y descuentos la base corrige
// empresa_id según su tienda o región (triggers), así que siempre queda bien.
// (articulos_catalogo va por su categoría, que sí es de la empresa.)
const TABLAS_POR_EMPRESA = new Set([
    'regiones', 'tiendas', 'usuarios', 'clientes', 'rutas', 'vehiculos', 'pedidos',
    'categorias_mercaderia', 'tarifas', 'descuentos', 'motivos_retraso',
    'configuracion', // ajustes de la empresa (número de pedido, código de respaldo, radio de marca)
    'horarios_dias', 'horarios', 'horarios_capacidad', // horarios del piloto y slots de despacho
    'pedido_solicitudes', // solicitudes de envío de los clientes
    'cajas', 'cierres_caja', // caja de pilotos y conductores
    'ubicaciones_pilotos', // última posición del piloto en ruta
    // Distribuidora
    'productos', 'producto_presentaciones', 'listas_precios', 'precios', 'motivos_entrega_parcial',
    'bodegas_dia', 'bodega_movimientos', 'cierres_mercaderia',
    // Transporte
    'viajes', 'cortesias', 'transporte_config', 'transporte_franjas', 'transporte_dias_cerrados', 'transporte_bloqueos',
    // Costos de operación
    'costos_operacion', 'costos_config',
    // Recolecciones con agenda
    'recolecciones', 'recoleccion_config', 'recoleccion_bloqueos', 'recoleccion_tarifas', 'recoleccion_cargos',
]);

const dbFromOriginal = db.from.bind(db);

// Id de la empresa activa o null (sin sesión, en el login, o base sin el bloque 16)
function empresaParaConsultas() {
    return typeof empresaActivaId === 'function' ? empresaActivaId() : null;
}

// Consulta que no va a la base: se puede encadenar (.eq, .in, .select...) y al
// esperarla devuelve { data: null, error } sin tocar nada
function consultaRechazada(code, message) {
    const resultado = { data: null, error: { code, message } };
    const falsa = new Proxy({}, {
        get(_, propiedad) {
            if (propiedad === 'then') return (ok, mal) => Promise.resolve(resultado).then(ok, mal);
            return () => falsa;
        },
    });
    return falsa;
}

function consultaPorEmpresa(tabla, porEmpresa) {
    const consulta = dbFromOriginal(tabla);
    if (!porEmpresa || !TABLAS_POR_EMPRESA.has(tabla)) return consulta;
    const empresa = empresaParaConsultas();
    if (!empresa) {
        // Sin empresa no se sabe qué se está limpiando: no se borra nada
        consulta.delete = () => {
            console.error(`No se borró nada de "${tabla}": no hay empresa activa.`);
            return consultaRechazada('SIN_EMPRESA', 'No hay empresa activa: no se borró nada.');
        };
        return consulta;
    }
    // Usuarios: cada uno ve SOLO los de su empresa. El Desarrollador (sin empresa)
    // también se ve a sí mismo (perfil, foto); nadie más lo ve.
    const deLaEmpresa = (resultado) => (tabla === 'usuarios' && typeof esDesarrollador === 'function' && esDesarrollador()
        ? resultado.or(`empresa_id.eq.${empresa},empresa_id.is.null`)
        : resultado.eq('empresa_id', empresa));
    ['select', 'insert', 'upsert', 'update', 'delete'].forEach((metodo) => {
        const original = consulta[metodo].bind(consulta);
        consulta[metodo] = (...args) => {
            if (metodo === 'insert' || metodo === 'upsert') {
                const conEmpresa = (fila) => (fila && fila.empresa_id === undefined ? { ...fila, empresa_id: empresa } : fila);
                args[0] = Array.isArray(args[0]) ? args[0].map(conEmpresa) : conEmpresa(args[0]);
                return original(...args);
            }
            return deLaEmpresa(original(...args));
        };
    });
    return consulta;
}

db.from = (tabla) => consultaPorEmpresa(tabla, true);
db.fromTodas = (tabla) => consultaPorEmpresa(tabla, false);
