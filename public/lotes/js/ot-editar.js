/* ===== Lotes CIW — editar una OT pendiente (puro) =====
 *
 * Una OT pendiente se puede corregir (lotes, vasijas, destino, lote del
 * corte) desde ✎ Editar o desde el panel de vasijas manuales de la hoja. Los
 * movimientos se rearman con movimientosDeOT pero conservando su id:
 *   - el lote que sigue mantiene su mov_id (y su movimiento, actualizado),
 *   - el lote nuevo recibe un mov_id que no choque,
 *   - el lote quitado pierde su movimiento.
 * Los textos escritos sobre la hoja en las celdas de las tablas y del ID se
 * guardan por POSICION (ot-bloques.js): si cambian los lotes o las vasijas
 * quedarian en la fila equivocada, asi que se reinician. Los pasos y el
 * titulo no. */
'use strict';

import { movimientosDeOT } from './ot-armado.js';
import { sumaLitros } from './ot-vasijas.js';
import { normalizarAchique, movIdsDeOT, nombreDestino, nombreClase } from './ot-achique.js';
import { normalizarExtras, extrasDeOT } from './ot-destinos.js';
import { esOrganico } from './envases.js';

const CELDAS_POR_FILA = new Set(['tabla-vaciado', 'tabla-correccion', 'tabla-llenado', 'tabla-achique', 'ids', 'rotular']);
const txt = v => String(v ?? '').trim();

/* Lo que se imprime de cada lote: si cambia, las filas de las tablas cambian. */
const firmaVasijas = ot => JSON.stringify([(ot.lotes || []).map(l => [txt(l.lote),
  (l.barriles || []).map(b => txt(b.num)), (l.tanques || []).map(t => txt(t.num)), (l.otras || []).map(o => txt(o.nombre)),
  (l.destinos_extra || []).map(d => [txt(d.num), d.tipo || '', d.barricas || 0, d.t50 || 0, txt(d.lote)])]),
  (ot.filas_papel || []).length, (ot.destinos_extra || []).map(d => [txt(d.num), d.tipo || '', d.barricas || 0, d.t50 || 0, txt(d.lote)])]);
// El tipo cuenta aparte: con numero, nombreDestino no lo nombra y el papel si.
const firmaAchique = ot => JSON.stringify(((ot.achique && ot.achique.destinos) || []).map(d => [nombreDestino(d), nombreClase(d.clase), txt(d.lote)]));
const firmaTodo = ot => JSON.stringify([ot.destino, ot.fecha, ot.emitio, ot.lote_corte, ot.achique, ot.filas_papel || [],
  ot.destinos_extra || [],
  (ot.lotes || []).map(l => [l.lote, l.destino, l.barriles, l.tanques, l.otras, l.litros_previstos, l.vasijas_manual, l.barricas_previstas, l.destinos_extra])]);

function _loteCorte(lc){
  const lote = txt(lc && lc.lote);
  if (!lote) return null;
  const out = { lote, id_texto: String(lc.id_texto || '') };
  if (lc.existente) out.existente = true;
  return out;
}

/* Un extra agregado al editar llega con el mov_id de la OT temporal que arma
 * la pantalla (otro prefijo): se le saca, y normalizarExtras le da uno de
 * esta OT. Los que ya eran de la OT conservan el suyo. */
const _idsPropios = (lista, ids) => (lista || []).map(d => d && d.mov_id && !ids.has(d.mov_id) ? { ...d, mov_id: '' } : d);

export function aplicarEdicionOT(datos, ot, cambios, { usuario = '', hoy = '' } = {}){
  const antes = firmaTodo(ot);
  const vasijasAntes = firmaVasijas(ot);
  const achiqueAntes = firmaAchique(ot);
  const lotesAntes = (ot.lotes || []).map(l => txt(l.lote));
  const hijosAntes = ((ot.achique && ot.achique.destinos) || []).filter(d => d.nuevo).map(d => txt(d.lote));
  const extrasAntes = extrasDeOT(ot).map(x => txt(x.d.lote));
  const idsAntes = new Set(movIdsDeOT(ot));
  const c = cambios || {};

  if (c.destino !== undefined) ot.destino = txt(c.destino);
  if (c.fecha) ot.fecha = c.fecha;
  if (c.emitio !== undefined) ot.emitio = txt(c.emitio);
  if (c.lote_corte !== undefined) ot.lote_corte = _loteCorte(c.lote_corte);
  if (c.achique !== undefined) ot.achique = normalizarAchique(c.achique, ot.id);
  if (Array.isArray(c.filas_papel)) ot.filas_papel = c.filas_papel
    .map(f => ({ lote: txt(f.lote), nombre: txt(f.nombre), litros: f.litros ?? null }))
    .filter(f => f.lote || f.nombre);
  if (Array.isArray(c.lotes)){
    const usados = new Set(idsAntes);
    let k = (ot.lotes || []).length;
    const nuevoId = () => {
      let id;
      do { id = `${ot.id}-${k++}`; } while (usados.has(id));
      usados.add(id);
      return id;
    };
    ot.lotes = c.lotes.map((l, i) => {
      const prev = (ot.lotes || []).find(p => txt(p.lote) === txt(l.lote));
      const out = { ...l, lote: txt(l.lote), mov_id: prev ? prev.mov_id : nuevoId() };
      const ex = normalizarExtras(_idsPropios(l.destinos_extra, idsAntes), ot.id, `x${i}`, usados);
      ex.forEach(d => usados.add(d.mov_id));
      if (ex.length) out.destinos_extra = ex; else delete out.destinos_extra;
      return out;
    });
  }
  if (c.destinos_extra !== undefined){
    const ex = normalizarExtras(_idsPropios(c.destinos_extra, idsAntes), ot.id, 'xc', idsAntes);
    if (ex.length) ot.destinos_extra = ex; else delete ot.destinos_extra;
  }

  const cambio = firmaTodo(ot) !== antes;
  const r = { cambio, quitados: [], agregados: [], hijosQuitados: [], celdasLimpias: false };
  if (!cambio) return r;

  const lotesDespues = ot.lotes.map(l => txt(l.lote));
  r.quitados = lotesAntes.filter(l => !lotesDespues.includes(l));
  r.agregados = lotesDespues.filter(l => !lotesAntes.includes(l));
  const hijosDespues = ((ot.achique && ot.achique.destinos) || []).filter(d => d.nuevo).map(d => txt(d.lote));
  const extrasDespues = extrasDeOT(ot).map(x => txt(x.d.lote));
  r.hijosQuitados = [...hijosAntes.filter(l => !hijosDespues.includes(l)),
    ...extrasAntes.filter(l => !extrasDespues.includes(l))];

  // Movimientos: los de la OT se rearman, conservando cada uno por su id.
  if (!Array.isArray(datos.movimientos)) datos.movimientos = [];
  const movs = datos.movimientos;
  const idsDespues = new Set(movIdsDeOT(ot));
  for (let i = movs.length - 1; i >= 0; i--)
    if (idsAntes.has(movs[i].id) && !idsDespues.has(movs[i].id)) movs.splice(i, 1);
  for (const t of movimientosDeOT(ot, usuario, hoy)){
    const m = movs.find(x => x.id === t.id);
    if (m){
      for (const k of ['lote', 'tipo', 'fecha', 'vasija_origen', 'vasija_destino', 'litros', 'lote_destino', 'destino_externo']) m[k] = t[k];
    } else movs.unshift(t);
  }

  // Si cambian las vasijas de los origenes, todas las tablas cambian de filas;
  // si cambian solo las vasijas definitivas del achique, solo su tabla y su rotular.
  const vasijasCambio = firmaVasijas(ot) !== vasijasAntes;
  const achiqueCambio = firmaAchique(ot) !== achiqueAntes;
  const delAchique = b => b.tipo === 'tabla-achique' || (b.tipo === 'rotular' && b.de === 'achique');
  if (vasijasCambio || achiqueCambio){
    for (const b of ot.bloques || []){
      if (b && CELDAS_POR_FILA.has(b.tipo) && (vasijasCambio || delAchique(b)) && b.celdas && Object.keys(b.celdas).length){
        delete b.celdas;
        r.celdasLimpias = true;
      }
    }
  }
  if (ot.pdf && ot.pdf.estado && ot.pdf.estado !== 'viejo') ot.pdf = { ...ot.pdf, estado: 'viejo' };
  return r;
}

/* ---------- filas manuales de la hoja ----------
 * Cada fila es { lote, nombre, litros }. Segun el lote:
 *   'ot'     el lote ya esta en la OT: la vasija es una de sus `otras`;
 *   'nuevo'  el lote existe en Lotes pero no en la OT: entra a la OT con su
 *            movimiento, con esta vasija;
 *   'papel'  no es un lote (un nombre), o es un lote destino del achique: la
 *            fila sale en el papel y nada mas (ot.filas_papel), sin litros
 *            del lote ni movimiento. */
export function filasManuales(ot){
  const filas = [];
  for (const l of ot.lotes || [])
    for (const o of l.otras || []) filas.push({ lote: txt(l.lote), nombre: o.nombre || '', litros: o.litros ?? null });
  for (const f of ot.filas_papel || []) filas.push({ lote: txt(f.lote), nombre: f.nombre || '', litros: f.litros ?? null });
  return filas;
}

export function clasificarFila(fila, ot, lotes){
  const l = txt(fila && fila.lote);
  if (l && (ot.lotes || []).some(x => txt(x.lote) === l)) return 'ot';
  // Corte + achique: el lote del corte y los hijos RECIBEN el vino de la OT;
  // como origen se traspasarian a si mismos (ciclo y litros contados dos veces).
  if (l && ((ot.achique && ot.achique.destinos) || []).some(d => txt(d && d.lote) === l)) return 'papel';
  if (l && (lotes || []).some(x => String(x.lote ?? '') === l)) return 'nuevo';
  return 'papel';
}

const _sinVasijas = l => !(l.barriles || []).length && !(l.tanques || []).length &&
  !(l.otras || []).length && !txt(l.vasijas_manual);

/* Los lotes de la OT y las filas de solo papel que salen de una lista de
 * filas manuales. Un lote que se quedo sin ninguna vasija (habia entrado solo
 * por una fila manual) sale de la OT. */
export function lotesConFilas(ot, filas, lotes){
  const de = l => filas.filter(f => txt(f.lote) === txt(l))
    .map(f => ({ nombre: txt(f.nombre), litros: f.litros ?? null }));
  const enOT = (ot.lotes || []).map(l => conOtras(l, de(l.lote))).filter(l => !_sinVasijas(l));
  const nuevos = [], filas_papel = [];
  for (const f of filas){
    const tipo = clasificarFila(f, ot, lotes);
    if (tipo === 'papel'){ filas_papel.push({ lote: txt(f.lote), nombre: txt(f.nombre), litros: f.litros ?? null }); continue; }
    if (tipo !== 'nuevo' || nuevos.some(n => n.lote === txt(f.lote))) continue;
    const ficha = (lotes || []).find(x => String(x.lote ?? '') === txt(f.lote));
    const otras = de(f.lote);
    nuevos.push({ lote: txt(f.lote), id_texto: (ficha && ficha.id_texto) || '', organico: !!(ficha && esOrganico(ficha)),
      barriles: [], tanques: [], otras, vasijas_manual: '',
      litros_previstos: sumaLitros({ otras }) || null, barricas_previstas: null,
      destino_real: '', litros_reales: null, merma: null });
  }
  return { lotes: [...enOT, ...nuevos], filas_papel };
}

/* Un lote de la OT con otras vasijas manuales. Si sus litros eran la suma de
 * sus vasijas, siguen siendolo; si se escribieron a mano, se corren por la
 * diferencia. */
export function conOtras(lote, otras){
  const nuevo = { ...lote, otras };
  const prev = lote.litros_previstos == null ? NaN : Number(lote.litros_previstos);
  const sumaAntes = sumaLitros(lote), sumaDespues = sumaLitros(nuevo);
  nuevo.litros_previstos = !Number.isFinite(prev) || prev === sumaAntes
    ? (sumaDespues || null)
    : Math.max(0, prev + (sumaDespues - sumaAntes));
  return nuevo;
}
