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
 * `creaLote: true` = ese lote no existe todavía: la OT se arma con un asistente
 * paso a paso que lo crea junto con la orden (vista-ot-corte.js).
 * `achique: true` = despues del corte, el pulmon se reparte en vasijas
 * definitivas, cada una con su lote (ot-achique.js).
 * `salida: true` = el vino se va de la bodega (Traslado): cada lote es un
 * movimiento `salida` hacia `ot.destino` (la bodega destino) y al confirmar
 * solo se vacían sus vasijas, no se llena nada.
 * `sinMovimientos: true` = la OT no mueve vino (Muestras, 0993): no crea
 * movimientos, su tabla vive en ot.muestras (ot-muestras.js) y confirmarla
 * solo la marca ejecutada.
 * `hojas` = las hojas que se ofrecen al imprimir (sin él, las tres). */
'use strict';

export const TIPOS_BLOQUE = ['paso', 'dato', 'ids', 'tabla-vaciado', 'rotular', 'tabla-correccion', 'tabla-llenado', 'tabla-achique', 'tabla-muestras'];

export const COLS_VACIADO = {
  lote: 'CIW lote',
  vasijas: 'Vasija',
  litros: 'Litros',
  destino: 'Destino',
  caudalimetro: 'Litros caudalímetro',
  merma: 'Merma',
  // Traslado (0957): las anota el operario al cargar cada cisterna.
  medida: 'Medida',
  o2: 'O2 mg/L Final',
  temp: 'Temp. °C',
};

// Modelos de la tabla de vaciado (ver tablaVaciado en ot-hojas.js).
export const MODELOS_VACIADO = ['traslado'];

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
    // Misma hoja que la 0867, pero el vino sigue siendo del mismo lote: el ID,
    // el rótulo y la corrección son de los lotes de origen, y los movimientos
    // son trasiegos comunes (no hay lote del corte).
    id: 'barrica-tanque',
    nombre: 'Trasiego de barrica a tanque',
    banda: ['TRASIEGO'],
    origen: 'barriles',
    hojas: ['ot'],
    bloques: [
      p('Santizar bomba, cañerías, picos de llenado, visor T y cápsula de gas.'),
      p('Sanitizar vasija a utilizar. (técnico tiene que revisar)', { ok: true }),
      p('Sanitizar clapets antes de comenzar trasiego.'),
      p('Revisar apertura de tapas de vasija.'),
      p('Inertizar tanque destino hasta obtener menos de 20% de O2, técnico tiene que revisar'),
      dato('% final de O2:', { ok: true }),
      p('Trasegar CON BORRAS  a tanque con nitrógeno o Argón en vena. Abrir antes para inertizar cañería.'),
      { tipo: 'ids' },
      { tipo: 'tabla-vaciado', columnas: ['lote', 'vasijas', 'litros', 'destino', 'merma'], porBarril: true },
      { tipo: 'rotular' },
      p('Inertizar espacio de cabeza con Argón'),
      p('Tomar muestra en tubo falcon y llevar a laboratorio CIW.'),
      { tipo: 'tabla-correccion' },
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
  {
    // Referencia: 0867 Corte Base HOFB. Varios lotes van a UN tanque y forman
    // un lote nuevo (el "lote del corte"): la banda, el ID, el rótulo y el
    // agregado son de ese lote, no de los de origen. La tabla va con una fila
    // por barril, y la orden es una sola hoja (sin planilla ni rótulos).
    // El lote del corte se crea al emitir la OT (asistente de vista-ot-corte.js).
    // Conserva el id 'barricas-tanque' de cuando se llamaba "Trasiego de
    // barricas a tanque (corte)": las OT ya emitidas lo tienen guardado.
    id: 'barricas-tanque',
    nombre: 'Corte',
    banda: ['TRASIEGO'],
    origen: 'barriles',
    loteCorte: true,
    creaLote: true,
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
    // Referencia: 0943 Corte PN Grand Mere. Es el Corte (0867) al tanque
    // pulmon y, en la misma orden, el reparto del pulmon a sus vasijas
    // definitivas (tanques, barricas, T50): cada una es un lote, el primer
    // tanque con el numero del corte (ot-achique.js). Se arma con el mismo
    // asistente del Corte (vista-ot-corte.js), con un paso mas.
    id: 'corte-achique',
    nombre: 'Corte + achique',
    banda: ['TRASIEGO'],
    origen: 'barriles',
    loteCorte: true,
    creaLote: true,
    achique: true,
    bloques: [
      p('Buscar barriles seleccionados, estirar para que técnico los deguste', { ok: true }),
      p('Santizar bomba, cañerías, picos de llenado, visor T y cápsula de gas.'),
      p('Sanitizar vasija a utilizar. (técnico tiene que revisar)', { ok: true }),
      p('Sanitizar clapets antes de comenzar trasiego.'),
      p('Revisar apertura de tapas de vasija.'),
      p('USAR CAUDALÍMETRO Y REGISTRAR LITROS'),
      p('Inertizar tanque destino hasta obtener menos de 20% de O2, técnico tiene que revisar'),
      dato('% final de O2:', { ok: true }),
      p('Trasegar SIN BORRAS a tanque con nitrógeno o Argón en vena. Abrir antes para inertizar cañería.'),
      { tipo: 'ids', de: 'corte' },
      { tipo: 'tabla-vaciado', columnas: ['lote', 'vasijas', 'litros', 'destino', 'merma'], porBarril: true },
      { tipo: 'rotular', de: 'corte' },
      p('Inertizar espacio de cabeza con Argón'),
      p('Tomar muestra en tubo falcon y llevar a laboratorio CIW.'),
      { tipo: 'tabla-correccion', modelo: 'agregado-corte' },
      p('Homogeneizar.'),
      dato('Registrar SO2 Final'),
      p('Preparar pare reubicar'),
      p('Inertizar tanque destino hasta obtener menos de 20% de O2, técnico tiene que revisar'),
      { tipo: 'tabla-achique' },
      { tipo: 'rotular', de: 'achique' },
      p('Inertizar espacio de cabeza con Argón'),
      p('En caso de que quede mermo:'),
      dato('Rellenar con :          (Oriana tiene que degustar)'),
      dato('Chequear O2 final y registrar'),
      p('Lavar y vaporizar barriles vaciados. SEPARAR BARRILES DE 2020 PARA AÑOS ATRÁS'),
      p('Lavar por fuera con agua oxigenada'),
      p('Scanear barriles vaciados y llenados y completar planilla de Scaner barricas'),
      dato('Anotar cantidad de barriles:   LLENADOS ______   VACIADOS ______   MERMOS'),
      p('Lavar vasija utilizada.'),
      p('Juntar borras y tirar en tanque de borras'),
    ],
  },
  {
    // Referencia: 0957 Traslado CS a VF. El vino sale de la bodega en camión
    // (chasis y acoplado): una fila por vasija y el Destino de cada fila es la
    // cisterna, que se escribe sobre la hoja. Al confirmar es una salida.
    id: 'traslado',
    nombre: 'Traslado',
    banda: ['TRASLADO'],
    origen: 'barriles',
    salida: true,
    hojas: ['ot'],
    bloques: [
      p('Santizar bomba, cañerías, válvulas, visor T y cápsula de gas.'),
      p('Sanitizar cisternas a utilizar. (técnico tiene que revisar)', { ok: true }),
      p('Sanitizar clapets antes de comenzar trasiego.'),
      p('Gasear cisterna hasta tener un valor menos al 20% de O2 y registrar'),
      p('Revisar apertura de tapas de vasija.'),
      p('Medir con caudalimetro cada movimiento y registrar'),
      p('Medir el O2 disuelto en el vino al finalizar llenado de cisternas y registrar'),
      p('Ir trasegando VASIJAS COMPLETAS, HASTA VACIAR y dando lleno según indicaciones.'),
      p('Trasegar con nitrógeno o Argón en vena. Abrir antes para inertizar cañería.'),
      { tipo: 'ids' },
      dato('Camión:  Chasis y acoplado'),
      { tipo: 'tabla-vaciado', modelo: 'traslado',
        columnas: ['lote', 'vasijas', 'litros', 'caudalimetro', 'destino', 'medida', 'o2', 'temp'] },
      p('Analizar completo antes de trasladar, de ser necesario corregir SO2 35 ppm'),
      { tipo: 'rotular' },
      p('Gasear merma hasta tener un valor menos al 20% de O2 y registrar'),
      p('Tomar 2 muestras: 1x120 + 1x 750 ml de cada cisterna, colocarle sticker y 1 entregar a chofer las de 750ml'),
      p('Lavar vasija utilizada.'),
      p('Juntar borras y tirar en tanque prensa.'),
      p('Registrar pesos de camión:'),
      dato('BRUTO ____________   TARA ____________   NETO'),
    ],
  },
  {
    // Referencia: 0993 Muestras Ensayos Nico Torti. No se mueve vino: se
    // buscan muestras de lotes y vasijas. La tabla es ot.muestras y se edita
    // sobre la hoja (filas que se agregan y quitan).
    id: 'muestras-ot',
    nombre: 'Muestras',
    banda: ['MUESTRAS'],
    origen: 'ninguno',
    sinMovimientos: true,
    hojas: ['ot'],
    bloques: [
      p('Buscar las siguientes muestras y armar cortes según indicaciones'),
      p('IR DESINFECTANDO MANGUERITA ENTRE MUESTRA Y MUESTRA'),
      { tipo: 'tabla-muestras' },
      p('AL finalizar gasear TODOS LOS T50 ANTES DE CERRAR'),
      p('Analizar los cortes y de ser necesario corregir a 35 ppm'),
      p('Enviar por mail a Nico Torti datos analizados'),
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

// El vino se va de la bodega (Traslado): los movimientos son salidas.
export function esSalida(id){
  const pl = plantillaPorId(id);
  return !!(pl && pl.salida);
}

// La OT no mueve vino (Muestras): ni movimientos ni confirmacion con litros.
export function sinMovimientos(id){
  const pl = plantillaPorId(id);
  return !!(pl && pl.sinMovimientos);
}

// El Corte crea su lote al emitir: se arma con el asistente, no con el formulario.
export function creaLote(id){
  const pl = plantillaPorId(id);
  return !!(pl && pl.creaLote);
}

// Qué hojas se ofrecen al imprimir; sin `hojas`, las tres.
export const HOJAS_OT = ['ot', 'planilla', 'rotulos'];

/* Qué hojas se ofrecen al imprimir; sin `hojas`, las tres. Un Corte + achique
 * imprime planilla y rótulos solo si el vino termina en barricas o T50. */
export function hojasDePlantilla(id, ot){
  const pl = plantillaPorId(id);
  if (pl && pl.achique){
    const ds = (ot && ot.achique && ot.achique.destinos) || [];
    return ds.some(d => d && d.tipo === 'chicas') ? HOJAS_OT : ['ot'];
  }
  return (pl && pl.hojas) || HOJAS_OT;
}

// Barrica estándar de la bodega: con ella se estima cuántas se llenan desde un
// tanque. Es una estimación para rótulos y planilla: se corrige en el formulario.
export const LITROS_BARRICA = 225;

// T50 de la bodega: 50 L. Con las barricas, estima los litros de las vasijas
// chicas de un achique (ot-achique.js).
export const LITROS_T50 = 50;

export function barricasEstimadas(litros){
  const n = Number(litros);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n / LITROS_BARRICA) : null;
}
