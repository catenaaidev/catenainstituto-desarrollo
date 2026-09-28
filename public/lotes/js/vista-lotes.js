/* ===== Lotes CIW — pestana Lotes ===== */
'use strict';

import { $, esc, escA, num, DATOS, markDirty, registrarVista,
         registrarInit, dashMap, invalidarDashMap, cargarDashboard, irALote,
         mostrarOverlay, cerrarOverlay, usuarioActual } from './nucleo.js';
import { toggleSort, sortRows, pasaMulti, opcionesValores, matchValor,
         crearFiltroMulti } from './tabla.js';
import { activarGrilla, adaptadorCols, limpiarSeleccion } from './grilla.js';
import { colsVisibles, bandasVisibles, alternar } from './grupos-cols.js';
import { crearAnchos } from './anchos-cols.js';
import { CAPACIDADES, resumenEnvases, contarEnvases,
         litrosDeEnvases, tiposDeEnvase, estaVacio, esOrganico } from './envases.js';
import { crearFiltroLlenado } from './filtro-llenado.js';
import { fmtFecha } from './fechas.js';
import { PASOS, armarHijo, validarNumeroLote, ordenarConFijos,
         movimientoHijo } from './lote-nuevo.js';

/* La clave de storage es la de siempre (lotes_cols_ancho): respeta los anchos
 * que la gente ya tiene guardados. El encabezado de Lotes son DOS filas
 * (bandas de grupo + columnas), y la de columnas es la segunda. */
const anchosLotes = crearAnchos({
  tablaId: 'tLotes',
  claveStorage: 'lotes_cols_ancho',
  filaEncabezado: 'thead tr:nth-child(2)',
});

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
  /* Uva o Vino (sale de un corte o un traspaso de vino ya hecho). Vacio cuenta
   * como uva, salvo que el linaje diga que recibio vino de otro lote: ver
   * esLoteDeVino en src/lotes/motores/etapas.ts. */
  { k:'origen',                label:'Origen',                  banda:'id', sel:['','Uva','Vino'] },
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
 * propio en initFiltrosLotes (opciones + match a mano).
 *
 * `col` es la columna de cuyo encabezado cuelga el embudo ▾ que abre el filtro,
 * como en Excel. Todos tienen columna propia, asi que no queda ningun filtro
 * huerfano: coincide con `campo` salvo en los dos que empiezan con _, que no
 * son campos del lote pero si tienen una columna que los muestra (Etapa y
 * Envases). Si una `col` no existe entre las columnas pintadas, su embudo no
 * aparece y el filtro queda inalcanzable: initFiltrosLotes lo avisa por consola
 * en lugar de dejarlo pasar callado. */
const CAMPOS_FLT_LOTES = [
  /* Lote va primero, como en la orden de correccion, y es el mismo descriptor
   * generico que el resto: la lista de casillas la arma opcionesValores y
   * cmpValores la ordena por numero (no alfabeticamente) porque los lotes son
   * numeros en texto. El buscador '🔎 Buscar por lote' sigue existiendo aparte:
   * sirve para ir a uno solo tipeando, y este filtro para elegir varios. */
  { campo:'lote',     label:'Lote',     col:'lote'     },
  { campo:'variedad', label:'Variedad', col:'variedad' },
  { campo:'distrito', label:'Distrito', col:'distrito' },
  { campo:'proyecto', label:'Proyecto', col:'proyecto' },
  { campo:'vinedo',   label:'Viñedo',   col:'vinedo'   },
  { campo:'organico_convencional', label:'Orgánico/Conv.', col:'organico_convencional' },
  { campo:'origen',       label:'Origen',       col:'origen'       },
  { campo:'lote_sistema', label:'Lote Sistema', col:'lote_sistema' },
  { campo:'ct',           label:'Ct',           col:'ct'           },
  { campo:'clon',         label:'Clon',         col:'clon'         },
  { campo:'id_texto',     label:'ID',           col:'id_texto'     },
  /* Informacion Inicial y fermentacion, y Crianza: un embudo por columna, como
   * en Analisis. Las fechas muestran dd/mm/aaaa en las casillas (fmt) pero
   * filtran por el ISO guardado. */
  { campo:'fecha_ingreso',   label:'Fecha de ingreso',   col:'fecha_ingreso', fmt:fmtFecha },
  { campo:'n_pesada',        label:'Nº Pesada',          col:'n_pesada'        },
  { campo:'kilos',           label:'Kilos',              col:'kilos'           },
  { campo:'vasija_fa',       label:'Vasija FA',          col:'vasija_fa'       },
  { campo:'descube_fa',      label:'Descube / Final FA', col:'descube_fa', fmt:fmtFecha },
  { campo:'brix_inicial',    label:'Brix Inicial',       col:'brix_inicial'    },
  { campo:'ph_inicial',      label:'pH Inicial',         col:'ph_inicial'      },
  { campo:'at_inicial',      label:'AT inicial',         col:'at_inicial'      },
  { campo:'npa',             label:'NPA',                col:'npa'             },
  { campo:'litros_estimado', label:'Litros Estimado',    col:'litros_estimado' },
  { campo:'litros_actuales', label:'Litros Actuales',    col:'litros_actuales' },
  { campo:'vasija_actual',   label:'Vasija Actual en Crianza', col:'vasija_actual' },
  { campo:'categoria',       label:'Categoría',          col:'categoria'       },
  { campo:'_etapa',   label:'Etapa',    col:'etapa'    },
  { campo:'_envase',  label:'Envase',   col:'envases'  },
];
const filtLotes = {}; CAMPOS_FLT_LOTES.forEach(c=>filtLotes[c.campo]=new Set());
let _descLotes=[], _instLotes=[];
/* columna -> {campo, label, inst}, para que el render sepa que embudo pintar en
   cada <th> y el clic sepa que panel abrir. Lo llena initFiltrosLotes. */
const fltPorCol = new Map();

/* --- filtro de llenado (Todos | Llenos | Vacíos) ---
 * No es un filtro multi-select mas, y por eso no esta en CAMPOS_FLT_LOTES: son
 * tres opciones EXCLUYENTES y siempre hay exactamente una puesta. Como control
 * segmentado en la toolbar se ve de un vistazo cual es; como chip habria que
 * abrir el panel para saberlo.
 *
 * El control es el mismo que usa la pestaña Análisis: vive en
 * filtro-llenado.js y aca solo se cuelga del hueco que deja index.html. */
let fltLlenado = null;

/* Vuelve el segmentado a 'Todos'. Lo usa el boton Limpiar filtros, que tiene
   que limpiar TODO lo que esconde filas o deja de ser un boton confiable. */
export function resetLlenado(){
  if (fltLlenado) fltLlenado.reset();
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
        label: c.label, campo: c.campo, col: c.col,
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
        label: c.label, campo: c.campo, col: c.col,
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
      label: c.label, campo: c.campo, col: c.col,
      set: filtLotes[c.campo],
      opciones: () => opcionesValores(DATOS().lotes, l=>l[c.campo], c.fmt),
      match: matchValor(l=>l[c.campo]),
    };
  });
  /* Modo anclado: cada filtro se monta sin boton propio y con el panel colgado
   * de <body>. El disparador es el embudo ▾ que renderLotes pinta dentro del
   * <th> de su columna; el panel tiene que salir de la tabla porque .scroll.tall
   * tiene overflow:auto y ahi adentro quedaria recortado.
   *
   * Se monta UNA sola vez, igual que antes: los <th> se rehacen en cada render,
   * pero los paneles viven afuera y sobreviven, y el clic del embudo se atiende
   * por delegacion. */
  _instLotes = _descLotes.map(d => crearFiltroMulti({
    label:d.label, opciones:d.opciones, set:d.set, onChange:renderLotes, anclado:true,
    /* Perezoso, como en Analisis: con un embudo en cada columna, armar todas
     * las listas de entrada son miles de casillas para paneles que casi nadie
     * abre. Cada uno arma la suya (y se pone al dia) al abrirse. */
    perezoso:true,
  }));
  /* El mapa se arma desde los descriptores y no cruzando CAMPOS_FLT_LOTES con
     _instLotes por indice: los descriptores ya llevan campo y col, asi que hay
     un array paralelo menos del que depender. */
  fltPorCol.clear();
  const pintadas = new Set([...COLS_LOTES.map(c => c.k), 'etapa']);
  _descLotes.forEach((d, i) => {
    if (fltPorCol.has(d.col))
      console.warn(`Lotes: los filtros "${d.label}" y "${fltPorCol.get(d.col).label}" se pelean la columna "${d.col}"`);
    /* Un filtro cuya columna no se pinta nunca no tendria embudo: no habria como
       abrirlo ni como darse cuenta de que esta escondiendo filas. */
    if (!pintadas.has(d.col))
      console.warn(`Lotes: el filtro "${d.label}" apunta a la columna "${d.col}", que no existe`);
    fltPorCol.set(d.col, { campo:d.campo, label:d.label, inst:_instLotes[i] });
  });

  const hueco = $('fltLlenado');
  if (hueco){
    fltLlenado = crearFiltroLlenado(renderLotes);
    hueco.appendChild(fltLlenado.el);
  }
}

/* Accesores para el bloque de arranque de app.js, que no puede leer un
   `let` reasignado de otro modulo. */
export function descLotes(){ return _descLotes; }
export function instLotes(){ return _instLotes; }

/* Cierra cualquier panel de filtro abierto, sea de la cabecera o de otra
   pestaña. Es el mismo gesto que hace app.js al hacer clic afuera. */
function cerrarPaneles(){
  document.querySelectorAll('.mfilt-panel.open').forEach(p => p.classList.remove('open'));
}

function rowClass(o){
  const cls = [];
  /* 'vacio' sale del propio lote y no del dashboard, asi que la fila ya se
   * pinta atenuada en el primer render, sin esperar a /api/dashboard. */
  if (estaVacio(o)) cls.push('vacio');
  /* 'org' tambien sale del propio lote. Su verde le GANA al rojo de alarma y al
   * amarillo de vencido (la regla tr.org td va despues de las dos en el CSS):
   * es lo que se pidio, porque de un vistazo lo que se quiere separar es el
   * organico del convencional. La alarma no se pierde del todo -- su franja
   * roja de 3px al borde izquierdo es un box-shadow, no un background, asi que
   * sobrevive al verde. Ver el comentario de las reglas en index.html. */
  if (esOrganico(o)) cls.push('org');
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

/* Etapa y Hijo: las dos columnas de la banda 'estado'. No estan en COLS_LOTES
 * porque no son campos editables del lote. Hijo ocupa el lugar de la barra de
 * Avance, que se quito a pedido (2026-09-28): es el boton que saca un lote
 * hijo copiando los datos de este. Sin data-k, asi que la grilla no lo toma
 * como celda de datos. */
function celdasEstado(o, ri){
  const etapa = o._etapa
    ? `<td><span class="chip-etapa">${esc(o._etapa)}</span></td>`
    : '<td class="ro">—</td>';
  return etapa + `<td><button class="btn-hijo" data-hijo="${ri}" `
       + `title="Sacar un lote hijo de ${escA(String(o.lote ?? ''))}">⎘ Hijo</button></td>`;
}

/* --- renderLotes --- */
export function renderLotes(){
  const q = ($('buscaLotes').value||'').toLowerCase().trim();

  // Enriquecer con la etapa y el campo _etapa_ord para sort.
  // Guardamos el indice original en DATOS().lotes para que la edicion inline funcione.
  //
  // Etapa: se lee del propio lote en DATOS() — es la fuente de verdad y cubre
  // los 291 lotes (activos e inactivos) sin necesidad de que el dashboard haya
  // cargado. dd.lotes solo trae los activos, por eso dejamos de usarlo para la
  // etapa y lo ignoramos aqui.
  const lotesArr = DATOS().lotes;
  let rows = lotesArr.map((l, origIdx) => {
    const etapa  = l.etapa || '';
    const ord    = ETAPAS_ORDEN.indexOf(etapa);
    return { ...l, _etapa: etapa, _etapa_ord: ord >= 0 ? ord : 99,
             _envases_n: contarEnvases(l), _origIdx: origIdx };
  });

  if (q) rows = rows.filter(l => String(l.lote||'').toLowerCase().includes(q));
  rows = rows.filter(l => pasaMulti(l, _descLotes));
  if (fltLlenado) rows = rows.filter(l => fltLlenado.pasa(l));

  // Sort: etapa usa _etapa_ord y envases ordena por CANTIDAD de envases (no
  // por litros: para eso ya esta la columna Litros Actuales)
  const sortKey = sortLotes.key === 'etapa'   ? '_etapa_ord'
                : sortLotes.key === 'envases' ? '_envases_n'
                : sortLotes.key;
  rows = sortRows(rows, { key: sortKey, dir: sortLotes.dir });

  const t = $('tLotes');
  // _rows apunta a los objetos originales en DATOS().lotes para que la edicion inline funcione.
  // Los lotes recien creados van arriba, pasen o no los filtros, hasta que se
  // aprieta Ordenar (ver "lotes fijados arriba" mas abajo).
  const enriquecido = new Map(rows.map(r => [lotesArr[r._origIdx], r]));
  const fijos = fijosVivos();
  t._rows = ordenarConFijos(rows.map(r => lotesArr[r._origIdx]), fijos);
  const esFijo = new Set(fijos);
  rows = t._rows.map(o => enriquecido.get(o)
    || { ...o, _etapa: o.etapa || '' });   // fijo que el filtro habia dejado afuera

  /* encabezados: fila de bandas (fila 1 del Excel) + fila de columnas.
   * Las th de banda NO llevan data-k, y por eso geo() en grilla.js las ignora
   * sin ninguna lista de excepciones, igual que ya ignora la de acciones. */
  const cols   = colsVisibles(COLS_LOTES, colapsados);
  const bandas = bandasVisibles(BANDAS_LOTES, COLS_LOTES, colapsados);
  const colsDe = b => cols.filter(c => c.banda === b.id);
  const flecha = k => sortLotes.key === k
    ? `<span class="arrow">${sortLotes.dir > 0 ? '▲' : '▼'}</span>` : '';

  /* Embudo de filtro de la columna, o '' si no tiene. Es un <button> a
   * proposito, igual que el chip de colapsar: grilla.js no le roba el clic a un
   * boton. Se repinta en cada render, asi que el contador y el resaltado salen
   * siempre del tamaño actual del Set; el panel, en cambio, vive colgado de
   * <body> y no se rehace. */
  const embudo = k => {
    const f = fltPorCol.get(k);
    if (!f) return '';
    const n = filtLotes[f.campo].size;
    const tit = n ? `${f.label}: ${n} valor${n > 1 ? 'es' : ''} elegido${n > 1 ? 's' : ''}`
                  : `Filtrar por ${f.label}`;
    return ` <button class="th-flt${n ? ' active' : ''}" data-flt="${escA(k)}"`
         + ` title="${escA(tit)}">▾${n ? ' ' + n : ''}</button>`;
  };
  // Marca de columna ordenada que ya usaba Etapa, se conserva igual.
  const activa = k => sortLotes.key === k ? ' style="color:var(--txt)"' : '';

  /* Chip de colapsar/expandir, en el titulo de la banda. Es un <button> a
   * proposito: grilla.js nunca le roba el clic a un boton (guardia "Nunca
   * robarle el clic a un boton" en grilla.js), asi que no hay que pelear con
   * la seleccion de la grilla. */
  const chip = b => {
    if (!b.grupo) return '';
    const cerrado = b.ocultas > 0;
    const delGrupo = COLS_LOTES.filter(c => c.grupo === b.grupo);
    const nombres = delGrupo.map(c => c.label).join(', ');
    let tit = (cerrado ? 'Mostrar: ' : 'Ocultar: ') + nombres;
    /* Un grupo colapsado se lleva puestos los embudos de sus columnas. Si
     * alguno estaba filtrando, el filtro sigue escondiendo filas y su unico
     * acceso ya no esta a la vista: el chip se marca y lo dice, o la unica
     * salida seria adivinar y apretar Limpiar filtros. Como todas las columnas
     * tienen embudo, le puede pasar a cualquiera de los dos grupos. */
    const filtrando = cerrado
      ? delGrupo.filter(c => fltPorCol.has(c.k) && filtLotes[fltPorCol.get(c.k).campo].size)
      : [];
    if (filtrando.length)
      tit += ` — filtrando por ${filtrando.map(c => c.label).join(', ')}`;
    return ` <button class="chip-grupo${filtrando.length ? ' con-filtro' : ''}"`
         + ` data-grupo="${escA(b.grupo)}" title="${escA(tit)}">`
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
      h += `<th data-k="etapa"${activa('etapa')}>Etapa${flecha('etapa')}${embudo('etapa')}</th>`;
      h += '<th title="Sacar un lote hijo copiando los datos del lote">Hijo</th>';
      continue;
    }
    for (const c of colsDe(b))
      h += `<th data-k="${escA(c.k)}" class="${c.num ? 'num' : ''}">`
         + `${esc(c.label)}${flecha(c.k)}${embudo(c.k)}</th>`;
  }
  h += '<th></th></tr></thead>';

  /* filas */
  let tb = '<tbody>';
  rows.forEach((o, ri)=>{
    tb += `<tr class="${rowClass(o)}${esFijo.has(t._rows[ri]) ? ' nuevo' : ''}">`;
    for (const b of bandas){
      if (b.testigo){ tb += '<td class="colstub"></td>'; continue; }
      if (b.id === 'estado'){ tb += celdasEstado(o, ri); continue; }
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

    /* --- embudo de filtro de la cabecera ---
     * En CAPTURA y cortando la propagacion, que resuelve tres cosas de un saque:
     * el onclick de ordenar del th es de burbuja y nunca llega; el listener de
     * document de app.js que cierra los paneles al hacer clic afuera tampoco, asi
     * que el panel recien abierto no se cierra solo; y la grilla no llega a
     * interpretar el clic.
     *
     * Por delegacion y no por boton: renderLotes rehace el <thead> entero en cada
     * render, asi que un listener por embudo habria que reponerlo cada vez. Los
     * paneles, en cambio, cuelgan de <body> y sobreviven. */
    t.addEventListener('click', e => {
      const b = e.target.closest('[data-flt]');
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      const f = fltPorCol.get(b.dataset.flt);
      if (f) f.inst.abrir(b);
    }, true);

    /* El panel es position:fixed: se queda quieto mientras la tabla se mueve por
     * debajo, asi que al scrollear quedaria flotando lejos de su columna. Se
     * cierra, que es lo que hace Excel. Mismo motivo al cambiar el tamaño de la
     * ventana, que ademas mueve el encabezado sticky. */
    const cont = t.closest('.scroll');
    if (cont) cont.addEventListener('scroll', cerrarPaneles);
    window.addEventListener('resize', cerrarPaneles);

    t.addEventListener('input', e => {
      const el = e.target.closest('input.cell, select.cell'); if(!el) return;
      const o = t._rows[+el.dataset.row];
      const c = COLS_LOTES.find(x=>x.k===el.dataset.k);
      if (!c||!o) return;
      if (c.ro) return;          // solo lectura: no se escribe nunca
      o[el.dataset.k] = c.num ? num(el.value) : (el.value===''?null:el.value);
      markDirty();
      if (el.dataset.k === 'lote') guardarFijos();   // un fijo renombrado sigue fijo
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
      const bh = e.target.closest('[data-hijo]');
      if (bh){
        const o = t._rows[+bh.dataset.hijo];
        if (o) abrirAsistente(o);
        return;
      }
      const a = e.target.closest('[data-iralote]');
      if (a){ if (a.dataset.iralote) irALote(a.dataset.iralote); return; }
      const b = e.target.closest('[data-del]'); if(!b) return;
      const o = t._rows[+b.dataset.del];
      if (!o) return;
      if (confirm('¿Eliminar el lote ' + o.lote + '?')){
        DATOS().lotes.splice(DATOS().lotes.indexOf(o), 1);
        _fijos = _fijos.filter(x => x !== o);
        guardarFijos();
        markDirty();
        refrescarOpcionesFiltros();   // el lote borrado sale de las casillas
        invalidarDashMap();
        renderLotes();
        cargarDashboard();
      }
    });
  }

  $('lotesCount').textContent = rows.length + ' / ' + DATOS().lotes.length + ' lotes';
  pintarBotonOrdenar(fijos.length);
  /* Grilla tipo planilla. El adaptador se arma en cada render porque t._rows
     cambia; activarGrilla es idempotente y restaura la seleccion por identidad. */
  activarGrilla(t, adaptadorCols(t, COLS_LOTES, markDirty));
  /* Anchos de columna. Tambien idempotente: los anchos se aplican como CSS por
     [data-k], asi que este innerHTML no los borro y no hay nada que reponer en
     las celdas nuevas. */
  anchosLotes.activar(t, hay => {
    const b = $('btnResetAnchos');
    if (b) b.style.display = hay ? '' : 'none';
  });
}

/* --- anchos de columna: los dos botones de la toolbar ---
 * Viven aca y no en app.js porque la <table> es de esta vista. No hace falta
 * repintar: los anchos son CSS. */
export function ajustarAnchosLotes(){ anchosLotes.autoajustarTodas(); }
export function resetAnchosLotes(){ anchosLotes.restablecer(); }

/* --- lotes fijados arriba ---
 * Un lote recien creado (desde el asistente o como hijo) queda arriba de la
 * tabla, aunque se ordene por otra columna o se filtre, hasta que se aprieta
 * "Ordenar". Asi se lo puede ir completando sin que salte de lugar.
 *
 * Es una preferencia de pantalla de cada persona, como el colapsado de
 * columnas: vive en localStorage y no en los datos, asi que los demas usuarios
 * ven la tabla ordenada normal. En memoria se guardan los OBJETOS (sobreviven a
 * un cambio del numero de lote); en el storage, los numeros, que es lo unico
 * que sobrevive a recargar la pagina. fijosVivos() los vuelve a enlazar. */
const CLAVE_FIJOS = 'lotes_fijos_arriba';
let _fijos = [];   // objetos de DATOS().lotes, en orden de creacion

function leerClavesFijas(){
  try {
    const arr = JSON.parse(localStorage.getItem(CLAVE_FIJOS) || '[]');
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch(e){ return []; }
}

function guardarFijos(){
  try {
    if (_fijos.length)
      localStorage.setItem(CLAVE_FIJOS, JSON.stringify(_fijos.map(o => String(o.lote ?? ''))));
    else localStorage.removeItem(CLAVE_FIJOS);
  } catch(e){}
}

/* Los fijos que siguen existiendo en DATOS().lotes. Si los datos se recargaron
 * (se recargo la pagina, o llego una version nueva del servidor) los objetos
 * son otros y se vuelven a buscar por numero de lote. */
function fijosVivos(){
  const lotes = DATOS().lotes;
  const vivos = new Set(lotes);
  if (_fijos.length && _fijos.every(o => vivos.has(o))) return _fijos;
  const claves = _fijos.length ? _fijos.map(o => String(o.lote ?? '')) : leerClavesFijas();
  _fijos = claves.map(k => lotes.find(l => String(l.lote ?? '') === k)).filter(Boolean);
  return _fijos;
}

function fijar(o){
  _fijos = fijosVivos().filter(x => x !== o).concat([o]);
  guardarFijos();
}

function pintarBotonOrdenar(n){
  const b = $('btnOrdenarLotes');
  if (!b) return;
  b.style.display = n ? '' : 'none';
  b.textContent = `↕ Ordenar (${n} nuevo${n > 1 ? 's' : ''})`;
}

/* Suelta los fijos: la tabla vuelve a su orden normal. */
export function ordenarLotes(){
  _fijos = [];
  guardarFijos();
  renderLotes();
}

/* --- asistente de lote nuevo / lote hijo ---
 * Pregunta los datos minimos de a uno (PASOS en lote-nuevo.js). Sin `padre`
 * arranca en blanco; con `padre` arranca con una copia del padre (armarHijo) y
 * solo el numero de lote viene vacio. La ✕, Escape o un clic afuera lo cierran
 * sin crear nada (Escape y el clic afuera ya los maneja app.js). */
function abrirAsistente(padre){
  /* Soltar la seleccion ANTES de abrir: si no, grilla.js se come el Escape. */
  limpiarSeleccion($('tLotes'));

  const base = padre ? armarHijo(padre) : loteEnBlanco();
  const vals = {};
  for (const p of PASOS) vals[p.k] = p.k === 'lote' ? '' : String(base[p.k] ?? '');
  let paso = 0;

  const titulo = padre ? `Lote hijo de ${esc(String(padre.lote ?? ''))}` : 'Nuevo lote';

  function pintar(){
    const p = PASOS[paso];
    const ultimo = paso === PASOS.length - 1;
    let campo;
    if (p.opciones){
      campo = '<select class="txt" id="asisCampo">'
            + p.opciones.map(o => `<option value="${escA(o)}" ${o === vals[p.k] ? 'selected' : ''}>${esc(o || '—')}</option>`).join('')
            + '</select>';
    } else {
      const sug = p.sugerir
        ? opcionesValores(DATOS().lotes, l => l[p.k]).map(o => o.val).filter(v => v !== '')
        : [];
      campo = `<input class="txt" id="asisCampo" autocomplete="off" value="${escA(vals[p.k])}"`
            + (p.k === 'lote' ? ' inputmode="numeric"' : '')
            + (sug.length ? ' list="asisSug"' : '') + '>'
            + (sug.length ? `<datalist id="asisSug">${sug.map(v => `<option value="${escA(v)}">`).join('')}</datalist>` : '');
    }
    mostrarOverlay(`
<button class="overlay-cerrar" id="asisCerrar" title="Cerrar sin crear el lote" aria-label="Cerrar">✕</button>
<h3 style="margin:0 0 4px">${titulo}</h3>
<div style="color:var(--muted);font-size:12px;margin-bottom:14px">Paso ${paso + 1} de ${PASOS.length}${p.obligatorio ? '' : ' · se puede dejar en blanco'}</div>
<div style="text-align:left">
  <label for="asisCampo" style="display:block;margin-bottom:6px;font-weight:600">${esc(p.label)}</label>
  ${campo}
</div>
<div class="msg err" id="asisError" style="display:none;margin-top:10px;text-align:left"></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:space-between">
  <button class="btn" id="asisAtras" ${paso === 0 ? 'disabled' : ''}>← Atrás</button>
  <button class="btn primary" id="asisSig">${ultimo ? (padre ? '✓ Crear lote hijo' : '✓ Crear lote') : 'Siguiente →'}</button>
</div>`);
    const inp = $('asisCampo');
    inp.style.width = '100%';
    inp.style.boxSizing = 'border-box';
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter'){ e.preventDefault(); avanzar(); }
    });
    $('asisCerrar').addEventListener('click', () => cerrarOverlay());
    $('asisAtras').addEventListener('click', () => { leer(); paso--; pintar(); });
    $('asisSig').addEventListener('click', avanzar);
    inp.focus();
    if (inp.select) inp.select();
  }

  function leer(){ vals[PASOS[paso].k] = $('asisCampo').value.trim(); }

  function avanzar(){
    leer();
    if (PASOS[paso].k === 'lote'){
      const v = validarNumeroLote(vals.lote, DATOS().lotes);
      if (!v.ok){
        const err = $('asisError');
        err.textContent = v.error;
        err.style.display = '';
        $('asisCampo').focus();
        return;
      }
    }
    if (paso < PASOS.length - 1){ paso++; pintar(); return; }
    crear();
  }

  function crear(){
    /* Se vuelve a validar: entre el paso 1 y el ultimo pudo llegar una version
     * nueva de los datos con ese mismo numero de lote. */
    const v = validarNumeroLote(vals.lote, DATOS().lotes);
    if (!v.ok){ paso = 0; pintar(); return; }
    for (const p of PASOS) base[p.k] = vals[p.k];
    base.lote = v.valor;
    DATOS().lotes.unshift(base);
    /* El hijo deja un traspaso padre→hijo en Movimientos: sin eso no aparece
     * en el Linaje de la ficha. */
    if (padre){
      if (!Array.isArray(DATOS().movimientos)) DATOS().movimientos = [];
      DATOS().movimientos.unshift(movimientoHijo(padre, base, usuarioActual(),
                                                 new Date().toISOString().slice(0, 10)));
    }
    fijar(base);
    markDirty();
    cerrarOverlay();
    refrescarOpcionesFiltros();   // para que el lote nuevo se pueda tildar
    renderLotes();
    // foco en la primera celda del nuevo lote: los fijos van arriba de todo
    const inp = $('tLotes').querySelector('input.cell[data-row="0"]');
    if (inp) inp.focus();
  }

  pintar();
}

/* Un lote vacio con una clave por cada columna, para que la fila nueva no
 * arranque con celdas que el render pinta vacias y el objeto guardado no quede
 * a medias. Numeros y fechas en null, textos y listas en ''. Las ro son
 * derivadas y no se tocan: litros_actuales arranca en 0 (nunca null:
 * motor_etapas compara litros_actuales <= 0) y envases sale del desglose. */
function loteEnBlanco(){
  const nuevo = { litros_actuales: 0, cap50:null, cap200:null, cap225:null,
                  cap500:null, vasija_grande:null };
  for (const c of COLS_LOTES){
    if (c.ro) continue;
    nuevo[c.k] = (c.num || c.fecha) ? null : '';
  }
  nuevo.lote = '';
  return nuevo;
}

/* --- boton "Nuevo lote" de la toolbar --- */
export function agregarLote(){ abrirAsistente(null); }

registrarVista('lotes', () => renderLotes());
registrarInit(initFiltrosLotes);
