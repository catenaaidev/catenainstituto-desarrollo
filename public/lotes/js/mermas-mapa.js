/* ===== Lotes CIW — las barricas mermas miran el Mapa de Barriles =====
 *
 * Guarda en memoria la ultima lectura del Mapa para los barriles de las mermas
 * pendientes. Al guardar Lotes (registrarAntesDeGuardar), las que el Mapa ya ve
 * LLENAS con el mismo lote se cierran y sus lotes recalculan litros. Asi la web
 * nunca guarda sola: el cierre viaja en un guardado que alguien pidio. */
'use strict';

import { DATOS, usuarioActual, registrarAntesDeGuardar, registrarInit,
         invalidarVista, vistaActiva, renderActivo } from './nucleo.js';
import { estaPendiente, cerrarLlenasSegunMapa, recalcularLitros } from './mermas.js';
import { hoyLocalISO } from './fechas.js';

/* undefined = todavia no se leyo el Mapa (recien cargo la pagina); null = la
 * ultima lectura fallo; objeto = la ultima lectura, aunque este vacio ({}). */
let _porNum = undefined;

export const porNumMermas = () => _porNum;

/* La sub-pestaña Mermas (vista-mermas.js) tiene que verse al dia apenas la
 * lectura del Mapa cambia, aunque nadie haya tocado Guardar: si esta abierta
 * se repinta sola. */
function _avisarMovimientos(){
  invalidarVista('movimientos');
  if (vistaActiva() === 'movimientos') renderActivo();
}

export async function refrescarMapaMermas(){
  const nums = [...new Set((DATOS().mermas || []).filter(estaPendiente).map(m => String(m.barril)))];
  if (!nums.length){ _porNum = {}; _avisarMovimientos(); return; }
  try {
    const r = await fetch(API + '/barriles?nums=' + encodeURIComponent(nums.join(',')));
    _porNum = r.ok ? ((await r.json()).por_num || {}) : null;
  } catch (e) { _porNum = null; }
  _avisarMovimientos();
}

export function cerrarMermasLlenas(datos){
  if (!_porNum || !Array.isArray(datos.mermas)) return false;
  const lotes = cerrarLlenasSegunMapa(datos.mermas, _porNum, usuarioActual() || 'Mapa', hoyLocalISO());
  if (!lotes.size) return false;
  recalcularLitros(datos.lotes, datos.mermas, lotes);
  return true;
}

registrarAntesDeGuardar(cerrarMermasLlenas);
registrarInit(() => { refrescarMapaMermas(); });
