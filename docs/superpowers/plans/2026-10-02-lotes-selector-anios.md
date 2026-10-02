# Selector de años en Lotes web — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botones `2025 | 2026` que prenden y apagan los lotes de cada vendimia (y todo lo que cuelga de ellos) en todas las pestañas de la web de Lotes, y un script para sumar los lotes y análisis del Excel 2025 al documento.

**Architecture:** El año sale de los dos primeros dígitos del número de lote (5 dígitos). Un módulo puro (`public/lotes/js/anios.js`) y su gemelo TS (`src/lotes/motores/anios.ts`) definen la regla; un módulo de estado (`selector-anios.js`) guarda la selección y pinta los botones. Las tres rutas que corren motores (`/dashboard`, `/cruce`, `/orden-correccion`) aceptan `?anios=` y recortan lotes/análisis antes de calcular; el resto de las pestañas filtra en el navegador al armar lo que muestra. El documento se sigue cargando y guardando entero.

**Tech Stack:** Cloudflare Workers + D1, TypeScript (rutas/motores), JS módulos ES sin bundler (`public/lotes`), vitest con `@cloudflare/vitest-pool-workers`, Python + openpyxl para leer el Excel.

**Spec:** `docs/superpowers/specs/2026-10-02-lotes-selector-anios-design.md`

## Global Constraints

- Trabajar en el worktree `C:\Users\Bmax\repos\catenainstitute-anios`, rama `feat/lotes-anios`. No tocar `C:\Users\Bmax\repos\catenainstitute` (otras sesiones cambian de rama ahí).
- **Prohibido** `wrangler deploy`, `importar.mjs --remote` y cualquier `wrangler d1 ... --remote` hasta que el usuario confirme Workers Paid. Todo se prueba en local.
- Regla del año: lote recortado (`trim`) de exactamente 5 dígitos → `2000 + primeros dos`; cualquier otra cosa → `null` ("sin año", **visible siempre**).
- Selección por defecto: solo el año más nuevo presente en los lotes. Nunca puede quedar vacía. Se recuerda en `localStorage` clave `lotes_anios` (JSON array de números), siempre dentro de try/catch.
- NO filtran: control de duplicados (`validarNumeroLote`), sugerencias de variedad/distrito/proyecto, linaje y padre/hijo, vasijas/cubicación/config, búsqueda puntual de un lote para OT o ficha, `/ficha`, `/analisis` (servidor).
- Los movimientos NO se recortan en el servidor (linaje entre años).
- Varios archivos JS tienen finales de línea CRLF: si un reemplazo no matchea, revisar `\r\n`.
- Comentarios y textos de UI en castellano rioplatense, con la densidad de comentarios del archivo que se toca.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Antes de arrancar: `npm ci` en el worktree (no tiene `node_modules`). Tests: `npx vitest run <archivo>`; typecheck: `npx tsc --noEmit`.

## File Structure

| Archivo | Rol |
|---|---|
| `src/lotes/motores/anios.ts` (nuevo) | Regla del año del lado servidor: `anioDeLote`, `leerAnios`, `enAnios`, `recortarPorAnios` |
| `src/lotes/rutas.ts` | `?anios=` en `/dashboard`, `/cruce`, `/orden-correccion` |
| `public/lotes/js/anios.js` (nuevo) | Regla del año del lado navegador, pura y testeable: `anioDeLote`, `aniosDisponibles`, `seleccionInicial`, `alternarAnio`, `loteVisible`, `otVisible`, `claveAnios` |
| `public/lotes/js/selector-anios.js` (nuevo) | Estado de la selección + `localStorage` + botones en la barra de pestañas; dispara `lotes:anios-cambiados` |
| `public/lotes/js/nucleo.js` | `cargarDashboard` manda `?anios=` y descarta respuestas de otra selección |
| `public/lotes/app.js` | Monta el selector después de cargar datos y reacciona al cambio |
| `public/lotes/index.html` | Contenedor `#selAnios` en la barra `.tabs` + CSS |
| `public/lotes/js/vista-lotes.js`, `vista-analisis.js`, `vista-movimientos.js`, `vista-ot-lista.js`, `vista-so2.js`, `vista-mermas.js`, `vista-cruce.js`, `vista-orden-correccion.js` | Filtro al armar lo que muestran |
| `scripts/fusionar-anio.mjs` (nuevo) + `scripts/fusionar-anio-nucleo.mjs` (nuevo) | Suma un año convertido del Excel al documento vigente |
| `test/lotes-anios-motor.test.ts`, `test/lotes-anios-rutas.test.ts`, `test/lotes-anios.test.mjs`, `test/lotes-fusionar-anio.test.mjs` (nuevos) | Tests |

---

### Task 1: Regla del año en el servidor

**Files:**
- Create: `src/lotes/motores/anios.ts`
- Test: `test/lotes-anios-motor.test.ts`

**Interfaces:**
- Consumes: `filasDe` de `src/lotes/motores/fml-condiciones.ts` (`(x: unknown) => Fila[]`).
- Produces:
  - `anioDeLote(lote: unknown): number | null`
  - `leerAnios(param: string | null): Set<number> | null` — `null` = sin filtro
  - `enAnios(lote: unknown, anios: Set<number> | null): boolean`
  - `recortarPorAnios<T extends Record<string, unknown>>(datos: T, anios: Set<number> | null): T` — copia superficial con `lotes` y `analisis` recortados; todo lo demás (incluidos `movimientos`) igual

- [ ] **Step 1: Write the failing test**

```ts
// test/lotes-anios-motor.test.ts
import { describe, it, expect } from 'vitest';
import { anioDeLote, leerAnios, enAnios, recortarPorAnios } from '../src/lotes/motores/anios';

describe('anioDeLote', () => {
  it('saca el año de los dos primeros dígitos de un lote de 5', () => {
    expect(anioDeLote(25137)).toBe(2025);
    expect(anioDeLote('26001')).toBe(2026);
    expect(anioDeLote(' 26217 ')).toBe(2026);
  });
  it('cualquier otro formato no tiene año', () => {
    for (const v of ['', null, undefined, '2621', '262170', '26217A', 'T50', 26.5]) {
      expect(anioDeLote(v)).toBeNull();
    }
  });
});

describe('leerAnios', () => {
  it('lee una lista separada por comas', () => {
    expect([...leerAnios('2025,2026')!].sort()).toEqual([2025, 2026]);
  });
  it('sin parámetro o sin años válidos no filtra', () => {
    expect(leerAnios(null)).toBeNull();
    expect(leerAnios('')).toBeNull();
    expect(leerAnios('abc,1999')).toBeNull();
  });
});

describe('enAnios', () => {
  const s = new Set([2026]);
  it('deja pasar los del año y los sin año', () => {
    expect(enAnios('26001', s)).toBe(true);
    expect(enAnios('T50', s)).toBe(true);
    expect(enAnios('25001', s)).toBe(false);
  });
  it('sin filtro pasa todo', () => expect(enAnios('25001', null)).toBe(true));
});

describe('recortarPorAnios', () => {
  const datos = {
    meta: { version: 3 },
    lotes: [{ lote: 25001 }, { lote: 26001 }],
    analisis: [{ lote: '25001' }, { lote: '26001' }, { lote: '26001' }],
    movimientos: [{ lote: '25001', tipo: 'traspaso', lote_destino: '26001' }],
  };
  it('recorta lotes y analisis pero no movimientos', () => {
    const r = recortarPorAnios(datos, new Set([2026]));
    expect(r.lotes).toEqual([{ lote: 26001 }]);
    expect(r.analisis).toHaveLength(2);
    expect(r.movimientos).toBe(datos.movimientos);
    expect(r.meta).toBe(datos.meta);
  });
  it('no muta el original', () => {
    recortarPorAnios(datos, new Set([2026]));
    expect(datos.lotes).toHaveLength(2);
  });
  it('sin filtro devuelve el mismo objeto', () => {
    expect(recortarPorAnios(datos, null)).toBe(datos);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lotes-anios-motor.test.ts`
Expected: FAIL (no existe `../src/lotes/motores/anios`).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lotes/motores/anios.ts
/**
 * El año (vendimia) de cada lote, para el selector de años de la web.
 *
 * El año no es un campo: sale del número de lote, que en la bodega siempre
 * arranca con los dos dígitos de la cosecha (25137 = 2025, 26001 = 2026). Un
 * lote con otro formato no tiene año y se muestra siempre: esconderlo por un
 * número raro sería perder un lote de vista sin que nadie lo note.
 *
 * Misma regla que public/lotes/js/anios.js; test/lotes-anios.test.mjs
 * verifica que las dos den lo mismo.
 */
import { filasDe } from './fml-condiciones';

export function anioDeLote(lote: unknown): number | null {
  if (typeof lote !== 'number' && typeof lote !== 'string') return null;
  const s = String(lote).trim();
  return /^\d{5}$/.test(s) ? 2000 + Number(s.slice(0, 2)) : null;
}

/** `?anios=2025,2026` → Set. null = no filtrar (falta o no trae ningún año válido). */
export function leerAnios(param: string | null): Set<number> | null {
  if (!param) return null;
  const s = new Set(
    param.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 2000 && n <= 2099),
  );
  return s.size ? s : null;
}

export function enAnios(lote: unknown, anios: Set<number> | null): boolean {
  if (!anios) return true;
  const a = anioDeLote(lote);
  return a === null || anios.has(a);
}

/**
 * El documento con solo los lotes y análisis de esos años, para los motores.
 * Los movimientos van enteros a propósito: el linaje de un 26xxx que viene de
 * un 25xxx (tienePadre, etapas) se tiene que ver aunque 2025 esté apagado.
 */
export function recortarPorAnios<T extends Record<string, unknown>>(datos: T, anios: Set<number> | null): T {
  if (!anios) return datos;
  return {
    ...datos,
    lotes: filasDe(datos.lotes).filter((l) => enAnios(l.lote, anios)),
    analisis: filasDe(datos.analisis).filter((a) => enAnios(a.lote, anios)),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lotes-anios-motor.test.ts` → PASS. Run `npx tsc --noEmit` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lotes/motores/anios.ts test/lotes-anios-motor.test.ts
git commit -m "feat(lotes): regla del año de un lote para el selector de años"
```

---

### Task 2: `?anios=` en las rutas de los motores

**Files:**
- Modify: `src/lotes/rutas.ts` (bloques `/dashboard` ~línea 226, `/cruce` ~254, `/orden-correccion` ~268)
- Test: `test/lotes-anios-rutas.test.ts`

**Interfaces:**
- Consumes: `leerAnios`, `enAnios`, `recortarPorAnios` (Task 1); `escribirDocumento(env, d, email, versionPrevia)` de `rutas.ts`.
- Produces: `GET /lotes/api/dashboard?anios=2026` → mismo formato que hoy, calculado solo con esos años. Igual `/cruce?anios=` (y `huerfanos` recortados por año) y `/orden-correccion?anios=`. Sin parámetro: idéntico a hoy.

- [ ] **Step 1: Write the failing test**

Copiar de `test/lotes-guardado.test.ts` el `beforeAll` que siembra el perfil `editor` y la forma de armar el `Request` autenticado (los headers que use ese archivo en `main`; si el login nuevo cambió el header, usar exactamente el que usa ese test).

```ts
// test/lotes-anios-rutas.test.ts
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { rutasLotes, escribirDocumento } from '../src/lotes/rutas';

const EDITOR = 'editor@catenawines.com';

beforeAll(async () => {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre)
     VALUES (?, 'lotes', 'editor', 'Editor')`,
  ).bind(EDITOR).run();
  const actual = await env.DB.prepare("SELECT version FROM documento WHERE modulo='lotes'").first<{ version: number }>();
  const doc = {
    meta: { version: (actual?.version ?? 0) + 1 },
    lotes: [
      { lote: 25001, variedad: 'Malbec', litros_actuales: 225, cap225: 1 },
      { lote: 26001, variedad: 'Malbec', litros_actuales: 225, cap225: 1 },
    ],
    analisis: [
      { lote: '25001', fecha_analisis: '2026-09-01', so2_libre: 30, ph: 3.6 },
      { lote: '26001', fecha_analisis: '2026-09-01', so2_libre: 30, ph: 3.6 },
    ],
    movimientos: [],
  };
  await escribirDocumento(env, doc, EDITOR, actual?.version ?? 0);
});

async function get(ruta: string) {
  const req = new Request('https://catenainstitute.example/lotes/api' + ruta, {
    headers: { 'Cf-Access-Authenticated-User-Email': EDITOR },
  });
  const ctx = createExecutionContext();
  const res = await rutasLotes(req, env, ctx, ruta.split('?')[0]);
  await waitOnExecutionContext(ctx);
  return res!;
}

const lotesDe = (j: { lotes?: { lote: unknown }[] }) => (j.lotes ?? []).map((l) => String(l.lote)).sort();

describe('GET /dashboard?anios=', () => {
  it('sin parámetro calcula con todos los años', async () => {
    const j = await (await get('/dashboard')).json<{ lotes: { lote: unknown }[] }>();
    expect(lotesDe(j)).toEqual(['25001', '26001']);
  });
  it('con anios=2026 solo trae los 26xxx', async () => {
    const j = await (await get('/dashboard?anios=2026')).json<{ lotes: { lote: unknown }[]; etapas: Record<string, unknown> }>();
    expect(lotesDe(j)).toEqual(['26001']);
    expect(Object.keys(j.etapas)).toEqual(['26001']);
  });
});
```

Agregar al mismo archivo, si la D1 de test tiene un Mapa de Barriles sembrable (ver cómo lo hace `test/lotes-barriles-ruta.test.ts`), un caso para `/orden-correccion?anios=2026` que verifique que ningún `lotes[].lote` empieza con `25`, y uno de `/cruce?anios=2026` que verifique lo mismo en `lotes` y en `huerfanos`. Para el cruce, sembrar en el Mapa un barril LLENO con lote `25001`: sin parámetro aparece en `lotes` (coincide); con `anios=2026` no aparece ni en `lotes` ni en `huerfanos`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lotes-anios-rutas.test.ts`
Expected: FAIL en "con anios=2026" (hoy devuelve los dos lotes).

- [ ] **Step 3: Implement**

En `src/lotes/rutas.ts`, agregar al import: `import { leerAnios, enAnios, recortarPorAnios } from './motores/anios';` y, justo después de `const hoy = hoyBodega(env.TZ_BODEGA);`:

```ts
  // ?anios=2025,2026: el selector de años de la pantalla. Solo las rutas que
  // corren motores lo usan; sin el parámetro calculan con todo, como siempre.
  const anios = leerAnios(new URL(req.url).searchParams.get('anios'));
```

Reemplazar los tres bloques:

```ts
  if (ruta === '/dashboard' && req.method === 'GET') {
    return json(200, datosDashboard(recortarPorAnios(await leerDocumento(env), anios), hoy));
  }
```

```ts
  if (ruta === '/cruce' && req.method === 'GET') {
    try {
      const mapa = normalizarMapa(await leerMapaBarriles(env));
      const d = await leerDocumento(env);
      // Los lotes van recortados por año; las etapas sugeridas salen del
      // documento entero (el linaje cruza años). Un barril del Mapa con un lote
      // de un año apagado quedaría como huérfano: se lo saca de ahí también.
      const informe = cruzar(
        (recortarPorAnios(d, anios).lotes as Record<string, unknown>[]) ?? [],
        mapa,
        etapasSugeridas(d, hoy),
      );
      informe.huerfanos = informe.huerfanos.filter((h) => enAnios(h.lote, anios));
      return json(200, informe);
    } catch (e) {
      if (e instanceof MapaNoDisponible) return json(503, { error: e.message });
      throw e;
    }
  }
```

```ts
  if (ruta === '/orden-correccion' && req.method === 'GET') {
    try {
      const mapa = normalizarMapa(await leerMapaBarriles(env));
      return json(200, armarOrden(recortarPorAnios(await leerDocumento(env), anios), mapa, hoy));
    } catch (e) {
      if (e instanceof MapaNoDisponible) return json(503, { error: e.message });
      throw e;
    }
  }
```

Si `informe.huerfanos` está tipado `readonly`, ajustar con una copia (`{ ...informe, huerfanos: ... }`).

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/lotes-anios-rutas.test.ts` → PASS. Run `npx vitest run` (toda la suite) → todo verde, y `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lotes/rutas.ts test/lotes-anios-rutas.test.ts
git commit -m "feat(lotes): dashboard, cruce y orden de correccion aceptan ?anios="
```

---

### Task 3: Regla del año en el navegador (módulo puro)

**Files:**
- Create: `public/lotes/js/anios.js`
- Test: `test/lotes-anios.test.mjs`

**Interfaces:**
- Produces (todas puras, sin DOM ni storage):
  - `anioDeLote(lote): number|null` — misma regla que Task 1
  - `aniosDisponibles(lotes: object[]): number[]` — años presentes, ordenados ascendente
  - `seleccionInicial(guardada: unknown, disponibles: number[]): number[]` — la guardada filtrada a disponibles; si queda vacía o no es array, `[max(disponibles)]`; si no hay disponibles, `[]`
  - `alternarAnio(sel: number[], anio: number): number[]` — prende/apaga; nunca devuelve vacío (si apagar dejaría vacío, devuelve `sel` igual)
  - `loteVisible(lote, sel: number[]|null): boolean` — `null` o `[]` = todo visible; sin año = visible
  - `otVisible(ot, sel): boolean` — alguna de `ot.lotes[].lote` o `ot.lote_corte.lote` visible; una OT sin ningún lote es visible
  - `claveAnios(sel: number[]|null): string` — `'2025,2026'` ordenado, `''` si null/vacío

- [ ] **Step 1: Write the failing test**

```js
// test/lotes-anios.test.mjs
/* Tests de anios.js: la regla del año del selector de años. Modulo puro, se
 * importa tal cual en el runtime de Workers como lote-nuevo.js. */
import { describe, it, expect } from 'vitest';
import { anioDeLote, aniosDisponibles, seleccionInicial, alternarAnio,
         loteVisible, otVisible, claveAnios } from '../public/lotes/js/anios.js';
import { anioDeLote as anioServidor } from '../src/lotes/motores/anios';

describe('anioDeLote', () => {
  const casos = [25137, '26001', ' 26217 ', '', null, undefined, '2621', '262170', '26217A', 'T50', 26.5];
  it('da lo mismo que el motor del servidor', () => {
    for (const c of casos) expect(anioDeLote(c)).toBe(anioServidor(c));
  });
  it('25137 es 2025', () => expect(anioDeLote(25137)).toBe(2025));
});

describe('aniosDisponibles', () => {
  it('los años presentes, sin repetir y ordenados', () => {
    expect(aniosDisponibles([{ lote: 26001 }, { lote: '25004' }, { lote: 26002 }, { lote: 'X' }]))
      .toEqual([2025, 2026]);
  });
});

describe('seleccionInicial', () => {
  it('sin nada guardado arranca con el año más nuevo', () => {
    expect(seleccionInicial(null, [2025, 2026])).toEqual([2026]);
    expect(seleccionInicial('basura', [2025, 2026])).toEqual([2026]);
  });
  it('respeta lo guardado que sigue existiendo', () => {
    expect(seleccionInicial([2025, 2026], [2025, 2026])).toEqual([2025, 2026]);
    expect(seleccionInicial([2024, 2025], [2025, 2026])).toEqual([2025]);
  });
  it('si lo guardado ya no existe, vuelve al defecto', () => {
    expect(seleccionInicial([2023], [2025, 2026])).toEqual([2026]);
  });
  it('sin años disponibles, vacío', () => expect(seleccionInicial(null, [])).toEqual([]));
});

describe('alternarAnio', () => {
  it('prende y apaga', () => {
    expect(alternarAnio([2026], 2025)).toEqual([2025, 2026]);
    expect(alternarAnio([2025, 2026], 2025)).toEqual([2026]);
  });
  it('no deja apagar el último', () => expect(alternarAnio([2026], 2026)).toEqual([2026]));
});

describe('loteVisible / otVisible', () => {
  it('filtra por año y deja pasar los sin año', () => {
    expect(loteVisible('25001', [2026])).toBe(false);
    expect(loteVisible(26001, [2026])).toBe(true);
    expect(loteVisible('T50', [2026])).toBe(true);
    expect(loteVisible('25001', null)).toBe(true);
    expect(loteVisible('25001', [])).toBe(true);
  });
  it('una OT mixta se ve si alguno de sus lotes se ve', () => {
    const ot = { lotes: [{ lote: '25001' }, { lote: '26001' }] };
    expect(otVisible(ot, [2025])).toBe(true);
    expect(otVisible(ot, [2026])).toBe(true);
    expect(otVisible({ lotes: [{ lote: '25001' }] }, [2026])).toBe(false);
    expect(otVisible({ lotes: [{ lote: '25001' }], lote_corte: { lote: '26315' } }, [2026])).toBe(true);
    expect(otVisible({ lotes: [] }, [2026])).toBe(true);
  });
});

describe('claveAnios', () => {
  it('ordenada y separada por comas', () => {
    expect(claveAnios([2026, 2025])).toBe('2025,2026');
    expect(claveAnios(null)).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lotes-anios.test.mjs` → FAIL (falta el módulo).

- [ ] **Step 3: Implement**

```js
// public/lotes/js/anios.js
/* ===== Lotes CIW — el año (vendimia) de cada lote =====
 * Modulo puro (sin DOM ni storage) para que se pueda testear en el runtime de
 * Workers. El estado de la seleccion y los botones viven en selector-anios.js.
 *
 * El año no es un campo: sale del numero de lote, que siempre arranca con los
 * dos digitos de la cosecha (25137 = 2025). Un lote con otro formato no tiene
 * año y se ve siempre. Misma regla que src/lotes/motores/anios.ts. */
'use strict';

export function anioDeLote(lote){
  if (typeof lote !== 'number' && typeof lote !== 'string') return null;
  const s = String(lote).trim();
  return /^\d{5}$/.test(s) ? 2000 + Number(s.slice(0, 2)) : null;
}

export function aniosDisponibles(lotes){
  const s = new Set();
  for (const l of (lotes || [])){
    const a = anioDeLote(l && l.lote);
    if (a !== null) s.add(a);
  }
  return [...s].sort((a, b) => a - b);
}

/* Lo guardado en el navegador, si sigue teniendo sentido; si no, el año mas
 * nuevo solo, que es el que se trabaja todos los dias. */
export function seleccionInicial(guardada, disponibles){
  if (!disponibles.length) return [];
  const ok = Array.isArray(guardada)
    ? disponibles.filter(a => guardada.includes(a))
    : [];
  return ok.length ? ok : [disponibles[disponibles.length - 1]];
}

/* Nunca deja la seleccion vacia: una web sin ningun lote parece rota. */
export function alternarAnio(sel, anio){
  if (sel.includes(anio)){
    const r = sel.filter(a => a !== anio);
    return r.length ? r : sel;
  }
  return [...sel, anio].sort((a, b) => a - b);
}

export function loteVisible(lote, sel){
  if (!sel || !sel.length) return true;
  const a = anioDeLote(lote);
  return a === null || sel.includes(a);
}

/* Una OT con lotes de dos años se ve si cualquiera de ellos se ve. */
export function otVisible(ot, sel){
  const lotes = ((ot && ot.lotes) || []).map(l => l && l.lote);
  if (ot && ot.lote_corte && ot.lote_corte.lote) lotes.push(ot.lote_corte.lote);
  if (!lotes.length) return true;
  return lotes.some(l => loteVisible(l, sel));
}

export function claveAnios(sel){
  return (sel && sel.length) ? [...sel].sort((a, b) => a - b).join(',') : '';
}
```

- [ ] **Step 4: Run tests** — `npx vitest run test/lotes-anios.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/anios.js test/lotes-anios.test.mjs
git commit -m "feat(lotes): regla del año en el navegador, igual a la del servidor"
```

---

### Task 4: Estado y botones del selector, dashboard por año

**Files:**
- Create: `public/lotes/js/selector-anios.js`
- Modify: `public/lotes/index.html` (barra `.tabs` línea ~1385 y CSS cerca de `.segm` ~línea 343)
- Modify: `public/lotes/js/nucleo.js` (`cargarDashboard`, ~línea 284)
- Modify: `public/lotes/app.js`

**Interfaces:**
- Consumes: todo `anios.js` (Task 3).
- Produces (de `selector-anios.js`):
  - `aniosActivos(): number[] | null` — `null` hasta que se monte (= sin filtro)
  - `visible(lote): boolean` — `loteVisible(lote, aniosActivos())`
  - `otVisibleAhora(ot): boolean`
  - `queryAnios(): string` — solo la clave (`'2025,2026'`, o `''` sin filtro); cada llamador arma su URL
  - `montarSelectorAnios(lotes: object[]): void` — calcula disponibles, lee `localStorage`, pinta `#selAnios`
  - Evento `document` → `lotes:anios-cambiados` (sin detail) cada vez que cambia la selección (incluido el montaje si la selección efectiva difiere de "sin filtro").
- De `nucleo.js`: `cargarDashboard()` pide `/dashboard?anios=<clave>` cuando hay clave.

`selector-anios.js` NO importa `nucleo.js` (nucleo lo importa a él; así no se arma ciclo).

- [ ] **Step 1: `selector-anios.js`**

```js
/* ===== Lotes CIW — selector de años (estado + botones) =====
 * Los botones 2025 | 2026 de la barra de pestañas. Se prenden y apagan por
 * separado y mandan en toda la web. La regla del año vive en anios.js; aca solo
 * la seleccion, su recuerdo en el navegador y el pintado.
 *
 * No importa nucleo.js: nucleo lo importa a el (cargarDashboard necesita la
 * clave) y un import de vuelta cerraria el ciclo. Avisa los cambios con el
 * evento 'lotes:anios-cambiados' y app.js hace el resto. */
'use strict';
import { aniosDisponibles, seleccionInicial, alternarAnio, loteVisible,
         otVisible, claveAnios } from './anios.js';

const CLAVE_LS = 'lotes_anios';
let _sel = null;          // null = todavia no se monto: no se filtra nada
let _disponibles = [];

function _leerGuardada(){
  try { return JSON.parse(localStorage.getItem(CLAVE_LS) || 'null'); } catch(e) { return null; }
}
function _guardar(){
  try { localStorage.setItem(CLAVE_LS, JSON.stringify(_sel)); } catch(e) {}
}

export function aniosActivos(){ return _sel; }
export function visible(lote){ return loteVisible(lote, _sel); }
export function otVisibleAhora(ot){ return otVisible(ot, _sel); }
export function queryAnios(){ return claveAnios(_sel); }

function _pintar(){
  const cont = document.getElementById('selAnios');
  if (!cont) return;
  /* Con un solo año no hay nada que elegir: no se muestra. */
  cont.hidden = _disponibles.length < 2;
  cont.innerHTML = _disponibles.map(a =>
    `<button type="button" data-anio="${a}" aria-pressed="${_sel.includes(a)}"`
    + ` title="Mostrar u ocultar los lotes ${a}">${a}</button>`).join('');
}

function _avisar(){ document.dispatchEvent(new CustomEvent('lotes:anios-cambiados')); }

/* Se llama despues de cargar DATOS (y otra vez si se recargan): un lote 27xxx
 * nuevo agrega su boton solo. */
export function montarSelectorAnios(lotes){
  const antes = claveAnios(_sel);
  _disponibles = aniosDisponibles(lotes);
  _sel = seleccionInicial(_sel || _leerGuardada(), _disponibles);
  _pintar();
  const cont = document.getElementById('selAnios');
  if (cont && !cont._escuchando){
    cont._escuchando = true;
    cont.addEventListener('click', e => {
      const b = e.target.closest('button[data-anio]');
      if (!b) return;
      const nueva = alternarAnio(_sel, Number(b.dataset.anio));
      if (claveAnios(nueva) === claveAnios(_sel)) return;   // era el ultimo prendido
      _sel = nueva;
      _guardar();
      _pintar();
      _avisar();
    });
  }
  if (claveAnios(_sel) !== antes) _avisar();
}
```

- [ ] **Step 2: HTML y CSS**

En `index.html`, dentro de `<div class="tabs" id="tabs">`, después del último `<button data-v="config">…</button>`:

```html
  <div class="segm sel-anios" id="selAnios" hidden aria-label="Años de lotes que se muestran"></div>
```

Junto a las reglas `.segm` (~línea 347):

```css
  /* Selector de años: a la derecha de la barra de pestañas, mismo look que
     el filtro Todos | Llenos | Vacíos. */
  .tabs .sel-anios{margin-left:auto;align-self:center}
  .tabs .sel-anios button{padding:5px 12px}
```

Verificar que `.tabs button` (estilo de pestaña) no pise a `.sel-anios button`: si lo hace, subir especificidad con `.tabs .sel-anios button[aria-pressed="true"]{background:var(--panel);color:var(--accent);font-weight:600}`. **Importante:** `app.js` hace `document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => mostrarTab(b.dataset.v)))`; los botones de año se crean después de ese bucle, así que no lo reciben, pero `vistaActiva()` en `nucleo.js` usa `.tabs button.active`: no hay problema porque los de año nunca llevan `.active`. Además cambiar el selector en app.js a `.tabs button[data-v]` para que quede explícito.

- [ ] **Step 3: `nucleo.js` — dashboard por año**

Agregar `import { queryAnios } from './selector-anios.js';` y reemplazar el cuerpo del fetch de `cargarDashboard`:

```js
export async function cargarDashboard(){
  if (_dashLoading) return;
  _dashLoading = true;
  /* La clave de años con la que se pide. Si el selector cambia mientras viaja,
   * la respuesta describe otros años: se descarta y se vuelve a pedir. */
  const clave = queryAnios();
  try {
    const r = await fetch(API+'/dashboard' + (clave ? '?anios=' + clave : ''));
    if (!r.ok) return;
    const j = await r.json();
    if (queryAnios() !== clave){ _dashLoading = false; return cargarDashboard(); }
    _dashData = j;
    // ... (resto igual)
```

(El `finally` que pone `_dashLoading = false` ya existe; el retorno temprano lo deja en false antes de volver a pedir.) Leer la función entera antes de editar para no romper el `finally`.

- [ ] **Step 4: `app.js` — montar y reaccionar**

Imports: agregar `registrarInit, invalidarVistas, invalidarDashMap, renderActivo, DATOS` al import de `nucleo.js` (si alguno no se exporta, exportarlo) y `import { montarSelectorAnios } from './js/selector-anios.js';`.

Antes de `const dash = cargarDashboard();`:

```js
  /* selector de años: se monta con los lotes ya cargados (registrarInit corre
     antes del primer render) y cada cambio rearma todo lo que muestra lotes. */
  registrarInit(() => montarSelectorAnios(DATOS().lotes));
  document.addEventListener('lotes:anios-cambiados', () => {
    invalidarVistas();
    invalidarDashMap();
    cargarDashboard();
    renderActivo();
  });
```

Cambiar `document.querySelectorAll('.tabs button')` por `document.querySelectorAll('.tabs button[data-v]')`.

- [ ] **Step 5: Verificar en navegador**

Seguir `catenainstitute-verificar-en-navegador` (memoria): `npm run dev:sin-ia` en :8788 con el `launch.json` de `Escritorio\claude`, sembrar la D1 local con el respaldo `../catenainstitute/respaldo-nube-lotes-2026-10-02-v69.json` más 2 lotes falsos `25001`/`25002` con un análisis cada uno (POST /datos desde `javascript_tool`). Comprobar: aparecen los botones 2025 | 2026, arranca solo 2026, al prender 2025 el Network muestra `/dashboard?anios=2025,2026`, el último botón no se apaga, recargar recuerda la selección. Con un solo año los botones no se ven.

- [ ] **Step 6: Run full suite + commit**

Run: `npx vitest run` → verde.

```bash
git add public/lotes/js/selector-anios.js public/lotes/index.html public/lotes/js/nucleo.js public/lotes/app.js
git commit -m "feat(lotes): botones de año en la barra de pestañas; el dashboard se pide por año"
```

Con esto Dashboard, Tablero FML y Orden de muestras (que salen de `dashData()`) ya quedan filtrados.

---

### Task 5: Filtro en Lotes y Análisis

**Files:**
- Modify: `public/lotes/js/vista-lotes.js` (`renderLotes` ~línea 549, contador ~787)
- Modify: `public/lotes/js/vista-analisis.js` (~líneas 482-486 y 748)

**Interfaces:**
- Consumes: `visible(lote)` de `selector-anios.js`.

- [ ] **Step 1: Lotes**

Import: `import { visible } from './selector-anios.js';`

En `renderLotes`, después de armar `rows` con el `.map(...)` y antes del filtro `if (q)`:

```js
  /* Selector de años: lo de un año apagado no se dibuja (los fijos recien
   * creados igual van arriba, ver ordenarConFijos). */
  rows = rows.filter(l => visible(l.lote));
```

Contador:

```js
  const totalAnios = DATOS().lotes.filter(l => visible(l.lote)).length;
  $('lotesCount').textContent = rows.length + ' / ' + totalAnios + ' lotes';
```

Las opciones de los filtros de columna (`opciones: () => opcionesValores(DATOS().lotes, ...)` y las de `_etapa`/`_envase`) también se arman sobre `DATOS().lotes.filter(l => visible(l.lote))`, para no ofrecer valores que solo existen en años apagados. NO tocar `validarNumeroLote(vals.lote, DATOS().lotes)` ni las sugerencias del asistente (`opcionesValores(DATOS().lotes, l => l[p.k])` en ~línea 894): esos van con todos los lotes.

- [ ] **Step 2: Análisis**

Import: `import { visible } from './selector-anios.js';`

```js
  const delAnio = (DATOS().analisis || []).filter(a => visible(a.lote));
  const meses     = [...new Set(delAnio.map(a => (a.fecha_analisis||'').slice(0,7)).filter(Boolean))].sort().reverse();

  /* -------- filtrar el array crudo (...) -------- */
  let registrosFiltrados = delAnio;
```

y el contador:

```js
  $('analisisCount').textContent = filasDeDatos.length + ' filas / ' + delAnio.length + ' análisis';
```

(`delAnio` tiene que estar en el scope del contador; si están en funciones distintas, recalcularlo ahí.) Las opciones de los filtros de columna que salen de `DATOS().analisis` (`opcionesValores(DATOS().analisis || [], leer, c.fmt)` ~línea 384) pasan a `(DATOS().analisis || []).filter(a => visible(a.lote))`. No tocar `cargarAnalisisFlags` (engancha por posición sobre el array entero).

- [ ] **Step 3: Verificar en navegador** (misma D1 local de Task 4): con 2026 solo, buscar "25001" en Lotes no da nada; prender 2025 lo muestra; el contador cambia; en Análisis los análisis de 25001 aparecen y desaparecen, los colores de criterio siguen en su lugar; editar un pH de un análisis 25001, guardar, recargar: el valor quedó.

- [ ] **Step 4: Commit**

```bash
git add public/lotes/js/vista-lotes.js public/lotes/js/vista-analisis.js
git commit -m "feat(lotes): Lotes y Analisis muestran solo los años prendidos"
```

---

### Task 6: Filtro en Movimientos, OT, Correcciones SO2 y Mermas

**Files:**
- Modify: `public/lotes/js/vista-movimientos.js` (~líneas 154, 265-270, 421)
- Modify: `public/lotes/js/vista-ot-lista.js` (`renderOrdenesTrabajo` ~línea 45)
- Modify: `public/lotes/js/vista-so2.js` (`lotesSorted` ~46, `_so2FilasConCorreccion` ~327)
- Modify: `public/lotes/js/vista-mermas.js` (`renderMermas` ~25)

**Interfaces:**
- Consumes: `visible(lote)`, `otVisibleAhora(ot)` de `selector-anios.js`.

- [ ] **Step 1: Movimientos**

Un movimiento se ve si su lote o su `lote_destino` se ve (un traspaso 25xxx → 26xxx aparece en los dos años):

```js
const _movVisible = m => visible(m.lote) || (!!m.lote_destino && visible(m.lote_destino));
```

- `renderMovimientos`: `let rows = allMovEnrich.filter(_movVisible);`
- contador: `rows.length + ' / ' + (DATOS().movimientos || []).filter(_movVisible).length + ' movimientos'`
- opciones de filtro (`initFiltrosMov`): `_enrich((DATOS().movimientos || []).filter(_movVisible), _buildLoteMap())`

No tocar `_buildLoteMap` (busca lotes por número; tiene que encontrar todos).

- [ ] **Step 2: Lista de OT**

En `renderOrdenesTrabajo`:

```js
  const vivas = filtrarOrdenes(_ordenes().filter(otVisibleAhora), { soloPendientes: false, movimientos });
```

`_otPorId` sigue buscando en todas (abrir una OT por id desde un movimiento tiene que funcionar).

- [ ] **Step 3: Correcciones SO2**

- `lotesSorted = [...(DATOS().lotes || [])].filter(l => visible(l.lote)).sort(...)` (el select de lotes).
- `_so2FilasConCorreccion`: agregar `if (!visible(a.lote)) return false;` como primera línea del filter.
- `loteMap` (~línea 41) NO se filtra.

- [ ] **Step 4: Mermas**

En `renderMermas`: `const todas = (DATOS().mermas || []).filter(m => visible(m.lote));`. Ojo: `m.lote` puede venir con formato de `codigoLote`; si `visible` da `true` para un formato raro está bien (sin año = visible).

- [ ] **Step 5: Verificar en navegador**: con la D1 local, cargar un movimiento de traspaso 25001 → 26001 y comprobar que se ve con cualquiera de los dos años prendidos; una OT de un lote 25xxx desaparece de la lista con 2025 apagado; el select de Correcciones SO2 no ofrece 25xxx con 2025 apagado.

- [ ] **Step 6: Commit**

```bash
git add public/lotes/js/vista-movimientos.js public/lotes/js/vista-ot-lista.js public/lotes/js/vista-so2.js public/lotes/js/vista-mermas.js
git commit -m "feat(lotes): movimientos, OT, correcciones SO2 y mermas siguen el selector de años"
```

---

### Task 7: Cruce con barriles y Orden de corrección por año

**Files:**
- Modify: `public/lotes/js/vista-cruce.js` (`cargarCruce` ~línea 128)
- Modify: `public/lotes/js/vista-orden-correccion.js` (`_ocCargar` ~línea 461)

**Interfaces:**
- Consumes: `queryAnios()` de `selector-anios.js`; rutas con `?anios=` (Task 2).

- [ ] **Step 1: Cruce**

```js
export async function cargarCruce(archivo){
  if (_cargando) return;
  _cargando = true; _error = '';
  render();
  try {
    const qs = new URLSearchParams();
    if (archivo) qs.set('archivo', archivo);
    const anios = queryAnios();
    if (anios) qs.set('anios', anios);
    const url = API+'/cruce' + (qs.toString() ? '?' + qs.toString() : '');
    // ... resto igual
```

`URLSearchParams` codifica la coma como `%2C`; `leerAnios` recibe el valor ya decodificado por `searchParams.get`, así que funciona igual.

Y al final del archivo, junto al `registrarVista`:

```js
/* Un informe cruzado con otros años ya no vale: se descarta y la pantalla
 * vuelve al boton "Cruzar". */
document.addEventListener('lotes:anios-cambiados', () => { _informe = null; _error = ''; });
```

- [ ] **Step 2: Orden de corrección**

En `_ocCargar`: `const anios = queryAnios(); const r = await fetch(API+'/orden-correccion' + (anios ? '?anios=' + anios : ''));`. La vista ya vuelve a pedir en cada render (y el cambio de años hace `renderActivo()`), no hace falta más.

- [ ] **Step 3: Verificar en navegador**: el Network muestra `?anios=` en las dos; con 2025 apagado ningún lote 25xxx aparece en el cruce ni en la orden.

- [ ] **Step 4: Commit**

```bash
git add public/lotes/js/vista-cruce.js public/lotes/js/vista-orden-correccion.js
git commit -m "feat(lotes): cruce y orden de correccion piden solo los años prendidos"
```

---

### Task 8: Script para sumar 2025 al documento

**Files:**
- Create: `scripts/fusionar-anio-nucleo.mjs` (puro, testeable)
- Create: `scripts/fusionar-anio.mjs` (CLI)
- Test: `test/lotes-fusionar-anio.test.mjs`

**Interfaces:**
- Consumes: el JSON que escribe `python migrar_excel.py "<Excel>" <salida>` del repo `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\Lotes` (forma `{meta, config, lotes:[...], analisis:[...], ...}`; `lote` como string; cada lote trae además `trasiegos`, `ultimo_relleno`).
- Produces: `fusionarAnio(doc, convertido, anio) → { doc, reporte: { lotes, analisis, analisis_vacios, huerfanos } }`; tira `Error` si algún lote del convertido no es de `anio`, o si `doc` ya tiene lotes de `anio`.

- [ ] **Step 1: Write the failing test**

```js
// test/lotes-fusionar-anio.test.mjs
import { describe, it, expect } from 'vitest';
import { fusionarAnio } from '../scripts/fusionar-anio-nucleo.mjs';

const doc = () => ({
  meta: { version: 70, autor: 'Oriana' },
  config: { x: 1 },
  lotes: [{ lote: 26001, variedad: 'Malbec' }],
  analisis: [{ lote: '26001', fecha_analisis: '2026-01-02', ph: 3.5 }],
  movimientos: [{ id: 'm1' }],
});
const conv = () => ({
  lotes: [{ lote: '25001', variedad: 'Chardonnay', trasiegos: [null], ultimo_relleno: null }],
  analisis: [
    { lote: '25001', fecha_analisis: '2025-01-01', ph: null, so2_libre: null, comentario: '',
      correccion: { so2_deseado: null, ot_n: '' } },
    { lote: '25001', fecha_analisis: '2025-01-28', ph: 3.05, comentario: '', correccion: {} },
    { lote: '25999', fecha_analisis: '2025-02-01', ph: 3.2, comentario: '', correccion: {} },
  ],
});

describe('fusionarAnio', () => {
  it('suma los lotes y análisis del año sin tocar 2026', () => {
    const d = doc();
    const { doc: r, reporte } = fusionarAnio(d, conv(), 2025);
    expect(r.lotes.map(l => l.lote)).toEqual([26001, 25001]);
    expect(r.lotes[0]).toEqual(d.lotes[0]);
    expect(r.analisis).toHaveLength(3);          // 1 de 2026 + 2 con valores
    expect(reporte).toMatchObject({ lotes: 1, analisis: 2, analisis_vacios: 1, huerfanos: ['25999'] });
    expect(r.movimientos).toEqual(d.movimientos);
    expect(r.config).toEqual(d.config);
    // Sube la version: una pantalla abierta en v70 que guarde despues de la
    // importacion recibe 409 en vez de pisar los lotes 2025 con su copia vieja.
    expect(r.meta.version).toBe(71);
    expect(d.meta.version).toBe(70);
  });
  it('el lote queda numérico, como los de 2026, y sin los campos que la web no usa', () => {
    const { doc: r } = fusionarAnio(doc(), conv(), 2025);
    const l = r.lotes.find(x => x.lote === 25001);
    expect(l).toBeTruthy();
    expect('trasiegos' in l).toBe(false);
    expect('ultimo_relleno' in l).toBe(false);
  });
  it('no importa dos veces el mismo año', () => {
    const una = fusionarAnio(doc(), conv(), 2025).doc;
    expect(() => fusionarAnio(una, conv(), 2025)).toThrow(/ya tiene/);
  });
  it('rechaza un convertido con lotes de otro año', () => {
    const c = conv(); c.lotes.push({ lote: '26002' });
    expect(() => fusionarAnio(doc(), c, 2025)).toThrow(/26002/);
  });
  it('no muta el documento de entrada', () => {
    const d = doc();
    fusionarAnio(d, conv(), 2025);
    expect(d.lotes).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run test/lotes-fusionar-anio.test.mjs` → FAIL.

- [ ] **Step 3: Implement `scripts/fusionar-anio-nucleo.mjs`**

```js
/* Suma una vendimia convertida del Excel (migrar_excel.py) al documento de
 * Lotes. Puro: sin archivos ni red, para poder testearlo.
 *
 * Solo AGREGA: los lotes y análisis de otros años quedan tal cual, y si el
 * documento ya tiene algún lote del año se frena (importar dos veces
 * duplicaría todos los análisis). */
import { anioDeLote } from '../public/lotes/js/anios.js';

/* Campos que migrar_excel.py escribe y la web nunca leyó. */
const SOBRAN = ['trasiegos', 'ultimo_relleno'];
const MEDIDAS = ['etanol', 'ph', 'av', 'gluc_fruc', 'malico', 'lactico', 'acidez_total',
  'azucar_reductor', 'so2_libre', 'so2_total', 'so2_molec', 'brett', 'aceticas',
  'lacticas', 'levaduras', 'hongos'];

const lleno = v => v !== null && v !== undefined && String(v).trim() !== '';

/* Un renglón del Excel con lote y fecha pero sin ninguna medida, comentario ni
 * corrección: la planilla los tiene "preparados" y en la web no son nada. */
function analisisVacio(a){
  if (MEDIDAS.some(k => lleno(a[k]))) return false;
  if (lleno(a.comentario)) return false;
  const c = a.correccion || {};
  return !Object.values(c).some(v => lleno(v) && v !== 0);
}

export function fusionarAnio(doc, convertido, anio){
  const ajenos = (convertido.lotes || []).filter(l => anioDeLote(l.lote) !== anio).map(l => l.lote);
  if (ajenos.length) throw new Error(`el Excel trae lotes que no son de ${anio}: ${ajenos.slice(0, 10).join(', ')}`);
  const yaEstan = (doc.lotes || []).filter(l => anioDeLote(l.lote) === anio);
  if (yaEstan.length) throw new Error(`el documento ya tiene ${yaEstan.length} lotes de ${anio}: no se importa dos veces`);

  const lotes = (convertido.lotes || []).map(l => {
    const n = {};
    for (const [k, v] of Object.entries(l)) if (!SOBRAN.includes(k)) n[k] = v;
    n.lote = Number(String(l.lote).trim());   // como los de 2026
    return n;
  });
  const todos = convertido.analisis || [];
  const analisis = todos.filter(a => !analisisVacio(a)).map(a => ({ ...a, lote: String(a.lote).trim() }));
  const maestro = new Set(lotes.map(l => String(l.lote)));
  const huerfanos = [...new Set(analisis.map(a => a.lote).filter(l => !maestro.has(l)))].sort();

  return {
    doc: { ...doc, meta: { ...(doc.meta || {}), version: Number((doc.meta || {}).version || 0) + 1 },
           lotes: [...(doc.lotes || []), ...lotes], analisis: [...(doc.analisis || []), ...analisis] },
    reporte: { lotes: lotes.length, analisis: analisis.length,
               analisis_vacios: todos.length - analisis.length, huerfanos },
  };
}
```

- [ ] **Step 4: Implement `scripts/fusionar-anio.mjs`**

```js
/**
 * Suma una vendimia del Excel al documento de Lotes, en un archivo nuevo.
 * NO escribe en la base: la subida es importar.mjs, con su respaldo y su freno.
 *
 *   python "<repo Lotes>\migrar_excel.py" "Lotes CIW 2025.xlsx" datos-origen/lotes-2025-convertido.json
 *   node scripts/fusionar-anio.mjs --anio 2025 \
 *        --doc respaldo-nube-lotes-<fecha>.json \
 *        --anio-json datos-origen/lotes-2025-convertido.json \
 *        --salida datos-origen/lotes-con-2025.json
 *
 * --doc acepta el respaldo de `wrangler d1 execute --json` (array con
 * results[0].json) o un documento pelado.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fusionarAnio } from './fusionar-anio-nucleo.mjs';

const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
const anio = Number(arg('--anio'));
const rDoc = arg('--doc'), rAnio = arg('--anio-json'), rSal = arg('--salida');
if (!anio || !rDoc || !rAnio || !rSal) {
  console.error('uso: node scripts/fusionar-anio.mjs --anio 2025 --doc <respaldo> --anio-json <convertido> --salida <archivo>');
  process.exit(1);
}

const crudo = JSON.parse(readFileSync(rDoc, 'utf8'));
const doc = Array.isArray(crudo) ? JSON.parse(crudo[0].results[0].json) : crudo;
const { doc: nuevo, reporte } = fusionarAnio(doc, JSON.parse(readFileSync(rAnio, 'utf8')), anio);

writeFileSync(rSal, JSON.stringify(nuevo));
console.log(`Documento v${doc.meta?.version}: +${reporte.lotes} lotes ${anio}, +${reporte.analisis} análisis`
  + ` (${reporte.analisis_vacios} renglones vacíos salteados)`);
if (reporte.huerfanos.length) console.log(`AVISO: análisis de lotes que no están en LOTES: ${reporte.huerfanos.join(', ')}`);
console.log(`Escrito en ${rSal} (${(JSON.stringify(nuevo).length / 1e6).toFixed(2)} MB)`);
```

`importar.mjs --modulo lotes` lee el documento pelado y saca la versión de `$.meta.version`, así que la salida va tal cual. La versión sube en uno a propósito (ver el test).

- [ ] **Step 5: Run tests** — `npx vitest run test/lotes-fusionar-anio.test.mjs` → PASS.

- [ ] **Step 6: Correrlo con los datos reales (local, sin subir nada)**

```bash
python "C:/Users/Bmax/OneDrive - BODEGAS ESMERALDA SA/Escritorio/claude/Lotes/migrar_excel.py" "C:/Users/Bmax/OneDrive - BODEGAS ESMERALDA SA/Año 2025/Registro de Lotes CIW 2025/Lotes CIW 2025.xlsx" datos-origen/lotes-2025-convertido.json
node scripts/fusionar-anio.mjs --anio 2025 --doc ../catenainstitute/respaldo-nube-lotes-2026-10-02-v69.json --anio-json datos-origen/lotes-2025-convertido.json --salida datos-origen/lotes-con-2025.json
```

Esperado: ~364 lotes, ~4.005 análisis, ~380 vacíos (pueden variar un poco si el Excel cambió; si `migrar_excel.py` ya descarta renglones sin fecha, los vacíos serán menos). Anotar los huérfanos y mostrárselos al usuario. Confirmar que `datos-origen/` está gitignorado (no commitear datos).

Comparar, para 5 lotes al azar, el JSON contra la fila del Excel (variedad, ID, kilos, litros actuales, envases) y para 5 análisis (pH, SO2 L, AV). Si alguna columna 2025 no mapea (cabecera distinta a 2026), arreglar en el conversor y reportarlo.

- [ ] **Step 7: Commit**

```bash
git add scripts/fusionar-anio.mjs scripts/fusionar-anio-nucleo.mjs test/lotes-fusionar-anio.test.mjs
git commit -m "feat(lotes): script para sumar una vendimia del Excel al documento"
```

---

### Task 9: Prueba completa en local con 2025 + 2026 reales

**Files:** ninguno nuevo (arreglos que salgan, en el archivo que corresponda, con su test).

- [ ] **Step 1:** Levantar `dev:sin-ia` (memoria `catenainstitute-verificar-en-navegador`), y sembrar la D1 **local** con `datos-origen/lotes-con-2025.json`: `node scripts/importar.mjs --modulo lotes --local --datos datos-origen/lotes-con-2025.json` (nunca `--remote`).
- [ ] **Step 2:** Recorrer las 11 pestañas con 2026 solo, 2025 solo y ambos. Anotar cualquier lugar donde un 25xxx se cuele con 2025 apagado o falte con 2025 prendido.
- [ ] **Step 3:** Con 2026 solo: crear un lote nuevo `25137` → tiene que decir "ya existe". Abrir la ficha de un 25xxx desde el buscador de una OT → la encuentra.
- [ ] **Step 4:** Editar un análisis 2025 y un lote 2025, guardar, recargar → persisten. Guardar con los dos años prendidos y medir el tiempo del POST.
- [ ] **Step 5:** Medir (como en `lotes-web-rendimiento`: `click()` + `document.body.offsetHeight`) el render de Análisis y Lotes con un año y con los dos. Anotar los números para el usuario.
- [ ] **Step 6:** Medir en Node la CPU de parse+stringify del documento de ~4 MB (mismo método que `plataforma-error-1102-cpu`) para dejar el dato de por qué hace falta Workers Paid.
- [ ] **Step 7:** `npx vitest run` y `npx tsc --noEmit` verdes. Commit de cualquier arreglo. Push de la rama `feat/lotes-anios` (no merge a `main` sin OK del usuario).

---

## Puesta en marcha (NO es parte de la ejecución: solo con OK del usuario y Workers Paid confirmado)

1. Merge de `feat/lotes-anios` a `main` en `repos\catenainstitute`, limpio y al día con `origin`.
2. Respaldo nuevo de la nube (`respaldo-nube-lotes-<fecha>-pre-2025.json`), re-chequear `version` (Oriana edita en vivo) y rearmar `lotes-con-2025.json` sobre ese respaldo con `fusionar-anio.mjs`.
3. `node scripts/importar.mjs --modulo lotes --remote --piso-la-web --datos datos-origen/lotes-con-2025.json` → `✓ Importación verificada`.
4. `npx wrangler deploy` desde `repos\catenainstitute` en `main`.
5. Ctrl+F5; prender 2025; en el Dashboard, "Confirmar todos" en la bandeja de etapas para los lotes 2025 (o revisarlos uno por uno, según decida el usuario).
