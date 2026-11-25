/**
 * Validaciones de guardado — port fiel de `validar_datos()` de servidor.py.
 *
 * Estas reglas ya frenaron guardados malos en la app local. Se conservan tal
 * cual, con los mismos umbrales y los mismos textos de error, para que el
 * equipo vea exactamente los mismos avisos que hoy.
 */

import { diffLotes } from './cambios';

/** Más del 20 % de una sección… */
export const PERDIDA_PCT = 0.2;
/** …y al menos 10 items: recién ahí se frena el guardado. */
export const PERDIDA_MIN = 10;

export const SECCIONES = ['lotes', 'analisis', 'degustaciones', 'agregados'] as const;
export type Seccion = (typeof SECCIONES)[number];

/**
 * Qué secciones tiene un módulo y cuáles son obligatorias.
 * Prensas y Lotes comparten la lógica de validación pero no las secciones.
 */
export interface ConfigSecciones {
  secciones: readonly string[];
  requeridas: readonly string[];
}

/* `ordenes_hojas` (órdenes de papel de Prensas guardadas al imprimir — entrega 3
 * de Órdenes de trabajo, 2026-11-04): opcional, con control de lista y freno. */
export const SECCIONES_PRENSAS: ConfigSecciones = {
  secciones: ['lotes', 'analisis', 'degustaciones', 'agregados', 'ordenes_hojas'],
  requeridas: ['lotes', 'analisis'],
};

/**
 * En Lotes, `movimientos` NO es obligatoria: el datos.json migrado desde el
 * Excel no la trae y tiene que poder guardarse igual. Lo mismo `ordenes_trabajo`
 * (las OT de trasiego, 2026-09-23): va en `secciones` y no en `requeridas` para
 * que tenga el control de lista y el freno anti-borrado sin exigirla.
 * `vasijas` (padrón de vasijas fijas) y `mermas` (barricas mermas), 2026-10-01:
 * mismo criterio. `agenda` (decisiones a mano de la Agenda, 2026-10-14), igual.
 * `recorridas` (Inventario de tanques, 2026-10-14), igual.
 * `ordenes_correccion` (Orden de corrección guardada al imprimir, 2026-11-02), igual.
 * `ordenes_hojas` (Órdenes de papel guardadas al imprimir: muestras, micro,
 * agregados — entrega 2 de Órdenes de trabajo, 2026-11-04), igual.
 */
export const SECCIONES_LOTES: ConfigSecciones = {
  secciones: ['lotes', 'analisis', 'movimientos', 'ordenes_trabajo', 'vasijas', 'mermas', 'agenda', 'recorridas', 'ordenes_correccion', 'ordenes_hojas'],
  requeridas: ['lotes', 'analisis'],
};

export interface Datos {
  meta?: Record<string, unknown>;
  lotes?: unknown[];
  analisis?: unknown[];
  degustaciones?: unknown[];
  agregados?: unknown[];
  [k: string]: unknown;
}

function esObjetoPlano(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Cuántos registros de una sección desaparecen en este guardado.
 *
 * `lotes` se mide por IDENTIDAD (el número de lote, su clave natural), no por
 * cantidad. Contar longitudes era ciego al intercambio: un guardado que borra 20
 * lotes y agrega otros 20 daba cero y pasaba sin frenar, que es exactamente la
 * forma que tiene la falla que este freno tiene que atajar — un cliente con el
 * maestro viejo en memoria empujándolo encima del de la bodega.
 *
 * El resto de las secciones sigue con el delta de longitudes. No es un olvido:
 * no tienen clave natural, y la única identidad disponible sería la fila entera,
 * con lo cual una EDICIÓN contaría como baja y el freno empezaría a saltar sobre
 * guardados legítimos. Ese agujero (intercambio en análisis, degustaciones,
 * agregados y movimientos) sigue abierto a propósito.
 *
 * El Math.max hace de red: si `diffLotes` subestima —por ejemplo si las filas no
 * traen el campo `lote` y todas colapsan en la misma clave— el delta de
 * longitudes garantiza que el freno nuevo nunca quede más débil que el viejo.
 */
function perdidosDe(
  sec: string,
  actual: Datos,
  nuevo: Datos,
  va: number,
  vn: number,
): number {
  if (sec !== 'lotes') return va - vn;
  const { eliminados } = diffLotes(
    (actual.lotes as Record<string, unknown>[]) || [],
    (nuevo.lotes as Record<string, unknown>[]) || [],
  );
  return Math.max(eliminados.length, va - vn);
}

/**
 * Valida un guardado antes de escribirlo. Devuelve la lista de errores
 * (vacía = todo bien).
 *
 * Los errores de ESTRUCTURA no se pueden forzar. El freno de pérdida masiva sí
 * (forzar = true, después de que el usuario confirme).
 */
export function validarDatos(
  nuevo: unknown,
  actual: Datos,
  forzar = false,
  cfg: ConfigSecciones = SECCIONES_PRENSAS,
): string[] {
  if (!esObjetoPlano(nuevo)) return ['el guardado no es un objeto JSON válido'];

  const errores: string[] = [];
  const n = nuevo as Datos;

  // Secciones obligatorias.
  for (const sec of cfg.requeridas) {
    if (!Array.isArray(n[sec])) {
      errores.push(`falta la sección '${sec}' (o no es una lista)`);
    }
  }
  // Secciones opcionales: si vienen, tienen que ser listas.
  for (const sec of cfg.secciones) {
    if (cfg.requeridas.includes(sec)) continue;
    if (n[sec] !== undefined && n[sec] !== null && !Array.isArray(n[sec])) {
      errores.push(`la sección '${sec}' no es una lista`);
    }
  }
  if (n.meta !== undefined && n.meta !== null && !esObjetoPlano(n.meta)) {
    errores.push("la sección 'meta' no es un objeto");
  }
  if (errores.length) return errores;

  // Filas que no son objetos.
  for (const sec of cfg.secciones) {
    const arr = (n[sec] as unknown[]) || [];
    const malas = arr.filter((x) => !esObjetoPlano(x)).length;
    if (malas) {
      errores.push(`la sección '${sec}' tiene ${malas} fila(s) inválida(s)`);
    }
  }
  if (errores.length) return errores;

  // Freno anti-borrado masivo.
  if (!forzar) {
    for (const sec of cfg.secciones) {
      const va = ((actual[sec] as unknown[]) || []).length;
      const vn = ((n[sec] as unknown[]) || []).length;
      const perdidos = perdidosDe(sec, actual, n, va, vn);
      if (perdidos >= PERDIDA_MIN && va && perdidos / va > PERDIDA_PCT) {
        errores.push(`se perderían ${perdidos} de ${va} ${sec} en un solo guardado`);
      }
    }
  }

  return errores;
}

/**
 * Registros cuyo lote no existe en el maestro. No bloquea el guardado: es un
 * dato a corregir (número mal tipeado, o lote borrado).
 * Port de `registros_huerfanos()`.
 */
export function registrosHuerfanos(d: Datos): string[] {
  const lotes = new Set(((d.lotes as Record<string, unknown>[]) || []).map((l) => String(l?.lote)));
  const out: string[] = [];

  const secs: [Seccion, string][] = [
    ['analisis', 'análisis'],
    ['degustaciones', 'degustaciones'],
    ['agregados', 'agregados'],
  ];

  for (const [sec, nombre] of secs) {
    const filas = (d[sec] as Record<string, unknown>[]) || [];
    const huer = [...new Set(filas.map((x) => String(x?.lote)).filter((l) => !lotes.has(l)))].sort();
    if (huer.length) {
      const lista = huer.slice(0, 10).join(', ') + (huer.length > 10 ? '…' : '');
      out.push(
        `hay ${nombre} de lote(s) que no existen en el maestro: ${lista} ` +
          `(revisá el número de lote o dalos de alta).`,
      );
    }
  }
  return out;
}

/**
 * Adelanta meta.mes_actual al mes calendario en curso. Nunca lo retrocede.
 * Guarda el año junto al mes para detectar bien el paso de diciembre a enero,
 * donde el número de mes BAJA.
 *
 * Port de `avanzar_mes_si_corresponde()`. Devuelve [anterior, nuevo] si
 * adelantó algo, o null.
 *
 * El "hoy" se calcula en la zona de la bodega, no en UTC: el servidor de
 * Cloudflare puede estar en cualquier lado.
 */
export function avanzarMesSiCorresponde(d: Datos, tz: string, ahora = new Date()): [number, number] | null {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' });
  const partes = fmt.formatToParts(ahora);
  const anio = Number(partes.find((p) => p.type === 'year')!.value);
  const mes = Number(partes.find((p) => p.type === 'month')!.value);

  const meta = (d.meta ??= {}) as Record<string, unknown>;
  const anioGuardado = meta.mes_actual_anio;
  const mesGuardado = meta.mes_actual;

  // Primera vez sobre datos existentes: no reescribimos el mes cargado a mano,
  // solo empezamos a rastrear su año.
  if (anioGuardado === undefined || anioGuardado === null || mesGuardado === undefined || mesGuardado === null) {
    meta.mes_actual_anio = anio;
    if (meta.mes_actual === undefined || meta.mes_actual === null) meta.mes_actual = mes;
    return null;
  }

  const ag = Number(anioGuardado);
  const mg = Number(mesGuardado);
  if (anio > ag || (anio === ag && mes > mg)) {
    meta.mes_actual = mes;
    meta.mes_actual_anio = anio;
    return [mg, mes];
  }
  return null;
}

/** Fecha y hora en la zona de la bodega, con el formato de la app: YYYY-MM-DD HH:MM:SS */
export function ahoraBodega(tz: string, ahora = new Date()): string {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return fmt.format(ahora).replace('T', ' ');
}
