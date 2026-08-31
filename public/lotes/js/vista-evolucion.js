/* ===== Lotes CIW — pestana Evolucion ===== */
'use strict';

import { $, esc, escA, DATOS, registrarVista } from './nucleo.js';
import { CRITERIOS_DEFAULT, criteriosEfectivosJS } from './criterios.js';
import { pasaMulti, opcionesValores, matchValor, initFiltrosMulti } from './tabla.js';

/* --- helper gráfico SVG inline (portado de prensas) --- */
function miniLineSVG(pts, limit, color, labels, incl){
  const W=320,H=160,m={l:34,r:10,t:12,b:30};
  if(!pts.length) return '<div style="color:var(--muted);font-size:12px;padding:24px 10px">Sin datos de este parámetro.</div>';
  const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
  let xmin=Math.min(...xs),xmax=Math.max(...xs); if(xmin===xmax){xmin-=0.5;xmax+=0.5;}
  let ymin=Math.min(0,...ys), ymax=Math.max(limit*1.2,...ys); if(ymin===ymax)ymax=ymin+1;
  const sx=v=>m.l+(v-xmin)/(xmax-xmin)*(W-m.l-m.r), sy=v=>H-m.b-(v-ymin)/(ymax-ymin)*(H-m.t-m.b);
  let g=`<rect x="${m.l}" y="${m.t}" width="${W-m.l-m.r}" height="${H-m.t-m.b}" fill="none" stroke="#e0dacd"/>`;
  if(limit>=ymin&&limit<=ymax){const ly=sy(limit); g+=`<line x1="${m.l}" y1="${ly}" x2="${W-m.r}" y2="${ly}" stroke="#c0473b" stroke-width="1" stroke-dasharray="4 3"/><text x="${W-m.r-2}" y="${ly-3}" fill="#c0473b" font-size="9" text-anchor="end">límite ${limit}</text>`;}
  const s=[...pts].sort((a,b)=>a.x-b.x);
  g+=`<polyline fill="none" stroke="${color}" stroke-width="2" points="${s.map(p=>sx(p.x).toFixed(1)+','+sy(p.y).toFixed(1)).join(' ')}"/>`;
  g+=s.map(p=>{const lab=labels&&labels[p.x]!=null?labels[p.x]:p.x; return `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3.5" fill="${((incl?p.y>=limit:p.y>limit)||p.y==-999)?'#c0473b':color}"><title>${esc(lab)}: ${esc(p.y)}</title></circle>`;}).join('');
  const skip=labels&&labels.length>9?Math.ceil(labels.length/9):1;
  g+=s.map((p,i)=>{ if(i%skip!==0) return ''; const lab=labels&&labels[p.x]!=null?labels[p.x]:p.x;
    return `<text x="${sx(p.x).toFixed(1)}" y="${H-m.b+12}" fill="#8c857b" font-size="8" text-anchor="middle" transform="rotate(-30 ${sx(p.x).toFixed(1)} ${H-m.b+12})">${esc(lab)}</text>`;}).join('');
  g+=`<text x="${m.l-4}" y="${H-m.b+3}" fill="#8c857b" font-size="9" text-anchor="end">${ymin.toFixed(1)}</text><text x="${m.l-4}" y="${m.t+8}" fill="#8c857b" font-size="9" text-anchor="end">${ymax.toFixed(1)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${g}</svg>`;
}

/* --- estado módulo Evolución --- */
let _evoLote = '';

/* Set creado UNA vez: los widgets guardan esta misma referencia, asi que el
 * estado del filtro sobrevive a los re-render de la pestana. */
const filtEvo = { variedad: new Set() };
let _descEvo = [], _instEvo = [];

function initFiltrosEvo(){
  /* Las filas que se filtran son lotes, asi que alcanza el descriptor generico
   * sobre el campo variedad. Las opciones salen de DATOS().lotes y no de la
   * lista ya filtrada: si salieran de la filtrada, tildar una variedad haria
   * desaparecer del panel a todas las demas. */
  _descEvo = [{
    label: 'Variedad',
    set: filtEvo.variedad,
    opciones: () => opcionesValores(DATOS().lotes || [], l => l.variedad),
    match: matchValor(l => l.variedad),
  }];
  _instEvo = initFiltrosMulti('evoFltBar', _descEvo, renderEvolucion);
}

export function renderEvolucion(){
  const sec = $('tab-evolucion'); if (!sec) return;

  /* mapa lote -> objeto lote */
  const loteMap = new Map();
  for (const l of (DATOS().lotes || [])){
    loteMap.set(String(l.lote ?? ''), l);
  }

  /* lotes ordenados numéricamente */
  const lotesSorted = [...(DATOS().lotes || [])].sort((a, b) => {
    const na = parseFloat(String(a.lote ?? ''));
    const nb = parseFloat(String(b.lote ?? ''));
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a.lote ?? '').localeCompare(String(b.lote ?? ''), 'es');
  });

  /* lotes filtrados por variedad (para el select de lote) */
  const lotesFiltrados = lotesSorted.filter(l => pasaMulti(l, _descEvo));

  /* si el _evoLote elegido no es válido en el filtro actual, resetear al primero */
  if (_evoLote && !lotesFiltrados.some(l => String(l.lote ?? '') === _evoLote)){
    _evoLote = '';
  }
  if (!_evoLote && lotesFiltrados.length > 0){
    _evoLote = String(lotesFiltrados[0].lote ?? '');
  }

  /* opciones de lote */
  const loteOpts = lotesFiltrados.map(l =>
    `<option value="${escA(String(l.lote ?? ''))}"${String(l.lote ?? '') === _evoLote ? ' selected' : ''}>${esc(String(l.lote ?? ''))} — ${esc(l.variedad || '?')}</option>`
  ).join('');

  /* índice del lote actual en lotesFiltrados */
  const idxActual = lotesFiltrados.findIndex(l => String(l.lote ?? '') === _evoLote);

  /* --- contenido gráficos --- */
  let chartsHtml = '';
  if (_evoLote){
    const loteObj = loteMap.get(_evoLote);
    const variedad = loteObj ? (loteObj.variedad || '') : '';
    const eff = criteriosEfectivosJS(DATOS().config, variedad,
                                     loteObj ? loteObj.proyecto : null);

    /* análisis del lote, ordenados por fecha ascendente */
    const analisisLote = (DATOS().analisis || [])
      .filter(a => String(a.lote ?? '') === _evoLote && a.fecha_analisis)
      .sort((a, b) => (a.fecha_analisis || '') < (b.fecha_analisis || '') ? -1 : 1);

    if (analisisLote.length === 0){
      chartsHtml = '<div class="msg info" style="margin-top:10px">Este lote no tiene análisis para graficar.</div>';
    } else {
      /* construir pts y labels para cada parámetro */
      function buildPtsLabels(campo){
        const pts = [], labels = [];
        analisisLote.forEach((a, i) => {
          const v = a[campo];
          // -999 es el marcador de medicion invalida: no graficar ni incluir en el eje.
          if (v !== null && v !== undefined && v !== '' && typeof v === 'number' && v !== -999){
            pts.push({x: i, y: v});
          }
          labels[i] = a.fecha_analisis || String(i);
        });
        return { pts, labels };
      }

      const phLimit    = eff.ph_max            ?? CRITERIOS_DEFAULT.ph_max;
      const avLimit    = eff.av_max            ?? CRITERIOS_DEFAULT.av_max;
      const malicoLimit= eff.fml_malico_2ultimas ?? CRITERIOS_DEFAULT.fml_malico_2ultimas;
      const glucLimit  = 3.0;

      const phData     = buildPtsLabels('ph');
      const avData     = buildPtsLabels('av');
      const malicoData = buildPtsLabels('malico');
      const glucData   = buildPtsLabels('gluc_fruc');

      const chartCards = [
        { title:'pH',       color:'#5b7b86', limit: phLimit,    incl: true,  data: phData     },
        { title:'AV',       color:'#8a6219', limit: avLimit,    incl: false, data: avData     },
        { title:'Málico',   color:'#3f7d4f', limit: malicoLimit,incl: false, data: malicoData },
        { title:'Gluc+Fruc',color:'#7b5ea7', limit: glucLimit,  incl: false, data: glucData   },
      ];

      chartsHtml = '<div class="evo-charts">' +
        chartCards.map(c =>
          `<div class="evo-chart-card">
            <h3>${esc(c.title)} <span style="font-size:11px;font-weight:400;color:var(--muted)">(límite: ${esc(c.limit)})</span></h3>
            ${miniLineSVG(c.data.pts, c.limit, c.color, c.data.labels, c.incl)}
          </div>`
        ).join('') +
        '</div>';
    }
  }

  /* --- HTML principal --- */
  sec.innerHTML = `
<div class="toolbar">
  <div class="mfilt-bar" id="evoFltBar"></div>
  <label style="font-size:12px;color:var(--muted);white-space:nowrap">Lote:</label>
  <select id="evoSelLote" style="min-width:200px">
    ${lotesFiltrados.length === 0 ? '<option value="">Sin lotes</option>' : loteOpts}
  </select>
  <div class="evo-nav">
    <button class="btn" id="btnEvoPrev" ${idxActual <= 0 ? 'disabled' : ''}>◀ anterior</button>
    <button class="btn" id="btnEvoNext" ${idxActual < 0 || idxActual >= lotesFiltrados.length - 1 ? 'disabled' : ''}>siguiente ▶</button>
  </div>
  <span class="tag" id="evoPosTag">${lotesFiltrados.length > 0 ? (idxActual+1) + ' / ' + lotesFiltrados.length : '0 lotes'}</span>
</div>
${chartsHtml}`;

  /* --- event listeners --- */
  /* filtros multi: re-montados en cada render porque sec.innerHTML se recreo */
  if (_descEvo.length === 0){
    initFiltrosEvo();
  } else {
    const bar = $('evoFltBar');
    if (bar){
      bar.innerHTML = '';
      _instEvo.forEach(f => { bar.appendChild(f.el); f.rebuild(); });
    }
  }

  const selLote = $('evoSelLote');
  if (selLote) selLote.addEventListener('change', () => {
    _evoLote = selLote.value;
    renderEvolucion();
  });

  const btnPrev = $('btnEvoPrev');
  if (btnPrev) btnPrev.addEventListener('click', () => {
    const idx = lotesFiltrados.findIndex(l => String(l.lote ?? '') === _evoLote);
    if (idx > 0){ _evoLote = String(lotesFiltrados[idx-1].lote ?? ''); renderEvolucion(); }
  });

  const btnNext = $('btnEvoNext');
  if (btnNext) btnNext.addEventListener('click', () => {
    const idx = lotesFiltrados.findIndex(l => String(l.lote ?? '') === _evoLote);
    if (idx >= 0 && idx < lotesFiltrados.length - 1){ _evoLote = String(lotesFiltrados[idx+1].lote ?? ''); renderEvolucion(); }
  });
}

registrarVista('evolucion', () => renderEvolucion());
