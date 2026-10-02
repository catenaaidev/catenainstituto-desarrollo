/**
 * El año (vendimia) de cada lote, para el selector de años de la web.
 *
 * El año no es un campo: sale del número de lote, que en la bodega siempre
 * arranca con los dos dígitos de la cosecha (25137 = 2025, 26001 = 2026). Un
 * lote con otro formato no tiene año y se muestra siempre: esconderlo por un
 * número raro sería perder un lote de vista sin que nadie lo note.
 *
 * Misma regla que public/lotes/js/anios.js; test/lotes-anios.test.mjs
 * verifica que las dos den lo mismo.
 */
import { filasDe } from './fml-condiciones';

export function anioDeLote(lote: unknown): number | null {
  if (typeof lote !== 'number' && typeof lote !== 'string') return null;
  const s = String(lote).trim();
  return /^\d{5}$/.test(s) ? 2000 + Number(s.slice(0, 2)) : null;
}

/** `?anios=2025,2026` → Set. null = no filtrar (falta o no trae ningún año válido). */
export function leerAnios(param: string | null): Set<number> | null {
  if (!param) return null;
  const s = new Set(
    param.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 2000 && n <= 2099),
  );
  return s.size ? s : null;
}

export function enAnios(lote: unknown, anios: Set<number> | null): boolean {
  if (!anios) return true;
  const a = anioDeLote(lote);
  return a === null || anios.has(a);
}

/**
 * El documento con solo los lotes y análisis de esos años, para los motores.
 * Los movimientos van enteros a propósito: el linaje de un 26xxx que viene de
 * un 25xxx (tienePadre, etapas) se tiene que ver aunque 2025 esté apagado.
 */
export function recortarPorAnios<T extends Record<string, unknown>>(datos: T, anios: Set<number> | null): T {
  if (!anios) return datos;
  return {
    ...datos,
    lotes: filasDe(datos.lotes).filter((l) => enAnios(l.lote, anios)),
    analisis: filasDe(datos.analisis).filter((a) => enAnios(a.lote, anios)),
  };
}
