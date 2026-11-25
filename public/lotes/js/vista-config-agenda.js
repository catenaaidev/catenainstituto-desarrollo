/* ===== Lotes CIW — Configuracion > Agenda =====
 * Cupos, plazos y feriados de la Agenda. Toda la validacion vive en
 * agenda-dias.js (testeada); aca solo se dibuja y se llama markDirty. */
'use strict';

import { $, esc, escA, DATOS, markDirty } from './nucleo.js';
import { configAgenda, fijarParametro, agregarFeriado, quitarFeriado, restaurarFeriados, MINIMOS, MAXIMOS } from './agenda-dias.js';
import { confirmar } from './dialogos.js';

const PARAMS = [
  { k: 'cupo_analisis', label: 'Análisis por día' },
  { k: 'cupo_trasiegos', label: 'Trasiegos (lotes) por día' },
  { k: 'aviso_dias', label: 'Aviso "próximo a vencer" (días)' },
  { k: 'horizonte_semanas', label: 'Semanas de calendario' },
];

const DIAS_RONDA = ['Sin ronda', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

let _montado = false;
let _msg = '';

export function renderConfigAgenda(){
  const box = $('cfgAgenda');
  if (!box) return;
  const cfg = configAgenda(DATOS().config);
  box.innerHTML = `
<h3>📅 Agenda</h3>
<div class="ag-cfg-params">${PARAMS.map(p => `<label>${esc(p.label)}
  <input class="txt" type="number" min="${MINIMOS[p.k]}"${MAXIMOS[p.k] !== undefined ? ` max="${MAXIMOS[p.k]}"` : ''} step="1" data-ag-cfg="${p.k}" value="${escA(cfg[p.k])}"></label>`).join('')}
<label>Ronda de tanques (análisis semanal)
  <select class="txt" data-ag-cfg="ronda_tanques_dia">${DIAS_RONDA.map((t, i) => `<option value="${i}"${cfg.ronda_tanques_dia === i ? ' selected' : ''}>${t}</option>`).join('')}</select></label></div>
<p class="ag-cfg-nota">La ronda de tanques programa, una vez por semana, el análisis de todos los lotes que no están en barricas (si ese día es feriado pasa al siguiente hábil). Tiene cupo aparte y no repite lotes que ya tengan análisis esa semana.</p>
<p class="ag-cfg-nota">La frecuencia de trasiego (por defecto cada 90 días) se ajusta por variedad o por proyecto en la columna <b>Trasiego cada (d)</b> de la tabla de criterios de arriba.</p>
<h4>Feriados (días que no se trabaja)</h4>
<p class="ag-cfg-nota">Precargados los nacionales de 2026 y 2027. Revisá los trasladables y los puentes de cada año, y sumá los de la bodega o de Mendoza.</p>
<div class="scroll-x"><table class="ag-cfg-fer"><thead><tr><th>Fecha</th><th>Nombre</th><th></th></tr></thead><tbody>
${cfg.feriados.map(f => `<tr><td>${esc(f.fecha)}</td><td>${esc(f.nombre)}</td><td><button type="button" class="btn" data-ag-fer-quitar="${escA(f.fecha)}">Quitar</button></td></tr>`).join('')}
</tbody></table></div>
<div class="ag-cfg-alta">
  <input class="txt" type="date" id="agFerFecha" aria-label="Fecha del feriado">
  <input class="txt" id="agFerNombre" placeholder="Nombre" aria-label="Nombre del feriado">
  <button type="button" class="btn" data-ag-fer-agregar>Agregar</button>
  <button type="button" class="btn" data-ag-fer-restaurar>Restaurar precargados</button>
  <span class="ag-cfg-msg" role="status">${esc(_msg)}</span>
</div>`;
  _msg = '';
  if (!_montado){
    box.addEventListener('change', _alCambiar);
    box.addEventListener('click', _alClic);
    _montado = true;
  }
}

function _alCambiar(e){
  const k = e.target.dataset && e.target.dataset.agCfg;
  if (!k) return;
  if (fijarParametro(DATOS(), k, e.target.value)) markDirty();
  else _msg = `Valor inválido: tiene que ser un entero ≥ ${MINIMOS[k]}` + (MAXIMOS[k] !== undefined ? ` y ≤ ${MAXIMOS[k]}` : '') + '.';
  renderConfigAgenda();
}

async function _alClic(e){
  const el = e.target.closest('[data-ag-fer-quitar],[data-ag-fer-agregar],[data-ag-fer-restaurar]');
  if (!el) return;
  const ds = el.dataset;
  if (ds.agFerQuitar){
    if (quitarFeriado(DATOS(), ds.agFerQuitar)) markDirty();
  } else if (ds.agFerAgregar !== undefined){
    const fecha = ($('agFerFecha') || {}).value || '';
    const nombre = ($('agFerNombre') || {}).value || '';
    if (agregarFeriado(DATOS(), fecha, nombre)) markDirty();
    else _msg = 'Fecha inválida o ya cargada.';
  } else if (ds.agFerRestaurar !== undefined){
    if (!await confirmar({ titulo: 'Restaurar feriados', texto: 'La lista se reemplaza por los feriados precargados.', si: 'Reemplazar lista', no: 'Cancelar', peligro: true })) return;
    restaurarFeriados(DATOS());
    markDirty();
  }
  renderConfigAgenda();
}
