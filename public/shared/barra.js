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
    p.push('<span class="cuenta-ancho">' + (yo ? '<span class="yo">' + yo + '</span>' : '') + '</span>');
    p.push(menuConfiguracion(ctx, actual));
    return p.join('');
  }

  // Solo navegacion: las pantallas, las reglas y los permisos de escritura siguen
  // perteneciendo a sus modulos. El rol global de usuarios es distinto al rol admin de un modulo.
  function menuConfiguracion(ctx, actual) {
    ctx = ctx || {};
    var roles = ctx.modulos || {};
    var permitido = function (m) { return ['admin','editor','lector'].includes(roles[m]); };
    var link = function (url, texto) { return '<a href="' + url + '">' + esc(texto) + '</a>'; };
    var grupo = function (titulo, links) { return '<div class="ciw-ajustes-grupo"><span class="ciw-ajustes-titulo">' + esc(titulo) + '</span>' + links.join('') + '</div>'; };
    var cuenta = [];
    if (ctx.es_admin === true) cuenta.push(link('/admin.html','Usuarios y permisos de acceso'));
    cuenta.push(link('/cambiar-clave.html','Cambiar contraseña'));
    var grupos = [grupo('Mi cuenta', cuenta)];
    if (permitido('prensas')) grupos.push(grupo('Prensas', [link('/prensas/#config','Criterios y alertas' + (roles.prensas === 'lector' ? ' · Consulta' : ''))]));
    if (permitido('lotes')) grupos.push(grupo('Lotes', [link('/lotes/#config','Criterios, SO₂ y agenda' + (roles.lotes === 'lector' ? ' · Consulta' : ''))]));
    if (roles.barriles === 'admin') grupos.push(grupo('Barriles', [link('/barriles/#datos','Importar y modo'), link('/barriles/#boxes','Boxes y palets'), link('/barriles/#respaldos','Respaldos'), link('/barriles/#celular','Celular')]));
    if (roles.vendimia === 'admin') grupos.push(grupo('Vendimia', [link('/vendimia/?config=1','Permisos técnicos e impresión')]));
    if (permitido('lotes')) grupos.push(grupo('Inventario', [link('/lotes/#inventario-vasijas','Padrón y cubicaciones')]));
    if (actual === 'prensas' || actual === 'lotes') grupos.push('<div class="ciw-ajustes-reporte">' + '<a href="/'+actual+'/reporte" target="_blank" rel="noopener">Reporte</a>' + '</div>');
    return '<details class="ciw-ajustes"><summary class="cuenta-btn" aria-label="Configuración y cuenta" title="Configuración y cuenta">'+
      '<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.73v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.73l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg><span class="ciw-ajustes-flecha" aria-hidden="true">▾</span></summary>'+
      '<div class="cuenta-menu"><strong class="ciw-ajustes-encabezado">Configuración</strong>'+
      (ctx.nombre ? '<span class="ciw-ajustes-usuario">'+esc(ctx.nombre)+'</span>' : '')+grupos.join('')+
      '<div class="ciw-ajustes-grupo"><a class="ciw-ajustes-salir" href="/api/auth/logout">Cerrar sesión · Salir</a></div></div></details>';
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
  g.CIBarra = { html: html, centroDeVista: centroDeVista, menuConfiguracion: menuConfiguracion };
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
    '.ciw-ajustes{position:relative;flex-shrink:0;margin-left:4px;color:#344054}' +
    '.ciw-ajustes>.cuenta-btn{display:flex;align-items:center;justify-content:center;gap:5px;min-width:38px;min-height:36px;box-sizing:border-box;padding:5px 8px;background:#fff;border:1px solid #dce1e8;border-radius:9px;cursor:pointer;list-style:none}' +
    '.ciw-ajustes>.cuenta-btn::-webkit-details-marker{display:none}' +
    '.ciw-ajustes[open]>.cuenta-btn,.ciw-ajustes>.cuenta-btn:hover{background:#f0f2f5}' +
    '.ciw-ajustes>.cuenta-btn:focus-visible{outline:2px solid #8D1C43;outline-offset:2px}' +
    '.ciw-ajustes>.cuenta-menu{position:absolute;z-index:1200;right:0;top:calc(100% + 8px);width:min(310px,calc(100vw - 24px));max-height:min(70vh,560px);overflow:auto;background:#fff;border:1px solid #dce1e8;border-radius:12px;box-shadow:0 12px 30px #10182826;padding:8px;color:#344054;font:13px/1.45 system-ui,sans-serif;box-sizing:border-box}' +
    '.ciw-ajustes:not([open])>.cuenta-menu{display:none}' +
    '.ciw-ajustes-encabezado,.ciw-ajustes-usuario,.ciw-ajustes-titulo{display:block;padding:5px 10px}' +
    '.ciw-ajustes-encabezado{font-size:16px;color:#101828}.ciw-ajustes-usuario{color:#667085;font-size:12px;overflow-wrap:anywhere}' +
    '.ciw-ajustes-grupo{border-top:1px solid #eaecf0;padding:4px 0}.ciw-ajustes-titulo{font-size:11px;text-transform:uppercase;letter-spacing:.07em;font-weight:600;color:#667085}' +
    'html body .ciw-ajustes .cuenta-menu a{display:flex;align-items:center;box-sizing:border-box;white-space:normal;min-height:36px;color:#344054!important;text-decoration:none;padding:7px 10px;border-radius:7px!important}' +
    'html body .ciw-ajustes .cuenta-menu a:hover{background:#f2f4f7!important}html body .ciw-ajustes .cuenta-menu a:focus-visible{outline:2px solid #8D1C43;outline-offset:-2px}' +
    'html body .ciw-ajustes .cuenta-menu .ciw-ajustes-salir{color:#8D1C43!important;font-weight:600}' +
    '.ciw-ajustes-reporte{display:none}' +
    '@media (max-width:760px){#ciw-barra{padding:4px 10px;gap:2px}#ciw-barra a{display:inline-flex;align-items:center;min-height:44px;padding:0 10px;box-sizing:border-box}#ciw-barra .ancho,#ciw-barra .cuenta-ancho{display:none}.ciw-ajustes{margin-left:auto}.ciw-ajustes>.cuenta-btn{min-height:44px;min-width:44px}.ciw-ajustes .cuenta-menu a{min-height:44px}.ciw-ajustes-reporte{display:block}.ciw-ajustes>.cuenta-menu{max-height:60vh}}' +
    '@media print{.ciw-ajustes{display:none!important}}' +
    '@media (max-width:760px){#ciw-barra{flex-wrap:wrap}#ciw-barra .aqui{min-height:44px;display:inline-flex;align-items:center;box-sizing:border-box}#ciw-barra .sep{flex-shrink:0}}' +
    '@media (prefers-reduced-motion:reduce){#ciw-barra a{transition:none}}' +
    '@media print{#ciw-barra{display:none}}';

  var est = d.createElement('style');
  est.textContent = css;
  d.head.appendChild(est);

  // El portal monta el mismo menú después de /api/auth/me; no se agrega otra barra.
  d.addEventListener('click', function(e) {
    d.querySelectorAll('.ciw-ajustes[open]').forEach(function(menu) {
      if (!menu.contains(e.target) || e.target.closest('.ciw-ajustes a')) menu.open = false;
    });
  });
  d.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    d.querySelectorAll('.ciw-ajustes[open]').forEach(function(menu) { menu.open = false; menu.querySelector('summary').focus(); });
  });
  if (!g.CIW) return;
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
