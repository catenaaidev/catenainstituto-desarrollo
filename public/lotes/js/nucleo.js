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
/* _ediciones con que se escribio el borrador por ultima vez. Lo anota el
 * obtener() que se le pasa a borrador.programar, que fusion.js llama recien
 * cuando escribe de verdad (despues de juntar los cambios y esperar el ocio).
 * -1 = no se sabe (fuerza escribir). */
let _edicionesEnBorrador = -1;
const _borradorProgramado = () => { _edicionesEnBorrador = _ediciones; return borradorActual(); };
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
                                   (_textoError || '⚠ No se guardó: apretá Ctrl+S para reintentar'), 'dirty');
  },
});
/* Texto propio para el motivo 'error' cuando lo puso el freno de borrado
 * masivo (Cancelar sin nada para deshacer). Se limpia al empezar cada guardado. */
let _textoError = null;

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
  if (FUSION && _datos) FUSION.borrador.programar('lotes', _borradorProgramado);
  _auto.cambio();
}

export function markDirty(){
  if (!_nombrePedido && !usuarioActual()){ _nombrePedido = true; pedirUsuario(true); }
  _marcarCambiado();
  _abrirPaso();
}
export function markSaved(){
  dirty = false;
  _historial.marcar();   // lo de arriba de esta marca es "lo de este guardado" (freno, Cancelar)
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
  _timerPaso = setTimeout(_cerrarPasoSiNoSeTipea, 300);
}

/* Mientras se tipea en una celda (un <input>/<textarea> de texto dentro de
 * una tabla) los 300 ms no cierran el paso: cada pausa entre letras haria un
 * Ctrl+Z por pedacito de palabra. Se cierra al salir del campo, con Ctrl+Z/Y
 * o al empezar un guardado (los dos llaman a cerrarPaso). */
let _celdaDelPaso = null;
let _esperandoSalirDeCelda = false;

function _tipeandoEnCelda(){
  if (!_escribiendoEnUnCampo()) return null;
  const a = document.activeElement;
  if (a.tagName !== 'INPUT' && a.tagName !== 'TEXTAREA') return null;
  return a.closest('table') ? a : null;
}

function _cerrarPasoSiNoSeTipea(){
  _timerPaso = null;
  const celda = _tipeandoEnCelda();
  if (!celda){ cerrarPaso(); return; }
  _celdaDelPaso = celda;
  if (_esperandoSalirDeCelda) return;   // un solo oyente
  _esperandoSalirDeCelda = true;
  document.addEventListener('focusout', _alSalirDeLaCelda);
}

function _alSalirDeLaCelda(){
  // focusout llega antes de que el foco pase al elemento siguiente.
  setTimeout(() => {
    if (!_esperandoSalirDeCelda) return;
    if (document.activeElement === _celdaDelPaso) return;   // p.ej. cambio de ventana
    cerrarPaso();
  }, 0);
}

export function cerrarPaso(){
  clearTimeout(_timerPaso);
  _timerPaso = null;
  if (_esperandoSalirDeCelda){
    _esperandoSalirDeCelda = false;
    _celdaDelPaso = null;
    document.removeEventListener('focusout', _alSalirDeLaCelda);
  }
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
  orden: 'Orden de muestras', ordencorr: 'Orden de corrección', agregados: 'Otros agregados',
  cargar: 'Cargar', ficha: 'Ficha',
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
  if (salteados.length){ _avisarSalteados(salteados); return; }
  const donde = paso.vista && paso.vista !== vistaActiva() && NOMBRE_VISTA[paso.vista] ? ' (' + NOMBRE_VISTA[paso.vista] + ')' : '';
  avisoBreve((sentido === 'deshacer' ? 'Deshecho: ' : 'Rehecho: ') + paso.etiqueta + donde, 'ok');
}
function _avisarSalteados(salteados){
  avisoBreve('No se deshizo ' + describirCambio(salteados[0]) +
    (salteados.length > 1 ? ' (y ' + (salteados.length - 1) + ' más)' : '') +
    ': lo cambió otra persona después.', 'error');
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

function _ocupado(){
  return ocupadoSegun({ overlayAbierto: $('overlay').classList.contains('show'), activo: _leerActivo() });
}

/* probar: con la sesion vencida (_vivoParado) la consulta periodica no sale,
 * para no sacar el cartel de sesion cada 15 s. Pero al volver a la pestaña
 * (visibilitychange) o a la ventana (focus) se prueba una vez: si ya se
 * inicio sesion en la otra pestaña, el OK vuelve a prender el en vivo. */
async function _mirarVersion(probar){
  if ((_vivoParado && probar !== true) || _vivoMirando || !_datos || document.visibilityState !== 'visible') return;
  _vivoMirando = true;
  try {
    let info;
    try {
      const r = await fetch(API + '/version', { cache: 'no-store' });
      if (r.status === 401){ _vivoParado = true; return; }
      if (!r.ok) return;
      _vivoParado = false;
      info = await r.json();
    } catch (e) { return; }
    const decision = decidirActualizacion({
      versionServidor: info.version,
      versionLocal: (_datos.meta || {}).version,
      pendiente: hayCambiosSinGuardar(),
      ocupado: _ocupado(),
    });
    if (decision === 'adoptar') await _adoptarDelServidor(info);
  } finally { _vivoMirando = false; }
}

async function _adoptarDelServidor(info){
  const edicionesAntes = _ediciones;
  let nuevo;
  try {
    const r = await fetch(API + '/datos', { cache: 'no-store' });
    if (r.status === 401){ _vivoParado = true; return; }
    if (!r.ok) return;
    nuevo = await r.json();
  } catch (e) { return; }
  // Se edito mientras bajaba: se descarta, lo combina el 409 del autoguardado.
  if (_ediciones !== edicionesAntes || hayCambiosSinGuardar()) return;
  // Se abrio un overlay o se empezo a tipear mientras bajaba: se descarta; la
  // proxima consulta lo vuelve a intentar.
  if (_ocupado()) return;
  _antesDeCambioAjeno();
  setDatos(nuevo);
  completarSecciones();
  _base = FUSION ? FUSION.clonar(DATOS()) : null;
  _despuesDeCambioAjeno();
  document.dispatchEvent(new CustomEvent('lotes:datos-recargados'));
  invalidarVistas();
  cargarDashboard();
  try { renderActivo(); } catch (e) { console.error('renderActivo tras actualizar en vivo:', e); }
  _estado('↻ Actualizado con cambios de ' + (info.autor || 'otro usuario') + ' (v' + DATOS().meta.version + ')', 'saved');
}

/** Arranca la consulta periodica. La llama app.js despues de cargar. */
export function arrancarEnVivo(){
  setInterval(_mirarVersion, CADA_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _mirarVersion(true);
  });
  window.addEventListener('focus', () => { if (_vivoParado) _mirarVersion(true); });
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
/* La vista que se esta mostrando. No se lee del boton activo: las tres
 * sub-pestañas de Correcciones comparten UN boton (data-v="so2"), y leer el
 * boton haria que renderActivo redibuje la bitacora estando en la orden. */
let _vistaMostrada = 'dashboard';
export function vistaActiva(){ return _vistaMostrada; }
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
    // Los objetos de DATOS() acaban de ser reemplazados: las vistas que
    // guardan algo calculado sobre ellos (p.ej. vista-analisis) escuchan este
    // evento para olvidarlo. El deshacer no lo necesita: guarda texto, no objetos.
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
  _textoError = null;
  if (!dirty) return 'nada';
  cerrarPaso();
  let cambioHook = false;
  for (const fn of _antesDeGuardar){
    try { if (fn(DATOS())) { invalidarVistas(); cambioHook = true; } } catch (e) { console.error('antesDeGuardar:', e); }
  }
  // Los ajustes automaticos (cierre de mermas) no son un paso tuyo.
  if (cambioHook) _nuevaFoto();
  DATOS().meta.autor = usuarioActual() || 'desconocido';
  /* El borrador del equipo, antes de mandar. Si ya lo escribio el programar y
   * no se edito nada despues, no se vuelve a pasar el documento a texto: con
   * dos años son ~4 MB en cada guardado. Los ajustes de antesDeGuardar no
   * suben _ediciones, por eso fuerzan la escritura. */
  if (FUSION && (cambioHook || _edicionesEnBorrador !== _ediciones)){
    _edicionesEnBorrador = _ediciones;
    await FUSION.borrador.guardar('lotes', borradorActual);
  }
  // Lo que se envía es esta foto: si se sigue editando durante el viaje, eso
  // queda pendiente para el próximo guardado.
  const enviado = JSON.stringify(DATOS());
  const edicionesAlEnviar = _ediciones;
  const pasosAlEnviar = _historial.profundidad();
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
        '\n\n¿Era tu intención? Aceptar = guardar igual (queda registrado como FORZADO en el historial).\nCancelar = deshacer lo que hiciste desde el último guardado.'
      )){
        return _guardar(true);
      }
      return _alCancelarFreno();
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
      // El redibujo vuela el <input> donde se estaba tipeando: se lo recuerda
      // y se lo vuelve a enfocar (misma tabla, fila y columna) con su texto.
      _renderActivoConservandoCelda();
      // DATOS y la base cambiaron sin editar: el borrador del equipo ya no sirve.
      _edicionesEnBorrador = -1;
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
    // Lo guardado llega hasta el paso que estaba arriba al enviar.
    _historial.marcar(pasosAlEnviar);
    _marcarCambiado();
    cargarDashboard();
    if (cambioHook || intento > 0) _renderActivoConservandoCelda();
    return 'ok';
  }
  if (FUSION){ FUSION.borrador.borrar('lotes'); _edicionesEnBorrador = -1; }
  markSaved();
  /* El tablero, el Dashboard y los colores de Lotes salen de /api/dashboard,
   * que el servidor calcula sobre lo GUARDADO. */
  cargarDashboard();
  if (cambioHook || intento > 0) _renderActivoConservandoCelda();
  if (intento > 0) _estado('✓ Guardado (v' + DATOS().meta.version + ') · combinado con lo que guardaron otros', 'saved');
  if (j.respaldo){
    const s = $('statusBar');
    s.textContent = '✓ Guardado (v' + DATOS().meta.version + ') · respaldo: ' + j.respaldo;
    s.title = 'Respaldo JSON en backups/json/';
  }
  return 'ok';
}

/* ---------- la celda donde se tipea, a traves de un redibujo ----------
 * Tras un 409 la pestaña se redibuja YA (las filas son objetos nuevos) y eso
 * reemplaza el <input> que tenia el foco. Se anota tabla + data-row + data-k
 * + texto + cursor, y la identidad de la fila (el n° de lote de esa fila, si
 * tiene celda de lote): si despues del redibujo la misma posicion es otra
 * fila (se reordeno), no se toca nada. */
function _recordarCeldaActiva(){
  try {
    const a = document.activeElement;
    if (!a || (a.tagName !== 'INPUT' && a.tagName !== 'TEXTAREA')) return null;
    const tabla = a.closest('table');
    const conFila = a.closest('[data-row]'), conK = a.closest('[data-k]');
    if (!tabla || !tabla.id || !conFila || !conK) return null;
    const tr = a.closest('tr');
    const celdaLote = tr ? tr.querySelector('input[data-k="lote"]') : null;
    let desde = null, hasta = null;
    try { desde = a.selectionStart; hasta = a.selectionEnd; } catch (e) { /* type=date: no tiene cursor */ }
    return {
      tabla: tabla.id, fila: conFila.dataset.row, k: conK.dataset.k, valor: a.value,
      desde, hasta, lote: celdaLote ? celdaLote.value : null,
    };
  } catch (e) { return null; }
}

function _restaurarCeldaActiva(m){
  if (!m) return;
  try {
    const tabla = document.getElementById(m.tabla);
    if (!tabla) return;
    const sel = '[data-row="' + CSS.escape(m.fila) + '"][data-k="' + CSS.escape(m.k) + '"]';
    let el = null;
    for (const x of tabla.querySelectorAll(sel)){
      el = (x.tagName === 'INPUT' || x.tagName === 'TEXTAREA') ? x : x.querySelector('input, textarea');
      if (el) break;
    }
    if (!el) return;   // la fila no esta dibujada (tabla virtual) o cambio de forma
    if (m.lote != null){
      const tr = el.closest('tr');
      const celdaLote = tr ? tr.querySelector('input[data-k="lote"]') : null;
      if (!celdaLote || celdaLote.value !== m.lote) return;   // es otra fila
    }
    el.focus();
    if (el.value !== m.valor){
      el.value = m.valor;
      // Que lo tipeado llegue al modelo por el mismo camino que una tecla.
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (m.desde != null){
      try { el.setSelectionRange(m.desde, m.hasta); } catch (e) { /* sin cursor */ }
    }
    /* La grilla solto el modo edicion cuando se fue el <input> viejo: sin
     * esto, la proxima letra entraria por "tipear reemplaza" y vaciaria la
     * celda. grilla.js escucha y la vuelve a poner en edicion (no se importa:
     * ciclo grilla -> tabla -> nucleo -> grilla). */
    document.dispatchEvent(new CustomEvent('lotes:celda-reenfocada', { detail: { el } }));
  } catch (e) { console.error('restaurar la celda activa:', e); }
}

/* Todo redibujo dentro de _guardar pasa por aca: un 409 redibuja, y el
 * reintento que sale bien vuelve a redibujar. Cada uno conserva la celda. */
function _renderActivoConservandoCelda(){
  const celda = _recordarCeldaActiva();
  try { renderActivo(); } catch (e) { console.error('renderActivo al guardar:', e); }
  _restaurarCeldaActiva(celda);
}

/* Antes de que entre lo de otro: lo tuyo queda anotado como paso. */
function _antesDeCambioAjeno(){ cerrarPaso(); }
/* Despues: lo de otro es la base, no un paso tuyo. */
function _despuesDeCambioAjeno(){ _nuevaFoto(); }
/* El freno de borrado masivo pregunto y se eligio Cancelar: se deshace TODO
 * lo hecho desde el ultimo guardado (los pasos de arriba de la marca), del mas
 * nuevo al mas viejo y fila por fila como un Ctrl+Z: lo que otro cambio
 * despues se saltea y se avisa. Solo el ultimo paso no alcanzaba: podia ser
 * otra edicion hecha mientras viajaba el guardado, y el borrado quedaba.
 * Si no se pudo deshacer nada devuelve 'error': el autoguardado para hasta el
 * proximo cambio o Ctrl+S, en vez de volver a chocar con el freno. */
function _alCancelarFreno(){
  cerrarPaso();
  const pasos = _historial.deshacerHasta();
  let aplicados = 0;
  const salteados = [];
  for (const paso of pasos){
    const r = aplicar(_datos, paso.cambios, 'deshacer');
    aplicados += r.aplicados;
    salteados.push(...r.salteados);
  }
  _nuevaFoto();   // lo que quedo es la base nueva: deshacer no es un paso
  if (aplicados){
    _marcarCambiado();   // vuelve a programar el autoguardado
    document.dispatchEvent(new CustomEvent('lotes:datos-recargados'));
    invalidarVistas();
    _renderActivoConservandoCelda();
  }
  if (salteados.length) _avisarSalteados(salteados);
  else if (aplicados) avisoBreve('Deshecho lo de este guardado (' + pasos.length + (pasos.length === 1 ? ' paso' : ' pasos') + ')', 'ok');
  else avisoBreve('No había nada para deshacer: el guardado quedó frenado.', 'error');
  if (aplicados) return 'cancelado';
  _textoError = '⚠ Guardado frenado: hay cambios sin guardar';
  _estado(_textoError, 'dirty');
  return 'error';
}

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

/* ---------- navegación de pestañas ----------
 * Correcciones es un grupo: un boton en la barra (data-v="so2") y tres
 * sub-pestañas (bitacora de SO2, orden de correccion y otros agregados), cada
 * una con su propia <section>. El selector #corrSub solo se ve en el grupo.
 * Tocar el boton vuelve a la ultima sub-pestaña que se uso (en memoria). */
const GRUPO_CORRECCIONES = ['so2', 'ordencorr', 'agregados'];
let _ultimaCorreccion = 'so2';

export function mostrarTab(nombre){
  if (nombre === 'correcciones') nombre = _ultimaCorreccion;
  const enGrupo = GRUPO_CORRECCIONES.includes(nombre);
  if (enGrupo) _ultimaCorreccion = nombre;
  const boton = enGrupo ? 'so2' : nombre;
  _vistaMostrada = nombre;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.v === boton));
  const sub = $('corrSub');
  if (sub){
    sub.hidden = !enGrupo;
    sub.querySelectorAll('[data-sub]').forEach(b => {
      const on = b.dataset.sub === nombre;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
  }
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

/* ---------- redibujo postergado mientras se escribe en un campo ----------
 * _cargarDashboard repinta Lotes/Dashboard/Orden/Tablero con los colores que
 * acaba de traer el autoguardado. Si eso pasa mientras alguien esta tipeando
 * una celda, el redibujo le vuela el <input> de abajo del cursor y pierde el
 * foco a mitad de palabra. Se posterga hasta que el foco se vaya de
 * cualquier campo (aunque pase por varios, p.ej. Tab entre columnas), y ahi
 * se redibuja la vista que haya quedado activa. */
const _CAMPOS_FOCO = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function _escribiendoEnUnCampo(){
  const a = document.activeElement;
  if (!a || a === document.body) return false;
  if (a.isContentEditable) return true;
  if (!_CAMPOS_FOCO.has(a.tagName)) return false;
  if (a.tagName === 'INPUT' && ['button', 'submit', 'checkbox', 'radio'].includes(a.type)) return false;
  return true;
}

let _redibujoPendiente = false;
let _escuchandoFocusout = false;

function _redibujarVistaDashboard(){
  const activa = vistaActiva();
  if (['lotes', 'dashboard', 'orden', 'tablero'].includes(activa)) _dibujar(activa, true);
}

function _redibujarODemorar(){
  if (!_escribiendoEnUnCampo()){ _redibujarVistaDashboard(); return; }
  // Alguien esta escribiendo: se marca el pendiente y, si no hay ya un
  // oyente puesto (para no apilar varios), se espera a que el foco se vaya.
  _redibujoPendiente = true;
  if (_escuchandoFocusout) return;
  _escuchandoFocusout = true;
  document.addEventListener('focusout', _alSalirDeUnCampo);
}

function _alSalirDeUnCampo(){
  // focusout se dispara ANTES de que el elemento siguiente reciba el foco:
  // hay que esperar un tick para que document.activeElement ya sea el nuevo.
  setTimeout(() => {
    if (_escribiendoEnUnCampo()) return; // paso de un campo a otro (Tab, flechas): seguir esperando
    document.removeEventListener('focusout', _alSalirDeUnCampo);
    _escuchandoFocusout = false;
    if (!_redibujoPendiente) return;
    _redibujoPendiente = false;
    _redibujarVistaDashboard();
  }, 0);
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
    _redibujarODemorar();
  } catch(e) {
    // Sin dashboard la app sigue andando, solo se omiten los colores. Pero se
    // deja rastro: si lo que fallo fue una vista y no la red, el silencio
    // absoluto haria invisible un bug de registro de vistas.
    console.error('cargarDashboard:', e);
  }
  finally { _dashLoading = false; }
}
