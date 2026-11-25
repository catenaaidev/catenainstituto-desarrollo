/* ===== Lotes CIW — Correcciones → Otros agregados =====
 *
 * TH2, quitosano, levaduras, nutrientes... todo lo que se agrega a un lote y no
 * es SO2. Tres vistas:
 *   - Bitacora (la unica en la pestaña de siempre): todo lo registrado, con
 *     anular (nunca se borra).
 *   - Armar orden (solo en modo ordenes, /lotes/?orden=nueva:agregados):
 *     tarjetas por lote con producto + cantidad + unidad (como el generador
 *     local generar_OT_v3.py) y papel RCI 08 formato B015. Al imprimir, la
 *     orden se guarda pendiente en ordenes_hojas con lo que salio en el papel;
 *     al marcarla ejecutada se anota cada agregado en analisis.agregados del
 *     lote (agregados.js / ordenes-hojas.js) y por lo tanto en Analisis.
 *   - Orden guardada (modo ordenes, ?orden=<id>): cabecera + papel, solo
 *     lectura.
 *
 * El borrador de la orden vive en memoria mientras la pagina este abierta. */
'use strict';

import { $, esc, escA, DATOS, markDirty, guardar, mostrarTab, registrarVista, usuarioActual, irALote } from './nucleo.js';
import { avisar, confirmar } from './dialogos.js';
import { armarOrdenHoja, ordenHojaPorId } from './ordenes-hojas.js';
import { htmlCabeceraOrden, cablearCabeceraOrden, guardarOrdenHojaConfirmando } from './vista-orden-guardada.js';
import { pintarHojas } from './orden-hoja.js';
import { fmtFecha } from './fechas.js';
import { visible } from './selector-anios.js';
import { proponerNumero, chipCarpeta, cablearChipsCarpeta, imprimirYGuardar } from './guardar-ot.js';
import { normalizarNumero } from './numero-ot.js';
import { AGREGADOS_COMUNES, PLANTILLAS, UNIDADES, normalizarItem,
         anularAgregado, esAgregadoAnulado, filasBitacora, sugerirOT, cantidadTexto,
         filasPapelAgregados, filaPapelAgregado, COLUMNAS_PAPEL_AG, COLGROUP_PAPEL_AG,
         THEAD_PAPEL_AG, vasijasDeLote, litrosReferencia, resumenVasijas,
         registroDeTarjetas } from './agregados.js';

/* Lo que se anota al ejecutar: es pura y vive en agregados.js, porque este
 * archivo importa nucleo.js (toca el DOM) y no se puede testear. */
export { registroDeTarjetas };

const _hoyISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

/* El buscador sobrevive al F5 en esta pestaña (shared/filtros-sesion.js). La
 * sub-pestaña no: fuera del modo órdenes solo existe 'bitacora'. */
const _FS = typeof window !== 'undefined' && window.CIWFiltros;
const _lf = (k, d) => _FS ? _FS.leer('lotes:agregados:' + k, d) : d;
const _gf = (k, v) => { if (_FS) _FS.guardar('lotes:agregados:' + k, v); };
let _sub = 'bitacora';       // 'armar' (solo en modo ordenes) | 'bitacora'
/* Modo ordenes: _unica = una sola vista, sin selector (como vista-movimientos).
 * _guardada = id de una orden de ordenes_hojas abierta en solo lectura. */
let _unica = false;
let _guardada = null;
let _busca = (v => typeof v === 'string' ? v : '')(_lf('busca', ''));
let _sigId = 1;
const _itemVacio = () => ({ producto: '', cantidad: '', unidad: 'g' });
const _tarjetaVacia = () => ({ id: _sigId++, lote: '', vasija: '', items: [_itemVacio()] });
/* otTocada: el numero quedo fijo (lo escribio el usuario, o ya se imprimio o
 * registro con el). otRespaldo: el numero es el de sugerirOT, todavia sin
 * mirar la carpeta. */
let _b = { fecha: _hoyISO(), ot: '', otTocada: false, otRespaldo: false, emitio: '', recibio: '', tarjetas: [_tarjetaVacia()] };

/* ---------- lotes ---------- */
function _loteDe(numero){
  const L = String(numero ?? '').trim();
  if (!L) return null;
  return (DATOS().lotes || []).find(l => String(l.lote ?? '').trim() === L) || null;
}

function _badges(t){
  const l = _loteDe(t.lote);
  if (!t.lote) return '';
  if (!l) return '<span class="ag-badge err">No encontrado</span>';
  return [l.variedad, l.proyecto].filter(Boolean).map(x => `<span class="ag-badge">${esc(x)}</span>`).join('');
}

/* ---------- barriles del Mapa ----------
 * La dosis se carga POR VASIJA y el papel sale con un renglon por barril, asi
 * que hacen falta los barriles llenos de cada lote. Se piden al Mapa al salir
 * del lote (para mostrar el resumen en la tarjeta) y de nuevo al imprimir y al
 * registrar, para no usar un Mapa viejo. null = el Mapa no respondio: se sigue
 * con los envases del lote, sin numeros. */
const _barriles = new Map();   // lote -> [barriles] | null
let _mapaFallo = false;

async function _cargarBarriles(lotes){
  const L = [...new Set(lotes.map(x => String(x ?? '').trim()).filter(Boolean))];
  if (!L.length) return;
  try {
    const r = await fetch(API + '/barriles?lotes=' + encodeURIComponent(L.join(',')));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const por = (await r.json()).por_lote || {};
    L.forEach(l => _barriles.set(l, por[l] || []));
    _mapaFallo = false;
  } catch (e){
    L.forEach(l => { if (!_barriles.has(l)) _barriles.set(l, null); });
    _mapaFallo = true;
  }
}

function _vasijasDe(t){
  const L = String(t.lote ?? '').trim();
  return vasijasDeLote(_loteDe(L), _barriles.get(L) || null, t.vasija);
}

function _resumenTarjeta(t){
  const L = String(t.lote ?? '').trim();
  if (!L || !_barriles.has(L)) return '';
  const v = _vasijasDe(t);
  const ref = litrosReferencia(v);
  const sinNum = v.filter(x => x.tipo === 'sin_num').length;
  return esc(resumenVasijas(v) || '1 vasija') +
    (v.length > 1 && ref ? ' · cantidad por vasija de ' + ref + ' L' : '') +
    (sinNum ? ` · <span title="El lote declara más envases que los barriles llenos del Mapa">${sinNum} sin número en el Mapa</span>` : '') +
    (_barriles.get(L) === null ? ' · Mapa de Barriles no disponible' : '');
}

/* ---------- render ----------
 * Sin selector de sub-pestañas: fuera del modo ordenes la pestaña es solo la
 * Bitacora; en modo ordenes (_unica) es solo Armar, o la orden guardada. */

function _htmlTarjeta(t){
  const filas = t.items.map((it, j) => `<tr data-item="${j}">
      <td><input class="txt ag-prod" list="agProductos" data-f="producto" value="${escA(it.producto)}" placeholder="Producto (TH2, Quitosano…)"></td>
      <td><input class="txt ag-cant num" data-f="cantidad" value="${escA(it.cantidad)}" placeholder="cant." inputmode="decimal"></td>
      <td><select data-f="unidad">${UNIDADES.map(u => `<option${u === it.unidad ? ' selected' : ''}>${u}</option>`).join('')}</select></td>
      <td><button type="button" class="rowbtn" data-quitar-item="${j}" title="Quitar este producto">✕</button></td>
    </tr>`).join('');
  return `<div class="ag-card" data-tarjeta="${t.id}">
    <div class="ag-card-head">
      <div><span class="ag-lbl">CIW Lote</span><input class="txt ag-lote" list="agLotes" data-f="lote" value="${escA(t.lote)}" placeholder="26150"></div>
      <div><span class="ag-lbl">Vasija</span><input class="txt ag-vasija" data-f="vasija" value="${escA(t.vasija)}" placeholder="Vasija"></div>
      <span class="ag-badges">${_badges(t)}</span>
      <span class="ag-vasijas">${_resumenTarjeta(t)}</span>
      <div class="spacer" style="flex:1"></div>
      <button type="button" class="btn" data-dup title="Otra tarjeta con el mismo lote">⎘ Duplicar</button>
      <button type="button" class="btn danger" data-quitar-tarjeta title="Quitar este lote de la orden">✕</button>
    </div>
    <div class="ag-card-body">
      <div class="scroll-x"><table><thead><tr><th>Agregado</th><th title="Por vasija: las de otros litros llevan la dosis proporcional">Cantidad por vasija</th><th>Unidad</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>
      <button type="button" class="btn" data-agregar-item style="margin-top:4px">+ Producto</button>
    </div>
    <div class="ag-tpl">Plantillas: ${PLANTILLAS.map(p => `<button type="button" data-tpl="${p.clave}">+ ${esc(p.nombre)}</button>`).join('')}</div>
  </div>`;
}

function _htmlArmar(){
  if (!_b.otTocada && !_b.ot){ _b.ot = sugerirOT(DATOS().analisis); _b.otRespaldo = true; }
  const lotes = (DATOS().lotes || []).filter(l => visible(l.lote));
  return `
<div class="card">
  <h2>Orden de agregados</h2>
  <div class="ag-grid">
    <div><label for="agFecha">Fecha</label><input class="txt" type="date" id="agFecha" data-g="fecha" value="${escA(_b.fecha)}"></div>
    <div><label for="agOT">N° de OT</label><input class="txt" id="agOT" data-g="ot" value="${escA(_b.ot)}" placeholder="B232"> ${chipCarpeta('B')}</div>
    <div><label for="agEmitio">Emitió</label><input class="txt" id="agEmitio" data-g="emitio" value="${escA(_b.emitio)}" placeholder="Quién emite"></div>
    <div><label for="agRecibio">Recibió</label><input class="txt" id="agRecibio" data-g="recibio" value="${escA(_b.recibio)}" placeholder="Quién recibe"></div>
  </div>
  <div id="agTarjetas">${_b.tarjetas.map(_htmlTarjeta).join('')}</div>
  <button type="button" class="ag-add-lote" data-agregar-tarjeta>+ Agregar lote</button>
  <div class="toolbar">
    <button type="button" class="btn" data-limpiar>🧹 Orden nueva</button>
    <div class="spacer"></div>
    <button type="button" class="btn primary" data-imprimir title="Al imprimir, la orden queda pendiente; al marcarla ejecutada se anotan los agregados en Análisis">🖨️ Imprimir</button>
  </div>
  <div id="agMsg" style="margin-top:10px"></div>
</div>
<datalist id="agProductos">${AGREGADOS_COMUNES.map(p => `<option value="${escA(p)}">`).join('')}</datalist>
<datalist id="agLotes">${lotes.map(l => `<option value="${escA(String(l.lote ?? ''))}">${esc(l.variedad || '')}</option>`).join('')}</datalist>
<div id="agPaginas" style="display:none"></div>`;
}

function _filasBitacoraVisibles(){
  const q = _busca.toLowerCase();
  return filasBitacora(DATOS().analisis).filter(f => {
    if (!visible(f.lote)) return false;
    if (!q) return true;
    const ag = f.agregado;
    return [f.lote, ag.producto, ag.ot_n].some(v => String(v ?? '').toLowerCase().includes(q));
  });
}

function _htmlBitacora(){
  const filas = _filasBitacoraVisibles();
  const cuerpo = filas.map((f, i) => {
    const ag = f.agregado, l = _loteDe(f.lote) || {};
    const anulada = esAgregadoAnulado(ag);
    const acc = anulada
      ? `<span class="so2-anulada-sello" title="${escA(String(ag.anulada.en || ''))}">anulado por ${esc(ag.anulada.por || '?')}</span>`
      : `<button type="button" class="btn" data-anular="${i}" title="Se tacha y queda en la bitácora">↩ Anular</button>`;
    return `<tr${anulada ? ' class="ag-anulada"' : ''}>
      <td>${esc(fmtFecha(f.fecha) || f.fecha)}</td>
      <td><button class="alarm-lote-link" data-iralote="${escA(f.lote)}">${esc(f.lote)}</button></td>
      <td>${esc(l.variedad || '')}</td><td>${esc(l.vasija_actual || '')}</td>
      <td><b>${esc(ag.producto)}</b></td><td class="num">${esc(cantidadTexto(ag))}${ag.dosis_vasija != null
        ? `<div style="font-size:11px;color:var(--muted)">${esc(cantidadTexto({ cantidad: ag.dosis_vasija, unidad: ag.unidad }))} por vasija de ${esc(ag.litros_ref || '?')} L · ${esc(ag.vasijas)} vasijas</div>` : ''}</td>
      <td>${esc(ag.ot_n || '')}</td><td>${esc(ag.registrado_por || '')}</td>
      <td class="ag-acc">${acc}</td></tr>`;
  }).join('');
  return `
<div class="card">
  <h2>Bitácora de otros agregados</h2>
  <div class="toolbar">
    <input class="txt" id="agBusca" placeholder="🔎 Buscar por lote, producto u OT…" style="min-width:220px" value="${escA(_busca)}">
    <span class="tag">${filas.length} renglones</span>
  </div>
  <div class="scroll tall">
    <table id="agBitacora">
      <thead><tr><th>Fecha</th><th>Lote</th><th>Variedad</th><th>Vasija</th><th>Agregado</th>
        <th class="num">Cantidad</th><th>N° OT</th><th>Registró</th><th></th></tr></thead>
      <tbody>${cuerpo || '<tr><td colspan="9" class="c" style="padding:18px;color:var(--muted)">Todavía no hay agregados registrados.</td></tr>'}</tbody>
    </table>
  </div>
</div>`;
}

export function renderAgregados(){
  const sec = $('tab-agregados'); if (!sec) return;
  if (!sec._wired){ sec._wired = true; _cablear(sec); }
  if (_guardada){ _pintarGuardada(sec); return; }
  if (!_unica) _sub = 'bitacora';
  sec.innerHTML = _sub === 'armar' ? _htmlArmar() : _htmlBitacora();
  if ($('agOT')) _cablearNumero();
}

/** Modo ordenes: Nueva · Otros agregados (solo Armar, sin selector). */
export function abrirAgregadosNueva(){
  _guardada = null; _unica = true; _sub = 'armar';
  mostrarTab('agregados');
}

/** Modo ordenes: una orden de agregados ya guardada, en solo lectura. */
export function abrirAgregadosGuardada(id){
  _guardada = id; _unica = true;
  mostrarTab('agregados');
}

/* ---------- orden guardada (solo lectura) ----------
 * Cabecera (estado, ejecutar, anular, reimprimir) + el papel armado desde
 * orden.hoja con las vasijas congeladas al imprimir: lo que se ve es lo que
 * salio. Las dos piezas son hijas directas de #tab-agregados: asi
 * printing-agregados esconde la cabecera y deja solo #agPaginas, que en
 * pantalla queda visible porque aca no lleva display:none. */
function _reimprimir(){
  document.body.classList.add('printing-agregados');
  try { window.print(); }
  finally { document.body.classList.remove('printing-agregados'); }
}

function _pintarGuardada(sec){
  const o = ordenHojaPorId(DATOS(), _guardada);
  if (!o){
    sec.innerHTML = '<div class="msg info" style="margin-top:10px">Esta orden no existe (¿la borraron?)</div>';
    return;
  }
  const puedeEditar = ['editor', 'admin'].includes((window.CIW || {}).rol);
  sec.innerHTML = `<div id="agGuardadaCab">${htmlCabeceraOrden(o, { puedeEditar })}</div><div id="agPaginas"></div>`;
  const h = o.hoja || {};
  const vpt = h.vasijasPorTarjeta || {};
  const pag = $('agPaginas');
  pag.innerHTML = _papel({ ...h, fecha: h.fecha || o.fecha, ot: h.ot || o.ot }, t => vpt[t.id] || []);
  /* el papel B015 no trae campos, pero por las dudas: nada editable */
  pag.querySelectorAll('input, textarea, select').forEach(i => { i.disabled = true; });
  cablearCabeceraOrden($('agGuardadaCab'), o.id, { reimprimir: _reimprimir, alCambiar: () => renderAgregados() });
}

/* El papel B015: el mismo armado para imprimir y para la guardada. */
function _papel(h, vasijasDe){
  const fecha = String(h.fecha || '');
  const p = fecha.split('-');
  return pintarHojas({
    filas: filasPapelAgregados(h.tarjetas || [], vasijasDe),
    titulo: 'Orden de Trabajo — Agregados',
    meta: { fechaTxt: p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : fecha, anio: p.length === 3 ? p[0] : '', nro: h.ot || '' },
    banda: ['AGREGADOS', '', 'Bodega'],
    emitio: h.emitio || '', recibio: h.recibio || '',
    colgroup: COLGROUP_PAPEL_AG,
    thead: THEAD_PAPEL_AG,
    columnas: COLUMNAS_PAPEL_AG,
    textoVacio: '',
    renderFila: filaPapelAgregado,
  });
}

/* N° de OT: el siguiente de la serie B de la carpeta de OT. El de sugerirOT
 * queda de respaldo. renderAgregados corre en cada cambio de sub-pestaña: el
 * render solo propone si la orden todavia no tiene numero propuesto (vacio o
 * el de respaldo); al conectar la carpeta se vuelve a proponer mientras el
 * numero no se haya escrito, impreso ni registrado (otTocada). El campo se
 * rehace en cada render, asi que el chip se cablea cada vez. */
function _cablearNumero(){
  const sembrarAg = (alConectar) => proponerNumero('B').then(p => {
    if (_b.otTocada) return;
    if (!alConectar && _b.ot && !_b.otRespaldo) return;
    _b.ot = p.numero; _b.otRespaldo = false;
    if ($('agOT')) $('agOT').value = p.numero;
  });
  sembrarAg(false);
  cablearChipsCarpeta($('agOT').parentElement, () => sembrarAg(true));
}

/* ---------- eventos (delegados en la seccion, una sola vez) ---------- */
function _tarjetaDe(el){
  const card = el.closest('[data-tarjeta]');
  if (!card) return null;
  return _b.tarjetas.find(t => t.id === +card.dataset.tarjeta) || null;
}

function _repintarTarjetas(){
  const cont = $('agTarjetas');
  if (cont) cont.innerHTML = _b.tarjetas.map(_htmlTarjeta).join('');
}

function _cablear(sec){
  sec.addEventListener('input', e => {
    const el = e.target;
    if (el.id === 'agBusca'){
      _busca = el.value.trim();
      _gf('busca', _busca);
      const pos = el.selectionStart;
      renderAgregados();
      const nuevo = $('agBusca');
      if (nuevo){ nuevo.focus(); nuevo.setSelectionRange(pos, pos); }
      return;
    }
    if (el.dataset.g){
      _b[el.dataset.g] = el.value;
      if (el.dataset.g === 'ot') _b.otTocada = true;
      return;
    }
    const t = _tarjetaDe(el); if (!t || !el.dataset.f) return;
    const tr = el.closest('[data-item]');
    if (tr) t.items[+tr.dataset.item][el.dataset.f] = el.value;
    else t[el.dataset.f] = el.value;
  });

  /* Al salir del lote se completa la vasija (si no la escribieron a mano) y
   * se muestran variedad y proyecto. Se toca solo esa tarjeta: repintar todo
   * le sacaria el foco al campo al que se paso con Tab. */
  sec.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.f === 'unidad'){
      const t = _tarjetaDe(el), tr = el.closest('[data-item]');
      if (t && tr) t.items[+tr.dataset.item].unidad = el.value;
      return;
    }
    if (el.dataset.f !== 'lote') return;
    const t = _tarjetaDe(el); if (!t) return;
    const card = el.closest('[data-tarjeta]');
    const l = _loteDe(t.lote);
    if (l && l.vasija_actual){
      t.vasija = String(l.vasija_actual);
      card.querySelector('.ag-vasija').value = t.vasija;
    }
    card.querySelector('.ag-badges').innerHTML = _badges(t);
    const L = String(t.lote ?? '').trim();
    card.querySelector('.ag-vasijas').innerHTML = L ? 'Buscando barriles…' : '';
    _cargarBarriles([L]).then(() => {
      if (String(t.lote ?? '').trim() === L) card.querySelector('.ag-vasijas').innerHTML = _resumenTarjeta(t);
    });  });

  sec.addEventListener('click', async e => {
    const el = e.target;
    const ir = el.closest('[data-iralote]');
    if (ir){ irALote(ir.dataset.iralote); return; }
    if (el.closest('[data-agregar-tarjeta]')){
      _b.tarjetas.push(_tarjetaVacia()); _repintarTarjetas();
      const ultimo = sec.querySelector('[data-tarjeta]:last-child .ag-lote'); if (ultimo) ultimo.focus();
      return;
    }
    if (el.closest('[data-limpiar]')){
      if (!await confirmar({ titulo: 'Empezar una orden nueva', texto: 'Se borra lo cargado en pantalla. Lo ya impreso queda en Órdenes de trabajo.', si: 'Empezar de cero', no: 'Cancelar', peligro: true })) return;
      _b = { fecha: _hoyISO(), ot: '', otTocada: false, otRespaldo: false, emitio: _b.emitio, recibio: _b.recibio, tarjetas: [_tarjetaVacia()] };
      renderAgregados(); return;
    }
    if (el.closest('[data-imprimir]')){ _imprimir(); return; }
    const an = el.closest('[data-anular]');
    if (an){ _anular(+an.dataset.anular); return; }

    const t = _tarjetaDe(el); if (!t) return;
    if (el.closest('[data-agregar-item]')){ t.items.push(_itemVacio()); _repintarTarjetas(); return; }
    const qi = el.closest('[data-quitar-item]');
    if (qi){
      t.items.splice(+qi.dataset.quitarItem, 1);
      if (!t.items.length) t.items.push(_itemVacio());
      _repintarTarjetas(); return;
    }
    if (el.closest('[data-quitar-tarjeta]')){
      _b.tarjetas = _b.tarjetas.filter(x => x !== t);
      if (!_b.tarjetas.length) _b.tarjetas.push(_tarjetaVacia());
      _repintarTarjetas(); return;
    }
    if (el.closest('[data-dup]')){
      const i = _b.tarjetas.indexOf(t);
      _b.tarjetas.splice(i + 1, 0, { id: _sigId++, lote: t.lote, vasija: t.vasija, items: t.items.map(x => ({ ...x })) });
      _repintarTarjetas(); return;
    }
    const tpl = el.closest('[data-tpl]');
    if (tpl){
      const p = PLANTILLAS.find(x => x.clave === tpl.dataset.tpl); if (!p) return;
      /* La plantilla ocupa primero los renglones vacios, despues agrega. */
      t.items = t.items.filter(it => String(it.producto).trim());
      p.items.forEach(prod => t.items.push({ producto: prod, cantidad: '', unidad: 'g' }));
      _repintarTarjetas(); return;
    }
  });
}

/* ---------- acciones ---------- */
function _msg(html){ const m = $('agMsg'); if (m) m.innerHTML = html; }

function _tarjetasValidas(){
  return _b.tarjetas
    .map(t => ({ t, items: t.items.map(normalizarItem).filter(Boolean) }))
    .filter(x => String(x.t.lote).trim() && x.items.length);
}

async function _imprimir(){
  const cont = $('agPaginas'); if (!cont) return;
  if (!_tarjetasValidas().length){ _msg('<div class="msg err">Cargá al menos un lote con un producto para imprimir.</div>'); return; }
  _msg('<div class="msg">Leyendo los barriles del Mapa…</div>');
  await _cargarBarriles(_b.tarjetas.map(t => t.lote));
  _msg(_mapaFallo ? '<div class="msg err">El Mapa de Barriles no respondió: el papel sale con los envases del lote, sin número de barril.</div>' : '');
  if (!filasPapelAgregados(_b.tarjetas, _vasijasDe).length){ _msg('<div class="msg err">Cargá al menos un lote con un producto para imprimir.</div>'); return; }
  /* Se congela ANTES de imprimir: lo que se guarda (y se anota al ejecutar)
   * son las mismas vasijas que pintaron el papel, aunque el Mapa o las
   * tarjetas cambien mientras está abierto el diálogo de impresión. */
  const foto = _fotoParaGuardar();
  cont.innerHTML = _papel({ fecha: _b.fecha, ot: _b.ot, emitio: _b.emitio, recibio: _b.recibio, tarjetas: _b.tarjetas },
                          t => foto.vasijasPorTarjeta[t.id] || _vasijasDe(t));
  const r = await imprimirYGuardar({
    claseBody: 'printing-agregados', contenedor: cont, serie: 'B',
    numero: _b.ot, titulo: 'OT agregados',
  });
  if (r.numeroLibre){ _b.ot = r.numeroLibre; _b.otTocada = true; if ($('agOT')) $('agOT').value = r.numeroLibre; }
  // Ya impreso con ese numero: queda fijo (un render no lo cambia).
  if (r.ok){
    _b.otTocada = true; _b.otRespaldo = false;
    if (r.numero){ _b.ot = r.numero; if ($('agOT')) $('agOT').value = r.numero; }
    await _trasImprimir(r, foto);
  }
}

/* Despues de imprimir: la orden se guarda pendiente en ordenes_hojas con la
 * foto del papel (tarjetas + vasijas congeladas POR ID DE TARJETA, porque
 * _vasijasDe depende del Mapa y de t.vasija) y el registro que se anota en
 * Analisis al marcarla ejecutada: lo anotado = lo impreso, sin releer el
 * Mapa. Reemplaza al viejo «Registrar en los lotes». En modo ordenes la
 * pantalla pasa a la orden guardada (como _otTrasImprimir en vista-orden.js). */
function _fotoParaGuardar(){
  const fecha = String(_b.fecha || '').trim() || _hoyISO();
  const tarjetas = structuredClone(_tarjetasValidas().map(x => x.t));
  const vasijasPorTarjeta = Object.fromEntries(tarjetas.map(t => [t.id, structuredClone(_vasijasDe(t))]));
  const registro = registroDeTarjetas(tarjetas, t => vasijasPorTarjeta[t.id], fecha);
  return { fecha, tarjetas, vasijasPorTarjeta, registro, emitio: _b.emitio, recibio: _b.recibio };
}

async function _trasImprimir(r, { fecha, tarjetas, vasijasPorTarjeta, registro, emitio, recibio }){
  const numero = normalizarNumero(_b.ot || '', 'B'); // "b 223" -> "B223"
  const hoja = { fecha, ot: numero, emitio, recibio, tarjetas, vasijasPorTarjeta };
  const orden = armarOrdenHoja({
    id: 'oh-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    tipo: 'agregados', numero, fecha,
    quien: usuarioActual(), ahora: new Date().toISOString(),
    lotes: tarjetas.map(t => t.lote), hoja, registro,
  });
  orden.pdf = { nombre: r.nombre, estado: r.guardado };
  /* Otra pendiente con el mismo N°: se pregunta antes de reemplazarla. Al
   * reemplazar, la guardada conserva el id de la anterior (res.id). */
  const res = await guardarOrdenHojaConfirmando(orden);
  if (!res.ok){
    if (res.error === 'ejecutada')
      avisar('La orden ' + numero + ' ya está ejecutada: esta impresión no se guardó como orden nueva.', { tipo: 'mal' });
    else if (res.error === 'pendiente')
      avisar('Esta impresión no se guardó como orden: la ' + numero + ' pendiente quedó como estaba. Conviene imprimirla con otro N°.', { tipo: 'mal' });
    return;
  }
  markDirty();
  const id = res.id;

  let ok;
  try { ok = await guardar(); } catch (_) { ok = false; }

  /* Modo ordenes: la orden ya esta en DATOS (aunque guardar() diga que no
   * hubo red: quedo en el borrador local). La URL pasa a ?orden=<id>
   * (conserva volver) para que F5 la reabra, y la banda se retitula. */
  if (document.body.classList.contains('modo-ordenes')){
    const p = new URLSearchParams(location.search); p.set('orden', id); p.delete('lotes');
    history.replaceState(null, '', location.pathname + '?' + p.toString());
    abrirAgregadosGuardada(id);
    document.dispatchEvent(new CustomEvent('lotes:modo-orden-cambio'));
    if (ok) avisar('✓ La orden ' + numero + ' quedó pendiente. Marcala ejecutada acá cuando esté hecha: ahí se anotan los agregados en Análisis.');
    else avisar('La orden ' + numero + ' quedó guardada en este equipo y se va a subir sola cuando se pueda guardar.', { tipo: 'mal' });
    return;
  }

  _msg(ok
    ? `<div class="msg ok">✓ La orden ${esc(numero)} quedó pendiente en Órdenes de trabajo. Al marcarla ejecutada se anotan los agregados en Análisis.</div>`
    : '<div class="msg err">La orden quedó anotada en este equipo pero NO se guardó todavía: se va a guardar sola cuando vuelva la conexión (o apretá Ctrl+S).</div>');
}

async function _anular(i){
  const f = _filasBitacoraVisibles()[i]; if (!f) return;
  const ag = f.agregado;
  if (!await confirmar({ titulo: 'Anular agregado', texto: `${ag.producto} ${cantidadTexto(ag)} del lote ${f.lote} (${fmtFecha(f.fecha)}, OT ${ag.ot_n || '-'}).\n\nNo se borra: queda tachado con tu nombre.`, si: 'Anular', no: 'Cancelar', peligro: true })) return;
  if (anularAgregado(ag, usuarioActual() || 'desconocido', new Date().toISOString())){
    markDirty();
    renderAgregados();
  }
}

registrarVista('agregados', () => renderAgregados());
