/* Muestreo de los colores con significado de Barriles (estética unificada, Etapa 3).
 *
 * NO es un script de Node: se pega en la consola del navegador (o se corre con
 * javascript_tool) con /barriles/?rol=admin abierto y los datos ya cargados.
 * Devuelve un texto JSON {muestra: valor}. Antes y después de cada cambio de
 * estilo tiene que dar IDÉNTICO.
 *
 * Dos clases de muestra: fragmentos sueltos que se arman, se leen y se sacan
 * (no dependen de los datos), y elementos que ya están en la página (por id),
 * a los que se les pone un momento la clase a medir y se les devuelve la suya.
 * Los colores escritos en el JS (3D, cámara) los cuida test/barriles-colores-js.
 * Si se agrega un color con significado nuevo, se agrega acá. */
await (async () => {
  const out = {};
  const leer = (nombre, el, props, pseudo) => {
    const cs = getComputedStyle(el, pseudo || null);
    out[nombre] = props.map((p) => cs.getPropertyValue(p)).join(' | ');
  };
  const frag = (nombre, cont, html, sel, props, pseudo) => {
    const caja = document.createElement('div');
    caja.setAttribute('data-muestreo', '');
    caja.innerHTML = html;
    (document.querySelector(cont) || document.body).appendChild(caja);
    leer(nombre, caja.querySelector(sel) || caja.firstElementChild, props, pseudo);
    caja.remove();
  };
  // clases === null: se lee tal cual; si no, se le pone ESA clase (className entero) y se devuelve la suya.
  const enPagina = (nombre, sel, clases, props, pseudo) => {
    const el = document.querySelector(sel);
    if (!el) { out[nombre] = 'NO ESTÁ'; return; }
    const antes = el.className;
    if (clases !== null) el.className = clases;
    leer(nombre, el, props, pseudo);
    el.className = antes;
  };
  const BG = ['background-color'], C = ['color'], BGC = ['background-color', 'color'];
  const BGBD = ['background-color', 'border-top-color'], MARCO = ['border-top-color', 'box-shadow'];

  // ---- Mapa 2D ----
  const celda = (k) => `<div class="grilla"><div class="celda ${k}"><span class="num">1</span><span class="lote">2</span></div></div>`;
  frag('mapa.grilla', 'body', celda(''), '.grilla', BG);
  frag('mapa.celda', 'body', celda(''), '.celda', ['background-color', 'color', 'border-top-color']);
  frag('mapa.libre', 'body', celda('libre'), '.celda', ['background-image', 'color']);
  frag('mapa.hueco', 'body', celda('hueco'), '.celda', ['background-color', 'color', 'font-style']);
  frag('mapa.resaltada', 'body', celda('resaltada'), '.celda', MARCO);
  frag('mapa.atenuada', 'body', celda('atenuada'), '.celda', ['opacity']);
  frag('mapa.cursor', 'body', celda('cursor-scan'), '.celda', ['border-top-color', 'border-top-style']);
  frag('mapa.destino', 'body', celda('destino-libre'), '.celda', MARCO);
  for (const l of ['26320', '25006', '24180', '25832-T50', '']) out['colorLote.' + (l || 'vacio')] = colorLote(l);
  document.querySelectorAll('#panel-mapa .ayuda .muestra-celda').forEach((el, i) => leer('ayuda.muestra' + i, el, ['background-image', 'background-color', 'color']));

  // ---- Vista 3D ----
  enPagina('3d.fondo', '#cont3d', null, ['background-image']);
  enPagina('3d.vacio', '#vacio3d', null, C);
  enPagina('3d.tooltip', '#tooltip3d', null, BGC);
  frag('3d.tooltip.b', '#tooltip3d', '<b>1</b>', 'b', C);

  // ---- Escáner ----
  for (const k of ['ok', 'err', 'aviso']) {
    frag('fb.' + k, 'body', `<div class="fb-libre ${k}">x</div>`, 'div', BGBD);
    enPagina('escFeedback.' + k, '#escFeedback', k, BGBD);
  }
  frag('inp.error', 'body', '<input class="inp-libre error">', 'input', BGBD);
  enPagina('escResumen', '#escResumen', '', BGBD);
  enPagina('escResumen.revisar', '#escResumen', 'revisar', BGBD);
  {
    const r = document.querySelector('#escResumen'), v = r.className;
    r.className = ''; frag('escResumen.num', '#escResumen', '<div class="esc-res-num">1</div>', 'div', C);
    r.className = 'revisar'; frag('escResumen.revisar.num', '#escResumen', '<div class="esc-res-num">1</div>', 'div', C);
    r.className = v;
  }
  frag('escResumen.aviso', 'body', '<ul class="esc-res-avisos"><li>x</li></ul>', 'li', ['background-color', 'border-left-color']);
  frag('esc.detalle', 'body', '<div class="esc-res-detalle">x</div>', 'div', C);
  frag('esc.vencida', 'body', '<button class="btn esc-vencida">x</button>', 'button', ['opacity', 'filter']);
  frag('esc.contador', 'body', '<span class="esc-contador">1</span>', 'span', BGC);
  enPagina('escInstr', '#escInstrucciones', null, BGBD);
  frag('escInstr.h2', '#escInstrucciones', '<h2>x</h2>', 'h2', C);
  frag('escInstr.b', '#escInstrucciones', '<b>x</b>', 'b', C);

  // ---- Cámaras ----
  for (const id of ['escMarcoCam', 'barMarcoCam', 'paletMarcoCam', 'marcoCamara']) enPagina('cam.' + id, '#' + id, '', MARCO);
  for (const id of ['escMarcoCam', 'barMarcoCam', 'paletMarcoCam']) enPagina('cam.' + id + '.ok', '#' + id, 'ok', MARCO);
  enPagina('cam.barMarcoCam.lote', '#barMarcoCam', 'lote', ['border-top-color']);
  enPagina('cam.pieCamara.esperando', '#pieCamara', 'esperando', ['box-shadow']);
  for (const id of ['overlayCamara', 'overlayCamaraEsc', 'overlayCamaraBar', 'overlayCamaraPalet']) enPagina('cam.' + id, '#' + id, null, BG);
  for (const id of ['escPieCam', 'barPieCam', 'paletPieCam', 'pieCamara']) enPagina('cam.' + id, '#' + id, null, BGC);
  for (const id of ['cabeceraCamara', 'escCabeceraCam', 'barCabeceraCam', 'paletCabeceraCam']) enPagina('cam.' + id, '#' + id, null, ['background-image', 'color']);
  for (const id of ['barBtnCapturar', 'barBtnTipear', 'barBtnCancelarPar', 'barBtnCerrarCam', 'barBtnConfirmarLote', 'barBtnVaciaCam', 'barBtnTipearTanque',
    'btnCerrarCamara', 'btnSaltarCamara', 'btnConfirmarCam', 'btnReintentarCam', 'btnTipearCam', 'escBtnTipearCam', 'escBtnCerrarCam', 'paletBtnCerrarCam']) {
    enPagina('btn.' + id, '#' + id, null, BGC);
  }
  frag('cam.tipear.ok', '#escPieCam', '<div class="cam-tipear abierto"><button class="ok">1</button><button class="cancel">2</button></div>', '.ok', BGC);
  frag('cam.tipear.cancel', '#escPieCam', '<div class="cam-tipear abierto"><button class="ok">1</button><button class="cancel">2</button></div>', '.cancel', BGC);
  frag('cam.candidato', '#barCandidatos', '<button>1</button>', 'button', ['background-color', 'color', 'border-top-color']);
  frag('cam.candidato.elegido', '#barCandidatos', '<button class="elegido">1</button>', 'button', BGC);
  frag('cam.paso', '#barPieCam', '<span class="bar-paso">1</span>', 'span', BGC);
  frag('cam.paso.f2', '#barPieCam', '<span class="bar-paso f2">1</span>', 'span', BGC);
  frag('cam.rotulo', '#escCabeceraCam', '<button class="cam-btn-rotulo">x</button>', 'button', BGC);
  frag('cam.lista', '#escListaCam', '<span>1</span>', 'span', BGC);
  frag('cam.nBarril', '#escResCam', '<span class="n-barril">1</span>', 'span', ['font-size', 'font-weight']);

  // ---- Modo por lote ----
  {
    const tenia = document.body.classList.contains('modo-lote');
    document.body.classList.add('modo-lote');
    enPagina('lote.toggle', '#toggleModoLote', null, ['background-color', 'border-top-color', 'color']);
    enPagina('lote.chip', '#chipModoLote', null, BGC);
    if (!tenia) document.body.classList.remove('modo-lote');
  }

  // ---- Inventario, altas, pedidos, historial ----
  for (const k of ['lleno', 'vacio', 'mermo', 'tanque', 'barrica', 'revisar', 'revisado']) frag('pill.' + k, 'body', `<span class="pildora p-${k}">x</span>`, 'span', BGC);
  frag('inv.filaRevisar', 'body', '<table><tbody><tr class="fila-revisar"><td>x</td></tr></tbody></table>', 'td', BG);
  frag('inv.motivoRevisar', 'body', '<div class="motivo-revisar">x</div>', 'div', C);
  frag('inv.motivoEdicion', 'body', '<div class="motivo-edicion">x</div>', 'div', C);
  for (const k of ['tanque', 'lote']) frag('ped.' + k, 'body', `<span class="ped-tipo ${k}">x</span>`, 'span', BGC);
  for (const k of ['on', 'off']) frag('marca.' + k, 'body', `<button class="btn marca marca-${k}">x</button>`, 'button', ['background-color', 'color', 'border-top-color']);
  frag('alta.malo', 'body', '<div id="altaPrevio" class="malo">x</div>', 'div', BGC);
  frag('baja.malo', 'body', '<div id="bajaPrevio" class="malo">x</div>', 'div', BGC);
  frag('btn.peligro', 'body', '<button class="btn peligro">x</button>', 'button', BG);
  frag('ped.aviso', 'body', '<div class="ped-aviso">x</div>', 'div', C);
  enPagina('btn.escBtnGuardar', '#escBtnGuardar', null, BGC);
  enPagina('btn.barBtnAsociar', '#barBtnAsociar', null, BGC);
  enPagina('inv.barResumen', '#barResumen', null, BGBD);

  // ---- Registro (también es papel) ----
  const reg = (k) => `<div class="reg-tarjeta ${k}"><div class="reg-cabeza"><span class="reg-lote">1</span><span class="reg-tipo">x</span></div>` +
    '<div class="reg-datos">x</div><div class="reg-barriles"><button class="reg-barril">1</button><button class="reg-barril reg-hit">2</button></div></div>';
  for (const k of ['', 'reg-llenado', 'reg-vaciado', 'reg-mixto']) {
    frag('reg.tarjeta.' + (k || 'base'), 'body', reg(k), '.reg-tarjeta', ['border-top-color', 'background-color']);
    frag('reg.tipo.' + (k || 'base'), 'body', reg(k), '.reg-tipo', BGC);
  }
  frag('reg.conBarril', 'body', reg('reg-con-barril'), '.reg-tarjeta', ['box-shadow']);
  frag('reg.lote', 'body', reg(''), '.reg-lote', C);
  frag('reg.datos', 'body', reg(''), '.reg-datos', C);
  frag('reg.barril', 'body', reg(''), '.reg-barril', BGBD);
  frag('reg.hit', 'body', reg(''), '.reg-hit', BGBD);
  for (const k of ['', 'LLENO', 'MERMO']) frag('reg.estado.' + (k || 'VACIO'), 'body', `<span class="reg-estado ${k}">x</span>`, 'span', BGC);

  // ---- Rótulos (cartel del color de etiqueta) ----
  for (const k of ['verde', 'blanca', 'nose', 'buscando']) frag('rot.' + k, 'body', `<div class="rot-color rot-${k}"><b>x</b></div>`, 'div', ['background-color', 'color', 'border-top-color']);

  // ---- Cifras y cuentas ----
  for (const k of ['alerta', 'ok']) {
    const h = `<button class="tab-cifra tab-${k}"><span class="tab-valor">1</span></button>`;
    frag('tab.' + k, 'body', h, 'button', ['border-left-color']);
    frag('tab.' + k + '.valor', 'body', h, '.tab-valor', C);
  }
  frag('cuenta.ini', 'body', '<span class="ini-cuenta">2</span>', 'span', BGC);
  frag('cuenta.prog', 'body', '<span class="prog-cuenta">2</span>', 'span', BGC);

  // ---- Velo sin conexión y solo lectura ----
  enPagina('velo', '#veloSinConexion', null, BG);
  const velo = '<div class="caja"><div class="titulo">x</div><p class="pend">x</p><a class="login">x</a></div>';
  frag('velo.caja', '#veloSinConexion', velo, '.caja', ['border-top-color', 'background-color']);
  frag('velo.titulo', '#veloSinConexion', velo, '.titulo', C);
  frag('velo.pend', '#veloSinConexion', velo, '.pend', BG);
  frag('velo.login', '#veloSinConexion', velo, '.login', BGC);
  enPagina('soloLectura', '#avisoSoloLectura', null, ['background-color', 'color', 'border-bottom-color']);

  return JSON.stringify(out, null, 1);
})();
