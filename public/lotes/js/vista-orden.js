/* ===== Lotes CIW — pestana Orden de muestras ===== */
'use strict';

import { $, esc, escA, num, DATOS, dashData, dashLoading, cargarDashboard,
         registrarVista, markDirty, guardar } from './nucleo.js';
import { clasificarLote, pasaFuente, pasaBusqueda, tiposDeVasija,
         datosDeLote, claveLote, parsearListaLotes } from './orden-filas.js';
import { pasaMulti, opcionesValores, matchValor, initFiltrosMulti,
         limpiarFiltrosMulti, cmpValores, normVal } from './tabla.js';
import { pintarHojas, hojaTop, hojaMetaEditable, hojaBanda } from './orden-hoja.js';
import { cfgHojasAnalisis, pegarLotesDesde, cantidadValida } from './orden-hoja-filas.js';
import { hoyLocalISO, diaDeSemana } from './hoja-campos.js';
import { sortearOrden, registrosDeImpresion } from './sorteo-barriles.js';
import { textosMicro, cfgHojasMicro } from './orden-micro.js';

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
const filtOt = { lote: new Set(), variedad: new Set(), proyecto: new Set(),
                 etapa: new Set(), vasija: new Set() };
let _otBusqueda = '';                     // buscador de texto libre de la barra
let _descOt = [], _instOt = [];
let _otRecipiente = 'Tubo falcon';
let _otCantidad   = 1;
let _otTitulo     = 'Orden de Trabajo';   // titulo editable de la hoja, sincronizado entre paginas
/* Datos del encabezado y las firmas, editados SOBRE la hoja (vista previa
 * editable, ver hoja-campos.js). En memoria, como el resto de la orden. */
const _otHoja = { nro: '', fecha: hoyLocalISO(), dia: diaDeSemana(hoyLocalISO()), emitio: '', recibio: '' };
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

  let lotes = (dashData().lotes || []).filter(l => pasaMulti(l, _descOt));

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

  const cfg = cfgHojasAnalisis({
    filas: _otRows, titulo: _otTitulo, meta, banda, emitio, recibio,
    hojasExtra: hojasMapas, listaRecipientes: 'otRecLista',
  });
  const sinSorteo = $('btnOtSinSorteo');
  if (sinSorteo) sinSorteo.style.display = cfg.columnas === 8 ? '' : 'none';
  cont.innerHTML = pintarHojas(cfg);
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
  const manuales = _otRows.filter(r => r.manual);
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
    msg.textContent = t;
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
  const msg = $('otDadoMsg');
  const btn = $('btnOtDado');
  const lotes = [...new Set(_otRows.map(r => claveLote(r.lote)).filter(k => k !== ''))];
  if (!lotes.length){ if (msg) msg.textContent = 'No hay lotes en la orden.'; return; }
  if (btn) btn.disabled = true;
  if (msg) msg.textContent = 'Sorteando…';
  try {
    const r = await fetch(API + '/barriles?lotes=' + encodeURIComponent(lotes.join(',')));
    if (!r.ok){
      const e = await r.json().catch(() => ({}));
      if (msg) msg.textContent = 'No pude leer el Mapa de Barriles' + (e.error ? ': ' + e.error : '.');
      return;
    }
    const { sinBarril } = sortearOrden(_otRows, (await r.json()).por_lote, Math.random,
                                       DATOS().muestreos_barriles || []);
    _otRefrescar();
    if (msg){
      const con = lotes.length - sinBarril.length;
      let t = `🎲 ${con} barril${con !== 1 ? 'es' : ''} sorteado${con !== 1 ? 's' : ''}.`;
      if (sinBarril.length) t += ` Sin barriles llenos en el Mapa: ${sinBarril.join(', ')}.`;
      msg.textContent = t;
    }
  } catch (e){
    if (msg) msg.textContent = 'No pude leer el Mapa de Barriles (¿sin conexión?).';
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* Al imprimir, los barriles de la orden pasan a contar como muestreados: se
 * anotan en DATOS().muestreos_barriles y se guarda solo, para que la proxima
 * orden (en esta PC o en otra) no los repita. Reimprimir no cuenta doble. */
async function _otRegistrarMuestreo(){
  const hist = DATOS().muestreos_barriles || [];
  const fecha = _otHoja.fecha || hoyLocalISO();
  const nuevos = registrosDeImpresion(_otRows, hist, fecha, _otHoja.nro);
  if (!nuevos.length) return;
  DATOS().muestreos_barriles = hist.concat(nuevos);
  markDirty();
  const msg = $('otDadoMsg');
  const ok = await guardar();
  if (msg) msg.textContent = ok
    ? `✓ ${nuevos.length} barril${nuevos.length !== 1 ? 'es' : ''} anotado${nuevos.length !== 1 ? 's' : ''} como muestreado${nuevos.length !== 1 ? 's' : ''}: la próxima orden no los repite.`
    : 'Los barriles quedaron anotados pero NO se guardaron todavía: se van a guardar solos cuando vuelva la conexión (o apretá Ctrl+S).';
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

export function renderOrden(){
  const sec = $('tab-orden'); if (!sec) return;

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
      ${tipoBtn('analisis', '🧪 Análisis')}${tipoBtn('micro', '🦠 Microbiología')}
    </div>
    <div class="oc-head-fin">
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
      <p class="oc-hint">Sortea un barril lleno de cada lote, rotando entre los menos muestreados. Volver a sortear cambia el barril.</p>
      <div class="oc-row">
        <button class="btn oc-strong" id="btnOtDado" title="Sortear un barril lleno al azar de cada lote de la orden (del inventario del Mapa de Barriles). Volver a apretar cambia el barril.">🎲 Sortear barriles</button>
        <button class="btn oc-ghost" id="btnOtSinSorteo" title="Quitar los barriles sorteados: la orden vuelve a salir sin columna Barril y en la bodega sacan la muestra de cualquier barril. No se anota nada como muestreado." style="display:none">✕ Sin sorteo</button>
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
  <div class="ot-prev-cab">
    <span><b>La orden tal cual se imprime</b> · hacé clic para escribir · Enter baja de fila · pegá una columna de lotes en «Lote»</span>
    ${micro ? '<button class="btn oc-ghost oc-mini" id="btnOtMicroDef" title="Volver a los textos del Excel de microbiología (orden y cartel)">↺ Textos originales</button>' : ''}
  </div>
  <datalist id="otRecLista"></datalist>
  <div id="otPaginas"></div>
</section>`;

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
    _otAplicarFiltros();
  });

  /* limpiar: el buscador Y los cuatro multi-select de una. limpiarFiltrosMulti
   * vacia los Sets, blanquea el input y llama a onChange una sola vez, asi que
   * _otBusqueda se resetea ANTES para que ese unico repintado ya lo vea. */
  $('btnOtLimpiarFlt').addEventListener('click', () => {
    _otBusqueda = '';
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
      _otRows.forEach(r => { r.barril = ''; });
      _otRefrescar();
      const msg = $('otDadoMsg');
      if (msg) msg.textContent = 'Sin sorteo: sacan la muestra de cualquier barril.';
    });

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

  /* imprimir */
  $('btnOtImprimir').addEventListener('click', () => {
    document.body.classList.add('printing-orden');
    window.print();
    document.body.classList.remove('printing-orden');
    /* microbiologia no usa el dado: no hay barriles que anotar */
    if (!_esMicro()) _otRegistrarMuestreo();
  });
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
