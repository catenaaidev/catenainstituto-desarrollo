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

/* Opciones del desplegable "Barril" de una fila (modo "barriles
 * especificos"): los llenos del lote, primero los que menos veces se
 * muestrearon y despues por numero. veces = Map num -> n, de vecesPorLote. */
export function opcionesBarril(barriles, veces = new Map()){
  return barrilesLlenos(barriles)
    .map(b => { const num = String(b.num).trim(); return { num, veces: veces.get(num) || 0 }; })
    .sort((a, b) => a.veces - b.veces || a.num.localeCompare(b.num, 'es', { numeric: true }));
}

/* El 🎲 chico de UNA fila: sortea solo filas[i]. Los barriles que ya tienen
 * las otras filas del mismo lote cuentan como muestreados, asi no se repiten
 * dentro de la orden. Devuelve el barril elegido ('' si el lote no tiene
 * llenos) y lo deja en filas[i].barril. */
export function sortearFila(filas, i, porLote, azar = Math.random, historial = []){
  const f = filas[i];
  const lote = String(f && f.lote || '').trim();
  if (!f || lote === '') return '';
  const veces = new Map(vecesPorLote(historial)[lote] || []);
  filas.forEach((o, j) => {
    const b = String(o && o.barril || '').trim();
    if (j !== i && b && String(o.lote ?? '').trim() === lote) veces.set(b, (veces.get(b) || 0) + 1);
  });
  f.barril = sortearBarril((porLote || {})[lote], f.barril, azar, veces);
  return f.barril;
}

/* Texto del aviso de la celda Barril cuando el numero escrito no es un barril
 * lleno de ese lote segun el Mapa. '' = sin aviso. No bloquea: el Mapa puede
 * estar atrasado respecto de la bodega. barriles = undefined mientras el Mapa
 * no se consulto (no se avisa a ciegas). */
export function avisoBarril(lote, barril, barriles){
  const num = String(barril ?? '').trim();
  if (!num || !Array.isArray(barriles)) return '';
  const b = barriles.find(x => String(x && x.num || '').trim() === num);
  if (!b) return `El barril ${num} no figura en el lote ${lote} en el Mapa de Barriles.`;
  if (!barrilesLlenos([b]).length) return `El barril ${num} figura vacío en el Mapa de Barriles.`;
  return '';
}

/* "Barriles especificos": cada lote pasa a tener UNA fila por barril lleno
 * (en orden de numero), copiando los datos de su primera fila; el usuario
 * borra a mano los que no quiere. Un lote sin llenos (en tanque) queda con su
 * fila tal cual, y uno que el Mapa no devolvio, tambien. Un lote repetido en
 * la orden no se duplica. soloLotes (Set): expandir solo esos (los que
 * recien entran a la orden), para no revivir barriles que el usuario ya borro.
 * Las filas expandidas llevan porBarril: true. Devuelve filas nuevas, no muta. */
export function expandirPorBarril(filas, porLote, soloLotes = null){
  const out = [];
  const hechos = new Set();
  for (const f of (filas || [])){
    const lote = String(f && f.lote || '').trim();
    if (soloLotes && !soloLotes.has(lote)){ out.push(f); continue; }
    const bs = (porLote || {})[lote];
    const llenos = lote && Array.isArray(bs) ? barrilesLlenos(bs) : [];
    if (!llenos.length){ out.push(f); continue; }
    if (hechos.has(lote)) continue;
    hechos.add(lote);
    llenos.map(b => String(b.num).trim())
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
      .forEach(num => out.push({ ...f, barril: num, porBarril: true }));
  }
  return out;
}

/* Volver a la orden generica: una fila por lote (la primera), sin barril. Las
 * filas sin lote quedan. Devuelve filas nuevas, no muta. */
export function colapsarPorLote(filas){
  const vistos = new Set();
  const out = [];
  for (const f of (filas || [])){
    const lote = String(f && f.lote || '').trim();
    if (lote && vistos.has(lote)) continue;
    if (lote) vistos.add(lote);
    if (!lote){ out.push(f); continue; }
    const { porBarril, ...resto } = f;
    out.push({ ...resto, barril: '' });
  }
  return out;
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
