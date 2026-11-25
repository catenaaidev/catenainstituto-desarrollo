# Prensas como Lotes — Entrega 1 (Configuración, vaciados, años, 2025) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prensas web gana la pestaña Configuración, los lotes vaciados atenuados, el filtro Todos/Llenos/Vacíos, el selector de años 2025|2026 y las herramientas para sumar la vendimia 2025 desde el Excel.

**Architecture:** Los módulos genéricos de Lotes (`anios.js`, selector de años, filtro de llenado) se mueven a `public/shared/` y `public/lotes/js/` queda con reexportadores, así Lotes no cambia. Prensas (`app.js`, script clásico) los recibe por un puente ES module (`public/prensas/js/puente.js`) que los cuelga de `window.PrensasMods` antes de cargar los datos. Las reglas propias de Prensas (vaciado, último análisis entre años) viven en un módulo puro con tests. El 2025 se convierte con un lector Python + un núcleo Node puro, y se fusiona con un núcleo propio de Prensas.

**Tech Stack:** JS vanilla (ES modules + script clásico), Cloudflare Workers + D1, vitest (`@cloudflare/vitest-pool-workers`, sin DOM ni fs en los tests), Python 3 + openpyxl para leer el Excel.

**Spec:** `docs/superpowers/specs/2026-10-07-prensas-como-lotes-design.md` (pasos 0–3). Los pasos 4–5 (Análisis nuevo, autoguardado) van en un plan aparte, la Entrega 2.

## Global Constraints

- Repo: worktree `C:\Users\Bmax\repos\ci-prensas-como-lotes`, rama `feat/prensas-como-lotes`. Nunca trabajar en `repos\catenainstitute` (otras sesiones cambian su rama).
- Prensas y Lotes son **web-only**: no hay app local que sincronizar.
- **Nada toca producción** en las tareas 1–9. No correr `importar.mjs --remote`, `wrangler deploy` ni `wrangler d1 ... --remote`. La tarea 10 es la única que publica y requiere OK explícito del usuario en el momento.
- Vaciado en Prensas = `litros` numérico igual a 0. Un lote sin `litros` (null/'') **no** es vaciado.
- Año de un lote = `2000 + dos primeros dígitos` si el lote tiene exactamente 5 dígitos; si no, no tiene año y se ve siempre.
- Selector de años: arranca en el año más nuevo, se recuerda en `localStorage` con la clave `prensas_anios`, nunca queda vacío, se oculta con menos de 2 años.
- Filtro de llenado: arranca siempre en Todos, sin persistencia.
- Atenuado: `tr.vacio{opacity:.45}` y `tr.vacio:hover,tr.vacio:focus-within{opacity:1}`.
- Los tests de Lotes existentes no se modifican y tienen que seguir verdes.
- Imports entre carpetas de `public/` siempre **relativos** (`../../shared/x.js`): funcionan en el navegador y en vitest; un `/shared/x.js` absoluto rompe los tests.
- Textos de la interfaz en español rioplatense, sin emojis en barras (estilo "Piedra y tinta").
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `public/shared/anios.js` | mover desde `public/lotes/js/anios.js` | reglas puras del año de un lote |
| `public/lotes/js/anios.js` | reemplazar por reexportador | compatibilidad Lotes/tests/scripts |
| `public/shared/selector-anios.js` | crear | fábrica `crearSelectorAnios({claveLS,idContenedor,evento})` |
| `public/lotes/js/selector-anios.js` | reescribir como envoltorio | misma API de siempre para Lotes |
| `public/shared/filtro-llenado.js` | crear (desde el de Lotes) | `pasaLlenado(lote,modo,esVacio)`, `crearFiltroLlenado(onChange,esVacio)` |
| `public/lotes/js/filtro-llenado.js` | reescribir como envoltorio | liga `estaVacio` de `envases.js` |
| `public/prensas/js/reglas-lote.js` | crear | puro: `esVaciado`, `claveTiempo`, `ultimoAnalisis`, `ordenarPorTiempo` |
| `public/prensas/js/puente.js` | crear | ES module → `window.PrensasMods` + evento `prensas:mods-listos` |
| `public/prensas/app.js` | modificar | usar el puente: vaciados, filtro, años |
| `public/prensas/index.html` | modificar | CSS `.segm`/`.vacio`, `#selAnios`, huecos para filtros, `<script type="module">` |
| `scripts/leer-excel-prensas.py` | crear | Excel → filas crudas JSON (`{lotes:[[..]], analisis:[[..]]}`) |
| `scripts/convertir-prensas-nucleo.mjs` | crear | puro: filas crudas → `{lotes, analisis}` de la web |
| `scripts/convertir-prensas.mjs` | crear | CLI del núcleo |
| `scripts/fusionar-anio-prensas-nucleo.mjs` | crear | puro: suma un año al documento de Prensas |
| `scripts/fusionar-anio.mjs` | modificar | flag `--modulo prensas` |
| `test/prensas-reglas-lote.test.mjs`, `test/shared-filtro-llenado.test.mjs`, `test/prensas-convertir.test.mjs`, `test/prensas-fusionar-anio.test.mjs` | crear | tests |

---

### Task 1: Incorporar la pestaña Configuración (`feat/prensas-config`)

**Files:**
- Modify (merge): `public/prensas/app.js`, `public/prensas/index.html`
- Llegan sin conflicto: `public/shared/reglas-alertas.js`, `src/prensas/reporte-plantilla.ts`, `test/prensas-reglas-alertas.test.mjs`, `test/prensas-guardado.test.ts`

**Interfaces:**
- Produces: `REGLAS` mutado en su lugar por `aplicarReglas()` a partir de `DATOS.config.alertas`; claves `ph_max, av_max, gluc_max, malico_max, av_atencion, av_salto, vencido_dias, proximo_dias, accion_ml`. Pestaña `data-v="config"`.

- [ ] **Step 1: Preparar el worktree**

```bash
cd /c/Users/Bmax/repos/ci-prensas-como-lotes && npm ci && npm test 2>&1 | tail -5
```
Expected: todos los tests verdes en main (anotar el número, p. ej. "N passed").

- [ ] **Step 2: Mergear**

```bash
git merge --no-ff feat/prensas-config
```
Expected: conflictos en `public/prensas/app.js` (6 bloques) y `public/prensas/index.html` (8 bloques).

- [ ] **Step 3: Resolver los conflictos con esta regla**

Para cada bloque: **la estructura y el estilo son los de HEAD (rediseño "Piedra y tinta"); lo nuevo de la rama es la pestaña Configuración y la lectura de umbrales.** Concretamente:
- `index.html` CSS: quedarse con los estilos de HEAD (`button.btn` con `border-radius:2px`, `#avisos` con `var(--nook)`, barra compacta). Sumar las reglas `#v-config …`, `.cfg-grid`, `.cfg-card`, `.cfg-valor`, `.cfg-unidad`, `.cfg-regla`, `.cfg-def` de la rama, cambiando `#f6e4e1` por `var(--nook-tinte)` y `font-weight:600` del `h3` por `500` con `font-family:var(--serif)`.
- `index.html` barra: la pestaña va **dentro del menú "Más"**, grupo "Herramientas", como `<button data-v="config">Configuración</button>` (sin el emoji ⚙️). No agregarla a `.tabs` principal ni a `.mas-angosto`.
- `index.html` cuerpo: tomar la `<section class="view" id="v-config">` de la rama, con la cabecera al estilo de HEAD (`<div class="pg-head"><h1>Configuración</h1><p>…</p></div>`).
- `index.html` textos con `data-regla`/`data-plantilla`: donde HEAD reescribió un texto que cita un umbral, conservar el texto de HEAD y envolver el número con el `<span data-regla="…">` de la rama.
- `app.js`: conservar el código de HEAD y sumar lo de la rama: `aplicarReglas()`, `renderConfig()` y sus handlers, la rama `else if(v==='config')renderConfig();` en `renderActive`, y la llamada a `aplicarReglas()` en `cargar()` justo después de asignar `DATOS`. El bloque grande (app.js ~1475–1622 en el merge) es HEAD sin Evolución/Asistente contra la rama con ellos: **no reintroducir Evolución ni Asistente**; solo rescatar de ese bloque lo que sea de Configuración.

Verificar que no quede nada: `grep -n "^<<<<<<<\|^=======\|^>>>>>>>" public/prensas/app.js public/prensas/index.html` → sin salida.

- [ ] **Step 4: Tests**

```bash
npm test 2>&1 | tail -5
```
Expected: verdes, N + los tests nuevos de la rama.

- [ ] **Step 5: Probar en el navegador (mock sin login)**

Copiar el mock de la sesión anterior y apuntarlo a este worktree:

```bash
S="C:/Users/Bmax/AppData/Local/Temp/claude/C--Users-Bmax-OneDrive---BODEGAS-ESMERALDA-SA-Escritorio-claude/685e1a57-280d-4ea6-8e2f-b47a130151fa/scratchpad"
mkdir -p "$S" && sed -e "s#ci-prensas-redisenio#ci-prensas-como-lotes#" -e "s#const PUERTO = 8806#const PUERTO = 8807#" \
  -e "s#^const RESPALDO = .*#const RESPALDO = process.env.DOC || 'C:/Users/Bmax/repos/catenainstitute/respaldo-nube-prensas-2026-09-09-corte.json';#" \
  "C:/Users/Bmax/AppData/Local/Temp/claude/C--Users-Bmax-OneDrive---BODEGAS-ESMERALDA-SA-Escritorio-claude/9fe84f92-3fd6-48b7-aed6-07db377bdda7/scratchpad/mock-prensas.mjs" > "$S/mock-prensas.mjs"
```
Y en la línea de `let doc = …` del mock, aceptar tanto el respaldo (array) como un documento pelado:
```js
let crudo = JSON.parse(fs.readFileSync(RESPALDO, 'utf8'));
let doc = Array.isArray(crudo) ? JSON.parse(crudo[0].results[0].json) : crudo;
```
Agregar a `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\.claude\launch.json` la entrada `{"name":"prensas-como-lotes","runtimeExecutable":"node","runtimeArgs":["<S>/mock-prensas.mjs"],"port":8807}` (con `<S>` expandido). `preview_start {name:"prensas-como-lotes"}` → abrir Más → Configuración: se ven los 9 recuadros; cambiar pH a 3.9 → en Análisis aparecen más celdas marcadas; volver a 4. `read_console_messages` sin errores.

- [ ] **Step 6: Commit del merge**

```bash
git add -A public/prensas && git commit -m "Merge feat/prensas-config: pestaña Configuración de alertas sobre el rediseño

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `anios.js` y el selector de años a `public/shared/`

**Files:**
- Create: `public/shared/anios.js` (contenido idéntico al actual `public/lotes/js/anios.js`, cambiando solo el título del comentario a "CIW — el año (vendimia) de cada lote" y la mención "Misma regla que src/lotes/motores/anios.ts")
- Modify: `public/lotes/js/anios.js` → reexportador
- Create: `public/shared/selector-anios.js`
- Modify: `public/lotes/js/selector-anios.js` → envoltorio
- Test: `test/lotes-anios.test.mjs` (sin cambios, debe seguir verde)

**Interfaces:**
- Produces: `crearSelectorAnios({claveLS, idContenedor, evento})` → `{aniosActivos(), visible(lote), otVisibleAhora(ot), queryAnios(), montar(lotes)}`. Desde shared/anios.js: `anioDeLote, aniosDisponibles, seleccionInicial, alternarAnio, loteVisible, otVisible, claveAnios, claveParaPrefetch`.

- [ ] **Step 1: Mover anios.js**

```bash
git mv public/lotes/js/anios.js public/shared/anios.js
```
Crear `public/lotes/js/anios.js`:
```js
/* Vive en public/shared/anios.js (lo usan Lotes y Prensas). Este archivo queda
 * para no cambiar los imports de Lotes, sus tests ni scripts/fusionar-anio. */
export * from '../../shared/anios.js';
```

- [ ] **Step 2: Crear la fábrica del selector**

`public/shared/selector-anios.js`:
```js
/* ===== CIW — selector de años (estado + botones) =====
 * Botones 2025 | 2026 que se prenden y apagan por separado y mandan en toda la
 * página. La regla del año vive en anios.js; acá solo la selección, su
 * recuerdo en el navegador y el pintado. Cada módulo crea el suyo con su
 * clave de localStorage y su evento (Lotes: 'lotes_anios' /
 * 'lotes:anios-cambiados'; Prensas: 'prensas_anios' / 'prensas:anios-cambiados'). */
'use strict';
import { aniosDisponibles, seleccionInicial, alternarAnio, loteVisible,
         otVisible, claveAnios, claveParaPrefetch } from './anios.js';

export function crearSelectorAnios({ claveLS, idContenedor, evento }){
  // La explícita (claveLS) manda; la _ultima es respaldo para adelantar pedidos.
  const claveUltima = claveLS + '_ultima';
  let _sel = null;          // null = todavía no se montó: no se filtra nada
  let _disponibles = [];

  const leer = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch(e) { return null; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} };

  function aniosActivos(){ return _sel; }
  function visible(lote){ return loteVisible(lote, _sel); }
  function otVisibleAhora(ot){ return otVisible(ot, _sel); }
  function queryAnios(){
    if (_sel !== null) return claveAnios(_sel);
    return claveParaPrefetch(leer(claveLS), leer(claveUltima));
  }
  function pintar(){
    const cont = document.getElementById(idContenedor);
    if (!cont) return;
    cont.hidden = _disponibles.length < 2;   // con un solo año no hay nada que elegir
    cont.innerHTML = _disponibles.map(a =>
      `<button type="button" data-anio="${a}" aria-pressed="${_sel.includes(a)}"`
      + ` title="Mostrar u ocultar los lotes ${a}">${a}</button>`).join('');
  }
  const avisar = () => document.dispatchEvent(new CustomEvent(evento));

  /* Se llama después de cargar los datos (y otra vez si se recargan). */
  function montar(lotes){
    const antes = queryAnios();
    _disponibles = aniosDisponibles(lotes);
    _sel = seleccionInicial(_sel || leer(claveLS), _disponibles);
    escribir(claveUltima, _sel);
    pintar();
    const cont = document.getElementById(idContenedor);
    if (cont && !cont._escuchando){
      cont._escuchando = true;
      cont.addEventListener('click', e => {
        const b = e.target.closest('button[data-anio]');
        if (!b) return;
        const nueva = alternarAnio(_sel, Number(b.dataset.anio));
        if (claveAnios(nueva) === claveAnios(_sel)) return;   // era el último prendido
        _sel = nueva;
        escribir(claveLS, _sel); escribir(claveUltima, _sel);
        pintar();
        avisar();
      });
    }
    if (claveAnios(_sel) !== antes) avisar();
  }

  return { aniosActivos, visible, otVisibleAhora, queryAnios, montar };
}
```

- [ ] **Step 3: Envoltorio de Lotes**

Reemplazar todo `public/lotes/js/selector-anios.js` por:
```js
/* ===== Lotes CIW — selector de años =====
 * La lógica vive en public/shared/selector-anios.js (la comparte Prensas).
 * No importa nucleo.js: nucleo lo importa a él (cargarDashboard necesita la
 * clave). Avisa los cambios con 'lotes:anios-cambiados' y app.js hace el resto. */
'use strict';
import { crearSelectorAnios } from '../../shared/selector-anios.js';

const _s = crearSelectorAnios({ claveLS: 'lotes_anios', idContenedor: 'selAnios',
                                evento: 'lotes:anios-cambiados' });
export const aniosActivos = _s.aniosActivos;
export const visible = _s.visible;
export const otVisibleAhora = _s.otVisibleAhora;
export const queryAnios = _s.queryAnios;
export const montarSelectorAnios = _s.montar;
```

- [ ] **Step 4: Tests**

```bash
npm test 2>&1 | tail -5
```
Expected: mismo total que al terminar la Tarea 1, todo verde (`lotes-anios.test.mjs` y `lotes-fusionar-anio.test.mjs` pasan por el reexportador).

- [ ] **Step 5: Commit**

```bash
git add public/shared/anios.js public/shared/selector-anios.js public/lotes/js/anios.js public/lotes/js/selector-anios.js
git commit -m "refactor(shared): años y selector de años compartidos entre Lotes y Prensas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Filtro de llenado compartido con el predicado inyectado

**Files:**
- Create: `public/shared/filtro-llenado.js`
- Modify: `public/lotes/js/filtro-llenado.js` → envoltorio
- Test: `test/shared-filtro-llenado.test.mjs` (nuevo); `test/lotes-vacios.test.mjs` sin cambios

**Interfaces:**
- Produces: `MODOS_LLENADO`, `pasaLlenado(lote, modo, esVacio)`, `crearFiltroLlenado(onChange, esVacio)` → `{el, pasa(lote), reset(), modo}`.
- Lotes sigue exportando `pasaLlenado(lote, modo)` y `crearFiltroLlenado(onChange)` con la misma firma de siempre.

- [ ] **Step 1: Test que falla**

`test/shared-filtro-llenado.test.mjs`:
```js
/* El filtro Todos | Llenos | Vacíos compartido recibe la definición de
 * "vacío" de cada módulo: Lotes mira litros_actuales, Prensas mira litros. */
import { describe, it, expect } from 'vitest';
import { pasaLlenado, MODOS_LLENADO } from '../public/shared/filtro-llenado.js';

const vacioPorLitros = l => !!l && l.litros === 0;

describe('pasaLlenado compartido', () => {
  it('usa el predicado que se le pasa', () => {
    expect(pasaLlenado({ litros: 0 }, 'vacios', vacioPorLitros)).toBe(true);
    expect(pasaLlenado({ litros: 225 }, 'vacios', vacioPorLitros)).toBe(false);
    expect(pasaLlenado({ litros: 225 }, 'llenos', vacioPorLitros)).toBe(true);
    expect(pasaLlenado({ litros: 0 }, 'llenos', vacioPorLitros)).toBe(false);
  });
  it('todos y modos desconocidos muestran todo', () => {
    expect(pasaLlenado({ litros: 0 }, 'todos', vacioPorLitros)).toBe(true);
    expect(pasaLlenado({ litros: 0 }, 'cualquiera', vacioPorLitros)).toBe(true);
  });
  it('los modos son los tres de siempre', () => {
    expect(MODOS_LLENADO).toEqual(['todos', 'llenos', 'vacios']);
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run test/shared-filtro-llenado.test.mjs`
Expected: FAIL, no se encuentra `public/shared/filtro-llenado.js`.

- [ ] **Step 3: Crear el compartido**

`public/shared/filtro-llenado.js` = el contenido actual de `public/lotes/js/filtro-llenado.js` con estos cambios:
- Título: `/* ===== CIW — filtro de llenado (Todos | Llenos | Vacíos) =====`, y al comentario de cabecera agregar: "Cada módulo pasa su propia definición de vacío (`esVacio`): Lotes mira `litros_actuales` (envases.js), Prensas mira `litros` (prensas/js/reglas-lote.js)."
- Borrar `import { estaVacio } from './envases.js';`.
- `export function pasaLlenado(lote, modo, esVacio){ if (modo !== 'llenos' && modo !== 'vacios') return true; return esVacio(lote) === (modo === 'vacios'); }`
- `export function crearFiltroLlenado(onChange, esVacio){` y dentro `pasa: (lote) => pasaLlenado(lote, modo, esVacio),`.

- [ ] **Step 4: Envoltorio de Lotes**

Reemplazar `public/lotes/js/filtro-llenado.js` por:
```js
/* ===== Lotes CIW — filtro de llenado =====
 * La lógica vive en public/shared/filtro-llenado.js (la comparte Prensas).
 * Acá se liga la definición de vacío de Lotes: estaVacio() de envases.js. */
'use strict';
import { estaVacio } from './envases.js';
import { MODOS_LLENADO, pasaLlenado as _pasa,
         crearFiltroLlenado as _crear } from '../../shared/filtro-llenado.js';

export { MODOS_LLENADO };
export const pasaLlenado = (lote, modo) => _pasa(lote, modo, estaVacio);
export const crearFiltroLlenado = onChange => _crear(onChange, estaVacio);
```

- [ ] **Step 5: Tests**

Run: `npm test 2>&1 | tail -5`
Expected: verde, total anterior + 3.

- [ ] **Step 6: Probar Lotes en el navegador**

No hay mock de Lotes en este worktree; alcanza con comprobar que los módulos cargan sin error de import: `node --input-type=module -e "await import('file:///C:/Users/Bmax/repos/ci-prensas-como-lotes/public/lotes/js/filtro-llenado.js'); await import('file:///C:/Users/Bmax/repos/ci-prensas-como-lotes/public/lotes/js/anios.js'); console.log('ok')"` → `ok`. (`selector-anios.js` también: solo toca `document` al montar.)

- [ ] **Step 7: Commit**

```bash
git add public/shared/filtro-llenado.js public/lotes/js/filtro-llenado.js test/shared-filtro-llenado.test.mjs
git commit -m "refactor(shared): filtro de llenado compartido con la definición de vacío inyectada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reglas puras de Prensas (vaciado y último análisis entre años)

**Files:**
- Create: `public/prensas/js/reglas-lote.js`
- Test: `test/prensas-reglas-lote.test.mjs`

**Interfaces:**
- Consumes: `anioDeLote` de `public/shared/anios.js`.
- Produces: `esVaciado(lote) → boolean`, `claveTiempo(analisis) → string` (`'YYYY-MM-DD'` comparable), `ordenarPorTiempo(rows) → rows nuevos ordenados ascendente`, `ultimoAnalisis(rows) → analisis|null`.

**Por qué:** hoy el Panel elige el último análisis comparando solo el número de mes. Con 2025 cargado hay análisis de lotes 2025 hechos en enero de 2026 (mes 1), que perderían contra uno de diciembre de 2025 (mes 12). La clave de tiempo usa la fecha y, si falta, el año del lote + el mes.

- [ ] **Step 1: Test que falla**

`test/prensas-reglas-lote.test.mjs`:
```js
import { describe, it, expect } from 'vitest';
import { esVaciado, claveTiempo, ordenarPorTiempo, ultimoAnalisis }
  from '../public/prensas/js/reglas-lote.js';

describe('esVaciado', () => {
  it('0 litros es vaciado, con número o texto', () => {
    expect(esVaciado({ litros: 0 })).toBe(true);
    expect(esVaciado({ litros: '0' })).toBe(true);
    expect(esVaciado({ litros: '0,0' })).toBe(true);
  });
  it('con litros no es vaciado', () => {
    expect(esVaciado({ litros: 225 })).toBe(false);
    expect(esVaciado({ litros: '50' })).toBe(false);
  });
  it('sin el dato NO es vaciado (lote recién creado)', () => {
    expect(esVaciado({ litros: null })).toBe(false);
    expect(esVaciado({ litros: '' })).toBe(false);
    expect(esVaciado({})).toBe(false);
    expect(esVaciado(null)).toBe(false);
    expect(esVaciado(undefined)).toBe(false);
  });
});

describe('claveTiempo', () => {
  it('usa la fecha ISO si la hay', () => {
    expect(claveTiempo({ lote: 25701, mes: 1, fecha: '2026-01-16' })).toBe('2026-01-16');
  });
  it('sin fecha usa año del lote + mes', () => {
    expect(claveTiempo({ lote: 25701, mes: 3, fecha: null })).toBe('2025-03-00');
  });
  it('sin fecha ni año queda al principio', () => {
    expect(claveTiempo({ lote: null, mes: null, fecha: null })).toBe('0000-00-00');
  });
});

describe('ultimoAnalisis', () => {
  it('enero del año siguiente gana a diciembre', () => {
    const dic = { lote: 25701, mes: 12, fecha: '2025-12-10' };
    const ene = { lote: 25701, mes: 1, fecha: '2026-01-16' };
    expect(ultimoAnalisis([ene, dic])).toBe(ene);
  });
  it('dentro del mismo mes gana la fecha más nueva', () => {
    const a = { lote: 26701, mes: 3, fecha: '2026-03-03' };
    const b = { lote: 26701, mes: 3, fecha: '2026-03-20' };
    expect(ultimoAnalisis([b, a])).toBe(b);
  });
  it('empate exacto: gana el que viene después en la lista (como antes)', () => {
    const a = { lote: 26701, mes: 3, fecha: '2026-03-03', ph: 1 };
    const b = { lote: 26701, mes: 3, fecha: '2026-03-03', ph: 2 };
    expect(ultimoAnalisis([a, b])).toBe(b);
  });
  it('lista vacía da null', () => {
    expect(ultimoAnalisis([])).toBe(null);
  });
});

describe('ordenarPorTiempo', () => {
  it('ordena ascendente sin tocar la lista original', () => {
    const r = [{ lote: 25701, fecha: '2026-01-16' }, { lote: 25701, fecha: '2025-12-10' }];
    const o = ordenarPorTiempo(r);
    expect(o.map(x => x.fecha)).toEqual(['2025-12-10', '2026-01-16']);
    expect(r[0].fecha).toBe('2026-01-16');
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run test/prensas-reglas-lote.test.mjs`
Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Implementar**

`public/prensas/js/reglas-lote.js`:
```js
/* ===== Prensas — reglas puras de un lote =====
 * Sin DOM ni red: se importa tal cual en los tests (runtime de Workers).
 * Las usa app.js por el puente (puente.js → window.PrensasMods).
 *
 * Vaciado: en Prensas no hay estado ni fecha de vaciado; el único dato es
 * litros. Un lote sin litros cargados (recién creado) NO es vaciado: si no,
 * nacería atenuado justo cuando se lo está completando.
 *
 * Tiempo de un análisis: el número de mes solo no alcanza con dos vendimias
 * (un lote 2025 analizado en enero de 2026 tiene mes 1). Se compara la fecha
 * ISO y, si falta, año del lote + mes. */
'use strict';
import { anioDeLote } from '../../shared/anios.js';

const numero = v => {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
};

export function esVaciado(lote){
  if (!lote) return false;
  return numero(lote.litros) === 0;
}

const dos = n => String(n).padStart(2, '0');

export function claveTiempo(a){
  const f = a && a.fecha;
  if (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f)) return f.slice(0, 10);
  const anio = anioDeLote(a && a.lote);
  const mes = numero(a && a.mes);
  if (anio === null || mes === null) return '0000-00-00';
  return `${anio}-${dos(mes)}-00`;
}

export function ordenarPorTiempo(rows){
  return rows.map((r, i) => [r, i])
    .sort((x, y) => claveTiempo(x[0]).localeCompare(claveTiempo(y[0])) || x[1] - y[1])
    .map(x => x[0]);
}

export function ultimoAnalisis(rows){
  if (!rows || !rows.length) return null;
  return rows.reduce((a, b) => (claveTiempo(b) >= claveTiempo(a) ? b : a));
}
```

- [ ] **Step 4: Verlo pasar**

Run: `npx vitest run test/prensas-reglas-lote.test.mjs`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add public/prensas/js/reglas-lote.js test/prensas-reglas-lote.test.mjs
git commit -m "feat(prensas): reglas puras de vaciado y último análisis entre años

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Puente + vaciados atenuados + filtro de llenado en Prensas

**Files:**
- Create: `public/prensas/js/puente.js`
- Modify: `public/prensas/index.html` (CSS, huecos de filtros, leyendas, script module)
- Modify: `public/prensas/app.js` (`evaluarLotes`, `evaluarRiesgo`, `renderLotes`, `renderAnalisis`, `renderDegustacion`, limpiadores, `setup`)

**Interfaces:**
- Consumes: `crearFiltroLlenado(onChange, esVacio)` (Task 3), `esVaciado`, `ultimoAnalisis`, `ordenarPorTiempo` (Task 4), `crearSelectorAnios` (Task 2, se usa en Task 6).
- Produces: `window.PrensasMods = {esVaciado, claveTiempo, ordenarPorTiempo, ultimoAnalisis, crearFiltroLlenado, crearSelectorAnios, anioDeLote}`; evento `prensas:mods-listos` en `document`. En app.js: `const PM = () => window.PrensasMods;` y `filtroLlenado = {lotes, ana, deg}`.

- [ ] **Step 1: Crear el puente**

`public/prensas/js/puente.js`:
```js
/* ===== Prensas — puente a los módulos compartidos =====
 * app.js es un script clásico (globales, sin import). Este módulo carga lo
 * compartido con Lotes y las reglas puras de Prensas, los cuelga de
 * window.PrensasMods y avisa: app.js recién carga los datos después del aviso. */
import { anioDeLote } from '../../shared/anios.js';
import { crearSelectorAnios } from '../../shared/selector-anios.js';
import { crearFiltroLlenado } from '../../shared/filtro-llenado.js';
import { esVaciado, claveTiempo, ordenarPorTiempo, ultimoAnalisis } from './reglas-lote.js';

window.PrensasMods = { anioDeLote, crearSelectorAnios, crearFiltroLlenado,
                       esVaciado, claveTiempo, ordenarPorTiempo, ultimoAnalisis };
document.dispatchEvent(new Event('prensas:mods-listos'));
```

En `public/prensas/index.html`, después de `<script src="app.js"></script>`:
```html
<script type="module" src="js/puente.js"></script>
```

En `app.js`, función `setup()`, reemplazar la línea `  cargar();` por:
```js
  // Los módulos compartidos llegan por js/puente.js (type=module, corre después
  // de este script): recién con ellos se cargan y dibujan los datos.
  if(window.PrensasMods) cargar(); else document.addEventListener('prensas:mods-listos', cargar, {once:true});
```
Y cerca de `mapaLotes` (línea ~36) agregar:
```js
const PM = () => window.PrensasMods;
```

- [ ] **Step 2: Último análisis entre años en el Panel y Alto riesgo**

En `evaluarLotes`, reemplazar
```js
      const last = rows.reduce((a,b)=> mesDe(b)>=mesDe(a)?b:a);
```
por
```js
      const last = PM().ultimoAnalisis(rows);
```
En `evaluarRiesgo`, reemplazar
```js
    rows=rows.slice().sort((a,b)=>(mesDe(a)-mesDe(b))||String(a.fecha||'').localeCompare(String(b.fecha||'')));
```
por
```js
    rows=PM().ordenarPorTiempo(rows);
```

- [ ] **Step 3: Verificar que el Panel 2026 no cambia**

Script suelto (no se commitea) en el scratchpad `$S/comparar-panel.mjs`:
```js
import fs from 'node:fs';
import { ultimoAnalisis } from 'file:///C:/Users/Bmax/repos/ci-prensas-como-lotes/public/prensas/js/reglas-lote.js';
const d = JSON.parse(JSON.parse(fs.readFileSync('C:/Users/Bmax/repos/catenainstitute/respaldo-nube-prensas-2026-09-09-corte.json','utf8'))[0].results[0].json);
const monthOf = f => f ? +String(f).slice(5,7) : null;
const mesDe = a => (a.mes!=null && a.mes!=='') ? +a.mes : monthOf(a.fecha);
let distintos = [];
for (const l of d.lotes) {
  const rows = d.analisis.filter(a => +a.lote === +l.lote && mesDe(a) != null);
  if (!rows.length) continue;
  const viejo = rows.reduce((a,b)=> mesDe(b)>=mesDe(a)?b:a);
  const nuevo = ultimoAnalisis(rows);
  if (viejo !== nuevo) distintos.push({ lote: l.lote, viejo: [viejo.mes, viejo.fecha], nuevo: [nuevo.mes, nuevo.fecha] });
}
console.log(distintos.length, JSON.stringify(distintos.slice(0, 20)));
```
Run: `node "$S/comparar-panel.mjs"`
Expected: `0 []`, o una lista corta donde en cada caso `nuevo` tiene la fecha más reciente dentro del mismo mes. Si aparece un caso donde el mes guardado no coincide con la fecha, anotarlo para el informe final (no cambia la decisión).

- [ ] **Step 4: CSS y huecos en el HTML**

En el `<style>` de `index.html`, después de las reglas `tr.venc …` (línea ~284), agregar:
```css
  /* Lote vaciado (0 L): la fila se atenúa entera, en el <tr> y no en cada
     celda, para componer con .crit/.venc. Vuelve a plena al pasar o editar:
     está atenuada, no deshabilitada. Mismo criterio que Lotes web. */
  tr.vacio{opacity:.45}
  tr.vacio:hover,tr.vacio:focus-within{opacity:1}
  .legend-inline .sw.vacio{background:var(--panel);border:1px solid var(--line);opacity:.45}
  /* Control segmentado (Todos | Llenos | Vacíos y años): el estado lo lleva aria-pressed. */
  .segm{display:inline-flex;border:1px solid var(--line);border-radius:2px;overflow:hidden;flex-shrink:0}
  .segm[hidden]{display:none}
  .segm button{background:transparent;color:var(--muted);border:none;border-left:1px solid var(--line);padding:6px 11px;font-size:13px;font-family:var(--sans);cursor:pointer}
  .segm button:first-child{border-left:none}
  .segm button:hover{color:var(--txt);background:var(--panel2)}
  .segm button[aria-pressed="true"]{background:var(--txt);color:var(--bg)}
```
En las barras (`.tbar`) agregar un hueco **después del buscador**:
- Lotes: `<span id="fltLlenadoLotes"></span>` después de `#buscaLotes`.
- Análisis: `<span id="fltLlenadoAna"></span>` después de `#buscaAna`.
- Degustación: `<span id="fltLlenadoDeg"></span>` después de `#buscaDeg`.

Leyendas:
- Lotes (`.legend-inline` de la línea ~480): agregar al final ` &nbsp;·&nbsp; <span class="sw vacio"></span> Vaciado (0 L)`.
- Análisis (línea ~497): agregar igual ` &nbsp;·&nbsp; <span class="sw vacio"></span> Lote vaciado (0 L)`.
- Degustación: agregar debajo de su `.tbar` `<div class="legend-inline"><span class="sw crit"></span> NO OK en la degustación &nbsp;·&nbsp; <span class="sw vacio"></span> Lote vaciado (0 L)</div>`.

- [ ] **Step 5: Filtro y atenuado en app.js**

Después de `const PM = …` agregar:
```js
/* Filtro Todos | Llenos | Vacíos de Lotes, Análisis y Degustación (shared/filtro-llenado.js).
   Se crean al cargar (necesitan el puente) y arrancan siempre en Todos. */
const filtroLlenado = {lotes:null, ana:null, deg:null};
function initFiltrosLlenado(){
  const crear=(id,render)=>{ const f=PM().crearFiltroLlenado(render, PM().esVaciado); const h=$(id); if(h) h.replaceChildren(f.el); return f; };
  filtroLlenado.lotes=crear('fltLlenadoLotes', ()=>renderLotes());
  filtroLlenado.ana=crear('fltLlenadoAna', ()=>renderAnalisis());
  filtroLlenado.deg=crear('fltLlenadoDeg', ()=>renderDegustacion());
}
```
(El mapa de lotes se arma una vez por dibujado con `mapaLotes()`, que ya existe: con ~540 lotes cuesta menos de 1 ms y nunca queda viejo si se renumera un lote.)

En `cargar()`, después de `initFiltrosOrden();` agregar `initFiltrosLlenado();`. Si `cargar` se vuelve a llamar (recarga tras conflicto), `initFiltrosLlenado` recrea los controles: está bien que vuelvan a Todos.

`renderLotes`:
- Después de `rows=rows.filter(fcLotes.pasa);` agregar `rows=rows.filter(filtroLlenado.lotes.pasa);`.
- Cambiar `rc` a:
```js
  const rc=o=>{ const f=evalMap.get(+o.lote); const cls=[];
    if(f&&f.noOk)cls.push('crit'); else if(f&&f.vencido)cls.push('venc');
    if(PM().esVaciado(o))cls.push('vacio');
    return cls.join(' '); };
```
- `limpiarFiltrosLotes`: agregar `filtroLlenado.lotes.reset();` antes de `renderLotes()`.

`renderAnalisis`:
- Al principio de la función: `const ml=mapaLotes();`.
- Después de `rows=rows.filter(fcAna.pasa);` agregar `rows=rows.filter(a=>filtroLlenado.ana.pasa(ml.get(+a.lote)));`.
- `const rc=o=>[esSeparador(o)?'sep':'', PM().esVaciado(ml.get(+o.lote))?'vacio':''].join(' ').trim();`
- `limpiarFiltrosAna`: agregar `filtroLlenado.ana.reset();`.

`renderDegustacion`:
- Al principio de la función: `const ml=mapaLotes();`.
- Después de `rows=rows.filter(fcDeg.pasa);` agregar `rows=rows.filter(r=>filtroLlenado.deg.pasa(ml.get(+r.lote)));`.
- En el armado de la fila, cambiar ``tb+=`<tr class="${r.estado==='nook'?'crit':''}">` `` por
``tb+=`<tr class="${[r.estado==='nook'?'crit':'', PM().esVaciado(ml.get(+r.lote))?'vacio':''].join(' ').trim()}">` ``.
- `limpiarFiltrosDeg`: agregar `filtroLlenado.deg.reset();`.

Nota: un análisis cuyo lote no existe en el maestro da `ml.get(...) === undefined` → `esVaciado(undefined)` es `false` → cuenta como lleno. Es a propósito (huérfano ≠ vaciado).

- [ ] **Step 6: Tests + navegador**

Run: `npm test 2>&1 | tail -5` → verde.
Navegador (mock :8807, `preview_stop` + `preview_start` para no ver caché; recargar con `location.replace('/prensas/?v='+Date.now())`):
- Lotes: `javascript_tool`: `[...document.querySelectorAll('#tLotes tbody tr.vacio')].length` → **74**; `getComputedStyle(document.querySelector('#tLotes tbody tr.vacio')).opacity` → `"0.45"`.
- Clic en "Vacíos" de Lotes → contador `74 / 278 lotes`; "Llenos" → `204 / 278`; "Limpiar filtros" → vuelve a Todos y `278 / 278`.
- Análisis: hay filas `tr.vacio`; "Vacíos" deja solo análisis de lotes en 0 L.
- Degustación: 74 filas `tr.vacio` con "Todos".
- Panel: los KPIs son los mismos que antes del cambio (anotar Total/OK/NO OK antes y después).
- `read_console_messages {onlyErrors:true}` vacío.

- [ ] **Step 7: Commit**

```bash
git add public/prensas/js/puente.js public/prensas/index.html public/prensas/app.js
git commit -m "feat(prensas): lotes vaciados atenuados y filtro Todos/Llenos/Vacíos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Selector de años en Prensas

**Files:**
- Modify: `public/prensas/index.html` (contenedor `#selAnios` en `.barra .right`)
- Modify: `public/prensas/app.js`

**Interfaces:**
- Consumes: `crearSelectorAnios` (Task 2) vía `PM()`.
- Produces: en app.js `let SEL_ANIOS=null; const visibleAnio = lote => !SEL_ANIOS || SEL_ANIOS.visible(lote); const lotesVis = () => DATOS.lotes.filter(l=>visibleAnio(l.lote));`; evento `prensas:anios-cambiados`.

- [ ] **Step 1: HTML**

En `.barra .right`, como primer hijo (antes de `#btnConectar`):
```html
    <div class="segm sel-anios" id="selAnios" role="group" aria-label="Años de vendimia" hidden></div>
```

- [ ] **Step 2: Estado y montaje en app.js**

Junto a `filtroLlenado`:
```js
/* Años de vendimia (shared/selector-anios.js). Antes de montar, se ve todo. */
let SEL_ANIOS=null;
const visibleAnio = lote => !SEL_ANIOS || SEL_ANIOS.visible(lote);
const lotesVis = () => DATOS.lotes.filter(l=>visibleAnio(l.lote));
function montarAnios(){
  if(!SEL_ANIOS) SEL_ANIOS=PM().crearSelectorAnios({claveLS:'prensas_anios', idContenedor:'selAnios', evento:'prensas:anios-cambiados'});
  SEL_ANIOS.montar(DATOS.lotes);
}
document.addEventListener('prensas:anios-cambiados', ()=>{
  if(!DATOS) return;
  initMesSelectors(); initFiltroVariedad(); initAgrLotes();
  renderActive();
});
```
En `cargar()`, **antes** de `initMesSelectors();` agregar `montarAnios();` (así los meses ya salen filtrados). El aviso que dispara `montar` en la primera carga redibuja una vez de más; es inofensivo.

- [ ] **Step 3: Aplicar el filtro de años en cada lectura de pantalla**

Cambios exactos en `app.js` (las escrituras — `push`, `splice`, `unshift`, `indexOf` para borrar — **no** se tocan):

| Dónde | Antes | Después |
|---|---|---|
| `evaluarLotes` | `for(const l of DATOS.lotes){` | `for(const l of lotesVis()){` |
| `evaluarRiesgo` | `for(const l of DATOS.lotes){` | `for(const l of lotesVis()){` |
| `initMesSelectors` | `const set=new Set(DATOS.analisis.map(mesDe)…` | `const set=new Set(DATOS.analisis.filter(a=>visibleAnio(a.lote)).map(mesDe).filter(m=>m!=null));` |
| `initMesDegSelector` | ídem análisis; `DATOS.degustaciones.forEach(d=>{…})` | filtrar análisis igual y `DATOS.degustaciones.forEach(d=>{ if(d.mes!=null && visibleAnio(d.lote)) set.add(+d.mes); });` |
| Panel "Últimos agregados" (~372) | `[...(DATOS.agregados||[])]` | `(DATOS.agregados||[]).filter(a=>visibleAnio(a.lote))` y luego el mismo `.sort(...)` (sin el spread, `filter` ya copia) |
| `initFiltrosLotes` | `()=>DATOS.lotes` | `()=>lotesVis()` |
| `renderLotes` | `let rows=DATOS.lotes;` | `let rows=lotesVis();` |
| `renderLotes` contador | `rows.length+' / '+DATOS.lotes.length+' lotes'` | `rows.length+' / '+lotesVis().length+' lotes'` |
| `initFiltroVariedad` | `DATOS.lotes.map(` | `lotesVis().map(` |
| `initFiltrosAna` | `return DATOS.analisis;` | `return DATOS.analisis.filter(a=>visibleAnio(a.lote));` |
| `renderAnalisis` | `let rows=DATOS.analisis;` | `const base=DATOS.analisis.filter(a=>visibleAnio(a.lote)); let rows=base;` |
| `renderAnalisis` contador | `DATOS.analisis.length` | `base.length` |
| `initFiltrosAgr` | `return DATOS.agregados;` | `return DATOS.agregados.filter(a=>visibleAnio(a.lote));` |
| `agregadosFiltrados` | `let rows=DATOS.agregados;` | `let rows=DATOS.agregados.filter(a=>visibleAnio(a.lote));` |
| `renderAgregados` contador | `DATOS.agregados.length` | `DATOS.agregados.filter(a=>visibleAnio(a.lote)).length` |
| `initAgrLotes` | `DATOS.lotes.map(` | `lotesVis().map(` |
| `initFiltrosDeg` | `()=>DATOS.lotes` | `()=>lotesVis()` |
| `renderDegustacion` | `let rows=DATOS.lotes.map(` | `let rows=lotesVis().map(` |
| Lista NO OK de degustación (~999) | `DATOS.degustaciones.filter(d=>+d.mes===mes && d.estado==='nook')` | agregar `&& visibleAnio(d.lote)` |
| `hayNoOk` (~1043) | `DATOS.degustaciones.some(d=>+d.mes===mesDeg() && d.estado==='nook')` | agregar `&& visibleAnio(d.lote)` |
| Orden de muestras (`initFiltrosOrden`) | `opcionesValores(DATOS.lotes, …)` ×2 | `opcionesValores(lotesVis(), …)` |
| `variedadesDisponibles` | `DATOS.lotes.map(` | `lotesVis().map(` |
| `lotesRellenoVariedad` | `DATOS.lotes.filter(l=>(l.litros||0)>0)` | `lotesVis().filter(l=>(l.litros||0)>0)` |

Los conjuntos de validación de "Cargar análisis" y "Cargar agregados" (`lotesSet` en ~1093 y ~1158) **siguen con `DATOS.lotes`**: pegar un análisis de un lote del año apagado tiene que seguir siendo válido.

Después de los cambios, revisar: `grep -n "DATOS\.lotes" public/prensas/app.js`. Lo que quede tiene que ser una escritura, el `mapaLotes`, `lotesVis`, `montarAnios` o los dos `lotesSet`.

- [ ] **Step 4: Probar con dos años (documento de prueba)**

Hasta la Task 8 no hay 2025 real. Armar uno sintético en el scratchpad:
```bash
node -e "
const fs=require('fs');
const d=JSON.parse(JSON.parse(fs.readFileSync('C:/Users/Bmax/repos/catenainstitute/respaldo-nube-prensas-2026-09-09-corte.json','utf8'))[0].results[0].json);
const l25=d.lotes.slice(0,5).map((l,i)=>({...l,lote:25700+i,litros:i<2?100:0,dia_prensado:'2025-03-01'}));
const a25=l25.map(l=>({lote:l.lote,mes:1,fecha:'2026-01-16',ph:4.2,av:0.5,gluc:1,malico:0.1}));
d.lotes.push(...l25); d.analisis.push(...a25);
fs.writeFileSync(process.argv[1],JSON.stringify(d));
" "$S/doc-dos-anios.json"
```
Levantar el mock con `DOC="$S/doc-dos-anios.json"` (entrada aparte en launch.json: `prensas-como-lotes-2anios`, puerto 8808, misma línea con `"env":{"DOC":"…"}`; si `preview_start` no acepta `env`, arrancarlo como `cmd /c "set DOC=…&& node …"`).
Verificar:
- `#selAnios` visible con `2025` y `2026`; arranca con solo `2026` prendido (`aria-pressed`).
- Lotes: `278 / 278 lotes`. Prender 2025 → `283 / 283`. Apagar 2026 → `5 / 5`. Intentar apagar 2025 cuando es el único → no se apaga.
- F5 → recuerda la última elección (`localStorage.prensas_anios`).
- Panel con solo 2025: Total = 2 (los vaciados no cuentan), NO OK = 2 (pH 4,2).
- Selector de mes del Panel con solo 2025 → solo "Mes 1".
- Con un solo año en el documento real (mock :8807) `#selAnios` está oculto.

- [ ] **Step 5: Tests y commit**

Run: `npm test 2>&1 | tail -5` → verde.
```bash
git add public/prensas/index.html public/prensas/app.js
git commit -m "feat(prensas): selector de años 2025|2026 que manda en todas las pestañas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Conversor del Excel 2025

**Files:**
- Create: `scripts/leer-excel-prensas.py`
- Create: `scripts/convertir-prensas-nucleo.mjs`
- Create: `scripts/convertir-prensas.mjs`
- Test: `test/prensas-convertir.test.mjs`

**Interfaces:**
- `leer-excel-prensas.py <xlsx> <crudo.json>` escribe `{"lotes": [[...17 celdas]], "analisis": [[...25 celdas]]}` con fechas como `'YYYY-MM-DD'` y sin las filas de encabezado (LOTES desde la fila 3, ANÁLISIS desde la fila 3), solo filas con columna A no vacía.
- `convertirPrensas(crudo) → {lotes, analisis, reporte:{lotes, analisis, vacios_salteados, huerfanos:[]}}`.

Estructura real verificada del Excel (`Año 2025\Prensas 2025\Lotes prensas 2025.xlsx`):
- LOTES (índice de columna → campo): 0 Lote, 1 Variedad, 2 Lote origen, 3 IG, 4 ID, 5 Orden de prensado, 6 Litros, 7 Día prensado, 8 Días transcurridos (se descarta, es calculado), 9 Tipo de prensa, 10 SO2 agregado, 11 Refermentación, 12 Bacteria, 13 Actividad, 14 Comentario, 15 Degustación Brett, 16 Degustación AV. 258 lotes 25700–25957, 11 con litros > 0.
- ANÁLISIS: 0 lote, 1 mes, 2 fecha, 3 etanol, 4 ph, 5 av, 6 gluc, 7 malico, 8 lactico, 9 at, 10 azucar, 11 revisar_av, 12 brett, 13 aceticas, 14 lacticas, 15 levaduras, 16 hongos, 17 so2l, 18 so2t, 19 so2molec, 20 fecha_corr, 21 so2_corr, 22 th2, 23 otro, 24 ot. 980 filas con lote, 736 con alguna medida. Hay números como texto con coma y espacios (`' 1,7'`, `'0,02'`), un mes `55` (error de tipeo) y análisis fechados en 2026.

- [ ] **Step 1: Test que falla**

`test/prensas-convertir.test.mjs`:
```js
import { describe, it, expect } from 'vitest';
import { convertirPrensas } from '../scripts/convertir-prensas-nucleo.mjs';

const filaLote = (o = {}) => {
  const r = Array(17).fill(null);
  Object.assign(r, { 0: 25700, 1: 'Pinot Noir', 2: '25005, 25006', 3: 'El Cepillo', 4: 'PN El Cepillo',
    5: null, 6: 0, 7: '2025-02-24', 8: 386, 9: 'W', 10: 'NO', 11: 'NO', 12: 'NO' }, o);
  return r;
};
const filaAna = (o = {}) => {
  const r = Array(25).fill(null);
  Object.assign(r, { 0: 25700, 1: 3, 2: '2025-03-06' }, o);
  return r;
};

describe('convertirPrensas — lotes', () => {
  it('mapea las columnas a las claves de la web', () => {
    const { lotes } = convertirPrensas({ lotes: [filaLote()], analisis: [] });
    expect(lotes[0]).toEqual({ lote: 25700, variedad: 'Pinot Noir', origen: '25005, 25006', ig: 'El Cepillo',
      id_origen: 'PN El Cepillo', ot_prensado: null, litros: 0, dia_prensado: '2025-02-24', prensa: 'W',
      so2_agregado: 'NO', comentario: null, accion: null, comentario2: null, accion2: null });
  });
  it('origen numérico queda número, como en 2026', () => {
    const { lotes } = convertirPrensas({ lotes: [filaLote({ 2: 25162 })], analisis: [] });
    expect(lotes[0].origen).toBe(25162);
  });
  it('las columnas que la web no tiene van a comentario2 solo si dicen algo', () => {
    const { lotes } = convertirPrensas({ lotes: [filaLote({ 11: 'SI', 13: 'mucha', 15: 'alto', 16: 0.9 })], analisis: [] });
    expect(lotes[0].comentario2).toBe('Refermentación: SI · Actividad: mucha · Degustación Brett: alto · Degustación AV: 0.9');
  });
  it('NO en refermentación y bacteria no se anota', () => {
    const { lotes } = convertirPrensas({ lotes: [filaLote({ 11: 'no', 12: 'NO' })], analisis: [] });
    expect(lotes[0].comentario2).toBe(null);
  });
  it('lote repetido frena', () => {
    expect(() => convertirPrensas({ lotes: [filaLote(), filaLote()], analisis: [] })).toThrow(/repetido/);
  });
});

describe('convertirPrensas — análisis', () => {
  it('pasa números con coma y espacios', () => {
    const { analisis } = convertirPrensas({ lotes: [filaLote()],
      analisis: [filaAna({ 3: '13,0', 4: 3.85, 5: '0,58', 6: ' 1,7', 7: -999 })] });
    expect(analisis[0]).toMatchObject({ lote: 25700, mes: 3, fecha: '2025-03-06', etanol: 13, ph: 3.85, av: 0.58, gluc: 1.7, malico: -999 });
    expect(Object.keys(analisis[0])).toHaveLength(25);
  });
  it('mes inválido se toma de la fecha', () => {
    const { analisis } = convertirPrensas({ lotes: [filaLote()], analisis: [filaAna({ 1: 55, 2: '2025-05-20', 4: 3.5 })] });
    expect(analisis[0].mes).toBe(5);
  });
  it('mes vacío se toma de la fecha', () => {
    const { analisis } = convertirPrensas({ lotes: [filaLote()], analisis: [filaAna({ 1: null, 2: '2026-01-16', 4: 3.5 })] });
    expect(analisis[0].mes).toBe(1);
  });
  it('renglón sin ninguna medida ni dato se saltea y se cuenta', () => {
    const r = convertirPrensas({ lotes: [filaLote()], analisis: [filaAna(), filaAna({ 4: 3.5 })] });
    expect(r.analisis).toHaveLength(1);
    expect(r.reporte.vacios_salteados).toBe(1);
  });
  it('renglón sin medida pero con OT u otro dato se conserva', () => {
    const r = convertirPrensas({ lotes: [filaLote()], analisis: [filaAna({ 24: 'B182' })] });
    expect(r.analisis).toHaveLength(1);
    expect(r.analisis[0].ot).toBe('B182');
  });
  it('reporta huérfanos', () => {
    const r = convertirPrensas({ lotes: [filaLote()], analisis: [filaAna({ 0: 25999, 4: 3.5 })] });
    expect(r.reporte.huerfanos).toEqual([25999]);
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run test/prensas-convertir.test.mjs` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar el núcleo**

`scripts/convertir-prensas-nucleo.mjs`:
```js
/* Convierte las filas crudas de "Lotes prensas <año>.xlsx" (las lee
 * leer-excel-prensas.py) al formato del documento de Prensas web.
 * Puro: sin archivos, para poder testearlo. NO escribe en la base. */

const vacio = v => v === null || v === undefined || String(v).trim() === '';
const texto = v => (vacio(v) ? null : String(v).trim());
function numero(v){
  if (vacio(v)) return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).trim().replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}
/* Número si se puede leer entero como número; si no, texto (p. ej. "25005, 25006"). */
const numeroOTexto = v => (vacio(v) ? null : (/^\s*-?\d+([.,]\d+)?\s*$/.test(String(v)) ? numero(v) : texto(v)));
const fechaISO = v => (vacio(v) ? null : String(v).slice(0, 10));

const CLAVES_ANALISIS = ['lote', 'mes', 'fecha', 'etanol', 'ph', 'av', 'gluc', 'malico', 'lactico', 'at',
  'azucar', 'revisar_av', 'brett', 'aceticas', 'lacticas', 'levaduras', 'hongos', 'so2l', 'so2t',
  'so2molec', 'fecha_corr', 'so2_corr', 'th2', 'otro', 'ot'];
const NUMERICAS = new Set(['etanol', 'ph', 'av', 'gluc', 'malico', 'lactico', 'at', 'azucar', 'so2l', 'so2t',
  'so2molec', 'so2_corr', 'th2']);

/* Columnas del Excel que la web no tiene: van a comentario2 si dicen algo.
 * "NO" en refermentación/bacteria es el valor normal y no se anota. */
const EXTRAS = [
  { i: 11, rotulo: 'Refermentación', omitir: v => /^no$/i.test(v) },
  { i: 12, rotulo: 'Bacteria', omitir: v => /^no$/i.test(v) },
  { i: 13, rotulo: 'Actividad', omitir: v => /^no$/i.test(v) },
  { i: 15, rotulo: 'Degustación Brett', omitir: () => false },
  { i: 16, rotulo: 'Degustación AV', omitir: () => false },
];

function convertirLote(r){
  const extras = EXTRAS.map(e => [e, texto(r[e.i])]).filter(([e, v]) => v !== null && !e.omitir(v))
    .map(([e, v]) => `${e.rotulo}: ${v}`);
  return {
    lote: numero(r[0]), variedad: texto(r[1]), origen: numeroOTexto(r[2]), ig: texto(r[3]),
    id_origen: texto(r[4]), ot_prensado: texto(r[5]), litros: numero(r[6]), dia_prensado: fechaISO(r[7]),
    prensa: texto(r[9]), so2_agregado: texto(r[10]), comentario: texto(r[14]),
    accion: null, comentario2: extras.length ? extras.join(' · ') : null, accion2: null,
  };
}

function convertirAnalisis(r){
  const a = {};
  CLAVES_ANALISIS.forEach((k, i) => {
    const v = r[i];
    if (k === 'lote') a[k] = numero(v);
    else if (k === 'fecha' || k === 'fecha_corr') a[k] = fechaISO(v);
    else if (NUMERICAS.has(k)) a[k] = numero(v);
    else if (k === 'mes') a[k] = numero(v);
    else a[k] = texto(v);
  });
  if (!(Number.isInteger(a.mes) && a.mes >= 1 && a.mes <= 12)) a.mes = a.fecha ? Number(a.fecha.slice(5, 7)) : null;
  return a;
}

/* Sin ninguna medida ni dato propio (el Excel tiene renglones "preparados"). */
const analisisVacio = a => CLAVES_ANALISIS.slice(3).every(k => a[k] === null);

export function convertirPrensas(crudo){
  const lotes = (crudo.lotes || []).map(convertirLote);
  const vistos = new Set(), repetidos = new Set();
  for (const l of lotes) { if (vistos.has(l.lote)) repetidos.add(l.lote); vistos.add(l.lote); }
  if (repetidos.size) throw new Error(`el Excel trae el mismo lote repetido: ${[...repetidos].join(', ')}`);

  const todos = (crudo.analisis || []).map(convertirAnalisis);
  const analisis = todos.filter(a => !analisisVacio(a));
  const huerfanos = [...new Set(analisis.map(a => a.lote).filter(l => !vistos.has(l)))].sort((x, y) => x - y);
  return { lotes, analisis,
    reporte: { lotes: lotes.length, analisis: analisis.length, vacios_salteados: todos.length - analisis.length, huerfanos } };
}
```

- [ ] **Step 4: Verlo pasar**

Run: `npx vitest run test/prensas-convertir.test.mjs` → PASS (11 tests).

- [ ] **Step 5: Lector Python y CLI**

`scripts/leer-excel-prensas.py`:
```python
"""Lee "Lotes prensas <año>.xlsx" y escribe las filas crudas de LOTES y ANÁLISIS
en JSON, para que las convierta scripts/convertir-prensas.mjs.

    python scripts/leer-excel-prensas.py "<xlsx>" datos-origen/prensas-2025-crudo.json
"""
import datetime, json, sys
import openpyxl

def celda(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%Y-%m-%d')
    return v

def filas(ws, ancho):
    out = []
    for r in ws.iter_rows(min_row=3, values_only=True):
        r = list(r[:ancho]) + [None] * max(0, ancho - len(r))
        if r[0] is None or str(r[0]).strip() == '':
            continue
        out.append([celda(v) for v in r])
    return out

def main(xlsx, salida):
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    hoja_an = next(n for n in wb.sheetnames if 'LISIS' in n.upper())
    crudo = {'lotes': filas(wb['LOTES'], 17), 'analisis': filas(wb[hoja_an], 25)}
    with open(salida, 'w', encoding='utf-8') as f:
        json.dump(crudo, f, ensure_ascii=False)
    print(f"{len(crudo['lotes'])} lotes, {len(crudo['analisis'])} renglones de análisis -> {salida}")

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
```

`scripts/convertir-prensas.mjs`:
```js
/**
 * Convierte las filas crudas del Excel de Prensas al formato de la web.
 * NO escribe en la base.
 *
 *   python scripts/leer-excel-prensas.py "<Lotes prensas 2025.xlsx>" datos-origen/prensas-2025-crudo.json
 *   node scripts/convertir-prensas.mjs datos-origen/prensas-2025-crudo.json datos-origen/prensas-2025-convertido.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { convertirPrensas } from './convertir-prensas-nucleo.mjs';

const [entrada, salida] = process.argv.slice(2);
if (!entrada || !salida) { console.error('uso: node scripts/convertir-prensas.mjs <crudo.json> <salida.json>'); process.exit(1); }
const { lotes, analisis, reporte } = convertirPrensas(JSON.parse(readFileSync(entrada, 'utf8')));
writeFileSync(salida, JSON.stringify({ lotes, analisis }));
console.log(`${reporte.lotes} lotes, ${reporte.analisis} análisis (${reporte.vacios_salteados} renglones vacíos salteados)`);
if (reporte.huerfanos.length) console.log(`AVISO: análisis de lotes que no están en LOTES: ${reporte.huerfanos.join(', ')}`);
console.log(`Escrito en ${salida}`);
```

- [ ] **Step 6: Correrlo con el Excel real**

```bash
mkdir -p datos-origen
python scripts/leer-excel-prensas.py "C:/Users/Bmax/OneDrive - BODEGAS ESMERALDA SA/Año 2025/Prensas 2025/Lotes prensas 2025.xlsx" datos-origen/prensas-2025-crudo.json
node scripts/convertir-prensas.mjs datos-origen/prensas-2025-crudo.json datos-origen/prensas-2025-convertido.json
```
Expected: `258 lotes, 980 renglones…` y luego `258 lotes, ~737 análisis (~243 renglones vacíos salteados)`, sin huérfanos. `datos-origen/` está gitignorado: comprobar con `git status --short` que no aparece.

- [ ] **Step 7: Commit**

```bash
git add scripts/leer-excel-prensas.py scripts/convertir-prensas-nucleo.mjs scripts/convertir-prensas.mjs test/prensas-convertir.test.mjs
git commit -m "feat(prensas): conversor del Excel de una vendimia al formato de la web

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Fusionar el año en el documento de Prensas

**Files:**
- Create: `scripts/fusionar-anio-prensas-nucleo.mjs`
- Modify: `scripts/fusionar-anio.mjs` (flag `--modulo`)
- Test: `test/prensas-fusionar-anio.test.mjs`

**Interfaces:**
- Consumes: `{lotes, analisis}` de la Task 7; `anioDeLote` de `public/shared/anios.js`.
- Produces: `fusionarAnioPrensas(doc, convertido, anio) → {doc, reporte:{lotes, analisis, huerfanos}}`. Solo agrega; sube `meta.version` en 1; no toca degustaciones ni agregados.

- [ ] **Step 1: Test que falla**

`test/prensas-fusionar-anio.test.mjs`:
```js
import { describe, it, expect } from 'vitest';
import { fusionarAnioPrensas } from '../scripts/fusionar-anio-prensas-nucleo.mjs';

const doc = () => ({ meta: { version: 89 }, lotes: [{ lote: 26701 }], analisis: [{ lote: 26701, ph: 3.9 }],
  degustaciones: [{ lote: 26701, mes: 6 }], agregados: [{ id: 1, lote: 26701 }] });
const conv = () => ({ lotes: [{ lote: 25700 }, { lote: 25701 }], analisis: [{ lote: 25700, ph: 3.5 }] });

describe('fusionarAnioPrensas', () => {
  it('agrega lotes y análisis al final sin tocar lo demás', () => {
    const { doc: d, reporte } = fusionarAnioPrensas(doc(), conv(), 2025);
    expect(d.lotes.map(l => l.lote)).toEqual([26701, 25700, 25701]);
    expect(d.analisis).toHaveLength(2);
    expect(d.degustaciones).toEqual(doc().degustaciones);
    expect(d.agregados).toEqual(doc().agregados);
    expect(d.meta.version).toBe(90);
    expect(reporte).toEqual({ lotes: 2, analisis: 1, huerfanos: [] });
  });
  it('no importa dos veces el mismo año', () => {
    const d = doc(); d.lotes.push({ lote: 25700 });
    expect(() => fusionarAnioPrensas(d, conv(), 2025)).toThrow(/ya tiene/);
  });
  it('frena si el Excel trae lotes de otro año', () => {
    const c = conv(); c.lotes.push({ lote: 26999 });
    expect(() => fusionarAnioPrensas(doc(), c, 2025)).toThrow(/no son de 2025/);
  });
  it('frena si trae análisis de otro año', () => {
    const c = conv(); c.analisis.push({ lote: 26701, ph: 3 });
    expect(() => fusionarAnioPrensas(doc(), c, 2025)).toThrow(/análisis que no son de 2025/);
  });
  it('no modifica el documento de entrada', () => {
    const d = doc();
    fusionarAnioPrensas(d, conv(), 2025);
    expect(d.lotes).toHaveLength(1);
    expect(d.meta.version).toBe(89);
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `npx vitest run test/prensas-fusionar-anio.test.mjs` → FAIL.

- [ ] **Step 3: Implementar**

`scripts/fusionar-anio-prensas-nucleo.mjs`:
```js
/* Suma una vendimia convertida (convertir-prensas.mjs) al documento de
 * Prensas. Puro: sin archivos ni red. Solo AGREGA lotes y análisis; si el
 * documento ya tiene algún lote del año se frena (importar dos veces
 * duplicaría todo). Degustaciones y agregados no se tocan. */
import { anioDeLote } from '../public/shared/anios.js';

export function fusionarAnioPrensas(doc, convertido, anio){
  const lotes = convertido.lotes || [], analisis = convertido.analisis || [];
  const ajenos = lotes.filter(l => anioDeLote(l.lote) !== anio).map(l => l.lote);
  if (ajenos.length) throw new Error(`el Excel trae lotes que no son de ${anio}: ${ajenos.slice(0, 10).join(', ')}`);
  const anAjenos = [...new Set(analisis.filter(a => anioDeLote(a.lote) !== anio).map(a => a.lote))];
  if (anAjenos.length) throw new Error(`el Excel trae análisis que no son de ${anio}: ${anAjenos.slice(0, 10).join(', ')}`);
  const yaEstan = (doc.lotes || []).filter(l => anioDeLote(l.lote) === anio);
  if (yaEstan.length) throw new Error(`el documento ya tiene ${yaEstan.length} lotes de ${anio}: no se importa dos veces`);

  const maestro = new Set(lotes.map(l => l.lote));
  const huerfanos = [...new Set(analisis.map(a => a.lote).filter(l => !maestro.has(l)))].sort((x, y) => x - y);
  return {
    doc: { ...doc, meta: { ...(doc.meta || {}), version: Number((doc.meta || {}).version || 0) + 1 },
           lotes: [...(doc.lotes || []), ...lotes], analisis: [...(doc.analisis || []), ...analisis] },
    reporte: { lotes: lotes.length, analisis: analisis.length, huerfanos },
  };
}
```

- [ ] **Step 4: CLI con `--modulo`**

En `scripts/fusionar-anio.mjs`:
- Agregar al comentario de uso: ` *   node scripts/fusionar-anio.mjs --modulo prensas --anio 2025 --doc respaldo-nube-prensas-<fecha>.json --anio-json datos-origen/prensas-2025-convertido.json --salida datos-origen/prensas-con-2025.json`
- Importar `import { fusionarAnioPrensas } from './fusionar-anio-prensas-nucleo.mjs';`
- `const modulo = arg('--modulo') ?? 'lotes';` y si no es `lotes` ni `prensas`, error de uso.
- Reemplazar la llamada por:
```js
const conv = JSON.parse(readFileSync(rAnio, 'utf8'));
const { doc: nuevo, reporte } = modulo === 'prensas'
  ? fusionarAnioPrensas(doc, conv, anio)
  : fusionarAnio(doc, conv, anio);
```
- El `console.log` de "renglones vacíos salteados" usa `reporte.analisis_vacios`; en prensas no existe: mostrarlo solo si `reporte.analisis_vacios !== undefined`.

- [ ] **Step 5: Pasar y probar con el respaldo**

Run: `npx vitest run test/prensas-fusionar-anio.test.mjs test/lotes-fusionar-anio.test.mjs` → PASS.
```bash
node scripts/fusionar-anio.mjs --modulo prensas --anio 2025 --doc C:/Users/Bmax/repos/catenainstitute/respaldo-nube-prensas-2026-09-09-corte.json --anio-json datos-origen/prensas-2025-convertido.json --salida datos-origen/prensas-con-2025-prueba.json
```
Expected: `Documento v89: +258 lotes 2025, +~737 análisis`, tamaño ~1 MB.

- [ ] **Step 6: Commit**

```bash
git add scripts/fusionar-anio-prensas-nucleo.mjs scripts/fusionar-anio.mjs test/prensas-fusionar-anio.test.mjs
git commit -m "feat(prensas): fusionar una vendimia en el documento de Prensas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verificación integral con el 2025 real (sin tocar producción)

**Files:** ninguno nuevo (solo scratchpad).

- [ ] **Step 1: Suite completa y tipos**

```bash
npm test 2>&1 | tail -5 && npx tsc --noEmit && echo TSC-OK
```
Expected: todo verde y `TSC-OK`.

- [ ] **Step 2: Navegador con el documento fusionado**

Mock con `DOC=datos-origen/prensas-con-2025-prueba.json` (ruta absoluta). Verificar y anotar números:
- Selector visible; por defecto solo 2026: Panel, Lotes (278), Análisis y Degustación iguales que en el mock de 1 año.
- Prender 2025: Lotes 536; filtro Vacíos de 2025 solo → 247 (258 − 11 llenos); Panel con 2025 solo → Total 11.
- Un lote 2025 con análisis de enero 2026 (p. ej. buscar en Análisis `25863`): en el Panel su último análisis es el de 2026.
- Abrir Análisis con los dos años: medir con `performance.now()` alrededor de `renderAnalisis()` vía `javascript_tool`. Anotar el tiempo (sirve de línea de base para la Entrega 2).
- Lotes web no se probó en el navegador: comprobar que `public/lotes/js/selector-anios.js` y `filtro-llenado.js` cargan con el `node --input-type=module` de la Task 3, Step 6.
- `read_console_messages {onlyErrors:true}` vacío en todas las pruebas.
- Screenshot de Lotes con 2025 prendido y filas atenuadas para el usuario.

- [ ] **Step 3: Revisión de código**

Usar superpowers:requesting-code-review sobre `git diff main...HEAD`. Corregir lo que salga, con commit propio.

---

### Task 10: Publicación (SOLO con OK explícito del usuario en el momento)

Orden obligatorio: **primero el código, después los datos** (con el código viejo en producción, los 11 lotes 2025 llenos aparecerían mezclados en el Panel sin selector).

- [ ] **Step 1:** Pedir OK al usuario. Mergear `feat/prensas-como-lotes` a `main` desde `repos\catenainstitute` **solo si** su `git status` está limpio y en `main`; si no, avisar y no tocar. El `git push` probablemente lo bloquee el clasificador: en ese caso el usuario lo corre.
- [ ] **Step 2:** El usuario despliega desde una carpeta en main limpio: `cd /d C:\Users\Bmax\repos\catenainstitute` y `npx.cmd wrangler deploy`.
- [ ] **Step 3:** Con OK del usuario: respaldo de la nube `npx wrangler d1 execute catenainstitute --remote --json --command "SELECT json FROM documento WHERE modulo='prensas'" > respaldo-nube-prensas-2026-10-XX-pre-2025.json`; anotar `meta.version`.
- [ ] **Step 4:** Fusionar sobre ese respaldo (no sobre el del corte): `node scripts/fusionar-anio.mjs --modulo prensas --anio 2025 --doc respaldo-nube-prensas-2026-10-XX-pre-2025.json --anio-json datos-origen/prensas-2025-convertido.json --salida datos-origen/prensas-con-2025.json`.
- [ ] **Step 5:** Re-chequear que la versión de la nube no cambió desde el respaldo (el equipo edita en vivo); si cambió, volver al Step 3.
- [ ] **Step 6:** `node scripts/importar.mjs --modulo prensas --remote --piso-la-web --datos datos-origen/prensas-con-2025.json` → `✓ Importación verificada`. Rollback = importar el respaldo del Step 3 con la misma bandera.
- [ ] **Step 7:** Pedirle al usuario Ctrl+F5 en la web y que confirme que aparece el selector 2025 | 2026.
