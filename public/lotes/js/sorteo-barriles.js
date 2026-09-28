/* ===== Lotes CIW — dado de la Orden de muestras =====
 *
 * Sortea UN barril lleno por lote para mandarlo a analizar. Logica pura (sin
 * DOM ni fetch) para poder testearla: la vista trae los barriles de
 * /lotes/api/barriles y llama a sortearOrden.
 */
'use strict';

/* Solo los LLENOS: un barril vacio no tiene vino que muestrear. El Mapa escribe
 * el estado en mayusculas ('LLENO', 'VACIO'); se compara sin importar el caso
 * por si alguna fila vieja vino escrita distinto. */
export function barrilesLlenos(barriles){
  return (barriles || []).filter(b =>
    String(b && b.estado || '').trim().toUpperCase() === 'LLENO' &&
    String(b && b.num || '').trim() !== '');
}

/* Numero de un barril lleno al azar, o '' si el lote no tiene ninguno.
 * evitar = el barril que ya tenia la fila: si hay otro candidato, no lo repite,
 * asi que volver a tirar el dado siempre cambia algo (salvo que haya uno solo).
 * azar se inyecta para que el test sea determinista. */
export function sortearBarril(barriles, evitar = '', azar = Math.random){
  let nums = barrilesLlenos(barriles).map(b => String(b.num).trim());
  if (nums.length > 1 && evitar) nums = nums.filter(n => n !== String(evitar));
  if (!nums.length) return '';
  return nums[Math.min(nums.length - 1, Math.floor(azar() * nums.length))];
}

/* Tira el dado sobre toda la orden. porLote = la respuesta de la API
 * ({ '26217': [barriles...] }). Escribe fila.barril en cada fila con lote y
 * devuelve los lotes que se quedaron sin barril, para avisarle al usuario. */
export function sortearOrden(filas, porLote, azar = Math.random){
  const sinBarril = [];
  for (const f of filas){
    const lote = String(f.lote ?? '').trim();
    if (lote === '') continue;
    f.barril = sortearBarril((porLote || {})[lote], f.barril, azar);
    if (f.barril === '' && !sinBarril.includes(lote)) sinBarril.push(lote);
  }
  return { sinBarril };
}
