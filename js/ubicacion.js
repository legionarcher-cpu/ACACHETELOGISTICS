/* ==================================================
   UBICACIÓN DEL PILOTO EN TIEMPO REAL (desde la web)
   ACACHETE LOGISTICS

   Qué hace: si el usuario es PILOTO (o conductor) y tiene pedidos "En ruta" /
   "Entregando" (o viajes "En camino" / "En curso"), manda su posición GPS a la
   base cada UBICACION_CADA (2 minutos), en cualquier sección de la página.
   Fuera de ruta no pide el GPS.

   Base (sql/01 bloque 25):
     piloto_en_ruta(piloto)     -> ¿está en ruta? (si no, no se pide el GPS)
     piloto_ubicacion(...)      -> guarda la última posición (tabla ubicaciones_pilotos)
   La app del piloto usa las mismas funciones con p_origen = 'app'.
   El mapa de Inicio dibuja el marcador de cada piloto (js/secciones/inicio.js).

   Límite de la web: el navegador solo manda la ubicación mientras la página
   está abierta. En el celular, con la pantalla apagada o la página en segundo
   plano, el navegador pausa el envío; al volver a la página se manda al momento.
   Para seguir en segundo plano hace falta la app.

   iniciarUbicacion() / detenerUbicacion() las llama aplicarPermisos() (js/permisos.js)
   al abrir, al iniciar y al cerrar sesión. enviarUbicacion() se puede llamar al
   cambiar de estado (ej. "Saliendo a ruta") para mandarla en el momento.
   Cada envío lanza el evento "acachete:ubicacion" con ubicacionEstado().
   ================================================== */

const UBICACION_CADA = 2 * 60 * 1000; // ms entre envíos
const UBICACION_GPS = { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 };

let ubicacionReloj = null;
let ubicacionEnCurso = false;
// Lo último que pasó: { punto: {lat, lng} | null, enviado_en: Date | null, en_ruta, error: texto | null }
let ubicacionUltima = { punto: null, enviado_en: null, en_ruta: false, error: null };

const ubicacionEstado = () => ({ ...ubicacionUltima });

function ubicacionAvisar(cambios) {
    ubicacionUltima = { ...ubicacionUltima, ...cambios };
    window.dispatchEvent(new CustomEvent('acachete:ubicacion', { detail: ubicacionEstado() }));
}

const ubicacionDelGps = () => new Promise((listo, falla) => navigator.geolocation.getCurrentPosition(listo, falla, UBICACION_GPS));

// Texto para el piloto cuando el GPS falla
function ubicacionTextoError(e) {
    if (e && e.code === 1) return 'El navegador no tiene permiso de ubicación: actívalo para que la tienda vea tu recorrido.';
    if (e && e.code === 2) return 'No se pudo obtener tu ubicación (revisa que el GPS esté encendido).';
    if (e && e.code === 3) return 'El GPS tardó mucho en responder; se intenta de nuevo en 2 minutos.';
    return 'No se pudo enviar tu ubicación; se intenta de nuevo en 2 minutos.';
}

async function enviarUbicacion() {
    const sesion = obtenerSesion();
    if (!sesion || sesion.rol !== 'piloto' || !sesion.id || ubicacionEnCurso) return;
    if (!navigator.geolocation) { ubicacionAvisar({ error: 'Este navegador no puede dar la ubicación.' }); return; }
    ubicacionEnCurso = true;
    try {
        const enRuta = await db.rpc('piloto_en_ruta', { p_piloto: sesion.id });
        if (enRuta.error) {
            console.warn('Ubicación: falta ejecutar sql/01 (bloque 25)?', enRuta.error);
            return;
        }
        if (!enRuta.data) {
            if (ubicacionUltima.en_ruta) {
                // Acaba de terminar la ruta: la base borra su marcador del mapa
                await db.rpc('piloto_ubicacion', { p_piloto: sesion.id, p_lat: 0, p_lng: 0 });
                ubicacionAvisar({ en_ruta: false, punto: null, error: null });
            }
            return;
        }
        const posicion = await ubicacionDelGps();
        const c = posicion.coords;
        const { data, error } = await db.rpc('piloto_ubicacion', {
            p_piloto: sesion.id, p_lat: c.latitude, p_lng: c.longitude,
            p_precision: c.accuracy != null ? c.accuracy : null,
            p_velocidad: c.speed != null ? c.speed * 3.6 : null, // m/s -> km/h
            p_rumbo: c.heading != null && !Number.isNaN(c.heading) ? c.heading : null,
            p_origen: 'web',
        });
        if (error) throw error;
        ubicacionAvisar({
            punto: { lat: c.latitude, lng: c.longitude }, enviado_en: new Date(),
            en_ruta: !!(data && data.en_ruta), error: null,
        });
    } catch (e) {
        console.warn('No se pudo enviar la ubicación:', e);
        ubicacionAvisar({ en_ruta: true, error: ubicacionTextoError(e) });
    } finally {
        ubicacionEnCurso = false;
    }
}

// Al volver a la página (el celular pausa los relojes en segundo plano): si ya
// pasaron 2 minutos desde el último envío, se manda en el momento
function ubicacionAlVolver() {
    if (document.visibilityState !== 'visible') return;
    const ultimo = ubicacionUltima.enviado_en;
    if (!ultimo || Date.now() - ultimo.getTime() >= UBICACION_CADA) enviarUbicacion();
}

function iniciarUbicacion() {
    const sesion = obtenerSesion();
    if (!sesion || sesion.rol !== 'piloto') { detenerUbicacion(); return; }
    if (ubicacionReloj) return; // ya está andando
    ubicacionReloj = setInterval(enviarUbicacion, UBICACION_CADA);
    document.addEventListener('visibilitychange', ubicacionAlVolver);
    enviarUbicacion();
}

function detenerUbicacion() {
    if (ubicacionReloj) clearInterval(ubicacionReloj);
    ubicacionReloj = null;
    document.removeEventListener('visibilitychange', ubicacionAlVolver);
    ubicacionUltima = { punto: null, enviado_en: null, en_ruta: false, error: null };
}
