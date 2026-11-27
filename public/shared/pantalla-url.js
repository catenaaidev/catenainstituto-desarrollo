/* ===== La pantalla en la URL (#analisis, #registro, #agregados…) =====
 * Cada app anota en el hash la pantalla que está mostrando: así el F5 vuelve a
 * esa pantalla en vez de al Panel, el link se puede compartir, y el botón Atrás
 * del navegador (o del celular) vuelve a la pantalla anterior (cada app escucha
 * popstate y se mueve SIN anotar de nuevo).
 *
 * Script clásico, inyectado por el Worker en el <head> de los tres módulos (sin
 * defer: las apps lo leen al arrancar). Queda en window.CIWPantalla.
 * Se testea en test/pantalla-url.test.mjs. */
(function (root) {
  'use strict';

  /** La pantalla de un hash "#<nombre>" si está entre las válidas; si no, null. */
  function pantallaDeHash(hash, validas) {
    const m = /^#([^/]+)$/.exec(String(hash || ''));
    if (!m) return null;
    let v;
    try { v = decodeURIComponent(m[1]).trim(); } catch (e) { return null; }
    const lista = validas instanceof Set ? validas : new Set(validas || []);
    return v && lista.has(v) ? v : null;
  }

  function hashDePantalla(nombre) {
    return '#' + encodeURIComponent(String(nombre ?? '').trim());
  }

  /** Anota la pantalla en la URL con una entrada nueva en el historial (para
   *  que Atrás vuelva a la anterior). No hace nada si ya está anotada. */
  function anotarPantalla(nombre) {
    const h = hashDePantalla(nombre);
    if (root.location.hash !== h) root.history.pushState(null, '', h);
    if (root.document && root.CustomEvent) root.document.dispatchEvent(new root.CustomEvent('ciw:pantalla', { detail: nombre }));
  }

  /* Sin salto al tablero: el HTML trae el Panel/Inicio marcado activo y el
   * navegador lo pinta mientras baja el código de la app. Si la URL trae otra
   * pantalla, lo activo queda invisible (la barra sigue a la vista) hasta que
   * la app la abre y llama a restaurada(). Tope de 5 s por si algo falla. */
  function ocultaAlArrancar(hash) { return String(hash || '').length > 1; }
  function restaurada() {
    const d = root.document && root.document.documentElement;
    if (d) d.classList.remove('ciw-restaurando');
  }
  if (root.document && root.location && ocultaAlArrancar(root.location.hash)) {
    const d = root.document.documentElement;
    d.classList.add('ciw-restaurando');
    const est = root.document.createElement('style');
    est.textContent = 'html.ciw-restaurando .view.active,html.ciw-restaurando .panel.activo{visibility:hidden}';
    root.document.head.appendChild(est);
    root.setTimeout(restaurada, 5000);
  }

  root.CIWPantalla = { pantallaDeHash, hashDePantalla, anotarPantalla, ocultaAlArrancar, restaurada };
})(typeof globalThis !== 'undefined' ? globalThis : window);
