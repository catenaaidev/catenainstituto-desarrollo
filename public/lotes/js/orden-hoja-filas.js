/* ===== Lotes CIW — filas de la Orden de muestras editadas SOBRE la hoja =====
 *
 * La Orden de muestras ya no tiene grilla: la hoja de papel es la pantalla.
 * Cada celda editable de una fila es un <input class="oh-celda"> con
 * data-fila (indice en _otRows) y data-col (clave del dato); vista-orden.js
 * escucha esos inputs. El ✕ de cada fila y el "＋ Agregar fila" viven en la
 * hoja pero no se imprimen.
 *
 * 50 filas por hoja (pedido de la bodega): la hoja va en modo compacto
 * (.oh-compacta), con filas bajas para que entren en una A4.
 *
 * Modulo puro (sin nucleo.js) para poder testearlo en node. */
'use strict';

const esc  = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escA = v => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export const FILAS_POR_HOJA_ORDEN = 50;

/* Celda editable de la fila i. lista = id de un <datalist> de sugerencias. */
export function celdaHoja(i, col, valor, { cls = '', lista = '', ph = '', titulo = '' } = {}){
  return `<input class="oh-celda${cls ? ' ' + cls : ''}" data-fila="${i}" data-col="${escA(col)}"` +
    `${lista ? ` list="${escA(lista)}"` : ''}${ph ? ` placeholder="${escA(ph)}"` : ''}` +
    `${titulo ? ` title="${escA(titulo)}"` : ''} value="${escA(valor)}">`;
}

/* Celda del numero de fila, con el ✕ para quitarla (no se imprime). */
export function celdaNumero(i, numero){
  return `<td class="c oh-num">${numero}` +
    `<button type="button" class="oh-quitar" data-quitar="${i}" title="Quitar esta fila" aria-label="Quitar fila ${numero}">✕</button></td>`;
}

/* Celda del lote: roja si el numero no existe. */
export function celdaLote(i, r){
  return celdaHoja(i, 'lote', r.lote, {
    cls: 'c' + (r.noEncontrado ? ' oh-noexiste' : ''),
    ph: 'lote',
    titulo: r.noEncontrado ? 'No hay ningún lote con ese número' : '',
  });
}

/* Boton de agregar fila, al pie de la tabla de la ultima hoja. */
export const BOTON_AGREGAR = '<button type="button" class="oh-agregar">＋ Agregar fila</button>';

/* Configuracion para pintarHojas (orden-hoja.js) de la orden de ANALISIS.
 * El papel lleva # / Lote / Variedad / Vasija / [Barril] / Cant. / Recipiente /
 * Check. BARRIL entra solo si alguna fila tiene barril (el dado o a mano): una
 * columna vacia en todas las hojas es ruido. */
export function cfgHojasAnalisis({ filas, titulo, meta, banda, emitio, recibio, hojasExtra, listaRecipientes = '' }){
  const f = filas || [];
  const conBarril = f.some(r => String(r.barril || '').trim() !== '');
  return {
    filas: f,
    porPagina: FILAS_POR_HOJA_ORDEN,
    claseHoja: 'oh-compacta',
    editable: true,
    titulo, meta, banda, emitio, recibio,
    nota: 'Tomar muestra en un tubo falcon y luego sanitizar jeringa para cada lote.',
    colgroup: `<colgroup><col style="width:34px"><col style="width:60px"><col><col style="width:140px">${conBarril ? '<col style="width:60px">' : ''}<col style="width:46px"><col style="width:110px"><col style="width:50px"></colgroup>`,
    thead: `<tr><th class="c oh-num">#</th><th class="c">LOTE</th><th>VARIEDAD</th><th>VASIJA</th>${conBarril ? '<th class="c">BARRIL</th>' : ''}<th class="c">Cant.</th><th>Recipiente</th><th class="oh-check">Check</th></tr>`,
    columnas: conBarril ? 8 : 7,
    textoVacio: 'Sin lotes. Elegí qué lotes entran, pegalos en «Pegar lotes» o agregá una fila.',
    despuesTablaUltima: BOTON_AGREGAR,
    renderFila: ({ numero, fila: r }) => {
      const i = numero - 1;
      return `<tr>` +
        celdaNumero(i, numero) +
        `<td class="c">${celdaLote(i, r)}</td>` +
        `<td>${esc(r.variedad)}</td>` +
        `<td>${celdaHoja(i, 'vasija', r.vasija)}</td>` +
        (conBarril ? `<td class="c">${celdaHoja(i, 'barril', r.barril || '', { cls: 'c' })}</td>` : '') +
        `<td class="c">${celdaHoja(i, 'cantidad', String(r.cantidad ?? ''), { cls: 'c' })}</td>` +
        `<td>${celdaHoja(i, 'recipiente', r.recipiente || '', { lista: listaRecipientes })}</td>` +
        `<td class="oh-check"></td>` +
      `</tr>`;
    },
    hojasExtra: hojasExtra || [],
  };
}

/* Pegar una columna de lotes en la celda de la fila i: el primero va en esa
 * fila y los demas en las siguientes, creando filas con nueva() si faltan
 * (como pegar en Excel). Devuelve { filas, tocadas } (indices modificados);
 * no muta el array recibido. */
export function pegarLotesDesde(filas, i, lotes, nueva){
  const out = filas.slice();
  const tocadas = [];
  lotes.forEach((lote, k) => {
    const j = i + k;
    if (j >= out.length) out.push(nueva());
    out[j] = { ...out[j], lote, manual: true };
    tocadas.push(j);
  });
  return { filas: out, tocadas };
}

/* Cantidad escrita a mano: entero >= 1, o null si no sirve. */
export function cantidadValida(texto){
  const n = parseFloat(String(texto ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : null;
}
