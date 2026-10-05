/* ==================================================
   RESPONSIVE - LÓGICA
   ACACHETE LOGISTICS

   Archivo aparte: NO modifica los JS existentes. Solo agrega:
     1. Botón ☰ en el encabezado que abre / cierra el menú lateral
        en tablet y celular (≤ 900px). Los estilos están en
        responsive/responsive.css (<html class="resp-menu-abierto">).
     2. Fondo oscuro detrás del menú: al tocarlo se cierra.
     3. Nombre de cada botón del pie como globo (title) y aria-label,
        porque en celular solo se ve el icono.
   El menú se cierra solo al elegir una sección, con Escape o si la
   pantalla vuelve a ser ancha.
   ================================================== */

(function () {
    const RESP_ANCHO_MENU = 900; // igual al corte de responsive.css
    const raiz = document.documentElement;

    function iniciar() {
        const encabezado = document.querySelector('.encabezado');
        const menu = document.querySelector('.menu-lateral');
        if (!encabezado || !menu) return;

        // ---------- Botón ☰ ----------
        if (!menu.id) menu.id = 'respMenuLateral';
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'resp-menu-btn';
        boton.setAttribute('aria-label', 'Abrir menú');
        boton.setAttribute('aria-controls', menu.id);
        boton.setAttribute('aria-expanded', 'false');
        const icono = document.createElement('i');
        icono.className = 'bi bi-list';
        boton.appendChild(icono);
        encabezado.prepend(boton);

        // ---------- Fondo oscuro ----------
        const fondo = document.createElement('div');
        fondo.className = 'resp-fondo';
        document.body.appendChild(fondo);

        function abrir(si) {
            raiz.classList.toggle('resp-menu-abierto', si);
            boton.setAttribute('aria-expanded', String(si));
            boton.setAttribute('aria-label', si ? 'Cerrar menú' : 'Abrir menú');
            icono.className = si ? 'bi bi-x-lg' : 'bi bi-list';
        }

        boton.addEventListener('click', () => abrir(!raiz.classList.contains('resp-menu-abierto')));
        fondo.addEventListener('click', () => abrir(false));
        menu.addEventListener('click', (evento) => { if (evento.target.closest('a')) abrir(false); });
        window.addEventListener('hashchange', () => abrir(false));
        document.addEventListener('keydown', (evento) => {
            if (evento.key === 'Escape' && raiz.classList.contains('resp-menu-abierto')) {
                abrir(false);
                boton.focus();
            }
        });
        window.addEventListener('resize', () => {
            if (window.innerWidth > RESP_ANCHO_MENU) abrir(false);
        });

        // ---------- Nombre de los botones del pie ----------
        document.querySelectorAll('.pie .acceso-btn').forEach((b) => {
            const texto = (b.querySelector('span') || b).textContent.trim();
            if (!b.title) b.title = texto;
            if (!b.hasAttribute('aria-label')) b.setAttribute('aria-label', texto);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
