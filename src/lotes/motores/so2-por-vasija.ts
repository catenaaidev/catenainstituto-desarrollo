/**
 * SO2 por vasija: cuando un lote sale heterogéneo, la bodega analiza todas sus
 * vasijas una por una y anota la vasija en Cargar análisis (analisis[].vasija).
 * Los barriles se identifican por sus ÚLTIMOS 3 DÍGITOS y los T50 por el número
 * completo (pedido del usuario, 2026-11-13). Módulo puro.
 * Spec: docs/superpowers/specs/2026-11-13-so2-por-barril-design.md
 */
import type { Unidad } from './mapa';
import { ordenarPorFecha, valorValido, type Fila } from './fml';
import { fechaDia } from './fml-condiciones';

export type Asignacion =
  | { tipo: 'lote' }
  | { tipo: 'vasija'; num: string }
  | { tipo: 'ambiguo'; texto: string; nums: string[] }
  | { tipo: 'sin_match'; texto: string };

const digitos = (x: unknown) => String(x ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
// Solo un número de barril (con B opcional) identifica una vasija; cualquier
// otro texto con dígitos ("T 201", "Nave 2", "12 barricas") es del lote.
const ES_BARRIL = /^\s*[Bb]?\s*\d{1,7}\s*$/;
const ult3 = (d: string) => d.padStart(3, '0').slice(-3);

function resultado(texto: string, nums: string[]): Asignacion {
  if (nums.length === 1) return { tipo: 'vasija', num: nums[0] };
  if (nums.length > 1) return { tipo: 'ambiguo', texto, nums };
  return { tipo: 'sin_match', texto };
}

export function asignarVasija(texto: unknown, unidades: Unidad[]): Asignacion {
  const t = String(texto ?? '').trim();
  const tipoT = /^t\s*(50|200)$/i.exec(t);
  if (tipoT) {
    const cap = Number(tipoT[1]);
    return resultado(t, unidades.filter((u) => Number(u.cap) === cap).map((u) => u.num));
  }
  if (!ES_BARRIL.test(t)) return { tipo: 'lote' };
  const d = digitos(t);
  if (!d) return { tipo: 'lote' };
  const exactos = unidades.filter((u) => digitos(u.num) === d).map((u) => u.num);
  if (exactos.length) return resultado(t, exactos);
  if (d.length > 3) return { tipo: 'sin_match', texto: t };
  // Los T50 se cargan con el número completo: no entran por los últimos 3.
  return resultado(t, unidades.filter((u) => Number(u.cap) !== 50 && ult3(digitos(u.num)) === ult3(d)).map((u) => u.num));
}

export interface MedicionVasija {
  so2: number | null; ph: number | null; fecha: string | null;
  fuente: 'propio' | 'lote' | null; aviso: string | null;
}
export interface PorVasija {
  porVasija: boolean;
  vasijas: Map<string, MedicionVasija>;
  avisos: string[];
  analisisLote: Fila[];
  fechaPropia: string | null;
  // Último análisis del lote (el mismo que decide el modo): SO2 y su pH (o el
  // último pH del lote). Lo usan el tanque y el renglón sin barrica.
  so2Lote: number | null;
  phLote: number | null;
}

// Fecha nula = la más nueva, igual que ordenarPorFecha.
const dia = (a: Fila) => fechaDia(a.fecha_analisis) ?? Number.MAX_SAFE_INTEGER;
const fechaTxt = (a: Fila | null) => (a && a.fecha_analisis != null ? String(a.fecha_analisis) : null);

export function medicionesPorVasija(
  analisis: Fila[], unidades: Unidad[], so2De: (a: Fila) => number | null,
): PorVasija {
  // Del más nuevo al más viejo; a igual día, el último cargado primero.
  const orden = ordenarPorFecha(analisis).reverse().sort((a, b) => (dia(b) > dia(a) ? 1 : dia(b) < dia(a) ? -1 : 0));
  const analisisLote: Fila[] = [];
  const deVasija: { a: Fila; asig: Asignacion }[] = [];
  for (const a of orden) {
    const asig = asignarVasija(a.vasija, unidades);
    if (asig.tipo === 'lote') analisisLote.push(a);
    else deVasija.push({ a, asig });
  }
  const loteSo2 = analisisLote.find((a) => so2De(a) !== null) ?? null;
  const diaLote = loteSo2 ? dia(loteSo2) : -Infinity;
  const conSo2 = deVasija.filter((x) => so2De(x.a) !== null);
  const porVasija = conSo2.some((x) => !loteSo2 || dia(x.a) >= diaLote);
  const phLote = analisisLote.map((a) => valorValido(a.ph)).find((v) => v !== null) ?? null;
  const so2Lote = loteSo2 ? so2De(loteSo2) : null;
  const phDelLote = loteSo2 ? (valorValido(loteSo2.ph) ?? phLote) : phLote;
  // Sin vasijas en el Mapa no hay a quién dosificar por separado.
  if (!porVasija || !unidades.length) {
    return { porVasija: false, vasijas: new Map(), avisos: [], analisisLote: ordenarPorFecha(analisisLote), fechaPropia: null, so2Lote, phLote: phDelLote };
  }

  const vasijas = new Map<string, MedicionVasija>();
  for (const u of unidades) {
    const suyos = deVasija.filter((x) => x.asig.tipo === 'vasija' && x.asig.num === u.num).map((x) => x.a);
    const propio = suyos.find((a) => so2De(a) !== null) ?? null;
    if (propio && (!loteSo2 || dia(propio) >= diaLote)) {
      const ph = valorValido(propio.ph)
        ?? suyos.filter((a) => a !== propio && dia(a) <= dia(propio)).map((a) => valorValido(a.ph)).find((v) => v !== null)
        ?? phLote;
      vasijas.set(u.num, { so2: so2De(propio), ph, fecha: fechaTxt(propio), fuente: 'propio', aviso: null });
    } else if (loteSo2 && propio) {
      // Tiene análisis propio pero el del lote es más nuevo.
      vasijas.set(u.num, { so2: so2De(loteSo2), ph: valorValido(loteSo2.ph) ?? phLote, fecha: fechaTxt(loteSo2), fuente: 'lote', aviso: null });
    } else {
      vasijas.set(u.num, { so2: null, ph: null, fecha: null, fuente: null, aviso: 'sin análisis propio: medir o escribir la dosis a mano' });
    }
  }
  const avisos: string[] = [];
  const vistos = new Set<string>();
  for (const { asig } of deVasija) {
    if (asig.tipo !== 'vasija' && 'texto' in asig) {
      if (!vistos.has(asig.texto)) {
        vistos.add(asig.texto);
        if (asig.tipo === 'ambiguo') {
          avisos.push(`la vasija «${asig.texto}» coincide con ${asig.nums.join(' y ')}: escribí la dosis a mano`);
        } else {
          avisos.push(`la vasija «${asig.texto}» no está llena en este lote`);
        }
      }
    }
  }
  const fechaPropia = fechaTxt(conSo2.find((x) => x.asig.tipo === 'vasija')?.a ?? null);
  return { porVasija: true, vasijas, avisos, analisisLote: ordenarPorFecha(analisisLote), fechaPropia, so2Lote, phLote: phDelLote };
}
