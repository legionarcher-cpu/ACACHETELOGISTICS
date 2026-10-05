/* ==================================================
   QR (común a todas las secciones)
   ACACHETE LOGISTICS

   Hay 3 QR en el sistema. Ninguno lleva datos personales: solo un código
   que la base reconoce (si lo lee otra cámara, no ve nada del cliente).

     ACACHETE-PEDIDO:<token>         QR del pedido (se crea con el pedido).
                                     Al escanearlo aquí se abre una ventana
                                     con TODA la información del pedido.
     ACACHETE-MARCA:<tienda>:<código> QR de marcas de la tienda. Cambia cada
                                     mes (qr_marca_mes); se ve e imprime en
                                     Tiendas. El PILOTO lo escanea al llegar y
                                     se marca solo el horario abierto
                                     (marcar_por_qr) + aviso a la tienda.
     ACACHETE-PILOTO:<token>          QR del día del piloto (qr_piloto_dia; lo da
                                     el G2 en Rutas y asignaciones y el piloto
                                     lo ve en su Inicio). La TIENDA lo escanea al
                                     empezar el día: sale su nombre y su foto y
                                     queda validado (validar_piloto). Sin esa
                                     validación el piloto no puede marcar.

   Funciones que usan las secciones:
     escanearQrGeneral()            -> botón "Escanear QR" del encabezado
     abrirLectorQr({ titulo, ayuda, alLeer })  -> cámara (librería gratis jsQR)
     mostrarQrEnVentana({ titulo, texto, ... }) -> QR para ver, descargar o imprimir
     mostrarPedidoQr(pedidoId)      -> ventana flotante con la información del pedido

   Tablas y funciones: sql/00 sección 5 (sql/01 bloques 13 y 14).
   Estilos: css/componentes.css (bloque "QR").
   Necesita: js/supabase.js, js/sesion.js, js/componentes.js y js/notificaciones.js.
   ================================================== */

const QR_LIB_DIBUJAR = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
const QR_LIB_LEER = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
const QR_PREFIJO = { pedido: 'ACACHETE-PEDIDO:', marca: 'ACACHETE-MARCA:', piloto: 'ACACHETE-PILOTO:' };

// Texto y color de cada estado del pedido (los mismos de js/secciones/pedidos.js)
const QR_ESTADOS = {
    registrado: ['Registrado', 'etiqueta-gris'], recibido_bodega: ['En bodega', 'etiqueta-morada'],
    asignado: ['Asignado', 'etiqueta-azul'], alistando: ['Alistando', 'etiqueta-naranja'],
    listo_despacho: ['Listo para despachar', 'etiqueta-azul'], recibido_ruta: ['Recibido para ruta', 'etiqueta-morada'],
    cargado: ['Cargado', 'etiqueta-turquesa'], en_ruta: ['En ruta', 'etiqueta-turquesa'], en_entrega: ['Entregando', 'etiqueta-turquesa'],
    entregado: ['Entregado', 'etiqueta-verde'], entregado_incidencia: ['Entregado con incidencia', 'etiqueta-naranja'],
    no_entregado: ['No entregado', 'etiqueta-rosada'], reprogramado: ['Reprogramado', 'etiqueta-azul'],
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
            qrEstado('Apunta la cámara al QR.');
            qrEncender();
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
}

function qrApagar() {
    if (qrLazo) cancelAnimationFrame(qrLazo);
    qrLazo = null;
    if (qrCamara) qrCamara.getTracks().forEach((t) => t.stop());
    qrCamara = null;
    const v = document.querySelector('#qrLectorDialogo [data-video]');
    if (v) v.srcObject = null;
}

async function abrirLectorQr({ titulo = 'Escanear QR', ayuda = 'Apunta la cámara al QR.', alLeer }) {
    const d = qrDialogoLector();
    d.querySelector('[data-titulo]').textContent = titulo;
    qrAlLeer = alLeer;
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

async function qrProcesar(texto) {
    if (!qrAlLeer) return;
    qrOcupado = true;
    qrEstado('Revisando...');
    try {
        const r = (await qrAlLeer(texto)) || {};
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
            ? 'Escanea el QR de marcas de la tienda (para marcar tu llegada) o el QR de un pedido.'
            : 'Escanea el QR del día de un piloto (para validarlo) o el QR de un pedido.',
        alLeer: qrLeerGeneral,
    });
}

async function qrLeerGeneral(texto) {
    if (texto.startsWith(QR_PREFIJO.pedido)) return qrLeerPedido(texto.slice(QR_PREFIJO.pedido.length));
    if (texto.startsWith(QR_PREFIJO.marca)) return qrLeerMarca(texto);
    if (texto.startsWith(QR_PREFIJO.piloto)) return qrLeerPiloto(texto.slice(QR_PREFIJO.piloto.length));
    return { tipo: 'error', mensaje: 'Ese QR no es del sistema.' };
}

// ---------- QR del PEDIDO: ventana con toda la información ----------
async function qrLeerPedido(token) {
    const { data, error } = await db.from('pedidos').select('id').eq('token_qr', token).maybeSingle();
    if (error || !data) return { tipo: 'error', mensaje: 'No se encontró ese pedido.' };
    const d = document.getElementById('qrLectorDialogo');
    if (d && d.open) d.close();
    mostrarPedidoQr(data.id);
    return { tipo: 'ok', mensaje: '' };
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
    const d = qrDialogo('qrPedidoDialogo', `
        <div class="dialogo-form qr-pedido">
            <h3 class="dialogo-titulo qr-pedido-titulo"><span data-codigo>Pedido</span> <span data-estado></span></h3>
            <p class="qr-subtitulo" data-sub></p>
            <dl class="qr-datos" data-datos></dl>
            <div data-mercaderia></div>
            <div class="dialogo-botones">
                <button type="button" class="boton boton-secundario" data-cerrar>Cerrar</button>
                <a class="boton boton-principal" data-abrir><i class="bi bi-box-arrow-up-right"></i> <span>Abrir pedido</span></a>
            </div>
        </div>`, 'qr-dialogo');
    const $ = (s) => d.querySelector(s);
    $('[data-codigo]').textContent = 'Cargando...';
    $('[data-estado]').replaceChildren();
    $('[data-sub]').textContent = '';
    $('[data-datos]').replaceChildren();
    $('[data-mercaderia]').replaceChildren();
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
    $('[data-sub]').textContent = [p.tiendas ? `${p.tiendas.codigo} · ${p.tiendas.nombre}` : '', p.actividad].filter(Boolean).join(' · ');

    const moneda = '₡';
    const dinero = (n) => `${moneda}${Number(n || 0).toFixed(2)}`;
    const fecha = (f) => (f ? f.split('-').reverse().join('/') : '—');
    const verMarca = rolActual() === 'piloto' || esAdministrador() || esAdminG1() || esAdminG2();
    const filas = [
        ['Cliente', p.cliente_nombre],
        ['Teléfono', p.cliente_telefono],
        ['Recibe', p.recibe_tipo === 'autorizado' ? `${p.recibe_nombre || ''} (autorizado)${p.recibe_telefono ? ` · ${p.recibe_telefono}` : ''}` : 'El mismo cliente'],
        ['Punto de partida', p.direccion_recoleccion],
        ['Entrega en', p.direccion_entrega],
        ['Distancia', p.distancia_km != null ? `${p.distancia_km} km` : null],
        ['Fecha de entrega', fecha(p.fecha_entrega)],
        ['Slot de despacho', p.slot_numero ? `Slot ${p.slot_numero}` : null],
        ['Horario del piloto', verMarca && p.marca_numero ? `Horario ${p.marca_numero}` : null],
        ['Piloto', p.piloto ? p.piloto.nombre : 'Sin asignar'],
        ['Peso total', `${Number(p.peso_total_kg || 0)} kg`],
        ['Lleva alcohol', p.lleva_alcohol ? 'Sí: confirmar mayoría de edad' : null],
        ['Compra', p.monto_compra != null ? dinero(p.monto_compra) : null],
        ['Envío', dinero(p.costo_envio)],
        ['A cobrar al entregar', `${dinero(p.total_cobrar)} · ${p.forma_pago === 'tarjeta' ? 'Tarjeta' : 'Efectivo'}`],
        ['Notas', p.notas],
        ['Motivo de cancelación', p.estado === 'cancelado' ? p.motivo_cancelacion : null],
    ];
    filas.filter(([, v]) => v != null && v !== '').forEach(([e, v]) => {
        qrTexto($('[data-datos]'), 'dt', e);
        qrTexto($('[data-datos]'), 'dd', v);
    });

    // Mercadería
    const arts = p.pedido_articulos || [];
    if (arts.length) {
        qrTexto($('[data-mercaderia]'), 'h4', 'Mercadería', 'qr-mercaderia-titulo');
        const ul = document.createElement('ul');
        ul.className = 'qr-mercaderia';
        arts.forEach((a) => qrTexto(ul, 'li', `${a.cantidad} × ${a.descripcion || a.categoria}${a.tamano ? ` (${a.tamano})` : ''} · ${a.categoria} · ${Number(a.peso_kg)} kg c/u`));
        $('[data-mercaderia]').appendChild(ul);
    }
    const abrir = $('[data-abrir]');
    abrir.hidden = false;
    abrir.href = `#pedidos?id=${p.id}`;
    abrir.onclick = () => d.close();
}

// ---------- QR de MARCAS de la tienda (lo escanea el piloto) ----------
//   Hasta la "hora inicio" -> a tiempo. Entre la hora inicio y "termina" -> MARCA TARDÍA:
//   la base responde "JUSTIFICAR:..." y aquí se pide el motivo; al enviarlo se marca.
async function qrLeerMarca(texto, justificacion = null) {
    const s = obtenerSesion() || {};
    if (rolActual() !== 'piloto') return { tipo: 'error', mensaje: 'Este es el QR de marcas de la tienda: lo escanean los pilotos al llegar.' };
    const { data, error } = await db.rpc('marcar_por_qr', { p_piloto: s.id || 0, p_qr: texto, p_justificacion: justificacion });
    if (error) {
        console.error('Error al marcar con QR:', error);
        if (error.code === 'P0001' && error.message.startsWith('JUSTIFICAR:')) {
            return { tipo: 'error', mensaje: error.message.slice('JUSTIFICAR:'.length), nodo: qrFormularioJustificacion(texto) };
        }
        return {
            tipo: 'error',
            mensaje: error.code === 'P0001' ? error.message
                : error.code === 'PGRST202' || error.code === '42883' ? 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloques 14 y 15: QR y marca tardía).'
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
        mensaje: `✔ Horario ${m.numero} marcado a las ${hora}${m.a_tiempo ? '' : ' (marca tardía, justificada)'}. Se avisó a la tienda para despachar tus pedidos.`,
    };
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
async function qrLeerPiloto(token) {
    const s = obtenerSesion() || {};
    if (rolActual() === 'piloto') return { tipo: 'error', mensaje: 'Este es un QR de piloto: lo escanea la tienda para validarlo.' };
    const { data, error } = await db.rpc('validar_piloto', { p_token: token, p_usuario: s.id || null });
    if (error) {
        console.error('Error al validar piloto:', error);
        return {
            tipo: 'error',
            mensaje: error.code === 'P0001' ? error.message
                : error.code === 'PGRST202' || error.code === '42883' ? 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 14: QR).'
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

// Botón "Escanear QR" del encabezado (index.html)
document.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('qrBoton');
    if (b) b.addEventListener('click', escanearQrGeneral);
});
