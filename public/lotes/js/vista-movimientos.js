/* ===== Lotes CIW — pestana Movimientos ===== */
'use strict';

import { $, esc, escA, num, DATOS, markDirty, guardar, mostrarTab, registrarVista,
         usuarioActual, irALote, mostrarOverlay, cerrarOverlay } from './nucleo.js';
import { toggleSort, sortRows, opcionesValores, matchValor,
         initFiltrosMulti, pasaMulti, limpiarFiltrosMulti } from './tabla.js';
import { activarGrilla, adaptadorCols, repintarGrilla } from './grilla.js';
import { montarVirtual, soltarVirtual } from './tabla-virtual.js';
import { anchoDeTexto } from './anchos-cols.js';
import { esEjecutado, PENDIENTE, EJECUTADO, proximoNumeroOT } from './ot-movimientos.js';
import { fmtFecha } from './fechas.js';
import { abrirEmitirOT } from './vista-ot-emitir.js';
import { abrirConfirmarOT } from './vista-ot-confirmar.js';
import { otDeMovimiento, eliminarOT } from './ot-armado.js';
import { renderOrdenesTrabajo, elegirOT } from './vista-ot-lista.js';
import { renderMermas } from './vista-mermas.js';
import { planDeshacer, aplicarDeshacer } from './ot-deshacer.js';
import { resumenEnvases } from './envases.js';
import { visible } from './selector-anios.js';

/* --- tipos validos --- */
const TIPOS_MOV = ['descube', 'trasiego', 'relleno', 'traspaso', 'renombre', 'salida'];

/* Columnas de la tabla, en orden de presentacion. Antes vivian sueltas en los
 * <th> del HTML y el tipo de cada campo estaba metido en los helpers de celda.
 * La grilla necesita el descriptor para saber que es numerico, que es una lista
 * y que es de solo lectura. D2 lo reusa para armar los filtros.
 */
export const COLS_MOV = [
  { k:'lote',            label:'Lote',            num:true, ro:true },
  { k:'fecha',           label:'Fecha'            },
  { k:'tipo',            label:'Tipo',            sel:TIPOS_MOV },
  { k:'vasija_origen',   label:'Vasija origen'    },
  { k:'vasija_destino',  label:'Vasija destino'   },
  { k:'litros',          label:'Litros',          num:true },
  { k:'lote_destino',    label:'Lote destino'     },
  { k:'destino_externo', label:'Destino externo'  },
  { k:'estado',          label:'Estado',          ro:true },
  { k:'ot',              label:'OT'               },
  { k:'operario',        label:'Operario'         },
  { k:'comentario',      label:'Comentario'       },
];

/* Que campos se habilitan por tipo.
 * Solo los campos cuyo significado depende del tipo van aca.
 * ot, operario y comentario NO van en esta tabla: son metadatos
 * generales que aplican a cualquier movimiento (ot en particular
 * es el gancho documentado con el subsistema C de ordenes de trabajo).
 * Si los pones aca quedan disabled en los tipos que no los listen. */
const CAMPOS_POR_TIPO = {
  descube:  { vasija_origen:true, vasija_destino:true, litros:true },
  trasiego: { vasija_origen:true, vasija_destino:true, litros:true },
  relleno:  { vasija_destino:true, litros:true },
  traspaso: { lote_destino:true, litros:true },
  renombre: { lote_destino:true, litros:true },
  salida:   { destino_externo:true, litros:true },
};

/* Campos que siempre estan habilitados sin importar el tipo.
 * Metadatos generales: aplican a cualquier movimiento. */
const CAMPOS_SIEMPRE_HAB = new Set(['ot', 'operario', 'comentario']);

/* --- sort / filtros --- */
let sortMov = { key: 'fecha', dir: -1 };

const CAMPOS_FLT_MOV = [
  { campo: 'tipo',      label: 'Tipo'      },
  { campo: 'estado',    label: 'Estado'    },
  { campo: '_variedad', label: 'Variedad'  },
  { campo: '_proyecto', label: 'Proyecto'  },
  { campo: '_mes',      label: 'Mes'       },
];
const filtMov = {};
CAMPOS_FLT_MOV.forEach(c => filtMov[c.campo] = new Set());

let _descMov = [], _instMov = [];
let _movFiltBusca = '';

/* Sub-pestaña: 'historial' (la tabla de movimientos), 'ordenes' (lista de OT
 * con la hoja editable, vista-ot-lista.js) o 'mermas' (barricas mermas
 * pendientes, vista-mermas.js). Solo en memoria. */
let _sub = 'historial';

function _selectorSub(){
  const b = (k, txt) => `<button type="button" data-sub="${k}" role="radio" aria-checked="${_sub === k}"` +
    `${_sub === k ? ' class="on"' : ''}>${txt}</button>`;
  return `<div class="mov-sub" role="radiogroup" aria-label="Vista de Movimientos">` +
    b('historial', '📋 Historial') + b('ordenes', '📝 Órdenes de trabajo') + b('mermas', '🛢 Mermas') + '</div>';
}

function _cablearSelector(sec){
  sec.querySelector('.mov-sub').addEventListener('click', e => {
    const b = e.target.closest('[data-sub]');
    if (!b || b.dataset.sub === _sub) return;
    _sub = b.dataset.sub;
    renderMovimientos();
  });
}

/* Abre una OT en la sub-pestaña Órdenes de trabajo. */
export function verOrdenTrabajo(id){
  _sub = 'ordenes';
  elegirOT(id);
  renderMovimientos();
}

/* Al emitir (formulario o asistente del Corte) se abre la hoja de la OT nueva
 * para ajustar los pasos antes de imprimir. */
function _alEmitir(ot){
  if (ot && ot.id) verOrdenTrabajo(ot.id); else renderMovimientos();
}

/* Un movimiento se ve si su lote o su lote_destino se ve: un traspaso
 * 25xxx -> 26xxx aparece en los dos años prendidos. */
const _movVisible = m => visible(m.lote) || (!!m.lote_destino && visible(m.lote_destino));

/* --- construir mapa lote -> {variedad, proyecto} --- */
function _buildLoteMap(){
  const m = new Map();
  for (const l of (DATOS().lotes || [])){
    m.set(String(l.lote ?? ''), {
      variedad: l.variedad || '', proyecto: l.proyecto || '',
      // La hoja lo usa de fallback para el "DESDE": traspaso, renombre y salida
      // no tienen vasija_origen en CAMPOS_POR_TIPO, pero el operario igual
      // necesita saber de que tanque sacar.
      vasija_actual: l.vasija_actual || '',
    });
  }
  return m;
}

/* --- enriquecer movimiento con campos derivados para filtro/sort ---
 * Crea un objeto plano que copia todas las props del movimiento mas
 * _variedad, _proyecto, _mes; y guarda referencia al original en ._orig.
 */
function _enrich(movs, loteMap){
  return movs.map(m => {
    const info = loteMap.get(String(m.lote ?? '')) || { variedad:'', proyecto:'', vasija_actual:'' };
    return {
      ...m,
      _variedad: info.variedad,
      _proyecto: info.proyecto,
      _mes: (m.fecha || '').slice(0, 7),
      // `estado` esta AUSENTE en los 338 historicos: normalizar aca para que el
      // filtro no ofrezca un "(vacio)" con todo adentro, y para que sortRows
      // pueda ordenar por esta columna (dataset.k = 'estado') con valores reales
      // en los dos sentidos. Es seguro porque _enrich devuelve una copia ({...m})
      // y todos los caminos de escritura operan sobre ._orig, nunca sobre la copia.
      estado: esEjecutado(m) ? EJECUTADO : PENDIENTE,
      _orig: m,
    };
  });
}

function initFiltrosMov(){
  _descMov = CAMPOS_FLT_MOV.map(c => ({
    label:    c.label,
    set:      filtMov[c.campo],
    opciones: () => opcionesValores(
      _enrich((DATOS().movimientos || []).filter(_movVisible), _buildLoteMap()),
      r => r[c.campo]
    ),
    match:    matchValor(r => r[c.campo]),
  }));
  _instMov = initFiltrosMulti('fltMovBar', _descMov, renderMovimientos);
}

/* Borrar una OT que ya se aplico a los lotes. Muestra que vuelve a como
 * estaba y que no (los lotes que alguien cambio despues no se tocan) y deja
 * elegir: borrar y deshacer, o solo borrar la OT. */
function _abrirBorrarOTAplicada(ot, plan){
  const env = f => f ? (resumenEnvases(f) || '—') + ' · ' + esc(f.litros_actuales ?? 0) + ' L' +
    (f.vasija_actual ? ' · ' + esc(f.vasija_actual) : '') : '—';
  const filas = plan.items.map(it => `<tr><td><b>${esc(it.lote)}</b></td><td>${env(it.ahora)}</td>
    <td>${it.accion === 'volver' ? '→ ' + env(it.antes)
      : it.porCorte ? '<span class="otc-aviso">⚠ no se toca: el corte se deshace entero o nada</span>'
      : it.accion === 'cambiado' ? '<span class="otc-aviso">⚠ se cambió después de la OT: no se toca</span>'
      : '<span class="otc-aviso">⚠ el lote ya no existe</span>'}</td></tr>`).join('');
  /* planDeshacer ya bajo todos los lotes del corte a "no se toca" (ver
   * ot-deshacer.js): devolver solo una parte contaria el vino dos veces. Se
   * explica y se apaga "Borrar y deshacer", que no tendria nada que hacer. */
  const avisoCorte = plan.corteParcial
    ? `<div class="msg err" style="margin-top:10px">Esta OT es un corte y algún lote se cambió (o se borró) después de aplicarla. Un corte se deshace entero o nada: volver solo una parte contaría el vino dos veces. No se puede deshacer automáticamente; corregí los lotes a mano.</div>` : '';
  const nm = plan.mermasBorrar.length, nr = plan.mermasReabrir.length;
  const mermas = (nm || nr) ? `<p style="margin:10px 0 0;font-size:13px;color:var(--muted)">${
    nm ? (nm === 1 ? 'Se borra 1 barrica merma que creó esta OT. ' : `Se borran ${nm} barricas merma que creó esta OT. `) : ''}${
    nr ? (nr === 1 ? 'Se reabre 1 merma que esta OT había cerrado al vaciarla.' : `Se reabren ${nr} mermas que esta OT había cerrado al vaciarlas.`) : ''}</p>` : '';
  const corte = ot.lote_corte && ot.lote_corte.lote
    ? `<p style="margin:10px 0 0;font-size:13px;color:var(--muted)">El lote ${esc(ot.lote_corte.lote)} que creó el corte NO se borra.</p>` : '';
  mostrarOverlay(`<div id="otbRaiz">
<h3 style="margin:0 0 4px">🗑 Borrar ${esc(ot.ot)}</h3>
<p style="margin:0 0 12px;color:var(--muted);font-size:13px">Esta OT ya se aplicó a los lotes. Podés volverlos a como estaban antes de la OT.</p>
<div class="otc-scroll"><table class="otc-tabla"><thead><tr><th>Lote</th><th>Ahora</th><th>Vuelve a</th></tr></thead>
<tbody>${filas}</tbody></table></div>${mermas}${corte}${avisoCorte}
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
  <button class="btn" id="otbCancelar">Cancelar</button>
  <button class="btn danger" id="otbSolo">Solo borrar la OT</button>
  <button class="btn primary" id="otbDeshacer"${plan.corteParcial ? ' disabled title="Un corte se deshace entero o nada"' : ''}>Borrar y deshacer</button>
</div></div>`);
  /* La OT y el plan se vuelven a buscar al hacer clic, en el DATOS() de ese
   * momento: si entre que se abrio esto y el clic termino un guardado con
   * fusion (409), `ot` es un huerfano (eliminarOT no lo encontraria y borraria
   * los movimientos pero dejaria la OT) y el plan juzgo lotes que ya son otros. */
  const vigente = () => (DATOS().ordenes_trabajo || []).find(o => o.id === ot.id) || null;
  const fin = otV => { eliminarOT(DATOS(), otV); markDirty(); cerrarOverlay(); renderMovimientos(); };
  const sinOT = () => { cerrarOverlay(); alert('La ' + ot.ot + ' ya no está en los datos actuales (¿la borraron desde otra PC?). No se cambió nada.'); renderMovimientos(); };
  $('otbCancelar').addEventListener('click', () => cerrarOverlay());
  $('otbSolo').addEventListener('click', () => {
    if (!confirm('Los lotes quedan como los dejó la OT. ¿Borrar solo la OT?')) return;
    const otV = vigente();
    if (!otV) return sinOT();
    fin(otV);
  });
  $('otbDeshacer').addEventListener('click', () => {
    const otV = vigente();
    if (!otV) return sinOT();
    const nuevo = planDeshacer(DATOS(), otV);
    const firma = p => p.items.map(it => it.lote + ':' + it.accion).join('|') + '|' + p.corteParcial;
    if (firma(nuevo) !== firma(plan)){
      // Lo que se mostro ya no es lo que pasaria: se vuelve a mostrar.
      alert('Los lotes de esta OT cambiaron mientras mirabas esta ventana. Revisá de nuevo qué vuelve atrás.');
      _abrirBorrarOTAplicada(otV, nuevo);
      return;
    }
    aplicarDeshacer(DATOS(), nuevo);
    fin(otV);
  });
}

/* Posicion en DATOS().movimientos del movimiento `m`, o -1.
 *
 * Despues de un 409, nucleo.guardar() fusiona y REEMPLAZA todos los objetos de
 * DATOS(): una fila pintada o un modal abierto antes de eso tienen un
 * huerfano. Si `m` sigue en el array es el; si no, se busca por id (los
 * movimientos cargados por la app lo tienen; los 338 historicos no, y esos no
 * se pueden identificar con seguridad). */
function _idxMovVivo(m){
  const movs = DATOS().movimientos || [];
  const i = movs.indexOf(m);
  if (i !== -1) return i;
  return (m && m.id) ? movs.findIndex(x => x.id === m.id) : -1;
}

/* --- renderMovimientos --- */
/* opciones.conservarScroll: repintar sin volver arriba de todo, para los
 * repintados que no cambian QUE movimientos se muestran (una edicion en la
 * grilla, un cambio de tipo, borrar uno, volver a la pestaña). Los filtros y el
 * orden no lo pasan. Se compara con === true porque renderMovimientos tambien
 * se usa como callback. */
export function renderMovimientos(opciones){
  /* garantizar que la seccion movimientos existe en los datos */
  if (!DATOS().movimientos) DATOS().movimientos = [];

  const sec = $('tab-movimientos'); if (!sec) return;
  const tPrevio = $('tMov');   // la tabla del historial, no la de otra sub-pestaña
  const contPrevio = tPrevio ? tPrevio.closest('.scroll') : null;
  const scrollPrevio = (opciones && opciones.conservarScroll === true && contPrevio) ? contPrevio.scrollTop : 0;
  /* El buscador se rehace con la seccion: si tenia el foco se le devuelve al
   * final, con el cursor donde estaba. Antes cada letra te sacaba del campo. */
  const buscaPrevio = $('buscaMov');
  const focoEnBusca = !!buscaPrevio && document.activeElement === buscaPrevio;
  const buscaCaret = focoEnBusca ? buscaPrevio.selectionStart : null;

  if (_sub === 'mermas'){
    sec.innerHTML = _selectorSub() + '<div id="movMermas"></div>';
    _cablearSelector(sec);
    renderMermas($('movMermas'), { onCambio: renderMovimientos });
    return;
  }

  if (_sub === 'ordenes'){
    // #otMovHoja tiene que existir: imprimirOT pinta ahi y el @media print de
    // printing-ot-mov muestra solo ese hijo de #tab-movimientos.
    sec.innerHTML = _selectorSub() + '<div id="movOrdenes"></div><div id="otMovHoja" style="display:none"></div>';
    _cablearSelector(sec);
    renderOrdenesTrabajo($('movOrdenes'), {
      onEmitir: () => abrirEmitirOT(_alEmitir),
      onCambio: renderMovimientos,
    });
    return;
  }

  const loteMap = _buildLoteMap();
  const allMovEnrich = _enrich(DATOS().movimientos, loteMap);

  /* filtrar */
  let rows = allMovEnrich.filter(_movVisible);
  if (_movFiltBusca){
    const q = _movFiltBusca.toLowerCase();
    rows = rows.filter(m => String(m.lote ?? '').toLowerCase().includes(q));
  }
  rows = rows.filter(m => pasaMulti(m, _descMov));

  /* ordenar */
  rows = sortRows(rows, sortMov);

  /* opciones de destino externo */
  const destExt = (DATOS().config && DATOS().config.destinos_externos) || [];

  /* --- HTML de controles y tabla --- */
  const html = `${_selectorSub()}
<div class="toolbar" id="movToolbar">
  <input class="txt" id="buscaMov" placeholder="🔎 Buscar por lote…" style="min-width:160px" value="${escA(_movFiltBusca)}">
  <div class="mfilt-bar" id="fltMovBar"></div>
  <button class="btn" id="btnLimpiarFltMov">🧹 Limpiar filtros</button>
  <span class="tag" id="movCount"></span>
  <div class="spacer"></div>
  <button class="btn" id="btnAddMov">Registrar movimiento hecho</button>
</div>
<div class="scroll tall">
<table id="tMov">
<thead><tr>
  <th data-k="lote" class="num">Lote</th>
  <th data-k="fecha">Fecha</th>
  <th data-k="tipo">Tipo</th>
  <th data-k="vasija_origen">Vasija origen</th>
  <th data-k="vasija_destino">Vasija destino</th>
  <th data-k="litros" class="num">Litros</th>
  <th data-k="lote_destino">Lote destino</th>
  <th data-k="destino_externo">Destino externo</th>
  <th data-k="estado">Estado</th>
  <th data-k="ot">OT</th>
  <th data-k="operario">Operario</th>
  <th data-k="comentario">Comentario</th>
  <th></th>
</tr></thead>
<tbody id="tMovBody"></tbody>
</table>
</div>
<!-- hoja de la OT: oculta en pantalla, unica seccion visible al imprimir -->
<div id="otMovHoja" style="display:none"></div>`;

  sec.innerHTML = html;
  _cablearSelector(sec);

  const t = $('tMov');

  /* _rows apunta a los objetos ORIGINALES en DATOS().movimientos */
  t._rows = rows.map(r => r._orig);

  /* flechas de orden */
  t.querySelectorAll('th[data-k]').forEach(th => {
    const k = th.dataset.k;
    if (sortMov.key === k) th.innerHTML += `<span class="arrow">${sortMov.dir > 0 ? '▲' : '▼'}</span>`;
    th.onclick = () => { toggleSort(sortMov, k); renderMovimientos(); };
  });

  /* --- helpers de celda --- */
  const DIS_STY = 'background:var(--panel2);color:var(--muted)';

  function habilitado(tipo, campo){
    if (CAMPOS_SIEMPRE_HAB.has(campo)) return true;
    return !!(CAMPOS_POR_TIPO[tipo] || {})[campo];
  }

  /* El estado no es editable: se muestra como chip. Un pendiente se ve de
   * lejos porque significa "esto todavia no paso en la bodega". */
  function cellEstado(mov){
    return esEjecutado(mov)
      ? `<span class="tag">ejecutado</span>`
      : `<span class="tag mov-pendiente">● PENDIENTE</span>`;
  }

  function cellInput(tipo, campo, val, ri, esNum){
    const ok  = habilitado(tipo, campo);
    const dis = ok ? '' : ' disabled';
    const sty = ok ? '' : ` style="${DIS_STY}"`;
    const cls = `cell${esNum ? ' num' : ''}`;
    const v   = escA(val != null && val !== '' ? val : '');
    if (esNum)
      return `<input class="${cls}" type="number" step="any" data-row="${ri}" data-k="${escA(campo)}" value="${v}"${dis}${sty}>`;
    return `<input class="${cls}" type="text" data-row="${ri}" data-k="${escA(campo)}" value="${v}"${dis}${sty}>`;
  }

  function cellDate(campo, val, ri){
    const v = escA(val || '');
    return `<input class="cell" type="date" data-row="${ri}" data-k="${escA(campo)}" value="${v}">`;
  }

  function cellTipoSelect(tipo, ri){
    const opts = TIPOS_MOV.map(tp =>
      `<option value="${escA(tp)}"${tp === tipo ? ' selected' : ''}>${esc(tp)}</option>`
    ).join('');
    return `<select class="cell" data-row="${ri}" data-k="tipo">${opts}</select>`;
  }

  function cellDestinoExterno(tipo, val, ri){
    const ok  = habilitado(tipo, 'destino_externo');
    const dis = ok ? '' : ' disabled';
    const sty = ok ? '' : ` style="${DIS_STY}"`;
    const optsHtml = `<option value=""></option>` +
      destExt.map(d => `<option value="${escA(d)}"${d === (val||'') ? ' selected' : ''}>${esc(d)}</option>`).join('');
    return `<select class="cell" data-row="${ri}" data-k="destino_externo"${dis}${sty}>${optsHtml}</select>`;
  }

  function cellLoteDestino(tipo, val, ri){
    const ok  = habilitado(tipo, 'lote_destino');
    const dis = ok ? '' : ' disabled';
    const sty = ok ? '' : ` style="${DIS_STY}"`;
    const v   = escA(val || '');
    return `<input class="cell" type="text" data-row="${ri}" data-k="lote_destino" value="${v}"${dis}${sty}>`;
  }

  function cellAcciones(o, ri){
    const btnConfirmar = esEjecutado(o) ? '' : `<button class="rowbtn" data-confirmar="${ri}" title="Confirmar que el trabajo se hizo">✓</button>`;
    const btnImprimir  = String(o.ot || '').trim()
      ? `<button class="rowbtn" data-imprimirot="${ri}" title="Ver e imprimir la hoja de esta OT">🖨️</button>`
      : '';
    const btnBorrar    = `<button class="rowbtn" data-del="${ri}" title="Eliminar movimiento">✕</button>`;
    return btnConfirmar + btnImprimir + btnBorrar;
  }

  /* --- filas ---
   * Tabla virtual (tabla-virtual.js): se dibujan las que se ven, a medida que
   * se scrollea. Cada fila sale del movimiento VIVO (t._rows), asi que una que
   * vuelve a la vista muestra lo ultimo que se tipeo. */
  const celdasFila = (o, ri, acciones) => {
    const tipo    = o.tipo || 'trasiego';
    const at      = k => `data-row="${ri}" data-k="${k}"`;
    return `<td class="num" ${at('lote')}><button class="alarm-lote-link" data-iralote="${escA(o.lote ?? '')}">${esc(o.lote ?? '')}</button></td>
  <td ${at('fecha')}>${cellDate('fecha', o.fecha, ri)}</td>
  <td ${at('tipo')}>${cellTipoSelect(tipo, ri)}</td>
  <td ${at('vasija_origen')}>${cellInput(tipo, 'vasija_origen',   o.vasija_origen,   ri, false)}</td>
  <td ${at('vasija_destino')}>${cellInput(tipo, 'vasija_destino',  o.vasija_destino,  ri, false)}</td>
  <td ${at('litros')}>${cellInput(tipo, 'litros',          o.litros,          ri, true)}</td>
  <td ${at('lote_destino')}>${cellLoteDestino(tipo, o.lote_destino, ri)}</td>
  <td ${at('destino_externo')}>${cellDestinoExterno(tipo, o.destino_externo, ri)}</td>
  <td>${cellEstado(o)}</td>
  <td ${at('ot')}>${cellInput(tipo, 'ot',        o.ot,        ri, false)}</td>
  <td ${at('operario')}>${cellInput(tipo, 'operario',  o.operario,  ri, false)}</td>
  <td ${at('comentario')}>${cellInput(tipo, 'comentario',o.comentario,ri, false)}</td>
  <td>${acciones}</td>`;
  };
  const htmlFila = ri => {
    const o = t._rows[ri];
    return `<tr data-f="${ri}"${esEjecutado(o) ? '' : ' class="fila-pendiente"'}><td class="ggutter">${ri + 1}</td>`
         + celdasFila(o, ri, cellAcciones(o, ri)) + '</tr>';
  };

  if (!t._rows.length){
    soltarVirtual(t);
    $('tMovBody').innerHTML =
      '<tr><td colspan="13" style="color:var(--muted)">Sin movimientos con los filtros actuales.</td></tr>';
  } else {
    /* Fila invisible con la celda mas ancha de cada columna (ver _filaMedidora
     * en vista-analisis.js). En las editables el ancho no depende del valor;
     * los que cambian son el lote, el chip de estado (PENDIENTE es mas ancho
     * que ejecutado) y los botones de la ultima columna, que van los tres. */
    let loteAncho = '', w = -1;
    for (const o of t._rows){
      const txt = String(o.lote ?? '');
      const a = txt ? anchoDeTexto(txt, false) : 0;
      if (a > w){ w = a; loteAncho = txt; }
    }
    const muestra = { ...t._rows[0], lote: loteAncho, estado: PENDIENTE, ot: 'x' };
    const acciones = ['✓', '🖨️', '✕'].map(x => `<button class="rowbtn" tabindex="-1">${x}</button>`).join('');
    const medidora = `<tr><td class="ggutter">${t._rows.length}</td>`
      + celdasFila(muestra, -1, acciones).replace(/<(input|select|button)/g, '<$1 tabindex="-1"') + '</tr>';
    const pie = t.createTFoot();
    pie.className = 'vmedidor';
    pie.setAttribute('aria-hidden', 'true');
    pie.innerHTML = medidora;

    t._virtual = montarVirtual({
      tabla: t,
      n: t._rows.length,
      /* El pendiente lleva fondo pero no cambia el alto; igual va como tipo
       * aparte por si algun dia lo cambia. */
      tipoDe: ri => esEjecutado(t._rows[ri]) ? 'hecho' : 'pendiente',
      html: htmlFila,
      columnas: 1 + 13,
      alPintar: () => repintarGrilla(t),
      scrollInicial: scrollPrevio,
    });
  }

  $('movCount').textContent = rows.length + ' / ' + (DATOS().movimientos || []).filter(_movVisible).length + ' movimientos';

  /* --- listeners delegados (idempotente con t._wired) ---
   * La tabla se destruye y recrea en cada render (sec.innerHTML = html), por lo
   * que t es un elemento nuevo y t._wired es undefined al llegar aca. Al salir del
   * bloque queda marcado en true: si renderMovimientos se llama otra vez antes de
   * que sec.innerHTML cambie (cosa que no ocurre en este flujo), no re-attaches.
   */
  if (!t._wired){
    t._wired = true;

    /* cambio de tipo (select) y destino externo (select) */
    t.addEventListener('change', e => {
      const el = e.target.closest('select.cell'); if (!el) return;
      const o  = t._rows[+el.dataset.row];        if (!o)  return;
      const k  = el.dataset.k;
      const v  = el.value;

      if (k === 'tipo'){
        const tipoViejo = o.tipo || '';
        const tipoNuevo = v;
        o.tipo = tipoNuevo;
        /* limpiar campos que quedan deshabilitados al cambiar tipo */
        const habViejo = CAMPOS_POR_TIPO[tipoViejo] || {};
        const habNuevo = CAMPOS_POR_TIPO[tipoNuevo] || {};
        if (habViejo.vasija_origen   && !habNuevo.vasija_origen)   o.vasija_origen   = '';
        if (habViejo.vasija_destino  && !habNuevo.vasija_destino)  o.vasija_destino  = '';
        if (habViejo.lote_destino    && !habNuevo.lote_destino)    o.lote_destino    = '';
        if (habViejo.destino_externo && !habNuevo.destino_externo) o.destino_externo = '';
        markDirty();
        renderMovimientos({ conservarScroll: true });
      } else {
        o[k] = v;
        markDirty();
      }
    });

    /* edicion en inputs de texto/numero/fecha */
    t.addEventListener('input', e => {
      const el = e.target.closest('input.cell'); if (!el) return;
      const o  = t._rows[+el.dataset.row];       if (!o)  return;
      const k  = el.dataset.k;
      const v  = el.value;

      if (k === 'fecha'){
        o.fecha  = v === '' ? null : v;
      } else if (k === 'litros'){
        o.litros = v === '' ? null : num(v);
      } else {
        o[k] = v;
      }
      markDirty();
    });

    /* confirmar OT y borrar fila e ir a lote */
    t.addEventListener('click', e => {
      const bConf = e.target.closest('[data-confirmar]');
      if (bConf){
        const fila = t._rows[+bConf.dataset.confirmar];
        if (!fila) return;
        // Un movimiento que salió de una OT de trasiego se confirma con la OT
        // entera (todos sus lotes a la vez); uno suelto, con el modal de siempre.
        const ot = otDeMovimiento(DATOS().ordenes_trabajo, fila);
        if (ot) abrirConfirmarOT(ot, renderMovimientos); else _abrirModalOT(fila);
        return;
      }
      const bImp = e.target.closest('[data-imprimirot]');
      if (bImp){
        const fila = t._rows[+bImp.dataset.imprimirot];
        if (!fila) return;
        // Las OT anteriores a las plantillas no tienen entrada en
        // ordenes_trabajo: siguen saliendo con la hoja genérica.
        const ot = otDeMovimiento(DATOS().ordenes_trabajo, fila);
        if (ot) verOrdenTrabajo(ot.id); else _imprimirOT(fila);
        return;
      }
      const b = e.target.closest('[data-del]');
      if (b){
        const o = t._rows[+b.dataset.del]; if (!o) return;
        // Una fila de una OT se lleva la OT entera con todas sus filas: si no,
        // la OT queda en «Órdenes de trabajo» sin movimientos detrás.
        const ot = otDeMovimiento(DATOS().ordenes_trabajo, o);
        if (ot){
          // Una OT ya aplicada cambio envases y litros: ofrecer volverlos atras.
          const plan = planDeshacer(DATOS(), ot);
          if (plan.aplicada){ _abrirBorrarOTAplicada(ot, plan); return; }
          const n = (ot.lotes || []).length;
          const corte = ot.lote_corte && ot.lote_corte.lote
            ? '\n\nEl lote ' + ot.lote_corte.lote + ' que creó el corte NO se borra.' : '';
          if (confirm('Esta fila es de la ' + ot.ot + ' (' + n + (n === 1 ? ' lote' : ' lotes') + ').\n'
              + '¿Eliminar la OT completa con ' + (n === 1 ? 'su movimiento' : 'sus ' + n + ' movimientos') + '?' + corte)){
            eliminarOT(DATOS(), ot);
            markDirty();
            renderMovimientos({ conservarScroll: true });
          }
          return;
        }
        if (confirm('¿Eliminar el movimiento del lote ' + esc(o.lote || '(sin lote)') + ' (' + esc(o.tipo || '') + ' ' + esc(fmtFecha(o.fecha)) + ')?')){
          const idx = _idxMovVivo(o);
          if (idx === -1){
            alert('No se encontró ese movimiento en los datos actuales (puede que se hayan recargado). No se borró nada.');
            renderMovimientos();
            return;
          }
          DATOS().movimientos.splice(idx, 1);
          markDirty();
          renderMovimientos({ conservarScroll: true });
        }
        return;
      }
      const a = e.target.closest('[data-iralote]');
      if (a){
        if (a.dataset.iralote) irALote(a.dataset.iralote);
      }
    });
  }

  /* --- controles de filtro (re-wired en cada render porque el toolbar se recreo) --- */

  if (_descMov.length === 0){
    /* primera vez: inicializar instancias de filtro multi */
    initFiltrosMov();
  } else {
    /* re-montar los widgets existentes en la nueva barra */
    const bar = $('fltMovBar');
    if (bar){
      bar.innerHTML = '';
      _instMov.forEach(f => { bar.appendChild(f.el); f.rebuild(); });
    }
  }

  $('buscaMov').addEventListener('input', () => {
    _movFiltBusca = $('buscaMov').value.trim();
    renderMovimientos();
  });

  $('btnLimpiarFltMov').addEventListener('click', () => {
    _movFiltBusca = '';
    limpiarFiltrosMulti(_descMov, 'buscaMov', _instMov, renderMovimientos);
  });

  $('btnAddMov').addEventListener('click', () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const nuevo = {
      id: 'mov-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      lote: '', tipo: 'trasiego', fecha: hoy,
      vasija_origen: '', vasija_destino: '', litros: null,
      lote_destino: '', destino_externo: '',
      // El campo es explicito para distinguir "cargado post-C" (con la clave)
      // de "cargado antes de C" (los 338 historicos, sin la clave). Reduce la
      // regla del default a los 338 legacy, que es su unico trabajo real.
      estado: EJECUTADO,
      ot: '', operario: '', comentario: '',
      cargado_por: usuarioActual(), cargado_el: hoy,
    };
    DATOS().movimientos.unshift(nuevo);
    markDirty();
    renderMovimientos();
  });

  // Emitir OT vive solo en la sub-pestaña Órdenes de trabajo. El modal
  // viejo (_abrirModalOT) queda solo para CONFIRMAR movimientos sueltos que no
  // tienen una OT de trasiego detrás.

  /* Grilla tipo planilla, con TRES reglas que solo la vista puede aplicar:
   *
   * 1. destino_externo se valida contra config.destinos_externos, que cambia en
   *    runtime. grilla.js no conoce DATOS(), asi que la validacion va aca.
   * 2. Cambiar el tipo cambia QUE campos aplican, y los que dejan de aplicar
   *    tienen que quedar deshabilitados. Por eso onCambio re-renderiza: sin eso,
   *    pegar un tipo dejaria valores viejos en campos que ya no corresponden.
   *    El re-render no pierde la seleccion, que se restaura por identidad.
   * 3. Cambiar el tipo TAMBIEN tiene que LIMPIAR los campos que dejan de
   *    aplicar, no solo deshabilitarlos. El listener manual del <select> de
   *    tipo ya lo hace; sin este mismo tratamiento aca, pegar/Ctrl+D/Ctrl+Enter
   *    sobre la columna tipo deja el campo viejo con su VALOR, solo oculto tras
   *    el disabled visual. Ese dato residual se guarda igual, y motor_linaje
   *    arma la linea de historial con "de %s" % vasija_origen sin condicionar
   *    por tipo: un movimiento "salida" con vasija_origen residual de un
   *    "trasiego" anterior mostraria una linea de historial enganosa.
   */
  const adBase = adaptadorCols(t, COLS_MOV, null);
  /* Lo que muestra cada celda de un movimiento, para las filas que no estan en
   * el DOM: lo mismo que leeria la grilla del <td> (el .value del control, ya
   * saneado como lo sanea el navegador, o el texto de la celda). */
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const NUMERO = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i;
  const textoMov = (o, k) => {
    if (!o) return '';
    const tipo = o.tipo || 'trasiego';
    switch (k){
      case 'lote':   return String(o.lote ?? '');
      case 'fecha':  return ISO.test(String(o.fecha || '')) ? String(o.fecha) : '';
      case 'tipo':   return TIPOS_MOV.includes(tipo) ? tipo : TIPOS_MOV[0];
      case 'estado': return esEjecutado(o) ? 'ejecutado' : '● PENDIENTE';
      case 'litros': return (o.litros != null && NUMERO.test(String(o.litros))) ? String(o.litros) : '';
      case 'destino_externo': return destExt.includes(o.destino_externo) ? String(o.destino_externo) : '';
      default:       return o[k] != null ? String(o[k]) : '';
    }
  };
  activarGrilla(t, {
    ...adBase,
    virtual: t._rows.length ? {
      total: () => t._rows.length,
      tr: f => t._virtual.trDe(f),
      irA: f => t._virtual.irA(f),
      texto: (f, k) => textoMov(t._rows[f], k),
      esRO: (f, k) => {
        if (k === 'lote' || k === 'estado') return true;
        if (k === 'fecha' || k === 'tipo') return false;
        const o = t._rows[f];
        return !o || !habilitado(o.tipo || 'trasiego', k);
      },
    } : null,
    escribir(obj, k, texto){
      if (k === 'destino_externo'){
        const v = String(texto ?? '').trim();
        if (v === ''){ obj[k] = null; return 'ok'; }
        const lista = (DATOS().config && DATOS().config.destinos_externos) || [];
        const m = lista.find(d => String(d).toLowerCase() === v.toLowerCase());
        if (!m) return 'invalido';
        obj[k] = m;
        return 'ok';
      }
      if (k === 'tipo'){
        /* OJO: Ctrl+Z despues de este cambio restaura tipo a su valor viejo,
         * pero NO restaura los campos que se limpian mas abajo (vasija_origen,
         * etc.): escribirCeldas solo apila el cambio de 'tipo' en si, no sabe
         * que este escribir() muto otros campos por su cuenta. Mismo
         * comportamiento que el <select> manual de mas arriba en este archivo,
         * que tampoco tiene undo para su propia limpieza: no es una regresion
         * de la grilla, es un limite conocido y aceptado del diseño actual. */
        const tipoViejo = obj.tipo || '';
        const estado = adBase.escribir(obj, k, texto);
        if (estado === 'ok'){
          // Misma limpieza que el listener manual del <select>: los campos que
          // estaban habilitados y dejan de estarlo se vacian, no solo se
          // deshabilitan. Sin esto el valor viejo persiste oculto y se guarda,
          // y motor_linaje arma un historial enganoso con datos de otro tipo.
          const tipoNuevo = obj.tipo || '';
          const habViejo = CAMPOS_POR_TIPO[tipoViejo] || {};
          const habNuevo = CAMPOS_POR_TIPO[tipoNuevo] || {};
          if (habViejo.vasija_origen   && !habNuevo.vasija_origen)   obj.vasija_origen   = '';
          if (habViejo.vasija_destino  && !habNuevo.vasija_destino)  obj.vasija_destino  = '';
          if (habViejo.lote_destino    && !habNuevo.lote_destino)    obj.lote_destino    = '';
          if (habViejo.destino_externo && !habNuevo.destino_externo) obj.destino_externo = '';
        }
        return estado;
      }
      return adBase.escribir(obj, k, texto);
    },
    onCambio(){ markDirty(); renderMovimientos({ conservarScroll: true }); },
  });

  if (focoEnBusca){
    const b = $('buscaMov');
    if (b){ b.focus(); if (buscaCaret != null) b.setSelectionRange(buscaCaret, buscaCaret); }
  }
}

/* Hoja de papel de UNA orden de trabajo. Reusa las clases .orden-hoja que
 * dejo el subsistema G (mismo documento de calidad de la empresa), pero el
 * cuerpo es distinto: en vez de una tabla de N lotes, los datos del unico
 * trabajo en grande, porque el operario lee esto de pie en un pasillo.
 *
 * Sin paginado: una OT es un trabajo, es una hoja. */
function _pintarHojaOT(mov){
  const cont = $('otMovHoja');
  if (!cont) return;

  const loteMap = _buildLoteMap();
  const info = loteMap.get(String(mov.lote ?? '')) || { variedad:'', proyecto:'', vasija_actual:'' };
  const fechaTxt = fmtFecha(mov.fecha);

  const dato = (etiqueta, valor) =>
    `<div style="margin-bottom:10px"><span style="font-size:12px;color:#555">${etiqueta}</span><br>` +
    `<span style="font-size:22px;font-weight:700">${esc(valor || '—')}</span></div>`;

  cont.innerHTML = `
<div class="orden-hoja">
  <div class="oh-top"><span class="oh-empresa">CATENA INSTITUTE</span>` +
    `<span>ORDEN DE TRABAJO - RCI 08 - Rev. 02 &nbsp;·&nbsp; Aprobado por: Roy Urvieta &nbsp;·&nbsp; Emisión: 28/01/2013</span></div>
  <div class="oh-titulo">Orden de Trabajo</div>
  <div class="oh-meta"><span><b>N° de OT:</b> ${esc(mov.ot || '')}</span><span><b>Fecha prevista:</b> ${esc(fechaTxt)}</span></div>
  <div class="oh-banda"><span>MOVIMIENTO</span><span>${esc(mov.tipo || '')}</span><span>Bodega</span></div>
  <div class="oh-nota">Anotá los litros reales y cualquier observación al pie. Esta hoja vuelve al escritorio para cargar la confirmación.</div>

  <div style="display:flex;gap:40px;margin:18px 0">
    <div style="flex:1">
      ${dato('LOTE', mov.lote)}
      ${dato('VARIEDAD', info.variedad)}
    </div>
    <div style="flex:1">
      ${dato('DESDE', mov.vasija_origen || info.vasija_actual)}
      ${dato('HACIA', mov.vasija_destino || mov.lote_destino || mov.destino_externo)}
    </div>
    <div style="flex:1">
      ${dato('LITROS PREVISTOS', mov.litros != null ? String(mov.litros) : '')}
    </div>
  </div>

  ${mov.comentario ? `<div class="oh-nota">${esc(mov.comentario)}</div>` : ''}

  <table style="margin-top:10px"><thead><tr>
    <th>Litros reales</th><th>Hora</th><th>Observaciones del operario</th>
  </tr></thead><tbody><tr>
    <td style="height:46px"></td><td></td><td></td>
  </tr></tbody></table>

  <div class="oh-pie">
    <div class="firma"><b>Emitió:</b> &nbsp;&nbsp; Firma:</div>
    <div class="firma"><b>Recibió:</b> &nbsp;&nbsp; Firma:</div>
  </div>
</div>`;
}

/* Misma convencion que la bitacora de SO2 y la orden de muestras: una clase en
 * el body mientras dura la impresion, y el @media print se encarga del resto. */
function _imprimirOT(mov){
  _pintarHojaOT(mov);
  document.body.classList.add('printing-ot-mov');
  window.print();
  document.body.classList.remove('printing-ot-mov');
}

/* Formulario de la orden de trabajo. Un solo modal para los dos modos:
 * con `mov` en null emite una OT nueva (movimiento pendiente); con un
 * movimiento pendiente adentro, la Tarea 6 lo reusa para confirmarlo.
 *
 * Los campos que se muestran salen de CAMPOS_POR_TIPO, la misma tabla que
 * gobierna que celdas se habilitan en la grilla: si un relleno no tiene vasija
 * origen alla, tampoco la tiene aca. */
function _abrirModalOT(mov){
  const esNuevo = !mov;
  const hoy = new Date().toISOString().slice(0, 10);
  const anio = Number(hoy.slice(0, 4));
  const base = mov || {
    lote: '', tipo: 'trasiego', fecha: hoy,
    vasija_origen: '', vasija_destino: '', litros: null,
    lote_destino: '', destino_externo: '', comentario: '',
    ot: proximoNumeroOT(DATOS().movimientos || [], anio, DATOS().ordenes_trabajo || []),
  };

  const tipoOpts = TIPOS_MOV.map(tp =>
    `<option value="${escA(tp)}"${tp === base.tipo ? ' selected' : ''}>${esc(tp)}</option>`
  ).join('');

  /* El campo Operario solo aparece en modo confirmacion: al emitir la OT no se
   * sabe quien la va a ejecutar; al confirmar, el usuario registra quien la hizo. */
  const camposConfirmacion = esNuevo ? '' : `
  <label>Operario</label>
  <input class="txt" id="otfOperario" value="${escA(base.operario || '')}" placeholder="Quién lo hizo…">`;

  mostrarOverlay(`
<h3 style="margin:0 0 14px">${esNuevo ? '➕ Emitir orden de trabajo' : '✓ Confirmar trabajo hecho'}</h3>
<div id="otForm" style="display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center">
  <label>N° de OT</label>
  <input class="txt" id="otfOt" value="${escA(base.ot || '')}">
  <label>Lote</label>
  <input class="txt" id="otfLote" value="${escA(base.lote || '')}">
  <label>Tipo</label>
  <select class="txt" id="otfTipo">${tipoOpts}</select>
  <label>Fecha</label>
  <input class="txt" type="date" id="otfFecha" value="${escA(base.fecha || hoy)}">
  <label id="otfLabVasOri">Vasija origen</label>
  <input class="txt" id="otfVasOri" value="${escA(base.vasija_origen || '')}">
  <label id="otfLabVasDes">Vasija destino</label>
  <input class="txt" id="otfVasDes" value="${escA(base.vasija_destino || '')}">
  <label id="otfLabLoteDes">Lote destino</label>
  <input class="txt" id="otfLoteDes" value="${escA(base.lote_destino || '')}">
  <label id="otfLabDestExt">Destino externo</label>
  <input class="txt" id="otfDestExt" value="${escA(base.destino_externo || '')}">
  <label id="otfLabLitros">Litros</label>
  <input class="txt" type="number" step="any" id="otfLitros" value="${escA(base.litros != null ? String(base.litros) : '')}">
  ${camposConfirmacion}
  <label>Comentario</label>
  <input class="txt" id="otfComentario" value="${escA(base.comentario || '')}">
</div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="otfCancelar">Cancelar</button>
  <button class="btn primary" id="otfAceptar">${esNuevo ? 'Emitir OT' : 'Confirmar'}</button>
</div>`);

  /* Mostrar solo los campos que aplican al tipo elegido, y re-evaluar cuando
   * cambia el tipo. Misma fuente de verdad que la grilla: CAMPOS_POR_TIPO. */
  function aplicarTipo(){
    const tipo = $('otfTipo').value;
    const campos = CAMPOS_POR_TIPO[tipo] || {};
    const pares = [
      ['vasija_origen',   'otfLabVasOri',  'otfVasOri'],
      ['vasija_destino',  'otfLabVasDes',  'otfVasDes'],
      ['lote_destino',    'otfLabLoteDes', 'otfLoteDes'],
      ['destino_externo', 'otfLabDestExt', 'otfDestExt'],
      ['litros',          'otfLabLitros',  'otfLitros'],
    ];
    for (const [campo, idLab, idInp] of pares){
      const vis = !!campos[campo];
      $(idLab).style.display = vis ? '' : 'none';
      $(idInp).style.display = vis ? '' : 'none';
    }
  }
  $('otfTipo').addEventListener('change', aplicarTipo);
  aplicarTipo();

  $('otfCancelar').addEventListener('click', () => cerrarOverlay());
  $('otfAceptar').addEventListener('click', () => _aceptarModalOT(mov));
}

/* Lee el formulario y crea (o confirma) el movimiento.
 * Con `mov == null` emite una OT nueva (movimiento pendiente); con un objeto
 * movimiento, lo confirma pisando sus valores con los reales del formulario. */
async function _aceptarModalOT(mov){
  const esNuevo = !mov;

  const lote = $('otfLote').value.trim();
  if (!lote){ alert('Falta el lote.'); return; }

  // La fecha es campo comun: un movimiento sin fecha desaparece de linea_tiempo
  // y la hoja sale con "Fecha prevista:" en blanco.
  const fecha = $('otfFecha').value;
  if (!fecha){ alert('Falta la fecha.'); return; }

  // El lote es texto libre; un typo produce un movimiento huerfano que despues
  // solo se puede corregir reabriendo el modal. Avisar, no bloquear: puede ser
  // un lote que todavia no se cargo.
  if (!_buildLoteMap().has(lote) &&
      !confirm('El lote ' + lote + ' no está en la lista de lotes. ¿Seguir igual?')) return;

  const litrosTxt = $('otfLitros').value.trim();
  const litros = litrosTxt === '' ? null : num(litrosTxt);
  if (litrosTxt !== '' && litros == null){ alert('Los litros no son un número válido.'); return; }

  const tipo = $('otfTipo').value;
  // Solo guardar los campos que aplican al tipo elegido; si un campo quedo
  // oculto, su valor en el DOM es un residuo de otro tipo y no debe
  // persistirse: motor_linaje arma el historial usando esos campos sin
  // condicionar por tipo, y un dato residual generaria una linea enganosa.
  const campos = CAMPOS_POR_TIPO[tipo] || {};
  const datos = {
    lote,
    tipo,
    fecha,
    vasija_origen:   campos.vasija_origen   ? $('otfVasOri').value.trim()  : '',
    vasija_destino:  campos.vasija_destino  ? $('otfVasDes').value.trim()  : '',
    lote_destino:    campos.lote_destino    ? $('otfLoteDes').value.trim() : '',
    destino_externo: campos.destino_externo ? $('otfDestExt').value.trim() : '',
    // Hoy todos los tipos tienen litros:true, pero se condiciona por simetria:
    // si el dia de manana se agrega un tipo sin litros, no queda el valor residual.
    litros: campos.litros ? litros : null,
    comentario:      $('otfComentario').value.trim(),
    ot:              $('otfOt').value.trim(),
  };

  if (esNuevo){
    const hoy = new Date().toISOString().slice(0, 10);
    const nuevoMov = {
      id: 'mov-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ...datos,
      operario: '',
      estado: PENDIENTE,
      cargado_por: usuarioActual(), cargado_el: hoy,
    };
    DATOS().movimientos.unshift(nuevoMov);
    markDirty();
    cerrarOverlay();
    renderMovimientos();
    // Guardar ANTES de ofrecer la hoja: el papel sale del sistema y va a la
    // bodega, asi que no puede existir un numero de OT que el servidor no
    // conozca. Si dos PCs emiten a la vez, aca aparece el 409 -- antes de que
    // haya papel, no despues.
    const ok = await guardar(false);
    if (!ok){
      alert('La OT quedó en pantalla pero NO se guardó, así que todavía no conviene imprimirla: '
          + 'resolvé el guardado y usá el botón 🖨 de la fila.');
      return;
    }
    if (confirm('OT emitida y guardada. ¿Imprimir la hoja para el operario?')){
      // Lo que se imprime es lo GUARDADO: si guardar() fusiono (409), el
      // movimiento vivo es otro objeto que el que se armo aca.
      const i = _idxMovVivo(nuevoMov);
      _imprimirOT(i !== -1 ? DATOS().movimientos[i] : nuevoMov);
    }
    return;
  }

  /* Confirmar: los valores reales PISAN a los planificados. El movimiento
   * pasa a ser el registro de lo que paso, que es para lo que sirve, y
   * recien ahora empieza a contar para etapas y linaje. */
  const operario = $('otfOperario').value.trim();
  if (!operario){
    alert('Falta el operario: la confirmación registra quién hizo el trabajo.');
    return;
  }
  if (litros == null && !confirm('Vas a confirmar el trabajo sin litros reales. ¿Seguro?')) return;

  /* Se confirma el movimiento VIVO, no el que se capturo al abrir el modal: si
   * en el medio termino un guardado con fusion, ese es un huerfano y el
   * movimiento quedaria PENDIENTE en los datos con la pantalla diciendo que no. */
  const iVivo = _idxMovVivo(mov);
  if (iVivo === -1){
    alert('No se encontró ese movimiento en los datos actuales (puede que se hayan recargado). No se confirmó nada.');
    cerrarOverlay();
    renderMovimientos();
    return;
  }
  mov = DATOS().movimientos[iVivo];
  if (esEjecutado(mov)){
    alert('Este movimiento ya figura como ejecutado (¿lo confirmaron desde otra PC?). No se cambió nada.');
    cerrarOverlay();
    renderMovimientos();
    return;
  }
  Object.assign(mov, datos);
  mov.operario = operario;
  mov.estado = EJECUTADO;

  markDirty();
  cerrarOverlay();
  renderMovimientos();
}

registrarVista('movimientos', () => renderMovimientos({ conservarScroll: true }));
