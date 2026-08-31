/**
 * Resumen de cambios entre dos versiones — port de `resumen_cambios()`,
 * `_diff_lotes()` y `_diff_items()` de servidor.py.
 *
 * Es lo que alimenta el botón "🕘 Historial": qué cambió en cada guardado.
 */

import type { Datos } from './validacion';

type Fila = Record<string, unknown>;

/** JSON con las claves ordenadas, para poder comparar filas por igualdad. */
function estable(x: unknown): string {
  if (x === null || typeof x !== 'object') return JSON.stringify(x) ?? 'null';
  if (Array.isArray(x)) return '[' + x.map(estable).join(',') + ']';
  const obj = x as Record<string, unknown>;
  const claves = Object.keys(obj).sort();
  return '{' + claves.map((k) => JSON.stringify(k) + ':' + estable(obj[k])).join(',') + '}';
}

export interface DiffLotes {
  agregados: unknown[];
  eliminados: unknown[];
  editados: unknown[];
}

/**
 * Diff fino del maestro de lotes, usando el número de lote como clave natural.
 *
 * Devuelve los números de lote con su tipo original (normalmente número, no
 * texto), igual que la versión en Python, y ordenados por su representación
 * como texto — que es lo que hacía `sorted(..., key=str)`.
 */
export function diffLotes(viejos: Fila[], nuevos: Fila[]): DiffLotes {
  const A = new Map<string, Fila>();
  const B = new Map<string, Fila>();
  // Valor original del lote por clave, para no convertir números a texto.
  const valor = new Map<string, unknown>();

  for (const l of viejos || []) {
    const k = String(l?.lote);
    A.set(k, l);
    if (!valor.has(k)) valor.set(k, l?.lote);
  }
  for (const l of nuevos || []) {
    const k = String(l?.lote);
    B.set(k, l);
    valor.set(k, l?.lote);
  }

  const resolver = (claves: string[]) => claves.sort().map((k) => valor.get(k));

  const agregados = resolver([...B.keys()].filter((k) => !A.has(k)));
  const eliminados = resolver([...A.keys()].filter((k) => !B.has(k)));
  const editados = resolver(
    [...B.keys()].filter((k) => A.has(k) && estable(B.get(k)) !== estable(A.get(k))),
  );

  return { agregados, eliminados, editados };
}

/**
 * Diff por conteo para secciones sin clave natural (análisis, degustaciones,
 * agregados). Una edición cuenta como 1 alta + 1 baja, igual que en la app local.
 */
export function diffItems(viejos: unknown[], nuevos: unknown[]): { altas: number; bajas: number } {
  const contar = (xs: unknown[]) => {
    const m = new Map<string, number>();
    for (const x of xs || []) {
      const k = estable(x);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const ca = contar(viejos);
  const cb = contar(nuevos);

  let altas = 0;
  for (const [k, n] of cb) altas += Math.max(0, n - (ca.get(k) ?? 0));

  let bajas = 0;
  for (const [k, n] of ca) bajas += Math.max(0, n - (cb.get(k) ?? 0));

  return { altas, bajas };
}

export interface ResumenCambios {
  texto: string;
  detalle: Record<string, unknown>;
}

/** Texto corto y detalle de qué cambió entre dos versiones. */
export function resumenCambios(actual: Datos, nuevo: Datos): ResumenCambios {
  const partes: string[] = [];
  const det: Record<string, unknown> = {};

  const lst = (xs: unknown[]) =>
    xs.slice(0, 10).map(String).join(', ') + (xs.length > 10 ? '…' : '');

  const { agregados, eliminados, editados } = diffLotes(
    (actual.lotes as Fila[]) || [],
    (nuevo.lotes as Fila[]) || [],
  );
  if (agregados.length) partes.push(`+${agregados.length} lote(s): ${lst(agregados)}`);
  if (eliminados.length) partes.push(`−${eliminados.length} lote(s): ${lst(eliminados)}`);
  if (editados.length) partes.push(`${editados.length} lote(s) editado(s): ${lst(editados)}`);
  det.lotes = { agregados, eliminados, editados };

  const secs: [string, string][] = [
    ['analisis', 'análisis'],
    ['degustaciones', 'degustación(es)'],
    ['agregados', 'agregado(s)'],
  ];
  for (const [sec, nombre] of secs) {
    const { altas, bajas } = diffItems(actual[sec] as unknown[], nuevo[sec] as unknown[]);
    if (altas) partes.push(`+${altas} ${nombre}`);
    if (bajas) partes.push(`−${bajas} ${nombre}`);
    det[sec] = { altas, bajas };
  }

  return { texto: partes.join('; ') || 'sin cambios en los datos', detalle: det };
}
