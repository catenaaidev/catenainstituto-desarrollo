/**
 * El inventario simple: una fila por vasija y una sola puerta de escritura.
 *
 * Hasta el 2026-09-28 cada fila se armaba con cuatro fuentes (el Excel, las
 * correcciones a mano, los escaneos y los pendientes) y la corrección a mano le
 * ganaba a las órdenes. Como escanear también escribía una corrección, un barril
 * escaneado quedaba clavado: el vaciado del trasiego siguiente no entraba y abría
 * un cartel, y el próximo otro. La última acción nunca ganaba.
 *
 * Ahora la fila es la única verdad y lleva la fecha del hecho que la dejó así.
 * La regla es una: gana lo último que pasó, medido por la fecha del hecho; en el
 * mismo día, lo último que se cargó. Una orden de ayer cargada hoy no pisa lo que
 * alguien hizo hoy.
 *
 * Los carteles quedan solo para lo que de verdad pide una decisión: un llenado
 * sobre una vasija que figura llena con otro lote, y una importación del Excel
 * que contradice lo que dice la app. Cada cartel trae sus opciones completas
 * (LLENO/MERMO con un lote, o VACIO): tocar una la aplica y el cartel se va.
 *
 * Todo es puro: no lee el estado global, no toca el DOM. Se carga como <script>
 * clásico y se cuelga de globalThis, igual que altas.js.
 * Se testea en test/barriles-inventario.test.mjs.
 * Diseño: docs/superpowers/specs/2026-09-28-barriles-inventario-simple-design.md
 */

const ESTADOS_INV = ['LLENO', 'MERMO', 'VACIO'];

function txt(v) { return String(v == null ? '' : v).trim(); }

// "vacío", "Vacio", " VACÍO " -> "VACIO". Lo que no es uno de los tres queda tal
// cual (en mayúsculas): el Excel trae filas sin estado y no hay que inventarlo.
function normEstado(e) {
  const s = txt(e).toUpperCase().replace('VACÍO', 'VACIO');
  return s;
}

// "2026-09-16" -> "16/9"
function fechaDM(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt(iso));
  return m ? `${+m[3]}/${+m[2]}` : txt(iso);
}

// ¿El hecho con fecha `fecha` es más viejo que lo que ya dice la fila? Solo
// cuenta el día: dentro del mismo día gana lo último que se cargó, que es lo que
// pasa si se escribe. Sin fecha de un lado no hay con qué comparar y se escribe.
function esMasViejo(fila, fecha) {
  const f = txt(fecha), ff = txt(fila && fila.fecha);
  return !!(f && ff && f < ff);
}

/**
 * Qué campos quedan en la fila si se le aplica `cambio`, con la coherencia de
 * los tres estados impuesta. No escribe nada.
 *
 *   VACIO  -> sin lote, sin cosecha, 0 litros.
 *   LLENO  -> con lote; litros = capacidad (si la hay).
 *   MERMO  -> con lote; los litros se conservan (perdió volumen, no se sabe cuánto).
 *
 * Ponerle lote a una vasija VACIA sin decir el estado es llenarla. La cosecha,
 * si no viene, se deduce del lote nuevo con `cosechaDe`; si no se puede deducir
 * se deja la que estaba.
 *
 * Devuelve { campos: {estado, lote, cosecha, litros} } o { error }.
 */
function camposCoherentes(fila, cambio, cosechaDe) {
  const f = fila || {};
  const c = cambio || {};
  const loteAntes = txt(f.lote);
  const lote = c.lote !== undefined ? txt(c.lote) : loteAntes;
  let estado = c.estado !== undefined ? normEstado(c.estado) : normEstado(f.estado);
  if (c.estado === undefined && c.lote !== undefined && lote && (estado === 'VACIO' || !estado)) estado = 'LLENO';
  if (estado && !ESTADOS_INV.includes(estado)) return { error: `Estado desconocido: ${estado}. Tiene que ser LLENO, MERMO o VACIO.` };

  if (estado === 'VACIO') return { campos: { estado, lote: '', cosecha: '', litros: 0 } };
  if ((estado === 'LLENO' || estado === 'MERMO') && !lote)
    return { error: `Una vasija ${estado} necesita lote. Para sacarle el lote, ponela VACIO.` };

  let cosecha;
  if (c.cosecha !== undefined) cosecha = txt(c.cosecha);
  else if (lote !== loteAntes) {
    const d = cosechaDe ? cosechaDe(lote) : null;
    cosecha = d == null ? txt(f.cosecha) : String(d);
  } else cosecha = txt(f.cosecha);

  let litros = f.litros;
  const cap = Number(f.cap);
  if (estado === 'LLENO' && cap) litros = cap;
  return { campos: { estado, lote, cosecha, litros } };
}

/**
 * La única puerta de escritura del estado de una vasija. Toda acción pasa por
 * acá: la edición en la lista, el escaneo, las órdenes del escáner, el botón de
 * un cartel y la importación del Excel.
 *
 * meta: { fecha: 'YYYY-MM-DD' del hecho, ts: momento de carga, por: quién lo escribió }
 * (`por` y no `origen`: la planilla ya trae una columna ORIGEN, la de la barrica)
 *
 * Devuelve { viejo: true } sin tocar nada si el hecho es anterior a lo que ya
 * dice la fila; { error } si el cambio es incoherente; si no, escribe y devuelve
 * { antes, despues } con los campos de estado y el sello (fecha/ts/por).
 */
function escribirFila(fila, cambio, meta, cosechaDe) {
  const m = meta || {};
  if (esMasViejo(fila, m.fecha)) return { viejo: true, fechaFila: txt(fila.fecha) };
  const r = camposCoherentes(fila, cambio, cosechaDe);
  if (r.error) return { error: r.error };
  const antes = selloDe(fila);
  Object.assign(fila, r.campos);
  if (m.fecha) fila.fecha = txt(m.fecha);
  fila.ts = m.ts == null ? Date.now() : m.ts;
  if (m.por) fila.por = m.por;
  return { antes, despues: selloDe(fila) };
}

// Lo que hace falta guardar de una fila para poder volverla atrás exactamente.
function selloDe(f) {
  return { estado: f.estado, lote: f.lote, cosecha: f.cosecha, litros: f.litros,
           fecha: f.fecha || '', ts: f.ts || 0, por: f.por || '' };
}

// ---------------- carteles ----------------

// Las opciones de un cartel: por cada lote en juego, LLENO y MERMO con ese lote;
// y siempre VACIO. En el orden en que llegan los lotes (el primero es el que
// propone el hecho nuevo), sin repetir.
function opcionesDeLotes(lotes) {
  const vistos = new Set(), out = [];
  for (const l of (lotes || []).map(txt)) {
    if (!l || vistos.has(l.toUpperCase())) continue;
    vistos.add(l.toUpperCase());
    out.push({ estado: 'LLENO', lote: l }, { estado: 'MERMO', lote: l });
  }
  out.push({ estado: 'VACIO', lote: '' });
  return out;
}

function etiquetaOpcion(o) {
  return o.estado === 'VACIO' ? 'VACÍO' : `${o.estado} ${o.lote}`;
}

let _seqCartel = 0;
function nuevoIdCartel(ts) { return 'c' + (ts == null ? Date.now() : ts) + '-' + (++_seqCartel); }

// Un hecho que escribió la fila deja sin objeto a los carteles que se abrieron
// antes o el mismo día: lo que preguntaban ya lo contestó alguien. Devuelve la
// lista nueva (no muta).
function cerrarCartelesDe(carteles, num, fecha) {
  const n = String(num), f = txt(fecha);
  return (carteles || []).filter(c => !(String(c.num) === n && (!f || txt(c.fecha) <= f)));
}

// Agrega un cartel sin duplicar: el mismo barril por la misma orden (o por la
// misma importación) reemplaza al anterior en vez de sumarle un gemelo.
function agregarCartel(carteles, c) {
  const lista = carteles || [];
  const i = lista.findIndex(x => String(x.num) === String(c.num) && x.origen === c.origen &&
    (x.ordenId || '') === (c.ordenId || ''));
  if (i >= 0) lista[i] = c; else lista.push(c);
  return lista;
}

// ---------------- órdenes del escáner ----------------

const EFECTO_ORDEN = { vaciado: 'vaciado', llenado: 'llenado', llenado_vaciado: 'llenado' };

/**
 * Qué le haría la orden al inventario, sin tocar nada.
 *
 * Devuelve { aplicable, esFutura?, cambios, carteles, sinCambio, noAplicados, avisos }:
 *   cambios     [{ num, cambio }]         lo que se escribe por escribirFila
 *   carteles    [{ num, motivo, opciones }] llenado sobre otro lote
 *   sinCambio   [{ num, motivo }]         ya estaba así, no hay nada que hacer
 *   noAplicados [{ num, motivo }]         no figura, o hay un dato más nuevo
 */
function planOrden(orden, inventario, hoy) {
  const vacio = { aplicable: false, cambios: [], carteles: [], sinCambio: [], noAplicados: [], avisos: [] };
  const tipo = txt(orden && orden.tipo);
  const efecto = Object.prototype.hasOwnProperty.call(EFECTO_ORDEN, tipo) ? EFECTO_ORDEN[tipo] : null;
  if (!efecto) return vacio;
  const fecha = txt(orden.fecha);
  if (fecha && hoy && fecha > txt(hoy)) return { ...vacio, esFutura: true, fechaOrden: fecha };

  const ix = new Map();
  for (const r of (inventario || [])) ix.set(String(r.num), r);
  const lote = txt(orden.lote);
  const out = { aplicable: true, efecto, cambios: [], carteles: [], sinCambio: [], noAplicados: [], avisos: [] };
  const etiqueta = `${tipo} ${txt(orden.ot) || '(sin OT)'}${lote ? ' lote ' + lote : ''}`;
  const vistos = new Set();
  for (const cod of (orden.codigos || [])) {
    const num = String(cod);
    if (vistos.has(num)) continue;
    vistos.add(num);
    const r = ix.get(num);
    if (!r) { out.noAplicados.push({ num, motivo: 'no figura en el inventario' }); continue; }
    if (esMasViejo(r, fecha)) {
      out.noAplicados.push({ num, motivo: `hay un dato más nuevo, del ${fechaDM(r.fecha)}` });
      continue;
    }
    const est = normEstado(r.estado);
    const loteAct = txt(r.lote);
    if (efecto === 'vaciado') {
      if (est === 'VACIO') { out.sinCambio.push({ num, motivo: 'ya figura VACIO' }); continue; }
      if (loteAct && lote && loteAct.toUpperCase() !== lote.toUpperCase())
        out.avisos.push(`${num}: figuraba con lote ${loteAct}, la orden es del ${lote} — se vacía igual`);
      out.cambios.push({ num, cambio: { estado: 'VACIO' } });
      continue;
    }
    // llenado
    if (!lote) { out.noAplicados.push({ num, motivo: 'la orden no trae lote' }); continue; }
    if (est === 'LLENO' || est === 'MERMO') {
      if (loteAct.toUpperCase() === lote.toUpperCase()) {
        if (est === 'LLENO') out.sinCambio.push({ num, motivo: 'ya figura LLENO con ese lote' });
        else out.cambios.push({ num, cambio: { estado: 'LLENO', lote } });   // relleno de una mermada
        continue;
      }
      out.carteles.push({ num,
        motivo: `${etiqueta}: la vasija figuraba ${est} con lote ${loteAct || '—'}`,
        opciones: opcionesDeLotes([lote, loteAct]) });
      continue;
    }
    out.cambios.push({ num, cambio: { estado: 'LLENO', lote } });
  }
  return out;
}

/**
 * Qué barriles se pueden volver atrás al deshacer una orden aplicada. Solo los
 * que siguen como la orden los dejó: si después pasó otra cosa (otra orden, un
 * escaneo, una edición), deshacer pisaría lo más nuevo.
 *
 * Las órdenes aplicadas con el motor viejo no traen sello: para esas se compara
 * contra lo que la orden dejó escrito, que es lo que se hacía antes.
 */
function planDeshacer(orden, inventario) {
  const ap = orden && orden.aplicado;
  const out = { revertir: [], quedan: [] };
  if (!ap) return out;
  const ix = new Map();
  for (const r of (inventario || [])) ix.set(String(r.num), r);
  const por = 'orden:' + orden.id;
  for (const c of (ap.cambios || [])) {
    const r = ix.get(String(c.num));
    if (!r) { out.quedan.push({ num: c.num, motivo: 'ya no figura en el inventario' }); continue; }
    const d = c.despues || {};
    const sigue = d.ts
      ? (r.por === por && Number(r.ts) === Number(d.ts))
      : (normEstado(r.estado) === normEstado(d.estado) && txt(r.lote) === txt(d.lote) &&
         txt(r.cosecha) === txt(d.cosecha));
    if (sigue) out.revertir.push(c);
    else out.quedan.push({ num: c.num, motivo: `cambió después${r.fecha ? ' (' + fechaDM(r.fecha) + ')' : ''}` });
  }
  return out;
}

// ---------------- importar el Excel ----------------

// Los datos de la vasija que no son su estado: vienen del Excel y se actualizan
// directo, sin preguntar.
const CAMPOS_FICHA = ['cap', 'anio', 'marca', 'origen', 'trat', 'uso'];

/**
 * Qué haría importar la planilla, sin tocar nada. La importación ya no reemplaza
 * el inventario: agrega las vasijas nuevas, actualiza la ficha (capacidad, marca,
 * etc.) y, si la planilla dice otro estado/lote/cosecha que la app, abre un
 * cartel con las dos versiones. No borra filas: las que la planilla no trae se
 * quedan (dar de baja es su propio botón).
 */
function planImportacion(filasExcel, inventario) {
  const ix = new Map();
  for (const r of (inventario || [])) ix.set(String(r.num), r);
  const out = { nuevas: [], ficha: [], carteles: [], iguales: 0, faltan: [] };
  const enExcel = new Set();
  for (const e of (filasExcel || [])) {
    const num = txt(e.num);
    if (!num || enExcel.has(num)) continue;
    enExcel.add(num);
    const r = ix.get(num);
    if (!r) { out.nuevas.push({ ...e, num, estado: normEstado(e.estado), lote: txt(e.lote) }); continue; }
    // una columna que la planilla no trae viene undefined y no se toca
    const campos = {};
    for (const k of CAMPOS_FICHA) if (e[k] !== undefined && txt(e[k]) !== txt(r[k])) campos[k] = e[k];
    if (Object.keys(campos).length || r.alta) out.ficha.push({ num, campos });
    if (e.estado === undefined) { out.iguales++; continue; }   // sin columna ESTADO no hay con qué comparar
    const eEst = normEstado(e.estado), rEst = normEstado(r.estado);
    const eLote = eEst === 'VACIO' ? '' : e.lote === undefined ? txt(r.lote) : txt(e.lote);
    const eCos = eEst === 'VACIO' ? '' : txt(e.cosecha);
    const distinto = eEst !== rEst || eLote.toUpperCase() !== txt(r.lote).toUpperCase() ||
      (eEst !== 'VACIO' && eCos && eCos !== txt(r.cosecha));
    if (!distinto) { out.iguales++; continue; }
    const dice = eEst === 'VACIO' ? 'VACIO' : `${eEst || '(sin estado)'} ${eLote || '—'}`;
    const app = rEst === 'VACIO' ? 'VACIO' : `${rEst || '(sin estado)'} ${txt(r.lote) || '—'}`;
    out.carteles.push({ num, motivo: `El Excel dice ${dice}; la app dice ${app}`,
      opciones: opcionesDeLotes([eLote, txt(r.lote)]), excel: { estado: eEst, lote: eLote, cosecha: eCos } });
  }
  for (const r of (inventario || [])) if (!enExcel.has(String(r.num))) out.faltan.push(String(r.num));
  return out;
}

// ---------------- fusión al reintentar un 409 ----------------

/**
 * Fusión de tres vías por clave, para cuando otro dispositivo escribió mientras
 * el nuestro subía: lo que este dispositivo cambió respecto de la base gana; lo
 * que no tocó, viene del servidor. Si los dos cambiaron el mismo elemento, gana
 * el de `ts` más nuevo.
 *
 * base: Map clave -> JSON del elemento en la última sincronización.
 * fusionarElemento (opcional): (base, local, serv) -> elemento, para cuando los
 * dos cambiaron el mismo elemento y el ts solo no alcanza (las filas del
 * inventario, ver fusionarFilaInv).
 * Devuelve el array nuevo (no muta `serv`).
 */
function fusionar3(base, local, serv, clave, fusionarElemento) {
  const b = base || new Map();
  const loc = new Map((local || []).map(x => [clave(x), x]));
  const out = [];
  const vistos = new Set();
  for (const s of (serv || [])) {
    const k = clave(s);
    vistos.add(k);
    const l = loc.get(k);
    const enBase = b.get(k);
    if (l === undefined) {
      // no lo tengo: o lo borré yo (estaba en la base) o es nuevo del servidor
      if (enBase !== undefined && enBase === JSON.stringify(s)) continue;   // lo borré y nadie lo tocó
      out.push(s); continue;
    }
    const cambieYo = enBase === undefined || JSON.stringify(l) !== enBase;
    const cambioServ = enBase === undefined || JSON.stringify(s) !== enBase;
    if (cambieYo && cambioServ) {
      if (fusionarElemento && enBase !== undefined) out.push(fusionarElemento(JSON.parse(enBase), l, s));
      else out.push((Number(l.ts) || 0) >= (Number(s.ts) || 0) ? l : s);
    }
    else out.push(cambieYo ? l : s);
  }
  for (const [k, l] of loc) {
    if (vistos.has(k)) continue;
    // lo tengo y el servidor no: si estaba en la base lo borró otro (y yo no lo
    // cambié, o sí); si no estaba, es nuevo mío.
    const enBase = b.get(k);
    if (enBase === undefined || JSON.stringify(l) !== enBase) out.push(l);
  }
  return out;
}

// Los campos que dicen en qué estado está la vasija y de qué hecho salió. Van
// juntos siempre: mezclar el estado de un lado con el lote del otro armaría una
// fila que nadie escribió (VACIO con lote, LLENO sin lote).
const CAMPOS_HECHO = ['estado', 'lote', 'cosecha', 'litros', 'fecha', 'ts', 'por'];

/**
 * Una fila del inventario que cambiaron los dos lados a la vez. Elegir la fila
 * entera por `ts` perdía datos: la marca (o la ficha que trae el Excel) se edita
 * sin tocar `ts` —a propósito: planDeshacer usa el ts para saber si la orden
 * sigue siendo lo último—, así que un escaneo en otro celular, con ts más nuevo,
 * se llevaba puesta la corrección de la marca.
 *
 * Ahora:
 *  - el hecho (CAMPOS_HECHO) va en bloque: si lo cambió un solo lado, el de ese
 *    lado; si los dos, el de ts más nuevo (la regla de siempre);
 *  - lo demás (marca, capacidad, año, alta…), campo por campo: lo que cambié yo
 *    respecto de la base gana; lo que no toqué, queda como en el servidor.
 */
function fusionarFilaInv(base, local, serv) {
  const b = base || {}, l = local || {}, s = serv || {};
  const mismo = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const hecho = f => CAMPOS_HECHO.map(k => f[k]);
  const cambieHecho = !mismo(hecho(l), hecho(b));
  const cambioHecho = !mismo(hecho(s), hecho(b));
  const deHecho = cambieHecho && (!cambioHecho || (Number(l.ts) || 0) >= (Number(s.ts) || 0)) ? l : s;
  const out = {};
  const claves = new Set(Object.keys(b).concat(Object.keys(l), Object.keys(s)));
  for (const k of claves) {
    const v = CAMPOS_HECHO.includes(k) ? deHecho[k] : (mismo(l[k], b[k]) ? s[k] : l[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function fotoPorClave(arr, clave) {
  const m = new Map();
  for (const x of (arr || [])) m.set(clave(x), JSON.stringify(x));
  return m;
}

// ---------------- migración desde el modelo de cuatro capas ----------------

// Las secciones que el modelo nuevo ya no usa.
const SECCIONES_VIEJAS = ['tanques', 'ediciones', 'revisiones'];

function necesitaMigracion(estado) {
  return SECCIONES_VIEJAS.some(k => Array.isArray(estado && estado[k]));
}

// El código de un lote para compararlo: "26730 ROJO" y "26730 CHECK ROJO" son el
// lote 26730 con una anotación del rótulo. Los lotes con nombre (VERMUT, JEREZ)
// se comparan enteros.
function codigoLote(l) {
  const t = txt(l).toUpperCase();
  const m = /^(\d{5})(?!\d)/.exec(t);
  return m ? m[1] : t;
}

// La fecha más nueva que se sabe de cada fila SIN contar su escaneo: su
// corrección a mano o la última orden aplicada que la tocó. num -> {fecha, ts}.
function fechasSinEscaneo(e, ix) {
  const fechas = new Map();
  const ver = (num, fecha, ts) => {
    const f = txt(fecha);
    if (!f || !ix.has(num)) return;
    const prev = fechas.get(num);
    if (!prev || f > prev.fecha || (f === prev.fecha && (ts || 0) > prev.ts)) fechas.set(num, { fecha: f, ts: ts || 0 });
  };
  for (const ed of (e.ediciones || [])) ver(String(ed.num), ed.fecha, ed.ts);
  for (const o of (e.escaneos || [])) {
    if (!o || !o.aplicado) continue;
    for (const c of (o.aplicado.cambios || [])) ver(String(c.num), o.fecha, 0);
  }
  return fechas;
}

/**
 * Qué haría migrar, sin tocar nada: cuántas correcciones quedan fijas, la lista
 * de vasijas donde el último escaneo dice otra cosa que la fila (para mirarla
 * antes), y cuántos carteles viejos se descartan.
 *
 * Cada discrepancia trae `recomendado`: 'escaneo' si el escaneo es más nuevo que
 * todo lo demás que se sabe de la fila (pasa con los escaneos del operario, que
 * nunca llegaban a la fila), 'fila' si no. El piso es la fecha de corte del
 * inventario (`inventarioCorte`, por defecto el 2026-08-18 de la unificación):
 * el Excel de ese día ya incorporaba todo lo anterior, así que un escaneo de
 * julio es más viejo que la fila aunque la fila no tenga fecha propia.
 */
const CORTE_INVENTARIO_DEFECTO = '2026-08-18';
function planMigracion(estado) {
  const e = estado || {};
  const ix = new Map();
  for (const r of (e.inventario || [])) ix.set(String(r.num), r);
  const ediciones = (e.ediciones || []).filter(x => ix.has(String(x.num)));
  // el valor que queda en la fila es el de la corrección, si la hay
  const valor = (num, campo) => {
    const ed = (e.ediciones || []).find(x => String(x.num) === num && x.campo === campo);
    const r = ix.get(num);
    return txt(ed ? ed.valor : r && r[campo]);
  };
  const fechas = fechasSinEscaneo(e, ix);
  const corte = txt(e.inventarioCorte) || CORTE_INVENTARIO_DEFECTO;
  const discrepancias = [];
  for (const t of (e.tanques || [])) {
    const num = String(t.num);
    if (!ix.has(num)) continue;
    const loteFila = valor(num, 'lote');
    const estFila = normEstado(valor(num, 'estado'));
    const loteEsc = t.vacia ? '' : txt(t.lote);
    const vaciaEsc = !!t.vacia || !loteEsc || ['VACIO', 'BORRA'].includes(loteEsc.toUpperCase());
    const coincide = vaciaEsc ? estFila === 'VACIO' : codigoLote(loteFila) === codigoLote(loteEsc);
    if (coincide) continue;
    const ff = fechas.get(num);
    const fechaFila = ff ? ff.fecha : '';
    const fe = txt(t.fecha);
    discrepancias.push({ num, estadoFila: estFila, loteFila, fechaFila,
      escaneo: vaciaEsc ? 'VACIA' : loteEsc, fechaEscaneo: fe,
      recomendado: fe && fe > (fechaFila > corte ? fechaFila : corte) ? 'escaneo' : 'fila' });
  }
  const abiertos = (e.revisiones || []).filter(r => !r.revisado).length;
  const noFiguran = (e.tanques || []).filter(t => !ix.has(String(t.num))).length;
  return { ediciones: ediciones.length, discrepancias, cartelesViejos: abiertos,
           escaneos: (e.tanques || []).length, noFiguran };
}

/**
 * Migra el estado al modelo nuevo (muta `estado`):
 *   1. deja fijas en la fila las correcciones a mano (la capa desaparece);
 *   2. en las vasijas de `usarEscaneo` (números), escribe lo que dijo el escaneo;
 *   3. le pone a cada fila la fecha más nueva que se sabe de ella: su corrección,
 *      su escaneo, o la última orden aplicada que la tocó;
 *   4. borra tanques, ediciones y revisiones, y arranca carteles vacío.
 * opciones: { usarEscaneo: Set|Array de números, cosechaDe: lote -> cosecha|null }
 * Devuelve cuántas filas quedaron con fecha.
 */
function migrarEstado(estado, opciones) {
  const e = estado;
  const op = opciones || {};
  const usar = new Set([...(op.usarEscaneo || [])].map(String));
  const ix = new Map();
  for (const r of (e.inventario || [])) ix.set(String(r.num), r);
  const fechas = fechasSinEscaneo(e, ix);
  const EDITABLES = ['lote', 'estado', 'marca', 'cosecha', 'litros'];
  for (const ed of (e.ediciones || [])) {
    const r = ix.get(String(ed.num));
    if (r && EDITABLES.includes(ed.campo)) r[ed.campo] = ed.valor;
  }
  const porNum = new Map();
  for (const [num, f] of fechas) porNum.set(num, { ...f, por: 'migracion' });
  for (const t of (e.tanques || [])) {
    const num = String(t.num);
    const r = ix.get(num);
    if (!r) continue;
    const f = txt(t.fecha);
    if (usar.has(num)) {
      const lote = t.vacia ? '' : txt(t.lote).toUpperCase();
      const vaciar = !lote || ['VACIO', 'BORRA'].includes(lote);
      const c = camposCoherentes(r, vaciar ? { estado: 'VACIO' } : { lote }, op.cosechaDe);
      if (c.campos) Object.assign(r, c.campos);
      porNum.set(num, { fecha: f, ts: t.ts || 0, por: 'escaneo' });
      continue;
    }
    const prev = porNum.get(num);
    if (f && (!prev || f > prev.fecha)) porNum.set(num, { fecha: f, ts: t.ts || 0, por: 'migracion' });
  }
  let n = 0;
  for (const [num, f] of porNum) {
    const r = ix.get(num);
    if (!r || !f.fecha) continue;
    r.fecha = f.fecha; r.ts = f.ts; r.por = f.por;
    n++;
  }
  for (const r of (e.inventario || [])) {
    const est = normEstado(r.estado);
    if (est !== r.estado) r.estado = est;
    if (est === 'VACIO') { r.lote = ''; r.cosecha = ''; r.litros = 0; }
  }
  for (const k of SECCIONES_VIEJAS) delete e[k];
  if (!Array.isArray(e.carteles)) e.carteles = [];
  return n;
}

globalThis.ESTADOS_INV = ESTADOS_INV;
globalThis.normEstado = normEstado;
globalThis.fechaDM = fechaDM;
globalThis.esMasViejo = esMasViejo;
globalThis.camposCoherentes = camposCoherentes;
globalThis.escribirFila = escribirFila;
globalThis.selloDe = selloDe;
globalThis.opcionesDeLotes = opcionesDeLotes;
globalThis.etiquetaOpcion = etiquetaOpcion;
globalThis.nuevoIdCartel = nuevoIdCartel;
globalThis.cerrarCartelesDe = cerrarCartelesDe;
globalThis.agregarCartel = agregarCartel;
globalThis.EFECTO_ORDEN = EFECTO_ORDEN;
globalThis.planOrden = planOrden;
globalThis.planDeshacer = planDeshacer;
globalThis.CAMPOS_FICHA = CAMPOS_FICHA;
globalThis.planImportacion = planImportacion;
globalThis.fusionar3 = fusionar3;
globalThis.CAMPOS_HECHO = CAMPOS_HECHO;
globalThis.fusionarFilaInv = fusionarFilaInv;
globalThis.fotoPorClave = fotoPorClave;
globalThis.SECCIONES_VIEJAS = SECCIONES_VIEJAS;
globalThis.necesitaMigracion = necesitaMigracion;
globalThis.planMigracion = planMigracion;
globalThis.codigoLote = codigoLote;
globalThis.migrarEstado = migrarEstado;
