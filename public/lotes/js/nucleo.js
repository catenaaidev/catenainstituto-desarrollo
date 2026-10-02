/* ===== Lotes CIW — nucleo: estado compartido, guardado y navegacion ===== */
'use strict';

import { queryAnios } from './selector-anios.js';

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

export function markDirty(){
  _ediciones++;
  dirty = true;
  invalidarVistas();
  $('btnGuardar').disabled = false;
  const s = $('statusBar'); s.textContent = '● Cambios sin guardar'; s.className = 'status dirty';
  if (FUSION && _datos) FUSION.borrador.programar('lotes', borradorActual);
}
export function markSaved(){
  dirty = false;
  invalidarVistas();
  $('btnGuardar').disabled = true;
  const s = $('statusBar');
  s.textContent = '✓ Guardado (v' + DATOS().meta.version + ')';
  s.className = 'status saved';
}

window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

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
    // Los objetos de DATOS() acaban de ser reemplazados: las pilas de deshacer
    // de la grilla quedarian apuntando a objetos huerfanos. grilla.js escucha
    // este evento para limpiarse; no se importa directamente para evitar el
    // ciclo grilla->tabla->nucleo->grilla.
    document.dispatchEvent(new CustomEvent('lotes:datos-recargados'));
    markSaved();   // tambien invalida el cache de pestañas
    if (recuperado) markDirty();
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

/* ---------- guardar (con 409/412 faithful port) ---------- */
export async function guardar(forzar, intento = 0){
  if (!dirty) return true;
  let cambioHook = false;
  for (const fn of _antesDeGuardar){
    try { if (fn(DATOS())) { invalidarVistas(); cambioHook = true; } } catch (e) { console.error('antesDeGuardar:', e); }
  }
  DATOS().meta.autor = usuarioActual() || pedirUsuario(true) || 'desconocido';
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
    alert('No se pudo guardar: no hay conexión con el servidor. Tus cambios siguen en pantalla y quedaron guardados en este equipo; probá de nuevo cuando vuelva la señal.');
    return false;
  }
  if (r.status === 401){
    alert('Tu sesión se cerró. Tus cambios siguen en pantalla y quedaron guardados en este equipo.\n\nIniciá sesión en la pestaña que se abre y después volvé a tocar Guardar.');
    window.open('/login.html', '_blank');
    return false;
  }
  if (r.status === 400){
    const j = await r.json().catch(() => ({}));
    if (j.error === 'validacion'){
      const det = (j.detalles || []).join('\n• ');
      if (!forzar && confirm(
        '⚠️ El servidor FRENÓ este guardado para proteger los datos:\n\n• ' + det +
        '\n\n¿Era tu intención? Aceptar = guardar igual (queda registrado como FORZADO en el historial).\nCancelar = no guardar nada y revisar.'
      )){
        return guardar(true);
      }
      if (forzar) alert('No se pudo guardar:\n• ' + det);
      return false;
    }
    alert('Error al guardar: ' + (j.error || r.status)); return false;
  }
  if (r.status === 409){
    const j = await r.json().catch(() => ({}));
    // Otro dispositivo guardó mientras se editaba acá: se combinan los cambios
    // de los dos y se vuelve a guardar. Nadie pierde lo suyo.
    if (FUSION && _base && j.actual && intento < 4){
      const serv = j.actual;
      setDatos(FUSION.fusionarDocumento(_base, DATOS(), serv));
      completarSecciones();
      _base = FUSION.clonar(serv);
      // Los objetos de DATOS() cambiaron: la grilla limpia sus pilas de deshacer
      // y la pestaña visible se redibuja YA, aunque el reintento falle. Si no,
      // sus filas seguían apuntando a los objetos viejos: las ediciones se
      // perdían y el ✕ de Lotes borraba otro lote (indexOf daba -1).
      document.dispatchEvent(new CustomEvent('lotes:datos-recargados'));
      invalidarVistas();
      try { renderActivo(); } catch (e) { console.error('renderActivo tras fusionar:', e); }
      return guardar(forzar, intento + 1);
    }
    mostrarOverlay(
      '<h2 style="margin-top:0;color:#ffd766">Conflicto de versión</h2>'+
      '<p style="color:var(--muted)">Otra PC guardó cambios mientras editabas y no se pudieron combinar solos.</p>'+
      '<p style="color:var(--muted);font-size:13px">Tus cambios quedaron guardados en este equipo: al recargar se te ofrece recuperarlos.</p>'+
      '<button class="btn primary" onclick="location.reload()">🔄 Recargar y recuperar</button>'
    );
    return false;
  }
  if (r.status === 403){
    const j = await r.json().catch(() => ({}));
    alert('No se pudo guardar: ' + ((j.detalles && j.detalles[0]) || 'tu usuario no tiene permiso para guardar en Lotes.'));
    return false;
  }
  if (!r.ok){ alert('Error al guardar: ' + r.status + '. Tus cambios siguen en pantalla y guardados en este equipo.'); return false; }
  const j = await r.json();
  DATOS().meta.version = j.version;
  DATOS().meta.actualizado = j.actualizado;
  // La base pasa a ser lo que efectivamente llegó al servidor, no la pantalla
  // actual (que puede tener ediciones posteriores, todavía sin enviar).
  if (FUSION){ _base = JSON.parse(enviado); _base.meta.version = j.version; _base.meta.actualizado = j.actualizado; }
  if (_ediciones !== edicionesAlEnviar){
    // Se editó durante el viaje: queda pendiente (y en el borrador del equipo).
    markDirty();
    cargarDashboard();
    if (cambioHook || intento > 0) renderActivo();
    return true;
  }
  if (FUSION) FUSION.borrador.borrar('lotes');
  markSaved();
  /* El tablero, el Dashboard y los colores de Lotes salen de /api/dashboard,
   * que el servidor calcula sobre lo GUARDADO. Antes se pedia una sola vez al
   * abrir la pagina, asi que despues de corregir un criterio o cargar un
   * analisis seguian mostrando el veredicto viejo hasta recargar. */
  cargarDashboard();
  if (cambioHook || intento > 0) renderActivo();
  if (intento > 0) $('statusBar').textContent = '✓ Guardado (v' + DATOS().meta.version + ') · combinado con lo que guardaron otros';
  if (j.respaldo){
    const s = $('statusBar');
    s.textContent = '✓ Guardado (v' + DATOS().meta.version + ') · respaldo: ' + j.respaldo;
    s.title = 'Respaldo JSON en backups/json/';
  }
  return true;
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
