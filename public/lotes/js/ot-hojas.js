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

import { esc, escA } from './nucleo.js';
import { hojaTop, hojaMeta, hojaBanda, hojaPie } from './orden-hoja.js';
import { plantillaPorId, origenTanque, hojasDePlantilla, esSalida, COLS_VACIADO } from './ot-plantillas.js';
import { resumenVasijas } from './ot-armado.js';
import { nombreTanque } from './ot-vasijas.js';
import { bloquesDeOT, textoBanda } from './ot-bloques.js';
import { fmtFecha } from './fechas.js';
import { nombreDestino, cantidadDestino, destinoChicas, nombreClase } from './ot-achique.js';
import { filasDeOT } from './ot-muestras.js';
import { extrasDeOT, nombreExtra, esChicas, destinoDeLote } from './ot-destinos.js';

// La hoja es lo que se emitio: lo agregado al confirmar no se imprime.
const extrasPapel = ot => extrasDeOT(ot).filter(x => !x.d.al_confirmar);

// Lo que entra en una A4 con los dos bloques (vaciado + llenado), igual que la
// hoja "Barriles" del Excel.
export const FILAS_PLANILLA = 19;

const CHECK = '<td class="ot-check">☐</td>';
const fmtL = v => (v === null || v === undefined || v === '') ? '' : String(v);

function meta(ot){
  const f = String(ot.fecha || '');
  return hojaMeta({ fechaTxt: fmtFecha(f), anio: f.slice(0, 4), nro: ot.ot });
}

function lineaDestino(ot, l){
  const d = l ? destinoDeLote(ot, l) : String(ot.destino || '').trim();
  return d ? esc(d) : 'Tanque pulmón: ________';
}

/* Tanques destino extra: "T 214 (lote 26330): ____", uno debajo del otro. */
const lineasExtra = xs => xs.map(x => `<br>${esc(nombreExtra(x.d))} (lote ${esc(x.d.lote)}): ________`).join('');
// Cantidad de vasijas de un extra: 1 tanque, o las barricas + T50 (en blanco si no se saben).
const cantExtra = d => !esChicas(d) ? '1' : ((Number(d.barricas) || 0) + (Number(d.t50) || 0)) || '';
const extrasDeLote = (ot, l) => extrasPapel(ot).filter(x => x.i != null && ot.lotes[x.i] === l);

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
  const ids = ot.lotes.filter(l => l.id_texto).map(l => `<div class="ot-cel"><b>ID ${esc(l.lote)}:</b> ${esc(l.id_texto)}</div>`).join('');
  return `<div class="ot-ids">${ids}</div>`;
}

// El ID de un corte es el del lote que se forma en el tanque (0867).
function bloqueIdCorte(ot){
  const c = ot.lote_corte;
  if (!c) return '<div class="ot-ids"><div class="ot-cel"><b>ID:</b> <span class="ot-linea"></span></div></div>';
  return `<div class="ot-ids"><div class="ot-cel"><b>ID ${esc(c.lote)}:</b> ${esc(c.id_texto)}</div></div>`;
}

/* Corte (0867): una fila por barril con su lote y su capacidad, y el tanque
 * destino UNA vez, en una celda que abarca todas las filas. Los tanques y las
 * vasijas manuales del lote van despues de sus barriles; un lote sin nada de
 * eso ocupa una fila con la vasija cargada a mano (OT viejas). */
/* Filas escritas a mano en la hoja que no son de ningun lote del sistema
 * (ot-editar.js): salen en el papel y nada mas. */
const _filasPapel = ot => ot.filas_papel || [];

function filasPorVasija(ot){
  return ot.lotes.flatMap(l => {
    // Despues de los barriles, una fila por tanque del padron y por vasija
    // manual (IBC, bins), cada una con sus litros.
    const partes = [
      ...(l.cantidad_barricas ? [{ lote: l.lote, vasija: `${l.cantidad_barricas} Barricas`, litros: l.litros_previstos }] :
        (l.barriles || []).map(b => ({ lote: l.lote, vasija: b.num, litros: b.cap }))),
      ...(l.tanques || []).map(t => ({ lote: l.lote, vasija: nombreTanque(t.num), litros: t.litros })),
      ...(l.otras || []).map(o => ({ lote: l.lote, vasija: o.nombre, litros: o.litros })),
    ];
    return partes.length ? partes : [{ lote: l.lote, vasija: resumenVasijas(l), litros: l.litros_previstos }];
  }).concat(_filasPapel(ot).map(f => ({ lote: f.lote, vasija: f.nombre, litros: f.litros, papel: true })));
}
// Las filas de solo papel (fuera del sistema) no suman: el total es el del movimiento.
const totalFilas = filas => filas.filter(f => !f.papel).reduce((s, f) => s + (Number(f.litros) || 0), 0);

function tablaVaciadoPorBarril(ot){
  const filas = filasPorVasija(ot);
  const destino = (ot.destino ? `${esc(ot.destino)}:<br><br>________` : 'Tanque: ________') + lineasExtra(extrasPapel(ot));
  const cuerpo = filas.map((f, i) =>
    `<tr>${CHECK}<td>${esc(f.lote)}</td><td>${esc(f.vasija)}</td><td>${esc(fmtL(f.litros))}</td>` +
    (i === 0 ? `<td rowspan="${filas.length}" class="ot-destino">${destino}</td>` : '') + '<td></td></tr>').join('');
  const pie = filas.length > 1
    ? `<tr class="ot-total"><td></td><td>Total</td><td></td><td>${totalFilas(filas)}</td><td></td><td></td></tr>` : '';
  return '<table class="ot-tabla"><thead><tr><th>Check</th><th>CIW lote</th><th>Vasija</th><th>Litros</th>' +
    `<th>Destino</th><th>Merma</th></tr></thead><tbody>${cuerpo}${pie}</tbody></table>`;
}

/* Corte + achique (0943): del pulmon a las vasijas definitivas. El pulmon va
 * UNA vez (rowspan) y cada vasija es una fila con su lote: el primer tanque
 * lleva el lote del corte, los demas su lote hijo. */
const ENT = x => { const v = Math.floor(Number(x)); return Number.isFinite(v) && v > 0 ? v : 0; };
/* Emitida por tipo, lo que todavia no se sabe sale en blanco para el operario:
 * "TANQUE AC.INOX. · 75 HL: T ____", sin cantidad ni litros. */
function destinoCelda(d){
  if (d.tipo === 'tanque'){
    if (!d.clase) return nombreDestino(d);   // OT vieja: "T 206"
    const n = String(d.num ?? '').trim();
    return `${nombreClase(d.clase)}: ${n ? nombreDestino(d) : 'T ____'}`;
  }
  const b = ENT(d.barricas), t = ENT(d.t50);
  return b && t ? 'Barricas + T50' : t ? 'T50' : b ? 'Barricas' : 'Barricas / T50';
}
function tablaAchique(ot){
  const ds = (ot.achique && ot.achique.destinos) || [];
  const pulmon = ot.destino ? `${esc(ot.destino)}<br><br>________` : 'Tanque pulmón: ________';
  const filas = ds.length ? ds : [{ lote: '', tipo: 'tanque', num: '' }];
  const cuerpo = filas.map((d, i) =>
    `<tr>${CHECK}<td>${esc(d.lote)}</td>` +
    (i === 0 ? `<td rowspan="${filas.length}" class="ot-destino">${pulmon}</td>` : '') +
    `<td>${esc(ds.length ? cantidadDestino(d) : '')}</td><td>${esc(fmtL(d.litros))}</td>` +
    `<td>${esc(ds.length ? destinoCelda(d) : '')}</td><td></td><td></td></tr>`).join('');
  // Suma solo los litros que se conocen; sin ninguno, el total va en blanco.
  const conocidos = ds.filter(d => d.litros !== null && d.litros !== undefined && d.litros !== '');
  const total = conocidos.reduce((s, d) => s + (Number(d.litros) || 0), 0);
  const pie = ds.length > 1
    ? `<tr class="ot-total"><td></td><td>Total</td><td></td><td></td><td>${conocidos.length ? esc(fmtL(Math.round(total * 10) / 10)) : ''}</td><td></td><td></td><td></td></tr>` : '';
  return '<table class="ot-tabla"><thead><tr><th>Check</th><th>CIW lote</th><th>Vasija</th><th>Cantidad</th><th>Litros</th>' +
    `<th>Destino</th><th>Litros caudalímetro</th><th>Merma</th></tr></thead><tbody>${cuerpo}${pie}</tbody></table>`;
}

/* Traslado (0957): una fila por vasija, como el Corte. Destino es la cisterna
 * (chasis o acoplado) y, con caudalímetro, medida, O2 y temperatura, lo anota
 * el operario al cargar el camión (o se escribe sobre la hoja). */
function tablaTraslado(ot, columnas){
  const filas = filasPorVasija(ot);
  const celda = (f, c) => c === 'lote' ? esc(f.lote) : c === 'vasijas' ? esc(f.vasija)
    : c === 'litros' ? esc(fmtL(f.litros)) : '';
  const head = '<th>Check</th>' + columnas.map(c => `<th>${esc(COLS_VACIADO[c])}</th>`).join('');
  const cuerpo = filas.map(f => '<tr>' + CHECK + columnas.map(c => `<td>${celda(f, c)}</td>`).join('') + '</tr>').join('');
  const iLitros = columnas.indexOf('litros');
  const pie = filas.length > 1
    ? '<tr class="ot-total"><td></td>' + columnas.map((c, i) =>
        `<td>${i === 0 ? 'Total' : i === iLitros ? totalFilas(filas) : ''}</td>`).join('') + '</tr>' : '';
  return `<table class="ot-tabla"><thead><tr>${head}</tr></thead><tbody>${cuerpo}${pie}</tbody></table>`;
}

function tablaVaciado(ot, columnas){
  const celda = (l, c) => {
    switch (c){
      case 'lote':    return esc(l.lote);
      case 'vasijas': return celdaVasijas(l);
      case 'litros':  return esc(fmtL(l.litros_previstos));
      case 'destino': return lineaDestino(ot, l) + lineasExtra(extrasDeLote(ot, l));
      default:        return ''; // caudalimetro y merma: los anota el operario
    }
  };
  const head = '<th>Check</th>' + columnas.map(c => `<th>${esc(COLS_VACIADO[c])}</th>`).join('');
  const celdaPapel = (f, c) => c === 'lote' ? esc(f.lote) : c === 'vasijas' ? esc(f.nombre)
    : c === 'litros' ? esc(fmtL(f.litros)) : c === 'destino' ? lineaDestino(ot) : '';
  const filas = ot.lotes.map(l =>
    '<tr>' + CHECK + columnas.map(c => `<td>${celda(l, c)}</td>`).join('') + '</tr>').join('') +
    _filasPapel(ot).map(f => '<tr>' + CHECK + columnas.map(c => `<td>${celdaPapel(f, c)}</td>`).join('') + '</tr>').join('');
  const total = ot.lotes.reduce((s, l) => s + (Number(l.litros_previstos) || 0), 0);
  const iLitros = columnas.indexOf('litros');
  const pie = ot.lotes.length + _filasPapel(ot).length > 1 && iLitros >= 0
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
  const extras = extrasPapel(ot).flatMap(x => ['TH2', 'Solución SO2'].map(prod =>
    `<tr>${CHECK}<td>${esc(x.d.lote)}</td><td>${cantExtra(x.d)}</td><td>${esc(nombreExtra(x.d))}</td><td>${prod}</td><td></td><td></td></tr>`)).join('');
  return '<div class="ot-cel ot-subt">Agregado</div><table class="ot-tabla"><thead><tr><th>Check</th><th>CIW lote</th>' +
    '<th>Cantidad de vasijas</th><th>Vasijas</th><th>Producto</th><th>Cantidad</th><th>Tipo</th></tr></thead>' +
    `<tbody>${filas}${extras}</tbody></table>`;
}

function tablaCorreccion(ot, vasija, modelo){
  if (modelo === 'agregado-corte') return tablaAgregadoCorte(ot);
  const cual = l => (vasija === 'origen' && resumenVasijas(l)) ? esc(resumenVasijas(l)) : 'T_______';
  const filas = ot.lotes.flatMap(l => [
    ...['TH2', 'SO2'].map(prod => `<tr>${CHECK}<td>${esc(l.lote)}</td><td>1</td><td>${cual(l)}</td><td>${prod}</td><td></td><td></td></tr>`),
    ...extrasDeLote(ot, l).flatMap(x => ['TH2', 'SO2'].map(prod =>
      `<tr>${CHECK}<td>${esc(x.d.lote)}</td><td>${cantExtra(x.d)}</td><td>${esc(nombreExtra(x.d))}</td><td>${prod}</td><td></td><td></td></tr>`)),
  ]).join('');
  return '<div class="ot-cel ot-subt">Corrección</div><table class="ot-tabla"><thead><tr><th>Check</th><th>CIW lote</th>' +
    '<th>Cantidad de vasijas</th><th>Vasijas</th><th>Producto</th><th>Cantidad</th><th>Tipo</th></tr></thead>' +
    `<tbody>${filas}</tbody></table>`;
}

/* 'desde-tanque' (0912): la vasija es el tanque de origen, los litros son los
 * previstos, el destino es el texto de la OT ("Barricas Pinot ...") y el
 * operario anota la cantidad de barriles llenos. */
function tablaLlenadoDesdeTanque(ot){
  const destino = ot.destino ? esc(ot.destino) : 'Barricas: ________';
  const filaExtra = x => `<tr>${CHECK}<td>${esc(x.d.lote)}</td><td>${esc(nombreExtra(x.d))}</td><td>${esc(fmtL(x.d.litros))}</td>` +
    `<td>${esc(nombreExtra(x.d))}</td><td></td></tr>`;
  const filas = ot.lotes.flatMap(l => [
    `<tr>${CHECK}<td>${esc(l.lote)}</td><td>${esc(resumenVasijas(l))}</td><td>${esc(fmtL(l.litros_previstos))}</td>` +
    `<td>${destino}</td><td></td></tr>`,
    ...extrasDeLote(ot, l).map(filaExtra),
  ]).join('');
  return '<table class="ot-tabla"><thead><tr><th>Check</th><th>CIW lote</th><th>Vasija</th><th>Litros</th>' +
    `<th>Destino</th><th>Cantidad de barriles llenos</th></tr></thead><tbody>${filas}</tbody></table>`;
}

function tablaLlenado(ot, modelo){
  if (modelo === 'desde-tanque') return tablaLlenadoDesdeTanque(ot);
  const filaExtra = x => `<tr>${CHECK}<td>${esc(x.d.lote)}</td><td>${esc(nombreExtra(x.d))}</td>` +
    `<td>${esc(fmtL(x.d.litros))}</td><td>${esc(nombreExtra(x.d))}</td><td></td></tr>`;
  const filas = ot.lotes.flatMap(l => [
    `<tr>${CHECK}<td>${esc(l.lote)}</td><td>${lineaDestino(ot, l)}</td><td></td><td>Barricas</td><td></td></tr>`,
    ...extrasDeLote(ot, l).map(filaExtra),
  ]).join('');
  return '<table class="ot-tabla"><thead><tr><th>Check</th><th>CIW lote</th><th>Vasija</th><th>Litros</th>' +
    `<th>Destino</th><th>Dar lleno con</th></tr></thead><tbody>${filas}</tbody></table>`;
}

function rotular(ot, de){
  if (de === 'achique'){
    const ds = (ot.achique && ot.achique.destinos) || [];
    const id = ot.lote_corte ? ot.lote_corte.id_texto : '';
    if (!ds.length) return '<div class="ot-paso"><span class="ot-caja">☐</span>Rotular vasija ID. <b class="ot-cel"></b></div>';
    return ds.map(d => `<div class="ot-paso"><span class="ot-caja">☐</span>Rotular vasija ID. ` +
      `<b class="ot-cel">${esc(nombreDestino(d))} · ${esc(d.lote)} ${esc(id)}</b></div>`).join('');
  }
  if (de === 'corte'){
    const c = ot.lote_corte;
    const txt = c ? `${esc(c.lote)} ${esc(c.id_texto)}` : '';
    const extras = extrasPapel(ot).map(x => `<div class="ot-paso"><span class="ot-caja">☐</span>Rotular vasija ID. ` +
      `<b class="ot-cel">${esc(nombreExtra(x.d))} · ${esc(x.d.lote)} ${esc(c ? c.id_texto : '')}</b></div>`).join('');
    return `<div class="ot-paso"><span class="ot-caja">☐</span>Rotular vasija ID. <b class="ot-cel">${txt}</b></div>${extras}`;
  }
  const txt = ot.lotes.map(l => `${esc(l.lote)} ${esc(l.id_texto || '')}`).join(' · ');
  const extras = extrasPapel(ot).map(x => `<div class="ot-paso"><span class="ot-caja">☐</span>Rotular vasija ID. ` +
    `<b class="ot-cel">${esc(nombreExtra(x.d))} · ${esc(x.d.lote)} ${esc(ot.lotes[x.i] ? ot.lotes[x.i].id_texto || '' : '')}</b></div>`).join('');
  return `<div class="ot-paso"><span class="ot-caja">☐</span>Rotular vasija ID. <b class="ot-cel">${txt}</b></div>${extras}`;
}

/* Muestras (0993): # · CIW lote · Vasija · Muestra · Check. En pantalla (OT
 * pendiente) cada celda es un input y la fila se quita con ✕; "＋ Agregar
 * fila" va debajo. Nada de eso llega al papel: la impresion arma la hoja sin
 * editable. `lotesExisten` (Set) pinta en rojo el lote que no existe. */
const COLS_MU = [['lote', 'CIW lote'], ['vasija', 'Vasija'], ['muestra', 'Muestra']];
function tablaMuestras(ot, editable, lotesExisten){
  const filas = filasDeOT(ot);
  const head = '<tr><th>#</th>' + COLS_MU.map(([, t]) => `<th>${t}</th>`).join('') + '<th>Check</th></tr>';
  const mal = f => lotesExisten && String(f.lote || '').trim() && !lotesExisten.has(String(f.lote).trim());
  const cuerpo = filas.map((f, i) => editable
    ? `<tr><td class="ot-mu-n">${i + 1}<button type="button" class="ot-mu-x" data-mquitar="${i}" title="Quitar esta fila" aria-label="Quitar la fila ${i + 1}">✕</button></td>` +
      COLS_MU.map(([c, t]) => `<td><input class="ot-mu-celda${c === 'lote' && mal(f) ? ' ot-mu-mal' : ''}" data-mfila="${i}" data-mcol="${c}" ` +
        `value="${escA(f[c] ?? '')}" aria-label="${t} de la fila ${i + 1}"${c === 'lote' ? ' list="otLotesDl"' : ''}></td>`).join('') +
      `${CHECK}</tr>`
    : `<tr><td>${i + 1}</td>` + COLS_MU.map(([c]) => `<td>${esc(f[c] ?? '')}</td>`).join('') + `${CHECK}</tr>`).join('');
  const mas = editable ? '<button type="button" class="btn ot-mu-mas" data-mmas>＋ Agregar fila</button>' : '';
  return `<table class="ot-tabla ot-muestras"><thead>${head}</thead><tbody>${cuerpo}</tbody></table>${mas}`;
}

/* Los bloques que salen de los datos de la OT: no se editan sobre la hoja. */
function bloqueFijo(ot, b){
  switch (b.tipo){
    case 'ids':              return b.de === 'corte' ? bloqueIdCorte(ot) : bloqueIds(ot);
    case 'tabla-vaciado':    return b.modelo === 'traslado' ? tablaTraslado(ot, b.columnas)
      : b.porBarril ? tablaVaciadoPorBarril(ot) : tablaVaciado(ot, b.columnas);
    case 'rotular':          return rotular(ot, b.de);
    case 'tabla-correccion': return tablaCorreccion(ot, b.vasija, b.modelo);
    case 'tabla-llenado':    return tablaLlenado(ot, b.modelo);
    case 'tabla-achique':    return tablaAchique(ot);
    default:                 return '';
  }
}

/* Casilleros de los bloques fijos: cada <td>/<th> (menos la columna Check) y
 * cada elemento .ot-cel (subtítulo, línea de ID, texto del rotular), numerados
 * en el orden en que aparecen en el HTML del bloque. Si la OT tiene texto
 * escrito para ese número (b.celdas, ver ot-bloques.js) va ese texto; en modo
 * editable el casillero se vuelve contenteditable con data-bloque/data-celda.
 * Solo papel: nunca cambia los datos de la OT. */
const RE_CELDA = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>|<(div|b) class="ot-cel([^"]*)"([^>]*)>([\s\S]*?)<\/\4>/g;
const ATTR_EDIT = 'contenteditable="plaintext-only" spellcheck="false"';
const textoPapel = t => esc(t).replace(/\n/g, '<br>');

export function aplicarCeldas(html, celdas, editable, i){
  const cs = celdas || {};
  if (!editable && !Object.keys(cs).length) return html;
  let n = 0;
  return html.replace(RE_CELDA, (todo, tdTag, tdAttr, tdIn, celTag, celCls, celAttr, celIn) => {
    if (tdTag && /class="ot-check"/.test(tdAttr)) return todo;
    const k = n++;
    const dentro = Object.hasOwn(cs, k) ? textoPapel(cs[k]) : (tdTag ? tdIn : celIn);
    const ed = editable ? ` ${ATTR_EDIT} data-bloque="${i}" data-celda="${k}"` : '';
    return tdTag
      ? `<${tdTag}${tdAttr}${ed}>${dentro}</${tdTag}>`
      : `<${celTag} class="ot-cel${celCls}"${celAttr}${ed}>${dentro}</${celTag}>`;
  });
}

function bandaEditable(partes){
  return '<div class="oh-banda">' + partes.map((x, j) =>
    `<span class="ot-cel-banda" ${ATTR_EDIT} data-banda="${j}">${textoPapel(x)}</span>`).join('') + '</div>';
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

/* Debajo de la tabla de vaciado, solo en pantalla y en una OT pendiente, va
 * el panel de filas manuales; lo pinta vista-ot-lista.js (necesita la lista
 * de lotes para decir si cada fila cuenta). Desde tanque no aplica (el tanque
 * va en "Tanque origen"). */
const lugarPanelFilas = ot => origenTanque(ot.plantilla) ? '' : '<div class="ot-otras-panel" id="otFilasPanel"></div>';

export function hojaOT(ot, { editable = false, lotesExisten = null } = {}){
  const pl = plantillaPorId(ot.plantilla);
  const hayOrganico = ot.lotes.some(l => l.organico);
  const cuerpo = bloquesDeOT(ot).map((b, i) => {
    switch (b.tipo){
      case 'tabla-muestras': {
        // Sin aplicarCeldas: sus celdas son datos (ot.muestras), no papel.
        const html = tablaMuestras(ot, editable, lotesExisten);
        return editable ? `<div class="ot-fijo">${html}${controles(i, false)}</div>` : html;
      }
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
        const html = aplicarCeldas(bloqueFijo(ot, b), b.celdas, editable, i);
        const panel = editable && b.tipo === 'tabla-vaciado' ? lugarPanelFilas(ot) : '';
        return editable ? `<div class="ot-fijo">${html}${controles(i, false)}</div>${panel}` : html;
      }
    }
  }).join('');
  // Numero y descripcion de cada lote ("26273 CF Gy Alto Ct.5"): el ID es lo
  // que se lee rapido en bodega.
  const lotesTxt = ot.lotes.map(l => [l.lote, String(l.id_texto || '').trim()].filter(Boolean).join(' ')).join(' · ');
  // Un corte se nombra por el lote que forma ("Trasiego 26300 <ID>"), no por
  // la lista de lotes de origen, que en la 0867 son treinta.
  // Un traslado lleva la bodega destino al final ("TRASLADO · 26329 CS · a VF").
  const calculada = ot.lote_corte
    ? [(pl ? pl.banda[0] : 'TRASIEGO'), ot.lote_corte.lote, ot.lote_corte.id_texto]
    : esSalida(ot.plantilla) ? [pl.banda[0], lotesTxt, ot.destino ? 'a ' + ot.destino : '']
    : [...(pl ? pl.banda : ['TRASIEGO', '']), lotesTxt];
  const banda = textoBanda(ot, [0, 1, 2].map(j => String(calculada[j] ?? '')));
  return `<div class="orden-hoja ot-trasiego">${hojaTop()}
  <div class="oh-titulo">Orden de Trabajo</div>
  ${meta(ot)}
  ${editable ? bandaEditable(banda) : hojaBanda(banda)}
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
  // Corte + achique a barricas/T50: el bloque Llenado trae el lote de las
  // chicas, una fila por barrica o T50 a llenar.
  const ch = destinoChicas(ot);
  const llenar = ch ? Array.from({ length: ENT(ch.barricas) + ENT(ch.t50) }, () => ch.lote) : [];
  const paginas = Math.max(Math.ceil(filas.length / FILAS_PLANILLA), Math.ceil(llenar.length / FILAS_PLANILLA), 1);
  return Array.from({ length: paginas }, (_, ip) => {
    const base = ip * FILAS_PLANILLA;
    const vac = Array.from({ length: FILAS_PLANILLA }, (_, i) => {
      const b = filas[base + i];
      return b
        ? `<tr><td>${base + i + 1}</td><td>${esc(b.lote)}</td><td>${esc(b.num)}</td><td>${esc(fmtL(b.cap))}</td>` +
          `<td>${esc(b.anio)}</td><td>${esc(b.marca)}</td><td>${esc(b.origen)}</td><td>${esc(b.trat)}</td></tr>`
        : filaBlanca(base + i + 1);
    }).join('');
    const lle = Array.from({ length: FILAS_PLANILLA }, (_, i) => llenar[base + i] === undefined
      ? filaBlanca(base + i + 1)
      : `<tr><td>${base + i + 1}</td><td>${esc(llenar[base + i])}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('');
    return planillaHoja(ot, vac, lle, lotesTxt, ch ? ch.lote : '');
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
  // Corte + achique a barricas/T50: los rotulos son del lote de las chicas.
  // Cada barril lleva DOS rótulos iguales, uno al lado del otro, como el Excel.
  const tanque = origenTanque(ot.plantilla);
  const ch = destinoChicas(ot);
  const fuentes = ch
    ? [{ lote: ch.lote, id_texto: (ot.lote_corte && ot.lote_corte.id_texto) || '', n: Math.max(ENT(ch.barricas) + ENT(ch.t50), 1) }]
    : ot.lotes.map(l => ({ lote: l.lote, id_texto: l.id_texto, n: tanque ? aLlenar(l) : Math.max(l.barriles.length, 1) }));
  const pares = fuentes.flatMap(f => {
    const qr = qrLote(f.lote);
    return Array.from({ length: f.n }, (_, i) => {
      const r = `<div class="ot-rotulo"><div class="ot-rot-lote">${esc(f.lote)}</div>` +
        `<div class="ot-rot-qr">${qr}</div>` +
        `<div class="ot-rot-id">${esc(f.id_texto || '')}</div><div class="ot-rot-n">${i + 1}</div></div>`;
      return `<div class="ot-rot-par">${r}${r}</div>`;
    });
  });
  return trozos(pares, PARES_POR_HOJA)
    .map(pag => `<div class="orden-hoja ot-rotulos">${pag.join('')}</div>`).join('');
}

export function hojasOT(ot, opciones){
  // Una plantilla de una sola hoja (el corte) nunca imprime las otras, aunque
  // se las pidan.
  const deja = new Set(hojasDePlantilla(ot.plantilla, ot));
  const o = { ot: true, planilla: true, rotulos: true, ...(opciones || {}) };
  for (const k of ['ot', 'planilla', 'rotulos']) if (!deja.has(k)) o[k] = false;
  return (o.ot ? hojaOT(ot) : '') + (o.planilla ? hojasPlanilla(ot) : '') + (o.rotulos ? hojaRotulos(ot) : '');
}
