/**
 * Avisa con claridad cuando una vista depende de un cálculo que todavía no se
 * migró, en vez de dejar la pantalla colgada en "Cargando datos…".
 *
 * Envuelve fetch: si el servidor responde 501 con `motor_pendiente`, muestra un
 * cartel explicando qué falta y qué hacer mientras tanto. No toca el código de
 * la app: se inyecta desde el servidor, igual que la barra.
 */
(function () {
  'use strict';

  var css =
    '#ciw-pend{position:fixed;left:50%;transform:translateX(-50%);bottom:22px;z-index:99998;' +
    'max-width:560px;width:calc(100% - 32px);background:#fffaf0;border:1px solid #e6d3a8;' +
    'border-left:4px solid #b07d2c;border-radius:8px;padding:16px 18px;' +
    "font-family:'Hanken Grotesk',system-ui,Segoe UI,sans-serif;font-size:13px;" +
    'line-height:1.55;color:#3b3428;box-shadow:0 10px 34px -14px rgba(0,0,0,.4)}' +
    '#ciw-pend h4{margin:0 0 6px;font-size:13.5px;font-weight:700;color:#8a5a10}' +
    '#ciw-pend ul{margin:8px 0 0;padding-left:18px}' +
    '#ciw-pend li{margin:3px 0}' +
    '#ciw-pend .x{position:absolute;top:10px;right:12px;cursor:pointer;border:none;' +
    'background:none;font-size:17px;line-height:1;color:#9a8b6a;padding:2px 6px;border-radius:4px}' +
    '#ciw-pend .x:hover{background:rgba(0,0,0,.06)}';

  var est = document.createElement('style');
  est.textContent = css;
  document.head.appendChild(est);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function mostrar(cuerpo) {
    var previo = document.getElementById('ciw-pend');
    if (previo) previo.remove();

    var det = (cuerpo && cuerpo.detalles) || ['Esta parte todavía no está migrada.'];
    var caja = document.createElement('div');
    caja.id = 'ciw-pend';
    caja.setAttribute('role', 'status');
    caja.innerHTML =
      '<button class="x" title="Cerrar" aria-label="Cerrar">&times;</button>' +
      '<h4>⏳ Esta vista todavía no está migrada</h4>' +
      '<ul>' +
      det.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') +
      '</ul>';
    caja.querySelector('.x').onclick = function () { caja.remove(); };
    document.body.appendChild(caja);

    // Se va solo: si la persona ya cambió a una vista que sí anda, el cartel
    // de la anterior no tiene que quedarse estorbando.
    setTimeout(function () {
      if (caja.isConnected) caja.remove();
    }, 14000);
  }

  var original = window.fetch;
  window.fetch = function () {
    var args = arguments;
    return original.apply(this, args).then(function (res) {
      if (res.status === 501) {
        // Se clona: la app sigue leyendo el cuerpo por su cuenta.
        res.clone().json().then(function (j) {
          if (j && j.error === 'motor_pendiente') mostrar(j);
        }).catch(function () {});
      }
      return res;
    });
  };
})();
