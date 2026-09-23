/**
 * Armado de las respuestas de Lotes — port de datos_dashboard(), datos_ficha()
 * y analisis_con_flags() de su servidor.py.
 *
 * Funciones puras: reciben los datos y devuelven lo que la pantalla espera.
 * La lectura de la base queda en rutas.ts.
 */

import {
  evaluar,
  normalizarConfig,
  criteriosEfectivos,
  veredictosAnalisis,
  so2Molecular,
  type Fila,
} from './motores/fml';
import { evaluarEtapa } from './motores/etapas';
import { grafo, lineaTiempo, recorridoVasijas, cadenaIdentidad, normalizarLote } from './motores/linaje';

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
  const ans = porLote(d.analisis as Fila[]);
  const movs = porLote(d.movimientos as Fila[]);

  // OJO: evaluar() solo trae los ACTIVOS. La bandeja recorre TODOS los lotes,
  // porque un lote recién cerrado tiene litros 0 y su paso a 'cerrado' es
  // justamente el que hay que confirmar.
  const etapas = new Map<string, ReturnType<typeof evaluarEtapa>>();
  const bandeja: Record<string, unknown>[] = [];

  for (const l of (d.lotes as Fila[]) ?? []) {
    const clave = normalizarLote((l ?? {}).lote);
    const r = evaluarEtapa(l, ans.get(clave) ?? [], movs.get(clave) ?? [], config, hoy);
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
  const movsTodos = (d.movimientos as Fila[]) ?? [];
  const movsLote = movsTodos.filter((m) => normalizarLote((m ?? {}).lote) === clave);

  const r = evaluarEtapa(fila, ans, movsLote, config, hoy, etapaForzada);
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
  const lotesPorNum = new Map(((datos.lotes as Fila[]) ?? []).map((l) => [String(l.lote), l]));

  return ((datos.analisis as Fila[]) ?? []).map((a, i) => {
    const info = lotesPorNum.get(String(a.lote)) ?? {};
    const eff = criteriosEfectivos(config, info.variedad, info.proyecto);
    /* El lote va entero y no solo su variedad: la decision de FML puede venir
     * de su propia ficha (hace_fml / fml_excluida) y pisar a la de config, y de
     * eso depende si el málico de esta fila se juzga o no. Un analisis cuyo
     * lote ya no existe queda con {}, que fmlExcluida trata como "sin decision
     * propia" y resuelve por la variedad. */
    const v = veredictosAnalisis(a, eff, info);
    return {
      idx: i,
      lote: a.lote,
      fecha_analisis: a.fecha_analisis,
      fuera: Object.keys(v).filter((k) => v[k] === 'fuera'),
      dentro: Object.keys(v).filter((k) => v[k] === 'dentro'),
      so2_molec_calc: so2Molecular(a.so2_libre, a.ph),
    };
  });
}
