/* ===== Control de Prensas — hojas de orden de trabajo (módulo puro) =====
 *
 * Las 4 hojas imprimibles de Prensas (Orden de muestras, Rellenos, Acción
 * rápida y Agregados) movidas acá desde app.js (pintarOrden, pintarRelleno,
 * pintarAccion, pintarAgrOrden) para poder armarlas sin DOM: reciben una
 * "foto" con los datos ya resueltos (nada de $('…').value ni variables
 * globales) y devuelven el HTML de las páginas .orden-hoja.
 *
 * El modo editable es BYTE A BYTE el markup de hoy (mismas clases, mismos
 * data-gi/data-f, misma paginación). El modo soloLectura es la misma hoja
 * sin <input>/<select> de celda ni título, ni la columna de borrar fila:
 * cada celda se muestra como <span class="oh-ro"> (o <div class="oh-titulo">
 * para el título), con los valores escapados.
 *
 * Los mapas de barriles pegados (imágenes) NO son parte de estos
 * renderizadores: no se guardan en la orden (mismo criterio que Lotes).
 *
 * Módulo puro (sin DOM ni nucleo.js) para poder testearlo en node. */
'use strict';

import { numeroDeNombre } from '../../lotes/js/numero-ot.js';

/* ---------- helpers de escape (iguales a los de app.js) ---------- */
const escA = v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- catálogo de tipos de Prensas ---------- */
export const TIPOS_HOJA_PRENSAS = {
  'prensas-muestras': { nombre: 'Orden de muestras', serie: 'principal', vista: 'orden', titulo: 'muestras' },
  'prensas-rellenos': { nombre: 'Rellenos', serie: 'principal', vista: 'relleno', titulo: 'rellenos' },
  'prensas-accion': { nombre: 'Acción rápida', serie: 'B', vista: 'degustacion', titulo: 'accion' },
  'prensas-agregados': { nombre: 'Agregados', serie: 'B', vista: 'agregados', titulo: 'agregados' },
};

export function esTipoHojaPrensas(tipo) {
  return Object.prototype.hasOwnProperty.call(TIPOS_HOJA_PRENSAS, tipo);
}

/* Números ya usados en la web para esa serie, leídos de ordenes_hojas[].ot
 * (espejo de numerosDeDocumento() en src/ordenes/resumen.ts, pero acá solo
 * la parte que le toca a Prensas). */
export function numerosWebPrensas(datos, serie) {
  const hojas = (datos && datos.ordenes_hojas) || [];
  const out = [];
  for (const o of hojas) {
    const t = TIPOS_HOJA_PRENSAS[o && o.tipo];
    if (!t || t.serie !== serie) continue;
    const n = numeroDeNombre(o.ot, serie);
    if (n != null) out.push(n);
  }
  return out;
}

/* ---------- valores por defecto / catálogos de los renderizadores ---------- */
export const RECIPIENTES = ['Tubo falcon', 'Botella 120 mL', 'Tubo falcon + Botella 120 mL'];
export const AGR_TIPO_LABEL = { TH2: 'TH2 (ác. tartárico)', SO2: 'SO2 (anh. sulfuroso)', Otro: 'Otro' };
export const AGR_TIPO_ORDEN = { TH2: 0, SO2: 1, Otro: 2 };
export const TITULOS_DEF = {
  muestras: 'Orden de Trabajo',
  rellenos: 'Orden de Trabajo',
  accion: 'Orden de Trabajo — Acción Rápida',
  agregados: 'Orden de Trabajo — Agregados',
};

/* Copia profunda de la "foto" de una hoja, para guardarla como orden: la foto
 * que arma app.js (fotoMuestras/fotoRellenos/…) trae las filas POR REFERENCIA
 * (los arrays vivos del editor). Si se guardara así, seguir editando la hoja
 * cambiaría en silencio el papel guardado. Son datos planos (texto/números). */
export function copiarFoto(foto) {
  return foto == null ? foto : JSON.parse(JSON.stringify(foto));
}

const ORDEN_PER_PAGE = 25;
const RELLENO_PER_PAGE = 25;
const AR_PER_PAGE = 35;
const AGR_ORD_PER_PAGE = 35;

/* Cabecera común de las hojas imprimibles. La empresa va en la franja del
 * encabezado, junto al texto RCI. */
export function ohTop() {
  return `<div class="oh-top"><span class="oh-empresa">CATENA INSTITUTE</span>` +
    `<span>ORDEN DE TRABAJO - RCI 08 - Rev. 02 &nbsp;·&nbsp; Aprobado por: Roy Urvieta &nbsp;·&nbsp; Emisión: 28/01/2013</span></div>`;
}

/* Título editable y centrado de la hoja: en modo editable, un <input> que
 * guarda en foto.titulo (data-titkey=clave); en modo soloLectura, el mismo
 * texto en un <div>. */
function ohTitulo(clave, valor, soloLectura) {
  // Una hoja guardada sin título (o vieja) no muestra "undefined": va el de fábrica.
  if (valor == null) valor = TITULOS_DEF[clave] ?? '';
  return soloLectura
    ? `<div class="oh-titulo">${esc(valor)}</div>`
    : `<input class="oh-titulo" data-titkey="${clave}" value="${escA(valor)}" title="Título editable (clic para cambiar)">`;
}

/* Convierte un texto multilínea en una lista de pasos, cada uno con su
 * casillero de check vacío para que el operario lo tilde a mano. */
export function notaConChecks(raw) {
  const lineas = (raw || '').split('\n').map(s => s.trim()).filter(s => s.length);
  if (!lineas.length) return '';
  return `<ul class="oh-checklist">` +
    lineas.map(l => `<li><span class="chk"></span><span class="txt">${esc(l)}</span></li>`).join('') +
    `</ul>`;
}

function fmtFecha(fechaISO) {
  const iso = fechaISO || '';
  const p = iso.split('-');
  const fechaTxt = p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
  const anio = p.length === 3 ? p[0] : '';
  return { fechaTxt, anio };
}

/* ===================== ORDEN DE MUESTRAS ===================== */
function filaMuestrasHTML(r, gi, soloLectura) {
  if (soloLectura) {
    return `<tr>` +
      `<td class="c oh-num">${gi + 1}</td>` +
      `<td class="c"><span class="oh-ro">${esc(r.lote == null ? '' : r.lote)}</span></td>` +
      `<td><span class="oh-ro">${esc(r.variedad || '')}</span></td>` +
      `<td><span class="oh-ro">${esc(r.vasija || '')}</span></td>` +
      `<td class="c"><span class="oh-ro">${esc(r.cant || '')}</span></td>` +
      `<td><span class="oh-ro">${esc(r.recipiente || '')}</span></td>` +
      `<td class="oh-check"></td>` +
    `</tr>`;
  }
  return `<tr>` +
    `<td class="c oh-num">${gi + 1}</td>` +
    `<td class="c"><input class="ord-cell" data-gi="${gi}" data-f="lote" value="${escA(r.lote == null ? '' : r.lote)}"></td>` +
    `<td><input class="ord-cell" data-gi="${gi}" data-f="variedad" value="${escA(r.variedad || '')}"></td>` +
    `<td><input class="ord-cell" data-gi="${gi}" data-f="vasija" value="${escA(r.vasija || '')}"></td>` +
    `<td class="c"><input class="ord-cell c" data-gi="${gi}" data-f="cant" value="${escA(r.cant || '')}" style="text-align:center"></td>` +
    `<td><select class="ord-cell" data-gi="${gi}" data-f="recipiente">${RECIPIENTES.map(x => `<option ${x === r.recipiente ? 'selected' : ''}>${x}</option>`).join('')}</select></td>` +
    `<td class="oh-check"></td>` +
    `<td class="delcol c"><button class="delrow" data-delrow="${gi}" title="Eliminar fila">✕</button></td>` +
  `</tr>`;
}

export function htmlHojaMuestras(foto, { soloLectura = false } = {}) {
  const f = foto || {};
  const filas = f.filas || [];
  const { fechaTxt, anio } = fmtFecha(f.fecha);
  const nro = esc(f.nro || ''), dia = esc(f.dia || ''), recibio = esc(f.recibio || '');
  const pages = Math.max(1, Math.ceil(filas.length / ORDEN_PER_PAGE));
  const colgroup = soloLectura
    ? `<colgroup><col style="width:32px"><col style="width:62px"><col><col style="width:72px"><col style="width:46px"><col style="width:232px"><col style="width:46px"></colgroup>`
    : `<colgroup><col style="width:32px"><col style="width:62px"><col><col style="width:72px"><col style="width:46px"><col style="width:232px"><col style="width:46px"><col style="width:28px"></colgroup>`;
  const theadCols = `<th class="c oh-num">#</th><th class="c">LOTE</th><th>VARIEDAD</th><th>VASIJA</th><th class="c">Cant.</th><th>Recipiente</th><th class="oh-check">Check</th>` +
    (soloLectura ? '' : `<th class="delcol"></th>`);
  const colspan = soloLectura ? 7 : 8;
  let html = '';
  for (let pg = 0; pg < pages; pg++) {
    const start = pg * ORDEN_PER_PAGE, slice = filas.slice(start, start + ORDEN_PER_PAGE);
    const cuerpo = slice.map((r, i) => filaMuestrasHTML(r, start + i, soloLectura)).join('');
    html += `<div class="orden-hoja">` +
      ohTop() +
      ohTitulo('muestras', f.titulo, soloLectura) +
      `<div class="oh-meta"><span><b>Fecha:</b> ${fechaTxt}</span><span>${anio}</span><span><b>N° de Orden:</b> ${nro}</span></div>` +
      `<div class="oh-banda"><span>MUESTRAS</span><span>${dia}</span><span>Lab CIW + Degustación</span></div>` +
      `<div class="oh-nota">Tomar muestra en un tubo falcon y luego sanitizar jeringa para cada lote.</div>` +
      `<table>${colgroup}<thead><tr>${theadCols}</tr></thead>` +
      `<tbody>${cuerpo || `<tr><td colspan="${colspan}" class="c" style="padding:18px">No hay lotes para los criterios elegidos.</td></tr>`}</tbody></table>` +
      `<div class="oh-pie"><div class="firma"><b>Emitió:</b> Marcelo &nbsp;&nbsp; Firma:</div><div class="firma"><b>Recibió:</b> ${recibio} &nbsp;&nbsp; Firma:</div></div>` +
      `<div class="oh-hoja-num">Hoja ${pg + 1} de ${pages}</div>` +
    `</div>`;
  }
  return html;
}

/* ===================== RELLENOS ===================== */
function filaRellenoHTML(r, gi, soloLectura) {
  if (soloLectura) {
    return `<tr>` +
      `<td class="c oh-num">${gi + 1}</td>` +
      `<td class="oh-check"></td>` +
      `<td class="c"><span class="oh-ro">${esc(r.lote == null ? '' : r.lote)}</span></td>` +
      `<td><span class="oh-ro">${esc(r.vasija || '')}</span></td>` +
      `<td class="c"><span class="oh-ro">${esc(r.cant || '')}</span></td>` +
      `<td class="c"><span class="oh-ro">${esc(r.rellenarCon || '')}</span></td>` +
    `</tr>`;
  }
  return `<tr>` +
    `<td class="c oh-num">${gi + 1}</td>` +
    `<td class="oh-check"></td>` +
    `<td class="c"><input class="rel-cell" data-gi="${gi}" data-f="lote" value="${escA(r.lote == null ? '' : r.lote)}"></td>` +
    `<td><input class="rel-cell" data-gi="${gi}" data-f="vasija" value="${escA(r.vasija || '')}"></td>` +
    `<td class="c"><input class="rel-cell c" data-gi="${gi}" data-f="cant" value="${escA(r.cant || '')}" style="text-align:center"></td>` +
    `<td class="c"><input class="rel-cell c" data-gi="${gi}" data-f="rellenarCon" value="${escA(r.rellenarCon || '')}" style="text-align:center"></td>` +
    `<td class="delcol c"><button class="delrow" data-delrow="${gi}" title="Eliminar fila">✕</button></td>` +
  `</tr>`;
}

export function htmlHojaRellenos(foto, { soloLectura = false } = {}) {
  const f = foto || {};
  const filas = f.filas || [];
  const { fechaTxt, anio } = fmtFecha(f.fecha);
  const nro = esc(f.nro || ''), dia = esc(f.dia || ''),
    emitio = esc(f.emitio || ''), recibio = esc(f.recibio || '');
  const instr = notaConChecks(f.instrucciones || ''), pie = notaConChecks(f.pie || '');
  const pages = Math.max(1, Math.ceil(filas.length / RELLENO_PER_PAGE));
  const theadCols = `<th class="c oh-num">#</th><th class="oh-check">Check</th><th class="c">LOTE</th><th>VASIJA</th><th class="c">Cant.</th><th class="c">Rellenar con</th>` +
    (soloLectura ? '' : `<th class="delcol"></th>`);
  const colspan = soloLectura ? 6 : 7;
  let html = '';
  for (let pg = 0; pg < pages; pg++) {
    const start = pg * RELLENO_PER_PAGE, slice = filas.slice(start, start + RELLENO_PER_PAGE);
    const cuerpo = slice.map((r, i) => filaRellenoHTML(r, start + i, soloLectura)).join('');
    html += `<div class="orden-hoja">` +
      ohTop() +
      ohTitulo('rellenos', f.titulo, soloLectura) +
      `<div class="oh-meta"><span><b>Fecha:</b> ${fechaTxt}</span><span>${anio}</span><span><b>N° de Orden:</b> ${nro}</span></div>` +
      `<div class="oh-banda"><span>RELLENOS</span><span>${dia}</span><span>Lab CIW + Degustación</span></div>` +
      `<div class="oh-nota">${instr}</div>` +
      `<table><thead><tr>${theadCols}</tr></thead>` +
      `<tbody>${cuerpo || `<tr><td colspan="${colspan}" class="c" style="padding:18px">No hay lotes para los criterios elegidos.</td></tr>`}</tbody></table>` +
      `<div class="oh-nota">${pie}</div>` +
      `<div class="oh-pie"><div class="firma"><b>Emitió:</b> ${emitio} &nbsp;&nbsp; Firma:</div><div class="firma"><b>Recibió:</b> ${recibio} &nbsp;&nbsp; Firma:</div></div>` +
      `<div class="oh-hoja-num">Hoja ${pg + 1} de ${pages}</div>` +
    `</div>`;
  }
  return html;
}

/* ===================== ACCIÓN RÁPIDA ===================== */
function filaAccionHTML(r, gi, soloLectura) {
  if (soloLectura) {
    return `<tr>` +
      `<td class="c oh-check"></td>` +
      `<td class="c"><span class="oh-ro">${esc(r.lote == null ? '' : r.lote)}</span></td>` +
      `<td class="c"><span class="oh-ro">${esc(r.anio || '')}</span></td>` +
      `<td><span class="oh-ro">${esc(r.vasija || '')}</span></td>` +
      `<td class="c"><span class="oh-ro">${esc(r.recip || '')}</span></td>` +
      `<td><span class="oh-ro">${esc(r.sol || '')}</span></td>` +
      `<td class="c"><span class="oh-ro">${esc(r.ml || '')}</span></td>` +
    `</tr>`;
  }
  return `<tr>` +
    `<td class="c oh-check"></td>` +
    `<td class="c"><input class="ar-cell c" data-gi="${gi}" data-f="lote" value="${escA(r.lote == null ? '' : r.lote)}" style="text-align:center"></td>` +
    `<td class="c"><input class="ar-cell c" data-gi="${gi}" data-f="anio" value="${escA(r.anio || '')}" style="text-align:center"></td>` +
    `<td><input class="ar-cell" data-gi="${gi}" data-f="vasija" value="${escA(r.vasija || '')}"></td>` +
    `<td class="c"><input class="ar-cell c" data-gi="${gi}" data-f="recip" value="${escA(r.recip || '')}" style="text-align:center"></td>` +
    `<td><input class="ar-cell" data-gi="${gi}" data-f="sol" value="${escA(r.sol || '')}"></td>` +
    `<td class="c"><input class="ar-cell c" data-gi="${gi}" data-f="ml" value="${escA(r.ml || '')}" style="text-align:center"></td>` +
    `<td class="delcol c"><button class="delrow" data-ardel="${gi}" title="Eliminar fila">✕</button></td>` +
  `</tr>`;
}

export function htmlHojaAccion(foto, { soloLectura = false } = {}) {
  const f = foto || {};
  const filas = f.filas || [];
  const { fechaTxt, anio } = fmtFecha(f.fecha);
  const nro = esc(f.nro || ''), dens = esc(f.densidad || ''), emitio = esc(f.emitio || ''), recibio = esc(f.recibio || '');
  const ml = esc(f.ml || '');
  const pages = Math.max(1, Math.ceil(filas.length / AR_PER_PAGE));
  const theadCols = `<th class="c oh-check">Check</th><th class="c">Lote</th><th class="c">Año</th><th>N° vasija</th><th class="c">Cant. recipientes</th><th>P - MBK - Sol1030</th><th class="c">mL por vasija</th>` +
    (soloLectura ? '' : `<th class="delcol"></th>`);
  const colspan = soloLectura ? 7 : 8;
  let html = '';
  for (let pg = 0; pg < pages; pg++) {
    const start = pg * AR_PER_PAGE, slice = filas.slice(start, start + AR_PER_PAGE);
    const cuerpo = slice.map((r, i) => filaAccionHTML(r, start + i, soloLectura)).join('');
    html += `<div class="orden-hoja">` +
      ohTop() +
      ohTitulo('accion', f.titulo, soloLectura) +
      `<div class="oh-meta"><span><b>Fecha:</b> ${fechaTxt}</span><span>${anio}</span><span><b>N° de Orden:</b> ${nro}</span></div>` +
      `<div class="oh-banda"><span>CORRECCIÓN DE ANHÍDRIDO SULFUROSO</span></div>` +
      `<div class="oh-nota">Por cada barril/vasija agregar <b>${ml} mL de Solución 1.030</b>. Chequear el valor de la solución con DMA: si es menor a 1,028 concentrar, si es mayor a 1,032 diluir. Homogeneizar. &nbsp;&nbsp;<b>Densidad:</b> ${dens || '____________'} (completar)</div>` +
      `<table><thead><tr>${theadCols}</tr></thead>` +
      `<tbody>${cuerpo || `<tr><td colspan="${colspan}" class="c" style="padding:18px">No hay lotes NO OK en la degustación del mes.</td></tr>`}</tbody></table>` +
      `<div class="oh-pie"><div class="firma"><b>Emitió:</b> ${emitio} &nbsp;&nbsp; Firma:</div><div class="firma"><b>Recibió:</b> ${recibio} &nbsp;&nbsp; Firma:</div></div>` +
      `<div class="oh-hoja-num">Hoja ${pg + 1} de ${pages}</div>` +
    `</div>`;
  }
  return html;
}

/* ===================== AGREGADOS ===================== */
function filaAgregadosHTML(r, gi, soloLectura) {
  if (soloLectura) {
    return `<tr>` +
      `<td class="c oh-check"></td>` +
      `<td class="c"><span class="oh-ro">${esc(r.lote)}</span></td>` +
      `<td><span class="oh-ro">${esc(r.variedad)}</span></td>` +
      `<td class="c"><span class="oh-ro">${esc(r.cantidad)}</span></td>` +
      `<td class="c"><span class="oh-ro">${esc(r.unidad)}</span></td>` +
      `<td><span class="oh-ro">${esc(r.obs)}</span></td>` +
    `</tr>`;
  }
  return `<tr>` +
    `<td class="c oh-check"></td>` +
    `<td class="c"><input class="agr-ord-cell c" data-gi="${gi}" data-f="lote" value="${escA(r.lote)}" style="text-align:center"></td>` +
    `<td><input class="agr-ord-cell" data-gi="${gi}" data-f="variedad" value="${escA(r.variedad)}"></td>` +
    `<td class="c"><input class="agr-ord-cell c" data-gi="${gi}" data-f="cantidad" value="${escA(r.cantidad)}" style="text-align:center"></td>` +
    `<td class="c"><input class="agr-ord-cell c" data-gi="${gi}" data-f="unidad" value="${escA(r.unidad)}" style="text-align:center"></td>` +
    `<td><input class="agr-ord-cell" data-gi="${gi}" data-f="obs" value="${escA(r.obs)}"></td>` +
    `<td class="delcol c"><button class="delrow" data-agrorddel="${gi}" title="Eliminar fila">✕</button></td>` +
  `</tr>`;
}

export function htmlHojaAgregados(foto, { soloLectura = false } = {}) {
  const f = foto || {};
  const filas = f.filas || [];
  const { fechaTxt } = fmtFecha(f.fecha);
  const nro = esc(f.nro || ''), emitio = esc(f.emitio || ''), recibio = esc(f.recibio || '');
  const theadCols = `<th class="c oh-check">Check</th><th class="c">Lote</th><th>Variedad</th><th class="c">Cantidad</th><th class="c">Unidad</th><th>Observaciones</th>` +
    (soloLectura ? '' : `<th class="delcol"></th>`);
  const thead = `<thead><tr>${theadCols}</tr></thead>`;
  const colspan = soloLectura ? 6 : 7;
  const pages = Math.max(1, Math.ceil(filas.length / AGR_ORD_PER_PAGE));
  let html = '';
  for (let pg = 0; pg < pages; pg++) {
    const start = pg * AGR_ORD_PER_PAGE, slice = filas.slice(start, start + AGR_ORD_PER_PAGE);
    let cuerpo = '';
    if (!slice.length) {
      cuerpo = `<table>${thead}<tbody><tr><td colspan="${colspan}" class="c" style="padding:18px">Agregá lotes con el formulario de arriba, pegá una lista, o usá "Agregar filtrados".</td></tr></tbody></table>`;
    } else {
      let lastTipo = null, filasHtml = '';
      slice.forEach((r, i) => {
        const gi = start + i;
        if (r.tipo !== lastTipo) {
          if (filasHtml) { cuerpo += `<table>${thead}<tbody>${filasHtml}</tbody></table>`; filasHtml = ''; }
          cuerpo += `<div class="oh-banda"><span>${esc(AGR_TIPO_LABEL[r.tipo] || r.tipo)}</span></div>`;
          lastTipo = r.tipo;
        }
        filasHtml += filaAgregadosHTML(r, gi, soloLectura);
      });
      if (filasHtml) cuerpo += `<table>${thead}<tbody>${filasHtml}</tbody></table>`;
    }
    html += `<div class="orden-hoja">` +
      ohTop() +
      ohTitulo('agregados', f.titulo, soloLectura) +
      `<div class="oh-meta"><span><b>Fecha:</b> ${fechaTxt}</span><span><b>N° de Orden:</b> ${nro}</span></div>` +
      cuerpo +
      `<div class="oh-pie"><div class="firma"><b>Emitió:</b> ${emitio} &nbsp;&nbsp; Firma:</div><div class="firma"><b>Recibió:</b> ${recibio} &nbsp;&nbsp; Firma:</div></div>` +
      `<div class="oh-hoja-num">Hoja ${pg + 1} de ${pages}</div>` +
    `</div>`;
  }
  return html;
}
