/* ==================================================
   NOTIFICACIONES (campana del encabezado)
   ACACHETE LOGISTICS

   Tabla: "notificaciones" (sql/11_notificaciones.sql). Cada fila es un
   aviso para UN usuario.

   PARTE 1 - ENVIAR (las usan las secciones):
     notificarPendiente(...)   -> avisa a quienes deben APROBAR algo
     notificarResultado(...)   -> avisa a quien PIDIÓ algo si se aprobó o rechazó
     resolverPendientes(...)   -> marca como leídos los avisos "pendiente"
                                  de algo que ya se resolvió
     Si enviar falla, NO se detiene la acción principal (solo se anota
     el error en la consola).

   PARTE 2 - CAMPANA:
     - Icono con número rojo de "sin leer" junto al usuario.
     - Clic -> lista de las últimas notificaciones. Clic en una -> se marca
       como leída y lleva a su sección.
     - Aviso emergente (esquina inferior derecha) cuando llega una nueva,
       y al entrar si hay sin leer.
     - Revisa novedades cada 60 segundos y al cambiar de sección.

   Quién aprueba qué (lo decide destinatariosAprobacion):
     usuario creado por un Admin G3 -> Administrador, Admin G1, Admin G2 de la región
     cliente de un Empleado          -> los mismos + Admin G3 de la tienda

   HTML: index.html (.noti-*) | Estilos: css/index.css (bloque "NOTIFICACIONES")
   Necesita: js/supabase.js (db) y js/sesion.js cargados antes.
   La enciende/apaga js/permisos.js (aplicarPermisos) según haya sesión.
   ================================================== */

// Cada cuánto se revisan novedades (ms). 60000 = 1 minuto.
const NOTI_INTERVALO = 60000;

// Cuántas notificaciones se muestran en la lista
const NOTI_LIMITE = 30;

// Cuánto dura el aviso emergente en pantalla (ms)
const NOTI_DURACION_AVISO = 6000;

// Icono y color de cada tipo (clases de css/index.css)
const NOTI_TIPOS = {
    pendiente: { icono: 'bi-hourglass-split', clase: 'noti-pendiente' },
    aprobado:  { icono: 'bi-check-circle',    clase: 'noti-aprobado' },
    rechazado: { icono: 'bi-x-circle',        clase: 'noti-rechazado' },
    info:      { icono: 'bi-info-circle',     clase: 'noti-info' },
};


/* ==================================================
   PARTE 1 - ENVIAR NOTIFICACIONES
   ================================================== */

// Ids de los usuarios que pueden aprobar algo de una tienda.
//   incluirG3 = true -> también el Admin G3 de esa tienda (para clientes)
// No incluye al usuario conectado (no se avisa a sí mismo).
async function destinatariosAprobacion(tiendaId, incluirG3 = false) {
    const roles = ['administrador', 'admin_g1', 'admin_g2'];
    if (incluirG3) roles.push('admin_g3');

    const [{ data: aprobadores, error }, { data: tienda }] = await Promise.all([
        db.from('usuarios').select('id, rol, region, tienda_id').in('rol', roles),
        db.from('tiendas').select('region').eq('id', tiendaId).maybeSingle(),
    ]);
    if (error) throw error;

    const region = tienda ? tienda.region : null;
    const yo = obtenerSesion();

    return (aprobadores || [])
        .filter((u) =>
            u.rol === 'administrador' || u.rol === 'admin_g1' ||
            (u.rol === 'admin_g2' && u.region === region) ||
            (u.rol === 'admin_g3' && u.tienda_id === tiendaId))
        .filter((u) => !yo || u.id !== yo.id)
        .map((u) => u.id);
}

// Avisa a quienes deben aprobar algo.
// Ej.: notificarPendiente({ referenciaTipo: 'cliente', referenciaId: 5, tiendaId: 1,
//        incluirG3: true, titulo: 'Cliente por aprobar', mensaje: '...', enlace: '#clientes?tienda=1' })
async function notificarPendiente({ referenciaTipo, referenciaId, tiendaId, incluirG3 = false, titulo, mensaje, enlace }) {
    try {
        const ids = await destinatariosAprobacion(tiendaId, incluirG3);
        if (ids.length === 0) return;
        const filas = ids.map((usuario_id) => ({
            usuario_id, tipo: 'pendiente', titulo, mensaje, enlace,
            referencia_tipo: referenciaTipo, referencia_id: referenciaId,
        }));
        const { error } = await db.from('notificaciones').insert(filas);
        if (error) throw error;
    } catch (err) {
        console.error('No se pudo enviar la notificación de pendiente:', err);
    }
}

// Avisa a quien pidió algo si se aprobó o se rechazó.
//   aprobado = true | false
async function notificarResultado({ usuarioId, aprobado, titulo, mensaje, enlace, referenciaTipo, referenciaId }) {
    if (!usuarioId) return;
    try {
        const { error } = await db.from('notificaciones').insert({
            usuario_id: usuarioId,
            tipo: aprobado ? 'aprobado' : 'rechazado',
            titulo, mensaje, enlace,
            referencia_tipo: referenciaTipo || null,
            referencia_id: referenciaId || null,
        });
        if (error) throw error;
    } catch (err) {
        console.error('No se pudo enviar la notificación de resultado:', err);
    }
}

// Algo ya se resolvió (aprobado, rechazado o eliminado): sus avisos
// "pendiente" se marcan como leídos para todos los aprobadores.
async function resolverPendientes(referenciaTipo, referenciaId) {
    try {
        const { error } = await db.from('notificaciones')
            .update({ leida: true })
            .eq('tipo', 'pendiente')
            .eq('referencia_tipo', referenciaTipo)
            .eq('referencia_id', referenciaId);
        if (error) throw error;
    } catch (err) {
        console.error('No se pudieron cerrar los avisos pendientes:', err);
    }
    refrescarNotificaciones();
}


/* ==================================================
   PARTE 2 - CAMPANA
   ================================================== */

let notiTemporizador = null;  // setInterval de la revisión cada minuto
let notiUltimoId = null;      // id más alto ya visto (para saber cuáles son nuevas)
let notiLista = [];           // últimas notificaciones del usuario

// "hace 5 min", "hace 2 h", "hace 3 días"
function tiempoRelativo(fechaTexto) {
    const minutos = Math.floor((Date.now() - new Date(fechaTexto).getTime()) / 60000);
    if (minutos < 1) return 'ahora';
    if (minutos < 60) return `hace ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `hace ${horas} h`;
    const dias = Math.floor(horas / 24);
    return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

// Ícono redondo según el tipo
function crearIconoNoti(tipo) {
    const datos = NOTI_TIPOS[tipo] || NOTI_TIPOS.info;
    const icono = document.createElement('span');
    icono.className = `noti-icono ${datos.clase}`;
    icono.innerHTML = `<i class="bi ${datos.icono}"></i>`;
    return icono;
}

// Una fila de la lista de la campana
function crearItemNoti(n) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `noti-item${n.leida ? '' : ' no-leida'}`;
    item.dataset.id = n.id;

    const textos = document.createElement('span');
    textos.className = 'noti-textos';

    const titulo = document.createElement('span');
    titulo.className = 'noti-titulo';
    titulo.textContent = n.titulo;

    const mensaje = document.createElement('span');
    mensaje.className = 'noti-mensaje';
    mensaje.textContent = n.mensaje || '';

    const fecha = document.createElement('span');
    fecha.className = 'noti-fecha';
    fecha.textContent = tiempoRelativo(n.creado_en);

    textos.append(titulo, mensaje, fecha);
    item.append(crearIconoNoti(n.tipo), textos);
    return item;
}

// Dibuja el número rojo y la lista
function dibujarCampana() {
    const contador = document.getElementById('notiContador');
    const lista = document.getElementById('notiLista');
    if (!contador || !lista) return;

    const sinLeer = notiLista.filter((n) => !n.leida).length;
    contador.textContent = sinLeer > 9 ? '9+' : sinLeer;
    contador.hidden = sinLeer === 0;
    document.getElementById('notiCampana').title = sinLeer
        ? `${sinLeer} notificación${sinLeer === 1 ? '' : 'es'} sin leer`
        : 'Notificaciones';

    lista.replaceChildren();
    if (notiLista.length === 0) {
        const vacio = document.createElement('p');
        vacio.className = 'noti-vacio';
        vacio.textContent = 'No tienes notificaciones.';
        lista.appendChild(vacio);
        return;
    }
    notiLista.forEach((n) => lista.appendChild(crearItemNoti(n)));
}

// Aviso emergente en la esquina (desaparece solo; clic -> abre su enlace)
function mostrarAvisoNoti({ tipo, titulo, mensaje, enlace, id }) {
    const contenedor = document.getElementById('notiAvisos');
    if (!contenedor) return;

    const aviso = document.createElement('button');
    aviso.type = 'button';
    aviso.className = 'noti-aviso';

    const textos = document.createElement('span');
    textos.className = 'noti-textos';
    const t = document.createElement('span');
    t.className = 'noti-titulo';
    t.textContent = titulo;
    const m = document.createElement('span');
    m.className = 'noti-mensaje';
    m.textContent = mensaje || '';
    textos.append(t, m);
    aviso.append(crearIconoNoti(tipo), textos);

    aviso.addEventListener('click', () => {
        if (id) marcarLeida(id);
        if (enlace) location.hash = enlace.replace(/^#/, '');
        aviso.remove();
    });

    contenedor.appendChild(aviso);
    setTimeout(() => aviso.remove(), NOTI_DURACION_AVISO);
}

// Trae las notificaciones del usuario conectado y muestra avisos de las nuevas
async function refrescarNotificaciones() {
    const sesion = obtenerSesion();
    if (!sesion) return;

    const { data, error } = await db.from('notificaciones')
        .select('id, tipo, titulo, mensaje, enlace, leida, creado_en')
        .eq('usuario_id', sesion.id)
        .order('creado_en', { ascending: false })
        .limit(NOTI_LIMITE);

    if (error) {
        // Si la tabla aún no existe (falta sql/11), la campana queda vacía sin molestar
        console.error('No se pudieron cargar las notificaciones:', error);
        return;
    }

    const primeraVez = notiUltimoId === null;
    const maxId = data.reduce((max, n) => Math.max(max, n.id), 0);

    if (primeraVez) {
        // Al entrar: un solo aviso si hay sin leer
        const sinLeer = data.filter((n) => !n.leida).length;
        if (sinLeer > 0) {
            mostrarAvisoNoti({
                tipo: 'info',
                titulo: `Tienes ${sinLeer} notificación${sinLeer === 1 ? '' : 'es'} sin leer`,
                mensaje: 'Revísalas en la campana de arriba.',
            });
        }
    } else {
        // Después: un aviso por cada notificación nueva (máximo 3)
        data.filter((n) => n.id > notiUltimoId && !n.leida).slice(0, 3).reverse()
            .forEach((n) => mostrarAvisoNoti(n));
    }

    notiUltimoId = Math.max(notiUltimoId || 0, maxId);
    notiLista = data;
    dibujarCampana();
}

async function marcarLeida(id) {
    const n = notiLista.find((x) => x.id === id);
    if (n) n.leida = true;
    dibujarCampana();
    const { error } = await db.from('notificaciones').update({ leida: true }).eq('id', id);
    if (error) console.error('No se pudo marcar como leída:', error);
}

async function marcarTodasLeidas() {
    const sesion = obtenerSesion();
    if (!sesion) return;
    notiLista.forEach((n) => { n.leida = true; });
    dibujarCampana();
    const { error } = await db.from('notificaciones')
        .update({ leida: true })
        .eq('usuario_id', sesion.id)
        .eq('leida', false);
    if (error) console.error('No se pudieron marcar como leídas:', error);
}

// Enciende la campana (al abrir la página con sesión o al iniciar sesión).
// Se puede llamar varias veces: solo crea un temporizador.
function iniciarNotificaciones() {
    if (notiTemporizador) return;
    refrescarNotificaciones();
    notiTemporizador = setInterval(refrescarNotificaciones, NOTI_INTERVALO);
}

// Apaga la campana (al cerrar sesión)
function detenerNotificaciones() {
    clearInterval(notiTemporizador);
    notiTemporizador = null;
    notiUltimoId = null;
    notiLista = [];
    dibujarCampana();
    const panel = document.getElementById('notiPanel');
    if (panel) panel.classList.remove('abierto');
}

// ---------- Eventos de la campana (se conectan una sola vez) ----------
document.addEventListener('DOMContentLoaded', () => {
    const campana = document.getElementById('notiCampana');
    const panel = document.getElementById('notiPanel');
    if (!campana || !panel) return;

    // Abrir / cerrar la lista (y refrescar al abrir)
    campana.addEventListener('click', () => {
        const abrir = !panel.classList.contains('abierto');
        panel.classList.toggle('abierto', abrir);
        if (abrir) refrescarNotificaciones();
    });

    // Cerrar al hacer clic fuera
    document.addEventListener('click', (evento) => {
        if (!campana.contains(evento.target) && !panel.contains(evento.target)) {
            panel.classList.remove('abierto');
        }
    });

    // Clic en una notificación: marcar leída e ir a su sección
    document.getElementById('notiLista').addEventListener('click', (evento) => {
        const item = evento.target.closest('.noti-item');
        if (!item) return;
        const n = notiLista.find((x) => x.id === Number(item.dataset.id));
        if (!n) return;
        if (!n.leida) marcarLeida(n.id);
        panel.classList.remove('abierto');
        if (n.enlace) location.hash = n.enlace.replace(/^#/, '');
    });

    document.getElementById('notiMarcarTodas').addEventListener('click', marcarTodasLeidas);

    // Al cambiar de sección también se revisan novedades
    window.addEventListener('hashchange', () => {
        if (notiTemporizador) refrescarNotificaciones();
    });
});
