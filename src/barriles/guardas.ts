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
  for (const c of estado?.[coleccion] ?? []) {
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
 * Sin `Record<string, ...>` a propósito: con esa anotación `keyof` colapsa a
 * `string` y se pierde el chequeo de que la colección exista.
 */
const CLAVE_DE = {
  inventario: (r: any) => String(r?.num ?? ''),
  escaneos: (o: any) => String(o?.id ?? ''),
  tanques: (t: any) => String(t?.num ?? ''),
  revisiones: (r: any) => String(r?.num ?? '') + '|' + String(r?.campo ?? ''),
  ediciones: (e: any) => String(e?.num ?? '') + '|' + String(e?.campo ?? ''),
  pedidos: (p: any) => String(p?.id ?? ''),
};

export type ColeccionLista = keyof typeof CLAVE_DE;

/**
 * Los identificadores que estaban y ya no están.
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
  const presentes = new Set(((nuevo?.[coleccion] as unknown[]) ?? []).map(clave));
  const faltan: string[] = [];
  for (const x of ((actual?.[coleccion] as unknown[]) ?? [])) {
    const k = clave(x);
    if (k && k !== '|' && !presentes.has(k)) faltan.push(k);
  }
  return faltan;
}

/** Cuánto se pierde al pasar del estado actual al nuevo. Crecer nunca es pérdida. */
export function contarPerdidas(actual: Estado | undefined, nuevo: Estado | undefined): Perdidas {
  const caida = (clave: ColeccionLista) => idsPerdidos(actual, nuevo, clave).length;

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
