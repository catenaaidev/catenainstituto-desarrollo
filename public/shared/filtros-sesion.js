/* ===== Filtros que sobreviven al F5 (solo en esta pestaña del navegador) =====
 * Embudos, buscadores, selectores y orden de cada pantalla se guardan en
 * sessionStorage: vuelven con el F5 y con Atrás, y se borran al cerrar la
 * pestaña (otra pestaña arranca limpia; un filtro olvidado de ayer no hace
 * pensar que "faltan filas").
 *
 * Los embudos usan CIWFiltros.set(clave): un Set que se guarda solo en cada
 * add/delete/clear, así los widgets que ya escriben en el Set no cambian.
 *
 * Script clásico, inyectado por el Worker en el <head> de los tres módulos (sin
 * defer). Queda en window.CIWFiltros. Se testea en test/filtros-sesion.test.mjs. */
(function (root) {
  'use strict';
  const PRE = 'ciw_filtros:';
  let _st;
  try { _st = root.sessionStorage || null; } catch (e) { _st = null; }

  function leer(clave, porDefecto) {
    try {
      const v = _st ? _st.getItem(PRE + clave) : null;
      return v == null ? porDefecto : JSON.parse(v);
    } catch (e) { return porDefecto; }
  }
  function guardar(clave, valor) {
    try { if (_st) _st.setItem(PRE + clave, JSON.stringify(valor)); } catch (e) {}
  }
  function borrar(prefijo) {
    try {
      if (!_st) return;
      const fuera = [];
      for (let i = 0; i < _st.length; i++) { const k = _st.key(i); if (k && k.startsWith(PRE + prefijo)) fuera.push(k); }
      fuera.forEach(k => _st.removeItem(k));
    } catch (e) {}
  }

  /* Guarda en un microtask: "Todas" agrega cientos de valores de un saque y
   * con esto se escribe una sola vez. */
  class SetSesion extends Set {
    constructor(clave) {
      super();
      const g = leer(clave, []);
      for (const v of (Array.isArray(g) ? g : [])) super.add(v);
      this._clave = clave;
      this._pend = false;
      /* true mientras tenga lo restaurado sin podar contra las opciones. */
      this.restaurado = this.size > 0;
    }
    add(v) { super.add(v); this._guardar(); return this; }
    delete(v) { const r = super.delete(v); this._guardar(); return r; }
    clear() { super.clear(); this._guardar(); }
    _guardar() {
      if (!this._clave || this._pend) return;
      this._pend = true;
      queueMicrotask(() => { this._pend = false; guardar(this._clave, [...this]); });
    }
    /** La primera vez después de restaurar, saca lo que ya no es una opción
     *  (un lote que se vació, una variedad de otro año): nunca una tabla vacía
     *  por un filtro fantasma. Después no poda: lo elegido a mano se respeta. */
    podar(validos) {
      if (!this.restaurado) return;
      this.restaurado = false;
      let cambio = false;
      for (const v of [...this]) if (!validos.has(v)) { super.delete(v); cambio = true; }
      if (cambio) this._guardar();
    }
  }

  root.CIWFiltros = {
    leer, guardar, borrar,
    set: clave => new SetSesion(clave),
    _usarStorage: s => { _st = s; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
