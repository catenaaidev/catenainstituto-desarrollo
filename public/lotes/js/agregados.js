/* ===== Lotes CIW — los otros agregados (TH2, quitosano, levadura...) =====
 *
 * Modulo puro: no toca el DOM ni llama a markDirty. Es el equivalente de
 * so2-bitacora.js para todo lo que no es SO2: la forma de un agregado
 * registrado y como se engancha a datos.analisis.
 *
 * Un agregado vive en la lista `agregados` de un registro de analisis (lote +
 * fecha), igual que la correccion de SO2 vive en `correccion`. Asi la pestaña
 * Analisis lo muestra como una fila mas del lote, la ficha lo pone en la linea
 * de tiempo y no hace falta una tabla nueva:
 *
 *   { producto, cantidad, unidad, ot_n, registrado_por, registrado_en,
 *     dosis_vasija?, litros_ref?, vasijas?, anulada?: { por, en } }
 *
 * `cantidad` es siempre el TOTAL que llevo el lote. Si la orden se armo por
 * vasija, dosis_vasija/litros_ref/vasijas dicen como se reparte.
 *
 * La lista de productos, las plantillas y las unidades vienen del generador
 * local de OT de bodega (generar_OT_v3.py, formato B015). */
'use strict';

export const AGREGADOS_COMUNES = [
  'Sangría', 'T1', 'TH2', 'TH2 en conjunto con T1',
  'Nutristart Org', 'Nutristart Plus', 'Go Ferm Protect',
  'Fermaid K', 'Fermaid AT', 'DAP', 'Maxarom K',
  'Optiwhite', 'UvaFerm 43', 'RB2', 'Quitosano', 'Lisozyme',
];

export const PLANTILLAS = [
  { clave: 'siembra',         nombre: 'Siembra',           items: ['Go Ferm Protect', 'UvaFerm 43', 'TH2'] },
  { clave: 'siembra_sangria', nombre: 'Siembra + Sangría', items: ['Sangría', 'T1', 'TH2', 'UvaFerm 43', 'Go Ferm Protect'] },
  { clave: 'nutricion',       nombre: 'Nutrición',         items: ['Nutristart Org'] },
  { clave: 'lisozyme',        nombre: 'Lisozyme',          items: ['Lisozyme'] },
];

export const UNIDADES = ['g', 'kg', 'litros', 'ml'];

const _txt = v => String(v ?? '').trim();
const _otDe = ag => _txt(ag && ag.ot_n);

/* Veracidad al estilo de esAnulada (so2-bitacora.js): {} y [] no anulan. */
function _veraz(v){
  if (!v) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

export function esAgregadoAnulado(ag){ return _veraz(ag && ag.anulada); }

/** Los agregados vigentes (no anulados) de un registro de analisis. */
export function agregadosVigentes(a){
  const lista = (a && Array.isArray(a.agregados)) ? a.agregados : [];
  return lista.filter(ag => ag && _txt(ag.producto) && !esAgregadoAnulado(ag));
}

/** El registro existe solo para llevar agregados: no tiene quimica ni
 *  correccion. Esos no son un analisis y no tienen que mover la fecha del
 *  "ultimo analisis" ni salir como evento de analisis en la ficha. */
const _CLAVES_SOLO_AGREGADOS = new Set(['lote', 'fecha_analisis', 'agregados']);
export function esSoloAgregados(a){
  if (!a || !Array.isArray(a.agregados)) return false;
  return Object.keys(a).every(k => _CLAVES_SOLO_AGREGADOS.has(k) || a[k] == null || a[k] === '');
}

/** "380 g" / "1,5 kg" / "" si no hay cantidad. */
export function cantidadTexto(ag){
  const c = ag && ag.cantidad;
  if (c == null || c === '') return '';
  const n = Number(c);
  const num = Number.isFinite(n) ? String(n).replace('.', ',') : _txt(c);
  return num + (_txt(ag.unidad) ? ' ' + _txt(ag.unidad) : '');
}

/** Texto de una linea para la pestaña Analisis: "TH2 380 g · Quitosano 50 g". */
export function textoAgregados(a){
  return agregadosVigentes(a)
    .map(ag => (_txt(ag.producto) + (cantidadTexto(ag) ? ' ' + cantidadTexto(ag) : '')))
    .join(' · ');
}

/** Las OT de los agregados vigentes, sin repetir, en orden de aparicion. */
export function otsDeAgregados(a){
  const vistas = [];
  for (const ag of agregadosVigentes(a)){
    const ot = _otDe(ag);
    if (ot && !vistas.includes(ot)) vistas.push(ot);
  }
  return vistas;
}

/** Normaliza un renglon tipeado: cantidad numerica si se puede (acepta coma
 *  decimal), unidad conocida. Devuelve null si no tiene producto. */
export function normalizarItem(it){
  const producto = _txt(it && it.producto);
  if (!producto) return null;
  const crudo = _txt(it.cantidad).replace(',', '.');
  const n = crudo === '' ? null : Number(crudo);
  const cantidad = crudo === '' ? null : (Number.isFinite(n) ? n : _txt(it.cantidad));
  const unidad = UNIDADES.includes(_txt(it.unidad)) ? _txt(it.unidad) : 'g';
  return { producto, cantidad, unidad };
}

/** Registra los agregados de UN lote en una fecha. MUTA `analisis`.
 *
 *  items = [{producto, cantidad, unidad}] ya normalizados.
 *  Registrar otra vez la MISMA OT para el mismo lote y fecha reemplaza sus
 *  renglones vigentes (es corregir el dato); una OT distinta se suma. Las
 *  anuladas nunca se tocan: son el rastro de auditoria.
 *
 *  Devuelve un "snap" para revertirAgregados: {ref, creado, antes, lote, fecha}. */
export function registrarAgregados(analisis, { lote, fecha, items, ot, quien, cuando }){
  const L = _txt(lote), OT = _txt(ot);
  const mismos = (analisis || []).filter(a => _txt(a.lote) === L && (a.fecha_analisis || '') === fecha);
  let ref = mismos.find(a => Array.isArray(a.agregados) && a.agregados.length) || mismos[0] || null;
  let creado = false;
  if (!ref){
    ref = { lote: L, fecha_analisis: fecha, agregados: [] };
    analisis.push(ref);
    creado = true;
  }
  const antes = Array.isArray(ref.agregados) ? ref.agregados.map(x => ({ ...x })) : undefined;
  const quedan = (ref.agregados || []).filter(ag => esAgregadoAnulado(ag) || _otDe(ag) !== OT);
  const nuevos = (items || []).map(it => {
    const ag = { producto: it.producto, cantidad: it.cantidad, unidad: it.unidad, ot_n: OT || null,
      registrado_por: quien || '', registrado_en: cuando || '' };
    /* Si vino de una orden por vasija: la dosis cargada, los litros a los que
     * corresponde y en cuantas vasijas se repartio (cantidad es el total). */
    if (it.dosis_vasija != null && it.vasijas > 1){
      ag.dosis_vasija = it.dosis_vasija; ag.litros_ref = it.litros_ref; ag.vasijas = it.vasijas;
    }
    return ag;
  });
  ref.agregados = [...quedan, ...nuevos];
  return { ref, creado, antes, lote: L, fecha };
}

/** Deshace registrarAgregados en orden inverso. MUTA `analisis`. Si el `ref`
 *  quedo huerfano (una fusion tras un 409 rearmo DATOS()), lo busca por lote
 *  y fecha entre los que tienen agregados. */
export function revertirAgregados(analisis, snaps){
  let n = 0;
  for (let i = snaps.length - 1; i >= 0; i--){
    const s = snaps[i];
    let reg = analisis.includes(s.ref) ? s.ref
      : analisis.find(a => _txt(a.lote) === s.lote && (a.fecha_analisis || '') === s.fecha && Array.isArray(a.agregados)) || null;
    if (!reg) continue;
    if (s.creado && esSoloAgregados(reg)) analisis.splice(analisis.indexOf(reg), 1);
    else if (s.antes === undefined) delete reg.agregados;
    else reg.agregados = s.antes;
    n++;
  }
  return n;
}

/** Anula un renglon. MUTA el agregado. Devuelve false si ya estaba anulado. */
export function anularAgregado(ag, quien, cuando){
  if (!ag || esAgregadoAnulado(ag)) return false;
  ag.anulada = { por: quien || 'desconocido', en: cuando || '' };
  return true;
}

/** Todos los renglones de la bitacora (incluidas las anuladas), con su
 *  registro, del mas nuevo al mas viejo. */
export function filasBitacora(analisis){
  const out = [];
  for (const a of (analisis || [])){
    if (!a || !Array.isArray(a.agregados)) continue;
    a.agregados.forEach((ag, i) => {
      if (!ag || !_txt(ag.producto)) return;
      out.push({ registro: a, agregado: ag, i, lote: _txt(a.lote), fecha: a.fecha_analisis || '' });
    });
  }
  out.sort((x, y) => (y.fecha.localeCompare(x.fecha)) ||
    (parseFloat(x.lote) - parseFloat(y.lote)) || (x.i - y.i));
  return out;
}

/** Proximo N° de OT de la serie B (B231 -> B232), mirando las correcciones de
 *  SO2 y los agregados: las dos ordenes salen de la misma carpeta "B Ordenes
 *  de agregados". '' si no hay ninguna B todavia. */
export function sugerirOT(analisis){
  let max = 0, ancho = 3;
  const ver = v => {
    const m = /^\s*B\s*0*(\d+)\s*$/i.exec(String(v ?? ''));
    if (m){ const n = parseInt(m[1], 10); if (n > max) max = n; }
  };
  for (const a of (analisis || [])){
    if (!a) continue;
    if (a.correccion) ver(a.correccion.ot_n);
    if (Array.isArray(a.agregados)) a.agregados.forEach(ag => ver(ag && ag.ot_n));
  }
  return max ? 'B' + String(max + 1).padStart(ancho, '0') : '';
}

/* ---------- vasijas del lote y dosis por vasija ----------
 * La cantidad que se carga en la orden es POR VASIJA ("TH2 50 g" = 50 g en
 * cada barrica). Las vasijas con los litros de referencia llevan esa dosis;
 * las de otros litros (barrica de 50 L, un tanque) la llevan proporcional.
 * Referencia = la capacidad mas comun entre los barriles del lote; si el lote
 * esta en una sola vasija (o solo en tanque), esa es la referencia. */

const _CAPS = [['cap500', 500], ['cap225', 225], ['cap200', 200], ['cap50', 50]];
const _pos = x => { const v = Number(x); return Number.isFinite(v) && v > 0 ? v : 0; };

/** Vasijas de un lote: los barriles LLENOS del Mapa (por numero, con su
 *  capacidad), los envases que el lote declara y el Mapa no ubica (sin numero,
 *  para completar a mano) y el tanque (vasija_grande, en litros).
 *  lote = objeto de DATOS().lotes (o null); barriles = por_lote[lote] del Mapa
 *  (o null si no se pudo leer). Nunca devuelve una lista vacia: sin datos, una
 *  sola vasija con el texto de la tarjeta y sin litros (dosis tal cual). */
export function vasijasDeLote(lote, barriles, vasijaTexto){
  const out = [];
  const llenos = (barriles || []).filter(b => String(b && b.estado || '').trim().toUpperCase() === 'LLENO');
  for (const b of llenos){
    out.push({ tipo: 'barril', num: _txt(b.num), litros: _pos(b.cap) || _pos(b.litros) || null });
  }
  if (lote){
    for (const [k, cap] of _CAPS){
      const enMapa = out.filter(v => v.litros === cap).length;
      for (let i = enMapa; i < _pos(lote[k]); i++) out.push({ tipo: 'sin_num', num: '', litros: cap });
    }
    const g = _pos(lote.vasija_grande);
    if (g){
      /* "H 170 + Barricas" -> "H 170": el tanque es la parte que no son barricas. */
      const nombre = _txt(lote.vasija_actual).split('+').map(_txt).filter(x => x && !/barric/i.test(x)).join(' + ');
      out.push({ tipo: 'tanque', num: nombre || 'Tanque', litros: g });
    }
  }
  if (!out.length) out.push({ tipo: 'unica', num: _txt(vasijaTexto), litros: null });
  return out;
}

/** Litros de referencia: la capacidad mas repetida entre barriles (con o sin
 *  numero); empate -> la mas grande. Sin barriles: los litros de la primera
 *  vasija que los tenga (el tanque), o null. */
export function litrosReferencia(vasijas){
  const cuenta = new Map();
  for (const v of vasijas || []){
    if ((v.tipo === 'barril' || v.tipo === 'sin_num') && v.litros) cuenta.set(v.litros, (cuenta.get(v.litros) || 0) + 1);
  }
  if (cuenta.size){
    return [...cuenta].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]))[0][0];
  }
  const conLitros = (vasijas || []).find(v => v.litros);
  return conLitros ? conLitros.litros : null;
}

/** Dosis de una vasija: la cantidad cargada, escalada por sus litros. */
export function dosisVasija(cantidad, litros, ref){
  if (cantidad == null || cantidad === '' || !Number.isFinite(Number(cantidad))) return cantidad;
  if (!litros || !ref || litros === ref) return Number(cantidad);
  return Math.round(Number(cantidad) * litros / ref * 100) / 100;
}

/** Total de un producto en el lote: suma de las dosis de todas sus vasijas. */
export function totalLote(cantidad, vasijas, ref){
  if (cantidad == null || cantidad === '' || !Number.isFinite(Number(cantidad))) return cantidad;
  const t = (vasijas || []).reduce((s, v) => s + dosisVasija(cantidad, v.litros, ref), 0);
  return Math.round(t * 100) / 100;
}

/** Lo que se anota en Analisis al marcar ejecutada una orden de agregados:
 *  [{lote, fecha, items}]. Dos tarjetas del mismo lote se juntan
 *  (registrarAgregados reemplaza lo de la misma OT: registrarlas por separado
 *  dejaria solo la segunda). Cada item lleva el TOTAL del lote (la dosis de
 *  cada vasija sumada) y al lado la dosis por vasija y los litros de
 *  referencia, para poder reconstruir la orden. `vasijasDe(t)` da las vasijas
 *  de la tarjeta (al imprimir quedan congeladas por id de tarjeta). */
export function registroDeTarjetas(tarjetas, vasijasDe, fecha){
  const porLote = new Map();
  for (const t of (tarjetas || [])){
    const L = _txt(t && t.lote);
    const items = ((t && t.items) || []).map(normalizarItem).filter(Boolean);
    if (!L || !items.length) continue;
    const vas = (vasijasDe && vasijasDe(t)) || [];
    const ref = litrosReferencia(vas);
    if (!porLote.has(L)) porLote.set(L, []);
    porLote.get(L).push(...items.map(it => ({ ...it,
      cantidad: totalLote(it.cantidad, vas, ref),
      dosis_vasija: it.cantidad, litros_ref: ref, vasijas: vas.length })));
  }
  return [...porLote].map(([lote, items]) => ({ lote, fecha, items }));
}

/** "12 × 225 L + T50 1500 L" — para la tarjeta y el renglon del lote. */
export function resumenVasijas(vasijas){
  const porCap = new Map();
  const otros = [];
  for (const v of vasijas || []){
    if (v.tipo === 'barril' || v.tipo === 'sin_num') porCap.set(v.litros, (porCap.get(v.litros) || 0) + 1);
    else if (v.tipo === 'tanque') otros.push(v.num + ' ' + v.litros + ' L');
  }
  const partes = [...porCap].sort((a, b) => b[0] - a[0]).map(([c, n]) => n + ' × ' + c + ' L');
  return partes.concat(otros).join(' + ');
}

/* ---------- el papel (formato B015 "OT agregados nutrientes") ----------
 * Check | CIW Lote | Vasija | Agregado | Cantidad. Por cada lote: un renglon
 * de encabezado (lote, vasijas y litros de referencia) y despues, producto por
 * producto, un renglon por vasija con su dosis, para tildar barril por barril. */

const _esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const COLUMNAS_PAPEL_AG = 5;
export const COLGROUP_PAPEL_AG =
  '<colgroup><col style="width:52px"><col style="width:80px"><col style="width:130px"><col><col style="width:110px"></colgroup>';
export const THEAD_PAPEL_AG =
  '<tr><th class="oh-check">Check</th><th class="c">CIW Lote</th><th class="c">Vasija</th>' +
  '<th>Agregado</th><th class="c">Cantidad</th></tr>';

/** Filas del papel. tarjetas = [{lote, vasija, items}]; vasijasDe(tarjeta) ->
 *  lista de vasijasDeLote (si no se pasa, una sola vasija con el texto de la
 *  tarjeta). Los lotes sin numero o sin ningun producto no salen. */
export function filasPapelAgregados(tarjetas, vasijasDe){
  const out = [];
  for (const t of (tarjetas || [])){
    const lote = _txt(t && t.lote);
    const items = ((t && t.items) || []).map(normalizarItem).filter(Boolean);
    if (!lote || !items.length) continue;
    const vasijas = vasijasDe ? vasijasDe(t) : vasijasDeLote(null, null, t.vasija);
    const ref = litrosReferencia(vasijas);
    out.push({ tipo: 'lote', lote, resumen: resumenVasijas(vasijas), ref, varias: vasijas.length > 1 });
    for (const it of items){
      for (const v of vasijas){
        out.push({ tipo: 'item', lote, producto: it.producto, unidad: it.unidad,
          vasija: v.num, litros: v.litros, escalada: !!(v.litros && ref && v.litros !== ref),
          cantidad: dosisVasija(it.cantidad, v.litros, ref) });
      }
    }
  }
  return out;
}

export function filaPapelAgregado({ fila }){
  if (fila.tipo === 'lote'){
    const det = [fila.resumen, (fila.varias && fila.ref) ? 'dosis por vasija de ' + fila.ref + ' L' : '']
      .filter(Boolean).join(' · ');
    return '<tr class="ag-sep"><td colspan="5"><b>' + _esc(fila.lote) + '</b>' +
      (det ? ' <span class="ag-sep-det">— ' + _esc(det) + '</span>' : '') + '</td></tr>';
  }
  const vas = (fila.vasija || (fila.litros ? '____' : '')) + (fila.escalada ? ' · ' + fila.litros + ' L' : '');
  return '<tr><td class="oh-check"></td>' +
    '<td class="c">' + _esc(fila.lote) + '</td>' +
    '<td class="c">' + _esc(vas) + '</td>' +
    '<td>' + _esc(fila.producto) + '</td>' +
    '<td class="c"><b>' + _esc(cantidadTexto(fila)) + '</b></td></tr>';
}
