# OT: Corte con lote existente, tanques grandes y vasijas manuales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el Corte pueda ir a un lote que ya existe, y que cada lote de una OT de movimientos pueda llevar tanques del padrón y vasijas manuales, con litros previstos = suma.

**Architecture:** La lógica nueva va en módulos puros testeables (`ot-corte.js`, `ot-vasijas.js` nuevo, `ot-armado.js`, `propuesta-ot.js`, `ot-hojas.js`); las vistas (`vista-ot-corte.js`, `vista-ot-emitir.js`) solo pintan y leen. La OT guarda dos campos nuevos por lote, `tanques: [{num, litros}]` y `otras: [{nombre, litros}]`, más `lote_corte.existente`.

**Tech Stack:** JS ESM sin framework en `public/lotes/js`, vitest (`npx vitest run <archivo>`), Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-10-26-ot-corte-existente-y-vasijas-design.md`

## Global Constraints

- Las OT ya emitidas no tienen `tanques`, `otras` ni `lote_corte.existente`: todo se lee con `|| []` / `!!`. Sin migración.
- Los archivos de `public/lotes/js` tienen finales de línea CRLF: editar con la herramienta Edit, no con sed de `\n`.
- Los envases de 50 L se escriben "T50" (`esT50`/`NOMBRE_T50` de `envases.js`), nunca "barrica de 50 L".
- Tanques en papel: "T " + número del padrón ("T 201").
- Push a `main` = producción (Workers Builds). No pushear sin el OK del usuario.
- Correr tests con `npx vitest run test/<archivo>` (el vitest completo se cae por el pool de Workers; usar `--exclude ".claude/**"` si se corre todo).

---

### Task 1: validar el lote existente del Corte (puro)

**Files:**
- Modify: `public/lotes/js/ot-corte.js`
- Test: `test/lotes-ot-corte.test.mjs`

**Interfaces:**
- Produces: `validarLoteExistente(texto, lotes, origenes) -> {ok:true, valor:string, ficha} | {ok:false, error:string}`

- [ ] **Step 1: test que falla**

```js
describe('validarLoteExistente', () => {
  const LOTES = [{ lote: 26217, id_texto: 'Malbec A' }, { lote: '26218' }];
  it('tiene que existir', () => {
    expect(validarLoteExistente('', LOTES, []).ok).toBe(false);
    expect(validarLoteExistente('99999', LOTES, []).error).toMatch(/no existe/);
  });
  it('devuelve el numero como texto y la ficha', () => {
    const v = validarLoteExistente(' 26217 ', LOTES, []);
    expect(v).toMatchObject({ ok: true, valor: '26217' });
    expect(v.ficha.id_texto).toBe('Malbec A');
  });
  it('no puede ser uno de los lotes de origen', () => {
    expect(validarLoteExistente('26218', LOTES, ['26218']).error).toMatch(/origen/);
  });
});
```

- [ ] **Step 2: correr y ver que falla** — `npx vitest run test/lotes-ot-corte.test.mjs` → FAIL (no exportado).
- [ ] **Step 3: implementar**

```js
/* Corte hacia un lote que YA existe: el vino de los origenes se suma a ese
 * lote y no se crea ninguno. Tampoco puede ser uno de los origenes. */
export function validarLoteExistente(texto, lotes, origenes){
  const t = String(texto ?? '').trim();
  if (!t) return { ok: false, error: 'Escribí el número del lote existente.' };
  const ficha = (lotes || []).find(l => String(l.lote) === t);
  if (!ficha) return { ok: false, error: `El lote ${t} no existe.` };
  if ((origenes || []).some(o => String(o) === t))
    return { ok: false, error: `El lote ${t} es uno de los lotes de origen del corte.` };
  return { ok: true, valor: t, ficha };
}
```

- [ ] **Step 4: tests pasan.**
- [ ] **Step 5: commit** `feat(lotes): validar el lote existente del Corte`

### Task 2: confirmar un Corte a un lote que ya estaba en el tanque (puro)

**Files:**
- Modify: `public/lotes/js/propuesta-ot.js` (rama `if (corte)` de `proponer`), `public/lotes/js/ot-armado.js` (`loteCorte` conserva `existente`)
- Test: `test/lotes-propuesta-ot.test.mjs`, `test/lotes-ot-armado.test.mjs`

**Interfaces:**
- Produces: `ot.lote_corte = {lote, id_texto, existente?: true}`; en el corte, `corteItem.litros_llegados` = lo que entró (medido − lo que ya había si es el mismo tanque).

- [ ] **Step 1: tests que fallan**

```js
it('corte a lote existente en el MISMO tanque: lo medido es el total del tanque', () => {
  const lotes = [{ lote: 26300, vasija_grande: 1000, litros_actuales: 1000, vasija_actual: 'T 154' },
                 { lote: 25315, cap225: 4 }];
  const o = ot('barricas-tanque', [{ lote: '25315', barriles: DOCE.slice(0, 4), litros_previstos: 900 }],
    { lote_corte: { lote: '26300', id_texto: 'Corte', existente: true } });
  const p = proponer({ ot: o, lotes, mermas: [], padron: PADRON, hoy: '2026-10-26',
    entradas: { por_lote: [{}], corte: { vasija: '154', litros_manual: 1880 } } });
  const c = p.items.find(x => x.indice == null);
  expect(c.despues).toMatchObject({ vasija_grande: 1880, vasija_actual: 'T 154' });
  expect(c.litros_llegados).toBe(880);
  expect(p.items[0].merma_litros).toBe(20);
  expect(c.avisos).toContain('El tanque ya tenía vino de este lote: lo medido se tomó como contenido total.');
});
it('corte a lote existente en OTRO lado: lo medido se suma', () => {
  const lotes = [{ lote: 26300, cap225: 2, litros_actuales: 450, vasija_actual: '2 barricas' },
                 { lote: 25315, cap225: 4 }];
  const o = ot('barricas-tanque', [{ lote: '25315', barriles: DOCE.slice(0, 4), litros_previstos: 900 }],
    { lote_corte: { lote: '26300', id_texto: 'Corte', existente: true } });
  const p = proponer({ ot: o, lotes, mermas: [], padron: PADRON, hoy: '2026-10-26',
    entradas: { por_lote: [{}], corte: { vasija: '154', litros_manual: 880 } } });
  const c = p.items.find(x => x.indice == null);
  expect(c.despues).toMatchObject({ cap225: 2, vasija_grande: 880 });
  expect(c.litros_despues).toBe(1330);
});
```

y en `lotes-ot-armado.test.mjs`:

```js
it('el lote del corte existente conserva la marca', () => {
  const o = armarOT({ id: 'x', numero: '0950', plantilla: 'barricas-tanque', fecha: '2026-10-26',
    lotes: [], lote_corte: { lote: '26300', id_texto: 'C', existente: true } });
  expect(o.lote_corte).toEqual({ lote: '26300', id_texto: 'C', existente: true });
});
```

- [ ] **Step 2: correr y ver que fallan.**
- [ ] **Step 3: implementar.** En `ot-armado.js`:

```js
function loteCorte(lc){
  const lote = String((lc && lc.lote) || '').trim();
  if (!lote) return null;
  const out = { lote, id_texto: String(lc.id_texto || '') };
  if (lc.existente) out.existente = true;
  return out;
}
```

En `propuesta-ot.js`, dentro de `if (corte)`, rama `else` (lote existe): calcular `mismoTanque` como en el trasiego (I3) y usar `llegados` para la merma:

```js
      const antesEnv = envasesDe(loteCorte);
      const destNum = normalizarNumVasija(entradas.corte && entradas.corte.vasija);
      const grupos = String(loteCorte.vasija_actual || '').match(/\d+/g) || [];
      const mismoTanque = antesEnv.vasija_grande > 0 && !!destNum && grupos.includes(destNum);
      let env = sumar(antesEnv, ll.llenado);
      const avisos = [...ll.avisos];
      let llegados = ll.litros;
      if (mismoTanque && ll.litros != null){
        env = { ...env, vasija_grande: r1(ll.litros) };
        llegados = r1(ll.litros - antesEnv.vasija_grande);
        avisos.push('El tanque ya tenía vino de este lote: lo medido se tomó como contenido total.');
      }
      corteItem = { ..., litros_llegados: llegados, avisos, ... };
```

y en el reparto de la merma usar `corteItem.litros_llegados` en lugar de `ll.litros` (`const merma = total - corteItem.litros_llegados`, condición `corteItem.litros_llegados != null`).

- [ ] **Step 4: tests pasan** (los 128 previos también).
- [ ] **Step 5: commit** `feat(lotes): confirmar un Corte a un lote existente`

### Task 3: asistente del Corte con "Lote existente" (vista)

**Files:**
- Modify: `public/lotes/js/vista-ot-corte.js`

**Interfaces:**
- Consumes: `validarLoteExistente` (Task 1), `lote_corte.existente` (Task 2).

- [ ] **Step 1:** estado nuevo `st.modo = 'nuevo' | 'existente'` (arranca `'nuevo'`), `st.existente = ''`.
- [ ] **Step 2:** `pasoLote()` arranca con dos botones `data-modo="nuevo"` / `data-modo="existente"` (el elegido `primary`). En modo nuevo, lo de hoy. En modo existente: `campoTexto('ocCampo', 'Número del lote existente (el que recibe el vino)', st.existente, 'p. ej. 26217', ' list="ocLotes" inputmode="numeric"')` + `<datalist id="ocLotes">` con `DATOS().lotes` (`value` = lote, texto = id_texto) + una línea con el id_texto del lote si existe.
- [ ] **Step 3:** `leer()` en `P_LOTE` guarda en `st.lote` o `st.existente` según el modo. Click en `[data-modo]` → `leer(); st.modo = …; pintar();`.
- [ ] **Step 4:** `avanzar()` en `P_LOTE`: modo existente → `validarLoteExistente(st.existente, DATOS().lotes, origenes())`; si ok, `paso = P_RESUMEN` (saltea datos). `Atrás` desde `P_RESUMEN` en modo existente vuelve a `P_LOTE`. "Paso X de N" en modo existente cuenta `P_LOTE + 2`.
- [ ] **Step 5:** `resumen()` en modo existente: "Va al lote existente N — id_texto" sin la tabla de datos.
- [ ] **Step 6:** `emitir()` en modo existente: valida con `validarLoteExistente`, arma `loteCorte: {lote: v.valor, id_texto: v.ficha.id_texto || '', existente: true}` y llama `registrarOT(ot, onListo)` SIN el `antes` que crea el lote. Botón final: "✓ Emitir OT" (no "y crear lote").
- [ ] **Step 7:** probar en navegador (Task 8) y commit `feat(lotes): Corte hacia un lote existente`.

### Task 4: tanques y vasijas manuales de un lote de la OT (puro)

**Files:**
- Create: `public/lotes/js/ot-vasijas.js`
- Modify: `public/lotes/js/ot-armado.js` (`armarOT`, `resumenVasijas`)
- Test: `test/lotes-ot-vasijas.test.mjs` (nuevo), `test/lotes-ot-armado.test.mjs`

**Interfaces:**
- Produces:
  - `tanqueDelLote(lote, padron) -> {num:string, litros:number} | null` — primer número de `vasija_actual` (fuera de partes "barric"/T50) que está activo en el padrón, solo si `vasija_grande > 0`; litros = `vasija_grande`.
  - `nombreTanque(num) -> 'T ' + num`
  - `sumaLitros({barriles, tildados?, tanques, otras}) -> number` — suma de `cap` de barriles (todos, o los de `tildados` si viene un Set), `litros` de tanques y de otras.
  - `detalleSuma(...)` mismo input → texto "4.850 + 225 + 300" (solo partes > 0).
  - `armarOT` copia `tanques` (`{num:String, litros:num|null}`) y `otras` (`{nombre:String trim, litros}`) sin las vacías (otra sin nombre, tanque sin num); si `litros_previstos` no viene, lo calcula con `sumaLitros` (null si da 0 y no hay nada).
  - `resumenVasijas(l)` junta: resumen de barriles (lo de hoy) + `T 201` por tanque + nombre de cada otra, con " + "; si no hay nada de eso cae a `vasijas_manual`.

- [ ] **Step 1: tests que fallan**

```js
import { tanqueDelLote, sumaLitros, detalleSuma, nombreTanque } from '../public/lotes/js/ot-vasijas.js';
const PADRON = [{ num: '201', activa: true }, { num: '154', activa: true }, { num: '99', activa: false }];
describe('tanqueDelLote', () => {
  it('el tanque del padron nombrado en vasija_actual, con vasija_grande', () => {
    expect(tanqueDelLote({ vasija_actual: '4 barricas + T 201', vasija_grande: 4850 }, PADRON)).toEqual({ num: '201', litros: 4850 });
  });
  it('sin litros en tanque no hay tanque', () => {
    expect(tanqueDelLote({ vasija_actual: 'T 201', vasija_grande: 0 }, PADRON)).toBeNull();
  });
  it('ignora vasijas fuera del padron o inactivas', () => {
    expect(tanqueDelLote({ vasija_actual: 'T 99', vasija_grande: 100 }, PADRON)).toBeNull();
    expect(tanqueDelLote({ vasija_actual: 'Nave 2', vasija_grande: 100 }, PADRON)).toBeNull();
  });
});
describe('sumaLitros', () => {
  const l = { barriles: [{ num: 'a', cap: 225 }, { num: 'b', cap: 225 }], tildados: new Set(['a']),
              tanques: [{ num: '201', litros: 4850 }], otras: [{ nombre: 'IBC', litros: 300 }, { nombre: 'x', litros: null }] };
  it('suma tildados + tanques + otras', () => { expect(sumaLitros(l)).toBe(5375); });
  it('el detalle lista las partes', () => { expect(detalleSuma(l)).toBe('225 + 4.850 + 300'); });
  it('sin tildados cuenta todos los barriles', () => { expect(sumaLitros({ barriles: l.barriles })).toBe(450); });
});
it('nombreTanque', () => { expect(nombreTanque('201')).toBe('T 201'); });
```

En `lotes-ot-armado.test.mjs`:

```js
it('resumenVasijas junta barricas, tanques y vasijas manuales', () => {
  expect(resumenVasijas({ barriles: CINCO, tanques: [{ num: '201', litros: 1 }], otras: [{ nombre: 'IBC 1', litros: 1 }] }))
    .toBe('5 barricas + T 201 + IBC 1');
  expect(resumenVasijas({ barriles: [], tanques: [{ num: '201', litros: 1 }] })).toBe('T 201');
});
it('armarOT guarda tanques y otras y suma los litros', () => {
  const o = armarOT({ id: 'x', numero: '0950', plantilla: 'barrica-tanque', fecha: '2026-10-26',
    lotes: [{ lote: '1', barriles: [], tanques: [{ num: 201, litros: 4850 }, { num: '', litros: 5 }],
              otras: [{ nombre: ' IBC ', litros: 300 }, { nombre: '', litros: 9 }] }] });
  expect(o.lotes[0].tanques).toEqual([{ num: '201', litros: 4850 }]);
  expect(o.lotes[0].otras).toEqual([{ nombre: 'IBC', litros: 300 }]);
  expect(o.lotes[0].litros_previstos).toBe(5150);
});
```

- [ ] **Step 2: ver que fallan.**
- [ ] **Step 3: implementar `ot-vasijas.js`**

```js
/* ===== Lotes CIW — tanques del padron y vasijas manuales de un lote de la OT (puro) =====
 * Los barriles salen del Mapa; los tanques grandes (padron de 78 vasijas) no
 * estan en el Mapa, y algunas vasijas no estan en ningun sistema (IBC, bins).
 * La OT guarda las tres cosas por lote y los litros previstos son la suma. */
'use strict';

import { buscarVasija } from './vasijas-padron.js';
import { RE_T50 } from './envases.js';

const ES_CHICO = new RegExp('barric|' + RE_T50.source, 'i');
const n = x => { const v = Number(x); return Number.isFinite(v) && v > 0 ? v : 0; };

export const nombreTanque = num => 'T ' + String(num).trim();

export function tanqueDelLote(lote, padron){
  const litros = n(lote && lote.vasija_grande);
  if (!litros) return null;
  for (const parte of String((lote && lote.vasija_actual) || '').split('+')){
    if (ES_CHICO.test(parte)) continue;
    for (const d of parte.match(/\d+/g) || []){
      const v = buscarVasija(padron, d);
      if (v) return { num: String(v.num), litros };
    }
  }
  return null;
}

function partes(l){
  const bs = (l && l.barriles) || [];
  const t = l && l.tildados;
  const elegidos = t ? bs.filter(b => t.has(b.num)) : bs;
  return [elegidos.reduce((s, b) => s + n(b.cap), 0),
          ...((l && l.tanques) || []).map(x => n(x.litros)),
          ...((l && l.otras) || []).map(x => n(x.litros))];
}

export const sumaLitros = l => partes(l).reduce((s, x) => s + x, 0);
export const detalleSuma = l => partes(l).filter(x => x > 0).map(x => x.toLocaleString('es-AR')).join(' + ');
```

En `ot-armado.js`: importar `sumaLitros`, `nombreTanque`; en `armarOT` por lote:

```js
      const tanques = (l.tanques || []).filter(t => String(t.num ?? '').trim())
        .map(t => ({ num: String(t.num).trim(), litros: numOk(t.litros) }));
      const otras = (l.otras || []).filter(o => String(o.nombre ?? '').trim())
        .map(o => ({ nombre: String(o.nombre).trim(), litros: numOk(o.litros) }));
      const suma = sumaLitros({ barriles, tanques, otras });
      ...
        tanques, otras,
        litros_previstos: l.litros_previstos ?? (barriles.length || tanques.length || otras.length ? suma : null),
```

y `resumenVasijas`: renombrar el cuerpo actual a `resumenBarriles(l)` (devuelve '' si no hay barriles) y:

```js
export function resumenVasijas(l){
  const extra = [...((l && l.tanques) || []).map(t => nombreTanque(t.num)),
                 ...((l && l.otras) || []).map(o => o.nombre)];
  const b = resumenBarriles(l);
  const todo = [b, ...extra].filter(Boolean);
  return todo.length ? todo.join(' + ') : String((l && l.vasijas_manual) || '');
}
```

- [ ] **Step 4: tests pasan** (incluido el viejo "sin barriles usa lo cargado a mano").
- [ ] **Step 5: commit** `feat(lotes): tanques y vasijas manuales en los lotes de la OT`

### Task 5: confirmar descuenta los tanques del lote (puro)

**Files:**
- Modify: `public/lotes/js/propuesta-ot.js` (`vaciadoDeLote`, cerradas usa solo barriles)
- Test: `test/lotes-propuesta-ot.test.mjs`

- [ ] **Step 1: tests que fallan**

```js
it('B: los tanques de la OT se descuentan de vasija_grande junto con los barriles', () => {
  const r = vaciadoDeLote({ barriles: DOCE.slice(0, 2), tanques: [{ num: '201', litros: 3000 }] },
    { cap225: 2, vasija_grande: 3000 }, 'barrica-tanque');
  expect(r.vaciado).toMatchObject({ cap225: 2, vasija_grande: 3000 });
  expect(r.revisar).toBe(false);
});
it('B: solo tanque (sin barriles) no queda revisar aunque el lote tenga barricas', () => {
  const r = vaciadoDeLote({ barriles: [], tanques: [{ num: '201', litros: 1000 }] },
    { cap225: 4, vasija_grande: 3000 }, 'barrica-tanque');
  expect(r.vaciado).toMatchObject({ cap225: 0, vasija_grande: 1000 });
  expect(r.revisar).toBe(false);
});
it('B: vaciar el tanque entero lo saca del vasija_actual', () => {
  const lotes = [{ lote: 26217, vasija_grande: 3000, litros_actuales: 3000, vasija_actual: 'T 201' }];
  const p = proponer({ ot: ot('tq-barricas', [{ lote: '26217', tanques: [{ num: '201', litros: 3000 }], litros_previstos: 3000 }]),
    lotes, mermas: [], padron: PADRON, hoy: '2026-10-26',
    entradas: { por_lote: [{ barricas_llenas: 13, mermas: [] }], corte: null } });
  expect(p.items[0].despues.vasija_grande).toBe(0);
  expect(p.items[0].despues.vasija_actual).toBe('13 barricas');
});
```

- [ ] **Step 2: ver que fallan.**
- [ ] **Step 3: implementar.** En `vaciadoDeLote`, antes del `if (origenTanque(...))`:

```js
  const tqs = (otLote && otLote.tanques) || [];
  const litrosTq = tqs.reduce((s, t) => s + n0(t.litros), 0);
```

Cambiar la cadena: `if (tqs.length || bs.length){ for barriles ...; v.vasija_grande = litrosTq; } else if (origenTanque(plantilla)){ ...lo de hoy... } else { ...lo de hoy (soloTanque / revisar)... }`. (Con tanques explícitos manda la OT; las OT viejas siguen por los caminos de siempre.) Verificar que el test viejo "origen tanque descuenta los litros previstos del tanque" sigue pasando (no trae `tanques`).

- [ ] **Step 4: tests pasan.**
- [ ] **Step 5: commit** `feat(lotes): confirmar una OT descuenta los tanques del lote`

### Task 6: los tanques y vasijas manuales en el papel (puro)

**Files:**
- Modify: `public/lotes/js/ot-hojas.js` (`celdaVasijas`, `tablaVaciadoPorBarril`, y la tabla de vaciado genérica si lista barriles)
- Test: `test/lotes-ot-hojas.test.mjs`

- [ ] **Step 1: test que falla** — una OT de corte con un lote `{barriles:[2 barricas], tanques:[{num:'201',litros:3000}], otras:[{nombre:'IBC 1',litros:300}]}`: el HTML de `hojasOT(ot,{ot:true})` contiene filas con `T 201` / `3000` y `IBC 1` / `300`, y el Total suma 3750 (2×225 + 3000 + 300). Para una OT `barrica-tanque` con el mismo lote, la celda de vasijas contiene `2 barricas + T 201 + IBC 1`.
- [ ] **Step 2: ver que falla.**
- [ ] **Step 3: implementar.** En `tablaVaciadoPorBarril`:

```js
  const filas = ot.lotes.flatMap(l => {
    const extra = [...(l.tanques || []).map(t => ({ lote: l.lote, vasija: nombreTanque(t.num), litros: t.litros })),
                   ...(l.otras || []).map(o => ({ lote: l.lote, vasija: o.nombre, litros: o.litros }))];
    const bs = l.barriles.map(b => ({ lote: l.lote, vasija: b.num, litros: b.cap }));
    if (bs.length || extra.length) return [...bs, ...extra];
    return [{ lote: l.lote, vasija: resumenVasijas(l), litros: l.litros_previstos }];
  });
```

`celdaVasijas` ya usa `resumenVasijas` (Task 4); los números de barril debajo quedan igual.

- [ ] **Step 4: tests pasan.**
- [ ] **Step 5: commit** `feat(lotes): tanques y vasijas manuales en la hoja de la OT`

### Task 7: tarjeta del lote en Emitir OT (vista)

**Files:**
- Modify: `public/lotes/js/vista-ot-emitir.js`, `public/lotes/index.html` (estilos mínimos `.ote-extra` si hace falta)

**Interfaces:**
- Consumes: `tanqueDelLote`, `sumaLitros`, `detalleSuma`, `nombreTanque` (Task 4).

- [ ] **Step 1:** estado por lote: `tanques: []`, `otras: []`. En `_agregarLoteAhora`, con `ficha`: `const tq = tanqueDelLote(ficha, DATOS().vasijas)`; si hay, `tanques = [{num: tq.num, litros: tq.litros, tildado: true}]`. `litros` arranca con `sumaLitros` (solo tanques tildados). En plantillas `_desdeTanque()`: si hay `tq`, `vasijas_manual = nombreTanque(tq.num)` y `litros = tq.litros` (y `barricas` estimadas).
- [ ] **Step 2:** `pintarLotes()` (plantillas con barriles): después de los checks de barriles, una casilla por tanque `data-tq="i:j"` con "T 201 ·" + input litros `data-tql="i:j"` + ✕ `data-tqx`; una fila por otra con input nombre `data-otn="i:j"`, litros `data-otl="i:j"`, ✕ `data-otx`. Botones `+ tanque` (`data-mas-tq="i"`, abre un input con `list="otePadron"` y datalist de `DATOS().vasijas` activas: `T num · tipo · cap_real L`) y `+ vasija manual` (`data-mas-otra="i"`). El campo de texto "Vasijas" viejo desaparece en estas plantillas.
- [ ] **Step 3:** "Litros previstos" muestra debajo `detalleSuma` (`= 5.375 L`) cuando no es manual; con `litrosManual` muestra un `↺` (`data-resumar="i"`) que vuelve a `litrosManual=false` y recalcula.
- [ ] **Step 4:** `_recalcularLitros(i)` usa `sumaLitros({barriles, tildados, tanques: tanques tildados, otras})`. Los handlers de `change`/`click` actualizan el estado, recalculan y repintan (conservar el foco: repintar solo en `change`, no en `input`).
- [ ] **Step 5:** `validarLotesOrigen`: un lote vale si tiene barriles tildados, o algún tanque tildado, o alguna otra con nombre, o `vasijas_manual`.
- [ ] **Step 6:** `armarOTDeSesion` pasa `tanques: l.tanques.filter(t => t.tildado).map(({num, litros}) => ({num, litros}))` y `otras: l.otras` (en `_desdeTanque` no pasa tanques/otras: mantiene su campo "Tanque origen").
- [ ] **Step 7:** probar en navegador (Task 8) y commit `feat(lotes): tanques del padrón y vasijas manuales al emitir una OT`.

### Task 8: verificación en navegador y merge de emergencia

- [ ] **Step 1:** levantar un mock local (ver servidores `lotes-*` de `launch.json` en Escritorio\claude; copiar el más reciente apuntando a este worktree en un puerto libre, p. ej. `lotes-ot-vasijas :8819`).
- [ ] **Step 2:** Emitir OT barrica-tanque con un lote que está en `T 201`: aparece "☑ T 201 · N L", agregar "+ vasija manual IBC 1 · 300", ver la suma. Emitir, ver la hoja (vasija "… + T 201 + IBC 1"). Confirmar la OT: el lote baja el tanque y el Inventario de tanques lo refleja.
- [ ] **Step 3:** Corte → Lote existente: se saltea a resumen, emite sin crear lote, la hoja muestra el ID del lote existente; confirmar con el mismo tanque → total.
- [ ] **Step 4:** correr todos los tests de lotes: `npx vitest run test/lotes- --exclude ".claude/**"`.
- [ ] **Step 5:** pedir OK al usuario → merge `--no-ff` a `main` desde `repos\catenainstitute` limpio, push, verificar check "Workers Builds" con `gh api repos/lucs56/catenainstitute/commits/<sha>/check-runs`.
