# Guía de trabajos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una "Guía de trabajos" RCI 08 viva en la sección Órdenes de trabajo: tareas escritas a mano que quedan hasta tildarlas + las órdenes pendientes de Lotes y Prensas, con agregar/quitar/mover e imprimir.

**Architecture:** Una fila en una tabla D1 nueva (`guia_trabajos`) guarda la lista con versión optimista; `GET/POST /ordenes/api/guia` en `src/ordenes/`. En el navegador, un módulo puro (`guia.js`) une la guía con los pendientes y define cada cambio como operación re-aplicable; `guia-sync.js` guarda y re-aplica tras un 409; `guia-hoja.js` dibuja la hoja (pantalla = papel); `guia-vista.js` la cablea en `app.js`.

**Tech Stack:** Cloudflare Workers + D1, TypeScript (servidor), JS módulos ES sin build (navegador), vitest con `@cloudflare/vitest-pool-workers` (tests dentro de workerd, D1 real con las migraciones).

**Spec:** `docs/superpowers/specs/2026-11-04-guia-de-trabajos-design.md`

## Global Constraints

- Repo: `C:\Users\Bmax\repos\catenainstitute-guia` (worktree, rama `feat/guia-trabajos`). **Nada a main sin OK del usuario** (push a main = deploy a producción).
- Todo el texto visible y los comentarios en castellano rioplatense, como el resto del código.
- Sin `alert/confirm/prompt` (hay tests que lo vigilan); avisos con `window.CI?.avisar?.(msg, { tipo })`.
- Estilos de `/ordenes/index.html`: solo tokens de `/shared/estilo.css` y clases propias; las nuevas con prefijo `gt-`.
- La URL de la vista es `?v=guia` (la sección guarda el estado en el query, no en `#`).
- `/ordenes/api/*` ya está en `assets.run_worker_first` de los dos wrangler: **no** hace falta tocarlos (lo cubre `test/ordenes-run-worker-first.test.ts`).
- Encabezado del papel: el mismo de Lotes, literal: `CATENA INSTITUTE` + `ORDEN DE TRABAJO - RCI 08 - Rev. 02 · Aprobado por: Roy Urvieta · Emisión: 28/01/2013`.
- Título de la hoja: `GUÍA DE TRABAJOS, SEGUIR ORDEN INDICADO`.
- Hechas se guardan 7 días.
- Correr tests: `npx vitest run <archivo>`; todo: `npm test`.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Tabla `guia_trabajos` y rutas `GET/POST /ordenes/api/guia`

**Files:**
- Create: `migrations/0003_guia_trabajos.sql`
- Create: `src/ordenes/guia.ts`
- Modify: `src/ordenes/rutas.ts` (agregar las dos rutas antes de `if (sub !== '/lista' …)`)
- Test: `test/ordenes-guia-rutas.test.ts`

**Interfaces:**
- Produces: `GET /ordenes/api/guia` → `200 { version: number, guia: Guia, ordenes: ResumenOrden[] /* solo pendientes */, puedeEditar: boolean, modulos }`; `POST /ordenes/api/guia` body `{ version, guia }` → `200 { version }` | `409 { error:'conflicto', version, guia }` | `400 { error:'guia_invalida', detalles }` | `403`.
- `Guia = { emitio: string, recibio: string, renglones: Renglon[], hechas: Hecha[] }`; `Renglon = { id, tipo: 'tarea'|'nota'|'orden', texto?, ref?, oculta? }`; `Hecha = { id, tipo, texto, hecha /*ISO*/, por, lugar /*número*/ }`.

- [ ] **Step 1: Migración**

`migrations/0003_guia_trabajos.sql`:

```sql
-- Guía de trabajos (sección Órdenes de trabajo): UNA sola guía viva, de
-- Lotes y Prensas a la vez. Va aparte de `documento` (su CHECK solo admite
-- un módulo) para que guardarla nunca choque con un guardado de Lotes.
CREATE TABLE IF NOT EXISTS guia_trabajos (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  version  INTEGER NOT NULL DEFAULT 0,
  json     TEXT    NOT NULL,
  autor    TEXT,
  guardado TEXT
);
```

- [ ] **Step 2: Tests que fallan**

`test/ordenes-guia-rutas.test.ts`:

```ts
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import worker from '../src/index';

const BASE = 'https://catenainstitute.example';
const LECTOR = 'lector-guia@catenawines.com';
const EDITOR = 'editor-guia@catenawines.com';
const SOLO_BARRILES = 'barriles-guia@catenawines.com';

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

const GUIA = { emitio: 'Oriana', recibio: 'Enzo', renglones: [{ id: 'r1', tipo: 'tarea', texto: 'Lavar barriles' }], hechas: [] };

beforeAll(async () => {
  const p = (e: string, m: string, r: string) =>
    env.DB.prepare('INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre) VALUES (?, ?, ?, ?)').bind(e, m, r, 'X').run();
  await p(LECTOR, 'lotes', 'lector');
  await p(EDITOR, 'prensas', 'editor');
  await p(SOLO_BARRILES, 'barriles', 'admin');
  await env.DB.prepare('INSERT OR REPLACE INTO documento (modulo, version, json, autor, guardado) VALUES (?, ?, ?, ?, ?)')
    .bind('lotes', 1, JSON.stringify({
      movimientos: [{ id: 'm1' }],
      ordenes_trabajo: [{ id: 'ot-1', ot: '0957', plantilla: 'traslado', fecha: '2026-11-03', estado: 'pendiente', lotes: [{ lote: '26329', mov_id: 'm1' }] }],
      ordenes_correccion: [{ id: 'oc-1', numero: 'B240', fecha: '2026-11-02', estado: 'ejecutada', lotes: [] }],
    }), 't', '2026-11-04').run();
});
beforeEach(async () => { await env.DB.prepare('DELETE FROM guia_trabajos').run(); });

describe('GET /ordenes/api/guia', () => {
  it('sin sesión: 401', async () => {
    expect((await pedir('/ordenes/api/guia')).status).toBe(401);
  });
  it('sin rol en prensas ni lotes: 403', async () => {
    expect((await pedir('/ordenes/api/guia', SOLO_BARRILES)).status).toBe(403);
  });
  it('sin guía guardada: guía vacía, versión 0, y solo las órdenes PENDIENTES', async () => {
    const r = await pedir('/ordenes/api/guia', LECTOR);
    expect(r.status).toBe(200);
    const j = await r.json() as any;
    expect(j.version).toBe(0);
    expect(j.guia).toEqual({ emitio: '', recibio: '', renglones: [], hechas: [] });
    expect(j.ordenes.map((o: any) => o.id)).toEqual(['ot-1']);
    expect(j.puedeEditar).toBe(false);
  });
  it('editor en prensas: puedeEditar', async () => {
    const j = await (await pedir('/ordenes/api/guia', EDITOR)).json() as any;
    expect(j.puedeEditar).toBe(true);
  });
});

describe('POST /ordenes/api/guia', () => {
  it('lector: 403 y no guarda', async () => {
    expect((await pedir('/ordenes/api/guia', LECTOR, { version: 0, guia: GUIA })).status).toBe(403);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM guia_trabajos').first<{ n: number }>();
    expect(n!.n).toBe(0);
  });
  it('primera escritura con versión 0 → versión 1, y el GET la devuelve', async () => {
    const r = await pedir('/ordenes/api/guia', EDITOR, { version: 0, guia: GUIA });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).version).toBe(1);
    const j = await (await pedir('/ordenes/api/guia', LECTOR)).json() as any;
    expect(j.version).toBe(1);
    expect(j.guia).toEqual(GUIA);
  });
  it('versión vieja: 409 con la guía actual', async () => {
    await pedir('/ordenes/api/guia', EDITOR, { version: 0, guia: GUIA });
    const r = await pedir('/ordenes/api/guia', EDITOR, { version: 0, guia: { ...GUIA, emitio: 'Otro' } });
    expect(r.status).toBe(409);
    const j = await r.json() as any;
    expect(j.version).toBe(1);
    expect(j.guia.emitio).toBe('Oriana');
  });
  it('versión al día: guarda y sube', async () => {
    await pedir('/ordenes/api/guia', EDITOR, { version: 0, guia: GUIA });
    const r = await pedir('/ordenes/api/guia', EDITOR, { version: 1, guia: { ...GUIA, emitio: 'Ana' } });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).version).toBe(2);
  });
  it('forma inválida: 400', async () => {
    for (const guia of [null, { renglones: 'x' }, { ...GUIA, renglones: [{ id: 'a', tipo: 'raro' }] },
      { ...GUIA, renglones: [{ id: 'a', tipo: 'tarea', texto: 'x'.repeat(501) }] }]) {
      expect((await pedir('/ordenes/api/guia', EDITOR, { version: 0, guia })).status).toBe(400);
    }
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run test/ordenes-guia-rutas.test.ts`
Expected: FAIL (404 en `/ordenes/api/guia`).

- [ ] **Step 4: `src/ordenes/guia.ts`**

```ts
/**
 * Guía de trabajos: una sola fila en `guia_trabajos`. Acá vive la forma del
 * JSON y su validación; las rutas están en rutas.ts.
 */
export interface Renglon { id: string; tipo: 'tarea' | 'nota' | 'orden'; texto?: string; ref?: string; oculta?: boolean }
export interface Hecha { id: string; tipo: string; texto: string; hecha: string; por: string; lugar: number }
export interface Guia { emitio: string; recibio: string; renglones: Renglon[]; hechas: Hecha[] }

export const guiaVacia = (): Guia => ({ emitio: '', recibio: '', renglones: [], hechas: [] });

const MAX_RENGLONES = 300, MAX_HECHAS = 500, MAX_TEXTO = 500, MAX_FIRMA = 120;
const TIPOS = new Set(['tarea', 'nota', 'orden']);
const esTxt = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;

/** null = válida; si no, el motivo (va en `detalles` del 400). */
export function problemaGuia(g: unknown): string | null {
  if (!g || typeof g !== 'object') return 'La guía no es un objeto.';
  const x = g as Record<string, unknown>;
  if (!esTxt(x.emitio, MAX_FIRMA) || !esTxt(x.recibio, MAX_FIRMA)) return 'Emitió/Recibió inválidos.';
  if (!Array.isArray(x.renglones) || x.renglones.length > MAX_RENGLONES) return 'Renglones inválidos.';
  if (!Array.isArray(x.hechas) || x.hechas.length > MAX_HECHAS) return 'Hechas inválidas.';
  const ids = new Set<string>();
  for (const r of x.renglones as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object' || !esTxt(r.id, 80) || !r.id || ids.has(r.id as string)) return 'Renglón sin id o repetido.';
    ids.add(r.id as string);
    if (!TIPOS.has(r.tipo as string)) return 'Tipo de renglón inválido.';
    if (r.tipo === 'orden' ? !esTxt(r.ref, 200) : !esTxt(r.texto ?? '', MAX_TEXTO)) return 'Texto o referencia inválidos.';
  }
  for (const h of x.hechas as Record<string, unknown>[]) {
    if (!h || typeof h !== 'object' || !esTxt(h.id, 80) || !esTxt(h.texto ?? '', MAX_TEXTO) || !esTxt(h.hecha, 40)) return 'Hecha inválida.';
  }
  return null;
}

export async function leerGuia(env: Env): Promise<{ version: number; guia: Guia }> {
  const f = await env.DB.prepare('SELECT version, json FROM guia_trabajos WHERE id = 1').first<{ version: number; json: string }>();
  return f ? { version: f.version, guia: JSON.parse(f.json) } : { version: 0, guia: guiaVacia() };
}

/** true = guardó; false = la versión no coincidía (otro guardó antes). */
export async function escribirGuia(env: Env, version: number, guia: Guia, autor: string): Promise<boolean> {
  const json = JSON.stringify(guia), ahora = new Date().toISOString();
  const r = version === 0
    ? await env.DB.prepare('INSERT INTO guia_trabajos (id, version, json, autor, guardado) VALUES (1, 1, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
      .bind(json, autor, ahora).run()
    : await env.DB.prepare('UPDATE guia_trabajos SET version = version + 1, json = ?, autor = ?, guardado = ? WHERE id = 1 AND version = ?')
      .bind(json, autor, ahora, version).run();
  return (r.meta?.changes ?? 0) > 0;
}
```

- [ ] **Step 5: Rutas en `src/ordenes/rutas.ts`**

Agregar el import `import { leerGuia, escribirGuia, problemaGuia, type Guia } from './guia';` y, en `rutasOrdenes`, **antes** de `if (sub !== '/lista' || req.method !== 'GET') return null;`:

```ts
  if (sub === '/guia') {
    const modulos = await rolesDe(req, env);
    const conRol = FUENTES.filter((m) => modulos[m]);
    if (!conRol.length) return json(403, { error: 'sin_permiso', detalles: ['No tenés rol en Prensas ni en Lotes.'] });
    const puedeEditar = conRol.some((m) => PESO[modulos[m]!] >= PESO.editor);

    if (req.method === 'GET') {
      const [docs, { version, guia }] = await Promise.all([documentos(env, conRol), leerGuia(env)]);
      const ordenes: ResumenOrden[] = [];
      for (const m of conRol) if (docs.has(m)) ordenes.push(...resumenOrdenes(m, docs.get(m)!));
      return json(200, { version, guia, puedeEditar, modulos, ordenes: ordenes.filter((o) => o.estado === 'pendiente') });
    }
    if (req.method === 'POST') {
      if (!puedeEditar) return json(403, { error: 'sin_permiso', detalles: ['Solo un editor puede cambiar la guía.'] });
      let body: { version?: unknown; guia?: unknown };
      try { body = await req.json(); } catch { return json(400, { error: 'guia_invalida', detalles: ['JSON inválido.'] }); }
      const problema = problemaGuia(body?.guia);
      if (problema || typeof body.version !== 'number') return json(400, { error: 'guia_invalida', detalles: [problema || 'Falta la versión.'] });
      const email = (await emailDelUsuario(req, env)) || '';
      if (await escribirGuia(env, body.version, body.guia as Guia, email)) return json(200, { version: body.version + 1 });
      const actual = await leerGuia(env);
      return json(409, { error: 'conflicto', ...actual });
    }
    return null;
  }
```

- [ ] **Step 6: Correr los tests**

Run: `npx vitest run test/ordenes-guia-rutas.test.ts test/ordenes-rutas.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add migrations/0003_guia_trabajos.sql src/ordenes/guia.ts src/ordenes/rutas.ts test/ordenes-guia-rutas.test.ts
git commit -m "feat(ordenes): tabla guia_trabajos y rutas GET/POST /ordenes/api/guia con versión optimista"
```

---

### Task 2: `guia.js` — unir con pendientes y operaciones (puro)

**Files:**
- Create: `public/ordenes/js/guia.js`
- Test: `test/ordenes-guia.test.mjs`

**Interfaces:**
- Consumes: forma `Guia` de la Task 1; `ResumenOrden` (`{ modulo, id, tipo, numero, fecha, estado, lotes, lote_corte }`); `nombreDeTipo(id)` de `./catalogo.js`.
- Produces:
  - `guiaVacia() → Guia`
  - `refDe(orden) → 'lotes:ot-1'`
  - `textoDeOrden(orden) → string`
  - `unirGuia(guia, ordenes) → Guia` (descarta refs que ya no están pendientes; agrega al final las pendientes nuevas, por fecha y N°)
  - `vistaGuia(guia, ordenes) → { visibles: Array<Renglon & { orden? }>, ocultas: Array<Renglon & { orden }> }`
  - `aplicar(guia, op) → Guia` con `op` uno de:
    `{op:'agregar', id, tipo?:'tarea'|'nota', texto?}`, `{op:'texto', id, texto}`, `{op:'tipo', id}` (tarea↔nota),
    `{op:'mover', id, delta:-1|1}`, `{op:'quitar', id}`, `{op:'mostrar', id}`,
    `{op:'hecha', id, ahora, por}`, `{op:'deshacer', id}`, `{op:'firma', campo:'emitio'|'recibio', valor}`
  - `podarHechas(guia, ahoraISO) → Guia` (saca hechas de más de 7 días)

- [ ] **Step 1: Tests que fallan**

`test/ordenes-guia.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { guiaVacia, refDe, textoDeOrden, unirGuia, vistaGuia, aplicar, podarHechas } from '../public/ordenes/js/guia.js';

const O = (x) => ({ modulo: 'lotes', id: 'ot-1', fuente: 'ordenes_trabajo', tipo: 'traslado', numero: '0957',
  fecha: '2026-11-03', estado: 'pendiente', lotes: ['26329'], lote_corte: '', emitio: 'Ana', ...x });
const T = (id, texto = id) => ({ id, tipo: 'tarea', texto });
const G = (renglones, extra) => ({ ...guiaVacia(), renglones, ...extra });
const ids = (g) => g.renglones.map((r) => r.id);

describe('refDe / textoDeOrden', () => {
  it('ref = módulo:id', () => expect(refDe(O())).toBe('lotes:ot-1'));
  it('texto con tipo, N° y lotes', () => expect(textoDeOrden(O())).toBe('Traslado · N° 0957 · 26329'));
  it('corte: el lote que se forma', () =>
    expect(textoDeOrden(O({ lote_corte: '26400', lotes: ['1', '2'] }))).toBe('Traslado · N° 0957 · 26400 (corte de 2 lotes)'));
  it('más de 6 lotes: +n', () =>
    expect(textoDeOrden(O({ lotes: ['1','2','3','4','5','6','7','8'] }))).toBe('Traslado · N° 0957 · 1, 2, 3, 4, 5, 6 +2'));
});

describe('unirGuia', () => {
  it('una orden pendiente nueva entra al final', () => {
    const g = unirGuia(G([T('a')]), [O()]);
    expect(g.renglones).toEqual([T('a'), { id: 'o_lotes:ot-1', tipo: 'orden', ref: 'lotes:ot-1' }]);
  });
  it('varias nuevas: por fecha y N°', () => {
    const g = unirGuia(G([]), [O({ id: 'b', fecha: '2026-11-04' }), O({ id: 'a', fecha: '2026-11-01' })]);
    expect(ids(g)).toEqual(['o_lotes:a', 'o_lotes:b']);
  });
  it('una orden que ya tiene lugar no se duplica ni se mueve', () => {
    const g0 = G([{ id: 'x', tipo: 'orden', ref: 'lotes:ot-1' }, T('a')]);
    expect(ids(unirGuia(g0, [O()]))).toEqual(['x', 'a']);
  });
  it('una orden que ya no está pendiente desaparece', () => {
    const g0 = G([{ id: 'x', tipo: 'orden', ref: 'lotes:ot-1' }, T('a')]);
    expect(ids(unirGuia(g0, [O({ estado: 'ejecutada' })]))).toEqual(['a']);
    expect(ids(unirGuia(g0, []))).toEqual(['a']);
  });
  it('una oculta sigue oculta (no vuelve a entrar como nueva)', () => {
    const g0 = G([{ id: 'x', tipo: 'orden', ref: 'lotes:ot-1', oculta: true }]);
    expect(unirGuia(g0, [O()]).renglones).toEqual(g0.renglones);
  });
  it('no muta la guía que recibe', () => {
    const g0 = G([T('a')]);
    unirGuia(g0, [O()]);
    expect(g0.renglones).toEqual([T('a')]);
  });
});

describe('vistaGuia', () => {
  it('visibles en orden con su orden; ocultas aparte', () => {
    const g = G([T('a'), { id: 'x', tipo: 'orden', ref: 'lotes:ot-1' }, { id: 'y', tipo: 'orden', ref: 'lotes:ot-2', oculta: true }]);
    const v = vistaGuia(g, [O(), O({ id: 'ot-2' })]);
    expect(v.visibles.map((r) => r.id)).toEqual(['a', 'x']);
    expect(v.visibles[1].orden.id).toBe('ot-1');
    expect(v.ocultas.map((r) => r.id)).toEqual(['y']);
  });
});

describe('aplicar', () => {
  it('agregar: al final, tarea por defecto', () => {
    expect(aplicar(G([T('a')]), { op: 'agregar', id: 'b' }).renglones).toEqual([T('a'), { id: 'b', tipo: 'tarea', texto: '' }]);
  });
  it('agregar con un id que ya existe: no hace nada (re-aplicar tras 409)', () => {
    const g = G([T('a')]);
    expect(aplicar(g, { op: 'agregar', id: 'a' })).toEqual(g);
  });
  it('texto y tipo', () => {
    let g = aplicar(G([T('a')]), { op: 'texto', id: 'a', texto: 'Lavar' });
    expect(g.renglones[0].texto).toBe('Lavar');
    g = aplicar(g, { op: 'tipo', id: 'a' });
    expect(g.renglones[0].tipo).toBe('nota');
    expect(aplicar(g, { op: 'tipo', id: 'a' }).renglones[0].tipo).toBe('tarea');
  });
  it('tipo no cambia una orden', () => {
    const g = G([{ id: 'x', tipo: 'orden', ref: 'r' }]);
    expect(aplicar(g, { op: 'tipo', id: 'x' })).toEqual(g);
  });
  it('mover salta las ocultas', () => {
    const g = G([T('a'), { id: 'h', tipo: 'orden', ref: 'r', oculta: true }, T('b')]);
    expect(ids(aplicar(g, { op: 'mover', id: 'b', delta: -1 }))).toEqual(['b', 'a', 'h']);
    expect(ids(aplicar(g, { op: 'mover', id: 'a', delta: 1 }))).toEqual(['h', 'b', 'a']);
    expect(aplicar(g, { op: 'mover', id: 'a', delta: -1 })).toEqual(g);
  });
  it('quitar: borra una tarea, oculta una orden', () => {
    const g = G([T('a'), { id: 'x', tipo: 'orden', ref: 'r' }]);
    expect(ids(aplicar(g, { op: 'quitar', id: 'a' }))).toEqual(['x']);
    expect(aplicar(g, { op: 'quitar', id: 'x' }).renglones[1]).toEqual({ id: 'x', tipo: 'orden', ref: 'r', oculta: true });
    expect(aplicar(aplicar(g, { op: 'quitar', id: 'x' }), { op: 'mostrar', id: 'x' }).renglones[1].oculta).toBe(false);
  });
  it('hecha → deshacer vuelve al mismo lugar', () => {
    const g = G([T('a'), T('b'), T('c')]);
    const h = aplicar(g, { op: 'hecha', id: 'b', ahora: '2026-11-04T10:00:00Z', por: 'ana@x' });
    expect(ids(h)).toEqual(['a', 'c']);
    expect(h.hechas).toEqual([{ id: 'b', tipo: 'tarea', texto: 'b', hecha: '2026-11-04T10:00:00Z', por: 'ana@x', lugar: 1 }]);
    const d = aplicar(h, { op: 'deshacer', id: 'b' });
    expect(ids(d)).toEqual(['a', 'b', 'c']);
    expect(d.hechas).toEqual([]);
  });
  it('hecha solo para tareas', () => {
    const g = G([{ id: 'n', tipo: 'nota', texto: 'x' }]);
    expect(aplicar(g, { op: 'hecha', id: 'n', ahora: 'z', por: 'p' })).toEqual(g);
  });
  it('firma', () => {
    expect(aplicar(G([]), { op: 'firma', campo: 'emitio', valor: 'Oriana' }).emitio).toBe('Oriana');
    expect(aplicar(G([]), { op: 'firma', campo: 'otro', valor: 'x' })).toEqual(G([]));
  });
  it('id inexistente u op desconocida: igual', () => {
    const g = G([T('a')]);
    expect(aplicar(g, { op: 'texto', id: 'zz', texto: 'x' })).toEqual(g);
    expect(aplicar(g, { op: 'raro' })).toEqual(g);
  });
});

describe('podarHechas', () => {
  it('saca las de más de 7 días', () => {
    const g = G([], { hechas: [
      { id: 'v', tipo: 'tarea', texto: '', hecha: '2026-10-27T09:00:00.000Z', por: '', lugar: 0 },
      { id: 'n', tipo: 'tarea', texto: '', hecha: '2026-10-29T09:00:00.000Z', por: '', lugar: 0 },
    ] });
    expect(podarHechas(g, '2026-11-04T10:00:00.000Z').hechas.map((h) => h.id)).toEqual(['n']);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/ordenes-guia.test.mjs`
Expected: FAIL (no existe `guia.js`).

- [ ] **Step 3: `public/ordenes/js/guia.js`**

```js
/* ===== Órdenes de trabajo — Guía de trabajos (puro) =====
 * La guía guardada solo tiene los renglones escritos a mano y el LUGAR de cada
 * orden (ref = módulo:id); el texto de una orden se arma cada vez desde
 * Pendientes, así una orden ejecutada o anulada se va sola.
 * Cada cambio es una operación {op, …} que se puede re-aplicar sobre la
 * versión del servidor cuando otro guardó antes (409): por eso todas son
 * funciones (guia, op) → guia nueva, sin mutar, e idempotentes donde importa. */
'use strict';
import { nombreDeTipo } from './catalogo.js';

const SIETE_DIAS = 7 * 864e5;

export const guiaVacia = () => ({ emitio: '', recibio: '', renglones: [], hechas: [] });
export const refDe = o => o.modulo + ':' + o.id;

export function textoDeOrden(o){
  const lotes = o.lotes || [];
  const lotesTxt = o.lote_corte
    ? `${o.lote_corte} (corte de ${lotes.length} lote${lotes.length === 1 ? '' : 's'})`
    : lotes.slice(0, 6).join(', ') + (lotes.length > 6 ? ` +${lotes.length - 6}` : '');
  return [nombreDeTipo(o.tipo), o.numero ? 'N° ' + o.numero : '', lotesTxt].filter(Boolean).join(' · ');
}

const pendientesPorRef = ordenes =>
  new Map((ordenes || []).filter(o => o.estado === 'pendiente').map(o => [refDe(o), o]));

export function unirGuia(guia, ordenes){
  const g = { ...guiaVacia(), ...guia };
  const pend = pendientesPorRef(ordenes);
  const renglones = g.renglones.filter(r => r.tipo !== 'orden' || pend.has(r.ref));
  const conocidas = new Set(renglones.filter(r => r.tipo === 'orden').map(r => r.ref));
  const nuevas = [...pend.entries()].filter(([ref]) => !conocidas.has(ref))
    .sort(([, a], [, b]) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.numero).localeCompare(String(b.numero)))
    .map(([ref]) => ({ id: 'o_' + ref, tipo: 'orden', ref }));
  return { ...g, renglones: renglones.concat(nuevas) };
}

export function vistaGuia(guia, ordenes){
  const pend = pendientesPorRef(ordenes);
  const con = r => r.tipo === 'orden' ? { ...r, orden: pend.get(r.ref) } : r;
  const enLista = (guia.renglones || []).filter(r => r.tipo !== 'orden' || pend.has(r.ref));
  return { visibles: enLista.filter(r => !r.oculta).map(con), ocultas: enLista.filter(r => r.oculta).map(con) };
}

const cambiar = (g, id, f) => {
  const i = g.renglones.findIndex(r => r.id === id);
  if (i < 0) return g;
  const nuevo = f(g.renglones[i]);
  if (nuevo === g.renglones[i]) return g;
  const renglones = g.renglones.slice();
  renglones[i] = nuevo;
  return { ...g, renglones };
};

function mover(g, id, delta){
  const lista = g.renglones;
  const idx = lista.findIndex(r => r.id === id);
  const vis = lista.map((r, i) => r.oculta ? -1 : i).filter(i => i >= 0);
  const k = vis.indexOf(idx);
  if (k < 0 || k + delta < 0 || k + delta >= vis.length) return g;
  const destino = vis[k + delta];
  const renglones = lista.slice();
  const [r] = renglones.splice(idx, 1);
  renglones.splice(destino, 0, r);
  return { ...g, renglones };
}

export function aplicar(guia, op){
  const g = { ...guiaVacia(), ...guia };
  switch (op && op.op){
    case 'agregar':
      if (g.renglones.some(r => r.id === op.id)) return g;
      return { ...g, renglones: g.renglones.concat({ id: op.id, tipo: op.tipo === 'nota' ? 'nota' : 'tarea', texto: op.texto || '' }) };
    case 'texto':
      return cambiar(g, op.id, r => r.tipo === 'orden' ? r : { ...r, texto: String(op.texto ?? '') });
    case 'tipo':
      return cambiar(g, op.id, r => r.tipo === 'orden' ? r : { ...r, tipo: r.tipo === 'tarea' ? 'nota' : 'tarea' });
    case 'mover':
      return mover(g, op.id, op.delta < 0 ? -1 : 1);
    case 'quitar': {
      const r = g.renglones.find(x => x.id === op.id);
      if (!r) return g;
      if (r.tipo === 'orden') return cambiar(g, op.id, x => ({ ...x, oculta: true }));
      return { ...g, renglones: g.renglones.filter(x => x.id !== op.id) };
    }
    case 'mostrar':
      return cambiar(g, op.id, r => r.tipo === 'orden' ? { ...r, oculta: false } : r);
    case 'hecha': {
      const lugar = g.renglones.findIndex(r => r.id === op.id);
      const r = g.renglones[lugar];
      if (!r || r.tipo !== 'tarea') return g;
      return { ...g, renglones: g.renglones.filter(x => x.id !== op.id),
        hechas: g.hechas.concat({ id: r.id, tipo: r.tipo, texto: r.texto || '', hecha: op.ahora, por: op.por || '', lugar }) };
    }
    case 'deshacer': {
      const h = g.hechas.find(x => x.id === op.id);
      if (!h || g.renglones.some(r => r.id === h.id)) return g;
      const renglones = g.renglones.slice();
      renglones.splice(Math.min(h.lugar, renglones.length), 0, { id: h.id, tipo: 'tarea', texto: h.texto });
      return { ...g, renglones, hechas: g.hechas.filter(x => x.id !== op.id) };
    }
    case 'firma':
      return op.campo === 'emitio' || op.campo === 'recibio' ? { ...g, [op.campo]: String(op.valor ?? '') } : g;
    default:
      return g;
  }
}

export function podarHechas(guia, ahoraISO){
  const corte = Date.parse(ahoraISO) - SIETE_DIAS;
  const hechas = (guia.hechas || []).filter(h => Date.parse(h.hecha) >= corte);
  return hechas.length === (guia.hechas || []).length ? guia : { ...guia, hechas };
}
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run test/ordenes-guia.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/ordenes/js/guia.js test/ordenes-guia.test.mjs
git commit -m "feat(ordenes): guia.js — unir la guía con los pendientes y operaciones re-aplicables"
```

---

### Task 3: `guia-sync.js` — guardar, re-aplicar tras 409, reintentar

**Files:**
- Create: `public/ordenes/js/guia-sync.js`
- Test: `test/ordenes-guia-sync.test.mjs`

**Interfaces:**
- Consumes: `unirGuia`, `aplicar`, `podarHechas` de `./guia.js`.
- Produces: `crearSync({ fetch, ahora, alCambiar, alEstado }) → { cargar(): Promise<void>, ejecutar(op, { demora? }): void, guardarYa(): Promise<void>, reintentar(): Promise<void>, estado(): { guia, ordenes, version, puedeEditar, modulos } }`.
  - `alCambiar()` se llama cada vez que la guía en pantalla cambia (repintar).
  - `alEstado(e)` con `e` ∈ `'guardando' | 'guardado' | 'error' | 'cargado' | 'error-carga'`.
  - `ahora()` devuelve ISO (inyectable para tests).

- [ ] **Step 1: Tests que fallan**

`test/ordenes-guia-sync.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { crearSync } from '../public/ordenes/js/guia-sync.js';

const O = { modulo: 'lotes', id: 'ot-1', tipo: 'traslado', numero: '0957', fecha: '2026-11-03', estado: 'pendiente', lotes: [] };
const resp = (status, body) => ({ ok: status < 300, status, json: async () => body });

/** Servidor falso: guarda en memoria con versión, igual que la ruta. */
function servidor(inicial = { version: 0, guia: { emitio: '', recibio: '', renglones: [], hechas: [] } }){
  const s = { ...inicial, posts: 0, falla: 0 };
  s.fetch = async (url, init) => {
    if (!init || init.method !== 'POST') return resp(200, { version: s.version, guia: s.guia, ordenes: [O], puedeEditar: true, modulos: {} });
    s.posts++;
    if (s.falla > 0){ s.falla--; throw new Error('red'); }
    const b = JSON.parse(init.body);
    if (b.version !== s.version) return resp(409, { error: 'conflicto', version: s.version, guia: s.guia });
    s.version++; s.guia = b.guia;
    return resp(200, { version: s.version });
  };
  return s;
}
const nuevo = (s, extra) => crearSync({ fetch: s.fetch, ahora: () => '2026-11-04T10:00:00.000Z', alCambiar(){}, alEstado(){}, ...extra });

describe('guia-sync', () => {
  it('cargar une la guía con los pendientes (la orden entra al final)', async () => {
    const s = servidor(); const g = nuevo(s);
    await g.cargar();
    expect(g.estado().guia.renglones.map((r) => r.id)).toEqual(['o_lotes:ot-1']);
    expect(g.estado().puedeEditar).toBe(true);
  });
  it('ejecutar aplica en pantalla al toque y guarda', async () => {
    const s = servidor(); const g = nuevo(s);
    await g.cargar();
    g.ejecutar({ op: 'agregar', id: 'a', texto: 'Lavar' });
    expect(g.estado().guia.renglones.map((r) => r.id)).toEqual(['o_lotes:ot-1', 'a']);
    await g.guardarYa();
    expect(s.version).toBe(1);
    expect(s.guia.renglones.map((r) => r.id)).toEqual(['o_lotes:ot-1', 'a']);
  });
  it('409: toma la del servidor y re-aplica el cambio encima', async () => {
    const s = servidor(); const g = nuevo(s);
    await g.cargar();
    // Otra persona guarda en el medio.
    s.version = 5; s.guia = { emitio: 'Oriana', recibio: '', renglones: [{ id: 'x', tipo: 'tarea', texto: 'De otro' }], hechas: [] };
    g.ejecutar({ op: 'agregar', id: 'a', texto: 'Mío' });
    await g.guardarYa();
    expect(s.version).toBe(6);
    expect(s.guia.emitio).toBe('Oriana');
    expect(s.guia.renglones.map((r) => r.id)).toEqual(['x', 'o_lotes:ot-1', 'a']);
    expect(g.estado().guia).toEqual(s.guia);
  });
  it('error de red: avisa error, no pierde el cambio, reintentar lo guarda', async () => {
    const s = servidor(); const estados = [];
    const g = nuevo(s, { alEstado: (e) => estados.push(e) });
    await g.cargar();
    s.falla = 1;
    g.ejecutar({ op: 'agregar', id: 'a' });
    await g.guardarYa();
    expect(estados).toContain('error');
    expect(g.estado().guia.renglones.some((r) => r.id === 'a')).toBe(true);
    await g.reintentar();
    expect(s.guia.renglones.some((r) => r.id === 'a')).toBe(true);
    expect(estados.at(-1)).toBe('guardado');
  });
  it('varios cambios seguidos salen en un solo guardado', async () => {
    const s = servidor(); const g = nuevo(s);
    await g.cargar();
    g.ejecutar({ op: 'agregar', id: 'a' }, { demora: 1000 });
    g.ejecutar({ op: 'texto', id: 'a', texto: 'Lav' }, { demora: 1000 });
    g.ejecutar({ op: 'texto', id: 'a', texto: 'Lavar' }, { demora: 1000 });
    await g.guardarYa();
    expect(s.posts).toBe(1);
    expect(s.guia.renglones.find((r) => r.id === 'a').texto).toBe('Lavar');
  });
  it('poda las hechas viejas al guardar', async () => {
    const s = servidor({ version: 1, guia: { emitio: '', recibio: '', renglones: [], hechas: [
      { id: 'v', tipo: 'tarea', texto: '', hecha: '2026-10-01T00:00:00.000Z', por: '', lugar: 0 }] } });
    const g = nuevo(s);
    await g.cargar();
    g.ejecutar({ op: 'firma', campo: 'emitio', valor: 'Oriana' });
    await g.guardarYa();
    expect(s.guia.hechas).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/ordenes-guia-sync.test.mjs`
Expected: FAIL (no existe el módulo).

- [ ] **Step 3: `public/ordenes/js/guia-sync.js`**

```js
/* ===== Órdenes de trabajo — guardar la Guía de trabajos =====
 * Cada cambio se aplica en pantalla al instante y queda en `_pend` hasta que
 * el servidor lo acepta. Si otro guardó antes (409), se toma su guía, se
 * vuelven a aplicar encima los cambios no aceptados y se reintenta: los
 * cambios son chicos (agregar, mover, tildar…), no hace falta preguntar.
 * fetch y ahora se inyectan para poder probarlo sin navegador. */
'use strict';
import { unirGuia, aplicar, podarHechas } from './guia.js';

const URL_GUIA = '/ordenes/api/guia';
const MAX_CONFLICTOS = 3;

export function crearSync({ fetch, ahora, alCambiar = () => {}, alEstado = () => {} }){
  let _guia = null, _ordenes = [], _version = 0, _puede = false, _modulos = {};
  let _pend = [];          // operaciones aplicadas en pantalla y no aceptadas todavía
  let _timer = null, _enVuelo = null;

  async function cargar(){
    try {
      const r = await fetch(URL_GUIA);
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      _ordenes = j.ordenes || []; _version = j.version || 0; _puede = !!j.puedeEditar; _modulos = j.modulos || {};
      _guia = unirGuia(j.guia, _ordenes);
      alEstado('cargado');
    } catch (_) {
      alEstado('error-carga');
    }
    alCambiar();
  }

  function ejecutar(op, { demora = 0 } = {}){
    if (!_guia || !_puede) return;
    _guia = aplicar(_guia, op);
    _pend.push(op);
    alCambiar();
    clearTimeout(_timer);
    _timer = setTimeout(() => { guardarYa(); }, demora);
  }

  async function enviar(){
    let conflictos = 0;
    while (_pend.length){
      const enviadas = _pend.length;
      const guia = podarHechas(_guia, ahora());
      alEstado('guardando');
      let r;
      try {
        r = await fetch(URL_GUIA, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: _version, guia }) });
      } catch (_) { alEstado('error'); return; }
      const j = await r.json().catch(() => ({}));
      if (r.status === 409 && conflictos++ < MAX_CONFLICTOS){
        _version = j.version;
        _guia = _pend.reduce(aplicar, unirGuia(j.guia, _ordenes));
        alCambiar();
        continue;
      }
      if (!r.ok){ alEstado('error'); return; }
      _version = j.version;
      if (_guia !== guia && _pend.length === enviadas) _guia = guia;   // la poda también queda en pantalla
      _pend = _pend.slice(enviadas);
    }
    alEstado('guardado');
  }

  async function guardarYa(){
    clearTimeout(_timer);
    if (_enVuelo) await _enVuelo;     // uno por vez: el siguiente sale con la versión nueva
    if (!_pend.length) return;
    _enVuelo = enviar();
    try { await _enVuelo; } finally { _enVuelo = null; }
  }

  return {
    cargar, ejecutar, guardarYa,
    reintentar: guardarYa,
    estado: () => ({ guia: _guia, ordenes: _ordenes, version: _version, puedeEditar: _puede, modulos: _modulos }),
  };
}
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run test/ordenes-guia-sync.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/ordenes/js/guia-sync.js test/ordenes-guia-sync.test.mjs
git commit -m "feat(ordenes): guardado de la guía con re-aplicación tras conflicto y reintento"
```

---

### Task 4: `guia-hoja.js` — la hoja RCI 08 (pantalla = papel)

**Files:**
- Create: `public/ordenes/js/guia-hoja.js`
- Test: `test/ordenes-guia-hoja.test.mjs`

**Interfaces:**
- Consumes: `vistaGuia`, `textoDeOrden` de `./guia.js`; `urlAbrir(o, volver)` de `./lista.js`.
- Produces: `hojaGuia(guia, ordenes, { fechaTxt, anio, puedeEditar, volver }) → string` (HTML) y `extrasGuia(guia, ordenes, { puedeEditar }) → string` (Hechas + Ocultas, solo pantalla).
  - Atributos que usa la Task 5: cada renglón `<tr class="gt-r gt-<tipo>" data-id="…">`; texto editable `<div class="gt-txt" contenteditable="plaintext-only" data-id="…">`; botones `<button data-acc="mover-arriba|mover-abajo|tipo|quitar|hecha|mostrar|deshacer" data-id="…">`; firmas `<span class="gt-firma" contenteditable="plaintext-only" data-firma="emitio|recibio">`; agregar `<button data-acc="agregar">`.

- [ ] **Step 1: Tests que fallan**

`test/ordenes-guia-hoja.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { hojaGuia, extrasGuia } from '../public/ordenes/js/guia-hoja.js';

const O = { modulo: 'lotes', id: 'ot-1', tipo: 'traslado', numero: '0957', fecha: '2026-11-03', estado: 'pendiente', lotes: ['26329'], lote_corte: '' };
const GUIA = { emitio: 'Oriana', recibio: 'Enzo - Marcelo', renglones: [
  { id: 'a', tipo: 'tarea', texto: 'Lavar <barriles>' },
  { id: 'n', tipo: 'nota', texto: 'avisar a Oriana' },
  { id: 'o', tipo: 'orden', ref: 'lotes:ot-1' },
  { id: 'h', tipo: 'orden', ref: 'lotes:ot-2', oculta: true },
], hechas: [{ id: 'z', tipo: 'tarea', texto: 'Mechado', hecha: '2026-11-03T12:00:00Z', por: 'ana@x', lugar: 0 }] };
const ORD = [O, { ...O, id: 'ot-2', numero: '0960' }];
const OPC = { fechaTxt: '04/11/2026', anio: '2026', puedeEditar: true, volver: '/ordenes/?v=guia' };

describe('hojaGuia', () => {
  const h = hojaGuia(GUIA, ORD, OPC);
  it('encabezado RCI 08 y título', () => {
    expect(h).toContain('ORDEN DE TRABAJO - RCI 08 - Rev. 02');
    expect(h).toContain('GUÍA DE TRABAJOS, SEGUIR ORDEN INDICADO');
    expect(h).toContain('04/11/2026');
  });
  it('escapa el texto', () => {
    expect(h).toContain('Lavar &lt;barriles&gt;');
    expect(h).not.toContain('<barriles>');
  });
  it('numera tareas y órdenes; la nota no lleva número ni casilla', () => {
    expect(h).toMatch(/data-id="a"[\s\S]*?gt-num">1<[\s\S]*?gt-caja/);
    expect(h).toMatch(/<tr class="gt-r gt-nota" data-id="n"><td class="gt-num"><\/td><td class="gt-chk"><\/td>/);
    expect(h).toMatch(/data-id="o"[\s\S]*?gt-num">2</);
  });
  it('la orden muestra su texto con enlace y no es editable; la oculta no aparece', () => {
    expect(h).toContain('Traslado · N° 0957 · 26329');
    expect(h).toContain('href="/lotes/?orden=ot-1&amp;volver=');
    expect(h).not.toContain('N° 0960');
    expect(h).not.toMatch(/data-id="o"[^>]*contenteditable/);
  });
  it('editor: controles y firmas editables', () => {
    expect(h).toContain('data-acc="agregar"');
    expect(h).toContain('data-acc="hecha" data-id="a"');
    expect(h).not.toContain('data-acc="hecha" data-id="o"');
    expect(h).toContain('data-firma="emitio"');
    expect(h).toContain('Oriana');
  });
  it('lector: sin controles ni contenteditable', () => {
    const l = hojaGuia(GUIA, ORD, { ...OPC, puedeEditar: false });
    expect(l).not.toContain('data-acc=');
    expect(l).not.toContain('contenteditable');
    expect(l).toContain('Lavar &lt;barriles&gt;');
  });
  it('sin renglones: lo dice', () => {
    expect(hojaGuia({ emitio: '', recibio: '', renglones: [], hechas: [] }, [], OPC)).toContain('La guía está vacía');
  });
});

describe('extrasGuia', () => {
  it('lista hechas con Deshacer y ocultas con Volver a mostrar', () => {
    const e = extrasGuia(GUIA, ORD, { puedeEditar: true });
    expect(e).toContain('Mechado');
    expect(e).toContain('data-acc="deshacer" data-id="z"');
    expect(e).toContain('N° 0960');
    expect(e).toContain('data-acc="mostrar" data-id="h"');
  });
  it('nada que mostrar: vacío', () => {
    expect(extrasGuia({ ...GUIA, hechas: [], renglones: [] }, [], { puedeEditar: true })).toBe('');
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/ordenes-guia-hoja.test.mjs`
Expected: FAIL.

- [ ] **Step 3: `public/ordenes/js/guia-hoja.js`**

```js
/* ===== Órdenes de trabajo — la hoja de la Guía de trabajos =====
 * La pantalla ES el papel (como la Orden de corrección en vivo): la misma
 * tabla se imprime; los controles van en celdas .gt-ctl que el @media print
 * oculta. El encabezado va en <thead> para que el navegador lo repita en
 * cada hoja si la guía no entra en una A4. */
'use strict';
import { vistaGuia, textoDeOrden } from './guia.js';
import { urlAbrir } from './lista.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const btn = (acc, id, txt, titulo) =>
  `<button type="button" class="ci-btn gt-b" data-acc="${acc}" data-id="${esc(id)}" title="${esc(titulo)}" aria-label="${esc(titulo)}">${txt}</button>`;
const editable = (puede, attrs, txt, ph) => puede
  ? `<div class="gt-txt" contenteditable="plaintext-only" ${attrs} data-ph="${esc(ph)}">${esc(txt)}</div>`
  : `<div class="gt-txt">${esc(txt)}</div>`;

function renglon(r, n, { puedeEditar, volver }){
  const num = r.tipo === 'nota' ? '' : String(n);
  const caja = r.tipo === 'nota' ? '' : '<span class="gt-caja" aria-hidden="true"></span>';
  const txt = r.tipo === 'orden'
    ? `<div class="gt-txt"><a class="gt-orden" href="${esc(urlAbrir(r.orden, volver))}">${esc(textoDeOrden(r.orden))}</a></div>`
    : editable(puedeEditar, `data-id="${esc(r.id)}"`, r.texto, r.tipo === 'nota' ? 'Nota…' : 'Escribí la tarea…');
  const ctl = !puedeEditar ? '' :
    `<td class="gt-ctl">` + btn('mover-arriba', r.id, '▲', 'Subir') + btn('mover-abajo', r.id, '▼', 'Bajar') +
    (r.tipo === 'tarea' ? btn('hecha', r.id, '✓', 'Marcar hecha') : '') +
    (r.tipo !== 'orden' ? btn('tipo', r.id, r.tipo === 'nota' ? '☐' : '¶', r.tipo === 'nota' ? 'Pasar a tarea' : 'Pasar a nota') : '') +
    btn('quitar', r.id, '✕', r.tipo === 'orden' ? 'Ocultar de la guía' : 'Quitar') + `</td>`;
  return `<tr class="gt-r gt-${r.tipo}" data-id="${esc(r.id)}"><td class="gt-num">${num}</td><td class="gt-chk">${caja}</td>` +
    `<td class="gt-cel">${txt}</td>${ctl}</tr>`;
}

export function hojaGuia(guia, ordenes, { fechaTxt, anio, puedeEditar, volver }){
  const { visibles } = vistaGuia(guia, ordenes);
  let n = 0;
  const filas = visibles.map(r => renglon(r, r.tipo === 'nota' ? n : ++n, { puedeEditar, volver })).join('');
  const cols = puedeEditar ? 4 : 3;
  const firma = (campo, valor) => puedeEditar
    ? `<span class="gt-firma" contenteditable="plaintext-only" data-firma="${campo}">${esc(valor)}</span>`
    : `<span class="gt-firma">${esc(valor)}</span>`;
  return `<div class="gt-hoja"><table class="gt-tabla">` +
    `<thead><tr><th colspan="${cols}">` +
      `<div class="gt-top"><span class="gt-empresa">CATENA INSTITUTE</span>` +
      `<span>ORDEN DE TRABAJO - RCI 08 - Rev. 02 &nbsp;·&nbsp; Aprobado por: Roy Urvieta &nbsp;·&nbsp; Emisión: 28/01/2013</span></div>` +
      `<div class="gt-tit">Orden de Trabajo</div>` +
      `<div class="gt-meta"><span><b>Fecha:</b> ${esc(fechaTxt)}</span><span>${esc(anio)}</span></div>` +
      `<div class="gt-banda">GUÍA DE TRABAJOS, SEGUIR ORDEN INDICADO</div>` +
    `</th></tr></thead>` +
    `<tbody>${filas || `<tr><td colspan="${cols}" class="gt-vacia">La guía está vacía.${puedeEditar ? ' Agregá una tarea.' : ''}</td></tr>`}</tbody>` +
    `</table>` +
    (puedeEditar ? `<div class="gt-agregar"><button type="button" class="ci-btn" data-acc="agregar">＋ Agregar tarea</button></div>` : '') +
    `<div class="gt-firmas"><span><b>Emitió:</b> ${firma('emitio', guia.emitio)}</span><span><b>Firma:</b> ____________</span>` +
    `<span><b>Recibió:</b> ${firma('recibio', guia.recibio)}</span></div>` +
    `</div>`;
}

export function extrasGuia(guia, ordenes, { puedeEditar }){
  const { ocultas } = vistaGuia(guia, ordenes);
  const hechas = (guia.hechas || []).slice().reverse();
  const fecha = iso => /^\d{4}-\d{2}-\d{2}/.test(iso || '') ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';
  let h = '';
  if (hechas.length) h += `<details class="gt-extra"><summary>Hechas (últimos 7 días): ${hechas.length}</summary><ul>` +
    hechas.map(x => `<li><span>${esc(x.texto)}</span> <span class="gt-mut">${esc(fecha(x.hecha))}${x.por ? ' · ' + esc(x.por) : ''}</span>` +
      (puedeEditar ? ' ' + btn('deshacer', x.id, 'Deshacer', 'Volver a la guía') : '') + `</li>`).join('') + `</ul></details>`;
  if (ocultas.length) h += `<details class="gt-extra"><summary>Órdenes ocultas: ${ocultas.length}</summary><ul>` +
    ocultas.map(r => `<li><span>${esc(textoDeOrden(r.orden))}</span>` +
      (puedeEditar ? ' ' + btn('mostrar', r.id, 'Volver a mostrar', 'Volver a mostrar en la guía') : '') + `</li>`).join('') + `</ul></details>`;
  return h;
}
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run test/ordenes-guia-hoja.test.mjs`
Expected: PASS. (Si el regex de la nota no calza por un detalle de espacios, ajustar el **HTML** para que coincida exactamente con la forma esperada, no el test.)

- [ ] **Step 5: Commit**

```bash
git add public/ordenes/js/guia-hoja.js test/ordenes-guia-hoja.test.mjs
git commit -m "feat(ordenes): hoja RCI 08 de la Guía de trabajos (pantalla = papel)"
```

---

### Task 5: Cablear la vista `?v=guia` en la página de Órdenes

**Files:**
- Create: `public/ordenes/js/guia-vista.js`
- Modify: `public/ordenes/js/lista.js` (`VISTAS`)
- Modify: `public/ordenes/js/app.js` (`vistas()`, `pintarPortada()`, `pintar()`)
- Modify: `public/ordenes/index.html` (estilos `gt-*`, portada de 3 o 4 tarjetas, `@media print`; precargas regeneradas)
- Test: `test/ordenes-lista.test.mjs` (agregar caso), `test/ordenes-pantalla.test.ts` (agregar casos)

**Interfaces:**
- Consumes: `crearSync` (Task 3), `hojaGuia`/`extrasGuia` (Task 4).
- Produces: `montarGuia(cuerpo: HTMLElement, { volver: string }) → void`.

- [ ] **Step 1: Tests que fallan**

En `test/ordenes-lista.test.mjs`, dentro del `describe` de `estadoDeURL` (o uno nuevo al final):

```js
describe('vista guia', () => {
  it('?v=guia es una vista válida y vuelve a la URL', () => {
    expect(estadoDeURL('?v=guia').v).toBe('guia');
    expect(urlDeEstado({ v: 'guia' })).toBe('?v=guia');
  });
});
```

En `test/ordenes-pantalla.test.ts`, agregar:

```ts
describe('Guía de trabajos en la página', () => {
  const a = () => env.ORDENES_JS['js/app.js'];
  it('app.js monta la guía y la ofrece en la portada y en la sub-nav', () => {
    expect(a()).toContain("import { montarGuia } from './guia-vista.js'");
    expect(a()).toContain("['guia', 'Guía de trabajos']");
    expect(a()).toMatch(/_estado\.v === 'guia'\) return montarGuia\(/);
  });
  it('guia-vista no usa alert/confirm/prompt y guarda al salir del texto', () => {
    const g = env.ORDENES_JS['js/guia-vista.js'];
    expect(g).toBeTruthy();
    expect(g).not.toMatch(/\b(confirm|alert|prompt)\(/);
    expect(g).toContain('focusout');
  });
  it('index.html: estilos de la guía, controles fuera del papel y precarga', () => {
    const h = env.ORDENES_HTML;
    expect(h).toContain('.gt-hoja');
    expect(h).toMatch(/@media print\{[^}]*\.gt-ctl/);
    expect(h).toContain('<link rel="modulepreload" href="/ordenes/js/guia-vista.js">');
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run test/ordenes-lista.test.mjs test/ordenes-pantalla.test.ts`
Expected: FAIL.

- [ ] **Step 3: `lista.js`**

```js
const VISTAS = ['nueva', 'pendientes', 'historial', 'guia'];
```

- [ ] **Step 4: `public/ordenes/js/guia-vista.js`**

```js
/* ===== Órdenes de trabajo — vista Guía de trabajos =====
 * Arma la hoja, escucha los botones (data-acc) y los textos editables, y
 * manda cada cambio a guia-sync. El texto se guarda a los 800 ms de dejar de
 * tipear y, sí o sí, al salir del renglón (focusout). Repintar mientras se
 * tipea movería el cursor: mientras haya foco en un texto, solo se repinta
 * lo de afuera de la hoja. */
'use strict';
import { crearSync } from './guia-sync.js';
import { hojaGuia, extrasGuia } from './guia-hoja.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const ESTADOS = { guardando: 'Guardando…', guardado: 'Guardado', error: 'No se pudo guardar.' };
const nuevoId = () => 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function montarGuia(cuerpo, { volver }){
  // Quién tildó: el nombre del perfil (window.CIW lo pone el Worker en servirOrdenes).
  const quien = (window.CIW && (window.CIW.nombre || window.CIW.email)) || '';
  let _estadoGuardado = '';
  let _foco = null;   // data-id del renglón recién agregado, para ponerle el cursor

  cuerpo.innerHTML =
    `<div class="gt-barra"><button type="button" class="ci-btn" id="gtImprimir">Imprimir</button>` +
    `<span class="gt-estado" id="gtEstado" role="status" aria-live="polite"></span></div>` +
    `<div id="gtHoja"><p class="ord-msg">Cargando la guía…</p></div><div id="gtExtras"></div>`;
  const $h = cuerpo.querySelector('#gtHoja'), $x = cuerpo.querySelector('#gtExtras'), $e = cuerpo.querySelector('#gtEstado');

  const sync = crearSync({
    fetch: (...a) => window.fetch(...a),
    ahora: () => new Date().toISOString(),
    alCambiar: () => pintar(),
    alEstado: e => {
      if (e === 'error-carga'){ $h.innerHTML = `<p class="ord-msg">No se pudo cargar la guía. Probá recargar.</p>`; return; }
      _estadoGuardado = e;
      $e.innerHTML = e === 'error'
        ? `${esc(ESTADOS.error)} <button type="button" class="ci-btn" id="gtReintentar">Reintentar</button>`
        : esc(ESTADOS[e] || '');
      if (e === 'error') window.CI?.avisar?.('No se pudo guardar la guía. Tus cambios siguen en pantalla.', { tipo: 'mal' });
    },
  });

  function pintar(){
    const { guia, ordenes, puedeEditar } = sync.estado();
    if (!guia) return;
    const tipeando = $h.contains(document.activeElement) && document.activeElement.isContentEditable;
    if (!tipeando){
      const d = new Date();
      const fechaTxt = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
      $h.innerHTML = hojaGuia(guia, ordenes, { fechaTxt, anio: String(d.getFullYear()), puedeEditar, volver });
      if (_foco){ $h.querySelector(`.gt-txt[data-id="${CSS.escape(_foco)}"]`)?.focus(); _foco = null; }
    }
    $x.innerHTML = extrasGuia(guia, ordenes, { puedeEditar });
  }

  cuerpo.addEventListener('click', e => {
    if (e.target.closest('#gtImprimir')) return window.print();
    if (e.target.closest('#gtReintentar')) return sync.reintentar();
    const b = e.target.closest('button[data-acc]');
    if (!b) return;
    const id = b.dataset.id, acc = b.dataset.acc;
    if (acc === 'agregar'){ _foco = nuevoId(); return sync.ejecutar({ op: 'agregar', id: _foco }); }
    if (acc === 'mover-arriba') return sync.ejecutar({ op: 'mover', id, delta: -1 });
    if (acc === 'mover-abajo') return sync.ejecutar({ op: 'mover', id, delta: 1 });
    if (acc === 'hecha') return sync.ejecutar({ op: 'hecha', id, ahora: new Date().toISOString(), por: quien });
    if (['tipo', 'quitar', 'mostrar', 'deshacer'].includes(acc)) return sync.ejecutar({ op: acc, id });
  });

  // Texto de un renglón y firmas: se aplica al tipear (sin repintar la hoja) y se guarda con demora.
  cuerpo.addEventListener('input', e => {
    const t = e.target.closest('[contenteditable]');
    if (!t) return;
    const valor = t.textContent.replace(/\s+/g, ' ').trim();
    if (t.dataset.firma) sync.ejecutar({ op: 'firma', campo: t.dataset.firma, valor }, { demora: 800 });
    else if (t.dataset.id) sync.ejecutar({ op: 'texto', id: t.dataset.id, texto: valor }, { demora: 800 });
  });
  cuerpo.addEventListener('focusout', e => {
    if (!e.target.closest?.('[contenteditable]')) return;
    sync.guardarYa();
    setTimeout(pintar);   // ya sin foco: la hoja se pone al día (números, renglones de otros)
  });
  // Enter en un renglón = terminar de escribir (no saltos de línea en la tarea).
  cuerpo.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest?.('[contenteditable]')){ e.preventDefault(); e.target.blur(); }
  });

  sync.cargar();
}
```

- [ ] **Step 5: `app.js`**

1. Import arriba: `import { montarGuia } from './guia-vista.js';`
2. En `vistas()`, después de Historial: `v.push(['guia', 'Guía de trabajos']);` — es decir:

```js
  v.push(['pendientes', 'Pendientes'], ['historial', 'Historial'], ['guia', 'Guía de trabajos']);
```

3. En `pintarPortada()`, agregar la tarjeta y cambiar la clase de columnas por una variable:

```js
  tarjetas.push(['guia', 'Guía de trabajos', 'Las tareas del día para la bodega, con lo pendiente', 'Abrir →']);
  $('ordCuerpo').innerHTML =
    `<ul class="ord-portada" style="--n:${tarjetas.length}">` +
```

(se quita `${tarjetas.length === 2 ? ' dos' : ''}`).

4. En `pintar()`:

```js
function pintar(){
  pintarNav();
  if (!_estado.v) return pintarPortada();
  if (_estado.v === 'nueva') return pintarNueva();
  if (_estado.v === 'guia') return montarGuia($('ordCuerpo'), { volver: aqui() });
  return pintarLista();
}
```

5. En `arrancar()`, después de cargar la lista: igual que con `nueva`, la guía no depende de la lista:

```js
  if (_estado.v === 'nueva' || _estado.v === 'guia') return;
```

- [ ] **Step 6: `index.html`**

Reemplazar `.ord-portada{…grid-template-columns:repeat(3,1fr)…}` por `repeat(var(--n,3),1fr)` y borrar la regla `.ord-portada.dos{…}` (y su mención en el `@media (max-width:760px)` queda como `.ord-portada{grid-template-columns:1fr}`). Agregar antes de `@media (max-width:760px)`:

```css
  /* Guía de trabajos: la hoja ES el papel RCI 08 (blanco, Arial), como las hojas de Lotes. */
  .gt-barra{display:flex;gap:12px;align-items:center;margin:0 0 12px}
  .gt-estado{color:var(--muted);font-size:13px}
  .gt-hoja{background:#fff;color:#111;max-width:820px;margin:0 auto;padding:28px 34px;border-radius:6px;font-family:Arial,sans-serif}
  .gt-tabla{width:100%;border-collapse:collapse;font-size:14px}
  .gt-tabla th{font-weight:400;text-align:left;padding:0 0 8px}
  .gt-top{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:10px;color:#444;text-align:right;border-bottom:1px solid #999;padding-bottom:4px;margin-bottom:8px}
  .gt-empresa{color:#111;font-size:12px;font-weight:700;white-space:nowrap}
  .gt-tit{font-size:18px;font-weight:700;text-align:center;margin:6px 0 10px}
  .gt-meta{display:flex;gap:26px;font-size:13px;margin-bottom:10px}
  .gt-banda{font-size:13px;font-weight:700;background:#eee;padding:6px 10px;border:1px solid #bbb}
  .gt-r td{border-bottom:1px solid #ccc;padding:9px 6px;vertical-align:top}
  .gt-num{width:28px;text-align:right;color:#444;font-variant-numeric:tabular-nums}
  .gt-chk{width:30px}
  .gt-caja{display:inline-block;width:16px;height:16px;border:1.5px solid #333}
  .gt-nota .gt-cel{padding-left:22px;font-style:italic}
  .gt-txt{min-height:1.4em;outline:none;white-space:pre-wrap;word-break:break-word}
  .gt-txt[contenteditable]:focus{background:#fff8e1;box-shadow:0 0 0 2px #e0b84c}
  .gt-txt[contenteditable]:empty::before{content:attr(data-ph);color:#999}
  .gt-orden{color:#7a1f2b;font-weight:600;text-decoration:none}
  .gt-orden::before{content:"Orden pendiente · ";font-weight:400;color:#666}
  .gt-ctl{white-space:nowrap;text-align:right;width:1%}
  .gt-b{padding:2px 7px;min-height:28px;font-size:13px;margin-left:2px}
  .gt-vacia{padding:18px 6px;color:#666}
  .gt-agregar{margin:12px 0 4px}
  .gt-firmas{display:flex;flex-wrap:wrap;gap:10px 30px;margin-top:28px;font-size:13px}
  .gt-firma{display:inline-block;min-width:140px;border-bottom:1px solid #999;outline:none}
  .gt-firma[contenteditable]:focus{background:#fff8e1}
  .gt-extra{max-width:820px;margin:14px auto 0;font-size:13.5px}
  .gt-extra summary{cursor:pointer;color:var(--muted)}
  .gt-extra ul{margin:6px 0 0;padding-left:18px}
  .gt-extra li{margin:4px 0}
  .gt-mut{color:var(--muted)}
  @media print{
    .ord-tit,#ordNav,.gt-barra,.gt-ctl,.gt-agregar,#gtExtras{display:none!important}
    @page{size:A4;margin:12mm}
    body{background:#fff}
    .ord{max-width:none;padding:0}
    .gt-hoja{max-width:none;padding:0;border-radius:0}
    .gt-txt[contenteditable]:empty::before{content:""}
    .gt-orden{color:#111}
    .gt-r{break-inside:avoid}
  }
```

(El test pide `@media print{` seguido de una regla que nombre `.gt-ctl` sin `}` en el medio: por eso la regla de ocultar va primera dentro del bloque, antes de `@page`.)

- [ ] **Step 7: Regenerar precargas**

Run: `node scripts/precargas.mjs` y después `node scripts/precargas.mjs --verificar`
Expected: el bloque de `ordenes/index.html` suma `guia-vista.js`, `guia-sync.js`, `guia-hoja.js`, `guia.js`; verificar sale OK.

- [ ] **Step 8: Correr toda la suite**

Run: `npm test`
Expected: PASS (todos; si `test/ordenes-portal` u otro dependía de la clase `dos`, actualizarlo a `--n`).

- [ ] **Step 9: Commit**

```bash
git add public/ordenes test/ordenes-lista.test.mjs test/ordenes-pantalla.test.ts
git commit -m "feat(ordenes): vista Guía de trabajos (?v=guia) con tarjeta en la portada, edición en la hoja e impresión A4"
```

---

### Task 6: Recorrido en el navegador y cierre

**Files:**
- Modify: `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\.claude\launch.json` (entrada nueva `guia-trabajos`, puerto libre, p. ej. 8862, que corra `npm run dev:sin-ia -- --port 8862` desde el worktree, igual que las entradas anteriores de ese archivo)

- [ ] **Step 1:** Mirar cómo están armadas las entradas recientes de `launch.json` (p. ej. `filtros`, :8861) y copiar el patrón para el worktree `catenainstitute-guia`. `npm run migrar:local` en el worktree para crear la tabla en la D1 local.
- [ ] **Step 2:** `preview_start {name:'guia-trabajos'}`. Entrar con un usuario de prueba local (ver memoria "Verificar catenainstitute en el navegador": la D1 local arranca vacía; crear el perfil de prueba con rol editor en lotes por `wrangler d1 execute --local`).
- [ ] **Step 3:** Recorrer: portada con 4 tarjetas → Guía → Agregar 3 tareas → escribir → mover ▲▼ → pasar una a nota → ✓ Hecha → Deshacer → F5 (todo sigue) → Imprimir (vista previa: solo la hoja, sin botones, casillas vacías). Con una orden pendiente cargada en el documento de lotes local: aparece al final, se oculta con ✕, vuelve con "Volver a mostrar".
- [ ] **Step 4:** Celular (`resize_window mobile`): la hoja no desborda; si desborda, `.gt-hoja{padding:16px}` en el `@media (max-width:760px)`.
- [ ] **Step 5:** Commit de cualquier ajuste + launch.json (en el repo de Escritorio\claude, por separado).
- [ ] **Step 6:** Avisar al usuario: rama lista, y para producción hace falta además `npm run migrar:nube` (crea `guia_trabajos` en la D1 remota) **después** del merge.
