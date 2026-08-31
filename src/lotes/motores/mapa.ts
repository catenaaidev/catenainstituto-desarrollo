/**
 * Lectura del inventario del Mapa de Barriles — port de motor_mapa.py.
 *
 * LA MITAD DE ESTE MOTOR DESAPARECIÓ, Y ES UNA BUENA NOTICIA.
 *
 * En la app local, este archivo era el único punto del sistema que tocaba
 * SQLite, y la mayor parte de su código existía para sortear problemas que ya
 * no existen:
 *
 *   - buscar el backup rotado de mayor versión en una carpeta de OneDrive;
 *   - abrir el .db con `immutable=1` para que SQLite no creara los -wal/-shm
 *     que OneDrive sincroniza y corrompen la base;
 *   - rechazar backups con un WAL con contenido, porque leerlos daría un
 *     snapshot desactualizado en silencio;
 *   - una trampa documentada: había DOS carpetas 'mapa de barriles' y cruzar
 *     contra la copia vieja daba 41 diferencias en vez de 57.
 *
 * Nada de eso hace falta ahora: el Mapa de Barriles vive en la misma base que
 * Lotes. El cruce dejó de ser "leer el archivo de otra PC" y pasó a ser una
 * consulta. Lo que queda acá es solo la normalización, que sí es lógica de
 * negocio y se portó literal.
 */

import { normalizarLote } from './linaje';
import type { Fila } from './fml';

export interface Unidad {
  num: string;
  cap: unknown;
  litros: unknown;
  estado: string;
}

export interface Conflicto {
  num: string;
  lote_inventario: string;
  lote_tanques: string;
  en_revisiones: boolean;
}

export interface MapaNormalizado {
  procedencia: { version: unknown; actualizado: unknown; archivo: string; fecha_inventario: string };
  unidades_por_lote: Map<string, Unidad[]>;
  posiciones: Map<string, string[]>;
  lotes_con_tanque: Set<string>;
  conflictos: Conflicto[];
}

/** {lote: [unidad, ...]}. Las unidades sin lote no entran. */
function unidades(inventario: Fila[]): Map<string, Unidad[]> {
  const out = new Map<string, Unidad[]>();
  for (const b of inventario) {
    const L = normalizarLote(b.lote);
    if (!L) continue;
    const u: Unidad = {
      num: String(b.num ?? ''),
      cap: b.cap,
      litros: b.litros,
      estado: String(b.estado ?? ''),
    };
    const lista = out.get(L);
    if (lista) lista.push(u);
    else out.set(L, [u]);
  }
  return out;
}

/**
 * {lote: ['<box>/<col-fila-lado>', ...]}, best-effort.
 *
 * Las celdas guardan números de LOTE, no de barrica: se verificó que 0 de 1052
 * valores coinciden con un num de inventario y 962 con un lote. Así que no se
 * puede ubicar una barrica concreta, solo en qué celdas hay un lote.
 *
 * Además está cargado al 45 % y su conteo discrepa de inventario en 112 de 249
 * lotes, por lo que NUNCA se usa como fuente de cantidad de envases.
 */
function posiciones(boxes: Fila[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const box of boxes) {
    const nombre = box.nombre || box.id || '?';
    for (const [clave, valor] of Object.entries((box.celdas as Record<string, unknown>) ?? {})) {
      const L = normalizarLote(valor);
      if (!L) continue;
      const pos = `${nombre}/${clave}`;
      const lista = out.get(L);
      if (lista) lista.push(pos);
      else out.set(L, [pos]);
    }
  }
  return out;
}

/**
 * Unidades donde inventario[].lote ≠ tanques[].lote.
 *
 * Manda inventario. Se reportan para que se salden en el mapa, que es donde
 * vive el escaneo físico que los origina.
 */
function conflictos(inventario: Fila[], tanques: Fila[], revisiones: Fila[]): Conflicto[] {
  const porNum = new Map<string, Fila>();
  for (const b of inventario) porNum.set(String(b.num ?? ''), b);
  const fichadas = new Set(revisiones.map((r) => String(r.num ?? '')));

  const out: Conflicto[] = [];
  for (const t of tanques) {
    const n = String(t.num ?? '');
    const b = porNum.get(n);
    if (!b) continue;
    const li = normalizarLote(b.lote);
    const lt = normalizarLote(t.lote);
    if (li && lt && li !== lt) {
      out.push({ num: n, lote_inventario: li, lote_tanques: lt, en_revisiones: fichadas.has(n) });
    }
  }
  return out;
}

export class MapaNoDisponible extends Error {}

/**
 * Estado normalizado del mapa, a partir del documento del módulo Barriles.
 *
 * Recibe `{version, estado}` tal como lo guarda la plataforma, en vez de una
 * ruta a un archivo .db.
 */
export function normalizarMapa(documento: { version?: unknown; estado?: Fila } | null): MapaNormalizado {
  const doc = documento ?? {};
  const estado = doc.estado ?? {};
  if (typeof estado !== 'object' || Array.isArray(estado)) {
    throw new MapaNoDisponible('el estado del Mapa de Barriles no es un objeto');
  }

  const inventario = (estado.inventario as Fila[]) ?? [];
  const tanques = (estado.tanques as Fila[]) ?? [];

  return {
    procedencia: {
      version: doc.version,
      actualizado: estado.fechaInventario ?? '',
      archivo: 'modulo barriles (misma base)',
      fecha_inventario: String(estado.fechaInventario ?? ''),
    },
    unidades_por_lote: unidades(inventario),
    posiciones: posiciones((estado.boxes as Fila[]) ?? []),
    lotes_con_tanque: new Set(
      tanques.map((t) => normalizarLote(t.lote)).filter((l): l is string => Boolean(l)),
    ),
    conflictos: conflictos(inventario, tanques, (estado.revisiones as Fila[]) ?? []),
  };
}
