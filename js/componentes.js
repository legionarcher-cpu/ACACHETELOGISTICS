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
