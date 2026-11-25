/* ===== Órdenes de papel — entorno de la app que las usa =====
 * guardar-ot.js (número y PDF contra la carpeta) y vista-orden-guardada.js
 * (ejecutar/anular) sirven a Lotes y a Prensas. No importan el núcleo de
 * ninguna: cada app fija acá sus piezas al arrancar (Lotes en nucleo.js,
 * Prensas en app.js). Puro. */
'use strict';

let _e = null;
export function fijarEntornoOT(e){ _e = e || null; }
export function entornoOT(){
  if (!_e) throw new Error('Entorno de órdenes sin fijar');
  return _e;
}
