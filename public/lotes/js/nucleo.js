/* ===== Lotes CIW — nucleo: estado compartido, guardado y navegacion ===== */
'use strict';

/* ---------- estado global ----------
 * DATOS es una variable mutable que comparten todas las vistas. Los modulos ES
 * no permiten reasignar un binding exportado desde afuera, asi que se expone
 * por accesor: DATOS() para leer, setDatos() para reemplazar.
 * Forma: {meta, config, lotes, analisis, estado_lote, excepciones_analisis}
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
export function markDirty(){
  dirty = true;
  $('btnGuardar').disabled = false;
  const s = $('statusBar'); s.textContent = '● Cambios sin guardar'; s.className = 'status dirty';
}
export function markSaved(){
  dirty = false;
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
    if (!r.ok){ $('statusBar').textContent = 'Error al cargar ('+r.status+')'; return; }
    setDatos(await r.json());
    DATOS().meta                 = DATOS().meta || { version:0 };
    DATOS().lotes                = DATOS().lotes || [];
    DATOS().analisis             = DATOS().analisis || [];
    DATOS().estado_lote          = DATOS().estado_lote || {};
    DATOS().excepciones_analisis = DATOS().excepciones_analisis || [];
    // Los objetos de DATOS() acaban de ser reemplazados: las pilas de deshacer
    // de la grilla quedarian apuntando a objetos huerfanos. grilla.js escucha
    // este evento para limpiarse; no se importa directamente para evitar el
    // ciclo grilla->tabla->nucleo->grilla.
    document.dispatchEvent(new CustomEvent('lotes:datos-recargados'));
    markSaved();
    _inits.forEach(fn => fn());
    renderActivo();
  } catch(e) {
    $('statusBar').textContent = 'Sin conexión con el servidor';
  }
}

/* ---------- guardar (con 409/412 faithful port) ---------- */
export async function guardar(forzar){
  if (!dirty) return true;
  DATOS().meta.autor = usuarioActual() || pedirUsuario(true) || 'desconocido';
  let r;
  try {
    r = await fetch(API+'/datos' + (forzar ? '?forzar=1' : ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(DATOS())
    });
  } catch(e) {
    alert('No se pudo guardar: el servidor no responde. Revisá que esté abierto y probá de nuevo. Tus cambios siguen en pantalla.');
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
    mostrarOverlay(
      '<h2 style="margin-top:0;color:#ffd766">Conflicto de versión</h2>'+
      '<p style="color:var(--muted)">Otra PC guardó cambios mientras editabas. Para no pisar su trabajo, recargá la última versión.</p>'+
      '<p style="color:#ff8a7a;font-size:13px">⚠️ Tus cambios sin guardar se perderán al recargar.</p>'+
      '<button class="btn primary" onclick="location.reload()">🔄 Recargar última versión</button>'
    );
    return false;
  }
  if (!r.ok){ alert('Error al guardar: ' + r.status); return false; }
  const j = await r.json();
  DATOS().meta.version = j.version;
  DATOS().meta.actualizado = j.actualizado;
  markSaved();
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
  const fn = vistaDe(nombre);
  if (fn && DATOS()) fn();
}

export function renderActivo(){
  const activo = document.querySelector('.tabs button.active');
  const nombre = activo ? activo.dataset.v : 'dashboard';
  const fn = vistaDe(nombre);
  if (fn && DATOS()) fn();
}

/* ---------- cache del dashboard (compartida por lotes, dashboard, fml y orden) ---------- */
let _dashMap = null;   // Map<lote_str -> {alarmas:[], vencido:bool}>
let _dashData = null;  // respuesta completa de /api/dashboard
let _dashLoading = false;

export function dashMap(){ return _dashMap; }
export function dashData(){ return _dashData; }
export function dashLoading(){ return _dashLoading; }
export function invalidarDashMap(){ _dashMap = null; }

export async function cargarDashboard(){
  if (_dashLoading) return;
  _dashLoading = true;
  try {
    const r = await fetch(API+'/dashboard');
    if (!r.ok) return;
    const j = await r.json();
    _dashData = j;
    _dashMap = new Map();
    for (const e of (j.lotes||[])){
      _dashMap.set(String(e.lote), { alarmas: e.alarmas||[], vencido: e.vencido||false });
    }
    _vistaObligatoria('lotes')();      // repintar con colores
    _vistaObligatoria('dashboard')();  // rellenar dashboard si está activo (o prepararlo)
    // si la pestaña Orden de muestras está activa, repintarla
    if (document.querySelector('.tabs button[data-v="orden"].active')) _vistaObligatoria('orden')();
    // si la pestaña Tablero FML está activa, repintarla
    if (document.querySelector('.tabs button[data-v="tablero"].active')) _vistaObligatoria('tablero')();
  } catch(e) {
    // Sin dashboard la app sigue andando, solo se omiten los colores. Pero se
    // deja rastro: si lo que fallo fue una vista y no la red, el silencio
    // absoluto haria invisible un bug de registro de vistas.
    console.error('cargarDashboard:', e);
  }
  finally { _dashLoading = false; }
}
