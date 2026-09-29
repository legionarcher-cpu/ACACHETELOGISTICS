/* ==================================================
   FOTOS DE USUARIO (avatar) - funciones compartidas
   ACACHETE LOGISTICS

   Qué hace: validar, achicar, subir, quitar y mostrar la foto
   de un usuario. Las fotos viven en Supabase Storage, bucket
   "avatares" (ver sql/04_fotos_usuarios.sql); la tabla usuarios
   guarda solo el enlace en la columna foto_url.

   Lo usan:
     - js/permisos.js           -> foto del encabezado (usuario conectado)
     - js/secciones/perfil.js   -> cada usuario cambia/quita su foto
     - js/secciones/usuarios.js -> el administrador cambia/quita cualquier foto

   Es compartido porque 3 archivos lo necesitan; así un cambio
   (ej. el tamaño de la foto) se hace en un solo lugar.

   Necesita: js/supabase.js (objeto "db") cargado antes.
   ================================================== */

const AVATAR_BUCKET = 'avatares';
const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB (el bucket tiene el mismo límite)
const AVATAR_TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
const AVATAR_TAMANO = 256; // la foto se achica a 256x256 px antes de subirla

// Ruta del archivo dentro del bucket: usuarios/<id>.jpg
// (siempre el mismo nombre por usuario: una foto nueva reemplaza la anterior)
function rutaFoto(usuarioId) {
    return `usuarios/${usuarioId}.jpg`;
}

// ---------- Validar ----------
// Devuelve un mensaje de error, o null si el archivo sirve.
function validarFoto(archivo) {
    if (!archivo) return 'No se eligió ningún archivo.';
    if (!AVATAR_TIPOS.includes(archivo.type)) return 'La foto debe ser JPG, PNG o WEBP.';
    if (archivo.size > AVATAR_MAX_BYTES) return 'La foto no puede pesar más de 2 MB.';
    return null;
}

// ---------- Achicar ----------
// Recorta la foto en cuadrado (centrada) y la achica a AVATAR_TAMANO.
// Resultado: JPG de unos 20-40 KB. Así carga rápido y ocupa poco espacio.
async function reducirFoto(archivo) {
    let imagen;
    try {
        imagen = await createImageBitmap(archivo);
    } catch {
        throw new Error('El archivo no es una imagen válida.');
    }

    const lado = Math.min(imagen.width, imagen.height);     // recorte cuadrado
    const x = (imagen.width - lado) / 2;
    const y = (imagen.height - lado) / 2;
    const destino = Math.min(AVATAR_TAMANO, lado);           // no se agranda si es más chica

    const lienzo = document.createElement('canvas');
    lienzo.width = destino;
    lienzo.height = destino;
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; // fondo blanco (las PNG transparentes no quedan negras)
    ctx.fillRect(0, 0, destino, destino);
    ctx.drawImage(imagen, x, y, lado, lado, 0, 0, destino, destino);
    if (imagen.close) imagen.close();

    return new Promise((resolve, reject) => {
        lienzo.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen.'))),
            'image/jpeg',
            0.85 // calidad (0 a 1)
        );
    });
}

// ---------- Subir ----------
// Valida, achica, sube la foto y guarda el enlace en usuarios.foto_url.
// Devuelve el enlace nuevo. Lanza un Error con mensaje si algo falla.
async function subirFotoUsuario(usuarioId, archivo) {
    const problema = validarFoto(archivo);
    if (problema) throw new Error(problema);

    const foto = await reducirFoto(archivo);
    const ruta = rutaFoto(usuarioId);

    const { error: errorSubida } = await db.storage
        .from(AVATAR_BUCKET)
        .upload(ruta, foto, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
    if (errorSubida) {
        console.error('Error al subir la foto:', errorSubida);
        throw new Error('No se pudo subir la foto. Intenta de nuevo.');
    }

    // "?v=..." obliga al navegador a mostrar la foto nueva y no la guardada en caché
    const { data } = db.storage.from(AVATAR_BUCKET).getPublicUrl(ruta);
    const url = `${data.publicUrl}?v=${Date.now()}`;

    const { error } = await db.from('usuarios').update({ foto_url: url }).eq('id', usuarioId);
    if (error) {
        console.error('Error al guardar el enlace de la foto:', error);
        throw new Error('La foto se subió, pero no se pudo guardar en el usuario.');
    }

    actualizarFotoEnSesion(usuarioId, url);
    return url;
}

// ---------- Quitar ----------
// Borra el archivo y deja foto_url vacío.
async function quitarFotoUsuario(usuarioId) {
    await borrarArchivoFoto(usuarioId);

    const { error } = await db.from('usuarios').update({ foto_url: null }).eq('id', usuarioId);
    if (error) {
        console.error('Error al quitar la foto:', error);
        throw new Error('No se pudo quitar la foto. Intenta de nuevo.');
    }

    actualizarFotoEnSesion(usuarioId, null);
}

// Borra solo el archivo del bucket (se usa también al eliminar un usuario).
// Si no existe, no pasa nada.
async function borrarArchivoFoto(usuarioId) {
    const { error } = await db.storage.from(AVATAR_BUCKET).remove([rutaFoto(usuarioId)]);
    if (error) console.error('Error al borrar el archivo de la foto:', error);
}

// Si la foto cambiada es la del usuario conectado, se actualiza la sesión
// y la foto del encabezado (sin volver a iniciar sesión).
function actualizarFotoEnSesion(usuarioId, url) {
    const sesion = obtenerSesion();
    if (!sesion || sesion.id !== usuarioId) return;
    guardarSesion({ ...sesion, foto_url: url });
    aplicarPermisos(); // js/permisos.js vuelve a pintar el encabezado
}

// ---------- Mostrar ----------

// "Juan Pérez" -> "JP" | "Operador" -> "OP"
function inicialesDe(nombre) {
    const palabras = (nombre || '').trim().split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return '?';
    if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
    return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

// Pinta un avatar en cualquier elemento: la foto si tiene, o sus iniciales.
// Solo se aceptan enlaces de nuestro bucket (por seguridad).
// El tamaño y la forma los define el CSS de cada lugar.
function pintarAvatar(elemento, nombre, fotoUrl) {
    const prefijoValido = `${SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/`;
    const tieneFoto = typeof fotoUrl === 'string' && fotoUrl.startsWith(prefijoValido);

    elemento.classList.toggle('avatar-con-foto', tieneFoto);
    elemento.style.backgroundImage = tieneFoto ? `url("${fotoUrl}")` : '';
    elemento.textContent = tieneFoto ? '' : inicialesDe(nombre);
}
