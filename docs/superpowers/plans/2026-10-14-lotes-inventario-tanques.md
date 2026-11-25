# Inventario de tanques (Lotes web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sub-pestaña Movimientos → Inventario de tanques que muestra qué hay en cada una de las 78 vasijas fijas de CIW, se actualiza sola con las OT y permite cargar recorridas (cm, velo, observación, estado) que corrigen los litros con check manual.

**Architecture:** Un módulo puro `inventario-tanques.js` calcula el inventario cruzando padrón (`DATOS().vasijas`) × lotes (`vasija_actual`, `vasija_grande`) × OT pendientes × recorridas. Otro módulo puro, `recorridas.js`, arma recorridas y aplica diferencias. Lo único que se persiste es la sección nueva `recorridas` del documento de Lotes. La vista `vista-inventario-tanques.js` se cuelga como cuarta sub-pestaña de `vista-movimientos.js`.

**Tech Stack:** JS vanilla con módulos ES (`public/lotes/js/`), Worker TypeScript (`src/prensas/validacion.ts`), tests con vitest (`npm test`).

**Spec:** `docs/superpowers/specs/2026-10-14-lotes-inventario-tanques-design.md`

## Global Constraints

- Trabajar en el worktree `C:\Users\Bmax\repos\catenainstitute-inv-tanques`, rama `feat/inventario-tanques`. Nunca en `repos\catenainstitute` (otras sesiones cambian de rama ahí).
- Solo las vasijas CIW del padrón (`DATOS().vasijas`, activas). La bodega Agrelo queda fuera.
- Nada calculado se guarda. La única sección nueva es `recorridas`.
- Los litros por cm salen siempre de `litrosPorCm` (`cubicacion.js`): manda la Cap REAL.
- Las fechas son locales: `hoyLocalISO()` de `fechas.js`, nunca `toISOString()`.
- Al aplicar una diferencia, `litros_actuales` se recalcula con `litrosDelLote(lote, DATOS().mermas)` (`mermas.js`).
- Estilo: comentarios en castellano sin tildes en código viejo (seguir el archivo), `'use strict';`, `esc`/`escA` para todo texto en HTML.
- `localStorage` siempre dentro de try/catch.
- Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- El deploy lo hace el usuario. Este plan termina en merge a main + push.

## Ajustes al spec decididos al planificar

1. **Cosecha:** el lote no tiene campo `cosecha`. Se deduce de los dos primeros dígitos de un lote de 5 dígitos (`25313` → `2025`). Si no tiene 5 dígitos, queda `''`.
2. **"Sin vasija conocida":** solo entra un lote con `vasija_grande > 0` y ninguna parte de `vasija_actual` en el padrón activo. Un "t50 + Barrica" sin `vasija_grande` es vino en envases chicos y no se lista.
3. **Lote en dos vasijas del padrón** ("T 201 + T 202"): no se sabe cómo se reparte `vasija_grande`. Aparece en las dos con `litros: null` (se muestra "?") y el aviso `sin-reparto`. No se le aplican diferencias.
4. **Etapa:** se lee `lote.etapa`, que está confirmada en todos los lotes desde la migración del 2026-10-14. Si está vacía, cae en VINO TERMINADO, como dice el spec.
5. **Permisos:** el cliente de Lotes no maneja roles (el servidor rechaza el guardado de un lector), así que la vista no esconde botones por rol. Es igual que el resto de la app.

## File Structure

| Archivo | Responsabilidad |
|---|---|
| Create `public/lotes/js/inventario-tanques.js` | Puro. `partesVasija`, `cosechaDeLote`, `ocupacion`, `ultimasMediciones`, `inventarioTanques`, `ESTADOS_MANUALES`. |
| Create `public/lotes/js/recorridas.js` | Puro. `medirFila`, `nuevaRecorrida`, `aplicarDiferencias`. |
| Create `public/lotes/js/hoja-recorrida.js` | Puro. `hojaRecorridaHTML(filas, fecha)` → HTML A4. |
| Create `public/lotes/js/vista-inventario-tanques.js` | La vista: tabla, filtros, modo recorrida, aplicar e imprimir. |
| Modify `public/lotes/js/vista-movimientos.js:85-92,276-293` | Botón de la sub-pestaña y rama `'tanques'`. |
| Modify `public/lotes/js/nucleo.js:13,491` | Inicializa y documenta `recorridas`. |
| Modify `public/lotes/js/deshacer.js:17-19` | `recorridas: 'id'`. |
| Modify `src/prensas/validacion.ts:42` | `'recorridas'` en `SECCIONES_LOTES.secciones`. |
| Modify `public/lotes/index.html` (bloque de estilos `.mov-sub`, ~1268) | Estilos `.inv-*`. |
| Create `test/lotes-inventario-tanques.test.mjs`, `test/lotes-recorridas.test.mjs`, `test/lotes-hoja-recorrida.test.mjs` | Tests. |
| Modify `test/validacion.test.ts`, `test/lotes-deshacer.test.mjs` | Tests de la sección nueva. |

---

### Task 1: Sección `recorridas` en el documento

**Files:**
- Modify: `src/prensas/validacion.ts:33-43`
- Modify: `public/lotes/js/nucleo.js:13` y `:490-491`
- Modify: `public/lotes/js/deshacer.js:17-19`
- Test: `test/validacion.test.ts` (final del archivo), `test/lotes-deshacer.test.mjs`

**Interfaces:**
- Produces: `DATOS().recorridas` siempre es un array. `CLAVE_DE_SECCION.recorridas === 'id'`. El servidor acepta la sección y frena su borrado masivo.

- [ ] **Step 1: Tests que fallan**

Al final de `test/validacion.test.ts`:

```ts
describe('recorridas en Lotes', () => {
  const base = (recs: unknown) => ({
    meta: { version: 1 }, lotes: [{ lote: '26217' }], analisis: [], recorridas: recs,
  });
  const rec = (i: number) => ({ id: 'rec-' + i, fecha: '2026-10-14', por: 'x', filas: [] });

  it('esta declarada pero no es requerida', () => {
    expect(SECCIONES_LOTES.secciones).toContain('recorridas');
    expect(SECCIONES_LOTES.requeridas).not.toContain('recorridas');
  });

  it('rechaza recorridas que no es una lista', () => {
    const e = validarDatos(base({ no: 'lista' }), base([]), false, SECCIONES_LOTES);
    expect(e.join(' ')).toMatch(/recorridas/);
  });

  it('frena perder la mayoria de las recorridas en un solo guardado', () => {
    const muchas = Array.from({ length: 30 }, (_, i) => rec(i + 1));
    const e = validarDatos(base(muchas.slice(0, 5)), base(muchas), false, SECCIONES_LOTES);
    expect(e.join(' ')).toMatch(/recorridas/);
  });
});
```

En `test/lotes-deshacer.test.mjs` (importar `CLAVE_DE_SECCION` si no está importado):

```js
describe('recorridas', () => {
  it('se deshacen por id', () => {
    expect(CLAVE_DE_SECCION.recorridas).toBe('id');
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run test/validacion.test.ts test/lotes-deshacer.test.mjs`
Expected: FAIL. "esta declarada" falla por `toContain('recorridas')`, y el de deshacer por `undefined`.

- [ ] **Step 3: Implementar**

`src/prensas/validacion.ts`: agregar al comentario `* \`recorridas\` (Inventario de tanques, 2026-10-14), igual.` y cambiar la lista:

```ts
  secciones: ['lotes', 'analisis', 'movimientos', 'ordenes_trabajo', 'vasijas', 'mermas', 'agenda', 'recorridas'],
```

`public/lotes/js/deshacer.js`:

```js
export const CLAVE_DE_SECCION = {
  lotes: 'lote', movimientos: 'id', ordenes_trabajo: 'id', mermas: 'id', vasijas: 'num', recorridas: 'id',
};
```

`public/lotes/js/nucleo.js`: en la línea 13 sumar `recorridas` a la forma documentada
(`{meta, config, lotes, analisis, estado_lote, excepciones_analisis, vasijas, mermas, recorridas}`), y debajo de la línea 491:

```js
  DATOS().recorridas           = DATOS().recorridas || [];
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run test/validacion.test.ts test/lotes-deshacer.test.mjs`
Expected: PASS.

Si "rechaza recorridas que no es una lista" falla, mirar cómo valida `validarDatos` las secciones listadas. El test equivalente de `ordenes_trabajo` (línea ~237) pasa con solo listarla, así que tendría que pasar igual.

- [ ] **Step 5: Commit**

```bash
git add src/prensas/validacion.ts public/lotes/js/deshacer.js public/lotes/js/nucleo.js test/validacion.test.ts test/lotes-deshacer.test.mjs
git commit -m "feat(lotes): seccion recorridas (inventario de tanques) con freno anti-borrado y deshacer"
```

---

### Task 2: Ocupación de vasijas (quién está en cada tanque)

**Files:**
- Create: `public/lotes/js/inventario-tanques.js`
- Test: `test/lotes-inventario-tanques.test.mjs`

**Interfaces:**
- Consumes: `normalizarNumVasija` de `vasijas-padron.js`, `esOrganico` de `envases.js`.
- Produces:
  - `partesVasija(texto: string) → string[]`: números normalizados, sin barricas.
  - `cosechaDeLote(lote) → string`: `'2025'` o `''`.
  - `ocupacion(padron, lotes) → { porVasija: Map<string, Ocupante[]>, sinVasija: SinVasija[] }`
    - `Ocupante = {lote, cosecha, variedad, id_texto, organico, etapa, litros: number|null, enVarias: boolean}`
    - `SinVasija = {lote, vasija_actual, litros, motivo: 'no-en-padron'|'vasija-inactiva'}`

- [ ] **Step 1: Tests que fallan**

Crear `test/lotes-inventario-tanques.test.mjs`:

```js
/* Inventario de tanques: que lote hay en cada vasija del padron
 * (spec 2026-10-14-lotes-inventario-tanques-design.md). */
import { describe, it, expect } from 'vitest';
import { partesVasija, cosechaDeLote, ocupacion } from '../public/lotes/js/inventario-tanques.js';

export const V = (num, extra = {}) => ({ num: String(num), tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: 'tanque-75hl', activa: true, ...extra });
export const L = (lote, extra = {}) => ({ lote: String(lote), variedad: 'Malbec', id_texto: 'MB x', litros_actuales: 7500,
  vasija_actual: 'T 201', vasija_grande: 7500, etapa: 'crianza', ...extra });

describe('partesVasija', () => {
  it('saca los numeros de tanque y descarta barricas', () => {
    expect(partesVasija('T 201')).toEqual(['201']);
    expect(partesVasija('H 170 + Barricas')).toEqual(['170']);
    expect(partesVasija('T 201 + T 202')).toEqual(['201', '202']);
    expect(partesVasija('Barricas')).toEqual([]);
    expect(partesVasija('')).toEqual([]);
    expect(partesVasija(null)).toEqual([]);
  });
});

describe('cosechaDeLote', () => {
  it('sale de los dos primeros digitos de un lote de 5', () => {
    expect(cosechaDeLote('25313')).toBe('2025');
    expect(cosechaDeLote(26002)).toBe('2026');
    expect(cosechaDeLote('AGRELO')).toBe('');
  });
});

describe('ocupacion', () => {
  const padron = [V(201), V(202), V(170, { cap_real: 2600, tabla: 'huevo-24hl' }), V(150, { activa: false })];

  it('ubica un lote en su tanque con los litros de vasija_grande', () => {
    const { porVasija, sinVasija } = ocupacion(padron, [L(25313)]);
    expect(porVasija.get('201')).toEqual([{ lote: '25313', cosecha: '2025', variedad: 'Malbec', id_texto: 'MB x',
      organico: false, etapa: 'crianza', litros: 7500, enVarias: false }]);
    expect(sinVasija).toEqual([]);
  });

  it('"H 170 + Barricas" va al 170 con solo los litros de tanque', () => {
    const { porVasija } = ocupacion(padron, [L(26140, { vasija_actual: 'H 170 + Barricas', vasija_grande: 2400, litros_actuales: 3300 })]);
    expect(porVasija.get('170')[0].litros).toBe(2400);
  });

  it('sin vasija_grande usa litros_actuales', () => {
    const { porVasija } = ocupacion(padron, [L(26140, { vasija_actual: 'T 202', vasija_grande: null, litros_actuales: 7000 })]);
    expect(porVasija.get('202')[0].litros).toBe(7000);
  });

  it('ignora lotes sin litros', () => {
    const { porVasija } = ocupacion(padron, [L(25313, { litros_actuales: 0 })]);
    expect(porVasija.get('201')).toBeUndefined();
  });

  it('dos lotes en el mismo tanque quedan los dos', () => {
    const { porVasija } = ocupacion(padron, [L(25313), L(25314)]);
    expect(porVasija.get('201').map(o => o.lote)).toEqual(['25313', '25314']);
  });

  it('un lote en dos vasijas del padron: litros desconocidos en cada una', () => {
    const { porVasija } = ocupacion(padron, [L(25313, { vasija_actual: 'T 201 + T 202' })]);
    expect(porVasija.get('201')[0]).toMatchObject({ litros: null, enVarias: true });
    expect(porVasija.get('202')[0]).toMatchObject({ litros: null, enVarias: true });
  });

  it('tanque fuera del padron con vasija_grande va a sinVasija', () => {
    const { sinVasija } = ocupacion(padron, [L(25313, { vasija_actual: 'T 999' })]);
    expect(sinVasija).toEqual([{ lote: '25313', vasija_actual: 'T 999', litros: 7500, motivo: 'no-en-padron' }]);
  });

  it('vasija inactiva va a sinVasija con su motivo', () => {
    const { sinVasija } = ocupacion(padron, [L(25313, { vasija_actual: 'P 150' })]);
    expect(sinVasija[0].motivo).toBe('vasija-inactiva');
  });

  it('envases chicos sin vasija_grande no se listan como sin vasija', () => {
    const { sinVasija } = ocupacion(padron, [L(25313, { vasija_actual: 't50 + Barrica', vasija_grande: null, cap225: 2 })]);
    expect(sinVasija).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run test/lotes-inventario-tanques.test.mjs`
Expected: FAIL con "Failed to load url ../public/lotes/js/inventario-tanques.js".

- [ ] **Step 3: Implementar**

Crear `public/lotes/js/inventario-tanques.js`:

```js
/* ===== Lotes CIW — inventario de tanques (puro) =====
 *
 * Que hay en cada vasija fija del padron. NO se guarda: se calcula cada vez
 * cruzando padron x lotes x OT pendientes x recorridas, asi confirmar, borrar
 * o deshacer una OT cambia el inventario sin tocar nada mas.
 * Spec: docs/superpowers/specs/2026-10-14-lotes-inventario-tanques-design.md */
'use strict';

import { normalizarNumVasija } from './vasijas-padron.js';
import { esOrganico } from './envases.js';

const numOk = v => { const x = Number(v); return v !== '' && v != null && Number.isFinite(x) ? x : null; };
const ES_BARRICA = /barric/i;

/* "H 170 + Barricas" -> ['170']. Solo partes con digitos: "Barricas" no es un tanque. */
export function partesVasija(texto){
  return String(texto ?? '').split('+').map(s => s.trim())
    .filter(s => s && !ES_BARRICA.test(s) && /\d/.test(s))
    .map(normalizarNumVasija);
}

/* El lote no tiene campo cosecha: 25313 -> '2025'. */
export function cosechaDeLote(lote){
  const s = String(lote ?? '').trim();
  return /^\d{5}$/.test(s) ? '20' + s.slice(0, 2) : '';
}

export function ocupacion(padron, lotes){
  const activas = new Map(), inactivas = new Set();
  for (const v of padron || []){
    if (!v) continue;
    const n = normalizarNumVasija(v.num);
    if (v.activa === false) inactivas.add(n); else activas.set(n, v);
  }
  const porVasija = new Map();
  const sinVasija = [];
  for (const l of lotes || []){
    const litrosLote = numOk(l && l.litros_actuales) ?? 0;
    if (!l || litrosLote <= 0) continue;
    const partes = partesVasija(l.vasija_actual);
    const enPadron = [...new Set(partes.filter(p => activas.has(p)))];
    const grande = numOk(l.vasija_grande);
    if (!enPadron.length){
      if (grande > 0){
        sinVasija.push({ lote: String(l.lote), vasija_actual: String(l.vasija_actual ?? ''), litros: grande,
          motivo: partes.some(p => inactivas.has(p)) ? 'vasija-inactiva' : 'no-en-padron' });
      }
      continue;
    }
    const enVarias = enPadron.length > 1;
    const litros = enVarias ? null : (grande > 0 ? grande : litrosLote);
    for (const n of enPadron){
      if (!porVasija.has(n)) porVasija.set(n, []);
      porVasija.get(n).push({
        lote: String(l.lote), cosecha: cosechaDeLote(l.lote), variedad: String(l.variedad ?? ''),
        id_texto: String(l.id_texto ?? ''), organico: esOrganico(l), etapa: String(l.etapa ?? ''),
        litros, enVarias,
      });
    }
  }
  return { porVasija, sinVasija };
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run test/lotes-inventario-tanques.test.mjs`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/inventario-tanques.js test/lotes-inventario-tanques.test.mjs
git commit -m "feat(lotes): ocupacion de vasijas del padron a partir de vasija_actual de los lotes"
```

---

### Task 3: Filas del inventario: estado, avisos y totales

**Files:**
- Modify: `public/lotes/js/inventario-tanques.js`
- Test: `test/lotes-inventario-tanques.test.mjs`

**Interfaces:**
- Consumes: `ocupacion` (Task 2), `PENDIENTE` de `ot-movimientos.js`.
- Produces:
  - `ESTADOS_MANUALES: string[]`
  - `ultimasMediciones(recorridas) → Map<num, {fecha, por, recorrida_id, ...fila}>`
  - `inventarioTanques({padron, lotes, ots, recorridas}) → {filas: Fila[], sinVasija, totales}`
    - `Fila = {num, tipo, cap_real, tabla, lotes: Ocupante[], litros: number|null, estado: string, estado_origen: 'manual'|'ot'|'auto'|'medicion', ot: string, velo: boolean, obs: string, ultima: Medicion|null, avisos: string[]}`
    - `totales = {ocupadas, vacias, litros, mermos, conAviso}`
  - Valores de avisos: `'dos-lotes' | 'excede' | 'diferencia' | 'sin-reparto'`.

- [ ] **Step 1: Tests que fallan**

Agregar al import del test: `inventarioTanques, ultimasMediciones, ESTADOS_MANUALES`. Agregar al final:

```js
const P = [V(201), V(202), V(170, { cap_real: 2600, tabla: 'huevo-24hl' })];
const REC = (fecha, filas, id = 'rec-' + fecha) => ({ id, fecha, por: 'oriana', filas });
const F = (vasija, extra = {}) => ({ vasija: String(vasija), lote: '25313', cm: null, litros_medidos: null, litros_web: 7500,
  velo: false, obs: '', estado_manual: '', aplicado: null, ...extra });
const OT = (extra = {}) => ({ id: 'ot-1', ot: '0123', estado: 'pendiente', destino: 'T 202',
  lotes: [{ lote: '25313', vasijas_manual: 'T 201', barriles: [] }], ...extra });
const inv = (o = {}) => inventarioTanques({ padron: P, lotes: [L(25313)], ots: [], recorridas: [], ...o });
const fila = (r, num) => r.filas.find(f => f.num === String(num));

describe('ultimasMediciones', () => {
  it('gana la fila de la recorrida mas nueva para cada vasija', () => {
    const m = ultimasMediciones([REC('2026-10-01', [F(201, { cm: 5 }), F(202, { cm: 1 })]), REC('2026-10-08', [F(201, { cm: 2 })])]);
    expect(m.get('201')).toMatchObject({ cm: 2, fecha: '2026-10-08', por: 'oriana' });
    expect(m.get('202')).toMatchObject({ cm: 1, fecha: '2026-10-01' });
  });
});

describe('inventarioTanques: filas', () => {
  it('una fila por vasija activa, en el orden del padron', () => {
    expect(inv().filas.map(f => f.num)).toEqual(['201', '202', '170']);
  });

  it('suma los litros de la vasija', () => {
    expect(fila(inv(), 201).litros).toBe(7500);
    expect(fila(inv(), 202).litros).toBe(0);
  });
});

describe('inventarioTanques: estado', () => {
  it('vacia', () => {
    expect(fila(inv(), 202)).toMatchObject({ estado: 'VACÍA', estado_origen: 'auto' });
  });
  it('por etapa: ingreso -> MOSTO, fa -> FERMENTANDO, resto -> VINO TERMINADO', () => {
    expect(fila(inv({ lotes: [L(25313, { etapa: 'ingreso' })] }), 201).estado).toBe('MOSTO');
    expect(fila(inv({ lotes: [L(25313, { etapa: 'fa' })] }), 201).estado).toBe('FERMENTANDO');
    expect(fila(inv({ lotes: [L(25313, { etapa: 'fml' })] }), 201).estado).toBe('VINO TERMINADO');
    expect(fila(inv({ lotes: [L(25313, { etapa: '' })] }), 201).estado).toBe('VINO TERMINADO');
  });
  it('MERMO si la ultima medicion del mismo lote dio cm > 0', () => {
    const r = inv({ recorridas: [REC('2026-10-08', [F(201, { cm: 3, litros_medidos: 7420 })])] });
    expect(fila(r, 201)).toMatchObject({ estado: 'MERMO', estado_origen: 'medicion' });
  });
  it('una medicion de un lote anterior no da MERMO', () => {
    const r = inv({ recorridas: [REC('2026-10-08', [F(201, { lote: '24001', cm: 3 })])] });
    expect(fila(r, 201).estado).toBe('VINO TERMINADO');
  });
  it('OT pendiente que sale o entra: TRASIEGO (OT n)', () => {
    const r = inv({ ots: [OT()] });
    expect(fila(r, 201)).toMatchObject({ estado: 'TRASIEGO (OT 0123)', estado_origen: 'ot', ot: '0123' });
    expect(fila(r, 202)).toMatchObject({ estado: 'TRASIEGO (OT 0123)', estado_origen: 'ot' });
  });
  it('una OT ejecutada no cuenta', () => {
    expect(fila(inv({ ots: [OT({ estado: 'ejecutado' })] }), 201).estado).toBe('VINO TERMINADO');
  });
  it('lo manual gana a todo y sigue aunque la medicion sea de otro lote', () => {
    const r = inv({ ots: [OT()], recorridas: [REC('2026-10-08', [F(201, { lote: '24001', cm: 3, estado_manual: 'NO SO2' })])] });
    expect(fila(r, 201)).toMatchObject({ estado: 'NO SO2', estado_origen: 'manual' });
  });
  it('velo y obs vienen de la ultima medicion', () => {
    const r = inv({ recorridas: [REC('2026-10-08', [F(201, { velo: true, obs: 'Brett' })])] });
    expect(fila(r, 201)).toMatchObject({ velo: true, obs: 'Brett' });
  });
  it('ESTADOS_MANUALES trae la lista de la Hoja1 del Excel', () => {
    expect(ESTADOS_MANUALES).toEqual(['FUERA DE SERVICIO', 'TRASLADO', 'TRASIEGO', 'MOSTO', 'FERMENTANDO',
      'DESBORRE', 'MERMO', 'DESCUBE', 'NO SO2', 'VINO TERMINADO']);
  });
});

describe('inventarioTanques: avisos y totales', () => {
  it('dos-lotes', () => {
    expect(fila(inv({ lotes: [L(25313), L(25314)] }), 201).avisos).toContain('dos-lotes');
  });
  it('excede la Cap REAL', () => {
    expect(fila(inv({ lotes: [L(25313, { vasija_grande: 8000, litros_actuales: 8000 })] }), 201).avisos).toContain('excede');
  });
  it('sin-reparto para un lote en dos vasijas', () => {
    const r = inv({ lotes: [L(25313, { vasija_actual: 'T 201 + T 202' })] });
    expect(fila(r, 201)).toMatchObject({ litros: null });
    expect(fila(r, 201).avisos).toContain('sin-reparto');
  });
  it('diferencia: medido del mismo lote distinto de la web y sin aplicar', () => {
    const med = F(201, { cm: 3, litros_medidos: 7420 });
    expect(fila(inv({ recorridas: [REC('2026-10-08', [med])] }), 201).avisos).toContain('diferencia');
    const aplicada = { ...med, aplicado: { el: '2026-10-08', por: 'x', antes: {} } };
    expect(fila(inv({ recorridas: [REC('2026-10-08', [aplicada])] }), 201).avisos).not.toContain('diferencia');
    const igual = F(201, { cm: 0, litros_medidos: 7500.5 });
    expect(fila(inv({ recorridas: [REC('2026-10-08', [igual])] }), 201).avisos).not.toContain('diferencia');
  });
  it('totales', () => {
    const r = inv({ recorridas: [REC('2026-10-08', [F(201, { cm: 3, litros_medidos: 7420 })])] });
    expect(r.totales).toEqual({ ocupadas: 1, vacias: 2, litros: 7500, mermos: 1, conAviso: 1 });
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run test/lotes-inventario-tanques.test.mjs`
Expected: FAIL con "inventarioTanques is not a function" (o export ausente).

- [ ] **Step 3: Implementar**

Agregar a `public/lotes/js/inventario-tanques.js` el import `import { PENDIENTE } from './ot-movimientos.js';` y, al final:

```js
/* La lista de la Hoja1 del Excel de Oriana, en su orden. */
export const ESTADOS_MANUALES = ['FUERA DE SERVICIO', 'TRASLADO', 'TRASIEGO', 'MOSTO', 'FERMENTANDO',
  'DESBORRE', 'MERMO', 'DESCUBE', 'NO SO2', 'VINO TERMINADO'];

const TOLERANCIA_L = 1;

/* La ultima fila que mide cada vasija, en cualquier recorrida. Una recorrida
 * puede cubrir solo algunas vasijas. A igual fecha gana la que viene despues. */
export function ultimasMediciones(recorridas){
  const out = new Map();
  const orden = [...(recorridas || [])].filter(Boolean)
    .map((r, i) => ({ r, i })).sort((a, b) => String(a.r.fecha).localeCompare(String(b.r.fecha)) || a.i - b.i);
  for (const { r } of orden){
    for (const f of r.filas || []){
      if (!f) continue;
      out.set(normalizarNumVasija(f.vasija), { ...f, fecha: r.fecha, por: r.por, recorrida_id: r.id });
    }
  }
  return out;
}

/* num de vasija -> numero de la primera OT pendiente que sale de ella o entra en ella. */
function otsPorVasija(ots){
  const out = new Map();
  const anotar = (n, ot) => { if (n && !out.has(n)) out.set(n, String(ot.ot ?? '')); };
  for (const ot of ots || []){
    if (!ot || ot.estado !== PENDIENTE) continue;
    for (const n of partesVasija(ot.destino)) anotar(n, ot);
    for (const l of ot.lotes || []) for (const n of partesVasija(l && l.vasijas_manual)) anotar(n, ot);
  }
  return out;
}

function estadoPorEtapa(etapa){
  if (etapa === 'ingreso') return 'MOSTO';
  if (etapa === 'fa') return 'FERMENTANDO';
  return 'VINO TERMINADO';
}

export function inventarioTanques({ padron, lotes, ots, recorridas }){
  const { porVasija, sinVasija } = ocupacion(padron, lotes);
  const medidas = ultimasMediciones(recorridas);
  const otDe = otsPorVasija(ots);
  const filas = [];
  for (const v of padron || []){
    if (!v || v.activa === false) continue;
    const num = normalizarNumVasija(v.num);
    const ocupantes = porVasija.get(num) || [];
    const sinReparto = ocupantes.some(o => o.litros == null);
    const litros = sinReparto ? null : ocupantes.reduce((s, o) => s + o.litros, 0);
    const ultima = medidas.get(num) || null;
    const loteUnico = ocupantes.length === 1 ? ocupantes[0].lote : null;
    const mismoLote = !!ultima && loteUnico != null && String(ultima.lote) === loteUnico;

    let estado, estado_origen, ot = '';
    if (ultima && ultima.estado_manual){ estado = ultima.estado_manual; estado_origen = 'manual'; }
    else if (otDe.has(num)){ ot = otDe.get(num); estado = `TRASIEGO (OT ${ot})`; estado_origen = 'ot'; }
    else if (!ocupantes.length){ estado = 'VACÍA'; estado_origen = 'auto'; }
    else if (mismoLote && Number(ultima.cm) > 0){ estado = 'MERMO'; estado_origen = 'medicion'; }
    else { estado = estadoPorEtapa(ocupantes[0].etapa); estado_origen = 'auto'; }

    const avisos = [];
    if (ocupantes.length > 1) avisos.push('dos-lotes');
    if (sinReparto) avisos.push('sin-reparto');
    if (litros != null && litros > Number(v.cap_real)) avisos.push('excede');
    if (mismoLote && !ultima.aplicado && ultima.litros_medidos != null && litros != null
        && Math.abs(Number(ultima.litros_medidos) - litros) > TOLERANCIA_L) avisos.push('diferencia');

    filas.push({ num, tipo: String(v.tipo ?? ''), cap_real: Number(v.cap_real) || null, tabla: v.tabla ?? null,
      lotes: ocupantes, litros, estado, estado_origen, ot,
      velo: !!(ultima && ultima.velo), obs: String((ultima && ultima.obs) || ''), ultima, avisos });
  }
  const totales = {
    ocupadas: filas.filter(f => f.lotes.length).length,
    vacias: filas.filter(f => !f.lotes.length).length,
    litros: filas.reduce((s, f) => s + (f.litros || 0), 0),
    mermos: filas.filter(f => f.estado === 'MERMO').length,
    conAviso: filas.filter(f => f.avisos.length).length,
  };
  return { filas, sinVasija, totales };
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run test/lotes-inventario-tanques.test.mjs`
Expected: PASS (todos, incluidos los de Task 2).

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/inventario-tanques.js test/lotes-inventario-tanques.test.mjs
git commit -m "feat(lotes): inventario de tanques con estado automatico, avisos y totales"
```

---

### Task 4: Recorridas: medir y aplicar diferencias

**Files:**
- Create: `public/lotes/js/recorridas.js`
- Test: `test/lotes-recorridas.test.mjs`

**Interfaces:**
- Consumes: `litrosPorCm` (`cubicacion.js`), `litrosDelLote` (`mermas.js`), `partesVasija` (Task 2), `Fila` de `inventarioTanques` (Task 3).
- Produces:
  - `medirFila(filaInv, entrada) → FilaRecorrida | null`. `entrada = {cm, velo, obs, estado_manual}`, donde `cm` puede ser `''`/string con coma. Da `null` si no hay nada cargado.
  - `nuevaRecorrida({id, fecha, por, filas}) → Recorrida`
  - `aplicarDiferencias(datos, items, usuario, hoy) → {aplicados: string[], salteados: {vasija, motivo}[]}`
    - `items = [{recorrida_id, vasija}]`
    - Muta `datos.lotes` y `datos.recorridas`.
    - Motivos: `'no-encontrada' | 'ya-aplicada' | 'sin-litros' | 'lote-movido' | 'varias-vasijas'`.

- [ ] **Step 1: Tests que fallan**

Crear `test/lotes-recorridas.test.mjs`:

```js
/* Recorrida del inventario de tanques: medir por cm y corregir litros con check. */
import { describe, it, expect } from 'vitest';
import { medirFila, nuevaRecorrida, aplicarDiferencias } from '../public/lotes/js/recorridas.js';

const filaInv = (extra = {}) => ({ num: '201', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: 'tanque-75hl',
  lotes: [{ lote: '25313', litros: 7500 }], litros: 7500, ...extra });

describe('medirFila', () => {
  it('sin nada cargado da null', () => {
    expect(medirFila(filaInv(), { cm: '', velo: false, obs: '', estado_manual: '' })).toBeNull();
  });
  it('con cm calcula litros por cubicacion y guarda la foto de la web', () => {
    const f = medirFila(filaInv(), { cm: '0', velo: true, obs: ' Brett ', estado_manual: '' });
    expect(f).toEqual({ vasija: '201', lote: '25313', cm: 0, litros_medidos: 7500, litros_web: 7500,
      velo: true, obs: 'Brett', estado_manual: '', aplicado: null });
  });
  it('acepta coma decimal', () => {
    expect(medirFila(filaInv(), { cm: '2,5' }).cm).toBe(2.5);
  });
  it('vasija sin tabla: guarda cm pero sin litros', () => {
    const f = medirFila(filaInv({ tabla: null }), { cm: '3' });
    expect(f).toMatchObject({ cm: 3, litros_medidos: null });
  });
  it('vasija vacia: lote vacio', () => {
    const f = medirFila(filaInv({ lotes: [], litros: 0 }), { estado_manual: 'FUERA DE SERVICIO' });
    expect(f).toMatchObject({ lote: '', estado_manual: 'FUERA DE SERVICIO', cm: null });
  });
});

describe('nuevaRecorrida', () => {
  it('descarta las filas null', () => {
    expect(nuevaRecorrida({ id: 'rec-1', fecha: '2026-10-14', por: 'oriana', filas: [null, { vasija: '201' }] }))
      .toEqual({ id: 'rec-1', fecha: '2026-10-14', por: 'oriana', filas: [{ vasija: '201' }] });
  });
});

describe('aplicarDiferencias', () => {
  const datos = (loteExtra = {}, filaExtra = {}) => ({
    lotes: [{ lote: '25313', vasija_actual: 'T 201', vasija_grande: 7500, litros_actuales: 7500, ...loteExtra }],
    mermas: [],
    recorridas: [{ id: 'rec-1', fecha: '2026-10-14', por: 'oriana', filas: [
      { vasija: '201', lote: '25313', cm: 3, litros_medidos: 7420, litros_web: 7500, aplicado: null, ...filaExtra }] }],
  });

  it('escribe vasija_grande, recalcula litros_actuales y anota lo que habia', () => {
    const d = datos();
    const r = aplicarDiferencias(d, [{ recorrida_id: 'rec-1', vasija: '201' }], 'roy', '2026-10-14');
    expect(r).toEqual({ aplicados: ['25313'], salteados: [] });
    expect(d.lotes[0]).toMatchObject({ vasija_grande: 7420, litros_actuales: 7420 });
    expect(d.recorridas[0].filas[0].aplicado).toEqual({ el: '2026-10-14', por: 'roy',
      antes: { vasija_grande: 7500, litros_actuales: 7500 } });
  });

  it('respeta los otros envases del lote', () => {
    const d = datos({ vasija_actual: 'H 201 + Barricas', cap225: 2, litros_actuales: 7950 });
    aplicarDiferencias(d, [{ recorrida_id: 'rec-1', vasija: '201' }], 'roy', '2026-10-14');
    expect(d.lotes[0].litros_actuales).toBe(7420 + 450);
  });

  it('saltea si el lote ya no esta en esa vasija', () => {
    const d = datos({ vasija_actual: 'T 202' });
    expect(aplicarDiferencias(d, [{ recorrida_id: 'rec-1', vasija: '201' }], 'roy', '2026-10-14'))
      .toEqual({ aplicados: [], salteados: [{ vasija: '201', motivo: 'lote-movido' }] });
    expect(d.lotes[0].vasija_grande).toBe(7500);
  });

  it('saltea un lote en dos vasijas del padron', () => {
    const d = datos({ vasija_actual: 'T 201 + T 202' });
    expect(aplicarDiferencias(d, [{ recorrida_id: 'rec-1', vasija: '201' }], 'roy', '2026-10-14').salteados)
      .toEqual([{ vasija: '201', motivo: 'varias-vasijas' }]);
  });

  it('saltea sin litros medidos y ya aplicada', () => {
    expect(aplicarDiferencias(datos({}, { litros_medidos: null }), [{ recorrida_id: 'rec-1', vasija: '201' }], 'r', 'h').salteados[0].motivo)
      .toBe('sin-litros');
    expect(aplicarDiferencias(datos({}, { aplicado: { el: 'x' } }), [{ recorrida_id: 'rec-1', vasija: '201' }], 'r', 'h').salteados[0].motivo)
      .toBe('ya-aplicada');
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run test/lotes-recorridas.test.mjs`
Expected: FAIL con "Failed to load url ../public/lotes/js/recorridas.js".

- [ ] **Step 3: Implementar**

Crear `public/lotes/js/recorridas.js`:

```js
/* ===== Lotes CIW — recorridas del inventario de tanques (puro) =====
 *
 * Una recorrida es lo que se mide mirando el tanque: cm de merma (0 = lleno),
 * velo, observacion y un estado a mano. Los litros salen de la cubicacion
 * (manda la Cap REAL). Si no coinciden con la web, "Aplicar diferencias"
 * corrige el lote, siempre con check manual. */
'use strict';

import { litrosPorCm } from './cubicacion.js';
import { litrosDelLote } from './mermas.js';
import { partesVasija } from './inventario-tanques.js';
import { normalizarNumVasija } from './vasijas-padron.js';

function leerCm(cm){
  if (cm === '' || cm == null) return null;
  const x = typeof cm === 'number' ? cm : parseFloat(String(cm).replace(',', '.'));
  return Number.isFinite(x) && x >= 0 ? x : null;
}

export function medirFila(filaInv, entrada){
  const e = entrada || {};
  const cm = leerCm(e.cm);
  const velo = !!e.velo, obs = String(e.obs || '').trim(), estado_manual = String(e.estado_manual || '');
  if (cm == null && !velo && !obs && !estado_manual) return null;
  const vasija = { num: filaInv.num, cap_real: filaInv.cap_real, tabla: filaInv.tabla };
  const r = cm == null ? null : litrosPorCm(vasija, cm);
  const ocup = filaInv.lotes || [];
  return {
    vasija: String(filaInv.num),
    lote: ocup.length === 1 ? String(ocup[0].lote) : ocup.map(o => o.lote).join(' + '),
    cm, litros_medidos: r && !r.error ? r.litros : null, litros_web: filaInv.litros ?? null,
    velo, obs, estado_manual, aplicado: null,
  };
}

export function nuevaRecorrida({ id, fecha, por, filas }){
  return { id, fecha, por: String(por || ''), filas: (filas || []).filter(Boolean) };
}

export function aplicarDiferencias(datos, items, usuario, hoy){
  const aplicados = [], salteados = [];
  const saltear = (vasija, motivo) => salteados.push({ vasija: String(vasija), motivo });
  for (const it of items || []){
    const rec = (datos.recorridas || []).find(r => r && r.id === it.recorrida_id);
    const num = normalizarNumVasija(it.vasija);
    const f = rec && (rec.filas || []).find(x => x && normalizarNumVasija(x.vasija) === num);
    if (!f){ saltear(it.vasija, 'no-encontrada'); continue; }
    if (f.aplicado){ saltear(it.vasija, 'ya-aplicada'); continue; }
    if (f.litros_medidos == null){ saltear(it.vasija, 'sin-litros'); continue; }
    const lote = (datos.lotes || []).find(l => l && String(l.lote) === String(f.lote));
    const partes = lote ? partesVasija(lote.vasija_actual) : [];
    if (!lote || !partes.includes(num)){ saltear(it.vasija, 'lote-movido'); continue; }
    // Las partes que NO son esta vasija pueden ser tanques fuera del padron;
    // igual no hay forma de repartir vasija_grande entre dos tanques.
    if (new Set(partes).size > 1){ saltear(it.vasija, 'varias-vasijas'); continue; }
    const antes = { vasija_grande: lote.vasija_grande ?? null, litros_actuales: lote.litros_actuales ?? null };
    lote.vasija_grande = f.litros_medidos;
    lote.litros_actuales = litrosDelLote(lote, datos.mermas);
    f.aplicado = { el: hoy, por: usuario || '', antes };
    aplicados.push(String(lote.lote));
  }
  return { aplicados, salteados };
}
```

Nota: el test "respeta los otros envases" se apoya en `CAPACIDADES` de `envases.js:21` (`cap225` → 225 L), verificado.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run test/lotes-recorridas.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/recorridas.js test/lotes-recorridas.test.mjs
git commit -m "feat(lotes): recorridas del inventario de tanques: medir por cm y aplicar diferencias con check"
```

---

### Task 5: Hoja de recorrida para imprimir

**Files:**
- Create: `public/lotes/js/hoja-recorrida.js`
- Test: `test/lotes-hoja-recorrida.test.mjs`

**Interfaces:**
- Consumes: `Fila` de `inventarioTanques` (Task 3).
- Produces: `hojaRecorridaHTML(filas: Fila[], fecha: 'YYYY-MM-DD') → string`. Es una o más `<div class="orden-hoja inv-hoja">` (40 vasijas por hoja, 2 columnas de 20). Va pensada para pintarse en `#otMovHoja`.

- [ ] **Step 1: Tests que fallan**

Crear `test/lotes-hoja-recorrida.test.mjs`:

```js
/* Hoja de recorrida: el formulario de la hoja "Inventario" del Excel, con el lote precargado. */
import { describe, it, expect } from 'vitest';
import { hojaRecorridaHTML } from '../public/lotes/js/hoja-recorrida.js';

const F = (num, lote) => ({ num: String(num), lotes: lote ? [{ lote }] : [] });

describe('hojaRecorridaHTML', () => {
  it('trae encabezados del Excel, fecha y lote precargado', () => {
    const h = hojaRecorridaHTML([F(201, '25313'), F(202)], '2026-10-14');
    expect(h).toContain('N° de vasija');
    expect(h).toContain('cm Merma / Lleno');
    expect(h).toContain('Velo');
    expect(h).toContain('14/10/2026');
    expect(h).toMatch(/201<\/td><td[^>]*>25313/);
  });
  it('dos lotes en una vasija salen juntos', () => {
    expect(hojaRecorridaHTML([{ num: '201', lotes: [{ lote: '25313' }, { lote: '25314' }] }], '2026-10-14'))
      .toContain('25313 + 25314');
  });
  it('40 vasijas por hoja', () => {
    const filas = Array.from({ length: 78 }, (_, i) => F(100 + i, ''));
    expect(hojaRecorridaHTML(filas, '2026-10-14').match(/class="orden-hoja inv-hoja"/g)).toHaveLength(2);
  });
  it('escapa el texto', () => {
    expect(hojaRecorridaHTML([F('<b>', '<x>')], '2026-10-14')).not.toContain('<b>');
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run test/lotes-hoja-recorrida.test.mjs`
Expected: FAIL con "Failed to load url".

- [ ] **Step 3: Implementar**

Crear `public/lotes/js/hoja-recorrida.js`. No importa `nucleo.js` (toca el DOM), así que define su propio `esc`:

```js
/* ===== Lotes CIW — hoja de recorrida del inventario de tanques (puro) =====
 * El formulario de la hoja "Inventario" del Excel de Oriana (N° de vasija,
 * Lote, cm Merma / Lleno, Velo) en dos columnas, con el lote ya puesto. */
'use strict';

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const POR_HOJA = 40, POR_COLUMNA = 20;

const fechaAr = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

function tabla(filas){
  const tr = filas.map(f => `<tr><td class="inv-h-num">${esc(f.num)}</td><td>${esc((f.lotes || []).map(o => o.lote).join(' + '))}</td><td></td><td></td></tr>`).join('');
  return `<table class="inv-h-tabla"><thead><tr><th>N° de vasija</th><th>Lote</th><th>cm Merma / Lleno</th><th>Velo</th></tr></thead><tbody>${tr}</tbody></table>`;
}

export function hojaRecorridaHTML(filas, fecha){
  const hojas = [];
  for (let i = 0; i < Math.max(1, filas.length); i += POR_HOJA){
    const parte = filas.slice(i, i + POR_HOJA);
    hojas.push(`<div class="orden-hoja inv-hoja">
      <div class="inv-h-titulo">Inventario de vasijas fijas de CIW — recorrida del ${esc(fechaAr(fecha))}</div>
      <div class="inv-h-cols">${tabla(parte.slice(0, POR_COLUMNA))}${tabla(parte.slice(POR_COLUMNA))}</div>
      <div class="inv-h-firma">Recorrió: ______________________ &nbsp; Firma: ______________________</div>
    </div>`);
  }
  return hojas.join('');
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run test/lotes-hoja-recorrida.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/hoja-recorrida.js test/lotes-hoja-recorrida.test.mjs
git commit -m "feat(lotes): hoja de recorrida imprimible del inventario de tanques"
```

---

### Task 6: Vista: sub-pestaña con tabla, filtros, recorrida, aplicar e imprimir

**Files:**
- Create: `public/lotes/js/vista-inventario-tanques.js`
- Modify: `public/lotes/js/vista-movimientos.js` (comentario de `_sub` ~82-84, `_selectorSub` ~87-92, `renderMovimientos` después de la rama `'mermas'` ~282, imports)
- Modify: `public/lotes/index.html` (estilos, junto a `.mov-sub` ~1268-1276)

**Interfaces:**
- Consumes: `inventarioTanques`, `ESTADOS_MANUALES` (Task 3), `medirFila`, `nuevaRecorrida`, `aplicarDiferencias` (Task 4), `hojaRecorridaHTML` (Task 5), `imprimirSoloPapel` (`vista-ot-emitir.js`), `$, esc, escA, DATOS, markDirty, usuarioActual, pedirUsuario, irALote, avisoBreve` (`nucleo.js`), `hoyLocalISO` (`fechas.js`).
- Produces: `renderInventarioTanques(cont: HTMLElement, {onCambio: () => void})`.

Esta tarea es de UI, sin test unitario: la lógica ya está probada en las tareas 2 a 5. Se verifica en la Task 7 en el navegador.

- [ ] **Step 1: Registrar la sub-pestaña en `vista-movimientos.js`**

Import, junto a `renderMermas`:

```js
import { renderInventarioTanques } from './vista-inventario-tanques.js';
```

Comentario de `_sub`: agregar `'tanques' (inventario de tanques, vista-inventario-tanques.js)`. En `_selectorSub`:

```js
    b('historial', '📋 Historial') + b('ordenes', '📝 Órdenes de trabajo') + b('mermas', '🛢 Mermas') +
    b('tanques', '🏺 Inventario de tanques') + '</div>';
```

En `renderMovimientos`, después del bloque `if (_sub === 'mermas'){…}`:

```js
  if (_sub === 'tanques'){
    // #otMovHoja: la hoja de recorrida se imprime con printing-ot-mov, igual que las OT.
    sec.innerHTML = _selectorSub() + '<div id="movTanques"></div><div id="otMovHoja" style="display:none"></div>';
    _cablearSelector(sec);
    renderInventarioTanques($('movTanques'), { onCambio: renderMovimientos });
    return;
  }
```

- [ ] **Step 2: Crear `public/lotes/js/vista-inventario-tanques.js`**

```js
/* ===== Lotes CIW — sub-pestaña Movimientos -> Inventario de tanques =====
 * Que hay en cada vasija fija de CIW. Se calcula de las OT (inventario-tanques.js);
 * lo unico que se carga a mano es la recorrida (recorridas.js). */
'use strict';

import { $, esc, escA, DATOS, markDirty, usuarioActual, pedirUsuario, irALote, avisoBreve } from './nucleo.js';
import { inventarioTanques, ESTADOS_MANUALES } from './inventario-tanques.js';
import { medirFila, nuevaRecorrida, aplicarDiferencias } from './recorridas.js';
import { hojaRecorridaHTML } from './hoja-recorrida.js';
import { imprimirSoloPapel } from './vista-ot-emitir.js';
import { hoyLocalISO, fmtFecha } from './fechas.js';

const CLAVE_FILTRO = 'lotes_inv_tanques_filtro';
const leerFiltro = () => { try { return localStorage.getItem(CLAVE_FILTRO) || 'todas'; } catch(e) { return 'todas'; } };
const guardarFiltro = v => { try { localStorage.setItem(CLAVE_FILTRO, v); } catch(e) {} };

let _filtro = leerFiltro();
let _midiendo = false;           // modo recorrida
let _entradas = new Map();       // num -> {cm, velo, obs, estado_manual} mientras se mide
let _destildados = new Set();    // `${recorrida_id}|${vasija}` que el usuario destildo

const AVISO_TXT = {
  'dos-lotes': 'Hay más de un lote en esta vasija',
  'excede': 'Más litros que la Cap REAL',
  'diferencia': 'Lo medido no coincide con la web',
  'sin-reparto': 'El lote está en varias vasijas: no se sabe cuántos litros hay en cada una',
};
const SALTEO_TXT = {
  'no-encontrada': 'no se encontró la medición', 'ya-aplicada': 'ya estaba aplicada',
  'sin-litros': 'la medición no tiene litros', 'lote-movido': 'el lote ya no está en esa vasija',
  'varias-vasijas': 'el lote está en varias vasijas',
};
const L = x => x == null ? '?' : Math.round(x).toLocaleString('es-AR');
const pasaFiltro = f => _filtro === 'todas' ? true
  : _filtro === 'ocupadas' ? f.lotes.length > 0
  : _filtro === 'vacias' ? f.lotes.length === 0
  : f.avisos.length > 0;

function celdaLotes(f, k){
  return f.lotes.map(o => esc(o[k] === true ? 'Sí' : o[k] === false ? '' : o[k])).join('<br>');
}

function celdaUltima(f){
  const u = f.ultima;
  if (!u) return '';
  const cm = u.cm == null ? '' : (u.cm === 0 ? 'lleno' : `${u.cm} cm`);
  return `${esc(fmtFecha(u.fecha))} ${esc(cm)} <span class="inv-quien">${esc(u.por)}</span>`;
}

function celdaDiferencia(f){
  if (!f.avisos.includes('diferencia')) return '';
  const u = f.ultima, clave = `${u.recorrida_id}|${f.num}`;
  const deshabilitado = f.lotes.length !== 1 || f.lotes[0].enVarias;
  return `<label class="inv-dif"><input type="checkbox" data-dif="${escA(clave)}"${_destildados.has(clave) || deshabilitado ? '' : ' checked'}${deshabilitado ? ' disabled' : ''}>
    web ${L(f.litros)} → medido ${L(u.litros_medidos)}</label>`;
}

function filaHTML(f){
  const e = _entradas.get(f.num) || {};
  const medir = _midiendo ? `
    <td><input class="inv-in" data-num="${escA(f.num)}" data-k="cm" inputmode="decimal" value="${escA(e.cm ?? '')}" placeholder="cm"></td>
    <td class="inv-medido" data-medido="${escA(f.num)}"></td>
    <td><input type="checkbox" data-num="${escA(f.num)}" data-k="velo"${(e.velo ?? f.velo) ? ' checked' : ''}></td>
    <td><input class="inv-in inv-obs" data-num="${escA(f.num)}" data-k="obs" value="${escA(e.obs ?? f.obs)}"></td>
    <td><select data-num="${escA(f.num)}" data-k="estado_manual"><option value="">(automático)</option>${
      ESTADOS_MANUALES.map(s => `<option${(e.estado_manual ?? (f.estado_origen === 'manual' ? f.estado : '')) === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></td>`
    : `<td>${f.velo ? 'VELO' : ''}</td><td>${esc(f.obs)}</td><td>${celdaUltima(f)}</td><td>${celdaDiferencia(f)}</td>`;
  const avisos = f.avisos.filter(a => a !== 'diferencia')
    .map(a => `<span class="inv-aviso" title="${escA(AVISO_TXT[a])}">⚠</span>`).join('');
  return `<tr class="${f.avisos.length ? 'inv-con-aviso' : ''}${f.lotes.length ? '' : ' inv-vacia'}">
    <td class="inv-num">${esc(f.num)}</td><td>${esc(f.tipo)}</td><td class="n">${L(f.cap_real)}</td>
    <td>${f.lotes.map(o => `<a href="#" data-lote="${escA(o.lote)}">${esc(o.lote)}</a>`).join('<br>')}</td>
    <td>${celdaLotes(f, 'cosecha')}</td><td>${celdaLotes(f, 'variedad')}</td><td>${celdaLotes(f, 'id_texto')}</td>
    <td class="n">${f.lotes.length ? L(f.litros) : ''}</td>
    <td><span class="inv-estado inv-${escA(f.estado_origen)}">${esc(f.estado)}</span>${avisos}</td>
    <td>${celdaLotes(f, 'organico')}</td>${medir}</tr>`;
}

export function renderInventarioTanques(cont, { onCambio }){
  const datos = DATOS();
  if (!(datos.vasijas || []).length){
    cont.innerHTML = `<p class="inv-nota">No hay padrón de vasijas cargado. Cargalo en <b>Configuración → Vasijas</b> (⬇ Cargar padrón inicial).</p>`;
    return;
  }
  const inv = inventarioTanques({ padron: datos.vasijas, lotes: datos.lotes, ots: datos.ordenes_trabajo, recorridas: datos.recorridas });
  const t = inv.totales;
  const filas = inv.filas.filter(pasaFiltro);
  const difs = inv.filas.filter(f => f.avisos.includes('diferencia'));
  const opt = (v, txt) => `<option value="${v}"${_filtro === v ? ' selected' : ''}>${txt}</option>`;
  const cabMedir = _midiendo
    ? '<th>cm merma</th><th>Litros medidos</th><th>Velo</th><th>Observación</th><th>Estado a mano</th>'
    : '<th>Velo</th><th>Observación</th><th>Última medición</th><th>Diferencia</th>';

  cont.innerHTML = `<div class="toolbar">
      <span class="tag">${t.ocupadas} ocupadas · ${t.vacias} vacías · ${L(t.litros)} L · ${t.mermos} mermo${t.mermos === 1 ? '' : 's'}${t.conAviso ? ` · ${t.conAviso} con aviso` : ''}</span>
      <select id="invFiltro">${opt('todas', 'Todas')}${opt('ocupadas', 'Ocupadas')}${opt('vacias', 'Vacías')}${opt('aviso', 'Con aviso')}</select>
      ${_midiendo
        ? '<button class="btn primary" id="invGuardarRec">💾 Guardar recorrida</button><button class="btn" id="invCancelarRec">Cancelar</button>'
        : `<button class="btn" id="invNuevaRec">📏 Nueva recorrida</button>
           <button class="btn" id="invImprimir">🖨 Hoja de recorrida</button>
           ${difs.length ? `<button class="btn" id="invAplicar">Aplicar diferencias (${difs.length})</button>` : ''}`}
    </div>
    <p class="inv-nota">Se actualiza sola con las OT confirmadas. En la recorrida, 0 cm = lleno.</p>
    <div class="scroll"><table class="inv-tabla"><thead><tr>
      <th>N°</th><th>Tipo</th><th>Cap REAL</th><th>Lote</th><th>Cosecha</th><th>Variedad</th><th>ID</th><th>Litros</th>
      <th>Estado</th><th>Orgánico</th>${cabMedir}</tr></thead>
      <tbody>${filas.map(filaHTML).join('') || '<tr><td colspan="14" class="inv-nota">No hay vasijas con ese filtro.</td></tr>'}</tbody></table></div>
    ${inv.sinVasija.length ? `<h4 class="inv-sub">Lotes sin vasija conocida</h4>
      <table class="inv-tabla"><thead><tr><th>Lote</th><th>Vasija actual</th><th>Litros en tanque</th><th>Motivo</th></tr></thead><tbody>${
        inv.sinVasija.map(s => `<tr><td><a href="#" data-lote="${escA(s.lote)}">${esc(s.lote)}</a></td><td>${esc(s.vasija_actual)}</td>
          <td class="n">${L(s.litros)}</td><td>${s.motivo === 'vasija-inactiva' ? 'vasija inactiva en el padrón' : 'no está en el padrón'}</td></tr>`).join('')}</tbody></table>` : ''}`;

  $('invFiltro').addEventListener('change', e => { _filtro = e.target.value; guardarFiltro(_filtro); onCambio(); });
  cont.querySelectorAll('[data-lote]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); irALote(a.dataset.lote); }));

  if (_midiendo){
    const porNum = new Map(inv.filas.map(f => [f.num, f]));
    const pintarMedido = num => {
      const td = cont.querySelector(`[data-medido="${CSS.escape(num)}"]`);
      if (!td) return;
      const m = medirFila(porNum.get(num), _entradas.get(num));
      td.textContent = !m || m.cm == null ? '' : m.litros_medidos == null ? 'sin tabla / cm inválido' : `${L(m.litros_medidos)} L`;
    };
    cont.querySelectorAll('[data-k]').forEach(el => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
      const num = el.dataset.num, e = { ..._entradas.get(num) };
      e[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
      _entradas.set(num, e);
      pintarMedido(num);
    }));
    for (const num of _entradas.keys()) pintarMedido(num);
    $('invCancelarRec').addEventListener('click', () => { _midiendo = false; _entradas = new Map(); onCambio(); });
    $('invGuardarRec').addEventListener('click', () => {
      const quien = usuarioActual() || pedirUsuario(true);
      if (!quien) return;
      // Solo las filas que el usuario toco: velo/obs/estado precargados no son una medicion nueva.
      const filasRec = [..._entradas.entries()].map(([num, e]) => medirFila(porNum.get(num), e));
      const hoy = hoyLocalISO();
      const rec = nuevaRecorrida({ id: `rec-${hoy}-${Date.now().toString(36)}`, fecha: hoy, por: quien, filas: filasRec });
      if (!rec.filas.length){ avisoBreve('No cargaste ninguna medición.'); return; }
      (datos.recorridas = datos.recorridas || []).push(rec);
      markDirty();
      _midiendo = false; _entradas = new Map();
      onCambio();
    });
    return;
  }

  $('invNuevaRec').addEventListener('click', () => { _midiendo = true; _entradas = new Map(); onCambio(); });
  $('invImprimir').addEventListener('click', () => {
    imprimirSoloPapel(() => { $('otMovHoja').innerHTML = hojaRecorridaHTML(inv.filas, hoyLocalISO()); });
  });
  cont.querySelectorAll('[data-dif]').forEach(c => c.addEventListener('change', () => {
    if (c.checked) _destildados.delete(c.dataset.dif); else _destildados.add(c.dataset.dif);
  }));
  const btnAplicar = $('invAplicar');
  if (btnAplicar) btnAplicar.addEventListener('click', () => {
    const items = difs.map(f => ({ recorrida_id: f.ultima.recorrida_id, vasija: f.num }))
      .filter(it => !_destildados.has(`${it.recorrida_id}|${it.vasija}`)
        && cont.querySelector(`[data-dif="${CSS.escape(`${it.recorrida_id}|${it.vasija}`)}"]:not(:disabled)`));
    if (!items.length){ avisoBreve('No hay diferencias tildadas.'); return; }
    const quien = usuarioActual() || pedirUsuario(true);
    if (!quien) return;
    if (!confirm(`¿Corregir los litros de ${items.length} lote${items.length === 1 ? '' : 's'} con lo medido?`)) return;
    const r = aplicarDiferencias(datos, items, quien, hoyLocalISO());
    if (r.aplicados.length) markDirty();
    if (r.salteados.length) avisoBreve('No se aplicó: ' + r.salteados.map(s => `${s.vasija} (${SALTEO_TXT[s.motivo]})`).join(', '));
    onCambio();
  });
}
```

Antes de dar el paso por cerrado, confirmar que `fmtFecha` exista en `fechas.js` (lo importa `vista-movimientos.js`) y que `avisoBreve(texto, tipo)` exista en `nucleo.js:89`. Si `fmtFecha` tiene otra firma, usarla tal cual.

- [ ] **Step 3: Estilos en `public/lotes/index.html`**

Junto a las reglas `.mov-sub` (~1268-1276), usando las variables de color del archivo (`--muted`, etc.):

```css
    .inv-nota{margin:4px 0 10px;color:var(--muted);font-size:13px}
    .inv-tabla td.n{text-align:right;font-variant-numeric:tabular-nums}
    .inv-tabla .inv-num{font-weight:600}
    .inv-tabla tr.inv-vacia td{color:var(--muted)}
    .inv-tabla tr.inv-con-aviso{background:rgba(234,179,8,.12)}
    .inv-estado{display:inline-block;padding:1px 6px;border-radius:8px;font-size:12px;border:1px solid currentColor}
    .inv-estado.inv-manual{font-weight:600}
    .inv-estado.inv-ot{color:#2563eb}
    .inv-estado.inv-medicion{color:#b45309}
    .inv-aviso{margin-left:4px;cursor:help}
    .inv-dif{white-space:nowrap;font-size:12px}
    .inv-in{width:64px}.inv-obs{width:140px}
    .inv-quien{color:var(--muted);font-size:11px}
    .inv-sub{margin:16px 0 6px}
    .inv-hoja .inv-h-titulo{font-weight:700;margin-bottom:8px}
    .inv-hoja .inv-h-cols{display:flex;gap:12px}
    .inv-hoja .inv-h-tabla{border-collapse:collapse;flex:1;font-size:11px}
    .inv-hoja .inv-h-tabla th,.inv-hoja .inv-h-tabla td{border:1px solid #000;padding:2px 4px;height:18px}
    .inv-hoja .inv-h-firma{margin-top:14px}
```

Si el archivo define los colores como tokens (`--warn`, `--accent`), usar esos tokens en lugar de los hex.

- [ ] **Step 4: Correr toda la suite (que nada se haya roto)**

Run: `npm test`
Expected: PASS, mismo total que antes más los tests nuevos.

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/vista-inventario-tanques.js public/lotes/js/vista-movimientos.js public/lotes/index.html
git commit -m "feat(lotes): sub-pestaña Inventario de tanques en Movimientos (tabla, recorrida, aplicar, imprimir)"
```

---

### Task 7: Verificación en el navegador y cierre

**Files:**
- Create (scratchpad, no va al repo): `mock-inv-tanques.mjs`
- Modify (repo de Escritorio\claude, no catenainstitute): `.claude/launch.json`

- [ ] **Step 1: Servidor de prueba sin login**

Copiar el patrón de `mock-ot-correcciones.mjs` (scratchpad de la sesión 9a0781e9): un `http` de node que sirve `public/` del worktree y un documento de Lotes en memoria. Cambios:
- `RAIZ = 'C:/Users/Bmax/repos/catenainstitute-inv-tanques/public'`, puerto **8815**.
- El documento trae:
  - `vasijas` = `PADRON_INICIAL` (importado de `vasijas-padron.js`).
  - Lotes: `25313` (T 201, 7500), `26140` ("H 170 + Barricas", vasija_grande 2400, cap225 4), `25314` y `25315` (los dos en T 199), `26318` (T 999 con vasija_grande 4000, para "sin vasija conocida") y `26067` (T 177, etapa `fa`).
  - Una OT pendiente armada con `armarOT`, con `destino: 'T 202'` y lote `25313` con `vasijas_manual: 'T 201'`.
  - `recorridas: []`.

Agregar a `Escritorio\claude\.claude\launch.json` la entrada `lotes-inv-tanques` con `node <ruta del mock>` y `port: 8815`, y commitearla en ese repo con el mismo estilo que `9d34822` ("chore: launch.json con el servidor de prueba …").

- [ ] **Step 2: Verificar**

`preview_start {name:'lotes-inv-tanques'}`, abrir `/lotes/`, ir a Movimientos → 🏺 Inventario de tanques y comprobar:
1. 78 filas. T 201 con 25313 y estado TRASIEGO (OT …). T 202 con TRASIEGO también. T 199 con ⚠ dos lotes. 26318 en "Lotes sin vasija conocida". T 177 FERMENTANDO.
2. Nueva recorrida → T 170: cm `5` muestra los litros medidos. Velo en T 199, estado manual "NO SO2" en T 177. Guardar.
3. T 170 queda en amarillo con "web 2400 → medido …" y su estado pasa a MERMO. T 177 queda NO SO2 (manual).
4. Aplicar diferencias → confirmar → la fila deja de estar amarilla. En la pestaña Lotes, `26140` tiene los litros nuevos.
5. Ctrl+Z vuelve los litros y la diferencia reaparece.
6. Filtro "Con aviso" + F5: el filtro se conserva.
7. 🖨 Hoja de recorrida: en la vista previa, 2 hojas A4 con lote precargado. Cerrar el diálogo de impresión con Escape.
8. `read_console_messages` sin errores.

Si algo falla: superpowers:systematic-debugging, arreglar en la tarea que corresponda y volver a commitear.

- [ ] **Step 3: Captura para el usuario**

Captura de pantalla de la sub-pestaña con avisos y de la vista previa de la hoja.

- [ ] **Step 4: Cierre de rama**

Usar superpowers:finishing-a-development-branch. Mergear a `main` solo con el OK del usuario, desde `repos\catenainstitute` con `main` limpio (regla del usuario: todo en main; publicar solo desde ahí). Después del push, recordar al usuario:
- El deploy es manual: `cd /d C:\Users\Bmax\repos\catenainstitute` y `npx.cmd wrangler deploy`, desde main limpio.
- No hay migración de datos: `recorridas` nace vacía.
