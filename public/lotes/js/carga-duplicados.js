/* ===== Lotes CIW — análisis repetidos en Cargar análisis =====
 *
 * Pegar dos veces la misma planilla del laboratorio duplicaba los análisis:
 * cargarConfirmar() hacía push de todo lo válido sin mirar lo que ya había.
 * Pasó de verdad: los 13 análisis del 07/10/2026 quedaron dos veces en la web,
 * pegados con días de diferencia.
 *
 * QUÉ ES "REPETIDO"
 *
 * Una fila del pegado está repetida si coincide EXACTAMENTE con un análisis ya
 * cargado (o con una fila anterior del mismo pegado) en todas las columnas que
 * trae el pegado: lote, fecha, vasija y cada valor. Basta con que un solo
 * valor difiera para que entre: dos análisis del mismo lote y día con un pH
 * distinto son dos muestras, no un duplicado.
 *
 * Solo se comparan las columnas del pegado. Lo que el análisis guardado tenga
 * de más (la corrección de SO2, los agregados, la microbiología) no lo trae la
 * planilla del laboratorio, así que no puede hacer que una fila deje de ser la
 * misma.
 *
 * Módulo PURO (sin DOM), para poder testearlo dentro del runtime de Workers,
 * igual que carga-cols.js.
 */
'use strict';

import { NUMERICAS } from './carga-cols.js';

/* Vacío, null y ausente son lo mismo: el pegado no guarda la clave de una
 * vasija vacía, y un valor numérico vacío queda en null. */
function normalizar(k, v){
  if (v == null) return null;
  if (NUMERICAS.has(k)){
    const n = typeof v === 'number' ? v : parseFloat(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** La "huella" de un análisis en las columnas dadas: dos análisis con la misma
 *  huella son el mismo para el pegado. */
export function huellaAnalisis(a, claves){
  return JSON.stringify(claves.map(k => normalizar(k, (a ?? {})[k])));
}

/** Marca en cada fila parseada `_repetido`:
 *   'ya cargado'          — ya hay un análisis igual en `existentes`
 *   'repetido en el pegado' — una fila anterior del mismo pegado es igual
 *  Las filas con errores no se miran (no se van a cargar igual) y tampoco
 *  cuentan como "anterior" para las que vienen después.
 *  Devuelve las mismas filas, modificadas en el lugar. */
export function marcarRepetidos(filas, existentes, claves){
  const cargadas = new Set((existentes ?? []).map(a => huellaAnalisis(a, claves)));
  const vistas = new Set();
  for (const f of filas){
    delete f._repetido;
    if (f._errores && f._errores.length) continue;
    const h = huellaAnalisis(f, claves);
    if (cargadas.has(h)) f._repetido = 'ya cargado';
    else if (vistas.has(h)) f._repetido = 'repetido en el pegado';
    vistas.add(h);
  }
  return filas;
}
