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
import { PLANTILLAS_OT, origenTanque, pideLoteCorte, hojasDePlantilla, barricasEstimadas } from './ot-plantillas.js';
import { hojasOT } from './ot-hojas.js';
import { proximoNumeroOT } from './ot-movimientos.js';
import { esOrganico } from './envases.js';

/* Estado del modal abierto: una entrada por lote agregado. */
let _lotes = [];      // [{lote, id_texto, organico, barriles:[...], tildados:Set<num>, vasijas_manual, litros, litrosManual, barricas, barricasManual}]
let _mapaVersion = null;
let _mapaCaido = false;
// Se incrementa cada vez que se abre el modal: si un fetch de _agregarLote
// termina despues de que el modal se cerro y se reabrio, la sesion ya no
// coincide y el resultado no se empuja en el modal nuevo.
let _sesion = 0;
// Lotes con un fetch de barriles en vuelo: bloquea el doble Enter en red lenta
// (que sumaria el mismo lote dos veces y duplicaria el movimiento).
let _pendientes = new Set();

async function _traerBarriles(lote){
  try {
    const r = await fetch(API + '/barriles?lotes=' + encodeURIComponent(lote));
    if (!r.ok){ _mapaCaido = true; return []; }
    const d = await r.json();
    _mapaVersion = d.version ?? _mapaVersion;
    _mapaCaido = false;
    return (d.por_lote && d.por_lote[lote]) || [];
  } catch (e){
    _mapaCaido = true;
    return [];
  }
}

// La plantilla elegida: desde tanque no se usan los barriles del Mapa.
const _desdeTanque = () => origenTanque(($('otePlantilla') || {}).value);
const _esCorte = () => pideLoteCorte(($('otePlantilla') || {}).value);

// El lote del corte tal como está en la lista de Lotes (null si no está).
function _fichaLote(lote){
  return (DATOS().lotes || []).find(l => String(l.lote) === lote) || null;
}

function _pintarCorte(){
  const lote = $('oteCorte').value.trim();
  const ficha = lote ? _fichaLote(lote) : null;
  $('oteCorteInfo').innerHTML = !lote ? ''
    : ficha ? esc(ficha.id_texto || '(sin descripción)')
    : '<span class="msg err">⚠ No está en la lista de lotes: la hoja sale sin ID.</span>';
}

/* Desde tanque (0912) el lote sale de un tanque: se pide el tanque, los litros
 * y cuántas barricas se llenan, que da los rótulos y las filas de la planilla. */
function _loteDesdeTanque(l, i){
  const aviso = l.enLotes ? '' : '<div class="msg err">⚠ No está en la lista de lotes.</div>';
  return `<div class="card ote-lote">
  <div><b>${esc(l.lote)}</b> ${esc(l.id_texto)} ${l.organico ? '🟢 orgánico' : ''}
    <button class="rowbtn" data-quitar="${i}" title="Quitar lote">✕</button></div>
  ${aviso}
  <label>Tanque origen</label> <input class="txt" data-manual="${i}" value="${escA(l.vasijas_manual)}" placeholder="p. ej. E 175">
  <label>Litros previstos</label> <input class="txt" type="number" step="any" data-litros="${i}" value="${escA(l.litros ?? '')}">
  <label>Barricas a llenar</label> <input class="txt" type="number" step="1" min="1" data-barricas="${i}" value="${escA(l.barricas ?? '')}" title="Se calcula con los litros (225 L por barrica); se puede corregir">
</div>`;
}

function _pintarLotes(){
  const cont = $('otePorLote');
  if (!cont) return;
  if (_desdeTanque()){ cont.innerHTML = _lotes.map(_loteDesdeTanque).join(''); return; }
  cont.innerHTML = _lotes.map((l, i) => {
    const avisos = [];
    if (!l.enLotes) avisos.push('⚠ No está en la lista de lotes.');
    const vacios = l.barriles.filter(b => b.estado !== 'LLENO').length;
    if (vacios) avisos.push(`⚠ ${vacios} barril(es) figuran VACÍOS en el Mapa.`);
    const checks = l.barriles.length
      ? l.barriles.map(b => `<label class="ote-barril"><input type="checkbox" data-lote="${i}" data-num="${escA(b.num)}"` +
          `${l.tildados.has(b.num) ? ' checked' : ''}> ${esc(b.num)} · ${esc(b.cap ?? '')} L · ${esc(b.marca)} ${esc(b.anio)} ` +
          `<span style="color:var(--muted)">${esc(b.estado)}</span></label>`).join('')
      : '';
    // Con barriles pero ninguno tildado tambien hace falta el campo manual:
    // si no, el lote queda sin forma de cargar la vasija y bloquea el emitir.
    const manual = (!l.barriles.length || !l.tildados.size)
      ? `<label>Vasijas${l.barriles.length ? '' : ' (sin barriles en el Mapa)'}</label> ` +
        `<input class="txt" data-manual="${i}" value="${escA(l.vasijas_manual)}" placeholder="p. ej. 1 x t500">`
      : '';
    const lista = checks + manual;
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
  if (_lotes.some(l => l.lote === lote) || _pendientes.has(lote)){ inp.value = ''; return; }
  // Limpiar el input y marcar el lote como pendiente ANTES del await: un
  // segundo Enter mientras el fetch sigue en vuelo (red lenta) no debe volver
  // a dispararlo, o el lote termina agregado dos veces.
  inp.value = '';
  _pendientes.add(lote);
  const sesion = _sesion;
  const ficha = (DATOS().lotes || []).find(l => String(l.lote) === lote);
  const barriles = await _traerBarriles(lote);
  _pendientes.delete(lote);
  // El modal se cerro y se reabrio (otra OT) mientras esperabamos el fetch:
  // este resultado ya no es de esta sesion, no se empuja.
  if (sesion !== _sesion) return;
  if (_lotes.some(l => l.lote === lote)) return;
  const tildados = new Set(barriles.map(b => b.num));
  _lotes.push({
    lote, enLotes: !!ficha,
    id_texto: (ficha && ficha.id_texto) || '',
    organico: !!(ficha && esOrganico(ficha)),
    barriles, tildados, vasijas_manual: '',
    litros: litrosPrevistos(barriles) || null,
    litrosManual: false,
    barricas: null, barricasManual: false,
  });
  _pintarLotes();
}

function _recalcularLitros(i){
  const l = _lotes[i];
  if (l.litrosManual) return; // el usuario ya escribio un valor a mano: no lo pisamos
  l.litros = litrosPrevistos(l.barriles.filter(b => l.tildados.has(b.num))) || null;
}

export function abrirEmitirOT(onListo){
  _lotes = []; _mapaVersion = null; _mapaCaido = false;
  _sesion++; _pendientes = new Set();
  const hoy = new Date().toISOString().slice(0, 10);
  const numero = proximoNumeroOT(DATOS().movimientos || [], Number(hoy.slice(0, 4)), DATOS().ordenes_trabajo || []);
  const opts = PLANTILLAS_OT.map(p => `<option value="${escA(p.id)}">${esc(p.nombre)}</option>`).join('');

  mostrarOverlay(`
<h3 style="margin:0 0 14px">➕ Emitir orden de trabajo de trasiego</h3>
<div style="display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center">
  <label>Plantilla</label><select class="txt" id="otePlantilla">${opts}</select>
  <label>N° de OT</label><input class="txt" id="oteNumero" value="${escA(numero)}">
  <label>Fecha</label><input class="txt" type="date" id="oteFecha" value="${escA(hoy)}">
  <label class="ote-corte">Lote del corte</label><div class="ote-corte"><input class="txt" id="oteCorte" placeholder="Lote que se forma en el tanque, p. ej. 26300" style="width:100%"> <span id="oteCorteInfo" style="color:var(--muted)"></span></div>
  <label id="oteDestinoLbl">Tanque destino</label><input class="txt" id="oteDestino" placeholder="vacío = 'Tanque pulmón: ____'">
  <label>Emitió</label><input class="txt" id="oteEmitio" value="${escA(usuarioActual())}">
  <label>Agregar lote</label><input class="txt" id="oteLote" placeholder="Número de lote y Enter">
</div>
<div id="otePorLote" style="margin-top:12px;max-height:50vh;overflow:auto"></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="oteCancelar">Cancelar</button>
  <button class="btn primary" id="oteEmitir">Emitir OT</button>
</div>`);

  const ajustarDestino = () => {
    const t = _desdeTanque();
    $('oteDestinoLbl').textContent = t ? 'Destino' : 'Tanque destino';
    $('oteDestino').placeholder = t ? 'p. ej. Barricas Pinot (no 2026-2025)' : "vacío = 'Tanque pulmón: ____'";
  };
  const ajustarCorte = () => {
    for (const el of document.querySelectorAll('.ote-corte')) el.style.display = _esCorte() ? '' : 'none';
  };
  ajustarCorte();
  $('otePlantilla').addEventListener('change', () => { ajustarDestino(); ajustarCorte(); _pintarLotes(); });
  $('oteCorte').addEventListener('input', _pintarCorte);
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
      const l = _lotes[+t.dataset.litros];
      l.litros = num(t.value);
      l.litrosManual = true;
      if (_desdeTanque() && !l.barricasManual){
        l.barricas = barricasEstimadas(l.litros);
        _pintarLotes();
      }
    } else if (t.dataset.barricas !== undefined){
      const l = _lotes[+t.dataset.barricas];
      l.barricas = num(t.value);
      l.barricasManual = l.barricas !== null; // borrarlo vuelve al cálculo
      if (!l.barricasManual){ l.barricas = barricasEstimadas(l.litros); _pintarLotes(); }
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
  const numero = $('oteNumero').value.trim();
  if (!numero){ alert('Falta el número de OT.'); return; }
  const d0 = DATOS();
  const yaExiste = (d0.movimientos || []).some(m => m.ot === numero) ||
    (d0.ordenes_trabajo || []).some(o => o.ot === numero);
  if (yaExiste && !confirm('El número ' + numero + ' ya existe. ¿Continuar igual?')) return;
  const tanque = _desdeTanque();
  let loteCorte = null;
  if (_esCorte()){
    const lote = $('oteCorte').value.trim();
    if (!lote){ alert('Falta el lote del corte: es el lote que se forma en el tanque.'); return; }
    if (_lotes.some(l => l.lote === lote)){
      alert('El lote del corte (' + lote + ') no puede ser también un lote de origen.');
      return;
    }
    const ficha = _fichaLote(lote);
    loteCorte = { lote, id_texto: (ficha && ficha.id_texto) || '' };
  }
  if (tanque){
    const sinTanque = _lotes.find(l => !l.vasijas_manual);
    if (sinTanque){ alert('Falta el tanque origen del lote ' + sinTanque.lote + '.'); return; }
  }
  const sinVasijas = tanque ? [] : _lotes.filter(l => !l.tildados.size && !l.vasijas_manual);
  if (sinVasijas.length){
    alert('El lote ' + sinVasijas[0].lote + ' no tiene barriles tildados ni vasijas cargadas.');
    return;
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const usuario = usuarioActual();
  const ot = armarOT({
    id: 'ot-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    numero,
    plantilla: $('otePlantilla').value,
    fecha,
    destino: $('oteDestino').value,
    emitio: $('oteEmitio').value,
    lotes: _lotes.map(l => ({
      lote: l.lote, id_texto: l.id_texto, organico: l.organico,
      // Desde tanque no se vacía ningún barril: los del Mapa (si los hay) son
      // de otra partida del lote y no van en la hoja.
      barriles: tanque ? [] : l.barriles.filter(b => l.tildados.has(b.num)),
      vasijas_manual: l.vasijas_manual,
      litros_previstos: l.litros,
      barricas_previstas: tanque ? (l.barricas ?? barricasEstimadas(l.litros)) : null,
    })),
    lote_corte: loteCorte,
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
    alert('La OT NO se guardó, así que todavía no conviene imprimirla. Resolvé el guardado; '
        + 'si la fila sigue en la tabla, imprimila con su botón 🖨, y si no, emitila de nuevo.');
    return;
  }
  abrirImprimirOT(ot);
}

const NOMBRES_HOJA = { ot: 'Orden de trabajo', planilla: 'Planilla de movimiento de barriles', rotulos: 'Rótulos' };

export function abrirImprimirOT(ot){
  // Solo las hojas que tiene la plantilla: el corte (0867) es una sola hoja.
  const hojas = hojasDePlantilla(ot.plantilla);
  const checks = hojas.map(k =>
    `<label><input type="checkbox" data-hoja="${escA(k)}" checked> ${esc(NOMBRES_HOJA[k])}</label>`).join('<br>');
  mostrarOverlay(`
<h3 style="margin:0 0 14px">🖨 Imprimir ${esc(ot.ot)}</h3>
${checks}
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="otiCancelar">Cerrar</button>
  <button class="btn primary" id="otiImprimir">Imprimir</button>
</div>`);
  $('otiCancelar').addEventListener('click', () => cerrarOverlay());
  $('otiImprimir').addEventListener('click', () => {
    const op = { ot: false, planilla: false, rotulos: false };
    for (const c of document.querySelectorAll('[data-hoja]')) op[c.dataset.hoja] = c.checked;
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
