/* ==================================================
   PERMISOS DEL INDEX
   ACACHETE LOGISTICS

   Qué hace: ajusta el index según quién inició sesión,
   SIN recargar la página:
     - Sin sesión: agrega la clase "sin-sesion" al <html>
       (oculta el usuario y los botones del pie, ver css/index.css)
       y bloquea todo el menú.
     - Con sesión: pone el nombre del usuario en el encabezado
       y bloquea solo las secciones que su rol no permite
       (quedan grises, con candado y no se pueden abrir).

   aplicarPermisos() se ejecuta al abrir la página y se vuelve
   a llamar al iniciar sesión (js/secciones/loggin.js) y al
   cerrarla (js/menu-usuario.js).

   Además, js/pagina_inicial.js revisa tienePermiso() antes de
   cargar una sección, por si alguien escribe el # a mano en la URL.

   Necesita: js/sesion.js y js/avatar.js cargados antes.
   Los permisos de cada usuario vienen de la columna "permisos" de la
   tabla usuarios (Supabase). Por ahora están desactivados:
   USAR_PERMISOS = false en js/sesion.js (todos ven todo).
   ================================================== */

function aplicarPermisos() {
    const sesion = obtenerSesion();

    // Estado general de la página (estilos en css/index.css: html.sin-sesion)
    document.documentElement.classList.toggle('sin-sesion', !sesion);

    // Rol en <html data-rol="..."> para que el CSS oculte cosas según el rol
    // (ej. los botones del pie para los pilotos, ver css/index.css)
    document.documentElement.dataset.rol = sesion ? sesion.rol : '';

    // Nombre del usuario en el encabezado
    const nombreUsuario = document.querySelector('.user-nombre');
    if (nombreUsuario) nombreUsuario.textContent = sesion ? sesion.nombre : '';

    // Foto del usuario en el encabezado (o sus iniciales). pintarAvatar está en js/avatar.js
    const avatar = document.querySelector('.user-avatar');
    if (avatar) pintarAvatar(avatar, sesion ? sesion.nombre : '', sesion ? sesion.foto_url : null);

    // Campana de notificaciones: se enciende con sesión y se apaga sin ella (js/notificaciones.js)
    if (sesion) iniciarNotificaciones();
    else detenerNotificaciones();

    // Bloquear / desbloquear cada opción del menú
    document.querySelectorAll('.menu-item a').forEach((enlace) => {
        const seccion = enlace.getAttribute('href').slice(1); // "#pedidos" -> "pedidos"
        const bloqueado = !tienePermiso(seccion);
        const candado = enlace.querySelector('.candado');

        enlace.parentElement.classList.toggle('bloqueado', bloqueado); // estilo gris (css/index.css)

        if (bloqueado) {
            enlace.setAttribute('aria-disabled', 'true'); // lectores de pantalla
            enlace.tabIndex = -1;                         // no se llega con Tab
            enlace.title = 'No tienes permiso para esta sección';
            if (!candado) enlace.insertAdjacentHTML('beforeend', '<i class="bi bi-lock-fill candado"></i>');
        } else {
            enlace.removeAttribute('aria-disabled');
            enlace.removeAttribute('tabindex');
            enlace.removeAttribute('title');
            if (candado) candado.remove();
        }
    });
}

// Un solo "escuchador" para todo el menú: si se hace clic en una
// opción bloqueada, se cancela el clic (no cambia el # de la URL).
document.querySelector('.menu-lista').addEventListener('click', (evento) => {
    const item = evento.target.closest('.menu-item');
    if (item && item.classList.contains('bloqueado')) evento.preventDefault();
});

// Al abrir la página
aplicarPermisos();
