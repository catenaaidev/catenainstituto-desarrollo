/* ===== Lotes CIW — confirmar una OT en dos pasos (spec 2026-10-01) =====
 *
 * Paso 1, "Lo que pasó": por lote, el tanque destino y sus cm (o litros), o las
 * barricas llenas y las mermas. Paso 2, "Así queda cada lote": la propuesta
 * antes -> despues de propuesta-ot.js, con el Mapa de Barriles como fuente
 * (los escaneos que el escaner anoto con el numero de esta OT) y la OT como
 * respaldo. Cada lote se aplica salvo que este bloqueado o alguien apriete
 * "No tocar" (2026-11-10: antes era un tilde por lote, y una fila sin tilde se
 * leia como "no hay nada que hacer" cuando significaba "no se aplica").
 * "Aplicar y guardar" confirma la OT (como siempre), aplica y guarda. El Mapa
 * solo se lee. */
'use strict';

import { $, esc, escA, num, DATOS, markDirty, guardar, usuarioActual, invalidarDashMap,
         mostrarOverlay, cerrarOverlay } from './nucleo.js';
import { confirmar, avisar } from './dialogos.js';
import { confirmarOT } from './ot-armado.js';
import { esSinMovimientos } from './ot-muestras.js';
import { barricasEstimadas } from './ot-plantillas.js';
import { proponer, recalcularItem, compararConMapa, aplicarPropuesta, tipoDestino, ENV_KEYS, esItemCorte,
         escaneosPorLote, llenadoSegunMapa, filasVaciado, fijarTrasegado, quedaDe, realesDeExtras } from './propuesta-ot.js';
import { nombreDestino, nombreDestinoLargo, destinoRealAchique, indiceBase } from './ot-achique.js';
import { extrasDeOT, nombreExtra, esChicas, destinoDeLote, asignarLotesExtra, armarHijosExtra } from './ot-destinos.js';
import { sobranteSegunMapa, otConAgregados, incorporarAgregados, lugaresAplicados, agregadosAplicables,
         validarAgregados } from './ot-sobrante.js';
import { anioDeLote } from './lote-nuevo.js';
import { fijar } from './vista-lotes.js';
import { buscarVasija } from './vasijas-padron.js';
import { litrosPorCm } from './cubicacion.js';
import { resumenEnvases } from './envases.js';
import { refrescarMapaMermas } from './mermas-mapa.js';
import { estaPendiente, codigoLote } from './mermas.js';
import { esEjecutado } from './ot-movimientos.js';
import { hoyLocalISO } from './fechas.js';

const hoyISO = () => hoyLocalISO();
const fmtL = v => v == null ? '—' : Number(v).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' L';

async function leerMapa(lotes, nums, ot){
  const qs = [];
  if (lotes.length) qs.push('lotes=' + encodeURIComponent(lotes.join(',')));
  if (nums.length) qs.push('nums=' + encodeURIComponent(nums.join(',')));
  // Los escaneos (vaciados/llenados) que el escaner anoto con este numero de OT.
  if (ot) qs.push('ot=' + encodeURIComponent(ot));
  try {
    const r = await fetch(API + '/barriles?' + qs.join('&'));
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

export function abrirConfirmarOT(ot, onListo){
  // M2: una OT ya confirmada no se vuelve a confirmar (duplicaria mermas y
  // pisaria los reales). Todas las OT nacen con estado PENDIENTE.
  if (esEjecutado(ot)) return;
  if (esSinMovimientos(ot)) return _confirmarSinMovimientos(ot, onListo);
  const st = { ot, onListo, tipo: tipoDestino(ot.plantilla), corte: !!(ot.lote_corte && ot.lote_corte.lote),
               entradas: null, mapa: null, propuesta: null, paso: 1, noTocar: new Set(),
               operario: '', pasos: false, comentario: '', aplicada: false, faltan: [],
               agregados: [], ignorados: new Set(), sobrantes: [] };
  // Corte + achique: el vino termina en las vasijas definitivas, no en el pulmon.
  st.achique = st.corte && !!(ot.achique && ot.achique.destinos && ot.achique.destinos.length);
  st.entradas = {
    por_lote: ot.lotes.map(l => st.tipo === 'salida'
      // Traslado: arranca con lo previsto; se corrige con el caudalimetro.
      ? { litros_salida: l.litros_reales ?? l.litros_previstos ?? '' }
      : st.tipo === 'tanque'
      ? { vasija: l.destino_real || destinoDeLote(ot, l) || '', cm: '', litros_manual: l.litros_reales ?? '' }
      : { barricas_llenas: l.barricas_previstas ?? barricasEstimadas(l.litros_previstos) ?? '', mermas: [] }),
    corte: st.corte && !st.achique ? { vasija: ot.destino || '', cm: '', litros_manual: '' } : null,
    // Emitida por tipo: lo que no se supo al emitir (numero, cantidades) arranca vacio.
    destinos: st.achique ? ot.achique.destinos.map(d => d.tipo === 'tanque'
      ? { vasija: String(d.num ?? '').trim() ? 'T ' + String(d.num).trim() : '', cm: '', litros_manual: '' }
      : (Number(d.barricas) > 0 || Number(d.t50) > 0)
        ? { barricas_llenas: d.barricas ?? '', t50_llenas: d.t50 ?? '', mermas: [] }
        : { barricas_llenas: '', t50_llenas: '', mermas: [] }) : [],
  };
  // Tanques destino extra: un renglon por tanque, con su merma.
  // Barricas/T50 extra: llenas (las previstas, si se sabian) y barricas merma.
  const extraEnt = d => esChicas(d)
    ? { barricas_llenas: d.barricas || '', t50_llenas: d.t50 || '', mermas: [], merma: '' }
    : { vasija: 'T ' + d.num, cm: '', litros_manual: d.litros_reales ?? '', merma: '' };
  if (!st.corte) ot.lotes.forEach((l, i) => {
    if ((l.destinos_extra || []).length){ st.entradas.por_lote[i].extras = l.destinos_extra.map(extraEnt); st.entradas.por_lote[i].merma = ''; }
  });
  st.entradas.extras = st.corte && !st.achique ? (ot.destinos_extra || []).map(extraEnt) : [];
  // I3: el valor por defecto de barricas llenas, para saber si alguien ya lo toco.
  st.llenasIniciales = st.entradas.por_lote.map(e => e.barricas_llenas);
  st.llenasDestino = st.entradas.destinos.map(e => e.barricas_llenas);
  _paso1(st);
  // El Mapa se lee de entrada para ofrecer barriles en las mermas. Solo se
  // refrescan las listas: repintar el paso 1 le sacaria el foco a quien tipea,
  // y si ya paso al 2 lo devolveria para atras.
  leerMapa(ot.lotes.map(l => l.lote), [], ot.ot).then(m => {
    if (st.mapa) return;   // el paso 2 ya leyo uno mas nuevo
    st.mapa = m;
    if (st.paso !== 1) return;
    // M4: cerrarOverlay() cierra el diálogo (#overlay.open pasa a false): si
    // cancelaron/cerraron mientras se leia el Mapa, no hay que tocar nada.
    if (!$('overlay').open || !$('otcRaiz')) return;
    ot.lotes.forEach((_, i) => { const dl = $('otcBarr' + i); if (dl) dl.outerHTML = _dlBarriles(st, i); });
    _precargarLlenadosDelMapa(st);
    st.sobrantes = sobranteSegunMapa(st.ot, escaneosPorLote((m && m.escaneos_ot) || []), st.tipo);
    _precargarChicasExtra(st, m);
    // Solo se repinta si hay algo nuevo que mostrar. El dialogo arranca con
    // el foco adentro (showModal enfoca el primer campo): se lo devuelve al
    // mismo campo; lo tipeado ya esta en st (listener 'input').
    if (st.sobrantes.length){ _guardarCabecera(st); _repintarConFoco(st); }
  });
}

/* Repinta el paso 1 y devuelve el foco (y el cursor) al campo que lo tenia. */
function _repintarConFoco(st){
  const a = document.activeElement, raiz = $('otcRaiz');
  const sel = a && raiz && raiz.contains(a) ? (a.id ? '#' + a.id
    : ['id', 'f', 'i', 'j', 'dk'].filter(k => a.dataset[k] != null).map(k => `[data-${k}="${a.dataset[k]}"]`).join('')) : '';
  let pos = null;
  try { pos = a.selectionStart; } catch (e) { pos = null; }
  _paso1(st);
  const b = sel ? document.querySelector('#otcRaiz ' + sel) : null;
  if (!b) return;
  b.focus();
  try { if (pos != null) b.setSelectionRange(pos, pos); } catch (e) { /* number: sin cursor */ }
}

/* Barricas/T50 extra que ya estaban en la OT: si el Mapa tiene sus llenados
 * y nadie toco las cantidades, arrancan con lo del Mapa. */
function _precargarChicasExtra(st, m){
  if (!m || !m.escaneos_ot) return;
  const porLote = escaneosPorLote(m.escaneos_ot);
  for (const x of extrasDeOT(st.ot)){
    if (!esChicas(x.d)) continue;
    const ll = llenadoSegunMapa(porLote[codigoLote(x.d.lote)]);
    const e = _entradaExtra(st, x);
    if (!ll || !e || e.tocadas) continue;
    e.barricas_llenas = ll.barricas; e.t50_llenas = ll.t50;
    const id = _idExtra(x.i, x.k);
    for (const f of ['barricas_llenas', 't50_llenas']){
      const inp = document.querySelector(`#otcRaiz [data-id="${id}"][data-f="${f}"]`);
      if (inp) inp.value = e[f];
    }
  }
}

/* Muestras (0993): no hay litros ni vasijas que aplicar; confirmar solo la
 * marca ejecutada (quien y cuando). Se busca la OT viva despues del dialogo:
 * un guardado con fusion (409) pudo reemplazar los objetos. */
async function _confirmarSinMovimientos(ot, onListo){
  if (!await confirmar({ titulo: 'Confirmar ' + ot.ot,
    texto: 'Se marca la orden de muestras como ejecutada. No cambia litros, vasijas ni etapas de ningún lote.',
    si: 'Marcar ejecutada', no: 'Cancelar' })) return;
  const viva = (DATOS().ordenes_trabajo || []).find(o => o.id === ot.id);
  if (!viva || esEjecutado(viva)){
    avisar('La ' + ot.ot + ' ya no está pendiente (¿la confirmaron o borraron desde otra PC?).', { tipo: 'mal' });
    onListo();
    return;
  }
  confirmarOT(viva, [], { operario: usuarioActual(), pasos_cumplidos: true, comentario: '' }, usuarioActual(), hoyLocalISO());
  markDirty();
  onListo(viva);
  await guardar(false);
}

/* Si el escaner ya registro llenados de este lote con esta OT, "Barricas
 * llenas" arranca con esa cuenta (si nadie la toco todavia). */
function _precargarLlenadosDelMapa(st){
  if (st.tipo !== 'barricas' || !st.mapa || !st.mapa.escaneos_ot) return;
  const porLote = escaneosPorLote(st.mapa.escaneos_ot);
  st.ot.lotes.forEach((l, i) => {
    const ll = llenadoSegunMapa(porLote[codigoLote(l.lote)]);
    const e = st.entradas.por_lote[i];
    if (!ll || !e || String(e.barricas_llenas) !== String(st.llenasIniciales[i])) return;
    e.barricas_llenas = ll.barricas;
    st.llenasIniciales[i] = ll.barricas;
    const inp = document.querySelector(`#otcRaiz [data-i="${i}"][data-f="barricas_llenas"]`);
    if (inp) inp.value = ll.barricas;
  });
}

/* ---------- paso 1 ---------- */

function _dlVasijas(){
  return '<datalist id="otcVasijas">' + (DATOS().vasijas || []).filter(v => v.activa !== false)
    .map(v => `<option value="T ${escA(v.num)}">${esc(v.tipo)} · ${esc(v.cap_real)} L${v.tabla ? '' : ' · sin tabla'}</option>`)
    .join('') + '</datalist>';
}

function _dlBarriles(st, i){
  const ol = st.ot.lotes[i];
  // Se ofrecen tambien los barriles de la foto: en barricas a barricas se
  // rellenan los MISMOS barriles que la OT vacio, y la merma suele ser uno.
  const delMapa = ((st.mapa && st.mapa.por_lote) || {})[ol.lote] || [];
  return `<datalist id="otcBarr${i}">` + delMapa
    .filter(b => b.estado === 'LLENO' || b.estado === 'MERMO')
    .map(b => `<option value="${escA(b.num)}">${esc(b.estado)} · ${esc(b.cap ?? '')} L</option>`).join('') + '</datalist>';
}

function _bloqueTanque(id, e, conMerma){
  const merma = conMerma
    ? `\n    <input class="txt otc-num" type="number" step="any" data-id="${id}" data-f="merma" value="${escA(e.merma ?? '')}" placeholder="merma L" title="Vacío = se calcula">` : '';
  return `<input class="txt otc-vas" list="otcVasijas" data-id="${id}" data-f="vasija" value="${escA(e.vasija)}" placeholder="T 201">
    <input class="txt otc-num" type="number" step="any" min="0" data-id="${id}" data-f="cm" value="${escA(e.cm)}" placeholder="cm">
    <input class="txt otc-num" type="number" step="any" min="0" data-id="${id}" data-f="litros_manual" value="${escA(e.litros_manual)}" placeholder="litros">${merma}
    <span class="otc-calc" id="otcCalc${id}"></span>`;
}

/* Un destino extra: su lote nuevo, los previstos y cm/litros/merma (tanque)
 * o llenas y barricas merma (barricas/T50). Del mismo lote, sin merma propia. */
// Corte: un extra puede seguir siendo el lote del corte (no es lote nuevo).
const _queLote = (st, d) => st.corte && String(d.lote ?? '').trim() === String(st.ot.lote_corte.lote ?? '').trim()
  ? 'mismo lote del corte ' : 'lote nuevo ';

function _bloqueExtra(id, d, e, clase = 'otc-extra', st = null){
  return `<div class="${clase}" style="margin-top:8px"><b>${esc(nombreExtra(d))} · ${st ? _queLote(st, d) : 'lote nuevo '}${esc(d.lote)}</b>
   <span style="color:var(--muted)">(${d.litros == null ? 'sin litros previstos' : fmtL(d.litros) + ' previstos'})</span><br>
   ${esChicas(d) ? _bloqueChicasExtra(id, e) : _bloqueTanque(id, e, !(st && _queLote(st, d).startsWith('mismo')))}</div>`;
}

/* Barricas/T50 de un destino extra: como las chicas del achique, con data-id. */
function _bloqueChicasExtra(id, e){
  const mermas = e.mermas.map((m, j) => `<div class="otc-merma">
      <input class="txt" data-id="${id}" data-j="${j}" data-f="barril" value="${escA(m.barril)}" placeholder="N° barril">
      <input class="txt otc-num" type="number" step="any" min="0" data-id="${id}" data-j="${j}" data-f="litros" value="${escA(m.litros)}" placeholder="litros">
      <button class="btn" data-xquitar="${id}:${j}" title="Quitar">✕</button></div>`).join('');
  return `<label>Barricas llenas <input class="txt otc-num" type="number" min="0" step="1" data-id="${id}" data-f="barricas_llenas" value="${escA(e.barricas_llenas)}"></label>
    <label>T50 llenos <input class="txt otc-num" type="number" min="0" step="1" data-id="${id}" data-f="t50_llenas" value="${escA(e.t50_llenas)}"></label>
    <div class="otc-mermas">${mermas}<button class="btn" data-xagregar="${id}">+ Barrica merma</button></div>`;
}

function _bloqueBarricas(st, i, e){
  const mermas = e.mermas.map((m, j) => `<div class="otc-merma">
      <input class="txt" list="otcBarr${i}" data-i="${i}" data-j="${j}" data-f="barril" value="${escA(m.barril)}" placeholder="N° barril">
      <input class="txt otc-num" type="number" step="any" min="0" data-i="${i}" data-j="${j}" data-f="litros" value="${escA(m.litros)}" placeholder="litros">
      <button class="btn" data-quitar="${i}:${j}" title="Quitar">✕</button></div>`).join('');
  return `<label>Barricas llenas <input class="txt otc-num" type="number" min="0" step="1" data-i="${i}" data-f="barricas_llenas" value="${escA(e.barricas_llenas)}"></label>
    <div class="otc-mermas">${mermas}<button class="btn" data-agregar="${i}">+ Barrica merma</button></div>${_dlBarriles(st, i)}`;
}

/* Traslado: solo los litros que salieron (caudalimetro) y adonde van. */
function _bloqueSalida(st, i, e){
  const adonde = st.ot.destino ? 'sale a ' + esc(st.ot.destino) : 'sale de la bodega';
  return `<label>Litros que salieron <input class="txt otc-num" style="width:100px" type="number" step="any" min="0" data-i="${i}" data-f="litros_salida" value="${escA(e.litros_salida)}"></label>
    <span style="color:var(--muted)">${adonde}</span>`;
}

/* Barricas + T50 de un Corte + achique: llenas y mermas, como "TQ a barricas". */
function _bloqueChicas(k, e){
  const mermas = e.mermas.map((m, j) => `<div class="otc-merma">
      <input class="txt" data-dk="${k}" data-j="${j}" data-f="barril" value="${escA(m.barril)}" placeholder="N° barril">
      <input class="txt otc-num" type="number" step="any" min="0" data-dk="${k}" data-j="${j}" data-f="litros" value="${escA(m.litros)}" placeholder="litros">
      <button class="btn" data-dquitar="${k}:${j}" title="Quitar">✕</button></div>`).join('');
  return `<label>Barricas llenas <input class="txt otc-num" type="number" min="0" step="1" data-dk="${k}" data-f="barricas_llenas" value="${escA(e.barricas_llenas)}"></label>
    <label>T50 llenos <input class="txt otc-num" type="number" min="0" step="1" data-dk="${k}" data-f="t50_llenas" value="${escA(e.t50_llenas)}"></label>
    <div class="otc-mermas">${mermas}<button class="btn" data-dagregar="${k}">+ Barrica merma</button></div>`;
}

function _bloqueAchique(st){
  const filas = st.ot.achique.destinos.map((d, k) => {
    const e = st.entradas.destinos[k];
    const quien = d.nuevo ? 'lote nuevo ' + esc(d.lote) : 'lote del corte ' + esc(d.lote);
    const previstos = d.litros == null || d.litros === '' ? 'sin litros previstos' : fmtL(d.litros) + ' previstos';
    // Pedido solo por tipo: el tanque se elige aca.
    const elegir = d.tipo === 'tanque' && !String(d.num ?? '').trim() ? ' · elegí el tanque' : '';
    return `<div class="otc-corte"><b>${esc(nombreDestinoLargo(d))} · ${quien}</b>
      <span style="color:var(--muted)">(${esc(previstos)}${elegir})</span><br>
      ${d.tipo === 'tanque' ? _bloqueTanque('d' + k, e) : _bloqueChicas(k, e)}</div>`;
  }).join('');
  return `<div style="color:var(--muted);font-size:13px;margin-bottom:6px">El vino pasa por ${esc(st.ot.destino || 'el pulmón')} y termina en estas vasijas (el pulmón queda vacío):</div>${filas}`;
}

function _paso1(st){
  // Critico: una vez aplicada la propuesta (st.aplicada), la OT ya quedo
  // confirmada en memoria; "Volver" queda deshabilitado para siempre (ver
  // _aplicar) y esto es el freno defensivo si algo lo llamara igual.
  if (st.aplicada) return;
  const { ot } = st;
  const filas = ot.lotes.map((l, i) => {
    const e = st.entradas.por_lote[i];
    // Tanques destino extra del lote: debajo del destino 1; en tanque, el
    // destino 1 suma su propia merma (en barricas no).
    const extras = !st.corte && e.extras ? (l.destinos_extra || [])
      .map((d, k) => _bloqueExtra('x' + i + '_' + k, d, e.extras[k])).join('') : '';
    const destino = st.corte
      ? `<span style="color:var(--muted)">${st.achique ? 'va al pulmón' : 'va al tanque del corte'}</span>`
      : st.tipo === 'salida' ? _bloqueSalida(st, i, e)
      : (st.tipo === 'tanque' ? _bloqueTanque(String(i), e, !!e.extras) : _bloqueBarricas(st, i, e)) + extras + _sobrante(st, i);
    return `<tr><td><b>${esc(l.lote)}</b><br><span style="color:var(--muted)">${esc(l.id_texto)}</span></td>
      <td>${esc(fmtL(l.litros_previstos))}</td><td class="otc-dest">${destino}</td></tr>`;
  }).join('');
  const corte = (!st.corte ? '' : st.achique ? _bloqueAchique(st) : `<div class="otc-corte"><b>Tanque del corte · lote ${esc(ot.lote_corte.lote)}</b>
      ${_bloqueTanque('c', st.entradas.corte)}</div>`
    + (ot.destinos_extra || []).map((d, k) => _bloqueExtra('xc_' + k, d, st.entradas.extras[k], 'otc-corte', st)).join(''))
    // Lo que sobro del corte (con o sin achique).
    + (st.corte ? _sobrante(st, null) : '');

  st.paso = 1;
  mostrarOverlay(`<div id="otcRaiz">
<h3 style="margin:0 0 4px">✓ Confirmar ${esc(ot.ot)} · 1 de 2: lo que pasó</h3>
<p style="margin:0 0 12px;color:var(--muted);font-size:13px">${st.tipo === 'salida'
    ? 'Cargá los <b>litros que salieron</b> de cada lote (caudalímetro). Sus vasijas quedan vacías.'
    : st.tipo === 'tanque'
    ? 'Elegí el tanque y cargá los <b>cm de merma</b> medidos; si el tanque no tiene tabla, cargá los litros.'
    : 'Cargá cuántas barricas quedaron llenas y agregá las que quedaron mermas con sus litros.'}</p>
${_dlVasijas()}${corte}
<div class="otc-scroll"><table class="otc-tabla"><thead><tr><th>Lote</th><th>Previstos</th><th>Destino</th></tr></thead>
<tbody>${filas}</tbody></table></div>
<div style="display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center;margin-top:12px">
  <label>Operario</label><input class="txt" id="otcOperario" value="${escA(st.operario)}" placeholder="Quién lo hizo…">
  <label>Pasos</label><label><input type="checkbox" id="otcPasos"${st.pasos ? ' checked' : ''}> Todos los pasos de la hoja están cumplidos</label>
  <label>Comentario</label><input class="txt" id="otcComentario" value="${escA(st.comentario)}">
</div>
<div class="msg err" id="otcErr" style="display:none;margin-top:10px"></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="otcCancelar">Cancelar</button>
  <button class="btn primary" id="otcSig">Siguiente →</button>
</div></div>`);

  // Los listeners van en #otcRaiz y no en #overlayBox: el box sobrevive entre
  // overlays y cada repintado le sumaria otro listener.
  const box = $('otcRaiz');
  box.addEventListener('input', ev => _leerCampo(st, ev.target));
  box.addEventListener('change', ev => {
    const r = ev.target.closest('[data-alote]');
    if (r){ const a = st.agregados[+r.dataset.alote];
      a.lote = r.value === 'mismo' ? _padreDe(st, a.i) : _loteNuevoPropuesto(st, a.i); _guardarCabecera(st); return _paso1(st); }
    const n = ev.target.closest('[data-alotenum]');
    if (n) st.agregados[+n.dataset.alotenum].lote = n.value.trim();
  });
  box.addEventListener('click', ev => {
    // Lo que sobro: sumar (a mano o lo del Mapa), quitar, ignorar la tarjeta.
    const am = ev.target.closest('[data-amas]'), aq = ev.target.closest('[data-aquitar]');
    const as = ev.target.closest('[data-asumar]'), ai = ev.target.closest('[data-aignorar]');
    const lugar = c => c === 'c' ? null : Number(c);
    if (am){ const [c, tipo] = am.dataset.amas.split(':'); const i = lugar(c);
      return _agregar(st, { i, tipo, barricas: '', t50: '', num: '', lote: _padreDe(st, i) }); }
    if (aq) return _quitarAgregado(st, +aq.dataset.aquitar);
    if (as){ const i = lugar(as.dataset.asumar), s = st.sobrantes.find(x => _claveA(x.i) === as.dataset.asumar);
      return _agregar(st, { i, tipo: 'chicas', barricas: s.barricas, t50: s.t50, lote: _padreDe(st, i), codigos: s.codigos }); }
    if (ai){ _guardarCabecera(st); st.ignorados.add(ai.dataset.aignorar); return _paso1(st); }
    const xag = ev.target.closest('[data-xagregar]'), xqu = ev.target.closest('[data-xquitar]');
    if (xag){
      _guardarCabecera(st);
      const e = _entradaDe(st, xag.dataset.xagregar);
      // Igual que en los lotes: si nadie toco las llenas, la merma sale de ellas.
      if (Number(e.barricas_llenas) > 0 && !e.mermas.length && !e.tocadas) e.barricas_llenas = Number(e.barricas_llenas) - 1;
      e.mermas.push({ barril: '', litros: '' });
      return _paso1(st);
    }
    if (xqu){ _guardarCabecera(st); const p = xqu.dataset.xquitar.lastIndexOf(':');
      _entradaDe(st, xqu.dataset.xquitar.slice(0, p)).mermas.splice(+xqu.dataset.xquitar.slice(p + 1), 1); return _paso1(st); }
    const dag = ev.target.closest('[data-dagregar]'), dqu = ev.target.closest('[data-dquitar]');
    if (dag){
      _guardarCabecera(st);
      const k = +dag.dataset.dagregar, e = st.entradas.destinos[k], ini = st.llenasDestino[k];
      // I3: igual que en los lotes: las previstas ya incluyen la que quedo merma.
      if (ini !== '' && ini != null && Number(ini) > 0 && String(e.barricas_llenas) === String(ini))
        e.barricas_llenas = Number(ini) - 1;
      e.mermas.push({ barril: '', litros: '' });
      return _paso1(st);
    }
    if (dqu){ _guardarCabecera(st); const [k, j] = dqu.dataset.dquitar.split(':').map(Number);
      st.entradas.destinos[k].mermas.splice(j, 1); return _paso1(st); }
    const ag = ev.target.closest('[data-agregar]'), qu = ev.target.closest('[data-quitar]');
    if (ag){
      _guardarCabecera(st);
      const i = +ag.dataset.agregar, e = st.entradas.por_lote[i], ini = st.llenasIniciales[i];
      // I3: las previstas ya incluyen la barrica que quedo merma. Si nadie
      // toco "Barricas llenas", al agregar la merma se le resta una (una sola
      // vez: despues ya no coincide con el valor inicial).
      if (ini !== '' && ini != null && Number(ini) > 0 && String(e.barricas_llenas) === String(ini))
        e.barricas_llenas = Number(ini) - 1;
      e.mermas.push({ barril: '', litros: '' });
      _paso1(st);
    }
    if (qu){ _guardarCabecera(st); const [i, j] = qu.dataset.quitar.split(':').map(Number);
      st.entradas.por_lote[i].mermas.splice(j, 1); _paso1(st); }
  });
  $('otcCancelar').addEventListener('click', () => cerrarOverlay());
  $('otcSig').addEventListener('click', () => _irAPaso2(st));
  ot.lotes.forEach((_, i) => _pintarCalc(st, String(i)));
  if (st.corte && !st.achique) _pintarCalc(st, 'c');
  if (st.achique) st.ot.achique.destinos.forEach((d, k) => { if (d.tipo === 'tanque') _pintarCalc(st, 'd' + k); });
  st.entradas.por_lote.forEach((e, i) => (e.extras || []).forEach((_, k) => _pintarCalc(st, 'x' + i + '_' + k)));
  (st.entradas.extras || []).forEach((_, k) => _pintarCalc(st, 'xc_' + k));
}

function _entradaDe(st, id){
  if (id === 'c') return st.entradas.corte;
  if (String(id).startsWith('xc_')) return st.entradas.extras[+String(id).slice(3)];
  if (String(id).startsWith('x')){ const [i, k] = String(id).slice(1).split('_').map(Number); return st.entradas.por_lote[i].extras[k]; }
  if (String(id).startsWith('d')) return st.entradas.destinos[+String(id).slice(1)];
  return st.entradas.por_lote[+id];
}

/* La entrada del paso 1 de un tanque extra ({i, k}; i null en un Corte). */
function _entradaExtra(st, x){
  return x.i == null ? (st.entradas.extras || [])[x.k] : ((st.entradas.por_lote[x.i] || {}).extras || [])[x.k];
}

/* ---------- sobrante (agregados al confirmar) ---------- */
// Clave del lugar que recibe el agregado: 'c' = el corte; '0','1'… = lote i.
const _claveA = i => i == null ? 'c' : String(i);
const _padreDe = (st, i) => String(i == null ? st.ot.lote_corte.lote : st.ot.lotes[i].lote);
// Extras que ya tenia la OT en ese lugar (los agregados van despues).
const _baseExtras = (st, i) => (i == null ? st.ot.destinos_extra || [] : st.ot.lotes[i].destinos_extra || []).length;
// La lista de entradas del paso 1 de ese lugar (se crea si no hay).
function _entradasDe(st, i){
  if (i == null) return st.entradas.extras || (st.entradas.extras = []);
  const e = st.entradas.por_lote[i];
  if (!e.extras){ e.extras = []; e.merma = e.merma ?? ''; }
  return e.extras;
}
// Id del bloque (el mismo esquema que _entradaDe): 'xc_k' o 'xi_k'.
const _idExtra = (i, k) => i == null ? 'xc_' + k : 'x' + i + '_' + k;
// La entrada del paso 1 del agregado j (va despues de los extras de la OT).
function _entradaAgregado(st, j){
  const a = st.agregados[j];
  const pos = st.agregados.slice(0, j).filter(x => _claveA(x.i) === _claveA(a.i)).length;
  return _entradasDe(st, a.i)[_baseExtras(st, a.i) + pos];
}
// Numero propuesto para un lote nuevo: siguiente libre del año del vino.
function _loteNuevoPropuesto(st, i){
  const padre = _padreDe(st, i);
  const anio = anioDeLote(padre, Number(String(st.ot.fecha || hoyISO()).slice(0, 4)));
  const tomados = [...extrasDeOT(st.ot).map(x => x.d.lote), ...st.agregados.map(a => a.lote)];
  return asignarLotesExtra([{}], { lotes: DATOS().lotes || [], anio, reservados: tomados })[0].lote;
}
function _agregar(st, a){
  _guardarCabecera(st);
  const ents = _entradasDe(st, a.i);
  ents.push(a.tipo === 'chicas'
    ? { barricas_llenas: a.barricas || '', t50_llenas: a.t50 || '', mermas: [], merma: '' }
    : { vasija: a.num ? 'T ' + String(a.num).replace(/^t\s*/i, '') : '', cm: '', litros_manual: '', merma: '' });
  st.agregados.push(a);
  _paso1(st);
}
function _quitarAgregado(st, j){
  _guardarCabecera(st);
  const a = st.agregados[j];
  const pos = st.agregados.slice(0, j).filter(x => _claveA(x.i) === _claveA(a.i)).length;
  _entradasDe(st, a.i).splice(_baseExtras(st, a.i) + pos, 1);
  st.agregados.splice(j, 1);
  _paso1(st);
}
/* Lo cargado en el paso 1 pasa al agregado (lo que se guarda en la OT):
 * el tanque elegido o las barricas/T50 llenas. */
function _sincronizarAgregados(st){
  st.agregados.forEach((a, j) => {
    const e = _entradaAgregado(st, j) || {};
    if (a.tipo === 'tanque') a.num = String(e.vasija || '').trim().replace(/^t\s*/i, '');
    else { a.barricas = e.barricas_llenas ?? ''; a.t50 = e.t50_llenas ?? ''; }
  });
}

// Bloques de los agregados de un lugar, debajo de su destino. Los del mismo
// lote no llevan "merma L": su merma va en la del lote (propuesta-ot.js).
function _bloquesAgregados(st, i){
  const base = _baseExtras(st, i);
  let pos = 0;
  return st.agregados.map((a, j) => {
    if (_claveA(a.i) !== _claveA(i)) return '';
    const k = base + pos++, id = _idExtra(i, k), e = _entradasDe(st, i)[k];
    const padre = _padreDe(st, i), mismo = String(a.lote) === padre;
    const nombre = a.tipo === 'chicas' ? 'Barricas / T50' : 'Otro tanque';
    return `<div class="otc-extra" style="margin-top:8px"><b>＋ ${esc(nombre)} · agregado</b>
      <button class="btn" data-aquitar="${j}" title="Quitar" style="float:right">✕</button><br>
      ${a.tipo === 'chicas' ? _bloqueChicasExtra(id, e) : _bloqueTanque(id, e, !mismo)}
      <div style="margin-top:6px">Lote:
        <label><input type="radio" name="alote${j}" data-alote="${j}" value="mismo"${mismo ? ' checked' : ''}> mismo lote ${esc(padre)}</label>
        <label><input type="radio" name="alote${j}" data-alote="${j}" value="nuevo"${mismo ? '' : ' checked'}> lote nuevo</label>
        ${mismo ? '' : `<input class="txt" style="width:80px" data-alotenum="${j}" value="${escA(a.lote)}" inputmode="numeric" aria-label="Número del lote nuevo">`}
      </div></div>`;
  }).join('');
}

// Tarjeta del Mapa + boton "Sobro vino" de un lugar (corte o lote i).
function _sobrante(st, i){
  if (st.tipo === 'salida') return '';
  const s = (st.sobrantes || []).find(x => _claveA(x.i) === _claveA(i));
  const yaSumado = st.agregados.some(a => _claveA(a.i) === _claveA(i) && a.codigos);
  const tarjeta = s && !yaSumado && !st.ignorados.has(_claveA(i)) ? `<div class="msg warn" style="margin-top:8px">
      🟡 El Mapa tiene vasijas llenadas con esta OT que no estaban previstas:
      <b>${esc(nombreExtra({ tipo: 'chicas', barricas: s.barricas, t50: s.t50 }))}</b> (${esc(s.codigos.join(', '))}), lote ${esc(s.lote)}.
      ${s.sinCap.length ? `<br>Sin capacidad conocida, no se suman: ${esc(s.sinCap.join(', '))}.` : ''}
      <div style="margin-top:6px"><button class="btn primary" data-asumar="${_claveA(i)}">Sumar a la OT</button>
      <button class="btn" data-aignorar="${_claveA(i)}">Ignorar</button></div></div>` : '';
  // Si el destino ya son barricas (OT a barricas, o Corte + achique con base
  // en barricas/T50), las llenas del Mapa ya se cuentan ahi: sumar barricas
  // aparte las contaria dos veces. Queda solo "otro tanque".
  const dest = i == null && st.achique ? st.ot.achique.destinos : null;
  const sinChicas = st.tipo === 'barricas' || (dest && (dest[indiceBase(dest)] || {}).tipo === 'chicas');
  return tarjeta + _bloquesAgregados(st, i) + `<div style="margin-top:6px">
      ${sinChicas ? '' : `<button class="btn" data-amas="${_claveA(i)}:chicas">＋ Sobró vino: barricas / T50</button>`}
      <button class="btn" data-amas="${_claveA(i)}:tanque">＋ Sobró vino: otro tanque</button></div>`;
}

/* Vuelve a enganchar st.ot con la OT del DATOS() de AHORA. Devuelve un texto
 * de error si no se puede seguir, o '' si st.ot quedo al dia.
 *
 * El overlay captura la OT al abrirse, pero un guardado que termina mientras
 * esta abierto puede pasar por un 409: nucleo.guardar() fusiona y REEMPLAZA
 * todos los objetos de DATOS(). Confirmar sobre la OT capturada aplicaba los
 * litros a los lotes nuevos (aplicarPropuesta los busca por numero) pero
 * escribia estado y `aplicado` en el huerfano: la OT seguia PENDIENTE en los
 * datos y se podia confirmar dos veces (envases restados dos veces, mermas
 * duplicadas). */
function _engancharOT(st){
  const viva = (DATOS().ordenes_trabajo || []).find(o => o.id === st.ot.id);
  if (!viva) return 'Esta OT ya no está en los datos (¿la borraron desde otra PC?). Cerrá esta ventana: no se aplicó nada.';
  if (esEjecutado(viva)) return 'Esta OT ya figura como confirmada (¿la confirmaron desde otra PC?). Cerrá esta ventana: no se aplicó nada.';
  // Las entradas del paso 1 van por posicion de lote: si la OT cambio de
  // lotes, ya no se corresponden con lo que se cargo.
  const lotes = o => (o.lotes || []).map(l => String(l.lote)).join('|') + '#' + String((o.lote_corte && o.lote_corte.lote) || '')
    + '#' + ((o.achique && o.achique.destinos) || []).map(d => String(d.lote)).join('|')
    + '#' + extrasDeOT(o).map(x => x.d.lote).join('|');
  if (lotes(viva) !== lotes(st.ot)) return 'Los lotes de esta OT cambiaron mientras la confirmabas. Cerrá esta ventana y volvé a abrirla: no se aplicó nada.';
  st.ot = viva;
  return '';
}

function _leerCampo(st, el){
  const f = el.dataset.f;
  if (!f) return;
  if (el.dataset.id != null){
    const e = _entradaDe(st, el.dataset.id);
    if (el.dataset.j != null){ e.mermas[+el.dataset.j][f] = el.value; return; }
    e[f] = el.value;
    if (f === 'barricas_llenas' || f === 't50_llenas') e.tocadas = true;
    _pintarCalc(st, el.dataset.id); return;
  }
  if (el.dataset.dk != null){
    const e = st.entradas.destinos[+el.dataset.dk];
    if (el.dataset.j != null) e.mermas[+el.dataset.j][f] = el.value; else e[f] = el.value;
    return;
  }
  const e = st.entradas.por_lote[+el.dataset.i];
  if (el.dataset.j != null) e.mermas[+el.dataset.j][f] = el.value; else e[f] = el.value;
}

/* Litros en vivo al lado del tanque: "4.075 L de 4.200". */
function _pintarCalc(st, id){
  const out = $('otcCalc' + id);
  if (!out) return;
  const e = _entradaDe(st, id);
  const v = buscarVasija(DATOS().vasijas, e.vasija);
  if (!v){ out.textContent = e.vasija ? 'no está en el padrón: cargá los litros' : ''; return; }
  if (!v.tabla){ out.textContent = `${v.tipo} · sin tabla: cargá los litros`; return; }
  if (e.cm === '' || e.cm == null){ out.textContent = `${v.tipo} · ${v.cap_real} L: cargá los cm`; return; }
  const r = litrosPorCm(v, e.cm);
  out.textContent = r.error === 'fuera-de-rango' ? `fuera de la tabla (máx. ${r.max} cm)`
    : r.error ? 'cm inválido' : `${fmtL(r.litros)} de ${fmtL(v.cap_real)}`;
}

function _guardarCabecera(st){
  if (!$('otcOperario')) return;
  st.operario = $('otcOperario').value.trim();
  st.pasos = $('otcPasos').checked;
  st.comentario = $('otcComentario').value;
}

async function _irAPaso2(st){
  _guardarCabecera(st);
  const err = m => { $('otcErr').textContent = m; $('otcErr').style.display = ''; };
  if (!st.operario) return err('Falta el operario: la confirmación registra quién hizo el trabajo.');
  // Los agregados validan y entran a la propuesta como destinos extra.
  _sincronizarAgregados(st);
  const lugarSinLote = st.agregados.find(a => !String(a.lote || '').trim());
  if (lugarSinLote) return err('Falta el número del lote nuevo de lo que sobró.');
  const repetido = st.agregados.find(a => String(a.lote) !== _padreDe(st, a.i) && (DATOS().lotes || []).some(l => String(l.lote) === String(a.lote)));
  if (repetido) return err(`El lote ${repetido.lote} ya existe: elegí "mismo lote" u otro número.`);
  const nuevosA = st.agregados.filter(a => String(a.lote) !== _padreDe(st, a.i)).map(a => String(a.lote));
  if (new Set(nuevosA).size !== nuevosA.length) return err('Dos de lo que sobró tienen el mismo lote nuevo: cambiá uno.');
  const tanqueSinNum = st.agregados.find(a => a.tipo === 'tanque' && !a.num);
  if (tanqueSinNum) return err('Falta el tanque de lo que sobró en el lote ' + _padreDe(st, tanqueSinNum.i) + '.');
  const otV = otConAgregados(st.ot, st.agregados);
  // Como al emitir: un tanque agregado no puede ser un destino de la OT ni
  // estar dos veces, un lote nuevo no puede estar ocupado, y una sola fila de
  // barricas/T50 por lugar.
  if (st.agregados.length){
    const vas = e => String((e && e.vasija) || '').trim();
    const destinos = st.corte ? { c: st.achique ? String(st.ot.destino || '') : vas(st.entradas.corte) || String(st.ot.destino || '') }
      : Object.fromEntries(st.ot.lotes.map((l, i) => [i, st.tipo === 'tanque' ? vas(st.entradas.por_lote[i]) || destinoDeLote(st.ot, l) : '']));
    const tanquesOT = [...Object.values(destinos), ...(st.achique ? st.entradas.destinos.map(vas) : [])];
    const v = validarAgregados(otV, { lotes: DATOS().lotes || [], destinos, tanquesOT });
    if (!v.ok) return err(v.error);
  }
  // M1: sin tanque destino (y sin ot.destino de respaldo) el lote/movimiento
  // queda sin vasija actual. Se valida antes de tocar la red.
  if (st.tipo === 'tanque'){
    if (st.achique){
      const k = st.ot.achique.destinos.findIndex((d, i) => d.tipo === 'tanque' && !String(st.entradas.destinos[i].vasija || '').trim());
      if (k !== -1){
        const d = st.ot.achique.destinos[k];
        return err('Falta el tanque de ' + nombreDestino(d) + (d.lote ? ' (lote ' + d.lote + ')' : '') + '.');
      }
    } else if (st.corte){
      if (!String(st.entradas.corte.vasija || '').trim()) return err('Falta el tanque destino del corte.');
    } else {
      const i = st.entradas.por_lote.findIndex(e => !String(e.vasija || '').trim());
      if (i !== -1) return err('Falta el tanque destino del lote ' + st.ot.lotes[i].lote + '.');
    }
  }
  // Tanques destino extra (tambien en las plantillas de barricas): cada uno con su tanque.
  const extraSinTanque = extrasDeOT(otV).find(x => !esChicas(x.d) && !String((_entradaExtra(st, x) || {}).vasija || '').trim());
  if (extraSinTanque) return err('Falta el tanque extra del lote ' + extraSinTanque.padre + ' (' + _queLote(st, extraSinTanque.d) + extraSinTanque.d.lote + ').');
  const extraSinLlenas = extrasDeOT(otV).find(x => {
    const e = esChicas(x.d) && _entradaExtra(st, x);
    return e && !(Math.floor(Number(e.barricas_llenas) || 0) + Math.floor(Number(e.t50_llenas) || 0)) && !(e.mermas || []).length;
  });
  if (extraSinLlenas) return err('Faltan cuántas barricas o T50 se llenaron (' + _queLote(st, extraSinLlenas.d) + extraSinLlenas.d.lote + ').');
  const lotes = st.ot.lotes.map(l => l.lote).concat(st.corte ? [st.ot.lote_corte.lote] : [])
    .concat(st.achique ? st.ot.achique.destinos.filter(d => d.nuevo).map(d => d.lote) : [])
    .concat(extrasDeOT(otV).map(x => x.d.lote));
  const mermasDestinos = (st.achique ? st.entradas.destinos.flatMap(e => e.mermas || []) : [])
    .concat(extrasDeOT(otV).flatMap(x => esChicas(x.d) ? (_entradaExtra(st, x) || {}).mermas || [] : []));
  const nums = st.entradas.por_lote.flatMap(e => (e.mermas || []).map(m => String(m.barril || '').trim()))
    .concat(mermasDestinos.map(m => String(m.barril || '').trim())).filter(Boolean);
  // I4: una barrica merma no puede repetirse ni tener ya otra merma
  // pendiente. Puede ser uno de los barriles que la OT vacio (barricas a
  // barricas rellena los mismos), y la merma pendiente que esta OT va a cerrar
  // sola (mismo lote, barril en la foto: ver mermas_cerradas) no cuenta.
  // Se valida antes de tocar la red.
  const vistos = new Set();
  const seCierra = m => st.ot.lotes.some(l => codigoLote(l.lote) === codigoLote(m.lote)
    && (l.barriles || []).some(b => String(b.num).trim() === String(m.barril).trim()));
  const pendientes = new Set((DATOS().mermas || []).filter(m => estaPendiente(m) && !seCierra(m))
    .map(m => String(m.barril).trim()));
  for (const n of nums){
    if (vistos.has(n)) return err(`El barril ${n} está repetido en las mermas.`);
    vistos.add(n);
    if (pendientes.has(n)) return err(`El barril ${n} ya tiene una merma pendiente.`);
  }
  $('otcSig').disabled = true;

  st.mapa = await leerMapa(lotes, nums, st.ot.ot);
  // M4: cerrarOverlay() cierra el diálogo (#overlay.open pasa a false): si
  // cancelaron (Cancelar/Escape/click afuera) mientras se leia el Mapa, no
  // hay que resucitar el paso 2.
  if (!$('overlay').open || !$('otcRaiz')) return;

  // La propuesta se arma con la OT viva (ver _engancharOT).
  const errOT = _engancharOT(st);
  if (errOT) return err(errOT);
  // La OT viva con lo que sobro (el paso 2 la lee para los extras).
  const otV2 = otConAgregados(st.ot, st.agregados);
  st.otV = otV2;

  // Una barrica merma tiene que existir en el Mapa (mismo criterio que el escáner).
  if (nums.length){
    if (!st.mapa || !st.mapa.por_num){ $('otcSig').disabled = false; return err('No se pudo consultar el Mapa para validar las barricas mermas. Probá de nuevo.'); }
    const faltan = nums.filter(n => !st.mapa.por_num[n]);
    if (faltan.length){ $('otcSig').disabled = false; return err('Estos barriles no existen en el Mapa: ' + faltan.join(', ')); }
    st.entradas.por_lote.forEach((e, i) => { for (const m of e.mermas || []){
      const b = st.mapa.por_num[String(m.barril).trim()];
      if (!b) continue;
      m.cap = b.cap;
      // C1: el ts solo sirve de sello si el relleno ya se escaneo (LLENO con este lote); si no (p.ej. sigue VACIO), null y vale la regla estricta de fecha.
      const yaLleno = b.estado === 'LLENO' && codigoLote(b.lote) === codigoLote(st.ot.lotes[i].lote);
      m.mapa_ts = yaLleno ? (b.ts ?? null) : null;
    } });
    for (const x of extrasDeOT(otV2)) if (esChicas(x.d)) for (const m of (_entradaExtra(st, x) || {}).mermas || []){
      const b = st.mapa.por_num[String(m.barril).trim()];
      if (!b) continue;
      m.cap = b.cap;
      const yaLleno = b.estado === 'LLENO' && codigoLote(b.lote) === codigoLote(x.d.lote);
      m.mapa_ts = yaLleno ? (b.ts ?? null) : null;
    }
    if (st.achique) st.entradas.destinos.forEach((e, k) => { for (const m of e.mermas || []){
      const b = st.mapa.por_num[String(m.barril).trim()];
      if (!b) continue;
      m.cap = b.cap;
      const yaLleno = b.estado === 'LLENO' && codigoLote(b.lote) === codigoLote(st.ot.achique.destinos[k].lote);
      m.mapa_ts = yaLleno ? (b.ts ?? null) : null;
    } });
  }

  try {
    // Los lotes nuevos de lo que sobro todavia no existen (se crean al
    // aplicar): la propuesta los ve como hijos en 0 L, como los creara
    // incorporarAgregados.
    const soloAgregados = { ...otV2,
      destinos_extra: (otV2.destinos_extra || []).filter(d => d.al_confirmar),
      lotes: otV2.lotes.map(l => ({ ...l, destinos_extra: (l.destinos_extra || []).filter(d => d.al_confirmar) })) };
    const provisorios = armarHijosExtra(soloAgregados,
      l => (DATOS().lotes || []).find(x => String(x.lote) === String(l)), DATOS().lotes || []);
    st.propuesta = proponer({ ot: otV2, lotes: [...(DATOS().lotes || []), ...provisorios], mermas: DATOS().mermas, padron: DATOS().vasijas,
      entradas: st.entradas, hoy: hoyISO(), escaneos: st.mapa && st.mapa.escaneos_ot });
    st.noTocar = new Set();
  } catch (e) {
    console.error(e);
    $('otcSig').disabled = false;
    return err('No se pudo armar la propuesta: ' + e.message);
  }
  _paso2(st);
}

/* ---------- paso 2 ---------- */

const NOMBRE_ENV = { cap500: ['t500', 't500'], cap225: ['barrica', 'barricas'], cap200: ['t200', 't200'], cap50: ['T50', 'T50'] };
const n0 = x => { const v = Number(x); return Number.isFinite(v) && v > 0 ? v : 0; };

/* "17 barricas · 1 T50 · 3.000 L en tanque", o "vacío". */
function _enPalabras(env){
  const partes = [];
  for (const k of ['cap500', 'cap225', 'cap200', 'cap50']){
    const n = n0(env && env[k]);
    if (n) partes.push(`${n} ${NOMBRE_ENV[k][n === 1 ? 0 : 1]}`);
  }
  const g = n0(env && env.vasija_grande);
  if (g) partes.push(`${g.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L en tanque`);
  return partes.join(' · ') || 'vacío';
}

function _fechaCorta(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}` : '';
}

/* De donde salio el "despues" de este lote. */
function _fuenteDe(st, it, ol){
  const porLote = (st.mapa && st.mapa.escaneos_ot) ? escaneosPorLote(st.mapa.escaneos_ot) : {};
  const g = porLote[codigoLote(it.lote)];
  if (it.fuente === 'mapa' && g){
    const fechas = g.fechas.map(_fechaCorta).filter(Boolean).join(', ');
    return { clase: 'otc-coincide', texto: `Según el Mapa: vació ${g.vaciados.length} ${g.vaciados.length === 1 ? 'barril' : 'barriles'}${fechas ? ' el ' + fechas : ''}` };
  }
  const hayOtros = Object.keys(porLote).length > 0;
  const vaciaChicos = ['cap500', 'cap225', 'cap200', 'cap50'].some(k => n0(it.antes && it.antes[k]) > n0(it.despues && it.despues[k]));
  if (hayOtros && !vaciaChicos) return { clase: 'otc-sin-datos', texto: 'Según la OT (el escáner no mide tanques)' };
  return { clase: hayOtros ? 'otc-difiere' : 'otc-sin-datos',
           texto: hayOtros ? 'Según la OT: el Mapa no tiene escaneos de este lote' : 'Según la OT (el Mapa no tiene escaneos de esta OT)' };
}

const fmtN = (x, clave) => clave === 'vasija_grande'
  ? Number(x).toLocaleString('es-AR', { maximumFractionDigits: 1 }) : String(x);

/* Por cada tipo de vasija que tenia el lote: tenia / se trasegaron / quedan.
 * Editar uno de los dos ajusta el otro (fijarTrasegado). */
function _vaciadoHTML(it, k){
  const filas = filasVaciado(it);
  if (!filas.length) return '';
  const inp = (f, campo) => `<input class="txt otc-num" type="number" min="0" max="${escA(f.tenia)}" step="${f.clave === 'vasija_grande' ? 'any' : '1'}"
      data-k="${k}" data-clave="${f.clave}" data-campo="${campo}" value="${escA(f[campo])}" aria-label="${escA(f.etiqueta + ' ' + (campo === 'quedan' ? 'que quedan' : 'que se trasegaron'))}">`;
  return `<table class="otc-vac"><thead><tr><th></th><th>Tenía</th><th>Se trasegaron</th><th>Quedan</th></tr></thead><tbody>${
    filas.map(f => `<tr><td>${esc(f.etiqueta)}</td><td>${esc(fmtN(f.tenia, f.clave))}</td><td>${inp(f, 'trasegaron')}</td><td>${inp(f, 'quedan')}</td></tr>`).join('')
  }</tbody></table>`;
}

/* "Queda: 11 barricas · Recibe: 4.075 L en tanque". */
const _recibeDe = it => {
  const r = {};
  for (const kk of ENV_KEYS) r[kk] = Math.max(0, n0(it.recibe && it.recibe[kk]));
  return r;
};
function _resumenHTML(it){
  const partes = [];
  if (filasVaciado(it).length) partes.push(`Queda del lote: <b>${esc(_enPalabras(quedaDe(it)))}</b>`);
  const rec = _recibeDe(it);
  if (ENV_KEYS.some(kk => rec[kk] > 0)) partes.push(`Recibe: <b>${esc(_enPalabras(rec))}</b>`);
  return partes.join('<br>');
}

function _filaHTML(st, it, k, corteBloqueado){
  const ol = it.indice == null ? null : st.ot.lotes[it.indice];
  const avisos = it.avisos.map(a => `<div class="otc-aviso">⚠ ${esc(a)}</div>`).join('');
  const quien = it.indice == null ? `<br><span style="color:var(--muted)">${it.extra
    ? esc(_nombreItemExtra(st, it)) + ' · lote nuevo ' + esc(it.lote)
    : it.hijo != null
    ? 'lote nuevo · ' + esc(nombreDestino(st.ot.achique.destinos[it.hijo])) : 'lote del corte'}</span>` : '';
  if (!it.despues) return `<tr class="otc-bloq"><td><b>${esc(it.lote)}</b>${quien}</td><td colspan="4">${avisos}</td><td><span style="color:var(--muted)">no se aplica</span></td></tr>`;
  const porLote = (st.mapa && st.mapa.por_lote) || null;
  const cmp = compararConMapa(it, ol, porLote ? (porLote[it.lote] ?? null) : null, st.ot.fecha || '');
  const fuente = _fuenteDe(st, it, ol);
  const bloqueado = it.bloqueado || corteBloqueado;
  const noTocar = st.noTocar.has(k);
  const clase = it.bloqueado ? ' class="otc-bloq"' : noTocar ? ' class="otc-notocar"' : (it.revisar ? ' class="otc-revisar"' : '');
  const accion = bloqueado
    ? '<span style="color:var(--muted)">no se aplica</span>'
    : noTocar
      ? `<span style="color:var(--muted)">no se toca</span><br><button class="btn" data-tocar="${k}">deshacer</button>`
      : `<span class="otc-coincide">se aplica</span><br><button class="btn" data-notocar="${k}" title="Dejar este lote como está">No tocar</button>`;
  return `<tr${clase} data-fila="${k}">
    <td><b>${esc(it.lote)}</b>${quien}<div class="otc-fuente ${fuente.clase}">${esc(fuente.texto)}</div><div class="otc-fuente otc-${cmp.estado}">${esc(cmp.texto)}</div>${avisos}</td>
    <td>${esc(_enPalabras(it.antes))}<br>${esc(fmtL(it.antes.litros_actuales))}<br><span style="color:var(--muted)">${esc(it.antes.vasija_actual)}</span></td>
    <td>${_vaciadoHTML(it, k)}
        <div class="otc-resumen" id="otcRes${k}">${_resumenHTML(it)}</div>
        <div class="otc-asi">Así queda: <b id="otcDesp${k}">${esc(_enPalabras(it.despues))}</b></div>
        <input class="txt" data-k="${k}" data-env="vasija_actual" value="${escA(it.despues.vasija_actual)}" placeholder="Vasija actual"></td>
    <td><b id="otcLitros${k}">${esc(fmtL(it.litros_despues))}</b></td>
    <td>${esc(fmtL(it.merma_litros))}</td>
    <td>${accion}</td></tr>`;
}

/* Los indices de los items que se van a aplicar: todos los que no estan
 * bloqueados ni marcados "No tocar". En un corte es todo o nada. */
function _aplicables(st){
  const corteBloqueado = st.corte && st.propuesta.items.some(it => it.bloqueado);
  const ok = (it, k) => !it.bloqueado && !corteBloqueado && !!it.despues && !st.noTocar.has(k);
  // Trasiego simple: el lote de origen y sus tanques extra van enteros o nada
  // (como los hijos del achique en un corte; ver aplicarPropuesta).
  const grupo = k => _grupoDe(st, k);
  const ks = st.propuesta.items.map((it, k) => grupo(k).every(j => ok(st.propuesta.items[j], j)) ? k : -1).filter(k => k >= 0);
  if (st.corte && st.noTocar.size) return [];
  return ks;
}

/* Los indices de los items que van juntos con el item k: en un trasiego
 * simple, el lote de origen y sus tanques extra; si no, solo k. */
function _grupoDe(st, k){
  const items = st.propuesta.items, it = items[k];
  const i = it.extra ? it.extra.i : it.indice;
  if (st.corte || i == null || !items.some(x => x.extra && x.extra.i === i)) return [k];
  return items.map((x, j) => (x.indice === i || (x.extra && x.extra.i === i)) ? j : -1).filter(j => j >= 0);
}

/* "T 214": el tanque cargado en el paso 1, o el de la OT. */
function _nombreItemExtra(st, it){
  const x = extrasDeOT(st.otV || st.ot).find(y => y.i === it.extra.i && y.k === it.extra.k);
  const e = _entradaExtra(st, it.extra);
  return String((e && e.vasija) || '').trim() || (x ? nombreExtra(x.d) : '');
}

function _textoAplicar(st){
  const n = _aplicables(st).length;
  return n === 0 ? 'Confirmar sin tocar lotes' : n === 1 ? 'Aplicar 1 lote y guardar' : `Aplicar ${n} lotes y guardar`;
}

function _refrescarFila(st, k){
  const it = st.propuesta.items[k];
  const d = $('otcDesp' + k); if (d) d.textContent = _enPalabras(it.despues);
  const l = $('otcLitros' + k); if (l) l.textContent = fmtL(it.litros_despues);
  const r = $('otcRes' + k); if (r) r.innerHTML = _resumenHTML(it);
  for (const f of filasVaciado(it)){
    for (const campo of ['trasegaron', 'quedan']){
      const inp = document.querySelector(`#otcRaiz [data-k="${k}"][data-clave="${f.clave}"][data-campo="${campo}"]`);
      if (inp && document.activeElement !== inp) inp.value = f[campo];
    }
  }
  const va = document.querySelector(`#otcRaiz [data-k="${k}"][data-env="vasija_actual"]`);
  if (va && document.activeElement !== va) va.value = it.despues.vasija_actual || '';
}

function _paso2(st){
  // Un corte es todo-o-nada: aplicar los origenes sin el lote del corte (o al
  // reves) hace contar el vino dos veces. Si algun item del corte esta
  // bloqueado, no se aplica ninguno (el caso contrario ya lo frena
  // aplicarPropuesta).
  const corteBloqueado = st.corte && st.propuesta.items.some(it => it.bloqueado);
  const avisoCorte = corteBloqueado
    ? '<div class="msg err">Hay un lote bloqueado: el corte no se puede aplicar hasta corregirlo.</div>' : '';
  const conMapa = !!(st.mapa && st.mapa.escaneos_ot && st.mapa.escaneos_ot.length);
  const filas = st.propuesta.items.map((it, k) => _filaHTML(st, it, k, corteBloqueado)).join('');

  st.paso = 2;
  mostrarOverlay(`<div id="otcRaiz">
<h3 style="margin:0 0 4px">✓ Confirmar ${esc(st.ot.ot)} · 2 de 2: así queda cada lote</h3>
<p style="margin:0 0 12px;color:var(--muted);font-size:13px">${conMapa
    ? 'El <b>después</b> sale de lo que el escáner registró con esta OT en el Mapa de Barriles; donde el Mapa no tiene nada, de lo que dice la OT.'
    : 'El Mapa de Barriles no tiene escaneos de esta OT: el <b>después</b> sale de lo que dice la OT.'}
Revisá cada lote: si algo no se trasegó, corregí <b>Se trasegaron</b> o <b>Quedan</b> en su tipo de vasija. Todos los lotes se aplican, salvo los que marques <b>No tocar</b>.</p>
${avisoCorte}
<div class="otc-scroll"><table class="otc-tabla"><thead><tr><th>Lote</th><th>Antes</th><th>Después</th><th>Litros</th><th>Merma</th><th></th></tr></thead>
<tbody>${filas}</tbody></table></div>
<div class="msg err" id="otcErr2" style="display:none;margin-top:10px"></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="otcVolver">← Volver</button>
  <button class="btn primary" id="otcAplicar">${esc(_textoAplicar(st))}</button>
</div></div>`);

  const box = $('otcRaiz');
  box.addEventListener('input', ev => {
    const el = ev.target;
    const k = +el.dataset.k;
    if (el.dataset.campo != null){
      // Vacio mientras se tipea: no se toca hasta que haya un numero.
      if (el.value === '') return;
      fijarTrasegado(st.propuesta.items[k], el.dataset.clave, el.dataset.campo, num(el.value) ?? 0, DATOS().mermas, DATOS().vasijas);
      _refrescarFila(st, k);
      return;
    }
    if (el.dataset.env !== 'vasija_actual') return;
    st.propuesta.items[k].despues.vasija_actual = el.value;
  });
  box.addEventListener('focusout', ev => {
    const el = ev.target;
    if (el.dataset && el.dataset.campo != null && el.value === '') _refrescarFila(st, +el.dataset.k);
  });
  box.addEventListener('click', ev => {
    const no = ev.target.closest('[data-notocar]'), si = ev.target.closest('[data-tocar]');
    if (!no && !si) return;
    const k = +(no ? no.dataset.notocar : si.dataset.tocar);
    // Un corte se aplica entero o nada: "No tocar" uno es no tocar ninguno.
    // Un lote con tanques extra, igual: va con ellos o no va.
    const ks = st.corte ? st.propuesta.items.map((_, i) => i) : _grupoDe(st, k);
    for (const i of ks){ if (no) st.noTocar.add(i); else st.noTocar.delete(i); }
    _paso2(st);
  });
  $('otcVolver').addEventListener('click', () => _paso1(st));
  $('otcAplicar').addEventListener('click', () => _aplicar(st));
}

/* M3/Critico: si guardar() falla (sin llegar a un 409, que ya muestra su
 * propio overlay), el cambio ya esta aplicado en memoria y marcado dirty: un
 * segundo clic en "Aplicar y guardar" NO debe volver a aplicar la propuesta
 * (duplicaria mermas nuevas, etc.), solo reintentar el guardado. st.aplicada
 * distingue los dos casos. Y una vez aplicada, "Volver" queda deshabilitado
 * PARA SIEMPRE: la OT ya esta confirmada en memoria, volver al paso 1 y
 * re-confirmar armaria una propuesta nueva que aplicarPropuesta ignoraria
 * (su freno de idempotencia), dejando el reintento silenciosamente sin
 * efecto. Solo "Aplicar y guardar" se reactiva, renombrado, para reintentar
 * el guardado. */
async function _aplicar(st){
  $('otcAplicar').disabled = true; $('otcVolver').disabled = true;
  const err2 = m => { const el = $('otcErr2'); if (el){ el.textContent = m; el.style.display = ''; } };
  const reactivar = () => { $('otcAplicar').disabled = false; $('otcVolver').disabled = false; };

  if (!st.aplicada){
    // Confirmar y aplicar sobre la OT VIVA, nunca sobre la capturada al abrir:
    // ver _engancharOT. Sin reactivar: la ventana ya no sirve, hay que cerrarla.
    const errOT = _engancharOT(st);
    if (errOT) return err2(errOT);

    // Se aplican todos los lotes salvo los bloqueados y los marcados "No
    // tocar" (I1: en un corte es todo o nada, _aplicables ya lo resuelve).
    const ks = _aplicables(st);
    const aplicar = new Set(ks.map(k => st.propuesta.items[k].lote));

    // M2: confirmar a sabiendas si algun lote que se va a aplicar quedo sin
    // litros medidos (no se toca: ver aplicarPropuesta/recalcularItem).
    const corteItem = st.corte ? st.propuesta.items.find(esItemCorte) : null;
    const sinLitros = st.corte
      ? st.propuesta.items.some(x => x.indice == null && x.litros_llegados == null)
      : st.propuesta.items.some(it => (it.indice != null || it.extra) && it.litros_llegados == null);
    if (sinLitros && !await confirmar({ titulo: 'Lotes sin litros medidos', texto: 'La OT se confirma igual y esos lotes no se tocan.', si: 'Confirmar OT', no: 'Volver' })){
      reactivar();
      return;
    }
    // Mientras el dialogo estaba abierto pudo terminar un guardado con fusion
    // (409): se vuelve a enganchar antes de tocar nada.
    const errOT2 = _engancharOT(st);
    if (errOT2) return err2(errOT2);

    // Lo que sobro queda en la OT viva, con sus movimientos y lotes hijos.
    // Despues del "Volver" de arriba: si no, un segundo clic lo sumaria dos
    // veces (y st.incorporados frena un segundo clic tras una excepcion). Van
    // al final de cada lista, igual que en otConAgregados: los {i,k} de la
    // propuesta apuntan a los mismos extras. Solo los de los lugares que se
    // aplican: si un lote queda en "No tocar" o bloqueado, no se guarda nada
    // de lo que le sobro (sus reales caen en el `if (!d) continue` de confirmarOT).
    const agregados = agregadosAplicables(st.agregados, lugaresAplicados(st.propuesta.items, ks));
    if (agregados.length && !st.incorporados){
      st.incorporados = true;
      const { hijos } = incorporarAgregados(DATOS(), st.ot, agregados, usuarioActual(), hoyISO(),
        l => (DATOS().lotes || []).find(x => String(x.lote) === String(l)));
      for (const h of hijos) fijar(h);
    }

    const porIndice = new Map(st.propuesta.items.filter(x => x.indice != null).map(x => [x.indice, x]));
    const hoy = hoyISO(), usuario = usuarioActual();
    const por_lote = st.ot.lotes.map((l, i) => {
      const it = porIndice.get(i);
      const e = st.entradas.por_lote[i];
      // I2: en un corte, proponer() deja litros_llegados en null para los
      // origenes (solo vacian, no reciben nada); lo que de verdad llego a
      // alguna parte es litros_origen menos la merma repartida.
      const litros_reales = st.corte && it
        ? (it.litros_origen != null && it.merma_litros != null
            ? Math.round((it.litros_origen - it.merma_litros) * 10) / 10 : it.litros_origen)
        : (it ? it.litros_llegados : null);
      return {
        destino_real: st.corte ? (st.achique ? st.ot.destino : (st.entradas.corte.vasija || st.ot.destino))
          : st.tipo === 'salida' ? st.ot.destino : st.tipo === 'tanque' ? e.vasija : (it && it.despues ? it.despues.vasija_actual : ''),
        litros_reales,
        merma_litros: it ? it.merma_litros : null,
      };
    });
    // Corte + achique: lo que llego a cada vasija definitiva (la base es el item del corte).
    const achique = st.achique ? st.ot.achique.destinos.map((d, k) => {
      const it = st.propuesta.items.find(x => x.hijo === k) || (d.nuevo ? null : corteItem);
      const e = st.entradas.destinos[k];
      return { destino_real: destinoRealAchique(d, e, it), litros_reales: it ? it.litros_llegados : null };
    }) : [];
    // Destinos extra: lo medido en cada uno (y los del mismo lote, lo llenado).
    const extras = realesDeExtras(st.propuesta, x => _entradaExtra(st, x));
    st.faltan = confirmarOT(st.ot, DATOS().movimientos || [], {
      operario: st.operario, pasos_cumplidos: st.pasos, comentario: st.comentario, por_lote, achique, extras,
    }, usuario, hoy);
    aplicarPropuesta(DATOS(), st.ot, st.propuesta, aplicar, usuario, hoy);
    markDirty();
    invalidarDashMap();
    st.onListo();
    st.aplicada = true;
  }

  const ok = await guardar();
  if (!ok){
    // guardar() ya mostro su propio error o el overlay de conflicto (409); si
    // lo segundo, #otcRaiz ya no esta: no hay botones que reactivar. Si sigue
    // ahi, la OT ya quedo aplicada en memoria: "Volver" queda deshabilitado
    // para siempre y solo se reactiva (renombrado) "Aplicar y guardar".
    if ($('otcRaiz')){
      $('otcAplicar').disabled = false;
      $('otcAplicar').textContent = 'Reintentar guardar';
      err2('No se guardó. La OT ya quedó confirmada en pantalla: probá Reintentar guardar o Ctrl+S, o esperá — se guarda sola apenas vuelva la conexión.');
    }
    return;
  }
  // Puede haber dejado barricas mermas: que el Mapa las vea al toque y no
  // haga falta esperar a que alguien abra Mermas y apriete 🔄. Sin esperar:
  // no bloquea el cierre de este overlay por una lectura de red.
  refrescarMapaMermas();
  if (st.faltan.length){
    mostrarOverlay(`<h3 style="margin:0 0 14px">✓ ${esc(st.ot.ot)} confirmada</h3>
<div class="msg err">Algunos movimientos de esta OT ya no están en la tabla (¿los borraron?). La OT quedó confirmada igual.</div>
<div style="margin-top:18px;text-align:right"><button class="btn primary" id="otcCerrar">Entendido</button></div>`);
    $('otcCerrar').addEventListener('click', () => cerrarOverlay());
    return;
  }
  cerrarOverlay();
}
