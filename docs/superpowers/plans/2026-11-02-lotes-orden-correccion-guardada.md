# Orden de corrección guardada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la Orden de corrección de SO₂ se guarde al imprimir como pendiente, aparezca en el "Registro de corrección de SO₂" y se ejecute una sola vez desde esa copia guardada (todo destildado, modo Genérica / Por barril por lote).

**Architecture:** Sección nueva `ordenes_correccion` en el documento de Lotes (se fusiona por `id` en `public/shared/fusion.js`; el servidor solo la declara en `SECCIONES_LOTES`). Toda la lógica de armar, ejecutar y anular vive en un módulo puro nuevo con test (`orden-correccion-guardada.js`). La ejecución escribe en `analisis[].correccion` con `aplicarCorreccion` igual que hoy, así carteles, ficha, Agenda y la supresión del servidor no cambian. La lista de órdenes y el overlay de ejecutar van en una vista nueva (`vista-ordenes-correccion.js`) que `vista-so2.js` monta arriba de todo.

**Tech Stack:** JS de navegador en módulos ES (sin build), Cloudflare Worker en TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-11-02-lotes-orden-correccion-guardada-design.md`

## Global Constraints

- Trabajar SOLO en el worktree `C:\Users\Bmax\repos\catenainstitute-oc-guardada` (rama `feat/oc-orden-guardada`). No tocar `C:\Users\Bmax\repos\catenainstitute` (otras sesiones cambian su rama).
- **No pushear a `main`**: push a main = producción (Workers Builds). El merge lo decide el usuario al final.
- Textos de pantalla en castellano rioplatense ("Tildá", "Volvé").
- Nombre visible nuevo: **"Registro de corrección de SO₂"** (sub-pestaña). Los ids internos `so2` y `ordencorr` NO cambian.
- Todo arranca **destildado** en la ejecución; el N° de OT **no se escribe** al ejecutar; dosis **no editables** al ejecutar.
- Una sola ejecución por orden (`estado: 'pendiente' → 'ejecutada'`), sin avance parcial.
- Anular nunca borra: `estado: 'anulada'` + `anulada: { por, fecha }`.
- Comentarios en el estilo del repo: en castellano, explican el porqué.
- Tests: la suite completa se cae en esta PC por entorno (workerd). Correr por archivo:
  `npx vitest run --maxWorkers=2 <archivos>`.

---

## File Structure

| Archivo | Qué hace |
|---|---|
| `src/prensas/validacion.ts` (mod) | Declara la sección `ordenes_correccion` en Lotes. |
| `public/lotes/js/numero-ot.js` (mod) | `numerosWeb('B')` cuenta también los números de `ordenes_correccion`. |
| `public/lotes/js/orden-correccion-guardada.js` (**nuevo**, puro) | Armar la copia, pendientes, análisis posteriores, ejecutar/revertir, anular/revertir, unidad. |
| `public/lotes/js/orden-correccion-papel.js` (mod) | `filasPapelPorModo` + "Barril N" en `textoVasijas`. |
| `public/lotes/js/vista-orden-correccion.js` (mod) | Selector de modo por lote, papel mixto, guardar al imprimir, lotes pendientes, aviso; fuera el botón de formato y el overlay de ejecutar. |
| `public/lotes/js/vista-ordenes-correccion.js` (**nuevo**) | Lista de órdenes en el Registro, overlay de ejecutar, anular, ver. |
| `public/lotes/js/vista-so2.js` (mod) | Monta la lista de órdenes arriba y renombra la tabla. |
| `public/lotes/index.html`, `public/lotes/js/nucleo.js` (mod) | Etiqueta y orden de las sub-pestañas. |
| Tests | `test/validacion.test.ts`, `test/lotes-numero-ot.test.mjs`, `test/lotes-orden-correccion-guardada.test.mjs` (nuevo), `test/lotes-orden-correccion-papel.test.mjs`. |

---

### Task 1: La sección `ordenes_correccion` en servidor y numeración B

**Files:**
- Modify: `src/prensas/validacion.ts:33-45`
- Modify: `public/lotes/js/numero-ot.js:44-58`
- Test: `test/validacion.test.ts` (después del `describe('ordenes_trabajo en Lotes'…)`, ~línea 253)
- Test: `test/lotes-numero-ot.test.mjs` (`describe('numerosWeb'…)`, ~línea 60)

**Interfaces:**
- Produces: `SECCIONES_LOTES.secciones` incluye `'ordenes_correccion'`; `numerosWeb(datos, 'B')` devuelve también los números de `datos.ordenes_correccion[].numero`.

- [ ] **Step 1: Tests que fallan**

En `test/validacion.test.ts`, agregar:

```ts
describe('ordenes_correccion en Lotes', () => {
  const base = (ocs: unknown) => ({
    meta: { version: 1 },
    lotes: [{ lote: '26217' }],
    analisis: [],
    ordenes_correccion: ocs,
  });
  const oc = (i: number) => ({ id: 'oc-' + i, numero: 'B' + (200 + i), estado: 'pendiente', lotes: [] });

  it('esta declarada y no es requerida', () => {
    expect(SECCIONES_LOTES.secciones).toContain('ordenes_correccion');
    expect(SECCIONES_LOTES.requeridas).not.toContain('ordenes_correccion');
  });

  it('rechaza ordenes_correccion que no es una lista', () => {
    const e = validarDatos(base({ no: 'lista' }), base([]), false, SECCIONES_LOTES);
    expect(e.join(' ')).toMatch(/ordenes_correccion/);
  });

  it('frena perder la mayoria de las ordenes en un solo guardado', () => {
    const muchas = Array.from({ length: 30 }, (_, i) => oc(i + 1));
    const e = validarDatos(base(muchas.slice(0, 5)), base(muchas), false, SECCIONES_LOTES);
    expect(e.join(' ')).toMatch(/se perderían 25 de 30 ordenes_correccion/);
  });
});
```

En `test/lotes-numero-ot.test.mjs`, dentro de `describe('numerosWeb'…)`, agregar:

```js
  it('B: cuenta tambien las ordenes de correccion guardadas (aunque esten anuladas)', () => {
    const d = { analisis: [], ordenes_correccion: [
      { numero: 'B230', estado: 'pendiente' }, { numero: 'B231', estado: 'anulada' }, {} ] };
    expect(numerosWeb(d, 'B').sort()).toEqual([230, 231]);
    expect(numerosWeb(d, 'principal')).toEqual([]);
  });
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run --maxWorkers=2 test/validacion.test.ts test/lotes-numero-ot.test.mjs`
Expected: FAIL en los 3 tests nuevos de validación que miran la sección (el de "no es una lista" puede pasar o no) y en el de numerosWeb (`[]` en vez de `[230, 231]`).

- [ ] **Step 3: Implementar**

`src/prensas/validacion.ts` — al comentario de `SECCIONES_LOTES` agregarle una línea y sumar la sección:

```ts
 * `recorridas` (Inventario de tanques, 2026-10-14), igual.
 * `ordenes_correccion` (Orden de corrección guardada al imprimir, 2026-11-02), igual.
 */
export const SECCIONES_LOTES: ConfigSecciones = {
  secciones: ['lotes', 'analisis', 'movimientos', 'ordenes_trabajo', 'vasijas', 'mermas', 'agenda', 'recorridas', 'ordenes_correccion'],
  requeridas: ['lotes', 'analisis'],
};
```

`public/lotes/js/numero-ot.js` — en la rama `serie === 'B'`, después del `for` de `analisis`:

```js
    /* La orden guardada al imprimir ya usa su numero aunque todavia no se haya
     * ejecutado (o se haya anulado): el PDF esta en la carpeta con ese numero. */
    for (const o of d.ordenes_correccion || []) ver(o && o.numero);
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run --maxWorkers=2 test/validacion.test.ts test/lotes-numero-ot.test.mjs`
Expected: PASS todo.

- [ ] **Step 5: Commit**

```bash
git add src/prensas/validacion.ts public/lotes/js/numero-ot.js test/validacion.test.ts test/lotes-numero-ot.test.mjs
git commit -m "feat(lotes): seccion ordenes_correccion (validacion + numeracion B)"
```

---

### Task 2: Módulo puro — armar la copia guardada

**Files:**
- Create: `public/lotes/js/orden-correccion-guardada.js`
- Test: `test/lotes-orden-correccion-guardada.test.mjs` (nuevo)

**Interfaces:**
- Consumes: filas de `_ocBuildRows` (`vista-orden-correccion.js:176`): `{tipo:'lote', lote:{lote,variedad,so2_libre,barricas,…}, objetivo, diferencia, mbk_total_g, ml_total}` seguidas de `{tipo:'barrica', lote, barrica:{num,vasija,cap,estado,litros_usados}, dosis:{mbk_g, ml_solucion}}`.
- Produces:
  - `modoPorDefecto(barricas: {num,cap,litros_usados}[]) → 'generica'|'barril'`
  - `armarOrdenGuardada({id, numero, fecha, emitio, recibio, unidad, quien, ahora, filas, modos: Map<lote,modo>}) → Orden` (forma de la spec, sección Datos)
  - `lotesPendientes(ordenes) → Map<lote:string, numero:string>`
  - `analisisPosterior(orden, analisis) → Map<lote, {fecha, so2_libre}>`
  - `unidadDe(orden) → {suf, dec, de(vasija)→number, total(lote)→number}`

- [ ] **Step 1: Tests que fallan**

Crear `test/lotes-orden-correccion-guardada.test.mjs`:

```js
/* Tests de la Orden de correccion guardada (copia de lo impreso). */
import { describe, it, expect } from 'vitest';
import { modoPorDefecto, armarOrdenGuardada, lotesPendientes, analisisPosterior, unidadDe }
  from '../public/lotes/js/orden-correccion-guardada.js';

const barr = (num, litros = 225, cap = 225) => ({ num, vasija: '', cap, estado: 'LLENO', litros_usados: litros });
/* Filas como las arma _ocBuildRows: una de lote y una por barrica. */
function filasDe(lote, so2, objetivo, barricas){
  const dif = objetivo - so2;
  const dosis = b => ({ mbk_g: dif * b.litros_usados * 1.5 / 1000 * 2, ml_solucion: dif * b.litros_usados * 1.5 / 55 });
  const ds = barricas.map(dosis);
  return [
    { tipo: 'lote', lote: { lote, variedad: 'Malbec', so2_libre: so2, barricas }, objetivo, diferencia: dif,
      mbk_total_g: ds.reduce((s, d) => s + d.mbk_g, 0), ml_total: ds.reduce((s, d) => s + d.ml_solucion, 0) },
    ...barricas.map((b, i) => ({ tipo: 'barrica', lote: { lote }, barrica: b, dosis: ds[i] })),
  ];
}
const enc = { id: 'oc-1', numero: 'B230', fecha: '2026-11-02', emitio: 'Oriana', recibio: '',
              unidad: 'sol', quien: 'oriana@x', ahora: '2026-11-02T10:00:00Z' };

describe('modoPorDefecto', () => {
  it('generica si todas son barricas iguales', () => {
    expect(modoPorDefecto([barr('1'), barr('2'), barr('3')])).toBe('generica');
  });
  it('por barril si cambian los litros o la capacidad', () => {
    expect(modoPorDefecto([barr('1'), barr('2', 180)])).toBe('barril');
    expect(modoPorDefecto([barr('1'), barr('2', 50, 50)])).toBe('barril');
  });
  it('por barril si mezcla barricas con una vasija sin numero', () => {
    expect(modoPorDefecto([barr('1'), { num: '', vasija: 'T 201', cap: null, litros_usados: 900 }])).toBe('barril');
  });
  it('una sola vasija (o ninguna) es generica', () => {
    expect(modoPorDefecto([{ num: '', vasija: 'T 201', cap: null, litros_usados: 900 }])).toBe('generica');
    expect(modoPorDefecto([])).toBe('generica');
  });
});

describe('armarOrdenGuardada', () => {
  const filas = [...filasDe('26001', 18, 35, [barr('11'), barr('12')]),
                 ...filasDe('26014', 21, 35, [barr('21'), barr('22', 180)])];

  it('copia lote, objetivo vigente y dosis de cada vasija tal cual', () => {
    const o = armarOrdenGuardada({ ...enc, filas, modos: new Map() });
    expect(o).toMatchObject({ id: 'oc-1', numero: 'B230', fecha: '2026-11-02', emitio: 'Oriana',
      unidad: 'sol', estado: 'pendiente', ejecucion: null, anulada: null,
      creada_por: 'oriana@x', creada_en: '2026-11-02T10:00:00Z' });
    expect(o.lotes.map(l => l.lote)).toEqual(['26001', '26014']);
    const l = o.lotes[0];
    expect(l).toMatchObject({ variedad: 'Malbec', so2_libre: 18, objetivo: 35, diferencia: 17 });
    expect(l.vasijas).toHaveLength(2);
    expect(l.vasijas[0]).toEqual({ num: '11', vasija: '', cap: 225, litros: 225,
      mbk_g: filas[1].dosis.mbk_g, ml: filas[1].dosis.ml_solucion });
    expect(l.ml_total).toBeCloseTo(filas[0].ml_total, 6);
  });

  it('modo: el elegido a mano manda; si no, el por defecto', () => {
    const o = armarOrdenGuardada({ ...enc, filas, modos: new Map([['26001', 'barril']]) });
    expect(o.lotes[0].modo).toBe('barril');
    expect(o.lotes[1].modo).toBe('barril');   // 225 y 180 L: por defecto por barril
    const o2 = armarOrdenGuardada({ ...enc, filas, modos: new Map([['26014', 'generica']]) });
    expect(o2.lotes[0].modo).toBe('generica');
    expect(o2.lotes[1].modo).toBe('generica');
  });

  it('unidad desconocida cae en solucion y el numero se recorta', () => {
    const o = armarOrdenGuardada({ ...enc, numero: ' B230 ', unidad: 'x', filas, modos: new Map() });
    expect(o.unidad).toBe('sol');
    expect(o.numero).toBe('B230');
  });
});

describe('lotesPendientes', () => {
  it('solo las pendientes, lote -> numero', () => {
    const m = lotesPendientes([
      { numero: 'B230', estado: 'pendiente', lotes: [{ lote: '26001' }, { lote: '26014' }] },
      { numero: 'B231', estado: 'ejecutada', lotes: [{ lote: '26020' }] },
      { numero: 'B232', estado: 'anulada', lotes: [{ lote: '26021' }] },
    ]);
    expect([...m]).toEqual([['26001', 'B230'], ['26014', 'B230']]);
  });
  it('sin lista no rompe', () => {
    expect(lotesPendientes(undefined).size).toBe(0);
  });
});

describe('analisisPosterior', () => {
  const orden = { fecha: '2026-10-28', lotes: [{ lote: '26001' }, { lote: '26014' }] };
  it('el ultimo analisis con SO2 posterior a la orden, por lote', () => {
    const m = analisisPosterior(orden, [
      { lote: '26001', fecha_analisis: '2026-10-28', so2_libre: 20 },   // mismo dia: no
      { lote: '26001', fecha_analisis: '2026-10-30', so2_libre: 28 },
      { lote: '26001', fecha_analisis: '2026-10-29', so2_libre: 25 },
      { lote: '26014', fecha_analisis: '2026-11-01', so2_libre: -999 }, // sin dato
      { lote: '26014', fecha_analisis: '2026-11-01', correccion: {} },  // solo correccion
      { lote: '26099', fecha_analisis: '2026-11-01', so2_libre: 30 },   // otro lote
    ]);
    expect([...m]).toEqual([['26001', { fecha: '2026-10-30', so2_libre: 28 }]]);
  });
});

describe('unidadDe', () => {
  const v = { mbk_g: 11.475, ml: 104.318 };
  const l = { mbk_total_g: 22.95, ml_total: 208.6 };
  it('solucion en mL con 1 decimal', () => {
    const u = unidadDe({ unidad: 'sol' });
    expect([u.suf, u.dec, u.de(v), u.total(l)]).toEqual(['mL', 1, 104.318, 208.6]);
  });
  it('MBK en g con 2 decimales', () => {
    const u = unidadDe({ unidad: 'mbk' });
    expect([u.suf, u.dec, u.de(v), u.total(l)]).toEqual(['g', 2, 11.475, 22.95]);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run --maxWorkers=2 test/lotes-orden-correccion-guardada.test.mjs`
Expected: FAIL — no se puede resolver `orden-correccion-guardada.js`.

- [ ] **Step 3: Implementar**

Crear `public/lotes/js/orden-correccion-guardada.js`:

```js
/* ===== Lotes CIW — la Orden de correccion de SO2 guardada =====
 *
 * Modulo puro (sin DOM, sin nucleo.js). Al imprimir, la orden se guarda en
 * DATOS().ordenes_correccion tal como salio en el papel: lotes, objetivo
 * vigente (el pisado a mano incluido), modo de cada lote y la dosis de cada
 * vasija en las dos unidades. Ejecutar lee ESTA copia y nunca recalcula: antes
 * se volvia a armar la lista al ejecutar y lo registrado no coincidia con el
 * papel (dosis o lotes distintos), que es el problema que esto arregla.
 *
 * Forma: ver docs/superpowers/specs/2026-11-02-lotes-orden-correccion-guardada-design.md */
'use strict';

/** Modo con el que arranca un lote. Generica (un renglon por tipo de vasija)
 *  solo si todas sus vasijas llevan exactamente la misma dosis: barricas con
 *  numero, misma capacidad y mismos litros. Si no, por barril, para que nadie
 *  tenga que adivinar cual de las barricas lleva distinto. */
export function modoPorDefecto(barricas){
  const bs = barricas || [];
  if (bs.length <= 1) return 'generica';
  if (bs.some(b => !b || !b.num)) return 'barril';
  const clave = b => String(b.cap ?? '') + '|' + String(b.litros_usados ?? '');
  const k = clave(bs[0]);
  return bs.every(b => clave(b) === k) ? 'generica' : 'barril';
}

/** La copia que se guarda al imprimir. `filas` son las de _ocBuildRows (las
 *  mismas que pintan el papel), `modos` el Map lote -> modo elegido a mano. */
export function armarOrdenGuardada({ id, numero, fecha, emitio = '', recibio = '', unidad,
                                     quien = '', ahora = '', filas, modos }){
  const lotes = [];
  let actual = null;
  for (const f of filas || []){
    if (f.tipo === 'lote'){
      actual = { lote: String(f.lote.lote), variedad: f.lote.variedad || '',
                 so2_libre: f.lote.so2_libre, objetivo: f.objetivo, diferencia: f.diferencia,
                 modo: null, vasijas: [], mbk_total_g: f.mbk_total_g, ml_total: f.ml_total };
      lotes.push(actual);
      continue;
    }
    if (f.tipo !== 'barrica' || !actual) continue;
    const b = f.barrica || {};
    const d = f.dosis || {};
    actual.vasijas.push({ num: String(b.num || ''), vasija: b.vasija || '', cap: b.cap ?? null,
                          litros: b.litros_usados, mbk_g: d.mbk_g, ml: d.ml_solucion });
  }
  for (const l of lotes){
    const m = modos && modos.get(l.lote);
    l.modo = (m === 'generica' || m === 'barril') ? m
      : modoPorDefecto(l.vasijas.map(v => ({ num: v.num, cap: v.cap, litros_usados: v.litros })));
  }
  return { id, numero: String(numero ?? '').trim(), fecha, emitio, recibio,
           creada_por: quien, creada_en: ahora,
           unidad: unidad === 'mbk' ? 'mbk' : 'sol',
           estado: 'pendiente', lotes, ejecucion: null, anulada: null };
}

/** Lote -> numero de la orden PENDIENTE que lo tiene. Una ejecutada o anulada
 *  ya no reserva el lote. */
export function lotesPendientes(ordenes){
  const m = new Map();
  for (const o of ordenes || []){
    if (!o || o.estado !== 'pendiente') continue;
    for (const l of o.lotes || []) if (l && l.lote != null) m.set(String(l.lote), String(o.numero ?? ''));
  }
  return m;
}

const so2Valido = v => v != null && v !== '' && v !== -999 && Number.isFinite(Number(v));

/** El ultimo analisis CON SO2 de cada lote de la orden, si es de un dia
 *  posterior a la orden. Solo para avisar al ejecutar: la orden se ejecuta con
 *  sus numeros igual, porque eso es lo que se hizo en la bodega. */
export function analisisPosterior(orden, analisis){
  const out = new Map();
  const lotes = new Set((orden.lotes || []).map(l => String(l.lote)));
  for (const a of analisis || []){
    if (!a) continue;
    const L = String(a.lote ?? '');
    if (!lotes.has(L)) continue;
    const f = a.fecha_analisis || '';
    if (!(f > (orden.fecha || ''))) continue;
    if (!so2Valido(a.so2_libre)) continue;
    const prev = out.get(L);
    if (!prev || f > prev.fecha) out.set(L, { fecha: f, so2_libre: a.so2_libre });
  }
  return out;
}

/** Como se dice la dosis de esta orden: la unidad con que se imprimio. */
export function unidadDe(orden){
  return (orden && orden.unidad === 'mbk')
    ? { suf: 'g', dec: 2, de: v => v.mbk_g, total: l => l.mbk_total_g }
    : { suf: 'mL', dec: 1, de: v => v.ml, total: l => l.ml_total };
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run --maxWorkers=2 test/lotes-orden-correccion-guardada.test.mjs`
Expected: PASS todo.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/orden-correccion-guardada.js test/lotes-orden-correccion-guardada.test.mjs
git commit -m "feat(lotes): modulo puro de la orden de correccion guardada (copia, pendientes, analisis posterior)"
```

---

### Task 3: Módulo puro — ejecutar y anular (con deshacer)

**Files:**
- Modify: `public/lotes/js/orden-correccion-guardada.js` (agregar al final + import arriba)
- Test: `test/lotes-orden-correccion-guardada.test.mjs` (agregar al final)

**Interfaces:**
- Consumes: `armarCorreccion`, `aplicarCorreccion`, `revertirCorrecciones` de `./so2-bitacora.js` (firmas en `so2-bitacora.js:18,83,127`).
- Produces:
  - `entradasDeEjecucion(orden, tildes: Map<lote, Set<indiceVasija>>, fecha) → {entradas:[{lote, correccion}], hechos:[{lote, vasijas:string[], mbk_g, ml}]}`
  - `escribirEjecucion(datos, ordenId, {tildes, fecha, quien, ahora}) → {ok:false, motivo} | {ok:true, snaps, entradas, conviven:string[]}` — MUTA `datos.analisis` y la orden.
  - `revertirEjecucion(datos, ordenId, snaps) → void`
  - `anularOrden(datos, ordenId, quien, fecha) → boolean`
  - `revertirAnulacionOrden(datos, ordenId) → void`

- [ ] **Step 1: Tests que fallan**

Cambiar el import de arriba del test a:

```js
import { modoPorDefecto, armarOrdenGuardada, lotesPendientes, analisisPosterior, unidadDe,
         entradasDeEjecucion, escribirEjecucion, revertirEjecucion, anularOrden, revertirAnulacionOrden }
  from '../public/lotes/js/orden-correccion-guardada.js';
```

Y agregar al final:

```js
function ordenDePrueba(){
  const filas = [...filasDe('26001', 18, 35, [barr('11'), barr('12')]),
                 ...filasDe('26014', 21, 35, [barr('21'), barr('22', 180), barr('23')])];
  return armarOrdenGuardada({ ...enc, filas, modos: new Map([['26001', 'generica'], ['26014', 'barril']]) });
}

describe('entradasDeEjecucion', () => {
  it('sin tildes no hay nada que registrar', () => {
    const r = entradasDeEjecucion(ordenDePrueba(), new Map(), '2026-11-03');
    expect(r).toEqual({ entradas: [], hechos: [] });
  });

  it('generica: un tilde registra todas las vasijas del lote', () => {
    const o = ordenDePrueba();
    const r = entradasDeEjecucion(o, new Map([['26001', new Set([0])]]), '2026-11-03');
    expect(r.entradas).toHaveLength(1);
    const c = r.entradas[0].correccion;
    expect(c).toMatchObject({ so2_libre_actual: 18, so2_deseado: 35, diferencia: 17,
                              ot_n: 'B230', fecha: '2026-11-03' });
    expect(c.ml_exactos).toBeCloseTo(o.lotes[0].ml_total, 6);
    expect(c.mbk_a_agregar).toBeCloseTo(o.lotes[0].mbk_total_g, 6);
    expect(r.hechos).toEqual([{ lote: '26001', vasijas: ['11', '12'],
      mbk_g: c.mbk_a_agregar, ml: c.ml_exactos }]);
  });

  it('por barril: registra la suma de lo tildado, nada mas', () => {
    const o = ordenDePrueba();
    const v = o.lotes[1].vasijas;
    const r = entradasDeEjecucion(o, new Map([['26014', new Set([2, 0])]]), '2026-11-03');
    expect(r.hechos[0].vasijas).toEqual(['21', '23']);
    expect(r.entradas[0].correccion.ml_exactos).toBeCloseTo(v[0].ml + v[2].ml, 6);
    expect(r.entradas[0].correccion.mbk_a_agregar).toBeCloseTo(v[0].mbk_g + v[2].mbk_g, 6);
  });

  it('una vasija sin numero se anota por su nombre', () => {
    const filas = filasDe('25306', 20, 40, [{ num: '', vasija: 'T 201', cap: null, litros_usados: 900 }]);
    const o = armarOrdenGuardada({ ...enc, filas, modos: new Map() });
    const r = entradasDeEjecucion(o, new Map([['25306', new Set([0])]]), '2026-11-03');
    expect(r.hechos[0].vasijas).toEqual(['T 201']);
  });

  it('una dosis no finita no se registra (el lote vuelve a la orden)', () => {
    const o = ordenDePrueba();
    o.lotes[0].vasijas[0].ml = NaN;
    const r = entradasDeEjecucion(o, new Map([['26001', new Set([0])]]), '2026-11-03');
    expect(r.entradas).toEqual([]);
  });
});

describe('escribirEjecucion / revertirEjecucion', () => {
  const datosCon = o => ({ analisis: [{ lote: '26001', fecha_analisis: '2026-10-25', so2_libre: 18 }],
                           ordenes_correccion: [o] });

  it('escribe la correccion en analisis y deja la orden ejecutada', () => {
    const o = ordenDePrueba();
    const d = datosCon(o);
    const r = escribirEjecucion(d, 'oc-1', { tildes: new Map([['26001', new Set([0])]]),
      fecha: '2026-11-03', quien: 'juan', ahora: '2026-11-03T12:00:00Z' });
    expect(r.ok).toBe(true);
    expect(d.analisis).toHaveLength(2);
    expect(d.analisis[1]).toMatchObject({ lote: '26001', fecha_analisis: '2026-11-03',
      correccion: { ot_n: 'B230' } });
    expect(o.estado).toBe('ejecutada');
    expect(o.ejecucion).toMatchObject({ fecha: '2026-11-03', por: 'juan', en: '2026-11-03T12:00:00Z' });
    expect(o.ejecucion.hechos.map(h => h.lote)).toEqual(['26001']);
  });

  it('revertir deja todo como estaba', () => {
    const o = ordenDePrueba();
    const d = datosCon(o);
    const antes = JSON.stringify(d);
    const r = escribirEjecucion(d, 'oc-1', { tildes: new Map([['26014', new Set([1])]]), fecha: '2026-11-03' });
    revertirEjecucion(d, 'oc-1', r.snaps);
    expect(JSON.stringify(d)).toBe(antes);
  });

  it('revertir tambien funciona sobre otro documento (despues de un 409 que fusiono)', () => {
    const o = ordenDePrueba();
    const d = datosCon(o);
    const r = escribirEjecucion(d, 'oc-1', { tildes: new Map([['26001', new Set([0])]]), fecha: '2026-11-03' });
    const fusionado = JSON.parse(JSON.stringify(d));
    revertirEjecucion(fusionado, 'oc-1', r.snaps);
    expect(fusionado.analisis).toHaveLength(1);
    expect(fusionado.ordenes_correccion[0]).toMatchObject({ estado: 'pendiente', ejecucion: null });
  });

  it('no ejecuta dos veces ni sin tildes', () => {
    const o = ordenDePrueba();
    const d = datosCon(o);
    expect(escribirEjecucion(d, 'oc-1', { tildes: new Map(), fecha: '2026-11-03' }).ok).toBe(false);
    escribirEjecucion(d, 'oc-1', { tildes: new Map([['26001', new Set([0])]]), fecha: '2026-11-03' });
    const otra = escribirEjecucion(d, 'oc-1', { tildes: new Map([['26014', new Set([0])]]), fecha: '2026-11-03' });
    expect(otra).toEqual({ ok: false, motivo: 'La orden B230 ya no está pendiente.' });
    expect(escribirEjecucion(d, 'no-existe', { tildes: new Map(), fecha: '2026-11-03' }).ok).toBe(false);
  });
});

describe('anularOrden / revertirAnulacionOrden', () => {
  it('anula solo una pendiente, sin borrarla', () => {
    const o = ordenDePrueba();
    const d = { analisis: [], ordenes_correccion: [o] };
    expect(anularOrden(d, 'oc-1', 'oriana', '2026-11-03')).toBe(true);
    expect(d.ordenes_correccion).toHaveLength(1);
    expect(o).toMatchObject({ estado: 'anulada', anulada: { por: 'oriana', fecha: '2026-11-03' } });
    expect(anularOrden(d, 'oc-1', 'oriana', '2026-11-03')).toBe(false);
    revertirAnulacionOrden(d, 'oc-1');
    expect(o).toMatchObject({ estado: 'pendiente', anulada: null });
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run --maxWorkers=2 test/lotes-orden-correccion-guardada.test.mjs`
Expected: FAIL — `entradasDeEjecucion is not a function` (y el resto de los nuevos).

- [ ] **Step 3: Implementar**

Arriba de `orden-correccion-guardada.js`, debajo de `'use strict';`:

```js
import { armarCorreccion, aplicarCorreccion, revertirCorrecciones } from './so2-bitacora.js';
```

Al final del archivo:

```js
const _orden = (datos, id) => ((datos && datos.ordenes_correccion) || []).find(o => o && o.id === id) || null;

/** Lo que se registra al ejecutar. `tildes`: lote -> Set de indices de
 *  vasija tildados. En generica basta un indice cualquiera: el tilde es del
 *  lote entero. Las dosis salen de la copia guardada; nunca se recalculan. */
export function entradasDeEjecucion(orden, tildes, fecha){
  const entradas = [], hechos = [];
  for (const l of orden.lotes || []){
    const t = tildes && tildes.get(l.lote);
    if (!t || !t.size) continue;
    const idx = l.modo === 'generica'
      ? l.vasijas.map((_, i) => i)
      : [...t].filter(i => l.vasijas[i]).sort((a, b) => a - b);
    if (!idx.length) continue;
    const mbk = idx.reduce((s, i) => s + Number(l.vasijas[i].mbk_g), 0);
    const ml  = idx.reduce((s, i) => s + Number(l.vasijas[i].ml), 0);
    /* Igual que la ejecucion vieja: un NaN pasaria a null por JSON y dejaria
     * una dosis falsa en el registro. Mejor no registrar y que el lote vuelva. */
    if (!Number.isFinite(mbk) || !Number.isFinite(ml)) continue;
    entradas.push({ lote: l.lote, correccion: armarCorreccion({
      so2Actual: l.so2_libre, so2Deseado: l.objetivo, mbk, ml, ot: orden.numero, fecha }) });
    hechos.push({ lote: l.lote, vasijas: idx.map(i => l.vasijas[i].num || l.vasijas[i].vasija),
                  mbk_g: mbk, ml });
  }
  return { entradas, hechos };
}

/** Ejecuta la orden: escribe una correccion por lote tildado (por
 *  aplicarCorreccion, el mismo camino que la calculadora y el panel de la OT)
 *  y deja la orden ejecutada. MUTA `datos`. Devuelve los snaps para
 *  revertirEjecucion si el guardado falla. */
export function escribirEjecucion(datos, ordenId, { tildes, fecha, quien = '', ahora = '' }){
  const orden = _orden(datos, ordenId);
  if (!orden) return { ok: false, motivo: 'No se encontró la orden.' };
  if (orden.estado !== 'pendiente') return { ok: false, motivo: 'La orden ' + orden.numero + ' ya no está pendiente.' };
  const { entradas, hechos } = entradasDeEjecucion(orden, tildes, fecha);
  if (!entradas.length) return { ok: false, motivo: 'No hay ningún lote tildado.' };
  if (!Array.isArray(datos.analisis)) datos.analisis = [];
  const snaps = entradas.map(e => {
    const r = aplicarCorreccion(datos.analisis, e.lote, fecha, e.correccion);
    return { tipo: r.que, ref: r.ref, corrAnterior: r.anterior, lote: r.lote,
             fecha: r.fecha, escrita: r.escrita, convive: r.convive };
  });
  orden.estado = 'ejecutada';
  orden.ejecucion = { fecha, por: quien, en: ahora, hechos };
  return { ok: true, snaps, entradas, conviven: snaps.filter(s => s.convive != null).map(s => s.lote) };
}

/** Deshace escribirEjecucion sobre `datos`, que puede ser OTRO documento (el
 *  fusionado despues de un 409): la orden se busca por id y las correcciones
 *  por contenido (revertirCorrecciones). */
export function revertirEjecucion(datos, ordenId, snaps){
  revertirCorrecciones((datos && datos.analisis) || [], snaps || []);
  const orden = _orden(datos, ordenId);
  if (orden){ orden.estado = 'pendiente'; orden.ejecucion = null; }
}

/** Anula una orden PENDIENTE. No la borra: queda tachada en el Registro. */
export function anularOrden(datos, ordenId, quien, fecha){
  const orden = _orden(datos, ordenId);
  if (!orden || orden.estado !== 'pendiente') return false;
  orden.estado = 'anulada';
  orden.anulada = { por: quien || '', fecha };
  return true;
}

export function revertirAnulacionOrden(datos, ordenId){
  const orden = _orden(datos, ordenId);
  if (orden && orden.estado === 'anulada'){ orden.estado = 'pendiente'; orden.anulada = null; }
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run --maxWorkers=2 test/lotes-orden-correccion-guardada.test.mjs test/lotes-so2-bitacora.test.mjs`
Expected: PASS todo.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/orden-correccion-guardada.js test/lotes-orden-correccion-guardada.test.mjs
git commit -m "feat(lotes): ejecutar y anular la orden de correccion guardada, con deshacer"
```

---

### Task 4: Papel con modo por lote

**Files:**
- Modify: `public/lotes/js/orden-correccion-papel.js` (`textoVasijas` ~línea 93; agregar `filasPapelPorModo` al final)
- Test: `test/lotes-orden-correccion-papel.test.mjs`

**Interfaces:**
- Consumes: `gruposPorLote(filas, u)` (mismo archivo).
- Produces: `filasPapelPorModo(filas, modoDe: (loteObj) => 'generica'|'barril', u) → grupo[]` para `filaPapelLote`. Los grupos de un lote por barril tienen `cantidad: 1` y `num`.

- [ ] **Step 1: Tests que fallan**

Agregar `filasPapelPorModo` al import del test y al final:

```js
describe('filasPapelPorModo', () => {
  const lote = { lote: '26014' }, otro = { lote: '26001' };
  const b = (num, litros = 225) => ({ num, vasija: '', cap: 225, litros_usados: litros });
  const filas = [
    { tipo: 'lote', lote: otro },
    { tipo: 'barrica', lote: otro, barrica: b('11'), dosis: { ml_solucion: 104.3 } },
    { tipo: 'barrica', lote: otro, barrica: b('12'), dosis: { ml_solucion: 104.3 } },
    { tipo: 'lote', lote },
    { tipo: 'barrica', lote, barrica: b('21'), dosis: { ml_solucion: 85.9 } },
    { tipo: 'barrica', lote, barrica: b('22', 180), dosis: { ml_solucion: 68.7 } },
  ];
  const modoDe = l => (l.lote === '26014' ? 'barril' : 'generica');

  it('generica junta como el papel por lote; por barril, un renglon por barril', () => {
    const g = filasPapelPorModo(filas, modoDe, sol);
    expect(g.map(x => [x.lote.lote, x.cantidad, x.num || ''])).toEqual([
      ['26001', 2, ''], ['26014', 1, '21'], ['26014', 1, '22']]);
    expect(g[2].dosis).toBe(68.7);
  });

  it('el renglon por barril dice el numero del barril', () => {
    const g = filasPapelPorModo(filas, modoDe, sol);
    expect(textoVasijas(g[1])).toBe('Barril 21 · 225 L');
    expect(textoVasijas(g[2])).toBe('Barril 22 · 225 L (con 180 L)');
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run --maxWorkers=2 test/lotes-orden-correccion-papel.test.mjs`
Expected: FAIL — `filasPapelPorModo is not a function`.

- [ ] **Step 3: Implementar**

En `textoVasijas`, justo después de calcular `tieneCap` y ANTES de `let t;`:

```js
  /* Renglon de un lote "por barril": uno por barril, con su numero. */
  if (g.num){
    let tb = 'Barril ' + g.num;
    if (tieneCap) tb += ' · ' + litrosTxt(capNum) + ' L';
    if (!tieneCap || Math.abs(Number(g.litros) - capNum) > 0.05) tb += ' (con ' + litrosTxt(g.litros) + ' L)';
    return tb;
  }
```

Al final del archivo:

```js
/** Las filas del papel cuando cada lote elige su modo (Genérica / Por barril).
 *  La hoja usa siempre las columnas del papel por lote: un mismo papel mezcla
 *  los dos modos y no puede tener dos encabezados. Genérica junta como
 *  gruposPorLote; Por barril saca un renglon por vasija con su numero.
 *  modoDe recibe el objeto lote de la fila separadora. */
export function filasPapelPorModo(filas, modoDe, u){
  const out = [];
  let bloque = [];
  const vaciar = () => {
    if (!bloque.length) return;
    const lote = bloque[0].lote;
    if (modoDe(lote) === 'barril'){
      for (const f of bloque.slice(1)){
        if (f.tipo !== 'barrica') continue;
        const b = f.barrica || {};
        out.push({ tipo: 'grupo', lote, barril: !!b.num, num: b.num || '', cap: b.cap,
                   vasija: b.vasija || '', litros: b.litros_usados, cantidad: 1,
                   dosis: u.de(f.dosis || {}) });
      }
    } else out.push(...gruposPorLote(bloque, u));
    bloque = [];
  };
  for (const f of filas || []){
    if (f.tipo === 'lote') vaciar();
    bloque.push(f);
  }
  vaciar();
  return out;
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run --maxWorkers=2 test/lotes-orden-correccion-papel.test.mjs`
Expected: PASS todo (los tests viejos de `textoVasijas` no cambian: los grupos de `gruposPorLote` no traen `num`).

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/orden-correccion-papel.js test/lotes-orden-correccion-papel.test.mjs
git commit -m "feat(lotes): papel de la orden de correccion con modo por lote (generica / por barril)"
```

---

### Task 5: Pantalla de Orden de corrección — modo por lote, guardar al imprimir, lotes pendientes

**Files:**
- Modify: `public/lotes/js/vista-orden-correccion.js`

**Interfaces:**
- Consumes: `modoPorDefecto`, `armarOrdenGuardada`, `lotesPendientes` (Task 2); `filasPapelPorModo` (Task 4); `mostrarTab`, `usuarioActual`, `DATOS`, `markDirty`, `guardar` de `nucleo.js`; `avisar`, `confirmar` de `dialogos.js`.
- Produces: `DATOS().ordenes_correccion` con órdenes pendientes nuevas. Ya no exporta `_ocEntradasDeEjecucion`, `_ocEscribirEntradas`, `_ocRevertirEntradas` (verificado: ningún test las importa).

Vista sin test unitario (DOM); se verifica en el navegador en la Task 7. Pasos:

- [ ] **Step 1: Imports**

Reemplazar los imports de las líneas 21-34 por:

```js
import { $, esc, escA, registrarVista, DATOS, markDirty, guardar,
         usuarioActual, mostrarTab } from './nucleo.js';
import { anularCorreccion, revertirAnulaciones } from './so2-bitacora.js';
import { pintarHojas, HOJA_POR_PAGINA } from './orden-hoja.js';
import { INSTRUCCIONES_SOLUCION, filaPapelLote, theadPapelLote,
         COLGROUP_PAPEL_LOTE, COLUMNAS_PAPEL_LOTE, filasPapelPorModo } from './orden-correccion-papel.js';
import { pasaMulti, opcionesValores, matchValor, crearFiltroMulti,
         limpiarFiltrosMulti } from './tabla.js';
import { ciclarOrdenOc, ordenarLotesOc } from './orden-correccion-orden.js';
import { queryAnios } from './selector-anios.js';
import { proponerNumero, chipCarpeta, cablearChipsCarpeta, imprimirYGuardar } from './guardar-ot.js';
import { avisar, confirmar } from './dialogos.js';
import { modoPorDefecto, armarOrdenGuardada, lotesPendientes } from './orden-correccion-guardada.js';
```

Antes de borrar `mostrarOverlay`/`cerrarOverlay` del import, comprobar que `_ocAnularCorrecciones` (líneas ~289-418) no los use: `grep -n "mostrarOverlay\|cerrarOverlay" public/lotes/js/vista-orden-correccion.js`. Las únicas apariciones tienen que estar en el bloque que se borra en el Step 6. Si aparecen en otro lado, dejarlos en el import.

- [ ] **Step 2: Estado de modo y pendientes; fuera el formato de papel**

Borrar el bloque `_ocFormato` / `OC_FORMATO_BTN` / `_ocPintarBotonFormato` (líneas ~126-141) y poner en su lugar:

```js
/* Modo de cada lote, para el papel y para la ejecucion: 'generica' (un
 * renglon por tipo de vasija) o 'barril' (un renglon por barril). Sin eleccion
 * a mano manda modoPorDefecto. Vive en memoria, como la unidad; lo que se
 * imprime queda guardado en la orden. */
let _ocModos = new Map();            // lote -> modo elegido a mano
const _ocModoDe = l => _ocModos.get(l.lote) || modoPorDefecto(l.barricas);

/* Lotes que se sacaron SOLOS de la orden por estar en una orden pendiente.
 * Se distinguen de los que destildo el usuario para poder devolverlos cuando
 * esa orden se ejecuta o se anula, sin pisar lo que el usuario eligio. */
let _ocPendAuto = new Set();

function _ocMarcarPendientes(){
  const pend = lotesPendientes(DATOS().ordenes_correccion);
  for (const l of (_ocOrden && _ocOrden.lotes) || []){
    if (pend.has(l.lote) && !_ocPendAuto.has(l.lote)){ _ocExcluidos.add(l.lote); _ocPendAuto.add(l.lote); }
  }
  for (const lote of [..._ocPendAuto]){
    if (!pend.has(lote)){ _ocPendAuto.delete(lote); _ocExcluidos.delete(lote); }
  }
}

function _ocPintarAvisoPendientes(){
  const el = $('ocPendAviso');
  if (!el) return;
  const pend = (DATOS().ordenes_correccion || []).filter(o => o && o.estado === 'pendiente');
  el.innerHTML = pend.length
    ? '<div class="msg info">⏳ Hay ' + pend.length + (pend.length === 1 ? ' orden pendiente' : ' órdenes pendientes') +
      ' de ejecutar: ' + pend.map(o => '<b>' + esc(o.numero) + '</b>').join(' · ') +
      ' <button class="btn" data-oc-ver-pend>Ver →</button></div>'
    : '';
}
```

- [ ] **Step 3: Papel siempre con columnas por lote y modo por lote**

Borrar `_ocRenderFila` (línea ~469). En `_ocPintarPaginas` reemplazar desde `const porLote = …` hasta el cierre de `pintarHojas({…})` por:

```js
  const filas = _ocBuildRowsLocal();
  cont.innerHTML = pintarHojas({
    filas: filasPapelPorModo(filas, _ocModoDe, _ocUni()),
    porPagina: HOJA_POR_PAGINA,
    titulo: _ocTitulo,
    meta, banda,
    emitio: $('ocEmitio') ? $('ocEmitio').value : '',
    recibio: $('ocRecibio') ? $('ocRecibio').value : '',
    /* Las instrucciones de densidad son de la solucion: con MBK no van. */
    antesBanda: _ocUnidad === 'sol' ? INSTRUCCIONES_SOLUCION : '',
    nota: _ocUni().nota.replace('cada barrica', 'cada vasija'),
    claseTabla: 'oh-tabla-justa',
    colgroup: COLGROUP_PAPEL_LOTE,
    thead: theadPapelLote(_ocUni()),
    columnas: COLUMNAS_PAPEL_LOTE,
    textoVacio: 'No hay lotes a corregir para los criterios elegidos.',
    renderFila: _ocRenderFilaLote,
  });
```

- [ ] **Step 4: Tabla — selector de modo, etiqueta de pendiente, aviso al incluir**

En `_ocRenderTabla`, antes del `for (const l of ordenarLotesOc(…))` (línea ~658):

```js
  const pend = lotesPendientes(DATOS().ordenes_correccion);
```

Dentro del `for`, reemplazar `const avisos = [cartel, aviso].filter(Boolean);` por:

```js
    const enOrden = pend.get(l.lote);
    const avisos = [enOrden ? '⏳ en ' + enOrden + ' sin ejecutar' : '', cartel, aviso].filter(Boolean);
    const modo = _ocModoDe(l);
```

En la fila separadora, cambiar `'<tr class="oc-sep">'` por `'<tr class="oc-sep"' + (enOrden ? ' style="opacity:.6"' : '') + '>'` y, después de `'<b>' + esc(l.lote) + '</b>`, antes del `</td>` de esa primera celda, agregar el selector:

```js
        ' <select class="oc-modo" data-oc-modo="' + escA(l.lote) + '" ' +
        'title="Genérica: un renglón por tipo de vasija con la dosis de cada una. Por barril: un renglón por barril. Vale para el papel y para la ejecución.">' +
          '<option value="generica"' + (modo === 'generica' ? ' selected' : '') + '>Genérica</option>' +
          '<option value="barril"' + (modo === 'barril' ? ' selected' : '') + '>Por barril</option>' +
        '</select>' +
```

En el listener de la casilla de inclusión (línea ~732), después de calcular `lote`:

```js
    if (cb.checked){
      const en = lotesPendientes(DATOS().ordenes_correccion).get(lote);
      if (en) avisar('El lote ' + lote + ' ya está en la ' + en + ', que todavía no se ejecutó. Si lo incluís, va a quedar en las dos órdenes.');
    }
```

Debajo de ese listener agregar el del modo (solo cambia el papel, la tabla no):

```js
  /* Modo del lote: cambia el papel (y lo que se guarda al imprimir). */
  tbody.addEventListener('change', e => {
    const sel = e.target.closest('select[data-oc-modo]');
    if (!sel) return;
    _ocModos.set(sel.dataset.ocModo, sel.value === 'barril' ? 'barril' : 'generica');
    _ocPintarPaginas();
  });
```

- [ ] **Step 5: Barra y render — fuera Formato y Ejecutar, entra el aviso y "Imprimir y guardar"**

En el HTML de `renderOrdenCorreccion`:
- Borrar `<button class="btn" id="btnOcFormato"></button>` y `<button class="btn primary" id="btnOcEjecutar">✔ Ejecutar orden</button>`.
- Cambiar el texto de `btnOcImprimir` a `🖨️ Imprimir y guardar` y agregarle `title="Imprime el papel, guarda el PDF en la carpeta B y deja la orden pendiente en el Registro de corrección de SO₂"`.
- Debajo de `<div id="ocMsg"></div>` agregar `<div id="ocPendAviso"></div>`.

Después de `await _ocCargar();` (en el render) y dentro del handler de Recargar (después de su `await _ocCargar();`), llamar `_ocMarcarPendientes();`. En Recargar, junto a `_ocExcluidos.clear();` agregar `_ocPendAuto.clear();`. Al final del primer bloque de render (después de `_ocPintarPaginas();` de la línea ~949) agregar `_ocPintarAvisoPendientes();`.

Borrar el bloque "Formato del papel" (`_ocPintarBotonFormato(); $('btnOcFormato')…`, líneas ~1025-1031) y el de "Ejecutar orden" (`$('btnOcEjecutar').addEventListener…`, línea ~1068). Agregar:

```js
  $('ocPendAviso').addEventListener('click', e => {
    if (e.target.closest('[data-oc-ver-pend]')) mostrarTab('so2');
  });
```

En el handler de Imprimir, dentro de `if (r.ok){ … }` al final, agregar `await _ocGuardarOrden($('ocNumOrden').value);`.

- [ ] **Step 6: Guardar la orden; borrar la ejecución vieja**

Borrar desde el comentario `/** Entradas de bitacora a escribir, una por lote elegido.` (línea ~1086) hasta el final de `_ocEjecConfirmar` (línea ~1376), sin tocar el `registrarVista(...)` del final. En su lugar:

```js
/* Al imprimir, la orden queda guardada tal como salio en el papel y pendiente
 * en el Registro de corrección de SO₂. Se ejecuta desde ahi (vista-ordenes-
 * correccion.js), con estos numeros: nunca se vuelve a calcular. */
async function _ocGuardarOrden(numero){
  const num = String(numero || '').trim();
  const lista = DATOS().ordenes_correccion || [];
  const previa = lista.find(o => o && o.numero === num && o.estado !== 'anulada');
  if (previa && previa.estado === 'ejecutada'){
    avisar('La orden ' + num + ' ya está ejecutada en el Registro: esta impresión no se guardó como orden nueva.', { tipo: 'mal' });
    return;
  }
  if (previa && !await confirmar({ titulo: 'Ya hay una orden ' + num + ' pendiente',
      texto: '¿Reemplazarla por lo que se acaba de imprimir?', si: 'Reemplazar', no: 'Dejar la anterior' })) return;

  const orden = armarOrdenGuardada({
    id: previa ? previa.id : 'oc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    numero: num, fecha: $('ocFecha').value,
    emitio: $('ocEmitio').value.trim(), recibio: $('ocRecibio').value.trim(),
    unidad: _ocUnidad, quien: usuarioActual(), ahora: new Date().toISOString(),
    filas: _ocBuildRowsLocal(), modos: _ocModos });
  if (!orden.lotes.length) return;

  const d = DATOS();
  if (!Array.isArray(d.ordenes_correccion)) d.ordenes_correccion = [];
  const i = previa ? d.ordenes_correccion.indexOf(previa) : -1;
  const reemplazada = i >= 0 ? d.ordenes_correccion[i] : null;
  if (i >= 0) d.ordenes_correccion[i] = orden; else d.ordenes_correccion.push(orden);
  markDirty();

  let ok;
  try { ok = await guardar(); } catch (_) { ok = false; }
  if (!ok){
    /* Despues del await DATOS() puede ser otro documento (409 fusionado): se
     * busca por id, no por referencia. */
    const l2 = DATOS().ordenes_correccion || [];
    const j = l2.findIndex(o => o && o.id === orden.id);
    if (j >= 0){ if (reemplazada) l2[j] = reemplazada; else l2.splice(j, 1); }
    markDirty();
    avisar('Se imprimió, pero no se pudo guardar la orden ' + num + ' en la app. Volvé a tocar «Imprimir y guardar».', { tipo: 'mal' });
    return;
  }
  _ocMarcarPendientes();
  _ocRenderTabla();
  _ocPintarPaginas();
  _ocPintarAvisoPendientes();
  const m = $('ocMsg');
  if (m) m.innerHTML = '<div class="msg ok">✓ La orden ' + esc(num) + ' quedó pendiente en el Registro de corrección de SO₂. ' +
    'Cuando esté terminada, ejecutala desde ahí.</div>';
}
```

- [ ] **Step 7: Chequeos estáticos**

Run: `node --check public/lotes/js/vista-orden-correccion.js` → sin salida.
Run: `grep -n "_ocFormato\|btnOcFormato\|btnOcEjecutar\|_ocHechos\|_ocEjec\|gruposPorLote\|filaPapel(" public/lotes/js/vista-orden-correccion.js` → sin resultados.
Run: `npx vitest run --maxWorkers=2 test/lotes-orden-correccion-*.mjs test/lotes-so2-bitacora.test.mjs` → PASS.

- [ ] **Step 8: Commit**

```bash
git add public/lotes/js/vista-orden-correccion.js
git commit -m "feat(lotes): la orden de correccion se guarda pendiente al imprimir; modo por lote; lotes en orden pendiente fuera por defecto"
```

---

### Task 6: Registro de corrección de SO₂ — órdenes, ejecutar, anular, ver

**Files:**
- Create: `public/lotes/js/vista-ordenes-correccion.js`
- Modify: `public/lotes/js/vista-so2.js` (HTML de `renderCorrecciones`, ~líneas 56-160)
- Modify: `public/lotes/index.html:1649-1653`
- Modify: `public/lotes/js/nucleo.js:211-216, 855-860`

**Interfaces:**
- Consumes: `escribirEjecucion`, `revertirEjecucion`, `anularOrden`, `revertirAnulacionOrden`, `analisisPosterior`, `unidadDe` (Tasks 2-3); `$, esc, escA, DATOS, markDirty, guardar, mostrarOverlay, cerrarOverlay, usuarioActual` de `nucleo.js`; `avisar, confirmar` de `dialogos.js`; `fmtFecha` de `fechas.js`.
- Produces: `pintarOrdenesCorreccion(cont: HTMLElement, alCambiar: () => void)`.

- [ ] **Step 1: Crear `vista-ordenes-correccion.js`**

```js
/* ===== Lotes CIW — Órdenes de corrección en el Registro de corrección de SO₂ =====
 *
 * Las órdenes que se guardaron al imprimir (orden-correccion-guardada.js):
 * pendientes arriba con Ejecutar / Anular, despues ejecutadas y anuladas.
 * Ejecutar es UNA vez, con la orden terminada: todo arranca destildado, el N°
 * de OT es el de la orden y las dosis son las del papel. */
'use strict';

import { $, esc, escA, DATOS, markDirty, guardar, mostrarOverlay, cerrarOverlay,
         usuarioActual } from './nucleo.js';
import { avisar, confirmar } from './dialogos.js';
import { fmtFecha } from './fechas.js';
import { escribirEjecucion, revertirEjecucion, anularOrden, revertirAnulacionOrden,
         analisisPosterior, unidadDe } from './orden-correccion-guardada.js';

const fmt = (v, dec) => (v != null && Number.isFinite(Number(v))) ? Number(v).toFixed(dec) : '—';
const hoyLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const _ordenPorId = id => (DATOS().ordenes_correccion || []).find(o => o && o.id === id) || null;

let _alCambiar = () => {};

/** Pinta la lista de ordenes en `cont`. `alCambiar` repinta la pestaña entera
 *  (la tabla de correcciones de abajo cambia al ejecutar). */
export function pintarOrdenesCorreccion(cont, alCambiar){
  if (!cont) return;
  _alCambiar = alCambiar || (() => {});
  const todas = (DATOS().ordenes_correccion || []).filter(Boolean);
  const porFecha = (a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))
                            || String(b.numero || '').localeCompare(String(a.numero || ''));
  const pend = todas.filter(o => o.estado === 'pendiente').sort(porFecha);
  const resto = todas.filter(o => o.estado !== 'pendiente').sort(porFecha);

  const fila = o => {
    const n = (o.lotes || []).length;
    const base = '<b>' + esc(o.numero) + '</b> · ' + esc(fmtFecha(o.fecha)) + ' · ';
    if (o.estado === 'pendiente') return '<div class="ocg-fila">⏳ ' + base + n + (n === 1 ? ' lote' : ' lotes') +
      (o.emitio ? ' · emitió ' + esc(o.emitio) : '') +
      ' <span class="spacer"></span><button class="btn primary" data-ocg-ejec="' + escA(o.id) + '">✔ Ejecutar</button>' +
      ' <button class="btn" data-ocg-anular="' + escA(o.id) + '">Anular</button>' +
      ' <button class="btn" data-ocg-ver="' + escA(o.id) + '">Ver</button></div>';
    if (o.estado === 'ejecutada'){
      const h = ((o.ejecucion && o.ejecucion.hechos) || []).length;
      return '<div class="ocg-fila">✔ ' + base + h + ' de ' + n + ' lotes hechos' +
        (o.ejecucion ? ' · ejecutó ' + esc(o.ejecucion.por || '?') + ' el ' + esc(fmtFecha(o.ejecucion.fecha)) : '') +
        ' <span class="spacer"></span><button class="btn" data-ocg-ver="' + escA(o.id) + '">Ver</button></div>';
    }
    return '<div class="ocg-fila" style="color:var(--muted)">✕ <s>' + base + n + ' lotes</s> · anulada' +
      (o.anulada ? ' por ' + esc(o.anulada.por || '?') + ' el ' + esc(fmtFecha(o.anulada.fecha)) : '') +
      ' <span class="spacer"></span><button class="btn" data-ocg-ver="' + escA(o.id) + '">Ver</button></div>';
  };

  cont.innerHTML = '<h2>Órdenes de corrección</h2>' +
    (todas.length
      ? '<div style="max-height:260px;overflow:auto">' + pend.map(fila).join('') + resto.map(fila).join('') + '</div>'
      : '<p style="color:var(--muted);margin:0">Todavía no hay órdenes guardadas. Se guardan solas al tocar «Imprimir y guardar» en Orden de corrección.</p>');

  if (cont._ocgWired) return;
  cont._ocgWired = true;
  cont.addEventListener('click', e => {
    const ej = e.target.closest('[data-ocg-ejec]');
    if (ej) return _abrirEjecucion(ej.dataset.ocgEjec);
    const an = e.target.closest('[data-ocg-anular]');
    if (an) return _anular(an.dataset.ocgAnular);
    const ve = e.target.closest('[data-ocg-ver]');
    if (ve) return _ver(ve.dataset.ocgVer);
  });
}

/* ---------- ejecutar ---------- */

/* Estado del overlay abierto: que orden y que vasijas se tildaron
 * (lote -> Set de indices). Arranca VACIO: solo se registra lo que alguien
 * marco a proposito. */
let _ejec = null;
let _enVuelo = false;

function _abrirEjecucion(id){
  const o = _ordenPorId(id);
  if (!o || o.estado !== 'pendiente') return;
  _wireOverlay();
  _ejec = { id, tildes: new Map() };
  const u = unidadDe(o);
  const post = analisisPosterior(o, DATOS().analisis);
  const lotes = (o.lotes || []).map((l, i) => {
    const p = post.get(l.lote);
    const avisoPost = p ? '<div class="msg info" style="margin:4px 0 0 26px;font-size:12px">⚠ Hay un análisis del ' +
      esc(fmtFecha(p.fecha)) + ' (SO₂ ' + esc(fmt(p.so2_libre, 1)) + ') posterior a la orden. Se registra igual con los números del papel.</div>' : '';
    const cab = '<label style="display:flex;gap:8px;align-items:center">' +
      '<input type="checkbox" data-ocg-lote="' + i + '">' +
      '<b style="min-width:64px">' + esc(l.lote) + '</b>' +
      '<span style="flex:1;color:var(--muted)">' + esc(l.variedad) + ' · ' +
        (l.modo === 'barril' ? 'Por barril' : 'Genérica · ' + l.vasijas.length + (l.vasijas.length === 1 ? ' vasija' : ' vasijas')) + '</span>' +
      '<span class="num" data-ocg-sub="' + i + '"></span></label>';
    const vas = l.modo === 'barril'
      ? '<div style="display:flex;flex-wrap:wrap;gap:4px 14px;margin:4px 0 0 26px">' + l.vasijas.map((v, j) =>
          '<label style="font-size:13px"><input type="checkbox" data-ocg-vas="' + i + ':' + j + '"> ' +
          esc(v.num || v.vasija || '—') + ' · ' + fmt(u.de(v), u.dec) + ' ' + u.suf + '</label>').join('') + '</div>'
      : '';
    return '<div style="padding:6px 0;border-bottom:1px solid var(--line)">' + cab + vas + avisoPost + '</div>';
  }).join('');

  mostrarOverlay(
    '<h2 style="margin-top:0">Ejecutar ' + esc(o.numero) + '</h2>' +
    '<p style="color:var(--muted);font-size:13px;margin-top:0">Emitida el ' + esc(fmtFecha(o.fecha)) +
      (o.emitio ? ' por ' + esc(o.emitio) : '') + '. Tildá solo lo que se hizo: lo que quede sin tildar no se registra y vuelve a la Orden de corrección.</p>' +
    '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;align-items:flex-end">' +
      '<div><div style="font-size:11px;color:var(--muted)">Fecha real de la corrección</div>' +
        '<input class="txt" id="ocgFecha" type="date" value="' + escA(hoyLocal()) + '"></div>' +
      '<div style="font-size:13px">Ejecuta: <b>' + esc(usuarioActual() || '(sin sesión)') + '</b></div>' +
    '</div>' +
    '<div style="max-height:360px;overflow:auto;margin-bottom:10px">' + lotes + '</div>' +
    '<div id="ocgTotal" class="tag" style="margin-bottom:10px"></div>' +
    '<div id="ocgMsg"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="btn" data-ocg-cancelar>Cancelar</button>' +
      '<button class="btn primary" id="btnOcgConfirmar" disabled>✔ Confirmar</button>' +
    '</div>');
  _sincronizar();
}

/* Pone las casillas y los totales segun _ejec.tildes. Se actualiza en el
 * lugar (no se repinta el overlay) para no perder el scroll. */
function _sincronizar(){
  if (!_ejec) return;
  const o = _ordenPorId(_ejec.id);
  if (!o) return;
  const u = unidadDe(o);
  let nLotes = 0, total = 0;
  (o.lotes || []).forEach((l, i) => {
    const t = _ejec.tildes.get(l.lote) || new Set();
    const todas = l.modo === 'generica' ? t.size > 0 : t.size === l.vasijas.length && t.size > 0;
    const cbL = document.querySelector('[data-ocg-lote="' + i + '"]');
    if (cbL){ cbL.checked = todas; cbL.indeterminate = l.modo === 'barril' && t.size > 0 && !todas; }
    l.vasijas.forEach((_, j) => {
      const cb = document.querySelector('[data-ocg-vas="' + i + ':' + j + '"]');
      if (cb) cb.checked = t.has(j);
    });
    const idx = l.modo === 'generica' ? (t.size ? l.vasijas.map((_, j) => j) : []) : [...t];
    const sub = idx.reduce((s, j) => s + Number(u.de(l.vasijas[j])), 0);
    const el = document.querySelector('[data-ocg-sub="' + i + '"]');
    if (el) el.textContent = l.modo === 'barril'
      ? t.size + ' de ' + l.vasijas.length + (t.size ? ' · ' + fmt(sub, u.dec) + ' ' + u.suf : '')
      : fmt(u.total(l), u.dec) + ' ' + u.suf;
    if (idx.length){ nLotes++; total += sub; }
  });
  const tot = $('ocgTotal');
  if (tot) tot.textContent = 'Vas a registrar: ' + nLotes + (nLotes === 1 ? ' lote' : ' lotes') + ' · ' + fmt(total, u.dec) + ' ' + u.suf;
  const btn = $('btnOcgConfirmar');
  if (btn && !_enVuelo){ btn.disabled = nLotes === 0; btn.title = nLotes ? '' : 'No hay nada tildado'; }
}

/* Delegado y enganchado UNA vez: overlayBox es persistente (mostrarOverlay
 * solo cambia su contenido). Mismo patron que la ejecucion vieja. */
function _wireOverlay(){
  const box = $('overlayBox');
  if (!box || box._ocgWired) return;
  box._ocgWired = true;
  box.addEventListener('change', e => {
    if (!_ejec) return;
    const o = _ordenPorId(_ejec.id);
    if (!o) return;
    const cbL = e.target.closest('[data-ocg-lote]');
    const cbV = e.target.closest('[data-ocg-vas]');
    if (!cbL && !cbV) return;
    if (cbL){
      const l = o.lotes[+cbL.dataset.ocgLote];
      _ejec.tildes.set(l.lote, cbL.checked ? new Set(l.vasijas.map((_, j) => j)) : new Set());
    } else {
      const [i, j] = cbV.dataset.ocgVas.split(':').map(Number);
      const l = o.lotes[i];
      const t = _ejec.tildes.get(l.lote) || new Set();
      if (cbV.checked) t.add(j); else t.delete(j);
      _ejec.tildes.set(l.lote, t);
    }
    _sincronizar();
  });
  box.addEventListener('click', e => {
    if (!_ejec) return;
    if (e.target.closest('[data-ocg-cancelar]')){ _ejec = null; cerrarOverlay(); return; }
    if (e.target.closest('#btnOcgConfirmar')) _confirmar();
  });
}

async function _confirmar(){
  if (_enVuelo || !_ejec) return;
  const msg = $('ocgMsg');
  const fecha = $('ocgFecha') ? $('ocgFecha').value : '';
  if (!fecha){ if (msg) msg.innerHTML = '<div class="msg err">Falta la fecha.</div>'; return; }
  const { id, tildes } = _ejec;
  const res = escribirEjecucion(DATOS(), id, { tildes, fecha, quien: usuarioActual(), ahora: new Date().toISOString() });
  if (!res.ok){ if (msg) msg.innerHTML = '<div class="msg err">' + esc(res.motivo) + '</div>'; return; }

  _enVuelo = true;
  const btn = $('btnOcgConfirmar');
  if (btn) btn.disabled = true;
  markDirty();
  if (msg) msg.innerHTML = '<div class="msg info">Guardando…</div>';
  let ok;
  try { ok = await guardar(); } catch (_) { ok = false; }
  finally { _enVuelo = false; }

  if (!ok){
    /* DATOS() se lee de nuevo: tras un 409 es el documento fusionado. */
    revertirEjecucion(DATOS(), id, res.snaps);
    markDirty();
    const txt = 'No se pudo guardar. No se registró nada. Resolvé el conflicto y volvé a confirmar.';
    const m2 = $('ocgMsg');
    if (m2 && $('overlay') && $('overlay').open){ m2.innerHTML = '<div class="msg err">' + txt + '</div>'; _sincronizar(); }
    else avisar(txt, { tipo: 'mal' });
    return;
  }
  const o = _ordenPorId(id);
  _ejec = null;
  cerrarOverlay();
  _alCambiar();
  avisar('✓ ' + (o ? o.numero : 'La orden') + ' ejecutada: se registraron ' + res.entradas.length +
    (res.entradas.length === 1 ? ' corrección.' : ' correcciones.') +
    (res.conviven.length ? ' Ojo: ' + res.conviven.join(', ') + (res.conviven.length === 1 ? ' ya tenía' : ' ya tenían') +
      ' otra corrección ese día con otra OT; quedaron las dos.' : ''));
}

/* ---------- anular ---------- */

async function _anular(id){
  const o = _ordenPorId(id);
  if (!o || o.estado !== 'pendiente') return;
  if (!await confirmar({ titulo: 'Anular la orden ' + o.numero,
      texto: 'La orden queda tachada en el Registro (no se borra) y sus ' + (o.lotes || []).length +
             ' lotes vuelven a la Orden de corrección. No se registra ninguna corrección.',
      si: 'Anular', no: 'Cancelar' })) return;
  anularOrden(DATOS(), id, usuarioActual(), hoyLocal());
  markDirty();
  let ok;
  try { ok = await guardar(); } catch (_) { ok = false; }
  if (!ok){
    revertirAnulacionOrden(DATOS(), id);
    markDirty();
    avisar('No se pudo guardar: la orden ' + o.numero + ' sigue pendiente.', { tipo: 'mal' });
    return;
  }
  _alCambiar();
}

/* ---------- ver (solo lectura) ---------- */

function _ver(id){
  const o = _ordenPorId(id);
  if (!o) return;
  _ejec = null;
  const u = unidadDe(o);
  const hechos = new Map(((o.ejecucion && o.ejecucion.hechos) || []).map(h => [h.lote, h]));
  const filas = (o.lotes || []).map(l => {
    const h = hechos.get(l.lote);
    const estado = o.estado === 'ejecutada' ? (h ? '✔' : '—') : '';
    const vas = l.modo === 'barril'
      ? l.vasijas.map(v => esc(v.num || v.vasija || '—') + ' ' + fmt(u.de(v), u.dec)).join(' · ')
      : l.vasijas.length + (l.vasijas.length === 1 ? ' vasija' : ' vasijas');
    return '<tr><td class="c">' + estado + '</td><td><b>' + esc(l.lote) + '</b></td><td>' + esc(l.variedad) + '</td>' +
      '<td>' + (l.modo === 'barril' ? 'Por barril' : 'Genérica') + '</td><td style="font-size:12px">' + vas + '</td>' +
      '<td class="num">' + fmt(u.total(l), u.dec) + ' ' + u.suf + '</td>' +
      '<td class="num">' + (h ? fmt(o.unidad === 'mbk' ? h.mbk_g : h.ml, u.dec) + ' ' + u.suf : '') + '</td></tr>';
  }).join('');
  mostrarOverlay('<h2 style="margin-top:0">Orden ' + esc(o.numero) + ' · ' + esc(fmtFecha(o.fecha)) + '</h2>' +
    '<p style="color:var(--muted);font-size:13px;margin-top:0">' +
      ({ pendiente: '⏳ Pendiente', ejecutada: '✔ Ejecutada', anulada: '✕ Anulada' }[o.estado] || '') +
      (o.emitio ? ' · emitió ' + esc(o.emitio) : '') +
      (o.ejecucion ? ' · ejecutó ' + esc(o.ejecucion.por || '?') + ' el ' + esc(fmtFecha(o.ejecucion.fecha)) : '') + '</p>' +
    '<div style="max-height:400px;overflow:auto"><table><thead><tr><th></th><th>Lote</th><th>Variedad</th><th>Modo</th>' +
    '<th>Vasijas</th><th class="num">Orden</th><th class="num">Registrado</th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
    '<div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn" data-ocg-cerrar>Cerrar</button></div>');
  const box = $('overlayBox');
  const b = box && box.querySelector('[data-ocg-cerrar]');
  if (b) b.addEventListener('click', () => cerrarOverlay());
}
```

CSS mínimo: en `public/lotes/index.html`, dentro del `<style>` principal (junto a otras reglas de Correcciones, buscar `.so2-calc-grid`), agregar:

```css
.ocg-fila{display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);flex-wrap:wrap}
.ocg-fila .spacer{flex:1}
```

Antes de escribir, comprobar que `fmtFecha` existe en `public/lotes/js/fechas.js` (`grep -n "export function fmtFecha" public/lotes/js/fechas.js`) y que `#overlay` es un `<dialog>` con `#overlayBox` adentro (`grep -n 'id="overlay"' public/lotes/index.html`); los dos se usan hoy en `vista-so2.js` y `vista-orden-correccion.js`.

- [ ] **Step 2: Montarlo en `vista-so2.js` y renombrar**

Import nuevo al principio:

```js
import { pintarOrdenesCorreccion } from './vista-ordenes-correccion.js';
```

En el template de `sec.innerHTML`, como PRIMER elemento (antes de `<div class="card" id="so2CalcCard">`):

```html
<div class="card" id="so2Ordenes" style="margin-bottom:14px"></div>
```

Cambiar `<h2>Bitácora de correcciones SO₂</h2>` por `<h2>Correcciones registradas</h2>`. Cambiar el comentario `<!-- Bitácora -->` por `<!-- Correcciones registradas (por lote) -->`.

Después de `_renderBitacoraSO2(loteMap);` (línea ~120):

```js
  /* ---- órdenes de corrección guardadas (pendientes / ejecutadas / anuladas) ---- */
  pintarOrdenesCorreccion($('so2Ordenes'), () => renderCorrecciones());
```

- [ ] **Step 3: Sub-pestañas: nombre y orden**

`public/lotes/index.html:1649-1653` → 

```html
  <div class="corr-sub" id="corrSub" role="radiogroup" aria-label="Vista de Correcciones" hidden>
    <button type="button" data-sub="ordencorr" role="radio" aria-checked="false">Orden de corrección</button>
    <button type="button" data-sub="so2" role="radio" aria-checked="false">Registro de corrección de SO₂</button>
    <button type="button" data-sub="agregados" role="radio" aria-checked="false">Otros agregados</button>
  </div>
```

`public/lotes/js/nucleo.js`: en `NOMBRE_VISTA`, `so2: 'SO2'` → `so2: 'Registro de corrección de SO₂'`; en el comentario de la línea ~857, `(bitacora de SO2, orden de correccion y otros agregados)` → `(orden de correccion, registro de correccion de SO2 y otros agregados)`; `const GRUPO_CORRECCIONES = ['so2', 'ordencorr', 'agregados'];` → `['ordencorr', 'so2', 'agregados']`.

Buscar otros textos visibles "Bitácora SO" en la UI: `grep -rn "Bitácora SO\|Bitácora de correcciones" public/lotes` y cambiar los visibles al nombre nuevo (los comentarios de código pueden quedar).

- [ ] **Step 4: Chequeos estáticos**

Run: `node --check public/lotes/js/vista-ordenes-correccion.js && node --check public/lotes/js/vista-so2.js && node --check public/lotes/js/nucleo.js` → sin salida.
Run: `npx vitest run --maxWorkers=2 test/lotes-orden-correccion-*.mjs test/lotes-so2-bitacora.test.mjs test/lotes-numero-ot.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/vista-ordenes-correccion.js public/lotes/js/vista-so2.js public/lotes/index.html public/lotes/js/nucleo.js
git commit -m "feat(lotes): Registro de correccion de SO2 con las ordenes guardadas (ejecutar una vez, anular, ver)"
```

---

### Task 7: Verificación en el navegador y cierre

**Files:**
- Create (scratchpad de la sesión, NO en el repo): `mock-oc-guardada.mjs`
- Modify: `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\.claude\launch.json` (entrada nueva)

- [ ] **Step 1: Mock sin login con guardado en memoria**

Copiar `C:/Users/Bmax/AppData/Local/Temp/claude/C--Users-Bmax-OneDrive---BODEGAS-ESMERALDA-SA-Escritorio-claude/170c9250-e83e-4e76-9518-8c600e76bac5/scratchpad/mock-oc-filtros.mjs` al scratchpad de esta sesión como `mock-oc-guardada.mjs`, y cambiar:
- `RAIZ` → `'C:/Users/Bmax/repos/catenainstitute-oc-guardada/public'`.
- `doc` → `let doc = {…, ordenes_correccion: [] }` y `let ver = 1;`.
- Agregar al lote `26247` un análisis en `doc.analisis`: `{ lote: '26247', fecha_analisis: '2026-10-25', so2_libre: 14, ph: 3.64 }`.
- `GET datos` → `json(200, { ...doc, meta: { version: ver } })`.
- `POST datos` → leer el body, `doc = JSON.parse(body).datos ?? JSON.parse(body)` (mirar en `nucleo.js` la forma exacta que manda `guardar()`: `grep -n "fetch(API+'/datos'" -A8 public/lotes/js/nucleo.js`), `ver++`, `json(200, { ok: true, version: ver })`.
- `GET version` → `json(200, { version: ver })`.
- Puerto `8821`.

Agregar al `launch.json` de Escritorio\claude:

```json
    {
      "name": "lotes-oc-guardada",
      "runtimeExecutable": "node",
      "runtimeArgs": ["<scratchpad de esta sesión>/mock-oc-guardada.mjs"],
      "port": 8821
    }
```

- [ ] **Step 2: Recorrido**

`preview_start {name: 'lotes-oc-guardada'}`, abrir `/lotes/`, ir a Correcciones. Con `javascript_tool` poner `window.print = () => {}` antes de imprimir. Comprobar con `read_page`/capturas:
1. Sub-pestañas en orden: Orden de corrección · Registro de corrección de SO₂ · Otros agregados.
2. Orden de corrección: cada lote con selector Genérica/Por barril (26172 arranca Por barril por la T50; 26133 Genérica). No hay botones "Papel" ni "Ejecutar orden".
3. Cambiar 26133 a Por barril → el papel (`#ocPaginas`, ver con `javascript_tool` su `innerText`) muestra "Barril 1250002 · 225 L".
4. "Imprimir y guardar" con N° B240 → mensaje "quedó pendiente"; los lotes impresos aparecen grises con "⏳ en B240 sin ejecutar" y destildados; aviso de pendientes arriba con "Ver →".
5. Cargar en `DATOS().analisis` (por `javascript_tool`, importando `./js/nucleo.js`) un análisis de 26247 con fecha posterior → en el Registro, Ejecutar B240 muestra el ⚠ en 26247.
6. Overlay: todo destildado y Confirmar apagado; tildar 1 barril de 26133 y el lote 26247 → total correcto; Confirmar → la orden pasa a "✔ … 2 de N lotes hechos"; la tabla "Correcciones registradas" muestra 26133 y 26247 con OT B240 y las dosis del papel (comparar con lo impreso).
7. Volver a Orden de corrección → los lotes no ejecutados de B240 vuelven a estar tildados y sin la etiqueta.
8. Imprimir B241 y Anular → queda tachada; sus lotes vuelven.
9. Falla de guardado: hacer que el mock devuelva 500 en `POST datos` (variable global del mock o reiniciarlo con un flag) → ejecutar → mensaje "No se registró nada" y la orden sigue pendiente, sin correcciones nuevas.
10. `read_console_messages` sin errores.

Captura final del Registro con las tres órdenes para mostrarle al usuario.

- [ ] **Step 3: Tests de todo lo tocado**

Run: `npx vitest run --maxWorkers=2 test/lotes-orden-correccion-*.mjs test/lotes-so2-bitacora.test.mjs test/lotes-numero-ot.test.mjs test/lotes-ot-correcciones.test.mjs test/lotes-agregados.test.mjs test/validacion.test.ts`
Run: `npx tsc --noEmit`
Expected: todo PASS / sin errores.

- [ ] **Step 4: Commit del launch.json (repo de Escritorio\claude)**

En `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude`: `git add .claude/launch.json` solo si el usuario lo aprueba (ese archivo ya tiene cambios sin commitear de otra sesión: revisar `git diff .claude/launch.json` antes y no mezclar).

- [ ] **Step 5: Cierre**

Usar superpowers:finishing-a-development-branch. **No mergear ni pushear a `main` sin el OK explícito del usuario** (push a main = producción). Recordarle que hay que avisar en la bodega que "Ejecutar" ahora está en el Registro y que el papel cambió de formato para los lotes por barril.
