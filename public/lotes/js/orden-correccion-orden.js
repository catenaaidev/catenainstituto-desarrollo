/* ===== Lotes CIW — orden de la tabla de la Orden de correccion de SO2 =====
 *
 * Se ordena por LOTE, no por barrica: las barricas de un lote van siempre
 * debajo de su lote, porque comparten la diferencia de SO2. Ordenar barricas
 * sueltas desarmaria los grupos.
 *
 * Sin columna elegida (key null) queda el orden que manda el servidor, que es
 * por urgencia. El clic en el encabezado cicla ▲ → ▼ → urgencia, para que
 * volver al orden original no obligue a recargar.
 *
 * Puro: sin DOM ni estado de modulo, para testearlo. */
'use strict';

import { tipoVasija } from './orden-correccion-planilla.js';

/* Misma regla que cmpValores de tabla.js (los lotes son numeros en texto: 9
 * antes que 26005). Copiada y no importada porque tabla.js arrastra nucleo.js,
 * que toca window al cargarse y no se puede importar desde un test. */
function cmpTexto(a, b){
  const esNum = v => /^[\d.,]+$/.test(v) && !isNaN(parseFloat(v.replace(',', '.')));
  if (esNum(a) && esNum(b)) return parseFloat(a.replace(',', '.')) - parseFloat(b.replace(',', '.'));
  return a.localeCompare(b, 'es');
}

/** Columnas por las que se puede ordenar. 'dosis' la comparten MBK y mL: son la
 *  misma dosis en dos unidades, asi que ordenan igual. */
export const OC_COLS_ORDEN = ['lote', 'variedad', 'ph', 'so2', 'objetivo', 'dosis',
  'anio', 'cant', 'tipo', 'vasija', 'litros', 'dif', 'vdosis'];

/** Orden con que abre la pestaña: lote creciente, que es como se recorre la
 *  bodega al corregir (pedido del usuario 2026-11-10). La urgencia sigue
 *  disponible en "Ordenar por". */
export const OC_ORDEN_INICIAL = Object.freeze({ key: 'lote', dir: 1 });

/** Proximo estado del orden al hacer clic en el titulo de la columna k (la
 *  planilla): ▲ menor a mayor → ▼ mayor a menor → el normal (OC_ORDEN_INICIAL).
 *  En Lote el normal ya es ▲, asi que ahi alterna ▲ / ▼. */
export function ciclarOrdenOc(st, k){
  if (!st || st.key !== k) return { key: k, dir: 1 };
  if (st.dir === 1) return { key: k, dir: -1 };
  return { ...OC_ORDEN_INICIAL };
}

/* Valor de un lote para la columna. La dosis es diferencia x litros (la formula
 * es lineal en los dos), asi que alcanza para comparar sin calcular gramos. */
function valorOc(l, key, objetivoDe){
  switch (key){
    case 'lote':     return l.lote == null ? null : String(l.lote);
    case 'variedad': return l.variedad ? String(l.variedad) : null;
    case 'ph':       return Number.isFinite(l.ph) ? l.ph : null;
    case 'so2':      return Number.isFinite(l.so2_libre) ? l.so2_libre : null;
    case 'objetivo': { const o = objetivoDe(l); return Number.isFinite(o) ? o : null; }
    case 'anio': { const m = /^\s*(\d{2})\d/.exec(String(l.lote ?? '')); return m ? Number('20' + m[1]) : null; }
    case 'cant':     return (l.barricas || []).length;
    case 'litros':   return (l.barricas || []).reduce((s, b) => s + (Number(b.litros_usados) || 0), 0);
    case 'dif': { const d = objetivoDe(l) - l.so2_libre; return Number.isFinite(d) ? d : null; }
    /* Tipo y vasija ordenan el lote por la primera de sus vasijas en ese orden. */
    case 'tipo': case 'vasija': {
      const v = (l.barricas || []).map(b => tipoVasija(b)[key]).sort((a, b) => a.localeCompare(b, 'es'));
      return v.length ? v[0] : null;
    }
    case 'vdosis':
    case 'dosis': {
      const dif = objetivoDe(l) - l.so2_libre;
      const litros = (l.barricas || []).reduce((s, b) => s + (b.litros_usados || 0), 0);
      const d = dif * litros;
      return Number.isFinite(d) ? d : null;
    }
    default: return null;
  }
}

/** Copia de los lotes en el orden pedido. Estable: los empates conservan el
 *  orden de urgencia del servidor. Los vacios van al final en los dos sentidos,
 *  igual que en la pestaña Lotes. */
export function ordenarLotesOc(lotes, st, objetivoDe){
  const arr = [...(lotes || [])];
  if (!st || !st.key) return arr;
  const obj = objetivoDe || (l => l.objetivo_libre);
  const vals = new Map(arr.map(l => [l, valorOc(l, st.key, obj)]));
  return arr.sort((a, b) => {
    const x = vals.get(a), y = vals.get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    const c = typeof x === 'string' ? cmpTexto(x, y) : x - y;
    return st.dir * c;
  });
}
