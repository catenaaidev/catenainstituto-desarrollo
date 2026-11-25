# Rediseño de Prensas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar a `public/prensas/` la piel "Piedra y tinta", la barra compacta con "Más", el Dashboard tipo informe, filtros en la cabecera de cada columna, el armado de documentos en dos columnas y las cargas en tres pasos, y quitar Evolución y Asistente.

**Architecture:** Todo vive en `public/prensas/index.html` (CSS + markup) y `public/prensas/app.js` (script clásico, no módulo). La lógica pura nueva (posición del panel anclado, filtro por rango) va a un script clásico propio `public/prensas/filtros-cabecera.js` que se cuelga de `globalThis.PrensasFiltros`, así se puede testear con vitest (patrón de `public/barriles/js/orden-editable.js`). No cambian datos, reglas, API ni hojas impresas.

**Tech Stack:** HTML/CSS/JS vanilla, Cloudflare Workers (`wrangler dev`), vitest con `@cloudflare/vitest-pool-workers` (sin DOM).

**Spec:** `docs/superpowers/specs/2026-10-06-prensas-redisenio-visual-design.md`

## Global Constraints

- Worktree: `C:\Users\Bmax\repos\ci-prensas-redisenio`, rama `feat/prensas-redisenio`. Nunca trabajar en `C:\Users\Bmax\repos\catenainstitute`.
- No tocar `src/`, `public/lotes/`, `public/barriles/`, `public/shared/`.
- No cambiar ningún `id` que lea `app.js`, salvo los que se borran con Evolución/Asistente y las barras de filtro que reemplaza la cabecera (`fltRiesgoBar`, `fltLotesBar`, `fltAnaBar`, `fltAgrBar`, `fltDegBar`).
- `.orden-hoja` y `@media print`: sin cambios de contenido.
- Paleta (valores exactos): `--bg #ECE8E1`, `--panel #F4F1EB`, `--panel2 #E4DFD6`, `--line #D6D0C5`, `--rule #1C1B19`, `--txt #1C1B19`, `--muted #6F695F`, `--accent #5A1724`, `--accent2 #43101A`, `--ok #56684A`, `--nook #8E2330`, `--warn #9A7434`, `--info #3F5560`.
- Letras: Cormorant Garamond (solo títulos y números grandes) e IBM Plex Sans (todo lo demás), servidas desde `public/prensas/fonts/`.
- Sin emojis en la interfaz. Radios de 2 px. Sin sombras salvo desplegables y la hoja en el visor.
- Pestañas visibles: Panel, Alto riesgo, Lotes, Análisis, Degustación. En "Más": Agregados, Rellenos, Orden de muestras, Cargar análisis, Historial.
- Probar con `npm run dev:sin-ia` (:8788). Tras cada cambio de código, reiniciar el server y recargar con `?v=` (caché de assets).

---

### Task 1: Letras y tokens — la piel base

**Files:**
- Create: `public/prensas/fonts/cormorant-garamond-latin-{500-normal,600-normal,500-italic}.woff2`, `public/prensas/fonts/ibm-plex-sans-latin-{400,500,600}-normal.woff2`
- Delete: `public/prensas/fonts/fraunces-*.woff2`, `public/prensas/fonts/hanken-grotesk-*.woff2`
- Modify: `public/prensas/index.html` (bloque `<style>`, líneas 7–296)

- [ ] **Step 1: Bajar las letras de @fontsource (jsDelivr)**

```bash
cd /c/Users/Bmax/repos/ci-prensas-redisenio/public/prensas/fonts
B=https://cdn.jsdelivr.net/npm
for f in cormorant-garamond-latin-500-normal cormorant-garamond-latin-600-normal cormorant-garamond-latin-500-italic; do curl -sfLo $f.woff2 $B/@fontsource/cormorant-garamond@5/files/$f.woff2; done
for f in ibm-plex-sans-latin-400-normal ibm-plex-sans-latin-500-normal ibm-plex-sans-latin-600-normal; do curl -sfLo $f.woff2 $B/@fontsource/ibm-plex-sans@5/files/$f.woff2; done
file *.woff2   # los 6 nuevos tienen que decir "Web Open Font Format (Version 2)"
git rm -q fraunces-*.woff2 hanken-grotesk-*.woff2
```

- [ ] **Step 2: Reemplazar `@font-face` y `:root`** con las 6 letras nuevas y los tokens de Global Constraints, más `--serif:'Cormorant Garamond',Georgia,serif; --sans:'IBM Plex Sans',system-ui,'Segoe UI',sans-serif;`.

- [ ] **Step 3: Reescribir los componentes base** del `<style>` con los tokens: `body` (14px, `--bg`), scrollbar, `button.btn` (borde `--txt`, radio 2px; `.primary` tinto; `.danger`), `select/input.txt/textarea` (subrayado o caja `--panel` con `--line`), `table/th/td` (th en versalitas 10px `letter-spacing:1.4px`, filete inferior `--rule`, `position:sticky`, fondo `--panel`), `td.num` tabular, `.pill`, `.msg`, `.note`, `.tag`, `.overlay .box`, `tr.sep`, `tr.crit`, `tr.venc`, `td input.cell`, `.degbtn`, `.rowbtn` (color `--nook`), `.legend-inline .sw.*`, `.cs-sel` y `.cs-hud` (tinte del nuevo `--accent`), `.chip`, `.stepper`, `.mfilt-*`. Fondos de estado como tintes:
  - crítico `#F1E3E1` con filete `--nook`; vencido `#F2EADB` con filete `--warn`; separador `#E4DFD6`; ok `#E3E7DD`.

- [ ] **Step 4: Verificar que no quedan colores viejos en el CSS**

```bash
grep -noE "#(f7f5f1|f1efe9|e7e3da|2a2622|8c857b|8a3340|6f2731|3f7d4f|b03a2e|b07d2c|5b7b86|f6e4e1|ecccc6|f6ecd6|e4efe2|fbeeeb|faf2e0|f0ece2|ddd6c8|dcd7cc|cbc5b8|d8d2c6|e5efe6|cfe3d2|ff8a7a)\b|rgba\(138,51,64" public/prensas/index.html
```
Expected: sin salida, salvo dentro de `.orden-hoja` (hoja de papel, se deja).

- [ ] **Step 5: Ver en el navegador** (server `dev:sin-ia`, `/prensas/`): la piel nueva aplica en todas las pestañas, sin errores de consola, letras cargadas (`document.fonts.check('16px "IBM Plex Sans"')` → `true`).

- [ ] **Step 6: Commit** — `feat(prensas): piel Piedra y tinta (letras y tokens)`

---

### Task 2: Quitar Evolución y Asistente

**Files:**
- Modify: `public/prensas/index.html` (botones de pestaña, `<section id="v-evolucion">`, `<section id="v-asistente">`, CSS `.evo-*`, `.chat*`, `.chip-ej`)
- Modify: `public/prensas/app.js`

- [ ] **Step 1: Mover `initAgrLotes`** (hoy dentro del bloque de Evolución, `app.js` ~1250) arriba de `renderAgregados`, sin cambiarla. La usan Agregados y la carga de datos.

- [ ] **Step 2: Borrar en `app.js`**: `miniLineSVG`, `filtEvoM`, `_descEvo`, `_instEvo`, `ordenEvo`, `evoAbiertos`, `_evoModelCache`, `_evoObserver`, `initFiltrosEvo`, `limpiarFiltrosEvo`, `evoModelo`, `evoCardHTML`, `evoChartsHTML`, `evoDetalleHTML`, `evoConectarLazy`, `renderEvolucion`, `evoToggleCard`; todo el bloque ASISTENTE (`chatHistorial`, `CAMPOS_LOTE`, `chatAppend`, `descAccion`, `tarjetaAccion`, `aplicarAccion`, `enviarPregunta`, `_chatSaludado`, `renderAsistente`); las ramas `evolucion`/`asistente` de `renderActive`; en `setup()` las líneas de `buscaEvo`, `btnEvoNoOk`, `btnLimpiarFltEvo`, `ordenEvo`, `evoLista`, `chatEnviar`, `chatPregunta`, `.chip-ej`; y toda llamada restante a `initFiltrosEvo()`.

- [ ] **Step 3: Verificar que no quedan referencias**

```bash
grep -nE "Evo|evo[A-Z_]|miniLineSVG|chat|asistente|Asistente|iaModelo" public/prensas/app.js public/prensas/index.html
```
Expected: sin salida (fuera de la palabra "evolución" en comentarios ajenos, que se revisan a mano).

- [ ] **Step 4: Navegador** — cargar `/prensas/`, recorrer las pestañas que quedan, consola sin errores.

- [ ] **Step 5: Commit** — `feat(prensas): quitar las pestañas Evolución y Asistente`

---

### Task 3: Barra compacta con "Más"

**Files:**
- Modify: `public/prensas/index.html` (`<header>` + `.tabs`, líneas ~300–327; CSS de `header`, `.tabs`)
- Modify: `public/prensas/app.js` (`setupTabs`, `markSaved`, `pedirUsuario`, `verHistorial`, `mostrarQR`, avisos)

- [ ] **Step 1: Markup** — una sola franja:

```html
<header class="barra" id="barra">
  <span class="marca">Prensas</span>
  <nav class="tabs" id="tabs">
    <button data-v="dashboard" class="active">Panel</button>
    <button data-v="riesgo">Alto riesgo</button>
    <button data-v="lotes">Lotes</button>
    <button data-v="analisis">Análisis</button>
    <button data-v="degustacion">Degustación</button>
    <div class="mas" id="masWrap">
      <button type="button" class="mas-btn" id="masBtn" aria-haspopup="true" aria-expanded="false">Más</button>
      <div class="mas-menu" id="masMenu" role="menu">
        <div class="mas-grupo">Registro</div>
        <button data-v="agregados">Agregados</button>
        <button data-v="relleno">Rellenos</button>
        <div class="mas-grupo">Herramientas</div>
        <button data-v="orden">Orden de muestras</button>
        <button data-v="cargar">Cargar análisis</button>
        <button type="button" id="btnHistorial">Historial</button>
      </div>
    </div>
  </nav>
  <div class="right">
    <button class="btn" id="btnConectar" style="display:none" title="…mismo title…">Conectar</button>
    <span class="status" id="status">Cargando…</span>
    <span class="status usuario" id="usuario" style="cursor:pointer" title="…mismo title…">—</span>
    <button class="btn" id="btnExport">Exportar</button>
    <button class="btn primary" id="btnGuardar" disabled>Guardar</button>
  </div>
</header>
```

- [ ] **Step 2: `setupTabs`** — mantiene el `closest('button[data-v]')`; además marca el "Más" y cierra el menú:

```js
function setupTabs(){
  const masBtn=$('masBtn'), masMenu=$('masMenu');
  const cerrarMas=()=>{ masMenu.classList.remove('open'); masBtn.setAttribute('aria-expanded','false'); };
  masBtn.addEventListener('click',e=>{ e.stopPropagation(); const ab=!masMenu.classList.contains('open');
    masMenu.classList.toggle('open',ab); masBtn.setAttribute('aria-expanded',String(ab)); });
  document.addEventListener('click',e=>{ if(!e.target.closest('#masWrap')) cerrarMas(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') cerrarMas(); });
  $('tabs').addEventListener('click',e=>{ const b=e.target.closest('button[data-v]'); if(!b)return;
    document.querySelectorAll('.tabs button[data-v]').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); $('v-'+b.dataset.v).classList.add('active');
    const enMas=!!b.closest('#masMenu');
    masBtn.classList.toggle('active',enMas);
    masBtn.textContent=enMas?b.textContent:'Más';
    cerrarMas(); renderActive();
  });
  $('btnHistorial').addEventListener('click',cerrarMas);
}
```
y en `renderActive` / `postGuardarDeg` cambiar `.tabs button.active` por `.tabs button[data-v].active`.

- [ ] **Step 3: CSS** — `.barra` (flex, padding 12px 22px, filete inferior `--rule`, fondo `--bg`, `position:sticky; top:<alto de #ciw-barra>`), `.marca` serif 24px, `.tabs button` (2px radio, activo fondo `--txt` texto `--bg`), `.mas-btn::after{content:' ▾'}`, `.mas-menu` (absolute, `--panel`, borde `--line`, sombra, `display:none`; `.open` → block), `.mas-grupo` versalitas. Bajo 900px: `.tabs > button[data-v]` se ocultan y aparecen dentro de `.mas-menu` (duplicar no: con CSS `@media` se cambia el menú a contener todo usando `order`… más simple: un segundo grupo `.mas-angosto` con los 5 botones, oculto salvo `@media(max-width:900px)`).

- [ ] **Step 4: Textos sin emoji en `app.js`** — `markSaved`: `'Guardado · v'+…` (sin `✓`, el color lo da `.status.saved::before` con un punto); `pedirUsuario`: sin `👤`; `verHistorial`: título sin `🕘` y color `var(--muted)` en vez de `#8c857b`; `mostrarQR`: sin `📱`; avisos: `<b>Atención:</b>`; conflicto: color `var(--warn)` en vez de `#ffd766`.

- [ ] **Step 5: Navegador** — cada una de las 9 pestañas se activa (5 directas + 4 del "Más"); el "Más" muestra el nombre de la activa; Escape y clic afuera cierran; Historial abre el overlay; a 390px de ancho no hay scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`).

- [ ] **Step 6: Commit** — `feat(prensas): barra compacta con menú Más`

---

### Task 4: Lógica pura de los filtros de cabecera (TDD)

**Files:**
- Create: `public/prensas/filtros-cabecera.js`
- Create: `test/prensas-filtros-cabecera.test.mjs`
- Modify: `public/prensas/index.html` (agregar `<script src="filtros-cabecera.js"></script>` antes de `app.js`)

**Interfaces:**
- Produces: `globalThis.PrensasFiltros = { posicionDePanel(ancla,panel,ventana) → {izq,top}, pasaRango(valor, rango, tipo) → boolean, rangoActivo(rango) → boolean }`
  - `ancla`: `{left,top,bottom}`; `panel`: `{ancho,alto}`; `ventana`: `{ancho,alto}`.
  - `rango`: `{min?:string,max?:string}`; `tipo`: `'num'|'date'`.

- [ ] **Step 1: Test que falla**

```js
// test/prensas-filtros-cabecera.test.mjs
import { describe, it, expect } from 'vitest';
import '../public/prensas/filtros-cabecera.js';
const F = globalThis.PrensasFiltros;

describe('posicionDePanel', () => {
  const v = { ancho: 1000, alto: 800 };
  it('abre abajo del ancla si entra', () => {
    expect(F.posicionDePanel({ left: 100, top: 50, bottom: 70 }, { ancho: 200, alto: 300 }, v))
      .toEqual({ izq: 100, top: 74 });
  });
  it('se vuelca arriba si abajo no entra', () => {
    expect(F.posicionDePanel({ left: 100, top: 700, bottom: 720 }, { ancho: 200, alto: 300 }, v))
      .toEqual({ izq: 100, top: 396 });
  });
  it('no se sale por la derecha', () => {
    expect(F.posicionDePanel({ left: 950, top: 50, bottom: 70 }, { ancho: 200, alto: 100 }, v).izq).toBe(794);
  });
});

describe('pasaRango', () => {
  it('sin rango pasa todo, incluso vacío', () => {
    expect(F.pasaRango('', {}, 'num')).toBe(true);
    expect(F.rangoActivo({ min: '', max: '' })).toBe(false);
  });
  it('números con coma decimal', () => {
    expect(F.pasaRango('3,9', { min: '3,5', max: '4' }, 'num')).toBe(true);
    expect(F.pasaRango('4,1', { max: '4' }, 'num')).toBe(false);
    expect(F.pasaRango(null, { min: '1' }, 'num')).toBe(false);
  });
  it('fechas ISO', () => {
    expect(F.pasaRango('2026-09-15', { min: '2026-09-01', max: '2026-09-30' }, 'date')).toBe(true);
    expect(F.pasaRango('2026-10-01', { max: '2026-09-30' }, 'date')).toBe(false);
    expect(F.pasaRango('', { min: '2026-09-01' }, 'date')).toBe(false);
  });
});
```

- [ ] **Step 2: Correr** `npx vitest run test/prensas-filtros-cabecera.test.mjs` → FAIL (`PrensasFiltros` undefined).

- [ ] **Step 3: Implementar**

```js
/* Lógica pura de los filtros en la cabecera de Prensas. Script clásico (la
 * página no usa módulos): se cuelga de globalThis para que app.js y los tests
 * la lean igual. Posición del panel: misma regla que public/lotes/js/posicion-panel.js. */
(function (g) {
  'use strict';
  var MARGEN = 6, SEPARACION = 4;
  function posicionDePanel(ancla, panel, ventana) {
    var izq = Math.max(MARGEN, Math.min(ancla.left, ventana.ancho - panel.ancho - MARGEN));
    var abajo = ancla.bottom + SEPARACION;
    var arriba = ancla.top - panel.alto - SEPARACION;
    var entra = abajo + panel.alto <= ventana.alto - MARGEN;
    return { izq: izq, top: entra ? abajo : Math.max(MARGEN, arriba) };
  }
  function lleno(s) { return s != null && String(s).trim() !== ''; }
  function rangoActivo(r) { return !!r && (lleno(r.min) || lleno(r.max)); }
  function aNum(s) { var n = parseFloat(String(s).replace(',', '.')); return isNaN(n) ? null : n; }
  function pasaRango(valor, r, tipo) {
    if (!rangoActivo(r)) return true;
    if (tipo === 'date') {
      var v = lleno(valor) ? String(valor) : '';
      if (lleno(r.min) && (!v || v < r.min)) return false;
      if (lleno(r.max) && (!v || v > r.max)) return false;
      return true;
    }
    var x = lleno(valor) ? aNum(valor) : null;
    var mn = lleno(r.min) ? aNum(r.min) : null, mx = lleno(r.max) ? aNum(r.max) : null;
    if (mn != null && (x == null || x < mn)) return false;
    if (mx != null && (x == null || x > mx)) return false;
    return true;
  }
  g.PrensasFiltros = { posicionDePanel: posicionDePanel, pasaRango: pasaRango, rangoActivo: rangoActivo };
})(globalThis);
```

- [ ] **Step 4: Correr** el test → PASS. Correr `npm test` completo → verde.

- [ ] **Step 5: Commit** — `feat(prensas): lógica pura de filtros de cabecera con tests`

---

### Task 5: Embudos en la cabecera de las tablas

**Files:**
- Modify: `public/prensas/app.js` (`crearFiltroMulti`, `tablaEditable`, `pasaFiltros`, filtros de Lotes/Análisis/Agregados/Riesgo/Degustación, `renderRiesgo`, `renderDegustacion`, `setup`)
- Modify: `public/prensas/index.html` (quitar `.mfilt-bar` de esas 5 pantallas; CSS `th .th-flt`, `.mfilt-anclado`, `.mfilt-rango`)

**Interfaces:**
- Consumes: `PrensasFiltros.posicionDePanel`, `PrensasFiltros.pasaRango`, `PrensasFiltros.rangoActivo` (Task 4).
- Produces: `crearFiltroMulti(cfg)` acepta `cfg.anclado:true` y `cfg.rango:{state:Object,k:string,tipo:'num'|'date',onChange}`; devuelve `{el,sync,rebuild,abrir(ancla)}`. `embudoHTML(k, n, label)` → string del botón. `cablearEmbudos(tabla, mapaFiltros)` engancha clic en `.th-flt` → `mapaFiltros.get(k).abrir(btn)`.

- [ ] **Step 1: `crearFiltroMulti` modo anclado** — portar de `public/lotes/js/tabla.js:52-172`: si `cfg.anclado`, el panel se agrega a `document.body` con clase `mfilt-anclado` (`position:fixed`), sin botón propio; `abrir(ancla)` cierra los demás paneles, reconstruye la lista, lo muestra y lo ubica con `PrensasFiltros.posicionDePanel(ancla.getBoundingClientRect(), {ancho:panel.offsetWidth, alto:panel.offsetHeight}, {ancho:innerWidth, alto:innerHeight})`. Si `cfg.rango`, antes de la búsqueda agrega `<div class="mfilt-rango"><input data-r="min" placeholder="desde"><input data-r="max" placeholder="hasta"></div>` (`type="date"` si `tipo==='date'`), que escriben en `cfg.rango.state[k]` (borra la clave si quedan vacíos) y llaman `cfg.rango.onChange()`.

- [ ] **Step 2: `pasaFiltros`** usa `PrensasFiltros.pasaRango(valCol(o,c), state[c.k], c.date?'date':'num')` para columnas `num`/`date` (y sigue con `txt` para las de texto, que ya nadie llena).

- [ ] **Step 3: `tablaEditable`** — reemplazar la fila `tr.fltrow` por un embudo en cada `<th data-k>`:

```js
function embudoHTML(k, n, label){
  const tit=n?`${label}: ${n} filtro${n>1?'s':''} activo${n>1?'s':''}`:`Filtrar por ${label}`;
  return ` <button type="button" class="th-flt${n?' active':''}" data-flt="${escA(k)}" title="${escA(tit)}">▾${n?' '+n:''}</button>`;
}
```
El `th.onclick` de ordenar ignora clics en `.th-flt` (`if(e.target.closest('.th-flt'))return;`). `tablaEditable` recibe `fltMap` (Map `k → {inst, n:()=>number}`) en el lugar del viejo `flt`, y al final hace `t.querySelectorAll('.th-flt').forEach(b=>b.onclick=e=>{e.stopPropagation(); fltMap.get(b.dataset.flt).inst.abrir(b);})`.

- [ ] **Step 4: Un filtro por columna** — para Lotes (`COLS_LOTES`), Análisis (`COLS_ANA` + columnas de solo lectura `_variedad` y `_prensa` calculadas con `loteDe`), Agregados (`COLS_AGR` + `_prensa`): crear un `crearFiltroMulti({anclado:true, label:c.label, set, opciones:()=>opcionesValores(base, r=>valCol(r,c)), onChange:render, rango: (c.num||c.date)? {state:filtXxx, k:c.k, tipo:c.date?'date':'num', onChange:render} : undefined})` por columna; `n()` = `set.size + (rangoActivo(state[k])?1:0)`. Filtrado: `pasaMulti` sobre los sets + `pasaFiltros` sobre los rangos. Los `filtLotes`/`filtAnaM`/`filtAgrM` actuales se reemplazan por un Map por tabla `{k → Set}`; `limpiarFiltrosX` vacía sets, rangos y buscador.

- [ ] **Step 5: Análisis "Mostrar"** — `<select id="anaMostrar"><option value="">Mostrar todo</option><option value="con">Con análisis</option><option value="sep">Solo separadores</option><option value="nook">Solo NO OK</option></select>` en la barra; `renderAnalisis` filtra con la misma regla de hoy.

- [ ] **Step 6: Alto riesgo y Degustación** — sus `<th>` (armados a mano en `renderRiesgo`/`renderDegustacion`) llevan `embudoHTML` para Lote, Variedad, Prensa, Motivo (riesgo) y Lote, ID origen, Variedad, Prensa, Estado (degustación; sumar columnas Variedad y Prensa de solo lectura). En Riesgo el filtro se aplica sobre `filas` (lote completo), así las dos filas viajan juntas.

- [ ] **Step 7: Markup y CSS** — quitar `#fltRiesgoBar`, `#fltLotesBar`, `#fltAnaBar`, `#fltAgrBar`, `#fltDegBar` del HTML. CSS: `th .th-flt{border:1px solid transparent;background:none;color:var(--muted);font-size:10px;padding:0 4px;border-radius:2px;margin-left:4px;cursor:pointer}`, `.th-flt:hover{color:var(--txt);border-color:var(--line)}`, `.th-flt.active{color:var(--accent);border-color:var(--accent)}`, `.mfilt-panel.mfilt-anclado{position:fixed;top:0;left:0;z-index:60}`, `.mfilt-rango{display:flex;gap:6px;margin-bottom:6px}`. El cierre global de paneles (`document.addEventListener('click',…)`) ya existe y sirve.

- [ ] **Step 8: Navegador** — en cada una de las 5 tablas: un embudo filtra y muestra `▾ n`; dos embudos se combinan; desde/hasta en pH de Análisis filtra; ordenar con clic en el nombre sigue andando y no abre el embudo; Limpiar filtros deja todo en cero; el panel no queda recortado con la tabla scrolleada; Alt+clic en un `<th>` sigue seleccionando la columna (cellSelect); editar una celda marca "sin guardar".

- [ ] **Step 9: Commit** — `feat(prensas): filtros en la cabecera de cada columna, como en Lotes`

---

### Task 6: Cabecera de página y barras de tabla

**Files:**
- Modify: `public/prensas/index.html` (inicio de cada `<section>` salvo dashboard; `.note` largos; `.toolbar` de tablas; placeholders y textos de botones)
- Modify: `public/prensas/app.js` (textos con emoji restantes: `pintarMapaChips*` `🗺️`, mensajes `✅`, pills `✓ ! ✕` quedan como signos tipográficos, `📝` en `<option>`)

- [ ] **Step 1: Cabecera** en cada pestaña:

```html
<div class="pg-head">
  <h1>Lotes</h1>
  <p>Maestro de lotes de prensa: litros, variedad y estado según su último análisis.</p>
  <div class="pg-acc"><button class="btn" id="btnAddLote">Agregar lote</button></div>
</div>
```
Textos: Alto riesgo — "Lotes con málico y volátil altos, azúcar residual o un salto brusco de AV."; Análisis — "Historial de análisis de laboratorio por lote."; Degustación — "Degustación mensual: estado sensorial de cada lote."; Agregados — "Bitácora de agregados (TH2, SO₂) con su fecha."; Orden de muestras — "Arma la orden de toma de muestras para el laboratorio."; Rellenos — "Arma la orden de rellenos por variedad y lote de origen."; Cargar análisis — "Pegá los datos del laboratorio copiados desde Excel."

- [ ] **Step 2: Plegar `.note`** de Alto riesgo, Agregados y Degustación en `<details class="info"><summary>Cómo se calcula</summary>…texto de hoy…</details>` (Degustación/Agregados: "Cómo funciona").

- [ ] **Step 3: Barra de tabla** `.tbar`: buscador sin `🔎` (placeholder "Buscar lote…"), `Limpiar filtros` sin `🧹`, contador `.tag` a la derecha. Quitar `➕ ＋ ⬆️ 🧾 🖨️ 🔄 🗑️ 🔍 ✅ ⚡ 🗺️ 📝 🔴` de todos los botones y opciones.

- [ ] **Step 4: Verificar emojis**

```bash
grep -nP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FF0B}]" public/prensas/index.html public/prensas/app.js
```
Expected: sin salida (se permiten `✓ ✕ ▾ ▲ ▼ − ·`, que no están en esos rangos salvo `✓ ✕` → si aparecen, revisar uno por uno: en pills y botones de borrar se quedan).

- [ ] **Step 5: Navegador + Commit** — `feat(prensas): cabecera de página y barras de tabla sin emojis`

---

### Task 7: Dashboard tipo informe

**Files:**
- Modify: `public/prensas/index.html` (`#v-dashboard`, CSS `.kpis`, `.kpi`, `.crit-list`, `.charts-grid`, nuevas `.dash-*`, `.solapas`)
- Modify: `public/prensas/app.js` (`renderDashboard`, `renderDonut`, `renderBars`, `renderScatter`, constante `PALETA`)
- Modify: `public/shared/dashboard-html.js` — **no**: se resuelve con CSS de la copia (ver Step 5).

- [ ] **Step 1: Markup** — controles; `<div class="kpis">` con los 5 KPI (mismos ids, sin `.bar`); `<div class="dash-grid">` con izquierda `<div class="solapas" id="dashSolapas">` (4 botones `data-sol="tNoOk|tVenc|tProx|tUltAgr"` con su `<span id="cntNoOk">`… dentro) y los 4 `<div class="scroll sol-panel" data-sol="…"><table id="…"></table></div>`; derecha: `Fallas por criterio` (`#critList`), `pH vs Acidez volátil` (`#chScatter`), `Estado de lotes` (`#chDonut`), `Criterios fallidos` (`#chBars`); `.foot`.

- [ ] **Step 2: Solapas** en `setup()`:

```js
function elegirSolapa(id){
  document.querySelectorAll('#dashSolapas [data-sol]').forEach(b=>b.classList.toggle('active',b.dataset.sol===id));
  document.querySelectorAll('.sol-panel').forEach(p=>p.classList.toggle('activo',p.dataset.sol===id));
  try{ localStorage.setItem('prensas_solapa',id); }catch(e){}
}
$('dashSolapas').addEventListener('click',e=>{ const b=e.target.closest('[data-sol]'); if(b) elegirSolapa(b.dataset.sol); });
let sol='tNoOk'; try{ sol=localStorage.getItem('prensas_solapa')||sol; }catch(e){}
elegirSolapa(['tNoOk','tVenc','tProx','tUltAgr'].includes(sol)?sol:'tNoOk');
```
CSS: `.sol-panel{display:none}.sol-panel.activo{display:block}`. Contadores: `cntNoOk` etc. pasan a mostrar solo el número.

- [ ] **Step 3: `PALETA`** al inicio del bloque de gráficos:

```js
function PALETA(){
  const s=getComputedStyle(document.documentElement), v=n=>s.getPropertyValue(n).trim();
  return {txt:v('--txt'), muted:v('--muted'), line:v('--line'), ok:v('--ok'), nook:v('--nook'), warn:v('--warn'), accent:v('--accent')};
}
```
`renderDashboard` la lee una vez y pasa los colores: donut OK `ok`, NO OK `nook`, Sin análisis `muted`; barras en `accent` (cero en `line`); dispersión: marco `line`, umbrales `nook` punteado, textos `muted`, puntos `ok`/`nook`; texto central del donut en serif con `txt`. Barras sin `rx`.

- [ ] **Step 4: `critList`** como barras: cada fila `<div class="row"><span class="name">pH <small>&gt; 4</small></span><span class="tr"><i style="width:${pct}%"></i></span><span class="val">9</span></div>`, con `pct = v/max*100`.

- [ ] **Step 5: Descargar HTML** — en el HTML bajado no hay JS de solapas: agregar CSS `body:not(:has(#tabs)) .sol-panel{display:block}` y `body:not(:has(#tabs)) .solapas{display:none}` (la copia no lleva la barra). Comprobar abriendo el archivo bajado que se ven las 4 tablas.

- [ ] **Step 6: Navegador** — números y gráficos coinciden con los de antes del cambio (anotar los 5 KPI de `main` antes de empezar y comparar); solapa se recuerda tras F5; a <1000px una sola columna.

- [ ] **Step 7: Commit** — `feat(prensas): dashboard tipo informe con solapas y paleta en gráficos`

---

### Task 8: Armado de documentos en dos columnas

**Files:**
- Modify: `public/prensas/index.html` (`#v-orden`, `#v-relleno`, `#accionWrap`, `#agrOrdenWrap`; CSS `.doc`, `.doc-panel`, `.doc-grupo`, `.doc-visor`)

- [ ] **Step 1: Estructura** — cada documento pasa a:

```html
<div class="doc no-print">  <!-- solo la cáscara es no-print -->
  <aside class="doc-panel">
    <div class="doc-grupo"><h4>1 · Qué lotes</h4> …controles existentes, mismos ids… </div>
    <div class="doc-grupo"><h4>2 · Encabezado</h4> … </div>
    <div class="doc-grupo"><h4>3 · Valores por defecto</h4> … </div>
    <div class="doc-grupo"><h4>4 · Mapas de barriles</h4> … </div>
  </aside>
  <section class="doc-visor">
    <div class="doc-visor-bar"><span class="tag" id="ordenCount"></span><span class="doc-tope">Máx 25 lotes por hoja</span><button class="btn primary" id="btnImprimir">Imprimir</button></div>
    <div id="ordenPaginas"></div>
  </section>
</div>
```
**Cuidado con imprimir:** `#ordenPaginas` (y sus pares) NO pueden quedar dentro de un ancestro con `.no-print` (`display:none` en print los mata). Aplicar `.no-print` a `.doc-panel` y `.doc-visor-bar`, no a `.doc`. Mover cada control a su grupo sin cambiar ids:
  - Orden: 1 `ordenFuente`, `wrapNookTipo`, `fltOrdenBar`, `btnLimpiarFltOrden`, `btnRegenerar` · 2 `ordNro`, `ordFecha`, `ordDia`, `ordRecibio` · 3 `ordRecipiente`, stepper `ordCant*`, `ordVasija`, `btnAplicarTodos`, `btnAddOrdenFila` · 4 `ordMapaFile`, `btnOrdMapa`, `ordMapaChips`.
  - Rellenos: 1 `relVarAdd`, `relVarChips`, `relOrigenAdd`, `relOrigenChips`, `relRellenarCon`, `btnRegenerarRelleno` · 2 `relNro`, `relFecha`, `relDia`, `relEmitio`, `relRecibio` · 3 `relVasija`, stepper `relCant*`, `btnAddRellenoFila` · 4 Instrucciones y pie `relInstrucciones`, `relPie` · 5 mapas `relMapa*`.
  - Acción rápida: 1 `btnArRegenerar` · 2 `arNro`, `arFecha`, `arDensidad`, `arEmitio`, `arRecibio` · 3 `arVasija`, `arMl`, `btnArAplicar`, `btnArAddFila`, regla; visor con `arCount`, `btnArOcultar`, `btnArImprimir`, `#accionPaginas`.
  - OT de Agregados: 1 `btnAgrOrdFiltrados`, `btnAgrOrdVaciar`, `agrOrdLote`/`agrOrdTipo`/`agrOrdCant`/`btnAgrOrdAdd`, `agrOrdPaste`/`btnAgrOrdPegar`/`agrOrdPasteMsg` · 2 `agrOrdNro`, `agrOrdFecha`, `agrOrdEmitio`, `agrOrdRecibio`; visor con `agrOrdCount`, `btnAgrOrdOcultar`, `btnAgrOrdImprimir`, `#agrOrdenPaginas`.

- [ ] **Step 2: CSS** — `.doc{display:grid;grid-template-columns:290px 1fr;border-top:1px solid var(--rule)}`, `.doc-panel{background:var(--panel2);padding:18px;border-right:1px solid var(--line)}`, `.doc-grupo h4` versalitas, campos en filas `label + control` a todo el ancho, `.doc-visor{background:#D9D3C8;padding:22px;overflow:auto}`, `.doc-visor .orden-hoja{box-shadow:0 1px 4px rgba(0,0,0,.14)}`; `@media(max-width:1000px){.doc{grid-template-columns:1fr}}`. En `@media print` agregar `.doc-visor{background:none;padding:0}` y `.doc{display:block;border:none}`.

- [ ] **Step 3: Navegador** — cada documento genera, edita filas, aplica defaults, adjunta mapa; **vista de impresión** (`window.print` → previsualización, o `matchMedia` emulado) muestra solo las hojas y se ve igual que en `main` (comparar captura de Orden de muestras antes/después).

- [ ] **Step 4: Commit** — `feat(prensas): armado de documentos con panel de campos y visor`

---

### Task 9: Cargas en tres pasos

**Files:**
- Modify: `public/prensas/index.html` (`#v-cargar`, `#agrImportWrap`; CSS `.pasos`, `.col-etq`)
- Modify: `public/prensas/app.js` (`analizarPegado`, `confirmarCarga`, `analizarPegadoAgr`, `confirmarCargaAgr`: marcar paso)

- [ ] **Step 1: Markup** — tira `<ol class="pasos" id="pasosCarga"><li data-p="1" class="on"><b>1</b>Pegar</li><li data-p="2"><b>2</b>Revisar</li><li data-p="3"><b>3</b>Cargar al historial</li></ol>` (y `pasosCargaAgr`). Columnas esperadas como `<span class="col-etq">Lote</span>…` en el lado derecho, sobre `importMsg`.

- [ ] **Step 2: Paso activo**

```js
function marcarPaso(id, n){ document.querySelectorAll('#'+id+' li').forEach(li=>li.classList.toggle('on', +li.dataset.p===n)); }
```
`analizarPegado` → `marcarPaso('pasosCarga', 2)` si hay vista previa; `confirmarCarga` → `3`; editar `pasteArea` → `1`. Igual con `pasosCargaAgr`.

- [ ] **Step 3: Navegador** — pegar 2 filas válidas + 1 inválida: paso 2 con 2 OK y 1 descartada; cargar: paso 3 y "sin guardar".

- [ ] **Step 4: Commit** — `feat(prensas): cargas desde Excel en tres pasos`

---

### Task 10: Verificación final

- [ ] **Step 1:** `npm test` y `npx tsc --noEmit` → verdes.
- [ ] **Step 2:** Greps de Task 1 Step 4, Task 2 Step 3 y Task 6 Step 4 → sin salida.
- [ ] **Step 3:** En el navegador, a 1280 y 390 px: recorrer las 9 pestañas; `scrollWidth<=innerWidth`; consola sin errores; contraste `--muted` sobre `--bg` ≥ 4.5 (calcularlo con JS).
- [ ] **Step 4:** Guardar un cambio real en la D1 local (editar comentario de un lote) y recargar: persiste.
- [ ] **Step 5:** Descargar HTML del Dashboard, abrirlo: 4 tablas visibles con la piel nueva.
- [ ] **Step 6:** Capturas para el usuario: Panel, Lotes con un embudo abierto, Orden de muestras.
- [ ] **Step 7:** Pedir OK para mergear a `main` (sin deploy: lo corre el usuario).
