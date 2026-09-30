/* ==================================================
   COMPONENTES JS REUTILIZABLES
   ACACHETE LOGISTICS

   Funciones que usan varias secciones para armar tablas y
   mostrar avisos. Van de la mano con css/componentes.css
   (las clases que crean aquí tienen su estilo allá).

   Lo usan: js/secciones/usuarios.js, tiendas.js, perfil.js
   (y las secciones nuevas que se creen).

   Todas usan textContent para los textos, así nunca se
   interpretan como HTML (evita problemas con datos raros).
   ================================================== */

// ---------- Aviso ("Usuario creado", errores) ----------
// Uso:
//   const aviso = crearAviso(zona.querySelector('#miAviso'));
//   aviso.mostrar('Guardado.');            -> verde, se oculta solo
//   aviso.mostrar('Algo falló.', 'error'); -> rojo, se queda visible
//   aviso.limpiar();                       -> en la limpieza de la sección
function crearAviso(elemento, duracion = 4000) {
    let temporizador = null;
    return {
        mostrar(texto, tipo = 'ok') {
            clearTimeout(temporizador);
            elemento.textContent = texto;
            elemento.className = `aviso visible ${tipo}`;
            if (tipo === 'ok') {
                temporizador = setTimeout(() => elemento.classList.remove('visible'), duracion);
            }
        },
        limpiar() {
            clearTimeout(temporizador);
        },
    };
}

// ---------- Celda de tabla con texto ----------
// Si el texto está vacío muestra "—".
function crearCelda(texto, clase) {
    const td = document.createElement('td');
    td.textContent = (texto === 0 || texto) ? texto : '—';
    if (clase) td.className = clase;
    return td;
}

// ---------- Celda con etiqueta de color ----------
// color: 'etiqueta-naranja' | 'etiqueta-azul' | 'etiqueta-verde' | 'etiqueta-gris'
function crearCeldaEtiqueta(texto, color) {
    const td = document.createElement('td');
    const etiqueta = document.createElement('span');
    etiqueta.className = `etiqueta ${color}`;
    etiqueta.textContent = texto;
    td.appendChild(etiqueta);
    return td;
}

// ---------- Botón de solo icono (editar / eliminar) ----------
// accion: 'editar' | 'eliminar' (define el color y el data-accion)
// Si deshabilitado = true, "etiqueta" explica por qué (aparece al pasar el mouse).
function crearBotonIcono(accion, id, icono, etiqueta, deshabilitado = false) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = `boton-icono boton-icono-${accion}`;
    boton.dataset.accion = accion;
    boton.dataset.id = id;
    boton.title = etiqueta;
    boton.setAttribute('aria-label', etiqueta);
    boton.innerHTML = `<i class="bi ${icono}"></i>`;
    boton.disabled = deshabilitado;
    return boton;
}

// ---------- Celda de acciones (botones alineados a la derecha) ----------
function crearCeldaAcciones(...botones) {
    const td = document.createElement('td');
    td.className = 'tabla-col-acciones';
    const contenedor = document.createElement('div');
    contenedor.className = 'tabla-botones';
    botones.forEach((b) => contenedor.appendChild(b));
    td.appendChild(contenedor);
    return td;
}

// ---------- Fila de "no hay registros" ----------
// columnas = cuántas columnas tiene la tabla (para ocupar todo el ancho)
function crearFilaVacia(texto, columnas) {
    const tr = document.createElement('tr');
    const td = crearCelda(texto, 'tabla-vacio');
    td.colSpan = columnas;
    tr.appendChild(td);
    return tr;
}

// ---------- Fila de título de un grupo (tablas agrupadas) ----------
// Ej. crearFilaGrupo('Norte', 'NOR', '2 tiendas', 7)
//   -> "NORTE  NOR .................... 2 tiendas"
// codigo y cuenta son opcionales. Estilos: .tabla-grupo en css/componentes.css
function crearFilaGrupo(titulo, codigo, cuenta, columnas) {
    const tr = document.createElement('tr');
    tr.className = 'tabla-grupo';

    const th = document.createElement('th');
    th.colSpan = columnas;
    th.scope = 'rowgroup';
    th.textContent = titulo;

    if (codigo) {
        const spanCodigo = document.createElement('span');
        spanCodigo.className = 'tabla-grupo-codigo';
        spanCodigo.textContent = codigo;
        th.appendChild(spanCodigo);
    }
    if (cuenta) {
        const spanCuenta = document.createElement('span');
        spanCuenta.className = 'tabla-grupo-cuenta';
        spanCuenta.textContent = cuenta;
        th.appendChild(spanCuenta);
    }

    tr.appendChild(th);
    return tr;
}

// ---------- Pestañas (ej. una por actividad) ----------
// Uso:
//   const pestanas = crearPestanas(zona.querySelector('#miPestanas'),
//       [{ valor: 'tienda', texto: 'Entregas de tienda', icono: 'bi-shop' }, ...],
//       'tienda', (valor) => { ...se eligió otra pestaña... });
//   pestanas.valor();                          -> la elegida
//   pestanas.cuentas({ tienda: 5, encomiendas: 2 }); -> número en cada pestaña
// Estilos: .pestanas / .pestana en css/componentes.css
function crearPestanas(caja, opciones, actual, alCambiar) {
    let valor = null;
    caja.replaceChildren();
    caja.setAttribute('role', 'tablist');

    const botones = opciones.map((o) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pestana';
        b.setAttribute('role', 'tab');
        b.dataset.valor = o.valor;
        if (o.icono) {
            const i = document.createElement('i');
            i.className = `bi ${o.icono}`;
            b.appendChild(i);
        }
        const texto = document.createElement('span');
        texto.textContent = o.texto;
        const cuenta = document.createElement('span');
        cuenta.className = 'pestana-cuenta';
        cuenta.hidden = true;
        b.append(texto, cuenta);
        b.addEventListener('click', () => {
            if (b.dataset.valor === valor) return;
            marcar(b.dataset.valor);
            alCambiar(valor);
        });
        caja.appendChild(b);
        return b;
    });

    function marcar(v) {
        valor = v;
        botones.forEach((b) => {
            const elegida = b.dataset.valor === v;
            b.classList.toggle('activo', elegida);
            b.setAttribute('aria-selected', String(elegida));
        });
    }
    marcar(actual);

    return {
        valor: () => valor,
        cuentas(mapa) {
            botones.forEach((b) => {
                const n = b.querySelector('.pestana-cuenta');
                const c = mapa[b.dataset.valor];
                n.hidden = c == null;
                n.textContent = c == null ? '' : c;
            });
        },
    };
}

// ---------- Tarifas y cálculo del envío ----------
// Lo usan Pedidos (al registrar) y el Cotizador, para que den SIEMPRE el
// mismo precio. La calculadora de Configuración (python/tarifas.py) usa la
// misma fórmula: si se cambia aquí, cambiarla allá.

// Tarifa que aplica a una actividad en una tienda: tienda > región > general.
//   tarifas: filas de la tabla "tarifas"
//   tienda:  { id, codigo, region } | { region } (solo región) | null (general)
// Devuelve la tarifa + "alcance" (texto: "Tienda NOR-001", "Región NOR", "General") o null.
function buscarTarifa(tarifas, actividad, tienda) {
    const t = tienda || {};
    const deAct = tarifas.filter((x) => x.actividad === actividad);
    const deTienda = t.id != null && deAct.find((x) => x.tienda_id === t.id);
    if (deTienda) return { ...deTienda, alcance: `Tienda ${t.codigo || t.id}` };
    const deRegion = t.region && deAct.find((x) => x.region && x.region === t.region);
    if (deRegion) return { ...deRegion, alcance: `Región ${deRegion.region}` };
    const general = deAct.find((x) => !x.region && !x.tienda_id);
    return general ? { ...general, alcance: 'General' } : null;
}

// Cálculo del envío (PROPUESTA 31.5):
//   fijo + mínimo + max(0, peso - kg incluidos) × precio por kg
//                 + max(0, km - km incluidos) × precio por km
//   gratis si la compra llega a "envío gratis desde"
//   km: distancia por calle de A a B (mapa del pedido, js/mapa.js); 0 = sin distancia
//   El mínimo cubre hasta kg_incluidos kg y hasta km_incluidos km.
function calcularEnvioTarifa(t, peso, montoCompra = 0, km = 0) {
    const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
    const kgAdicional = r2(Math.max(0, peso - Number(t.kg_incluidos || 0)));
    const montoKg = r2(kgAdicional * Number(t.precio_kg || 0));
    const distancia = r2(Math.max(0, Number(km || 0)));
    const kmAdicional = r2(Math.max(0, distancia - Number(t.km_incluidos || 0)));
    const montoKm = r2(kmAdicional * Number(t.precio_km || 0));
    const bruto = r2(Number(t.cargo_fijo || 0) + Number(t.minimo || 0) + montoKg + montoKm);
    const gratis = t.envio_gratis_desde != null && montoCompra > 0 && montoCompra >= Number(t.envio_gratis_desde);
    return { kgAdicional, montoKg, km: distancia, kmAdicional, montoKm, bruto, gratis, envio: gratis ? 0 : bruto };
}

// Monto de un descuento sobre el envío (% o monto fijo, nunca más que el envío)
function montoDescuento(descuento, envio) {
    if (!descuento || envio <= 0) return 0;
    return descuento.tipo === 'porcentaje'
        ? Math.round(envio * Number(descuento.valor)) / 100
        : Math.min(Number(descuento.valor), envio);
}

// ---------- Búsqueda ----------
// true si alguno de los valores contiene el texto buscado (sin distinguir mayúsculas)
function coincideBusqueda(valores, filtro) {
    if (!filtro) return true;
    const buscado = filtro.toLowerCase();
    return valores.some((valor) => String(valor || '').toLowerCase().includes(buscado));
}

// ---------- Plural simple ----------
// plural(1, 'tienda', 'tiendas') -> "1 tienda" | plural(3, ...) -> "3 tiendas"
function plural(cantidad, singular, pluralTexto) {
    return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}

// ---------- Python en el navegador (Pyodide) ----------
// Corre los archivos de la carpeta python/ DENTRO del navegador: no hace
// falta instalar Python ni tener un servidor. Se descarga la primera vez
// que se usa (unos segundos) y queda guardado en la caché del navegador.
// Uso:
//   const py = await cargarPython('python/tarifas.py');
//   const resultado = py.globals.get('nombre_de_la_funcion')(...);
// Cada archivo se ejecuta una sola vez (sus funciones quedan disponibles).
const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
let promesaPyodide = null;
const archivosPython = new Map(); // ruta -> Promise

function cargarPython(ruta) {
    if (!promesaPyodide) {
        promesaPyodide = new Promise((resolve, reject) => {
            if (window.loadPyodide) { resolve(); return; }
            const script = document.createElement('script');
            script.src = `${PYODIDE_URL}pyodide.js`;
            script.onload = () => resolve();
            script.onerror = () => { script.remove(); reject(new Error('No se pudo descargar Python (Pyodide).')); };
            document.head.appendChild(script);
        })
            .then(() => window.loadPyodide({ indexURL: PYODIDE_URL }))
            .catch((error) => { promesaPyodide = null; throw error; });
    }
    if (!archivosPython.has(ruta)) {
        archivosPython.set(ruta, promesaPyodide.then(async (py) => {
            const respuesta = await fetch(ruta, { cache: 'no-cache' });
            if (!respuesta.ok) throw new Error(`No se encontró ${ruta}.`);
            py.runPython(await respuesta.text());
            return py;
        }).catch((error) => { archivosPython.delete(ruta); throw error; }));
    }
    return archivosPython.get(ruta);
}
