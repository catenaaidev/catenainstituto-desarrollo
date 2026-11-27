/* ===== Lotes CIW — "Actualizar análisis ya cargados" en Cargar análisis =====
 *
 * Cargar análisis siempre AGREGA: cada fila pegada es un análisis nuevo. Con
 * eso no había forma de corregir un dato puntual (el SO2 que el laboratorio
 * mandó después, un pH mal tipeado) sin borrar y volver a cargar la fila
 * entera. Este modo hace lo otro: cada fila busca el análisis ya cargado y le
 * cambia SOLO los casilleros que trae con valor.
 *
 * POR QUÉ ES UN MODO APARTE Y NO AUTOMÁTICO
 *
 * Dos análisis del mismo lote y día con un pH distinto son dos muestras (ver
 * carga-duplicados.js). Si el pegado "pisara" solo cuando coinciden lote y
 * fecha, la segunda muestra del día borraría la primera. Por eso actualizar es
 * algo que se elige, y la previsualización muestra cada cambio antes.
 *
 * CÓMO SE ENCUENTRA EL ANÁLISIS
 *
 * Por lote y fecha. Si hay más de uno ese día y la fila trae vasija, se busca
 * el de esa vasija. Si aun así no queda uno solo, la fila no se aplica: elegir
 * uno al azar sería corregir la muestra equivocada.
 *
 * QUÉ SE CAMBIA
 *
 * Solo los casilleros con valor. Un casillero vacío es "no tocar", no "borrar":
 * así se corrige un solo dato pegando lote, fecha y ese valor. Para borrar un
 * dato está la pestaña Análisis.
 *
 * Módulo PURO (sin DOM), para testearlo en el runtime de Workers como
 * carga-cols.js y carga-duplicados.js.
 */
'use strict';

import { NUMERICAS } from './carga-cols.js';
import { aIso } from './fechas.js';

/* Las que identifican el análisis: no se "actualizan", se usan para buscarlo. */
const CLAVES_BUSQUEDA = new Set(['lote', 'fecha_analisis']);

const txt = v => String(v ?? '').trim();

/* Vacío, null y ausente son "sin valor". Los números se comparan como número:
 * 3.5 y "3,50" son el mismo pH. */
function valor(k, v){
  if (v == null) return null;
  if (NUMERICAS.has(k)){
    const n = typeof v === 'number' ? v : parseFloat(txt(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  const s = txt(v);
  return s === '' ? null : s;
}

/** Los índices de `existentes` que son el análisis de esa fila (lote + fecha,
 *  y vasija para desempatar). */
export function candidatosDe(fila, existentes){
  const lote = txt(fila.lote);
  const fecha = fila.fecha_analisis;
  const idx = [];
  (existentes ?? []).forEach((a, i) => {
    if (!a || typeof a !== 'object') return;
    if (txt(a.lote) !== lote) return;
    if ((aIso(a.fecha_analisis) || null) !== fecha) return;
    idx.push(i);
  });
  const vasija = txt(fila.vasija);
  if (idx.length > 1 && vasija){
    const deEsaVasija = idx.filter(i => txt(existentes[i].vasija) === vasija);
    if (deEsaVasija.length) return deEsaVasija;
  }
  return idx;
}

/**
 * Arma, para cada fila del pegado, qué análisis actualiza y qué cambia.
 * No modifica nada. A cada fila le deja:
 *   _destino  — índice en `existentes` del análisis que actualiza (o undefined)
 *   _cambios  — [{campo, antes, despues}] (vacío si ya tenía esos valores)
 * y suma a `_errores` por qué no se puede aplicar, si es el caso.
 *
 * Las filas se planifican en orden sobre una copia: si dos filas tocan el mismo
 * análisis, la segunda ve lo que dejó la primera (y gana, como en el pegado).
 */
export function planActualizacion(filas, existentes, claves){
  const copia = (existentes ?? []).map(a => (a && typeof a === 'object') ? { ...a } : a);
  const campos = (claves ?? []).filter(k => !CLAVES_BUSQUEDA.has(k));

  for (const f of filas){
    delete f._destino;
    f._cambios = [];
    if (f._errores && f._errores.length) continue;

    const idx = candidatosDe(f, copia);
    if (idx.length === 0){
      f._errores.push('no hay un análisis de ese lote y fecha para actualizar');
      continue;
    }
    if (idx.length > 1){
      f._errores.push(`hay ${idx.length} análisis de ese lote y fecha: pegá la vasija o corregilo en la pestaña Análisis`);
      continue;
    }

    const a = copia[idx[0]];
    for (const k of campos){
      const nuevo = valor(k, f[k]);
      if (nuevo === null) continue;              // casillero vacío: no se toca
      const antes = valor(k, a[k]);
      if (antes === nuevo) continue;
      f._cambios.push({ campo: k, antes: a[k] ?? null, despues: nuevo });
      a[k] = nuevo;
    }
    f._destino = idx[0];
  }
  return filas;
}

/** Aplica sobre `existentes` (en el lugar) lo que dejó planActualizacion.
 *  Devuelve cuántos análisis cambiaron. */
export function aplicarActualizacion(filas, existentes){
  const tocados = new Set();
  for (const f of filas){
    if (f._errores && f._errores.length) continue;
    if (f._destino === undefined || !f._cambios || !f._cambios.length) continue;
    const a = existentes[f._destino];
    for (const c of f._cambios) a[c.campo] = c.despues;
    tocados.add(f._destino);
  }
  return tocados.size;
}
