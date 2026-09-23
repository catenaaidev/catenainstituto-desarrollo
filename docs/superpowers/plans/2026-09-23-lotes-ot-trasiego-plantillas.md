# OT de trasiego con formato RCI 08 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En la pestaña Movimientos de Lotes (web), emitir órdenes de trabajo de trasiego con el formato RCI 08 de la bodega, que traen solas la descripción del lote (de Lotes) y sus barriles (del Mapa de Barriles), imprimen OT + Planilla de barriles + Rótulos, y al confirmarse registran los movimientos y avisan qué barriles faltó escanear.

**Architecture:** Una OT es un objeto nuevo en el documento de Lotes (`ordenes_trabajo[]`) que agrupa uno o más lotes y genera un movimiento `pendiente` por lote. Toda la lógica (plantillas, armado, confirmación, HTML de las hojas) vive en módulos puros testeables; las vistas (modales) solo leen el DOM y llaman a esos módulos. El backend suma un GET de solo lectura sobre el documento del Mapa de Barriles.

**Tech Stack:** Cloudflare Workers + D1, TypeScript en `src/`, JS ES modules sin build en `public/lotes/js/`, Vitest con `@cloudflare/vitest-pool-workers` (no hay DOM en los tests).

**Spec:** `docs/superpowers/specs/2026-09-23-lotes-ot-trasiego-plantillas-design.md`

## Global Constraints

- Repo: `C:\Users\Bmax\repos\catenainstitute-ot` (worktree, rama `feat/ot-trasiego-plantillas`). NO trabajar en `C:\Users\Bmax\repos\catenainstitute` (tiene trabajo sin commitear de otra sesión).
- El Mapa de Barriles es **solo lectura**: nada de este plan escribe en el documento `barriles`.
- Etapas y linaje leen solo `movimientos`: no tocar `src/lotes/motores/linaje.ts`, `etapas.ts` ni `movimientos.ts`.
- `normalizarMapa()` (`src/lotes/motores/mapa.ts`) NO se modifica: lo usan `/cruce` y `/orden-correccion`.
- Los tests corren en el runtime de Workers: sin `document`, sin `node:fs`. Módulos de `public/` que importan `nucleo.js` necesitan `globalThis.window = { addEventListener(){} }` ANTES de un `await import(...)` dinámico (nucleo.js hace `window.addEventListener('beforeunload', …)` al cargar).
- Número de OT: formato `OT-<anio>-<NNN>` vía `proximoNumeroOT()` de `public/lotes/js/ot-movimientos.js`, que se extiende para mirar también `ordenes_trabajo`.
- Textos de UI y comentarios en castellano rioplatense, como el resto del repo. Comentarios explican el *por qué*.
- Correr tests: `npx vitest run <archivo>` desde la raíz del worktree. Suite completa: `npm test`.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/prensas/validacion.ts` | Modificar | sumar `ordenes_trabajo` a `SECCIONES_LOTES` |
| `src/lotes/motores/barriles-lote.ts` | Crear | puro: barriles del Mapa agrupados por lote |
| `src/lotes/rutas.ts` | Modificar | `GET /barriles?lotes=` |
| `public/lotes/js/ot-plantillas.js` | Crear | las 4 plantillas (datos) |
| `public/lotes/js/ot-armado.js` | Crear | puro: armar/confirmar OT, movimientos, sin escanear |
| `public/lotes/js/ot-movimientos.js` | Modificar | `proximoNumeroOT` mira también las OT |
| `public/lotes/js/ot-hojas.js` | Crear | HTML de las 3 hojas (string, sin DOM) |
| `public/lotes/js/vista-ot-emitir.js` | Crear | modal Emitir + imprimir |
| `public/lotes/js/vista-ot-confirmar.js` | Crear | modal Confirmar + aviso sin escanear |
| `public/lotes/js/vista-movimientos.js` | Modificar | cablear botones a los modales nuevos |
| `public/lotes/index.html` | Modificar | CSS de pantalla e impresión de las hojas |
| `test/validacion.test.ts` | Modificar | casos de `ordenes_trabajo` |
| `test/lotes-barriles-ruta.test.ts` | Crear | motor + ruta `/barriles` |
| `test/lotes-ot-plantillas.test.mjs` | Crear | estructura de plantillas |
| `test/lotes-ot-armado.test.mjs` | Crear | lógica de OT |
| `test/lotes-ot-hojas.test.mjs` | Crear | contenido de las hojas |

---

### Task 1: `ordenes_trabajo` es una sección validada del guardado

**Files:**
- Modify: `src/prensas/validacion.ts:37-40`
- Test: `test/validacion.test.ts`

**Interfaces:**
- Produces: `SECCIONES_LOTES.secciones` incluye `'ordenes_trabajo'` (no en `requeridas`).

- [ ] **Step 1: Leer cómo arma los datos el test existente**

Run: `sed -n 1,40p test/validacion.test.ts`
Anotar el nombre del helper que arma un documento válido y cómo se llama a `validarDatos` (import de `../src/prensas/validacion`).

- [ ] **Step 2: Escribir los tests que fallan**

Agregar al final de `test/validacion.test.ts`:

```ts
describe('ordenes_trabajo en Lotes', () => {
  const base = (ots: unknown) => ({
    meta: { version: 1 },
    lotes: [{ lote: '26217' }],
    analisis: [],
    movimientos: [],
    ordenes_trabajo: ots,
  });
  const ot = (i: number) => ({ id: 'ot-' + i, ot: 'OT-2026-' + String(i).padStart(3, '0'), lotes: [] });

  it('rechaza ordenes_trabajo que no es una lista', () => {
    const e = validarDatos(base({ no: 'lista' }), base([]), false, SECCIONES_LOTES);
    expect(e.join(' ')).toMatch(/ordenes_trabajo/);
  });

  it('acepta que ordenes_trabajo no venga (documentos viejos)', () => {
    const { ordenes_trabajo: _, ...sin } = base([]);
    expect(validarDatos(sin, sin, false, SECCIONES_LOTES)).toEqual([]);
  });

  it('frena perder la mayoria de las OT en un solo guardado', () => {
    const muchas = Array.from({ length: 30 }, (_, i) => ot(i + 1));
    const e = validarDatos(base(muchas.slice(0, 5)), base(muchas), false, SECCIONES_LOTES);
    expect(e.join(' ')).toMatch(/se perderían 25 de 30 ordenes_trabajo/);
  });
});
```

Si el archivo no importa `SECCIONES_LOTES`, sumarlo al import existente de `../src/prensas/validacion`.

- [ ] **Step 3: Correr y verificar que fallan**

Run: `npx vitest run test/validacion.test.ts`
Expected: FAIL en "rechaza ordenes_trabajo que no es una lista" y "frena perder…" (hoy la clave pasa sin control).

- [ ] **Step 4: Implementar**

En `src/prensas/validacion.ts`, reemplazar el bloque de `SECCIONES_LOTES`:

```ts
/**
 * En Lotes, `movimientos` NO es obligatoria: el datos.json migrado desde el
 * Excel no la trae y tiene que poder guardarse igual. Lo mismo `ordenes_trabajo`
 * (las OT de trasiego, 2026-09-23): va en `secciones` y no en `requeridas` para
 * que tenga el control de lista y el freno anti-borrado sin exigirla.
 */
export const SECCIONES_LOTES: ConfigSecciones = {
  secciones: ['lotes', 'analisis', 'movimientos', 'ordenes_trabajo'],
  requeridas: ['lotes', 'analisis'],
};
```

Si `ConfigSecciones.secciones` está tipado con un union de literales (`Seccion`), sumar `'ordenes_trabajo'` a ese tipo. Si `perdidosDe` tiene un `switch` por sección que devuelve identidades, dejar que `ordenes_trabajo` caiga en el caso por longitud (default).

- [ ] **Step 5: Correr y verificar que pasan**

Run: `npx vitest run test/validacion.test.ts && npx tsc --noEmit`
Expected: PASS, sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add src/prensas/validacion.ts test/validacion.test.ts
git commit -m "feat(lotes): ordenes_trabajo es una seccion validada, con freno anti-borrado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `GET /lotes/api/barriles?lotes=` — barriles del Mapa por lote

**Files:**
- Create: `src/lotes/motores/barriles-lote.ts`
- Modify: `src/lotes/rutas.ts` (nueva ruta después de `/orden-correccion`, antes de `return null;`)
- Test: `test/lotes-barriles-ruta.test.ts`

**Interfaces:**
- Consumes: `leerMapaBarriles(env)` y `MapaNoDisponible` (ya en `rutas.ts` / `motores/mapa.ts`), `normalizarLote` de `motores/linaje.ts`.
- Produces:
  - `export interface BarrilOT { num: string; estado: string; cap: number | null; litros: number | null; anio: string; marca: string; origen: string; trat: string }`
  - `export function barrilesDeLotes(estado: Record<string, unknown>, lotes: string[]): Record<string, BarrilOT[]>` — una clave por lote pedido (normalizado), `[]` si no tiene.
  - HTTP: `GET /lotes/api/barriles?lotes=26217,26218` → `200 {version, por_lote: Record<string, BarrilOT[]>}`; `503 {error}` sin Mapa; `400 {error}` sin `lotes`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `test/lotes-barriles-ruta.test.ts`:

```ts
/**
 * Barriles del Mapa por lote, para armar las OT de trasiego.
 *
 * Solo lectura: la OT nunca escribe en el Mapa (lo actualiza el escáner). El
 * motor es puro para poder probar la forma de los datos sin D1; la ruta se
 * prueba entera contra la D1 de test.
 */
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { barrilesDeLotes } from '../src/lotes/motores/barriles-lote';
import { rutasLotes } from '../src/lotes/rutas';

const INV = [
  { num: '2221713', estado: 'LLENO', cap: 225, litros: 225, anio: 2022, marca: 'TARANSAUD',
    origen: 'FRANCES', trat: 'REF.101 M', uso: '', lote: '26217', cosecha: 2026 },
  { num: '2221714', estado: 'LLENO', cap: '225', litros: 225, anio: '2021', marca: 'SEGUIN',
    origen: 'FRANCES', trat: 'M+', lote: ' 26217 ' },
  { num: '451', estado: 'VACIO', cap: 500, litros: 0, anio: '', marca: 'TANQUE INOX 500',
    origen: '-', trat: '-', lote: '' },
  { num: '9001', estado: 'LLENO', cap: 225, litros: 225, lote: '26300' },
];

describe('barrilesDeLotes', () => {
  it('agrupa por lote normalizado y trae los campos de la planilla', () => {
    const r = barrilesDeLotes({ inventario: INV }, ['26217']);
    expect(r['26217'].map((b) => b.num)).toEqual(['2221713', '2221714']);
    expect(r['26217'][0]).toEqual({
      num: '2221713', estado: 'LLENO', cap: 225, litros: 225,
      anio: '2022', marca: 'TARANSAUD', origen: 'FRANCES', trat: 'REF.101 M',
    });
    expect(r['26217'][1].cap).toBe(225); // '225' del Excel se vuelve número
  });

  it('un lote pedido sin barriles devuelve lista vacia, no falta la clave', () => {
    expect(barrilesDeLotes({ inventario: INV }, ['26999'])).toEqual({ '26999': [] });
  });

  it('no trae lotes que no se pidieron', () => {
    expect(Object.keys(barrilesDeLotes({ inventario: INV }, ['26217']))).toEqual(['26217']);
  });

  it('tolera un estado sin inventario', () => {
    expect(barrilesDeLotes({}, ['26217'])).toEqual({ '26217': [] });
  });
});

const EDITOR = 'editor-barriles@catenawines.com';

async function pedir(qs: string) {
  const req = new Request('https://catenainstitute.example/lotes/api/barriles' + qs, {
    headers: { 'Cf-Access-Authenticated-User-Email': EDITOR },
  });
  const ctx = createExecutionContext();
  const res = await rutasLotes(req, env, ctx, '/barriles');
  await waitOnExecutionContext(ctx);
  return res!;
}

describe('GET /barriles', () => {
  beforeAll(async () => {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre) VALUES (?, 'lotes', 'editor', 'Editor')`,
    ).bind(EDITOR).run();
  });

  it('503 si todavia no hay documento del Mapa', async () => {
    await env.DB.prepare(`DELETE FROM documento WHERE modulo = 'barriles'`).run();
    expect((await pedir('?lotes=26217')).status).toBe(503);
  });

  it('400 sin lotes', async () => {
    expect((await pedir('')).status).toBe(400);
  });

  it('devuelve version y barriles de los lotes pedidos', async () => {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO documento (modulo, json) VALUES ('barriles', ?)`,
    ).bind(JSON.stringify({ version: 2304, estado: { inventario: INV } })).run();
    const r = await pedir('?lotes=26217,%2026300');
    expect(r.status).toBe(200);
    const d = await r.json<{ version: number; por_lote: Record<string, { num: string }[]> }>();
    expect(d.version).toBe(2304);
    expect(d.por_lote['26217']).toHaveLength(2);
    expect(d.por_lote['26300'].map((b) => b.num)).toEqual(['9001']);
  });
});
```

Antes de correr, verificar las columnas reales de `documento` con `grep -n "CREATE TABLE documento" -A10 migrations/*.sql`. Si la tabla tiene más columnas NOT NULL (por ejemplo `version`, `autor`, `actualizado`), sumarlas al `INSERT` del test con valores de prueba.

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run test/lotes-barriles-ruta.test.ts`
Expected: FAIL, `Cannot find module '../src/lotes/motores/barriles-lote'`.

- [ ] **Step 3: Implementar el motor**

Crear `src/lotes/motores/barriles-lote.ts`:

```ts
/**
 * Barriles del Mapa agrupados por lote, con los campos de la "Planilla de
 * movimiento de barriles" (N° barril, capacidad, año, proveedor, origen,
 * tratamiento). Lo usan las OT de trasiego.
 *
 * Por qué no reusa normalizarMapa(): esa normalización descarta anio, marca,
 * origen y trat, y la usan /cruce y /orden-correccion. Sumarle campos la haría
 * más pesada para dos consumidores que no los necesitan.
 */
import { normalizarLote } from './linaje';

export interface BarrilOT {
  num: string;
  estado: string;
  cap: number | null;
  litros: number | null;
  anio: string;
  marca: string;
  origen: string;
  trat: string;
}

/** Números que vienen del Excel como texto ('225') o vacíos. */
function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

export function barrilesDeLotes(
  estado: Record<string, unknown>,
  lotes: string[],
): Record<string, BarrilOT[]> {
  const out: Record<string, BarrilOT[]> = {};
  for (const l of lotes) {
    const L = normalizarLote(l);
    if (L) out[L] = [];
  }
  const inventario = Array.isArray(estado.inventario) ? (estado.inventario as Record<string, unknown>[]) : [];
  for (const b of inventario) {
    const L = normalizarLote(b.lote);
    if (!L || !(L in out)) continue;
    out[L].push({
      num: txt(b.num),
      estado: txt(b.estado),
      cap: numero(b.cap),
      litros: numero(b.litros),
      anio: txt(b.anio),
      marca: txt(b.marca),
      origen: txt(b.origen),
      trat: txt(b.trat),
    });
  }
  return out;
}
```

- [ ] **Step 4: Implementar la ruta**

En `src/lotes/rutas.ts`, sumar el import junto a los otros de motores:

```ts
import { barrilesDeLotes } from './motores/barriles-lote';
```

y la ruta después del bloque `// ---------- GET /orden-correccion ----------`:

```ts
  // ---------- GET /barriles?lotes=26217,26218 ----------
  // Para las OT de trasiego: los barriles de cada lote con los datos de la
  // planilla. Solo lectura: el Mapa lo escribe el escáner, nunca una OT.
  if (ruta === '/barriles' && req.method === 'GET') {
    const pedidos = (new URL(req.url).searchParams.get('lotes') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!pedidos.length) return json(400, { error: 'falta el parámetro lotes' });
    try {
      const doc = await leerMapaBarriles(env);
      return json(200, { version: doc.version, por_lote: barrilesDeLotes(doc.estado ?? {}, pedidos) });
    } catch (e) {
      if (e instanceof MapaNoDisponible) return json(503, { error: e.message });
      throw e;
    }
  }
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `npx vitest run test/lotes-barriles-ruta.test.ts && npx tsc --noEmit`
Expected: PASS (7 tests), sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add src/lotes/motores/barriles-lote.ts src/lotes/rutas.ts test/lotes-barriles-ruta.test.ts
git commit -m "feat(lotes): GET /barriles devuelve los barriles del Mapa por lote, para las OT

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Las 4 plantillas de trasiego

**Files:**
- Create: `public/lotes/js/ot-plantillas.js`
- Test: `test/lotes-ot-plantillas.test.mjs`

**Interfaces:**
- Produces:
  - `export const PLANTILLAS_OT: Array<{id: string, nombre: string, banda: [string, string], bloques: Bloque[]}>`
  - `export function plantillaPorId(id: string): Plantilla | null`
  - `export const COLS_VACIADO: Record<string, string>` — clave → etiqueta: `lote:'CIW lote', vasijas:'Vasija', litros:'Litros', destino:'Destino', caudalimetro:'Litros caudalímetro', merma:'Merma'`
  - `Bloque` es uno de:
    - `{tipo:'paso', texto, ok?: true, destaca?: 'organico'}`
    - `{tipo:'dato', texto}` — línea con espacio para anotar
    - `{tipo:'tabla-vaciado', columnas: string[]}` — claves de `COLS_VACIADO`
    - `{tipo:'rotular'}`
    - `{tipo:'tabla-correccion'}`
    - `{tipo:'tabla-llenado'}`
  - `export const TIPOS_BLOQUE = ['paso','dato','tabla-vaciado','rotular','tabla-correccion','tabla-llenado']`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `test/lotes-ot-plantillas.test.mjs`:

```js
/* Las plantillas de OT son datos, pero una mal armada imprime una hoja sin la
 * tabla de vasijas (y el operario no sabe qué trasegar) o revienta el render
 * con un tipo de bloque que nadie dibuja. Estos tests fijan esa estructura. */
import { describe, it, expect } from 'vitest';
import { PLANTILLAS_OT, plantillaPorId, TIPOS_BLOQUE, COLS_VACIADO } from '../public/lotes/js/ot-plantillas.js';

describe('PLANTILLAS_OT', () => {
  it('trae las cuatro plantillas acordadas', () => {
    expect(PLANTILLAS_OT.map((p) => p.id)).toEqual(
      ['barricas-barricas', 'tq-barricas', 'barricas-tanque', 'tq-tq']);
  });

  it('los ids son unicos', () => {
    const ids = PLANTILLAS_OT.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const p of PLANTILLAS_OT) {
    describe(p.id, () => {
      it('tiene exactamente una tabla de vaciado', () => {
        expect(p.bloques.filter((b) => b.tipo === 'tabla-vaciado')).toHaveLength(1);
      });
      it('todos los bloques tienen un tipo conocido', () => {
        for (const b of p.bloques) expect(TIPOS_BLOQUE).toContain(b.tipo);
      });
      it('las columnas de vaciado existen y arrancan por el lote', () => {
        const t = p.bloques.find((b) => b.tipo === 'tabla-vaciado');
        expect(t.columnas[0]).toBe('lote');
        for (const c of t.columnas) expect(Object.keys(COLS_VACIADO)).toContain(c);
      });
      it('los pasos y datos tienen texto', () => {
        for (const b of p.bloques.filter((b) => b.tipo === 'paso' || b.tipo === 'dato')) {
          expect(String(b.texto).trim()).not.toBe('');
        }
      });
    });
  }

  it('el corte a tanque registra caudalimetro', () => {
    const t = plantillaPorId('barricas-tanque').bloques.find((b) => b.tipo === 'tabla-vaciado');
    expect(t.columnas).toContain('caudalimetro');
  });

  it('las de barricas marcan la cinta de organicos', () => {
    for (const id of ['barricas-barricas', 'tq-barricas']) {
      expect(plantillaPorId(id).bloques.some((b) => b.destaca === 'organico')).toBe(true);
    }
  });

  it('plantillaPorId devuelve null para un id desconocido', () => {
    expect(plantillaPorId('nada')).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run test/lotes-ot-plantillas.test.mjs`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementar**

Crear `public/lotes/js/ot-plantillas.js`. Los textos están copiados de las órdenes reales de `Ordenes de Trabajo 2026` (0700, 0837, 0885, 0898): no "mejorarlos", que es lo que el operario ya conoce.

```js
/* ===== Lotes CIW — plantillas de las OT de trasiego (datos puros) =====
 *
 * Cada plantilla es la lista ordenada de bloques de la hoja RCI 08 tal como
 * la arma la bodega en Excel. Los textos se copiaron de las órdenes reales
 * (0700, 0837, 0885 y 0898 de 'Ordenes de Trabajo 2026'): son las palabras que
 * el operario ya conoce, no hay que reescribirlas.
 *
 * Agregar una plantilla es agregar un objeto acá; ot-hojas.js sabe dibujar
 * todos los tipos de bloque de TIPOS_BLOQUE. */
'use strict';

export const TIPOS_BLOQUE = ['paso', 'dato', 'tabla-vaciado', 'rotular', 'tabla-correccion', 'tabla-llenado'];

export const COLS_VACIADO = {
  lote: 'CIW lote',
  vasijas: 'Vasija',
  litros: 'Litros',
  destino: 'Destino',
  caudalimetro: 'Litros caudalímetro',
  merma: 'Merma',
};

const p = (texto, extra) => ({ tipo: 'paso', texto, ...(extra || {}) });
const dato = (texto) => ({ tipo: 'dato', texto });

// Los cuatro pasos de sanitizado se repiten en todas las plantillas.
const SANITIZAR = [
  p('Santizar bomba, cañerías, picos de llenado, visor T y cápsula de gas.'),
  p('Sanitizar vasija a utilizar. (técnico tiene que revisar)', { ok: true }),
  p('Sanitizar clapets antes de comenzar trasiego.'),
  p('Revisar apertura de tapas de vasija.'),
];
const TRASEGAR = p('Trasegar SEPARANDO DE BORRAS a tanque con nitrógeno o Argón en vena. Abrir antes para inertizar cañería.');
const INERTIZAR_O2 = [
  p('Inertizar tanque destino hasta obtener menos de 20% de O2, técnico tiene que revisar'),
  dato('% final de O2:'),
];

// Barricas → barricas y TQ → barricas comparten el cuerpo: vaciar a un tanque
// pulmón, corregir, y volver a llenar barricas.
function cuerpoABarricas(extraMerma){
  return [
    p('Buscar barriles de lotes solicitados, para degustación.', { ok: true }),
    ...SANITIZAR,
    TRASEGAR,
    { tipo: 'tabla-vaciado', columnas: ['lote', 'vasijas', 'litros', 'destino', 'merma'] },
    { tipo: 'rotular' },
    p('Inertizar espacio de cabeza con Argón'),
    p('Tomar muestra en tubo falcon y llevar a laboratorio CIW.'),
    p('Lavar barriles y vaporizar.'),
    p('De ser necesario, realizar las siguientes correcciones'),
    { tipo: 'tabla-correccion' },
    p('Homogeneizar y llevar muestra a laboratorio para chequeo'),
    p('Preparar para volver a los mismos barriles/ o barriles según indicaciones'),
    p('Lavarlos con hidro agua caliente, luego enfriarlos con agua fría y dejar escurrir'),
    p('Esperar ok de chequeo laboratorio', { ok: true }),
    p('Volver a llenarlos'),
    { tipo: 'tabla-llenado' },
    p('Rotular barriles. Colocar cinta azul o verde si son lotes orgánico o de Adrianna', { destaca: 'organico' }),
    p('Scanear barriles vaciados y llenados en Planilla Scaner Barricas'),
    dato('Registrar cantidad de barriles llenos:'),
    dato('Registrar cantidad de vasijas mermas:'),
    ...(extraMerma ? [dato('MERMA: ______   Rellenar con:')] : []),
    p('Tapar bien y pasar agua oxigenada por fuera. Enjuagar.'),
    p('Ordenar en box'),
    p('Lavar vasija utilizada.'),
    p('Juntar borras y tirar en tanque prensa.'),
  ];
}

export const PLANTILLAS_OT = [
  {
    id: 'barricas-barricas',
    nombre: 'Trasiego fin FML de barricas a barricas',
    banda: ['TRASIEGO', 'FIN FML'],
    bloques: cuerpoABarricas(false),
  },
  {
    id: 'tq-barricas',
    nombre: 'Trasiego fin FML de TQ a barricas',
    banda: ['TRASIEGO', 'FIN FML'],
    bloques: cuerpoABarricas(true),
  },
  {
    id: 'barricas-tanque',
    nombre: 'Trasiego de barricas a tanque (corte)',
    banda: ['TRASIEGO', 'CORTE A TANQUE'],
    bloques: [
      p('Buscar barriles seleccionados, estirar para que técnico los deguste'),
      ...SANITIZAR,
      p('USAR CAUDALÍMETRO Y REGISTRAR LITROS'),
      ...INERTIZAR_O2,
      TRASEGAR,
      { tipo: 'tabla-vaciado', columnas: ['lote', 'vasijas', 'litros', 'destino', 'caudalimetro', 'merma'] },
      { tipo: 'rotular' },
      p('Inertizar espacio de cabeza con Argón'),
      p('Tomar muestra en tubo falcon y llevar a laboratorio CIW.'),
      { tipo: 'tabla-correccion' },
      p('Homogeneizar.'),
      dato('Registrar SO2 final:'),
      dato('En caso de que quede mermo, rellenar con:'),
      dato('Chequear O2 final y registrar:'),
      p('Lavar y vaporizar barriles vaciados'),
      p('Lavar por fuera con agua oxigenada'),
      p('Scanear barriles vaciados y llenados y completar planilla de Scaner barricas'),
      dato('Anotar cantidad de barriles — Llenados: ______   Vaciados: ______   Mermos:'),
      p('Lavar vasija utilizada.'),
      p('Juntar borras y tirar en tanque de borras'),
    ],
  },
  {
    id: 'tq-tq',
    nombre: 'Trasiego de tq a tq',
    banda: ['TRASIEGO', 'SEPARANDO DE BORRAS'],
    bloques: [
      ...SANITIZAR,
      ...INERTIZAR_O2,
      TRASEGAR,
      { tipo: 'tabla-vaciado', columnas: ['lote', 'vasijas', 'litros', 'destino', 'merma'] },
      { tipo: 'rotular' },
      p('Inertizar espacio de cabeza con Argón'),
      p('Tomar muestra en tubo falcon y llevar a laboratorio CIW.'),
      p('Lavar y decolorar vasija vaciada'),
      { tipo: 'tabla-correccion' },
      p('Homogeneizar.'),
      p('De ser necesario, dar lleno con: Técnico tiene que degustar', { ok: true }),
    ],
  },
];

export function plantillaPorId(id){
  return PLANTILLAS_OT.find(pl => pl.id === id) || null;
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx vitest run test/lotes-ot-plantillas.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/ot-plantillas.js test/lotes-ot-plantillas.test.mjs
git commit -m "feat(lotes): las cuatro plantillas de OT de trasiego, con los textos de las ordenes reales

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Lógica pura de la OT (armar, movimientos, confirmar, sin escanear)

**Files:**
- Create: `public/lotes/js/ot-armado.js`
- Modify: `public/lotes/js/ot-movimientos.js` (`proximoNumeroOT`)
- Test: `test/lotes-ot-armado.test.mjs`

**Interfaces:**
- Consumes: `PENDIENTE`, `EJECUTADO` de `ot-movimientos.js`.
- Produces (todas exportadas desde `ot-armado.js`):
  - `litrosPrevistos(barriles: BarrilOT[]): number` — suma de `cap` numéricos.
  - `resumenVasijas(loteOT): string` — `vasijas_manual` si no hay barriles; `'1 barrica 2221713'` con uno; `'5 barricas'` con varios (todas `cap <= 300`); `'5 vasijas'` si alguna es mayor.
  - `armarOT({id, numero, plantilla, fecha, destino, emitio, lotes, mapaVersion, usuario, hoy}): OT` — `lotes` es `[{lote, id_texto, organico, barriles, vasijas_manual, litros_previstos?}]`; si `litros_previstos` es `null`/`undefined` se calcula con `litrosPrevistos`. Cada lote recibe `mov_id = id + '-' + indice`.
  - `movimientosDeOT(ot, usuario, hoy): Movimiento[]` — uno por lote, `tipo:'trasiego'`, `estado: PENDIENTE`, `id = lote.mov_id`.
  - `confirmarOT(ot, movimientos, reales, usuario, hoy): string[]` — **muta** `ot` y los movimientos de `movimientos` cuyo `id` es un `mov_id` de la OT; devuelve los `mov_id` que no encontró. `reales = {operario, pasos_cumplidos, comentario, por_lote: [{destino_real, litros_reales, merma}]}` (mismo orden que `ot.lotes`).
  - `sinEscanear(ot, porLote: Record<string, BarrilOT[]>): Array<{lote, num}>` — barriles de la foto que en `porLote[lote]` siguen con `estado === 'LLENO'`.
  - `otDeMovimiento(ordenes: OT[], mov): OT | null`.
- En `ot-movimientos.js`: `proximoNumeroOT(movimientos, anio, ordenes = [])` también considera `ordenes[].ot`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `test/lotes-ot-armado.test.mjs`:

```js
/* Lógica de las OT de trasiego. Es la parte que decide qué movimientos quedan
 * registrados en Lotes (y por lo tanto etapas y linaje), así que se prueba
 * sin pantalla. */
import { describe, it, expect } from 'vitest';
import { litrosPrevistos, resumenVasijas, armarOT, movimientosDeOT,
         confirmarOT, sinEscanear, otDeMovimiento } from '../public/lotes/js/ot-armado.js';
import { proximoNumeroOT } from '../public/lotes/js/ot-movimientos.js';

const barril = (num, cap = 225, estado = 'LLENO') =>
  ({ num, estado, cap, litros: cap, anio: '2022', marca: 'TARANSAUD', origen: 'FRANCES', trat: 'M' });

const CINCO = ['1', '2', '3', '4', '5'].map((n) => barril('22217' + n));

function otDe(lotes, extra = {}) {
  return armarOT({
    id: 'ot-x', numero: 'OT-2026-014', plantilla: 'barricas-tanque', fecha: '2026-09-24',
    destino: 'T 201', emitio: 'Agustín', lotes, mapaVersion: 2304, usuario: 'ana', hoy: '2026-09-23',
    ...extra,
  });
}

describe('litrosPrevistos', () => {
  it('suma capacidades e ignora las que no son numero', () => {
    expect(litrosPrevistos([barril('a', 225), barril('b', 225), barril('c', null)])).toBe(450);
    expect(litrosPrevistos([])).toBe(0);
  });
});

describe('resumenVasijas', () => {
  it('una barrica lleva su numero', () => {
    expect(resumenVasijas({ barriles: [barril('2221713')] })).toBe('1 barrica 2221713');
  });
  it('varias barricas se cuentan', () => {
    expect(resumenVasijas({ barriles: CINCO })).toBe('5 barricas');
  });
  it('si hay algo mas grande que una barrica dice vasijas', () => {
    expect(resumenVasijas({ barriles: [barril('a'), barril('451', 500)] })).toBe('2 vasijas');
  });
  it('sin barriles usa lo cargado a mano', () => {
    expect(resumenVasijas({ barriles: [], vasijas_manual: '1 x t500' })).toBe('1 x t500');
  });
});

describe('armarOT', () => {
  it('un lote con cinco barricas', () => {
    const ot = otDe([{ lote: '26217', id_texto: 'CS VSC Ct.3 Clon 169', organico: false, barriles: CINCO }]);
    expect(ot).toMatchObject({
      id: 'ot-x', ot: 'OT-2026-014', plantilla: 'barricas-tanque', estado: 'pendiente',
      destino: 'T 201', emitio: 'Agustín', mapa_version: 2304, emitida_por: 'ana', emitida_el: '2026-09-23',
    });
    expect(ot.lotes[0]).toMatchObject({ lote: '26217', litros_previstos: 1125, mov_id: 'ot-x-0',
      destino_real: '', litros_reales: null, merma: null });
    expect(ot.lotes[0].barriles).toHaveLength(5);
  });

  it('un corte con tres lotes al mismo tanque', () => {
    const ot = otDe([
      { lote: '25315', barriles: CINCO },
      { lote: '25324', barriles: [barril('9')] },
      { lote: '25312', barriles: [], vasijas_manual: '1 x T50', litros_previstos: 50 },
    ]);
    expect(ot.lotes.map((l) => l.mov_id)).toEqual(['ot-x-0', 'ot-x-1', 'ot-x-2']);
    expect(ot.lotes.map((l) => l.litros_previstos)).toEqual([1125, 225, 50]);
  });

  it('la foto de barriles es una copia: cambiar el origen no cambia la OT', () => {
    const b = [barril('1')];
    const ot = otDe([{ lote: '1', barriles: b }]);
    b[0].estado = 'VACIO';
    expect(ot.lotes[0].barriles[0].estado).toBe('LLENO');
  });
});

describe('movimientosDeOT', () => {
  it('un movimiento pendiente por lote, colgado de la OT', () => {
    const ot = otDe([{ lote: '26217', barriles: CINCO }, { lote: '26218', barriles: [barril('7')] }]);
    const movs = movimientosDeOT(ot, 'ana', '2026-09-23');
    expect(movs).toHaveLength(2);
    expect(movs[0]).toMatchObject({
      id: 'ot-x-0', lote: '26217', tipo: 'trasiego', fecha: '2026-09-24', estado: 'pendiente',
      vasija_origen: '5 barricas', vasija_destino: 'T 201', litros: 1125, ot: 'OT-2026-014',
      lote_destino: '', destino_externo: '', operario: '', cargado_por: 'ana', cargado_el: '2026-09-23',
    });
    expect(movs[1].vasija_origen).toBe('1 barrica 7');
  });
});

describe('confirmarOT', () => {
  it('pisa previstos con reales y pasa todo a ejecutado', () => {
    const ot = otDe([{ lote: '26217', barriles: CINCO }, { lote: '26218', barriles: [barril('7')] }]);
    const movs = movimientosDeOT(ot, 'ana', '2026-09-23');
    const faltan = confirmarOT(ot, movs, {
      operario: 'Enzo', pasos_cumplidos: true, comentario: 'ok',
      por_lote: [{ destino_real: 'T 199', litros_reales: 1100, merma: 25 },
                 { destino_real: '', litros_reales: 220, merma: null }],
    }, 'ana', '2026-09-25');
    expect(faltan).toEqual([]);
    expect(ot).toMatchObject({ estado: 'ejecutado', operario: 'Enzo', pasos_cumplidos: true,
      confirmada_por: 'ana', confirmada_el: '2026-09-25' });
    expect(ot.lotes[0]).toMatchObject({ destino_real: 'T 199', litros_reales: 1100, merma: 25 });
    expect(movs[0]).toMatchObject({ estado: 'ejecutado', litros: 1100, vasija_destino: 'T 199', operario: 'Enzo' });
    // destino real vacío = se usó el previsto
    expect(movs[1].vasija_destino).toBe('T 201');
    expect(movs[1].litros).toBe(220);
  });

  it('avisa los movimientos que ya no estan (alguien los borro de la grilla)', () => {
    const ot = otDe([{ lote: '26217', barriles: CINCO }]);
    const faltan = confirmarOT(ot, [], { operario: 'Enzo', pasos_cumplidos: false, comentario: '',
      por_lote: [{ destino_real: '', litros_reales: 1000, merma: 0 }] }, 'ana', '2026-09-25');
    expect(faltan).toEqual(['ot-x-0']);
    expect(ot.estado).toBe('ejecutado');
  });
});

describe('sinEscanear', () => {
  const ot = otDe([{ lote: '26217', barriles: [barril('1'), barril('2'), barril('3')] }]);
  it('marca los que siguen LLENOS con el mismo lote', () => {
    const ahora = { '26217': [barril('1', 225, 'VACIO'), barril('2', 225, 'LLENO')] };
    // el 3 ya no figura con este lote: se escaneó y se reasignó, no es aviso
    expect(sinEscanear(ot, ahora)).toEqual([{ lote: '26217', num: '2' }]);
  });
  it('sin datos del mapa no avisa nada', () => {
    expect(sinEscanear(ot, {})).toEqual([]);
  });
});

describe('otDeMovimiento', () => {
  it('encuentra la OT por mov_id y null para un movimiento suelto', () => {
    const ot = otDe([{ lote: '26217', barriles: CINCO }]);
    expect(otDeMovimiento([ot], { id: 'ot-x-0' })).toBe(ot);
    expect(otDeMovimiento([ot], { id: 'mov-viejo' })).toBeNull();
    expect(otDeMovimiento(undefined, { id: 'ot-x-0' })).toBeNull();
  });
});

describe('proximoNumeroOT con ordenes', () => {
  it('mira tambien los numeros de las OT', () => {
    expect(proximoNumeroOT([{ ot: 'OT-2026-003' }], 2026, [{ ot: 'OT-2026-010' }])).toBe('OT-2026-011');
    expect(proximoNumeroOT([{ ot: 'OT-2026-003' }], 2026)).toBe('OT-2026-004');
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run test/lotes-ot-armado.test.mjs`
Expected: FAIL, módulo `ot-armado.js` no encontrado.

- [ ] **Step 3: Extender `proximoNumeroOT`**

En `public/lotes/js/ot-movimientos.js`, reemplazar la función:

```js
/* Siguiente numero de OT libre para el anio, con formato OT-<anio>-<NNN>.
 * (… conservar el comentario existente …)
 *
 * `ordenes` son las OT de trasiego (DATOS().ordenes_trabajo): comparten
 * numeracion con los movimientos sueltos, asi que se miran las dos listas. */
export function proximoNumeroOT(movimientos, anio, ordenes = []){
  const prefijo = `OT-${anio}-`;
  let max = 0;
  for (const m of [...(movimientos || []), ...(ordenes || [])]){
    const ot = String((m || {}).ot ?? '').trim();
    if (!ot.startsWith(prefijo)) continue;
    const n = parseInt(ot.slice(prefijo.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return prefijo + String(max + 1).padStart(3, '0');
}
```

- [ ] **Step 4: Implementar `ot-armado.js`**

```js
/* ===== Lotes CIW — armado y confirmacion de las OT de trasiego (puro) =====
 *
 * Una OT agrupa uno o mas lotes que van al mismo destino. Genera UN movimiento
 * por lote, porque etapas y linaje leen movimientos por lote y no saben nada de
 * OT: asi un corte de tres lotes queda en el historial de cada uno.
 *
 * Los barriles se guardan como FOTO al emitir: la hoja impresa tiene que
 * coincidir con el sistema aunque el Mapa cambie despues (y va a cambiar apenas
 * el operario escanee el vaciado). */
'use strict';

import { PENDIENTE, EJECUTADO } from './ot-movimientos.js';

const numOk = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;

export function litrosPrevistos(barriles){
  return (barriles || []).reduce((s, b) => s + (numOk(b && b.cap) ?? 0), 0);
}

// 300 L separa barrica (225/228) de tanques chicos (t500) en el inventario.
const CAP_BARRICA = 300;

export function resumenVasijas(l){
  const bs = (l && l.barriles) || [];
  if (!bs.length) return String((l && l.vasijas_manual) || '');
  if (bs.length === 1) return `1 barrica ${bs[0].num}`;
  const todasBarricas = bs.every(b => (numOk(b.cap) ?? 0) <= CAP_BARRICA);
  return `${bs.length} ${todasBarricas ? 'barricas' : 'vasijas'}`;
}

export function armarOT({ id, numero, plantilla, fecha, destino, emitio, lotes, mapaVersion, usuario, hoy }){
  return {
    id, ot: numero, plantilla, fecha,
    estado: PENDIENTE,
    destino: String(destino || '').trim(),
    emitio: String(emitio || '').trim(),
    lotes: (lotes || []).map((l, i) => {
      const barriles = (l.barriles || []).map(b => ({ ...b }));
      return {
        lote: String(l.lote),
        id_texto: l.id_texto || '',
        organico: !!l.organico,
        barriles,
        vasijas_manual: l.vasijas_manual || '',
        litros_previstos: l.litros_previstos ?? litrosPrevistos(barriles),
        destino_real: '', litros_reales: null, merma: null,
        mov_id: `${id}-${i}`,
      };
    }),
    pasos_cumplidos: false,
    operario: '', comentario: '',
    emitida_por: usuario || '', emitida_el: hoy,
    confirmada_por: '', confirmada_el: '',
    mapa_version: mapaVersion ?? null,
  };
}

export function movimientosDeOT(ot, usuario, hoy){
  return ot.lotes.map(l => ({
    id: l.mov_id,
    lote: l.lote,
    tipo: 'trasiego',
    fecha: ot.fecha,
    vasija_origen: resumenVasijas(l),
    vasija_destino: ot.destino,
    litros: l.litros_previstos,
    lote_destino: '', destino_externo: '',
    estado: PENDIENTE,
    ot: ot.ot,
    operario: '', comentario: '',
    cargado_por: usuario || '', cargado_el: hoy,
  }));
}

export function confirmarOT(ot, movimientos, reales, usuario, hoy){
  const porId = new Map((movimientos || []).map(m => [m.id, m]));
  const faltan = [];
  ot.lotes.forEach((l, i) => {
    const r = (reales.por_lote || [])[i] || {};
    l.destino_real = String(r.destino_real || '').trim();
    l.litros_reales = r.litros_reales ?? null;
    l.merma = r.merma ?? null;
    const m = porId.get(l.mov_id);
    if (!m){ faltan.push(l.mov_id); return; }
    // Los reales PISAN a los previstos: desde aca el movimiento es el registro
    // de lo que paso, y recien ahora cuenta para etapas y linaje.
    m.vasija_destino = l.destino_real || ot.destino;
    m.litros = l.litros_reales;
    m.operario = reales.operario;
    m.estado = EJECUTADO;
  });
  ot.estado = EJECUTADO;
  ot.operario = reales.operario;
  ot.pasos_cumplidos = !!reales.pasos_cumplidos;
  ot.comentario = String(reales.comentario || '').trim();
  ot.confirmada_por = usuario || '';
  ot.confirmada_el = hoy;
  return faltan;
}

export function sinEscanear(ot, porLote){
  const out = [];
  for (const l of ot.lotes){
    const llenos = new Set(((porLote || {})[l.lote] || [])
      .filter(b => b.estado === 'LLENO').map(b => String(b.num)));
    for (const b of l.barriles){
      if (llenos.has(String(b.num))) out.push({ lote: l.lote, num: String(b.num) });
    }
  }
  return out;
}

export function otDeMovimiento(ordenes, mov){
  const id = mov && mov.id;
  if (!id) return null;
  return (ordenes || []).find(o => (o.lotes || []).some(l => l.mov_id === id)) || null;
}
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `npx vitest run test/lotes-ot-armado.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/lotes/js/ot-armado.js public/lotes/js/ot-movimientos.js test/lotes-ot-armado.test.mjs
git commit -m "feat(lotes): logica pura de las OT de trasiego (armar, confirmar, sin escanear)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: HTML de las tres hojas (OT, Planilla de barriles, Rótulos)

**Files:**
- Create: `public/lotes/js/ot-hojas.js`
- Test: `test/lotes-ot-hojas.test.mjs`

**Interfaces:**
- Consumes: `hojaTop`, `hojaMeta`, `hojaBanda`, `hojaPie` de `orden-hoja.js` (importa `nucleo.js`); `plantillaPorId`, `COLS_VACIADO` de `ot-plantillas.js`; `resumenVasijas` de `ot-armado.js`; `fmtFecha` de `fechas.js`.
- Produces:
  - `export const FILAS_PLANILLA = 19`
  - `export function hojaOT(ot): string` — un `<div class="orden-hoja ot-trasiego">`.
  - `export function hojasPlanilla(ot): string` — una o más `.orden-hoja`, `FILAS_PLANILLA` barriles por hoja.
  - `export function hojaRotulos(ot): string` — una `.orden-hoja` con `.ot-rotulo` por barril (o por lote si no tiene barriles).
  - `export function hojasOT(ot, opciones = {ot:true, planilla:true, rotulos:true}): string`

- [ ] **Step 1: Verificar que `fechas.js` no toca el DOM**

Run: `grep -n "^import\|window\|document" public/lotes/js/fechas.js`
Expected: sin `window`/`document` a nivel de módulo. Si importa `nucleo.js`, está cubierto por el stub del test.

- [ ] **Step 2: Escribir los tests que fallan**

Crear `test/lotes-ot-hojas.test.mjs`:

```js
/* Las hojas son strings de HTML, así que se prueban sin DOM. orden-hoja.js
 * importa nucleo.js, que engancha un beforeunload al cargar: por eso el stub de
 * window ANTES del import dinámico. */
import { describe, it, expect, beforeAll } from 'vitest';

let H, armarOT;
beforeAll(async () => {
  globalThis.window ??= { addEventListener(){} };
  H = await import('../public/lotes/js/ot-hojas.js');
  ({ armarOT } = await import('../public/lotes/js/ot-armado.js'));
});

const barril = (num) => ({ num, estado: 'LLENO', cap: 225, litros: 225, anio: '2022',
  marca: 'TARANSAUD', origen: 'FRANCES', trat: 'REF.101 M' });

function ot(lotes, plantilla = 'barricas-barricas', destino = '') {
  return armarOT({ id: 'ot-x', numero: 'OT-2026-014', plantilla, fecha: '2026-09-24', destino,
    emitio: 'Agustín', lotes, mapaVersion: 1, usuario: 'ana', hoy: '2026-09-23' });
}

const cuenta = (html, s) => html.split(s).length - 1;

describe('hojaOT', () => {
  it('lleva numero, fecha, lote con descripcion y los pasos de la plantilla', () => {
    const h = H.hojaOT(ot([{ lote: '26217', id_texto: 'CS VSC Ct.3 Clon 169', barriles: [barril('2221713')] }]));
    expect(h).toContain('OT-2026-014');
    expect(h).toContain('24/09/2026');
    expect(h).toContain('CS VSC Ct.3 Clon 169');
    expect(h).toContain('Sanitizar clapets antes de comenzar trasiego.');
    expect(h).toContain('1 barrica 2221713');
    expect(h).toContain('Agustín');
  });

  it('sin destino deja la linea para completar a mano', () => {
    expect(H.hojaOT(ot([{ lote: '1', barriles: [barril('a')] }]))).toContain('Tanque pulmón: ________');
  });

  it('con destino lo imprime', () => {
    expect(H.hojaOT(ot([{ lote: '1', barriles: [barril('a')] }], 'barricas-tanque', 'T 201'))).toContain('T 201');
  });

  it('un corte: una fila de vaciado por lote y el total de litros', () => {
    const h = H.hojaOT(ot([{ lote: '25315', barriles: [barril('a'), barril('b')] },
                          { lote: '25324', barriles: [barril('c')] }], 'barricas-tanque', 'T 201'));
    expect(h).toContain('25315');
    expect(h).toContain('25324');
    expect(h).toMatch(/Total[\s\S]*675/);
    expect(h).toContain('Litros caudalímetro');
  });

  it('correcciones: TH2 y SO2 por lote', () => {
    const h = H.hojaOT(ot([{ lote: '1', barriles: [barril('a')] }, { lote: '2', barriles: [barril('b')] }]));
    expect(cuenta(h, '>TH2<')).toBe(2);
    expect(cuenta(h, '>SO2<')).toBe(2);
  });

  it('resalta la cinta solo si hay un lote organico', () => {
    const conv = H.hojaOT(ot([{ lote: '1', organico: false, barriles: [barril('a')] }]));
    const org = H.hojaOT(ot([{ lote: '1', organico: true, barriles: [barril('a')] }]));
    expect(conv).not.toContain('ot-destaca');
    expect(org).toContain('ot-destaca');
  });

  it('escapa el texto que viene de los datos', () => {
    expect(H.hojaOT(ot([{ lote: '1', id_texto: '<b>x</b>', barriles: [] }]))).toContain('&lt;b&gt;x');
  });
});

describe('hojasPlanilla', () => {
  it('vaciado con los datos de cada barril y llenado en blanco', () => {
    const h = H.hojasPlanilla(ot([{ lote: '26217', barriles: [barril('2221713')] }]));
    expect(h).toContain('PLANILLA DE MOVIMIENTO DE BARRILES');
    for (const t of ['2221713', 'TARANSAUD', 'FRANCES', 'REF.101 M', '2022']) expect(h).toContain(t);
    expect(h).toContain('Vaciado');
    expect(h).toContain('Llenado');
  });

  it('pasa a otra hoja despues de 19 barriles', () => {
    const muchos = Array.from({ length: 25 }, (_, i) => barril(String(1000 + i)));
    const h = H.hojasPlanilla(ot([{ lote: '1', barriles: muchos }]));
    expect(cuenta(h, 'class="orden-hoja')).toBe(2);
    expect(h).toContain('1024');
  });

  it('sin barriles igual sale una hoja con filas en blanco', () => {
    expect(cuenta(H.hojasPlanilla(ot([{ lote: '1', barriles: [], vasijas_manual: 'T 113' }])), 'class="orden-hoja')).toBe(1);
  });
});

describe('hojaRotulos', () => {
  it('un rotulo por barril, numerado', () => {
    const h = H.hojaRotulos(ot([{ lote: '26217', id_texto: 'CS VSC', barriles: [barril('a'), barril('b'), barril('c')] }]));
    expect(cuenta(h, 'class="ot-rotulo"')).toBe(3);
    expect(h).toContain('>3<');
  });
  it('un lote sin barriles lleva un rotulo', () => {
    expect(cuenta(H.hojaRotulos(ot([{ lote: '1', barriles: [] }])), 'class="ot-rotulo"')).toBe(1);
  });
});

describe('hojasOT', () => {
  it('respeta las hojas elegidas', () => {
    const o = ot([{ lote: '1', barriles: [barril('a')] }]);
    const solo = H.hojasOT(o, { ot: true, planilla: false, rotulos: false });
    expect(solo).not.toContain('PLANILLA DE MOVIMIENTO');
    expect(solo).not.toContain('ot-rotulo');
    const todas = H.hojasOT(o);
    expect(todas).toContain('PLANILLA DE MOVIMIENTO');
    expect(todas).toContain('ot-rotulo');
  });
});
```

- [ ] **Step 3: Correr y verificar que fallan**

Run: `npx vitest run test/lotes-ot-hojas.test.mjs`
Expected: FAIL, módulo `ot-hojas.js` no encontrado.

- [ ] **Step 4: Implementar**

Crear `public/lotes/js/ot-hojas.js`:

```js
/* ===== Lotes CIW — las tres hojas de papel de una OT de trasiego =====
 *
 * Devuelve strings de HTML (sin tocar el DOM) para poder testearlas. Reusa el
 * encabezado y las firmas de orden-hoja.js: es el mismo documento de calidad
 * RCI 08, y una segunda copia del encabezado se desincroniza en el primer
 * cambio de formulario.
 *
 * Las casillas de "Check" salen VACÍAS: las tilda el operario en el papel, que
 * sigue siendo el registro de calidad. El sistema solo guarda los totales. */
'use strict';

import { esc } from './nucleo.js';
import { hojaTop, hojaMeta, hojaBanda, hojaPie } from './orden-hoja.js';
import { plantillaPorId, COLS_VACIADO } from './ot-plantillas.js';
import { resumenVasijas } from './ot-armado.js';
import { fmtFecha } from './fechas.js';

// Lo que entra en una A4 con los dos bloques (vaciado + llenado), igual que la
// hoja "Barriles" del Excel.
export const FILAS_PLANILLA = 19;

const CHECK = '<td class="ot-check">☐</td>';
const fmtL = v => (v === null || v === undefined || v === '') ? '' : String(v);

function meta(ot){
  const f = String(ot.fecha || '');
  return hojaMeta({ fechaTxt: fmtFecha(f), anio: f.slice(0, 4), nro: ot.ot });
}

function lineaDestino(ot){
  return ot.destino ? esc(ot.destino) : 'Tanque pulmón: ________';
}

function tablaVaciado(ot, columnas){
  const celda = (l, c) => {
    switch (c){
      case 'lote':    return esc(l.lote);
      case 'vasijas': return esc(resumenVasijas(l));
      case 'litros':  return esc(fmtL(l.litros_previstos));
      case 'destino': return lineaDestino(ot);
      default:        return ''; // caudalimetro y merma: los anota el operario
    }
  };
  const head = '<th>Check</th>' + columnas.map(c => `<th>${esc(COLS_VACIADO[c])}</th>`).join('');
  const filas = ot.lotes.map(l =>
    '<tr>' + CHECK + columnas.map(c => `<td>${celda(l, c)}</td>`).join('') + '</tr>').join('');
  const total = ot.lotes.reduce((s, l) => s + (Number(l.litros_previstos) || 0), 0);
  const iLitros = columnas.indexOf('litros');
  const pie = ot.lotes.length > 1 && iLitros >= 0
    ? '<tr class="ot-total"><td></td>' + columnas.map((c, i) =>
        `<td>${i === 0 ? 'Total' : i === iLitros ? total : ''}</td>`).join('') + '</tr>'
    : '';
  const ids = ot.lotes.filter(l => l.id_texto).map(l => `<div><b>ID ${esc(l.lote)}:</b> ${esc(l.id_texto)}</div>`).join('');
  return `<div class="ot-ids">${ids}</div><table class="ot-tabla"><thead><tr>${head}</tr></thead><tbody>${filas}${pie}</tbody></table>`;
}

function tablaCorreccion(ot){
  const filas = ot.lotes.flatMap(l => ['TH2', 'SO2'].map(prod =>
    `<tr>${CHECK}<td>${esc(l.lote)}</td><td>1</td><td>T_______</td><td>${prod}</td><td></td><td></td></tr>`)).join('');
  return '<div class="ot-subt">Corrección</div><table class="ot-tabla"><thead><tr><th>Check</th><th>CIW lote</th>' +
    '<th>Cantidad de vasijas</th><th>Vasijas</th><th>Producto</th><th>Cantidad</th><th>Tipo</th></tr></thead>' +
    `<tbody>${filas}</tbody></table>`;
}

function tablaLlenado(ot){
  const filas = ot.lotes.map(l =>
    `<tr>${CHECK}<td>${esc(l.lote)}</td><td>${lineaDestino(ot)}</td><td></td><td>Barricas</td><td></td></tr>`).join('');
  return '<table class="ot-tabla"><thead><tr><th>Check</th><th>CIW lote</th><th>Vasija</th><th>Litros</th>' +
    `<th>Destino</th><th>Dar lleno con</th></tr></thead><tbody>${filas}</tbody></table>`;
}

function rotular(ot){
  const txt = ot.lotes.map(l => `${esc(l.lote)} ${esc(l.id_texto || '')}`).join(' · ');
  return `<div class="ot-paso"><span class="ot-caja">☐</span>Rotular vasija ID. <b>${txt}</b></div>`;
}

export function hojaOT(ot){
  const pl = plantillaPorId(ot.plantilla);
  const hayOrganico = ot.lotes.some(l => l.organico);
  const cuerpo = (pl ? pl.bloques : []).map(b => {
    switch (b.tipo){
      case 'paso': {
        const dest = b.destaca === 'organico' && hayOrganico ? ' ot-destaca' : '';
        const ok = b.ok ? '<span class="ot-ok">OK ☐</span>' : '';
        return `<div class="ot-paso${dest}"><span class="ot-caja">☐</span>${esc(b.texto)}${ok}</div>`;
      }
      case 'dato':             return `<div class="ot-dato">${esc(b.texto)} <span class="ot-linea"></span></div>`;
      case 'tabla-vaciado':    return tablaVaciado(ot, b.columnas);
      case 'rotular':          return rotular(ot);
      case 'tabla-correccion': return tablaCorreccion(ot);
      case 'tabla-llenado':    return tablaLlenado(ot);
      default:                 return '';
    }
  }).join('');
  const lotesTxt = ot.lotes.map(l => l.lote).join(' · ');
  return `<div class="orden-hoja ot-trasiego">${hojaTop()}
  <div class="oh-titulo">Orden de Trabajo</div>
  ${meta(ot)}
  ${hojaBanda([...(pl ? pl.banda : ['TRASIEGO', '']), lotesTxt])}
  ${cuerpo}
  ${hojaPie(ot.emitio, '')}
</div>`;
}

function trozos(arr, n){
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out.length ? out : [[]];
}

export function hojasPlanilla(ot){
  const filas = ot.lotes.flatMap(l => l.barriles.map(b => ({ lote: l.lote, ...b })));
  const top = `<div class="oh-top"><span class="oh-empresa">BODEGAS ESMERALDA S.A.</span>` +
    `<span>PLANILLA DE MOVIMIENTO DE BARRILES - PCI 00 RCI 00 - Rev00 &nbsp;·&nbsp; Aprobado por: Roy Urvieta &nbsp;·&nbsp; Emisión: 1/7/2020</span></div>`;
  const head = '<tr><th>N°</th><th>Lote</th><th>N° barril</th><th>Capac</th><th>Año</th><th>Proveedor</th><th>Origen</th><th>Tratamiento</th></tr>';
  const lotesTxt = ot.lotes.map(l => l.lote).join(' · ');
  return trozos(filas, FILAS_PLANILLA).map((pag, ip) => {
    const base = ip * FILAS_PLANILLA;
    const vac = Array.from({ length: FILAS_PLANILLA }, (_, i) => {
      const b = pag[i];
      return b
        ? `<tr><td>${base + i + 1}</td><td>${esc(b.lote)}</td><td>${esc(b.num)}</td><td>${esc(fmtL(b.cap))}</td>` +
          `<td>${esc(b.anio)}</td><td>${esc(b.marca)}</td><td>${esc(b.origen)}</td><td>${esc(b.trat)}</td></tr>`
        : `<tr><td>${base + i + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
    }).join('');
    const lle = Array.from({ length: FILAS_PLANILLA }, (_, i) =>
      `<tr><td>${base + i + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('');
    return `<div class="orden-hoja ot-planilla">${top}
  ${meta(ot)}
  <div class="oh-banda"><span>Lote ID: ${esc(lotesTxt)}</span><span>Condición: Vaciado</span></div>
  <table class="ot-tabla ot-chica"><thead>${head}</thead><tbody>${vac}</tbody></table>
  <div class="oh-banda"><span>Lote ID:</span><span>Condición: Llenado</span></div>
  <table class="ot-tabla ot-chica"><thead>${head}</thead><tbody>${lle}</tbody></table>
  <div class="oh-pie"><div class="firma"><b>Responsable:</b> Firma:</div></div>
</div>`;
  }).join('');
}

export function hojaRotulos(ot){
  const rotulos = ot.lotes.flatMap(l => {
    const n = Math.max(l.barriles.length, 1);
    return Array.from({ length: n }, (_, i) =>
      `<div class="ot-rotulo"><div class="ot-rot-lote">${esc(l.lote)}</div>` +
      `<div class="ot-rot-id">${esc(l.id_texto || '')}</div><div class="ot-rot-n">${i + 1}</div></div>`);
  }).join('');
  return `<div class="orden-hoja ot-rotulos">${rotulos}</div>`;
}

export function hojasOT(ot, opciones){
  const o = { ot: true, planilla: true, rotulos: true, ...(opciones || {}) };
  return (o.ot ? hojaOT(ot) : '') + (o.planilla ? hojasPlanilla(ot) : '') + (o.rotulos ? hojaRotulos(ot) : '');
}
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `npx vitest run test/lotes-ot-hojas.test.mjs`
Expected: PASS. Si falla el test de fecha, mirar qué devuelve `fmtFecha('2026-09-24')` (`grep -n "export function fmtFecha" -A10 public/lotes/js/fechas.js`) y ajustar el valor esperado al formato real dd/mm/aaaa.

- [ ] **Step 6: Commit**

```bash
git add public/lotes/js/ot-hojas.js test/lotes-ot-hojas.test.mjs
git commit -m "feat(lotes): hojas de papel de la OT de trasiego (OT, planilla de barriles, rotulos)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Modal Emitir OT + impresión

**Files:**
- Create: `public/lotes/js/vista-ot-emitir.js`
- Modify: `public/lotes/js/vista-movimientos.js` (import y handler de `btnEmitirOT`)
- Modify: `public/lotes/index.html` (CSS de pantalla + impresión, junto al bloque `printing-ot-mov`, líneas ~601-609)

**Interfaces:**
- Consumes: `armarOT`, `movimientosDeOT`, `litrosPrevistos` (`ot-armado.js`); `PLANTILLAS_OT` (`ot-plantillas.js`); `hojasOT` (`ot-hojas.js`); `proximoNumeroOT` (`ot-movimientos.js`); `esOrganico` (`envases.js`); de `nucleo.js`: `$, esc, escA, num, DATOS, markDirty, guardar, usuarioActual, mostrarOverlay, cerrarOverlay`; global `API`; `GET API+'/barriles?lotes='` (Task 2).
- Produces:
  - `export function abrirEmitirOT(onListo: () => void): void`
  - `export function abrirImprimirOT(ot): void` — modal con 3 checkboxes y botón Imprimir.
  - `export function imprimirOT(ot, opciones): void`

Es código de DOM: no hay test unitario (no hay DOM en vitest). Se verifica en Task 8 en el navegador.

- [ ] **Step 1: Crear `vista-ot-emitir.js`**

```js
/* ===== Lotes CIW — emitir una OT de trasiego =====
 *
 * Arma la OT con la plantilla, los lotes (descripción y orgánico de Lotes) y
 * sus barriles (del Mapa de Barriles, solo lectura). Guarda ANTES de ofrecer
 * imprimir: el papel sale a la bodega y no puede existir un número de OT que
 * el servidor no conozca. */
'use strict';

import { $, esc, escA, num, DATOS, markDirty, guardar, usuarioActual,
         mostrarOverlay, cerrarOverlay } from './nucleo.js';
import { armarOT, movimientosDeOT, litrosPrevistos } from './ot-armado.js';
import { PLANTILLAS_OT } from './ot-plantillas.js';
import { hojasOT } from './ot-hojas.js';
import { proximoNumeroOT } from './ot-movimientos.js';
import { esOrganico } from './envases.js';

/* Estado del modal abierto: una entrada por lote agregado. */
let _lotes = [];      // [{lote, id_texto, organico, barriles:[...], tildados:Set<num>, vasijas_manual, litros}]
let _mapaVersion = null;
let _mapaCaido = false;

async function _traerBarriles(lote){
  try {
    const r = await fetch(API + '/barriles?lotes=' + encodeURIComponent(lote));
    if (!r.ok){ _mapaCaido = true; return []; }
    const d = await r.json();
    _mapaVersion = d.version ?? _mapaVersion;
    return (d.por_lote && d.por_lote[lote]) || [];
  } catch (e){
    _mapaCaido = true;
    return [];
  }
}

function _pintarLotes(){
  const cont = $('otePorLote');
  if (!cont) return;
  cont.innerHTML = _lotes.map((l, i) => {
    const avisos = [];
    if (!l.enLotes) avisos.push('⚠ No está en la lista de lotes.');
    const vacios = l.barriles.filter(b => b.estado !== 'LLENO').length;
    if (vacios) avisos.push(`⚠ ${vacios} barril(es) figuran VACÍOS en el Mapa.`);
    const lista = l.barriles.length
      ? l.barriles.map(b => `<label class="ote-barril"><input type="checkbox" data-lote="${i}" data-num="${escA(b.num)}"` +
          `${l.tildados.has(b.num) ? ' checked' : ''}> ${esc(b.num)} · ${esc(b.cap ?? '')} L · ${esc(b.marca)} ${esc(b.anio)} ` +
          `<span class="muted">${esc(b.estado)}</span></label>`).join('')
      : `<label>Vasijas (sin barriles en el Mapa)</label> <input class="txt" data-manual="${i}" value="${escA(l.vasijas_manual)}" placeholder="p. ej. 1 x t500">`;
    return `<div class="card ote-lote">
  <div><b>${esc(l.lote)}</b> ${esc(l.id_texto)} ${l.organico ? '🟢 orgánico' : ''}
    <button class="rowbtn" data-quitar="${i}" title="Quitar lote">✕</button></div>
  ${avisos.map(a => `<div class="msg warn">${esc(a)}</div>`).join('')}
  <div class="ote-barriles">${lista}</div>
  <label>Litros previstos</label> <input class="txt" type="number" step="any" data-litros="${i}" value="${escA(l.litros ?? '')}">
</div>`;
  }).join('') + (_mapaCaido
    ? '<div class="msg warn">El Mapa de Barriles no respondió: cargá las vasijas a mano.</div>' : '');
}

async function _agregarLote(){
  const inp = $('oteLote');
  const lote = inp.value.trim();
  if (!lote) return;
  if (_lotes.some(l => l.lote === lote)){ inp.value = ''; return; }
  const ficha = (DATOS().lotes || []).find(l => String(l.lote) === lote);
  const barriles = await _traerBarriles(lote);
  const tildados = new Set(barriles.map(b => b.num));
  _lotes.push({
    lote, enLotes: !!ficha,
    id_texto: (ficha && ficha.id_texto) || '',
    organico: !!(ficha && esOrganico(ficha)),
    barriles, tildados, vasijas_manual: '',
    litros: litrosPrevistos(barriles) || null,
  });
  inp.value = '';
  _pintarLotes();
}

function _recalcularLitros(i){
  const l = _lotes[i];
  l.litros = litrosPrevistos(l.barriles.filter(b => l.tildados.has(b.num))) || null;
}

export function abrirEmitirOT(onListo){
  _lotes = []; _mapaVersion = null; _mapaCaido = false;
  const hoy = new Date().toISOString().slice(0, 10);
  const numero = proximoNumeroOT(DATOS().movimientos || [], Number(hoy.slice(0, 4)), DATOS().ordenes_trabajo || []);
  const opts = PLANTILLAS_OT.map(p => `<option value="${escA(p.id)}">${esc(p.nombre)}</option>`).join('');

  mostrarOverlay(`
<h3 style="margin:0 0 14px">➕ Emitir orden de trabajo de trasiego</h3>
<div style="display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center">
  <label>Plantilla</label><select class="txt" id="otePlantilla">${opts}</select>
  <label>N° de OT</label><input class="txt" id="oteNumero" value="${escA(numero)}">
  <label>Fecha</label><input class="txt" type="date" id="oteFecha" value="${escA(hoy)}">
  <label>Tanque destino</label><input class="txt" id="oteDestino" placeholder="vacío = 'Tanque pulmón: ____'">
  <label>Emitió</label><input class="txt" id="oteEmitio" value="${escA(usuarioActual())}">
  <label>Agregar lote</label><input class="txt" id="oteLote" placeholder="Número de lote y Enter">
</div>
<div id="otePorLote" style="margin-top:12px;max-height:50vh;overflow:auto"></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="oteCancelar">Cancelar</button>
  <button class="btn primary" id="oteEmitir">Emitir OT</button>
</div>`);

  $('oteLote').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); _agregarLote(); } });
  $('otePorLote').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.num !== undefined){
      const l = _lotes[+t.dataset.lote];
      if (t.checked) l.tildados.add(t.dataset.num); else l.tildados.delete(t.dataset.num);
      _recalcularLitros(+t.dataset.lote);
      _pintarLotes();
    } else if (t.dataset.manual !== undefined){
      _lotes[+t.dataset.manual].vasijas_manual = t.value.trim();
    } else if (t.dataset.litros !== undefined){
      _lotes[+t.dataset.litros].litros = num(t.value);
    }
  });
  $('otePorLote').addEventListener('click', e => {
    const b = e.target.closest('[data-quitar]');
    if (b){ _lotes.splice(+b.dataset.quitar, 1); _pintarLotes(); }
  });
  $('oteCancelar').addEventListener('click', () => cerrarOverlay());
  $('oteEmitir').addEventListener('click', () => _emitir(onListo));
}

async function _emitir(onListo){
  if (!_lotes.length){ alert('Agregá al menos un lote.'); return; }
  const fecha = $('oteFecha').value;
  if (!fecha){ alert('Falta la fecha.'); return; }
  const sinVasijas = _lotes.filter(l => !l.tildados.size && !l.vasijas_manual);
  if (sinVasijas.length){
    alert('El lote ' + sinVasijas[0].lote + ' no tiene barriles tildados ni vasijas cargadas.');
    return;
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const usuario = usuarioActual();
  const ot = armarOT({
    id: 'ot-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    numero: $('oteNumero').value.trim(),
    plantilla: $('otePlantilla').value,
    fecha,
    destino: $('oteDestino').value,
    emitio: $('oteEmitio').value,
    lotes: _lotes.map(l => ({
      lote: l.lote, id_texto: l.id_texto, organico: l.organico,
      barriles: l.barriles.filter(b => l.tildados.has(b.num)),
      vasijas_manual: l.vasijas_manual,
      litros_previstos: l.litros,
    })),
    mapaVersion: _mapaVersion, usuario, hoy,
  });

  const d = DATOS();
  if (!d.ordenes_trabajo) d.ordenes_trabajo = [];
  if (!d.movimientos) d.movimientos = [];
  d.ordenes_trabajo.unshift(ot);
  d.movimientos.unshift(...movimientosDeOT(ot, usuario, hoy));
  markDirty();
  cerrarOverlay();
  onListo();

  const ok = await guardar(false);
  if (!ok){
    alert('La OT quedó en pantalla pero NO se guardó, así que todavía no conviene imprimirla: '
        + 'resolvé el guardado y usá el botón 🖨 de la fila.');
    return;
  }
  abrirImprimirOT(ot);
}

export function abrirImprimirOT(ot){
  mostrarOverlay(`
<h3 style="margin:0 0 14px">🖨 Imprimir ${esc(ot.ot)}</h3>
<label><input type="checkbox" id="otiOT" checked> Orden de trabajo</label><br>
<label><input type="checkbox" id="otiPlanilla" checked> Planilla de movimiento de barriles</label><br>
<label><input type="checkbox" id="otiRotulos" checked> Rótulos</label>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="otiCancelar">Cerrar</button>
  <button class="btn primary" id="otiImprimir">Imprimir</button>
</div>`);
  $('otiCancelar').addEventListener('click', () => cerrarOverlay());
  $('otiImprimir').addEventListener('click', () => {
    const op = { ot: $('otiOT').checked, planilla: $('otiPlanilla').checked, rotulos: $('otiRotulos').checked };
    cerrarOverlay();
    imprimirOT(ot, op);
  });
}

/* Misma convención que la hoja genérica: #otMovHoja + clase en el body mientras
 * dura la impresión; el @media print hace el resto. */
export function imprimirOT(ot, opciones){
  const cont = $('otMovHoja');
  if (!cont) return;
  cont.innerHTML = hojasOT(ot, opciones);
  document.body.classList.add('printing-ot-mov');
  window.print();
  document.body.classList.remove('printing-ot-mov');
}
```

Si `.msg.warn` no existe en `index.html` (`grep -n "\.msg\." public/lotes/index.html`), usar la clase de aviso que sí exista (`msg err` se usa en `vista-orden-correccion.js`).

- [ ] **Step 2: Cablear el botón en `vista-movimientos.js`**

Sumar el import:

```js
import { abrirEmitirOT } from './vista-ot-emitir.js';
```

y reemplazar:

```js
  $('btnEmitirOT').addEventListener('click', () => _abrirModalOT(null));
```

por:

```js
  // Emitir usa el formato RCI 08 con plantillas y barriles del Mapa. El modal
  // viejo (_abrirModalOT) queda solo para CONFIRMAR movimientos sueltos que no
  // tienen una OT de trasiego detrás.
  $('btnEmitirOT').addEventListener('click', () => abrirEmitirOT(renderMovimientos));
```

- [ ] **Step 3: CSS en `index.html`**

Justo después de la línea `body.printing-ot-mov .orden-hoja{box-shadow:none;border-radius:0;max-width:none;padding:0}` (dentro del `@media print`), sumar:

```css
    /* OT de trasiego: varias hojas (OT, planilla, rotulos) en #otMovHoja. */
    #otMovHoja .orden-hoja + .orden-hoja{page-break-before:always;margin-top:0}
```

Y fuera del `@media print`, junto a las otras reglas `.orden-hoja` (~línea 543), sumar:

```css
  /* OT de trasiego (formato RCI 08 con pasos) */
  .orden-hoja .ot-paso{display:flex;gap:8px;align-items:baseline;font-size:13px;padding:3px 0;border-bottom:1px dotted #ccc}
  .orden-hoja .ot-paso .ot-ok{margin-left:auto;font-weight:700;white-space:nowrap}
  .orden-hoja .ot-caja{font-size:15px;line-height:1}
  .orden-hoja .ot-destaca{background:#e3f4e3;font-weight:700}
  .orden-hoja .ot-dato{font-size:13px;padding:6px 0}
  .orden-hoja .ot-linea{display:inline-block;min-width:180px;border-bottom:1px solid #111}
  .orden-hoja .ot-subt{font-weight:700;font-size:13px;margin-top:8px}
  .orden-hoja .ot-ids{font-size:13px;margin:8px 0 4px}
  .orden-hoja .ot-tabla{margin:4px 0 10px}
  .orden-hoja .ot-tabla th,.orden-hoja .ot-tabla td{border:1px solid #999;padding:3px 6px}
  .orden-hoja .ot-tabla .ot-check{width:36px;text-align:center}
  .orden-hoja .ot-total td{font-weight:700}
  .orden-hoja .ot-chica{font-size:11px}
  .orden-hoja.ot-rotulos{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .ot-rotulo{border:2px solid #111;padding:14px;position:relative;min-height:120px;page-break-inside:avoid}
  .ot-rot-lote{font-size:40px;font-weight:700}
  .ot-rot-id{font-size:16px}
  .ot-rot-n{position:absolute;top:8px;right:12px;font-size:22px;font-weight:700}
  .ote-lote{margin-bottom:8px}
  .ote-barriles{display:flex;flex-wrap:wrap;gap:4px 14px;margin:6px 0;font-size:13px}
```

- [ ] **Step 4: Chequeo de sintaxis y suite**

Run: `node --check public/lotes/js/vista-ot-emitir.js && node --check public/lotes/js/vista-movimientos.js && npm test`
Expected: sin errores de sintaxis; toda la suite en verde.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/vista-ot-emitir.js public/lotes/js/vista-movimientos.js public/lotes/index.html
git commit -m "feat(lotes): Emitir OT arma la orden RCI 08 con lotes y barriles del Mapa, e imprime las tres hojas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Confirmar la OT + aviso de barriles sin escanear; botones de la fila

**Files:**
- Create: `public/lotes/js/vista-ot-confirmar.js`
- Modify: `public/lotes/js/vista-movimientos.js` (handlers `data-confirmar` y `data-imprimirot`, ~líneas 340-352)

**Interfaces:**
- Consumes: `confirmarOT`, `sinEscanear`, `otDeMovimiento` (`ot-armado.js`); `abrirImprimirOT` (`vista-ot-emitir.js`); de `nucleo.js`: `$, esc, escA, num, DATOS, markDirty, usuarioActual, mostrarOverlay, cerrarOverlay`; `GET API+'/barriles?lotes='`.
- Produces: `export function abrirConfirmarOT(ot, onListo: () => void): void`

- [ ] **Step 1: Crear `vista-ot-confirmar.js`**

```js
/* ===== Lotes CIW — confirmar una OT de trasiego =====
 *
 * Se cargan solo los totales por lote (destino real, litros reales, merma):
 * los OK de cada paso quedan en el papel firmado. Después se mira el Mapa de
 * Barriles, solo para AVISAR: si un barril de la OT sigue LLENO con el mismo
 * lote, faltó escanearlo. La OT nunca escribe en el Mapa. */
'use strict';

import { $, esc, escA, num, DATOS, markDirty, usuarioActual,
         mostrarOverlay, cerrarOverlay } from './nucleo.js';
import { confirmarOT, sinEscanear } from './ot-armado.js';

export function abrirConfirmarOT(ot, onListo){
  const filas = ot.lotes.map((l, i) => `
<tr><td><b>${esc(l.lote)}</b><br><span class="muted">${esc(l.id_texto)}</span></td>
  <td>${esc(l.litros_previstos ?? '')}</td>
  <td><input class="txt" id="otcDest${i}" value="${escA(l.destino_real || ot.destino)}" placeholder="Tanque real"></td>
  <td><input class="txt" type="number" step="any" id="otcLit${i}" value="${escA(l.litros_reales ?? '')}"></td>
  <td><input class="txt" type="number" step="any" id="otcMer${i}" value="${escA(l.merma ?? '')}"></td></tr>`).join('');

  mostrarOverlay(`
<h3 style="margin:0 0 14px">✓ Confirmar ${esc(ot.ot)}</h3>
<table><thead><tr><th>Lote</th><th>Previstos</th><th>Destino real</th><th>Litros reales</th><th>Merma</th></tr></thead>
<tbody>${filas}</tbody></table>
<div style="display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center;margin-top:12px">
  <label>Operario</label><input class="txt" id="otcOperario" placeholder="Quién lo hizo…">
  <label>Pasos</label><label><input type="checkbox" id="otcPasos"> Todos los pasos de la hoja están cumplidos</label>
  <label>Comentario</label><input class="txt" id="otcComentario">
</div>
<div id="otcAviso"></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="otcCancelar">Cancelar</button>
  <button class="btn primary" id="otcAceptar">Confirmar</button>
</div>`);

  $('otcCancelar').addEventListener('click', () => cerrarOverlay());
  $('otcAceptar').addEventListener('click', () => _aceptar(ot, onListo));
}

async function _aceptar(ot, onListo){
  const operario = $('otcOperario').value.trim();
  if (!operario){ alert('Falta el operario: la confirmación registra quién hizo el trabajo.'); return; }
  const por_lote = ot.lotes.map((_, i) => ({
    destino_real: $('otcDest' + i).value,
    litros_reales: num($('otcLit' + i).value),
    merma: num($('otcMer' + i).value),
  }));
  if (por_lote.some(r => r.litros_reales == null) &&
      !confirm('Hay lotes sin litros reales. ¿Confirmar igual?')) return;

  const faltan = confirmarOT(ot, DATOS().movimientos || [], {
    operario, pasos_cumplidos: $('otcPasos').checked, comentario: $('otcComentario').value,
    por_lote,
  }, usuarioActual(), new Date().toISOString().slice(0, 10));
  markDirty();
  onListo();

  const avisos = [];
  if (faltan.length){
    avisos.push('Algunos movimientos de esta OT ya no están en la tabla (¿los borraron?). La OT quedó confirmada igual.');
  }
  try {
    const r = await fetch(API + '/barriles?lotes=' + encodeURIComponent(ot.lotes.map(l => l.lote).join(',')));
    if (r.ok){
      const d = await r.json();
      const pend = sinEscanear(ot, d.por_lote || {});
      if (pend.length){
        avisos.push('Estos barriles siguen LLENOS en el Mapa con el mismo lote. ¿Faltó escanear el vaciado? '
          + pend.map(p => `${p.lote}: ${p.num}`).join(', '));
      }
    } else {
      avisos.push('No se pudo consultar el Mapa de Barriles para revisar el escaneo.');
    }
  } catch (e){
    avisos.push('No se pudo consultar el Mapa de Barriles para revisar el escaneo.');
  }

  if (!avisos.length){ cerrarOverlay(); return; }
  mostrarOverlay(`<h3 style="margin:0 0 14px">✓ ${esc(ot.ot)} confirmada</h3>` +
    avisos.map(a => `<div class="msg warn">${esc(a)}</div>`).join('') +
    `<div style="margin-top:18px;text-align:right"><button class="btn primary" id="otcCerrar">Entendido</button></div>`);
  $('otcCerrar').addEventListener('click', () => cerrarOverlay());
}
```

Usar la misma clase de aviso que se eligió en Task 6 (`msg warn` o la existente).

- [ ] **Step 2: Cablear los botones de la fila en `vista-movimientos.js`**

Sumar imports:

```js
import { abrirImprimirOT } from './vista-ot-emitir.js';
import { abrirConfirmarOT } from './vista-ot-confirmar.js';
import { otDeMovimiento } from './ot-armado.js';
```

Reemplazar los dos bloques del listener de click de la tabla:

```js
      const bConf = e.target.closest('[data-confirmar]');
      if (bConf){
        const fila = t._rows[+bConf.dataset.confirmar];
        if (!fila) return;
        // Un movimiento que salió de una OT de trasiego se confirma con la OT
        // entera (todos sus lotes a la vez); uno suelto, con el modal de siempre.
        const ot = otDeMovimiento(DATOS().ordenes_trabajo, fila);
        if (ot) abrirConfirmarOT(ot, renderMovimientos); else _abrirModalOT(fila);
        return;
      }
      const bImp = e.target.closest('[data-imprimirot]');
      if (bImp){
        const fila = t._rows[+bImp.dataset.imprimirot];
        if (!fila) return;
        // Las OT anteriores a las plantillas no tienen entrada en
        // ordenes_trabajo: siguen saliendo con la hoja genérica.
        const ot = otDeMovimiento(DATOS().ordenes_trabajo, fila);
        if (ot) abrirImprimirOT(ot); else _imprimirOT(fila);
        return;
      }
```

- [ ] **Step 3: Chequeo de sintaxis y suite**

Run: `node --check public/lotes/js/vista-ot-confirmar.js && node --check public/lotes/js/vista-movimientos.js && npm test`
Expected: sin errores; suite verde.

- [ ] **Step 4: Commit**

```bash
git add public/lotes/js/vista-ot-confirmar.js public/lotes/js/vista-movimientos.js
git commit -m "feat(lotes): confirmar la OT de trasiego por lote y avisar barriles sin escanear

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Verificación en el navegador

**Files:** ninguno del producto. Temporales en el worktree (borrarlos al final): `seed-doc.json`, `seed-payload.json`.

- [ ] **Step 1: Preparar el preview en el worktree**

El MCP de preview resuelve `.claude/launch.json` contra el directorio de trabajo de la sesión. Si la sesión corre en el worktree, copiar `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\.claude\launch.json` a `<worktree>\.claude\launch.json` y cambiar el `cd /d` de la entrada `catenainstitute-dev` a `C:\Users\Bmax\repos\catenainstitute-ot`. Correr también `npm ci` y `npm run migrar:local` en el worktree si no se hizo. `npm run migrar:local` usa wrangler: si el clasificador lo bloquea, pedirle al usuario que lo corra.

- [ ] **Step 2: Levantar y sembrar datos de prueba**

`preview_start {name:'catenainstitute-dev'}` (sirve en `http://localhost:8788/lotes/`). Sembrar Lotes con curl (el `preview_eval` que hace POST lo bloquea el clasificador):

```bash
curl -s http://localhost:8788/lotes/api/datos -o seed-doc.json
node -e "const d=require('./seed-doc.json');d.lotes=[{lote:'26217',id_texto:'CS VSC Ct.3 Clon 169',organico_convencional:'Convencional',variedad:'Cabernet Sauvignon'},{lote:'26218',id_texto:'MB Org test',organico_convencional:'Orgánico',variedad:'Malbec'}];d.analisis=d.analisis||[];require('fs').writeFileSync('seed-payload.json',JSON.stringify(d))"
curl -s -X POST "http://localhost:8788/lotes/api/datos?forzar=1" -H "Content-Type: application/json" --data-binary @seed-payload.json
```

Para el Mapa, POSTear un documento de barriles con 5 barriles del 26217 y 2 del 26218 por la API de barriles. Averiguar el endpoint de guardado con `grep -n "ruta === '/estado'" src/barriles/rutas.ts`. Si no hay forma de sembrarlo sin wrangler, verificar el modo manual (Mapa no disponible) y decirle al usuario que el camino con barriles quedó probado solo en tests.

- [ ] **Step 3: Recorrido**

Con `preview_stop` + `preview_start` después de cualquier cambio de código (caché de assets), activar la pestaña con `document.querySelector('.tabs button[data-v="movimientos"]').click()` y verificar:
1. **➕ Emitir OT** abre el modal nuevo. Agregar 26217 → aparecen sus barriles tildados y los litros suman. Destildar uno → los litros bajan. Agregar 26218 → aparece la marca de orgánico.
2. Emitir → la tabla muestra 2 movimientos `pendiente` con el mismo `OT-2026-NNN`, y se abre el modal de impresión.
3. Vista de impresión: poner `document.body.classList.add('printing-ot-mov')` después de cargar `#otMovHoja` y sacar screenshot. Tienen que verse la OT con pasos y el paso de la cinta resaltado, la planilla con los barriles y los rótulos en 2 columnas.
4. **✓** en una de las filas → abre la confirmación con los 2 lotes. Confirmar → los dos movimientos quedan `ejecutado` con los litros reales, y aparece el aviso de barriles LLENOS si el Mapa sembrado los tiene LLENOS.
5. **🖨** en un movimiento viejo sin OT de trasiego → sale la hoja genérica de antes.
6. `read_console_messages` sin errores.

- [ ] **Step 4: Limpiar y cerrar**

Borrar `seed-doc.json` y `seed-payload.json`. `git status` limpio. Suite final: `npm test && npx tsc --noEmit`.

- [ ] **Step 5: Despliegue (lo hace el usuario)**

Después del merge a `main` y el push, verificar CI con `gh run list --limit 3` (el deploy automático viene fallando, ver memoria). Pedirle al usuario que corra, desde una carpeta con `main` limpio (`git status` sin cambios, **no** `repos\catenainstitute`, que tiene trabajo de otra sesión):

```
cd /d C:\Users\Bmax\repos\catenainstitute-ot
git checkout main && git pull
npx.cmd wrangler deploy
```
