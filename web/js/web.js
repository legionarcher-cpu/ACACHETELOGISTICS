/* ==================================================
   PÁGINA WEB DE PRESENTACIÓN - LÓGICA (index.html)
   ACACHETE LOGISTICS

   1. Bienvenida: las imágenes de fondo se turnan cada PORTADA_SEGUNDOS.
   2. Ventanas internas: Productos, Visión y Contacto (web/paginas/) y la App
      (app.html) se abren dentro de la página, "creciendo" desde la tarjeta o
      el botón que se tocó, como una galería de fotos. Cualquier elemento con
      data-ventana="productos|vision|contacto|app|courier|distribuidora|transporte"
      abre la suya (las tres últimas: la solución para cada tipo de empresa);
      data-filtro="courier|distribuidora|transporte" abre Productos ya filtrado.
      La dirección cambia (index.html#productos) para poder compartir el enlace.
   3. Visor de productos: cada producto se abre en grande; se pasa al anterior o
      al siguiente con las flechas, el teclado o deslizando el dedo.
   4. Contacto: el formulario arma el mensaje y lo abre en WhatsApp o en el correo.

   Las páginas de web/paginas/ se cargan con fetch: abrir index.html con un servidor
   (Live Server) o desde la web publicada (con doble clic el navegador no las carga).
   ================================================== */

const PORTADA_SEGUNDOS = 6;
const WEB_WHATSAPP = '50662381665';
const WEB_CORREO = 'acachetelogistics@gmail.com';

const VENTANAS = {
    productos: { titulo: 'Productos', icono: 'bi-grid', pagina: 'web/paginas/productos.html' },
    vision:    { titulo: 'Visión', icono: 'bi-eye', pagina: 'web/paginas/vision.html' },
    contacto:  { titulo: 'Contacto', icono: 'bi-envelope', pagina: 'web/paginas/contacto.html' },
    // Una solución por tipo de empresa (lo que hace por ella, explicado)
    courier:       { titulo: 'Solución para mensajerías y couriers', icono: 'bi-bicycle', pagina: 'web/paginas/solucion-courier.html' },
    distribuidora: { titulo: 'Solución para distribuidoras y comercios', icono: 'bi-shop', pagina: 'web/paginas/solucion-distribuidora.html' },
    transporte:    { titulo: 'Solución para transporte de personas', icono: 'bi-car-front', pagina: 'web/paginas/solucion-transporte.html' },
    app:       { titulo: 'ACACHETE Logistics · App', icono: 'bi-box-arrow-in-right', app: 'app.html', ancha: true },
};

const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ==================================================
   1. BIENVENIDA: IMÁGENES QUE SE TURNAN
   ================================================== */
(function portada() {
    const imagenes = [...document.querySelectorAll('.portada-imagen')];
    const puntos = document.getElementById('portadaPuntos');
    if (!imagenes.length || !puntos) return;
    let actual = 0;
    let temporizador = null;

    const botones = imagenes.map((_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', `Imagen ${i + 1}`);
        b.addEventListener('click', () => { mostrar(i); reiniciar(); });
        puntos.appendChild(b);
        return b;
    });

    function mostrar(i) {
        actual = (i + imagenes.length) % imagenes.length;
        imagenes.forEach((img, n) => img.classList.toggle('activa', n === actual));
        botones.forEach((b, n) => b.classList.toggle('activo', n === actual));
    }

    function reiniciar() {
        clearInterval(temporizador);
        if (!sinMovimiento) temporizador = setInterval(() => mostrar(actual + 1), PORTADA_SEGUNDOS * 1000);
    }

    // Con la pestaña oculta no se gasta en animar
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearInterval(temporizador);
        else reiniciar();
    });

    mostrar(0);
    reiniciar();
})();

/* ==================================================
   MENÚ EN CELULAR Y AÑO DEL PIE
   ================================================== */
const menu = document.getElementById('menu');
const menuBoton = document.getElementById('menuBoton');
menuBoton.addEventListener('click', () => {
    const abrir = !menu.classList.contains('abierto');
    menu.classList.toggle('abierto', abrir);
    menuBoton.setAttribute('aria-expanded', String(abrir));
});
menu.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) {
        menu.classList.remove('abierto');
        menuBoton.setAttribute('aria-expanded', 'false');
    }
});
document.getElementById('anio').textContent = new Date().getFullYear();

/* ==================================================
   2. VENTANAS INTERNAS
   ================================================== */
const ventana = document.getElementById('ventana');
const panel = document.getElementById('ventanaPanel');
const cuerpo = document.getElementById('ventanaCuerpo');
const tituloVentana = document.getElementById('ventanaTitulo');
const enlacePestana = document.getElementById('ventanaPestana');

const paginasCargadas = {};  // nombre -> <div> con su contenido (se conserva al cerrar)
let ventanaActual = null;    // nombre de la ventana abierta
let origenActual = null;     // elemento desde el que se abrió (para volver a él al cerrar)
let focoAnterior = null;

// Transformación que lleva el panel al tamaño y lugar del elemento tocado
function transformacionDesde(origen) {
    const fin = panel.getBoundingClientRect();
    const ini = origen && origen.isConnected ? origen.getBoundingClientRect() : null;
    if (!ini || !ini.width || !ini.height || !fin.width) return 'translateY(2rem) scale(0.92)';
    return `translate(${ini.left - fin.left}px, ${ini.top - fin.top}px) scale(${ini.width / fin.width}, ${ini.height / fin.height})`;
}

async function contenidoDe(nombre) {
    if (paginasCargadas[nombre]) return paginasCargadas[nombre];
    const datos = VENTANAS[nombre];
    const caja = document.createElement('div');
    caja.style.height = '100%';
    if (datos.app) {
        const iframe = document.createElement('iframe');
        iframe.src = datos.app;
        iframe.title = datos.titulo;
        caja.appendChild(iframe);
    } else {
        try {
            const respuesta = await fetch(datos.pagina);
            if (!respuesta.ok) throw new Error(respuesta.status);
            caja.innerHTML = await respuesta.text();
            prepararPagina(nombre, caja);
        } catch (err) {
            console.error(`No se pudo cargar ${datos.pagina}:`, err);
            caja.innerHTML = '<div class="ventana-cargando"><p>No se pudo cargar esta sección. Abra la página desde la web publicada o con Live Server.</p></div>';
            return caja; // no se guarda: se reintenta la próxima vez
        }
    }
    paginasCargadas[nombre] = caja;
    return caja;
}

async function abrirVentana(nombre, origen = null, opciones = {}) {
    const datos = VENTANAS[nombre];
    if (!datos) return;

    // Ya abierta otra: se cambia el contenido sin cerrar
    const yaAbierta = !ventana.hidden;
    if (!yaAbierta) {
        focoAnterior = document.activeElement;
        origenActual = origen;
    }
    ventanaActual = nombre;

    tituloVentana.innerHTML = `<i class="bi ${datos.icono}"></i>`;
    tituloVentana.append(datos.titulo);
    enlacePestana.hidden = !datos.app;
    ventana.classList.toggle('ancha', !!datos.ancha);
    // Si ya estaba cargada y sigue puesta, no se toca (la app no se recarga)
    const guardada = paginasCargadas[nombre];
    if (!guardada || guardada.parentNode !== cuerpo) {
        cuerpo.replaceChildren(guardada || Object.assign(document.createElement('div'), { className: 'ventana-cargando', textContent: 'Cargando...' }));
        cuerpo.scrollTop = 0;
    }
    history.replaceState(null, '', `#${nombre}`);
    document.body.classList.add('con-ventana');

    if (!yaAbierta) {
        ventana.hidden = false;
        // Animación: el panel crece desde el elemento tocado
        panel.style.transition = 'none';
        panel.style.transform = sinMovimiento ? 'none' : transformacionDesde(origen);
        panel.style.opacity = '0.3';
        void panel.offsetWidth;
        panel.style.transition = 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.35s ease';
        panel.style.transform = 'none';
        panel.style.opacity = '1';
        ventana.classList.add('abierta');
        ventana.querySelector('.ventana-cerrar').focus();
    }

    const contenido = await contenidoDe(nombre);
    if (ventanaActual !== nombre) return; // ya pidió otra
    if (contenido.parentNode !== cuerpo) cuerpo.replaceChildren(contenido);
    if (nombre === 'productos') filtrarProductos(contenido, opciones.filtro || null);
}

function cerrarVentana() {
    if (ventana.hidden) return;
    cerrarVisor(true);
    ventana.classList.remove('abierta');
    panel.style.transition = 'transform 0.38s cubic-bezier(0.4, 0, 0.6, 1), opacity 0.3s ease';
    panel.style.transform = sinMovimiento ? 'none' : transformacionDesde(origenActual);
    panel.style.opacity = '0';
    const terminar = () => {
        ventana.hidden = true; // el contenido se queda: al reabrir la misma ventana sigue igual (la app no se recarga)
        document.body.classList.remove('con-ventana');
        ventanaActual = null;
        if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
    };
    if (sinMovimiento) terminar();
    else setTimeout(terminar, 380);
    history.replaceState(null, '', location.pathname + location.search);
}

// Cualquier [data-ventana] abre la suya (delegado: sirve también dentro de las páginas cargadas)
document.addEventListener('click', (e) => {
    const disparador = e.target.closest('[data-ventana]');
    if (disparador) {
        e.preventDefault();
        abrirVentana(disparador.dataset.ventana, disparador, { filtro: disparador.dataset.filtro });
        return;
    }
    if (e.target.closest('[data-cerrar]')) cerrarVentana();
});

// El foco no se sale de la ventana con Tab; Escape cierra
document.addEventListener('keydown', (e) => {
    if (!visor.hidden) return; // el visor maneja su teclado
    if (ventana.hidden) return;
    if (e.key === 'Escape') { cerrarVentana(); return; }
    if (e.key !== 'Tab') return;
    const enfocables = [...panel.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.offsetParent !== null);
    if (!enfocables.length) return;
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
});

// Al llegar con index.html#productos (enlace compartido) se abre esa ventana
window.addEventListener('DOMContentLoaded', () => {
    const pedida = location.hash.slice(1);
    if (VENTANAS[pedida]) abrirVentana(pedida);
});

// Enlaces de la APP que llegan aquí (antes la app era index.html): ej.
// index.html#registro?empresa=02 o index.html#pedidos -> se pasan a app.html con lo mismo
(function enlacesDeLaApp() {
    const hash = location.hash.slice(1);
    const nombre = hash.split('?')[0];
    if (hash && !VENTANAS[nombre] && nombre !== 'bienvenida' && nombre !== 'soluciones') {
        location.replace(`app.html#${hash}`);
    }
})();

// Lo propio de cada página al cargarla por primera vez
function prepararPagina(nombre, caja) {
    if (nombre === 'productos') prepararProductos(caja);
    if (nombre === 'contacto') prepararContacto(caja);
}

/* ==================================================
   PRODUCTOS: FILTROS Y TARJETAS
   ================================================== */
function prepararProductos(caja) {
    caja.querySelector('.filtros').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-segmento]');
        if (b) filtrarProductos(caja, b.dataset.segmento === 'todos' ? null : b.dataset.segmento);
    });
    caja.querySelectorAll('.producto').forEach((p) => {
        p.tabIndex = 0;
        p.setAttribute('role', 'button');
        p.addEventListener('click', () => abrirProducto(caja, p));
        p.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirProducto(caja, p); }
        });
    });
}

function filtrarProductos(caja, segmento) {
    caja.querySelectorAll('.filtros button').forEach((b) =>
        b.classList.toggle('activo', (b.dataset.segmento === 'todos' && !segmento) || b.dataset.segmento === segmento));
    let n = 0;
    caja.querySelectorAll('.producto').forEach((p) => {
        const visible = !segmento || (p.dataset.segmentos || '').split(' ').includes(segmento);
        p.hidden = !visible;
        if (visible) {
            // Entran uno detrás de otro, como fotos que se acomodan
            p.style.animation = 'none';
            void p.offsetWidth;
            p.style.animation = '';
            p.style.animationDelay = `${Math.min(n, 12) * 0.04}s`;
            n++;
        }
    });
}

function abrirProducto(caja, producto) {
    const visibles = [...caja.querySelectorAll('.producto')].filter((p) => !p.hidden);
    abrirVisor(visibles, visibles.indexOf(producto));
}

/* ==================================================
   3. VISOR DE PRODUCTOS (galería)
   ================================================== */
const visor = document.getElementById('visor');
const visorContenido = document.getElementById('visorContenido');
const visorMiniaturas = document.getElementById('visorMiniaturas');
let visorLista = [];
let visorIndice = 0;
let focoVisor = null;

const iconoDe = (p) => (p.querySelector('.producto-icono i') || {}).className || 'bi bi-box';

function abrirVisor(lista, indice) {
    if (!lista.length) return;
    visorLista = lista;
    focoVisor = document.activeElement;
    visorMiniaturas.replaceChildren(...lista.map((p, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.title = p.querySelector('h3').textContent;
        b.setAttribute('aria-label', b.title);
        b.innerHTML = `<i class="${iconoDe(p)}"></i>`;
        b.addEventListener('click', () => mostrarProducto(i, i > visorIndice ? 1 : -1));
        return b;
    }));
    visor.hidden = false;
    void visor.offsetWidth;
    visor.classList.add('abierto');
    mostrarProducto(Math.max(0, indice), 0);
    document.getElementById('visorSiguiente').focus();
}

function mostrarProducto(i, direccion) {
    visorIndice = (i + visorLista.length) % visorLista.length;
    const p = visorLista[visorIndice];
    document.getElementById('visorIcono').innerHTML = `<i class="${iconoDe(p)}"></i>`;
    document.getElementById('visorTitulo').textContent = p.querySelector('h3').textContent;
    document.getElementById('visorFrase').textContent = (p.querySelector('.producto-frase') || {}).textContent || '';
    document.getElementById('visorContador').textContent = `${visorIndice + 1} / ${visorLista.length}`;
    const detalle = p.querySelector('.producto-detalle');
    visorContenido.innerHTML = detalle ? detalle.innerHTML : '';
    visorContenido.scrollTop = 0;
    visorContenido.classList.remove('entra-derecha', 'entra-izquierda');
    void visorContenido.offsetWidth;
    if (direccion > 0) visorContenido.classList.add('entra-derecha');
    if (direccion < 0) visorContenido.classList.add('entra-izquierda');
    [...visorMiniaturas.children].forEach((b, n) => b.classList.toggle('activo', n === visorIndice));
    const activa = visorMiniaturas.children[visorIndice];
    if (activa) activa.scrollIntoView({ block: 'nearest', inline: 'center', behavior: sinMovimiento ? 'auto' : 'smooth' });
}

function cerrarVisor(inmediato = false) {
    if (visor.hidden) return;
    visor.classList.remove('abierto');
    const terminar = () => {
        visor.hidden = true;
        if (focoVisor && focoVisor.focus && !inmediato) focoVisor.focus();
    };
    if (inmediato || sinMovimiento) terminar();
    else setTimeout(terminar, 300);
}

document.getElementById('visorAnterior').addEventListener('click', () => mostrarProducto(visorIndice - 1, -1));
document.getElementById('visorSiguiente').addEventListener('click', () => mostrarProducto(visorIndice + 1, 1));
visor.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar-visor]')) cerrarVisor(); });

document.addEventListener('keydown', (e) => {
    if (visor.hidden) return;
    if (e.key === 'Escape') cerrarVisor();
    if (e.key === 'ArrowRight') mostrarProducto(visorIndice + 1, 1);
    if (e.key === 'ArrowLeft') mostrarProducto(visorIndice - 1, -1);
});

// Deslizar el dedo para pasar de producto (celular)
let toqueX = null;
visor.addEventListener('touchstart', (e) => { toqueX = e.touches[0].clientX; }, { passive: true });
visor.addEventListener('touchend', (e) => {
    if (toqueX === null) return;
    const dx = e.changedTouches[0].clientX - toqueX;
    toqueX = null;
    if (Math.abs(dx) > 50) mostrarProducto(visorIndice + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
});

/* ==================================================
   4. CONTACTO: EL MENSAJE SE ABRE EN WHATSAPP O EN EL CORREO
   ================================================== */
function prepararContacto(caja) {
    const form = caja.querySelector('#webContacto');
    const error = caja.querySelector('#webContactoError');
    if (!form) return;

    function mensaje() {
        const v = (id) => (form.querySelector(id).value || '').trim();
        if (!v('#webNombre') || !v('#webEmpresa')) {
            error.textContent = 'Escriba su nombre y el de su empresa.';
            (v('#webNombre') ? form.querySelector('#webEmpresa') : form.querySelector('#webNombre')).focus();
            return null;
        }
        error.textContent = '';
        return [
            'Hola ACACHETE Logistics, me gustaría agendar una demostración.',
            `Nombre: ${v('#webNombre')}`,
            `Empresa: ${v('#webEmpresa')}`,
            v('#webTipo') && `Tipo de empresa: ${v('#webTipo')}`,
            v('#webRepartidores') && `Repartidores o vehículos: ${v('#webRepartidores')}`,
            v('#webTelefono') && `Teléfono: ${v('#webTelefono')}`,
            v('#webMensaje') && `Mensaje: ${v('#webMensaje')}`,
        ].filter(Boolean).join('\n');
    }

    form.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-enviar]');
        if (!b) return;
        e.preventDefault();
        const texto = mensaje();
        if (!texto) return;
        if (b.dataset.enviar === 'whatsapp') {
            window.open(`https://wa.me/${WEB_WHATSAPP}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
        } else {
            location.href = `mailto:${WEB_CORREO}?subject=${encodeURIComponent('Demostración de ACACHETE Logistics')}&body=${encodeURIComponent(texto)}`;
        }
    });
}
