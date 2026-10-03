/* ===== Lotes CIW — cuentas de la tabla virtual (puras, sin DOM) =====
 * Una tabla virtual dibuja solo las filas que se ven, mas un margen arriba y
 * abajo, y reemplaza el resto por dos filas de relleno con el alto exacto de lo
 * que falta. Asi Analisis tiene ~100 filas en el DOM en vez de 7.000, y cada
 * clic, flecha o cambio de pestaña deja de pagar el layout de la tabla entera.
 *
 * Este archivo son las cuentas: donde empieza cada fila, cual cae en una
 * altura dada y que rango hay que dibujar. Va aparte de tabla-virtual.js para
 * poder testearlo en el runtime de Workers, que no tiene document.
 */
'use strict';

/** Posicion vertical de cada fila: off[i] es donde empieza la fila i y
 *  off[n] el alto total. `altoDe(i)` da el alto de la fila i. */
export function armarOffsets(n, altoDe){
  const off = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) off[i + 1] = off[i] + altoDe(i);
  return off;
}

/** La fila que ocupa la altura `y` (la ultima cuyo comienzo es <= y), acotada
 *  a [0, n-1]. Con n = 0 devuelve 0. Busqueda binaria: off es creciente. */
export function filaEnAltura(off, y){
  const n = off.length - 1;
  if (n <= 0) return 0;
  if (y <= 0) return 0;
  if (y >= off[n]) return n - 1;
  let lo = 0, hi = n - 1;
  while (lo < hi){
    const mid = (lo + hi + 1) >> 1;
    if (off[mid] <= y) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** Las filas que se ven entre las alturas `desde` y `hasta`: {ini, fin} con
 *  fin EXCLUSIVO. */
export function filasVisibles(off, desde, hasta){
  const n = off.length - 1;
  if (n <= 0) return { ini: 0, fin: 0 };
  const ini = filaEnAltura(off, desde);
  const fin = Math.min(n, filaEnAltura(off, Math.max(desde, hasta)) + 1);
  return { ini, fin };
}

/** Que rango dibujar, o null si el que ya esta dibujado alcanza.
 *
 *  Se dibuja lo visible mas `margen` filas de cada lado, y no se vuelve a
 *  dibujar mientras lo visible siga cubierto con al menos medio margen de
 *  sobra: asi una ruedita de mouse no rehace filas en cada evento de scroll, y
 *  un input que se esta editando no se destruye por mover la pagina un poco. */
export function rangoADibujar(n, visible, actual, margen){
  const ini = Math.max(0, visible.ini - margen);
  const fin = Math.min(n, visible.fin + margen);
  if (actual){
    const colchon = Math.floor(margen / 2);
    const cubre = actual.ini <= Math.max(0, visible.ini - colchon)
               && actual.fin >= Math.min(n, visible.fin + colchon);
    if (cubre && actual.fin <= n) return null;
  }
  return { ini, fin };
}

/** Cuanto mover el scroll para que la fila [top, bottom) quede a la vista
 *  dentro de [vista, vista + alto), o null si ya se ve entera. Las alturas
 *  son las de la zona de filas (sin la cabecera fija). */
export function scrollParaVer(top, bottom, vista, alto){
  if (top < vista) return top;
  if (bottom > vista + alto) return bottom - alto;
  return null;
}
