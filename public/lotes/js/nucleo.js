/* ===== Lotes CIW — nucleo: estado compartido, guardado y navegacion ===== */
'use strict';

import { queryAnios } from './selector-anios.js';
import { crearAutoguardado } from './autoguardado.js';
import { tomarFoto, diferencia, aplicar, crearHistorial, describirPaso, describirCambio } from './deshacer.js';
import { CADA_MS, decidirActualizacion, ocupadoSegun } from './en-vivo.js';

/* ---------- estado global ----------
 * DATOS es una variable mutable que comparten todas las vistas. Los modulos ES
 * no permiten reasignar un binding exportado desde afuera, asi que se expone
 * por accesor: DATOS() para leer, setDatos() para reemplazar.
 * Forma: {meta, config, lotes, analisis, estado_lote, excepciones_analisis, vasijas, mermas}
 */
let _datos = null;
export function DATOS(){ return _datos; }
export function setDatos(d){ _datos = d; }

let dirty = false;

/* ---------- lote activo (para la ficha) ---------- */
let _loteActivo = '';
export function loteActivo(){ return _loteActivo; }
export function setLoteActivo(v){ _loteActivo = String(v ?? ''); }

export function irALote(loteStr){
  setLoteActivo(String(loteStr));
  mostrarTab('ficha');
}

/* ---------- helpers ---------- */
export const $ = id => document.getElementById(id);
export const esc  = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export const escA = v => String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
export const num  = v => { if (v===''||v==null) return null; const n=parseFloat(String(v).replace(',','.')); return isNaN(n)?null:n; };

/* ---------- estado guardar ---------- */
/* Copia del documento tal como lo trajo esta pantalla (o como quedó en su
 * último guardado): contra ella se calcula qué cambió acá, para combinarlo con
 * lo que guardaron otros dispositivos (shared/fusion.js). */
let _base = null;
const FUSION = window.CIWFusion;
const borradorActual = () => ({ base: _base, local: _datos });
/* Cuenta las ediciones: si mientras viaja un guardado se edita algo más, al
 * volver la respuesta la pantalla NO queda como guardada (eso no se envió). */
let _ediciones = 0;

/* ---------- autoguardado ----------
 * Cada cambio programa un guardado a los 2 s (autoguardado.js decide cuando).
 * Los guardados pasan por una cola: el autoguardado y los `await guardar()` de
 * las vistas que imprimen nunca mandan dos POST a la vez. */
let _cola = Promise.resolve();
function _guardarEnCola(forzar){
  const p = _cola.then(() => _guardar(forzar));
  _cola = p.catch(() => {});
  return p;
}

const _auto = crearAutoguardado({
  ejecutar: () => _guardarEnCola(false),
  avisar(estadoAuto, info){
    if (estadoAuto === 'guardando') _estado('⟳ Guardando…', 'dirty');
    else if (estadoAuto === 'reintentando') _estado('⚠ Sin conexión — reintentando en ' + Math.round(info.ms / 1000) + ' s', 'dirty');
    else if (estadoAuto === 'parado') _estado(
      info.motivo === 'sesion'   ? '⚠ Sesión cerrada: iniciá sesión y apretá Ctrl+S' :
      info.motivo === 'permiso'  ? '⚠ Solo lectura: los cambios no se guardan' :
      info.motivo === 'conflicto'? '⚠ No se pudo combinar: recargá la página' :
                                   '⚠ No se guardó: apretá Ctrl+S para reintentar', 'dirty');
  },
});

function _estado(texto, clase){
  const s = $('statusBar');
  s.textContent = texto;
  s.className = 'status ' + (clase || '');
}

/** Cartel corto al pie (deshacer, actualizaciones). Se pisa con el siguiente. */
let _timerAviso = null;
export function avisoBreve(texto, tipo){
  let el = $('avisoBreve');
  if (!el){
    el = document.createElement('div');
    el.id = 'avisoBreve';
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;' +
      'padding:8px 16px;border-radius:8px;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.35);' +
      'background:#2b3340;color:#fff;max-width:80vw;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = texto;
  el.style.background = tipo === 'error' ? '#7a2b2b' : tipo === 'ok' ? '#24503a' : '#2b3340';
  el.style.display = 'block';
  clearTimeout(_timerAviso);
  _timerAviso = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

export function hayCambiosSinGuardar(){ return dirty || _auto.pendiente(); }
export function guardarAhora(){ return _auto.ahora(); }

/* El nombre se pide con el primer cambio y una sola vez por pagina: con
 * autoguardado, pedirlo en medio de un guardado sacaba un cartel a los 2 s de
 * cualquier edicion. */
let _nombrePedido = false;

/* Marca el documento como cambiado sin abrir un paso de deshacer. Lo usan
 * markDirty (que ademas abre el paso, Tarea 6) y deshacer/rehacer. */
function _marcarCambiado(){
  _ediciones++;
  dirty = true;
  invalidarVistas();
  _estado('● Cambios sin guardar', 'dirty');
  if (FUSION && _datos) FUSION.borrador.programar('lotes', borradorActual);
  _auto.cambio();
}

export function markDirty(){
  if (!_nombrePedido && !usuarioActual()){ _nombrePedido = true; pedirUsuario(true); }
  _marcarCambiado();
  _abrirPaso();
}
export function markSaved(){
  dirty = false;
  invalidarVistas();
  _estado('✓ Guardado (v' + DATOS().meta.version + ')', 'saved');
  _vivoParado = false;
}

/* ---------- deshacer / rehacer de toda la pagina ----------
 * _foto es como estaba el documento despues del ultimo paso. Cada markDirty
 * abre un paso; a los 300 ms sin otro (o al empezar un guardado, o al apretar
 * Ctrl+Z) se compara contra la foto y lo que cambio se apila. Lo que llega de
 * otros (409, en vivo, borrador recuperado, ajustes antes de guardar) mueve la
 * foto SIN apilar: tu Ctrl+Z nunca deshace lo ajeno. */
const _historial = crearHistorial(100);
let _foto = null;
let _pasoAbierto = false, _timerPaso = null, _vistaDelPaso = null;

function _abrirPaso(){
  if (!_foto) return;
  if (!_pasoAbierto) _vistaDelPaso = vistaActiva();
  _pasoAbierto = true;
  clearTimeout(_timerPaso);
  _timerPaso = setTimeout(cerrarPaso, 300);
}

export function cerrarPaso(){
  clearTimeout(_timerPaso);
  _timerPaso = null;
  if (!_pasoAbierto || !_foto || !_datos){ _pasoAbierto = false; return; }
  _pasoAbierto = false;
  const { cambios, foto } = diferencia(_foto, _datos);
  _foto = foto;
  _historial.apilar({ cambios, etiqueta: describirPaso(cambios), vista: _vistaDelPaso });
  _vistaDelPaso = null;
}

function _nuevaFoto(){ _foto = _datos ? tomarFoto(_datos) : null; }

const NOMBRE_VISTA = {
  lotes: 'Lotes', analisis: 'Análisis', movimientos: 'Movimientos', so2: 'SO2', config: 'Config',
  orden: 'Orden de muestras', ordencorr: 'Orden de corrección', cargar: 'Cargar', ficha: 'Ficha',
  dashboard: 'Dashboard', tablero: 'Tablero', cruce: 'Cruce',
};

function _mover(sentido){
  if (!_datos) return;
  cerrarPaso();
  const paso = sentido === 'deshacer' ? _historial.deshacer() : _historial.rehacer();
  if (!paso){ avisoBreve(sentido === 'deshacer' ? 'No hay nada para deshacer.' : 'No hay nada para rehacer.', 'info'); return; }
  const { aplicados, salteados } = aplicar(_datos, paso.cambios, sentido);
  _nuevaFoto();   // lo que quedo es la base nueva: deshacer no es un paso
  if (aplicados){
    _marcarCambiado();
    document.dispatchEvent(new CustomEvent('lotes:datos-recargados'));
    invalidarVistas();
    renderActivo();
  }
  if (salteados.length){
    avisoBreve('No se deshizo ' + describirCambio(salteados[0]) +
      (salteados.length > 1 ? ' (y ' + (salteados.length - 1) + ' más)' : '') +
      ': lo cambió otra persona después.', 'error');
    return;
  }
  const donde = paso.vista && paso.vista !== vistaActiva() && NOMBRE_VISTA[paso.vista] ? ' (' + NOMBRE_VISTA[paso.vista] + ')' : '';
  avisoBreve((sentido === 'deshacer' ? 'Deshecho: ' : 'Rehecho: ') + paso.etiqueta + donde, 'ok');
}
export function deshacer(){ _mover('deshacer'); }
export function rehacer(){ _mover('rehacer'); }
document.addEventListener('lotes:deshacer', deshacer);
document.addEventListener('lotes:rehacer', rehacer);

/* ---------- en vivo: lo que guardan los demas ----------
 * Cada 15 s, con la pestaña a la vista, se pregunta la version (consulta
 * minima). Si otro guardo y esta pantalla esta libre, se baja el documento y
 * se redibuja. Lo que llega no entra al deshacer (_nuevaFoto). */
let _vivoParado = false, _vivoMirando = false;

function _leerActivo(){
  const a = document.activeElement;
  if (!a || a === document.body) return null;
  return {
    tag: a.tagName, tipo: a.type || '', enTabla: !!a.closest('table'),
    valor: a.value, valorOriginal: a.defaultValue, editable: !!a.isContentEditable,
  };
}

async function _mirarVersion(){
  if (_vivoParado || _vivoMirando || !_datos || document.visibilityState !== 'visible') return;
  _vivoMirando = true;
  try {
    let info;
    try {
      const r = await fetch(API + '/version', { cache: 'no-store' });
      if (r.status === 401){ _vivoParado = true; return; }
      if (!r.ok) return;
      info = await r.json();
    } catch (e) { return; }
    const decision = decidirActualizacion({
      versionServidor: info.version,
      versionLocal: (_datos.meta || {}).version,
      pendiente: hayCambiosSinGuardar(),
      ocupado: ocupadoSegun({ overlayAbierto: $('overlay').classList.contains('show'), activo: _leerActivo() }),
    });
    if (decision === 'adoptar') await _adoptarDelServidor(info);
  } finally { _vivoMirando = false; }
}

async function _adoptarDelServidor(info){
  const edicionesAntes = _ediciones;
  let nuevo;
  try {
    const r = await fetch(API + '/datos', { cache: 'no-store' });
    if (!r.ok) return;
    nuevo = await r.json();
  } catch (e) { return; }
  // Se edito mientras bajaba: se descarta, lo combina el 409 del autoguardado.
  if (_ediciones !== edicionesAntes || hayCambiosSinGuardar()) return;
  _antesDeCambioAjeno();
  setDatos(nuevo);
  completarSecciones();
  _base = FUSION ? FUSION.clonar(DATOS()) : null;
  _despuesDeCambioAjeno();
  document.dispatchEvent(new CustomEvent('lotes:datos-recargados'));
  invalidarVistas();
  cargarDashboard();
  renderActivo();
  _estado('↻ Actualizado con cambios de ' + (info.autor || 'otro usuario') + ' (v' + DATOS().meta.version + ')', 'saved');
}

/** Arranca la consulta periodica. La llama app.js despues de cargar. */
export function arrancarEnVivo(){
  setInterval(_mirarVersion, CADA_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _mirarVersion();
  });
}

window.addEventListener('beforeunload', e => {
  if (hayCambiosSinGuardar()){ e.preventDefault(); e.returnValue = ''; }
});

/* ---------- usuario (trazabilidad) ---------- */
export function usuarioActual(){ try { return localStorage.getItem('lotes_usuario') || ''; } catch(e) { return ''; } }
export function pedirUsuario(forzar){
  let u = usuarioActual();
  if (!u || forzar){
    const r = (prompt('¿Quién está usando la app?\n(Queda registrado en cada guardado, para el historial.)', u||'') || '').trim();
    if (r){ u = r; try { localStorage.setItem('lotes_usuario', u); } catch(e){} }
  }
  $('usuario').textContent = '👤 ' + (u || '(sin nombre)');
  return u;
}

/* ---------- overlay ---------- */
export function mostrarOverlay(html){ $('overlayBox').innerHTML = html; $('overlay').classList.add('show'); }
export function cerrarOverlay(){ $('overlay').classList.remove('show'); }

/* ---------- historial ---------- */
export async function verHistorial(){
  try {
    const r = await fetch(API+'/historial');
    if (!r.ok){ alert('No se pudo cargar el historial (' + r.status + ').'); return; }
    const j = await r.json();
    const filas = (j.historial || []).map(h =>
      `<tr><td class="num">v${esc(h.version)}</td><td style="white-space:nowrap">${esc(h.ts||'')}</td>`+
      `<td>${esc(h.autor||'')}</td><td>${esc(h.resumen||'')}</td></tr>`).join('');
    mostrarOverlay(
      '<h2 style="margin-top:0">🕘 Historial de guardados</h2>'+
      '<p style="color:var(--muted);font-size:12px;margin-top:-6px">Quién guardó, cuándo y qué cambió.</p>'+
      '<div style="max-height:60vh;overflow:auto"><table class="hist">'+
      '<thead><tr><th>Versión</th><th>Fecha</th><th>Autor</th><th>Cambios</th></tr></thead>'+
      '<tbody>'+(filas||'<tr><td colspan="4" style="color:var(--muted)">Sin registros aún.</td></tr>')+
      '</tbody></table></div>'+
      '<div style="margin-top:12px;text-align:right"><button class="btn" onclick="cerrarOverlay()">Cerrar</button></div>'
    );
  } catch(e) { alert('No se pudo cargar el historial.'); }
}

/* ---------- avisos (banner de estado) ---------- */
export async function refrescarAvisos(){
  try {
    const r = await fetch(API+'/estado'); if (!r.ok) return;
    const j = await r.json(); const el = $('avisos');
    if (j.avisos && j.avisos.length){
      el.innerHTML = j.avisos.map(a => `<div class="aviso"><b>⚠️ Atención:</b> ${esc(a)}</div>`).join('');
      el.style.display = 'block';
    } else el.style.display = 'none';
  } catch(e) { /* servidor sin /api/estado: se omite */ }
}

/* ---------- info de red ---------- */
let _urlRed = '';
export async function refrescarInfo(){
  try {
    const r = await fetch(API+'/info'); if (!r.ok) return;
    const j = await r.json(); const ip = (j.ips||[])[0];
    if (ip) {
      _urlRed = 'http://' + ip + ':' + j.port;
      const el = $('redInfo');
      if (el) el.textContent = '📱 Red: ' + esc(ip) + ':' + j.port;
    }
  } catch(e) {}
}

/* ---------- registro de vistas ----------
 * TAB_RENDER dejo de ser un objeto literal: crearia el ciclo de imports
 * nucleo -> vistas -> nucleo. Cada vista se registra sola al importarse.
 */
const _vistas = {};
export function registrarVista(nombre, fn){ _vistas[nombre] = fn; }
export function vistaDe(nombre){ return _vistas[nombre]; }

/* ---------- cache de render por pestaña ----------
 * Rearmar una pestaña cuesta caro con los datos reales: Analisis arma ~3.500
 * filas con un <input> por celda (2,8 s), Lotes y Movimientos ~1,5 s cada una.
 * Antes eso se pagaba en CADA clic de pestaña aunque nada hubiera cambiado.
 *
 * Ahora cada pestaña recuerda la "generacion" de datos con la que se dibujo, y
 * volver a ella sin cambios de por medio no la rearma: el DOM que quedo sigue
 * siendo correcto. La generacion avanza con todo lo que puede cambiar lo que
 * se ve: markDirty (cualquier edicion), markSaved (sube la version), la carga
 * de DATOS y la llegada de /api/dashboard.
 *
 * Las que dependen de algo que no pasa por aca se dibujan siempre: la ficha
 * (depende del lote elegido), el cruce y la orden de correccion (leen el Mapa
 * de Barriles del servidor), y cargar/config (baratas y con estado propio).
 * Los repintados que una vista hace sola (filtros, orden, buscador) no pasan
 * por este cache: siguen igual que antes. */
const _SIEMPRE = new Set(['ficha', 'cruce', 'ordencorr', 'cargar', 'config']);
let _gen = 1;
const _genDibujada = {};
export function invalidarVistas(){ _gen++; }
/** Obliga a rearmar UNA pestaña la proxima vez que se muestre. */
export function invalidarVista(nombre){ delete _genDibujada[nombre]; }
export function vistaActiva(){
  const b = document.querySelector('.tabs button.active');
  return b ? b.dataset.v : 'dashboard';
}
function _dibujar(nombre, forzar){
  const fn = _vistas[nombre];
  if (!fn || !DATOS()) return;
  if (!forzar && !_SIEMPRE.has(nombre) && _genDibujada[nombre] === _gen) return;
  _genDibujada[nombre] = _gen;
  fn();
}

/* Igual que vistaDe pero falla fuerte. Para los llamadores que dan por hecho
 * que la vista existe: si un nombre esta mal escrito o falta el import en
 * app.js, vistaDe() devuelve undefined y el undefined() se lo come el catch
 * de cargarDashboard, dejando el dashboard sin pintar y la consola limpia.
 * Con esto el error se ve. */
function _vistaObligatoria(nombre){
  const fn = _vistas[nombre];
  if (!fn) throw new Error('vista no registrada: ' + nombre + ' (falta el import en app.js?)');
  return fn;
}

/* Hooks que corren despues de cargar DATOS y antes del primer render.
 * Mismo motivo que el registro de vistas: initFiltrosLotes vive en
 * vista-lotes.js y nucleo no puede importarla sin cerrar el ciclo. */
const _inits = [];
export function registrarInit(fn){ _inits.push(fn); }

/* ---------- cargar datos ---------- */
export async function cargarDatos(){
  try {
    const r = await fetch(API+'/datos');
    if (!r.ok){
      if (r.status === 401){ location.replace('/login.html'); return; }
      const j = await r.json().catch(() => ({}));
      if (j.error === 'debe_cambiar_clave'){ location.replace('/cambiar-clave.html'); return; }
      $('statusBar').textContent = 'Error al cargar ('+r.status+')' + (j.detalles && j.detalles[0] ? ': ' + j.detalles[0] : '');
      return;
    }
    setDatos(await r.json());
    completarSecciones();
    _base = FUSION ? FUSION.clonar(DATOS()) : null;
    // Cambios que quedaron sin guardar en este equipo (recarga, corte, sesión vencida).
    const recuperado = FUSION ? await FUSION.recuperar('lotes', DATOS()) : null;
    if (recuperado){ setDatos(recuperado); completarSecciones(); }
    // Lo cargado (y el borrador recuperado) es la base: no hay nada para deshacer.
    _historial.limpiar();
    _nuevaFoto();
    // Los objetos de DATOS() acaban de ser reemplazados: las pilas de deshacer
    // de la grilla quedarian apuntando a objetos huerfanos. grilla.js escucha
    // este evento para limpiarse; no se importa directamente para evitar el
    // ciclo grilla->tabla->nucleo->grilla.
    document.dispatchEvent(new CustomEvent('lotes:datos-recargados'));
    markSaved();   // tambien invalida el cache de pestañas
    if (recuperado) _marcarCambiado();
    _inits.forEach(fn => fn());
    renderActivo();
  } catch(e) {
    $('statusBar').textContent = 'Sin conexión con el servidor';
  }
}

function completarSecciones(){
  DATOS().meta                 = DATOS().meta || { version:0 };
  DATOS().lotes                = DATOS().lotes || [];
  DATOS().analisis             = DATOS().analisis || [];
  DATOS().estado_lote          = DATOS().estado_lote || {};
  DATOS().excepciones_analisis = DATOS().excepciones_analisis || [];
  DATOS().vasijas              = DATOS().vasijas || [];
  DATOS().mermas               = DATOS().mermas || [];
}

/* Funciones que corren justo antes de cada POST y pueden tocar DATOS(). Hoy:
 * el cierre de las barricas mermas que el Mapa ya ve llenas (mermas-mapa.js).
 * Van por registro y no por import para no armar el ciclo nucleo -> mermas-mapa -> nucleo. */
const _antesDeGuardar = [];
export function registrarAntesDeGuardar(fn){ _antesDeGuardar.push(fn); }

/* ---------- guardar ----------
 * _guardar devuelve QUE paso, para que el autoguardado sepa si reintentar:
 *   'nada'      no habia cambios
 *   'ok'        guardado
 *   'cancelado' el freno pregunto y se eligio deshacer
 *   'red'       sin conexion, 5xx o error inesperado: se reintenta solo
 *   'sesion'    401: avisa shared/fusion.js; se reintenta con el proximo cambio
 *   'error'     400 que no es el freno: se avisa una vez
 *   'permiso'   403: solo lectura
 *   'conflicto' 409 que no se pudo combinar: hay que recargar
 * Sin alert en los casos que se repiten (red, sesion): con autoguardado serian
 * un cartel cada 2 s. El estado se ve en el statusBar. */
async function _guardar(forzar, intento = 0){
  if (!dirty) return 'nada';
  cerrarPaso();
  let cambioHook = false;
  for (const fn of _antesDeGuardar){
    try { if (fn(DATOS())) { invalidarVistas(); cambioHook = true; } } catch (e) { console.error('antesDeGuardar:', e); }
  }
  // Los ajustes automaticos (cierre de mermas) no son un paso tuyo.
  if (cambioHook) _nuevaFoto();
  DATOS().meta.autor = usuarioActual() || 'desconocido';
  if (FUSION) await FUSION.borrador.guardar('lotes', borradorActual);
  // Lo que se envía es esta foto: si se sigue editando durante el viaje, eso
  // queda pendiente para el próximo guardado.
  const enviado = JSON.stringify(DATOS());
  const edicionesAlEnviar = _ediciones;
  let r;
  try {
    r = await fetch(API+'/datos' + (forzar ? '?forzar=1' : ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: enviado
    });
  } catch(e) {
    return 'red';
  }
  if (r.status === 401) return 'sesion';   // shared/fusion.js ya mostró el aviso
  if (r.status === 400){
    const j = await r.json().catch(() => ({}));
    if (j.error === 'validacion'){
      const det = (j.detalles || []).join('\n• ');
      if (forzar){ alert('No se pudo guardar:\n• ' + det); return 'error'; }
      if (confirm(
        '⚠️ El servidor FRENÓ este guardado para proteger los datos:\n\n• ' + det +
        '\n\n¿Era tu intención? Aceptar = guardar igual (queda registrado como FORZADO en el historial).\nCancelar = deshacer lo último que hiciste.'
      )){
        return _guardar(true);
      }
      _alCancelarFreno();
      return 'cancelado';
    }
    alert('Error al guardar: ' + (j.error || r.status));
    return 'error';
  }
  if (r.status === 409){
    const j = await r.json().catch(() => ({}));
    // Otro dispositivo guardó mientras se editaba acá: se combinan los cambios
    // de los dos y se vuelve a guardar. Nadie pierde lo suyo.
    if (FUSION && _base && j.actual && intento < 4){
      const serv = j.actual;
      _antesDeCambioAjeno();
      setDatos(FUSION.fusionarDocumento(_base, DATOS(), serv));
      completarSecciones();
      _base = FUSION.clonar(serv);
      _despuesDeCambioAjeno();
      // Los objetos de DATOS() cambiaron: la pestaña visible se redibuja YA,
      // aunque el reintento falle. Si no, sus filas seguían apuntando a los
      // objetos viejos: las ediciones se perdían y el ✕ de Lotes borraba otro
      // lote (indexOf daba -1).
      document.dispatchEvent(new CustomEvent('lotes:datos-recargados'));
      invalidarVistas();
      try { renderActivo(); } catch (e) { console.error('renderActivo tras fusionar:', e); }
      return _guardar(forzar, intento + 1);
    }
    mostrarOverlay(
      '<h2 style="margin-top:0;color:#ffd766">Conflicto de versión</h2>'+
      '<p style="color:var(--muted)">Otra PC guardó cambios mientras editabas y no se pudieron combinar solos.</p>'+
      '<p style="color:var(--muted);font-size:13px">Tus cambios quedaron guardados en este equipo: al recargar se te ofrece recuperarlos.</p>'+
      '<button class="btn primary" onclick="location.reload()">🔄 Recargar y recuperar</button>'
    );
    return 'conflicto';
  }
  if (r.status === 403){
    const j = await r.json().catch(() => ({}));
    alert('No se pudo guardar: ' + ((j.detalles && j.detalles[0]) || 'tu usuario no tiene permiso para guardar en Lotes.'));
    return 'permiso';
  }
  if (!r.ok) return 'red';
  const j = await r.json();
  DATOS().meta.version = j.version;
  DATOS().meta.actualizado = j.actualizado;
  // La base pasa a ser lo que efectivamente llegó al servidor, no la pantalla
  // actual (que puede tener ediciones posteriores, todavía sin enviar).
  if (FUSION){ _base = JSON.parse(enviado); _base.meta.version = j.version; _base.meta.actualizado = j.actualizado; }
  if (_ediciones !== edicionesAlEnviar){
    // Se editó durante el viaje: queda pendiente (y en el borrador del equipo).
    _marcarCambiado();
    cargarDashboard();
    if (cambioHook || intento > 0) renderActivo();
    return 'ok';
  }
  if (FUSION) FUSION.borrador.borrar('lotes');
  markSaved();
  /* El tablero, el Dashboard y los colores de Lotes salen de /api/dashboard,
   * que el servidor calcula sobre lo GUARDADO. */
  cargarDashboard();
  if (cambioHook || intento > 0) renderActivo();
  if (intento > 0) _estado('✓ Guardado (v' + DATOS().meta.version + ') · combinado con lo que guardaron otros', 'saved');
  if (j.respaldo){
    const s = $('statusBar');
    s.textContent = '✓ Guardado (v' + DATOS().meta.version + ') · respaldo: ' + j.respaldo;
    s.title = 'Respaldo JSON en backups/json/';
  }
  return 'ok';
}

/* Antes de que entre lo de otro: lo tuyo queda anotado como paso. */
function _antesDeCambioAjeno(){ cerrarPaso(); }
/* Despues: lo de otro es la base, no un paso tuyo. */
function _despuesDeCambioAjeno(){ _nuevaFoto(); }
/* El freno de borrado masivo pregunto y se eligio Cancelar. */
function _alCancelarFreno(){ deshacer(); }

/** La de siempre, para las vistas que hacen `await guardar()` antes de
 *  imprimir: guarda YA (corta la espera del autoguardado) y devuelve si quedó
 *  guardado. Acá sí se avisa con un cartel: quien la llama está esperando. */
export async function guardar(forzar){
  const r = await _guardarEnCola(!!forzar);
  if (r === 'red'){
    alert('No se pudo guardar: no hay conexión con el servidor. Tus cambios siguen en pantalla y quedaron guardados en este equipo; se van a guardar solos cuando vuelva la señal.');
    _auto.cambio();
  }
  if (r === 'sesion') _auto.cambio();
  return r === 'ok' || r === 'nada';
}

/* ---------- navegación de pestañas ---------- */
export function mostrarTab(nombre){
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.v === nombre));
  document.querySelectorAll('.view').forEach(s => s.classList.remove('active'));
  const sec = $('tab-' + nombre);
  if (sec) sec.classList.add('active');
  _dibujar(nombre, false);
}

export function renderActivo(){
  _dibujar(vistaActiva(), true);
}

/* ---------- cache del dashboard (compartida por lotes, dashboard, fml y orden) ---------- */
let _dashMap = null;   // Map<lote_str -> {alarmas:[], vencido:bool}>
let _dashData = null;  // respuesta completa de /api/dashboard
let _dashLoading = false;

export function dashMap(){ return _dashMap; }
export function dashData(){ return _dashData; }
export function dashLoading(){ return _dashLoading; }
export function invalidarDashMap(){ _dashMap = null; }

/* Version del documento guardado en el servidor. La lee cargarDashboard para
 * saber si su respuesta ya describe lo ultimo que se guardo. */
const _versionGuardada = () => ((DATOS() || {}).meta || {}).version ?? null;
let _dashPendiente = false;
let _dashPromesa = null;

/* Si ya hay un pedido en vuelo se anota que hace falta otro (ese pedido puede
 * haber salido ANTES de un guardado y traer el tablero viejo) y se devuelve la
 * misma promesa: quien hace `await cargarDashboard()` espera los datos nuevos,
 * no vuelve enseguida con los viejos. */
export function cargarDashboard(){
  if (_dashPromesa){ _dashPendiente = true; return _dashPromesa; }
  _dashPromesa = _cargarDashboard().finally(() => { _dashPromesa = null; });
  return _dashPromesa;
}

async function _cargarDashboard(){
  _dashLoading = true;
  try {
    /* La clave de años y la version con que se pide. Si el selector cambia o
     * alguien guarda mientras viaja, la respuesta describe otra cosa: se
     * descarta y se vuelve a pedir, sin soltar _dashLoading entre medio (sino
     * se superponen dos pedidos en vuelo). */
    let clave, version, j;
    do {
      _dashPendiente = false;
      clave = queryAnios();
      version = _versionGuardada();
      const r = await fetch(API+'/dashboard' + (clave ? '?anios=' + clave : ''));
      if (!r.ok) return;
      j = await r.json();
    } while (queryAnios() !== clave || _versionGuardada() !== version || _dashPendiente);
    _dashData = j;
    _dashMap = new Map();
    for (const e of (j.lotes||[])){
      _dashMap.set(String(e.lote), { alarmas: e.alarmas||[], vencido: e.vencido||false });
    }
    /* Solo se repinta la pestaña que se esta viendo. Antes se rearmaban
     * siempre Lotes y Dashboard aunque estuvieran ocultas (Lotes sola son
     * ~18.000 nodos): ahora las demas quedan marcadas como viejas y se
     * dibujan, ya con los colores del motor, cuando alguien las abre. */
    _vistaObligatoria('lotes');
    _vistaObligatoria('dashboard');
    invalidarVistas();
    const activa = vistaActiva();
    if (['lotes', 'dashboard', 'orden', 'tablero'].includes(activa)) _dibujar(activa, true);
  } catch(e) {
    // Sin dashboard la app sigue andando, solo se omiten los colores. Pero se
    // deja rastro: si lo que fallo fue una vista y no la red, el silencio
    // absoluto haria invisible un bug de registro de vistas.
    console.error('cargarDashboard:', e);
  }
  finally { _dashLoading = false; }
}
