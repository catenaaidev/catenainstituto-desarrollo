/**
 * Frenos de borrado del Mapa de Barriles — port de `contar_perdidas()` y
 * `perdidas_superan_umbral()` de su servidor.py.
 *
 * Protegen ante un celular con datos viejos en memoria que empuje borrados sin
 * querer. Mismos umbrales que hoy.
 */

/** Cuántas celdas llenas puede vaciar un guardado sin confirmar. */
export const UMBRAL_BORRADO = 15;
/** Registros de inventario que pueden desaparecer sin confirmar. */
export const UMBRAL_INVENTARIO = 15;
/** Órdenes del escáner (borrar 1 o 2 a mano es normal). */
export const UMBRAL_ESCANEOS = 3;
/** Asociaciones tanque-lote. */
export const UMBRAL_TANQUES = 5;
/** Casilleros de palets vaciados (aprox. un palet lleno). */
export const UMBRAL_PALETS = 9;
/** Revisiones, ediciones a mano y pedidos de rótulos: mismo criterio que escaneos. */
export const UMBRAL_REVISIONES = 3;
export const UMBRAL_EDICIONES = 3;
export const UMBRAL_PEDIDOS = 3;

/** Un box o un palet: un contenedor con celdas identificadas por clave. */
export interface Contenedor {
  id?: unknown;
  celdas?: Record<string, unknown>;
}

export interface Estado {
  boxes?: Contenedor[];
  palets?: Contenedor[];
  inventario?: unknown[];
  escaneos?: unknown[];
  tanques?: unknown[];
  revisiones?: unknown[];
  ediciones?: unknown[];
  pedidos?: unknown[];
  [k: string]: unknown;
}

export interface Perdidas {
  celdas: number;
  inventario: number;
  escaneos: number;
  tanques: number;
  palets: number;
  revisiones: number;
  ediciones: number;
  pedidos: number;
}

/** Claves con valor, agrupadas por contenedor (box o palet). */
function llenas(
  estado: Estado | undefined,
  coleccion: 'boxes' | 'palets',
): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  // comoLista y no `?? []`: un documento viejo (o un POST armado a mano) con
  // `boxes` como objeto o string hacía que el for…of tirara TypeError, y el
  // freno —que corre ANTES de escribir— tumbaba el Worker con un 1101.
  for (const c of comoLista(estado?.[coleccion]) as (Contenedor | null | undefined)[]) {
    const id = String(c?.id ?? '');
    const celdas = c?.celdas ?? {};
    const set = new Set<string>();
    for (const [k, v] of Object.entries(celdas)) if (v) set.add(k);
    m.set(id, set);
  }
  return m;
}

/**
 * Celdas que tenían valor y quedan vacías o ausentes. Empareja por contenedor;
 * si un box o palet entero desaparece, sus celdas llenas cuentan como borradas.
 */
function contarBorrados(
  actual: Estado | undefined,
  nuevo: Estado | undefined,
  coleccion: 'boxes' | 'palets',
): number {
  const a = llenas(actual, coleccion);
  const n = llenas(nuevo, coleccion);
  let total = 0;
  for (const [id, celdas] of a) {
    const destino = n.get(id) ?? new Set<string>();
    for (const k of celdas) if (!destino.has(k)) total++;
  }
  return total;
}

/**
 * Cómo se identifica un registro de cada colección de lista.
 *
 * Tipado explícito en vez de `any` para que este archivo, que hace de barrera
 * de seguridad, rechace en compilación un campo cambiado de nombre.
 *
 * Sin `Record<string, ...>` a propósito: con esa anotación `keyof` colapsa a
 * `string` y se pierde el chequeo de que la colección exista en tiempo de
 * compilación.
 */
const CLAVE_DE = {
  inventario: (r: { num?: unknown }) => String(r?.num ?? ''),
  escaneos: (o: { id?: unknown }) => String(o?.id ?? ''),
  tanques: (t: { num?: unknown }) => String(t?.num ?? ''),
  revisiones: (r: { num?: unknown; campo?: unknown }) =>
    String(r?.num ?? '') + '|' + String(r?.campo ?? ''),
  ediciones: (e: { num?: unknown; campo?: unknown }) =>
    String(e?.num ?? '') + '|' + String(e?.campo ?? ''),
  pedidos: (p: { id?: unknown }) => String(p?.id ?? ''),
};

export type ColeccionLista = keyof typeof CLAVE_DE;

/**
 * Garantiza que el valor es array. Si el cliente manda un objeto, un string
 * u otra cosa rara en lugar de un array, lo tratamos como lista vacía y el
 * guardado falla cerrado (el freno puede disparar pero no tira excepción).
 */
function comoLista(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

/**
 * Los identificadores que estaban y ya no están, como multiconjunto.
 *
 * Se usa Map<clave, cantidad> en vez de Set para tolerar claves duplicadas.
 * `revisiones` las tiene POR DISEÑO: un barril puede tener dos pendientes del
 * mismo campo (ver `fusionarRevisiones` en index.html). Con un Set, si había 5
 * revisiones con la misma clave y se borran 4, la clave sigue presente en el
 * estado nuevo y el freno contaría 0 en vez de 4.
 *
 * Contar longitudes era ciego al intercambio: un guardado que borra 3 órdenes y
 * agrega otras 3 daba cero y pasaba sin freno. Que es la forma exacta que tiene
 * la falla que este freno tiene que atajar.
 */
export function idsPerdidos(
  actual: Estado | undefined,
  nuevo: Estado | undefined,
  coleccion: ColeccionLista,
): string[] {
  const clave = CLAVE_DE[coleccion];

  // Multiconjunto del nuevo estado: cuántas copias de cada clave quedan.
  const cantidadNueva = new Map<string, number>();
  for (const x of comoLista(nuevo?.[coleccion])) {
    const k = clave(x as Parameters<typeof clave>[0]);
    cantidadNueva.set(k, (cantidadNueva.get(k) ?? 0) + 1);
  }

  // Por cada registro del estado actual, lo contamos como perdido si no hay
  // suficientes copias de su clave en el estado nuevo.
  const faltan: string[] = [];
  const consumido = new Map<string, number>();
  for (const x of comoLista(actual?.[coleccion])) {
    const k = clave(x as Parameters<typeof clave>[0]);
    const disponibles = (cantidadNueva.get(k) ?? 0) - (consumido.get(k) ?? 0);
    if (disponibles > 0) {
      consumido.set(k, (consumido.get(k) ?? 0) + 1);
    } else {
      faltan.push(k);
    }
  }
  return faltan;
}

/** Cuánto se pierde al pasar del estado actual al nuevo. Crecer nunca es pérdida. */
export function contarPerdidas(actual: Estado | undefined, nuevo: Estado | undefined): Perdidas {
  /**
   * El piso garantiza que ninguna noción futura de identidad pueda debilitar
   * el freno en silencio. Si `idsPerdidos` subestima (p. ej. porque la clave
   * resulta vacía para registros que no tienen el campo esperado), el delta de
   * longitudes actúa de red: el freno nuevo nunca puede quedar más débil que
   * el viejo conteo por longitudes.
   */
  const caida = (c: ColeccionLista) => Math.max(
    idsPerdidos(actual, nuevo, c).length,
    comoLista(actual?.[c]).length - comoLista(nuevo?.[c]).length,
  );

  return {
    celdas: contarBorrados(actual, nuevo, 'boxes'),
    inventario: caida('inventario'),
    escaneos: caida('escaneos'),
    tanques: caida('tanques'),
    palets: contarBorrados(actual, nuevo, 'palets'),
    revisiones: caida('revisiones'),
    ediciones: caida('ediciones'),
    pedidos: caida('pedidos'),
  };
}

export function superanUmbral(p: Perdidas): boolean {
  return (
    p.celdas >= UMBRAL_BORRADO ||
    p.inventario >= UMBRAL_INVENTARIO ||
    p.escaneos >= UMBRAL_ESCANEOS ||
    p.tanques >= UMBRAL_TANQUES ||
    p.palets >= UMBRAL_PALETS ||
    p.revisiones >= UMBRAL_REVISIONES ||
    p.ediciones >= UMBRAL_EDICIONES ||
    p.pedidos >= UMBRAL_PEDIDOS
  );
}
