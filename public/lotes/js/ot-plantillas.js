/* ===== Lotes CIW — plantillas de las OT de trasiego (datos puros) =====
 *
 * Cada plantilla es la lista ordenada de bloques de la hoja RCI 08 tal como
 * la arma la bodega en Excel. Los textos se copiaron de las órdenes reales
 * (0700, 0837, 0885 y 0898 de 'Ordenes de Trabajo 2026'): son las palabras que
 * el operario ya conoce, no hay que reescribirlas.
 *
 * Agregar una plantilla es agregar un objeto acá; ot-hojas.js sabe dibujar
 * todos los tipos de bloque de TIPOS_BLOQUE. */
'use strict';

export const TIPOS_BLOQUE = ['paso', 'dato', 'tabla-vaciado', 'rotular', 'tabla-correccion', 'tabla-llenado'];

export const COLS_VACIADO = {
  lote: 'CIW lote',
  vasijas: 'Vasija',
  litros: 'Litros',
  destino: 'Destino',
  caudalimetro: 'Litros caudalímetro',
  merma: 'Merma',
};

const p = (texto, extra) => ({ tipo: 'paso', texto, ...(extra || {}) });
const dato = (texto) => ({ tipo: 'dato', texto });

// Los cuatro pasos de sanitizado se repiten en todas las plantillas.
const SANITIZAR = [
  p('Santizar bomba, cañerías, picos de llenado, visor T y cápsula de gas.'),
  p('Sanitizar vasija a utilizar. (técnico tiene que revisar)', { ok: true }),
  p('Sanitizar clapets antes de comenzar trasiego.'),
  p('Revisar apertura de tapas de vasija.'),
];
const TRASEGAR = p('Trasegar SEPARANDO DE BORRAS a tanque con nitrógeno o Argón en vena. Abrir antes para inertizar cañería.');
const INERTIZAR_O2 = [
  p('Inertizar tanque destino hasta obtener menos de 20% de O2, técnico tiene que revisar'),
  dato('% final de O2:'),
];

// Barricas → barricas y TQ → barricas comparten el cuerpo: vaciar a un tanque
// pulmón, corregir, y volver a llenar barricas.
function cuerpoABarricas(extraMerma){
  return [
    p('Buscar barriles de lotes solicitados, para degustación.', { ok: true }),
    ...SANITIZAR,
    TRASEGAR,
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
    { tipo: 'tabla-llenado' },
    p('Rotular barriles. Colocar cinta azul o verde si son lotes orgánico o de Adrianna', { destaca: 'organico' }),
    p('Scanear barriles vaciados y llenados en Planilla Scaner Barricas'),
    dato('Registrar cantidad de barriles llenos:'),
    dato('Registrar cantidad de vasijas mermas:'),
    ...(extraMerma ? [dato('MERMA: ______   Rellenar con:')] : []),
    p('Tapar bien y pasar agua oxigenada por fuera. Enjuagar.'),
    p('Ordenar en box'),
    p('Lavar vasija utilizada.'),
    p('Juntar borras y tirar en tanque prensa.'),
  ];
}

export const PLANTILLAS_OT = [
  {
    id: 'barricas-barricas',
    nombre: 'Trasiego fin FML de barricas a barricas',
    banda: ['TRASIEGO', 'FIN FML'],
    bloques: cuerpoABarricas(false),
  },
  {
    id: 'tq-barricas',
    nombre: 'Trasiego fin FML de TQ a barricas',
    banda: ['TRASIEGO', 'FIN FML'],
    bloques: cuerpoABarricas(true),
  },
  {
    id: 'barricas-tanque',
    nombre: 'Trasiego de barricas a tanque (corte)',
    banda: ['TRASIEGO', 'CORTE A TANQUE'],
    bloques: [
      p('Buscar barriles seleccionados, estirar para que técnico los deguste'),
      ...SANITIZAR,
      p('USAR CAUDALÍMETRO Y REGISTRAR LITROS'),
      ...INERTIZAR_O2,
      TRASEGAR,
      { tipo: 'tabla-vaciado', columnas: ['lote', 'vasijas', 'litros', 'destino', 'caudalimetro', 'merma'] },
      { tipo: 'rotular' },
      p('Inertizar espacio de cabeza con Argón'),
      p('Tomar muestra en tubo falcon y llevar a laboratorio CIW.'),
      { tipo: 'tabla-correccion' },
      p('Homogeneizar.'),
      dato('Registrar SO2 final:'),
      dato('En caso de que quede mermo, rellenar con:'),
      dato('Chequear O2 final y registrar:'),
      p('Lavar y vaporizar barriles vaciados'),
      p('Lavar por fuera con agua oxigenada'),
      p('Scanear barriles vaciados y llenados y completar planilla de Scaner barricas'),
      dato('Anotar cantidad de barriles — Llenados: ______   Vaciados: ______   Mermos:'),
      p('Lavar vasija utilizada.'),
      p('Juntar borras y tirar en tanque de borras'),
    ],
  },
  {
    id: 'tq-tq',
    nombre: 'Trasiego de tq a tq',
    banda: ['TRASIEGO', 'SEPARANDO DE BORRAS'],
    bloques: [
      ...SANITIZAR,
      ...INERTIZAR_O2,
      TRASEGAR,
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
