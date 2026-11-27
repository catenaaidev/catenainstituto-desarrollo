/**
 * Barra de la plataforma: volver al portal, saltar a otro módulo y ver quién
 * sos. La inyecta el servidor en los módulos y en Órdenes, así que ninguna de
 * las apps tuvo que modificarse para tenerla.
 *
 * Letras y colores de Prensas (Plex, tinta #1C1B19 sobre piedra). En el celular
 * (≤ 760 px) el nombre, Contraseña y Salir pasan a un menú "Cuenta" para que la
 * barra no se desborde. Publica su alto en --ciw-h para que los encabezados
 * fijos de cada app se ubiquen debajo.
 *
 * El servidor deja los datos en window.CIW antes de que corra esto.
 */
(function (g) {
  'use strict';

  var NOMBRES = { prensas: 'Prensas', barriles: 'Barriles', lotes: 'Lotes', vendimia: 'Vendimia', ordenes: 'Órdenes de trabajo' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function html(ctx) {
    ctx = ctx || {};
    // En una orden (/lotes/?orden=…, /prensas/?orden=…) se está en Órdenes,
    // aunque la dibuje el módulo: la barra marca Órdenes y el módulo queda enlazado.
    var actual = ctx.enOrden ? 'ordenes' : (ctx.centro || ctx.modulo || '');
    var modulos = ctx.modulos || {};
    var p = ['<a class="inicio" href="/" title="Volver al menú">← Menú</a>', '<span class="sep" aria-hidden="true"></span>'];
    ['prensas', 'barriles', 'lotes', 'vendimia'].forEach(function (m) {
      if (m === actual) p.push('<span class="aqui" aria-current="page">' + NOMBRES[m] + '</span>');
      else if (modulos[m]) p.push('<a href="/' + m + '/">' + NOMBRES[m] + '</a>');
    });
    // Órdenes de trabajo no es un módulo con rol propio: se ve con rol en prensas o lotes.
    if (actual === 'ordenes') p.push('<span class="aqui" aria-current="page">' + NOMBRES.ordenes + '</span>');
    else if (modulos.prensas || modulos.lotes) p.push('<a href="/ordenes/">' + NOMBRES.ordenes + '</a>');
    // Reporte de gerencia: solo en los módulos que lo tienen.
    if (actual === 'prensas' || actual === 'lotes') {
      p.push('<span class="sep ancho" aria-hidden="true"></span>');
      p.push('<a class="ancho" href="/' + actual + '/reporte" target="_blank" rel="noopener" ' +
        'title="Reporte para gerencia, en vivo">Reporte</a>');
    }
    if (actual === 'inventario') p.push('<span class="aqui" aria-current="page">Inventario</span>');
    else if (modulos.barriles || modulos.lotes) p.push('<a href="/inventario/">Inventario</a>');
    var yo = ctx.nombre
      ? esc(ctx.nombre) + (ctx.rol ? ' <span class="rol">' + esc(ctx.rol) + '</span>' : '')
      : '';
    /* Cerrar sesión: /api/auth/logout borra la sesión y la cookie. Hace falta
       sobre todo en las PC compartidas de la bodega, donde si no queda abierta y
       el siguiente que se sienta guarda con el nombre del anterior. */
    p.push('<span class="cuenta-ancho">' +
      (yo ? '<span class="yo">' + yo + '</span>' : '') +
      '<span class="sep" aria-hidden="true"></span>' +
      '<a class="salir" href="/cambiar-clave.html" title="Cambiar tu contraseña">Contraseña</a>' +
      '<a class="salir" href="/api/auth/logout" title="Cerrar sesión y volver al login">Salir</a>' +
      '</span>');
    var menuLinks = (yo ? '<span class="yo">' + yo + '</span>' : '');
    if (actual === 'prensas' || actual === 'lotes') {
      menuLinks += '<a href="/' + actual + '/reporte" target="_blank" rel="noopener">Reporte</a>';
    }
    menuLinks += '<a href="/cambiar-clave.html">Contraseña</a>' +
      '<a href="/api/auth/logout">Salir</a>';
    p.push('<span class="cuenta-cel">' +
      '<button type="button" class="cuenta-btn" aria-expanded="false" aria-controls="ciw-cuenta">Cuenta</button>' +
      '<span class="cuenta-menu" id="ciw-cuenta" hidden>' +
      menuLinks +
      '</span></span>');
    return p.join('');
  }

  // Las vistas originales siguen en su módulo por permisos y por sus APIs.
  // La navegación identifica el centro que contiene la tarea, incluso con un enlace histórico.
  function centroDeVista(modulo, vista) {
    if (modulo === 'lotes') {
      if (['movimientos','correcciones','so2','ordencorr','agregados'].includes(vista)) return 'ordenes';
      if (['inventario-tanques','inventario-vasijas'].includes(vista)) return 'inventario';
    }
    if (modulo === 'barriles' && ['inventario','consulta'].includes(vista)) return 'inventario';
    return '';
  }
  g.CIBarra = { html: html, centroDeVista: centroDeVista };
  if (!g.document) return;   // tests: solo se exporta el armado
  var d = g.document;

  var css =
    "@font-face{font-family:'IBM Plex Sans';src:url('/prensas/fonts/ibm-plex-sans-latin-400-normal.woff2') format('woff2');font-weight:400;font-display:swap}" +
    "@font-face{font-family:'IBM Plex Sans';src:url('/prensas/fonts/ibm-plex-sans-latin-500-normal.woff2') format('woff2');font-weight:500;font-display:swap}" +
    '#ciw-barra{position:sticky;top:0;z-index:1050;display:flex;flex-wrap:wrap;align-items:center;gap:6px;' +
    'padding:6px 16px;background:#1C1B19;color:#ECE8E1;font-size:12.5px;' +
    "font-family:'IBM Plex Sans',system-ui,'Segoe UI',sans-serif;line-height:1.4;min-height:38px;box-sizing:border-box}" +
    '#ciw-barra a{white-space:nowrap;color:#ECE8E1;text-decoration:none;padding:4px 9px;border-radius:2px;transition:background .15s}' +
    '#ciw-barra a:hover{background:rgba(236,232,225,.12)}' +
    '#ciw-barra a:focus-visible,#ciw-barra button:focus-visible{outline:2px solid #ECE8E1;outline-offset:1px}' +
    '#ciw-barra .inicio{border:1px solid rgba(236,232,225,.3)}' +
    '#ciw-barra .sep{width:1px;height:16px;background:rgba(236,232,225,.2);margin:0 4px}' +
    '#ciw-barra .aqui{white-space:nowrap;padding:4px 9px;font-weight:500;box-shadow:inset 0 -2px 0 #ECE8E1}' +
    '#ciw-barra .cuenta-ancho{margin-left:auto;display:flex;align-items:center;gap:4px;white-space:nowrap}' +
    '#ciw-barra .yo{opacity:.75}' +
    '#ciw-barra .rol{opacity:.6;text-transform:uppercase;letter-spacing:1.2px;font-size:9.5px;margin-left:4px}' +
    '#ciw-barra .salir{opacity:.8}' +
    '#ciw-barra .cuenta-cel{display:none;margin-left:auto;position:relative}' +
    '#ciw-barra .cuenta-btn{background:none;border:1px solid rgba(236,232,225,.3);color:#ECE8E1;font:inherit;padding:0 12px;min-height:44px;box-sizing:border-box;border-radius:2px;cursor:pointer}' +
    '#ciw-barra .cuenta-menu{position:absolute;right:0;top:calc(100% + 6px);min-width:200px;background:#1C1B19;border:1px solid rgba(236,232,225,.25);display:flex;flex-direction:column;padding:6px 0}' +
    '#ciw-barra .cuenta-menu[hidden]{display:none}' +
    '#ciw-barra .cuenta-menu .yo{padding:8px 14px;border-bottom:1px solid rgba(236,232,225,.15);margin-bottom:4px}' +
    '#ciw-barra .cuenta-menu a{display:flex;align-items:center;min-height:44px;padding:0 14px;box-sizing:border-box}' +
    '@media (max-width:760px){#ciw-barra{padding:4px 10px;gap:2px}' +
    '#ciw-barra a{display:inline-flex;align-items:center;min-height:44px;padding:0 10px;box-sizing:border-box}' +
    '#ciw-barra .ancho,#ciw-barra .cuenta-ancho{display:none}' +
    '#ciw-barra .cuenta-cel{display:block}}' +
    '@media (max-width:760px){#ciw-barra{flex-wrap:wrap}#ciw-barra .aqui{min-height:44px;display:inline-flex;align-items:center;box-sizing:border-box}#ciw-barra .sep{flex-shrink:0}}' +
    '@media (prefers-reduced-motion:reduce){#ciw-barra a{transition:none}}' +
    '@media print{#ciw-barra{display:none}}';

  var est = d.createElement('style');
  est.textContent = css;
  d.head.appendChild(est);

  var ctx = g.CIW || {};
  if (/[?&]orden=/.test(g.location.search || '')) ctx = Object.assign({}, ctx, { enOrden: true });
  var barra = d.createElement('nav');
  barra.id = 'ciw-barra';
  barra.setAttribute('aria-label', 'Plataforma');
  var centro = '';
  function refrescarCentro(vista) {
    var nuevo = centroDeVista(ctx.modulo, vista);
    if (nuevo === centro && barra.innerHTML) return;
    centro = nuevo;
    barra.innerHTML = html(Object.assign({}, ctx, { centro: centro }));
    publicarAlto();
  }
  function vistaHash() { return (g.location.hash || '').slice(1); }
  refrescarCentro(vistaHash());
  d.addEventListener('ciw:pantalla', function(e) { refrescarCentro(e.detail); });
  g.addEventListener('popstate', function() { refrescarCentro(vistaHash()); });

  function abrirMenu(si) {
    barra.querySelector('.cuenta-menu').hidden = !si;
    barra.querySelector('.cuenta-btn').setAttribute('aria-expanded', si ? 'true' : 'false');
  }
  barra.addEventListener('click', function(e) {
    if (e.target.closest('.cuenta-btn')) { e.stopPropagation(); abrirMenu(barra.querySelector('.cuenta-menu').hidden); }
  });
  d.addEventListener('click', function(e) { var menu = barra.querySelector('.cuenta-menu'); if (!menu.hidden && !menu.contains(e.target)) abrirMenu(false); });
  d.addEventListener('keydown', function(e) { if (e.key === 'Escape' && !barra.querySelector('.cuenta-menu').hidden) { abrirMenu(false); barra.querySelector('.cuenta-btn').focus(); } });

  function publicarAlto() {
    d.documentElement.style.setProperty('--ciw-h', barra.offsetHeight + 'px');
  }

  function montar() {
    if (d.getElementById('ciw-barra')) return;
    d.body.insertBefore(barra, d.body.firstChild);
    publicarAlto();
    if (g.ResizeObserver) new g.ResizeObserver(publicarAlto).observe(barra);
    else g.addEventListener('resize', publicarAlto);
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', montar);
  else montar();
})(globalThis);
