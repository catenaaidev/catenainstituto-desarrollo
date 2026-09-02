/* ===== Lotes CIW — el papel compartido de las ordenes de trabajo =====
 *
 * Una sola implementacion del formulario RCI 08 para las dos ordenes: muestras
 * y correccion. Antes vivia dentro de vista-orden.js; se extrajo al sumar la
 * segunda orden, porque una segunda copia del encabezado, el paginado y las
 * firmas se desincroniza en el primer cambio de formulario de calidad.
 *
 * No sabe nada de lotes ni de dosis: recibe filas ya armadas y un renderizador
 * de fila. Todo lo que cambia entre las dos ordenes entra por cfg. */
'use strict';

import { esc, escA } from './nucleo.js';
import { armarPaginas } from './orden-filas.js';

/* 25 filas por hoja es lo que entra en una A4 con el encabezado de calidad y
 * el pie de firmas. Cambiarlo desborda la hoja al imprimir. */
export const HOJA_POR_PAGINA = 25;

/* Cabecera comun de cada hoja: empresa + codigo de calidad, igual en todas las
 * hojas y paginas (texto institucional, copiado literal de prensas-app: mismo
 * documento de calidad para ambas apps). */
export function hojaTop(){
  return `<div class="oh-top"><span class="oh-empresa">CATENA INSTITUTE</span>` +
    `<span>ORDEN DE TRABAJO - RCI 08 - Rev. 02 &nbsp;·&nbsp; Aprobado por: Roy Urvieta &nbsp;·&nbsp; Emisión: 28/01/2013</span></div>`;
}

/* Titulo editable de la hoja: un input, no un <h*>, para poder tipear encima.
 * data-tituloot marca los inputs a sincronizar cuando hay mas de una pagina. */
export function hojaTitulo(titulo){
  return `<input class="oh-titulo" data-tituloot value="${escA(titulo || '')}" title="Título editable (clic para cambiar)">`;
}

export function hojaMeta(meta){
  const m = meta || {};
  return `<div class="oh-meta"><span><b>Fecha:</b> ${esc(m.fechaTxt || '')}</span>` +
    `<span>${esc(m.anio || '')}</span>` +
    `<span><b>N° de Orden:</b> ${esc(m.nro || '')}</span></div>`;
}

export function hojaBanda(banda){
  const b = banda || [];
  return `<div class="oh-banda"><span>${esc(b[0] || '')}</span>` +
    `<span>${esc(b[1] || '')}</span><span>${esc(b[2] || '')}</span></div>`;
}

export function hojaPie(emitio, recibio){
  return `<div class="oh-pie"><div class="firma"><b>Emitió:</b> ${esc(emitio || '')} Firma:</div>` +
    `<div class="firma"><b>Recibió:</b> ${esc(recibio || '')} Firma:</div></div>`;
}

/* Devuelve el HTML completo de la vista de PAPEL: una hoja por pagina de datos
 * mas las hojas de cfg.hojasExtra al final. La numeracion de filas es GLOBAL y
 * continua entre hojas. */
export function pintarHojas(cfg){
  const c = cfg || {};
  const paginas = armarPaginas(c.filas || [], c.porPagina || HOJA_POR_PAGINA);
  let html = '';

  paginas.forEach((pagina, pg) => {
    const filas = pagina.map(c.renderFila).join('');
    html += `<div class="orden-hoja">` +
      hojaTop() +
      hojaTitulo(c.titulo) +
      hojaMeta(c.meta) +
      hojaBanda(c.banda) +
      (c.nota ? `<div class="oh-nota">${c.nota}</div>` : '') +
      `<table>${c.colgroup || ''}<thead>${c.thead || ''}</thead>` +
      `<tbody>${filas || `<tr><td colspan="${c.columnas || 1}" class="c" style="padding:18px">${esc(c.textoVacio || '')}</td></tr>`}</tbody></table>` +
      hojaPie(c.emitio, c.recibio) +
      `<div class="oh-hoja-num">Hoja ${pg + 1} de ${paginas.length}</div>` +
    `</div>`;
  });

  (c.hojasExtra || []).forEach(h => { html += h; });
  return html;
}
