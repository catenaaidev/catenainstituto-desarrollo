/* ===== Prensas — modo órdenes (puro) =====
 * /prensas/?orden=nueva:<tipo> o /prensas/?orden=<id> llega desde la sección
 * Órdenes de trabajo. Mismo patrón que public/lotes/js/modo-ordenes.js, pero
 * Prensas solo conoce sus propias 4 hojas (TIPOS_HOJA_PRENSAS): no hay OT de
 * movimientos ni corrección de SO2 acá. `leerModoOrden`/`urlVolver` son los
 * mismos de Lotes (puros, sin nada propio de Lotes), reexportados para que
 * app.js no tenga que importar de dos módulos distintos. */
'use strict';

import { leerModoOrden, urlVolver } from '../../lotes/js/modo-ordenes.js';
import { TIPOS_HOJA_PRENSAS, esTipoHojaPrensas } from './hojas-prensas.js';

export { leerModoOrden, urlVolver };

export function destinoPrensas(modo, datos){
  if (!modo) return { accion: 'no-existe' };
  if (modo.nueva !== undefined){
    return esTipoHojaPrensas(modo.nueva) ? { accion: 'hoja-nueva', tipo: modo.nueva } : { accion: 'tipo-desconocido' };
  }
  const hoja = ((datos && datos.ordenes_hojas) || []).find(o => o && o.id === modo.id);
  if (hoja) return { accion: 'ver-hoja', id: modo.id, tipo: hoja.tipo };
  return { accion: 'no-existe' };
}

export function tituloModoPrensas(dest, datos){
  if (dest.accion === 'hoja-nueva') return 'Nueva · ' + TIPOS_HOJA_PRENSAS[dest.tipo].nombre;
  if (dest.accion === 'ver-hoja'){
    const o = ((datos && datos.ordenes_hojas) || []).find(x => x && x.id === dest.id);
    // Sin la orden (la borraron mientras estaba abierta) o un tipo que esta
    // versión no conoce: nunca "undefined" en la banda.
    if (!o) return 'Orden no encontrada';
    return (o.ot || '—') + ' · ' + (esTipoHojaPrensas(o.tipo) ? TIPOS_HOJA_PRENSAS[o.tipo].nombre : (o.tipo || '—')) + ' · ' + (o.estado || '—');
  }
  return 'Orden no encontrada';
}
