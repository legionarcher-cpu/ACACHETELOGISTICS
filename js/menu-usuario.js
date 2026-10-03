/* ==================================================
   MENÚ DESPLEGABLE DEL USUARIO
   ACACHETE LOGISTICS

   Qué hace: abre/cierra el menú que aparece al hacer clic
   sobre el avatar y nombre del usuario (esquina superior
   derecha), y maneja el botón "Cerrar sesión".

   Dónde se usa: index.html, dentro de .info-user:
     #userTrigger     -> botón con avatar + nombre (abre/cierra)
     #userMenu        -> el menú desplegable
     #btnCerrarSesion -> opción "Cerrar sesión"

   Cómo se muestra/oculta: este archivo solo agrega o quita
   la clase "abierto" en #userMenu. Lo que hace visible el
   menú (con su fundido) es la regla  .user-menu.abierto  en css/index.css.
   ================================================== */

const trigger = document.getElementById('userTrigger');
const menu = document.getElementById('userMenu');

// Clic en el avatar/nombre: si el menú está cerrado lo abre, si está abierto lo cierra.
trigger.addEventListener('click', () => {
    menu.classList.toggle('abierto');
});

// Cierra el menú si el usuario hace clic fuera de él
document.addEventListener('click', (evento) => {
    if (!trigger.contains(evento.target) && !menu.contains(evento.target)) {
        menu.classList.remove('abierto');
    }
});

// Botón "Cerrar sesión": borra la sesión y muestra el login en el
// cuerpo principal, SIN recargar la página.
document.getElementById('btnCerrarSesion').addEventListener('click', (evento) => {
    evento.preventDefault(); // evita que el enlace href="#" mueva la página
    menu.classList.remove('abierto');
    cerrarSesion();         // js/sesion.js
    aplicarPermisos();      // js/permisos.js -> bloquea el menú y oculta el usuario
    limpiarHash();          // js/pagina_inicial.js -> el próximo usuario empieza en inicio
    mostrarSeccionActual(); // js/pagina_inicial.js -> como no hay sesión, muestra el login
});

// ---------- Empresa (sql/01 bloque 16) ----------
// Muestra la empresa del usuario ("01 · Empresa principal"). El Desarrollador la
// cambia con el selector: se guarda en la sesión (js/sesion.js) y se recarga la
// sección, que ya lee solo lo de esa empresa (js/supabase.js).
const cajaEmpresa = document.getElementById('userEmpresa');
const selEmpresa = document.getElementById('userEmpresaElegir');
const nombreEmpresaMenu = (e) => (e.codigo ? `${e.codigo} · ${e.nombre}` : e.nombre);

async function pintarEmpresaMenu() {
    const empresa = typeof empresaActual === 'function' ? empresaActual() : null;
    cajaEmpresa.hidden = !empresa;
    if (!empresa) return;
    const texto = document.getElementById('userEmpresaNombre');
    texto.textContent = nombreEmpresaMenu(empresa);
    const puedeCambiar = esDesarrollador();
    texto.hidden = puedeCambiar;
    selEmpresa.hidden = !puedeCambiar;
    if (!puedeCambiar) return;
    const { data, error } = await db.from('empresas').select('id, codigo, nombre, actividades, activa').order('codigo');
    if (error) return;
    selEmpresa.replaceChildren(...data.map((e) => new Option(e.activa ? nombreEmpresaMenu(e) : `${nombreEmpresaMenu(e)} (inactiva)`, e.id)));
    selEmpresa.value = String(empresa.id);
    selEmpresa.empresas = data;
}

trigger.addEventListener('click', () => {
    if (menu.classList.contains('abierto')) pintarEmpresaMenu();
});

selEmpresa.addEventListener('change', () => {
    const elegida = (selEmpresa.empresas || []).find((e) => String(e.id) === selEmpresa.value);
    if (!elegida) return;
    cambiarEmpresaActiva(elegida); // js/sesion.js
    menu.classList.remove('abierto');
    mostrarSeccionActual();        // js/pagina_inicial.js: la sección se recarga con la otra empresa
});

// Sesión iniciada antes de existir las empresas (o sin el ID): se completa una vez
(async () => {
    const sesion = obtenerSesion();
    if (!sesion || ('empresa' in sesion && (!sesion.empresa || 'codigo' in sesion.empresa))) return;
    const { data, error } = await db.from('usuarios')
        .select('rol, empresas(id, codigo, nombre, actividades, activa)').eq('id', sesion.id).maybeSingle();
    if (error || !data) return; // base sin empresas: sigue como antes
    let empresa = data.empresas;
    if (!empresa && data.rol === 'desarrollador') {
        const r = await db.from('empresas').select('id, codigo, nombre, actividades, activa')
            .eq('activa', true).order('codigo').limit(1).maybeSingle();
        empresa = r.data || null;
    }
    cambiarEmpresaActiva(empresa);
    if (empresa) mostrarSeccionActual();
})();

// NOTA: "Mi perfil" (#perfil) y "Configuración" (#configuracion) son enlaces
// con #, así que los carga js/pagina_inicial.js como cualquier sección.
// Para que funcionen hay que crear secciones/perfil.html y secciones/configuracion.html.
