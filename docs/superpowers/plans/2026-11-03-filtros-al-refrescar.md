# Filtros al refrescar + sin salto al tablero: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el F5 no muestre el tablero antes de la pantalla de la URL, y que los filtros de cada pantalla (embudos, buscadores, selectores, orden) sobrevivan al F5 dentro de la misma pestaña del navegador.

**Architecture:** hay una pieza común nueva, `public/shared/filtros-sesion.js` (`window.CIWFiltros`), sobre `sessionStorage`. Los embudos usan un `Set` que se guarda solo (`CIWFiltros.set(clave)`), así que los widgets que ya modifican el Set no cambian. Los escalares (buscador, mes, orden) se leen al iniciar cada vista y se guardan en su handler. El salto se evita desde `public/shared/pantalla-url.js`: oculta lo activo hasta que la app avisa con `CIWPantalla.restaurada()`.

**Tech Stack:** JS del navegador sin build (módulos ES en Lotes, scripts clásicos en Prensas y Barriles), Worker de Cloudflare (`src/index.ts`) y vitest con `@cloudflare/vitest-pool-workers` (sin DOM ni `sessionStorage` en los tests).

**Spec:** `docs/superpowers/specs/2026-11-03-filtros-al-refrescar-design.md`

## Global Constraints

- Almacenamiento: **solo `sessionStorage`**, con claves `ciw_filtros:<modulo>:<pantalla>:<cosa>`. Nunca `localStorage` para filtros.
- Todo acceso al storage va en try/catch. Sin storage, la app funciona igual que hoy.
- Un valor guardado de un embudo que ya no está entre las opciones se descarta en el primer armado de la lista (`podar`).
- Cada botón **Limpiar filtros** deja la pantalla limpia también después de un F5.
- No se tocan los anchos de columna, el scroll ni los datos.
- Los comentarios del código van en español, con la densidad del código de alrededor.
- Los tests: `npx vitest run <archivo>`. Suite completa: `npx vitest run`, que tiene que dar todo verde.
- Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: `shared/filtros-sesion.js` + inyección

**Files:**
- Create: `public/shared/filtros-sesion.js`
- Create: `test/filtros-sesion.test.mjs`
- Modify: `src/index.ts` (en `armarInyeccion`, después de `pantalla-url.js`)
- Modify: `test/inyeccion.test.ts`

**Interfaces:**
- Produces: `window.CIWFiltros` con:
  - `leer(clave, porDefecto)` → el valor guardado o `porDefecto`.
  - `guardar(clave, valor)`.
  - `borrar(prefijo)`: borra todas las claves que empiezan con `prefijo`.
  - `set(clave)` → una instancia de `SetSesion` (subclase de `Set`) que guarda sola en cada `add`, `delete` y `clear`. Tiene `.podar(validos: Set)`, que la primera vez después de restaurar descarta los valores que no están en `validos`.
  - `_usarStorage(obj)`: solo para tests. Recibe un objeto con `getItem`, `setItem`, `removeItem`, `key(i)` y `length`.

- [ ] **Step 1: test que falla**

```js
/** Filtros en la sesión de la pestaña (shared/filtros-sesion.js). Va en .mjs:
 *  importa un .js clásico sin tipos. */
import { describe, it, expect, beforeEach } from 'vitest';
import '../public/shared/filtros-sesion.js';
const F = globalThis.CIWFiltros;

function storageDeMentira(){
  const m = new Map();
  return { getItem:k => m.has(k) ? m.get(k) : null, setItem:(k,v) => m.set(k, String(v)),
    removeItem:k => m.delete(k), key:i => [...m.keys()][i] ?? null, get length(){ return m.size; }, m };
}
const tick = () => new Promise(r => queueMicrotask(r));
let st;
beforeEach(() => { st = storageDeMentira(); F._usarStorage(st); });

describe('CIWFiltros', () => {
  it('leer/guardar ida y vuelta, con prefijo propio', () => {
    expect(F.leer('lotes:analisis:mes', '')).toBe('');
    F.guardar('lotes:analisis:mes', '2026-10');
    expect(F.leer('lotes:analisis:mes', '')).toBe('2026-10');
    expect(st.m.has('ciw_filtros:lotes:analisis:mes')).toBe(true);
  });
  it('borrar por prefijo no toca otras pantallas', () => {
    F.guardar('lotes:analisis:mes', 'x'); F.guardar('lotes:analisis:busca', 'y'); F.guardar('lotes:lotes:busca', 'z');
    F.borrar('lotes:analisis:');
    expect(F.leer('lotes:analisis:mes', null)).toBe(null);
    expect(F.leer('lotes:lotes:busca', null)).toBe('z');
  });
  it('el Set se guarda solo y se restaura', async () => {
    const s = F.set('lotes:lotes:f:variedad');
    s.add('Malbec'); s.add('Pinot Noir'); s.delete('Pinot Noir');
    await tick();
    const otro = F.set('lotes:lotes:f:variedad');
    expect([...otro]).toEqual(['Malbec']);
    otro.clear(); await tick();
    expect([...F.set('lotes:lotes:f:variedad')]).toEqual([]);
  });
  it('podar descarta valores fantasma solo la primera vez', async () => {
    F.guardar('k', ['a', 'b']);
    const s = F.set('k');
    s.podar(new Set(['a']));
    expect([...s]).toEqual(['a']);
    s.add('zz'); s.podar(new Set(['a']));   // ya no poda: lo eligió el usuario ahora
    expect([...s]).toEqual(['a', 'zz']);
    await tick();
    expect(F.leer('k')).toEqual(['a', 'zz']);
  });
  it('sin storage (o roto) no se rompe nada', () => {
    F._usarStorage({ getItem(){ throw new Error('x'); }, setItem(){ throw new Error('x'); }, removeItem(){}, key(){ return null; }, length:0 });
    expect(F.leer('a', 7)).toBe(7);
    expect(() => F.guardar('a', 1)).not.toThrow();
    const s = F.set('a'); s.add(1); expect(s.has(1)).toBe(true);
    F._usarStorage(null);
    expect(F.leer('a', 'd')).toBe('d');
  });
  it('JSON corrupto cuenta como no guardado', () => {
    st.setItem('ciw_filtros:a', '{no es json');
    expect(F.leer('a', 'def')).toBe('def');
  });
});
```

Y en `test/inyeccion.test.ts`, al lado del bloque de `pantalla-url`:

```ts
  for (const modulo of ['prensas', 'lotes', 'barriles']) {
    it(`en ${modulo}: filtros de la sesión, sin defer y antes de la app`, () => {
      expect(armarInyeccion({ ...ctx, modulo }, 'Ana', modulo)).toContain('<script src="/shared/filtros-sesion.js"></script>');
    });
  }
```

- [ ] **Step 2:** `npx vitest run test/filtros-sesion.test.mjs test/inyeccion.test.ts`. Tiene que fallar porque falta el módulo y el `<script>`.

- [ ] **Step 3: implementación**

```js
/* ===== Filtros que sobreviven al F5 (solo en esta pestaña del navegador) =====
 * Embudos, buscadores, selectores y orden de cada pantalla se guardan en
 * sessionStorage: vuelven con el F5 y con Atrás, y se borran al cerrar la
 * pestaña (otra pestaña arranca limpia; un filtro olvidado de ayer no hace
 * pensar que "faltan filas").
 *
 * Los embudos usan CIWFiltros.set(clave): un Set que se guarda solo en cada
 * add/delete/clear, así los widgets que ya escriben en el Set no cambian.
 *
 * Script clásico, inyectado por el Worker en el <head> de los tres módulos (sin
 * defer). Queda en window.CIWFiltros. Se testea en test/filtros-sesion.test.mjs. */
(function (root) {
  'use strict';
  const PRE = 'ciw_filtros:';
  let _st;
  try { _st = root.sessionStorage || null; } catch (e) { _st = null; }

  function leer(clave, porDefecto) {
    try {
      const v = _st ? _st.getItem(PRE + clave) : null;
      return v == null ? porDefecto : JSON.parse(v);
    } catch (e) { return porDefecto; }
  }
  function guardar(clave, valor) {
    try { if (_st) _st.setItem(PRE + clave, JSON.stringify(valor)); } catch (e) {}
  }
  function borrar(prefijo) {
    try {
      if (!_st) return;
      const fuera = [];
      for (let i = 0; i < _st.length; i++) { const k = _st.key(i); if (k && k.startsWith(PRE + prefijo)) fuera.push(k); }
      fuera.forEach(k => _st.removeItem(k));
    } catch (e) {}
  }

  /* Guarda en un microtask: "Todas" agrega cientos de valores de un saque y
   * con esto se escribe una sola vez. */
  class SetSesion extends Set {
    constructor(clave) {
      super();
      const g = leer(clave, []);
      for (const v of (Array.isArray(g) ? g : [])) super.add(v);
      this._clave = clave;
      this._pend = false;
      /* true mientras tenga lo restaurado sin podar contra las opciones. */
      this.restaurado = this.size > 0;
    }
    add(v) { super.add(v); this._guardar(); return this; }
    delete(v) { const r = super.delete(v); this._guardar(); return r; }
    clear() { super.clear(); this._guardar(); }
    _guardar() {
      if (!this._clave || this._pend) return;
      this._pend = true;
      queueMicrotask(() => { this._pend = false; guardar(this._clave, [...this]); });
    }
    /** La primera vez después de restaurar, saca lo que ya no es una opción
     *  (un lote que se vació, una variedad de otro año): nunca una tabla vacía
     *  por un filtro fantasma. Después no poda: lo elegido a mano se respeta. */
    podar(validos) {
      if (!this.restaurado) return;
      this.restaurado = false;
      let cambio = false;
      for (const v of [...this]) if (!validos.has(v)) { super.delete(v); cambio = true; }
      if (cambio) this._guardar();
    }
  }

  root.CIWFiltros = {
    leer, guardar, borrar,
    set: clave => new SetSesion(clave),
    _usarStorage: s => { _st = s; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
```

En `src/index.ts`, justo después de la línea de `pantalla-url.js`:

```ts
    // Filtros que sobreviven al F5 en esta pestaña (sessionStorage). Sin defer:
    // las vistas los leen al crear sus filtros.
    `<script src="/shared/filtros-sesion.js"></script>\n` +
```

- [ ] **Step 4:** correr de nuevo los dos tests. Tienen que pasar.
- [ ] **Step 5:** commit con el mensaje `feat: CIWFiltros, filtros que sobreviven al F5 en la pestaña (sessionStorage)`.

---

### Task 2: sin salto al tablero

**Files:**
- Modify: `public/shared/pantalla-url.js`
- Modify: `test/pantalla-url.test.mjs`
- Modify: `public/lotes/app.js`
- Modify: `public/prensas/app.js` (`setupTabs`)
- Modify: `public/barriles/index.html`

**Interfaces:**
- Produces:
  - `CIWPantalla.restaurada()`: idempotente. Saca la clase `ciw-restaurando` de `<html>`.
  - `CIWPantalla.ocultaAlArrancar(hash)`: función pura, `true` si el hash no está vacío y no es solo `#`.

- [ ] **Step 1: test que falla.** Agregar a `test/pantalla-url.test.mjs`:

```js
  it('oculta lo activo al arrancar solo si la URL trae una pantalla', () => {
    const { ocultaAlArrancar } = globalThis.CIWPantalla;
    expect(ocultaAlArrancar('')).toBe(false);
    expect(ocultaAlArrancar('#')).toBe(false);
    expect(ocultaAlArrancar('#analisis')).toBe(true);
    expect(ocultaAlArrancar('#ficha/26217')).toBe(true);
  });
```

- [ ] **Step 2:** correr el test. Tiene que fallar.

- [ ] **Step 3: `pantalla-url.js`.** Dentro del IIFE, antes de `root.CIWPantalla = …`:

```js
  /* Sin salto al tablero: el HTML trae el Panel/Inicio marcado activo y el
   * navegador lo pinta mientras baja el código de la app. Si la URL trae otra
   * pantalla, lo activo queda invisible (la barra sigue a la vista) hasta que
   * la app la abre y llama a restaurada(). Tope de 5 s por si algo falla. */
  function ocultaAlArrancar(hash) { return String(hash || '').length > 1; }
  function restaurada() {
    const d = root.document && root.document.documentElement;
    if (d) d.classList.remove('ciw-restaurando');
  }
  if (root.document && root.location && ocultaAlArrancar(root.location.hash)) {
    const d = root.document.documentElement;
    d.classList.add('ciw-restaurando');
    const est = root.document.createElement('style');
    est.textContent = 'html.ciw-restaurando .view.active,html.ciw-restaurando .panel.activo{visibility:hidden}';
    root.document.head.appendChild(est);
    root.setTimeout(restaurada, 5000);
  }
```

Exportar también: `root.CIWPantalla = { pantallaDeHash, hashDePantalla, anotarPantalla, ocultaAlArrancar, restaurada };`.

Atención: en los tests no hay `document`, y el `if` lo saltea.

- [ ] **Step 4: Lotes (`public/lotes/app.js`).** El bloque que hoy dice `const pantallaEnUrl = pantallaDeUrl(); if (pantallaEnUrl) mostrarTab(...)` pasa a:

```js
  const pantallaEnUrl = pantallaDeUrl();
  if (pantallaEnUrl) mostrarTab(pantallaEnUrl, { sinHistorial: true });
  /* La ficha espera a los datos (más abajo); cualquier otra cosa ya está. */
  if (!loteDeHash(location.hash)) window.CIWPantalla?.restaurada();
```

Y después de `if (loteEnUrl) irALote(loteEnUrl, { sinHistorial: true });` agregar `window.CIWPantalla?.restaurada();`.

- [ ] **Step 5: Prensas (`setupTabs`).** Después de `const enUrl=deUrl(); if(enUrl) irA(enUrl,{sinHistorial:true});` agregar `if(window.CIWPantalla) CIWPantalla.restaurada();`.

- [ ] **Step 6: Barriles.**
  - (a) Mover las declaraciones `const OP_TITULOS = {…};` y `const OP_A_PROG = {…};`, junto con sus comentarios, a justo antes de `let rol = null, opVistaActual = 'mapa';`. Así existen cuando corre el bloque de arranque.
  - (b) En el bloque de arranque, reemplazar `if (rolDeLaPlataforma() === 'operario') { document.body.classList.add('op-inicio'); activarPanel('inicio'); }` por:

```js
if (rolDeLaPlataforma() === 'operario') {
  // La sección de la URL (F5 en otra) se marca ya, sin esperar a los datos:
  // solo clase, panel y título; el dibujo con datos lo hace aplicarRol.
  const sec = (PU && PU.pantallaDeHash(location.hash, Object.keys(OP_TITULOS))) || 'inicio';
  if (sec === 'inicio') activarPanel('inicio');
  else {
    document.body.classList.add('op-' + sec);
    $('panel-' + (sec === 'cargar' || sec === 'buscar' ? 'mapa' : sec)).classList.add('activo');
    $('opTitulo').textContent = OP_TITULOS[sec][0];
    $('opAyuda').textContent = OP_TITULOS[sec][1];
  }
  if (sec === 'inicio') document.body.classList.add('op-inicio');
}
```

  - (c) Al final del bloque de arranque, después de `document.body.classList.add('panel-elegido');`, agregar `if (PU) PU.restaurada();`.
  - (d) En `aplicarRol`, la rama del operario hoy solo restaura si `panel-inicio` está activo. Cambiarla para que dibuje la sección ya marcada: `if (r === 'operario') { const s = opDeUrl(); const marcada = s && !$('panel-inicio').classList.contains('activo') && document.body.classList.contains('op-' + s); if ($('panel-inicio').classList.contains('activo') || marcada) opSeccion(s || 'inicio', { sinHistorial: true }); }`.
  - Verificar que `opDeUrl` siga declarada después de que `OP_TITULOS` exista. Es una función, así que se lee al llamarla.

- [ ] **Step 7:** `npx vitest run`, todo verde. Commit con el mensaje `fix: el F5 ya no muestra el tablero antes de la pantalla de la URL`.

---

### Task 3: Lotes, embudos recordados

**Files:**
- Modify: `public/lotes/js/tabla.js` (`crearFiltroMulti` → `build`)
- Modify: `vista-lotes.js:183`, `vista-analisis.js:446`, `vista-movimientos.js:81-82`, `vista-orden.js:30`, `vista-orden-correccion.js:78`, `vista-so2.js:20` y `vista-tablero.js:22` (todos en `public/lotes/js/`)
- Modify: `public/lotes/js/filtro-llenado.js` (o `public/shared/filtro-llenado.js`, el que defina `crearFiltroLlenado`)

**Interfaces:**
- Consumes: `CIWFiltros.set(clave)`, `SetSesion.podar(validos)` y `CIWFiltros.leer/guardar`.
- Produces: `crearFiltroLlenado(onChange, esVacio, clave)`, con un tercer parámetro opcional.

- [ ] **Step 1: podar al armar.** En `tabla.js`, dentro de `build(lista)`, apenas se calcula `nuevas` y antes del `for`:

```js
    /* Los Sets de CIWFiltros vuelven del F5 con lo de antes: la primera vez se
       descarta lo que ya no es una opción (ver shared/filtros-sesion.js). */
    if (set.podar) set.podar(new Set(nuevas.map(o => o.val)));
```

- [ ] **Step 2: un Set de sesión por embudo.** En cada vista, cada `new Set()` de su objeto de filtros pasa a `setF('<pantalla>', '<k>')`, con este helper al principio de `tabla.js`, exportado:

```js
/* Set de un embudo que sobrevive al F5 en esta pestaña (shared/filtros-sesion.js).
   Sin CIWFiltros (tests, servidor de prueba viejo), un Set común. */
export const setF = (pantalla, k) => window.CIWFiltros ? CIWFiltros.set('lotes:' + pantalla + ':f:' + k) : new Set();
```

Pantallas y objetos:

| Vista | Objeto | Pantalla |
|---|---|---|
| `vista-lotes.js` | `filtLotes` | `lotes` |
| `vista-analisis.js` | `filtAn` | `analisis` |
| `vista-movimientos.js` | `filtMov` | `movimientos` |
| `vista-orden.js` | `filtOt` | `orden` |
| `vista-orden-correccion.js` | `filtOc` | `ordencorr` |
| `vista-so2.js` | `filtSo2` | `so2` |
| `vista-tablero.js` | `filt` | `tablero` |

Si algún objeto se rearma en cada `init` (por ejemplo `registrarInit`), igual sirve: el Set nuevo relee el storage.

Atención con `typeof window`: los tests importan algunos de estos módulos sin `window`. Usar `typeof window !== 'undefined' && window.CIWFiltros`.

- [ ] **Step 3: Llenos/Vacíos.** `crearFiltroLlenado(onChange, esVacio, clave)`:
  - Si viene `clave` y `CIWFiltros`, `modo` arranca en `CIWFiltros.leer(clave, 'todos')`, siempre que sea uno de los modos válidos.
  - Cada cambio y el `reset()` guardan.
  - Reescribir el comentario del encabezado: ahora se recuerda solo en la pestaña, y por qué eso acota el riesgo de "faltan lotes".
  - Pasar la clave en `vista-lotes.js:329` (`'lotes:lotes:llenado'`) y en `vista-analisis.js:663` (`'lotes:analisis:llenado'`).

- [ ] **Step 4:** `npx vitest run test/lotes-*`, en verde. Si algún test importa `filtro-llenado.js`, agregar un caso: con `CIWFiltros` de mentira y la clave guardada en `'llenos'`, el filtro arranca en `'llenos'`.
- [ ] **Step 5:** commit con el mensaje `feat(lotes): los embudos y Llenos/Vacíos sobreviven al F5`.

---

### Task 4: Lotes, buscadores, selectores, orden y sub-pestañas

**Files:** las vistas de `public/lotes/js/` de la tabla de abajo, y `public/lotes/app.js` (`buscaLotes`).

**Patrón:** cada dato se lee una vez al cargar el módulo y se guarda en su handler.

```js
const _FS = typeof window !== 'undefined' && window.CIWFiltros;
const _lf = (k, d) => _FS ? _FS.leer('lotes:analisis:' + k, d) : d;
const _gf = (k, v) => { if (_FS) _FS.guardar('lotes:analisis:' + k, v); };
let _filtAnalisisMes = _lf('mes', '');
// …en el handler:  _filtAnalisisMes = fltMes.value; _gf('mes', _filtAnalisisMes); renderAnalisis();
```

Para el orden: `let sortAnalisis = _lf('orden', { key:'fecha_analisis', dir:1 });`. Donde se cambia el orden (buscar `sortAnalisis.key =` o `toggleSort`), guardar después con `_gf('orden', sortAnalisis)`.

En cada **Limpiar filtros** de la vista, agregar `if (_FS) _FS.borrar('lotes:<pantalla>:');` antes de repintar. Los Sets ya se guardan vacíos solos, y esto cubre los escalares.

| Vista | Qué | Claves (`lotes:<pantalla>:…`) |
|---|---|---|
| Lotes | `buscaLotes` (input del HTML, se lee del DOM): restaurar `value` antes del primer `renderLotes` y guardar en `app.js:146`. También `sortLotes`. | `lotes:busca`, `lotes:orden` |
| Análisis | `_filtAnalisisBusca`, `_filtAnalisisMes`, `_filtAnalisisTipo`, `sortAnalisis`. El buscador guarda dentro del timeout, al fijar `_filtAnalisisBusca`. | `analisis:busca`, `mes`, `tipo`, `orden` |
| Movimientos | `_movFiltBusca`, `_sub` (historial/ordenes/mermas/tanques), `sortMov` | `movimientos:busca`, `sub`, `orden` |
| Orden de muestras | `_otBusqueda`, `_otModoBarril` | `orden:busca`, `modo` |
| Orden de corrección | `_ocBusca` (guardar dentro del debounce) | `ordencorr:busca` |
| Registro SO₂ | `_so2FiltBusca` | `so2:busca` |
| Tablero FML | `_busca`, `_modoPanel` | `tablero:busca`, `modo` |
| Agregados | `_busca`, `_sub` | `agregados:busca`, `sub` |
| Lista de OT | `_busca` | `otlista:busca` |
| Agenda | `_modo`, `_filtro` | `agenda:modo`, `filtro` |

Para cada fila hay que:
1. Ubicar con grep la declaración y el handler: `grep -n "<variable>" public/lotes/js/<vista>.js`.
2. Cambiar el valor inicial por `_lf(...)` con el mismo default de hoy.
3. Guardar con `_gf` en cada asignación hecha por el usuario. No guardar en las asignaciones internas del render.
4. Si el input se arma con `innerHTML` desde la variable, no hace falta nada más. Si se lee del DOM (`buscaLotes`), poner el `value` antes del primer render.
5. Si una variable guardada ya no es válida (un `_sub` que no existe, un mes que no está en el `<select>`), volver al default. Para los selects de mes: si después de armar las opciones el valor no está, dejar `''` y guardar `''`.

- [ ] **Step 1:** aplicar el patrón vista por vista. Commitear cada 2 o 3 vistas.
- [ ] **Step 2:** `npx vitest run`, todo verde.
- [ ] **Step 3:** commit con el mensaje `feat(lotes): buscadores, selectores, orden y sub-pestañas sobreviven al F5`.

---

### Task 5: Prensas

**Files:** `public/prensas/app.js`.

- [ ] **Step 1: embudos por columna.**
  - `crearFiltrosColumnas(cols, base, onChange, clave)`:

```js
function crearFiltrosColumnas(cols, base, onChange, clave){
  const FS=window.CIWFiltros, cl=clave&&FS?('prensas:'+clave+':'):null;
  // Rangos y Sets vuelven del F5 en esta pestaña (shared/filtros-sesion.js).
  const rangos=cl?Object.assign({}, FS.leer(cl+'rangos', {})):{}, map=new Map();
  const cambio=()=>{ if(cl) FS.guardar(cl+'rangos', rangos); onChange(); };
  for(const c of cols){
    const valorDe=c.valor||(r=>valCol(r,c));
    const tipo=c.date?'date':(c.num?'num':null);
    const set=cl?FS.set(cl+'f:'+c.k):new Set();
    const inst=crearFiltroMulti({anclado:true, label:c.label, set, onChange,
      opciones:c.opciones||(()=>opcionesValores(base(),valorDe)),
      rango:tipo?{state:rangos,k:c.k,tipo,onChange:cambio}:null});
    map.set(c.k,{c,set,inst,valorDe,tipo});
  }
  // …(n, pasa iguales)…
    limpiar:()=>{ map.forEach(f=>f.set.clear()); Object.keys(rangos).forEach(k=>delete rangos[k]); if(cl) FS.borrar(cl); map.forEach(f=>f.inst.sync()); },
```

  - En `crearFiltroMulti` (la copia de Prensas):
    - En `build()`, antes del `for`: `const nuevas=cfg.opciones(); if(set.podar) set.podar(new Set(nuevas.map(o=>o.val)));` y recorrer `nuevas`.
    - En `campo(rol, ph)`: `i.value=(r.state[r.k]&&r.state[r.k][rol])||'';`, para que los campos desde/hasta muestren lo restaurado.
    - Y en `sync()`, si hay `rangoIn`, refrescar sus `value` desde `r.state`, para que Limpiar los vacíe.
  - Pasar la clave en cada `initFiltrosX`: `'lotes'` (`fcLotes`), `'ana'`, `'agr'`, `'riesgo'` y `'deg'`.
  - `filtOrdenM` (orden de muestras): sus Sets pasan a `FS.set('prensas:orden:f:variedad')` y `'…:f:prensa'`, con fallback a `new Set()`.
  - La copia de `limpiarFiltros(...)` no cambia: el `clear()` ya guarda.

- [ ] **Step 2: escalares.** Al principio del archivo: `const _FS=window.CIWFiltros; const _lf=(k,d)=>_FS?_FS.leer('prensas:'+k,d):d; const _gf=(k,v)=>{ if(_FS) _FS.guardar('prensas:'+k,v); };`.

| Control | Restaurar en `setup()`, antes del primer render | Guardar en | Clave |
|---|---|---|---|
| `buscaLotes`, `buscaAna`, `buscaAgr`, `buscaRiesgo`, `buscaDeg` | `$('id').value=_lf('<id>','')` | su `oninput` / `addEventListener('input')`, antes del render | `prensas:<id>` |
| `selMes`, `selMesDeg`, `anaMostrar`, `ordenFuente`, `ordenNookTipo` | poner `value` después de armar las opciones (`initMesSelectors`). Si el valor no existe entre las opciones, dejar el default | su `onchange` | `prensas:<id>` |
| `filtroLlenado.lotes/ana/deg` | según cómo se crean (`:54-59`): usar la misma idea de modo inicial guardado que en la Task 3 | en el cambio y en el `reset` | `prensas:llenado:<x>` |
| `sortLotes`, `sortAna`, `sortAgr`, `sortDeg`, `sortDash` | `Object.assign(sortX, _lf('orden:<x>', {}))` en `setup()` | después de cada `toggleSort(sortX, k)`: `_gf('orden:<x>', sortX)` | `prensas:orden:<x>` |

Los selects de mes se rellenan en `initMesSelectors()`, que corre en `cargar()` después de `setup()`. Por eso la restauración de `selMes` y `selMesDeg` va en `initMesSelectors`, después de armar las opciones: `const g=_lf('selMes',''); if([...sel.options].some(o=>o.value===g)) sel.value=g;`.

  - Cada `limpiarFiltrosX` agrega `_gf('<buscador>','')` (o `FS.borrar`) para su buscador y sus selects.

- [ ] **Step 3:** `npx vitest run`, todo verde. Commit con el mensaje `feat(prensas): filtros, buscadores, selectores y orden sobreviven al F5`.

---

### Task 6: Barriles

**Files:** `public/barriles/index.html`.

Helpers al lado de `const PU = window.CIWPantalla;`:

```js
// Filtros que sobreviven al F5 en esta pestaña (shared/filtros-sesion.js).
const FS = window.CIWFiltros;
const fsLeer = (k, d) => FS ? FS.leer('barriles:' + k, d) : d;
const fsGuardar = (k, v) => { if (FS) FS.guardar('barriles:' + k, v); };
```

Atención: `PU` y estos helpers tienen que declararse antes del primer uso en tiempo de parseo. Si algún estado de abajo se declara antes que ellos, usar `window.CIWFiltros` directo en esa línea.

| Estado | Inicial | Guardar en | Clave | Ojo |
|---|---|---|---|---|
| `regMes` (:2680) | `fsLeer('registro:mes', null)` | `regElegirMes` | `registro:mes` | Si el mes no tiene órdenes, `regDibujar` ya cae al actual. Verificarlo. |
| `regBuscar` | poner `value` en la primera vez que se dibuja el Registro | su listener `input` | `registro:busca` | `regElegirMes` limpia el buscador: guardar `''` ahí también. |
| `conFiltro` (:2916) | `Object.assign({estado…defaults}, fsLeer('consulta:filtro', {}))` | `conElegir` | `consulta:filtro` | |
| `conBuscar` | `value` al dibujar por primera vez | su listener | `consulta:busca` | |
| `filtrosCol` (:3164) | `Object.assign({...defaults}, fsLeer('inv:cols', {}))` | donde se escribe `filtrosCol[c] =` | `inv:cols` | `refrescarOpcionesFiltroCol` ya descarta los valores que no existen: guardar después de ese descarte. |
| `filtroInv`, `soloRevisar`, `invTipo` | `value`/`checked` al abrir Inventario por primera vez | sus listeners (:3439-3442) | `inv:busca`, `inv:revisar`, `inv:tipo` | |
| `escFiltro` (:5780) | `Object.assign({q:'',mes:'',tipo:''}, fsLeer('esc:filtro', {}))`, con los defaults reales de hoy | listeners de `escFiltroQ/Mes/Tipo` | `esc:filtro` | `escPoblarFiltros` tiene que reponer el `value` de los selects desde `escFiltro`. |
| `buscarMapa` / `buscar3d` | `value` + `aplicarBusqueda()` al abrir el mapa por primera vez | sus listeners | `mapa:busca`, `mapa3d:busca` | `opSeccion('buscar')` vacía `buscarMapa` a propósito: borrar lo guardado ahí también. |

- [ ] **Step 1:** aplicar la tabla.
- [ ] **Step 2:** `npx vitest run`, todo verde. Hay tests que leen `index.html` por texto, como `barriles-congelados-intacto` o `barriles-papel-intacto`. Si alguno falla, leer qué protege antes de tocarlo.
- [ ] **Step 3:** commit con el mensaje `feat(barriles): registro, consulta, inventario, escáner y mapa recuerdan sus filtros al F5`.

---

### Task 7: verificación en el navegador y PR

- [ ] Servidor de prueba: copiar `mock-pantalla-url.mjs` como `mock-filtros.mjs`, con `RAIZ` apuntando a `C:/Users/Bmax/repos/ci-filtros/public`, puerto 8861, y la inyección de `/shared/filtros-sesion.js` después de `pantalla-url.js`. Agregar la entrada `filtros` en `Escritorio\claude\.claude\launch.json`.
- [ ] **Salto:** con la red lenta (o midiendo), cargar `/lotes/#analisis`. `#tab-dashboard` nunca tiene que estar visible: chequear `getComputedStyle(...).visibility` en un `requestAnimationFrame` temprano, o con un screenshot. Lo mismo en `/prensas/#agregados`, `/barriles/?rol=admin#registro` y `/barriles/?rol=editor#escaner`.
- [ ] **Filtros** en cada app:
  - Poner un embudo, un buscador, un selector y un orden.
  - Contar las filas.
  - Hacer F5.
  - Verificar mismos controles y mismas filas.
  - Apretar Limpiar y hacer F5: tiene que quedar limpio.
  - Abrir una pestaña nueva: tiene que estar limpia.
- [ ] Suite completa en verde. Push de la rama y PR contra `main`.
