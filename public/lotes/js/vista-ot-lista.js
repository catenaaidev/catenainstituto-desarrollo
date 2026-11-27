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

import { $, esc, escA, DATOS, markDirty, guardar, usuarioActual, overlayMinimizado } from './nucleo.js';
import { avisar, confirmar } from './dialogos.js';
import { etiquetaPdf, desfaseCarpeta } from './ot-pdf.js';
import { chipCarpeta, cablearChipsCarpeta } from './guardar-ot.js';
import { estado as estadoCarpeta, listarSerie } from './carpeta-ot.js';
import { numerosWeb } from './numero-ot.js';
import { plantillaPorId } from './ot-plantillas.js';
import { hojaOT } from './ot-hojas.js';
import { esEjecutado } from './ot-movimientos.js';
import { esSinMovimientos, filasDeOT, agregarFila, quitarFila, editarCeldaMuestra } from './ot-muestras.js';
import { eliminarOT } from './ot-armado.js';
import { lotesCreadosPorOT } from './ot-achique.js';
import { planDeshacer } from './ot-deshacer.js';
import { editarTexto, editarCelda, editarBanda, insertarPaso, quitarBloque, volverAPlantilla,
         tieneTextosPropios, esEditable } from './ot-bloques.js';
import { filtrarOrdenes, resumenLotes, esProgramada } from './ot-lista.js';
import { abrirImprimirOT, abrirEditarOT } from './vista-ot-emitir.js';
import { aplicarEdicionOT, filasManuales, lotesConFilas, clasificarFila } from './ot-editar.js';
import { abrirConfirmarOT } from './vista-ot-confirmar.js';
import { fmtFecha, hoyLocalISO } from './fechas.js';
import { hayCorrecciones, renderCorreccionesOT } from './vista-ot-correcciones.js';
import { urlVolver } from './modo-ordenes.js';

let _elegida = null;          // id de la OT abierta en la hoja
let _soloPendientes = true;
/* El buscador sobrevive al F5 en esta pestaña (shared/filtros-sesion.js). */
const _FS = typeof window !== 'undefined' && window.CIWFiltros;
const _lf = (k, d) => _FS ? _FS.leer('lotes:otlista:' + k, d) : d;
const _gf = (k, v) => { if (_FS) _FS.guardar('lotes:otlista:' + k, v); };
let _busca = (v => typeof v === 'string' ? v : '')(_lf('busca', ''));
let _cb = { onEmitir(){}, onCambio(){} };
let _unica = false;           // modo órdenes: solo la hoja de la OT elegida
let _abriendoForm = false;    // modo órdenes, Nueva: el formulario de emitir se está abriendo
let _escuchaCierre = false;   // ya se escucha el cierre del overlay (una sola vez)
let _borrada = null;          // modo órdenes: n° de la OT que se acaba de borrar (no "no se emitió")

const _ordenes = () => DATOS().ordenes_trabajo || [];
const _otPorId = id => _ordenes().find(o => o.id === id) || null;

/* Abre una OT en la hoja. Si esta ejecutada, el filtro pasa a "todas" para
 * que se vea en la lista. */
export function elegirOT(id){
  _elegida = id || null;
  _borrada = null;
  const ot = _otPorId(_elegida);
  if (ot && esEjecutado(ot)) _soloPendientes = false;
}

/* Modo órdenes, Nueva: mientras el formulario de emitir se abre (puede haber
 * antes un «¿retomar el borrador?»), la hoja vacía no dice «No se emitió».
 * vista-movimientos.js lo prende antes de abrir y lo apaga al terminar. */
export function abriendoFormulario(si){
  _abriendoForm = !!si;
  if (_unica && !_otPorId(_elegida)) _pintarDer();
}

/* El formulario está en pantalla (abierto o minimizado en la pastilla). */
function _formularioEnCurso(){
  const dlg = $('overlay');
  return _abriendoForm || !!(dlg && dlg.open) || overlayMinimizado();
}

/* Al cerrarse el overlay sin emitir, la hoja vacía pasa a «No se emitió…».
 * Si se emitió, registrarOT ya eligió la OT antes de que llegue el evento
 * (el 'close' del <dialog> va en cola) y no se repinta nada. */
function _escucharCierreOverlay(){
  const dlg = $('overlay');
  if (_escuchaCierre || !dlg) return;
  _escuchaCierre = true;
  dlg.addEventListener('close', () => { if (_unica && !_otPorId(_elegida)) _pintarDer(); });
}

/* `opciones.unica` (modo órdenes, /lotes/?orden=…): solo la hoja de la OT
 * elegida, sin lista, buscador, filtro, Emitir ni cartel de carpeta. */
export function renderOrdenesTrabajo(cont, callbacks, opciones = {}){
  if (!cont) return;
  _cb = { ..._cb, ...(callbacks || {}) };
  _unica = !!opciones.unica;
  // Las OT sin ningun movimiento detras (huerfanas) no se muestran ni se abren.
  // El selector de años no las filtra: las OT se ven siempre (2026-11-03).
  const movimientos = DATOS().movimientos || [];
  const vivas = filtrarOrdenes(_ordenes(), { soloPendientes: false, movimientos });
  const lista = filtrarOrdenes(vivas, { soloPendientes: _soloPendientes, busca: _busca });
  if (_elegida && !vivas.some(o => o.id === _elegida)) _elegida = null;
  if (_unica){
    // Sin OT elegida se muestra el cartel, nunca otra OT de la lista.
    cont.innerHTML = '<div class="otl unica"><div class="otl-der" id="otlDer"></div></div>';
    _pintarDer();
    return;
  }
  if (!_elegida && lista.length) _elegida = lista[0].id;

  const filas = lista.map(ot => {
    const pl = plantillaPorId(ot.plantilla);
    const estado = esEjecutado(ot)
      ? '<span class="tag">ejecutada</span>'
      : '<span class="tag mov-pendiente">● pendiente</span>';
    const prog = esProgramada(ot, hoyLocalISO())
      ? ' <span class="tag otl-prog" title="Programada para una fecha que todavía no llegó">📅 programada</span>' : '';
    const pdf = etiquetaPdf(ot);
    const tagPdf = pdf ? ` <span class="tag otl-pdf ${pdf.clase}" title="${escA(pdf.title)}">${esc(pdf.txt)}</span>` : '';
    return `<button type="button" class="otl-fila${ot.id === _elegida ? ' on' : ''}" data-ot="${escA(ot.id)}">` +
      `<span class="otl-l1"><b>${esc(ot.ot)}</b> <span>${esc(fmtFecha(ot.fecha))}</span> ${estado}${prog}${tagPdf}</span>` +
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
    <div id="otlCartel"></div>
    <div class="otl-lista" id="otlLista">${filas || `<div class="otl-vacio">${esc(vacio)}</div>`}</div>
  </div>
  <div class="otl-der" id="otlDer"></div>
</div>`;

  $('otlBusca').addEventListener('input', () => {
    _busca = $('otlBusca').value;
    _gf('busca', _busca);
    renderOrdenesTrabajo(cont);
    const b = $('otlBusca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length);
  });
  $('otlPend').addEventListener('change', () => { _soloPendientes = $('otlPend').checked; renderOrdenesTrabajo(cont); });
  $('otlEmitir').addEventListener('click', () => _cb.onEmitir());
  _pintarCartel();
  $('otlLista').addEventListener('click', e => {
    const b = e.target.closest('[data-ot]');
    if (!b || b.dataset.ot === _elegida) return;
    _elegida = b.dataset.ot;
    $('otlLista').querySelectorAll('.otl-fila').forEach(f => f.classList.toggle('on', f === b));
    _pintarDer();
  });
  _pintarDer();
}

/* Cartel arriba de la lista: sin carpeta los numeros pueden repetirse y los
 * PDF se descargan; con carpeta, si la web ya uso un numero mayor que el
 * ultimo de la carpeta, OneDrive probablemente no bajo las ordenes nuevas. */
async function _pintarCartel(){
  const c = $('otlCartel');
  if (!c) return;
  const e = await estadoCarpeta();
  let html = '';
  if (e.tipo !== 'conectada'){
    html = '<div class="msg err otl-cartel" title="La web lee la carpeta de OT de esta PC para numerar y guardar los PDF.">' +
      chipCarpeta('principal') + '<div>Sin la carpeta los números pueden repetirse y los PDF se descargan.</div></div>';
  } else {
    const nombres = await listarSerie('principal');
    const d = desfaseCarpeta({ nombres, web: numerosWeb(DATOS(), 'principal') }, 'principal');
    if (d) html = '<div class="msg err otl-cartel" title="La web ve la carpeta de esta PC. Si OneDrive está al día, el ícono de OneDrive de la barra de Windows lo muestra.">' +
      `⚠ La web ya usó la ${esc(d.web)} pero en la carpeta la última es la ${esc(d.carpeta)}: ¿OneDrive está sincronizado?</div>`;
  }
  if (!$('otlCartel')) return;
  $('otlCartel').innerHTML = html;
  if (html) cablearChipsCarpeta($('otlCartel'), () => _pintarCartel());
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
  const mu = esSinMovimientos(ot);
  const id = ot.id;
  // Se borra cualquier OT pendiente que todavía no cambió litros ni envases;
  // una ya aplicada se deshace desde Movimientos → Historial.
  const borrable = !esEjecutado(ot) && (mu || (edit && !planDeshacer(DATOS(), ot).aplicada));
  const textoEdit = mu
    ? 'Escribí sobre la hoja: la tabla de muestras y los pasos se guardan solos.'
    : 'Escribí sobre la hoja para cambiar pasos, casilleros y título (solo cambia el papel).';
  cab.innerHTML =
    `<span><b>${esc(ot.ot)}</b> · ${edit ? textoEdit : 'OT ejecutada: solo lectura.'}</span>` +
    '<span class="otl-botones">' +
      (edit && tieneTextosPropios(ot) ? '<button class="btn" id="otlPlantilla" title="Descartar todo lo escrito sobre la hoja de esta OT">↺ Volver al original</button>' : '') +
      (edit && !mu ? '<button class="btn" id="otlEditar" title="Corregir el N°, lotes, vasijas, destino o lote del corte de esta OT pendiente">✎ Editar</button>' : '') +
      (edit ? '<button class="btn" id="otlConfirmar">✓ Confirmar</button>' : '') +
      (borrable ? '<button class="btn danger" id="otlBorrar" title="Borrar esta orden pendiente">🗑 Borrar</button>' : '') +
      '<button class="btn primary" id="otlImprimir">🖨 Imprimir</button>' +
    '</span>';
  $('otlImprimir').addEventListener('click', () => _imprimir(id));
  if ($('otlEditar')) $('otlEditar').addEventListener('click', () => {
    const o = _otViva(id);
    if (o) abrirEditarOT(o, () => _cb.onCambio());
  });
  if ($('otlConfirmar')) $('otlConfirmar').addEventListener('click', () => {
    const o = _otViva(id);
    if (o) abrirConfirmarOT(o, () => _cb.onCambio());
  });
  if ($('otlPlantilla')) $('otlPlantilla').addEventListener('click', async () => {
    if (!await confirmar({ titulo: 'Volver al original', texto: 'Se descarta todo lo escrito sobre la hoja de ' + ot.ot + ' (pasos, casilleros y título).', si: 'Volver al original', no: 'Cancelar', peligro: true })) return;
    const o = _otViva(id);
    if (o && volverAPlantilla(o)){ markDirty(); _pintarDer(); }
  });
  if ($('otlBorrar')) $('otlBorrar').addEventListener('click', async () => {
    const creados = mu ? [] : lotesCreadosPorOT(ot);
    const n = (ot.lotes || []).length;
    const texto = mu ? 'Es una orden de muestras: no tiene movimientos ni cambió ningún lote.'
      : 'Está pendiente: se borra la OT con ' + (n === 1 ? 'su movimiento' : 'sus ' + n + ' movimientos') +
        '. No cambió litros ni envases.' +
        (creados.length ? '\n\n' + (creados.length > 1 ? 'Los lotes ' + creados.join(', ') + ' que creó esta OT NO se borran.' : 'El lote ' + creados[0] + ' que creó esta OT NO se borra.') : '');
    if (!await confirmar({ titulo: 'Borrar la ' + ot.ot, texto,
      si: 'Borrar', no: 'Cancelar', peligro: true })) return;
    const o = _otViva(id);
    if (!o || esEjecutado(o) || (!esSinMovimientos(o) && planDeshacer(DATOS(), o).aplicada)) {
      avisar('La OT ya no se puede eliminar: verificá su estado actual.', { tipo: 'mal' });
      _cb.onCambio();
      return;
    }
    eliminarOT(DATOS(), o);
    markDirty();
    _elegida = null;
    _borrada = o.ot;
    await guardar(false);
    _cb.onCambio();
  });
}

function _pintarDer(foco){
  const der = $('otlDer');
  if (!der) return;
  const ot = _otPorId(_elegida);
  if (!ot && _unica){
    _escucharCierreOverlay();
    if (_formularioEnCurso()){
      der.innerHTML = '<div class="otl-vacio">Completá el formulario para emitir la orden.</div>';
      return;
    }
    if (_borrada){
      der.innerHTML = '<div class="otl-vacio">La orden ' + esc(_borrada) + ' se borró. ' +
        '<a href="' + escA(urlVolver(location.search)) + '">← Órdenes de trabajo</a></div>';
      return;
    }
    der.innerHTML = '<div class="otl-vacio">No se emitió la orden. ' +
      '<button class="btn primary" id="otlReemitir">＋ Emitir de nuevo</button></div>';
    $('otlReemitir').addEventListener('click', () => _cb.onEmitir());
    return;
  }
  if (!ot){ der.innerHTML = '<div class="otl-vacio">Elegí una OT de la lista.</div>'; return; }
  // A la derecha de la hoja, si la OT lleva corrección: el panel para
  // registrarla (vista-ot-correcciones.js); ejecutada, lo registrado con ella.
  // Si no entra, baja debajo.
  der.innerHTML = '<div class="otl-cuerpo"><div class="otl-papel">' +
    `<div class="otl-cab" id="otlCab"></div>` +
    `<div class="otl-hoja" id="otlHoja">${hojaOT(ot, { editable: esEditable(ot),
      lotesExisten: esSinMovimientos(ot) ? new Set((DATOS().lotes || []).map(l => String(l.lote))) : null })}</div></div>` +
    (hayCorrecciones(ot) ? '<aside class="otl-corr" id="otlCorr"></aside>' : '') + '</div>';
  _pintarCab(ot);
  if ($('otlCorr')) renderCorreccionesOT($('otlCorr'), ot, _otViva);
  if (esEditable(ot)){
    // Lotes sugeridos para la columna "CIW lote" de las filas manuales.
    der.insertAdjacentHTML('beforeend', '<datalist id="otLotesDl">' + (DATOS().lotes || []).map(l =>
      `<option value="${escA(l.lote)}">${esc(l.id_texto || '')}</option>`).join('') + '</datalist>');
    _cablearHoja($('otlHoja'), ot);
    // Una OT de muestras no mueve vino: sin filas manuales de trasiego.
    if (!esSinMovimientos(ot)) _panelFilas(ot);
  }
  if (foco != null){
    const t = der.querySelector(`textarea[data-bloque="${foco}"]`);
    if (t){ t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
  }
}

function _cablearHoja(hoja, ot){
  const id = ot.id;
  hoja.addEventListener('input', e => {
    const mc = e.target.closest('input.ot-mu-celda');
    if (mc){
      const o = _otViva(id);
      if (!o) return;
      const nuevas = editarCeldaMuestra(filasDeOT(o), +mc.dataset.mfila, mc.dataset.mcol, mc.value);
      if (!nuevas) return;
      o.muestras = nuevas;
      if (o.pdf && o.pdf.estado && o.pdf.estado !== 'viejo') o.pdf = { ...o.pdf, estado: 'viejo' };
      markDirty();
      // Sin repintar (no se pierde el foco): solo el rojo del lote.
      if (mc.dataset.mcol === 'lote'){
        const v = mc.value.trim();
        mc.classList.toggle('ot-mu-mal', !!v && !(DATOS().lotes || []).some(l => String(l.lote) === v));
      }
      return;
    }
    const t = e.target.closest('textarea.ot-texto');
    // Casilleros y titulo: contenteditable; lo escrito es solo papel.
    const c = t ? null : e.target.closest('[data-celda],[data-banda]');
    if (!t && !c) return;
    const o = _otViva(id);
    if (!o) return;
    const tenia = tieneTextosPropios(o);
    let cambio;
    if (t) cambio = editarTexto(o, +t.dataset.bloque, t.value);
    else {
      const txt = c.innerText.replace(/\n$/, '');
      cambio = c.dataset.banda != null
        ? editarBanda(o, +c.dataset.banda, txt)
        : editarCelda(o, +c.dataset.bloque, +c.dataset.celda, txt);
    }
    if (!cambio) return;
    markDirty();
    // La primera edicion crea la copia: recien ahi aparece "↺ Volver al original".
    if (!tenia) _pintarCab(o);
  });
  hoja.addEventListener('click', e => {
    const mq = e.target.closest('[data-mquitar]');
    const mm = e.target.closest('[data-mmas]');
    if (mq || mm){
      const o = _otViva(id);
      if (!o) return;
      o.muestras = mm ? agregarFila(filasDeOT(o)) : quitarFila(filasDeOT(o), +mq.dataset.mquitar);
      if (o.pdf && o.pdf.estado && o.pdf.estado !== 'viejo') o.pdf = { ...o.pdf, estado: 'viejo' };
      markDirty();
      _pintarDer();
      if (mm){ const ult = $('otlHoja').querySelectorAll('input.ot-mu-celda[data-mcol="lote"]'); if (ult.length) ult[ult.length - 1].focus(); }
      return;
    }
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

/* ---------- filas manuales de la hoja ----------
 * El panel es un BORRADOR: se escribe la fila completa (CIW lote, vasija,
 * litros) sin que la hoja se redibuje (asi no se pierde el cursor ni la fila
 * cambia de lugar al cambiar el lote), y "✓ Aplicar filas" (o Enter) la pasa a
 * la OT (ot-editar.js):
 *   - lote de la OT: la vasija suma a sus litros y a su movimiento;
 *   - otro lote que existe: entra a la OT con su movimiento;
 *   - un nombre que no es lote: sale en el papel y nada mas. */
let _filasBorrador = null;   // { id, filas: [{lote, nombre, litros}] }

const _ETIQUETA_FILA = {
  ot:    { txt: 'cuenta',          cls: 'ot-fm-cuenta', title: 'Suma a los litros y al movimiento del lote' },
  nuevo: { txt: 'entra a la OT',   cls: 'ot-fm-cuenta', title: 'El lote existe: al aplicar se suma a la OT con su movimiento' },
  papel: { txt: 'solo papel',      cls: 'ot-fm-papel',  title: 'No es un lote del sistema: sale en el papel y no cuenta' },
};

function _panelFilas(ot, foco){
  const cont = $('otFilasPanel');
  if (!cont) return;
  if (!_filasBorrador || _filasBorrador.id !== ot.id)
    _filasBorrador = { id: ot.id, filas: filasManuales(ot).map(f => ({ ...f })) };
  const filas = _filasBorrador.filas;
  const sucio = JSON.stringify(filas) !== JSON.stringify(filasManuales(ot));
  const etiqueta = f => _ETIQUETA_FILA[clasificarFila(f, ot, DATOS().lotes || [])];
  cont.innerHTML = `<div class="ot-otras-tit">Filas manuales <span>(un lote de la OT o de la lista suma a la OT; un nombre sale solo en el papel)</span></div>` +
    (filas.length ? `<table class="ot-fm-tabla"><thead><tr><th>CIW lote</th><th>Vasija</th><th>Litros</th><th></th><th></th></tr></thead><tbody>` +
      filas.map((f, k) => { const t = etiqueta(f); return `<tr>` +
        `<td><input class="txt" data-hfl="${k}" value="${escA(f.lote)}" list="otLotesDl" aria-label="CIW lote" placeholder="Lote o nombre"></td>` +
        `<td><input class="txt" data-hfn="${k}" value="${escA(f.nombre)}" aria-label="Vasija" placeholder="Vasija"></td>` +
        `<td><input class="txt" type="number" step="any" min="0" data-hfv="${k}" value="${escA(f.litros ?? '')}" aria-label="Litros" placeholder="litros"></td>` +
        `<td><span class="tag ${t.cls}" data-hft="${k}" title="${escA(t.title)}">${esc(t.txt)}</span></td>` +
        `<td><button type="button" class="rowbtn" data-hfx="${k}" title="Quitar esta fila">✕</button></td></tr>`; }).join('') +
      '</tbody></table>' : '') +
    `<div class="ot-otra-mas"><button type="button" class="btn" data-hmas>＋ fila manual</button>` +
    `<button type="button" class="btn primary" data-haplicar${sucio ? '' : ' disabled'}>✓ Aplicar filas</button>` +
    (sucio ? '<button type="button" class="btn" data-hdescartar>Descartar</button><span class="ot-fm-nota">cambios sin aplicar</span>' : '') + '</div>';

  const marcar = () => {   // sin redibujar: solo el boton y la etiqueta
    const s2 = JSON.stringify(filas) !== JSON.stringify(filasManuales(ot));
    const b = cont.querySelector('[data-haplicar]');
    if (b) b.disabled = !s2;
  };
  cont.oninput = e => {
    const t = e.target;
    const k = t.dataset.hfl ?? t.dataset.hfn ?? t.dataset.hfv;
    if (k === undefined || !filas[+k]) return;
    const f = filas[+k];
    if (t.dataset.hfl !== undefined){
      f.lote = t.value.trim();
      const et = etiqueta(f), tag = cont.querySelector(`[data-hft="${k}"]`);
      if (tag){ tag.textContent = et.txt; tag.className = 'tag ' + et.cls; tag.title = et.title; }
    } else if (t.dataset.hfn !== undefined) f.nombre = t.value.trim();
    else { const n = parseFloat(String(t.value).replace(',', '.')); f.litros = Number.isFinite(n) && n >= 0 ? n : null; }
    marcar();
  };
  cont.onkeydown = e => { if (e.key === 'Enter' && e.target.matches('input')){ e.preventDefault(); _aplicarFilas(ot.id); } };
  cont.onclick = e => {
    const x = e.target.closest('[data-hfx],[data-hmas],[data-haplicar],[data-hdescartar]');
    if (!x) return;
    if (x.dataset.hfx !== undefined){ filas.splice(+x.dataset.hfx, 1); _panelFilas(ot); }
    else if (x.dataset.hmas !== undefined){
      filas.push({ lote: ot.lotes[0] ? String(ot.lotes[0].lote) : '', nombre: '', litros: null });
      _panelFilas(ot, filas.length - 1);
    } else if (x.dataset.hdescartar !== undefined){ _filasBorrador = null; _panelFilas(ot); }
    else _aplicarFilas(ot.id);
  };
  if (foco != null){ const i = cont.querySelector(`[data-hfl="${foco}"]`); if (i){ i.focus(); i.select(); } }
}

function _aplicarFilas(id){
  const o = _otViva(id);
  if (!o || !_filasBorrador || _filasBorrador.id !== id) return;
  // Una fila sin vasija se llama "Vasija manual" (el papel la necesita); una
  // fila del todo vacia se descarta.
  const filas = _filasBorrador.filas.filter(f => f.lote || f.nombre || f.litros != null)
    .map((f, k) => ({ ...f, nombre: f.nombre || 'Vasija manual ' + (k + 1) }));
  const r = aplicarEdicionOT(DATOS(), o, lotesConFilas(o, filas, DATOS().lotes || []),
                             { usuario: usuarioActual(), hoy: hoyLocalISO() });
  _filasBorrador = null;
  if (!r.cambio){ _pintarDer(); return; }
  markDirty();
  _cb.onCambio();
  const partes = [];
  if (r.agregados.length) partes.push('se sumó a la OT el lote ' + r.agregados.join(', ') + ' (con su movimiento)');
  if (r.quitados.length) partes.push('salió de la OT el lote ' + r.quitados.join(', ') + ' (se quedó sin vasijas)');
  if (r.celdasLimpias) partes.push('lo escrito a mano en los casilleros de la tabla se reinició');
  avisar('Filas aplicadas' + (partes.length ? ': ' + partes.join('; ') : '') + '.', { tipo: 'ok' });
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
  if (!ot){ avisar('Esta OT ya no está en los datos guardados (¿la borraron desde otra PC?).', { tipo: 'mal' }); _cb.onCambio(); return; }
  // Al terminar, la lista muestra si el PDF quedo en la carpeta.
  abrirImprimirOT(ot, () => _cb.onCambio());
}
