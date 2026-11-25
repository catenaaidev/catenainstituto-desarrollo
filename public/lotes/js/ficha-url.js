/* ===== Lotes CIW — la ficha en la URL (#ficha/<lote>) =====
 * Puro: lo usan nucleo.js y app.js, y se testea en test/lotes-ficha-url.test.mjs. */
'use strict';

/** El lote de un hash "#ficha/<lote>", o null si no es una ficha. */
export function loteDeHash(hash){
  const m = /^#ficha\/(.+)$/.exec(String(hash || ''));
  if (!m) return null;
  try {
    const v = decodeURIComponent(m[1]).trim();
    return v || null;
  } catch (e) { return null; }
}

export function hashDeLote(lote){
  return '#ficha/' + encodeURIComponent(String(lote ?? '').trim());
}
