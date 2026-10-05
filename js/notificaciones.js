/* ==================================================
   NOTIFICACIONES (campana del encabezado)
   ACACHETE LOGISTICS

   Tabla: "notificaciones" (sql/00, sección 4). Cada fila es un
   aviso para UN usuario.

   PARTE 1 - ENVIAR (las usan las secciones):
     notificarPendiente(...)   -> avisa a quienes deben APROBAR algo
     avisar(...)               -> aviso por rol (G3 de la tienda, G2 de la región,
                                  administradores) y/o a usuarios concretos (el piloto)
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

   A quién se avisa (lo decide destinatariosAprobacion):
     usuario creado por un Admin G3 -> Administrador, Admin G1, Admin G2 de la región
     solicitud de tienda (cliente de un Empleado) -> SOLO el Admin G3 de la tienda
       (si la tienda no tiene G3: el Admin G2 de la región). Así no se llena
       de avisos a los administradores principales; ellos igual pueden aprobar
       desde Clientes si entran.

   AVISOS DE PEDIDOS (js/secciones/pedidos.js e inicio.js; ver docs/secciones/pedidos.md):
     piloto marca su llegada (horario) -> G3 y Empleados de la tienda (despachar sus pedidos)
     pedido nuevo sin piloto      -> G2 (pendiente: asignar)       | con piloto -> el piloto (info)
     solicitud de reasignación    -> G2 (pendiente)                 | resultado -> quien la pidió
     listo para despachar         -> el piloto (info: recíbelo)
     piloto "Recibido para ruta"  -> G3 de la tienda (pendiente: aprobar salida)
     piloto "No entregado"        -> G2 (pendiente: reprogramar o cancelar) + G3 (info)
     G2 reprograma / cancela / devuelto -> G3 de la tienda + el piloto (info)
     tienda cancela               -> G2 + el piloto (info)
     Los "pendiente" se cierran solos (resolverPendientes) cuando alguien hace lo pedido.

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

// Ids de los usuarios a los que se avisa de una solicitud de una tienda.
//   soloTienda = false -> Administrador, Admin G1 y Admin G2 de la región
//                         (ej. un empleado creado por un Admin G3)
//   soloTienda = true  -> SOLO el Admin G3 de esa tienda (ej. clientes de un
//                         Empleado), para no llenar de avisos a los admins
//                         principales. Si la tienda no tiene Admin G3, se avisa
//                         al Admin G2 de la región y, si tampoco hay, al
//                         Administrador y Admin G1, para que no quede sin ver.
// Todo dentro de la empresa activa (js/supabase.js filtra los usuarios).
//   soloRegion = true  -> SOLO el Admin G2 de la región de la tienda (ej. una
//                         solicitud de reasignación de un pedido que pide un
//                         Admin G3). Si no hay G2, al Administrador y Admin G1.
// Solo usuarios aprobados. No incluye al usuario conectado.
async function destinatariosAprobacion(tiendaId, soloTienda = false, soloRegion = false) {
    const [{ data: candidatos, error }, { data: tienda }] = await Promise.all([
        db.from('usuarios')
            .select('id, rol, region, tienda_id, aprobado')
            .in('rol', ['administrador', 'admin_g1', 'admin_g2', 'admin_g3']),
        db.from('tiendas').select('region').eq('id', tiendaId).maybeSingle(),
    ]);
    if (error) throw error;

    const region = tienda ? tienda.region : null;
    const yo = obtenerSesion();
    const activos = (candidatos || [])
        .filter((u) => u.aprobado !== false)
        .filter((u) => !yo || u.id !== yo.id);

    const g2DeLaRegion = activos.filter((u) => u.rol === 'admin_g2' && u.region === region);
    const generales = activos.filter((u) => u.rol === 'administrador' || u.rol === 'admin_g1');

    if (soloTienda) {
        // G3 de la tienda; si no tiene, G2 de la región; si tampoco, Administrador y G1
        // (así una solicitud nunca queda sin que nadie la vea)
        const g3DeLaTienda = activos.filter((u) => u.rol === 'admin_g3' && u.tienda_id === tiendaId);
        return (g3DeLaTienda.length ? g3DeLaTienda : g2DeLaRegion.length ? g2DeLaRegion : generales).map((u) => u.id);
    }

    if (soloRegion) {
        return (g2DeLaRegion.length ? g2DeLaRegion : generales).map((u) => u.id);
    }

    return activos
        .filter((u) => u.rol === 'administrador' || u.rol === 'admin_g1' || g2DeLaRegion.includes(u))
        .map((u) => u.id);
}

// Avisa a quienes deben aprobar algo (ver destinatariosAprobacion).
// Ej.: notificarPendiente({ referenciaTipo: 'cliente', referenciaId: 5, tiendaId: 1,
//        soloTienda: true, titulo: 'Cliente por aprobar', mensaje: '...', enlace: '#clientes?tienda=1' })
async function notificarPendiente({ referenciaTipo, referenciaId, tiendaId, soloTienda = false, soloRegion = false, titulo, mensaje, enlace }) {
    try {
        const ids = await destinatariosAprobacion(tiendaId, soloTienda, soloRegion);
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

// Aviso general por ROL (lo usan los pedidos: tienda -> G3 / G2, piloto -> G2, G2 -> tienda y piloto).
//   a: quiénes, por rol, de la tienda del pedido:
//        'tienda'    -> Admin G3 y Empleados de la tienda (quienes despachan)
//        'g3'        -> Admin G3 de la tienda (si no tiene, nadie más: la tienda la ve en Pedidos)
//        'g2'        -> Admin G2 de la región (si no hay, Administrador y Admin G1)
//        'generales' -> Administrador y Admin G1
//   usuarios: ids concretos (ej. el piloto del pedido)
//   tipo: 'pendiente' (hay que hacer algo; se cierra con resolverPendientes) | 'info' | 'aprobado' | 'rechazado'
// Nunca se avisa al usuario conectado ni a usuarios sin aprobar. Si falla, solo queda en la consola.
// Ej.: avisar({ tiendaId: 3, a: ['g2'], tipo: 'pendiente', titulo: '...', mensaje: '...',
//               enlace: '#pedidos?id=15', referenciaTipo: 'pedido_no_entregado', referenciaId: 15 })
async function avisar({ tiendaId = null, a = [], usuarios = [], tipo = 'info', titulo, mensaje, enlace, referenciaTipo = null, referenciaId = null }) {
    try {
        const ids = new Set(usuarios.filter(Boolean));
        if (a.length && tiendaId) {
            const [{ data: candidatos, error }, { data: tienda }] = await Promise.all([
                db.from('usuarios').select('id, rol, region, tienda_id, aprobado')
                    .in('rol', ['administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado']),
                db.from('tiendas').select('region').eq('id', tiendaId).maybeSingle(),
            ]);
            if (error) throw error;
            const region = tienda ? tienda.region : null;
            const activos = (candidatos || []).filter((u) => u.aprobado !== false);
            const generales = activos.filter((u) => u.rol === 'administrador' || u.rol === 'admin_g1');
            const g2 = activos.filter((u) => u.rol === 'admin_g2' && u.region === region);
            if (a.includes('tienda')) {
                activos.filter((u) => ['admin_g3', 'empleado'].includes(u.rol) && u.tienda_id === tiendaId).forEach((u) => ids.add(u.id));
            }
            if (a.includes('g3')) activos.filter((u) => u.rol === 'admin_g3' && u.tienda_id === tiendaId).forEach((u) => ids.add(u.id));
            if (a.includes('g2')) (g2.length ? g2 : generales).forEach((u) => ids.add(u.id));
            if (a.includes('generales')) generales.forEach((u) => ids.add(u.id));
        }
        const yo = obtenerSesion();
        if (yo) ids.delete(yo.id);
        if (!ids.size) return;
        const { error } = await db.from('notificaciones').insert([...ids].map((usuario_id) => ({
            usuario_id, tipo, titulo, mensaje, enlace,
            referencia_tipo: referenciaTipo, referencia_id: referenciaId,
        })));
        if (error) throw error;
    } catch (err) {
        console.error('No se pudo enviar el aviso:', err);
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
        // Si la tabla aún no existe (base sin instalar), la campana queda vacía sin molestar
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
