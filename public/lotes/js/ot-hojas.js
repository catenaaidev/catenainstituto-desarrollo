/* ===== Lotes CIW — las tres hojas de papel de una OT de trasiego =====
 *
 * Devuelve strings de HTML (sin tocar el DOM) para poder testearlas. Reusa el
 * encabezado y las firmas de orden-hoja.js: es el mismo documento de calidad
 * RCI 08, y una segunda copia del encabezado se desincroniza en el primer
 * cambio de formulario.
 *
 * Las casillas de "Check" salen VACÍAS: las tilda el operario en el papel, que
 * sigue siendo el registro de calidad. El sistema solo guarda los totales. */
'use strict';

import { esc } from './nucleo.js';
import { hojaTop, hojaMeta, hojaBanda, hojaPie } from './orden-hoja.js';
import { plantillaPorId, origenTanque, hojasDePlantilla, COLS_VACIADO } from './ot-plantillas.js';
import { resumenVasijas } from './ot-armado.js';
import { bloquesDeOT } from './ot-bloques.js';
import { fmtFecha } from './fechas.js';

// Lo que entra en una A4 con los dos bloques (vaciado + llenado), igual que la
// hoja "Barriles" del Excel.
export const FILAS_PLANILLA = 19;

const CHECK = '<td class="ot-check">☐</td>';
const fmtL = v => (v === null || v === undefined || v === '') ? '' : String(v);

function meta(ot){
  const f = String(ot.fecha || '');
  return hojaMeta({ fechaTxt: fmtFecha(f), anio: f.slice(0, 4), nro: ot.ot });
}

function lineaDestino(ot){
  return ot.destino ? esc(ot.destino) : 'Tanque pulmón: ________';
}

/* La cantidad y, debajo, los números de barril: el operario busca las barricas
 * por número, y con solo "10 barricas" tenía que ir a la planilla de la hoja 2.
 * Con una sola barrica resumenVasijas() ya trae el número. */
function celdaVasijas(l){
  const resumen = esc(resumenVasijas(l));
  const bs = l.barriles || [];
  if (bs.length < 2) return resumen;
  return `${resumen}<div class="ot-nums">${bs.map(b => esc(b.num)).join(' · ')}</div>`;
}

function bloqueIds(ot){
  const ids = ot.lotes.filter(l => l.id_texto).map(l => `<div><b>ID ${esc(l.lote)}:</b> ${esc(l.id_texto)}</div>`).join('');
  return `<div class="ot-ids">${ids}</div>`;
}

// El ID de un corte es el del lote que se forma en el tanque (0867).
function bloqueIdCorte(ot){
  const c = ot.lote_corte;
  if (!c) return '<div class="ot-ids"><b>ID:</b> <span class="ot-linea"></span></div>';
  return `<div class="ot-ids"><b>ID ${esc(c.lote)}:</b> ${esc(c.id_texto)}</div>`;
}

/* Corte (0867): una fila por barril con su lote y su capacidad, y el tanque
 * destino UNA vez, en una celda que abarca todas las filas. Un lote sin
 * barriles del Mapa ocupa una fila con la vasija cargada a mano. */
function tablaVaciadoPorBarril(ot){
  const filas = ot.lotes.flatMap(l => l.barriles.length
    ? l.barriles.map(b => ({ lote: l.lote, vasija: b.num, litros: b.cap }))
    : [{ lote: l.lote, vasija: resumenVasijas(l), litros: l.litros_previstos }]);
  const destino = ot.destino ? `${esc(ot.destino)}:<br><br>________` : 'Tanque: ________';
  const cuerpo = filas.map((f, i) =>
    `<tr>${CHECK}<td>${esc(f.lote)}</td><td>${esc(f.vasija)}</td><td>${esc(fmtL(f.litros))}</td>` +
    (i === 0 ? `<td rowspan="${filas.length}" class="ot-destino">${destino}</td>` : '') + '<td></td></tr>').join('');
  const total = filas.reduce((s, f) => s + (Number(f.litros) || 0), 0);
  const pie = filas.length > 1
    ? `<tr class="ot-total"><td></td><td>Total</td><td></td><td>${total}</td><td></td><td></td></tr>` : '';
  return '<table class="ot-tabla"><thead><tr><th>Check</th><th>CIW lote</th><th>Vasija</th><th>Litros</th>' +
    `<th>Destino</th><th>Merma</th></tr></thead><tbody>${cuerpo}${pie}</tbody></table>`;
}

function tablaVaciado(ot, columnas){
  const celda = (l, c) => {
    switch (c){
      case 'lote':    return esc(l.lote);
      case 'vasijas': return celdaVasijas(l);
      case 'litros':  return esc(fmtL(l.litros_previstos));
      case 'destino': return lineaDestino(ot);
      default:        return ''; // caudalimetro y merma: los anota el operario
    }
  };
  const head = '<th>Check</th>' + columnas.map(c => `<th>${esc(COLS_VACIADO[c])}</th>`).join('');
  const filas = ot.lotes.map(l =>
    '<tr>' + CHECK + columnas.map(c => `<td>${celda(l, c)}</td>`).join('') + '</tr>').join('');
  const total = ot.lotes.reduce((s, l) => s + (Number(l.litros_previstos) || 0), 0);
  const iLitros = columnas.indexOf('litros');
  const pie = ot.lotes.length > 1 && iLitros >= 0
    ? '<tr class="ot-total"><td></td>' + columnas.map((c, i) =>
        `<td>${i === 0 ? 'Total' : i === iLitros ? total : ''}</td>`).join('') + '</tr>'
    : '';
  return `${bloqueIds(ot)}<table class="ot-tabla"><thead><tr>${head}</tr></thead><tbody>${filas}${pie}</tbody></table>`;
}

/* vasija 'origen': el vino se corrige en el tanque de donde sale (OT desde
 * tanque), así que la hoja ya lo trae en vez de la línea para completar. */
/* 'agregado-corte' (0867): se corrige el lote del corte, ya en el tanque
 * destino: una fila de TH2 y una de Solución SO2. */
function tablaAgregadoCorte(ot){
  const lote = ot.lote_corte ? esc(ot.lote_corte.lote) : '';
  const vasija = ot.destino ? esc(ot.destino) : 'T_______';
  const filas = ['TH2', 'Solución SO2'].map(prod =>
    `<tr>${CHECK}<td>${lote}</td><td>1</td><td>${vasija}</td><td>${prod}</td><td></td><td></td></tr>`).join('');
  return '<div class="ot-subt">Agregado</div><table class="ot-tabla"><thead><tr><th>Check</th><th>CIW lote</th>' +
    '<th>Cantidad de vasijas</th><th>Vasijas</th><th>Producto</th><th>Cantidad</th><th>Tipo</th></tr></thead>' +
    `<tbody>${filas}</tbody></table>`;
}

function tablaCorreccion(ot, vasija, modelo){
  if (modelo === 'agregado-corte') return tablaAgregadoCorte(ot);
  const cual = l => (vasija === 'origen' && resumenVasijas(l)) ? esc(resumenVasijas(l)) : 'T_______';
  const filas = ot.lotes.flatMap(l => ['TH2', 'SO2'].map(prod =>
    `<tr>${CHECK}<td>${esc(l.lote)}</td><td>1</td><td>${cual(l)}</td><td>${prod}</td><td></td><td></td></tr>`)).join('');
  return '<div class="ot-subt">Corrección</div><table class="ot-tabla"><thead><tr><th>Check</th><th>CIW lote</th>' +
    '<th>Cantidad de vasijas</th><th>Vasijas</th><th>Producto</th><th>Cantidad</th><th>Tipo</th></tr></thead>' +
    `<tbody>${filas}</tbody></table>`;
}

/* 'desde-tanque' (0912): la vasija es el tanque de origen, los litros son los
 * previstos, el destino es el texto de la OT ("Barricas Pinot ...") y el
 * operario anota la cantidad de barriles llenos. */
function tablaLlenadoDesdeTanque(ot){
  const destino = ot.destino ? esc(ot.destino) : 'Barricas: ________';
  const filas = ot.lotes.map(l =>
    `<tr>${CHECK}<td>${esc(l.lote)}</td><td>${esc(resumenVasijas(l))}</td><td>${esc(fmtL(l.litros_previstos))}</td>` +
    `<td>${destino}</td><td></td></tr>`).join('');
  return '<table class="ot-tabla"><thead><tr><th>Check</th><th>CIW lote</th><th>Vasija</th><th>Litros</th>' +
    `<th>Destino</th><th>Cantidad de barriles llenos</th></tr></thead><tbody>${filas}</tbody></table>`;
}

function tablaLlenado(ot, modelo){
  if (modelo === 'desde-tanque') return tablaLlenadoDesdeTanque(ot);
  const filas = ot.lotes.map(l =>
    `<tr>${CHECK}<td>${esc(l.lote)}</td><td>${lineaDestino(ot)}</td><td></td><td>Barricas</td><td></td></tr>`).join('');
  return '<table class="ot-tabla"><thead><tr><th>Check</th><th>CIW lote</th><th>Vasija</th><th>Litros</th>' +
    `<th>Destino</th><th>Dar lleno con</th></tr></thead><tbody>${filas}</tbody></table>`;
}

function rotular(ot, de){
  if (de === 'corte'){
    const c = ot.lote_corte;
    const txt = c ? `${esc(c.lote)} ${esc(c.id_texto)}` : '';
    return `<div class="ot-paso"><span class="ot-caja">☐</span>Rotular vasija ID. <b>${txt}</b></div>`;
  }
  const txt = ot.lotes.map(l => `${esc(l.lote)} ${esc(l.id_texto || '')}`).join(' · ');
  return `<div class="ot-paso"><span class="ot-caja">☐</span>Rotular vasija ID. <b>${txt}</b></div>`;
}

/* Los bloques que salen de los datos de la OT: no se editan sobre la hoja. */
function bloqueFijo(ot, b){
  switch (b.tipo){
    case 'ids':              return b.de === 'corte' ? bloqueIdCorte(ot) : bloqueIds(ot);
    case 'tabla-vaciado':    return b.porBarril ? tablaVaciadoPorBarril(ot) : tablaVaciado(ot, b.columnas);
    case 'rotular':          return rotular(ot, b.de);
    case 'tabla-correccion': return tablaCorreccion(ot, b.vasija, b.modelo);
    case 'tabla-llenado':    return tablaLlenado(ot, b.modelo);
    default:                 return '';
  }
}

/* Modo editable (sub-pestaña Órdenes de trabajo): cada paso y dato es un
 * textarea con data-bloque = su índice en bloquesDeOT(ot), y cada bloque lleva
 * sus controles (＋ insertar un paso debajo; ✕ quitar, solo en los de texto).
 * La impresión nunca usa este modo: hojasOT arma la hoja de nuevo desde los
 * datos, así que los controles no llegan al papel. */
const textoEditable = (i, texto) =>
  `<textarea class="ot-texto" data-bloque="${i}" rows="1" placeholder="Escribí el paso…">${esc(texto)}</textarea>`;

function controles(i, quitable){
  return '<span class="ot-ctrl">' +
    `<button type="button" class="ot-insertar" data-insertar="${i}" title="Insertar un paso debajo" aria-label="Insertar un paso debajo">＋</button>` +
    (quitable ? `<button type="button" class="ot-quitar" data-quitar="${i}" title="Quitar este renglón" aria-label="Quitar este renglón">✕</button>` : '') +
    '</span>';
}

// Un paso que quedó vacío no sale en el papel.
const vacio = b => !String((b && b.texto) || '').trim();

export function hojaOT(ot, { editable = false } = {}){
  const pl = plantillaPorId(ot.plantilla);
  const hayOrganico = ot.lotes.some(l => l.organico);
  const cuerpo = bloquesDeOT(ot).map((b, i) => {
    switch (b.tipo){
      case 'paso': {
        if (!editable && vacio(b)) return '';
        const dest = b.destaca === 'organico' && hayOrganico ? ' ot-destaca' : '';
        const ok = b.ok ? '<span class="ot-ok">OK ☐</span>' : '';
        const texto = editable ? textoEditable(i, b.texto) : esc(b.texto);
        return `<div class="ot-paso${dest}${editable ? ' ot-editable' : ''}"><span class="ot-caja">☐</span>` +
          `${texto}${ok}${editable ? controles(i, true) : ''}</div>`;
      }
      case 'dato': {
        if (!editable && vacio(b)) return '';
        const ok = b.ok ? '<span class="ot-ok">OK ☐</span>' : '';
        const texto = editable ? textoEditable(i, b.texto) : esc(b.texto);
        return `<div class="ot-dato${editable ? ' ot-editable' : ''}">${texto} <span class="ot-linea"></span>` +
          `${ok}${editable ? controles(i, true) : ''}</div>`;
      }
      default: {
        const html = bloqueFijo(ot, b);
        return editable ? `<div class="ot-fijo">${html}${controles(i, false)}</div>` : html;
      }
    }
  }).join('');
  const lotesTxt = ot.lotes.map(l => l.lote).join(' · ');
  // Un corte se nombra por el lote que forma ("Trasiego 26300 <ID>"), no por
  // la lista de lotes de origen, que en la 0867 son treinta.
  const banda = ot.lote_corte
    ? [(pl ? pl.banda[0] : 'TRASIEGO'), ot.lote_corte.lote, ot.lote_corte.id_texto]
    : [...(pl ? pl.banda : ['TRASIEGO', '']), lotesTxt];
  return `<div class="orden-hoja ot-trasiego">${hojaTop()}
  <div class="oh-titulo">Orden de Trabajo</div>
  ${meta(ot)}
  ${hojaBanda(banda)}
  ${cuerpo}
  ${hojaPie(ot.emitio, '')}
</div>`;
}

function trozos(arr, n){
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out.length ? out : [[]];
}

function planillaHoja(ot, vac, lle, loteVac, loteLle){
  const top = `<div class="oh-top"><span class="oh-empresa">BODEGAS ESMERALDA S.A.</span>` +
    `<span>PLANILLA DE MOVIMIENTO DE BARRILES - PCI 00 RCI 00 - Rev00 &nbsp;·&nbsp; Aprobado por: Roy Urvieta &nbsp;·&nbsp; Emisión: 1/7/2020</span></div>`;
  const head = '<tr><th>N°</th><th>Lote</th><th>N° barril</th><th>Capac</th><th>Año</th><th>Proveedor</th><th>Origen</th><th>Tratamiento</th></tr>';
  return `<div class="orden-hoja ot-planilla">${top}
  ${meta(ot)}
  <div class="oh-banda"><span>Lote ID: ${esc(loteVac)}</span><span>Condición: Vaciado</span></div>
  <table class="ot-tabla ot-chica"><thead>${head}</thead><tbody>${vac}</tbody></table>
  <div class="oh-banda"><span>Lote ID: ${esc(loteLle)}</span><span>Condición: Llenado</span></div>
  <table class="ot-tabla ot-chica"><thead>${head}</thead><tbody>${lle}</tbody></table>
  <div class="oh-pie"><div class="firma"><b>Responsable:</b> Firma:</div></div>
</div>`;
}

const filaBlanca = n => `<tr><td>${n}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;

// Barricas a llenar de un lote desde tanque; sin dato, una (igual que el rótulo).
const aLlenar = l => Math.max(Number(l.barricas_previstas) || 0, 1);

/* Desde tanque no se vacía ningún barril: el bloque Vaciado sale en blanco y
 * el de Llenado trae el lote precargado en una fila por barrica prevista, como
 * la hoja "Barriles" de la 0912. */
function hojasPlanillaDesdeTanque(ot){
  const filas = ot.lotes.flatMap(l => Array.from({ length: aLlenar(l) }, () => l.lote));
  const lotesTxt = ot.lotes.map(l => l.lote).join(' · ');
  return trozos(filas, FILAS_PLANILLA).map((pag, ip) => {
    const base = ip * FILAS_PLANILLA;
    const vac = Array.from({ length: FILAS_PLANILLA }, (_, i) => filaBlanca(base + i + 1)).join('');
    const lle = Array.from({ length: FILAS_PLANILLA }, (_, i) => pag[i] === undefined
      ? filaBlanca(base + i + 1)
      : `<tr><td>${base + i + 1}</td><td>${esc(pag[i])}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('');
    return planillaHoja(ot, vac, lle, '', lotesTxt);
  }).join('');
}

export function hojasPlanilla(ot){
  if (origenTanque(ot.plantilla)) return hojasPlanillaDesdeTanque(ot);
  const filas = ot.lotes.flatMap(l => l.barriles.map(b => ({ lote: l.lote, ...b })));
  const lotesTxt = ot.lotes.map(l => l.lote).join(' · ');
  return trozos(filas, FILAS_PLANILLA).map((pag, ip) => {
    const base = ip * FILAS_PLANILLA;
    const vac = Array.from({ length: FILAS_PLANILLA }, (_, i) => {
      const b = pag[i];
      return b
        ? `<tr><td>${base + i + 1}</td><td>${esc(b.lote)}</td><td>${esc(b.num)}</td><td>${esc(fmtL(b.cap))}</td>` +
          `<td>${esc(b.anio)}</td><td>${esc(b.marca)}</td><td>${esc(b.origen)}</td><td>${esc(b.trat)}</td></tr>`
        : filaBlanca(base + i + 1);
    }).join('');
    const lle = Array.from({ length: FILAS_PLANILLA }, (_, i) => filaBlanca(base + i + 1)).join('');
    return planillaHoja(ot, vac, lle, lotesTxt, '');
  }).join('');
}

// Lo que entra en una A4 de la hoja "rotulo" del Excel: 9 filas de a dos.
export const PARES_POR_HOJA = 9;

/* QR con el número de lote como texto, para leerlo con la cámara del teléfono
 * sin red ni login. La librería (qrcode-generator, la misma de Prensas) es un
 * <script> clásico del index.html; sin ella (los tests) el hueco sale vacío. */
function qrLote(lote){
  const qrcode = globalThis.qrcode;
  if (typeof qrcode !== 'function' || !lote) return '';
  const qr = qrcode(0, 'M'); qr.addData(String(lote)); qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

export function hojaRotulos(ot){
  // Desde tanque no hay barriles del Mapa: un par por barrica a llenar.
  // Cada barril lleva DOS rótulos iguales, uno al lado del otro, como el Excel.
  const tanque = origenTanque(ot.plantilla);
  const pares = ot.lotes.flatMap(l => {
    const n = tanque ? aLlenar(l) : Math.max(l.barriles.length, 1);
    const qr = qrLote(l.lote);
    return Array.from({ length: n }, (_, i) => {
      const r = `<div class="ot-rotulo"><div class="ot-rot-lote">${esc(l.lote)}</div>` +
        `<div class="ot-rot-qr">${qr}</div>` +
        `<div class="ot-rot-id">${esc(l.id_texto || '')}</div><div class="ot-rot-n">${i + 1}</div></div>`;
      return `<div class="ot-rot-par">${r}${r}</div>`;
    });
  });
  return trozos(pares, PARES_POR_HOJA)
    .map(pag => `<div class="orden-hoja ot-rotulos">${pag.join('')}</div>`).join('');
}

export function hojasOT(ot, opciones){
  // Una plantilla de una sola hoja (el corte) nunca imprime las otras, aunque
  // se las pidan.
  const deja = new Set(hojasDePlantilla(ot.plantilla));
  const o = { ot: true, planilla: true, rotulos: true, ...(opciones || {}) };
  for (const k of ['ot', 'planilla', 'rotulos']) if (!deja.has(k)) o[k] = false;
  return (o.ot ? hojaOT(ot) : '') + (o.planilla ? hojasPlanilla(ot) : '') + (o.rotulos ? hojaRotulos(ot) : '');
}
