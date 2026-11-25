/* ===== Prensas — reglas puras de un lote =====
 * Sin DOM ni red: se importa tal cual en los tests (runtime de Workers).
 * Las usa app.js por el puente (puente.js → window.PrensasMods).
 *
 * Vaciado: en Prensas no hay estado ni fecha de vaciado; el único dato es
 * litros. Un lote sin litros cargados (recién creado) NO es vaciado: si no,
 * nacería atenuado justo cuando se lo está completando.
 *
 * Tiempo de un análisis: el número de mes solo no alcanza con dos vendimias
 * (un lote 2025 analizado en enero de 2026 tiene mes 1). Se compara la fecha
 * ISO y, si falta, año del lote + mes. */
'use strict';
import { anioDeLote } from '../../shared/anios.js';

const numero = v => {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
};

export function esVaciado(lote){
  if (!lote) return false;
  return numero(lote.litros) === 0;
}

const dos = n => String(n).padStart(2, '0');

export function claveTiempo(a){
  const f = a && a.fecha;
  if (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f)) return f.slice(0, 10);
  const anio = anioDeLote(a && a.lote);
  const mes = numero(a && a.mes);
  if (anio === null || mes === null) return '0000-00-00';
  return `${anio}-${dos(mes)}-00`;
}

export function ordenarPorTiempo(rows){
  return rows.map((r, i) => [r, i])
    .sort((x, y) => claveTiempo(x[0]).localeCompare(claveTiempo(y[0])) || x[1] - y[1])
    .map(x => x[0]);
}

export function ultimoAnalisis(rows){
  if (!rows || !rows.length) return null;
  return rows.reduce((a, b) => (claveTiempo(b) >= claveTiempo(a) ? b : a));
}
