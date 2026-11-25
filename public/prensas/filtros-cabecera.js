/* Lógica pura de los filtros en la cabecera de las tablas de Prensas.
 *
 * Script clásico (la página no usa módulos): se cuelga de globalThis para que
 * app.js y los tests (test/prensas-filtros-cabecera.test.mjs) la lean igual.
 * La posición del panel sigue la misma regla que public/lotes/js/posicion-panel.js. */
(function (g) {
  'use strict';
  var MARGEN = 6, SEPARACION = 4;

  /* Dónde poner el panel de un embudo: debajo del <th> si entra en la ventana,
   * si no arriba; nunca afuera por la derecha ni por arriba. */
  function posicionDePanel(ancla, panel, ventana) {
    var izq = Math.max(MARGEN, Math.min(ancla.left, ventana.ancho - panel.ancho - MARGEN));
    var abajo = ancla.bottom + SEPARACION;
    var arriba = ancla.top - panel.alto - SEPARACION;
    var entra = abajo + panel.alto <= ventana.alto - MARGEN;
    return { izq: izq, top: entra ? abajo : Math.max(MARGEN, arriba) };
  }

  function lleno(s) { return s != null && String(s).trim() !== ''; }
  function aNum(s) { var n = parseFloat(String(s).replace(',', '.')); return isNaN(n) ? null : n; }

  function rangoActivo(r) { return !!r && (lleno(r.min) || lleno(r.max)); }

  /* Filtro "desde / hasta" de una columna numérica o de fecha. Con un límite
   * puesto, una celda vacía no pasa (igual que la fila de filtros de antes). */
  function pasaRango(valor, r, tipo) {
    if (!rangoActivo(r)) return true;
    if (tipo === 'date') {
      var v = lleno(valor) ? String(valor) : '';
      if (lleno(r.min) && (!v || v < r.min)) return false;
      if (lleno(r.max) && (!v || v > r.max)) return false;
      return true;
    }
    var x = lleno(valor) ? aNum(valor) : null;
    var mn = lleno(r.min) ? aNum(r.min) : null;
    var mx = lleno(r.max) ? aNum(r.max) : null;
    if (mn != null && (x == null || x < mn)) return false;
    if (mx != null && (x == null || x > mx)) return false;
    return true;
  }

  g.PrensasFiltros = { posicionDePanel: posicionDePanel, pasaRango: pasaRango, rangoActivo: rangoActivo };
})(globalThis);
