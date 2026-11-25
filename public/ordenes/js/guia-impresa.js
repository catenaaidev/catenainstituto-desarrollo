/* ===== Órdenes de trabajo — una Guía de trabajos ya impresa =====
 * Solo lectura: la foto guardada al imprimir (guia_impresas). Reimprimir no
 * pide número ni guarda otra copia. */
'use strict';
import { hojaImpresa } from './guia-hoja.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
// imp.fecha es un ISO en UTC (fecha+hora de guardado); acá hay que mostrarla
// en hora local, como la vio quien imprimió la hoja (no el slice crudo del ISO).
const fmt = iso => {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
};

export async function montarImpresa(cuerpo, { id }){
  cuerpo.innerHTML = `<div class="gt-vista"><div class="gt-barra">` +
    `<a class="ci-btn" href="/ordenes/?v=historial">← Historial</a>` +
    `<button type="button" class="ci-btn" id="gtReimprimir">Reimprimir</button>` +
    `<span class="gt-estado" id="gtEstado"></span></div><div id="gtHoja"><p class="ord-msg">Cargando…</p></div></div>`;
  const $h = cuerpo.querySelector('#gtHoja');
  cuerpo.querySelector('#gtReimprimir').addEventListener('click', () => window.print());
  try {
    const r = await fetch('/ordenes/api/guia/impresas?id=' + encodeURIComponent(id));
    if (!r.ok) throw new Error('http ' + r.status);
    const imp = await r.json();
    if (!$h.isConnected) return;
    cuerpo.querySelector('#gtEstado').textContent = 'Guía N° ' + imp.numero + ' · impresa el ' + fmt(imp.fecha) + (imp.por ? ' por ' + imp.por : '');
    const anio = (() => { const d = new Date(imp.fecha || ''); return Number.isNaN(d.getTime()) ? '' : String(d.getFullYear()); })();
    $h.innerHTML = hojaImpresa({ numero: imp.numero, fechaTxt: fmt(imp.fecha), anio, foto: imp.foto });
  } catch (_) {
    if ($h.isConnected) $h.innerHTML = `<p class="ord-msg">${esc('No se pudo cargar esa guía impresa.')}</p>`;
  }
}
