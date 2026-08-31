/* ===== Lotes CIW — ficha de lote ===== */
'use strict';

import { $, esc, escA, registrarVista, mostrarTab,
         loteActivo, irALote } from './nucleo.js';
import { activarGrilla } from './grilla.js';

/* Cache: evita re-pedir si el lote no cambi */
let _loteCache = null;   // lote str que cacheamos
let _fichaCache = null;  // respuesta del endpoint

/* ---------- helpers ---------- */

function clasesBarra(pct, esCerrado){
  if (esCerrado) return 'barra cerrado';
  if (pct < 50)  return 'barra baja';
  if (pct < 100) return 'barra media';
  return 'barra';
}

function clasesHito(h){
  if (!h.aplica) return 'hito na';
  if (h.cumplido) return 'hito ok';
  return 'hito falta';
}

function iconoHito(h){
  if (!h.aplica) return '—';
  if (h.cumplido) return '✓';
  return '✗';
}

function fmtFecha(s){
  if (!s) return '';
  // yyyy-mm-dd -> dd/mm/yyyy
  const p = String(s).split('-');
  if (p.length === 3) return p[2] + '/' + p[1] + '/' + p[0];
  return esc(s);
}

function linkLote(loteStr, etiqueta){
  return `<button class="alarm-lote-link" data-iralote="${escA(loteStr)}">${esc(etiqueta || loteStr)}</button>`;
}

/* ---------- render del buscador vacio ---------- */
function htmlBuscador(mensajeError){
  return `
<div class="card" style="max-width:420px;margin:40px auto">
  ${mensajeError ? `<div class="msg err" style="margin-bottom:14px">${esc(mensajeError)}</div>` : ''}
  <h2 style="margin-top:0">Buscar lote</h2>
  <div style="display:flex;gap:8px;align-items:center">
    <input class="txt" id="fichaInputLote" placeholder="Numero de lote…" style="flex:1">
    <button class="btn primary" id="fichaBtnVer">Ver</button>
  </div>
</div>`;
}

/* ---------- render principal ---------- */
function htmlFicha(f){
  const lote   = f.lote || {};
  const esCerrado = f.etapa === 'cerrado';
  const avance = f.avance || { pct:0, cumplidos:0, aplicables:0 };
  const pct    = avance.pct ?? 0;

  /* ---- cabecera ---- */
  const meta = [lote.variedad, lote.proyecto, lote.distrito, lote.vinedo]
    .filter(Boolean).map(v => esc(v)).join(' · ');

  const sugerencia = (f.etapa_sugerida && f.etapa_sugerida !== f.etapa)
    ? `<span class="msg warn" style="display:inline-block;padding:4px 10px;margin-left:10px;font-size:12px">
        el sistema sugiere: <b>${esc(f.etapa_sugerida)}</b>
       </span>`
    : '';

  const claseBar = clasesBarra(pct, esCerrado);
  const barWidth = pct;

  const cabecera = `
<div class="card" style="${esCerrado ? 'opacity:.7;' : ''}">
  <div style="display:flex;align-items:flex-start;flex-wrap:wrap;gap:12px">
    <div style="flex:1;min-width:200px">
      <div style="font-family:var(--serif);font-size:28px;font-weight:700;line-height:1">${esc(lote.lote ?? '')}</div>
      ${lote.id_texto ? `<div style="color:var(--muted);font-size:13px;margin:2px 0 6px">${esc(lote.id_texto)}</div>` : ''}
      ${meta ? `<div style="font-size:13px;color:var(--muted)">${meta}</div>` : ''}
    </div>
    <div style="text-align:right">
      <span class="chip-etapa">${esc(f.etapa ?? '')}</span>
      ${sugerencia}
      ${esCerrado ? '<div style="color:var(--muted);font-size:12px;margin-top:4px">lote cerrado</div>' : ''}
    </div>
  </div>

  <!-- barra de avance -->
  <div class="barra-avance-wrap" style="margin-top:14px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div class="${claseBar}" style="width:160px">
        <span style="width:${barWidth}%"></span>
      </div>
      <span style="font-size:13px;color:var(--muted)">
        ${pct}% &mdash; ${avance.cumplidos} de ${avance.aplicables} hitos
        ${esCerrado && lote.avance_congelado ? '(congelada)' : ''}
      </span>
      <button class="btn" id="fichaBtnToggleHitos" style="padding:4px 10px;font-size:12px">▼ Ver hitos</button>
    </div>

    <!-- lista de hitos (colapsable) -->
    <div id="fichaHitos" style="display:none;margin-top:10px">
      ${(f.hitos || []).map(h => `
      <div class="${clasesHito(h)}">
        <span style="font-size:13px;min-width:14px">${iconoHito(h)}</span>
        <span>${esc(h.titulo)}</span>
        ${h.detalle && h.detalle !== 'completos' ? `<small>(${esc(h.detalle)})</small>` : ''}
      </div>`).join('')}
    </div>
  </div>
</div>`;

  /* ---- linea de tiempo ---- */
  const tl = (f.linea_tiempo || []).map(ev => {
    const clase = escA(ev.clase || '');
    return `<li class="${clase}">
      <span class="fecha">${fmtFecha(ev.fecha)}</span>
      <b>${esc(ev.titulo || '')}</b>
      ${ev.detalle ? ` <small style="color:var(--muted)">${esc(ev.detalle)}</small>` : ''}
    </li>`;
  }).join('');

  const secTimeline = `
<div class="card">
  <h2>Linea de tiempo</h2>
  ${tl ? `<ul class="timeline">${tl}</ul>` : '<p style="color:var(--muted)">Sin eventos registrados.</p>'}
</div>`;

  /* ---- recorrido de vasijas ---- */
  const vasRows = (f.recorrido_vasijas || []).map(v => {
    const esActual = v.hasta === null || v.hasta === undefined;
    const desde = fmtFecha(v.desde) || '—';
    const hasta = esActual ? '<b>(actual)</b>' : esc(fmtFecha(v.hasta) || '—');
    const litros = v.litros != null ? esc(String(v.litros)) : '—';
    return `<tr${esActual ? ' style="font-weight:600"' : ''}>
      <td>${esc(v.vasija || '—')}</td>
      <td>${esc(desde)}</td>
      <td>${hasta}</td>
      <td class="num">${litros}</td>
    </tr>`;
  }).join('');

  const secVasijas = `
<div class="card">
  <h2>Recorrido de vasijas</h2>
  ${vasRows
    ? `<div class="scroll"><table id="tFichaVasijas">
        <thead><tr><th data-k="vasija">Vasija</th><th data-k="desde">Desde</th><th data-k="hasta">Hasta</th><th data-k="litros" class="num">Litros</th></tr></thead>
        <tbody>${vasRows}</tbody>
       </table></div>`
    : '<p style="color:var(--muted)">Sin recorrido registrado.</p>'}
</div>`;

  /* ---- linaje ---- */
  const linaje  = f.linaje  || { padres:[], hijos:[], salidas:[] };
  const cadena  = f.cadena_identidad || [String(lote.lote ?? '')];

  function labelParteLinaje(rel){
    const partes = [esc(rel.tipo || ''), fmtFecha(rel.fecha), rel.litros != null ? esc(String(rel.litros)) + ' L' : ''].filter(Boolean);
    return `${esc(rel.lote)} <small style="color:var(--muted)">(${partes.join(', ')})</small>`;
  }

  const nPadres = linaje.padres.length;
  const nHijos  = linaje.hijos.length;

  const esFusion = nPadres >= 2;
  const esSplit  = nHijos  >= 2;

  const colPadres = `
<div class="linaje-col" style="margin-right:20px">
  <div style="font-weight:600;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Padres</div>
  ${esFusion ? `<div style="color:var(--accent);font-size:12px;font-weight:600;margin-bottom:6px">fusion de ${nPadres} lotes</div>` : ''}
  ${nPadres === 0
    ? '<div style="color:var(--muted);font-size:13px">—</div>'
    : linaje.padres.map(p => `<div style="margin-bottom:4px">${linkLote(p.lote, '')} ${labelParteLinaje(p)}</div>`).join('')}
</div>`;

  const colEste = `
<div class="linaje-col" style="margin-right:20px;border-left:2px solid var(--line);border-right:2px solid var(--line);padding:0 16px">
  <div style="font-weight:600;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Este lote</div>
  <div style="font-size:18px;font-weight:700;font-family:var(--serif)">${esc(lote.lote ?? '')}</div>
</div>`;

  const colHijos = `
<div class="linaje-col">
  <div style="font-weight:600;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Hijos</div>
  ${esSplit ? `<div style="color:var(--accent);font-size:12px;font-weight:600;margin-bottom:6px">split en ${nHijos} lotes</div>` : ''}
  ${nHijos === 0
    ? '<div style="color:var(--muted);font-size:13px">—</div>'
    : linaje.hijos.map(h => `<div style="margin-bottom:4px">${linkLote(h.lote, '')} ${labelParteLinaje(h)}</div>`).join('')}
  ${(linaje.salidas || []).length > 0
    ? `<div style="margin-top:8px;font-size:12px;color:var(--muted);font-weight:600">Salidas externas:</div>`
      + linaje.salidas.map(s => `<div style="color:var(--muted);font-size:12px;margin-bottom:2px">${esc(s.destino || '—')} &mdash; ${fmtFecha(s.fecha)} &mdash; ${s.litros != null ? esc(String(s.litros)) + ' L' : '—'}</div>`).join('')
    : ''}
</div>`;

  const cadenaHtml = cadena.length > 1
    ? `<div style="margin-top:14px;font-size:13px">
        <b>Mismo vino:</b>
        ${cadena.map(c => linkLote(c, c)).join(' &rarr; ')}
       </div>`
    : '';

  const secLinaje = `
<div class="card">
  <h2>Linaje</h2>
  <div style="display:flex;flex-wrap:wrap;gap:0;align-items:flex-start">
    ${colPadres}${colEste}${colHijos}
  </div>
  ${cadenaHtml}
</div>`;

  return cabecera + secTimeline + secVasijas + secLinaje;
}

/* ---------- renderFicha ---------- */
export async function renderFicha(){
  const sec = $('tab-ficha'); if (!sec) return;
  const lote = loteActivo();

  if (!lote){
    sec.innerHTML = htmlBuscador(null);
    _montarBuscador(sec);
    return;
  }

  /* si tenemos cache del mismo lote, usar sin hacer fetch */
  if (_loteCache === lote && _fichaCache){
    _pintarFicha(sec, _fichaCache);
    return;
  }

  sec.innerHTML = '<p style="padding:20px;color:var(--muted)">Cargando ficha…</p>';

  let data;
  try {
    const r = await fetch(API+'/ficha?lote=' + encodeURIComponent(lote));
    if (r.status === 404){
      _loteCache  = null;
      _fichaCache = null;
      sec.innerHTML = htmlBuscador('El lote ' + lote + ' no existe.');
      _montarBuscador(sec);
      return;
    }
    if (!r.ok){
      sec.innerHTML = '<div class="msg err" style="margin:20px">Error al cargar la ficha (' + r.status + ').</div>';
      return;
    }
    data = await r.json();
  } catch(e){
    sec.innerHTML = '<div class="msg err" style="margin:20px">Sin conexion con el servidor.</div>';
    return;
  }

  _loteCache  = lote;
  _fichaCache = data;
  _pintarFicha(sec, data);
}

function _pintarFicha(sec, f){
  sec.innerHTML = `
<div style="margin-bottom:10px">
  <button class="btn" id="fichaBtnVolver">← Volver</button>
</div>
${htmlFicha(f)}`;

  /* volver: ir al tab anterior (por ahora dashboard) */
  $('fichaBtnVolver').addEventListener('click', () => {
    /* ir al dashboard, que siempre tiene boton */
    mostrarTab('dashboard');
  });

  /* toggle hitos */
  const btnHitos = $('fichaBtnToggleHitos');
  const divHitos = $('fichaHitos');
  if (btnHitos && divHitos){
    btnHitos.addEventListener('click', () => {
      const visible = divHitos.style.display !== 'none';
      divHitos.style.display = visible ? 'none' : 'block';
      btnHitos.textContent = visible ? '▼ Ver hitos' : '▲ Ocultar hitos';
    });
  }

  /* delegacion: clicks en data-iralote dentro de la ficha.
   * Removemos el anterior para no acumular listeners en renders sucesivos. */
  sec.removeEventListener('click', _delegarIrALote);
  sec.addEventListener('click', _delegarIrALote);

  /* Grilla tipo planilla, solo copiar. La tabla no existe si el lote no tiene
   * recorrido registrado (vasRows vacio en htmlFicha), de ahi el guard. */
  const tVasijas = $('tFichaVasijas');
  if (tVasijas) activarGrilla(tVasijas);
}

/* delegado para los links de linaje (se re-agrega cada vez que pintamos).
 * Usamos un solo handler en el contenedor con limpieza previa. */
function _delegarIrALote(e){
  const btn = e.target.closest('[data-iralote]');
  if (!btn) return;
  const lote = btn.dataset.iralote;
  if (!lote) return;
  /* invalidar cache para que se recargue la nueva ficha */
  _loteCache  = null;
  _fichaCache = null;
  irALote(lote);
}

/* ---------- buscador sin lote activo ---------- */
function _montarBuscador(sec){
  const inp = $('fichaInputLote');
  const btn = $('fichaBtnVer');
  if (!inp || !btn) return;

  function irALoteBuscado(){
    const v = inp.value.trim();
    if (!v) return;
    _loteCache  = null;
    _fichaCache = null;
    irALote(v);
  }

  btn.addEventListener('click', irALoteBuscado);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') irALoteBuscado(); });
}

/* ---------- registro ---------- */
registrarVista('ficha', () => renderFicha());
