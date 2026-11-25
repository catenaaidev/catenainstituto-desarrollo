/* Muestreo de los colores con significado de Lotes (estética unificada, Etapa 2).
 *
 * NO es un script de Node: se pega en la consola del navegador (o se corre con
 * javascript_tool) con /lotes/ abierto y los datos ya cargados. Devuelve un
 * texto JSON {muestra: valor}. Antes y después de cada cambio de estilo tiene
 * que dar IDÉNTICO.
 *
 * Cada muestra se arma como un fragmento suelto dentro del contenedor que
 * piden sus reglas (#tab-analisis, #tab-agenda…), se lee el estilo calculado
 * y se saca: no depende de qué datos haya ni de qué filas tenga dibujadas una
 * tabla virtual. Si se agrega un color con significado nuevo, se agrega acá. */
await (async () => {
  const T = (id, filas) => `<table${id ? ` id="${id}"` : ''}><tbody>${filas}</tbody></table>`;
  const BG = ['background-color'], C = ['color'], BGC = ['background-color', 'color'];
  // [nombre, contenedor, html, selector a leer, propiedades, pseudo]
  const M = [
    // Análisis
    ['an.dentro', '#tab-analisis', T('tAnalisis', '<tr><td class="dentro"><input class="cell"></td></tr>'), 'td', BG],
    ['an.dentro.input', '#tab-analisis', T('tAnalisis', '<tr><td class="dentro"><input class="cell"></td></tr>'), 'input', BGC],
    ['an.fuera', '#tab-analisis', T('tAnalisis', '<tr><td class="fuera"><input class="cell"></td></tr>'), 'td', BG],
    ['an.fuera.input', '#tab-analisis', T('tAnalisis', '<tr><td class="fuera"><input class="cell"></td></tr>'), 'input', BGC],
    ['an.dentro.gsel', '#tab-analisis', T('tAnalisis', '<tr><td class="dentro gsel"></td></tr>'), 'td', BG],
    ['an.fuera.gsel', '#tab-analisis', T('tAnalisis', '<tr><td class="fuera gsel"></td></tr>'), 'td', BG],
    ['an.sep.ok', '#tab-analisis', T('tAnalisis', '<tr class="analisis-separador ok"><td>x</td></tr>'), 'td', BG],
    ['an.sep.mal', '#tab-analisis', T('tAnalisis', '<tr class="analisis-separador mal"><td>x</td></tr>'), 'td', BG],
    ['an.agregado', '#tab-analisis', T('tAnalisis', '<tr class="fila-agregado"><td data-k="agregado_txt">x</td></tr>'), 'td', ['background-color', 'color', 'font-weight']],
    // Lotes
    ['lo.crit', '#tab-lotes', T('', '<tr class="crit"><td>a</td><td>b</td></tr>'), 'td:last-child', BG],
    ['lo.crit.franja', '#tab-lotes', T('', '<tr class="crit"><td>a</td></tr>'), 'td', ['box-shadow']],
    ['lo.venc', '#tab-lotes', T('', '<tr class="venc"><td>a</td><td>b</td></tr>'), 'td:last-child', BG],
    ['lo.venc.franja', '#tab-lotes', T('', '<tr class="venc"><td>a</td></tr>'), 'td', ['box-shadow']],
    ['lo.org', '#tab-lotes', T('', '<tr class="org"><td>a</td></tr>'), 'td', BG],
    ['lo.vacio', '#tab-lotes', T('', '<tr class="vacio"><td>a</td></tr>'), 'tr', ['opacity']],
    ['lo.nuevo', '#tab-lotes', T('tLotes', '<tr class="nuevo"><td>a</td></tr>'), 'td', ['border-top-color', 'border-top-width']],
    ['lo.crit.lote', '#tab-lotes', T('tLotes', '<tr class="crit"><td data-k="lote">1</td></tr>'), 'td', BG],
    ['lo.venc.lote', '#tab-lotes', T('tLotes', '<tr class="venc"><td data-k="lote">1</td></tr>'), 'td', BG],
    ['lo.org.lote', '#tab-lotes', T('tLotes', '<tr class="org"><td data-k="lote">1</td></tr>'), 'td', BG],
    // Leyendas
    ...['crit', 'venc'].map((k) => [`ley.${k}`, '#tab-lotes', `<div class="legend-inline"><span class="sw ${k}"></span></div>`, 'span', ['background-color', 'border-left-color']]),
    ...['org', 'dentro', 'fuera', 'sep-mal'].map((k) => [`ley.${k}`, '#tab-lotes', `<div class="legend-inline"><span class="sw ${k}"></span></div>`, 'span', ['background-color', 'border-top-color']]),
    ['ley.vacio', '#tab-lotes', '<div class="legend-inline"><span class="sw vacio"></span></div>', 'span', ['opacity']],
    // Dashboard
    ...['ok', 'warn', 'bad'].map((k) => [`kpi.${k}.val`, '#tab-dashboard', `<div class="kpi-card kpi-${k}"><div class="kpi-val">1</div></div>`, '.kpi-val', C]),
    ...['ok', 'warn', 'bad', 'neutral'].map((k) => [`kpi.${k}.riel`, '#tab-dashboard', `<div class="kpi-card kpi-${k}"></div>`, '.kpi-card', BG, '::before']),
    ['faq.hi', '#tab-dashboard', '<div class="faq-item hi"><div class="faq-n">1</div></div>', '.faq-n', C],
    ...[0, 1, 2, 3, 4, 5].map((v) => [`hm.v${v}`, '#tab-dashboard', `<button class="hm-cell v${v}">1</button>`, 'button', BGC]),
    // Ficha y seguimiento
    ...['', 'media', 'baja', 'cerrado'].map((k) => [`avance.${k || 'alta'}`, '#tab-ficha', `<div class="barra ${k}"><span></span></div>`, 'span', BG]),
    ...['ok', 'falta', 'na'].map((k) => [`hito.${k}`, '#tab-ficha', `<div class="hito ${k}">x</div>`, 'div', C]),
    ...['ingreso', 'movimiento', 'analisis', 'correccion', 'etapa', 'agregado'].map((k) => [`linea.${k}`, '#tab-ficha', `<ul class="timeline"><li class="${k}">x</li></ul>`, 'li', BG, '::before']),
    ...['finalizada', 'no_finalizada', 'excluida'].map((k) => [`est.${k}`, '#tab-dashboard', `<span class="est-${k}">x</span>`, 'span', BGC]),
    ['prox.venc', '#tab-dashboard', '<span class="prox-venc">x</span>', 'span', C],
    ['prox.ok', '#tab-dashboard', '<span class="prox-ok">x</span>', 'span', C],
    ...['hi', 'pos'].map((k) => [`so2box.${k}`, '#tab-so2', `<div class="so2-result-box ${k}"><div class="so2-val">1</div></div>`, '.so2-val', C]),
    // Tablero FML
    ...['ok', 'mal', 'neutro'].map((k) => [`tb.chip.${k}`, '#tab-tablero', `<span class="tb-chip ${k}">x</span>`, 'span', BGC]),
    ...['ok', 'mal', 'neutro'].map((k) => [`tb.cuadro.${k}`, '#tab-tablero', `<button class="tb-cuadro ${k}"></button>`, 'button', BG]),
    ['tb.pct', '#tab-tablero', '<div class="tb-tarjeta"><div class="tb-pct">1</div></div>', '.tb-pct', C],
    ['tb.tarjeta.hi', '#tab-tablero', '<div class="tb-tarjeta hi"><div class="tb-pct">1</div></div>', '.tb-tarjeta', BGC],
    ['tb.tarjeta.hi.pct', '#tab-tablero', '<div class="tb-tarjeta hi"><div class="tb-pct">1</div></div>', '.tb-pct', C],
    ['tb.toggle.on', '#tab-tablero', '<div class="tb-toggle"><button class="active">x</button></div>', 'button', BGC],
    // Movimientos
    ['mov.pendiente', '#tab-movimientos', T('tMov', '<tr class="fila-pendiente"><td>x</td></tr>'), 'tr', BG],
    ['mov.pendiente.tag', '#tab-movimientos', '<span class="tag mov-pendiente">x</span>', 'span', ['color', 'border-top-color']],
    ['mov.merma.llena', '#tab-movimientos', T('', '<tr class="mer-llena"><td>x</td></tr>'), 'td', C],
    ['inv.estado.ot', '#tab-movimientos', '<span class="inv-estado inv-ot">x</span>', 'span', C],
    ['inv.estado.medicion', '#tab-movimientos', '<span class="inv-estado inv-medicion">x</span>', 'span', C],
    ['inv.chip', '#tab-movimientos', '<span class="inv-chip">x</span>', 'span', ['background-color', 'border-top-color']],
    ['inv.chip.excede', '#tab-movimientos', '<span class="inv-chip inv-chip-excede">x</span>', 'span', ['background-color', 'border-top-color']],
    ['inv.aviso', '#tab-movimientos', '<table class="inv-tabla"><tbody><tr class="inv-con-aviso"><td>x</td></tr></tbody></table>', 'tr', BG],
    // Agenda
    ...['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'tr'].map((k) => [`ag.punto.${k}`, '#tab-agenda', `<span class="ag-p ${k}"></span>`, 'span', BG]),
    ...['alta', 'media', 'baja'].map((k) => [`ag.tarj.${k}`, '#tab-agenda', `<div class="ag-tarj pr-${k}">x</div>`, 'div', ['border-left-color']]),
    ...['alta', 'media', 'baja'].map((k) => [`ag.prio.${k}`, '#tab-agenda', `<div class="pr-${k}"><span class="ag-punto"></span></div>`, 'span', BG]),
    ...['p1', 'p2', 'p3', 'p4'].map((k) => [`ag.ficha.${k}`, '#tab-agenda', `<span class="ag-ficha ${k}">x</span>`, 'span', BG]),
    ['ag.ficha.p5', '#tab-agenda', '<span class="ag-ficha p5">x</span>', 'span', C],
    ['ag.carga', '#tab-agenda', '<div class="ag-carga"><i></i></div>', 'i', BG],
    ['ag.carga.exc', '#tab-agenda', '<div class="ag-carga exc"><i></i></div>', 'div', C],
    ['ag.carga.exc.barra', '#tab-agenda', '<div class="ag-carga exc"><i></i></div>', 'i', BG],
    ['ag.ronda', '#tab-agenda', '<div class="ag-ronda">x</div>', 'div', BG],
    ['ag.hoy', '#tab-agenda', '<div class="ag-dia hoy"><div class="ag-cab"><b>1</b></div></div>', '.ag-dia', ['border-top-color', 'box-shadow']],
    ['ag.hoy.num', '#tab-agenda', '<div class="ag-dia hoy"><div class="ag-cab"><b>1</b></div></div>', 'b', C],
    ['ag.feriado', '#tab-agenda', '<span class="ag-fer">x</span>', 'span', C],
    // Correcciones, cruce y confirmación de OT
    ['so2.anulada', '#tab-so2', T('', '<tr class="so2-anulada"><td>x</td></tr>'), 'td', ['opacity', 'text-decoration-line']],
    ['so2.anulada.sello', '#tab-so2', '<span class="so2-anulada-sello">x</span>', 'span', C],
    ...['alta', 'media', 'baja', 'ok'].map((k) => [`cruce.${k}`, '#tab-cruce', T('', `<tr class="cruce-${k}"><td>x</td></tr>`), 'td', BG]),
    ['otc.coincide', 'body', '<span class="otc-coincide">x</span>', 'span', C],
    ['otc.difiere', 'body', '<span class="otc-difiere">x</span>', 'span', C],
    ['otc.aviso', 'body', '<div class="otc-aviso">x</div>', 'div', C],
    ['otc.revisar', 'body', T('', '<tr class="otc-revisar"><td>x</td></tr>'), 'td', BG],
  ];
  const out = {};
  for (const [nombre, cont, html, sel, props, pseudo] of M) {
    const caja = document.createElement('div');
    caja.setAttribute('data-muestreo', '');
    caja.innerHTML = html;
    (document.querySelector(cont) || document.body).appendChild(caja);
    const el = caja.querySelector(sel) || caja.firstElementChild;
    const cs = getComputedStyle(el, pseudo || null);
    out[nombre] = props.map((p) => cs.getPropertyValue(p)).join(' | ');
    caja.remove();
  }
  const raiz = getComputedStyle(document.documentElement);
  for (const t of ['--sc-0', '--sc-1', '--sc-2', '--sc-3', '--sc-4', '--tb-ok-bg', '--tb-ok-fg', '--tb-mal-bg', '--tb-mal-fg',
    '--tb-neu-bg', '--tb-neu-fg', '--tb-primario', '--tb-fondo', '--tb-panel', '--tb-linea', '--tb-tinta']) {
    out['token' + t] = raiz.getPropertyValue(t).trim().toLowerCase();
  }
  if (window.Chart) for (const id of ['chAv', 'chSo2', 'chNube']) {
    const c = window.Chart.getChart(id);
    out['grafico.' + id] = c
      ? JSON.stringify(c.data.datasets.map((d) => [d.label, d.borderColor, d.backgroundColor, d.pointBackgroundColor]))
      : 'sin dibujar';
  }
  return JSON.stringify(out, null, 1);
})();
