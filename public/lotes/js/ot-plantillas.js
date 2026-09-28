/* ===== Lotes CIW — plantillas de las OT de trasiego (datos puros) =====
 *
 * Cada plantilla es la lista ordenada de bloques de la hoja RCI 08 tal como
 * la arma la bodega en Excel. Los textos se copiaron de las órdenes reales
 * de 'Ordenes de Trabajo 2026': son las palabras que el operario ya conoce, no
 * hay que reescribirlas.
 *
 * Cada plantilla tiene su modelo COMPLETO, escrito entero, aunque repita pasos
 * de otra: se ajustan de a una contra su orden de referencia, y un cuerpo
 * compartido hacía que corregir una cambiara en silencio la hoja de la otra.
 *
 * Agregar una plantilla es agregar un objeto acá; ot-hojas.js sabe dibujar
 * todos los tipos de bloque de TIPOS_BLOQUE.
 *
 * `origen: 'tanque'` = el vino sale de un tanque, no de barriles del Mapa: el
 * formulario pide el tanque y la cantidad de barricas a llenar por lote.
 *
 * `loteCorte: true` = el formulario pide el lote que se forma en el destino.
 * `hojas` = las hojas que se ofrecen al imprimir (sin él, las tres). */
'use strict';

export const TIPOS_BLOQUE = ['paso', 'dato', 'ids', 'tabla-vaciado', 'rotular', 'tabla-correccion', 'tabla-llenado'];

export const COLS_VACIADO = {
  lote: 'CIW lote',
  vasijas: 'Vasija',
  litros: 'Litros',
  destino: 'Destino',
  caudalimetro: 'Litros caudalímetro',
  merma: 'Merma',
};

// Modelos de la tabla de llenado (ver tablaLlenado en ot-hojas.js).
export const MODELOS_LLENADO = ['a-barricas', 'desde-tanque'];

// Modelos de la tabla de corrección (ver tablaCorreccion en ot-hojas.js).
export const MODELOS_CORRECCION = ['agregado-corte'];

const p = (texto, extra) => ({ tipo: 'paso', texto, ...(extra || {}) });
const dato = (texto, extra) => ({ tipo: 'dato', texto, ...(extra || {}) });

export const PLANTILLAS_OT = [
  {
    // Referencia: 0700 Trasiego fin FML de barricas a barricas 26217.
    id: 'barricas-barricas',
    nombre: 'Trasiego fin FML de barricas a barricas',
    banda: ['TRASIEGO', 'FIN FML'],
    origen: 'barriles',
    bloques: [
      p('Buscar barriles de lotes solicitados, para degustación.', { ok: true }),
      p('Santizar bomba, cañerías, picos de llenado, visor T y cápsula de gas.'),
      p('Sanitizar vasija a utilizar. (técnico tiene que revisar)', { ok: true }),
      p('Sanitizar clapets antes de comenzar trasiego.'),
      p('Revisar apertura de tapas de vasija.'),
      p('Trasegar SEPARANDO DE BORRAS a tanque con nitrógeno o Argón en vena. Abrir antes para inertizar cañería.'),
      { tipo: 'tabla-vaciado', columnas: ['lote', 'vasijas', 'litros', 'destino', 'merma'] },
      { tipo: 'rotular' },
      p('Inertizar espacio de cabeza con Argón'),
      p('Tomar muestra en tubo falcon y llevar a laboratorio CIW.'),
      p('Lavar barriles y vaporizar.'),
      p('De ser necesario, realizar las siguientes correcciones'),
      { tipo: 'tabla-correccion' },
      p('Homogeneizar y llevar muestra a laboratorio para chequeo'),
      p('Preparar para volver a los mismos barriles/ o barriles según indicaciones'),
      p('Lavarlos con hidro agua caliente, luego enfriarlos con agua fría y dejar escurrir'),
      p('Esperar ok de chequeo laboratorio', { ok: true }),
      p('Volver a llenarlos'),
      { tipo: 'tabla-llenado', modelo: 'a-barricas' },
      p('Rotular barriles. Colocar cinta azul o verde si son lotes orgánico o de Adrianna', { destaca: 'organico' }),
      p('Scanear barriles vaciados y llenados en Planilla Scaner Barricas'),
      dato('Registrar cantidad de barriles llenos:'),
      dato('Registrar cantidad de vasijas mermas:'),
      p('Tapar bien y pasar agua oxigenada por fuera. Enjuagar.'),
      p('Ordenar en box'),
      p('Lavar vasija utilizada.'),
      p('Juntar borras y tirar en tanque prensa.'),
    ],
  },
  {
    // Referencia: 0912 bajada a barriles 26295. El vino ya está en tanque: no
    // hay tabla de vaciado ni rótulo de vasija, el tanque va en la corrección y
    // en el llenado, y el destino es texto libre ("Barricas Pinot ...").
    id: 'tq-barricas',
    nombre: 'Trasiego fin FML de TQ a barricas',
    banda: ['TRASIEGO', 'FIN FML'],
    origen: 'tanque',
    bloques: [
      p('Buscar barriles de lotes solicitados, para degustación.', { ok: true }),
      p('Santizar bomba, cañerías, picos de llenado, visor T y cápsula de gas.'),
      p('Sanitizar vasija a utilizar. (técnico tiene que revisar)', { ok: true }),
      p('Sanitizar clapets antes de comenzar trasiego.'),
      p('Revisar apertura de tapas de vasija.'),
      p('Trasegar SEPARANDO DE BORRAS a tanque con nitrógeno o Argón en vena. Abrir antes para inertizar cañería.'),
      { tipo: 'ids' },
      p('Tomar muestra en tubo falcon y llevar a laboratorio CIW.'),
      p('Lavar barriles y vaporizar.'),
      p('De ser necesario, realizar las siguientes correcciones'),
      { tipo: 'tabla-correccion', vasija: 'origen' },
      p('Homogeneizar y llevar muestra a laboratorio para chequeo'),
      p('Preparar para volver a los mismos barriles/ o barriles según indicaciones'),
      p('Lavarlos con hidro agua caliente, luego enfriarlos con agua fría y dejar escurrir'),
      p('Esperar ok de chequeo laboratorio', { ok: true }),
      p('Volver a llenarlos'),
      { tipo: 'tabla-llenado', modelo: 'desde-tanque' },
      p('Rotular barriles. Colocar cinta azul o verde si son lotes orgánico o de Adrianna', { destaca: 'organico' }),
      p('Scanear barriles vaciados y llenados en Planilla Scaner Barricas'),
      dato('Registrar cantidad de barriles llenos:'),
      dato('Registrar cantidad de vasijas mermas:'),
      dato('MERMA: ______   Rellenar con:'),
      p('Tapar bien y pasar agua oxigenada por fuera. Enjuagar.'),
      p('Ordenar en box'),
      p('Lavar vasija utilizada.'),
      p('Juntar borras y tirar en tanque prensa.'),
    ],
  },
  {
    // Referencia: 0867 Corte Base HOFB. Varios lotes van a UN tanque y forman
    // un lote nuevo (el "lote del corte"): la banda, el ID, el rótulo y el
    // agregado son de ese lote, no de los de origen. La tabla va con una fila
    // por barril, y la orden es una sola hoja (sin planilla ni rótulos).
    id: 'barricas-tanque',
    nombre: 'Trasiego de barricas a tanque (corte)',
    banda: ['TRASIEGO'],
    origen: 'barriles',
    loteCorte: true,
    hojas: ['ot'],
    bloques: [
      p('Santizar bomba, cañerías, picos de llenado, visor T y cápsula de gas.'),
      p('Sanitizar vasija a utilizar. (técnico tiene que revisar)', { ok: true }),
      p('Sanitizar clapets antes de comenzar trasiego.'),
      p('Revisar apertura de tapas de vasija.'),
      p('Inertizar tanque destino hasta obtener menos de 20% de O2, técnico tiene que revisar'),
      dato('% final de O2:', { ok: true }),
      p('Trasegar CON BORRAS  a tanque con nitrógeno o Argón en vena. Abrir antes para inertizar cañería.'),
      { tipo: 'ids', de: 'corte' },
      { tipo: 'tabla-vaciado', columnas: ['lote', 'vasijas', 'litros', 'destino', 'merma'], porBarril: true },
      { tipo: 'rotular', de: 'corte' },
      p('Inertizar espacio de cabeza con Argón'),
      p('Tomar muestra en tubo falcon y llevar a laboratorio CIW.'),
      { tipo: 'tabla-correccion', modelo: 'agregado-corte' },
      p('Homogeneizar.'),
      p('Scanear barriles vaciados y llenados en Planilla Scaner Barricas'),
      p('Lavar y vaporizar barriles según protocolo'),
      p('Juntar borras'),
    ],
  },
  {
    // Referencia: 0837 (tanque a tanque).
    id: 'tq-tq',
    nombre: 'Trasiego de tq a tq',
    banda: ['TRASIEGO', 'SEPARANDO DE BORRAS'],
    origen: 'barriles',
    bloques: [
      p('Santizar bomba, cañerías, picos de llenado, visor T y cápsula de gas.'),
      p('Sanitizar vasija a utilizar. (técnico tiene que revisar)', { ok: true }),
      p('Sanitizar clapets antes de comenzar trasiego.'),
      p('Revisar apertura de tapas de vasija.'),
      p('Inertizar tanque destino hasta obtener menos de 20% de O2, técnico tiene que revisar'),
      dato('% final de O2:'),
      p('Trasegar SEPARANDO DE BORRAS a tanque con nitrógeno o Argón en vena. Abrir antes para inertizar cañería.'),
      { tipo: 'tabla-vaciado', columnas: ['lote', 'vasijas', 'litros', 'destino', 'merma'] },
      { tipo: 'rotular' },
      p('Inertizar espacio de cabeza con Argón'),
      p('Tomar muestra en tubo falcon y llevar a laboratorio CIW.'),
      p('Lavar y decolorar vasija vaciada'),
      { tipo: 'tabla-correccion' },
      p('Homogeneizar.'),
      p('De ser necesario, dar lleno con: Técnico tiene que degustar', { ok: true }),
    ],
  },
];

export function plantillaPorId(id){
  return PLANTILLAS_OT.find(pl => pl.id === id) || null;
}

export function origenTanque(id){
  const pl = plantillaPorId(id);
  return !!(pl && pl.origen === 'tanque');
}

// El corte pide el lote que se forma en el tanque: sus movimientos son
// traspasos a ese lote, y así el linaje sabe de qué lotes salió.
export function pideLoteCorte(id){
  const pl = plantillaPorId(id);
  return !!(pl && pl.loteCorte);
}

// Qué hojas se ofrecen al imprimir; sin `hojas`, las tres.
export const HOJAS_OT = ['ot', 'planilla', 'rotulos'];

export function hojasDePlantilla(id){
  const pl = plantillaPorId(id);
  return (pl && pl.hojas) || HOJAS_OT;
}

// Barrica estándar de la bodega: con ella se estima cuántas se llenan desde un
// tanque. Es una estimación para rótulos y planilla: se corrige en el formulario.
export const LITROS_BARRICA = 225;

export function barricasEstimadas(litros){
  const n = Number(litros);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n / LITROS_BARRICA) : null;
}
