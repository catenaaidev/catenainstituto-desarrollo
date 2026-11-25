/* ===== Lotes CIW — "de donde salen estas filas" (Orden de muestras) =====
 *
 * Una linea arriba de la hoja que dice cuantos lotes hay y por que estan ahi:
 * la fuente elegida en "Incluir", los agregados a mano, los filtros y el
 * buscador. Antes las filas aparecian solas al entrar a la pestana y no se
 * sabia de donde venian. Modulo puro para poder testearlo en node. */
'use strict';

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/* filas = _otRows; fuente = valor de "Incluir" ('hoja_en_blanco' = sin
 * fuente); etiquetaFuente = su texto; filtros = nombres de los filtros con
 * algo elegido. Devuelve { titulo, detalle }. */
export function resumenOrden({ filas, fuente, etiquetaFuente = '', filtros = [], busqueda = '' }){
  const conLote = (filas || []).filter(r => String(r.lote ?? '').trim() !== '');
  if (!conLote.length)
    return { titulo: 'Orden vacía', detalle: 'pegá lotes, tipealos en la hoja o elegí qué lotes entran' };

  /* Con barriles especificos un lote ocupa varias filas: se cuentan lotes
   * distintos, y los barriles aparte. */
  const lotes = new Set(conLote.map(r => String(r.lote).trim()));
  const manuales = new Set(conLote.filter(r => r.manual).map(r => String(r.lote).trim())).size;
  const otros = lotes.size - manuales;
  const barriles = conLote.filter(r => String(r.barril ?? '').trim() !== '').length;
  const partes = [];
  if (fuente === 'hoja_en_blanco'){
    if (manuales) partes.push(plural(manuales, 'cargado a mano', 'cargados a mano'));
    if (otros) partes.push(plural(otros, 'elegido con los filtros', 'elegidos con los filtros'));
  } else {
    if (etiquetaFuente) partes.push(`salen de «${etiquetaFuente}»`);
    if (manuales) partes.push(plural(manuales, 'agregado a mano', 'agregados a mano'));
  }
  if (filtros.length) partes.push('filtrado por ' + filtros.join(', '));
  const b = String(busqueda || '').trim();
  if (b) partes.push(`buscando «${b}»`);

  const titulo = plural(lotes.size, 'lote en la orden', 'lotes en la orden') +
    (barriles ? ' · ' + plural(barriles, 'barril', 'barriles') : '');
  return { titulo, detalle: partes.join(' · ') };
}
