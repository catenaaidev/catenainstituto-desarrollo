/* ===== Lotes CIW — la OT de Muestras (0993), modulo puro =====
 *
 * No mueve vino: la OT se marca sin_movimientos, guarda lotes: [] y su tabla
 * (Lote / Vasija / Muestra) en ot.muestras, que se edita sobre la hoja. Las
 * funciones de filas no mutan: devuelven filas nuevas y la vista las asigna a
 * ot.muestras.
 *
 * sin_movimientos va en la OT y no se deduce de la plantilla: el servidor
 * (src/ordenes/resumen.ts) no lee las plantillas, y una OT guardada no cambia
 * de regla si mañana cambia la plantilla. */
'use strict';

import { armarOT, resumenVasijas } from './ot-armado.js';

export const MUESTRA_POR_DEFECTO = '750 ml';
export const COLS_MUESTRAS = ['lote', 'vasija', 'muestra'];

const txt = v => String(v ?? '').trim();

export const esSinMovimientos = ot => !!ot && ot.sin_movimientos === true;

export function filasDeOT(ot){
  return ot && Array.isArray(ot.muestras) ? ot.muestras : [];
}

/* La vasija sugerida de un lote: lo que tiene LLENO en el Mapa, sus tanques
 * del padron o "N Barricas". Es una sugerencia: se corrige en la hoja. */
export function vasijaDeLote({ barriles = [], tanques = [], cantidad_barricas = null } = {}){
  const llenos = (barriles || []).filter(b => b && (!b.estado || b.estado === 'LLENO'));
  return resumenVasijas({ barriles: llenos, tanques: tanques || [], otras: [], cantidad_barricas });
}

export function filasIniciales(lotes, muestra){
  const m = txt(muestra);
  return (lotes || []).map(l => ({ lote: txt(l.lote), vasija: txt(l.vasija), muestra: m }));
}

export function agregarFila(filas){
  const fs = filas || [];
  const muestra = fs.length ? fs[fs.length - 1].muestra : MUESTRA_POR_DEFECTO;
  return [...fs, { lote: '', vasija: '', muestra }];
}

export function quitarFila(filas, i){
  return (filas || []).filter((_, k) => k !== i);
}

export function editarCeldaMuestra(filas, i, col, valor){
  const fs = filas || [];
  if (!COLS_MUESTRAS.includes(col) || !fs[i]) return null;
  const v = String(valor ?? '');
  if (fs[i][col] === v) return null;
  return fs.map((f, k) => k === i ? { ...f, [col]: v } : f);
}

export function lotesDeMuestras(ot){
  return [...new Set(filasDeOT(ot).map(f => txt(f.lote)).filter(Boolean))];
}

const vacia = f => !txt(f.lote) && !txt(f.vasija) && !txt(f.muestra);

export function armarOTMuestras({ id, numero, fecha, emitio, filas, usuario, hoy }){
  return {
    ...armarOT({ id, numero, plantilla: 'muestras-ot', fecha, destino: '', emitio, lotes: [],
                 mapaVersion: null, usuario, hoy }),
    sin_movimientos: true,
    muestras: (filas || []).filter(f => !vacia(f)).map(f => ({ lote: txt(f.lote), vasija: txt(f.vasija), muestra: txt(f.muestra) })),
  };
}
