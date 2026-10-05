/* ==================================================
   CONFIGURACIÓN -> MÓDULO SLOTS
   ACACHETE LOGISTICS

   Lo carga js/secciones/configuracion.js la primera vez que se abre la
   tarjeta "Slots" (#configuracion?modulo=slots).

   SLOT = rango de horario de DESPACHO de un pedido (ej. 10:00 a 12:00). El
   empleado lo elige al registrar el pedido y lo confirma al marcarlo "Listo
   para despachar". Es distinto de la MARCA (horario del piloto), que solo ven
   el piloto y Admin G2 en adelante.

   Igual que las marcas (sql/00 sección 5; sql/01 bloque 12):
     - cantidad_slots (tabla "configuracion"): cuántos slots hay en el día.
       Al SUBIRLA se crean los nuevos después del último (misma duración);
       al BAJARLA se eliminan los últimos (pide confirmación).
     - Horas de cada slot (tabla "slots_horario"): desde / hasta.
     - Slots por día (tablas "slot_dias" y "slots_dia"): un día de la semana
       puede tener su propia cantidad y horas (0 = no se despacha). Los días
       sin slots propios usan la base. "Usar base" borra lo propio del día.
     - Los pedidos piden los slots de su fecha con slots_del_dia(fecha).

   Permisos: Administrador y Admin G1 cambian; Admin G2 solo ve.
   ================================================== */

// Duración de un slot nuevo si no hay uno anterior del que copiarla
const CFG_SLOT_DURACION_MIN = 120;

registrarModuloConfig('slots', (seccion, ctx) => {
    const { aviso, pedirConfirmacion, esGeneral } = ctx;
    const $ = (selector) => seccion.querySelector(selector);
    const puedeModificar = esGeneral;

    // ---------- Elementos ----------
    const inputCantidad = $('#cfgSlotCantidad');
    const errorBase = $('#cfgSlotBaseError');
    const cuerpoSlots = $('#cfgSlots');
    const cuerpoDias = $('#cfgSlotDias');
    const faltaSql = $('#cfgSlotFaltaSql');

    const slotDialogo = $('#cfgSlotDialogo');
    const slotError = $('#cfgSlotError');
    const slotInicio = $('#cfgSlotInicio');
    const slotFin = $('#cfgSlotFin');

    const diaDialogo = $('#cfgSlotDiaDialogo');
    const diaError = $('#cfgSlotDiaError');
    const diaCantidad = $('#cfgSlotDiaCantidad');
    const diaFilas = $('#cfgSlotDiaFilas');
    const diaVacio = $('#cfgSlotDiaVacio');
    const diaOtros = $('#cfgSlotDiaOtros');

    // ---------- Estado ----------
    let cantidad = 4;
    let slots = [];      // base: [{ numero, inicio, fin }]
    let dias = [];       // días con slots propios: [{ dia, cantidad_slots, slots_dia: [...] }]
    let editandoSlot = null;
    let editandoDia = null;

    // ---------- Horas ----------
    const hhmm = (hora) => (hora || '').slice(0, 5);
    const aMinutos = (hora) => { const [h, m] = hhmm(hora).split(':').map(Number); return h * 60 + m; };
    const aHora = (minutos) => {
        const total = Math.min(minutos, 23 * 60 + 59);
        return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    };
    const textoDuracion = (minutos) => {
        const h = Math.floor(minutos / 60);
        const m = minutos % 60;
        return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 min';
    };

    // Revisa una lista de { inicio, fin }: completas, fin > inicio y sin encimarse. Devuelve el error o ''.
    function revisarHoras(lista) {
        for (let i = 0; i < lista.length; i++) {
            const { inicio, fin } = lista[i];
            const n = i + 1;
            if (!inicio || !fin) return `Completa las dos horas del slot ${n}.`;
            if (aMinutos(fin) <= aMinutos(inicio)) return `Slot ${n}: "Hasta" debe ser después de "Desde".`;
            if (i > 0 && aMinutos(inicio) < aMinutos(lista[i - 1].fin)) return `El slot ${n} empieza antes de que termine el slot ${n - 1}.`;
        }
        return '';
    }

    // ==================================================
    // CARGAR
    // ==================================================

    async function cargarTodo() {
        const [conf, base, dia] = await Promise.all([
            db.from('configuracion').select('valor').eq('clave', 'cantidad_slots').maybeSingle(),
            db.from('slots_horario').select('numero, inicio, fin').order('numero'),
            db.from('slot_dias').select('dia, cantidad_slots, slots_dia(numero, inicio, fin)').order('dia'),
        ]);
        const error = base.error || dia.error;
        faltaSql.hidden = !error;
        if (error) {
            console.error('Error al cargar los slots:', error);
            cuerpoSlots.replaceChildren(crearFilaVacia('Sin datos.', puedeModificar ? 5 : 4));
            cuerpoDias.replaceChildren();
            return;
        }
        slots = base.data;
        dias = dia.data;
        dias.forEach((d) => d.slots_dia.sort((a, b) => a.numero - b.numero));
        cantidad = conf.data ? Number(conf.data.valor) || slots.length : slots.length;
        inputCantidad.value = cantidad;
        inputCantidad.disabled = !puedeModificar;
        dibujarSlots();
        dibujarDias();
    }

    // ==================================================
    // 1. CANTIDAD DE SLOTS
    // ==================================================

    // Crea los slots que faltan hasta "hasta", después del último y con su misma duración
    async function crearFaltantes(hasta) {
        const nuevos = [];
        let ultimo = slots[slots.length - 1];
        for (let numero = slots.length + 1; numero <= hasta; numero++) {
            const duracion = ultimo ? aMinutos(ultimo.fin) - aMinutos(ultimo.inicio) : CFG_SLOT_DURACION_MIN;
            const inicio = ultimo ? aMinutos(ultimo.fin) : 8 * 60;
            if (inicio + duracion > 23 * 60 + 59) {
                return { error: { mensajePropio: `No caben ${hasta} slots antes de medianoche. Acorta los slots o baja la cantidad.` } };
            }
            ultimo = { numero, inicio: aHora(inicio), fin: aHora(inicio + duracion) };
            nuevos.push(ultimo);
        }
        return nuevos.length ? db.from('slots_horario').insert(nuevos) : { error: null };
    }

    async function guardarCantidad(nueva) {
        let resultado = { error: null };
        if (nueva > slots.length) resultado = await crearFaltantes(nueva);
        else if (nueva < slots.length) resultado = await db.from('slots_horario').delete().gt('numero', nueva);
        if (!resultado.error) {
            resultado = await db.from('configuracion')
                .upsert({ clave: 'cantidad_slots', valor: nueva, actualizado_en: new Date().toISOString() });
        }
        if (resultado.error) {
            console.error('Error al guardar la cantidad de slots:', resultado.error);
            errorBase.textContent = resultado.error.mensajePropio || 'No se pudo guardar. Intenta de nuevo.';
            return;
        }
        aviso.mostrar(`Ahora hay ${plural(nueva, 'slot', 'slots')} en el día.`);
        cargarTodo();
    }

    $('#cfgSlotBaseForm').addEventListener('submit', (evento) => {
        evento.preventDefault();
        if (!puedeModificar) return;
        errorBase.textContent = '';
        const nueva = Number(inputCantidad.value);
        if (!Number.isInteger(nueva) || nueva < 1 || nueva > 24) {
            errorBase.textContent = 'La cantidad de slots debe ser un número entero de 1 a 24.';
            return;
        }
        if (nueva < slots.length) {
            const quitar = slots.filter((s) => s.numero > nueva).map((s) => s.numero).join(', ');
            pedirConfirmacion(`Al bajar a ${nueva} slots se eliminarán los slots ${quitar} y sus horas. ¿Continuar?`,
                () => guardarCantidad(nueva));
            return;
        }
        guardarCantidad(nueva);
    });

    // ==================================================
    // 2. HORAS DE CADA SLOT (base)
    // ==================================================

    function dibujarSlots() {
        cuerpoSlots.replaceChildren();
        if (!slots.length) {
            cuerpoSlots.appendChild(crearFilaVacia('No hay slots. Indica la cantidad en "Valores base".', puedeModificar ? 5 : 4));
            return;
        }
        slots.forEach((s) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(`Slot ${s.numero}`));
            tr.appendChild(crearCelda(hhmm(s.inicio), 'texto-codigo'));
            tr.appendChild(crearCelda(hhmm(s.fin), 'texto-codigo'));
            tr.appendChild(crearCelda(textoDuracion(aMinutos(s.fin) - aMinutos(s.inicio))));
            if (puedeModificar) tr.appendChild(crearCeldaAcciones(crearBotonIcono('editar', s.numero, 'bi-pencil', `Cambiar las horas del slot ${s.numero}`)));
            cuerpoSlots.appendChild(tr);
        });
    }

    cuerpoSlots.addEventListener('click', (evento) => {
        const boton = evento.target.closest('button[data-accion="editar"]');
        if (!boton || !puedeModificar) return;
        editandoSlot = slots.find((s) => s.numero === Number(boton.dataset.id));
        if (!editandoSlot) return;
        $('#cfgSlotTitulo').textContent = `Slot ${editandoSlot.numero}`;
        slotInicio.value = hhmm(editandoSlot.inicio);
        slotFin.value = hhmm(editandoSlot.fin);
        slotError.textContent = '';
        slotDialogo.showModal();
        slotInicio.focus();
    });

    $('#cfgSlotForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!puedeModificar || !editandoSlot) return;
        const nueva = slots.map((s) => (s.numero === editandoSlot.numero ? { ...s, inicio: slotInicio.value, fin: slotFin.value } : s));
        const problema = revisarHoras(nueva);
        if (problema) { slotError.textContent = problema; return; }
        const { error } = await db.from('slots_horario')
            .update({ inicio: slotInicio.value, fin: slotFin.value, actualizado_en: new Date().toISOString() })
            .eq('numero', editandoSlot.numero);
        if (error) {
            console.error('Error al guardar el slot:', error);
            slotError.textContent = 'No se pudo guardar. Intenta de nuevo.';
            return;
        }
        slotDialogo.close();
        aviso.mostrar(`Slot ${editandoSlot.numero}: ${slotInicio.value} a ${slotFin.value}.`);
        cargarTodo();
    });

    // ==================================================
    // 3. SLOTS POR DÍA DE LA SEMANA
    // ==================================================

    const diaPropio = (numero) => dias.find((d) => d.dia === numero) || null;
    const slotsDelDia = (numero) => { const d = diaPropio(numero); return d ? d.slots_dia : slots; };

    function dibujarDias() {
        cuerpoDias.replaceChildren();
        Object.entries(CFG_DIAS).forEach(([numeroTexto, nombre]) => { // CFG_DIAS: js/secciones/configuracion.js
            const numero = Number(numeroTexto);
            const propio = diaPropio(numero);
            const lista = slotsDelDia(numero);
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(nombre));
            if (!propio) tr.appendChild(crearCeldaEtiqueta('Base', 'etiqueta-gris'));
            else if (propio.cantidad_slots === 0) tr.appendChild(crearCeldaEtiqueta('Sin slots', 'etiqueta-rosada'));
            else tr.appendChild(crearCeldaEtiqueta('Personalizado', 'etiqueta-naranja'));
            tr.appendChild(crearCelda(plural(lista.length, 'slot', 'slots')));
            tr.appendChild(crearCelda(lista.length ? `${hhmm(lista[0].inicio)} → ${hhmm(lista[lista.length - 1].fin)}` : '—', 'texto-codigo'));
            if (puedeModificar) {
                const botones = [crearBotonIcono('editar', numero, 'bi-pencil', `Personalizar los slots del ${nombre.toLowerCase()}`)];
                if (propio) botones.push(crearBotonIcono('base', numero, 'bi-arrow-counterclockwise', `Volver a la base el ${nombre.toLowerCase()}`));
                tr.appendChild(crearCeldaAcciones(...botones));
            }
            cuerpoDias.appendChild(tr);
        });
    }

    cuerpoDias.addEventListener('click', (evento) => {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton || !puedeModificar) return;
        const numero = Number(boton.dataset.id);
        if (boton.dataset.accion === 'editar') abrirDia(numero);
        if (boton.dataset.accion === 'base') {
            pedirConfirmacion(`¿Quitar los slots propios del ${CFG_DIAS[numero].toLowerCase()}? Volverá a usar la base (${plural(slots.length, 'slot', 'slots')}).`,
                async () => {
                    const { error } = await db.from('slot_dias').delete().eq('dia', numero); // borra también sus slots_dia
                    if (error) {
                        console.error('Error al volver a la base:', error);
                        aviso.mostrar('No se pudieron quitar los slots del día.', 'error');
                        return;
                    }
                    aviso.mostrar(`${CFG_DIAS[numero]}: usa la base.`);
                    cargarTodo();
                });
        }
    });

    function crearFilaDia(numero, valores) {
        const fila = document.createElement('div');
        fila.className = 'cfg-dia-fila cfg-slot-fila';
        const nombre = document.createElement('span');
        nombre.className = 'cfg-dia-nombre';
        const circulo = document.createElement('span');
        circulo.className = 'cfg-numero-marca';
        circulo.textContent = numero;
        nombre.append(circulo, `Slot ${numero}`);
        fila.appendChild(nombre);
        [['inicio', 'desde'], ['fin', 'hasta']].forEach(([campo, texto]) => {
            const input = document.createElement('input');
            input.type = 'time';
            input.className = 'campo-input';
            input.dataset.campo = campo;
            input.value = valores[campo] || '';
            input.setAttribute('aria-label', `Slot ${numero}: ${texto}`);
            fila.appendChild(input);
        });
        return fila;
    }

    const leerFilasDia = () => [...diaFilas.children].map((fila) => ({
        inicio: fila.querySelector('[data-campo="inicio"]').value,
        fin: fila.querySelector('[data-campo="fin"]').value,
    }));

    // Arma "total" filas: conserva lo escrito; las nuevas toman la base o siguen después de la anterior
    function armarFilasDia(total) {
        const actuales = leerFilasDia();
        diaFilas.replaceChildren();
        for (let numero = 1; numero <= total; numero++) {
            let valores = actuales[numero - 1];
            if (!valores) {
                const base = slots.find((s) => s.numero === numero);
                const anterior = numero > 1 ? leerFilasDia()[numero - 2] : null;
                const encima = base && anterior && anterior.fin && aMinutos(base.inicio) < aMinutos(anterior.fin);
                if (base && !encima) valores = { inicio: hhmm(base.inicio), fin: hhmm(base.fin) };
                else {
                    const inicio = anterior && anterior.fin ? aMinutos(anterior.fin) : 8 * 60;
                    valores = inicio + CFG_SLOT_DURACION_MIN > 23 * 60 + 59 ? {}
                        : { inicio: aHora(inicio), fin: aHora(inicio + CFG_SLOT_DURACION_MIN) };
                }
            }
            diaFilas.appendChild(crearFilaDia(numero, valores));
        }
        diaVacio.hidden = total > 0;
        $('#cfgSlotDiaDialogo .cfg-dia-encabezado').hidden = total === 0;
    }

    function abrirDia(numero) {
        editandoDia = numero;
        diaError.textContent = '';
        $('#cfgSlotDiaTitulo').textContent = `Slots del ${CFG_DIAS[numero].toLowerCase()}`;
        const lista = slotsDelDia(numero);
        diaFilas.replaceChildren();
        lista.forEach((s) => diaFilas.appendChild(crearFilaDia(s.numero, { inicio: hhmm(s.inicio), fin: hhmm(s.fin) })));
        diaCantidad.value = lista.length;
        armarFilasDia(lista.length);

        diaOtros.replaceChildren();
        Object.entries(CFG_DIAS).filter(([n]) => Number(n) !== numero).forEach(([n, nombre]) => {
            const label = document.createElement('label');
            const casilla = document.createElement('input');
            casilla.type = 'checkbox';
            casilla.value = n;
            label.append(casilla, nombre);
            diaOtros.appendChild(label);
        });
        diaDialogo.showModal();
        diaCantidad.focus();
    }

    diaCantidad.addEventListener('input', () => {
        const total = Number(diaCantidad.value);
        if (Number.isInteger(total) && total >= 0 && total <= 24) armarFilasDia(total);
    });

    $('#cfgSlotDiaForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!puedeModificar || !editandoDia) return;
        diaError.textContent = '';
        const total = Number(diaCantidad.value);
        if (!Number.isInteger(total) || total < 0 || total > 24) {
            diaError.textContent = 'La cantidad de slots debe ser un número entero de 0 a 24.';
            return;
        }
        const filas = leerFilasDia();
        const problema = revisarHoras(filas);
        if (problema) { diaError.textContent = problema; return; }

        const destinos = [editandoDia, ...[...diaOtros.querySelectorAll('input:checked')].map((c) => Number(c.value))];
        const ahora = new Date().toISOString();
        let resultado = await db.from('slot_dias').upsert(destinos.map((dia) => ({ dia, cantidad_slots: total, actualizado_en: ahora })));
        if (!resultado.error) resultado = await db.from('slots_dia').delete().in('dia', destinos);
        if (!resultado.error && filas.length) {
            resultado = await db.from('slots_dia').insert(destinos.flatMap((dia) => filas.map((f, i) => ({
                dia, numero: i + 1, inicio: f.inicio, fin: f.fin,
            }))));
        }
        if (resultado.error) {
            console.error('Error al guardar los slots del día:', resultado.error);
            diaError.textContent = 'No se pudo guardar. Intenta de nuevo.';
            return;
        }
        diaDialogo.close();
        const nombres = destinos.map((d) => CFG_DIAS[d]).join(', ');
        aviso.mostrar(total ? `${nombres}: ${plural(total, 'slot', 'slots')} guardados.` : `${nombres}: sin slots.`);
        cargarTodo();
    });

    // Botones "Cancelar" de las dos ventanas
    seccion.querySelectorAll('dialog [data-cerrar]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================

    cargarTodo();

    return () => {
        [slotDialogo, diaDialogo].forEach((d) => { if (d.open) d.close(); });
    };
});
