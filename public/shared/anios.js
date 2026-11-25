/* ===== CIW — el año (vendimia) de cada lote =====
 * Modulo puro (sin DOM ni storage) para que se pueda testear en el runtime de
 * Workers. El estado de la seleccion y los botones viven en selector-anios.js.
 *
 * El año no es un campo: sale del numero de lote, que siempre arranca con los
 * dos digitos de la cosecha (25137 = 2025). Un lote con otro formato no tiene
 * año y se ve siempre.
 *
 * Misma regla que src/lotes/motores/anios.ts; test/lotes-anios.test.mjs
 * verifica que las dos den lo mismo. */
'use strict';

export function anioDeLote(lote){
  if (typeof lote !== 'number' && typeof lote !== 'string') return null;
  const s = String(lote).trim();
  return /^\d{5}$/.test(s) ? 2000 + Number(s.slice(0, 2)) : null;
}

export function aniosDisponibles(lotes){
  const s = new Set();
  for (const l of (lotes || [])){
    const a = anioDeLote(l && l.lote);
    if (a !== null) s.add(a);
  }
  return [...s].sort((a, b) => a - b);
}

/* Lo guardado en el navegador, si sigue teniendo sentido; si no, el año mas
 * nuevo solo, que es el que se trabaja todos los dias. */
export function seleccionInicial(guardada, disponibles){
  if (!disponibles.length) return [];
  const ok = Array.isArray(guardada)
    ? disponibles.filter(a => guardada.includes(a))
    : [];
  return ok.length ? ok : [disponibles[disponibles.length - 1]];
}

/* Nunca deja la seleccion vacia: una web sin ningun lote parece rota. */
export function alternarAnio(sel, anio){
  if (sel.includes(anio)){
    const r = sel.filter(a => a !== anio);
    return r.length ? r : sel;
  }
  return [...sel, anio].sort((a, b) => a - b);
}

export function loteVisible(lote, sel){
  if (!sel || !sel.length) return true;
  const a = anioDeLote(lote);
  return a === null || sel.includes(a);
}

/* Una OT con lotes de dos años se ve si cualquiera de ellos se ve. */
export function otVisible(ot, sel){
  const lotes = ((ot && ot.lotes) || []).map(l => l && l.lote);
  if (ot && ot.lote_corte && ot.lote_corte.lote) lotes.push(ot.lote_corte.lote);
  if (!lotes.length) return true;
  return lotes.some(l => loteVisible(l, sel));
}

export function claveAnios(sel){
  return (sel && sel.length) ? [...sel].sort((a, b) => a - b).join(',') : '';
}

/* Que localStorage usar para adelantar el /dashboard ANTES de montar el
 * selector (ver selector-anios.js:queryAnios): la eleccion explicita del
 * usuario si sigue siendo valida, si no la ultima que se vio (aunque haya
 * sido la del defecto), para que un 2027 nuevo se adelante solo sin esperar
 * a que alguien lo clickee. seleccionInicial() sigue usando solo 'guardada'
 * (la explicita) para no perder la memoria de "el usuario eligio ver 2025". */
export function claveParaPrefetch(guardada, ultima){
  const esArrayDeAnios = v => Array.isArray(v) && v.every(Number.isInteger);
  if (esArrayDeAnios(guardada)) return claveAnios(guardada);
  if (esArrayDeAnios(ultima)) return claveAnios(ultima);
  return '';
}
