/* ==================================================
   QR (común a todas las secciones)
   ACACHETE LOGISTICS

   Hay 3 QR en el sistema. Ninguno lleva datos personales: solo un código
   que la base reconoce (si lo lee otra cámara, no ve nada del cliente).

     ACACHETE-PEDIDO:<token>         QR del pedido (se crea con el pedido).
                                     Al escanearlo aquí se abre una ventana
                                     con TODA la información del pedido.
     ACACHETE-TIENDA:<tienda>:<código> QR FIJO de la tienda (qr_tienda_fija):
                                     siempre en el Inicio de la tienda y en
                                     Tiendas; se imprime una vez. El PILOTO lo
                                     escanea ESTANDO en la tienda (GPS) y se marca
                                     solo con la hora del sistema
                                     (marcar_por_qr_fijo) + aviso a la tienda.
     ACACHETE-PILOTO:<token>          QR del día del piloto (qr_piloto_dia; lo da
                                     el G2 en Rutas y asignaciones y el piloto
                                     lo ve en su Inicio). La TIENDA lo escanea:
                                     sale su foto, su nombre y el horario que
                                     puede marcar, con el botón "Validar y
                                     marcar" (validar_y_marcar_piloto): queda
                                     validado y marcado en un solo paso.
     ACACHETE-VIAJE:<token>           QR del viaje (viajes.token_qr; se comparte con la
                                     confirmación). El CONDUCTOR del viaje lo escanea al
                                     recoger al cliente: el viaje pasa a "En curso" (A bordo).
                                     El personal lo escanea y se abre el viaje en Viajes.

   Funciones que usan las secciones:
     escanearQrGeneral()            -> botón "Escanear QR" del encabezado
     abrirLectorQr({ titulo, ayuda, alLeer })  -> cámara (librería gratis jsQR)
     mostrarQrEnVentana({ titulo, texto, ... }) -> QR para ver, descargar o imprimir
     mostrarPedidoQr(pedidoId)      -> ventana flotante con la información del pedido

   Tablas y funciones: sql/instalacion/03_horarios_y_marcas.sql.
   Estilos: css/componentes.css (bloque "QR").
   Necesita: js/supabase.js, js/sesion.js, js/componentes.js y js/notificaciones.js.
   ================================================== */

const QR_LIB_DIBUJAR = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
const QR_LIB_LEER = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
const QR_PREFIJO = { pedido: 'ACACHETE-PEDIDO:', tienda: 'ACACHETE-TIENDA:', piloto: 'ACACHETE-PILOTO:', viaje: 'ACACHETE-VIAJE:' };

// Texto y color de cada estado del pedido (los mismos de js/secciones/pedidos.js)
const QR_ESTADOS = {
    registrado: ['Registrado', 'etiqueta-gris'], recibido_bodega: ['En bodega', 'etiqueta-morada'],
    asignado: ['Asignado', 'etiqueta-azul'], alistando: ['Alistando', 'etiqueta-naranja'],
    listo_despacho: ['Listo para despachar', 'etiqueta-azul'], recibido_ruta: ['Recibido para ruta', 'etiqueta-morada'],
    cargado: ['Cargado', 'etiqueta-turquesa'], en_ruta: ['En ruta', 'etiqueta-turquesa'], en_entrega: ['Entregando', 'etiqueta-turquesa'],
    entregado: ['Entregado', 'etiqueta-verde'], entregado_incidencia: ['Entregado con incidencia', 'etiqueta-naranja'],
    no_entregado: ['No entregado', 'etiqueta-rosada'], no_salio: ['No salió a ruta', 'etiqueta-rosada'],
    reprogramado: ['Reprogramado', 'etiqueta-azul'],
    devuelto: ['Devuelto', 'etiqueta-rosada'], cancelado: ['Cancelado', 'etiqueta-gris'],
};

// Descarga una librería una sola vez
const qrScripts = new Map();
function qrCargar(url, global) {
    if (window[global]) return Promise.resolve();
    if (!qrScripts.has(url)) {
        qrScripts.set(url, new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.onload = () => resolve();
            s.onerror = () => { qrScripts.delete(url); s.remove(); reject(new Error(`No se pudo descargar ${url}`)); };
            document.head.appendChild(s);
        }));
    }
    return qrScripts.get(url);
}

// Crea (una sola vez) una ventana <dialog> con el html dado
function qrDialogo(id, html, clase = '') {
    let d = document.getElementById(id);
    if (!d) {
        d = document.createElement('dialog');
        d.id = id;
        d.className = `dialogo ${clase}`;
        d.innerHTML = html;
        document.body.appendChild(d);
        d.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => d.close()));
    }
    return d;
}

const qrTexto = (padre, etiqueta, texto, clase = '') => {
    const e = document.createElement(etiqueta);
    if (clase) e.className = clase;
    e.textContent = texto;
    padre.appendChild(e);
    return e;
};

// ==================================================
// DIBUJAR UN QR (para ver, descargar o imprimir)
// ==================================================

// Dibuja el QR en un canvas (blanco y negro, con margen)
async function qrDibujar(canvas, texto, lado = 320) {
    await qrCargar(QR_LIB_DIBUJAR, 'qrcode');
    const qr = window.qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    const n = qr.getModuleCount();
    const celda = Math.max(2, Math.floor(lado / (n + 8)));
    const tam = celda * (n + 8);
    canvas.width = tam;
    canvas.height = tam;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, tam, tam);
    ctx.fillStyle = '#000000';
    for (let f = 0; f < n; f++) {
        for (let c = 0; c < n; c++) if (qr.isDark(f, c)) ctx.fillRect((c + 4) * celda, (f + 4) * celda, celda, celda);
    }
}

// Ventana con un QR: título, subtítulo, foto y nombre (opcionales), nota, descargar e imprimir
//   mostrarQrEnVentana({ titulo, subtitulo, texto, nombre, foto, nota, archivo })
async function mostrarQrEnVentana({ titulo, subtitulo = '', texto, nombre = '', foto = '', nota = '', archivo = 'qr' }) {
    const d = qrDialogo('qrVerDialogo', `
        <div class="dialogo-form qr-ver">
            <h3 class="dialogo-titulo" data-titulo></h3>
            <p class="qr-subtitulo" data-subtitulo></p>
            <div class="qr-persona" data-persona hidden>
                <span class="avatar avatar-mediano" data-foto></span>
                <strong data-nombre></strong>
            </div>
            <canvas class="qr-lienzo" data-lienzo aria-label="Código QR"></canvas>
            <p class="qr-nota" data-nota></p>
            <div class="dialogo-botones">
                <button type="button" class="boton boton-secundario" data-descargar><i class="bi bi-download"></i> <span>Descargar</span></button>
                <button type="button" class="boton boton-secundario" data-imprimir><i class="bi bi-printer"></i> <span>Imprimir</span></button>
                <button type="button" class="boton boton-principal" data-cerrar>Listo</button>
            </div>
        </div>`, 'qr-dialogo');
    const $ = (s) => d.querySelector(s);
    $('[data-titulo]').textContent = titulo;
    $('[data-subtitulo]').textContent = subtitulo;
    $('[data-nota]').textContent = nota;
    $('[data-persona]').hidden = !nombre;
    if (nombre) {
        $('[data-nombre]').textContent = nombre;
        if (typeof pintarAvatar === 'function') pintarAvatar($('[data-foto]'), nombre, foto || null); // js/avatar.js
    }
    const lienzo = $('[data-lienzo]');
    try {
        await qrDibujar(lienzo, texto);
    } catch (e) {
        console.error(e);
        $('[data-nota]').textContent = 'No se pudo dibujar el QR (revisa la conexión a internet).';
    }
    $('[data-descargar]').onclick = () => {
        const a = document.createElement('a');
        a.href = lienzo.toDataURL('image/png');
        a.download = `${textoExportar(archivo)}.png`;
        a.click();
    };
    // Imprimir: una página sola con el QR grande y los textos
    $('[data-imprimir]').onclick = () => {
        const v = window.open('', '_blank', 'width=600,height=800');
        if (!v) return;
        // La ventana de impresión es otra página: se le pasan ya las palabras de la empresa (Pedido -> Viaje)
        const esc = (t) => String(textoExportar(String(t || ''))).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        v.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(titulo)}</title>
            <body style="font-family:Arial,sans-serif;text-align:center;padding:24px">
            <h1 style="margin:0 0 6px">${esc(titulo)}</h1><p style="margin:0 0 18px;color:#555">${esc(subtitulo)}</p>
            ${nombre ? `<h2 style="margin:0 0 12px">${esc(nombre)}</h2>` : ''}
            <img src="${lienzo.toDataURL('image/png')}" style="width:80%;max-width:420px;image-rendering:pixelated">
            <p style="color:#555">${esc(nota)}</p>
            <script>window.onload=()=>{window.print();}<\/script></body>`);
        v.document.close();
    };
    if (!d.open) d.showModal();
}

// ==================================================
// LECTOR DE QR CON LA CÁMARA
//   abrirLectorQr({ titulo, ayuda, alLeer })
//   alLeer(texto) devuelve { tipo: 'ok' | 'error', mensaje, nodo (opcional), cerrar: ms | false }
// ==================================================

let qrCamara = null;
let qrLazo = null;
let qrOcupado = false;
let qrUltimo = { texto: '', hora: 0 };
let qrAlLeer = null;
let qrAlEscribir = null;

function qrDialogoLector() {
    const d = qrDialogo('qrLectorDialogo', `
        <div class="dialogo-form">
            <h3 class="dialogo-titulo"><i class="bi bi-qr-code-scan"></i> <span data-titulo>Escanear QR</span></h3>
            <div class="qr-camara">
                <video data-video playsinline muted></video>
                <span class="qr-marco" aria-hidden="true"></span>
                <p class="qr-sin-camara" data-sin-camara hidden></p>
            </div>
            <p class="qr-estado" data-estado aria-live="polite"></p>
            <form class="qr-manual" data-manual hidden novalidate>
                <label class="campo-etiqueta" for="qrManualCodigo" data-manual-etiqueta></label>
                <div class="qr-manual-fila">
                    <input id="qrManualCodigo" type="text" class="campo-input" inputmode="numeric" autocomplete="off" maxlength="20" data-manual-input>
                    <button type="submit" class="boton boton-secundario boton-chico">Usar código</button>
                </div>
            </form>
            <div class="qr-resultado" data-resultado hidden></div>
            <div class="dialogo-botones">
                <button type="button" class="boton boton-secundario" data-otra hidden><i class="bi bi-arrow-repeat"></i> <span>Escanear otro</span></button>
                <button type="button" class="boton boton-principal" data-cerrar>Cerrar</button>
            </div>
        </div>`, 'qr-dialogo');
    if (!d.dataset.listo) {
        d.dataset.listo = '1';
        d.addEventListener('close', qrApagar);
        d.querySelector('[data-otra]').addEventListener('click', () => {
            qrMostrarResultado(null);
            d.querySelector('[data-manual]').hidden = !qrAlEscribir;
            qrEstado('Apunta la cámara al QR.');
            qrEncender();
        });
        // Código escrito a mano (si el QR no se puede leer): lo revisa la misma función que pidió la sección
        d.querySelector('[data-manual]').addEventListener('submit', (e) => {
            e.preventDefault();
            const texto = d.querySelector('[data-manual-input]').value.trim();
            if (!texto || !qrAlEscribir || qrOcupado) return;
            qrProcesar(texto, qrAlEscribir);
        });
    }
    return d;
}

function qrEstado(texto, tipo = '') {
    const e = document.querySelector('#qrLectorDialogo [data-estado]');
    if (!e) return;
    e.textContent = texto;
    e.className = `qr-estado${tipo ? ` ${tipo}` : ''}`;
}

function qrMostrarResultado(nodo) {
    const d = document.getElementById('qrLectorDialogo');
    const caja = d.querySelector('[data-resultado]');
    caja.replaceChildren();
    caja.hidden = !nodo;
    if (nodo) caja.appendChild(nodo);
    d.querySelector('[data-otra]').hidden = !nodo;
    d.querySelector('.qr-camara').hidden = !!nodo;
    if (nodo) d.querySelector('[data-manual]').hidden = true;
}

function qrApagar() {
    if (qrLazo) cancelAnimationFrame(qrLazo);
    qrLazo = null;
    if (qrCamara) qrCamara.getTracks().forEach((t) => t.stop());
    qrCamara = null;
    const v = document.querySelector('#qrLectorDialogo [data-video]');
    if (v) v.srcObject = null;
}

// manual (opcional): { etiqueta, alEscribir(texto) } -> casilla para escribir un código si el QR no se lee
async function abrirLectorQr({ titulo = 'Escanear QR', ayuda = 'Apunta la cámara al QR.', alLeer, manual = null }) {
    const d = qrDialogoLector();
    d.querySelector('[data-titulo]').textContent = titulo;
    qrAlLeer = alLeer;
    qrAlEscribir = manual ? manual.alEscribir : null;
    d.querySelector('[data-manual]').hidden = !manual;
    d.querySelector('[data-manual-etiqueta]').textContent = manual ? manual.etiqueta : '';
    d.querySelector('[data-manual-input]').value = '';
    qrUltimo = { texto: '', hora: 0 };
    qrMostrarResultado(null);
    qrEstado(ayuda);
    if (!d.open) d.showModal();
    await qrEncender();
}

async function qrEncender() {
    const d = document.getElementById('qrLectorDialogo');
    const video = d.querySelector('[data-video]');
    const sinCamara = d.querySelector('[data-sin-camara]');
    sinCamara.hidden = true;
    video.hidden = false;
    const avisoSinCamara = (texto) => { video.hidden = true; sinCamara.textContent = texto; sinCamara.hidden = false; };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        avisoSinCamara('La cámara solo funciona si la página se abre con https (o en localhost).');
        return;
    }
    try {
        await qrCargar(QR_LIB_LEER, 'jsQR');
        qrApagar();
        qrCamara = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!d.open) { qrApagar(); return; }
        video.srcObject = qrCamara;
        await video.play();
        qrLeerCuadro();
    } catch (e) {
        console.error('No se pudo abrir la cámara:', e);
        avisoSinCamara(e && e.name === 'NotAllowedError'
            ? 'No hay permiso para usar la cámara. Actívalo en el navegador.'
            : 'No se pudo abrir la cámara.');
    }
}

const qrLienzoLector = document.createElement('canvas');
function qrLeerCuadro() {
    if (!qrCamara) return;
    const video = document.querySelector('#qrLectorDialogo [data-video]');
    if (video.readyState === video.HAVE_ENOUGH_DATA && !qrOcupado) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        qrLienzoLector.width = w;
        qrLienzoLector.height = h;
        const ctx = qrLienzoLector.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, w, h);
        const codigo = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        const ahora = Date.now();
        if (codigo && codigo.data && !(codigo.data === qrUltimo.texto && ahora - qrUltimo.hora < 4000)) {
            qrUltimo = { texto: codigo.data, hora: ahora };
            qrProcesar(codigo.data);
        }
    }
    qrLazo = requestAnimationFrame(qrLeerCuadro);
}

async function qrProcesar(texto, revisar = qrAlLeer) {
    if (!revisar) return;
    qrOcupado = true;
    qrEstado('Revisando...');
    try {
        const r = (await revisar(texto)) || {};
        qrEstado(r.mensaje || '', r.tipo || '');
        if (r.nodo) { qrApagar(); qrMostrarResultado(r.nodo); }
        if (r.tipo === 'ok' && navigator.vibrate) navigator.vibrate(120);
        if (r.cerrar) {
            qrApagar();
            setTimeout(() => { const d = document.getElementById('qrLectorDialogo'); if (d && d.open) d.close(); }, r.cerrar);
        }
    } catch (e) {
        console.error('Error al procesar el QR:', e);
        qrEstado('No se pudo procesar el QR. Revisa la conexión.', 'error');
    } finally {
        qrOcupado = false;
    }
}

// ==================================================
// ESCANEAR QR (botón del encabezado): reconoce el tipo de QR
// ==================================================

function escanearQrGeneral() {
    const piloto = rolActual() === 'piloto';
    abrirLectorQr({
        titulo: 'Escanear QR',
        ayuda: piloto
            ? 'Escanea el QR de marcas de la tienda (para marcar tu llegada), el QR de un pedido o el de un viaje (cliente a bordo).'
            : 'Escanea el QR del día de un piloto (para validarlo y marcar su llegada), el QR de un pedido o el de un viaje.',
        alLeer: qrLeerGeneral,
    });
}

async function qrLeerGeneral(texto) {
    if (texto.startsWith(QR_PREFIJO.pedido)) return qrLeerPedido(texto.slice(QR_PREFIJO.pedido.length));
    if (texto.startsWith(QR_PREFIJO.tienda)) return qrLeerMarca(texto);
    if (texto.startsWith(QR_PREFIJO.piloto)) return qrLeerPiloto(texto.slice(QR_PREFIJO.piloto.length));
    if (texto.startsWith(QR_PREFIJO.viaje)) return qrLeerViaje(texto.slice(QR_PREFIJO.viaje.length));
    return { tipo: 'error', mensaje: 'Ese QR no es del sistema.' };
}

// ---------- QR del VIAJE ----------
//   El conductor del viaje (confirmado o en camino) lo escanea al recoger al cliente: pasa a
//   "En curso" (viajes_avanzar, sql/instalacion/05). Cualquier otro caso: se abre el viaje.
async function qrLeerViaje(token) {
    if (!/^[0-9a-f-]{36}$/i.test(token)) return { tipo: 'error', mensaje: 'Ese QR de viaje no es válido.' };
    const { data, error } = await db.from('viajes').select('id, codigo, estado, conductor_id').eq('token_qr', token).maybeSingle();
    if (error || !data) return { tipo: 'error', mensaje: 'No se encontró ese viaje (o no tienes acceso a él).' };
    const s = obtenerSesion() || {};
    let mensaje = '';
    if (rolActual() === 'piloto' && data.conductor_id === s.id && ['confirmado', 'en_camino'].includes(data.estado)) {
        const r = await db.rpc('viajes_avanzar', { p_viaje: data.id, p_usuario: s.id, p_estado: 'en_curso' });
        if (r.error) return { tipo: 'error', mensaje: r.error.code === 'P0001' ? r.error.message : 'No se pudo marcar "A bordo". Revisa la conexión.' };
        mensaje = `✔ ${data.codigo}: cliente a bordo, viaje en curso.`;
    }
    window.dispatchEvent(new CustomEvent('acachete:viaje', { detail: { id: data.id } })); // Viajes recarga la lista
    location.hash = `viajes?id=${data.id}`;
    return { tipo: 'ok', mensaje: mensaje || `Viaje ${data.codigo}.`, cerrar: mensaje ? 1500 : 300 };
}

// ---------- QR del PEDIDO: ventana con toda la información ----------
//   El piloto que escanea el QR de SU pedido "En ruta" empieza a entregarlo (pasa a "Entregando").
async function qrLeerPedido(token) {
    const { data, error } = await db.from('pedidos').select('id, codigo, estado, piloto_id').eq('token_qr', token).maybeSingle();
    if (error || !data) return { tipo: 'error', mensaje: 'No se encontró ese pedido.' };
    const s = obtenerSesion() || {};
    if (rolActual() === 'piloto' && data.piloto_id === s.id && data.estado === 'en_ruta') {
        const r = await qrIniciarEntrega({ usuario_id: s.id, pedido_id: data.id, token });
        if (r.tipo === 'error') return r;
        qrAvisarEntregando(r.datos);
    }
    const d = document.getElementById('qrLectorDialogo');
    if (d && d.open) d.close();
    mostrarPedidoQr(data.id);
    return { tipo: 'ok', mensaje: '' };
}

// ==================================================
// EMPEZAR LA ENTREGA CON EL QR DEL PEDIDO (piloto)
//   El piloto escanea el QR que tiene el cliente (o escribe su código de entrega si el QR
//   no se lee) y el pedido pasa de "En ruta" a "Entregando" (pedido_iniciar_entrega, sql/01
//   bloque 38). La base no deja pasar a "Entregando" de otra forma.
//   escanearParaEntregar({ pedido, sesion }) -> promesa: { id, codigo, estado } o null
// ==================================================

async function qrIniciarEntrega(p) {
    const { data, error } = await db.rpc('pedido_iniciar_entrega', { p });
    if (!error) return { tipo: 'ok', datos: data };
    console.error('Error al empezar la entrega:', error);
    return {
        tipo: 'error',
        mensaje: error.code === 'P0001' ? error.message
            : ['PGRST202', '42883'].includes(error.code) ? 'Falta instalar la base de datos (sql/instalacion).'
                : 'No se pudo revisar. Revisa la conexión e intenta de nuevo.',
    };
}

// Avisa a la página que un pedido pasó a "Entregando" (Inicio recarga "Mi ruta")
function qrAvisarEntregando(datos) {
    window.dispatchEvent(new CustomEvent('acachete:entregando', { detail: datos || {} }));
}

function escanearParaEntregar({ pedido, sesion }) {
    return new Promise((resolver) => {
        let resultado = null;
        const revisar = async (p) => {
            const r = await qrIniciarEntrega({ usuario_id: sesion.id || null, pedido_id: pedido.id, ...p });
            if (r.tipo === 'error') return r;
            resultado = r.datos;
            qrAvisarEntregando(r.datos);
            return { tipo: 'ok', mensaje: `Pedido ${pedido.codigo}: entregando.`, cerrar: 700 };
        };
        abrirLectorQr({
            titulo: `Entregar ${pedido.codigo}`,
            ayuda: 'Escanea el QR del pedido que tiene el cliente.',
            alLeer: (texto) => (texto.startsWith(QR_PREFIJO.pedido)
                ? revisar({ token: texto.slice(QR_PREFIJO.pedido.length) })
                : { tipo: 'error', mensaje: 'Ese no es el QR de un pedido.' }),
            manual: {
                etiqueta: '¿No se puede leer el QR? Escribe el código de entrega que te dice el cliente:',
                alEscribir: (codigo) => revisar({ codigo }),
            },
        });
        const d = document.getElementById('qrLectorDialogo');
        d.addEventListener('close', () => resolver(resultado), { once: true });
    });
}

// ¿El usuario conectado puede ver este pedido? (igual que en Pedidos)
async function qrPuedeVerPedido(p) {
    const s = obtenerSesion() || {};
    if (esAdministrador() || esAdminG1()) return true;
    if (rolActual() === 'piloto') return p.piloto_id === s.id;
    if (esAdminG2()) return !!p.tiendas && p.tiendas.region === regionActual();
    return p.tienda_id === tiendaActual();
}

// Ventana flotante con la información del pedido (la que se ve al escanear su QR)
async function mostrarPedidoQr(pedidoId) {
    // Cabecera y botones fijos; en medio, los datos por grupos (con scroll si no caben)
    const d = qrDialogo('qrPedidoDialogo', `
        <div class="qr-pedido">
            <div class="qr-pedido-cabeza">
                <h3 class="dialogo-titulo qr-pedido-titulo"><span data-codigo>Pedido</span> <span data-estado></span></h3>
                <p class="qr-subtitulo" data-sub></p>
            </div>
            <div class="qr-pedido-cuerpo" data-cuerpo></div>
            <div class="dialogo-botones qr-pedido-botones">
                <button type="button" class="boton boton-secundario" data-cerrar>Cerrar</button>
                <a class="boton boton-principal" data-abrir><i class="bi bi-box-arrow-up-right"></i> <span>Abrir pedido</span></a>
            </div>
        </div>`, 'qr-dialogo qr-pedido-dialogo');
    const $ = (s) => d.querySelector(s);
    const cuerpo = $('[data-cuerpo]');
    $('[data-codigo]').textContent = 'Cargando...';
    $('[data-estado]').replaceChildren();
    $('[data-sub]').textContent = '';
    cuerpo.replaceChildren();
    if (!d.open) d.showModal();

    const { data: p, error } = await db.from('pedidos')
        .select('*, tiendas(codigo, nombre, region), piloto:usuarios!piloto_id(nombre), pedido_articulos(categoria, descripcion, cantidad, tamano, peso_kg)')
        .eq('id', pedidoId).maybeSingle();
    if (error || !p || !(await qrPuedeVerPedido(p))) {
        if (error) console.error('Error al cargar el pedido del QR:', error);
        $('[data-codigo]').textContent = 'Pedido no disponible';
        $('[data-sub]').textContent = error ? 'No se pudo cargar. Revisa la conexión.' : 'No existe o no tienes acceso a él.';
        $('[data-abrir]').hidden = true;
        return;
    }
    const [texto, color] = QR_ESTADOS[p.estado] || [p.estado, 'etiqueta-gris'];
    $('[data-codigo]').textContent = `Pedido ${p.codigo}`;
    qrTexto($('[data-estado]'), 'span', p.anulado ? 'Anulado' : texto, `etiqueta ${p.anulado ? 'etiqueta-gris' : color}`);
    // Nombre de la actividad (no su código)
    let actividad = p.actividad || '';
    if (actividad) {
        const act = await db.from('actividades').select('nombre').eq('codigo', actividad).maybeSingle();
        if (!act.error && act.data && act.data.nombre) actividad = act.data.nombre;
    }
    $('[data-sub]').textContent = [p.tiendas ? `${p.tiendas.codigo} · ${p.tiendas.nombre}` : '', actividad].filter(Boolean).join(' · ');

    const dinero = (n) => `₡${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fecha = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : null);
    const kilos = (n) => `${Number(n || 0).toLocaleString('es-CR', { maximumFractionDigits: 2 })} kg`;
    const verMarca = rolActual() === 'piloto' || esAdministrador() || esAdminG1() || esAdminG2();

    // Teléfono que se puede tocar para llamar
    const telefono = (numero) => {
        if (!numero) return null;
        const a = document.createElement('a');
        a.href = `tel:${String(numero).replace(/[^\d+]/g, '')}`;
        a.className = 'qr-tel';
        a.innerHTML = '<i class="bi bi-telephone"></i> ';
        a.append(numero);
        return a;
    };

    // Un grupo con título y sus filas [etiqueta, valor (texto o nodo)]; sin valores no se dibuja
    function grupo(titulo, icono, filas) {
        const conValor = filas.filter(([, v]) => v != null && v !== '');
        if (!conValor.length) return null;
        const sec = document.createElement('section');
        sec.className = 'qr-bloque';
        const h = document.createElement('h4');
        h.className = 'qr-bloque-titulo';
        h.innerHTML = `<i class="bi ${icono}"></i> `;
        h.append(titulo);
        const dl = document.createElement('dl');
        dl.className = 'qr-datos';
        conValor.forEach(([e, v]) => {
            qrTexto(dl, 'dt', e);
            const dd = document.createElement('dd');
            if (v instanceof Node) dd.appendChild(v); else dd.textContent = v;
            dl.appendChild(dd);
        });
        sec.append(h, dl);
        cuerpo.appendChild(sec);
        return sec;
    }

    // Avisos importantes arriba: alcohol y cancelación
    if (p.lleva_alcohol) qrTexto(cuerpo, 'p', 'Lleva alcohol: confirmar que quien recibe es mayor de edad.', 'qr-alerta');
    if (p.estado === 'cancelado' && p.motivo_cancelacion) qrTexto(cuerpo, 'p', `Cancelado: ${p.motivo_cancelacion}`, 'qr-alerta');

    const recibe = p.recibe_tipo === 'autorizado'
        ? (() => {
            const span = document.createElement('span');
            span.append(`${p.recibe_nombre || 'Otra persona'} (autorizado)`);
            const tel = telefono(p.recibe_telefono);
            if (tel) span.append(' · ', tel);
            return span;
        })()
        : 'El mismo cliente';
    grupo('Cliente', 'bi-person', [
        ['Nombre', p.cliente_nombre],
        ['Teléfono', telefono(p.cliente_telefono)],
        ['Recibe', recibe],
    ]);
    grupo('Entrega', 'bi-geo-alt', [
        ['Dirección', p.direccion_entrega],
        ['Sale de', p.direccion_partida],
        ['Fecha', fecha(p.fecha_entrega)],
        ['Despacho', [p.slot_numero ? `Slot ${p.slot_numero}` : null, verMarca && p.marca_numero ? `horario ${p.marca_numero}` : null].filter(Boolean).join(' · ')],
        ['Piloto', p.piloto ? p.piloto.nombre : 'Sin asignar'],
        ['Distancia', p.distancia_km != null ? `${Number(p.distancia_km).toLocaleString('es-CR')} km` : null],
    ]);

    // Cobro: el total a cobrar destacado
    const cobro = grupo('Cobro', 'bi-cash-coin', [
        ['Compra', p.monto_compra != null ? dinero(p.monto_compra) : null],
        ['Envío', dinero(p.costo_envio)],
    ]);
    const total = document.createElement('div');
    total.className = 'qr-total';
    qrTexto(total, 'span', 'A cobrar al entregar', 'qr-total-texto');
    qrTexto(total, 'strong', dinero(p.total_cobrar), 'qr-total-monto');
    qrTexto(total, 'span', p.forma_pago === 'tarjeta' ? 'Tarjeta' : 'Efectivo', 'etiqueta etiqueta-gris');
    (cobro || cuerpo).appendChild(total);

    const tituloBloque = (sec, texto, icono) => {
        const h = qrTexto(sec, 'h4', '', 'qr-bloque-titulo');
        h.innerHTML = `<i class="bi ${icono}"></i> `;
        h.append(texto);
    };
    if (p.notas) {
        const sec = document.createElement('section');
        sec.className = 'qr-bloque';
        tituloBloque(sec, 'Notas', 'bi-chat-left-text');
        qrTexto(sec, 'p', p.notas, 'qr-notas');
        cuerpo.appendChild(sec);
    }

    // Mercadería en tabla: cantidad, artículo y peso
    const arts = p.pedido_articulos || [];
    if (arts.length) {
        const sec = document.createElement('section');
        sec.className = 'qr-bloque';
        tituloBloque(sec, `Mercadería · ${kilos(p.peso_total_kg)}`, 'bi-box-seam');
        const tabla = document.createElement('table');
        tabla.className = 'qr-mercaderia';
        tabla.innerHTML = '<thead><tr><th class="qr-num">Cant.</th><th>Artículo</th><th class="qr-num">Peso c/u</th></tr></thead>';
        const tb = document.createElement('tbody');
        arts.forEach((a) => {
            const tr = document.createElement('tr');
            qrTexto(tr, 'td', a.cantidad, 'qr-num');
            const td = qrTexto(tr, 'td', a.descripcion || a.categoria);
            const extra = [a.tamano, a.descripcion ? a.categoria : null].filter(Boolean).join(' · ');
            if (extra) qrTexto(td, 'small', extra);
            qrTexto(tr, 'td', kilos(a.peso_kg), 'qr-num');
            tb.appendChild(tr);
        });
        tabla.appendChild(tb);
        sec.appendChild(tabla);
        cuerpo.appendChild(sec);
    }
    const abrir = $('[data-abrir]');
    abrir.hidden = false;
    abrir.href = `#pedidos?id=${p.id}`;
    abrir.onclick = () => d.close();
}

// ---------- QR FIJO de la tienda (lo escanea el piloto) ----------
//   Marca con la hora del sistema, SOLO estando en la tienda: se manda la ubicación del celular.
//   Hasta la "hora inicio" -> a tiempo. Entre la hora inicio y "termina" -> MARCA TARDÍA:
//   la base responde "JUSTIFICAR:..." y aquí se pide el motivo; al enviarlo se marca.
async function qrLeerMarca(texto, justificacion = null) {
    const s = obtenerSesion() || {};
    if (rolActual() !== 'piloto') return { tipo: 'error', mensaje: 'Este es el QR de marcas de la tienda: lo escanean los pilotos al llegar.' };
    qrEstado('Revisando tu ubicación (GPS)...');
    const pos = await qrPosicion();
    if (pos.error) return { tipo: 'error', mensaje: pos.error };
    const { data, error } = await db.rpc('marcar_por_qr_fijo', {
        p_piloto: s.id || 0, p_qr: texto, p_justificacion: justificacion,
        p_lat: pos.lat, p_lng: pos.lng, p_precision: pos.precision,
    });
    if (error) {
        console.error('Error al marcar con QR:', error);
        if (error.code === 'P0001' && error.message.startsWith('JUSTIFICAR:')) {
            return { tipo: 'error', mensaje: error.message.slice('JUSTIFICAR:'.length), nodo: qrFormularioJustificacion(texto) };
        }
        return {
            tipo: 'error',
            mensaje: error.code === 'P0001' ? error.message
                : error.code === 'PGRST202' || error.code === '42883' ? 'Falta instalar la base de datos (sql/instalacion).'
                    : 'No se pudo marcar. Revisa la conexión.',
        };
    }
    const m = (data || [])[0];
    if (!m) return { tipo: 'error', mensaje: 'No se pudo marcar.' };
    const hora = new Date(m.marcado_en).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
    await qrAvisarLlegada(m.numero, m.tienda_id, s, m.a_tiempo ? null : m.justificacion);
    window.dispatchEvent(new CustomEvent('acachete:marca')); // Inicio recarga "Mis marcas de hoy"
    return {
        tipo: 'ok', cerrar: 2500,
        mensaje: `✔ Horario ${m.numero} marcado a las ${hora}${m.a_tiempo ? '' : ' (marca tardía, justificada)'}` +
            `${m.distancia_m != null ? ` · a ${m.distancia_m} m de la tienda` : ''} · Se avisó a la tienda para despachar tus pedidos.`,
    };
}

// Ubicación del celular (GPS) -> { lat, lng, precision } o { error: 'texto' }.
// La usan la marca con el QR fijo (aquí) y "Usar mi ubicación actual" del Inicio de la tienda.
function qrPosicion() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({ error: 'Este celular o navegador no da la ubicación: no se puede marcar con el QR de la tienda.' });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy || 0) }),
            (e) => resolve({
                error: e.code === 1 ? 'No hay permiso para la ubicación: actívalo en el navegador para poder marcar (solo se marca estando en la tienda).'
                    : e.code === 3 ? 'El GPS tardó demasiado. Sal a un lugar abierto o activa la ubicación precisa e intenta de nuevo.'
                    : 'No se pudo obtener tu ubicación. Activa el GPS e intenta de nuevo.',
            }),
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 },
        );
    });
}

// Formulario "¿Por qué llegas tarde?" dentro del lector (marca tardía)
function qrFormularioJustificacion(texto) {
    const form = document.createElement('form');
    form.className = 'qr-justificar';
    form.noValidate = true;
    const etiqueta = document.createElement('label');
    etiqueta.className = 'campo-etiqueta';
    etiqueta.textContent = 'Motivo de la marca tardía *';
    const area = document.createElement('textarea');
    area.className = 'campo-input';
    area.rows = 3;
    area.maxLength = 200;
    area.placeholder = 'Ej. tráfico en la ruta 1, falla del vehículo...';
    etiqueta.htmlFor = area.id = 'qrJustificacion';
    const boton = document.createElement('button');
    boton.type = 'submit';
    boton.className = 'boton boton-principal';
    boton.innerHTML = '<i class="bi bi-send"></i> <span>Enviar y marcar</span>';
    form.append(etiqueta, area, boton);
    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const motivo = area.value.trim();
        if (motivo.length < 5) {
            qrEstado('Escribe el motivo (al menos 5 letras).', 'error');
            area.focus();
            return;
        }
        boton.disabled = true;
        const r = await qrLeerMarca(texto, motivo);
        boton.disabled = false;
        qrEstado(r.mensaje || '', r.tipo || '');
        if (r.tipo === 'ok') {
            qrMostrarResultado(null);
            qrApagar();
            const d = document.getElementById('qrLectorDialogo');
            d.querySelector('.qr-camara').hidden = true;
            setTimeout(() => { if (d.open) d.close(); }, r.cerrar || 2500);
        }
    });
    setTimeout(() => area.focus(), 50);
    return form;
}

// Marca de llegada -> aviso a la TIENDA (Admin G3 y Empleados) para que despache los pedidos
// físicos: a cada tienda de los pedidos que el piloto tiene en ese horario y aún no salen;
// si no tiene ninguno, a la tienda del QR (js/notificaciones.js)
async function qrAvisarLlegada(numero, tiendaQr, s, justificacion = null) {
    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const porSalir = ['registrado', 'recibido_bodega', 'asignado', 'reprogramado', 'alistando', 'listo_despacho', 'recibido_ruta', 'cargado'];
    const { data } = await db.from('pedidos').select('codigo, tienda_id').eq('piloto_id', s.id || 0)
        .eq('fecha_entrega', fecha).eq('marca_numero', numero).eq('anulado', false).in('estado', porSalir);
    const porTienda = {};
    (data || []).forEach((p) => { (porTienda[p.tienda_id] = porTienda[p.tienda_id] || []).push(p.codigo); });
    if (!Object.keys(porTienda).length && tiendaQr) porTienda[tiendaQr] = [];
    // Marca tardía: también le llega al G2 de la región, con el motivo
    const tarde = justificacion ? ` Marca TARDÍA. Motivo: ${justificacion}.` : '';
    await Promise.all(Object.entries(porTienda).map(([tiendaId, codigos]) => avisar({
        tiendaId: Number(tiendaId), a: justificacion ? ['tienda', 'g2'] : ['tienda'], enlace: '#pedidos',
        referenciaTipo: 'llegada_piloto', referenciaId: s.id || null,
        titulo: justificacion ? 'Piloto en tienda (marca tardía): despachar pedidos' : 'Piloto en tienda: despachar pedidos',
        mensaje: `${s.nombre || 'El piloto'} marcó su llegada (horario ${numero}).${tarde}` + (codigos.length
            ? ` Alista y despacha sus pedidos: ${codigos.join(', ')}.`
            : ' Revisa si tiene pedidos por despachar.'),
    })));
}

// ---------- QR del día del PILOTO (lo escanea la tienda) ----------
// Sale su ficha (foto, nombre, tienda y el horario que puede marcar ahora) con el botón
// "Validar y marcar": valida al piloto Y marca su horario en un solo paso (sql/01
// bloque 33: piloto_qr_info + validar_y_marcar_piloto). Marca tardía: se escribe el
// motivo en la misma ficha. Sin el bloque 33: solo valida, como antes.
async function qrLeerPiloto(token) {
    if (rolActual() === 'piloto') return { tipo: 'error', mensaje: 'Este es un QR de piloto: lo escanea la tienda para validarlo.' };
    const { data, error } = await db.rpc('piloto_qr_info', { p_token: token });
    if (error && (error.code === 'PGRST202' || error.code === '42883')) return qrLeerPilotoSoloValidar(token);
    if (error) {
        console.error('Error al leer el QR del piloto:', error);
        return {
            tipo: 'error',
            mensaje: error.code === 'P0001' ? error.message
                : error.code === '22P02' ? 'Ese QR de piloto no es válido.' : 'No se pudo leer el QR. Revisa la conexión.',
        };
    }
    const p = (data || [])[0];
    if (!p) return { tipo: 'error', mensaje: 'No se encontró ese piloto.' };
    const horaDe = (t) => (t ? String(t).slice(0, 5) : '');
    const puedeMarcar = p.horario != null && !p.ya_marcado;

    // Ficha: foto grande + nombre + tienda, para comparar con la persona
    const ficha = document.createElement('div');
    ficha.className = 'qr-ficha';
    const foto = document.createElement('span');
    foto.className = 'avatar avatar-grande';
    if (typeof pintarAvatar === 'function') pintarAvatar(foto, p.nombre, p.foto_url); // js/avatar.js
    ficha.appendChild(foto);
    qrTexto(ficha, 'strong', p.nombre, 'qr-ficha-nombre');
    if (p.tienda) qrTexto(ficha, 'span', p.tienda, 'qr-ficha-tienda');
    if (p.validado_en) {
        const h = new Date(p.validado_en).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
        qrTexto(ficha, 'span', `Ya validado hoy (${h})`, 'etiqueta etiqueta-verde');
    }
    qrTexto(ficha, 'span', p.horario == null ? 'No hay un horario abierto para marcar ahora.'
        : p.ya_marcado ? `Ya marcó el horario ${p.horario}.`
        : p.tarde ? `Horario ${p.horario} · MARCA TARDÍA (la hora de inicio era ${horaDe(p.inicio_hasta)})`
        : `Horario ${p.horario} · a tiempo`, `qr-ficha-horario${p.tarde ? ' qr-ficha-tarde' : ''}`);

    // Ya validado y sin nada que marcar: solo se informa
    if (p.validado_en && !puedeMarcar) {
        return { tipo: 'ok', mensaje: 'El piloto ya está validado hoy y no tiene un horario por marcar ahora.', nodo: ficha };
    }

    // Motivo (solo marca tardía) y botón
    const form = document.createElement('form');
    form.className = 'qr-justificar';
    form.noValidate = true;
    const area = document.createElement('textarea');
    const campoMotivo = document.createElement('div');
    campoMotivo.className = 'campo';
    campoMotivo.hidden = !p.tarde;
    const etiqueta = document.createElement('label');
    etiqueta.className = 'campo-etiqueta';
    etiqueta.textContent = 'Motivo de la marca tardía *';
    area.className = 'campo-input';
    area.rows = 2;
    area.maxLength = 200;
    area.placeholder = 'Ej. tráfico en la ruta 1, falla del vehículo...';
    etiqueta.htmlFor = area.id = 'qrJustificacionPiloto';
    campoMotivo.append(etiqueta, area);
    const boton = document.createElement('button');
    boton.type = 'submit';
    boton.className = 'boton boton-principal';
    boton.innerHTML = `<i class="bi bi-check2-circle"></i> <span>${puedeMarcar ? 'Validar y marcar' : 'Validar'}</span>`;
    form.append(campoMotivo, boton);
    ficha.appendChild(form);

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const motivo = area.value.trim();
        if (!campoMotivo.hidden && motivo.length < 5) {
            qrEstado('Escribe el motivo de la marca tardía (al menos 5 letras).', 'error');
            area.focus();
            return;
        }
        boton.disabled = true;
        const r = await qrValidarYMarcar(token, motivo || null);
        boton.disabled = false;
        if (r.justificar) {
            campoMotivo.hidden = false;
            qrEstado(r.mensaje, 'error');
            area.focus();
            return;
        }
        qrEstado(r.mensaje, r.tipo);
        if (r.tipo === 'ok') {
            form.hidden = true;
            if (navigator.vibrate) navigator.vibrate(120);
            setTimeout(() => { const d = document.getElementById('qrLectorDialogo'); if (d && d.open) d.close(); }, 3500);
        }
    });

    return {
        tipo: 'ok',
        mensaje: `Compara la foto con la persona y presiona "${puedeMarcar ? 'Validar y marcar' : 'Validar'}".`,
        nodo: ficha,
    };
}

// Valida al piloto y marca su horario abierto (todo o nada). Avisa a la tienda para despachar.
async function qrValidarYMarcar(token, justificacion) {
    const s = obtenerSesion() || {};
    const { data, error } = await db.rpc('validar_y_marcar_piloto', { p_token: token, p_usuario: s.id || null, p_justificacion: justificacion });
    if (error) {
        console.error('Error al validar y marcar:', error);
        if (error.code === 'P0001' && error.message.startsWith('JUSTIFICAR:')) {
            return { tipo: 'error', justificar: true, mensaje: error.message.slice('JUSTIFICAR:'.length) };
        }
        return { tipo: 'error', mensaje: error.code === 'P0001' ? error.message : 'No se pudo validar. Revisa la conexión.' };
    }
    const m = (data || [])[0];
    if (!m) return { tipo: 'error', mensaje: 'No se pudo validar.' };
    if (m.numero == null) return { tipo: 'ok', mensaje: `✔ ${m.nombre} validado. ${m.nota || ''}`.trim() };
    const hora = new Date(m.marcado_en).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
    await qrAvisarLlegada(m.numero, m.tienda_id, { id: m.piloto_id, nombre: m.nombre }, m.a_tiempo ? null : m.justificacion);
    window.dispatchEvent(new CustomEvent('acachete:marca'));
    return {
        tipo: 'ok',
        mensaje: `✔ ${m.nombre} validado y marcado: horario ${m.numero} a las ${hora}${m.a_tiempo ? '' : ' (marca tardía)'} · Se avisó a la tienda para despachar sus pedidos.`,
    };
}

// Sin el bloque 33 de sql/01: solo valida (el piloto marca con el QR de la tienda)
async function qrLeerPilotoSoloValidar(token) {
    const s = obtenerSesion() || {};
    const { data, error } = await db.rpc('validar_piloto', { p_token: token, p_usuario: s.id || null });
    if (error) {
        console.error('Error al validar piloto:', error);
        return {
            tipo: 'error',
            mensaje: error.code === 'P0001' ? error.message
                : error.code === 'PGRST202' || error.code === '42883' ? 'Falta instalar la base de datos (sql/instalacion).'
                    : error.code === '22P02' ? 'Ese QR de piloto no es válido.' : 'No se pudo validar. Revisa la conexión.',
        };
    }
    const p = (data || [])[0];
    if (!p) return { tipo: 'error', mensaje: 'No se encontró ese piloto.' };
    // Ficha: foto grande + nombre + tienda, para comparar con la persona
    const ficha = document.createElement('div');
    ficha.className = 'qr-ficha';
    const foto = document.createElement('span');
    foto.className = 'avatar avatar-grande';
    if (typeof pintarAvatar === 'function') pintarAvatar(foto, p.nombre, p.foto_url); // js/avatar.js
    ficha.appendChild(foto);
    qrTexto(ficha, 'strong', p.nombre, 'qr-ficha-nombre');
    if (p.tienda) qrTexto(ficha, 'span', p.tienda, 'qr-ficha-tienda');
    const hora = new Date(p.validado_en).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
    qrTexto(ficha, 'span', p.ya_estaba ? `Ya estaba validado hoy (${hora}).` : `Validado hoy a las ${hora}.`, 'etiqueta etiqueta-verde');
    return { tipo: 'ok', mensaje: 'Compara la foto con la persona. Si coincide, el piloto ya puede marcar.', nodo: ficha };
}

// Botón "Escanear QR" del encabezado (app.html)
document.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('qrBoton');
    if (b) b.addEventListener('click', escanearQrGeneral);
});
