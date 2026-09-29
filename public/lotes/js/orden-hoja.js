/* ===== Lotes CIW — el papel compartido de las ordenes de trabajo =====
 *
 * Una sola implementacion del formulario RCI 08 para las dos ordenes: muestras
 * y correccion. Antes vivia dentro de vista-orden.js; se extrajo al sumar la
 * segunda orden, porque una segunda copia del encabezado, el paginado y las
 * firmas se desincroniza en el primer cambio de formulario de calidad.
 *
 * No sabe nada de lotes ni de dosis: recibe filas ya armadas y un renderizador
 * de fila. Todo lo que cambia entre las dos ordenes entra por cfg (antesBanda
 * y despuesTabla son HTML opcional, los usa la orden de microbiologia).
 *
 * cfg.editable = la hoja es la vista previa editable de la Orden de muestras:
 * titulo, fecha, N° de orden y firmas salen como campos (hoja-campos.js). La
 * Orden de correccion no lo usa y sale igual que siempre.
 *
 * cfg.claseHoja = clase extra de cada hoja (p. ej. oh-compacta, 50 filas);
 * cfg.despuesTablaUltima = HTML que va solo bajo la tabla de la ULTIMA hoja;
 * cfg.alLadoTabla = HTML en una columna a la derecha de una tabla angosta. */
'use strict';

import { esc, escA } from './nucleo.js';
import { armarPaginas } from './orden-filas.js';
import { campoHoja } from './hoja-campos.js';

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

/* Cada parte de la banda es texto, o {campo, valor, ph} para editarla sobre
 * la hoja (ver hoja-campos.js). */
export function hojaBanda(banda){
  const b = banda || [];
  const parte = x => (x && typeof x === 'object')
    ? campoHoja(x.campo, x.valor, { ph: x.ph || '', cls: 'oh-campo-banda' })
    : esc(x || '');
  return `<div class="oh-banda"><span>${parte(b[0])}</span>` +
    `<span>${parte(b[1])}</span><span>${parte(b[2])}</span></div>`;
}

/* Variantes editables (vista previa de la Orden de muestras): mismos datos,
 * pero como campos data-campo. meta = {fecha: 'YYYY-MM-DD', anio, nro}. */
export function hojaMetaEditable(meta){
  const m = meta || {};
  return `<div class="oh-meta"><span><b>Fecha:</b> ${campoHoja('fecha', m.fecha, { tipo: 'date', cls: 'oh-campo-fecha' })}</span>` +
    `<span data-anio>${esc(m.anio || '')}</span>` +
    `<span><b>N° de Orden:</b> ${campoHoja('nro', m.nro, { cls: 'oh-campo-nro', ph: '—' })}</span></div>`;
}

export function hojaPieEditable(emitio, recibio){
  return `<div class="oh-pie"><div class="firma"><b>Emitió:</b> ${campoHoja('emitio', emitio, { cls: 'oh-campo-firma', ph: 'nombre' })} Firma:</div>` +
    `<div class="firma"><b>Recibió:</b> ${campoHoja('recibio', recibio, { cls: 'oh-campo-firma', ph: 'nombre' })} Firma:</div></div>`;
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
    const ultima = pg === paginas.length - 1;
    html += `<div class="orden-hoja${c.claseHoja ? ' ' + c.claseHoja : ''}">` +
      hojaTop() +
      (c.editable ? campoHoja('titulo', c.titulo, { cls: 'oh-titulo' }) : hojaTitulo(c.titulo)) +
      (c.editable ? hojaMetaEditable(c.meta) : hojaMeta(c.meta)) +
      (c.antesBanda || '') +
      hojaBanda(c.banda) +
      (c.nota ? `<div class="oh-nota">${c.nota}</div>` : '') +
      (c.alLadoTabla ? '<div class="oh-tabla-lado"><div>' : '') +
      `<table${c.claseTabla ? ` class="${c.claseTabla}"` : ''}>${c.colgroup || ''}<thead>${c.thead || ''}</thead>` +
      `<tbody>${filas || `<tr><td colspan="${c.columnas || 1}" class="c" style="padding:18px">${esc(c.textoVacio || '')}</td></tr>`}</tbody></table>` +
      (ultima && c.despuesTablaUltima ? c.despuesTablaUltima : '') +
      (c.alLadoTabla ? `</div><div class="oh-lado">${c.alLadoTabla}</div></div>` : '') +
      (c.despuesTabla || '') +
      (c.editable ? hojaPieEditable(c.emitio, c.recibio) : hojaPie(c.emitio, c.recibio)) +
      `<div class="oh-hoja-num">Hoja ${pg + 1} de ${paginas.length}</div>` +
    `</div>`;
  });

  (c.hojasExtra || []).forEach(h => { html += h; });
  return html;
}
