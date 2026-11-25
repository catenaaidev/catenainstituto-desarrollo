/* ===== Lotes CIW — modo órdenes (puro) =====
 * /lotes/?orden=nueva:<tipo> o /lotes/?orden=<id> llega desde la sección
 * Órdenes de trabajo. Lotes arranca normal, pero muestra solo esa orden.
 * Acá se decide QUÉ abrir; app.js lo abre. */
'use strict';

import { PLANTILLAS_OT, plantillaPorId } from './ot-plantillas.js';
import { esEjecutado } from './ot-movimientos.js';
import { TIPOS_HOJA, esTipoHoja } from './ordenes-hojas.js';

export function leerModoOrden(search){
  const v = new URLSearchParams(search || '').get('orden');
  if (!v) return null;
  return v.startsWith('nueva:') ? { nueva: v.slice(6) } : { id: v };
}

export function destinoDeModo(modo, datos){
  if (modo.nueva !== undefined){
    if (esTipoHoja(modo.nueva)) return { accion: 'hoja-nueva', tipo: modo.nueva };
    if (modo.nueva === 'correccion') return { accion: 'correccion' };
    return PLANTILLAS_OT.some(p => p.id === modo.nueva)
      ? { accion: 'emitir', plantilla: modo.nueva } : { accion: 'tipo-desconocido' };
  }
  if ((datos.ordenes_trabajo || []).some(o => o && o.id === modo.id)) return { accion: 'ver-ot', id: modo.id };
  if ((datos.ordenes_correccion || []).some(o => o && o.id === modo.id)) return { accion: 'ver-oc', id: modo.id };
  const hoja = (datos.ordenes_hojas || []).find(o => o && o.id === modo.id);
  if (hoja) return { accion: 'ver-hoja', id: modo.id, tipo: hoja.tipo };
  return { accion: 'no-existe' };
}

export function urlVolver(search){
  const v = new URLSearchParams(search || '').get('volver') || '';
  return v.startsWith('/ordenes/') ? v : '/ordenes/';
}

const _nombre = id => (plantillaPorId(id) || {}).nombre || id;

export function tituloModo(dest, datos){
  if (dest.accion === 'emitir') return 'Nueva · ' + _nombre(dest.plantilla);
  if (dest.accion === 'correccion') return 'Nueva · Corrección SO₂';
  if (dest.accion === 'ver-ot'){
    const o = (datos.ordenes_trabajo || []).find(x => x && x.id === dest.id);
    // Sin la orden (la borraron mientras estaba abierta) o sin número: nunca «undefined» en la banda.
    if (!o) return 'Orden no encontrada';
    return 'OT ' + (o.ot || '—') + ' · ' + (_nombre(o.plantilla) || '—') + ' · ' + (esEjecutado(o) ? 'ejecutada' : 'pendiente');
  }
  if (dest.accion === 'ver-oc'){
    const o = (datos.ordenes_correccion || []).find(x => x && x.id === dest.id);
    if (!o) return 'Orden no encontrada';
    return (o.numero || '—') + ' · Corrección SO₂ · ' + (o.estado || '—');
  }
  if (dest.accion === 'hoja-nueva') return 'Nueva · ' + TIPOS_HOJA[dest.tipo].nombre;
  if (dest.accion === 'ver-hoja'){
    const o = (datos.ordenes_hojas || []).find(x => x && x.id === dest.id);
    if (!o) return 'Orden no encontrada';
    // Un tipo que esta versión no conoce (dato viejo o de una versión nueva) no rompe la banda.
    return (o.ot || '—') + ' · ' + (esTipoHoja(o.tipo) ? TIPOS_HOJA[o.tipo].nombre : (o.tipo || '—')) + ' · ' + (o.estado || '—');
  }
  return 'Orden no encontrada';
}
