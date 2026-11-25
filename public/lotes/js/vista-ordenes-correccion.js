/* ===== Lotes CIW — Una orden de corrección en modo órdenes =====
 *
 * Las órdenes que se guardaron al imprimir (orden-correccion-guardada.js) se
 * listan en la sección Órdenes de trabajo; desde ahí se abren acá
 * (/lotes/?orden=<id>, ver fijarOrdenUnica en vista-so2.js) con Ejecutar / Anular.
 * Sin `soloId` pinta pendientes arriba, despues ejecutadas y anuladas.
 * Ejecutar es UNA vez, con la orden terminada: todo arranca destildado, el N°
 * de OT es el de la orden y las dosis son las del papel. */
'use strict';

import { $, esc, escA, DATOS, markDirty, guardar, mostrarOverlay, cerrarOverlay,
         usuarioActual } from './nucleo.js';
import { avisar, confirmar } from './dialogos.js';
import { fmtFecha } from './fechas.js';
import { ETIQUETA_FUERA } from './orden-correccion-activables.js';
import { escribirEjecucion, revertirEjecucion, anularOrden, revertirAnulacionOrden,
         analisisPosterior, unidadDe, filasDeGuardada, modoDeGuardada,
         textosPapelGuardado, vasijasEjecutables, resumenEjecucion } from './orden-correccion-guardada.js';
import { pintarHojas, HOJA_POR_PAGINA } from './orden-hoja.js';
import { campoHoja } from './hoja-campos.js';
import { hojaSoloLectura } from './hoja-solo-lectura.js';
import { OC_UNIDAD, filaPapelLote, theadPapelLote, COLGROUP_PAPEL_LOTE, COLUMNAS_PAPEL_LOTE,
         filasPapelPorModo } from './orden-correccion-papel.js';

const fmt = (v, dec) => (v != null && Number.isFinite(Number(v))) ? Number(v).toFixed(dec) : '—';

/* Lote sumado a mano estando fuera de la orden (orden-correccion-activables.js). */
const _marcaFuera = l => ETIQUETA_FUERA[l.fuera]
  ? ' <span class="tag" title="Corrección manual: la orden no lo proponía">✋ ' + esc(ETIQUETA_FUERA[l.fuera]) + '</span>' : '';
const hoyLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const _ordenPorId = id => (DATOS().ordenes_correccion || []).find(o => o && o.id === id) || null;

let _alCambiar = () => {};
/* Ejecutar / anular cambia el estado: la banda del modo órdenes (titular en
 * app.js) se refresca con este evento. Sin modo órdenes nadie lo escucha. */
const _avisarModo = () => document.dispatchEvent(new CustomEvent('lotes:modo-orden-cambio'));

/** Pinta las ordenes en `cont`. `alCambiar` repinta la pestaña entera
 *  (en el Registro, la tabla de correcciones cambia al ejecutar).
 *  `soloId` (modo órdenes, /lotes/?orden=…): esa orden sola, con su hoja
 *  tal como se imprimio (_pintarGuardada). */
export function pintarOrdenesCorreccion(cont, alCambiar, { soloId } = {}){
  if (!cont) return;
  _alCambiar = alCambiar || (() => {});
  if (soloId){ _pintarGuardada(cont, soloId); return; }
  const todas = (DATOS().ordenes_correccion || []).filter(Boolean);
  const porFecha = (a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))
                            || String(b.numero || '').localeCompare(String(a.numero || ''));
  const pend = todas.filter(o => o.estado === 'pendiente').sort(porFecha);
  const resto = todas.filter(o => o.estado !== 'pendiente').sort(porFecha);

  const fila = o => {
    const n = (o.lotes || []).length;
    const base = '<b>' + esc(o.numero) + '</b> · ' + esc(fmtFecha(o.fecha)) + ' · ';
    if (o.estado === 'pendiente') return '<div class="ocg-fila">⏳ ' + base + n + (n === 1 ? ' lote' : ' lotes') +
      (o.emitio ? ' · emitió ' + esc(o.emitio) : '') +
      ' <span class="spacer"></span><button class="btn primary" data-ocg-ejec="' + escA(o.id) + '">✔ Ejecutar</button>' +
      ' <button class="btn" data-ocg-anular="' + escA(o.id) + '">Anular</button>' +
      ' <button class="btn" data-ocg-ver="' + escA(o.id) + '">Ver</button></div>';
    if (o.estado === 'ejecutada'){
      const h = ((o.ejecucion && o.ejecucion.hechos) || []).length;
      return '<div class="ocg-fila">✔ ' + base + h + ' de ' + n + ' lotes hechos' +
        (o.ejecucion ? ' · ejecutó ' + esc(o.ejecucion.por || '?') + ' el ' + esc(fmtFecha(o.ejecucion.fecha)) : '') +
        ' <span class="spacer"></span><button class="btn" data-ocg-ver="' + escA(o.id) + '">Ver</button></div>';
    }
    return '<div class="ocg-fila" style="color:var(--muted)">✕ <s>' + base + n + ' lotes</s> · anulada' +
      (o.anulada ? ' por ' + esc(o.anulada.por || '?') + ' el ' + esc(fmtFecha(o.anulada.fecha)) : '') +
      ' <span class="spacer"></span><button class="btn" data-ocg-ver="' + escA(o.id) + '">Ver</button></div>';
  };

  cont.innerHTML = '<h2>Órdenes de corrección</h2>' +
    (todas.length
      ? '<div style="max-height:260px;overflow:auto">' + pend.map(fila).join('') + resto.map(fila).join('') + '</div>'
      : '<p style="color:var(--muted);margin:0">Todavía no hay órdenes guardadas. Se guardan solas al tocar «Imprimir y guardar» en Orden de corrección.</p>');

  _cablear(cont);
}

/* Los botones de la lista y los de la cabecera de una orden (data-ocg-*). */
function _cablear(cont){
  if (cont._ocgWired) return;
  cont._ocgWired = true;
  cont.addEventListener('click', e => {
    const ej = e.target.closest('[data-ocg-ejec]');
    if (ej) return _abrirEjecucion(ej.dataset.ocgEjec);
    const an = e.target.closest('[data-ocg-anular]');
    if (an) return _anular(an.dataset.ocgAnular);
    const ve = e.target.closest('[data-ocg-ver]');
    if (ve) return _ver(ve.dataset.ocgVer);
  });
}

/* ---------- una orden: la hoja tal como se imprimio ----------
 * Modo órdenes (/lotes/?orden=<id>, desde Pendientes o Historial): arriba el
 * estado y Ejecutar / Anular, abajo el papel redibujado con lo guardado (los
 * mismos renglones, dosis, titulo e instrucciones; solo lectura). */
function _pintarGuardada(cont, id){
  const o = _ordenPorId(id);
  if (!o){
    cont.innerHTML = '<div class="msg info" style="margin-top:10px">Esta orden no existe (¿la borraron?)</div>';
    return;
  }
  /* La cabecera va en .ot-prev-cab, como la de las otras ordenes guardadas. */
  cont.innerHTML = '<section class="ot-der" aria-label="Orden guardada">' +
    '<div class="ot-prev-cab">' + _cabecera(o) + '</div>' +
    '<div id="ocgPaginas" class="ocg-paginas"></div></section>';
  const pag = cont.querySelector('#ocgPaginas');
  pag.innerHTML = _papel(o);
  hojaSoloLectura(pag);
  _cablear(cont);
}

function _cabecera(o){
  const n = (o.lotes || []).length;
  let estado = '⏳ Pendiente';
  if (o.estado === 'ejecutada'){
    const h = ((o.ejecucion && o.ejecucion.hechos) || []).length;
    estado = '✔ Ejecutada' + (o.ejecucion ? ' por ' + esc(o.ejecucion.por || '?') + ' el ' + esc(fmtFecha(o.ejecucion.fecha)) : '') +
      ' · ' + h + ' de ' + n + ' lotes hechos';
  } else if (o.estado === 'anulada'){
    estado = '✕ Anulada' + (o.anulada ? ' por ' + esc(o.anulada.por || '?') + ' el ' + esc(fmtFecha(o.anulada.fecha)) : '');
  }
  const botones = o.estado === 'pendiente'
    ? '<button class="btn primary" data-ocg-ejec="' + escA(o.id) + '">✔ Ejecutar</button>' +
      ' <button class="btn" data-ocg-anular="' + escA(o.id) + '">Anular</button>'
    : '';
  return '<div class="oh-guardada" data-orden="' + escA(o.id) + '">' +
    '<div class="oh-estado"><b>' + esc(o.numero) + '</b> · ' + esc(fmtFecha(o.fecha)) + ' · ' + estado +
      (o.emitio ? ' · emitió ' + esc(o.emitio) : '') + '</div>' +
    (botones ? '<div class="oh-botones">' + botones + '</div>' : '') +
    '</div>';
}

/* El papel con las mismas piezas que _ocPintarPaginas (vista-orden-correccion.js),
 * pero con los datos de la orden guardada. */
export function _papel(o){
  const u = OC_UNIDAD[o.unidad] || OC_UNIDAD.sol;
  const { titulo, instrucciones } = textosPapelGuardado(o);
  const p = String(o.fecha || '').split('-');
  const fechaTxt = p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : (o.fecha || '');
  /* idx/primero: igual que _ocPintarPaginas (vista-orden-correccion.js). */
  const filasPapel = filasPapelPorModo(filasDeGuardada(o), modoDeGuardada(o), u);
  let previo = null;
  filasPapel.forEach((g, i) => {
    g.idx = i;
    g.primero = g.lote.lote !== previo;
    previo = g.lote.lote;
  });
  return pintarHojas({
    editable: true,   // los campos de la hoja; hojaSoloLectura los pasa a texto
    filas: filasPapel,
    porPagina: HOJA_POR_PAGINA,
    titulo,
    meta: { fecha: o.fecha, fechaTxt, anio: p.length === 3 ? p[0] : '', nro: o.numero },
    banda: ['CORRECCIÓN SO₂', '', 'Bodega'],
    emitio: o.emitio, recibio: o.recibio,
    antesBanda: instrucciones ? campoHoja('instr', instrucciones, { tipo: 'area', cls: 'oh-instr' }) : '',
    nota: u.nota.replace('cada barrica', 'cada vasija'),
    claseTabla: 'oh-tabla-justa',
    colgroup: COLGROUP_PAPEL_LOTE,
    thead: theadPapelLote(u),
    columnas: COLUMNAS_PAPEL_LOTE,
    textoVacio: 'Esta orden no tiene lotes.',
    renderFila: x => filaPapelLote(x, u, { editable: false }),
  });
}

/* ---------- ejecutar ---------- */

/* Estado del overlay abierto: que orden y que vasijas se tildaron
 * (lote -> Set de indices). Arranca VACIO: solo se registra lo que alguien
 * marco a proposito. */
let _ejec = null;
let _enVuelo = false;

function _abrirEjecucion(id){
  const o = _ordenPorId(id);
  if (!o || o.estado !== 'pendiente') return;
  _wireOverlay();
  _ejec = { id, tildes: new Map() };
  const u = unidadDe(o);
  const post = analisisPosterior(o, DATOS().analisis);
  const lotes = (o.lotes || []).map((l, i) => {
    const p = post.get(l.lote);
    const avisoPost = p ? '<div class="msg info" style="margin:4px 0 0 26px;font-size:12px">⚠ Hay un análisis del ' +
      esc(fmtFecha(p.fecha)) + ' (SO₂ ' + esc(fmt(p.so2_libre, 1)) + ') posterior a la orden. Se registra igual con los números del papel.</div>' : '';
    /* Barril por barril: una vasija sin dosis no se puede tildar (hay que
     * escribirla en la orden); un lote sin ninguna con dosis, tampoco. */
    const ejec = new Set(vasijasEjecutables(l));
    const sinNada = l.por_vasija && !ejec.size;
    const cab = '<label style="display:flex;gap:8px;align-items:center">' +
      '<input type="checkbox" data-ocg-lote="' + i + '"' +
        (sinNada ? ' disabled title="Ninguna vasija tiene dosis: escribila en la orden"' : '') + '>' +
      '<b style="min-width:64px">' + esc(l.lote) + '</b>' +
      '<span style="flex:1;color:var(--muted)">' + esc(l.variedad) + ' · ' +
        (l.modo === 'barril' ? 'Por barril' : 'Genérica · ' + l.vasijas.length + (l.vasijas.length === 1 ? ' vasija' : ' vasijas')) +
        _marcaFuera(l) + '</span>' +
      '<span class="num" data-ocg-sub="' + i + '"></span></label>';
    const vas = l.modo === 'barril'
      ? '<div style="display:flex;flex-wrap:wrap;gap:4px 14px;margin:4px 0 0 26px">' + l.vasijas.map((v, j) => ejec.has(j)
          ? '<label style="font-size:13px"><input type="checkbox" data-ocg-vas="' + i + ':' + j + '"> ' +
            esc(v.num || v.vasija || '—') + ' · ' + fmt(u.de(v), u.dec) + ' ' + u.suf + '</label>'
          : '<label style="font-size:13px;color:var(--muted)" title="sin dosis: escribila en la orden">' +
            '<input type="checkbox" data-ocg-vas="' + i + ':' + j + '" disabled> ' +
            esc(v.num || v.vasija || '—') + ' · sin dosis</label>').join('') + '</div>'
      : '';
    return '<div style="padding:6px 0;border-bottom:1px solid var(--line)">' + cab + vas + avisoPost + '</div>';
  }).join('');

  mostrarOverlay(
    '<h2 style="margin-top:0">Ejecutar ' + esc(o.numero) + '</h2>' +
    '<p style="color:var(--muted);font-size:13px;margin-top:0">Emitida el ' + esc(fmtFecha(o.fecha)) +
      (o.emitio ? ' por ' + esc(o.emitio) : '') + '. Tildá solo lo que se hizo: lo que quede sin tildar no se registra y vuelve a la Orden de corrección.</p>' +
    '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;align-items:flex-end">' +
      '<div><div style="font-size:11px;color:var(--muted)">Fecha real de la corrección</div>' +
        '<input class="txt" id="ocgFecha" type="date" value="' + escA(hoyLocal()) + '"></div>' +
      '<div style="font-size:13px">Ejecuta: <b>' + esc(usuarioActual() || '(sin sesión)') + '</b></div>' +
    '</div>' +
    '<div style="max-height:360px;overflow:auto;margin-bottom:10px">' + lotes + '</div>' +
    '<div id="ocgTotal" class="tag" style="margin-bottom:10px"></div>' +
    '<div id="ocgMsg"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="btn" data-ocg-cancelar>Cancelar</button>' +
      '<button class="btn primary" id="btnOcgConfirmar" disabled>✔ Confirmar</button>' +
    '</div>');
  _sincronizar();
}

/* Pone las casillas y los totales segun _ejec.tildes. Se actualiza en el
 * lugar (no se repinta el overlay) para no perder el scroll. */
function _sincronizar(){
  if (!_ejec) return;
  const o = _ordenPorId(_ejec.id);
  if (!o) return;
  const u = unidadDe(o);
  (o.lotes || []).forEach((l, i) => {
    const t = _ejec.tildes.get(l.lote) || new Set();
    const nEjec = vasijasEjecutables(l).length;
    const todas = l.modo === 'generica' ? t.size > 0 : t.size === nEjec && t.size > 0;
    const cbL = document.querySelector('[data-ocg-lote="' + i + '"]');
    if (cbL){ cbL.checked = todas; cbL.indeterminate = l.modo === 'barril' && t.size > 0 && !todas; }
    l.vasijas.forEach((_, j) => {
      const cb = document.querySelector('[data-ocg-vas="' + i + ':' + j + '"]');
      if (cb) cb.checked = t.has(j);
    });
    const idx = l.modo === 'generica' ? (t.size ? l.vasijas.map((_, j) => j) : []) : [...t];
    const sub = idx.reduce((s, j) => s + Number(u.de(l.vasijas[j])), 0);
    const el = document.querySelector('[data-ocg-sub="' + i + '"]');
    if (el) el.textContent = l.modo === 'barril'
      ? t.size + ' de ' + l.vasijas.length + (t.size ? ' · ' + fmt(sub, u.dec) + ' ' + u.suf : '')
      : fmt(u.total(l), u.dec) + ' ' + u.suf;
  });
  /* El total sale de lo que se va a registrar de verdad (entradasDeEjecucion). */
  const r = resumenEjecucion(o, _ejec.tildes);
  const nLotes = r.nLotes, total = Number(u.de(r));
  const tot = $('ocgTotal');
  if (tot) tot.textContent = 'Vas a registrar: ' + nLotes + (nLotes === 1 ? ' lote' : ' lotes') + ' · ' + fmt(total, u.dec) + ' ' + u.suf;
  const btn = $('btnOcgConfirmar');
  if (btn && !_enVuelo){ btn.disabled = nLotes === 0; btn.title = nLotes ? '' : 'No hay nada tildado'; }
}

/* Delegado y enganchado UNA vez: overlayBox es persistente (mostrarOverlay
 * solo cambia su contenido). Mismo patron que la ejecucion vieja. */
function _wireOverlay(){
  const box = $('overlayBox');
  if (!box || box._ocgWired) return;
  box._ocgWired = true;
  box.addEventListener('change', e => {
    if (!_ejec) return;
    const o = _ordenPorId(_ejec.id);
    if (!o) return;
    const cbL = e.target.closest('[data-ocg-lote]');
    const cbV = e.target.closest('[data-ocg-vas]');
    if (!cbL && !cbV) return;
    if (cbL){
      const l = o.lotes[+cbL.dataset.ocgLote];
      _ejec.tildes.set(l.lote, cbL.checked ? new Set(vasijasEjecutables(l)) : new Set());
    } else {
      const [i, j] = cbV.dataset.ocgVas.split(':').map(Number);
      const l = o.lotes[i];
      const t = _ejec.tildes.get(l.lote) || new Set();
      if (cbV.checked) t.add(j); else t.delete(j);
      _ejec.tildes.set(l.lote, t);
    }
    _sincronizar();
  });
  box.addEventListener('click', e => {
    if (!_ejec) return;
    if (e.target.closest('[data-ocg-cancelar]')){ _ejec = null; cerrarOverlay(); return; }
    if (e.target.closest('#btnOcgConfirmar')) _confirmar();
  });
}

async function _confirmar(){
  if (_enVuelo || !_ejec) return;
  const msg = $('ocgMsg');
  const fecha = $('ocgFecha') ? $('ocgFecha').value : '';
  if (!fecha){ if (msg) msg.innerHTML = '<div class="msg err">Falta la fecha.</div>'; return; }
  const { id, tildes } = _ejec;

  /* _enVuelo arranca ACA (antes del fetch de version), no recien antes de
   * guardar: dos clics superpuestos no pueden pisarse ni en el chequeo ni en
   * la escritura. Se libera en TODAS las salidas de abajo. */
  _enVuelo = true;
  const btn = $('btnOcgConfirmar');
  if (btn) btn.disabled = true;

  /* El overlay pausa el en vivo (nucleo.js _ocupado): mientras estuvo abierto
   * otra PC pudo haber ejecutado o anulado esta misma orden. Sin este
   * rechequeo el 409 del guardado de mas abajo fusiona las dos escrituras en
   * silencio en vez de avisar. Si el fetch falla (sin conexion) se sigue: el
   * guardado de mas abajo ya avisa y reintenta solo. */
  try {
    const rv = await fetch(API + '/version', { cache: 'no-store' });
    if (rv.ok){
      const info = await rv.json();
      if (info.version !== DATOS().meta.version){
        _enVuelo = false;
        if (msg) msg.innerHTML = '<div class="msg err">Hubo cambios guardados desde otra PC. Cerrá, esperá unos segundos a que se actualice la pantalla (o recargá) y volvé a intentar.</div>';
        _sincronizar();
        return;
      }
    }
  } catch (_) { /* sin conexion: seguir, el guardado de abajo ya lo maneja */ }

  const res = escribirEjecucion(DATOS(), id, { tildes, fecha, quien: usuarioActual(), ahora: new Date().toISOString() });
  if (!res.ok){
    _enVuelo = false;
    if (msg) msg.innerHTML = '<div class="msg err">' + esc(res.motivo) + '</div>';
    _sincronizar();
    return;
  }

  markDirty();
  if (msg) msg.innerHTML = '<div class="msg info">Guardando…</div>';
  let ok;
  try { ok = await guardar(); } catch (_) { ok = false; }
  finally { _enVuelo = false; }

  if (!ok){
    /* DATOS() se lee de nuevo: tras un 409 es el documento fusionado. */
    revertirEjecucion(DATOS(), id, res.snaps);
    markDirty();
    const txt = 'No se pudo guardar. No se registró nada. Resolvé el conflicto y volvé a confirmar.';
    const m2 = $('ocgMsg');
    if (m2 && $('overlay') && $('overlay').open){ m2.innerHTML = '<div class="msg err">' + txt + '</div>'; _sincronizar(); }
    else avisar(txt, { tipo: 'mal' });
    return;
  }
  const o = _ordenPorId(id);
  _ejec = null;
  cerrarOverlay();
  _alCambiar();
  _avisarModo();
  avisar('✓ ' + (o ? o.numero : 'La orden') + ' ejecutada: se registraron ' + res.entradas.length +
    (res.entradas.length === 1 ? ' corrección.' : ' correcciones.') +
    (res.conviven.length ? ' Ojo: ' + res.conviven.join(', ') + (res.conviven.length === 1 ? ' ya tenía' : ' ya tenían') +
      ' otra corrección ese día con otra OT; quedaron las dos.' : ''));
}

/* ---------- anular ---------- */

async function _anular(id){
  if (_enVuelo) return;
  const o = _ordenPorId(id);
  if (!o || o.estado !== 'pendiente') return;
  if (!await confirmar({ titulo: 'Anular la orden ' + o.numero,
      texto: 'La orden queda anulada en Órdenes de trabajo → Historial (no se borra) y sus ' + (o.lotes || []).length +
             ' lotes vuelven a la Orden de corrección. No se registra ninguna corrección.',
      si: 'Anular', no: 'Cancelar' })) return;

  /* Mismo chequeo que al ejecutar (ver _confirmar): el overlay de confirmar()
   * tambien pauso el en vivo, y otra PC pudo haber tocado esta orden mientras
   * tanto. _enVuelo cubre desde aca para que no se superponga con _confirmar
   * ni con otro _anular. */
  _enVuelo = true;
  try {
    try {
      const rv = await fetch(API + '/version', { cache: 'no-store' });
      if (rv.ok){
        const info = await rv.json();
        if (info.version !== DATOS().meta.version){
          avisar('Hubo cambios guardados desde otra PC. Cerrá, esperá unos segundos a que se actualice la pantalla (o recargá) y volvé a intentar.', { tipo: 'mal' });
          return;
        }
      }
    } catch (_) { /* sin conexion: seguir, el guardado de abajo ya lo maneja */ }

    anularOrden(DATOS(), id, usuarioActual(), hoyLocal());
    markDirty();
    let ok;
    try { ok = await guardar(); } catch (_) { ok = false; }
    if (!ok){
      revertirAnulacionOrden(DATOS(), id);
      markDirty();
      avisar('No se pudo guardar: la orden ' + o.numero + ' sigue pendiente.', { tipo: 'mal' });
      return;
    }
    _alCambiar();
    _avisarModo();
  } finally {
    _enVuelo = false;
  }
}

/* ---------- ver (solo lectura) ---------- */

function _ver(id){
  const o = _ordenPorId(id);
  if (!o) return;
  _ejec = null;
  const u = unidadDe(o);
  const hechos = new Map(((o.ejecucion && o.ejecucion.hechos) || []).map(h => [h.lote, h]));
  const filas = (o.lotes || []).map(l => {
    const h = hechos.get(l.lote);
    const estado = o.estado === 'ejecutada' ? (h ? '✔' : '—') : '';
    const vas = l.modo === 'barril'
      ? l.vasijas.map(v => esc(v.num || v.vasija || '—') + ' ' + fmt(u.de(v), u.dec)).join(' · ')
      : l.vasijas.length + (l.vasijas.length === 1 ? ' vasija' : ' vasijas');
    return '<tr><td class="c">' + estado + '</td><td><b>' + esc(l.lote) + '</b></td><td>' + esc(l.variedad) + _marcaFuera(l) + '</td>' +
      '<td>' + (l.modo === 'barril' ? 'Por barril' : 'Genérica') + '</td><td style="font-size:12px">' + vas + '</td>' +
      '<td class="num">' + fmt(u.total(l), u.dec) + ' ' + u.suf + '</td>' +
      '<td class="num">' + (h ? fmt(o.unidad === 'mbk' ? h.mbk_g : h.ml, u.dec) + ' ' + u.suf : '') + '</td></tr>';
  }).join('');
  mostrarOverlay('<h2 style="margin-top:0">Orden ' + esc(o.numero) + ' · ' + esc(fmtFecha(o.fecha)) + '</h2>' +
    '<p style="color:var(--muted);font-size:13px;margin-top:0">' +
      ({ pendiente: '⏳ Pendiente', ejecutada: '✔ Ejecutada', anulada: '✕ Anulada' }[o.estado] || '') +
      (o.emitio ? ' · emitió ' + esc(o.emitio) : '') +
      (o.ejecucion ? ' · ejecutó ' + esc(o.ejecucion.por || '?') + ' el ' + esc(fmtFecha(o.ejecucion.fecha)) : '') + '</p>' +
    '<div style="max-height:400px;overflow:auto"><table><thead><tr><th></th><th>Lote</th><th>Variedad</th><th>Modo</th>' +
    '<th>Vasijas</th><th class="num">Orden</th><th class="num">Registrado</th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
    '<div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn" data-ocg-cerrar>Cerrar</button></div>');
  const box = $('overlayBox');
  const b = box && box.querySelector('[data-ocg-cerrar]');
  if (b) b.addEventListener('click', () => cerrarOverlay());
}
