/* ===== Lotes CIW — numero de OT segun la carpeta de OneDrive =====
 *
 * La numeracion real de las ordenes de trabajo es la de la carpeta
 * "Ordenes de Trabajo 2026": cada archivo empieza con su numero. La comparten
 * ordenes que nunca pasan por la web (muestras en Excel, fraccionamiento...),
 * asi que la carpeta es la verdad y la web solo la lee.
 *
 *   principal  raiz de la carpeta            0700 ... 0938
 *   B          "B Ordenes de agregados"      B211 ... B222
 *
 * Modulo puro (sin DOM ni nucleo.js) para testearlo en node. */
'use strict';

export const SERIES = {
  principal: { clave: 'principal', subcarpeta: null },
  B:         { clave: 'B',         subcarpeta: 'B Ordenes de agregados' },
};

const RE = {
  principal: /^(\d{4})(\s|\.|$)/,
  B:         /^B(\d{3,4})(\s|\.|$)/i,
};

export function numeroDeNombre(nombre, serie){
  const m = RE[serie] && RE[serie].exec(String(nombre ?? '').trim());
  return m ? parseInt(m[1], 10) : null;
}

export function maximoSerie(nombres, serie){
  let max = null;
  for (const nombre of nombres || []){
    const n = numeroDeNombre(nombre, serie);
    if (n != null && (!max || n > max.n)) max = { n, nombre };
  }
  return max;
}

export function formatearNumero(n, serie){
  return serie === 'B' ? 'B' + String(n).padStart(3, '0') : String(n).padStart(4, '0');
}

/* Lo que la web ya numero con el formato nuevo. Las OT viejas (OT-2026-014)
 * no entran: son de otra numeracion. */
export function numerosWeb(datos, serie){
  const d = datos || {};
  const out = [];
  const ver = v => { const n = numeroDeNombre(v, serie); if (n != null) out.push(n); };
  if (serie === 'B'){
    for (const a of d.analisis || []){
      if (!a) continue;
      if (a.correccion) ver(a.correccion.ot_n);
      if (Array.isArray(a.agregados)) a.agregados.forEach(ag => ver(ag && ag.ot_n));
    }
    /* La orden guardada al imprimir ya usa su numero aunque todavia no se haya
     * ejecutado (o se haya anulada): el PDF esta en la carpeta con ese numero. */
    for (const o of d.ordenes_correccion || []) ver(o && o.numero);
    /* Las ordenes de papel guardadas tambien reservan su numero (agregados -> B). */
    for (const o of d.ordenes_hojas || []) if (o && o.tipo === 'agregados') ver(o.ot);
  } else {
    for (const m of [...(d.movimientos || []), ...(d.ordenes_trabajo || [])]) ver(m && m.ot);
    /* Las ordenes de papel guardadas tambien reservan su numero (agregados -> B). */
    for (const o of d.ordenes_hojas || []) if (o && o.tipo !== 'agregados') ver(o.ot);
  }
  return out;
}

/* nombres: los de la carpeta, o null si no hay carpeta. La web puede ir
 * adelante (un PDF que OneDrive todavia no bajo a esta PC): manda el mayor. */
export function siguienteNumero({ nombres = null, web = [], ultimoVisto = null } = {}, serie){
  const enCarpeta = nombres ? (maximoSerie(nombres, serie) || { n: 0 }).n : 0;
  const max = Math.max(enCarpeta, ultimoVisto || 0, ...(web || []), 0);
  return formatearNumero(max + 1, serie);
}

/* El archivo que ya usa ese numero, o null. "938" y "0938" son el mismo. */
export function numeroUsado(nombres, numero, serie){
  const txt = String(numero ?? '').trim();
  const n = serie === 'B' ? numeroDeNombre(txt, 'B')
                          : (/^\d{1,4}$/.test(txt) ? parseInt(txt, 10) : null);
  if (n == null) return null;
  for (const nombre of nombres || []) if (numeroDeNombre(nombre, serie) === n) return nombre;
  return null;
}

export function nombreArchivo(numero, titulo){
  const t = String(titulo ?? '').replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return String(numero).trim() + (t ? ' ' + t : '') + '.pdf';
}

export function pareceCarpetaOT(nombres){
  return (nombres || []).includes(SERIES.B.subcarpeta);
}

/* Los números de la web de este módulo y los del otro (Lotes / Prensas comparten
 * la serie de la carpeta). */
export function unirNumeros(...listas){
  const out = new Set();
  for (const l of listas) for (const n of l || []) if (typeof n === 'number' && Number.isFinite(n)) out.add(n);
  return [...out].sort((a, b) => a - b);
}

/* "939" -> "0939", "b 223" -> "B223". Lo que no se entiende vuelve igual. */
export function normalizarNumero(numero, serie){
  const txt = String(numero ?? '').trim();
  const m = serie === 'B' ? /^B\s*(\d{1,4})$/i.exec(txt) : /^(\d{1,4})$/.exec(txt);
  return m ? formatearNumero(parseInt(m[1], 10), serie) : txt;
}

/* Nombre de PDF que siempre empieza con ese numero: si el nombre editado
 * arranca con otro numero de la serie (o uno corto, "093"), lo cambia; si no
 * tiene, lo antepone. Asi la carpeta reserva el numero. */
export function nombreConNumero(nombre, numero, serie){
  const num = normalizarNumero(numero, serie);
  const limpio = nombreArchivo('', nombre).replace(/\.pdf$/i, '').trim();
  const re = serie === 'B' ? /^B\s*\d{1,4}(?=\s|\.|$)/i : /^\d{1,4}(?=\s|\.|$)/;
  return nombreArchivo(num, limpio.replace(re, '').trim());
}
