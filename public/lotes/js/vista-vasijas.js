/* ===== Lotes CIW — Configuracion -> Vasijas fijas =====
 * El padron vivo es DATOS().vasijas. Nunca se borra una vasija: se da de baja
 * (activa: false), porque las OT viejas la nombran. */
'use strict';

import { $, esc, escA, DATOS, markDirty } from './nucleo.js';
import { PADRON_INICIAL, normalizarNumVasija } from './vasijas-padron.js';
import { TABLAS_CUBICACION } from './cubicacion-tablas.js';

const OPCIONES_TABLA = [['', 'sin tabla'], ...Object.entries(TABLAS_CUBICACION).map(([k, t]) => [k, t.nombre])];

export function renderVasijas(cont){
  if (!cont) return;
  if (!Array.isArray(DATOS().vasijas)) DATOS().vasijas = [];
  const vs = DATOS().vasijas;
  if (!vs.length){
    cont.innerHTML = `<button class="btn primary" id="vasInicial">⬇ Cargar padrón inicial (${PADRON_INICIAL.length} vasijas)</button>`;
    $('vasInicial').addEventListener('click', () => {
      DATOS().vasijas = PADRON_INICIAL.map(v => ({ ...v }));
      markDirty(); renderVasijas(cont);
    });
    return;
  }
  const sel = (i, val) => `<select class="cell" data-i="${i}" data-f="tabla">` + OPCIONES_TABLA.map(([k, n]) =>
    `<option value="${escA(k)}"${(val || '') === k ? ' selected' : ''}>${esc(n)}</option>`).join('') + '</select>';
  const filas = vs.map((v, i) => `<tr${v.activa === false ? ' style="opacity:.5"' : ''}>
    <td><input class="cell" data-i="${i}" data-f="num" value="${escA(v.num)}"></td>
    <td><input class="cell" data-i="${i}" data-f="tipo" value="${escA(v.tipo)}"></td>
    <td><input class="cell num" type="number" min="0" step="any" data-i="${i}" data-f="cap_real" value="${escA(v.cap_real)}"></td>
    <td>${sel(i, v.tabla)}</td>
    <td><label><input type="checkbox" data-i="${i}" data-f="activa"${v.activa === false ? '' : ' checked'}> activa</label></td></tr>`).join('');
  cont.innerHTML = `<div class="toolbar"><button class="btn" id="vasAgregar">➕ Agregar vasija</button>
    <span class="tag">${vs.filter(v => v.activa !== false).length} activas</span><span class="msg err" id="vasErr" style="display:none"></span></div>
  <div class="scroll tall"><table><thead><tr><th>N°</th><th>Tipo</th><th>Cap REAL (L)</th><th>Tabla de cubicación</th><th></th></tr></thead>
  <tbody>${filas}</tbody></table></div>`;

  $('vasAgregar').addEventListener('click', () => {
    vs.push({ num: '', tipo: '', cap_real: null, tabla: null, activa: true });
    markDirty(); renderVasijas(cont);
  });
  cont.querySelector('tbody').addEventListener('change', ev => {
    const el = ev.target, v = vs[+el.dataset.i]; if (!v) return;
    const f = el.dataset.f;
    if (f === 'activa'){
      v.activa = el.checked;
      markDirty(); renderVasijas(cont);
      return;
    }
    if (f === 'cap_real'){
      const n = Number(el.value);
      // Vacio, negativo o no numerico: lo mismo que "sin dato" (null), nunca
      // una capacidad imposible.
      v.cap_real = (el.value === '' || !Number.isFinite(n) || n < 0) ? null : n;
    }
    else if (f === 'tabla') v.tabla = el.value || null;
    else if (f === 'num'){
      const n = el.value.trim();
      // Vacio es valido (fila recien agregada, todavia sin numero asignado):
      // solo se chequea contra las demas cuando hay algo que comparar.
      const repetida = n !== '' && vs.some((o, j) => j !== +el.dataset.i && normalizarNumVasija(o.num) === normalizarNumVasija(n));
      if (repetida){ $('vasErr').textContent = `Ya existe la vasija ${n}.`; $('vasErr').style.display = ''; el.value = v.num; return; }
      $('vasErr').style.display = 'none';
      v.num = n;
    } else v[f] = el.value.trim();
    markDirty();
  });
}
