/* ===== Lotes CIW — pestana Orden de correccion de SO2 =====
 *
 * Una fila por barrica, con su numero, sus litros reales y su dosis. Las
 * barricas de un lote van juntas porque comparten la diferencia de SO2: el SO2
 * se mide en el lote, no barrica por barrica, y lo que cambia por barrica son
 * los litros.
 *
 * Esta vista NO decide el criterio. Las filas vienen resueltas de
 * /api/orden-correccion, incluido el orden por urgencia. La fuente de verdad
 * del calculo es motor_correccion.py; aca solo se recalcula la dosis cuando el
 * usuario pisa el objetivo de un lote, con la misma formula.
 *
 * TODO(refactor): _dosis() es la tercera implementacion de la misma formula
 * (las otras dos son motor_fml.py y calcCorreccionSO2 en so2-calculo.js).
 * El modulo compartido js/so2-bitacora.js ya existe (subsistema L, Task 6),
 * pero no absorbio la formula de la dosis porque eso era un refactor aparte.
 * Lo que queda es mover las dos copias JS de la formula a so2-bitacora.js
 * y dejar Python como fuente de verdad. */
'use strict';

import { $, esc, escA, registrarVista, DATOS, markDirty, guardar,
         usuarioActual, mostrarTab } from './nucleo.js';
import { anularCorreccion, revertirAnulaciones } from './so2-bitacora.js';
import { pintarHojas, HOJA_POR_PAGINA } from './orden-hoja.js';
import { campoHoja } from './hoja-campos.js';
import { INSTRUCCIONES_SOLUCION, filaPapelLote, theadPapelLote,
         COLGROUP_PAPEL_LOTE, COLUMNAS_PAPEL_LOTE, filasPapelPorModo, anioDeLote, OC_UNIDAD } from './orden-correccion-papel.js';
import { pasaMulti, opcionesValores, matchValor, crearFiltroMulti,
         limpiarFiltrosMulti, setF } from './tabla.js';
import { ordenarLotesOc, OC_ORDEN_INICIAL, ciclarOrdenOc } from './orden-correccion-orden.js';
import { queryAnios } from './selector-anios.js';
import { proponerNumero, chipCarpeta, cablearChipsCarpeta, imprimirYGuardar } from './guardar-ot.js';
import { avisar, confirmar, pedir } from './dialogos.js';
import { modoPorDefecto, armarOrdenGuardada, lotesPendientes } from './orden-correccion-guardada.js';
import { claveVasija, dosisDesdeUnidad, aplicarManuales } from './orden-correccion-manual.js';
import { ETIQUETA_FUERA, activablesDe, ordenConActivables, diferenciaDosificable } from './orden-correccion-activables.js';
import { urlVolver } from './modo-ordenes.js';
import { pintarPlanilla, COLS_PLANILLA, valorVasija, filtrarVasijas, ordenarVasijas, cartelPorVasija } from './orden-correccion-planilla.js';
import { esOrganico } from './envases.js';
import { techoSo2OT, problemaDosisSo2 } from './criterios.js';
import { fijarOrdenUnica } from './vista-so2.js';

/* Formateador local: usa toFixed y muestra '—' para null/Infinity.
 * nucleo.js no exporta fmt (es local en cada vista que lo necesita). */
const fmt = (v, dec) => (v != null && Number.isFinite(v)) ? Number(v).toFixed(dec) : '—';

/* Estado de modulo. Efimero a proposito: la hoja no se persiste, igual que la
 * Orden de muestras. Si se recarga la pagina se vuelve a pedir al servidor. */
let _ocOrdenSrv = null;     // respuesta cruda del endpoint
let _ocOrden = null;        // la que ve la pantalla (con los activables si el boton esta prendido)
/* Boton "Lotes en objetivo / corregidos": suma de forma temporal los lotes que
 * la orden deja afuera (orden-correccion-activables.js). No se guarda: se apaga
 * al Recargar y al imprimir y guardar la orden. */
let _ocActivos = false;
/* Los activables que ya se mostraron con el boton prendido. Uno que aparece
 * despues (la orden se vuelve a pedir en cada visita) llega destildado, igual
 * que los primeros; los ya vistos conservan lo que eligio el usuario. */
let _ocActVistos = new Set();
let _ocExcluidos = new Set();    // lotes destildados por el usuario
let _ocSolicitudesEx = new Map(); // invalida avisos de una edición anterior
let _ocExcepciones = new Map(); // autorizacion temporal por lote y objetivo
let _ocObjetivos = new Map();    // lote -> objetivo pisado a mano
/* lote -> Map claveVasija -> {mbk_g, ml_solucion}: la dosis escrita sobre la
 * hoja (orden-correccion-manual.js). Se borra la del lote al cambiar su
 * objetivo, al Recargar y al guardar la orden. */
let _ocManuales = new Map();
/* El titulo se puede reescribir sobre la hoja. */
let _ocTitulo = 'Orden de corrección de SO₂';

/* Instrucciones de arriba de la hoja, editables encima (se agregan, cambian o
 * borran renglones). Una por unidad: las de la solucion arrancan con las de la
 * B219 y las de MBK vacias. Sobreviven al F5 de la pestaña, como los filtros. */
const _ocInstr = (g => ({
  sol: typeof g.sol === 'string' ? g.sol : INSTRUCCIONES_SOLUCION,
  mbk: typeof g.mbk === 'string' ? g.mbk : '',
}))((typeof window !== 'undefined' && window.CIWFiltros && window.CIWFiltros.leer('lotes:ocinstr', null)) || {});
/* Los renglones que pinto el papel la ultima vez: el campo de dosis de la hoja
 * dice su indice (data-oc-dosis) y de aca salen las vasijas que cubre. */
let _ocFilasPapel = [];
/* N° de orden: sobrevive a los re-render (si no, el campo vuelve vacio y se
 * propone el siguiente aunque ya se haya impreso este). _ocNumAuto: lo puso la
 * carpeta y nadie lo uso todavia; _ocNumFijo: ya se imprimio con ese numero. */
let _ocNum = '', _ocNumAuto = false, _ocNumFijo = false;
/* El resto del encabezado de la hoja. Se escribe solo sobre el papel (no hay
 * campos aparte arriba de la tabla), asi que vive aca y no en el DOM. La fecha
 * arranca en hoy; emitio/recibio sobreviven a cambiar de pestaña. */
let _ocFecha = '', _ocEmitio = '', _ocRecibio = '';
/* Buscador por lote de la barra: filtra por texto, como el de Analisis.
 * Sobrevive al F5 en esta pestaña (shared/filtros-sesion.js). */
const _FS = typeof window !== 'undefined' && window.CIWFiltros;
const _lf = (k, d) => _FS ? _FS.leer('lotes:ordencorr:' + k, d) : d;
const _gf = (k, v) => { if (_FS) _FS.guardar('lotes:ordencorr:' + k, v); };
let _ocBusca = (v => typeof v === 'string' ? v : '')(_lf('busca', ''));

/* Filtros: un Set por columna filtrable, creados UNA vez. Los widgets guardan
 * una referencia a estos mismos objetos, asi que el estado sobrevive al
 * re-render de la vista. */
const filtOc = { variedad: setF('ordencorr', 'variedad'), proyecto: setF('ordencorr', 'proyecto'),
                 etapa: setF('ordencorr', 'etapa'), grupo: setF('ordencorr', 'grupo'),
                 lote: setF('ordencorr', 'lote'), ph: setF('ordencorr', 'ph'),
                 so2: setF('ordencorr', 'so2'), objetivo: setF('ordencorr', 'objetivo'),
                 dosis: setF('ordencorr', 'dosis'),
                 /* Solo con embudo en la planilla. anio/cant/dif filtran lotes;
                  * tipo/vasija/litros/vdosis filtran vasijas (_ocPasaVasija). */
                 anio: setF('ordencorr', 'anio'), cant: setF('ordencorr', 'cant'),
                 dif: setF('ordencorr', 'dif'), tipo: setF('ordencorr', 'tipo'),
                 vasija: setF('ordencorr', 'vasija'), litros: setF('ordencorr', 'litros'),
                 vdosis: setF('ordencorr', 'vdosis') };

/* Embudos de la planilla, uno por columna (COLS_PLANILLA): k -> {d, inst}.
 * Los de nivel lote comparten el Set con el boton de la barra de la Hoja (Lote,
 * SO2, Objetivo), asi que lo tildado en una vista vale en la otra. */
let _fltPlan = new Map();
/* Filtros de nivel vasija: {k, set}. */
let _descVas = [];

/* Los filtros son multi-select con casillas, todos iguales, asi que una sola
 * lista alcanza: la que recorre pasaMulti es la misma que se convierte en
 * paneles. Todos van como boton en la barra de arriba de la hoja: la hoja no
 * tiene columnas de pH, SO2 ni objetivo donde colgar un embudo. */
let _descOc = [], _instOc = [];

/* Orden de la tabla (y del papel, que sale en el mismo orden que se ve).
 * Arranca por lote creciente; sin columna = el orden por urgencia del
 * servidor. Ver orden-correccion-orden.js. */
let _ocSort = { ...OC_ORDEN_INICIAL };

/* Vista de la pantalla: 'planilla' (una fila por vasija, como el Excel de
 * bodega) u 'hoja' (el papel A4 editable). Las dos salen de las mismas filas;
 * imprimir siempre imprime la hoja. Se recuerda entre F5. */
let _ocVista = (v => v === 'hoja' ? 'hoja' : 'planilla')(_FS ? _FS.leer('lotes:ocvista', 'planilla') : 'planilla');

/* Etiquetas legibles para el grupo del cruce con el mapa. Los valores crudos
 * (tanque_grande, sin_ubicar) no son para mostrarle a nadie. */
const OC_GRUPO_LBL = { normal: 'Normal', marcado: 'Marcado',
                       tanque_grande: 'Tanque grande', sin_ubicar: 'Sin ubicar' };

/* Unidad en la que se expresa la dosis. Las dos aportan el MISMO SO2: son la
 * misma correccion dicha de dos maneras, no dos correcciones distintas.
 *
 * El polvo se pesa; la solucion d1030 se mide con probeta. Ojo con el x2 de la
 * formula del MBK: no es un margen de seguridad, es que el metabisulfito es
 * ~50% SO2 en masa, asi que hacen falta 2 g de polvo por cada gramo de SO2. La
 * solucion esta a 55 g/L DE SO2 (no de sal), y por eso su formula no lo lleva.
 * Hay un test que fija esa equivalencia.
 *
 * Segun el dia la bodega tiene una u otra preparada, y la hoja tiene que hablar
 * el idioma de lo que el operario va a usar: si dice gramos y el tipo tiene la
 * probeta en la mano, la conversion la termina haciendo a ojo.
 *
 * Arranca en 'sol' porque es lo que la hoja venia imprimiendo. Vive en memoria:
 * sobrevive a cambiar de pestana, se resetea al recargar la pagina. */
let _ocUnidad = 'sol';   // 'mbk' | 'sol'

/* OC_UNIDAD (como se expresa la dosis en cada unidad) vive en
 * orden-correccion-papel.js: la usa tambien el papel de una orden guardada. */

/** La config de la unidad vigente. Exportada para testearla sin DOM. */
export function _ocUni(u){ return OC_UNIDAD[u || _ocUnidad] || OC_UNIDAD.sol; }

/** La OTRA unidad. El boton alterna entre dos, asi que hay un solo destino. */
export function _ocOtraUnidad(u){ return (u || _ocUnidad) === 'mbk' ? 'sol' : 'mbk'; }

/* El boton dice EN QUE ESTA, no a que cambia: el operario tiene que poder mirar
 * la barra y saber en que unidad esta leyendo la hoja sin tener que deducirlo.
 * A que cambia lo dice el tooltip. */
const OC_UNIDAD_BTN = { mbk: '⚖️ Dosis: MBK (polvo)', sol: '🧪 Dosis: Solución d1030' };

/** Pinta la etiqueta y el tooltip del boton segun la unidad vigente. */
function _ocPintarBotonUnidad(){
  const b = $('btnOcUnidad');
  if (!b) return;
  b.textContent = OC_UNIDAD_BTN[_ocUnidad] || OC_UNIDAD_BTN.sol;
  b.title = 'Estás dosificando en ' + _ocUni().col.replace(' (g)', ' (polvo, se pesa)')
                                              .replace('mL sol.', 'solución d1030 (se mide con probeta)') +
            '. Clic para pasar a ' + (OC_UNIDAD_BTN[_ocOtraUnidad()] || '').replace(/^\S+\s/, '') +
            '. Es la misma dosis de SO₂ dicha de dos maneras.';
}

/* Modo de cada lote, para el papel y para la ejecucion: 'generica' (un
 * renglon por tipo de vasija) o 'barril' (un renglon por barril). Sin eleccion
 * a mano manda modoPorDefecto. Vive en memoria, como la unidad; lo que se
 * imprime queda guardado en la orden. */
let _ocModos = new Map();            // lote -> modo elegido a mano
/* Barril por barril (l.por_vasija): siempre por barril, ignora _ocModos (el
 * select se deshabilita en la Tarea 5; esto es el respaldo). */
const _ocModoDe = l => l.por_vasija ? 'barril' : (_ocModos.get(l.lote) || modoPorDefecto(l.barricas));

/* Lotes que se sacaron SOLOS de la orden por estar en una orden pendiente.
 * Se distinguen de los que destildo el usuario para poder devolverlos cuando
 * esa orden se ejecuta o se anula, sin pisar lo que el usuario eligio. */
let _ocPendAuto = new Set();

function _ocMarcarPendientes(){
  const pend = lotesPendientes(DATOS().ordenes_correccion);
  for (const l of (_ocOrden && _ocOrden.lotes) || []){
    /* Si el usuario YA lo habia destildado a mano, eso no se toca: solo se
     * marca como auto-excluido (y se guarda en _ocPendAuto para poder
     * devolverlo solo) el lote que esta orden excluye por si misma. Si no, un
     * lote destildado a mano que ademas cae en una orden pendiente quedaria
     * reincluido solo cuando esa orden deja de estar pendiente, pisando la
     * eleccion del usuario. */
    if (pend.has(l.lote) && !_ocPendAuto.has(l.lote) && !_ocExcluidos.has(l.lote)){
      _ocExcluidos.add(l.lote); _ocPendAuto.add(l.lote);
    }
  }
  for (const lote of [..._ocPendAuto]){
    if (!pend.has(lote)){ _ocPendAuto.delete(lote); _ocExcluidos.delete(lote); }
  }
}

/* Prende o apaga los lotes en objetivo / corregidos. Al prender llegan
 * destildados (van a "Fuera de esta orden" y se tilda el que se quiere); al
 * apagar se van con todo lo que se les toco (inclusion, objetivo, dosis, modo). */
function _ocPonerActivables(on){
  on = !!on;
  if (on === _ocActivos) return;
  _ocActivos = on;
  if (!on){
    for (const lote of _ocActVistos){
      _ocExcluidos.delete(lote);
      _ocObjetivos.delete(lote); _ocExcepciones.delete(lote); _ocSolicitudesEx.delete(lote);
      _ocManuales.delete(lote);
      _ocModos.delete(lote);
    }
    _ocActVistos.clear();
  }
  _ocSumarActivablesNuevos();
  _ocOrden = ordenConActivables(_ocOrdenSrv, _ocActivos);
}

/* Con el boton prendido, los activables que todavia no se vieron entran
 * destildados. */
function _ocSumarActivablesNuevos(){
  if (!_ocActivos) return;
  for (const l of activablesDe(_ocOrdenSrv)){
    if (_ocActVistos.has(l.lote)) continue;
    _ocActVistos.add(l.lote);
    _ocExcluidos.add(l.lote);
  }
}

function _ocPintarBotonActivables(){
  const b = $('btnOcActivables');
  if (!b) return;
  const n = activablesDe(_ocOrdenSrv).length;
  b.textContent = (_ocActivos ? '🔒 Quitar lotes en objetivo / corregidos' : '🔓 Lotes en objetivo / corregidos') + ' (' + n + ')';
  b.classList.toggle('on', _ocActivos);
  b.setAttribute('aria-pressed', String(_ocActivos));
  b.disabled = !n && !_ocActivos;
  b.title = _ocActivos
    ? 'Saca de la pantalla los lotes que la orden no proponía (y lo que se les tocó). También se apaga solo al imprimir o al Recargar.'
    : 'Suma por esta vez los lotes que ya están en objetivo o se corrigieron hace poco: aparecen en "Fuera de esta orden" para tildar los que quieras corregir a mano.';
}

function _ocPintarAvisoPendientes(){
  const el = $('ocPendAviso');
  if (!el) return;
  const pend = (DATOS().ordenes_correccion || []).filter(o => o && o.estado === 'pendiente');
  el.innerHTML = pend.length
    ? '<div class="msg info">⏳ Hay ' + pend.length + (pend.length === 1 ? ' orden pendiente' : ' órdenes pendientes') +
      ' de ejecutar: ' + pend.map(o => '<b>' + esc(o.numero) + '</b>').join(' · ') +
      // Las órdenes pendientes se ven y se ejecutan en la sección Órdenes de trabajo
      // (el Registro ya no las lista). Vale igual en modo órdenes.
      ' <a href="/ordenes/?v=pendientes&amp;tipo=correccion">Ver en Órdenes de trabajo →</a></div>'
    : '';
}

/* Espejo de la formula de motor_fml.calcular_correccion_so2. Se recalcula en el
 * cliente solo para responder al toque del objetivo sin ir al servidor. La
 * fuente de verdad es Python: si cambia alla, cambia aca.
 *
 * mbk = ((dif * L * 1.5) / 1000) * 2  -- en gramos
 * ml  = (dif * L * 1.5) / 55           -- en mL de solucion */
export function _dosis(diferencia, litros){
  return {
    mbk_g:       ((diferencia * litros * 1.5) / 1000) * 2,
    ml_solucion:  (diferencia * litros * 1.5) / 55,
  };
}

function _ocTecho(lote){
  const l = (DATOS().lotes || []).find(x => String(x.lote ?? '') === String(lote ?? ''));
  return techoSo2OT(DATOS().config, l?.variedad, l?.proyecto);
}
function _ocAdmin(){ return window.CIW?.rol === 'admin'; }
function _ocLimiteOrden(lote){
  const e = _ocExcepciones.get(lote);
  return _ocAdmin() && e && _ocObjetivos.get(lote) === e.objetivo ? e.objetivo : _ocTecho(lote);
}
function _ocNotasExcepcion(filas){
  return filas.filter(f => f.tipo === 'lote' && _ocExcepciones.has(f.lote.lote)).map(f => {
    const e = _ocExcepciones.get(f.lote.lote);
    return `EXCEPCIÓN SO₂ · Lote ${f.lote.lote} · ${e.objetivo} ppm · ${e.motivo} · verificar OT guardada antes de ejecutar`;
  }).join(' | ');
}
function _ocProblemaTecho(filas){
  for (const f of filas){
    const techo = _ocLimiteOrden(f.lote.lote);
    if (f.tipo === 'lote' && f.objetivo > techo) return `Lote ${f.lote.lote}: el objetivo supera ${techo} ppm. Recargá la propuesta o corregí el objetivo.`;
    if (f.tipo !== 'barrica') continue;
    if ((_ocObjetivos.get(f.lote.lote) ?? f.barrica.objetivo) != null && (_ocObjetivos.get(f.lote.lote) ?? f.barrica.objetivo) > techo) return `Lote ${f.lote.lote}: una vasija supera el techo de ${techo} ppm.`;
    const actual = f.lote.por_vasija ? f.barrica.so2_libre : f.lote.so2_libre;
    const problema = problemaDosisSo2(actual, f.barrica.litros_usados, f.dosis, techo);
    if (problema) return `Lote ${f.lote.lote}, vasija ${f.barrica.num || f.barrica.vasija || 'sin identificar'}: ${problema}`;
  }
  return '';
}

/** Objetivo vigente de un lote: el pisado a mano si hay, si no el del servidor. */
function _objetivoDe(l){
  const pisado = _ocObjetivos.get(l.lote);
  return (pisado != null && Number.isFinite(pisado)) ? pisado : l.objetivo_libre;
}

/* Aplana la respuesta a filas de papel. Cada lote aporta una fila separadora
 * mas una fila por barrica, en ese orden, para que el paginado a 25 no separe
 * una barrica de su encabezado de lote mas de lo inevitable.
 *
 * Funcion pura: recibe los datos y los conjuntos en vez de leer el estado del
 * modulo, para poder testearse sin side effects. El wrapper de modulo
 * _ocBuildRowsLocal() la llama con el estado vigente.
 *
 * @param {object} orden  - respuesta del endpoint (puede ser null)
 * @param {Set}    excluidos - Set de lotes excluidos (strings)
 * @param {Map}    objetivos - Map lote -> objetivo pisado a mano (puede ser null)
 * @param {Array}  filtros   - descriptores de filtro multi (puede ser [] para no filtrar)
 * @param {object} sort      - {key, dir} de ordenarLotesOc (sin key = urgencia)
 */
export function _ocBuildRows(orden, excluidos, objetivos, filtros, sort){
  if (!orden) return [];
  const excl = excluidos || new Set();
  const objs = objetivos || new Map();
  const filt = filtros || [];
  const filas = [];
  const objetivoDe = l => {
    const p = objs.get(l.lote);
    return (p != null && Number.isFinite(p)) ? p : l.objetivo_libre;
  };
  for (const l of ordenarLotesOc(orden.lotes, sort, objetivoDe)){
    if (excl.has(l.lote)) continue;
    if (filt.length && !pasaMulti(l, filt)) continue;
    const pisado = objs.get(l.lote);
    const hayPisado = pisado != null && Number.isFinite(pisado);
    const objetivo = hayPisado ? pisado : l.objetivo_libre;
    const diferencia = objetivo - l.so2_libre;
    /* Acumular totales desde las dosis de las barricas: el total es la suma
     * por construccion, nunca puede divergir del precalculado del servidor. */
    let mbk_total = 0, ml_total = 0;
    /* Un lote en objetivo (sumado a mano) da diferencia <= 0: dosis 0, nunca
     * negativa, hasta que se le suba el objetivo o se escriba la dosis. */
    const difDosis = diferenciaDosificable(objetivo, l.so2_libre);
    const dosisBarricas = l.barricas.map(b => {
      let d;
      if (l.por_vasija){
        /* Barril por barril: cada vasija con su SO2 y su objetivo (el pisado
         * del lote manda para todas). Sin SO2 propio: dosis vacia, a mano. */
        const objB = hayPisado ? pisado : b.objetivo;
        d = (b.so2_libre == null || objB == null)
          ? { mbk_g: null, ml_solucion: null }
          : _dosis(diferenciaDosificable(objB, b.so2_libre), b.litros_usados);
      } else d = _dosis(difDosis, b.litros_usados);
      if (d.mbk_g != null) mbk_total += d.mbk_g;
      if (d.ml_solucion != null) ml_total += d.ml_solucion;
      return { barrica: l.por_vasija && hayPisado && b.so2_libre != null ? { ...b, objetivo: pisado } : b, dosis: d };
    });
    /* pisado: el objetivo lo escribio el usuario (la planilla no lo adivina
     * comparando numeros). */
    filas.push({ tipo: 'lote', lote: l, objetivo, diferencia,
                 mbk_total_g: mbk_total, ml_total, ...(hayPisado ? { pisado: true } : {}) });
    for (const { barrica, dosis } of dosisBarricas){
      filas.push({ tipo: 'barrica', lote: l, barrica, dosis });
    }
  }
  return filas;
}

/* Wrapper que llama a _ocBuildRows con el estado del modulo. */
function _ocBuildRowsLocal(){
  const base = aplicarManuales(_ocBuildRows(_ocOrden, _ocExcluidos, _ocObjetivos, _ocFiltros(), _ocSort), _ocManuales);
  const conFiltro = _descVas.some(d => d.set.size) ? filtrarVasijas(base, _ocPasaVasija) : base;
  return ordenarVasijas(conFiltro, _ocSort, _ocUni());
}

/* Una vasija pasa si cumple todos los embudos de nivel vasija, con el valor
 * tal como se lee en la celda. */
function _ocPasaVasija(f){
  const u = _ocUni();
  return _descVas.every(d => !d.set.size || d.set.has(String(valorVasija(d.k, f, u)).trim()));
}

/* Los filtros de los embudos mas el buscador, con la forma que espera
 * pasaMulti ({set, match}). El buscador no tiene Set propio: "activo" es que
 * haya texto. */
const _descBusca = {
  set: { get size(){ return _ocBusca ? 1 : 0; } },
  match: l => String(l.lote ?? '').toLowerCase().includes(_ocBusca.toLowerCase()),
};
function _ocFiltros(){ return _ocBusca ? [..._descOc, _descBusca] : _descOc; }

/* Total de un lote en la unidad vigente, con las dosis a mano: es el numero de
 * la columna de la dosis, y por eso tambien lo que filtra su embudo. */
function _ocTotalLote(l){
  const dif = diferenciaDosificable(_objetivoDe(l), l.so2_libre);
  const man = _ocManuales.get(l.lote);
  const u = _ocUni();
  let t = 0;
  (l.barricas || []).forEach((b, i) => {
    const m = man && man.get(claveVasija(b, i));
    t += u.de(m || _dosis(dif, b.litros_usados));
  });
  return t;
}

/** Agrupa los suprimidos por OT, conservando el orden de aparicion.
 *  Puro y exportado: es la unica logica de la tabla que vale la pena testear. */
export function _ocAgruparPorOt(suprimidos){
  const orden = [];
  const porOt = new Map();
  for (const s of (suprimidos || [])){
    /* Se agrupa por el valor CRUDO, no por una etiqueta bonita: el boton de
     * "cancelar toda la OT" despues filtra suprimidos[] por este mismo valor, y
     * si aca se sustituyera un vacio por "(sin OT)" el filtro no encontraria
     * nada y el boton no haria nada en silencio. Lo bonito es cosa del render. */
    const ot = String(s.ot ?? '');
    if (!porOt.has(ot)){ porOt.set(ot, []); orden.push(ot); }
    porOt.get(ot).push(s);
  }
  return orden.map(ot => ({ ot, lotes: porOt.get(ot) }));
}

/* Tabla de los lotes que la regla dejo fuera, con el boton para cancelar la
 * correccion que los saco.
 *
 * Se agrupa por OT porque el error tipico no es "me equivoque en este lote"
 * sino "ejecute la orden equivocada", y deshacer 106 lotes de a uno no es una
 * opcion. Cada grupo trae su boton de cancelar todo, y cada fila el suyo. */
function _ocTablaSuprimidos(supr){
  if (!supr.length) return '';
  const grupos = _ocAgruparPorOt(supr);
  const filas = grupos.map(g =>
    '<tr class="oc-sep">' +
      '<td colspan="5"><b>OT ' + esc(g.ot || '(sin OT)') + '</b> · ' + g.lotes.length + ' lote' +
        (g.lotes.length === 1 ? '' : 's') + '</td>' +
      '<td class="c"><button class="btn" data-oc-anular-ot="' + escA(g.ot) + '" ' +
        'title="Cancelar la corrección de los ' + g.lotes.length + ' lotes de esta OT">' +
        '↩ Cancelar toda la OT</button></td>' +
    '</tr>' +
    g.lotes.map(s =>
      '<tr>' +
        '<td><b>' + esc(s.lote) + '</b></td>' +
        '<td>' + esc(s.variedad || '') + '</td>' +
        '<td class="c">' + esc(_fechaCorta(s.fecha)) + '</td>' +
        '<td class="num">' + (s.so2_prev == null ? '—' : fmt(s.so2_prev, 1)) + '</td>' +
        '<td style="font-size:12px;color:var(--muted)">' + esc(s.motivo || '') + '</td>' +
        /* El N de OT viaja en el boton porque (lote, fecha) NO identifica una
         * correccion: hay claves duplicadas en los datos reales. */
        '<td class="c"><button class="btn" data-oc-anular="' + escA(s.lote) + '" ' +
          'data-oc-anular-fecha="' + escA(s.fecha || '') + '" ' +
          'data-oc-anular-otn="' + escA(s.ot || '') + '" ' +
          'title="Cancelar esta corrección: el lote vuelve a proponerse">↩ Cancelar</button></td>' +
      '</tr>').join('')
  ).join('');

  return '<div class="card" style="margin-top:4px">' +
    '<h2 style="font-size:15px">Ya corregidos, no se proponen (' + supr.length + ')</h2>' +
    '<div style="color:var(--muted);font-size:12px;margin-bottom:8px">' +
      'Estos lotes salieron de la orden porque ya se corrigieron. Si alguna corrección ' +
      'se registró por error, cancelala y el lote vuelve a proponerse. La entrada no se ' +
      'borra: queda en la bitácora marcada como anulada, con quién y cuándo.</div>' +
    '<div class="scroll"><table id="ocTablaSupr"><thead><tr>' +
      '<th>Lote</th><th>Variedad</th><th class="c">Fecha</th>' +
      '<th class="num">SO₂ previo</th><th>Motivo</th><th class="c">Acción</th>' +
    '</tr></thead><tbody>' + filas + '</tbody></table></div></div>';
}

let _ocAnulEnVuelo = false;

/* Anula las correcciones de los lotes indicados, guarda y recarga la orden.
 *
 * Mismo contrato que ejecutar, por los mismos motivos: se escribe en DATOS(),
 * se guarda, y si el guardado falla se REVIERTE lo escrito y se avisa. Sin el
 * rollback, un guardado fallido dejaria correcciones anuladas en memoria que el
 * proximo guardado de cualquier otra pantalla persistiria.
 *
 * @param {Array} objetivos - [{lote, fecha, ot}] tal como vienen de
 *   suprimidos[]. El `ot` NO es opcional en la practica: (lote, fecha) no
 *   identifica una correccion, hay claves duplicadas en los datos reales. */
async function _ocAnularCorrecciones(objetivos, descripcion){
  /* Guarda de reentrada, por el mismo motivo que en ejecutar: dos llamadas
   * superpuestas sobre el mismo lote hacen que el snapshot de la segunda
   * capture lo que escribio la primera, y si los dos guardados fallan el
   * rollback restaura una anulacion que nunca se guardo. */
  const msg0 = $('ocMsg');
  if (_ocAnulEnVuelo){
    if (msg0) msg0.innerHTML = '<div class="msg info">Ya se está cancelando algo. ' +
      'Esperá a que termine.</div>';
    return;
  }
  if (!objetivos.length){
    /* Nunca salir mudo: si el usuario apreto un boton, algo tiene que pasar.
     * Este caso se da si se aprieta durante la recarga, con _ocOrden en null. */
    if (msg0) msg0.innerHTML = '<div class="msg err">No hay nada para cancelar en este momento. ' +
      'Puede que la orden se esté recargando; probá de nuevo en un segundo.</div>';
    return;
  }
  if (!await confirmar({
    titulo: 'Cancelar corrección',
    texto: 'Vas a cancelar la corrección de ' + descripcion + '.\n\n' +
      'La entrada NO se borra: queda en la bitácora marcada como anulada, con tu nombre y la fecha. ' +
      (objetivos.length === 1 ? 'El lote vuelve' : 'Los lotes vuelven') + ' a proponerse en la orden.',
    si: 'Cancelar corrección', no: 'Volver', peligro: true })) return;

  _ocAnulEnVuelo = true;
  try {
    const quien = { por: usuarioActual() || 'desconocido',
                    cuando: new Date().toISOString().slice(0, 10) };
    const snaps = [];
    for (const o of objetivos){
      const s = anularCorreccion(DATOS().analisis, o.lote, o.fecha, o.ot, quien);
      if (s) snaps.push(s);
    }

    if (!snaps.length){
      const m = $('ocMsg');
      if (m) m.innerHTML = '<div class="msg err">No se encontró la corrección a cancelar. ' +
        'Puede que ya se haya cancelado desde otra PC; probá con 🔄 Recargar.</div>';
      return;
    }

    markDirty();
    let ok = false;
    try { ok = await guardar(); } catch (_) { ok = false; }
    if (!ok){
      /* Sobre el DATOS() de AHORA, no a traves de las referencias de antes del
       * await: si guardar() paso por un 409, fusiono y reemplazo todos los
       * objetos, y revertir los viejos no deshacia nada (ver
       * revertirAnulaciones). markDirty de nuevo para que el borrador local,
       * que guardar() escribio CON las anulaciones, pase a ser el revertido:
       * si no, "Recargar y recuperar" las traeria de vuelta. */
      revertirAnulaciones(DATOS().analisis, snaps);
      markDirty();
      const m2 = $('ocMsg');
      if (m2) m2.innerHTML = '<div class="msg err">No se pudo guardar. No se canceló nada.</div>';
      else avisar('No se pudo guardar. No se canceló nada.', { tipo: 'mal' });
      return;
    }

    _ocOrden = null;
    await _ocCargar();
    _ocRenderTabla();
    _ocPintarPaginas();

    const m3 = $('ocMsg');
    if (!m3) return;

    /* Si la recarga fallo, _ocCargar dejo _ocOrden en null y su propio error en
     * ocMsg. NO se puede afirmar que el lote volvio: no hay con que compararlo.
     * Pisar ese error con un verde que promete "ya vuelve a proponerse" seria
     * el mismo modo de falla que este bloque viene a cerrar, por otra puerta. */
    if (!_ocOrden){
      m3.innerHTML = '<div class="msg info">Se guardaron ' + snaps.length +
        ' anulaciones, pero no se pudo recargar la orden para confirmarlas. ' +
        'Apretá 🔄 Recargar para verificar que los lotes volvieron.</div>';
      return;
    }

    /* NO alcanza con contar lo que se marco: hay que confirmar que el lote
     * VOLVIO. Marcar una entrada y que el servidor siga suprimiendo el lote es
     * exactamente el modo de falla peligroso (el vino no recibe SO2 y la
     * pantalla dice que si), y solo se detecta comparando contra el
     * suprimidos[] recien recargado. Cualquier asimetria futura entre este
     * lookup y el de Python se vuelve ruidosa en vez de silenciosa.
     *
     * Se compara por (lote, fecha, ot), no por lote solo, para separar dos
     * casos que se ven iguales desde afuera:
     *   - sobrevive con OTRA clave: el lote tenia una correccion previa ademas
     *     de la que se cancelo. Es legitimo y ademas frecuente (16 claves de
     *     los datos reales tienen dos o mas correcciones). Informativo.
     *   - sobrevive con LA MISMA clave: no se movio nada. Ese es el rojo. */
    const clave = x => String(x.lote) + '|' + String(x.fecha ?? '') + '|' + String(x.ot ?? '');
    const supr = _ocOrden.suprimidos || [];
    const clavesVivas = new Set(supr.map(clave));
    const lotesVivos = new Set(supr.map(s => String(s.lote)));

    const noSeMovieron = objetivos.filter(o => clavesVivas.has(clave(o)));
    const conOtraCorreccion = objetivos.filter(
      o => !clavesVivas.has(clave(o)) && lotesVivos.has(String(o.lote)));

    if (noSeMovieron.length){
      const ls = noSeMovieron.map(o => String(o.lote));
      m3.innerHTML = '<div class="msg err"><b>Ojo:</b> se guardaron ' + snaps.length +
        ' anulaciones, pero ' + ls.length + ' lote' + (ls.length === 1 ? '' : 's') +
        ' sigue' + (ls.length === 1 ? '' : 'n') + ' sin proponerse con la MISMA ' +
        'corrección que cancelaste: ' + esc(ls.join(', ')) + '. Algo no se aplicó ' +
        'como esperabas. Revisá la bitácora antes de dosificar a mano.</div>';
      return;
    }
    if (conOtraCorreccion.length){
      const ls = conOtraCorreccion.map(o => String(o.lote));
      m3.innerHTML = '<div class="msg info">✓ Se canceló la corrección de ' +
        snaps.length + ' lote' + (snaps.length === 1 ? '' : 's') + '. ' +
        esc(ls.join(', ')) + ' sigue' + (ls.length === 1 ? '' : 'n') +
        ' sin proponerse porque tenía' + (ls.length === 1 ? '' : 'n') +
        ' otra corrección previa: si esa también fue un error, cancelala desde ' +
        'la lista de abajo.</div>';
      return;
    }
    m3.innerHTML = '<div class="msg ok">✓ Se canceló la corrección de ' +
      snaps.length + ' lote' + (snaps.length === 1 ? '' : 's') +
      ', que ya vuelve' + (snaps.length === 1 ? '' : 'n') + ' a proponerse. ' +
      'Quedan en la bitácora marcadas como anuladas.</div>';
  } finally {
    _ocAnulEnVuelo = false;
  }
}

/* dd/mm de un ISO. Devuelve el original si no tiene la forma esperada: un
 * cartel con la fecha rara es mejor que un cartel sin fecha. */
function _fechaCorta(iso){
  const p = String(iso || '').split('-');
  return p.length === 3 ? (p[2] + '/' + p[1]) : String(iso || '');
}

/** Cartel de "este lote ya se corrigio". Dos intensidades:
 *
 *  - normal: el lote volvio porque el SO2 se movio mas de 5 ppm desde la
 *    correccion. Informativo.
 *  - fuerte (sin_analisis): vencio la ventana de 30 dias y todavia NADIE lo
 *    remidio. El SO2 de la fila es anterior a la correccion, asi que la dosis
 *    se esta calculando sobre un numero viejo. Este cartel no caduca: solo se
 *    apaga cuando aparece un analisis nuevo. */
export function _ocCartelCorregido(l){
  const c = l && l.corregido_en;
  if (!c) return '';
  const f = _fechaCorta(c.fecha);
  if (c.sin_analisis){
    return '⚠⚠ corregido en OT ' + c.ot + ' el ' + f +
           ' y sin análisis desde entonces — el SO₂ de esta fila es ANTERIOR a esa corrección';
  }
  return '⚠ corregido en OT ' + c.ot + ' el ' + f +
         (c.so2_prev != null ? ' — SO₂ era ' + Number(c.so2_prev).toFixed(1) : '');
}

/** Aviso por grupo. Los tres numeros de litros van juntos: un aviso pelado no le
 *  dice al operario cuanto volumen queda sin tratar.
 *  tanque_grande no es un error: el mapa no ve vasijas de mas de 500 L por diseno. */
export function _ocAviso(l){
  if (l.grupo === 'marcado'){
    const faltan = (l.litros_declarados || 0) - (l.litros_mapa || 0);
    return '⚠ declara ' + (l.litros_declarados || 0) + ' L · el mapa ve ' + (l.litros_mapa || 0) + ' L · ' +
           (faltan > 0 ? 'faltan ' + faltan + ' L' : (-faltan) + ' L de más') +
           ' · severidad ' + (l.severidad || '');
  }
  if (l.grupo === 'sin_ubicar'){
    return '⚠⚠ el mapa no ubica ninguna barrica · dosis sobre los litros declarados';
  }
  if (l.grupo === 'tanque_grande'){
    return 'vasija grande, fuera del mapa por diseño';
  }
  return '';
}

/* El papel sigue el formato de la B219 (orden en Excel de bodega): lote, año,
 * numero de barril y dosis. Todo lo demas (pH, SO2, objetivo, molecular,
 * capacidad, estado, litros, avisos y posicion) se sigue calculando y se ve en
 * la tabla de pantalla, pero no se imprime: al operario no le sirve para
 * dosificar. El armado de la fila vive en orden-correccion-papel.js (puro). */
function _ocRenderFilaLote(x){
  return filaPapelLote(x, _ocUni(), { editable: true });
}

/* Avisos del lote. El de la orden pendiente va primero, despues el cartel de
 * "ya se corrigio" (dice algo sobre la validez del SO2 que se esta usando, y
 * eso pesa mas que el estado del inventario) y al final el del cruce. */
function _ocAvisosDe(l){
  const enOrden = lotesPendientes(DATOS().ordenes_correccion).get(l.lote);
  const manual = l.fuera === 'en_objetivo'
    ? '✋ ya estaba en objetivo: subile el objetivo o escribí la dosis en el renglón'
    : l.fuera === 'corregido' ? '✋ sumado a mano: la orden no lo proponía por la corrección reciente' : '';
  return [_ocExcepciones.has(l.lote) ? `⚠ Excepción solicitada: ${_ocExcepciones.get(l.lote).objetivo} ppm · ${_ocExcepciones.get(l.lote).motivo}` : "", cartelPorVasija(l), manual, enOrden ? '⏳ en ' + enOrden + ' sin ejecutar' : '', _ocCartelCorregido(l), _ocAviso(l),
          ...(l.avisos_vasija || [])].filter(Boolean);
}

function _ocPintarPaginas(){
  const cont = $('ocPaginas');
  if (!cont) return;

  const fechaISO = _ocFecha;
  const p = fechaISO.split('-');
  const fechaTxt = p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : fechaISO;
  const meta = { fecha: fechaISO, fechaTxt, anio: p.length === 3 ? p[0] : '',
                 nro: _ocNum };
  const banda = ['CORRECCIÓN SO₂', '', 'Bodega'];

  const filas = _ocBuildRowsLocal();
  _ocFilasPapel = filasPapelPorModo(filas, _ocModoDe, _ocUni());
  /* idx: el campo de dosis dice su renglon. primero: el primer renglon de cada
   * lote lleva arriba la banda de pantalla, que no cuenta como renglon. */
  let previo = null;
  _ocFilasPapel.forEach((g, i) => {
    g.idx = i;
    g.primero = g.lote.lote !== previo;
    previo = g.lote.lote;
  });
  /* La hoja ES la pantalla (como la Orden de muestras): el encabezado, la
   * dosis de cada renglon y los controles de cada lote se tocan encima. Ver
   * _ocCablearHoja y _ocCablearControles. */
  cont.innerHTML = pintarHojas({
    editable: true,
    filas: _ocFilasPapel,
    porPagina: HOJA_POR_PAGINA,
    titulo: _ocTitulo,
    meta, banda,
    emitio: _ocEmitio,
    recibio: _ocRecibio,
    /* Las instrucciones se escriben encima (data-campo="instr"); vacias no
     * imprimen nada (el placeholder es transparente al imprimir). */
    antesBanda: campoHoja('instr', _ocInstr[_ocUnidad], { tipo: 'area', cls: 'oh-instr', ph: 'Instrucciones (opcional)' }),
    nota: [_ocUni().nota.replace('cada barrica', 'cada vasija'), esc(_ocNotasExcepcion(filas))].filter(Boolean).join(" | "),
    claseTabla: 'oh-tabla-justa',
    colgroup: COLGROUP_PAPEL_LOTE,
    thead: theadPapelLote(_ocUni()),
    columnas: COLUMNAS_PAPEL_LOTE,
    textoVacio: 'No hay lotes a corregir para los criterios elegidos.',
    renderFila: _ocRenderFilaLote,
  });
  _ocPintarPlanilla();
}

/* Organico por numero de lote, con la ficha de la pestaña Lotes. */
function _ocEsOrganico(lote){
  const L = String(lote ?? '').trim();
  return esOrganico((DATOS().lotes || []).find(x => String(x.lote ?? '').trim() === L));
}

/* Lotes destildados que respetan los filtros: la lista "Fuera de esta orden"
 * de la hoja y las filas grises de la planilla. */
function _ocLotesFuera(){
  if (!_ocOrden) return [];
  return ordenarLotesOc(_ocOrden.lotes, _ocSort, _objetivoDe)
    .filter(l => _ocExcluidos.has(l.lote) && pasaMulti(l, _ocFiltros()));
}

function _ocMotivoFuera(l){
  const en = lotesPendientes(DATOS().ordenes_correccion).get(l.lote);
  if (en) return '⏳ en ' + en + ' sin ejecutar';
  if (l.fuera) return '✋ ' + (ETIQUETA_FUERA[l.fuera] || l.fuera);
  return 'sacado a mano';
}

/* La planilla: misma fuente que la hoja (_ocBuildRowsLocal). */
function _ocPintarPlanilla(){
  const cont = $('ocPlanilla');
  if (!cont) return;
  cont.innerHTML = pintarPlanilla({
    filas: _ocBuildRowsLocal(),
    fuera: _ocLotesFuera(),
    u: _ocUni(),
    modoDe: _ocModoDe,
    organico: _ocEsOrganico,
    avisosDe: _ocAvisosDe,
    motivoFuera: _ocMotivoFuera,
    cab: { nro: _ocNum, fecha: _ocFecha },
    encabezado: _ocEncabezadoPlanilla,
  });
  _ocPintarAvisoFiltros();
}

function _ocPonerVista(v){
  _ocVista = v === 'hoja' ? 'hoja' : 'planilla';
  if (_FS) _FS.guardar('lotes:ocvista', _ocVista);
  const plan = _ocVista === 'planilla';
  if ($('ocPlanilla')) $('ocPlanilla').hidden = !plan;
  if ($('ocPaginas')) $('ocPaginas').hidden = plan;
  /* Las notas de abajo (sin volumen, ya corregidos con su Cancelar) son de
   * trabajo, no del papel: solo en la planilla. */
  ['ocSinVolumen', 'ocSuprimidos'].forEach(id => { if ($(id)) $(id).hidden = !plan; });
  /* Vista preliminar: la hoja como sale impresa (sin recuadros ni marcas de
   * pantalla, ver .oc-prelim en index.html); se sigue escribiendo encima. */
  if ($('tab-ordencorr')) $('tab-ordencorr').classList.toggle('oc-prelim', !plan);
  _ocPintarAvisoFiltros();
  document.querySelectorAll('[data-oc-vista]').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.ocVista === _ocVista)));
}

async function _ocCargar(){
  const msg = $('ocMsg');
  /* Capturado ANTES del fetch: si el año cambia mientras esto esta en vuelo,
   * lo que llegue fue calculado para el año VIEJO. No hay _cargando aca (a
   * diferencia de vista-cruce.js) porque esta vista se vuelve a pedir sola en
   * cada render (renderOrdenCorreccion la llama siempre), así que alcanza con
   * descartar la respuesta vieja sin re-disparar nada desde aca. */
  const anios = queryAnios();
  try {
    const r = await fetch(API+'/orden-correccion' + (anios ? '?anios=' + anios : ''));
    if (queryAnios() !== anios) return;   // ya no vale: se descarta
    if (r.status === 503){
      const e = await r.json();
      /* Sin mapa no hay numeros de barril, que es el punto del subsistema. El
       * mensaje tiene que decir eso, no dejar una pantalla vacia. */
      if (msg) msg.innerHTML = '<div class="msg err">El mapa de barriles no está ' +
        'disponible, así que no se pueden emitir órdenes con número de barril. ' +
        esc(e.error || '') + '</div>';
      _ocOrdenSrv = _ocOrden = null;
      return;
    }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    _ocOrdenSrv = await r.json();
    _ocSumarActivablesNuevos();
    _ocOrden = ordenConActivables(_ocOrdenSrv, _ocActivos);
    if (msg) msg.innerHTML = '';
  } catch (e){
    if (queryAnios() !== anios) return;   // igual, un error de la peticion vieja tampoco vale
    if (msg) msg.innerHTML = '<div class="msg err">No se pudo cargar la orden: ' + esc(String(e)) + '</div>';
    _ocOrdenSrv = _ocOrden = null;
  }
}

/* Todo lo de la pantalla que NO es la hoja: el chip de la barra, el sello del
 * mapa y las notas de abajo (los lotes fuera de esta orden son filas grises
 * de la planilla). Se llama
 * junto con _ocPintarPaginas en cada cambio. (Se sigue llamando _ocRenderTabla
 * porque antes pintaba la tabla de al lado, que ahora vive dentro de la hoja.)
 *
 * I3+#8: el chip sale de las filas VISIBLES (filtradas y no excluidas), no del
 * resumen del servidor, que no cambia al destildar. */
function _ocRenderTabla(){
  _ocPintarBotonActivables();
  const selloEl = $('ocSelloPantalla');
  if (selloEl){
    const p = (_ocOrden && _ocOrden.procedencia) || {};
    selloEl.textContent = 'Mapa v' + (p.version || '?') + ' · actualizado ' + (p.actualizado || '?') + ' · ' + (p.archivo || '?');
  }

  /* I4: la nota de sin_volumen se actualiza en cada render, no solo al montar
   * la vista: en la primera visita _ocOrden todavia es null. */
  const sinVolEl = $('ocSinVolumen');
  if (sinVolEl){
    const sinVol = (_ocOrden && _ocOrden.sin_volumen) || [];
    sinVolEl.innerHTML = sinVol.length
      ? '<div class="note"><b>Sin volumen declarado (' + sinVol.length + '):</b> ' + esc(sinVol.join(', ')) + '</div>'
      : '';
  }

  /* Los suprimidos NO desaparecen en silencio: mismo criterio que sin_volumen y
   * no_calculables. Los que esperan analisis son, ademas, el insumo natural de
   * la Orden de muestras. */
  const suprEl = $('ocSuprimidos');
  if (suprEl) suprEl.innerHTML = _ocTablaSuprimidos((_ocOrden && _ocOrden.suprimidos) || []);

  const resEl = $('ocResumen');
  if (!_ocOrden){
    if (resEl) resEl.textContent = '';
    return;
  }

  /* El chip dice cuanto insumo hay que preparar, en la unidad elegida. */
  const filas = _ocBuildRowsLocal();
  const u = _ocUni();
  const lotes = filas.filter(f => f.tipo === 'lote');
  const barricas = filas.filter(f => f.tipo === 'barrica').length;
  if (resEl) resEl.textContent = lotes.length + ' lotes · ' + barricas + ' barricas · ' +
    u.chip(lotes.reduce((s, f) => s + u.total(f), 0));

}

/* Controles de cada lote (banda de la hoja y lista de "fuera de esta orden"):
 * incluirlo, el modo y el objetivo. Delegados: la hoja y la lista se rehacen
 * enteras en cada repintado, sus contenedores no (se recrean solo al volver a
 * la pestaña, asi que los listeners no se apilan). */
function _ocCablearControles(raiz){
  if (!raiz) return;
  raiz.addEventListener('change', e => {
    /* Casilla de inclusion por lote */
    const cb = e.target.closest('input[type="checkbox"][data-oc-lote]');
    if (cb){
      const lote = cb.dataset.ocLote;
      if (cb.checked) _ocExcluidos.delete(lote); else { _ocExcluidos.add(lote); _ocSolicitudesEx.delete(lote); if (_ocExcepciones.delete(lote)) { _ocObjetivos.delete(lote); _ocManuales.delete(lote); } }
      if (cb.checked){
        const en = lotesPendientes(DATOS().ordenes_correccion).get(lote);
        if (en) avisar('El lote ' + lote + ' ya está en la ' + en + ', que todavía no se ejecutó. Si lo incluís, va a quedar en las dos órdenes.');
      }
      _ocRenderTabla();
      _ocPintarPaginas();
      return;
    }

    /* Modo del lote: cambia el papel (y lo que se guarda al imprimir). */
    const sel = e.target.closest('select[data-oc-modo]');
    if (sel){
      /* Por vasija el modo es fijo (barril): no guardar nada a mano. El
       * select se deshabilita en la Tarea 5; esto es el respaldo. */
      const lote = sel.dataset.ocModo;
      const loteData = (_ocOrden.lotes || []).find(l => l.lote === lote);
      if (loteData && loteData.por_vasija) return;
      _ocModos.set(lote, sel.value === 'barril' ? 'barril' : 'generica');
      _ocRepintarConFoco();
      return;
    }

    /* I2: Objetivo por lote, en 'change' (Tab/Enter/clic afuera) y no en
     * 'input': repintar en cada tecla destruiria el campo mientras se tipea.
     * Un objetivo <= SO2 actual daria dosis negativas: no se acepta. */
    const inp = e.target.closest('input[data-oc-obj]');
    if (!inp) return;
    const lote = inp.dataset.ocObj;
    const val = parseFloat(inp.value.replace(',', '.'));
    const loteData = (_ocOrden.lotes || []).find(l => l.lote === lote);
    const so2Actual = loteData ? (loteData.so2_libre || 0) : 0;
    /* Otro objetivo = otras dosis: las escritas a mano para este lote ya no valen. */
    _ocManuales.delete(lote);
    _ocExcepciones.delete(lote); _ocSolicitudesEx.delete(lote);
    if (Number.isFinite(val) && val > so2Actual && val <= _ocTecho(lote)) _ocObjetivos.set(lote, val);
    else {
      _ocObjetivos.delete(lote); _ocExcepciones.delete(lote); _ocSolicitudesEx.delete(lote);
      if (Number.isFinite(val) && val > _ocTecho(lote)) {
        const texto = 'El objetivo no puede superar el techo de ' + _ocTecho(lote) + ' ppm.';
        const ordenActual = _ocOrden;
        const solicitudId = {}; _ocSolicitudesEx.set(lote, solicitudId);
        const solicitud = async () => {
          if (!_ocAdmin() || _ocSolicitudesEx.get(lote) !== solicitudId || _ocOrden !== ordenActual || _ocExcluidos.has(lote) || val <= so2Actual) return;
          const motivo = await pedir({ titulo: 'Motivo de excepción SO₂', texto: `Lote ${lote}: objetivo excepcional ${val} ppm. Afecta únicamente este lote en esta OT y sus vasijas incluidas. Confirmá el criterio enológico antes de continuar.`, si: 'Autorizar excepción', campo: { requerido: true, placeholder: 'Motivo técnico obligatorio' } });
          if (!_ocAdmin() || _ocSolicitudesEx.get(lote) !== solicitudId || _ocOrden !== ordenActual || _ocExcluidos.has(lote) || !motivo) return;
          const limpio = motivo.trim();
          if (limpio.length < 5 || limpio.length > 500) { avisar('Ingresá un motivo técnico de 5 a 500 caracteres.', {tipo:'mal'}); return; }
          _ocManuales.delete(lote);
          _ocObjetivos.set(lote, val);
          _ocSolicitudesEx.delete(lote);
          _ocExcepciones.set(lote, { objetivo: val, motivo: limpio });
          _ocRepintarConFoco();
        };
        avisar(texto, _ocAdmin() && val > so2Actual ? { tipo: 'mal', ms: 15000, etiquetaAccion: 'Excepción', accion: solicitud } : { tipo: 'mal' });
      }
      else if (!Number.isNaN(val))
        avisar('El objetivo (' + val.toFixed(1) + ') debe ser mayor que el SO₂ actual (' + so2Actual.toFixed(1) + '). Se restauró el valor del servidor.');
    }
    _ocRepintarConFoco();
  });

  /* Enter en el objetivo = confirmar (dispara change al salir del campo). */
  raiz.addEventListener('keydown', e => {
    const inp = e.target.closest('input[data-oc-obj]');
    if (inp && e.key === 'Enter'){ e.preventDefault(); inp.blur(); }
  });
}

/* Los tres pasos que dispara cualquier cambio de filtro. */
function _ocAplicarFiltros(){
  _ocRenderTabla();
  _ocPintarPaginas();
}

/* pH y SO2 se filtran por el numero tal como se ve en la tabla (3.91, 15.0):
 * comparar los float crudos dejaria casillas que nadie puede distinguir. */
const _txtNum = (v, dec) => (v != null && Number.isFinite(v)) ? Number(v).toFixed(dec) : '';

function initFiltrosOc(){
  const lotesDe = () => (_ocOrden && _ocOrden.lotes) || [];

  _descOc = [
    {
      /* Lote va primero porque es por donde el operario busca. Son ~108
       * opciones, pero el panel multi-select trae su propio buscador y un
       * "Todas" que tilda lo que quedo visible: se tipea 261 y se tildan todos
       * los 261xx de una. cmpValores ordena numericamente, asi que salen
       * 26005, 26014, 26228 y no en orden alfabetico. */
      label: 'Lote',
      set: filtOc.lote,
      opciones: () => opcionesValores(lotesDe(), l => l.lote),
      match: matchValor(l => l.lote),
    },
    {
      label: 'Variedad',
      set: filtOc.variedad,
      opciones: () => opcionesValores(lotesDe(), l => l.variedad),
      match: matchValor(l => l.variedad),
    },
    {
      label: 'pH',
      set: filtOc.ph,
      opciones: () => opcionesValores(lotesDe(), l => _txtNum(l.ph, 2)),
      match: matchValor(l => _txtNum(l.ph, 2)),
    },
    {
      label: 'SO₂ libre',
      set: filtOc.so2,
      opciones: () => opcionesValores(lotesDe(), l => _txtNum(l.so2_libre, 1)),
      match: matchValor(l => _txtNum(l.so2_libre, 1)),
    },
    {
      /* El valor que se filtra es el crudo (normal, marcado, tanque_grande,
       * sin_ubicar); lo que se muestra es la etiqueta. Por eso las opciones se
       * mapean en vez de salir directo de opcionesValores. Va en la barra: la
       * columna del aviso ya no esta (el aviso va debajo de la variedad). */
      label: 'Estado del cruce',
      set: filtOc.grupo,
      opciones: () => opcionesValores(lotesDe(), l => l.grupo || '')
        .map(o => ({ val: o.val, text: OC_GRUPO_LBL[o.val] || o.text })),
      match: matchValor(l => l.grupo || ''),
    },
    {
      /* Objetivo vigente (el pisado a mano si hay) y dosis total del lote en
       * la unidad elegida, tal como se ven en la fila del lote. */
      label: 'Objetivo',
      set: filtOc.objetivo,
      opciones: () => opcionesValores(lotesDe(), l => _txtNum(_objetivoDe(l), 1)),
      match: matchValor(l => _txtNum(_objetivoDe(l), 1)),
    },
    {
      label: 'Dosis del lote',
      set: filtOc.dosis,
      opciones: () => opcionesValores(lotesDe(), l => _txtNum(_ocTotalLote(l), _ocUnidad === 'mbk' ? 2 : 0)),
      match: matchValor(l => _txtNum(_ocTotalLote(l), _ocUnidad === 'mbk' ? 2 : 0)),
    },
    {
      label: 'Proyecto',
      set: filtOc.proyecto,
      opciones: () => opcionesValores(lotesDe(), l => l.proyecto || ''),
      match: matchValor(l => l.proyecto || ''),
    },
    {
      label: 'Etapa',
      set: filtOc.etapa,
      opciones: () => opcionesValores(lotesDe(), l => l.etapa || ''),
      match: matchValor(l => l.etapa || ''),
    },
  ];

  /* Columnas de la planilla que no estan en la barra: filtran lotes enteros
   * con el valor que se lee en la fila (año del numero, cantidad de vasijas,
   * diferencia). soloPlanilla: no van como boton en la barra de la Hoja. */
  _descOc.push(
    { k: 'anio', label: 'Año', set: filtOc.anio, soloPlanilla: true,
      opciones: () => opcionesValores(lotesDe(), l => anioDeLote(l.lote)),
      match: matchValor(l => anioDeLote(l.lote)) },
    { k: 'cant', label: 'Cant.', set: filtOc.cant, soloPlanilla: true,
      opciones: () => opcionesValores(lotesDe(), l => String((l.barricas || []).length)),
      match: matchValor(l => String((l.barricas || []).length)) },
    { k: 'dif', label: 'Dif.', set: filtOc.dif, soloPlanilla: true,
      opciones: () => opcionesValores(lotesDe(), l => _txtNum(_objetivoDe(l) - l.so2_libre, 1)),
      match: matchValor(l => _txtNum(_objetivoDe(l) - l.so2_libre, 1)) },
  );

  /* Las instancias de los filtros sin columna en la planilla (Variedad, pH,
   * Estado del cruce, Proyecto, Etapa) ya no tienen boton: se crean igual para
   * que «Limpiar filtros» sincronice un Set que haya vuelto del F5 con algo
   * tildado de antes. */
  _instOc = _descOc.map(d => crearFiltroMulti({ label: d.label, opciones: d.opciones, set: d.set,
                                                onChange: _ocAplicarFiltros }));

  /* Nivel vasija: las opciones salen de las vasijas de la orden con los
   * filtros de lote ya puestos, pero sin los de vasija (si no, al tildar una
   * opcion desaparecerian las demas). */
  const vasijasDe = () => aplicarManuales(
    _ocBuildRows(_ocOrden, _ocExcluidos, _ocObjetivos, _ocFiltros(), _ocSort), _ocManuales)
    .filter(f => f.tipo === 'barrica');
  _descVas = COLS_PLANILLA.filter(c => c.nivel === 'vasija').map(c => ({ k: c.k, set: filtOc[c.k] }));

  /* Un embudo anclado por columna de la planilla (el panel cuelga de <body>,
   * como en la pestaña Lotes). */
  const porCampo = { lote: filtOc.lote, so2: filtOc.so2, objetivo: filtOc.objetivo,
                     anio: filtOc.anio, cant: filtOc.cant, dif: filtOc.dif };
  _fltPlan = new Map(COLS_PLANILLA.map(c => {
    let opciones;
    if (c.nivel === 'vasija') opciones = () => opcionesValores(vasijasDe(), f => valorVasija(c.k, f, _ocUni()));
    else opciones = _descOc.find(d => d.set === porCampo[c.k]).opciones;
    const set = filtOc[c.k];
    const inst = crearFiltroMulti({ label: c.label || 'Dosis', opciones, set, anclado: true, perezoso: true,
                                    onChange: _ocAplicarFiltros });
    return [c.k, { set, inst }];
  }));
}

/* Titulo de una columna de la planilla: el nombre ordena (▲ → ▼ → normal) y
 * el ▾ abre el filtro, como en la pestaña Lotes. */
function _ocEncabezadoPlanilla(col){
  const f = _fltPlan.get(col.k);
  const n = f ? f.set.size : 0;
  const flecha = _ocSort.key === col.k ? ' <span class="arrow">' + (_ocSort.dir > 0 ? '▲' : '▼') + '</span>' : '';
  return '<button type="button" class="ocp-sort" data-ocp-sort="' + escA(col.k) + '" title="Ordenar: menor a mayor, mayor a menor, normal">' +
    esc(col.label) + flecha + '</button>' +
    (f ? '<button type="button" class="th-flt' + (n ? ' active' : '') + '" data-ocp-flt="' + escA(col.k) + '"' +
      ' title="' + escA(n ? col.label + ': ' + n + ' elegido' + (n > 1 ? 's' : '') : 'Filtrar por ' + col.label) + '">▾' + (n ? ' ' + n : '') + '</button>' : '');
}

/* Clics en los titulos de la planilla. En CAPTURA y cortando la propagacion
 * (igual que en la pestaña Lotes): asi el listener de document que cierra los
 * paneles no cierra el que se acaba de abrir. */
function _ocCablearEncabezados(raiz){
  if (!raiz) return;
  raiz.addEventListener('click', e => {
    const fb = e.target.closest('[data-ocp-flt]');
    if (fb){
      e.preventDefault(); e.stopPropagation();
      const f = _fltPlan.get(fb.dataset.ocpFlt);
      if (f) f.inst.abrir(fb);
      return;
    }
    const sb = e.target.closest('[data-ocp-sort]');
    if (!sb) return;
    _ocSort = ciclarOrdenOc(_ocSort, sb.dataset.ocpSort);
    _ocAplicarFiltros();
  }, true);
}

/* Los paneles anclados son position:fixed: al scrollear quedarian flotando
 * lejos de su columna. Se cierran, como en la pestaña Lotes. */
let _ocScrollCablado = false;
function _ocCerrarPanelesAlScroll(){
  if (_ocScrollCablado) return;
  _ocScrollCablado = true;
  const cerrar = () => document.querySelectorAll('.mfilt-panel.mfilt-anclado.open').forEach(p => p.classList.remove('open'));
  window.addEventListener('scroll', cerrar, { passive: true });
  window.addEventListener('resize', cerrar);
}

/* Nombres de los filtros activos que NO se ven en la vista actual: en la
 * planilla, los botones de la barra que no son columnas; en la hoja, los
 * embudos de columnas que solo tiene la planilla. Asi un filtro no queda
 * prendido sin que nadie lo vea. */
const _OC_NOMBRE_FLT = { lote: 'Lote', so2: 'SO₂ act.', objetivo: 'Deseado', variedad: 'Variedad', ph: 'pH', grupo: 'Estado del cruce', dosis: 'Dosis del lote',
  proyecto: 'Proyecto', etapa: 'Etapa', anio: 'Año', cant: 'Cant.', dif: 'Dif.', tipo: 'Tipo',
  vasija: 'Vasija', litros: 'Litros', vdosis: 'Dosis por vasija' };
function _ocPintarAvisoFiltros(){
  const el = $('ocAvFlt');
  if (!el) return;
  const nombres = ks => ks.filter(k => filtOc[k].size).map(k => _OC_NOMBRE_FLT[k]);
  /* Filtros que quedaron de la barra vieja (vuelven del F5): ya no tienen boton. */
  const sinBoton = nombres(['variedad', 'ph', 'grupo', 'dosis', 'proyecto', 'etapa']);
  const dePlanilla = _ocVista === 'planilla' ? []
    : nombres(COLS_PLANILLA.map(c => c.k));
  const msgs = [];
  if (dePlanilla.length) msgs.push('Muestra lo filtrado en la Planilla: <b>' + esc(dePlanilla.join(', ')) + '</b>.');
  if (sinBoton.length) msgs.push('Hay filtros puestos de antes que ya no tienen botón: <b>' + esc(sinBoton.join(', ')) + '</b>.');
  el.innerHTML = msgs.length
    ? '<div class="msg info" style="font-size:12px">' + msgs.join(' ') + ' Usá «Limpiar filtros» para sacarlos.</div>'
    : '';
}

/* N° de orden: el siguiente de la serie B de la carpeta de OT, solo si el
 * campo esta vacio (no pisa lo que escribio el usuario). Al conectar la
 * carpeta se re-propone si el numero era el automatico y no se imprimio.
 *
 * A nivel de modulo (no closure de renderOrdenCorreccion): _ocGuardarOrden
 * tambien la dispara, para proponer el siguiente numero apenas se guarda una
 * orden (ver el arreglo de la B que no avanzaba, mas abajo). No cierra sobre
 * nada propio del render: solo lee el DOM por id y el estado de modulo. */
function _sembrarOc(alConectar){
  return proponerNumero('B').then(p => {
    if (!$('ocPaginas')) return;
    const vacio = !String(_ocNum).trim();
    if (!vacio && !(alConectar && _ocNumAuto && !_ocNumFijo)) return;
    _ocPonerNro(p.numero); _ocNumAuto = true;
  });
}

/* Pone el N° en el estado y en los campos de la hoja, sin repintarla (asi no
 * se pierde el cursor si alguien esta escribiendo en otro campo). */
function _ocPonerNro(nro){
  _ocNum = nro;
  document.querySelectorAll('#ocPaginas [data-campo="nro"], #ocPlanilla [data-campo="nro"]').forEach(i => { i.value = nro; });
}

export async function renderOrdenCorreccion(){
  const sec = $('tab-ordencorr');
  if (!sec) return;

  /* --- fecha: hoy, salvo que ya se haya elegido otra sobre la hoja --- */
  if (!_ocFecha) _ocFecha = new Date().toISOString().slice(0, 10);

  /* I4: sinVolumen se lee DESPUES de _ocCargar(), no antes. Si se lee antes,
   * _ocOrden es null en la primera visita y la nota no se emite. Se emite
   * desde _ocRenderTabla() para que se actualice cada vez que se recarga. */
  sec.innerHTML = `
<div class="card" style="margin-bottom:14px">
  <h2>Orden de corrección de SO₂</h2>
  <div class="toolbar" id="ocToolbar" style="margin-bottom:14px">
    <div class="oc-vistas" role="group" aria-label="Vista">
      <button type="button" class="btn" data-oc-vista="planilla" title="Una fila por vasija, con todos los datos">Planilla</button>
      <button type="button" class="btn" data-oc-vista="hoja" title="La hoja tal como se imprime. Se puede escribir encima.">Vista preliminar</button>
    </div>
    <input class="txt" id="ocBusca" placeholder="🔎 Buscar por lote…" style="min-width:160px" value="${escA(_ocBusca)}">
    <button class="btn" id="btnOcLimpiarFlt">🧹 Limpiar filtros</button>
    <button class="btn" id="btnOcUnidad"></button>
    <button class="btn" id="btnOcActivables" aria-pressed="false"></button>
    <button class="btn" id="btnOcRecargar">🔄 Recargar</button>
    <span class="tag" id="ocResumen"></span>
    <div class="spacer"></div>
    <button class="btn primary" id="btnOcImprimir" title="Imprime el papel, guarda el PDF en la carpeta B y deja la orden pendiente en Órdenes de trabajo">🖨️ Imprimir y guardar</button>
  </div>
  <div id="ocAvFlt"></div>
  <div id="ocMsg"></div>
  <div id="ocPendAviso"></div>
  <div class="msg info" id="ocSelloWrap" style="margin-bottom:10px;font-size:12px">
    <b>Sello del mapa:</b> <span id="ocSelloPantalla">—</span>
  </div>
</div>

<!-- Dos vistas de la misma orden (_ocPonerVista): la Planilla, donde se
     trabaja (controles por lote, filtros, dosis por vasija), y la Vista
     preliminar = la hoja tal como se imprime, con el N°, la fecha, las firmas
     y la dosis escritos encima. Al imprimir solo queda #ocPaginas (@media
     print, index.html). -->
<div class="oc-hoja-cab" id="ocHojaCab">${chipCarpeta('B')}</div>
<div id="ocPlanilla"></div>
<div id="ocPaginas"></div>

<!-- I4: la nota de sin_volumen vive en un div separado que _ocRenderTabla
     actualiza despues de cargar, para que no quede en blanco en la primera visita. -->
<div id="ocSinVolumen" style="margin-top:12px"></div>
<div id="ocSuprimidos" style="margin-top:12px"></div>`;

  _ocPonerVista(_ocVista);
  $('ocToolbar').querySelectorAll('[data-oc-vista]').forEach(b =>
    b.addEventListener('click', () => { _ocPonerVista(b.dataset.ocVista); _ocPintarPaginas(); }));

  /* Cargar datos si no estan disponibles o si se presiona Recargar */
  await _ocCargar();
  _ocMarcarPendientes();
  _ocRenderTabla();
  _ocPintarPaginas();
  _ocPintarAvisoPendientes();

  /* Filtros multi */
  if (_descOc.length === 0){
    initFiltrosOc();
    if (_descOc.some(d => d.set.size)){
      /* Los Sets ya traian valores restaurados del F5, pero _ocRenderTabla()/
         _ocPintarPaginas() de arriba corrieron con _descOc todavia vacio (no
         existia hasta ahora): salio sin filtrar. Se vuelve a aplicar una vez
         mas, ya con los descriptores listos. */
      _ocAplicarFiltros();
    }
  }
  /* La planilla se pinto antes de que existieran sus embudos: otra vez, ya con ellos. */
  _ocPintarPlanilla();

  /* Limpiar: vacia todos los Sets y sincroniza todos los paneles. Sin id de
   * buscador porque ya no hay caja de texto aparte: cada panel trae la suya. */
  $('btnOcLimpiarFlt').addEventListener('click', () => {
    _ocBusca = '';
    if (_FS) _FS.borrar('lotes:ordencorr:');
    _descVas.forEach(d => d.set.clear());
    _fltPlan.forEach(f => f.inst.sync());
    limpiarFiltrosMulti(_descOc, 'ocBusca', _instOc, _ocAplicarFiltros);
  });

  /* Cancelar correcciones. Delegado sobre el contenedor, que persiste mientras
   * la tabla de adentro se reconstruye en cada render. El contenedor se recrea
   * con sec.innerHTML en cada visita a la pestana, asi que los listeners no se
   * apilan y no hace falta guarda. */
  $('ocSuprimidos').addEventListener('click', e => {
    const uno = e.target.closest('[data-oc-anular]');
    if (uno){
      _ocAnularCorrecciones(
        [{ lote: uno.dataset.ocAnular, fecha: uno.dataset.ocAnularFecha,
           ot: uno.dataset.ocAnularOtn }],
        'el lote ' + uno.dataset.ocAnular);
      return;
    }
    const todaLaOt = e.target.closest('[data-oc-anular-ot]');
    if (todaLaOt){
      const ot = todaLaOt.dataset.ocAnularOt;
      const delOt = ((_ocOrden && _ocOrden.suprimidos) || [])
        .filter(s => String(s.ot ?? '') === ot)
        .map(s => ({ lote: s.lote, fecha: s.fecha, ot: s.ot }));
      _ocAnularCorrecciones(delOt,
        'los ' + delOt.length + ' lotes de la OT ' + ot);
    }
  });

  /* Unidad de la dosis: el boton alterna y repinta tabla y papel. No toca los
   * datos ni la bitacora, que guarda las dos formas: es solo como se expresa
   * el numero. */
  _ocPintarBotonUnidad();
  $('btnOcUnidad').addEventListener('click', () => {
    _ocUnidad = _ocOtraUnidad();
    /* El embudo de la dosis filtra por el numero que se ve, que cambia con la
     * unidad: lo tildado en mL no existe en gramos. */
    if (filtOc.dosis.size || filtOc.vdosis.size){
      filtOc.dosis.clear();
      filtOc.vdosis.clear();
      _instOc.forEach(f => f.sync());
      _fltPlan.forEach(f => f.inst.sync());
    }
    _ocPintarBotonUnidad();
    _ocRenderTabla();
    _ocPintarPaginas();
  });

  /* Lotes en objetivo / corregidos: prende o apaga la suma temporal. */
  $('btnOcActivables').addEventListener('click', () => {
    _ocPonerActivables(!_ocActivos);
    _ocRenderTabla();
    _ocPintarPaginas();
  });

  /* Recargar (apaga tambien los lotes en objetivo / corregidos) */
  $('btnOcRecargar').addEventListener('click', async () => {
    _ocPonerActivables(false);
    _ocOrdenSrv = _ocOrden = null;
    _ocExcluidos.clear();
    _ocObjetivos.clear(); _ocExcepciones.clear(); _ocSolicitudesEx.clear();
    _ocManuales.clear();
    _ocPendAuto.clear();
    await _ocCargar();
    _ocMarcarPendientes();
    _ocRenderTabla();
    _ocPintarPaginas();
    _ocPintarAvisoPendientes();
  });

  /* Buscador por lote: repinta al dejar de tipear, como el de Analisis. El
   * campo esta en la barra, que no se rehace, asi que no pierde el foco. */
  let tBusca = null;
  $('ocBusca').addEventListener('input', e => {
    clearTimeout(tBusca);
    const q = e.target.value.trim();
    tBusca = setTimeout(() => { if (q !== _ocBusca){ _ocBusca = q; _gf('busca', q); _ocAplicarFiltros(); } }, 250);
  });

  _ocCablearHoja($('ocPaginas'));
  _ocCablearControles($('ocPaginas'));
  /* La planilla: N° y fecha (data-campo), los controles por lote (mismos
   * data-* que la banda de la hoja) y la dosis por vasija. */
  _ocCablearHoja($('ocPlanilla'));
  _ocCablearControles($('ocPlanilla'));
  _ocCablearPlanilla($('ocPlanilla'));
  _ocCablearEncabezados($('ocPlanilla'));
  _ocCerrarPanelesAlScroll();

  /* N° de orden: ver _sembrarOc arriba. */
  cablearChipsCarpeta($('ocHojaCab'), () => _sembrarOc(true));
  _sembrarOc(false);

  /* Imprimir */
  $('btnOcImprimir').addEventListener('click', async () => {
    const problema = _ocProblemaTecho(_ocBuildRowsLocal());
    if (problema){ avisar(problema, { tipo: 'mal' }); return; }
    const r = await imprimirYGuardar({
      claseBody: 'printing-ordencorr', contenedor: $('ocPaginas'), serie: 'B',
      numero: _ocNum, titulo: 'Correccion SO2',
      /* Se imprime (y se guarda en PDF) la hoja aunque se mire la planilla:
       * se destapa para eso y despues _ocPonerVista vuelve a la elegida. */
      antes: () => {
        $('ocPaginas').hidden = false;
        /* Con el estilo de la vista preliminar: los campos sin recuadro. */
        $('tab-ordencorr').classList.add('oc-prelim');
        _ocPintarPaginas();
      },
    });
    _ocPonerVista(_ocVista);
    if (r.numeroLibre){ _ocNum = r.numeroLibre; _ocNumAuto = false; _ocPintarPaginas(); }
    // Ya impreso con ese numero: queda fijo (lo usa tambien la ejecucion).
    if (r.ok){
      _ocNumFijo = true; _ocNumAuto = false;
      if (r.numero){ _ocNum = r.numero; _ocPintarPaginas(); }
      await _ocGuardarOrden(_ocNum);
    }
  });
}

/* La hoja de la derecha se edita encima. #ocPaginas se recrea en cada visita a
 * la pestaña (sec.innerHTML), asi que estos listeners no se apilan; su
 * contenido se repinta entero en cada _ocPintarPaginas, por eso todo va
 * delegado.
 *
 * Encabezado (data-campo, hoja-campos.js): se copia a los campos de arriba y a
 * las otras hojas sin repintar, para no perder el cursor. El N° escrito en la
 * hoja cuenta como tocado a mano, igual que el de arriba.
 *
 * Dosis (data-oc-dosis): al confirmar (change) pasa a ser la dosis a mano de
 * todas las vasijas del renglon y se repinta tabla y hoja. */
function _ocCablearHoja(hoja){
  if (!hoja) return;
  hoja.addEventListener('input', e => {
    const c = e.target.closest('[data-campo]');
    if (!c) return;
    const k = c.dataset.campo, v = c.value;
    if (k === 'titulo') _ocTitulo = v;
    else if (k === 'nro'){ _ocNum = v; _ocNumAuto = false; _ocNumFijo = false; }
    else if (k === 'fecha') _ocFecha = v;
    else if (k === 'emitio') _ocEmitio = v;
    else if (k === 'recibio') _ocRecibio = v;
    else if (k === 'instr'){
      _ocInstr[_ocUnidad] = v;
      if (_FS) _FS.guardar('lotes:ocinstr', { sol: _ocInstr.sol, mbk: _ocInstr.mbk });
    }
    else return;
    hoja.querySelectorAll('[data-campo="' + k + '"]').forEach(o => { if (o !== c && o.value !== v) o.value = v; });
    if (k === 'fecha') hoja.querySelectorAll('[data-anio]').forEach(a => { a.textContent = v.slice(0, 4); });
  });

  hoja.addEventListener('change', e => {
    const inp = e.target.closest('input[data-oc-dosis]');
    if (!inp) return;
    const g = _ocFilasPapel[+inp.dataset.ocDosis];
    if (!g) return;
    const txt = inp.value.trim().replace(',', '.');
    const val = Number(txt);
    if (txt === '') _ocQuitarManual(g);
    else if (Number.isFinite(val) && val >= 0){
      let man = _ocManuales.get(g.lote.lote);
      if (!man) _ocManuales.set(g.lote.lote, man = new Map());
      for (const k of g.claves) man.set(k, dosisDesdeUnidad(val, _ocUnidad));
    }
    /* No numerico o negativo: no se acepta, el repintado vuelve a la anterior. */
    _ocRepintarConFoco();
  });

  hoja.addEventListener('keydown', e => {
    const inp = e.target.closest('input[data-oc-dosis]');
    if (!inp || e.key !== 'Enter') return;
    e.preventDefault();
    /* Enter = a la dosis del renglon siguiente (el foco nuevo dispara change). */
    const sig = hoja.querySelector('input[data-oc-dosis="' + (+inp.dataset.ocDosis + 1) + '"]');
    if (sig) sig.focus(); else inp.blur();
  });

  hoja.addEventListener('click', e => {
    const b = e.target.closest('[data-oc-dosis-reset]');
    if (!b) return;
    const g = _ocFilasPapel[+b.dataset.ocDosisReset];
    if (g) _ocQuitarManual(g);
    _ocRenderTabla();
    _ocPintarPaginas();
  });
}

/* Dosis por vasija en la planilla (data-oc-vdosis = lote, data-oc-clave =
 * claveVasija): es la misma dosis a mano que la del renglon de la hoja, pero
 * de una sola vasija. Vacio = vuelve a la calculada. */
function _ocCablearPlanilla(raiz){
  if (!raiz) return;
  raiz.addEventListener('change', e => {
    const inp = e.target.closest('input[data-oc-vdosis]');
    if (!inp) return;
    const lote = inp.dataset.ocVdosis, clave = inp.dataset.ocClave;
    const txt = inp.value.trim().replace(',', '.');
    const val = Number(txt);
    if (txt === '') _ocQuitarManual({ lote: { lote }, claves: [clave] });
    else if (Number.isFinite(val) && val >= 0){
      let man = _ocManuales.get(lote);
      if (!man) _ocManuales.set(lote, man = new Map());
      man.set(clave, dosisDesdeUnidad(val, _ocUnidad));
    }
    _ocRepintarConFoco();
  });
  raiz.addEventListener('keydown', e => {
    const inp = e.target.closest('input[data-oc-vdosis]');
    if (!inp || e.key !== 'Enter') return;
    e.preventDefault();
    /* Enter = a la dosis de la vasija siguiente, como en la hoja. */
    const todos = [...raiz.querySelectorAll('input[data-oc-vdosis]')];
    const sig = todos[todos.indexOf(inp) + 1];
    if (sig) sig.focus(); else inp.blur();
  });
  raiz.addEventListener('click', e => {
    const b = e.target.closest('[data-oc-vdosis-reset]');
    if (!b) return;
    _ocQuitarManual({ lote: { lote: b.dataset.ocVdosisReset }, claves: [b.dataset.ocClave] });
    _ocRenderTabla();
    _ocPintarPaginas();
  });
}

/* Las vasijas del renglon vuelven a la dosis calculada. */
function _ocQuitarManual(g){
  const man = _ocManuales.get(g.lote.lote);
  if (!man) return;
  for (const k of g.claves) man.delete(k);
  if (!man.size) _ocManuales.delete(g.lote.lote);
}

/* Repinta tabla y hoja despues de confirmar una dosis. Se espera un tick: el
 * change salta ANTES de que el foco pase al campo siguiente (Tab, clic, Enter),
 * y repintar en ese momento lo perderia. Despues se le devuelve el foco al
 * mismo campo, que en la hoja nueva es otro elemento. */
function _ocRepintarConFoco(){
  setTimeout(() => {
    const a = document.activeElement;
    /* El foco puede estar en la hoja o en la planilla: se busca en la misma. */
    const idCont = ['ocPaginas', 'ocPlanilla'].find(id => $(id) && a && $(id).contains(a));
    const d = idCont ? a.dataset : {};
    const sel = d.ocDosis != null ? 'input[data-oc-dosis="' + d.ocDosis + '"]'
      : d.ocVdosis != null ? 'input[data-oc-vdosis="' + CSS.escape(d.ocVdosis) + '"][data-oc-clave="' + CSS.escape(d.ocClave) + '"]'
      : d.ocObj != null ? 'input[data-oc-obj="' + CSS.escape(d.ocObj) + '"]'
      : d.ocModo != null ? 'select[data-oc-modo="' + CSS.escape(d.ocModo) + '"]'
      : d.campo ? '[data-campo="' + d.campo + '"]' : null;
    _ocRenderTabla();
    _ocPintarPaginas();
    const nuevo = sel && idCont && $(idCont).querySelector(sel);
    if (nuevo){ nuevo.focus(); if (nuevo.select && nuevo.tagName === 'INPUT') nuevo.select(); }
  }, 0);
}

/* Al imprimir, la orden queda guardada tal como salio en el papel y pendiente
 * en Órdenes de trabajo → Pendientes. Se ejecuta desde ahi (se abre en modo
 * órdenes, vista-ordenes-correccion.js), con estos numeros: nunca se vuelve a
 * calcular.
 *
 * Si guardar() devuelve false (sin conexion) la orden NO se descarta: guardar()
 * ya la dejo en el borrador local y la sube sola cuando vuelva la señal, y el
 * papel YA salio con esos lotes y esas dosis. Antes este bloque la sacaba de
 * DATOS() y pedia volver a tocar «Imprimir y guardar», lo que rompia la
 * garantia del subsistema (lo impreso == lo que se puede registrar): si el
 * operario no volvia a imprimir, el papel que tenia en la mano no correspondia
 * a ninguna orden guardada. */
async function _ocGuardarOrden(numero){
  const num = String(numero || '').trim();
  const lista = DATOS().ordenes_correccion || [];
  const previa = lista.find(o => o && o.numero === num && o.estado !== 'anulada');
  if (previa && previa.estado === 'ejecutada'){
    avisar('La orden ' + num + ' ya está ejecutada (ver Órdenes de trabajo → Historial): esta impresión no se guardó como orden nueva.', { tipo: 'mal' });
    return;
  }
  if (previa && !await confirmar({ titulo: 'Ya hay una orden ' + num + ' pendiente',
      texto: '¿Reemplazarla por lo que se acaba de imprimir?', si: 'Reemplazar', no: 'Dejar la anterior' })) return;

  const orden = armarOrdenGuardada({
    id: previa ? previa.id : 'oc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    numero: num, fecha: _ocFecha,
    emitio: _ocEmitio.trim(), recibio: _ocRecibio.trim(),
    unidad: _ocUnidad, quien: usuarioActual(), ahora: new Date().toISOString(),
    filas: _ocBuildRowsLocal(), modos: _ocModos,
    titulo: _ocTitulo, instrucciones: _ocInstr[_ocUnidad], excepciones: _ocExcepciones });
  if (!orden.lotes.length){
    avisar('No se guardó ninguna orden: no había lotes incluidos.');
    return;
  }

  const d = DATOS();
  if (!Array.isArray(d.ordenes_correccion)) d.ordenes_correccion = [];
  const i = previa ? d.ordenes_correccion.indexOf(previa) : -1;
  if (i >= 0) d.ordenes_correccion[i] = orden; else d.ordenes_correccion.push(orden);
  markDirty();
  /* Las dosis a mano ya quedaron en la orden: no se arrastran a la siguiente. */
  for (const l of orden.lotes) {
    _ocManuales.delete(l.lote);
    if (_ocExcepciones.has(l.lote)) _ocObjetivos.delete(l.lote);
    _ocExcepciones.delete(l.lote); _ocSolicitudesEx.delete(l.lote);
  }

  let ok;
  try { ok = await guardar(); } catch (_) { ok = false; }

  /* El numero ya se uso en un papel (se guardo o no): el campo tiene que
   * dejar de mostrarlo y proponer el siguiente, igual que al arrancar la
   * vista. Sin esto el campo se quedaba en el mismo B240 toda la sesion y una
   * segunda orden salia con el numero repetido (arreglo de la B que no
   * avanzaba). */
  _ocNum = ''; _ocNumAuto = false; _ocNumFijo = false;
  /* La correccion manual era para esta orden: la pantalla vuelve a la normal. */
  _ocPonerActivables(false);

  _ocMarcarPendientes();
  _ocRenderTabla();
  _ocPintarPaginas();
  _ocPintarAvisoPendientes();
  _sembrarOc(false);

  /* Modo órdenes (Nueva · Corrección SO₂): la orden ya está en DATOS (aunque
   * guardar() diga que no hubo red: quedó en el borrador local). La pantalla
   * pasa a ESA orden, con su Ejecutar, igual que al abrirla desde Pendientes;
   * la URL pasa a ?orden=<id> (conserva volver) para que F5 la reabra, y la
   * banda se retitula. */
  if (document.body.classList.contains('modo-ordenes')){
    const p = new URLSearchParams(location.search); p.set('orden', orden.id);
    history.replaceState(null, '', location.pathname + '?' + p.toString());
    fijarOrdenUnica(orden.id);
    mostrarTab('so2');
    document.dispatchEvent(new CustomEvent('lotes:modo-orden-cambio'));
    if (ok) avisar('✓ La orden ' + num + ' quedó pendiente. Ejecutala acá cuando esté terminada.');
    else avisar('La orden ' + num + ' quedó guardada en este equipo y se va a subir sola cuando se pueda guardar.', { tipo: 'mal' });
    return;
  }

  const m = $('ocMsg');
  if (!ok){
    avisar('La orden ' + num + ' quedó guardada en este equipo y se va a subir sola cuando se pueda guardar.', { tipo: 'mal' });
    return;
  }
  if (m) m.innerHTML = '<div class="msg ok">✓ La orden ' + esc(num) + ' quedó pendiente. ' +
    'Cuando esté terminada, ejecutala desde Órdenes de trabajo → Pendientes. ' +
    '<a href="' + escA(urlVolver(location.search)) + '">← Volver a Órdenes de trabajo</a></div>';
}


registrarVista('ordencorr', () => renderOrdenCorreccion());
