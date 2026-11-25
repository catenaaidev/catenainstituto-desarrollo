/* ===== Lotes CIW — órdenes de papel guardadas (puro) =====
 * Orden de muestras, de microbiología y de otros agregados: hasta la
 * entrega 2 de Órdenes de trabajo se imprimían y desaparecían. Ahora se
 * guardan AL IMPRIMIR en DATOS().ordenes_hojas, quedan pendientes y se cierran
 * con «Marcar ejecutada» (o se anulan). `hoja` es la foto de lo que salió en el
 * papel; `registro` (solo agregados) es lo que se anota en Análisis al
 * ejecutar, con las dosis del papel: nunca se recalcula. */
'use strict';

import { registrarAgregados, revertirAgregados } from './agregados.js';
import { fmtFecha } from './fechas.js';

export const TIPOS_HOJA = {
  muestras:  { nombre: 'Orden de muestras',      serie: 'principal' },
  micro:     { nombre: 'Orden de microbiología', serie: 'principal' },
  agregados: { nombre: 'Otros agregados',        serie: 'B' },
};

export const esTipoHoja = tipo => Object.prototype.hasOwnProperty.call(TIPOS_HOJA, tipo);

const txt = v => (v == null ? '' : String(v).trim());

export function armarOrdenHoja({ id, tipo, numero, fecha, quien, ahora, lotes, hoja, registro = null }){
  const vistos = [...new Set((lotes || []).map(txt).filter(Boolean))];
  return { id, tipo, ot: txt(numero), fecha: txt(fecha), estado: 'pendiente',
           emitida_por: quien || '', emitida_el: ahora || '', ejecutada_por: '', ejecutada_el: '',
           anulada: null, lotes: vistos.map(lote => ({ lote })), hoja: hoja || {}, registro, pdf: null };
}

export const ordenHojaPorId = (datos, id) =>
  ((datos && datos.ordenes_hojas) || []).find(o => o && o.id === id) || null;

/* Una pendiente del mismo tipo y N° NO se pisa en silencio: puede ser otra
 * orden emitida por otra persona con el mismo número. Se devuelve
 * `error:'pendiente'` con la previa, y solo se reemplaza (conservando su id)
 * si quien llama confirma pasando `reemplazarId: previa.id`. Una ejecutada no
 * se pisa nunca; una anulada ya no cuenta. Una hoja SIN N° no choca con
 * otras sin N° (cada una es su propia orden): solo se reemplaza por su id. */
export function guardarOrdenHoja(datos, orden, { reemplazarId } = {}){
  const lista = Array.isArray(datos.ordenes_hojas) ? datos.ordenes_hojas : [];
  const sinNumero = !String(orden.ot || '').trim();
  const previa = lista.find(o => o && o.estado !== 'anulada' && (sinNumero
    ? (reemplazarId && o.id === reemplazarId)
    : (o.tipo === orden.tipo && o.ot === orden.ot)));
  if (previa && previa.estado === 'ejecutada') return { ok: false, error: 'ejecutada' };
  if (previa && previa.id !== reemplazarId) return { ok: false, error: 'pendiente', previa };
  if (!Array.isArray(datos.ordenes_hojas)) datos.ordenes_hojas = lista;
  if (previa){
    const guardada = { ...orden, id: previa.id };
    lista[lista.indexOf(previa)] = guardada;
    return { ok: true, reemplazo: true, id: guardada.id };
  }
  lista.push(orden);
  return { ok: true, reemplazo: false, id: orden.id };
}

/* emitida_el es un ISO en UTC: el día se toma en la hora local (a las 22 h de
 * Mendoza ya es mañana en UTC). Sin emitida_el, la fecha de la orden. */
function _diaEmision(previa){
  const d = previa.emitida_el ? new Date(previa.emitida_el) : null;
  if (d && !isNaN(d)){
    const dos = n => String(n).padStart(2, '0');
    return dos(d.getDate()) + '/' + dos(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  return fmtFecha(previa.fecha) || '—';
}

/** Título y texto del confirmar() de «ya hay una orden pendiente con ese N°». */
export function textoPendientePrevia(previa){
  const lotes = (previa.lotes || []).map(l => l && l.lote).filter(Boolean);
  return {
    titulo: 'Ya hay una orden ' + (previa.ot || '—') + ' pendiente',
    texto: 'La emitió ' + (previa.emitida_por || 'alguien') + ' el ' + _diaEmision(previa) +
           (lotes.length ? ' con los lotes ' + lotes.join(', ') : ' con la hoja en blanco') +
           '. ¿Reemplazarla por la que acabás de imprimir?',
    si: 'Reemplazar', no: 'Dejar la anterior', peligro: true,
  };
}

function _pendiente(datos, id){
  const o = ordenHojaPorId(datos, id);
  if (!o) return { error: 'no-existe' };
  if (o.estado !== 'pendiente') return { error: 'no-pendiente' };
  return { o };
}

/* marcarEjecutada / anularOrdenHoja devuelven `deshacer`: lo necesario para
 * volver atrás si el guardado de después falla (mismo criterio que
 * revertirEjecucion en orden-correccion-guardada.js). `datos` al revertir
 * puede ser OTRO documento (el fusionado tras un 409): la orden se busca por id
 * y los agregados por lote+fecha (revertirAgregados). */
const _previo = o => ({ estado: o.estado, ejecutada_por: o.ejecutada_por, ejecutada_el: o.ejecutada_el, anulada: o.anulada });

export function marcarEjecutada(datos, id, { quien, cuando }){
  const { o, error } = _pendiente(datos, id);
  if (error) return { ok: false, error };
  const deshacer = { previo: _previo(o), snaps: [] };
  if (o.tipo === 'agregados' && Array.isArray(o.registro)){
    if (!Array.isArray(datos.analisis)) datos.analisis = [];
    /* registrarAgregados REEMPLAZA los renglones vigentes de la misma OT para
     * un lote+fecha: si el registro tuviera dos entradas con el mismo
     * lote+fecha, llamarla una vez por entrada haría que la segunda pisara
     * los items de la primera. Se agrupa antes de registrar. */
    const porLoteFecha = new Map();
    for (const r of o.registro){
      const clave = `${txt(r.lote)}|${r.fecha}`;
      const grupo = porLoteFecha.get(clave);
      if (grupo) grupo.items = grupo.items.concat(r.items || []);
      else porLoteFecha.set(clave, { lote: r.lote, fecha: r.fecha, items: (r.items || []).slice() });
    }
    for (const r of porLoteFecha.values())
      deshacer.snaps.push(registrarAgregados(datos.analisis, { lote: r.lote, fecha: r.fecha, items: r.items, ot: o.ot, quien, cuando }));
  }
  o.estado = 'ejecutada';
  o.ejecutada_por = quien || '';
  o.ejecutada_el = cuando || '';
  return { ok: true, deshacer };
}

/** Deshace marcarEjecutada: saca los agregados que anotó y la orden vuelve a
 *  como estaba (pendiente). */
export function revertirEjecucion(datos, id, deshacer){
  if (!deshacer) return;
  revertirAgregados((datos && datos.analisis) || [], deshacer.snaps || []);
  const o = ordenHojaPorId(datos, id);
  if (o && o.estado === 'ejecutada') Object.assign(o, deshacer.previo);
}

export function anularOrdenHoja(datos, id, { quien, cuando }){
  const { o, error } = _pendiente(datos, id);
  if (error) return { ok: false, error };
  const deshacer = { previo: _previo(o) };
  o.estado = 'anulada';
  o.anulada = { por: quien || '', en: cuando || '' };
  return { ok: true, deshacer };
}

/** Deshace anularOrdenHoja: la orden vuelve a pendiente. */
export function revertirAnulacion(datos, id, deshacer){
  if (!deshacer) return;
  const o = ordenHojaPorId(datos, id);
  if (o && o.estado === 'anulada') Object.assign(o, deshacer.previo);
}
