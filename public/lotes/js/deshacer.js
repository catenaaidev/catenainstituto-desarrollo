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
