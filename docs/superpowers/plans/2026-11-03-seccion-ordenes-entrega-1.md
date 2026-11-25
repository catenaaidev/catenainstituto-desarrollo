# Sección Órdenes de trabajo — Entrega 1 · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una 4ª tarjeta del portal, **Órdenes de trabajo** (`/ordenes/`), con portada de 3 tarjetas (Nueva orden · Pendientes · Historial). En esta entrega cubre las órdenes de Lotes que ya se guardan: OT de movimientos y Órdenes de corrección SO₂. Esas órdenes salen de Movimientos y de Correcciones.

**Architecture:** `/ordenes/` es una página estática propia. Lista resúmenes que arma el Worker (`GET /ordenes/api/lista`) leyendo el documento de Lotes (y el de Prensas, que en esta entrega no aporta nada). Armar, ver, confirmar o ejecutar una orden se hace en la pantalla de Lotes en **modo órdenes** (`/lotes/?orden=…`). En ese modo Lotes esconde su barra de pestañas y muestra solo esa orden, con la lógica de siempre (autoguardado, 409, carpeta OneDrive, deshacer).

**Tech Stack:** Cloudflare Worker (TypeScript) + D1, front en ES modules sin build, vitest con `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-11-03-seccion-ordenes-de-trabajo-design.md`

## Global Constraints

- Repo de trabajo: worktree `C:\Users\Bmax\repos\catenainstitute-ordenes`, rama `feat/seccion-ordenes`. **No tocar `C:\Users\Bmax\repos\catenainstitute`** (otras sesiones cambian de rama ahí).
- `node_modules`: si el worktree no tiene, crear una junction a la del repo principal: `cmd /c mklink /J node_modules ..\catenainstitute\node_modules`. Copiar `worker-configuration.d.ts` si falta.
- Push a `main` = producción (Workers Builds). **Nunca pushear ni mergear a `main` sin OK explícito del usuario.** Trabajar en la rama; el PR lo abre Claude cuando el usuario lo pida.
- Textos de la UI en castellano rioplatense (vos), como el resto de la plataforma. Sin `alert/confirm/prompt` nativos (hay tests que lo vigilan): usar `CI.avisar/CI.confirmar` en páginas nuevas y `avisar/confirmar` de `dialogos.js` en Lotes.
- Estética "Piedra y tinta": tokens y clases `ci-*` de `public/shared/estilo.css`. No inventar colores.
- **Inventario de tanques se queda en Lotes → Movimientos** (con su "🖨 OT inventario"). No aparece en `/ordenes/`.
- Barriles queda afuera.
- El modal viejo de movimiento suelto (`_abrirModalOT` en `vista-movimientos.js`) **se queda**: ya no emite OT, solo confirma movimientos sueltos pendientes.
- Permisos: no hay rol ni migración nuevos. `/ordenes/` se abre con rol en prensas **o** lotes. "Nueva orden" de un módulo requiere editor/admin en ese módulo.
- Tests: `npx vitest run <archivo>` para uno, `npx vitest run` toda la suite, `npx tsc --noEmit` el typecheck. Todo en verde antes de cerrar cada tarea que toque TS.

## Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `src/ordenes/resumen.ts` (nuevo) | Puro: documento de un módulo → `ResumenOrden[]` |
| `src/ordenes/rutas.ts` (nuevo) | `rolOrdenes(modulos)`, `rutasOrdenes(req, env, ctx, sub)` con `GET /lista` |
| `src/index.ts` | Rutea `/ordenes/api/*` y sirve `/ordenes/` con `window.CIW` |
| `public/index.html` | 4ª tarjeta + forma de puntos `orden` |
| `public/shared/barra.js` | Enlace "Órdenes" en la barra común |
| `public/ordenes/index.html` (nuevo) | La página |
| `public/ordenes/js/catalogo.js` (nuevo) | Puro: tipos de orden por módulo + búsqueda con sinónimos |
| `public/ordenes/js/lista.js` (nuevo) | Puro: filtrar, estado ⇄ URL, URL para abrir una orden |
| `public/ordenes/js/app.js` (nuevo) | La vista (portada, Nueva orden, Pendientes, Historial) |
| `public/lotes/js/modo-ordenes.js` (nuevo) | Puro: leer `?orden=` y decidir qué abrir; URL de vuelta |
| `public/lotes/app.js` | Arranca el modo órdenes después de `cargarDatos()` |
| `public/lotes/js/vista-movimientos.js` | Sin sub-pestaña OT; `abrirOTUnica`, `emitirEnModoOrden`; 🖨 del Historial y Agenda llevan al modo |
| `public/lotes/js/vista-ot-lista.js` | Opción `unica` (solo la hoja, sin lista) |
| `public/lotes/js/vista-ot-emitir.js` | `abrirEmitirOT(onListo, { plantilla })` |
| `public/lotes/js/vista-so2.js` | Registro sin la tarjeta de órdenes; `fijarOrdenUnica(id)` para el modo |
| `public/lotes/js/vista-ordenes-correccion.js` | `pintarOrdenesCorreccion(cont, alCambiar, { soloId })` |
| `public/lotes/js/vista-orden-correccion.js` | Textos: ejecutar "desde Órdenes de trabajo → Pendientes" |
| `public/lotes/index.html` | Sin botón "Orden de corrección" en `#corrSub`; CSS y banda del modo órdenes |
| `vitest.config.ts`, `test/env.d.ts` | Bindings `PORTAL_HTML`, `ORDENES_HTML` para tests de archivos |
| `test/ordenes-*.test.*` (nuevos) | Tests |

---

### Task 1: Resumen de órdenes en el servidor (puro)

**Files:**
- Create: `src/ordenes/resumen.ts`
- Test: `test/ordenes-resumen.test.ts`

**Interfaces:**
- Produces: `resumenOrdenes(modulo: 'prensas'|'lotes', datos: Record<string, unknown>): ResumenOrden[]`, `type ResumenOrden`, `type EstadoOrden`.

- [ ] **Step 1: Write the failing test**

```ts
// test/ordenes-resumen.test.ts
import { describe, it, expect } from 'vitest';
import { resumenOrdenes } from '../src/ordenes/resumen';

const OT = (x: Record<string, unknown>) => ({
  id: 'ot-1', ot: '0945', plantilla: 'barricas-barricas', fecha: '2026-11-03',
  estado: 'pendiente', emitio: 'Ana', lotes: [{ lote: '26217', mov_id: 'm1' }], ...x,
});

describe('resumenOrdenes — Lotes', () => {
  it('resume una OT de movimientos', () => {
    const r = resumenOrdenes('lotes', { ordenes_trabajo: [OT({})], movimientos: [{ id: 'm1' }] });
    expect(r).toEqual([{
      modulo: 'lotes', id: 'ot-1', fuente: 'ordenes_trabajo', tipo: 'barricas-barricas',
      numero: '0945', fecha: '2026-11-03', estado: 'pendiente', lotes: ['26217'],
      lote_corte: '', emitio: 'Ana',
    }]);
  });

  it('una OT con estado ejecutado (o sin estado) sale como ejecutada', () => {
    const d = { ordenes_trabajo: [OT({ estado: 'ejecutado' }), OT({ id: 'ot-2', estado: undefined, lotes: [{ lote: '1', mov_id: 'm1' }] })],
                movimientos: [{ id: 'm1' }] };
    expect(resumenOrdenes('lotes', d).map((o) => o.estado)).toEqual(['ejecutada', 'ejecutada']);
  });

  it('oculta las OT huérfanas (ningún movimiento vivo), igual que filtrarOrdenes', () => {
    const r = resumenOrdenes('lotes', { ordenes_trabajo: [OT({})], movimientos: [{ id: 'otro' }] });
    expect(r).toEqual([]);
  });

  it('el lote del corte va en lote_corte', () => {
    const r = resumenOrdenes('lotes', {
      ordenes_trabajo: [OT({ plantilla: 'barricas-tanque', lote_corte: { lote: '26900' } })],
      movimientos: [{ id: 'm1' }],
    });
    expect(r[0].lote_corte).toBe('26900');
  });

  it('resume una orden de corrección SO₂ con sus tres estados', () => {
    const oc = (id: string, estado: string) => ({ id, numero: 'B240', fecha: '2026-11-02', emitio: 'Luis',
      estado, lotes: [{ lote: '26100' }, { lote: '26101' }] });
    const r = resumenOrdenes('lotes', { ordenes_correccion: [oc('oc-a', 'pendiente'), oc('oc-b', 'ejecutada'), oc('oc-c', 'anulada')] });
    expect(r.map((o) => [o.id, o.fuente, o.tipo, o.estado])).toEqual([
      ['oc-a', 'ordenes_correccion', 'correccion', 'pendiente'],
      ['oc-b', 'ordenes_correccion', 'correccion', 'ejecutada'],
      ['oc-c', 'ordenes_correccion', 'correccion', 'anulada'],
    ]);
    expect(r[0].lotes).toEqual(['26100', '26101']);
    expect(r[0].numero).toBe('B240');
  });

  it('ordena por fecha y número, lo más nuevo primero', () => {
    const r = resumenOrdenes('lotes', {
      ordenes_trabajo: [OT({ id: 'a', ot: '0900', fecha: '2026-10-01' }), OT({ id: 'b', ot: '0950', fecha: '2026-11-01' })],
      ordenes_correccion: [{ id: 'c', numero: 'B1', fecha: '2026-10-15', estado: 'pendiente', lotes: [] }],
      movimientos: [{ id: 'm1' }],
    });
    expect(r.map((o) => o.id)).toEqual(['b', 'c', 'a']);
  });

  it('tolera secciones ausentes o filas basura', () => {
    expect(resumenOrdenes('lotes', {})).toEqual([]);
    expect(resumenOrdenes('lotes', { ordenes_trabajo: [null, 3], ordenes_correccion: [null] })).toEqual([]);
  });
});

describe('resumenOrdenes — Prensas', () => {
  it('en la entrega 1 Prensas no tiene órdenes guardadas', () => {
    expect(resumenOrdenes('prensas', { lotes: [{ lote: '1' }] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ordenes-resumen.test.ts`
Expected: FAIL, "Failed to load url ../src/ordenes/resumen"

- [ ] **Step 3: Write minimal implementation**

```ts
// src/ordenes/resumen.ts
/**
 * Lo que la sección Órdenes de trabajo necesita de cada orden, sin bajar el
 * documento entero al navegador (el de Lotes pesa ~3,9 MB).
 *
 * Puro: recibe el documento ya parseado. Las reglas son espejo de las de la
 * pantalla de Lotes: una OT sin ningún movimiento vivo es huérfana y no se
 * muestra (ot-lista.js filtrarOrdenes), y el estado de una OT de movimientos
 * sigue a esEjecutado (sin estado o con uno raro = ejecutada).
 */
import { esEjecutado } from '../lotes/motores/movimientos';

export type EstadoOrden = 'pendiente' | 'ejecutada' | 'anulada';

export interface ResumenOrden {
  modulo: 'prensas' | 'lotes';
  id: string;
  fuente: 'ordenes_trabajo' | 'ordenes_correccion';
  /** Id de plantilla de OT ('barricas-barricas', 'traslado'…) o 'correccion'. */
  tipo: string;
  numero: string;
  fecha: string;
  estado: EstadoOrden;
  lotes: string[];
  lote_corte: string;
  emitio: string;
}

type Fila = Record<string, unknown>;
const filas = (v: unknown): Fila[] =>
  Array.isArray(v) ? v.filter((x): x is Fila => !!x && typeof x === 'object') : [];
const txt = (v: unknown) => (v == null ? '' : String(v).trim());
const lotesDe = (o: Fila) => filas(o.lotes).map((l) => txt(l.lote)).filter(Boolean);

function deTrabajo(datos: Fila): ResumenOrden[] {
  const vivos = new Set(filas(datos.movimientos).map((m) => m.id));
  return filas(datos.ordenes_trabajo)
    .filter((ot) => filas(ot.lotes).some((l) => vivos.has(l.mov_id)))
    .map((ot) => ({
      modulo: 'lotes' as const,
      id: txt(ot.id),
      fuente: 'ordenes_trabajo' as const,
      tipo: txt(ot.plantilla),
      numero: txt(ot.ot),
      fecha: txt(ot.fecha),
      estado: esEjecutado(ot) ? ('ejecutada' as const) : ('pendiente' as const),
      lotes: lotesDe(ot),
      lote_corte: txt((ot.lote_corte as Fila | undefined)?.lote),
      emitio: txt(ot.emitio),
    }));
}

function deCorreccion(datos: Fila): ResumenOrden[] {
  return filas(datos.ordenes_correccion).map((o) => {
    const e = txt(o.estado);
    return {
      modulo: 'lotes' as const,
      id: txt(o.id),
      fuente: 'ordenes_correccion' as const,
      tipo: 'correccion',
      numero: txt(o.numero),
      fecha: txt(o.fecha),
      estado: (e === 'pendiente' || e === 'anulada' ? e : 'ejecutada') as EstadoOrden,
      lotes: lotesDe(o),
      lote_corte: '',
      emitio: txt(o.emitio),
    };
  });
}

export function resumenOrdenes(modulo: 'prensas' | 'lotes', datos: Fila): ResumenOrden[] {
  const todas = modulo === 'lotes' ? [...deTrabajo(datos), ...deCorreccion(datos)] : [];
  return todas
    .filter((o) => o.id)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ordenes-resumen.test.ts` → PASS. Then `npx tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/ordenes/resumen.ts test/ordenes-resumen.test.ts
git commit -m "feat(ordenes): resumen de las órdenes de Lotes para la sección nueva"
```

---

### Task 2: Ruta `/ordenes/api/lista` y pantalla `/ordenes/` en el Worker

**Files:**
- Create: `src/ordenes/rutas.ts`
- Modify: `src/index.ts`, en las líneas que se indican abajo
- Create (provisional, la Task 4 la reemplaza): `public/ordenes/index.html` con `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Órdenes de trabajo</title></head><body></body></html>`
- Test: `test/ordenes-rutas.test.ts`, `test/inyeccion.test.ts` (sumar un caso)

**Interfaces:**
- Consumes: `resumenOrdenes` (Task 1), `identidad`, `emailDelUsuario`, `renovarCookie` (`src/auth.ts`), `armarInyeccion` (`src/index.ts`), `json` (`src/respuestas.ts`).
- Produces:
  - `rolOrdenes(modulos: Record<string,string>): 'admin'|'editor'|'lector'|null`, el mayor rol entre prensas y lotes.
  - `GET /ordenes/api/lista` → `{ modulos: { prensas?: Rol, lotes?: Rol }, ordenes: ResumenOrden[] }`, solo con los módulos en los que el usuario tiene rol.
  - `/ordenes/` → HTML con `window.CIW = { email, nombre, rol, modulo:'ordenes', modulos }`.

- [ ] **Step 1: Write the failing test**

```ts
// test/ordenes-rutas.test.ts
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { rolOrdenes } from '../src/ordenes/rutas';

const BASE = 'https://catenainstitute.example';
const SOLO_LOTES = 'solo-lotes@catenawines.com';
const SOLO_BARRILES = 'solo-barriles@catenawines.com';
const AMBOS = 'ambos@catenawines.com';

async function pedir(ruta: string, email?: string) {
  const headers: Record<string, string> = {};
  if (email) headers['Cf-Access-Authenticated-User-Email'] = email;
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(BASE + ruta, { headers, redirect: 'manual' }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeAll(async () => {
  const p = (e: string, m: string, r: string) =>
    env.DB.prepare('INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre) VALUES (?, ?, ?, ?)').bind(e, m, r, 'X').run();
  await p(SOLO_LOTES, 'lotes', 'lector');
  await p(SOLO_BARRILES, 'barriles', 'editor');
  await p(AMBOS, 'lotes', 'editor');
  await p(AMBOS, 'prensas', 'admin');
  const lotes = {
    meta: { version: 3 },
    movimientos: [{ id: 'm1' }],
    ordenes_trabajo: [{ id: 'ot-1', ot: '0945', plantilla: 'traslado', fecha: '2026-11-03', estado: 'pendiente',
      lotes: [{ lote: '26217', mov_id: 'm1' }] }],
    ordenes_correccion: [{ id: 'oc-1', numero: 'B240', fecha: '2026-11-02', estado: 'pendiente', lotes: [{ lote: '26100' }] }],
  };
  await env.DB.prepare("INSERT OR REPLACE INTO documento (modulo, version, json, autor, guardado) VALUES ('lotes', 3, ?, 'test', '2026-11-03')")
    .bind(JSON.stringify(lotes)).run();
});

describe('rolOrdenes', () => {
  it('toma el mayor rol entre prensas y lotes, e ignora barriles', () => {
    expect(rolOrdenes({ lotes: 'lector', prensas: 'editor' })).toBe('editor');
    expect(rolOrdenes({ lotes: 'admin' })).toBe('admin');
    expect(rolOrdenes({ prensas: 'lector' })).toBe('lector');
    expect(rolOrdenes({ barriles: 'admin' })).toBeNull();
    expect(rolOrdenes({})).toBeNull();
  });
});

describe('GET /ordenes/api/lista', () => {
  it('sin sesión: 401', async () => {
    expect((await pedir('/ordenes/api/lista')).status).toBe(401);
  });
  it('sin rol en prensas ni lotes: 403', async () => {
    expect((await pedir('/ordenes/api/lista', SOLO_BARRILES)).status).toBe(403);
  });
  it('con rol en lotes: trae las órdenes de Lotes y dice sus roles', async () => {
    const r = await pedir('/ordenes/api/lista', SOLO_LOTES);
    expect(r.status).toBe(200);
    const j = await r.json() as { modulos: Record<string, string>; ordenes: { id: string }[] };
    expect(j.modulos).toEqual({ lotes: 'lector' });
    expect(j.ordenes.map((o) => o.id)).toEqual(['ot-1', 'oc-1']);
  });
  it('con rol en los dos: modulos tiene los dos (Prensas sin documento no rompe)', async () => {
    const j = await (await pedir('/ordenes/api/lista', AMBOS)).json() as { modulos: Record<string, string> };
    expect(j.modulos).toEqual({ lotes: 'editor', prensas: 'admin' });
  });
  it('otra ruta bajo /ordenes/api: 404', async () => {
    expect((await pedir('/ordenes/api/nada', AMBOS)).status).toBe(404);
  });
});

describe('pantalla /ordenes/', () => {
  it('sin sesión: al login', async () => {
    const r = await pedir('/ordenes/');
    expect(r.status).toBe(302);
    expect(r.headers.get('Location')).toContain('/login.html');
  });
  it('sin rol en prensas ni lotes: al portal', async () => {
    const r = await pedir('/ordenes/', SOLO_BARRILES);
    expect(r.status).toBe(302);
    expect(new URL(r.headers.get('Location')!).pathname).toBe('/');
  });
});
```

Sumar a `test/inyeccion.test.ts`, dentro del `describe`:

```ts
  it('en ordenes: diálogo y barra, sin el Excel', () => {
    const h = armarInyeccion({ ...ctx, modulo: 'ordenes' }, 'Ana', 'ordenes');
    expect(h).toContain('<script src="/shared/dialogo.js"></script>');
    expect(h).toContain('<script defer src="/shared/barra.js"></script>');
    expect(h).not.toContain('/shared/exportar.js');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ordenes-rutas.test.ts test/inyeccion.test.ts`
Expected: FAIL (no existe `../src/ordenes/rutas`). El caso de inyección ya pasa: `armarInyeccion` acepta cualquier módulo. Se suma igual, para que nadie le meta el Excel a Órdenes después.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/ordenes/rutas.ts
/**
 * Sección Órdenes de trabajo: junta las órdenes de Prensas y de Lotes.
 *
 * No es un módulo con rol propio: se entra con el rol que se tenga en prensas
 * o en lotes, y cada lista trae SOLO los módulos en los que hay rol.
 */
import { identidad, type Rol } from '../auth';
import { json } from '../respuestas';
import { resumenOrdenes, type ResumenOrden } from './resumen';

const FUENTES = ['lotes', 'prensas'] as const;
const PESO: Record<string, number> = { lector: 1, editor: 2, admin: 3 };

/** El mayor rol entre prensas y lotes (barriles no cuenta). */
export function rolOrdenes(modulos: Record<string, string | null | undefined>): Rol | null {
  let mejor: Rol | null = null;
  for (const m of FUENTES) {
    const r = modulos[m];
    if (r && PESO[r] && (!mejor || PESO[r] > PESO[mejor])) mejor = r as Rol;
  }
  return mejor;
}

export async function rutasOrdenes(
  req: Request, env: Env, ctx: ExecutionContext, sub: string,
): Promise<Response | null> {
  if (sub !== '/lista' || req.method !== 'GET') return null;

  const modulos: Partial<Record<(typeof FUENTES)[number], Rol>> = {};
  const ordenes: ResumenOrden[] = [];
  for (const m of FUENTES) {
    const id = await identidad(req, env, ctx, m);
    if (!id?.rol) continue;
    modulos[m] = id.rol;
    const fila = await env.DB.prepare('SELECT json FROM documento WHERE modulo = ?')
      .bind(m).first<{ json: string }>();
    if (fila) ordenes.push(...resumenOrdenes(m, JSON.parse(fila.json)));
  }
  if (!Object.keys(modulos).length) {
    return json(403, { error: 'sin_permiso', detalles: ['No tenés rol en Prensas ni en Lotes.'] });
  }
  ordenes.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero));
  return json(200, { modulos, ordenes });
}
```

Cambios en `src/index.ts`:

1. Import (después de la línea 13): `import { rutasOrdenes, rolOrdenes } from './ordenes/rutas';`
2. Helper debajo de `const ICONO` (línea 33):
   ```ts
   const esPantallaOrdenes = (ruta: string) => ruta === '/ordenes' || ruta === '/ordenes/' || ruta === '/ordenes/index.html';
   ```
3. En `tocaLaBase` (líneas 90-93) sumar al final: `|| ruta.startsWith('/ordenes/api') || esPantallaOrdenes(ruta)`.
4. En el bloque de contraseña inicial (línea 113), cambiar `esPantalla` a:
   `const esPantalla = esPantallaOrdenes(ruta) || MODULOS.some(...)` (el `some` sigue igual).
5. Antes de `// ---- APIs de cada módulo ----` (línea 159):
   ```ts
       // ---- Sección Órdenes de trabajo (sin rol propio: el de prensas o lotes) ----
       if (ruta.startsWith('/ordenes/api/') || ruta === '/ordenes/api') {
         if (!(await emailDelUsuario(req, env))) {
           return json(401, { error: 'sin_sesion', detalles: ['Tu sesión se cerró. Iniciá sesión de nuevo.'] });
         }
         const r = await rutasOrdenes(req, env, ctx, ruta.slice('/ordenes/api'.length) || '/');
         return r ?? json(404, { error: `no existe ${req.method} ${ruta}` });
       }
       if (esPantallaOrdenes(ruta)) return servirOrdenes(req, env);
   ```
6. Función nueva, debajo de `servirConIdentidad`:
   ```ts
   /** /ordenes/: como servirConIdentidad, pero el rol sale de prensas o lotes. */
   async function servirOrdenes(req: Request, env: Env): Promise<Response> {
     const email = await emailDelUsuario(req, env);
     if (!email) return Response.redirect(new URL('/login.html', req.url).toString(), 302);
     const { results } = await env.DB.prepare('SELECT modulo, rol, nombre FROM perfiles WHERE email = ?')
       .bind(email).all<{ modulo: string; rol: string; nombre: string | null }>();
     const modulos = Object.fromEntries((results ?? []).map((r) => [r.modulo, r.rol]));
     const rol = rolOrdenes(modulos);
     if (!rol) return Response.redirect(new URL('/', req.url).toString(), 302);

     const url = new URL(req.url);
     url.pathname = '/ordenes/';
     const res = await env.ASSETS.fetch(new Request(url, { method: 'GET', headers: req.headers }));
     if (!res.ok || !(res.headers.get('Content-Type') ?? '').includes('text/html')) return res;

     const s = await sesion(req, env);
     const nombre = s?.nombre ?? results?.[0]?.nombre ?? email.split('@')[0];
     const contexto = { email, nombre, rol, modulo: 'ordenes', modulos };
     const html = (await res.text()).replace('</head>', armarInyeccion(contexto, nombre, 'ordenes'));
     const headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };
     const cookie = renovarCookie(req);
     if (cookie) headers['Set-Cookie'] = cookie;
     return new Response(html, { status: 200, headers });
   }
   ```
7. Crear el `public/ordenes/index.html` provisional (ver Files) para que `ASSETS` lo encuentre.

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/ordenes-rutas.test.ts test/inyeccion.test.ts test/usuarios.test.ts` → PASS. `npx tsc --noEmit` → OK.

- [ ] **Step 5: Commit**

```bash
git add src/ordenes/rutas.ts src/index.ts public/ordenes/index.html test/ordenes-rutas.test.ts test/inyeccion.test.ts
git commit -m "feat(ordenes): /ordenes/api/lista y pantalla /ordenes/ con el rol de prensas o lotes"
```

---

### Task 3: Tarjeta en el portal y enlace en la barra

**Files:**
- Modify: `public/index.html` (`MODULOS` línea 115, `tarjeta` línea 151, `.lista` línea 51, `FORMAS` línea 223, footer línea 107, `yo.modulos[m.id]` línea 652)
- Modify: `public/shared/barra.js` (líneas 16 y 29)
- Modify: `vitest.config.ts`, `test/env.d.ts` (binding `PORTAL_HTML`)
- Test: `test/barra.test.mjs` (sumar casos), `test/ordenes-portal.test.ts` (nuevo)

**Interfaces:**
- Consumes: rol de `/api/yo` (`yo.modulos`).
- Produces: enlace `href="/ordenes/"` en el portal y en la barra.

- [ ] **Step 1: Write the failing tests**

En `test/barra.test.mjs`, dentro del `describe`:

```js
  it('ofrece Órdenes si hay rol en prensas o lotes', () => {
    expect(html(ctx)).toContain('href="/ordenes/"');
    expect(html({ ...ctx, modulos: { barriles: 'editor' } })).not.toContain('href="/ordenes/"');
  });
  it('en /ordenes/ marca Órdenes como actual y no muestra Reporte', () => {
    const h = html({ ...ctx, modulo: 'ordenes' });
    expect(h).toContain('<span class="aqui" aria-current="page">Órdenes</span>');
    expect(h).not.toContain('/reporte');
  });
```

En `vitest.config.ts`, junto a los otros `leer(...)`: `const PORTAL_HTML = leer('public/index.html');`. Sumarlo a `bindings`. En `test/env.d.ts` agregar `PORTAL_HTML: string;`.

```ts
// test/ordenes-portal.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('portal: tarjeta Órdenes de trabajo', () => {
  const h = env.PORTAL_HTML;
  it('está en MODULOS con su forma de puntos', () => {
    expect(h).toMatch(/id: 'ordenes',\s*nombre: 'Órdenes de trabajo'/);
    expect(h).toContain("forma: 'orden'");
    expect(h).toMatch(/\n\s*orden\(\) \{/);
  });
  it('el rol de la tarjeta sale de prensas o lotes', () => {
    expect(h).toContain('function rolDe(m, modulos)');
  });
  it('la grilla tiene cuatro columnas', () => {
    expect(h).toContain('grid-template-columns:repeat(4,1fr)');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/barra.test.mjs test/ordenes-portal.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`public/shared/barra.js`:
- Línea 16: `var NOMBRES = { prensas: 'Prensas', barriles: 'Barriles', lotes: 'Lotes', ordenes: 'Órdenes' };`
- Después del `forEach` de la línea 29, antes del bloque "Reporte de gerencia":
  ```js
      // Órdenes de trabajo no es un módulo con rol propio: se ve con rol en prensas o lotes.
      if (actual === 'ordenes') p.push('<span class="aqui" aria-current="page">' + NOMBRES.ordenes + '</span>');
      else if (modulos.prensas || modulos.lotes) p.push('<a href="/ordenes/">' + NOMBRES.ordenes + '</a>');
  ```
- Actualizar el comentario de cabecera ("La inyecta el servidor en los tres módulos" → "en los módulos y en Órdenes").

`public/index.html`:
- Línea 51: `repeat(3,1fr)` → `repeat(4,1fr)`. Revisar que la regla `@media` de la línea 76 (una columna en el celular) siga igual.
- Comentario de la línea 112: "Los tres módulos" → "Los módulos de la plataforma, más Órdenes de trabajo (que no tiene rol propio)".
- Agregar al final de `MODULOS`:
  ```js
    {
      id: 'ordenes',
      nombre: 'Órdenes de trabajo',
      desc: 'Todas las órdenes de Prensas y Lotes en un lugar: nuevas, pendientes e historial.',
      forma: 'orden',
      listo: true,
    },
  ```
- Debajo de `ROLES`:
  ```js
  /* Órdenes de trabajo no tiene rol propio: vale el mayor entre prensas y
     lotes (espejo de rolOrdenes en src/ordenes/rutas.ts). */
  const PESO_ROL = { lector: 1, editor: 2, admin: 3 };
  function rolDe(m, modulos) {
    if (m.id !== 'ordenes') return modulos[m.id];
    return ['prensas', 'lotes'].map(k => modulos[k]).filter(r => PESO_ROL[r])
      .sort((a, b) => PESO_ROL[b] - PESO_ROL[a])[0];
  }
  ```
- Líneas 651-652: `yo.modulos[m.id]` → `rolDe(m, yo.modulos)` en los dos lugares (`conAcceso` y `tarjeta`).
- Footer (línea 107): `Control de Prensas · Mapa de Barriles · Lotes · Órdenes de trabajo`.
- En `FORMAS`, después de `barrica()`, una hoja de orden: rectángulo plano levemente inclinado, renglones y casilleros de tilde:
  ```js
      orden() {
        // una hoja de orden de trabajo, parada y apenas girada, con renglones y casilleros
        const X = .56, Y = .82, Z = 0;
        const borde = caja(-X, X, -Y, Y, -.01, .01);
        const renglon = k => { const y = .52 - k * .2; return [[-.3, y, Z], [.44, y, Z]]; };
        const casillero = k => { const y = .52 - k * .2, x = -.44, s = .05;
          return [[[x - s, y - s, Z], [x + s, y - s, Z]], [[x + s, y - s, Z], [x + s, y + s, Z]],
                  [[x + s, y + s, Z], [x - s, y + s, Z]], [[x - s, y + s, Z], [x - s, y - s, Z]]]; };
        const titulo = [[[-.44, .7, Z], [.2, .7, Z]]];
        const renglones = [0, 1, 2, 3, 4, 5].map(renglon);
        const casilleros = [0, 1, 2, 3, 4, 5].flatMap(casillero);
        return mezcla([
          [.3, lineas(borde)], [.1, () => [rr(-X, X), rr(-Y, Y), Z]],
          [.1, lineas(titulo)], [.3, lineas(renglones)], [.2, lineas(casilleros)],
        ]);
      },
  ```
  (`caja`, `lineas`, `mezcla`, `rr` ya existen arriba, en las líneas 189-220.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/barra.test.mjs test/ordenes-portal.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/shared/barra.js vitest.config.ts test/env.d.ts test/barra.test.mjs test/ordenes-portal.test.ts
git commit -m "feat(portal): tarjeta Órdenes de trabajo y enlace en la barra común"
```

---

### Task 4: Catálogo de tipos y búsqueda (puro)

**Files:**
- Create: `public/ordenes/js/catalogo.js`
- Test: `test/ordenes-catalogo.test.mjs`

**Interfaces:**
- Produces:
  - `TIPOS: {id, modulo:'prensas'|'lotes', nombre, desc, sinonimos:string[]}[]`. Los `id` de Lotes son ids de `PLANTILLAS_OT` más `'correccion'`.
  - `normalizar(s): string` (minúsculas, sin tildes, espacios colapsados).
  - `buscarTipos(q: string, modulosEditables: string[]): TIPOS[]`.
  - `nombreDeTipo(id): string`.

- [ ] **Step 1: Write the failing test**

```js
// test/ordenes-catalogo.test.mjs
import { describe, it, expect } from 'vitest';
import { TIPOS, buscarTipos, normalizar, nombreDeTipo } from '../public/ordenes/js/catalogo.js';
import { PLANTILLAS_OT } from '../public/lotes/js/ot-plantillas.js';

const ids = (r) => r.map((t) => t.id);

describe('catálogo de órdenes', () => {
  it('Lotes ofrece todas las plantillas de OT más la corrección SO₂, y nada más', () => {
    const lotes = TIPOS.filter((t) => t.modulo === 'lotes').map((t) => t.id).sort();
    expect(lotes).toEqual([...PLANTILLAS_OT.map((p) => p.id), 'correccion'].sort());
  });
  it('el nombre de una plantilla es el mismo que en Lotes', () => {
    for (const p of PLANTILLAS_OT) expect(nombreDeTipo(p.id)).toBe(p.nombre);
    expect(nombreDeTipo('correccion')).toBe('Corrección SO₂');
    expect(nombreDeTipo('raro')).toBe('raro');
  });
  it('Prensas todavía no ofrece tipos (llegan en la entrega 3)', () => {
    expect(TIPOS.filter((t) => t.modulo === 'prensas')).toEqual([]);
  });
});

describe('buscarTipos', () => {
  const L = ['lotes'];
  it('sin texto devuelve todos los del módulo editable, en orden del catálogo', () => {
    expect(ids(buscarTipos('', L))).toEqual(ids(TIPOS.filter((t) => t.modulo === 'lotes')));
  });
  it('sin módulos editables no devuelve nada', () => {
    expect(buscarTipos('', [])).toEqual([]);
  });
  it('encuentra por sinónimo, sin importar tildes ni mayúsculas', () => {
    expect(ids(buscarTipos('so2', L))).toEqual(['correccion']);
    expect(ids(buscarTipos('SULFUROSO', L))).toEqual(['correccion']);
    expect(ids(buscarTipos('correccion', L))).toEqual(['correccion']);
    expect(ids(buscarTipos('mezcla', L))).toEqual(['barricas-tanque', 'corte-achique']);
    expect(ids(buscarTipos('barrica a tanque', L))).toContain('barrica-tanque');
  });
  it('todas las palabras tienen que aparecer', () => {
    expect(ids(buscarTipos('trasiego tq', L))).toEqual(['tq-barricas', 'tq-tq']);
  });
  it('normalizar saca tildes y espacios de más', () => {
    expect(normalizar('  Corrección   SO₂ ')).toBe('correccion so2');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/ordenes-catalogo.test.mjs` → FAIL (no existe el módulo).

- [ ] **Step 3: Implement**

```js
// public/ordenes/js/catalogo.js
/* ===== Órdenes de trabajo — catálogo de tipos (puro) =====
 * Lo que se puede emitir desde «Nueva orden». Los id de Lotes son los de
 * PLANTILLAS_OT (public/lotes/js/ot-plantillas.js) + 'correccion'; un test
 * vigila que no se desincronicen. Los nombres son copia de las plantillas. */
'use strict';

export const TIPOS = [
  { id: 'barricas-barricas', modulo: 'lotes', nombre: 'Trasiego fin FML de barricas a barricas',
    desc: 'Pasar el vino de barricas a barricas al terminar la FML.',
    sinonimos: ['trasiego', 'fml', 'barricas', 'barrica a barrica'] },
  { id: 'tq-barricas', modulo: 'lotes', nombre: 'Trasiego fin FML de TQ a barricas',
    desc: 'Del tanque a barricas al terminar la FML.',
    sinonimos: ['trasiego', 'fml', 'tq', 'tanque a barrica', 'llenado'] },
  { id: 'barrica-tanque', modulo: 'lotes', nombre: 'Trasiego de barrica a tanque',
    desc: 'Vaciar barricas a un tanque.',
    sinonimos: ['trasiego', 'barrica a tanque', 'vaciado', 'descube'] },
  { id: 'tq-tq', modulo: 'lotes', nombre: 'Trasiego de tq a tq',
    desc: 'De un tanque a otro.',
    sinonimos: ['trasiego', 'tq', 'tanque a tanque'] },
  { id: 'barricas-tanque', modulo: 'lotes', nombre: 'Corte',
    desc: 'Juntar lotes en uno nuevo o en uno existente.',
    sinonimos: ['corte', 'mezcla', 'blend', 'ensamblaje'] },
  { id: 'corte-achique', modulo: 'lotes', nombre: 'Corte + achique',
    desc: 'Corte y repartir lo que sobra en otras vasijas.',
    sinonimos: ['corte', 'achique', 'mezcla', 'blend'] },
  { id: 'traslado', modulo: 'lotes', nombre: 'Traslado',
    desc: 'Mandar vino a otra bodega.',
    sinonimos: ['traslado', 'salida', 'envio', 'otra bodega', 'despacho'] },
  { id: 'correccion', modulo: 'lotes', nombre: 'Corrección SO₂',
    desc: 'Orden de corrección de sulfuroso de los lotes bajos.',
    sinonimos: ['correccion', 'so2', 'sulfuroso', 'metabisulfito', 'mbk', 'agregado'] },
];

export function normalizar(s){
  return String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

const _texto = t => normalizar([t.nombre, t.desc, ...t.sinonimos].join(' '));

/** Los tipos de los módulos donde se puede emitir, que contienen TODAS las palabras de q. */
export function buscarTipos(q, modulosEditables){
  const palabras = normalizar(q).split(' ').filter(Boolean);
  return TIPOS
    .filter(t => (modulosEditables || []).includes(t.modulo))
    .filter(t => { const x = _texto(t); return palabras.every(p => x.includes(p)); });
}

export function nombreDeTipo(id){
  const t = TIPOS.find(x => x.id === id);
  return t ? t.nombre : String(id ?? '');
}
```

Nota: `normalizar('SO₂')` da `so2` porque NFKD convierte el subíndice ₂ en `2`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/ordenes-catalogo.test.mjs` → PASS. Si "trasiego tq" trae algo de más, ajustar los sinónimos, **no** el test.

- [ ] **Step 5: Commit**

```bash
git add public/ordenes/js/catalogo.js test/ordenes-catalogo.test.mjs
git commit -m "feat(ordenes): catálogo de tipos de orden con búsqueda por sinónimos"
```

---

### Task 5: Filtros, URL y enlaces de la lista (puro)

**Files:**
- Create: `public/ordenes/js/lista.js`
- Test: `test/ordenes-lista.test.mjs`

**Interfaces:**
- Consumes: forma de `ResumenOrden` (Task 1).
- Produces:
  - `filtrar(ordenes, { vista:'pendientes'|'historial', modulo:''|'lotes'|'prensas', tipo:'', desde:'', hasta:'', q:'' })`
  - `contarPendientes(ordenes): number`
  - `estadoDeURL(search): {v, modulo, tipo, desde, hasta, q}` y `urlDeEstado(estado): string` (`'?v=…&…'`, sin claves vacías)
  - `urlAbrir(orden, volver): string` → `'/lotes/?orden=<id>&volver=<encodeURIComponent(volver)>'`
  - `urlNueva(tipo, volver): string` → `'/<modulo>/?orden=nueva:<id>&volver=…'`

- [ ] **Step 1: Write the failing test**

```js
// test/ordenes-lista.test.mjs
import { describe, it, expect } from 'vitest';
import { filtrar, contarPendientes, estadoDeURL, urlDeEstado, urlAbrir, urlNueva } from '../public/ordenes/js/lista.js';

const O = (x) => ({ modulo: 'lotes', id: 'x', fuente: 'ordenes_trabajo', tipo: 'traslado', numero: '0945',
  fecha: '2026-11-03', estado: 'pendiente', lotes: ['26217'], lote_corte: '', emitio: 'Ana', ...x });
const LISTA = [
  O({ id: 'a' }),
  O({ id: 'b', estado: 'ejecutada', numero: '0900', fecha: '2026-10-01' }),
  O({ id: 'c', tipo: 'correccion', fuente: 'ordenes_correccion', numero: 'B240', lotes: ['26100'] }),
  O({ id: 'd', estado: 'anulada', tipo: 'correccion', numero: 'B200' }),
  O({ id: 'e', tipo: 'barricas-tanque', lote_corte: '26900', lotes: ['1', '2'] }),
];
const ids = (r) => r.map((o) => o.id);

describe('filtrar', () => {
  it('pendientes = solo estado pendiente; historial = ejecutadas y anuladas', () => {
    expect(ids(filtrar(LISTA, { vista: 'pendientes' }))).toEqual(['a', 'c', 'e']);
    expect(ids(filtrar(LISTA, { vista: 'historial' }))).toEqual(['b', 'd']);
  });
  it('por tipo y por módulo', () => {
    expect(ids(filtrar(LISTA, { vista: 'pendientes', tipo: 'correccion' }))).toEqual(['c']);
    expect(ids(filtrar(LISTA, { vista: 'pendientes', modulo: 'prensas' }))).toEqual([]);
  });
  it('por rango de fecha (inclusive)', () => {
    expect(ids(filtrar(LISTA, { vista: 'historial', desde: '2026-10-02' }))).toEqual(['d']);
    expect(ids(filtrar(LISTA, { vista: 'historial', hasta: '2026-10-01' }))).toEqual(['b']);
  });
  it('el texto busca en N°, lotes y lote del corte', () => {
    expect(ids(filtrar(LISTA, { vista: 'pendientes', q: 'b24' }))).toEqual(['c']);
    expect(ids(filtrar(LISTA, { vista: 'pendientes', q: '26100' }))).toEqual(['c']);
    expect(ids(filtrar(LISTA, { vista: 'pendientes', q: '26900' }))).toEqual(['e']);
  });
});

describe('contarPendientes', () => {
  it('cuenta solo las pendientes', () => expect(contarPendientes(LISTA)).toBe(3));
});

describe('estado ⇄ URL', () => {
  it('ida y vuelta, sin claves vacías', () => {
    const e = { v: 'pendientes', modulo: 'lotes', tipo: '', desde: '', hasta: '', q: '0945' };
    expect(urlDeEstado(e)).toBe('?v=pendientes&modulo=lotes&q=0945');
    expect(estadoDeURL('?v=pendientes&modulo=lotes&q=0945')).toEqual(e);
  });
  it('una vista desconocida es la portada', () => {
    expect(estadoDeURL('?v=raro').v).toBe('');
    expect(estadoDeURL('').v).toBe('');
  });
});

describe('enlaces', () => {
  it('abrir una orden de Lotes en modo órdenes, con la vuelta', () => {
    expect(urlAbrir(O({ id: 'ot-1' }), '/ordenes/?v=pendientes'))
      .toBe('/lotes/?orden=ot-1&volver=%2Fordenes%2F%3Fv%3Dpendientes');
  });
  it('nueva orden', () => {
    expect(urlNueva({ id: 'traslado', modulo: 'lotes' }, '/ordenes/?v=nueva'))
      .toBe('/lotes/?orden=nueva%3Atraslado&volver=%2Fordenes%2F%3Fv%3Dnueva');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/ordenes-lista.test.mjs` → FAIL.

- [ ] **Step 3: Implement**

```js
// public/ordenes/js/lista.js
/* ===== Órdenes de trabajo — lista, URL y enlaces (puro) ===== */
'use strict';

const VISTAS = ['nueva', 'pendientes', 'historial'];
const CLAVES = ['v', 'modulo', 'tipo', 'desde', 'hasta', 'q'];

export function filtrar(ordenes, { vista = 'pendientes', modulo = '', tipo = '', desde = '', hasta = '', q = '' } = {}){
  const t = String(q || '').trim().toLowerCase();
  return (ordenes || [])
    .filter(o => vista === 'historial' ? o.estado !== 'pendiente' : o.estado === 'pendiente')
    .filter(o => !modulo || o.modulo === modulo)
    .filter(o => !tipo || o.tipo === tipo)
    .filter(o => !desde || String(o.fecha || '') >= desde)
    .filter(o => !hasta || String(o.fecha || '') <= hasta)
    .filter(o => !t ||
      String(o.numero || '').toLowerCase().includes(t) ||
      (o.lotes || []).some(l => String(l).toLowerCase().includes(t)) ||
      String(o.lote_corte || '').toLowerCase().includes(t));
}

export const contarPendientes = ordenes => (ordenes || []).filter(o => o.estado === 'pendiente').length;

export function estadoDeURL(search){
  const p = new URLSearchParams(search || '');
  const e = Object.fromEntries(CLAVES.map(k => [k, p.get(k) || '']));
  if (!VISTAS.includes(e.v)) e.v = '';
  return e;
}

export function urlDeEstado(e){
  const p = new URLSearchParams();
  for (const k of CLAVES) if (e && e[k]) p.set(k, e[k]);
  const s = p.toString();
  return s ? '?' + s : '';
}

const _volver = v => '&volver=' + encodeURIComponent(v || '/ordenes/');

export const urlAbrir = (o, volver) =>
  '/' + o.modulo + '/?orden=' + encodeURIComponent(o.id) + _volver(volver);

export const urlNueva = (t, volver) =>
  '/' + t.modulo + '/?orden=' + encodeURIComponent('nueva:' + t.id) + _volver(volver);
```

- [ ] **Step 4: Run tests** → `npx vitest run test/ordenes-lista.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/ordenes/js/lista.js test/ordenes-lista.test.mjs
git commit -m "feat(ordenes): filtros, estado en la URL y enlaces de la lista"
```

---

### Task 6: La página `/ordenes/`

**Files:**
- Modify (reemplaza el provisional): `public/ordenes/index.html`
- Create: `public/ordenes/js/app.js`
- Modify: `vitest.config.ts`, `test/env.d.ts` (binding `ORDENES_HTML` = `leer('public/ordenes/index.html')`)
- Test: `test/ordenes-pantalla.test.ts`

**Interfaces:**
- Consumes: `TIPOS`, `buscarTipos`, `nombreDeTipo` (Task 4); `filtrar`, `contarPendientes`, `estadoDeURL`, `urlDeEstado`, `urlAbrir`, `urlNueva` (Task 5); `GET /ordenes/api/lista` (Task 2); `window.CIW.modulos`; `CI.avisar` (`/shared/dialogo.js`, lo inyecta el server).

**Comportamiento** (del spec; cada punto se verifica en la Task 9):
- **Portada** (`v` vacío): tres tarjetas grandes en fila (una columna en el celular, ≤760 px): **Nueva orden** ("Emití una orden de trabajo"), **Pendientes** (con el conteo, "N pendientes") e **Historial** ("Órdenes ejecutadas y anuladas"). Un lector no ve "Nueva orden": quedan dos.
- Al entrar a una sub-vista: barra chica `← Inicio · Nueva orden · Pendientes · Historial` (la actual con `aria-current`). Cada cambio hace `history.pushState` con `urlDeEstado`, y `popstate` redibuja.
- **Nueva orden**: `<input type="search" id="ordBusca">` con foco al entrar, placeholder "¿Qué orden vas a hacer?". Debajo, columnas por módulo editable (Prensas | Lotes; en esta entrega solo Lotes tiene tipos, y una columna sin tipos no se dibuja). Cada tipo es un `<a class="ord-tipo" href="urlNueva(t, location.pathname+location.search)">` con nombre y desc. Al tipear se filtra con `buscarTipos`. ↑/↓ mueven la selección (`.on`) y Enter navega a la seleccionada (la primera si no hay). Con `/` o Ctrl+K desde cualquier lado se enfoca el buscador. Sin resultados: "Ningún tipo de orden con «x»." Si el usuario no es editor en ningún módulo, mensaje "Solo podés consultar órdenes." y nada más.
- **Pendientes / Historial**: barra de filtros (Módulo, solo si hay más de uno; Tipo, con los tipos que aparecen en la lista; Desde, Hasta; texto "N° o lote"). Cada cambio actualiza la URL con `history.replaceState`. Tabla: N° · Tipo (`nombreDeTipo`) · Fecha (dd/mm/aaaa; con 📅 si es pendiente y la fecha es mayor que hoy) · Lotes (hasta 4 + "+N"; si hay `lote_corte`: "26900 (corte de N lotes)") · Estado · Emitió. En Pendientes las filas de 2 módulos llevan etiqueta Prensas/Lotes. Toda la fila es un enlace a `urlAbrir(o, location.pathname + location.search)`. Vacío: "No hay órdenes pendientes con estos filtros." / "No hay órdenes en el historial con estos filtros."
- Carga: `fetch('/ordenes/api/lista')` al arrancar. Si falla, `CI.avisar('No se pudo cargar la lista de órdenes. Probá recargar.', { tipo: 'mal' })` y un mensaje en la página. Mientras carga: "Cargando órdenes…".
- Escape: todo texto de datos pasa por `esc()` (copiar la de `public/index.html`).

- [ ] **Step 1: Write the failing test**

```ts
// test/ordenes-pantalla.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('public/ordenes/index.html', () => {
  const h = env.ORDENES_HTML;
  it('usa el estilo común y su app como módulo', () => {
    expect(h).toContain('<link rel="stylesheet" href="/shared/estilo.css">');
    expect(h).toContain('<script type="module" src="/ordenes/js/app.js"></script>');
  });
  it('tiene título y lang', () => {
    expect(h).toContain('<html lang="es">');
    expect(h).toContain('<title>Órdenes de trabajo</title>');
  });
  it('no usa alert/confirm/prompt', () => {
    expect(h).not.toMatch(/\b(confirm|alert|prompt)\(/);
  });
});
```

- [ ] **Step 2: Run** → `npx vitest run test/ordenes-pantalla.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`public/ordenes/index.html`: `<!doctype html><html lang="es">`, `<meta name="viewport" content="width=device-width,initial-scale=1">`, `<title>Órdenes de trabajo</title>`, `<link rel="stylesheet" href="/shared/estilo.css">`. Un `<style>` propio con prefijo `ord-` que use solo tokens (`var(--bg)`, `--panel`, `--line`, `--txt`, `--muted`, `--accent`, `--serif`, `--sans`, `--ci-r`, `--ci-tap`). `body{margin:0;background:var(--bg);color:var(--txt);font-family:var(--sans)}`. Dentro del body: `<main id="ord" class="ord"><h1 class="ord-tit">Órdenes de trabajo</h1><div id="ordNav"></div><div id="ordCuerpo">Cargando órdenes…</div></main>` y al final `<script type="module" src="/ordenes/js/app.js"></script>`. El título va en `--serif`, como los encabezados de Prensas. Las tarjetas de portada siguen el estilo de las del portal (borde de tinta arriba, nombre en serif, descripción en `--muted`). Ancho máximo 1100px, gutter de 16px en el celular, sin scroll horizontal (la tabla va en un contenedor con `overflow-x:auto`).

`public/ordenes/js/app.js`, esqueleto:

```js
/* ===== Órdenes de trabajo — la página =====
 * Portada con tres tarjetas, y las vistas Nueva orden / Pendientes / Historial.
 * El estado (vista y filtros) vive en la URL: se puede copiar y recargar. */
'use strict';
import { TIPOS, buscarTipos, nombreDeTipo } from './catalogo.js';
import { filtrar, contarPendientes, estadoDeURL, urlDeEstado, urlAbrir, urlNueva } from './lista.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const CIW = window.CIW || { modulos: {} };
const EDITA = r => r === 'editor' || r === 'admin';
const modulosConRol = () => ['prensas', 'lotes'].filter(m => CIW.modulos[m]);
const modulosEditables = () => modulosConRol().filter(m => EDITA(CIW.modulos[m]));
const NOMBRE_MOD = { prensas: 'Prensas', lotes: 'Lotes' };

let _ordenes = null;          // null = cargando
let _estado = estadoDeURL(location.search);
let _sel = 0;                 // tipo resaltado en Nueva orden

const aqui = () => location.pathname + location.search;
const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const fmtFecha = f => /^\d{4}-\d{2}-\d{2}/.test(f || '') ? f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4) : (f || '');

function ir(cambios, { reemplazar = false } = {}){
  _estado = { ..._estado, ...cambios };
  const url = location.pathname + urlDeEstado(_estado);
  history[reemplazar ? 'replaceState' : 'pushState'](null, '', url);
  pintar();
}

function pintarNav(){ /* '' en portada; si no, ← Inicio + las 3 (o 2) con aria-current */ }
function pintarPortada(){ /* 3 tarjetas <button data-ir="nueva|pendientes|historial">, conteo de pendientes (o '…' si _ordenes es null) */ }
function pintarNueva(){ /* buscador + columnas; cableado de input/keydown (↑↓ Enter) */ }
function pintarLista(){ /* filtros + tabla con filtrar(_ordenes, {vista:_estado.v, ..._estado}) */ }

function pintar(){
  pintarNav();
  if (!_estado.v) return pintarPortada();
  if (_estado.v === 'nueva') return pintarNueva();
  return pintarLista();
}

document.addEventListener('keydown', e => {
  const enCampo = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if ((e.key === '/' && !enCampo) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')){
    e.preventDefault();
    if (_estado.v !== 'nueva') ir({ v: 'nueva' });
    $('ordBusca')?.focus();
  }
});
window.addEventListener('popstate', () => { _estado = estadoDeURL(location.search); pintar(); });

(async function arrancar(){
  // Un lector que entra con ?v=nueva va a la portada: no puede emitir.
  if (_estado.v === 'nueva' && !modulosEditables().length) _estado.v = '';
  pintar();
  try {
    const r = await fetch('/ordenes/api/lista');
    if (!r.ok) throw new Error('http ' + r.status);
    _ordenes = (await r.json()).ordenes || [];
  } catch (_) {
    _ordenes = [];
    window.CI?.avisar?.('No se pudo cargar la lista de órdenes. Probá recargar.', { tipo: 'mal' });
  }
  pintar();
})();
```

Las cuatro funciones `pintar*` se escriben completas según **Comportamiento**. Reglas:
- `pintarNueva` arma `buscarTipos(q, modulosEditables())` y agrupa por `t.modulo` en el orden `['prensas','lotes']`. Al tipear repinta solo `#ordTipos` y no el buscador, para no perder el foco.
- `pintarLista` repinta solo `#ordTabla` al cambiar el texto, por la misma razón.

- [ ] **Step 4: Run** → `npx vitest run test/ordenes-pantalla.test.ts` → PASS. La verificación de comportamiento va en la Task 9.

- [ ] **Step 5: Commit**

```bash
git add public/ordenes vitest.config.ts test/env.d.ts test/ordenes-pantalla.test.ts
git commit -m "feat(ordenes): página con portada, Nueva orden, Pendientes e Historial"
```

---

### Task 7: Modo órdenes en Lotes

**Files:**
- Create: `public/lotes/js/modo-ordenes.js`
- Modify: `public/lotes/app.js` (después de `await dash;`, línea ~181)
- Modify: `public/lotes/js/vista-movimientos.js` (estado `_unica`, exports nuevos, rama `ordenes` de `renderMovimientos` en la línea ~303)
- Modify: `public/lotes/js/vista-ot-lista.js` (`renderOrdenesTrabajo(cont, callbacks, { unica })`)
- Modify: `public/lotes/js/vista-ot-emitir.js` (`abrirEmitirOT(onListo, { plantilla } = {})`)
- Modify: `public/lotes/js/vista-so2.js` (`fijarOrdenUnica`)
- Modify: `public/lotes/js/vista-ordenes-correccion.js` (`{ soloId }`)
- Modify: `public/lotes/js/vista-orden-correccion.js` (`_ocGuardarOrden`: mensaje final)
- Modify: `public/lotes/index.html` (CSS `body.modo-ordenes` + `<div id="modoOrdenes" hidden>` justo después de `</header>` de `#barraLotes`)
- Test: `test/lotes-modo-ordenes.test.mjs`

**Interfaces:**
- Consumes: `PLANTILLAS_OT` (`ot-plantillas.js`), `DATOS()`.
- Produces (puro, `modo-ordenes.js`):
  - `leerModoOrden(search): null | { nueva: string } | { id: string }`
  - `destinoDeModo(modo, datos): { accion: 'emitir', plantilla } | { accion: 'correccion' } | { accion: 'ver-ot', id } | { accion: 'ver-oc', id } | { accion: 'no-existe' } | { accion: 'tipo-desconocido' }`
  - `urlVolver(search): string` (el `volver`, solo si empieza con `/ordenes/`; si no, `'/ordenes/'`)
  - `tituloModo(destino, datos): string` (p. ej. `"Nueva · Traslado"`, `"OT 0945 · Traslado · pendiente"`, `"B240 · Corrección SO₂ · pendiente"`)
- Produces (vistas): `abrirOTUnica(id)`, `emitirEnModoOrden(plantilla)` en `vista-movimientos.js`; `fijarOrdenUnica(id)` en `vista-so2.js`.

- [ ] **Step 1: Write the failing test**

```js
// test/lotes-modo-ordenes.test.mjs
import { describe, it, expect } from 'vitest';
import { leerModoOrden, destinoDeModo, urlVolver, tituloModo } from '../public/lotes/js/modo-ordenes.js';

const D = {
  ordenes_trabajo: [{ id: 'ot-1', ot: '0945', plantilla: 'traslado', estado: 'pendiente' }],
  ordenes_correccion: [{ id: 'oc-1', numero: 'B240', estado: 'ejecutada' }],
};

describe('leerModoOrden', () => {
  it('sin ?orden no hay modo', () => expect(leerModoOrden('')).toBeNull());
  it('nueva:<tipo>', () => expect(leerModoOrden('?orden=nueva%3Atraslado')).toEqual({ nueva: 'traslado' }));
  it('un id', () => expect(leerModoOrden('?orden=ot-1&volver=%2Fordenes%2F')).toEqual({ id: 'ot-1' }));
});

describe('destinoDeModo', () => {
  it('nueva plantilla → emitir', () => expect(destinoDeModo({ nueva: 'traslado' }, D)).toEqual({ accion: 'emitir', plantilla: 'traslado' }));
  it('nueva corrección', () => expect(destinoDeModo({ nueva: 'correccion' }, D)).toEqual({ accion: 'correccion' }));
  it('tipo que no existe', () => expect(destinoDeModo({ nueva: 'raro' }, D)).toEqual({ accion: 'tipo-desconocido' }));
  it('id de OT', () => expect(destinoDeModo({ id: 'ot-1' }, D)).toEqual({ accion: 'ver-ot', id: 'ot-1' }));
  it('id de corrección', () => expect(destinoDeModo({ id: 'oc-1' }, D)).toEqual({ accion: 'ver-oc', id: 'oc-1' }));
  it('id inexistente', () => expect(destinoDeModo({ id: 'nada' }, D)).toEqual({ accion: 'no-existe' }));
});

describe('urlVolver', () => {
  it('respeta una vuelta a /ordenes/', () => expect(urlVolver('?volver=%2Fordenes%2F%3Fv%3Dpendientes')).toBe('/ordenes/?v=pendientes'));
  it('no sigue una vuelta a otro lado', () => {
    expect(urlVolver('?volver=https%3A%2F%2Fmalo.com')).toBe('/ordenes/');
    expect(urlVolver('?volver=%2F%2Fmalo.com')).toBe('/ordenes/');
    expect(urlVolver('')).toBe('/ordenes/');
  });
});

describe('tituloModo', () => {
  it('arma el título de la banda', () => {
    expect(tituloModo({ accion: 'emitir', plantilla: 'traslado' }, D)).toBe('Nueva · Traslado');
    expect(tituloModo({ accion: 'correccion' }, D)).toBe('Nueva · Corrección SO₂');
    expect(tituloModo({ accion: 'ver-ot', id: 'ot-1' }, D)).toBe('OT 0945 · Traslado · pendiente');
    expect(tituloModo({ accion: 'ver-oc', id: 'oc-1' }, D)).toBe('B240 · Corrección SO₂ · ejecutada');
  });
});
```

- [ ] **Step 2: Run** → `npx vitest run test/lotes-modo-ordenes.test.mjs` → FAIL.

- [ ] **Step 3: Implement `modo-ordenes.js`**

```js
// public/lotes/js/modo-ordenes.js
/* ===== Lotes CIW — modo órdenes (puro) =====
 * /lotes/?orden=nueva:<tipo> o /lotes/?orden=<id> llega desde la sección
 * Órdenes de trabajo. Lotes arranca normal, pero muestra solo esa orden.
 * Acá se decide QUÉ abrir; app.js lo abre. */
'use strict';

import { PLANTILLAS_OT, plantillaPorId } from './ot-plantillas.js';
import { esEjecutado } from './ot-movimientos.js';

export function leerModoOrden(search){
  const v = new URLSearchParams(search || '').get('orden');
  if (!v) return null;
  return v.startsWith('nueva:') ? { nueva: v.slice(6) } : { id: v };
}

export function destinoDeModo(modo, datos){
  if (modo.nueva !== undefined){
    if (modo.nueva === 'correccion') return { accion: 'correccion' };
    return PLANTILLAS_OT.some(p => p.id === modo.nueva)
      ? { accion: 'emitir', plantilla: modo.nueva } : { accion: 'tipo-desconocido' };
  }
  if ((datos.ordenes_trabajo || []).some(o => o && o.id === modo.id)) return { accion: 'ver-ot', id: modo.id };
  if ((datos.ordenes_correccion || []).some(o => o && o.id === modo.id)) return { accion: 'ver-oc', id: modo.id };
  return { accion: 'no-existe' };
}

export function urlVolver(search){
  const v = new URLSearchParams(search || '').get('volver') || '';
  return v.startsWith('/ordenes/') ? v : '/ordenes/';
}

const _nombre = id => (plantillaPorId(id) || {}).nombre || id;

export function tituloModo(dest, datos){
  if (dest.accion === 'emitir') return 'Nueva · ' + _nombre(dest.plantilla);
  if (dest.accion === 'correccion') return 'Nueva · Corrección SO₂';
  if (dest.accion === 'ver-ot'){
    const o = (datos.ordenes_trabajo || []).find(x => x.id === dest.id);
    return 'OT ' + o.ot + ' · ' + _nombre(o.plantilla) + ' · ' + (esEjecutado(o) ? 'ejecutada' : 'pendiente');
  }
  if (dest.accion === 'ver-oc'){
    const o = (datos.ordenes_correccion || []).find(x => x.id === dest.id);
    return o.numero + ' · Corrección SO₂ · ' + o.estado;
  }
  return 'Orden no encontrada';
}
```

Verificar que `plantillaPorId` está exportada en `ot-plantillas.js` (la importa `vista-ot-lista.js`, así que sí).

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Wire the views**

1. `vista-ot-emitir.js`, `abrirEmitirOT` (línea 285): firma `abrirEmitirOT(onListo, { plantilla } = {})`. Si viene `plantilla` y `creaLote(plantilla)`, después de resolver minimizada y borrador: `abrirCorteOT(onListo, { plantilla }); return true;`. Si no, `_abrirFormulario(onListo, null, undefined, plantilla)`. En `_abrirFormulario`, sumar el 4º parámetro `plantillaInicial`; después de `iniciarSesionLotes()` y de armar el overlay, si viene: `_plantilla = plantillaInicial; $('otePlantilla').value = _plantilla;`. Revisar que el handler `change` del select no dispare (no se emite el evento al setear `value`).
2. `vista-ot-lista.js`: `renderOrdenesTrabajo(cont, callbacks, opciones = {})`. Con `opciones.unica`, pintar solo `<div class="otl unica"><div class="otl-der" id="otlDer"></div></div>`, sin lista, buscador, checkbox, Emitir ni cartel de carpeta, y llamar a `_pintarDer()`. Si `_elegida` no existe, en vez de "Elegí una OT de la lista." mostrar: "No se emitió la orden." + botón `＋ Emitir de nuevo` (`_cb.onEmitir()`). **Con `unica` NO se ejecuta** `if (!_elegida && lista.length) _elegida = lista[0].id;`: en modo órdenes, sin OT elegida se muestra el cartel, nunca otra OT.
3. `vista-movimientos.js`:
   - Estado: `let _unica = false;` debajo de `_sub`.
   - Exports:
     ```js
     /* Modo órdenes: solo la hoja de esa OT (sin sub-pestañas ni lista). */
     export function abrirOTUnica(id){
       _unica = true; _sub = 'ordenes';
       elegirOT(id);
       mostrarTab('movimientos');
     }
     /* Modo órdenes, Nueva: el formulario con la plantilla puesta. Al emitir,
      * la URL pasa a la OT nueva (así F5 la vuelve a abrir). */
     export function emitirEnModoOrden(plantilla){
       _unica = true; _sub = 'ordenes';
       elegirOT(null);
       mostrarTab('movimientos');
       const alListo = ot => {
         if (!ot || !ot.id) return renderMovimientos();
         const p = new URLSearchParams(location.search); p.set('orden', ot.id);
         history.replaceState(null, '', location.pathname + '?' + p.toString());
         document.dispatchEvent(new CustomEvent('lotes:modo-orden-cambio'));
         abrirOTUnica(ot.id);
       };
       _emitirModo = () => abrirEmitirOT(alListo, { plantilla });
       _emitirModo();
     }
     let _emitirModo = null;
     ```
   - Rama `ordenes` de `renderMovimientos` (línea ~303): con `_unica`, no se pone `_selectorSub()` y se pasa `{ unica: true }`; `onEmitir` usa `_emitirModo` si existe.
     ```js
       if (_sub === 'ordenes'){
         sec.innerHTML = (_unica ? '' : _selectorSub()) + '<div id="movOrdenes"></div><div id="otMovHoja" style="display:none"></div>';
         if (!_unica) _cablearSelector(sec);
         renderOrdenesTrabajo($('movOrdenes'), {
           onEmitir: () => (_emitirModo ? _emitirModo() : abrirEmitirOT(_alEmitir)),
           onCambio: renderMovimientos,
         }, { unica: _unica });
         return;
       }
     ```
     (La Task 8 saca la sub-pestaña del selector. Esta rama queda solo para el modo.)
4. `vista-ordenes-correccion.js`: `pintarOrdenesCorreccion(cont, alCambiar, { soloId } = {})`. Con `soloId`, `todas` se filtra a esa orden y el `<h2>` dice "Orden de corrección". Al cambiar de orden (ejecutar o anular) no hace falta nada más: `alCambiar` repinta.
5. `vista-so2.js`:
   ```js
   let _ordenUnica = null;
   /* Modo órdenes: el Registro muestra solo la tarjeta de ESA orden de corrección. */
   export function fijarOrdenUnica(id){ _ordenUnica = id || null; }
   ```
   Al principio de `renderCorrecciones`, después de `const sec = ...`:
   ```js
     if (_ordenUnica){
       sec.innerHTML = '<div class="card" id="so2Ordenes"></div>';
       pintarOrdenesCorreccion($('so2Ordenes'), () => renderCorrecciones(), { soloId: _ordenUnica });
       return;
     }
   ```
6. `vista-orden-correccion.js`, en `_ocGuardarOrden`, el mensaje final (línea 1272):
   ```js
     if (m) m.innerHTML = '<div class="msg ok">✓ La orden ' + esc(num) + ' quedó pendiente. ' +
       'Cuando esté terminada, ejecutala desde Órdenes de trabajo → Pendientes. ' +
       '<a href="' + escA(urlVolver(location.search)) + '">← Volver a Órdenes de trabajo</a></div>';
   ```
   Importar `urlVolver` de `./modo-ordenes.js` y `escA` de `./nucleo.js` si no está. Cambiar también el `title` del botón (línea 964): "… y deja la orden pendiente en Órdenes de trabajo".
7. `index.html`:
   - Después del `</header>` de `#barraLotes`:
     ```html
     <div class="modo-ordenes-banda" id="modoOrdenes" hidden>
       <a class="btn" id="modoOrdenesVolver" href="/ordenes/">← Órdenes de trabajo</a>
       <span class="modo-ordenes-tit" id="modoOrdenesTit"></span>
     </div>
     ```
   - CSS (al final del `<style>` principal):
     ```css
     /* Modo órdenes (/lotes/?orden=…): solo la orden que se abrió desde la sección Órdenes de trabajo. */
     .modo-ordenes-banda{display:flex;align-items:center;gap:12px;padding:10px 24px;border-bottom:1px solid var(--line);background:var(--panel)}
     .modo-ordenes-banda[hidden]{display:none}
     .modo-ordenes-tit{font-family:var(--serif);font-size:20px}
     body.modo-ordenes #tabs,body.modo-ordenes #buscarLote,body.modo-ordenes #corrSub{display:none!important}
     @media print{.modo-ordenes-banda{display:none!important}}
     ```
8. `app.js`, después de `await dash;` y antes de `loteEnUrl`:
   ```js
     /* Modo órdenes: se llegó desde la sección Órdenes de trabajo. */
     const modo = leerModoOrden(location.search);
     if (modo) arrancarModoOrden(modo);
   ```
   y la función (en el mismo archivo, fuera del listener):
   ```js
   function arrancarModoOrden(modo){
     document.body.classList.add('modo-ordenes');
     $('modoOrdenes').hidden = false;
     $('modoOrdenesVolver').href = urlVolver(location.search);
     const titular = () => {
       const m = leerModoOrden(location.search);
       $('modoOrdenesTit').textContent = tituloModo(destinoDeModo(m, DATOS()), DATOS());
     };
     const dest = destinoDeModo(modo, DATOS());
     if (dest.accion === 'emitir') emitirEnModoOrden(dest.plantilla);
     else if (dest.accion === 'correccion') mostrarTab('ordencorr');
     else if (dest.accion === 'ver-ot') abrirOTUnica(dest.id);
     else if (dest.accion === 'ver-oc'){ fijarOrdenUnica(dest.id); mostrarTab('so2'); }
     else {
       $('modoOrdenesTit').textContent = dest.accion === 'no-existe'
         ? 'Esta orden no existe (¿la borraron?)' : 'Tipo de orden desconocido';
       document.querySelectorAll('.view').forEach(s => s.classList.remove('active'));
       return;
     }
     titular();
     document.addEventListener('lotes:modo-orden-cambio', titular);
   }
   ```
   Imports: `leerModoOrden, destinoDeModo, urlVolver, tituloModo` de `./js/modo-ordenes.js`; `abrirOTUnica, emitirEnModoOrden` de `./js/vista-movimientos.js`; `fijarOrdenUnica` de `./js/vista-so2.js`. `vista-movimientos.js` y `vista-so2.js` ya se importan por efecto: cambiar esas líneas a imports con nombre. En modo, la vista que dibuja `cargarDatos()` por defecto (Panel) se reemplaza al llamar `mostrarTab`.

- [ ] **Step 6: Run the suite**

Run: `npx vitest run test/lotes-modo-ordenes.test.mjs test/lotes-ot-lista.test.mjs test/lotes-sin-ventanas-nativas.test.ts test/lotes-barra.test.ts test/lotes-estilo.test.ts` → PASS. Si `lotes-estilo` se queja de un color, usar el token correspondiente.

- [ ] **Step 7: Commit**

```bash
git add public/lotes test/lotes-modo-ordenes.test.mjs
git commit -m "feat(lotes): modo órdenes (?orden=…) para abrir una sola orden desde la sección nueva"
```

---

### Task 8: Sacar las órdenes de sus lugares viejos en Lotes

**Files:**
- Modify: `public/lotes/js/vista-movimientos.js` (`_selectorSub` línea 91, 🖨 del Historial línea 584, `emitirOTDesdeAgenda` línea 123, `verOrdenTrabajo`/`_alEmitir`)
- Modify: `public/lotes/index.html` (`#corrSub` línea 1724)
- Modify: `public/lotes/js/nucleo.js` (`_ultimaCorreccion` por defecto, si es `'ordencorr'`)
- Test: `test/ordenes-sacadas-de-lotes.test.ts`

**Interfaces:**
- Consumes: `urlAbrir` (no: Lotes no importa de `/ordenes/`; arma su URL) y `abrirOTUnica` (Task 7).
- Produces: nada nuevo.

- [ ] **Step 1: Write the failing test**

```ts
// test/ordenes-sacadas-de-lotes.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('Lotes ya no tiene órdenes fuera del modo órdenes', () => {
  const mov = env.LOTES_JS['js/vista-movimientos.js'];
  it('Movimientos: sin sub-pestaña Órdenes de trabajo, con Inventario de tanques', () => {
    const sel = mov.slice(mov.indexOf('function _selectorSub'), mov.indexOf('function _cablearSelector'));
    expect(sel).not.toContain("b('ordenes'");
    expect(sel).toContain("b('tanques', 'Inventario de tanques')");
    expect(sel).toContain("b('mermas', 'Mermas')");
  });
  it('el 🖨 del Historial lleva a la OT en modo órdenes', () => {
    expect(mov).toContain("'/lotes/?orden=' + encodeURIComponent(ot.id)");
  });
  it('Correcciones: sin la sub-pestaña Orden de corrección', () => {
    const corr = (env.LOTES_HTML.match(/<div class="corr-sub"[\s\S]*?<\/div>/) || [''])[0];
    expect(corr).not.toContain('data-sub="ordencorr"');
    expect(corr).toContain('data-sub="so2"');
    expect(corr).toContain('data-sub="agregados"');
  });
  it('el Registro ya no pinta la lista de órdenes fuera del modo', () => {
    const so2 = env.LOTES_JS['js/vista-so2.js'];
    expect(so2).not.toContain('<div class="card" id="so2Ordenes" style="margin-bottom:14px"></div>');
  });
});
```

- [ ] **Step 2: Run** → `npx vitest run test/ordenes-sacadas-de-lotes.test.ts` → FAIL.

- [ ] **Step 3: Implement**

1. `_selectorSub`: quitar `b('ordenes', 'Órdenes de trabajo')`. Actualizar el comentario de `_sub` (línea 85): "'ordenes' solo en modo órdenes (ver abrirOTUnica)".
2. 🖨 del Historial (línea 584):
   ```js
           // La OT se abre en modo órdenes (la sub-pestaña ya no existe); las
           // OT viejas sin entrada en ordenes_trabajo siguen con la hoja genérica.
           if (ot) location.href = '/lotes/?orden=' + encodeURIComponent(ot.id) + '&volver=' + encodeURIComponent('/ordenes/?v=pendientes');
           else _imprimirOT(fila);
   ```
3. `emitirOTDesdeAgenda` (línea 123): ya no cambia de pestaña. Abre el formulario arriba de la Agenda y, al emitir, va al modo órdenes de la OT nueva:
   ```js
   export function emitirOTDesdeAgenda(lotes, fecha){
     const alListo = ot => {
       if (ot && ot.id) location.href = '/lotes/?orden=' + encodeURIComponent(ot.id) + '&volver=' + encodeURIComponent('/ordenes/?v=pendientes');
     };
     abrirEmitirOT(alListo).then(nuevo => { if (nuevo) precargarLotesOT(lotes, fecha); });
   }
   ```
   **Ojo:** `registrarOT` guarda antes de llamar `onListo` (ver `vista-ot-emitir.js:772`). Confirmar leyendo esa función que el `guardar` termina **antes** de `onListo`. Si no es así, hacer `await guardar(false)` en `alListo` antes de navegar, porque si no se pierde la OT.
4. `verOrdenTrabajo` y `_alEmitir` quedan sin uso fuera de Movimientos: borrarlos si no tienen otros llamadores (`grep -n "verOrdenTrabajo\|_alEmitir" public/lotes/js/*.js`). La rama no-modo de `onEmitir` en `renderMovimientos` pasa a ser inalcanzable: dejar solo `_emitirModo()`.
5. `index.html` `#corrSub`: borrar `<button … data-sub="ordencorr" …>Orden de corrección</button>`. `GRUPO_CORRECCIONES` en `nucleo.js` (línea 861) **sigue** con `'ordencorr'`: el modo órdenes la abre con `mostrarTab('ordencorr')` y tiene que caer en el grupo. Si `_ultimaCorreccion` arranca en `'ordencorr'`, cambiarlo a `'so2'`, para que el botón Correcciones no abra una vista sin pestaña.
6. `vista-so2.js`: en el HTML principal de `renderCorrecciones`, borrar `<div class="card" id="so2Ordenes" style="margin-bottom:14px"></div>` y la llamada `pintarOrdenesCorreccion($('so2Ordenes'), …)` de la línea 139. La rama `_ordenUnica` (Task 7) queda como única entrada.

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run` → todo verde (más de 1850 tests). `npx tsc --noEmit` → OK. Si falla un test viejo que esperaba la sub-pestaña o la tarjeta de órdenes en el Registro, actualizarlo a la regla nueva y anotarlo en el mensaje del commit.

- [ ] **Step 5: Commit**

```bash
git add public/lotes test
git commit -m "feat(lotes): las OT y las órdenes de corrección se van de Movimientos y Correcciones a Órdenes de trabajo"
```

---

### Task 9: Verificación en el navegador y cierre

**Files:**
- Modify: `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\.claude\launch.json` (entrada nueva, **sin commitear en el repo de la plataforma**)
- Modify: `docs/superpowers/specs/2026-11-03-seccion-ordenes-de-trabajo-design.md` (el modal viejo se queda)

- [ ] **Step 1: Servidor de prueba**

Sumar a `Escritorio\claude\.claude\launch.json` una entrada `ordenes-seccion` en el puerto **8851**. Copiar la forma de las entradas `lotes-*` que ya hay, apuntando a `C:\Users\Bmax\repos\catenainstitute-ordenes`, con `npx wrangler dev -c wrangler.dev.jsonc --port 8851 --local`. Arrancar con `preview_start {name:'ordenes-seccion'}`. Antes, aplicar migraciones locales (`npm run migrar:local` en el worktree) y sembrar:
- un perfil editor en lotes, y uno lector en prensas, para el usuario de `.dev.vars`;
- un documento de Lotes con 2 OT (una pendiente, una ejecutada), sus movimientos y 1 orden de corrección pendiente, POSTeado a `/lotes/api/datos` (ver memoria `catenainstitute-verificar-en-navegador`).

- [ ] **Step 2: Recorrido**

1. `/` muestra 4 tarjetas, y "Órdenes de trabajo" dice el rol más alto. Pasar el cursor arma la hoja de puntos.
2. `/ordenes/` muestra la portada con 3 tarjetas; Pendientes dice "2 pendientes".
3. Nueva orden → escribir `so2` → queda solo Corrección SO₂ → Enter lleva a `/lotes/?orden=nueva:correccion…`. Ahí se ve la banda "← Órdenes de trabajo · Nueva · Corrección SO₂", sin pestañas de Lotes, con la Orden de corrección.
4. Volver → Nueva orden → `mezcla` → Corte → abre el asistente del Corte.
5. Pendientes → filtro Tipo → abrir la OT pendiente → hoja sola con ✎ Editar / ✓ Confirmar / 🖨 Imprimir. Confirmar → volver → pasó a Historial.
6. Pendientes → la orden de corrección → tarjeta con ✔ Ejecutar / Anular / Ver.
7. Lotes normal: Movimientos sin "Órdenes de trabajo" e Inventario de tanques presente. Correcciones sin "Orden de corrección". El Registro, sin la lista de órdenes. El 🖨 de una fila con OT lleva al modo.
8. Celular (`resize_window mobile`): portada en una columna y sin scroll horizontal en `/ordenes/` ni en la banda.
9. `read_console_messages` sin errores en cada pantalla.

- [ ] **Step 3: Spec**

En el spec, sección "Qué se saca de cada app", cambiar "y el modal viejo de OT suelta (`_abrirModalOT`)" por: "El modal viejo de movimiento suelto **se queda**: ya no emite OT, solo confirma movimientos sueltos pendientes."

- [ ] **Step 4: Commit y reporte**

```bash
git add docs/superpowers/specs/2026-11-03-seccion-ordenes-de-trabajo-design.md
git commit -m "docs: el modal de movimiento suelto se queda (solo confirma)"
```

Reportar al usuario con capturas del recorrido. **No pushear a main**. Ofrecer: push de la rama + PR, y recordar que mergear = producción. También recordar avisar al equipo dónde quedaron las órdenes.
