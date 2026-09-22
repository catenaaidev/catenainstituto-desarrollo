/* ===== Lotes CIW — Tablero FML =====
 *
 * Reemplaza la pestana "Seguimiento FML". Orquesta: pide los datos, arma los
 * filtros, pinta la lista y abre la ficha. Todo lo que se puede decidir sin
 * DOM vive en tablero-datos.js.
 *
 * El motor decide y la vista dibuja: aca no se recalcula ninguna regla.
 */
'use strict';

import { $, esc, DATOS, dashData, dashLoading, cargarDashboard, registrarVista } from './nucleo.js';
import { htmlPanel } from './tablero-panel.js';
import { initFiltrosMulti, pasaMulti, limpiarFiltrosMulti, opcionesValores, matchValor } from './tabla.js';
import { PREGUNTAS, pasaPregunta, ordenarPorAntiguedad } from './tablero-datos.js';

let _modoPanel = 'numeros';

const filt = { proyecto: new Set(), condicion: new Set() };
let _desc = [], _inst = [];
let _busca = '';
let _pregunta = '';
let _montado = false;

const proyectoDe = (f) => String(f._info.proyecto ?? '').trim();

/** Los lotes del dashboard cruzados con su fila de DATOS() (proyecto, vasija). */
export function filasTablero(){
  const dash = dashData();
  if (!dash) return [];
  const info = new Map((DATOS().lotes || []).map(l => [String(l.lote ?? ''), l]));
  return (dash.lotes || [])
    .filter(l => l.activo)
    .map(l => ({ ...l, _info: info.get(String(l.lote ?? '')) || {} }));
}

/** Las filas que se ven: filtradas y ordenadas. La lista y el export usan esta. */
export function filasVisibles(){
  const q = _busca.trim().toLowerCase();
  const filas = filasTablero().filter(f => {
    if (q && !String(f.lote ?? '').toLowerCase().includes(q)
           && !String(f.variedad ?? '').toLowerCase().includes(q)) return false;
    if (!pasaPregunta(f, _pregunta)) return false;
    return pasaMulti(f, _desc);
  });
  return ordenarPorAntiguedad(filas);
}

function armazon(){
  return `
    <div class="tb-acciones">
      <button id="tbVerCriterios">Ver criterios</button>
      <button id="tbExportar">Exportar Excel</button>
    </div>
    <div id="tbPanel"></div>
    <div class="tb-filtros">
      <input id="tbBusca" placeholder="Buscar lote o variedad…">
      <select id="tbPregunta">
        <option value="">Todas las preguntas</option>
        ${PREGUNTAS.map(p => `<option value="${p.val}">${esc(p.text)}</option>`).join('')}
      </select>
      <span id="tbFiltBar"></span>
      <button id="tbLimpiar">Limpiar</button>
    </div>
    <div id="tbLista"></div>`;
}

function initFiltros(){
  _desc = [
    { label: 'Proyecto', set: filt.proyecto,
      opciones: () => opcionesValores(filasTablero(), proyectoDe),
      match: matchValor(proyectoDe) },
    { label: 'Condicion', set: filt.condicion,
      // Una fila con dos condiciones tiene que aparecer al filtrar por
      // cualquiera de las dos, asi que no sirve matchValor (es uno a uno).
      opciones: () => {
        const vistas = new Map();
        for (const f of filasTablero()) for (const c of (f.condiciones || [])) vistas.set(c.clave, c.etiqueta);
        return [...vistas].sort((a, b) => a[1].localeCompare(b[1], 'es-AR')).map(([val, text]) => ({ val, text }));
      },
      match: (f, set) => (f.condiciones || []).some(c => set.has(c.clave)) },
  ];
  _inst = initFiltrosMulti('tbFiltBar', _desc, renderLista);
}

export function renderTablero(){
  const sec = $('tab-tablero');
  if (!sec) return;

  // La guarda de la Tarea 3: sin datos del motor no se puede montar nada.
  if (!dashData()){
    sec.innerHTML = '<div class="msg info" style="margin-top:10px">Cargando datos del motor FML…</div>';
    if (!dashLoading()) cargarDashboard();
    _montado = false;   // el placeholder piso el armazon: hay que rearmarlo
    return;
  }

  if (!_montado){
    sec.innerHTML = armazon();
    initFiltros();
    cablear(sec);
    _montado = true;
  }
  renderPanel();
  renderLista();
}

function renderPanel(){
  $('tbPanel').innerHTML = htmlPanel(dashData().kpis || {}, filasTablero(), _modoPanel);
}

function renderLista(){
  $('tbLista').innerHTML = `<p>${filasVisibles().length} lotes</p>`;   // la Tarea 7 la completa
}

function cablear(sec){
  sec.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-modo]');
    if (b){ _modoPanel = b.dataset.modo; renderPanel(); return; }
    if (ev.target.id === 'tbLimpiar'){
      _pregunta = ''; $('tbPregunta').value = '';
      limpiarFiltrosMulti(_desc, 'tbBusca', _inst, () => { _busca = ''; renderLista(); });
    }
  });
  sec.addEventListener('input', (ev) => {
    if (ev.target.id === 'tbBusca'){ _busca = ev.target.value; renderLista(); }
  });
  sec.addEventListener('change', (ev) => {
    if (ev.target.id === 'tbPregunta'){ _pregunta = ev.target.value; renderLista(); }
  });
}

registrarVista('tablero', () => renderTablero());
