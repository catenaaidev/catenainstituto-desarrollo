/**
 * Descargar el Dashboard como un .html suelto — lo usan Prensas y Lotes.
 *
 * Es una FOTO del dashboard tal como se ve en pantalla: se clona la sección,
 * se le pegan todos los estilos de la página y los gráficos de <canvas>
 * (Chart.js, en Lotes) se convierten en imágenes. El archivo que baja no
 * llama a la API ni carga scripts: se abre con doble clic, sin red y sin
 * pasar por el login, y se puede mandar por mail.
 *
 * Se engancha solo a cualquier botón con `data-descargar-html`:
 *   data-seccion  id de la sección a copiar (p. ej. "v-dashboard")
 *   data-titulo   título que encabeza el archivo
 *   data-archivo  prefijo del nombre del archivo (p. ej. "dashboard-prensas")
 *
 * Va como script clásico (no módulo) porque Prensas no usa módulos; publica
 * window.descargarDashboardHTML por si alguna pantalla lo quiere llamar a mano.
 */
(function () {
  'use strict';

  function dos(n) { return String(n).padStart(2, '0'); }

  function escaparHTML(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /** Todo el CSS de la página como texto. Una hoja de otro origen no deja
   *  leer sus reglas: se saltea en vez de cortar la descarga. */
  function cssDeLaPagina() {
    var partes = [];
    Array.prototype.forEach.call(document.styleSheets, function (hoja) {
      try {
        Array.prototype.forEach.call(hoja.cssRules, function (r) { partes.push(r.cssText); });
      } catch (e) { /* hoja de otro origen */ }
    });
    return partes.join('\n');
  }

  /** Lo que en pantalla es interactivo se vuelve texto fijo en la copia. */
  function congelar(original, copia) {
    // Los canvas se clonan en blanco: se copia el dibujo como imagen. Se
    // recorren en paralelo porque el clon conserva el orden de los nodos.
    var cOrig = original.querySelectorAll('canvas');
    var cCopia = copia.querySelectorAll('canvas');
    for (var i = 0; i < cOrig.length; i++) {
      var c = cOrig[i];
      var img = document.createElement('img');
      try { img.src = c.toDataURL('image/png'); } catch (e) { continue; }
      var r = c.getBoundingClientRect();
      img.alt = '';
      img.style.cssText = 'display:block;max-width:100%;width:' + (r.width || c.width) + 'px;height:' + (r.height || c.height) + 'px';
      cCopia[i].replaceWith(img);
    }

    // Selects e inputs: el clon trae el atributo, no el valor que eligió el
    // usuario (p. ej. el mes en curso). Se reemplazan por el texto visible.
    var sOrig = original.querySelectorAll('select');
    var sCopia = copia.querySelectorAll('select');
    for (var j = 0; j < sOrig.length; j++) {
      var op = sOrig[j].options[sOrig[j].selectedIndex];
      var span = document.createElement('b');
      span.textContent = op ? op.text : '';
      sCopia[j].replaceWith(span);
    }
    var iOrig = original.querySelectorAll('input, textarea');
    var iCopia = copia.querySelectorAll('input, textarea');
    for (var k = 0; k < iOrig.length; k++) {
      var el = iOrig[k];
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) iCopia[k].setAttribute('checked', '');
        else iCopia[k].removeAttribute('checked');
        iCopia[k].setAttribute('disabled', '');
        continue;
      }
      if (el.type === 'hidden' || !el.value) { iCopia[k].remove(); continue; }
      var t = document.createElement('span');
      t.textContent = el.value;
      iCopia[k].replaceWith(t);
    }

    // El propio botón de descarga y lo marcado como solo-pantalla no viajan.
    copia.querySelectorAll('[data-descargar-html], [data-no-exportar]').forEach(function (n) { n.remove(); });
    // Los ids repetidos no molestan (es otro documento), pero los handlers
    // inline sí: sin la app detrás tirarían errores al hacer clic.
    copia.querySelectorAll('*').forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        if (/^on/i.test(a.name)) n.removeAttribute(a.name);
      });
    });
  }

  function descargarDashboardHTML(opciones) {
    var seccion = document.getElementById(opciones.seccion);
    if (!seccion) return;
    var copia = seccion.cloneNode(true);
    congelar(seccion, copia);

    var ahora = new Date();
    var fecha = dos(ahora.getDate()) + '/' + dos(ahora.getMonth() + 1) + '/' + ahora.getFullYear() +
      ' ' + dos(ahora.getHours()) + ':' + dos(ahora.getMinutes());
    var usuario = (document.getElementById('usuario') || {}).textContent || '';
    usuario = usuario.replace(/^👤\s*/, '').trim();
    if (usuario === '—') usuario = '';
    var titulo = opciones.titulo || 'Dashboard';

    var raiz = document.documentElement;
    var atributosRaiz = Array.prototype.map.call(raiz.attributes, function (a) {
      return a.name + '="' + escaparHTML(a.value) + '"';
    }).join(' ');

    var html = '<!DOCTYPE html>\n<html ' + atributosRaiz + '>\n<head>\n' +
      '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
      '<title>' + escaparHTML(titulo + ' — ' + fecha) + '</title>\n' +
      '<style>\n' + cssDeLaPagina() + '\n</style>\n' +
      '<style>\n' +
      '  /* Copia estática: nada es clicable. */\n' +
      '  main button, main a, main [role=button]{pointer-events:none}\n' +
      '  .descarga-cab{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;padding:14px 22px;border-bottom:1px solid rgba(0,0,0,.12)}\n' +
      '  .descarga-cab h1{margin:0;font-size:20px}\n' +
      '  .descarga-cab .sub{opacity:.7;font-size:13px}\n' +
      '</style>\n</head>\n' +
      '<body class="' + escaparHTML(document.body.className) + '">\n' +
      '<div class="descarga-cab"><h1>' + escaparHTML(titulo) + '</h1>' +
      '<span class="sub">Copia del ' + escaparHTML(fecha) + (usuario ? ' · descargada por ' + escaparHTML(usuario) : '') +
      ' · los datos no se actualizan</span></div>\n' +
      '<main>\n' + copia.outerHTML + '\n</main>\n</body>\n</html>\n';

    var sello = ahora.getFullYear() + '-' + dos(ahora.getMonth() + 1) + '-' + dos(ahora.getDate()) +
      '_' + dos(ahora.getHours()) + dos(ahora.getMinutes());
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (opciones.archivo || 'dashboard') + '_' + sello + '.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  window.descargarDashboardHTML = descargarDashboardHTML;

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-descargar-html]');
    if (!b) return;
    descargarDashboardHTML({
      seccion: b.getAttribute('data-seccion'),
      titulo: b.getAttribute('data-titulo'),
      archivo: b.getAttribute('data-archivo'),
    });
  });
})();
