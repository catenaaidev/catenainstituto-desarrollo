/* ===== Lotes CIW — pestana Dashboard ===== */
'use strict';

import { $, esc, escA, DATOS, dashData, registrarVista,
         markDirty, guardar, cargarDashboard, usuarioActual, irALote } from './nucleo.js';
import { activarGrilla } from './grilla.js';
import { criteriosEfectivosJS } from './criterios.js';
import { metricasPorLote, heatmapVariedadAlarma, resumen } from './dash-metricas.js';
import { prepararGraficos, destruirGraficos, cerrarDrill,
         graficoAV, graficoSO2, graficoDispersion, pintarHeatmap } from './dash-graficos.js';

const COND_LABELS = {
  fml_no_finalizada:          'FML no terminada',
  fml_terminada_excluida:     'FML terminada/excluida',
  so2_no_ok:                  'SO2 no OK',
  ph_no_ok:                   'pH no OK',
  av_alerta:                  'AV en alerta',
  frecuencia_vencida:         'Frecuencia vencida',
  sin_analisis_valido:        'Sin análisis válido',
  no_lleno:                   'No lleno',
  fa_no_finalizada:           'FA no terminada',
  datos_operativos_incompletos: 'Datos operativos incompletos',
  control_proceso_pendiente:  'Sin control de proceso',
  so2_caida_alerta:           'Caída de SO₂ libre',
};

/* ---------- confirmacion de etapas ---------- */

function _confirmar(lote, etapaNueva, avanceActual){
  const l = DATOS().lotes.find(x => String(x.lote) === String(lote));
  if (!l) return;

  // Si sale de cerrado, borrar el avance congelado (ya no esta cerrado)
  if (etapaNueva !== 'cerrado' && l.avance_congelado !== undefined){
    delete l.avance_congelado;
  }

  // Si pasa a cerrado, congelar el avance vigente
  if (etapaNueva === 'cerrado' && avanceActual && typeof avanceActual === 'object'){
    l.avance_congelado = {
      pct:        avanceActual.pct,
      cumplidos:  avanceActual.cumplidos,
      aplicables: avanceActual.aplicables,
    };
  }

  l.etapa = etapaNueva;
  l.etapa_confirmada_por = usuarioActual();
  l.etapa_confirmada_el  = new Date().toISOString().slice(0, 19);
  if (!Array.isArray(l.historial_etapas)) l.historial_etapas = [];
  l.historial_etapas.push({
    etapa: etapaNueva,
    desde: new Date().toISOString().slice(0, 10),
    por:   usuarioActual(),
    el:    l.etapa_confirmada_el,
  });
  markDirty();
}

/* Obtiene el avance real desde la ficha calculado con la etapa destino, para
   congelar correctamente al confirmar el cierre. Se pide con &etapa=cerrado
   para que el divisor incluya todos los hitos aplicables en esa etapa (no los
   de la etapa anterior al cierre). Si falla, usa el avance de la bandeja. */
async function _avanceDesdeFicha(lote){
  try {
    const r = await fetch(API+'/ficha?lote=' + encodeURIComponent(lote) + '&etapa=cerrado');
    if (!r.ok) return null;
    const j = await r.json();
    const av = j.avance;
    if (av && typeof av.pct === 'number' && typeof av.cumplidos === 'number' && typeof av.aplicables === 'number'){
      return { pct: av.pct, cumplidos: av.cumplidos, aplicables: av.aplicables };
    }
  } catch(e){ /* falla silenciosa: se usa el fallback */ }
  return null;
}

/* Confirma la etapa de UN lote y guarda. 'fila' viene de bandeja_etapas. */
async function confirmarEtapa(fila){
  let avance = fila._avance;
  // Si va a cerrado, obtener avance real desde la ficha para congelar correctamente
  if (fila.etapa_sugerida === 'cerrado'){
    const av = await _avanceDesdeFicha(fila.lote);
    if (av) avance = av;
  }
  _confirmar(fila.lote, fila.etapa_sugerida, avance);
  const ok = await guardar(false);
  if (ok) cargarDashboard();
}

/* Confirma TODOS los lotes de la bandeja y hace UN SOLO guardado. */
async function confirmarTodasLasEtapas(filas){
  if (!filas || filas.length === 0) return;
  // Para los que van a cerrado, obtener avance real en paralelo
  const avances = await Promise.all(filas.map(async f => {
    if (f.etapa_sugerida === 'cerrado'){
      const av = await _avanceDesdeFicha(f.lote);
      return av || f._avance;
    }
    return f._avance;
  }));
  filas.forEach((f, i) => _confirmar(f.lote, f.etapa_sugerida, avances[i]));
  const ok = await guardar(false);
  if (ok) cargarDashboard();
}

/* ---------- graficos ----------
 * Todo el bloque va dentro de un try: un grafico es una ayuda para decidir,
 * no la fuente de verdad. Si Chart.js no cargo, si un canvas falta o si un
 * dato viene raro, el dashboard tiene que seguir mostrando las alarmas y la
 * bandeja de etapas igual, que es de donde sale el trabajo del dia. */
function renderGraficos(d){
  const cont = $('dashHeatmap');
  try {
    if (!prepararGraficos()){
      /* Sin Chart.js no hay barras. Se avisa en vez de dejar tres marcos en
       * blanco: un panel vacio sin explicacion se lee como "no hay lotes con
       * problemas", que es exactamente la conclusion opuesta a la correcta. */
      document.querySelectorAll('#tab-dashboard [data-canvas]').forEach(el => {
        el.innerHTML = '<div class="ch-empty">No se pudo cargar la librería de gráficos ' +
                       '(js/vendor/chart.umd.js). Las tablas de abajo siguen al día.</div>';
        el.style.height = 'auto';
      });
      return;
    }

    destruirGraficos();
    ['chAvDrill', 'chSo2Drill'].forEach(cerrarDrill);

    const datos = DATOS() || {};
    const filas = metricasPorLote(d, datos);

    graficoAV(filas);
    graficoSO2(filas);
    /* La curva de objetivo se dibuja con los criterios por defecto (sin
     * variedad ni proyecto): es una referencia visual, y cada punto ya viene
     * coloreado segun SU propio objetivo. */
    graficoDispersion(filas, criteriosEfectivosJS(datos.config || {}, null, null));
    pintarHeatmap(heatmapVariedadAlarma(filas), 'dashHeatmap');

    return resumen(filas);
  } catch (err){
    console.error('Dashboard: fallaron los gráficos', err);
    if (cont) cont.innerHTML = '<div class="ch-empty">No se pudieron calcular los gráficos. ' +
                               'Las tablas de abajo siguen siendo válidas.</div>';
    return null;
  }
}

/* ---------- render ---------- */

/** ¿A este lote le falta el analisis que pide su frecuencia?
 *
 *  Es la MISMA definicion que alimenta la pregunta frecuente "Faltan analizar"
 *  y las tarjetas de analisis: vive en un solo lugar a proposito, porque dos
 *  copias de esta condicion se separan callado y el dashboard pasa a mostrar
 *  dos numeros distintos para lo mismo.
 *
 *  Las dos alarmas cuentan: 'frecuencia_vencida' es el lote que se paso de sus
 *  dias, y 'sin_analisis_valido' el que nunca tuvo uno. Los dos casos son "hay
 *  que ir a medirlo".  */
function faltaAnalizar(l){
  return !!(l.alarmas && (l.alarmas.includes('frecuencia_vencida')
                       || l.alarmas.includes('sin_analisis_valido')));
}

export function renderDashboard(){
  const d = dashData();
  if (!d){
    // mostrar placeholder hasta que lleguen los datos
    $('kpiActivos').textContent = '—';
    $('kpiVencidos').textContent = '—';
    $('kpiIdeal').textContent = '—';
    $('kpiAnHechos').textContent = '—';
    $('kpiAnFaltan').textContent = '—';
    $('tAlarmasBody').innerHTML = '<tr><td colspan="4" style="color:var(--muted)">Cargando datos…</td></tr>';
    $('dashFaq').innerHTML = '';
    $('bandejaEtapas').innerHTML = '';
    return;
  }

  /* ---- Graficos ----
   * Antes que los KPIs porque devuelve el resumen que estos usan de subtitulo. */
  const res = renderGraficos(d);

  /* ---- KPIs ---- */
  const kpis = d.kpis || {};
  const total = kpis.total_activos ?? 0;
  const ent = n => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
  const pct = n => (total ? Math.round(n * 100 / total) : 0) + ' % del stock';

  $('kpiActivos').textContent  = kpis.total_activos  ?? '—';
  $('kpiVencidos').textContent = kpis.vencidos        ?? '—';
  $('kpiIdeal').textContent    = kpis.condicion_ideal ?? '—';
  $('kpiSo2').textContent      = res ? res.deficitSo2 : '—';
  $('kpiAv').textContent       = res ? res.avAlta     : '—';

  /* Analisis segun la frecuencia. Se cuenta por LOTE y sobre el estado de hoy:
   * cada lote activo debe un analisis, y o esta al dia o no. Los numeros
   * cierran (hechos + faltan = lotes activos): por eso ya no hay tarjeta de
   * "Análisis totales", repetia la de lotes activos. Sale todo
   * de d.lotes, que ya trae las alarmas del motor FML: sin llamadas nuevas al
   * servidor y sin reglas inventadas aca. */
  const lotesAn   = d.lotes || [];
  const anTotal   = lotesAn.length;
  const anFaltan  = lotesAn.filter(faltaAnalizar).length;
  const anHechos  = anTotal - anFaltan;

  $('kpiAnHechos').textContent = anHechos;
  $('kpiAnFaltan').textContent = anFaltan;

  const pctAn = n => (anTotal ? Math.round(n * 100 / anTotal) : 0) + ' % de los lotes';
  $('kpiAnHechosSub').textContent = anTotal ? pctAn(anHechos) : '';
  $('kpiAnFaltanSub').textContent = anFaltan
    ? pctAn(anFaltan) + ' — vencidos o sin análisis'
    : 'Todos dentro de frecuencia';

  if (res){
    $('kpiActivosSub').innerHTML  = `<b>${ent(res.litros)}</b> L en guarda · ${res.variedades} variedad${res.variedades !== 1 ? 'es' : ''}`;
    $('kpiVencidosSub').textContent = kpis.vencidos ? pct(kpis.vencidos) : 'Todos dentro de frecuencia';
    $('kpiIdealSub').textContent    = pct(kpis.condicion_ideal ?? 0);
    /* Los gramos de MBK son la magnitud real del trabajo pendiente: con ese
     * numero se decide si la corrección se arma hoy o el lunes. */
    $('kpiSo2Sub').innerHTML = res.deficitSo2
      ? `Faltan <b>${ent(res.deficitGramos)}</b> g de SO₂ en total`
      : (res.sinDatoSo2 ? `${res.sinDatoSo2} lote(s) sin datos para evaluar` : 'Todo en objetivo');
    $('kpiAvSub').textContent = res.avAlta
      ? 'Al 80 % de su límite o por encima'
      : (res.sinDatoAv ? `${res.sinDatoAv} lote(s) sin AV medida` : 'Todos con margen');
  }

  /* ---- Alarmas ---- */
  const alarmas = d.alarmas || {};
  const entradas = Object.entries(alarmas)
    .map(([cond, info]) => ({ cond, cantidad: info.cantidad || 0, lotes: info.lotes || [], accion: info.accion || '' }))
    .sort((a, b) => b.cantidad - a.cantidad);

  let tbody = '';
  if (entradas.length === 0){
    tbody = '<tr><td colspan="4" style="color:var(--muted)">Sin alarmas activas.</td></tr>';
  } else {
    for (const e of entradas){
      const nombre = esc(COND_LABELS[e.cond] || e.cond);
      const lotesHtml = e.lotes
        .map(l => `<button class="alarm-lote-link" data-iralote="${escA(l)}">${esc(l)}</button>`)
        .join(' ');
      tbody += `<tr><td>${nombre}</td><td class="num">${e.cantidad}</td><td>${esc(e.accion)}</td><td>${lotesHtml}</td></tr>`;
    }
  }
  $('tAlarmasBody').innerHTML = tbody;

  /* Grilla tipo planilla, solo copiar: la tabla es un resumen calculado por
   * el motor FML, no hay campo que tenga sentido editar aca. */
  activarGrilla($('tAlarmas'));

  /* ---- Preguntas frecuentes ---- */
  const lotes = d.lotes || [];

  const fmlNoTerm  = lotes.filter(l => l.fml_estado === 'no_finalizada').length;
  const fmlTermExc = lotes.filter(l => l.fml_estado === 'finalizada' || l.fml_estado === 'excluida').length;
  const mermos     = lotes.filter(l => l.estado_llenado === 'no_lleno').length;
  /* La misma definicion que la tarjeta de faltantes: si los dos numeros no dan
   * igual, es un bug. */
  const sinAnalisis = lotes.filter(faltaAnalizar).length;
  const faEnProc   = lotes.filter(l => l.fa_estado === 'no_finalizada').length;

  const faqs = [
    { n: fmlNoTerm,   label: 'FML no terminada',       hi: fmlNoTerm  > 0 },
    { n: fmlTermExc,  label: 'FML terminada / excluida', hi: false      },
    { n: mermos,      label: 'Mermos (no lleno)',        hi: mermos     > 0 },
    { n: sinAnalisis, label: 'Faltan analizar',          hi: sinAnalisis > 0 },
    { n: faEnProc,    label: 'FA en proceso',            hi: faEnProc   > 0 },
  ];

  $('dashFaq').innerHTML = faqs.map(f =>
    `<div class="faq-item${f.hi ? ' hi' : ''}">
      <div class="faq-n">${f.n}</div>
      <div class="faq-label">${esc(f.label)}</div>
    </div>`
  ).join('');

  /* ---- Bandeja de etapas ---- */
  const bandeja = d.bandeja_etapas || [];
  const elBandeja = $('bandejaEtapas');
  if (!elBandeja) return;

  if (bandeja.length === 0){
    elBandeja.innerHTML =
      '<div class="card" style="margin-bottom:22px">' +
      '<h2>Bandeja de etapas</h2>' +
      '<p style="color:var(--muted);font-size:13px;margin:0">Todas las etapas estan confirmadas.</p>' +
      '</div>';
    return;
  }

  // Enriquecer filas con el avance completo (pct + cumplidos + aplicables) para congelar al confirmar cerrado.
  // Los hitos vienen en d.lotes — los calculamos desde ahi sin recalcular nada en JS.
  const avanceMap = new Map();
  for (const lf of (d.lotes || [])){
    const hitos = lf.hitos || [];
    const aplicables = hitos.filter(h => h.aplica).length;
    const cumplidos  = hitos.filter(h => h.aplica && h.cumplido).length;
    avanceMap.set(String(lf.lote), {
      pct:        lf.pct != null ? lf.pct : (aplicables ? Math.round(cumplidos * 100 / aplicables) : 0),
      cumplidos:  cumplidos,
      aplicables: aplicables,
    });
  }

  // Construir filas con _avance para que _confirmar pueda congelar
  const filasConAvance = bandeja.map(f => ({
    ...f,
    _avance: avanceMap.get(String(f.lote)) || { pct: f.pct, cumplidos: 0, aplicables: 0 },
  }));

  let html =
    '<div class="card" style="margin-bottom:22px" id="bandejaEtapasCard">' +
    `<h2>Bandeja de etapas</h2>` +
    `<p style="color:var(--muted);font-size:13px;margin:-8px 0 12px">${esc(String(bandeja.length))} lote${bandeja.length !== 1 ? 's' : ''} listo${bandeja.length !== 1 ? 's' : ''} para cambiar de etapa</p>` +
    '<div style="margin-bottom:12px"><button class="btn primary" id="btnConfirmarTodas">✓ Confirmar todas</button></div>' +
    '<div class="scroll"><table id="tBandeja">' +
    '<thead><tr><th class="num">Lote</th><th>Variedad</th><th>Etapa actual</th><th>Etapa sugerida</th><th class="num">%</th><th></th></tr></thead>' +
    '<tbody>';

  filasConAvance.forEach((f, idx) => {
    const pct = f.pct != null ? f.pct : '—';
    html +=
      `<tr>` +
      `<td class="num"><button class="alarm-lote-link" data-iralote="${escA(f.lote)}">${esc(f.lote)}</button></td>` +
      `<td>${esc(f.variedad || '—')}</td>` +
      `<td><span class="chip-etapa">${esc(f.etapa)}</span></td>` +
      `<td><span class="chip-etapa">${esc(f.etapa_sugerida)}</span></td>` +
      `<td class="num">${esc(String(pct))}%</td>` +
      `<td><button class="btn" data-confirmar-idx="${escA(String(idx))}">Confirmar</button></td>` +
      `</tr>`;
  });

  html += '</tbody></table></div></div>';
  elBandeja.innerHTML = html;

  // Guardar filas en el elemento para el listener
  $('bandejaEtapasCard')._filas = filasConAvance;

  /* listeners — delegación en la card */
  $('bandejaEtapasCard').addEventListener('click', async e => {
    // Confirmar todas
    const btnTodas = e.target.closest('#btnConfirmarTodas');
    if (btnTodas){
      const card = e.target.closest('#bandejaEtapasCard');
      await confirmarTodasLasEtapas(card._filas || []);
      return;
    }
    // Confirmar individual
    const btnFila = e.target.closest('[data-confirmar-idx]');
    if (btnFila && !e.target.closest('#btnConfirmarTodas')){
      const card = e.target.closest('#bandejaEtapasCard');
      const idx  = parseInt(btnFila.dataset.confirmarIdx, 10);
      const fila = (card._filas || [])[idx];
      if (fila) await confirmarEtapa(fila);
      return;
    }
    // Ir a lote
    const btnLote = e.target.closest('[data-iralote]');
    if (btnLote && btnLote.dataset.iralote) irALote(btnLote.dataset.iralote);
  });
}

/* ---------- navegacion desde los graficos ----------
 * Un solo listener en la seccion, montado una vez. Los cajones de lotes que
 * abren las barras y el heatmap se re-crean en cada render, asi que colgarles
 * un handler a ellos significaria acordarse de sacarlo; delegando en la
 * seccion, que no se destruye nunca, el problema no existe.
 *
 * La bandeja de etapas mantiene su propio listener aparte porque ademas de
 * navegar confirma etapas y guarda, y no conviene que una operacion de
 * escritura cuelgue del mismo handler que un simple "ir a". */
function montarNavegacionGraficos(){
  const sec = document.getElementById('tab-dashboard');
  if (!sec || sec.dataset.navGraficos) return;
  sec.dataset.navGraficos = '1';

  sec.addEventListener('click', e => {
    const cerrar = e.target.closest('[data-cerrar-drill]');
    if (cerrar){
      cerrarDrill(cerrar.dataset.cerrarDrill);
      sec.querySelectorAll('.hm-cell.sel').forEach(b => b.classList.remove('sel'));
      return;
    }
    /* La bandeja se ocupa de lo suyo: si el clic nacio ahi adentro, no lo
     * tocamos o el lote se abriria dos veces. */
    if (e.target.closest('#bandejaEtapasCard')) return;
    const btn = e.target.closest('[data-iralote]');
    if (btn && btn.dataset.iralote) irALote(btn.dataset.iralote);
  });

  /* Los puntos de la nube viven dentro de un <canvas>: no hay elemento DOM
   * al que delegarle el clic, asi que dash-graficos avisa por evento. */
  window.addEventListener('lotes:ir', e => { if (e.detail) irALote(e.detail); });
}

registrarVista('dashboard', () => { montarNavegacionGraficos(); renderDashboard(); });
