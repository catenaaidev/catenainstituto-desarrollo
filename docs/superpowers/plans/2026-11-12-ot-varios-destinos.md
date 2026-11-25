# OT de trasiego con varios destinos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una OT de trasiego pueda llevar tanques destino extra, cada uno con su lote nuevo (hijo), su merma al confirmar y sus agregados TH2 + SO2.

**Architecture:** Un módulo puro nuevo, `ot-destinos.js`, define el item "destino extra" con la misma forma que un tanque del achique y concentra la normalización, la validación, los lotes y los movimientos. Los extra se guardan así:

- en los trasiegos simples, en `ot.lotes[i].destinos_extra`;
- en el Corte, en `ot.destinos_extra`.

El resto de los módulos puros (armado, propuesta, deshacer, correcciones, hojas, editar, lista, inventario) los leen con `extrasDeOT(ot)`. Las vistas (Emitir, asistente del Corte, Confirmar, panel de correcciones) solo pintan y leen.

**Tech Stack:** JavaScript ES modules en el navegador (sin build), Vitest 3, Cloudflare Workers (no se toca el servidor).

**Spec:** `docs/superpowers/specs/2026-11-12-ot-varios-destinos-design.md`

## Global Constraints

- Repo/worktree: `C:\Users\Bmax\repos\catenainstitute-ot-destinos`, rama `feat/ot-varios-destinos`. No tocar `main`. El merge lo hace el usuario.
- Los archivos `public/lotes/js/*.js` tienen finales de línea CRLF. Para editarlos, usar la herramienta Edit, no sed con `\n`.
- Aplica a las plantillas `barricas-barricas`, `tq-barricas`, `barrica-tanque`, `tq-tq` y `barricas-tanque` (Corte). **No** aplica a `corte-achique`, `traslado` ni `muestras-ot`. Usar el helper `admiteExtras(plantillaId)`.
- El destino 1 sigue siendo `ot.destino`. Los destinos extra son **siempre tanques** y **siempre lote nuevo**, con `siguienteLote` editable.
- Una OT sin `destinos_extra` tiene que comportarse **byte a byte igual que hoy**: mismos movimientos, misma hoja y misma propuesta. Cada tarea agrega un test de "sin extras = igual".
- Los lotes hijos se crean al emitir o editar. **Nunca se borran solos**, al borrar ni al editar la OT. Es la convención existente (`lotesCreadosPorOT` + el aviso "no se borran solos"). Esto corrige la frase de la spec "borra … con su lote hijo".
- Cada tanque lleva su propia merma:
  - extra: `merma = entrada.merma` si se escribió; si no, `litros previstos − medidos` si hay previstos; si no, `0`;
  - destino 1: `entrada.merma` si se escribió; si no, el resto = `litros_origen − llegados − Σ(llegados_extra + merma_extra)`.
- En el Corte, los movimientos de origen siguen repartiendo **en proporción** la merma del tanque base, igual que hoy. La merma de cada extra va en el movimiento de ese extra.
- Tests: `npx vitest run --maxWorkers=2 test/lotes-*.mjs`. La suite completa en esta PC se cae por timeouts.
- Textos de la UI en castellano rioplatense, como el resto de la app.
- Commits con el pie `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| Archivo | Qué cambia |
|---|---|
| `public/lotes/js/ot-destinos.js` (nuevo) | Item destino extra: normalizar, asignar lotes, validar, movimientos, hijos, textos. Puro. |
| `public/lotes/js/ot-achique.js` | `movIdsDeOT`, `textoDestinos` y `lotesCreadosPorOT` incluyen los extra. |
| `public/lotes/js/ot-armado.js` | `armarOT` guarda los extra; `movimientosDeOT` suma sus traspasos; `confirmarOT` aplica `reales.extras`. |
| `public/lotes/js/propuesta-ot.js` | Items `extra`, merma por tanque, `esItemCorte`, `aplicarPropuesta`. |
| `public/lotes/js/ot-deshacer.js` | Deshace también los `aplicado` de los extra. |
| `public/lotes/js/ot-correcciones.js` | `lotesACorregir` da una entrada por vasija; `tanquePropuesto` con vasija. |
| `public/lotes/js/so2-bitacora.js` | `aplicarCorreccion` no pisa una corrección de otra vasija. |
| `public/lotes/js/ot-hojas.js` | Celda destino, corrección, agregado del corte y llenado con los extra. |
| `public/lotes/js/ot-editar.js` | Acepta `destinos_extra` en `cambios`; firma de celdas; `hijosQuitados`. |
| `public/lotes/js/ot-lista.js`, `inventario-tanques.js` | Búsqueda y "en trasiego" con los extra. |
| `public/lotes/js/vista-ot-emitir.js` | Bloque "Destinos" por lote + crear hijos al emitir y editar. |
| `public/lotes/js/vista-ot-corte.js` | Paso Tanque destino con "＋ Tanque" (solo Corte sin achique). |
| `public/lotes/js/vista-ot-confirmar.js` | Renglón por extra + Merma (L); arma `reales.extras`. |
| `public/lotes/js/vista-ot-correcciones.js` | Tarjeta por vasija con el tanque y los litros del extra. |
| `test/lotes-ot-destinos.test.mjs` (nuevo) + tests existentes | Ver cada tarea. |

---

### Task 1: Módulo puro `ot-destinos.js`

**Files:**
- Create: `public/lotes/js/ot-destinos.js`
- Test: `test/lotes-ot-destinos.test.mjs`

**Interfaces:**
- Produces:
  - `admiteExtras(plantillaId): boolean`
  - `normalizarExtras(lista, otId, prefijo): Item[]`, con `Item = {tipo:'tanque', num, litros, lote, nuevo:true, mov_id}`
  - `asignarLotesExtra(lista, {lotes, anio, reservados}): Item[]`
  - `validarExtras(lista, {lotes, padron, origenes, loteCorte, destino1, propios}): {ok, error?}`
  - `extrasDeOT(ot): Array<{i: number|null, k, d: Item, padre: string}>`
  - `movimientosDeExtras(ot, usuario, hoy): Movimiento[]`
  - `armarHijosExtra(ot, fichaDe, existentes): Lote[]`, con `fichaDe(loteTexto) => ficha | null`
  - `nombreExtra(d): string` (`'T 214'`)

- [ ] **Step 1: Write the failing test**

```js
/* Tests de ot-destinos.js: tanques destino extra de una OT de trasiego
 * (spec 2026-11-12-ot-varios-destinos-design.md). Modulo puro. */
import { describe, it, expect } from 'vitest';
import { admiteExtras, normalizarExtras, asignarLotesExtra, validarExtras, extrasDeOT,
         movimientosDeExtras, armarHijosExtra, nombreExtra } from '../public/lotes/js/ot-destinos.js';

const PADRON = [{ num: '214', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: 'tanque-75hl', activa: true },
                { num: '212', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: 'tanque-75hl', activa: true }];
const LOTES = [{ lote: 26217 }, { lote: 26329 }];

describe('admiteExtras', () => {
  it('solo las plantillas de trasiego con tanque o barricas de destino', () => {
    for (const p of ['barricas-barricas', 'tq-barricas', 'barrica-tanque', 'tq-tq', 'barricas-tanque']) expect(admiteExtras(p)).toBe(true);
    for (const p of ['corte-achique', 'traslado', 'muestras-ot', 'xx']) expect(admiteExtras(p)).toBe(false);
  });
});

describe('normalizarExtras', () => {
  it('limpia, saca la T, vacia litros a null y da mov_id sin repetir', () => {
    const r = normalizarExtras([{ num: 'T 214', litros: '3000', lote: ' 26330 ' }, { num: '212', litros: '', lote: '26331', mov_id: 'ot-1-x0-0' }], 'ot-1', 'x0');
    expect(r).toEqual([
      { tipo: 'tanque', num: '214', litros: 3000, lote: '26330', nuevo: true, mov_id: 'ot-1-x0-1' },
      { tipo: 'tanque', num: '212', litros: null, lote: '26331', nuevo: true, mov_id: 'ot-1-x0-0' },
    ]);
  });
  it('sin filas o filas sin numero: lista vacia', () => {
    expect(normalizarExtras(null, 'ot-1', 'x0')).toEqual([]);
    expect(normalizarExtras([{ num: '', lote: '' }], 'ot-1', 'x0')).toEqual([]);
  });
});

describe('asignarLotesExtra', () => {
  it('propone el siguiente libre del año sin repetir y respeta lo escrito', () => {
    const r = asignarLotesExtra([{ num: '214' }, { num: '212', lote: '26340' }, { num: '213' }], { lotes: LOTES, anio: 2026, reservados: [] });
    expect(r.map(d => d.lote)).toEqual(['26330', '26340', '26341']);
  });
  it('no usa un numero reservado (hijos de otro lote de la misma OT)', () => {
    const r = asignarLotesExtra([{ num: '214' }], { lotes: LOTES, anio: 2026, reservados: ['26330'] });
    expect(r[0].lote).toBe('26331');
  });
});

describe('validarExtras', () => {
  const ctx = { lotes: LOTES, padron: PADRON, origenes: ['26217'], loteCorte: '', destino1: 'T 212', propios: new Set() };
  it('ok con tanque y lote libres', () => {
    expect(validarExtras([{ num: '214', lote: '26330' }], ctx)).toEqual({ ok: true });
  });
  it('lista vacia es valida (OT de un solo destino)', () => {
    expect(validarExtras([], ctx)).toEqual({ ok: true });
  });
  it('falta el tanque', () => {
    expect(validarExtras([{ num: '', lote: '26330' }], ctx).error).toBe('Falta el número de un tanque destino extra.');
  });
  it('tanque igual al destino 1', () => {
    expect(validarExtras([{ num: '212', lote: '26330' }], ctx).error).toBe('El T 212 ya es el destino de la OT.');
  });
  it('tanque repetido', () => {
    expect(validarExtras([{ num: '214', lote: '26330' }, { num: 'T 214', lote: '26331' }], ctx).error).toBe('El T 214 está dos veces.');
  });
  it('lote repetido, de origen, del corte u ocupado', () => {
    expect(validarExtras([{ num: '214', lote: '26330' }, { num: '213', lote: '26330' }], ctx).error).toBe('El lote 26330 está repetido en los destinos.');
    expect(validarExtras([{ num: '214', lote: '26217' }], ctx).error).toBe('El lote 26217 es uno de los lotes de origen.');
    expect(validarExtras([{ num: '214', lote: '26400' }], { ...ctx, loteCorte: '26400' }).error).toBe('El lote 26400 es el lote del corte.');
    expect(validarExtras([{ num: '214', lote: '26329' }], ctx).ok).toBe(false);
  });
  it('un hijo que esta misma OT ya creo no cuenta como ocupado', () => {
    expect(validarExtras([{ num: '214', lote: '26329' }], { ...ctx, propios: new Set(['26329']) })).toEqual({ ok: true });
  });
  it('litros escritos tienen que ser mas que 0', () => {
    expect(validarExtras([{ num: '214', lote: '26330', litros: '0' }], ctx).error).toBe('Los litros del T 214 tienen que ser más que 0.');
  });
});

const D = (num, lote, extra = {}) => ({ tipo: 'tanque', num, litros: null, lote, nuevo: true, mov_id: `m-${num}`, ...extra });

describe('extrasDeOT y movimientos', () => {
  const simple = { id: 'ot-1', ot: '0990', fecha: '2026-11-12', destino: 'T 212', lote_corte: null,
    lotes: [{ lote: '26217', destinos_extra: [D('214', '26330', { litros: 3000 })] }, { lote: '26105' }] };
  const corte = { id: 'ot-2', ot: '0991', fecha: '2026-11-12', destino: 'T 201', lote_corte: { lote: '26400' },
    lotes: [{ lote: '26217' }], destinos_extra: [D('214', '26401')] };

  it('trasiego simple: cada extra con su lote padre', () => {
    expect(extrasDeOT(simple).map(x => [x.i, x.k, x.padre, x.d.lote])).toEqual([[0, 0, '26217', '26330']]);
  });
  it('corte: los extra son hijos del lote del corte', () => {
    expect(extrasDeOT(corte).map(x => [x.i, x.k, x.padre, x.d.lote])).toEqual([[null, 0, '26400', '26401']]);
  });
  it('OT sin extras: lista vacia', () => {
    expect(extrasDeOT({ lotes: [{ lote: '1' }] })).toEqual([]);
  });
  it('un traspaso pendiente padre -> hijo por extra', () => {
    const [m] = movimientosDeExtras(simple, 'ana', '2026-11-12');
    expect(m).toMatchObject({ id: 'm-214', lote: '26217', tipo: 'traspaso', vasija_origen: 'T 212',
      vasija_destino: 'T 214', litros: 3000, lote_destino: '26330', estado: 'PENDIENTE', ot: '0990', cargado_por: 'ana' });
  });
  it('nombreExtra', () => { expect(nombreExtra(D('214', 'x'))).toBe('T 214'); });
});

describe('armarHijosExtra', () => {
  it('copia la ficha del padre, sin litros ni vasija, y no repite existentes', () => {
    const ot = { lotes: [{ lote: '26217', destinos_extra: [D('214', '26330'), D('213', '26217')] }] };
    const ficha = { lote: 26217, variedad: 'Malbec', anio: 2026, id_texto: 'MB Alto', cap225: 12, litros_actuales: 2700, vasija_actual: 'T 212' };
    const hijos = armarHijosExtra(ot, l => (String(l) === '26217' ? ficha : null), [{ lote: 26217 }]);
    expect(hijos).toHaveLength(1);
    expect(hijos[0]).toMatchObject({ lote: 26330, variedad: 'Malbec', vasija_actual: '' });
    expect(hijos[0].cap225 ?? null).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 test/lotes-ot-destinos.test.mjs`
Expected: FAIL. No resuelve `../public/lotes/js/ot-destinos.js`.

- [ ] **Step 3: Write minimal implementation**

`public/lotes/js/ot-destinos.js`:

```js
/* ===== Lotes CIW — tanques destino extra de una OT de trasiego (puro) =====
 *
 * Cuando por los litros el vino no entra en el destino de la OT (ot.destino),
 * se agregan tanques extra. Cada tanque extra es SIEMPRE un lote nuevo, hijo
 * del lote que lo llena (decision del usuario 2026-11-12): asi cada tanque
 * tiene sus litros exactos y nunca hay un lote repartido en dos tanques.
 *   - trasiego simple: ot.lotes[i].destinos_extra (cada lote a sus tanques);
 *   - Corte: ot.destinos_extra (hijos del lote del corte).
 * El item tiene la forma de un tanque del achique (ot-achique.js):
 *   { tipo: 'tanque', num, litros, lote, nuevo: true, mov_id }
 * Cada extra tiene un traspaso padre -> hijo, que arma el linaje. */
'use strict';

import { siguienteLote, validarNumeroLote, armarHijo } from './lote-nuevo.js';
import { nombreTanque } from './ot-vasijas.js';
import { normalizarNumVasija } from './vasijas-padron.js';
import { PENDIENTE } from './ot-movimientos.js';

const txt = v => String(v ?? '').trim();
const sinT = num => txt(num).replace(/^t\s*/i, '');
const numONull = x => {
  if (x === '' || x == null) return null;
  const v = Number(String(x).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

const PLANTILLAS = new Set(['barricas-barricas', 'tq-barricas', 'barrica-tanque', 'tq-tq', 'barricas-tanque']);
export const admiteExtras = id => PLANTILLAS.has(id);

export const nombreExtra = d => nombreTanque(sinT(d && d.num));

/* Lo que se guarda: filas con numero de tanque, sin la "T", litros numericos
 * o null, y un mov_id por fila (conserva el que ya tenia, para editar). */
export function normalizarExtras(lista, otId, prefijo){
  const ds = (lista || []).filter(d => d && sinT(d.num));
  const usados = new Set(ds.map(d => d.mov_id).filter(Boolean));
  let k = 0;
  const nuevoId = () => { let id; do { id = `${otId}-${prefijo}-${k++}`; } while (usados.has(id)); usados.add(id); return id; };
  return ds.map(d => ({ tipo: 'tanque', num: sinT(d.num), litros: numONull(d.litros), lote: txt(d.lote),
    nuevo: true, mov_id: d.mov_id || nuevoId() }));
}

/* Pone el lote a los que no tienen: el siguiente libre del año, sin chocar con
 * los lotes existentes, con lo ya escrito ni con `reservados` (los hijos de
 * otros lotes de la misma OT). Devuelve una copia. */
export function asignarLotesExtra(lista, { lotes, anio, reservados }){
  const tomados = new Set([...(lotes || []).map(l => txt(l && l.lote)), ...(reservados || []).map(txt)]);
  for (const d of lista || []) if (txt(d.lote)) tomados.add(txt(d.lote));
  return (lista || []).map(d => {
    let lote = txt(d.lote);
    if (!lote){ lote = siguienteLote([...tomados].map(x => ({ lote: x })), anio); tomados.add(lote); }
    return { ...d, lote };
  });
}

/* `propios` = hijos que esta misma OT ya creo (al editar): estan en Lotes pero
 * no son un numero ocupado. `destino1` = ot.destino. */
export function validarExtras(lista, { lotes, padron, origenes, loteCorte, destino1, propios } = {}){
  const no = error => ({ ok: false, error });
  const d1 = txt(destino1) ? normalizarNumVasija(destino1) : '';
  const tanques = new Set(), vistos = new Set();
  for (const d of lista || []){
    if (!sinT(d.num)) return no('Falta el número de un tanque destino extra.');
    const n = normalizarNumVasija(d.num);
    const nombre = nombreExtra(d);
    if (d1 && n === d1) return no(`El ${nombre} ya es el destino de la OT.`);
    if (tanques.has(n)) return no(`El ${nombre} está dos veces.`);
    tanques.add(n);
    const l = numONull(d.litros);
    if (l != null && l <= 0) return no(`Los litros del ${nombre} tienen que ser más que 0.`);
    const t = txt(d.lote);
    if (!t) return no(`Falta el lote del ${nombre}.`);
    if (vistos.has(t)) return no(`El lote ${t} está repetido en los destinos.`);
    vistos.add(t);
    if (txt(loteCorte) && t === txt(loteCorte)) return no(`El lote ${t} es el lote del corte.`);
    if ((origenes || []).some(o => txt(o) === t)) return no(`El lote ${t} es uno de los lotes de origen.`);
    if (!(propios && propios.has(t))){
      const v = validarNumeroLote(t, lotes || []);
      if (!v.ok) return no(v.error);
    }
  }
  return { ok: true };
}

/* Todos los extra de la OT con su lote padre. i = indice del lote (null en el Corte). */
export function extrasDeOT(ot){
  if (!ot) return [];
  const out = [];
  const corte = ot.lote_corte && txt(ot.lote_corte.lote);
  if (corte) (ot.destinos_extra || []).forEach((d, k) => out.push({ i: null, k, d, padre: corte }));
  else (ot.lotes || []).forEach((l, i) => (l.destinos_extra || []).forEach((d, k) => out.push({ i, k, d, padre: txt(l.lote) })));
  return out;
}

export function movimientosDeExtras(ot, usuario, hoy){
  return extrasDeOT(ot).map(({ d, padre }) => ({
    id: d.mov_id, lote: padre, tipo: 'traspaso', fecha: ot.fecha,
    vasija_origen: ot.destino || '', vasija_destino: nombreExtra(d), litros: d.litros,
    lote_destino: txt(d.lote), destino_externo: '', estado: PENDIENTE, ot: ot.ot,
    operario: '', comentario: '', cargado_por: usuario || '', cargado_el: hoy,
  }));
}

/* Lotes hijos a crear: copia de la ficha del padre (armarHijo: sin litros ni
 * envases), en 0 L y sin vasija, con el numero del extra; los que ya estan en
 * `existentes` no se repiten. */
export function armarHijosExtra(ot, fichaDe, existentes){
  const hay = new Set((existentes || []).map(l => txt(l && l.lote)));
  const out = [];
  for (const { d, padre } of extrasDeOT(ot)){
    const t = txt(d.lote);
    if (!t || hay.has(t)) continue;
    hay.add(t);
    const h = armarHijo(fichaDe(padre) || {});
    const n = Number(t);
    h.lote = Number.isFinite(n) ? n : t;
    h.vasija_actual = '';
    out.push(h);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --maxWorkers=2 test/lotes-ot-destinos.test.mjs`
Expected: PASS. Si falla `asignarLotesExtra` por cómo `siguienteLote` arma el número (AANNN), leer `lote-nuevo.js:65` y ajustar **el test** al formato real, nunca al revés. `armarHijo` puede no limpiar `cap225`: si el test de `armarHijosExtra` falla por eso, limpiar en el módulo los campos de `CAMPOS_ENVASE` y `litros_actuales`, igual que hace `armarLotesHijos` del achique.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/ot-destinos.js test/lotes-ot-destinos.test.mjs
git commit -m "feat(lotes): ot-destinos.js — tanques destino extra de una OT (modelo, lotes, validacion, movimientos)"
```

---

### Task 2: Armado, movimientos, confirmación y listas que leen los extra

**Files:**
- Modify: `public/lotes/js/ot-armado.js` (`armarOT` 64-106, `movimientosDeOT` 111-137, `confirmarOT` 153-197)
- Modify: `public/lotes/js/ot-achique.js` (`movIdsDeOT` 233, `textoDestinos` 236, `lotesCreadosPorOT` 240)
- Modify: `public/lotes/js/ot-lista.js` (`filtrarOrdenes`, búsqueda por lote)
- Modify: `public/lotes/js/inventario-tanques.js` (`otsPorVasija` ~103)
- Test: `test/lotes-ot-armado.test.mjs`, `test/lotes-ot-lista.test.mjs`, `test/lotes-inventario-tanques.test.mjs`

**Interfaces:**
- Consumes: `normalizarExtras`, `movimientosDeExtras`, `extrasDeOT`, `nombreExtra` (Task 1).
- Produces:
  - `armarOT({..., destinos_extra})`. `destinos_extra` es la lista del Corte; las de cada lote vienen en `lotes[i].destinos_extra`.
  - `confirmarOT(ot, movs, reales)` lee `reales.extras = [{i, k, destino_real, litros_reales, merma_litros}]`.
  - `movIdsDeOT` / `lotesCreadosPorOT` / `textoDestinos` incluyen los extra.

- [ ] **Step 1: Write the failing tests** (agregar al final de `test/lotes-ot-armado.test.mjs`; si ya importa `armarOT, movimientosDeOT, confirmarOT`, reusar esos imports)

```js
import { movIdsDeOT, lotesCreadosPorOT, textoDestinos } from '../public/lotes/js/ot-achique.js';

describe('destinos extra (2026-11-12)', () => {
  const base = { id: 'ot-9', numero: '0990', plantilla: 'tq-tq', fecha: '2026-11-12', destino: 'T 212', emitio: 'Roy',
    usuario: 'ana', hoy: '2026-11-12' };
  const lote = (extra = {}) => ({ lote: '26217', id_texto: 'MB', barriles: [], tanques: [{ num: '189', litros: 4000 }], otras: [], litros_previstos: 4000, ...extra });

  it('sin extras la OT y sus movimientos quedan como antes (sin campo destinos_extra)', () => {
    const ot = armarOT({ ...base, lotes: [lote()] });
    expect('destinos_extra' in ot.lotes[0]).toBe(false);
    expect('destinos_extra' in ot).toBe(false);
    expect(movimientosDeOT(ot, 'ana', '2026-11-12')).toHaveLength(1);
  });
  it('guarda los extra del lote y suma un traspaso padre -> hijo', () => {
    const ot = armarOT({ ...base, lotes: [lote({ destinos_extra: [{ num: 'T 214', litros: '1500', lote: '26330' }] })] });
    expect(ot.lotes[0].destinos_extra).toEqual([{ tipo: 'tanque', num: '214', litros: 1500, lote: '26330', nuevo: true, mov_id: 'ot-9-x0-0' }]);
    const movs = movimientosDeOT(ot, 'ana', '2026-11-12');
    expect(movs.map(m => [m.tipo, m.lote, m.lote_destino, m.vasija_destino])).toEqual([
      ['trasiego', '26217', '', 'T 212'], ['traspaso', '26217', '26330', 'T 214']]);
    expect(movIdsDeOT(ot)).toEqual(['ot-9-0', 'ot-9-x0-0']);
    expect(lotesCreadosPorOT(ot)).toEqual(['26330']);
    expect(textoDestinos(ot)).toBe('T 212 + T 214');
  });
  it('corte: los extra van en la OT y son hijos del lote del corte', () => {
    const ot = armarOT({ ...base, plantilla: 'barricas-tanque', destino: 'T 201', lote_corte: { lote: '26400', id_texto: 'Corte' },
      lotes: [lote()], destinos_extra: [{ num: '214', lote: '26401' }] });
    const movs = movimientosDeOT(ot, 'ana', '2026-11-12');
    expect(movs.at(-1)).toMatchObject({ tipo: 'traspaso', lote: '26400', lote_destino: '26401', vasija_destino: 'T 214' });
    expect(lotesCreadosPorOT(ot)).toEqual(['26400', '26401']);
  });
  it('confirmarOT pasa a EJECUTADO el traspaso del extra con sus litros y su merma', () => {
    const ot = armarOT({ ...base, lotes: [lote({ destinos_extra: [{ num: '214', lote: '26330' }] })] });
    const movs = movimientosDeOT(ot, 'ana', '2026-11-12');
    confirmarOT(ot, movs, { operario: 'Juan', por_lote: [{ destino_real: 'T 212', litros_reales: 2400, merma_litros: 20 }],
      extras: [{ i: 0, k: 0, destino_real: 'T 214', litros_reales: 1550, merma_litros: 30 }] }, 'ana', '2026-11-13');
    const d = ot.lotes[0].destinos_extra[0];
    expect([d.destino_real, d.litros_reales, d.merma_litros]).toEqual(['T 214', 1550, 30]);
    expect(movs[1]).toMatchObject({ estado: 'EJECUTADO', litros: 1550, merma_litros: 30, vasija_destino: 'T 214', operario: 'Juan' });
  });
});
```

En `test/lotes-ot-lista.test.mjs`:

```js
it('busca tambien por el lote de un tanque extra', () => {
  const ot = { id: 'a', ot: '0990', fecha: '2026-11-12', estado: 'PENDIENTE', lotes: [{ lote: '26217', mov_id: 'm', destinos_extra: [{ num: '214', lote: '26330', mov_id: 'x' }] }] };
  expect(filtrarOrdenes([ot], { busca: '26330' })).toHaveLength(1);
});
```

En `test/lotes-inventario-tanques.test.mjs`, buscar el test existente de "en trasiego" con achique, copiar su armado y agregar:

```js
it('un tanque extra de una OT pendiente figura en trasiego', () => {
  // mismo armado que el test de achique de este archivo, pero con
  // ot.lotes[0].destinos_extra = [{ tipo: 'tanque', num: '214', lote: '26330', mov_id: 'x' }]
  // y esperar que el T 214 tenga la OT '0990'.
});
```

El implementador completa este test **con el helper real del archivo**: abrirlo, ubicar cómo se llama a `otsPorVasija` (o a la función exportada que lo usa) y repetir esa forma. No dejar el test vacío.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 test/lotes-ot-armado.test.mjs test/lotes-ot-lista.test.mjs test/lotes-inventario-tanques.test.mjs`
Expected: FAIL en los tests nuevos (`destinos_extra` undefined, falta el movimiento extra).

- [ ] **Step 3: Implement**

`ot-armado.js`:
- Import: `import { normalizarExtras, movimientosDeExtras, extrasDeOT } from './ot-destinos.js';`
- En `armarOT`, firma `armarOT({ ..., achique, destinos_extra, ... })`. Dentro del `map` de lotes, después de `mov_id`, el objeto se arma en una variable `out` y se agrega:

```js
      const extras = normalizarExtras(l.destinos_extra, id, `x${i}`);
      if (extras.length) out.destinos_extra = extras;
      return out;
```

  Para eso, convertir el `return { lote: ..., mov_id: ... }` actual en `const out = { ... };`. Antes del `return` final de `armarOT`, igual: `const ot = { ... }; const ex = ot.lote_corte ? normalizarExtras(destinos_extra, id, 'xc') : []; if (ex.length) ot.destinos_extra = ex; return ot;`.
- En `movimientosDeOT`: `return movs.concat(movimientosDeAchique(ot, usuario, hoy), movimientosDeExtras(ot, usuario, hoy));`
- En `confirmarOT`, después del bloque del achique:

```js
  // Tanques destino extra: cada uno con lo medido y su propia merma.
  for (const r of reales.extras || []){
    const d = r.i == null ? (ot.destinos_extra || [])[r.k] : (((ot.lotes || [])[r.i] || {}).destinos_extra || [])[r.k];
    if (!d) continue;
    d.destino_real = String(r.destino_real || '').trim();
    d.litros_reales = r.litros_reales ?? null;
    d.merma_litros = r.merma_litros ?? null;
    const m = porId.get(d.mov_id);
    if (!m){ faltan.push(d.mov_id); continue; }
    m.vasija_destino = d.destino_real || ('T ' + d.num);
    m.litros = d.litros_reales;
    m.merma_litros = d.merma_litros;
    m.operario = reales.operario;
    m.estado = EJECUTADO;
  }
```

`ot-achique.js` (import `extrasDeOT, nombreExtra` de `./ot-destinos.js`; ot-destinos no importa ot-achique, así que no hay ciclo):

```js
export const movIdsDeOT = ot => [...((ot && ot.lotes) || []).map(l => l.mov_id),
  ...destinosDe(ot).map(d => d.mov_id).filter(Boolean), ...extrasDeOT(ot).map(x => x.d.mov_id).filter(Boolean)];

/* Achique: sus vasijas. Con tanques extra: el destino de la OT y los extra. */
export const textoDestinos = ot => {
  const ex = extrasDeOT(ot);
  if (!ex.length) return destinosDe(ot).map(nombreDestino).join(' + ');
  return [String((ot && ot.destino) || '').trim(), ...ex.map(x => nombreExtra(x.d))].filter(Boolean).join(' + ');
};
```

  En `lotesCreadosPorOT`, antes del `return`: `for (const x of extrasDeOT(ot)) if (txt(x.d.lote)) out.push(txt(x.d.lote));`

`ot-lista.js`:
- en `filtrarOrdenes`, agregar a la búsqueda `|| extrasDeOT(ot).some(x => String(x.d.lote || '').toLowerCase().includes(q))`, con el import de `./ot-destinos.js`;
- en `resumenLotes`, si `!ot.lote_corte` y `extrasDeOT(ot).length`, agregar al final `' → ' + textoDestinos(ot)`.

`inventario-tanques.js`, en `otsPorVasija`, después del bloque del achique:

```js
    // Tanques destino extra de un trasiego o de un Corte.
    for (const x of extrasDeOT(ot)) for (const n of partesVasija('T ' + x.d.num)) anotar(n, ot);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run --maxWorkers=2 test/lotes-ot-armado.test.mjs test/lotes-ot-lista.test.mjs test/lotes-inventario-tanques.test.mjs test/lotes-ot-achique.test.mjs test/lotes-ot-renumerar.test.mjs`
Expected: PASS, incluidos los tests viejos.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/ot-armado.js public/lotes/js/ot-achique.js public/lotes/js/ot-lista.js public/lotes/js/inventario-tanques.js test/lotes-ot-armado.test.mjs test/lotes-ot-lista.test.mjs test/lotes-inventario-tanques.test.mjs
git commit -m "feat(lotes): la OT guarda tanques destino extra, con traspaso padre->hijo y confirmacion por tanque"
```

---

### Task 3: Propuesta al confirmar — un item por tanque extra y merma por tanque

**Files:**
- Modify: `public/lotes/js/propuesta-ot.js` (`esItemCorte` ~33, `proponer` 495-722, `aplicarPropuesta` 758-800)
- Test: `test/lotes-propuesta-ot.test.mjs`

**Interfaces:**
- Consumes: `extrasDeOT` (Task 1), la forma guardada por Task 2.
- Produces:
  - **Entradas:** `entradas.por_lote[i].extras[k] = {vasija, cm, litros_manual, merma}`, `entradas.por_lote[i].merma` (destino 1 a mano; `''` = automático) y `entradas.extras[k]` en el Corte.
  - **Items:** `{lote: hijo, indice: null, extra: {i, k}, antes, despues, litros_llegados, merma_litros, bloqueado, avisos, ...}`.
  - `esItemCorte(it)` es falso para los items `extra`.
  - `aplicarPropuesta` guarda `aplicado` en el item `destinos_extra` correspondiente.

- [ ] **Step 1: Write the failing tests** (al final de `test/lotes-propuesta-ot.test.mjs`)

```js
describe('tanques destino extra (2026-11-12)', () => {
  const PAD = [{ num: '212', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: null, activa: true },
               { num: '214', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: null, activa: true },
               { num: '189', tipo: 'TANQUE AC.INOX.', cap_real: 4200, tabla: null, activa: true }];
  const lotes = () => [
    { lote: 26217, vasija_grande: 4000, vasija_actual: 'T 189', litros_actuales: 4000 },
    { lote: 26330, vasija_actual: '', litros_actuales: 0 }];
  const ot = (dx = {}) => ({ id: 'ot-9', ot: '0990', plantilla: 'tq-tq', fecha: '2026-11-12', destino: 'T 212', lote_corte: null,
    lotes: [{ lote: '26217', tanques: [{ num: '189', litros: 4000 }], barriles: [], otras: [], litros_previstos: 4000, mov_id: 'ot-9-0',
      destinos_extra: [{ tipo: 'tanque', num: '214', litros: 1600, lote: '26330', nuevo: true, mov_id: 'ot-9-x0-0', ...dx }] }] });
  const ent = (e = {}, x = {}) => ({ por_lote: [{ vasija: 'T 212', cm: '', litros_manual: 2380, merma: '', ...e,
    extras: [{ vasija: 'T 214', cm: '', litros_manual: 1580, merma: '', ...x }] }], corte: null });

  it('un item por extra: el hijo recibe lo medido en su tanque', () => {
    const p = proponer({ ot: ot(), lotes: lotes(), mermas: [], padron: PAD, entradas: ent(), hoy: '2026-11-12' });
    const h = p.items.find(x => x.extra);
    expect(h).toMatchObject({ lote: '26330', extra: { i: 0, k: 0 }, litros_llegados: 1580 });
    expect(h.despues).toMatchObject({ vasija_grande: 1580, vasija_actual: 'T 214' });
  });
  it('merma del extra = previstos - medidos; la del destino 1 cierra la cuenta', () => {
    const p = proponer({ ot: ot(), lotes: lotes(), mermas: [], padron: PAD, entradas: ent(), hoy: '2026-11-12' });
    const o = p.items.find(x => x.indice === 0), h = p.items.find(x => x.extra);
    expect(h.merma_litros).toBe(20);              // 1600 - 1580
    expect(o.merma_litros).toBe(20);              // 4000 - 2380 - (1580 + 20)
    expect(o.despues.vasija_grande).toBe(2380);   // el origen se vacio y recibio solo el destino 1
  });
  it('extra sin previstos: merma 0 salvo que se escriba', () => {
    const sin = proponer({ ot: ot({ litros: null }), lotes: lotes(), mermas: [], padron: PAD, entradas: ent(), hoy: 'x' });
    expect(sin.items.find(x => x.extra).merma_litros).toBe(0);
    const con = proponer({ ot: ot({ litros: null }), lotes: lotes(), mermas: [], padron: PAD, entradas: ent({}, { merma: '35' }), hoy: 'x' });
    expect(con.items.find(x => x.extra).merma_litros).toBe(35);
  });
  it('la merma del destino 1 escrita a mano manda', () => {
    const p = proponer({ ot: ot(), lotes: lotes(), mermas: [], padron: PAD, entradas: ent({ merma: '12' }), hoy: 'x' });
    expect(p.items.find(x => x.indice === 0).merma_litros).toBe(12);
  });
  it('si el extra esta bloqueado (sin litros) el lote de origen tampoco se aplica', () => {
    const p = proponer({ ot: ot(), lotes: lotes(), mermas: [], padron: PAD, entradas: ent({}, { litros_manual: '' }), hoy: 'x' });
    expect(p.items.find(x => x.extra).bloqueado).toBe(true);
    expect(p.items.find(x => x.indice === 0).bloqueado).toBe(true);
  });
  it('esItemCorte no confunde un extra con el lote del corte', () => {
    expect(esItemCorte({ indice: null, hijo: undefined, extra: { i: 0, k: 0 } })).toBe(false);
  });
  it('aplicarPropuesta: aplicado en el item del extra y el hijo con sus litros', () => {
    const datos = { lotes: lotes(), mermas: [] };
    const o = ot();
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PAD, entradas: ent(), hoy: 'x' });
    aplicarPropuesta(datos, o, p, new Set(['26217', '26330']), 'ana', '2026-11-12');
    expect(o.lotes[0].destinos_extra[0].aplicado).toBeTruthy();
    expect(datos.lotes[1]).toMatchObject({ vasija_grande: 1580, vasija_actual: 'T 214', litros_actuales: 1580 });
  });
  it('aplicarPropuesta: sin el check del hijo no se aplica ni el origen (todo o nada por lote)', () => {
    const datos = { lotes: lotes(), mermas: [] };
    const o = ot();
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PAD, entradas: ent(), hoy: 'x' });
    aplicarPropuesta(datos, o, p, new Set(['26217']), 'ana', 'x');
    expect(datos.lotes[0].vasija_grande).toBe(4000);
    expect(o.lotes[0].aplicado).toBe(null);
  });
  it('sin extras la propuesta es la de siempre', () => {
    const o = ot(); delete o.lotes[0].destinos_extra;
    const p = proponer({ ot: o, lotes: lotes(), mermas: [], padron: PAD, hoy: 'x',
      entradas: { por_lote: [{ vasija: 'T 212', cm: '', litros_manual: 3980 }], corte: null } });
    expect(p.items).toHaveLength(1);
    expect(p.items[0].merma_litros).toBe(20);
  });
  it('corte con extra: el hijo recibe lo suyo y la merma de los origenes es la del tanque base', () => {
    const datos = { lotes: [...lotes(), { lote: 26400, vasija_actual: '', litros_actuales: 0 }] };
    const o = { id: 'ot-c', ot: '0991', plantilla: 'barricas-tanque', fecha: 'x', destino: 'T 212', lote_corte: { lote: '26400' },
      lotes: [{ lote: '26217', tanques: [{ num: '189', litros: 4000 }], barriles: [], otras: [], litros_previstos: 4000, mov_id: 'ot-c-0' }],
      destinos_extra: [{ tipo: 'tanque', num: '214', litros: 1600, lote: '26330', nuevo: true, mov_id: 'ot-c-xc-0' }] };
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PAD, hoy: 'x',
      entradas: { por_lote: [{}], corte: { vasija: 'T 212', cm: '', litros_manual: 2380 }, extras: [{ vasija: 'T 214', cm: '', litros_manual: 1580, merma: '' }] } });
    const h = p.items.find(x => x.extra);
    expect(h).toMatchObject({ lote: '26330', extra: { i: null, k: 0 }, litros_llegados: 1580, merma_litros: 20 });
    expect(p.items.find(x => x.indice === 0).merma_litros).toBe(20);   // 4000 - 2380 - (1580 + 20)
  });
});
```

Agregar `esItemCorte` al import de `propuesta-ot.js` en ese archivo si no estaba.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 test/lotes-propuesta-ot.test.mjs`
Expected: FAIL. No hay items `extra`.

- [ ] **Step 3: Implement** en `propuesta-ot.js`

1. Import: `import { extrasDeOT, nombreExtra } from './ot-destinos.js';`
2. `export const esItemCorte = it => it.indice == null && it.hijo == null && it.extra == null;`
3. Helper nuevo, arriba de `proponer`:

```js
/* Un tanque destino extra: lote hijo que recibe lo medido en su tanque. La
 * merma es la escrita o, si no, previstos - medidos (0 sin previstos). */
function itemExtra(x, entrada, buscar, padron, mermas){
  const e = entrada || {};
  const ll = llenadoDeEntrada({ ...e, vasija: String(e.vasija ?? '').trim() || nombreExtra(x.d) }, 'tanque', padron);
  const lote = buscar(x.d.lote);
  const escrita = numONull(e.merma);
  const merma = escrita != null ? escrita
    : x.d.litros != null && ll.litros != null ? r1(x.d.litros - ll.litros) : 0;
  const extra = { i: x.i, k: x.k };
  if (!lote) return { lote: String(x.d.lote), indice: null, extra, antes: null, despues: null, mermas_nuevas: [],
    mermas_cerradas: [], litros_origen: null, litros_llegados: ll.litros, merma_litros: merma, litros_despues: null,
    avisos: [`El lote ${x.d.lote} no existe en la tabla de Lotes.`], bloqueado: true, revisar: false };
  const antesH = envasesDe(lote);
  const it = { lote: String(x.d.lote), indice: null, extra, antes: fotoLote(lote),
    despues: { ...sumar(antesH, ll.llenado), vasija_actual: ll.vasija_texto || nombreExtra(x.d) },
    mermas_nuevas: [], mermas_cerradas: [], litros_origen: null, litros_llegados: ll.litros,
    merma_litros: merma, litros_despues: null, avisos: [...ll.avisos], bloqueado: ll.bloqueado, revisar: false };
  if (merma < 0) it.avisos.push('Llegó más de lo que salió a este tanque.');
  recalcularItem(it, mermas);
  return it;
}
```

4. En `proponer`, después de `ot.lotes.forEach(...)` y **antes** de `if (corte){`:

```js
  // Tanques destino extra de un trasiego simple: un item por tanque; el
  // lote de origen se lleva el resto de la merma (o la escrita) y va entero
  // o nada con sus extra.
  const extras = extrasDeOT(ot);
  if (!corte && extras.length){
    for (const x of extras){
      const it = itemExtra(x, (((entradas.por_lote || [])[x.i] || {}).extras || [])[x.k], buscar, padron, mermas);
      items.push(it);
    }
    for (const o of items.filter(y => y.indice != null)){
      const suyos = items.filter(y => y.extra && y.extra.i === o.indice);
      if (!suyos.length) continue;
      const escrita = numONull(((entradas.por_lote || [])[o.indice] || {}).merma);
      const algunoSinLitros = suyos.some(y => y.litros_llegados == null);
      o.merma_litros = escrita != null ? escrita
        : o.litros_origen == null || o.litros_llegados == null || algunoSinLitros ? null
        : r1(o.litros_origen - o.litros_llegados - suyos.reduce((s, y) => s + y.litros_llegados + y.merma_litros, 0));
      if (suyos.some(y => y.bloqueado) && !o.bloqueado){ o.bloqueado = true; o.avisos.push('Un tanque destino extra no se puede aplicar: el lote va entero o nada.'); }
      if (o.bloqueado) for (const y of suyos) if (!y.bloqueado){ y.bloqueado = true; y.avisos.push('El lote de origen no se puede aplicar: su tanque extra tampoco.'); }
    }
  }
```

   Ojo: `o.merma_litros` ya lo calculó el `forEach` como `origen − llegados`. Acá se pisa solo si el lote tiene extras. El aviso viejo "Llegaron más litros…" puede quedar escrito con el valor viejo. Si `o.merma_litros >= 0`, quitarlo: `o.avisos = o.avisos.filter(a => !a.startsWith('Llegaron más litros'))`.
5. En la rama `if (corte){ ... }`:
   - Después de armar `hijos` del achique, sumar los extra: `const extrasItems = extras.map(x => itemExtra(x, (entradas.extras || [])[x.k], buscar, padron, mermas)); items.push(...extrasItems);`.
   - En el bloque I2(a): tratar los `extrasItems` igual que los `hijos`. La condición `else if (hijos.some(h => h.bloqueado))` pasa a ser `else if ([...hijos, ...extrasItems].some(h => h.bloqueado))`, y en el `for` el `x.hijo != null` pasa a ser `(x.hijo != null || x.extra)`.
   - En el reparto de la merma: `llegadosTotal` suma también `extrasItems` como `x.litros_llegados + x.merma_litros`. Si algún extra tiene `litros_llegados == null`, `llegadosTotal = null`.

```js
    const destinosItems = [corteItem, ...hijos];
    const llegadosTotal = destinosItems.some(x => x.litros_llegados == null) || extrasItems.some(x => x.litros_llegados == null) ? null
      : r1(destinosItems.reduce((s, x) => s + x.litros_llegados, 0) + extrasItems.reduce((s, x) => s + x.litros_llegados + x.merma_litros, 0));
```

6. En `aplicarPropuesta`:
   - La línea de `hijosAplicables` también filtra `x.extra != null`.
   - Antes del `for`, armar el todo o nada por lote del trasiego simple:

```js
  // Trasiego simple con extras: el lote de origen y sus tanques extra van juntos.
  const okItem = it => !it.bloqueado && !!it.despues && aplicar.has(it.lote);
  const loteEntero = new Map();
  for (const it of propuesta.items.filter(x => x.extra && x.extra.i != null)){
    const o = propuesta.items.find(y => y.indice === it.extra.i);
    const ok = (loteEntero.get(it.extra.i) ?? (o ? okItem(o) : false)) && okItem(it);
    loteEntero.set(it.extra.i, ok);
  }
```

   - En el `for`, el `destino`:

```js
    const destino = item.extra ? (item.extra.i == null ? (ot.destinos_extra || [])[item.extra.k]
        : ((ot.lotes[item.extra.i] || {}).destinos_extra || [])[item.extra.k])
      : item.indice != null ? ot.lotes[item.indice]
      : item.hijo != null ? ((ot.achique && ot.achique.destinos) || [])[item.hijo]
      : ot.lote_corte;
```

   - `seAplica` suma la condición `&& (item.extra ? (item.extra.i == null || loteEntero.get(item.extra.i)) : item.indice == null || !loteEntero.has(item.indice) || loteEntero.get(item.indice))`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run --maxWorkers=2 test/lotes-propuesta-ot.test.mjs test/lotes-ot-achique.test.mjs test/lotes-ot-vasijas.test.mjs test/lotes-ot-deshacer.test.mjs`
Expected: PASS. Si cambia algún número de un test viejo, el cambio rompió el caso "sin extras". Arreglar el código, no el test.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/propuesta-ot.js test/lotes-propuesta-ot.test.mjs
git commit -m "feat(lotes): confirmar OT propone cada tanque extra como lote hijo con su propia merma"
```

---

### Task 4: Deshacer al borrar una OT con extras

**Files:**
- Modify: `public/lotes/js/ot-deshacer.js` (`planDeshacer` 31-55)
- Test: `test/lotes-ot-deshacer.test.mjs`

**Interfaces:**
- Consumes: `extrasDeOT` (Task 1); `aplicado` en los items extra (Task 3).

- [ ] **Step 1: Write the failing test**

```js
describe('OT con tanque destino extra', () => {
  it('el origen y el hijo vuelven al antes', () => {
    const PAD = [{ num: '212', tipo: 'T', cap_real: 7500, tabla: null, activa: true }, { num: '214', tipo: 'T', cap_real: 7500, tabla: null, activa: true }];
    const datos = { mermas: [], lotes: [{ lote: 26217, vasija_grande: 4000, vasija_actual: 'T 189', litros_actuales: 4000 },
                                        { lote: 26330, vasija_actual: '', litros_actuales: 0 }] };
    const o = ot('tq-tq', [{ lote: '26217', tanques: [{ num: '189', litros: 4000 }], litros_previstos: 4000,
      destinos_extra: [{ tipo: 'tanque', num: '214', litros: 1600, lote: '26330', nuevo: true, mov_id: 'x' }] }], { destino: 'T 212' });
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PAD, hoy: 'x',
      entradas: { por_lote: [{ vasija: 'T 212', cm: '', litros_manual: 2380, merma: '', extras: [{ vasija: 'T 214', cm: '', litros_manual: 1580, merma: '' }] }], corte: null } });
    aplicarPropuesta(datos, o, p, new Set(['26217', '26330']), 'ana', 'x');
    const plan = planDeshacer(datos, o);
    expect(plan.items.map(i => [i.lote, i.accion])).toEqual([['26217', 'volver'], ['26330', 'volver']]);
    aplicarDeshacer(datos, plan);
    expect(datos.lotes[0].vasija_grande).toBe(4000);
    expect(datos.lotes[1]).toMatchObject({ litros_actuales: 0, vasija_actual: '' });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run --maxWorkers=2 test/lotes-ot-deshacer.test.mjs`. Expected: FAIL (solo vuelve 26217).

- [ ] **Step 3: Implement.** En `planDeshacer`, la lista que recibe `_unoPorLote` suma `...extrasDeOT(ot).map(x => x.d)`, con el import de `./ot-destinos.js`. En el comentario del encabezado, agregar que los hijos de los tanques extra de un Corte entran en la misma regla de "entero o nada".

- [ ] **Step 4: Run** `npx vitest run --maxWorkers=2 test/lotes-ot-deshacer.test.mjs`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/ot-deshacer.js test/lotes-ot-deshacer.test.mjs
git commit -m "feat(lotes): borrar y deshacer una OT tambien vuelve atras los lotes de los tanques extra"
```

---

### Task 5: Correcciones por vasija (panel + bitácora)

**Files:**
- Modify: `public/lotes/js/ot-correcciones.js` (`lotesACorregir` 20-28, `tanquePropuesto` 105-111)
- Modify: `public/lotes/js/so2-bitacora.js` (`aplicarCorreccion` 83-104)
- Modify: `public/lotes/js/vista-ot-correcciones.js` (tarjetas 47-78)
- Test: `test/lotes-ot-correcciones.test.mjs`, `test/lotes-so2-bitacora.test.mjs` (si no existe, usar el test que ya cubre `aplicarCorreccion`: `grep -l aplicarCorreccion test/`)

**Interfaces:**
- Consumes: `extrasDeOT`, `nombreExtra` (Task 1).
- Produces:
  - `lotesACorregir(ot)` devuelve `[{lote, id_texto, litros_previstos, vasija, extra}]`; `vasija` es `''` en los lotes sin extra y `'T 214'` en los extra.
  - `tanquePropuesto(padron, lote, ot, vasija?)` prueba primero `vasija`.

- [ ] **Step 1: Write the failing tests**

```js
describe('tanques destino extra', () => {
  const ot = { ot: '0990', plantilla: 'tq-tq', destino: 'T 212', lote_corte: null,
    lotes: [{ lote: '26217', id_texto: 'MB', litros_previstos: 4000,
      destinos_extra: [{ tipo: 'tanque', num: '214', litros: 1600, lote: '26330', mov_id: 'x' }] }] };
  it('una tarjeta por vasija: el lote en el destino y el hijo en su tanque', () => {
    expect(lotesACorregir(ot)).toEqual([
      { lote: '26217', id_texto: 'MB', litros_previstos: 4000, vasija: '', extra: false },
      { lote: '26330', id_texto: 'MB', litros_previstos: 1600, vasija: 'T 214', extra: true }]);
  });
  it('confirmada: el extra usa los litros reales', () => {
    const o = structuredClone(ot); o.lotes[0].destinos_extra[0].litros_reales = 1580;
    expect(lotesACorregir(o)[1].litros_previstos).toBe(1580);
  });
  it('agregado-corte: el lote del corte y cada hijo extra', () => {
    const c = { ot: '0991', plantilla: 'barricas-tanque', destino: 'T 201', lote_corte: { lote: '26400', id_texto: 'Corte' }, lotes: [],
      destinos_extra: [{ tipo: 'tanque', num: '214', litros: null, lote: '26401', mov_id: 'y' }] };
    expect(lotesACorregir(c).map(x => [x.lote, x.vasija])).toEqual([['26400', ''], ['26401', 'T 214']]);
  });
  it('tanquePropuesto prefiere la vasija de la tarjeta', () => {
    const PAD = [{ num: '214', tipo: 'T', cap_real: 7500, activa: true }, { num: '212', tipo: 'T', cap_real: 7500, activa: true }];
    expect(tanquePropuesto(PAD, { vasija_actual: '' }, ot, 'T 214')).toBe('214');
    expect(tanquePropuesto(PAD, { vasija_actual: '' }, ot)).toBe('212');
  });
});
```

El test de "sin extras" que ya existe para `lotesACorregir` va a fallar porque ahora cada entrada trae `vasija: ''` y `extra: false`. Actualizar **ese** test sumando esos dos campos. Es el único cambio permitido en tests viejos de esta tarea.

En el test de la bitácora:

```js
it('dos vasijas del mismo lote, misma fecha y OT, no se pisan', () => {
  const analisis = [];
  aplicarCorreccion(analisis, '26217', '2026-11-12', { ot_n: '0990', vasija: '212', dosis: 1 });
  aplicarCorreccion(analisis, '26217', '2026-11-12', { ot_n: '0990', vasija: '214', dosis: 2 });
  expect(analisis).toHaveLength(2);
  aplicarCorreccion(analisis, '26217', '2026-11-12', { ot_n: '0990', vasija: '214', dosis: 3 });
  expect(analisis).toHaveLength(2);
  expect(analisis[1].correccion.dosis).toBe(3);
});
```

Si `aplicarCorreccion` exige campos que no están en este objeto mínimo, construir la corrección con `armarCorreccion` como los otros tests del archivo.

- [ ] **Step 2: Run** `npx vitest run --maxWorkers=2 test/lotes-ot-correcciones.test.mjs` y el de la bitácora. Expected: FAIL.

- [ ] **Step 3: Implement**

`ot-correcciones.js`:

```js
export function lotesACorregir(ot){
  const tabla = bloquesDeOT(ot).find(b => b && b.tipo === 'tabla-correccion');
  if (!tabla) return [];
  const extras = extrasDeOT(ot).map(x => {
    const padre = x.i == null ? ot.lote_corte : ot.lotes[x.i];
    return { lote: _txt(x.d.lote), id_texto: (padre && padre.id_texto) || '',
      litros_previstos: x.d.litros_reales ?? x.d.litros ?? null, vasija: nombreExtra(x.d), extra: true };
  });
  if (tabla.modelo === 'agregado-corte' && ot.lote_corte && _txt(ot.lote_corte.lote)){
    return [{ lote: _txt(ot.lote_corte.lote), id_texto: ot.lote_corte.id_texto || '', vasija: '', extra: false }, ...extras];
  }
  return (ot.lotes || []).map(l => ({ lote: _txt(l.lote), id_texto: l.id_texto || '',
    litros_previstos: l.litros_previstos, vasija: '', extra: false })).concat(extras);
}
```

   Revisar el test viejo de `agregado-corte`: antes devolvía `{lote, id_texto}` sin `litros_previstos`. Mantener eso (sin `litros_previstos`) y sumar solo `vasija` y `extra`.

```js
export function tanquePropuesto(padron, lote, ot, vasija){
  for (const t of [vasija, lote && lote.vasija_actual, ot && ot.destino]){
```

`so2-bitacora.js`, en `aplicarCorreccion`:

```js
  const vasijaDe = c => String((c && c.vasija) ?? '').trim();
  const otraVasija = a => vasijaDe(correccion) !== '' && vasijaDe(a.correccion) !== '' && vasijaDe(a.correccion) !== vasijaDe(correccion);
  const existente =
    mismos.find(a => otNueva !== '' && a.correccion && !esAnulada(a.correccion) && _otDe(a.correccion) === otNueva && !otraVasija(a))
    || mismos.find(a => _pisable(a, correccion) && !otraVasija(a));
```

`vista-ot-correcciones.js`:
- `const tanque = tanquePropuesto(_padron(), lo, ot, l.vasija);`
- Si `l.extra`, los litros salen de `l.litros_previstos` antes que de `lo.litros_actuales`: `const litros = l.extra && l.litros_previstos != null ? l.litros_previstos : (lo && lo.litros_actuales != null ? lo.litros_actuales : (l.litros_previstos ?? ''));`
- En el título de la tarjeta, después del id_texto: `${l.vasija ? ' · ' + esc(l.vasija) : ''}`.

- [ ] **Step 4: Run** `npx vitest run --maxWorkers=2 test/lotes-ot-correcciones.test.mjs test/lotes-correcciones*.mjs` y el de la bitácora. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/ot-correcciones.js public/lotes/js/so2-bitacora.js public/lotes/js/vista-ot-correcciones.js test/
git commit -m "feat(lotes): correcciones de la OT por vasija: cada tanque extra con su tarjeta y su lote"
```

---

### Task 6: El papel — destino, corrección, agregado y llenado con los extra

**Files:**
- Modify: `public/lotes/js/ot-hojas.js` (`tablaVaciadoPorBarril` 84, `tablaVaciado` 147, `tablaAgregadoCorte` 174, `tablaCorreccion` 184, `tablaLlenadoDesdeTanque` 197, `tablaLlenado` 206, `rotular` 214)
- Test: `test/lotes-ot-hojas.test.mjs`

**Interfaces:**
- Consumes: `extrasDeOT`, `nombreExtra`.

- [ ] **Step 1: Write the failing tests** (nuevo `describe` en `test/lotes-ot-hojas.test.mjs`; usa `armarOT` y `H`, que ya importa el archivo en `beforeAll`)

```js
describe('tanques destino extra en el papel', () => {
  const armar = (plantilla, extra = {}) => armarOT({ id: 'ot-9', numero: '0990', plantilla, fecha: '2026-11-12', destino: 'T 212', emitio: '',
    lotes: [{ lote: '26217', id_texto: 'MB', barriles: [{ num: '11', cap: 225 }], tanques: [], otras: [], litros_previstos: 225,
      destinos_extra: [{ num: '214', litros: 100, lote: '26330' }] }], usuario: '', hoy: '', ...extra });
  it('tq-tq: la celda Destino nombra el destino y el extra con su lote', () => {
    const html = H.hojaOT(armar('tq-tq'));
    expect(html).toContain('T 212');
    expect(html).toContain('T 214 (lote 26330)');
  });
  it('barrica-tanque (por barril): el extra va en la celda con rowspan', () => {
    expect(H.hojaOT(armar('barrica-tanque'))).toContain('T 214 (lote 26330)');
  });
  it('correccion: filas TH2 y SO2 tambien para el lote del extra en su tanque', () => {
    const html = H.hojaOT(armar('tq-tq'));
    const filas = html.split('<tr>').filter(f => f.includes('26330') && (f.includes('TH2') || f.includes('SO2')));
    expect(filas).toHaveLength(2);
    expect(filas[0]).toContain('T 214');
  });
  it('corte: agregado del corte y del hijo extra', () => {
    const ot = armar('barricas-tanque', { lote_corte: { lote: '26400', id_texto: 'Corte' }, destinos_extra: [{ num: '214', lote: '26401' }] });
    const html = H.hojaOT(ot);
    expect(html.split('<tr>').filter(f => f.includes('26401') && f.includes('TH2'))).toHaveLength(1);
  });
  it('sin extras la hoja es identica a la de antes', () => {
    const sin = armar('tq-tq'); delete sin.lotes[0].destinos_extra;
    expect(H.hojaOT(sin)).not.toContain('(lote ');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run --maxWorkers=2 test/lotes-ot-hojas.test.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement** en `ot-hojas.js` (import de `./ot-destinos.js`):

```js
/* Tanques destino extra: "T 214 (lote 26330): ____", uno debajo del otro. */
const lineasExtra = xs => xs.map(x => `<br>${esc(nombreExtra(x.d))} (lote ${esc(x.d.lote)}): ________`).join('');
const extrasDeLote = (ot, l) => extrasDeOT(ot).filter(x => x.i != null && ot.lotes[x.i] === l);
```

- `tablaVaciado`: el `case 'destino'` pasa a `return lineaDestino(ot) + lineasExtra(extrasDeLote(ot, l));`.
- `tablaVaciadoPorBarril`: `const destino = (ot.destino ? ... : 'Tanque: ________') + lineasExtra(extrasDeOT(ot));`. Con extras, el destino 1 queda "T 212:<br><br>________" y abajo los extra.
- `tablaAgregadoCorte`: después de las filas del corte, agregar las de cada extra:

```js
  const extras = extrasDeOT(ot).flatMap(x => ['TH2', 'Solución SO2'].map(prod =>
    `<tr>${CHECK}<td>${esc(x.d.lote)}</td><td>1</td><td>${esc(nombreExtra(x.d))}</td><td>${prod}</td><td></td><td></td></tr>`)).join('');
```

  y `<tbody>${filas}${extras}</tbody>`.
- `tablaCorreccion`, por defecto: `ot.lotes.flatMap(l => [...filas del lote, ...extrasDeLote(ot, l).flatMap(x => ['TH2','SO2'].map(prod => fila con x.d.lote y nombreExtra(x.d)))])`.
- `tablaLlenadoDesdeTanque` y `tablaLlenado`: después de la fila de cada lote, una fila por extra. Vasija = `nombreExtra(x.d)`, CIW lote = `x.d.lote`, litros = `fmtL(x.d.litros)` y Destino = `nombreExtra(x.d)`. Repetir la forma de la fila existente con estos valores.
- `rotular(ot, de)`: cuando `de === 'corte'` o es la rama por defecto, agregar una línea por extra: `<div class="ot-paso"><span class="ot-caja">☐</span>Rotular vasija ID. <b class="ot-cel">${nombreExtra} · ${lote} ${id_texto del padre}</b></div>`.

- [ ] **Step 4: Run** `npx vitest run --maxWorkers=2 test/lotes-ot-hojas.test.mjs test/lotes-ot-bloques.test.mjs test/lotes-papel-intacto*.mjs`. Expected: PASS. Si `lotes-papel-intacto` no existe con ese nombre, `ls test | grep papel`.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/ot-hojas.js test/lotes-ot-hojas.test.mjs
git commit -m "feat(lotes): la hoja de la OT muestra los tanques extra en destino, correccion, agregado, llenado y rotulos"
```

---

### Task 7: Editar una OT pendiente con extras

**Files:**
- Modify: `public/lotes/js/ot-editar.js` (`firmaVasijas` 22, `firmaTodo` 29, `aplicarEdicionOT` 41-114)
- Test: `test/lotes-ot-editar.test.mjs`

**Interfaces:**
- Consumes: `normalizarExtras`, `extrasDeOT`.
- Produces: `aplicarEdicionOT(datos, ot, { lotes: [...con destinos_extra], destinos_extra })`. El resultado `r.hijosQuitados` incluye los hijos extra que se quitaron.

- [ ] **Step 1: Write the failing test**

```js
describe('tanques destino extra al editar', () => {
  it('conserva el mov_id del extra que sigue, crea el nuevo, saca el quitado y avisa el hijo quitado', () => {
    const ot = armarOT({ id: 'ot-9', numero: '0990', plantilla: 'tq-tq', fecha: '2026-11-12', destino: 'T 212', emitio: '',
      lotes: [{ lote: '26217', barriles: [], tanques: [{ num: '189', litros: 4000 }], otras: [], litros_previstos: 4000,
        destinos_extra: [{ num: '214', lote: '26330' }, { num: '213', lote: '26331' }] }], usuario: '', hoy: '' });
    const datos = { movimientos: movimientosDeOT(ot, '', ''), ordenes_trabajo: [ot] };
    const idSigue = ot.lotes[0].destinos_extra[0].mov_id;
    const r = aplicarEdicionOT(datos, ot, { lotes: [{ ...ot.lotes[0],
      destinos_extra: [ot.lotes[0].destinos_extra[0], { num: '210', lote: '26332' }] }] });
    expect(ot.lotes[0].destinos_extra.map(d => d.num)).toEqual(['214', '210']);
    expect(ot.lotes[0].destinos_extra[0].mov_id).toBe(idSigue);
    expect(datos.movimientos.map(m => m.lote_destino).filter(Boolean).sort()).toEqual(['26330', '26332']);
    expect(r.hijosQuitados).toEqual(['26331']);
  });
});
```

Usar los imports de `armarOT` y `movimientosDeOT` que ya tiene el archivo; si no los tiene, importarlos de `ot-armado.js`.

- [ ] **Step 2: Run** `npx vitest run --maxWorkers=2 test/lotes-ot-editar.test.mjs`. Expected: FAIL (`destinos_extra` sin normalizar, movimientos sin rearmar).

- [ ] **Step 3: Implement** en `ot-editar.js`:
- `firmaVasijas`: en la tupla de cada lote, sumar `(l.destinos_extra || []).map(d => [txt(d.num), txt(d.lote)])` y, al final, `(ot.destinos_extra || []).map(d => [txt(d.num), txt(d.lote)])`.
- `firmaTodo`: sumar `ot.destinos_extra` y `l.destinos_extra` en la tupla de cada lote.
- Al principio de `aplicarEdicionOT`: `const extrasAntes = extrasDeOT(ot).map(x => txt(x.d.lote));`.
- En el `map` de `c.lotes`, después de calcular `mov_id`:

```js
      const out = { ...l, lote: txt(l.lote), mov_id: prev ? prev.mov_id : nuevoId() };
      const i = c.lotes.indexOf(l);
      const ex = normalizarExtras(l.destinos_extra, ot.id, `x${i}`);
      if (ex.length) out.destinos_extra = ex; else delete out.destinos_extra;
      return out;
```

  Ojo: el prefijo `x${i}` cambia si el lote cambia de posición. Igual no se pierde el id, porque `normalizarExtras` conserva el `mov_id` que trae el item.
- `if (c.destinos_extra !== undefined){ const ex = normalizarExtras(c.destinos_extra, ot.id, 'xc'); if (ex.length) ot.destinos_extra = ex; else delete ot.destinos_extra; }`
- `r.hijosQuitados = [...hijosAntes.filter(...), ...extrasAntes.filter(l => !extrasDeOT(ot).some(x => txt(x.d.lote) === l))];`
- El rearmado de movimientos ya usa `movIdsDeOT` y `movimientosDeOT`, que con la Task 2 incluyen los extra. Sumar `'lote_destino'` a la lista de campos que se copian; ya está.

- [ ] **Step 4: Run** `npx vitest run --maxWorkers=2 test/lotes-ot-editar.test.mjs test/lotes-ot-armado.test.mjs`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/ot-editar.js test/lotes-ot-editar.test.mjs
git commit -m "feat(lotes): editar una OT pendiente conserva, crea y quita tanques destino extra"
```

---

### Task 8: Emitir OT — bloque "Destinos" por lote y lotes hijos

**Files:**
- Modify: `public/lotes/js/vista-ot-emitir.js` (estado `_lotes` 33, `_loteDesdeTanque` 85, `pintarLotes` 111-159, `cargarSesionDeOT` 338, `conectarLotes` 599-693, `_emitir` 715, `validarLotesOrigen` 750, `armarOTDeSesion` 780, `_cablearEdicion` 548-597)
- Test: `test/lotes-entorno-ot-fuentes.test.ts` (chequeo de fuentes; correrlo) y prueba en navegador (Task 11)

**Interfaces:**
- Consumes: `admiteExtras`, `asignarLotesExtra`, `validarExtras`, `armarHijosExtra`, `extrasDeOT` (Task 1); `armarOT({lotes[i].destinos_extra})` (Task 2); `aplicarEdicionOT` con extras (Task 7).
- Produces: export `extrasReservados(exceptoI)` (lotes ya usados por otros lotes de la sesión) y export `validarExtrasSesion(destino1)` para que la use el asistente del Corte.

- [ ] **Step 1: Estado.** Cada `_lotes[i]` suma `extras: [{num, litros, lote}]`, que arranca en `[]`. Agregar `extras: []` en `_agregarLoteAhora` (al armar el objeto, ~256) y en `lotesDeFoto` si arma lotes (revisar `restaurarLotes`/`lotesDeFoto`). En `cargarSesionDeOT`: `extras: (l.destinos_extra || []).map(d => ({ num: d.num, litros: d.litros, lote: d.lote, mov_id: d.mov_id }))`.

- [ ] **Step 2: Pintar.** Helper nuevo:

```js
/* Tanques destino extra del lote: cada uno es un lote nuevo (hijo), con su
 * tanque, sus litros (opcionales) y su numero, propuesto y editable. */
function _bloqueExtras(l, i){
  if (!admiteExtras(_plantilla)) return '';
  const d1 = ($('oteDestino') && $('oteDestino').value.trim()) || 'el destino de la OT';
  const filas = l.extras.map((d, k) => `<div class="ote-otra">
    <input class="txt" list="otePadron" data-exn="${i}:${k}" value="${escA(d.num)}" placeholder="Tanque" aria-label="Tanque destino extra">
    <input class="txt ote-num" type="number" step="any" min="0" data-exl="${i}:${k}" value="${escA(d.litros ?? '')}" placeholder="litros" aria-label="Litros previstos"> L
    → lote <input class="txt ote-num" data-exlote="${i}:${k}" value="${escA(d.lote)}" aria-label="Lote nuevo">
    <button class="rowbtn" data-exx="${i}:${k}" title="Quitar tanque">✕</button></div>`).join('');
  const conLitros = l.extras.filter(d => Number(d.litros) > 0).reduce((s, d) => s + Number(d.litros), 0);
  const suma = l.extras.length && l.litros ? `<div style="font-size:12px;color:var(--muted)">Tanques extra: ${conLitros} L de ${l.litros} L previstos; a ${esc(d1)} van ${Math.max(0, l.litros - conLitros)} L</div>` : '';
  return `<div class="ote-destinos"><label>Destinos</label> <span style="color:var(--muted)">→ ${esc(d1)}</span>
    ${filas}${suma}<button class="btn" type="button" data-exmas="${i}">＋ Tanque</button></div>`;
}
```

   Insertarlo antes del cierre `</div>` de la tarjeta en `pintarLotes` (después de `ote-litros`) y en `_loteDesdeTanque` (después de "Barricas a llenar"). El asistente del Corte también usa `pintarLotes` (`#otePorLote`); ahí no tiene que salir, porque en el Corte los extra son de la OT. Para eso: `if (!admiteExtras(_plantilla) || _plantillaEsCorte()) return '';`, con `_plantillaEsCorte = () => !!(plantillaPorId(_plantilla) || {}).loteCorte` (importar `plantillaPorId` si no está).

- [ ] **Step 3: Eventos en `conectarLotes`.**
   - Click:
     - `[data-exmas]` hace push de `{num:'', litros:null, lote:''}`, después `_proponerLotesExtra()` y `pintarLotes()`, y enfoca el último `[data-exn]`;
     - `[data-exx]` hace splice y `pintarLotes()`.
   - `change`:
     - `data-exn` pone `num`;
     - `data-exl` pone `litros = num(value)`; refrescar la línea de suma con `pintarLotes()` solo en `change`, no en `input`, para no perder el foco;
     - `data-exlote` pone `lote = value.trim()`.
   - Todos llaman `_avisarCambio()`, que dispara el borrador.

```js
/* Numero propuesto para los extra sin numero: el siguiente libre, sin chocar
 * con los de los otros lotes de esta OT. */
function _proponerLotesExtra(){
  const anio = Number(String($('oteFecha') && $('oteFecha').value || hoyLocalISO()).slice(0, 4));
  const reservados = [];
  for (const l of _lotes){
    l.extras = asignarLotesExtra(l.extras, { lotes: DATOS().lotes || [], anio, reservados });
    reservados.push(...l.extras.map(d => d.lote));
  }
}
```

- [ ] **Step 4: Validar y armar.**
   - En `validarLotesOrigen()`, al final, antes del `return ''`:

```js
  if (admiteExtras(_plantilla)){
    const propios = new Set(_lotesPropios || []);
    for (const l of _lotes){
      const v = validarExtras(l.extras, { lotes: DATOS().lotes || [], padron: DATOS().vasijas || [],
        origenes: _lotes.map(x => x.lote), destino1: $('oteDestino') ? $('oteDestino').value : '', propios });
      if (!v.ok) return 'Lote ' + l.lote + ': ' + v.error;
    }
    const todos = _lotes.flatMap(l => l.extras.map(d => String(d.lote).trim()));
    const rep = todos.find((t, k) => todos.indexOf(t) !== k);
    if (rep) return 'El lote ' + rep + ' está en dos tanques extra.';
  }
```

     `_lotesPropios` es una variable de módulo nueva (`let _lotesPropios = [];`). `cargarSesionDeOT` la llena con `extrasDeOT(ot).map(x => x.d.lote)` y `iniciarSesionLotes` la vacía.
   - En `armarOTDeSesion`, el map de lotes suma `destinos_extra: admiteExtras(plantilla) ? l.extras : []`.
   - En `_emitir`, antes de `registrarOT`:

```js
  const hijos = armarHijosExtra(ot, lote => (DATOS().lotes || []).find(x => String(x.lote) === String(lote)), DATOS().lotes || []);
  await registrarOT(ot, onListo, hijos.length ? d => _crearLotesHijos(d, hijos) : undefined);
```

     con:

```js
function _crearLotesHijos(d, hijos){
  if (!Array.isArray(d.lotes)) d.lotes = [];
  for (const h of [...hijos].reverse()){ d.lotes.unshift(h); fijar(h); }
  refrescarOpcionesFiltros();
}
```

     `fijar` y `refrescarOpcionesFiltros` son los mismos que importa `vista-ot-corte.js`. Copiar sus imports.
   - En `_cablearEdicion` (guardar edición, ~585-593), pasar `lotes: nuevo.lotes`, que ya trae `destinos_extra`. Crear los hijos nuevos con `armarHijosExtra(nuevo, ...)` en el callback `antes` de `guardarEdicionOT`. Después de guardar, si `r.hijosQuitados.length`, `informar` con el mismo texto que usa `vista-ot-corte.js:620`.
   - `_proponerLotesExtra()` corre también al cambiar la fecha.

- [ ] **Step 5: Run** `npx vitest run --maxWorkers=2 test/lotes-entorno-ot-fuentes.test.ts test/lotes-ot-*.mjs`. Expected: PASS. El test de fuentes valida que los imports existan.

- [ ] **Step 6: Commit**

```bash
git add public/lotes/js/vista-ot-emitir.js
git commit -m "feat(lotes): Emitir OT: '+ Tanque' en Destinos de cada lote, con lote nuevo propuesto y lotes hijos al emitir"
```

---

### Task 9: Asistente del Corte — tanques extra en el paso Tanque destino

**Files:**
- Modify: `public/lotes/js/vista-ot-corte.js` (estado `st` ~70, paso `P_DESTINO` 156, `leer` 455, `avanzar`, `emitir` 533-580, `guardarEdicion` 592-623, resumen 356)

**Interfaces:**
- Consumes: `admiteExtras`, `asignarLotesExtra`, `validarExtras`, `armarHijosExtra` (Task 1); `armarOTDeSesion` con el parámetro nuevo `destinosExtra` (agregarlo en la Task 8 si no se hizo: `armarOTDeSesion({..., destinosExtra})` → `armarOT({..., destinos_extra: destinosExtra})`).

- [ ] **Step 1: Estado.**
   - `st.extras = []` en el `st` inicial.
   - Al editar: `st.extras = (editar.destinos_extra || []).map(d => ({ num: d.num, litros: d.litros, lote: d.lote, mov_id: d.mov_id }))`.
   - Con un borrador, viene en `borrador.st`, sin cambios.

- [ ] **Step 2: Paso P_DESTINO.** Solo si `!achique`: debajo de `campoTexto(...)` va el mismo bloque de filas que `_bloqueExtras` (Task 8), con `data-cexn/cexl/cexlote/cexx/cexmas` y sin la línea de suma. Escribir el helper `pasoExtras()` dentro de `abrirCorteOT`. El texto de ayuda dice: "Si el vino no entra en un tanque, agregá otro: cada tanque extra es un lote nuevo, hijo del lote del corte."
   - Cablear los clicks en `pintar()`, junto a los de `[data-dmas]`.
   - `leer()` en `P_DESTINO` lee también los inputs de los extra hacia `st.extras`.
   - `＋ Tanque` llama `asignarLotesExtra(st.extras, { lotes: DATOS().lotes || [], anio: Number(String(st.fecha).slice(0, 4)), reservados: [st.lote || st.existente].filter(Boolean) })`.
   - Ojo: el número de lote del corte se elige en el paso siguiente (`P_LOTE`). Por eso hay que volver a llamar `asignarLotesExtra` con `reservados` actualizados al salir de `P_LOTE` y, si un extra quedó con el mismo número del corte, ponerle `lote: ''` y reasignarlo.

- [ ] **Step 3: Validar.** En `avanzar()`, en `P_DESTINO` y `!achique`:

```js
      const ve = validarExtras(st.extras, { lotes: DATOS().lotes || [], padron: DATOS().vasijas || [],
        origenes: origenes(), loteCorte: st.modo === 'existente' ? st.existente : st.lote, destino1: st.destino,
        propios: new Set(editar ? (editar.destinos_extra || []).map(d => d.lote) : []) });
      if (!ve.ok) return error(ve.error);
```

   Repetir la misma validación en `emitir()` y `guardarEdicion()`, antes de armar la OT. Si falla, volver a `P_DESTINO`.

- [ ] **Step 4: Armar y crear hijos.**
   - En `emitir()`, las dos ramas (existente y nuevo) pasan `destinosExtra: achique ? null : st.extras` a `armarOTDeSesion`.
   - Los hijos se arman con `armarHijosExtra(ot, l => String(l) === String(loteCorte) ? fichaCorte : null, DATOS().lotes || [])`, donde `fichaCorte` es el `lote` nuevo, o `v.ficha` si es existente. Se suman a `crearLotes`: `[...hijosAchique, ...hijosExtra, lote]`, con el mismo orden `reverse` que ya usa.
   - En `guardarEdicion()`: `destinos_extra: achique ? undefined : st.extras` en `cambios`, los hijos nuevos en `nuevos`, y el aviso de `r.hijosQuitados` ya existente cubre los extra (Task 7).
   - Resumen (paso final): si `st.extras.length`, mostrar una línea "Tanques extra: T 214 → lote 26401, …".

- [ ] **Step 5: Run** `npx vitest run --maxWorkers=2 test/lotes-entorno-ot-fuentes.test.ts test/lotes-ot-corte.test.mjs`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/lotes/js/vista-ot-corte.js public/lotes/js/vista-ot-emitir.js
git commit -m "feat(lotes): asistente del Corte: tanques destino extra con lote hijo del corte"
```

---

### Task 10: Confirmar OT — renglón por tanque extra con su merma

**Files:**
- Modify: `public/lotes/js/vista-ot-confirmar.js` (`abrirConfirmarOT` 46-75, `_bloqueTanque` 143, `_paso1` 191-268, `_entradaDe` 270, `_engancharOT` 286, `_leerCampo`, `_irAPaso2` 330-352, `_aplicar` 639-661, la lista de items del paso 2)

**Interfaces:**
- Consumes:
  - las entradas de la Task 3 (`por_lote[i].extras[k]`, `por_lote[i].merma`, `entradas.extras[k]`);
  - los items `extra`;
  - `confirmarOT` con `reales.extras` (Task 2).

- [ ] **Step 1: Entradas iniciales** en `abrirConfirmarOT`. Después de armar `st.entradas`:

```js
  // Tanques destino extra: un renglon por tanque, con su merma.
  const extraEnt = d => ({ vasija: 'T ' + d.num, cm: '', litros_manual: d.litros_reales ?? '', merma: '' });
  if (!st.corte) ot.lotes.forEach((l, i) => {
    if ((l.destinos_extra || []).length){ st.entradas.por_lote[i].extras = l.destinos_extra.map(extraEnt); st.entradas.por_lote[i].merma = ''; }
  });
  st.entradas.extras = st.corte ? (ot.destinos_extra || []).map(extraEnt) : [];
```

- [ ] **Step 2: Pintar.**
   - `_bloqueTanque(id, e, conMerma)`: si `conMerma`, suma `<input class="txt otc-num" type="number" step="any" data-id="${id}" data-f="merma" value="${escA(e.merma ?? '')}" placeholder="merma L" title="Vacío = se calcula">`.
   - En `_paso1`, cuando `st.tipo === 'tanque'` y el lote tiene extras, el destino 1 se pinta con `_bloqueTanque(String(i), e, true)` y debajo, por cada extra `k`:

```js
`<div class="otc-extra"><b>${esc('T ' + d.num)} · lote nuevo ${esc(d.lote)}</b>
   <span style="color:var(--muted)">(${d.litros == null ? 'sin litros previstos' : fmtL(d.litros) + ' previstos'})</span><br>
   ${_bloqueTanque('x' + i + '_' + k, e.extras[k], true)}</div>`
```

   - En las plantillas de barricas (`tipo === 'barricas'`), los extra se pintan igual debajo de `_bloqueBarricas`. El destino 1 no lleva merma.
   - En el Corte sin achique, debajo del bloque `otc-corte` del tanque del corte, un `otc-corte` por extra con id `'xc_' + k`.
   - `_entradaDe(st, id)`:

```js
  if (String(id).startsWith('xc_')) return st.entradas.extras[+String(id).slice(3)];
  if (String(id).startsWith('x')){ const [i, k] = String(id).slice(1).split('_').map(Number); return st.entradas.por_lote[i].extras[k]; }
```

   - `_pintarCalc` corre también para cada extra al final de `_paso1`.

- [ ] **Step 3: Validación y enganche.**
   - En `_irAPaso2`, después de las validaciones de tanque: si algún extra no tiene `vasija`, `err('Falta el tanque extra del lote ' + lote + '.')`.
   - La lista `lotes` (para leer el Mapa y las mermas) suma los hijos de los extra.
   - `_engancharOT`: la firma `lotes(o)` suma `'#' + extrasDeOT(o).map(x => x.d.lote).join('|')`.

- [ ] **Step 4: Paso 2 (lista de items).** Buscar donde se pinta cada item de la propuesta (las filas con check "No tocar"). Los items `extra` se pintan como los hijos del achique, con el título `T 214 · lote nuevo 26330`. `_aplicables` tiene que tratarlos igual que los hijos (`it.hijo != null || it.extra`). Mostrar `merma_litros` del item en la columna de merma, si existe.

- [ ] **Step 5: `_aplicar`.**
   - `por_lote[i].merma_litros` ya sale de `it.merma_litros` (Task 3).
   - Sumar:

```js
    const extras = st.propuesta.items.filter(x => x.extra).map(it => {
      const e = it.extra.i == null ? st.entradas.extras[it.extra.k] : st.entradas.por_lote[it.extra.i].extras[it.extra.k];
      return { i: it.extra.i, k: it.extra.k, destino_real: String(e.vasija || '').trim(), litros_reales: it.litros_llegados, merma_litros: it.merma_litros };
    });
```

     y pasar `extras` en el objeto `reales` de `confirmarOT`.
   - En el Corte, `litros_reales` de los origenes ya resta la merma repartida. No cambia.
   - `sinLitros` del Corte ya mira `x.indice == null`, que incluye los extra.

- [ ] **Step 6: Run** `npx vitest run --maxWorkers=2 test/lotes-entorno-ot-fuentes.test.ts test/lotes-ot-*.mjs test/lotes-propuesta-ot.test.mjs`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/lotes/js/vista-ot-confirmar.js
git commit -m "feat(lotes): Confirmar OT: un renglon por tanque extra con cm/litros y su propia merma"
```

---

### Task 11: Prueba en el navegador y cierre

**Files:**
- Create: script de mock en el scratchpad de la sesión (no en el repo)
- Modify: `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\.claude\launch.json` (entrada nueva `ot-destinos`, puerto `:8876`)

- [ ] **Step 1: Mock sin login.** Copiar el último mock de OT que haya (buscar `mock-*.mjs` en los scratchpads de sesiones anteriores o en `.claude/` del Escritorio; las memorias `lotes-ot-vasijas-corte` y `lotes-ot-muestras` lo nombran) y apuntarlo a `public/` de este worktree. Datos mínimos:
   - lotes 26217 (en T 189, 4000 L) y 26105 (12 barricas);
   - padrón con T 189, 212, 213 y 214;
   - `/shared/dialogo-modelo.js` + `dialogo.js` inyectados.
- [ ] **Step 2: Entrada en launch.json** `{ "name": "ot-destinos", "runtimeExecutable": "node", "runtimeArgs": ["<ruta al mock>"], "port": 8876 }` y `preview_start {name: "ot-destinos"}`.
- [ ] **Step 3: Recorrido** (anotar en el chat lo que se ve, con capturas):
  1. Emitir tq-tq con 26217 → destino T 212 + ＋ Tanque T 214 (1600 L). El lote propuesto es 26330. Emitir → el lote 26330 aparece en Lotes.
  2. Hoja: celda Destino con "T 214 (lote 26330)"; corrección con TH2/SO2 de 26330 en T 214.
  3. Panel de correcciones: tarjeta 26330 · T 214 con 1600 L. Registrar SO2 → aparece en el Registro de corrección de SO₂ del lote 26330.
  4. Confirmar: T 212 2380 L, T 214 1580 L → mermas 20 y 20. Aplicar → 26217 queda en T 212 con 2380 L y 26330 en T 214 con 1580 L.
  5. Borrar la OT → "Borrar y deshacer" → 26217 vuelve a T 189 con 4000 L y 26330 queda en 0, con el aviso "no se borra".
  6. Corte con un extra: emitir, confirmar y ver el hijo.
  7. Una OT vieja sin extras (de las que trae el mock) se ve igual que antes.
- [ ] **Step 4: Suite.** `npx vitest run --maxWorkers=2 test/lotes-*.mjs` y `npx tsc --noEmit`. Expected: todo verde.
- [ ] **Step 5: Commit y push de la rama**

```bash
git push -u origin feat/ot-varios-destinos
```

   El commit del `launch.json` va en el repo del Escritorio, no en este worktree. Avisar al usuario que el merge a main y el deploy son suyos (el clasificador bloquea el push a main) y actualizar la memoria `lotes-ot-varios-destinos`.
