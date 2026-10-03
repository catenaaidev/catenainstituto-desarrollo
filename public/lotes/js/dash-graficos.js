/* ===== Lotes CIW — graficos del Dashboard =====
 *
 * Dibuja los cuatro paneles del dashboard sobre los numeros que devuelve
 * dash-metricas.js. Aca vive todo lo que toca el DOM y Chart.js; la
 * aritmetica no, a proposito.
 *
 * Por que Chart.js vendorizado y no un CDN
 * ----------------------------------------
 * La app corre en un servidor local de la bodega y se usa con la red caida
 * mas seguido de lo que uno querria. Un <script src="https://cdn..."> deja
 * el dashboard en blanco justo el dia que no hay internet. La copia esta en
 * js/vendor/chart.umd.js (MIT, ver el LICENSE al lado) y se carga con una
 * etiqueta <script> comun en index.html, no como modulo: el build UMD publica
 * window.Chart y registra todos los controladores solo.
 *
 * Por que el heatmap NO usa Chart.js
 * ----------------------------------
 * Una matriz necesitaria el plugin chartjs-chart-matrix, una dependencia mas
 * para dibujar rectangulos de colores. Con una <table> y CSS sale igual de
 * bien, se puede navegar con el teclado, se puede copiar a Excel y un lector
 * de pantalla la entiende como la matriz que es.
 *
 * Todo grafico es un filtro
 * -------------------------
 * Cada barra y cada celda abren la lista de lotes que representan, y cada
 * numero de lote lleva a su ficha. Un grafico del que no se puede bajar a los
 * lotes obliga a leer el numero y despues buscarlo a mano en otra pestana, que
 * es exactamente el trabajo que el dashboard tendria que ahorrar.
 */
'use strict';

import { esc, escA } from './nucleo.js';
import { BANDAS_AV, BANDAS_SO2, agrupar, objetivoSo2Libre } from './dash-metricas.js';

/* Instancias vivas de Chart.js. El dashboard se re-renderiza en cada guardado
 * y Chart.js no libera el canvas solo: sin este registro cada guardado deja un
 * grafico fantasma escuchando el resize y el mousemove. */
const _charts = new Map();

/**
 * Devuelve el <canvas> de un panel, recreandolo si hace falta.
 *
 * vacio() reemplaza el canvas por un cartel cuando no hay datos que dibujar.
 * Sin esta funcion ese reemplazo seria definitivo: el markup del dashboard se
 * escribe una sola vez en index.html y renderDashboard() no lo reconstruye, asi
 * que el primer render sin datos dejaria el panel muerto para toda la sesion —
 * y justamente el caso normal es que los datos lleguen despues, cuando el
 * tecnico carga los analisis del dia.
 */
function asegurarCanvas(id){
  let canvas = document.getElementById(id);
  if (canvas && canvas.tagName === 'CANVAS') return canvas;
  const hueco = document.querySelector(`[data-canvas="${id}"]`);
  if (!hueco) return null;
  hueco.innerHTML = `<canvas id="${id}"></canvas>`;
  return document.getElementById(id);
}

function pintar(id, config){
  const canvas = asegurarCanvas(id);
  if (!canvas || !window.Chart) return null;
  const previo = _charts.get(id);
  if (previo) previo.destroy();
  const c = new window.Chart(canvas.getContext('2d'), config);
  _charts.set(id, c);
  return c;
}

/** Libera todos los graficos. La llama la vista antes de re-render. */
export function destruirGraficos(){
  for (const c of _charts.values()) c.destroy();
  _charts.clear();
}

/* ---------------------------------------------------------------- estilo */

/* Los colores salen del CSS y no de constantes JS: el dashboard y las pastillas
 * de estado tienen que ser del mismo color aunque alguien retoque el :root. */
const _css = new Map();
function tok(nombre, fallback){
  if (!_css.has(nombre)){
    const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
    _css.set(nombre, v || fallback);
  }
  return _css.get(nombre);
}
/** Color de la escala de riesgo 0..4. */
const colorRiesgo = i => tok('--sc-' + i, '#8c857b');

/** Igual que un color de la escala pero translucido, para los rellenos. */
function conAlpha(hex, a){
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Ajustes comunes a todos los graficos. */
function baseChart(){
  if (!window.Chart) return;
  const C = window.Chart;
  C.defaults.font.family = getComputedStyle(document.body).fontFamily;
  C.defaults.font.size = 11.5;
  C.defaults.color = tok('--muted', '#8c857b');
  C.defaults.animation.duration = 420;
  C.defaults.plugins.legend.display = false;
  C.defaults.plugins.tooltip.backgroundColor = 'rgba(42,38,34,.94)';
  C.defaults.plugins.tooltip.padding = 10;
  C.defaults.plugins.tooltip.cornerRadius = 8;
  C.defaults.plugins.tooltip.titleFont = { weight: '600', size: 12 };
  C.defaults.plugins.tooltip.bodyFont = { size: 11.5 };
  C.defaults.plugins.tooltip.displayColors = false;
  C.defaults.maintainAspectRatio = false;
}

const ejeY = titulo => ({
  beginAtZero: true,
  grid:   { color: tok('--line-soft', '#efece4'), drawTicks: false },
  border: { display: false },
  ticks:  { precision: 0, padding: 6 },
  title:  { display: !!titulo, text: titulo, color: tok('--muted', '#8c857b'),
            font: { size: 10.5 } },
});
const ejeX = () => ({
  grid:   { display: false },
  border: { color: tok('--line', '#e7e3da') },
  ticks:  { padding: 4, maxRotation: 0, autoSkip: false },
});

/* --------------------------------------------------------------- drill-down */

/** Lista de lotes clickeables. Los data-iralote los recoge el listener
 *  delegado de la vista, que es el que sabe navegar a la ficha. */
function listaLotes(lotes){
  return lotes
    .slice()
    .sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true }))
    .map(l => `<button class="alarm-lote-link" data-iralote="${escA(l)}">${esc(l)}</button>`)
    .join(' ');
}

/** Abre (o cierra, si ya mostraba lo mismo) el cajon de lotes de un panel. */
function mostrarDrill(idCaja, clave, titulo, lotes){
  const caja = document.getElementById(idCaja);
  if (!caja) return;
  if (caja.dataset.clave === clave){ cerrarDrill(idCaja); return; }
  if (!lotes.length){ cerrarDrill(idCaja); return; }
  caja.dataset.clave = clave;
  caja.innerHTML =
    '<div class="ch-drill-top">' +
      `<span class="ch-drill-tit">${esc(titulo)}</span>` +
      `<span style="color:var(--muted)">${lotes.length} lote${lotes.length !== 1 ? 's' : ''}</span>` +
      `<button class="ch-drill-cerrar" data-cerrar-drill="${escA(idCaja)}" title="Cerrar" aria-label="Cerrar">×</button>` +
    '</div>' +
    listaLotes(lotes);
  caja.style.display = '';
}

export function cerrarDrill(idCaja){
  const caja = document.getElementById(idCaja);
  if (!caja) return;
  caja.dataset.clave = '';
  caja.innerHTML = '';
  caja.style.display = 'none';
}

/** Mensaje de panel sin datos, en el lugar del canvas.
 *  El hueco conserva el data-canvas, asi que asegurarCanvas() puede devolver el
 *  panel a la vida en cuanto lleguen los datos. */
function vacio(idCanvas, texto){
  const previo = _charts.get(idCanvas);
  if (previo){ previo.destroy(); _charts.delete(idCanvas); }
  const hueco = document.querySelector(`[data-canvas="${idCanvas}"]`);
  if (!hueco) return;
  hueco.innerHTML = `<div class="ch-empty">${esc(texto)}</div>`;
}

/* ============================================================ 1. ACIDEZ VOLATIL */

/**
 * Agrupamiento de acidez volatil por banda.
 *
 * El eje X no son g/L sino el porcentaje del limite de CADA lote, porque el
 * av_max se configura por variedad y por proyecto: un Malbec con limite 0,8 y
 * un lote de brandy con 0,9 no comparten escala absoluta pero si comparten la
 * pregunta "cuanto margen le queda".
 */
export function graficoAV(filas){
  const { grupos, sinDato } = agrupar(filas, BANDAS_AV, 'avBanda');
  const conDato = filas.length - sinDato.length;

  const pie = document.getElementById('chAvPie');
  if (!conDato){
    vacio('chAv', 'Ninguno de los lotes activos tiene una acidez volatil valida cargada.');
    if (pie) pie.innerHTML = `${filas.length} lotes activos, ninguno con AV medida.`;
    return;
  }

  pintar('chAv', {
    type: 'bar',
    data: {
      labels: grupos.map(g => g.etiqueta),
      datasets: [{
        data: grupos.map(g => g.lotes.length),
        backgroundColor: grupos.map(g => conAlpha(colorRiesgo(g.riesgo), .82)),
        hoverBackgroundColor: grupos.map(g => colorRiesgo(g.riesgo)),
        borderRadius: 7,
        borderSkipped: false,
        maxBarThickness: 62,
      }],
    },
    options: {
      responsive: true,
      onClick: (_e, els) => {
        if (!els.length) return;
        const g = grupos[els[0].index];
        mostrarDrill('chAvDrill', 'av-' + g.id, `AV — ${g.etiqueta} (${g.ayuda.toLowerCase()})`, g.lotes);
      },
      onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      scales: { x: ejeX(), y: ejeY('lotes') },
      plugins: {
        tooltip: {
          callbacks: {
            title: it => grupos[it[0].dataIndex].etiqueta,
            label: it => {
              const g = grupos[it.dataIndex];
              const n = g.lotes.length;
              const pct = conDato ? Math.round(n * 100 / conDato) : 0;
              return [`${n} lote${n !== 1 ? 's' : ''} (${pct} %)`, g.ayuda,
                      n ? 'Clic para ver los lotes' : ''];
            },
          },
        },
      },
    },
  });

  const enRiesgo = grupos.filter(g => g.riesgo >= 2).reduce((s, g) => s + g.lotes.length, 0);
  if (pie){
    pie.innerHTML = enRiesgo
      ? `<b>${enRiesgo}</b> lote${enRiesgo !== 1 ? 's' : ''} al 80 % del limite o por encima.` +
        (sinDato.length ? ` ${sinDato.length} sin AV medida.` : '')
      : `Ningun lote pasa el 80 % de su limite.` +
        (sinDato.length ? ` ${sinDato.length} sin AV medida.` : '');
  }

  const crit = document.getElementById('chAvCrit');
  if (crit){
    /* Los limites pueden diferir entre lotes; se muestra el rango real en vez
     * de un numero solo, que seria mentira en cuanto haya un override. */
    const lims = [...new Set(filas.map(f => f.avLimite).filter(v => v != null))].sort((a, b) => a - b);
    crit.textContent = lims.length === 1
      ? `limite ${lims[0].toLocaleString('es-AR')} g/L`
      : lims.length ? `limite ${lims[0]}–${lims[lims.length - 1]} g/L` : '';
  }
}

/* ================================================================= 2. SO2 */

/**
 * Agrupamiento de SO2 libre contra el objetivo de cada lote.
 *
 * La diferencia (libre − objetivo) es lo unico comparable: el objetivo sale
 * del pH de la propia muestra, asi que dos lotes con el mismo SO2 libre pueden
 * estar uno sobrado y el otro en deficit.
 */
export function graficoSO2(todas){
  /* Los proyectos sin SO2 no van ni a una barra ni a "sin datos": no hay nada
   * que evaluar, igual que en la tarjeta y en la alarma so2_no_ok. */
  const filas = todas.filter(f => !f.so2NoAplica);
  const { grupos, sinDato } = agrupar(filas, BANDAS_SO2, 'so2Banda');
  const conDato = filas.length - sinDato.length;

  const pie = document.getElementById('chSo2Pie');
  if (!conDato){
    vacio('chSo2', 'Ningun lote activo tiene SO2 libre y pH cargados a la vez, que es lo que hace falta para calcular el objetivo.');
    if (pie) pie.innerHTML = `${filas.length} lotes activos, ninguno con SO2 evaluable.`;
    return;
  }

  pintar('chSo2', {
    type: 'bar',
    data: {
      labels: grupos.map(g => g.etiqueta),
      datasets: [{
        data: grupos.map(g => g.lotes.length),
        backgroundColor: grupos.map(g => conAlpha(colorRiesgo(g.riesgo), .82)),
        hoverBackgroundColor: grupos.map(g => colorRiesgo(g.riesgo)),
        borderRadius: 7,
        borderSkipped: false,
        maxBarThickness: 62,
      }],
    },
    options: {
      responsive: true,
      onClick: (_e, els) => {
        if (!els.length) return;
        const g = grupos[els[0].index];
        mostrarDrill('chSo2Drill', 'so2-' + g.id, `SO2 — ${g.etiqueta}`, g.lotes);
      },
      onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      scales: { x: ejeX(), y: ejeY('lotes') },
      plugins: {
        tooltip: {
          callbacks: {
            title: it => grupos[it[0].dataIndex].etiqueta,
            label: it => {
              const g = grupos[it.dataIndex];
              const n = g.lotes.length;
              return [`${n} lote${n !== 1 ? 's' : ''}`, g.ayuda, n ? 'Clic para ver los lotes' : ''];
            },
          },
        },
      },
    },
  });

  const enDeficit = grupos.filter(g => g.id.startsWith('deficit')).reduce((s, g) => s + g.lotes.length, 0);
  if (pie){
    pie.innerHTML = enDeficit
      ? `<b>${enDeficit}</b> lote${enDeficit !== 1 ? 's' : ''} por debajo del objetivo.` +
        (sinDato.length ? ` ${sinDato.length} sin datos suficientes.` : '')
      : 'Todos los lotes evaluables llegan al objetivo.' +
        (sinDato.length ? ` ${sinDato.length} sin datos suficientes.` : '');
  }
}

/* ======================================= 3. DISPERSION pH / SO2 MOLECULAR */

/* Factor de Henderson-Hasselbalch: libre = molecular * (1 + 10^(pH - pKa)).
 * El 1.8 es el mismo pKa de so2Molecular() en dash-metricas.js (espejo del
 * motor): si alguna vez cambia alla, cambia aca o la linea y los puntos
 * dejarian de hablar del mismo molecular. */
const factorHH = ph => 1 + Math.pow(10, ph - 1.8);

/**
 * Nube de lotes en el plano (pH, SO2 molecular) con el objetivo encima.
 *
 * El molecular es la fraccion que protege al vino, y es lo que el criterio
 * fija de verdad: el SO2 libre objetivo sale de el. Mirado en molecular el
 * objetivo es una linea casi plana (so2_molecular_objetivo) y se lee de un
 * vistazo quien esta abajo, sin tener que seguir una exponencial. La linea
 * solo sube a pH bajo, donde manda el piso de SO2 libre: ahi el objetivo en
 * molecular es piso / factor, mas alto que el molecular nominal.
 *
 * La linea se dibuja con los criterios por defecto; los lotes con override
 * caen igual en su banda de color, que se calcula lote por lote contra SU
 * objetivo. Por eso el color, y no la posicion contra la linea, es la verdad
 * de cada punto.
 */
export function graficoDispersion(filas, eff){
  const pts = filas.filter(f => !f.so2NoAplica && f.phSo2 !== null && f.so2Molec !== null);
  const pie = document.getElementById('chNubePie');

  if (pts.length < 2){
    vacio('chNube', 'Hacen falta al menos dos lotes con pH y SO2 libre cargados para dibujar la nube.');
    if (pie) pie.innerHTML = '';
    return;
  }

  const phs = pts.map(p => p.phSo2);
  const phMin = Math.max(2.8, Math.min(...phs) - .06);
  const phMax = Math.min(4.4, Math.max(...phs) + .06);

  /* 40 puntos: donde el piso manda la linea es una curva, y tiene que verse
   * como curva y no como poligonal en el ancho que tiene el panel. */
  const curva = [];
  for (let i = 0; i <= 40; i++){
    const ph = phMin + (phMax - phMin) * i / 40;
    const libre = objetivoSo2Libre(ph, eff);
    if (libre !== null) curva.push({ x: ph, y: libre / factorHH(ph) });
  }

  /* Un dataset por banda: asi la leyenda de colores del panel de SO2 y la de
   * la nube significan lo mismo, y el tooltip no tiene que adivinar el color. */
  const porBanda = BANDAS_SO2.map((b, i) => ({
    banda: b,
    puntos: pts.filter(p => p.so2Banda === i),
  })).filter(g => g.puntos.length);

  const dec = (v, d) => Number(v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });

  pintar('chNube', {
    data: {
      datasets: [
        {
          type: 'line',
          label: 'SO2 molecular objetivo',
          data: curva,
          parsing: false,
          borderColor: tok('--accent', '#8a3340'),
          borderWidth: 1.75,
          borderDash: [5, 4],
          pointRadius: 0,
          tension: .35,
          order: 10,
        },
        ...porBanda.map(g => ({
          type: 'scatter',
          label: g.banda.etiqueta,
          data: g.puntos.map(p => ({ x: p.phSo2, y: p.so2Molec, lote: p })),
          parsing: false,
          backgroundColor: conAlpha(colorRiesgo(g.banda.riesgo), .72),
          borderColor: colorRiesgo(g.banda.riesgo),
          borderWidth: 1,
          pointRadius: 4.5,
          pointHoverRadius: 7,
          order: 1,
        })),
      ],
    },
    options: {
      responsive: true,
      onClick: (_e, els, gr) => {
        /* El punto se busca en los datos por (dataset, indice) y no por
         * els[0].element.$context: $context es interno de Chart.js y cambia
         * entre versiones menores. datasetIndex/index son parte de la API
         * publica de getElementsAtEventForMode desde v2. */
        if (!els.length) return;
        const { datasetIndex, index } = els[0];
        const d = gr.data.datasets[datasetIndex]?.data[index];
        if (d && d.lote) window.dispatchEvent(new CustomEvent('lotes:ir', { detail: d.lote.lote }));
      },
      onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      scales: {
        x: {
          type: 'linear', min: phMin, max: phMax,
          grid:   { color: tok('--line-soft', '#efece4'), drawTicks: false },
          border: { color: tok('--line', '#e7e3da') },
          ticks:  { padding: 4, callback: v => dec(v, 2) },
          title:  { display: true, text: 'pH', color: tok('--muted', '#8c857b'), font: { size: 10.5 } },
        },
        /* El molecular se mueve entre 0 y 2 mg/L: el precision:0 del eje comun
         * dejaria tres rayas enteras y todos los puntos aplastados abajo. */
        y: { ...ejeY('SO2 molecular (mg/L)'), beginAtZero: true,
             ticks: { padding: 6, callback: v => dec(v, 1) } },
      },
      plugins: {
        legend: {
          display: true, position: 'bottom', align: 'start',
          labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle',
                    padding: 11, font: { size: 10.5 } },
        },
        tooltip: {
          callbacks: {
            title: it => it[0].raw.lote ? 'Lote ' + it[0].raw.lote.lote : 'Objetivo',
            label: it => {
              const p = it.raw.lote;
              if (!p) return `pH ${dec(it.raw.x, 2)} → molecular objetivo ${dec(it.raw.y, 2)} mg/L`;
              const n = (v, d = 1) => v === null ? '—' : dec(v, d);
              return [
                p.variedad,
                `pH ${n(p.phSo2, 2)} · SO2 molecular ${n(p.so2Molec, 2)} mg/L`,
                `SO2 libre ${n(p.so2)} mg/L · objetivo ${n(p.so2Objetivo)} mg/L (${p.so2Delta >= 0 ? '+' : ''}${n(p.so2Delta)})`,
                'Clic para abrir la ficha',
              ];
            },
          },
        },
      },
    },
  });

  if (pie){
    const bajo = pts.filter(p => p.so2Delta !== null && p.so2Delta < 0).length;
    pie.innerHTML = `Cada punto es un lote; la linea punteada es el SO2 molecular objetivo a ese pH ` +
      `(sube a pH bajo, donde manda el piso de SO2 libre). <b>${bajo}</b> de ${pts.length} caen por debajo.`;
  }
}

/* ============================================================ 4. HEATMAP */

/** Paso 1..5 de la escala del heatmap (0 = celda vacia). */
function paso(n, max){
  if (!n) return 0;
  if (max <= 1) return 3;
  return Math.min(5, Math.max(1, Math.ceil(n * 5 / max)));
}

/**
 * Matriz variedad x tipo de alarma. Responde "donde se concentra el problema",
 * que es una pregunta distinta de "cuantos problemas hay": doce lotes con AV
 * alta repartidos entre ocho variedades es ruido de la vendimia, y doce todos
 * de la misma variedad es una partida con un problema.
 */
export function pintarHeatmap(hm, contenedorId){
  const cont = document.getElementById(contenedorId);
  if (!cont) return;

  if (!hm.filas.length || !hm.maxCelda){
    cont.innerHTML = '<div class="ch-empty">Ningun lote activo tiene alarmas: no hay nada que agrupar.</div>';
    return;
  }

  /* Cada columna publica su propio maximo: la escala de color se normaliza por
   * columna (ver heatmapVariedadAlarma) y sin ese numero el tono no seria
   * interpretable. */
  let html = '<div class="hm-wrap"><table class="hm"><thead><tr><th scope="col"></th>' +
    hm.columnas.map((c, i) => `<th scope="col">${esc(c)}` +
      (hm.maxPorColumna[i] ? `<span class="hm-max">máx ${hm.maxPorColumna[i]}</span>` : '') +
      '</th>').join('') +
    '<th scope="col">Lotes</th></tr></thead><tbody>';

  hm.filas.forEach((f, iF) => {
    html += `<tr><th scope="row" title="${escA(f.variedad)}">${esc(f.variedad)}</th>`;
    f.celdas.forEach((c, iC) => {
      const p = paso(c.n, hm.maxPorColumna[iC]);
      const tit = c.n
        ? `${f.variedad} · ${hm.columnas[iC]}: ${c.n} de ${f.lotesTotal} lotes ` +
          `(la variedad mas afectada en esta columna tiene ${hm.maxPorColumna[iC]})`
        : `${f.variedad} · ${hm.columnas[iC]}: sin alarmas`;
      html += `<td class="hm-c"><button type="button" class="hm-cell v${p}" ` +
              `data-hm="${escA(iF + ':' + iC)}" title="${escA(tit)}" ` +
              `${c.n ? '' : 'disabled '}>${c.n || '·'}</button></td>`;
    });
    html += `<td class="hm-c" style="text-align:right;color:var(--muted);` +
            `font-variant-numeric:tabular-nums;padding-left:8px">${f.lotesTotal}</td></tr>`;
  });

  html += '</tbody></table></div>' +
    '<div class="hm-leyenda"><span>menos</span>' +
    [1, 2, 3, 4, 5].map(i => `<span class="sw hm-cell v${i}"></span>`).join('') +
    '<span>mas</span><span style="margin-left:auto">El color compara dentro de cada columna, ' +
    'no entre columnas' +
    (hm.ocultas ? ` · ${hm.ocultas} variedad${hm.ocultas !== 1 ? 'es' : ''} mas, con menos alarmas` : '') +
    '</span></div>' +
    '<div class="ch-drill" id="chHmDrill" style="display:none"></div>';

  cont.innerHTML = html;

  /* onclick y no addEventListener: el contenedor sobrevive a cada re-render
   * del dashboard (solo se le reemplaza el innerHTML), asi que un
   * addEventListener por render iria apilando handlers y al cuarto guardado
   * un clic abriria y cerraria el cajon cuatro veces. Asignar la propiedad
   * pisa el handler anterior por definicion. */
  cont.onclick = e => {
    const btn = e.target.closest('[data-hm]');
    if (!btn) return;
    const [iF, iC] = btn.dataset.hm.split(':').map(Number);
    const fila = hm.filas[iF];
    const celda = fila && fila.celdas[iC];
    if (!celda || !celda.n) return;
    cont.querySelectorAll('.hm-cell.sel').forEach(b => b.classList.remove('sel'));
    const yaEstaba = document.getElementById('chHmDrill');
    const clave = iF + ':' + iC;
    if (!yaEstaba || yaEstaba.dataset.clave !== clave) btn.classList.add('sel');
    mostrarDrill('chHmDrill', clave, `${fila.variedad} · ${hm.columnas[iC]}`, celda.lotes);
  };
}

/* ---------------------------------------------------------------- arranque */

/** Aplica los defaults de Chart.js. Idempotente. */
export function prepararGraficos(){
  baseChart();
  return !!window.Chart;
}
