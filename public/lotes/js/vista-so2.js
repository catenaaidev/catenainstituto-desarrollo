/* ===== Lotes CIW — pestana Correcciones SO2 ===== */
'use strict';

import { $, esc, escA, num, DATOS, markDirty, registrarVista } from './nucleo.js';
import { armarCorreccion, aplicarCorreccion, esAnulada } from './so2-bitacora.js';
import { activarGrilla } from './grilla.js';
import { pasaMulti, opcionesValores,
         initFiltrosMulti, limpiarFiltrosMulti } from './tabla.js';
import { fmtFecha } from './fechas.js';

/**
 * Calcula la corrección de SO2.
 * Fórmulas replicadas exactas desde motor_fml.py / Global Constraints.
 * @param {number|null} actual   SO2 libre actual (mg/L)
 * @param {number|null} deseado  SO2 libre deseado (mg/L)
 * @param {number|null} litros   Litros en vasija
 * @param {number|null} ph       pH (para SO2 molecular)
 * @returns {{ diferencia, mbk_a_agregar, ml_exactos, so2_molecular }|null}
 */
function calcCorreccionSO2(actual, deseado, litros, ph){
  if (actual == null || deseado == null || litros == null) return null;
  const diferencia     = deseado - actual;
  const mbk_a_agregar  = ((diferencia * litros * 1.5) / 1000) * 2;
  const ml_exactos     = (diferencia * litros * 1.5) / 55;
  const so2_molecular  = (ph != null) ? (actual / (1 + Math.pow(10, ph - 1.8))) : null;
  return { diferencia, mbk_a_agregar, ml_exactos, so2_molecular };
}

/* Estado local de filtros de la bitacora */
/* Un Set por columna filtrable, creado UNA vez: los widgets del filtro guardan
 * una referencia a este mismo objeto, asi que el estado sobrevive al re-render. */
const filtSo2 = { variedad: new Set() };
let _descSo2 = [], _instSo2 = [];
let _so2FiltBusca = '';

export function renderCorrecciones(){
  const sec = $('tab-so2'); if (!sec) return;

  /* ---- mapa lote -> objeto lote (para litros, variedad) ---- */
  const loteMap = new Map();
  for (const l of (DATOS().lotes || [])){
    loteMap.set(String(l.lote ?? ''), l);
  }

  /* ---- todos los lotes ordenados por número ---- */
  const lotesSorted = [...(DATOS().lotes || [])].sort((a, b) => {
    const na = parseFloat(String(a.lote ?? ''));
    const nb = parseFloat(String(b.lote ?? ''));
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a.lote ?? '').localeCompare(String(b.lote ?? ''), 'es');
  });

  /* ---- fecha de hoy ISO ---- */
  const hoyISO = new Date().toISOString().slice(0, 10);

  /* ---- opciones de lote para el select ---- */
  const loteOpts = lotesSorted.map(l =>
    `<option value="${escA(String(l.lote ?? ''))}">${esc(String(l.lote ?? ''))} — ${esc(l.variedad || '?')}</option>`
  ).join('');

  /* ---- HTML principal ---- */
  sec.innerHTML = `
<div class="card" id="so2CalcCard">
  <h2>Calculadora de corrección SO₂</h2>
  <div class="so2-calc-grid">
    <div>
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:5px">Lote</label>
      <select id="so2SelLote" style="width:100%">
        <option value="">— Elegir lote —</option>
        ${loteOpts}
      </select>
    </div>
    <div>
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:5px">SO₂ libre actual (mg/L)</label>
      <input class="txt" id="so2Actual" type="number" step="0.1" placeholder="ej: 22" style="width:100%">
    </div>
    <div>
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:5px">SO₂ libre deseado (mg/L)</label>
      <input class="txt" id="so2Deseado" type="number" step="0.1" value="35" style="width:100%">
    </div>
    <div>
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:5px">Litros</label>
      <input class="txt" id="so2Litros" type="number" step="1" placeholder="ej: 5000" style="width:100%">
    </div>
    <div>
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:5px">pH (para SO₂ molecular)</label>
      <input class="txt" id="so2Ph" type="number" step="0.01" placeholder="ej: 3.55" style="width:100%">
    </div>
  </div>

  <!-- Resultados -->
  <div class="so2-calc-grid" id="so2ResultGrid" style="margin-bottom:14px">
    <div class="so2-result-box"><div class="so2-val" id="rDiferencia">—</div><div class="so2-lbl">Diferencia (mg/L)</div></div>
    <div class="so2-result-box hi"><div class="so2-val" id="rMbk">—</div><div class="so2-lbl">MBK a agregar (g)</div></div>
    <div class="so2-result-box hi"><div class="so2-val" id="rMl">—</div><div class="so2-lbl">mL de solución SO₂</div></div>
    <div class="so2-result-box"><div class="so2-val" id="rMolecular">—</div><div class="so2-lbl">SO₂ molecular actual (mg/L)</div></div>
  </div>

  <!-- Registro -->
  <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
    <div>
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:5px">N° OT</label>
      <input class="txt" id="so2OT" type="text" placeholder="ej: OT-2026-001" style="min-width:160px">
    </div>
    <div>
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:5px">Fecha corrección</label>
      <input class="txt" id="so2Fecha" type="date" value="${escA(hoyISO)}" style="min-width:140px">
    </div>
    <button class="btn primary" id="btnSo2Registrar">✔ Registrar corrección</button>
  </div>
  <div id="so2Msg" style="margin-top:10px"></div>
</div>

<!-- Bitácora -->
<div class="card">
  <h2>Bitácora de correcciones SO₂</h2>
  <div class="toolbar" id="so2BitacoraToolbar">
    <input class="txt" id="so2BuscaBit" placeholder="🔎 Buscar por lote u OT…" style="min-width:180px" value="${escA(_so2FiltBusca)}">
    <div class="mfilt-bar" id="so2FltBar"></div>
    <button class="btn" id="btnSo2LimpiarFlt">🧹 Limpiar filtros</button>
    <span class="tag" id="so2BitCount"></span>
    <div class="spacer"></div>
    <button class="btn" id="btnSo2Imprimir">🖨️ Imprimir</button>
  </div>
  <div class="scroll tall">
    <table id="so2Bitacora">
      <thead><tr>
        <th data-k="lote">Lote</th><th data-k="variedad">Variedad</th><th data-k="fecha">Fecha</th>
        <th data-k="so2_actual" class="num">SO₂ actual</th><th data-k="so2_deseado" class="num">SO₂ deseado</th>
        <th data-k="diferencia" class="num">Diferencia</th><th data-k="mbk" class="num">MBK (g)</th>
        <th data-k="ml" class="num">mL sol.</th><th data-k="ot_n">N° OT</th>
      </tr></thead>
      <tbody id="so2BitacoraBody"></tbody>
    </table>
  </div>
</div>`;

  /* ---- renderizar bitácora ---- */
  _renderBitacoraSO2(loteMap);

  /* ---- autocompletar al cambiar lote ---- */
  $('so2SelLote').addEventListener('change', () => {
    const loteStr = $('so2SelLote').value;
    if (!loteStr) return;
    const loteObj = loteMap.get(loteStr);
    if (loteObj){
      $('so2Litros').value = loteObj.litros_actuales != null ? loteObj.litros_actuales : '';
    }
    /* último so2_libre y pH del lote */
    const analisisLote = (DATOS().analisis || [])
      .filter(a => String(a.lote ?? '') === loteStr && a.fecha_analisis)
      .sort((a, b) => (b.fecha_analisis || '') > (a.fecha_analisis || '') ? 1 : -1);

    let so2Val = null, phVal = null;
    for (const a of analisisLote){
      if (so2Val == null && a.so2_libre != null && a.so2_libre !== -999) so2Val = a.so2_libre;
      if (phVal  == null && a.ph        != null && a.ph        !== -999) phVal  = a.ph;
      if (so2Val != null && phVal != null) break;
    }
    $('so2Actual').value = so2Val != null ? so2Val : '';
    $('so2Ph').value     = phVal  != null ? phVal  : '';
    _actualizarResultados();
  });

  /* ---- cálculo en vivo ---- */
  ['so2Actual', 'so2Deseado', 'so2Litros', 'so2Ph'].forEach(id => {
    $(id).addEventListener('input', _actualizarResultados);
  });

  /* ---- registrar corrección ---- */
  $('btnSo2Registrar').addEventListener('click', _registrarCorreccionSO2);

  /* ---- filtros bitácora ---- */
  $('so2BuscaBit').addEventListener('input', () => {
    _so2FiltBusca = $('so2BuscaBit').value.trim();
    _so2RepintarBitacora();
  });
  /* --- filtros multi (re-montados en cada render porque sec.innerHTML se recreo) --- */
  if (_descSo2.length === 0){
    initFiltrosSo2();
  } else {
    const bar = $('so2FltBar');
    if (bar){
      bar.innerHTML = '';
      _instSo2.forEach(f => { bar.appendChild(f.el); f.rebuild(); });
    }
  }
  $('btnSo2LimpiarFlt').addEventListener('click', () => {
    _so2FiltBusca = '';
    limpiarFiltrosMulti(_descSo2, 'so2BuscaBit', _instSo2, _so2RepintarBitacora);
  });

  /* ---- imprimir ---- */
  $('btnSo2Imprimir').addEventListener('click', () => {
    document.body.classList.add('printing-so2');
    window.print();
    document.body.classList.remove('printing-so2');
  });
}

/** Actualiza los cuadros de resultado en vivo */
function _actualizarResultados(){
  const actual  = num($('so2Actual')  ? $('so2Actual').value  : '');
  const deseado = num($('so2Deseado') ? $('so2Deseado').value : '');
  const litros  = num($('so2Litros')  ? $('so2Litros').value  : '');
  const ph      = num($('so2Ph')      ? $('so2Ph').value      : '');

  const r = calcCorreccionSO2(actual, deseado, litros, ph);

  const fmt = (v, dec) => (v != null && isFinite(v)) ? v.toFixed(dec) : '—';

  if ($('rDiferencia')) $('rDiferencia').textContent = r ? fmt(r.diferencia, 1)    : '—';
  if ($('rMbk'))        $('rMbk').textContent        = r ? fmt(r.mbk_a_agregar, 2) : '—';
  if ($('rMl'))         $('rMl').textContent         = r ? fmt(r.ml_exactos, 1)    : '—';
  if ($('rMolecular'))  $('rMolecular').textContent  = (r && r.so2_molecular != null) ? fmt(r.so2_molecular, 3) : '—';
}

/** Registra la corrección en DATOS.analisis */
function _registrarCorreccionSO2(){
  const msgEl = $('so2Msg'); if (!msgEl) return;

  const loteStr = $('so2SelLote') ? $('so2SelLote').value : '';
  if (!loteStr){
    msgEl.innerHTML = '<div class="msg err">Seleccioná un lote primero.</div>';
    return;
  }
  const actual  = num($('so2Actual').value);
  const deseado = num($('so2Deseado').value);
  const litros  = num($('so2Litros').value);
  const ph      = num($('so2Ph').value);
  const ot_n    = ($('so2OT').value || '').trim();
  const fecha   = ($('so2Fecha').value || '').trim();

  if (actual == null || deseado == null || litros == null){
    msgEl.innerHTML = '<div class="msg err">Completá SO₂ actual, deseado y litros para registrar.</div>';
    return;
  }
  if (!fecha){
    msgEl.innerHTML = '<div class="msg err">Ingresá una fecha.</div>';
    return;
  }

  const r = calcCorreccionSO2(actual, deseado, litros, ph);
  if (!r){
    msgEl.innerHTML = '<div class="msg err">No se pudo calcular la corrección.</div>';
    return;
  }

  const correccion = armarCorreccion({
    so2Actual: actual, so2Deseado: deseado,
    mbk: r.mbk_a_agregar, ml: r.ml_exactos,
    ot: ot_n, fecha: fecha,
  });

  /* Si ese lote ya tiene ese dia una correccion de OTRA OT, aplicarCorreccion
   * no la pisa: crea una entrada aparte (ver _pisable en so2-bitacora.js). Se
   * pregunta antes porque lo mas probable es un error en el N de OT o en la
   * fecha, y despues de registrar ya no se ve que habia otra. */
  const otNueva = String(ot_n || '').trim();
  const otraOt = (DATOS().analisis || []).find(a =>
    String(a.lote ?? '') === loteStr && (a.fecha_analisis || '') === fecha &&
    a.correccion && typeof a.correccion === 'object' && !esAnulada(a.correccion) &&
    String(a.correccion.ot_n ?? '').trim() !== '' && String(a.correccion.ot_n).trim() !== otNueva);
  if (otraOt && !confirm('El lote ' + loteStr + ' ya tiene una corrección el ' + fmtFecha(fecha) +
      ' con la OT ' + String(otraOt.correccion.ot_n).trim() + '.\n\n' +
      'Aceptar = registrar esta también (quedan las dos en la bitácora; no se pisa la anterior).\n' +
      'Cancelar = no registrar nada y revisar la OT o la fecha.')) return;

  const { que, convive } = aplicarCorreccion(DATOS().analisis, loteStr, fecha, correccion);

  msgEl.innerHTML = (que === 'actualizado')
    ? `<div class="msg ok">✓ Corrección actualizada en el análisis del ${esc(fmtFecha(fecha))} (lote ${esc(loteStr)}). <b>Acordate de Guardar.</b></div>`
    : `<div class="msg ok">✓ Nueva entrada de corrección creada para lote ${esc(loteStr)}, fecha ${esc(fmtFecha(fecha))}${
        convive != null ? ` (la que ya había ese día${convive ? ' con la OT ' + esc(convive) : ''} queda también)` : ''}. <b>Acordate de Guardar.</b></div>`;

  markDirty();

  /* re-renderizar bitácora con datos actualizados */
  const loteMap = new Map();
  for (const l of (DATOS().lotes || [])) loteMap.set(String(l.lote ?? ''), l);
  _renderBitacoraSO2(loteMap);
}

/* Reconstruye el loteMap y repinta SOLO la bitacora. El loteMap no se captura
 * una vez y se reusa: si cambian los lotes, un mapa viejo resolveria variedades
 * equivocadas. Repintar solo la bitacora (y no toda la pestana) evita
 * reconstruir la calculadora de SO2 y perder lo que el usuario tenga tipeado. */
function _so2RepintarBitacora(){
  const loteMap = new Map();
  for (const l of (DATOS().lotes || [])) loteMap.set(String(l.lote ?? ''), l);
  _renderBitacoraSO2(loteMap);
}

function initFiltrosSo2(){
  /* Las filas de la bitacora son registros de analisis, no lotes: la variedad
   * hay que resolverla por lote. Por eso opciones/match son propios y no los
   * genericos sobre un campo directo de la fila. */
  const loteMapDe = () => {
    const m = new Map();
    for (const l of (DATOS().lotes || [])) m.set(String(l.lote ?? ''), l);
    return m;
  };
  const variedadDe = (m) => (a) => {
    const l = m.get(String(a.lote ?? ''));
    return l ? (l.variedad || '') : '';
  };
  _descSo2 = [{
    label: 'Variedad',
    set: filtSo2.variedad,
    opciones: () => {
      const m = loteMapDe();
      return opcionesValores(_so2FilasConCorreccion(), variedadDe(m));
    },
    match: (fila, set) => {
      const m = loteMapDe();
      return set.has(variedadDe(m)(fila));
    },
  }];
  _instSo2 = initFiltrosMulti('so2FltBar', _descSo2, _so2RepintarBitacora);
}

/* Filas de la bitacora: registros de analisis que tienen una correccion real.
 * Extraido para que las opciones del filtro se calculen sobre el MISMO conjunto
 * que despues se filtra (si salieran de todos los analisis, el panel ofreceria
 * variedades que no tienen ninguna correccion cargada). */
function _so2FilasConCorreccion(){
  return (DATOS().analisis || []).filter(a => {
    const c = a.correccion;
    if (!c) return false;
    return (c.ot_n && String(c.ot_n).trim() !== '') ||
           (c.mbk_a_agregar != null && c.mbk_a_agregar !== '');
  });
}

/** Renderiza la tabla bitácora de correcciones SO2 */
function _renderBitacoraSO2(loteMap){
  const tbody = $('so2BitacoraBody');
  const countEl = $('so2BitCount');
  if (!tbody) return;

  /* recolectar filas con correccion */
  let rows = _so2FilasConCorreccion();

  /* filtros */
  rows = rows.filter(a => pasaMulti(a, _descSo2));
  if (_so2FiltBusca){
    const q = _so2FiltBusca.toLowerCase();
    rows = rows.filter(a => {
      const loteStr = String(a.lote ?? '').toLowerCase();
      const otStr   = String(a.correccion?.ot_n ?? '').toLowerCase();
      return loteStr.includes(q) || otStr.includes(q);
    });
  }

  /* ordenar por fecha descendente */
  rows = [...rows].sort((a, b) => {
    const fa = a.correccion?.fecha || a.fecha_analisis || '';
    const fb = b.correccion?.fecha || b.fecha_analisis || '';
    return fb > fa ? 1 : fb < fa ? -1 : 0;
  });

  const fmt2 = v => (v != null && isFinite(v)) ? Number(v).toFixed(2) : '—';
  const fmt1 = v => (v != null && isFinite(v)) ? Number(v).toFixed(1) : '—';

  let tb = '';
  for (const a of rows){
    const c       = a.correccion;
    const loteStr = String(a.lote ?? '');
    const lObj    = loteMap.get(loteStr);
    const variedad= lObj ? (lObj.variedad || '') : '';
    const fecha   = c.fecha || a.fecha_analisis || '';
    /* Las anuladas NO se ocultan: quedan tachadas y con quien las anulo. Ese es
     * el punto de anular en vez de borrar — si alguien audita la bitacora, ve
     * que hubo un error y que se corrigio, en vez de encontrarse un hueco. */
    const anulada = esAnulada(c);
    const sello = anulada
      ? ` <span class="so2-anulada-sello" title="Esta corrección se canceló: no cuenta para la orden">ANULADA${
          c.anulada.por ? ' por ' + esc(c.anulada.por) : ''}${
          c.anulada.fecha ? ' el ' + esc(fmtFecha(c.anulada.fecha)) : ''}</span>`
      : '';
    tb += `<tr${anulada ? ' class="so2-anulada"' : ''}>
      <td>${esc(loteStr)}</td>
      <td>${esc(variedad)}</td>
      <td>${esc(fmtFecha(fecha))}</td>
      <td class="num">${fmt1(c.so2_libre_actual)}</td>
      <td class="num">${fmt1(c.so2_deseado)}</td>
      <td class="num">${fmt1(c.diferencia)}</td>
      <td class="num">${fmt2(c.mbk_a_agregar)}</td>
      <td class="num">${fmt1(c.ml_exactos)}</td>
      <td>${esc(c.ot_n || '—')}${sello}</td>
    </tr>`;
  }

  tbody.innerHTML = tb || '<tr><td colspan="9" style="color:var(--muted)">Sin correcciones registradas aún.</td></tr>';
  if (countEl) countEl.textContent = rows.length + ' corrección' + (rows.length !== 1 ? 'es' : '');

  /* Grilla tipo planilla, solo copiar: la bitacora es un historial, no se
   * edita en bloque (cada fila se registra desde la calculadora de arriba). */
  activarGrilla($('so2Bitacora'));
}

registrarVista('so2', () => renderCorrecciones());
