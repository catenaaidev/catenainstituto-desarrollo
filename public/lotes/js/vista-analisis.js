/* ===== Lotes CIW — pestana Analisis ===== */
'use strict';

import { $, esc, escA, DATOS, markDirty, registrarVista, registrarInit, irALote,
         vistaActiva, invalidarVista } from './nucleo.js';
import { toggleSort, escribirCelda, pasaMulti, opcionesValores, matchValor,
         crearFiltroMulti, limpiarFiltrosMulti } from './tabla.js';
import { activarGrilla } from './grilla.js';
import { armarFilas, esQuimicaReal, esCorreccionReal } from './analisis-filas.js';
import { crearFiltroLlenado } from './filtro-llenado.js';
import { estaVacio } from './envases.js';
import { crearAnchos } from './anchos-cols.js';
import { fmtFecha, fmtMes } from './fechas.js';
import { visible } from './selector-anios.js';

/* Columnas de la tabla de análisis. Las 2 ultimas son de la CORRECCION de SO2
 * (viven en analisis.correccion.*, no directo en el registro) y solo se ven
 * en la fila de tipo 'correccion'; las anteriores son de quimica y solo se
 * ven en la fila 'quimica'. lote/variedad/fecha_analisis se ven en las dos. */
const COLS_ANALISIS = [
  { k:'lote',          label:'Lote',          ro:true  },
  /* Variedad, Vasija de crianza y Proyecto no viven en el registro de analisis:
   * salen del LOTE (ver CAMPOS_DEL_LOTE). Son de solo lectura porque el lugar
   * para editarlas es la pestaña Lotes; aca estan para poder leerlas y, sobre
   * todo, para colgarles el embudo de su filtro. */
  { k:'variedad',        label:'Variedad',            ro:true },
  { k:'vasija_crianza',  label:'Vasija de crianza',   ro:true },
  { k:'proyecto',        label:'Proyecto',            ro:true },
  /* `fecha` hace que escribirCelda la guarde en ISO venga escrita como venga, y
   * `fmt` es como se muestra. El dato sigue siendo ISO: el orden de la tabla y
   * el agrupado por fecha comparan el valor crudo, no lo que se ve. */
  { k:'fecha_analisis',label:'Fecha',          ro:false, fecha:true, fmt:fmtFecha },
  /* Etanol va antes que pH, no al final de la quimica: es el mismo orden en
   * que viene la planilla del laboratorio (ver ORDEN_PLANILLA en
   * carga-cols.js), asi que leer esta tabla y leer lo que se pego son el
   * mismo gesto. */
  { k:'etanol',        label:'Etanol',         num:true },
  { k:'ph',            label:'pH',             num:true },
  { k:'av',            label:'AV',             num:true },
  { k:'gluc_fruc',       label:'Gluc+Fruc',      num:true },
  { k:'azucar_reductor', label:'Az. Reductor',  num:true },
  { k:'malico',          label:'Málico',        num:true },
  { k:'lactico',       label:'Láctico',        num:true },
  { k:'acidez_total',  label:'Acidez total',   num:true },
  { k:'so2_libre',     label:'SO₂ libre',      num:true },
  /* Calculada, no guardada: la API la manda por fila como so2_molec_calc
   * (Henderson-Hasselbalch sobre el SO2 libre y el pH de ESA fila). Es de solo
   * lectura porque no es un dato que se cargue — cambiarla seria cambiar el pH
   * o el libre. */
  { k:'so2_molecular', label:'SO₂ molecular',  ro:true, num:true },
  { k:'comentario',    label:'Comentario',     ro:false },
  { k:'ot_n',            label:'OT',              ro:false },
  /* La diferencia de SO2 que se agrego en la correccion (deseado - actual). Se
   * MUESTRA tal como quedo guardada, no se recalcula: la escribe
   * armarCorreccion() en so2-bitacora.js cuando alguien registra una correccion
   * por la app, y ese es el numero que efectivamente se aplico.
   *
   * Ojo al leerla: las correcciones que vinieron de la migracion del Excel no
   * la traen (2 de 2601 al 22/09/2026), asi que la columna va a estar casi
   * vacia hasta que se acumulen correcciones cargadas por la app. Es a
   * proposito — calcularla para las viejas exigiria so2_libre_actual, que esas
   * mismas filas tampoco tienen. */
  { k:'diferencia',      label:'Diferencia SO₂',  ro:true, num:true },
];

/* Claves que viven anidadas en analisis.correccion.*, no en el registro raiz.
 * Las demas columnas de COLS_ANALISIS (salvo las comunes, que se ven en ambos
 * tipos) son de quimica y viven en el registro raiz. */
/* so2_deseado, mbk_a_agregar y ml_exactos SIGUEN existiendo en
 * analisis.correccion y se siguen viendo y editando en las pestanas
 * Correcciones SO2 y Orden de correccion: lo unico que se saco es la columna de
 * ESTA tabla, que se reemplazo por la diferencia efectivamente aplicada.
 * esCorreccionReal() sigue mirando so2_deseado en el DATO, asi que sacar la
 * columna no hace desaparecer ninguna fila de correccion. */
const CAMPOS_CORRECCION = new Set(['ot_n', 'diferencia']);
const CAMPOS_COMUNES = new Set([
  'lote', 'fecha_analisis',
  /* Los tres que salen del lote se ven en los DOS tipos de fila por el mismo
   * motivo que el numero de lote: identifican de que se esta hablando, no son
   * una medicion de esta fila. */
  'variedad', 'vasija_crianza', 'proyecto',
]);

/* Columnas que NO viven en el registro de analisis: se leen del LOTE al que
 * pertenece. `campo` es el nombre que tienen alla — 'vasija_actual' es la
 * "Vasija Actual en Crianza" de la pestaña Lotes. */
const CAMPOS_DEL_LOTE = new Map([
  ['variedad',       'variedad'],
  ['vasija_crianza', 'vasija_actual'],
  ['proyecto',       'proyecto'],
]);

/* Las metricas con criterio, o sea las unicas celdas que pueden salir verdes o
 * naranjas. No se declara aca cual es el criterio de cada una: eso vive en el
 * motor (veredictosAnalisis en src/lotes/motores/fml.ts) y llega por la API. */
const METRICAS_CON_CRITERIO = new Set([
  'ph', 'av', 'malico', 'gluc_fruc', 'azucar_reductor', 'so2_libre', 'so2_molecular',
]);

/** Campos quimicos que el boton de eliminar vacia en una fila de tipo
 *  'quimica' (los mismos que decide si una fila quimica existe, en
 *  analisis-filas.js — repetidos aca porque son el AL CONTRARIO: alla
 *  deciden si generar la fila, aca que campos limpiar). */
const CAMPOS_QUIMICA_A_VACIAR = ['ph', 'av', 'gluc_fruc', 'azucar_reductor', 'malico',
  'lactico', 'acidez_total', 'etanol', 'so2_libre', 'comentario'];

/** Una columna aplica a esta fila si es comun a los dos tipos, o si su
 *  "lado" (correccion o quimica) coincide con el tipo de la fila. */
function _columnaAplica(colKey, filaTipo){
  if (CAMPOS_COMUNES.has(colKey)) return true;
  const esColCorreccion = CAMPOS_CORRECCION.has(colKey);
  return filaTipo === 'correccion' ? esColCorreccion : !esColCorreccion;
}

/* Veredicto por fila de analisis:
 *   WeakMap<OBJETO de DATOS().analisis -> {fuera:Set<metric>, dentro:Set<metric>, molec:number|null}>
 *
 * Son DOS conjuntos y no uno con su complemento a proposito: una metrica que no
 * esta en ninguno es una que no tiene veredicto (sin medicion, o sin con que
 * juzgarla), y esa no se pinta de ningun color. Tratar "no esta en fuera" como
 * "esta bien" pintaria de verde una celda vacia.
 *
 * Por que por OBJETO y no por posicion: la API los manda indexados por la
 * posicion en el array GUARDADO. Antes se guardaban asi y se aplicaban por la
 * posicion en el DATOS().analisis local, que deja de coincidir en cuanto se
 * borra una fila sin guardar (todo lo de abajo corre un lugar) o una fusion
 * tras un 409 rearma el array: los colores caian en filas equivocadas y "Solo
 * fuera de criterio" filtraba otras. Ahora la posicion se traduce a objeto UNA
 * vez, al llegar, y solo si el documento local es exactamente el guardado (ver
 * cargarAnalisisFlags). Despues, borrar una fila no mueve el color de las
 * demas, editar una medicion le saca el veredicto a ESA fila, y si DATOS() se
 * reemplaza entero los objetos nuevos simplemente no tienen veredicto: se
 * prefiere una celda sin color a una con el color de otra fila. */
let _analisisFlags = null;  // null = no cargado aún
let _analisisFlagsLoading = false;
/* Version del documento con la que se calcularon los veredictos de arriba. Los
 * calcula el SERVIDOR sobre lo GUARDADO (analisisConFlags lee el documento de
 * la base), asi que despues de un Guardar los que hay en memoria describen la
 * version anterior. Sin esto, editar un pH, guardar y volver a la pestaña
 * dejaba la celda del color viejo para siempre. */
let _flagsVersion = null;

/* Veredicto de una fila que todavia no se cargo, o de una fila de correccion:
 * todo vacio. Se devuelve este objeto congelado en vez de null para que el
 * pintado no tenga que preguntar en cada celda. */
const SIN_VEREDICTO = Object.freeze({
  fuera: new Set(), dentro: new Set(), molec: null,
});

/* ¿Hay cambios sin guardar? nucleo no exporta su bandera `dirty`, pero la
 * refleja sin excepciones en el boton Guardar: markDirty lo habilita y
 * markSaved lo apaga. Con cambios sin guardar el array local no es el que
 * juzgo el servidor, asi que sus veredictos no se pueden enganchar por
 * posicion. */
function _hayCambiosSinGuardar(){
  const b = $('btnGuardar');
  return !!b && !b.disabled;
}

/* El veredicto de un registro de analisis, o undefined si no tiene. */
const _veredictoDe = a => (_analisisFlags && a) ? _analisisFlags.get(a) : undefined;

/* Una edicion deja el veredicto de esa fila describiendo el valor anterior: se
 * lo saca, y el proximo repintado la deja sin color en vez de con el viejo. */
function _olvidarVeredicto(a){ if (_analisisFlags && a) _analisisFlags.delete(a); }

async function cargarAnalisisFlags(){
  if (_analisisFlagsLoading) return;
  /* Con cambios sin guardar no se piden: no habria forma de saber que fila
   * local es cada posicion del servidor. Se piden solos al guardar (sube la
   * version y registrarVista los da por vencidos). */
  if (_hayCambiosSinGuardar()) return;
  _analisisFlagsLoading = true;
  /* Lo que se tiene que mantener igual mientras viaja el pedido para poder
   * traducir posicion -> objeto: el mismo array (una fusion o una recarga lo
   * reemplazan), la misma version y nada editado en el medio. */
  const arrPedido = DATOS().analisis;
  const vPedido = (DATOS().meta || {}).version ?? null;
  try {
    const r = await fetch(API+'/analisis');
    if (!r.ok) return;
    const j = await r.json();
    /* GET /analisis devuelve el ARRAY pelado (rutas.ts: json(200,
     * analisisConFlags(...))), no un objeto con una clave `analisis` adentro.
     * Esto leia j.analisis, que en un array es undefined, asi que el Map
     * quedaba VACIO siempre: ninguna celda se pintaba nunca y "Solo fuera de
     * criterio" no devolvia ninguna fila. Como fallaba en silencio — Map vacio,
     * no excepcion — se veia igual que "no hay nada fuera de criterio".
     * Se aceptan las dos formas por si alguna vez la ruta pasa a envolverlo. */
    const filas = Array.isArray(j) ? j : (j.analisis || []);
    const arr = DATOS().analisis || [];
    /* Solo se enganchan si el documento local sigue siendo el que se tenia al
     * pedir, sin cambios, y si cada posicion del servidor cae en un registro
     * del mismo lote y fecha. Si otra PC guardo en el medio, el array del
     * servidor es otro: el chequeo de lote+fecha lo detecta y se descartan
     * todos (sin colores) antes que pintar filas equivocadas. */
    const mismoDoc = arr === arrPedido && ((DATOS().meta || {}).version ?? null) === vPedido
      && !_hayCambiosSinGuardar() && filas.length === arr.length;
    const calza = mismoDoc && filas.every(row => {
      const a = arr[row.idx];
      return !!a && String(a.lote ?? '') === String(row.lote ?? '')
        && String(a.fecha_analisis ?? '') === String(row.fecha_analisis ?? '');
    });
    _flagsVersion = vPedido;
    /* Si no calzan quedan en null, y el repintado de abajo saca los colores
     * que hubiera: describian otra version. */
    _analisisFlags = calza ? new WeakMap() : null;
    if (calza) for (const row of filas){
      _analisisFlags.set(arr[row.idx], {
        fuera:  new Set(row.fuera || []),
        dentro: new Set(row.dentro || []),
        /* El molecular calculado viaja con el veredicto y no se recalcula en el
         * navegador: es la misma cuenta que juzga la celda, asi que si alguna
         * vez cambia (el 1.8 del pKa, por ejemplo) no puede quedar una copia
         * vieja aca mostrando un numero que no se corresponde con su color. */
        molec: row.so2_molec_calc ?? null,
      });
    }
    /* Repintar con colores una vez que lleguen los flags, pero solo si la
     * pestaña se esta viendo: con los datos reales cada render de esta tabla
     * son ~3 s. Si esta oculta (el prefetch del arranque), queda marcada como
     * vieja y se dibuja UNA vez, ya con colores, cuando alguien la abre. */
    if (vistaActiva() === 'analisis') renderAnalisis();
    else invalidarVista('analisis');
  } catch(e) { /* sin flags: los colores se omiten */ }
  finally { _analisisFlagsLoading = false; }
}

/* Mapa de lote -> OBJETO lote.
 *
 * get() de un lote que no existe devuelve undefined, y eso esta bien: un
 * analisis puede sobrevivir al borrado de su lote, y estaVacio/_delLote lo
 * tratan como vacio sin ninguna rama especial. */
function _buildLoteObjMap(){
  const m = new Map();
  for (const l of (DATOS().lotes || [])) m.set(String(l.lote ?? ''), l);
  return m;
}

/** Valor de una columna derivada del lote (Variedad, Vasija de crianza,
 *  Proyecto) para el analisis `a`. Un analisis cuyo lote ya no existe da ''. */
function _delLote(a, colKey){
  const l = _ctxRender.loteObjMap.get(String(a.lote ?? ''));
  return l ? (l[CAMPOS_DEL_LOTE.get(colKey)] ?? '') : '';
}

/** El molecular con los 3 decimales con que se muestra. El criterio se juega en
 *  la segunda (0,38): con menos, un 0,375 y un 0,384 se verian iguales y uno
 *  sale naranja y el otro verde. */
const _fmtMolec = v => (v != null && isFinite(v)) ? Number(v).toFixed(3) : '';

/** La fecha de un analisis como ISO comparable, o '' si no tiene una usable.
 *  Mismo criterio que fechaDia() del motor: lo que no tenga forma YYYY-MM-DD no
 *  es una fecha, y ordenar por el texto crudo pondria un '12/05/2026' del Excel
 *  viejo en cualquier lado. Con ISO, comparar textos ya es comparar fechas. */
const _RE_ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;
function _fechaIso(a){
  const s = String((a || {}).fecha_analisis ?? '').slice(0, 10);
  return _RE_ISO_DIA.test(s) ? s : '';
}

/** LO QUE MUESTRA la celda de la columna `k` para el analisis `a`.
 *
 *  Es LA forma de leer una columna: la usan el pintado de la celda, las
 *  opciones del embudo de esa columna y su match. Con 18 columnas filtrables y
 *  cuatro procedencias distintas (el registro, el lote, analisis.correccion y
 *  el veredicto que manda la API), tener la lectura en un solo lugar es lo
 *  unico que garantiza que el panel no ofrezca un valor que la celda escribe
 *  distinto — con una copia por consumidor eso se rompe callado.
 *
 *  Devuelve el valor CRUDO salvo en so2_molecular, que se muestra formateado:
 *  sin eso el embudo listaria 2601 floats distintos en vez de los ~200 que se
 *  leen en pantalla. */
function _valorDeColumna(a, k){
  if (k === 'lote') return String(a.lote ?? '');
  if (CAMPOS_DEL_LOTE.has(k)) return _delLote(a, k);
  if (k === 'so2_molecular'){
    const v = _veredictoDe(a);
    return _fmtMolec(v ? v.molec : null);
  }
  if (CAMPOS_CORRECCION.has(k)) return (a.correccion || {})[k] ?? '';
  return a[k] ?? '';
}

/* Mapas derivados de DATOS().lotes que valen para TODO el render en curso.
 * renderAnalisis() lo rearma al principio de cada pasada.
 *
 * Existe por una razon de costo: los `match` de los filtros derivados del lote
 * los llama pasaMulti UNA VEZ POR ANALISIS, y antes cada una de esas llamadas
 * reconstruia el mapa entero de lotes desde cero. Con ~240 lotes y miles de
 * analisis eso era O(analisis x lotes) en cada repintado — el mismo costo
 * cuadratico que el indexOf del pintado, solo que escondido detras de un filtro
 * y por eso mas dificil de ver.
 *
 * NO se cachea entre renders a proposito: variedad, vasija y proyecto son
 * editables, y un mapa viejo dejaria el filtro decidiendo por el valor anterior. */
let _ctxRender = null;

/* Sort state para análisis */
// Ascendente por defecto: dentro de un lote tiene mas sentido leer de mas
// viejo a mas nuevo. D1 dejaba -1 (mas reciente primero) para la tabla plana;
// con el agrupamiento por lote, ese orden viejo ya no aplica.
let sortAnalisis = { key:'fecha_analisis', dir:1 };

/* Filtros simples (no multi-select) para análisis */
let _filtAnalisisMes      = '';
let _filtAnalisisTipo     = 'todas';  // 'todas' | 'fuera'
let _filtAnalisisBusca    = '';

/* El buscador NO repinta en cada tecla: espera a que pares de tipear. Un render
 * rehace la <table> entera y vuelve a pasar por los tres filtros, asi que con
 * miles de analisis tipear "1023" costaba cuatro repintados completos, uno por
 * tecla, y la pantalla se trababa mientras escribias.
 *
 * 150 ms es mas corto que la pausa entre teclas de alguien que duda y mas largo
 * que la de alguien que tipea de corrido: al que escribe seguido le cuesta un
 * solo repintado, y al que tipea un caracter y mira no se le nota la espera. */
const MS_DEBOUNCE_BUSCA = 150;
let _timerBusca = null;

/* TODAS las columnas llevan embudo de filtro ▾ en su cabecera, como en Excel.
 * NO hay una lista aparte de cuales lo llevan, justamente para que no pueda
 * quedar ninguna afuera al agregar una columna: los filtros se derivan de
 * COLS_ANALISIS, que es la unica definicion de la tabla.
 *
 * Que el embudo de una columna con un solo valor distinto (hoy, Comentario y
 * Az. Reductor) no sirva de nada no hace daño: con la construccion perezosa no
 * cuesta ni un nodo hasta que alguien lo abre.
 *
 * Un Set por columna, creados UNA vez: los widgets guardan estas mismas
 * referencias, asi que el estado sobrevive a los re-render. */
const filtAn = {}; COLS_ANALISIS.forEach(c => filtAn[c.k] = new Set());
let _descAn = [], _instAn = [];
/* columna -> {label, inst}, para que el render sepa que embudo pintar en cada
   <th> y el clic sepa que panel abrir. Lo llena initFiltrosAn. */
const fltPorColAn = new Map();

/* Segmentado Todos | Llenos | Vacíos, el mismo control que la pestaña Lotes.
 * Se crea una sola vez y se vuelve a colgar despues de cada render, igual que
 * _instAn: esta vista rehace su seccion entera con sec.innerHTML, asi que el
 * nodo se desprende del documento pero el modo elegido viaja con el. */
let _fltAnLlenado = null;

/* Anchos de columna propios: clave de storage distinta de la de Lotes, asi que
 * arrastrar 'lote' en una pestana no mueve la otra. El encabezado de esta tabla
 * es de UNA sola fila (Lotes tiene dos por las bandas de grupo). */
const anchosAnalisis = crearAnchos({
  tablaId: 'tAnalisis',
  claveStorage: 'analisis_cols_ancho',
  filaEncabezado: 'thead tr',
});

/** Escribe el valor de una celda, sabiendo (a) si la columna aplica a este
 *  tipo de fila, y (b) si vive en analisis.correccion.* o en analisis.*
 *  directo. Devuelve 'ok'|'ro'|'invalido', igual que escribirCelda de
 *  tabla.js. Se comparte entre el listener manual de tipeo y el adaptador
 *  de la grilla para no duplicar esta decision en dos lugares. */
function _escribirColumnaAnalisis(obj, k, texto, filaTipo){
  if (!_columnaAplica(k, filaTipo)) return 'ro';
  if (CAMPOS_CORRECCION.has(k)){
    if (!obj.correccion) obj.correccion = {};
    return escribirCelda(COLS_ANALISIS, obj.correccion, k, texto);
  }
  return escribirCelda(COLS_ANALISIS, obj, k, texto);
}

function initFiltrosAn(){
  /* Los 18 descriptores salen del MISMO molde: lo que vale una columna para un
   * analisis es _valorDeColumna, y con eso se arman las opciones y el match. O
   * sea que el embudo ofrece EXACTAMENTE lo que se lee en las celdas de esa
   * columna, sin una segunda lectura que pueda divergir.
   *
   * Las opciones se sacan de los ANALISIS, no de DATOS().lotes: el embudo de
   * una columna tiene que ofrecer lo que hay EN esa columna, como en Excel.
   * Antes el de Proyecto listaba los proyectos de todos los lotes, asi que se
   * podian tildar proyectos sin ningun analisis y la tabla quedaba vacia sin
   * explicacion. */
  _descAn = COLS_ANALISIS.map(c => {
    const leer = (a) => _valorDeColumna(a, c.k);
    return {
      label: c.label, col: c.k,
      set: filtAn[c.k],
      /* cmpValores ordena numerico cuando los valores son numeros, asi que los
       * lotes y las mediciones salen en orden y no alfabeticamente. */
      // Solo los analisis de los años prendidos: no ofrecer un valor que solo
      // existe en un año apagado.
      opciones: () => opcionesValores((DATOS().analisis || []).filter(a => visible(a.lote)), leer, c.fmt),
      match: matchValor(leer),
    };
  });

  /* Modo anclado: cada filtro se monta sin boton propio y con el panel colgado
   * de <body>. El disparador es el embudo ▾ que renderAnalisis pinta dentro del
   * <th> de su columna; el panel tiene que salir de la tabla porque .scroll.tall
   * tiene overflow:auto y ahi adentro quedaria recortado.
   *
   * Perezoso: con 18 columnas, armar todas las listas de entrada son ~2000
   * casillas (6000 nodos) y 18 pasadas por los 2601 analisis, para paneles que
   * en su mayoria nadie abre. Cada uno arma la suya la primera vez que se lo
   * abre, y ahi mismo se pone al dia.
   *
   * Se montan UNA sola vez aunque esta vista rehaga su seccion entera en cada
   * render: los paneles viven fuera de #tab-analisis, asi que sobreviven al
   * innerHTML, y el clic del embudo se atiende por delegacion. */
  _instAn = _descAn.map(d => crearFiltroMulti({
    label:d.label, opciones:d.opciones, set:d.set, onChange:renderAnalisis,
    anclado:true, perezoso:true,
  }));

  fltPorColAn.clear();
  _descAn.forEach((d, i) => fltPorColAn.set(d.col, { label:d.label, inst:_instAn[i] }));
}

/** Le saca el verde y el naranja a una fila (y al separador de su lote): su
 *  veredicto acaba de dejar de valer porque alguien edito una medicion. No
 *  toca los datos ni pide un render — es solo la marca visual, y el proximo
 *  repintado con veredictos frescos la repone. */
function _descolorarFila(tr){
  if (!tr) return;
  tr.querySelectorAll('.dentro, .fuera').forEach(el => el.classList.remove('dentro', 'fuera'));
  /* El separador esta ARRIBA en el DOM, como hermano: se camina hacia atras
     hasta encontrarlo. Si no se lo descolorara, el lote seguiria diciendo
     "todo en criterio" con una fila que ya no se sabe si lo cumple. */
  for (let p = tr.previousElementSibling; p; p = p.previousElementSibling){
    if (p.classList.contains('analisis-separador')){ p.classList.remove('ok', 'mal'); break; }
  }
}

/* Cierra cualquier panel de filtro abierto, sea de la cabecera o de otra
   pestaña. Es el mismo gesto que hace app.js al hacer clic afuera. */
function cerrarPanelesAn(){
  document.querySelectorAll('.mfilt-panel.open').forEach(p => p.classList.remove('open'));
}

/* El panel anclado es position:fixed, asi que al cambiar el tamaño de la
 * ventana se queda donde estaba mientras su columna se mueve. Se cierra, que es
 * lo que hace Excel.
 *
 * Va ACA, en el cuerpo del modulo, y no dentro de renderAnalisis: esta vista
 * rehace su seccion entera con sec.innerHTML, asi que el guardrail t._wired
 * nunca se cumple (la <table> es un nodo nuevo en cada pasada) y un
 * addEventListener sobre window ahi adentro sumaria uno por repintado. El del
 * scroll, en cambio, va sobre el .scroll que se acaba de crear: ese nodo muere
 * con el render que lo creo y no acumula nada. */
window.addEventListener('resize', cerrarPanelesAn);

export function renderAnalisis(){
  const sec = $('tab-analisis'); if (!sec) return;

  /* Contexto de ESTE render: lo lee _valorDeColumna, que corre una vez por
   * analisis y por columna.
   *
   * Ya no lleva el mapa objeto->posicion: los veredictos se guardan por
   * OBJETO (ver _analisisFlags), asi que el filtro de "solo fuera de
   * criterio", el pintado y la columna SO2 molecular los leen directo del
   * registro, sin pasar por su posicion en DATOS().analisis.
   *
   * OJO: vale SOLO durante este render. El handler de borrado, que se cablea
   * una sola vez y sobrevive a todos los renders, sigue usando indexOf a
   * proposito — capturar este contexto lo dejaria mirando datos viejos. */
  _ctxRender = {
    loteObjMap: _buildLoteObjMap(),
  };

  const loteObjMap = _ctxRender.loteObjMap;

  /* Los filtros se montan ANTES de armar el HTML, y no despues como cuando
   * vivian en la toolbar. Dos motivos: el <thead> necesita fltPorColAn para
   * saber en que columnas pintar el embudo, y el filtrado de mas abajo llama a
   * pasaMulti(_descAn) — con los descriptores todavia vacios, el primer render
   * se dibujaba sin aplicar ningun filtro multi.
   *
   * Sus `opciones` leen _ctxRender, asi que tiene que ir despues de armarlo. */
  if (_descAn.length === 0) initFiltrosAn();

  /* Se crea ACA y no al montarlo mas abajo porque el filtrado pasa antes de
     armar el HTML: si no existiera todavia, el primer render se dibujaria sin
     aplicar el modo elegido. */
  if (!_fltAnLlenado) _fltAnLlenado = crearFiltroLlenado(renderAnalisis);
  const loteDe = (a) => loteObjMap.get(String(a.lote ?? ''));
  /* Para el pintado, que tiene a mano el NUMERO de lote y no el analisis. */
  const esVacio = (numLote) => estaVacio(loteObjMap.get(String(numLote ?? '')));

  /* Selector de años: se filtra el array crudo ANTES de armar meses y
   * registrosFiltrados, para que ninguno de los dos ofrezca ni cuente lo de
   * un año apagado. */
  const delAnio = (DATOS().analisis || []).filter(a => visible(a.lote));

  /* -------- construir opciones de filtros -------- */
  const meses     = [...new Set(delAnio.map(a => (a.fecha_analisis||'').slice(0,7)).filter(Boolean))].sort().reverse();

  /* -------- filtrar el array crudo (mes/busca/variedad/proyecto, igual que
     antes: se filtran los REGISTROS, no las filas virtuales) -------- */
  let registrosFiltrados = delAnio;
  if (_filtAnalisisBusca){
    const q = _filtAnalisisBusca.toLowerCase();
    registrosFiltrados = registrosFiltrados.filter(a => String(a.lote??'').toLowerCase().includes(q));
  }
  if (_filtAnalisisMes)
    registrosFiltrados = registrosFiltrados.filter(a => (a.fecha_analisis||'').startsWith(_filtAnalisisMes));
  registrosFiltrados = registrosFiltrados.filter(a => pasaMulti(a, _descAn));
  /* Llenado: es una propiedad del LOTE, no del analisis, asi que se filtra el
     registro crudo (como mes/variedad/proyecto) y no la fila virtual. Un lote
     vacio se lleva sus dos tipos de fila, quimica y correccion, que es lo que
     corresponde: el lote no tiene litros, no "esta medicion en particular". */
  registrosFiltrados = registrosFiltrados.filter(a => _fltAnLlenado.pasa(loteDe(a)));

  /* "Solo fuera de criterio" ya NO filtra el array crudo: filtra FILAS
   * VIRTUALES, porque el concepto es exclusivo de quimica. Si filtrara el
   * array crudo, un registro con una fila quimica marcada arrastraria
   * tambien su fila de correccion, que el spec pide que nunca se vea con
   * este filtro activo. Se pasa a armarFilas como filtroFila. */
  let filtroFilaVirtual = () => true;
  if (_filtAnalisisTipo === 'fuera' && _analisisFlags){
    filtroFilaVirtual = (fila) => {
      if (fila.tipo !== 'quimica') return false;
      /* Un registro sin veredicto (editado despues del ultimo Guardar, o de
       * un DATOS() rearmado por una fusion) no pasa: no se sabe si esta fuera. */
      const v = _veredictoDe(fila.analisis);
      return !!v && v.fuera.size > 0;
    };
  }

  /* -------- agrupar, ordenar (dentro de cada grupo) y separar -------- */
  const filasVirtuales = armarFilas(registrosFiltrados, sortAnalisis, filtroFilaVirtual);

  /* Las filas de DATOS (quimica/correccion) son las que la grilla indexa;
   * los separadores NO entran aca — la grilla los excluye via colspan, asi
   * que t._rows tiene que tener EXACTAMENTE las mismas filas que g.trs, en
   * el mismo orden, o el indice se desalinea y cada celda edita el objeto
   * equivocado. */
  const filasDeDatos = filasVirtuales.filter(f => f.tipo !== 'separador');

  /* -------- HTML: barra de controles -------- */
  const html = `
<div class="toolbar" id="analisisToolbar">
  <input class="txt" id="buscaAnalisis" placeholder="🔎 Buscar por lote…" style="min-width:160px" value="${escA(_filtAnalisisBusca)}">
  <select id="fltAnMes"><option value="">Todos los meses</option>${meses.map(m=>`<option value="${escA(m)}"${m===_filtAnalisisMes?' selected':''}>${esc(fmtMes(m))}</option>`).join('')}</select>
  <select id="fltAnTipo">
    <option value="todas"${_filtAnalisisTipo==='todas'?' selected':''}>Todas las filas</option>
    <option value="fuera"${_filtAnalisisTipo==='fuera'?' selected':''}>Solo fuera de criterio</option>
  </select>
  <div id="fltAnLlenado"></div>
  <button class="btn" id="btnLimpiarFltAn">🧹 Limpiar filtros</button>
  <button class="btn" id="btnAjustarAnchosAn"
    title="Ajustar el ancho de todas las columnas a su contenido. También se puede arrastrar el borde derecho de cada encabezado, o hacerle doble clic.">↔ Ajustar anchos</button>
  <button class="btn" id="btnResetAnchosAn" style="display:none"
    title="Volver al ancho automático de las columnas">↩ Anchos originales</button>
  <span class="tag" id="analisisCount"></span>
</div>
<div class="legend-inline">
  <span class="sw dentro"></span> Valor dentro de criterio
  &nbsp;·&nbsp;
  <span class="sw fuera"></span> Valor fuera de criterio
  &nbsp;·&nbsp;
  <span class="sw sep-mal"></span> Lote cuya última medición tiene algo fuera de criterio
  &nbsp;·&nbsp;
  <span class="sw vacio"></span> Análisis de un lote sin litros (filas atenuadas)
</div>
<div class="legend-inline" style="margin-top:-8px">
  Sólo se pintan las columnas que tienen criterio (pH, AV, Gluc+Fruc, Az. Reductor,
  Málico, SO₂ libre y SO₂ molecular). Una celda sin color es una que no se puede
  juzgar: sin medición, o sin el pH que hace falta para el molecular.
  <br>La banda del lote muestra cómo está <b>hoy</b>: vale la última medición de cada
  valor, así que un lote puede tener filas viejas en naranja y estar en verde. Un
  valor que quedó fuera de criterio y nadie volvió a medir sigue contando.
</div>
<div class="scroll tall"><table id="tAnalisis"></table></div>`;

  /* La seccion se rehace entera, asi que el <input> del buscador que hay ahora
   * se destruye y el foco se va al body. Antes eso ya pasaba en cada tecla;
   * ahora que el repintado llega diferido molesta mas, porque te saca del campo
   * 150 ms despues de la ultima letra. Se anota el estado del campo para
   * devolverlo al final del render.
   *
   * Se guarda el valor CRUDO, no _filtAnalisisBusca: entre que el debounce
   * disparo y que este render termina, el usuario pudo haber seguido tipeando,
   * y el HTML de arriba lleva la consulta vieja. Esas teclas de mas ya tienen
   * su propio timer en vuelo, asi que la tabla se pone al dia sola. */
  const buscaPrevio = $('buscaAnalisis');
  const focoEnBusca = !!buscaPrevio && document.activeElement === buscaPrevio;
  const buscaCrudo  = focoEnBusca ? buscaPrevio.value : null;
  const buscaCaret  = focoEnBusca ? buscaPrevio.selectionStart : null;

  sec.innerHTML = html;

  /* -------- tabla -------- */
  const t = $('tAnalisis');
  /* SOLO las filas de dato (quimica/correccion), nunca los separadores: ver
   * la nota arquitectonica al principio de esta tarea. El indice dentro de
   * este array es el mismo indice `f` que usa la grilla. */
  t._rows = filasDeDatos;

  /* Embudo de filtro de la columna, o '' si no tiene. Es un <button> a
   * proposito, igual que en la pestaña Lotes: grilla.js no le roba el clic a un
   * boton. Se repinta en cada render, asi que el contador y el resaltado salen
   * siempre del tamaño actual del Set; el panel, en cambio, vive colgado de
   * <body> y no se rehace. */
  const embudo = k => {
    const f = fltPorColAn.get(k);
    if (!f) return '';
    const n = filtAn[k].size;
    const tit = n ? `${f.label}: ${n} valor${n > 1 ? 'es' : ''} elegido${n > 1 ? 's' : ''}`
                  : `Filtrar por ${f.label}`;
    return ` <button class="th-flt${n ? ' active' : ''}" data-flt="${escA(k)}"`
         + ` title="${escA(tit)}">▾${n ? ' ' + n : ''}</button>`;
  };

  /* encabezados. COLS_ANALISIS tiene 18 entradas (16 de quimica/comunes + 2 de
   * correccion) y las 18 llevan embudo. */
  let h = '<thead><tr>';
  for (const c of COLS_ANALISIS){
    const ar = sortAnalisis.key===c.k ? `<span class="arrow">${sortAnalisis.dir>0?'▲':'▼'}</span>` : '';
    h += `<th data-k="${escA(c.k)}" class="${c.num?'num':''}">${esc(c.label)}${ar}${embudo(c.k)}</th>`;
  }
  h += '<th></th></tr></thead>';

  /* Numero total de columnas, para el colspan del separador: las de
   * COLS_ANALISIS (todas llevan data-k) mas la de acciones (no lleva). */
  const COLSPAN_TOTAL = COLS_ANALISIS.length + 1;

  /* Veredicto de una fila. Solo la de quimica tiene: la de correccion no trae
   * ninguna metrica que juzgar, y antes de que llegue /api/analisis no hay
   * veredictos de ninguna. En los dos casos devuelve SIN_VEREDICTO, o sea los
   * dos conjuntos vacios, y el pintado no necesita preguntar por null. */
  const veredictoDe = (fila) => (fila.tipo === 'quimica' && _analisisFlags)
    ? (_veredictoDe(fila.analisis) || SIN_VEREDICTO)
    : SIN_VEREDICTO;

  /* Estado de cada lote, para pintar su separador.
   *
   * El separador dice como esta el lote HOY, no si alguna vez tuvo algo mal:
   * vale el ULTIMO veredicto de CADA metrica. Un pH que se corrigio en abril no
   * puede dejar el lote en naranja para siempre cuando las cinco mediciones
   * siguientes dieron bien — era el bug que se veia con el lote 26139.
   *
   * Es metrica por metrica, y no "el veredicto de la ultima fila", porque no
   * todas se miden juntas: si la corrida de septiembre trajo pH y SO2 pero no
   * malico, el malico sigue valiendo el de la ultima vez que se lo midio. Un
   * problema que nadie volvio a medir sigue abierto. Es exactamente el criterio
   * con el que el motor juzga el lote (estadoPh y estadoSo2 en
   * fml-condiciones.ts caminan el historial hacia atras y se quedan con el
   * ultimo valor valido de cada una).
   *
   * Se calcula sobre las filas que QUEDARON despues de filtrar, no sobre todo
   * el lote: el separador describe lo que hay debajo de el, si no marcaria un
   * problema senalando filas que el filtro escondio.
   *
   * Y queda sin color si no hay ningun veredicto: un lote que solo tiene
   * correcciones, o mediciones que no se pueden juzgar, NO sale verde. El verde
   * significa "lo mire y esta bien", no "no encontre nada". */
  const quimicasPorLote = new Map();
  for (const fila of filasDeDatos){
    if (fila.tipo !== 'quimica') continue;
    const lote = String(fila.analisis.lote ?? '');
    const lista = quimicasPorLote.get(lote);
    if (lista) lista.push(fila); else quimicasPorLote.set(lote, [fila]);
  }

  const estadoDeLote = new Map();
  for (const [lote, filas] of quimicasPorLote){
    /* De la mas reciente a la mas vieja. Se ordena por FECHA y no por el orden
     * en que estan saliendo en pantalla: la tabla se puede ordenar por
     * cualquier columna, y con sortAnalisis en pH "la ultima fila del grupo" no
     * es "la medicion mas reciente". Las fechas son ISO, asi que comparar los
     * textos ya es comparar cronologicamente, y las filas sin fecha ('') caen
     * al final: no pueden ser la ultima palabra sobre nada. */
    const recientesPrimero = [...filas].sort(
      (a, b) => _fechaIso(b.analisis).localeCompare(_fechaIso(a.analisis)));

    const yaResuelta = new Set();
    let hayFuera = false;
    for (const f of recientesPrimero){
      const v = veredictoDe(f);
      for (const m of v.fuera){
        if (yaResuelta.has(m)) continue;
        yaResuelta.add(m); hayFuera = true;
      }
      for (const m of v.dentro) yaResuelta.add(m);
    }
    if (yaResuelta.size) estadoDeLote.set(lote, hayFuera ? 'mal' : 'ok');
  }

  /* filas: se recorre filasVirtuales COMPLETO (con separadores), pero el
   * contador `ri` de data-row solo avanza en las filas de dato — tiene que
   * coincidir exactamente con la posicion de cada fila dentro de t._rows. */
  let tb = '<tbody>';
  let ri = -1;
  for (const fila of filasVirtuales){
    if (fila.tipo === 'separador'){
      const lote = loteObjMap.get(String(fila.lote));
      const variedadDelLote = lote ? (lote.variedad ?? '') : '';
      /* El atenuado va en el separador Y en cada fila del grupo: son <tr>
         hermanas, no anidadas, asi que una sola clase no alcanza para las dos.
         La regla tr.vacio de index.html no esta acotada a #tLotes, por eso
         sirve tal cual aca. */
      const clsSep = 'analisis-separador'
        + (esVacio(fila.lote) ? ' vacio' : '')
        + (estadoDeLote.has(fila.lote) ? ' ' + estadoDeLote.get(fila.lote) : '');
      tb += `<tr class="${clsSep}"><td colspan="${COLSPAN_TOTAL}">` +
            `<button class="alarm-lote-link" data-iralote="${escA(fila.lote)}">${esc(fila.lote)}</button>` +
            (variedadDelLote ? ` — ${esc(variedadDelLote)}` : '') +
            `</td></tr>`;
      continue;
    }

    ri++;
    const o = fila.analisis;
    const ver = veredictoDe(fila);

    tb += esVacio(o.lote) ? '<tr class="vacio">' : '<tr>';
    for (const c of COLS_ANALISIS){
      const metric = c.k;
      const attrs = `data-row="${ri}" data-k="${escA(metric)}"`;

      if (!_columnaAplica(metric, fila.tipo)){
        // esta columna no corresponde a este tipo de fila: en blanco, de
        // solo lectura, sin input.
        tb += `<td class="ro" ${attrs}></td>`;
        continue;
      }

      /* '', 'dentro' o 'fuera'. El '' no es solo "no hay criterio": tambien es
       * "hay criterio pero esta fila no se puede juzgar" (sin medicion, o SO2
       * por encima del piso sin pH). Esas celdas quedan sin pintar, que es
       * distinto de pintarlas de verde. */
      const marca = METRICAS_CON_CRITERIO.has(metric)
        ? (ver.fuera.has(metric) ? ' fuera' : ver.dentro.has(metric) ? ' dentro' : '')
        : '';

      /* Una sola lectura para las cuatro procedencias (el registro, el lote,
       * analisis.correccion y el veredicto de la API), la misma que usan las
       * opciones del embudo de esta columna. */
      const v = _valorDeColumna(o, metric);
      /* Lo unico que cambia entre el dato y la pantalla. La celda de Fecha se
       * lee 10/09/2026 y se escribe igual; escribirCelda la vuelve a ISO al
       * guardar, asi que el valor del modelo nunca ve el formato de pantalla. */
      const vista = c.fmt ? c.fmt(v) : v;

      if (c.ro){
        const cls = 'ro' + marca + (c.num ? ' num' : '');
        tb += `<td class="${cls}" ${attrs}>${esc(vista)}</td>`;
      } else {
        const cls = [marca.trim(), c.num ? 'num' : ''].filter(Boolean).join(' ');
        tb += `<td class="${cls}" ${attrs}>` +
              `<input class="cell${c.num?' num':''}${marca}" type="text" ` +
              `${attrs} value="${escA(vista)}"></td>`;
      }
    }
    const etiquetaBoton = fila.tipo === 'quimica' ? 'Eliminar medición' : 'Eliminar corrección';
    tb += `<td><button class="rowbtn" data-del="${ri}" title="${escA(etiquetaBoton)}">✕</button></td></tr>`;
  }
  tb += '</tbody>';
  t.innerHTML = h + tb;

  $('analisisCount').textContent = filasDeDatos.length + ' filas / ' + delAnio.length + ' análisis';

  /* -------- sort por clic en encabezado -------- */
  t.querySelectorAll('th[data-k]').forEach(th => th.onclick = () => {
    toggleSort(sortAnalisis, th.dataset.k);
    renderAnalisis();
  });

  /* -------- edición en memoria (delegado, idempotente) --------
   * Se enruta por el mismo _escribirColumnaAnalisis que usa el adaptador de
   * la grilla: antes esto escribia directo (c.num ? num(v) : ...) sin
   * rechazar nada, asi que tipear texto invalido en una columna numerica
   * limpiaba el valor en silencio. Ahora se rechaza y se conserva el valor
   * anterior, igual que ya hace la grilla para pegado en bloque — mismo
   * comportamiento en los dos caminos de edicion de esta pestana. */
  if (!t._wired){
    t._wired = true;

    /* --- embudo de filtro de la cabecera ---
     * En CAPTURA y cortando la propagacion, que resuelve tres cosas de un saque:
     * el onclick de ordenar del th es de burbuja y nunca llega; el listener de
     * document de app.js que cierra los paneles al hacer clic afuera tampoco, asi
     * que el panel recien abierto no se cierra solo; y la grilla no llega a
     * interpretar el clic. */
    t.addEventListener('click', e => {
      const b = e.target.closest('[data-flt]');
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      const f = fltPorColAn.get(b.dataset.flt);
      if (f) f.inst.abrir(b);
    }, true);

    /* El panel es position:fixed: se queda quieto mientras la tabla se mueve por
     * debajo, asi que al scrollear quedaria flotando lejos de su columna. */
    const cont = t.closest('.scroll');
    if (cont) cont.addEventListener('scroll', cerrarPanelesAn);

    t.addEventListener('input', e => {
      const el = e.target.closest('input.cell'); if (!el) return;
      const fila = t._rows[+el.dataset.row]; if (!fila) return;
      _escribirColumnaAnalisis(fila.analisis, el.dataset.k, el.value, fila.tipo);
      /* El veredicto que pinta esta fila lo calculo el servidor sobre el valor
       * ANTERIOR, asi que en cuanto se toca deja de describir lo que se ve: un
       * pH que se acaba de subir a 3,9 seguiria en verde. Se le saca el color a
       * la fila entera y no solo a la celda tocada porque las metricas se
       * cruzan — el pH decide el SO2 molecular, y ese el del SO2 libre.
       *
       * Vuelve al guardar: ahi sube la version del documento y la pestaña
       * repide los veredictos (ver registrarVista al final del archivo). Se
       * prefiere una celda sin color a una celda con el color equivocado. */
      if (METRICAS_CON_CRITERIO.has(el.dataset.k)){
        _descolorarFila(el.closest('tr'));
        // Y fuera del DOM: si no, el proximo repintado (ordenar, filtrar) le
        // devolvia el color viejo.
        _olvidarVeredicto(fila.analisis);
      }
      markDirty();
    });
    t.addEventListener('click', e => {
      // boton de lote del separador: no forma parte de t._rows (es un
      // colspan), asi que se resuelve aparte y antes del data-del.
      const a = e.target.closest('[data-iralote]');
      if (a){ if (a.dataset.iralote) irALote(a.dataset.iralote); return; }

      const b = e.target.closest('[data-del]'); if (!b) return;
      const fila = t._rows[+b.dataset.del]; if (!fila) return;
      const o = fila.analisis;
      const esQuimica = fila.tipo === 'quimica';
      const etiqueta = esQuimica ? 'esta medición' : 'esta corrección';
      if (!confirm(`¿Eliminar ${etiqueta} del lote ${esc(o.lote)} (${esc(fmtFecha(o.fecha_analisis)||'sin fecha')})?`)) return;

      if (esQuimica){
        for (const campo of CAMPOS_QUIMICA_A_VACIAR) o[campo] = null;
        _olvidarVeredicto(o);
      } else if (o.correccion){
        /* Borrar el objeto entero, no campo por campo: la correccion trae
         * otras claves (so2_libre_actual, diferencia, fecha) que escribe
         * vista-so2.js y que quedarian colgando como residuo si solo se
         * vaciaran las 4 columnas que esta pestana muestra. */
        delete o.correccion;
      }

      /* El registro completo desaparece de DATOS().analisis recien cuando
       * NINGUNA de las dos partes queda con algo real — nunca antes. */
      if (!esQuimicaReal(o) && !esCorreccionReal(o.correccion)){
        const idx = DATOS().analisis.indexOf(o);
        if (idx !== -1) DATOS().analisis.splice(idx, 1);
      }

      /* Ya NO se vuelven a pedir los veredictos aca. Antes se pedian en el
       * acto, pero el servidor los calcula sobre lo GUARDADO, donde esta fila
       * todavia existe: indexados por posicion, todo lo que estaba debajo del
       * borrado se pintaba con el color de la fila de al lado. Por objeto, las
       * demas filas conservan el suyo, que sigue valiendo; los frescos llegan
       * al guardar. */
      markDirty();
      renderAnalisis();
    });
  }

  /* -------- controles de filtro -------- */
  const buscaEl = $('buscaAnalisis');
  if (buscaEl) buscaEl.addEventListener('input', () => {
    const q = buscaEl.value.trim();
    clearTimeout(_timerBusca);
    _timerBusca = setTimeout(() => {
      /* Agregar y borrar un espacio deja la consulta igual: no hay nada que
       * repintar. */
      if (q === _filtAnalisisBusca) return;
      _filtAnalisisBusca = q;
      renderAnalisis();
    }, MS_DEBOUNCE_BUSCA);
  });

  const fltMes = $('fltAnMes');
  if (fltMes) fltMes.addEventListener('change', () => { _filtAnalisisMes = fltMes.value; renderAnalisis(); });

  /* --- filtros multi ---
   * Ya no hay que re-montar nada: en modo anclado los paneles cuelgan de <body>,
   * fuera de #tab-analisis, asi que el sec.innerHTML de arriba no se los lleva.
   * Lo unico que se rehace en cada render es el embudo del <th>, que es HTML.
   *
   * Tampoco se refrescan las listas de casillas en cada render: cada panel se
   * pone al dia solo al abrirlo (alternarPanel llama a rebuildSiCambio). Con 18
   * embudos, hacerlo por render costaba 18 pasadas sobre los 2601 analisis en
   * cada tecla del buscador y en cada cambio de filtro, para listas que nadie
   * estaba mirando. El contador del embudo no depende de eso: sale del tamaño
   * del Set, que el <thead> lee directo. */

  /* Se vuelve a colgar el MISMO nodo (no uno nuevo): sec.innerHTML lo
     desprendio del documento, pero conserva su modo y su listener. */
  const huecoLlenado = $('fltAnLlenado');
  if (huecoLlenado) huecoLlenado.appendChild(_fltAnLlenado.el);

  const fltTipo = $('fltAnTipo');
  if (fltTipo) fltTipo.addEventListener('change', () => { _filtAnalisisTipo = fltTipo.value; renderAnalisis(); });

  const btnLimpiar = $('btnLimpiarFltAn');
  if (btnLimpiar) btnLimpiar.addEventListener('click', () => {
    /* Si habia un repintado del buscador en vuelo, se descarta: acaba de dejar
     * de valer y volveria a poner la consulta que este boton borro. */
    clearTimeout(_timerBusca);
    _filtAnalisisBusca = '';
    _filtAnalisisMes = '';
    _filtAnalisisTipo = 'todas';
    _fltAnLlenado.reset();
    limpiarFiltrosMulti(_descAn, null, _instAn, renderAnalisis);
  });

  /* Grilla tipo planilla, con adaptador PROPIO: la fabrica generica de D1
   * (adaptadorCols) asume una fila = un objeto de DATOS() con columnas
   * siempre editables o siempre de solo lectura, sin excepcion por fila. Aca
   * una celda de pH es editable en 'quimica' y de solo lectura en
   * 'correccion', y las columnas de correccion viven anidadas — la fabrica
   * generica no resuelve ninguna de las dos cosas.
   *
   * Nota sobre la seleccion: objetoDe(f) devuelve t._rows[f], que es un
   * objeto {tipo, analisis} construido de NUEVO en cada render (no es el
   * mismo objeto de DATOS() persistente que usan Lotes/Movimientos). Sin un
   * claveFila explicito, la grilla no puede reconocer "esta es la misma fila
   * que antes" entre un render y el siguiente, asi que una edicion que
   * dispare un re-render (por ejemplo, el boton ✕) LIMPIA la seleccion en
   * vez de restaurarla. Es una simplificacion deliberada: perder la
   * seleccion es molesto pero seguro (mismo criterio que ya establecio D1
   * para el caso general), y agregar un claveFila estable requeriria buscar
   * la posicion de cada objeto en DATOS().analisis por cada fila en cada
   * render (indexOf, O(n) por fila) para una mejora de comodidad, no de
   * correctitud. Si en el uso real esto molesta, se puede sumar despues. */
  activarGrilla(t, {
    objetoDe(f){ return (t._rows && t._rows[f] != null) ? t._rows[f] : null; },
    leer(fila, k){
      if (!fila) return undefined;
      const contenedor = CAMPOS_CORRECCION.has(k) ? (fila.analisis.correccion || {}) : fila.analisis;
      return contenedor[k];
    },
    escribir(fila, k, texto){
      if (!fila) return 'ro';
      const estado = _escribirColumnaAnalisis(fila.analisis, k, texto, fila.tipo);
      /* Pegar o Ctrl+D sobre una medicion deja su veredicto viejo: mismo
       * criterio que el tipeo a mano (ver el listener de 'input'). */
      if (estado === 'ok' && METRICAS_CON_CRITERIO.has(k)) _olvidarVeredicto(fila.analisis);
      return estado;
    },
    escribirCrudo(fila, k, valor){
      if (!fila) return;
      // El Ctrl+Z tambien cambia la medicion: el veredicto ya no vale.
      if (METRICAS_CON_CRITERIO.has(k)) _olvidarVeredicto(fila.analisis);
      if (CAMPOS_CORRECCION.has(k)){
        if (!fila.analisis.correccion) fila.analisis.correccion = {};
        fila.analisis.correccion[k] = valor;
      } else {
        fila.analisis[k] = valor;
      }
    },
    onCambio: markDirty,
  });

  /* Anchos de columna. La toolbar se rehace en cada render (sec.innerHTML), asi
   * que los botones se vuelven a cablear cada vez; la instancia y los anchos
   * guardados son los mismos siempre. El boton de restablecer solo aparece
   * cuando hay algo que restablecer, igual que en Lotes. */
  anchosAnalisis.activar(t, hay => {
    const b = $('btnResetAnchosAn');
    if (b) b.style.display = hay ? '' : 'none';
  });

  const btnAjAn = $('btnAjustarAnchosAn');
  if (btnAjAn) btnAjAn.addEventListener('click', () => anchosAnalisis.autoajustarTodas());

  const btnResAn = $('btnResetAnchosAn');
  if (btnResAn) btnResAn.addEventListener('click', () => anchosAnalisis.restablecer());

  /* Ultimo de todo, para que ni la grilla ni los anchos le saquen el foco
   * despues: si el buscador lo tenia antes del repintado, se lo devuelve con el
   * cursor donde estaba. */
  if (focoEnBusca){
    const buscaNuevo = $('buscaAnalisis');
    if (buscaNuevo){
      if (buscaCrudo != null && buscaNuevo.value !== buscaCrudo) buscaNuevo.value = buscaCrudo;
      buscaNuevo.focus();
      if (buscaCaret != null) buscaNuevo.setSelectionRange(buscaCaret, buscaCaret);
    }
  }
}

/* Prefetch de los veredictos al arrancar. Sin esto la primera visita a la
 * pestaña dibujaba la tabla DOS veces: una sin colores y otra cuando llegaba
 * /api/analisis. Se pide con el navegador ocioso para no competir con /datos y
 * /dashboard, que son los que pinta la pantalla de inicio. */
registrarInit(() => {
  if (_analisisFlags && _flagsVersion === ((DATOS().meta || {}).version ?? null)) return;
  const pedir = () => { if (!_analisisFlagsLoading) cargarAnalisisFlags(); };
  if (window.requestIdleCallback) requestIdleCallback(pedir, { timeout: 3000 });
  else setTimeout(pedir, 1500);
});

/* nucleo avisa cuando reemplaza todos los objetos de DATOS() (recarga, o
 * fusion tras un 409). Los veredictos estan enganchados a los objetos viejos,
 * asi que ya no le sirven a nadie: se sueltan para que registrarVista los de
 * por vencidos y los vuelva a pedir en cuanto no haya cambios sin guardar. */
document.addEventListener('lotes:datos-recargados', () => { _analisisFlags = null; });

registrarVista('analisis', () => {
  renderAnalisis();
  /* Se vuelven a pedir tambien cuando la version del documento avanzo: los
   * veredictos los calcula el servidor sobre lo guardado, asi que despues de un
   * Guardar los que estan en memoria son de la version anterior y pintarian una
   * celda con el criterio de un valor que ya se cambio. */
  const vDoc = (DATOS().meta || {}).version ?? null;
  const vencidos = !_analisisFlags || _flagsVersion !== vDoc;
  if (vencidos && !_analisisFlagsLoading) cargarAnalisisFlags();
});
