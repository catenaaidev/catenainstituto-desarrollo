/* ===== Lotes CIW — el papel de la Orden de correccion de SO2 =====
 *
 * Modulo puro (sin DOM, sin nucleo.js) para poder testearlo. Sigue el formato
 * de la orden en Excel de bodega (B219 Correccion SO2.xlsx): el operario solo
 * necesita el lote, el año, el numero de barril y cuanto agregar. pH, SO2,
 * objetivo, molecular, capacidad, estado, litros y los avisos del mapa quedan
 * en la tabla de pantalla, que es donde se decide la orden; al papel no van. */
'use strict';

import { esT50, NOMBRE_T50 } from './envases.js';

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (v, dec) => (v != null && Number.isFinite(v)) ? Number(v).toFixed(dec) : '—';

/** Año de cosecha de un lote, sacado de su numero: los dos primeros digitos
 *  son el año (25009 -> 2025, 26014 -> 2026). Es como lo escribe la B219.
 *  Devuelve '' si el lote no empieza con dos digitos: mejor un casillero vacio
 *  que un año inventado. */
export function anioDeLote(lote){
  const m = /^\s*(\d{2})\d/.exec(String(lote ?? ''));
  return m ? '20' + m[1] : '';
}

/* Instrucciones de la solucion, copiadas de la B219: el texto con que arranca
 * el campo de instrucciones de la hoja, que se puede editar encima. Solo
 * tienen sentido si se dosifica con la solucion d1030: con MBK en polvo no hay
 * densidad que medir, asi que con MBK el campo arranca vacio. */
export const INSTRUCCIONES_SOLUCION =
  'Chequear valor de solución con DMA.\n' +
  'En caso que sea menor a 1,028, concentrar.\n' +
  'En caso que sea mayor a 1,032, diluir.\n' +
  'Homogeneizar.\n' +
  'Densidad: ____________';

/** Como se expresa la dosis en cada unidad. Un solo lugar decide el numero,
 *  los decimales y la etiqueta, para que papel, pantalla, chip y el papel de
 *  una orden guardada (vista-ordenes-correccion.js) no puedan discrepar. */
export const OC_UNIDAD = {
  mbk: { col: 'MBK (g)',  prod: 'MBK',     dec: 2, de: d => d.mbk_g,       total: f => f.mbk_total_g,
         suf: 'g',  nota: 'Agregar el MBK indicado en cada barrica.',
         chip: g => (g / 1000).toFixed(3) + ' kg de MBK' },
  sol: { col: 'mL sol.',  prod: 'Sol1030', dec: 1, de: d => d.ml_solucion, total: f => f.ml_total,
         suf: 'mL', nota: 'Agregar los mL de solución indicados en cada barrica.',
         chip: ml => (ml / 1000).toFixed(2) + ' L de solución d1030' },
};

export const COLUMNAS_PAPEL = 5;

export const COLGROUP_PAPEL =
  '<colgroup><col style="width:34px"><col style="width:110px"><col style="width:90px"><col style="width:120px"><col style="width:60px"></colgroup>';

/** Encabezado de la tabla. u = config de la unidad (col = titulo de la dosis).
 *  PRODUCTO va antes de la dosis, como en la B219 ("P - MBK - Sol1030"). */
export function theadPapel(u){
  return '<tr><th class="c oh-num">#</th><th class="c">BARRIL</th><th class="c">PRODUCTO</th>' +
         '<th class="c">' + esc(u.col) + '</th><th class="oh-check">Check</th></tr>';
}

/** Una fila del papel: separador de lote (lote · año) o barril.
 *  u = config de la unidad vigente ({prod, dec, de(dosis)}). El total del lote
 *  no va: el operario agrega barril por barril, y un total al lado de las
 *  dosis se confunde con una dosis mas. */
export function filaPapel({ numero, fila }, u){
  if (fila.tipo === 'lote'){
    const lote = fila.lote.lote;
    const anio = anioDeLote(lote);
    return '<tr class="oc-sep">' +
      '<td class="c oh-num"></td>' +
      '<td colspan="4"><b>' + esc(lote) + '</b>' + (anio ? ' · ' + anio : '') + '</td></tr>';
  }
  return '<tr>' +
    '<td class="c oh-num">' + numero + '</td>' +
    '<td class="c">' + esc(fila.barrica.num || '—') + '</td>' +
    '<td class="c">' + esc(u.prod) + '</td>' +
    '<td class="c"><b>' + fmt(u.de(fila.dosis), u.dec) + '</b></td>' +
    '<td class="oh-check"></td>' +
  '</tr>';
}

/* ===== Papel "por lote" =====
 * La otra forma de la misma orden: en vez de un renglon por barril, un renglon
 * por cada tipo de vasija del lote con la dosis que lleva CADA una
 * ("26001 · 10 barricas de 225 L · 50 mL por vasija"). Sirve cuando el operario
 * no necesita el numero de barril porque todas las del lote llevan lo mismo.
 *
 * Las barricas se juntan solo si llevan la MISMA dosis tal como se imprime: un
 * lote con barricas de 225 y de 50 L, o con una a medio llenar, sale en dos
 * renglones. Una vasija sin barril (tanque grande, sin ubicar) va sola. */

export const COLUMNAS_PAPEL_LOTE = 6;

/* VASIJAS a 280 px: con 190 "1 barrica de 225 L (con 187.5 L)" o "Barril
 * 1250010 · 225 L (con 180 L)" iban a dos lineas, y 25 renglones asi pasaban
 * la hoja a dos A4. Las seis suman ~670 px: entran en los 182 mm (688 px) de
 * la A4 con margen de 14 mm. */
export const COLGROUP_PAPEL_LOTE =
  '<colgroup><col style="width:34px"><col style="width:96px"><col style="width:280px">' +
  '<col style="width:80px"><col style="width:110px"><col style="width:60px"></colgroup>';

export function theadPapelLote(u){
  return '<tr><th class="c oh-num">#</th><th class="c">LOTE</th><th class="c">VASIJAS</th>' +
         '<th class="c">PRODUCTO</th><th class="c">' + esc(u.col) + ' por vasija</th>' +
         '<th class="oh-check">Check</th></tr>';
}

/* Litros sin decimales de mas: 225, 112.5. */
const litrosTxt = v => (Number.isFinite(Number(v)) ? String(Math.round(Number(v) * 10) / 10) : String(v ?? ''));

/** Descripcion de un grupo de vasijas: "10 barricas de 225 L",
 *  "1 barrica de 225 L (con 180 L)", "2 T50 (con 45 L)", "T 201 · 3000 L". */
export function textoVasijas(g){
  if (!g.barril){
    return (g.vasija ? g.vasija : 'Sin ubicar') + ' · ' + litrosTxt(g.litros) + ' L';
  }
  const capNum = Number(g.cap);
  const tieneCap = g.cap != null && g.cap !== '' && Number.isFinite(capNum) && capNum > 0;
  /* Renglon de un lote "por barril": uno por barril, con su numero. */
  if (g.num){
    let tb = 'Barril ' + g.num;
    if (tieneCap) tb += ' · ' + litrosTxt(capNum) + ' L';
    if (!tieneCap || Math.abs(Number(g.litros) - capNum) > 0.05) tb += ' (con ' + litrosTxt(g.litros) + ' L)';
    return tb;
  }
  let t;
  if (tieneCap && esT50(capNum)) t = g.cantidad + ' ' + NOMBRE_T50;   // el nombre ya dice los litros
  else {
    t = g.cantidad + (g.cantidad === 1 ? ' barrica' : ' barricas');
    if (tieneCap) t += ' de ' + litrosTxt(capNum) + ' L';
  }
  if (!tieneCap || Math.abs(Number(g.litros) - capNum) > 0.05) t += ' (con ' + litrosTxt(g.litros) + ' L)';
  return t;
}

/** Junta las filas de _ocBuildRows en renglones por lote y tipo de vasija.
 *  u = config de la unidad: la dosis se compara como se imprime (u.dec). */
export function gruposPorLote(filas, u){
  const out = [];
  let actual = null, porClave = null;
  for (const f of (filas || [])){
    if (f.tipo === 'lote'){ actual = f.lote; porClave = new Map(); continue; }
    if (f.tipo !== 'barrica' || !actual) continue;
    const b = f.barrica || {};
    const dosis = u.de(f.dosis || {});
    const dosisTxt = fmt(dosis, u.dec);
    const barril = !!b.num;
    const clave = barril
      ? 'b|' + String(b.cap ?? '') + '|' + litrosTxt(b.litros_usados) + '|' + dosisTxt
      : 's|' + out.length;   // una vasija sin barril nunca se junta con otra
    let g = porClave.get(clave);
    if (!g){
      g = { tipo: 'grupo', lote: actual, barril, cap: b.cap, vasija: b.vasija || '',
            litros: b.litros_usados, cantidad: 0, dosis, claves: [], manual: false };
      porClave.set(clave, g);
      out.push(g);
    }
    g.cantidad++;
    /* De que vasijas es el renglon: la dosis escrita sobre la hoja se aplica a
     * todas (ver orden-correccion-manual.js). */
    if (f.clave != null) g.claves.push(f.clave);
    if (f.manual) g.manual = true;
  }
  return out;
}

const escA = v => esc(v).replace(/"/g, '&quot;');

/* La dosis del renglon. En la hoja de pantalla (editable) es un campo: lo que
 * se escribe es la dosis a mano de las vasijas del renglon (fila.idx = indice
 * en las filas del papel, para saber cuales). La que ya esta a mano se marca y
 * trae ↺ para volver a la calculada; al imprimir no se ve ninguna de las dos. */
function celdaDosis(fila, u, editable){
  const txt = fmt(fila.dosis, u.dec);
  const suf = ' ' + esc(u.suf || '');
  if (!editable) return '<td class="c"><b>' + txt + '</b>' + suf + '</td>';
  const i = escA(fila.idx);
  return '<td class="c' + (fila.manual ? ' oh-manual' : '') + '">' +
    '<input class="oh-campo oh-campo-dosis" data-oc-dosis="' + i + '" type="text" inputmode="decimal" value="' + escA(txt) + '"' +
    ' title="Dosis por vasija. Lo que escribas se guarda con la orden.">' + suf +
    (fila.manual ? ' <button type="button" class="oh-reset" data-oc-dosis-reset="' + i + '" title="Volver a la dosis calculada">↺</button>' : '') +
    '</td>';
}

/** Un renglon del papel por lote. El lote va en todos los renglones, no solo
 *  en el primero: cada renglon se tilda solo y no tiene que depender del de
 *  arriba para saber de que lote es. */
export function filaPapelLote({ numero, fila }, u, opts){
  const lote = fila.lote.lote;
  const anio = anioDeLote(lote);
  return '<tr>' +
    '<td class="c oh-num">' + numero + '</td>' +
    '<td class="c"><b>' + esc(lote) + '</b>' + (anio ? ' · ' + anio : '') + '</td>' +
    '<td>' + esc(textoVasijas(fila)) + '</td>' +
    '<td class="c">' + esc(u.prod) + '</td>' +
    celdaDosis(fila, u, opts && opts.editable) +
    '<td class="oh-check"></td>' +
  '</tr>';
}

/** Las filas del papel cuando cada lote elige su modo (Genérica / Por barril).
 *  La hoja usa siempre las columnas del papel por lote: un mismo papel mezcla
 *  los dos modos y no puede tener dos encabezados. Genérica junta como
 *  gruposPorLote; Por barril saca un renglon por vasija con su numero.
 *  modoDe recibe el objeto lote de la fila separadora. */
export function filasPapelPorModo(filas, modoDe, u){
  const out = [];
  let bloque = [];
  const vaciar = () => {
    if (!bloque.length) return;
    const lote = bloque[0].lote;
    if (modoDe(lote) === 'barril'){
      for (const f of bloque.slice(1)){
        if (f.tipo !== 'barrica') continue;
        const b = f.barrica || {};
        out.push({ tipo: 'grupo', lote, barril: !!b.num, num: b.num || '', cap: b.cap,
                   vasija: b.vasija || '', litros: b.litros_usados, cantidad: 1,
                   dosis: u.de(f.dosis || {}),
                   claves: f.clave != null ? [f.clave] : [], manual: !!f.manual });
      }
    } else out.push(...gruposPorLote(bloque, u));
    bloque = [];
  };
  for (const f of filas || []){
    if (f.tipo === 'lote') vaciar();
    bloque.push(f);
  }
  vaciar();
  return out;
}

