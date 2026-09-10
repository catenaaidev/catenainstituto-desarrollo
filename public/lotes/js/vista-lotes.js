/* ===== Lotes CIW — pestana Lotes ===== */
'use strict';

import { $, esc, escA, num, DATOS, markDirty, registrarVista,
         registrarInit, dashMap, dashData, invalidarDashMap, cargarDashboard, irALote,
         mostrarOverlay, cerrarOverlay } from './nucleo.js';
import { toggleSort, sortRows, pasaMulti, opcionesValores, matchValor,
         initFiltrosMulti } from './tabla.js';
import { activarGrilla, adaptadorCols, limpiarSeleccion } from './grilla.js';
import { colsVisibles, bandasVisibles, alternar } from './grupos-cols.js';
import { activarAnchos, autoajustarTodas, restablecerAnchos } from './anchos-cols.js';
import { CAPACIDADES, resumenEnvases, contarEnvases,
         litrosDeEnvases, tiposDeEnvase, estaVacio } from './envases.js';

/* --- orden del proceso para sort de etapa --- */
const ETAPAS_ORDEN = ['ingreso', 'fa', 'fml', 'crianza', 'cerrado'];

/* --- columnas ---
 * `ro:true` marca las columnas de solo lectura. Se pintan como <td> de texto
 * plano (sin input), y con eso la grilla ya las trata bien sin cambios: esRO()
 * las detecta por la ausencia de control y escribirCeldas las saltea al pegar,
 * borrar y editar en bloque, pero Ctrl+C las sigue copiando por el innerText.
 * escribirCelda (tabla.js) tambien devuelve 'ro' para ellas.
 *
 * litros_actuales es de solo lectura desde el subsistema H: es la suma del
 * desglose de envases y lo escribe unicamente el overlay de Envases.
 *
 * El orden y los labels son los de la fila 2 de la hoja LOTES del Excel
 * (subsistema I). `banda` agrupa las columnas bajo el titulo de la fila 1 y
 * `grupo` marca las que colapsan, con los mismos dos grupos que el outline del
 * Excel. Las columnas sin `grupo` no se ocultan nunca.
 *
 * OJO con ct, clon y n_pesada: parecen numericas y NO lo son. En los datos
 * reales hay 'SL' en clon y '51 y 52' en n_pesada; marcarlas num:true haria
 * que escribirCelda las rechazara como invalidas y se perderia el dato. Hay un
 * test sobre los datos reales que fija esta decision. */
const COLS_LOTES = [
  /* --- Informacion ID (A:J del Excel) --- */
  { k:'lote',                  label:'Lote',                    banda:'id', num:true },
  { k:'lote_sistema',          label:'Lote Sistema',            banda:'id' },
  { k:'variedad',              label:'Variedad',                banda:'id' },
  { k:'distrito',              label:'Distrito',                banda:'id' },
  { k:'proyecto',              label:'Proyecto',                banda:'id' },
  { k:'vinedo',                label:'Viñedo',                  banda:'id', grupo:'id_detalle' },
  { k:'ct',                    label:'Ct',                      banda:'id', grupo:'id_detalle' },
  { k:'clon',                  label:'Clon',                    banda:'id', grupo:'id_detalle' },
  { k:'id_texto',              label:'ID',                      banda:'id', grupo:'id_detalle' },
  { k:'organico_convencional', label:'Orgánico / Convencional', banda:'id',
    sel:['','Orgánico','Convencional'] },
  /* --- Informacion Inicial y fermentacion (K:T) --- */
  { k:'fecha_ingreso',   label:'Fecha de ingreso',   banda:'ferm', grupo:'fermentacion', fecha:true },
  { k:'n_pesada',        label:'Nº Pesada',          banda:'ferm', grupo:'fermentacion' },
  { k:'kilos',           label:'Kilos',              banda:'ferm', grupo:'fermentacion', num:true },
  { k:'vasija_fa',       label:'Vasija FA',          banda:'ferm', grupo:'fermentacion' },
  { k:'descube_fa',      label:'Descube / Final FA', banda:'ferm', grupo:'fermentacion', fecha:true },
  { k:'brix_inicial',    label:'Brix Inicial',       banda:'ferm', grupo:'fermentacion', num:true },
  { k:'ph_inicial',      label:'pH Inicial',         banda:'ferm', grupo:'fermentacion', num:true },
  { k:'at_inicial',      label:'AT inicial',         banda:'ferm', grupo:'fermentacion', num:true },
  { k:'npa',             label:'NPA',                banda:'ferm', grupo:'fermentacion', num:true },
  { k:'litros_estimado', label:'Litros Estimado',    banda:'ferm', grupo:'fermentacion', num:true },
  /* --- Crianza (U:AB). Envases ocupa el lugar de las 5 columnas del desglose
   *     (50, 200, 225, 500, vasija Grande), que se editan en el overlay. --- */
  { k:'envases',         label:'Envases',                  banda:'crianza', ro:true },
  { k:'litros_actuales', label:'Litros Actuales',          banda:'crianza', num:true, ro:true },
  { k:'vasija_actual',   label:'Vasija Actual en Crianza', banda:'crianza' },
  { k:'categoria',       label:'Categoría',                banda:'crianza' },
  /* Las columnas AO:AR del Excel (Hace FML, Freq. análisis, FML Excluida y
   * Mermo) NO estan en la grilla: se quitaron porque el seguimiento del FML
   * tiene su propia pestana. Los cuatro campos siguen vivos en datos.json, los
   * sigue leyendo motor_fml.py y se siguen exportando (COLS_LOTES_ARCHIVO en
   * servidor.py), pero ya no se editan desde la aplicacion. */
];

/* --- bandas (fila 1 de la hoja LOTES) ---
 * 'estado' no existe en el Excel: son Etapa y Avance, que la vista pinta a mano
 * y no estan en COLS_LOTES, por eso declara colsFijas en lugar de columnas.
 * La banda 'fml' se fue junto con sus cuatro columnas. Dejarla declarada no
 * rompia nada (bandasVisibles saltea la banda sin columnas y sin colsFijas),
 * pero era una declaracion muerta. */
const BANDAS_LOTES = [
  { id:'id',      titulo:'Información ID',                    grupo:'id_detalle' },
  { id:'ferm',    titulo:'Información Inicial y fermentación', grupo:'fermentacion' },
  { id:'crianza', titulo:'Crianza' },
  { id:'estado',  titulo:'Estado', colsFijas:2 },
];

/* --- estado del colapsado de columnas ---
 * Vive en localStorage y no en datos.json: es una preferencia de pantalla de
 * cada persona, no un dato de la bodega, y guardarla en datos.json obligaria a
 * apretar Guardar y le pisaria la vista a los demas.
 *
 * Mismo try/catch que usuarioActual() en nucleo.js:49: si el navegador bloquea
 * el storage la pestana funciona igual y lo unico que se pierde es la memoria de
 * la preferencia. Sin la clave guardada los dos grupos arrancan EXPANDIDOS. */
const CLAVE_GRUPOS = 'lotes_cols_grupos';
let colapsados = {};

function leerColapsados(){
  try {
    const obj = JSON.parse(localStorage.getItem(CLAVE_GRUPOS) || 'null');
    // Un array o un numero guardado por error no tienen que romper la pestana.
    colapsados = (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
  } catch(e){
    colapsados = {};
  }
}

function guardarColapsados(){
  try { localStorage.setItem(CLAVE_GRUPOS, JSON.stringify(colapsados)); } catch(e){}
}

/* --- sort / filtros --- */
let sortLotes = { key:'lote', dir:1 };

/* --- filtros de la pestaña Lotes ---
 * Los que empiezan con _ no son campos del lote: se resuelven con un descriptor
 * propio en initFiltrosLotes (opciones + match a mano). */
const CAMPOS_FLT_LOTES = [
  /* Lote va primero, como en la orden de correccion, y es el mismo descriptor
   * generico que el resto: la lista de casillas la arma opcionesValores y
   * cmpValores la ordena por numero (no alfabeticamente) porque los lotes son
   * numeros en texto. El buscador '🔎 Buscar por lote' sigue existiendo aparte:
   * sirve para ir a uno solo tipeando, y este filtro para elegir varios. */
  { campo:'lote',     label:'Lote'     },
  { campo:'variedad', label:'Variedad' },
  { campo:'distrito', label:'Distrito' },
  { campo:'proyecto', label:'Proyecto' },
  { campo:'vinedo',   label:'Viñedo'   },
  { campo:'organico_convencional', label:'Orgánico/Conv.' },
  { campo:'_etapa',   label:'Etapa'    },
  { campo:'_envase',  label:'Envase'   },
];
const filtLotes = {}; CAMPOS_FLT_LOTES.forEach(c=>filtLotes[c.campo]=new Set());
let _descLotes=[], _instLotes=[];

/* --- filtro de llenado (Todos | Llenos | Vacíos) ---
 * No es un filtro multi-select mas, y por eso no esta en CAMPOS_FLT_LOTES: son
 * tres opciones EXCLUYENTES y siempre hay exactamente una puesta. Como control
 * segmentado en la toolbar se ve de un vistazo cual es; como chip habria que
 * abrir el panel para saberlo.
 *
 * No se guarda en localStorage, al reves que el colapsado de columnas: un
 * filtro que sobrevive a la recarga sin verse de entrada es justo lo que
 * despues parece "faltan lotes". Arranca en 'todos' en cada carga. */
const MODOS_LLENADO = ['todos', 'llenos', 'vacios'];
let llenado = 'todos';

function pasaLlenado(lote){
  if (llenado === 'todos') return true;
  return estaVacio(lote) === (llenado === 'vacios');
}

function pintarLlenado(){
  const bar = $('fltLlenado'); if (!bar) return;
  bar.querySelectorAll('button[data-llenado]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.llenado === llenado));
  });
}

function initLlenado(){
  const bar = $('fltLlenado'); if (!bar) return;
  bar.addEventListener('click', e => {
    const b = e.target.closest('button[data-llenado]'); if (!b) return;
    const modo = b.dataset.llenado;
    /* Un data-llenado con un typo dejaria el filtro escondiendo todos los lotes
     * y ningun boton marcado, sin forma de volver salvo recargando. */
    if (!MODOS_LLENADO.includes(modo) || modo === llenado) return;
    llenado = modo;
    pintarLlenado();
    renderLotes();
  });
  pintarLlenado();
}

/* Vuelve el segmentado a 'Todos'. Lo usa el boton Limpiar filtros, que tiene
   que limpiar TODO lo que esconde filas o deja de ser un boton confiable. */
export function resetLlenado(){
  llenado = 'todos';
  pintarLlenado();
}

/* Rearma las casillas de todos los filtros contra los lotes que hay ahora.
 *
 * Las otras vistas no necesitan esto porque rehacen su seccion entera con
 * `sec.innerHTML = html` y ahi ya llaman rebuild(). Lotes, en cambio, tiene la
 * barra fija en index.html y solo repinta #tLotes, asi que sus casillas se
 * arman una sola vez en initFiltrosLotes.
 *
 * Sin esto el filtro de Lote quedaria viejo justo cuando mas se nota: al
 * agregar un lote su numero no aparece en la lista, y como pasaMulti esconde
 * todo lo que no este seleccionado, la fila nueva se volveria invisible sin
 * forma de recuperarla salvo limpiando el filtro.
 *
 * rebuild() lee el estado desde el Set, asi que lo tildado se conserva. */
function refrescarOpcionesFiltros(){
  _instLotes.forEach(f => f.rebuild());
}

function _enrichLote(l){
  // Etapa: el campo guardado en el propio lote es la fuente de verdad.
  // Cubre los 291 lotes (activos e inactivos) sin depender de que el
  // dashboard haya cargado. Si por algun motivo no hay etapa guardada se
  // deja vacio para que el filtro lo agrupe como "(vacio)".
  return { ...l, _etapa: l.etapa || '' };
}

function initFiltrosLotes(){
  leerColapsados();
  _descLotes = CAMPOS_FLT_LOTES.map(c=>{
    if (c.campo === '_etapa'){
      return {
        label: c.label,
        set: filtLotes[c.campo],
        opciones: () => {
          // Opciones ordenadas por el orden del proceso
          const enrich = DATOS().lotes.map(_enrichLote);
          const vals = [...new Set(enrich.map(l => l._etapa || ''))];
          vals.sort((a, b) => {
            const ia = ETAPAS_ORDEN.indexOf(a);
            const ib = ETAPAS_ORDEN.indexOf(b);
            if (ia === -1 && ib === -1) return a.localeCompare(b, 'es');
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
          });
          return vals.map(v => ({ val: v, text: v || '(vacío)' }));
        },
        match: (row, set) => set.has(row._etapa || ''),
      };
    }
    if (c.campo === '_envase'){
      return {
        label: c.label,
        set: filtLotes[c.campo],
        opciones: () => {
          /* Solo los tipos que hay en los datos, para no ofrecer opciones que no
           * matchean nada: hoy ningun lote usa barricas de 500 L. Mismo criterio
           * que opcionesValores con los campos planos. */
          const lotes = DATOS().lotes;
          const presentes = new Set();
          let haySin = false;
          for (const l of lotes){
            const tipos = tiposDeEnvase(l);
            if (tipos.length === 0) haySin = true;
            for (const k of tipos) presentes.add(k);
          }
          const ops = CAPACIDADES.filter(cc => presentes.has(cc.k))
                                 .map(cc => ({ val: cc.k, text: cc.cap + ' L' }));
          // vasija_grande no esta en CAPACIDADES (es litros directos, no un contador de envases),
          // pero tiposDeEnvase la emite como clave; se agrega a mano al final.
          if (presentes.has('vasija_grande')) ops.push({ val:'vasija_grande', text:'vasija grande' });
          if (haySin) ops.push({ val:'', text:'(sin envase)' });
          return ops;
        },
        /* Un lote con barricas de 225 y de 50 matchea los dos filtros. */
        match: (row, set) => {
          const tipos = tiposDeEnvase(row);
          return tipos.length === 0 ? set.has('') : tipos.some(k => set.has(k));
        },
      };
    }
    return {
      label: c.label,
      set: filtLotes[c.campo],
      opciones: () => opcionesValores(DATOS().lotes, l=>l[c.campo]),
      match: matchValor(l=>l[c.campo]),
    };
  });
  _instLotes = initFiltrosMulti('fltLotesBar', _descLotes, renderLotes);
  initLlenado();
}

/* Accesores para el bloque de arranque de app.js, que no puede leer un
   `let` reasignado de otro modulo. */
export function descLotes(){ return _descLotes; }
export function instLotes(){ return _instLotes; }

function rowClass(o){
  const cls = [];
  /* 'vacio' sale del propio lote y no del dashboard, asi que la fila ya se
   * pinta atenuada en el primer render, sin esperar a /api/dashboard. */
  if (estaVacio(o)) cls.push('vacio');
  const e = dashMap() ? dashMap().get(String(o.lote)) : null;
  if (e){
    if (e.alarmas && e.alarmas.length > 0) cls.push('crit');
    else if (e.vencido) cls.push('venc');
  }
  return cls.join(' ');
}

/* --- overlay de edicion del desglose de envases ---
 * Escribe sobre el objeto vivo de DATOS().lotes, igual que la edicion inline de
 * la tabla, asi que el boton Guardar y el historial funcionan sin cambios. */
function abrirOverlayEnvases(o){
  /* Soltar la seleccion ANTES de abrir. Si queda una celda seleccionada,
   * grilla.js consume el Escape en fase de captura y el overlay no se podria
   * cerrar con la tecla. */
  limpiarSeleccion($('tLotes'));

  /* El formulario muestra las capacidades en orden ASCENDENTE (50, 200, 225, 500)
   * segun el mock-up del spec. CAPACIDADES es descendente para resumenEnvases y
   * tiposDeEnvase; aqui hacemos una copia revertida para no mutar el array exportado. */
  const filas = [...CAPACIDADES].reverse().map(c => `
  <label for="envf_${c.k}">Barricas de ${c.cap} L</label>
  <input class="txt num" type="number" step="1" min="0" id="envf_${c.k}"
         data-envk="${escA(c.k)}" value="${escA(o[c.k] != null ? String(o[c.k]) : '')}">
  <span class="envsub" id="envsub_${c.k}">—</span>`).join('');

  mostrarOverlay(`
<h3 style="margin:0 0 14px">Envases del lote ${esc(String(o.lote ?? ''))}</h3>
<div style="display:grid;grid-template-columns:auto 90px auto;gap:8px 12px;align-items:center;text-align:left">
  ${filas}
  <label for="envf_vasija_grande">Vasija grande</label>
  <input class="txt num" type="number" step="any" min="0" id="envf_vasija_grande"
         data-envk="vasija_grande" value="${escA(o.vasija_grande != null ? String(o.vasija_grande) : '')}">
  <span class="envsub">litros</span>
</div>
<div style="margin-top:14px;text-align:right;font-size:14px">
  total: <b id="envTotal">0</b> L
</div>
<div class="msg err" id="envError" style="display:none;margin-top:10px;text-align:left"></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="envCancelar">Cancelar</button>
  <button class="btn primary" id="envAceptar">Aceptar</button>
</div>`);

  const inputs = [...document.querySelectorAll('#overlayBox input[data-envk]')];

  /* Lee los 5 campos y los normaliza. Devuelve {vals, malos}: vals tiene cada
   * campo como numero o null (vacio y 0 son null, igual que en datos.json), y
   * malos son las claves con un valor que no se acepta. */
  function leer(){
    const vals = {}, malos = [];
    for (const inp of inputs){
      const k = inp.dataset.envk;
      const entero = k !== 'vasija_grande';   // vasija_grande son litros, puede tener decimales
      const t = inp.value.trim();
      let v = null, ok = true;
      if (t !== ''){
        v = num(t);
        if (v === null || v < 0 || (entero && !Number.isInteger(v))) ok = false;
      }
      inp.style.borderColor = ok ? '' : 'var(--nook)';
      if (!ok) malos.push(k);
      vals[k] = (ok && v !== null && v !== 0) ? v : null;
    }
    return { vals, malos };
  }

  function refrescar(){
    const { vals, malos } = leer();
    for (const c of CAPACIDADES){
      const n = vals[c.k];
      $('envsub_' + c.k).textContent = n ? '= ' + (n * c.cap) : '= —';
    }
    $('envTotal').textContent = String(litrosDeEnvases(vals));
    const err = $('envError');
    if (malos.length){
      err.textContent = 'Revisá los campos marcados: las barricas se cuentan con números '
                      + 'enteros y no puede haber cantidades negativas.';
      err.style.display = '';
    } else {
      err.style.display = 'none';
    }
    $('envAceptar').disabled = malos.length > 0;
  }

  inputs.forEach(inp => inp.addEventListener('input', refrescar));
  refrescar();

  $('envCancelar').addEventListener('click', () => cerrarOverlay());
  $('envAceptar').addEventListener('click', () => {
    const { vals, malos } = leer();
    if (malos.length) return;
    for (const c of CAPACIDADES) o[c.k] = vals[c.k];
    o.vasija_grande = vals.vasija_grande;
    /* litros_actuales va en 0 y NUNCA en null cuando el desglose queda vacio:
     * motor_etapas compara litros_actuales <= 0 y asi estan guardados los lotes
     * vacios de datos.json. */
    o.litros_actuales = litrosDeEnvases(vals);
    markDirty();
    cerrarOverlay();
    /* Recargar el dashboard: pasar a 0 litros vuelve el lote inactivo y eso
     * cambia etapa, avance y alarmas. Mismo par que usa el borrado de lote. */
    invalidarDashMap();
    renderLotes();
    cargarDashboard();
  });

  if (inputs[0]) inputs[0].focus();
}

/* --- pintado de una celda ---
 * Fuera de renderLotes para que el bucle de filas se lea de un saque. El orden
 * de las ramas importa: envases primero (es un boton, no una celda de datos),
 * despues las ro, y recien ahi los tipos editables. */
function celdaDeCol(c, o, ri){
  const attrs = `data-row="${ri}" data-k="${escA(c.k)}"`;

  if (c.k === 'envases'){
    /* Boton y no <td> pelado: el clic abre el overlay de edicion. La grilla
     * nunca le roba el clic a un boton (guardia "Nunca robarle el clic a un
     * boton" en grilla.js). El '—' de los lotes sin desglose tambien es boton,
     * o seria imposible cargarles el primero. */
    const res = resumenEnvases(o);
    return `<td ${attrs}><button class="alarm-lote-link" data-envases="${ri}" `
         + `title="Editar el desglose de envases">${res ? esc(res) : '—'}</button></td>`;
  }
  if (c.ro){
    const v = o[c.k];
    /* num es condicional a c.num: una columna ro de texto no debe alinearse a la
     * derecha con numerales tabulares solo porque pasa por esta rama. */
    return v == null
      ? `<td ${attrs} class="${c.num?'num ':' '}ro">—</td>`
      : `<td ${attrs} class="${c.num?'num':''}">${esc(String(v))}</td>`;
  }
  if (c.fecha){
    /* input date nativo: su .value siempre es ISO o '', que es exactamente lo
     * que se guarda, asi que el listener de edicion no necesita un caso aparte.
     * El pegado si pasa por escribirCelda, que normaliza el dd/mm/aaaa. */
    const v = o[c.k] || '';
    return `<td ${attrs}><input class="cell" type="date" ${attrs} value="${escA(v)}"></td>`;
  }
  if (c.sel){
    const v = o[c.k] || '';
    const opts = c.sel.map(s=>`<option value="${escA(s)}" ${s===v?'selected':''}>${esc(s||'—')}</option>`).join('');
    return `<td ${attrs}><select class="cell" ${attrs}>${opts}</select></td>`;
  }
  const v = o[c.k]==null?'':o[c.k];
  /* title con el valor completo: la columna ID esta acotada por CSS y sin esto
   * no habria forma de leer un ID largo sin entrar a editarlo. */
  return `<td ${attrs} title="${escA(v)}"><input class="cell ${c.num?'num':''}" type="text" ${attrs} value="${escA(v)}"></td>`;
}

/* Etapa y Avance: las dos columnas de la banda 'estado'. No estan en COLS_LOTES
 * porque no son campos editables del lote, las calcula el dashboard. */
function celdasEstado(o){
  let out = o._etapa
    ? `<td><span class="chip-etapa">${esc(o._etapa)}</span></td>`
    : '<td class="ro">—</td>';
  if (o._pct != null){
    const pct = o._pct;
    const esCerrado = o._etapa === 'cerrado';
    const cls = esCerrado ? ' cerrado' : pct >= 80 ? '' : pct >= 40 ? ' media' : ' baja';
    out += `<td><span class="barra${cls}" title="${escA(String(pct) + '%')} de avance">`
         + `<span style="width:${escA(String(pct))}%"></span></span> <small>${esc(String(pct))}%</small></td>`;
  } else {
    out += '<td class="ro">—</td>';
  }
  return out;
}

/* --- renderLotes --- */
export function renderLotes(){
  const q = ($('buscaLotes').value||'').toLowerCase().trim();
  const dd = dashData();

  // Enriquecer con datos del dashboard (etapa, pct) y campo _etapa_ord para sort.
  // Guardamos el indice original en DATOS().lotes para que la edicion inline funcione.
  //
  // Etapa: se lee del propio lote en DATOS() — es la fuente de verdad y cubre
  // los 291 lotes (activos e inactivos) sin necesidad de que el dashboard haya
  // cargado. dd.lotes solo trae los activos, por eso dejamos de usarlo para la
  // etapa y lo ignoramos aqui.
  //
  // Pct: se lee de dd.etapas (mapa nuevo que cubre todos los lotes); si aun no
  // cargo el dashboard, queda null y la celda muestra "—" hasta que llegue.
  const lotesArr = DATOS().lotes;
  const etapasMap = dd ? (dd.etapas || null) : null;
  let rows = lotesArr.map((l, origIdx) => {
    const clave  = String(l.lote ?? '');
    const etapa  = l.etapa || '';
    const eMap   = etapasMap ? etapasMap[clave] : null;
    const pct    = eMap != null ? (eMap.pct != null ? eMap.pct : null) : null;
    const ord    = ETAPAS_ORDEN.indexOf(etapa);
    return { ...l, _etapa: etapa, _pct: pct, _etapa_ord: ord >= 0 ? ord : 99,
             _envases_n: contarEnvases(l), _origIdx: origIdx };
  });

  if (q) rows = rows.filter(l => String(l.lote||'').toLowerCase().includes(q));
  rows = rows.filter(l => pasaMulti(l, _descLotes));
  rows = rows.filter(pasaLlenado);

  // Sort: etapa usa _etapa_ord, pct usa _pct, y envases ordena por CANTIDAD de
  // envases (no por litros: para eso ya esta la columna Litros Actuales)
  const sortKey = sortLotes.key === 'etapa'   ? '_etapa_ord'
                : sortLotes.key === 'pct'     ? '_pct'
                : sortLotes.key === 'envases' ? '_envases_n'
                : sortLotes.key;
  rows = sortRows(rows, { key: sortKey, dir: sortLotes.dir });

  const t = $('tLotes');
  // _rows apunta a los objetos originales en DATOS().lotes para que la edicion inline funcione
  t._rows = rows.map(r => lotesArr[r._origIdx] || r);

  /* encabezados: fila de bandas (fila 1 del Excel) + fila de columnas.
   * Las th de banda NO llevan data-k, y por eso geo() en grilla.js las ignora
   * sin ninguna lista de excepciones, igual que ya ignora la de acciones. */
  const cols   = colsVisibles(COLS_LOTES, colapsados);
  const bandas = bandasVisibles(BANDAS_LOTES, COLS_LOTES, colapsados);
  const colsDe = b => cols.filter(c => c.banda === b.id);
  const flecha = k => sortLotes.key === k
    ? `<span class="arrow">${sortLotes.dir > 0 ? '▲' : '▼'}</span>` : '';
  // Marca de columna ordenada que ya usaban Etapa y Avance, se conserva igual.
  const activa = k => sortLotes.key === k ? ' style="color:var(--txt)"' : '';

  /* Chip de colapsar/expandir, en el titulo de la banda. Es un <button> a
   * proposito: grilla.js nunca le roba el clic a un boton (guardia "Nunca
   * robarle el clic a un boton" en grilla.js), asi que no hay que pelear con
   * la seleccion de la grilla. */
  const chip = b => {
    if (!b.grupo) return '';
    const cerrado = b.ocultas > 0;
    const nombres = COLS_LOTES.filter(c => c.grupo === b.grupo).map(c => c.label).join(', ');
    const tit = (cerrado ? 'Mostrar: ' : 'Ocultar: ') + nombres;
    return ` <button class="chip-grupo" data-grupo="${escA(b.grupo)}" title="${escA(tit)}">`
         + (cerrado ? '⊞' + b.ocultas : '⊟') + '</button>';
  };

  let h = '<thead><tr>';
  for (const b of bandas){
    /* En la banda colapsada por completo el titulo no entra en 16px: queda solo
     * el chip, que es la marca del grupo cerrado y el lugar donde se reabre. */
    const cls = 'banda' + (b.testigo ? ' banda-testigo' : '');
    h += `<th class="${cls}" colspan="${b.colspan}">`
       + (b.testigo ? '' : esc(b.titulo)) + chip(b) + '</th>';
  }
  h += '<th class="banda"></th>';   // sobre la columna de acciones
  h += '</tr><tr>';
  for (const b of bandas){
    if (b.testigo){
      /* Columna testigo de la banda cerrada. Sin data-k, asi que la grilla la
       * ignora igual que las th de banda. */
      h += '<th class="colstub"></th>';
      continue;
    }
    if (b.id === 'estado'){
      h += `<th data-k="etapa"${activa('etapa')}>Etapa${flecha('etapa')}</th>`;
      h += `<th data-k="pct"${activa('pct')}>Avance${flecha('pct')}</th>`;
      continue;
    }
    for (const c of colsDe(b))
      h += `<th data-k="${escA(c.k)}" class="${c.num ? 'num' : ''}">${esc(c.label)}${flecha(c.k)}</th>`;
  }
  h += '<th></th></tr></thead>';

  /* filas */
  let tb = '<tbody>';
  rows.forEach((o, ri)=>{
    tb += `<tr class="${rowClass(o)}">`;
    for (const b of bandas){
      if (b.testigo){ tb += '<td class="colstub"></td>'; continue; }
      if (b.id === 'estado'){ tb += celdasEstado(o); continue; }
      for (const c of colsDe(b)) tb += celdaDeCol(c, o, ri);
    }
    tb += `<td><button class="alarm-lote-link" data-iralote="${escA(o.lote ?? '')}" title="Ver ficha">${esc(o.lote ?? '')}</button> <button class="rowbtn" data-del="${ri}" title="Eliminar lote">✕</button></td></tr>`;
  });
  tb += '</tbody>';
  t.innerHTML = h + tb;

  /* sort por clic en encabezado */
  t.querySelectorAll('th[data-k]').forEach(th => th.onclick = () => {
    toggleSort(sortLotes, th.dataset.k);
    renderLotes();
  });

  /* edición en memoria */
  if (!t._wired){
    t._wired = true;
    t.addEventListener('input', e => {
      const el = e.target.closest('input.cell, select.cell'); if(!el) return;
      const o = t._rows[+el.dataset.row];
      const c = COLS_LOTES.find(x=>x.k===el.dataset.k);
      if (!c||!o) return;
      if (c.ro) return;          // solo lectura: no se escribe nunca
      o[el.dataset.k] = c.num ? num(el.value) : (el.value===''?null:el.value);
      markDirty();
    });
    t.addEventListener('change', e => {
      const el = e.target.closest('select.cell'); if(!el) return;
      const o = t._rows[+el.dataset.row];
      if (!o) return;
      o[el.dataset.k] = el.value===''?null:el.value;
      markDirty();
    });
    t.addEventListener('click', e => {
      const cg = e.target.closest('[data-grupo]');
      if (cg){
        colapsados = alternar(colapsados, cg.dataset.grupo);
        guardarColapsados();
        /* Soltar la seleccion antes de repintar: sus coordenadas son (fila,
         * columna) y al cambiar las columnas visibles dejarian de apuntar a la
         * misma celda, asi que restaurarSeleccion la pondria en otro lado. */
        limpiarSeleccion(t);
        renderLotes();
        return;
      }
      const be = e.target.closest('[data-envases]');
      if (be){
        const o = t._rows[+be.dataset.envases];
        if (o) abrirOverlayEnvases(o);
        return;
      }
      const a = e.target.closest('[data-iralote]');
      if (a){ if (a.dataset.iralote) irALote(a.dataset.iralote); return; }
      const b = e.target.closest('[data-del]'); if(!b) return;
      const o = t._rows[+b.dataset.del];
      if (!o) return;
      if (confirm('¿Eliminar el lote ' + o.lote + '?')){
        DATOS().lotes.splice(DATOS().lotes.indexOf(o), 1);
        markDirty();
        refrescarOpcionesFiltros();   // el lote borrado sale de las casillas
        invalidarDashMap();
        renderLotes();
        cargarDashboard();
      }
    });
  }

  $('lotesCount').textContent = rows.length + ' / ' + DATOS().lotes.length + ' lotes';
  /* Grilla tipo planilla. El adaptador se arma en cada render porque t._rows
     cambia; activarGrilla es idempotente y restaura la seleccion por identidad. */
  activarGrilla(t, adaptadorCols(t, COLS_LOTES, markDirty));
  /* Anchos de columna. Tambien idempotente: los anchos se aplican como CSS por
     [data-k], asi que este innerHTML no los borro y no hay nada que reponer en
     las celdas nuevas. */
  activarAnchos(t, hay => {
    const b = $('btnResetAnchos');
    if (b) b.style.display = hay ? '' : 'none';
  });
}

/* --- anchos de columna: los dos botones de la toolbar ---
 * Viven aca y no en app.js porque la <table> es de esta vista. No hace falta
 * repintar: los anchos son CSS. */
export function ajustarAnchosLotes(){ autoajustarTodas($('tLotes')); }
export function resetAnchosLotes(){ restablecerAnchos(); }

/* --- agregar lote nuevo --- */
export function agregarLote(){
  /* Una clave por cada columna, para que la fila nueva no arranque con celdas
   * que el render pinta vacias y el objeto guardado no quede a medias. Numeros
   * y fechas en null, textos y listas en ''. Las ro son derivadas y no se
   * tocan: litros_actuales arranca en 0 (nunca null: motor_etapas compara
   * litros_actuales <= 0) y envases sale del desglose. */
  const nuevo = { litros_actuales: 0, cap50:null, cap200:null, cap225:null,
                  cap500:null, vasija_grande:null };
  for (const c of COLS_LOTES){
    if (c.ro) continue;
    nuevo[c.k] = (c.num || c.fecha) ? null : '';
  }
  /* lote va en '' y no en null aunque sea columna num: se tipea a mano y todo el
   * resto del codigo lo lee como String(lote ?? ''). Es como estaba antes. */
  nuevo.lote = '';

  DATOS().lotes.unshift(nuevo);
  markDirty();
  refrescarOpcionesFiltros();   // para que el lote nuevo se pueda tildar
  renderLotes();
  // foco en la primera celda del nuevo lote
  const inp = $('tLotes').querySelector('input.cell[data-row="0"]');
  if (inp) inp.focus();
}

registrarVista('lotes', () => renderLotes());
registrarInit(initFiltrosLotes);
