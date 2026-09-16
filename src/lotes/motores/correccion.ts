/**
 * Orden de corrección de SO2 por barrica — port de motor_correccion.py.
 *
 * Módulo puro: recibe los datos y el mapa ya normalizado, y devuelve las filas
 * listas para imprimir. La hoja es efímera por diseño: cuando sale de la
 * impresora la corrección todavía no ocurrió, así que registrarla sería anotar
 * algo que puede no hacerse.
 *
 * La dosis se calcula POR BARRICA con los litros reales de cada una, no
 * repartiendo un total. Sobre los datos de la bodega 106 de 489 barricas están
 * en MERMO y el mapa guarda sus litros reales: dosificar por capacidad le daría
 * a una barrica de 200 L con 50 L adentro cuatro veces lo que le toca.
 *
 * Filtro de volumen dosificable: un lote sin volumen dosificable no produce
 * fila, y se registra en sin_volumen[] para que nunca desaparezca sin dejar
 * rastro. El filtro opera sobre el volumen efectivo, no sobre lo declarado,
 * porque hay lotes que declaran 0 L pero el mapa les ve barricas con vino real
 * (el 26285 tiene 150 L en 3 barricas y se dosifica sobre eso).
 */

import {
  calcularCorreccionSo2,
  criteriosEfectivos,
  objetivoSo2Libre,
  so2Molecular,
  analisisPorLote,
  ordenarPorFecha,
  valorValido,
  type Fila,
} from './fml';
import { cruzar, esSeriePrensa } from './cruce';
import { normalizarLote } from './linaje';
import type { MapaNormalizado, Unidad } from './mapa';

/**
 * Ventana de supresión. 30 días sale del cruce de dos mediciones sobre los
 * datos reales: el ciclo mediano entre análisis de SO2 es de 21 días (p75=41) y
 * la corrección histórica más reciente es de hace 43. La banda segura es 21–42;
 * 30 es el centro. Subirlo a 60 empieza a comerse la data vieja.
 */
export const VENTANA_SUPRESION_DIAS = 30;

/**
 * Si el SO2 no se movió más que esto desde la corrección, o la muestra es
 * anterior a que se tirara el MBK, o la corrección no se reflejó. En cualquiera
 * de los dos casos volver a dosificar sería doble dosis.
 */
export const UMBRAL_REPETICION_PPM = 5.0;

/**
 * Los grupos NO cambian la estructura de las filas: todas son barricas. Solo
 * cambian la advertencia que se imprime. Eso resuelve bien los lotes mixtos,
 * cuyo volumen de tanque quedaría sin dosificar si el grupo decidiera la
 * estructura.
 */
export const GRUPO_NORMAL = 'normal';
export const GRUPO_MARCADO = 'marcado';
export const GRUPO_TANQUE_GRANDE = 'tanque_grande';
export const GRUPO_SIN_UBICAR = 'sin_ubicar';

const VEREDICTOS_MARCADOS = ['difiere', 'sin_envase'];

const DIA_MS = 86_400_000;

/** Número finito o null. Descarta NaN e infinitos. */
function num(x: unknown): number | null {
  if (x === null || x === undefined || x === '') return null;
  const v = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(v) ? v : null;
}

function fechaMs(iso: unknown): number | null {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(s + 'T00:00:00Z');
  return Number.isNaN(t) ? null : t;
}

const aIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * (mbk_g, ml_solución). Reusa la fórmula del Excel desde fml en vez de
 * reimplementarla: pasando 0 como actual, la diferencia que calcula es la que
 * le damos.
 */
function dosis(diferencia: number, litros: number): [number | null, number | null] {
  const r = calcularCorreccionSo2(0.0, diferencia, litros);
  return [r.mbk_a_agregar, r.ml_exactos];
}

export interface FilaBarrica {
  num: string;
  cap: unknown;
  estado: string;
  vasija: string;
  litros_usados: number;
  litros_de_capacidad: boolean;
  mbk_g: number | null;
  ml_solucion: number | null;
}

function filaBarrica(u: Unidad, diferencia: number): FilaBarrica {
  let litros = num(u.litros);
  let deCapacidad = false;
  if (litros === null || litros <= 0) {
    litros = num(u.cap) ?? 0;
    deCapacidad = true;
  }
  const [mbk, ml] = dosis(diferencia, litros);
  return {
    num: u.num || '',
    cap: u.cap,
    estado: u.estado || '',
    vasija: '',
    litros_usados: litros,
    litros_de_capacidad: deCapacidad,
    mbk_g: mbk,
    ml_solucion: ml,
  };
}

/**
 * Volumen sin barrica identificada: la porción en tanque grande, o un lote que
 * el mapa no ubica. `num` vacío a propósito: es lo que el operario ve en blanco
 * y tiene que completar a mano.
 */
function filaSinBarrica(vasija: unknown, litros: number, diferencia: number): FilaBarrica {
  const [mbk, ml] = dosis(diferencia, litros);
  return {
    num: '',
    cap: null,
    estado: '',
    vasija: String(vasija ?? ''),
    litros_usados: litros,
    litros_de_capacidad: false,
    mbk_g: mbk,
    ml_solucion: ml,
  };
}

/**
 * SO2 libre de un análisis, cayendo en correccion.* si la fila no lo trae.
 *
 * Divergencia con so2LibreDe() de fml-condiciones.ts: esta función no descarta
 * el placeholder 0. so2LibreDe() lo descarta porque el tablero nunca toma el 0
 * como medición real; aquí se conserva para no cambiar el comportamiento de la
 * orden de corrección, que es una decisión de producto pendiente.
 */
function so2LibreConCorreccion(a: Fila): number | null {
  for (const campo of ['so2_libre_actual', 'so2_libre']) {
    let v = valorValido(a[campo]);
    if (v === null && a.correccion && typeof a.correccion === 'object') {
      v = valorValido((a.correccion as Fila)[campo]);
    }
    if (v !== null) return v;
  }
  return null;
}

/**
 * (so2_libre, ph) de la ÚLTIMA medición válida del lote, para calcular la
 * diferencia objetivo − actual que determina la dosis.
 *
 * El pH sale de la misma muestra que el SO2 cuando la trae, porque el molecular
 * es una propiedad del par (libre, pH).
 *
 * Tres divergencias conocidas con la alarma so2_no_ok del motor FML (decisión
 * de producto pendiente, no tocar sin revisión):
 *  1. Esta función no descarta el placeholder 0 (so2LibreDe() de fml-condiciones sí).
 *  2. El borde del piso difiere: el motor da no_ok con libre <= piso; la orden
 *     dosifica cuando so2 < objetivo, o sea que libre == piso puede producir
 *     corrección aquí pero no alarma allá.
 *  3. La orden ignora so2_aplica: dosifica aunque el proyecto tenga so2_aplica=no.
 */
function ultimaMedicion(analisisDelLote: Fila[]): [number | null, number | null] {
  const ordenados = ordenarPorFecha(analisisDelLote);
  let phLote: number | null = null;
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const v = valorValido(ordenados[i].ph);
    if (v !== null) {
      phLote = v;
      break;
    }
  }
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const a = ordenados[i];
    const s = so2LibreConCorreccion(a);
    if (s === null) continue;
    const ph = valorValido(a.ph);
    return [s, ph !== null ? ph : phLote];
  }
  return [null, phLote];
}

/**
 * SO2 del registro de análisis, SIN caer en correccion.so2_libre_actual.
 *
 * Para la regla de supresión no puede caer ahí: si lo hiciera, la corrección
 * contaría como su propia evidencia de remedición y la rama de los ±5 ppm
 * compararía un número contra sí mismo.
 */
function so2Medido(a: Fila): number | null {
  for (const campo of ['so2_libre_actual', 'so2_libre']) {
    const v = valorValido(a[campo]);
    if (v !== null) return v;
  }
  return null;
}

interface Correccion {
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
function ultimaCorreccion(analisisDelLote: Fila[]): Correccion | null {
  let mejor: Correccion | null = null;
  for (const a of analisisDelLote) {
    const c = a.correccion;
    if (!c || typeof c !== 'object' || Array.isArray(c)) continue;
    const cc = c as Fila;
    if (verazPython(cc.anulada)) continue;
    const ot = String(cc.ot_n ?? '').trim();
    if (!ot) continue;
    const f = fechaMs(cc.fecha ?? a.fecha_analisis);
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
function verazPython(v: unknown): boolean {
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
function ultimoSo2Posterior(analisisDelLote: Fila[], corte: number): number | null {
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

function grupoDe(veredicto: string | undefined, unidades: Unidad[], vasijaGrande: number): string {
  if (unidades.length) {
    return VEREDICTOS_MARCADOS.includes(veredicto ?? '') ? GRUPO_MARCADO : GRUPO_NORMAL;
  }
  if (vasijaGrande > 0) return GRUPO_TANQUE_GRANDE;
  return GRUPO_SIN_UBICAR;
}

export interface LoteOrden {
  lote: string;
  variedad: string;
  proyecto: string;
  etapa: string;
  ph: number;
  so2_libre: number;
  molecular_actual: number | null;
  objetivo_libre: number;
  diferencia: number;
  manda: string;
  grupo: string;
  veredicto: string;
  severidad: string | null;
  litros_declarados: number;
  litros_mapa: number;
  delta: number;
  litros_dosificados: number;
  posiciones: string[];
  barricas: FilaBarrica[];
  mbk_total_g: number;
  ml_total: number;
  corregido_en: Record<string, unknown> | null;
}

export interface Orden {
  procedencia: unknown;
  lotes: LoteOrden[];
  no_calculables: { lote: string; variedad: string; so2_libre: number | null; ph: number | null; motivo: string }[];
  sin_volumen: string[];
  suprimidos: Record<string, unknown>[];
  resumen: Record<string, unknown>;
}

/**
 * Filas de la orden de corrección, agrupadas por lote.
 * `hoy` en milisegundos UTC del día.
 */
export function armarOrden(datos: Record<string, unknown>, mapa: MapaNormalizado, hoy: number): Orden {
  const lotes = (datos.lotes as Fila[]) ?? [];
  const config = ((datos.config as Fila)?.criterios_fml as Record<string, unknown>) ?? {};

  const informe = cruzar(lotes, mapa);
  const porLoteCruce = new Map(informe.lotes.map((v) => [v.lote, v]));
  const posiciones = mapa.posiciones ?? new Map<string, string[]>();
  const unidadesPorLote = mapa.unidades_por_lote ?? new Map<string, Unidad[]>();

  // Reusa analisisPorLote para descartar los registros con usar_registro='no'.
  // Si se indexara datos.analisis directamente, el tablero ignoraría un SO2 mal
  // medido pero la orden dosificaría sobre él.
  const analisisPorL = analisisPorLote(datos);

  const resultados: LoteOrden[] = [];
  const noCalculables: Orden['no_calculables'] = [];
  const sinVolumen: string[] = [];
  const suprimidos: Record<string, unknown>[] = [];

  for (const l of lotes) {
    const L = normalizarLote(l.lote);
    if (!L || esSeriePrensa(L)) continue;

    // --- Volumen dosificable: antes de cualquier otra rama ---
    // No depende del SO2 ni del pH: si no hay nada que dosificar, el lote no
    // entra en la orden, cualquiera sea su estado de SO2.
    const unidades = unidadesPorLote.get(L) ?? [];
    const vasijaGrande = num(l.vasija_grande) ?? 0;
    const v = porLoteCruce.get(L);
    const litrosDeclarados = v?.litros_declarados ?? 0;

    const litrosMapa = unidades.reduce((s, u) => s + (num(u.litros) ?? num(u.cap) ?? 0), 0);
    let volumenDosificable = litrosMapa + vasijaGrande;
    if (volumenDosificable <= 0) volumenDosificable = litrosDeclarados || 0;
    if (volumenDosificable <= 0) {
      sinVolumen.push(L);
      continue;
    }

    const eff = criteriosEfectivos(config, l.variedad, l.proyecto);
    const [so2, ph] = ultimaMedicion(analisisPorL.get(L) ?? []);
    const objetivo = objetivoSo2Libre(ph, eff);

    if (so2 === null || objetivo === null) {
      noCalculables.push({
        lote: L,
        variedad: String(l.variedad ?? ''),
        so2_libre: so2,
        ph,
        motivo: so2 === null ? 'sin SO2 valido' : 'sin pH valido',
      });
      continue;
    }
    if (so2 >= objetivo) continue;

    // --- Regla de supresión ---
    // Va DESPUÉS del filtro de objetivo a propósito: "solo si el objetivo no se
    // logró" ya lo garantiza el continue de arriba, y con el objetivo
    // recalculado con el pH de hoy, no con el congelado en la OT.
    let corregidoEn: Record<string, unknown> | null = null;
    const C = ultimaCorreccion(analisisPorL.get(L) ?? []);
    if (C !== null) {
      const edad = Math.round((hoy - C.fecha) / DIA_MS);
      const posterior = ultimoSo2Posterior(analisisPorL.get(L) ?? [], C.fecha);
      const base = { ot: C.ot, fecha: C.fecha_iso, so2_prev: C.so2_prev, edad_dias: edad };

      // 0 <= es intencional: una corrección fechada en el futuro daría edad
      // negativa, que satisfaría el <= y suprimiría un lote que puede necesitar
      // SO2. Ante la duda, se muestra el vino.
      if (edad >= 0 && edad <= VENTANA_SUPRESION_DIAS) {
        if (posterior === null) {
          suprimidos.push({
            ...base,
            lote: L,
            variedad: l.variedad ?? '',
            motivo: `corregido en OT ${C.ot}, sin análisis nuevo`,
          });
          continue;
        }
        // Sin so2_prev la rama de los ±5 ppm no es calculable: ante la duda se
        // muestra el vino.
        if (C.so2_prev !== null && Math.abs(posterior - C.so2_prev) <= UMBRAL_REPETICION_PPM) {
          suprimidos.push({
            ...base,
            lote: L,
            variedad: l.variedad ?? '',
            motivo: `corregido en OT ${C.ot}, el SO₂ no se movió`,
          });
          continue;
        }
        corregidoEn = { ...base, sin_analisis: false };
      } else if (posterior === null) {
        // Vencida la ventana el lote vuelve, pero si todavía no lo remidieron el
        // SO2 que se muestra es ANTERIOR a la corrección y la dosis sale de un
        // número viejo. El cartel no caduca.
        corregidoEn = { ...base, sin_analisis: true };
      }
    }

    const diferencia = objetivo - so2;
    const barricas = unidades.map((u) => filaBarrica(u, diferencia));

    // NO agregar la fila de tanque cuando el veredicto es 'solo_representacion':
    // ese veredicto significa "las barricas del mapa SON el volumen de
    // vasija_grande, no un volumen adicional". Sin este guard, vasija_grande se
    // dosifica dos veces (medido: 339,7 g de MBK extra sobre cuatro lotes).
    const veredictoLote = v?.veredicto ?? '';
    if (vasijaGrande > 0 && veredictoLote !== 'solo_representacion') {
      barricas.push(filaSinBarrica(l.vasija_actual, vasijaGrande, diferencia));
    }
    if (!barricas.length) {
      barricas.push(filaSinBarrica(l.vasija_actual, litrosDeclarados, diferencia));
    }

    const objetivoMol = num(eff.so2_molecular_objetivo) ?? 0;
    const piso = num(eff.so2_libre_piso) ?? 0;
    const manda = objetivoMol * (1 + Math.pow(10, ph! - 1.8)) < piso ? 'piso' : 'molecular';

    resultados.push({
      lote: L,
      variedad: String(l.variedad ?? ''),
      proyecto: String(l.proyecto ?? ''),
      etapa: String(l.etapa ?? ''),
      ph: ph!,
      so2_libre: so2,
      molecular_actual: so2Molecular(so2, ph),
      objetivo_libre: objetivo,
      diferencia,
      manda,
      grupo: grupoDe(v?.veredicto, unidades, vasijaGrande),
      veredicto: v?.veredicto ?? '',
      severidad: v?.severidad ?? null,
      litros_declarados: litrosDeclarados,
      litros_mapa: v?.litros_mapa ?? 0,
      delta: v?.delta ?? 0,
      litros_dosificados: barricas.reduce((s, b) => s + b.litros_usados, 0),
      posiciones: posiciones.get(L) ?? [],
      barricas,
      mbk_total_g: barricas.reduce((s, b) => s + (b.mbk_g ?? 0), 0),
      ml_total: barricas.reduce((s, b) => s + (b.ml_solucion ?? 0), 0),
      corregido_en: corregidoEn,
    });
  }

  // Por urgencia: la diferencia objetivo − actual es cuánto le falta al lote
  // para estar protegido. Ordenar por ese déficit descendente pone primero al
  // que más necesita; alfabético no le dice nada al operario.
  resultados.sort((a, b) => b.objetivo_libre - b.so2_libre - (a.objetivo_libre - a.so2_libre));

  const grupos: Record<string, number> = {};
  for (const r of resultados) grupos[r.grupo] = (grupos[r.grupo] ?? 0) + 1;

  return {
    procedencia: mapa.procedencia ?? {},
    lotes: resultados,
    no_calculables: noCalculables.sort((a, b) => (a.lote < b.lote ? -1 : a.lote > b.lote ? 1 : 0)),
    sin_volumen: [...sinVolumen].sort(),
    suprimidos: suprimidos.sort((a, b) =>
      String(a.lote) < String(b.lote) ? -1 : String(a.lote) > String(b.lote) ? 1 : 0,
    ),
    resumen: {
      lotes: resultados.length,
      barricas: resultados.reduce((s, r) => s + r.barricas.length, 0),
      mbk_total_g: resultados.reduce((s, r) => s + r.mbk_total_g, 0),
      grupos,
      no_calculables: noCalculables.length,
      sin_volumen: sinVolumen.length,
      suprimidos: suprimidos.length,
    },
  };
}
