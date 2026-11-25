/* ===== Lotes CIW — pestana Orden de muestras ===== */
'use strict';

import { $, esc, escA, num, DATOS, dashData, dashLoading, cargarDashboard,
         registrarVista, markDirty, guardar, mostrarTab, usuarioActual } from './nucleo.js';
import { clasificarLote, pasaFuente, pasaBusqueda, tiposDeVasija,
         datosDeLote, claveLote, parsearListaLotes, lotesDeRonda } from './orden-filas.js';
import { pasaMulti, opcionesValores, matchValor, initFiltrosMulti,
         limpiarFiltrosMulti, cmpValores, normVal, setF } from './tabla.js';
import { hojaSoloLectura } from './hoja-solo-lectura.js';
import { pintarHojas, hojaTop, hojaMetaEditable, hojaBanda } from './orden-hoja.js';
import { cfgHojasAnalisis, pegarLotesDesde, cantidadValida } from './orden-hoja-filas.js';
import { hoyLocalISO, diaDeSemana } from './hoja-campos.js';
import { sortearOrden, registrosDeImpresion, sortearFila, opcionesBarril,
         avisoBarril, barrilesLlenos, vecesPorLote, expandirPorBarril,
         colapsarPorLote } from './sorteo-barriles.js';
import { resumenOrden } from './orden-resumen.js';
import { textosMicro, cfgHojasMicro } from './orden-micro.js';
import { proponerNumero, chipCarpeta, cablearChipsCarpeta, imprimirYGuardar } from './guardar-ot.js';
import { avisar } from './dialogos.js';
import { armarOrdenHoja, ordenHojaPorId } from './ordenes-hojas.js';
import { htmlCabeceraOrden, cablearCabeceraOrden, guardarOrdenHojaConfirmando } from './vista-orden-guardada.js';
import { fotoOrdenMuestras, cfgDeHojaGuardada } from './orden-foto.js';

/* La foto que se guarda al imprimir es pura (orden-foto.js, testeable sin DOM). */
export { fotoOrdenMuestras };

/*
 * _otRows: array de objetos { lote, variedad, vasija, barril, litros, motivo, recipiente, cantidad }
 * barril = el que sorteo el dado (o se tipeo a mano); '' si no hay.
 * Vive solo en memoria: NO se persiste en DATOS, NO se llama markDirty.
 */
let _otRows       = [];
let _otFuente     = 'vencidos_proximos';  // valor inicial del select
let _otAtencionTipo = 'todos';            // criterio granular, solo aplica si _otFuente==='atencion'
/* Un Set por columna filtrable, creados UNA vez: los widgets guardan estas
 * mismas referencias, asi que el estado sobrevive a los re-render. */
const filtOt = { lote: setF('orden', 'lote'), variedad: setF('orden', 'variedad'),
                 proyecto: setF('orden', 'proyecto'), etapa: setF('orden', 'etapa'),
                 vasija: setF('orden', 'vasija') };
/* El buscador sobrevive al F5 en esta pestaña (shared/filtros-sesion.js). El modo
 * barril NO: volver con el arranca de cero los barriles y perderia el sorteo. */
const _FS = typeof window !== 'undefined' && window.CIWFiltros;
const _lf = (k, d) => _FS ? _FS.leer('lotes:orden:' + k, d) : d;
const _gf = (k, v) => { if (_FS) _FS.guardar('lotes:orden:' + k, v); };
let _otBusqueda = (v => typeof v === 'string' ? v : '')(_lf('busca', ''));  // buscador de texto libre de la barra
let _descOt = [], _instOt = [];
let _otRecipiente = 'Tubo falcon';
let _otCantidad   = 1;
let _otTitulo     = 'Orden de Trabajo';   // titulo editable de la hoja, sincronizado entre paginas
/* Datos del encabezado y las firmas, editados SOBRE la hoja (vista previa
 * editable, ver hoja-campos.js). En memoria, como el resto de la orden. */
const _otHoja = { nro: '', fecha: hoyLocalISO(), dia: diaDeSemana(hoyLocalISO()), emitio: '', recibio: '' };
/* El N° se propone (carpeta de OT) una sola vez: si el usuario lo borra a
 * proposito, no se vuelve a llenar solo. _otNroUltimo = el ultimo propuesto,
 * para re-proponer al conectar la carpeta solo si nadie lo cambio. */
let _otNroPropuesto = false;
let _otNroUltimo    = '';
/* Barriles especificos: con _otModoBarril la hoja muestra la columna Barril
 * con un desplegable por fila (los llenos del lote) y un 🎲 por fila. Sin el,
 * la orden sale generica, como siempre: sin columna. _otPorLote guarda lo que
 * devolvio el Mapa por lote (solo lectura) y se vuelve a pedir al activar el
 * modo o tirar el dado general, para no trabajar con un Mapa viejo. */
let _otModoBarril = false;
let _otPorLote    = {};
const _otPedidos  = new Set();             // lotes ya pedidos al Mapa (aunque fallen)
let _otMapas      = [];                   // {src,nombre,pie} -- imagenes de sesion, nunca se guardan
let _otPegado     = '';                   // texto del recuadro "Pegar lotes", sobrevive al re-render

/* Tipo de orden, elegido con el selector de la cabecera:
 *   'analisis' = la orden de muestras de siempre (Lab CIW + Degustacion);
 *   'micro'    = OT de microbiologia, formato del Excel 0868 (orden-micro.js):
 *                papel # / Check / Lote / Vasija + hoja de cartel para la caja.
 * Las filas son las mismas: cambiar de tipo no pierde los lotes cargados. */
let _otTipo = 'analisis';
const _esMicro = () => _otTipo === 'micro';

/* Textos editables de la orden de micro y del cartel. Se recuerdan en ESTE
 * navegador (quien emite suele ser siempre la misma persona en la misma PC). */
const LS_MICRO = 'lotes_orden_micro_textos';
let _otMicro = (() => {
  try { return textosMicro(JSON.parse(localStorage.getItem(LS_MICRO) || 'null')); }
  catch (e) { return textosMicro(null); }
})();
function _microGuardar(){
  try { localStorage.setItem(LS_MICRO, JSON.stringify(_otMicro)); } catch (e) {}
}

/* Lista de recipientes validos. Unico lugar: antes vivia repetida como
 * literal en dos puntos del archivo (la fila y el select por defecto). */
const RECIPIENTES_OT = ['Tubo falcon', 'Botella 120 mL'];

/* Recipientes escritos a mano con "✎ Otro…": se suman a la lista y se
 * recuerdan en ESTE navegador (comodidad por PC, no dato compartido: la orden
 * es efimera y el papel lleva el texto tal cual). */
const OTRO_REC = '__otro__';
const LS_REC = 'lotes_recipientes_extra';
let _otRecExtra = (() => {
  try { const v = JSON.parse(localStorage.getItem(LS_REC) || '[]'); return Array.isArray(v) ? v.map(String) : []; }
  catch (e) { return []; }
})();
const _recLista = () => RECIPIENTES_OT.concat(_otRecExtra);

/* Devuelve el nombre canonico: si ya existe (sin importar mayusculas) usa ese;
 * si no, lo suma a la lista. '' si vino vacio. */
function _recSumar(nombre){
  const v = String(nombre ?? '').trim();
  if (!v) return '';
  const ya = _recLista().find(r => r.toLowerCase() === v.toLowerCase());
  if (ya) return ya;
  _otRecExtra.push(v);
  try { localStorage.setItem(LS_REC, JSON.stringify(_otRecExtra)); } catch (e) {}
  /* que aparezca ya en el selector por defecto, sin esperar un re-render */
  const def = $('otDefRecipiente');
  if (def) def.innerHTML = _recOpciones(_otRecipiente);
  return v;
}

/* <option>s de un selector de recipiente: la lista, el valor actual si no esta
 * en ella, y al final "✎ Otro…" para escribir uno nuevo. */
function _recOpciones(actual){
  const lista = _recLista();
  if (actual && !lista.includes(actual)) lista.push(actual);
  return lista.map(v => `<option value="${escA(v)}"${v === actual ? ' selected' : ''}>${esc(v)}</option>`).join('') +
    `<option value="${OTRO_REC}">✎ Otro…</option>`;
}
/* Construye _otRows a partir de la fuente elegida */
function _otBuildRows(){
  if (!dashData()) return [];

  /* mapa lote -> DATOS.lotes para vasija y litros */
  const loteMap = new Map();
  for (const l of (DATOS().lotes || [])){
    loteMap.set(String(l.lote ?? ''), l);
  }

  const fuente = _otFuente;

  /* La ronda de tanques sale de TODOS los lotes con vino en tanque, de todos
   * los años: el tablero solo trae los años del selector (lotesDeRonda). */
  let lotes = (fuente === 'ronda_tanques' ? lotesDeRonda(DATOS().lotes, dashData().lotes) : (dashData().lotes || []))
    .filter(l => pasaMulti(l, _descOt));

  if (fuente === 'hoja_en_blanco'){
    /* Hoja en blanco no trae nada POR SI SOLA, pero si se eligen lotes (o una
     * variedad, un proyecto...) en los filtros, esos entran: es la forma de
     * sumar lotes a la hoja sin tipearlos. Antes devolvia [] siempre y el
     * filtro "Lote (4)" no hacia nada. */
    if (!_descOt.some(d => d.set.size)) return [];
  } else {
    /* El segundo argumento es el lote completo: la fila del dashboard no trae
     * los envases y sin el no se puede resolver la ronda de tanques. */
    lotes = lotes.filter(l => pasaFuente(
      clasificarLote(l, loteMap.get(String(l.lote ?? ''))), fuente, _otAtencionTipo));
  }

  /* ordenar por número de lote */
  lotes = [...lotes].sort((a, b) => {
    const na = parseFloat(String(a.lote ?? ''));
    const nb = parseFloat(String(b.lote ?? ''));
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a.lote ?? '').localeCompare(String(b.lote ?? ''), 'es');
  });

  /* El buscador se aplica DESPUES del map, no antes: mira vasija y motivo, que
   * no existen en la fila del dashboard -- recien aparecen al armar la fila. */
  return lotes.map(l => ({
    lote:       String(l.lote ?? ''),
    ...datosDeLote(l, loteMap.get(String(l.lote ?? '')), fuente),
    recipiente: _otRecipiente,
    cantidad:   _otCantidad,
  })).filter(r => pasaBusqueda(r, _otBusqueda));
}

/* Completa variedad/vasija/litros/motivo de una fila a partir de su numero de
 * lote. Se llama cuando el lote se tipea o se pega a mano (tipicamente en
 * "Hoja en blanco"). Si el lote no existe, la fila conserva lo que tenia y la
 * celda se marca en rojo. */
function _otAutocompletar(r){
  const k = claveLote(r.lote);
  r.lote = k;
  r.noEncontrado = false;
  r.barril = '';   // el barril sorteado era del lote anterior
  if (k === ''){ r.variedad = r.vasija = r.litros = r.motivo = ''; return; }
  const info = (DATOS().lotes || []).find(l => claveLote(l.lote) === k);
  const dash = ((dashData() && dashData().lotes) || []).find(l => claveLote(l.lote) === k);
  if (!info && !dash){ r.noEncontrado = true; return; }
  Object.assign(r, datosDeLote(dash, info, _otFuente));
}

/* Pinta #otPaginas: la hoja de papel ES la pantalla (no hay grilla). 50
 * filas por hoja, mas una hoja por cada mapa de barriles adjunto. Todo lo
 * editable son campos sobre la hoja: los del encabezado (data-campo,
 * hoja-campos.js) y las celdas de cada fila (data-fila/data-col,
 * orden-hoja-filas.js). Es la unica seccion visible al imprimir. */
function _otPintarPaginas(){
  const cont = $('otPaginas');
  if (!cont) return;

  const { nro, fecha, dia, emitio, recibio } = _otHoja;
  const meta = { fecha, anio: String(fecha || '').slice(0, 4), nro };
  const campoDia = { campo: 'dia', valor: dia, ph: 'día' };
  const banda = ['MUESTRAS', campoDia, 'Lab CIW + Degustación'];

  /* sugerencias de recipiente para la celda (lista + los escritos a mano) */
  const dl = $('otRecLista');
  if (dl) dl.innerHTML = _recLista().map(v => `<option value="${escA(v)}"></option>`).join('');

  if (_esMicro()){
    /* Microbiologia: otro papel (orden-micro.js), mismo encabezado RCI 08.
     * Los mapas no se ofrecen en este modo, asi que no se suman. */
    cont.innerHTML = pintarHojas(cfgHojasMicro({
      filas: _otRows, textos: _otMicro, titulo: _otTitulo, meta, dia, emitio, recibio,
    }));
    return;
  }

  const hojasMapas = _otMapas.map((m, i) => {
    const sufijo = _otMapas.length > 1 ? ` (${i + 1} de ${_otMapas.length})` : '';
    return `<div class="orden-hoja oh-mapa">` +
      hojaTop() +
      `<div class="oh-titulo">Mapa de barriles${sufijo}</div>` +
      hojaMetaEditable(meta) +
      hojaBanda(banda) +
      `<img class="oh-mapa-img" src="${m.src}" alt="Mapa de barriles">` +
      `<input class="oh-mapa-pie" data-mapapieot="${i}" value="${escA(m.pie || '')}" placeholder="Escribí una descripción de la imagen…">` +
    `</div>`;
  });

  _otPintarListasBarril();
  const cfg = cfgHojasAnalisis({
    filas: _otRows, titulo: _otTitulo, meta, banda, emitio, recibio,
    hojasExtra: hojasMapas, listaRecipientes: 'otRecLista',
    modoBarril: _otModoBarril, barrilInfo: _otBarrilInfo,
  });
  const sinSorteo = $('btnOtSinSorteo');
  if (sinSorteo) sinSorteo.style.display = cfg.columnas === 8 ? '' : 'none';
  const elegir = $('btnOtBarrilElegir');
  if (elegir) elegir.style.display = cfg.columnas === 8 ? 'none' : '';
  cont.innerHTML = pintarHojas(cfg);
}

/* id del <datalist> con los barriles llenos de un lote */
const _otIdLista = lote => 'otBarr-' + String(lote).replace(/[^\w-]/g, '_');

/* Lo que la celda Barril de una fila necesita saber del Mapa (orden-hoja-filas.js). */
function _otBarrilInfo(r){
  const lote = claveLote(r.lote);
  const bs = _otPorLote[lote];
  if (!lote || !Array.isArray(bs)) return {};
  const hay = barrilesLlenos(bs).length > 0;
  return {
    lista: hay ? _otIdLista(lote) : '',
    ph: hay ? (_otModoBarril ? 'elegí…' : '') : 'sin barriles',
    aviso: avisoBarril(lote, r.barril, bs),
  };
}

/* Un <datalist> por lote de la orden: el desplegable de la celda Barril.
 * Cada opcion dice cuantas veces se muestreo ese barril. Vive fuera de
 * #otPaginas, asi no se imprime. */
function _otPintarListasBarril(){
  const cont = $('otBarrListas');
  if (!cont) return;
  if (!_otModoBarril){ cont.innerHTML = ''; return; }
  const veces = vecesPorLote(DATOS().muestreos_barriles || []);
  const lotes = [...new Set(_otRows.map(r => claveLote(r.lote)).filter(k => k !== ''))];
  cont.innerHTML = lotes.filter(l => Array.isArray(_otPorLote[l])).map(l =>
    `<datalist id="${escA(_otIdLista(l))}">` +
    opcionesBarril(_otPorLote[l], veces[l]).map(o =>
      `<option value="${escA(o.num)}">${o.veces ? `muestreado ${o.veces} ${o.veces === 1 ? 'vez' : 'veces'}` : 'nunca muestreado'}</option>`).join('') +
    `</datalist>`).join('');
}

/* Trae del Mapa los barriles de los lotes que falten (todos si fresco=true).
 * Devuelve false si el Mapa no respondio. */
async function _otCargarBarriles(fresco = false){
  const lotes = [...new Set(_otRows.map(r => claveLote(r.lote)).filter(k => k !== ''))]
    .filter(l => fresco || !_otPedidos.has(l));
  if (!lotes.length) return true;
  lotes.forEach(l => _otPedidos.add(l));
  try {
    const r = await fetch(API + '/barriles?lotes=' + encodeURIComponent(lotes.join(',')));
    if (!r.ok){
      const e = await r.json().catch(() => ({}));
      _otAvisar('No pude leer el Mapa de Barriles' + (e.error ? ': ' + e.error : '.'), 'error');
      return false;
    }
    Object.assign(_otPorLote, (await r.json()).por_lote || {});
    return true;
  } catch (e){
    _otAvisar('No pude leer el Mapa de Barriles (¿sin conexión?).', 'error');
    return false;
  }
}

/* En modo barril, cada vez que entra un lote nuevo a la orden (pegado,
 * tipeado, por filtro) se piden sus barriles y se repinta. */
function _otCompletarBarriles(){
  if (!_otModoBarril || _esMicro()) return;
  const nuevos = new Set(_otRows.map(r => claveLote(r.lote)).filter(l => l && !_otPedidos.has(l)));
  if (!nuevos.size) return;
  /* el lote que entra trae TODOS sus barriles llenos, como los que ya estaban */
  _otCargarBarriles().then(() => { _otRows = expandirPorBarril(_otRows, _otPorLote, nuevos); _otRepintar(); });
}

/* Aviso visible arriba de la hoja (y en la nota del panel que lo origino):
 * los resultados del dado, del pegado y del guardado no se pierden en una
 * nota chica lejos de la hoja. tipo: 'ok' | 'aviso' | 'error'. */
function _otAvisar(texto, tipo = 'ok', nota = 'otDadoMsg'){
  const n = nota && $(nota); if (n) n.textContent = texto;
  const b = $('otAviso');
  if (!b) return;
  b.hidden = !texto;
  b.className = 'ot-aviso ot-aviso-' + tipo;
  const t = b.querySelector('.ot-aviso-t'); if (t) t.textContent = texto;
}

/* Repinta la hoja SIN perder donde estaba el cursor: si el foco estaba en una
 * celda o un campo de la hoja, lo devuelve al mismo lugar (o al que se pida). */
function _otRepintar(foco){
  const a = document.activeElement;
  const antes = foco || (a && a.closest && a.closest('#otPaginas')
    ? { fila: a.dataset.fila, col: a.dataset.col, campo: a.dataset.campo } : null);
  _otRefrescar();
  if (!antes) return;
  const hoja = $('otPaginas');
  const el = antes.campo
    ? hoja.querySelector(`[data-campo="${antes.campo}"]`)
    : hoja.querySelector(`[data-fila="${antes.fila}"][data-col="${antes.col}"]`);
  if (el){ el.focus(); if (el.select && antes.seleccionar) el.select(); }
}

const _otFilaNueva = () => ({ lote:'', variedad:'', vasija:'', litros:'', motivo:'', barril:'',
                              recipiente:_otRecipiente, cantidad:_otCantidad, manual:true });

/* Una celda de fila cambio (evento input): se guarda el texto tal cual. El
 * lote recien se resuelve al confirmarlo (change), la cantidad solo si vale. */
function _otCeldaInput(el){
  const r = _otRows[+el.dataset.fila];
  if (!r) return;
  const k = el.dataset.col;
  if (k === 'cantidad'){ const n = cantidadValida(el.value); if (n != null) r.cantidad = n; return; }
  r[k] = el.value;
  if (k === 'lote') r.manual = true;
}

/* Confirmar una celda (Enter, Tab o salir): el lote se autocompleta (y la
 * hoja se repinta: cambian variedad y vasija), la cantidad invalida vuelve a
 * la vigente, el recipiente nuevo se suma a la lista. */
function _otCeldaConfirmar(el){
  const r = _otRows[+el.dataset.fila];
  if (!r) return;
  const k = el.dataset.col;
  /* El repintado va un tick despues: el change salta ANTES de que el Tab mueva
   * el foco, y repintar ahi mismo lo mandaria a cualquier lado. Despues, el
   * foco ya esta en la celda de destino y _otRepintar lo devuelve alli. */
  if (k === 'lote'){ r.manual = true; _otAutocompletar(r); setTimeout(() => _otRepintar(), 0); return; }
  if (k === 'barril'){ r.barril = String(el.value || '').trim(); setTimeout(() => _otRepintar(), 0); return; }
  if (k === 'cantidad'){ el.value = String(r.cantidad); return; }
  if (k === 'recipiente'){ const v = _recSumar(el.value); r.recipiente = v || _otRecipiente; el.value = r.recipiente; }
}

/* Pegar en una celda de lote una columna copiada del Excel: llena hacia
 * abajo desde esa fila (creando las que falten). Un solo valor = pegado comun. */
function _otPegarEnLote(el, e){
  const texto = (e.clipboardData || window.clipboardData).getData('text');
  const lotes = parsearListaLotes(texto);
  if (lotes.length < 2) return;
  e.preventDefault();
  const { filas, tocadas } = pegarLotesDesde(_otRows, +el.dataset.fila, lotes, _otFilaNueva);
  _otRows = filas;
  for (const j of tocadas) _otAutocompletar(_otRows[j]);
  _otRepintar({ fila: tocadas[tocadas.length - 1], col: 'lote' });
}

/* Enter en una celda: baja a la misma columna de la fila siguiente, como en
 * una planilla. En la ultima fila con lote, agrega una fila nueva. */
function _otCeldaEnter(el){
  const i = +el.dataset.fila, k = el.dataset.col;
  _otCeldaConfirmar(el);
  if (i + 1 >= _otRows.length){
    if (k !== 'lote' || !String(_otRows[i]?.lote || '').trim()) return;
    _otRows.push(_otFilaNueva());
  }
  _otRepintar({ fila: i + 1, col: k, seleccionar: true });
}

/* Los tres pasos que dispara cualquier cambio de filtro. El tercero es el que
 * importa no olvidar: sin el, la hoja de papel imprimible queda desincronizada
 * de la tabla en pantalla y no se nota hasta que alguien imprime. */
function _otAplicarFiltros(){
  /* Las filas cargadas A MANO (tipeadas, pegadas o "Agregar fila") no salen de
   * la fuente, asi que rearmar desde la fuente las borraba: elegir un lote en
   * el filtro de una hoja en blanco se llevaba puesto lo que ya estaba
   * escrito. Se conservan y la fuente suma las que no estan. */
  /* Las filas de "barriles especificos" (una por barril) tampoco salen de la
   * fuente: si se rearmaran, volverian los barriles que el usuario borro. */
  const manuales = _otRows.filter(r => r.manual || r.porBarril);
  const ya = new Set(manuales.map(r => claveLote(r.lote)).filter(k => k !== ''));
  /* El barril que sorteo el dado tampoco sale de la fuente: se recuerda por
   * lote para que tocar un filtro no obligue a tirar el dado de nuevo. */
  const barrilDe = new Map(_otRows.filter(r => r.barril).map(r => [claveLote(r.lote), r.barril]));
  _otRows = manuales.concat(_otBuildRows().filter(r => !ya.has(claveLote(r.lote))));
  for (const r of _otRows) if (!r.barril && barrilDe.has(claveLote(r.lote))) r.barril = barrilDe.get(claveLote(r.lote));
  _otRefrescar();
}

/* Repinta la hoja y el contador despues de reemplazar _otRows. */
function _otRefrescar(){
  _otPintarPaginas();
  const c = $('otCount');
  if (c) c.textContent = _otRows.length + ' fila' + (_otRows.length !== 1 ? 's' : '');
  _otPintarResumen();
  _otEtiquetaImprimir();
  _otCompletarBarriles();
}

/* "De donde salen estas filas", en una linea arriba de la hoja. */
function _otPintarResumen(){
  const el = $('otResumen');
  if (!el) return;
  const sel = $('otFuente');
  const etiqueta = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '';
  const r = resumenOrden({
    filas: _otRows, fuente: _esMicro() ? 'hoja_en_blanco' : _otFuente, etiquetaFuente: etiqueta,
    filtros: _descOt.filter(d => d.set.size).map(d => d.label), busqueda: _otBusqueda,
  });
  el.innerHTML = `<span><b>${esc(r.titulo)}</b>${r.detalle ? ' · ' + esc(r.detalle) : ''}</span>` +
    (_esMicro() ? '' : '<button type="button" class="ot-res-cambiar" id="btnOtCambiarFuente">cambiar</button>');
}

/* El boton Imprimir avisa cuantos barriles va a anotar como muestreados. */
function _otEtiquetaImprimir(){
  const b = $('btnOtImprimir');
  if (!b) return;
  const n = _esMicro() ? 0 : _otRows.filter(r => claveLote(r.lote) && String(r.barril || '').trim()).length;
  b.textContent = '🖨️ Imprimir' + (n ? ` · anota ${n} barril${n !== 1 ? 'es' : ''}` : '');
  b.title = n ? `Al imprimir, estos ${n} barriles quedan anotados como muestreados y el dado no los vuelve a proponer pronto.` : '';
}

/* Recuadro "Pegar lotes": cada numero se vuelve una fila autocompletada.
 * reemplazar=true arma la orden desde cero (y pasa la fuente a "Hoja en
 * blanco", para que el select no diga "Vencidos" sobre una lista pegada);
 * false los suma al final sin repetir los que ya estan. */
function _otCargarPegados(reemplazar){
  const lotes = parsearListaLotes(_otPegado);
  const msg = $('otPegarMsg');
  if (!lotes.length){ if (msg) msg.textContent = 'No encontré números de lote en el recuadro.'; return; }

  let base = reemplazar ? [] : _otRows.filter(r => claveLote(r.lote) !== '');
  const ya = new Set(base.map(r => claveLote(r.lote)));
  const nuevas = [];
  for (const lote of lotes){
    if (ya.has(lote)) continue;
    const r = { lote, variedad:'', vasija:'', litros:'', motivo:'', recipiente:_otRecipiente, cantidad:_otCantidad, manual:true };
    _otAutocompletar(r);
    nuevas.push(r);
  }
  _otRows = base.concat(nuevas);
  if (reemplazar){
    _otFuente = 'hoja_en_blanco';
    const s = $('otFuente'); if (s) s.value = _otFuente;
    const w = $('otWrapAtencion'); if (w) w.style.display = 'none';
  }
  _otRefrescar();

  if (msg){
    const malos = nuevas.filter(r => r.noEncontrado).map(r => r.lote);
    const repetidos = lotes.length - nuevas.length;
    let t = `${nuevas.length} lote${nuevas.length !== 1 ? 's' : ''} cargado${nuevas.length !== 1 ? 's' : ''}.`;
    if (repetidos) t += ` ${repetidos} ya estaba${repetidos !== 1 ? 'n' : ''} en la orden.`;
    if (malos.length) t += ` No existe${malos.length !== 1 ? 'n' : ''}: ${malos.join(', ')} (marcado${malos.length !== 1 ? 's' : ''} en rojo).`;
    _otAvisar(t, malos.length ? 'aviso' : 'ok', 'otPegarMsg');
  }
}

/* Dado: un barril LLENO al azar por cada lote de la orden, sacado del
 * inventario del Mapa de Barriles (solo se lee, nunca se escribe). Rota: sortea
 * entre los barriles que MENOS veces se muestrearon segun
 * DATOS().muestreos_barriles, que se anota al imprimir (_otRegistrarMuestreo).
 * Tirar el dado no gasta barriles. Volver a tirar cambia el barril si el lote
 * tiene otro. Los lotes en tanque no tienen barriles en el Mapa: quedan sin
 * barril y se avisan. */
async function _otTirarDado(){
  const btn = $('btnOtDado');
  const lotes = [...new Set(_otRows.map(r => claveLote(r.lote)).filter(k => k !== ''))];
  if (!lotes.length){ _otAvisar('No hay lotes en la orden.', 'aviso'); return; }
  if (btn) btn.disabled = true;
  _otAvisar('Sorteando…');
  try {
    if (!await _otCargarBarriles(true)) return;
    /* el dado general es UN barril por lote: si estaban todos, se vuelve a uno */
    _otRows = colapsarPorLote(_otRows);
    const { sinBarril } = sortearOrden(_otRows, _otPorLote, Math.random,
                                       DATOS().muestreos_barriles || []);
    /* despues del dado general se puede corregir fila por fila */
    _otModoBarril = true;
    _otRefrescar();
    const con = lotes.length - sinBarril.length;
    let t = `🎲 ${con} barril${con !== 1 ? 'es' : ''} sorteado${con !== 1 ? 's' : ''}.`;
    if (sinBarril.length) t += ` Sin barriles llenos en el Mapa (¿en tanque?): ${sinBarril.join(', ')}.`;
    _otAvisar(t, sinBarril.length ? 'aviso' : 'ok');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* "✎ Elegir barriles especificos": abre la columna Barril vacia, con el
 * desplegable de cada lote. Lo que no se complete sale vacio en el papel. */
async function _otActivarModoBarril(){
  _otModoBarril = true;
  _otAvisar('Buscando los barriles llenos de cada lote en el Mapa…');
  if (!await _otCargarBarriles(true)){ _otRefrescar(); return; }
  _otRows = expandirPorBarril(_otRows, _otPorLote);
  _otRefrescar();
  const n = _otRows.filter(r => String(r.barril || '').trim()).length;
  const sin = [...new Set(_otRows.filter(r => claveLote(r.lote) && !String(r.barril || '').trim()).map(r => claveLote(r.lote)))];
  _otAvisar(`Están los ${n} barriles llenos de la orden, uno por fila: quitá con ✕ los que no quieras.` +
            (sin.length ? ` Sin barriles en el Mapa (¿en tanque?): ${sin.join(', ')}.` : ''), sin.length ? 'aviso' : 'ok');
}

/* 🎲 de una fila: sortea solo ese lote. */
async function _otTirarDadoFila(i){
  const r = _otRows[i];
  const lote = r && claveLote(r.lote);
  if (!lote){ _otAvisar('Esa fila no tiene lote.', 'aviso'); return; }
  if (!Array.isArray(_otPorLote[lote]) && !await _otCargarBarriles(true)) return;
  const b = sortearFila(_otRows, i, _otPorLote, Math.random, DATOS().muestreos_barriles || []);
  _otRepintar({ fila: i, col: 'barril' });
  _otAvisar(b ? `🎲 Lote ${lote}: barril ${b}.` : `El lote ${lote} no tiene barriles llenos en el Mapa (¿está en tanque?).`,
            b ? 'ok' : 'aviso');
}

/* Al imprimir, los barriles de la orden pasan a contar como muestreados: se
 * anotan en DATOS().muestreos_barriles para que la proxima orden (en esta PC o
 * en otra) no los repita. Reimprimir no cuenta doble. NO guarda: lo hace
 * _otTrasImprimir, una sola vez junto con la orden guardada. Devuelve cuantos
 * barriles anoto. */
function _otAnotarMuestreo(){
  const hist = DATOS().muestreos_barriles || [];
  const fecha = _otHoja.fecha || hoyLocalISO();
  const nuevos = registrosDeImpresion(_otRows, hist, fecha, _otHoja.nro);
  if (!nuevos.length) return 0;
  DATOS().muestreos_barriles = hist.concat(nuevos);
  markDirty();
  return nuevos.length;
}

/* Despues de imprimir: anota los barriles (solo analisis) y guarda la orden en
 * ordenes_hojas, pendiente, con la foto de lo que salio en el papel (sin los
 * mapas pegados). Un solo guardar() para las dos cosas. En modo ordenes la
 * pantalla pasa a la orden guardada (como _ocGuardarOrden en
 * vista-orden-correccion.js). */
async function _otTrasImprimir(r){
  const micro = _esMicro();
  const tipo = micro ? 'micro' : 'muestras';
  const nro = _otHoja.nro;
  const nBarr = micro ? 0 : _otAnotarMuestreo();

  const foto = fotoOrdenMuestras({
    tipo, titulo: _otTitulo, hoja: _otHoja, filas: _otRows, textosMicro: _otMicro,
    conBarril: _otModoBarril || _otRows.some(f => String(f.barril || '').trim() !== ''),
  });
  /* Una hoja en blanco (sin lotes ni vasijas: micro arranca así y se llena a
   * mano) también se guarda, con lotes: [] y filas: []: queda en Pendientes
   * y reserva el N°. */
  let id = null;
  const orden = armarOrdenHoja({
    id: 'oh-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    tipo, numero: nro, fecha: _otHoja.fecha || hoyLocalISO(),
    quien: usuarioActual(), ahora: new Date().toISOString(),
    lotes: foto.filas.map(f => f.lote), hoja: foto,
  });
  orden.pdf = { nombre: r.nombre, estado: r.guardado };
  /* Otra pendiente con el mismo N°: se pregunta antes de reemplazarla. Al
   * reemplazar, la guardada conserva el id de la anterior (res.id). */
  const res = await guardarOrdenHojaConfirmando(orden);
  if (res.ok){
    markDirty();
    id = res.id;
  } else if (res.error === 'ejecutada'){
    avisar('La orden ' + nro + ' ya está ejecutada: esta impresión no se guardó como orden nueva.', { tipo: 'mal' });
  } else if (res.error === 'pendiente'){
    avisar('Esta impresión no se guardó como orden: la ' + nro + ' pendiente quedó como estaba. Conviene imprimirla con otro N°.', { tipo: 'mal' });
  }

  let ok = true;
  if (nBarr || id){
    try { ok = await guardar(); } catch (_) { ok = false; }
  }

  const textoBarr = nBarr
    ? `${nBarr} barril${nBarr !== 1 ? 'es' : ''} anotado${nBarr !== 1 ? 's' : ''} como muestreado${nBarr !== 1 ? 's' : ''}: la próxima orden no los repite.`
    : '';

  /* Modo ordenes: la orden ya esta en DATOS (aunque guardar() diga que no
   * hubo red: quedo en el borrador local). La URL pasa a ?orden=<id>
   * (conserva volver) para que F5 la reabra, y la banda se retitula. */
  if (id && document.body.classList.contains('modo-ordenes')){
    const p = new URLSearchParams(location.search); p.set('orden', id); p.delete('lotes');
    history.replaceState(null, '', location.pathname + '?' + p.toString());
    abrirOrdenMuestrasGuardada(id);
    document.dispatchEvent(new CustomEvent('lotes:modo-orden-cambio'));
    if (ok) avisar('✓ La orden ' + nro + ' quedó pendiente. Marcala ejecutada acá cuando esté terminada.' + (textoBarr ? ' ' + textoBarr : ''));
    else avisar('La orden ' + nro + ' quedó guardada en este equipo y se va a subir sola cuando se pueda guardar.', { tipo: 'mal' });
    return;
  }

  if (!ok){
    _otAvisar('Quedó anotado en este equipo pero NO se guardó todavía: se va a guardar solo cuando vuelva la conexión (o apretá Ctrl+S).', 'error');
    return;
  }
  const partes = [];
  if (id) partes.push('✓ La orden ' + nro + ' quedó pendiente en Órdenes de trabajo' + (foto.filas.length ? '.' : ' (hoja en blanco).'));
  if (textoBarr) partes.push((id ? '' : '✓ ') + textoBarr);
  if (partes.length) _otAvisar(partes.join(' '), 'ok');
}

/* ---------- orden guardada (solo lectura) ----------
 * _guardada = id de una orden de ordenes_hojas (muestras / micro). Con el
 * puesto, renderOrden pinta solo su cabecera (estado, ejecutar, anular,
 * reimprimir) y el papel armado desde orden.hoja, sin el panel de controles
 * ni campos editables. Lo pone el modo ordenes (?orden=<id>). */
let _guardada = null;

/** Modo ordenes: Nueva · Orden de muestras / de microbiologia. */
export function abrirOrdenMuestrasNueva(tipo){
  _guardada = null;
  const t = tipo === 'micro' ? 'micro' : 'analisis';
  if (t === 'micro' && _otTipo !== 'micro'){
    /* igual que el selector de tipo: arranca en hoja en blanco sin perder filas */
    _otRows.forEach(r => { r.manual = true; });
    _otFuente = 'hoja_en_blanco';
  }
  _otTipo = t;
  mostrarTab('orden');
}

/** Modo ordenes: una orden de muestras / micro ya guardada, en solo lectura. */
export function abrirOrdenMuestrasGuardada(id){
  _guardada = id;
  mostrarTab('orden');
}

/* Reimprimir = solo papel: sin volver a guardar el PDF ni pedir numero.
 * printing-orden no se ajusta a una A4 (imprimirYGuardar tampoco lo hace:
 * ajustarHojasA4 es solo para printing-ot-mov y printing-ordencorr). */
function _otReimprimir(){
  document.body.classList.add('printing-orden');
  try { window.print(); }
  finally { document.body.classList.remove('printing-orden'); }
}

function _otPintarGuardada(sec){
  const o = ordenHojaPorId(DATOS(), _guardada);
  if (!o){
    sec.innerHTML = '<div class="msg info" style="margin-top:10px">Esta orden no existe (¿la borraron?)</div>';
    return;
  }
  const puedeEditar = ['editor', 'admin'].includes((window.CIW || {}).rol);
  /* La cabecera va en .ot-prev-cab: printing-orden ya la esconde al imprimir. */
  sec.innerHTML = `
<section class="ot-der" aria-label="Orden guardada">
  <div class="ot-prev-cab" id="otGuardadaCab">${htmlCabeceraOrden(o, { puedeEditar })}</div>
  <div id="otPaginas"></div>
</section>`;

  const cfg = cfgDeHojaGuardada(o.hoja, o.tipo, { fecha: o.fecha, nro: o.ot });
  const pag = $('otPaginas');
  pag.innerHTML = pintarHojas(cfg);
  hojaSoloLectura(pag);

  cablearCabeceraOrden($('otGuardadaCab'), o.id, { reimprimir: _otReimprimir, alCambiar: () => renderOrden() });
}

function initFiltrosOt(){
  /* Mapa lote -> objeto de DATOS().lotes, reconstruido en cada uso: capturarlo
   * una vez daria proyectos obsoletos si se editan los lotes. */
  const infoMapDe = () => {
    const m = new Map();
    for (const l of (DATOS().lotes || [])) m.set(String(l.lote ?? ''), l);
    return m;
  };
  const proyectoDe = (m) => (fila) => {
    const info = m.get(String(fila.lote ?? ''));
    return info ? (info.proyecto || '').trim() : '';
  };
  const vasijaDe = (m) => (fila) => {
    const info = m.get(String(fila.lote ?? ''));
    return info ? (info.vasija_actual || '').trim() : '';
  };

  _descOt = [
    {
      /* Va primero en la barra: es el filtro mas directo, "quiero estos lotes".
       * El widget ya trae su propio buscador y "Todas", asi que una lista de
       * doscientos numeros se maneja sola; cmpValores los ordena numericamente
       * (26001 antes que 26100) en vez de alfabeticamente. */
      label: 'Lote',
      set: filtOt.lote,
      opciones: () => opcionesValores((dashData() && dashData().lotes) || [], l => l.lote),
      match: matchValor(l => l.lote),
    },
    {
      /* variedad viene directa en la fila del dashboard: descriptor generico */
      label: 'Variedad',
      set: filtOt.variedad,
      opciones: () => opcionesValores((dashData() && dashData().lotes) || [], l => l.variedad),
      match: matchValor(l => l.variedad),
    },
    {
      /* proyecto NO viene en la fila del dashboard: hay que resolverlo por lote */
      label: 'Proyecto',
      set: filtOt.proyecto,
      opciones: () => opcionesValores((dashData() && dashData().lotes) || [], proyectoDe(infoMapDe())),
      match: (fila, set) => set.has(proyectoDe(infoMapDe())(fila)),
    },
    {
      /* etapa SI viene en la fila del dashboard: servidor.py la inyecta en
       * datos_dashboard() junto con pct e hitos. Descriptor generico. */
      label: 'Etapa',
      set: filtOt.etapa,
      opciones: () => opcionesValores((dashData() && dashData().lotes) || [], l => l.etapa),
      match: matchValor(l => l.etapa),
    },
    {
      /* Vasija es el unico filtro donde una fila cae en VARIAS opciones: un lote
       * en 't50 + Barrica' aparece bajo Barrica y bajo t50. Por eso no usa
       * opcionesValores/matchValor (que asumen un valor por fila) sino que
       * aplana tiposDeVasija(). El porque del agrupamiento esta en orden-filas.js. */
      label: 'Vasija',
      set: filtOt.vasija,
      opciones: () => {
        const de = vasijaDe(infoMapDe());
        const vals = new Set();
        for (const fila of ((dashData() && dashData().lotes) || [])){
          for (const t of tiposDeVasija(de(fila))) vals.add(normVal(t));
        }
        return [...vals].sort(cmpValores)
          .map(v => ({ val: v, text: v === '' ? '(sin vasija)' : v }));
      },
      match: (fila, set) => tiposDeVasija(vasijaDe(infoMapDe())(fila))
        .some(t => set.has(normVal(t))),
    },
  ];
  _instOt = initFiltrosMulti('otFltBar', _descOt, _otAplicarFiltros);
}

/* La Agenda arma la orden del dia: muestra la pestana y carga esos lotes como
 * si se hubieran pegado en "Pegar lotes" (reemplazando la orden). */
export function precargarOrden(lotes){
  mostrarTab('orden');
  _otPegado = (lotes || []).join('\n');
  const t = $('otPegar'); if (t) t.value = _otPegado;
  _otCargarPegados(true);
}

export function renderOrden(){
  const sec = $('tab-orden'); if (!sec) return;

  /* orden guardada abierta desde el modo ordenes: solo lectura */
  if (_guardada){ _otPintarGuardada(sec); return; }

  /* --- si no hay datos del dashboard, mostrar placeholder y disparar carga --- */
  if (!dashData()){
    sec.innerHTML = '<div class="msg info" style="margin-top:10px">Cargando datos del motor de análisis…</div>';
    if (!dashLoading()) cargarDashboard();
    return;
  }

  const fuenteOpts = [
    { v:'vencidos',          l:'Vencidos'              },
    { v:'proximos',          l:'Próximos a vencer (≤ 5 d)' },
    { v:'vencidos_proximos', l:'Vencidos + próximos'   },
    { v:'sin_analisis',      l:'Sin análisis'          },
    { v:'atencion',          l:'Atención (NO OK)'      },
    { v:'todos',             l:'Todos los lotes'       },
    { v:'ronda_tanques',     l:'Ronda de tanques'      },
    { v:'hoja_en_blanco',    l:'Hoja en blanco'        },
  ].map(o => `<option value="${escA(o.v)}"${o.v === _otFuente ? ' selected' : ''}>${esc(o.l)}</option>`).join('');

  const atencionOpts = [
    { v:'todos',      l:'Todos los criterios'    },
    { v:'so2',        l:'SO2 no OK'              },
    { v:'ph',         l:'pH no OK'               },
    { v:'av',         l:'AV alerta'              },
    { v:'fa',         l:'FA no finalizada'       },
    { v:'fml',        l:'FML no finalizada'      },
    { v:'noLleno',    l:'No lleno'               },
    { v:'so2Caida',   l:'Caída de SO₂ libre'     },
    { v:'sinControl', l:'Sin control de proceso' },
  ].map(o => `<option value="${escA(o.v)}"${o.v === _otAtencionTipo ? ' selected' : ''}>${esc(o.l)}</option>`).join('');


  const micro = _esMicro();
  const tipoBtn = (v, l) =>
    `<button type="button" role="radio" data-ottipo="${v}" aria-checked="${_otTipo === v}"` +
    `${_otTipo === v ? ' class="on"' : ''}>${l}</button>`;

  /* Secciones de ajustes segun el tipo. La numeracion se arma en orden, asi
   * no quedan huecos (1, 2, 3…) al ocultar las que no aplican. */
  let nSec = micro ? 1 : 3;   // analisis: 2 y 3 (barril, recipiente) van fijos antes de Pegar
  const secPegar = () => { const n = ++nSec; return `
    <!-- ${n}. pegar lotes: una columna o fila copiada del Excel se vuelve la orden -->
    <section class="oc-sec oc-panel" aria-labelledby="ocTPegar">
      <h3 class="oc-sec-t" id="ocTPegar"><span class="oc-n">${n}</span>Pegar lotes</h3>
      <label class="oc-hint" for="otPegar">Una columna o fila copiada del Excel se vuelve la orden.</label>
      <textarea id="otPegar" class="txt oc-pegar" rows="3" placeholder="26264, 26015, 26064…">${esc(_otPegado)}</textarea>
      <div class="oc-row">
        <button class="btn oc-strong" id="btnOtPegarArmar" title="Reemplaza las filas de la orden por los lotes pegados">Armar orden</button>
        <button class="btn oc-ghost" id="btnOtPegarSumar" title="Agrega los lotes pegados al final, sin repetir los que ya están">Sumar a la orden</button>
      </div>
      <div class="oc-note" id="otPegarMsg" aria-live="polite"></div>
    </section>`; };

  /* Microbiologia: solo Pegar lotes. Los textos de la orden y el cartel se
   * editan directo sobre la hoja de la vista previa. */
  const gridMicro = () => secPegar();

  sec.innerHTML = `
<div class="ot-izq">
<div id="ordenControls" class="card${micro ? ' oc-micro' : ''}">
  <!-- cabecera: titulo, contador y la unica accion principal de la tarjeta -->
  <div class="oc-head">
    <h2>Orden de trabajo — ${micro ? 'microbiología' : 'muestras'}</h2>
    <span class="oc-count" id="otCount" aria-live="polite"></span>
    <div class="oc-tipo" role="radiogroup" aria-label="Tipo de orden">
      ${tipoBtn('analisis', 'Análisis')}${tipoBtn('micro', 'Microbiología')}
    </div>
    <div class="oc-head-fin">
      ${chipCarpeta('principal')}
      <button class="btn primary oc-print" id="btnOtImprimir">🖨️ Imprimir</button>
    </div>
  </div>

  <!-- 1. que lotes entran: fuente + filtros + buscador -->
  <section class="oc-sec oc-sec-lotes" aria-labelledby="ocT1">
    <h3 class="oc-sec-t" id="ocT1"><span class="oc-n">1</span>Qué lotes entran</h3>
    <div class="oc-row" id="ordenToolbar">${micro ? '' : `
      <div class="oc-field">
        <label class="oc-lbl" for="otFuente">Incluir</label>
        <select id="otFuente">${fuenteOpts}</select>
      </div>
      <div class="oc-field" id="otWrapAtencion" style="display:${_otFuente === 'atencion' ? '' : 'none'}">
        <label class="oc-lbl" for="otAtencionTipo">Criterio de atención</label>
        <select id="otAtencionTipo">${atencionOpts}</select>
      </div>`}
      <div class="oc-field oc-field-buscar">
        <label class="oc-lbl" for="otBuscar">Buscar</label>
        <div class="oc-search">
          <input class="txt" id="otBuscar" type="search" placeholder="Lote, variedad, vasija…"
                 value="${escA(_otBusqueda)}">
        </div>
      </div>
    </div>
    <div class="oc-row oc-row-filtros">
      <span class="oc-lbl oc-lbl-inline">Filtrar por</span>
      <div class="mfilt-bar" id="otFltBar"></div>
      <div class="oc-row-fin">
        <button class="btn oc-ghost" id="btnOtLimpiarFlt" title="Limpiar el buscador y todos los filtros">🧹 Limpiar filtros</button>
        <button class="btn oc-ghost" id="btnOtRecargar" title="Volver a armar las filas desde la fuente elegida">🔄 Recargar filas</button>
      </div>
    </div>
  </section>

  <!-- ajustes secundarios: dos columnas en pantalla ancha, una en angosta -->
  <div class="oc-grid">${micro ? gridMicro() : `
    <!-- 2. muestreo por barril -->
    <section class="oc-sec oc-panel" aria-labelledby="ocT2">
      <h3 class="oc-sec-t" id="ocT2"><span class="oc-n">2</span>Muestreo por barril</h3>
      <p class="oc-hint">Sin columna Barril, sacan la muestra de cualquier barril. «Barriles específicos» pone todos los barriles llenos de cada lote, uno por fila: quitá los que no quieras. «Sortear» elige uno por lote, rotando entre los menos muestreados.</p>
      <div class="oc-row">
        <button class="btn oc-ghost" id="btnOtBarrilElegir" title="Pone todos los barriles llenos de cada lote (del Mapa de Barriles), uno por fila. Quitá con ✕ los que no quieras.">✎ Elegir barriles específicos</button>
        <button class="btn oc-strong" id="btnOtDado" title="Sortear un barril lleno al azar de cada lote de la orden (del inventario del Mapa de Barriles). Volver a apretar cambia el barril.">🎲 Sortear barriles</button>
        <button class="btn oc-ghost" id="btnOtSinSorteo" title="Quitar la columna Barril: la orden vuelve a ser genérica y en la bodega sacan la muestra de cualquier barril. No se anota nada como muestreado." style="display:none">✕ Quitar columna Barril</button>
      </div>
      <div class="oc-note" id="otDadoMsg" aria-live="polite"></div>
    </section>

    <!-- 3. recipiente + cantidad globales -->
    <section class="oc-sec oc-panel" aria-labelledby="ocT3">
      <h3 class="oc-sec-t" id="ocT3"><span class="oc-n">3</span>Recipiente y cantidad</h3>
      <p class="oc-hint">Vale para las filas nuevas. «Aplicar a todas» lo pisa en las que ya están.</p>
      <div class="oc-row">
        <div class="oc-field">
          <label class="oc-lbl" for="otDefRecipiente">Recipiente</label>
          <div class="oc-rec">
            <select id="otDefRecipiente">${_recOpciones(_otRecipiente)}</select>
            <input class="txt" id="otDefRecipienteOtro" type="text" placeholder="Escribí el recipiente…" hidden>
          </div>
        </div>
        <div class="oc-field">
          <span class="oc-lbl">Cantidad</span>
          <div class="oc-stepper" role="group" aria-label="Cantidad por defecto">
            <button class="btn" id="btnOtDefMinus" aria-label="Uno menos">−</button>
            <span id="otDefCantidad" aria-live="polite">${esc(String(_otCantidad))}</span>
            <button class="btn" id="btnOtDefPlus" aria-label="Uno más">+</button>
          </div>
        </div>
        <div class="oc-field oc-field-accion">
          <button class="btn" id="btnOtAplicarDef" title="Aplica el recipiente y cantidad seleccionados a TODAS las filas">Aplicar a todas las filas</button>
        </div>
      </div>
    </section>

    ${secPegar()}

    <!-- 5. mapas de barriles -->
    <section class="oc-sec oc-panel" aria-labelledby="ocT5">
      <h3 class="oc-sec-t" id="ocT5"><span class="oc-n">5</span>Mapas de barriles</h3>
      <p class="oc-hint">Cada imagen se agrega como hoja final al imprimir.</p>
      <input type="file" id="otMapaFile" accept="image/*" multiple hidden>
      <div class="oc-row">
        <button class="btn oc-ghost" id="btnOtMapa">🗺️ Adjuntar mapa…</button>
      </div>
      <div class="oc-chips" id="otMapaChips"></div>
    </section>`}
  </div>
</div>

</div>

<!-- la orden de trabajo: la hoja tal cual se imprime, editable encima (no hay
     grilla aparte). Es la unica seccion visible al imprimir (printing-orden). -->
<section class="ot-der" aria-label="Orden de trabajo">
  <div class="ot-prev-cab ot-resumen" id="otResumen" aria-live="polite"></div>
  <div class="ot-aviso" id="otAviso" role="status" hidden><span class="ot-aviso-t"></span><button type="button" class="ot-aviso-x" aria-label="Cerrar aviso">✕</button></div>
  <div class="ot-prev-cab">
    <span><b>La orden tal cual se imprime</b> · hacé clic para escribir · Enter baja de fila · pegá una columna de lotes en «Lote»</span>
    ${micro ? '<button class="btn oc-ghost oc-mini" id="btnOtMicroDef" title="Volver a los textos del Excel de microbiología (orden y cartel)">↺ Textos originales</button>' : ''}
  </div>
  <datalist id="otRecLista"></datalist>
  <div id="otBarrListas" hidden></div>
  <div id="otPaginas"></div>
</section>`;

  /* aviso de arriba de la hoja: se cierra con su ✕; "cambiar" lleva a la fuente */
  $('otAviso').querySelector('.ot-aviso-x').addEventListener('click', () => _otAvisar('', 'ok', ''));
  $('otResumen').addEventListener('click', e => {
    if (!e.target.closest('#btnOtCambiarFuente')) return;
    const f = $('otFuente') || $('otPegar');
    if (f){ f.scrollIntoView({ block: 'center', behavior: 'smooth' }); f.focus(); }
  });

  /* --- construir filas iniciales si la tabla está vacía o si se cambia la fuente --- */
  _otAplicarFiltros();

  /* --- listeners de controles (re-wired en cada render porque sec.innerHTML cambia) --- */

  /* pegar lotes */
  $('otPegar').addEventListener('input', e => { _otPegado = e.target.value; });
  $('btnOtPegarArmar').addEventListener('click', () => _otCargarPegados(true));
  $('btnOtPegarSumar').addEventListener('click', () => _otCargarPegados(false));

  /* tipo de orden: analisis / microbiologia. Pasar a micro deja la fuente en
   * "Hoja en blanco" y marca las filas actuales como manuales, asi no se
   * pierden al rearmar (en hoja en blanco solo sobreviven las manuales). */
  $('ordenControls').querySelectorAll('[data-ottipo]').forEach(b => {
    b.addEventListener('click', () => {
      if (b.dataset.ottipo === _otTipo) return;
      _otTipo = b.dataset.ottipo;
      if (_esMicro()){
        _otRows.forEach(r => { r.manual = true; });
        _otFuente = 'hoja_en_blanco';
      }
      renderOrden();
    });
  });

  /* textos originales de microbiologia (orden y cartel) */
  if (micro){
    $('btnOtMicroDef').addEventListener('click', () => {
      _otMicro = textosMicro(null);
      _microGuardar();
      renderOrden();
    });
  }

  /* solo analisis: microbiologia arranca en hoja en blanco y no muestra "Incluir" */
  if (!micro){
    /* fuente */
    $('otFuente').addEventListener('change', e => {
      _otFuente = e.target.value;
      $('otWrapAtencion').style.display = (_otFuente === 'atencion') ? '' : 'none';
      _otAplicarFiltros();
    });

    /* criterio de atencion granular */
    $('otAtencionTipo').addEventListener('change', e => {
      _otAtencionTipo = e.target.value;
      _otAplicarFiltros();
    });
  }

  /* --- filtros multi (re-montados en cada render porque sec.innerHTML se recreo) --- */
  if (_descOt.length === 0){
    initFiltrosOt();
    if (_descOt.some(d => d.set.size)){
      /* Los Sets ya traian valores restaurados del F5, pero _otAplicarFiltros()
         de la linea 808 corrio con _descOt todavia vacio (no existia hasta
         ahora): armo la hoja sin filtrar. Se vuelve a aplicar una vez mas, ya
         con los descriptores listos; el resto de este render sigue de largo. */
      _otAplicarFiltros();
    }
  } else {
    const bar = $('otFltBar');
    if (bar){
      bar.innerHTML = '';
      _instOt.forEach(f => { bar.appendChild(f.el); f.rebuild(); });
    }
  }

  /* buscador de texto libre. Sin debounce a proposito: la grilla ya ignora las
   * teclas cuando el foco esta en un control que no le pertenece
   * (grilla.js, cablearTeclado), asi que tipear aca no roba el foco ni arranca
   * a editar una celda. El input vive en #ordenControls, fuera del tbody que
   * _otRenderTabla() repinta, por eso conserva el cursor entre teclas. */
  $('otBuscar').addEventListener('input', e => {
    _otBusqueda = e.target.value;
    _gf('busca', _otBusqueda);
    _otAplicarFiltros();
  });

  /* limpiar: el buscador Y los cuatro multi-select de una. limpiarFiltrosMulti
   * vacia los Sets, blanquea el input y llama a onChange una sola vez, asi que
   * _otBusqueda se resetea ANTES para que ese unico repintado ya lo vea. */
  $('btnOtLimpiarFlt').addEventListener('click', () => {
    _otBusqueda = '';
    if (_FS) _FS.borrar('lotes:orden:');
    limpiarFiltrosMulti(_descOt, 'otBuscar', _instOt, _otAplicarFiltros);
  });

  /* recargar filas manualmente */
  $('btnOtRecargar').addEventListener('click', () => {
    _otAplicarFiltros();
  });

  /* solo analisis: sorteo de barriles y recipiente/cantidad */
  if (!micro){
    /* dado: sortear un barril por lote */
    $('btnOtDado').addEventListener('click', _otTirarDado);

    /* sin sorteo: vaciar la columna Barril. Como el papel ya no lleva barriles,
     * imprimir despues no anota nada en muestreos_barriles. */
    $('btnOtSinSorteo').addEventListener('click', () => {
      _otRows = colapsarPorLote(_otRows);
      _otModoBarril = false;
      _otRefrescar();
      _otAvisar('Orden genérica: sin columna Barril, sacan la muestra de cualquier barril.');
    });
    $('btnOtBarrilElegir').addEventListener('click', _otActivarModoBarril);

    /* recipiente / cantidad por defecto */
    /* "✎ Otro…" cambia el selector por un campo de texto; al confirmarlo
     * (Enter o salir del campo) el nombre nuevo queda elegido y en la lista. */
    const recSel = $('otDefRecipiente'), recOtro = $('otDefRecipienteOtro');
    recSel.addEventListener('change', e => {
      if (e.target.value === OTRO_REC){
        recSel.hidden = true; recOtro.hidden = false; recOtro.value = ''; recOtro.focus();
        return;
      }
      _otRecipiente = e.target.value;
    });
    const recConfirmar = () => {
      if (recOtro.hidden) return;
      const v = _recSumar(recOtro.value);
      if (v) _otRecipiente = v;
      recSel.innerHTML = _recOpciones(_otRecipiente);
      recOtro.hidden = true; recSel.hidden = false;
    };
    recOtro.addEventListener('change', recConfirmar);
    recOtro.addEventListener('blur', recConfirmar);
    recOtro.addEventListener('keydown', e => {
      if (e.key === 'Enter'){ e.preventDefault(); recConfirmar(); }
      if (e.key === 'Escape'){ recOtro.value = ''; recConfirmar(); }
    });
    $('btnOtDefMinus').addEventListener('click', () => {
      if (_otCantidad > 1){ _otCantidad--; $('otDefCantidad').textContent = _otCantidad; }
    });
    $('btnOtDefPlus').addEventListener('click', () => {
      _otCantidad++;
      $('otDefCantidad').textContent = _otCantidad;
    });
    $('btnOtAplicarDef').addEventListener('click', () => {
      _otRows.forEach(r => { r.recipiente = _otRecipiente; r.cantidad = _otCantidad; });
      _otRefrescar();
    });
  }

  /* Vista previa editable: todo campo data-campo de la hoja (hoja-campos.js)
   * guarda su valor y lo copia a los campos iguales de las otras paginas. NO
   * repinta la hoja: asi el cursor se queda donde esta mientras se escribe. */
  const hojaEl = $('otPaginas');
  hojaEl.addEventListener('input', e => {
    const c = e.target.closest('[data-campo]');
    if (c){ _otCampoHoja(c); return; }
    const celda = e.target.closest('input.oh-celda');
    if (celda){ _otCeldaInput(celda); return; }
    const pie = e.target.closest('[data-mapapieot]');
    if (pie){ const m = _otMapas[+pie.dataset.mapapieot]; if (m) m.pie = pie.value; return; }
  });
  _otCablearFilas(hojaEl);

  /* solo analisis: los mapas no se ofrecen en microbiologia */
  if (!micro){
    /* mapas de barriles: adjuntar una o varias imagenes, cada una anexada como hoja final */
    $('btnOtMapa').addEventListener('click', () => $('otMapaFile').click());
    $('otMapaFile').addEventListener('change', e => {
      const files = [...(e.target.files || [])]; if (!files.length) return;
      const slots = new Array(files.length); let pend = files.length;
      files.forEach((f, idx) => {
        const rd = new FileReader();
        rd.onload = () => {
          slots[idx] = { src: rd.result, nombre: f.name, pie: '' };
          if (--pend === 0){ _otMapas.push(...slots); _otPintarMapaChips(); _otPintarPaginas(); }
        };
        rd.readAsDataURL(f);
      });
      e.target.value = '';
    });
    $('otMapaChips').addEventListener('click', e => {
      const b = e.target.closest('[data-delmapaot]'); if (!b) return;
      _otMapas.splice(+b.dataset.delmapaot, 1);
      _otPintarMapaChips();
      _otPintarPaginas();
    });
    _otPintarMapaChips();
  }

  /* N° de orden: el de la carpeta de OT, si el usuario todavia no puso uno */
  if (!_otHoja.nro && !_otNroPropuesto){
    _otNroPropuesto = true;
    _otProponerNro();
  }
  cablearChipsCarpeta($('btnOtImprimir').parentElement, () => {
    if (_otHoja.nro === _otNroUltimo) _otProponerNro();
  });

  /* imprimir: guarda el PDF en la carpeta de OT (guardar-ot.js) */
  $('btnOtImprimir').addEventListener('click', async () => {
    const r = await imprimirYGuardar({
      claseBody: 'printing-orden', contenedor: $('otPaginas'), serie: 'principal',
      numero: _otHoja.nro, titulo: _otTitulo,
    });
    if (r.numeroLibre){
      _otPonerNro(r.numeroLibre);
      return;
    }
    if (!r.ok) return;
    // Ya impreso: el numero queda fijo (conectar la carpeta no lo re-propone).
    _otNroUltimo = null;
    if (r.numero && r.numero !== _otHoja.nro) _otPonerNro(r.numero);
    /* anota los barriles (microbiologia no usa el dado) y guarda la orden */
    await _otTrasImprimir(r);
  });
}

/* Pide el N° a la carpeta y lo pone solo si nadie lo cambio mientras tanto. */
function _otProponerNro(){
  const previo = _otHoja.nro;
  proponerNumero('principal').then(p => {
    if (_otHoja.nro !== previo) return;
    _otNroUltimo = p.numero;
    _otPonerNro(p.numero);
  });
}

function _otPonerNro(nro){
  _otHoja.nro = nro;
  document.querySelectorAll('#otPaginas [data-campo="nro"]').forEach(i => { i.value = nro; });
}

/* Filas editadas sobre la hoja: confirmar, Enter, pegar columna, quitar y
 * agregar. El nodo #otPaginas se recrea en cada renderOrden, asi que estos
 * listeners no se acumulan. */
function _otCablearFilas(hoja){
  hoja.addEventListener('change', e => {
    const celda = e.target.closest('input.oh-celda');
    if (celda) _otCeldaConfirmar(celda);
  });
  hoja.addEventListener('keydown', e => {
    const celda = e.target.closest('input.oh-celda');
    if (celda && e.key === 'Enter'){ e.preventDefault(); _otCeldaEnter(celda); }
  });
  hoja.addEventListener('paste', e => {
    const celda = e.target.closest('input.oh-celda[data-col="lote"]');
    if (celda) _otPegarEnLote(celda, e);
  });
  hoja.addEventListener('click', e => {
    const d = e.target.closest('[data-dadofila]');
    if (d){ _otTirarDadoFila(+d.dataset.dadofila); return; }
    const q = e.target.closest('[data-quitar]');
    if (q){ _otRows.splice(+q.dataset.quitar, 1); _otRepintar(); return; }
    if (e.target.closest('.oh-agregar')){
      _otRows.push(_otFilaNueva());
      _otRepintar({ fila: _otRows.length - 1, col: 'lote' });
    }
  });
}

/* Un campo de la hoja cambio: al estado que corresponda y a sus copias. */
function _otCampoHoja(el){
  const k = el.dataset.campo, v = el.value;
  if (k === 'titulo') _otTitulo = v;
  else if (k in _otHoja) _otHoja[k] = v;
  else if (k in _otMicro){ _otMicro[k] = v; _microGuardar(); }
  else return;
  const hoja = $('otPaginas');
  const copiar = (clave, valor, salvo) => hoja.querySelectorAll(`[data-campo="${clave}"]`)
    .forEach(o => { if (o !== salvo && o.value !== valor) o.value = valor; });
  copiar(k, v, el);
  /* la fecha arrastra el anio del encabezado y el dia de la banda */
  if (k === 'fecha'){
    hoja.querySelectorAll('[data-anio]').forEach(a => { a.textContent = v.slice(0, 4); });
    const d = diaDeSemana(v);
    if (d){ _otHoja.dia = d; copiar('dia', d, null); }
  }
}

/* Chips de mapas adjuntos, con boton de quitar -- vive fuera de #otPaginas
 * (que se reconstruye entero en cada _otPintarPaginas) para no perder el
 * listener; se repinta solo cuando cambia _otMapas. */
function _otPintarMapaChips(){
  const cont = $('otMapaChips');
  if (!cont) return;
  cont.innerHTML = _otMapas.length
    ? _otMapas.map((m, i) => `<span class="oc-chip"><span class="oc-chip-nom" title="${escA(m.nombre)}">🗺️ ${esc(m.nombre)}</span><button type="button" class="oc-chip-x" data-delmapaot="${i}" title="Quitar imagen" aria-label="Quitar ${escA(m.nombre)}">✕</button></span>`).join('')
    : '<span class="oc-empty">Sin imágenes adjuntas.</span>';
}

registrarVista('orden', () => renderOrden());
