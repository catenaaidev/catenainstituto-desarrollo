/* ===== Lotes CIW — dado de la Orden de muestras =====
 *
 * Sortea UN barril lleno por lote para mandarlo a analizar, rotando: no repite
 * un barril hasta haber pasado por todos los del lote. Logica pura (sin DOM ni
 * fetch) para poder testearla: la vista trae los barriles de
 * /lotes/api/barriles y el historial de DATOS().muestreos_barriles.
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

/* Cuantas veces se muestreo cada barril, por lote: { '26217': Map(num -> n) }.
 * historial = DATOS().muestreos_barriles, una fila por barril impreso en una
 * orden ({ lote, barril, fecha, orden }). */
export function vecesPorLote(historial){
  const out = {};
  for (const h of (historial || [])){
    const lote = String(h && h.lote || '').trim(), num = String(h && h.barril || '').trim();
    if (!lote || !num) continue;
    const m = out[lote] || (out[lote] = new Map());
    m.set(num, (m.get(num) || 0) + 1);
  }
  return out;
}

/* Numero de un barril lleno al azar, o '' si el lote no tiene ninguno.
 * veces = Map num -> cuantas veces ya se muestreo: se sortea SOLO entre los que
 * menos veces salieron, asi que el dado recorre todos los barriles del lote
 * antes de repetir uno (y un barril recien llenado entra primero). No hace
 * falta "reiniciar la vuelta": cuando todos llegan a 1, el minimo pasa a 1.
 * evitar = el barril que ya tenia la fila: si hay otro candidato, no lo repite,
 * asi que volver a tirar el dado siempre cambia algo (salvo que haya uno solo).
 * azar se inyecta para que el test sea determinista. */
export function sortearBarril(barriles, evitar = '', azar = Math.random, veces = new Map()){
  let nums = barrilesLlenos(barriles).map(b => String(b.num).trim());
  if (nums.length){
    const min = Math.min(...nums.map(n => veces.get(n) || 0));
    nums = nums.filter(n => (veces.get(n) || 0) === min);
  }
  if (nums.length > 1 && evitar) nums = nums.filter(n => n !== String(evitar));
  if (!nums.length) return '';
  return nums[Math.min(nums.length - 1, Math.floor(azar() * nums.length))];
}

/* Tira el dado sobre toda la orden. porLote = la respuesta de la API
 * ({ '26217': [barriles...] }); historial = DATOS().muestreos_barriles.
 * Escribe fila.barril en cada fila con lote y devuelve los lotes que se
 * quedaron sin barril, para avisarle al usuario. Si un lote aparece dos veces
 * en la orden, cada fila recibe un barril distinto. */
export function sortearOrden(filas, porLote, azar = Math.random, historial = []){
  const sinBarril = [];
  const veces = vecesPorLote(historial);
  for (const f of filas){
    const lote = String(f.lote ?? '').trim();
    if (lote === '') continue;
    const v = veces[lote] || (veces[lote] = new Map());
    f.barril = sortearBarril((porLote || {})[lote], f.barril, azar, v);
    if (f.barril === '') { if (!sinBarril.includes(lote)) sinBarril.push(lote); }
    else v.set(f.barril, (v.get(f.barril) || 0) + 1);
  }
  return { sinBarril };
}

/* Filas nuevas para DATOS().muestreos_barriles al imprimir la orden. No repite
 * un (lote, barril, fecha) que ya este anotado: imprimir dos veces la misma
 * orden no cuenta doble. */
export function registrosDeImpresion(filas, historial, fecha, orden){
  const ya = new Set((historial || []).map(h => [h.lote, h.barril, h.fecha].join('|')));
  const out = [];
  for (const f of filas){
    const lote = String(f.lote ?? '').trim(), barril = String(f.barril ?? '').trim();
    if (!lote || !barril) continue;
    const k = [lote, barril, fecha].join('|');
    if (ya.has(k)) continue;
    ya.add(k);
    out.push({ lote, barril, fecha, orden: String(orden || '').trim() });
  }
  return out;
}
