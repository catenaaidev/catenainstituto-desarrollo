/* ===== Lotes CIW — cm de merma a litros (puro) =====
 *
 * Manda la Cap REAL del padron de vasijas: la tabla de cubicacion solo dice
 * cuantos litros FALTAN para llenar el tanque a esa altura de merma
 * (tabla(0) - tabla(cm)), y eso se le resta a la Cap REAL. Entre dos cm de la
 * tabla se interpola en linea recta, igual que el HTML de cubicaciones. */
'use strict';

import { TABLAS_CUBICACION } from './cubicacion-tablas.js';

const r1 = x => Math.round(x * 10) / 10;

function leerCm(cm){
  if (cm === '' || cm == null) return null;
  const x = typeof cm === 'number' ? cm : parseFloat(String(cm).replace(',', '.'));
  return Number.isFinite(x) && x >= 0 ? x : null;
}

export function litrosPorCm(vasija, cm){
  const t = vasija && TABLAS_CUBICACION[vasija.tabla];
  if (!t) return { litros: null, faltante: null, error: 'sin-tabla' };
  const x = leerCm(cm);
  if (x == null) return { litros: null, faltante: null, error: 'cm-invalido' };
  const pts = t.puntos;
  const max = pts[pts.length - 1][0];
  if (x > max) return { litros: null, faltante: null, error: 'fuera-de-rango', max };

  let y = pts[0][1];
  for (let i = 0; i < pts.length - 1; i++){
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (x >= x0 && x <= x1){ y = y0 + (y1 - y0) * (x - x0) / (x1 - x0); break; }
  }
  const faltante = r1(pts[0][1] - y);
  const cap = Number(vasija.cap_real) > 0 ? Number(vasija.cap_real) : pts[0][1];
  return { litros: Math.max(0, r1(cap - faltante)), faltante, error: null };
}
