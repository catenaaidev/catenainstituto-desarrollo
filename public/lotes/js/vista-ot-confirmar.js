/* ===== Lotes CIW — confirmar una OT de trasiego =====
 *
 * Se cargan solo los totales por lote (destino real, litros reales, merma):
 * los OK de cada paso quedan en el papel firmado. Después se mira el Mapa de
 * Barriles, solo para AVISAR: si un barril de la OT sigue LLENO con el mismo
 * lote, faltó escanearlo. La OT nunca escribe en el Mapa. */
'use strict';

import { $, esc, escA, num, DATOS, markDirty, usuarioActual,
         mostrarOverlay, cerrarOverlay } from './nucleo.js';
import { confirmarOT, sinEscanear } from './ot-armado.js';

export function abrirConfirmarOT(ot, onListo){
  const filas = ot.lotes.map((l, i) => `
<tr><td><b>${esc(l.lote)}</b><br><span style="color:var(--muted)">${esc(l.id_texto)}</span></td>
  <td>${esc(l.litros_previstos ?? '')}</td>
  <td><input class="txt" id="otcDest${i}" value="${escA(l.destino_real || ot.destino)}" placeholder="Tanque real"></td>
  <td><input class="txt" type="number" step="any" id="otcLit${i}" value="${escA(l.litros_reales ?? '')}"></td>
  <td><input class="txt" type="number" step="any" id="otcMer${i}" value="${escA(l.merma ?? '')}"></td></tr>`).join('');

  mostrarOverlay(`
<h3 style="margin:0 0 14px">✓ Confirmar ${esc(ot.ot)}</h3>
<table><thead><tr><th>Lote</th><th>Previstos</th><th>Destino real</th><th>Litros reales</th><th>Merma</th></tr></thead>
<tbody>${filas}</tbody></table>
<div style="display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center;margin-top:12px">
  <label>Operario</label><input class="txt" id="otcOperario" placeholder="Quién lo hizo…">
  <label>Pasos</label><label><input type="checkbox" id="otcPasos"> Todos los pasos de la hoja están cumplidos</label>
  <label>Comentario</label><input class="txt" id="otcComentario">
</div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="otcCancelar">Cancelar</button>
  <button class="btn primary" id="otcAceptar">Confirmar</button>
</div>`);

  $('otcCancelar').addEventListener('click', () => cerrarOverlay());
  $('otcAceptar').addEventListener('click', () => _aceptar(ot, onListo));
}

async function _aceptar(ot, onListo){
  const operario = $('otcOperario').value.trim();
  if (!operario){ alert('Falta el operario: la confirmación registra quién hizo el trabajo.'); return; }
  const por_lote = ot.lotes.map((_, i) => ({
    destino_real: $('otcDest' + i).value,
    litros_reales: num($('otcLit' + i).value),
    merma: num($('otcMer' + i).value),
  }));
  // Sin destino real ni destino previsto de la OT, recorridoVasijas cierra la
  // estadia del lote sin abrir una nueva: el lote queda sin vasija actual.
  const sinDestino = por_lote.findIndex(r => !r.destino_real && !ot.destino);
  if (sinDestino !== -1){
    alert('Falta el tanque destino real del lote ' + ot.lotes[sinDestino].lote
        + ': sin él el lote queda sin vasija actual.');
    return;
  }
  if (por_lote.some(r => r.litros_reales == null) &&
      !confirm('Hay lotes sin litros reales. ¿Confirmar igual?')) return;

  const faltan = confirmarOT(ot, DATOS().movimientos || [], {
    operario, pasos_cumplidos: $('otcPasos').checked, comentario: $('otcComentario').value,
    por_lote,
  }, usuarioActual(), new Date().toISOString().slice(0, 10));
  markDirty();
  onListo();

  // Frenar los botones antes del fetch: el modal sigue en pantalla hasta que
  // se arman los avisos, y sin esto un clic ahi dispara la confirmacion de nuevo.
  $('otcCancelar').disabled = true;
  $('otcAceptar').disabled = true;

  const avisos = [];
  if (faltan.length){
    avisos.push('Algunos movimientos de esta OT ya no están en la tabla (¿los borraron?). La OT quedó confirmada igual.');
  }
  try {
    const r = await fetch(API + '/barriles?lotes=' + encodeURIComponent(ot.lotes.map(l => l.lote).join(',')));
    if (r.ok){
      const d = await r.json();
      const pend = sinEscanear(ot, d.por_lote || {});
      if (pend.length){
        avisos.push('Estos barriles siguen LLENOS en el Mapa con el mismo lote. ¿Faltó escanear el vaciado? '
          + pend.map(p => `${p.lote}: ${p.num}`).join(', '));
      }
    } else {
      avisos.push('No se pudo consultar el Mapa de Barriles para revisar el escaneo.');
    }
  } catch (e){
    avisos.push('No se pudo consultar el Mapa de Barriles para revisar el escaneo.');
  }

  if (!avisos.length){ cerrarOverlay(); return; }
  mostrarOverlay(`<h3 style="margin:0 0 14px">✓ ${esc(ot.ot)} confirmada</h3>` +
    avisos.map(a => `<div class="msg err">${esc(a)}</div>`).join('') +
    `<div style="margin-top:18px;text-align:right"><button class="btn primary" id="otcCerrar">Entendido</button></div>`);
  $('otcCerrar').addEventListener('click', () => cerrarOverlay());
}
