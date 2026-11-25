/* ===== Lotes CIW — tanques del padron y vasijas manuales de un lote de la OT (puro) =====
 *
 * Los barriles salen del Mapa; los tanques grandes (padron de 78 vasijas) no
 * estan en el Mapa, y algunas vasijas no estan en ningun sistema (IBC, bins).
 * La OT guarda las tres cosas por lote y los litros previstos son la suma:
 *
 *   lote de la OT = { barriles, tanques: [{num, litros}], otras: [{nombre, litros}] }
 *
 * Modulo puro (sin DOM ni nucleo.js) para testearlo en node. */
'use strict';

import { buscarVasija } from './vasijas-padron.js';
import { RE_T50 } from './envases.js';

const ES_CHICO = new RegExp('barric|' + RE_T50.source, 'i');
const pos = x => { const v = Number(x); return Number.isFinite(v) && v > 0 ? v : 0; };

export const nombreTanque = num => 'T ' + String(num ?? '').trim();

/* El tanque del padron donde esta el lote hoy: el primer numero de su
 * vasija_actual (fuera de las partes de barricas/T50) que es una vasija activa
 * del padron. Solo si el lote tiene litros en tanque (vasija_grande). */
export function tanqueDelLote(lote, padron){
  const litros = pos(lote && lote.vasija_grande);
  if (!litros) return null;
  for (const parte of String((lote && lote.vasija_actual) || '').split('+')){
    if (ES_CHICO.test(parte)) continue;
    for (const d of parte.match(/\d+/g) || []){
      const v = buscarVasija(padron, d);
      if (v) return { num: String(v.num), litros };
    }
  }
  return null;
}

/* Todos los tanques del padron de la vasija_actual del lote (la vasija de
 * crianza), sin repetir: "T 205 + T 174" -> los dos. Con uno solo lleva los
 * litros en tanque del lote; con varios no se sabe cuanto hay en cada uno y
 * los litros quedan para escribir. Sin litros en tanque, ninguno. */
export function tanquesDelLote(lote, padron){
  if (!pos(lote && lote.vasija_grande)) return [];
  const out = [];
  for (const parte of String((lote && lote.vasija_actual) || '').split('+')){
    if (ES_CHICO.test(parte)) continue;
    for (const d of parte.match(/\d+/g) || []){
      const v = buscarVasija(padron, d);
      if (v && !out.some(t => t.num === String(v.num))){ out.push({ num: String(v.num), litros: null }); break; }
    }
  }
  if (out.length === 1) out[0].litros = pos(lote.vasija_grande);
  return out;
}

/* Las partes de la suma: los barriles (los tildados si viene el Set), cada
 * tanque y cada vasija manual. */
function partes(l){
  const bs = (l && l.barriles) || [];
  const t = l && l.tildados;
  const elegidos = t ? bs.filter(b => t.has(b.num)) : bs;
  return [elegidos.reduce((s, b) => s + pos(b.cap), 0),
          ...((l && l.tanques) || []).map(x => pos(x.litros)),
          ...((l && l.otras) || []).map(x => pos(x.litros))];
}

export const sumaLitros = l => partes(l).reduce((s, x) => s + x, 0);

/* "225 + 4.850 + 300": lo que se suma, para mostrarlo debajo del total. */
export const detalleSuma = l => partes(l).filter(x => x > 0).map(x => x.toLocaleString('es-AR')).join(' + ');

/* Al agregar un lote a la OT, si el Mapa no tiene barriles de ese lote (no
 * los conoce, o no respondio) pero la ficha de Lotes dice que vive en
 * barricas de 225 y nada mas, la tarjeta arranca en modo "Cantidad de
 * barricas" con esas barricas. Asi la OT dice cuantas se vacian y al
 * confirmar se descuentan solas; antes el unico camino era "+ vasija manual",
 * que no descontaba nada (OT 0957, 2026-10-27). Con tanque u otros envases
 * chicos la cantidad no alcanza para describir el lote: null. */
export function origenSinMapa(ficha, barrilesMapa){
  if (!ficha || (barrilesMapa || []).length) return null;
  const n = pos(ficha.cap225);
  if (!n || !Number.isInteger(n)) return null;
  if (pos(ficha.cap50) || pos(ficha.cap200) || pos(ficha.cap500) || pos(ficha.vasija_grande)) return null;
  return { cantidad: n };
}
