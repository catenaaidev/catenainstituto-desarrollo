/* ===== Lotes CIW — sub-pestaña Movimientos -> Inventario de tanques =====
 * Que hay en cada vasija fija de CIW. Se calcula de las OT (inventario-tanques.js);
 * lo unico que se carga a mano es la recorrida (recorridas.js). */
'use strict';

import { $, esc, escA, DATOS, markDirty, usuarioActual, pedirUsuario, irALote, avisoBreve } from './nucleo.js';
import { inventarioTanques, ESTADOS_MANUALES } from './inventario-tanques.js';
import { medirFila, nuevaRecorrida, aplicarDiferencias } from './recorridas.js';
import { litrosPorCm } from './cubicacion.js';
import { hojaRecorridaHTML } from './hoja-recorrida.js';
import { imprimirSoloPapel } from './vista-ot-emitir.js';
import { hoyLocalISO, fmtFecha } from './fechas.js';
import { avisosHTML, leyendaAvisosHTML, contarCargadas, serializarBorrador, leerBorrador } from './inventario-tanques-ui.js';
import { confirmar } from './dialogos.js';

const CLAVE_FILTRO = 'lotes_inv_tanques_filtro';
const leerFiltro = () => { try { return localStorage.getItem(CLAVE_FILTRO) || 'todas'; } catch(e) { return 'todas'; } };
const guardarFiltro = v => { try { localStorage.setItem(CLAVE_FILTRO, v); } catch(e) {} };

let _filtro = leerFiltro();
let _midiendo = false;           // modo recorrida
let _entradas = new Map();       // num -> {cm, obs, estado_manual} mientras se mide
let _fechaRec = '';              // fecha de la recorrida: el dia en que se empezo

/* La recorrida a medio cargar se guarda en el navegador: Cancelar por error o un F5 no la borran. */
const CLAVE_BORRADOR = 'lotes_inv_recorrida_borrador';
const leerB = () => { try { return leerBorrador(localStorage.getItem(CLAVE_BORRADOR)); } catch(e) { return null; } };
const borrarB = () => { try { localStorage.removeItem(CLAVE_BORRADOR); } catch(e) {} };
const guardarB = () => {
  try {
    const t = serializarBorrador(_fechaRec, _entradas);
    if (t) localStorage.setItem(CLAVE_BORRADOR, t); else localStorage.removeItem(CLAVE_BORRADOR);
  } catch(e) {}
};
const SALTEO_TXT = {
  'no-encontrada': 'no se encontró la medición', 'ya-aplicada': 'ya estaba aplicada',
  'sin-litros': 'la medición no tiene litros', 'lote-movido': 'el lote ya no está en esa vasija',
  'varias-vasijas': 'el lote está en varias vasijas',
  'web-cambio': 'la web cambió después de medir',
};
const L = x => x == null ? '?' : Math.round(x).toLocaleString('es-AR');
const pasaFiltro = f => _filtro === 'todas' ? true
  : _filtro === 'ocupadas' ? f.lotes.length > 0
  : _filtro === 'vacias' ? f.lotes.length === 0
  : f.avisos.length > 0;

function celdaLotes(f, k){
  return f.lotes.map(o => esc(o[k] === true ? 'Sí' : o[k] === false ? '' : o[k])).join('<br>');
}

/* La diferencia sale de la ultima fila con cm (f.medicion), no de la ultima fila.
 * Sin columna propia: se ve como etiqueta "difiere" y el detalle sale al aplicar. */
const aplicable = f => f.avisos.includes('diferencia') && f.lotes.length === 1 && !f.lotes[0].enVarias;

/* Texto de la columna "Litros medidos" mientras se tipea. */
function textoMedido(f, entrada, m){
  const crudo = String((entrada && entrada.cm) ?? '').trim();
  if (!m || m.cm == null) return crudo ? 'cm inválido' : '';
  if (m.litros_medidos != null) return `${L(m.litros_medidos)} L`;
  const r = litrosPorCm({ num: f.num, cap_real: f.cap_real, tabla: f.tabla }, m.cm);
  return r.error === 'sin-tabla' ? 'sin tabla de cubicación'
    : r.error === 'fuera-de-rango' ? `máx ${r.max} cm`
    : 'cm inválido';
}

const celdaLote = f => `<td>${f.lotes.map(o => `<a href="#" data-lote="${escA(o.lote)}">${esc(o.lote)}</a>`).join('<br>')}</td>`;
const claseFila = f => `${f.avisos.length ? 'inv-con-aviso' : ''}${f.lotes.length ? '' : ' inv-vacia'}`;

/* En la recorrida solo lo que hace falta para medir: el campo de cm queda a la vista sin desplazarse. */
function filaMedirHTML(f){
  const e = _entradas.get(f.num) || {}, n = escA(f.num), v = esc(f.num);
  return `<tr class="${claseFila(f)}">
    <td class="inv-num">${v}</td>${celdaLote(f)}
    <td class="n">${f.lotes.length ? L(f.litros) : ''}</td>
    <td><input class="inv-in" data-num="${n}" data-k="cm" inputmode="decimal" enterkeyhint="next" autocomplete="off"
      aria-label="cm de merma de la vasija ${n}" value="${escA(e.cm ?? '')}" placeholder="cm"></td>
    <td class="inv-medido n" data-medido="${n}"></td>
    <td><input class="inv-in inv-obs" data-num="${n}" data-k="obs" enterkeyhint="next" autocomplete="off"
      aria-label="Observación de la vasija ${n}" value="${escA(e.obs ?? f.obs)}"></td>
    <td><select data-num="${n}" data-k="estado_manual" aria-label="Estado a mano de la vasija ${n}"><option value="">(automático)</option>${
      ESTADOS_MANUALES.map(s => `<option${(e.estado_manual ?? (f.estado_origen === 'manual' ? f.estado : '')) === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></td></tr>`;
}

function filaHTML(f){
  return `<tr class="${claseFila(f)}">
    <td class="inv-num">${esc(f.num)}</td><td>${esc(f.tipo)}</td><td class="n">${f.cap_real == null ? '' : L(f.cap_real)}</td>
    ${celdaLote(f)}
    <td>${celdaLotes(f, 'cosecha')}</td><td>${celdaLotes(f, 'variedad')}</td><td>${celdaLotes(f, 'id_texto')}</td>
    <td class="n">${f.lotes.length ? L(f.litros) : ''}</td>
    <td><span class="inv-estado inv-${escA(f.estado_origen)}">${esc(f.estado)}</span>${avisosHTML(f.avisos)}</td>
    <td>${celdaLotes(f, 'organico')}</td><td>${esc(f.obs)}</td></tr>`;
}

export function renderInventarioTanques(cont, { onCambio }){
  const datos = DATOS();
  if (!(datos.vasijas || []).length){
    cont.innerHTML = `<p class="inv-nota">No hay padrón de vasijas cargado. Cargalo en <b>Configuración → Vasijas</b> (⬇ Cargar padrón inicial).</p>`;
    return;
  }
  const inv = inventarioTanques({ padron: datos.vasijas, lotes: datos.lotes, ots: datos.ordenes_trabajo, recorridas: datos.recorridas });
  const t = inv.totales;
  const filas = inv.filas.filter(pasaFiltro);
  // Lo que "Aplicar" corregiria: todas las filas, no solo las del filtro.
  const difs = inv.filas.filter(aplicable);
  const opt = (v, txt) => `<option value="${v}"${_filtro === v ? ' selected' : ''}>${txt}</option>`;
  const cab = _midiendo
    ? '<th>N°</th><th>Lote</th><th>Litros web</th><th>cm merma</th><th>Litros medidos</th><th>Observación</th><th>Estado a mano</th>'
    : '<th>N°</th><th>Tipo</th><th>Cap REAL</th><th>Lote</th><th>Cosecha</th><th>Variedad</th><th>ID</th><th>Litros</th>'
      + '<th>Estado</th><th>Orgánico</th><th>Observación</th>';
  const borrador = _midiendo ? null : leerB();
  const nB = borrador ? contarCargadas(borrador.entradas) : 0;
  const txtNueva = !borrador ? '📏 Nueva recorrida'
    : `📏 Seguir recorrida (${nB} cargada${nB === 1 ? '' : 's'}${borrador.fecha !== hoyLocalISO() ? ` del ${fmtFecha(borrador.fecha)}` : ''})`;

  cont.innerHTML = `<div class="toolbar">
      <span class="tag">${t.ocupadas} ocupadas · ${t.vacias} vacías · ${L(t.litros)} L · ${t.mermos} mermo${t.mermos === 1 ? '' : 's'}${t.conAviso ? ` · ${t.conAviso} con aviso` : ''}</span>
      <select id="invFiltro" aria-label="Filtrar vasijas">${opt('todas', 'Todas')}${opt('ocupadas', 'Ocupadas')}${opt('vacias', 'Vacías')}${opt('aviso', 'Con aviso')}</select>
      ${_midiendo
        ? '<button class="btn primary" id="invGuardarRec">💾 Guardar recorrida</button><button class="btn" id="invCancelarRec">Cancelar</button>'
        : `<button class="btn" id="invNuevaRec">${esc(txtNueva)}</button>
           <button class="btn" id="invImprimir">🖨 OT inventario</button>
           ${difs.length ? `<button class="btn" id="invAplicar">Aplicar diferencias (${difs.length})</button>` : ''}`}
    </div>
    <p class="inv-nota">${_midiendo
      ? `Recorrida del ${esc(fmtFecha(_fechaRec))}. 0 cm = lleno. Enter o ↓ pasa a la vasija siguiente, ↑ a la anterior. Lo cargado queda guardado en este navegador hasta Guardar o Cancelar.`
      : 'Se actualiza sola con las OT confirmadas. En la recorrida, 0 cm = lleno.'}</p>
    <div class="scroll"><table class="inv-tabla"><thead><tr>${cab}</tr></thead>
      <tbody>${filas.map(_midiendo ? filaMedirHTML : filaHTML).join('')
        || `<tr><td colspan="${_midiendo ? 7 : 11}" class="inv-nota">No hay vasijas con ese filtro.</td></tr>`}</tbody></table></div>
    ${_midiendo ? '' : leyendaAvisosHTML(filas)}
    ${inv.sinVasija.length ? `<h4 class="inv-sub">Lotes con vino en tanque sin número de vasija</h4>
      <table class="inv-tabla"><thead><tr><th>Lote</th><th>Vasija actual</th><th>Litros en tanque</th><th>Motivo</th></tr></thead><tbody>${
        inv.sinVasija.map(s => `<tr><td><a href="#" data-lote="${escA(s.lote)}">${esc(s.lote)}</a></td><td>${esc(s.vasija_actual)}</td>
          <td class="n">${L(s.litros)}</td><td>escribí el número del tanque en la vasija del lote</td></tr>`).join('')}</tbody></table>` : ''}`;

  $('invFiltro').addEventListener('change', e => { _filtro = e.target.value; guardarFiltro(_filtro); onCambio(); });
  cont.querySelectorAll('[data-lote]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); irALote(a.dataset.lote); }));

  if (_midiendo){
    const porNum = new Map(inv.filas.map(f => [f.num, f]));
    const pintarMedido = num => {
      const td = cont.querySelector(`[data-medido="${CSS.escape(num)}"]`);
      if (!td) return;
      const e = _entradas.get(num);
      td.textContent = textoMedido(porNum.get(num), e, medirFila(porNum.get(num), e));
    };
    cont.querySelectorAll('[data-k]').forEach(el => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
      const num = el.dataset.num, e = { ..._entradas.get(num) };
      e[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
      _entradas.set(num, e);
      guardarB();
      pintarMedido(num);
    }));
    // Enter / ↓ / ↑: mismo campo de la vasija siguiente o anterior, como bajando por la hoja de papel.
    cont.querySelectorAll('input.inv-in').forEach(el => el.addEventListener('keydown', ev => {
      const paso = ev.key === 'Enter' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0;
      if (!paso || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.isComposing) return;
      ev.preventDefault();
      const col = [...cont.querySelectorAll(`input.inv-in[data-k="${el.dataset.k}"]`)];
      const sig = col[col.indexOf(el) + paso];
      if (sig){ sig.focus(); sig.select(); }
    }));
    for (const num of _entradas.keys()) pintarMedido(num);
    $('invCancelarRec').addEventListener('click', async () => {
      const n = contarCargadas(_entradas);
      if (n && !await confirmar({ titulo: 'Descartar la recorrida', texto: `Se pierde lo cargado en ${n} vasija${n === 1 ? '' : 's'}.`, si: 'Descartar', no: 'Seguir cargando', peligro: true })) return;
      borrarB();
      _midiendo = false; _entradas = new Map(); onCambio();
    });
    $('invGuardarRec').addEventListener('click', () => {
      const quien = usuarioActual() || pedirUsuario();
      if (!quien) return;
      // Solo las filas que el usuario toco: velo/obs/estado precargados no son una medicion nueva.
      // Pero en las tocadas se guardan junto con lo nuevo, si no la fila nueva los borraria.
      const filasRec = [..._entradas.entries()].map(([num, e]) => {
        const f = porNum.get(num);
        return medirFila(f, { velo: f.velo, obs: f.obs, estado_manual: f.estado_origen === 'manual' ? f.estado : '', ...e });
      });
      const fecha = _fechaRec || hoyLocalISO();
      const rec = nuevaRecorrida({ id: `rec-${fecha}-${Date.now().toString(36)}`, fecha, por: quien, filas: filasRec });
      if (!rec.filas.length){ avisoBreve('No cargaste ninguna medición.'); return; }
      (datos.recorridas = datos.recorridas || []).push(rec);
      markDirty();
      borrarB();
      _midiendo = false; _entradas = new Map();
      onCambio();
    });
    return;
  }

  $('invNuevaRec').addEventListener('click', () => {
    _midiendo = true;
    _entradas = borrador ? borrador.entradas : new Map();
    _fechaRec = borrador ? borrador.fecha : hoyLocalISO();
    onCambio();
    const primero = document.querySelector('#movTanques input.inv-in[data-k="cm"]');
    if (primero) primero.focus();
  });
  $('invImprimir').addEventListener('click', () => {
    imprimirSoloPapel(() => { $('otMovHoja').innerHTML = hojaRecorridaHTML(inv.filas, hoyLocalISO()); });
  });
  const btnAplicar = $('invAplicar');
  if (btnAplicar) btnAplicar.addEventListener('click', async () => {
    const items = difs.map(f => ({ recorrida_id: f.medicion.recorrida_id, vasija: f.num }));
    const quien = usuarioActual() || pedirUsuario();
    if (!quien) return;
    const detalle = difs.map(f => `${f.num} (${f.lotes[0].lote}): web ${L(f.litros)} → medido ${L(f.medicion.litros_medidos)} L`).join('\n');
    if (!await confirmar({ titulo: 'Corregir litros con lo medido', texto: `${items.length} lote${items.length === 1 ? '' : 's'}:\n\n${detalle}`, si: 'Corregir litros', no: 'Cancelar' })) return;
    const r = aplicarDiferencias(datos, items, quien, hoyLocalISO());
    if (r.aplicados.length) markDirty();
    if (r.salteados.length) avisoBreve('No se aplicó: ' + r.salteados.map(s => `${s.vasija} (${SALTEO_TXT[s.motivo]})`).join(', '));
    onCambio();
  });
}
