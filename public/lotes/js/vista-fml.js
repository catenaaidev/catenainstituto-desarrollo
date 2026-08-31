/* ===== Lotes CIW — pestana Seguimiento FML ===== */
'use strict';

import { $, esc, escA, DATOS, markDirty, usuarioActual, registrarVista,
         dashData, dashLoading, cargarDashboard } from './nucleo.js';
import { activarGrilla } from './grilla.js';
import { pasaMulti, opcionesValores, matchValor,
         initFiltrosMulti, limpiarFiltrosMulti } from './tabla.js';

/* --- filtros de la pestaña FML --- */
/* Un Set por columna filtrable, creados UNA vez: los widgets guardan estas
 * mismas referencias, asi que el estado sobrevive a los re-render. */
const filtFml = { variedad: new Set(), proyecto: new Set() };
let _descFml = [], _instFml = [];
let _fmlFiltMostrar   = 'activos'; // 'activos' | 'todos' | 'no_finalizada' | 'vencidos' | 'sin_inocular'
let _fmlFiltBusca     = '';

const INOCULADO_OPTS = ['', 'si', 'no', 'desconocido'];

/** Devuelve la entrada de estado_lote para ese lote, creandola si es la
 *  primera vez que se toca (misma semantica que ya tenian los listeners
 *  manuales). Compartida con el adaptador de la grilla para no duplicar la
 *  logica de creacion perezosa en dos lugares. */
function _tocarEstado(loteStr){
  if (!DATOS().estado_lote[loteStr]) DATOS().estado_lote[loteStr] = {};
  return DATOS().estado_lote[loteStr];
}

/** Helpers para colorear las celdas de estado FA / FML */
function _estClass(estado){
  if (estado === 'finalizada')    return 'est-finalizada';
  if (estado === 'no_finalizada') return 'est-no_finalizada';
  if (estado === 'excluida')      return 'est-excluida';
  return '';
}

/** Calcula el texto de "próximo análisis" a partir de frecuencia_max y dias_desde_analisis */
function _proximoText(loteRow){
  if (!loteRow.ultima_fecha) return '—';
  const dias = loteRow.dias_desde_analisis ?? null;
  const freq = loteRow.frecuencia_max ?? null;
  if (dias === null || freq === null) return '—';
  const resta = freq - dias;
  if (resta <= 0){
    return `vencido hace ${Math.abs(resta)} d`;
  }
  return `en ${resta} d`;
}
function _proximoClass(loteRow){
  if (!loteRow.ultima_fecha) return '';
  const dias = loteRow.dias_desde_analisis ?? null;
  const freq = loteRow.frecuencia_max ?? null;
  if (dias === null || freq === null) return '';
  return (freq - dias) <= 0 ? 'prox-venc' : 'prox-ok';
}

function initFiltrosFml(){
  /* Mapa lote -> objeto de DATOS().lotes, reconstruido en cada uso: capturarlo
   * una vez daria proyectos obsoletos si se editan los lotes. */
  const infoMapDe = () => {
    const m = new Map();
    for (const l of (DATOS().lotes || [])) m.set(String(l.lote ?? ''), l);
    return m;
  };
  /* Las filas salen de dashData(), que puede no estar cargado todavia cuando
   * se arman las opciones; DATOS().lotes si esta siempre. */
  const proyectoDe = (m) => (fila) => {
    const info = m.get(String(fila.lote ?? ''));
    return info ? (info.proyecto || '').trim() : '';
  };

  _descFml = [
    {
      /* variedad viene directa en la fila del dashboard: descriptor generico */
      label: 'Variedad',
      set: filtFml.variedad,
      opciones: () => opcionesValores((dashData() && dashData().lotes) || [], l => l.variedad),
      match: matchValor(l => l.variedad),
    },
    {
      /* proyecto NO viene en la fila del dashboard: hay que resolverlo por lote */
      label: 'Proyecto',
      set: filtFml.proyecto,
      opciones: () => opcionesValores((dashData() && dashData().lotes) || [], proyectoDe(infoMapDe())),
      match: (fila, set) => set.has(proyectoDe(infoMapDe())(fila)),
    },
  ];
  _instFml = initFiltrosMulti('fltFmlBar', _descFml, renderSeguimiento);
}

export function renderSeguimiento(){
  const sec = $('tab-fml'); if (!sec) return;

  /* --- si aún no hay datos del dashboard, mostrar placeholder y disparar carga --- */
  if (!dashData()){
    sec.innerHTML = '<div class="msg info" style="margin-top:10px">Cargando datos del motor FML…</div>';
    if (!dashLoading()) cargarDashboard();
    return;
  }

  /* --- lotes activos (del dashboard, que ya son solo los activos) --- */
  const allLotes = dashData().lotes || [];

  /* --- filtrar --- */
  let rows = allLotes;

  if (_fmlFiltBusca){
    const q = _fmlFiltBusca.toLowerCase();
    rows = rows.filter(l => String(l.lote ?? '').toLowerCase().includes(q));
  }
  rows = rows.filter(l => pasaMulti(l, _descFml));

  /* Ocultar excluidos y confirmados-finalizados en TODOS los modos salvo 'todos'
   * explicito. Antes, ninguno de los cuatro valores de _fmlFiltMostrar los sacaba:
   * un lote excluido o ya finalizado a mano seguia apareciendo aunque se filtrara
   * por "FML no terminada", por ejemplo. Ahora esa exclusion es la base, y 'todos'
   * es la unica forma explicita de traerlos de vuelta. */
  if (_fmlFiltMostrar !== 'todos'){
    rows = rows.filter(l => {
      if (l.fml_estado === 'excluida') return false;
      const est = DATOS().estado_lote[String(l.lote ?? '')];
      return !(est && est.fml_finalizada_confirmada);
    });
  }
  if (_fmlFiltMostrar === 'no_finalizada')
    rows = rows.filter(l => l.fml_estado === 'no_finalizada');
  else if (_fmlFiltMostrar === 'vencidos')
    rows = rows.filter(l => l.vencido);
  else if (_fmlFiltMostrar === 'sin_inocular')
    rows = rows.filter(l => l.inoculado !== 'si');

  /* --- HTML: barra de controles --- */
  const html = `
<div class="toolbar" id="fmlToolbar">
  <input class="txt" id="buscaFml" placeholder="🔎 Buscar por lote…" style="min-width:160px" value="${escA(_fmlFiltBusca)}">
  <div class="mfilt-bar" id="fltFmlBar"></div>
  <select id="fltFmlMostrar">
    <option value="activos"${_fmlFiltMostrar==='activos'?' selected':''}>Activos</option>
    <option value="todos"${_fmlFiltMostrar==='todos'?' selected':''}>Todos (incluye excluidos y finalizados)</option>
    <option value="no_finalizada"${_fmlFiltMostrar==='no_finalizada'?' selected':''}>FML no terminada</option>
    <option value="vencidos"${_fmlFiltMostrar==='vencidos'?' selected':''}>Vencidos</option>
    <option value="sin_inocular"${_fmlFiltMostrar==='sin_inocular'?' selected':''}>Sin inocular</option>
  </select>
  <button class="btn" id="btnLimpiarFltFml">🧹 Limpiar filtros</button>
  <span class="tag" id="fmlCount"></span>
</div>
<div class="legend-inline">
  <span class="sw crit"></span> Con alarmas
  &nbsp;·&nbsp;
  <span class="sw venc"></span> Frecuencia vencida
  &nbsp;·&nbsp;
  <span style="display:inline-block;width:13px;height:13px;border-radius:3px;background:#e4efe2;border:1px solid #cbe1c7;vertical-align:-2px;margin-right:2px"></span> Finalizada
  &nbsp;·&nbsp;
  <span style="display:inline-block;width:13px;height:13px;border-radius:3px;background:#f6ecd6;border:1px solid #eaddb8;vertical-align:-2px;margin-right:2px"></span> No finalizada
  &nbsp;·&nbsp;
  <span style="display:inline-block;width:13px;height:13px;border-radius:3px;background:#f1efe9;border:1px solid #e7e3da;vertical-align:-2px;margin-right:2px"></span> Excluida
</div>
<div class="scroll tall">
<table id="tFml">
<thead><tr>
  <th data-k="lote">Lote</th>
  <th data-k="variedad">Variedad</th>
  <th data-k="fa_estado">FA</th>
  <th data-k="fml_estado">FML</th>
  <th data-k="inoculado">Inoculado</th>
  <th data-k="ultima_fecha">Último análisis</th>
  <th data-k="dias_desde_analisis" class="num">Días</th>
  <th data-k="proximo">Próximo</th>
  <th data-k="so2_ok">SO2 OK</th>
  <th data-k="ph_ok">pH OK</th>
  <th data-k="comentario" style="min-width:180px">Comentario</th>
  <th></th>
</tr></thead>
<tbody id="tFmlBody"></tbody>
</table>
</div>`;

  sec.innerHTML = html;

  /* --- filtros multi (re-montados en cada render porque sec.innerHTML se recreo) --- */
  if (_descFml.length === 0){
    initFiltrosFml();
  } else {
    const bar = $('fltFmlBar');
    if (bar){
      bar.innerHTML = '';
      _instFml.forEach(f => { bar.appendChild(f.el); f.rebuild(); });
    }
  }

  /* --- filas --- */
  let tb = '';
  let ri = -1;
  for (const lote of rows){
    ri++;
    const loteStr = String(lote.lote ?? '');
    const est = DATOS().estado_lote[loteStr] || {};
    const inoculadoVal = est.inoculado || '';
    const comentarioVal = est.comentario || '';
    const fmlConfirmada = !!est.fml_finalizada_confirmada;
    // Un lote excluido no lleva boton de accion: la exclusion se decide en
    // Lotes/Configuracion (hace_fml, fml_excluida), no aca. Mostrarle un boton
    // de "Finalizar FML" seria ofrecer una decision que no le corresponde a
    // esta pestana.
    const btnFmlHtml = lote.fml_estado === 'excluida'
      ? ''
      : `<button class="btn" data-fml-toggle="${escA(loteStr)}">${fmlConfirmada ? '✓ Finalizada — revertir' : 'Finalizar FML'}</button>`;

    /* row class: si tiene alarmas -> crit, si vencido -> venc */
    const alarmas = lote.alarmas || [];
    const rowCls = alarmas.length > 0 ? 'crit' : (lote.vencido ? 'venc' : '');

    const faClass  = _estClass(lote.fa_estado);
    const fmlClass = _estClass(lote.fml_estado);

    const proxText  = _proximoText(lote);
    const proxClass = _proximoClass(lote);

    const so2Txt = lote.so2_ok === true ? '✓' : (lote.so2_ok === false ? '✗' : '—');
    const phTxt  = lote.ph_ok  === true ? '✓' : (lote.ph_ok  === false ? '✗' : '—');
    const so2Cl  = lote.so2_ok === true ? 'style="color:var(--ok)"' : (lote.so2_ok === false ? 'style="color:var(--nook)"' : '');
    const phCl   = lote.ph_ok  === true ? 'style="color:var(--ok)"' : (lote.ph_ok  === false ? 'style="color:var(--nook)"' : '');

    const inoOpts = INOCULADO_OPTS.map(v =>
      `<option value="${escA(v)}"${v===inoculadoVal?' selected':''}>${esc(v||'—')}</option>`
    ).join('');

    /* data-row/data-k en cada <td>: no los usa grilla.js (celdaDe ubica por
     * cellIndex), pero es la misma convencion que Analisis y Movimientos, y
     * documenta a que columna corresponde cada celda para quien lea el DOM. */
    tb += `<tr class="${rowCls}" data-lote="${escA(loteStr)}">
  <td data-row="${ri}" data-k="lote">${esc(loteStr)}</td>
  <td data-row="${ri}" data-k="variedad">${esc(lote.variedad || '')}</td>
  <td data-row="${ri}" data-k="fa_estado" class="${faClass}">${esc(lote.fa_estado || '—')}</td>
  <td data-row="${ri}" data-k="fml_estado" class="${fmlClass}">${esc(lote.fml_estado || '—')}</td>
  <td data-row="${ri}" data-k="inoculado"><select class="cell fml-inoculado" data-lote="${escA(loteStr)}">${inoOpts}</select></td>
  <td data-row="${ri}" data-k="ultima_fecha">${esc(lote.ultima_fecha || '—')}</td>
  <td data-row="${ri}" data-k="dias_desde_analisis" class="num">${lote.dias_desde_analisis != null ? lote.dias_desde_analisis : '—'}</td>
  <td data-row="${ri}" data-k="proximo" class="${proxClass}">${esc(proxText)}</td>
  <td data-row="${ri}" data-k="so2_ok" ${so2Cl}>${so2Txt}</td>
  <td data-row="${ri}" data-k="ph_ok" ${phCl}>${phTxt}</td>
  <td data-row="${ri}" data-k="comentario"><input class="cell fml-comentario" type="text" data-lote="${escA(loteStr)}" value="${escA(comentarioVal)}" placeholder="comentario…" style="min-width:160px"></td>
  <td>${btnFmlHtml}</td>
</tr>`;
  }

  $('tFmlBody').innerHTML = tb || '<tr><td colspan="12" style="color:var(--muted)">Sin lotes con los filtros actuales.</td></tr>';
  $('fmlCount').textContent = rows.length + ' / ' + allLotes.length + ' lotes';

  /* --- event listeners (delegados en la sección) --- */
  // usamos sec._wiredFml para no acumular listeners en cada re-render
  if (!sec._wiredFml){
    sec._wiredFml = true;

    sec.addEventListener('change', e => {
      const el = e.target.closest('select.fml-inoculado'); if (!el) return;
      const est = _tocarEstado(el.dataset.lote);
      est.inoculado = el.value === '' ? null : el.value;
      est.actualizado_por = usuarioActual();
      est.actualizado_el  = new Date().toISOString();
      markDirty();
    });

    sec.addEventListener('input', e => {
      const el = e.target.closest('input.fml-comentario'); if (!el) return;
      const est = _tocarEstado(el.dataset.lote);
      est.comentario = el.value;
      est.actualizado_por = usuarioActual();
      est.actualizado_el  = new Date().toISOString();
      markDirty();
    });

    sec.addEventListener('change', e => {
      const el = e.target; if (!el.id) return;
      if (el.id === 'fltFmlMostrar')  { _fmlFiltMostrar  = el.value; renderSeguimiento(); }
    });

    sec.addEventListener('input', e => {
      const el = e.target; if (el.id === 'buscaFml') { _fmlFiltBusca = el.value.trim(); renderSeguimiento(); }
    });

    sec.addEventListener('click', e => {
      const b = e.target.closest('#btnLimpiarFltFml'); if (!b) return;
      _fmlFiltMostrar = 'activos'; _fmlFiltBusca = '';
      limpiarFiltrosMulti(_descFml, 'buscaFml', _instFml, renderSeguimiento);
    });

    sec.addEventListener('click', e => {
      const b = e.target.closest('[data-fml-toggle]'); if (!b) return;
      const loteStr = b.dataset.fmlToggle;
      const est = _tocarEstado(loteStr);
      if (est.fml_finalizada_confirmada){
        // Revertir: los tres campos se borran juntos, no se dejan a medias.
        delete est.fml_finalizada_confirmada;
        delete est.fml_finalizada_confirmada_por;
        delete est.fml_finalizada_confirmada_el;
      } else {
        est.fml_finalizada_confirmada = true;
        est.fml_finalizada_confirmada_por = usuarioActual();
        est.fml_finalizada_confirmada_el  = new Date().toISOString();
      }
      markDirty();
      renderSeguimiento();
    });
  }

  /* Grilla tipo planilla, con adaptador propio: el objeto de fila NO es un
   * elemento de DATOS(), es el NUMERO DE LOTE (string primitivo). estado_lote
   * se indexa por lote y una entrada recien se crea al primer toque, asi que
   * usar ese objeto como identidad fallaria antes de que exista. El string
   * sirve de identidad Y de destino de escritura por igual: DATOS().estado_lote
   * se resuelve siempre al vuelo, nunca queda una referencia vieja. */
  const t = $('tFml');
  t._rows = rows.map(l => String(l.lote ?? ''));

  activarGrilla(t, {
    objetoDe(f){ return (t._rows && t._rows[f] != null) ? t._rows[f] : null; },
    leer(loteStr, k){
      const e = DATOS().estado_lote[loteStr];
      return (e && e[k] != null) ? e[k] : null;
    },
    escribir(loteStr, k, texto){
      // Solo inoculado y comentario son editables; el resto son calculados
      // por el motor FML y no tienen sentido como escritura manual.
      if (k !== 'inoculado' && k !== 'comentario') return 'ro';
      const val = String(texto ?? '').trim();
      let campo;
      if (k === 'inoculado'){
        const opt = INOCULADO_OPTS.find(o => o.toLowerCase() === val.toLowerCase());
        if (opt === undefined) return 'invalido';
        campo = opt === '' ? null : opt;
      } else {
        campo = val === '' ? null : val;
      }
      // Validar ANTES de tocar el estado: un valor invalido no debe crear una
      // entrada vacia en estado_lote como efecto colateral del rechazo.
      const e = _tocarEstado(loteStr);
      e[k] = campo;
      e.actualizado_por = usuarioActual();
      e.actualizado_el  = new Date().toISOString();
      return 'ok';
    },
    escribirCrudo(loteStr, k, valor){ _tocarEstado(loteStr)[k] = valor; },
    onCambio: markDirty,
  });
}

registrarVista('fml', () => renderSeguimiento());
