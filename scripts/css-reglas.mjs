/**
 * Parser mínimo del CSS de una página: lo justo para que los tests de estilo
 * puedan decir "estas reglas no cambiaron". Puro (sin fs), así lo importan
 * tanto los scripts de Node como los tests que corren en Workers.
 */

/** Todo el CSS de los <style> de un HTML, sin comentarios. */
export function cssDe(html) {
  return [...String(html).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Bloques de primer nivel ("sel{...}" o "@media ...{...}"), por conteo de llaves. */
export function reglasTope(css) {
  const out = [];
  let prof = 0, ini = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') prof++;
    else if (c === '}') {
      prof--;
      if (prof === 0) { out.push(css.slice(ini, i + 1).trim()); ini = i + 1; }
    }
  }
  return out.filter(Boolean);
}

/** Espacios normalizados: el mismo CSS escrito con otro sangrado da lo mismo. */
export function norm(r) {
  return String(r).replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').trim();
}

const selectorDe = (r) => r.slice(0, r.indexOf('{')).trim();
const cuerpoDe = (r) => r.slice(r.indexOf('{') + 1, -1);

/** Lo que toca una hoja de papel (OT, órdenes, rótulos, hoja de recorrida). */
export const SELECTOR_PAPEL =
  /orden-hoja|ot-rot|inv-hoja|#otPaginas|#otlHoja|#ocPaginas|#agPaginas|#otMovHoja|#cruceHoja|printing-/;

/**
 * Las reglas de papel: cada @media print entero, cada @page de primer nivel
 * (p. ej. "@page rotulos" de Barriles) y toda regla de pantalla (también dentro
 * de un @media de pantalla) cuyo selector toca una hoja. `selector` dice qué es
 * hoja en cada app (por defecto, las de Lotes). Ordenadas, para que mover una
 * regla de lugar no cuente como cambio.
 */
export function reglasDePapel(html, selector = SELECTOR_PAPEL) {
  const out = [];
  for (const r of reglasTope(cssDe(html))) {
    if (/^@media[^{]*\bprint\b/.test(r) || /^@page\b/.test(r)) { out.push(norm(r)); continue; }
    if (r.startsWith('@')) {
      const media = norm(selectorDe(r));
      for (const ir of reglasTope(cuerpoDe(r))) {
        if (selector.test(selectorDe(ir))) out.push(media + '>' + norm(ir));
      }
      continue;
    }
    if (selector.test(selectorDe(r))) out.push(norm(r));
  }
  return out.sort();
}

/** Todas las reglas de pantalla, una por selector, con el @media que las envuelve ('' si ninguno). */
export function reglasPlanas(html) {
  const out = [];
  for (const r of reglasTope(cssDe(html))) {
    if (/^@media[^{]*\bprint\b/.test(r) || /^@(font-face|keyframes|page)/.test(r)) continue;
    if (r.startsWith('@')) {
      const media = norm(selectorDe(r));
      for (const ir of reglasTope(cuerpoDe(r))) out.push({ media, selector: norm(selectorDe(ir)), cuerpo: norm(cuerpoDe(ir)) });
      continue;
    }
    out.push({ media: '', selector: norm(selectorDe(r)), cuerpo: norm(cuerpoDe(r)) });
  }
  return out;
}
