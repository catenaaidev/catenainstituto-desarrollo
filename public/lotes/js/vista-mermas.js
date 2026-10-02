/* ===== Lotes CIW — sub-pestaña Movimientos -> Mermas =====
 * Las barricas que quedaron mermas despues de una OT, hasta que se completan. */
'use strict';

import { $, esc, escA, DATOS, markDirty, usuarioActual, pedirUsuario } from './nucleo.js';
import { estaPendiente, faltanteDe, llenaSegunMapa, resolver, recalcularLitros, codigoLote } from './mermas.js';
import { porNumMermas, refrescarMapaMermas, cerrarMermasLlenas } from './mermas-mapa.js';

let _verResueltas = false;

const dias = desde => {
  const d = Date.parse(desde); if (!Number.isFinite(d)) return '';
  return Math.max(0, Math.floor((Date.now() - d) / 86400000));
};

export function renderMermas(cont, { onCambio }){
  const porNum = porNumMermas();
  const leyendo = porNum === undefined;
  const todas = DATOS().mermas || [];
  const filas = todas.filter(m => _verResueltas || estaPendiente(m)).map(m => {
    // Mientras se este leyendo el Mapa (porNum === undefined) o la lectura haya
    // fallado (null), no hay forma de saber si esta llena: nunca "pendiente"
    // se confunde con "llena" por falta de dato.
    const llena = estaPendiente(m) && porNum && typeof porNum === 'object' && llenaSegunMapa(m, porNum[String(m.barril)]);
    const estado = !estaPendiente(m)
      ? `resuelta (${esc(m.resuelta_como)}) ${esc(m.resuelta_el)}`
      : llena ? '✓ llena según el Mapa · se cierra al guardar' : 'pendiente';
    return `<tr class="${estaPendiente(m) ? (llena ? 'mer-llena' : '') : 'mer-resuelta'}">
      <td>${esc(m.lote)}</td><td>${esc(m.barril)}</td><td>${esc(m.litros)} / ${esc(m.cap)}</td>
      <td>${esc(faltanteDe(m))} L</td><td>${esc(m.ot)}</td><td>${esc(dias(m.desde))}</td><td>${estado}</td>
      <td>${estaPendiente(m) ? `<button class="btn" data-resolver="${escA(m.id)}">✓ resuelta</button>` : ''}</td></tr>`;
  }).join('');
  const pend = todas.filter(estaPendiente).length;
  cont.innerHTML = `<div class="toolbar">
    <span class="tag">${pend} pendiente${pend === 1 ? '' : 's'}</span>
    <label><input type="checkbox" id="merVerRes"${_verResueltas ? ' checked' : ''}> Ver resueltas</label>
    <button class="btn" id="merRefrescar">🔄 Mirar el Mapa</button>
    ${leyendo ? '<span class="tag">Leyendo el Mapa…</span>' : porNum === null ? '<span class="tag">No se pudo leer el Mapa</span>' : ''}</div>
  <div class="scroll"><table><thead><tr><th>Lote</th><th>Barril</th><th>Litros / cap</th><th>Falta</th><th>OT</th><th>Días</th><th>Estado</th><th></th></tr></thead>
  <tbody>${filas || '<tr><td colspan="8" style="color:var(--muted)">No hay barricas mermas.</td></tr>'}</tbody></table></div>`;

  $('merVerRes').addEventListener('change', e => { _verResueltas = e.target.checked; onCambio(); });
  $('merRefrescar').addEventListener('click', async () => {
    await refrescarMapaMermas();
    // A diferencia de la lectura automatica al cargar (registrarInit en
    // mermas-mapa.js), apretar este boton SI puede cerrar mermas: el click es
    // el pedido explicito que "la web no guarda sola" exige. markDirty deja
    // el cierre esperando el Guardar de siempre.
    if (cerrarMermasLlenas(DATOS())) markDirty();
    onCambio();
  });
  cont.querySelectorAll('[data-resolver]').forEach(b => b.addEventListener('click', () => {
    const m = todas.find(x => x.id === b.dataset.resolver);
    if (!m || !estaPendiente(m)) return;
    const quien = usuarioActual() || pedirUsuario(true);
    if (!quien) return;
    if (!confirm(`¿Marcar la barrica ${m.barril} del lote ${m.lote} como resuelta?`)) return;
    resolver(m, 'manual', quien, new Date().toISOString().slice(0, 10));
    recalcularLitros(DATOS().lotes, DATOS().mermas, new Set([codigoLote(m.lote)]));
    markDirty();
    onCambio();
  }));
}
