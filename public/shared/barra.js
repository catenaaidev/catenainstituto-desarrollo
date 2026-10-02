/**
 * Barra de la plataforma: volver al portal, saltar a otro módulo y ver quién
 * sos. La inyecta el servidor en los tres módulos, así que ninguna de las
 * apps tuvo que modificarse para tenerla.
 *
 * El servidor deja los datos en window.CIW antes de que corra esto.
 */
(function () {
  'use strict';

  var ctx = window.CIW || {};
  var actual = ctx.modulo || '';
  var modulos = ctx.modulos || {};

  var NOMBRES = {
    prensas: 'Prensas',
    barriles: 'Barriles',
    lotes: 'Lotes',
  };

  var css =
    '#ciw-barra{position:sticky;top:0;z-index:99999;display:flex;align-items:center;' +
    'gap:14px;padding:7px 16px;background:#2a2622;color:#f7f5f1;font-size:12.5px;' +
    "font-family:'Hanken Grotesk',system-ui,Segoe UI,sans-serif;line-height:1.4}" +
    '#ciw-barra a{color:#f7f5f1;text-decoration:none;padding:4px 9px;border-radius:6px;' +
    'transition:background .15s}' +
    '#ciw-barra a:hover{background:rgba(255,255,255,.14)}' +
    '#ciw-barra a:focus-visible{outline:2px solid #d99aa8;outline-offset:1px}' +
    '#ciw-barra .inicio{border:1px solid rgba(255,255,255,.28)}' +
    '#ciw-barra .sep{width:1px;height:16px;background:rgba(255,255,255,.2)}' +
    '#ciw-barra .aqui{opacity:.55;padding:4px 9px}' +
    '#ciw-barra .yo{margin-left:auto;opacity:.72;white-space:nowrap}' +
    '#ciw-barra .rol{opacity:.55;text-transform:uppercase;letter-spacing:1.2px;font-size:9.5px}' +
    '#ciw-barra .salir{opacity:.72;white-space:nowrap}' +
    '#ciw-barra .salir:hover{opacity:1;background:rgba(255,255,255,.14)}' +
    '@media print{#ciw-barra{display:none}}';

  var est = document.createElement('style');
  est.textContent = css;
  document.head.appendChild(est);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var partes = ['<a class="inicio" href="/" title="Volver al menú">← Menú</a>', '<span class="sep"></span>'];

  ['prensas', 'barriles', 'lotes'].forEach(function (m) {
    if (m === actual) {
      partes.push('<span class="aqui">' + NOMBRES[m] + '</span>');
    } else if (modulos[m]) {
      partes.push('<a href="/' + m + '/">' + NOMBRES[m] + '</a>');
    }
  });

  // Reporte de gerencia: solo en los módulos que lo tienen.
  if (actual === 'prensas' || actual === 'lotes') {
    partes.push('<span class="sep"></span>');
    partes.push('<a href="/' + actual + '/reporte" target="_blank" rel="noopener" ' +
      'title="Reporte para gerencia, en vivo">📊 Reporte</a>');
  }

  if (ctx.nombre) {
    partes.push(
      '<span class="yo">' + esc(ctx.nombre) +
        (ctx.rol ? ' <span class="rol">' + esc(ctx.rol) + '</span>' : '') +
        '</span>',
    );
  }

  /* Cerrar sesión: /api/auth/logout borra la sesión y la cookie. Hace falta
     sobre todo en las PC compartidas de la bodega, donde si no queda abierta y
     el siguiente que se sienta guarda con el nombre del anterior. */
  partes.push('<span class="sep"></span>');
  partes.push('<a class="salir" href="/cambiar-clave.html" title="Cambiar tu contraseña">Contraseña</a>');
  partes.push('<a class="salir" href="/api/auth/logout" ' +
    'title="Cerrar sesión y volver al login">Salir</a>');

  var barra = document.createElement('div');
  barra.id = 'ciw-barra';
  barra.innerHTML = partes.join('');

  function montar() {
    if (document.getElementById('ciw-barra')) return;
    document.body.insertBefore(barra, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montar);
  } else {
    montar();
  }
})();
