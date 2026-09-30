# Órdenes de trabajo editables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sumar a Movimientos (Lotes web) una sub-pestaña "Órdenes de trabajo" con la lista de OT y la hoja A4 de la OT elegida, donde se editan sobre el papel los textos de los pasos de esa OT.

**Architecture:** Los textos editados viven en una copia perezosa `ot.bloques` dentro de la OT (módulo puro `ot-bloques.js`). `hojaOT` lee esos bloques y, con `{editable:true}`, dibuja cada paso/dato como `<textarea>` con controles ＋/✕. Una vista nueva `vista-ot-lista.js` arma lista + hoja; `vista-movimientos.js` agrega el selector Historial | Órdenes y deriva ahí el emitir y el 🖨.

**Tech Stack:** JS módulos ES del navegador (sin framework), CSS en `public/lotes/index.html`, tests con vitest (`npm test`), server local `wrangler dev` (`dev:sin-ia`).

**Spec:** `docs/superpowers/specs/2026-09-29-lotes-ot-editables-design.md`

## Global Constraints

- Trabajar SOLO en el worktree `C:\Users\Bmax\repos\catenainstitute-ot-editables` (rama `feat/ot-editables`). Antes de cada commit: `git branch --show-current` debe decir `feat/ot-editables`.
- Solo son editables los bloques `paso` y `dato`; `ids`, `rotular` y las tablas no se editan ni se quitan.
- OT ejecutada (`esEjecutado(ot)`) = solo lectura.
- Nunca mutar `PLANTILLAS_OT`: la primera edición copia los bloques a `ot.bloques` con `structuredClone`.
- `↺ Textos de la plantilla` = `delete ot.bloques`, con `confirm`.
- Un paso/dato con texto vacío no se imprime.
- Tipear no repinta la hoja; ＋ y ✕ sí repintan y devuelven el foco.
- Imprimir desde la sub-pestaña guarda antes (`await guardar(false)`); si no guarda, no imprime.
- Comentarios y textos de UI en castellano rioplatense, con el mismo estilo de los archivos vecinos (sin tildes en comentarios de código como el resto de `public/lotes/js`, salvo donde el archivo ya las usa).
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: `ot-bloques.js` — los pasos propios de una OT (puro)

**Files:**
- Create: `public/lotes/js/ot-bloques.js`
- Test: `test/lotes-ot-bloques.test.mjs`

**Interfaces:**
- Consumes: `plantillaPorId(id)` de `ot-plantillas.js`; `esEjecutado(x)` de `ot-movimientos.js`.
- Produces:
  - `bloquesDeOT(ot) -> Array<bloque>` (los de la OT o los de la plantilla; `[]` si no hay plantilla)
  - `tieneTextosPropios(ot) -> boolean`
  - `esEditable(ot) -> boolean` (pendiente y con bloques)
  - `editarTexto(ot, i, texto) -> boolean` (true si cambió)
  - `insertarPaso(ot, i) -> number` (índice del paso nuevo, debajo de `i`)
  - `quitarBloque(ot, i) -> boolean`
  - `volverAPlantilla(ot) -> boolean`
  - `TIPOS_TEXTO: Set<'paso'|'dato'>`

- [ ] **Step 1: Write the failing test**

`test/lotes-ot-bloques.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { bloquesDeOT, tieneTextosPropios, esEditable, editarTexto, insertarPaso,
         quitarBloque, volverAPlantilla } from '../public/lotes/js/ot-bloques.js';
import { plantillaPorId } from '../public/lotes/js/ot-plantillas.js';

const ot = (extra) => ({ id: 'ot-x', ot: 'OT-2026-001', plantilla: 'barricas-barricas',
  estado: 'pendiente', lotes: [], ...(extra || {}) });
const PL = () => plantillaPorId('barricas-barricas').bloques;
const iTabla = () => PL().findIndex(b => b.tipo === 'tabla-vaciado');

describe('bloquesDeOT', () => {
  it('sin textos propios devuelve los de la plantilla', () => {
    expect(bloquesDeOT(ot())).toBe(PL());
    expect(tieneTextosPropios(ot())).toBe(false);
  });
  it('plantilla desconocida da lista vacia', () => {
    expect(bloquesDeOT(ot({ plantilla: 'no-existe' }))).toEqual([]);
  });
  it('con textos propios devuelve los de la OT', () => {
    const o = ot({ bloques: [{ tipo: 'paso', texto: 'solo esto' }] });
    expect(bloquesDeOT(o)).toEqual([{ tipo: 'paso', texto: 'solo esto' }]);
  });
});

describe('editarTexto', () => {
  it('la primera edicion copia la plantilla y no la toca', () => {
    const original = PL()[1].texto;
    const o = ot();
    expect(editarTexto(o, 1, 'Sanitizar todo')).toBe(true);
    expect(tieneTextosPropios(o)).toBe(true);
    expect(o.bloques[1].texto).toBe('Sanitizar todo');
    expect(o.bloques.length).toBe(PL().length);
    expect(PL()[1].texto).toBe(original);
  });
  it('conserva las marcas del bloque (ok, destaca)', () => {
    const o = ot();
    editarTexto(o, 0, 'Buscar barriles');
    expect(o.bloques[0].ok).toBe(true);
  });
  it('el mismo texto no cambia nada ni crea la copia', () => {
    const o = ot();
    expect(editarTexto(o, 1, PL()[1].texto)).toBe(false);
    expect(tieneTextosPropios(o)).toBe(false);
  });
  it('no edita una tabla', () => {
    const o = ot();
    expect(editarTexto(o, iTabla(), 'x')).toBe(false);
    expect(tieneTextosPropios(o)).toBe(false);
  });
});

describe('insertarPaso y quitarBloque', () => {
  it('inserta un paso vacio debajo y devuelve su indice', () => {
    const o = ot();
    expect(insertarPaso(o, 2)).toBe(3);
    expect(o.bloques[3]).toEqual({ tipo: 'paso', texto: '' });
    expect(o.bloques.length).toBe(PL().length + 1);
  });
  it('inserta debajo de una tabla', () => {
    const o = ot();
    const j = insertarPaso(o, iTabla());
    expect(o.bloques[j - 1].tipo).toBe('tabla-vaciado');
  });
  it('quita un paso', () => {
    const o = ot();
    const segundo = PL()[2].texto;
    expect(quitarBloque(o, 1)).toBe(true);
    expect(o.bloques[1].texto).toBe(segundo);
    expect(PL().length).toBe(o.bloques.length + 1);
  });
  it('no quita una tabla', () => {
    const o = ot();
    expect(quitarBloque(o, iTabla())).toBe(false);
    expect(tieneTextosPropios(o)).toBe(false);
  });
});

describe('volverAPlantilla y esEditable', () => {
  it('borra la copia', () => {
    const o = ot();
    editarTexto(o, 1, 'x');
    expect(volverAPlantilla(o)).toBe(true);
    expect(tieneTextosPropios(o)).toBe(false);
    expect(volverAPlantilla(o)).toBe(false);
  });
  it('pendiente se edita, ejecutada no', () => {
    expect(esEditable(ot())).toBe(true);
    expect(esEditable(ot({ estado: 'ejecutado' }))).toBe(false);
    expect(esEditable(ot({ plantilla: 'no-existe' }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lotes-ot-bloques.test.mjs`
Expected: FAIL (no se puede resolver `ot-bloques.js`).

- [ ] **Step 3: Write minimal implementation**

`public/lotes/js/ot-bloques.js`:

```js
/* ===== Lotes CIW — los pasos propios de UNA orden de trabajo (puro) =====
 *
 * La hoja de una OT sale de los bloques de su plantilla (ot-plantillas.js).
 * Si el usuario cambia los textos de los pasos de ESA orden, la OT se guarda su
 * propia copia en ot.bloques y desde ahi la hoja usa la copia. La copia se crea
 * recien en la primera edicion: una OT que nunca se toco no suma nada al
 * documento (que ya pesa ~1,6 MB y el plan Free corta a 10 ms de CPU).
 *
 * Una copia entera y no "diferencias por renglon": insertar o quitar un paso
 * corre los indices, y una diferencia guardada caeria en el paso equivocado.
 *
 * Solo se editan los bloques de texto (paso, dato). Las tablas, los ID y el
 * rotular salen de los datos de la OT: no se editan ni se quitan.
 *
 * Nunca muta PLANTILLAS_OT. */
'use strict';

import { plantillaPorId } from './ot-plantillas.js';
import { esEjecutado } from './ot-movimientos.js';

export const TIPOS_TEXTO = new Set(['paso', 'dato']);

export function bloquesDeOT(ot){
  if (ot && Array.isArray(ot.bloques)) return ot.bloques;
  const pl = plantillaPorId(ot && ot.plantilla);
  return pl ? pl.bloques : [];
}

export function tieneTextosPropios(ot){
  return !!ot && Array.isArray(ot.bloques);
}

// Una OT confirmada es registro de calidad: se ve e imprime, no se toca.
export function esEditable(ot){
  return !!ot && !esEjecutado(ot) && bloquesDeOT(ot).length > 0;
}

function propios(ot){
  if (!Array.isArray(ot.bloques)) ot.bloques = structuredClone(bloquesDeOT(ot));
  return ot.bloques;
}

const esTexto = b => !!b && TIPOS_TEXTO.has(b.tipo);

export function editarTexto(ot, i, texto){
  const b = bloquesDeOT(ot)[i];
  const nuevo = String(texto ?? '');
  if (!esTexto(b) || b.texto === nuevo) return false;
  propios(ot)[i].texto = nuevo;
  return true;
}

export function insertarPaso(ot, i){
  const bs = propios(ot);
  const j = Math.min(Math.max(Number(i) + 1, 0), bs.length);
  bs.splice(j, 0, { tipo: 'paso', texto: '' });
  return j;
}

export function quitarBloque(ot, i){
  if (!esTexto(bloquesDeOT(ot)[i])) return false;
  propios(ot).splice(i, 1);
  return true;
}

export function volverAPlantilla(ot){
  if (!tieneTextosPropios(ot)) return false;
  delete ot.bloques;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lotes-ot-bloques.test.mjs`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # feat/ot-editables
git add public/lotes/js/ot-bloques.js test/lotes-ot-bloques.test.mjs
git commit -m "feat(lotes): pasos propios por OT (ot-bloques.js)"
```

---

### Task 2: `hojaOT` lee los pasos de la OT y tiene modo editable

**Files:**
- Modify: `public/lotes/js/ot-hojas.js` (función `hojaOT` e imports)
- Test: `test/lotes-ot-hojas.test.mjs` (agregar un `describe` al final)

**Interfaces:**
- Consumes: `bloquesDeOT(ot)` de Task 1.
- Produces: `hojaOT(ot, { editable = false } = {}) -> string`. En modo editable:
  - cada `paso`/`dato` lleva `<textarea class="ot-texto" data-bloque="<i>">` y sus controles `<span class="ot-ctrl">` con `button.ot-insertar[data-insertar="<i>"]` y `button.ot-quitar[data-quitar="<i>"]`;
  - los demás bloques van envueltos en `<div class="ot-fijo">…<span class="ot-ctrl">` solo con ＋;
  - las filas de paso/dato llevan la clase `ot-editable`.
  Sin `editable`, igual que hoy salvo que paso/dato con texto vacío no salen. `hojasOT` no cambia su firma.

- [ ] **Step 1: Write the failing test**

Agregar al final de `test/lotes-ot-hojas.test.mjs`:

```js
describe('hojaOT con pasos propios y editable', () => {
  const lotes = () => [{ lote: '26217', id_texto: 'CS', barriles: [barril('2221713')] }];

  it('usa los pasos propios de la OT', () => {
    const o = ot(lotes());
    o.bloques = [{ tipo: 'paso', texto: 'Paso inventado para esta OT' }];
    const h = H.hojaOT(o);
    expect(h).toContain('Paso inventado para esta OT');
    expect(h).not.toContain('Sanitizar clapets');
  });

  it('un paso vacio no se imprime', () => {
    const o = ot(lotes());
    o.bloques = [{ tipo: 'paso', texto: '   ' }, { tipo: 'paso', texto: 'Sí va' }];
    expect(cuenta(H.hojaOT(o), 'class="ot-paso')).toBe(1);
  });

  it('sin editable no hay textarea ni controles', () => {
    const h = H.hojaOT(ot(lotes()));
    expect(h).not.toContain('<textarea');
    expect(h).not.toContain('ot-ctrl');
  });

  it('editable: un textarea por paso/dato con su indice y controles', () => {
    const o = ot(lotes());
    const h = H.hojaOT(o, { editable: true });
    const bs = plBloques();
    const textos = bs.filter(b => b.tipo === 'paso' || b.tipo === 'dato').length;
    expect(cuenta(h, '<textarea class="ot-texto"')).toBe(textos);
    expect(h).toContain('data-bloque="1"');
    expect(cuenta(h, 'data-quitar=')).toBe(textos);
    expect(cuenta(h, 'data-insertar=')).toBe(bs.length);
    expect(h).toContain('Sanitizar clapets antes de comenzar trasiego.</textarea>');
  });

  it('editable: la tabla va envuelta y sin boton de quitar', () => {
    const h = H.hojaOT(ot(lotes()), { editable: true });
    expect(h).toMatch(/<div class="ot-fijo"><div class="ot-ids">/);
  });

  it('editable: escapa el texto dentro del textarea', () => {
    const o = ot(lotes());
    o.bloques = [{ tipo: 'paso', texto: '<b>ojo</b> & listo' }];
    expect(H.hojaOT(o, { editable: true })).toContain('&lt;b&gt;ojo&lt;/b&gt; &amp; listo</textarea>');
  });
});
```

y arriba del archivo, junto a los otros helpers, el acceso a la plantilla:

```js
let P;
beforeAll(async () => { P = await import('../public/lotes/js/ot-plantillas.js'); });
const plBloques = () => P.plantillaPorId('barricas-barricas').bloques;
```

(El `beforeAll` nuevo va después del existente; vitest los corre en orden.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lotes-ot-hojas.test.mjs`
Expected: FAIL en los tests nuevos ("Paso inventado" no aparece, no hay `<textarea`).

- [ ] **Step 3: Write minimal implementation**

En `public/lotes/js/ot-hojas.js`:

1. Import: agregar `import { bloquesDeOT } from './ot-bloques.js';`
2. Antes de `export function hojaOT`, agregar:

```js
/* Modo editable (sub-pestaña Órdenes de trabajo): cada paso y dato es un
 * textarea con data-bloque = su indice en bloquesDeOT(ot), y cada bloque lleva
 * sus controles (＋ insertar un paso debajo; ✕ quitar, solo en los de texto).
 * La impresion nunca usa este modo: hojasOT arma la hoja de nuevo desde los
 * datos, asi que los controles no llegan al papel. */
const textoEditable = (i, texto) =>
  `<textarea class="ot-texto" data-bloque="${i}" rows="1" placeholder="Escribí el paso…">${esc(texto)}</textarea>`;

function controles(i, quitable){
  return '<span class="ot-ctrl">' +
    `<button type="button" class="ot-insertar" data-insertar="${i}" title="Insertar un paso debajo" aria-label="Insertar un paso debajo">＋</button>` +
    (quitable ? `<button type="button" class="ot-quitar" data-quitar="${i}" title="Quitar este renglón" aria-label="Quitar este renglón">✕</button>` : '') +
    '</span>';
}

const vacio = b => !String((b && b.texto) || '').trim();
```

3. Reemplazar la firma y el `map` de `hojaOT`:

```js
export function hojaOT(ot, { editable = false } = {}){
  const pl = plantillaPorId(ot.plantilla);
  const hayOrganico = ot.lotes.some(l => l.organico);
  const cuerpo = bloquesDeOT(ot).map((b, i) => {
    switch (b.tipo){
      case 'paso': {
        if (!editable && vacio(b)) return '';
        const dest = b.destaca === 'organico' && hayOrganico ? ' ot-destaca' : '';
        const ok = b.ok ? '<span class="ot-ok">OK ☐</span>' : '';
        const texto = editable ? textoEditable(i, b.texto) : esc(b.texto);
        return `<div class="ot-paso${dest}${editable ? ' ot-editable' : ''}"><span class="ot-caja">☐</span>` +
          `${texto}${ok}${editable ? controles(i, true) : ''}</div>`;
      }
      case 'dato': {
        if (!editable && vacio(b)) return '';
        const ok = b.ok ? '<span class="ot-ok">OK ☐</span>' : '';
        const texto = editable ? textoEditable(i, b.texto) : esc(b.texto);
        return `<div class="ot-dato${editable ? ' ot-editable' : ''}">${texto} <span class="ot-linea"></span>` +
          `${ok}${editable ? controles(i, true) : ''}</div>`;
      }
      default: {
        const html = bloqueFijo(ot, b);
        return editable ? `<div class="ot-fijo">${html}${controles(i, false)}</div>` : html;
      }
    }
  }).join('');
  // (resto de hojaOT sin cambios: lotesTxt, banda, return …)
```

4. Sacar los `case` de los bloques no editables a una función (misma lógica que hoy):

```js
function bloqueFijo(ot, b){
  switch (b.tipo){
    case 'ids':              return b.de === 'corte' ? bloqueIdCorte(ot) : bloqueIds(ot);
    case 'tabla-vaciado':    return b.porBarril ? tablaVaciadoPorBarril(ot) : tablaVaciado(ot, b.columnas);
    case 'rotular':          return rotular(ot, b.de);
    case 'tabla-correccion': return tablaCorreccion(ot, b.vasija, b.modelo);
    case 'tabla-llenado':    return tablaLlenado(ot, b.modelo);
    default:                 return '';
  }
}
```

Ojo: `tablaVaciado` empieza con `bloqueIds(ot)` (el `<div class="ot-ids">`), por eso el test de "ot-fijo" matchea `ot-ids`. Un bloque desconocido editable queda como `<div class="ot-fijo"><span class="ot-ctrl">…` (inofensivo).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lotes-ot-hojas.test.mjs test/lotes-ot-bloques.test.mjs`
Expected: PASS, incluidos los tests viejos de `hojaOT`.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add public/lotes/js/ot-hojas.js test/lotes-ot-hojas.test.mjs
git commit -m "feat(lotes): la hoja de la OT usa sus pasos propios y tiene modo editable"
```

---

### Task 3: `ot-lista.js` — filtrar y resumir las OT (puro)

**Files:**
- Create: `public/lotes/js/ot-lista.js`
- Test: `test/lotes-ot-lista.test.mjs`

**Interfaces:**
- Consumes: `esEjecutado` de `ot-movimientos.js`.
- Produces:
  - `filtrarOrdenes(ordenes, { soloPendientes = true, busca = '' } = {}) -> Array<ot>`: copia nueva, filtrada y ordenada por fecha desc y después por N° desc.
  - `resumenLotes(ot) -> string`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { filtrarOrdenes, resumenLotes } from '../public/lotes/js/ot-lista.js';

const o = (ot, fecha, estado, lotes, extra) => ({ id: 'id-' + ot, ot, fecha, estado,
  lotes: lotes.map(lote => ({ lote })), ...(extra || {}) });
const LISTA = [
  o('OT-2026-001', '2026-09-01', 'ejecutado', ['26100']),
  o('OT-2026-003', '2026-09-20', 'pendiente', ['26217', '26218']),
  o('OT-2026-002', '2026-09-20', 'pendiente', ['26300']),
];

describe('filtrarOrdenes', () => {
  it('por defecto solo pendientes, mas nueva primero', () => {
    expect(filtrarOrdenes(LISTA).map(x => x.ot)).toEqual(['OT-2026-003', 'OT-2026-002']);
  });
  it('todas', () => {
    expect(filtrarOrdenes(LISTA, { soloPendientes: false }).map(x => x.ot))
      .toEqual(['OT-2026-003', 'OT-2026-002', 'OT-2026-001']);
  });
  it('busca por numero o por lote', () => {
    expect(filtrarOrdenes(LISTA, { soloPendientes: false, busca: '001' }).map(x => x.ot)).toEqual(['OT-2026-001']);
    expect(filtrarOrdenes(LISTA, { busca: '26218' }).map(x => x.ot)).toEqual(['OT-2026-003']);
  });
  it('busca por el lote del corte', () => {
    const c = o('OT-2026-009', '2026-09-25', 'pendiente', ['1'], { lote_corte: { lote: '26999' } });
    expect(filtrarOrdenes([c], { busca: '26999' })).toHaveLength(1);
  });
  it('no muta la lista', () => {
    const copia = LISTA.map(x => x.ot);
    filtrarOrdenes(LISTA, { soloPendientes: false });
    expect(LISTA.map(x => x.ot)).toEqual(copia);
  });
});

describe('resumenLotes', () => {
  it('lista los lotes', () => {
    expect(resumenLotes(o('x', '', '', ['1', '2']))).toBe('1 · 2');
  });
  it('corta a cuatro', () => {
    expect(resumenLotes(o('x', '', '', ['1', '2', '3', '4', '5', '6']))).toBe('1 · 2 · 3 · 4 +2');
  });
  it('un corte se nombra por el lote que forma', () => {
    const c = o('x', '', '', ['1', '2', '3'], { lote_corte: { lote: '26999' } });
    expect(resumenLotes(c)).toBe('26999 (corte de 3 lotes)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lotes-ot-lista.test.mjs`
Expected: FAIL (no existe el módulo).

- [ ] **Step 3: Write minimal implementation**

```js
/* ===== Lotes CIW — la lista de la sub-pestaña Órdenes de trabajo (puro) =====
 * Filtra y ordena DATOS().ordenes_trabajo y arma el renglon de lotes de cada
 * OT. Aparte de la vista para poder testearlo en node. */
'use strict';

import { esEjecutado } from './ot-movimientos.js';

const lotesDe = ot => (ot.lotes || []).map(l => String(l.lote ?? ''));

export function filtrarOrdenes(ordenes, { soloPendientes = true, busca = '' } = {}){
  const q = String(busca || '').trim().toLowerCase();
  return (ordenes || [])
    .filter(ot => !soloPendientes || !esEjecutado(ot))
    .filter(ot => !q ||
      String(ot.ot || '').toLowerCase().includes(q) ||
      lotesDe(ot).some(l => l.toLowerCase().includes(q)) ||
      String((ot.lote_corte && ot.lote_corte.lote) || '').toLowerCase().includes(q))
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) ||
                    String(b.ot || '').localeCompare(String(a.ot || '')));
}

// Un corte de treinta lotes no entra en un renglon: se nombra por el lote que forma.
export function resumenLotes(ot){
  const ls = lotesDe(ot);
  if (ot.lote_corte && ot.lote_corte.lote) return `${ot.lote_corte.lote} (corte de ${ls.length} lotes)`;
  return ls.length > 4 ? `${ls.slice(0, 4).join(' · ')} +${ls.length - 4}` : ls.join(' · ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lotes-ot-lista.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add public/lotes/js/ot-lista.js test/lotes-ot-lista.test.mjs
git commit -m "feat(lotes): filtro y resumen de la lista de OT (ot-lista.js)"
```

---

### Task 4: la sub-pestaña — `vista-ot-lista.js`, selector en Movimientos, CSS y el nuevo final de Emitir

Esta tarea toca DOM: no tiene test de node (el repo solo testea módulos puros). Se verifica en el navegador en la Task 5.

**Files:**
- Create: `public/lotes/js/vista-ot-lista.js`
- Modify: `public/lotes/js/vista-movimientos.js` (imports; `renderMovimientos`; listener de 🖨; botón Emitir)
- Modify: `public/lotes/js/vista-ot-emitir.js` (`registrarOT`)
- Modify: `public/lotes/index.html` (CSS, después del bloque `/* ---- la orden de trabajo en pantalla (#otPaginas en .ot-der) ---- */`)

**Interfaces:**
- Consumes: Task 1 (`editarTexto`, `insertarPaso`, `quitarBloque`, `volverAPlantilla`, `tieneTextosPropios`, `esEditable`), Task 2 (`hojaOT(ot, {editable})`), Task 3 (`filtrarOrdenes`, `resumenLotes`), `abrirImprimirOT`/`abrirEmitirOT` de `vista-ot-emitir.js`, `abrirConfirmarOT(ot, onListo)`.
- Produces:
  - `renderOrdenesTrabajo(cont: HTMLElement, { onEmitir: () => void, onCambio: () => void })`
  - `elegirOT(id: string|null)`
  - en `vista-movimientos.js`: `export function verOrdenTrabajo(id)`
  - `registrarOT(ot, onListo, antes)` ahora llama `onListo(ot)` y ya no abre el diálogo de impresión.

- [ ] **Step 1: Crear `public/lotes/js/vista-ot-lista.js`**

```js
/* ===== Lotes CIW — sub-pestaña Órdenes de trabajo (Movimientos) =====
 *
 * A la izquierda la lista de DATOS().ordenes_trabajo; a la derecha la hoja 1
 * de la OT elegida a tamaño A4, como la Orden de muestras. Sobre la hoja se
 * editan los textos de los pasos de ESA OT (ot-bloques.js): tipear no repinta
 * (no se pierde el foco); ＋ y ✕ repintan y devuelven el foco.
 *
 * Una OT ejecutada se ve igual pero de solo lectura.
 *
 * No importa vista-movimientos.js (cerraria un ciclo): lo que tiene que pasar
 * afuera entra por los callbacks onEmitir y onCambio. */
'use strict';

import { $, esc, escA, DATOS, markDirty, guardar } from './nucleo.js';
import { plantillaPorId } from './ot-plantillas.js';
import { hojaOT } from './ot-hojas.js';
import { esEjecutado } from './ot-movimientos.js';
import { editarTexto, insertarPaso, quitarBloque, volverAPlantilla,
         tieneTextosPropios, esEditable } from './ot-bloques.js';
import { filtrarOrdenes, resumenLotes } from './ot-lista.js';
import { abrirImprimirOT } from './vista-ot-emitir.js';
import { abrirConfirmarOT } from './vista-ot-confirmar.js';
import { fmtFecha } from './fechas.js';

let _elegida = null;          // id de la OT abierta en la hoja
let _soloPendientes = true;
let _busca = '';
let _cb = { onEmitir(){}, onCambio(){} };

const _ordenes = () => DATOS().ordenes_trabajo || [];
const _otPorId = id => _ordenes().find(o => o.id === id) || null;

/* Abre una OT en la hoja. Si esta ejecutada, el filtro pasa a "todas" para
 * que se vea en la lista. */
export function elegirOT(id){
  _elegida = id || null;
  const ot = _otPorId(_elegida);
  if (ot && esEjecutado(ot)) _soloPendientes = false;
}

export function renderOrdenesTrabajo(cont, callbacks){
  if (!cont) return;
  _cb = { ..._cb, ...(callbacks || {}) };
  const lista = filtrarOrdenes(_ordenes(), { soloPendientes: _soloPendientes, busca: _busca });
  if (_elegida && !_otPorId(_elegida)) _elegida = null;
  if (!_elegida && lista.length) _elegida = lista[0].id;

  const filas = lista.map(ot => {
    const pl = plantillaPorId(ot.plantilla);
    const estado = esEjecutado(ot)
      ? '<span class="tag">ejecutada</span>'
      : '<span class="tag mov-pendiente">● pendiente</span>';
    return `<button type="button" class="otl-fila${ot.id === _elegida ? ' on' : ''}" data-ot="${escA(ot.id)}">` +
      `<span class="otl-l1"><b>${esc(ot.ot)}</b> <span>${esc(fmtFecha(ot.fecha))}</span> ${estado}</span>` +
      `<span class="otl-sub">${esc(pl ? pl.nombre : ot.plantilla || '')}</span>` +
      `<span class="otl-sub">${esc(resumenLotes(ot))}</span></button>`;
  }).join('');
  const vacio = _ordenes().length
    ? 'Ninguna OT con este filtro.'
    : 'Todavía no hay órdenes de trabajo. Emití la primera con ➕ Emitir OT.';

  cont.innerHTML = `
<div class="otl">
  <div class="otl-izq">
    <div class="toolbar otl-barra">
      <input class="txt" id="otlBusca" placeholder="🔎 N° o lote…" value="${escA(_busca)}">
      <label class="otl-chk"><input type="checkbox" id="otlPend"${_soloPendientes ? ' checked' : ''}> Solo pendientes</label>
      <button class="btn primary" id="otlEmitir">➕ Emitir OT</button>
    </div>
    <div class="otl-lista" id="otlLista">${filas || `<div class="otl-vacio">${esc(vacio)}</div>`}</div>
  </div>
  <div class="otl-der" id="otlDer"></div>
</div>`;

  $('otlBusca').addEventListener('input', () => {
    _busca = $('otlBusca').value;
    renderOrdenesTrabajo(cont);
    const b = $('otlBusca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length);
  });
  $('otlPend').addEventListener('change', () => { _soloPendientes = $('otlPend').checked; renderOrdenesTrabajo(cont); });
  $('otlEmitir').addEventListener('click', () => _cb.onEmitir());
  $('otlLista').addEventListener('click', e => {
    const b = e.target.closest('[data-ot]');
    if (!b || b.dataset.ot === _elegida) return;
    _elegida = b.dataset.ot;
    $('otlLista').querySelectorAll('.otl-fila').forEach(f => f.classList.toggle('on', f === b));
    _pintarDer();
  });
  _pintarDer();
}

function _pintarCab(ot){
  const cab = $('otlCab');
  if (!cab) return;
  const edit = esEditable(ot);
  cab.innerHTML =
    `<span><b>${esc(ot.ot)}</b> · ${edit ? 'Escribí sobre la hoja para cambiar los pasos de esta OT.' : 'OT ejecutada: solo lectura.'}</span>` +
    '<span class="otl-botones">' +
      (edit && tieneTextosPropios(ot) ? '<button class="btn" id="otlPlantilla" title="Descartar los cambios de texto de esta OT">↺ Textos de la plantilla</button>' : '') +
      (edit ? '<button class="btn" id="otlConfirmar">✓ Confirmar</button>' : '') +
      '<button class="btn primary" id="otlImprimir">🖨 Imprimir</button>' +
    '</span>';
  $('otlImprimir').addEventListener('click', () => _imprimir(ot));
  if ($('otlConfirmar')) $('otlConfirmar').addEventListener('click', () => abrirConfirmarOT(ot, () => _cb.onCambio()));
  if ($('otlPlantilla')) $('otlPlantilla').addEventListener('click', () => {
    if (!confirm('¿Descartar los cambios de texto de ' + ot.ot + ' y volver a los de la plantilla?')) return;
    if (volverAPlantilla(ot)){ markDirty(); _pintarDer(); }
  });
}

function _pintarDer(foco){
  const der = $('otlDer');
  if (!der) return;
  const ot = _otPorId(_elegida);
  if (!ot){ der.innerHTML = '<div class="otl-vacio">Elegí una OT de la lista.</div>'; return; }
  der.innerHTML = `<div class="otl-cab" id="otlCab"></div>` +
    `<div class="otl-hoja" id="otlHoja">${hojaOT(ot, { editable: esEditable(ot) })}</div>`;
  _pintarCab(ot);
  if (esEditable(ot)) _cablearHoja($('otlHoja'), ot);
  if (foco != null){
    const t = der.querySelector(`textarea[data-bloque="${foco}"]`);
    if (t){ t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
  }
}

function _cablearHoja(hoja, ot){
  hoja.addEventListener('input', e => {
    const t = e.target.closest('textarea.ot-texto');
    if (!t) return;
    const tenia = tieneTextosPropios(ot);
    if (!editarTexto(ot, +t.dataset.bloque, t.value)) return;
    markDirty();
    // La primera edicion crea la copia: recien ahi aparece "↺ Textos de la plantilla".
    if (!tenia) _pintarCab(ot);
  });
  hoja.addEventListener('click', e => {
    const ins = e.target.closest('[data-insertar]');
    if (ins){ const j = insertarPaso(ot, +ins.dataset.insertar); markDirty(); _pintarDer(j); return; }
    const q = e.target.closest('[data-quitar]');
    if (q){
      const i = +q.dataset.quitar;
      if (quitarBloque(ot, i)){ markDirty(); _pintarDer(Math.max(i - 1, 0)); }
    }
  });
}

/* Guardar ANTES de imprimir, igual que al emitir: el papel sale a la bodega y
 * tiene que coincidir con lo guardado (numero de OT y textos). guardar() ya
 * avisa si algo falla. */
async function _imprimir(ot){
  if (!await guardar(false)) return;
  abrirImprimirOT(ot);
}
```

- [ ] **Step 2: `vista-movimientos.js` — selector Historial | Órdenes**

1. Import nuevo, debajo de `import { otDeMovimiento } from './ot-armado.js';`:

```js
import { renderOrdenesTrabajo, elegirOT } from './vista-ot-lista.js';
```

2. Debajo de `let _movFiltBusca = '';` agregar:

```js
/* Sub-pestaña: 'historial' (la tabla de movimientos) u 'ordenes' (lista de OT
 * con la hoja editable, vista-ot-lista.js). Solo en memoria. */
let _sub = 'historial';

function _selectorSub(){
  const b = (k, txt) => `<button type="button" data-sub="${k}" role="radio" aria-checked="${_sub === k}"` +
    `${_sub === k ? ' class="on"' : ''}>${txt}</button>`;
  return `<div class="mov-sub" role="radiogroup" aria-label="Vista de Movimientos">` +
    b('historial', '📋 Historial') + b('ordenes', '📝 Órdenes de trabajo') + '</div>';
}

function _cablearSelector(sec){
  sec.querySelector('.mov-sub').addEventListener('click', e => {
    const b = e.target.closest('[data-sub]');
    if (!b || b.dataset.sub === _sub) return;
    _sub = b.dataset.sub;
    renderMovimientos();
  });
}

/* Abre una OT en la sub-pestaña Órdenes de trabajo. */
export function verOrdenTrabajo(id){
  _sub = 'ordenes';
  elegirOT(id);
  renderMovimientos();
}

/* Al emitir (formulario o asistente del Corte) se abre la hoja de la OT nueva
 * para ajustar los pasos antes de imprimir. */
function _alEmitir(ot){
  if (ot && ot.id) verOrdenTrabajo(ot.id); else renderMovimientos();
}
```

3. En `renderMovimientos`, justo después de `const sec = $('tab-movimientos'); if (!sec) return;`:

```js
  if (_sub === 'ordenes'){
    // #otMovHoja tiene que existir: imprimirOT pinta ahi y el @media print de
    // printing-ot-mov muestra solo ese hijo de #tab-movimientos.
    sec.innerHTML = _selectorSub() + '<div id="movOrdenes"></div><div id="otMovHoja" style="display:none"></div>';
    _cablearSelector(sec);
    renderOrdenesTrabajo($('movOrdenes'), {
      onEmitir: () => abrirEmitirOT(_alEmitir),
      onCambio: renderMovimientos,
    });
    return;
  }
```

4. En el template `html`, primera línea: cambiar

```js
  const html = `
<div class="toolbar" id="movToolbar">
```
por
```js
  const html = `${_selectorSub()}
<div class="toolbar" id="movToolbar">
```

y después de `sec.innerHTML = html;` agregar `_cablearSelector(sec);`.

5. Listener de 🖨 en el historial: reemplazar

```js
        const ot = otDeMovimiento(DATOS().ordenes_trabajo, fila);
        if (ot) abrirImprimirOT(ot); else _imprimirOT(fila);
```
por
```js
        const ot = otDeMovimiento(DATOS().ordenes_trabajo, fila);
        if (ot) verOrdenTrabajo(ot.id); else _imprimirOT(fila);
```

y el `title` del botón en `cellAcciones`: `title="Imprimir la hoja de esta OT"` → `title="Ver e imprimir la hoja de esta OT"`.

6. Botón Emitir: `$('btnEmitirOT').addEventListener('click', () => abrirEmitirOT(renderMovimientos));` → `abrirEmitirOT(_alEmitir)`.

7. En el import de `vista-ot-emitir.js`, `abrirImprimirOT` queda sin uso: dejar `import { abrirEmitirOT } from './vista-ot-emitir.js';`.

- [ ] **Step 3: `vista-ot-emitir.js` — `registrarOT` abre la hoja en vez del diálogo**

Ojo: el archivo tiene finales de línea CRLF; usar la tool Edit (no `sed` con `\n`).

Reemplazar el cuerpo final de `registrarOT`:

```js
  markDirty();
  cerrarOverlay();
  onListo();

  const ok = await guardar(false);
  if (!ok){
    alert('La OT NO se guardó, así que todavía no conviene imprimirla. Resolvé el guardado; '
        + 'si la fila sigue en la tabla, imprimila con su botón 🖨, y si no, emitila de nuevo.');
    return;
  }
  abrirImprimirOT(ot);
}
```
por
```js
  markDirty();
  cerrarOverlay();
  // La vista abre la hoja de la OT nueva (sub-pestaña Órdenes de trabajo) para
  // ajustar los pasos; se imprime desde ahi, que vuelve a guardar antes.
  onListo(ot);

  const ok = await guardar(false);
  if (!ok){
    alert('La OT NO se guardó, así que todavía no conviene imprimirla. Resolvé el guardado; '
        + 'si la OT sigue en «Órdenes de trabajo», su botón 🖨 vuelve a intentar guardar, y si no, emitila de nuevo.');
  }
}
```

y actualizar el comentario de cabecera de `registrarOT` ("Suma la OT y sus movimientos a los datos, guarda, y recién con el guardado confirmado ofrece imprimir.") por "Suma la OT y sus movimientos a los datos, avisa a la vista (onListo(ot)) y guarda. `antes` …" conservando la frase de `antes`.

Verificar que nadie más llama a `registrarOT`/`abrirEmitirOT` esperando otro `onListo`: `grep -rn "registrarOT\|abrirEmitirOT\|abrirCorteOT" public/lotes/js` → solo `vista-ot-corte.js` (pasa el mismo `onListo`) y `vista-movimientos.js`/`vista-ot-lista.js`.

- [ ] **Step 4: CSS en `public/lotes/index.html`**

Después de la regla `#otPaginas .orden-hoja + .orden-hoja{margin-top:22px}` (dentro del bloque de "la orden de trabajo en pantalla"), agregar:

```css
/* ---- Movimientos: Historial | Ordenes de trabajo ----
 * Mismo selector segmentado que Analisis / Microbiologia de la Orden de muestras. */
#tab-movimientos .mov-sub{display:inline-flex;height:32px;margin:0 0 10px;border:1px solid var(--line);
  border-radius:var(--r-pill);background:var(--panel2);padding:2px;gap:2px}
#tab-movimientos .mov-sub button{border:none;background:transparent;color:var(--muted);font:inherit;
  font-size:13px;font-weight:600;padding:0 14px;border-radius:var(--r-pill);cursor:pointer}
#tab-movimientos .mov-sub button:hover{color:var(--accent)}
#tab-movimientos .mov-sub button.on{background:var(--panel);color:var(--accent);box-shadow:0 1px 3px rgba(0,0,0,.12)}
#tab-movimientos .mov-sub button:focus-visible{outline:none;box-shadow:var(--ring)}

/* lista de OT a la izquierda, hoja A4 a la derecha (debajo en pantallas angostas) */
.otl{display:grid;grid-template-columns:320px minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:1100px){.otl{grid-template-columns:minmax(0,1fr)}}
.otl-barra{flex-wrap:wrap;gap:8px}
.otl-barra .txt{flex:1 1 140px;min-width:0}
.otl-chk{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)}
.otl-lista{display:flex;flex-direction:column;gap:6px;max-height:calc(100vh - 230px);overflow:auto;padding:2px}
.otl-fila{display:flex;flex-direction:column;gap:2px;text-align:left;border:1px solid var(--line);border-radius:8px;
  background:var(--panel);color:var(--txt);padding:8px 10px;font:inherit;font-size:13px;cursor:pointer}
.otl-fila:hover{border-color:var(--accent)}
.otl-fila.on{border-color:var(--accent);box-shadow:var(--ring)}
.otl-fila .otl-l1{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.otl-fila .otl-sub{color:var(--muted);font-size:12px}
.otl-vacio{color:var(--muted);padding:18px 4px}
.otl-der{min-width:0;overflow-x:auto;padding:0 2px 24px}
.otl-cab{width:210mm;max-width:100%;margin:0 auto 8px;display:flex;flex-wrap:wrap;align-items:center;gap:8px;
  font-size:12.5px;color:var(--muted)}
.otl-cab b{color:var(--txt)}
.otl-cab .otl-botones{margin-left:auto;display:flex;gap:6px}
#otlHoja .orden-hoja{width:210mm;max-width:none;min-height:297mm;padding:14mm;box-sizing:border-box;margin:0 auto;
  border-radius:2px;box-shadow:0 1px 2px rgba(0,0,0,.10),0 10px 28px rgba(40,30,20,.10)}

/* pasos editables sobre la hoja: ＋/✕ en el margen izquierdo, al pasar el mouse */
.orden-hoja .ot-editable,.orden-hoja .ot-fijo{position:relative}
.orden-hoja textarea.ot-texto{flex:1 1 auto;min-width:0;font:inherit;color:inherit;background:transparent;
  border:1px dashed transparent;border-radius:3px;padding:0 3px;margin:-1px 0;resize:none;overflow:hidden;
  field-sizing:content;min-height:1.4em;line-height:1.35}
.orden-hoja .ot-dato.ot-editable{display:flex;align-items:baseline;gap:6px}
.orden-hoja .ot-dato.ot-editable textarea.ot-texto{flex:0 1 auto}
.orden-hoja .ot-editable:hover textarea.ot-texto{border-color:#ddd4c6;background:#fcfaf6}
.orden-hoja textarea.ot-texto:focus{outline:none;border-style:solid;border-color:#e08a2b;background:#fff}
.orden-hoja textarea.ot-texto::placeholder{color:#b3aa9e;font-style:italic}
.orden-hoja .ot-ctrl{position:absolute;left:-48px;top:1px;display:flex;gap:2px;opacity:0}
.orden-hoja .ot-fijo > .ot-ctrl{top:auto;bottom:0}
.orden-hoja .ot-editable:hover > .ot-ctrl,.orden-hoja .ot-fijo:hover > .ot-ctrl,.orden-hoja .ot-ctrl:focus-within{opacity:1}
.orden-hoja .ot-ctrl button{width:20px;height:20px;padding:0;border:none;border-radius:50%;background:transparent;
  color:#a39a8e;font-size:11px;line-height:20px;cursor:pointer}
.orden-hoja .ot-ctrl .ot-insertar:hover{background:#e6efe0;color:#2f6b2f}
.orden-hoja .ot-ctrl .ot-quitar:hover{background:#f3dcd9;color:#b3261e}
```

No hace falta CSS de impresión: la impresión arma la hoja de nuevo en `#otMovHoja` sin modo editable, y `printing-ot-mov` ya oculta todos los demás hijos de `#tab-movimientos` (incluidos `.mov-sub` y `#movOrdenes`).

- [ ] **Step 5: Correr toda la suite y el typecheck**

Run: `npm test` y `npx tsc --noEmit`
Expected: todo en verde (los módulos del navegador no los ve `tsc`, pero nada debe romperse).

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add public/lotes/js/vista-ot-lista.js public/lotes/js/vista-movimientos.js public/lotes/js/vista-ot-emitir.js public/lotes/index.html
git commit -m "feat(lotes): sub-pestaña Órdenes de trabajo con la hoja editable"
```

---

### Task 5: verificación en el navegador, merge y push

**Files:**
- Modify (no versionado): `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\.claude\launch.json` y copia en `<worktree>\.claude\launch.json`
- Copiar (no versionado): `repos\catenainstitute\.dev.vars` → `repos\catenainstitute-ot-editables\.dev.vars`

- [ ] **Step 1: Levantar el server del worktree**

Agregar a los dos `launch.json` la entrada:

```json
{
  "name": "lotes-ot-editables",
  "runtimeExecutable": "cmd",
  "runtimeArgs": ["/c", "cd /d C:\\Users\\Bmax\\repos\\catenainstitute-ot-editables && npx wrangler dev -c wrangler.dev.jsonc --port 8793 --local --persist-to C:\\Users\\Bmax\\repos\\catenainstitute\\.wrangler\\state"],
  "port": 8793
}
```

Copiar `.dev.vars`. `preview_start {name:"lotes-ot-editables"}` y abrir `http://localhost:8793/lotes/`.

- [ ] **Step 2: Sembrar datos si hace falta**

Si `GET /lotes/api/datos` no trae `ordenes_trabajo` ni lotes, sembrar con `curl` (bajar el doc a un archivo dentro del worktree, armar el payload con `node -e` sumando 2 lotes y ninguna OT, `POST /lotes/api/datos?forzar=1`), y borrar los temporales. Las OT se emiten por la UI en el paso siguiente.

- [ ] **Step 3: Recorrido**

Activar la pestaña con `document.querySelector('.tabs button[data-v="movimientos"]').click()` (los clics a secciones ocultas fallan callados). Verificar:
1. El selector aparece; *Historial* muestra la tabla de siempre.
2. ➕ Emitir OT (plantilla barricas→barricas, un lote, vasija manual) → al emitir cae en *Órdenes de trabajo* con esa OT elegida y su hoja A4; no aparece el diálogo de imprimir.
3. Editar el texto de un paso → "● Cambios sin guardar"; aparece ↺; el foco no se pierde al tipear.
4. ＋ debajo de un paso y debajo de una tabla → paso vacío nuevo con foco; ✕ quita un paso; las tablas no tienen ✕.
5. Guardar, recargar con `location.replace(url + '?v=' + Date.now())`: la OT conserva los textos.
6. ↺ Textos de la plantilla → confirm → vuelven los textos originales.
7. 🖨 Imprimir: el contenido de `#otMovHoja` (via `javascript_tool` tras stubear `window.print = () => {}`) trae el texto editado, sin `<textarea`, sin `ot-ctrl` y sin el paso vacío.
8. ✓ Confirmar la OT → queda "ejecutada", la hoja sin textarea ni ＋/✕, y con *Solo pendientes* desaparece de la lista.
9. En *Historial*, 🖨 de una fila de esa OT → abre la sub-pestaña con la OT elegida (y el filtro en todas).
10. `read_console_messages` sin errores. Captura de pantalla de la hoja editable como prueba.

Si algo falla: arreglar, `preview_stop` + `preview_start` (el server cachea JS), repetir.

- [ ] **Step 4: Merge a main y push (desde un worktree con main, no desde `repos\catenainstitute`)**

```bash
cd /c/Users/Bmax/repos/catenainstitute-ot-editables
git fetch origin && git rebase origin/main   # si main avanzo
npm test
git push -u origin feat/ot-editables
cd /c/Users/Bmax/repos && git worktree add catenainstitute-merge-ot origin/main --detach
cd catenainstitute-merge-ot && git merge --no-ff origin/feat/ot-editables -m "Merge: Órdenes de trabajo editables sobre la hoja"
git push origin HEAD:main
git merge-base --is-ancestor HEAD origin/main && echo OK
cd .. && git worktree remove catenainstitute-merge-ot
```

- [ ] **Step 5: Avisar al usuario**

Pedirle que publique desde `repos\catenainstitute` en `main` limpio y al día (`git status`, `git pull`), en `cmd.exe`: `cd /d C:\Users\Bmax\repos\catenainstitute` y `npx.cmd wrangler deploy`. Actualizar la memoria (nuevo archivo `lotes-ot-editables.md` + línea en `MEMORY.md`).
