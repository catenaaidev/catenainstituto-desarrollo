/* ===== Lotes CIW — sub-pestaña Órdenes de trabajo (Movimientos) =====
 *
 * A la izquierda la lista de DATOS().ordenes_trabajo; a la derecha la hoja 1
 * de la OT elegida a tamaño A4, como la Orden de muestras. Sobre la hoja se
 * editan los textos de los pasos de ESA OT (ot-bloques.js): tipear no repinta
 * (no se pierde el foco); ＋ y ✕ repintan y devuelven el foco.
 *
 * Una OT ejecutada se ve igual pero de solo lectura.
 *
 * No importa vista-movimientos.js (cerraria un ciclo): lo que tiene que pasar
 * afuera entra por los callbacks onEmitir y onCambio. */
'use strict';

import { $, esc, escA, DATOS, markDirty, guardar } from './nucleo.js';
import { plantillaPorId } from './ot-plantillas.js';
import { hojaOT } from './ot-hojas.js';
import { esEjecutado } from './ot-movimientos.js';
import { editarTexto, insertarPaso, quitarBloque, volverAPlantilla,
         tieneTextosPropios, esEditable } from './ot-bloques.js';
import { filtrarOrdenes, resumenLotes } from './ot-lista.js';
import { abrirImprimirOT } from './vista-ot-emitir.js';
import { abrirConfirmarOT } from './vista-ot-confirmar.js';
import { fmtFecha } from './fechas.js';

let _elegida = null;          // id de la OT abierta en la hoja
let _soloPendientes = true;
let _busca = '';
let _cb = { onEmitir(){}, onCambio(){} };

const _ordenes = () => DATOS().ordenes_trabajo || [];
const _otPorId = id => _ordenes().find(o => o.id === id) || null;

/* Abre una OT en la hoja. Si esta ejecutada, el filtro pasa a "todas" para
 * que se vea en la lista. */
export function elegirOT(id){
  _elegida = id || null;
  const ot = _otPorId(_elegida);
  if (ot && esEjecutado(ot)) _soloPendientes = false;
}

export function renderOrdenesTrabajo(cont, callbacks){
  if (!cont) return;
  _cb = { ..._cb, ...(callbacks || {}) };
  // Las OT sin ningun movimiento detras (huerfanas) no se muestran ni se abren.
  const movimientos = DATOS().movimientos || [];
  const vivas = filtrarOrdenes(_ordenes(), { soloPendientes: false, movimientos });
  const lista = filtrarOrdenes(vivas, { soloPendientes: _soloPendientes, busca: _busca });
  if (_elegida && !vivas.some(o => o.id === _elegida)) _elegida = null;
  if (!_elegida && lista.length) _elegida = lista[0].id;

  const filas = lista.map(ot => {
    const pl = plantillaPorId(ot.plantilla);
    const estado = esEjecutado(ot)
      ? '<span class="tag">ejecutada</span>'
      : '<span class="tag mov-pendiente">● pendiente</span>';
    return `<button type="button" class="otl-fila${ot.id === _elegida ? ' on' : ''}" data-ot="${escA(ot.id)}">` +
      `<span class="otl-l1"><b>${esc(ot.ot)}</b> <span>${esc(fmtFecha(ot.fecha))}</span> ${estado}</span>` +
      `<span class="otl-sub">${esc(pl ? pl.nombre : ot.plantilla || '')}</span>` +
      `<span class="otl-sub">${esc(resumenLotes(ot))}</span></button>`;
  }).join('');
  const vacio = vivas.length
    ? 'Ninguna OT con este filtro.'
    : 'Todavía no hay órdenes de trabajo. Emití la primera con ➕ Emitir OT.';

  cont.innerHTML = `
<div class="otl">
  <div class="otl-izq">
    <div class="toolbar otl-barra">
      <input class="txt" id="otlBusca" placeholder="🔎 N° o lote…" value="${escA(_busca)}">
      <label class="otl-chk"><input type="checkbox" id="otlPend"${_soloPendientes ? ' checked' : ''}> Solo pendientes</label>
      <button class="btn primary" id="otlEmitir">➕ Emitir OT</button>
    </div>
    <div class="otl-lista" id="otlLista">${filas || `<div class="otl-vacio">${esc(vacio)}</div>`}</div>
  </div>
  <div class="otl-der" id="otlDer"></div>
</div>`;

  $('otlBusca').addEventListener('input', () => {
    _busca = $('otlBusca').value;
    renderOrdenesTrabajo(cont);
    const b = $('otlBusca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length);
  });
  $('otlPend').addEventListener('change', () => { _soloPendientes = $('otlPend').checked; renderOrdenesTrabajo(cont); });
  $('otlEmitir').addEventListener('click', () => _cb.onEmitir());
  $('otlLista').addEventListener('click', e => {
    const b = e.target.closest('[data-ot]');
    if (!b || b.dataset.ot === _elegida) return;
    _elegida = b.dataset.ot;
    $('otlLista').querySelectorAll('.otl-fila').forEach(f => f.classList.toggle('on', f === b));
    _pintarDer();
  });
  _pintarDer();
}

/* La OT `id` en el DATOS() de AHORA. Los listeners de la cabecera y de la hoja
 * se cablean con la OT del momento del pintado, pero despues de un 409
 * nucleo.guardar() fusiona y REEMPLAZA todos los objetos: escribir en la OT
 * capturada seria escribir en un huerfano (se pierde sin aviso). Si ya no
 * esta, se repinta la hoja y no se toca nada. */
function _otViva(id){
  const ot = _otPorId(id);
  if (!ot) _pintarDer();
  return ot;
}

function _pintarCab(ot){
  const cab = $('otlCab');
  if (!cab) return;
  const edit = esEditable(ot);
  const id = ot.id;
  cab.innerHTML =
    `<span><b>${esc(ot.ot)}</b> · ${edit ? 'Escribí sobre la hoja para cambiar los pasos de esta OT.' : 'OT ejecutada: solo lectura.'}</span>` +
    '<span class="otl-botones">' +
      (edit && tieneTextosPropios(ot) ? '<button class="btn" id="otlPlantilla" title="Descartar los cambios de texto de esta OT">↺ Textos de la plantilla</button>' : '') +
      (edit ? '<button class="btn" id="otlConfirmar">✓ Confirmar</button>' : '') +
      '<button class="btn primary" id="otlImprimir">🖨 Imprimir</button>' +
    '</span>';
  $('otlImprimir').addEventListener('click', () => _imprimir(id));
  if ($('otlConfirmar')) $('otlConfirmar').addEventListener('click', () => {
    const o = _otViva(id);
    if (o) abrirConfirmarOT(o, () => _cb.onCambio());
  });
  if ($('otlPlantilla')) $('otlPlantilla').addEventListener('click', () => {
    if (!confirm('¿Descartar los cambios de texto de ' + ot.ot + ' y volver a los de la plantilla?')) return;
    const o = _otViva(id);
    if (o && volverAPlantilla(o)){ markDirty(); _pintarDer(); }
  });
}

function _pintarDer(foco){
  const der = $('otlDer');
  if (!der) return;
  const ot = _otPorId(_elegida);
  if (!ot){ der.innerHTML = '<div class="otl-vacio">Elegí una OT de la lista.</div>'; return; }
  der.innerHTML = `<div class="otl-cab" id="otlCab"></div>` +
    `<div class="otl-hoja" id="otlHoja">${hojaOT(ot, { editable: esEditable(ot) })}</div>`;
  _pintarCab(ot);
  if (esEditable(ot)) _cablearHoja($('otlHoja'), ot);
  if (foco != null){
    const t = der.querySelector(`textarea[data-bloque="${foco}"]`);
    if (t){ t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
  }
}

function _cablearHoja(hoja, ot){
  const id = ot.id;
  hoja.addEventListener('input', e => {
    const t = e.target.closest('textarea.ot-texto');
    if (!t) return;
    const o = _otViva(id);
    if (!o) return;
    const tenia = tieneTextosPropios(o);
    if (!editarTexto(o, +t.dataset.bloque, t.value)) return;
    markDirty();
    // La primera edicion crea la copia: recien ahi aparece "↺ Textos de la plantilla".
    if (!tenia) _pintarCab(o);
  });
  hoja.addEventListener('click', e => {
    const ins = e.target.closest('[data-insertar]');
    const q = e.target.closest('[data-quitar]');
    if (!ins && !q) return;
    const o = _otViva(id);
    if (!o) return;
    if (ins){ const j = insertarPaso(o, +ins.dataset.insertar); markDirty(); _pintarDer(j); return; }
    const i = +q.dataset.quitar;
    if (quitarBloque(o, i)){ markDirty(); _pintarDer(Math.max(i - 1, 0)); }
  });
}

/* Guardar ANTES de imprimir, igual que al emitir: el papel sale a la bodega y
 * tiene que coincidir con lo guardado (numero de OT y textos). guardar() ya
 * avisa si algo falla.
 *
 * La OT se busca por id DESPUES del await: si guardar() paso por un 409,
 * fusiono y reemplazo los objetos, y la OT de antes del guardado puede no ser
 * la guardada (otra PC le cambio textos). Lo que sale en papel es lo guardado. */
async function _imprimir(id){
  if (!await guardar(false)) return;
  const ot = _otPorId(id);
  if (!ot){ alert('Esta OT ya no está en los datos guardados (¿la borraron desde otra PC?).'); _cb.onCambio(); return; }
  abrirImprimirOT(ot);
}
