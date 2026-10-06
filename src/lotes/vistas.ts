/**
 * Armado de las respuestas de Lotes — port de datos_dashboard(), datos_ficha()
 * y analisis_con_flags() de su servidor.py.
 *
 * Funciones puras: reciben los datos y devuelven lo que la pantalla espera.
 * La lectura de la base queda en rutas.ts.
 */

import {
  evaluar,
  analisisPorLote,
  normalizarConfig,
  criteriosEfectivos,
  veredictosAnalisis,
  so2Molecular,
  type Fila,
} from './motores/fml';
import { evaluarEtapa } from './motores/etapas';
import {
  grafo,
  lineaTiempo,
  recorridoVasijas,
  cadenaIdentidad,
  normalizarLote,
  lotesConPadre,
} from './motores/linaje';

/** Agrupa filas por número de lote (texto limpio). */
function porLote(filas: Fila[] | undefined, campo = 'lote'): Map<string, Fila[]> {
  const out = new Map<string, Fila[]>();
  for (const f of filas ?? []) {
    const clave = normalizarLote((f ?? {})[campo]);
    const lista = out.get(clave);
    if (lista) lista.push(f);
    else out.set(clave, [f]);
  }
  return out;
}

/**
 * Resultado del motor FML con etapa, avance e hitos por lote, más la bandeja
 * de confirmación de etapas.
 */
export function datosDashboard(datos: Record<string, unknown>, hoy: number) {
  const d = datos ?? {};
  const config = (d.config as Record<string, unknown>) ?? {};

  const base = evaluar(normalizarConfig(d), hoy) as unknown as Record<string, unknown>;
  // analisisPorLote y no porLote(d.analisis): saltea los "no usar" de
  // excepciones_analisis, igual que evaluar(). Si no, un análisis descartado
  // seguía moviendo la etapa sugerida y los hitos de este mismo tablero.
  const ans = analisisPorLote(d);
  const movs = porLote(d.movimientos as Fila[]);

  // OJO: evaluar() solo trae los ACTIVOS. La bandeja recorre TODOS los lotes,
  // porque un lote recién cerrado tiene litros 0 y su paso a 'cerrado' es
  // justamente el que hay que confirmar.
  const etapas = new Map<string, ReturnType<typeof evaluarEtapa>>();
  const bandeja: Record<string, unknown>[] = [];
  const conPadre = lotesConPadre(d.movimientos as Fila[]);

  for (const l of (d.lotes as Fila[]) ?? []) {
    const clave = normalizarLote((l ?? {}).lote);
    const r = evaluarEtapa(l, ans.get(clave) ?? [], movs.get(clave) ?? [], config, hoy, null, {
      tienePadre: conPadre.has(clave),
    });
    etapas.set(clave, r);

    // Entra a la bandeja si la etapa confirmada difiere de la sugerida, o si el
    // lote no tiene etapa confirmada (nunca pasó por la bandeja).
    if (!(l ?? {}).etapa || r.etapa !== r.etapa_sugerida) {
      bandeja.push({
        lote: clave,
        variedad: (l ?? {}).variedad,
        etapa: r.etapa,
        etapa_sugerida: r.etapa_sugerida,
        pct: r.avance.pct,
      });
    }
  }

  for (const fila of (base.lotes as Fila[]) ?? []) {
    const r = etapas.get(normalizarLote(fila.lote));
    if (!r) continue;
    fila.etapa = r.etapa;
    fila.etapa_sugerida = r.etapa_sugerida;
    fila.pct = r.avance.pct;
    fila.hitos = r.hitos;
  }

  base.bandeja_etapas = bandeja.sort((a, b) =>
    String(a.lote) < String(b.lote) ? -1 : String(a.lote) > String(b.lote) ? 1 : 0,
  );

  // Mapa de etapa/pct para TODOS los lotes (activos e inactivos). Los hitos se
  // omiten: 9 por lote × 291 lotes engordan el payload sin necesidad; la ficha
  // los trae por su cuenta.
  const mapaEtapas: Record<string, unknown> = {};
  for (const [clave, r] of etapas) {
    mapaEtapas[clave] = { etapa: r.etapa, etapa_sugerida: r.etapa_sugerida, pct: r.avance.pct };
  }
  base.etapas = mapaEtapas;

  return base;
}

/** Todo lo que la ficha de un lote necesita. null si el lote no existe. */
export function datosFicha(
  datos: Record<string, unknown>,
  lote: unknown,
  hoy: number,
  etapaForzada: string | null = null,
) {
  const d = datos ?? {};
  const clave = normalizarLote(lote);
  const fila = ((d.lotes as Fila[]) ?? []).find((l) => normalizarLote((l ?? {}).lote) === clave);
  if (!fila) return null;

  const config = (d.config as Record<string, unknown>) ?? {};
  const ans = ((d.analisis as Fila[]) ?? []).filter((a) => normalizarLote((a ?? {}).lote) === clave);
  // Para etapa, hitos y avance solo cuentan los análisis usables (sin los "no
  // usar"), los mismos que ve el tablero. La línea de tiempo sigue recibiendo
  // todos: es el registro de lo que pasó, y un análisis descartado puede
  // llevar una corrección con OT que sí se ejecutó.
  const ansUsables = analisisPorLote(d).get(clave) ?? [];
  const movsTodos = (d.movimientos as Fila[]) ?? [];
  const movsLote = movsTodos.filter((m) => normalizarLote((m ?? {}).lote) === clave);

  const r = evaluarEtapa(fila, ansUsables, movsLote, config, hoy, etapaForzada, {
    tienePadre: lotesConPadre(movsTodos).has(clave),
  });
  const g = grafo(d);

  return {
    lote: { ...fila },
    etapa: r.etapa,
    etapa_sugerida: r.etapa_sugerida,
    avance: r.avance,
    hitos: r.hitos,
    linea_tiempo: lineaTiempo(fila, ans, movsTodos, (fila.historial_etapas as Fila[]) ?? []),
    recorrido_vasijas: recorridoVasijas(clave, movsTodos),
    linaje: g.get(clave) ?? { padres: [], hijos: [], salidas: [] },
    cadena_identidad: cadenaIdentidad(clave, g),
  };
}

/**
 * Veredicto de cada fila de análisis, para pintar sus celdas: `fuera` las
 * métricas que incumplen su criterio y `dentro` las que lo cumplen.
 *
 * Las dos listas salen de la MISMA pasada de veredictosAnalisis, así que una
 * métrica no puede aparecer en las dos. Las que no están en ninguna son las que
 * no tienen veredicto (sin medición, o sin con qué juzgarla): la pantalla las
 * deja sin pintar, que no es lo mismo que pintarlas de verde.
 *
 * criteriosEfectivos espera la config APLANADA: pasarle la externa haría que
 * los flags se calcularan con los criterios de fábrica e ignoraran toda la
 * configuración del usuario.
 */
export function analisisConFlags(datos: Record<string, unknown>) {
  const config = ((datos.config as Fila)?.criterios_fml as Record<string, unknown>) ?? {};
  // normalizarLote de los dos lados: con String() el análisis de "26217" no
  // encontraba al lote "26217 " y se juzgaba con los criterios de fábrica.
  const lotesPorNum = new Map(
    ((datos.lotes as Fila[]) ?? []).map((l) => [normalizarLote((l ?? {}).lote), l ?? {}]),
  );

  return ((datos.analisis as Fila[]) ?? []).map((a, i) => ({
    idx: i,
    lote: a.lote,
    fecha_analisis: a.fecha_analisis,
    ...veredictoDeFila(a, lotesPorNum.get(normalizarLote((a ?? {}).lote)) ?? {}, config),
  }));
}

/* El veredicto de UNA fila de análisis con su lote y la config de criterios.
 * El lote va entero y no solo su variedad: la decision de FML puede venir de su
 * propia ficha (hace_fml / fml_excluida) y pisar a la de config, y de eso
 * depende si el málico de esta fila se juzga o no. Un analisis cuyo lote ya no
 * existe queda con {}, que fmlExcluida trata como "sin decision propia" y
 * resuelve por la variedad. */
function veredictoDeFila(a: Fila, info: Fila, config: Record<string, unknown>) {
  const eff = criteriosEfectivos(config, info.variedad, info.proyecto);
  const v = veredictosAnalisis(a, eff, info);
  return {
    fuera: Object.keys(v).filter((k) => v[k] === 'fuera'),
    dentro: Object.keys(v).filter((k) => v[k] === 'dentro'),
    so2_molec_calc: so2Molecular(a.so2_libre, a.ph),
  };
}

/** Tope de filas por pedido de veredictosSueltos: un pegado grande entra
 *  entero; algo mas grande es un error de la pantalla, no un caso de uso. */
const MAX_SUELTOS = 1000;

/**
 * Veredictos de filas de análisis que todavía NO están guardadas: las que se
 * acaban de tipear, pegar o deshacer. Con analisisConFlags (que juzga lo
 * guardado) la celda quedaba sin color hasta el autoguardado y el pedido
 * siguiente. La pantalla manda cada fila con su lote y los criterios tal como
 * los tiene, así que esto no lee la base y no depende de que lo editado ya esté
 * guardado. Mismas reglas que analisisConFlags (veredictoDeFila).
 *
 * Cuerpo: { criterios: config.criterios_fml, filas: [{ analisis, lote? }] }.
 * Devuelve un veredicto por fila, en el mismo orden.
 */
export function veredictosSueltos(cuerpo: unknown) {
  const c = (cuerpo ?? {}) as Record<string, unknown>;
  const criterios = c.criterios && typeof c.criterios === 'object'
    ? (c.criterios as Record<string, unknown>) : {};
  const filas = Array.isArray(c.filas) ? c.filas.slice(0, MAX_SUELTOS) : [];
  return filas.map((f) => {
    const x = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
    const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Fila) : {});
    return veredictoDeFila(obj(x.analisis), obj(x.lote), criterios);
  });
}
