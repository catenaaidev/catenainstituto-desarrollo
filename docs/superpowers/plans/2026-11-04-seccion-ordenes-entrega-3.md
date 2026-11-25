# Sección Órdenes de trabajo — Entrega 3 (Prensas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las 4 órdenes de Prensas (Orden de muestras, Rellenos, Acción rápida, OT de Agregados) se arman desde «Órdenes de trabajo», toman N° de la carpeta de OneDrive, se guardan al imprimir en `ordenes_hojas` del documento de Prensas, se cierran con «Marcar ejecutada» y desaparecen de su lugar viejo en Prensas.

**Architecture:** Igual que Lotes en la entrega 2 (enfoque A): `/prensas/?orden=nueva:<tipo>|<id>` abre Prensas en «modo órdenes» mostrando solo esa orden. Lo genérico de Lotes (número/PDF contra la carpeta, ciclo de vida de `ordenes_hojas`, cabecera de orden guardada) se reusa: se le quita la dependencia de `nucleo.js` con un «entorno» inyectable, y Prensas (script clásico `app.js`) lo carga por `js/puente.js`. Las 4 hojas de Prensas pasan a un módulo puro de renderizado (testeable) que dibuja tanto la hoja editable como la guardada en solo lectura.

**Tech Stack:** Cloudflare Worker (TypeScript) + D1, front sin bundler (scripts clásicos + ES modules), vitest con `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-11-03-seccion-ordenes-de-trabajo-design.md` (rama `feat/seccion-ordenes`). Entregas 1 y 2 ya están en esta rama (`feat/seccion-ordenes-3` sale de `feat/seccion-ordenes` @ 8ad17b8).

## Global Constraints

- Push a `main` = producción. No pushear ni mergear nada; solo commits locales en `feat/seccion-ordenes-3`.
- Decisiones del usuario (2026-11-04): N° de orden de Prensas **de la carpeta de OneDrive, como Lotes** (propone el siguiente, re-chequea antes de imprimir, guarda el PDF); Lotes y Prensas **no deben pisarse** el número. **Acción rápida: Marcar ejecutada solo cierra la orden** (no anota nada). OT de Agregados de Prensas: Marcar ejecutada solo cierra (la tabla `agregados` sigue siendo la fuente, spec).
- Ids de tipo de Prensas (en el catálogo Y en `ordenes_hojas[].tipo`): `prensas-muestras`, `prensas-rellenos`, `prensas-accion`, `prensas-agregados`. Nunca `muestras`/`agregados` a secas (son de Lotes).
- Series: `prensas-muestras` y `prensas-rellenos` → `principal` (0xxx); `prensas-accion` y `prensas-agregados` → `B` (Bxxx).
- El papel impreso de Prensas no cambia: mismo markup de `.orden-hoja`, mismas reglas `@media print` de `public/prensas/index.html`. La Orden de muestras sigue diciendo «Emitió: Marcelo» en el papel; `emitida_por` de la orden guardada = `window.CIW.nombre` o, sin eso, `usuarioActual()`.
- Los mapas de barriles pegados (imágenes) NO se guardan en la orden (mismo criterio que Lotes: dataURL pesadas).
- Lotes no cambia de comportamiento: toda la suite existente sigue verde sin tocar sus asserts (salvo los que este plan nombra).
- Módulos puros: sin DOM ni `nucleo.js`, importables en los tests. Textos de pantalla en castellano rioplatense (voseo). Código nuevo de Prensas usa `avisar/confirmar/informar` de `public/lotes/js/dialogos.js` (vía `PrensasMods`), no `alert/confirm` nuevos.
- Verificación de cada tarea: `npx vitest run` (toda la suite) y `npx tsc --noEmit` en verde.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `src/prensas/validacion.ts` | `SECCIONES_PRENSAS` suma `ordenes_hojas` (T1) |
| `src/prensas/rutas.ts` | nuevo `GET /prensas/api/version` (T1) |
| `src/ordenes/resumen.ts` | `resumenOrdenes('prensas')` lee `ordenes_hojas`; `numerosDeDocumento()` (T1) |
| `src/ordenes/rutas.ts` | lee el documento de Prensas; nuevo `GET /ordenes/api/numeros` (T1) |
| `public/lotes/js/entorno-ot.js` (nuevo) | entorno inyectable: datos, guardar, overlay, api, numerosWeb, evento (T2) |
| `public/lotes/js/nucleo.js` | fija el entorno de Lotes (T2) |
| `public/lotes/js/guardar-ot.js`, `vista-orden-guardada.js` | sin `nucleo.js`: usan el entorno (T2); números cruzados (T3) |
| `public/lotes/js/hoja-pdf.js` | librerías desde `/lotes/js/vendor/` (T2) |
| `public/prensas/js/hojas-prensas.js` (nuevo, puro) | tipos de Prensas, `numerosWebPrensas`, 4 renderizadores de hoja (T4) |
| `public/prensas/js/modo-ordenes-prensas.js` (nuevo, puro) | destino y título del modo órdenes de Prensas (T6) |
| `public/prensas/js/puente.js` | expone lo nuevo en `window.PrensasMods` (T5–T8) |
| `public/prensas/app.js` | pintar con los renderizadores (T5), modo órdenes (T6), imprimir = guardar (T7), hoja guardada (T8), sin las entradas viejas (T9) |
| `public/prensas/index.html` | banda del modo, CSS, saca entradas viejas (T6, T9) |
| `public/ordenes/js/catalogo.js`, `public/ordenes/js/app.js` | 4 tipos de Prensas; sin la nota «próxima entrega» (T9) |
| `vitest.config.ts` | binding `PRENSAS_JS` (T5) |

---

### Task 1: Servidor — Prensas con `ordenes_hojas`, `/version`, lista y números cruzados

**Files:**
- Modify: `src/prensas/validacion.ts:28-31`
- Modify: `src/prensas/rutas.ts` (agregar `/version` junto a `/datos` GET, después del chequeo de permiso de lectura que ya protege `/datos`)
- Modify: `src/ordenes/resumen.ts`
- Modify: `src/ordenes/rutas.ts:24-48`
- Test: `test/validacion.test.ts`, `test/prensas-guardado.test.ts`, `test/ordenes-resumen.test.ts`, `test/ordenes-rutas.test.ts`

**Interfaces:**
- Produces: `GET /prensas/api/version` → `{ version, autor, guardado }` (mismo formato que `/lotes/api/version`).
- Produces: `resumenOrdenes('prensas', datos)` → filas `modulo:'prensas', fuente:'ordenes_hojas'`, `tipo` = el `tipo` guardado (`prensas-muestras`…).
- Produces: `numerosDeDocumento(modulo: 'prensas'|'lotes', datos, serie: 'principal'|'B'): number[]` en `src/ordenes/resumen.ts`.
- Produces: `GET /ordenes/api/numeros?serie=principal|B` → `{ numeros: number[] }` (sin repetir, de menor a mayor) con los números de AMBOS documentos; 400 si `serie` no es `principal` ni `B`; 403 sin rol en prensas ni lotes; 401 sin sesión (como `/lista`).

- [ ] **Step 1: Tests que fallan**

En `test/validacion.test.ts`, junto a los casos de `ordenes_hojas` de Lotes, el mismo par para Prensas:

```ts
it('Prensas acepta ordenes_hojas y le aplica el freno de borrado masivo', () => {
  const hojas = Array.from({ length: 12 }, (_, i) => ({ id: 'oh-' + i, tipo: 'prensas-muestras', ot: String(900 + i) }));
  const base = { meta: { version: 1 }, lotes: [], analisis: [], degustaciones: [], agregados: [], ordenes_hojas: hojas };
  expect(validarDatos(base, base, SECCIONES_PRENSAS).ok).toBe(true);
  const nuevo = { ...base, ordenes_hojas: [] };
  expect(validarDatos(nuevo, base, SECCIONES_PRENSAS).ok).toBe(false);
});
```

(Usar la firma real de `validarDatos` que ya usan los tests de Lotes en ese archivo; si difiere, copiar el patrón de su caso `ordenes_hojas`.)

En `test/ordenes-resumen.test.ts`:

```ts
it('Prensas: las órdenes de papel guardadas', () => {
  const datos = { ordenes_hojas: [
    { id: 'oh-1', tipo: 'prensas-rellenos', ot: '0951', fecha: '2026-11-04', estado: 'pendiente', emitida_por: 'Ana', lotes: [{ lote: '25012' }] },
    { id: 'oh-2', tipo: 'prensas-accion', ot: 'B243', fecha: '2026-11-03', estado: 'ejecutada', emitida_por: 'Luis', lotes: [] },
  ] };
  expect(resumenOrdenes('prensas', datos)).toEqual([
    { modulo: 'prensas', id: 'oh-1', fuente: 'ordenes_hojas', tipo: 'prensas-rellenos', numero: '0951', fecha: '2026-11-04',
      estado: 'pendiente', lotes: ['25012'], lote_corte: '', emitio: 'Ana' },
    { modulo: 'prensas', id: 'oh-2', fuente: 'ordenes_hojas', tipo: 'prensas-accion', numero: 'B243', fecha: '2026-11-03',
      estado: 'ejecutada', lotes: [], lote_corte: '', emitio: 'Luis' },
  ]);
});
it('numerosDeDocumento: cada serie, de los dos módulos', () => {
  const prensas = { ordenes_hojas: [
    { id: 'a', tipo: 'prensas-muestras', ot: '0951' }, { id: 'b', tipo: 'prensas-agregados', ot: 'B244' },
    { id: 'c', tipo: 'prensas-accion', ot: 'b245' }, { id: 'd', tipo: 'prensas-rellenos', ot: '' } ] };
  expect(numerosDeDocumento('prensas', prensas, 'principal')).toEqual([951]);
  expect(numerosDeDocumento('prensas', prensas, 'B')).toEqual([244, 245]);
  const lotes = {
    movimientos: [{ id: 'm', ot: '0940' }], ordenes_trabajo: [{ id: 't', ot: '0941' }],
    analisis: [{ correccion: { ot_n: 'B230' }, agregados: [{ ot_n: 'B231' }] }],
    ordenes_correccion: [{ id: 'oc', numero: 'B232' }],
    ordenes_hojas: [{ id: 'h1', tipo: 'muestras', ot: '0942' }, { id: 'h2', tipo: 'agregados', ot: 'B233' }],
  };
  expect(numerosDeDocumento('lotes', lotes, 'principal')).toEqual([940, 941, 942]);
  expect(numerosDeDocumento('lotes', lotes, 'B')).toEqual([230, 231, 232, 233]);
});
```

En `test/ordenes-rutas.test.ts`, siguiendo el armado de sesión/documento que ya usa ese archivo: (a) un usuario con rol en Prensas ve en `/ordenes/api/lista` la fila de un `ordenes_hojas` del documento de Prensas (reemplaza el test que esperaba que Prensas no aportara filas); (b) `/ordenes/api/numeros?serie=principal` con documentos de Lotes (`movimientos[].ot='0940'`) y Prensas (`ordenes_hojas` `prensas-muestras` `0951`) devuelve `{ numeros: [940, 951] }` aunque el usuario solo tenga rol en Lotes; (c) `serie=X` → 400; (d) sin rol en ninguno → 403.

En `test/prensas-guardado.test.ts`: `GET /prensas/api/version` devuelve la `version` del documento guardado (copiar el caso de `/lotes/api/version` si existe en `test/`; si no, guardar un documento y comparar con `meta.version`).

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run test/validacion.test.ts test/ordenes-resumen.test.ts test/ordenes-rutas.test.ts test/prensas-guardado.test.ts`
Expected: FAIL (sección no permitida, `numerosDeDocumento` no existe, 404 en `/version` y `/numeros`).

- [ ] **Step 3: Implementar**

`src/prensas/validacion.ts`:

```ts
/* `ordenes_hojas` (órdenes de papel de Prensas guardadas al imprimir — entrega 3
 * de Órdenes de trabajo, 2026-11-04): opcional, con control de lista y freno. */
export const SECCIONES_PRENSAS: ConfigSecciones = {
  secciones: ['lotes', 'analisis', 'degustaciones', 'agregados', 'ordenes_hojas'],
  requeridas: ['lotes', 'analisis'],
};
```

`src/prensas/rutas.ts`: copiar el bloque `GET /version` de `src/lotes/rutas.ts:101-117` (usa la constante `MODULO` que ya existe en el archivo), ubicado inmediatamente antes de `// ---------- GET /datos ----------` y después del `return json(403, …)` de falta de rol.

`src/ordenes/resumen.ts`: `deHojas(datos, modulo)` recibe el módulo (en vez de `'lotes' as const` fijo); `resumenOrdenes`:

```ts
const todas = modulo === 'lotes'
  ? [...deTrabajo(datos), ...deCorreccion(datos), ...deHojas(datos, 'lotes')]
  : deHojas(datos, 'prensas');
```

Y agregar (espejo de `numerosWeb` de `public/lotes/js/numero-ot.js`; el mapa de series de Prensas es espejo de `TIPOS_HOJA_PRENSAS` de la Task 4 — la Task 4 suma el test que los compara):

```ts
const RE_SERIE = { principal: /^(\d{4})(\s|\.|$)/, B: /^B(\d{3,4})(\s|\.|$)/i } as const;
export type Serie = keyof typeof RE_SERIE;
export const SERIE_PRENSAS: Record<string, Serie> = {
  'prensas-muestras': 'principal', 'prensas-rellenos': 'principal',
  'prensas-accion': 'B', 'prensas-agregados': 'B',
};
const numeroDe = (v: unknown, serie: Serie) => {
  const m = RE_SERIE[serie].exec(txt(v));
  return m ? parseInt(m[1], 10) : null;
};
/** Los números de OT que ya usa un documento, de una serie (sin repetir, de menor a mayor). */
export function numerosDeDocumento(modulo: 'prensas' | 'lotes', datos: Fila, serie: Serie): number[] {
  const crudos: unknown[] = [];
  if (modulo === 'prensas') {
    for (const o of filas(datos.ordenes_hojas)) if (SERIE_PRENSAS[txt(o.tipo)] === serie) crudos.push(o.ot);
  } else if (serie === 'B') {
    for (const a of filas(datos.analisis)) {
      crudos.push((a.correccion as Fila | undefined)?.ot_n);
      for (const ag of filas(a.agregados)) crudos.push(ag.ot_n);
    }
    for (const o of filas(datos.ordenes_correccion)) crudos.push(o.numero);
    for (const o of filas(datos.ordenes_hojas)) if (txt(o.tipo) === 'agregados') crudos.push(o.ot);
  } else {
    for (const m of [...filas(datos.movimientos), ...filas(datos.ordenes_trabajo)]) crudos.push(m.ot);
    for (const o of filas(datos.ordenes_hojas)) if (txt(o.tipo) !== 'agregados') crudos.push(o.ot);
  }
  const ns = crudos.map((v) => numeroDe(v, serie)).filter((n): n is number => n != null);
  return [...new Set(ns)].sort((a, b) => a - b);
}
```

`src/ordenes/rutas.ts`: sacar el `if (m === 'prensas') continue;` y su comentario (Prensas se lee como Lotes). Agregar, antes del `if (sub !== '/lista' …)`:

```ts
if (sub === '/numeros' && req.method === 'GET') {
  const serie = new URL(req.url).searchParams.get('serie');
  if (serie !== 'principal' && serie !== 'B') return json(400, { error: 'serie_invalida' });
  let conRol = false;
  for (const m of FUENTES) if ((await identidad(req, env, ctx, m))?.rol) conRol = true;
  if (!conRol) return json(403, { error: 'sin_permiso', detalles: ['No tenés rol en Prensas ni en Lotes.'] });
  /* Los dos documentos, aunque el rol sea de uno solo: comparten la serie de la
   * carpeta de OneDrive y solo se devuelven números. */
  const numeros = new Set<number>();
  for (const m of FUENTES) {
    const fila = await env.DB.prepare('SELECT json FROM documento WHERE modulo = ?').bind(m).first<{ json: string }>();
    if (fila) for (const n of numerosDeDocumento(m, JSON.parse(fila.json), serie)) numeros.add(n);
  }
  return json(200, { numeros: [...numeros].sort((a, b) => a - b) });
}
```

(Si `/lista` devuelve 401 sin sesión por un camino propio, `/numeros` tiene que hacer lo mismo: seguir el mismo patrón que ya usa el archivo.)

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run` y `npx tsc --noEmit`
Expected: todo verde.

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat(ordenes): Prensas guarda órdenes de papel; lista, /version y números cruzados de la carpeta"
```

---

### Task 2: Entorno de órdenes — `guardar-ot.js` y `vista-orden-guardada.js` sin `nucleo.js`

Lotes no cambia de comportamiento. Esto permite que Prensas use el mismo flujo de número/PDF y de orden guardada.

**Files:**
- Create: `public/lotes/js/entorno-ot.js`
- Modify: `public/lotes/js/nucleo.js` (al final del archivo)
- Modify: `public/lotes/js/guardar-ot.js:9-25,99,107`
- Modify: `public/lotes/js/vista-orden-guardada.js:11,19,26-36,38-91`
- Modify: `public/lotes/js/hoja-pdf.js:99`
- Test: `test/lotes-entorno-ot.test.mjs` (nuevo), `test/lotes-entorno-ot-fuentes.test.ts` (nuevo)

**Interfaces:**
- Produces: `fijarEntornoOT(e)` y `entornoOT()` en `public/lotes/js/entorno-ot.js`. Forma de `e`:
  `{ datos: () => object, markDirty: () => void, guardar: (forzar:boolean) => Promise<boolean>, usuarioActual: () => string, mostrarOverlay: (html:string) => void, cerrarOverlay: () => void, api: string, numerosWeb: (datos, serie) => number[], eventoModo: string }`.
  `entornoOT()` tira `Error('Entorno de órdenes sin fijar')` si nadie lo fijó.
- Consumes: nada nuevo.

- [ ] **Step 1: Tests que fallan**

`test/lotes-entorno-ot.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { fijarEntornoOT, entornoOT } from '../public/lotes/js/entorno-ot.js';

describe('entorno de órdenes', () => {
  it('sin fijar avisa con un error claro; fijado lo devuelve', () => {
    fijarEntornoOT(null);
    expect(() => entornoOT()).toThrow('Entorno de órdenes sin fijar');
    const e = { api: '/x/api' };
    fijarEntornoOT(e);
    expect(entornoOT()).toBe(e);
  });
});
```

`test/lotes-entorno-ot-fuentes.test.ts` (texto de los archivos vía el binding `LOTES_JS`, como `test/ordenes-sacadas-de-lotes.test.ts`):

```ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('órdenes de papel reusables fuera de Lotes', () => {
  it('guardar-ot y vista-orden-guardada no importan nucleo.js', () => {
    for (const f of ['js/guardar-ot.js', 'js/vista-orden-guardada.js'])
      expect(env.LOTES_JS[f]).not.toMatch(/from '\.\/nucleo\.js'/);
  });
  it('nucleo.js fija el entorno de Lotes', () => {
    const n = env.LOTES_JS['js/nucleo.js'];
    expect(n).toContain('fijarEntornoOT(');
    expect(n).toContain("eventoModo: 'lotes:modo-orden-cambio'");
  });
  it('hoja-pdf carga las librerías con ruta absoluta (sirve desde /prensas/)', () => {
    expect(env.LOTES_JS['js/hoja-pdf.js']).toContain("'/lotes/js/vendor/html2canvas.min.js'");
    expect(env.LOTES_JS['js/hoja-pdf.js']).toContain("'/lotes/js/vendor/jspdf.umd.min.js'");
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run test/lotes-entorno-ot.test.mjs test/lotes-entorno-ot-fuentes.test.ts`
Expected: FAIL (no existe el módulo; guardar-ot importa nucleo).

- [ ] **Step 3: Implementar**

`public/lotes/js/entorno-ot.js`:

```js
/* ===== Órdenes de papel — entorno de la app que las usa =====
 * guardar-ot.js (número y PDF contra la carpeta) y vista-orden-guardada.js
 * (ejecutar/anular) sirven a Lotes y a Prensas. No importan el núcleo de
 * ninguna: cada app fija acá sus piezas al arrancar (Lotes en nucleo.js,
 * Prensas en app.js). Puro. */
'use strict';

let _e = null;
export function fijarEntornoOT(e){ _e = e || null; }
export function entornoOT(){
  if (!_e) throw new Error('Entorno de órdenes sin fijar');
  return _e;
}
```

`public/lotes/js/nucleo.js`, al final (importar arriba `import { fijarEntornoOT } from './entorno-ot.js';` y `import { numerosWeb } from './numero-ot.js';`; si `numero-ot.js` ya está importado, sumar el nombre):

```js
/* Órdenes de papel (guardar-ot.js, vista-orden-guardada.js): las piezas de Lotes. */
fijarEntornoOT({
  datos: DATOS, markDirty, guardar, usuarioActual, mostrarOverlay, cerrarOverlay,
  api: '/lotes/api', numerosWeb, eventoModo: 'lotes:modo-orden-cambio',
});
```

`public/lotes/js/guardar-ot.js`: reemplazar `import { DATOS, mostrarOverlay, cerrarOverlay, $, esc, escA } from './nucleo.js';` por `import { entornoOT } from './entorno-ot.js';` y definir locales:

```js
const $ = id => document.getElementById(id);
const esc  = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escA = v => String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const mostrarOverlay = html => entornoOT().mostrarOverlay(html);
const cerrarOverlay = () => entornoOT().cerrarOverlay();
const _web = serie => { const e = entornoOT(); return e.numerosWeb(e.datos(), serie); };
```

y cambiar las tres llamadas `numerosWeb(DATOS(), serie)` por `_web(serie)` (sacar `numerosWeb` del import de `numero-ot.js` si queda sin uso).

`public/lotes/js/vista-orden-guardada.js`: reemplazar el import de `nucleo.js` por `import { entornoOT } from './entorno-ot.js';`; dentro de las funciones usar `const e = entornoOT();` y `e.datos()`, `e.markDirty()`, `e.guardar(false)`, `e.usuarioActual()`; `_sigueAlDia` pide `e.api + '/version'`; `_avisarModo` despacha `new CustomEvent(entornoOT().eventoModo)`. No cambiar textos ni criterio de reversión.

`public/lotes/js/hoja-pdf.js:99`: `'/lotes/js/vendor/html2canvas.min.js'` y `'/lotes/js/vendor/jspdf.umd.min.js'`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run` y `npx tsc --noEmit`
Expected: todo verde (los tests de Lotes existentes sin cambios).

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js test
git commit -m "refactor(lotes): número/PDF y orden guardada con entorno inyectable (los puede usar Prensas)"
```

---

### Task 3: Números cruzados — Lotes y Prensas no se pisan el N°

**Files:**
- Modify: `public/lotes/js/numero-ot.js` (función pura nueva)
- Modify: `public/lotes/js/guardar-ot.js` (`proponerNumero`, `imprimirYGuardar`)
- Test: `test/lotes-numero-ot.test.mjs`

**Interfaces:**
- Produces: `unirNumeros(...listas: number[][]): number[]` en `numero-ot.js` (sin repetir, ignora no-números).
- Consumes: `GET /ordenes/api/numeros?serie=` (Task 1), `entornoOT()` (Task 2).

- [ ] **Step 1: Test que falla**

En `test/lotes-numero-ot.test.mjs`:

```js
it('unirNumeros: junta sin repetir y descarta basura', () => {
  expect(unirNumeros([940, 941], [941, 951], [null, NaN, '3'])).toEqual([940, 941, 951]);
  expect(unirNumeros()).toEqual([]);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/lotes-numero-ot.test.mjs` → FAIL (`unirNumeros` no existe).

- [ ] **Step 3: Implementar**

`numero-ot.js`:

```js
/* Los números de la web de este módulo y los del otro (Lotes / Prensas comparten
 * la serie de la carpeta). */
export function unirNumeros(...listas){
  const out = new Set();
  for (const l of listas) for (const n of l || []) if (typeof n === 'number' && Number.isFinite(n)) out.add(n);
  return [...out].sort((a, b) => a - b);
}
```

`guardar-ot.js`: `_web` pasa a async y suma lo del servidor; sin conexión o con error sigue con lo local (no frena):

```js
async function _remotos(serie){
  try {
    const r = await fetch('/ordenes/api/numeros?serie=' + encodeURIComponent(serie), { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.numeros) ? j.numeros : [];
  } catch (_) { return []; }
}
const _web = async serie => { const e = entornoOT(); return unirNumeros(e.numerosWeb(e.datos(), serie), await _remotos(serie)); };
```

y en las tres llamadas: `web: await _web(serie)` (todas están dentro de funciones `async`).

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run` y `npx tsc --noEmit` → verde.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/numero-ot.js public/lotes/js/guardar-ot.js test/lotes-numero-ot.test.mjs
git commit -m "feat(ordenes): el N° propuesto mira también lo que numeró el otro módulo"
```

---

### Task 4: Hojas de Prensas en un módulo puro (tipos, números, 4 renderizadores)

**Files:**
- Create: `public/prensas/js/hojas-prensas.js`
- Test: `test/prensas-hojas.test.mjs`, y un caso en `test/ordenes-resumen.test.ts`

**Interfaces:**
- Consumes: `numeroDeNombre` de `public/lotes/js/numero-ot.js`.
- Produces (todo exportado):
  - `TIPOS_HOJA_PRENSAS = { 'prensas-muestras': {nombre:'Orden de muestras', serie:'principal', vista:'orden', titulo:'muestras'}, 'prensas-rellenos': {nombre:'Rellenos', serie:'principal', vista:'relleno', titulo:'rellenos'}, 'prensas-accion': {nombre:'Acción rápida', serie:'B', vista:'degustacion', titulo:'accion'}, 'prensas-agregados': {nombre:'Agregados', serie:'B', vista:'agregados', titulo:'agregados'} }`
  - `esTipoHojaPrensas(tipo): boolean`
  - `numerosWebPrensas(datos, serie): number[]` — los `ordenes_hojas[].ot` de esa serie según el tipo.
  - `RECIPIENTES`, `AGR_TIPO_LABEL`, `AGR_TIPO_ORDEN`, `TITULOS_DEF` (= el `ordenTitulos` inicial de app.js), `ohTop()`, `notaConChecks(raw)`.
  - `htmlHojaMuestras(foto, {soloLectura=false})`, `htmlHojaRellenos(foto, op)`, `htmlHojaAccion(foto, op)`, `htmlHojaAgregados(foto, op)` → string con todas las `.orden-hoja` (sin las hojas de mapas).
  - Formas de `foto` (es lo que se guarda en `ordenes_hojas[].hoja`):
    - muestras: `{ titulo, fecha, nro, dia, recibio, filas:[{lote,variedad,vasija,cant,recipiente}] }`
    - rellenos: `{ titulo, fecha, nro, dia, emitio, recibio, instrucciones, pie, filas:[{lote,vasija,cant,rellenarCon}] }`
    - accion: `{ titulo, fecha, nro, densidad, emitio, recibio, ml, filas:[{lote,anio,vasija,recip,sol,ml}] }`
    - agregados: `{ titulo, fecha, nro, emitio, recibio, filas:[{tipo,lote,variedad,cantidad,unidad,obs}] }`
    (`fecha` en ISO `AAAA-MM-DD`, como el `<input type=date>`.)

Reglas de los renderizadores:
- **Modo editable = el markup EXACTO de hoy.** Mover el cuerpo de `pintarOrden` (app.js:1316-1351), `pintarRelleno` (~1436-1469), `pintarAccion` (1060-1092) y `pintarAgrOrden` (844-879) tal cual, cambiando solo de dónde salen los valores (de `foto` en vez de `$('…').value` y de las variables globales). Mismos `data-gi`/`data-f`, mismas clases, mismas paginaciones (25 muestras, 25 rellenos, 35 acción, 35 agregados), mismos textos vacíos. El título editable: `<input class="oh-titulo" data-titkey="<clave>" value="…">` con `foto.titulo`.
- **`soloLectura: true`:** mismas hojas, pero cada `<input>`/`<select>` de celda o título es `<span class="oh-ro">texto</span>` (o `<div class="oh-titulo">` para el título), sin la columna `.delcol`/botones `.delrow`. Los valores van escapados.
- Agregados: las filas se agrupan por `tipo` en el orden en que vienen (el orden lo da `agrOrdAppend` al armar).

- [ ] **Step 1: Tests que fallan**

`test/prensas-hojas.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { TIPOS_HOJA_PRENSAS, esTipoHojaPrensas, numerosWebPrensas, htmlHojaMuestras, htmlHojaRellenos,
         htmlHojaAccion, htmlHojaAgregados } from '../public/prensas/js/hojas-prensas.js';
import { SERIE_PRENSAS } from '../src/ordenes/resumen.ts';

const fila = n => ({ lote: String(25000 + n), variedad: 'Malbec', vasija: 'Barril', cant: '1', recipiente: 'Tubo falcon' });
const muestras = (n, x = {}) => ({ titulo: 'Orden de Trabajo', fecha: '2026-11-04', nro: '0951', dia: 'Martes', recibio: 'Luis',
  filas: Array.from({ length: n }, (_, i) => fila(i)), ...x });
const cuenta = (html, s) => html.split(s).length - 1;

describe('tipos de Prensas', () => {
  it('ids, series y espejo con el servidor', () => {
    expect(Object.keys(TIPOS_HOJA_PRENSAS)).toEqual(['prensas-muestras', 'prensas-rellenos', 'prensas-accion', 'prensas-agregados']);
    for (const [id, t] of Object.entries(TIPOS_HOJA_PRENSAS)) expect(SERIE_PRENSAS[id]).toBe(t.serie);
    expect(esTipoHojaPrensas('muestras')).toBe(false);
  });
  it('numerosWebPrensas', () => {
    const d = { ordenes_hojas: [{ tipo: 'prensas-muestras', ot: '0951' }, { tipo: 'prensas-accion', ot: 'B245' }, { tipo: 'prensas-rellenos', ot: '' }] };
    expect(numerosWebPrensas(d, 'principal')).toEqual([951]);
    expect(numerosWebPrensas(d, 'B')).toEqual([245]);
  });
});

describe('Orden de muestras', () => {
  it('editable: 25 filas por hoja, con inputs y borrar fila', () => {
    const h = htmlHojaMuestras(muestras(26));
    expect(cuenta(h, 'class="orden-hoja"')).toBe(2);
    expect(h).toContain('Hoja 2 de 2');
    expect(h).toContain('data-gi="25" data-f="lote"');
    expect(h).toContain('data-delrow="0"');
    expect(h).toContain('<b>N° de Orden:</b> 0951');
    expect(h).toContain('<b>Emitió:</b> Marcelo');
  });
  it('vacía: el texto de siempre', () => {
    expect(htmlHojaMuestras(muestras(0))).toContain('No hay lotes para los criterios elegidos.');
  });
  it('solo lectura: sin inputs, selects ni borrar; los valores como texto escapado', () => {
    const h = htmlHojaMuestras(muestras(1, { filas: [{ ...fila(0), variedad: '<b>x</b>' }] }), { soloLectura: true });
    expect(h).not.toMatch(/<input|<select|delrow/);
    expect(h).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(h).toContain('25000');
  });
});

describe('Rellenos, Acción rápida, Agregados', () => {
  it('rellenos: instrucciones como checklist y solo lectura sin inputs', () => {
    const f = { titulo: 'Orden de Trabajo', fecha: '2026-11-04', nro: '0952', dia: '', emitio: 'Ana', recibio: '',
      instrucciones: 'Paso uno\nPaso dos', pie: 'Limpiar', filas: [{ lote: '25001', vasija: 'barril', cant: '1', rellenarCon: '25003' }] };
    expect(cuenta(htmlHojaRellenos(f), '<li>')).toBe(3);
    expect(htmlHojaRellenos(f, { soloLectura: true })).not.toMatch(/<input|<select|delrow/);
  });
  it('acción: 35 por hoja y la dosis en la nota', () => {
    const f = { titulo: 'Orden de Trabajo — Acción Rápida', fecha: '2026-11-04', nro: 'B245', densidad: '', emitio: '', recibio: '', ml: '250',
      filas: Array.from({ length: 36 }, (_, i) => ({ lote: String(i), anio: '2026', vasija: 'Barricas', recip: '1', sol: 'Sol 1.030', ml: '250' })) };
    const h = htmlHojaAccion(f);
    expect(cuenta(h, 'class="orden-hoja"')).toBe(2);
    expect(h).toContain('<b>250 mL de Solución 1.030</b>');
    expect(h).toContain('CORRECCIÓN DE ANHÍDRIDO SULFUROSO');
  });
  it('agregados: una banda por tipo', () => {
    const f = { titulo: 'Orden de Trabajo — Agregados', fecha: '2026-11-04', nro: 'B246', emitio: '', recibio: '',
      filas: [{ tipo: 'TH2', lote: '1', variedad: '', cantidad: '1', unidad: 'g/L', obs: '' },
              { tipo: 'SO2', lote: '2', variedad: '', cantidad: '30', unidad: 'ppm', obs: '' }] };
    const h = htmlHojaAgregados(f);
    expect(h).toContain('TH2 (ác. tartárico)');
    expect(h).toContain('SO2 (anh. sulfuroso)');
    expect(htmlHojaAgregados(f, { soloLectura: true })).not.toMatch(/<input|<select|delrow/);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run test/prensas-hojas.test.mjs` → FAIL (no existe el módulo).

- [ ] **Step 3: Implementar** `public/prensas/js/hojas-prensas.js` según las reglas de arriba (cabecera del archivo con el comentario de para qué es; `'use strict'`; helpers `esc`/`escA` locales iguales a los de app.js:19-20; `ohTop` y `notaConChecks` copiados de app.js:201-204 y ~1428; `fmt` de fecha ISO → `dd/mm/aaaa` y año como hace hoy cada `pintar*`). Importar `numeroDeNombre` de `'../../lotes/js/numero-ot.js'`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run` y `npx tsc --noEmit` → verde.

- [ ] **Step 5: Commit**

```bash
git add public/prensas/js/hojas-prensas.js test/prensas-hojas.test.mjs
git commit -m "feat(prensas): las 4 hojas de orden en un módulo puro (editable y solo lectura)"
```

---

### Task 5: Prensas pinta las hojas con el módulo (sin cambio visible) + entorno de Prensas

**Files:**
- Modify: `public/prensas/js/puente.js`
- Modify: `public/prensas/app.js` (`pintarOrden`, `pintarRelleno`, `pintarAccion`, `pintarAgrOrden`, constantes movidas, arranque)
- Modify: `vitest.config.ts` (binding `PRENSAS_JS`)
- Test: `test/prensas-hojas-cableado.test.ts` (nuevo)

**Interfaces:**
- Consumes: Task 2 (`fijarEntornoOT`), Task 4 (renderizadores y constantes).
- Produces en app.js (globales, los usan T6–T8): `fotoMuestras()`, `fotoRellenos()`, `fotoAccion()`, `fotoAgregados()` (devuelven la `foto` de la Task 4 leyendo los inputs y las filas en memoria, con `titulo: ordenTitulos[clave]`), `fotoDe(tipo)` (despacha por id `prensas-*`), `contenedorDe(tipo)` (`ordenPaginas`|`rellenoPaginas`|`accionPaginas`|`agrOrdenPaginas`), `quienEmite()` (= `(window.CIW && window.CIW.nombre) || usuarioActual()`).
- Produces en `window.PrensasMods` (además de lo que ya tiene): todo lo exportado de `hojas-prensas.js`; `fijarEntornoOT`; `proponerNumero`, `chipCarpeta`, `cablearChipsCarpeta`, `imprimirYGuardar` (de `guardar-ot.js`); `armarOrdenHoja`, `ordenHojaPorId` (de `ordenes-hojas.js`); `htmlCabeceraOrden`, `cablearCabeceraOrden`, `guardarOrdenHojaConfirmando` (de `vista-orden-guardada.js`); `avisar`, `informar`, `confirmar` (de `dialogos.js`).

- [ ] **Step 1: Test que falla**

`vitest.config.ts`: igual que `LOTES_JS`, agregar

```ts
// Prensas: app.js y su js/, para los tests de cableado de las órdenes (entrega 3).
const dirPrensasJs = path.join(import.meta.dirname, 'public/prensas/js');
const PRENSAS_JS: Record<string, string> = Object.fromEntries(
  ['app.js', ...readdirSync(dirPrensasJs).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)]
    .map((f) => [f, leer('public/prensas/' + f)]),
);
```

y sumarlo a `bindings`. Si `test/` tiene un `env.d.ts` (o similar) que declara los bindings para `tsc`, sumar `PRENSAS_JS: Record<string, string>` ahí.

`test/prensas-hojas-cableado.test.ts`:

```ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('Prensas dibuja las órdenes con hojas-prensas.js', () => {
  const app = env.PRENSAS_JS['app.js'];
  it('app.js ya no arma el markup de las hojas a mano', () => {
    expect(app).not.toContain('<b>Emitió:</b> Marcelo');
    expect(app).not.toContain('CORRECCIÓN DE ANHÍDRIDO SULFUROSO');
    for (const f of ['htmlHojaMuestras(', 'htmlHojaRellenos(', 'htmlHojaAccion(', 'htmlHojaAgregados(']) expect(app).toContain(f);
  });
  it('fija el entorno de órdenes de Prensas', () => {
    expect(app).toContain('fijarEntornoOT(');
    expect(app).toContain("api: '/prensas/api'");
    expect(app).toContain("eventoModo: 'prensas:modo-orden-cambio'");
  });
  it('el puente expone lo de las órdenes', () => {
    const p = env.PRENSAS_JS['js/puente.js'];
    for (const f of ['hojas-prensas.js', "lotes/js/guardar-ot.js", "lotes/js/vista-orden-guardada.js", "lotes/js/ordenes-hojas.js", "lotes/js/entorno-ot.js"])
      expect(p).toContain(f);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/prensas-hojas-cableado.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

- `puente.js`: importar y colgar en `window.PrensasMods` lo listado en Interfaces (rutas `../../lotes/js/…` y `./hojas-prensas.js`), antes del `dispatchEvent`.
- `app.js`:
  - Borrar `RECIPIENTES`, `AGR_TIPO_LABEL`, `AGR_TIPO_ORDEN`, `ohTop`, `ohTitulo`, `notaConChecks` de app.js y usar los de `PM()` (`ordenTitulos` se queda en app.js, inicializado con `{...PM().TITULOS_DEF}` cuando cargan los módulos, o dejarlo literal como hoy si los módulos todavía no cargaron: elegir lo que no rompa el orden de carga — app.js corre antes que el puente; las funciones `pintar*` corren después de `prensas:mods-listos`).
  - Cada `pintar*` = `contador`, `$('…Paginas').innerHTML = PM().htmlHoja…(foto…()) + <hojas de mapas como hoy>` + la lista de lotes de debajo como hoy. Las hojas de mapas (muestras y rellenos) siguen armándose en app.js.
  - Agregar `fotoMuestras/fotoRellenos/fotoAccion/fotoAgregados/fotoDe/contenedorDe/quienEmite`.
  - En el arranque (donde se crean los filtros tras `prensas:mods-listos`, antes de `cargar()`), fijar el entorno:

```js
PM().fijarEntornoOT({
  datos: () => DATOS, markDirty, guardar, usuarioActual: quienEmite, mostrarOverlay, cerrarOverlay,
  api: '/prensas/api', numerosWeb: PM().numerosWebPrensas, eventoModo: 'prensas:modo-orden-cambio',
});
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run` y `npx tsc --noEmit` → verde.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts test public/prensas
git commit -m "refactor(prensas): las hojas de orden salen de hojas-prensas.js; entorno de órdenes de Prensas"
```

---

### Task 6: Modo órdenes en Prensas

**Files:**
- Create: `public/prensas/js/modo-ordenes-prensas.js`
- Modify: `public/prensas/index.html` (script del `<head>`, banda, CSS), `public/prensas/app.js`, `public/prensas/js/puente.js`
- Test: `test/prensas-modo-ordenes.test.mjs` (nuevo), caso en `test/prensas-hojas-cableado.test.ts`

**Interfaces:**
- Consumes: `leerModoOrden`, `urlVolver` de `public/lotes/js/modo-ordenes.js` (puros); `TIPOS_HOJA_PRENSAS`.
- Produces: `destinoPrensas(modo, datos)` → `{accion:'hoja-nueva', tipo}` | `{accion:'ver-hoja', id, tipo}` | `{accion:'tipo-desconocido'}` | `{accion:'no-existe'}`; `tituloModoPrensas(dest, datos)` → `'Nueva · Rellenos'` | `'0951 · Rellenos · pendiente'` | `'Orden no encontrada'` (tipo desconocido guardado: muestra el id crudo, nunca revienta). Exportar también `leerModoOrden` y `urlVolver` re-exportados.
- Produces en app.js: `activarVista(v)` (lo que hoy hace el click de `setupTabs` para mostrar `#v-<v>`, extraído y reusado por el click), `arrancarModoOrden(modo)`, `abrirHojaNueva(tipo)`.

- [ ] **Step 1: Tests que fallan**

`test/prensas-modo-ordenes.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { leerModoOrden, destinoPrensas, tituloModoPrensas, urlVolver } from '../public/prensas/js/modo-ordenes-prensas.js';

const datos = { ordenes_hojas: [{ id: 'oh-1', tipo: 'prensas-rellenos', ot: '0951', estado: 'pendiente' },
                                { id: 'oh-2', tipo: 'raro', ot: '', estado: 'ejecutada' }] };
describe('modo órdenes de Prensas', () => {
  it('destino', () => {
    expect(destinoPrensas(leerModoOrden('?orden=nueva:prensas-accion'), datos)).toEqual({ accion: 'hoja-nueva', tipo: 'prensas-accion' });
    expect(destinoPrensas(leerModoOrden('?orden=nueva:muestras'), datos)).toEqual({ accion: 'tipo-desconocido' });
    expect(destinoPrensas(leerModoOrden('?orden=oh-1'), datos)).toEqual({ accion: 'ver-hoja', id: 'oh-1', tipo: 'prensas-rellenos' });
    expect(destinoPrensas(leerModoOrden('?orden=nada'), datos)).toEqual({ accion: 'no-existe' });
  });
  it('título', () => {
    expect(tituloModoPrensas({ accion: 'hoja-nueva', tipo: 'prensas-muestras' }, datos)).toBe('Nueva · Orden de muestras');
    expect(tituloModoPrensas({ accion: 'ver-hoja', id: 'oh-1' }, datos)).toBe('0951 · Rellenos · pendiente');
    expect(tituloModoPrensas({ accion: 'ver-hoja', id: 'oh-2' }, datos)).toBe('— · raro · ejecutada');
    expect(tituloModoPrensas({ accion: 'ver-hoja', id: 'x' }, datos)).toBe('Orden no encontrada');
  });
  it('volver solo a /ordenes/', () => {
    expect(urlVolver('?volver=%2Fordenes%2F%3Fv%3Dpendientes')).toBe('/ordenes/?v=pendientes');
    expect(urlVolver('?volver=https%3A%2F%2Fmalo')).toBe('/ordenes/');
  });
});
```

En `test/prensas-hojas-cableado.test.ts` sumar:

```ts
it('index.html: banda del modo y ocultar mientras carga', () => {
  expect(env.PRENSAS_HTML).toContain('id="modoOrdenes"');
  expect(env.PRENSAS_HTML).toContain('id="modoOrdenesVolver"');
  expect(env.PRENSAS_HTML).toContain('modo-ordenes-cargando');
  expect(env.PRENSAS_HTML).toMatch(/body\.modo-ordenes #tabs/);
});
```

- [ ] **Step 2: Correr y ver que fallan** → FAIL.

- [ ] **Step 3: Implementar**

- `modo-ordenes-prensas.js` (puro) según Interfaces.
- `index.html`:
  - En el `<head>`, el mismo script de Lotes (`public/lotes/index.html:7-15`): si la URL trae `?orden=`, `html.modo-ordenes-cargando` por hasta 15 s.
  - Debajo de `</header>`: `<div class="modo-ordenes-banda" id="modoOrdenes" hidden><a class="btn" id="modoOrdenesVolver" href="/ordenes/">← Órdenes de trabajo</a><span class="modo-ordenes-tit" id="modoOrdenesTit"></span><span id="modoOrdenesCab"></span></div>`.
  - CSS (en el `<style>`, FUERA de `@media print`), copiando el de Lotes (`public/lotes/index.html:1685-1690`): banda; `@media screen{.modo-ordenes-banda:not([hidden]){display:flex}}`; `body.modo-ordenes #tabs{display:none!important}`; `html.modo-ordenes-cargando #tabs, html.modo-ordenes-cargando .view{visibility:hidden}`. Además:
    - Acción rápida: `body.modo-p-accion #v-degustacion > :not(#accionWrap){display:none!important}` y `body.modo-ordenes #btnArOcultar{display:none}`.
    - Agregados: se ve toda la pestaña (los filtros alimentan «Agregar filtrados»), con `#agrOrdenWrap` abierto y `body.modo-ordenes #btnAgrOrdOcultar{display:none}`.
- `puente.js`: exponer `leerModoOrden`, `destinoPrensas`, `tituloModoPrensas`, `urlVolver`.
- `app.js`:
  - Extraer `activarVista(v)` del click de `setupTabs` y usarla en el click.
  - Al final de `cargar()` (después de `renderActive()`):

```js
const modo = PM().leerModoOrden(location.search);
try { if (modo) arrancarModoOrden(modo); }
finally { document.documentElement.classList.remove('modo-ordenes-cargando'); }
```

  - `arrancarModoOrden(modo)`: `body.modo-ordenes`, banda visible, `#modoOrdenesVolver.href = PM().urlVolver(location.search)`; según `destinoPrensas`: `hoja-nueva` → `abrirHojaNueva(tipo)`; `ver-hoja` → `abrirHojaGuardada(id)` (Task 8; en esta tarea, dejarla como función que solo activa la vista del tipo); otro → título «Esta orden no existe (¿la borraron?)» / «Tipo de orden desconocido» y ninguna `.view` activa. Título con `tituloModoPrensas`, refrescado en el evento `prensas:modo-orden-cambio`.
  - Un lector (`window.CIW && window.CIW.rol === 'lector'`) en `hoja-nueva`: título «No tenés permiso para emitir órdenes en Prensas» y ninguna vista.
  - `abrirHojaNueva(tipo)`: `body.classList.add('modo-p-' + tipo.slice(8))` (→ `modo-p-muestras`…); `activarVista(TIPOS_HOJA_PRENSAS[tipo].vista)`; accion → `$('accionWrap').style.display='block'; regenerarAccion();`; agregados → `$('agrOrdenWrap').style.display='block'; pintarAgrOrden();`; propone el N°: al lado del input de N° de esa orden (`ordNro`/`relNro`/`arNro`/`agrOrdNro`) insertar `PM().chipCarpeta(serie)` y `PM().cablearChipsCarpeta(contenedorDelInput, proponer)`; `proponer()` = `PM().proponerNumero(serie).then(p => { if (!input.value.trim()){ input.value = p.numero; repintar(); } })`, llamada una vez al abrir.

- [ ] **Step 4: Correr y ver que pasan** → `npx vitest run` y `npx tsc --noEmit` verdes.

- [ ] **Step 5: Commit**

```bash
git add public/prensas test
git commit -m "feat(prensas): modo órdenes (/prensas/?orden=…) con la banda para volver"
```

---

### Task 7: Imprimir = guardar la orden (en modo órdenes)

**Files:**
- Modify: `public/prensas/app.js`
- Test: casos en `test/prensas-hojas-cableado.test.ts`

**Interfaces:**
- Consumes: T5 (`fotoDe`, `contenedorDe`, `quienEmite`, mods), T6 (`abrirHojaNueva`), Task 8 (`abrirHojaGuardada(id)`; si la Task 8 todavía no está, el paso final hace `location.replace` a la URL de la orden guardada).
- Produces: `imprimirOrdenPrensas(tipo)` en app.js.

- [ ] **Step 1: Test que falla** (en `test/prensas-hojas-cableado.test.ts`):

```ts
it('imprimir en modo órdenes guarda la orden', () => {
  const app = env.PRENSAS_JS['app.js'];
  expect(app).toContain('async function imprimirOrdenPrensas(');
  expect(app).toContain('imprimirYGuardar(');
  expect(app).toContain('guardarOrdenHojaConfirmando(');
  expect(app).toContain("history.replaceState(");
});
```

- [ ] **Step 2: Correr y ver que falla** → FAIL.

- [ ] **Step 3: Implementar** en app.js:

```js
/* Modo órdenes: imprimir = guardar la orden (pendiente) en ordenes_hojas, con
 * N° de la carpeta. La foto es lo que salió en el papel, sin los mapas. */
let _imprimiendo = false;
async function imprimirOrdenPrensas(tipo){
  if (_imprimiendo) return;
  _imprimiendo = true;
  try {
    const M = PM(), t = M.TIPOS_HOJA_PRENSAS[tipo], foto = fotoDe(tipo);
    const inputNro = $(({ 'prensas-muestras':'ordNro', 'prensas-rellenos':'relNro', 'prensas-accion':'arNro', 'prensas-agregados':'agrOrdNro' })[tipo]);
    const r = await M.imprimirYGuardar({ claseBody: 'printing-prensas', contenedor: $(contenedorDe(tipo)),
      serie: t.serie, numero: foto.nro, titulo: t.nombre });
    if (!r.ok){ if (r.numeroLibre){ inputNro.value = r.numeroLibre; repintarOrden(tipo); } return; }
    inputNro.value = r.numero; foto.nro = r.numero;
    const orden = M.armarOrdenHoja({ id: 'oh-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      tipo, numero: r.numero, fecha: foto.fecha, quien: quienEmite(), ahora: new Date().toISOString(),
      lotes: foto.filas.map(f => f.lote), hoja: foto });
    const res = await M.guardarOrdenHojaConfirmando(orden);
    if (!res.ok){
      M.avisar(res.error === 'ejecutada'
        ? 'La orden ' + r.numero + ' ya está ejecutada: esta impresión no se guardó como orden.'
        : 'Esta impresión no se guardó como orden. Usá otro N° si es una orden distinta.', { tipo: 'mal' });
      return;
    }
    markDirty();
    const ok = await guardar(false);
    if (!ok){ M.avisar('La orden quedó en este equipo sin guardar: tocá Guardar cuando vuelva la conexión.', { tipo: 'mal' }); return; }
    const u = new URL(location.href);
    u.searchParams.set('orden', res.id);
    history.replaceState(null, '', u.pathname + u.search);
    abrirHojaGuardada(res.id);
  } finally { _imprimiendo = false; }
}
```

`repintarOrden(tipo)` = el `pintar*` que corresponde (agregarla). En modo órdenes, los botones de imprimir de cada orden (`btnImprimir`, `btnImprimirRelleno`, `btnArImprimir`, `btnAgrOrdImprimir`) llaman `imprimirOrdenPrensas(<tipo>)`; fuera del modo se mantiene `window.print()` (la Task 9 saca las entradas viejas a esas pantallas).

- [ ] **Step 4: Correr** → verdes.

- [ ] **Step 5: Commit**

```bash
git add public/prensas/app.js test
git commit -m "feat(prensas): en modo órdenes, imprimir guarda la orden pendiente con N° de la carpeta"
```

---

### Task 8: Orden guardada en solo lectura: Ejecutar, Anular, Reimprimir

**Files:**
- Modify: `public/prensas/app.js`, `public/prensas/index.html` (CSS)
- Test: casos en `test/prensas-hojas-cableado.test.ts`

**Interfaces:**
- Consumes: `htmlCabeceraOrden(orden, {puedeEditar})`, `cablearCabeceraOrden(cont, id, {reimprimir, alCambiar})`, `ordenHojaPorId`, renderizadores con `{soloLectura:true}`.
- Produces: `abrirHojaGuardada(id)` en app.js.

- [ ] **Step 1: Test que falla**:

```ts
it('orden guardada: cabecera + hoja en solo lectura', () => {
  const app = env.PRENSAS_JS['app.js'];
  expect(app).toContain('function abrirHojaGuardada(');
  expect(app).toContain('soloLectura: true');
  expect(app).toContain('cablearCabeceraOrden(');
  expect(env.PRENSAS_HTML).toMatch(/body\.hoja-guardada [^{]*\.doc-panel/);
});
```

- [ ] **Step 2: Correr y ver que falla** → FAIL.

- [ ] **Step 3: Implementar**

- CSS (fuera de `@media print`): con `body.hoja-guardada` se ocultan, en la vista activa, `.doc-panel`, `.doc-visor-bar`, `.pg-head`, `details.info`, `.tbar`, `.toolbar`, `.nuevo`, `.legend-inline`, `.scroll`, `#agrImportWrap`, `.doc-titulo`, los filtros de la orden y la lista de lotes de debajo (`#ordenLotesLista`, `#rellenoLotesLista`): solo queda la hoja. Como el modo agregados muestra toda la pestaña, la regla tiene que ganarle a la de la Task 6.
- `abrirHojaGuardada(id)`:
  - `o = PM().ordenHojaPorId(DATOS, id)`; si no está: título «Orden no encontrada» y salir.
  - `body.modo-ordenes hoja-guardada modo-p-<…>`; `activarVista(vista del tipo)`; para accion/agregados abrir su wrap.
  - `$(contenedorDe(o.tipo)).innerHTML = renderizador(o.hoja, { soloLectura: true })`.
  - `$('modoOrdenesCab').innerHTML = PM().htmlCabeceraOrden(o, { puedeEditar: !(window.CIW && window.CIW.rol === 'lector') })`; cablear UNA sola vez (guardar una bandera en el elemento) con `reimprimir: () => window.print()` (Solo papel, como Lotes) y `alCambiar: () => abrirHojaGuardada(id)`.
  - Despachar `prensas:modo-orden-cambio` para refrescar el título.
- Si `htmlCabeceraOrden` dice algo de «Análisis» para tipos que no son `agregados` de Lotes, revisar: para `prensas-*` el texto de confirmar es «Queda registrada como ejecutada.» (lo da `vista-orden-guardada.js` porque `tipo !== 'agregados'`); no tocar Lotes.

- [ ] **Step 4: Correr** → verdes.

- [ ] **Step 5: Commit**

```bash
git add public/prensas test
git commit -m "feat(prensas): la orden guardada se ve en solo lectura y se ejecuta, anula o reimprime"
```

---

### Task 9: Sacar las órdenes de su lugar viejo + catálogo y sección

**Files:**
- Modify: `public/prensas/index.html`, `public/prensas/app.js`
- Modify: `public/ordenes/js/catalogo.js`, `public/ordenes/js/app.js`
- Test: `test/ordenes-sacadas-de-prensas.test.ts` (nuevo), `test/ordenes-catalogo.test.mjs`, y los tests de `/ordenes/` que miren `NOTA_PRENSAS` (buscar con grep `próxima entrega` en `test/`)

**Interfaces:**
- Consumes: modo órdenes (T6–T8).
- Produces: 4 entradas `modulo:'prensas'` en `TIPOS` con ids `prensas-*`.

- [ ] **Step 1: Tests que fallan**

`test/ordenes-sacadas-de-prensas.test.ts`:

```ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('Prensas ya no tiene órdenes fuera del modo órdenes', () => {
  const html = env.PRENSAS_HTML;
  const menu = (html.match(/<nav class="tabs"[\s\S]*?<\/nav>/) || [''])[0];
  it('el menú no tiene Orden de muestras ni Rellenos', () => {
    expect(menu).not.toContain('data-v="orden"');
    expect(menu).not.toContain('data-v="relleno"');
    expect(menu).toContain('data-v="agregados"');
  });
  it('Degustación y Agregados llevan a Nueva orden en vez de armarla ahí', () => {
    expect(html).not.toContain('id="btnGenAccion"');
    expect(html).not.toContain('id="btnAgrOrden"');
    expect(html).not.toContain('id="btnImprimirAgr"');
    expect(html).toContain('/prensas/?orden=nueva%3Aprensas-accion');
    expect(html).toContain('/prensas/?orden=nueva%3Aprensas-agregados');
  });
  it('guardar ya no abre la Acción rápida sola', () => {
    expect(env.PRENSAS_JS['app.js']).not.toContain('function postGuardarDeg');
  });
});
```

`test/ordenes-catalogo.test.mjs`: reemplazar el caso «Prensas no tiene tipos (llegan en la entrega 3)» por:

```js
it('Prensas: sus 4 órdenes, con ids propios', () => {
  expect(TIPOS.filter(t => t.modulo === 'prensas').map(t => t.id))
    .toEqual(['prensas-muestras', 'prensas-rellenos', 'prensas-accion', 'prensas-agregados']);
  expect(buscarTipos('relleno', ['prensas']).map(t => t.id)).toEqual(['prensas-rellenos']);
  expect(buscarTipos('so2', ['prensas', 'lotes']).map(t => t.id)).toEqual(expect.arrayContaining(['correccion', 'prensas-accion']));
  expect(modulosEditablesDe({ prensas: 'editor' })).toEqual(['prensas']);
});
```

y un caso que compare `TIPOS` de Prensas con `TIPOS_HOJA_PRENSAS` (mismos ids y nombres; importar de `../public/prensas/js/hojas-prensas.js`).

- [ ] **Step 2: Correr y ver que fallan** → FAIL.

- [ ] **Step 3: Implementar**

- `index.html`: sacar del menú Más `<button data-v="relleno">Rellenos</button>` y `<button data-v="orden">Orden de muestras</button>` (si el grupo «Herramientas» queda raro, dejarlo con lo que quede). Las `<section id="v-orden">`/`v-relleno` se quedan (las usa el modo).
- Degustación: el botón `btnGenAccion` pasa a `<a class="btn primary" id="lnkAccion" href="/prensas/?orden=nueva%3Aprensas-accion&amp;volver=%2Fordenes%2F%3Fv%3Dpendientes">Armar Acción rápida (lotes NO OK) →</a>`; el `#accionHint` se queda.
- Agregados: `btnAgrOrden` pasa a `<a class="btn" id="lnkAgrOrden" href="/prensas/?orden=nueva%3Aprensas-agregados&amp;volver=%2Fordenes%2F%3Fv%3Dpendientes">Orden de trabajo →</a>`; sacar `btnImprimirAgr`.
- `app.js`: sacar `postGuardarDeg` y su llamada en `guardar()`, los handlers de `btnGenAccion`, `btnAgrOrden`, `btnImprimirAgr` (y cualquier `$('…')` a ellos, que reventaría con null), y el `window.print()` de los 4 botones de imprimir: en esas vistas solo se llega por el modo, así que llaman siempre `imprimirOrdenPrensas`. `btnArOcultar`/`btnAgrOrdOcultar` se pueden quitar del HTML.
- `catalogo.js`: sumar al final de `TIPOS`:

```js
  { id: 'prensas-muestras', modulo: 'prensas', nombre: 'Orden de muestras',
    desc: 'Muestras de las prensas para el laboratorio y la degustación.',
    sinonimos: ['muestras', 'analisis', 'laboratorio', 'lab', 'degustacion', 'prensa', 'vencidos'] },
  { id: 'prensas-rellenos', modulo: 'prensas', nombre: 'Rellenos',
    desc: 'Rellenar barriles de las prensas con su lote origen.',
    sinonimos: ['relleno', 'rellenos', 'rellenar', 'merma', 'barriles', 'estirar'] },
  { id: 'prensas-accion', modulo: 'prensas', nombre: 'Acción rápida',
    desc: 'Corrección de SO₂ con Solución 1.030 para los lotes NO OK de la degustación.',
    sinonimos: ['accion rapida', 'so2', 'sulfuroso', 'sol 1030', 'solucion', 'no ok', 'degustacion', 'correccion'] },
  { id: 'prensas-agregados', modulo: 'prensas', nombre: 'Agregados',
    desc: 'OT de TH2 y SO₂ para las prensas, desde la bitácora de agregados.',
    sinonimos: ['agregados', 'agregado', 'th2', 'tartarico', 'so2', 'sulfuroso'] },
```

  y actualizar el comentario de `modulosEditablesDe` (ya no vale «En la entrega 1 Prensas no tiene tipos»).
- `public/ordenes/js/app.js`: sacar `NOTA_PRENSAS`, `notaPrensas()` y su uso (línea ~212).

- [ ] **Step 4: Correr** → `npx vitest run` y `npx tsc --noEmit` verdes.

- [ ] **Step 5: Commit**

```bash
git add public test
git commit -m "feat(ordenes): las órdenes de Prensas se arman desde Órdenes de trabajo y salen de Prensas"
```

---

## Verificación final (la hace quien coordina, no un subagente)

Servidor de prueba en el scratchpad (como `mock-ordenes-2.mjs`, con `public/` de `catenainstitute-ordenes-3`, documentos de Lotes y Prensas en memoria, `/prensas/api/{datos,version,estado,historial,info}`, `/ordenes/api/{lista,numeros}` imitados; launch `ordenes-seccion-3`). Recorrido:

1. `/ordenes/?v=nueva`: buscar «relleno» → solo Rellenos de Prensas; «so2» → Corrección SO₂ (Lotes) y Acción rápida (Prensas).
2. Rellenos → modo órdenes, N° propuesto, imprimir (Solo imprimir) → URL pasa a `?orden=oh-…`, hoja en solo lectura con cabecera pendiente → aparece en Pendientes con etiqueta Prensas → Marcar ejecutada → Historial.
3. Acción rápida con lotes NO OK de Degustación: solo se ve el bloque de la orden (no la tabla de degustación); imprimir → pendiente → Anular.
4. Agregados: «Agregar filtrados» funciona en modo; imprimir → serie B; la tabla `agregados` no cambia al ejecutar.
5. Prensas normal: Más sin Orden de muestras ni Rellenos; Degustación y Agregados con los enlaces; guardar Degustación ya no abre la Acción rápida.
6. Número cruzado: con una orden de Lotes `0960` en el documento de Lotes, la propuesta de Prensas es `0961` o más.
7. Lotes sigue igual: una Orden de muestras de Lotes se imprime y guarda como antes.
