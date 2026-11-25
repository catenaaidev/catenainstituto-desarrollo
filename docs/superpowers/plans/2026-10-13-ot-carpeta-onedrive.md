# OT numeradas por la carpeta de OneDrive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al emitir/imprimir una orden en Lotes web, proponer el próximo número leyendo la carpeta `Ordenes de Trabajo 2026` (series `0939…` y `B223…`) y guardar ahí el PDF de la hoja.

**Architecture:** Todo en el navegador, nada de servidor. Un módulo puro calcula números a partir de nombres de archivo (`numero-ot.js`, testeado en vitest). Un módulo de navegador maneja la carpeta con la File System Access API (`carpeta-ot.js`). Otro convierte las hojas A4 del DOM en un PDF (`hoja-pdf.js`), y uno de interfaz (`guardar-ot.js`) los une: propone el número, muestra el estado de la carpeta e imprime + guarda. Las cinco órdenes ya imprimen con el mismo patrón (`body.classList.add('printing-X'); window.print()`), así que el cambio en cada vista es reemplazar ese bloque y sembrar el número.

**Tech Stack:** JS ES modules sin build (public/lotes/js), vitest (`npm test`, pool de Workers; los `.mjs` de test importan módulos puros), html2canvas 1.4.1 + jsPDF 2.5.2 copiados a `public/lotes/js/vendor/` y cargados a demanda.

**Spec:** `docs/superpowers/specs/2026-10-13-ot-carpeta-onedrive-design.md`

## Global Constraints

- Serie principal: nombre que empieza con 4 dígitos seguidos de espacio, punto o fin — `/^(\d{4})(\s|\.|$)/`. Salida con 4 dígitos (`0939`).
- Serie B: `/^B(\d{3,4})(\s|\.|$)/i`, dentro de la subcarpeta `B Ordenes de agregados`. Salida `'B' + padStart(3,'0')` (`B223`).
- Movimientos (trasiego, corte, movimiento suelto), Orden de muestras y Microbiología → serie principal. Orden de corrección SO₂ y Otros agregados → serie B.
- El número de la carpeta reemplaza a `OT-2026-NNN`; las OT viejas no se tocan.
- Nombre del PDF: `<número> <título>.pdf`, sin `\/:*?"<>|`. Nunca se pisa un archivo existente.
- Sin carpeta (Firefox, celular, otra PC): aviso "sin carpeta: revisá el número a mano" y el PDF se **descarga**.
- Si falla escribir el PDF, la OT/orden igual queda; se ofrece descargarlo.
- Solo Chrome/Edge para la carpeta (`'showDirectoryPicker' in window`).
- Las pruebas se hacen contra una **copia** de la carpeta u OPFS, NUNCA contra la carpeta real de OneDrive.
- Comentarios y textos de UI en castellano rioplatense, sin tildes en comentarios de código (estilo del repo); textos de UI sí llevan tildes.
- Trabajar en worktree `C:/Users/Bmax/repos/catenainstitute-ot-carpeta`, rama `feat/ot-carpeta-onedrive` desde `main`. Otras sesiones cambian de rama en `repos/catenainstitute`: no trabajar ahí.

## Nota de diseño que el plan precisa (no contradice la spec)

La OT de trasiego/corte se **emite** (se reserva el número y se guarda en la web) y recién después se ajustan los pasos sobre la hoja y se **imprime**. Por eso: el número se chequea contra la carpeta **al emitir**, y el PDF se escribe **al imprimir** (así incluye lo editado sobre la hoja). Muestras, microbiología, corrección y agregados no tienen paso de emisión separado: número y PDF se resuelven al imprimir.

## File Structure

| Archivo | Responsabilidad |
|---|---|
| Create `public/lotes/js/numero-ot.js` | Puro: parseo de nombres, máximo por serie, siguiente número, número usado, nombre de archivo, números conocidos por la web |
| Create `test/lotes-numero-ot.test.mjs` | Tests del anterior con nombres reales de la carpeta |
| Create `public/lotes/js/carpeta-ot.js` | Navegador: handle en IndexedDB, permiso, listar serie, escribir sin pisar, último visto en localStorage |
| Create `public/lotes/js/hoja-pdf.js` | Navegador: carga a demanda de vendor, reglas `@media print` → screen en el clon, hojas `.orden-hoja` → Blob PDF A4 |
| Create `public/lotes/js/vendor/html2canvas.min.js`, `jspdf.umd.min.js`, `html2canvas-LICENSE.md`, `jspdf-LICENSE.md` | Librerías copiadas |
| Create `public/lotes/js/guardar-ot.js` | UI: `proponerNumero`, `chipCarpeta`, `imprimirYGuardar` |
| Modify `public/lotes/js/vista-ot-emitir.js` | Siembra número, chequeo al emitir, `imprimirOT` → `imprimirYGuardar` |
| Modify `public/lotes/js/vista-ot-corte.js` | Siembra número, chequeo al emitir |
| Modify `public/lotes/js/vista-ot-lista.js` | (solo si `_imprimir` no pasa por `imprimirOT`) |
| Modify `public/lotes/js/vista-movimientos.js` | Movimiento suelto: siembra número; `_imprimirOT` → `imprimirYGuardar` |
| Modify `public/lotes/js/vista-orden.js` | Muestras/micro: siembra `_otHoja.nro`; imprimir → `imprimirYGuardar` |
| Modify `public/lotes/js/vista-orden-correccion.js` | Siembra `#ocNumOrden` (B); imprimir → `imprimirYGuardar` |
| Modify `public/lotes/js/vista-agregados.js` | Siembra `_b.ot` (B); imprimir → `imprimirYGuardar` |
| Modify `public/lotes/js/ot-movimientos.js` | `proximoNumeroOT` también entiende el formato nuevo `0939` |
| Modify `test/lotes-ot-armado.test.mjs` | Test de `proximoNumeroOT` con formato nuevo |

---

### Task 1: Worktree y módulo puro `numero-ot.js`

**Files:**
- Create: `public/lotes/js/numero-ot.js`
- Test: `test/lotes-numero-ot.test.mjs`

**Interfaces:**
- Produces:
  - `SERIES: { principal: {clave:'principal', subcarpeta:null}, B: {clave:'B', subcarpeta:'B Ordenes de agregados'} }`
  - `numeroDeNombre(nombre: string, serie: 'principal'|'B'): number|null`
  - `maximoSerie(nombres: string[], serie): {n:number, nombre:string}|null`
  - `formatearNumero(n: number, serie): string`
  - `numerosWeb(datos: object, serie): number[]`
  - `siguienteNumero({nombres?: string[]|null, web?: number[], ultimoVisto?: number|null}, serie): string`
  - `numeroUsado(nombres: string[], numero: string, serie): string|null` (nombre del archivo que ya lo usa)
  - `nombreArchivo(numero: string, titulo: string): string`
  - `pareceCarpetaOT(nombres: string[]): boolean`

- [ ] **Step 1: Crear el worktree**

```bash
cd C:/Users/Bmax/repos/catenainstitute
git worktree add ../catenainstitute-ot-carpeta -b feat/ot-carpeta-onedrive main
cd ../catenainstitute-ot-carpeta
npm install
```

- [ ] **Step 2: Escribir el test que falla**

`test/lotes-numero-ot.test.mjs`:

```js
/* Numeracion de OT a partir de los nombres de la carpeta de OneDrive
 * "Ordenes de Trabajo 2026". Los nombres son reales (2026-10-13). */
import { describe, it, expect } from 'vitest';
import { numeroDeNombre, maximoSerie, formatearNumero, numerosWeb, siguienteNumero,
         numeroUsado, nombreArchivo, pareceCarpetaOT } from '../public/lotes/js/numero-ot.js';

const RAIZ = [
  '0700 Trasiego fin FML de barricas a barricas 26217.xlsx',
  '0702 Inertización de tanques.xlsx',
  '0702 Orden de Correccion So2 .xlsx',
  '0707 Orden de muestras Prensa.pdf',
  '0937 Muestras Ensayos Nico Torti.xlsx',
  '0938 Muestra cortes vinos Liberados.xlsx',
  'A Ordenes de molienda', 'AAA Guía de Trabajos.xlsx', 'B Ordenes de agregados',
  'Backup', 'Buckup', 'CLAUDE.md', 'Iniciar generador OT v3.bat', 'Templeates', 'memory',
];
const AGREGADOS = ['B211 Agregado de Quitosano.xlsx', 'B220 OT agregados.xlsx',
  'B222 Correccion SO2.xlsx', 'CHANGELOG.md', '__pycache__', 'generar_OT_v3.py'];

describe('numeroDeNombre', () => {
  it('serie principal: 4 digitos al principio', () => {
    expect(numeroDeNombre('0938 Muestra cortes.xlsx', 'principal')).toBe(938);
    expect(numeroDeNombre('0939.pdf', 'principal')).toBe(939);
    expect(numeroDeNombre('0939', 'principal')).toBe(939);
  });
  it('ignora lo que no es un numero de OT', () => {
    for (const n of ['AAA Guía de Trabajos.xlsx', 'Backup', 'CLAUDE.md', 'B222 Correccion SO2.xlsx',
                     '12345 algo.xlsx', '093 corto.xlsx', '0938x.xlsx'])
      expect(numeroDeNombre(n, 'principal')).toBeNull();
  });
  it('serie B', () => {
    expect(numeroDeNombre('B222 Correccion SO2.xlsx', 'B')).toBe(222);
    expect(numeroDeNombre('b1005 algo.pdf', 'B')).toBe(1005);
    expect(numeroDeNombre('B Ordenes de agregados', 'B')).toBeNull();
    expect(numeroDeNombre('0938 x.xlsx', 'B')).toBeNull();
  });
});

describe('maximoSerie', () => {
  it('toma el mayor y su nombre; repetidos no molestan', () => {
    expect(maximoSerie(RAIZ, 'principal')).toEqual({ n: 938, nombre: '0938 Muestra cortes vinos Liberados.xlsx' });
    expect(maximoSerie(AGREGADOS, 'B')).toEqual({ n: 222, nombre: 'B222 Correccion SO2.xlsx' });
  });
  it('null si no hay ninguno', () => {
    expect(maximoSerie(['CLAUDE.md'], 'principal')).toBeNull();
    expect(maximoSerie([], 'B')).toBeNull();
  });
});

describe('formatearNumero', () => {
  it('principal con 4 digitos, B con 3 como minimo', () => {
    expect(formatearNumero(939, 'principal')).toBe('0939');
    expect(formatearNumero(1000, 'principal')).toBe('1000');
    expect(formatearNumero(223, 'B')).toBe('B223');
    expect(formatearNumero(7, 'B')).toBe('B007');
  });
});

describe('numerosWeb', () => {
  const datos = {
    movimientos: [{ ot: 'OT-2026-014' }, { ot: '0941' }, { ot: '' }, {}],
    ordenes_trabajo: [{ ot: '0942' }],
    analisis: [
      { correccion: { ot_n: 'B224' }, agregados: [{ ot_n: 'B226' }, null] },
      { correccion: null }, null,
    ],
  };
  it('principal: ot de movimientos y de ordenes_trabajo con formato nuevo', () => {
    expect(numerosWeb(datos, 'principal').sort()).toEqual([941, 942]);
  });
  it('B: ot_n de correcciones y agregados', () => {
    expect(numerosWeb(datos, 'B').sort()).toEqual([224, 226]);
  });
  it('datos vacios', () => {
    expect(numerosWeb({}, 'principal')).toEqual([]);
    expect(numerosWeb(null, 'B')).toEqual([]);
  });
});

describe('siguienteNumero', () => {
  it('maximo de carpeta + 1', () => {
    expect(siguienteNumero({ nombres: RAIZ }, 'principal')).toBe('0939');
    expect(siguienteNumero({ nombres: AGREGADOS }, 'B')).toBe('B223');
  });
  it('la web puede ir adelante de la carpeta (PDF todavia sin sincronizar)', () => {
    expect(siguienteNumero({ nombres: RAIZ, web: [940] }, 'principal')).toBe('0941');
  });
  it('sin carpeta usa lo ultimo visto y la web', () => {
    expect(siguienteNumero({ nombres: null, web: [], ultimoVisto: 938 }, 'principal')).toBe('0939');
    expect(siguienteNumero({ nombres: null, web: [950], ultimoVisto: 938 }, 'principal')).toBe('0951');
  });
  it('sin nada: 1', () => {
    expect(siguienteNumero({}, 'principal')).toBe('0001');
    expect(siguienteNumero({}, 'B')).toBe('B001');
  });
});

describe('numeroUsado', () => {
  it('devuelve el archivo que ya usa ese numero', () => {
    expect(numeroUsado(RAIZ, '0938', 'principal')).toBe('0938 Muestra cortes vinos Liberados.xlsx');
    expect(numeroUsado(RAIZ, '938', 'principal')).toBe('0938 Muestra cortes vinos Liberados.xlsx');
    expect(numeroUsado(AGREGADOS, 'b222', 'B')).toBe('B222 Correccion SO2.xlsx');
  });
  it('null si esta libre o el numero no se entiende', () => {
    expect(numeroUsado(RAIZ, '0939', 'principal')).toBeNull();
    expect(numeroUsado(RAIZ, 'OT-2026-001', 'principal')).toBeNull();
  });
});

describe('nombreArchivo', () => {
  it('numero + titulo + .pdf, sin caracteres invalidos de Windows', () => {
    expect(nombreArchivo('0939', 'Trasiego 26217')).toBe('0939 Trasiego 26217.pdf');
    expect(nombreArchivo('B223', 'Correccion SO2 / lote: "26"?')).toBe('B223 Correccion SO2 lote 26.pdf');
    expect(nombreArchivo('0939', '   ')).toBe('0939.pdf');
    expect(nombreArchivo('0939', 'algo.pdf')).toBe('0939 algo.pdf');
  });
});

describe('pareceCarpetaOT', () => {
  it('true si tiene la subcarpeta de agregados', () => {
    expect(pareceCarpetaOT(RAIZ)).toBe(true);
    expect(pareceCarpetaOT(['Documentos', 'foto.jpg'])).toBe(false);
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run test/lotes-numero-ot.test.mjs`
Expected: FAIL (no existe `numero-ot.js`).

- [ ] **Step 4: Implementar `public/lotes/js/numero-ot.js`**

```js
/* ===== Lotes CIW — numero de OT segun la carpeta de OneDrive =====
 *
 * La numeracion real de las ordenes de trabajo es la de la carpeta
 * "Ordenes de Trabajo 2026": cada archivo empieza con su numero. La comparten
 * ordenes que nunca pasan por la web (muestras en Excel, fraccionamiento...),
 * asi que la carpeta es la verdad y la web solo la lee.
 *
 *   principal  raiz de la carpeta            0700 ... 0938
 *   B          "B Ordenes de agregados"      B211 ... B222
 *
 * Modulo puro (sin DOM ni nucleo.js) para testearlo en node. */
'use strict';

export const SERIES = {
  principal: { clave: 'principal', subcarpeta: null },
  B:         { clave: 'B',         subcarpeta: 'B Ordenes de agregados' },
};

const RE = {
  principal: /^(\d{4})(\s|\.|$)/,
  B:         /^B(\d{3,4})(\s|\.|$)/i,
};

export function numeroDeNombre(nombre, serie){
  const m = RE[serie] && RE[serie].exec(String(nombre ?? '').trim());
  return m ? parseInt(m[1], 10) : null;
}

export function maximoSerie(nombres, serie){
  let max = null;
  for (const nombre of nombres || []){
    const n = numeroDeNombre(nombre, serie);
    if (n != null && (!max || n > max.n)) max = { n, nombre };
  }
  return max;
}

export function formatearNumero(n, serie){
  return serie === 'B' ? 'B' + String(n).padStart(3, '0') : String(n).padStart(4, '0');
}

/* Lo que la web ya numero con el formato nuevo. Las OT viejas (OT-2026-014)
 * no entran: son de otra numeracion. */
export function numerosWeb(datos, serie){
  const d = datos || {};
  const out = [];
  const ver = v => { const n = numeroDeNombre(v, serie); if (n != null) out.push(n); };
  if (serie === 'B'){
    for (const a of d.analisis || []){
      if (!a) continue;
      if (a.correccion) ver(a.correccion.ot_n);
      if (Array.isArray(a.agregados)) a.agregados.forEach(ag => ver(ag && ag.ot_n));
    }
  } else {
    for (const m of [...(d.movimientos || []), ...(d.ordenes_trabajo || [])]) ver(m && m.ot);
  }
  return out;
}

/* nombres: los de la carpeta, o null si no hay carpeta. La web puede ir
 * adelante (un PDF que OneDrive todavia no bajo a esta PC): manda el mayor. */
export function siguienteNumero({ nombres = null, web = [], ultimoVisto = null } = {}, serie){
  const enCarpeta = nombres ? (maximoSerie(nombres, serie) || { n: 0 }).n : 0;
  const max = Math.max(enCarpeta, ultimoVisto || 0, ...(web || []), 0);
  return formatearNumero(max + 1, serie);
}

/* El archivo que ya usa ese numero, o null. "938" y "0938" son el mismo. */
export function numeroUsado(nombres, numero, serie){
  const txt = String(numero ?? '').trim();
  const n = serie === 'B' ? numeroDeNombre(txt, 'B')
                          : (/^\d{1,4}$/.test(txt) ? parseInt(txt, 10) : null);
  if (n == null) return null;
  for (const nombre of nombres || []) if (numeroDeNombre(nombre, serie) === n) return nombre;
  return null;
}

export function nombreArchivo(numero, titulo){
  const t = String(titulo ?? '').replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return String(numero).trim() + (t ? ' ' + t : '') + '.pdf';
}

export function pareceCarpetaOT(nombres){
  return (nombres || []).includes(SERIES.B.subcarpeta);
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npx vitest run test/lotes-numero-ot.test.mjs`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add public/lotes/js/numero-ot.js test/lotes-numero-ot.test.mjs
git commit -m "feat(lotes): numeracion de OT a partir de los nombres de la carpeta de OneDrive"
```

---

### Task 2: `proximoNumeroOT` entiende el formato nuevo

Respaldo sin carpeta en Movimientos: después de la primera OT `0939` emitida desde la web, `proximoNumeroOT` tiene que seguir desde ahí y no volver a `OT-2026-001`.

**Files:**
- Modify: `public/lotes/js/ot-movimientos.js:30-52`
- Test: `test/lotes-ot-armado.test.mjs`

**Interfaces:**
- Produces: `proximoNumeroOT(movimientos, anio, ordenes)` — si hay algún `ot` con formato nuevo (4 dígitos) devuelve el siguiente en ese formato (`'0942'`); si no, el comportamiento viejo (`OT-<anio>-NNN`).

- [ ] **Step 1: Test que falla** — agregar al final de `test/lotes-ot-armado.test.mjs`:

```js
describe('proximoNumeroOT con el formato de la carpeta', () => {
  it('si ya hay OT 0939 sigue esa serie', () => {
    expect(proximoNumeroOT([{ ot: 'OT-2026-014' }, { ot: '0941' }], 2026, [{ ot: '0939' }])).toBe('0942');
  });
  it('sin formato nuevo, el de siempre', () => {
    expect(proximoNumeroOT([{ ot: 'OT-2026-014' }], 2026, [])).toBe('OT-2026-015');
  });
});
```

- [ ] **Step 2:** `npx vitest run test/lotes-ot-armado.test.mjs` → FAIL en el primer caso (`OT-2026-015`).

- [ ] **Step 3: Implementar** — en `ot-movimientos.js` agregar el import y el bloque al principio de la función; actualizar el comentario:

```js
import { numerosWeb, formatearNumero } from './numero-ot.js';
```

```js
/* Siguiente numero de OT libre. Desde 2026-10 la numeracion es la de la
 * carpeta de OneDrive (0939, ver numero-ot.js) y la propone guardar-ot.js
 * leyendo la carpeta. Esto queda como respaldo sin carpeta: si la web ya
 * tiene alguna OT con ese formato sigue desde ahi; si no, el formato viejo
 * OT-<anio>-<NNN>. (resto del comentario original sin cambios) */
export function proximoNumeroOT(movimientos, anio, ordenes = []){
  const nuevos = numerosWeb({ movimientos, ordenes_trabajo: ordenes }, 'principal');
  if (nuevos.length) return formatearNumero(Math.max(...nuevos) + 1, 'principal');
  // ... cuerpo original sin cambios
```

- [ ] **Step 4:** `npx vitest run test/lotes-ot-armado.test.mjs test/lotes-numero-ot.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/ot-movimientos.js test/lotes-ot-armado.test.mjs
git commit -m "feat(lotes): proximoNumeroOT sigue la serie de la carpeta si la web ya la usa"
```

---

### Task 3: `carpeta-ot.js` — acceso a la carpeta

Módulo de navegador; no se testea en vitest (no hay File System Access API en el runtime de Workers). Se verifica en Task 7 con OPFS (`navigator.storage.getDirectory()`), que da un `FileSystemDirectoryHandle` con la misma interfaz.

**Files:**
- Create: `public/lotes/js/carpeta-ot.js`

**Interfaces:**
- Consumes: `SERIES`, `maximoSerie` de `numero-ot.js`.
- Produces:
  - `soportado(): boolean`
  - `estado(): Promise<{tipo:'conectada'|'permiso'|'sin'|'no-soportado', nombre?:string}>`
  - `elegirCarpeta(): Promise<boolean>` (abre el selector; true si quedó conectada)
  - `usarCarpeta(handle): Promise<void>` (la usa elegirCarpeta; también sirve para probar con OPFS)
  - `pedirPermiso(): Promise<boolean>` (requiere gesto del usuario)
  - `listarSerie(serie): Promise<string[]|null>` (null = sin acceso; guarda el máximo visto)
  - `ultimoVisto(serie): number|null`
  - `escribirPdf(serie, nombre, blob): Promise<'ok'|'existe'|'sin-carpeta'|'error'>`
  - `listarRaiz(): Promise<string[]|null>`

- [ ] **Step 1: Implementar**

```js
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

export async function listarRaiz(){
  const d = await _dirDe('principal');
  return d ? _nombres(d) : null;
}

const _claveVisto = serie => 'lotes-ot-ultimo-' + serie;

export function ultimoVisto(serie){
  try { const n = parseInt(localStorage.getItem(_claveVisto(serie)), 10); return Number.isFinite(n) ? n : null; }
  catch { return null; }
}

export async function listarSerie(serie){
  const d = await _dirDe(serie);
  if (!d) return null;
  const nombres = await _nombres(d);
  const max = maximoSerie(nombres, serie);
  if (max) try { localStorage.setItem(_claveVisto(serie), String(max.n)); } catch { /* sin storage */ }
  return nombres;
}

/* Nunca pisa: si ya hay un archivo con ese nombre exacto devuelve 'existe'. */
export async function escribirPdf(serie, nombre, blob){
  const d = await _dirDe(serie, false);
  if (!d) return 'sin-carpeta';
  try {
    try { await d.getFileHandle(nombre); return 'existe'; } catch { /* no existe: bien */ }
    const fh = await d.getFileHandle(nombre, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return 'ok';
  } catch { return 'error'; }
}
```

- [ ] **Step 2: Chequeo de sintaxis**

Run: `node --check public/lotes/js/carpeta-ot.js`
Expected: sin salida (OK).

- [ ] **Step 3: Commit**

```bash
git add public/lotes/js/carpeta-ot.js
git commit -m "feat(lotes): acceso a la carpeta de OT de OneDrive (File System Access API)"
```

---

### Task 4: `hoja-pdf.js` — hojas A4 a PDF

**Files:**
- Create: `public/lotes/js/vendor/html2canvas.min.js`, `public/lotes/js/vendor/jspdf.umd.min.js`, `public/lotes/js/vendor/html2canvas-LICENSE.md`, `public/lotes/js/vendor/jspdf-LICENSE.md`
- Create: `public/lotes/js/hoja-pdf.js`

**Interfaces:**
- Produces: `pdfDeHojas(contenedor: HTMLElement, claseBody: string): Promise<Blob>` — captura cada `.orden-hoja` dentro de `contenedor`, tal como sale impresa con `body.<claseBody>`, y devuelve un PDF A4 con márgenes de 14 mm (el `@page` de `index.html`).
- `descargar(blob: Blob, nombre: string): void`

Cómo se logra "tal como sale impresa": html2canvas clona el documento en un iframe; en `onclone` se agrega `claseBody` al `<body>` del clon y se inyecta un `<style>` con **todas las reglas de dentro de `@media print`** de las hojas del documento, sin el envoltorio `@media`. Así el clon se ve con las reglas de impresión que ya existen (sin bordes de campos, sin botones, contenedores `display:none` visibles), sin duplicar CSS. El ancho del clon se fija a 182 mm (210 − 2×14) con `windowWidth`.

- [ ] **Step 1: Bajar las librerías**

```bash
cd public/lotes/js/vendor
curl -sfL -o html2canvas.min.js https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
curl -sfL -o jspdf.umd.min.js  https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js
curl -sfL -o html2canvas-LICENSE.md https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/LICENSE
curl -sfL -o jspdf-LICENSE.md https://cdn.jsdelivr.net/npm/jspdf@2.5.2/LICENSE
ls -l
cd ../../../..
```
Expected: los 4 archivos, los `.js` de más de 100 KB.

- [ ] **Step 2: Implementar `public/lotes/js/hoja-pdf.js`**

```js
/* ===== Lotes CIW — hojas de papel a PDF =====
 *
 * Convierte las hojas A4 (.orden-hoja) de una orden en un PDF, igual a como
 * salen impresas. El truco: html2canvas clona la pagina, y en el clon se pone
 * la clase printing-* en el body y se copian como reglas de pantalla todas
 * las de @media print. Asi se reusa el CSS de impresion que ya existe en vez
 * de mantener uno aparte.
 *
 * El PDF es imagen (sin texto seleccionable): alcanza para archivo.
 * Las librerias (js/vendor) se cargan recien al primer uso: no suman peso a
 * la carga de Lotes. */
'use strict';

const MARGEN_MM = 14;                 // el @page de index.html
const ANCHO_MM = 210 - 2 * MARGEN_MM; // 182
const ALTO_MM = 297 - 2 * MARGEN_MM;  // 269
const PX_POR_MM = 96 / 25.4;

const _cargados = {};
function _script(src){
  if (!_cargados[src]) _cargados[src] = new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
  return _cargados[src];
}

async function _librerias(){
  await Promise.all([_script('js/vendor/html2canvas.min.js'), _script('js/vendor/jspdf.umd.min.js')]);
  return { html2canvas: window.html2canvas, jsPDF: window.jspdf.jsPDF };
}

/* Las reglas de dentro de @media print, como texto. Las hojas de otro origen
 * (fuentes de Google) tiran al leer cssRules: se saltean. */
export function reglasDeImpresion(doc){
  let css = '';
  for (const hoja of doc.styleSheets){
    let reglas;
    try { reglas = hoja.cssRules; } catch { continue; }
    for (const r of reglas){
      if (r.media && /\bprint\b/.test(r.media.mediaText))
        for (const sub of r.cssRules) css += sub.cssText + '\n';
    }
  }
  return css;
}

export async function pdfDeHojas(contenedor, claseBody){
  const { html2canvas, jsPDF } = await _librerias();
  const css = reglasDeImpresion(document);
  const anchoPx = Math.round(ANCHO_MM * PX_POR_MM);
  const hojas = [...contenedor.querySelectorAll('.orden-hoja')];
  if (!hojas.length) throw new Error('No hay hojas para guardar.');
  hojas.forEach((h, i) => { h.dataset.pdfHoja = String(i); });

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  try {
    for (let i = 0; i < hojas.length; i++){
      const canvas = await html2canvas(hojas[i], {
        scale: 2, backgroundColor: '#ffffff', windowWidth: anchoPx, logging: false,
        onclone: doc => {
          doc.body.classList.add(claseBody);
          const st = doc.createElement('style');
          st.textContent = css;
          doc.head.appendChild(st);
        },
      });
      // Una hoja mas alta que el area util se corta en varias paginas.
      const altoHojaMm = canvas.height * ANCHO_MM / canvas.width;
      const cortes = Math.max(1, Math.ceil(altoHojaMm / ALTO_MM - 0.02));
      const altoCortePx = Math.ceil(canvas.height / cortes);
      for (let c = 0; c < cortes; c++){
        const trozo = document.createElement('canvas');
        trozo.width = canvas.width;
        trozo.height = Math.min(altoCortePx, canvas.height - c * altoCortePx);
        trozo.getContext('2d').drawImage(canvas, 0, -c * altoCortePx);
        if (i || c) pdf.addPage();
        pdf.addImage(trozo.toDataURL('image/jpeg', 0.92), 'JPEG', MARGEN_MM, MARGEN_MM,
                     ANCHO_MM, trozo.height * ANCHO_MM / trozo.width);
      }
    }
  } finally {
    hojas.forEach(h => { delete h.dataset.pdfHoja; });
  }
  return pdf.output('blob');
}

export function descargar(blob, nombre){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
```

Nota para el implementador: el elemento que se pasa a html2canvas está en el documento **original**; html2canvas lo ubica en el clon por sí mismo. Si un contenedor está en `display:none` en pantalla (`#ocPaginas`, `#agPaginas`, `#otMovHoja`), la regla de impresión `display:block!important` lo muestra en el clon. Si html2canvas devuelve un canvas de 0×0 para esos contenedores, mostrarlos fuera de pantalla durante la captura (`contenedor.style.cssText += ';display:block;position:absolute;left:-10000px;width:' + anchoPx + 'px'` y restaurar el `style` original en el `finally`). Verificarlo en Task 7 con cada una de las cinco hojas.

- [ ] **Step 3: Chequeo de sintaxis**

Run: `node --check public/lotes/js/hoja-pdf.js`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add public/lotes/js/vendor/html2canvas.min.js public/lotes/js/vendor/jspdf.umd.min.js public/lotes/js/vendor/html2canvas-LICENSE.md public/lotes/js/vendor/jspdf-LICENSE.md public/lotes/js/hoja-pdf.js
git commit -m "feat(lotes): hojas de papel a PDF reusando el CSS de impresion (html2canvas + jsPDF a demanda)"
```

---

### Task 5: `guardar-ot.js` — número propuesto, chip de carpeta, imprimir y guardar

**Files:**
- Create: `public/lotes/js/guardar-ot.js`

**Interfaces:**
- Consumes: `carpeta-ot.js` (Task 3), `numero-ot.js` (Task 1), `hoja-pdf.js` (Task 4), de `nucleo.js`: `DATOS`, `mostrarOverlay`, `cerrarOverlay`, `esc`, `escA`, `$` (verificar los nombres exactos con `grep -n "^export" public/lotes/js/nucleo.js` antes de importar; si `esc`/`escA` viven en otro módulo, importarlos de ahí, igual que en `vista-ot-emitir.js`).
- Produces:
  - `proponerNumero(serie): Promise<{numero:string, ultimo:string|null, conCarpeta:boolean}>`
  - `chipCarpeta(serie): string` (HTML de un `<span class="ot-carpeta" data-serie>`; se completa solo)
  - `cablearChipsCarpeta(raiz: HTMLElement, alCambiar?: () => void): void`
  - `imprimirYGuardar({claseBody, contenedor, serie, numero, titulo, numeroFijo=false, antes?}): Promise<{ok:boolean, numeroLibre?:string}>`
    - `numeroFijo=false` (muestras, corrección, agregados): si el número ya está en la carpeta, avisa, NO imprime y devuelve `{ok:false, numeroLibre}` para que la vista ponga ese número.
    - `numeroFijo=true` (OT ya emitida): si hay otro archivo con ese número, pide confirmación y sigue.
    - `antes()` corre antes de generar el PDF (p. ej. pintar la hoja en el contenedor oculto).
    - Muestra un overlay: estado de la carpeta, nombre del archivo editable, botones **🖨 Imprimir y guardar PDF**, **Solo imprimir**, **Cancelar**.
    - Con carpeta: genera el PDF → `escribirPdf` → `'existe'` avisa sin pisar; `'error'` ofrece descargar. Sin carpeta: aviso "sin carpeta: revisá el número a mano" y `descargar`. Después, `window.print()` con `claseBody` (lo mismo que cada vista hacía).

- [ ] **Step 1: Implementar**

```js
/* ===== Lotes CIW — numero y PDF de una orden contra la carpeta de OneDrive =====
 *
 * El paso comun de las cinco ordenes (OT de movimientos, muestras,
 * microbiologia, correccion de SO2 y agregados): proponer el numero leyendo la
 * carpeta, y al imprimir guardar el PDF en ella. Ver
 * docs/superpowers/specs/2026-10-13-ot-carpeta-onedrive-design.md. */
'use strict';

import { DATOS, mostrarOverlay, cerrarOverlay, $, esc, escA } from './nucleo.js';
import { siguienteNumero, numerosWeb, maximoSerie, numeroUsado, nombreArchivo, pareceCarpetaOT } from './numero-ot.js';
import { estado, elegirCarpeta, pedirPermiso, listarSerie, listarRaiz, ultimoVisto, escribirPdf } from './carpeta-ot.js';
import { pdfDeHojas, descargar } from './hoja-pdf.js';

export async function proponerNumero(serie){
  const nombres = await listarSerie(serie);
  const max = nombres ? maximoSerie(nombres, serie) : null;
  return {
    numero: siguienteNumero({ nombres, web: numerosWeb(DATOS(), serie), ultimoVisto: ultimoVisto(serie) }, serie),
    ultimo: max ? max.nombre : null,
    conCarpeta: !!nombres,
  };
}

export function chipCarpeta(serie){
  return `<span class="ot-carpeta" data-serie="${escA(serie)}" style="font-size:12px;color:var(--muted)">📁 …</span>`;
}

async function _textoChip(serie){
  const e = await estado();
  if (e.tipo === 'no-soportado') return { txt: '⚠ Este navegador no guarda en la carpeta (usá Chrome o Edge): revisá el número a mano', accion: null };
  if (e.tipo === 'sin') return { txt: '⚠ Sin carpeta: revisá el número a mano · 📁 Conectar carpeta de OT', accion: 'elegir' };
  if (e.tipo === 'permiso') return { txt: '📁 ' + e.nombre + ' · Dar permiso', accion: 'permiso' };
  const p = await proponerNumero(serie);
  return { txt: '📁 ' + e.nombre + (p.ultimo ? ' · última: ' + p.ultimo : ' · sin órdenes todavía'), accion: null };
}

export function cablearChipsCarpeta(raiz, alCambiar){
  for (const chip of raiz.querySelectorAll('.ot-carpeta')){
    const serie = chip.dataset.serie;
    const pintar = async () => {
      const t = await _textoChip(serie);
      chip.innerHTML = t.accion ? `<a href="#" data-accion="${t.accion}">${esc(t.txt)}</a>` : esc(t.txt);
    };
    chip.addEventListener('click', async ev => {
      const a = ev.target.closest('[data-accion]');
      if (!a) return;
      ev.preventDefault();
      const ok = a.dataset.accion === 'elegir' ? await elegirCarpeta() : await pedirPermiso();
      if (ok && a.dataset.accion === 'elegir'){
        const raizNombres = await listarRaiz();
        if (raizNombres && !pareceCarpetaOT(raizNombres))
          alert('En esa carpeta no está «B Ordenes de agregados». ¿Es la carpeta «Ordenes de Trabajo 2026»? Si no, volvé a elegirla.');
      }
      await pintar();
      if (ok && alCambiar) alCambiar();
    });
    pintar();
  }
}

function _imprimir(claseBody){
  document.body.classList.add(claseBody);
  window.print();
  document.body.classList.remove(claseBody);
}

export async function imprimirYGuardar({ claseBody, contenedor, serie, numero, titulo, numeroFijo = false, antes }){
  numero = String(numero || '').trim();
  if (!numero){ alert('Falta el N° de orden.'); return { ok: false }; }

  // Re-chequeo contra la carpeta justo antes de imprimir.
  const nombres = await listarSerie(serie);
  const usado = nombres ? numeroUsado(nombres, numero, serie) : null;
  const nombre0 = nombreArchivo(numero, titulo);
  if (usado && usado !== nombre0){
    if (!numeroFijo){
      const libre = siguienteNumero({ nombres, web: numerosWeb(DATOS(), serie), ultimoVisto: ultimoVisto(serie) }, serie);
      alert('El N° ' + numero + ' ya está en la carpeta: «' + usado + '».\nTe propongo el ' + libre + '. Revisalo y volvé a imprimir.');
      return { ok: false, numeroLibre: libre };
    }
    if (!confirm('En la carpeta ya hay otro archivo con el N° ' + numero + ': «' + usado + '».\n¿Guardar igual?'))
      return { ok: false };
  }

  return new Promise(fin => {
    mostrarOverlay(`
<h3 style="margin:0 0 14px">🖨 Imprimir y guardar ${esc(numero)}</h3>
<div style="margin-bottom:8px">${chipCarpeta(serie)}</div>
<label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px">Nombre del PDF</label>
<input class="txt" id="ogNombre" style="width:100%" value="${escA(nombre0)}">
<div id="ogMsg" style="margin-top:8px"></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="ogCancelar">Cancelar</button>
  <button class="btn" id="ogSolo">Solo imprimir</button>
  <button class="btn primary" id="ogGuardar">🖨 Imprimir y guardar PDF</button>
</div>`);
    cablearChipsCarpeta(document.getElementById('ogMsg').parentElement);
    $('ogCancelar').addEventListener('click', () => { cerrarOverlay(); fin({ ok: false }); });
    $('ogSolo').addEventListener('click', () => {
      cerrarOverlay(); if (antes) antes(); _imprimir(claseBody); fin({ ok: true });
    });
    $('ogGuardar').addEventListener('click', async () => {
      const nombre = nombreArchivo('', $('ogNombre').value).replace(/^\s*/, '') || nombre0;
      $('ogMsg').innerHTML = '<div class="msg">Armando el PDF…</div>';
      try {
        if (antes) antes();
        const blob = await pdfDeHojas(contenedor, claseBody);
        const r = await escribirPdf(serie, nombre, blob);
        if (r === 'existe'){
          $('ogMsg').innerHTML = '<div class="msg err">Ya hay un archivo «' + esc(nombre) + '» en la carpeta: no se pisa. Cambiá el nombre o usá «Solo imprimir».</div>';
          return;
        }
        if (r === 'sin-carpeta'){
          descargar(blob, nombre);
          alert('Sin carpeta de OT: el PDF se descargó. Copialo a la carpeta y revisá el número a mano.');
        } else if (r === 'error'){
          descargar(blob, nombre);
          alert('No se pudo escribir en la carpeta (¿permiso?). El PDF se descargó: copialo a mano.');
        }
      } catch (e){
        $('ogMsg').innerHTML = '<div class="msg err">No se pudo armar el PDF: ' + esc(e.message) + '. Podés usar «Solo imprimir».</div>';
        return;
      }
      cerrarOverlay();
      _imprimir(claseBody);
      fin({ ok: true });
    });
  });
}
```

Ojo en `ogGuardar`: `nombreArchivo('', texto)` agrega `.pdf` y limpia caracteres; como el texto del input ya trae el número, el número vacío solo deja un espacio inicial que se recorta. Si el input termina vacío se usa `nombre0`.

- [ ] **Step 2:** `node --check public/lotes/js/guardar-ot.js` → OK. Verificar con `grep -n "^export" public/lotes/js/nucleo.js` que `DATOS, mostrarOverlay, cerrarOverlay, $, esc, escA` existen ahí; si alguno vive en otro archivo, corregir el import copiando el de `vista-ot-emitir.js`.

- [ ] **Step 3: Commit**

```bash
git add public/lotes/js/guardar-ot.js
git commit -m "feat(lotes): paso comun de numero + imprimir y guardar PDF en la carpeta de OT"
```

---

### Task 6: Conectar las cinco órdenes

Cada sub-paso es independiente; se commitea por vista. En todas: el número arranca con el valor sincrónico de hoy (respaldo) y se reemplaza por `proponerNumero` **solo si el usuario no tocó el campo**.

**Files:**
- Modify: `public/lotes/js/vista-ot-emitir.js` (abrirEmitirOT ~162-190, `_emitir` ~238, `imprimirOT` ~355-361)
- Modify: `public/lotes/js/vista-ot-corte.js` (st.numero ~43, `emitir` ~218-226, y el campo de número del paso de cabecera)
- Modify: `public/lotes/js/vista-ot-lista.js` (`_imprimir`)
- Modify: `public/lotes/js/vista-movimientos.js` (`_abrirModalOT` ~818, `_imprimirOT` ~796-801)
- Modify: `public/lotes/js/vista-orden.js` (render ~166, `btnOtImprimir` ~809-815)
- Modify: `public/lotes/js/vista-orden-correccion.js` (`#ocNumOrden` ~775, `btnOcImprimir` ~902-906)
- Modify: `public/lotes/js/vista-agregados.js` (`_htmlArmar` ~124-131, `_imprimir` ~320-341)

**Interfaces:**
- Consumes: `proponerNumero`, `chipCarpeta`, `cablearChipsCarpeta`, `imprimirYGuardar` (Task 5); `listarSerie`, `numeroUsado` para el chequeo al emitir (Tasks 1/3).

- [ ] **Step 1: OT de trasiego (`vista-ot-emitir.js`)**

Import:
```js
import { proponerNumero, chipCarpeta, cablearChipsCarpeta, imprimirYGuardar } from './guardar-ot.js';
import { listarSerie } from './carpeta-ot.js';
import { numeroUsado } from './numero-ot.js';
import { PLANTILLAS_OT } from './ot-plantillas.js'; // solo si no esta importado ya
```

En `abrirEmitirOT`, la fila del número pasa a:
```js
  <label>N° de OT</label><div><input class="txt" id="oteNumero" value="${escA(numero)}"> ${chipCarpeta('principal')}</div>
```
y después de `mostrarOverlay(...)`:
```js
  let numeroTocado = false;
  $('oteNumero').addEventListener('input', () => { numeroTocado = true; });
  const sembrar = () => proponerNumero('principal').then(p => {
    if (!numeroTocado && $('oteNumero')) $('oteNumero').value = p.numero;
  });
  sembrar();
  cablearChipsCarpeta($('oteNumero').parentElement, sembrar);
```

Nueva función exportada (la usa también el Corte):
```js
/* El numero ya esta en la carpeta de OneDrive? (otra orden hecha en Excel
 * mientras se armaba esta). true = se puede seguir. */
export async function numeroLibreEnCarpeta(numero){
  const nombres = await listarSerie('principal');
  const usado = nombres ? numeroUsado(nombres, numero, 'principal') : null;
  if (!usado) return true;
  alert('El N° ' + numero + ' ya está en la carpeta de OT: «' + usado + '». Cambiá el número.');
  return false;
}
```

En `_emitir`, después de `if (!confirmarNumeroRepetido(numero)) return;`:
```js
  if (!(await numeroLibreEnCarpeta(numero))) return;
```

`imprimirOT` pasa a:
```js
export function tituloOT(ot){
  const p = PLANTILLAS_OT.find(x => x.id === ot.plantilla);
  const lotes = (ot.lotes || []).map(l => l.lote).filter(Boolean).join(' ');
  return ((p ? p.nombre : 'OT') + ' ' + lotes).trim();
}

export function imprimirOT(ot, opciones){
  const cont = $('otMovHoja');
  if (!cont) return;
  return imprimirYGuardar({
    claseBody: 'printing-ot-mov', contenedor: cont, serie: 'principal',
    numero: ot.ot, titulo: tituloOT(ot), numeroFijo: true,
    antes: () => { cont.innerHTML = hojasOT(ot, opciones); },
  });
}
```

- [ ] **Step 2: Corte (`vista-ot-corte.js`)**

Importar `proponerNumero, chipCarpeta, cablearChipsCarpeta` de `./guardar-ot.js` y `numeroLibreEnCarpeta` de `./vista-ot-emitir.js` (sumarlo al import existente de la línea 22). Al armar `st`, agregar `numeroTocado: !!(previo && previo.numero)`. Justo después de crear `st`:
```js
  if (!st.numeroTocado) proponerNumero('principal').then(p => {
    if (!st.numeroTocado){ st.numero = p.numero; pintar(); }
  });
```
En el `input` del campo de número del paso de cabecera (buscarlo con `grep -n "st.numero" public/lotes/js/vista-ot-corte.js`), agregar `st.numeroTocado = true;` y poner `${chipCarpeta('principal')}` al lado del campo; después de pintar ese paso llamar `cablearChipsCarpeta(<contenedor del paso>)`. En `emitir()`, después de `if (!confirmarNumeroRepetido(st.numero)) return;`:
```js
    if (!(await numeroLibreEnCarpeta(st.numero))) return;
```

- [ ] **Step 3: Lista de OT (`vista-ot-lista.js`)**

Ver `_imprimir(id)` (`grep -n "function _imprimir" -A15 public/lotes/js/vista-ot-lista.js`). Si termina en `abrirImprimirOT`/`imprimirOT`, no hay nada que cambiar. Si llama a `window.print()` por su cuenta, reemplazar ese bloque por `await imprimirOT(ot, op)` (importado de `vista-ot-emitir.js`).

- [ ] **Step 4: Movimiento suelto (`vista-movimientos.js`)**

En `_abrirModalOT`, cuando `esNuevo`: después de mostrar el modal, si el campo del número (buscar el id del input que recibe `base.ot`) no se tocó, reemplazar con `proponerNumero('principal')`, igual que en Step 1 (bandera `numeroTocado` en `input`). Al confirmar el alta nueva, antes de guardar: `if (!(await numeroLibreEnCarpeta(<numero>))) return;` (importar de `vista-ot-emitir.js`).

`_imprimirOT(mov)` pasa a:
```js
function _imprimirOT(mov){
  imprimirYGuardar({
    claseBody: 'printing-ot-mov', contenedor: $('otMovHoja'), serie: 'principal',
    numero: mov.ot, titulo: (mov.tipo || 'Movimiento') + ' ' + (mov.lote || ''), numeroFijo: true,
    antes: () => _pintarHojaOT(mov),
  });
}
```

- [ ] **Step 5: Orden de muestras y microbiología (`vista-orden.js`)**

Las dos usan la serie principal y el mismo `_otHoja.nro`. En `renderOrden` (o donde se pinta `#otPaginas`), después de pintar:
```js
  if (!_otHoja.nro && !_otNroPropuesto){
    _otNroPropuesto = true;
    proponerNumero('principal').then(p => {
      if (_otHoja.nro) return;
      _otHoja.nro = p.numero;
      document.querySelectorAll('#otPaginas [data-campo="nro"]').forEach(i => { i.value = p.numero; });
    });
  }
```
con `let _otNroPropuesto = false;` junto a `_otHoja` (línea 35), para no pisar un número que el usuario borró a propósito. Agregar `${chipCarpeta('principal')}` en la cabecera de controles, al lado del botón `btnOtImprimir` (línea 532), y `cablearChipsCarpeta(<cabecera>)` donde se cablea `btnOtImprimir`.

El botón imprimir (línea 809) pasa a:
```js
  $('btnOtImprimir').addEventListener('click', async () => {
    const r = await imprimirYGuardar({
      claseBody: 'printing-orden', contenedor: $('otPaginas'), serie: 'principal',
      numero: _otHoja.nro, titulo: _otTitulo,
    });
    if (r.numeroLibre){
      _otHoja.nro = r.numeroLibre;
      document.querySelectorAll('#otPaginas [data-campo="nro"]').forEach(i => { i.value = r.numeroLibre; });
      return;
    }
    if (!r.ok) return;
    /* microbiologia no usa el dado: no hay barriles que anotar */
    if (!_esMicro()) _otRegistrarMuestreo();
  });
```

- [ ] **Step 6: Orden de corrección de SO₂ (`vista-orden-correccion.js`)**

Junto al input `#ocNumOrden` (línea 775) agregar `${chipCarpeta('B')}`; el placeholder pasa a `B223`. Donde se cablean los campos del encabezado (línea 890):
```js
  cablearChipsCarpeta($('ocNumOrden').parentElement, () => sembrarOc());
  const sembrarOc = () => proponerNumero('B').then(p => {
    const el = $('ocNumOrden');
    if (el && !el.value.trim()){ el.value = p.numero; _ocPintarPaginas(); }
  });
  sembrarOc();
```
(declarar `sembrarOc` antes de usarlo en `cablearChipsCarpeta`.)

Botón imprimir (línea 902):
```js
  $('btnOcImprimir').addEventListener('click', async () => {
    const r = await imprimirYGuardar({
      claseBody: 'printing-ordencorr', contenedor: $('ocPaginas'), serie: 'B',
      numero: $('ocNumOrden').value, titulo: 'Correccion SO2',
      antes: () => _ocPintarPaginas(),
    });
    if (r.numeroLibre){ $('ocNumOrden').value = r.numeroLibre; _ocPintarPaginas(); }
  });
```

- [ ] **Step 7: Otros agregados (`vista-agregados.js`)**

`_htmlArmar` (línea 131): agregar `${chipCarpeta('B')}` después del input `#agOT`. Donde se cablean los eventos de la vista (el mismo lugar que el listener de `data-g`, ~línea 225), agregar:
```js
  const sembrarAg = () => proponerNumero('B').then(p => {
    if (_b.otTocada) return;
    _b.ot = p.numero;
    if ($('agOT')) $('agOT').value = p.numero;
  });
  sembrarAg();
  cablearChipsCarpeta($('agOT').parentElement, sembrarAg);
```

En `_imprimir`, reemplazar las tres líneas finales (`classList.add` / `window.print()` / `classList.remove`) por:
```js
  const r = await imprimirYGuardar({
    claseBody: 'printing-agregados', contenedor: cont, serie: 'B',
    numero: _b.ot, titulo: 'OT agregados',
  });
  if (r.numeroLibre){ _b.ot = r.numeroLibre; _b.otTocada = true; if ($('agOT')) $('agOT').value = r.numeroLibre; }
```
(`cont.innerHTML = pintarHojas(...)` queda antes, como está.)

- [ ] **Step 8: Correr toda la suite**

Run: `npm test`
Expected: PASS, salvo fallas que ya existían en `main` (comparar con `git stash; npm test; git stash pop` si aparece algo raro).

- [ ] **Step 9: Commits** (uno por vista, o uno solo si quedó todo junto)

```bash
git add public/lotes/js/vista-ot-emitir.js public/lotes/js/vista-ot-corte.js public/lotes/js/vista-ot-lista.js public/lotes/js/vista-movimientos.js
git commit -m "feat(lotes): OT de movimientos numeradas por la carpeta y PDF al imprimir"
git add public/lotes/js/vista-orden.js public/lotes/js/vista-orden-correccion.js public/lotes/js/vista-agregados.js
git commit -m "feat(lotes): muestras, microbiologia, correccion y agregados numerados por la carpeta y PDF al imprimir"
```

---

### Task 7: Verificación en el navegador

**Files:**
- Create (scratchpad, NO en el repo): `mock-ot-carpeta.mjs` — copia de `C:/Users/Bmax/AppData/Local/Temp/claude/C--Users-Bmax-OneDrive---BODEGAS-ESMERALDA-SA-Escritorio-claude/0f27fd6e-92eb-48f7-bba4-4310bb501fcd/scratchpad/mock-ot-celdas.mjs` con `RAIZ = 'C:/Users/Bmax/repos/catenainstitute-ot-carpeta/public'`, puerto `8810`, y en `doc.analisis` un análisis con `correccion: { ot_n: 'B222' }` para la serie B.
- Modify: `C:/Users/Bmax/OneDrive - BODEGAS ESMERALDA SA/Escritorio/claude/.claude/launch.json` — entrada `lotes-ot-carpeta` (node, ese mock, puerto 8810), igual a `lotes-ot-celdas`.

- [ ] **Step 1:** Arrancar con `preview_start {name:'lotes-ot-carpeta'}` y abrir `/lotes/`.

- [ ] **Step 2: Carpeta de prueba en OPFS** (no se puede clickear el selector nativo). Con `javascript_tool`:

```js
const raiz = await navigator.storage.getDirectory();
for await (const n of raiz.keys()) await raiz.removeEntry(n, { recursive: true });
for (const n of ['0937 Muestras Ensayos.xlsx', '0938 Muestra cortes vinos Liberados.xlsx', 'AAA Guía de Trabajos.xlsx'])
  await (await raiz.getFileHandle(n, { create: true })).createWritable().then(w => w.close());
const b = await raiz.getDirectoryHandle('B Ordenes de agregados', { create: true });
await (await b.getFileHandle('B222 Correccion SO2.xlsx', { create: true })).createWritable().then(w => w.close());
const m = await import('/lotes/js/carpeta-ot.js'); await m.usarCarpeta(raiz);
(await import('/lotes/js/guardar-ot.js')).proponerNumero('principal');
```
Expected: `{numero:'0939', ultimo:'0938 Muestra cortes vinos Liberados.xlsx', conCarpeta:true}`; con `'B'` → `B223`.

- [ ] **Step 3: Cada una de las cinco órdenes.** Para cada una, abrir la vista, chequear que el N° propuesto sea `0939`/`B223` y que el chip muestre la última. Después pisar `window.print = () => console.log('PRINT')` y apretar imprimir → **Imprimir y guardar PDF**. Verificar:
  - en OPFS aparece `<número> <título>.pdf` (`for await (const n of raiz.keys()) ...`) con tamaño > 10 KB;
  - en consola aparece `PRINT`;
  - abrir el PDF (`URL.createObjectURL(await (await raiz.getFileHandle(nombre)).getFile())` en una pestaña nueva) y sacar screenshot: se ve la hoja como en papel (sin bordes de campos ni botones, con el N° de orden).
  Si alguna hoja sale en blanco o de 0×0, aplicar la nota de Task 4 (mostrar el contenedor fuera de pantalla durante la captura).

- [ ] **Step 4: Re-chequeo.** Crear en OPFS `0939 hecho en excel.xlsx` y volver a imprimir la Orden de muestras con 0939 → aviso "ya está en la carpeta", el campo pasa a `0940`, no se escribe PDF. Emitir una OT de trasiego con 0939 ya usado → aviso y no se emite.

- [ ] **Step 5: No pisa.** Imprimir dos veces la misma orden con el mismo nombre → la segunda avisa "ya hay un archivo… no se pisa".

- [ ] **Step 6: Sin carpeta.** `indexedDB.deleteDatabase('lotes-carpeta-ot')` y recargar → chip "⚠ Sin carpeta: revisá el número a mano", el número se propone igual (respaldo: último visto + web) e imprimir y guardar **descarga** el PDF (`read_network_requests`/consola, o pisar `descargar` con un log).

- [ ] **Step 7:** Screenshot del diálogo de imprimir y guardar y de un PDF generado como prueba para el usuario. Sacar la entrada de `launch.json` que no se use más, o dejarla commiteada en el repo de Escritorio\claude como las anteriores (`chore: launch.json con el servidor de prueba de la carpeta de OT (lotes-ot-carpeta, :8810)`).

- [ ] **Step 8:** Prueba real del selector (la hace el usuario o se hace con él): en Chrome, botón 📁 → elegir una **copia** de `Ordenes de Trabajo 2026` (por ejemplo `Escritorio\prueba-ot`) → emitir una orden → el PDF aparece en esa copia. No usar la carpeta real hasta el deploy.

---

### Task 8: Merge

- [ ] **Step 1:** `npm test` en el worktree → PASS.
- [ ] **Step 2:** Mergear a `main` en `C:/Users/Bmax/repos/catenainstitute` (`git merge --no-ff feat/ot-carpeta-onedrive -m "Merge branch 'feat/ot-carpeta-onedrive': OT numeradas por la carpeta de OneDrive y PDF al imprimir"`), comprobando antes que ahí esté en `main` limpio (otras sesiones cambian de rama).
- [ ] **Step 3:** El push y el deploy los decide el usuario. Deploy solo desde `repos/catenainstitute` en `main` limpio.
- [ ] **Step 4:** Actualizar la memoria `lotes-ot-carpeta-onedrive.md` con el commit de merge y "falta deploy".
