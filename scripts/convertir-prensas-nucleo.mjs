/* Convierte las filas crudas de "Lotes prensas <año>.xlsx" (las lee
 * leer-excel-prensas.py) al formato del documento de Prensas web.
 * Puro: sin archivos, para poder testearlo. NO escribe en la base. */

const vacio = v => v === null || v === undefined || String(v).trim() === '';
const texto = v => (vacio(v) ? null : String(v).trim());
function numero(v){
  if (vacio(v)) return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).trim().replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}
/* Número si se puede leer entero como número; si no, texto (p. ej. "25005, 25006"). */
const numeroOTexto = v => (vacio(v) ? null : (/^\s*-?\d+([.,]\d+)?\s*$/.test(String(v)) ? numero(v) : texto(v)));
const fechaISO = v => (vacio(v) ? null : String(v).slice(0, 10));

const CLAVES_ANALISIS = ['lote', 'mes', 'fecha', 'etanol', 'ph', 'av', 'gluc', 'malico', 'lactico', 'at',
  'azucar', 'revisar_av', 'brett', 'aceticas', 'lacticas', 'levaduras', 'hongos', 'so2l', 'so2t',
  'so2molec', 'fecha_corr', 'so2_corr', 'th2', 'otro', 'ot'];
const NUMERICAS = new Set(['etanol', 'ph', 'av', 'gluc', 'malico', 'lactico', 'at', 'azucar', 'so2l', 'so2t',
  'so2molec', 'so2_corr', 'th2']);

/* Columnas del Excel que la web no tiene: van a comentario2 si dicen algo.
 * "NO" en refermentación/bacteria es el valor normal y no se anota. */
const EXTRAS = [
  { i: 11, rotulo: 'Refermentación', omitir: v => /^no$/i.test(v) },
  { i: 12, rotulo: 'Bacteria', omitir: v => /^no$/i.test(v) },
  { i: 13, rotulo: 'Actividad', omitir: v => /^no$/i.test(v) },
  { i: 15, rotulo: 'Degustación Brett', omitir: () => false },
  { i: 16, rotulo: 'Degustación AV', omitir: () => false },
];

function convertirLote(r){
  const extras = EXTRAS.map(e => [e, texto(r[e.i])]).filter(([e, v]) => v !== null && !e.omitir(v))
    .map(([e, v]) => `${e.rotulo}: ${v}`);
  return {
    lote: numero(r[0]), variedad: texto(r[1]), origen: numeroOTexto(r[2]), ig: texto(r[3]),
    id_origen: texto(r[4]), ot_prensado: texto(r[5]), litros: numero(r[6]), dia_prensado: fechaISO(r[7]),
    prensa: texto(r[9]), so2_agregado: texto(r[10]), comentario: texto(r[14]),
    accion: null, comentario2: extras.length ? extras.join(' · ') : null, accion2: null,
  };
}

function convertirAnalisis(r){
  const a = {};
  CLAVES_ANALISIS.forEach((k, i) => {
    const v = r[i];
    if (k === 'lote') a[k] = numero(v);
    else if (k === 'fecha' || k === 'fecha_corr') a[k] = fechaISO(v);
    else if (NUMERICAS.has(k)) a[k] = numero(v);
    else if (k === 'mes') a[k] = numero(v);
    else a[k] = texto(v);
  });
  if (!(Number.isInteger(a.mes) && a.mes >= 1 && a.mes <= 12)) a.mes = a.fecha ? Number(a.fecha.slice(5, 7)) : null;
  return a;
}

/* Sin ninguna medida ni dato propio (el Excel tiene renglones "preparados"). */
const analisisVacio = a => CLAVES_ANALISIS.slice(3).every(k => a[k] === null);

export function convertirPrensas(crudo){
  const lotes = (crudo.lotes || []).map(convertirLote);
  const vistos = new Set(), repetidos = new Set();
  for (const l of lotes) { if (vistos.has(l.lote)) repetidos.add(l.lote); vistos.add(l.lote); }
  if (repetidos.size) throw new Error(`el Excel trae el mismo lote repetido: ${[...repetidos].join(', ')}`);

  const todos = (crudo.analisis || []).map(convertirAnalisis);
  const analisis = todos.filter(a => !analisisVacio(a));
  const huerfanos = [...new Set(analisis.map(a => a.lote).filter(l => !vistos.has(l)))].sort((x, y) => x - y);
  return { lotes, analisis,
    reporte: { lotes: lotes.length, analisis: analisis.length, vacios_salteados: todos.length - analisis.length, huerfanos } };
}
