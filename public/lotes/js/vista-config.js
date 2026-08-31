/* ===== Lotes CIW — pestana Configuracion ===== */
'use strict';

import { $, esc, escA, DATOS, markDirty, registrarVista } from './nucleo.js';
import { CRITERIOS_DEFAULT } from './criterios.js';
import { activarGrilla } from './grilla.js';

/** Columnas de la tabla de configuración, en orden de presentación. */
const COLS_CONFIG = [
  { k:'hace_fml',               label:'Hace FML',              sel:['si','no'] },
  { k:'fa_azucar_reductor_max', label:'FA azúcar red. máx',    num:true },
  { k:'fml_malico_finalizada',  label:'FML málico finalizado',  num:true },
  { k:'fml_malico_2ultimas',    label:'FML málico 2 últimas',   num:true },
  { k:'so2_molecular_objetivo',  label:'SO₂ molecular objetivo', num:true },
  { k:'so2_libre_piso',          label:'SO₂ libre piso',         num:true },
  { k:'ph_max',                 label:'pH máx',                 num:true },
  { k:'av_max',                 label:'AV máx',                 num:true },
  { k:'av_delta_max',           label:'AV delta máx',           num:true },
  { k:'av_delta_dias',          label:'AV delta días',          num:true, int:true },
  { k:'frecuencia_no_terminada',label:'Frecuencia no term. (d)',num:true, int:true },
  { k:'frecuencia_terminada',   label:'Frecuencia terminada (d)',num:true, int:true },
];

const DESTINOS_DEFAULT = ['Destilería', 'Rellenos', 'Sangrías Bodega', 'Granel', 'Descarte'];

function _configEnsure(){
  if (!DATOS().config) DATOS().config = {};
  if (!DATOS().config.criterios_fml) DATOS().config.criterios_fml = {};
  const c = DATOS().config.criterios_fml;
  if (!c.default) c.default = Object.assign({}, CRITERIOS_DEFAULT);
  if (!c.por_variedad) c.por_variedad = {};
  // Se crea vacia: un datos.json viejo sin esta clave se comporta igual que
  // antes, y el subsistema B no necesita ninguna migracion.
  if (!c.por_proyecto) c.por_proyecto = {};
  // destinos_externos: NO sembrar si ya existe (la migración lo hizo)
  if (!Array.isArray(DATOS().config.destinos_externos)){
    DATOS().config.destinos_externos = [...DESTINOS_DEFAULT];
  }
}

/** Construye un <select class="cell"> para hace_fml con las opciones si/no. */
function _cfgSelect(val, dataAttrs){
  const attrs = Object.entries(dataAttrs).map(([k,v])=>`data-${k}="${escA(v)}"`).join(' ');
  const opts = ['si','no'].map(o=>`<option value="${o}"${val===o?' selected':''}>${o}</option>`).join('');
  return `<select class="cell" ${attrs}>${opts}</select>`;
}

/** Construye un <input class="cell num"> para umbrales numéricos. */
function _cfgInput(val, dataAttrs, placeholder){
  const attrs = Object.entries(dataAttrs).map(([k,v])=>`data-${k}="${escA(v)}"`).join(' ');
  const valAttr = val != null ? `value="${escA(String(val))}"` : '';
  const ph = placeholder ? `placeholder="${escA(placeholder)}"` : '';
  return `<input type="number" step="any" class="cell num" ${attrs} ${valAttr} ${ph}>`;
}

/** Renderiza la tabla de criterios por proyecto.
 *
 *  Es hermana de la de variedad pero con UNA diferencia deliberada en el texto
 *  de herencia: una fila de variedad puede decir "(hereda: 3.75)" porque arriba
 *  de la variedad solo hay default, y ese numero es unico. Una fila de proyecto
 *  no puede mostrar un numero, porque lo que hereda depende de la variedad de
 *  cada lote: un proyecto con Chardonnay y Pinot Noir hereda distinto en cada
 *  uno. Por eso dice "(hereda de la variedad)", sin valor. */
function _renderConfigProyectos(){
  const cfg = DATOS().config.criterios_fml;
  const pp  = cfg.por_proyecto;
  const tHead = $('tConfigProyHead');
  const tBody = $('tConfigProyBody');
  if (!tHead || !tBody) return;

  let h = '<tr><th>Proyecto</th>';
  for (const c of COLS_CONFIG){
    h += `<th data-k="${escA(c.k)}">${esc(c.label)}</th>`;
  }
  h += '<th></th></tr>';
  tHead.innerHTML = h;

  let tb = '';
  for (const [proyecto, override] of Object.entries(pp)){
    tb += `<tr data-row-type="proyecto" data-proyecto="${escA(proyecto)}">`;
    tb += `<td style="font-weight:500">${esc(proyecto)}</td>`;
    for (const c of COLS_CONFIG){
      const val = override[c.k] != null ? override[c.k] : null;
      const attrs = {'cfg-type':'proyecto','cfg-k':c.k,'cfg-proy':proyecto};
      const aStr = Object.entries(attrs).map(([k,v])=>`data-${k}="${escA(v)}"`).join(' ');
      if (c.sel){
        const curVal = val != null ? val : '';
        const opts = [
          `<option value=""${curVal===''?' selected':''}>(hereda de la variedad)</option>`,
          `<option value="si"${curVal==='si'?' selected':''}>si</option>`,
          `<option value="no"${curVal==='no'?' selected':''}>no</option>`,
        ].join('');
        tb += `<td><select class="cell" ${aStr}>${opts}</select></td>`;
      } else {
        // type="number" sanitiza la entrada antes de que _cfgOnInput la toque:
        // si el contenido no es numero valido el navegador devuelve value='',
        // y el handler borra la clave (camino seguro). Con type="text" parseFloat
        // silenciaba comas decimales (3,55->3) y guardaba null para texto libre.
        tb += `<td>${_cfgInput(val, attrs, '(hereda)')}</td>`;
      }
    }
    tb += `<td><button class="rowbtn" data-quitar-proy="${escA(proyecto)}" title="Quitar este proyecto">✕</button></td></tr>`;
  }
  tBody.innerHTML = tb ||
    `<tr><td colspan="${COLS_CONFIG.length + 2}" style="color:var(--muted)">Sin criterios por proyecto. Usá "➕ Agregar proyecto".</td></tr>`;

  const tbl = $('tConfigProy');
  if (tbl) activarGrilla(tbl);
}

/* Los tres callbacks de edicion viven fuera de renderConfig porque los comparten
 * las DOS tablas (variedad y proyecto): un solo juego de handlers que despacha
 * por data-cfg-type, en vez de un juego por tabla. */
function _cfgOnInput(e){
  const el = e.target.closest('[data-cfg-type]'); if (!el) return;
  const tipo = el.dataset.cfgType;
  const k    = el.dataset.cfgK;
  const col  = COLS_CONFIG.find(c => c.k === k); if (!col) return;
  _configEnsure();
  const cfg2 = DATOS().config.criterios_fml;

  if (tipo === 'default'){
    if (col.sel){
      cfg2.default[k] = el.value;
    } else {
      cfg2.default[k] = el.value === '' ? CRITERIOS_DEFAULT[k] : (col.int ? parseInt(el.value, 10) : parseFloat(el.value));
    }
  } else if (tipo === 'variedad'){
    const varNombre = el.dataset.cfgVar;
    if (!cfg2.por_variedad[varNombre]) cfg2.por_variedad[varNombre] = {};
    if (el.value === '' || el.value == null){
      delete cfg2.por_variedad[varNombre][k];
    } else {
      // Defensa en profundidad: type="number" ya filtra en el navegador, pero el
      // handler es compartido y un NaN guardado en datos.json rompe el motor entero.
      const n = col.sel ? el.value : (col.int ? parseInt(el.value, 10) : parseFloat(el.value));
      if (col.sel || Number.isFinite(n)) cfg2.por_variedad[varNombre][k] = n;
    }
  } else if (tipo === 'proyecto'){
    // Misma regla que variedad: un valor vacio BORRA la clave para volver a
    // heredar, en vez de guardar un null que se veria como "definido en vacio".
    const proyNombre = el.dataset.cfgProy;
    if (!cfg2.por_proyecto[proyNombre]) cfg2.por_proyecto[proyNombre] = {};
    if (el.value === '' || el.value == null){
      delete cfg2.por_proyecto[proyNombre][k];
    } else {
      const n = col.sel ? el.value : (col.int ? parseInt(el.value, 10) : parseFloat(el.value));
      if (col.sel || Number.isFinite(n)) cfg2.por_proyecto[proyNombre][k] = n;
    }
  }
  markDirty();
}

function _cfgOnChange(e){
  const el = e.target.closest('select[data-cfg-type]'); if (!el) return;
  const tipo = el.dataset.cfgType;
  const k    = el.dataset.cfgK;
  _configEnsure();
  const cfg2 = DATOS().config.criterios_fml;

  if (tipo === 'default'){
    cfg2.default[k] = el.value;
  } else if (tipo === 'variedad'){
    const varNombre = el.dataset.cfgVar;
    if (!cfg2.por_variedad[varNombre]) cfg2.por_variedad[varNombre] = {};
    if (el.value === ''){
      delete cfg2.por_variedad[varNombre][k];
    } else {
      cfg2.por_variedad[varNombre][k] = el.value;
    }
  } else if (tipo === 'proyecto'){
    const proyNombre = el.dataset.cfgProy;
    if (!cfg2.por_proyecto[proyNombre]) cfg2.por_proyecto[proyNombre] = {};
    if (el.value === ''){
      delete cfg2.por_proyecto[proyNombre][k];
    } else {
      cfg2.por_proyecto[proyNombre][k] = el.value;
    }
  }
  markDirty();
}

function _cfgOnClick(e){
  const bVar = e.target.closest('[data-quitar-var]');
  if (bVar){
    const varNombre = bVar.dataset.quitarVar;
    if (!confirm(`¿Quitar el override de "${varNombre}"? La variedad pasará a usar los valores del default.`)) return;
    _configEnsure();
    delete DATOS().config.criterios_fml.por_variedad[varNombre];
    markDirty();
    renderConfig();
    return;
  }
  const bProy = e.target.closest('[data-quitar-proy]');
  if (bProy){
    const proyNombre = bProy.dataset.quitarProy;
    if (!confirm(`¿Quitar los criterios propios de "${proyNombre}"? Sus lotes vuelven a usar los de su variedad.`)) return;
    _configEnsure();
    delete DATOS().config.criterios_fml.por_proyecto[proyNombre];
    markDirty();
    renderConfig();
  }
}

export function renderConfig(){
  _configEnsure();
  const cfg = DATOS().config.criterios_fml;
  const def = cfg.default;
  const pv  = cfg.por_variedad;

  const tHead = $('tConfigHead');
  const tBody = $('tConfigBody');

  /* ---- encabezado ----
   * "Variedad" queda A PROPOSITO sin data-k: no es un umbral, es la etiqueta
   * de la fila (y en la fila default ni siquiera tiene <td> comparable). Que
   * quede fuera de la grilla es coherente con "se ven las 11 columnas" al
   * copiar la tabla completa (las de COLS_CONFIG, no 12). */
  let h = '<tr><th>Variedad</th>';
  for (const c of COLS_CONFIG){
    h += `<th data-k="${escA(c.k)}">${esc(c.label)}</th>`;
  }
  h += '<th></th></tr>';
  tHead.innerHTML = h;

  /* ---- fila default ---- */
  let tb = '<tr data-row-type="default"><td><b>General (default)</b></td>';
  for (const c of COLS_CONFIG){
    const val = def[c.k] != null ? def[c.k] : CRITERIOS_DEFAULT[c.k];
    if (c.sel){
      tb += `<td>${_cfgSelect(val, {'cfg-type':'default','cfg-k':c.k})}</td>`;
    } else {
      tb += `<td>${_cfgInput(val, {'cfg-type':'default','cfg-k':c.k}, '')}</td>`;
    }
  }
  tb += '<td></td></tr>';

  /* ---- filas por variedad ---- */
  for (const [variedad, override] of Object.entries(pv)){
    tb += `<tr data-row-type="variedad" data-variedad="${escA(variedad)}">`;
    tb += `<td style="font-weight:500">${esc(variedad)}</td>`;
    for (const c of COLS_CONFIG){
      const val = override[c.k] != null ? override[c.k] : null;
      const defVal = def[c.k] != null ? def[c.k] : CRITERIOS_DEFAULT[c.k];
      if (c.sel){
        // Para variedad: un select vacío no aplica; usamos un select con opción vacía primero
        const attrs = {'cfg-type':'variedad','cfg-k':c.k,'cfg-var':variedad};
        const aStr = Object.entries(attrs).map(([k,v])=>`data-${k}="${escA(v)}"`).join(' ');
        const curVal = val != null ? val : '';
        const opts = [
          `<option value=""${curVal===''?' selected':''}>(hereda: ${escA(String(defVal))})</option>`,
          `<option value="si"${curVal==='si'?' selected':''}>si</option>`,
          `<option value="no"${curVal==='no'?' selected':''}>no</option>`,
        ].join('');
        tb += `<td><select class="cell" ${aStr}>${opts}</select></td>`;
      } else {
        const ph = `hereda: ${defVal}`;
        tb += `<td>${_cfgInput(val, {'cfg-type':'variedad','cfg-k':c.k,'cfg-var':variedad}, ph)}</td>`;
      }
    }
    tb += `<td><button class="rowbtn" title="Quitar override de ${escA(variedad)}" data-quitar-var="${escA(variedad)}">✕</button></td></tr>`;
  }

  tBody.innerHTML = tb;

  /* Grilla tipo planilla, SIN adaptador: solo copiar. Los umbrales gobiernan
   * las alarmas de los 291 lotes, y la semantica de escritura de esta tabla
   * es propia (un valor vacio en la fila default vuelve al valor de fabrica;
   * en una fila de variedad, borra la clave para heredar del default), asi
   * que un pegado en bloque generico podria cambiarlos en silencio. Se
   * mantiene la edicion celda a celda de siempre, cableada en _cfgOnInput /
   * _cfgOnChange mas abajo (un solo juego de handlers para las dos tablas). */
  const tbl = $('tConfig');
  activarGrilla(tbl);

  _renderConfigProyectos();

  /* ---- event listeners: un solo juego de handlers para las DOS tablas ---- */
  for (const t of [$('tConfig'), $('tConfigProy')]){
    if (!t || t._wired) continue;
    t._wired = true;
    t.addEventListener('input',  _cfgOnInput);
    t.addEventListener('change', _cfgOnChange);
    t.addEventListener('click',  _cfgOnClick);
  }
}

export function agregarVariedadConfig(){
  _configEnsure();
  const cfg = DATOS().config.criterios_fml;
  // variedades en DATOS.lotes que aún no tienen override
  const existentes = new Set(Object.keys(cfg.por_variedad));
  const disponibles = [...new Set(
    (DATOS().lotes || []).map(l => (l.variedad || '').trim()).filter(Boolean)
  )].filter(v => !existentes.has(v)).sort((a,b)=>a.localeCompare(b,'es'));

  if (disponibles.length === 0){
    alert('No hay variedades disponibles para agregar (todas tienen override o no hay lotes con variedad definida).');
    return;
  }

  const elegida = disponibles.length === 1
    ? disponibles[0]
    : prompt('Seleccioná la variedad (escribí exacto):\n\n' + disponibles.join('\n'), disponibles[0]);

  if (!elegida || !elegida.trim()) return;
  const v = elegida.trim();
  if (!disponibles.includes(v)){
    alert(`"${v}" no está entre las variedades disponibles.`);
    return;
  }

  cfg.por_variedad[v] = {};
  markDirty();
  renderConfig();
}

export function agregarProyectoConfig(){
  _configEnsure();
  const cfg = DATOS().config.criterios_fml;
  /* Los proyectos salen de DATOS().lotes y NO del dashboard: aca se configuran
   * criterios, y un proyecto cuyos lotes hoy estan todos vacios puede recibir
   * lotes nuevos manana. (Es la razon opuesta a la del filtro de la pestana
   * Orden de muestras, donde lo que se filtra son filas del dashboard.) */
  const existentes = new Set(Object.keys(cfg.por_proyecto));
  const disponibles = [...new Set(
    (DATOS().lotes || []).map(l => (l.proyecto || '').trim()).filter(Boolean)
  )].filter(p => !existentes.has(p)).sort((a,b)=>a.localeCompare(b,'es'));

  if (disponibles.length === 0){
    alert('No hay proyectos disponibles para agregar (todos tienen criterios propios o no hay lotes con proyecto definido).');
    return;
  }

  const elegido = disponibles.length === 1
    ? disponibles[0]
    : prompt('Seleccioná el proyecto (escribí exacto):\n\n' + disponibles.join('\n'), disponibles[0]);

  if (!elegido || !elegido.trim()) return;
  const p = elegido.trim();
  if (!disponibles.includes(p)){
    alert(`"${p}" no está entre los proyectos disponibles.`);
    return;
  }

  cfg.por_proyecto[p] = {};
  markDirty();
  renderConfig();
}

export function restaurarDefaultsConfig(){
  if (!confirm('¿Restaurar los valores por defecto del default? Esto reemplaza la fila "General (default)" con los valores originales del motor FML.')) return;
  _configEnsure();
  DATOS().config.criterios_fml.default = Object.assign({}, CRITERIOS_DEFAULT);
  markDirty();
  renderConfig();
}

registrarVista('config', () => renderConfig());
