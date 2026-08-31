/* ===== Lotes CIW — aritmetica del rectangulo de seleccion =====
 * Funciones puras, sin DOM. Una celda es {f, c} con f = indice de fila y
 * c = indice de columna, ambos base 0 y relativos a lo que se ve en pantalla
 * (o sea, despues de ordenar y filtrar).
 */
'use strict';

/** Normaliza un rectangulo para que f1<=f2 y c1<=c2, sin importar hacia donde
 *  se arrastro el mouse. */
export function rect(f1, c1, f2, c2){
  return {
    f1: Math.min(f1, f2), c1: Math.min(c1, c2),
    f2: Math.max(f1, f2), c2: Math.max(c1, c2),
  };
}

export function rectAlto(r){  return r ? r.f2 - r.f1 + 1 : 0; }
export function rectAncho(r){ return r ? r.c2 - r.c1 + 1 : 0; }

export function rectIguales(a, b){
  if (!a || !b) return a === b;
  return a.f1===b.f1 && a.c1===b.c1 && a.f2===b.f2 && a.c2===b.c2;
}

export function rectContiene(r, f, c){
  if (!r) return false;
  return f >= r.f1 && f <= r.f2 && c >= r.c1 && c <= r.c2;
}

/** Celdas del rectangulo en orden de lectura: fila por fila, y dentro de cada
 *  fila de izquierda a derecha. Ese orden es el que espera armarTSV. */
export function rectCeldas(r){
  const out = [];
  if (!r) return out;
  for (let f = r.f1; f <= r.f2; f++)
    for (let c = r.c1; c <= r.c2; c++)
      out.push({ f, c });
  return out;
}

/** Recorta el rectangulo a una tabla de nFilas x nCols. Devuelve null si no
 *  queda ninguna celda adentro (p. ej. las filas se filtraron y ya no existen). */
export function rectRecortar(r, nFilas, nCols){
  if (!r || nFilas <= 0 || nCols <= 0) return null;
  const f1 = Math.max(0, r.f1), c1 = Math.max(0, r.c1);
  const f2 = Math.min(nFilas - 1, r.f2), c2 = Math.min(nCols - 1, r.c2);
  if (f1 > f2 || c1 > c2) return null;
  return { f1, c1, f2, c2 };
}

/** True si estos indices de fila forman un tramo sin huecos.
 *
 *  Lo usa la restauracion de la seleccion: cuando las filas seleccionadas
 *  sobreviven a un reordenamiento pero quedan DISPERSAS, el rectangulo minimo que
 *  las contiene arrastraria filas que el usuario nunca eligio, y un borrado o un
 *  pegado escribiria en ellas. Sin huecos, el rectangulo es fiel; con huecos, hay
 *  que descartar la seleccion. */
export function sonContiguos(indices){
  if (!indices || indices.length === 0) return false;
  const min = Math.min(...indices), max = Math.max(...indices);
  return max - min + 1 === indices.length;
}

/** Que celdas hay que marcar y desmarcar para pasar de `viejo` a `nuevo`.
 *  Durante el arrastre se repinta SOLO esta diferencia: marcar las ~3.200
 *  celdas de Lotes en cada mousemove se notaria. */
export function rectDiferencia(viejo, nuevo){
  const agregar = [], quitar = [];
  for (const cel of rectCeldas(nuevo))
    if (!rectContiene(viejo, cel.f, cel.c)) agregar.push(cel);
  for (const cel of rectCeldas(viejo))
    if (!rectContiene(nuevo, cel.f, cel.c)) quitar.push(cel);
  return { agregar, quitar };
}
