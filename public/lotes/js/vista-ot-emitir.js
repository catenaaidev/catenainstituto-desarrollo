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
import { PLANTILLAS_OT, origenTanque, creaLote, hojasDePlantilla, barricasEstimadas } from './ot-plantillas.js';
import { hojasOT } from './ot-hojas.js';
import { proximoNumeroOT } from './ot-movimientos.js';
import { esOrganico } from './envases.js';
import { abrirCorteOT } from './vista-ot-corte.js';

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
// Las promesas de _agregarLote en vuelo: antes de emitir (o de pasar de paso en
// el asistente del Corte) se esperan, para no validar una lista a medio llegar.
let _enVuelo = new Set();
// La plantilla elegida. Es estado y no se lee del <select> porque el asistente
// del Corte arma su propia pantalla y el select ya no existe.
let _plantilla = PLANTILLAS_OT[0].id;

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

// Desde tanque no se usan los barriles del Mapa.
const _desdeTanque = () => origenTanque(_plantilla);

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

export function pintarLotes(){
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

function _agregarLote(){
  const p = _agregarLoteAhora();
  _enVuelo.add(p);
  p.finally(() => _enVuelo.delete(p));
  return p;
}

/* El lote que quedó escrito sin apretar Enter también cuenta: se agrega, y se
 * esperan los que siguen trayendo sus barriles del Mapa. */
export async function asegurarLotes(){
  const inp = $('oteLote');
  if (inp && inp.value.trim()) _agregarLote();
  await Promise.all([..._enVuelo]);
}

async function _agregarLoteAhora(){
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
  pintarLotes();
}

function _recalcularLitros(i){
  const l = _lotes[i];
  if (l.litrosManual) return; // el usuario ya escribio un valor a mano: no lo pisamos
  l.litros = litrosPrevistos(l.barriles.filter(b => l.tildados.has(b.num))) || null;
}

/* Arranca una sesión de lotes vacía: la usan el formulario y el asistente del
 * Corte cuando se abren de cero. */
export function iniciarSesionLotes(plantilla){
  _lotes = []; _mapaVersion = null; _mapaCaido = false;
  _sesion++; _pendientes = new Set(); _enVuelo = new Set();
  _plantilla = plantilla || PLANTILLAS_OT[0].id;
}

export function abrirEmitirOT(onListo){
  iniciarSesionLotes();
  const hoy = new Date().toISOString().slice(0, 10);
  const numero = proximoNumeroOT(DATOS().movimientos || [], Number(hoy.slice(0, 4)), DATOS().ordenes_trabajo || []);
  const opts = PLANTILLAS_OT.map(p => `<option value="${escA(p.id)}">${esc(p.nombre)}</option>`).join('');

  mostrarOverlay(`
<h3 style="margin:0 0 14px">➕ Emitir orden de trabajo de trasiego</h3>
<div style="display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center">
  <label>Plantilla</label><select class="txt" id="otePlantilla">${opts}</select>
  <label>N° de OT</label><input class="txt" id="oteNumero" value="${escA(numero)}">
  <label>Fecha</label><input class="txt" type="date" id="oteFecha" value="${escA(hoy)}">
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
  $('otePlantilla').addEventListener('change', () => {
    _plantilla = $('otePlantilla').value;
    // El Corte crea un lote: se sigue en el asistente, con lo ya cargado.
    if (creaLote(_plantilla)){
      abrirCorteOT(onListo, { numero: $('oteNumero').value, fecha: $('oteFecha').value,
                              emitio: $('oteEmitio').value, destino: $('oteDestino').value });
      return;
    }
    ajustarDestino(); pintarLotes();
  });
  conectarLotes();
  $('oteCancelar').addEventListener('click', () => cerrarOverlay());
  $('oteEmitir').addEventListener('click', () => _emitir(onListo));
}

/* Los eventos del campo "Agregar lote" y de la lista de lotes (#oteLote y
 * #otePorLote). Se llama cada vez que esos elementos se vuelven a dibujar. */
export function conectarLotes(){
  $('oteLote').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); _agregarLote(); } });
  $('oteLote').addEventListener('change', () => _agregarLote());
  $('otePorLote').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.num !== undefined){
      const l = _lotes[+t.dataset.lote];
      if (t.checked) l.tildados.add(t.dataset.num); else l.tildados.delete(t.dataset.num);
      _recalcularLitros(+t.dataset.lote);
      pintarLotes();
    } else if (t.dataset.manual !== undefined){
      _lotes[+t.dataset.manual].vasijas_manual = t.value.trim();
    } else if (t.dataset.litros !== undefined){
      const l = _lotes[+t.dataset.litros];
      l.litros = num(t.value);
      l.litrosManual = true;
      if (_desdeTanque() && !l.barricasManual){
        l.barricas = barricasEstimadas(l.litros);
        pintarLotes();
      }
    } else if (t.dataset.barricas !== undefined){
      const l = _lotes[+t.dataset.barricas];
      l.barricas = num(t.value);
      l.barricasManual = l.barricas !== null; // borrarlo vuelve al cálculo
      if (!l.barricasManual){ l.barricas = barricasEstimadas(l.litros); pintarLotes(); }
    }
  });
  $('otePorLote').addEventListener('click', e => {
    const b = e.target.closest('[data-quitar]');
    if (b){ _lotes.splice(+b.dataset.quitar, 1); pintarLotes(); }
  });
}

async function _emitir(onListo){
  await asegurarLotes();
  const fecha = $('oteFecha').value;
  const numero = $('oteNumero').value.trim();
  const error = validarCabecera(numero, fecha) || validarLotesOrigen();
  if (error){ alert(error); return; }
  if (!confirmarNumeroRepetido(numero)) return;
  const ot = armarOTDeSesion({ numero, fecha, plantilla: _plantilla,
                               destino: $('oteDestino').value, emitio: $('oteEmitio').value });
  await registrarOT(ot, onListo);
}

/* Las validaciones que comparten el formulario y el asistente del Corte.
 * Devuelven el texto del error, o '' si está todo bien. */
export function validarCabecera(numero, fecha){
  if (!String(numero || '').trim()) return 'Falta el número de OT.';
  if (!fecha) return 'Falta la fecha.';
  return '';
}

export function validarLotesOrigen(){
  if (!_lotes.length) return 'Agregá al menos un lote.';
  if (_desdeTanque()){
    const sinTanque = _lotes.find(l => !l.vasijas_manual);
    if (sinTanque) return 'Falta el tanque origen del lote ' + sinTanque.lote + '.';
    return '';
  }
  const sinVasijas = _lotes.find(l => !l.tildados.size && !l.vasijas_manual);
  if (sinVasijas) return 'El lote ' + sinVasijas.lote + ' no tiene barriles tildados ni vasijas cargadas.';
  return '';
}

export function confirmarNumeroRepetido(numero){
  const d0 = DATOS();
  const yaExiste = (d0.movimientos || []).some(m => m.ot === numero) ||
    (d0.ordenes_trabajo || []).some(o => o.ot === numero);
  return !yaExiste || confirm('El número ' + numero + ' ya existe. ¿Continuar igual?');
}

/* Los lotes de origen cargados en esta sesión (el asistente del Corte los
 * necesita para ofrecer "⎘ Hijo de …"). */
export function lotesDeSesion(){ return _lotes; }

/* La OT con los lotes de la sesión. `loteCorte` = {lote, id_texto} en el Corte. */
export function armarOTDeSesion({ numero, fecha, plantilla, destino, emitio, loteCorte }){
  const tanque = origenTanque(plantilla);
  return armarOT({
    id: 'ot-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    numero: String(numero).trim(),
    plantilla,
    fecha,
    destino,
    emitio,
    lotes: _lotes.map(l => ({
      lote: l.lote, id_texto: l.id_texto, organico: l.organico,
      // Desde tanque no se vacía ningún barril: los del Mapa (si los hay) son
      // de otra partida del lote y no van en la hoja.
      barriles: tanque ? [] : l.barriles.filter(b => l.tildados.has(b.num)),
      vasijas_manual: l.vasijas_manual,
      litros_previstos: l.litros,
      barricas_previstas: tanque ? (l.barricas ?? barricasEstimadas(l.litros)) : null,
    })),
    lote_corte: loteCorte || null,
    mapaVersion: _mapaVersion, usuario: usuarioActual(), hoy: new Date().toISOString().slice(0, 10),
  });
}

/* Suma la OT y sus movimientos a los datos, avisa a la vista (onListo(ot):
 * Movimientos abre la hoja de la OT nueva para ajustar los pasos) y guarda.
 * Se imprime desde esa hoja, que vuelve a guardar antes. `antes` corre justo
 * antes de sumar la OT (el Corte crea ahí su lote): todo entra en el mismo
 * guardado. */
export async function registrarOT(ot, onListo, antes){
  const hoy = new Date().toISOString().slice(0, 10);
  const usuario = usuarioActual();
  const d = DATOS();
  if (antes) antes(d);
  if (!d.ordenes_trabajo) d.ordenes_trabajo = [];
  if (!d.movimientos) d.movimientos = [];
  d.ordenes_trabajo.unshift(ot);
  d.movimientos.unshift(...movimientosDeOT(ot, usuario, hoy));
  markDirty();
  cerrarOverlay();
  onListo(ot);

  const ok = await guardar(false);
  if (!ok){
    alert('La OT NO se guardó, así que todavía no conviene imprimirla. Resolvé el guardado; '
        + 'si la OT sigue en «Órdenes de trabajo», su botón 🖨 vuelve a intentar guardar, y si no, emitila de nuevo.');
  }
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
