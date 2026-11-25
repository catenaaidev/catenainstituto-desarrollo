/* ===== Órdenes de trabajo — el embudo ▾ de un título de la tabla =====
 * Un solo panel flotante a la vez, pegado al botón ▾ (position:fixed, así no
 * lo corta el scroll de la tabla). Tres clases:
 *   - casillas: buscador + "Todas" + una casilla por valor. Sin nada elegido
 *     = todas (sin filtro), como los embudos de Lotes;
 *   - texto: un campo (N°);
 *   - fechas: desde / hasta.
 * Cada cambio llama a cfg.alCambiar enseguida: la página repinta la tabla y
 * el panel queda abierto (vive en <body>, fuera de la tabla). */
'use strict';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

let _panel = null;   // { el, emb, boton }

export function cerrarEmbudo(){
  if (!_panel) return;
  _panel.boton.setAttribute('aria-expanded', 'false');
  _panel.el.remove();
  _panel = null;
}

/** El ▾ se repinta con la tabla: el panel abierto pasa a anclarse al nuevo. */
export function reanclarEmbudo(raiz){
  if (!_panel) return;
  const b = raiz.querySelector(`[data-emb="${_panel.emb}"]`);
  if (!b){ cerrarEmbudo(); return; }
  _panel.boton = b;
  b.setAttribute('aria-expanded', 'true');
  _ubicar();
}

/** Abre (o cierra, si ya estaba abierto) el embudo de `boton`.
 *  cfg = { clase: 'casillas'|'texto'|'fechas', titulo, opciones: [{val, txt}],
 *          elegidos: [val], valor, desde, hasta, alCambiar(cambio) } */
export function alternarEmbudo(boton, cfg){
  const mismo = _panel && _panel.emb === boton.dataset.emb;
  cerrarEmbudo();
  if (mismo) return;
  const el = document.createElement('div');
  el.className = 'ord-emb-panel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Filtrar ' + cfg.titulo);
  document.body.appendChild(el);
  _panel = { el, emb: boton.dataset.emb, boton };
  boton.setAttribute('aria-expanded', 'true');
  ({ casillas: _casillas, texto: _texto, fechas: _fechas })[cfg.clase](el, cfg);
  _ubicar();
  el.querySelector('input')?.focus();
}

/* Debajo del botón, alineado a su borde derecho, sin salirse de la ventana. */
function _ubicar(){
  if (!_panel) return;
  const r = _panel.boton.getBoundingClientRect();
  const el = _panel.el;
  const ancho = el.offsetWidth, alto = el.offsetHeight;
  const izq = Math.max(8, Math.min(r.right - ancho, window.innerWidth - ancho - 8));
  const arriba = r.bottom + 4 + alto > window.innerHeight - 8 ? Math.max(8, r.top - alto - 4) : r.bottom + 4;
  el.style.left = izq + 'px';
  el.style.top = arriba + 'px';
}

function _casillas(el, cfg){
  const elegidos = new Set(cfg.elegidos || []);
  const todos = cfg.opciones.map(o => o.val);
  el.innerHTML =
    `<input type="search" class="ord-emb-busca" placeholder="Buscar" aria-label="Buscar en ${esc(cfg.titulo)}" autocomplete="off">` +
    `<label class="ord-emb-opt ord-emb-todas"><input type="checkbox" data-todas> Todas</label>` +
    `<div class="ord-emb-lista">` +
    cfg.opciones.map(o => `<label class="ord-emb-opt" data-txt="${esc(String(o.txt).toLowerCase())}">` +
      `<input type="checkbox" value="${esc(o.val)}"> ${esc(o.txt)}</label>`).join('') +
    (cfg.opciones.length ? '' : `<p class="ord-emb-nada">No hay valores en esta lista.</p>`) +
    `</div>`;
  const cajas = [...el.querySelectorAll('.ord-emb-lista input')];
  const todas = el.querySelector('[data-todas]');
  const marcar = () => {
    // Sin nada elegido = sin filtro: todas tildadas.
    cajas.forEach(c => { c.checked = !elegidos.size || elegidos.has(c.value); });
    todas.checked = !elegidos.size;
  };
  const avisar = () => {
    // Elegir todas es lo mismo que no filtrar.
    if (todos.length && todos.every(v => elegidos.has(v))) elegidos.clear();
    marcar();
    cfg.alCambiar([...elegidos]);
  };
  marcar();
  // "Todas" vuelve a sin filtro (destildarla no deja la lista vacía).
  todas.addEventListener('change', () => { elegidos.clear(); avisar(); });
  cajas.forEach(c => c.addEventListener('change', () => {
    if (!elegidos.size) todos.forEach(v => elegidos.add(v));   // de "todas" a "todas menos esta"
    if (c.checked) elegidos.add(c.value); else elegidos.delete(c.value);
    if (!elegidos.size) elegidos.add(c.value);   // nunca cero: queda la última
    avisar();
  }));
  el.querySelector('.ord-emb-busca').addEventListener('input', e => {
    const t = e.target.value.trim().toLowerCase();
    el.querySelectorAll('.ord-emb-lista .ord-emb-opt').forEach(l => { l.hidden = !!t && !l.dataset.txt.includes(t); });
  });
}

function _texto(el, cfg){
  el.innerHTML = `<label class="ord-emb-campo">${esc(cfg.titulo)} contiene` +
    `<input type="search" value="${esc(cfg.valor || '')}" autocomplete="off"></label>`;
  el.querySelector('input').addEventListener('input', e => cfg.alCambiar(e.target.value));
}

function _fechas(el, cfg){
  el.innerHTML =
    `<label class="ord-emb-campo">Desde<input type="date" data-k="desde" value="${esc(cfg.desde || '')}"></label>` +
    `<label class="ord-emb-campo">Hasta<input type="date" data-k="hasta" value="${esc(cfg.hasta || '')}"></label>`;
  el.querySelectorAll('input').forEach(i => i.addEventListener('input', () =>
    cfg.alCambiar({ [i.dataset.k]: i.value })));
}

/* Clic afuera o Escape cierran. El clic en un ▾ lo maneja alternarEmbudo. */
document.addEventListener('mousedown', e => {
  if (!_panel) return;
  if (_panel.el.contains(e.target) || e.target.closest?.('[data-emb]')) return;
  cerrarEmbudo();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !_panel) return;
  const b = _panel.boton;
  cerrarEmbudo();
  b.focus();
});
window.addEventListener('resize', _ubicar);
window.addEventListener('scroll', _ubicar, true);
