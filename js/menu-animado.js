/* ==================================================
   ANIMACIÓN DE ENTRADA DEL MENÚ LATERAL
   ACACHETE LOGISTICS

   Qué hace: los ítems del menú aparecen uno por uno
   (efecto "cascada"). Se ejecuta al cargar la página y
   otra vez al iniciar sesión (js/secciones/loggin.js),
   para que se note que las opciones se desbloquearon.

   Dónde se usa: app.html, en los <li class="menu-item">
   de .menu-lateral.

   Estilos relacionados (css/index.css, bloque "Menú lateral"):
     - .oculto y .visible -> estado inicial/final de la cascada
     - .menu-item a:hover -> efecto al pasar el mouse
   ================================================== */

function animarMenu() {
    const items = document.querySelectorAll('.menu-item');

    // Todos los ítems empiezan con la clase "oculto" (invisibles y un poco a la izquierda).
    // Luego, cada uno cambia a "visible" con un pequeño retraso respecto al anterior.
    items.forEach((item) => {
        item.classList.remove('visible');
        item.classList.add('oculto');
    });

    // Fuerza al navegador a aplicar "oculto" antes de empezar
    // (si no, al volver a mostrar el menú la transición no se ve).
    void document.body.offsetWidth;

    items.forEach((item, index) => {
        setTimeout(() => {
            item.classList.remove('oculto');
            item.classList.add('visible');
        }, index * 60); // 60ms de diferencia entre cada item (subir el número = cascada más lenta)
    });
}

// Al abrir la página
animarMenu();
