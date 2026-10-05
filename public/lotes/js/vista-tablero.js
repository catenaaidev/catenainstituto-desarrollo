/* ===== Lotes CIW — Tablero FML =====
 *
 * Reemplaza la pestana "Seguimiento FML". Orquesta: pide los datos, arma los
 * filtros, pinta la lista y abre la ficha. Todo lo que se puede decidir sin
 * DOM vive en tablero-datos.js.
 *
 * El motor decide y la vista dibuja: aca no se recalcula ninguna regla.
 */
'use strict';

import { $, esc, escA, DATOS, dashData, dashLoading, cargarDashboard, registrarVista, mostrarOverlay, guardar, markDirty, usuarioActual } from './nucleo.js';
import { htmlFicha } from './tablero-ficha.js';
import { htmlPanel } from './tablero-panel.js';
import { initFiltrosMulti, pasaMulti, limpiarFiltrosMulti, opcionesValores, matchValor } from './tabla.js';
import { PREGUNTAS, pasaPregunta, ordenarPorAntiguedad, chipsDe, aplicarEdicion, textoCriterios } from './tablero-datos.js';
import { criteriosEfectivosJS } from './criterios.js';
import { filasExport, COLUMNAS_EXPORT } from './tablero-export.js';
import { fmtFecha } from './fechas.js';

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
    .map(l => ({ ...l,
      _info: info.get(String(l.lote ?? '')) || {},
      _est: (DATOS().estado_lote || {})[String(l.lote ?? '')] || {},
    }));
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
    { label: 'Condición', set: filt.condicion,
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

const HOY = () => new Date().toISOString().slice(0, 10);

const ESTADO_PROCESO = { finalizada: 'terminada', no_finalizada: 'en proceso', excluida: 'excluida', sin_dato: '—' };

function renderLista(){
  const hoy = HOY();
  const filas = filasVisibles();

  const cuerpo = filas.map(f => `
    <tr>
      <td><strong>${esc(f.lote)}</strong><br><span class="tb-sub">${esc(f.variedad ?? '')}</span></td>
      <td>${esc(proyectoDe(f))}</td>
      <td>${esc(f._info.vasija_actual ?? '')}</td>
      <td>${esc(fmtFecha(f.ultima_fecha_control) || '—')}</td>
      <td class="tb-sub">FA ${esc(ESTADO_PROCESO[f.fa_estado] ?? f.fa_estado ?? '—')}<br>
                         FML ${esc(ESTADO_PROCESO[f.fml_estado] ?? f.fml_estado ?? '—')}</td>
      <td>${chipsDe(f, hoy).map(c => `<span class="tb-chip ${c.tono}" title="${escA(c.titulo)}">${esc(c.texto)}</span>`).join('')}</td>
      <td class="tb-sub">${esc(f.accion_sugerida || '')}</td>
      <td><button data-ficha="${escA(f.lote)}">Ver ficha</button></td>
    </tr>`).join('');

  $('tbLista').innerHTML = filas.length === 0
    ? '<p>Ningún lote pasa los filtros.</p>'
    : `<table class="tb-tabla">
         <thead><tr>
           <th>Lote</th><th>Proyecto</th><th>Vasija</th><th>Último control</th>
           <th>Proceso</th><th>Condiciones</th><th>Acción sugerida</th><th></th>
         </tr></thead>
         <tbody>${cuerpo}</tbody>
       </table>`;
}

function abrirFicha(lote){
  const fila = filasTablero().find(f => String(f.lote ?? '') === String(lote));
  if (!fila) return;
  // Replicar la regla de analisisPorLote del motor: clave "lote|AAAA-MM-DD",
  // con usar_registro recortado y en minuscula igual a 'no'.
  const excluidas = new Set(
    (DATOS().excepciones_analisis || [])
      .filter(e => String(e.usar_registro ?? '').trim().toLowerCase() === 'no')
      .map(e => `${String(e.lote)}|${String(e.fecha_analisis ?? '').slice(0, 10)}`)
  );
  mostrarOverlay(htmlFicha(fila, DATOS().analisis || [], HOY(), excluidas));
}

/* La ficha se dibuja en #overlayBox, que cuelga de <body> y no de la seccion
 * de la pestana (index.html:1078). Delegar en `sec` no funcionaria: el evento
 * nunca pasa por ahi. */
function cablearOverlay(){
  const caja = $('overlayBox');
  if (!caja || caja._wiredTablero) return;
  caja._wiredTablero = true;

  caja.addEventListener('change', async (ev) => {
    const el = ev.target.closest('.tb-edit');
    if (!el) return;
    const cont = el.closest('[data-ficha-de]');
    if (!cont) return;                       // otra cosa dibujada en el overlay
    const lote = cont.dataset.fichaDe;
    const { seccion } = aplicarEdicion(DATOS(), lote, el.dataset.campo, el.value, usuarioActual());
    if (!seccion) return;
    markDirty();

    /* Mermo y hace_fml cambian condiciones que calcula el servidor, asi que los
     * chips quedarian viejos. Se guarda y se vuelve a pedir el dashboard para
     * que el lote se repinte solo. Comentario e inoculado no mueven ninguna
     * condicion: alcanza con markDirty, que el autoguardado se encarga solo. */
    if (el.dataset.campo === 'mermo' || el.dataset.campo === 'hace_fml'){
      if (await guardar()){ await cargarDashboard(); renderPanel(); renderLista(); abrirFicha(lote); }
    }
  });
}

function cablear(sec){
  sec.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-modo]');
    if (b){ _modoPanel = b.dataset.modo; renderPanel(); return; }
    const vf = ev.target.closest('[data-ficha]');
    if (vf){ abrirFicha(vf.dataset.ficha); return; }
    if (ev.target.id === 'tbVerCriterios'){
      // criteriosEfectivosJS recibe el config ENTERO y busca .criterios_fml adentro
      // (criterios.js:42-43). Pasarle config.criterios_fml devuelve los defaults.
      const eff = criteriosEfectivosJS(DATOS().config || {}, null, null);
      mostrarOverlay(`<h3>Criterios vigentes</h3>` + textoCriterios(eff)
        .map(c => `<p><strong>${esc(c.titulo)}</strong><br>${esc(c.regla)}</p>`).join(''));
      return;
    }
    if (ev.target.id === 'tbExportar'){
      const hoy = HOY();
      window.CIW_EXPORTAR_HOJAS(`Tablero FML (${hoy}).xlsx`, [
        { nombre: 'CONDICIONES', columnas: COLUMNAS_EXPORT, filas: filasExport(filasVisibles(), hoy) },
      ]);
      return;
    }
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
  cablearOverlay();
}

registrarVista('tablero', () => renderTablero());
