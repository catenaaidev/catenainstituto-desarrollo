/* ===== Lotes CIW — Correcciones → Otros agregados =====
 *
 * TH2, quitosano, levaduras, nutrientes... todo lo que se agrega a un lote y no
 * es SO2. Dos vistas:
 *   - Armar orden: tarjetas por lote con producto + cantidad + unidad (como el
 *     generador local generar_OT_v3.py), papel RCI 08 formato B015 y
 *     "Registrar en los lotes", que deja cada agregado en analisis.agregados
 *     del lote (ver agregados.js) y por lo tanto como fila en Analisis.
 *   - Bitacora: todo lo registrado, con anular (nunca se borra).
 *
 * El borrador de la orden vive en memoria mientras la pagina este abierta. */
'use strict';

import { $, esc, escA, DATOS, markDirty, registrarVista, usuarioActual, irALote } from './nucleo.js';
import { pintarHojas } from './orden-hoja.js';
import { fmtFecha } from './fechas.js';
import { visible } from './selector-anios.js';
import { AGREGADOS_COMUNES, PLANTILLAS, UNIDADES, normalizarItem, registrarAgregados,
         anularAgregado, esAgregadoAnulado, filasBitacora, sugerirOT, cantidadTexto,
         filasPapelAgregados, filaPapelAgregado, COLUMNAS_PAPEL_AG, COLGROUP_PAPEL_AG,
         THEAD_PAPEL_AG } from './agregados.js';

const _hoyISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

let _sub = 'armar';          // 'armar' | 'bitacora'
let _busca = '';
let _sigId = 1;
const _itemVacio = () => ({ producto: '', cantidad: '', unidad: 'g' });
const _tarjetaVacia = () => ({ id: _sigId++, lote: '', vasija: '', items: [_itemVacio()] });
let _b = { fecha: _hoyISO(), ot: '', otTocada: false, emitio: '', recibio: '', tarjetas: [_tarjetaVacia()] };

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

/* ---------- render ---------- */
function _selector(){
  const b = (k, txt) => `<button type="button" data-agsub="${k}" role="radio" aria-checked="${_sub === k}"` +
    `${_sub === k ? ' class="on"' : ''}>${txt}</button>`;
  return `<div class="corr-sub" role="radiogroup" aria-label="Vista de Otros agregados" style="margin-left:8px">` +
    b('armar', '📝 Armar orden') + b('bitacora', '📋 Bitácora') + '</div>';
}

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
      <div class="spacer" style="flex:1"></div>
      <button type="button" class="btn" data-dup title="Otra tarjeta con el mismo lote">⎘ Duplicar</button>
      <button type="button" class="btn danger" data-quitar-tarjeta title="Quitar este lote de la orden">✕</button>
    </div>
    <div class="ag-card-body">
      <table><thead><tr><th>Agregado</th><th>Cantidad</th><th>Unidad</th><th></th></tr></thead><tbody>${filas}</tbody></table>
      <button type="button" class="btn" data-agregar-item style="margin-top:4px">+ Producto</button>
    </div>
    <div class="ag-tpl">Plantillas: ${PLANTILLAS.map(p => `<button type="button" data-tpl="${p.clave}">+ ${esc(p.nombre)}</button>`).join('')}</div>
  </div>`;
}

function _htmlArmar(){
  if (!_b.otTocada && !_b.ot) _b.ot = sugerirOT(DATOS().analisis);
  const lotes = (DATOS().lotes || []).filter(l => visible(l.lote));
  return `
<div class="card">
  <h2>Orden de agregados</h2>
  <div class="ag-grid">
    <div><label for="agFecha">Fecha</label><input class="txt" type="date" id="agFecha" data-g="fecha" value="${escA(_b.fecha)}"></div>
    <div><label for="agOT">N° de OT</label><input class="txt" id="agOT" data-g="ot" value="${escA(_b.ot)}" placeholder="B232"></div>
    <div><label for="agEmitio">Emitió</label><input class="txt" id="agEmitio" data-g="emitio" value="${escA(_b.emitio)}" placeholder="Quién emite"></div>
    <div><label for="agRecibio">Recibió</label><input class="txt" id="agRecibio" data-g="recibio" value="${escA(_b.recibio)}" placeholder="Quién recibe"></div>
  </div>
  <div id="agTarjetas">${_b.tarjetas.map(_htmlTarjeta).join('')}</div>
  <button type="button" class="ag-add-lote" data-agregar-tarjeta>+ Agregar lote</button>
  <div class="toolbar">
    <button type="button" class="btn" data-limpiar>🧹 Orden nueva</button>
    <div class="spacer"></div>
    <button type="button" class="btn" data-imprimir>🖨️ Imprimir</button>
    <button type="button" class="btn primary" data-registrar title="Deja cada agregado en el lote: aparece en Análisis y en la bitácora">✔ Registrar en los lotes</button>
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
      <td><b>${esc(ag.producto)}</b></td><td class="num">${esc(cantidadTexto(ag))}</td>
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
  sec.innerHTML = _selector() + (_sub === 'armar' ? _htmlArmar() : _htmlBitacora());
  if (!sec._wired){ sec._wired = true; _cablear(sec); }
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
  });

  sec.addEventListener('click', e => {
    const el = e.target;
    const sub = el.closest('[data-agsub]');
    if (sub){ _sub = sub.dataset.agsub; renderAgregados(); return; }
    const ir = el.closest('[data-iralote]');
    if (ir){ irALote(ir.dataset.iralote); return; }
    if (el.closest('[data-agregar-tarjeta]')){
      _b.tarjetas.push(_tarjetaVacia()); _repintarTarjetas();
      const ultimo = sec.querySelector('[data-tarjeta]:last-child .ag-lote'); if (ultimo) ultimo.focus();
      return;
    }
    if (el.closest('[data-limpiar]')){
      if (!confirm('¿Empezar una orden nueva? Se borra lo que está cargado en pantalla (lo ya registrado queda en los lotes).')) return;
      _b = { fecha: _hoyISO(), ot: '', otTocada: false, emitio: _b.emitio, recibio: _b.recibio, tarjetas: [_tarjetaVacia()] };
      renderAgregados(); return;
    }
    if (el.closest('[data-imprimir]')){ _imprimir(); return; }
    if (el.closest('[data-registrar]')){ _registrar(); return; }
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

function _imprimir(){
  const cont = $('agPaginas'); if (!cont) return;
  const filas = filasPapelAgregados(_b.tarjetas);
  if (!filas.length){ _msg('<div class="msg err">Cargá al menos un lote con un producto para imprimir.</div>'); return; }
  const p = (_b.fecha || '').split('-');
  cont.innerHTML = pintarHojas({
    filas,
    titulo: 'Orden de Trabajo — Agregados',
    meta: { fechaTxt: p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : _b.fecha, anio: p.length === 3 ? p[0] : '', nro: _b.ot },
    banda: ['AGREGADOS', '', 'Bodega'],
    emitio: _b.emitio, recibio: _b.recibio,
    colgroup: COLGROUP_PAPEL_AG,
    thead: THEAD_PAPEL_AG,
    columnas: COLUMNAS_PAPEL_AG,
    textoVacio: '',
    renderFila: filaPapelAgregado,
  });
  document.body.classList.add('printing-agregados');
  window.print();
  document.body.classList.remove('printing-agregados');
}

function _registrar(){
  const ot = String(_b.ot || '').trim();
  const fecha = String(_b.fecha || '').trim();
  if (!ot){ _msg('<div class="msg err">Ingresá el N° de OT: es lo que identifica el agregado en el lote y en Análisis.</div>'); return; }
  if (!fecha){ _msg('<div class="msg err">Ingresá la fecha.</div>'); return; }
  const validas = _tarjetasValidas();
  if (!validas.length){ _msg('<div class="msg err">Cargá al menos un lote con un producto.</div>'); return; }

  const noExisten = validas.filter(x => !_loteDe(x.t.lote)).map(x => String(x.t.lote).trim());
  if (noExisten.length && !confirm('Estos lotes no están en la pestaña Lotes: ' + noExisten.join(', ') +
      '.\n¿Registrar igual?')) return;

  /* Dos tarjetas del mismo lote se juntan: registrarAgregados reemplaza lo de
   * la misma OT, y registrarlas por separado dejaria solo la segunda. */
  const porLote = new Map();
  for (const x of validas){
    const L = String(x.t.lote).trim();
    if (!porLote.has(L)) porLote.set(L, []);
    porLote.get(L).push(...x.items);
  }

  const yaEstaba = [...porLote.keys()].filter(L => (DATOS().analisis || []).some(a =>
    String(a.lote ?? '').trim() === L && a.fecha_analisis === fecha &&
    (a.agregados || []).some(ag => !esAgregadoAnulado(ag) && String(ag.ot_n ?? '').trim() === ot)));
  if (yaEstaba.length && !confirm('La OT ' + ot + ' ya estaba registrada el ' + fmtFecha(fecha) + ' en: ' +
      yaEstaba.join(', ') + '.\nSe reemplaza por lo que está en pantalla. ¿Seguir?')) return;

  if (!DATOS().analisis) DATOS().analisis = [];
  const quien = usuarioActual() || 'desconocido', cuando = new Date().toISOString();
  let n = 0;
  for (const [lote, items] of porLote){
    registrarAgregados(DATOS().analisis, { lote, fecha, items, ot, quien, cuando });
    n += items.length;
  }
  markDirty();
  _msg(`<div class="msg ok">✔ Registrados ${n} agregado${n === 1 ? '' : 's'} en ${porLote.size} lote${porLote.size === 1 ? '' : 's'} (OT ${esc(ot)}). ` +
    'Ya se ven en Análisis y en la Bitácora.</div>');
}

function _anular(i){
  const f = _filasBitacoraVisibles()[i]; if (!f) return;
  const ag = f.agregado;
  if (!confirm(`¿Anular ${ag.producto} ${cantidadTexto(ag)} del lote ${f.lote} (${fmtFecha(f.fecha)}, OT ${ag.ot_n || '-'})?\n\nNo se borra: queda tachado con tu nombre.`)) return;
  if (anularAgregado(ag, usuarioActual() || 'desconocido', new Date().toISOString())){
    markDirty();
    renderAgregados();
  }
}

registrarVista('agregados', () => renderAgregados());
