/**
 * Consulta del inventario para el operario: solo lectura. Filtrar las filas por
 * texto, estado y tipo, contarlas por estado y resumirlas por lote.
 *
 * Puro: no lee el estado global ni toca el DOM. Se carga como <script> clásico y
 * se cuelga de globalThis, igual que inventario.js. Se testea en
 * test/barriles-consulta.test.mjs.
 */
(function (raiz) {
  'use strict';

  function txt(v) { return String(v == null ? '' : v).trim(); }
  function est(r) { return txt(r && r.estado).toUpperCase().replace('VACÍO', 'VACIO'); }

  // consulta: { texto, estado: 'LLENO'|'MERMO'|'VACIO'|'' , tipo: 'tanque50'|'barrica'|'' }
  // El tipo usa la misma regla que la lista del programador: tanque de 50 L es
  // capacidad 50; todo lo demás es barrica o vasija.
  // Si el texto es exactamente un lote, trae solo ese lote: buscar "26277" no
  // tiene que mezclar el "262770". Si no, busca contenido en número, lote y marca.
  function filtrarInventario(filas, consulta) {
    const q = consulta || {};
    const t = txt(q.texto).toUpperCase();
    const arr = (filas || []).filter(r => {
      if (q.estado && est(r) !== q.estado) return false;
      if (q.tipo === 'tanque50' && txt(r.cap) !== '50') return false;
      if (q.tipo === 'barrica' && txt(r.cap) === '50') return false;
      return true;
    });
    if (!t) return arr;
    const loteExacto = arr.filter(r => txt(r.lote).toUpperCase() === t);
    if (loteExacto.length) return loteExacto;
    return arr.filter(r => [r.num, r.lote, r.marca].some(v => txt(v).toUpperCase().includes(t)));
  }

  function contarEstados(filas) {
    const c = { total: 0, LLENO: 0, MERMO: 0, VACIO: 0 };
    for (const r of filas || []) {
      c.total++;
      const e = est(r);
      if (e in c && e !== 'total') c[e]++;
    }
    return c;
  }

  // Un renglón por lote con vasijas en uso (LLENO o MERMO). Los vacíos no tienen lote.
  function resumenPorLote(filas) {
    const porLote = new Map();
    for (const r of filas || []) {
      const e = est(r), lote = txt(r.lote);
      if (!lote || (e !== 'LLENO' && e !== 'MERMO')) continue;
      if (!porLote.has(lote)) porLote.set(lote, { lote, cosecha: '', llenos: 0, mermos: 0, vasijas: 0, litros: 0 });
      const g = porLote.get(lote);
      if (e === 'LLENO') g.llenos++; else g.mermos++;
      g.vasijas++;
      g.litros += Number(r.litros) || 0;
      if (!g.cosecha && txt(r.cosecha)) g.cosecha = txt(r.cosecha);
    }
    return [...porLote.values()].sort((a, b) => b.vasijas - a.vasijas || a.lote.localeCompare(b.lote));
  }

  raiz.filtrarInventario = filtrarInventario;
  raiz.contarEstados = contarEstados;
  raiz.resumenPorLote = resumenPorLote;
})(typeof globalThis !== 'undefined' ? globalThis : window);
