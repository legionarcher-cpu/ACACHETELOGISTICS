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

// NOTA: "Mi perfil" (#perfil) y "Configuración" (#configuracion) son enlaces
// con #, así que los carga js/pagina_inicial.js como cualquier sección.
// Para que funcionen hay que crear secciones/perfil.html y secciones/configuracion.html.
