/**
 * Motor de reglas FML — las 11 condiciones del tablero aprobado.
 *
 * Los umbrales son POR VARIEDAD Y PROYECTO:
 *   default ⊕ override de variedad ⊕ override de proyecto.
 *
 * Arrancó como port literal de motor_fml.py, pero el tablero que aprobaron los
 * supervisores corrigió parte de esas reglas (piso de SO₂, pH exclusivo,
 * frecuencia contada desde el control de proceso), así que hoy la referencia es
 * el tablero y no el Python.
 *
 * Cada condición vive como función pura en fml-condiciones.ts; acá sólo se las
 * ensambla en el resultado del lote.
 */

import { litrosDeEnvases } from './envases';
import { normalizarLote } from './linaje';
import {
  num,
  filasDe,
  fechaDia as fecha,
  valorValido,
  ordenarPorFecha,
  INVALIDO,
  DIA_MS,
  phFueraDeCriterio,
  estadoFml,
  estadoFa,
  estadoFrecuencia,
  estadoPh,
  estadoSo2,
  caidaSo2,
  alertaAv,
  tieneAnalisisValido,
  decisionFmlPresente,
  veredictoSo2,
  fmlExcluida,
  so2Aplica,
  so2LibreDe,
  type Fila,
  type ResultadoCaida,
} from './fml-condiciones';

export { valorValido, ordenarPorFecha, INVALIDO, type Fila };

export interface Criterios {
  hace_fml: string;
  fa_azucar_reductor_max: number;
  gluc_fruc_max: number;
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
  // Solo pinta la celda Gluc+Fruc de Analisis; ninguna condicion del tablero
  // lo usa. Antes era un 3.0 fijo en veredictosAnalisis, invisible en la
  // pantalla de criterios.
  gluc_fruc_max: 3.0,
  fml_malico_finalizada: 0.2,
  fml_malico_2ultimas: 0.5,
  so2_molecular_objetivo: 0.38,
  // El tablero aprobado corrige el piso a 20 ppm: con 25 el cruce con el
  // objetivo molecular caia en pH 3,61 y dejaba fuera de criterio a media
  // bodega por reserva antioxidante, no por riesgo microbiologico.
  so2_libre_piso: 20.0,
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

export interface MetaCondicion {
  etiqueta: string;
  accion: string;
}

/** Las 11 condiciones del tablero, en su orden de presentacion. */
export const CONDICIONES: Record<string, MetaCondicion> = {
  sin_analisis_valido: { etiqueta: 'Sin análisis válido', accion: 'hacer OT y analizar' },
  control_proceso_pendiente: { etiqueta: 'Sin control de proceso', accion: 'hacer OT y analizar' },
  frecuencia_vencida: { etiqueta: 'Frecuencia vencida', accion: 'hacer OT y analizar' },
  av_alerta: { etiqueta: 'AV alerta', accion: 'revisar urgente y confirmar analisis' },
  so2_caida_alerta: {
    etiqueta: 'Caída de SO₂ libre',
    accion: 'confirmar SO2; revisar llenado/mermo y evaluar posible desvio microbiologico',
  },
  fa_no_finalizada: { etiqueta: 'FA no finalizada', accion: 'seguir control de FA' },
  fml_no_finalizada: { etiqueta: 'FML no finalizada', accion: 'seguir control de FML' },
  so2_no_ok: { etiqueta: 'SO2 no OK', accion: 'revisar ajuste SO2/pH' },
  ph_no_ok: { etiqueta: 'pH no OK', accion: 'revisar ajuste SO2/pH' },
  no_lleno: { etiqueta: 'No lleno', accion: 'dar lleno o achicar' },
  datos_operativos_incompletos: {
    etiqueta: 'Datos operativos incompletos',
    accion: 'completar Mermo/FML en el lote',
  },
};

/**
 * La accion sugerida es la UNION de las acciones de las condiciones activas,
 * sin repetir y separadas por " | ", igual que la columna accion_sugerida del
 * tablero (p. ej. el lote 26011: "revisar ajuste SO2/pH | completar Mermo/FML
 * en el lote"). No se elige una sola por prioridad.
 *
 * El tablero original decia "completar Mermo/FML en LOTES" porque LOTES era una
 * hoja del Excel; en la web esa hoja no existe, asi que el texto se adapto a
 * "en el lote". Es la unica diferencia de redaccion con el tablero aprobado.
 */
export function accionSugerida(claves: string[]): string {
  const vistas: string[] = [];
  for (const k of claves) {
    const a = CONDICIONES[k]?.accion;
    if (a && !vistas.includes(a)) vistas.push(a);
  }
  return vistas.join(' | ');
}

const INOC_PAT = /vp41|bacterias?|inoc|inoculad/i;

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
      fusionarCriterios(base, override);
      break;
    }
  }
}

/** Claves cuyo valor de fabrica es un numero: lo que llegue se convierte con num(). */
const CLAVES_NUMERICAS = new Set(
  Object.keys(CRITERIOS_DEFAULT).filter((k) => typeof CRITERIOS_DEFAULT[k] === 'number'),
);

/**
 * Copia sobre `base` las claves de `override` que traen un valor de verdad.
 *
 * Un null o un '' NO pisan: son la celda de la pantalla de criterios que se
 * dejo en blanco, o sea "heredar". Con Object.assign pasaban tal cual, y en
 * las comparaciones el null vale 0: un ph_max null ponia a todos en ph_no_ok,
 * un av_max null a todos en AV alerta y una frecuencia null a todos vencidos.
 *
 * Las claves numericas pasan por num(), asi "3,8" o "15" (texto) valen igual
 * que el numero. Si el texto no es un numero tampoco pisa: mejor el umbral
 * heredado que uno inventado.
 */
function fusionarCriterios(base: Record<string, unknown>, override: unknown): void {
  // Object.assign con un texto copia sus letras como claves "0", "1"...
  if (!override || typeof override !== 'object' || Array.isArray(override)) return;
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (CLAVES_NUMERICAS.has(k)) {
      const n = num(v);
      if (n !== null) base[k] = n;
    } else {
      base[k] = v;
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
  fusionarCriterios(base, cfg.default);
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

// Alias corto de uso interno.
const valido = valorValido;

/**
 * Litros del lote. `litros_actuales` es la fuente de verdad; si falta, se
 * reconstruye desde el desglose de envases.
 */
function litros(lote: Fila): number {
  const v = num(lote.litros_actuales);
  return v !== null ? v : litrosDeEnvases(lote);
}

// -------------------------------------------------------------------- reglas
//
// Las reglas por condicion viven en fml-condiciones.ts. Acá quedan sólo las que
// miran la fila del lote (no el historial de análisis) y la química del SO2.

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

/**
 * Veredicto de cada métrica de UNA fila de análisis, para pintar sus celdas.
 *
 * Tres estados, no dos, y esa es toda la razón de ser de esta función: una
 * métrica puede estar `'dentro'`, `'fuera'`, o no tener veredicto — y "no hay
 * veredicto" NO es "está bien". La celda vacía, el -999 del FOSS y el SO2 por
 * encima del piso sin pH con qué calcular el molecular caen todos ahí, y
 * ninguno merece verde. Una métrica sin veredicto no aparece en el mapa.
 *
 * OJO con la diferencia entre "no se puede juzgar" y "no hay nada que
 * corregir". Un málico alto en una variedad que no hace FML, o un SO2 bajo en
 * un proyecto que no lleva sulfitado, NO son casos sin veredicto: son casos
 * donde el criterio no aplica y por lo tanto está todo bien. Esos van 'dentro'
 * (verde). Pintarlos de naranja mandaba a corregir algo que es correcto, y
 * dejarlos sin color hacía dudar de si faltaba el dato.
 *
 * `lote` hace falta justamente para eso: la decisión de FML y la de SO2 son
 * propiedades del lote y del proyecto, no de la fila de análisis. Sin él, el
 * málico se juzga como si todas las variedades hicieran FML.
 *
 * Las dos listas que consume la pantalla (fuera y dentro) se derivan de acá y
 * no se calculan por separado a propósito: con dos funciones espejo, invertir
 * mal un `>` en una de ellas daría una celda verde y roja a la vez, y nadie se
 * enteraría hasta verla.
 */
export type VeredictoMetrica = 'dentro' | 'fuera';

export function veredictosAnalisis(
  analisisRow: Fila | null,
  eff: Criterios,
  lote: Fila | null = null,
): Record<string, VeredictoMetrica> {
  const a = analisisRow ?? {};
  const v: Record<string, VeredictoMetrica> = {};

  const ph = valido(a.ph);
  if (ph !== null) v.ph = phFueraDeCriterio(ph, eff) ? 'fuera' : 'dentro';

  /* La AV tiene un caso propio: el -999 es el FOSS diciendo "corrí y la lectura
   * salió fuera de rango". Es fuera de criterio (hubo medición y no sirve), pero
   * valido() lo convierte en null, así que hay que mirar el crudo antes. */
  const avRaw = num(a.av);
  const avVal = valido(a.av);
  if (avRaw === INVALIDO) v.av = 'fuera';
  else if (avVal !== null) v.av = avVal > eff.av_max ? 'fuera' : 'dentro';

  /* El malico solo se juzga si el lote hace FML. En una variedad blanca el
   * malico alto es lo ESPERADO — no hay malolactica que lo baje — asi que
   * marcarlo fuera de criterio mandaba a corregir algo que esta bien.
   *
   * La decision sale de fmlExcluida(), la misma que usa estadoFml para el
   * tablero, y por eso hace falta el lote: no alcanza con eff.hace_fml de la
   * config, porque la ficha del lote la pisa en las dos direcciones (un
   * Chardonnay con hace_fml 'si' SI se sigue). Con el criterio copiado, esta
   * celda y el tablero podian decir cosas distintas del mismo lote. */
  const mal = valido(a.malico);
  if (mal !== null) {
    v.malico = fmlExcluida(lote ?? {}, eff).excluida
      ? 'dentro'
      : mal > eff.fml_malico_2ultimas ? 'fuera' : 'dentro';
  }

  const gf = valido(a.gluc_fruc);
  if (gf !== null) v.gluc_fruc = gf > eff.gluc_fruc_max ? 'fuera' : 'dentro';

  const az = valido(a.azucar_reductor);
  if (az !== null) v.azucar_reductor = az > eff.fa_azucar_reductor_max ? 'fuera' : 'dentro';

  // El SO2 sale del MISMO veredicto que usa el lote (estadoSo2): dos tramos,
  // so2LibreDe (que descarta el placeholder 0 y mira so2_libre_actual y
  // correccion) y so2_aplica. Aca se juzga una fila sola, sin historial, asi que
  // no hay pH de respaldo: por encima del piso y sin pH propio no hay veredicto
  // y la celda no se pinta, igual que el lote queda 'sin_datos'.
  //
  // so2_molecular lleva el MISMO veredicto que so2_libre y no uno propio contra
  // so2_molecular_objetivo. Parecen lo mismo pero no lo son en el tramo del
  // piso: con libre 15 y pH 3,2 el molecular da 0,44 (por encima del objetivo)
  // y un veredicto propio pintaría esa celda de verde mientras la de al lado
  // sale naranja. La regla de la bodega es de dos tramos y el piso manda, así
  // que las dos celdas dicen lo mismo.
  const libre = so2LibreDe(a);
  let vSo2: VeredictoMetrica | null = null;
  if (!so2Aplica(eff)) {
    // El proyecto no lleva sulfitado: no hay nivel de SO2 que haya que
    // corregir, asi que lo medido esta bien. Sin medicion no se pinta nada:
    // "no hay criterio" no vuelve verde a una celda vacia.
    vSo2 = libre !== null ? 'dentro' : null;
  } else {
    const fuera = veredictoSo2(a, eff).fuera;
    vSo2 = fuera === null ? null : fuera ? 'fuera' : 'dentro';
  }
  if (vSo2 !== null) {
    v.so2_libre = vSo2;
    /* El molecular acompaña al libre, pero solo si hay un numero que mostrar.
     * Sin pH no se puede calcular y la celda sale vacia: pintarla (de cualquier
     * color) seria dar un veredicto sobre un casillero en blanco. Pasaba en el
     * tramo del piso, donde veredictoSo2 dice 'fuera' sin necesitar el pH. */
    if (so2Molecular(a.so2_libre, a.ph) !== null) v.so2_molecular = vSo2;
  }

  return v;
}

/** Métricas de una fila de análisis fuera de criterio (para pintarlas en naranja). */
export function flagsAnalisis(
  analisisRow: Fila | null,
  eff: Criterios,
  lote: Fila | null = null,
): string[] {
  const v = veredictosAnalisis(analisisRow, eff, lote);
  return Object.keys(v).filter((k) => v[k] === 'fuera');
}

/** Métricas de una fila de análisis DENTRO de criterio (para pintarlas en verde). */
export function dentroAnalisis(
  analisisRow: Fila | null,
  eff: Criterios,
  lote: Fila | null = null,
): string[] {
  const v = veredictosAnalisis(analisisRow, eff, lote);
  return Object.keys(v).filter((k) => v[k] === 'dentro');
}

// ------------------------------------------------------------------ por lote

/** Una condicion activa del tablero, con su etiqueta y desde cuando rige. */
export interface CondicionActiva {
  clave: string;
  etiqueta: string;
  accion: string;
  desde: string | null;
}

export interface ResultadoLote {
  lote: unknown;
  variedad: unknown;
  litros: number;
  activo: boolean;

  // --- estados del tablero ---
  fa_estado: string;
  fml_estado: string;
  fml_excluida_origen: 'lote' | 'variedad_blanca' | 'sin_dato';
  estado_frecuencia: 'al_dia' | 'vencido' | 'sin_datos';
  control_proceso_pendiente: boolean;
  ultima_fecha_control: string | null;
  dias_desde_control: number | null;
  so2_estado: 'ok' | 'no_ok' | 'no_aplica' | 'sin_datos';
  so2_libre: number | null;
  so2_libre_fecha: string | null;
  so2_ph_referencia: number | null;
  so2_ph_referencia_fecha: string | null;
  so2_molecular: number | null;
  so2_motivo: string;
  so2_caida: ResultadoCaida;
  ph_estado: 'ok' | 'no_ok' | 'sin_datos';
  av_alerta: boolean;
  av_motivo: 'umbral' | 'aumento' | 'fuera_rango_foss' | null;
  estado_llenado: string;
  inoculado: string;
  inoculado_origen: 'analisis' | 'manual' | null;
  condiciones: CondicionActiva[];
  accion_sugerida: string;

  // --- compatibilidad con Dashboard y Orden de muestras ---
  so2_ok: boolean | null;
  ph_ok: boolean | null;
  vencido: boolean;
  frecuencia_max: number;
  dias_desde_analisis: number | null;
  ultima_fecha: string | null;
  alarmas: string[];
}

/**
 * Ensambla las 11 condiciones del tablero para un lote.
 *
 * No decide nada por su cuenta: cada estado sale de fml-condiciones.ts. Lo que
 * sí resuelve acá es qué condiciones quedan activas, en qué orden se muestran y
 * cómo se traducen a los campos viejos que todavía consumen el Dashboard y la
 * Orden de muestras.
 */
export function evaluarLote(
  lote: Fila,
  analisisDelLote: Fila[],
  config: Record<string, unknown>,
  hoy: number,
): ResultadoLote {
  const eff = criteriosEfectivos(config, lote.variedad, lote.proyecto);
  const analisis = ordenarPorFecha(analisisDelLote);
  const litrosLote = litros(lote);

  const fml = estadoFml(analisis, eff, lote);
  const fa = estadoFa(analisis, eff);
  const frec = estadoFrecuencia(analisis, eff, fml.estado, hoy);
  const ph = estadoPh(analisis, eff);
  const so2 = estadoSo2(analisis, eff);
  const caida = caidaSo2(analisis, eff);
  const av = alertaAv(analisis, eff);
  const llenado = estadoLlenado(lote);
  const hayAnalisis = tieneAnalisisValido(analisis);
  const inoculado = detectarInoculado(analisis);

  const activas: Array<[string, string | null]> = [];
  if (!hayAnalisis) activas.push(['sin_analisis_valido', null]);
  if (hayAnalisis && frec.control_proceso_pendiente) activas.push(['control_proceso_pendiente', null]);
  if (frec.estado === 'vencido') activas.push(['frecuencia_vencida', frec.desde]);
  if (av.alerta) activas.push(['av_alerta', av.desde]);
  if (caida.alerta) activas.push(['so2_caida_alerta', caida.desde]);
  if (fa.estado === 'no_finalizada') activas.push(['fa_no_finalizada', fa.desde]);
  if (fml.estado === 'no_finalizada') activas.push(['fml_no_finalizada', fml.desde]);
  if (so2.estado === 'no_ok') activas.push(['so2_no_ok', so2.desde]);
  if (ph.estado === 'no_ok') activas.push(['ph_no_ok', ph.desde]);
  if (llenado === 'no_lleno') activas.push(['no_lleno', null]);
  if (llenado === 'desconocido' || !decisionFmlPresente(lote, eff)) {
    activas.push(['datos_operativos_incompletos', null]);
  }

  // Orden de presentacion = orden de CONDICIONES.
  const orden = Object.keys(CONDICIONES);
  activas.sort((a, b) => orden.indexOf(a[0]) - orden.indexOf(b[0]));

  const condiciones: CondicionActiva[] = activas.map(([clave, desde]) => ({
    clave,
    etiqueta: CONDICIONES[clave].etiqueta,
    accion: CONDICIONES[clave].accion,
    desde,
  }));
  const alarmas = condiciones.map((c) => c.clave);

  const accion_sugerida = accionSugerida(alarmas);

  const fechas = analisis
    .map((a) => fecha(a.fecha_analisis))
    .filter((f): f is number => f !== null);
  const ultima = fechas.length ? Math.max(...fechas) : null;

  return {
    lote: lote.lote,
    variedad: lote.variedad,
    litros: litrosLote,
    activo: litrosLote > 0,

    fa_estado: fa.estado,
    fml_estado: fml.estado,
    fml_excluida_origen: fml.origen,
    estado_frecuencia: frec.estado,
    control_proceso_pendiente: frec.control_proceso_pendiente,
    ultima_fecha_control: frec.ultima_fecha_control,
    dias_desde_control: frec.dias_desde_control,
    so2_estado: so2.estado,
    so2_libre: so2.libre,
    so2_libre_fecha: so2.libre_fecha,
    so2_ph_referencia: so2.ph_referencia,
    so2_ph_referencia_fecha: so2.ph_referencia_fecha,
    so2_molecular: so2.molecular,
    so2_motivo: so2.motivo,
    so2_caida: caida,
    ph_estado: ph.estado,
    av_alerta: av.alerta,
    av_motivo: av.motivo,
    estado_llenado: llenado,
    inoculado,
    // El motor solo puede decir 'analisis': el valor cargado a mano vive en
    // estado_lote, que el motor no lee. La pestana resuelve el 'manual'.
    inoculado_origen: inoculado === 'si' ? 'analisis' : null,
    condiciones,
    alarmas,
    accion_sugerida,

    // --- compatibilidad con Dashboard y Orden de muestras ---
    so2_ok:
      so2.estado === 'ok' || so2.estado === 'no_aplica'
        ? true
        : so2.estado === 'no_ok'
          ? false
          : null,
    ph_ok: ph.estado === 'ok' ? true : ph.estado === 'no_ok' ? false : null,
    vencido: frec.estado === 'vencido',
    frecuencia_max: frec.frecuencia_max,
    dias_desde_analisis: ultima !== null ? Math.round((hoy - ultima) / DIA_MS) : null,
    ultima_fecha: ultima !== null ? new Date(ultima).toISOString().slice(0, 10) : null,
  };
}

/**
 * Análisis agrupados por lote, salteando los que una excepción marcó como
 * "no usar".
 *
 * La clave es normalizarLote() (texto recortado), la misma que usan vistas,
 * correccion y cruce. Con String() un "26217 " que vino del Excel no
 * encontraba sus análisis: el lote salía "sin análisis válido" teniéndolos, y
 * la excepción "no usar" de ese lote no se aplicaba.
 *
 * Las listas pasan por filasDe(): un excepciones_analisis que no es lista
 * tiraba TypeError y se caían /dashboard, /orden-correccion y el reporte.
 */
export function analisisPorLote(datos: Record<string, unknown>): Map<string, Fila[]> {
  const excl = new Set<string>();
  for (const e of filasDe(datos.excepciones_analisis)) {
    if (String(e.usar_registro ?? '').trim().toLowerCase() === 'no') {
      excl.add(`${normalizarLote(e.lote)}|${String(e.fecha_analisis ?? '').slice(0, 10)}`);
    }
  }
  const porLote = new Map<string, Fila[]>();
  for (const a of filasDe(datos.analisis)) {
    const k = normalizarLote(a.lote);
    const clave = `${k}|${String(a.fecha_analisis ?? '').slice(0, 10)}`;
    if (excl.has(clave)) continue;
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
  kpis: {
    total_activos: number;
    vencidos: number;
    condicion_ideal: number;
    fml_terminada: number;
    frecuencia_al_dia: number;
    so2_conforme: number;
    ph_ok: number;
    lleno: number;
    requieren_accion: number;
  };
}

/** Evalúa todos los lotes activos. `hoy` en milisegundos UTC del día. */
export function evaluar(datos: Record<string, unknown>, hoy: number): ResultadoEvaluar {
  const config = (datos.config as Record<string, unknown>) ?? {};
  const porLote = analisisPorLote(datos);

  const resultados: ResultadoLote[] = [];
  for (const lote of filasDe(datos.lotes)) {
    const r = evaluarLote(lote, porLote.get(normalizarLote(lote.lote)) ?? [], config, hoy);
    if (r.activo) resultados.push(r);
  }

  const alarmas: Record<string, Alarma> = {};
  for (const r of resultados) {
    for (const cond of r.alarmas) {
      const a = (alarmas[cond] ??= {
        cantidad: 0,
        lotes: [],
        accion: CONDICIONES[cond]?.accion ?? '',
      });
      a.cantidad += 1;
      a.lotes.push(normalizarLote(r.lote));
    }
  }

  const cuenta = (p: (r: ResultadoLote) => boolean) => resultados.filter(p).length;
  const so2Conforme = (r: ResultadoLote) => r.so2_estado === 'ok' || r.so2_estado === 'no_aplica';

  return {
    lotes: resultados,
    alarmas,
    kpis: {
      total_activos: resultados.length,
      vencidos: cuenta((r) => r.vencido),
      condicion_ideal: cuenta(
        (r) => so2Conforme(r) && r.ph_estado === 'ok' && r.estado_llenado === 'lleno',
      ),
      fml_terminada: cuenta((r) => r.fml_estado === 'finalizada' || r.fml_estado === 'excluida'),
      frecuencia_al_dia: cuenta((r) => r.estado_frecuencia === 'al_dia'),
      so2_conforme: cuenta(so2Conforme),
      ph_ok: cuenta((r) => r.ph_estado === 'ok'),
      lleno: cuenta((r) => r.estado_llenado === 'lleno'),
      requieren_accion: cuenta((r) => r.alarmas.length > 0),
    },
  };
}
