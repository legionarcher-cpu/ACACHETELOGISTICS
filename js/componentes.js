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
// Texto en minúsculas y sin tildes: "Pérez" -> "perez" (así se busca sin importar cómo se escribió)
function textoParaBuscar(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Palabras de una búsqueda, listas para comparar con textoParaBuscar o con la columna
// "busqueda" de clientes: sin tildes y los teléfonos solo con dígitos ("8888-1234" -> "88881234")
function palabrasDeBusqueda(texto) {
    return textoParaBuscar(texto)
        .split(/\s+/)
        .map((p) => (/^[\d+\-().]+$/.test(p) ? p.replace(/\D/g, '') : p))
        .filter(Boolean);
}

// true si alguno de los valores contiene el texto buscado (sin distinguir mayúsculas ni tildes)
function coincideBusqueda(valores, filtro) {
    if (!filtro) return true;
    const buscado = textoParaBuscar(filtro);
    return valores.some((valor) => textoParaBuscar(valor).includes(buscado));
}

// ---------- Plural simple ----------
// plural(1, 'tienda', 'tiendas') -> "1 tienda" | plural(3, ...) -> "3 tiendas"
function plural(cantidad, singular, pluralTexto) {
    return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}

// ---------- Usuario con el ID de la empresa (sql/01 bloques 16 y 17) ----------
// Todos los usuarios llevan al final el ID de su empresa ("01"), sin guiones:
//   G3, Empleado y Piloto:   región + nombre + empresa -> "cen" + "jperez" + "01" = "cenjperez01"
//   Administrador, G1 y G2:  nombre + empresa          -> "jperez" + "01"        = "jperez01"
// No lleva el número de la tienda: si cambia de sucursal en la misma región (o es
// multisucursal) su usuario no cambia. "admin" y "desar" no cambian.
// Lo usan Usuarios y Tiendas. usuarioSinPrefijo acepta todos los formatos.
function codigoEmpresa(empresa = null) {
    const e = empresa || (typeof empresaActual === 'function' ? empresaActual() : null);
    return e && e.codigo ? String(e.codigo) : '';
}

// Región de la tienda en minúsculas: "CEN-001" -> "cen"
function prefijoUsuario(codigoTienda) {
    return String(codigoTienda || '').slice(0, 3).toLowerCase();
}

// ("jperez", "CEN-001", "01") -> "cenjperez01" · ("jperez", null, "01") -> "jperez01"
function usuarioCompuesto(base, codigoTienda = null, codigo = codigoEmpresa()) {
    return prefijoUsuario(codigoTienda) + String(base || '') + (codigo || '');
}

// "cenjperez01", "cen001jperez01", "cen-001-jperez", "jperez01" -> "jperez"
function usuarioSinPrefijo(idUsuario, codigoTienda = null, codigo = codigoEmpresa()) {
    let id = String(idUsuario || '');
    if (['admin', 'desar'].includes(id)) return id;
    if (codigoTienda) {
        const conGuion = `${String(codigoTienda).toLowerCase()}-`;                     // cen-001-
        const tienda = String(codigoTienda).toLowerCase().replace(/[^a-z0-9]/g, ''); // cen001
        const region = prefijoUsuario(codigoTienda);                                  // cen
        const forma = [conGuion, tienda, region].find((f) => f && id.startsWith(f) && id.length > f.length);
        if (forma) id = id.slice(forma.length);
    }
    if (codigo && id.endsWith(codigo) && id.length > codigo.length) id = id.slice(0, -codigo.length);
    return id;
}

// ---------- Librerías externas (se descargan una sola vez, al usarlas) ----------
// Gráficas (Chart.js), Excel (SheetJS) y PDF (jsPDF + AutoTable). Lo usan Inicio y Reportes.
const LIBRERIAS = {
    chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
    xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    autotable: 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
};
const libreriasCargadas = new Map(); // url -> Promise

function cargarLibreria(url) {
    if (!libreriasCargadas.has(url)) {
        libreriasCargadas.set(url, new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.onload = () => resolve();
            s.onerror = () => { libreriasCargadas.delete(url); s.remove(); reject(new Error(`No se pudo descargar ${url}`)); };
            document.head.appendChild(s);
        }));
    }
    return libreriasCargadas.get(url);
}

// ---------- Datos para exportar (Excel y PDF) ----------
// Lo que dicen los archivos debe ser lo de la empresa con la que se trabaja, no "ACACHETE":
//   nombreEmpresaExportar() -> "Transportes del Valle" (empresa interna) o el de la marca
//   colorDeVariable('--color-azul-marino', [7, 48, 92]) -> [r, g, b] de la paleta activa
//   textoExportar(texto) -> con las palabras de la empresa (Pedido -> Viaje, js/palabras.js)
function nombreEmpresaExportar() {
    const interna = typeof empresaActual === 'function' ? empresaActual() : null;
    if (interna && interna.nombre) return interna.nombre;
    return (typeof EMPRESA !== 'undefined' && (EMPRESA.titulo || EMPRESA.nombre)) || 'ACACHETE Logistics';
}

function colorDeVariable(variable, respaldo) {
    const valor = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    const hex = valor.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
        const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
        return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    }
    const rgb = valor.match(/rgba?\((\d+)\D+(\d+)\D+(\d+)/i);
    return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : respaldo;
}

function textoExportar(texto) {
    if (typeof texto !== 'string') return texto;
    return typeof cambiarPalabras === 'function' ? cambiarPalabras(texto) : texto;
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
