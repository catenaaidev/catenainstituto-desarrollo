/* ===== Lotes CIW — dosis a mano de la Orden de correccion de SO2 =====
 *
 * La hoja de la orden se ve al lado de la tabla y la dosis de cada renglon se
 * puede escribir encima. Lo escrito NO es solo papel: pasa a ser la dosis de
 * esas vasijas en las filas de _ocBuildRows, y de esas mismas filas salen la
 * tabla, el chip, el papel y la orden guardada (armarOrdenGuardada). Asi lo
 * impreso sigue siendo lo que se guarda y lo que se ejecuta.
 *
 * Las dosis a mano viven en un Map lote -> Map claveVasija -> {mbk_g,
 * ml_solucion}, con las dos formas: cambiar de unidad no las pierde.
 *
 * Modulo puro (sin DOM, sin nucleo.js) para poder testearlo. */
'use strict';

/** Como se identifica una vasija dentro de su lote: por su numero de barril si
 *  tiene, si no por su posicion en l.barricas (tanques, sin ubicar). La
 *  posicion vale mientras no se recargue la orden, y Recargar borra las dosis
 *  a mano. */
export function claveVasija(b, i){
  const num = b && b.num != null ? String(b.num).trim() : '';
  return num ? 'n:' + num : 'i:' + i;
}

/* Gramos de MBK por mL de solucion d1030 para la MISMA correccion. Sale de la
 * formula de _dosis (vista-orden-correccion.js): mbk = x*1.5/1000*2 y
 * ml = x*1.5/55, asi que mbk/ml = 2*55/1000 = 0,11. La solucion esta a 55 g/L
 * de SO2 y el MBK es ~50% SO2 en masa. */
const MBK_G_POR_ML = (2 * 55) / 1000;

/** Lo que se tipeo en la unidad vigente ('sol' = mL de solucion, 'mbk' =
 *  gramos de polvo), dicho de las dos maneras. */
export function dosisDesdeUnidad(valor, unidad){
  const v = Number(valor);
  return unidad === 'mbk'
    ? { mbk_g: v, ml_solucion: v / MBK_G_POR_ML }
    : { mbk_g: v * MBK_G_POR_ML, ml_solucion: v };
}

/** Las filas de _ocBuildRows con las dosis a mano puestas. Cada fila de
 *  barrica sale con `clave` (claveVasija) y `manual`; la del lote con los
 *  totales recalculados desde las dosis que quedaron, igual que hace
 *  _ocBuildRows: el total es la suma por construccion. No toca la entrada. */
export function aplicarManuales(filas, manuales){
  const out = [];
  let lote = null, i = 0, man = null;
  for (const f of filas || []){
    if (f.tipo === 'lote'){
      lote = { ...f, mbk_total_g: 0, ml_total: 0 };
      out.push(lote);
      i = 0;
      man = (manuales && manuales.get(f.lote.lote)) || null;
      continue;
    }
    if (f.tipo !== 'barrica' || !lote){ out.push(f); continue; }
    const clave = claveVasija(f.barrica, i++);
    const m = man && man.get(clave);
    const dosis = m ? { mbk_g: m.mbk_g, ml_solucion: m.ml_solucion } : f.dosis;
    lote.mbk_total_g += dosis.mbk_g;
    lote.ml_total += dosis.ml_solucion;
    out.push({ ...f, clave, manual: !!m, dosis });
  }
  return out;
}
