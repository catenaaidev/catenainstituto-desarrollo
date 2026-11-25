/* ===== Lotes CIW — la carpeta de OT de OneDrive, vista desde el navegador =====
 *
 * File System Access API (Chrome/Edge): el usuario elige una vez la carpeta
 * "Ordenes de Trabajo 2026" (sincronizada por OneDrive) y la web lista sus
 * archivos para numerar y escribe ahi el PDF. OneDrive lo sube solo.
 *
 * El handle se guarda en IndexedDB (no entra en localStorage). El permiso NO
 * persiste entre sesiones: el navegador lo vuelve a pedir y solo acepta
 * pedirlo desde un clic (pedirPermiso).
 *
 * Nada de numeracion aca: eso es numero-ot.js. */
'use strict';

import { SERIES, maximoSerie } from './numero-ot.js';

const DB = 'lotes-carpeta-ot', STORE = 'handles', CLAVE = 'carpeta';
let _handle = null, _cargado = false;

export const soportado = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function _idb(modo, fn){
  return new Promise((ok, mal) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onerror = () => mal(r.error);
    r.onsuccess = () => {
      const tx = r.result.transaction(STORE, modo);
      const q = fn(tx.objectStore(STORE));
      tx.oncomplete = () => ok(q && q.result);
      tx.onerror = () => mal(tx.error);
    };
  });
}

async function _cargar(){
  if (_cargado) return _handle;
  _cargado = true;
  try { _handle = (await _idb('readonly', s => s.get(CLAVE))) || null; } catch { _handle = null; }
  return _handle;
}

export async function usarCarpeta(handle){
  _handle = handle; _cargado = true;
  try { await _idb('readwrite', s => s.put(handle, CLAVE)); } catch { /* sigue en memoria */ }
}

export async function elegirCarpeta(){
  if (!soportado()) return false;
  try {
    const h = await window.showDirectoryPicker({ id: 'ordenes-trabajo', mode: 'readwrite' });
    await usarCarpeta(h);
    return true;
  } catch { return false; } // cancelado
}

async function _permiso(pedir){
  const h = await _cargar();
  if (!h) return false;
  if (!h.queryPermission) return true; // OPFS: siempre
  const op = { mode: 'readwrite' };
  if ((await h.queryPermission(op)) === 'granted') return true;
  return pedir ? (await h.requestPermission(op)) === 'granted' : false;
}

export const pedirPermiso = () => _permiso(true);

export async function estado(){
  if (!soportado() && !_handle) return { tipo: 'no-soportado' };
  const h = await _cargar();
  if (!h) return { tipo: 'sin' };
  return (await _permiso(false)) ? { tipo: 'conectada', nombre: h.name } : { tipo: 'permiso', nombre: h.name };
}

async function _dirDe(serie, crear){
  if (!(await _permiso(false))) return null;
  const sub = SERIES[serie].subcarpeta;
  try { return sub ? await _handle.getDirectoryHandle(sub, { create: !!crear }) : _handle; }
  catch { return null; }
}

async function _nombres(dir){
  const out = [];
  for await (const nombre of dir.keys()) out.push(nombre);
  return out;
}

/* null = sin carpeta. Tambien si la carpeta se movio o borro (NotFoundError):
 * asi se cae a la descarga en vez de trabar Imprimir/Emitir. */
export async function listarRaiz(){
  try {
    const d = await _dirDe('principal');
    return d ? await _nombres(d) : null;
  } catch { return null; }
}

const _claveVisto = serie => 'lotes-ot-ultimo-' + serie;

export function ultimoVisto(serie){
  try { const n = parseInt(localStorage.getItem(_claveVisto(serie)), 10); return Number.isFinite(n) ? n : null; }
  catch { return null; }
}

/* Sube lo ultimo visto si n es mayor (lo usado sin carpeta tambien cuenta). */
export function recordarNumero(serie, n){
  if (!Number.isFinite(n)) return;
  try {
    const previo = ultimoVisto(serie);
    if (previo == null || n > previo) localStorage.setItem(_claveVisto(serie), String(n));
  } catch { /* sin storage */ }
}

export async function listarSerie(serie){
  let nombres;
  try {
    const d = await _dirDe(serie);
    if (!d) return null;
    nombres = await _nombres(d);
  } catch { return null; } // carpeta movida/borrada: como sin carpeta
  const max = maximoSerie(nombres, serie);
  // Con carpeta, la carpeta manda (aunque lo visto antes fuera mayor).
  if (max) try { localStorage.setItem(_claveVisto(serie), String(max.n)); } catch { /* sin storage */ }
  return nombres;
}

/* Nunca pisa: si ya hay un archivo con ese nombre exacto devuelve 'existe'. */
export async function escribirPdf(serie, nombre, blob){
  let d;
  try { d = await _dirDe(serie, false); } catch { return 'error'; }
  if (!d) return 'sin-carpeta';
  let creado = false;
  try {
    try { await d.getFileHandle(nombre); return 'existe'; } catch { /* no existe: bien */ }
    const fh = await d.getFileHandle(nombre, { create: true });
    creado = true;
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return 'ok';
  } catch {
    // Que no quede un archivo de 0 bytes que trabe el reintento con 'existe'.
    if (creado) try { await d.removeEntry(nombre); } catch { /* no se pudo: queda */ }
    return 'error';
  }
}
