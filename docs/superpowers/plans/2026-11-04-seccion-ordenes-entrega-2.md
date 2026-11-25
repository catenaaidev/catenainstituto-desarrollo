# Sección Órdenes de trabajo — Entrega 2 · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las tres órdenes de Lotes que hoy son "solo papel" pasan a **guardarse al imprimir** y a manejarse desde la sección **Órdenes de trabajo**: Orden de muestras (análisis), Orden de microbiología y Otros agregados. Quedan pendientes hasta **Marcar ejecutada**; también se pueden **anular**. Salen de sus lugares viejos.

**Architecture:** Igual que la entrega 1 (enfoque A): las órdenes se guardan en una sección nueva del documento de Lotes, `ordenes_hojas`. La lógica pura vive en `public/lotes/js/ordenes-hojas.js`. Los armadores siguen en `vista-orden.js` y `vista-agregados.js`, abiertos en **modo órdenes** (`/lotes/?orden=nueva:muestras|micro|agregados` o `?orden=<id>`). Una orden guardada se redibuja en el mismo contenedor de su armador (`#otPaginas` / `#agPaginas`), en solo lectura, así reusa las reglas de impresión que ya existen. El Worker suma `ordenes_hojas` al resumen de `/ordenes/api/lista`.

**Tech Stack:** Cloudflare Worker (TypeScript) + D1, front en ES modules sin build, vitest con `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-11-03-seccion-ordenes-de-trabajo-design.md` (sección "Datos" y "Entregas", punto 2)

**Base:** rama `feat/seccion-ordenes-2`, creada sobre `feat/seccion-ordenes` (entrega 1, PR #11 todavía sin mergear). El PR de esta entrega va contra `feat/seccion-ordenes` mientras #11 siga abierto.

## Global Constraints

- Worktree `C:\Users\Bmax\repos\catenainstitute-ordenes-2`, rama `feat/seccion-ordenes-2`. `node_modules` es una junction al repo principal y `worker-configuration.d.ts` ya está copiado. **No tocar `C:\Users\Bmax\repos\catenainstitute`** ni el worktree de la entrega 1.
- **Nunca pushear ni mergear.** Solo commits locales. Push a `main` = producción.
- Textos de UI en castellano rioplatense (vos). Sin `alert/confirm/prompt`: usar `avisar/confirmar` de `dialogos.js`.
- Estética "Piedra y tinta": solo tokens existentes, sin colores nuevos.
- **No agregar ni cambiar reglas `@media print`**: `test/lotes-papel-intacto` las congela. Para imprimir, reusar `printing-orden` (contenedor `#otPaginas` en `#tab-orden`) y `printing-agregados` (contenedor `#agPaginas` en `#tab-agregados`).
- `ordenes_hojas` usa la forma del spec:
  `{ id, tipo, ot, fecha, estado: 'pendiente'|'ejecutada'|'anulada', emitida_por, emitida_el, ejecutada_por, ejecutada_el, anulada, lotes:[{lote}], hoja:{…}, registro, pdf }`.
  `tipo` es `'muestras' | 'micro' | 'agregados'`.
- Series de número (carpeta OneDrive): muestras y micro → `principal`; agregados → `B`.
- **Lo anotado = lo impreso.** Al marcar ejecutada una orden de agregados se registran en `analisis[].agregados` exactamente las dosis guardadas al imprimir, sin recalcular ni releer el Mapa.
- `muestreos_barriles` (barriles sorteados) se sigue anotando **al imprimir**, como hoy: reserva los barriles para la próxima orden.
- Los mapas pegados en la Orden de muestras (imágenes) **no** se guardan en la orden (son dataURL pesadas). En la hoja guardada no aparecen.
- Tests: `npx vitest run <archivo>`, toda la suite `npx vitest run`, typecheck `npx tsc --noEmit`, sintaxis `node --check <archivo.js>`. Los avisos "EBUSY … temporary directory" de miniflare en Windows son ruido viejo.
- Commits con el trailer, en línea propia después de una línea en blanco: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `public/lotes/js/ordenes-hojas.js` (nuevo) | Puro: tipos, armar, guardar, buscar, marcar ejecutada, anular |
| `public/lotes/js/numero-ot.js` | `numerosWeb` cuenta `ordenes_hojas` |
| `public/lotes/js/deshacer.js` | `CLAVE_DE_SECCION.ordenes_hojas = 'id'` |
| `src/prensas/validacion.ts` | `ordenes_hojas` en `SECCIONES_LOTES` |
| `src/ordenes/resumen.ts` | `deHojas` en el resumen |
| `public/ordenes/js/catalogo.js` | Tipos `muestras`, `micro`, `agregados` |
| `public/lotes/js/modo-ordenes.js` | `hoja-nueva` / `ver-hoja` |
| `public/lotes/app.js` | `arrancarModoOrden` atiende los dos casos nuevos |
| `public/lotes/js/vista-orden.js` | Guarda al imprimir; abre una orden guardada en solo lectura |
| `public/lotes/js/vista-agregados.js` | Guarda al imprimir; abre la guardada; sin "Registrar" ni sub-pestaña Armar fuera del modo |
| `public/lotes/js/vista-orden-guardada.js` (nuevo) | Cabecera común de una orden guardada: estado + botones Marcar ejecutada / Anular / Reimprimir |
| `public/lotes/index.html` | Sin el botón "Orden de muestras" en Más |
| `public/lotes/js/vista-agenda.js` | "Armar orden" del día va al modo órdenes |
| tests | ver cada tarea |

---

### Task 1: Datos de las órdenes de papel (puro) + validación, deshacer y numeración

**Files:**
- Create: `public/lotes/js/ordenes-hojas.js`
- Modify: `public/lotes/js/numero-ot.js` (`numerosWeb`, ~línea 44)
- Modify: `public/lotes/js/deshacer.js` (`CLAVE_DE_SECCION`, ~línea 17)
- Modify: `src/prensas/validacion.ts` (`SECCIONES_LOTES.secciones` ~línea 43, y su comentario)
- Test: `test/lotes-ordenes-hojas.test.mjs` (nuevo), `test/lotes-numero-ot.test.mjs` (sumar casos), `test/validacion.test.ts` (sumar caso, copiando el de `ordenes_correccion` ~líneas 254-276)

**Interfaces:**
- Consumes: `registrarAgregados(analisis, { lote, fecha, items, ot, quien, cuando })` de `agregados.js` (puro, sin imports).
- Produces (todo exportado desde `ordenes-hojas.js`):
  - `TIPOS_HOJA`: `{ muestras:{nombre:'Orden de muestras', serie:'principal'}, micro:{nombre:'Orden de microbiología', serie:'principal'}, agregados:{nombre:'Otros agregados', serie:'B'} }`
  - `esTipoHoja(tipo): boolean`
  - `armarOrdenHoja({ id, tipo, numero, fecha, quien, ahora, lotes, hoja, registro = null })` → orden con `estado:'pendiente'`
  - `guardarOrdenHoja(datos, orden)` → `{ ok:true, reemplazo:boolean } | { ok:false, error:'ejecutada' }`
  - `ordenHojaPorId(datos, id)` → orden | null
  - `marcarEjecutada(datos, id, { quien, cuando })` → `{ ok:true } | { ok:false, error:'no-existe'|'no-pendiente' }`
  - `anularOrdenHoja(datos, id, { quien, cuando })` → mismo contrato

- [ ] **Step 1: Write the failing test**

```js
// test/lotes-ordenes-hojas.test.mjs
import { describe, it, expect } from 'vitest';
import { TIPOS_HOJA, esTipoHoja, armarOrdenHoja, guardarOrdenHoja, ordenHojaPorId,
         marcarEjecutada, anularOrdenHoja } from '../public/lotes/js/ordenes-hojas.js';

const base = (x = {}) => armarOrdenHoja({ id: 'oh-1', tipo: 'muestras', numero: ' 0950 ', fecha: '2026-11-04',
  quien: 'Ana', ahora: '2026-11-04T10:00:00Z', lotes: ['26034', '26034', '', 26038], hoja: { filas: [] }, ...x });

describe('armarOrdenHoja', () => {
  it('arma una orden pendiente con los lotes sin repetir', () => {
    expect(base()).toEqual({
      id: 'oh-1', tipo: 'muestras', ot: '0950', fecha: '2026-11-04', estado: 'pendiente',
      emitida_por: 'Ana', emitida_el: '2026-11-04T10:00:00Z', ejecutada_por: '', ejecutada_el: '',
      anulada: null, lotes: [{ lote: '26034' }, { lote: '26038' }], hoja: { filas: [] }, registro: null, pdf: null,
    });
  });
  it('los tipos y sus series', () => {
    expect(Object.keys(TIPOS_HOJA)).toEqual(['muestras', 'micro', 'agregados']);
    expect(TIPOS_HOJA.agregados.serie).toBe('B');
    expect(TIPOS_HOJA.micro.serie).toBe('principal');
    expect(esTipoHoja('micro')).toBe(true);
    expect(esTipoHoja('traslado')).toBe(false);
  });
});

describe('guardarOrdenHoja', () => {
  it('agrega la primera y crea la sección si falta', () => {
    const d = {};
    expect(guardarOrdenHoja(d, base())).toEqual({ ok: true, reemplazo: false });
    expect(d.ordenes_hojas).toHaveLength(1);
  });
  it('reimprimir el mismo tipo y N° pendiente la reemplaza, conservando el id', () => {
    const d = { ordenes_hojas: [base()] };
    const nueva = base({ id: 'oh-2', hoja: { filas: [1] } });
    expect(guardarOrdenHoja(d, nueva)).toEqual({ ok: true, reemplazo: true });
    expect(d.ordenes_hojas).toHaveLength(1);
    expect(d.ordenes_hojas[0].id).toBe('oh-1');
    expect(d.ordenes_hojas[0].hoja).toEqual({ filas: [1] });
  });
  it('el mismo N° de OTRO tipo es otra orden', () => {
    const d = { ordenes_hojas: [base()] };
    guardarOrdenHoja(d, base({ id: 'oh-2', tipo: 'micro' }));
    expect(d.ordenes_hojas).toHaveLength(2);
  });
  it('no pisa una ya ejecutada; una anulada no cuenta', () => {
    const d = { ordenes_hojas: [{ ...base(), estado: 'ejecutada' }] };
    expect(guardarOrdenHoja(d, base({ id: 'oh-2' }))).toEqual({ ok: false, error: 'ejecutada' });
    const d2 = { ordenes_hojas: [{ ...base(), estado: 'anulada' }] };
    expect(guardarOrdenHoja(d2, base({ id: 'oh-2' }))).toEqual({ ok: true, reemplazo: false });
    expect(d2.ordenes_hojas).toHaveLength(2);
  });
});

describe('marcarEjecutada', () => {
  it('cierra una pendiente con quién y cuándo', () => {
    const d = { ordenes_hojas: [base()] };
    expect(marcarEjecutada(d, 'oh-1', { quien: 'Luis', cuando: '2026-11-05T09:00:00Z' })).toEqual({ ok: true });
    expect(ordenHojaPorId(d, 'oh-1')).toMatchObject({ estado: 'ejecutada', ejecutada_por: 'Luis', ejecutada_el: '2026-11-05T09:00:00Z' });
  });
  it('una sola vez', () => {
    const d = { ordenes_hojas: [base()] };
    marcarEjecutada(d, 'oh-1', { quien: 'Luis', cuando: 'x' });
    expect(marcarEjecutada(d, 'oh-1', { quien: 'Luis', cuando: 'y' })).toEqual({ ok: false, error: 'no-pendiente' });
    expect(marcarEjecutada(d, 'nada', { quien: 'Luis', cuando: 'y' })).toEqual({ ok: false, error: 'no-existe' });
  });
  it('agregados: registra en análisis exactamente lo guardado al imprimir', () => {
    const registro = [{ lote: '26034', fecha: '2026-11-04',
      items: [{ producto: 'TH2', cantidad: 30, unidad: 'g', dosis_vasija: 10, litros_ref: 225, vasijas: 3 }] }];
    const d = { analisis: [], ordenes_hojas: [base({ tipo: 'agregados', numero: 'B250', registro })] };
    marcarEjecutada(d, 'oh-1', { quien: 'Luis', cuando: '2026-11-05T09:00:00Z' });
    const a = d.analisis.find((x) => x.lote === '26034');
    expect(a.agregados).toHaveLength(1);
    expect(a.agregados[0]).toMatchObject({ producto: 'TH2', cantidad: 30, unidad: 'g', ot_n: 'B250',
      registrado_por: 'Luis', dosis_vasija: 10, litros_ref: 225, vasijas: 3 });
  });
  it('muestras: no toca análisis', () => {
    const d = { analisis: [], ordenes_hojas: [base()] };
    marcarEjecutada(d, 'oh-1', { quien: 'Luis', cuando: 'x' });
    expect(d.analisis).toEqual([]);
  });
});

describe('anularOrdenHoja', () => {
  it('anula una pendiente (no se borra) y no registra nada', () => {
    const d = { analisis: [], ordenes_hojas: [base({ tipo: 'agregados', registro: [{ lote: '1', fecha: 'f', items: [{ producto: 'X', cantidad: 1, unidad: 'g' }] }] })] };
    expect(anularOrdenHoja(d, 'oh-1', { quien: 'Luis', cuando: 'z' })).toEqual({ ok: true });
    expect(ordenHojaPorId(d, 'oh-1')).toMatchObject({ estado: 'anulada', anulada: { por: 'Luis', en: 'z' } });
    expect(d.analisis).toEqual([]);
    expect(anularOrdenHoja(d, 'oh-1', { quien: 'Luis', cuando: 'z' })).toEqual({ ok: false, error: 'no-pendiente' });
  });
});
```

En `test/lotes-numero-ot.test.mjs` sumar:

```js
it('numerosWeb cuenta las órdenes de papel en su serie', () => {
  const d = { ordenes_hojas: [{ tipo: 'muestras', ot: '0951' }, { tipo: 'micro', ot: '0952' }, { tipo: 'agregados', ot: 'B251' }] };
  expect(numerosWeb(d, 'principal').sort()).toEqual(numerosWeb({ movimientos: [{ ot: '0951' }, { ot: '0952' }] }, 'principal').sort());
  expect(numerosWeb(d, 'B')).toEqual(numerosWeb({ ordenes_correccion: [{ numero: 'B251' }] }, 'B'));
});
```

(Si ese archivo importa `numerosWeb` con otro nombre o no lo importa, sumar el import.)

En `test/validacion.test.ts`, copiar el caso que acepta `ordenes_correccion` como lista y le aplica el freno de borrado masivo, cambiando la sección a `ordenes_hojas`.

- [ ] **Step 2: Run** → `npx vitest run test/lotes-ordenes-hojas.test.mjs test/lotes-numero-ot.test.mjs test/validacion.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```js
// public/lotes/js/ordenes-hojas.js
/* ===== Lotes CIW — órdenes de papel guardadas (puro) =====
 * Orden de muestras, de microbiología y de otros agregados: hasta la
 * entrega 2 de Órdenes de trabajo se imprimían y desaparecían. Ahora se
 * guardan AL IMPRIMIR en DATOS().ordenes_hojas, quedan pendientes y se cierran
 * con «Marcar ejecutada» (o se anulan). `hoja` es la foto de lo que salió en el
 * papel; `registro` (solo agregados) es lo que se anota en Análisis al
 * ejecutar, con las dosis del papel: nunca se recalcula. */
'use strict';

import { registrarAgregados } from './agregados.js';

export const TIPOS_HOJA = {
  muestras:  { nombre: 'Orden de muestras',      serie: 'principal' },
  micro:     { nombre: 'Orden de microbiología', serie: 'principal' },
  agregados: { nombre: 'Otros agregados',        serie: 'B' },
};

export const esTipoHoja = tipo => Object.prototype.hasOwnProperty.call(TIPOS_HOJA, tipo);

const txt = v => (v == null ? '' : String(v).trim());

export function armarOrdenHoja({ id, tipo, numero, fecha, quien, ahora, lotes, hoja, registro = null }){
  const vistos = [...new Set((lotes || []).map(txt).filter(Boolean))];
  return { id, tipo, ot: txt(numero), fecha: txt(fecha), estado: 'pendiente',
           emitida_por: quien || '', emitida_el: ahora || '', ejecutada_por: '', ejecutada_el: '',
           anulada: null, lotes: vistos.map(lote => ({ lote })), hoja: hoja || {}, registro, pdf: null };
}

export const ordenHojaPorId = (datos, id) =>
  ((datos && datos.ordenes_hojas) || []).find(o => o && o.id === id) || null;

/* Reimprimir la misma orden (mismo tipo y N°) mientras está pendiente la
 * reemplaza: el papel nuevo es el que vale. Una ejecutada no se pisa; una
 * anulada ya no cuenta. */
export function guardarOrdenHoja(datos, orden){
  if (!Array.isArray(datos.ordenes_hojas)) datos.ordenes_hojas = [];
  const lista = datos.ordenes_hojas;
  const previa = lista.find(o => o && o.tipo === orden.tipo && o.ot === orden.ot && o.estado !== 'anulada');
  if (previa && previa.estado === 'ejecutada') return { ok: false, error: 'ejecutada' };
  if (previa){
    lista[lista.indexOf(previa)] = { ...orden, id: previa.id };
    return { ok: true, reemplazo: true };
  }
  lista.push(orden);
  return { ok: true, reemplazo: false };
}

function _pendiente(datos, id){
  const o = ordenHojaPorId(datos, id);
  if (!o) return { error: 'no-existe' };
  if (o.estado !== 'pendiente') return { error: 'no-pendiente' };
  return { o };
}

export function marcarEjecutada(datos, id, { quien, cuando }){
  const { o, error } = _pendiente(datos, id);
  if (error) return { ok: false, error };
  if (o.tipo === 'agregados' && Array.isArray(o.registro)){
    if (!Array.isArray(datos.analisis)) datos.analisis = [];
    for (const r of o.registro)
      registrarAgregados(datos.analisis, { lote: r.lote, fecha: r.fecha, items: r.items, ot: o.ot, quien, cuando });
  }
  o.estado = 'ejecutada';
  o.ejecutada_por = quien || '';
  o.ejecutada_el = cuando || '';
  return { ok: true };
}

export function anularOrdenHoja(datos, id, { quien, cuando }){
  const { o, error } = _pendiente(datos, id);
  if (error) return { ok: false, error };
  o.estado = 'anulada';
  o.anulada = { por: quien || '', en: cuando || '' };
  return { ok: true };
}
```

`numero-ot.js`, en `numerosWeb`: dentro de la rama `serie === 'B'`, después de `ordenes_correccion`:
```js
    for (const o of d.ordenes_hojas || []) if (o && o.tipo === 'agregados') ver(o.ot);
```
y en la rama principal (el `else`):
```js
    for (const o of d.ordenes_hojas || []) if (o && o.tipo !== 'agregados') ver(o.ot);
```
(Inline a propósito: importar `TIPOS_HOJA` cerraría un ciclo innecesario. Comentario de una línea: "Las órdenes de papel guardadas también reservan su número (agregados → B).")

`deshacer.js`: sumar `ordenes_hojas: 'id',` en `CLAVE_DE_SECCION`.

`validacion.ts`: sumar `'ordenes_hojas'` a `SECCIONES_LOTES.secciones` (no a `requeridas`) y una línea en el comentario de arriba.

- [ ] **Step 4: Run** → los tres archivos de test → PASS. Después `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(lotes): órdenes de papel guardadas (ordenes_hojas): armar, guardar, ejecutar y anular`

---

### Task 2: Resumen, catálogo y modo órdenes conocen los tipos nuevos (puro)

**Files:**
- Modify: `src/ordenes/resumen.ts` (tipo `fuente`, `deHojas`, `resumenOrdenes`)
- Modify: `public/ordenes/js/catalogo.js` (`TIPOS`)
- Modify: `public/lotes/js/modo-ordenes.js` (`destinoDeModo`, `tituloModo`)
- Test: `test/ordenes-resumen.test.ts`, `test/ordenes-catalogo.test.mjs`, `test/lotes-modo-ordenes.test.mjs`

**Interfaces:**
- Consumes: `TIPOS_HOJA`, `esTipoHoja`, `ordenHojaPorId` (Task 1).
- Produces:
  - `ResumenOrden.fuente` suma `'ordenes_hojas'`; `tipo` es `muestras|micro|agregados`.
  - `TIPOS` suma `{id:'muestras'}`, `{id:'micro'}`, `{id:'agregados'}` (modulo `'lotes'`).
  - `destinoDeModo`:
    - `{nueva:'muestras'|'micro'|'agregados'}` → `{ accion:'hoja-nueva', tipo }`
    - `{id}` de `ordenes_hojas` → `{ accion:'ver-hoja', id, tipo }`, después de buscar en `ordenes_trabajo` y `ordenes_correccion`.
  - `tituloModo`:
    - `hoja-nueva` → `'Nueva · <TIPOS_HOJA[tipo].nombre>'`
    - `ver-hoja` → `'<ot|—> · <nombre> · <estado|—>'`, o `'Orden no encontrada'` si no existe.

- [ ] **Step 1: Tests**

`test/ordenes-resumen.test.ts`, caso nuevo:
```ts
it('resume las órdenes de papel guardadas', () => {
  const r = resumenOrdenes('lotes', { ordenes_hojas: [
    { id: 'oh-1', tipo: 'muestras', ot: '0950', fecha: '2026-11-04', estado: 'pendiente', emitida_por: 'Ana', lotes: [{ lote: '26034' }] },
    { id: 'oh-2', tipo: 'agregados', ot: 'B250', fecha: '2026-11-03', estado: 'anulada', emitida_por: 'Luis', lotes: [] },
    { id: 'oh-3', tipo: 'micro', ot: '0951', fecha: '2026-11-02', estado: 'raro', lotes: [] },
  ] });
  expect(r.map((o) => [o.id, o.fuente, o.tipo, o.numero, o.estado, o.emitio])).toEqual([
    ['oh-1', 'ordenes_hojas', 'muestras', '0950', 'pendiente', 'Ana'],
    ['oh-2', 'ordenes_hojas', 'agregados', 'B250', 'anulada', 'Luis'],
    ['oh-3', 'ordenes_hojas', 'micro', '0951', 'ejecutada', ''],
  ]);
  expect(r[0].lotes).toEqual(['26034']);
});
```

`test/ordenes-catalogo.test.mjs`:
- Cambiar la sincronía a `[...PLANTILLAS_OT.map((p) => p.id), 'correccion', 'muestras', 'micro', 'agregados'].sort()`.
- Sumar:
```js
it('los nombres de las órdenes de papel son los de Lotes', async () => {
  const { TIPOS_HOJA } = await import('../public/lotes/js/ordenes-hojas.js');
  for (const [id, t] of Object.entries(TIPOS_HOJA)) expect(nombreDeTipo(id)).toBe(t.nombre);
});
it('encuentra las órdenes de papel por sinónimo', () => {
  expect(buscarTipos('laboratorio', ['lotes']).map((t) => t.id)).toEqual(['muestras', 'micro']);
  expect(buscarTipos('cartel caja', ['lotes']).map((t) => t.id)).toEqual(['micro']);
  expect(buscarTipos('th2', ['lotes']).map((t) => t.id)).toEqual(['agregados']);
});
```
- Los casos viejos (`so2` → solo `correccion`, `mezcla`, `trasiego tq`) tienen que seguir pasando. Si un sinónimo nuevo los rompe, se cambia el sinónimo, no el test.

`test/lotes-modo-ordenes.test.mjs`, sumar al dato `D` `ordenes_hojas: [{ id: 'oh-1', tipo: 'agregados', ot: 'B250', estado: 'pendiente' }]` y casos:
```js
it('nueva orden de papel', () => {
  expect(destinoDeModo({ nueva: 'muestras' }, D)).toEqual({ accion: 'hoja-nueva', tipo: 'muestras' });
  expect(tituloModo({ accion: 'hoja-nueva', tipo: 'micro' }, D)).toBe('Nueva · Orden de microbiología');
});
it('una orden de papel guardada', () => {
  expect(destinoDeModo({ id: 'oh-1' }, D)).toEqual({ accion: 'ver-hoja', id: 'oh-1', tipo: 'agregados' });
  expect(tituloModo({ accion: 'ver-hoja', id: 'oh-1' }, D)).toBe('B250 · Otros agregados · pendiente');
  expect(tituloModo({ accion: 'ver-hoja', id: 'nada' }, D)).toBe('Orden no encontrada');
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`resumen.ts`: ampliar el tipo de `fuente` y sumar
```ts
function deHojas(datos: Fila): ResumenOrden[] {
  return filas(datos.ordenes_hojas).map((o) => {
    const e = txt(o.estado);
    return {
      modulo: 'lotes' as const, id: txt(o.id), fuente: 'ordenes_hojas' as const, tipo: txt(o.tipo),
      numero: txt(o.ot), fecha: txt(o.fecha),
      estado: (e === 'pendiente' || e === 'anulada' ? e : 'ejecutada') as EstadoOrden,
      lotes: lotesDe(o), lote_corte: '', emitio: txt(o.emitida_por),
    };
  });
}
```
Concatenarlo en `resumenOrdenes` junto a `deTrabajo` y `deCorreccion`.

`catalogo.js`: al final de `TIPOS` (después de `correccion`):
```js
  { id: 'muestras', modulo: 'lotes', nombre: 'Orden de muestras',
    desc: 'Muestras de lotes para el laboratorio y la degustación.',
    sinonimos: ['muestras', 'analisis', 'laboratorio', 'lab', 'degustacion', 'muestreo', 'barriles'] },
  { id: 'micro', modulo: 'lotes', nombre: 'Orden de microbiología',
    desc: 'Muestras para microbiología, con el cartel de la caja.',
    sinonimos: ['microbiologia', 'micro', 'laboratorio', 'cartel', 'caja', 'brett'] },
  { id: 'agregados', modulo: 'lotes', nombre: 'Otros agregados',
    desc: 'TH2, quitosano, levadura y otros productos por vasija.',
    sinonimos: ['agregados', 'agregado', 'th2', 'tanino', 'quitosano', 'levadura', 'nutriente', 'producto'] },
```
Ojo: `correccion` ya tiene el sinónimo `agregado`, así que `buscarTipos('agregado')` va a traer las dos. Está bien, el test nuevo usa `th2`.

`modo-ordenes.js`: importar `TIPOS_HOJA, esTipoHoja` de `./ordenes-hojas.js`.
- En `destinoDeModo`, rama `nueva`: antes de `PLANTILLAS_OT`, `if (esTipoHoja(modo.nueva)) return { accion: 'hoja-nueva', tipo: modo.nueva };`.
- Rama `id`: después de `ordenes_correccion`, buscar en `ordenes_hojas` y devolver `{ accion:'ver-hoja', id, tipo: o.tipo }`.
- En `tituloModo`, las dos ramas que se describen en Interfaces.

- [ ] **Step 4: Run** → PASS. `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(ordenes): las órdenes de papel aparecen en la lista, el catálogo y el modo órdenes`

---

### Task 3: Cabecera común de una orden guardada

**Files:**
- Create: `public/lotes/js/vista-orden-guardada.js`
- Test: `test/lotes-orden-guardada-cabecera.test.mjs` (solo la parte pura: `htmlCabeceraOrden`)

**Interfaces:**
- Consumes: `ordenHojaPorId`, `marcarEjecutada`, `anularOrdenHoja`, `TIPOS_HOJA` (Task 1); `DATOS, markDirty, guardar, usuarioActual, esc, escA` de `nucleo.js`; `avisar, confirmar` de `dialogos.js`; `fmtFecha` de `fechas.js`.
- Produces:
  - `htmlCabeceraOrden(orden, { puedeEditar })`, puro. Devuelve el HTML de la cabecera:
    - `<div class="oh-guardada" data-orden="<id>">`
    - estado: `⏳ Pendiente` / `✔ Ejecutada por X el dd/mm/aaaa` / `✕ Anulada por X el dd/mm/aaaa`
    - botones, cada uno con su `data-oha="ejecutar|anular|reimprimir"`:
      - `✔ Marcar ejecutada` (`btn primary`) y `Anular` (`btn`), solo si está pendiente y `puedeEditar`;
      - `🖨 Reimprimir` (`btn`), siempre.
    - Si es de tipo agregados y está pendiente, una línea en `--muted`: "Al marcarla ejecutada se anotan en Análisis las dosis de este papel."
  - `cablearCabeceraOrden(cont, id, { reimprimir, alCambiar })`. Cablea los clics:
    - **ejecutar:** `confirmar({titulo:'Marcar ejecutada <ot>', …})` → `marcarEjecutada(DATOS(), id, {quien: usuarioActual(), cuando: new Date().toISOString()})` → `markDirty()` → `await guardar(false)` → `avisar('✓ <ot> ejecutada', {tipo:'ok'})` → `alCambiar()` → `document.dispatchEvent(new CustomEvent('lotes:modo-orden-cambio'))`.
    - **anular:** igual con `anularOrdenHoja` y `peligro:true`.
    - **reimprimir:** `reimprimir()`.
    - Antes de ejecutar o anular, comparar la versión local con la del servidor (`/lotes/api/version`), como hace `vista-ordenes-correccion.js` en `_confirmar`/`_anular` (leer cómo lo hace y copiar el mismo chequeo). Si otra PC guardó, frenar con el aviso "Otra persona guardó cambios: recargá antes de ejecutar."

- [ ] **Step 1: Test** de `htmlCabeceraOrden`:
  - pendiente + `puedeEditar` → tiene `data-oha="ejecutar"`, `data-oha="anular"` y `data-oha="reimprimir"`;
  - pendiente sin `puedeEditar` → solo reimprimir;
  - ejecutada → texto "Ejecutada por Luis" y sin `data-oha="ejecutar"`;
  - el `ot` y los nombres pasan por `esc` (`'<b>'` no aparece crudo);
  - agregados pendiente → tiene "se anotan en Análisis".
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, `node --check`.
- [ ] **Step 5: Commit** — `feat(lotes): cabecera de una orden de papel guardada (ejecutar, anular, reimprimir)`

---

### Task 4: Orden de muestras y de microbiología se guardan y se reabren

**Files:**
- Modify: `public/lotes/js/vista-orden.js`
- Modify: `public/lotes/app.js` (`arrancarModoOrden`: `hoja-nueva` muestras/micro y `ver-hoja` de esos tipos)
- Test: `test/lotes-orden-guardar.test.mjs` (pura: `fotoOrdenMuestras`)

**Interfaces:**
- Consumes: Task 1 (`armarOrdenHoja`, `guardarOrdenHoja`, `ordenHojaPorId`), Task 3 (`htmlCabeceraOrden`, `cablearCabeceraOrden`), `pintarHojas`, `cfgHojasAnalisis`, `cfgHojasMicro`, `imprimirYGuardar`.
- Produces (exports de `vista-orden.js`):
  - `fotoOrdenMuestras({ tipo, titulo, hoja, filas, textosMicro, conBarril })`, pura. Devuelve la `hoja` a guardar:
    - muestras: `{ titulo, fecha, dia, nro, emitio, recibio, conBarril, filas:[{lote, variedad, vasija, barril, cantidad, recipiente}] }`
    - micro: `{ titulo, fecha, dia, nro, emitio, recibio, filas:[{lote, vasija}], textos:{…} }`
    - Solo filas con `lote` o `vasija` no vacíos. Se aplica a `_otRows` ya filtradas, las mismas que pinta el papel.
  - `abrirOrdenMuestrasNueva(tipo)` con `tipo` `'muestras'|'micro'`: `mostrarTab('orden')` con `_otTipo` puesto (`'analisis'` para muestras).
  - `abrirOrdenMuestrasGuardada(id)`: muestra la orden guardada en solo lectura.

**Qué hacer:**
1. **Guardar al imprimir.** En el listener de `#btnOtImprimir`, cuando `r.ok`, después de `_otRegistrarMuestreo()` (análisis) o en su lugar (micro):
   - armar la orden con `armarOrdenHoja`:
     - `id: 'oh-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)`
     - `tipo: _esMicro() ? 'micro' : 'muestras'`, `numero: _otHoja.nro`, `fecha: _otHoja.fecha || hoyLocalISO()`
     - `quien: usuarioActual()`, `ahora: new Date().toISOString()`
     - `lotes` sale de las filas y `hoja: fotoOrdenMuestras(...)`
   - sumarle `pdf: { nombre: r.nombre, estado: r.guardado }`;
   - `guardarOrdenHoja(DATOS(), orden)`. Si da `error:'ejecutada'`: `avisar('La orden <nro> ya está ejecutada: esta impresión no se guardó como orden nueva.', {tipo:'mal'})`. Si sale bien: `markDirty()` y `await guardar()`.
   - En modo órdenes (`document.body.classList.contains('modo-ordenes')`): `history.replaceState` a `?orden=<id>` conservando `volver`, `abrirOrdenMuestrasGuardada(id)` y despachar `lotes:modo-orden-cambio`. Copiar el patrón de `_ocGuardarOrden` en `vista-orden-correccion.js`, que hace lo mismo para la corrección.
   - Fuera del modo: `_otAvisar('✓ La orden <nro> quedó pendiente en Órdenes de trabajo.', 'ok')`.
   - Que `_otRegistrarMuestreo` y el guardado de la orden terminen en **un solo** `guardar()`: armar las dos cosas y guardar una vez.
2. **Abrir guardada (solo lectura).** Estado de módulo `_guardada = null` (id).
   - Con `_guardada`, `renderOrden()` pinta en `#tab-orden`:
     - la cabecera (`htmlCabeceraOrden(o, {puedeEditar: rol editor/admin de window.CIW})`);
     - un contenedor `#otPaginas` con `pintarHojas(...)`, armado desde `o.hoja` con `cfgHojasAnalisis` / `cfgHojasMicro` igual que `_otPintarPaginas`, pero con `editable:false`.
   - Como `renderFila` emite `<input>`, después de pintar se hace `#otPaginas input, #otPaginas textarea → disabled = true` y se esconden `.oh-quitar`, `.oh-agregar` y `.oh-dado` con `hidden`. El panel `.ot-izq` (controles) no se pinta.
   - `reimprimir` = `document.body.classList.add('printing-orden'); window.print(); remove`. Solo papel, sin volver a guardar el PDF ni pedir número. Reusar `ajustarHojasA4`/`soltarHojasA4` si `imprimirYGuardar` los usa (mirar `guardar-ot.js`).
   - `alCambiar` = `renderOrden()`.
3. **Modo órdenes en `app.js`:**
   - `hoja-nueva` con `tipo` muestras/micro → `abrirOrdenMuestrasNueva(tipo)`. Si la URL trae `lotes=a,b` (la Agenda, Task 6), después llamar `precargarOrden(lotes)`.
   - `ver-hoja` con tipo muestras/micro → `abrirOrdenMuestrasGuardada(id)`.
   - Mantener el `try/finally` que saca `modo-ordenes-cargando`.

- [ ] **Step 1: Test** de `fotoOrdenMuestras` (análisis: arma las filas con los 6 campos y descarta las vacías; micro: filas `{lote, vasija}` + textos). **Step 2: RED. Step 3: Implement. Step 4:** el test + `test/lotes-orden-*.test.mjs` + `test/lotes-sorteo-barriles.test.mjs` + `test/lotes-fechas.test.mjs` → PASS; `node --check` de los dos .js.
- [ ] **Step 5: Commit** — `feat(lotes): la Orden de muestras y la de microbiología se guardan al imprimir y se reabren`

---

### Task 5: Otros agregados se guardan, y se registran al marcarlos ejecutados

**Files:**
- Modify: `public/lotes/js/vista-agregados.js`
- Modify: `public/lotes/app.js` (`hoja-nueva` agregados, `ver-hoja` agregados)
- Test: `test/lotes-agregados-orden.test.mjs` (pura: `registroDeTarjetas`)

**Interfaces:**
- Consumes: Task 1, Task 3. Funciones existentes de `agregados.js`: `filasPapelAgregados`, `litrosReferencia`, `totalLote`, `vasijasDeLote`.
- Produces (exports de `vista-agregados.js`):
  - `registroDeTarjetas(tarjetas, vasijasDe, fecha)`, pura. Devuelve `[{lote, fecha, items}]` con la **misma** agrupación y cuentas que `_registrar` hace hoy (líneas ~398-405): tarjetas del mismo lote juntas, y cada ítem como `{...it, cantidad: totalLote(it.cantidad, vas, ref), dosis_vasija: it.cantidad, litros_ref: ref, vasijas: vas.length}`. Recibe `vasijasDe` como función para poder testear sin el Mapa.
  - `abrirAgregadosNueva()`: `_sub = 'armar'`, `mostrarTab('agregados')`.
  - `abrirAgregadosGuardada(id)`.

**Qué hacer:**
1. **Extraer `registroDeTarjetas`** del cuerpo de `_registrar` y hacer que `_registrar` la use. Nada cambia mientras siga existiendo.
2. **Guardar al imprimir.** En `_imprimir`, cuando `r.ok`:
   - congelar las vasijas: `vasijasPorTarjeta = Object.fromEntries(tarjetas.map(t => [t.id, _vasijasDe(t)]))`, por id de tarjeta, porque `_vasijasDe` depende de `t.vasija`;
   - `hoja = { fecha, ot, emitio, recibio, tarjetas: structuredClone(_tarjetasValidas().map(x => x.t)), vasijasPorTarjeta }`;
   - `registro = registroDeTarjetas(tarjetas, t => vasijasPorTarjeta[t.id], fecha)`;
   - `armarOrdenHoja({ tipo: 'agregados', numero: normalizarNumero(_b.ot, 'B'), … , registro })` + `pdf`;
   - `guardarOrdenHoja` → `markDirty()` → `await guardar()`;
   - en modo órdenes, lo mismo que la Task 4 (replaceState, abrir la guardada, evento);
   - mensaje fuera del modo: `✓ La orden <ot> quedó pendiente en Órdenes de trabajo. Al marcarla ejecutada se anotan los agregados en Análisis.`
3. **Sacar "Registrar".** El botón `Registrar` de la sub-vista Armar y `_registrar` se van. Registrar pasa a ser **Marcar ejecutada** de la orden guardada. Borrar `_registrar` si queda sin uso; `registroDeTarjetas` se queda.
4. **Sub-pestañas.**
   - Fuera del modo, `_selector()` no ofrece "Armar orden": `#tab-agregados` muestra solo la Bitácora. Si `_sub` arranca en `'armar'`, pasar el valor por defecto a `'bitacora'`.
   - En modo órdenes (`abrirAgregadosNueva`), sin selector, solo Armar.
   - Leer `renderAgregados` y `_selector` y dejar el mismo patrón `_unica` que se usó en `vista-movimientos.js` en la entrega 1.
5. **Abrir guardada (solo lectura).** Con `_guardada`, `renderAgregados()` pinta:
   - la cabecera (Task 3);
   - `#agPaginas` **visible**, con `pintarHojas(...)` armado igual que `_imprimir` pero desde `o.hoja`: `filasPapelAgregados(o.hoja.tarjetas, t => o.hoja.vasijasPorTarjeta[t.id])`, `meta`, `banda`, `emitio`, `recibio`, `COLGROUP_PAPEL_AG`, `THEAD_PAPEL_AG`.
   - `reimprimir` = clase `printing-agregados` + `window.print()`, solo papel.
   - Mirar en `index.html` (~848-856) qué muestra `printing-agregados`. Si `#agPaginas` está oculto en pantalla con un estilo inline, mostrarlo en solo lectura **sin** tocar las reglas de impresión.
6. **`app.js`:** `hoja-nueva` agregados → `abrirAgregadosNueva()`; `ver-hoja` agregados → `abrirAgregadosGuardada(id)`.

- [ ] **Step 1: Test** de `registroDeTarjetas`:
  - dos tarjetas del mismo lote → un solo `{lote}` con los ítems de las dos;
  - una tarjeta con 3 vasijas de 225 y dosis 10 g → `cantidad 30, dosis_vasija 10, litros_ref 225, vasijas 3`;
  - lote con espacios → recortado;
  - la `fecha` llega a cada entrada.
  - Comparar contra lo que da `totalLote`/`litrosReferencia` para no duplicar la fórmula en el test.
- [ ] **Step 2: RED. Step 3: Implement. Step 4:** el test + `test/lotes-agregados.test.mjs` + `test/lotes-ordenes-hojas.test.mjs` → PASS; `node --check`.
- [ ] **Step 5: Commit** — `feat(lotes): Otros agregados se guarda al imprimir y se registra en Análisis al marcarla ejecutada`

---

### Task 6: Sacar los lugares viejos y apuntar la Agenda al modo órdenes

**Files:**
- Modify: `public/lotes/index.html`: borrar `<button type="button" data-v="orden">Orden de muestras</button>` del menú Más (~línea 1717). La `<section id="tab-orden">` y `registrarVista('orden', …)` **se quedan**, porque el modo órdenes las usa.
- Modify: `public/lotes/js/vista-agenda.js` (~línea 371). El botón del día que hoy hace `precargarOrden(lotes)` pasa a navegar a
  `'/lotes/?orden=' + encodeURIComponent('nueva:muestras') + '&lotes=' + encodeURIComponent(lotes.join(',')) + '&volver=' + encodeURIComponent('/ordenes/?v=pendientes')`.
  Antes, `_cerrarDialogo()`, como ya hace.
- Modify: `test/lotes-barra.test.ts` (~línea 28): sacar `'orden'` de la lista esperada de Más.
- Test: `test/ordenes-sacadas-de-lotes.test.ts`, casos nuevos:
  - el menú Más ya no tiene `data-v="orden"`;
  - `vista-agenda.js` no llama `precargarOrden(` y sí contiene `nueva:muestras`;
  - `vista-agregados.js` ya no tiene el botón Registrar: buscar su id real en el código antes de escribir el test;
  - `#corrSub` **sigue** teniendo `data-sub="agregados"`, porque la Bitácora se queda.

- [ ] **Step 1:** tests (RED). **Step 2:** implementar. **Step 3:** suite completa `npx vitest run` + `npx tsc --noEmit`. Si un test viejo codificaba la UI vieja, actualizarlo y decirlo en el commit.
- [ ] **Step 4: Commit** — `feat(lotes): Orden de muestras y Armar agregados salen de Lotes; la Agenda arma la orden en Órdenes de trabajo`

---

### Task 7: Verificación en el navegador (la hace el controlador)

Servidor de prueba: copiar `mock-ordenes.mjs` de la entrega 1, apuntando al worktree nuevo y en el puerto **8852**, y sumar la entrada `ordenes-seccion-2` al `launch.json` de `Escritorio\claude`. El mock tiene que resumir también `ordenes_hojas`.

Recorrido:
1. `/ordenes/` → Nueva orden → "laboratorio" → Orden de muestras. Se abre el armador en modo órdenes, sin la barra de Lotes.
2. Pegar dos lotes e imprimir. La orden queda guardada, la URL pasa a `?orden=oh-…` y se ve en solo lectura con Marcar ejecutada / Anular / Reimprimir.
3. Pendientes la lista. Marcar ejecutada la pasa a Historial y la banda se actualiza.
4. Microbiología: lo mismo, y el cartel de la caja sale en la hoja guardada.
5. Otros agregados: armar con un lote de 3 barricas e imprimir. Queda pendiente y en Análisis todavía no hay nada. Marcar ejecutada → en Análisis aparece el agregado con el N° B y las dosis del papel.
6. Anular una orden de agregados: no anota nada.
7. Lotes normal:
   - Más sin "Orden de muestras";
   - Correcciones → Otros agregados con solo la Bitácora;
   - la Agenda "Armar orden" del día lleva a `/lotes/?orden=nueva:muestras&lotes=…` con los lotes cargados.
8. Celular: la hoja guardada se scrollea dentro de su recuadro.
9. Consola sin errores propios.
