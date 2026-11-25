/* ===== Lotes CIW — emitir una OT de trasiego =====
 *
 * Arma la OT con la plantilla, los lotes (descripción y orgánico de Lotes) y
 * sus barriles (del Mapa de Barriles, solo lectura). Guarda ANTES de ofrecer
 * imprimir: el papel sale a la bodega y no puede existir un número de OT que
 * el servidor no conozca. */
'use strict';

import { $, esc, escA, num, DATOS, markDirty, guardar, usuarioActual,
         mostrarOverlay, cerrarOverlay, protegerOverlay, overlayMinimizado, retomarOverlay,
         descartarMinimizado, minimizarOverlay } from './nucleo.js';
import { avisar, informar, confirmar } from './dialogos.js';
import { armarOT, movimientosDeOT, sumarDestinoExterno } from './ot-armado.js';
import { PLANTILLAS_OT, plantillaPorId, pideLoteCorte, origenTanque, creaLote, esSalida, hojasDePlantilla, barricasEstimadas, sinMovimientos } from './ot-plantillas.js';
import { hojasOT } from './ot-hojas.js';
import { tipoDestino } from './propuesta-ot.js';
import { proximoNumeroOT, esEjecutado } from './ot-movimientos.js';
import { esOrganico } from './envases.js';
import { abrirCorteOT } from './vista-ot-corte.js';
import { hoyLocalISO } from './fechas.js';
import { fechaOHoy } from './ot-lista.js';
import { proponerNumero, chipCarpeta, cablearChipsCarpeta, imprimirYGuardar } from './guardar-ot.js';
import { listarSerie, ultimoVisto } from './carpeta-ot.js';
import { numeroUsado, numeroDeNombre, siguienteNumero, numerosWeb, normalizarNumero } from './numero-ot.js';
import { tanqueDelLote, tanquesDelLote, sumaLitros, detalleSuma, nombreTanque, origenSinMapa } from './ot-vasijas.js';
import { ajustarHojasA4, soltarHojasA4 } from './hoja-pdf.js';
import { buscarVasija } from './vasijas-padron.js';
import { renumerarOT } from './ot-renumerar.js';
import { CLAVE_BORRADOR, fotoLotes, lotesDeFoto, leerBorrador, resumenBorrador } from './ot-borrador.js';
import { aplicarEdicionOT } from './ot-editar.js';
import { esSinMovimientos, lotesDeMuestras, armarOTMuestras, filasIniciales, vasijaDeLote, MUESTRA_POR_DEFECTO } from './ot-muestras.js';
import { admiteExtras, esChicas, asignarLotesExtra, validarExtras, validarExtrasEntreLotes, armarHijosExtra, extrasDeOT } from './ot-destinos.js';
import { fijar, refrescarOpcionesFiltros } from './vista-lotes.js';
import { anioDeLote } from './lote-nuevo.js';

/* Estado del modal abierto: una entrada por lote agregado. */
let _lotes = [];      // [{lote, id_texto, organico, modo_origen, cantidad_barricas, barriles:[...], tildados:Set<num>, tanques:[{num, litros, tildado}], otras:[{nombre, litros}], vasijas_manual, litros, litrosManual, barricas, barricasManual, extras:[{num, litros, lote}]}]
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
// Quien tiene la sesion abierta (el formulario o el asistente del Corte)
// guarda su borrador aca cada vez que cambia algo de los lotes.
let _alCambiarSesion = null;
// Al editar: los lotes hijos que esta OT ya creo (estan en Lotes, pero no son
// un numero ocupado para sus propios tanques extra).
let _lotesPropios = [];

/* ---------- borrador: la OT a medio armar sobrevive a una recarga ---------- */
const _storage = () => { try { return window.localStorage; } catch { return null; } };
export function guardarBorrador(b){
  try { _storage().setItem(CLAVE_BORRADOR, JSON.stringify({ ...b, ts: Date.now() })); } catch { /* sin storage */ }
}
export function borrarBorrador(){
  try { _storage().removeItem(CLAVE_BORRADOR); } catch { /* sin storage */ }
}
export const fotoDeSesion = () => fotoLotes(_lotes);
export function restaurarLotes(foto){
  _lotes = lotesDeFoto(foto).map(l => ({ ...l, extras: Array.isArray(l.extras) ? l.extras : [] }));
}
export function fijarAlCambiarSesion(fn){ _alCambiarSesion = fn || null; }
const _avisarCambio = () => { if (_alCambiarSesion) _alCambiarSesion(); };

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
  ${_bloqueExtras(l, i)}
</div>`;
}

/* Muestras (0993): de cada lote solo la vasija, sugerida desde el Mapa y el
 * padron; se puede corregir aca o despues sobre la hoja. */
const _vasijaSugerida = l => vasijaDeLote({ barriles: l.barriles, tanques: l.tanques.filter(t => t.tildado),
  cantidad_barricas: l.modo_origen === 'cantidad' ? l.cantidad_barricas : null });
function _loteMuestra(l, i){
  const aviso = l.enLotes ? '' : '<div class="msg err">⚠ No está en la lista de lotes.</div>';
  return `<div class="card ote-lote">
  <div><b>${esc(l.lote)}</b> ${esc(l.id_texto)} ${l.organico ? '🟢 orgánico' : ''}
    <button class="rowbtn" data-quitar="${i}" title="Quitar lote">✕</button></div>
  ${aviso}
  <label>Vasija</label> <input class="txt" data-vasm="${i}" value="${escA(l.vasija_muestra ?? _vasijaSugerida(l))}" placeholder="p. ej. T50">
</div>`;
}

export function pintarLotes(){
  _avisarCambio();
  const cont = $('otePorLote');
  if (!cont) return;
  if (_desdeTanque()){ cont.innerHTML = _lotes.map(_loteDesdeTanque).join(''); return; }
  if (sinMovimientos(_plantilla)){ cont.innerHTML = _lotes.map(_loteMuestra).join(''); return; }
  cont.innerHTML = _lotes.map((l, i) => {
    const avisos = [];
    if (!l.enLotes) avisos.push('⚠ No está en la lista de lotes.');
    const vacios = l.barriles.filter(b => b.estado !== 'LLENO').length;
    if (vacios) avisos.push(`⚠ ${vacios} barril(es) figuran VACÍOS en el Mapa.`);
    const porCantidad = l.modo_origen === 'cantidad';
    const modo = `<div class="ote-agregar"><label><input type="radio" name="oteModo${i}" data-modo="${i}:detalle"${porCantidad ? '' : ' checked'}> Vasijas específicas</label>` +
      `<label><input type="radio" name="oteModo${i}" data-modo="${i}:cantidad"${porCantidad ? ' checked' : ''}> Cantidad de barricas</label>` +
      (porCantidad ? `<input class="txt ote-num" type="number" min="1" step="1" data-cantidad="${i}" value="${escA(l.cantidad_barricas ?? '')}" placeholder="cantidad" aria-label="Cantidad de barricas">` : '') + '</div>';
    const checks = !porCantidad && l.barriles.length
      ? l.barriles.map(b => `<label class="ote-barril"><input type="checkbox" data-lote="${i}" data-num="${escA(b.num)}"` +
          `${l.tildados.has(b.num) ? ' checked' : ''}> ${esc(b.num)} · ${esc(b.cap ?? '')} L · ${esc(b.marca)} ${esc(b.anio)} ` +
          `<span style="color:var(--muted)">${esc(b.estado)}</span></label>`).join('')
      : '';
    // Los tanques del padron no estan en el Mapa: van como casillas propias,
    // con sus litros editables. El del lote viene tildado.
    const tanques = l.tanques.map((t, j) =>
      `<label class="ote-barril ote-tq"><input type="checkbox" data-tq="${i}:${j}"${t.tildado ? ' checked' : ''}> ` +
      `<b>${esc(nombreTanque(t.num))}</b> · <input class="txt ote-num" type="number" step="any" min="0" data-tql="${i}:${j}" ` +
      `value="${escA(t.litros ?? '')}" placeholder="litros" aria-label="Litros del ${escA(nombreTanque(t.num))}"> L ` +
      `<button class="rowbtn" data-tqx="${i}:${j}" title="Quitar tanque">✕</button></label>`).join('');
    // Vasijas que no estan en ningun sistema (IBC, bins): nombre libre + litros.
    const otras = l.otras.map((o, j) =>
      `<div class="ote-otra"><input class="txt" data-otn="${i}:${j}" value="${escA(o.nombre)}" placeholder="Vasija (p. ej. IBC 1)" aria-label="Nombre de la vasija"> ` +
      `<input class="txt ote-num" type="number" step="any" min="0" data-otl="${i}:${j}" value="${escA(o.litros ?? '')}" placeholder="litros" aria-label="Litros"> L ` +
      `<button class="rowbtn" data-otx="${i}:${j}" title="Quitar vasija">✕</button></div>`).join('');
    // OT viejas (antes de "+ vasija manual"): el texto escrito a mano se muestra.
    const viejo = l.vasijas_manual
      ? `<div style="font-size:12px;color:var(--muted)">Vasijas: ${esc(l.vasijas_manual)}</div>` : '';
    // El origen es la vasija de crianza del lote (barriles del Mapa y sus
    // tanques); lo que no esta en ningun sistema va como vasija manual.
    const agregar = `<div class="ote-agregar">
    <button class="btn" type="button" data-mas-otra="${i}">+ vasija manual</button></div>`;
    return `<div class="card ote-lote">
  <div><b>${esc(l.lote)}</b> ${esc(l.id_texto)} ${l.organico ? '🟢 orgánico' : ''}
    <button class="rowbtn" data-quitar="${i}" title="Quitar lote">✕</button></div>
  ${avisos.map(a => `<div class="msg err">${esc(a)}</div>`).join('')}
  ${modo}${porCantidad ? '' : `<div class="ote-barriles">${checks}${tanques}</div>${otras}${viejo}${agregar}`}
  <div class="ote-litros"><label>Litros previstos</label> <input class="txt" type="number" step="any" data-litros="${i}" value="${escA(l.litros ?? '')}">
  <span class="ote-suma" data-suma="${i}">${_textoSuma(l, i)}</span></div>
  ${_bloqueExtras(l, i)}
</div>`;
  }).join('') + _datalistPadron() + (_mapaCaido
    ? '<div class="msg err">El Mapa de Barriles no respondió: usá «Cantidad de barricas» o «+ vasija manual» (un nombre como «17 barricas» se descuenta al confirmar).</div>' : '');
}

/* En el Corte los tanques extra son de la OT (los pide su asistente), no de
 * cada lote de origen. */
const _plantillaEsCorte = () => !!(plantillaPorId(_plantilla) || {}).loteCorte;

/* Trasiegos simples: cada lote elige sus destinos abajo, en su tarjeta (el
 * campo de arriba se oculta). En el Corte el destino es de la OT. */
const _destinoPorLote = () => admiteExtras(_plantilla) && !_plantillaEsCorte();

const _fmtL = v => Math.round(Number(v) || 0).toLocaleString('es-AR');

/* Litros que van al primer destino: lo que sale menos los extra, si todos los
 * extra tienen litros; si no, null (se sabe al confirmar). */
function _restoD1(l){
  if (!(Number(l.litros) > 0)) return null;
  if (l.extras.some(d => !(Number(d.litros) > 0))) return l.extras.length ? null : Number(l.litros);
  return Number(l.litros) - l.extras.reduce((s, d) => s + Number(d.litros), 0);
}

/* Destinos del lote: el primero conserva el numero del lote; cada uno mas es
 * un lote nuevo (hijo) con su tanque, o sus barricas/T50 (una sola fila), sus
 * litros (opcionales) y su numero, propuesto y editable. */
function _bloqueExtras(l, i){
  if (!_destinoPorLote()) return '';
  const tanque = tipoDestino(_plantilla) === 'tanque';
  const fila1 = `<div class="ote-dest-fila">
    <input class="txt"${tanque ? ' list="otePadron"' : ''} data-d1="${i}" value="${escA(l.destino || '')}"
      placeholder="${tanque ? 'Tanque (n°)' : 'p. ej. Barricas Pinot'}" aria-label="Primer destino del lote ${escA(l.lote)}">
    <span class="ote-dest-resto" data-resto="${i}">${_textoResto(l)}</span>
    <span class="ote-dest-lote" title="El primer destino sigue siendo el mismo lote">${esc(l.lote)}</span><span></span></div>`;
  const filas = l.extras.map((d, k) => `<div class="ote-dest-fila">
    ${esChicas(d) ? `<span class="ote-chicas">
      <input class="txt" type="number" min="0" step="1" data-exb="${i}:${k}" value="${escA(d.barricas || '')}" placeholder="—" aria-label="Cantidad de barricas"><span>barricas</span>
      <input class="txt" type="number" min="0" step="1" data-ext50="${i}:${k}" value="${escA(d.t50 || '')}" placeholder="—" aria-label="Cantidad de T50"><span>T50</span></span>`
    : `<input class="txt" list="otePadron" data-exn="${i}:${k}" value="${escA(d.num)}" placeholder="Tanque (n°)" aria-label="Tanque destino">`}
    <input class="txt" type="number" step="any" min="0" data-exl="${i}:${k}" value="${escA(d.litros ?? '')}" placeholder="litros" aria-label="Litros previstos">
    <input class="txt" data-exlote="${i}:${k}" value="${escA(d.lote)}" aria-label="Lote nuevo" title="Lote nuevo (hijo de ${escA(l.lote)})">
    <button class="rowbtn" data-exx="${i}:${k}" title="${esChicas(d) ? 'Quitar barricas' : 'Quitar tanque'}">✕</button></div>`).join('');
  return `<div class="ote-destinos">
  <div class="ote-dest-cab"><b>Destinos</b><span data-sale="${i}">${_textoSale(l)}</span></div>
  <div class="ote-dest-fila ote-dest-tit"><span>Vasija</span><span>Litros</span><span>Lote</span><span></span></div>
  ${fila1}${filas}
  <div class="ote-dest-pie" data-exsuma="${i}">${_textoSumaExtras(l)}</div>
  <div class="ote-agregar"><button class="btn" type="button" data-exmas="${i}">＋ Tanque</button>
    ${l.extras.some(esChicas) ? '' : `<button class="btn" type="button" data-exmasb="${i}">＋ Barricas / T50</button>`}</div>
</div>`;
}

const _textoSale = l => Number(l.litros) > 0 ? `sale ${_fmtL(l.litros)} L` : 'cargá los litros que salen';
function _textoResto(l){
  const r = _restoD1(l);
  return r == null ? '<span title="Se mide al confirmar">el resto</span>' : (r < 0 ? '0' : _fmtL(r)) + ' L';
}

/* La cuenta de los destinos: lo que sale, lo que ya tiene destino y lo que
 * queda (va al primero). Avisa si los destinos suman mas de lo que sale. */
function _textoSumaExtras(l){
  if (!l.extras.length || !(Number(l.litros) > 0)) return '';
  const con = l.extras.filter(d => Number(d.litros) > 0).reduce((s, d) => s + Number(d.litros), 0);
  const d1 = String(l.destino || '').trim();
  const a = d1 ? 'a ' + esc(d1) : 'al primer destino';
  const resto = Number(l.litros) - con;
  if (resto < 0) return `<span class="ote-dest-mal">⚠ Los destinos suman ${_fmtL(-resto)} L más de lo que sale.</span>`;
  const faltan = l.extras.filter(d => !(Number(d.litros) > 0)).length;
  return `${_fmtL(l.litros)} − ${_fmtL(con)} = <b>${_fmtL(resto)} L</b> ${faltan ? 'para repartir' : a}`
    + (faltan ? ` (${faltan === 1 ? 'un destino no tiene' : faltan + ' destinos no tienen'} litros)` : '');
}

/* Repinta solo las cuentas: asi no se pierde el campo al que se paso con Tab. */
function _refrescarSumaExtras(i){
  const l = _lotes[i];
  for (const [sel, txt] of [[`[data-exsuma="${i}"]`, _textoSumaExtras], [`[data-resto="${i}"]`, _textoResto], [`[data-sale="${i}"]`, _textoSale]]){
    const el = document.querySelector('#otePorLote ' + sel);
    if (el) el.innerHTML = txt(l);
  }
}

/* Numero propuesto para los extra sin numero: el siguiente libre, sin chocar
 * con los de los otros lotes de esta OT (ni los ya escritos en cualquier lote).
 * El año es el del vino (el del lote padre: 25312 -> 25xxx), no el de la OT. */
function _proponerLotesExtra(){
  const anioOT = Number(String($('oteFecha') && $('oteFecha').value || hoyLocalISO()).slice(0, 4));
  const reservados = extrasReservados(-1);
  for (const l of _lotes){
    const anio = anioDeLote(l.lote, anioOT);
    l.extras = asignarLotesExtra(l.extras, { lotes: DATOS().lotes || [], anio, reservados });
    reservados.push(...l.extras.map(d => d.lote));
  }
}

/* Los lotes que ya usan como hijo los tanques extra de los OTROS lotes de la
 * sesion (asi no se proponen dos veces). */
export function extrasReservados(exceptoI){
  return _lotes.flatMap((l, i) => i === exceptoI ? [] : (l.extras || []).map(d => String(d.lote ?? '').trim()).filter(Boolean));
}

/* Valida los tanques extra de todos los lotes de la sesion contra el destino
 * de la OT. Devuelve el texto del error, o '' si esta todo bien. */
export function validarExtrasSesion(){
  // En el Corte el bloque no se ve: lo que quedo de otra plantilla no se valida.
  if (!admiteExtras(_plantilla) || _plantillaEsCorte()) return '';
  const propios = new Set(_lotesPropios || []);
  for (const l of _lotes){
    // El hijo copia la ficha del padre: sin ficha en Lotes no hay de donde.
    if (!l.enLotes && (l.extras || []).length) return 'El lote ' + l.lote + ' no está en la lista: no se le pueden crear destinos extra.';
    const v = validarExtras(l.extras || [], { lotes: DATOS().lotes || [], padron: DATOS().vasijas || [],
      origenes: _lotes.map(x => x.lote), destino1: l.destino || '', propios });
    if (!v.ok) return 'Lote ' + l.lote + ': ' + v.error;
  }
  const entre = validarExtrasEntreLotes(_lotes.map(l => l.extras || []));
  return entre.ok ? '' : entre.error;
}

/* Suma a Lotes los lotes hijos de los tanques extra, fijados arriba. */
function _crearLotesHijos(d, hijos){
  if (!Array.isArray(d.lotes)) d.lotes = [];
  for (const h of [...hijos].reverse()){ d.lotes.unshift(h); fijar(h); }
  refrescarOpcionesFiltros();
  // Al editar, si solo se recrea un hijo borrado a mano, la OT "no cambio":
  // igual hay que guardar el lote.
  markDirty();
}

/* La cabecera toca los extra: el año de los lotes nuevos propuestos sale de
 * la fecha, y el destino de la OT sale en el bloque "Destinos". */
function _cablearCabeceraExtras(){
  const hayExtras = () => admiteExtras(_plantilla) && _lotes.some(l => l.extras && l.extras.length);
  $('oteFecha').addEventListener('change', () => { if (hayExtras()){ _proponerLotesExtra(); pintarLotes(); } });
  $('oteDestino').addEventListener('change', () => { if (hayExtras() && !_destinoPorLote()) pintarLotes(); });
}

/* Los lotes hijos que la OT necesita y todavia no estan en Lotes. */
const _hijosDe = ot => armarHijosExtra(ot, lote => (DATOS().lotes || []).find(x => String(x.lote) === String(lote)), DATOS().lotes || []);

/* Las partes del lote que suman litros: barriles tildados, tanques tildados y
 * vasijas manuales. */
const _tanquesTildados = l => l.tanques.filter(t => t.tildado);
const _partes = l => ({ barriles: l.barriles, tildados: l.tildados, tanques: _tanquesTildados(l), otras: l.otras });
const _cantidadValida = l => {
  const n = Number(l && l.cantidad_barricas);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const _litrosAutomaticos = l => {
  const cantidad = l.modo_origen === 'cantidad' ? _cantidadValida(l) : null;
  return cantidad ? cantidad * 225 : sumaLitros(_partes(l)) || null;
};

/* Debajo de los litros: de donde sale la suma, o el ↺ si se escribio a mano. */
function _textoSuma(l, i){
  if (l.litrosManual) return `<button class="rowbtn" type="button" data-resumar="${i}" title="Volver a la suma de las vasijas">↺ suma</button>`;
  const cantidad = l.modo_origen === 'cantidad' ? _cantidadValida(l) : null;
  if (cantidad) return `= ${cantidad} × 225 = ${cantidad * 225} L`;
  const det = detalleSuma(_partes(l));
  return det.includes('+') ? '= ' + esc(det) + ' L' : '';
}

function _datalistPadron(){
  const vs = (DATOS().vasijas || []).filter(v => v && v.activa !== false);
  if (!vs.length) return '';
  return '<datalist id="otePadron">' + vs.map(v =>
    `<option value="${escA(v.num)}">${esc(nombreTanque(v.num) + ' · ' + (v.tipo || '') + (v.cap_real ? ' · ' + v.cap_real + ' L' : ''))}</option>`).join('') + '</datalist>';
}

/* Recalcula los litros (si no se escribieron a mano) y los pinta sin repintar
 * la tarjeta: asi no se pierde el foco al pasar de un campo al otro. */
function _refrescarSuma(i){
  _recalcularLitros(i);
  const l = _lotes[i];
  const inp = document.querySelector(`#otePorLote [data-litros="${i}"]`);
  if (inp && !l.litrosManual) inp.value = l.litros ?? '';
  const s = document.querySelector(`#otePorLote [data-suma="${i}"]`);
  if (s) s.innerHTML = _textoSuma(l, i);
  _refrescarSumaExtras(i);
}

const _ij = v => String(v).split(':').map(Number);

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

/* Lotes que llegan desde la Agenda: se agregan como si se tipearan y Enter.
 * _agregarLoteAhora limpia el campo antes de su await, asi que se pueden
 * encadenar sin esperar al Mapa de Barriles. */
export function precargarLotesOT(lotes, fecha){
  const inp = $('oteLote');
  if (!inp) return;
  // Desde la Agenda: la fecha del dia en que esta agendado el trasiego.
  const f = $('oteFecha');
  if (f && fecha) f.value = fecha;
  for (const l of lotes || []){ inp.value = String(l); _agregarLote(); }
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
  // Los tanques del padron donde esta el lote hoy, de su vasija de crianza
  // (no estan en el Mapa). El origen sale de aca: no se tipean tanques.
  const tq = ficha ? tanqueDelLote(ficha, DATOS().vasijas) : null;
  const tqs = ficha ? tanquesDelLote(ficha, DATOS().vasijas) : [];
  const l = {
    lote, enLotes: !!ficha,
    id_texto: (ficha && ficha.id_texto) || '',
    organico: !!(ficha && esOrganico(ficha)),
    barriles, tildados, modo_origen: 'detalle', cantidad_barricas: null, vasijas_manual: '',
    tanques: tqs.map(t => ({ ...t, tildado: true })),
    otras: [],
    destino: '',
    litros: null,
    litrosManual: false,
    barricas: null, barricasManual: false,
    extras: [],
  };
  if (_desdeTanque()){
    // Desde tanque: el campo "Tanque origen" y los litros vienen del lote.
    if (tq){ l.vasijas_manual = nombreTanque(tq.num); l.litros = tq.litros; l.barricas = barricasEstimadas(tq.litros); }
  } else {
    // El Mapa no conoce los barriles del lote (o no respondio) y la ficha
    // dice que son N barricas: arranca por cantidad, que al confirmar se
    // descuenta sola. Se puede cambiar a vasijas especificas.
    const sinMapa = origenSinMapa(ficha, barriles);
    if (sinMapa){ l.modo_origen = 'cantidad'; l.cantidad_barricas = sinMapa.cantidad; }
    l.litros = _litrosAutomaticos(l);
  }
  _lotes.push(l);
  pintarLotes();
}

function _recalcularLitros(i){
  const l = _lotes[i];
  if (l.litrosManual) return; // el usuario ya escribio un valor a mano: no lo pisamos
  l.litros = _litrosAutomaticos(l);
}

/* Arranca una sesión de lotes vacía: la usan el formulario y el asistente del
 * Corte cuando se abren de cero. */
export function iniciarSesionLotes(plantilla){
  _lotes = []; _mapaVersion = null; _mapaCaido = false;
  _sesion++; _pendientes = new Set(); _enVuelo = new Set();
  _plantilla = plantilla || PLANTILLAS_OT[0].id;
  _lotesPropios = [];
}

/* Abre Emitir OT. Antes: si hay una minimizada, retomarla o descartarla (la
 * sesion de lotes es una sola); si quedo un borrador de una recarga, ofrecerlo.
 * Devuelve true si abrio un formulario NUEVO (la Agenda precarga sus lotes
 * solo en ese caso). */
/* Hay una OT minimizada: retomarla (true = se retomo, no abrir otra) o
 * descartarla. */
async function _resolverMinimizada(){
  if (!overlayMinimizado()) return false;
  const retomar = await confirmar({ titulo: 'Hay una OT en curso', texto: 'Tenés una orden minimizada, sin emitir ni guardar.',
    si: 'Retomarla', no: 'Descartarla y seguir' });
  if (retomar){ retomarOverlay(); return true; }
  descartarMinimizado();
  return false;
}

/* `plantilla` (modo órdenes): el formulario abre con esa plantilla puesta,
 * o el asistente del Corte si la plantilla crea un lote. */
export async function abrirEmitirOT(onListo, { plantilla } = {}){
  if (await _resolverMinimizada()) return false;
  const b = leerBorrador(_storage());
  if (b){
    const cuando = new Date(b.ts).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    const retomar = await confirmar({ titulo: 'Hay una OT sin emitir',
      texto: resumenBorrador(b) + '\nQuedó a medio armar: ' + cuando, si: 'Retomarla', no: 'Descartarla' });
    if (retomar){
      if (b.tipo === 'corte') abrirCorteOT(onListo, { restaurar: b });
      else _abrirFormulario(onListo, b);
      return false;
    }
    borrarBorrador();
  }
  if (plantilla && creaLote(plantilla)){ abrirCorteOT(onListo, { plantilla }); return true; }
  _abrirFormulario(onListo, null, undefined, plantilla);
  return true;
}

/* ✎ Editar una OT pendiente: la misma ventana con todo cargado (o el
 * asistente, si es un Corte). Se puede cambiar el N°; la plantilla no. */
export async function abrirEditarOT(ot, onListo){
  if (!ot || esEjecutado(ot)) return;
  if (await _resolverMinimizada()) return;
  if (creaLote(ot.plantilla)) return abrirCorteOT(onListo, { editar: ot });
  _abrirFormulario(onListo, null, ot);
}

/* Una OT emitida pasada a la sesion de lotes: los barriles son la foto de la
 * OT (tildados) mas los que el Mapa tenga hoy del lote, para poder sumar. */
export async function cargarSesionDeOT(ot){
  iniciarSesionLotes(ot.plantilla);
  const sesion = _sesion;
  const desdeTanque = origenTanque(ot.plantilla);
  const lotes = await Promise.all((ot.lotes || []).map(async l => {
    const ficha = (DATOS().lotes || []).find(x => String(x.lote) === String(l.lote));
    const foto = l.barriles || [];
    const nums = new Set(foto.map(b => String(b.num)));
    const mapa = desdeTanque ? [] : await _traerBarriles(l.lote);
    const tanques = (l.tanques || []).map(t => ({ ...t, tildado: true }));
    const otras = (l.otras || []).map(o => ({ ...o }));
    const cantidad = Number(l.cantidad_barricas);
    const modo_origen = Number.isInteger(cantidad) && cantidad > 0 ? 'cantidad' : 'detalle';
    const suma = modo_origen === 'cantidad' ? cantidad * 225 : sumaLitros({ barriles: foto, tanques, otras });
    return {
      lote: String(l.lote), enLotes: !!ficha, id_texto: l.id_texto || '', organico: !!l.organico,
      barriles: [...foto, ...mapa.filter(b => !nums.has(String(b.num)))],
      tildados: new Set(foto.map(b => b.num)),
      modo_origen,
      cantidad_barricas: modo_origen === 'cantidad' ? cantidad : null,
      vasijas_manual: l.vasijas_manual || '', tanques, otras,
      litros: l.litros_previstos ?? null,
      litrosManual: l.litros_previstos != null && l.litros_previstos !== suma,
      barricas: l.barricas_previstas ?? null, barricasManual: l.barricas_previstas != null,
      destino: l.destino || ot.destino || '',
      extras: (l.destinos_extra || []).map(d => esChicas(d)
        ? { tipo: 'chicas', barricas: d.barricas, t50: d.t50, litros: d.litros, lote: d.lote, mov_id: d.mov_id }
        : { num: d.num, litros: d.litros, lote: d.lote, mov_id: d.mov_id }),
    };
  }));
  if (sesion !== _sesion) return false;
  _lotes = lotes;
  _lotesPropios = extrasDeOT(ot).map(x => x.d.lote);
  return true;
}

/* El N° nuevo de una OT que se edita: avisa si ya lo usa otra OT de la web o
 * un archivo de la carpeta, y deja seguir si el usuario lo confirma.
 * Devuelve el numero normalizado ("953" -> "0953"), o null para no guardar. */
export async function aceptarNumeroNuevo(texto, ot){
  const nuevo = normalizarNumero(texto, 'principal');
  if (!nuevo){ avisar('Falta el número de OT.', { tipo: 'mal' }); return null; }
  if (nuevo === ot.ot) return nuevo;
  const enWeb = (DATOS().ordenes_trabajo || []).some(x => x.id !== ot.id && x.ot === nuevo);
  if (enWeb && !await confirmar({ titulo: 'Número repetido', texto: 'Otra OT de la web ya usa el ' + nuevo + '.', si: 'Usarlo igual', no: 'Cancelar' })) return null;
  const nombres = await listarSerie('principal');
  const usado = nombres ? numeroUsado(nombres, nuevo, 'principal') : null;
  if (usado && !await confirmar({ titulo: 'Ese número ya está en la carpeta', texto: 'El N° ' + nuevo + ' ya lo usa «' + usado + '».', si: 'Usarlo igual', no: 'Cancelar' })) return null;
  return nuevo;
}

/* Guarda la edicion de una OT pendiente (formulario o asistente del Corte).
 * `antes(d)` corre antes de aplicar (el Corte crea ahi un lote nuevo). */
export async function guardarEdicionOT(ot, cambios, onListo, antes){
  const d = DATOS();
  const { numero, ...resto } = cambios || {};
  const viejo = ot.ot;
  const numeroNuevo = numero && numero !== viejo ? numero : null;
  if (antes) antes(d);
  // El N° primero: renumerarOT arrastra movimientos, mermas y correcciones, y
  // los movimientos nuevos de la edicion ya nacen con el numero nuevo.
  let pdfViejo = '';
  if (numeroNuevo){
    pdfViejo = ot.pdf && ot.pdf.estado === 'carpeta' ? ot.pdf.nombre : '';
    renumerarOT(d, ot, numeroNuevo);
    ot.pdf = null;   // el PDF guardado tiene el numero viejo
  }
  if (esSalida(ot.plantilla) && resto.destino !== undefined) resto.destino = _destinoExterno(d, resto.destino);
  const r = aplicarEdicionOT(d, ot, resto, { usuario: usuarioActual(), hoy: hoyLocalISO() });
  fijarAlCambiarSesion(null);
  cerrarOverlay();
  if (!r.cambio && !numeroNuevo){ avisar('No había cambios en la OT ' + ot.ot + '.', { tipo: 'info' }); onListo(ot); return r; }
  markDirty();
  onListo(ot);
  const ok = await guardar(false);
  const avisos = [];
  if (!ok) avisos.push('No se pudo guardar: resolvé el guardado antes de imprimir.');
  if (numeroNuevo) avisos.push('La OT ' + viejo + ' ahora es la ' + numeroNuevo + '.');
  if (pdfViejo) avisos.push('En la carpeta quedó «' + pdfViejo + '» con el número viejo. La web no borra archivos: renombralo o borralo a mano, y volvé a imprimir.');
  if (r.celdasLimpias) avisos.push('Cambiaron las filas de las tablas: lo escrito a mano en sus casilleros se reinició (los pasos y el título siguen).');
  const conCorr = r.quitados.filter(l => (d.analisis || []).some(a => a && String(a.lote) === l &&
    ((a.correccion && String(a.correccion.ot_n ?? '') === ot.ot) ||
     (Array.isArray(a.agregados) && a.agregados.some(g => g && String(g.ot_n ?? '') === ot.ot)))));
  if (conCorr.length) avisos.push('Se quitaron los lotes ' + conCorr.join(', ') + ', que tienen correcciones registradas con esta OT: esas correcciones quedan como están.');
  if (ot.pdf && ot.pdf.estado === 'viejo') avisos.push('El PDF guardado en la carpeta no tiene los cambios: volvé a imprimir.');
  // Solo el cambio de numero no amerita una ventana: alcanza el aviso.
  if (avisos.length > (numeroNuevo ? 1 : 0)) await informar({ titulo: 'OT ' + ot.ot + ' actualizada', texto: avisos.join('\n') });
  else if (numeroNuevo) avisar(avisos[0], { tipo: 'ok' });
  else avisar('OT ' + ot.ot + ' actualizada.', { tipo: 'ok' });
  return r;
}

function _abrirFormulario(onListo, borrador, editar, plantillaInicial){
  iniciarSesionLotes();
  // Fecha de trabajo por defecto: la LOCAL (las mermas de la OT cuentan desde aca).
  const hoy = hoyLocalISO();
  const numero = editar ? editar.ot
    : proximoNumeroOT(DATOS().movimientos || [], Number(hoy.slice(0, 4)), DATOS().ordenes_trabajo || []);
  const opts = PLANTILLAS_OT.map(p => `<option value="${escA(p.id)}">${esc(p.nombre)}</option>`).join('');

  mostrarOverlay(`
<h3 style="margin:0 0 14px">${editar ? '✎ Editar la OT ' + esc(editar.ot) : '➕ Emitir orden de trabajo de trasiego'}</h3>
<div style="display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center">
  <label>Plantilla</label><select class="txt" id="otePlantilla"${editar ? ' disabled' : ''}>${opts}</select>
  <label>N° de OT</label><div><input class="txt" id="oteNumero" value="${escA(numero)}"> ${chipCarpeta('principal')}</div>
  <label for="oteFecha">Fecha programada</label><input class="txt" type="date" id="oteFecha" value="${escA(hoy)}" title="Vacío = hoy">
  <label id="oteDestinoLbl">Tanque destino</label><input class="txt" id="oteDestino" placeholder="vacío = 'Tanque pulmón: ____'">${_dlDestinosExternos()}
  <label id="oteMuestraLbl" for="oteMuestra" style="display:none">Muestra</label><input class="txt" id="oteMuestra" value="${escA(MUESTRA_POR_DEFECTO)}" style="display:none" title="Va en todas las filas; después se corrige fila por fila sobre la hoja">
  <label>Emitió</label><input class="txt" id="oteEmitio" value="${escA(usuarioActual())}">
  <label>Agregar lote</label><input class="txt" id="oteLote" placeholder="Número de lote y Enter">
</div>
<div id="otePorLote" style="margin-top:12px;max-height:50vh;overflow:auto"></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="oteMinimizar" title="Guardar la OT abajo y seguir usando la web (también con clic afuera o Escape)">— Minimizar</button>
  <button class="btn" id="oteCancelar">Cancelar</button>
  <button class="btn primary" id="oteEmitir">${editar ? 'Guardar cambios' : 'Emitir OT'}</button>
</div>`);
  if (editar) return _cablearEdicion(onListo, editar);

  // El numero de hoy queda de respaldo; el de la carpeta lo reemplaza solo si
  // el usuario no toco el campo.
  let numeroTocado = false;
  if (borrador){
    // Retomar: la cabecera y los lotes como quedaron.
    const c = borrador.cab || {};
    _plantilla = c.plantilla || _plantilla;
    $('otePlantilla').value = _plantilla;
    for (const [id, k] of [['oteNumero', 'numero'], ['oteFecha', 'fecha'], ['oteDestino', 'destino'], ['oteEmitio', 'emitio'], ['oteMuestra', 'muestra']])
      if (c[k] != null) $(id).value = c[k];
    numeroTocado = !!c.numeroTocado;
    restaurarLotes(borrador.lotes);
  } else if (plantillaInicial){
    // Modo órdenes: la plantilla viene elegida desde la sección Órdenes de
    // trabajo (setear value no dispara el 'change' del select).
    _plantilla = plantillaInicial;
    $('otePlantilla').value = _plantilla;
  }
  const hayDatos = () => _lotes.length > 0 || !!($('oteDestino') && $('oteDestino').value.trim());
  const borradorAhora = () => {
    if (!$('oteNumero')) return;   // minimizado o cerrado: lo ultimo guardado vale
    if (!hayDatos()){ borrarBorrador(); return; }
    guardarBorrador({ tipo: 'emitir', lotes: fotoDeSesion(), cab: { plantilla: _plantilla,
      numero: $('oteNumero').value, numeroTocado, fecha: $('oteFecha').value,
      destino: $('oteDestino').value, emitio: $('oteEmitio').value, muestra: $('oteMuestra').value } });
  };
  fijarAlCambiarSesion(borradorAhora);
  protegerOverlay({
    titulo: () => 'OT ' + (($('oteNumero') && $('oteNumero').value) || ''),
    hayDatos,
    alRetomar: () => pintarLotes(),
    alDescartar: () => { borrarBorrador(); iniciarSesionLotes(); },
  });
  $('oteNumero').addEventListener('input', () => { numeroTocado = true; });
  for (const id of ['oteNumero', 'oteFecha', 'oteDestino', 'oteEmitio', 'oteMuestra'])
    $(id).addEventListener('change', borradorAhora);
  $('otePorLote').addEventListener('change', borradorAhora);
  _cablearCabeceraExtras();
  const sembrar = () => proponerNumero('principal').then(p => {
    if (!numeroTocado && $('oteNumero')) $('oteNumero').value = p.numero;
  });
  sembrar();
  cablearChipsCarpeta($('oteNumero').parentElement, sembrar);

  const ajustarDestino = () => _rotularDestino();
  $('otePlantilla').addEventListener('change', () => {
    _plantilla = $('otePlantilla').value;
    // El Corte crea un lote: se sigue en el asistente, con lo ya cargado.
    if (creaLote(_plantilla)){
      abrirCorteOT(onListo, { plantilla: _plantilla, numero: $('oteNumero').value, numeroTocado, fecha: $('oteFecha').value,
                              emitio: $('oteEmitio').value, destino: $('oteDestino').value });
      return;
    }
    ajustarDestino(); pintarLotes();
  });
  conectarLotes();
  if (borrador || plantillaInicial){ ajustarDestino(); pintarLotes(); }
  $('oteMinimizar').addEventListener('click', () => minimizarOverlay());
  $('oteCancelar').addEventListener('click', async () => {
    if (hayDatos() && !await confirmar({ titulo: 'Descartar la OT', texto: 'Se pierde lo cargado en esta OT sin emitir.',
      si: 'Descartar', no: 'Seguir armándola', peligro: true })) return;
    borrarBorrador();
    fijarAlCambiarSesion(null);
    cerrarOverlay();
  });
  $('oteEmitir').addEventListener('click', () => _emitir(onListo));
}

/* El campo Destino cambia de sentido con la plantilla: desde tanque es texto
 * libre, en un Traslado es la bodega adonde va el vino (con los destinos
 * externos de Config como sugerencias) y en las demas, el tanque destino. */
function _dlDestinosExternos(){
  const lista = (DATOS().config && DATOS().config.destinos_externos) || [];
  return '<datalist id="oteDestinosExt">' + lista.map(d => `<option value="${escA(d)}">`).join('') + '</datalist>';
}
function _rotularDestino(){
  // Muestras (0993): no hay destino; se pide la muestra para todas las filas.
  const mu = sinMovimientos(_plantilla);
  // Trasiegos simples: el destino se elige abajo, en cada lote.
  for (const id of ['oteDestinoLbl', 'oteDestino']) $(id).style.display = mu || _destinoPorLote() ? 'none' : '';
  for (const id of ['oteMuestraLbl', 'oteMuestra']) $(id).style.display = mu ? '' : 'none';
  if (mu) return;
  const inp = $('oteDestino');
  if (esSalida(_plantilla)){
    $('oteDestinoLbl').textContent = 'Bodega destino';
    inp.placeholder = 'p. ej. VF';
    inp.setAttribute('list', 'oteDestinosExt');
    return;
  }
  inp.removeAttribute('list');
  const t = _desdeTanque();
  $('oteDestinoLbl').textContent = t ? 'Destino' : 'Tanque destino';
  inp.placeholder = t ? 'p. ej. Barricas Pinot (no 2026-2025)' : "vacío = 'Tanque pulmón: ____'";
}

/* El formulario en modo edicion: cabecera de la OT, sus lotes (con el Mapa
 * de hoy) y "Guardar cambios". No guarda borrador de recarga (no pisa el de
 * una OT nueva); minimizar si. */
function _cablearEdicion(onListo, ot){
  const id = ot.id;
  _plantilla = ot.plantilla;
  $('otePlantilla').value = ot.plantilla;
  $('oteFecha').value = ot.fecha || '';
  $('oteDestino').value = ot.destino || '';
  $('oteEmitio').value = ot.emitio || '';
  _rotularDestino();
  let tocado = false;
  fijarAlCambiarSesion(null);
  protegerOverlay({ titulo: () => 'Edición OT ' + ot.ot, hayDatos: () => true, alRetomar: () => pintarLotes() });
  cablearChipsCarpeta($('oteNumero').parentElement);
  $('otePorLote').innerHTML = '<div class="msg">Cargando los lotes de la OT…</div>';
  $('oteEmitir').disabled = true;
  cargarSesionDeOT(ot).then(ok => {
    if (!ok) return;
    pintarLotes();
    if ($('oteEmitir')) $('oteEmitir').disabled = false;
    fijarAlCambiarSesion(() => { tocado = true; });
  });
  for (const f of ['oteNumero', 'oteFecha', 'oteDestino', 'oteEmitio']) $(f).addEventListener('input', () => { tocado = true; });
  _cablearCabeceraExtras();
  $('otePorLote').addEventListener('change', () => { tocado = true; });
  conectarLotes();
  $('oteMinimizar').addEventListener('click', () => minimizarOverlay());
  $('oteCancelar').addEventListener('click', async () => {
    if (tocado && !await confirmar({ titulo: 'Descartar los cambios', texto: 'La OT ' + ot.ot + ' queda como estaba.',
      si: 'Descartar', no: 'Seguir editando', peligro: true })) return;
    fijarAlCambiarSesion(null);
    cerrarOverlay();
  });
  $('oteEmitir').addEventListener('click', async () => {
    await asegurarLotes();
    const error = validarCabecera($('oteNumero').value) || validarLotesOrigen();
    if (error){ avisar(error, { tipo: 'mal' }); return; }
    const o = (DATOS().ordenes_trabajo || []).find(x => x.id === id);
    if (!o || esEjecutado(o)){
      await informar({ titulo: 'No se guardó', texto: 'La OT ' + ot.ot + ' ya no está pendiente (¿la confirmaron o borraron desde otra PC?).' });
      cerrarOverlay();
      return;
    }
    const numero = await aceptarNumeroNuevo($('oteNumero').value, o);
    if (!numero) return;
    $('oteNumero').value = numero;
    const nuevo = armarOTDeSesion({ numero: o.ot, fecha: $('oteFecha').value, plantilla: o.plantilla,
      destino: $('oteDestino').value, emitio: $('oteEmitio').value, loteCorte: o.lote_corte });
    // Los lotes hijos de los tanques extra nuevos entran en el mismo guardado.
    const hijos = _hijosDe(nuevo);
    const r = await guardarEdicionOT(o, { numero, lotes: nuevo.lotes, destino: nuevo.destino, fecha: nuevo.fecha, emitio: nuevo.emitio },
      onListo, hijos.length ? d => _crearLotesHijos(d, hijos) : undefined);
    if (r && r.hijosQuitados && r.hijosQuitados.length)
      await informar({ titulo: 'Lotes que siguen en la lista',
        texto: 'Esta OT había creado ' + r.hijosQuitados.join(', ') + ' y ya no los usa. No se borran solos: si no se usan, borralos desde la pestaña Lotes.' });
  });
}

/* Los eventos del campo "Agregar lote" y de la lista de lotes (#oteLote y
 * #otePorLote). Se llama cada vez que esos elementos se vuelven a dibujar. */
export function conectarLotes(){
  $('oteLote').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); _agregarLote(); } });
  $('oteLote').addEventListener('change', () => _agregarLote());
  // Destinos: la cuenta de litros se ve mientras se escribe (sin repintar,
  // asi no se pierde el cursor). El 'change' de abajo guarda igual.
  $('otePorLote').addEventListener('input', e => {
    const t = e.target, ds = t.dataset || {};
    if (ds.d1 !== undefined){ _lotes[+ds.d1].destino = t.value.trim(); _refrescarSumaExtras(+ds.d1); }
    else if (ds.exl !== undefined){ const [i, k] = _ij(ds.exl); _lotes[i].extras[k].litros = num(t.value); _refrescarSumaExtras(i); }
  });
  $('otePorLote').addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset.vasm !== undefined){
      _lotes[+t.dataset.vasm].vasija_muestra = t.value.trim();
      _avisarCambio();
    } else if (t.dataset.num !== undefined){
      const l = _lotes[+t.dataset.lote];
      if (t.checked) l.tildados.add(t.dataset.num); else l.tildados.delete(t.dataset.num);
      _recalcularLitros(+t.dataset.lote);
      pintarLotes();
    } else if (t.dataset.modo !== undefined){
      const [i, modo] = t.dataset.modo.split(':');
      const l = _lotes[+i];
      const habiaDetalle = l.tildados.size || l.tanques.some(t => t.tildado) || l.otras.some(o => o.nombre || o.litros) || l.vasijas_manual;
      if (modo === 'cantidad' && habiaDetalle && !await confirmar({ titulo: 'Cambiar a cantidad de barricas', texto: 'Las vasijas específicas no se incluirán al emitir esta OT.', si: 'Usar cantidad', no: 'Cancelar' })){
        pintarLotes();
        return;
      }
      l.modo_origen = modo;
      if (modo === 'cantidad') l.tildados.clear(); else l.cantidad_barricas = null;
      if (!l.litrosManual) l.litros = _litrosAutomaticos(l);
      pintarLotes();
    } else if (t.dataset.cantidad !== undefined){
      const l = _lotes[+t.dataset.cantidad];
      const n = Number(t.value);
      l.cantidad_barricas = Number.isInteger(n) && n > 0 ? n : null;
      if (!l.litrosManual) l.litros = l.cantidad_barricas ? l.cantidad_barricas * 225 : null;
      pintarLotes();
    } else if (t.dataset.tq !== undefined){
      const [i, j] = _ij(t.dataset.tq);
      _lotes[i].tanques[j].tildado = t.checked;
      _refrescarSuma(i);
    } else if (t.dataset.tql !== undefined){
      const [i, j] = _ij(t.dataset.tql);
      _lotes[i].tanques[j].litros = num(t.value);
      _refrescarSuma(i);
    } else if (t.dataset.otn !== undefined){
      const [i, j] = _ij(t.dataset.otn);
      _lotes[i].otras[j].nombre = t.value.trim();
    } else if (t.dataset.otl !== undefined){
      const [i, j] = _ij(t.dataset.otl);
      _lotes[i].otras[j].litros = num(t.value);
      _refrescarSuma(i);
    } else if (t.dataset.masTq !== undefined){
      _agregarTanque(+t.dataset.masTq, t.value);
    } else if (t.dataset.manual !== undefined){
      _lotes[+t.dataset.manual].vasijas_manual = t.value.trim();
    } else if (t.dataset.litros !== undefined){
      const l = _lotes[+t.dataset.litros];
      l.litros = num(t.value);
      l.litrosManual = true;
      if (!_desdeTanque()) _refrescarSuma(+t.dataset.litros);
      if (_desdeTanque() && !l.barricasManual){
        l.barricas = barricasEstimadas(l.litros);
        pintarLotes();
      } else _refrescarSumaExtras(+t.dataset.litros);
    } else if (t.dataset.exn !== undefined){
      const [i, k] = _ij(t.dataset.exn);
      _lotes[i].extras[k].num = t.value.trim();
      _avisarCambio();
    } else if (t.dataset.d1 !== undefined){
      _lotes[+t.dataset.d1].destino = t.value.trim();
      _refrescarSumaExtras(+t.dataset.d1);
      _avisarCambio();
    } else if (t.dataset.exb !== undefined || t.dataset.ext50 !== undefined){
      const [i, k] = _ij(t.dataset.exb ?? t.dataset.ext50);
      _lotes[i].extras[k][t.dataset.exb !== undefined ? 'barricas' : 't50'] = num(t.value);
      _avisarCambio();
    } else if (t.dataset.exl !== undefined){
      const [i, k] = _ij(t.dataset.exl);
      _lotes[i].extras[k].litros = num(t.value);
      _refrescarSumaExtras(i);   // solo la linea de la suma: no se pierde el foco
      _avisarCambio();
    } else if (t.dataset.exlote !== undefined){
      const [i, k] = _ij(t.dataset.exlote);
      _lotes[i].extras[k].lote = t.value.trim();
      _avisarCambio();
    } else if (t.dataset.barricas !== undefined){
      const l = _lotes[+t.dataset.barricas];
      l.barricas = num(t.value);
      l.barricasManual = l.barricas !== null; // borrarlo vuelve al cálculo
      if (!l.barricasManual){ l.barricas = barricasEstimadas(l.litros); pintarLotes(); }
    }
  });
  $('otePorLote').addEventListener('click', e => {
    const b = e.target.closest('[data-quitar]');
    if (b){ _lotes.splice(+b.dataset.quitar, 1); pintarLotes(); return; }
    const x = e.target.closest('[data-tqx],[data-otx],[data-mas-otra],[data-resumar],[data-exmas],[data-exmasb],[data-exx]');
    if (!x) return;
    e.preventDefault();
    if (x.dataset.tqx !== undefined){
      const [i, j] = _ij(x.dataset.tqx); _lotes[i].tanques.splice(j, 1); _recalcularLitros(i); pintarLotes();
    } else if (x.dataset.otx !== undefined){
      const [i, j] = _ij(x.dataset.otx); _lotes[i].otras.splice(j, 1); _recalcularLitros(i); pintarLotes();
    } else if (x.dataset.masOtra !== undefined){
      const i = +x.dataset.masOtra;
      _lotes[i].otras.push({ nombre: '', litros: null });
      pintarLotes();
      const nuevos = document.querySelectorAll(`#otePorLote [data-otn^="${i}:"]`);
      if (nuevos.length) nuevos[nuevos.length - 1].focus();
    } else if (x.dataset.resumar !== undefined){
      const i = +x.dataset.resumar; _lotes[i].litrosManual = false; _refrescarSuma(i);
    } else if (x.dataset.exmas !== undefined){
      const i = +x.dataset.exmas;
      _lotes[i].extras.push({ num: '', litros: null, lote: '' });
      _proponerLotesExtra();
      pintarLotes();
      const nuevos = document.querySelectorAll(`#otePorLote [data-exn^="${i}:"]`);
      if (nuevos.length) nuevos[nuevos.length - 1].focus();
    } else if (x.dataset.exmasb !== undefined){
      const i = +x.dataset.exmasb;
      _lotes[i].extras.push({ tipo: 'chicas', barricas: null, t50: null, litros: null, lote: '' });
      _proponerLotesExtra();
      pintarLotes();
      const nuevo = document.querySelector(`#otePorLote [data-exb="${i}:${_lotes[i].extras.length - 1}"]`);
      if (nuevo) nuevo.focus();
    } else if (x.dataset.exx !== undefined){
      const [i, k] = _ij(x.dataset.exx); _lotes[i].extras.splice(k, 1); pintarLotes();
    }
  });
  // Enter en "+ tanque" agrega el tanque (y no emite ni pasa de paso).
  $('otePorLote').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.masTq !== undefined){
      e.preventDefault(); e.stopPropagation(); e.target.blur();
    }
  });
}

/* "+ tanque": un tanque del padron. Si es el tanque donde esta el lote, trae
 * sus litros; si no, quedan para completar. */
function _agregarTanque(i, texto){
  const l = _lotes[i];
  if (!String(texto || '').trim()) return;
  const v = buscarVasija(DATOS().vasijas, texto);
  if (!v){
    avisar('El tanque «' + String(texto).trim() + '» no está en el padrón de vasijas. Si es una vasija fuera del sistema, usá «+ vasija manual».', { tipo: 'mal' });
    pintarLotes();
    return;
  }
  const n = String(v.num);
  if (l.tanques.some(t => t.num === n)){ pintarLotes(); return; }
  const ficha = (DATOS().lotes || []).find(x => String(x.lote) === l.lote);
  const delLote = ficha ? tanqueDelLote(ficha, DATOS().vasijas) : null;
  l.tanques.push({ num: n, litros: delLote && delLote.num === n ? delLote.litros : null, tildado: true });
  _recalcularLitros(i);
  pintarLotes();
  const inp = document.querySelector(`#otePorLote [data-tql="${i}:${l.tanques.length - 1}"]`);
  if (inp && inp.value === '') inp.focus();
}

async function _emitir(onListo){
  await asegurarLotes();
  const fecha = $('oteFecha').value;
  // "939" -> "0939": asi se guarda con el formato de la carpeta.
  const numero = normalizarNumero($('oteNumero').value, 'principal');
  $('oteNumero').value = numero;
  const mu = sinMovimientos(_plantilla);
  // Muestras: puede salir sin lotes (la tabla se carga a mano sobre la hoja).
  const error = validarCabecera(numero) || (mu ? '' : validarLotesOrigen());
  if (error){ avisar(error, { tipo: 'mal' }); return; }
  if (!await confirmarNumeroRepetido(numero)) return;
  const otro = await numeroOcupadoEnCarpeta(numero);
  if (otro){ $('oteNumero').value = otro; return; }
  const ot = mu ? _armarOTMuestras(numero, fecha)
    : armarOTDeSesion({ numero, fecha, plantilla: _plantilla, destino: $('oteDestino').value, emitio: $('oteEmitio').value });
  // Cada tanque extra es un lote nuevo, hijo del lote que lo llena.
  const hijos = mu ? [] : _hijosDe(ot);
  await registrarOT(ot, onListo, hijos.length ? d => _crearLotesHijos(d, hijos) : undefined);
}

function _armarOTMuestras(numero, fecha){
  const hoy = hoyLocalISO();
  return armarOTMuestras({
    id: 'ot-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    numero, fecha: fechaOHoy(fecha, hoy), emitio: $('oteEmitio').value,
    filas: filasIniciales(_lotes.map(l => ({ lote: l.lote, vasija: l.vasija_muestra ?? _vasijaSugerida(l) })), $('oteMuestra').value),
    usuario: usuarioActual(), hoy,
  });
}

/* Las validaciones que comparten el formulario y el asistente del Corte.
 * Devuelven el texto del error, o '' si está todo bien. */
export function validarCabecera(numero){
  if (!String(numero || '').trim()) return 'Falta el número de OT.';
  return '';
}

export function validarLotesOrigen(){
  const error = _validarOrigenes();
  if (error) return error;
  return validarExtrasSesion();
}

function _validarOrigenes(){
  if (!_lotes.length) return 'Agregá al menos un lote.';
  if (_desdeTanque()){
    const sinTanque = _lotes.find(l => !l.vasijas_manual);
    if (sinTanque) return 'Falta el tanque origen del lote ' + sinTanque.lote + '.';
    return '';
  }
  const cantidadInvalida = _lotes.find(l => l.modo_origen === 'cantidad' && !l.cantidad_barricas);
  if (cantidadInvalida) return 'Indicá una cantidad entera de barricas para el lote ' + cantidadInvalida.lote + '.';
  const sinVasijas = _lotes.find(l => l.modo_origen !== 'cantidad' && !l.tildados.size && !_tanquesTildados(l).length &&
    !l.otras.some(o => o.nombre) && !l.vasijas_manual);
  if (sinVasijas) return 'El lote ' + sinVasijas.lote + ' no tiene barriles ni tanques tildados, ni vasijas manuales.';
  const otraSinNombre = _lotes.find(l => l.otras.some(o => !o.nombre && o.litros != null));
  if (otraSinNombre) return 'Al lote ' + otraSinNombre.lote + ' le falta el nombre de una vasija manual.';
  return '';
}

export async function confirmarNumeroRepetido(numero){
  const d0 = DATOS();
  const yaExiste = (d0.movimientos || []).some(m => m.ot === numero) ||
    (d0.ordenes_trabajo || []).some(o => o.ot === numero);
  if (!yaExiste) return true;
  return confirmar({ titulo: 'Número de OT repetido', texto: 'El número ' + numero + ' ya existe en las OT de la web.', si: 'Usarlo igual', no: 'Cambiarlo' });
}

/* Los lotes de origen cargados en esta sesión (el asistente del Corte los
 * necesita para ofrecer "⎘ Hijo de …"). */
export function lotesDeSesion(){ return _lotes; }

/* La OT con los lotes de la sesión. `loteCorte` = {lote, id_texto} en el Corte.
 * `destinosExtra` = tanques extra de la OT entera (Corte). */
export function armarOTDeSesion({ numero, fecha, plantilla, destino, emitio, loteCorte, achique, destinosExtra }){
  const tanque = origenTanque(plantilla);
  // Trasiego simple: el destino es de cada lote (ot.destino = la lista).
  const porLote = admiteExtras(plantilla) && !pideLoteCorte(plantilla);
  return armarOT({
    id: 'ot-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    numero: String(numero).trim(),
    plantilla,
    fecha: fechaOHoy(fecha, hoyLocalISO()),
    destino: porLote ? '' : destino,
    emitio,
    lotes: _lotes.map(l => ({
      lote: l.lote, id_texto: l.id_texto, organico: l.organico,
      destino: porLote ? String(l.destino || '').trim() : '',
      // Desde tanque no se vacía ningún barril: los del Mapa (si los hay) son
      // de otra partida del lote y no van en la hoja.
      barriles: tanque || l.modo_origen === 'cantidad' ? [] : l.barriles.filter(b => l.tildados.has(b.num)),
      cantidad_barricas: tanque || l.modo_origen !== 'cantidad' ? null : l.cantidad_barricas,
      // Tanques del padron y vasijas manuales: solo en las OT con barriles
      // (desde tanque, el tanque va en "Tanque origen").
      tanques: tanque || l.modo_origen === 'cantidad' ? [] : _tanquesTildados(l).map(t => ({ num: t.num, litros: t.litros })),
      otras: tanque || l.modo_origen === 'cantidad' ? [] : l.otras,
      vasijas_manual: l.vasijas_manual,
      litros_previstos: l.litros,
      barricas_previstas: tanque ? (l.barricas ?? barricasEstimadas(l.litros)) : null,
      // Sin extras va vacio: armarOT no guarda la clave (OT igual a las de antes).
      // En el Corte los extra son de la OT, no de cada lote.
      destinos_extra: admiteExtras(plantilla) && !pideLoteCorte(plantilla) ? (l.extras || []) : [],
    })),
    lote_corte: loteCorte || null,
    // Corte + achique: {destinos} (ot-achique.js).
    achique: achique || null,
    destinos_extra: destinosExtra || [],
    mapaVersion: _mapaVersion, usuario: usuarioActual(), hoy: hoyLocalISO(),
  });
}

/* Suma la OT y sus movimientos a los datos, avisa a la vista (onListo(ot):
 * Movimientos abre la hoja de la OT nueva para ajustar los pasos) y guarda.
 * Se imprime desde esa hoja, que vuelve a guardar antes. `antes` corre justo
 * antes de sumar la OT (el Corte crea ahí su lote): todo entra en el mismo
 * guardado. */
// Traslado: la bodega destino queda en la lista de destinos externos y con
// el nombre que ya tenia ahi ("granel" -> "Granel").
function _destinoExterno(d, destino){
  if (!d.config) d.config = {};
  return sumarDestinoExterno(d.config, destino);
}

export async function registrarOT(ot, onListo, antes){
  const hoy = hoyLocalISO();
  const usuario = usuarioActual();
  const d = DATOS();
  if (antes) antes(d);
  if (!d.ordenes_trabajo) d.ordenes_trabajo = [];
  if (!d.movimientos) d.movimientos = [];
  if (esSalida(ot.plantilla)) ot.destino = _destinoExterno(d, ot.destino);
  d.ordenes_trabajo.unshift(ot);
  d.movimientos.unshift(...movimientosDeOT(ot, usuario, hoy));
  markDirty();
  // Emitida: el borrador ya no hace falta.
  fijarAlCambiarSesion(null);
  borrarBorrador();
  cerrarOverlay();
  onListo(ot);

  const ok = await guardar(false);
  if (!ok){
    await informar({ titulo: 'La OT no se guardó', texto: 'Todavía no conviene imprimirla. Resolvé el guardado; si la OT aparece en Órdenes de trabajo → Pendientes, su botón 🖨 vuelve a intentar guardar, y si no, emitila de nuevo.' });
  }
}

const NOMBRES_HOJA = { ot: 'Orden de trabajo', planilla: 'Planilla de movimiento de barriles', rotulos: 'Rótulos' };

export function abrirImprimirOT(ot, alTerminar){
  // Solo las hojas que tiene la plantilla: el corte (0867) es una sola hoja.
  const hojas = hojasDePlantilla(ot.plantilla, ot);
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
    Promise.resolve(imprimirOT(ot, op)).then(() => { if (alTerminar) alTerminar(); });
  });
}

/* El numero ya esta en la carpeta de OneDrive? (otra orden hecha en Excel
 * mientras se armaba esta).
 * Contrato: devuelve null si esta libre (se puede seguir); si esta ocupado
 * avisa y devuelve el siguiente numero libre (string) para que quien llama lo
 * ponga en su campo y NO guarde. */
export async function numeroOcupadoEnCarpeta(numero){
  numero = normalizarNumero(numero, 'principal');
  const nombres = await listarSerie('principal');
  const usado = nombres ? numeroUsado(nombres, numero, 'principal') : null;
  if (!usado) return null;
  const libre = siguienteNumero({ nombres, web: numerosWeb(DATOS(), 'principal'),
                                  ultimoVisto: ultimoVisto('principal') }, 'principal');
  await informar({ titulo: 'Ese número ya está en la carpeta', texto: 'El N° ' + numero + ' ya está en la carpeta de OT: «' + usado + '».\nTe propongo el ' + libre + '. Revisalo y volvé a emitir.' });
  return libre;
}

/* Las OT de formato viejo (OT-2026-005) no son de la serie de la carpeta: no
 * se guarda PDF, salen solo en papel como antes. */
export function esNumeroDeCarpeta(numero){
  return numeroDeNombre(String(numero ?? '').trim(), 'principal') != null;
}

/* Impresion solo en papel (sin PDF): pinta y usa la clase de #otMovHoja. */
export function imprimirSoloPapel(pintar){
  pintar();
  // Cada hoja en UNA A4, como con PDF (hoja-pdf.js).
  ajustarHojasA4($('otMovHoja'));
  document.body.classList.add('printing-ot-mov');
  window.print();
  document.body.classList.remove('printing-ot-mov');
  soltarHojasA4($('otMovHoja'));
}

/* Titulo del PDF: nombre de la plantilla + lotes. Con muchos lotes se corta
 * (~80 caracteres, en un espacio) para no pasar el largo de ruta de Windows. */
const TITULO_MAX = 80;
export function tituloOT(ot){
  const p = PLANTILLAS_OT.find(x => x.id === ot.plantilla);
  const lotes = (esSinMovimientos(ot) ? lotesDeMuestras(ot) : (ot.lotes || []).map(l => l.lote)).filter(Boolean).join(' ');
  const t = ((p ? p.nombre : 'OT') + ' ' + lotes).trim();
  if (t.length <= TITULO_MAX) return t;
  const corte = t.lastIndexOf(' ', TITULO_MAX);
  return (corte > 0 ? t.slice(0, corte) : t.slice(0, TITULO_MAX)).trim();
}

/* Misma convención que la hoja genérica: #otMovHoja + clase en el body mientras
 * dura la impresión; el @media print hace el resto. imprimirYGuardar pinta la
 * hoja (antes) y guarda el PDF en la carpeta. */
export async function imprimirOT(ot, opciones){
  const cont = $('otMovHoja');
  if (!cont) return;
  const id = ot.id;
  // Despues de un guardado con 409 los objetos se reemplazan: la OT se busca
  // por id en el DATOS() de ahora.
  const viva = () => (DATOS().ordenes_trabajo || []).find(o => o.id === id) || ot;
  const pintar = () => { cont.innerHTML = hojasOT(viva(), opciones); };
  if (!esNumeroDeCarpeta(ot.ot)) return imprimirSoloPapel(pintar);
  const r = await imprimirYGuardar({
    claseBody: 'printing-ot-mov', contenedor: cont, serie: 'principal',
    numero: ot.ot, titulo: tituloOT(ot), numeroFijo: true, antes: pintar,
    renumerar: async libre => {
      renumerarOT(DATOS(), viva(), libre);
      markDirty();
      return guardar(false);
    },
  });
  // El check de la lista: ¿quedo el PDF en la carpeta?
  if (r && r.ok && r.guardado){
    const o = viva();
    o.pdf = { estado: r.guardado, nombre: r.nombre || '', el: new Date().toLocaleString('es-AR') };
    markDirty();
    await guardar(false);
  }
  return r;
}
