# Guía de trabajos numerada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la Guía de trabajos (`/ordenes/?v=guia`) al imprimir tome el próximo N° de la serie principal de la carpeta OneDrive, guarde el PDF ahí, quede en Historial como ejecutada (con Ver/Reimprimir), y que la hoja tenga el recuadro del Excel RCI 08.

**Architecture:** Servidor: tabla nueva `guia_impresas` (una fila por impresión, con la foto de la hoja) + rutas `GET/POST /ordenes/api/guia/impresas`; `/lista` y `/numeros` las suman. Cliente: `guia-hoja.js` arma la hoja con marco y N° (también desde una foto); `guia-vista.js` reusa `imprimirYGuardar` de `public/lotes/js/guardar-ot.js` (como Prensas) y después postea la foto; `app.js` muestra una impresa en solo lectura.

**Tech Stack:** Cloudflare Workers + D1 (TypeScript, `src/`), JS ES modules sin build (`public/`), vitest con `@cloudflare/vitest-pool-workers` (`npm test`), `npx tsc --noEmit`.

**Spec:** `docs/superpowers/specs/2026-11-11-guia-numerada-design.md`

## Global Constraints

- Trabajar en el worktree `C:\Users\Bmax\repos\catenainstitute-guia-numerada` (rama `feat/guia-numerada`). **Nunca pushear a main** (push a main = producción): el merge lo hace el usuario.
- Textos de la interfaz en castellano rioplatense ("Imprimí", "Volvé"), como el resto del código.
- Serie de la guía: `'principal'` (números de 4 dígitos, `0966`). Nombre del PDF: `<N°> Guía de trabajos.pdf`.
- Nada de `alert/confirm`: avisos con `window.CI?.avisar` / diálogos de `public/lotes/js/dialogos.js`.
- No tocar `public/lotes/index.html` ni sus reglas `@media print` (`test/lotes-papel-intacto` las congela). El CSS nuevo va en `public/ordenes/index.html`.
- Un módulo JS nuevo importado por `/ordenes/js/app.js` exige correr `node scripts/precargas.mjs` (el CI corre `--verificar`).
- En Windows `test/ordenes-modo-y-pantalla-url.test.ts` falla también en main (CRLF): no es de este trabajo.
- Probar la carpeta SOLO con OPFS / carpeta de prueba, nunca con la carpeta real de OneDrive.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

- Create `migrations/0004_guia_impresas.sql` — tabla `guia_impresas`.
- Create `src/ordenes/impresas.ts` — validar la foto, leer/escribir filas, resumen para la lista, números.
- Modify `src/ordenes/rutas.ts` — rutas `/guia/impresas`, sumar impresas en `/lista` y `/numeros`.
- Modify `src/ordenes/resumen.ts` — `ResumenOrden.modulo` admite `'guia'`, `fuente` admite `'guia_impresas'`.
- Modify `public/ordenes/js/guia.js` — `fotoImpresa`.
- Modify `public/ordenes/js/guia-hoja.js` — recuadro, N°, `hojaImpresa`.
- Modify `public/ordenes/js/lista.js` — `urlAbrir` para `modulo: 'guia'`, clave `impresa` en la URL.
- Modify `public/ordenes/js/catalogo.js` — `nombreDeTipo('guia')`.
- Modify `public/ordenes/js/guia-vista.js` — chip de carpeta, N° editable, imprimir y guardar, overlay, entorno.
- Create `public/ordenes/js/guia-impresa.js` — vista solo lectura de una impresa.
- Modify `public/ordenes/js/app.js` — ruta a la vista de impresa.
- Modify `public/ordenes/index.html` — CSS del marco, overlay, precargas.
- Tests: `test/ordenes-guia-impresas.test.ts` (nuevo), `test/ordenes-guia.test.mjs`, `test/ordenes-guia-hoja.test.mjs`, `test/ordenes-lista.test.mjs`.

---

### Task 1: Servidor — tabla y rutas de impresas

**Files:**
- Create: `migrations/0004_guia_impresas.sql`
- Create: `src/ordenes/impresas.ts`
- Modify: `src/ordenes/rutas.ts`, `src/ordenes/resumen.ts:14-18`
- Test: `test/ordenes-guia-impresas.test.ts`

**Interfaces:**
- Produces (HTTP):
  - `POST /ordenes/api/guia/impresas` body `{ numero: string, foto: { emitio, recibio, renglones: [{ n:number, tipo:'tarea'|'nota'|'orden', texto:string }] } }` → `200 { id: number }`; `403` lector; `400 { error:'impresa_invalida', detalles:[…] }`; `503` sin tabla.
  - `GET /ordenes/api/guia/impresas?id=N` → `200 { id, numero, fecha, por, foto }` | `404`.
  - `/ordenes/api/lista` suma `{ modulo:'guia', id:String(id), fuente:'guia_impresas', tipo:'guia', numero, fecha:fecha.slice(0,10), estado:'ejecutada', lotes:[], lote_corte:'', emitio: foto.emitio || por }`.
  - `/ordenes/api/numeros?serie=principal` suma los números de las impresas.

- [ ] **Step 1: Migración**

`migrations/0004_guia_impresas.sql`:
```sql
-- Guía de trabajos: cada impresión numerada (serie principal de la carpeta
-- OneDrive) con la foto de la hoja tal como salió. Va aparte de
-- guia_trabajos: la guía viva se manda entera en cada guardado y no tiene
-- que cargar con el historial.
CREATE TABLE IF NOT EXISTS guia_impresas (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  numero  TEXT NOT NULL,
  fecha   TEXT NOT NULL,
  por     TEXT,
  json    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS guia_impresas_numero ON guia_impresas (numero);
```

- [ ] **Step 2: Test que falla**

`test/ordenes-guia-impresas.test.ts` (mismo armado que `test/ordenes-guia-rutas.test.ts`: copiar `pedir`, `BASE`, los perfiles LECTOR/EDITOR/SOLO_BARRILES y el documento de lotes con `ordenes_trabajo` 0957):
```ts
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import worker from '../src/index';

const BASE = 'https://catenainstitute.example';
const LECTOR = 'lector-imp@catenawines.com';
const EDITOR = 'editor-imp@catenawines.com';
const SOLO_BARRILES = 'barriles-imp@catenawines.com';

async function pedir(ruta: string, email?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (email) headers['Cf-Access-Authenticated-User-Email'] = email;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(BASE + ruta, {
    method: body === undefined ? 'GET' : 'POST', headers, redirect: 'manual',
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const FOTO = { emitio: 'Oriana', recibio: 'Enzo', renglones: [
  { n: 1, tipo: 'tarea', texto: 'Lavar barriles' },
  { n: 0, tipo: 'nota', texto: 'ojo' },
  { n: 2, tipo: 'orden', texto: 'Traslado · N° 0957 · 26329' },
] };

beforeAll(async () => {
  const p = (e: string, m: string, r: string) =>
    env.DB.prepare('INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre) VALUES (?, ?, ?, ?)').bind(e, m, r, 'X').run();
  await p(LECTOR, 'lotes', 'lector');
  await p(EDITOR, 'lotes', 'editor');
  await p(SOLO_BARRILES, 'barriles', 'admin');
  await env.DB.prepare('INSERT OR REPLACE INTO documento (modulo, version, json, autor, guardado) VALUES (?, ?, ?, ?, ?)')
    .bind('lotes', 1, JSON.stringify({ movimientos: [{ id: 'm1', ot: '0957' }],
      ordenes_trabajo: [{ id: 'ot-1', ot: '0957', plantilla: 'traslado', fecha: '2026-11-03', estado: 'pendiente', lotes: [{ lote: '26329', mov_id: 'm1' }] }] }),
      't', '2026-11-04').run();
});
beforeEach(async () => { await env.DB.prepare('DELETE FROM guia_impresas').run(); });

describe('POST /ordenes/api/guia/impresas', () => {
  it('sin rol o lector: 403', async () => {
    expect((await pedir('/ordenes/api/guia/impresas', SOLO_BARRILES, { numero: '0966', foto: FOTO })).status).toBe(403);
    expect((await pedir('/ordenes/api/guia/impresas', LECTOR, { numero: '0966', foto: FOTO })).status).toBe(403);
  });
  it('editor guarda y GET la devuelve', async () => {
    const r = await pedir('/ordenes/api/guia/impresas', EDITOR, { numero: '0966', foto: FOTO });
    expect(r.status).toBe(200);
    const { id } = await r.json() as { id: number };
    const g = await pedir('/ordenes/api/guia/impresas?id=' + id, LECTOR);
    expect(g.status).toBe(200);
    const j = await g.json() as any;
    expect(j.numero).toBe('0966');
    expect(j.por).toBe(EDITOR);
    expect(j.foto).toEqual(FOTO);
    expect(j.fecha).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it('rechaza número o foto inválidos', async () => {
    for (const body of [{ numero: '', foto: FOTO }, { numero: '0966' }, { numero: '0966', foto: { ...FOTO, renglones: 'x' } },
      { numero: '0966', foto: { ...FOTO, renglones: [{ n: 1, tipo: 'raro', texto: '' }] } }])
      expect((await pedir('/ordenes/api/guia/impresas', EDITOR, body)).status).toBe(400);
  });
  it('GET de un id que no existe: 404', async () => {
    expect((await pedir('/ordenes/api/guia/impresas?id=999', LECTOR)).status).toBe(404);
  });
});

describe('las impresas en lista y números', () => {
  it('/lista las trae como ejecutadas de la guía', async () => {
    await pedir('/ordenes/api/guia/impresas', EDITOR, { numero: '0966', foto: FOTO });
    const j = await (await pedir('/ordenes/api/lista', LECTOR)).json() as any;
    const g = j.ordenes.find((o: any) => o.modulo === 'guia');
    expect(g).toMatchObject({ fuente: 'guia_impresas', tipo: 'guia', numero: '0966', estado: 'ejecutada', emitio: 'Oriana', lotes: [] });
    expect(g.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('/numeros principal las cuenta', async () => {
    await pedir('/ordenes/api/guia/impresas', EDITOR, { numero: '0966', foto: FOTO });
    const j = await (await pedir('/ordenes/api/numeros?serie=principal', LECTOR)).json() as any;
    expect(j.numeros).toEqual([957, 966]);
    const b = await (await pedir('/ordenes/api/numeros?serie=B', LECTOR)).json() as any;
    expect(b.numeros).not.toContain(966);
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run test/ordenes-guia-impresas.test.ts`
Expected: FAIL (404/null en las rutas nuevas; `guia_impresas` aparece porque la migración ya existe).

- [ ] **Step 4: `src/ordenes/impresas.ts`**

```ts
/**
 * Guía de trabajos: las impresiones numeradas (tabla guia_impresas,
 * migración 0004). Cada fila es la foto de la hoja tal como salió en papel.
 */
import type { ResumenOrden } from './resumen';

export interface RenglonFoto { n: number; tipo: 'tarea' | 'nota' | 'orden'; texto: string }
export interface Foto { emitio: string; recibio: string; renglones: RenglonFoto[] }

const TIPOS = new Set(['tarea', 'nota', 'orden']);
const esTxt = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;

/** null = válida; si no, el motivo. */
export function problemaImpresa(numero: unknown, foto: unknown): string | null {
  if (typeof numero !== 'string' || !/^\d{4}$/.test(numero)) return 'N° inválido (4 dígitos).';
  if (!foto || typeof foto !== 'object') return 'Falta la hoja.';
  const f = foto as Record<string, unknown>;
  if (!esTxt(f.emitio, 120) || !esTxt(f.recibio, 120)) return 'Emitió/Recibió inválidos.';
  if (!Array.isArray(f.renglones) || f.renglones.length > 1000) return 'Renglones inválidos.';
  for (const r of f.renglones as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object' || !TIPOS.has(r.tipo as string) || !esTxt(r.texto, 500)
      || typeof r.n !== 'number' || !Number.isInteger(r.n) || r.n < 0) return 'Renglón inválido.';
  }
  return null;
}

export const normalizarFoto = (f: Foto): Foto => ({
  emitio: f.emitio, recibio: f.recibio,
  renglones: f.renglones.map((r) => ({ n: r.n, tipo: r.tipo, texto: r.texto })),
});

export async function guardarImpresa(env: Env, numero: string, foto: Foto, por: string): Promise<number> {
  const r = await env.DB.prepare('INSERT INTO guia_impresas (numero, fecha, por, json) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(numero, new Date().toISOString(), por, JSON.stringify(normalizarFoto(foto))).first<{ id: number }>();
  return r!.id;
}

export async function leerImpresa(env: Env, id: number) {
  const f = await env.DB.prepare('SELECT id, numero, fecha, por, json FROM guia_impresas WHERE id = ?')
    .bind(id).first<{ id: number; numero: string; fecha: string; por: string | null; json: string }>();
  return f ? { id: f.id, numero: f.numero, fecha: f.fecha, por: f.por || '', foto: JSON.parse(f.json) as Foto } : null;
}

const esFaltaTabla = (e: unknown) => e instanceof Error && e.message.includes('no such table');

/** Para Historial. Sin la tabla (falta migrar) devuelve [] en vez de romper la lista. */
export async function resumenImpresas(env: Env): Promise<ResumenOrden[]> {
  try {
    const { results } = await env.DB.prepare('SELECT id, numero, fecha, por, json FROM guia_impresas')
      .all<{ id: number; numero: string; fecha: string; por: string | null; json: string }>();
    return (results ?? []).map((f) => {
      let emitio = '';
      try { emitio = String((JSON.parse(f.json) as Foto).emitio || ''); } catch { /* foto rota: sin firma */ }
      return {
        modulo: 'guia', id: String(f.id), fuente: 'guia_impresas', tipo: 'guia', numero: f.numero,
        fecha: f.fecha.slice(0, 10), estado: 'ejecutada', lotes: [], lote_corte: '', emitio: emitio || f.por || '',
      } satisfies ResumenOrden;
    });
  } catch (e) {
    if (esFaltaTabla(e)) return [];
    throw e;
  }
}

/** Números de la serie principal usados por la guía. */
export async function numerosImpresas(env: Env): Promise<number[]> {
  try {
    const { results } = await env.DB.prepare('SELECT DISTINCT numero FROM guia_impresas').all<{ numero: string }>();
    return (results ?? []).map((f) => /^(\d{4})$/.exec(f.numero)).filter((m): m is RegExpExecArray => !!m)
      .map((m) => parseInt(m[1], 10));
  } catch (e) {
    if (esFaltaTabla(e)) return [];
    throw e;
  }
}
```

En `src/ordenes/resumen.ts` cambiar la interfaz:
```ts
export interface ResumenOrden {
  modulo: 'prensas' | 'lotes' | 'guia';
  id: string;
  fuente: 'ordenes_trabajo' | 'ordenes_correccion' | 'ordenes_hojas' | 'guia_impresas';
```

- [ ] **Step 5: Rutas en `src/ordenes/rutas.ts`**

Import: `import { problemaImpresa, guardarImpresa, leerImpresa, resumenImpresas, numerosImpresas, type Foto } from './impresas';`

En `/numeros`, antes del `return json(200, …)`:
```ts
    if (serie === 'principal') for (const n of await numerosImpresas(env)) numeros.add(n);
```

Antes del bloque `if (sub === '/guia') {`:
```ts
  if (sub === '/guia/impresas') {
    const modulos = await rolesDe(req, env);
    const conRol = FUENTES.filter((m) => modulos[m]);
    if (!conRol.length) return json(403, { error: 'sin_permiso', detalles: ['No tenés rol en Prensas ni en Lotes.'] });
    try {
      if (req.method === 'GET') {
        const id = Number(new URL(req.url).searchParams.get('id'));
        const imp = Number.isInteger(id) && id > 0 ? await leerImpresa(env, id) : null;
        return imp ? json(200, imp) : json(404, { error: 'no_encontrada' });
      }
      if (req.method === 'POST') {
        if (!conRol.some((m) => PESO[modulos[m]!] >= PESO.editor)) return json(403, { error: 'sin_permiso', detalles: ['Solo un editor puede numerar la guía.'] });
        let body: { numero?: unknown; foto?: unknown };
        try { body = await req.json(); } catch { return json(400, { error: 'impresa_invalida', detalles: ['JSON inválido.'] }); }
        const problema = problemaImpresa(body?.numero, body?.foto);
        if (problema) return json(400, { error: 'impresa_invalida', detalles: [problema] });
        const id = await guardarImpresa(env, body.numero as string, body.foto as Foto, (await emailDelUsuario(req, env)) || '');
        return json(200, { id });
      }
    } catch (e) {
      if (esFaltaTabla(e)) return json(503, { error: 'base_sin_inicializar', detalles: ['Falta crear la tabla de impresas de la guía (migración 0004).'] });
      throw e;
    }
    return null;
  }
```

En `/lista`, después del `for (const m of conRol) …push(...)`:
```ts
  ordenes.push(...await resumenImpresas(env));
```
(Va antes del `sort`. Para no sumar latencia, si se prefiere, `Promise.all([documentos(env, conRol), resumenImpresas(env)])`.)

- [ ] **Step 6: Correr**

Run: `npx vitest run test/ordenes-guia-impresas.test.ts test/ordenes-rutas.test.ts test/ordenes-guia-rutas.test.ts test/ordenes-resumen.test.ts && npx tsc --noEmit`
Expected: PASS. (Si algún test de `/lista` compara la lista completa con `toEqual`, no hay impresas en esa base: sigue igual.)

- [ ] **Step 7: Commit**

```bash
git add migrations/0004_guia_impresas.sql src/ordenes/impresas.ts src/ordenes/rutas.ts src/ordenes/resumen.ts test/ordenes-guia-impresas.test.ts
git commit -m "feat(ordenes): impresas numeradas de la Guía de trabajos (tabla guia_impresas, rutas, Historial y números)"
```

---

### Task 2: Cliente puro — foto, nombre del tipo y URL

**Files:**
- Modify: `public/ordenes/js/guia.js`, `public/ordenes/js/catalogo.js:78-81`, `public/ordenes/js/lista.js`
- Test: `test/ordenes-guia.test.mjs`, `test/ordenes-lista.test.mjs`, `test/ordenes-catalogo.test.mjs`

**Interfaces:**
- Produces:
  - `fotoImpresa(guia, ordenes) → { emitio, recibio, renglones: [{ n, tipo, texto }] }` (n = número impreso; nota = 0; texto ≤ 500).
  - `nombreDeTipo('guia') === 'Guía de trabajos'`.
  - `urlAbrir({ modulo:'guia', id:'7' }, volver) === '/ordenes/?v=guia&impresa=7'`.
  - `estadoDeURL('?v=guia&impresa=7').impresa === '7'`; `urlDeEstado` la conserva.

- [ ] **Step 1: Tests que fallan**

En `test/ordenes-guia.test.mjs` sumar `fotoImpresa` al import y:
```js
describe('fotoImpresa', () => {
  it('numera tareas y órdenes visibles, la nota va con 0, las órdenes como texto', () => {
    const g = G([T('a', 'Lavar'), { id: 'n', tipo: 'nota', texto: 'ojo' }, { id: 'o', tipo: 'orden', ref: 'lotes:ot-1' },
      { id: 'h', tipo: 'orden', ref: 'lotes:ot-2', oculta: true }], { emitio: 'Ori', recibio: 'Enzo' });
    const f = fotoImpresa(g, [O(), O({ id: 'ot-2', numero: '0960' })]);
    expect(f).toEqual({ emitio: 'Ori', recibio: 'Enzo', renglones: [
      { n: 1, tipo: 'tarea', texto: 'Lavar' },
      { n: 0, tipo: 'nota', texto: 'ojo' },
      { n: 2, tipo: 'orden', texto: 'Traslado · N° 0957 · 26329' },
    ] });
  });
  it('corta textos largos a 500', () => {
    expect(fotoImpresa(G([T('a', 'x'.repeat(900))]), []).renglones[0].texto).toHaveLength(500);
  });
});
```
En `test/ordenes-lista.test.mjs`:
```js
it('una impresa de la guía abre la guía en solo lectura', () => {
  expect(urlAbrir({ modulo: 'guia', id: '7' }, '/ordenes/?v=historial')).toBe('/ordenes/?v=guia&impresa=7');
});
it('la URL conserva impresa', () => {
  const e = estadoDeURL('?v=guia&impresa=7');
  expect(e.impresa).toBe('7');
  expect(urlDeEstado(e)).toBe('?v=guia&impresa=7');
});
```
(asegurar que `urlAbrir`, `estadoDeURL`, `urlDeEstado` estén en el import del archivo.)
En `test/ordenes-catalogo.test.mjs`:
```js
it('la guía impresa tiene nombre', () => expect(nombreDeTipo('guia')).toBe('Guía de trabajos'));
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/ordenes-guia.test.mjs test/ordenes-lista.test.mjs test/ordenes-catalogo.test.mjs`
Expected: FAIL (`fotoImpresa` no existe, urlAbrir da `/guia/?orden=…`, nombre `guia`).

- [ ] **Step 3: Implementar**

`guia.js`, al final:
```js
/** La hoja tal como sale en papel, para guardarla con su N° (guia_impresas). */
export function fotoImpresa(guia, ordenes){
  const { visibles } = vistaGuia(guia, ordenes);
  let n = 0;
  return {
    emitio: guia.emitio || '', recibio: guia.recibio || '',
    renglones: visibles.map(r => ({
      n: r.tipo === 'nota' ? 0 : ++n,
      tipo: r.tipo,
      texto: String(r.tipo === 'orden' ? textoDeOrden(r.orden) : (r.texto || '')).slice(0, MAX_TEXTO),
    })),
  };
}
```
`catalogo.js`:
```js
// Lo que aparece en Historial sin ser un tipo que se emita desde «Nueva orden».
const OTROS = { guia: 'Guía de trabajos' };

export function nombreDeTipo(id){
  const t = TIPOS.find(x => x.id === id);
  return t ? t.nombre : (OTROS[id] || String(id ?? ''));
}
```
`lista.js`:
```js
const CLAVES = ['v', 'modulo', 'tipo', 'desde', 'hasta', 'q', 'impresa'];
…
export const urlAbrir = (o, volver) => o.modulo === 'guia'
  ? '/ordenes/?v=guia&impresa=' + encodeURIComponent(o.id)
  : '/' + o.modulo + '/?orden=' + encodeURIComponent(o.id) + _volver(volver);
```
Nota: en `app.js` `estadoPara(v)` arma el estado con claves fijas; `impresa` queda `''` al cambiar de vista porque no está en `base` — agregar `impresa: ''` a `base` en `estadoPara` para que el sub-nav "Guía de trabajos" vuelva a la guía viva.

- [ ] **Step 4: Correr**

Run: `npx vitest run test/ordenes-guia.test.mjs test/ordenes-lista.test.mjs test/ordenes-catalogo.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/ordenes/js/guia.js public/ordenes/js/catalogo.js public/ordenes/js/lista.js public/ordenes/js/app.js test/ordenes-guia.test.mjs test/ordenes-lista.test.mjs test/ordenes-catalogo.test.mjs
git commit -m "feat(ordenes): foto de la guía impresa, nombre del tipo y URL de Ver"
```

---

### Task 3: La hoja con recuadro y N° (pantalla y papel)

**Files:**
- Modify: `public/ordenes/js/guia-hoja.js`, `public/ordenes/index.html` (bloque `<style>`)
- Test: `test/ordenes-guia-hoja.test.mjs`

**Interfaces:**
- Consumes: la foto de Task 2 (`{ emitio, recibio, renglones:[{n,tipo,texto}] }`).
- Produces:
  - `hojaGuia(guia, ordenes, { fechaTxt, anio, puedeEditar, volver, numero = '' })` — igual que hoy + N° (`<span class="gt-numot" contenteditable="plaintext-only" data-numero>` si `puedeEditar`, texto plano si no; vacío → `____`), `.orden-hoja` en el div raíz (lo busca `hoja-pdf.js`), `.gt-tit` con caja, `.gt-relleno` después de la tabla.
  - `hojaImpresa({ numero, fechaTxt, anio, foto })` — misma hoja, sin controles ni enlaces, desde la foto.

- [ ] **Step 1: Tests que fallan**

En `test/ordenes-guia-hoja.test.mjs` sumar `hojaImpresa` al import y:
```js
describe('recuadro y N°', () => {
  it('la hoja es .orden-hoja con título en caja, marco y relleno', () => {
    const h = hojaGuia(GUIA, ORD, { ...OPC, numero: '0966' });
    expect(h).toMatch(/^<div class="gt-hoja orden-hoja">/);
    expect(h).toContain('class="gt-tit"');
    expect(h).toContain('class="gt-relleno"');
  });
  it('N° editable para el editor, fijo para el lector, ____ si falta', () => {
    expect(hojaGuia(GUIA, ORD, { ...OPC, numero: '0966' })).toMatch(/<span class="gt-numot" contenteditable="plaintext-only" data-numero>0966<\/span>/);
    expect(hojaGuia(GUIA, ORD, { ...OPC, puedeEditar: false, numero: '' })).toContain('<span class="gt-numot">____</span>');
  });
});

describe('hojaImpresa', () => {
  const foto = { emitio: 'Ori', recibio: 'Enzo', renglones: [
    { n: 1, tipo: 'tarea', texto: 'Lavar <b>' }, { n: 0, tipo: 'nota', texto: 'ojo' }, { n: 2, tipo: 'orden', texto: 'Traslado · N° 0957' } ] };
  const h = hojaImpresa({ numero: '0966', fechaTxt: '11/11/2026', anio: '2026', foto });
  it('misma hoja, con N°, fecha y firmas, sin controles ni enlaces', () => {
    expect(h).toContain('ORDEN DE TRABAJO - RCI 08 - Rev. 02');
    expect(h).toContain('<span class="gt-numot">0966</span>');
    expect(h).toContain('11/11/2026');
    expect(h).toContain('Ori');
    expect(h).not.toContain('gt-ctl');
    expect(h).not.toContain('contenteditable');
    expect(h).not.toContain('<a ');
  });
  it('numera como salió, escapa, y la orden lleva su marca', () => {
    expect(h).toMatch(/gt-num">1<[\s\S]*?Lavar &lt;b&gt;/);
    expect(h).toMatch(/<tr class="gt-r gt-nota"><td class="gt-num"><\/td><td class="gt-chk"><\/td>/);
    expect(h).toContain('<span class="gt-ordtxt">Traslado · N° 0957</span>');
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/ordenes-guia-hoja.test.mjs`
Expected: FAIL (sin `orden-hoja`, sin `gt-numot`, `hojaImpresa` no existe). Los tests viejos tienen que seguir pasando al final.

- [ ] **Step 3: Implementar `guia-hoja.js`**

Reemplazar `hojaGuia` por un armador común + dos entradas (las filas de la guía viva no cambian de markup):
```js
const ENCAB = `<div class="gt-top"><span class="gt-empresa">CATENA INSTITUTE</span>` +
  `<span>ORDEN DE TRABAJO - RCI 08 - Rev. 02 &nbsp;·&nbsp; Aprobado por: Roy Urvieta &nbsp;·&nbsp; Emisión: 28/01/2013</span></div>`;

/* La hoja: encabezado (en <thead>, se repite si no entra en una A4), título
 * en caja, banda que abre el marco de los renglones, relleno que estira el
 * marco hasta el pie (como el Excel RCI 08) y firmas. */
function armarHoja({ cols, filas, vacia, fechaTxt, anio, numeroHtml, firmasHtml, despues = '' }){
  return `<div class="gt-hoja orden-hoja"><table class="gt-tabla">` +
    `<thead><tr><th colspan="${cols}">` + ENCAB +
      `<div class="gt-tit">Orden de Trabajo</div>` +
      `<div class="gt-meta"><span><b>Fecha:</b> ${esc(fechaTxt)}</span><span>${esc(anio)}</span>` +
      `<span class="gt-n"><b>N°</b> ${numeroHtml}</span></div>` +
      `<div class="gt-banda">GUÍA DE TRABAJOS, SEGUIR ORDEN INDICADO</div>` +
    `</th></tr></thead>` +
    `<tbody>${filas || `<tr><td colspan="${cols}" class="gt-vacia">${vacia}</td></tr>`}</tbody>` +
    `</table><div class="gt-relleno" aria-hidden="true"></div>` + despues +
    `<div class="gt-firmas">${firmasHtml}</div></div>`;
}

const firmas = f => `<span><b>Emitió:</b> ${f('emitio')}</span><span><b>Firma:</b> ____________</span>` +
  `<span><b>Recibió:</b> ${f('recibio')}</span>`;

export function hojaGuia(guia, ordenes, { fechaTxt, anio, puedeEditar, volver, numero = '' }){
  const { visibles } = vistaGuia(guia, ordenes);
  let n = 0;
  const filas = visibles.map(r => renglon(r, r.tipo === 'nota' ? n : ++n, { puedeEditar, volver })).join('');
  const firma = campo => puedeEditar
    ? `<span class="gt-firma" contenteditable="plaintext-only" data-firma="${campo}">${esc(guia[campo])}</span>`
    : `<span class="gt-firma">${esc(guia[campo])}</span>`;
  const numeroHtml = puedeEditar
    ? `<span class="gt-numot" contenteditable="plaintext-only" data-numero>${esc(numero)}</span>`
    : `<span class="gt-numot">${esc(numero || '____')}</span>`;
  return armarHoja({
    cols: puedeEditar ? 4 : 3, filas, fechaTxt, anio, numeroHtml, firmasHtml: firmas(firma),
    vacia: 'La guía está vacía.' + (puedeEditar ? ' Agregá una tarea.' : ''),
    despues: puedeEditar ? `<div class="gt-agregar"><button type="button" class="ci-btn" data-acc="agregar">＋ Agregar tarea</button></div>` : '',
  });
}

/** Una guía ya impresa (guia_impresas), solo lectura. */
export function hojaImpresa({ numero, fechaTxt, anio, foto }){
  const filas = (foto.renglones || []).map(r => {
    const nota = r.tipo === 'nota';
    const txt = r.tipo === 'orden' ? `<span class="gt-ordtxt">${esc(r.texto)}</span>` : esc(r.texto);
    return `<tr class="gt-r gt-${r.tipo}"><td class="gt-num">${nota ? '' : esc(r.n)}</td>` +
      `<td class="gt-chk">${nota ? '' : '<span class="gt-caja" aria-hidden="true"></span>'}</td>` +
      `<td class="gt-cel"><div class="gt-txt">${txt}</div></td></tr>`;
  }).join('');
  return armarHoja({
    cols: 3, filas, fechaTxt, anio, vacia: 'La guía salió vacía.',
    numeroHtml: `<span class="gt-numot">${esc(numero || '____')}</span>`,
    firmasHtml: firmas(c => `<span class="gt-firma">${esc(foto[c])}</span>`),
  });
}
```
(Mover `.gt-agregar` debajo del relleno es a propósito: el botón queda fuera del marco.) Correr los tests viejos del archivo: si alguno buscaba el `gt-agregar` antes de `gt-firmas` o la forma exacta del `<div class="gt-hoja">`, ajustar SOLO ese assert a `gt-hoja orden-hoja`.

- [ ] **Step 4: CSS en `public/ordenes/index.html`**

Reemplazar las reglas `.gt-hoja`, `.gt-tit`, `.gt-meta`, `.gt-banda`, `a.gt-orden::before` y sumar (dentro del `<style>`, fuera de media queries):
```css
  .gt-hoja{background:#fff;color:#111;max-width:820px;margin:0 auto;padding:28px 34px;border-radius:6px;font-family:Arial,sans-serif;display:flex;flex-direction:column}
  .gt-tit{font-size:18px;font-weight:700;text-align:center;margin:6px 0 10px;border:1.5px solid #333;padding:6px 10px}
  .gt-meta{display:flex;gap:26px;font-size:13px;margin-bottom:10px}
  .gt-n{margin-left:auto}
  .gt-numot{display:inline-block;min-width:4.5em;border-bottom:1px solid #999;outline:none;font-weight:700;font-variant-numeric:tabular-nums}
  .gt-numot[contenteditable]:focus{background:#fff8e1}
  .gt-banda{font-size:13px;font-weight:700;background:#eee;padding:6px 10px;border:1.5px solid #333}
  /* El marco de los renglones: sigue a la banda (izq./der.) y lo cierra el relleno. */
  .gt-tabla tbody{border-left:1.5px solid #333;border-right:1.5px solid #333}
  .gt-relleno{flex:1 0 auto;min-height:60px;border:1.5px solid #333;border-top:0}
  a.gt-orden::before,.gt-ordtxt::before{content:"Orden pendiente · ";font-weight:400;color:#666}
  .gt-ordtxt{font-weight:600;color:#7a1f2b}
```
(Borrar la regla vieja `a.gt-orden::before{…}` para no duplicarla. Dejar `.gt-tabla th{… padding:0 0 8px}` pero cambiar a `padding:0` para que la banda pegue con el marco.)

En el `@media print{…}` existente sumar:
```css
    .gt-hoja{min-height:262mm}
    .gt-ordtxt{color:#111}
```
(262 mm = A4 297 − 24 de `@page` − aire; con `flex:1` el relleno estira el marco hasta el pie. `hoja-pdf.js` copia estas reglas al clon, así que el PDF sale igual.)

Y en el `@media screen and (max-width:760px)` sumar `.gt-n{margin-left:0}`.

- [ ] **Step 5: Correr**

Run: `npx vitest run test/ordenes-guia-hoja.test.mjs test/ordenes-pantalla.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/ordenes/js/guia-hoja.js public/ordenes/index.html test/ordenes-guia-hoja.test.mjs
git commit -m "feat(ordenes): la Guía de trabajos con el recuadro del RCI 08, N° en el encabezado y hoja de una impresa"
```

---

### Task 4: Imprimir y guardar, Ver y Reimprimir

**Files:**
- Modify: `public/ordenes/js/guia-vista.js`, `public/ordenes/js/app.js`, `public/ordenes/index.html`
- Create: `public/ordenes/js/guia-impresa.js`
- Test: `test/ordenes-guia-vista-fuentes.test.ts` (nuevo, lectura de fuentes como `test/lotes-entorno-ot-fuentes.test.ts`) — y el recorrido de Task 5.

**Interfaces:**
- Consumes: `proponerNumero(serie) → Promise<{numero, ultimo, conCarpeta}>`, `chipCarpeta(serie) → html`, `cablearChipsCarpeta(raiz, alCambiar)`, `imprimirYGuardar({ claseBody, contenedor, serie, numero, titulo }) → Promise<{ok, numero?, numeroLibre?, guardado?}>` (todos de `/lotes/js/guardar-ot.js`); `fijarEntornoOT(e)` de `/lotes/js/entorno-ot.js`; `fotoImpresa` (Task 2); `hojaGuia({…numero})`, `hojaImpresa` (Task 3); `POST/GET /ordenes/api/guia/impresas` (Task 1).
- Produces: `montarImpresa(cuerpo, { id, volver })` en `guia-impresa.js`.

- [ ] **Step 1: Mirar cómo se fija el entorno**

Leer `public/prensas/app.js` cerca de `fijarEntornoOT` (≈ línea 377) y `test/lotes-entorno-ot-fuentes.test.ts`: `guardar-ot.js` usa del entorno `mostrarOverlay`, `cerrarOverlay`, `datos()` y `numerosWeb(datos, serie)`. Confirmar con `grep -n "entornoOT()\|const e = entornoOT\|e\.[a-zA-Z]*" public/lotes/js/guardar-ot.js` que no use más que eso en `proponerNumero`/`imprimirYGuardar`/`cablearChipsCarpeta`. Si usa otra pieza, sumarla al objeto del Step 3 con un valor neutro.

- [ ] **Step 2: Test de fuentes que falla**

`test/ordenes-guia-vista-fuentes.test.ts` (los tests leen archivos vía los bindings de `vitest.config.ts`; si `ORDENES_GUIA_VISTA_JS` no existe, sumarlo ahí igual que `ORDENES_HTML` con `leer('public/ordenes/js/guia-vista.js')` y declarar el tipo donde están declarados los otros bindings — buscar `ORDENES_HTML` en `test/` y en `vitest.config.ts`/`env.d.ts`):
```ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('guía: imprimir con número', () => {
  const js = (env as any).ORDENES_GUIA_VISTA_JS as string;
  it('reusa guardar-ot de Lotes con la serie principal', () => {
    expect(js).toContain("from '../../lotes/js/guardar-ot.js'");
    expect(js).toMatch(/imprimirYGuardar\(\{[^}]*serie: 'principal'/);
    expect(js).toContain("'Guía de trabajos'");
  });
  it('fija el entorno de órdenes antes de usarlo', () => {
    expect(js).toContain('fijarEntornoOT(');
  });
  it('guarda la impresa en el servidor', () => {
    expect(js).toContain('/ordenes/api/guia/impresas');
  });
});
```

- [ ] **Step 3: `guia-vista.js`**

Imports nuevos:
```js
import { fotoImpresa } from './guia.js';
import { proponerNumero, chipCarpeta, cablearChipsCarpeta, imprimirYGuardar } from '../../lotes/js/guardar-ot.js';
import { fijarEntornoOT } from '../../lotes/js/entorno-ot.js';
```
Overlay propio (al principio de `montarGuia`, antes del `innerHTML`):
```js
  // guardar-ot.js (de Lotes) abre su diálogo "Imprimir y guardar" con estas dos.
  // Los números de la web llegan por /ordenes/api/numeros: datos/numerosWeb vacíos.
  let ov = document.getElementById('overlay');
  if (!ov){
    ov = document.createElement('div');
    ov.className = 'overlay'; ov.id = 'overlay';
    ov.innerHTML = '<div class="box" id="overlayBox" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(ov);
  }
  fijarEntornoOT({
    datos: () => ({}), numerosWeb: () => [],
    mostrarOverlay: html => { document.getElementById('overlayBox').innerHTML = html; ov.classList.add('show'); },
    cerrarOverlay: () => ov.classList.remove('show'),
  });
  let _numero = '';   // N° propuesto o tipeado; no es parte de la guía viva
```
Barra: después del botón Imprimir, `${chipCarpeta('principal')}`; y después del `innerHTML`:
```js
  cablearChipsCarpeta(vista.querySelector('.gt-barra'), () => proponer());
  async function proponer(){
    try { _numero = (await proponerNumero('principal')).numero || ''; } catch { _numero = ''; }
    const n = $h.querySelector('[data-numero]');
    if (n && document.activeElement !== n) n.textContent = _numero;
  }
```
En `pintar()`: pasar `numero: _numero` a `hojaGuia(...)`.

En el listener `input`, ANTES de firma/texto:
```js
    if (t.hasAttribute('data-numero')){ _numero = t.textContent.replace(/\D/g, '').slice(0, 4); return; }
```

Reemplazar `if (e.target.closest('#gtImprimir')) return window.print();` por `return imprimir();` con:
```js
  async function imprimir(){
    const { guia, ordenes, puedeEditar } = sync.estado();
    if (!guia) return;
    if (!puedeEditar) return window.print();          // un lector imprime sin número, como antes
    await sync.guardarYa();
    const r = await imprimirYGuardar({ claseBody: 'printing-guia', contenedor: $h, serie: 'principal',
      numero: _numero, titulo: 'Guía de trabajos' });
    if (!r.ok){
      if (r.numeroLibre){ _numero = r.numeroLibre; pintar(); }
      return;
    }
    try {
      const resp = await fetch('/ordenes/api/guia/impresas', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: r.numero, foto: fotoImpresa(guia, ordenes) }) });
      if (!resp.ok) throw new Error('http ' + resp.status);
      window.CI?.avisar?.('Guía N° ' + r.numero + ' guardada en el Historial.', { tipo: 'ok' });
    } catch (_) {
      window.CI?.avisar?.('Se imprimió la ' + r.numero + ' pero no quedó en el Historial. Avisá a sistemas.', { tipo: 'mal' });
    }
    await proponer();
  }
```
Y en el `alEstado` de `crearSync`, cuando `e === 'cargado'`, llamar `proponer()` (después del primer pintado, para que el N° aparezca).

- [ ] **Step 4: `guia-impresa.js` y `app.js`**

`public/ordenes/js/guia-impresa.js`:
```js
/* ===== Órdenes de trabajo — una Guía de trabajos ya impresa =====
 * Solo lectura: la foto guardada al imprimir (guia_impresas). Reimprimir no
 * pide número ni guarda otra copia. */
'use strict';
import { hojaImpresa } from './guia-hoja.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmt = iso => /^\d{4}-\d{2}-\d{2}/.test(iso || '') ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';

export async function montarImpresa(cuerpo, { id }){
  cuerpo.innerHTML = `<div class="gt-vista"><div class="gt-barra">` +
    `<a class="ci-btn" href="/ordenes/?v=historial">← Historial</a>` +
    `<button type="button" class="ci-btn" id="gtReimprimir">Reimprimir</button>` +
    `<span class="gt-estado" id="gtEstado"></span></div><div id="gtHoja"><p class="ord-msg">Cargando…</p></div></div>`;
  const $h = cuerpo.querySelector('#gtHoja');
  cuerpo.querySelector('#gtReimprimir').addEventListener('click', () => window.print());
  try {
    const r = await fetch('/ordenes/api/guia/impresas?id=' + encodeURIComponent(id));
    if (!r.ok) throw new Error('http ' + r.status);
    const imp = await r.json();
    if (!$h.isConnected) return;
    cuerpo.querySelector('#gtEstado').textContent = 'Guía N° ' + imp.numero + ' · impresa el ' + fmt(imp.fecha) + (imp.por ? ' por ' + imp.por : '');
    $h.innerHTML = hojaImpresa({ numero: imp.numero, fechaTxt: fmt(imp.fecha), anio: String(imp.fecha || '').slice(0, 4), foto: imp.foto });
  } catch (_) {
    if ($h.isConnected) $h.innerHTML = `<p class="ord-msg">${esc('No se pudo cargar esa guía impresa.')}</p>`;
  }
}
```
`app.js`: `import { montarImpresa } from './guia-impresa.js';` y en `pintar()`:
```js
  if (_estado.v === 'guia') return _estado.impresa
    ? montarImpresa($('ordCuerpo'), { id: _estado.impresa })
    : montarGuia($('ordCuerpo'), { volver: aqui() });
```

- [ ] **Step 5: CSS del overlay y precargas**

En `public/ordenes/index.html`, dentro del `<style>` (estilos que espera el diálogo de `guardar-ot.js`, copiados de Prensas):
```css
  .overlay{position:fixed;inset:0;background:rgba(28,27,25,.45);display:none;align-items:center;justify-content:center;z-index:50}
  .overlay.show{display:flex}
  .overlay .box{background:var(--panel,#fff);color:var(--txt);border:1px solid var(--line);border-radius:4px;padding:22px 24px;width:min(520px,calc(100vw - 32px));max-height:90vh;overflow:auto}
  .overlay button.btn{background:transparent;color:var(--txt);border:1px solid var(--txt);border-radius:var(--ci-r);padding:7px 14px;cursor:pointer;font:500 13px/1.2 var(--sans)}
  .overlay button.btn.primary{background:var(--accent);color:#F3EEE6;border-color:var(--accent)}
  .overlay input.txt{background:var(--panel,#fff);color:var(--txt);border:1px solid var(--line);border-radius:2px;padding:7px 10px;font:inherit}
  .overlay .msg{padding:9px 14px;font-size:13px;margin:10px 0;border-left:3px solid var(--line)}
```
(Confirmar con `sed -n 318,330p public/prensas/index.html` y `grep -n "\.overlay" public/prensas/index.html` los valores reales de Prensas y copiarlos; los de arriba son la base.) En `@media print` sumar `.overlay` a la lista del `display:none!important`.

Run: `node scripts/precargas.mjs` (suma `guia-impresa.js` y los de `/lotes/js/` que importa guardar-ot a las precargas de `ordenes/index.html`).

- [ ] **Step 6: Correr todo**

Run: `npx vitest run test/ordenes-*.test.* && npx tsc --noEmit && node scripts/precargas.mjs --verificar`
Expected: PASS (salvo `ordenes-modo-y-pantalla-url` en Windows, que falla igual en main).

- [ ] **Step 7: Commit**

```bash
git add public/ordenes/js/guia-vista.js public/ordenes/js/guia-impresa.js public/ordenes/js/app.js public/ordenes/index.html test/ordenes-guia-vista-fuentes.test.ts vitest.config.ts
git commit -m "feat(ordenes): imprimir la guía con N° de la carpeta, guardarla en el Historial y Ver/Reimprimir"
```

---

### Task 5: Recorrido en el navegador

**Files:**
- Create (scratchpad, no va al repo): `mock-guia-numerada.mjs` copiando `C:/Users/Bmax/AppData/Local/Temp/claude/C--Users-Bmax-OneDrive---BODEGAS-ESMERALDA-SA-Escritorio-claude/0cbb6966-4a01-4cb2-84c3-5ad7e132718b/scratchpad/mock-guia.mjs` con:
  - `RAIZ = 'C:/Users/Bmax/repos/catenainstitute-guia-numerada/public'`, puerto **8874**.
  - `let impresas = []`; `POST /ordenes/api/guia/impresas` → push `{ id, numero, fecha, por:'prueba@x', foto }` y `{ id }`; `GET ?id=` → la fila o 404; `/ordenes/api/lista` suma las impresas con la forma de Task 1; `/ordenes/api/numeros` → `{ numeros: [957, ...impresas.map(n)] }`.
  - Servir también `/lotes/js/*` (ya lo hace: sirve `public/`).
- Modify: `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\.claude\launch.json` — entrada `guia-numerada` (node + ese mock, port 8874).

- [ ] **Step 1:** `preview_start {name:'guia-numerada'}`, abrir `/ordenes/?v=guia`. Ver: recuadro del título, marco con relleno, N° vacío (sin carpeta) y chip "Sin carpeta…".
- [ ] **Step 2:** Carpeta de prueba en OPFS (desde javascript_tool):
  ```js
  const root = await navigator.storage.getDirectory();
  const d = await root.getDirectoryHandle('OT-prueba', { create: true });
  await d.getDirectoryHandle('B Ordenes de agregados', { create: true });
  await (await d.getFileHandle('0965 Ronda mensual.pdf', { create: true })).createWritable().then(w => w.close());
  const m = await import('/lotes/js/carpeta-ot.js'); await m.usarCarpeta(d);
  ```
  Recargar (el panel puede borrar OPFS al recargar: si pasa, repetir y en vez de recargar disparar el cambio de carpeta re-montando la vista con ir a Pendientes y volver a Guía). Esperado: chip "📁 OT-prueba · última: 0965" y N° **0966**.
- [ ] **Step 3:** Imprimir → diálogo "Imprimir y guardar 0966" con `0966 Guía de trabajos.pdf` → "Imprimir y guardar PDF". Comprobar en OPFS que existe el archivo, que el mock tiene 1 impresa (`/_prueba/estado` o leer `impresas`), aviso "guardada en el Historial", N° pasa a 0967.
- [ ] **Step 4:** Historial: fila "Guía de trabajos · 0966 · Ejecutada"; Ver → hoja solo lectura con los mismos renglones; Reimprimir abre el diálogo de impresión; "← Historial" vuelve.
- [ ] **Step 5:** Número repetido: tipear 0965 → Imprimir → aviso "Ese número ya está en la carpeta" y la hoja toma el libre.
- [ ] **Step 6:** Vista de impresión: emular print (`resize_window` no alcanza) — usar `javascript_tool` para agregar una hoja de estilo con el contenido de `reglasDeImpresion(document)` y la clase, sacar screenshot, y revisar el PDF generado en OPFS leyéndolo como blob (tamaño > 0). Confirmar que el marco llega al pie y no hay botones.
- [ ] **Step 7:** Lector (`/_prueba/rol?lector=1`): sin N° editable (`____`), Imprimir = impresión común, nada en Historial.
- [ ] **Step 8:** Commit del launch.json en el repo del Escritorio (como los commits `chore: launch.json …` anteriores):
```bash
git -C "C:/Users/Bmax/OneDrive - BODEGAS ESMERALDA SA/Escritorio/claude" add .claude/launch.json
git -C "C:/Users/Bmax/OneDrive - BODEGAS ESMERALDA SA/Escritorio/claude" commit -m "chore: launch.json con el servidor de prueba de la guía numerada (guia-numerada, :8874)"
```

---

## Al terminar

- `npm test` completo + `npx tsc --noEmit` + `node scripts/precargas.mjs --verificar`.
- Pushear la rama `feat/guia-numerada` y abrir PR (NO mergear: lo decide el usuario).
- Avisar: **después del merge hay que correr `npm run migrar:nube`** (tabla `guia_impresas`); sin eso la guía imprime pero no queda en el Historial (aviso en pantalla) y la lista sigue andando.
