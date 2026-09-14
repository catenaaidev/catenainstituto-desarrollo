/* ===== Lotes CIW — pestana Analisis ===== */
'use strict';

import { $, esc, escA, DATOS, markDirty, registrarVista, irALote } from './nucleo.js';
import { toggleSort, escribirCelda, pasaMulti, opcionesValores,
         initFiltrosMulti, limpiarFiltrosMulti } from './tabla.js';
import { activarGrilla } from './grilla.js';
import { armarFilas, esQuimicaReal, esCorreccionReal } from './analisis-filas.js';
import { crearFiltroLlenado } from './filtro-llenado.js';
import { estaVacio } from './envases.js';

/* Columnas de la tabla de análisis. Las 4 ultimas son de la CORRECCION de SO2
 * (viven en analisis.correccion.*, no directo en el registro) y solo se ven
 * en la fila de tipo 'correccion'; las anteriores son de quimica y solo se
 * ven en la fila 'quimica'. lote/variedad/fecha_analisis se ven en las dos. */
const COLS_ANALISIS = [
  { k:'lote',          label:'Lote',          ro:true  },
  { k:'variedad',      label:'Variedad',       ro:true  },
  { k:'fecha_analisis',label:'Fecha',          ro:false },
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
  { k:'comentario',    label:'Comentario',     ro:false },
  { k:'ot_n',            label:'OT',              ro:false },
  { k:'so2_deseado',     label:'SO2 deseado',     num:true },
];

/* Claves que viven anidadas en analisis.correccion.*, no en el registro raiz.
 * Las demas columnas de COLS_ANALISIS (salvo lote/variedad/fecha_analisis,
 * que se ven en ambos tipos) son de quimica y viven en el registro raiz. */
/* mbk_a_agregar y ml_exactos SIGUEN existiendo en analisis.correccion y se
 * siguen viendo y editando en las pestanas SO2 y Orden de correccion: lo unico
 * que se saco es la columna de ESTA tabla. */
const CAMPOS_CORRECCION = new Set(['ot_n', 'so2_deseado']);
const CAMPOS_COMUNES = new Set(['lote', 'variedad', 'fecha_analisis']);

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

/* Flags de fuera de criterio: Map<idx(en DATOS.analisis) -> Set<metric>> */
let _analisisFlags = null;  // null = no cargado aún
let _analisisFlagsLoading = false;

async function cargarAnalisisFlags(){
  if (_analisisFlagsLoading) return;
  _analisisFlagsLoading = true;
  try {
    const r = await fetch(API+'/analisis');
    if (!r.ok) return;
    const j = await r.json();
    _analisisFlags = new Map();
    for (const row of (j.analisis || [])){
      _analisisFlags.set(row.idx, new Set(row.fuera || []));
    }
    renderAnalisis();  // repintar con colores una vez que lleguen los flags
  } catch(e) { /* sin flags: los colores se omiten */ }
  finally { _analisisFlagsLoading = false; }
}

/* Mapa de lote -> variedad para lookup rápido */
function _buildLoteMap(){
  const m = new Map();
  for (const l of (DATOS().lotes || [])){
    m.set(String(l.lote ?? ''), l.variedad ?? '');
  }
  return m;
}

/* Mapa de lote -> OBJETO lote. Aparte del de arriba a proposito: ese devuelve
 * la variedad (un string) y ya hay codigo colgado de esa forma. El filtro de
 * llenado y el atenuado necesitan el lote entero para mirarle los litros.
 *
 * get() de un lote que no existe devuelve undefined, y eso esta bien: un
 * analisis puede sobrevivir al borrado de su lote, y pasaLlenado/estaVacio lo
 * tratan como vacio sin ninguna rama especial. */
function _buildLoteObjMap(){
  const m = new Map();
  for (const l of (DATOS().lotes || [])) m.set(String(l.lote ?? ''), l);
  return m;
}

/* Sort state para análisis */
// Ascendente por defecto: dentro de un lote tiene mas sentido leer de mas
// viejo a mas nuevo. D1 dejaba -1 (mas reciente primero) para la tabla plana;
// con el agrupamiento por lote, ese orden viejo ya no aplica.
let sortAnalisis = { key:'fecha_analisis', dir:1 };

/* Filtros simples (no multi-select) para análisis */
let _filtAnalisisMes      = '';
let _filtAnalisisTipo     = 'todas';  // 'todas' | 'fuera'
let _filtAnalisisBusca    = '';

/* Un Set por columna filtrable, creados UNA vez: los widgets guardan estas
 * mismas referencias, asi que el estado sobrevive a los re-render. */
const filtAn = { variedad: new Set(), proyecto: new Set() };
let _descAn = [], _instAn = [];

/* Segmentado Todos | Llenos | Vacíos, el mismo control que la pestaña Lotes.
 * Se crea una sola vez y se vuelve a colgar despues de cada render, igual que
 * _instAn: esta vista rehace su seccion entera con sec.innerHTML, asi que el
 * nodo se desprende del documento pero el modo elegido viaja con el. */
let _fltAnLlenado = null;

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
  /* OJO: _buildLoteMap() de esta pestana devuelve lote -> STRING de variedad
   * (no el objeto lote, a diferencia de FML y SO2). Ver el uso en el render. */
  const variedadDe = (m) => (a) => m.get(String(a.lote ?? '')) || '';
  /* Set de lotes que pertenecen a los proyectos tildados. Se recalcula en cada
   * match porque los proyectos de los lotes son editables. */
  const lotesDeProyectos = (set) => {
    const s = new Set();
    for (const l of (DATOS().lotes || [])){
      if (set.has((l.proyecto || '').trim())) s.add(String(l.lote ?? ''));
    }
    return s;
  };

  _descAn = [
    {
      label: 'Variedad',
      set: filtAn.variedad,
      /* Opciones sobre los analisis (no sobre todos los lotes): asi el panel
       * ofrece solo variedades que tienen al menos un analisis cargado. */
      opciones: () => opcionesValores(DATOS().analisis || [], variedadDe(_buildLoteMap())),
      match: (a, set) => set.has(variedadDe(_buildLoteMap())(a)),
    },
    {
      label: 'Proyecto',
      set: filtAn.proyecto,
      opciones: () => opcionesValores(DATOS().lotes || [], l => (l.proyecto || '').trim()),
      match: (a, set) => lotesDeProyectos(set).has(String(a.lote ?? '')),
    },
  ];
  _instAn = initFiltrosMulti('fltAnBar', _descAn, renderAnalisis);
}

export function renderAnalisis(){
  const sec = $('tab-analisis'); if (!sec) return;

  const loteMap = _buildLoteMap();
  const loteObjMap = _buildLoteObjMap();
  /* Se crea ACA y no al montarlo mas abajo porque el filtrado pasa antes de
     armar el HTML: si no existiera todavia, el primer render se dibujaria sin
     aplicar el modo elegido. */
  if (!_fltAnLlenado) _fltAnLlenado = crearFiltroLlenado(renderAnalisis);
  const loteDe = (a) => loteObjMap.get(String(a.lote ?? ''));
  /* Para el pintado, que tiene a mano el NUMERO de lote y no el analisis. */
  const esVacio = (numLote) => estaVacio(loteObjMap.get(String(numLote ?? '')));

  /* -------- construir opciones de filtros -------- */
  const meses     = [...new Set((DATOS().analisis||[]).map(a => (a.fecha_analisis||'').slice(0,7)).filter(Boolean))].sort().reverse();

  /* -------- filtrar el array crudo (mes/busca/variedad/proyecto, igual que
     antes: se filtran los REGISTROS, no las filas virtuales) -------- */
  let registrosFiltrados = DATOS().analisis || [];
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
      const idx = DATOS().analisis.indexOf(fila.analisis);
      const flags = _analisisFlags.get(idx);
      return flags && flags.size > 0;
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
  <select id="fltAnMes"><option value="">Todos los meses</option>${meses.map(m=>`<option value="${escA(m)}"${m===_filtAnalisisMes?' selected':''}>${esc(m)}</option>`).join('')}</select>
  <div class="mfilt-bar" id="fltAnBar"></div>
  <select id="fltAnTipo">
    <option value="todas"${_filtAnalisisTipo==='todas'?' selected':''}>Todas las filas</option>
    <option value="fuera"${_filtAnalisisTipo==='fuera'?' selected':''}>Solo fuera de criterio</option>
  </select>
  <div id="fltAnLlenado"></div>
  <button class="btn" id="btnLimpiarFltAn">🧹 Limpiar filtros</button>
  <span class="tag" id="analisisCount"></span>
</div>
<div class="legend-inline">
  <span class="sw" style="display:inline-block;width:13px;height:13px;border-radius:3px;vertical-align:-2px;margin-right:2px;background:#fbeeeb;border-left:3px solid var(--nook)"></span> Valor fuera de criterio
  &nbsp;·&nbsp;
  <span class="sw vacio"></span> Análisis de un lote sin litros (filas atenuadas)
</div>
<div class="scroll tall"><table id="tAnalisis"></table></div>`;

  sec.innerHTML = html;

  /* -------- tabla -------- */
  const t = $('tAnalisis');
  /* SOLO las filas de dato (quimica/correccion), nunca los separadores: ver
   * la nota arquitectonica al principio de esta tarea. El indice dentro de
   * este array es el mismo indice `f` que usa la grilla. */
  t._rows = filasDeDatos;

  /* encabezados: sin cambios de logica. COLS_ANALISIS tiene 15 entradas
   * (13 de quimica/comunes + 2 de correccion). */
  let h = '<thead><tr>';
  for (const c of COLS_ANALISIS){
    const ar = sortAnalisis.key===c.k ? `<span class="arrow">${sortAnalisis.dir>0?'▲':'▼'}</span>` : '';
    h += `<th data-k="${escA(c.k)}" class="${c.num?'num':''}">${esc(c.label)}${ar}</th>`;
  }
  h += '<th></th></tr></thead>';

  /* Numero total de columnas, para el colspan del separador: las de
   * COLS_ANALISIS (todas llevan data-k) mas la de acciones (no lleva). */
  const COLSPAN_TOTAL = COLS_ANALISIS.length + 1;

  /* filas: se recorre filasVirtuales COMPLETO (con separadores), pero el
   * contador `ri` de data-row solo avanza en las filas de dato — tiene que
   * coincidir exactamente con la posicion de cada fila dentro de t._rows. */
  let tb = '<tbody>';
  let ri = -1;
  for (const fila of filasVirtuales){
    if (fila.tipo === 'separador'){
      const variedadDelLote = loteMap.get(String(fila.lote)) || '';
      /* El atenuado va en el separador Y en cada fila del grupo: son <tr>
         hermanas, no anidadas, asi que una sola clase no alcanza para las dos.
         La regla tr.vacio de index.html no esta acotada a #tLotes, por eso
         sirve tal cual aca. */
      const clsSep = 'analisis-separador' + (esVacio(fila.lote) ? ' vacio' : '');
      tb += `<tr class="${clsSep}"><td colspan="${COLSPAN_TOTAL}">` +
            `<button class="alarm-lote-link" data-iralote="${escA(fila.lote)}">${esc(fila.lote)}</button>` +
            (variedadDelLote ? ` — ${esc(variedadDelLote)}` : '') +
            `</td></tr>`;
      continue;
    }

    ri++;
    const o = fila.analisis;
    // los flags de "fuera de criterio" solo tienen sentido en la fila de
    // quimica: la de correccion no tiene metricas quimicas que marcar.
    const realIdx = DATOS().analisis.indexOf(o);
    const flags = (fila.tipo === 'quimica' && _analisisFlags)
      ? (_analisisFlags.get(realIdx) || new Set())
      : new Set();

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

      const isFuera = flags.has(metric);
      // el valor sale del registro raiz para columnas comunes/quimica, y de
      // analisis.correccion para las 4 columnas de correccion.
      const contenedor = CAMPOS_CORRECCION.has(metric) ? (o.correccion || {}) : o;

      if (metric === 'variedad'){
        const vari = loteMap.get(String(o.lote ?? '')) || '';
        tb += `<td class="ro" ${attrs}>${esc(vari)}</td>`;
      } else if (c.ro){
        const v = contenedor[metric] ?? '';
        const cls = 'ro' + (isFuera ? ' fuera' : '') + (c.num ? ' num' : '');
        tb += `<td class="${cls}" ${attrs}>${esc(v)}</td>`;
      } else {
        const v = contenedor[metric] == null ? '' : contenedor[metric];
        const cls = (isFuera ? 'fuera ' : '') + (c.num ? 'num' : '');
        tb += `<td class="${cls}" ${attrs}>` +
              `<input class="cell${c.num?' num':''}${isFuera?' fuera':''}" type="text" ` +
              `${attrs} value="${escA(v)}"></td>`;
      }
    }
    const etiquetaBoton = fila.tipo === 'quimica' ? 'Eliminar medición' : 'Eliminar corrección';
    tb += `<td><button class="rowbtn" data-del="${ri}" title="${escA(etiquetaBoton)}">✕</button></td></tr>`;
  }
  tb += '</tbody>';
  t.innerHTML = h + tb;

  $('analisisCount').textContent = filasDeDatos.length + ' filas / ' + (DATOS().analisis||[]).length + ' análisis';

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
    t.addEventListener('input', e => {
      const el = e.target.closest('input.cell'); if (!el) return;
      const fila = t._rows[+el.dataset.row]; if (!fila) return;
      _escribirColumnaAnalisis(fila.analisis, el.dataset.k, el.value, fila.tipo);
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
      if (!confirm(`¿Eliminar ${etiqueta} del lote ${esc(o.lote)} (${esc(o.fecha_analisis||'sin fecha')})?`)) return;

      if (esQuimica){
        for (const campo of CAMPOS_QUIMICA_A_VACIAR) o[campo] = null;
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

      _analisisFlags = null;
      markDirty();
      renderAnalisis();
      cargarAnalisisFlags();
    });
  }

  /* -------- controles de filtro -------- */
  const buscaEl = $('buscaAnalisis');
  if (buscaEl) buscaEl.addEventListener('input', () => { _filtAnalisisBusca = buscaEl.value.trim(); renderAnalisis(); });

  const fltMes = $('fltAnMes');
  if (fltMes) fltMes.addEventListener('change', () => { _filtAnalisisMes = fltMes.value; renderAnalisis(); });

  /* --- filtros multi (re-montados en cada render porque sec.innerHTML se recreo) --- */
  if (_descAn.length === 0){
    initFiltrosAn();
  } else {
    const bar = $('fltAnBar');
    if (bar){
      bar.innerHTML = '';
      _instAn.forEach(f => { bar.appendChild(f.el); f.rebuild(); });
    }
  }

  /* Se vuelve a colgar el MISMO nodo (no uno nuevo): sec.innerHTML lo
     desprendio del documento, pero conserva su modo y su listener. */
  const huecoLlenado = $('fltAnLlenado');
  if (huecoLlenado) huecoLlenado.appendChild(_fltAnLlenado.el);

  const fltTipo = $('fltAnTipo');
  if (fltTipo) fltTipo.addEventListener('change', () => { _filtAnalisisTipo = fltTipo.value; renderAnalisis(); });

  const btnLimpiar = $('btnLimpiarFltAn');
  if (btnLimpiar) btnLimpiar.addEventListener('click', () => {
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
      return _escribirColumnaAnalisis(fila.analisis, k, texto, fila.tipo);
    },
    escribirCrudo(fila, k, valor){
      if (!fila) return;
      if (CAMPOS_CORRECCION.has(k)){
        if (!fila.analisis.correccion) fila.analisis.correccion = {};
        fila.analisis.correccion[k] = valor;
      } else {
        fila.analisis[k] = valor;
      }
    },
    onCambio: markDirty,
  });
}

registrarVista('analisis', () => {
  renderAnalisis();
  if (!_analisisFlags && !_analisisFlagsLoading) cargarAnalisisFlags();
});
