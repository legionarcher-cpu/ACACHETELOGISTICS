/* ==================================================
   CARGA DEL PEDIDO CON EVIDENCIA (piloto)
   ACACHETE LOGISTICS

   Lo usan Inicio ("Mi ruta") y Pedidos (detalle, botón "Cargar").
   Solo pedidos que la tienda marcó "Listo para despachar" (la base lo revisa).
   El piloto:
     - toma una o más FOTOS de lo que recibe (bultos, cajas...),
     - escribe cuántos BULTOS recibió,
     - y, si lleva efectivo para ese pedido (ej. el vuelto), CUÁNTO.
   Las fotos se achican y se suben al Storage "evidencias" (carga/<pedido>/...);
   luego pedido_cargar (sql/01 bloque 29) guarda todo y deja el pedido "Cargado".
   Si la base rechaza la carga, las fotos subidas se borran.

     abrirCargaPedido({ pedido, sesion }) -> promesa: resultado de la base o null
   La salida a ruta (todo el slot) está en Inicio: piloto_salir_ruta.
   ================================================== */

const CARGA_BUCKET = 'evidencias';
const CARGA_FOTO_LADO = 1600;   // px del lado más largo (las fotos del celular pesan mucho)
const CARGA_FOTO_CALIDAD = 0.8; // JPEG
const CARGA_MAX_FOTOS = 6;

const cargaDinero = (n) => `₡${Number(n || 0).toLocaleString('es-CR', { maximumFractionDigits: 2 })}`;

// Achica la foto a JPEG (la orientación ya la corrige el navegador al dibujarla)
function cargaAchicarFoto(archivo) {
    return new Promise((resolver, rechazar) => {
        const url = URL.createObjectURL(archivo);
        const img = new Image();
        img.onload = () => {
            const escala = Math.min(1, CARGA_FOTO_LADO / Math.max(img.width, img.height));
            const lienzo = document.createElement('canvas');
            lienzo.width = Math.round(img.width * escala);
            lienzo.height = Math.round(img.height * escala);
            lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
            URL.revokeObjectURL(url);
            lienzo.toBlob((blob) => (blob ? resolver(blob) : rechazar(new Error('No se pudo leer la foto.'))), 'image/jpeg', CARGA_FOTO_CALIDAD);
        };
        img.onerror = () => { URL.revokeObjectURL(url); rechazar(new Error('Ese archivo no es una foto.')); };
        img.src = url;
    });
}

// Bultos que tiene registrados el pedido (artículos o productos): referencia para el piloto
async function cargaBultosEsperados(pedidoId) {
    const [art, prod] = await Promise.all([
        db.from('pedido_articulos').select('cantidad').eq('pedido_id', pedidoId),
        db.from('pedido_productos').select('cantidad').eq('pedido_id', pedidoId),
    ]);
    const suma = (r) => (r.error ? 0 : r.data.reduce((s, x) => s + Number(x.cantidad || 0), 0));
    return suma(art) + suma(prod);
}

function abrirCargaPedido({ pedido, sesion }) {
    return new Promise((resolver) => {
        const fotos = []; // [{ blob, url }]
        let resultado = null;

        const dlg = document.createElement('dialog');
        dlg.className = 'dialogo carga-dialogo';
        dlg.setAttribute('aria-label', `Cargar el pedido ${pedido.codigo}`);
        dlg.innerHTML = `
            <form class="dialogo-form" novalidate>
                <h3 class="dialogo-titulo"><i class="bi bi-box-arrow-in-down"></i> <span data-c="titulo"></span></h3>
                <p class="dialogo-texto" data-c="texto"></p>
                <div class="campo">
                    <span class="campo-etiqueta">Fotos de lo que recibes *</span>
                    <div class="carga-fotos" data-c="fotos"></div>
                    <label class="boton boton-secundario boton-chico carga-tomar">
                        <i class="bi bi-camera"></i> <span>Tomar foto</span>
                        <input type="file" accept="image/*" capture="environment" multiple hidden data-c="archivo">
                    </label>
                    <small class="campo-ayuda">Que se vean los bultos, cajas o bolsas que te entregan.</small>
                </div>
                <div class="campos">
                    <div class="campo">
                        <label class="campo-etiqueta" for="cargaBultos${pedido.id}">Bultos recibidos *</label>
                        <input id="cargaBultos${pedido.id}" type="number" min="1" step="1" inputmode="numeric" class="campo-input" data-c="bultos">
                        <small class="campo-ayuda" data-c="esperados"></small>
                    </div>
                    <div class="campo">
                        <label class="campo-etiqueta" for="cargaEfectivo${pedido.id}">Efectivo que llevas (₡)</label>
                        <input id="cargaEfectivo${pedido.id}" type="number" min="0" step="0.01" inputmode="decimal" class="campo-input" data-c="efectivo" placeholder="0 = no lleva">
                        <small class="campo-ayuda" data-c="efectivoAyuda">Solo si la tienda te entrega efectivo para este pedido (ej. el vuelto).</small>
                    </div>
                    <div class="campo campo-ancho">
                        <label class="campo-etiqueta" for="cargaNota${pedido.id}">Nota</label>
                        <input id="cargaNota${pedido.id}" type="text" maxlength="300" class="campo-input" data-c="nota" autocomplete="off" placeholder="Ej. una caja golpeada">
                    </div>
                </div>
                <p class="form-error" role="alert" data-c="error"></p>
                <div class="dialogo-botones">
                    <button type="button" class="boton boton-secundario" data-c="volver">Volver</button>
                    <button type="submit" class="boton boton-principal" data-c="guardar">Confirmar carga</button>
                </div>
            </form>`;
        const $ = (c) => dlg.querySelector(`[data-c="${c}"]`);
        $('titulo').textContent = `Cargar ${pedido.codigo}`;
        $('texto').textContent = [pedido.cliente_nombre, pedido.direccion_entrega, pedido.slot_numero ? `Slot ${pedido.slot_numero}` : null]
            .filter(Boolean).join(' · ');
        // Si el cliente paga en efectivo con un monto mayor, el piloto lleva el vuelto
        if (Number(pedido.vuelto) > 0) {
            $('efectivoAyuda').textContent = `Vuelto previsto para el cliente: ${cargaDinero(pedido.vuelto)}. Escribe el efectivo que te entregan.`;
        }
        cargaBultosEsperados(pedido.id).then((n) => {
            if (n > 0) {
                $('esperados').textContent = `El pedido tiene ${n === 1 ? '1 bulto registrado' : `${n} bultos registrados`}.`;
                if (!$('bultos').value) $('bultos').value = String(Math.round(n));
            }
        });

        function dibujarFotos() {
            const caja = $('fotos');
            caja.replaceChildren();
            fotos.forEach((f, i) => {
                const fig = document.createElement('figure');
                fig.className = 'carga-foto';
                const img = document.createElement('img');
                img.src = f.url;
                img.alt = `Foto ${i + 1}`;
                const quitar = document.createElement('button');
                quitar.type = 'button';
                quitar.className = 'carga-quitar';
                quitar.setAttribute('aria-label', `Quitar la foto ${i + 1}`);
                quitar.innerHTML = '<i class="bi bi-x-lg"></i>';
                quitar.addEventListener('click', () => { URL.revokeObjectURL(f.url); fotos.splice(i, 1); dibujarFotos(); });
                fig.append(img, quitar);
                caja.appendChild(fig);
            });
            if (!fotos.length) {
                const vacio = document.createElement('span');
                vacio.className = 'carga-sin-fotos';
                vacio.textContent = 'Todavía no hay fotos.';
                caja.appendChild(vacio);
            }
        }
        dibujarFotos();

        $('archivo').addEventListener('change', async (e) => {
            $('error').textContent = '';
            for (const archivo of [...e.target.files]) {
                if (fotos.length >= CARGA_MAX_FOTOS) { $('error').textContent = `Máximo ${CARGA_MAX_FOTOS} fotos.`; break; }
                try {
                    const blob = await cargaAchicarFoto(archivo);
                    fotos.push({ blob, url: URL.createObjectURL(blob) });
                } catch (err) {
                    $('error').textContent = err.message;
                }
            }
            e.target.value = '';
            dibujarFotos();
        });

        const cerrar = () => dlg.close();
        dlg.addEventListener('close', () => {
            fotos.forEach((f) => URL.revokeObjectURL(f.url));
            dlg.remove();
            resolver(resultado);
        });
        $('volver').addEventListener('click', cerrar);

        dlg.querySelector('form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const error = $('error');
            error.textContent = '';
            const bultos = Number($('bultos').value);
            const efectivo = $('efectivo').value === '' ? null : Number($('efectivo').value);
            if (!fotos.length) { error.textContent = 'Toma al menos una foto de lo que recibes.'; return; }
            if (!Number.isInteger(bultos) || bultos < 1) { error.textContent = 'Escribe cuántos bultos recibiste (1 o más).'; $('bultos').focus(); return; }
            if (efectivo != null && (!Number.isFinite(efectivo) || efectivo < 0)) { error.textContent = 'El efectivo no puede ser negativo.'; $('efectivo').focus(); return; }

            const boton = $('guardar');
            boton.disabled = true;
            boton.textContent = 'Subiendo fotos...';
            const subidas = [];
            try {
                for (let i = 0; i < fotos.length; i++) {
                    const ruta = `carga/${pedido.id}/${Date.now()}-${i + 1}.jpg`;
                    const { error: errSubida } = await db.storage.from(CARGA_BUCKET)
                        .upload(ruta, fotos[i].blob, { contentType: 'image/jpeg', cacheControl: '3600' });
                    if (errSubida) throw errSubida;
                    subidas.push({ ruta, url: db.storage.from(CARGA_BUCKET).getPublicUrl(ruta).data.publicUrl });
                }
            } catch (err) {
                console.error('Error al subir la foto de carga:', err);
                if (subidas.length) await db.storage.from(CARGA_BUCKET).remove(subidas.map((s) => s.ruta));
                error.textContent = 'No se pudo subir la foto. Revisa la conexión e intenta de nuevo.';
                boton.disabled = false;
                boton.textContent = 'Confirmar carga';
                return;
            }

            boton.textContent = 'Guardando...';
            const { data, error: errBase } = await db.rpc('pedido_cargar', {
                p: { usuario_id: sesion.id || null, pedido_id: pedido.id, bultos, efectivo, nota: $('nota').value.trim() || null, fotos: subidas },
            });
            boton.disabled = false;
            boton.textContent = 'Confirmar carga';
            if (errBase) {
                console.error('Error al cargar el pedido:', errBase);
                await db.storage.from(CARGA_BUCKET).remove(subidas.map((s) => s.ruta));
                error.textContent = errBase.code === 'P0001' ? errBase.message
                    : ['PGRST202', '42883'].includes(errBase.code) ? 'Falta ejecutar sql/01 (bloque 29: carga con evidencia).'
                        : 'No se pudo guardar la carga. Intenta de nuevo.';
                return;
            }
            resultado = data;
            cerrar();
        });

        document.body.appendChild(dlg);
        dlg.showModal();
    });
}
