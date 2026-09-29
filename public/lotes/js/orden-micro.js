/* ===== Lotes CIW — Orden de muestras de MICROBIOLOGIA =====
 *
 * La segunda variante de la pestana Orden de muestras: el formato de las OT de
 * microbiologia de Roy (referencia: "Ordenes de Trabajo 2026\0868
 * Microbiologia.xlsx", hojas "OT" y "Cartel Caja"). La hoja lleva solo
 * # / Check / Lote / Vasija, con instrucciones arriba y abajo, y se imprime con
 * una segunda hoja: el cartel que va pegado en la caja de las muestras.
 *
 * Todos los textos son editables y se recuerdan por navegador (localStorage,
 * lo maneja vista-orden.js): la orden es efimera y no vive en DATOS.
 *
 * Modulo puro a proposito (no importa nucleo.js, que toca window al cargar):
 * asi se testea en node. */
'use strict';

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Valores del Excel 0868, literales. Cambiar un default no pisa lo que cada
 * navegador ya tenga guardado. */
export const TEXTOS_MICRO_DEF = Object.freeze({
  instrucciones: 'Tomar muestras según protocolo adjunto\n' +
                 'EN PILETAS TOMAR MUESTRA POR ARRIBA COMO SI FUERA UNA BARRICA Y NO POR SACAMUESTRAS',
  banda:         'Microbiología VF',
  subtitulo:     'Microbiología: Bolsas estériles 200 ml',
  cierre:        'Colocarle cartel adjunto\nEntregarlas a Pineda',
  de:            'Oriana - CIW',
  retira:        'Martín Pineda',
  para:          'Microbiología',
  destino:       'Vista Flores',
  nota:          'Entregar a Julieta',
});

/* Campos del panel de edicion, en el orden en que se muestran: la pantalla los
 * pone en una grilla de 2x2 (los dos textos largos arriba, las dos lineas
 * cortas abajo). `largo` = se edita en un textarea (una instruccion por
 * renglon). */
export const CAMPOS_ORDEN_MICRO = [
  { k: 'instrucciones', l: 'Instrucciones (arriba de la tabla)', largo: true },
  { k: 'cierre',        l: 'Indicaciones (abajo de la tabla)', largo: true },
  { k: 'banda',         l: 'Banda' },
  { k: 'subtitulo',     l: 'Recipiente / subtítulo' },
];
export const CAMPOS_CARTEL = [
  { k: 'de',      l: 'De:' },
  { k: 'retira',  l: 'Retira en Agrelo:' },
  { k: 'para',    l: 'Para:' },
  { k: 'destino', l: 'Destino:' },
  { k: 'nota',    l: 'Nota:' },
];

/* Textos vigentes: los defaults pisados por lo guardado. Solo se toman las
 * claves conocidas y con valor string; basura o JSON viejo no rompe nada.
 * Un campo guardado VACIO vale: el usuario lo borro a proposito. */
export function textosMicro(guardado){
  const out = { ...TEXTOS_MICRO_DEF };
  if (guardado && typeof guardado === 'object'){
    for (const k of Object.keys(TEXTOS_MICRO_DEF)){
      if (typeof guardado[k] === 'string') out[k] = guardado[k];
    }
  }
  return out;
}

/* Texto multilinea -> un <div> por renglon no vacio. */
export function renglones(texto){
  return String(texto ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    .map(s => `<div>${esc(s)}</div>`).join('');
}

/* Configuracion para pintarHojas (orden-hoja.js): mismo encabezado RCI 08,
 * paginado y firmas que la orden de analisis; cambian las columnas y los
 * textos. hojasExtra (mapas, etc.) se suman DESPUES del cartel. */
export function cfgHojasMicro({ filas, textos, titulo, meta, dia, emitio, recibio, porPagina, hojasExtra }){
  const t = textosMicro(textos);
  const instr = renglones(t.instrucciones);
  const cierre = renglones(t.cierre);
  return {
    filas: filas || [],
    porPagina,
    titulo, meta, emitio, recibio,
    banda: [t.banda, dia || '', ''],
    antesBanda: instr ? `<div class="oh-instr">${instr}</div>` : '',
    nota: t.subtitulo.trim() ? `<b>${esc(t.subtitulo.trim())}</b>` : '',
    despuesTabla: cierre ? `<div class="oh-instr oh-instr-fin">${cierre}</div>` : '',
    colgroup: '<colgroup><col style="width:34px"><col style="width:56px"><col style="width:90px"><col></colgroup>',
    thead: '<tr><th class="c oh-num">#</th><th class="oh-check">Check</th><th class="c">Lote</th><th>Vasija</th></tr>',
    columnas: 4,
    textoVacio: 'Sin lotes. Cargalos con «Pegar lotes», el filtro Lote o «Agregar fila».',
    renderFila: ({ numero, fila: r }) =>
      `<tr><td class="c oh-num">${numero}</td><td class="oh-check"></td>` +
      `<td class="c">${esc(r.lote)}</td><td>${esc(r.vasija)}</td></tr>`,
    hojasExtra: [hojaCartel(t), ...(hojasExtra || [])],
  };
}

/* Hoja 2: el cartel de la caja. Sin encabezado de calidad (en el Excel
 * tampoco): es un rotulo, se lee de lejos. */
export function hojaCartel(textos){
  const t = textosMicro(textos);
  const filas = CAMPOS_CARTEL.map(c =>
    `<tr><th>${esc(c.l)}</th><td>${esc(t[c.k])}</td></tr>`).join('');
  return `<div class="orden-hoja oh-cartel"><table>${filas}</table></div>`;
}
