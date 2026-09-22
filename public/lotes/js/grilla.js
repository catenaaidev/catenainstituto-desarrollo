/* ===== Lotes CIW — grilla tipo planilla sobre las tablas existentes =====
 * Se engancha al DOM ya renderizado: las filas son los `tbody tr`, las
 * columnas los `thead th` QUE TIENEN data-k, y una celda es la coordenada
 * (fila, columna) de lo que se ve en pantalla, o sea despues de ordenar y
 * filtrar.
 *
 * NO importa nucleo.js y no conoce DATOS(). Copiar sale del DOM; escribir pasa
 * siempre por el adaptador que da la vista. Asi un bug de grilla no puede
 * corromper datos por su cuenta.
 */
'use strict';

import { rect, rectIguales, rectCeldas, rectRecortar,
         rectDiferencia, sonContiguos } from './grilla-rect.js';
import { crearPila } from './grilla-undo.js';
import { parsearTSV, armarTSV } from './grilla-tsv.js';
import { escribirCelda } from './tabla.js';

/* ---------- estado ----------
 * Va en un Map del modulo indexado por el id de la tabla, NO en el elemento:
 * en Analisis, Movimientos, FML y Muestras la vista hace `sec.innerHTML = html`
 * y el <table> es un elemento nuevo en cada render. El id, en cambio, es
 * estable. Sin esto la seleccion se perderia en cada repintado.
 */
const _estados = new Map();

export function estadoDe(idTabla){ return _estados.get(idTabla) || null; }

function nuevoEstado(id){
  return {
    id,
    tabla: null,
    adaptador: null,
    sel: null,        // rect|null — el rango seleccionado
    activa: null,     // {f,c}|null — la celda activa (el ancla del teclado)
    claves: null,     // identidad de cada fila visible, o null si no hay forma
    pila: crearPila(),
    arrastrando: false,
    editando: false,
  };
}

/* ---------- geometria, leida del DOM en cada uso ----------
 * No se cachea: el DOM cambia bajo los pies (ordenar, filtrar, llegada del
 * dashboard). Recalcular es barato y siempre correcto.
 */
export function geo(tabla){
  const cols = [];
  for (const th of tabla.querySelectorAll('thead th')){
    // Las columnas sin data-k quedan afuera de la grilla. Eso excluye sola la
    // ultima columna de acciones (el boton de eliminar y el link a la ficha) en
    // todas las vistas, sin listas de excepciones.
    if (th.dataset.k) cols.push({ k: th.dataset.k, th });
  }
  const trs = [];
  for (const tr of tabla.querySelectorAll('tbody tr')){
    // Las filas placeholder ("Sin lotes con los filtros actuales") tienen una
    // sola celda con colspan y no son datos.
    if (!tr.querySelector('td[colspan]')) trs.push(tr);
  }
  return { cols, trs };
}

/** El <td> de la coordenada (f,c). Se ubica por th.cellIndex, asi la columna
 *  de gutter inyectada no desalinea nada: al insertarse en el thead y en cada
 *  fila, los cellIndex se corren juntos. */
export function celdaDe(g, f, c){
  const tr = g.trs[f];
  const col = g.cols[c];
  if (!tr || !col) return null;
  return tr.cells[col.th.cellIndex] || null;
}

/** El control editable de una celda, si tiene. */
function controlDe(td){
  return td ? td.querySelector('input, select, textarea') : null;
}

/** Texto visible de una celda, para copiar. De los inputs y selects sale el
 *  .value; del resto, el texto renderizado (la barra de avance da "88%", el
 *  chip de etapa da "crianza"). */
export function textoDe(td){
  if (!td) return '';
  const el = controlDe(td);
  if (el) return el.value == null ? '' : String(el.value);
  return (td.innerText || td.textContent || '').trim();
}

/** Una celda es de solo lectura si no tiene control editable, o si lo tiene
 *  deshabilitado. Lo segundo importa en Movimientos, donde los campos se apagan
 *  segun el tipo y COLS_MOV no puede saberlo. */
export function esRO(td){
  const el = controlDe(td);
  return !el || el.disabled || el.readOnly;
}

/* ---------- columna de gutter ---------- */
export function inyectarGutter(tabla){
  if (tabla.querySelector('th.ggutter')) return;   // ya inyectada en este DOM

  /* Una celda por CADA fila del thead. La pestana Lotes tiene dos (bandas y
   * columnas): meterla solo en la primera dejaria la fila de columnas con una
   * celda menos y todos los cellIndex corridos uno, y celdaDe ubica cada <td>
   * por col.th.cellIndex, asi que la grilla leeria y escribiria en la columna
   * de al lado sin que se note.
   *
   * rowspan=2 NO sirve como atajo: dejaria la fila de columnas sin celda propia
   * y el desalineo seria exactamente el mismo. */
  for (const trHead of tabla.querySelectorAll('thead tr')){
    const th = document.createElement('th');
    th.className = 'ggutter gcorner';
    th.title = 'Seleccionar toda la tabla';
    trHead.insertBefore(th, trHead.firstChild);
  }
  let n = 0;
  for (const tr of tabla.querySelectorAll('tbody tr')){
    const td = document.createElement('td');
    td.className = 'ggutter';
    // Las filas placeholder tambien reciben la celda, para no desalinear el
    // colspan; pero no llevan numero porque no son datos.
    if (!tr.querySelector('td[colspan]')) td.textContent = String(++n);
    tr.insertBefore(td, tr.firstChild);
  }
}

/* ---------- pintado ---------- */
function marcarCelda(g, f, c, on){
  const td = celdaDe(g, f, c);
  if (td) td.classList.toggle('gsel', on);
}

/** Repinta desde cero. Se usa al activar y despues de restaurar. */
export function pintar(st, g){
  for (const tr of g.trs){
    for (const td of tr.cells) td.classList.remove('gsel', 'gact');
    if (tr.cells[0] && tr.cells[0].classList.contains('ggutter'))
      tr.cells[0].classList.remove('gselfila');
  }
  for (const col of g.cols) col.th.classList.remove('gselcol');
  if (!st.sel) return;

  for (const cel of rectCeldas(st.sel)) marcarCelda(g, cel.f, cel.c, true);
  for (let c = st.sel.c1; c <= st.sel.c2; c++)
    if (g.cols[c]) g.cols[c].th.classList.add('gselcol');
  for (let f = st.sel.f1; f <= st.sel.f2; f++){
    const tr = g.trs[f];
    if (tr && tr.cells[0] && tr.cells[0].classList.contains('ggutter'))
      tr.cells[0].classList.add('gselfila');
  }
  if (st.activa){
    const td = celdaDe(g, st.activa.f, st.activa.c);
    if (td) td.classList.add('gact');
  }
}

/** Repinta SOLO la diferencia. Es lo que hace usable el arrastre: marcar las
 *  ~3.200 celdas de Lotes en cada mousemove se notaria. */
function pintarDiff(st, g, viejo, nuevo){
  const d = rectDiferencia(viejo, nuevo);
  for (const cel of d.quitar)  marcarCelda(g, cel.f, cel.c, false);
  for (const cel of d.agregar) marcarCelda(g, cel.f, cel.c, true);
  // Encabezados, numeros de fila y celda activa son pocos: se repintan enteros.
  for (const col of g.cols) col.th.classList.remove('gselcol');
  for (let c = nuevo.c1; c <= nuevo.c2; c++)
    if (g.cols[c]) g.cols[c].th.classList.add('gselcol');
  for (const tr of g.trs)
    if (tr.cells[0] && tr.cells[0].classList.contains('ggutter'))
      tr.cells[0].classList.remove('gselfila');
  for (let f = nuevo.f1; f <= nuevo.f2; f++){
    const tr = g.trs[f];
    if (tr && tr.cells[0] && tr.cells[0].classList.contains('ggutter'))
      tr.cells[0].classList.add('gselfila');
  }
}

/* ---------- seleccion ---------- */
/** Selecciona (f,c). Con extender=true, estira el rango desde la celda activa
 *  en lugar de empezar uno nuevo. */
export function seleccionar(st, g, f, c, extender){
  const viejo = st.sel;
  if (extender && st.activa){
    st.sel = rect(st.activa.f, st.activa.c, f, c);
  } else {
    st.sel = rect(f, c, f, c);
    st.activa = { f, c };
  }
  st.sel = rectRecortar(st.sel, g.trs.length, g.cols.length);
  if (!st.sel){ st.activa = null; pintar(st, g); return; }

  if (viejo) pintarDiff(st, g, viejo, st.sel);
  else pintar(st, g);
  marcarActiva(st, g);
}

/** La celda activa se repinta aparte: pintarDiff no la toca, porque es una sola
 *  celda y no vale meterla en la aritmetica del rectangulo. */
function marcarActiva(st, g){
  for (const tr of g.trs)
    for (const td of tr.cells) td.classList.remove('gact');
  if (!st.activa) return;
  const td = celdaDe(g, st.activa.f, st.activa.c);
  if (td) td.classList.add('gact');
}

function seleccionarFila(st, g, f, extender){
  const desde = (extender && st.activa) ? st.activa.f : f;
  st.sel = rectRecortar(rect(desde, 0, f, g.cols.length - 1),
                        g.trs.length, g.cols.length);
  if (!extender || !st.activa) st.activa = { f, c: 0 };
  pintar(st, g);   // pintar ya marca la celda activa
}

function seleccionarColumna(st, g, c, extender){
  const desde = (extender && st.activa) ? st.activa.c : c;
  st.sel = rectRecortar(rect(0, desde, g.trs.length - 1, c),
                        g.trs.length, g.cols.length);
  if (!extender || !st.activa) st.activa = { f: 0, c };
  pintar(st, g);
}

function seleccionarTodo(st, g){
  st.sel = rectRecortar(rect(0, 0, g.trs.length - 1, g.cols.length - 1),
                        g.trs.length, g.cols.length);
  st.activa = st.sel ? { f: 0, c: 0 } : null;
  pintar(st, g);
}

/* ---------- navegacion ---------- */
/** Mueve la celda activa df filas y dc columnas, recortando contra los limites.
 *  Con extender=true no mueve el ancla: estira el rango (Shift+flechas). */
export function moverActiva(st, g, df, dc, extender){
  if (!g.trs.length || !g.cols.length) return;
  if (!st.activa){ seleccionar(st, g, 0, 0, false); asegurarVisible(st, g); return; }

  /* Al extender, el borde que se mueve es el opuesto al ancla. */
  const destino = extender && st.sel
    ? { f: (st.sel.f1 === st.activa.f ? st.sel.f2 : st.sel.f1) + df,
        c: (st.sel.c1 === st.activa.c ? st.sel.c2 : st.sel.c1) + dc }
    : { f: st.activa.f + df, c: st.activa.c + dc };

  const f = Math.max(0, Math.min(g.trs.length - 1, destino.f));
  const c = Math.max(0, Math.min(g.cols.length - 1, destino.c));

  if (extender){
    st.sel = rect(st.activa.f, st.activa.c, f, c);
    pintar(st, g);
    asegurarVisible(st, g, f, c);
  } else {
    seleccionar(st, g, f, c, false);
    asegurarVisible(st, g);
  }
}

/** Scrollea el contenedor .scroll para que la celda quede visible, compensando
 *  el alto del thead, que es position:sticky y taparia la celda al subir. */
export function asegurarVisible(st, g, f, c){
  const fila = f != null ? f : (st.activa ? st.activa.f : null);   // != null es intencional: cubre null y undefined
  const col  = c != null ? c : (st.activa ? st.activa.c : null);
  if (fila == null || col == null) return;
  const td = celdaDe(g, fila, col);
  if (!td) return;

  const cont = st.tabla.closest('.scroll');
  if (!cont){ td.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return; }

  const thead = st.tabla.querySelector('thead');
  const altoHead = thead ? thead.offsetHeight : 0;

  const rTd = td.getBoundingClientRect();
  const rCont = cont.getBoundingClientRect();

  if (rTd.top < rCont.top + altoHead)
    cont.scrollTop -= (rCont.top + altoHead - rTd.top);
  else if (rTd.bottom > rCont.bottom)
    cont.scrollTop += (rTd.bottom - rCont.bottom);

  if (rTd.left < rCont.left)        cont.scrollLeft -= (rCont.left - rTd.left);
  else if (rTd.right > rCont.right) cont.scrollLeft += (rTd.right - rCont.right);
}

/** Pone el foco en el control de la celda activa, para editarla.
 *  Devuelve false si la celda es de solo lectura. */
export function entrarAEditar(st, g){
  if (!st.activa) return false;
  const td = celdaDe(g, st.activa.f, st.activa.c);
  if (!td || esRO(td)) return false;
  const el = controlDe(td);
  if (!el) return false;
  st.editando = true;
  st.valorPrevio = el.value;   // para que Escape pueda cancelar
  el.focus();
  if (el.select) el.select();
  return true;
}

/** Una tabla solo responde al teclado si su seccion esta visible. Sin esto, las
 *  10 tablas del app se pelearian por cada tecla. */
export function tablaVisible(tabla){
  const sec = tabla.closest('section.view');
  return !!sec && sec.classList.contains('active');
}

/* ---------- restaurar la seleccion tras un re-render ----------
 * Por IDENTIDAD de fila, nunca por indice: despues de ordenar o filtrar el
 * indice 3 ya es otro lote, y marcar la fila equivocada es peor que perder la
 * seleccion.
 */
/** Identidad de cada fila visible, o null si no hay forma de establecerla.
 *
 *  Devuelve null y NO cae al indice a proposito. Caer al indice haria que, tras
 *  ordenar, la seleccion se quede en las POSICIONES y termine marcando otras
 *  filas: el usuario copiaria datos que no eligio. Perder la seleccion es
 *  molesto; marcar la fila equivocada es un error silencioso. */
function clavesDe(st, g){
  const ad = st.adaptador;
  if (!ad) return null;
  if (ad.claveFila) return g.trs.map((tr, f) => ad.claveFila(f));
  if (!ad.objetoDe) return null;
  /* La referencia al objeto vivo de la fila: el mismo objeto que el adaptador
   * usa como destino de escritura. Un solo concepto sirve de identidad Y de
   * destino, y no hay que inventar ni mantener ningun campo id. */
  const claves = g.trs.map((tr, f) => ad.objetoDe(f));
  return claves.some(x => x == null) ? null : claves;
}

function restaurarSeleccion(st, g){
  const nuevas = clavesDe(st, g);
  const previas = st.claves;
  st.claves = nuevas;

  /* Sin identidad no se restaura NADA: se limpia. Ver clavesDe. */
  if (!nuevas || !previas){ st.sel = null; st.activa = null; return; }

  if (!st.sel) return;

  const indices = [];
  for (let f = st.sel.f1; f <= st.sel.f2 && f < previas.length; f++){
    const i = nuevas.indexOf(previas[f]);
    if (i >= 0) indices.push(i);
  }
  if (!indices.length){ st.sel = null; st.activa = null; return; }

  const claveActiva = st.activa && st.activa.f < previas.length
    ? previas[st.activa.f] : null;

  /* Si las filas que sobrevivieron quedaron DISPERSAS, el rectangulo minimo que
   * las contiene arrastraria filas que el usuario nunca selecciono. Medido: 5
   * filas contiguas, ordenar por variedad, y el bbox pasaba a marcar 8 filas con
   * 3 intrusas. Con Delete o un pegado encima, eso escribe en lotes que nadie
   * eligio. La seleccion es un rectangulo por diseno, asi que cuando no se puede
   * representar fielmente se limpia: perder la seleccion es molesto, escribir en
   * la fila equivocada es un error silencioso. */
  if (!sonContiguos(indices)){ st.sel = null; st.activa = null; return; }

  const min = Math.min(...indices), max = Math.max(...indices);
  st.sel = rectRecortar(rect(min, st.sel.c1, max, st.sel.c2),
                        g.trs.length, g.cols.length);

  if (!st.sel){ st.activa = null; return; }

  const fActiva = claveActiva != null ? nuevas.indexOf(claveActiva) : -1;
  st.activa = (fActiva >= 0 && st.activa)
    ? { f: fActiva, c: Math.min(st.activa.c, g.cols.length - 1) }
    : { f: st.sel.f1, c: st.sel.c1 };

  /* Invariante: si hay seleccion, la celda activa esta SIEMPRE dentro de ella.
   * Al reordenar, la fila activa puede caer fuera del rectangulo minimo que
   * contiene a las filas que sobrevivieron. Dejarla afuera no seria solo un
   * borde mal pintado: el pegado se ancla en la celda activa, asi que
   * escribiria fuera del rango seleccionado. */
  if (st.activa){
    st.activa = {
      f: Math.min(Math.max(st.activa.f, st.sel.f1), st.sel.f2),
      c: Math.min(Math.max(st.activa.c, st.sel.c1), st.sel.c2),
    };
  }
}

/* ---------- eventos de mouse ---------- */
function cablearMouse(tabla, st){
  /* mousedown en CAPTURA: es lo que impide que el <input> tome el foco, y por
   * eso el clic selecciona en lugar de entrar a editar. */
  tabla.addEventListener('mousedown', e => {
    const g = geo(tabla);

    /* Esquina del gutter: toda la tabla */
    if (e.target.closest('th.gcorner')){
      e.preventDefault(); seleccionarTodo(st, g); return;
    }

    /* Numero de fila: la fila entera */
    const gut = e.target.closest('td.ggutter');
    if (gut){
      const f = g.trs.indexOf(gut.parentElement);
      if (f >= 0){ e.preventDefault(); seleccionarFila(st, g, f, e.shiftKey); }
      return;
    }

    /* Encabezado: los primeros 8px toman la columna; el resto sigue ordenando,
     * que es un gesto que ya se usa todos los dias y no se le roba. */
    const th = e.target.closest('th[data-k]');
    if (th){
      /* Nunca robarle el mousedown a un boton del encabezado (el embudo de
       * filtro, el chip de colapsar): misma guardia que la de mas abajo para los
       * botones de las celdas. Hace falta aca arriba y no alcanza con aquella
       * porque `e.offsetX` es relativo a e.target, NO al th: apretando cerca del
       * borde izquierdo del boton offsetX da <= 8 y se seleccionaria la columna
       * entera en lugar de abrir el filtro. */
      if (e.target.closest('button')) return;
      if (e.offsetX <= 8){
        e.preventDefault(); e.stopPropagation();
        const c = g.cols.findIndex(x => x.th === th);
        if (c >= 0) seleccionarColumna(st, g, c, e.shiftKey);
      }
      return;   // sin preventDefault: el onclick del th ordena como siempre
    }

    /* Nunca robarle el clic a un boton (eliminar fila, link a la ficha) */
    if (e.target.closest('button')) return;

    const td = e.target.closest('td');
    if (!td || td.classList.contains('ggutter')) return;
    const tr = td.parentElement;
    const f = g.trs.indexOf(tr);
    const c = g.cols.findIndex(x => x.th.cellIndex === td.cellIndex);
    if (f < 0 || c < 0) return;

    /* Clic en la celda que YA estaba activa: dejarlo pasar para entrar a
     * editar y para que los <select> nativos se abran. */
    if (st.activa && st.activa.f === f && st.activa.c === c && !e.shiftKey){
      st.editando = true;
      return;
    }

    e.preventDefault();
    st.editando = false;
    seleccionar(st, g, f, c, e.shiftKey);

    if (!e.shiftKey){
      st.arrastrando = true;
      tabla.classList.add('garrastrando');
    }
  }, true);

  tabla.addEventListener('mouseover', e => {
    if (!st.arrastrando) return;
    const td = e.target.closest('td');
    if (!td || td.classList.contains('ggutter')) return;
    const g = geo(tabla);
    const f = g.trs.indexOf(td.parentElement);
    const c = g.cols.findIndex(x => x.th.cellIndex === td.cellIndex);
    if (f < 0 || c < 0) return;
    const viejo = st.sel;
    st.sel = rectRecortar(rect(st.activa.f, st.activa.c, f, c),
                          g.trs.length, g.cols.length);
    if (st.sel && !rectIguales(viejo, st.sel)) pintarDiff(st, g, viejo, st.sel);
  });

  /* Doble clic: editar */
  tabla.addEventListener('dblclick', e => {
    const td = e.target.closest('td');
    if (!td || esRO(td)) return;
    st.editando = true;
    const el = controlDe(td);
    if (el){ el.focus(); if (el.select) el.select(); }
  });

  /* Al salir del input, la grilla vuelve a tomar el teclado. Se usa focusout,
   * que burbujea; blur no burbujea y no llegaria aca. */
  tabla.addEventListener('focusout', () => { st.editando = false; });
}

/* ---------- teclado ---------- */
const TECLAS_MOVER = {
  ArrowUp:    [-1,  0], ArrowDown:  [ 1,  0],
  ArrowLeft:  [ 0, -1], ArrowRight: [ 0,  1],
};

/** Devuelve true si consumio la tecla. Las tareas 8, 9 y 10 suman casos
 *  (copiar, pegar, borrar, deshacer) justo antes del bloque de navegacion. */
function _manejarTecla(st, e){
  const g = geo(st.tabla);

  /* --- editando: la grilla se aparta --- */
  if (st.editando){
    const td = st.activa ? celdaDe(g, st.activa.f, st.activa.c) : null;
    const el = controlDe(td);

    if (e.key === 'Escape'){
      if (el && st.valorPrevio !== undefined) el.value = st.valorPrevio;
      if (el) el.blur();
      st.editando = false;
      return true;
    }
    if (e.key === 'Enter'){
      if (el) el.blur();
      st.editando = false;
      moverActiva(st, g, 1, 0, false);
      return true;
    }
    if (e.key === 'Tab'){
      if (el) el.blur();
      st.editando = false;
      moverActiva(st, g, 0, e.shiftKey ? -1 : 1, false);
      return true;
    }
    /* Cualquier otra tecla es del input: ni la mira. Esto es lo que permite
     * seleccionar texto dentro de una celda y copiarlo con Ctrl+C. */
    return false;
  }

  if (!st.sel || !st.activa) return false;

  /* --- copiar --- */
  if ((e.key === 'c' || e.key === 'C') && e.ctrlKey && !e.shiftKey){
    copiar(st, g); return true;
  }

  /* --- seleccionar fila / columna / todo --- */
  if (e.key === ' ' && e.shiftKey && !e.ctrlKey){
    seleccionarFila(st, g, st.activa.f, false); return true;
  }
  if (e.key === ' ' && e.ctrlKey && !e.shiftKey){
    seleccionarColumna(st, g, st.activa.c, false); return true;
  }
  if ((e.key === 'a' || e.key === 'A') && e.ctrlKey){
    seleccionarTodo(st, g); return true;
  }

  /* --- operaciones en bloque --- */
  if (e.key === 'Delete' || e.key === 'Backspace'){ borrarRango(st, g); return true; }
  if (e.key === 'Enter' && e.ctrlKey){ aplicarAlRango(st, g); return true; }
  if ((e.key === 'd' || e.key === 'D') && e.ctrlKey){ rellenarAbajo(st, g); return true; }
  if ((e.key === 'z' || e.key === 'Z') && e.ctrlKey && !e.shiftKey){ deshacer(st); return true; }
  if ((e.key === 'y' || e.key === 'Y') && e.ctrlKey){ rehacer(st); return true; }
  if ((e.key === 'z' || e.key === 'Z') && e.ctrlKey && e.shiftKey){ rehacer(st); return true; }

  /* --- entrar a editar ---
   * El !e.ctrlKey no es decorativo: sin el, este caso se traga el Ctrl+Enter que
   * aplica un valor a todo el rango, y esa tecla nunca llegaria a su rama por
   * mas que se inserte "antes de la navegacion". */
  if ((e.key === 'F2' || e.key === 'Enter') && !e.ctrlKey) return entrarAEditar(st, g);

  /* Tipear un caracter imprimible edita y reemplaza, como en Excel. Se excluyen
   * los atajos con Ctrl/Alt/Meta para no pisarlos. Se devuelve false a proposito:
   * la tecla tiene que llegar al input ya vaciado. */
  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey){
    if (entrarAEditar(st, g)){
      const el = controlDe(celdaDe(g, st.activa.f, st.activa.c));
      if (el) el.value = '';
    }
    return false;
  }

  /* --- navegacion --- */
  if (TECLAS_MOVER[e.key]){
    const [df, dc] = TECLAS_MOVER[e.key];
    moverActiva(st, g, df, dc, e.shiftKey);
    return true;
  }
  if (e.key === 'Tab'){
    moverActiva(st, g, 0, e.shiftKey ? -1 : 1, false); return true;
  }
  if (e.key === 'Home'){
    if (e.ctrlKey) seleccionar(st, g, 0, 0, e.shiftKey);
    else           seleccionar(st, g, st.activa.f, 0, e.shiftKey);
    asegurarVisible(st, g); return true;
  }
  if (e.key === 'End'){
    if (e.ctrlKey) seleccionar(st, g, g.trs.length - 1, g.cols.length - 1, e.shiftKey);
    else           seleccionar(st, g, st.activa.f, g.cols.length - 1, e.shiftKey);
    asegurarVisible(st, g); return true;
  }

  /* --- limpiar la seleccion ---
   * Solo si hay algo seleccionado; el guard de arriba ya lo garantiza. Si no
   * hubiera seleccion, el Escape se deja pasar para que el handler global de
   * app.js:45 pueda cerrar el overlay. */
  if (e.key === 'Escape'){
    st.sel = null; st.activa = null; pintar(st, g); return true;
  }

  return false;
}

/* ---------- fin del arrastre, global ----------
 * NO puede ir dentro de cablearMouse: en Analisis, Movimientos, FML y Muestras
 * la vista recrea el <table> en cada render, y el guard tabla._gcableada no lo
 * ataja porque el elemento es nuevo. Puesto ahi, cada repintado acumularia otro
 * listener en document. Aca es uno solo para todas las tablas.
 *
 * Va en document y no en la tabla porque soltar el boton afuera de ella tambien
 * tiene que terminar el arrastre.
 */
let _arrastreCableado = false;

function cablearFinArrastre(){
  if (_arrastreCableado) return;
  _arrastreCableado = true;

  document.addEventListener('mouseup', () => {
    for (const st of _estados.values()){
      if (!st.arrastrando) continue;
      st.arrastrando = false;
      if (st.tabla) st.tabla.classList.remove('garrastrando');
    }
  });
}

/* ---------- copiar ---------- */
/** El rango como matriz de texto, en orden de lectura. */
export function matrizDe(g, r){
  const out = [];
  if (!r) return out;
  for (let f = r.f1; f <= r.f2; f++){
    const fila = [];
    for (let c = r.c1; c <= r.c2; c++) fila.push(textoDe(celdaDe(g, f, c)));
    out.push(fila);
  }
  return out;
}

/** Escribe texto en el portapapeles.
 *
 * Se intenta execCommand PRIMERO, no como respaldo: es el unico camino que
 * funciona sobre http plano, que es como se usa el app desde las otras PCs de
 * la bodega. navigator.clipboard solo existe en contexto seguro (localhost o
 * https), asi que arrancar por ahi andaria en la PC del servidor y fallaria en
 * silencio en el resto.
 */
function alPortapapeles(texto){
  let ta = document.getElementById('gclip');
  if (!ta){
    ta = document.createElement('textarea');
    ta.id = 'gclip';
    ta.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ta);
  }
  ta.value = texto;

  const focoPrevio = document.activeElement;
  ta.focus();
  ta.select();

  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }

  // Devolver el foco: si no, la grilla pierde el teclado despues de copiar.
  if (focoPrevio && focoPrevio.focus) focoPrevio.focus();
  ta.value = '';

  if (ok) return Promise.resolve(true);

  // Ultimo recurso, solo por si execCommand desaparece en el futuro.
  if (navigator.clipboard && navigator.clipboard.writeText){
    return navigator.clipboard.writeText(texto).then(() => true, () => false);
  }
  return Promise.resolve(false);
}

/** Cartel efimero arriba de la tabla. Usa los estilos .msg que ya existen. */
export function mensaje(tabla, texto, tipo){
  const cont = tabla.closest('.scroll') || tabla;
  const ancla = cont.parentElement || cont;
  let el = ancla.querySelector(':scope > .gmsg');
  if (!el){
    el = document.createElement('div');
    el.className = 'gmsg msg';
    ancla.insertBefore(el, cont);
  }
  el.className = 'gmsg msg ' + (tipo || 'info');
  el.textContent = texto;
  clearTimeout(el._t);
  // Se guarda en el propio elemento (no en un Map de modulo) para que el
  // timer viva y muera junto al cartel que controla: si el cartel se destruye
  // por otra via, no queda un timer huerfano que limpiar aparte.
  el._t = setTimeout(() => { el.remove(); }, 6000);
}

export function copiar(st, g){
  if (!st.sel) return { celdas: 0, ok: false };
  const matriz = matrizDe(g, st.sel);
  const celdas = matriz.length * (matriz[0] ? matriz[0].length : 0);
  alPortapapeles(armarTSV(matriz)).then(ok => {
    if (ok) mensaje(st.tabla, `Copiadas ${celdas} celdas.`, 'ok');
    else    mensaje(st.tabla, 'No se pudo copiar al portapapeles.', 'err');
  });
  return { celdas, ok: true };
}

/* ---------- cableado global del teclado ----------
 * Uno solo para todas las tablas: en cada tecla se busca la unica cuya seccion
 * esta activa. Va en document porque los <td> no pueden tener el foco.
 */
let _tecladoCableado = false;

function cablearTeclado(){
  if (_tecladoCableado) return;
  _tecladoCableado = true;

  /* Al recargar datos del servidor los objetos de DATOS() se reemplazan y las
   * pilas quedarian apuntando a objetos huerfanos. El evento evita importar
   * nucleo.js desde aca, que cerraria un ciclo: grilla->tabla->nucleo->grilla. */
  document.addEventListener('lotes:datos-recargados', limpiarPilas);

  /* capture:true: la grilla escucha en la fase de captura, antes que los
   * listeners de burbujeo de app.js. Lo que evita que app.js lo vea es
   * stopImmediatePropagation(), que detiene los demas listeners; la captura
   * y el burbujeo son fases independientes. Eso garantiza que si la grilla
   * consume el Escape (hay seleccion activa), el overlay no se cierra. */
  document.addEventListener('keydown', e => {
    for (const st of _estados.values()){
      if (!st.tabla || !st.tabla.isConnected) continue;
      if (!tablaVisible(st.tabla)) continue;
      if (!st.sel && !st.editando) continue;
      /* Si el foco esta en un control que NO pertenece a esta tabla, la tecla no
       * es para la grilla: el usuario esta escribiendo en el buscador, en un
       * filtro, o en un campo del encabezado. Sin esto, tipear una letra en
       * "Buscar por lote" con una celda seleccionada le roba el foco a la celda
       * y arranca a editar un lote. Los controles DENTRO de la tabla si son
       * nuestros: ese es el caso de edicion, que maneja st.editando. */
      const dest = e.target;
      const esControl = dest && (dest.tagName === 'INPUT' || dest.tagName === 'SELECT'
                     || dest.tagName === 'TEXTAREA' || dest.isContentEditable);
      if (esControl && !st.tabla.contains(dest)) return;
      if (_manejarTecla(st, e)){ e.preventDefault(); e.stopImmediatePropagation(); }
      return;   // hay una sola tabla visible por vez
    }
  }, true);
}

/* ---------- fabrica de adaptadores ----------
 * Para la convencion que comparten Lotes, Analisis y Movimientos:
 * `data-row` + `data-k` en las celdas y `tabla._rows` con las referencias a los
 * objetos vivos. Esas vistas no escriben ninguno de los metodos.
 *
 * `cols` es el COLS_* de la vista. OJO: no tiene por que cubrir todas las
 * columnas de la grilla. En Lotes la grilla ve hasta 26 (las 24 de COLS_LOTES
 * mas Etapa y Avance, menos las columnas de los grupos colapsados) y
 * escribirCelda devuelve 'ro' para las dos que no estan en cols, que es
 * exactamente lo que corresponde.
 */
export function adaptadorCols(tabla, cols, onCambio){
  return {
    objetoDe(f){
      return (tabla._rows && tabla._rows[f] != null) ? tabla._rows[f] : null;
    },
    leer(obj, k){ return obj ? obj[k] : undefined; },
    escribir(obj, k, texto){
      if (!obj) return 'ro';
      return escribirCelda(cols, obj, k, texto);
    },
    escribirCrudo(obj, k, valor){ if (obj) obj[k] = valor; },
    onCambio,
  };
}

/* ---------- motor de escritura ----------
 * Un solo camino para pegar, borrar, aplicar al rango, rellenar abajo y
 * deshacer. Todos comparten las mismas reglas y el mismo reporte.
 */

/** Vuelve a leer el valor guardado y lo pone en el control. Sin esto la celda
 *  seguiria mostrando el texto viejo, porque la escritura fue al objeto de
 *  datos y no al DOM. Ademas normaliza: se pega "3,22" y queda "3.22". */
function refrescarCelda(ad, g, f, c, obj, k){
  const td = celdaDe(g, f, c);
  const el = controlDe(td);
  if (!el) return;
  const v = ad.leer(obj, k);
  el.value = (v == null) ? '' : String(v);
}

/** items: [{f, c, texto}]. Devuelve el conteo y apila UNA entrada de deshacer
 *  con todos los cambios de la operacion. */
export function escribirCeldas(st, g, items){
  const res = { escritas: 0, salteadas: 0, rechazadas: 0 };
  const ad = st.adaptador;
  if (!ad) { res.salteadas = items.length; return res; }

  const cambios = [];
  for (const it of items){
    const col = g.cols[it.c];
    if (!col){ res.salteadas++; continue; }

    const td = celdaDe(g, it.f, it.c);
    // esRO cubre las celdas sin control editable Y las que tienen uno disabled,
    // que es como Movimientos apaga los campos que no aplican al tipo.
    if (!td || esRO(td)){ res.salteadas++; continue; }

    const obj = ad.objetoDe(it.f);
    if (!obj){ res.salteadas++; continue; }

    const antes = ad.leer(obj, col.k);
    const estado = ad.escribir(obj, col.k, it.texto);

    if (estado === 'ok'){
      res.escritas++;
      // `despues` se lee DESPUES de escribir, asi queda el valor ya normalizado
      // (se pego "3,22" y se guarda 3.22). Lo usa rehacer en la tarea 10.
      cambios.push({ obj, k: col.k, antes, despues: ad.leer(obj, col.k) });
      refrescarCelda(ad, g, it.f, it.c, obj, col.k);
    } else if (estado === 'ro'){
      res.salteadas++;
    } else {
      res.rechazadas++;
    }
  }

  if (cambios.length){
    st.pila.apilar(cambios);
    if (ad.onCambio) ad.onCambio();
  }
  return res;
}

/** Cartel con el resultado. Nada se descarta en silencio: son los datos reales
 *  de la bodega y el usuario tiene que ver que entro y que no. */
export function reportar(st, titulo, res, extra){
  const partes = [`${res.escritas} ${res.escritas === 1 ? 'celda' : 'celdas'}`];
  if (res.salteadas)  partes.push(`${res.salteadas} salteadas (solo lectura)`);
  if (res.rechazadas) partes.push(`${res.rechazadas} rechazadas (valor inválido)`);
  if (extra) partes.push(extra);
  const tipo = res.rechazadas ? 'err'
             : (res.salteadas || extra) ? 'info'
             : 'ok';
  mensaje(st.tabla, `${titulo}: ${partes.join(' · ')}.`, tipo);
}

/* ---------- pegar ---------- */
export function pegar(st, g, texto){
  if (!st.adaptador){
    mensaje(st.tabla, 'Esta tabla es de solo lectura: se puede copiar, no pegar.', 'info');
    return;
  }
  if (!st.sel || !st.activa) return;

  const m = parsearTSV(texto);
  if (!m.length) return;

  const items = [];
  let filasFuera = 0;
  /* Set, no contador: la misma columna sobrante se pisa en cada fila pegada
   * (pegar 3 filas de 2 columnas de mas no son 6 columnas sobrantes, son 2). */
  const colsFueraSet = new Set();

  if (m.length === 1 && m[0].length === 1){
    /* Una sola celda en el portapapeles: rellena todo el rango, como Excel. */
    for (const cel of rectCeldas(st.sel)) items.push({ f: cel.f, c: cel.c, texto: m[0][0] });
  } else {
    /* Varias: se ancla en la celda activa y crece hacia abajo y a la derecha.
     * NUNCA crea filas: crear lotes o analisis por accidente al pegar seria
     * mucho peor que un pegado incompleto. */
    for (let i = 0; i < m.length; i++){
      const f = st.activa.f + i;
      if (f >= g.trs.length){ filasFuera++; continue; }
      for (let j = 0; j < m[i].length; j++){
        const c = st.activa.c + j;
        if (c >= g.cols.length){ colsFueraSet.add(c); continue; }
        items.push({ f, c, texto: m[i][j] });
      }
    }
  }

  const res = escribirCeldas(st, g, items);
  const colsFuera = colsFueraSet.size;

  const avisos = [];
  if (filasFuera) avisos.push(`${filasFuera} ${filasFuera === 1 ? 'fila' : 'filas'} no entraron (la tabla no tiene más filas)`);
  if (colsFuera)  avisos.push(`${colsFuera} ${colsFuera === 1 ? 'columna' : 'columnas'} sobraron a la derecha`);
  reportar(st, 'Pegado', res, avisos.join(' · ') || null);
}

/* ---------- borrar ---------- */
export function borrarRango(st, g){
  if (!st.adaptador || !st.sel) return;
  const items = rectCeldas(st.sel).map(cel => ({ f: cel.f, c: cel.c, texto: '' }));
  const res = escribirCeldas(st, g, items);
  reportar(st, 'Borrado', res);
}

/* ---------- editar en bloque ---------- */
/** Ctrl+Enter: el valor de la celda activa se aplica a todo el rango. */
export function aplicarAlRango(st, g){
  if (!st.adaptador || !st.sel || !st.activa) return;
  const texto = textoDe(celdaDe(g, st.activa.f, st.activa.c));
  const items = [];
  for (const cel of rectCeldas(st.sel)){
    // La celda activa ya tiene el valor: no se reescribe ni se cuenta.
    if (cel.f === st.activa.f && cel.c === st.activa.c) continue;
    items.push({ f: cel.f, c: cel.c, texto });
  }
  const res = escribirCeldas(st, g, items);
  reportar(st, 'Aplicado al rango', res);
}

/** Ctrl+D: la primera fila del rango se copia hacia abajo, columna por columna. */
export function rellenarAbajo(st, g){
  if (!st.adaptador || !st.sel) return;
  if (st.sel.f1 === st.sel.f2){
    mensaje(st.tabla, 'Seleccioná al menos dos filas para rellenar hacia abajo.', 'info');
    return;
  }
  const items = [];
  for (let c = st.sel.c1; c <= st.sel.c2; c++){
    const texto = textoDe(celdaDe(g, st.sel.f1, c));
    for (let f = st.sel.f1 + 1; f <= st.sel.f2; f++) items.push({ f, c, texto });
  }
  const res = escribirCeldas(st, g, items);
  reportar(st, 'Rellenado hacia abajo', res);
}

/* ---------- deshacer / rehacer ----------
 * No pasan por escribirCeldas: escriben el valor CRUDO sin validar (ya se
 * valido cuando se escribio la primera vez) y sin volver a apilar.
 *
 * Los cambios guardan el OBJETO de fila, no su indice, asi que deshacer es
 * correcto aunque entre medio se haya ordenado, filtrado, o la fila haya dejado
 * de estar visible.
 */
function aplicarCambios(st, cambios, usarAntes){
  const ad = st.adaptador;
  if (!ad) return 0;

  const g = geo(st.tabla);
  // Objeto de fila -> indice visible, para refrescar solo lo que se ve.
  const filaDe = new Map();
  for (let f = 0; f < g.trs.length; f++){
    const obj = ad.objetoDe(f);
    if (obj) filaDe.set(obj, f);
  }
  const colDe = new Map();
  g.cols.forEach((col, c) => colDe.set(col.k, c));

  let n = 0;
  for (const cb of cambios){
    ad.escribirCrudo(cb.obj, cb.k, usarAntes ? cb.antes : cb.despues);
    n++;
    const f = filaDe.get(cb.obj), c = colDe.get(cb.k);
    if (f !== undefined && c !== undefined) refrescarCelda(ad, g, f, c, cb.obj, cb.k);
  }
  if (n && ad.onCambio) ad.onCambio();
  return n;
}

export function deshacer(st){
  if (!st.adaptador) return;
  const cambios = st.pila.deshacer();
  if (!cambios){ mensaje(st.tabla, 'No hay nada para deshacer.', 'info'); return; }
  const n = aplicarCambios(st, cambios, true);
  mensaje(st.tabla, `Deshecho: ${n} ${n === 1 ? 'celda' : 'celdas'}.`, 'ok');
}

export function rehacer(st){
  if (!st.adaptador) return;
  const cambios = st.pila.rehacer();
  if (!cambios){ mensaje(st.tabla, 'No hay nada para rehacer.', 'info'); return; }
  const n = aplicarCambios(st, cambios, false);
  mensaje(st.tabla, `Rehecho: ${n} ${n === 1 ? 'celda' : 'celdas'}.`, 'ok');
}

/** Descarta las pilas de TODAS las tablas. Se llama cuando los datos se
 *  recargan del servidor: ahi los objetos son otros y restaurar sobre ellos
 *  escribiria en el lugar equivocado. */
export function limpiarPilas(){
  for (const st of _estados.values()) st.pila.limpiar();
}

/* ---------- cableado global del pegado ----------
 * Va por el evento `paste` y NO por keydown de Ctrl+V: clipboardData solo esta
 * disponible dentro de este evento, y es lo que funciona sobre http plano.
 * navigator.clipboard.readText() fallaria igual que el copiado.
 */
let _pegadoCableado = false;

function cablearPegado(){
  if (_pegadoCableado) return;
  _pegadoCableado = true;

  document.addEventListener('paste', e => {
    for (const st of _estados.values()){
      if (!st.tabla || !st.tabla.isConnected) continue;
      if (!tablaVisible(st.tabla)) continue;
      /* Si se esta editando una celda, el pegado es del input: no se toca. */
      if (st.editando) continue;
      if (!st.sel) continue;
      const texto = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
      if (!texto) return;
      e.preventDefault();
      pegar(st, geo(st.tabla), texto);
      return;
    }
  });
}

/* ---------- API publica ---------- */
export function activarGrilla(tabla, adaptador){
  if (!tabla) return;
  if (!tabla.id){ console.warn('grilla: la tabla necesita un id'); return; }

  let st = _estados.get(tabla.id);
  if (!st){ st = nuevoEstado(tabla.id); _estados.set(tabla.id, st); }
  st.tabla = tabla;
  if (adaptador !== undefined) st.adaptador = adaptador;

  inyectarGutter(tabla);
  const g = geo(tabla);   // despues del gutter: los cellIndex ya estan corridos
  restaurarSeleccion(st, g);

  /* Cableado por ELEMENTO: en las vistas que recrean el <table> es un elemento
     nuevo y se cablea de cero, que es lo correcto; en Lotes, que lo reusa, esto
     evita acumular listeners. Mismo patron que el _wired de las vistas. */
  if (!tabla._gcableada){
    tabla._gcableada = true;
    cablearMouse(tabla, st);
  }
  /* Cableados GLOBALES: idempotentes, uno para todas las tablas. Lo que va en
     document tiene que ir aca y no en cablearMouse, o cada re-render suma otro. */
  cablearFinArrastre();
  cablearTeclado();   // global e idempotente
  cablearPegado();    // global e idempotente

  pintar(st, g);
}

/** Suelta la seleccion de una tabla y la despinta.
 *
 * Hace falta ANTES de abrir un overlay o modal desde una tabla con grilla. El
 * keydown de la grilla escucha en fase de CAPTURA y, si hay seleccion, consume
 * el Escape con stopImmediatePropagation (ver el comentario de cablearTeclado
 * mas arriba): el handler global de app.js que cierra el overlay nunca correria
 * y el modal quedaria trabado. Con la seleccion soltada, la grilla hace
 * `continue` y la tecla llega a destino.
 *
 * Semanticamente es lo correcto ademas: abrir un modal deberia soltar la
 * seleccion de la tabla de atras.
 */
export function limpiarSeleccion(tabla){
  if (!tabla || !tabla.id) return;
  const st = _estados.get(tabla.id);
  if (!st || !st.sel) return;
  st.sel = null;
  st.activa = null;
  st.editando = false;
  pintar(st, geo(tabla));
}
