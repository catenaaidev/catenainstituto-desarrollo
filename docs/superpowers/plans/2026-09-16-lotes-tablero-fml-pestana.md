# Tablero FML — Tramos 2 a 4: la pestaña

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la pestaña "Seguimiento FML" por el tablero aprobado por los supervisores, alimentado por el motor del tramo 1, y dar de baja la vieja.

**Architecture:** Toda la lógica que se puede decidir sin DOM vive en `tablero-datos.js`, un módulo puro que se testea en el runtime de Workers igual que `orden-filas.js`. Los otros cuatro archivos sólo dibujan: `vista-tablero.js` orquesta y filtra, `tablero-panel.js` pinta el panel, `tablero-ficha.js` la ficha, `tablero-export.js` el Excel. La pestaña vieja queda viva hasta la última tarea, para poder mirar las dos en paralelo.

**Tech Stack:** JavaScript vanilla con módulos ES (sin build), Vitest sobre el runtime de Workers, SheetJS ya vendorizado.

**Spec:** `docs/superpowers/specs/2026-09-14-lotes-tablero-fml-design.md`

## Global Constraints

- Rama de trabajo: `feat/tablero-fml`. El tramo 1 (el motor) ya está mergeado ahí.
- **El motor decide, la vista dibuja.** Ninguna regla se recalcula en JS: estados, condiciones, acción sugerida y antigüedad vienen resueltos del servidor. Si algo no se puede pintar sin recalcular, le falta un campo a la salida del motor — se agrega ahí, no acá.
- **El servidor ya manda todo.** `datosDashboard()` (`src/lotes/vistas.ts:36-91`) devuelve `evaluar()` sin filtrar campos. Los 38 campos de `ResultadoLote` ya viajan al cliente. **Este plan no toca `src/`** salvo lo que diga una tarea explícitamente.
- Los datos se leen de dos lados: `dashData().lotes[]` (el motor) y `DATOS().lotes[]` (proyecto, vasija, litros, mermo, `hace_fml`). Se cruzan por número de lote como string.
- Guardado: no hay ruta por lote. Todo pasa por `POST /datos` con el documento entero y versión optimista (`guardar()` en `nucleo.js:161`).
- Paleta del tablero aprobado: OK `#DCFCE7`/`#166534`, problema `#FDE8EC`/`#8A1538`, neutro `#F1F5F9`/`#52606D`, primario `#0B6FAE`, fondo `#F4F7FA`, panel `#FFFFFF`, línea `#CBD5E1`, tinta `#17212B`.
- **No se porta** la variante de tarjetas mobile: esta app se usa en escritorio.
- Comandos: `npm test` y `npx tsc --noEmit`. Los dos verdes en cada commit.
- Mensajes de commit en español, sin tildes en el asunto (convención del repo).
- Los tests de módulos del front van en `.mjs` a propósito, para quedar fuera del typecheck (ver `CLAUDE.md`: no hay declaraciones para `.mjs` y `tsc` frenaría el despliegue).
- Cuando una tarea dice "agregar al final del archivo de test" y el bloque trae un `import`, **fusionalo con el `import` que ya está arriba** en vez de dejar un `import` al pie. Funciona igual (se hoistean), pero un archivo con imports en dos lugares se lee mal. Pasa en las Tareas 2, 9 y 10.

## Lo que ya está hecho y el spec todavía pide

Tres correcciones al spec, verificadas contra el código el 2026-09-16:

1. **`reporte.ts` ya nombra las 11 condiciones.** El spec pide agregarle 2 etiquetas a mano; el tramo 1 lo resolvió derivando `ETIQUETAS_ALARMA` de `CONDICIONES` (`src/lotes/reporte.ts:15-17`, commit `ecf7ce7`). Esa tarea del tramo 4 **no existe**.
2. **`criterios.js` ya tiene las 3 claves nuevas** (`so2_caida_max`, `so2_aplica`, `ph_max_inclusive`, en `public/lotes/js/criterios.js:22-24`). Falta sólo `vista-config.js`, que es otra lista (Tarea 12).
3. **`hace_fml` y `mermo` no se editan en ningún lado de la app.** Las cuatro columnas AO:AR se sacaron de la grilla cuando el FML tuvo pestaña propia (`public/lotes/js/vista-lotes.js:77-81`). La ficha va a ser el **primer** escritor: la Tarea 9 construye ese camino entero, no reusa uno.

---

### Task 1: `tablero-datos.js` — chips y antigüedad

**Files:**
- Create: `public/lotes/js/tablero-datos.js`
- Test: `test/lotes-tablero-datos.test.mjs`

**Interfaces:**
- Consumes: nada. Módulo puro, sin DOM ni fetch.
- Produces: `chipsDe(fila, hoy) → [{clave, texto, tono, titulo}]` con `tono` en `'ok' | 'mal' | 'neutro'`; y `antiguedadTexto(desde, hoy) → string`.

- [ ] **Step 1: Escribir el test que falla**

Crear `test/lotes-tablero-datos.test.mjs`:

```javascript
/* tablero-datos.js es puro (sin DOM ni fetch), asi que se importa tal cual
 * dentro del runtime de Workers, igual que hace lotes-orden-fuente.test.mjs. */
import { describe, it, expect } from 'vitest';
import { chipsDe, antiguedadTexto } from '../public/lotes/js/tablero-datos.js';

const HOY = '2026-09-16';

/* Fila del dashboard sin una sola condicion activa. */
const SANO = {
  lote: '26001', variedad: 'Malbec',
  estado_frecuencia: 'al_dia', fml_estado: 'finalizada',
  so2_estado: 'ok', ph_estado: 'ok', estado_llenado: 'lleno',
  condiciones: [], alarmas: [],
};

const claves = (fila) => chipsDe(fila, HOY).map(c => c.clave);
const texto = (fila, clave) => chipsDe(fila, HOY).find(c => c.clave === clave).texto;

describe('chipsDe', () => {
  it('el lote sano lleva los cinco chips en verde', () => {
    const chips = chipsDe(SANO, HOY);
    expect(chips.map(c => c.texto)).toEqual(['Frec', 'FML', 'SO₂', 'pH', 'Lleno']);
    expect(chips.every(c => c.tono === 'ok')).toBe(true);
  });

  it('da vuelta el chip y le pone la antiguedad cuando la condicion esta activa', () => {
    const fila = {
      ...SANO, estado_frecuencia: 'vencido',
      condiciones: [{ clave: 'frecuencia_vencida', etiqueta: 'Frecuencia vencida', accion: 'hacer OT y analizar', desde: '2026-09-06' }],
      alarmas: ['frecuencia_vencida'],
    };
    expect(texto(fila, 'frecuencia')).toBe('Frec vencida · 10 d');
    expect(chipsDe(fila, HOY).find(c => c.clave === 'frecuencia').tono).toBe('mal');
  });

  it('sin fecha desde, el chip no inventa antiguedad', () => {
    const fila = {
      ...SANO, estado_llenado: 'no_lleno',
      condiciones: [{ clave: 'no_lleno', etiqueta: 'No lleno', accion: 'dar lleno o achicar', desde: null }],
      alarmas: ['no_lleno'],
    };
    expect(texto(fila, 'llenado')).toBe('No lleno');
  });

  it('SO2 no aplica se pinta neutro, no verde ni rojo', () => {
    expect(chipsDe({ ...SANO, so2_estado: 'no_aplica' }, HOY).find(c => c.clave === 'so2').tono).toBe('neutro');
  });

  it('sin datos tambien es neutro', () => {
    expect(chipsDe({ ...SANO, ph_estado: 'sin_datos' }, HOY).find(c => c.clave === 'ph').tono).toBe('neutro');
  });

  it('AV alerta y caida de SO2 solo aparecen cuando corresponden', () => {
    expect(claves(SANO)).not.toContain('av_alerta');
    const fila = {
      ...SANO,
      condiciones: [
        { clave: 'av_alerta', etiqueta: 'AV alerta', accion: 'revisar urgente', desde: '2026-09-14' },
        { clave: 'so2_caida_alerta', etiqueta: 'Caída de SO₂ libre >12 ppm', accion: 'confirmar SO2', desde: '2026-09-15' },
      ],
      alarmas: ['av_alerta', 'so2_caida_alerta'],
    };
    expect(claves(fila)).toContain('av_alerta');
    expect(texto(fila, 'av_alerta')).toBe('AV alerta · 2 d');
    expect(texto(fila, 'so2_caida_alerta')).toBe('Caída SO₂ · 1 d');
  });

  it('el titulo del chip trae la etiqueta y la accion que mando el motor', () => {
    const fila = {
      ...SANO, ph_estado: 'no_ok',
      condiciones: [{ clave: 'ph_no_ok', etiqueta: 'pH no OK', accion: 'revisar ajuste SO2/pH', desde: '2026-09-15' }],
      alarmas: ['ph_no_ok'],
    };
    expect(chipsDe(fila, HOY).find(c => c.clave === 'ph').titulo).toBe('pH no OK — revisar ajuste SO2/pH');
  });
});

describe('antiguedadTexto', () => {
  it('cuenta los dias en UTC', () => {
    expect(antiguedadTexto('2026-09-06', HOY)).toBe('10 d');
    expect(antiguedadTexto('2026-09-16', HOY)).toBe('hoy');
  });

  it('sin fecha devuelve vacio', () => {
    expect(antiguedadTexto(null, HOY)).toBe('');
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npx vitest run test/lotes-tablero-datos.test.mjs`
Expected: FAIL — `Failed to load url ../public/lotes/js/tablero-datos.js`.

- [ ] **Step 3: Implementar**

Crear `public/lotes/js/tablero-datos.js`:

```javascript
/* ===== Lotes CIW — el tablero, lo que se puede decidir sin DOM =====
 *
 * Modulo puro: sin DOM, sin fetch, sin estado. Todo lo que la pestana necesita
 * derivar de una fila del dashboard vive aca, para poder testearlo.
 *
 * "Derivar" no es "recalcular": los estados y la antiguedad los decide el
 * motor en el servidor. Aca solo se elige que texto y que color le toca a
 * cada uno. Si algo no se puede pintar sin volver a aplicar una regla, le
 * falta un campo a la salida del motor.
 */
'use strict';

const DIA = 86400000;

/** Dias entre dos fechas ISO, en UTC. Nunca hora local: el motor cuenta igual. */
export function diasEntre(desde, hoy){
  if (!desde || !hoy) return null;
  const a = Date.parse(desde + 'T00:00:00Z');
  const b = Date.parse(hoy + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / DIA);
}

export function antiguedadTexto(desde, hoy){
  const d = diasEntre(desde, hoy);
  if (d === null) return '';
  return d <= 0 ? 'hoy' : `${d} d`;
}

/* Los cinco ejes que siempre se muestran: el chip cambia de texto y de color
 * segun el estado, pero nunca desaparece. Leer la fila de un vistazo es el
 * punto del tablero. */
const EJES = [
  { clave: 'frecuencia', campo: 'estado_frecuencia', cond: 'frecuencia_vencida',
    ok: 'Frec',  mal: 'Frec vencida', okSi: 'al_dia' },
  { clave: 'fml',        campo: 'fml_estado',        cond: 'fml_no_finalizada',
    ok: 'FML',   mal: 'FML no',       okSi: ['finalizada', 'excluida'] },
  { clave: 'so2',        campo: 'so2_estado',        cond: 'so2_no_ok',
    ok: 'SO₂',   mal: 'SO₂ no',       okSi: 'ok' },
  { clave: 'ph',         campo: 'ph_estado',         cond: 'ph_no_ok',
    ok: 'pH',    mal: 'pH no',        okSi: 'ok' },
  { clave: 'llenado',    campo: 'estado_llenado',    cond: 'no_lleno',
    ok: 'Lleno', mal: 'No lleno',     okSi: 'lleno' },
];

/* Los dos que solo aparecen cuando el motor los prende. */
const EVENTUALES = [
  { clave: 'av_alerta',        cond: 'av_alerta',        texto: 'AV alerta' },
  { clave: 'so2_caida_alerta', cond: 'so2_caida_alerta', texto: 'Caída SO₂' },
];

const esOk = (valor, okSi) => Array.isArray(okSi) ? okSi.includes(valor) : valor === okSi;

export function chipsDe(fila, hoy){
  const activas = new Map((fila.condiciones || []).map(c => [c.clave, c]));
  const chips = [];

  const conSufijo = (texto, cond) => {
    const ant = antiguedadTexto(cond && cond.desde, hoy);
    return ant ? `${texto} · ${ant}` : texto;
  };
  const titulo = (cond, porDefecto) =>
    cond ? `${cond.etiqueta} — ${cond.accion}` : porDefecto;

  for (const eje of EJES){
    const cond = activas.get(eje.cond);
    const valor = fila[eje.campo];
    let tono;
    if (cond) tono = 'mal';
    else if (esOk(valor, eje.okSi)) tono = 'ok';
    else tono = 'neutro';   // no_aplica, sin_datos, sin_dato, desconocido

    chips.push({
      clave: eje.clave,
      texto: cond ? conSufijo(eje.mal, cond) : eje.ok,
      tono,
      titulo: titulo(cond, String(valor ?? '')),
    });
  }

  for (const ev of EVENTUALES){
    const cond = activas.get(ev.cond);
    if (!cond) continue;
    chips.push({ clave: ev.clave, texto: conSufijo(ev.texto, cond), tono: 'mal', titulo: titulo(cond, ev.texto) });
  }

  return chips;
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `npx vitest run test/lotes-tablero-datos.test.mjs`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/tablero-datos.js test/lotes-tablero-datos.test.mjs
git commit -m "feat: los chips del tablero y su antiguedad, como funcion pura"
```

---

### Task 2: `tablero-datos.js` — orden y preguntas frecuentes

**Files:**
- Modify: `public/lotes/js/tablero-datos.js`
- Test: `test/lotes-tablero-datos.test.mjs`

**Interfaces:**
- Consumes: `diasEntre` de la Tarea 1.
- Produces: `ordenarPorAntiguedad(filas) → filas` (copia, no muta); `PREGUNTAS` (array de `{val, text}`); `pasaPregunta(fila, val, info) → boolean`.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `test/lotes-tablero-datos.test.mjs`:

```javascript
import { ordenarPorAntiguedad, pasaPregunta, PREGUNTAS } from '../public/lotes/js/tablero-datos.js';

const conCondicion = (lote, desde) => ({
  lote, condiciones: desde === null ? [] : [{ clave: 'ph_no_ok', etiqueta: 'pH no OK', accion: 'x', desde }],
});

describe('ordenarPorAntiguedad', () => {
  it('primero la condicion mas vieja', () => {
    const filas = [conCondicion('B', '2026-09-10'), conCondicion('A', '2026-08-01'), conCondicion('C', '2026-09-15')];
    expect(ordenarPorAntiguedad(filas).map(f => f.lote)).toEqual(['A', 'B', 'C']);
  });

  it('los lotes sin condiciones van al final, no al principio', () => {
    const filas = [conCondicion('SANO', null), conCondicion('VIEJO', '2026-08-01')];
    expect(ordenarPorAntiguedad(filas).map(f => f.lote)).toEqual(['VIEJO', 'SANO']);
  });

  it('una condicion sin fecha ordena despues de las fechadas pero antes de las sanas', () => {
    const sinFecha = { lote: 'SIN_FECHA', condiciones: [{ clave: 'no_lleno', etiqueta: 'No lleno', accion: 'x', desde: null }] };
    const filas = [conCondicion('SANO', null), sinFecha, conCondicion('VIEJO', '2026-08-01')];
    expect(ordenarPorAntiguedad(filas).map(f => f.lote)).toEqual(['VIEJO', 'SIN_FECHA', 'SANO']);
  });

  it('no muta el array que recibe', () => {
    const filas = [conCondicion('B', '2026-09-10'), conCondicion('A', '2026-08-01')];
    ordenarPorAntiguedad(filas);
    expect(filas.map(f => f.lote)).toEqual(['B', 'A']);
  });
});

describe('pasaPregunta', () => {
  const fila = (extra) => ({ fml_estado: 'no_finalizada', fa_estado: 'finalizada', estado_llenado: 'lleno', alarmas: [], ...extra });

  it('las cinco preguntas del tablero, en orden', () => {
    expect(PREGUNTAS.map(p => p.val)).toEqual(['fml_no_terminada', 'fml_terminada', 'mermos', 'faltan_analizar', 'fa_en_proceso']);
  });

  it('sin pregunta elegida pasan todas las filas', () => {
    expect(pasaPregunta(fila(), '')).toBe(true);
  });

  it('FML no terminada y FML terminada son complementarias', () => {
    expect(pasaPregunta(fila({ fml_estado: 'no_finalizada' }), 'fml_no_terminada')).toBe(true);
    expect(pasaPregunta(fila({ fml_estado: 'finalizada' }), 'fml_no_terminada')).toBe(false);
    expect(pasaPregunta(fila({ fml_estado: 'finalizada' }), 'fml_terminada')).toBe(true);
    expect(pasaPregunta(fila({ fml_estado: 'excluida' }), 'fml_terminada')).toBe(true);
  });

  it('mermos mira el estado de llenado', () => {
    expect(pasaPregunta(fila({ estado_llenado: 'no_lleno' }), 'mermos')).toBe(true);
    expect(pasaPregunta(fila({ estado_llenado: 'lleno' }), 'mermos')).toBe(false);
  });

  it('faltan analizar junta las tres condiciones que piden OT', () => {
    expect(pasaPregunta(fila({ alarmas: ['sin_analisis_valido'] }), 'faltan_analizar')).toBe(true);
    expect(pasaPregunta(fila({ alarmas: ['control_proceso_pendiente'] }), 'faltan_analizar')).toBe(true);
    expect(pasaPregunta(fila({ alarmas: ['frecuencia_vencida'] }), 'faltan_analizar')).toBe(true);
    expect(pasaPregunta(fila({ alarmas: ['ph_no_ok'] }), 'faltan_analizar')).toBe(false);
  });

  it('FA en proceso es la FA sin terminar', () => {
    expect(pasaPregunta(fila({ fa_estado: 'no_finalizada' }), 'fa_en_proceso')).toBe(true);
    expect(pasaPregunta(fila({ fa_estado: 'finalizada' }), 'fa_en_proceso')).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npx vitest run test/lotes-tablero-datos.test.mjs -t "ordenarPorAntiguedad"`
Expected: FAIL — `ordenarPorAntiguedad is not a function`.

- [ ] **Step 3: Implementar**

Agregar al final de `public/lotes/js/tablero-datos.js`:

```javascript
/* --- orden por defecto: las condiciones mas viejas primero --- */

/* Tres escalones, y el del medio es el que importa: un lote con una condicion
 * activa pero sin fecha (no_lleno, datos incompletos) esta peor que uno sano,
 * asi que no puede caer al fondo junto con los sanos. */
const SIN_FECHA = '9999-12-30';
const SANO = '9999-12-31';

function masVieja(fila){
  const fechas = (fila.condiciones || []).map(c => c.desde).filter(Boolean).sort();
  if (fechas.length) return fechas[0];
  return (fila.condiciones || []).length ? SIN_FECHA : SANO;
}

export function ordenarPorAntiguedad(filas){
  return [...filas].sort((a, b) => masVieja(a).localeCompare(masVieja(b)));
}

/* --- preguntas frecuentes --- */

export const PREGUNTAS = [
  { val: 'fml_no_terminada', text: 'FML no terminada' },
  { val: 'fml_terminada',    text: 'FML terminada' },
  { val: 'mermos',           text: 'Mermos' },
  { val: 'faltan_analizar',  text: 'Faltan analizar' },
  { val: 'fa_en_proceso',    text: 'FA en proceso' },
];

/* Las tres condiciones cuya accion sugerida es "hacer OT y analizar". */
const PIDEN_OT = ['sin_analisis_valido', 'control_proceso_pendiente', 'frecuencia_vencida'];

export function pasaPregunta(fila, val){
  if (!val) return true;
  const alarmas = fila.alarmas || [];
  switch (val){
    case 'fml_no_terminada': return fila.fml_estado === 'no_finalizada';
    case 'fml_terminada':    return fila.fml_estado === 'finalizada' || fila.fml_estado === 'excluida';
    case 'mermos':           return fila.estado_llenado === 'no_lleno';
    case 'faltan_analizar':  return PIDEN_OT.some(c => alarmas.includes(c));
    case 'fa_en_proceso':    return fila.fa_estado === 'no_finalizada';
    default:                 return true;
  }
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `npx vitest run test/lotes-tablero-datos.test.mjs`
Expected: PASS — 19 tests.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/tablero-datos.js test/lotes-tablero-datos.test.mjs
git commit -m "feat: orden por antiguedad y preguntas frecuentes del tablero"
```

---

### Task 3: La pestaña registrada y vacía

**Files:**
- Create: `public/lotes/js/vista-tablero.js`
- Modify: `public/lotes/index.html` (botón de pestaña junto al de FML, sección nueva, y las variables de la paleta)
- Modify: `public/lotes/js/app.js:16` (agregar el import, **sin** sacar el de `vista-fml.js`)

**Interfaces:**
- Consumes: `registrarVista` y `dashData`/`cargarDashboard` de `nucleo.js`.
- Produces: la vista `'tablero'`, y la función `renderTablero()` que las tareas siguientes van completando.

- [ ] **Step 1: Agregar la pestaña al HTML**

En `public/lotes/index.html`, **después** de la línea 819 (`<button data-v="fml">🧫 Seguimiento FML</button>`):

```html
<button data-v="tablero">🧪 Tablero FML</button>
```

Y después de la línea 1024 (`<section class="view" id="tab-fml"></section>`):

```html
<section class="view" id="tab-tablero"></section>
```

En el bloque `:root` de estilos, agregar la paleta del tablero aprobado:

```css
  --tb-ok-bg:#DCFCE7;   --tb-ok-fg:#166534;
  --tb-mal-bg:#FDE8EC;  --tb-mal-fg:#8A1538;
  --tb-neu-bg:#F1F5F9;  --tb-neu-fg:#52606D;
  --tb-primario:#0B6FAE; --tb-fondo:#F4F7FA;
  --tb-panel:#FFFFFF;   --tb-linea:#CBD5E1; --tb-tinta:#17212B;
```

Y las clases de los chips:

```css
  .tb-chip{display:inline-block;padding:2px 8px;margin:1px;border-radius:10px;font-size:12px;white-space:nowrap}
  .tb-chip.ok{background:var(--tb-ok-bg);color:var(--tb-ok-fg)}
  .tb-chip.mal{background:var(--tb-mal-bg);color:var(--tb-mal-fg)}
  .tb-chip.neutro{background:var(--tb-neu-bg);color:var(--tb-neu-fg)}
```

- [ ] **Step 2: Crear la vista mínima**

Crear `public/lotes/js/vista-tablero.js`:

```javascript
/* ===== Lotes CIW — Tablero FML =====
 *
 * Reemplaza la pestana "Seguimiento FML". Orquesta: pide los datos, arma los
 * filtros, pinta la lista y abre la ficha. Todo lo que se puede decidir sin
 * DOM vive en tablero-datos.js.
 *
 * El motor decide y la vista dibuja: aca no se recalcula ninguna regla.
 */
'use strict';

import { $, esc, DATOS, dashData, cargarDashboard, registrarVista } from './nucleo.js';

/** Los lotes del dashboard cruzados con su fila de DATOS() (proyecto, vasija). */
export function filasTablero(){
  const dash = dashData();
  if (!dash) return [];
  const info = new Map((DATOS().lotes || []).map(l => [String(l.lote ?? ''), l]));
  return (dash.lotes || [])
    .filter(l => l.activo)
    .map(l => ({ ...l, _info: info.get(String(l.lote ?? '')) || {} }));
}

export function renderTablero(){
  const sec = $('tab-tablero');
  if (!sec) return;

  /* Sin datos del motor todavia: placeholder y disparar la carga, igual que la
   * pestana vieja. NO se puede `await cargarDashboard()`: tiene guarda de
   * reentrada (`if (_dashLoading) return`, nucleo.js:240), asi que con una carga
   * en vuelo resuelve enseguida y sin datos, y lo que sigue reventaria contra
   * dashData() en null. Quien repinta cuando llegan es cargarDashboard. */
  if (!dashData()){
    sec.innerHTML = '<div class="msg info" style="margin-top:10px">Cargando datos del motor FML…</div>';
    if (!dashLoading()) cargarDashboard();
    return;
  }

  const filas = filasTablero();
  sec.innerHTML = `<p>Estado de los ${filas.length} lotes.</p>`;
}

registrarVista('tablero', () => renderTablero());
```

con `dashLoading` en el import de `nucleo.js`.

- [ ] **Step 3: Que el dashboard sepa repintar la pestaña nueva**

`cargarDashboard` repinta a mano las pestañas que dependen de él, y sólo conoce cuatro. Sin esto el placeholder se queda pegado hasta que el usuario cambie de pestaña y vuelva. En `public/lotes/js/nucleo.js`, junto a las líneas que repintan `fml` y `orden`:

```javascript
    if (document.querySelector('.tabs button[data-v="tablero"].active')) _vistaObligatoria('tablero')();
```

- [ ] **Step 4: Importarla en la app**

En `public/lotes/js/app.js`, después de la línea 16 (`import './js/vista-fml.js';`):

```javascript
import './js/vista-tablero.js';
```

- [ ] **Step 4: Verificar en el navegador**

Levantar `npm run dev:sin-ia` (puerto 8788) y abrir el módulo Lotes. La pestaña **🧪 Tablero FML** tiene que aparecer al lado de 🧫 Seguimiento FML, abrirse sin errores en consola y decir "Estado de los N lotes". Las dos pestañas conviven.

> **Si la base local está vacía**, la pestaña dirá "Estado de los 0 lotes" y no se puede verificar nada más. Cargá datos reales una vez con:
> `node scripts/importar.mjs --modulo lotes --local --datos datos-origen/lotes-datos.json`

- [ ] **Step 5: Commit**

```bash
git add public/lotes/index.html public/lotes/js/app.js public/lotes/js/vista-tablero.js
git commit -m "feat: la pestana Tablero FML existe y convive con la vieja"
```

---

### Task 4: `tablero-panel.js` — modo números

**Files:**
- Create: `public/lotes/js/tablero-panel.js` (sólo HTML)
- Modify: `public/lotes/js/tablero-datos.js` (las funciones puras)
- Test: `test/lotes-tablero-panel.test.mjs`
- Modify: `public/lotes/js/vista-tablero.js`

**Interfaces:**
- Consumes: `kpis` del dashboard.
- Produces: `tarjetasDe(kpis) → [{clave, label, cantidad, total, pct, hi}]` y `tonoMosaico(fila) → 'ok'|'neutro'|'mal'` **en `tablero-datos.js`**; `htmlPanel(kpis, filas, modo) → string` en `tablero-panel.js`.

> **Por qué las puras no viven en `tablero-panel.js`.** Ese módulo importa
> `esc`/`escA` de `nucleo.js`, y `nucleo.js:46` llama a `window.addEventListener`
> en el nivel superior: cualquier test que lo importe muere con
> `ReferenceError: window is not defined` en el runtime de Workers. Verificado
> ejecutando. Por eso lo testeable va a `tablero-datos.js`, que no importa nada.
> Es además lo que dice la Architecture de este plan.

- [ ] **Step 1: Escribir el test que falla**

Crear `test/lotes-tablero-panel.test.mjs`:

```javascript
/* Importa de tablero-datos.js, NO de tablero-panel.js: ese importa nucleo.js,
 * que toca window al cargarse y no existe en el runtime de Workers. */
import { describe, it, expect } from 'vitest';
import { tarjetasDe, tonoMosaico } from '../public/lotes/js/tablero-datos.js';

const KPIS = {
  total_activos: 249, fml_terminada: 60, frecuencia_al_dia: 200,
  so2_conforme: 210, ph_ok: 244, lleno: 210, requieren_accion: 90,
};

describe('tarjetasDe', () => {
  it('los seis ejes del panel, en el orden del tablero', () => {
    expect(tarjetasDe(KPIS).map(t => t.label)).toEqual([
      'FML terminada', 'Frecuencia al día', 'SO₂ conforme', 'pH OK', 'Lleno', 'Requieren acción',
    ]);
  });

  it('el porcentaje se calcula sobre los activos y se redondea', () => {
    const t = tarjetasDe(KPIS).find(x => x.clave === 'so2_conforme');
    expect(t.cantidad).toBe(210);
    expect(t.total).toBe(249);
    expect(t.pct).toBe(84);
  });

  it('sin lotes activos no divide por cero', () => {
    expect(tarjetasDe({ total_activos: 0, fml_terminada: 0 })[0].pct).toBe(0);
  });

  it('solo "Requieren accion" se resalta cuando sube; los otros cuando bajan', () => {
    const t = tarjetasDe(KPIS);
    expect(t.find(x => x.clave === 'requieren_accion').hi).toBe(true);
    expect(t.find(x => x.clave === 'ph_ok').hi).toBe(false);
  });
});

describe('tonoMosaico', () => {
  it('verde sin condiciones, gris con una, rojo con dos o mas', () => {
    expect(tonoMosaico({ condiciones: [] })).toBe('ok');
    expect(tonoMosaico({ condiciones: [{ clave: 'ph_no_ok' }] })).toBe('neutro');
    expect(tonoMosaico({ condiciones: [{ clave: 'ph_no_ok' }, { clave: 'no_lleno' }] })).toBe('mal');
  });

  it('una fila sin el campo condiciones cuenta como sana, no rompe', () => {
    expect(tonoMosaico({})).toBe('ok');
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npx vitest run test/lotes-tablero-panel.test.mjs`
Expected: FAIL — `tarjetasDe is not a function`.

- [ ] **Step 3: Implementar las funciones puras**

Agregar al final de `public/lotes/js/tablero-datos.js`:

```javascript
/* --- el panel --- */

const EJES_PANEL = [
  { clave: 'fml_terminada',     label: 'FML terminada' },
  { clave: 'frecuencia_al_dia', label: 'Frecuencia al día' },
  { clave: 'so2_conforme',      label: 'SO₂ conforme' },
  { clave: 'ph_ok',             label: 'pH OK' },
  { clave: 'lleno',             label: 'Lleno' },
  { clave: 'requieren_accion',  label: 'Requieren acción', alReves: true },
];

export function tarjetasDe(kpis){
  const total = Number((kpis || {}).total_activos) || 0;
  return EJES_PANEL.map(e => {
    const cantidad = Number((kpis || {})[e.clave]) || 0;
    const pct = total ? Math.round((cantidad / total) * 100) : 0;
    // "Requieren accion" es el unico eje donde mas es peor.
    return { clave: e.clave, label: e.label, cantidad, total, pct, hi: e.alReves ? cantidad > 0 : false };
  });
}

/** Verde sin condiciones, gris con una, rojo con dos o mas. */
export function tonoMosaico(fila){
  const n = (fila.condiciones || []).length;
  return n === 0 ? 'ok' : (n === 1 ? 'neutro' : 'mal');
}
```

- [ ] **Step 4: Implementar el armador de HTML**

Crear `public/lotes/js/tablero-panel.js`:

```javascript
/* ===== Lotes CIW — el panel "Estado de los N lotes" =====
 *
 * Dos modos con un toggle: mosaico (un cuadrado por lote) y numeros (seis
 * tarjetas). En el tablero original "numeros" era el fallback sin JS; aca es
 * un modo elegible, porque leer los seis ejes de un vistazo sirve solo.
 *
 * Solo arma HTML. Las cuentas estan en tablero-datos.js, que se puede testear
 * porque no importa nucleo.js (que toca window al cargarse).
 */
'use strict';

import { esc, escA } from './nucleo.js';
import { tarjetasDe, tonoMosaico } from './tablero-datos.js';

function htmlNumeros(kpis){
  return `<div class="tb-tarjetas">` + tarjetasDe(kpis).map(t => `
    <div class="tb-tarjeta${t.hi ? ' hi' : ''}">
      <div class="tb-pct">${t.pct}%</div>
      <div class="tb-label">${esc(t.label)}</div>
      <div class="tb-cant">${t.cantidad} de ${t.total}</div>
    </div>`).join('') + `</div>`;
}

function htmlMosaico(filas){
  return `<div class="tb-mosaico">` + filas.map(f => {
    const n = (f.condiciones || []).length;
    const tip = `${f.lote} · ${f.variedad ?? ''} · ${n} ${n === 1 ? 'condición' : 'condiciones'}`;
    return `<button class="tb-cuadro ${tonoMosaico(f)}" data-ficha="${escA(f.lote)}" title="${escA(tip)}"></button>`;
  }).join('') + `</div>`;
}

export function htmlPanel(kpis, filas, modo){
  const cuerpo = modo === 'mosaico' ? htmlMosaico(filas) : htmlNumeros(kpis);
  return `
    <div class="tb-panel">
      <div class="tb-panel-cab">
        <h3>Estado de los ${filas.length} lotes</h3>
        <div class="tb-toggle">
          <button data-modo="mosaico" class="${modo === 'mosaico' ? 'active' : ''}">Mosaico</button>
          <button data-modo="numeros" class="${modo === 'mosaico' ? '' : 'active'}">Números</button>
        </div>
      </div>
      ${cuerpo}
    </div>`;
}
```

Agregar a `index.html` los estilos del panel:

```css
  .tb-panel{background:var(--tb-panel);border:1px solid var(--tb-linea);border-radius:8px;padding:12px;margin-bottom:12px}
  .tb-panel-cab{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  .tb-tarjetas{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
  .tb-tarjeta{background:var(--tb-fondo);border:1px solid var(--tb-linea);border-radius:6px;padding:8px;text-align:center}
  .tb-tarjeta.hi{background:var(--tb-mal-bg);color:var(--tb-mal-fg)}
  .tb-pct{font-size:22px;font-weight:700;color:var(--tb-primario)}
  .tb-tarjeta.hi .tb-pct{color:var(--tb-mal-fg)}
  .tb-label{font-size:12px}
  .tb-cant{font-size:11px;color:var(--tb-neu-fg)}
  .tb-mosaico{display:flex;flex-wrap:wrap;gap:3px}
  .tb-cuadro{width:16px;height:16px;border:1px solid var(--tb-linea);border-radius:3px;padding:0;cursor:pointer}
  .tb-cuadro.ok{background:var(--tb-ok-bg)} .tb-cuadro.neutro{background:var(--tb-neu-bg)} .tb-cuadro.mal{background:var(--tb-mal-bg)}
```

- [ ] **Step 5: Correr el test y verlo pasar**

Run: `npx vitest run test/lotes-tablero-panel.test.mjs`
Expected: PASS — 6 tests.

- [ ] **Step 6: Commit**

```bash
git add public/lotes/js/tablero-panel.js public/lotes/js/tablero-datos.js test/lotes-tablero-panel.test.mjs public/lotes/index.html
git commit -m "feat: el panel del tablero en sus dos modos"
```

---

### Task 5: El panel montado, con su toggle

**Files:**
- Modify: `public/lotes/js/vista-tablero.js`

**Interfaces:**
- Consumes: `htmlPanel` de `tablero-panel.js`.
- Produces: el estado `_modoPanel` (`'mosaico' | 'numeros'`, arranca en `'numeros'`) y el re-render al tocar el toggle.

- [ ] **Step 1: Implementar**

En `public/lotes/js/vista-tablero.js`, agregar el import y reemplazar `renderTablero`:

> **No toques la guarda de `dashData()`** que puso la Tarea 3: el `return` temprano con el placeholder es lo único que evita que `dashData().kpis` reviente contra un null mientras el dashboard está en vuelo. Todo lo de abajo va **después** de esa guarda.

```javascript
import { htmlPanel } from './tablero-panel.js';

let _modoPanel = 'numeros';

export function renderTablero(){
  const sec = $('tab-tablero');
  if (!sec) return;

  if (!dashData()){
    sec.innerHTML = '<div class="msg info" style="margin-top:10px">Cargando datos del motor FML…</div>';
    if (!dashLoading()) cargarDashboard();
    return;
  }

  const filas = filasTablero();
  sec.innerHTML = htmlPanel(dashData().kpis || {}, filas, _modoPanel);

  if (!sec._wiredTablero){
    sec._wiredTablero = true;
    sec.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-modo]');
      if (!b) return;
      _modoPanel = b.dataset.modo;
      renderTablero();
    });
  }
}
```

- [ ] **Step 2: Verificar en el navegador**

Abrir la pestaña. Tiene que verse el panel en modo Números con seis tarjetas; al tocar **Mosaico**, un cuadrado por lote con su tooltip `lote · variedad · N condiciones`. Sin errores en consola.

- [ ] **Step 3: Commit**

```bash
git add public/lotes/js/vista-tablero.js
git commit -m "feat: el panel del tablero se monta y cambia de modo"
```

---

### Task 6: Filtros y búsqueda

**Files:**
- Modify: `public/lotes/js/vista-tablero.js`
- Modify: `public/lotes/index.html` (la barra de filtros dentro de `#tab-tablero` no existe: el panel se pinta con `innerHTML`, así que la barra se arma en el mismo HTML de la vista)

**Interfaces:**
- Consumes: `initFiltrosMulti`, `pasaMulti`, `limpiarFiltrosMulti`, `opcionesValores`, `matchValor` de `tabla.js`; `PREGUNTAS` y `pasaPregunta` de `tablero-datos.js`.
- Produces: `filasVisibles()`, que las Tareas 7 y 10 usan para pintar y exportar **lo mismo que se ve**.

> **Ojo con el ciclo de vida.** `initFiltrosMulti` monta los widgets dentro de un contenedor por id y `renderTablero` repinta la sección entera con `innerHTML`. Si se re-inicializan los filtros en cada render, se pierde el foco y el desplegable se cierra solo. Por eso la barra de filtros se pinta **una sola vez** (`_montado`) y sólo se repinta la lista.

- [ ] **Step 1: Separar el armazón del contenido**

En `public/lotes/js/vista-tablero.js`, reemplazar `renderTablero` por el par armazón/contenido:

```javascript
import { initFiltrosMulti, pasaMulti, limpiarFiltrosMulti, opcionesValores, matchValor } from './tabla.js';
import { PREGUNTAS, pasaPregunta, ordenarPorAntiguedad } from './tablero-datos.js';

const filt = { proyecto: new Set(), condicion: new Set() };
let _desc = [], _inst = [];
let _busca = '';
let _pregunta = '';
let _montado = false;

const proyectoDe = (f) => String(f._info.proyecto ?? '').trim();

/** Las filas que se ven: filtradas y ordenadas. La lista y el export usan esta. */
export function filasVisibles(){
  const q = _busca.trim().toLowerCase();
  const filas = filasTablero().filter(f => {
    if (q && !String(f.lote ?? '').toLowerCase().includes(q)
           && !String(f.variedad ?? '').toLowerCase().includes(q)) return false;
    if (!pasaPregunta(f, _pregunta)) return false;
    return pasaMulti(f, _desc);
  });
  return ordenarPorAntiguedad(filas);
}

function armazon(){
  return `
    <div class="tb-acciones">
      <button id="tbVerCriterios">Ver criterios</button>
      <button id="tbExportar">Exportar Excel</button>
    </div>
    <div id="tbPanel"></div>
    <div class="tb-filtros">
      <input id="tbBusca" placeholder="Buscar lote o variedad…">
      <select id="tbPregunta">
        <option value="">Todas las preguntas</option>
        ${PREGUNTAS.map(p => `<option value="${p.val}">${esc(p.text)}</option>`).join('')}
      </select>
      <span id="tbFiltBar"></span>
      <button id="tbLimpiar">Limpiar</button>
    </div>
    <div id="tbLista"></div>`;
}

function initFiltros(){
  _desc = [
    { label: 'Proyecto', set: filt.proyecto,
      opciones: () => opcionesValores(filasTablero(), proyectoDe),
      match: matchValor(proyectoDe) },
    { label: 'Condición', set: filt.condicion,
      // Una fila con dos condiciones tiene que aparecer al filtrar por
      // cualquiera de las dos, asi que no sirve matchValor (es uno a uno).
      opciones: () => {
        const vistas = new Map();
        for (const f of filasTablero()) for (const c of (f.condiciones || [])) vistas.set(c.clave, c.etiqueta);
        return [...vistas].sort((a, b) => a[1].localeCompare(b[1], 'es-AR')).map(([val, text]) => ({ val, text }));
      },
      match: (f, set) => (f.condiciones || []).some(c => set.has(c.clave)) },
  ];
  _inst = initFiltrosMulti('tbFiltBar', _desc, renderLista);
}
```

- [ ] **Step 2: Montar el armazón una sola vez y cablear**

Reemplazar `renderTablero` y agregar `renderLista`:

```javascript
export function renderTablero(){
  const sec = $('tab-tablero');
  if (!sec) return;

  // La guarda de la Tarea 3: sin datos del motor no se puede montar nada.
  if (!dashData()){
    sec.innerHTML = '<div class="msg info" style="margin-top:10px">Cargando datos del motor FML…</div>';
    if (!dashLoading()) cargarDashboard();
    _montado = false;   // el placeholder piso el armazon: hay que rearmarlo
    return;
  }

  if (!_montado){
    sec.innerHTML = armazon();
    initFiltros();
    cablear(sec);
    _montado = true;
  }
  renderPanel();
  renderLista();
}

function renderPanel(){
  $('tbPanel').innerHTML = htmlPanel(dashData().kpis || {}, filasTablero(), _modoPanel);
}

function renderLista(){
  $('tbLista').innerHTML = `<p>${filasVisibles().length} lotes</p>`;   // la Tarea 7 la completa
}

function cablear(sec){
  sec.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-modo]');
    if (b){ _modoPanel = b.dataset.modo; renderPanel(); return; }
    if (ev.target.id === 'tbLimpiar'){
      _pregunta = ''; $('tbPregunta').value = '';
      limpiarFiltrosMulti(_desc, 'tbBusca', _inst, () => { _busca = ''; renderLista(); });
    }
  });
  sec.addEventListener('input', (ev) => {
    if (ev.target.id === 'tbBusca'){ _busca = ev.target.value; renderLista(); }
  });
  sec.addEventListener('change', (ev) => {
    if (ev.target.id === 'tbPregunta'){ _pregunta = ev.target.value; renderLista(); }
  });
}
```

> `limpiarFiltrosMulti` ya vacía el input `#tbBusca`, pero **no** toca `_busca`: por eso el callback lo resetea. Sin eso, el cuadro queda vacío y el filtro sigue aplicado.

- [ ] **Step 3: Agregar los estilos de la barra**

En `index.html`:

```css
  .tb-acciones{display:flex;gap:8px;margin-bottom:8px}
  .tb-filtros{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
```

- [ ] **Step 4: Verificar en el navegador**

Abrir la pestaña y comprobar, en este orden:
1. Escribir un número de lote en el buscador filtra y **no se pierde el foco** al tipear.
2. Elegir dos condiciones a la vez en el multi-select deja los lotes que tengan **cualquiera** de las dos.
3. "Limpiar" vacía el buscador, la pregunta y los dos multi-select, y vuelve a mostrar todos los lotes.
4. Cambiar el modo del panel **no** resetea los filtros.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/vista-tablero.js public/lotes/index.html
git commit -m "feat: filtros, busqueda y limpiar del tablero"
```

---

### Task 7: La lista con sus chips

**Files:**
- Modify: `public/lotes/js/vista-tablero.js`
- Modify: `public/lotes/index.html` (estilos de la tabla)

**Interfaces:**
- Consumes: `chipsDe` de `tablero-datos.js`.
- Produces: la lista con el botón `[data-ficha="<lote>"]` que la Tarea 8 engancha.

- [ ] **Step 1: Implementar**

En `vista-tablero.js`, agregar `chipsDe` al import de `./tablero-datos.js` y reemplazar `renderLista`:

```javascript
const HOY = () => new Date().toISOString().slice(0, 10);

const ESTADO_PROCESO = { finalizada: 'terminada', no_finalizada: 'en proceso', excluida: 'excluida', sin_dato: '—' };

function renderLista(){
  const hoy = HOY();
  const filas = filasVisibles();

  const cuerpo = filas.map(f => `
    <tr>
      <td><strong>${esc(f.lote)}</strong><br><span class="tb-sub">${esc(f.variedad ?? '')}</span></td>
      <td>${esc(proyectoDe(f))}</td>
      <td>${esc(f._info.vasija_actual ?? '')}</td>
      <td>${esc(f.ultima_fecha_control ?? '—')}</td>
      <td class="tb-sub">FA ${esc(ESTADO_PROCESO[f.fa_estado] ?? f.fa_estado ?? '—')}<br>
                         FML ${esc(ESTADO_PROCESO[f.fml_estado] ?? f.fml_estado ?? '—')}</td>
      <td>${chipsDe(f, hoy).map(c => `<span class="tb-chip ${c.tono}" title="${escA(c.titulo)}">${esc(c.texto)}</span>`).join('')}</td>
      <td class="tb-sub">${esc(f.accion_sugerida || '')}</td>
      <td><button data-ficha="${escA(f.lote)}">Ver ficha</button></td>
    </tr>`).join('');

  $('tbLista').innerHTML = filas.length === 0
    ? '<p>Ningún lote pasa los filtros.</p>'
    : `<table class="tb-tabla">
         <thead><tr>
           <th>Lote</th><th>Proyecto</th><th>Vasija</th><th>Último control</th>
           <th>Proceso</th><th>Condiciones</th><th>Acción sugerida</th><th></th>
         </tr></thead>
         <tbody>${cuerpo}</tbody>
       </table>`;
}
```

Agregar `escA` al import de `nucleo.js`. Y en `index.html`:

```css
  .tb-tabla{width:100%;border-collapse:collapse;background:var(--tb-panel)}
  .tb-tabla th,.tb-tabla td{border-bottom:1px solid var(--tb-linea);padding:6px 8px;text-align:left;vertical-align:top}
  .tb-tabla th{background:var(--tb-fondo);color:var(--tb-tinta);font-size:12px}
  .tb-sub{font-size:12px;color:var(--tb-neu-fg)}
```

- [ ] **Step 2: Verificar en el navegador**

1. La lista muestra las ocho columnas y **los lotes con la condición más vieja aparecen primero**.
2. Un lote sin ninguna condición muestra los cinco chips en verde.
3. Los chips de condición activa traen el sufijo de antigüedad (`Frec vencida · 10 d`) y el tooltip dice etiqueta y acción.
4. La acción sugerida de un lote con dos condiciones muestra las dos separadas por `|` (viene así del motor; la vista no la arma).

- [ ] **Step 3: Commit**

```bash
git add public/lotes/js/vista-tablero.js public/lotes/index.html
git commit -m "feat: la lista del tablero con sus chips y la accion sugerida"
```

> **Checkpoint — fin del tramo 2.** Acá la pestaña ya sirve para trabajar: panel, filtros y lista contra el motor. Buen momento para mirarla al lado de la vieja y confirmar que los números coinciden antes de seguir con la ficha.

---

### Task 8: `tablero-ficha.js` — la ficha de sólo lectura

**Files:**
- Create: `public/lotes/js/tablero-ficha.js` (sólo HTML)
- Modify: `public/lotes/js/tablero-datos.js` (`ultimasMediciones`)
- Test: `test/lotes-tablero-ficha.test.mjs`
- Modify: `public/lotes/js/vista-tablero.js` (enganchar `[data-ficha]`)

**Interfaces:**
- Consumes: `chipsDe` y `antiguedadTexto` de `tablero-datos.js`.
- Produces: `ultimasMediciones(analisis, lote, n) → filas` **en `tablero-datos.js`**; `htmlFicha(fila, analisis, hoy) → string` en `tablero-ficha.js`.

> Misma razón que en la Tarea 4: `tablero-ficha.js` importa `nucleo.js`, que toca
> `window` al cargarse, así que un test que lo importe no arranca. Lo testeable
> va a `tablero-datos.js`.

- [ ] **Step 1: Escribir el test que falla**

Crear `test/lotes-tablero-ficha.test.mjs`:

```javascript
/* Importa de tablero-datos.js, NO de tablero-ficha.js (ver Tarea 4). */
import { describe, it, expect } from 'vitest';
import { ultimasMediciones } from '../public/lotes/js/tablero-datos.js';

const A = (lote, fecha, extra) => ({ lote, fecha_analisis: fecha, ...extra });

describe('ultimasMediciones', () => {
  it('trae las ultimas n del lote, de la mas nueva a la mas vieja', () => {
    const analisis = [
      A('26001', '2026-08-01', { ph: 3.5 }), A('26001', '2026-09-01', { ph: 3.6 }),
      A('26001', '2026-09-10', { ph: 3.7 }), A('26002', '2026-09-11', { ph: 3.9 }),
    ];
    const r = ultimasMediciones(analisis, '26001', 2);
    expect(r.map(f => f.fecha_analisis)).toEqual(['2026-09-10', '2026-09-01']);
  });

  it('descarta las filas sin fecha y las de otro lote', () => {
    const analisis = [A('26001', null, { ph: 3.5 }), A('26002', '2026-09-01', { ph: 3.6 })];
    expect(ultimasMediciones(analisis, '26001', 6)).toEqual([]);
  });

  it('descarta las filas sin ninguna medicion util', () => {
    const analisis = [A('26001', '2026-09-01', {}), A('26001', '2026-09-02', { so2_libre: 22 })];
    expect(ultimasMediciones(analisis, '26001', 6).map(f => f.fecha_analisis)).toEqual(['2026-09-02']);
  });

  it('el -999 del FOSS no cuenta como medicion util', () => {
    const analisis = [A('26001', '2026-09-01', { av: -999 })];
    expect(ultimasMediciones(analisis, '26001', 6)).toEqual([]);
  });

  it('empareja el lote aunque venga como numero', () => {
    expect(ultimasMediciones([A(26001, '2026-09-01', { ph: 3.5 })], '26001', 6)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npx vitest run test/lotes-tablero-ficha.test.mjs`
Expected: FAIL — `ultimasMediciones is not a function`.

- [ ] **Step 3: Implementar la función pura**

Agregar al final de `public/lotes/js/tablero-datos.js`:

```javascript
/* --- la ficha --- */

/* Los seis campos que el motor considera "medicion util". Se replican aca solo
 * para decidir que filas vale la pena mostrar; ninguna condicion se recalcula. */
const UTILES = ['ph', 'av', 'malico', 'azucar_reductor', 'so2_libre', 'etanol'];
const INVALIDO = -999;

const util = (v) => v !== null && v !== undefined && v !== '' && Number(v) !== INVALIDO;

export function ultimasMediciones(analisis, lote, n){
  const clave = String(lote ?? '');
  return (analisis || [])
    .filter(a => String(a.lote ?? '') === clave && a.fecha_analisis)
    .filter(a => UTILES.some(k => util(a[k])))
    .sort((a, b) => String(b.fecha_analisis).localeCompare(String(a.fecha_analisis)))
    .slice(0, n);
}
```

- [ ] **Step 4: Implementar el armador de HTML**

Crear `public/lotes/js/tablero-ficha.js`:

```javascript
/* ===== Lotes CIW — la ficha del tablero =====
 *
 * Todo lo que muestra sale resuelto del motor. La unica cuenta que hace la
 * ficha es elegir que mediciones listar, y eso vive en tablero-datos.js.
 */
'use strict';

import { esc, escA } from './nucleo.js';
import { chipsDe, ultimasMediciones } from './tablero-datos.js';

const dato = (label, valor) => `<div class="tb-dato"><span>${esc(label)}</span><strong>${esc(valor ?? '—')}</strong></div>`;

export function htmlFicha(fila, analisis, hoy){
  const chips = chipsDe(fila, hoy).filter(c => c.tono === 'mal');
  const c = fila.so2_caida || {};
  const mediciones = ultimasMediciones(analisis, fila.lote, 6);

  const avisoAv = fila.av_alerta ? `
    <div class="tb-aviso">
      <strong>Por qué requiere atención:</strong>
      ${esc({ umbral: 'el AV superó el máximo', aumento: 'el AV subió más de lo tolerado entre análisis',
              fuera_rango_foss: 'el FOSS informó −999 (medición fuera de rango)' }[fila.av_motivo] || 'alerta de AV')}
    </div>` : '';

  const evidencia = c.alerta ? `
    <div class="tb-aviso">
      El SO₂ libre bajó de ${esc(c.anterior)} (${esc(c.anterior_fecha)})
      a ${esc(c.actual)} (${esc(c.actual_fecha)}): ${esc(c.caida)} ppm.
    </div>` : '';

  // Avisa cuando el pH de referencia viene de otra muestra que la del SO2.
  const phRef = fila.so2_ph_referencia_fecha && fila.so2_ph_referencia_fecha !== fila.so2_libre_fecha
    ? `${fila.so2_ph_referencia} (del ${fila.so2_ph_referencia_fecha})`
    : fila.so2_ph_referencia;

  const inoculado = fila.inoculado_origen === 'analisis' ? `${fila.inoculado} (detectado en el análisis)`
    : fila.inoculado_origen === 'manual' ? `${fila.inoculado} (cargado a mano)`
    : fila.inoculado;

  return `
    <div class="tb-ficha" data-ficha-de="${escA(fila.lote)}">
      <h3>${esc(fila.lote)} · ${esc(fila.variedad ?? '')}</h3>
      <div>${chips.map(x => `<span class="tb-chip ${x.tono}" title="${escA(x.titulo)}">${esc(x.texto)}</span>`).join('') || '<span class="tb-sub">Sin condiciones activas.</span>'}</div>
      ${avisoAv}
      <div class="tb-grilla">
        ${dato('Vasija', fila._info.vasija_actual)}
        ${dato('Litros', fila.litros)}
        ${dato('Última medición', fila.ultima_fecha)}
        ${dato('Último control de proceso', fila.ultima_fecha_control)}
        ${dato('Frecuencia', `${fila.frecuencia_max} d (hace ${fila.dias_desde_control ?? '—'})`)}
        ${dato('Inoculación', inoculado)}
        ${dato('Mermo', fila._info.mermo)}
        ${dato('FML excluida', fila.fml_estado === 'excluida' ? `sí (${fila.fml_excluida_origen})` : 'no')}
      </div>
      <div class="tb-so2">
        <h4>SO₂</h4>
        ${dato('Libre', fila.so2_libre !== null ? `${fila.so2_libre} (${fila.so2_libre_fecha ?? '—'})` : '—')}
        ${dato('pH de referencia', phRef)}
        ${dato('Molecular', fila.so2_molecular)}
        ${dato('Motivo', fila.so2_motivo)}
      </div>
      ${evidencia}
      <p><strong>Acción sugerida:</strong> ${esc(fila.accion_sugerida || '—')}</p>
      <table class="tb-tabla">
        <thead><tr><th>Fecha</th><th>pH</th><th>AV</th><th>Málico</th><th>Az. red.</th><th>SO₂ libre</th><th>Etanol</th></tr></thead>
        <tbody>${mediciones.map(m => `<tr>
          <td>${esc(m.fecha_analisis)}</td><td>${esc(m.ph ?? '')}</td><td>${esc(m.av ?? '')}</td>
          <td>${esc(m.malico ?? '')}</td><td>${esc(m.azucar_reductor ?? '')}</td>
          <td>${esc(m.so2_libre ?? '')}</td><td>${esc(m.etanol ?? '')}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
}
```

- [ ] **Step 5: Engancharla en la vista**

En `vista-tablero.js`, agregar el import y el manejo del botón dentro de `cablear`:

```javascript
import { htmlFicha } from './tablero-ficha.js';

// dentro del listener de click, antes del chequeo de tbLimpiar:
const vf = ev.target.closest('[data-ficha]');
if (vf){ abrirFicha(vf.dataset.ficha); return; }
```

Y la función, usando el overlay que ya tiene la app:

```javascript
import { mostrarOverlay } from './nucleo.js';

function abrirFicha(lote){
  const fila = filasTablero().find(f => String(f.lote ?? '') === String(lote));
  if (!fila) return;
  mostrarOverlay(htmlFicha(fila, DATOS().analisis || [], HOY()));
}
```

Agregar los estilos a `index.html`:

```css
  .tb-grilla{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 16px;margin:8px 0}
  .tb-dato{display:flex;justify-content:space-between;border-bottom:1px dotted var(--tb-linea);padding:2px 0}
  .tb-aviso{background:var(--tb-mal-bg);color:var(--tb-mal-fg);padding:6px 8px;border-radius:6px;margin:6px 0}
```

- [ ] **Step 6: Correr el test y verificar en el navegador**

Run: `npx vitest run test/lotes-tablero-ficha.test.mjs` → PASS (5 tests).

En el navegador: "Ver ficha" abre el overlay con las condiciones activas, la grilla de datos operativos, el bloque de SO₂ y hasta 6 mediciones. En un lote con caída de SO₂ tiene que verse la evidencia con las dos fechas.

- [ ] **Step 7: Commit**

```bash
git add public/lotes/js/tablero-ficha.js public/lotes/js/tablero-datos.js test/lotes-tablero-ficha.test.mjs public/lotes/js/vista-tablero.js public/lotes/index.html
git commit -m "feat: la ficha del tablero, de solo lectura"
```

---

### Task 9: Los campos editables de la ficha

**Files:**
- Modify: `public/lotes/js/tablero-datos.js` (`aplicarEdicion`)
- Modify: `public/lotes/js/tablero-ficha.js` (los controles)
- Modify: `public/lotes/js/vista-tablero.js` (el cableado)
- Test: `test/lotes-tablero-ficha.test.mjs`

**Interfaces:**
- Consumes: `guardar`, `markDirty`, `usuarioActual`, `cargarDashboard` de `nucleo.js`.
- Produces: `aplicarEdicion(datos, lote, campo, valor, autor) → {seccion}` **en `tablero-datos.js`** (pura sobre el documento en memoria), donde `seccion` es `'lote'`, `'estado_lote'` o `null`.

> **El listener NO va en `#tab-tablero`.** `mostrarOverlay` escribe en
> `#overlayBox` (`nucleo.js:61`), que en `index.html:1078` cuelga de `<body>`,
> **fuera** de la sección de la pestaña. Un `change` delegado en `sec` no se
> entera nunca de los campos de la ficha: editar mermo no haría nada, en
> silencio. Va en `#overlayBox`, con su propia guarda de cableado único.

> **Este es el primer escritor de `hace_fml` y `mermo` en toda la app** (ver "Lo que ya está hecho"). No hay un camino previo que copiar: se construye acá.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `test/lotes-tablero-ficha.test.mjs`:

```javascript
import { aplicarEdicion } from '../public/lotes/js/tablero-datos.js';

const datos = () => ({ lotes: [{ lote: '26001', variedad: 'Malbec' }], estado_lote: {}, analisis: [] });

describe('aplicarEdicion', () => {
  it('mermo y hace_fml van a la fila del lote', () => {
    const d = datos();
    expect(aplicarEdicion(d, '26001', 'mermo', 'no', 'Roy').seccion).toBe('lote');
    expect(d.lotes[0].mermo).toBe('no');
    aplicarEdicion(d, '26001', 'hace_fml', 'si', 'Roy');
    expect(d.lotes[0].hace_fml).toBe('si');
    expect(d.estado_lote['26001']).toBeUndefined();   // no duplica el dato
  });

  it('comentario e inoculado van a estado_lote, que no tiene columna propia', () => {
    const d = datos();
    expect(aplicarEdicion(d, '26001', 'comentario', 'ojo con este', 'Roy').seccion).toBe('estado_lote');
    expect(d.estado_lote['26001'].comentario).toBe('ojo con este');
    expect(d.estado_lote['26001'].actualizado_por).toBe('Roy');
    expect(d.lotes[0].comentario).toBeUndefined();
  });

  it('firma quien y cuando en los dos destinos', () => {
    const d = datos();
    aplicarEdicion(d, '26001', 'mermo', 'si', 'Roy');
    expect(d.estado_lote['26001'].actualizado_por).toBe('Roy');
    expect(d.estado_lote['26001'].actualizado_el).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('el vacio se guarda como null, no como cadena vacia', () => {
    const d = datos();
    aplicarEdicion(d, '26001', 'comentario', '  ', 'Roy');
    expect(d.estado_lote['26001'].comentario).toBeNull();
  });

  it('un campo que no es de la ficha no escribe nada', () => {
    const d = datos();
    expect(aplicarEdicion(d, '26001', 'litros_actuales', '999', 'Roy').seccion).toBeNull();
    expect(d.lotes[0].litros_actuales).toBeUndefined();
  });

  it('un lote que no existe no crea una fila fantasma', () => {
    const d = datos();
    expect(aplicarEdicion(d, '99999', 'mermo', 'no', 'Roy').seccion).toBeNull();
    expect(d.lotes).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npx vitest run test/lotes-tablero-ficha.test.mjs -t "aplicarEdicion"`
Expected: FAIL — `aplicarEdicion is not a function`.

- [ ] **Step 3: Implementar**

Agregar al final de `public/lotes/js/tablero-datos.js`:

```javascript
/* Donde escribe cada campo.
 *
 * mermo y hace_fml tienen columna propia en el lote, asi que van ahi: un solo
 * valor en un solo lugar, sin capa de override que explicar. Comentario e
 * inoculado no la tienen y siguen en estado_lote. */
const EN_EL_LOTE = ['mermo', 'hace_fml'];
const EN_ESTADO  = ['comentario', 'inoculado'];

export function aplicarEdicion(datos, lote, campo, valor, autor){
  const clave = String(lote ?? '');
  const fila = (datos.lotes || []).find(l => String(l.lote ?? '') === clave);
  if (!fila) return { seccion: null };

  const limpio = String(valor ?? '').trim() === '' ? null : String(valor).trim();
  const seccion = EN_EL_LOTE.includes(campo) ? 'lote' : (EN_ESTADO.includes(campo) ? 'estado_lote' : null);
  if (!seccion) return { seccion: null };

  if (seccion === 'lote') fila[campo] = limpio;

  // La firma va siempre a estado_lote: el lote no tiene columnas para quien y cuando.
  datos.estado_lote = datos.estado_lote || {};
  const est = (datos.estado_lote[clave] = datos.estado_lote[clave] || {});
  if (seccion === 'estado_lote') est[campo] = limpio;
  est.actualizado_por = autor;
  est.actualizado_el = new Date().toISOString();

  return { seccion };
}
```

En `htmlFicha`, reemplazar los tres `dato(...)` de Mermo, FML excluida e Inoculación por controles, y agregar el comentario:

```javascript
      ${selecFicha('mermo', 'Mermo', fila._info.mermo, ['', 'si', 'no'])}
      ${selecFicha('hace_fml', 'Hace FML', fila._info.hace_fml, ['', 'si', 'no'])}
      ${selecFicha('inoculado', 'Inoculación', fila.inoculado, ['', 'si', 'no', 'desconocido'])}
```

con el helper:

```javascript
function selecFicha(campo, label, valor, opciones){
  const ops = opciones.map(o => `<option value="${escA(o)}"${String(valor ?? '') === o ? ' selected' : ''}>${esc(o || '—')}</option>`).join('');
  return `<div class="tb-dato"><span>${esc(label)}</span><select class="tb-edit" data-campo="${escA(campo)}">${ops}</select></div>`;
}
```

y, antes de la tabla de mediciones:

```javascript
      <div class="tb-dato"><span>Comentario</span>
        <input class="tb-edit" data-campo="comentario" value="${escA((fila._est || {}).comentario ?? '')}"></div>
```

> `fila._est` no existe todavía: agregarlo en `filasTablero()` de `vista-tablero.js`, junto a `_info`:
> ```javascript
> _est: (DATOS().estado_lote || {})[String(l.lote ?? '')] || {},
> ```

- [ ] **Step 4: Cablear el guardado con refresco**

En `vista-tablero.js`, agregar una función de cableado **del overlay**, llamada desde `cablear(sec)`:

```javascript
/* La ficha se dibuja en #overlayBox, que cuelga de <body> y no de la seccion
 * de la pestana (index.html:1078). Delegar en `sec` no funcionaria: el evento
 * nunca pasa por ahi. */
function cablearOverlay(){
  const caja = $('overlayBox');
  if (!caja || caja._wiredTablero) return;
  caja._wiredTablero = true;

  caja.addEventListener('change', async (ev) => {
    const el = ev.target.closest('.tb-edit');
    if (!el) return;
    const cont = el.closest('[data-ficha-de]');
    if (!cont) return;                       // otra cosa dibujada en el overlay
    const lote = cont.dataset.fichaDe;
    const { seccion } = aplicarEdicion(DATOS(), lote, el.dataset.campo, el.value, usuarioActual());
    if (!seccion) return;
    markDirty();

    /* Mermo y hace_fml cambian condiciones que calcula el servidor, asi que los
     * chips quedarian viejos. Se guarda y se vuelve a pedir el dashboard para
     * que el lote se repinte solo. Comentario e inoculado no mueven ninguna
     * condicion: alcanza con markDirty y el boton Guardar de siempre. */
    if (el.dataset.campo === 'mermo' || el.dataset.campo === 'hace_fml'){
      if (await guardar()){ await cargarDashboard(); renderPanel(); renderLista(); abrirFicha(lote); }
    }
  });
}
```

y llamarla al final de `cablear(sec)`:

```javascript
  cablearOverlay();
```

Agregar `guardar`, `markDirty` y `usuarioActual` al import de `nucleo.js`, y `aplicarEdicion` al de `tablero-datos.js`.

> La guarda `caja._wiredTablero` importa: `cablear` corre una sola vez hoy, pero el overlay lo comparten otras pantallas (Historial, por ejemplo) y un segundo listener dispararía el guardado dos veces.

- [ ] **Step 5: Correr el test y verificar en el navegador**

Run: `npx vitest run test/lotes-tablero-ficha.test.mjs` → PASS (11 tests).

En el navegador: cambiar **Mermo** de un lote que hoy tiene "Datos operativos incompletos" y comprobar que, al cerrarse el guardado, esa condición desaparece de sus chips **sin recargar la página**. Cambiar el comentario y verificar que aparece "● Cambios sin guardar" y que el botón Guardar lo persiste.

- [ ] **Step 6: Commit**

```bash
git add public/lotes/js/tablero-datos.js public/lotes/js/tablero-ficha.js public/lotes/js/vista-tablero.js test/lotes-tablero-ficha.test.mjs
git commit -m "feat: la ficha escribe mermo, FML, inoculado y comentario"
```

---

### Task 10: El export a Excel, una fila por condición

**Files:**
- Modify: `public/shared/exportar.js` (puerta genérica nueva, **sin tocar** `CIW_EXPORTAR`)
- Create: `public/lotes/js/tablero-export.js`
- Test: `test/lotes-tablero-export.test.mjs`
- Modify: `public/lotes/js/vista-tablero.js`

**Interfaces:**
- Consumes: `filasVisibles()` de la Tarea 6.
- Produces: `window.CIW_EXPORTAR_HOJAS(nombreArchivo, hojas)` donde `hojas` es `[{nombre, columnas:[[clave,titulo]], filas}]`; y `filasExport(filas, hoy) → filas planas`.

> **Por qué no se reusa `CIW_EXPORTAR` tal cual:** exporta hojas fijas (`COLUMNAS[modulo]`) desde las secciones del documento. El tablero necesita una fila **por condición activa**, que no es ninguna sección. Se le abre una puerta genérica al mismo archivo, reusando su helper `hoja()`.

- [ ] **Step 1: Escribir el test que falla**

Crear `test/lotes-tablero-export.test.mjs`:

```javascript
import { describe, it, expect } from 'vitest';
import { filasExport } from '../public/lotes/js/tablero-export.js';

const HOY = '2026-09-16';
const fila = (lote, condiciones) => ({
  lote, litros: 1000, _info: { vasija_actual: 'B-12' }, condiciones,
});

describe('filasExport', () => {
  it('una fila por condicion activa, no una por lote', () => {
    const filas = [fila('26001', [
      { clave: 'ph_no_ok', etiqueta: 'pH no OK', accion: 'x', desde: '2026-09-14' },
      { clave: 'no_lleno', etiqueta: 'No lleno', accion: 'y', desde: null },
    ])];
    const r = filasExport(filas, HOY);
    expect(r).toHaveLength(2);
    expect(r.map(f => f.condicion)).toEqual(['pH no OK', 'No lleno']);
  });

  it('trae vasija, litros, desde y antiguedad', () => {
    const r = filasExport([fila('26001', [{ clave: 'ph_no_ok', etiqueta: 'pH no OK', accion: 'x', desde: '2026-09-14' }])], HOY);
    expect(r[0]).toEqual({ lote: '26001', vasija: 'B-12', litros: 1000, condicion: 'pH no OK', desde: '2026-09-14', antiguedad: '2 d' });
  });

  it('la condicion sin fecha deja desde y antiguedad vacios', () => {
    const r = filasExport([fila('26001', [{ clave: 'no_lleno', etiqueta: 'No lleno', accion: 'y', desde: null }])], HOY);
    expect(r[0].desde).toBe('');
    expect(r[0].antiguedad).toBe('');
  });

  it('los lotes sin condiciones no entran', () => {
    expect(filasExport([fila('26001', [])], HOY)).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npx vitest run test/lotes-tablero-export.test.mjs`
Expected: FAIL — `Failed to load url ../public/lotes/js/tablero-export.js`.

- [ ] **Step 3: Implementar el módulo puro**

Crear `public/lotes/js/tablero-export.js`:

```javascript
/* ===== Lotes CIW — el Excel del tablero =====
 *
 * Una fila por condicion activa, no una por lote: el Excel se usa para repartir
 * trabajo, y el trabajo es la condicion.
 */
'use strict';

import { antiguedadTexto } from './tablero-datos.js';

export const COLUMNAS_EXPORT = [
  ['lote', 'Lote'], ['vasija', 'Vasija'], ['litros', 'Litros'],
  ['condicion', 'Condición'], ['desde', 'Desde'], ['antiguedad', 'Antigüedad'],
];

export function filasExport(filas, hoy){
  const salida = [];
  for (const f of filas){
    for (const c of (f.condiciones || [])){
      salida.push({
        lote: f.lote,
        vasija: (f._info || {}).vasija_actual ?? '',
        litros: f.litros,
        condicion: c.etiqueta,
        desde: c.desde || '',
        antiguedad: antiguedadTexto(c.desde, hoy),
      });
    }
  }
  return salida;
}
```

- [ ] **Step 4: Abrir la puerta genérica en `exportar.js`**

En `public/shared/exportar.js`, antes de `window.CIW_EXPORTAR = exportar;`:

```javascript
  /**
   * Arma y baja un .xlsx a partir de hojas ya armadas, para lo que no es una
   * seccion del documento. `hojas` es [{nombre, columnas, filas}], con
   * `columnas` en el mismo formato [clave, titulo] que usa COLUMNAS.
   */
  function exportarHojas(nombreArchivo, hojas) {
    if (typeof XLSX === 'undefined') {
      alert('No se pudo cargar la librería de Excel. Recargá la página e intentá de nuevo.');
      return;
    }
    var wb = XLSX.utils.book_new();
    (hojas || []).forEach(function (h) {
      XLSX.utils.book_append_sheet(wb, hoja(h.filas, h.columnas), h.nombre);
    });
    XLSX.writeFile(wb, nombreArchivo);
  }

  window.CIW_EXPORTAR_HOJAS = exportarHojas;
```

- [ ] **Step 5: Cablear el botón**

En `vista-tablero.js`, dentro del listener de click:

```javascript
if (ev.target.id === 'tbExportar'){
  const hoy = HOY();
  window.CIW_EXPORTAR_HOJAS(`Tablero FML (${hoy}).xlsx`, [
    { nombre: 'CONDICIONES', columnas: COLUMNAS_EXPORT, filas: filasExport(filasVisibles(), hoy) },
  ]);
  return;
}
```

con `import { filasExport, COLUMNAS_EXPORT } from './tablero-export.js';`.

- [ ] **Step 6: Correr el test y verificar en el navegador**

Run: `npx vitest run test/lotes-tablero-export.test.mjs` → PASS (4 tests).

En el navegador: filtrar por una condición, tocar **Exportar Excel** y comprobar que el archivo baja y trae **sólo los lotes filtrados**, una fila por condición.

- [ ] **Step 7: Commit**

```bash
git add public/shared/exportar.js public/lotes/js/tablero-export.js test/lotes-tablero-export.test.mjs public/lotes/js/vista-tablero.js
git commit -m "feat: el Excel del tablero, una fila por condicion"
```

---

### Task 11: El diálogo "Ver criterios", generado de los criterios vigentes

**Files:**
- Modify: `public/lotes/js/vista-tablero.js`
- Test: `test/lotes-tablero-criterios.test.mjs`
- Create: la función vive en `public/lotes/js/tablero-datos.js` (es texto derivado de datos, no DOM)

**Interfaces:**
- Consumes: `CRITERIOS_DEFAULT` y `criteriosEfectivosJS` de `criterios.js`.
- Produces: `textoCriterios(criteriosEfectivos) → [{titulo, regla}]`.

> Se genera **desde los criterios vigentes**, no con textos fijos: como los umbrales ahora son configurables, un texto escrito a mano mentiría apenas alguien edite Configuración.

- [ ] **Step 1: Escribir el test que falla**

Crear `test/lotes-tablero-criterios.test.mjs`:

```javascript
import { describe, it, expect } from 'vitest';
import { textoCriterios } from '../public/lotes/js/tablero-datos.js';
import { CRITERIOS_DEFAULT } from '../public/lotes/js/criterios.js';

const regla = (lista, titulo) => lista.find(x => x.titulo === titulo).regla;

describe('textoCriterios', () => {
  it('escribe los umbrales que rigen, no los del codigo', () => {
    const lista = textoCriterios({ ...CRITERIOS_DEFAULT, ph_max: 3.65 });
    expect(regla(lista, 'pH no OK')).toContain('3.65');
    expect(regla(lista, 'pH no OK')).not.toContain('3.75');
  });

  it('el pH inclusivo cambia el signo, no solo el numero', () => {
    expect(regla(textoCriterios({ ...CRITERIOS_DEFAULT, ph_max: 3.79, ph_max_inclusive: 'si' }), 'pH no OK')).toContain('≥ 3.79');
    expect(regla(textoCriterios(CRITERIOS_DEFAULT), 'pH no OK')).toContain('> 3.75');
  });

  it('dice que el SO2 no aplica cuando el proyecto lo apaga', () => {
    expect(regla(textoCriterios({ ...CRITERIOS_DEFAULT, so2_aplica: 'no' }), 'SO2 no OK')).toContain('No se evalúa');
  });

  it('nombra las once condiciones', () => {
    expect(textoCriterios(CRITERIOS_DEFAULT)).toHaveLength(11);
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npx vitest run test/lotes-tablero-criterios.test.mjs`
Expected: FAIL — `textoCriterios is not a function`.

- [ ] **Step 3: Implementar**

Agregar a `public/lotes/js/tablero-datos.js`:

```javascript
/* El dialogo "Ver criterios" se arma con los umbrales vigentes. Un texto fijo
 * mentiria apenas alguien edite Configuracion. */
export function textoCriterios(eff){
  const phSigno = String(eff.ph_max_inclusive) === 'si' ? '≥' : '>';
  return [
    { titulo: 'Sin análisis válido', regla: 'No hay ninguna fila con fecha y al menos una medición útil.' },
    { titulo: 'Sin control de proceso', regla: 'Hay análisis, pero ninguno informa etanol, AV y málico a la vez.' },
    { titulo: 'Frecuencia vencida', regla: `Pasaron más de ${eff.frecuencia_no_terminada} días del último control (${eff.frecuencia_terminada} si la FML está terminada o excluida).` },
    { titulo: 'AV alerta', regla: `Último AV > ${eff.av_max}, o subió más de ${eff.av_delta_max} en ${eff.av_delta_dias} días, o el FOSS informó −999.` },
    { titulo: 'Caída de SO₂ libre', regla: String(eff.so2_aplica) === 'no' ? 'No se evalúa en este proyecto.' : `Entre las dos últimas fechas con SO₂ hay una caída mayor a ${eff.so2_caida_max} ppm.` },
    { titulo: 'FA no finalizada', regla: `Último azúcar reductor > ${eff.fa_azucar_reductor_max}.` },
    { titulo: 'FML no finalizada', regla: `Último málico ≥ ${eff.fml_malico_finalizada}, y no hay dos últimas mediciones por debajo de ${eff.fml_malico_2ultimas}.` },
    { titulo: 'SO2 no OK', regla: String(eff.so2_aplica) === 'no' ? 'No se evalúa en este proyecto.' : `Libre ≤ ${eff.so2_libre_piso} ppm, o molecular < ${eff.so2_molecular_objetivo}.` },
    { titulo: 'pH no OK', regla: `Último pH ${phSigno} ${eff.ph_max}.` },
    { titulo: 'No lleno', regla: 'El mermo del lote dice que no está lleno.' },
    { titulo: 'Datos operativos incompletos', regla: 'Falta el mermo o falta la decisión de FML (del lote o de la variedad).' },
  ];
}
```

- [ ] **Step 4: Cablear el botón**

En `vista-tablero.js`, dentro del listener de click:

```javascript
if (ev.target.id === 'tbVerCriterios'){
  // criteriosEfectivosJS recibe el config ENTERO y busca .criterios_fml adentro
  // (criterios.js:42-43). Pasarle config.criterios_fml devuelve los defaults.
  const eff = criteriosEfectivosJS(DATOS().config || {}, null, null);
  mostrarOverlay(`<h3>Criterios vigentes</h3>` + textoCriterios(eff)
    .map(c => `<p><strong>${esc(c.titulo)}</strong><br>${esc(c.regla)}</p>`).join(''));
  return;
}
```

con `import { criteriosEfectivosJS } from './criterios.js';`.

> Con `variedad` y `proyecto` en `null` el diálogo muestra los criterios **generales**, no los de un lote: es el caso de uso ("¿con qué regla se está midiendo?"). Los overrides por variedad se ven en Configuración.

- [ ] **Step 5: Correr el test y verificar en el navegador**

Run: `npx vitest run test/lotes-tablero-criterios.test.mjs` → PASS (4 tests).

En el navegador: tocar **Ver criterios**, cambiar `ph_max` en Configuración, volver a abrirlo y comprobar que el texto cambió.

- [ ] **Step 6: Commit**

```bash
git add public/lotes/js/tablero-datos.js public/lotes/js/vista-tablero.js test/lotes-tablero-criterios.test.mjs
git commit -m "feat: el dialogo de criterios se arma con los umbrales vigentes"
```

---

### Task 12: Las tres claves nuevas en Configuración

**Files:**
- Modify: `public/lotes/js/vista-config.js:9-22` (`COLS_CONFIG`)

**Interfaces:**
- Consumes: `CRITERIOS_DEFAULT`, que ya trae las tres claves (`criterios.js:22-24`).
- Produces: las tres editables desde la pestaña Configuración.

> `renderConfig()` pinta lo que diga `COLS_CONFIG`, así que no hay que tocar nada más. Sin esta tarea, los overrides que siembra `aplicar-datos-fml.mjs` existen en el dato pero **no se ven ni se pueden corregir** desde la app.

- [ ] **Step 1: Agregar las tres filas**

En `public/lotes/js/vista-config.js`, dentro de `COLS_CONFIG`, después de `so2_libre_piso`:

```javascript
  { k:'so2_caida_max',          label:'SO₂ caída máx (ppm)',    num:true },
  { k:'so2_aplica',             label:'Aplica SO₂',             sel:['si','no'] },
  { k:'ph_max_inclusive',       label:'pH máx inclusivo',       sel:['si','no'] },
```

- [ ] **Step 2: Verificar en el navegador**

En Configuración tienen que aparecer las tres filas nuevas. Cambiar "Aplica SO₂" a `no` en un proyecto y comprobar en el tablero que los chips de SO₂ de sus lotes pasan a neutro después de guardar y refrescar.

- [ ] **Step 3: Commit**

```bash
git add public/lotes/js/vista-config.js
git commit -m "feat: las tres claves nuevas de criterios se editan en Configuracion"
```

> **Checkpoint — fin del tramo 3.** La pestaña nueva ya hace todo lo que hacía la vieja y más. Antes de dar de baja, mirarlas en paralelo una última vez.

---

### Task 13: Las dos condiciones nuevas, en el resto de la UI

**Files:**
- Modify: `public/lotes/js/vista-dashboard.js:12-23` (`COND_LABELS`)
- Modify: `public/lotes/js/orden-filas.js:17-31` (`CRITERIOS_ATENCION` y `diasRestantes`)
- Test: `test/lotes-orden-fuente.test.mjs`

**Interfaces:**
- Consumes: `alarmas` y `dias_desde_control` del motor.
- Produces: `clasificarLote` contando la frecuencia desde el último control de proceso.

> El motor publica 11 condiciones y estas dos listas conocen 9. Hoy el Dashboard muestra la clave cruda (`so2_caida_alerta`) en vez de su etiqueta, y la Orden de muestras cuenta los días desde el último **análisis** en vez del último **control de proceso** — que es el cambio de semántica nº 1 del spec. Son dos deudas del tramo 1, anotadas en su revisión final.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `test/lotes-orden-fuente.test.mjs`:

```javascript
describe('clasificarLote — la frecuencia se cuenta desde el control de proceso', () => {
  it('un analisis suelto ya no reinicia el reloj', () => {
    // Analisis de ayer, pero el ultimo control de proceso fue hace 40 dias.
    const fila = { lote: '26003', vencido: false, dias_desde_analisis: 1,
                   dias_desde_control: 40, frecuencia_max: 30, alarmas: [] };
    expect(clasificarLote(fila).proximo).toBe(false);
  });

  it('proximo mira los dias que faltan segun el control', () => {
    const fila = { lote: '26004', vencido: false, dias_desde_analisis: 0,
                   dias_desde_control: 27, frecuencia_max: 30, alarmas: [] };
    expect(clasificarLote(fila).proximo).toBe(true);
  });

  it('sin control de proceso no inventa que falta poco', () => {
    const fila = { lote: '26005', vencido: false, dias_desde_analisis: 2,
                   dias_desde_control: null, frecuencia_max: 30, alarmas: [] };
    expect(clasificarLote(fila).proximo).toBe(false);
  });

  it('las dos condiciones nuevas cuentan como atencion', () => {
    expect(clasificarLote({ alarmas: ['so2_caida_alerta'], frecuencia_max: 30, dias_desde_control: 1 }).atencion).toBe(true);
    expect(clasificarLote({ alarmas: ['control_proceso_pendiente'], frecuencia_max: 30, dias_desde_control: 1 }).atencion).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npx vitest run test/lotes-orden-fuente.test.mjs -t "control de proceso"`
Expected: FAIL — `expected true to be false` en el primero (hoy usa `dias_desde_analisis`).

- [ ] **Step 3: Implementar**

En `public/lotes/js/orden-filas.js`, agregar las dos claves a `CRITERIOS_ATENCION`:

```javascript
const CRITERIOS_ATENCION = {
  so2:      'so2_no_ok',
  ph:       'ph_no_ok',
  av:       'av_alerta',
  fa:       'fa_no_finalizada',
  fml:      'fml_no_finalizada',
  noLleno:  'no_lleno',
  so2Caida: 'so2_caida_alerta',
  sinControl: 'control_proceso_pendiente',
};
```

Y cambiar el cálculo (línea 31):

```javascript
  /* La frecuencia se cuenta desde el ultimo CONTROL DE PROCESO, no desde el
   * ultimo analisis: un pH suelto no reinicia el reloj. Sin control, no hay
   * cuenta regresiva que mostrar. */
  const dias = l.dias_desde_control;
  const diasRestantes = dias === null || dias === undefined ? null : (l.frecuencia_max ?? 0) - dias;
```

y en el `return`:

```javascript
    proximo: !l.vencido && diasRestantes !== null && diasRestantes >= 0 && diasRestantes <= 5,
```

Actualizar el comentario de las líneas 15-16, que enumera las condiciones ausentes y ahora quedaría mal.

En `public/lotes/js/vista-dashboard.js`, agregar a `COND_LABELS`:

```javascript
  control_proceso_pendiente:  'Sin control de proceso',
  so2_caida_alerta:           'Caída de SO₂ libre',
```

- [ ] **Step 4: Correr los tests**

Run: `npm test`
Expected: PASS. Si algún test viejo de `lotes-orden-fuente.test.mjs` falla porque su fixture no trae `dias_desde_control`, **agregarle el campo al fixture** — es el dato que ahora manda, no un ajuste para que pase.

- [ ] **Step 5: Verificar en el navegador**

En el Dashboard, la tabla de alarmas tiene que mostrar "Caída de SO₂ libre" y "Sin control de proceso" con su nombre, no con la clave cruda.

- [ ] **Step 6: Commit**

```bash
git add public/lotes/js/orden-filas.js public/lotes/js/vista-dashboard.js test/lotes-orden-fuente.test.mjs
git commit -m "fix: la UI conoce las once condiciones y cuenta desde el control de proceso"
```

---

### Task 14: Baja de la pestaña vieja

**Files:**
- Delete: `public/lotes/js/vista-fml.js`
- Modify: `public/lotes/js/app.js:16` (sacar el import)
- Modify: `public/lotes/index.html:819` (sacar el botón) y `:1024` (sacar la sección)

**Interfaces:**
- Consumes: nada.
- Produces: una sola pestaña de FML.

> **`fml_finalizada_confirmada` no se borra de los datos.** El botón "Finalizar FML" se da de baja porque en el modelo del tablero el estado de FML lo calcula el motor con el málico, y la salida manual es marcar el lote como FML excluida. Los valores ya cargados en D1 quedan sin usarse, pero borrarlos sería tirar el registro de una decisión que alguien tomó.

- [ ] **Step 1: Confirmar que nadie más lo usa**

Run: `grep -rn "vista-fml\|fml_finalizada_confirmada\|renderSeguimiento" public/ src/ test/`
Expected: sólo `public/lotes/js/vista-fml.js` y la línea 16 de `app.js`. Si aparece algo más, **parar** y resolverlo antes de borrar.

- [ ] **Step 2: Borrar**

```bash
git rm public/lotes/js/vista-fml.js
```

En `public/lotes/js/app.js`, sacar `import './js/vista-fml.js';`.
En `public/lotes/index.html`, sacar `<button data-v="fml">🧫 Seguimiento FML</button>` y `<section class="view" id="tab-fml"></section>`.

- [ ] **Step 3: Renombrar la pestaña**

En `index.html`, dejar el botón del tablero como la pestaña de FML:

```html
<button data-v="tablero">🧫 Tablero FML</button>
```

- [ ] **Step 4: Correr todo y verificar en el navegador**

Run: `npm test && npx tsc --noEmit`
Expected: los dos verdes.

En el navegador, con la consola abierta:
1. Queda **una sola** pestaña de FML y abre sin errores.
2. Las otras pestañas que consumen el mismo dashboard siguen andando: **Dashboard**, **Evolución**, **Orden de muestras** y **Orden de corrección**. Son las que dependen de los campos de compatibilidad del motor.
3. Recargar con la pestaña del tablero activa no rompe (`mostrarTab` no encuentra `'fml'` en el registro).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: se da de baja la pestana Seguimiento FML"
```

---

### Task 15: Cierre — documentación y repaso

**Files:**
- Modify: `docs/superpowers/specs/2026-09-14-lotes-tablero-fml-design.md` (estado)
- Modify: `CLAUDE.md` si hiciera falta

- [ ] **Step 1: Marcar el spec como implementado**

En el encabezado del spec, cambiar `Estado: aprobado, pendiente de plan de implementación` por:

```markdown
Estado: implementado (tramo 1 motor + tramos 2-4 pestaña). Pendiente de desplegar:
correr `scripts/aplicar-datos-fml.mjs --remote --aplicar` (ver DESPLIEGUE.md) y
avisarle al equipo que los números del Dashboard cambian.
```

- [ ] **Step 2: Repasar los riesgos que quedan vivos**

Confirmar que estos tres siguen anotados en el spec y que nada de lo implementado los contradice:
- Los números del Dashboard **cambian** el día que salga (piso de SO₂ de 25 a 20, y `condicion_ideal` pasa a la definición del tablero). **Avisar antes, no después.**
- Los overrides por variedad son dato, no código: si alguien borra la fila de una variedad blanca, esa variedad empieza a exigir FML en silencio. El freno de borrado masivo no cubre `config`. Riesgo asumido.
- `dash-metricas.js` y `correccion.ts` conservan reglas propias que ya divergen del motor. Está fuera de alcance por decisión del tramo 1: siguen andando por la capa de compatibilidad.

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs: el tablero FML queda implementado, pendiente de desplegar"
```

---

## Verificación final

Antes de dar la rama por terminada:

- [ ] `npm test` verde (los 368 de hoy más los ~35 nuevos de estas tareas).
- [ ] `npx tsc --noEmit` sin errores.
- [ ] En el navegador, con datos reales cargados en la base local: una sola pestaña de FML; panel en sus dos modos; filtros que no pierden el foco; lista ordenada por antigüedad; ficha que abre, edita y refresca; Excel que baja lo filtrado; diálogo de criterios que refleja Configuración.
- [ ] Dashboard, Evolución, Orden de muestras y Orden de corrección siguen andando.
- [ ] **El despliegue no lo hace Claude.** Queda para el usuario: `git push` (dispara GitHub Actions) y, antes de que nadie mire la pestaña, correr `scripts/aplicar-datos-fml.mjs --remote --aplicar`. Sin ese paso, la pestaña sale con los umbrales viejos y con 179 lotes marcados como incompletos.
