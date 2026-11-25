/* ===== Lotes CIW — panel "Correcciones de esta OT" (al lado de la hoja) =====
 *
 * Una tarjeta por lote a corregir (ot-correcciones.js) con dos renglones:
 *   - Vasija: tanque + cm de merma -> litros (misma cuenta que Confirmar OT);
 *     los litros se pueden escribir a mano y quedan hasta tocar tanque o cm;
 *   - SO2: trae el ultimo SO2 libre, calcula MBK y mL
 *     con la misma formula que la calculadora y lo registra en la bitacora;
 *   - TH2: cantidad + unidad, va a Otros agregados.
 * Todo con el N° de la OT. Registrar otra vez la misma OT el mismo dia
 * reemplaza (regla de so2-bitacora.js y agregados.js). Anular se hace en la
 * pestaña Correcciones.
 *
 * Registrar no repinta el panel entero: solo la lista "registradas" de ese
 * lote, para no perder lo tipeado en las otras tarjetas.
 *
 * Una OT ejecutada ya no se corrige desde la hoja: el panel queda solo con lo
 * registrado con ella, y sin nada registrado no aparece (panelDeOT). */
'use strict';

import { $, esc, escA, num, DATOS, markDirty, usuarioActual } from './nucleo.js';
import { aplicarCorreccion } from './so2-bitacora.js';
import { UNIDADES, cantidadTexto } from './agregados.js';
import { calcCorreccionSO2, ultimoSo2Ph } from './so2-calculo.js';
import { panelDeOT, registradasDeOT, registrarTH2, litrosDeTanque, tanquePropuesto,
         correccionDeOT } from './ot-correcciones.js';
import { PADRON_INICIAL } from './vasijas-padron.js';
import { fmtFecha, hoyLocalISO } from './fechas.js';

// Hasta que se cargue el padron en Configuracion, el inicial (78 vasijas).
const _padron = () => (DATOS().vasijas && DATOS().vasijas.length) ? DATOS().vasijas : PADRON_INICIAL;

const DESEADO = 35;   // el mismo valor por defecto que la calculadora
const _n1 = v => (v == null || !Number.isFinite(v)) ? '—' : v.toLocaleString('es-AR', { maximumFractionDigits: 1 });

/** ¿Esta OT lleva panel? (tiene tabla Correccion/Agregado en la hoja) */
export function hayCorrecciones(ot){ return !!panelDeOT(ot, DATOS().analisis); }

/** Pinta el panel de `ot` en `cont`. `otViva(id)` devuelve la OT del DATOS()
 *  de ahora (despues de un 409 los objetos se reemplazan). */
export function renderCorreccionesOT(cont, ot, otViva){
  if (!cont || !ot) return;
  const panel = panelDeOT(ot, DATOS().analisis);
  if (!panel){ cont.innerHTML = ''; return; }
  if (panel.consulta) return _pintarConsulta(cont, ot, panel.lotes);
  const lotes = panel.lotes;
  const loteMap = new Map((DATOS().lotes || []).map(l => [String(l.lote ?? ''), l]));
  const tarjetas = lotes.map(l => {
    const lo = loteMap.get(l.lote);
    const { so2 } = ultimoSo2Ph(DATOS().analisis, l.lote);
    const litros = (l.extra || l.con_extras) && l.litros_previstos != null ? l.litros_previstos : (lo && lo.litros_actuales != null ? lo.litros_actuales : (l.litros_previstos ?? ''));
    // Barricas/T50 extra: sin tanque (no se mide por cm), solo los litros.
    const tanque = l.barricas ? '' : tanquePropuesto(_padron(), lo, ot, l.vasija);
    const uni = UNIDADES.map(u => `<option${u === 'g' ? ' selected' : ''}>${esc(u)}</option>`).join('');
    return `<section class="otx-lote" data-lote="${escA(l.lote)}">
  <div class="otx-tit"><b>${esc(l.lote)}</b> ${esc(l.id_texto || '')}${l.vasija ? ' · ' + esc(l.vasija) : ''}</div>
  <div class="otx-fila">
    <span class="otx-prod">Vasija</span>
    <label${l.barricas ? ' style="display:none"' : ''}>Tanque<input class="txt" data-k="tanque" placeholder="ej: 201" value="${escA(tanque)}"></label>
    <label${l.barricas ? ' style="display:none"' : ''}>Merma (cm)<input class="txt" data-k="cm" inputmode="decimal"></label>
    <label>Litros<input class="txt" data-k="litros" inputmode="decimal" value="${escA(litros)}" title="Se calcula con tanque y cm; se puede escribir a mano"></label>
    <div class="otx-res" data-calc></div>
  </div>
  <div class="otx-fila otx-so2">
    <span class="otx-prod">SO₂</span>
    <label>Actual<input class="txt" data-k="actual" inputmode="decimal" value="${escA(so2 ?? '')}"></label>
    <label>Deseado<input class="txt" data-k="deseado" inputmode="decimal" value="${DESEADO}"></label>
    <button class="btn primary" data-reg="so2" title="Registrar en el Registro de corrección de SO₂ con la OT ${escA(ot.ot)}">✔ Registrar</button>
    <div class="otx-res" data-res></div>
  </div>
  <div class="otx-fila">
    <span class="otx-prod">TH2</span>
    <label>Cantidad<input class="txt" data-k="cantidad" inputmode="decimal"></label>
    <label>Unidad<select data-k="unidad">${uni}</select></label>
    <button class="btn primary" data-reg="th2" title="Registrar en Otros agregados con la OT ${escA(ot.ot)}">✔ Registrar</button>
  </div>
  <div class="otx-msg" data-msg></div>
  <ul class="otx-hechas" data-hechas></ul>
</section>`;
  }).join('');

  cont.innerHTML = `<div class="otx">
  <div class="otx-cab">
    <div><b>Correcciones de esta OT</b><div class="otx-nota">Se registran en Correcciones con la OT ${esc(ot.ot)}.</div></div>
    <label>Fecha<input class="txt" type="date" id="otxFecha" value="${escA(hoyLocalISO())}"></label>
  </div>
  ${tarjetas}
</div>`;

  cont.querySelectorAll('.otx-lote').forEach(sec => { _pintarTanque(sec); _pintarResultado(sec); _pintarHechas(sec, ot.ot); });
  cont.addEventListener('input', e => {
    const sec = e.target.closest('.otx-lote');
    if (!sec) return;
    // Tanque o cm recalculan los litros; escribir los litros a mano no se pisa.
    const k = e.target.dataset.k;
    if (k === 'tanque' || k === 'cm') _pintarTanque(sec, true);
    _pintarResultado(sec);
  });
  cont.addEventListener('click', e => {
    const b = e.target.closest('[data-reg]');
    if (!b) return;
    const sec = b.closest('.otx-lote');
    const o = otViva(ot.id);
    if (!o || !sec) return;
    if (b.dataset.reg === 'so2') _registrarSO2(sec, o);
    else _registrarTH2(sec, o);
  });
}

/* OT ejecutada: solo lo registrado con ella, sin campos ni Registrar. */
function _pintarConsulta(cont, ot, lotes){
  cont.innerHTML = `<div class="otx">
  <div class="otx-cab">
    <div><b>Correcciones registradas con esta OT</b><div class="otx-nota">OT ${esc(ot.ot)} ejecutada: solo lectura. Para anular, la pestaña Correcciones.</div></div>
  </div>
  ${lotes.map(l => `<section class="otx-lote" data-lote="${escA(l.lote)}">
  <div class="otx-tit"><b>${esc(l.lote)}</b> ${esc(l.id_texto || '')}</div>
  <ul class="otx-hechas" data-hechas></ul>
</section>`).join('')}
</div>`;
  cont.querySelectorAll('.otx-lote').forEach(sec => _pintarHechas(sec, ot.ot));
}

const _val = (sec, k) => sec.querySelector(`[data-k="${k}"]`).value;
const _msg = (sec, html) => { sec.querySelector('[data-msg]').innerHTML = html; };

function _calculo(sec){
  return calcCorreccionSO2(num(_val(sec, 'actual')), num(_val(sec, 'deseado')), num(_val(sec, 'litros')), null);
}

/* El texto al lado de la vasija y, si `poner`, los litros calculados. */
function _pintarTanque(sec, poner){
  const r = litrosDeTanque(_padron(), _val(sec, 'tanque'), _val(sec, 'cm'));
  if (poner && r.litros != null) sec.querySelector('[data-k="litros"]').value = r.litros;
  const el = sec.querySelector('[data-calc]');
  el.textContent = r.texto;
  el.className = 'otx-res' + (r.litros != null ? ' on' : '');
}

function _pintarResultado(sec){
  const r = _calculo(sec);
  const el = sec.querySelector('[data-res]');
  if (!r){ el.textContent = 'Completá actual, deseado y los litros de la vasija.'; el.className = 'otx-res'; return; }
  if (r.diferencia <= 0){ el.textContent = 'El SO₂ actual ya llega al deseado.'; el.className = 'otx-res'; return; }
  el.className = 'otx-res on';
  el.innerHTML = `<b>${_n1(r.mbk_a_agregar)} g</b> MBK · <b>${_n1(r.ml_exactos)} mL</b> solución SO₂`;
}

function _pintarHechas(sec, otN){
  const { so2, th2 } = registradasDeOT(DATOS().analisis, otN, sec.dataset.lote);
  const li = [
    ...so2.map(x => `<li>✓ SO₂ ${esc(fmtFecha(x.fecha))}: ${esc(_n1(x.correccion.mbk_a_agregar))} g MBK · ` +
      `${esc(_n1(x.correccion.ml_exactos))} mL <span>(${esc(_n1(x.correccion.so2_libre_actual))} → ${esc(_n1(x.correccion.so2_deseado))}` +
      `${_dondeTxt(x.correccion)})</span></li>`),
    ...th2.map(x => `<li>✓ TH2 ${esc(fmtFecha(x.fecha))}: ${esc(cantidadTexto(x.ag))}` +
      (x.ag.registrado_por ? ` <span>(${esc(x.ag.registrado_por)})</span>` : '') + '</li>'),
  ];
  sec.querySelector('[data-hechas]').innerHTML = li.join('') || '<li class="otx-nada">Nada registrado todavía.</li>';
}

/* ", T 201 · 12 cm · 7.320 L" con lo que se haya guardado. */
function _dondeTxt(c){
  const p = [];
  if (c.vasija) p.push('T ' + c.vasija);
  if (c.cm_merma != null) p.push(_n1(c.cm_merma) + ' cm');
  if (c.litros != null) p.push(_n1(c.litros) + ' L');
  return p.length ? ' · ' + esc(p.join(' · ')) : '';
}

function _fecha(sec){
  const f = ($('otxFecha') ? $('otxFecha').value : '').trim();
  if (!f) _msg(sec, '<div class="msg err">Elegí la fecha de la corrección.</div>');
  return f;
}

function _registrarSO2(sec, ot){
  const fecha = _fecha(sec); if (!fecha) return;
  const actual = num(_val(sec, 'actual')), deseado = num(_val(sec, 'deseado')), litros = num(_val(sec, 'litros'));
  const r = _calculo(sec);
  if (!r) return _msg(sec, '<div class="msg err">Completá SO₂ actual, deseado y los litros de la vasija.</div>');
  if (r.diferencia <= 0) return _msg(sec, '<div class="msg err">El SO₂ actual ya llega al deseado: no hay nada que agregar.</div>');
  if (!DATOS().analisis) DATOS().analisis = [];
  const correccion = correccionDeOT({ so2Actual: actual, so2Deseado: deseado,
    mbk: r.mbk_a_agregar, ml: r.ml_exactos, ot: ot.ot, fecha,
    litros, vasija: _val(sec, 'tanque'), cm: _val(sec, 'cm'), padron: _padron() });
  const { que, convive } = aplicarCorreccion(DATOS().analisis, sec.dataset.lote, fecha, correccion);
  markDirty();
  _msg(sec, `<div class="msg ok">✓ SO₂ ${que === 'actualizado' ? 'actualizado' : 'registrado'} en la Bitácora` +
    (convive != null ? ` (ese día ya había otra corrección${convive ? ' con la OT ' + esc(convive) : ''}: quedan las dos)` : '') +
    '. Se guarda solo en unos segundos.</div>');
  _pintarHechas(sec, ot.ot);
}

function _registrarTH2(sec, ot){
  const fecha = _fecha(sec); if (!fecha) return;
  if (!DATOS().analisis) DATOS().analisis = [];
  const snap = registrarTH2(DATOS().analisis, { lote: sec.dataset.lote, fecha,
    cantidad: _val(sec, 'cantidad'), unidad: _val(sec, 'unidad'), ot: ot.ot,
    quien: usuarioActual() || 'desconocido', cuando: new Date().toISOString() });
  if (!snap) return _msg(sec, '<div class="msg err">Poné la cantidad de TH2.</div>');
  markDirty();
  _msg(sec, '<div class="msg ok">✓ TH2 registrado en Otros agregados. Se guarda solo en unos segundos.</div>');
  sec.querySelector('[data-k="cantidad"]').value = '';
  _pintarHechas(sec, ot.ot);
}
