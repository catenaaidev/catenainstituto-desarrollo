# Sobrante al confirmar una OT de trasiego — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al confirmar una OT de trasiego, poder sumar las vasijas que se llenaron de más (detectadas en el Mapa o cargadas a mano), como mismo lote o lote nuevo, sin editar la OT antes.

**Architecture:** Lo agregado vive en el estado del diálogo (`st.agregados`) hasta aplicar. Para el paso 2 se arma una COPIA de la OT con los agregados como `destinos_extra` (`otConAgregados`), así toda la lógica existente de extras (propuesta, validaciones, mermas) los ve igual. Recién en "Aplicar" se incorporan a la OT viva, con sus movimientos y lotes hijos (`incorporarAgregados`). Un extra cuyo lote es el mismo que el de su padre ("mismo lote") no tiene fila propia: su llenado se suma al ítem del lote que lo recibe, en el Corte (ya existe) y ahora también en el trasiego simple.

**Tech Stack:** JS vanilla en `public/lotes/js/` (módulos ES puros + vistas con DOM), tests con vitest (`npx vitest run <archivo>`), Cloudflare Workers (no se toca el server).

**Spec:** `docs/superpowers/specs/2026-11-16-ot-sobrante-al-confirmar-design.md`

## Global Constraints

- Todo en castellano (textos, comentarios, mensajes de commit), mismo estilo de comentarios que el archivo que se toca (sin tildes en comentarios de código si el archivo no las usa).
- Módulos puros (`ot-destinos.js`, `propuesta-ot.js`, `ot-sobrante.js`) sin DOM ni `nucleo.js`: se testean en node.
- Aplica a todas las plantillas de trasiego y Corte (con o sin achique); **no** a Traslado (`tipoDestino === 'salida'`) ni Muestras (`esSinMovimientos`).
- Lote del agregado: por defecto el mismo lote; opción lote nuevo con número del año del vino (`anioDeLote(padre, añoOT)`).
- La hoja impresa no muestra los agregados (`al_confirmar: true`).
- Antes de pushear: `node scripts/precargas.mjs` (el CI `verificar` falla si `public/lotes/index.html` no está al día).
- Push a `main` = producción (Workers Builds): solo con OK del usuario.
- El test `app.js: el modo órdenes arranca dentro del try/finally de main` ya falla en `main`; no es parte de este trabajo.

## Archivos

- Modificar `public/lotes/js/ot-destinos.js` — `esExtraMismoLote` vale también para el trasiego simple; `normalizarExtras` conserva `al_confirmar` y `codigos_mapa`.
- Modificar `public/lotes/js/propuesta-ot.js` — sumar extras "mismo lote" al ítem del lote de origen en el trasiego simple; anotar `extras_mismo` en el ítem que los recibe; `realesDeExtras`; aviso de re-rotular en `itemExtra`.
- Crear `public/lotes/js/ot-sobrante.js` — `sobranteSegunMapa`, `otConAgregados`, `incorporarAgregados`.
- Modificar `public/lotes/js/vista-ot-confirmar.js` — tarjeta del Mapa, "＋ Sobró vino", bloques de agregados, uso de `otConAgregados`/`incorporarAgregados`/`realesDeExtras`, precarga de chicas existentes.
- Modificar `public/lotes/js/ot-hojas.js` — el papel ignora `al_confirmar`.
- Modificar `public/lotes/js/ot-achique.js` — `textoDestinos` marca "(agregado al confirmar)".
- Tests: `test/lotes-propuesta-ot.test.mjs`, `test/lotes-ot-destinos.test.mjs`, crear `test/lotes-ot-sobrante.test.mjs`, `test/lotes-ot-lista.test.mjs`.

---

### Task 1: "Mismo lote" en el trasiego simple + reales de los extras del mismo lote

Hoy (eacdee8) un extra del mismo lote solo se suma en el Corte, y su movimiento queda PENDIENTE al confirmar porque `_aplicar` arma los reales solo de ítems con `extra`. Esta tarea generaliza y arregla eso.

**Files:**
- Modify: `public/lotes/js/ot-destinos.js` (`esExtraMismoLote`, `normalizarExtras`)
- Modify: `public/lotes/js/propuesta-ot.js` (`proponer`, nueva `realesDeExtras`)
- Modify: `public/lotes/js/vista-ot-confirmar.js` (`_aplicar`: usar `realesDeExtras`)
- Test: `test/lotes-ot-destinos.test.mjs`, `test/lotes-propuesta-ot.test.mjs`

**Interfaces:**
- Produces: `esExtraMismoLote(x)` → `true` si `txt(x.d.lote) === txt(x.padre)` (Corte o trasiego simple).
- Produces: cada ítem que recibe extras del mismo lote tiene `extras_mismo: [{ i, k, litros, vasija }]` (`i` null en el Corte).
- Produces: `realesDeExtras(propuesta, entradaExtra) → [{ i, k, destino_real, litros_reales, merma_litros }]`, donde `entradaExtra({i,k})` devuelve la entrada del paso 1.
- Produces: `normalizarExtras` conserva `al_confirmar: true` y `codigos_mapa: string[]` si vienen.

- [ ] **Step 1: Tests que fallan (ot-destinos)**

Agregar al final de `test/lotes-ot-destinos.test.mjs`:

```js
describe('mismo lote en el trasiego simple', () => {
  it('esExtraMismoLote: el extra con el lote de su origen', () => {
    const o = { ot: '0990', destino: 'T 212', lote_corte: null,
      lotes: [{ lote: '26217', destinos_extra: [{ tipo: 'chicas', barricas: 1, t50: 0, lote: '26217', mov_id: 'a' },
                                               { tipo: 'chicas', barricas: 1, t50: 0, lote: '26330', mov_id: 'b' }] }] };
    expect(extrasDeOT(o).map(esExtraMismoLote)).toEqual([true, false]);
  });
  it('normalizarExtras conserva al_confirmar y codigos_mapa', () => {
    const r = normalizarExtras([{ tipo: 'chicas', barricas: 1, t50: 1, lote: '25315', al_confirmar: true, codigos_mapa: ['1250070', '50138'] }], 'ot-1', 's');
    expect(r[0]).toMatchObject({ al_confirmar: true, codigos_mapa: ['1250070', '50138'] });
    expect(normalizarExtras([{ num: '214', lote: '26330' }], 'ot-1', 'x0')[0]).not.toHaveProperty('al_confirmar');
  });
});
```

- [ ] **Step 2: Tests que fallan (propuesta)**

Agregar al final de `test/lotes-propuesta-ot.test.mjs` (importar `realesDeExtras` en el import de `propuesta-ot.js`):

```js
describe('trasiego simple con barricas extra del mismo lote', () => {
  const PAD = [{ num: '212', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: null, activa: true },
               { num: '189', tipo: 'TANQUE AC.INOX.', cap_real: 4200, tabla: null, activa: true }];
  const armar = (llenas = 2) => {
    const lotes = [{ lote: 26217, vasija_grande: 4000, vasija_actual: 'T 189', litros_actuales: 4000 }];
    const o = { id: 'ot-9', ot: '0990', plantilla: 'tq-tq', fecha: '2026-11-12', destino: 'T 212', lote_corte: null,
      lotes: [{ lote: '26217', tanques: [{ num: '189', litros: 4000 }], barriles: [], otras: [], litros_previstos: 4000, mov_id: 'ot-9-0',
        destinos_extra: [{ tipo: 'chicas', barricas: 2, t50: 0, litros: null, lote: '26217', nuevo: false, mov_id: 'ot-9-s-0', al_confirmar: true }] }] };
    const p = proponer({ ot: o, lotes, mermas: [], padron: PAD, hoy: 'x',
      entradas: { por_lote: [{ vasija: 'T 212', cm: '', litros_manual: 3500, merma: '',
        extras: [{ barricas_llenas: llenas, t50_llenas: 0, mermas: [], merma: '' }] }], corte: null } });
    return { o, p, lotes };
  };
  it('no hay fila aparte: el lote recibe el tanque y las barricas', () => {
    const { p } = armar();
    expect(p.items).toHaveLength(1);
    const it0 = p.items[0];
    expect(it0.despues).toMatchObject({ vasija_grande: 3500, cap225: 2 });
    expect(it0.despues.vasija_actual).toBe('T 212 + 2 barricas');
    expect(it0.litros_llegados).toBe(3950);
    expect(it0.merma_litros).toBe(50);
    expect(it0.extras_mismo).toEqual([{ i: 0, k: 0, litros: 450, vasija: '2 barricas' }]);
  });
  it('sin llenas: bloquea el lote', () => {
    expect(armar(0).p.items[0].bloqueado).toBe(true);
  });
  it('realesDeExtras: el extra del mismo lote tambien tiene sus reales', () => {
    const { p } = armar();
    expect(realesDeExtras(p, () => ({}))).toEqual([{ i: 0, k: 0, destino_real: '2 barricas', litros_reales: 450, merma_litros: null }]);
  });
});

describe('corte: el extra del mismo lote anota extras_mismo', () => {
  it('con la 0967', () => {
    const PAD = [{ num: '48', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: null, activa: true }];
    const lotes = [{ lote: 25312, vasija_grande: 4000, vasija_actual: 'T 199', litros_actuales: 4000 },
                   { lote: 25315, cap225: 2, vasija_actual: '2 barricas', litros_actuales: 450 }];
    const o = { id: 'ot-c', ot: '0967', plantilla: 'barricas-tanque', fecha: '2026-11-12', destino: 'T 48',
      lote_corte: { lote: '25315', existente: true },
      lotes: [{ lote: '25312', tanques: [{ num: '199', litros: 4000 }], barriles: [], otras: [], litros_previstos: 4000, mov_id: 'ot-c-0' }],
      destinos_extra: [{ tipo: 'chicas', barricas: 1, t50: 1, litros: null, lote: '25315', mov_id: 'ot-c-xc-0' }] };
    const p = proponer({ ot: o, lotes, mermas: [], padron: PAD, hoy: 'x',
      entradas: { por_lote: [{}], corte: { vasija: 'T 48', cm: '', litros_manual: 3700 },
                  extras: [{ barricas_llenas: 1, t50_llenas: 1, mermas: [], merma: '' }] } });
    const c = p.items.find(x => x.lote === '25315');
    expect(c.extras_mismo).toEqual([{ i: null, k: 0, litros: 275, vasija: '1 barrica + 1 T50' }]);
    expect(realesDeExtras(p, () => ({}))).toEqual([{ i: null, k: 0, destino_real: '1 barrica + 1 T50', litros_reales: 275, merma_litros: null }]);
  });
});
```

Nota: el texto de vasija que arma `llenadoDeEntrada(…,'barricas')` puede ser distinto ("1 barrica + 1 T50" vs "1 barrica · 1 T50"). Correr el test y, si difiere, ajustar el **valor esperado** al formato real de `ll.vasija_texto` (no cambiar `llenadoDeEntrada`).

- [ ] **Step 3: Correr y ver que fallan**

Run: `npx vitest run test/lotes-ot-destinos.test.mjs test/lotes-propuesta-ot.test.mjs`
Expected: FAIL (`esExtraMismoLote` devuelve false en trasiego; `realesDeExtras` no existe; 2 ítems en vez de 1).

- [ ] **Step 4: Implementar en `ot-destinos.js`**

```js
/* x = un item de extrasDeOT. El extra que sigue siendo el lote que lo llena
 * (Corte: el lote del corte; trasiego simple: el lote de origen). */
export const esExtraMismoLote = x => !!x && !!txt(x.d && x.d.lote) && txt(x.d.lote) === txt(x.padre);
```

En `normalizarExtras`, al final del objeto devuelto por cada fila:

```js
    nuevo: true, mov_id: d.mov_id || nuevoId(),
    ...(d.al_confirmar ? { al_confirmar: true } : {}),
    ...(Array.isArray(d.codigos_mapa) && d.codigos_mapa.length ? { codigos_mapa: d.codigos_mapa.map(String) } : {}) }));
```

- [ ] **Step 5: Implementar en `propuesta-ot.js`**

a) En el bloque del Corte, donde se arma `mismos` (eacdee8), guardar también `x`:

```js
    const mismosX = extras.filter(esExtraMismoLote);
    const mismos = mismosX.map(x => llenadoExtra(x, (entradas.extras || [])[x.k], padron));
```

y al armar `corteItem` (rama con `loteCorte`) agregar:

```js
        extras_mismo: mismosX.map((x, j) => ({ i: null, k: x.k, litros: mismos[j].litros, vasija: mismos[j].vasija_texto || nombreExtra(x.d) })),
```

b) Trasiego simple: reemplazar el bloque `if (!corte && extras.length){ for (const x of extras){ … items.push(it); } …` por una versión que primero suma los del mismo lote al ítem de origen:

```js
  const extras = extrasDeOT(ot);
  if (!corte && extras.length){
    // Extras del mismo lote (agregados al confirmar): no tienen fila; lo
    // llenado se suma al item de su lote, como en el Corte.
    for (const x of extras.filter(esExtraMismoLote)){
      const o = items.find(y => y.indice === x.i);
      if (!o || !o.despues) continue;
      const ll = llenadoExtra(x, (((entradas.por_lote || [])[x.i] || {}).extras || [])[x.k], padron);
      const v = ll.vasija_texto || nombreExtra(x.d);
      o.despues = { ...sumar(o.despues, ll.llenado), vasija_actual: [String(o.despues.vasija_actual || '').trim(), v].filter(Boolean).join(' + ') };
      o.litros_llegados = o.litros_llegados == null || ll.litros == null ? null : r1(o.litros_llegados + ll.litros);
      o.merma_litros = o.litros_origen != null && o.litros_llegados != null ? r1(o.litros_origen - o.litros_llegados) : null;
      o.mermas_nuevas.push(...ll.mermas.map(m => ({ lote: String(x.d.lote), barril: m.barril, cap: m.cap, litros: m.litros,
        desde: ot.fecha || hoy, ot: ot.ot, mapa_ts: m.mapa_ts ?? null })));
      o.avisos.push(...ll.avisos);
      if (ll.bloqueado) o.bloqueado = true;
      (o.extras_mismo || (o.extras_mismo = [])).push({ i: x.i, k: x.k, litros: ll.litros, vasija: v });
      anotarVaciado(o, o.vaciado);
      recalcularItem(o, mermas);
    }
    for (const x of extras.filter(y => !esExtraMismoLote(y))){
      const it = itemExtra(x, (((entradas.por_lote || [])[x.i] || {}).extras || [])[x.k], buscar, padron, mermas, ot, hoy);
      items.push(it);
    }
    // … (el resto del bloque, el reparto de merma con `suyos`, queda igual)
```

Verificar en el código que `anotarVaciado(item, vaciado)` acepta el vaciado guardado en `item.vaciado` (lo escribe la propia función); si el ítem no tenía `vaciado`, pasar `null`. El orden importa: este bloque corre después de que `ot.lotes.forEach` armó los ítems de origen y antes del reparto de merma con `suyos`, que ya no incluye los del mismo lote.

c) Nueva función exportada, debajo de `proponer`:

```js
/* Lo que se registra al confirmar de cada destino extra: los que tienen fila
 * (lote nuevo) con lo medido y su merma; los del mismo lote, con lo llenado
 * (su merma ya esta en la del lote). entradaExtra({i,k}) = entrada del paso 1. */
export function realesDeExtras(propuesta, entradaExtra){
  const out = [];
  for (const it of propuesta.items){
    if (it.extra){
      const e = entradaExtra(it.extra) || {};
      out.push({ i: it.extra.i, k: it.extra.k,
        destino_real: String(e.vasija || '').trim() || String((it.despues && it.despues.vasija_actual) || ''),
        litros_reales: it.litros_llegados, merma_litros: it.merma_litros });
    }
    for (const m of it.extras_mismo || [])
      out.push({ i: m.i, k: m.k, destino_real: m.vasija, litros_reales: m.litros, merma_litros: null });
  }
  return out;
}
```

- [ ] **Step 6: Usar `realesDeExtras` en `vista-ot-confirmar.js`**

En `_aplicar`, reemplazar el bloque `const extras = st.propuesta.items.filter(x => x.extra).map(it => { … });` por:

```js
    // Destinos extra: lo medido en cada uno (y los del mismo lote, lo llenado).
    const extras = realesDeExtras(st.propuesta, x => _entradaExtra(st, x));
```

y agregar `realesDeExtras` al import de `./propuesta-ot.js`.

- [ ] **Step 7: Correr los tests**

Run: `npx vitest run test/lotes-ot-destinos.test.mjs test/lotes-propuesta-ot.test.mjs test/lotes-ot-armado.test.mjs`
Expected: PASS (incluidos los tests de eacdee8 de "corte con barricas extra del mismo lote").

- [ ] **Step 8: Commit**

```bash
git add public/lotes/js/ot-destinos.js public/lotes/js/propuesta-ot.js public/lotes/js/vista-ot-confirmar.js test/lotes-ot-destinos.test.mjs test/lotes-propuesta-ot.test.mjs
git commit -m "feat(lotes): extra del mismo lote tambien en el trasiego simple y con sus reales al confirmar"
```

---

### Task 2: `sobranteSegunMapa` (qué llenó el Mapa que la OT no preveía)

**Files:**
- Create: `public/lotes/js/ot-sobrante.js`
- Test: `test/lotes-ot-sobrante.test.mjs`

**Interfaces:**
- Consumes: `escaneosPorLote`, `capNormal` de `propuesta-ot.js`; `esChicas`, `extrasDeOT` de `ot-destinos.js`; `codigoLote` de `mermas.js`.
- Produces: `sobranteSegunMapa(ot, porLote, tipo) → [{ i, lote, barricas, t50, codigos: string[], sinCap: string[] }]` — `i` null = lote del corte; `tipo` = `tipoDestino(ot.plantilla)`.

- [ ] **Step 1: Test que falla**

Crear `test/lotes-ot-sobrante.test.mjs`:

```js
/* Sobrante al confirmar (spec 2026-11-16-ot-sobrante-al-confirmar-design.md). Puro. */
import { describe, it, expect } from 'vitest';
import { sobranteSegunMapa } from '../public/lotes/js/ot-sobrante.js';
import { escaneosPorLote } from '../public/lotes/js/propuesta-ot.js';

const LL = (lote, barriles) => ({ ot: '0967', lote, tipo: 'llenado', fecha: '2026-11-16', barriles });
const OT0967 = (dx = {}) => ({ id: 'ot-c', ot: '0967', plantilla: 'barricas-tanque', destino: 'T 48',
  lote_corte: { lote: '25315', existente: true }, lotes: [{ lote: '25312' }], ...dx });

describe('sobranteSegunMapa', () => {
  it('0967: la barrica y el T50 llenados en el Mapa son sobrante del lote del corte', () => {
    const p = escaneosPorLote([LL('25315', [{ num: '1250070', cap: 225 }, { num: '50138', cap: 50 }])]);
    expect(sobranteSegunMapa(OT0967(), p, 'tanque')).toEqual([
      { i: null, lote: '25315', barricas: 1, t50: 1, codigos: ['1250070', '50138'], sinCap: [] }]);
  });
  it('si la OT ya tiene barricas/T50 extra para ese lote, no hay sobrante', () => {
    const p = escaneosPorLote([LL('25315', [{ num: '1250070', cap: 225 }])]);
    const o = OT0967({ destinos_extra: [{ tipo: 'chicas', barricas: 1, t50: 0, lote: '25315', mov_id: 'z' }] });
    expect(sobranteSegunMapa(o, p, 'tanque')).toEqual([]);
  });
  it('trasiego a tanque: por lote de origen', () => {
    const o = { id: 'ot-9', ot: '0990', plantilla: 'tq-tq', destino: 'T 212', lote_corte: null, lotes: [{ lote: '26217' }, { lote: '26105' }] };
    const p = escaneosPorLote([LL('26105', [{ num: '3100', cap: 228 }])]);
    expect(sobranteSegunMapa(o, p, 'tanque')).toEqual([{ i: 1, lote: '26105', barricas: 1, t50: 0, codigos: ['3100'], sinCap: [] }]);
  });
  it('trasiego a barricas: los llenados son el destino normal', () => {
    const o = { id: 'ot-9', ot: '0990', plantilla: 'tq-barricas', destino: '', lote_corte: null, lotes: [{ lote: '26217' }] };
    expect(sobranteSegunMapa(o, escaneosPorLote([LL('26217', [{ num: '1', cap: 225 }])]), 'barricas')).toEqual([]);
  });
  it('barril de capacidad rara: va aparte y no se cuenta', () => {
    const p = escaneosPorLote([LL('25315', [{ num: '9', cap: 1000 }, { num: '1250070', cap: 225 }])]);
    expect(sobranteSegunMapa(OT0967(), p, 'tanque')[0]).toMatchObject({ barricas: 1, t50: 0, codigos: ['1250070'], sinCap: ['9'] });
  });
  it('sin escaneos: nada', () => {
    expect(sobranteSegunMapa(OT0967(), {}, 'tanque')).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/lotes-ot-sobrante.test.mjs`
Expected: FAIL ("Failed to load url ../public/lotes/js/ot-sobrante.js").

- [ ] **Step 3: Implementar**

Crear `public/lotes/js/ot-sobrante.js`:

```js
/* ===== Lotes CIW — sobrante al confirmar una OT de trasiego (puro) =====
 *
 * Al trasegar muchas veces el vino no entra todo en el destino y se llena
 * alguna vasija de mas (OT 0967: T 48 + 1 barrica + 1 T50). Al confirmar se
 * puede sumar a la OT (spec 2026-11-16-ot-sobrante-al-confirmar-design.md):
 *   - el Mapa lo detecta (llenados con el n° de esta OT que la OT no preveia);
 *   - o se carga a mano ("＋ Sobró vino").
 * Lo agregado es un destino extra mas (ot-destinos.js) con al_confirmar: true;
 * si lleva el mismo lote que su padre, se suma al lote (sin hijo). */
'use strict';

import { capNormal } from './propuesta-ot.js';
import { esChicas } from './ot-destinos.js';
import { codigoLote } from './mermas.js';

const txt = v => String(v ?? '').trim();

/* Los lotes que reciben vino en un TANQUE: el del corte, o cada origen en un
 * trasiego a tanque. Un lote que ya tiene barricas/T50 de destino (extra
 * 'chicas' o vasija 'chicas' del achique) no se mira: ahi los llenados del
 * Mapa son lo previsto. tipo = tipoDestino(ot.plantilla). */
export function sobranteSegunMapa(ot, porLote, tipo){
  if (tipo !== 'tanque' || !ot) return [];
  const corte = ot.lote_corte && txt(ot.lote_corte.lote);
  const candidatos = corte
    ? [{ i: null, lote: corte, tieneChicas: (ot.destinos_extra || []).some(esChicas)
        || ((ot.achique && ot.achique.destinos) || []).some(d => d && d.tipo === 'chicas') }]
    : (ot.lotes || []).map((l, i) => ({ i, lote: txt(l.lote), tieneChicas: (l.destinos_extra || []).some(esChicas) }));
  const out = [];
  for (const c of candidatos){
    if (c.tieneChicas) continue;
    const g = (porLote || {})[codigoLote(c.lote)];
    if (!g || !g.llenados || !g.llenados.length) continue;
    let barricas = 0, t50 = 0;
    const codigos = [], sinCap = [];
    for (const x of g.llenados){
      const cap = capNormal(x.cap);
      if (cap === 50){ t50++; codigos.push(String(x.num)); }
      else if (cap === 225){ barricas++; codigos.push(String(x.num)); }
      else sinCap.push(String(x.num));
    }
    if (barricas || t50) out.push({ i: c.i, lote: c.lote, barricas, t50, codigos, sinCap });
  }
  return out;
}
```

Verificar en `propuesta-ot.js` que `capNormal` está exportada y que devuelve `50` para un T50 y `225` para 228/300 (el test de `capNormal` lo confirma). Si `capNormal(50)` no devuelve 50, usar la misma comparación que `llenadoSegunMapa` (`if (c === 50) … else if (c) …`) y mandar a `sinCap` solo los `null`; ajustar el test "capacidad rara" en consecuencia.

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run test/lotes-ot-sobrante.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/ot-sobrante.js test/lotes-ot-sobrante.test.mjs
git commit -m "feat(lotes): sobranteSegunMapa detecta las vasijas llenadas que la OT no preveia"
```

---

### Task 3: `otConAgregados` e `incorporarAgregados` + aviso de re-rotular

**Files:**
- Modify: `public/lotes/js/ot-sobrante.js`
- Modify: `public/lotes/js/propuesta-ot.js` (`itemExtra`: aviso)
- Test: `test/lotes-ot-sobrante.test.mjs`, `test/lotes-propuesta-ot.test.mjs`

**Interfaces:**
- Consumes: `normalizarExtras`, `extrasDeOT`, `movimientosDeExtras`, `armarHijosExtra`, `esExtraMismoLote` (ot-destinos.js), `movIdsDeOT` (ot-achique.js).
- Produces: un agregado es `{ i: number|null, tipo: 'chicas'|'tanque', barricas?, t50?, num?, lote: string, codigos?: string[] }`.
- Produces: `otConAgregados(ot, agregados) → ot` — copia (sin tocar `ot`) con los agregados al final de `destinos_extra` del corte (`i` null) o del lote `i`, normalizados con `al_confirmar: true` y `mov_id` `${ot.id}-s-${n}` sin chocar con `movIdsDeOT(ot)`. Los índices `k` de cada agregado son `largoPrevio + posición` dentro de su lista.
- Produces: `incorporarAgregados(datos, ot, agregados, usuario, hoy, fichaDe) → { hijos: lote[] }` — muta `ot` (mismos extras que `otConAgregados`, mismos `mov_id`), agrega a `datos.movimientos` el movimiento PENDIENTE de cada agregado (lo pasa a EJECUTADO `confirmarOT`) y a `datos.lotes` los hijos (los devuelve para `fijar`). `fichaDe(lote)` = ficha del padre.

- [ ] **Step 1: Tests que fallan**

Agregar a `test/lotes-ot-sobrante.test.mjs` (import `otConAgregados, incorporarAgregados` además de `sobranteSegunMapa`):

```js
describe('otConAgregados', () => {
  const ot = () => ({ id: 'ot-c', ot: '0967', destino: 'T 48', fecha: '2026-11-12', lote_corte: { lote: '25315' },
    lotes: [{ lote: '25312', mov_id: 'ot-c-0' }], destinos_extra: [{ tipo: 'tanque', num: '214', litros: null, lote: '25330', nuevo: true, mov_id: 'ot-c-xc-0' }] });
  it('suma al final, con al_confirmar y mov_id propio, sin tocar la OT original', () => {
    const o = ot();
    const c = otConAgregados(o, [{ i: null, tipo: 'chicas', barricas: 1, t50: 1, lote: '25315', codigos: ['1250070', '50138'] }]);
    expect(o.destinos_extra).toHaveLength(1);
    expect(c.destinos_extra[1]).toMatchObject({ tipo: 'chicas', barricas: 1, t50: 1, lote: '25315', al_confirmar: true,
      codigos_mapa: ['1250070', '50138'], mov_id: 'ot-c-s-0' });
  });
  it('en un trasiego simple, al lote i', () => {
    const o = { id: 'ot-9', ot: '0990', destino: 'T 212', lote_corte: null, lotes: [{ lote: '26217', mov_id: 'ot-9-0' }] };
    const c = otConAgregados(o, [{ i: 0, tipo: 'tanque', num: 'T 214', lote: '26217' }]);
    expect(c.lotes[0].destinos_extra[0]).toMatchObject({ tipo: 'tanque', num: '214', lote: '26217', al_confirmar: true });
    expect(o.lotes[0].destinos_extra).toBeUndefined();
  });
});

describe('incorporarAgregados', () => {
  it('mismo lote: extra + movimiento trasiego, sin hijo', () => {
    const datos = { lotes: [{ lote: 25315 }], movimientos: [] };
    const o = { id: 'ot-c', ot: '0967', destino: 'T 48', fecha: '2026-11-12', lote_corte: { lote: '25315' }, lotes: [{ lote: '25312', mov_id: 'ot-c-0' }] };
    const r = incorporarAgregados(datos, o, [{ i: null, tipo: 'chicas', barricas: 1, t50: 1, lote: '25315' }], 'ana', 'x', () => ({ lote: 25315 }));
    expect(o.destinos_extra[0]).toMatchObject({ lote: '25315', al_confirmar: true, mov_id: 'ot-c-s-0' });
    expect(datos.movimientos).toEqual([expect.objectContaining({ id: 'ot-c-s-0', lote: '25315', tipo: 'trasiego', lote_destino: '' })]);
    expect(r.hijos).toEqual([]);
  });
  it('lote nuevo: traspaso padre -> hijo y el hijo creado', () => {
    const datos = { lotes: [{ lote: 25315, id_texto: 'Componente NCZ 2025' }], movimientos: [] };
    const o = { id: 'ot-c', ot: '0967', destino: 'T 48', fecha: '2026-11-12', lote_corte: { lote: '25315' }, lotes: [{ lote: '25312', mov_id: 'ot-c-0' }] };
    const r = incorporarAgregados(datos, o, [{ i: null, tipo: 'chicas', barricas: 1, t50: 0, lote: '25316' }], 'ana', 'x',
      l => datos.lotes.find(x => String(x.lote) === String(l)));
    expect(datos.movimientos[0]).toMatchObject({ tipo: 'traspaso', lote: '25315', lote_destino: '25316' });
    expect(r.hijos.map(h => h.lote)).toEqual([25316]);
    expect(datos.lotes.some(l => l.lote === 25316)).toBe(true);
  });
});
```

Y en `test/lotes-propuesta-ot.test.mjs`, dentro de `describe('tanques destino extra (2026-11-12)'…)` no: crear un describe nuevo:

```js
describe('agregado al confirmar como lote nuevo con barricas del Mapa', () => {
  it('avisa que hay que re-rotular en el Mapa', () => {
    const lotes = [{ lote: 26217, vasija_grande: 4000, vasija_actual: 'T 189', litros_actuales: 4000 }, { lote: 26330, litros_actuales: 0 }];
    const PAD = [{ num: '212', tipo: 'T', cap_real: 7500, tabla: null, activa: true }, { num: '189', tipo: 'T', cap_real: 4200, tabla: null, activa: true }];
    const o = { id: 'ot-9', ot: '0990', plantilla: 'tq-tq', fecha: 'x', destino: 'T 212', lote_corte: null,
      lotes: [{ lote: '26217', tanques: [{ num: '189', litros: 4000 }], barriles: [], otras: [], litros_previstos: 4000, mov_id: 'ot-9-0',
        destinos_extra: [{ tipo: 'chicas', barricas: 1, t50: 0, litros: null, lote: '26330', nuevo: true, mov_id: 'ot-9-s-0', al_confirmar: true, codigos_mapa: ['3100'] }] }] };
    const p = proponer({ ot: o, lotes, mermas: [], padron: PAD, hoy: 'x',
      entradas: { por_lote: [{ vasija: 'T 212', cm: '', litros_manual: 3700, merma: '', extras: [{ barricas_llenas: 1, t50_llenas: 0, mermas: [], merma: '' }] }], corte: null } });
    expect(p.items.find(x => x.extra).avisos).toContain('Re-rotulá en el Mapa 3100 al lote 26330.');
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run test/lotes-ot-sobrante.test.mjs test/lotes-propuesta-ot.test.mjs`
Expected: FAIL (`otConAgregados` no existe; falta el aviso).

- [ ] **Step 3: Implementar en `ot-sobrante.js`**

```js
import { normalizarExtras, extrasDeOT, movimientosDeExtras, armarHijosExtra } from './ot-destinos.js';
import { movIdsDeOT } from './ot-achique.js';

/* La fila que se guarda de un agregado (antes de normalizar). */
const filaDe = a => ({ ...(a.tipo === 'chicas' ? { tipo: 'chicas', barricas: a.barricas, t50: a.t50 } : { tipo: 'tanque', num: a.num }),
  litros: null, lote: txt(a.lote), al_confirmar: true, ...(a.codigos && a.codigos.length ? { codigos_mapa: a.codigos } : {}) });

/* Suma los agregados a `ot` (la muta). mov_id ${ot.id}-s-N sin chocar. */
function sumarAOT(ot, agregados){
  const ocupados = movIdsDeOT(ot);
  const nuevos = [];
  for (const a of agregados || []){
    const destino = a.i == null ? ot : ot.lotes[a.i];
    const [d] = normalizarExtras([filaDe(a)], ot.id, 's', [...ocupados, ...nuevos.map(x => x.mov_id)]);
    if (!d) continue;
    destino.destinos_extra = [...(destino.destinos_extra || []), d];
    nuevos.push(d);
  }
  return nuevos;
}

/* Copia de la OT con los agregados como destinos extra (para la propuesta
 * del paso 2). No toca `ot`. */
export function otConAgregados(ot, agregados){
  const c = { ...ot, lotes: (ot.lotes || []).map(l => ({ ...l, ...(l.destinos_extra ? { destinos_extra: [...l.destinos_extra] } : {}) })),
    ...(ot.destinos_extra ? { destinos_extra: [...ot.destinos_extra] } : {}) };
  sumarAOT(c, agregados);
  return c;
}

/* Al aplicar: los agregados quedan en la OT viva, cada uno con su movimiento
 * (PENDIENTE: confirmarOT lo pasa a EJECUTADO con los reales) y, si es lote
 * nuevo, su lote hijo. Devuelve los hijos creados (para fijarlos en la grilla). */
export function incorporarAgregados(datos, ot, agregados, usuario, hoy, fichaDe){
  const nuevos = new Set(sumarAOT(ot, agregados).map(d => d.mov_id));
  if (!Array.isArray(datos.movimientos)) datos.movimientos = [];
  datos.movimientos.push(...movimientosDeExtras(ot, usuario, hoy).filter(m => nuevos.has(m.id)));
  const soloNuevos = { ...ot, destinos_extra: (ot.destinos_extra || []).filter(d => nuevos.has(d.mov_id)),
    lotes: (ot.lotes || []).map(l => ({ ...l, destinos_extra: (l.destinos_extra || []).filter(d => nuevos.has(d.mov_id)) })) };
  const hijos = armarHijosExtra(soloNuevos, fichaDe, datos.lotes || []);
  for (const h of hijos) datos.lotes.unshift(h);
  return { hijos };
}
```

Nota: `normalizarExtras` recibe `ocupados` como 4.º parámetro y genera `${otId}-${prefijo}-${k}`; con prefijo `'s'` da `ot-c-s-0`. Revisar que `movIdsDeOT` esté exportado en `ot-achique.js` (lo está) y que importar `ot-achique.js` desde `ot-sobrante.js` no arme un ciclo (`ot-achique.js` importa de `ot-destinos.js`, no de `ot-sobrante.js`).

- [ ] **Step 4: Aviso en `itemExtra` (`propuesta-ot.js`)**

Después de armar `it` (rama con `lote`), antes del aviso de merma:

```js
  // Agregado al confirmar desde el Mapa como lote NUEVO: el Mapa sigue con el lote viejo.
  if (x.d.codigos_mapa && x.d.codigos_mapa.length)
    it.avisos.push(`Re-rotulá en el Mapa ${x.d.codigos_mapa.join(', ')} al lote ${x.d.lote}.`);
```

(Los del mismo lote no pasan por `itemExtra`, así que no reciben el aviso.)

- [ ] **Step 5: Correr los tests**

Run: `npx vitest run test/lotes-ot-sobrante.test.mjs test/lotes-propuesta-ot.test.mjs test/lotes-ot-destinos.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/lotes/js/ot-sobrante.js public/lotes/js/propuesta-ot.js test/lotes-ot-sobrante.test.mjs test/lotes-propuesta-ot.test.mjs
git commit -m "feat(lotes): agregados al confirmar como destinos extra (copia para la propuesta e incorporacion al aplicar)"
```

---

### Task 4: Pantalla de Confirmar — tarjeta del Mapa, "＋ Sobró vino" y aplicar

**Files:**
- Modify: `public/lotes/js/vista-ot-confirmar.js`
- Modify: `public/lotes/css` del módulo **solo si** hace falta (preferir clases existentes `otc-extra`, `otc-corte`, `msg warn`, `btn`).

**Interfaces:**
- Consumes: `sobranteSegunMapa`, `otConAgregados`, `incorporarAgregados` (ot-sobrante.js); `realesDeExtras` (Task 1); `escaneosPorLote`, `llenadoSegunMapa` (propuesta-ot.js); `asignarLotesExtra`, `esChicas`, `nombreExtra` (ot-destinos.js); `anioDeLote` (lote-nuevo.js); `fijar` (vista-lotes.js).
- Estado nuevo en `st`: `st.agregados = []` (`{ i, tipo, barricas, t50, num, lote, codigos }`), `st.ignorados = new Set()` (claves `'c'` o `String(i)` de tarjetas ignoradas).

No hay test de vitest para esta tarea (es DOM); se prueba en el navegador en el Step 9.

- [ ] **Step 1: Estado y helpers**

En `abrirConfirmarOT`, agregar `agregados: [], ignorados: new Set()` al objeto `st`. Agregar helpers (después de `_entradaExtra`):

```js
/* ---------- sobrante (agregados al confirmar) ---------- */
// Clave del lugar que recibe el agregado: 'c' = el corte; '0','1'… = lote i.
const _claveA = i => i == null ? 'c' : String(i);
const _padreDe = (st, i) => String(i == null ? st.ot.lote_corte.lote : st.ot.lotes[i].lote);
// Extras que ya tenia la OT en ese lugar (los agregados van despues).
const _baseExtras = (st, i) => (i == null ? st.ot.destinos_extra || [] : st.ot.lotes[i].destinos_extra || []).length;
// La lista de entradas del paso 1 de ese lugar (se crea si no hay).
function _entradasDe(st, i){
  if (i == null) return st.entradas.extras || (st.entradas.extras = []);
  const e = st.entradas.por_lote[i];
  if (!e.extras){ e.extras = []; e.merma = e.merma ?? ''; }
  return e.extras;
}
// Id del bloque (el mismo esquema que _entradaDe): 'xc_k' o 'xi_k'.
const _idExtra = (i, k) => i == null ? 'xc_' + k : 'x' + i + '_' + k;
// Numero propuesto para un lote nuevo: siguiente libre del año del vino.
function _loteNuevoPropuesto(st, i){
  const padre = _padreDe(st, i);
  const anio = anioDeLote(padre, Number(String(st.ot.fecha || hoyISO()).slice(0, 4)));
  const tomados = [...extrasDeOT(st.ot).map(x => x.d.lote), ...st.agregados.map(a => a.lote)];
  return asignarLotesExtra([{}], { lotes: DATOS().lotes || [], anio, reservados: tomados })[0].lote;
}
function _agregar(st, a){
  _guardarCabecera(st);
  const ents = _entradasDe(st, a.i);
  ents.push(a.tipo === 'chicas'
    ? { barricas_llenas: a.barricas || '', t50_llenas: a.t50 || '', mermas: [], merma: '' }
    : { vasija: a.num ? 'T ' + String(a.num).replace(/^t\s*/i, '') : '', cm: '', litros_manual: '', merma: '' });
  st.agregados.push(a);
  _paso1(st);
}
function _quitarAgregado(st, j){
  _guardarCabecera(st);
  const a = st.agregados[j];
  const pos = st.agregados.slice(0, j).filter(x => _claveA(x.i) === _claveA(a.i)).length;
  _entradasDe(st, a.i).splice(_baseExtras(st, a.i) + pos, 1);
  st.agregados.splice(j, 1);
  _paso1(st);
}
```

- [ ] **Step 2: HTML de agregados, tarjeta y botón**

```js
// Bloques de los agregados de un lugar, debajo de su destino.
function _bloquesAgregados(st, i){
  const base = _baseExtras(st, i);
  let pos = 0;
  return st.agregados.map((a, j) => {
    if (_claveA(a.i) !== _claveA(i)) return '';
    const k = base + pos++, id = _idExtra(i, k), e = _entradasDe(st, i)[k];
    const padre = _padreDe(st, i), mismo = String(a.lote) === padre;
    const nombre = a.tipo === 'chicas' ? 'Barricas / T50' : 'Otro tanque';
    return `<div class="otc-extra" style="margin-top:8px"><b>＋ ${esc(nombre)} · agregado</b>
      <button class="btn" data-aquitar="${j}" title="Quitar" style="float:right">✕</button><br>
      ${a.tipo === 'chicas' ? _bloqueChicasExtra(id, e) : _bloqueTanque(id, e, true)}
      <div style="margin-top:6px">Lote:
        <label><input type="radio" name="alote${j}" data-alote="${j}" value="mismo"${mismo ? ' checked' : ''}> mismo lote ${esc(padre)}</label>
        <label><input type="radio" name="alote${j}" data-alote="${j}" value="nuevo"${mismo ? '' : ' checked'}> lote nuevo</label>
        ${mismo ? '' : `<input class="txt" style="width:80px" data-alotenum="${j}" value="${escA(a.lote)}" inputmode="numeric" aria-label="Número del lote nuevo">`}
      </div></div>`;
  }).join('');
}

// Tarjeta del Mapa + boton "Sobro vino" de un lugar (corte o lote i).
function _sobrante(st, i){
  if (st.tipo === 'salida') return '';
  const s = (st.sobrantes || []).find(x => _claveA(x.i) === _claveA(i));
  const yaSumado = st.agregados.some(a => _claveA(a.i) === _claveA(i) && a.codigos);
  const tarjeta = s && !yaSumado && !st.ignorados.has(_claveA(i)) ? `<div class="msg warn" style="margin-top:8px">
      🟡 El Mapa tiene vasijas llenadas con esta OT que no estaban previstas:
      <b>${esc(nombreExtra({ tipo: 'chicas', barricas: s.barricas, t50: s.t50 }))}</b> (${esc(s.codigos.join(', '))}), lote ${esc(s.lote)}.
      ${s.sinCap.length ? `<br>Sin capacidad conocida, no se suman: ${esc(s.sinCap.join(', '))}.` : ''}
      <div style="margin-top:6px"><button class="btn primary" data-asumar="${_claveA(i)}">Sumar a la OT</button>
      <button class="btn" data-aignorar="${_claveA(i)}">Ignorar</button></div></div>` : '';
  return tarjeta + _bloquesAgregados(st, i) + `<div style="margin-top:6px">
      <button class="btn" data-amas="${_claveA(i)}:chicas">＋ Sobró vino: barricas / T50</button>
      <button class="btn" data-amas="${_claveA(i)}:tanque">＋ Sobró vino: otro tanque</button></div>`;
}
```

- [ ] **Step 3: Meterlo en `_paso1`**

- En `filas`, para el trasiego simple (no corte, no salida), sumar `+ _sobrante(st, i)` al final de `destino` (después de `extras`).
- En `corte`: si `st.corte`, agregar `+ _sobrante(st, null)` al final del string `corte` (vale con y sin achique).
- Envolver todo en `<div id="otcSobr">…</div>` no hace falta: la tarjeta aparece al repintar (ver Step 5).
- `_dlVasijas()` ya provee el datalist de tanques para `_bloqueTanque`.

- [ ] **Step 4: Eventos**

En el `box.addEventListener('click', …)`, al principio:

```js
    const am = ev.target.closest('[data-amas]'), aq = ev.target.closest('[data-aquitar]');
    const as = ev.target.closest('[data-asumar]'), ai = ev.target.closest('[data-aignorar]');
    const lugar = c => c === 'c' ? null : Number(c);
    if (am){ const [c, tipo] = am.dataset.amas.split(':'); const i = lugar(c);
      return _agregar(st, { i, tipo, barricas: '', t50: '', num: '', lote: _padreDe(st, i) }); }
    if (aq) return _quitarAgregado(st, +aq.dataset.aquitar);
    if (as){ const i = lugar(as.dataset.asumar), s = st.sobrantes.find(x => _claveA(x.i) === as.dataset.asumar);
      return _agregar(st, { i, tipo: 'chicas', barricas: s.barricas, t50: s.t50, lote: _padreDe(st, i), codigos: s.codigos }); }
    if (ai){ _guardarCabecera(st); st.ignorados.add(ai.dataset.aignorar); return _paso1(st); }
```

Y un listener `change` (además del `input` existente) para el lote:

```js
  box.addEventListener('change', ev => {
    const r = ev.target.closest('[data-alote]');
    if (r){ const a = st.agregados[+r.dataset.alote];
      a.lote = r.value === 'mismo' ? _padreDe(st, a.i) : _loteNuevoPropuesto(st, a.i); _guardarCabecera(st); return _paso1(st); }
    const n = ev.target.closest('[data-alotenum]');
    if (n) st.agregados[+n.dataset.alotenum].lote = n.value.trim();
  });
```

Al final de `_paso1`, pintar los litros de los tanques agregados (mismo contador por lugar que `_bloquesAgregados`):

```js
  const posA = {};
  for (const a of st.agregados){
    const c = _claveA(a.i);
    posA[c] = (posA[c] ?? -1) + 1;
    if (a.tipo === 'tanque') _pintarCalc(st, _idExtra(a.i, _baseExtras(st, a.i) + posA[c]));
  }
```

Además, en `_leerCampo`, un input de tanque agregado con `data-f="vasija"` ya actualiza la entrada vía `_entradaDe` (los ids `xc_k`/`xi_k` son los de siempre).

- [ ] **Step 5: Detectar con el Mapa al abrir**

En `abrirConfirmarOT`, en el `.then(m => { … })` de `leerMapa`, después de `_precargarLlenadosDelMapa(st);`:

```js
    st.sobrantes = esSinMovimientos(st.ot) ? [] : sobranteSegunMapa(st.ot, escaneosPorLote((m && m.escaneos_ot) || []), st.tipo);
    _precargarChicasExtra(st, m);
    // Solo se repinta si hay algo nuevo que mostrar y nadie esta tipeando.
    if (st.sobrantes.length && !$('otcRaiz').contains(document.activeElement)){ _guardarCabecera(st); _paso1(st); }
```

Y la precarga de los destinos 'chicas' extra que ya tenía la OT:

```js
/* Barricas/T50 extra que ya estaban en la OT: si el Mapa tiene sus llenados
 * y nadie toco las cantidades, arrancan con lo del Mapa. */
function _precargarChicasExtra(st, m){
  if (!m || !m.escaneos_ot) return;
  const porLote = escaneosPorLote(m.escaneos_ot);
  for (const x of extrasDeOT(st.ot)){
    if (!esChicas(x.d)) continue;
    const ll = llenadoSegunMapa(porLote[codigoLote(x.d.lote)]);
    const e = _entradaExtra(st, x);
    if (!ll || !e || e.tocadas) continue;
    e.barricas_llenas = ll.barricas; e.t50_llenas = ll.t50;
  }
}
```

(Para un extra de lote nuevo, el Mapa tiene los llenados con el lote viejo: `porLote[lote nuevo]` no existe y no precarga; está bien.)

- [ ] **Step 6: Paso 2 con la OT aumentada**

En `_irAPaso2`, después de `_guardarCabecera(st);`:

```js
  // Los agregados validan y entran a la propuesta como destinos extra.
  const lugarSinLote = st.agregados.find(a => !String(a.lote || '').trim());
  if (lugarSinLote) return err('Falta el número del lote nuevo de lo que sobró.');
  const repetido = st.agregados.find(a => String(a.lote) !== _padreDe(st, a.i) && (DATOS().lotes || []).some(l => String(l.lote) === String(a.lote)));
  if (repetido) return err(`El lote ${repetido.lote} ya existe: elegí "mismo lote" u otro número.`);
  const otV = otConAgregados(st.ot, st.agregados);
```

y reemplazar **en `_irAPaso2`** cada `extrasDeOT(st.ot)` por `extrasDeOT(otV)` (validaciones de tanque/llenas, `lotes`, `mermasDestinos`, el bucle de mermas de extras). En el `try`, `proponer({ ot: otV, … })`. Después de `_engancharOT(st)` (que re-asigna `st.ot` a la viva), recalcular `const otV2 = otConAgregados(st.ot, st.agregados)` y usar `otV2` en `proponer`. Guardar `st.otV = otV2` para el paso 2.

En el paso 2, todo lo que lee `st.ot` para extras (`_nombreItemExtra`, `_grupoDe` por `extra.i`, `_fuenteDe`) debe leer `st.otV || st.ot`: buscar con `grep -n "extrasDeOT(st.ot)\|st.ot.destinos_extra\|destinos_extra" public/lotes/js/vista-ot-confirmar.js` y cambiar las del paso 2.

- [ ] **Step 7: Aplicar**

En `_aplicar`, inmediatamente después de `const errOT = _engancharOT(st); if (errOT) return err2(errOT);`:

```js
    // Lo que sobro queda en la OT viva, con sus movimientos y lotes hijos.
    if (st.agregados.length){
      const { hijos } = incorporarAgregados(DATOS(), st.ot, st.agregados, usuarioActual(), hoyISO(),
        l => (DATOS().lotes || []).find(x => String(x.lote) === String(l)));
      for (const h of hijos) fijar(h);
    }
```

Como los agregados se agregan al final de cada lista en el mismo orden que `otConAgregados`, los `{i,k}` de la propuesta apuntan a los mismos extras en la OT viva; `confirmarOT` (con `realesDeExtras`, Task 1) los pasa a EJECUTADO y `aplicarPropuesta` les pone `aplicado`. Imports nuevos: `sobranteSegunMapa, otConAgregados, incorporarAgregados` de `./ot-sobrante.js`; `asignarLotesExtra` de `./ot-destinos.js`; `anioDeLote` de `./lote-nuevo.js`; `fijar` de `./vista-lotes.js`; `escaneosPorLote, llenadoSegunMapa` ya están.

Si `_aplicar` falla antes de `st.aplicada = true` no hay problema; si `guardar()` falla después, la OT ya quedó confirmada en memoria (comportamiento existente).

- [ ] **Step 8: Tests de regresión**

Run: `npx vitest run`
Expected: todo PASS salvo el test ya roto de `app.js` (modo órdenes).

- [ ] **Step 9: Probar en el navegador**

Copiar el mock `C:/Users/Bmax/AppData/Local/Temp/claude/C--Users-Bmax-OneDrive---BODEGAS-ESMERALDA-SA-Escritorio-claude/f4be7604-66df-4efe-8096-b72fe404185d/scratchpad/mock-extra-mismo-lote.mjs` a `mock-ot-sobrante.mjs` en el mismo scratchpad, cambiando `ci-extra-mismo-lote` → `ci-ot-sobrante` y el puerto `8878` → `8879`, y hacer que la ruta `barriles` devuelva `escaneos_ot` cuando hay `?ot=`:

```js
      const ot = u.searchParams.get('ot');
      const escaneos_ot = ot && /^0*967$/.test(ot) ? [{ ot: '0967', lote: '25315', tipo: 'llenado', fecha: '2026-11-16',
        barriles: [{ num: '1250070', cap: 225 }, { num: '50138', cap: 50 }] }] : [];
      return json(200, { version: 7, por_lote, por_num: {}, escaneos_ot });
```

Agregar `ot-sobrante` (puerto 8879) al `.claude/launch.json` del Escritorio y `preview_start`. Abrir `http://localhost:8879/lotes/?orden=ot-0967` → ✓ Confirmar:
1. Aparece la tarjeta "El Mapa tiene… 1 barrica + 1 T50 (1250070, 50138), lote 25315" → **Sumar a la OT** → bloque con Barricas llenas 1, T50 llenos 1, "mismo lote 25315" marcado.
2. Tanque del corte T 48, litros 6500, operario → Siguiente: el 25315 recibe "T 48 + 1 barrica + 1 T50", litros 6.775, merma del 25312 = 7500 − 6775 = 725.
3. Aplicar → `GET /lotes/api/datos`: la OT tiene `destinos_extra[0]` con `al_confirmar: true`, movimiento `ot-0967-s-0` tipo trasiego **ejecutado**, ningún lote nuevo.
4. Repetir (reiniciar el mock) con "lote nuevo": aparece la fila del hijo 25316 con el aviso "Re-rotulá en el Mapa 1250070, 50138 al lote 25316."; al aplicar existe el lote 25316 y el movimiento traspaso 25315 → 25316.
5. "＋ Sobró vino: otro tanque" en un trasiego tq-tq del mock (`ot-pend` no sirve: es a barricas; agregar al mock una OT tq-tq de 26217 → T 212) y confirmar que se suma al lote.

- [ ] **Step 10: Commit**

```bash
git add public/lotes/js/vista-ot-confirmar.js
git commit -m "feat(lotes): al confirmar una OT, sumar lo que sobro (detectado en el Mapa o a mano)"
```

---

### Task 5: Papel sin agregados y marca "agregado al confirmar"

**Files:**
- Modify: `public/lotes/js/ot-hojas.js`
- Modify: `public/lotes/js/ot-achique.js` (`textoDestinos`)
- Test: `test/lotes-ot-lista.test.mjs`

**Interfaces:**
- Consumes: `extrasDeOT`, `nombreExtra` (ot-destinos.js).
- Produces: `textoDestinos(ot)` agrega " (agregado al confirmar)" a cada extra con `al_confirmar`.

- [ ] **Step 1: Test que falla**

Agregar a `test/lotes-ot-lista.test.mjs` (importar `resumenLotes` de `../public/lotes/js/ot-lista.js` si no está):

```js
describe('agregados al confirmar en el resumen', () => {
  it('se marcan', () => {
    const ot = { ot: '0967', destino: 'T 48', lote_corte: { lote: '25315' }, lotes: [{ lote: '25312' }],
      destinos_extra: [{ tipo: 'chicas', barricas: 1, t50: 1, lote: '25315', al_confirmar: true, mov_id: 'a' }] };
    expect(resumenLotes(ot)).toBe('25315 (corte de 1 lotes) → T 48 + 1 barrica + 1 T50 (agregado al confirmar)');
  });
});
```

(Si `resumenLotes` dice "corte de 1 lote" en singular, ajustar el esperado al texto real.)

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/lotes-ot-lista.test.mjs`
Expected: FAIL (falta la marca).

- [ ] **Step 3: Implementar**

En `ot-achique.js`, `textoDestinos`:

```js
  return [String((ot && ot.destino) || '').trim(),
    ...ex.map(x => nombreExtra(x.d) + (x.d.al_confirmar ? ' (agregado al confirmar)' : ''))].filter(Boolean).join(' + ');
```

En `ot-hojas.js`, junto a los imports, definir y usar en TODAS las llamadas a `extrasDeOT(ot)` del archivo (líneas con `lineasExtra(extrasDeOT(ot))`, la tabla de correcciones, rótulos, filas):

```js
// La hoja es lo que se emitio: lo agregado al confirmar no se imprime.
const extrasPapel = ot => extrasDeOT(ot).filter(x => !x.d.al_confirmar);
```

y `extrasDeLote` pasa a filtrar sobre `extrasPapel(ot)`.

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run test/lotes-ot-lista.test.mjs test/lotes-ot-hojas.test.mjs`
Expected: PASS (si `lotes-ot-hojas.test.mjs` no existe, correr `npx vitest run` completo).

- [ ] **Step 5: Precargas, suite completa y commit**

```bash
node scripts/precargas.mjs
npx vitest run
git add public/lotes/js/ot-hojas.js public/lotes/js/ot-achique.js public/lotes/index.html test/lotes-ot-lista.test.mjs
git commit -m "feat(lotes): lo agregado al confirmar no va al papel y se marca en el listado"
```

Expected suite: todo PASS salvo el test ya roto de `app.js`.

---

## Cierre

- `git push -u origin feat/ot-sobrante-confirmar` y pedir OK al usuario para pasar a `main` (= producción).
- Actualizar la memoria `lotes-ot-extra-mismo-lote.md` (o una nueva `lotes-ot-sobrante-confirmar.md`) con el estado.
