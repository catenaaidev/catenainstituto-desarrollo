/* ===== Lotes CIW — deshacer / rehacer de toda la pagina =====
 * Puro, sin DOM. Todo cambio de datos pasa por markDirty() (nucleo.js); despues
 * de cada accion nucleo compara el documento con una FOTO (cada fila pasada a
 * texto JSON) y apila las filas que cambiaron. Asi cualquier boton, actual o
 * futuro, queda cubierto sin que tenga que anotar nada.
 *
 * Se guarda TEXTO y no referencias a objetos: un 409 que combina con lo de otro
 * dispositivo reemplaza todos los objetos, y el deshacer tiene que seguir
 * sirviendo despues (el de la grilla, que guardaba objetos, se borraba entero).
 * Spec: docs/superpowers/specs/2026-10-05-lotes-autoguardado-deshacer-design.md
 */
'use strict';

/* Secciones con clave natural. Las listas que no estan aca (analisis,
 * excepciones_analisis, cualquiera que aparezca) se comparan por contenido,
 * como fusionarPorContenido de shared/fusion.js. */
export const CLAVE_DE_SECCION = {
  lotes: 'lote', movimientos: 'id', ordenes_trabajo: 'id', mermas: 'id', vasijas: 'num',
};

/* meta la maneja el servidor (version, autor, actualizado): deshacerla
 * mandaria una version vieja y el guardado daria 409 para siempre. */
const FUERA = new Set(['meta']);

const aTexto = v => JSON.stringify(v);

export function claveDeFila(fila, campo){
  if (!fila || typeof fila !== 'object') return null;
  const v = fila[campo];
  return (v == null || v === '') ? null : String(v);
}

function fotoSeccion(nombre, valor){
  if (Array.isArray(valor)){
    const textos = valor.map(aTexto);
    const campo = CLAVE_DE_SECCION[nombre];
    if (campo){
      const claves = valor.map(f => claveDeFila(f, campo));
      /* Una fila sin clave o una clave repetida haria confundir dos filas: en
       * ese caso se compara por contenido. Mas grueso, pero nunca equivocado. */
      if (!claves.includes(null) && new Set(claves).size === claves.length){
        return { tipo: 'clave', campo, claves, textos };
      }
    }
    return { tipo: 'contenido', textos };
  }
  if (valor && typeof valor === 'object'){
    const filas = {};
    for (const k of Object.keys(valor)){
      const t = aTexto(valor[k]);
      if (t !== undefined) filas[k] = t;
    }
    return { tipo: 'objeto', filas };
  }
  return { tipo: 'valor', texto: aTexto(valor) };
}

/* El texto de la seccion entera, igual al JSON.stringify del valor. */
function textoSeccion(f){
  if (!f) return undefined;
  if (f.tipo === 'clave' || f.tipo === 'contenido') return '[' + f.textos.join(',') + ']';
  if (f.tipo === 'objeto'){
    return '{' + Object.keys(f.filas).map(k => JSON.stringify(k) + ':' + f.filas[k]).join(',') + '}';
  }
  return f.texto;
}

export function tomarFoto(datos){
  const foto = {};
  for (const nombre of Object.keys(datos || {})){
    if (FUERA.has(nombre)) continue;
    foto[nombre] = fotoSeccion(nombre, datos[nombre]);
  }
  return foto;
}

function mismosTextos(a, b){
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function difClave(s, a, b, cambios){
  if (mismosTextos(a.textos, b.textos) && mismosTextos(a.claves, b.claves)) return;
  const idxA = new Map(a.claves.map((k, i) => [k, i]));
  const idxB = new Map(b.claves.map((k, i) => [k, i]));
  for (let i = 0; i < a.claves.length; i++){
    const k = a.claves[i], j = idxB.get(k);
    if (j === undefined){
      cambios.push({ seccion: s, tipo: 'fila', clave: k, antes: a.textos[i], despues: null, pos: i });
    } else if (a.textos[i] !== b.textos[j]){
      cambios.push({ seccion: s, tipo: 'fila', clave: k, antes: a.textos[i], despues: b.textos[j], pos: j });
    }
  }
  for (let j = 0; j < b.claves.length; j++){
    const k = b.claves[j];
    if (!idxA.has(k)) cambios.push({ seccion: s, tipo: 'fila', clave: k, antes: null, despues: b.textos[j], pos: j });
  }
  /* El orden se anota solo si las filas que estan en los dos lados cambiaron
   * de lugar entre si (el boton "Ordenar" de Lotes). Un alta o una baja corre
   * a las demas, pero eso no es reordenar. */
  const comunesA = a.claves.filter(k => idxB.has(k));
  const comunesB = b.claves.filter(k => idxA.has(k));
  if (!mismosTextos(comunesA, comunesB)){
    cambios.push({ seccion: s, tipo: 'orden', antes: a.claves.slice(), despues: b.claves.slice() });
  }
}

function contar(textos){
  const m = new Map();
  for (const t of textos) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

function difContenido(s, a, b, cambios){
  if (mismosTextos(a.textos, b.textos)) return;
  // Multiconjunto: dos analisis identicos son dos filas, no una.
  const enB = contar(b.textos), enA = contar(a.textos);
  const quitadas = [], puestas = [];
  a.textos.forEach((t, i) => { const n = enB.get(t) || 0; if (n) enB.set(t, n - 1); else quitadas.push({ t, pos: i }); });
  b.textos.forEach((t, j) => { const n = enA.get(t) || 0; if (n) enA.set(t, n - 1); else puestas.push({ t, pos: j }); });
  /* Una quitada y una puesta en la misma posicion son la misma fila editada:
   * asi deshacer la reescribe en su lugar en vez de borrar y agregar. */
  const puestaEn = new Map(puestas.map(p => [p.pos, p]));
  for (const q of quitadas){
    const p = puestaEn.get(q.pos);
    if (p){
      puestaEn.delete(q.pos);
      cambios.push({ seccion: s, tipo: 'fila', clave: null, antes: q.t, despues: p.t, pos: q.pos });
    } else {
      cambios.push({ seccion: s, tipo: 'fila', clave: null, antes: q.t, despues: null, pos: q.pos });
    }
  }
  for (const p of puestaEn.values()){
    cambios.push({ seccion: s, tipo: 'fila', clave: null, antes: null, despues: p.t, pos: p.pos });
  }
}

function difObjeto(s, a, b, cambios){
  for (const k of new Set([...Object.keys(a.filas), ...Object.keys(b.filas)])){
    const ta = a.filas[k] ?? null, tb = b.filas[k] ?? null;
    if (ta !== tb) cambios.push({ seccion: s, tipo: 'campo', clave: k, antes: ta, despues: tb });
  }
}

/** Lo que cambio desde la foto. Devuelve tambien la foto nueva, que reusa los
 *  textos ya calculados: asi cerrar un paso pasa el documento a texto una sola vez. */
export function diferencia(foto, datos){
  const nueva = tomarFoto(datos);
  const cambios = [];
  for (const s of new Set([...Object.keys(foto || {}), ...Object.keys(nueva)])){
    const a = foto ? foto[s] : undefined, b = nueva[s];
    if (a && b && a.tipo === b.tipo && (a.tipo !== 'clave' || a.campo === b.campo)){
      if (a.tipo === 'clave') difClave(s, a, b, cambios);
      else if (a.tipo === 'contenido') difContenido(s, a, b, cambios);
      else if (a.tipo === 'objeto') difObjeto(s, a, b, cambios);
      else if (a.texto !== b.texto) cambios.push({ seccion: s, tipo: 'valor', antes: a.texto, despues: b.texto });
    } else {
      // La seccion aparecio, desaparecio o cambio de forma: se anota entera.
      const ta = textoSeccion(a), tb = textoSeccion(b);
      if (ta !== tb) cambios.push({ seccion: s, tipo: 'valor', antes: ta, despues: tb });
    }
  }
  return { cambios, foto: nueva };
}

/* ---------- aplicar al reves ---------- */

const esObjetoPlano = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/* Reescribe `obj` con el contenido de `nuevo` sin cambiar el objeto: las
 * grillas y la ficha tienen referencias a las filas y tienen que seguir
 * apuntando a algo vivo. Si no son los dos objetos, devuelve `nuevo`. */
function enSitio(obj, nuevo){
  if (!esObjetoPlano(obj) || !esObjetoPlano(nuevo)) return nuevo;
  for (const k of Object.keys(obj)) delete obj[k];
  Object.assign(obj, nuevo);
  return obj;
}

/* Donde esta hoy la fila que tiene que estar como `texto`, o -1. */
function buscarFila(arr, s, c, texto){
  const campo = CLAVE_DE_SECCION[s];
  if (c.clave != null && campo){
    const i = arr.findIndex(f => claveDeFila(f, campo) === c.clave);
    return (i >= 0 && aTexto(arr[i]) === texto) ? i : -1;
  }
  // Por contenido: primero donde estaba, despues en cualquier lado.
  if (c.pos != null && c.pos < arr.length && aTexto(arr[c.pos]) === texto) return c.pos;
  return arr.findIndex(f => aTexto(f) === texto);
}

function existeClave(arr, s, clave){
  const campo = CLAVE_DE_SECCION[s];
  return clave != null && !!campo && arr.some(f => claveDeFila(f, campo) === clave);
}

/** Aplica los cambios de un paso hacia atras ('deshacer') o hacia adelante
 *  ('rehacer') sobre el documento ACTUAL. Cada fila se toca solo si hoy esta
 *  exactamente como quedo despues del paso (o antes, al rehacer): si otra
 *  persona la cambio despues, se saltea y se devuelve en `salteados`. */
export function aplicar(datos, cambios, sentido){
  const atras = sentido === 'deshacer';
  const desde = c => atras ? c.despues : c.antes;   // como tiene que estar hoy
  const hacia = c => atras ? c.antes : c.despues;   // como queda
  const salteados = [];
  let aplicados = 0;

  // 1) secciones enteras
  for (const c of cambios.filter(c => c.tipo === 'valor')){
    if (aTexto(datos[c.seccion]) !== desde(c)){ salteados.push(c); continue; }
    if (hacia(c) === undefined) delete datos[c.seccion];
    else datos[c.seccion] = JSON.parse(hacia(c));
    aplicados++;
  }

  // 2) campos de secciones objeto
  for (const c of cambios.filter(c => c.tipo === 'campo')){
    const seccion = datos[c.seccion];
    /* Determina hoy SIN modificar: si la sección no existe o no es objeto plano,
     * la comparación es contra null (campo ausente). Si otro cambio la convirtió
     * en algo que no es objeto (ej. array), se saltea. */
    let hoy;
    if (seccion === undefined){
      hoy = null;
    } else if (!esObjetoPlano(seccion)){
      salteados.push(c);
      continue;
    } else {
      hoy = seccion[c.clave] === undefined ? null : aTexto(seccion[c.clave]);
    }
    if (hoy !== desde(c)){ salteados.push(c); continue; }
    /* Ahora sí modifica: o existe y es objeto plano, o no existía y vamos a crearla. */
    const o = esObjetoPlano(datos[c.seccion]) ? datos[c.seccion] : (datos[c.seccion] = {});
    if (hacia(c) === null) delete o[c.clave];
    else o[c.clave] = enSitio(o[c.clave], JSON.parse(hacia(c)));
    aplicados++;
  }

  // 3) filas: ediciones, despues bajas, despues altas (en orden de posicion,
  //    asi cada una vuelve a su lugar aunque sean varias)
  const filas = cambios.filter(c => c.tipo === 'fila');
  const arr = s => (Array.isArray(datos[s]) ? datos[s] : (datos[s] = []));
  for (const c of filas.filter(c => desde(c) !== null && hacia(c) !== null)){
    const a = arr(c.seccion), i = buscarFila(a, c.seccion, c, desde(c));
    if (i < 0){ salteados.push(c); continue; }
    a[i] = enSitio(a[i], JSON.parse(hacia(c)));
    aplicados++;
  }
  for (const c of filas.filter(c => desde(c) !== null && hacia(c) === null)){
    const a = arr(c.seccion), i = buscarFila(a, c.seccion, c, desde(c));
    if (i < 0){ salteados.push(c); continue; }
    a.splice(i, 1);
    aplicados++;
  }
  for (const c of filas.filter(c => desde(c) === null && hacia(c) !== null).sort((x, y) => x.pos - y.pos)){
    const a = arr(c.seccion);
    if (existeClave(a, c.seccion, c.clave)){ salteados.push(c); continue; }
    a.splice(Math.min(c.pos, a.length), 0, JSON.parse(hacia(c)));
    aplicados++;
  }

  // 4) orden (al final, con las filas ya en su lugar). No se saltea nunca: si
  //    otro agrego filas, quedan al final en el orden en que estaban.
  for (const c of cambios.filter(c => c.tipo === 'orden')){
    const a = datos[c.seccion], campo = CLAVE_DE_SECCION[c.seccion];
    if (!Array.isArray(a) || !campo) continue;
    const rango = new Map(hacia(c).map((k, i) => [k, i]));
    const con = [], sin = [];
    for (const f of a) (rango.has(claveDeFila(f, campo)) ? con : sin).push(f);
    con.sort((x, y) => rango.get(claveDeFila(x, campo)) - rango.get(claveDeFila(y, campo)));
    a.splice(0, a.length, ...con, ...sin);
    aplicados++;
  }

  return { aplicados, salteados };
}

/* ---------- pila ---------- */

/** Pila de pasos. paso = {cambios, etiqueta, vista}. Misma linea de tiempo sin
 *  ramas que tenia grilla-undo.js: hacer algo nuevo descarta el rehacer. */
export function crearHistorial(tope = 100){
  let atras = [], adelante = [];
  return {
    apilar(paso){
      if (!paso || !paso.cambios || !paso.cambios.length) return false;
      atras.push(paso);
      adelante = [];
      if (atras.length > tope) atras.shift();
      return true;
    },
    deshacer(){
      const p = atras.pop();
      if (!p) return null;
      adelante.push(p);
      return p;
    },
    rehacer(){
      const p = adelante.pop();
      if (!p) return null;
      atras.push(p);
      return p;
    },
    limpiar(){ atras = []; adelante = []; },
    tamano(){ return { atras: atras.length, adelante: adelante.length }; },
  };
}

/* ---------- textos para el aviso ---------- */

const NOMBRES = {
  lotes: ['lote', 'lotes'], analisis: ['análisis', 'análisis'],
  movimientos: ['movimiento', 'movimientos'], ordenes_trabajo: ['OT', 'OT'],
  vasijas: ['vasija', 'vasijas'], mermas: ['merma', 'mermas'],
  estado_lote: ['estado de lote', 'estados de lote'], config: ['Config', 'ajustes de Config'],
  excepciones_analisis: ['excepción', 'excepciones'],
};
const nombre = (s, plural) => (NOMBRES[s] || [s, s])[plural ? 1 : 0];

function loteDe(c){
  try {
    const o = JSON.parse(c.despues ?? c.antes);
    return o && o.lote != null && o.lote !== '' ? String(o.lote) : '';
  } catch (e) { return ''; }
}

export function describirCambio(c){
  if (c.tipo === 'campo'){
    return c.seccion === 'estado_lote' ? `estado del lote ${c.clave}` : `${nombre(c.seccion)} ${c.clave}`;
  }
  if (c.tipo === 'valor') return nombre(c.seccion, true);
  if (c.tipo === 'orden') return `orden de ${nombre(c.seccion, true)}`;
  if (c.seccion === 'lotes' || c.seccion === 'vasijas') return `${nombre(c.seccion)} ${c.clave}`;
  const lote = loteDe(c);
  return lote ? `${nombre(c.seccion)} del lote ${lote}` : nombre(c.seccion);
}

export function describirPaso(cambios){
  const filas = cambios.filter(c => c.tipo !== 'orden');
  if (!filas.length) return cambios.length ? describirCambio(cambios[0]) : '';
  if (filas.length === 1) return describirCambio(filas[0]);
  const secciones = new Set(filas.map(c => c.seccion));
  if (secciones.size === 1) return `${filas.length} ${nombre(filas[0].seccion, true)}`;
  return `${filas.length} cambios`;
}
