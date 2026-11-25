/* ===== Lotes CIW — cableado de una orden de papel guardada =====
 *
 * `htmlCabeceraOrden` (puro, en orden-guardada-cabecera.js) pinta la cabecera
 * de una orden guardada (muestras/micro/agregados); acá se cablean sus
 * botones: ejecutar, anular y reimprimir. Mismo chequeo de version que
 * vista-ordenes-correccion.js (_confirmar/_anular): si otra PC guardó
 * mientras tanto, se frena antes de tocar nada.
 */
'use strict';

import { entornoOT } from './entorno-ot.js';
import { avisar, confirmar } from './dialogos.js';
import { ordenHojaPorId, marcarEjecutada, anularOrdenHoja,
         revertirEjecucion, revertirAnulacion,
         guardarOrdenHoja, textoPendientePrevia } from './ordenes-hojas.js';

export { htmlCabeceraOrden } from './orden-guardada-cabecera.js';

const _avisarModo = () => document.dispatchEvent(new CustomEvent(entornoOT().eventoModo));

let _enVuelo = false;

/* Mismo chequeo que _confirmar/_anular en vista-ordenes-correccion.js: el
 * overlay de confirmar() pausa el en vivo, y en ese rato otra PC pudo haber
 * guardado. Sin este rechequeo el guardado de más abajo fusionaría los
 * cambios en silencio en vez de avisar. */
async function _sigueAlDia(){
  const e = entornoOT();
  try {
    const rv = await fetch(e.api + '/version', { cache: 'no-store' });
    if (rv.ok){
      const info = await rv.json();
      if (info.version !== e.datos().meta.version) return false;
    }
  } catch (_) { /* sin conexion: seguir, el guardado de abajo ya lo maneja */ }
  return true;
}

async function _ejecutarOAnular(id, { anular, alCambiar }){
  if (_enVuelo) return;
  const e = entornoOT();
  const o = ordenHojaPorId(e.datos(), id);
  if (!o || o.estado !== 'pendiente') return;

  const accion = anular ? anularOrdenHoja : marcarEjecutada;
  const op = anular
    ? { titulo: 'Anular la orden ' + o.ot,
        texto: 'La orden queda anulada (no se borra). No se registra nada en Análisis.',
        si: 'Anular', no: 'Cancelar', peligro: true }
    : { titulo: 'Marcar ejecutada ' + o.ot,
        texto: o.tipo === 'agregados'
          ? 'Se anotan en Análisis las dosis de este papel.'
          : 'Queda registrada como ejecutada.',
        si: 'Marcar ejecutada', no: 'Cancelar' };
  if (!await confirmar(op)) return;

  _enVuelo = true;
  try {
    if (!await _sigueAlDia()){
      avisar('Otra persona guardó cambios: recargá antes de ejecutar.', { tipo: 'mal' });
      return;
    }

    const res = accion(e.datos(), id, { quien: e.usuarioActual(), cuando: new Date().toISOString() });
    if (!res.ok){
      avisar('No se pudo: ' + (res.error === 'no-existe' ? 'la orden ya no existe.' : 'la orden ya no está pendiente.'), { tipo: 'mal' });
      return;
    }

    e.markDirty();
    let ok;
    try { ok = await e.guardar(false); } catch (_) { ok = false; }
    if (!ok){
      /* Mismo criterio que _confirmar/_anular en vista-ordenes-correccion.js:
       * cualquier guardado que no dio ok (conflicto, error o sin conexión) se
       * deshace. DATOS() se lee de nuevo: tras un 409 es el documento
       * fusionado. */
      (anular ? revertirAnulacion : revertirEjecucion)(e.datos(), id, res.deshacer);
      e.markDirty();
      avisar('No se pudo guardar: la orden sigue pendiente. Volvé a intentar.', { tipo: 'mal' });
    } else {
      avisar('✓ ' + o.ot + (anular ? ' anulada' : ' ejecutada'), { tipo: 'ok' });
    }
    /* Siempre: la cabecera y la banda muestran el estado real. */
    if (alCambiar) alCambiar();
    _avisarModo();
  } finally {
    _enVuelo = false;
  }
}

/** Guarda en DATOS() la orden recién impresa (guardarOrdenHoja). Si ya hay
 *  OTRA pendiente con el mismo tipo y N°, pregunta antes de reemplazarla; si
 *  la persona la deja, devuelve `{ ok:false, error:'pendiente' }` y no se
 *  toca nada. No guarda en el servidor: eso lo hace quien llama. */
export async function guardarOrdenHojaConfirmando(orden){
  const datos = entornoOT().datos();
  let res = guardarOrdenHoja(datos, orden);
  if (!res.ok && res.error === 'pendiente' && await confirmar(textoPendientePrevia(res.previa)))
    res = guardarOrdenHoja(datos, orden, { reemplazarId: res.previa.id });
  return res;
}

/** Cablea los clics de la cabecera pintada por htmlCabeceraOrden dentro de
 *  `cont`. `reimprimir()` arma de nuevo el papel; `alCambiar()` repinta la
 *  vista tras ejecutar/anular (se haya guardado o se haya deshecho). */
export function cablearCabeceraOrden(cont, id, { reimprimir, alCambiar } = {}){
  if (!cont) return;
  cont.addEventListener('click', e => {
    const btn = e.target.closest('[data-oha]');
    if (!btn) return;
    const accion = btn.dataset.oha;
    if (accion === 'reimprimir'){ if (reimprimir) reimprimir(); return; }
    if (accion === 'ejecutar') _ejecutarOAnular(id, { anular: false, alCambiar });
    else if (accion === 'anular') _ejecutarOAnular(id, { anular: true, alCambiar });
  });
}
