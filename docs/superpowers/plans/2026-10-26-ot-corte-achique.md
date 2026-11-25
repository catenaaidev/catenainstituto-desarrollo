# OT "Corte + achique" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar a Emitir OT (Lotes web) la plantilla "Corte + achique". Es el Corte de siempre, que deja el vino en un tanque pulmón, más el reparto de ese pulmón a vasijas definitivas (tanques, barricas y T50) en la misma OT. Cada tanque definitivo extra es un lote hijo del corte.

**Architecture:**
- Un módulo puro nuevo, `ot-achique.js`, tiene el modelo de las vasijas definitivas: nombres, lotes, validación, movimientos corte → hijo e ids. El armado, la edición, las hojas, la propuesta y el deshacer lo consumen.
- Las pantallas reusan el asistente del Corte (`vista-ot-corte.js`, con un paso nuevo) y Confirmar (`vista-ot-confirmar.js`, con una tarjeta por vasija definitiva).
- Los datos nuevos viven en `ot.achique.destinos`. Las OT viejas no lo tienen y todo lo trata como opcional.

**Tech Stack:**
- JS de navegador (módulos ES, sin framework).
- Tests con vitest + `@cloudflare/vitest-pool-workers` (`npx vitest run <archivo>`).
- Cloudflare Workers + D1 (no se toca el servidor).

**Spec:** `docs/superpowers/specs/2026-10-26-ot-corte-achique-design.md`

## Global Constraints

- **Worktree:** `C:\Users\Bmax\repos\catenainstitute-achique`, rama `feat/ot-corte-achique`. Antes de cada commit: `git branch --show-current` tiene que decir `feat/ot-corte-achique`.
- **NUNCA pushear a `main`:** push a main = deploy (Workers Builds). El merge lo hace el usuario.
- **Textos de la hoja:** literal de la 0943 (`Ordenes de Trabajo 2026\0943 Corte PN Grand Mere.xlsx`).
- **Cada vasija definitiva es un lote.**
  - El lote base (el que conserva el número del corte) es el primer tanque; si no hay tanques, el destino `chicas`.
  - Hay a lo sumo UN destino `chicas`, que junta las barricas y los T50.
- **El pulmón siempre termina vacío:** no se registra ningún lote ahí.
- **Barricas y litros:** barrica = 225 L (`LITROS_BARRICA`), T50 = 50 L (`LITROS_T50`, nuevo).
- **Todo o nada:** el corte (orígenes + lote del corte + hijos) se aplica y se deshace entero o nada.
- **Lotes creados:** los que crea la OT (corte e hijos) nunca se borran solos.
- **Mapa de Barriles:** solo se lee.
- **Archivos CRLF:** algunos archivos JS del repo tienen finales CRLF (p. ej. `vista-ot-emitir.js`). Usar la tool Edit, no reemplazos con `\n` por shell.
- **Papel congelado:** `test/lotes-papel-intacto` congela el CSS de papel. Esta feature NO agrega CSS (solo estilos inline en pantallas de overlay).
- **Comentarios y textos:** en castellano rioplatense, como el resto del código.

---

## File Structure

| Archivo | Rol |
|---|---|
| `public/lotes/js/ot-achique.js` (NUEVO) | Puro. Modelo de las vasijas definitivas: `litrosChicas`, `nombreDestino`, `cantidadDestino`, `indiceBase`, `destinoChicas`, `asignarLotes`, `validarDestinos`, `normalizarAchique`, `movimientosDeAchique`, `movIdsDeOT`, `textoDestinos`, `lotesCreadosPorOT`, `armarLotesHijos` |
| `public/lotes/js/ot-plantillas.js` | Plantilla `corte-achique`, `LITROS_T50`, tipo de bloque `tabla-achique` y `hojasDePlantilla(id, ot)` |
| `public/lotes/js/ot-armado.js` | `armarOT({achique})`, `movimientosDeOT`, `confirmarOT`, `otDeMovimiento` y `eliminarOT` con el achique |
| `public/lotes/js/ot-editar.js` | `aplicarEdicionOT` con `cambios.achique` |
| `public/lotes/js/ot-lista.js` | `resumenLotes` y búsqueda con los destinos |
| `public/lotes/js/ot-hojas.js` | Bloque `tabla-achique`, `rotular de:'achique'`, planilla y rótulos de las chicas, `hojasOT` con la OT |
| `public/lotes/js/propuesta-ot.js` | `t50_llenas` en `llenadoDeEntrada`, ítems hijo en `proponer`, `esItemCorte`, `aplicarPropuesta` con hijos |
| `public/lotes/js/ot-deshacer.js` | `planDeshacer` con los hijos |
| `public/lotes/js/inventario-tanques.js` | Los tanques definitivos de OT pendientes cuentan como TRASIEGO |
| `public/lotes/js/vista-ot-corte.js` | Asistente en modo achique: plantilla por parámetro, paso "Tanque pulmón", paso "Vasijas definitivas", resumen, emitir y editar con hijos |
| `public/lotes/js/vista-ot-emitir.js` | Pasar la plantilla al asistente, `armarOTDeSesion({achique})`, imprimir con `hojasDePlantilla(id, ot)` |
| `public/lotes/js/vista-ot-confirmar.js` | Una tarjeta por vasija definitiva, mermas de chicas, reales del achique |
| `public/lotes/js/vista-movimientos.js` | El aviso de borrar menciona todos los lotes creados |
| Tests (NUEVO `test/lotes-ot-achique.test.mjs` y existentes) | Ver cada tarea |

---

### Task 1: Módulo puro `ot-achique.js` + constantes de plantilla

**Files:**
- Create: `public/lotes/js/ot-achique.js`
- Modify: `public/lotes/js/ot-plantillas.js` (agregar `LITROS_T50` al final, junto a `LITROS_BARRICA`)
- Test: `test/lotes-ot-achique.test.mjs` (nuevo)

**Interfaces:**
- Consumes:
  - `siguienteLote(lotes, anio)` y `validarNumeroLote(texto, lotes)` → `{ok, valor|error}`, de `lote-nuevo.js`;
  - `armarHijo(padre)`, de `lote-nuevo.js`;
  - `nombreTanque(num)`, de `ot-vasijas.js`;
  - `normalizarNumVasija(t)`, de `vasijas-padron.js`;
  - `NOMBRE_T50`, de `envases.js`;
  - `PENDIENTE`, de `ot-movimientos.js`;
  - `LITROS_BARRICA` y `LITROS_T50`, de `ot-plantillas.js`.
- Produces (los usan todas las tareas siguientes):
  - `litrosChicas(barricas, t50) → number`
  - `nombreDestino(d) → 'T 206' | '20 barricas + 2 T50'`
  - `cantidadDestino(d) → '1' | '20 + 2 T50'`
  - `indiceBase(destinos) → number` (−1 si no hay)
  - `destinoChicas(ot) → destino | null`
  - `asignarLotes(destinos, {corte, lotes, anio}) → destinos` (copia, con `lote` y `nuevo`)
  - `validarDestinos(destinos, {lotes, origenes, corte, propios}) → {ok, error?}`
  - `normalizarAchique(achique, otId) → {destinos:[{tipo, num?|barricas,t50, litros, lote, nuevo, mov_id}]} | null`
  - `movimientosDeAchique(ot, usuario, hoy) → movimiento[]`
  - `movIdsDeOT(ot) → string[]`
  - `textoDestinos(ot) → 'T 206 + T 209'`
  - `lotesCreadosPorOT(ot) → string[]`
  - `armarLotesHijos(destinos, fichaCorte, existentes) → lote[]`

- [ ] **Step 1: Write the failing test**

Crear `test/lotes-ot-achique.test.mjs`:

```js
/* Tests de ot-achique.js: las vasijas definitivas de la OT "Corte + achique"
 * (spec 2026-10-26-ot-corte-achique-design.md). Modulo puro. */
import { describe, it, expect } from 'vitest';
import { litrosChicas, nombreDestino, cantidadDestino, indiceBase, destinoChicas, asignarLotes,
         validarDestinos, normalizarAchique, movimientosDeAchique, movIdsDeOT, textoDestinos,
         lotesCreadosPorOT, armarLotesHijos } from '../public/lotes/js/ot-achique.js';

const T = (num, litros, extra = {}) => ({ tipo: 'tanque', num, litros, ...extra });
const CH = (barricas, t50, litros, extra = {}) => ({ tipo: 'chicas', barricas, t50, litros, ...extra });
const LOTES = [{ lote: 26322 }, { lote: '26034' }];

describe('nombres y cantidades', () => {
  it('litros de las chicas: 225 por barrica, 50 por T50', () => {
    expect(litrosChicas(20, 2)).toBe(4600);
    expect(litrosChicas('3', '')).toBe(675);
    expect(litrosChicas(null, null)).toBe(0);
  });
  it('nombre de cada destino', () => {
    expect(nombreDestino(T('206'))).toBe('T 206');
    expect(nombreDestino(CH(20, 2))).toBe('20 barricas + 2 T50');
    expect(nombreDestino(CH(1, 0))).toBe('1 barrica');
    expect(nombreDestino(CH(0, 3))).toBe('3 T50');
  });
  it('cantidad: 1 por tanque, barricas + T50 en las chicas', () => {
    expect(cantidadDestino(T('206'))).toBe('1');
    expect(cantidadDestino(CH(20, 2))).toBe('20 + 2 T50');
    expect(cantidadDestino(CH(20, 0))).toBe('20');
    expect(cantidadDestino(CH(0, 4))).toBe('4 T50');
  });
});

describe('indiceBase', () => {
  it('el primer tanque se queda con el lote del corte', () => {
    expect(indiceBase([CH(5, 0), T('206'), T('209')])).toBe(1);
  });
  it('sin tanques, las chicas', () => {
    expect(indiceBase([CH(5, 0)])).toBe(0);
  });
  it('sin destinos, -1', () => {
    expect(indiceBase([])).toBe(-1);
    expect(indiceBase(null)).toBe(-1);
  });
});

describe('asignarLotes', () => {
  it('la base lleva el corte; los demas, numeros nuevos consecutivos sin chocar', () => {
    const r = asignarLotes([T('206', 7500), T('209', 7500), CH(4, 0, 900)], { corte: '26323', lotes: LOTES, anio: 2026 });
    expect(r.map(d => [d.lote, d.nuevo])).toEqual([['26323', false], ['26324', true], ['26325', true]]);
  });
  it('respeta un numero ya escrito y no lo repite', () => {
    const r = asignarLotes([T('206'), T('209', 0, { lote: '26330' }), T('210')], { corte: '26323', lotes: LOTES, anio: 2026 });
    // siguienteLote es el mayor del año + 1: con 26330 tomado, el siguiente es 26331.
    expect(r.map(d => d.lote)).toEqual(['26323', '26330', '26331']);
  });
  it('un destino que era base y deja de serlo recibe numero nuevo', () => {
    const r = asignarLotes([CH(2, 0, 450, { lote: '26323' }), T('206')], { corte: '26323', lotes: LOTES, anio: 2026 });
    expect(r.map(d => [d.lote, d.nuevo])).toEqual([['26324', true], ['26323', false]]);
  });
  it('no muta lo que recibe', () => {
    const ds = [T('206')];
    asignarLotes(ds, { corte: '26323', lotes: LOTES, anio: 2026 });
    expect(ds[0].lote).toBeUndefined();
  });
});

describe('validarDestinos', () => {
  const ctx = { lotes: LOTES, origenes: ['26034'], corte: '26323', propios: new Set() };
  const ok = ds => validarDestinos(asignarLotes(ds, { corte: '26323', lotes: LOTES, anio: 2026 }), ctx);
  it('pide al menos una vasija', () => {
    expect(validarDestinos([], ctx)).toEqual({ ok: false, error: 'Agregá al menos una vasija definitiva.' });
  });
  it('una sola fila de chicas', () => {
    expect(ok([CH(1, 0, 225), CH(2, 0, 450)]).error).toMatch(/una sola fila/);
  });
  it('tanque sin numero, tanque repetido, chicas sin cantidad, sin litros', () => {
    expect(ok([T('', 100)]).error).toBe('Falta el número de un tanque.');
    expect(ok([T('206', 100), T('t 206', 100)]).error).toBe('El T 206 está dos veces.');
    expect(ok([CH(0, 0, 100)]).error).toBe('Poné cuántas barricas o T50 se llenan.');
    expect(ok([T('206', '')]).error).toBe('Faltan los litros de T 206.');
  });
  it('el lote nuevo no puede existir, ser origen, ser el corte ni repetirse', () => {
    const base = [T('206', 100)];
    expect(validarDestinos([...asignarLotes(base, { corte: '26323', lotes: LOTES, anio: 2026 }),
      { ...T('209', 100), lote: '26322', nuevo: true }], ctx).error).toBe('El lote 26322 ya existe.');
    expect(validarDestinos([{ ...T('206', 100), lote: '26323', nuevo: false },
      { ...T('209', 100), lote: '26034', nuevo: true }], ctx).error).toMatch(/origen/);
    expect(validarDestinos([{ ...T('206', 100), lote: '26323', nuevo: false },
      { ...T('209', 100), lote: '26323', nuevo: true }], ctx).error).toBe('El lote 26323 es el lote del corte.');
    expect(validarDestinos([{ ...T('206', 100), lote: '26323', nuevo: false },
      { ...T('209', 100), lote: '26400', nuevo: true }, { ...T('210', 100), lote: '26400', nuevo: true }], ctx).error)
      .toBe('El lote 26400 está repetido en las vasijas.');
  });
  it('al editar, un hijo que ya creo esta OT no cuenta como repetido', () => {
    const ds = [{ ...T('206', 100), lote: '26323', nuevo: false }, { ...T('209', 100), lote: '26322', nuevo: true }];
    expect(validarDestinos(ds, { ...ctx, propios: new Set(['26322']) })).toEqual({ ok: true });
  });
  it('la 0943 pasa', () => {
    expect(ok([T('206', 7500), T('209', 7500)])).toEqual({ ok: true });
  });
});

describe('normalizarAchique', () => {
  it('limpia, deja la base sin mov_id y numera los hijos', () => {
    const a = normalizarAchique({ destinos: [
      { tipo: 'tanque', num: 'T 206', litros: '7500', lote: '26323', nuevo: false, litrosTocado: true },
      { tipo: 'tanque', num: '209', litros: 7500, lote: '26324', nuevo: true },
      { tipo: 'chicas', barricas: '20', t50: '2', litros: '4600', lote: '26325', nuevo: true },
    ] }, 'ot-x');
    expect(a).toEqual({ destinos: [
      { tipo: 'tanque', num: '206', litros: 7500, lote: '26323', nuevo: false, mov_id: null },
      { tipo: 'tanque', num: '209', litros: 7500, lote: '26324', nuevo: true, mov_id: 'ot-x-a0' },
      { tipo: 'chicas', barricas: 20, t50: 2, litros: 4600, lote: '26325', nuevo: true, mov_id: 'ot-x-a1' },
    ] });
  });
  it('conserva el mov_id de un hijo que ya lo tenia', () => {
    const a = normalizarAchique({ destinos: [T('206', 1, { lote: '1' }), T('209', 1, { lote: '2', mov_id: 'ot-x-a0' }),
      T('210', 1, { lote: '3' })] }, 'ot-x');
    expect(a.destinos.map(d => d.mov_id)).toEqual([null, 'ot-x-a0', 'ot-x-a1']);
  });
  it('sin destinos, null', () => {
    expect(normalizarAchique(null, 'ot-x')).toBeNull();
    expect(normalizarAchique({ destinos: [] }, 'ot-x')).toBeNull();
  });
});

const OT = {
  id: 'ot-x', ot: '0944', fecha: '2026-10-14', destino: 'TQ pulmón bodega',
  lote_corte: { lote: '26323', id_texto: 'Corte Base PN DN Grand Mere' },
  lotes: [{ lote: '26034', mov_id: 'ot-x-0' }, { lote: '26038', mov_id: 'ot-x-1' }],
  achique: { destinos: [
    { tipo: 'tanque', num: '206', litros: 7500, lote: '26323', nuevo: false, mov_id: null },
    { tipo: 'tanque', num: '209', litros: 7500, lote: '26324', nuevo: true, mov_id: 'ot-x-a0' },
  ] },
};

describe('movimientos e ids', () => {
  it('un traspaso pendiente del corte a cada hijo', () => {
    expect(movimientosDeAchique(OT, 'ana', '2026-10-13')).toEqual([{
      id: 'ot-x-a0', lote: '26323', tipo: 'traspaso', fecha: '2026-10-14',
      vasija_origen: 'TQ pulmón bodega', vasija_destino: 'T 209', litros: 7500,
      lote_destino: '26324', destino_externo: '', estado: 'pendiente', ot: '0944',
      operario: '', comentario: '', cargado_por: 'ana', cargado_el: '2026-10-13',
    }]);
  });
  it('sin achique o sin corte, nada', () => {
    expect(movimientosDeAchique({ ...OT, achique: null }, 'ana', 'h')).toEqual([]);
    expect(movimientosDeAchique({ ...OT, lote_corte: null }, 'ana', 'h')).toEqual([]);
  });
  it('ids de la OT: lotes de origen y traspasos a hijos', () => {
    expect(movIdsDeOT(OT)).toEqual(['ot-x-0', 'ot-x-1', 'ot-x-a0']);
    expect(movIdsDeOT({ lotes: [{ mov_id: 'a' }] })).toEqual(['a']);
  });
  it('textoDestinos y lotesCreadosPorOT', () => {
    expect(textoDestinos(OT)).toBe('T 206 + T 209');
    expect(textoDestinos({})).toBe('');
    expect(lotesCreadosPorOT(OT)).toEqual(['26323', '26324']);
    expect(lotesCreadosPorOT({ ...OT, lote_corte: { lote: '26323', existente: true } })).toEqual(['26324']);
  });
  it('destinoChicas', () => {
    expect(destinoChicas(OT)).toBeNull();
    const ch = { tipo: 'chicas', barricas: 2, t50: 0, lote: '26325' };
    expect(destinoChicas({ achique: { destinos: [ch] } })).toBe(ch);
  });
});

describe('armarLotesHijos', () => {
  it('una copia del lote del corte por cada hijo que todavia no existe', () => {
    const ficha = { lote: 26323, id_texto: 'Corte PN', variedad: 'Pinot Noir', litros_actuales: 0, vasija_grande: 10 };
    const hijos = armarLotesHijos(OT.achique.destinos, ficha, [{ lote: 26323 }]);
    expect(hijos).toHaveLength(1);
    expect(hijos[0]).toMatchObject({ lote: 26324, id_texto: 'Corte PN', variedad: 'Pinot Noir', origen: 'Vino',
      litros_actuales: 0, vasija_grande: null });
    expect(armarLotesHijos(OT.achique.destinos, ficha, [{ lote: '26324' }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/Bmax/repos/catenainstitute-achique && npx vitest run test/lotes-ot-achique.test.mjs`
Expected: FAIL (no se puede resolver `ot-achique.js`).

- [ ] **Step 3: Write minimal implementation**

En `public/lotes/js/ot-plantillas.js`, justo debajo de `export const LITROS_BARRICA = 225;`, agregar:

```js
// T50 de la bodega: 50 L. Con las barricas, estima los litros de las vasijas
// chicas de un achique (ot-achique.js).
export const LITROS_T50 = 50;
```

Crear `public/lotes/js/ot-achique.js`:

```js
/* ===== Lotes CIW — vasijas definitivas de la OT "Corte + achique" (puro) =====
 *
 * El Corte + achique junta los lotes de origen en un tanque pulmon (el lote
 * del corte) y, en la misma orden, reparte el pulmon en sus vasijas
 * definitivas (0943 Corte PN Grand Mere). Cada vasija definitiva es un lote:
 *   - el primer tanque se queda con el numero del corte (la "base"); sin
 *     tanques, la base son las chicas;
 *   - cada tanque mas es un lote NUEVO, hijo del corte, con sus mismos datos;
 *   - las barricas y T50 van juntas en UN destino 'chicas' y son un lote.
 * El pulmon siempre termina vacio.
 *
 *   ot.achique = { destinos: [{ tipo: 'tanque', num, litros, lote, nuevo, mov_id }
 *                           | { tipo: 'chicas', barricas, t50, litros, lote, nuevo, mov_id }] }
 *
 * La base no tiene movimiento (el vino ya es de ese lote); cada hijo tiene un
 * traspaso corte -> hijo, que es lo que arma el linaje.
 * Modulo puro (sin DOM ni nucleo.js) para testearlo en node. */
'use strict';

import { siguienteLote, validarNumeroLote, armarHijo } from './lote-nuevo.js';
import { nombreTanque } from './ot-vasijas.js';
import { normalizarNumVasija } from './vasijas-padron.js';
import { NOMBRE_T50 } from './envases.js';
import { PENDIENTE } from './ot-movimientos.js';
import { LITROS_BARRICA, LITROS_T50 } from './ot-plantillas.js';

const ent = x => { const v = Math.floor(Number(x)); return Number.isFinite(v) && v > 0 ? v : 0; };
const numONull = x => {
  if (x === '' || x == null) return null;
  const v = Number(String(x).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};
const txt = v => String(v ?? '').trim();
const sinT = num => txt(num).replace(/^t\s*/i, '');

export const litrosChicas = (barricas, t50) => ent(barricas) * LITROS_BARRICA + ent(t50) * LITROS_T50;

export function nombreDestino(d){
  if (!d) return '';
  if (d.tipo === 'tanque') return nombreTanque(sinT(d.num));
  const b = ent(d.barricas), t = ent(d.t50);
  const partes = [];
  if (b || !t) partes.push(b === 1 ? '1 barrica' : `${b} barricas`);
  if (t) partes.push(`${t} ${NOMBRE_T50}`);
  return partes.join(' + ');
}

/* La columna Cantidad de la tabla del achique (0943: 1 por tanque). */
export function cantidadDestino(d){
  if (!d) return '';
  if (d.tipo === 'tanque') return '1';
  const b = ent(d.barricas), t = ent(d.t50);
  if (b && t) return `${b} + ${t} ${NOMBRE_T50}`;
  return t ? `${t} ${NOMBRE_T50}` : String(b);
}

export function indiceBase(destinos){
  const ds = destinos || [];
  const t = ds.findIndex(d => d && d.tipo === 'tanque');
  return t !== -1 ? t : ds.findIndex(d => d && d.tipo === 'chicas');
}

const destinosDe = ot => (ot && ot.achique && ot.achique.destinos) || [];

export const destinoChicas = ot => destinosDe(ot).find(d => d && d.tipo === 'chicas') || null;

/* Pone el lote de cada destino: la base, el del corte; los demas conservan el
 * numero escrito y, si no tienen (o tenian el del corte porque antes eran la
 * base), el siguiente libre del año. Devuelve una copia. */
export function asignarLotes(destinos, { corte, lotes, anio }){
  const ds = destinos || [];
  const base = indiceBase(ds);
  const c = txt(corte);
  const tomados = new Set((lotes || []).map(l => txt(l && l.lote)));
  if (c) tomados.add(c);
  ds.forEach((d, i) => { if (i !== base && txt(d.lote) && txt(d.lote) !== c) tomados.add(txt(d.lote)); });
  return ds.map((d, i) => {
    if (i === base) return { ...d, lote: c, nuevo: false };
    let lote = txt(d.lote);
    if (!lote || lote === c){
      lote = siguienteLote([...tomados].map(x => ({ lote: x })), anio);
      tomados.add(lote);
    }
    return { ...d, lote, nuevo: true };
  });
}

/* `propios` = lotes hijos que esta misma OT ya creo (al editar): existen en la
 * tabla de Lotes pero no son un numero repetido. */
export function validarDestinos(destinos, { lotes, origenes, corte, propios } = {}){
  const ds = destinos || [];
  const no = error => ({ ok: false, error });
  if (!ds.length) return no('Agregá al menos una vasija definitiva.');
  if (ds.filter(d => d.tipo === 'chicas').length > 1) return no('Las barricas y T50 van todas en una sola fila.');
  const tanques = new Set(), lotesVistos = new Set();
  for (const d of ds){
    if (d.tipo === 'tanque'){
      const n = normalizarNumVasija(d.num);
      if (!n) return no('Falta el número de un tanque.');
      if (tanques.has(n)) return no(`El ${nombreDestino(d)} está dos veces.`);
      tanques.add(n);
    } else if (!ent(d.barricas) && !ent(d.t50)) return no('Poné cuántas barricas o T50 se llenan.');
    const l = numONull(d.litros);
    if (l == null || l <= 0) return no(`Faltan los litros de ${nombreDestino(d)}.`);
    if (!d.nuevo) continue;
    const t = txt(d.lote);
    if (lotesVistos.has(t)) return no(`El lote ${t} está repetido en las vasijas.`);
    lotesVistos.add(t);
    if (t === txt(corte)) return no(`El lote ${t} es el lote del corte.`);
    if ((origenes || []).some(o => txt(o) === t)) return no(`El lote ${t} es uno de los lotes de origen del corte.`);
    if (!(propios && propios.has(t))){
      const v = validarNumeroLote(t, lotes || []);
      if (!v.ok) return no(v.error);
    }
  }
  return { ok: true };
}

/* Lo que se guarda en la OT: campos limpios, la base sin movimiento y un
 * mov_id por hijo (conserva el que ya tenia, para editar sin perderlo). */
export function normalizarAchique(achique, otId){
  const ds = (achique && achique.destinos) || [];
  if (!ds.length) return null;
  const base = indiceBase(ds);
  const usados = new Set(ds.map((d, i) => i !== base && d.mov_id).filter(Boolean));
  let k = 0;
  const nuevoId = () => { let id; do { id = `${otId}-a${k++}`; } while (usados.has(id)); usados.add(id); return id; };
  return { destinos: ds.map((d, i) => {
    const out = { tipo: d.tipo === 'chicas' ? 'chicas' : 'tanque' };
    if (out.tipo === 'tanque') out.num = sinT(d.num);
    else { out.barricas = ent(d.barricas); out.t50 = ent(d.t50); }
    out.litros = numONull(d.litros);
    out.lote = txt(d.lote);
    out.nuevo = i !== base;
    out.mov_id = i === base ? null : (d.mov_id || nuevoId());
    return out;
  }) };
}

/* Traspaso pendiente lote del corte -> cada hijo: el linaje solo arma padre ->
 * hijo con traspasos (TIPOS_A_LOTE de motores/linaje.ts). */
export function movimientosDeAchique(ot, usuario, hoy){
  const corte = ot && ot.lote_corte && txt(ot.lote_corte.lote);
  if (!corte) return [];
  return destinosDe(ot).filter(d => d.mov_id).map(d => ({
    id: d.mov_id, lote: corte, tipo: 'traspaso', fecha: ot.fecha,
    vasija_origen: ot.destino || '', vasija_destino: nombreDestino(d), litros: d.litros,
    lote_destino: txt(d.lote), destino_externo: '', estado: PENDIENTE, ot: ot.ot,
    operario: '', comentario: '', cargado_por: usuario || '', cargado_el: hoy,
  }));
}

export const movIdsDeOT = ot => [...((ot && ot.lotes) || []).map(l => l.mov_id),
  ...destinosDe(ot).map(d => d.mov_id).filter(Boolean)];

export const textoDestinos = ot => destinosDe(ot).map(nombreDestino).join(' + ');

/* Los lotes que esta OT dio de alta: el del corte (si no era uno existente) y
 * los hijos. Ninguno se borra solo al borrar o editar la OT. */
export function lotesCreadosPorOT(ot){
  const out = [];
  const c = ot && ot.lote_corte;
  if (c && txt(c.lote) && !c.existente) out.push(txt(c.lote));
  for (const d of destinosDe(ot)) if (d.nuevo && txt(d.lote)) out.push(txt(d.lote));
  return out;
}

/* Los lotes hijos a crear: copia de la ficha del corte (armarHijo: sin litros
 * ni envases, origen Vino) con el numero de cada destino nuevo que todavia no
 * esta en `existentes`. El numero va como numero, igual que en Nuevo lote. */
export function armarLotesHijos(destinos, fichaCorte, existentes){
  const hay = new Set((existentes || []).map(l => txt(l && l.lote)));
  return (destinos || []).filter(d => d.nuevo && txt(d.lote) && !hay.has(txt(d.lote))).map(d => {
    const h = armarHijo(fichaCorte || {});
    const n = Number(txt(d.lote));
    h.lote = Number.isFinite(n) ? n : txt(d.lote);
    return h;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lotes-ot-achique.test.mjs`
Expected: PASS. Si `normalizarNumVasija('t 206')` no devuelve `'206'`, revisar su implementación en `vasijas-padron.js` y adaptar el test del tanque repetido al formato que acepta, sin cambiar `vasijas-padron.js`.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # feat/ot-corte-achique
git add public/lotes/js/ot-achique.js public/lotes/js/ot-plantillas.js test/lotes-ot-achique.test.mjs
git commit -m "feat(lotes): modelo puro de las vasijas definitivas del Corte + achique

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Plantilla `corte-achique`, armado, edición y lista

**Files:**
- Modify: `public/lotes/js/ot-plantillas.js` (`TIPOS_BLOQUE`, nueva plantilla, `hojasDePlantilla`)
- Modify: `public/lotes/js/ot-armado.js` (`armarOT`, `movimientosDeOT`, `confirmarOT`, `otDeMovimiento`, `eliminarOT`)
- Modify: `public/lotes/js/ot-editar.js` (`aplicarEdicionOT`)
- Modify: `public/lotes/js/ot-lista.js` (`resumenLotes`, búsqueda)
- Modify: `public/lotes/js/propuesta-ot.js:19-25` (`DESTINO_POR_PLANTILLA`)
- Test: `test/lotes-ot-plantillas.test.mjs`, `test/lotes-ot-armado.test.mjs`, `test/lotes-ot-editar.test.mjs`, `test/lotes-ot-lista.test.mjs`

**Interfaces:**
- Consumes: todo lo de la Task 1.
- Produces:
  - `armarOT({..., achique})` → OT con `achique` (normalizado) o `null`;
  - `movimientosDeOT(ot)` incluye los traspasos corte → hijo;
  - `confirmarOT(ot, movs, reales)` con `reales.achique = [{destino_real, litros_reales}]` (por índice de destino);
  - `hojasDePlantilla(id, ot)`;
  - `aplicarEdicionOT(datos, ot, {achique})` → `r.hijosQuitados: string[]`;
  - `tipoDestino('corte-achique') === 'tanque'`.

- [ ] **Step 1: Write the failing tests**

Agregar al final de `test/lotes-ot-plantillas.test.mjs`:

```js
describe('Corte + achique (0943)', () => {
  it('es un corte que crea lote y reparte el pulmon', () => {
    const pl = plantillaPorId('corte-achique');
    expect(pl.nombre).toBe('Corte + achique');
    expect(pideLoteCorte('corte-achique')).toBe(true);
    expect(creaLote('corte-achique')).toBe(true);
    expect(pl.achique).toBe(true);
    const tipos = pl.bloques.map(b => b.tipo);
    expect(tipos.indexOf('tabla-achique')).toBeGreaterThan(tipos.indexOf('tabla-correccion'));
    expect(pl.bloques.filter(b => b.tipo === 'rotular').map(b => b.de)).toEqual(['corte', 'achique']);
    const textos = pl.bloques.map(b => b.texto || '').join(' | ');
    for (const t of ['SIN BORRAS', 'Homogeneizar.', 'Registrar SO2 Final', 'Preparar pare reubicar',
                     'En caso de que quede mermo:', 'Chequear O2 final y registrar', 'Lavar vasija utilizada.'])
      expect(textos).toContain(t);
  });
  it('hojas: solo la OT, salvo que haya barricas o T50 de destino', () => {
    const ot = destinos => ({ plantilla: 'corte-achique', achique: { destinos } });
    expect(hojasDePlantilla('corte-achique')).toEqual(['ot']);
    expect(hojasDePlantilla('corte-achique', ot([{ tipo: 'tanque', num: '206' }]))).toEqual(['ot']);
    expect(hojasDePlantilla('corte-achique', ot([{ tipo: 'tanque', num: '206' }, { tipo: 'chicas', barricas: 2 }])))
      .toEqual(HOJAS_OT);
  });
});
```

Agregar al final de `test/lotes-ot-armado.test.mjs` (usa `otDe`, `CINCO` y `barril` del archivo):

```js
describe('Corte + achique', () => {
  const ACH = { destinos: [
    { tipo: 'tanque', num: '206', litros: 7500, lote: '26323', nuevo: false },
    { tipo: 'tanque', num: '209', litros: 7500, lote: '26324', nuevo: true },
  ] };
  const otA = () => otDe([{ lote: '26034', barriles: CINCO }], {
    plantilla: 'corte-achique', destino: 'TQ pulmón bodega',
    lote_corte: { lote: '26323', id_texto: 'Corte PN' }, achique: ACH });

  it('armarOT guarda el achique normalizado; sin achique queda null', () => {
    expect(otA().achique.destinos.map(d => [d.lote, d.mov_id])).toEqual([['26323', null], ['26324', 'ot-x-a0']]);
    expect(otDe([{ lote: '26034', barriles: CINCO }]).achique).toBeNull();
  });
  it('movimientos: traspasos origen -> corte y corte -> hijo', () => {
    const ms = movimientosDeOT(otA(), 'ana', '2026-10-13');
    expect(ms.map(m => [m.id, m.lote, m.lote_destino, m.vasija_destino])).toEqual([
      ['ot-x-0', '26034', '26323', 'TQ pulmón bodega'], ['ot-x-a0', '26323', '26324', 'T 209']]);
  });
  it('confirmar pisa los reales del traspaso al hijo', () => {
    const ot = otA();
    const movs = movimientosDeOT(ot, 'ana', 'h');
    const faltan = confirmarOT(ot, movs, { operario: 'Ignacio', pasos_cumplidos: true, comentario: '',
      por_lote: [{ destino_real: 'TQ pulmón bodega', litros_reales: 1100 }],
      achique: [{ destino_real: 'T 206', litros_reales: 7480 }, { destino_real: 'T 209', litros_reales: 7490 }] }, 'ana', 'h');
    expect(faltan).toEqual([]);
    const m = movs.find(x => x.id === 'ot-x-a0');
    expect(m).toMatchObject({ estado: 'ejecutado', litros: 7490, vasija_destino: 'T 209', operario: 'Ignacio' });
    expect(ot.achique.destinos[1]).toMatchObject({ destino_real: 'T 209', litros_reales: 7490 });
  });
  it('otDeMovimiento y eliminarOT ven los traspasos a hijos', () => {
    const ot = otA();
    const datos = { ordenes_trabajo: [ot], movimientos: movimientosDeOT(ot, 'ana', 'h') };
    expect(otDeMovimiento(datos.ordenes_trabajo, { id: 'ot-x-a0' })).toBe(ot);
    expect(eliminarOT(datos, ot)).toBe(2);
    expect(datos.movimientos).toEqual([]);
  });
});
```

Agregar a `test/lotes-ot-editar.test.mjs` (con su propio import):

```js
import { aplicarEdicionOT as editarA } from '../public/lotes/js/ot-editar.js';
import { armarOT as armarA, movimientosDeOT as movsA } from '../public/lotes/js/ot-armado.js';

describe('editar un Corte + achique', () => {
  const base = () => {
    const ot = armarA({ id: 'ot-e', numero: '0944', plantilla: 'corte-achique', fecha: '2026-10-14',
      destino: 'TQ pulmón', emitio: 'Oriana', lotes: [{ lote: '26034', barriles: [{ num: '1', cap: 225 }] }],
      lote_corte: { lote: '26323', id_texto: 'PN' },
      achique: { destinos: [{ tipo: 'tanque', num: '206', litros: 100, lote: '26323' },
                            { tipo: 'tanque', num: '209', litros: 100, lote: '26324', nuevo: true }] },
      usuario: 'ana', hoy: 'h' });
    return { ot, datos: { movimientos: movsA(ot, 'ana', 'h') } };
  };
  it('agregar un destino suma su traspaso y conserva el del hijo que sigue', () => {
    const { ot, datos } = base();
    const r = editarA(datos, ot, { achique: { destinos: [...ot.achique.destinos,
      { tipo: 'tanque', num: '210', litros: 50, lote: '26325', nuevo: true }] } });
    expect(r.cambio).toBe(true);
    expect(ot.achique.destinos.map(d => d.mov_id)).toEqual([null, 'ot-e-a0', 'ot-e-a1']);
    expect(datos.movimientos.map(m => m.id).sort()).toEqual(['ot-e-0', 'ot-e-a0', 'ot-e-a1']);
    expect(r.hijosQuitados).toEqual([]);
  });
  it('quitar un hijo borra su traspaso y avisa el lote', () => {
    const { ot, datos } = base();
    const r = editarA(datos, ot, { achique: { destinos: [ot.achique.destinos[0]] } });
    expect(datos.movimientos.map(m => m.id)).toEqual(['ot-e-0']);
    expect(r.hijosQuitados).toEqual(['26324']);
  });
});
```

Agregar a `test/lotes-ot-lista.test.mjs` (import propio):

```js
import { resumenLotes as resumenA, filtrarOrdenes as filtrarA } from '../public/lotes/js/ot-lista.js';

describe('lista: Corte + achique', () => {
  const ot = { ot: '0944', fecha: '2026-10-14', lotes: [{ lote: '26034', mov_id: 'a' }, { lote: '26038', mov_id: 'b' }],
    lote_corte: { lote: '26323' }, achique: { destinos: [{ tipo: 'tanque', num: '206', lote: '26323' },
                                                         { tipo: 'tanque', num: '209', lote: '26324' }] } };
  it('el renglon dice adonde termina el vino', () => {
    expect(resumenA(ot)).toBe('26323 (corte de 2 lotes) → T 206 + T 209');
  });
  it('se encuentra buscando un lote hijo', () => {
    expect(filtrarA([ot], { soloPendientes: false, busca: '26324' })).toEqual([ot]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/lotes-ot-plantillas.test.mjs test/lotes-ot-armado.test.mjs test/lotes-ot-editar.test.mjs test/lotes-ot-lista.test.mjs`
Expected: FAIL en los describe nuevos ("Cannot read properties of null" o la plantilla no existe).

- [ ] **Step 3: Implement**

`ot-plantillas.js`:

1. Cambiar `TIPOS_BLOQUE`:
```js
export const TIPOS_BLOQUE = ['paso', 'dato', 'ids', 'tabla-vaciado', 'rotular', 'tabla-correccion', 'tabla-llenado', 'tabla-achique'];
```
2. En el comentario de cabecera, después de la línea de `creaLote`, agregar:
```js
 * `achique: true` = despues del corte, el pulmon se reparte en vasijas
 * definitivas, cada una con su lote (ot-achique.js).
```
3. Agregar la plantilla como último elemento de `PLANTILLAS_OT`, después del Corte:
```js
  {
    // Referencia: 0943 Corte PN Grand Mere. Es el Corte (0867) al tanque
    // pulmon y, en la misma orden, el reparto del pulmon a sus vasijas
    // definitivas (tanques, barricas, T50): cada una es un lote, el primer
    // tanque con el numero del corte (ot-achique.js). Se arma con el mismo
    // asistente del Corte (vista-ot-corte.js), con un paso mas.
    id: 'corte-achique',
    nombre: 'Corte + achique',
    banda: ['TRASIEGO'],
    origen: 'barriles',
    loteCorte: true,
    creaLote: true,
    achique: true,
    bloques: [
      p('Buscar barriles seleccionados, estirar para que técnico los deguste', { ok: true }),
      p('Santizar bomba, cañerías, picos de llenado, visor T y cápsula de gas.'),
      p('Sanitizar vasija a utilizar. (técnico tiene que revisar)', { ok: true }),
      p('Sanitizar clapets antes de comenzar trasiego.'),
      p('Revisar apertura de tapas de vasija.'),
      p('USAR CAUDALÍMETRO Y REGISTRAR LITROS'),
      p('Inertizar tanque destino hasta obtener menos de 20% de O2, técnico tiene que revisar'),
      dato('% final de O2:', { ok: true }),
      p('Trasegar SIN BORRAS a tanque con nitrógeno o Argón en vena. Abrir antes para inertizar cañería.'),
      { tipo: 'ids', de: 'corte' },
      { tipo: 'tabla-vaciado', columnas: ['lote', 'vasijas', 'litros', 'destino', 'merma'], porBarril: true },
      { tipo: 'rotular', de: 'corte' },
      p('Inertizar espacio de cabeza con Argón'),
      p('Tomar muestra en tubo falcon y llevar a laboratorio CIW.'),
      { tipo: 'tabla-correccion', modelo: 'agregado-corte' },
      p('Homogeneizar.'),
      dato('Registrar SO2 Final'),
      p('Preparar pare reubicar'),
      p('Inertizar tanque destino hasta obtener menos de 20% de O2, técnico tiene que revisar'),
      { tipo: 'tabla-achique' },
      { tipo: 'rotular', de: 'achique' },
      p('Inertizar espacio de cabeza con Argón'),
      p('En caso de que quede mermo:'),
      dato('Rellenar con :          (Oriana tiene que degustar)'),
      dato('Chequear O2 final y registrar'),
      p('Lavar y vaporizar barriles vaciados. SEPARAR BARRILES DE 2020 PARA AÑOS ATRÁS'),
      p('Lavar por fuera con agua oxigenada'),
      p('Scanear barriles vaciados y llenados y completar planilla de Scaner barricas'),
      dato('Anotar cantidad de barriles:   LLENADOS ______   VACIADOS ______   MERMOS'),
      p('Lavar vasija utilizada.'),
      p('Juntar borras y tirar en tanque de borras'),
    ],
  },
```
4. Reemplazar `hojasDePlantilla`:
```js
/* Qué hojas se ofrecen al imprimir; sin `hojas`, las tres. Un Corte + achique
 * imprime planilla y rótulos solo si el vino termina en barricas o T50. */
export function hojasDePlantilla(id, ot){
  const pl = plantillaPorId(id);
  if (pl && pl.achique){
    const ds = (ot && ot.achique && ot.achique.destinos) || [];
    return ds.some(d => d && d.tipo === 'chicas') ? HOJAS_OT : ['ot'];
  }
  return (pl && pl.hojas) || HOJAS_OT;
}
```

`propuesta-ot.js`, en `DESTINO_POR_PLANTILLA`, agregar `'corte-achique': 'tanque',`.

`ot-armado.js`:
- Import: `import { normalizarAchique, movimientosDeAchique, movIdsDeOT, nombreDestino } from './ot-achique.js';`
- `armarOT`: agregar `achique` a la desestructuración del parámetro, y en el objeto, debajo de `lote_corte: loteCorte(lote_corte),`, agregar:
  ```js
      // Corte + achique: las vasijas definitivas del pulmon (ot-achique.js).
      achique: normalizarAchique(achique, id),
  ```
- `movimientosDeOT`: hoy es `return ot.lotes.map(l => ({...}));`. Cambiarlo a `const movs = ot.lotes.map(l => ({...}));` (mismo cuerpo) y terminar con:
  ```js
  // Corte + achique: ademas, un traspaso del lote del corte a cada lote hijo.
  return movs.concat(movimientosDeAchique(ot, usuario, hoy));
  ```
- `confirmarOT`: antes de `ot.estado = EJECUTADO;`, agregar:
  ```js
  // Corte + achique: lo que llego a cada vasija definitiva. El traspaso al
  // hijo toma esos litros; la base no tiene movimiento.
  ((ot.achique && ot.achique.destinos) || []).forEach((d, k) => {
    const r = (reales.achique || [])[k] || {};
    d.destino_real = String(r.destino_real || '').trim();
    d.litros_reales = r.litros_reales ?? null;
    if (!d.mov_id) return;
    const m = porId.get(d.mov_id);
    if (!m){ faltan.push(d.mov_id); return; }
    m.vasija_destino = d.destino_real || nombreDestino(d);
    m.litros = d.litros_reales;
    m.merma_litros = null;
    m.operario = reales.operario;
    m.estado = EJECUTADO;
  });
  ```
- `otDeMovimiento`: el return pasa a ser
  ```js
  return (ordenes || []).find(o => movIdsDeOT(o).includes(id)) || null;
  ```
- `eliminarOT`: la primera línea pasa a ser `const ids = new Set(movIdsDeOT(ot));`.

`ot-editar.js`:
- Import: `import { normalizarAchique, movIdsDeOT, nombreDestino } from './ot-achique.js';`
- `CELDAS_POR_FILA`: agregar `'tabla-achique'`.
- `firmaVasijas` se aplica a los lotes. Agregar una función nueva:
  ```js
  const firmaAchique = ot => JSON.stringify(((ot.achique && ot.achique.destinos) || []).map(d => [nombreDestino(d), txt(d.lote)]));
  ```
- `firmaTodo`: agregar `ot.achique` al array: `[ot.destino, ot.fecha, ot.emitio, ot.lote_corte, ot.achique, ...]`.
- En `aplicarEdicionOT`:
  - `const idsAntes = new Set(movIdsDeOT(ot));` (en lugar del Set de `ot.lotes`);
  - `const achiqueAntes = firmaAchique(ot);`;
  - `const hijosAntes = ((ot.achique && ot.achique.destinos) || []).filter(d => d.nuevo).map(d => txt(d.lote));`.
- Después de `if (c.lote_corte !== undefined) ...;`:
  ```js
  if (c.achique !== undefined) ot.achique = normalizarAchique(c.achique, ot.id);
  ```
- El resultado `r` suma `hijosQuitados: []`. Después de calcular `r.agregados`:
  ```js
  const hijosDespues = ((ot.achique && ot.achique.destinos) || []).filter(d => d.nuevo).map(d => txt(d.lote));
  r.hijosQuitados = hijosAntes.filter(l => !hijosDespues.includes(l));
  ```
- `const idsDespues = new Set(movIdsDeOT(ot));`.
- La condición de limpiar celdas pasa a ser `if (firmaVasijas(ot.lotes) !== vasijasAntes || firmaAchique(ot) !== achiqueAntes){`.

`ot-lista.js`:
- Import: `import { textoDestinos } from './ot-achique.js';`
- En `filtrarOrdenes`, a la condición de búsqueda agregar:
  ```js
      || ((ot.achique && ot.achique.destinos) || []).some(d => String(d.lote || '').toLowerCase().includes(q))
  ```
- `resumenLotes`:
  ```js
  export function resumenLotes(ot){
    const ls = lotesDe(ot);
    const destinos = textoDestinos(ot);
    if (ot.lote_corte && ot.lote_corte.lote)
      return `${ot.lote_corte.lote} (corte de ${ls.length} lotes)` + (destinos ? ` → ${destinos}` : '');
    return ls.length > 4 ? `${ls.slice(0, 4).join(' · ')} +${ls.length - 4}` : ls.join(' · ');
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/lotes-ot-plantillas.test.mjs test/lotes-ot-armado.test.mjs test/lotes-ot-editar.test.mjs test/lotes-ot-lista.test.mjs test/lotes-ot-achique.test.mjs test/lotes-propuesta-ot.test.mjs`
Expected: PASS (los tests viejos también: una OT sin achique se comporta igual).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add public/lotes/js/ot-plantillas.js public/lotes/js/ot-armado.js public/lotes/js/ot-editar.js public/lotes/js/ot-lista.js public/lotes/js/propuesta-ot.js test/lotes-ot-plantillas.test.mjs test/lotes-ot-armado.test.mjs test/lotes-ot-editar.test.mjs test/lotes-ot-lista.test.mjs
git commit -m "feat(lotes): plantilla Corte + achique con traspasos del corte a los lotes hijos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Hojas impresas (tabla de achique, rotular, planilla y rótulos de las chicas)

**Files:**
- Modify: `public/lotes/js/ot-hojas.js`
- Test: `test/lotes-ot-hojas.test.mjs`

**Interfaces:**
- Consumes: `nombreDestino`, `cantidadDestino` y `destinoChicas` (Task 1); `hojasDePlantilla(id, ot)` (Task 2).
- Produces: `hojaOT` dibuja `tabla-achique` y `rotular de:'achique'`; `hojasPlanilla` y `hojaRotulos` usan las chicas cuando las hay; `hojasOT` filtra con `hojasDePlantilla(ot.plantilla, ot)`.

- [ ] **Step 1: Write the failing test**

Agregar al final de `test/lotes-ot-hojas.test.mjs` (usa `H`, `armarOT`, `barril` y `cuenta` del archivo):

```js
describe('Corte + achique (0943)', () => {
  const otA = destinos => armarOT({ id: 'ot-a', numero: '0944', plantilla: 'corte-achique', fecha: '2026-10-14',
    destino: 'TQ pulmón bodega', emitio: 'Oriana',
    lotes: [{ lote: '26034', id_texto: 'PN', barriles: [barril('1'), barril('2')] }],
    lote_corte: { lote: '26323', id_texto: 'Corte Base PN DN Grand Mere' },
    achique: { destinos }, mapaVersion: 1, usuario: 'ana', hoy: '2026-10-13' });
  const TQS = [{ tipo: 'tanque', num: '206', litros: 7500, lote: '26323' },
               { tipo: 'tanque', num: '209', litros: 7500, lote: '26324', nuevo: true }];

  it('la tabla del achique: pulmon una vez, una fila por vasija definitiva con su lote', () => {
    const h = H.hojaOT(otA(TQS));
    expect(h).toContain('Litros caudalímetro');
    expect(cuenta(h, 'rowspan="2"')).toBeGreaterThanOrEqual(1);
    expect(h).toContain('<td>26324</td>');
    expect(h).toContain('T 209');
    expect(h).toContain('Preparar pare reubicar');
  });
  it('un rotular por vasija definitiva con su lote y el ID del corte', () => {
    const h = H.hojaOT(otA(TQS));
    expect(h).toContain('T 206 · 26323 Corte Base PN DN Grand Mere');
    expect(h).toContain('T 209 · 26324 Corte Base PN DN Grand Mere');
  });
  it('sin chicas imprime solo la OT; con chicas, planilla y rotulos del lote de las chicas', () => {
    expect(H.hojasOT(otA(TQS))).not.toContain('ot-planilla');
    const ot = otA([TQS[0], { tipo: 'chicas', barricas: 3, t50: 1, litros: 725, lote: '26325', nuevo: true }]);
    const todo = H.hojasOT(ot);
    expect(todo).toContain('ot-planilla');
    expect(todo).toContain('Lote ID: 26325');
    expect(cuenta(H.hojasPlanilla(ot), '<td>26325</td>')).toBe(4);
    expect(cuenta(H.hojaRotulos(ot), 'ot-rot-par')).toBe(4);
    expect(H.hojaRotulos(ot)).toContain('Corte Base PN DN Grand Mere');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lotes-ot-hojas.test.mjs`
Expected: FAIL (la tabla del achique no se dibuja).

- [ ] **Step 3: Implement**

En `ot-hojas.js`:

- Import: `import { nombreDestino, cantidadDestino, destinoChicas } from './ot-achique.js';`
- Debajo de `tablaVaciadoPorBarril`, agregar:
  ```js
  /* Corte + achique (0943): del pulmon a las vasijas definitivas. El pulmon va
   * UNA vez (rowspan) y cada vasija es una fila con su lote: el primer tanque
   * lleva el lote del corte, los demas su lote hijo. */
  const ENT = x => { const v = Math.floor(Number(x)); return Number.isFinite(v) && v > 0 ? v : 0; };
  function destinoCelda(d){
    if (d.tipo === 'tanque') return nombreDestino(d);
    const b = ENT(d.barricas), t = ENT(d.t50);
    return b && t ? 'Barricas + T50' : t ? 'T50' : 'Barricas';
  }
  function tablaAchique(ot){
    const ds = (ot.achique && ot.achique.destinos) || [];
    const pulmon = ot.destino ? `${esc(ot.destino)}<br><br>________` : 'Tanque pulmón: ________';
    const filas = ds.length ? ds : [{ lote: '', tipo: 'tanque', num: '' }];
    const cuerpo = filas.map((d, i) =>
      `<tr>${CHECK}<td>${esc(d.lote)}</td>` +
      (i === 0 ? `<td rowspan="${filas.length}" class="ot-destino">${pulmon}</td>` : '') +
      `<td>${esc(ds.length ? cantidadDestino(d) : '')}</td><td>${esc(fmtL(d.litros))}</td>` +
      `<td>${esc(ds.length ? destinoCelda(d) : '')}</td><td></td><td></td></tr>`).join('');
    const total = ds.reduce((s, d) => s + (Number(d.litros) || 0), 0);
    const pie = ds.length > 1
      ? `<tr class="ot-total"><td></td><td>Total</td><td></td><td></td><td>${total}</td><td></td><td></td><td></td></tr>` : '';
    return '<table class="ot-tabla"><thead><tr><th>Check</th><th>CIW lote</th><th>Vasija</th><th>Cantidad</th><th>Litros</th>' +
      `<th>Destino</th><th>Litros caudalímetro</th><th>Merma</th></tr></thead><tbody>${cuerpo}${pie}</tbody></table>`;
  }
  ```
- En `rotular(ot, de)`, al principio:
  ```js
    if (de === 'achique'){
      const ds = (ot.achique && ot.achique.destinos) || [];
      const id = ot.lote_corte ? ot.lote_corte.id_texto : '';
      if (!ds.length) return '<div class="ot-paso"><span class="ot-caja">☐</span>Rotular vasija ID. <b class="ot-cel"></b></div>';
      return ds.map(d => `<div class="ot-paso"><span class="ot-caja">☐</span>Rotular vasija ID. ` +
        `<b class="ot-cel">${esc(nombreDestino(d))} · ${esc(d.lote)} ${esc(id)}</b></div>`).join('');
    }
  ```
- En `bloqueFijo`, agregar `case 'tabla-achique':   return tablaAchique(ot);`.
- Reemplazar el cuerpo de `hojasPlanilla` (la rama que no es desde tanque):
  ```js
  export function hojasPlanilla(ot){
    if (origenTanque(ot.plantilla)) return hojasPlanillaDesdeTanque(ot);
    const filas = ot.lotes.flatMap(l => l.barriles.map(b => ({ lote: l.lote, ...b })));
    const lotesTxt = ot.lotes.map(l => l.lote).join(' · ');
    // Corte + achique a barricas/T50: el bloque Llenado trae el lote de las
    // chicas, una fila por barrica o T50 a llenar.
    const ch = destinoChicas(ot);
    const llenar = ch ? Array.from({ length: ENT(ch.barricas) + ENT(ch.t50) }, () => ch.lote) : [];
    const paginas = Math.max(Math.ceil(filas.length / FILAS_PLANILLA), Math.ceil(llenar.length / FILAS_PLANILLA), 1);
    return Array.from({ length: paginas }, (_, ip) => {
      const base = ip * FILAS_PLANILLA;
      const vac = Array.from({ length: FILAS_PLANILLA }, (_, i) => {
        const b = filas[base + i];
        return b
          ? `<tr><td>${base + i + 1}</td><td>${esc(b.lote)}</td><td>${esc(b.num)}</td><td>${esc(fmtL(b.cap))}</td>` +
            `<td>${esc(b.anio)}</td><td>${esc(b.marca)}</td><td>${esc(b.origen)}</td><td>${esc(b.trat)}</td></tr>`
          : filaBlanca(base + i + 1);
      }).join('');
      const lle = Array.from({ length: FILAS_PLANILLA }, (_, i) => llenar[base + i] === undefined
        ? filaBlanca(base + i + 1)
        : `<tr><td>${base + i + 1}</td><td>${esc(llenar[base + i])}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('');
      return planillaHoja(ot, vac, lle, lotesTxt, ch ? ch.lote : '');
    }).join('');
  }
  ```
  (`ENT` se declara antes de `destinoCelda`. Está más arriba en el archivo que `hojasPlanilla`, así que se puede usar ahí.)
- Reemplazar `hojaRotulos`:
  ```js
  export function hojaRotulos(ot){
    // Desde tanque no hay barriles del Mapa: un par por barrica a llenar.
    // Corte + achique a barricas/T50: los rotulos son del lote de las chicas.
    // Cada barril lleva DOS rótulos iguales, uno al lado del otro, como el Excel.
    const tanque = origenTanque(ot.plantilla);
    const ch = destinoChicas(ot);
    const fuentes = ch
      ? [{ lote: ch.lote, id_texto: (ot.lote_corte && ot.lote_corte.id_texto) || '', n: Math.max(ENT(ch.barricas) + ENT(ch.t50), 1) }]
      : ot.lotes.map(l => ({ lote: l.lote, id_texto: l.id_texto, n: tanque ? aLlenar(l) : Math.max(l.barriles.length, 1) }));
    const pares = fuentes.flatMap(f => {
      const qr = qrLote(f.lote);
      return Array.from({ length: f.n }, (_, i) => {
        const r = `<div class="ot-rotulo"><div class="ot-rot-lote">${esc(f.lote)}</div>` +
          `<div class="ot-rot-qr">${qr}</div>` +
          `<div class="ot-rot-id">${esc(f.id_texto || '')}</div><div class="ot-rot-n">${i + 1}</div></div>`;
        return `<div class="ot-rot-par">${r}${r}</div>`;
      });
    });
    return trozos(pares, PARES_POR_HOJA)
      .map(pag => `<div class="orden-hoja ot-rotulos">${pag.join('')}</div>`).join('');
  }
  ```
- En `hojasOT`: `const deja = new Set(hojasDePlantilla(ot.plantilla, ot));`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/lotes-ot-hojas.test.mjs test/lotes-papel-intacto.test.mjs test/lotes-ot-plantillas.test.mjs`
Expected: PASS (el papel intacto no cambia: no se tocó CSS).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add public/lotes/js/ot-hojas.js test/lotes-ot-hojas.test.mjs
git commit -m "feat(lotes): hoja del Corte + achique (tabla al pulmón→vasijas, rótulos y planilla de las chicas)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Propuesta y aplicación con lotes hijos (Confirmar, parte pura)

**Files:**
- Modify: `public/lotes/js/propuesta-ot.js`
- Test: `test/lotes-propuesta-ot.test.mjs`

**Interfaces:**
- Consumes: `indiceBase` (Task 1), `LITROS_T50` (Task 1).
- Produces:
  - `entradas.destinos[k]`: `{vasija, cm, litros_manual}` para un tanque, o `{barricas_llenas, t50_llenas, mermas}` para chicas;
  - los ítems hijo tienen `indice: null, hijo: k`;
  - `export const esItemCorte = it => it.indice == null && it.hijo == null`;
  - `aplicarPropuesta` guarda `aplicado` en `ot.achique.destinos[k]`.

- [ ] **Step 1: Write the failing tests**

Agregar al final de `test/lotes-propuesta-ot.test.mjs` (usa `ot`, `DOCE`, `PADRON` del archivo; el T 154 no tiene tabla, así que van litros a mano):

```js
import { esItemCorte } from '../public/lotes/js/propuesta-ot.js';

describe('Corte + achique', () => {
  const ACH = (destinos) => ({ lote_corte: { lote: '26323', id_texto: 'Corte' }, destino: 'TQ pulmón',
    achique: { destinos } });
  const lotesBase = () => [{ lote: 26323, litros_actuales: 0 }, { lote: 26324, litros_actuales: 0 },
    { lote: 25315, cap225: 5 }, { lote: 25324, cap225: 3 }];
  const origenes = [{ lote: '25315', barriles: DOCE.slice(0, 5), litros_previstos: 1125 },
                    { lote: '25324', barriles: DOCE.slice(5, 8), litros_previstos: 675 }];
  const DOS_TQ = [{ tipo: 'tanque', num: '154', litros: 900, lote: '26323', nuevo: false, mov_id: null },
                  { tipo: 'tanque', num: '201', litros: 900, lote: '26324', nuevo: true, mov_id: 'ot-1-a0' }];

  it('llenadoDeEntrada cuenta T50 llenos como envases de 50', () => {
    const r = llenadoDeEntrada({ barricas_llenas: 3, t50_llenas: 2, mermas: [] }, 'barricas', PADRON);
    expect(r.llenado).toMatchObject({ cap225: 3, cap50: 2 });
    expect(r.litros).toBe(775);
    expect(r.vasija_texto).toBe('3 barricas + 2 T50');
  });

  it('cada vasija definitiva queda en su lote y la merma es una sola', () => {
    const o = ot('corte-achique', origenes, ACH(DOS_TQ));
    const p = proponer({ ot: o, lotes: lotesBase(), mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 }, { vasija: 'T 201', litros_manual: 880 }] } });
    const corte = p.items.find(esItemCorte);
    const hijo = p.items.find(x => x.hijo === 1);
    expect(corte).toMatchObject({ lote: '26323', litros_despues: 890, despues: { vasija_grande: 890, vasija_actual: 'T 154' } });
    expect(hijo).toMatchObject({ lote: '26324', indice: null, litros_despues: 880, despues: { vasija_actual: 'T 201' } });
    // 1800 salieron - (890 + 880) = 30 de merma, repartida por litros.
    expect(p.items[0].merma_litros + p.items[1].merma_litros).toBeCloseTo(30, 5);
    expect(p.items[0].litros_despues).toBe(0);
  });

  it('chicas como unico destino: el lote del corte va a barricas + T50, con sus mermas', () => {
    const o = ot('corte-achique', origenes, ACH([{ tipo: 'chicas', barricas: 7, t50: 1, litros: 1625, lote: '26323', nuevo: false, mov_id: null }]));
    const p = proponer({ ot: o, lotes: lotesBase(), mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ barricas_llenas: 7, t50_llenas: 1, mermas: [{ barril: '99', litros: 100, cap: 225 }] }] } });
    const corte = p.items.find(esItemCorte);
    expect(corte.despues).toMatchObject({ cap225: 8, cap50: 1, vasija_actual: '8 barricas + 1 T50' });
    expect(corte.mermas_nuevas).toHaveLength(1);
    expect(corte.mermas_nuevas[0]).toMatchObject({ lote: '26323', barril: '99', litros: 100 });
  });

  it('todo o nada: un destino sin medida bloquea toda la OT', () => {
    const o = ot('corte-achique', origenes, ACH(DOS_TQ));
    const p = proponer({ ot: o, lotes: lotesBase(), mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 }, { vasija: 'T 201', cm: '' }] } });
    expect(p.items.every(x => x.bloqueado)).toBe(true);
  });

  it('el lote hijo que no existe bloquea todo', () => {
    const o = ot('corte-achique', origenes, ACH(DOS_TQ));
    const lotes = lotesBase().filter(l => l.lote !== 26324);
    const p = proponer({ ot: o, lotes, mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 }, { vasija: 'T 201', litros_manual: 880 }] } });
    expect(p.items.find(x => x.hijo === 1).avisos).toContain('El lote 26324 no existe en la tabla de Lotes.');
    expect(p.items.every(x => x.bloqueado)).toBe(true);
  });

  it('aplicar deja el aplicado del hijo en su destino', () => {
    const o = ot('corte-achique', origenes, ACH(DOS_TQ));
    const datos = { lotes: lotesBase(), mermas: [] };
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 }, { vasija: 'T 201', litros_manual: 880 }] } });
    aplicarPropuesta(datos, o, p, new Set(p.items.map(x => x.lote)), 'ana', '2026-10-14');
    expect(datos.lotes.find(l => l.lote === 26324)).toMatchObject({ vasija_grande: 880, litros_actuales: 880, vasija_actual: 'T 201' });
    expect(o.achique.destinos[1].aplicado.despues.litros_actuales).toBe(880);
    expect(o.lote_corte.aplicado.despues.litros_actuales).toBe(890);
  });

  it('si el corte no se aplica, los hijos tampoco', () => {
    const o = ot('corte-achique', origenes, ACH(DOS_TQ));
    const datos = { lotes: lotesBase(), mermas: [] };
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 }, { vasija: 'T 201', litros_manual: 880 }] } });
    aplicarPropuesta(datos, o, p, new Set(['26324']), 'ana', '2026-10-14');
    expect(datos.lotes.find(l => l.lote === 26324).litros_actuales).toBe(0);
    expect(o.achique.destinos[1].aplicado).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lotes-propuesta-ot.test.mjs`
Expected: FAIL (`esItemCorte` no existe, los T50 no se cuentan).

- [ ] **Step 3: Implement**

En `propuesta-ot.js`:

- Imports: `import { origenTanque, LITROS_BARRICA, LITROS_T50 } from './ot-plantillas.js';` y `import { indiceBase } from './ot-achique.js';`
- Debajo de `tipoDestino`:
  ```js
  // El item del lote del corte (no un origen ni un lote hijo del achique).
  export const esItemCorte = it => it.indice == null && it.hijo == null;
  ```
- En `llenadoDeEntrada`, rama `else` (barricas), reemplazar desde `const n = ...` hasta `litros = n * LITROS_BARRICA;` por:
  ```js
      const n = Math.max(0, Math.floor(n0(e.barricas_llenas)));
      // T50 llenos (Corte + achique a barricas/T50): van como envases de 50.
      const n50 = Math.max(0, Math.floor(n0(e.t50_llenas)));
      llenado.cap225 = n;
      llenado.cap50 = n50;
      litros = n * LITROS_BARRICA + n50 * LITROS_T50;
  ```
  y en el armado del texto, reemplazar `const barr = n + mermas.length - t50;` por:
  ```js
      // t50 = todos los T50 (llenos + mermas); las mermas que no son T50 son barricas.
      const barr = n + mermas.length - (t50 - n50);
  ```
- En `proponer`, el bloque `if (corte){ ... }` se reescribe así. Se mantiene el código existente del ítem del corte, pero se mide sobre la entrada del destino base cuando hay achique:
  ```js
  if (corte){
    const loteCorte = buscar(corte);
    // Corte + achique: el lote del corte es la vasija BASE (primer tanque o
    // las chicas) y cada vasija mas es un lote hijo. Sin achique, el tanque del corte.
    const dest = (ot.achique && ot.achique.destinos && ot.achique.destinos.length) ? ot.achique.destinos : null;
    const iBase = dest ? indiceBase(dest) : -1;
    const entCorte = dest ? ((entradas.destinos || [])[iBase] || {}) : entradas.corte;
    const tipoCorte = dest && dest[iBase].tipo === 'chicas' ? 'barricas' : 'tanque';
    const mermasDe = (ll, lote) => ll.mermas.map(m => ({ lote: String(lote), barril: m.barril, cap: m.cap, litros: m.litros,
      desde: ot.fecha || hoy, ot: ot.ot, mapa_ts: m.mapa_ts ?? null }));
    const ll = llenadoDeEntrada(entCorte, tipoCorte, padron);
    let corteItem;
    if (!loteCorte){
      // (igual que hoy)
      corteItem = { lote: corte, indice: null, antes: null, despues: null, mermas_nuevas: [], mermas_cerradas: [],
        litros_origen: null, litros_llegados: ll.litros, merma_litros: null, litros_despues: null,
        avisos: ['El lote del corte no existe en la tabla de Lotes.'], bloqueado: true, revisar: false };
    } else {
      // (igual que hoy, con dos cambios: destNum sale de entCorte, y
      //  mermas_nuevas: mermasDe(ll, corte) en vez de [])
      const antesEnv = envasesDe(loteCorte);
      const destNum = tipoCorte === 'tanque' ? normalizarNumVasija(entCorte && entCorte.vasija) : '';
      // ... resto idéntico al código actual ...
      corteItem = { lote: corte, indice: null, antes: fotoLote(loteCorte),
        despues: { ...env, vasija_actual: vasija },
        mermas_nuevas: mermasDe(ll, corte), mermas_cerradas: [], litros_origen: null, litros_llegados: llegados,
        merma_litros: null, litros_despues: null, avisos, bloqueado: ll.bloqueado, revisar: false };
      recalcularItem(corteItem, mermas);
      if (corteItem.litros_despues <= 0) corteItem.avisos.push('El lote del corte queda en 0 L.');
    }
    items.push(corteItem);

    // Lotes hijos del achique: cada uno recibe lo medido en su vasija.
    const hijos = (dest || []).map((d, k) => {
      if (k === iBase) return null;
      const lh = llenadoDeEntrada((entradas.destinos || [])[k], d.tipo === 'chicas' ? 'barricas' : 'tanque', padron);
      const lote = buscar(d.lote);
      if (!lote) return { lote: String(d.lote), indice: null, hijo: k, antes: null, despues: null, mermas_nuevas: [],
        mermas_cerradas: [], litros_origen: null, litros_llegados: lh.litros, merma_litros: null, litros_despues: null,
        avisos: [`El lote ${d.lote} no existe en la tabla de Lotes.`], bloqueado: true, revisar: false };
      const antesH = envasesDe(lote);
      const nuevo = lh.vasija_texto || '';
      const viejo = String(lote.vasija_actual || '').trim();
      const vasijaH = nuevo && viejo && litrosDeEnvases(antesH) > 0 ? `${nuevo} + ${viejo}` : (nuevo || viejo);
      const it = { lote: String(d.lote), indice: null, hijo: k, antes: fotoLote(lote),
        despues: { ...sumar(antesH, lh.llenado), vasija_actual: vasijaH },
        mermas_nuevas: mermasDe(lh, d.lote), mermas_cerradas: [], litros_origen: null, litros_llegados: lh.litros,
        merma_litros: null, litros_despues: null, avisos: [...lh.avisos], bloqueado: lh.bloqueado, revisar: false };
      recalcularItem(it, mermas);
      return it;
    }).filter(Boolean);
    items.push(...hijos);

    // I2(a): si el corte no se puede aplicar, el vino de los origenes no tiene
    // adonde ir. Con achique es igual con cualquier vasija definitiva: el
    // corte se aplica entero o nada.
    if (corteItem.bloqueado){
      for (const x of items){
        if (x.indice != null){
          x.bloqueado = true;
          x.avisos.push('El lote del corte no se puede aplicar: los lotes de origen tampoco.');
        } else if (x.hijo != null && !x.bloqueado){
          x.bloqueado = true;
          x.avisos.push('El lote del corte no se puede aplicar: los lotes hijos tampoco.');
        }
      }
    } else if (hijos.some(h => h.bloqueado)){
      for (const x of items){
        if (x.bloqueado) continue;
        x.bloqueado = true;
        x.avisos.push('Una vasija definitiva no se puede aplicar: el corte se aplica entero o nada.');
      }
    }

    // La merma es una sola: lo que salio de los origenes menos lo que se midio
    // en TODAS las vasijas definitivas.
    const destinosItems = [corteItem, ...hijos];
    const llegadosTotal = destinosItems.some(x => x.litros_llegados == null) ? null
      : r1(destinosItems.reduce((s, x) => s + x.litros_llegados, 0));
    // ... el bloque de la merma que ya existe, con estos dos reemplazos:
    //   `corteItem.litros_llegados != null`  ->  `llegadosTotal != null`
    //   `total - corteItem.litros_llegados`  ->  `total - llegadosTotal`
  }
  ```
  **Importante:** copiar el cuerpo existente de la rama `else` del ítem del corte (cálculo de `mismoTanque`, `env`, `avisos`, `llegados`, `vasija`) sin cambios, salvo `destNum`. Así no se rompen los tests de corte que ya existen.
- En `aplicarPropuesta`:
  ```js
  const corteItem = propuesta.items.find(esItemCorte) || null;
  ...
  for (const item of propuesta.items){
    const destino = item.indice != null ? ot.lotes[item.indice]
      : item.hijo != null ? ((ot.achique && ot.achique.destinos) || [])[item.hijo]
      : ot.lote_corte;
    ...
    const seAplica = !!lote && !item.bloqueado && !!item.despues && aplicar.has(item.lote)
      && (esItemCorte(item) || corteAplicable);
  ```
  Cambiar el comentario I2(b) de arriba, sumando: "...los origenes ni los lotes hijos tampoco se aplican".

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/lotes-propuesta-ot.test.mjs test/lotes-ot-deshacer.test.mjs`
Expected: PASS (los tests de corte que ya existían siguen verdes).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add public/lotes/js/propuesta-ot.js test/lotes-propuesta-ot.test.mjs
git commit -m "feat(lotes): confirmar el Corte + achique mide cada vasija definitiva y aplica los lotes hijos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Deshacer con lotes hijos + Inventario de tanques

**Files:**
- Modify: `public/lotes/js/ot-deshacer.js` (`planDeshacer`)
- Modify: `public/lotes/js/inventario-tanques.js` (`otsPorVasija`)
- Test: `test/lotes-ot-deshacer.test.mjs`, `test/lotes-inventario-tanques.test.mjs`

**Interfaces:**
- Consumes: `aplicado` en `ot.achique.destinos[k]` (Task 4).
- Produces: `planDeshacer` incluye los hijos con la regla del corte (todo o nada); el inventario marca TRASIEGO en los tanques definitivos.

- [ ] **Step 1: Write the failing tests**

Agregar a `test/lotes-ot-deshacer.test.mjs` (usa `ot`, `DOCE`, `proponer` y `aplicarPropuesta` del archivo):

```js
describe('deshacer un Corte + achique', () => {
  const PAD = [{ num: '189', tipo: 'T', cap_real: 4200, tabla: null, activa: true },
               { num: '190', tipo: 'T', cap_real: 4200, tabla: null, activa: true }];
  function caso(){
    const datos = { lotes: [{ lote: 26323, litros_actuales: 0 }, { lote: 26324, litros_actuales: 0 },
      { lote: 25315, cap225: 4, litros_actuales: 900, vasija_actual: '4 barricas' }], mermas: [] };
    const o = ot('corte-achique', [{ lote: '25315', barriles: DOCE.slice(0, 4), litros_previstos: 900 }], {
      lote_corte: { lote: '26323', id_texto: 'C' },
      achique: { destinos: [{ tipo: 'tanque', num: '189', litros: 450, lote: '26323', nuevo: false, mov_id: null },
                            { tipo: 'tanque', num: '190', litros: 450, lote: '26324', nuevo: true, mov_id: 'ot-1-a0' }] } });
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PAD, hoy: '2026-10-14',
      entradas: { por_lote: [{}], destinos: [{ vasija: '189', litros_manual: 445 }, { vasija: '190', litros_manual: 445 }] } });
    aplicarPropuesta(datos, o, p, new Set(p.items.map(x => x.lote)), 'ana', '2026-10-14');
    return { datos, o };
  }
  it('vuelven los origenes, el corte y los hijos', () => {
    const { datos, o } = caso();
    const plan = planDeshacer(datos, o);
    expect(plan.items.map(i => [i.lote, i.accion]).sort()).toEqual([['25315', 'volver'], ['26323', 'volver'], ['26324', 'volver']]);
    aplicarDeshacer(datos, plan);
    expect(datos.lotes.find(l => l.lote === 26324).litros_actuales).toBe(0);
    expect(datos.lotes.find(l => l.lote === 25315).litros_actuales).toBe(900);
  });
  it('si el hijo se cambio despues, no vuelve ninguno', () => {
    const { datos, o } = caso();
    datos.lotes.find(l => l.lote === 26324).vasija_grande = 300;
    const plan = planDeshacer(datos, o);
    expect(plan.corteParcial).toBe(true);
    expect(plan.items.every(i => i.accion !== 'volver')).toBe(true);
  });
});
```

Agregar a `test/lotes-inventario-tanques.test.mjs`, dentro de `describe('inventarioTanques: estado'` o al final como describe propio (usa `inv`, `fila` y `OT`):

```js
describe('inventarioTanques: Corte + achique', () => {
  it('los tanques definitivos de una OT pendiente quedan en TRASIEGO', () => {
    const r = inv({ ots: [OT({ destino: 'TQ pulmón', lotes: [], achique: { destinos: [
      { tipo: 'tanque', num: '202', lote: '26323' }, { tipo: 'chicas', barricas: 3, lote: '26324' }] } })] });
    expect(fila(r, 202)).toMatchObject({ estado: 'TRASIEGO (OT 0123)', estado_origen: 'ot' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/lotes-ot-deshacer.test.mjs test/lotes-inventario-tanques.test.mjs`
Expected: FAIL (el hijo no está en el plan; el 202 no queda en TRASIEGO).

- [ ] **Step 3: Implement**

En `ot-deshacer.js`, en `planDeshacer`, la primera línea pasa a ser:

```js
  const destinos = [...(ot.lotes || []), ...(ot.lote_corte ? [ot.lote_corte] : []),
                    ...((ot.achique && ot.achique.destinos) || [])]
    .filter(d => d && d.aplicado && typeof d.aplicado === 'object');
```

Agregar al comentario de `planDeshacer` una línea: "Los lotes hijos de un Corte + achique entran en la misma regla: son parte del corte."

En `inventario-tanques.js`, dentro de `otsPorVasija`, debajo de `for (const n of partesVasija(ot.destino)) anotar(n, ot);`:

```js
    // Corte + achique: los tanques definitivos tambien estan en trasiego.
    for (const d of (ot.achique && ot.achique.destinos) || []){
      if (d && d.tipo === 'tanque') for (const n of partesVasija('T ' + d.num)) anotar(n, ot);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/lotes-ot-deshacer.test.mjs test/lotes-inventario-tanques.test.mjs test/lotes-inventario-tanques-ui.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add public/lotes/js/ot-deshacer.js public/lotes/js/inventario-tanques.js test/lotes-ot-deshacer.test.mjs test/lotes-inventario-tanques.test.mjs
git commit -m "feat(lotes): deshacer e inventario de tanques con las vasijas definitivas del achique

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Mock de prueba en el navegador

**Files:**
- Create: `<scratchpad>/mock-ot-achique.mjs` (scratchpad de esta sesión: `C:\Users\Bmax\AppData\Local\Temp\claude\C--Users-Bmax-OneDrive---BODEGAS-ESMERALDA-SA-Escritorio-claude\d5f0219a-c57a-438b-91c0-5678b266b62d\scratchpad\`)
- Modify: `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\.claude\launch.json` (entrada `lotes-ot-achique`, puerto 8820)

**Interfaces:**
- Produces: un servidor sin login en :8820 que sirve `public/` del worktree con lotes de prueba al estilo de la 0943. Lo usan las Tasks 7, 8 y 9.

- [ ] **Step 1: Copiar el mock anterior y adaptarlo**

Copiar `C:/Users/Bmax/AppData/Local/Temp/claude/C--Users-Bmax-OneDrive---BODEGAS-ESMERALDA-SA-Escritorio-claude/42d8bc7e-30ee-41a3-988a-48cca0efad76/scratchpad/mock-ot-vasijas.mjs` al scratchpad de esta sesión como `mock-ot-achique.mjs` y cambiar:

- `catenainstitute-ot-vasijas` → `catenainstitute-achique` (las dos rutas: import del padrón y `RAIZ`);
- el puerto `8819` → `8820`, y el texto del log a `mock ot-achique en :8820`;
- `BARRILES` y `doc.lotes` por estos (cada origen con barricas LLENAS en el Mapa):

```js
const BARRILES = {
  '26034': [b('2200861', 225, '26034'), b('2200392', 225, '26034'), b('1200043', 225, '26034')],
  '26038': [b('1210015', 225, '26038'), b('2200424', 225, '26038')],
  '26048': [b('2200859', 225, '26048'), b('951', 50, '26048')],
};
// en doc:
  lotes: [
    { lote: '26034', id_texto: 'PN DN Ct.1', variedad: 'Pinot Noir', vasija_actual: '3 barricas', cap225: 3, litros_actuales: 675, etapa: 'Crianza' },
    { lote: '26038', id_texto: 'PN DN Ct.2', variedad: 'Pinot Noir', vasija_actual: '2 barricas', cap225: 2, litros_actuales: 450, etapa: 'Crianza' },
    { lote: '26048', id_texto: 'PN DN Ct.3', variedad: 'Pinot Noir', vasija_actual: '1 barrica + 1 T50', cap225: 1, cap50: 1, litros_actuales: 275, etapa: 'Crianza' },
    { lote: '26322', id_texto: 'Otro lote', variedad: 'Malbec', vasija_actual: 'T 201', vasija_grande: 7000, litros_actuales: 7000, etapa: 'Crianza' },
  ],
```

- [ ] **Step 2: Agregar la entrada de launch.json**

En `.claude/launch.json` de `Escritorio\claude`, agregar a `configurations` (después de `lotes-ot-vasijas`):

```json
    {
      "name": "lotes-ot-achique",
      "runtimeExecutable": "node",
      "runtimeArgs": [
        "C:/Users/Bmax/AppData/Local/Temp/claude/C--Users-Bmax-OneDrive---BODEGAS-ESMERALDA-SA-Escritorio-claude/d5f0219a-c57a-438b-91c0-5678b266b62d/scratchpad/mock-ot-achique.mjs"
      ],
      "port": 8820
    }
```

- [ ] **Step 3: Verificar que levanta**

`preview_start {name: "lotes-ot-achique"}` → navegar a `http://localhost:8820/lotes/` → `read_console_messages {onlyErrors:true}` sin errores, y que se vea la pestaña Lotes con los 4 lotes.

- [ ] **Step 4: Commit del launch.json (repo de Escritorio\claude, NO el worktree)**

```bash
cd "C:/Users/Bmax/OneDrive - BODEGAS ESMERALDA SA/Escritorio/claude"
git add .claude/launch.json
git commit -m "chore: launch.json con el servidor de prueba del Corte + achique (lotes-ot-achique, :8820)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Asistente "Corte + achique" (emitir y editar)

**Files:**
- Modify: `public/lotes/js/vista-ot-corte.js`
- Modify: `public/lotes/js/vista-ot-emitir.js` (`armarOTDeSesion`, select de plantilla, `abrirImprimirOT`)
- Modify: `public/lotes/js/vista-movimientos.js:205-206` y `:589-590` (avisos de borrar)

**Interfaces:**
- Consumes:
  - `asignarLotes`, `validarDestinos`, `nombreDestino`, `litrosChicas`, `armarLotesHijos` y `lotesCreadosPorOT` (Task 1);
  - `plantillaPorId` y `hojasDePlantilla(id, ot)` (Task 2);
  - `armarOT({achique})` (Task 2);
  - `aplicarEdicionOT` → `r.hijosQuitados` (Task 2).
- Produces:
  - `abrirCorteOT(onListo, previo)` acepta `previo.plantilla`, o la toma de `previo.editar.plantilla` o de `previo.restaurar.st.plantilla`;
  - `armarOTDeSesion({..., achique})`;
  - `guardarEdicionOT` ahora devuelve `r` (lo usa el asistente para avisar los hijos quitados).

- [ ] **Step 1: `vista-ot-emitir.js`**

1. `armarOTDeSesion({ numero, fecha, plantilla, destino, emitio, loteCorte, achique })`: pasar `achique: achique || null,` a `armarOT` (junto a `lote_corte`).
2. En el `change` de `#otePlantilla`, sumar `plantilla: _plantilla` al objeto que recibe `abrirCorteOT`:
   ```js
      abrirCorteOT(onListo, { plantilla: _plantilla, numero: $('oteNumero').value, numeroTocado, fecha: $('oteFecha').value,
                              emitio: $('oteEmitio').value, destino: $('oteDestino').value });
   ```
3. `abrirImprimirOT`: `const hojas = hojasDePlantilla(ot.plantilla, ot);`.
4. `guardarEdicionOT`: después de `const r = aplicarEdicionOT(...)`, el `return` final de cada camino devuelve `r` (agregar `return r;` al final de la función, y en el camino `!r.cambio` cambiar `onListo(ot); return;` por `onListo(ot); return r;`).

- [ ] **Step 2: `vista-ot-corte.js`: plantilla y pasos variables**

- Imports:
  - sumar `plantillaPorId` al import de `ot-plantillas.js`;
  - agregar `import { asignarLotes, validarDestinos, nombreDestino, litrosChicas, armarLotesHijos } from './ot-achique.js';`.
- Las constantes de módulo `P_RESUMEN`, `TOTAL` y `TOTAL_EXISTENTE` se reemplazan por:
  ```js
  // Pasos fijos; despues del lote vienen los de PASOS_LOTE_CORTE, en el
  // Corte + achique el de las vasijas definitivas, y el resumen.
  const P_ORDEN = 0, P_ORIGEN = 1, P_DESTINO = 2, P_LOTE = 3, P_DATOS = 4;
  const P_FIN_DATOS = P_DATOS + PASOS_LOTE_CORTE.length;
  ```
- Al principio de `abrirCorteOT`, después de `const borrador = previo && previo.restaurar;`:
  ```js
    const plantilla = (editar && editar.plantilla) || (previo && previo.plantilla)
      || (borrador && borrador.st && borrador.st.plantilla) || PLANTILLA_CORTE;
    const achique = !!(plantillaPorId(plantilla) || {}).achique;
    // Con achique hay un paso mas antes del resumen: las vasijas definitivas.
    const P_VASIJAS = achique ? P_FIN_DATOS : -1;
    const P_RESUMEN = P_FIN_DATOS + (achique ? 1 : 0);
    const TOTAL = P_RESUMEN + 1;
    // Con lote existente no se preguntan los datos: lote -> (vasijas) -> resumen.
    const TOTAL_EXISTENTE = P_LOTE + 2 + (achique ? 1 : 0);
  ```
  El `previo = {...}` de `editar` se calcula ANTES que esto; hay que dejarlo como está. Ojo: `editar` es `previo && previo.editar` y ya existe. `iniciarSesionLotes(PLANTILLA_CORTE)` pasa a ser `iniciarSesionLotes(plantilla)`.
- En `st`, agregar:
  ```js
    plantilla,
    // Corte + achique: las vasijas definitivas (ot-achique.js); al editar, las guardadas.
    destinos: editar && editar.achique ? editar.achique.destinos.map(d => ({ ...d })) : [],
  ```
- `numPaso`:
  ```js
    // En modo existente los pasos de datos no se ven: lo que viene despues del
    // lote se numera seguido.
    const numPaso = () => st.modo === 'existente' && paso >= P_FIN_DATOS ? P_LOTE + 2 + (paso - P_FIN_DATOS) : paso + 1;
  ```
- Título del encabezado: `'✂ OT de Corte'` → `achique ? '✂ OT de Corte + achique' : '✂ OT de Corte'`, y lo mismo en editar (`'✎ Editar el Corte '`).
- `cuerpo()`:
  - el `P_DESTINO`:
    ```js
        if (paso === P_DESTINO) return campoTexto('ocCampo', achique ? 'Tanque pulmón' : 'Tanque destino', st.destino,
                                                  achique ? 'p. ej. TQ pulmón bodega' : "vacío = 'Tanque: ____' en la hoja");
    ```
  - antes de `if (paso === P_RESUMEN)`: `if (paso === P_VASIJAS) return pasoVasijas();`.
- `botones()`: el texto del botón del último paso, en lugar del ternario actual, usa `textoEmitir()`:
  ```js
    function textoEmitir(){
      const nuevos = (st.modo === 'existente' ? 0 : 1) + (achique ? st.destinos.filter(d => d.nuevo && !_ficha(d.lote)).length : 0);
      const crear = nuevos ? (nuevos > 1 ? ` y crear ${nuevos} lotes` : ' y crear lote') : '';
      return (editar ? '✓ Guardar cambios' : '✓ Emitir OT') + crear;
    }
  ```
  y `${paso === P_RESUMEN ? textoEmitir() : 'Siguiente →'}`.

- [ ] **Step 3: `vista-ot-corte.js`: paso "Vasijas definitivas"**

Agregar dentro de `abrirCorteOT` (junto a `pasoLoteNuevo`):

```js
  // El lote que recibe el vino del pulmon en la vasija base.
  const corteNum = () => String(st.modo === 'existente' ? st.existente : st.lote).trim();
  const anioOT = () => Number(String(st.fecha).slice(0, 4)) || new Date().getFullYear();
  const litrosOrigen = () => lotesDeSesion().reduce((s, l) => s + (Number(l.litros) || 0), 0);
  const sumaDestinos = () => st.destinos.reduce((s, d) => s + (Number(d.litros) || 0), 0);
  const fmtNum = v => Number(v || 0).toLocaleString('es-AR');
  function refrescarLotes(){
    st.destinos = asignarLotes(st.destinos, { corte: corteNum(), lotes: DATOS().lotes || [], anio: anioOT() });
  }
  // Al editar, los hijos que esta OT ya creo existen en Lotes: no son repetidos.
  const hijosPropios = () => new Set(((editar && editar.achique && editar.achique.destinos) || [])
    .filter(d => d.nuevo).map(d => String(d.lote)));
  function textoSuma(){
    const s = sumaDestinos(), o = litrosOrigen();
    return Math.abs(s - o) < 0.5
      ? `Suma ${fmtNum(s)} L de ${fmtNum(o)} L del corte ✓`
      : `Suma ${fmtNum(s)} L de ${fmtNum(o)} L del corte · ⚠ no cierra (se puede emitir igual: son litros previstos)`;
  }

  /* Las vasijas donde termina el vino. Cada fila muestra su lote: la base, el
   * del corte; las demas, un lote nuevo con numero editable. */
  function pasoVasijas(){
    refrescarLotes();
    const filas = st.destinos.map((d, i) => {
      const lote = d.nuevo
        ? `lote nuevo <input class="txt" data-d="${i}" data-f="lote" value="${escA(d.lote)}" inputmode="numeric" style="width:80px" aria-label="Número del lote nuevo">`
        : `lote del corte <b>${esc(d.lote || '—')}</b>`;
      const campos = d.tipo === 'tanque'
        ? `<input class="txt" list="ocVasijas" data-d="${i}" data-f="num" value="${escA(d.num ? 'T ' + d.num : '')}" placeholder="T 206" style="width:90px" aria-label="Tanque">`
        : `<input class="txt" type="number" min="0" step="1" data-d="${i}" data-f="barricas" value="${escA(d.barricas ?? '')}" placeholder="0" style="width:60px" aria-label="Barricas"> barricas +
           <input class="txt" type="number" min="0" step="1" data-d="${i}" data-f="t50" value="${escA(d.t50 ?? '')}" placeholder="0" style="width:60px" aria-label="T50"> T50`;
      return `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">${campos}
  <input class="txt" type="number" min="0" step="any" data-d="${i}" data-f="litros" value="${escA(d.litros ?? '')}" placeholder="litros" style="width:90px" aria-label="Litros"> L · ${lote}
  <button class="rowbtn" data-dquitar="${i}" title="Quitar esta vasija" aria-label="Quitar esta vasija">✕</button></div>`;
    }).join('');
    const hayChicas = st.destinos.some(d => d.tipo === 'chicas');
    const dl = '<datalist id="ocVasijas">' + (DATOS().vasijas || []).filter(v => v.activa !== false)
      .map(v => `<option value="T ${escA(v.num)}">${esc(v.tipo)} · ${esc(v.cap_real)} L</option>`).join('') + '</datalist>';
    return `
<div style="text-align:left">
  <div style="font-weight:600;margin-bottom:4px">Vasijas definitivas: adónde va el vino del pulmón</div>
  <div style="color:var(--muted);font-size:12px;margin-bottom:10px">El primer tanque se queda con el lote del corte; cada tanque más es un lote nuevo con los mismos datos. Las barricas y T50 van juntas en un solo lote. El pulmón queda vacío.</div>
  ${filas || '<div style="color:var(--muted);margin-bottom:8px">Todavía no hay vasijas.</div>'}
  <div style="display:flex;gap:6px;margin-top:8px">
    <button class="btn" data-dmas="tanque">＋ Tanque</button>
    <button class="btn" data-dmas="chicas"${hayChicas ? ' disabled title="Las barricas y T50 van en una sola fila"' : ''}>＋ Barricas / T50</button>
  </div>
  <div id="ocdSuma" style="margin-top:10px;font-size:13px">${esc(textoSuma())}</div>${dl}
</div>`;
  }

  function leerVasijas(){
    for (const el of document.querySelectorAll('#overlayBox [data-d][data-f]')){
      const d = st.destinos[+el.dataset.d];
      if (!d) continue;
      const f = el.dataset.f;
      d[f] = f === 'num' ? el.value.trim().replace(/^t\s*/i, '') : el.value.trim();
    }
  }
```

En `pintar()`, antes del loop de Enter, agregar el cableado:

```js
    if (paso === P_VASIJAS){
      for (const el of document.querySelectorAll('#overlayBox [data-d][data-f]')) el.addEventListener('input', () => {
        const i = +el.dataset.d, d = st.destinos[i], f = el.dataset.f;
        leerVasijas();
        if (f === 'litros') d.litrosTocado = true;
        // Las chicas proponen sus litros (225 por barrica, 50 por T50) hasta que alguien los escriba.
        if (d.tipo === 'chicas' && (f === 'barricas' || f === 't50') && !d.litrosTocado){
          d.litros = String(litrosChicas(d.barricas, d.t50));
          const li = document.querySelector(`#overlayBox [data-d="${i}"][data-f="litros"]`);
          if (li) li.value = d.litros;
        }
        $('ocdSuma').textContent = textoSuma();
        borradorAhora();
      });
      for (const b of document.querySelectorAll('[data-dmas]')) b.addEventListener('click', () => {
        leer();
        // Un tanque nuevo propone lo que falta para cerrar los litros del corte.
        const falta = Math.max(0, litrosOrigen() - sumaDestinos());
        st.destinos.push(b.dataset.dmas === 'tanque'
          ? { tipo: 'tanque', num: '', litros: falta ? String(falta) : '' }
          : { tipo: 'chicas', barricas: '', t50: '', litros: '' });
        pintar();
      });
      for (const b of document.querySelectorAll('[data-dquitar]')) b.addEventListener('click', () => {
        leer(); st.destinos.splice(+b.dataset.dquitar, 1); pintar();
      });
    }
```

La línea de `foco` se cambia a `const foco = $('ocCampo') || $('oteLote') || $('ocNumero') || document.querySelector('#overlayBox [data-d]') || $('ocSig');`.

`leer()`: agregar la rama `else if (paso === P_VASIJAS) leerVasijas();` ANTES de la rama de `paso >= P_DATOS && paso < P_RESUMEN`. Esa rama se cambia a `paso >= P_DATOS && paso < P_FIN_DATOS`.

Navegación:
- El botón Atrás pasa a ser:
  ```js
      paso = st.modo === 'existente' && paso === P_FIN_DATOS ? P_LOTE : paso - 1;
  ```
- En `avanzar()`, rama `P_LOTE` existente: `paso = P_RESUMEN;` → `paso = P_FIN_DATOS;`.
- Agregar la rama de vasijas (antes de la de `P_RESUMEN`):
  ```js
      } else if (paso === P_VASIJAS){
        refrescarLotes();
        const v = validarDestinos(st.destinos, { lotes: DATOS().lotes || [], origenes: origenes(), corte: corteNum(), propios: hijosPropios() });
        if (!v.ok) return error(v.error);
  ```
- El clamp del borrador `Math.min(..., P_RESUMEN)` ya usa la `P_RESUMEN` local: queda bien.

- [ ] **Step 4: `vista-ot-corte.js`: resumen, emitir y editar**

`resumen()`:
- la fila `fila('Tanque destino', ...)` pasa a usar `achique ? 'Tanque pulmón' : 'Tanque destino'`;
- después del primer `</table>`, agregar:
  ```js
  ${achique ? `<div style="font-weight:600;margin-bottom:4px">Vasijas definitivas</div>
  <table style="border-collapse:collapse;margin-bottom:12px">${st.destinos.map(d =>
    fila(nombreDestino(d), `${esc(fmtNum(d.litros))} L · ${d.nuevo ? 'lote nuevo' : 'lote del corte'} ${esc(d.lote)}`)).join('')}</table>` : ''}
  ```

`emitir()`:
- después de validar el lote (`if (!v.ok){ paso = P_LOTE; ... }`), agregar:
  ```js
    let destinos = null;
    if (achique){
      refrescarLotes();
      const vd = validarDestinos(st.destinos, { lotes: DATOS().lotes || [], origenes: origenes(), corte: corteNum(), propios: hijosPropios() });
      if (!vd.ok){ paso = P_VASIJAS; pintar(); return error(vd.error); }
      destinos = st.destinos;
    }
  ```
- en las dos llamadas a `armarOTDeSesion`:
  - `plantilla: PLANTILLA_CORTE` → `plantilla`;
  - sumar `achique: destinos ? { destinos } : null`.
- agregar el helper (junto a `guardarEdicion`):
  ```js
  /* Suma a Lotes los lotes que crea la OT (el del corte y/o los hijos), fijados arriba. */
  function crearLotes(d, nuevos){
    if (!nuevos.length) return;
    if (!Array.isArray(d.lotes)) d.lotes = [];
    for (const l of nuevos){ d.lotes.unshift(l); fijar(l); }
    refrescarOpcionesFiltros();
  }
  ```
- rama `existente`:
  ```js
      const hijos = destinos ? armarLotesHijos(destinos, v.ficha, DATOS().lotes || []) : [];
      await registrarOT(ot, onListo, hijos.length ? d => crearLotes(d, [...hijos].reverse()) : undefined);
  ```
- rama nuevo (reemplaza el callback de hoy, que hace `unshift` + `fijar` + `refrescarOpcionesFiltros`):
  ```js
    const hijos = destinos ? armarLotesHijos(destinos, lote, DATOS().lotes || []) : [];
    await registrarOT(ot, onListo, d => crearLotes(d, [...[...hijos].reverse(), lote]));
  ```
  `crearLotes` hace `unshift` de a uno, así que el último del array queda primero en la lista. Por eso el array va invertido: así se ve "corte, hijo 1, hijo 2". Comprobarlo en el navegador (Task 7, paso 7).

`guardarEdicion(existente, v)`:
- `armarOTDeSesion({... plantilla: o.plantilla ...})` queda igual.
- Antes de `guardarEdicionOT`:
  ```js
    let destinos;
    if (achique){
      refrescarLotes();
      const vd = validarDestinos(st.destinos, { lotes: DATOS().lotes || [], origenes: origenes(), corte: corteNum(), propios: hijosPropios() });
      if (!vd.ok){ paso = P_VASIJAS; pintar(); return error(vd.error); }
      destinos = st.destinos;
    }
    const fichaCorte = loteNuevo || v.ficha;
    const hijos = destinos ? armarLotesHijos(destinos, fichaCorte, DATOS().lotes || []) : [];
    const nuevos = [...[...hijos].reverse(), ...(loteNuevo ? [loteNuevo] : [])];
  ```
  `loteNuevo` hay que declararlo antes de este bloque: mover su `const loteNuevo = ...` arriba.
- La llamada pasa a ser:
  ```js
    const r = await guardarEdicionOT(o, { lotes: nuevo.lotes, destino: nuevo.destino, fecha: nuevo.fecha, emitio: nuevo.emitio,
                                lote_corte: nuevo.lote_corte, ...(achique ? { achique: { destinos } } : {}) },
                                onListo, nuevos.length ? d => crearLotes(d, nuevos) : null);
  ```
- Después del aviso actual del lote previo, agregar:
  ```js
    if (r && r.hijosQuitados && r.hijosQuitados.length)
      await informar({ titulo: 'Lotes que siguen en la lista',
        texto: 'Esta OT había creado ' + r.hijosQuitados.join(', ') + ' y ya no los usa. No se borran solos: si no se usan, borralos desde la pestaña Lotes.' });
  ```

- [ ] **Step 5: `vista-movimientos.js`: aviso al borrar**

- Import: `import { lotesCreadosPorOT } from './ot-achique.js';`
- Línea ~205:
  ```js
    const creados = lotesCreadosPorOT(ot);
    const corte = creados.length
      ? `<p style="margin:10px 0 0;font-size:13px;color:var(--muted)">${creados.length > 1 ? 'Los lotes ' + esc(creados.join(', ')) + ' que creó esta OT NO se borran.' : 'El lote ' + esc(creados[0]) + ' que creó el corte NO se borra.'}</p>` : '';
  ```
- Línea ~589: lo mismo, en texto plano:
  ```js
            const creados = lotesCreadosPorOT(ot);
            const corte = creados.length
              ? '\n\n' + (creados.length > 1 ? 'Los lotes ' + creados.join(', ') + ' que creó esta OT NO se borran.' : 'El lote ' + creados[0] + ' que creó el corte NO se borra.') : '';
  ```
  Ojo: hoy el corte con lote existente igual dice "El lote X que creó el corte NO se borra". Con `lotesCreadosPorOT` ese caso ya no se avisa, y está bien: no lo creó.

- [ ] **Step 6: Tests automáticos (no deben romperse)**

Run: `npx vitest run test/lotes-ot-*.test.mjs test/lotes-sin-ventanas-nativas.test.ts test/lotes-propuesta-ot.test.mjs`
Expected: PASS. `lotes-sin-ventanas-nativas` controla que no haya `alert`/`confirm` nativos: usar `informar`/`confirmar` de `dialogos.js`, como arriba.

- [ ] **Step 7: Verificar en el navegador (mock :8820)**

1. `preview_start {name: "lotes-ot-achique"}`, ir a `/lotes/`, pestaña Movimientos → Emitir OT → elegir "Corte + achique".
2. Recorrer el asistente:
   - orden;
   - lotes 26034, 26038 y 26048;
   - "Tanque pulmón" = `TQ pulmón bodega`;
   - "＋ Lote nuevo" (propone 26323), ⎘ Hijo de 26034, descripción "Corte Base PN DN Grand Mere";
   - Vasijas: ＋ Tanque `T 206` (litros propuestos = total) y bajarlo a la mitad; ＋ Tanque `T 209` (propone el resto);
   - comprobar que se ve "lote del corte 26323" y "lote nuevo 26324", y "Suma … ✓".
3. Probar los errores: tanque repetido, quitar todas las vasijas, poner 26322 (existe) en el lote nuevo. Cada uno tiene que mostrar su mensaje en `#ocError`.
4. Resumen → "✓ Emitir OT y crear 2 lotes". Comprobar en la pestaña Lotes que aparecen 26323 y 26324 arriba, y en Movimientos (Historial) los traspasos 26034 → 26323… y 26323 → 26324.
5. Abrir la hoja de la OT: tabla del achique con el pulmón una vez, T 206 / 26323 y T 209 / 26324; dos "Rotular vasija ID."; 🖨 ofrece solo "Orden de trabajo".
6. ✎ Editar: el paso de vasijas arranca con T 206 + T 209. Agregar "＋ Barricas / T50" (3 barricas + 1 T50 → 725 L automáticos) y guardar. Comprobar:
   - se crea el lote 26325;
   - 🖨 ahora ofrece las 3 hojas;
   - la planilla tiene 4 filas de 26325 en Llenado;
   - los rótulos son 4 pares de 26325.
7. ✎ Editar, quitar T 209, guardar → aviso "Esta OT había creado 26324…".
8. `read_console_messages {onlyErrors:true}` vacío. Screenshot de la hoja como prueba.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add public/lotes/js/vista-ot-corte.js public/lotes/js/vista-ot-emitir.js public/lotes/js/vista-movimientos.js
git commit -m "feat(lotes): asistente del Corte + achique con el paso de vasijas definitivas y lotes hijos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Confirmar el Corte + achique (pantalla)

**Files:**
- Modify: `public/lotes/js/vista-ot-confirmar.js`

**Interfaces:**
- Consumes:
  - `entradas.destinos`, `esItemCorte` e ítems con `hijo` (Task 4);
  - `confirmarOT(..., {achique})` (Task 2);
  - `nombreDestino` e `indiceBase` (Task 1).
- Produces: el flujo de confirmar completo para OT con `achique`.

- [ ] **Step 1: Estado y entradas**

- Imports:
  - `proponer, recalcularItem, compararConMapa, aplicarPropuesta, tipoDestino, ENV_KEYS, esItemCorte` de `propuesta-ot.js`;
  - `import { nombreDestino } from './ot-achique.js';`.
- En `abrirConfirmarOT`:
  ```js
    const st = { ot, onListo, tipo: tipoDestino(ot.plantilla), corte: !!(ot.lote_corte && ot.lote_corte.lote),
                 entradas: null, mapa: null, propuesta: null, paso: 1,
                 operario: '', pasos: false, comentario: '', aplicada: false, faltan: [] };
    // Corte + achique: el vino termina en las vasijas definitivas, no en el pulmon.
    st.achique = st.corte && !!(ot.achique && ot.achique.destinos && ot.achique.destinos.length);
    st.entradas = {
      por_lote: (igual que hoy),
      corte: st.corte && !st.achique ? { vasija: ot.destino || '', cm: '', litros_manual: '' } : null,
      destinos: st.achique ? ot.achique.destinos.map(d => d.tipo === 'tanque'
        ? { vasija: 'T ' + d.num, cm: '', litros_manual: '' }
        : { barricas_llenas: d.barricas ?? '', t50_llenas: d.t50 ?? '', mermas: [] }) : [],
    };
    st.llenasIniciales = st.entradas.por_lote.map(e => e.barricas_llenas);
    st.llenasDestino = st.entradas.destinos.map(e => e.barricas_llenas);
  ```
  La lectura del Mapa de entrada (`leerMapa(ot.lotes.map(...))`) queda igual.

- [ ] **Step 2: Paso 1 con una tarjeta por vasija**

- `_entradaDe`:
  ```js
  function _entradaDe(st, id){
    if (id === 'c') return st.entradas.corte;
    if (String(id).startsWith('d')) return st.entradas.destinos[+String(id).slice(1)];
    return st.entradas.por_lote[+id];
  }
  ```
- Agregar las funciones:
  ```js
  /* Barricas + T50 de un Corte + achique: llenas y mermas, como "TQ a barricas". */
  function _bloqueChicas(k, e){
    const mermas = e.mermas.map((m, j) => `<div class="otc-merma">
        <input class="txt" data-dk="${k}" data-j="${j}" data-f="barril" value="${escA(m.barril)}" placeholder="N° barril">
        <input class="txt otc-num" type="number" step="any" min="0" data-dk="${k}" data-j="${j}" data-f="litros" value="${escA(m.litros)}" placeholder="litros">
        <button class="btn" data-dquitar="${k}:${j}" title="Quitar">✕</button></div>`).join('');
    return `<label>Barricas llenas <input class="txt otc-num" type="number" min="0" step="1" data-dk="${k}" data-f="barricas_llenas" value="${escA(e.barricas_llenas)}"></label>
      <label>T50 llenos <input class="txt otc-num" type="number" min="0" step="1" data-dk="${k}" data-f="t50_llenas" value="${escA(e.t50_llenas)}"></label>
      <div class="otc-mermas">${mermas}<button class="btn" data-dagregar="${k}">+ Barrica merma</button></div>`;
  }

  function _bloqueAchique(st){
    const filas = st.ot.achique.destinos.map((d, k) => {
      const e = st.entradas.destinos[k];
      const quien = d.nuevo ? 'lote nuevo ' + esc(d.lote) : 'lote del corte ' + esc(d.lote);
      return `<div class="otc-corte"><b>${esc(nombreDestino(d))} · ${quien}</b>
        <span style="color:var(--muted)">(${esc(fmtL(d.litros))} previstos)</span><br>
        ${d.tipo === 'tanque' ? _bloqueTanque('d' + k, e) : _bloqueChicas(k, e)}</div>`;
    }).join('');
    return `<div style="color:var(--muted);font-size:13px;margin-bottom:6px">El vino pasa por ${esc(st.ot.destino || 'el pulmón')} y termina en estas vasijas (el pulmón queda vacío):</div>${filas}`;
  }
  ```
- En `_paso1`:
  - en `filas`: `const destino = st.corte ? \`<span style="color:var(--muted)">${st.achique ? 'va al pulmón' : 'va al tanque del corte'}</span>\` : ...`;
  - `const corte = !st.corte ? '' : st.achique ? _bloqueAchique(st) : \`<div class="otc-corte">...(igual que hoy)...</div>\`;`.
- En el click de `box`, agregar antes de los handlers existentes:
  ```js
      const dag = ev.target.closest('[data-dagregar]'), dqu = ev.target.closest('[data-dquitar]');
      if (dag){
        _guardarCabecera(st);
        const k = +dag.dataset.dagregar, e = st.entradas.destinos[k], ini = st.llenasDestino[k];
        // I3: igual que en los lotes: las previstas ya incluyen la que quedo merma.
        if (ini !== '' && ini != null && Number(ini) > 0 && String(e.barricas_llenas) === String(ini))
          e.barricas_llenas = Number(ini) - 1;
        e.mermas.push({ barril: '', litros: '' });
        return _paso1(st);
      }
      if (dqu){ _guardarCabecera(st); const [k, j] = dqu.dataset.dquitar.split(':').map(Number);
        st.entradas.destinos[k].mermas.splice(j, 1); return _paso1(st); }
  ```
  Ojo: el selector de quitar de los lotes es `[data-quitar]`, distinto de `[data-dquitar]`. No chocan.
- `_leerCampo`: después de la rama `data-id`, agregar:
  ```js
    if (el.dataset.dk != null){
      const e = st.entradas.destinos[+el.dataset.dk];
      if (el.dataset.j != null) e.mermas[+el.dataset.j][f] = el.value; else e[f] = el.value;
      return;
    }
  ```
- Al final de `_paso1`: `if (st.corte && !st.achique) _pintarCalc(st, 'c');` y `if (st.achique) st.ot.achique.destinos.forEach((d, k) => { if (d.tipo === 'tanque') _pintarCalc(st, 'd' + k); });`.

- [ ] **Step 3: Paso 1 → 2 (validaciones y Mapa)**

En `_irAPaso2`:
- La validación de tanques pasa a ser:
  ```js
    if (st.tipo === 'tanque'){
      if (st.achique){
        const k = st.ot.achique.destinos.findIndex((d, i) => d.tipo === 'tanque' && !String(st.entradas.destinos[i].vasija || '').trim());
        if (k !== -1) return err('Falta el tanque de ' + nombreDestino(st.ot.achique.destinos[k]) + '.');
      } else if (st.corte){
        if (!String(st.entradas.corte.vasija || '').trim()) return err('Falta el tanque destino del corte.');
      } else { ...igual que hoy... }
    }
  ```
- Lotes a leer del Mapa: sumar los hijos:
  ```js
    const lotes = st.ot.lotes.map(l => l.lote).concat(st.corte ? [st.ot.lote_corte.lote] : [])
      .concat(st.achique ? st.ot.achique.destinos.filter(d => d.nuevo).map(d => d.lote) : []);
  ```
- Mermas: sumar las de las chicas:
  ```js
    const mermasDestinos = st.achique ? st.entradas.destinos.flatMap(e => e.mermas || []) : [];
    const nums = st.entradas.por_lote.flatMap(e => (e.mermas || []).map(m => String(m.barril || '').trim()))
      .concat(mermasDestinos.map(m => String(m.barril || '').trim())).filter(Boolean);
  ```
- Después del `forEach` que completa `cap` y `mapa_ts` de las mermas de los lotes, agregar lo mismo para los destinos:
  ```js
    if (st.achique) st.entradas.destinos.forEach((e, k) => { for (const m of e.mermas || []){
      const b = st.mapa.por_num[String(m.barril).trim()];
      if (!b) continue;
      m.cap = b.cap;
      const yaLleno = b.estado === 'LLENO' && codigoLote(b.lote) === codigoLote(st.ot.achique.destinos[k].lote);
      m.mapa_ts = yaLleno ? (b.ts ?? null) : null;
    } });
  ```
  (Va dentro del mismo `if (nums.length){ ... }`, después de la validación de que existen en el Mapa.)
- `_engancharOT`, la firma `lotes`:
  ```js
    const lotes = o => (o.lotes || []).map(l => String(l.lote)).join('|') + '#' + String((o.lote_corte && o.lote_corte.lote) || '')
      + '#' + ((o.achique && o.achique.destinos) || []).map(d => String(d.lote)).join('|');
  ```

- [ ] **Step 4: Paso 2 y aplicar**

- En `_paso2`, la celda del lote:
  ```js
      <td><b>${esc(it.lote)}</b>${it.indice == null ? `<br><span style="color:var(--muted)">${it.hijo != null
        ? 'lote nuevo · ' + esc(nombreDestino(st.ot.achique.destinos[it.hijo])) : 'lote del corte'}</span>` : ''}</td>
  ```
- En `_aplicar`:
  - `const corteItem = st.corte ? st.propuesta.items.find(esItemCorte) : null;`
  - `sinLitros`:
    ```js
      const sinLitros = st.corte
        ? st.propuesta.items.some(x => x.indice == null && x.litros_llegados == null)
        : st.propuesta.items.some(it => it.indice != null && it.litros_llegados == null);
    ```
  - `destino_real` de `por_lote`: `st.corte ? (st.achique ? st.ot.destino : (st.entradas.corte.vasija || st.ot.destino)) : ...` (resto igual).
  - Antes de `confirmarOT`:
    ```js
      // Corte + achique: lo que llego a cada vasija definitiva (la base es el item del corte).
      const achique = st.achique ? st.ot.achique.destinos.map((d, k) => {
        const it = st.propuesta.items.find(x => x.hijo === k) || (d.nuevo ? null : corteItem);
        const e = st.entradas.destinos[k];
        const destino_real = d.tipo === 'tanque' ? (String(e.vasija || '').trim() || nombreDestino(d))
          : nombreDestino({ tipo: 'chicas', barricas: e.barricas_llenas, t50: e.t50_llenas });
        return { destino_real, litros_reales: it ? it.litros_llegados : null };
      }) : [];
    ```
    y pasar `achique` en el objeto de reales de `confirmarOT` (`{ operario, pasos_cumplidos, comentario, por_lote, achique }`).

- [ ] **Step 5: Tests automáticos**

Run: `npx vitest run test/lotes-ot-*.test.mjs test/lotes-propuesta-ot.test.mjs test/lotes-sin-ventanas-nativas.test.ts`
Expected: PASS.

- [ ] **Step 6: Verificar en el navegador (mock :8820)**

Con la OT emitida en la Task 7 (o emitir una nueva: T 206 + T 209):

1. Órdenes de trabajo → ✓ Confirmar. Paso 1: los orígenes dicen "va al pulmón" y hay dos tarjetas, "T 206 · lote del corte 26323" y "T 209 · lote nuevo 26324", cada una con cm/litros.
2. Cargar cm en T 206 y litros a mano en T 209. Ver el cálculo en vivo ("… L de 7.500 L").
3. Siguiente → paso 2:
   - filas de los 3 orígenes en 0, 26323 "lote del corte" con lo de T 206, 26324 "lote nuevo · T 209" con lo de T 209;
   - la merma repartida entre los orígenes;
   - destildar uno destilda todos.
4. Aplicar y guardar.
   - En Lotes: 26323 en T 206 y 26324 en T 209 con sus litros; los orígenes en 0.
   - En Historial: el traspaso 26323 → 26324 ejecutado con los litros de T 209.
   - La ficha de 26324: el linaje cuelga de 26323.
5. Borrar la OT desde Movimientos → "Borrar y deshacer". Todos vuelven al antes, y el aviso menciona los lotes 26323 y 26324 (no se borran).
6. Repetir con una OT de solo barricas + T50 y una barrica merma. El lote del corte queda con "N barricas + M T50" y la merma creada.
7. `read_console_messages {onlyErrors:true}` vacío. Screenshot del paso 2.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add public/lotes/js/vista-ot-confirmar.js
git commit -m "feat(lotes): confirmar el Corte + achique con una medida por vasija definitiva

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verificación final y entrega

**Files:** ninguno nuevo (salvo arreglos que aparezcan).

- [ ] **Step 1: Suite completa**

Run: `cd C:/Users/Bmax/repos/catenainstitute-achique && npx tsc --noEmit && npx vitest run`
Expected: typecheck sin errores y todos los tests en verde. Pegar el resumen "Test Files … passed / Tests … passed". Los mensajes `EBUSY … miniflare` del final son ruido de Windows, no fallas.

- [ ] **Step 2: Repaso contra el spec**

Abrir `docs/superpowers/specs/2026-10-26-ot-corte-achique-design.md` y tildar mentalmente cada punto:
- asistente;
- lotes (base / hijos / chicas);
- movimientos y linaje;
- hoja (orden 1–7);
- confirmar (medida por vasija, merma única, todo o nada);
- deshacer;
- inventario;
- lista.

Lo que falte, arreglarlo con su commit.

- [ ] **Step 3: Las OT viejas siguen igual**

En el mock:
1. Emitir un Corte común (sin achique).
2. Confirmarlo.
3. Imprimirlo.

Tiene que comportarse como antes: tarjeta "Tanque del corte", una sola hoja.

- [ ] **Step 4: Push de la rama (NO a main)**

```bash
git branch --show-current   # feat/ot-corte-achique
git push -u origin feat/ot-corte-achique
```

- [ ] **Step 5: Memoria**

Actualizar `C:\Users\Bmax\.claude\projects\C--Users-Bmax-OneDrive---BODEGAS-ESMERALDA-SA-Escritorio-claude\memory\lotes-ot-corte-achique.md` con:
- el estado (head de la rama, pusheada, falta merge del usuario);
- las trampas encontradas.

Actualizar también su línea en `MEMORY.md`.

- [ ] **Step 6: Avisar al usuario**

Decirle:
- la rama;
- qué se verificó y con qué evidencia;
- que el merge a `main` lo hace el usuario, porque push a main = deploy.
