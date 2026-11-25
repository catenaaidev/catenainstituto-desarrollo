# Corrección de SO₂ barril por barril — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la Orden de corrección de SO₂ calcule una dosis independiente para cada vasija (barril, T50, T200) cuando el lote se analizó vasija por vasija, con alerta en pantalla y rótulo en el papel.

**Architecture:** Un módulo puro nuevo del servidor (`so2-por-vasija.ts`) cruza los análisis con número de vasija contra las vasijas llenas del Mapa y decide, por vasija, qué SO₂/pH vale. `armarOrden` lo usa para armar `FilaBarrica` con SO₂/objetivo/dosis propios y marca el lote `por_vasija`. En el cliente, `_ocBuildRows` recalcula la dosis por vasija (no por lote), la Planilla muestra el cartel y fija el modo Por barril, y el papel lleva el rótulo. Entrega 2: la orden guardada y la ejecución conservan el detalle por vasija.

**Tech Stack:** Cloudflare Workers (TypeScript) + JS de navegador sin framework; tests con vitest + `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-11-13-so2-por-barril-design.md`

## Global Constraints

- Todo el texto visible en castellano rioplatense, sin tildes faltantes en lo que ve el usuario ("vasija", "análisis", "Barril por barril").
- Un lote SIN análisis por vasija más nuevo o del mismo día que el del lote se calcula **exactamente como hoy** (los tests existentes de `armarOrden` no deben cambiar).
- Cruce: número completo primero; últimos 3 dígitos SOLO si el texto tiene ≤ 3 dígitos; "t50"/"t200" sin número por capacidad.
- Vasija sin análisis propio en un lote por vasija → **sin dosis** (`null`) y aviso; nunca se adivina.
- Mismo día: gana el análisis de la vasija.
- Objetivo pisado a mano en el lote manda para todas sus vasijas.
- Papel = guardado = ejecutado: las tres cosas salen de `_ocBuildRowsLocal()`; no se agrega otro camino de cálculo en el cliente.
- Trabajar en el worktree `C:\Users\Bmax\repos\ci-so2-por-barril`, rama `feat/so2-por-barril`. No pushear a main: lo mergea el usuario.
- Tests: `npx vitest run <archivo>` desde el worktree. Antes de la Task 1, si no existe `node_modules`, crear junction: `cmd //c mklink /J node_modules ..\\catenainstitute\\node_modules` y copiar `worker-configuration.d.ts` del repo principal si falta.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lotes/motores/so2-por-vasija.ts` (nuevo) | Puro: `asignarVasija`, `medicionesPorVasija` |
| `src/lotes/motores/correccion.ts` | `armarOrden` usa lo anterior; campos nuevos en `FilaBarrica`/`LoteOrden`; sin ±5 en lotes por vasija |
| `public/lotes/js/vista-orden-correccion.js` | `_ocBuildRows`: dosis por vasija; `_ocAvisosDe`: cartel |
| `public/lotes/js/orden-correccion-guardada.js` | `modoPorDefecto` fija 'barril'; guardada conserva SO₂/objetivo por vasija; ejecución con detalle |
| `public/lotes/js/orden-correccion-planilla.js` | SO₂/objetivo/diferencia por vasija; select de modo bloqueado |
| `public/lotes/js/orden-correccion-papel.js` | Rótulo "BARRIL POR BARRIL" en el primer renglón del lote |
| `test/lotes-so2-por-vasija.test.ts` (nuevo) | Motor puro |
| `test/lotes-orden-correccion-por-vasija.test.ts` (nuevo) | `armarOrden` integrado |
| `test/lotes-orden-correccion-por-vasija.test.mjs` (nuevo) | Cliente: `_ocBuildRows`, planilla, papel, guardada |

---

## ENTREGA 1 — motor + alerta

### Task 1: Cruce de un texto de vasija con las vasijas del lote

**Files:**
- Create: `src/lotes/motores/so2-por-vasija.ts`
- Test: `test/lotes-so2-por-vasija.test.ts`

**Interfaces:**
- Consumes: `Unidad` de `./mapa` (`{num: string, cap: unknown, litros: unknown, estado: string}`).
- Produces:
  ```ts
  export type Asignacion =
    | { tipo: 'lote' }                         // no es de vasija: cuenta como análisis del lote
    | { tipo: 'vasija'; num: string }          // num = Unidad.num tal cual
    | { tipo: 'ambiguo'; texto: string; nums: string[] }
    | { tipo: 'sin_match'; texto: string };
  export function asignarVasija(texto: unknown, unidades: Unidad[]): Asignacion;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { asignarVasija } from '../src/lotes/motores/so2-por-vasija';

const u = (num: string, cap = 225) => ({ num, cap, litros: cap, estado: 'LLENO' });
const LOTE = [u('1100923'), u('1100305'), u('1100527'), u('1100051'), u('50042', 50), u('1140446', 200)];

describe('asignarVasija', () => {
  it('sin texto o sin dígitos (nombre de tanque) es análisis del lote', () => {
    expect(asignarVasija('', LOTE)).toEqual({ tipo: 'lote' });
    expect(asignarVasija(null, LOTE)).toEqual({ tipo: 'lote' });
    expect(asignarVasija('Barricas', LOTE)).toEqual({ tipo: 'lote' });
  });
  it('número completo gana (T50 se carga con el número completo)', () => {
    expect(asignarVasija('50042', LOTE)).toEqual({ tipo: 'vasija', num: '50042' });
    expect(asignarVasija('1100923', LOTE)).toEqual({ tipo: 'vasija', num: '1100923' });
  });
  it('hasta 3 dígitos: por los últimos 3 del barril (con ceros a la izquierda)', () => {
    expect(asignarVasija('923', LOTE)).toEqual({ tipo: 'vasija', num: '1100923' });
    expect(asignarVasija('51', LOTE)).toEqual({ tipo: 'vasija', num: '1100051' });
    expect(asignarVasija(' 446 ', LOTE)).toEqual({ tipo: 'vasija', num: '1140446' });
    expect(asignarVasija('B923', LOTE)).toEqual({ tipo: 'vasija', num: '1100923' });
  });
  it('más de 3 dígitos sin número completo igual NO cae a los últimos 3', () => {
    expect(asignarVasija('50923', LOTE)).toEqual({ tipo: 'sin_match', texto: '50923' });
  });
  it('dos vasijas que terminan igual: ambiguo', () => {
    const r = asignarVasija('042', [...LOTE, u('1200042')]);
    expect(r).toEqual({ tipo: 'ambiguo', texto: '042', nums: ['50042', '1200042'] });
  });
  it('número que no está en el lote: sin_match', () => {
    expect(asignarVasija('777', LOTE)).toEqual({ tipo: 'sin_match', texto: '777' });
  });
  it('t50 / t200 sin número: la única de esa capacidad, si no ambiguo', () => {
    expect(asignarVasija('t50', LOTE)).toEqual({ tipo: 'vasija', num: '50042' });
    expect(asignarVasija('T200', LOTE)).toEqual({ tipo: 'vasija', num: '1140446' });
    const dos = asignarVasija('t50', [...LOTE, u('50043', 50)]);
    expect(dos.tipo).toBe('ambiguo');
    expect(asignarVasija('t50', [u('1100923')])).toEqual({ tipo: 'sin_match', texto: 't50' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lotes-so2-por-vasija.test.ts`
Expected: FAIL — no se puede importar `../src/lotes/motores/so2-por-vasija`.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * SO2 por vasija: cuando un lote sale heterogéneo, la bodega analiza todas sus
 * vasijas una por una y anota la vasija en Cargar análisis (analisis[].vasija).
 * Los barriles se identifican por sus ÚLTIMOS 3 DÍGITOS y los T50 por el número
 * completo (pedido del usuario, 2026-11-13). Módulo puro.
 * Spec: docs/superpowers/specs/2026-11-13-so2-por-barril-design.md
 */
import type { Unidad } from './mapa';

export type Asignacion =
  | { tipo: 'lote' }
  | { tipo: 'vasija'; num: string }
  | { tipo: 'ambiguo'; texto: string; nums: string[] }
  | { tipo: 'sin_match'; texto: string };

const digitos = (x: unknown) => String(x ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
const ult3 = (d: string) => d.padStart(3, '0').slice(-3);

function resultado(texto: string, nums: string[]): Asignacion {
  if (nums.length === 1) return { tipo: 'vasija', num: nums[0] };
  if (nums.length > 1) return { tipo: 'ambiguo', texto, nums };
  return { tipo: 'sin_match', texto };
}

export function asignarVasija(texto: unknown, unidades: Unidad[]): Asignacion {
  const t = String(texto ?? '').trim();
  const tipoT = /^t\s*(50|200)$/i.exec(t);
  if (tipoT) {
    const cap = Number(tipoT[1]);
    return resultado(t, unidades.filter((u) => Number(u.cap) === cap).map((u) => u.num));
  }
  const d = digitos(t);
  if (!d) return { tipo: 'lote' };
  const exactos = unidades.filter((u) => digitos(u.num) === d).map((u) => u.num);
  if (exactos.length) return resultado(t, exactos);
  if (d.length > 3) return { tipo: 'sin_match', texto: t };
  return resultado(t, unidades.filter((u) => ult3(digitos(u.num)) === ult3(d)).map((u) => u.num));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lotes-so2-por-vasija.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lotes/motores/so2-por-vasija.ts test/lotes-so2-por-vasija.test.ts
git commit -m "feat(lotes): cruce de la vasija del análisis con el Mapa (últimos 3 dígitos, T50 completo)"
```

---

### Task 2: Qué SO₂ y pH vale para cada vasija

**Files:**
- Modify: `src/lotes/motores/so2-por-vasija.ts`
- Test: `test/lotes-so2-por-vasija.test.ts`

**Interfaces:**
- Consumes: `asignarVasija` (Task 1); `ordenarPorFecha`, `valorValido`, `type Fila` de `./fml`; `fechaDia` de `./fml-condiciones`.
- Produces:
  ```ts
  export interface MedicionVasija {
    so2: number | null; ph: number | null; fecha: string | null;
    fuente: 'propio' | 'lote' | null; aviso: string | null;
  }
  export interface PorVasija {
    porVasija: boolean;
    vasijas: Map<string, MedicionVasija>;  // clave = Unidad.num; solo si porVasija
    avisos: string[];                      // del lote: ambiguos / sin_match
    analisisLote: Fila[];                  // los que cuentan como "del lote" (para ultimaMedicion)
    fechaPropia: string | null;            // la fecha más nueva de análisis por vasija
  }
  export function medicionesPorVasija(analisis: Fila[], unidades: Unidad[], so2De: (a: Fila) => number | null): PorVasija;
  ```
  `so2De` es `so2LibreConCorreccion` de correccion.ts (se pasa para no duplicarla).

Reglas (spec §2 y §3):
- Clasificar cada análisis con `asignarVasija(a.vasija, unidades)`. `tipo:'lote'` → `analisisLote`. Los demás son "de vasija".
- `fechaLote` = `fecha_analisis` del análisis del lote más nuevo con SO₂ válido (null si no hay).
- `porVasija` = existe un análisis de vasija (cualquier tipo ≠ 'lote') con SO₂ válido y `fechaDia(fecha) >= fechaDia(fechaLote)` (o `fechaLote` null). Fechas null cuentan como las más viejas.
- Si `porVasija`, para cada unidad: propio = el más nuevo asignado a ella con SO₂ válido.
  - propio y (sin lote o fecha propia ≥ fecha lote) → `fuente:'propio'`, so2 = propio, ph = cadena.
  - lote más nuevo que el propio → `fuente:'lote'`, so2/ph del último del lote.
  - sin propio → `so2:null, ph:null, fuente:null, aviso:'sin análisis propio: medir o escribir la dosis a mano'`.
- Cadena de pH de la vasija: pH del propio → pH del análisis anterior más nuevo de ESA vasija → pH más nuevo de `analisisLote` → null (el llamador usa el objetivo del lote).
- `avisos`: por cada análisis ambiguo `"la vasija «042» coincide con 50042 y 1200042: escribí la dosis a mano"`; por cada sin_match `"la vasija «777» no está llena en este lote"` (sin repetir textos). Solo se arman si `porVasija`.

- [ ] **Step 1: Write the failing test** (agregar al archivo de la Task 1)

```ts
import { medicionesPorVasija } from '../src/lotes/motores/so2-por-vasija';
import { valorValido } from '../src/lotes/motores/fml';

const so2De = (a: any) => valorValido(a.so2_libre);
const B = [u('1100923'), u('1100305'), u('1100527'), u('1100051')];
const an = (fecha: string, so2: number, vasija?: string, ph?: number) =>
  ({ lote: '26056', fecha_analisis: fecha, so2_libre: so2, ...(vasija ? { vasija } : {}), ...(ph ? { ph } : {}) });

describe('medicionesPorVasija', () => {
  it('sin análisis por vasija: no es por vasija', () => {
    const r = medicionesPorVasija([an('2026-10-01', 20, undefined, 3.6)], B, so2De);
    expect(r.porVasija).toBe(false);
    expect(r.analisisLote).toHaveLength(1);
  });
  it('caso 26056: cada barril su SO2', () => {
    const r = medicionesPorVasija([
      an('2026-10-01', 20, undefined, 3.6),
      an('2026-10-09', 6, '923', 3.7), an('2026-10-09', 41, '305', 3.5),
      an('2026-10-09', 23, '527', 3.6), an('2026-10-09', 8, '51'),
    ], B, so2De);
    expect(r.porVasija).toBe(true);
    expect(r.vasijas.get('1100923')).toMatchObject({ so2: 6, ph: 3.7, fuente: 'propio', fecha: '2026-10-09' });
    expect(r.vasijas.get('1100305')!.so2).toBe(41);
    // sin pH propio ni anterior de la vasija: el último pH del lote
    expect(r.vasijas.get('1100051')).toMatchObject({ so2: 8, ph: 3.6, fuente: 'propio' });
    expect(r.fechaPropia).toBe('2026-10-09');
  });
  it('mismo día gana la vasija', () => {
    const r = medicionesPorVasija([an('2026-10-09', 20), an('2026-10-09', 6, '923')], B, so2De);
    expect(r.porVasija).toBe(true);
    expect(r.vasijas.get('1100923')!.fuente).toBe('propio');
  });
  it('análisis del lote más nuevo: vuelve a lo normal', () => {
    const r = medicionesPorVasija([an('2026-10-09', 6, '923'), an('2026-10-15', 30)], B, so2De);
    expect(r.porVasija).toBe(false);
  });
  it('vasija sin análisis propio: sin SO2 y con aviso', () => {
    const r = medicionesPorVasija([an('2026-10-09', 6, '923')], B, so2De);
    expect(r.vasijas.get('1100305')).toMatchObject({ so2: null, fuente: null });
    expect(r.vasijas.get('1100305')!.aviso).toMatch(/sin análisis propio/);
  });
  it('pH: el anterior de la misma vasija antes que el del lote', () => {
    const r = medicionesPorVasija([
      an('2026-09-01', 30, undefined, 3.4),
      an('2026-10-01', 10, '923', 3.8),
      an('2026-10-09', 6, '923'),
    ], B, so2De);
    expect(r.vasijas.get('1100923')).toMatchObject({ so2: 6, ph: 3.8 });
  });
  it('ambiguo y sin_match van a avisos del lote', () => {
    const r = medicionesPorVasija([an('2026-10-09', 6, '923'), an('2026-10-09', 9, '777')], B, so2De);
    expect(r.avisos).toEqual(['la vasija «777» no está llena en este lote']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lotes-so2-por-vasija.test.ts`
Expected: FAIL — `medicionesPorVasija` no existe.

- [ ] **Step 3: Write minimal implementation** (agregar a `so2-por-vasija.ts`)

```ts
import { ordenarPorFecha, valorValido, type Fila } from './fml';
import { fechaDia } from './fml-condiciones';

export interface MedicionVasija {
  so2: number | null; ph: number | null; fecha: string | null;
  fuente: 'propio' | 'lote' | null; aviso: string | null;
}
export interface PorVasija {
  porVasija: boolean;
  vasijas: Map<string, MedicionVasija>;
  avisos: string[];
  analisisLote: Fila[];
  fechaPropia: string | null;
}

const dia = (a: Fila) => fechaDia(a.fecha_analisis) ?? -Infinity;
const fechaTxt = (a: Fila | null) => (a && a.fecha_analisis != null ? String(a.fecha_analisis) : null);

export function medicionesPorVasija(
  analisis: Fila[], unidades: Unidad[], so2De: (a: Fila) => number | null,
): PorVasija {
  // Del más nuevo al más viejo; a igual día, el último cargado primero.
  const orden = ordenarPorFecha(analisis).reverse().sort((a, b) => dia(b) - dia(a));
  const analisisLote: Fila[] = [];
  const deVasija: { a: Fila; asig: Asignacion }[] = [];
  for (const a of orden) {
    const asig = asignarVasija(a.vasija, unidades);
    if (asig.tipo === 'lote') analisisLote.push(a);
    else deVasija.push({ a, asig });
  }
  const loteSo2 = analisisLote.find((a) => so2De(a) !== null) ?? null;
  const diaLote = loteSo2 ? dia(loteSo2) : -Infinity;
  const conSo2 = deVasija.filter((x) => so2De(x.a) !== null);
  const porVasija = conSo2.some((x) => !loteSo2 || dia(x.a) >= diaLote);
  const vacio: PorVasija = { porVasija: false, vasijas: new Map(), avisos: [], analisisLote: ordenarPorFecha(analisisLote), fechaPropia: null };
  if (!porVasija) return vacio;

  const phLote = analisisLote.map((a) => valorValido(a.ph)).find((v) => v !== null) ?? null;
  const vasijas = new Map<string, MedicionVasija>();
  for (const u of unidades) {
    const suyos = deVasija.filter((x) => x.asig.tipo === 'vasija' && x.asig.num === u.num).map((x) => x.a);
    const propio = suyos.find((a) => so2De(a) !== null) ?? null;
    if (propio && (!loteSo2 || dia(propio) >= diaLote)) {
      const ph = valorValido(propio.ph)
        ?? suyos.filter((a) => a !== propio && dia(a) <= dia(propio)).map((a) => valorValido(a.ph)).find((v) => v !== null)
        ?? phLote;
      vasijas.set(u.num, { so2: so2De(propio), ph, fecha: fechaTxt(propio), fuente: 'propio', aviso: null });
    } else if (loteSo2 && propio) {
      // Tiene análisis propio pero el del lote es más nuevo.
      vasijas.set(u.num, { so2: so2De(loteSo2), ph: valorValido(loteSo2.ph) ?? phLote, fecha: fechaTxt(loteSo2), fuente: 'lote', aviso: null });
    } else {
      vasijas.set(u.num, { so2: null, ph: null, fecha: null, fuente: null, aviso: 'sin análisis propio: medir o escribir la dosis a mano' });
    }
  }
  const avisos: string[] = [];
  const vistos = new Set<string>();
  for (const { asig } of deVasija) {
    if (asig.tipo === 'vasija' || vistos.has(asig.texto)) continue;
    vistos.add(asig.texto);
    avisos.push(asig.tipo === 'ambiguo'
      ? `la vasija «${asig.texto}» coincide con ${asig.nums.join(' y ')}: escribí la dosis a mano`
      : `la vasija «${asig.texto}» no está llena en este lote`);
  }
  const fechaPropia = fechaTxt(conSo2[0]?.a ?? null);
  return { porVasija: true, vasijas, avisos, analisisLote: ordenarPorFecha(analisisLote), fechaPropia };
}
```

Este test (agregarlo al Step 1) cubre el caso "analizaron 4 de 5" con un análisis viejo del lote: la quinta NO usa ese número viejo.

```ts
  it('analizaron 4 de 5: la quinta queda sin dosis aunque haya un análisis viejo del lote', () => {
    const r = medicionesPorVasija([an('2026-09-01', 30, undefined, 3.4), an('2026-10-09', 6, '923')], B, so2De);
    expect(r.vasijas.get('1100305')).toMatchObject({ so2: null, fuente: null });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lotes-so2-por-vasija.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lotes/motores/so2-por-vasija.ts test/lotes-so2-por-vasija.test.ts
git commit -m "feat(lotes): SO2 y pH de cada vasija (gana lo más nuevo, sin propio = sin dosis)"
```

---

### Task 3: `armarOrden` dosifica por vasija

**Files:**
- Modify: `src/lotes/motores/correccion.ts` (`FilaBarrica` ~l.83, `filaBarrica` ~l.94, `LoteOrden` ~l.200, loop de `armarOrden` ~l.283-405)
- Test: `test/lotes-orden-correccion-por-vasija.test.ts`

**Interfaces:**
- Consumes: `medicionesPorVasija`, `PorVasija` (Task 2).
- Produces (los consume el cliente):
  - `FilaBarrica` + `so2_libre?: number | null; ph?: number | null; objetivo?: number | null; fecha_analisis?: string | null; fuente?: 'propio' | 'lote' | null; aviso?: string | null`
  - `LoteOrden` + `por_vasija?: true; avisos_vasija?: string[]; so2_min?: number; so2_max?: number; fecha_por_vasija?: string | null`
  - En lote por vasija: `so2_libre`, `ph`, `objetivo_libre`, `diferencia` del lote = los de la **peor** vasija (mayor `objetivo − so2`).

Cambios:
1. Antes de `ultimaMedicion`, calcular `const pv = medicionesPorVasija(analisisPorL.get(L) ?? [], unidades, so2LibreConCorreccion);`.
2. Si `!pv.porVasija` → el código de hoy, sin cambios.
3. Si `pv.porVasija`:
   - `[so2Lote, phLote] = ultimaMedicion(pv.analisisLote)`; `objLote = objetivoSo2Libre(phLote, eff)`.
   - Para cada unidad: `m = pv.vasijas.get(u.num)`; `obj = m.ph !== null ? objetivoSo2Libre(m.ph, eff) : objLote`; si `m.so2 === null || obj === null` → fila con `mbk_g:null, ml_solucion:null, aviso: m.aviso ?? 'sin objetivo (sin pH)'`; si no → `filaBarrica(u, Math.max(0, obj - m.so2))` + `so2_libre, ph, objetivo, fecha_analisis, fuente`.
   - Peor = vasija calculable con mayor `obj - so2`. Si no hay ninguna calculable y tampoco `so2Lote` → `noCalculables` con motivo `'sin SO2 valido'`.
   - Tanque grande / sin barrica: como hoy, con `so2Lote`/`objLote` (si son null, `mbk_g:null` y aviso).
   - `so2 >= objetivo` del lote (peor vasija en objetivo ⇒ todas) → `activables` `en_objetivo`.
   - Supresión: igual, pero la rama de ±5 ppm se salta (`if (!pv.porVasija && C.so2_prev !== null && ...)`).
   - `mbk_total_g`/`ml_total`: sumar ignorando null.
4. Extraer el armado actual a una función interna para no duplicar el objeto `LoteOrden` (el `armar` ya existe: pasarle `{so2, ph, objetivo, barricas, extra}`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { normalizarMapa } from '../src/lotes/motores/mapa';
import { armarOrden } from '../src/lotes/motores/correccion';

const d = (iso: string) => Date.parse(iso + 'T00:00:00Z');
const HOY = d('2026-10-20');
const mapaCon = (inventario: unknown) => normalizarMapa({ version: 1, estado: { inventario } });
const lote = { lote: '26056', variedad: 'Malbec', litros_actuales: 900, etapa: 'crianza' };
const barril = (num: string) => ({ num, lote: '26056', cap: 225, litros: 225, estado: 'LLENO' });
const MAPA = mapaCon(['1100923', '1100305', '1100527', '1100051'].map(barril));
const an = (fecha: string, so2: number, vasija?: string, ph = 3.6) =>
  ({ lote: '26056', fecha_analisis: fecha, so2_libre: so2, ph, ...(vasija ? { vasija } : {}) });

describe('armarOrden barril por barril', () => {
  it('26056: cada barril con su SO2 y su dosis; el lote toma la peor', () => {
    const o = armarOrden({ lotes: [lote], analisis: [
      an('2026-10-01', 20), an('2026-10-09', 6, '923'), an('2026-10-09', 41, '305'),
      an('2026-10-09', 23, '527'), an('2026-10-09', 8, '51'),
    ] }, MAPA, HOY);
    expect(o.lotes).toHaveLength(1);
    const l = o.lotes[0];
    expect(l.por_vasija).toBe(true);
    expect(l.so2_libre).toBe(6);
    expect(l.so2_min).toBe(6);
    expect(l.so2_max).toBe(41);
    const por = Object.fromEntries(l.barricas.map((b) => [b.num, b]));
    expect(por['1100923'].so2_libre).toBe(6);
    expect(por['1100305'].so2_libre).toBe(41);
    expect(por['1100923'].mbk_g!).toBeGreaterThan(por['1100527'].mbk_g!);
    // dosis distinta por barril
    expect(new Set(l.barricas.map((b) => b.mbk_g)).size).toBeGreaterThan(1);
  });
  it('análisis del lote más nuevo: como hoy, misma dosis para todos', () => {
    const o = armarOrden({ lotes: [lote], analisis: [an('2026-10-09', 6, '923'), an('2026-10-15', 20)] }, MAPA, HOY);
    const l = o.lotes[0];
    expect(l.por_vasija).toBeUndefined();
    expect(new Set(l.barricas.map((b) => b.mbk_g)).size).toBe(1);
  });
  it('barril sin análisis propio: sin dosis y con aviso', () => {
    const o = armarOrden({ lotes: [lote], analisis: [an('2026-10-09', 6, '923')] }, MAPA, HOY);
    const b = o.lotes[0].barricas.find((x) => x.num === '1100305')!;
    expect(b.mbk_g).toBeNull();
    expect(b.aviso).toMatch(/sin análisis propio/);
  });
  it('todas en objetivo: activable en_objetivo', () => {
    const o = armarOrden({ lotes: [lote], analisis: ['923', '305', '527', '51'].map((v) => an('2026-10-09', 60, v)) }, MAPA, HOY);
    expect(o.lotes).toHaveLength(0);
    expect(o.activables[0]).toMatchObject({ lote: '26056', fuera: 'en_objetivo', por_vasija: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lotes-orden-correccion-por-vasija.test.ts`
Expected: FAIL — `por_vasija` undefined / misma dosis.

- [ ] **Step 3: Implementar** los cambios 1–4 de arriba en `correccion.ts`. Importar `medicionesPorVasija` de `./so2-por-vasija`. Mantener el comentario de cabecera de `ultimaMedicion` y agregar uno corto sobre el modo por vasija apuntando a la spec.

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/lotes-orden-correccion-por-vasija.test.ts test/lotes-orden-correccion-activables.test.ts test/lotes-motores-auditoria.test.ts test/lotes-correcciones-base.test.ts test/lotes-so2-por-vasija.test.ts`
Expected: PASS todos (los viejos sin tocar).

- [ ] **Step 5: Typecheck y commit**

Run: `npx tsc --noEmit` → sin errores.

```bash
git add src/lotes/motores/correccion.ts test/lotes-orden-correccion-por-vasija.test.ts
git commit -m "feat(lotes): la orden de corrección dosifica cada vasija con su SO2 cuando se analizó barril por barril"
```

---

### Task 4: Cliente — dosis por vasija y modo fijo Por barril

**Files:**
- Modify: `public/lotes/js/vista-orden-correccion.js:297-332` (`_ocBuildRows`)
- Modify: `public/lotes/js/orden-correccion-guardada.js:20-27` (`modoPorDefecto`)
- Modify: `public/lotes/js/vista-orden-correccion.js:182` (`_ocModoDe`) y `:845-847` (cambio de select)
- Test: `test/lotes-orden-correccion-por-vasija.test.mjs`

**Interfaces:**
- Consumes: `LoteOrden.por_vasija`, `FilaBarrica.so2_libre/objetivo` (Task 3).
- Produces: `modoPorDefecto(barricas, porVasija)` → `'barril'` si `porVasija`. `_ocModoDe(l)` devuelve `'barril'` siempre que `l.por_vasija` (ignora `_ocModos`).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { _ocBuildRows } from '../public/lotes/js/vista-orden-correccion.js';
import { modoPorDefecto } from '../public/lotes/js/orden-correccion-guardada.js';

const b = (num, so2, objetivo) => ({ num, cap: 225, litros_usados: 225, so2_libre: so2, objetivo });
const lotePV = { lote: '26056', variedad: 'Malbec', so2_libre: 6, objetivo_libre: 35, por_vasija: true,
  barricas: [b('1100923', 6, 35), b('1100305', 41, 35), b('1100051', null, null)] };

describe('_ocBuildRows por vasija', () => {
  it('cada vasija con su dosis; en objetivo da 0; sin análisis da null', () => {
    const filas = _ocBuildRows({ lotes: [lotePV] }, new Set(), new Map(), [], {});
    const vs = filas.filter(f => f.tipo === 'barrica');
    expect(vs[0].dosis.ml_solucion).toBeCloseTo((29 * 225 * 1.5) / 55, 5);
    expect(vs[1].dosis.ml_solucion).toBe(0);
    expect(vs[2].dosis.ml_solucion).toBeNull();
    expect(filas[0].ml_total).toBeCloseTo(vs[0].dosis.ml_solucion, 5);
  });
  it('objetivo pisado del lote manda para todas', () => {
    const filas = _ocBuildRows({ lotes: [lotePV] }, new Set(), new Map([['26056', 45]]), [], {});
    const vs = filas.filter(f => f.tipo === 'barrica');
    expect(vs[1].dosis.ml_solucion).toBeCloseTo((4 * 225 * 1.5) / 55, 5);
  });
});

describe('modoPorDefecto', () => {
  it('lote por vasija: siempre por barril', () => {
    expect(modoPorDefecto([{ num: '1', cap: 225, litros_usados: 225 }], true)).toBe('barril');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/lotes-orden-correccion-por-vasija.test.mjs` → FAIL.

- [ ] **Step 3: Implement**

En `_ocBuildRows`, reemplazar el `l.barricas.map(...)`:

```js
    const dosisBarricas = l.barricas.map(b => {
      let d;
      if (l.por_vasija){
        /* Barril por barril: cada vasija con su SO2 y su objetivo (el pisado
         * del lote manda para todas). Sin SO2 propio: dosis vacia, a mano. */
        const objB = (pisado != null && Number.isFinite(pisado)) ? pisado : b.objetivo;
        d = (b.so2_libre == null || objB == null)
          ? { mbk_g: null, ml_solucion: null }
          : _dosis(diferenciaDosificable(objB, b.so2_libre), b.litros_usados);
      } else d = _dosis(difDosis, b.litros_usados);
      if (d.mbk_g != null) mbk_total += d.mbk_g;
      if (d.ml_solucion != null) ml_total += d.ml_solucion;
      return { barrica: b, dosis: d };
    });
```

En `modoPorDefecto(barricas, porVasija)`: primera línea `if (porVasija) return 'barril';`.
`_ocModoDe`: `const _ocModoDe = l => l.por_vasija ? 'barril' : (_ocModos.get(l.lote) || modoPorDefecto(l.barricas));`
En `armarOrdenGuardada` (guardada.js) el `modoPorDefecto(...)` del final recibe `l.por_vasija` (se agrega en Task 7; por ahora pasar `false`).

- [ ] **Step 4: Run** el archivo nuevo + `test/lotes-orden-correccion-guardada.test.mjs test/lotes-orden-correccion-manual.test.mjs test/lotes-orden-correccion-orden.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/vista-orden-correccion.js public/lotes/js/orden-correccion-guardada.js test/lotes-orden-correccion-por-vasija.test.mjs
git commit -m "feat(lotes): la hoja calcula la dosis de cada vasija en lotes barril por barril"
```

---

### Task 5: Planilla — cartel, SO₂ por vasija y modo bloqueado

**Files:**
- Modify: `public/lotes/js/orden-correccion-planilla.js:186-235` (`pintarPlanilla`)
- Modify: `public/lotes/js/vista-orden-correccion.js:630-636` (`_ocAvisosDe`)
- Test: `test/lotes-orden-correccion-por-vasija.test.mjs`

**Interfaces:**
- Consumes: `l.por_vasija`, `l.so2_min/so2_max/fecha_por_vasija/avisos_vasija`, `b.so2_libre/objetivo/aviso`.
- Produces: `cartelPorVasija(l)` exportada desde `orden-correccion-planilla.js` → string o `''`.

- [ ] **Step 1: Write the failing test** (agregar)

```js
import { pintarPlanilla, cartelPorVasija } from '../public/lotes/js/orden-correccion-planilla.js';
const U = { col: 'mL SOL.', suf: 'mL', dec: 1, de: d => d.ml_solucion };

describe('Planilla barril por barril', () => {
  const l = { ...lotePV, ph: 3.6, so2_min: 6, so2_max: 41, fecha_por_vasija: '2026-10-09' };
  it('cartel con cantidad, fecha y rango', () => {
    expect(cartelPorVasija(l)).toBe('⚠ Barril por barril: 2 vasijas con análisis del 09/10 · SO₂ entre 6 y 41 ppm · cada una lleva su dosis');
    expect(cartelPorVasija({ ...l, por_vasija: undefined })).toBe('');
  });
  it('fila de vasija con su SO2 y su objetivo; select bloqueado', () => {
    const filas = _ocBuildRows({ lotes: [l] }, new Set(), new Map(), [], {});
    const html = pintarPlanilla({ filas, u: U, modoDe: () => 'barril', avisosDe: () => [cartelPorVasija(l)] });
    expect(html).toContain('<td class="n">41.0</td>');
    expect(html).toMatch(/data-oc-modo="26056"[^>]*disabled/);
    expect(html).toContain('Barril por barril');
    expect(html).toContain('sin análisis propio');
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`cartelPorVasija(l)` (fecha dd/mm desde `fecha_por_vasija`; cantidad = vasijas con SO₂ (`b.so2_libre != null`)):

```js
export function cartelPorVasija(l){
  if (!l || !l.por_vasija) return '';
  const n = (l.barricas || []).filter(b => b.so2_libre != null).length;
  const f = String(l.fecha_por_vasija || '').split('-');
  const fecha = f.length === 3 ? ' del ' + f[2] + '/' + f[1] : '';
  return '⚠ Barril por barril: ' + n + (n === 1 ? ' vasija' : ' vasijas') + ' con análisis' + fecha +
    ' · SO₂ entre ' + fmt(l.so2_min, 0) + ' y ' + fmt(l.so2_max, 0) + ' ppm · cada una lleva su dosis';
}
```

En `pintarPlanilla`: el `<select ... data-oc-modo>` lleva `disabled title="Este lote se analizó barril por barril: cada vasija lleva su dosis, no se puede imprimir genérico."` cuando `l.por_vasija`. En la fila de vasija: SO₂ = `v.b.so2_libre ?? l.so2_libre` cuando `l.por_vasija` (si es null, mostrar `—`), objetivo = `v.b.objetivo ?? bl.objetivo`, diferencia = objetivo − SO₂ de la vasija; si `v.b.aviso`, agregar en la última celda `<span class="oc-aviso">` con el texto.
En `_ocAvisosDe(l)`: anteponer `cartelPorVasija(l)` y agregar `...(l.avisos_vasija || [])`.
CSS (en `public/lotes/index.html`, junto a `.oc-aviso`): las celdas de vasija sin dosis con fondo rojo claro: `.ocp-v td.ocp-sin{background:#fbe3df}`.

- [ ] **Step 4: Run** el archivo + `test/lotes-orden-correccion-planilla.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/orden-correccion-planilla.js public/lotes/js/vista-orden-correccion.js public/lotes/index.html test/lotes-orden-correccion-por-vasija.test.mjs
git commit -m "feat(lotes): alerta de barril por barril en la Planilla, SO2 por vasija y modo fijo"
```

---

### Task 6: Papel — rótulo "BARRIL POR BARRIL"

**Files:**
- Modify: `public/lotes/js/orden-correccion-papel.js` (`filasPapelPorModo` y `filaPapelLote`)
- Modify: `public/lotes/js/vista-orden-correccion.js:652-660` (ya marca `g.primero`)
- Modify: `public/lotes/index.html` (CSS `.oh-pxb`)
- Test: `test/lotes-orden-correccion-por-vasija.test.mjs`; fixture `test/fixtures/lotes-papel.json` si cambia CSS de papel

**Interfaces:**
- Produces: los grupos de `filasPapelPorModo` llevan `porVasija: true` cuando `lote.por_vasija`; `filaPapelLote` imprime el rótulo si `fila.porVasija && fila.primero`.

- [ ] **Step 1: Write the failing test** (agregar)

```js
import { filasPapelPorModo, filaPapelLote } from '../public/lotes/js/orden-correccion-papel.js';
describe('papel barril por barril', () => {
  it('el primer renglón del lote lleva el rótulo; los demás no', () => {
    const filas = _ocBuildRows({ lotes: [lotePV] }, new Set(), new Map(), [], {});
    const g = filasPapelPorModo(filas, () => 'barril', { ...U, prod: 'Sol1030' });
    g.forEach((x, i) => { x.primero = i === 0; });
    const u = { ...U, prod: 'Sol1030' };
    expect(filaPapelLote({ numero: 1, fila: g[0] }, u)).toContain('BARRIL POR BARRIL');
    expect(filaPapelLote({ numero: 2, fila: g[1] }, u)).not.toContain('BARRIL POR BARRIL');
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**
  - En `filasPapelPorModo`, rama `'barril'`: agregar `porVasija: !!lote.por_vasija` al objeto empujado.
  - En `filaPapelLote`, celda LOTE: `... + (fila.porVasija && fila.primero ? '<div class="oh-pxb">CORRECCIÓN BARRIL POR BARRIL — cada vasija su dosis</div>' : '')`.
  - CSS: `.orden-hoja .oh-pxb{font-size:8px;font-weight:700;line-height:1.1;letter-spacing:.02em}`. Si eso cambia `test/fixtures/lotes-papel.json`, regenerar con `node scripts/extraer-papel-lotes.mjs > test/fixtures/lotes-papel.json` y revisar que el diff sea solo `.oh-pxb`.
  - La celda LOTE mide 96 px: el rótulo en 8 px ocupa 2–3 renglones. Verificar en la Task 8 que una hoja de 25 renglones siga entrando en una A4; si no, acortar a "BARRIL × BARRIL".

- [ ] **Step 4: Run** el archivo + `test/lotes-orden-correccion-papel.test.mjs test/lotes-papel-intacto.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/orden-correccion-papel.js public/lotes/index.html test/
git commit -m "feat(lotes): rótulo BARRIL POR BARRIL en el papel de la orden de corrección"
```

---

## ENTREGA 2 — registro por vasija

### Task 7: La orden guardada y la ejecución conservan el detalle por vasija

**Files:**
- Modify: `public/lotes/js/orden-correccion-guardada.js` (`armarOrdenGuardada`, `filasDeGuardada`, `entradasDeEjecucion`)
- Test: `test/lotes-orden-correccion-por-vasija.test.mjs`

**Interfaces:**
- Produces:
  - Lote guardado + `por_vasija: true` (solo si lo es); vasija guardada + `so2_libre`, `objetivo` (solo si `por_vasija`).
  - `filasDeGuardada` devuelve `lote.por_vasija` y `barrica.so2_libre/objetivo` para que Ver la orden redibuje el rótulo.
  - Corrección registrada (lotes por vasija) + `vasijas: [{num, so2_libre, objetivo, mbk_g, ml}]` con las vasijas tildadas; `so2_libre_actual` = SO₂ de la peor (el del lote, ya lo es).

- [ ] **Step 1: Write the failing test** (agregar)

```js
import { armarOrdenGuardada, entradasDeEjecucion, filasDeGuardada } from '../public/lotes/js/orden-correccion-guardada.js';
describe('guardada y ejecución barril por barril', () => {
  const filas = _ocBuildRows({ lotes: [lotePV] }, new Set(), new Map(), [], {});
  const o = armarOrdenGuardada({ id: 'x', numero: 'B300', fecha: '2026-11-13', unidad: 'sol', filas, modos: new Map() });
  it('guarda por_vasija, modo barril y el SO2 de cada vasija', () => {
    expect(o.lotes[0]).toMatchObject({ por_vasija: true, modo: 'barril' });
    expect(o.lotes[0].vasijas[1]).toMatchObject({ num: '1100305', so2_libre: 41, objetivo: 35 });
  });
  it('Ver la orden conserva el rótulo', () => {
    expect(filasDeGuardada(o)[0].lote.por_vasija).toBe(true);
  });
  it('ejecutar registra el detalle de las vasijas tildadas', () => {
    const { entradas } = entradasDeEjecucion(o, new Map([['26056', new Set([0, 1])]]), '2026-11-14');
    expect(entradas[0].correccion.vasijas.map(v => v.num)).toEqual(['1100923', '1100305']);
    expect(entradas[0].correccion.vasijas[0].so2_libre).toBe(6);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**
  - `armarOrdenGuardada`: en la fila 'lote', `if (f.lote.por_vasija) actual.por_vasija = true;`; en cada vasija, si `actual.por_vasija`, agregar `so2_libre: b.so2_libre ?? null, objetivo: b.objetivo ?? null`; el `modoPorDefecto(..., !!l.por_vasija)` y forzar `l.modo = 'barril'` si `l.por_vasija`.
  - `filasDeGuardada`: `const lote = { lote: l.lote, variedad: l.variedad, ...(l.por_vasija ? { por_vasija: true } : {}) };` y en barrica `so2_libre: v.so2_libre, objetivo: v.objetivo`.
  - `entradasDeEjecucion`: después de `armarCorreccion(...)`, si `l.por_vasija`, `correccion.vasijas = idx.map(i => ({ num: l.vasijas[i].num, so2_libre: l.vasijas[i].so2_libre ?? null, objetivo: l.vasijas[i].objetivo ?? null, mbk_g: Number(l.vasijas[i].mbk_g), ml: Number(l.vasijas[i].ml) }))`.
  - Servidor: `src/prensas/validacion.ts` valida la forma de `analisis[].correccion` y `ordenes_correccion`; agregar `vasijas` (array opcional) y `por_vasija`/`so2_libre`/`objetivo` opcionales si el validador es estricto. Correr `test/` que cubre `validacion.ts` (`grep -l validacion test/*`).

- [ ] **Step 4: Run** el archivo + `test/lotes-orden-correccion-guardada.test.mjs` + los tests de validación → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/orden-correccion-guardada.js src/prensas/validacion.ts test/
git commit -m "feat(lotes): la orden guardada y la ejecución registran el detalle por vasija"
```

---

### Task 8: Verificación completa

**Files:** ninguno nuevo (mock en el scratchpad de la sesión; entrada nueva en `Escritorio\claude\.claude\launch.json`, sin commitear en el repo de la plataforma).

- [ ] **Step 1:** `npx tsc --noEmit` y `npx vitest run` completo (si no arranca en el worktree, en tandas de 8 archivos). Expected: todo verde.
- [ ] **Step 2:** Mock sin login (patrón `mock-oc-hoja.mjs` / `mock-orden-barril.mjs` de sesiones anteriores): sirve `public/` y responde `/lotes/api/orden-correccion` con la salida de `armarOrden` sobre datos que incluyan el 26056 barril por barril (con un barril sin análisis y un T50 por número completo) y un lote normal. Entrada `lotes-so2-por-barril` en `.claude/launch.json` con un puerto libre (≥ 8881).
- [ ] **Step 3:** En el navegador: Planilla muestra el cartel, SO₂ por vasija, select bloqueado, barril sin análisis en rojo; Hoja muestra el rótulo en el primer renglón del 26056; escribir una dosis a mano en el barril sin análisis y ver que se guarda; el lote normal sigue igual.
- [ ] **Step 4:** PDF real de la hoja con 25 renglones (script `pdf-oc.mjs` de sesiones anteriores o `Page.printToPDF` por CDP): una A4 por hoja.
- [ ] **Step 5:** Commit final si hubo ajustes; pushear la rama `feat/so2-por-barril` y abrir PR. **No mergear**: lo hace el usuario (push a main = producción).
