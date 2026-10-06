/**
 * Rótulos de lote desde Barriles: la hoja "rotulo" de la 0700, igual a la que
 * imprime Lotes al emitir una OT (hojaRotulos en public/lotes/js/ot-hojas.js).
 * Dos rótulos iguales por barril, uno al lado del otro, 9 pares por A4; arriba
 * el lote grande y el QR, abajo el título del lote y el número de barril.
 * Las clases ot-rot-* son las mismas que en Lotes, para que se vea idéntica.
 *
 * Puro: el QR lo arma una función que se pasa (en la página, qrcode-generator);
 * sin ella el hueco queda vacío. Script clásico colgado de globalThis.
 * Se testea en test/barriles-rotulos.test.mjs.
 */
(function (raiz) {
  'use strict';

  const PARES_POR_HOJA_ROT = 9;
  const MAX_BARRILES = 500;

  function txt(v) { return String(v == null ? '' : v).trim(); }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // datos: { lote, titulo, cantidad } · qrSvg(lote) → '<svg …>' (opcional)
  function hojasRotulos(datos, qrSvg) {
    const lote = txt(datos && datos.lote);
    const n = Math.min(Math.floor(Number(datos && datos.cantidad)), MAX_BARRILES);
    if (!lote || !(n >= 1)) return '';
    const qr = typeof qrSvg === 'function' ? qrSvg(lote) : '';
    const titulo = esc(txt(datos.titulo));
    const pares = [];
    for (let i = 1; i <= n; i++) {
      const r = `<div class="ot-rotulo"><div class="ot-rot-lote">${esc(lote)}</div>` +
        `<div class="ot-rot-qr">${qr}</div>` +
        `<div class="ot-rot-id">${titulo}</div><div class="ot-rot-n">${i}</div></div>`;
      pares.push(`<div class="ot-rot-par">${r}${r}</div>`);
    }
    const hojas = [];
    for (let i = 0; i < pares.length; i += PARES_POR_HOJA_ROT)
      hojas.push(`<div class="rot-hoja">${pares.slice(i, i + PARES_POR_HOJA_ROT).join('')}</div>`);
    return hojas.join('');
  }

  // Cuántos barriles tienen ese lote hoy (LLENO o MERMO) según el inventario.
  function cantidadSugerida(inventario, lote) {
    const l = txt(lote).toUpperCase();
    if (!l) return 0;
    return (inventario || []).filter(r => {
      const e = txt(r.estado).toUpperCase();
      return (e === 'LLENO' || e === 'MERMO') && txt(r.lote).toUpperCase() === l;
    }).length;
  }

  raiz.PARES_POR_HOJA_ROT = PARES_POR_HOJA_ROT;
  raiz.hojasRotulos = hojasRotulos;
  raiz.cantidadSugerida = cantidadSugerida;
})(typeof globalThis !== 'undefined' ? globalThis : window);
