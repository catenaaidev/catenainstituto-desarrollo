/* ===== Lotes CIW — pestana Agenda =====
 *
 * Bandeja "Alertas para analizar" + calendario de analisis y trasiegos.
 * El motor decide (agenda.js, puro) y la vista dibuja: aca no se recalcula
 * ninguna regla. Etapa 1: ver y planificar; arrastrar llega en la Etapa 2.
 */
'use strict';

import { $, esc, escA, DATOS, dashData, dashLoading, cargarDashboard, registrarVista, vistaActiva,
         markDirty, usuarioActual, pedirUsuario } from './nucleo.js';
import { avisar, confirmar } from './dialogos.js';
import { planificar, GRUPOS_ANALISIS } from './agenda.js';
import { sumarDias, lunesDe, diaSemana } from './agenda-dias.js';
import { hoyLocalISO } from './fechas.js';
import { emitirOTDesdeAgenda } from './vista-movimientos.js';
import { visible } from './selector-anios.js';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
               'septiembre', 'octubre', 'noviembre', 'diciembre'];
const PRIO = { alta: 'Alta', media: 'Media', baja: 'Baja' };
/* De donde sale la fecha base del trasiego (agenda.js, origen). */
const ORIGEN_BASE = { movimiento: 'último movimiento', ingreso: 'ingreso', etapa: 'inicio de etapa', analisis: 'primer análisis' };

/* Vista y filtro sobreviven al F5 en esta pestaña (shared/filtros-sesion.js). */
const _FS = typeof window !== 'undefined' && window.CIWFiltros;
const _lf = (k, d) => _FS ? _FS.leer('lotes:agenda:' + k, d) : d;
const _gf = (k, v) => { if (_FS) _FS.guardar('lotes:agenda:' + k, v); };
let _modo = _lf('modo', 'semana') === 'mes' ? 'mes' : 'semana';   // 'semana' | 'mes'
let _filtro = (v => ['ambos', 'analisis', 'trasiegos'].includes(v) ? v : 'ambos')(_lf('filtro', 'ambos'));
let _ancla = null;      // semana: su lunes; mes: cualquier dia del mes
let _diaAbierto = null; // ISO del panel del dia
let _trAbierto = null;  // lote de trasiego con el menu abierto (OT / Reprogramar)
let _resaltado = '';    // lote elegido en la bandeja
let _plan = null;
let _montado = false;
let _foco = '';         // selector a enfocar despues de redibujar
/* Grupos de la bandeja desplegados: sobreviven a cada redibujo. Por defecto
 * los de analisis abiertos y "Trasiegos vencidos" cerrado. */
const _gruposAbiertos = new Set(['a1', 'a2', 'a3', 'a4']);

function _abrirDia(f){ _diaAbierto = f; _foco = '[data-ag-cerrar]'; }
function _cerrarDia(){
  if (_diaAbierto) _foco = `[data-ag-dia="${_diaAbierto}"]`;
  _diaAbierto = null;
}

/* ---------- alertas del motor (/dashboard) ----------
 * Se piden una sola vez por ciclo de falla: si el pedido termina sin datos
 * (nucleo no avisa nada cuando falla) se marca _dashFallo y se redibuja con
 * el cartel de error. Ese redibujo no vuelve a pedir; reintenta "Hoy". */
let _dashFallo = false;

function _pedirDashboard(){
  if (dashData()){ _dashFallo = false; return; }
  if (_dashFallo || dashLoading()) return;
  const tras = () => {
    if (dashData()) return; // nucleo ya redibujo con las alertas
    _dashFallo = true;
    if (vistaActiva() === 'agenda') renderAgenda();
  };
  cargarDashboard().then(tras, tras);
}

const ddmm = (f) => f.slice(8, 10) + '/' + f.slice(5, 7);
const _mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function _calcular(){
  const d = DATOS() || {};
  const dash = dashData();
  _plan = planificar({
    lotes: (d.lotes || []).filter(l => visible(l.lote)), analisis: d.analisis || [], movimientos: d.movimientos || [],
    dashLotes: dash ? (dash.lotes || []) : null, agenda: d.agenda || [], config: d.config || {}, hoy: hoyLocalISO(),
  });
  return _plan;
}

export function renderAgenda(){
  const sec = $('tab-agenda');
  if (!sec) return;
  _pedirDashboard();
  const p = _calcular();
  /* En mes (vuelto del F5) el ancla es hoy: el lunes puede caer en el mes anterior. */
  if (!_ancla) _ancla = _modo === 'semana' ? lunesDe(p.hoy) : p.hoy;
  const porFecha = new Map(p.dias.map(d => [d.fecha, d]));
  const cargando = !_dashFallo && dashLoading();
  const aviso = p.sinAlertas
    ? `<div class="msg ${cargando ? '' : 'err'} ag-aviso">${cargando ? 'Cargando alertas…' : 'Alertas no disponibles: se muestran solo los trasiegos.'}</div>`
    : '';
  // La bandeja es sticky: se corre lo que miden la barra de la plataforma
  // (--ciw-h, en el CSS) y la de Lotes (también sticky).
  const barra = $('barraLotes');
  if (barra && barra.offsetHeight) sec.style.setProperty('--ag-tope', (barra.offsetHeight + 8) + 'px');
  const bandejaVieja = sec.querySelector('.ag-bandeja');
  const scrollBandeja = bandejaVieja ? bandejaVieja.scrollTop : 0;
  sec.innerHTML = `
<div class="ag">
  ${_htmlBarra(p)}
  ${aviso}
  <div class="ag-cuerpo">
    <aside class="ag-bandeja" aria-label="Alertas para analizar">${_htmlBandeja(p)}</aside>
    <div class="ag-cal">${_modo === 'semana' ? _htmlSemana(p, porFecha) : _htmlMes(p, porFecha)}</div>
  </div>
  ${_trAbierto ? _htmlMenuTrasiego(p, _trAbierto) : _diaAbierto ? _htmlPanelDia(porFecha.get(_diaAbierto), _diaAbierto) : ''}
</div>`;
  const bandeja = sec.querySelector('.ag-bandeja');
  if (bandeja) bandeja.scrollTop = scrollBandeja;
  // <dialog> modal: la capa superior escapa del contexto de apilamiento de
  // <main>, que la barra de pestañas tapaba.
  const dlg = sec.querySelector('dialog.ag-panel, dialog.ag-menu');
  if (dlg && !dlg.open) dlg.showModal();
  if (_foco){
    // El innerHTML se lleva el foco: se lo da a la X al abrir el panel y al
    // dia de vuelta al cerrarlo, para seguir con el teclado.
    const el = sec.querySelector(_foco);
    if (el) el.focus();
    _foco = '';
  }
  if (!_montado){
    sec.addEventListener('click', _alClic);
    sec.addEventListener('keydown', _alTecla);
    sec.addEventListener('toggle', _alDesplegar, true);
    sec.addEventListener('close', _alCerrarDialogo, true);
    _montado = true;
  }
}
registrarVista('agenda', renderAgenda);

/* ---------- barra ---------- */

function _htmlBarra(p){
  const seg = (grupo, v, txt, on) =>
    `<button type="button" class="ag-seg${on ? ' on' : ''}" data-ag-${grupo}="${v}" aria-pressed="${on}">${txt}</button>`;
  const titulo = _modo === 'semana'
    ? `Semana del ${ddmm(_ancla)} al ${ddmm(sumarDias(_ancla, 6))}`
    : _mayuscula(`${MESES[Number(_ancla.slice(5, 7)) - 1]} ${_ancla.slice(0, 4)}`);
  return `<div class="ag-barra">
  <div class="ag-nav">
    <button type="button" class="btn" data-ag-nav="-1" aria-label="Anterior">←</button>
    <button type="button" class="btn" data-ag-nav="0">Hoy</button>
    <button type="button" class="btn" data-ag-nav="1" aria-label="Siguiente">→</button>
    <h2 class="ag-titulo">${esc(titulo)}</h2>
  </div>
  <div class="ag-segs" role="group" aria-label="Vista">${seg('modo', 'semana', 'Semana', _modo === 'semana')}${seg('modo', 'mes', 'Mes', _modo === 'mes')}</div>
  <div class="ag-segs" role="group" aria-label="Mostrar">${seg('filtro', 'ambos', 'Ambos', _filtro === 'ambos')}${seg('filtro', 'analisis', 'Análisis', _filtro === 'analisis')}${seg('filtro', 'trasiegos', 'Trasiegos', _filtro === 'trasiegos')}</div>
  <span class="ag-cupos">Cupo diario: <b>${p.cfg.cupo_analisis}</b> análisis · <b>${p.cfg.cupo_trasiegos}</b> trasiegos</span>
</div>`;
}

/* ---------- bandeja ---------- */

function _htmlBandeja(p){
  const grupos = [1, 2, 3, 4].map(n => {
    const items = p.bandeja.analisis.filter(i => i.prioridad === n);
    if (!items.length) return '';
    return `<details class="ag-grupo" data-ag-grupo="a${n}"${_gruposAbiertos.has('a' + n) ? ' open' : ''}><summary><span class="ag-p p${n}"></span>${esc(GRUPOS_ANALISIS[n])} <b>${items.length}</b></summary>${items.map(_htmlFilaA).join('')}</details>`;
  }).join('');
  const tr = p.bandeja.trasiegos;
  const trHtml = tr.length
    ? `<details class="ag-grupo" data-ag-grupo="tr"${_gruposAbiertos.has('tr') ? ' open' : ''}><summary><span class="ag-p tr"></span>Trasiegos vencidos <b>${tr.length}</b></summary>${tr.map(_htmlFilaT).join('')}</details>`
    : '';
  const vacio = p.sinAlertas ? '' : '<p class="ag-vacio">Sin alertas pendientes.</p>';
  return `<h3 class="ag-h">Alertas para analizar</h3>${grupos || vacio}${trHtml}`;
}

function _cuando(i){
  if (i.programado) return `📅 ${ddmm(i.programado)}`;
  return i.sinLugar ? '⚠ sin lugar' : '';
}

function _htmlFilaA(i){
  const extra = (i.atraso ? ` · ${i.atraso} d de atraso` : '') + (i.etiquetas.length ? ' · ' + i.etiquetas.join(', ') : '');
  return `<button type="button" class="ag-fila${_resaltado === i.lote ? ' res' : ''}" data-ag-lote="${escA(i.lote)}" data-ag-fecha="${escA(i.programado || '')}">
<span class="ag-lote">${esc(i.lote)}</span><span class="ag-var">${esc(i.variedad)}</span>
<span class="ag-mot">${esc(i.motivo + extra)}</span><span class="ag-cuando">${_cuando(i)}</span></button>`;
}

function _htmlFilaT(t){
  return `<button type="button" class="ag-fila pr-${t.prioridad}${_resaltado === t.lote ? ' res' : ''}" data-ag-lote="${escA(t.lote)}" data-ag-fecha="${escA(t.programado || '')}">
<span class="ag-lote"><span class="ag-punto"></span>${esc(t.lote)}</span><span class="ag-var">${esc(t.variedad)}</span>
<span class="ag-mot">${esc(_textoTrasiego(t))}</span><span class="ag-cuando">${_cuando(t)}</span></button>`;
}

function _textoTrasiego(t){
  const pr = `Prioridad ${PRIO[t.prioridad]}`;
  if (t.enCurso) return `${pr} · en curso (OT ${t.enCurso.ot || 's/n'})`;
  if (t.fijado) return `${pr} · reprogramado a mano para el ${ddmm(t.fijado)}`;
  if (t.sinBase) return `${pr} · sin fecha base`;
  const cuando = t.d >= 0 ? `vencido hace ${t.d} d` : `vence en ${-t.d} d`;
  const cada = t.dias_trasiego && t.dias_trasiego !== 90 ? ` · cada ${t.dias_trasiego} d` : '';
  return `${pr} · ${cuando} · ${ORIGEN_BASE[t.origen] || 'fecha base'} ${ddmm(t.base)}${cada}`;
}

/* ---------- calendario ---------- */

function _htmlSemana(p, porFecha){
  const dias = Array.from({ length: 7 }, (_, k) => sumarDias(_ancla, k));
  return `<div class="ag-semana">${dias.map(f => _htmlDia(porFecha.get(f), f, false, p.hoy, false)).join('')}</div>`;
}

function _htmlMes(p, porFecha){
  const primero = _ancla.slice(0, 8) + '01';
  const mes = primero.slice(0, 7);
  const inicio = lunesDe(primero);
  const celdas = [];
  for (let k = 0; k < 42; k++){
    const f = sumarDias(inicio, k);
    if (k % 7 === 0 && k > 0 && f.slice(0, 7) > mes) break;
    celdas.push(_htmlDia(porFecha.get(f), f, true, p.hoy, f.slice(0, 7) !== mes));
  }
  const cab = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(x => `<span>${x}</span>`).join('');
  return `<div class="ag-cabmes" aria-hidden="true">${cab}</div><div class="ag-mes">${celdas.join('')}</div>`;
}

function _barra(nombre, n, cupo, exc){
  const pct = cupo ? Math.min(100, Math.round(n * 100 / cupo)) : (n ? 100 : 0);
  return `<div class="ag-carga${exc ? ' exc' : ''}"><span>${nombre} <b>${n}/${cupo}</b></span><i style="width:${pct}%"></i></div>`;
}

function _htmlDia(d, f, compacto, hoy, fuera){
  const dow = diaSemana(f);
  const habil = d ? d.habil : (dow !== 0 && dow !== 6);
  const todos = d ? d.analisis.concat(d.trasiegos, d.ronda) : [];
  const cls = ['ag-dia', habil ? '' : 'nohabil', f === hoy ? 'hoy' : '', f < hoy ? 'pasado' : '',
               fuera ? 'fuera' : '', _resaltado && todos.some(i => i.lote === _resaltado) ? 'res' : '']
    .filter(Boolean).join(' ');
  const fer = d && d.feriado ? `<span class="ag-fer" title="${escA(d.feriado)}">${esc(d.feriado)}</span>` : '';
  const cab = `<div class="ag-cab"><span>${DIAS[dow]} <b>${f.slice(8, 10)}</b>${compacto ? '' : '/' + f.slice(5, 7)}</span>${fer}</div>`;
  if (!d) return `<div class="${cls}">${cab}</div>`;

  const verA = _filtro !== 'trasiegos', verT = _filtro !== 'analisis';
  let cuerpo = '';
  if (verA && (d.habil || d.analisis.length)) cuerpo += _barra('Análisis', d.analisis.length, d.cupoA, d.excedidoA);
  if (verT && (d.habil || d.trasiegos.length)) cuerpo += _barra('Trasiegos', d.trasiegos.length, d.cupoT, d.excedidoT);
  if (verT) cuerpo += compacto
    ? d.trasiegos.map(t => `<button type="button" class="ag-mini pr-${t.prioridad}${_resaltado === t.lote ? ' res' : ''}" data-ag-tr="${escA(t.lote)}" title="${escA(t.lote + ' · ' + _textoTrasiego(t))}">${t.fijado ? '📌 ' : ''}${esc(t.lote)}</button>`).join('')
    : d.trasiegos.map(_htmlTarjeta).join('');
  if (verA && !compacto && d.analisis.length) cuerpo += `<div class="ag-fichas">${d.analisis.map(_htmlFicha).join('')}</div>`;
  if (verA && d.ronda.length) cuerpo += `<div class="ag-ronda" title="${escA(d.ronda.map(i => i.lote).join(', '))}">🛢 Ronda de tanques <b>${d.ronda.length}</b></div>`;
  const etiqueta = `${DIAS[dow]} ${ddmm(f)}: ${d.analisis.length} análisis, ${d.ronda.length ? d.ronda.length + ' de la ronda de tanques, ' : ''}${d.trasiegos.length} trasiegos`;
  return `<div class="${cls}" data-ag-dia="${f}" role="button" tabindex="0" aria-label="${escA(etiqueta)}">${cab}${cuerpo}</div>`;
}

function _htmlTarjeta(t){
  const meta = [t.barriles ? `${t.barriles} barr.` : '', t.enCurso ? 'en curso' : '', t.fijado ? '📌 reprogramado' : '', t.atrasado ? 'atrasado' : '']
    .filter(Boolean).join(' · ');
  return `<button type="button" class="ag-tarj pr-${t.prioridad}${_resaltado === t.lote ? ' res' : ''}" data-ag-tr="${escA(t.lote)}" title="${escA(_textoTrasiego(t))}">
<span class="ag-punto"></span><b>${esc(t.lote)}</b> <span class="ag-var">${esc(t.variedad)}</span>${meta ? `<span class="ag-meta">${esc(meta)}</span>` : ''}</button>`;
}

function _htmlFicha(i){
  return `<span class="ag-ficha p${i.prioridad}${_resaltado === i.lote ? ' res' : ''}" title="${escA(i.lote + ' · ' + i.motivo)}">${esc(i.lote)}</span>`;
}

/* ---------- panel del dia ---------- */

function _htmlPanelDia(d, f){
  const titulo = `${DIAS[diaSemana(f)]} ${ddmm(f)}${d && d.feriado ? ' · ' + d.feriado : ''}`;
  const cab = `<div class="ag-panel-cab"><h3>${esc(titulo)}</h3><button type="button" class="btn" data-ag-cerrar aria-label="Cerrar">✕</button></div>`;
  if (!d) return `<dialog class="ag-panel" aria-label="${escA(titulo)}">${cab}<p class="ag-vacio">Fuera del horizonte planificado.</p></dialog>`;
  const an = d.analisis, tr = d.trasiegos;
  const liA = an.map(i => `<li><span class="ag-p p${i.prioridad}"></span><b>${esc(i.lote)}</b> <span class="ag-var">${esc(i.variedad)}</span> <span class="ag-mot">${esc(i.motivo)}</span></li>`).join('');
  const liT = tr.map(t => `<li class="pr-${t.prioridad}"><span class="ag-punto"></span><b>${esc(t.lote)}</b> <span class="ag-var">${esc(t.variedad)}</span> <span class="ag-mot">${esc(_textoTrasiego(t))}</span><button type="button" class="btn" data-ag-tr="${escA(t.lote)}">OT / Reprogramar…</button></li>`).join('');
  // Respeta el filtro de la barra: con "Trasiegos" no se ven los analisis, y al reves.
  const ro = d.ronda;
  const liR = ro.map(i => `<li><span class="ag-p p6"></span><b>${esc(i.lote)}</b> <span class="ag-var">${esc(i.variedad)}</span> <span class="ag-mot">${esc(i.vasija)}</span></li>`).join('');
  const secA = _filtro === 'trasiegos' ? '' : `<section><h4>Análisis · ${an.length}/${d.cupoA}</h4>
${an.length || ro.length ? `<button type="button" class="btn primary" data-ag-orden="${f}">📝 Armar orden de muestras del día${ro.length ? ` (${an.length + ro.length})` : ''}</button>` : ''}
<ul class="ag-lista">${liA || '<li class="ag-vacio">Nada programado.</li>'}</ul></section>
${ro.length ? `<section><h4>🛢 Ronda de tanques · ${ro.length}</h4>
<p class="ag-nota">Todos los lotes fuera de barricas que no tienen análisis esta semana. Cupo aparte; el día se cambia en Configuración → Agenda.</p>
<ul class="ag-lista">${liR}</ul></section>` : ''}`;
  const secT = _filtro === 'analisis' ? '' : `<section><h4>Trasiegos · ${tr.length}/${d.cupoT}</h4>
<ul class="ag-lista">${liT || '<li class="ag-vacio">Nada programado.</li>'}</ul></section>`;
  return `<dialog class="ag-panel" aria-label="${escA(titulo)}">${cab}
${secA}
${secT}
</dialog>`;
}

/* ---------- menu de un trasiego: ir a la OT o reprogramar ---------- */

function _itemTrasiego(p, lote){
  for (const d of p.dias){ const t = d.trasiegos.find(x => x.lote === lote); if (t) return t; }
  return p.bandeja.trasiegos.find(x => x.lote === lote) || null;
}

function _htmlMenuTrasiego(p, lote){
  const t = _itemTrasiego(p, lote);
  const cab = `<div class="ag-panel-cab"><h3>Trasiego · ${esc(lote)}</h3><button type="button" class="btn" data-ag-cerrar aria-label="Cerrar">✕</button></div>`;
  const abre = `<dialog class="ag-menu" aria-label="Trasiego ${escA(lote)}">${cab}`;
  if (!t) return `${abre}<p class="ag-vacio">Este lote ya no tiene trasiego en la agenda.</p></dialog>`;
  const fin = p.dias[p.dias.length - 1].fecha;
  const info = `<p class="ag-menu-info"><span class="ag-var">${esc(t.variedad)}</span>${t.barriles ? ` · ${t.barriles} barr.` : ''}<br>
<span class="ag-mot">${esc(_textoTrasiego(t))}</span>${t.programado ? `<br>En la agenda: <b>${DIAS[diaSemana(t.programado)]} ${ddmm(t.programado)}</b>` : ''}</p>`;
  if (t.enCurso) return `${abre}${info}
<p class="ag-vacio">Ya tiene la OT ${esc(t.enCurso.ot || 's/n')} emitida: el día lo manda esa OT (Movimientos → Órdenes de trabajo).</p></dialog>`;
  return `${abre}${info}
<button type="button" class="btn primary" data-ag-ot="${escA(lote)}">🛢 Ir a la OT de trasiego</button>
<div class="ag-menu-rep">
  <label for="agRepFecha">📅 Reprogramar para el</label>
  <div class="ag-menu-fila"><input type="date" id="agRepFecha" min="${p.hoy}" max="${fin}" value="${escA(t.programado && t.programado >= p.hoy ? t.programado : p.hoy)}">
  <button type="button" class="btn" data-ag-mover="${escA(lote)}">Mover</button></div>
  ${t.fijado ? `<button type="button" class="btn ag-link" data-ag-soltar="${escA(lote)}">↺ Volver al día automático</button>` : ''}
</div>
</dialog>`;
}

const _esFijadoDe = (lote) => (a) => a && a.clase === 'fijado' && a.tipo === 'trasiego' && String(a.lote ?? '').trim() === lote;

/* Guarda la decision en datos.agenda: un 'fijado' por lote (reprogramar de
 * nuevo lo reemplaza). No se poda (spec §5): el motor ignora los cumplidos. */
function _fijarTrasiego(lote, fecha){
  const d = DATOS();
  if (!d) return false;
  const quien = usuarioActual() || pedirUsuario();
  if (!quien) return false;
  if (!Array.isArray(d.agenda)) d.agenda = [];
  const el = new Date().toISOString();
  const ya = d.agenda.filter(_esFijadoDe(lote));
  if (ya.length) for (const a of ya){ a.fecha = fecha; a.por = quien; a.el = el; }
  else d.agenda.push({ id: 'ag-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                       clase: 'fijado', tipo: 'trasiego', lote, fecha, por: quien, el });
  markDirty();
  return true;
}

function _soltarTrasiego(lote){
  const d = DATOS();
  if (!d || !Array.isArray(d.agenda)) return;
  const quedan = d.agenda.filter(a => !_esFijadoDe(lote)(a));
  if (quedan.length === d.agenda.length) return;
  d.agenda = quedan;
  markDirty();
}

/* ---------- eventos ---------- */

function _moverMes(f, n){
  const m0 = Number(f.slice(5, 7)) - 1 + n;
  const y = Number(f.slice(0, 4)) + Math.floor(m0 / 12);
  const m = ((m0 % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

async function _alClic(e){
  const el = e.target.closest('[data-ag-nav],[data-ag-modo],[data-ag-filtro],[data-ag-lote],[data-ag-orden],[data-ag-ot],[data-ag-tr],[data-ag-mover],[data-ag-soltar],[data-ag-cerrar],[data-ag-dia]');
  if (!el) return;
  const ds = el.dataset;
  if (ds.agNav !== undefined){
    const n = Number(ds.agNav);
    if (n === 0){
      _ancla = _modo === 'semana' ? lunesDe(_plan.hoy) : _plan.hoy;
      _dashFallo = false; // "Hoy" reintenta traer las alertas si fallaron
    }
    else _ancla = _modo === 'semana' ? sumarDias(_ancla, 7 * n) : _moverMes(_ancla, n);
  } else if (ds.agModo){
    const antes = _modo;
    _modo = ds.agModo;
    _gf('modo', _modo);
    if (_modo === 'semana') _ancla = lunesDe(_ancla);
    else if (antes === 'semana'){
      // La semana puede cruzar dos meses: si hoy cae en ella manda hoy, si no su mitad.
      const h = _plan.hoy;
      _ancla = (h >= _ancla && h <= sumarDias(_ancla, 6)) ? h : sumarDias(_ancla, 3);
    }
  } else if (ds.agFiltro){
    _filtro = ds.agFiltro;
    _gf('filtro', _filtro);
  } else if (ds.agLote !== undefined){
    _resaltado = _resaltado === ds.agLote ? '' : ds.agLote;
    if (_resaltado && ds.agFecha) _ancla = _modo === 'semana' ? lunesDe(ds.agFecha) : ds.agFecha;
  } else if (ds.agOrden){
    const d = _plan.dias.find(x => x.fecha === ds.agOrden);
    const lotes = (d ? d.analisis.concat(d.ronda).map(i => i.lote) : []).filter(Boolean);
    _diaAbierto = null;
    _cerrarDialogo(); // el modal deja inerte la pagina: cerrarlo antes de irse
    location.href = '/lotes/?orden=' + encodeURIComponent('nueva:muestras') +
      '&lotes=' + encodeURIComponent(lotes.join(',')) +
      '&volver=' + encodeURIComponent('/ordenes/?v=pendientes');
    return;
  } else if (ds.agOt){
    // La OT sale con la fecha del dia agendado (si ya paso, la de hoy).
    const t = _itemTrasiego(_plan, ds.agOt);
    const fecha = t && t.programado && t.programado > _plan.hoy ? t.programado : '';
    _diaAbierto = null; _trAbierto = null;
    _cerrarDialogo(); // el modal deja inerte la pagina: cerrarlo antes de irse
    emitirOTDesdeAgenda([ds.agOt], fecha);
    return;
  } else if (ds.agTr){
    _trAbierto = ds.agTr;
    _foco = '[data-ag-ot], .ag-menu [data-ag-cerrar]';
  } else if (ds.agMover){
    const inp = $('agRepFecha');
    const f = inp ? inp.value : '';
    if (!f){ avisar('Elegí una fecha.', { tipo: 'mal' }); return; }
    if (f < inp.min || f > inp.max){ avisar(`La fecha tiene que estar entre el ${ddmm(inp.min)} y el ${ddmm(inp.max)}.`, { tipo: 'mal' }); return; }
    const dia = _plan.dias.find(x => x.fecha === f);
    if (dia && !dia.habil && !await confirmar({ titulo: 'Día no hábil', texto: `El ${ddmm(f)} no es día hábil${dia.feriado ? ' (' + dia.feriado + ')' : ''}.`, si: 'Reprogramar igual', no: 'Elegir otro día' })) return;
    if (!_fijarTrasiego(ds.agMover, f)) return;
    _cerrarMenu();
    _resaltado = ds.agMover;
    _ancla = _modo === 'semana' ? lunesDe(f) : f;
  } else if (ds.agSoltar){
    _soltarTrasiego(ds.agSoltar);
    _cerrarMenu();
  } else if (ds.agCerrar !== undefined){
    if (_trAbierto) _cerrarMenu(); else _cerrarDia();
  } else if (ds.agDia){
    _abrirDia(ds.agDia);
  }
  renderAgenda();
}

/* Cerrar el menu de un trasiego vuelve al panel del dia si venia de ahi. */
function _cerrarMenu(){
  _foco = _diaAbierto ? '[data-ag-cerrar]' : '';
  _trAbierto = null;
}

function _alTecla(e){
  if (e.key === 'Escape' && _trAbierto){ e.preventDefault(); _cerrarMenu(); renderAgenda(); return; }
  if (e.key === 'Escape' && _diaAbierto){ e.preventDefault(); _cerrarDia(); renderAgenda(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-ag-dia]')){
    e.preventDefault();
    _abrirDia(e.target.dataset.agDia);
    renderAgenda();
  }
}

function _cerrarDialogo(){
  const sec = $('tab-agenda');
  const dlg = sec && sec.querySelector('dialog.ag-panel, dialog.ag-menu');
  if (dlg && dlg.open) dlg.close();
}

/* El dialogo se cerro por su cuenta (cancel nativo, etc.): olvidarlo. Los que
 * saca el propio redibujo ya estan fuera del documento y no llegan aca. */
function _alCerrarDialogo(e){
  if (!e.target.matches) return;
  if (e.target.matches('dialog.ag-menu') && _trAbierto){ _cerrarMenu(); renderAgenda(); return; }
  if (!e.target.matches('dialog.ag-panel') || !_diaAbierto) return;
  _cerrarDia();
  renderAgenda();
}

function _alDesplegar(e){
  const g = e.target.dataset && e.target.dataset.agGrupo;
  if (!g) return;
  if (e.target.open) _gruposAbiertos.add(g); else _gruposAbiertos.delete(g);
}
