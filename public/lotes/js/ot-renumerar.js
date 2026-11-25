/* ===== Lotes CIW — cambiar el N° de una OT ya emitida (puro) =====
 *
 * El numero sale de la carpeta de OneDrive, y si OneDrive todavia no habia
 * bajado las ordenes nuevas a esta PC la web propone uno ya usado (paso con la
 * 0947, que era la 0953). Cambiarlo tiene que arrastrar todo lo que guarda
 * ese numero como texto:
 *   - la OT (ot.ot) y sus movimientos (por mov_id),
 *   - las mermas que creo al confirmarse (ot + lote de la OT),
 *   - las correcciones de SO2 y los agregados registrados desde la OT
 *     (ot_n + lote de la OT, incluido el lote del corte y los hijos del achique).
 * Lo de otros lotes con el mismo numero no se toca: no es de esta OT. */
'use strict';

import { movIdsDeOT } from './ot-achique.js';

const txt = v => String(v ?? '').trim();

export function renumerarOT(datos, ot, nuevo){
  const r = { movimientos: 0, mermas: 0, correcciones: 0, agregados: 0 };
  const viejo = txt(ot && ot.ot);
  nuevo = txt(nuevo);
  if (!nuevo || nuevo === viejo) return r;
  const d = datos || {};
  // Con Corte + achique tambien cuentan los traspasos del corte a cada hijo
  // y lo registrado sobre los hijos (sus mermas y correcciones).
  const movIds = new Set(movIdsDeOT(ot));
  const lotes = new Set((ot.lotes || []).map(l => txt(l.lote)));
  if (ot.lote_corte && txt(ot.lote_corte.lote)) lotes.add(txt(ot.lote_corte.lote));
  for (const dd of (ot.achique && ot.achique.destinos) || []) if (dd && txt(dd.lote)) lotes.add(txt(dd.lote));

  ot.ot = nuevo;
  for (const m of d.movimientos || []){
    if (m && movIds.has(m.id) && txt(m.ot) === viejo){ m.ot = nuevo; r.movimientos++; }
  }
  for (const m of d.mermas || []){
    if (m && txt(m.ot) === viejo && lotes.has(txt(m.lote))){ m.ot = nuevo; r.mermas++; }
  }
  for (const a of d.analisis || []){
    if (!a || !lotes.has(txt(a.lote))) continue;
    if (a.correccion && typeof a.correccion === 'object' && txt(a.correccion.ot_n) === viejo){
      a.correccion.ot_n = nuevo; r.correcciones++;
    }
    for (const ag of Array.isArray(a.agregados) ? a.agregados : []){
      if (ag && txt(ag.ot_n) === viejo){ ag.ot_n = nuevo; r.agregados++; }
    }
  }
  return r;
}
