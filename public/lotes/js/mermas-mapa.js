/* ===== Lotes CIW — las barricas mermas miran el Mapa de Barriles =====
 *
 * Guarda en memoria la ultima lectura del Mapa para los barriles de las mermas
 * pendientes. Al guardar Lotes (registrarAntesDeGuardar), las que el Mapa ya ve
 * LLENAS con el mismo lote se cierran y sus lotes recalculan litros. Asi la web
 * nunca guarda sola: el cierre viaja en un guardado que alguien pidio. */
'use strict';

import { DATOS, usuarioActual, registrarAntesDeGuardar, registrarInit } from './nucleo.js';
import { estaPendiente, cerrarLlenasSegunMapa, recalcularLitros } from './mermas.js';

let _porNum = null;

export const porNumMermas = () => _porNum;

export async function refrescarMapaMermas(){
  const nums = [...new Set((DATOS().mermas || []).filter(estaPendiente).map(m => String(m.barril)))];
  if (!nums.length){ _porNum = {}; return; }
  try {
    const r = await fetch(API + '/barriles?nums=' + encodeURIComponent(nums.join(',')));
    _porNum = r.ok ? ((await r.json()).por_num || {}) : null;
  } catch (e) { _porNum = null; }
}

export function cerrarMermasLlenas(datos){
  if (!_porNum || !Array.isArray(datos.mermas)) return false;
  const lotes = cerrarLlenasSegunMapa(datos.mermas, _porNum, usuarioActual() || 'Mapa',
    new Date().toISOString().slice(0, 10));
  if (!lotes.size) return false;
  recalcularLitros(datos.lotes, datos.mermas, lotes);
  return true;
}

registrarAntesDeGuardar(cerrarMermasLlenas);
registrarInit(() => { refrescarMapaMermas(); });
