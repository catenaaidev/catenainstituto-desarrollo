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

import { campoHoja } from './hoja-campos.js';

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

/* Campos del cartel de la caja (hoja 2), en orden. */
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

/* Configuracion para pintarHojas (orden-hoja.js): mismo encabezado RCI 08,
 * paginado y firmas que la orden de analisis; cambian las columnas y los
 * textos. La hoja es la vista previa editable: instrucciones, banda, dia,
 * subtitulo, indicaciones y el cartel son campos data-campo (hoja-campos.js).
 * hojasExtra (mapas, etc.) se suman DESPUES del cartel. */
export function cfgHojasMicro({ filas, textos, titulo, meta, dia, emitio, recibio, porPagina, hojasExtra }){
  const t = textosMicro(textos);
  return {
    filas: filas || [],
    porPagina,
    editable: true,
    titulo, meta, emitio, recibio,
    banda: [{ campo: 'banda', valor: t.banda, ph: 'Banda' }, { campo: 'dia', valor: dia || '', ph: 'día' }, ''],
    antesBanda: campoHoja('instrucciones', t.instrucciones, { tipo: 'area', cls: 'oh-instr', ph: 'Instrucciones (opcional)' }),
    nota: campoHoja('subtitulo', t.subtitulo, { cls: 'oh-campo-sub', ph: 'Recipiente (opcional)' }),
    despuesTabla: campoHoja('cierre', t.cierre, { tipo: 'area', cls: 'oh-instr oh-instr-fin', ph: 'Indicaciones (opcional)' }),
    /* Columnas justas, como en el Excel: la tabla no se estira a todo el
     * ancho de la hoja (la Vasija quedaba con medio renglon vacio). */
    claseTabla: 'oh-tabla-justa',
    colgroup: '<colgroup><col style="width:36px"><col style="width:60px"><col style="width:84px"><col style="width:220px"></colgroup>',
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
 * tampoco): es un rotulo, se lee de lejos. Cada valor se edita sobre la hoja. */
export function hojaCartel(textos){
  const t = textosMicro(textos);
  const filas = CAMPOS_CARTEL.map(c =>
    `<tr><th>${esc(c.l)}</th><td>${campoHoja(c.k, t[c.k], { cls: 'oh-campo-cartel' })}</td></tr>`).join('');
  return `<div class="orden-hoja oh-cartel"><table>${filas}</table></div>`;
}
