/* ===== Lotes CIW — orden guardado de una tabla =====
 * Modulo puro (sin nucleo.js) para testearlo en vitest. tabla.js lo re-exporta. */
'use strict';

/* Un orden leído de CIWFiltros, solo si tiene la forma { key, dir: 1|-1 };
   si no (guardado viejo o roto), el de siempre. */
export const ordenValido = (o, d) =>
  (o && typeof o.key === 'string' && (o.dir === 1 || o.dir === -1)) ? { key: o.key, dir: o.dir } : d;
