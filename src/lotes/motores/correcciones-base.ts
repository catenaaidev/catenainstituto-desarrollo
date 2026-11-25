/**
 * Lo que fml.ts y correccion.ts necesitan saber de las correcciones de SO2:
 * cuál fue la última REAL y si hubo una medición de SO2 después.
 *
 * Vive aparte porque correccion.ts importa fml.ts: si fml.ts importara
 * correccion.ts habría un ciclo. Este módulo solo depende de fml-condiciones.
 */

import { valorValido, fechaDia, DIA_MS, type Fila } from './fml-condiciones';

const fechaMs = fechaDia;
const aIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Las "72 h" del pedido: la corrección guarda solo el día, así que son 3 días. */
export const REANALISIS_DIAS = 3;

/**
 * SO2 del registro de análisis, SIN caer en correccion.so2_libre_actual.
 *
 * Para la regla de supresión no puede caer ahí: si lo hiciera, la corrección
 * contaría como su propia evidencia de remedición y la rama de los ±5 ppm
 * compararía un número contra sí mismo.
 */
export function so2Medido(a: Fila): number | null {
  for (const campo of ['so2_libre_actual', 'so2_libre']) {
    const v = valorValido(a[campo]);
    if (v !== null) return v;
  }
  return null;
}

export interface Correccion {
  fecha: number;
  fecha_iso: string;
  ot: string;
  so2_prev: number | null;
}

/**
 * La corrección más reciente del lote que cuenta como ejecutada, o null.
 *
 * Solo cuenta si tiene ot_n no vacío: datos.json trae un objeto correccion en
 * los 1972 análisis por la migración del Excel, y la mayoría son cáscaras. Sin
 * este filtro la regla suprimiría los 291 lotes.
 *
 * so2_prev sale SOLO de correccion.so2_libre_actual y queda en null si falta:
 * de las 663 correcciones históricas con ot_n solo 6 traen el dato, y caer al
 * so2_libre del análisis producía 44 supresiones falsas.
 *
 * La fecha de la corrección manda sobre la del análisis: la orden se ejecuta
 * después de imprimirse y el operario fecha lo que realmente hizo.
 *
 * Las ANULADAS se saltean. Anular es el "me equivoqué al ejecutar la orden": la
 * entrada se conserva en la bitácora con quién y cuándo la anuló (un registro
 * de calidad no borra en silencio), pero para la regla es como si no existiera
 * y el lote vuelve a proponerse.
 *
 * Ojo con el detalle de tomar la última NO anulada en vez de mirar solo la
 * última: si un lote tuvo dos correcciones y se anula la segunda, la primera
 * sigue valiendo. Anular un error no borra la historia previa.
 */
export function ultimaCorreccion(analisisDelLote: Fila[]): Correccion | null {
  let mejor: Correccion | null = null;
  for (const a of analisisDelLote) {
    const c = a.correccion;
    if (!c || typeof c !== 'object' || Array.isArray(c)) continue;
    const cc = c as Fila;
    if (verazPython(cc.anulada)) continue;
    const ot = String(cc.ot_n ?? '').trim();
    if (!ot) continue;
    // || y no ??: la cascara de correccion trae fecha '' cuando nadie la
    // completo, y con ?? ese '' ganaba, fechaMs daba null y la correccion con
    // OT se descartaba (el lote volvia a la orden y se dosificaba dos veces).
    const f = fechaMs(String(cc.fecha ?? '').trim() || a.fecha_analisis);
    if (f === null) continue;
    if (mejor === null || f > mejor.fecha) {
      mejor = { fecha: f, fecha_iso: aIso(f), ot, so2_prev: valorValido(cc.so2_libre_actual) };
    }
  }
  return mejor;
}

/**
 * Veracidad al estilo Python, porque el original de esta decisión es
 * `motor_correccion.py` (`if c.get('anulada')`) y las capas tienen que coincidir
 * en TODOS los bordes. JS y Python no opinan igual: `{}` y `[]` son truthy en JS
 * y falsy en Python. Sin esto un `anulada: {}` quedaría anulado para la bitácora
 * (tachado, con sello) y vigente para la regla, o sea que el lote seguiría
 * suprimido mientras la pantalla dice que se canceló.
 *
 * Es el espejo de `esAnulada`/`_veraz` en `public/lotes/js/so2-bitacora.js`: si
 * cambia uno, tiene que cambiar el otro.
 */
export function verazPython(v: unknown): boolean {
  if (!v) return false; // null, false, '', 0, undefined, NaN
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

/**
 * SO2 de la última medición REAL posterior a `corte`, o null.
 *
 * Estricto (> corte, no >=): las fechas son de día y no se sabe si la muestra
 * se sacó antes o después de tirar el MBK; y el registro que CONTIENE la
 * corrección lleva esa misma fecha, así que con >= se validaría a sí misma.
 */
export function ultimoSo2Posterior(analisisDelLote: Fila[], corte: number): number | null {
  let mejor: [number, number] | null = null;
  for (const a of analisisDelLote) {
    const f = fechaMs(a.fecha_analisis);
    if (f === null || f <= corte) continue;
    const s = so2Medido(a);
    if (s === null) continue;
    if (mejor === null || f > mejor[0]) mejor = [f, s];
  }
  return mejor ? mejor[1] : null;
}

/**
 * ¿Hay que volver a analizar el lote por una corrección de SO2?
 *
 * Sí cuando la última corrección real (con OT y no anulada) cumplió `dias` y
 * desde entonces no se midió SO2. El análisis posterior tiene que traer SO2:
 * un pH suelto no confirma que la dosis llegó.
 */
export function reanalisisPendiente(
  analisisDelLote: Fila[],
  hoy: number,
  dias: number = REANALISIS_DIAS,
): { activa: boolean; desde: string | null } {
  const c = ultimaCorreccion(analisisDelLote);
  if (!c) return { activa: false, desde: null };
  if (ultimoSo2Posterior(analisisDelLote, c.fecha) !== null) return { activa: false, desde: null };
  const vence = c.fecha + dias * DIA_MS;
  if (hoy < vence) return { activa: false, desde: null };
  return { activa: true, desde: aIso(vence) };
}
