/* ===== Lotes CIW — emitir una OT de trasiego =====
 *
 * Arma la OT con la plantilla, los lotes (descripción y orgánico de Lotes) y
 * sus barriles (del Mapa de Barriles, solo lectura). Guarda ANTES de ofrecer
 * imprimir: el papel sale a la bodega y no puede existir un número de OT que
 * el servidor no conozca. */
'use strict';

import { $, esc, escA, num, DATOS, markDirty, guardar, usuarioActual,
         mostrarOverlay, cerrarOverlay } from './nucleo.js';
import { armarOT, movimientosDeOT, litrosPrevistos } from './ot-armado.js';
import { PLANTILLAS_OT } from './ot-plantillas.js';
import { hojasOT } from './ot-hojas.js';
import { proximoNumeroOT } from './ot-movimientos.js';
import { esOrganico } from './envases.js';

/* Estado del modal abierto: una entrada por lote agregado. */
let _lotes = [];      // [{lote, id_texto, organico, barriles:[...], tildados:Set<num>, vasijas_manual, litros}]
let _mapaVersion = null;
let _mapaCaido = false;

async function _traerBarriles(lote){
  try {
    const r = await fetch(API + '/barriles?lotes=' + encodeURIComponent(lote));
    if (!r.ok){ _mapaCaido = true; return []; }
    const d = await r.json();
    _mapaVersion = d.version ?? _mapaVersion;
    return (d.por_lote && d.por_lote[lote]) || [];
  } catch (e){
    _mapaCaido = true;
    return [];
  }
}

function _pintarLotes(){
  const cont = $('otePorLote');
  if (!cont) return;
  cont.innerHTML = _lotes.map((l, i) => {
    const avisos = [];
    if (!l.enLotes) avisos.push('⚠ No está en la lista de lotes.');
    const vacios = l.barriles.filter(b => b.estado !== 'LLENO').length;
    if (vacios) avisos.push(`⚠ ${vacios} barril(es) figuran VACÍOS en el Mapa.`);
    const lista = l.barriles.length
      ? l.barriles.map(b => `<label class="ote-barril"><input type="checkbox" data-lote="${i}" data-num="${escA(b.num)}"` +
          `${l.tildados.has(b.num) ? ' checked' : ''}> ${esc(b.num)} · ${esc(b.cap ?? '')} L · ${esc(b.marca)} ${esc(b.anio)} ` +
          `<span style="color:var(--muted)">${esc(b.estado)}</span></label>`).join('')
      : `<label>Vasijas (sin barriles en el Mapa)</label> <input class="txt" data-manual="${i}" value="${escA(l.vasijas_manual)}" placeholder="p. ej. 1 x t500">`;
    return `<div class="card ote-lote">
  <div><b>${esc(l.lote)}</b> ${esc(l.id_texto)} ${l.organico ? '🟢 orgánico' : ''}
    <button class="rowbtn" data-quitar="${i}" title="Quitar lote">✕</button></div>
  ${avisos.map(a => `<div class="msg err">${esc(a)}</div>`).join('')}
  <div class="ote-barriles">${lista}</div>
  <label>Litros previstos</label> <input class="txt" type="number" step="any" data-litros="${i}" value="${escA(l.litros ?? '')}">
</div>`;
  }).join('') + (_mapaCaido
    ? '<div class="msg err">El Mapa de Barriles no respondió: cargá las vasijas a mano.</div>' : '');
}

async function _agregarLote(){
  const inp = $('oteLote');
  const lote = inp.value.trim();
  if (!lote) return;
  if (_lotes.some(l => l.lote === lote)){ inp.value = ''; return; }
  const ficha = (DATOS().lotes || []).find(l => String(l.lote) === lote);
  const barriles = await _traerBarriles(lote);
  const tildados = new Set(barriles.map(b => b.num));
  _lotes.push({
    lote, enLotes: !!ficha,
    id_texto: (ficha && ficha.id_texto) || '',
    organico: !!(ficha && esOrganico(ficha)),
    barriles, tildados, vasijas_manual: '',
    litros: litrosPrevistos(barriles) || null,
  });
  inp.value = '';
  _pintarLotes();
}

function _recalcularLitros(i){
  const l = _lotes[i];
  l.litros = litrosPrevistos(l.barriles.filter(b => l.tildados.has(b.num))) || null;
}

export function abrirEmitirOT(onListo){
  _lotes = []; _mapaVersion = null; _mapaCaido = false;
  const hoy = new Date().toISOString().slice(0, 10);
  const numero = proximoNumeroOT(DATOS().movimientos || [], Number(hoy.slice(0, 4)), DATOS().ordenes_trabajo || []);
  const opts = PLANTILLAS_OT.map(p => `<option value="${escA(p.id)}">${esc(p.nombre)}</option>`).join('');

  mostrarOverlay(`
<h3 style="margin:0 0 14px">➕ Emitir orden de trabajo de trasiego</h3>
<div style="display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center">
  <label>Plantilla</label><select class="txt" id="otePlantilla">${opts}</select>
  <label>N° de OT</label><input class="txt" id="oteNumero" value="${escA(numero)}">
  <label>Fecha</label><input class="txt" type="date" id="oteFecha" value="${escA(hoy)}">
  <label>Tanque destino</label><input class="txt" id="oteDestino" placeholder="vacío = 'Tanque pulmón: ____'">
  <label>Emitió</label><input class="txt" id="oteEmitio" value="${escA(usuarioActual())}">
  <label>Agregar lote</label><input class="txt" id="oteLote" placeholder="Número de lote y Enter">
</div>
<div id="otePorLote" style="margin-top:12px;max-height:50vh;overflow:auto"></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="oteCancelar">Cancelar</button>
  <button class="btn primary" id="oteEmitir">Emitir OT</button>
</div>`);

  $('oteLote').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); _agregarLote(); } });
  $('otePorLote').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.num !== undefined){
      const l = _lotes[+t.dataset.lote];
      if (t.checked) l.tildados.add(t.dataset.num); else l.tildados.delete(t.dataset.num);
      _recalcularLitros(+t.dataset.lote);
      _pintarLotes();
    } else if (t.dataset.manual !== undefined){
      _lotes[+t.dataset.manual].vasijas_manual = t.value.trim();
    } else if (t.dataset.litros !== undefined){
      _lotes[+t.dataset.litros].litros = num(t.value);
    }
  });
  $('otePorLote').addEventListener('click', e => {
    const b = e.target.closest('[data-quitar]');
    if (b){ _lotes.splice(+b.dataset.quitar, 1); _pintarLotes(); }
  });
  $('oteCancelar').addEventListener('click', () => cerrarOverlay());
  $('oteEmitir').addEventListener('click', () => _emitir(onListo));
}

async function _emitir(onListo){
  if (!_lotes.length){ alert('Agregá al menos un lote.'); return; }
  const fecha = $('oteFecha').value;
  if (!fecha){ alert('Falta la fecha.'); return; }
  const sinVasijas = _lotes.filter(l => !l.tildados.size && !l.vasijas_manual);
  if (sinVasijas.length){
    alert('El lote ' + sinVasijas[0].lote + ' no tiene barriles tildados ni vasijas cargadas.');
    return;
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const usuario = usuarioActual();
  const ot = armarOT({
    id: 'ot-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    numero: $('oteNumero').value.trim(),
    plantilla: $('otePlantilla').value,
    fecha,
    destino: $('oteDestino').value,
    emitio: $('oteEmitio').value,
    lotes: _lotes.map(l => ({
      lote: l.lote, id_texto: l.id_texto, organico: l.organico,
      barriles: l.barriles.filter(b => l.tildados.has(b.num)),
      vasijas_manual: l.vasijas_manual,
      litros_previstos: l.litros,
    })),
    mapaVersion: _mapaVersion, usuario, hoy,
  });

  const d = DATOS();
  if (!d.ordenes_trabajo) d.ordenes_trabajo = [];
  if (!d.movimientos) d.movimientos = [];
  d.ordenes_trabajo.unshift(ot);
  d.movimientos.unshift(...movimientosDeOT(ot, usuario, hoy));
  markDirty();
  cerrarOverlay();
  onListo();

  const ok = await guardar(false);
  if (!ok){
    alert('La OT quedó en pantalla pero NO se guardó, así que todavía no conviene imprimirla: '
        + 'resolvé el guardado y usá el botón 🖨 de la fila.');
    return;
  }
  abrirImprimirOT(ot);
}

export function abrirImprimirOT(ot){
  mostrarOverlay(`
<h3 style="margin:0 0 14px">🖨 Imprimir ${esc(ot.ot)}</h3>
<label><input type="checkbox" id="otiOT" checked> Orden de trabajo</label><br>
<label><input type="checkbox" id="otiPlanilla" checked> Planilla de movimiento de barriles</label><br>
<label><input type="checkbox" id="otiRotulos" checked> Rótulos</label>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="otiCancelar">Cerrar</button>
  <button class="btn primary" id="otiImprimir">Imprimir</button>
</div>`);
  $('otiCancelar').addEventListener('click', () => cerrarOverlay());
  $('otiImprimir').addEventListener('click', () => {
    const op = { ot: $('otiOT').checked, planilla: $('otiPlanilla').checked, rotulos: $('otiRotulos').checked };
    cerrarOverlay();
    imprimirOT(ot, op);
  });
}

/* Misma convención que la hoja genérica: #otMovHoja + clase en el body mientras
 * dura la impresión; el @media print hace el resto. */
export function imprimirOT(ot, opciones){
  const cont = $('otMovHoja');
  if (!cont) return;
  cont.innerHTML = hojasOT(ot, opciones);
  document.body.classList.add('printing-ot-mov');
  window.print();
  document.body.classList.remove('printing-ot-mov');
}
