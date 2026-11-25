/* ===== Órdenes de trabajo — la página =====
 * Portada con tres tarjetas, y las vistas Nueva orden / Pendientes / Historial.
 * El estado (vista, filtros de los embudos y orden) vive en la URL: se puede
 * copiar y recargar. */
'use strict';
import { buscarTipos, nombreDeTipo, modulosEditablesDe } from './catalogo.js';
import { filtrar, conEtiquetaModulo, contarPendientes, estadoDeURL, urlDeEstado, urlAbrir, urlNueva,
         ordenar, opcionesDe, lista, unirLista, hayFiltros, FILTROS, ESTADO_LIMPIO } from './lista.js';
import { alternarEmbudo, cerrarEmbudo, reanclarEmbudo } from './embudo.js';
import { montarGuia } from './guia-vista.js';
import { montarImpresa } from './guia-impresa.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const CIW = window.CIW || { modulos: {} };
CIW.modulos = CIW.modulos || {};
const MODULOS = ['prensas', 'lotes'];
const modulosConRol = () => MODULOS.filter(m => CIW.modulos[m]);
// Editables = con rol editor/admin Y con tipos en el catálogo.
const modulosEditables = () => modulosEditablesDe(CIW.modulos);
const NOMBRE_MOD = { prensas: 'Prensas', lotes: 'Lotes', guia: 'Guía' };
const ESTADOS = { pendiente: ['Pendiente', 'aviso'], ejecutada: ['Ejecutada', 'ok'], anulada: ['Anulada', 'neutro'] };
const MSG_ERROR = 'No se pudo cargar la lista de órdenes. Probá recargar.';

let _ordenes = null;          // null = cargando
let _error = false;           // la carga falló: se dice en la página
let _estado = estadoDeURL(location.search);
let _sel = 0;                 // tipo resaltado en Nueva orden
let _qNueva = '';             // lo tipeado en Nueva orden (no va a la URL)

const aqui = () => location.pathname + location.search;
const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const fmtFecha = f => /^\d{4}-\d{2}-\d{2}/.test(f || '') ? f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4) : (f || '');

/** El estado de ir a la vista v: Pendientes ↔ Historial conservan filtros y
 *  orden; el resto arranca limpio. En Pendientes no hay filtro de Estado. */
function estadoPara(v){
  const esLista = x => x === 'pendientes' || x === 'historial';
  const base = { ...ESTADO_LIMPIO, v };
  if (esLista(v) && esLista(_estado.v)) for (const k of [...FILTROS, 'orden']) base[k] = _estado[k];
  if (v === 'pendientes') base.est = '';
  return base;
}

function ir(cambios, { reemplazar = false } = {}){
  _estado = { ..._estado, ...cambios };
  const url = location.pathname + urlDeEstado(_estado);
  history[reemplazar ? 'replaceState' : 'pushState'](null, '', url);
  pintar();
}

/* Los enlaces internos (tarjetas y sub-nav) son <a href> de verdad, para que
 * funcionen el clic del medio y "abrir en otra pestaña"; el clic común no
 * recarga: cambia la vista con pushState. */
function cablearIr(raiz){
  raiz.querySelectorAll('a[data-ir]').forEach(a => a.addEventListener('click', e => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    ir(estadoPara(a.dataset.ir));
  }));
}

/** Las vistas que ve esta persona: un lector no ve «Nueva orden». */
function vistas(){
  const v = [];
  if (modulosEditables().length) v.push(['nueva', 'Nueva orden']);
  v.push(['pendientes', 'Pendientes'], ['historial', 'Historial'], ['guia', 'Guía de trabajos']);
  return v;
}

function pintarNav(){
  const nav = $('ordNav');
  if (!_estado.v){ nav.innerHTML = ''; return; }
  const enlaces = vistas().map(([v, nombre]) =>
    `<a href="${esc(location.pathname + urlDeEstado(estadoPara(v)))}" data-ir="${v}"${v === _estado.v ? ' aria-current="page"' : ''}>${esc(nombre)}</a>`);
  nav.innerHTML = `<nav class="ord-nav" aria-label="Secciones de órdenes">` +
    `<a href="${esc(location.pathname)}" data-ir="">← Inicio</a>` +
    enlaces.join('') +   // los «·» entre enlaces los pone el CSS (.ord-nav a + a::before)
    `</nav>`;
  cablearIr(nav);
}

function pintarPortada(){
  const n = _ordenes ? contarPendientes(_ordenes) : null;
  const conteo = _error ? '—' : n === null ? '…' : n === 1 ? '1 pendiente' : n + ' pendientes';
  const tarjetas = [];
  if (modulosEditables().length) tarjetas.push(['nueva', 'Nueva orden', 'Emití una orden de trabajo', 'Empezar →']);
  tarjetas.push(['pendientes', 'Pendientes', 'Órdenes emitidas que falta ejecutar', conteo]);
  tarjetas.push(['historial', 'Historial', 'Órdenes ejecutadas y anuladas', 'Ver →']);
  tarjetas.push(['guia', 'Guía de trabajos', 'Las tareas del día para la bodega, con lo pendiente', 'Abrir →']);
  $('ordCuerpo').innerHTML =
    `<ul class="ord-portada" style="--n:${tarjetas.length}">` +
    tarjetas.map(([v, nm, ds, rl]) =>
      `<li><a class="ord-tarj" href="${esc(location.pathname + urlDeEstado({ v }))}" data-ir="${v}">` +
      `<span class="ord-nm">${esc(nm)}</span><span class="ord-ds">${esc(ds)}</span>` +
      `<span class="ord-rl">${esc(rl)}</span></a></li>`).join('') +
    `</ul>` +
    (_error ? `<p class="ord-msg">${esc(MSG_ERROR)}</p>` : '');
  cablearIr($('ordCuerpo'));
}

/* ---------- Nueva orden ---------- */

function pintarNueva(){
  const cuerpo = $('ordCuerpo');
  if (!modulosEditables().length){
    cuerpo.innerHTML = `<p class="ord-msg">Solo podés consultar órdenes.</p>`;
    return;
  }
  cuerpo.innerHTML =
    `<label class="ord-sr" for="ordBusca">Buscar el tipo de orden</label>` +
    `<input type="search" id="ordBusca" class="ord-busca" placeholder="¿Qué orden vas a hacer?" autocomplete="off" ` +
    `aria-describedby="ordBuscaAyuda" value="${esc(_qNueva)}">` +
    `<p class="ord-ayuda" id="ordBuscaAyuda">↑ ↓ para elegir · Enter para abrir · / o Ctrl+K para volver acá</p>` +
    `<div id="ordTipos"></div>`;
  const inp = $('ordBusca');
  inp.addEventListener('input', () => { _qNueva = inp.value; _sel = 0; pintarTipos(); });
  inp.addEventListener('keydown', e => {
    const tipos = [...document.querySelectorAll('#ordTipos .ord-tipo')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      e.preventDefault();
      if (!tipos.length) return;
      _sel = (_sel + (e.key === 'ArrowDown' ? 1 : -1) + tipos.length) % tipos.length;
      marcarSel(tipos);
    } else if (e.key === 'Enter'){
      e.preventDefault();
      const t = tipos[_sel] || tipos[0];
      if (t) location.href = t.href;
    }
  });
  pintarTipos();
  inp.focus();
}

function marcarSel(tipos){
  tipos.forEach((a, i) => a.classList.toggle('on', i === _sel));
  tipos[_sel]?.scrollIntoView({ block: 'nearest' });
}

function pintarTipos(){
  const caja = $('ordTipos');
  if (!caja) return;
  const tipos = buscarTipos(_qNueva, modulosEditables());
  if (!tipos.length){
    caja.innerHTML = `<p class="ord-msg">Ningún tipo de orden con «${esc(_qNueva.trim())}».</p>`;
    return;
  }
  if (_sel >= tipos.length) _sel = 0;
  const volver = aqui();
  // Una columna por módulo, en el orden de MODULOS; la que no tiene tipos no se dibuja.
  caja.innerHTML = `<div class="ord-cols">` + MODULOS.map(m => {
    const deM = tipos.filter(t => t.modulo === m);
    if (!deM.length) return '';
    return `<section class="ord-col"><h2>${esc(NOMBRE_MOD[m])}</h2><ul>` +
      deM.map(t => `<li><a class="ord-tipo" href="${esc(urlNueva(t, volver))}">` +
        `<b>${esc(t.nombre)}</b><span>${esc(t.desc)}</span></a></li>`).join('') +
      `</ul></section>`;
  }).join('') + `</div>`;
  marcarSel([...caja.querySelectorAll('.ord-tipo')]);
}

/* ---------- Pendientes / Historial ----------
 * Los filtros son embudos ▾ en los títulos (embudo.js) y el orden es clic en
 * el título: ▲ → ▼ → el de siempre (fecha, la más nueva arriba). */

/* Las columnas: título, clave de orden y su embudo (k = clave de filtro). */
const COLUMNAS = [
  { tit: 'N°', orden: 'numero', emb: { k: 'n', clase: 'texto' } },
  { tit: 'Tipo', orden: 'tipo', emb: { k: 'tipo', clase: 'casillas' } },
  { tit: 'Fecha', orden: 'fecha', emb: { k: 'fecha', clase: 'fechas' } },
  { tit: 'Lotes', orden: 'lotes', emb: { k: 'lote', clase: 'casillas' } },
  { tit: 'Estado', orden: 'estado', emb: { k: 'est', clase: 'casillas', soloHistorial: true } },
  { tit: 'Emitió', orden: 'emitio', emb: { k: 'emitio', clase: 'casillas' } },
];

const deLaVista = () => filtrar(_ordenes || [], { vista: _estado.v });

/* Cada cambio de filtro u orden reemplaza la URL (no apila historial) y
 * repinta solo la tabla: el embudo abierto sigue abierto. */
function cambiarFiltro(cambios){
  _estado = { ..._estado, ...cambios };
  history.replaceState(null, '', location.pathname + urlDeEstado(_estado));
  pintarTabla();
}

function pintarLista(){
  cerrarEmbudo();
  $('ordCuerpo').innerHTML = `<div id="ordTabla"></div>`;
  pintarTabla();
}

/* El texto de un tipo en el embudo: con rol en los dos módulos, dice de cuál. */
function textoTipo(clave, conMod){
  const [m, t] = clave.includes(':') ? clave.split(':') : ['', clave];
  return (conMod && m ? (NOMBRE_MOD[m] || m) + ' · ' : '') + nombreDeTipo(t);
}

function cfgEmbudo(col){
  const k = col.emb.k;
  const base = { clase: col.emb.clase, titulo: col.tit };
  if (k === 'n') return { ...base, valor: _estado.n, alCambiar: v => cambiarFiltro({ n: v }) };
  if (k === 'fecha') return { ...base, desde: _estado.desde, hasta: _estado.hasta, alCambiar: c => cambiarFiltro(c) };
  const deVista = deLaVista();
  const conMod = conEtiquetaModulo(deVista, modulosConRol());
  // Los valores de la lista, y los elegidos aunque ya no aparezcan.
  const vals = [...new Set(opcionesDe(deVista, k).concat(lista(_estado[k])))];
  const txt = k === 'tipo' ? v => textoTipo(v, conMod) : k === 'est' ? v => (ESTADOS[v] || [v])[0] : v => v;
  const opciones = vals.map(v => ({ val: v, txt: txt(v) }));
  if (k === 'tipo') opciones.sort((a, b) => a.txt.localeCompare(b.txt, 'es'));
  return { ...base, opciones, elegidos: lista(_estado[k]), alCambiar: xs => cambiarFiltro({ [k]: unirLista(xs) }) };
}

const filtroActivo = k => k === 'fecha' ? !!(_estado.desde || _estado.hasta) : !!_estado[k];

function encabezado(v){
  const [ordCol, ordDir] = (_estado.orden || '').split('-');
  return `<thead><tr>` + COLUMNAS.map(c => {
    const dir = ordCol === c.orden ? ordDir : '';
    const aria = dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none';
    const emb = c.emb.soloHistorial && v !== 'historial' ? '' :
      `<button type="button" class="ord-emb${filtroActivo(c.emb.k) ? ' on' : ''}" data-emb="${c.emb.k}" ` +
      `aria-haspopup="dialog" aria-expanded="false" aria-label="Filtrar ${esc(c.tit)}" ` +
      `title="Filtrar ${esc(c.tit)}">▾</button>`;
    return `<th scope="col" aria-sort="${aria}"><span class="ord-th">` +
      `<button type="button" class="ord-ord" data-orden="${c.orden}" title="Ordenar por ${esc(c.tit)}">` +
      `${esc(c.tit)}<span class="ord-flecha" aria-hidden="true">${dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : ''}</span></button>` +
      emb + `</span></th>`;
  }).join('') + `</tr></thead>`;
}

function celdaLotes(o){
  const lotes = o.lotes || [];
  if (o.lote_corte) return esc(o.lote_corte) + ` <span class="ord-mas">(corte de ${lotes.length} lote${lotes.length === 1 ? '' : 's'})</span>`;
  const vis = lotes.slice(0, 4).map(esc).join(', ');
  return vis + (lotes.length > 4 ? ` <span class="ord-mas">+${lotes.length - 4}</span>` : '');
}

function pintarTabla(){
  const caja = $('ordTabla');
  if (!caja) return;
  const v = _estado.v;
  if (_ordenes === null){ caja.innerHTML = `<p class="ord-msg">Cargando órdenes…</p>`; return; }
  if (_error){ caja.innerHTML = `<p class="ord-msg">${esc(MSG_ERROR)}</p>`; return; }
  const total = deLaVista().length;
  const filas = ordenar(filtrar(_ordenes, { ..._estado, vista: v }), _estado.orden, { nombre: nombreDeTipo });
  const filtrado = hayFiltros(_estado);
  // Pendientes e Historial: con rol en los dos módulos, cada fila dice de cuál.
  const conMod = conEtiquetaModulo(filas, modulosConRol());
  const h = hoy(), volver = aqui();
  const cuerpo = filas.length ? filas.map(o => {
    const [estTxt, estCls] = ESTADOS[o.estado] || [o.estado, 'neutro'];
    const prog = o.estado === 'pendiente' && String(o.fecha || '') > h;
    return `<tr class="ord-fila">` +
      `<td><a class="ord-abrir" href="${esc(urlAbrir(o, volver))}">${esc(o.numero || '—')}</a></td>` +
      `<td>${conMod ? `<span class="ci-pill neutro ord-mod">${esc(NOMBRE_MOD[o.modulo] || o.modulo)}</span>` : ''}${esc(nombreDeTipo(o.tipo))}</td>` +
      `<td>${prog ? '<span title="Programada">📅</span> ' : ''}${esc(fmtFecha(o.fecha))}${prog ? '<span class="ord-sr"> (programada)</span>' : ''}</td>` +
      `<td>${celdaLotes(o)}</td>` +
      `<td><span class="ci-pill ${estCls}">${esc(estTxt)}</span></td>` +
      `<td>${esc(o.emitio)}</td>` +
      `</tr>`;
  }).join('') : `<tr><td colspan="${COLUMNAS.length}" class="ord-vacia">${filtrado
      ? 'Ninguna orden con estos filtros.'
      : v === 'historial' ? 'Todavía no hay órdenes en el historial.' : 'No hay órdenes pendientes.'}</td></tr>`;
  // Los títulos (y sus embudos) quedan aunque no haya filas: hay que poder sacar el filtro.
  caja.innerHTML =
    `<div class="ord-resumen" aria-live="polite"><span>${filtrado
      ? `${filas.length} de ${total} ${total === 1 ? 'orden' : 'órdenes'}`
      : `${total} ${total === 1 ? 'orden' : 'órdenes'}`}</span>` +
    (filtrado ? `<button type="button" class="ord-limpiar" data-limpiar>Limpiar filtros</button>` : '') +
    `</div>` +
    `<div class="ord-tabla-caja"><table class="ci-tabla ord-tabla">` +
    `<caption class="ord-sr">${v === 'historial' ? 'Historial de órdenes' : 'Órdenes pendientes'}: ${filas.length}</caption>` +
    encabezado(v) + `<tbody>${cuerpo}</tbody></table></div>`;
  reanclarEmbudo(caja);
}

/* Un solo listener para la tabla (se repinta entera en cada cambio). */
document.addEventListener('click', e => {
  const caja = $('ordTabla');
  if (!caja || !caja.contains(e.target)) return;
  const emb = e.target.closest('[data-emb]');
  if (emb){
    const col = COLUMNAS.find(c => c.emb.k === emb.dataset.emb);
    if (col) alternarEmbudo(emb, cfgEmbudo(col));
    return;
  }
  const ord = e.target.closest('[data-orden]');
  if (ord){
    // ▲ → ▼ → sin orden (el de siempre).
    const [col, dir] = (_estado.orden || '').split('-');
    const k = ord.dataset.orden;
    cambiarFiltro({ orden: col !== k ? k + '-asc' : dir === 'asc' ? k + '-desc' : '' });
    $('ordTabla')?.querySelector(`[data-orden="${k}"]`)?.focus();
    return;
  }
  if (e.target.closest('[data-limpiar]')){
    cerrarEmbudo();
    cambiarFiltro(Object.fromEntries(FILTROS.map(k => [k, ''])));
  }
});

/* ---------- Armado ---------- */

function pintar(){
  pintarNav();
  if (!_estado.v) return pintarPortada();
  if (_estado.v === 'nueva') return pintarNueva();
  // Una guía ya impresa (Ver desde el Historial) se abre de solo lectura.
  if (_estado.v === 'guia' && _estado.impresa) return montarImpresa($('ordCuerpo'), { id: _estado.impresa });
  if (_estado.v === 'guia') return montarGuia($('ordCuerpo'), { volver: aqui() });
  return pintarLista();
}

document.addEventListener('keydown', e => {
  // La guía tiene texto editable en <div contenteditable>, no en INPUT/TEXTAREA:
  // sin esto, escribir una fecha ("04/11") o "1/2 barril" ahí mandaba a Nueva orden.
  const enCampo = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
  if ((e.key === '/' && !enCampo) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')){
    if (!modulosEditables().length) return;   // un lector no tiene buscador de tipos
    e.preventDefault();
    if (_estado.v !== 'nueva') ir(estadoPara('nueva'));
    $('ordBusca')?.focus();
  }
});
window.addEventListener('popstate', () => { _estado = estadoDeURL(location.search); pintar(); });

(async function arrancar(){
  // Un lector que entra con ?v=nueva va a la portada: no puede emitir.
  if (_estado.v === 'nueva' && !modulosEditables().length){
    _estado.v = '';
    history.replaceState(null, '', location.pathname + urlDeEstado(_estado));
  }
  pintar();
  try {
    const r = await fetch('/ordenes/api/lista');
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json();
    _ordenes = j.ordenes || [];
    if (j.modulos) CIW.modulos = j.modulos;
  } catch (_) {
    _ordenes = [];
    _error = true;
    window.CI?.avisar?.(MSG_ERROR, { tipo: 'mal' });
  }
  // Nueva orden y la Guía no dependen de la lista: no se repintan de nuevo.
  if (_estado.v === 'nueva' || _estado.v === 'guia') return;
  // En una lista solo cambia la tabla (los embudos toman los valores al abrirse).
  pintarTabla();
})();
