/**
 * Motor de reglas FML — port de motor_fml.py.
 *
 * Los umbrales son POR VARIEDAD Y PROYECTO:
 *   default ⊕ override de variedad ⊕ override de proyecto.
 *
 * Este archivo decide qué lote está en condición y cuál necesita atención, así
 * que cada regla se portó literal. Los tests de test/lotes-fml.test.ts son el
 * port de tests/test_motor_fml.py: si divergen, este archivo está mal.
 */

import { litrosDeEnvases } from './envases';

export interface Criterios {
  hace_fml: string;
  fa_azucar_reductor_max: number;
  fml_malico_finalizada: number;
  fml_malico_2ultimas: number;
  so2_molecular_objetivo: number;
  so2_libre_piso: number;
  ph_max: number;
  av_max: number;
  av_delta_max: number;
  av_delta_dias: number;
  frecuencia_no_terminada: number;
  frecuencia_terminada: number;
  so2_caida_max: number;
  so2_aplica: string;
  ph_max_inclusive: string;
  [k: string]: unknown;
}

export const CRITERIOS_DEFAULT: Criterios = {
  hace_fml: 'si',
  fa_azucar_reductor_max: 5.0,
  fml_malico_finalizada: 0.2,
  fml_malico_2ultimas: 0.5,
  so2_molecular_objetivo: 0.38,
  so2_libre_piso: 25.0,
  ph_max: 3.75,
  av_max: 0.8,
  av_delta_max: 0.3,
  av_delta_dias: 15,
  frecuencia_no_terminada: 15,
  frecuencia_terminada: 30,
  so2_caida_max: 12.0,
  so2_aplica: 'si',
  ph_max_inclusive: 'no',
};

export const ACCIONES: Record<string, string> = {
  sin_analisis_valido: 'hacer OT y analizar',
  frecuencia_vencida: 'hacer OT y analizar',
  fa_no_finalizada: 'seguir control de FA',
  fml_no_finalizada: 'seguir control de FML',
  so2_no_ok: 'revisar ajuste SO2/pH',
  ph_no_ok: 'revisar ajuste SO2/pH',
  no_lleno: 'dar lleno o achicar',
  av_alerta: 'revisar urgente y confirmar analisis',
  datos_operativos_incompletos: 'completar Mermo/FML en LOTES',
};

/** Marca de dato medido pero inválido. No es lo mismo que "sin dato". */
export const INVALIDO = -999;

const INOC_PAT = /vp41|bacterias?|inoc|inoculad/i;

export type Fila = Record<string, unknown>;

// ------------------------------------------------------------- normalización

/**
 * Quita tildes, mayúsculas y puntuación para comparar nombres de variedad y
 * proyecto. Espejo de normalizar_variedad() y de js/criterios.js.
 */
export function normalizarVariedad(valor: unknown): string {
  const txt = valor == null ? '' : String(valor);
  return txt
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // marcas de combinación (tildes)
    .toLowerCase()
    .replace(/\n/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Aplica sobre `base` el override cuya clave normaliza igual que `clave`.
 * Se detiene en la primera coincidencia, igual que el original.
 */
function aplicarOverride(
  base: Record<string, unknown>,
  tabla: Record<string, unknown> | undefined | null,
  clave: unknown,
): void {
  const objetivo = normalizarVariedad(clave);
  for (const [nombre, override] of Object.entries(tabla ?? {})) {
    if (normalizarVariedad(nombre) === objetivo) {
      Object.assign(base, (override as Record<string, unknown>) ?? {});
      break;
    }
  }
}

/**
 * Resuelve los umbrales para un lote.
 *
 * El orden de las dos llamadas ES la precedencia: variedad primero y proyecto
 * después, así el proyecto pisa clave por clave lo que define y hereda de la
 * variedad lo que no. Invertirlas dejaría sin efecto al override de proyecto.
 *
 * Recibe la config APLANADA ({default, por_variedad, por_proyecto}).
 */
export function criteriosEfectivos(
  config: Record<string, unknown> | null | undefined,
  variedad: unknown,
  proyecto: unknown = null,
): Criterios {
  const cfg = config ?? {};
  const base: Record<string, unknown> = { ...CRITERIOS_DEFAULT };
  Object.assign(base, (cfg.default as Record<string, unknown>) ?? {});
  aplicarOverride(base, cfg.por_variedad as Record<string, unknown>, variedad);
  aplicarOverride(base, cfg.por_proyecto as Record<string, unknown>, proyecto);
  return base as Criterios;
}

/**
 * Aplana `config.criterios_fml` para que criteriosEfectivos lo entienda.
 * Port de reporte.normalizar_config().
 */
export function normalizarConfig(datos: Record<string, unknown>): Record<string, unknown> {
  let config = (datos.config as Record<string, unknown>) ?? {};
  if ('criterios_fml' in config) {
    config = { ...((config.criterios_fml as Record<string, unknown>) ?? {}) };
  }
  return { ...datos, config };
}

// ------------------------------------------------------------------ helpers

function num(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  if (typeof x === 'boolean') return null;
  const v = typeof x === 'number' ? x : Number(String(x).trim());
  return Number.isNaN(v) ? null : v;
}

/** Día en UTC, para restar fechas sin que el huso mueva un día. */
function fecha(iso: unknown): number | null {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(s + 'T00:00:00Z');
  return Number.isNaN(t) ? null : t;
}

const DIA_MS = 86_400_000;
const FECHA_MAX = Number.MAX_SAFE_INTEGER;

/** Análisis ordenados por fecha ascendente; los que no tienen fecha van al final. */
export function ordenarPorFecha(analisis: Fila[]): Fila[] {
  return [...(analisis ?? [])].sort(
    (a, b) => (fecha(a.fecha_analisis) ?? FECHA_MAX) - (fecha(b.fecha_analisis) ?? FECHA_MAX),
  );
}

/** null o -999 => inválido. */
export function valorValido(x: unknown): number | null {
  const v = num(x);
  return v === null || v === INVALIDO ? null : v;
}

// Alias cortos de uso interno. Los nombres exportados son los largos porque
// etapas.ts los reusa, igual que motor_etapas.py importa los privados de
// motor_fml para tratar el -999 y el orden por fecha exactamente igual.
const ordenar = ordenarPorFecha;
const valido = valorValido;

function ultimoValido(analisis: Fila[], metrica: string): [number | null, number | null] {
  for (let i = analisis.length - 1; i >= 0; i--) {
    const v = valido(analisis[i][metrica]);
    if (v !== null) return [v, fecha(analisis[i].fecha_analisis)];
  }
  return [null, null];
}

/**
 * Litros del lote. `litros_actuales` es la fuente de verdad; si falta, se
 * reconstruye desde el desglose de envases.
 */
function litros(lote: Fila): number {
  const v = num(lote.litros_actuales);
  return v !== null ? v : litrosDeEnvases(lote);
}

function so2Libre(a: Fila): number | null {
  for (const campo of ['so2_libre_actual', 'so2_libre']) {
    let v = valido(a[campo]);
    if (v === null && a.correccion && typeof a.correccion === 'object') {
      v = valido((a.correccion as Fila)[campo]);
    }
    if (v !== null) return v;
  }
  return null;
}

// -------------------------------------------------------------------- reglas

export function evaluarAvAlerta(analisis: Fila[], eff: Criterios): boolean {
  const ordenados = ordenar(analisis);
  // La ÚLTIMA medición con dato de AV manda.
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const a = ordenados[i];
    const raw = num(a.av);
    if (raw === null) continue;
    if (raw === INVALIDO) return true;

    const ultimo = raw;
    const fUltimo = fecha(a.fecha_analisis);
    if (ultimo > eff.av_max) return true;

    // Salto brusco respecto de una medición anterior cercana.
    for (let j = ordenados.length - 1; j >= 0; j--) {
      const prev = ordenados[j];
      const fp = fecha(prev.fecha_analisis);
      if (fp === null || fUltimo === null || fp >= fUltimo) continue;
      const pav = valido(prev.av);
      if (pav === null) continue;
      if (fUltimo - fp <= eff.av_delta_dias * DIA_MS && ultimo - pav > eff.av_delta_max) {
        return true;
      }
    }
    return false;
  }
  return false;
}

function fmlEstado(analisis: Fila[], eff: Criterios, lote: Fila): string {
  const hace = eff.hace_fml ?? 'si';
  const decisionLote = String(lote.hace_fml ?? '').trim().toLowerCase();
  const excluidaLote = String(lote.fml_excluida ?? '').trim().toLowerCase();
  if (excluidaLote === 'si' || decisionLote === 'no' || hace === 'no') return 'excluida';

  const malicos = ordenar(analisis)
    .map((a) => valido(a.malico))
    .filter((v): v is number => v !== null);

  if (!malicos.length) return 'sin_dato';

  const ultimo = malicos[malicos.length - 1];
  if (ultimo < eff.fml_malico_finalizada) return 'finalizada';
  if (
    malicos.length >= 2 &&
    malicos[malicos.length - 1] < eff.fml_malico_2ultimas &&
    malicos[malicos.length - 2] < eff.fml_malico_2ultimas
  ) {
    return 'finalizada';
  }
  return 'no_finalizada';
}

function faEstado(analisis: Fila[], eff: Criterios): string {
  const [v] = ultimoValido(ordenar(analisis), 'azucar_reductor');
  if (v === null) return 'sin_dato';
  return v > eff.fa_azucar_reductor_max ? 'no_finalizada' : 'finalizada';
}

function estadoLlenado(lote: Fila): string {
  const mermo = String(lote.mermo ?? '').trim().toLowerCase();
  if (mermo === 'si') return 'no_lleno';
  if (mermo === 'no') return 'lleno';
  return 'desconocido';
}

export function detectarInoculado(analisisDelLote: Fila[]): string {
  for (const a of analisisDelLote ?? []) {
    const corr = ((a ?? {}).correccion as Fila) ?? {};
    const texto = String((a ?? {}).comentario ?? '') + ' ' + String(corr.otro ?? '');
    if (INOC_PAT.test(texto)) return 'si';
  }
  return 'desconocido';
}

// ------------------------------------------------------------------ química

/** SO2 molecular (Henderson-Hasselbalch): libre / (1 + 10^(pH − 1.8)). */
export function so2Molecular(so2libre: unknown, ph: unknown): number | null {
  const s = valido(so2libre);
  const p = valido(ph);
  if (s === null || p === null) return null;
  return s / (1 + Math.pow(10, p - 1.8));
}

/**
 * SO2 libre objetivo para llegar al molecular objetivo a ese pH, nunca por
 * debajo del piso. Es la inversión algebraica de so2Molecular().
 *
 * El piso existe porque a pH bajo el objetivo molecular cae a 5–9 mg/L: protege
 * microbiológicamente pero no deja reserva antioxidante. Como los pH de la
 * bodega se concentran entre 3,2 y 3,6, el piso gobierna la mayoría de los
 * casos, y es el número que decide cuántos lotes entran a la orden de corrección.
 *
 * Sin pH válido devuelve null: adivinarlo daría dosis inventadas.
 */
export function objetivoSo2Libre(ph: unknown, eff: Criterios): number | null {
  const p = valido(ph);
  if (p === null) return null;
  const pisoRaw = num(eff.so2_libre_piso);
  const piso = pisoRaw === null ? 0 : pisoRaw;
  const objetivoMol = num(eff.so2_molecular_objetivo);
  if (objetivoMol === null) return piso;
  return Math.max(objetivoMol * (1 + Math.pow(10, p - 1.8)), piso);
}

/**
 * Corrección de SO2 (fórmulas del Excel, solución d1030 ~55 g/L).
 * diferencia = deseado − actual; MBK [g] = ((dif·L·1.5)/1000)·2;
 * mL solución = (dif·L·1.5)/55.
 */
export function calcularCorreccionSo2(
  so2LibreActual: unknown,
  so2LibreDeseado: unknown,
  litrosLote: unknown,
): { diferencia: number | null; mbk_a_agregar: number | null; ml_exactos: number | null } {
  const a = num(so2LibreActual);
  const d = num(so2LibreDeseado);
  const L = num(litrosLote);
  if (a === null || d === null || L === null) {
    return { diferencia: null, mbk_a_agregar: null, ml_exactos: null };
  }
  const dif = d - a;
  return {
    diferencia: dif,
    mbk_a_agregar: ((dif * L * 1.5) / 1000) * 2,
    ml_exactos: (dif * L * 1.5) / 55,
  };
}

/** Métricas de una fila de análisis fuera de criterio (para pintar en rojo). */
export function flagsAnalisis(analisisRow: Fila | null, eff: Criterios): string[] {
  const a = analisisRow ?? {};
  const fuera: string[] = [];

  const ph = valido(a.ph);
  if (ph !== null && ph >= eff.ph_max) fuera.push('ph');

  const avRaw = num(a.av);
  const avVal = valido(a.av);
  if (avRaw === INVALIDO || (avVal !== null && avVal > eff.av_max)) fuera.push('av');

  const mal = valido(a.malico);
  if (mal !== null && mal > eff.fml_malico_2ultimas) fuera.push('malico');

  const gf = valido(a.gluc_fruc);
  if (gf !== null && gf > 3.0) fuera.push('gluc_fruc');

  const az = valido(a.azucar_reductor);
  if (az !== null && az > eff.fa_azucar_reductor_max) fuera.push('azucar_reductor');

  const so2 = valido(a.so2_libre);
  const objetivoSo2 = objetivoSo2Libre(ph, eff);
  if (so2 !== null && objetivoSo2 !== null && so2 < objetivoSo2) fuera.push('so2_libre');

  return fuera;
}

// ------------------------------------------------------------------ por lote

export interface ResultadoLote {
  lote: unknown;
  variedad: unknown;
  litros: number;
  activo: boolean;
  fa_estado: string;
  fml_estado: string;
  so2_ok: boolean | null;
  ph_ok: boolean | null;
  av_alerta: boolean;
  estado_llenado: string;
  dias_desde_analisis: number | null;
  frecuencia_max: number;
  vencido: boolean;
  alarmas: string[];
  ultima_fecha: string | null;
  inoculado: string;
}

export function evaluarLote(
  lote: Fila,
  analisisDelLote: Fila[],
  config: Record<string, unknown>,
  hoy: number,
): ResultadoLote {
  const eff = criteriosEfectivos(config, lote.variedad, lote.proyecto);
  const ordenados = ordenar(analisisDelLote);
  const litrosLote = litros(lote);
  const fml = fmlEstado(ordenados, eff, lote);
  const fa = faEstado(ordenados, eff);

  const [phVal] = ultimoValido(ordenados, 'ph');
  const phOk = phVal === null ? null : phVal < eff.ph_max;

  // La ÚLTIMA medición válida, no la mejor, y juzgada contra el objetivo que
  // corresponde al pH de esa misma muestra: el molecular es una propiedad del
  // par (libre, pH), así que mezclar el SO2 de una muestra con el pH de otra
  // daría un veredicto que no describe a ninguna. Si la muestra no trae pH, se
  // cae al último pH válido del lote.
  let so2Ok: boolean | null = null;
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const a = ordenados[i];
    const s = so2Libre(a);
    if (s === null) continue;
    let phMuestra = valido(a.ph);
    if (phMuestra === null) phMuestra = phVal;
    const objetivo = objetivoSo2Libre(phMuestra, eff);
    if (objetivo !== null) so2Ok = s >= objetivo;
    break;
  }

  const avAlerta = evaluarAvAlerta(ordenados, eff);

  const fechas = ordenados
    .map((a) => fecha(a.fecha_analisis))
    .filter((f): f is number => f !== null);
  const ultima = fechas.length ? Math.max(...fechas) : null;
  const dias = ultima !== null ? Math.round((hoy - ultima) / DIA_MS) : null;

  const frecuencia = fml === 'no_finalizada' ? eff.frecuencia_no_terminada : eff.frecuencia_terminada;
  const vencido = dias !== null && dias > frecuencia;

  const llenado = estadoLlenado(lote);

  const alarmas: string[] = [];
  const tieneAnalisisValido = ordenados.some(
    (a) => valido(a.ph) !== null || valido(a.av) !== null || valido(a.malico) !== null,
  );
  if (!tieneAnalisisValido) alarmas.push('sin_analisis_valido');
  if (vencido) alarmas.push('frecuencia_vencida');
  if (fa === 'no_finalizada') alarmas.push('fa_no_finalizada');
  if (fml === 'no_finalizada') alarmas.push('fml_no_finalizada');
  if (so2Ok === false) alarmas.push('so2_no_ok');
  if (phOk === false) alarmas.push('ph_no_ok');
  if (llenado === 'no_lleno') alarmas.push('no_lleno');
  if (avAlerta) alarmas.push('av_alerta');
  if (llenado === 'desconocido') alarmas.push('datos_operativos_incompletos');

  const fechasIso = ordenados
    .filter((a) => fecha(a.fecha_analisis) !== null)
    .map((a) => String(a.fecha_analisis));
  const ultimaFecha = fechasIso.length ? fechasIso[fechasIso.length - 1].slice(0, 10) : null;

  return {
    lote: lote.lote,
    variedad: lote.variedad,
    litros: litrosLote,
    activo: litrosLote > 0,
    fa_estado: fa,
    fml_estado: fml,
    so2_ok: so2Ok,
    ph_ok: phOk,
    av_alerta: avAlerta,
    estado_llenado: llenado,
    dias_desde_analisis: dias,
    frecuencia_max: frecuencia,
    vencido,
    alarmas,
    ultima_fecha: ultimaFecha,
    inoculado: detectarInoculado(ordenados),
  };
}

/**
 * Análisis agrupados por lote, salteando los que una excepción marcó como
 * "no usar".
 */
export function analisisPorLote(datos: Record<string, unknown>): Map<string, Fila[]> {
  const excl = new Set<string>();
  for (const e of (datos.excepciones_analisis as Fila[]) ?? []) {
    if (String(e.usar_registro ?? '').trim().toLowerCase() === 'no') {
      excl.add(`${String(e.lote)}|${String(e.fecha_analisis ?? '').slice(0, 10)}`);
    }
  }
  const porLote = new Map<string, Fila[]>();
  for (const a of (datos.analisis as Fila[]) ?? []) {
    const clave = `${String(a.lote)}|${String(a.fecha_analisis ?? '').slice(0, 10)}`;
    if (excl.has(clave)) continue;
    const k = String(a.lote);
    const lista = porLote.get(k);
    if (lista) lista.push(a);
    else porLote.set(k, [a]);
  }
  return porLote;
}

export interface Alarma {
  cantidad: number;
  lotes: string[];
  accion: string;
}

export interface ResultadoEvaluar {
  lotes: ResultadoLote[];
  alarmas: Record<string, Alarma>;
  kpis: { total_activos: number; vencidos: number; condicion_ideal: number };
}

/** Evalúa todos los lotes activos. `hoy` en milisegundos UTC del día. */
export function evaluar(datos: Record<string, unknown>, hoy: number): ResultadoEvaluar {
  const config = (datos.config as Record<string, unknown>) ?? {};
  const porLote = analisisPorLote(datos);

  const resultados: ResultadoLote[] = [];
  for (const lote of (datos.lotes as Fila[]) ?? []) {
    const r = evaluarLote(lote, porLote.get(String(lote.lote)) ?? [], config, hoy);
    if (r.activo) resultados.push(r);
  }

  const alarmas: Record<string, Alarma> = {};
  for (const r of resultados) {
    for (const cond of r.alarmas) {
      const a = (alarmas[cond] ??= { cantidad: 0, lotes: [], accion: ACCIONES[cond] ?? '' });
      a.cantidad += 1;
      a.lotes.push(String(r.lote));
    }
  }

  const ideal = resultados.filter(
    (r) => r.so2_ok && r.ph_ok && r.estado_llenado === 'lleno',
  ).length;

  return {
    lotes: resultados,
    alarmas,
    kpis: {
      total_activos: resultados.length,
      vencidos: resultados.filter((r) => r.vencido).length,
      condicion_ideal: ideal,
    },
  };
}
