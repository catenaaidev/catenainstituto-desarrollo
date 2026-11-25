# OT de Muestras — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sumar a Lotes web una OT «Muestras» (formato 0993). Va sin movimientos, con una tabla Lote / Vasija / Muestra / Check que se edita sobre la hoja, y con los pasos de texto editables.

**Architecture:** Es una plantilla más de `PLANTILLAS_OT` (`muestras-ot`) con un bloque nuevo `tabla-muestras`. La OT se marca `sin_movimientos: true`, guarda `lotes: []` y lleva su tabla en `ot.muestras`. La lógica pura vive en un módulo nuevo, `ot-muestras.js`. Las vistas que ya existen (emitir, hoja, lista, confirmar) se ramifican con `esSinMovimientos(ot)` o `sinMovimientos(plantilla)`. Hay dos filtros de «OT huérfana», en el cliente y en el servidor, y tienen que dejar ver estas OT.

**Tech Stack:** JS vanilla en módulos ES (`public/lotes/js`), Worker en TS (`src/`), vitest con `@cloudflare/vitest-pool-workers` (`npx vitest run <archivo>`).

**Spec:** `docs/superpowers/specs/2026-11-11-ot-muestras-design.md`

## Global Constraints

- Id de plantilla `muestras-ot`; nombre visible `Muestras`; banda `['MUESTRAS']`. El id `muestras` YA es la Orden de muestras de laboratorio en el catálogo: no se toca.
- La OT de Muestras NUNCA crea movimientos y confirmarla no toca lotes, envases ni litros.
- Los textos de los pasos se copian literal de la 0993 (con la ortografía corregida: «según», «ppm»).
- Muestra por defecto: `750 ml`.
- Columnas de la tabla, en este orden: `#`, `CIW lote`, `Vasija`, `Muestra`, `Check`.
- Comentarios y textos de UI en castellano rioplatense, con el estilo de los archivos vecinos.
- Commits que terminen en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Se trabaja SOLO en el worktree `C:\Users\Bmax\repos\ci-ot-muestras` (rama `feat/ot-muestras`). Nunca en `C:\Users\Bmax\repos\catenainstitute`, porque otras sesiones le cambian la rama.

---

### Task 1: Plantilla `muestras-ot` + catálogo

**Files:**
- Modify: `public/lotes/js/ot-plantillas.js`
- Modify: `public/ordenes/js/catalogo.js`
- Test: `test/lotes-ot-plantillas.test.mjs`, `test/ordenes-catalogo.test.mjs`

**Interfaces:**
- Produces: `TIPOS_BLOQUE` incluye `'tabla-muestras'`; `sinMovimientos(id: string): boolean`; plantilla `muestras-ot` con `sinMovimientos: true`, `hojas: ['ot']`, `origen: 'ninguno'`.

- [ ] **Step 1: Tests que fallan.** En `test/lotes-ot-plantillas.test.mjs`:
  - sumar `sinMovimientos` al import;
  - cambiar la lista del primer `it` a `['barricas-barricas', 'tq-barricas', 'barrica-tanque', 'tq-tq', 'barricas-tanque', 'corte-achique', 'traslado', 'muestras-ot']`;
  - en el `it('tiene exactamente una tabla de vaciado…')`, cambiar el esperado a
    `p.origen === 'tanque' || p.sinMovimientos ? 0 : 1`;
  - agregar al final del archivo:

```js
describe('muestras-ot (0993)', () => {
  const pl = plantillaPorId('muestras-ot');
  it('se llama Muestras, una sola hoja, sin movimientos', () => {
    expect(pl.nombre).toBe('Muestras');
    expect(pl.banda).toEqual(['MUESTRAS']);
    expect(hojasDePlantilla('muestras-ot')).toEqual(['ot']);
    expect(sinMovimientos('muestras-ot')).toBe(true);
    expect(sinMovimientos('traslado')).toBe(false);
    expect(sinMovimientos('no-existe')).toBe(false);
  });
  it('trae los pasos de la 0993 y una tabla de muestras en el medio', () => {
    expect(pl.bloques.map(b => b.tipo === 'paso' ? b.texto : b.tipo)).toEqual([
      'Buscar las siguientes muestras y armar cortes según indicaciones',
      'IR DESINFECTANDO MANGUERITA ENTRE MUESTRA Y MUESTRA',
      'tabla-muestras',
      'AL finalizar gasear TODOS LOS T50 ANTES DE CERRAR',
      'Analizar los cortes y de ser necesario corregir a 35 ppm',
      'Enviar por mail a Nico Torti datos analizados',
    ]);
  });
});
```

  En `test/ordenes-catalogo.test.mjs` no hace falta tocar nada: el primer test ya exige que el catálogo tenga todas las plantillas, y va a fallar hasta el Step 3.

- [ ] **Step 2: Correr y ver que fallan.**
  Run: `npx vitest run test/lotes-ot-plantillas.test.mjs test/ordenes-catalogo.test.mjs`
  Expected: FAIL (`sinMovimientos` no existe / falta `muestras-ot`).

- [ ] **Step 3: Implementar.** En `public/lotes/js/ot-plantillas.js`:
  - En el comentario de cabecera, debajo del párrafo de `salida: true`, agregar:
    ```
     * `sinMovimientos: true` = la OT no mueve vino (Muestras, 0993): no crea
     * movimientos, su tabla vive en ot.muestras (ot-muestras.js) y confirmarla
     * solo la marca ejecutada.
    ```
  - `TIPOS_BLOQUE`: agregar `'tabla-muestras'` al final.
  - Al final de `PLANTILLAS_OT`, después de `traslado`:

```js
  {
    // Referencia: 0993 Muestras Ensayos Nico Torti. No se mueve vino: se
    // buscan muestras de lotes y vasijas. La tabla es ot.muestras y se edita
    // sobre la hoja (filas que se agregan y quitan).
    id: 'muestras-ot',
    nombre: 'Muestras',
    banda: ['MUESTRAS'],
    origen: 'ninguno',
    sinMovimientos: true,
    hojas: ['ot'],
    bloques: [
      p('Buscar las siguientes muestras y armar cortes según indicaciones'),
      p('IR DESINFECTANDO MANGUERITA ENTRE MUESTRA Y MUESTRA'),
      { tipo: 'tabla-muestras' },
      p('AL finalizar gasear TODOS LOS T50 ANTES DE CERRAR'),
      p('Analizar los cortes y de ser necesario corregir a 35 ppm'),
      p('Enviar por mail a Nico Torti datos analizados'),
    ],
  },
```

  - Después de `esSalida`:

```js
// La OT no mueve vino (Muestras): ni movimientos ni confirmacion con litros.
export function sinMovimientos(id){
  const pl = plantillaPorId(id);
  return !!(pl && pl.sinMovimientos);
}
```

  En `public/ordenes/js/catalogo.js`, después del tipo `traslado`:

```js
  { id: 'muestras-ot', modulo: 'lotes', nombre: 'Muestras',
    desc: 'Buscar muestras de lotes y vasijas (ensayos, cortes).',
    sinonimos: ['muestras', 'ensayos', 'cortes', 't50', 'nico', 'muestreo'] },
```

  El test del catálogo arma su lista esperada desde `PLANTILLAS_OT`, así que suma `muestras-ot` solo: no se edita.

- [ ] **Step 4: Correr.** `npx vitest run test/lotes-ot-plantillas.test.mjs test/ordenes-catalogo.test.mjs test/lotes-ot-hojas.test.mjs`
  Expected: PASS. Si `lotes-ot-hojas` falla porque itera todas las plantillas y no sabe dibujar `tabla-muestras`, anotarlo: se resuelve en la Task 4. Seguir igual.

- [ ] **Step 5: Commit.**
```bash
git add public/lotes/js/ot-plantillas.js public/ordenes/js/catalogo.js test/lotes-ot-plantillas.test.mjs test/ordenes-catalogo.test.mjs
git commit -m "feat(lotes): plantilla de OT Muestras (0993), sin movimientos, en el catálogo de Órdenes"
```

---

### Task 2: Módulo puro `ot-muestras.js` + `movimientosDeOT` sin movimientos

**Files:**
- Create: `public/lotes/js/ot-muestras.js`
- Modify: `public/lotes/js/ot-armado.js` (`movimientosDeOT`)
- Test: `test/lotes-ot-muestras.test.mjs` (nuevo)

**Interfaces:**
- Consumes: `armarOT`, `resumenVasijas` de `ot-armado.js`.
- Produces (todas exportadas por `ot-muestras.js`):
  - `MUESTRA_POR_DEFECTO = '750 ml'`
  - `COLS_MUESTRAS = ['lote', 'vasija', 'muestra']`
  - `esSinMovimientos(ot) → boolean` (lee `ot.sin_movimientos === true`)
  - `filasDeOT(ot) → Array<{lote, vasija, muestra}>`
  - `vasijaDeLote({ barriles, tanques, cantidad_barricas }) → string`
  - `filasIniciales(lotes: Array<{lote, vasija}>, muestra: string) → filas`
  - `agregarFila(filas) → filas nuevas` (la fila nueva copia la muestra de la última)
  - `quitarFila(filas, i) → filas nuevas`
  - `editarCeldaMuestra(filas, i, col, valor) → filas nuevas | null` (null si no cambió o es inválido)
  - `lotesDeMuestras(ot) → string[]` (sin vacíos y sin repetir, en orden)
  - `armarOTMuestras({ id, numero, fecha, emitio, filas, usuario, hoy }) → ot`

- [ ] **Step 1: Test que falla.** Crear `test/lotes-ot-muestras.test.mjs`:

```js
/* La OT de Muestras (0993) no mueve vino: su tabla es ot.muestras y se edita
 * sobre la hoja. Estas funciones no mutan lo que reciben: la vista asigna el
 * resultado a ot.muestras (asi Ctrl+Z y el autoguardado ven un cambio). */
import { describe, it, expect } from 'vitest';
import { MUESTRA_POR_DEFECTO, esSinMovimientos, filasDeOT, vasijaDeLote, filasIniciales, agregarFila,
  quitarFila, editarCeldaMuestra, lotesDeMuestras, armarOTMuestras } from '../public/lotes/js/ot-muestras.js';
import { movimientosDeOT } from '../public/lotes/js/ot-armado.js';

const b = (num, cap, estado = 'LLENO') => ({ num, cap, estado });

describe('vasijaDeLote', () => {
  it('un T50 lleno del Mapa', () => {
    expect(vasijaDeLote({ barriles: [b('7053', 50)] })).toBe('1 T50 7053');
  });
  it('barricas + T50, sin contar las vacias', () => {
    expect(vasijaDeLote({ barriles: [b('1', 225), b('2', 225), b('3', 50), b('4', 225, 'VACIO')] }))
      .toBe('2 barricas + 1 T50');
  });
  it('tanque del padron y cantidad de barricas', () => {
    expect(vasijaDeLote({ tanques: [{ num: '12' }] })).toMatch(/12/);
    expect(vasijaDeLote({ cantidad_barricas: 4 })).toBe('4 Barricas');
  });
  it('sin nada, vacio', () => {
    expect(vasijaDeLote({})).toBe('');
    expect(vasijaDeLote()).toBe('');
  });
});

describe('filas', () => {
  const f0 = filasIniciales([{ lote: 26142, vasija: 'T50' }, { lote: '26143', vasija: '' }], ' 750 ml ');
  it('una fila por lote, con la muestra para todas', () => {
    expect(f0).toEqual([{ lote: '26142', vasija: 'T50', muestra: '750 ml' },
                        { lote: '26143', vasija: '', muestra: '750 ml' }]);
  });
  it('agregar copia la muestra de la ultima fila; sin filas, la muestra por defecto', () => {
    expect(agregarFila(f0).at(-1)).toEqual({ lote: '', vasija: '', muestra: '750 ml' });
    expect(agregarFila([])).toEqual([{ lote: '', vasija: '', muestra: MUESTRA_POR_DEFECTO }]);
    expect(f0).toHaveLength(2);   // no muta
  });
  it('quitar', () => {
    expect(quitarFila(f0, 0)).toEqual([f0[1]]);
    expect(quitarFila(f0, 9)).toEqual(f0);
    expect(f0).toHaveLength(2);
  });
  it('editar una celda devuelve filas nuevas; sin cambio o invalido, null', () => {
    const r = editarCeldaMuestra(f0, 1, 'vasija', '3 barricas');
    expect(r[1].vasija).toBe('3 barricas');
    expect(f0[1].vasija).toBe('');
    expect(editarCeldaMuestra(f0, 0, 'vasija', 'T50')).toBeNull();
    expect(editarCeldaMuestra(f0, 0, 'check', 'x')).toBeNull();
    expect(editarCeldaMuestra(f0, 7, 'lote', '1')).toBeNull();
  });
});

describe('la OT', () => {
  const ot = armarOTMuestras({ id: 'ot-x', numero: '0993', fecha: '2026-11-10', emitio: 'Oriana',
    filas: [{ lote: '26142', vasija: 'T50', muestra: '750 ml' }, { lote: '', vasija: '', muestra: '' },
            { lote: '26142', vasija: 'barrica', muestra: '750 ml' }], usuario: 'oriana', hoy: '2026-11-10' });
  it('se arma pendiente, sin lotes ni movimientos, con la tabla sin filas vacias', () => {
    expect(ot).toMatchObject({ id: 'ot-x', ot: '0993', plantilla: 'muestras-ot', fecha: '2026-11-10',
      estado: 'pendiente', emitio: 'Oriana', lotes: [], sin_movimientos: true });
    expect(ot.muestras).toHaveLength(2);
    expect(esSinMovimientos(ot)).toBe(true);
    expect(esSinMovimientos({ lotes: [] })).toBe(false);
    expect(movimientosDeOT(ot, 'oriana', '2026-11-10')).toEqual([]);
  });
  it('lotes de la tabla sin repetir; filasDeOT tolera OT viejas', () => {
    expect(lotesDeMuestras(ot)).toEqual(['26142']);
    expect(filasDeOT({})).toEqual([]);
    expect(lotesDeMuestras({})).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr.** `npx vitest run test/lotes-ot-muestras.test.mjs` → FAIL (no existe el módulo).

- [ ] **Step 3: Implementar.** Crear `public/lotes/js/ot-muestras.js`:

```js
/* ===== Lotes CIW — la OT de Muestras (0993), modulo puro =====
 *
 * No mueve vino: la OT se marca sin_movimientos, guarda lotes: [] y su tabla
 * (Lote / Vasija / Muestra) en ot.muestras, que se edita sobre la hoja. Las
 * funciones de filas no mutan: devuelven filas nuevas y la vista las asigna a
 * ot.muestras.
 *
 * sin_movimientos va en la OT y no se deduce de la plantilla: el servidor
 * (src/ordenes/resumen.ts) no lee las plantillas, y una OT guardada no cambia
 * de regla si mañana cambia la plantilla. */
'use strict';

import { armarOT, resumenVasijas } from './ot-armado.js';

export const MUESTRA_POR_DEFECTO = '750 ml';
export const COLS_MUESTRAS = ['lote', 'vasija', 'muestra'];

const txt = v => String(v ?? '').trim();

export const esSinMovimientos = ot => !!ot && ot.sin_movimientos === true;

export function filasDeOT(ot){
  return ot && Array.isArray(ot.muestras) ? ot.muestras : [];
}

/* La vasija sugerida de un lote: lo que tiene LLENO en el Mapa, sus tanques
 * del padron o "N Barricas". Es una sugerencia: se corrige en la hoja. */
export function vasijaDeLote({ barriles = [], tanques = [], cantidad_barricas = null } = {}){
  const llenos = (barriles || []).filter(b => b && (!b.estado || b.estado === 'LLENO'));
  return resumenVasijas({ barriles: llenos, tanques: tanques || [], otras: [], cantidad_barricas });
}

export function filasIniciales(lotes, muestra){
  const m = txt(muestra);
  return (lotes || []).map(l => ({ lote: txt(l.lote), vasija: txt(l.vasija), muestra: m }));
}

export function agregarFila(filas){
  const fs = filas || [];
  const muestra = fs.length ? fs[fs.length - 1].muestra : MUESTRA_POR_DEFECTO;
  return [...fs, { lote: '', vasija: '', muestra }];
}

export function quitarFila(filas, i){
  return (filas || []).filter((_, k) => k !== i);
}

export function editarCeldaMuestra(filas, i, col, valor){
  const fs = filas || [];
  if (!COLS_MUESTRAS.includes(col) || !fs[i]) return null;
  const v = String(valor ?? '');
  if (fs[i][col] === v) return null;
  return fs.map((f, k) => k === i ? { ...f, [col]: v } : f);
}

export function lotesDeMuestras(ot){
  return [...new Set(filasDeOT(ot).map(f => txt(f.lote)).filter(Boolean))];
}

const vacia = f => !txt(f.lote) && !txt(f.vasija) && !txt(f.muestra);

export function armarOTMuestras({ id, numero, fecha, emitio, filas, usuario, hoy }){
  return {
    ...armarOT({ id, numero, plantilla: 'muestras-ot', fecha, destino: '', emitio, lotes: [],
                 mapaVersion: null, usuario, hoy }),
    sin_movimientos: true,
    muestras: (filas || []).filter(f => !vacia(f)).map(f => ({ lote: txt(f.lote), vasija: txt(f.vasija), muestra: txt(f.muestra) })),
  };
}
```

  En `public/lotes/js/ot-armado.js`, al principio de `movimientosDeOT`:

```js
  // Muestras (0993): la OT no mueve vino.
  if (ot && ot.sin_movimientos) return [];
```

- [ ] **Step 4: Correr.** `npx vitest run test/lotes-ot-muestras.test.mjs test/lotes-ot-armado.test.mjs` → PASS.
  Si el texto exacto de `vasijaDeLote` con un tanque no coincide, ajustar SOLO la expectativa del test al formato real de `nombreTanque` (el test usa `toMatch(/12/)` justamente por eso).

- [ ] **Step 5: Commit.**
```bash
git add public/lotes/js/ot-muestras.js public/lotes/js/ot-armado.js test/lotes-ot-muestras.test.mjs
git commit -m "feat(lotes): ot-muestras.js (filas de la OT de Muestras) y movimientosDeOT vacío para OT sin movimientos"
```

---

### Task 3: Que la OT sin movimientos no se esconda (lista de Lotes + sección Órdenes)

**Files:**
- Modify: `public/lotes/js/ot-lista.js`
- Modify: `src/ordenes/resumen.ts` (`deTrabajo`)
- Test: `test/lotes-ot-lista.test.mjs`, `test/ordenes-resumen.test.ts`

**Interfaces:**
- Consumes: `esSinMovimientos`, `lotesDeMuestras` de `ot-muestras.js`.

- [ ] **Step 1: Tests que fallan.** Al final de `test/lotes-ot-lista.test.mjs`:

```js
describe('OT de Muestras (sin movimientos)', () => {
  const mu = { id: 'mu', ot: '0993', plantilla: 'muestras-ot', fecha: '2026-11-10', estado: 'pendiente',
    sin_movimientos: true, lotes: [], muestras: [{ lote: '26142', vasija: 'T50', muestra: '750 ml' },
                                                  { lote: '26143', vasija: 'T50', muestra: '750 ml' }] };
  it('no es huérfana aunque no tenga movimientos', () => {
    expect(filtrarOrdenes([mu], { movimientos: [] })).toEqual([mu]);
  });
  it('se busca y se resume por los lotes de su tabla', () => {
    expect(filtrarOrdenes([mu], { busca: '26143' })).toEqual([mu]);
    expect(resumenLotes(mu)).toBe('26142 · 26143');
  });
});
```

  En `test/ordenes-resumen.test.ts`, dentro de `describe('resumenOrdenes — Lotes'`:

```ts
  it('una OT sin movimientos (Muestras) se ve, con los lotes de su tabla', () => {
    const r = resumenOrdenes('lotes', { movimientos: [], ordenes_trabajo: [OT({
      plantilla: 'muestras-ot', sin_movimientos: true, lotes: [],
      muestras: [{ lote: '26142' }, { lote: '26142' }, { lote: '' }, { lote: '26143' }] })] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: 'muestras-ot', estado: 'pendiente', lotes: ['26142', '26143'] });
  });
```

- [ ] **Step 2: Correr.** `npx vitest run test/lotes-ot-lista.test.mjs test/ordenes-resumen.test.ts` → FAIL.

- [ ] **Step 3: Implementar.** En `public/lotes/js/ot-lista.js`:
  - Agregar `import { esSinMovimientos, lotesDeMuestras } from './ot-muestras.js';`
  - Reemplazar `lotesDe` por:
```js
// Muestras (0993): los lotes son los de su tabla, no tiene ot.lotes.
const lotesDe = ot => esSinMovimientos(ot) ? lotesDeMuestras(ot) : (ot.lotes || []).map(l => String(l.lote ?? ''));
```
  - En `filtrarOrdenes`, el primer filter pasa a:
```js
    .filter(ot => !vivos || esSinMovimientos(ot) || (ot.lotes || []).some(l => vivos.has(l.mov_id)))
```
  - Al comentario de `movimientos` sumarle: `Una OT sin movimientos (Muestras) nunca es huérfana.`

  En `src/ordenes/resumen.ts`:
  - Debajo de `lotesDe`:
```ts
/** Muestras (0993): sin movimientos; sus lotes son los de su tabla (ot.muestras). */
const sinMovimientos = (ot: Fila) => ot.sin_movimientos === true;
const lotesDeOT = (ot: Fila) => sinMovimientos(ot)
  ? [...new Set(filas(ot.muestras).map((f) => txt(f.lote)).filter(Boolean))]
  : lotesDe(ot);
```
  - En `deTrabajo`: `.filter((ot) => sinMovimientos(ot) || filas(ot.lotes).some((l) => vivos.has(l.mov_id)))` y `lotes: lotesDeOT(ot),`.
  - En el comentario de cabecera, después de «…no se muestra (ot-lista.js filtrarOrdenes)», agregar: «salvo las OT sin movimientos (Muestras)».

- [ ] **Step 4: Correr.** `npx vitest run test/lotes-ot-lista.test.mjs test/ordenes-resumen.test.ts` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add public/lotes/js/ot-lista.js src/ordenes/resumen.ts test/lotes-ot-lista.test.mjs test/ordenes-resumen.test.ts
git commit -m "feat(ordenes): la OT de Muestras no es huérfana (lista de Lotes y sección Órdenes), con los lotes de su tabla"
```

---

### Task 4: La tabla de muestras en la hoja (papel y pantalla editable)

**Files:**
- Modify: `public/lotes/js/ot-hojas.js`
- Modify: `public/lotes/js/vista-ot-emitir.js` (solo `tituloOT`)
- Test: `test/lotes-ot-hojas.test.mjs`

**Interfaces:**
- Consumes: `filasDeOT`, `esSinMovimientos`, `lotesDeMuestras` de `ot-muestras.js`.
- Produces: `hojaOT(ot, { editable, lotesExisten })`. `lotesExisten` es opcional: un `Set<string>` con los números de lote que existen; sin él no se marca nada en rojo. En modo editable, la tabla lleva:
  - `<input class="ot-mu-celda" data-mfila="i" data-mcol="lote|vasija|muestra">`;
  - un botón `[data-mquitar="i"]` por fila;
  - un botón `[data-mmas]` debajo de la tabla.

  El lote inexistente lleva la clase `ot-mu-mal`.

- [ ] **Step 1: Tests que fallan.** Al final de `test/lotes-ot-hojas.test.mjs` (el import de `hojaOT`/`hojasOT` ya existe en el archivo; si falta, sumarlo):

```js
describe('hoja de la OT de Muestras (0993)', () => {
  const mu = { id: 'mu', ot: '0993', plantilla: 'muestras-ot', fecha: '2026-11-10', estado: 'pendiente',
    emitio: 'Oriana', sin_movimientos: true, lotes: [],
    muestras: [{ lote: '26142', vasija: 'T50', muestra: '750 ml' }, { lote: '99999', vasija: '<b>', muestra: '750 ml' }] };
  it('papel: # · CIW lote · Vasija · Muestra · Check, una fila por muestra, sin controles', () => {
    const h = hojasOT(mu);
    expect(h).toContain('<th>#</th><th>CIW lote</th><th>Vasija</th><th>Muestra</th><th>Check</th>');
    expect(h).toContain('<td>1</td><td>26142</td><td>T50</td><td>750 ml</td>');
    expect(h).toContain('&lt;b&gt;');
    expect(h).not.toContain('data-mmas');
    expect(h).not.toContain('<input');
    expect(h).toContain('IR DESINFECTANDO MANGUERITA');
    expect(h).toContain('MUESTRAS');
  });
  it('pantalla: celdas editables, ✕ por fila, ＋ Agregar fila, lote inexistente en rojo', () => {
    const h = hojaOT(mu, { editable: true, lotesExisten: new Set(['26142']) });
    expect(h).toContain('data-mfila="0" data-mcol="lote"');
    expect(h).toContain('data-mfila="1" data-mcol="muestra"');
    expect(h).toContain('data-mquitar="1"');
    expect(h).toContain('data-mmas');
    expect((h.match(/ot-mu-mal/g) || []).length).toBe(1);
  });
  it('una OT vieja sin muestras se dibuja con la tabla vacía', () => {
    expect(() => hojasOT({ ...mu, muestras: undefined })).not.toThrow();
  });
});
```

- [ ] **Step 2: Correr.** `npx vitest run test/lotes-ot-hojas.test.mjs` → FAIL.

- [ ] **Step 3: Implementar** en `public/lotes/js/ot-hojas.js`:
  - Import: cambiar `import { esc } from './nucleo.js';` por `import { esc, escA } from './nucleo.js';` y sumar `import { filasDeOT } from './ot-muestras.js';`.
  - Antes de `bloqueFijo`, agregar:

```js
/* Muestras (0993): # · CIW lote · Vasija · Muestra · Check. En pantalla (OT
 * pendiente) cada celda es un input y la fila se quita con ✕; "＋ Agregar
 * fila" va debajo. Nada de eso llega al papel: la impresion arma la hoja sin
 * editable. `lotesExisten` (Set) pinta en rojo el lote que no existe. */
const COLS_MU = [['lote', 'CIW lote'], ['vasija', 'Vasija'], ['muestra', 'Muestra']];
function tablaMuestras(ot, editable, lotesExisten){
  const filas = filasDeOT(ot);
  const head = '<tr><th>#</th>' + COLS_MU.map(([, t]) => `<th>${t}</th>`).join('') + '<th>Check</th></tr>';
  const mal = f => lotesExisten && String(f.lote || '').trim() && !lotesExisten.has(String(f.lote).trim());
  const cuerpo = filas.map((f, i) => editable
    ? `<tr><td class="ot-mu-n">${i + 1}<button type="button" class="ot-mu-x" data-mquitar="${i}" title="Quitar esta fila" aria-label="Quitar la fila ${i + 1}">✕</button></td>` +
      COLS_MU.map(([c, t]) => `<td><input class="ot-mu-celda${c === 'lote' && mal(f) ? ' ot-mu-mal' : ''}" data-mfila="${i}" data-mcol="${c}" ` +
        `value="${escA(f[c] ?? '')}" aria-label="${t} de la fila ${i + 1}"${c === 'lote' ? ' list="otLotesDl"' : ''}></td>`).join('') +
      `${CHECK}</tr>`
    : `<tr><td>${i + 1}</td>` + COLS_MU.map(([c]) => `<td>${esc(f[c] ?? '')}</td>`).join('') + `${CHECK}</tr>`).join('');
  const mas = editable ? '<button type="button" class="btn ot-mu-mas" data-mmas>＋ Agregar fila</button>' : '';
  return `<table class="ot-tabla ot-muestras"><thead>${head}</thead><tbody>${cuerpo}</tbody></table>${mas}`;
}
```

  - En `hojaOT`, la firma pasa a `export function hojaOT(ot, { editable = false, lotesExisten = null } = {}){`. En el `switch (b.tipo)`, antes de `default:`, agregar:

```js
      case 'tabla-muestras': {
        // Sin aplicarCeldas: sus celdas son datos (ot.muestras), no papel.
        const html = tablaMuestras(ot, editable, lotesExisten);
        return editable ? `<div class="ot-fijo">${html}${controles(i, false)}</div>` : html;
      }
```

  En `public/lotes/js/vista-ot-emitir.js`, función `tituloOT`: sumar el import de `esSinMovimientos` y `lotesDeMuestras` desde `./ot-muestras.js`, y reemplazar la línea de `lotes`:

```js
  const lotes = (esSinMovimientos(ot) ? lotesDeMuestras(ot) : (ot.lotes || []).map(l => l.lote)).filter(Boolean).join(' ');
```

- [ ] **Step 4: Correr.** `npx vitest run test/lotes-ot-hojas.test.mjs test/lotes-ot-plantillas.test.mjs` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add public/lotes/js/ot-hojas.js public/lotes/js/vista-ot-emitir.js test/lotes-ot-hojas.test.mjs
git commit -m "feat(lotes): tabla de la OT de Muestras en la hoja (editable en pantalla, limpia en el papel) y título del PDF con sus lotes"
```

---

### Task 5: Emitir una OT de Muestras desde el formulario

**Files:**
- Modify: `public/lotes/js/vista-ot-emitir.js`

**Interfaces:**
- Consumes: `sinMovimientos` (ot-plantillas), `armarOTMuestras`, `filasIniciales`, `vasijaDeLote`, `MUESTRA_POR_DEFECTO` (ot-muestras).
- Esta task no tiene test node: es DOM. Se verifica en el navegador en la Task 7. Lo que tiene lógica ya está testeado en la Task 2.

- [ ] **Step 1: Imports.** Sumar `sinMovimientos` al import de `./ot-plantillas.js`, y al de `./ot-muestras.js` (creado en la Task 4) agregarle `armarOTMuestras, filasIniciales, vasijaDeLote, MUESTRA_POR_DEFECTO`.

- [ ] **Step 2: Campo Muestra en el formulario.** En `_abrirFormulario`, debajo de la línea del `oteDestino`, agregar:

```html
  <label id="oteMuestraLbl" for="oteMuestra" style="display:none">Muestra</label><input class="txt" id="oteMuestra" value="${escA(MUESTRA_POR_DEFECTO)}" style="display:none" title="Va en todas las filas; después se corrige fila por fila sobre la hoja">
```

- [ ] **Step 3: Mostrar Muestra en vez de Destino.** Al principio de `_rotularDestino()`:

```js
  // Muestras (0993): no hay destino; se pide la muestra para todas las filas.
  const mu = sinMovimientos(_plantilla);
  for (const id of ['oteDestinoLbl', 'oteDestino']) $(id).style.display = mu ? 'none' : '';
  for (const id of ['oteMuestraLbl', 'oteMuestra']) $(id).style.display = mu ? '' : 'none';
  if (mu) return;
```

- [ ] **Step 4: Tarjeta simple de lote.** Debajo de `_loteDesdeTanque`:

```js
/* Muestras (0993): de cada lote solo la vasija, sugerida desde el Mapa y el
 * padron; se puede corregir aca o despues sobre la hoja. */
const _vasijaSugerida = l => vasijaDeLote({ barriles: l.barriles, tanques: l.tanques.filter(t => t.tildado),
  cantidad_barricas: l.modo_origen === 'cantidad' ? l.cantidad_barricas : null });
function _loteMuestra(l, i){
  const aviso = l.enLotes ? '' : '<div class="msg err">⚠ No está en la lista de lotes.</div>';
  return `<div class="card ote-lote">
  <div><b>${esc(l.lote)}</b> ${esc(l.id_texto)} ${l.organico ? '🟢 orgánico' : ''}
    <button class="rowbtn" data-quitar="${i}" title="Quitar lote">✕</button></div>
  ${aviso}
  <label>Vasija</label> <input class="txt" data-vasm="${i}" value="${escA(l.vasija_muestra ?? _vasijaSugerida(l))}" placeholder="p. ej. T50">
</div>`;
}
```

  En `pintarLotes`, después de la línea `if (_desdeTanque()){ … }`:

```js
  if (sinMovimientos(_plantilla)){ cont.innerHTML = _lotes.map(_loteMuestra).join(''); return; }
```

  En el listener `change` de `conectarLotes`, como PRIMERA rama del `if`:

```js
    if (t.dataset.vasm !== undefined){
      _lotes[+t.dataset.vasm].vasija_muestra = t.value.trim();
    } else if (t.dataset.num !== undefined){
```

  (o sea: convertir el `if (t.dataset.num …` existente en `else if`).

- [ ] **Step 5: Emitir.** En `_emitir`, reemplazar desde `const error = …` hasta `await registrarOT(ot, onListo);` por:

```js
  const mu = sinMovimientos(_plantilla);
  // Muestras: puede salir sin lotes (la tabla se carga a mano sobre la hoja).
  const error = validarCabecera(numero) || (mu ? '' : validarLotesOrigen());
  if (error){ avisar(error, { tipo: 'mal' }); return; }
  if (!await confirmarNumeroRepetido(numero)) return;
  const otro = await numeroOcupadoEnCarpeta(numero);
  if (otro){ $('oteNumero').value = otro; return; }
  const ot = mu ? _armarOTMuestras(numero, fecha)
    : armarOTDeSesion({ numero, fecha, plantilla: _plantilla, destino: $('oteDestino').value, emitio: $('oteEmitio').value });
  await registrarOT(ot, onListo);
```

  y agregar debajo de `_emitir`:

```js
function _armarOTMuestras(numero, fecha){
  const hoy = hoyLocalISO();
  return armarOTMuestras({
    id: 'ot-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    numero, fecha: fechaOHoy(fecha, hoy), emitio: $('oteEmitio').value,
    filas: filasIniciales(_lotes.map(l => ({ lote: l.lote, vasija: l.vasija_muestra ?? _vasijaSugerida(l) })), $('oteMuestra').value),
    usuario: usuarioActual(), hoy,
  });
}
```

  `registrarOT` no cambia: `movimientosDeOT` ya devuelve `[]` para esta OT (Task 2).

- [ ] **Step 6: Que no rompa nada.** `npx vitest run test/lotes-ot-*.test.mjs test/ordenes-*.test.*` → PASS (incluye los tests de estética que leen los JS de Lotes).

- [ ] **Step 7: Commit.**
```bash
git add public/lotes/js/vista-ot-emitir.js
git commit -m "feat(lotes): emitir una OT de Muestras: lotes con su vasija sugerida y la muestra para todas las filas"
```

---

### Task 6: Editar la tabla sobre la hoja, confirmar y borrar

**Files:**
- Modify: `public/lotes/js/vista-ot-lista.js`
- Modify: `public/lotes/js/vista-ot-confirmar.js`
- Modify: `public/lotes/index.html` (CSS)

**Interfaces:**
- Consumes: `hojaOT(ot, { editable, lotesExisten })` (Task 4); `esSinMovimientos`, `filasDeOT`, `agregarFila`, `quitarFila`, `editarCeldaMuestra` (Task 2); `eliminarOT`, `confirmarOT` (ot-armado).

- [ ] **Step 1: Pintar con los lotes que existen.** En `vista-ot-lista.js`:
  - sumar `import { esSinMovimientos, filasDeOT, agregarFila, quitarFila, editarCeldaMuestra } from './ot-muestras.js';`
  - sumar `import { eliminarOT } from './ot-armado.js';`

  En `_pintarDer`, cambiar `hojaOT(ot, { editable: esEditable(ot) })` por:

```js
hojaOT(ot, { editable: esEditable(ot), lotesExisten: esSinMovimientos(ot) ? new Set((DATOS().lotes || []).map(l => String(l.lote))) : null })
```

  y, para que esa tabla no ofrezca filas manuales de trasiego, cambiar `_panelFilas(ot);` por `if (!esSinMovimientos(ot)) _panelFilas(ot);`. El datalist `otLotesDl` ya se arma ahí y sirve para la columna lote.

- [ ] **Step 2: Escuchar la tabla.** En `_cablearHoja`, al principio del listener `input`:

```js
    const mc = e.target.closest('input.ot-mu-celda');
    if (mc){
      const o = _otViva(id);
      if (!o) return;
      const nuevas = editarCeldaMuestra(filasDeOT(o), +mc.dataset.mfila, mc.dataset.mcol, mc.value);
      if (!nuevas) return;
      o.muestras = nuevas;
      markDirty();
      // Sin repintar (no se pierde el foco): solo el rojo del lote.
      if (mc.dataset.mcol === 'lote'){
        const v = mc.value.trim();
        mc.classList.toggle('ot-mu-mal', !!v && !(DATOS().lotes || []).some(l => String(l.lote) === v));
      }
      return;
    }
```

  y al principio del listener `click`:

```js
    const mq = e.target.closest('[data-mquitar]');
    const mm = e.target.closest('[data-mmas]');
    if (mq || mm){
      const o = _otViva(id);
      if (!o) return;
      o.muestras = mm ? agregarFila(filasDeOT(o)) : quitarFila(filasDeOT(o), +mq.dataset.mquitar);
      markDirty();
      _pintarDer();
      if (mm){ const ult = $('otlHoja').querySelectorAll('input.ot-mu-celda[data-mcol="lote"]'); if (ult.length) ult[ult.length - 1].focus(); }
      return;
    }
```

- [ ] **Step 3: Cabecera: sin ✎ Editar, con 🗑 Borrar.** En `_pintarCab`:
  - `const mu = esSinMovimientos(ot);`
  - la línea del botón `otlEditar` pasa a `(edit && !mu ? … : '')`;
  - antes de `otlImprimir` agregar `(mu ? '<button class="btn danger" id="otlBorrar" title="Borrar esta orden de muestras">🗑 Borrar</button>' : '') +`;
  - y el listener, después del de `otlConfirmar`:

```js
  if ($('otlBorrar')) $('otlBorrar').addEventListener('click', async () => {
    if (!await confirmar({ titulo: 'Borrar la ' + ot.ot, texto: 'Es una orden de muestras: no tiene movimientos ni cambió ningún lote.',
      si: 'Borrar', no: 'Cancelar', peligro: true })) return;
    const o = _otViva(id);
    if (!o) return;
    eliminarOT(DATOS(), o);
    markDirty();
    _elegida = null;
    _cb.onCambio();
  });
```

  Hay que comprobar que `onCambio` repinte la lista y la hoja vacía. Si no lo hace, llamar también a `_pintarDer()`.

- [ ] **Step 4: Confirmar sin propuesta.** En `vista-ot-confirmar.js`:
  - sumar `import { esSinMovimientos } from './ot-muestras.js';`
  - sumar `avisar` al import de `./dialogos.js`.

  En `abrirConfirmarOT`, después de `if (esEjecutado(ot)) return;`:

```js
  if (esSinMovimientos(ot)) return _confirmarSinMovimientos(ot, onListo);
```

  y agregar la función:

```js
/* Muestras (0993): no hay litros ni vasijas que aplicar; confirmar solo la
 * marca ejecutada (quien y cuando). Se busca la OT viva despues del dialogo:
 * un guardado con fusion (409) pudo reemplazar los objetos. */
async function _confirmarSinMovimientos(ot, onListo){
  if (!await confirmar({ titulo: 'Confirmar ' + ot.ot,
    texto: 'Se marca la orden de muestras como ejecutada. No cambia litros, vasijas ni etapas de ningún lote.',
    si: 'Marcar ejecutada', no: 'Cancelar' })) return;
  const viva = (DATOS().ordenes_trabajo || []).find(o => o.id === ot.id);
  if (!viva || esEjecutado(viva)){
    avisar('La ' + ot.ot + ' ya no está pendiente (¿la confirmaron o borraron desde otra PC?).', { tipo: 'mal' });
    onListo();
    return;
  }
  confirmarOT(viva, [], { operario: usuarioActual(), pasos_cumplidos: true, comentario: '' }, usuarioActual(), hoyLocalISO());
  markDirty();
  onListo(viva);
  await guardar(false);
}
```

- [ ] **Step 5: CSS.** En `public/lotes/index.html`, junto a las reglas `.orden-hoja .ot-ctrl` (cerca de la línea 1569):

```css
.orden-hoja .ot-muestras .ot-mu-celda{width:100%;border:none;background:transparent;font:inherit;padding:0}
.orden-hoja .ot-muestras .ot-mu-celda:focus{outline:1px solid var(--accent, #2f6b2f);background:#fff}
.orden-hoja .ot-muestras .ot-mu-mal{color:#b3261e;font-weight:600}
.orden-hoja .ot-muestras .ot-mu-n{position:relative;white-space:nowrap}
.orden-hoja .ot-muestras .ot-mu-x{margin-left:4px;border:none;background:transparent;color:var(--muted);cursor:pointer;opacity:0}
.orden-hoja .ot-muestras tr:hover .ot-mu-x,.orden-hoja .ot-muestras .ot-mu-x:focus{opacity:1}
.orden-hoja .ot-mu-mas{margin:6px 0 4px}
```

  Revisar que `--accent` exista (`grep -n "\-\-accent" public/lotes/index.html`). Si no, usar el color verde que ya usa `.ot-insertar:hover` (`#2f6b2f`).

- [ ] **Step 6: Tests.** `npx vitest run` → PASS completo (los de estética leen `index.html` y los JS de Lotes).

- [ ] **Step 7: Commit.**
```bash
git add public/lotes/js/vista-ot-lista.js public/lotes/js/vista-ot-confirmar.js public/lotes/index.html
git commit -m "feat(lotes): OT de Muestras: editar/agregar/quitar filas sobre la hoja, confirmar sin litros y 🗑 Borrar"
```

---

### Task 7: Verificación en el navegador

**Files:**
- Create (scratchpad, no va al repo): `mock-ot-muestras.mjs`
- Modify: `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\.claude\launch.json`

- [ ] **Step 1: Servidor de prueba.** Copiar al scratchpad de esta sesión el mock `C:/Users/Bmax/AppData/Local/Temp/claude/C--Users-Bmax-OneDrive---BODEGAS-ESMERALDA-SA-Escritorio-claude/f7dc707e-e629-4b65-b8c0-10310bd3cd69/scratchpad/mock-ot-ejec.mjs`, con el nombre `mock-ot-muestras.mjs`. Después:
  - cambiar las dos rutas `catenainstitute-ot-ejec` por `ci-ot-muestras`;
  - cambiar el puerto a `8875`;
  - en `BARRILES`, agregar `'26142': [b('7053', 50, '26142')]` y `'26143': [b('7055', 225, '26143'), b('7056', 50, '26143')]`;
  - en `doc.lotes` (si el mock lo trae; si no, crear el arreglo) sumar `{ lote: '26142', id_texto: 'MB Nicasia I Ct.3 LN18 - A' }` y `{ lote: '26143', id_texto: 'MB Nicasia I Ct.3 LN18 - B' }`.

  Sumar a `launch.json` la entrada `{ "name": "ot-muestras", "runtimeExecutable": "node", "runtimeArgs": ["<ruta del mock>"], "port": 8875 }`.

- [ ] **Step 2: Recorrido** con `preview_start {name: "ot-muestras"}`:
  1. `/ordenes/?v=nueva` → buscar «muestras». Tiene que aparecer «Muestras» en la columna Lotes. Abrirla.
  2. En el formulario: no hay «Tanque destino» y está «Muestra» con `750 ml`. Agregar 26142 y 26143. Las vasijas sugeridas tienen que ser `1 T50 7053` y `1 barrica + 1 T50` (o lo que dé `resumenVasijas`). Emitir.
  3. En la hoja: la tabla trae 2 filas. Editar la muestra de la fila 2, agregar una fila con lote `99999` (tiene que quedar en rojo) y quitarla. Editar un paso de texto.
  4. F5: todo sigue igual (lo guardó el autoguardado).
  5. 🖨 Imprimir: inspeccionar `#otMovHoja` con `javascript_tool` (`document.getElementById('otMovHoja').innerHTML.includes('data-mmas')` tiene que dar `false`).
  6. ✓ Confirmar → «Marcar ejecutada». La OT pasa a solo lectura (sin inputs) y Movimientos/Historial no ganó filas.
  7. `/ordenes/?v=historial`: la OT aparece ejecutada, con lotes `26142 · 26143`.
  8. Emitir otra Muestras sin lotes y borrarla con 🗑 Borrar.
  9. Revisar `read_console_messages` (sin errores) y sacar captura de la hoja editable.

- [ ] **Step 3:** Si algo falla, arreglarlo en la task que corresponde (con su test) y repetir el recorrido.

- [ ] **Step 4: Commit del launch.json** (el repo de Escritorio\claude ya lo commitea así):
```bash
cd "C:/Users/Bmax/OneDrive - BODEGAS ESMERALDA SA/Escritorio/claude"
git add .claude/launch.json
git commit -m "chore: launch.json con el servidor de prueba de la OT de Muestras (ot-muestras, :8875)"
```
  OJO: `.claude/launch.json` ya figura como modificado antes de esta sesión. Mirar `git diff .claude/launch.json`. Si trae cambios que no son de esta task, commitear SOLO la entrada nueva o preguntarle al usuario.

- [ ] **Step 5: Cierre.** `git push -u origin feat/ot-muestras` y ofrecerle al usuario el PR. NO mergear ni desplegar sin su OK.
