# Estética unificada · Etapa 3 (Barriles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Barriles se vea y se maneje como Prensas (tokens, letras, barra con Más, diálogos propios) y se pueda usar desde el celular, sin que cambie ninguno de sus colores con significado (mapa 2D/3D, escáner, cámara, modo por lote, Registro) ni sus hojas de papel.

**Architecture:** Primero las redes de seguridad: un server de prueba sin login que sirve `public/` con el último respaldo, un muestreo de colores calculados, una foto de todos los colores escritos en el JS (escena 3D, textos de la cámara) y PDFs de las tres hojas impresas. Después se congelan los colores con significado como tokens `--sem-*` con su valor de hoy y se saca la foto del papel; recién entonces Barriles carga `public/shared/estilo.css`, cambia la barra y el estilo de la interfaz. Las 69 ventanitas nativas pasan por un único archivo clásico `js/dialogos.js` (funciones `dlg*`) que delega en `CI.*`, vigilado por un test que cuenta las que quedan y baja a 0 tarea a tarea.

**Tech Stack:** HTML/CSS/JS vanilla (Barriles es un `index.html` de ~6.900 líneas con scripts clásicos, no módulos), scripts compartidos `public/shared/{estilo.css,dialogo-modelo.js,dialogo.js,barra.js}`, Cloudflare Workers, vitest con `@cloudflare/vitest-pool-workers` (sin DOM ni `fs`: los archivos llegan como bindings desde `vitest.config.ts`), Chrome headless + PyMuPDF para comparar las hojas impresas.

**Spec:** `docs/superpowers/specs/2026-10-16-estetica-unificada-design.md` (Parte 3 · Barriles). Plan anterior, como modelo de formato y de técnica: `docs/superpowers/plans/2026-10-16-estetica-etapa2-lotes.md`.

## Global Constraints

- **Prensas no se toca** (ni `public/prensas/`). **Lotes tampoco** (salvo que un cambio compartido lo obligue: se para y se pregunta).
- **Barriles local está congelado desde el 2026-10-06**: el cambio va solo en `repos\catenainstitute` (este worktree). No se toca el repo de mapa-barriles.
- **Colores con significado NO cambian de valor**: estados del mapa 2D (`.celda` libre/hueco/resaltada/atenuada/cursor/destino, `colorLote`), la escena 3D completa, el feedback del escáner (`.fb-libre`, `#escFeedback`, `#escResumen`, `.inp-libre.error`, `#escInstrucciones`), toda la cámara (marcos amarillo/verde/celeste, fondos, botones de colores, textos del pie), el amarillo del modo por lote, píldoras de estado e inventario, marcas del historial, Registro, rótulos verde/blanca/¿?, cifras de alerta, velo sin conexión y aviso de solo lectura. Se verifican con `scripts/muestreo-colores-barriles.js` (antes y después **idéntico**), con `test/barriles-colores-js.test.mjs` (los colores escritos en el JS, idénticos) y con `test/barriles-colores-congelados.test.ts`.
- **Hojas de papel y `@media print` no se tocan.** El mapa (`#areaImpresion`), el Registro impreso y los rótulos A4 tienen que salir iguales: lo vigila `test/barriles-papel-intacto.test.mjs` y la comparación de PDFs (`$S/comparar-pdf.py`).
- **Los 6 botones grandes de la portada del operario no se achican** (alto mínimo 150 px, título 1.35rem, ícono 2.6rem, 3 columnas; 2 bajo 700 px).
- **44 px mínimo en todo lo táctil** (`--ci-tap`). Campos a 16 px en celular. Breakpoint de celular: `760px`.
- Botones de diálogo con la acción escrita (`'Borrar orden'`); nunca "Aceptar"/"OK". Lo peligroso con `peligro: true` (el foco arranca en "no": un Enter de la pistola no confirma).
- **`CI.avisar` no toma el foco**: el escáner (`#escInput`, `.inp-libre`, `#barInputTanque`) sigue recibiendo la pistola mientras hay un aviso.
- Sin emojis en pestañas, sub-pestañas, títulos de la barra ni insignia. Los íconos de los botones grandes de la portada y los botones de las vistas pueden quedar.
- Tokens de Prensas: los da `estilo.css` (vigilado por `test/estilo-tokens.test.ts`). Barriles **no** los redefine.
- Textos en castellano rioplatense, con `…`.
- **Push a `main` = deploy a producción** (Workers Builds). No se pushea sin verificación local completa y OK explícito del usuario.
- Trabajar **siempre en el worktree propio** `C:\Users\Bmax\repos\catenainstitute-estetica-barriles` (otras sesiones cambian de rama `repos\catenainstitute`; ahí hay un `borrar-duplicados-2026-10-14.sql` sin trackear que no es nuestro).
- **Tests de a 12 archivos** (todos juntos dan timeout en esta PC): ver la Task 0, Step 3. `npx tsc --noEmit` tiene que quedar en 0 (un test `.ts` que importa un `.mjs` necesita su `.d.mts`).
- Los subagentes no pueden guardar capturas a disco: verifican con medidas por JS (`getBoundingClientRect`, `getComputedStyle`) y los PDFs se generan con Chrome headless desde Bash.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Desvíos de la spec, a propósito:**
- **Paso 0 ya estaba hecho:** `feat/barriles-programador` (9ff29b6) está en `main` desde el merge `23ff7e1` y en `origin/main`. La Task 0 solo lo confirma.
- **`inputmode`:** la spec lo pide en OT, lote y cantidad. Medido en el respaldo v2994 (788 órdenes, 2395 vasijas): 29 lotes llevan letras (`25832-T50`, `GW BODEGA`, `25328-MERMO`), 582 OT llevan texto (`OT-89`, `A hacer 3/2`) y hay OT `B219`. OT y lote quedan con **teclado de texto**. Van con `inputmode="numeric"` la cantidad de rótulos y los tres campos "Tipear" de la cámara (las 2395 vasijas del inventario son numéricas).
- **Papel, única diferencia a propósito:** `#navSubProg` (sub-pestañas del programador) y la ayuda del operario pasan **dentro** del `<header>`, que el `@media print` ya oculta. Hoy `#navSubProg` es hijo directo de `body` y se imprimía por error arriba de la hoja del mapa del programador. Las comparaciones de PDF se hacen con el operario (no tiene esa tira).
- **Bloque nuevo `@media print` "Papel igual que antes"** (Task 2): el mapa y el Registro impresos heredan la letra (Segoe), el fondo crema y el peso de los `h2` del `body` de pantalla. Como la pantalla cambia, el papel los fija con los valores de hoy. No cambia nada impreso; los bloques `@media print` existentes no se tocan.
- **Registro:** sus tarjetas (`.reg-*`) se imprimen tal cual la pantalla, así que son papel y quedan **congeladas también en pantalla**. Cambian solo el buscador, los meses y los botones de acción (`.reg-barra`, `.reg-buscador`, `.reg-como`, `.reg-meses`, `.reg-mes`, `.reg-acciones`).
- **Cámara completa congelada** (fondos negros, botones de colores, cabeceras, textos): los colores del texto (`#b9f6ca`, `#ffd180`, `#ff8a80`) se eligieron contra ese fondo. Solo cambian padding (safe-area) y capas.
- **Programador:** arriba quedan **Inicio · Barriles · Mapa · Imprimir**; **Administrar** pasa a **Más** con sus cuatro pantallas directo en el menú (Importar y modo, Boxes y palets, Respaldos, Celular). Las sub-pestañas de Barriles, Mapa e Imprimir quedan (sin emojis), como botones rectos debajo de la barra.
- **Capas:** los overlays de cámara, el de pedidos y `#modal` pasan de z-index 50/100/200 a **1060**. Hoy la barra de la plataforma (`#ciw-barra`, z 1050) se dibuja encima de la cabecera de la cámara.
- **Colores escritos en el JS de interfaz** (`#8a7f76` en ~2817, `#888` en ~3565 y ~3615) quedan como están: `test/barriles-colores-js.test.mjs` congela todos los literales del JS (escena 3D, textos de la cámara) y separarlos no vale el riesgo.
- **Contraste bajo ya existente:** textos `#ffd180`/`#8bc34a` sobre el modal blanco (~5258, ~5742…5800) son colores con significado copiados de la cámara; quedan iguales y se anotan como pendiente para el usuario.
- Se agrega soporte para `@page` de primer nivel y un selector propio en `scripts/css-reglas.mjs` (`reglasDePapel(html, selector)`): `@page rotulos` (A4 vertical) es papel y hoy el parser no lo veía.

---

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `scripts/css-reglas.mjs`, `scripts/css-reglas.d.mts` | Modificar | `reglasDePapel(html, selector?)` con `@page` de primer nivel |
| `scripts/colores-literales.mjs` (+ `.d.mts`) | Crear | `coloresDelJs(html)`: colores escritos en los `<script>` en línea, en orden (puro) |
| `scripts/extraer-colores-barriles.mjs` | Crear | Escribe `test/fixtures/barriles-colores-js.json` |
| `scripts/extraer-papel-barriles.mjs` | Crear | Escribe `test/fixtures/barriles-papel.json` |
| `scripts/muestreo-colores-barriles.js` | Crear | Fragmento de navegador: color calculado de ~120 muestras con significado |
| `test/fixtures/barriles-colores-js.json`, `test/fixtures/barriles-papel.json` | Crear | Fotos de `main` (JS) y de después del congelado (papel) |
| `test/barriles-colores-js.test.mjs` | Crear | Los colores del JS idénticos a la foto |
| `test/barriles-colores-congelados.test.ts` | Crear | `--sem-*` con su valor; reglas con significado sin tokens de interfaz |
| `test/barriles-papel-intacto.test.mjs` | Crear | Papel e impresión idénticos a la foto |
| `test/barriles-barra.test.ts` | Crear | Barra tipo Prensas, Más, sin emojis, sticky bajo `--ciw-h` |
| `test/barriles-estilo.test.ts` | Crear | `estilo.css` cargado, `:root` solo `--sem-*`, interfaz sin colores sueltos |
| `test/barriles-portada.test.ts` | Crear | Los 6 botones grandes con sus medidas de siempre y el filete |
| `test/barriles-sin-ventanas-nativas.test.ts` | Crear | Cuenta las nativas que quedan en `index.html` (baja a 0) y ninguna en `js/` salvo `dialogos.js` |
| `test/barriles-celular.test.ts` | Crear | `viewport-fit`, safe-area, `inputmode`, capas, 44 px |
| `vitest.config.ts`, `test/env.d.ts` | Modificar | Binding `BARRILES_JS` |
| `public/barriles/index.html` | Modificar | `--sem-*`, papel igual, `estilo.css`, barra, estilo, portada, 69 ventanitas, ✕ con Deshacer, celular |
| `public/barriles/js/barra-barriles.js` | Crear | Menú Más, pestaña activa, alto de la barra (clásico, funciones `barra*`) |
| `public/barriles/js/dialogos.js` | Crear | `dlgAvisar`, `dlgInformar`, `dlgConfirmar`, `dlgPedir` (única puerta a las nativas; clásico) |
| Scratchpad `$S` (fuera del repo) | Crear | `mock-barriles-estetica.mjs`, `imprimir.sh`, `comparar-pdf.py`, `muestreo-antes.json`, PDFs y medidas de antes |

`$S` en todo el plan es `/c/Users/Bmax/AppData/Local/Temp/claude/C--Users-Bmax-OneDrive---BODEGAS-ESMERALDA-SA-Escritorio-claude/2811961d-756c-4df5-bfd5-37c08ae49386/scratchpad/etapa3` (crearla con `mkdir -p "$S"`). Los números de línea con `~` son del `main` de hoy y se corren a medida que avanza el plan: buscar siempre por el texto o el nombre de la función.

---

### Task 0: Worktree y línea de base

**Files:** ninguno.

- [ ] **Step 1: Confirmar worktree, plan y paso 0**

```bash
cd /c/Users/Bmax/repos/catenainstitute-estetica-barriles
git branch --show-current          # feat/estetica-barriles
git log --oneline -3
ls docs/superpowers/plans/2026-10-19-estetica-etapa3-barriles.md
git merge-base --is-ancestor 9ff29b6 HEAD && echo "programador ya en main"
grep -c "PROG_GRUPOS" public/barriles/index.html    # >= 4
```

Expected: rama `feat/estetica-barriles`, el plan existe, `programador ya en main`. Si el worktree no existe: `cd /c/Users/Bmax/repos/catenainstitute && git worktree add ../catenainstitute-estetica-barriles -b feat/estetica-barriles main`. **No pushear.**

- [ ] **Step 2: Dependencias**

```bash
cd /c/Users/Bmax/repos/catenainstitute-estetica-barriles
npm ci
```

- [ ] **Step 3: Línea de base de tests, de a 12 archivos**

```bash
cd /c/Users/Bmax/repos/catenainstitute-estetica-barriles
ls test/*.test.* | split -l 12 - "$TMP/tanda-"
for t in "$TMP"/tanda-*; do npx vitest run $(cat "$t") || echo "FALLÓ $t"; done
rm -f "$TMP"/tanda-*
npx tsc --noEmit && echo "tsc OK"
```

Expected: ninguna línea `FALLÓ`, `tsc OK`. Anotar la suma de tests (la Etapa 2 cerró con 103 archivos / 1603). Este bloque es "correr la suite" en todo el plan.

---

### Task 1: Redes de seguridad (sin cambiar nada visible)

**Files:**
- Modify: `scripts/css-reglas.mjs`, `scripts/css-reglas.d.mts`
- Create: `scripts/colores-literales.mjs`, `scripts/colores-literales.d.mts`, `scripts/extraer-colores-barriles.mjs`, `scripts/muestreo-colores-barriles.js`
- Create: `test/fixtures/barriles-colores-js.json`, `test/barriles-colores-js.test.mjs`
- Create (scratchpad): `$S/mock-barriles-estetica.mjs`, `$S/imprimir.sh`, `$S/comparar-pdf.py`, `$S/muestreo-antes.json`, `$S/antes-*.pdf`, `$S/medidas-antes.json`

**Interfaces:**
- Produces `reglasDePapel(html: string, selector?: RegExp) → string[]` (sin segundo argumento, igual que hoy: usa `SELECTOR_PAPEL` de Lotes). Ahora también incluye cada `@page` de primer nivel entero.
- Produces `coloresDelJs(html: string) → string[]`.
- Produces el fragmento `scripts/muestreo-colores-barriles.js` → texto JSON `{muestra: valor}`.
- Produces el mock en `http://localhost:8840/barriles/?rol=editor|admin` con ganchos `?ir=`, `?imprimir=<mes>`, `?rot=<lote>`, `?imprimirMapa=1`.

- [ ] **Step 1: `reglasDePapel` con selector propio y `@page`**

En `scripts/css-reglas.mjs`, reemplazar la función `reglasDePapel` entera por:

```js
/**
 * Las reglas de papel: cada @media print entero, cada @page de primer nivel
 * (p. ej. "@page rotulos" de Barriles) y toda regla de pantalla (también dentro
 * de un @media de pantalla) cuyo selector toca una hoja. `selector` dice qué es
 * hoja en cada app (por defecto, las de Lotes). Ordenadas, para que mover una
 * regla de lugar no cuente como cambio.
 */
export function reglasDePapel(html, selector = SELECTOR_PAPEL) {
  const out = [];
  for (const r of reglasTope(cssDe(html))) {
    if (/^@media[^{]*\bprint\b/.test(r) || /^@page\b/.test(r)) { out.push(norm(r)); continue; }
    if (r.startsWith('@')) {
      const media = norm(selectorDe(r));
      for (const ir of reglasTope(cuerpoDe(r))) {
        if (selector.test(selectorDe(ir))) out.push(media + '>' + norm(ir));
      }
      continue;
    }
    if (selector.test(selectorDe(r))) out.push(norm(r));
  }
  return out.sort();
}
```

En `scripts/css-reglas.d.mts`: `export function reglasDePapel(html: string): string[];` → `export function reglasDePapel(html: string, selector?: RegExp): string[];`

Run: `npx vitest run test/lotes-papel-intacto.test.mjs`
Expected: PASS (Lotes no tiene `@page` de primer nivel: los suyos están dentro de `@media print`). Si falla, el `@page` de Lotes es de primer nivel: en ese caso hacer que la rama `@page` solo corra cuando se pasa `selector` explícito (`if (/^@page\b/.test(r) && arguments.length > 1)`) y volver a correr.

- [ ] **Step 2: `scripts/colores-literales.mjs` y su `.d.mts`**

```js
/**
 * Los colores escritos a mano en los <script> en línea de una página (no en
 * <style> ni en los style="" del HTML): en Barriles son la escena 3D
 * (0x1a1320…), colorLote (hsl), los textos del pie de la cámara (#b9f6ca,
 * #ffd180, #ff8a80) y los fondos de filas armadas en JS. En orden de
 * aparición. Puro (sin fs): lo usan el script que escribe la foto y el test.
 */
export function coloresDelJs(html) {
  const js = [...String(html).matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  return [...js.matchAll(/#[0-9a-fA-F]{3,8}\b|0x[0-9a-fA-F]{6}\b|rgba?\([^)]*\)|hsl\([^)]*\)/g)].map((m) => m[0]);
}
```

`scripts/colores-literales.d.mts`:

```ts
export function coloresDelJs(html: string): string[];
```

- [ ] **Step 3: Foto de los colores del JS (sobre `main` sin cambios)**

`scripts/extraer-colores-barriles.mjs`:

```js
// Foto de los colores escritos en el JS de Barriles (escena 3D, cámara,
// colorLote). Se corre UNA vez sobre main sin cambios (Etapa 3, Task 1).
// Uso: node scripts/extraer-colores-barriles.mjs > test/fixtures/barriles-colores-js.json
import { readFileSync } from 'node:fs';
import { coloresDelJs } from './colores-literales.mjs';

const html = readFileSync(new URL('../public/barriles/index.html', import.meta.url), 'utf8');
process.stdout.write(JSON.stringify(coloresDelJs(html), null, 1) + '\n');
```

Run:

```bash
mkdir -p test/fixtures
node scripts/extraer-colores-barriles.mjs > test/fixtures/barriles-colores-js.json
node -e "const a=require('./test/fixtures/barriles-colores-js.json');console.log(a.length, a.filter(x=>x.startsWith('0x')).length, a.includes('0x1a1320'), a.includes('#b9f6ca'))"
```

Expected: unas 80–120 entradas, ~12 con `0x`, `true true`.

- [ ] **Step 4: Test de los colores del JS**

`test/barriles-colores-js.test.mjs`:

```js
/**
 * Los colores escritos en el JS de Barriles tienen significado: la escena 3D
 * (fondo, vidrio de los barriles, aro amarillo del destino), colorLote (cada
 * lote su color en el mapa) y los textos del pie de la cámara (verde = leído,
 * naranja = ojo, rojo = no figura). La Etapa 3 de la estética no los toca. La
 * foto la escribió scripts/extraer-colores-barriles.mjs sobre main; si un
 * cambio la rompe, se arregla el cambio, no la foto.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { coloresDelJs } from '../scripts/colores-literales.mjs';
import foto from './fixtures/barriles-colores-js.json';

describe('colores del JS de Barriles', () => {
  it('son los de la foto, en el mismo orden', () => {
    expect(coloresDelJs(env.INDEX_HTML_BARRILES)).toEqual(foto);
  });

  it('colorLote sigue siendo la misma función', () => {
    expect(env.INDEX_HTML_BARRILES).toContain(
      "const hue = h % 360, sat = 55 + (h >> 8) % 25, lig = 72 + (h >> 16) % 12;\n  return `hsl(${hue},${sat}%,${lig}%)`;");
  });
});
```

Run: `npx vitest run test/barriles-colores-js.test.mjs`
Expected: PASS. Probar que caza: cambiar a mano `0x1a1320` por `0x1a1321` en `public/barriles/index.html`, ver FAIL, volver atrás, ver PASS. (Si el segundo `it` falla por fin de línea `\r\n`, el archivo tiene CRLF: usar `.replace(/\r\n/g, '\n')` sobre el HTML en ese `it`.)

- [ ] **Step 5: `scripts/muestreo-colores-barriles.js`**

```js
/* Muestreo de los colores con significado de Barriles (estética unificada, Etapa 3).
 *
 * NO es un script de Node: se pega en la consola del navegador (o se corre con
 * javascript_tool) con /barriles/?rol=admin abierto y los datos ya cargados.
 * Devuelve un texto JSON {muestra: valor}. Antes y después de cada cambio de
 * estilo tiene que dar IDÉNTICO.
 *
 * Dos clases de muestra: fragmentos sueltos que se arman, se leen y se sacan
 * (no dependen de los datos), y elementos que ya están en la página (por id),
 * a los que se les pone un momento la clase a medir y se les devuelve la suya.
 * Los colores escritos en el JS (3D, cámara) los cuida test/barriles-colores-js.
 * Si se agrega un color con significado nuevo, se agrega acá. */
await (async () => {
  const out = {};
  const leer = (nombre, el, props, pseudo) => {
    const cs = getComputedStyle(el, pseudo || null);
    out[nombre] = props.map((p) => cs.getPropertyValue(p)).join(' | ');
  };
  const frag = (nombre, cont, html, sel, props, pseudo) => {
    const caja = document.createElement('div');
    caja.setAttribute('data-muestreo', '');
    caja.innerHTML = html;
    (document.querySelector(cont) || document.body).appendChild(caja);
    leer(nombre, caja.querySelector(sel) || caja.firstElementChild, props, pseudo);
    caja.remove();
  };
  // clases === null: se lee tal cual; si no, se le pone ESA clase (className entero) y se devuelve la suya.
  const enPagina = (nombre, sel, clases, props, pseudo) => {
    const el = document.querySelector(sel);
    if (!el) { out[nombre] = 'NO ESTÁ'; return; }
    const antes = el.className;
    if (clases !== null) el.className = clases;
    leer(nombre, el, props, pseudo);
    el.className = antes;
  };
  const BG = ['background-color'], C = ['color'], BGC = ['background-color', 'color'];
  const BGBD = ['background-color', 'border-top-color'], MARCO = ['border-top-color', 'box-shadow'];

  // ---- Mapa 2D ----
  const celda = (k) => `<div class="grilla"><div class="celda ${k}"><span class="num">1</span><span class="lote">2</span></div></div>`;
  frag('mapa.grilla', 'body', celda(''), '.grilla', BG);
  frag('mapa.celda', 'body', celda(''), '.celda', ['background-color', 'color', 'border-top-color']);
  frag('mapa.libre', 'body', celda('libre'), '.celda', ['background-image', 'color']);
  frag('mapa.hueco', 'body', celda('hueco'), '.celda', ['background-color', 'color', 'font-style']);
  frag('mapa.resaltada', 'body', celda('resaltada'), '.celda', MARCO);
  frag('mapa.atenuada', 'body', celda('atenuada'), '.celda', ['opacity']);
  frag('mapa.cursor', 'body', celda('cursor-scan'), '.celda', ['border-top-color', 'border-top-style']);
  frag('mapa.destino', 'body', celda('destino-libre'), '.celda', MARCO);
  for (const l of ['26320', '25006', '24180', '25832-T50', '']) out['colorLote.' + (l || 'vacio')] = colorLote(l);
  document.querySelectorAll('#panel-mapa .ayuda .muestra-celda').forEach((el, i) => leer('ayuda.muestra' + i, el, ['background-image', 'background-color', 'color']));

  // ---- Vista 3D ----
  enPagina('3d.fondo', '#cont3d', null, ['background-image']);
  enPagina('3d.vacio', '#vacio3d', null, C);
  enPagina('3d.tooltip', '#tooltip3d', null, BGC);
  frag('3d.tooltip.b', '#tooltip3d', '<b>1</b>', 'b', C);

  // ---- Escáner ----
  for (const k of ['ok', 'err', 'aviso']) {
    frag('fb.' + k, 'body', `<div class="fb-libre ${k}">x</div>`, 'div', BGBD);
    enPagina('escFeedback.' + k, '#escFeedback', k, BGBD);
  }
  frag('inp.error', 'body', '<input class="inp-libre error">', 'input', BGBD);
  enPagina('escResumen', '#escResumen', '', BGBD);
  enPagina('escResumen.revisar', '#escResumen', 'revisar', BGBD);
  {
    const r = document.querySelector('#escResumen'), v = r.className;
    r.className = ''; frag('escResumen.num', '#escResumen', '<div class="esc-res-num">1</div>', 'div', C);
    r.className = 'revisar'; frag('escResumen.revisar.num', '#escResumen', '<div class="esc-res-num">1</div>', 'div', C);
    r.className = v;
  }
  frag('escResumen.aviso', 'body', '<ul class="esc-res-avisos"><li>x</li></ul>', 'li', ['background-color', 'border-left-color']);
  frag('esc.detalle', 'body', '<div class="esc-res-detalle">x</div>', 'div', C);
  frag('esc.vencida', 'body', '<button class="btn esc-vencida">x</button>', 'button', ['opacity', 'filter']);
  frag('esc.contador', 'body', '<span class="esc-contador">1</span>', 'span', BGC);
  enPagina('escInstr', '#escInstrucciones', null, BGBD);
  frag('escInstr.h2', '#escInstrucciones', '<h2>x</h2>', 'h2', C);
  frag('escInstr.b', '#escInstrucciones', '<b>x</b>', 'b', C);

  // ---- Cámaras ----
  for (const id of ['escMarcoCam', 'barMarcoCam', 'paletMarcoCam', 'marcoCamara']) enPagina('cam.' + id, '#' + id, '', MARCO);
  for (const id of ['escMarcoCam', 'barMarcoCam', 'paletMarcoCam']) enPagina('cam.' + id + '.ok', '#' + id, 'ok', MARCO);
  enPagina('cam.barMarcoCam.lote', '#barMarcoCam', 'lote', ['border-top-color']);
  enPagina('cam.pieCamara.esperando', '#pieCamara', 'esperando', ['box-shadow']);
  for (const id of ['overlayCamara', 'overlayCamaraEsc', 'overlayCamaraBar', 'overlayCamaraPalet']) enPagina('cam.' + id, '#' + id, null, BG);
  for (const id of ['escPieCam', 'barPieCam', 'paletPieCam', 'pieCamara']) enPagina('cam.' + id, '#' + id, null, BGC);
  for (const id of ['cabeceraCamara', 'escCabeceraCam', 'barCabeceraCam', 'paletCabeceraCam']) enPagina('cam.' + id, '#' + id, null, ['background-image', 'color']);
  for (const id of ['barBtnCapturar', 'barBtnTipear', 'barBtnCancelarPar', 'barBtnCerrarCam', 'barBtnConfirmarLote', 'barBtnVaciaCam', 'barBtnTipearTanque',
    'btnCerrarCamara', 'btnSaltarCamara', 'btnConfirmarCam', 'btnReintentarCam', 'btnTipearCam', 'escBtnTipearCam', 'escBtnCerrarCam', 'paletBtnCerrarCam']) {
    enPagina('btn.' + id, '#' + id, null, BGC);
  }
  frag('cam.tipear.ok', '#escPieCam', '<div class="cam-tipear abierto"><button class="ok">1</button><button class="cancel">2</button></div>', '.ok', BGC);
  frag('cam.tipear.cancel', '#escPieCam', '<div class="cam-tipear abierto"><button class="ok">1</button><button class="cancel">2</button></div>', '.cancel', BGC);
  frag('cam.candidato', '#barCandidatos', '<button>1</button>', 'button', ['background-color', 'color', 'border-top-color']);
  frag('cam.candidato.elegido', '#barCandidatos', '<button class="elegido">1</button>', 'button', BGC);
  frag('cam.paso', '#barPieCam', '<span class="bar-paso">1</span>', 'span', BGC);
  frag('cam.paso.f2', '#barPieCam', '<span class="bar-paso f2">1</span>', 'span', BGC);
  frag('cam.rotulo', '#escCabeceraCam', '<button class="cam-btn-rotulo">x</button>', 'button', BGC);
  frag('cam.lista', '#escListaCam', '<span>1</span>', 'span', BGC);
  frag('cam.nBarril', '#escResCam', '<span class="n-barril">1</span>', 'span', ['font-size', 'font-weight']);

  // ---- Modo por lote ----
  {
    const tenia = document.body.classList.contains('modo-lote');
    document.body.classList.add('modo-lote');
    enPagina('lote.toggle', '#toggleModoLote', null, ['background-color', 'border-top-color', 'color']);
    enPagina('lote.chip', '#chipModoLote', null, BGC);
    if (!tenia) document.body.classList.remove('modo-lote');
  }

  // ---- Inventario, altas, pedidos, historial ----
  for (const k of ['lleno', 'vacio', 'mermo', 'tanque', 'barrica', 'revisar', 'revisado']) frag('pill.' + k, 'body', `<span class="pildora p-${k}">x</span>`, 'span', BGC);
  frag('inv.filaRevisar', 'body', '<table><tbody><tr class="fila-revisar"><td>x</td></tr></tbody></table>', 'td', BG);
  frag('inv.motivoRevisar', 'body', '<div class="motivo-revisar">x</div>', 'div', C);
  frag('inv.motivoEdicion', 'body', '<div class="motivo-edicion">x</div>', 'div', C);
  for (const k of ['tanque', 'lote']) frag('ped.' + k, 'body', `<span class="ped-tipo ${k}">x</span>`, 'span', BGC);
  for (const k of ['on', 'off']) frag('marca.' + k, 'body', `<button class="btn marca marca-${k}">x</button>`, 'button', ['background-color', 'color', 'border-top-color']);
  frag('alta.malo', 'body', '<div id="altaPrevio" class="malo">x</div>', 'div', BGC);
  frag('baja.malo', 'body', '<div id="bajaPrevio" class="malo">x</div>', 'div', BGC);
  frag('btn.peligro', 'body', '<button class="btn peligro">x</button>', 'button', BG);
  frag('ped.aviso', 'body', '<div class="ped-aviso">x</div>', 'div', C);
  enPagina('btn.escBtnGuardar', '#escBtnGuardar', null, BGC);
  enPagina('btn.barBtnAsociar', '#barBtnAsociar', null, BGC);
  enPagina('inv.barResumen', '#barResumen', null, BGBD);

  // ---- Registro (también es papel) ----
  const reg = (k) => `<div class="reg-tarjeta ${k}"><div class="reg-cabeza"><span class="reg-lote">1</span><span class="reg-tipo">x</span></div>` +
    '<div class="reg-datos">x</div><div class="reg-barriles"><button class="reg-barril">1</button><button class="reg-barril reg-hit">2</button></div></div>';
  for (const k of ['', 'reg-llenado', 'reg-vaciado', 'reg-mixto']) {
    frag('reg.tarjeta.' + (k || 'base'), 'body', reg(k), '.reg-tarjeta', ['border-top-color', 'background-color']);
    frag('reg.tipo.' + (k || 'base'), 'body', reg(k), '.reg-tipo', BGC);
  }
  frag('reg.conBarril', 'body', reg('reg-con-barril'), '.reg-tarjeta', ['box-shadow']);
  frag('reg.lote', 'body', reg(''), '.reg-lote', C);
  frag('reg.datos', 'body', reg(''), '.reg-datos', C);
  frag('reg.barril', 'body', reg(''), '.reg-barril', BGBD);
  frag('reg.hit', 'body', reg(''), '.reg-hit', BGBD);
  for (const k of ['', 'LLENO', 'MERMO']) frag('reg.estado.' + (k || 'VACIO'), 'body', `<span class="reg-estado ${k}">x</span>`, 'span', BGC);

  // ---- Rótulos (cartel del color de etiqueta) ----
  for (const k of ['verde', 'blanca', 'nose', 'buscando']) frag('rot.' + k, 'body', `<div class="rot-color rot-${k}"><b>x</b></div>`, 'div', ['background-color', 'color', 'border-top-color']);

  // ---- Cifras y cuentas ----
  for (const k of ['alerta', 'ok']) {
    const h = `<button class="tab-cifra tab-${k}"><span class="tab-valor">1</span></button>`;
    frag('tab.' + k, 'body', h, 'button', ['border-left-color']);
    frag('tab.' + k + '.valor', 'body', h, '.tab-valor', C);
  }
  frag('cuenta.ini', 'body', '<span class="ini-cuenta">2</span>', 'span', BGC);
  frag('cuenta.prog', 'body', '<span class="prog-cuenta">2</span>', 'span', BGC);

  // ---- Velo sin conexión y solo lectura ----
  enPagina('velo', '#veloSinConexion', null, BG);
  const velo = '<div class="caja"><div class="titulo">x</div><p class="pend">x</p><a class="login">x</a></div>';
  frag('velo.caja', '#veloSinConexion', velo, '.caja', ['border-top-color', 'background-color']);
  frag('velo.titulo', '#veloSinConexion', velo, '.titulo', C);
  frag('velo.pend', '#veloSinConexion', velo, '.pend', BG);
  frag('velo.login', '#veloSinConexion', velo, '.login', BGC);
  enPagina('soloLectura', '#avisoSoloLectura', null, ['background-color', 'color', 'border-bottom-color']);

  return JSON.stringify(out, null, 1);
})();
```

- [ ] **Step 6: Server de prueba sin login**

`$S/mock-barriles-estetica.mjs`:

```js
// Server de prueba de Barriles SIN login (Etapa 3 de la estética). Guarda en memoria.
// Uso: node mock-barriles-estetica.mjs <carpeta public> <puerto>
//   http://localhost:<puerto>/barriles/?rol=editor   operario
//   http://localhost:<puerto>/barriles/?rol=admin    programador
// Ganchos (los usan las capturas y imprimir.sh):
//   ?ir=registro&mes=2026-01&q=2180036   abre esa pantalla ya buscada
//   ?imprimir=2026-01                     el Registro de ese mes, como al tocar Imprimir
//   ?rot=26124                            los rótulos de ese lote, listos para imprimir
//   ?imprimirMapa=1                       la hoja del mapa (#areaImpresion) armada
// Inyecta en /barriles/ lo mismo que armarInyeccion() (src/index.ts).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PUB = path.resolve(process.argv[2]);
const PUERTO = Number(process.argv[3] || 8840);
const REPO = 'C:/Users/Bmax/repos/catenainstitute';
const RESPALDO = REPO + '/respaldo-nube-barriles-2026-10-02-pre-reconciliacion.json';
const LOTES = JSON.parse(JSON.parse(fs.readFileSync(REPO + '/respaldo-nube-lotes-2026-10-02-v75-con-2025.json', 'utf8'))[0].results[0].json).lotes;
const doc = JSON.parse(JSON.parse(fs.readFileSync(RESPALDO, 'utf8'))[0].results[0].json);
console.log('respaldo v' + doc.version, doc.estado.escaneos.length, 'órdenes');
// Una orden recién cargada (hace 2 minutos) para ver Editar/Borrar en la tarjeta.
const hace2 = Date.now() - 120000;
doc.estado.escaneos.push({ id: 'e' + hace2, fecha: new Date().toISOString().slice(0, 10), ot: '930', lote: '26320', tipo: 'llenado',
  codigos: ['2180036', '2181088', '2150485', '2180383', '1250341', '1260018'] });

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.wasm': 'application/wasm', '.traineddata': 'application/octet-stream', '.gz': 'application/gzip' };

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function inyeccion(ctx) {
  return `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` +
    `<script>window.CIW=${JSON.stringify(ctx)};window.CIW_USUARIO=window.CIW;</script>\n` +
    `<script src="/shared/pendientes.js"></script>\n` +
    `<script src="/shared/dialogo-modelo.js"></script>\n<script src="/shared/dialogo.js"></script>\n` +
    `<script src="/shared/fusion.js"></script>\n<script defer src="/shared/barra.js"></script>\n</head>`;
}
const gancho = (js) => `<script>setTimeout(async () => { ${js} }, 2500);</script></body>`;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  const rol = url.searchParams.get('rol') || 'editor';
  const ctx = { email: 'prueba@catenawines.com', nombre: 'Prueba', rol, modulo: 'barriles', modulos: { barriles: rol } };
  if (p === '/api/auth/me') return json(res, 200, { email: ctx.email, nombre: ctx.nombre, es_admin: rol === 'admin', debe_cambiar: false });
  if (p === '/api/yo') return json(res, 200, { ...ctx, es_admin: rol === 'admin' });
  if (p === '/barriles/api/estado' && req.method === 'GET') return json(res, 200, doc);
  if (p === '/barriles/api/version') return json(res, 200, { version: doc.version });
  if (p === '/barriles/api/info') return json(res, 200, { modo: 'web', urls: [] });
  if (p === '/barriles/api/lote-rotulo') {
    const lote = (url.searchParams.get('lote') || '').trim();
    if (!lote) return json(res, 400, { error: 'falta_lote' });
    const l = LOTES.find((x) => String(x.lote) === lote);
    if (!l) return json(res, 404, { error: 'no_existe' });
    const m = typeof l.organico_convencional === 'string' ? l.organico_convencional.trim().toLowerCase() : '';
    return json(res, 200, { lote, titulo: l.id_texto || '', organico: m === 'organico' || m === 'orgánico' });
  }
  if (p === '/barriles/api/estado' && req.method === 'POST') {
    let cuerpo = '';
    req.on('data', (c) => (cuerpo += c));
    req.on('end', () => {
      const pedido = JSON.parse(cuerpo);
      if (pedido.version !== doc.version) return json(res, 409, doc);
      doc.estado = pedido.estado; doc.version++;
      json(res, 200, { version: doc.version });
    });
    return;
  }
  if (p === '/barriles') { res.writeHead(302, { Location: '/barriles/' + url.search }); return res.end(); }
  let archivo = path.join(PUB, p);
  if (p.endsWith('/')) archivo = path.join(archivo, 'index.html');
  if (!archivo.startsWith(PUB) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); return res.end('no'); }
  let cuerpo = fs.readFileSync(archivo);
  if (p === '/barriles/') {
    cuerpo = cuerpo.toString('utf8').replace('</head>', inyeccion(ctx));
    const ir = url.searchParams.get('ir');
    if (ir) cuerpo = cuerpo.replace('</body>', gancho(`opSeccion(${JSON.stringify(ir)});
      const m = ${JSON.stringify(url.searchParams.get('mes') || '')}; if (m) regElegirMes(m);
      const q = ${JSON.stringify(url.searchParams.get('q') || '')}; if (q) { $('regBuscar').value = q; regDibujar(); }
      document.activeElement && document.activeElement.blur();`));
    const rot = url.searchParams.get('rot');
    if (rot) cuerpo = cuerpo.replace('</body>', gancho(`opSeccion('rotulos'); $('rotLote').value = ${JSON.stringify(rot)};
      rotBuscar(); document.body.classList.add('imprimiendo-rotulos');`));
    const mes = url.searchParams.get('imprimir');
    if (mes) cuerpo = cuerpo.replace('</body>', gancho(`opSeccion('registro'); regElegirMes(${JSON.stringify(mes)});
      const pr = window.print; window.print = () => {}; regImprimir(); window.print = pr;`));
    if (url.searchParams.get('imprimirMapa')) cuerpo = cuerpo.replace('</body>', gancho(`opSeccion('buscar'); construirImpresion();`));
  }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(cuerpo);
}).listen(PUERTO, () => console.log('mock de Barriles en http://localhost:' + PUERTO + '/barriles/ sirviendo ' + PUB));
```

Levantarlo con la tool de Bash **en segundo plano**: `node "$S/mock-barriles-estetica.mjs" /c/Users/Bmax/repos/catenainstitute-estetica-barriles/public 8840`, y abrir `http://localhost:8840/barriles/?rol=admin` en el navegador del panel (`preview_start` con `url`). El mock guarda en memoria: si algo se guarda durante una prueba, reiniciarlo antes de un muestreo o de un PDF.

- [ ] **Step 7: PDFs de las tres hojas**

`$S/imprimir.sh`:

```bash
#!/usr/bin/env bash
# Imprime a PDF las tres hojas de Barriles desde el mock (operario).
# Uso: bash imprimir.sh <prefijo>   →   <prefijo>-registro.pdf, <prefijo>-rotulos.pdf, <prefijo>-mapa.pdf
set -e
S="$(cd "$(dirname "$0")" && pwd)"
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
for par in "registro|rol=editor&imprimir=2026-01" "rotulos|rol=editor&rot=26124" "mapa|rol=editor&imprimirMapa=1"; do
  n="${par%%|*}"; q="${par#*|}"
  "$CH" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=10000 \
    --print-to-pdf="$(cygpath -w "$S/$1-$n.pdf")" "http://localhost:8840/barriles/?$q" 2>/dev/null
  echo "$1-$n.pdf"
done
```

`$S/comparar-pdf.py`:

```python
"""Compara dos PDFs página por página (imagen a 60 dpi). Uso: python comparar-pdf.py antes.pdf despues.pdf"""
import sys
import fitz

a, b = fitz.open(sys.argv[1]), fitz.open(sys.argv[2])
print('páginas', a.page_count, b.page_count)
distintas = []
for i in range(min(a.page_count, b.page_count)):
    pa, pb = a[i].get_pixmap(dpi=60), b[i].get_pixmap(dpi=60)
    if (pa.width, pa.height) != (pb.width, pb.height):
        distintas.append(f'{i + 1} (tamaño)')
    elif pa.samples != pb.samples:
        n = sum(1 for x, y in zip(pa.samples, pb.samples) if x != y)
        distintas.append(f'{i + 1} ({n} bytes)')
if a.page_count == b.page_count and not distintas:
    print('IGUALES')
else:
    print('DISTINTAS:', ', '.join(distintas) or 'cantidad de páginas')
```

Run (mock levantado):

```bash
bash "$S/imprimir.sh" antes
python "$S/comparar-pdf.py" "$S/antes-registro.pdf" "$S/antes-registro.pdf"
python -c "import fitz,sys;[print(f, fitz.open(sys.argv[1]+'/antes-'+f+'.pdf').page_count) for f in ('registro','rotulos','mapa')]" "$S"
```

Expected: tres PDFs con páginas (> 0 cada uno), y `IGUALES` al compararlo consigo mismo. Hacer una segunda tanda `bash "$S/imprimir.sh" antes2` y comparar `antes-*` con `antes2-*`: tiene que dar `IGUALES` (si la hoja del mapa difiere solo en la página 1, es la fecha del encabezado: anotar y comparar siempre el mismo día). Si no da `IGUALES` entre dos corridas iguales, subir `--virtual-time-budget` a 15000.

- [ ] **Step 8: Muestreo y medidas de antes**

Con `http://localhost:8840/barriles/?rol=admin` cargado (esperar que `#estadoDatos` diga algo distinto de "Sin inventario cargado") a 1280 px: pegar `scripts/muestreo-colores-barriles.js` en `javascript_tool` y guardar el resultado en `$S/muestreo-antes.json`. Verificar: ~130 claves y ninguna con `NO ESTÁ` (si alguna dice `NO ESTÁ`, el id no existe en el HTML de hoy: sacar esa línea del script y volver a correr).

Medidas de antes, para el informe final (guardar en `$S/medidas-antes.json`):

```js
// a 375 px (resize_window preset mobile), operario y programador
JSON.stringify({ innerWidth, scrollWidth: document.documentElement.scrollWidth,
  portada: [...document.querySelectorAll('#panel-inicio .ini-boton')].map(b => Math.round(b.getBoundingClientRect().height)),
  quitar: (document.querySelector('#escTabla button') || {getBoundingClientRect: () => ({})}).getBoundingClientRect().height })
```

- [ ] **Step 9: Suite y commit**

Correr la suite (Task 0, Step 3). Expected: verde, +2 tests.

```bash
git add scripts/css-reglas.mjs scripts/css-reglas.d.mts scripts/colores-literales.mjs scripts/colores-literales.d.mts \
  scripts/extraer-colores-barriles.mjs scripts/muestreo-colores-barriles.js \
  test/fixtures/barriles-colores-js.json test/barriles-colores-js.test.mjs
git commit -m "test(barriles): foto de los colores del JS, muestreo de colores con significado y @page en el papel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Congelar los colores con significado (`--sem-*`) y la foto del papel

Este commit **no cambia nada visible ni impreso**: solo cambia de qué token sale cada color con significado (mismo valor) y agrega el bloque que fija el papel con sus valores de hoy.

**Files:**
- Create: `test/barriles-colores-congelados.test.ts`, `scripts/extraer-papel-barriles.mjs`, `test/fixtures/barriles-papel.json`, `test/barriles-papel-intacto.test.mjs`
- Modify: `public/barriles/index.html` (`:root`, reglas con significado y de papel, 9 `var(--…)` fuera de `<style>`, bloque "Papel igual que antes")

**Interfaces:**
- Produces en el `:root` de Barriles: `--sem-ok:#2e7d32; --sem-error:#c62828; --sem-warn:#e65100; --sem-vino:#6b1f3a; --sem-vino-osc:#4a1428; --sem-gris:#e8e2da; --sem-crema:#faf6f0;`
- Produces (en el test, exportable para las Tasks 4 y 9): `CON_SIGNIFICADO` y `PAPEL_BARRILES` (regex de selectores).

- [ ] **Step 1: Test que falla**

`test/barriles-colores-congelados.test.ts`:

```ts
/**
 * Los colores con significado de Barriles son los que el equipo lee de memoria
 * en la nave: el amarillo del destino y del modo por lote, el verde/rojo del
 * escáner, los marcos de la cámara, las píldoras LLENO/MERMO, las tarjetas del
 * Registro (que además salen impresas). La Etapa 3 de la estética cambia los
 * tokens de interfaz por los de Prensas: estos quedan con el valor de antes.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { reglasPlanas, cssDe } from '../scripts/css-reglas.mjs';

const html = env.INDEX_HTML_BARRILES;

function raiz(h: string): Record<string, string> {
  const m = cssDe(h).match(/:root\s*\{([\s\S]*?)\}/);
  const out: Record<string, string> = {};
  for (const decl of (m ? m[1] : '').split(';')) {
    const i = decl.indexOf(':');
    if (i > 0 && decl.slice(0, i).trim().startsWith('--')) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim().toLowerCase();
  }
  return out;
}

const CONGELADOS: Record<string, string> = {
  '--sem-ok': '#2e7d32', '--sem-error': '#c62828', '--sem-warn': '#e65100',
  '--sem-vino': '#6b1f3a', '--sem-vino-osc': '#4a1428', '--sem-gris': '#e8e2da', '--sem-crema': '#faf6f0',
};

/* Selectores cuyo color ES el dato. */
export const CON_SIGNIFICADO = new RegExp([
  String.raw`\.celda\b`, String.raw`\.grilla\b`, String.raw`\.leyenda \.muestra`, '#cont3d', '#vacio3d', '#tooltip3d',
  String.raw`\.fb-libre`, '#escFeedback', String.raw`\.inp-libre\.error`, '#escResumen', String.raw`\.esc-res-`, 'esc-vencida',
  'esc-contador', '#escInstrucciones',
  // toda la cámara
  String.raw`Cam\b`, String.raw`Cam[A-Z.\s]`, 'Camara', String.raw`\.cam-`, 'bar-paso', '#barCandidatos', '#barLoteManual',
  'n-barril', '#barBtn',
  // modo por lote
  'modo-lote', '#chipModoLote',
  // inventario, altas, pedidos, historial
  String.raw`\.p-(lleno|vacio|mermo|tanque|barrica|revisar|revisado)\b`, 'fila-revisar', 'motivo-(revisar|edicion)',
  String.raw`\.ped-tipo`, 'marca-(on|off)', String.raw`Previo\.malo`, String.raw`\.btn\.peligro`, String.raw`\.ped-aviso`,
  // rótulos, cifras, cuentas, velo, solo lectura, cartel de lado
  String.raw`\.rot-(verde|blanca|nose|buscando)`, String.raw`\.tab-(alerta|ok)\b`, '(ini|prog)-cuenta',
  '#veloSinConexion', '#avisoSoloLectura', '#cartelLado',
].join('|'));

/* Lo que se imprime: rótulos A4, hoja del mapa, Registro (sus tarjetas se
 * imprimen tal cual la pantalla; el buscador, los meses y las acciones no). */
export const PAPEL_BARRILES =
  /ot-rot|rot-hoja|-print\b|imprimiendo-|#areaImpresion|solo-impresion|\.reg-(?!barra\b|buscador\b|como\b|meses\b|mes\b|acciones\b)/;

const TOKEN_DE_INTERFAZ = /var\(--(vino|vino-osc|gris|crema|ok|error|warn|bg|panel|panel2|line|rule|txt|muted|accent|accent2|nook|info)\)/;

describe('colores con significado de Barriles', () => {
  it('los tokens congelados tienen su valor de siempre', () => {
    const r = raiz(html);
    for (const [k, v] of Object.entries(CONGELADOS)) expect(r[k], k).toBe(v);
  });

  it('ninguna regla con significado ni de papel usa un token de interfaz', () => {
    const malas = reglasPlanas(html)
      .filter((r) => (CON_SIGNIFICADO.test(r.selector) || PAPEL_BARRILES.test(r.selector)) && TOKEN_DE_INTERFAZ.test(r.cuerpo))
      .map((r) => r.selector + '{' + r.cuerpo + '}');
    expect(malas).toEqual([]);
  });

  it('fuera de <style> (HTML y JS) los verdes, rojos y naranjas salen de --sem-*', () => {
    const sinEstilo = html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
    expect(sinEstilo.match(/var\(--(ok|error|warn)\)/g) || []).toEqual([]);
  });

  it('el papel fija la letra y el fondo de antes', () => {
    expect(cssDe(html).replace(/\s+/g, ' ')).toContain(
      "@media print { body { font-family: 'Segoe UI', Arial, sans-serif; background: var(--sem-crema); color: #2b2b2b; }");
  });
});
```

Run: `npx vitest run test/barriles-colores-congelados.test.ts`
Expected: FAIL en los cuatro.

- [ ] **Step 2: `--sem-*` en el `:root`**

En `public/barriles/index.html`, reemplazar el `:root` (líneas ~51-54) por:

```css
  :root {
    --vino: #6b1f3a; --vino-osc: #4a1428; --crema: #faf6f0;
    --gris: #e8e2da; --ok: #2e7d32; --error: #c62828; --warn: #e65100;
    /* --- Colores con significado (congelados el 2026-10-19) ---------------
     * Mapa, escáner, cámara, modo por lote, píldoras, Registro (que también se
     * imprime): el equipo los lee de memoria y NO cambian con la estética.
     * Tienen el valor que tenían --ok/--error/--warn/--vino/--vino-osc/--gris/
     * --crema antes de que Barriles tomara los tokens de Prensas. Los vigila
     * test/barriles-colores-congelados.test.ts; el muestreo de
     * scripts/muestreo-colores-barriles.js tiene que dar igual antes y después. */
    --sem-ok: #2e7d32; --sem-error: #c62828; --sem-warn: #e65100;
    --sem-vino: #6b1f3a; --sem-vino-osc: #4a1428; --sem-gris: #e8e2da; --sem-crema: #faf6f0;
  }
```

- [ ] **Step 3: Cada regla con significado o de papel a su `--sem-*`**

En cada regla del `<style>` cuyo selector cumple `CON_SIGNIFICADO` o `PAPEL_BARRILES`, reemplazar dentro del cuerpo: `var(--ok)`→`var(--sem-ok)`, `var(--error)`→`var(--sem-error)`, `var(--warn)`→`var(--sem-warn)`, `var(--vino)`→`var(--sem-vino)`, `var(--vino-osc)`→`var(--sem-vino-osc)`, `var(--gris)`→`var(--sem-gris)`. Nada más cambia en esas reglas. Las que hay hoy (para ir tachando):

| Línea ~ | Regla |
|---|---|
| 64, 65 | `body.modo-lote #toggleModoLote`, `#chipModoLote` (`--vino-osc`) |
| 85 | `button.btn.peligro` (`--error`) |
| 101, 103 | `.p-lleno` (`--ok`), `.p-mermo` (`--warn`) |
| 139, 140, 143 | `#veloSinConexion .caja`, `.titulo` (`--error`), `.login` (`--vino`) |
| 147 | `#avisoSoloLectura` (`--warn`) |
| 163-166 | `.fb-libre.ok/.err/.aviso`, `.inp-libre.error` |
| 169 | `.celda.tocable-libre:hover` (`--vino`) |
| 177 | `.esc-contador` (`--vino`) |
| 180-190 | `#escFeedback.*`, `#escResumen*`, `.esc-res-num`, `.esc-res-avisos li` |
| 206-209 | `#escInstrucciones`, `h2`, `b` |
| 218, 238, 256 | `#escPieCam button`, `#barBtnConfirmarLote`, `#paletPieCam button` (`--ok`) |
| 269 | `.celda.cursor-scan` (`--vino`) |
| 299, 302, 304 | `#cartelLado .caja-cartel`, `h2` (`--warn`), `p b` (`--vino`) |
| 411, 416 | `.cam-btn-rotulo` (`--vino`), `.cam-tipear .ok` (`--ok`) |
| 428 | `.ped-aviso` (`--ok`) |
| 470, 483 | `.ini-cuenta:not(:empty)`, `.prog-cuenta:not(:empty)` (`--warn`) |
| 507-510 | `.tab-cifra.tab-alerta*`, `.tab-cifra.tab-ok*` |
| 524-563 | todas las `.reg-*` de papel (`.reg-grupo h3`, `.reg-tarjeta*`, `.reg-mixto .reg-tipo`, `.reg-barril`, `.reg-barril:hover`, `.reg-vacio`, `.reg-ficha`, `.reg-ficha-num`, `.reg-historia`, `.reg-resumen`, `.reg-link`) |

Fuera de `<style>` (HTML y JS), los nueve que hay:
- `#barResumen` (~829): `border:2px solid var(--ok)` → `var(--sem-ok)`.
- `#barBtnAsociar` (~844) y `#escBtnGuardar` (~1010): `style="background:var(--ok);"` → `style="background:var(--sem-ok);"`.
- JS ~2911 `var(--error)`, ~2960 `var(--ok)`, ~4141 `var(--warn)`, ~4392 `var(--ok)`, ~5207 (`escRender`, "no figura en inventario") `var(--warn)`, ~6231 `var(--warn)` → sus `--sem-*`.

- [ ] **Step 4: Bloque "Papel igual que antes"**

Justo **antes** del comentario `/* ===== Impresión: versión armada en #areaImpresion…` (línea ~620), agregar:

```css
  /* ---- Papel igual que antes de la Etapa 3 de la estética (2026-10-19) ----
   * La hoja del mapa (#areaImpresion) y el Registro impreso heredan la letra,
   * el fondo crema (se imprime: print-color-adjust exact) y el título en
   * negrita de la pantalla de antes. La pantalla cambia de estilo; el papel no.
   * :where() deja la especificidad en 0 para que el @media print de abajo siga
   * ganando donde se pisan. Las reglas de pantalla nuevas van ANTES de este
   * bloque. Lo vigila test/barriles-papel-intacto.test.mjs. */
  @media print {
    body { font-family: 'Segoe UI', Arial, sans-serif; background: var(--sem-crema); color: #2b2b2b; }
    :where(#panel-registro) h2 { font-family: 'Segoe UI', Arial, sans-serif; font-weight: bold; }
  }
```

- [ ] **Step 5: Tests de colores**

Run: `npx vitest run test/barriles-colores-congelados.test.ts test/barriles-colores-js.test.mjs`
Expected: PASS. Si "ninguna regla con significado…" lista alguna, pasarla a su `--sem-*` y volver a correr.

- [ ] **Step 6: Muestreo y PDFs idénticos**

Recargar `http://localhost:8840/barriles/?rol=admin` (el mock sirve el worktree; reiniciarlo si se guardó algo), correr el muestreo y comparar con `$S/muestreo-antes.json`:

```js
const antes = /* pegar el JSON de muestreo-antes.json */;
const ahora = JSON.parse(/* resultado del muestreo */);
Object.keys({...antes, ...ahora}).filter(k => antes[k] !== ahora[k]).map(k => k + ': ' + antes[k] + ' → ' + ahora[k])
```

Expected: `[]`.

```bash
bash "$S/imprimir.sh" t2
for h in registro rotulos mapa; do python "$S/comparar-pdf.py" "$S/antes-$h.pdf" "$S/t2-$h.pdf"; done
```

Expected: `IGUALES` las tres.

- [ ] **Step 7: Foto del papel y su test**

`scripts/extraer-papel-barriles.mjs`:

```js
// Foto de las reglas de papel e impresión de Barriles (rótulos A4, hoja del
// mapa, Registro). Se corre UNA vez, al final de la Task 2 de la Etapa 3 (con
// los colores ya en --sem-* y el bloque "Papel igual que antes"), después de
// verificar con PDFs que el papel sale idéntico al de main.
// Uso: node scripts/extraer-papel-barriles.mjs > test/fixtures/barriles-papel.json
// Las mismas dos constantes están en test/barriles-papel-intacto.test.mjs.
import { readFileSync } from 'node:fs';
import { reglasDePapel } from './css-reglas.mjs';

const PAPEL_BARRILES =
  /ot-rot|rot-hoja|-print\b|imprimiendo-|#areaImpresion|solo-impresion|\.reg-(?!barra\b|buscador\b|como\b|meses\b|mes\b|acciones\b)/;
// El celular y las pantallas táctiles no imprimen: lo de esos @media no es papel.
const sinCelular = (reglas) => reglas.filter((r) => !/^@media \((max-width:760px|pointer:coarse)\)>/.test(r));

const html = readFileSync(new URL('../public/barriles/index.html', import.meta.url), 'utf8');
process.stdout.write(JSON.stringify(sinCelular(reglasDePapel(html, PAPEL_BARRILES)), null, 1) + '\n');
```

Run:

```bash
node scripts/extraer-papel-barriles.mjs > test/fixtures/barriles-papel.json
node -e "const a=require('./test/fixtures/barriles-papel.json');console.log(a.length, a.filter(r=>r.startsWith('@media print')).length, a.some(r=>r.startsWith('@page rotulos')))"
```

Expected: unas 40 reglas, `2` bloques `@media print` (el de siempre y "Papel igual que antes") y `true`.

`test/barriles-papel-intacto.test.mjs`:

```js
/**
 * Las hojas de papel de Barriles (rótulos A4, hoja del mapa, Registro impreso)
 * y todo su @media print tienen que quedar EXACTAMENTE como al cerrar la Task 2
 * de la Etapa 3 (que salía idéntico a main, comparado con PDFs). La foto la
 * escribió scripts/extraer-papel-barriles.mjs; si un cambio la rompe, se
 * arregla el cambio, no la foto.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { reglasDePapel } from '../scripts/css-reglas.mjs';
import foto from './fixtures/barriles-papel.json';

const PAPEL_BARRILES =
  /ot-rot|rot-hoja|-print\b|imprimiendo-|#areaImpresion|solo-impresion|\.reg-(?!barra\b|buscador\b|como\b|meses\b|mes\b|acciones\b)/;
const sinCelular = (reglas) => reglas.filter((r) => !/^@media \((max-width:760px|pointer:coarse)\)>/.test(r));

describe('papel de Barriles', () => {
  it('las reglas de papel e impresión son las de la foto', () => {
    expect(sinCelular(reglasDePapel(env.INDEX_HTML_BARRILES, PAPEL_BARRILES))).toEqual(foto);
  });

  it('los rótulos siguen en A4 vertical con 14 mm', () => {
    expect(foto).toContain('@page rotulos{size: A4 portrait;margin: 14mm;}');
  });
});
```

Run: `npx vitest run test/barriles-papel-intacto.test.mjs`
Expected: PASS. Probar que caza: en `.ot-rotulo` cambiar `height: 27mm` por `28mm`, ver FAIL, volver.

- [ ] **Step 8: Suite y commit**

Correr la suite. Expected: verde.

```bash
git add public/barriles/index.html test/barriles-colores-congelados.test.ts scripts/extraer-papel-barriles.mjs \
  test/fixtures/barriles-papel.json test/barriles-papel-intacto.test.mjs
git commit -m "refactor(barriles): congelar los colores con significado como --sem-* y fijar el papel (sin cambio visible)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Barra como la de Prensas (Inicio · Barriles · Mapa · Imprimir + Más)

**Files:**
- Create: `public/barriles/js/barra-barriles.js`, `test/barriles-barra.test.ts`
- Modify: `public/barriles/index.html` (`<head>`: `estilo.css` y el script nuevo; `header`, `#navProgramador`, `#navSubProg`, `#navOperario`, `#opVistaSel`, `#mapaTipoSel`; CSS de header/nav; `INSIGNIAS`/`ponerInsignia`; `PROG_GRUPOS`, `progIr`, `OP_TITULOS`; sticky de `#barraLibre2d`/`#barraTanque2d`)

**Interfaces:**
- Consumes: `public/shared/estilo.css` (tokens de Prensas, `--ci-tap`, Cormorant y Plex) y `--ciw-h` (lo publica `shared/barra.js`).
- Produces `js/barra-barriles.js` (script clásico, globales):
  - `barraMontarMas() → void` (abre/cierra `#masMenu` con `#masBtn`, Escape, clic afuera, elegir cierra)
  - `barraCerrarMas() → void`
  - `barraMarcar(grupo: string, sub: string) → void` (marca `.activo` en los `button[data-grupo]` del grupo y en el `#masMenu button[data-sub]` de la pantalla; si la pantalla vive en Más, el botón Más se marca y toma su nombre)
  - `barraPublicarAlto() → void` (publica `--barriles-h` = alto de `#barraBarriles`, y lo actualiza con `ResizeObserver`)
- Produces en el DOM: `<header class="app-barra" id="barraBarriles">` con `.marca`, `<nav class="tabs" id="navProgramador">` (incluye `#masWrap`, `#masBtn`, `#masMenu`), `<nav id="navOperario">`, `.right` y, como filas completas, `#navSubProg` y `<p id="opAyuda" class="op-ayuda">`.
- **Ojo con los nombres:** la clase NO puede ser `barra` ni `barra-libre` (`.barra-libre` ya existe, ~1100) y en Vista3D hay una función local `barra()`; por eso las globales se llaman `barraMontarMas`/`barraMarcar`/…

- [ ] **Step 1: Test que falla**

`test/barriles-barra.test.ts`:

```ts
/**
 * La barra de Barriles tiene que ser como la de Prensas: marca en Cormorant,
 * pestañas sin emojis, Administrar dentro de Más, y pegada debajo de la barra
 * de la plataforma (--ciw-h). Las sub-pestañas y la ayuda del operario van
 * DENTRO del <header>: el @media print lo oculta, así no salen en la hoja.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { cssDe, norm, reglasPlanas } from '../scripts/css-reglas.mjs';

const html = env.INDEX_HTML_BARRILES;
const header = (html.match(/<header class="app-barra" id="barraBarriles">[\s\S]*?<\/header>/) || [''])[0];
const nav = (header.match(/<nav class="tabs" id="navProgramador"[\s\S]*?<\/nav>/) || [''])[0];
const arriba = [...nav.replace(/<div class="mas"[\s\S]*$/, '').matchAll(/<button[^>]*data-grupo="([^"]+)"[^>]*>([^<]*)/g)]
  .map((m) => [m[1], m[2].trim()]);
const menu = (nav.match(/<div class="mas-menu" id="masMenu">[\s\S]*$/) || [''])[0]
  .replace(/<div class="mas-angosto">[\s\S]*?<\/div>/, '');
const enMas = [...menu.matchAll(/data-sub="([^"]+)"/g)].map((m) => m[1]);
const EMOJI = /\p{Extended_Pictographic}/u;
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');

describe('barra de Barriles', () => {
  it('carga estilo.css y la barra antes de su propio <style>', () => {
    const i = html.indexOf('<link rel="stylesheet" href="/shared/estilo.css">');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(html.indexOf('<style>'));
    expect(html).toContain('<script src="js/barra-barriles.js"></script>');
  });

  it('cuatro grupos a la vista y Administrar en Más', () => {
    expect(arriba).toEqual([['inicio', 'Inicio'], ['barriles', 'Barriles'], ['mapa', 'Mapa'], ['imprimir', 'Imprimir']]);
    expect(enMas).toEqual(['datos', 'boxes', 'respaldos', 'celular']);
  });

  it('sub-pestañas, ayuda del operario y operario dentro del header', () => {
    for (const id of ['navSubProg', 'navOperario', 'opAyuda', 'opTitulo', 'opInicio', 'insigniaSync', 'estadoDatos', 'chipModoLote']) {
      expect(header, id).toContain(`id="${id}"`);
    }
  });

  it('sin emojis en barra, sub-pestañas, títulos ni insignia', () => {
    expect(header.replace(/<span class="prog-cuenta"[^>]*><\/span>/g, '')).not.toMatch(EMOJI);
    for (const id of ['opVistaSel', 'mapaTipoSel']) {
      const bloque = (html.match(new RegExp(`<div id="${id}">[\\s\\S]*?</div>`)) || [''])[0];
      expect(bloque, id).not.toMatch(EMOJI);
    }
    const grupos = (js.match(/const PROG_GRUPOS = \{[\s\S]*?\n\};/) || [''])[0];
    expect(grupos).not.toBe('');
    expect(grupos).not.toMatch(EMOJI);
    const titulos = (js.match(/const OP_TITULOS = \{[\s\S]*?\n\};/) || [''])[0];
    for (const m of titulos.matchAll(/:\s*\['([^']*)'/g)) expect(m[1]).not.toMatch(EMOJI);
    const insignias = (js.match(/const INSIGNIAS = \{[\s\S]*?\n\};/) || [''])[0];
    for (const m of insignias.matchAll(/:\s*\['([^']*)'/g)) expect(m[1]).not.toMatch(EMOJI);
  });

  it('pegada debajo de la barra de la plataforma', () => {
    // norm() no saca el espacio después de ":": se compara con la misma escritura del CSS de Barriles.
    expect(norm(cssDe(html))).toContain(norm('.app-barra { position: sticky; top: var(--ciw-h,0px);'));
    expect(html).toContain('top:calc(var(--ciw-h,0px) + var(--barriles-h,0px) + 6px)');
  });

  it('sin reglas sobre header ni nav sueltos (pisaban la barra de la plataforma)', () => {
    const sueltas = reglasPlanas(html).filter((r) => /^(header|nav)( |$)/.test(r.selector) || /(^|,)(header|nav)(,|$)/.test(r.selector));
    expect(sueltas.map((r) => r.selector)).toEqual([]);
  });
});
```

Run: `npx vitest run test/barriles-barra.test.ts`
Expected: FAIL.

- [ ] **Step 2: `<head>`**

En `public/barriles/index.html`:
- Justo antes de `<style>` (línea ~50): `<link rel="stylesheet" href="/shared/estilo.css">`.
- Después de `<script src="js/sync.js"></script>`: `<script src="js/barra-barriles.js"></script>`.

(El `:root` de Barriles va después y todavía define `--ok`/`--warn` con sus valores viejos; eso se limpia en la Task 4. Nada con significado los usa desde la Task 2.)

- [ ] **Step 3: Markup de la barra**

Reemplazar desde `<header>` (línea ~687) hasta el cierre de `<nav id="navOperario">…</nav>` (línea ~713) — es decir `header`, `#avisoSoloLectura`, comentarios, `#navProgramador`, `#navSubProg` y `#navOperario` — por:

```html
<header class="app-barra" id="barraBarriles">
  <span class="marca">Barriles</span>
  <!-- Programador: cuatro grupos a la vista y Administrar en Más (como Prensas).
       Los grupos y sus sub-pestañas están en PROG_GRUPOS (script). -->
  <nav class="tabs" id="navProgramador" aria-label="Pantallas">
    <button type="button" data-grupo="inicio" class="activo">Inicio</button>
    <button type="button" data-grupo="barriles">Barriles</button>
    <button type="button" data-grupo="mapa">Mapa</button>
    <button type="button" data-grupo="imprimir">Imprimir<span class="prog-cuenta" id="progCuentaPedidos"></span></button>
    <div class="mas" id="masWrap">
      <button type="button" class="mas-btn" id="masBtn" aria-haspopup="true" aria-expanded="false" aria-controls="masMenu">Más</button>
      <div class="mas-menu" id="masMenu">
        <div class="mas-angosto">
          <button type="button" data-grupo="inicio">Inicio</button>
          <button type="button" data-grupo="barriles">Barriles</button>
          <button type="button" data-grupo="mapa">Mapa</button>
          <button type="button" data-grupo="imprimir">Imprimir</button>
        </div>
        <div class="mas-grupo">Administrar</div>
        <button type="button" data-sub="datos">Importar y modo</button>
        <button type="button" data-sub="boxes">Boxes y palets</button>
        <button type="button" data-sub="respaldos">Respaldos</button>
        <button type="button" data-sub="celular">Celular</button>
      </div>
    </div>
  </nav>
  <!-- Operario: sin pestañas. Se entra por la portada (#panel-inicio); esto
       solo dice dónde estás y cómo volver. -->
  <nav id="navOperario" aria-label="Volver al inicio">
    <button type="button" id="opInicio" data-op="inicio">← Inicio</button>
    <span id="opTitulo"></span>
  </nav>
  <div class="right">
    <!-- El interruptor de "Modo por lote" vive en Administrar → Importar y modo; acá
         queda solo el aviso de que está prendido (se toca y lleva al interruptor). -->
    <button type="button" id="chipModoLote" title="El mapa se está cargando por número de lote. Tocá para ir al interruptor." onclick="progIr('datos')">Modo por lote</button>
    <span class="insignia-sync" id="insigniaSync" data-tipo="" title="Modo de datos">Conectando…</span>
    <span class="estado-datos" id="estadoDatos">Sin inventario cargado</span>
  </div>
  <div id="navSubProg"></div>
  <p class="op-ayuda" id="opAyuda"></p>
</header>
<div id="avisoSoloLectura" role="status">👁 <b>Solo lectura:</b> tu usuario puede consultar el mapa, el inventario y las órdenes, pero no cargar cambios. Si necesitás cargar, pedile a un administrador permiso de edición.</div>
```

`#opVistaSel` (sigue después, hijo directo de `body`; el `@media print` lo oculta por id): reemplazar su contenido por

```html
<div id="opVistaSel">
  <span id="opVistaLabel">Ver y cargar en:</span>
  <button type="button" data-opvista="mapa" class="activo">Mapa 2D</button>
  <button type="button" data-opvista="mapa3d">Vista 3D</button>
</div>
```

`#mapaTipoSel` (~1081): `🛢️ Barriles` → `Barriles`, `🧴 Tanques` → `Tanques`.

Sticky del modo libre: en los `style` de `#barraLibre2d` (~1100) y `#barraTanque2d` (~1110), `top:6px` → `top:calc(var(--ciw-h,0px) + var(--barriles-h,0px) + 6px)`.

- [ ] **Step 4: CSS de la barra (copia de la de Prensas)**

En el `<style>`:
1. Borrar `header { … }`, `header h1 { … }`, `header .estado-datos { … }` (~57-59), `nav { … }`, `nav button { … }`, `nav button.activo { … }`, `nav button:hover { … }` (~67-70), `.insignia-sync { … }` (~349), las cuatro de `#navOperario` (~368-371), `#opVistaSel`/`#opVistaSel button`/`#opVistaSel button.activo` (~372-374), `#navOperario #opInicio`, `body.op-inicio #navOperario #opInicio`, `#opTitulo`, `body:not(.op-inicio) #opTitulo`, `#opAyuda` (~449-453), y las de `#navSubProg` y `#navProgramador button` (~476-482; **no** `.prog-cuenta`, que es congelada). En el `@media (max-width: 700px)` de ~494 borrar `body.rol-programador #navSubProg { padding: 8px 12px; }`.
2. En `body.rol-operario #navProgramador, body.rol-operario #toggleModoLote, body.rol-operario header .estado-datos { display: none; }` (~377) cambiar `header .estado-datos` por `#estadoDatos`.
3. Donde estaban las reglas de `header` (paso 1), poner:

```css
  /* ---- barra de la app: como la de Prensas (marca, pantallas, Más, estado) ----
   * Clase app-barra (no "barra": .barra-libre ya existe). Sticky debajo de la
   * barra de la plataforma (shared/barra.js publica su alto en --ciw-h); su
   * propio alto lo publica barraPublicarAlto() en --barriles-h, para las barras
   * sticky del modo libre. z-index 40: arriba de esas barras (5); los
   * overlays de cámara y diálogos van más arriba. Dentro del header van
   * también #navSubProg y #opAyuda (filas enteras): el @media print oculta
   * "body > header", así no salen en la hoja. */
  .app-barra { position: sticky; top: var(--ciw-h,0px); z-index: 40; background: var(--bg); display: flex; align-items: center; flex-wrap: wrap; gap: 8px 20px; padding: 11px 26px; border-bottom: 1px solid var(--rule); }
  .app-barra .marca { font-family: var(--serif); font-size: 27px; font-weight: 500; line-height: 1; letter-spacing: .2px; color: var(--txt); }
  .app-barra .right { margin-left: auto; display: flex; align-items: center; gap: 14px; min-width: 0; }
  .tabs { display: flex; align-items: center; gap: 2px; }
  .tabs button[data-grupo], .mas-btn { background: transparent; border: none; color: var(--muted); padding: 6px 11px; cursor: pointer; font-size: 13.5px; font-weight: 500; font-family: var(--sans); border-radius: 2px; white-space: nowrap; }
  .tabs button[data-grupo]:hover, .mas-btn:hover { color: var(--txt); background: var(--panel2); }
  .tabs > button[data-grupo].activo, .mas-btn.activo { background: var(--txt); color: var(--bg); }
  .mas { position: relative; }
  .mas-btn::after { content: ' ▾'; font-size: 10px; }
  .mas-menu { position: absolute; top: calc(100% + 8px); left: 0; min-width: 210px; background: var(--panel); border: 1px solid var(--line); border-top: 2px solid var(--rule); border-radius: 2px; box-shadow: 0 12px 30px rgba(28,27,25,.16); padding: 6px 0; display: none; z-index: 45; }
  .mas-menu.open { display: block; }
  .mas-menu button { display: block; width: 100%; text-align: left; background: none; border: none; padding: 7px 16px; font-size: 13.5px; font-family: var(--sans); color: var(--txt); cursor: pointer; border-radius: 0; }
  .mas-menu button:hover { background: var(--panel2); color: var(--txt); }
  .mas-menu button.activo { color: var(--accent); font-weight: 600; background: var(--accent-tinte); }
  .mas-grupo { font-size: 9.5px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); padding: 10px 16px 4px; }
  .mas-angosto { display: none; border-bottom: 1px solid var(--line); padding-bottom: 6px; margin-bottom: 2px; }
  .insignia-sync { font-size: 12px; color: var(--muted); white-space: nowrap; }
  .insignia-sync::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: currentColor; margin-right: 6px; vertical-align: 1px; }
  .insignia-sync[data-tipo="ok"] { color: var(--ok); }
  .insignia-sync[data-tipo="pendiente"] { color: var(--warn); }
  .insignia-sync[data-tipo="offline"], .insignia-sync[data-tipo="sesion"] { color: var(--nook); }
  .app-barra .estado-datos { font-size: 12px; color: var(--muted); white-space: nowrap; }
  /* sub-pestañas del grupo (Barriles, Mapa, Imprimir): botones rectos en una fila */
  #navSubProg { display: none; }
  body.rol-programador #navSubProg { display: flex; flex-basis: 100%; flex-wrap: wrap; gap: 4px; }
  body.rol-programador #navSubProg:empty { display: none; }
  #navSubProg button { background: transparent; color: var(--muted); border: 1px solid var(--line); border-radius: 2px; padding: 5px 12px; font: 500 13px var(--sans); cursor: pointer; }
  #navSubProg button:hover { color: var(--txt); border-color: var(--txt); }
  #navSubProg button.activo { background: var(--txt); border-color: var(--txt); color: var(--bg); }
  /* operario: "← Inicio" y el nombre de la pantalla; la ayuda, abajo */
  #navOperario { display: none; align-items: center; gap: 16px; min-width: 0; }
  #opInicio { background: transparent; border: 1px solid var(--txt); border-radius: 2px; color: var(--txt); font: 500 15px var(--sans); padding: 0 16px; min-height: var(--ci-tap); cursor: pointer; }
  #opInicio:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-tinte); }
  body.op-inicio #opInicio { display: none; }
  #opTitulo { font-family: var(--serif); font-size: 26px; font-weight: 500; line-height: 1.1; color: var(--txt); }
  .op-ayuda { flex-basis: 100%; margin: 0; color: var(--muted); font-size: 15px; }
  .op-ayuda:empty, body.rol-programador .op-ayuda { display: none; }
  /* "Ver y cargar en" del operario (Mapa 2D / Vista 3D) y Barriles/Tanques del mapa */
  #opVistaSel { display: none; gap: 8px; padding: 10px 26px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid var(--line); }
  #opVistaLabel { font-size: 13px; color: var(--muted); font-weight: 500; }
  #opVistaSel button { background: transparent; border: 1px solid var(--line); color: var(--muted); border-radius: 2px; padding: 8px 18px; font: 500 15px var(--sans); cursor: pointer; }
  #opVistaSel button.activo { background: var(--txt); border-color: var(--txt); color: var(--bg); }
  @media (max-width: 1100px) { .app-barra .right .estado-datos { display: none; } }
  @media (max-width: 900px) {
    .app-barra { gap: 8px 14px; padding: 10px 16px; }
    #navProgramador > button[data-grupo] { display: none; }
    .mas-angosto { display: block; }
    .app-barra .right { gap: 8px; }
  }
```

(`#chipModoLote` queda con su regla congelada; `#toggleModoLote` también.)

- [ ] **Step 5: `js/barra-barriles.js`**

```js
/* ===== Mapa de Barriles — barra: menú Más, pestaña activa y alto =====
 * Mismo comportamiento que la barra de Prensas (prensas/app.js setupTabs) y la
 * de Lotes (js/barra-lotes.js): los cuatro grupos están dos veces (en la barra
 * y, en pantallas angostas, dentro de Más), así que se marcan todas las copias.
 * Administrar vive en Más: si la pantalla es una de esas, el botón Más se
 * marca y toma su nombre.
 * Script clásico (Barriles no usa módulos): funciones globales con prefijo
 * barra*. Ojo: en Vista3D hay una función local barra(); no se pisa. */
'use strict';

function barraCerrarMas() {
  const menu = document.getElementById('masMenu'), btn = document.getElementById('masBtn');
  if (!menu || !btn) return;
  menu.classList.remove('open');
  btn.setAttribute('aria-expanded', 'false');
}

function barraMontarMas() {
  const menu = document.getElementById('masMenu'), btn = document.getElementById('masBtn');
  if (!menu || !btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrir = !menu.classList.contains('open');
    menu.classList.toggle('open', abrir);
    btn.setAttribute('aria-expanded', String(abrir));
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#masWrap')) barraCerrarMas(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('open')) { barraCerrarMas(); btn.focus(); }
  });
  // Elegir algo del menú lo cierra (las pantallas las cablea el script principal).
  menu.addEventListener('click', (e) => { if (e.target.closest('button')) barraCerrarMas(); });
}

/** Marca el grupo y la pantalla. grupo: 'inicio' | 'barriles' | 'mapa' | 'imprimir' | 'admin'. */
function barraMarcar(grupo, sub) {
  document.querySelectorAll('#navProgramador button[data-grupo]').forEach((b) => b.classList.toggle('activo', b.dataset.grupo === grupo));
  document.querySelectorAll('#masMenu button[data-sub]').forEach((b) => b.classList.toggle('activo', b.dataset.sub === sub));
  const btn = document.getElementById('masBtn');
  if (!btn) return;
  const enLaBarra = document.querySelector('#navProgramador > button[data-grupo="' + grupo + '"]');
  const enMas = !enLaBarra && document.querySelector('#masMenu > button[data-sub="' + sub + '"]');
  btn.classList.toggle('activo', !!enMas);
  btn.textContent = enMas ? enMas.textContent : 'Más';
}

/** Publica el alto de la barra en --barriles-h (lo usan las barras sticky del modo libre). */
function barraPublicarAlto() {
  const h = document.getElementById('barraBarriles');
  if (!h) return;
  const poner = () => document.documentElement.style.setProperty('--barriles-h', h.offsetHeight + 'px');
  poner();
  if (window.ResizeObserver) new ResizeObserver(poner).observe(h);
}
```

- [ ] **Step 6: Script principal**

En `public/barriles/index.html`:

1. `INSIGNIAS` (~1846): los textos pasan a `'Sincronizado'`, `'Guardando…'`, `'Sin conexión'`, `'Sesión cerrada'`, `'Solo lectura'` (los `title` quedan igual). En `ponerInsignia`, después de `i.textContent = texto; i.title = titulo;` agregar `i.dataset.tipo = INSIGNIAS[tipo] ? tipo : 'offline';`.
2. `PROG_GRUPOS` (~2235) sin emojis:

```js
const PROG_GRUPOS = {
  inicio:   [['tablero', 'Inicio']],
  barriles: [['inventario', 'Inventario'], ['escaner', 'Llenado / vaciado'], ['registro', 'Registro']],
  mapa:     [['mapa', 'Mapa'], ['mapa3d', 'Vista 3D']],   // Reportes se sacó a pedido (2026-10-06)
  imprimir: [['rotulos', 'Rótulos'], ['pedidos', 'Pedidos de rótulos']],
  admin:    [['datos', 'Importar y modo'], ['boxes', 'Boxes y palets'], ['respaldos', 'Respaldos'], ['celular', 'Celular']],
};
```

3. En `progIr`, reemplazar
   `document.querySelectorAll('#navProgramador button[data-grupo]').forEach(b => b.classList.toggle('activo', b.dataset.grupo === grupo));`
   por `barraMarcar(grupo, sub);`, y `$('navSubProg').innerHTML = subs.length < 2 ? '' : subs.map(…` por `$('navSubProg').innerHTML = (subs.length < 2 || grupo === 'admin') ? '' : subs.map(…` (Administrar ya está en Más: sin sub-pestañas). Al lado de `<button data-sub="${s}" …>` del template, agregar `type="button"`.
4. Después de `$('navSubProg').addEventListener('click', …);` agregar:

```js
document.querySelectorAll('#masMenu button[data-sub]').forEach(b => b.addEventListener('click', () => progIr(b.dataset.sub)));
barraMontarMas();
barraPublicarAlto();
```

5. `OP_TITULOS` (~2458), sin emojis en los títulos: `'Cargar box'`, `'Dónde está'`, `'Llenado / vaciado'`, `'Registro'`, `'Rótulos'`, `'Inventario'`, `'Asociar vasija con lote'`, `'Pedidos de rótulos'`, `'Conectar teléfono'` (las ayudas quedan igual).
6. Buscar en el script `navOperario` y `navSubProg`: los selectores `#navOperario button[data-op]` y `$('navSubProg')` siguen valiendo (mismos ids). Buscar `header ` (con espacio) en selectores del script: no debería haber; si aparece, cambiarlo por `#barraBarriles `.

- [ ] **Step 7: Tests**

Run: `npx vitest run test/barriles-barra.test.ts test/barriles-papel-intacto.test.mjs test/barriles-colores-congelados.test.ts test/barriles-colores-js.test.mjs test/barriles-pantalla.test.ts`
Expected: PASS los cinco. (Si `barriles-papel-intacto` falla, se tocó una regla de `@media print` o de papel.)

- [ ] **Step 8: En el navegador**

Recargar `http://localhost:8840/barriles/?rol=admin` a 1280 px:
- "Barriles" en Cormorant (`document.fonts.check('500 27px "Cormorant Garamond"')` → `true`), Inicio · Barriles · Mapa · Imprimir y Más. Clic en cada grupo: cambia la pantalla, queda marcado y aparecen sus sub-pestañas (Barriles: Inventario · Llenado / vaciado · Registro). Más → Boxes y palets: el botón Más dice "Boxes y palets" y se marca, sin sub-pestañas.
- Escape cierra Más y devuelve el foco al botón.
- Scroll: la barra queda pegada bajo la de la plataforma: `getComputedStyle($('barraBarriles')).top` = valor de `--ciw-h`. Mapa → Cargar tocando (modo libre): `#barraLibre2d` queda pegada justo debajo de la barra (`getBoundingClientRect().top` ≈ `--ciw-h` + `--barriles-h` + 6).
- La insignia dice "Sincronizado" con el punto verde.
- `http://localhost:8840/barriles/?rol=editor` (operario): portada sin "← Inicio"; tocar Registro → "← Inicio" + "Registro" en Cormorant + la ayuda abajo. Tocar Dónde está → aparece `#opVistaSel` (Mapa 2D / Vista 3D).
- Muestreo idéntico a `muestreo-antes.json` (con `?rol=admin`).
- PDFs: `bash "$S/imprimir.sh" t3` y comparar con `antes-*`: `IGUALES` las tres.

- [ ] **Step 9: Suite y commit**

```bash
git add public/barriles/index.html public/barriles/js/barra-barriles.js test/barriles-barra.test.ts
git commit -m "feat(barriles): barra como la de Prensas con Más, sin emojis en pestañas, pegada bajo la de la plataforma

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Estilo de Prensas en la interfaz

**Files:**
- Create: `test/barriles-estilo.test.ts`
- Modify: `public/barriles/index.html` (`:root`, reglas de interfaz, 6 `style=""` con `--vino`/`--vino-osc`, `style` de `#escBtnGuardar`/`#barBtnAsociar`)

**Interfaces:**
- Consumes: tokens de `estilo.css` (`--bg`, `--panel`, `--panel2`, `--line`, `--rule`, `--txt`, `--muted`, `--accent`, `--accent2`, `--accent-tinte`, `--ok`, `--nook`, `--warn`, `--serif`, `--sans`, `--ci-tap`).
- Consumes: `CON_SIGNIFICADO`, `PAPEL_BARRILES` (los copia el test; están en `test/barriles-colores-congelados.test.ts`).

Tabla de reemplazo de tokens **solo en reglas de interfaz** (las congeladas ya usan `--sem-*`):

| Viejo | Nuevo |
|---|---|
| `var(--vino)` (bordes, botones, títulos) | `var(--accent)` |
| `var(--vino-osc)` (texto oscuro, hover) | `var(--txt)` en texto; `var(--accent2)` en fondos de hover |
| `var(--gris)` | `var(--line)` |
| `var(--crema)` | `var(--bg)` |
| `#fff` de fondo de tarjeta/caja/botón | `var(--panel)` |
| `#f3ede5`, `#faf6f0`, `#fbf4ee`, `#f0ebe3`, `#f6f0f2` | `var(--panel2)` (encabezados de tabla) o `var(--bg)` |
| `#ccc`, `#d6cec2`, `#e7d8c8`, `#eee`, `#efe6dc`, `#f0ebe5`, `#e2d3d9`, `#d9c5cd` | `var(--line)` |
| `#777`, `#888`, `#8a7f76`, `#6d6259`, `#b08` | `var(--muted)` |
| `#2b2b2b`, `#3a2b30` | `var(--txt)` |
| `#f6eef1`, `#fdf6f7`, `#f0e6ea`, `#f3e6ea`, `#fdf9f6` | `var(--accent-tinte)` |
| `#a33` | `var(--nook)` |
| `border-radius` de 5 a 18 px y `999px` en interfaz | `2px` |

- [ ] **Step 1: Test que falla**

`test/barriles-estilo.test.ts`:

```ts
/**
 * Barriles con el estilo de Prensas: carga shared/estilo.css, su :root deja
 * solo los colores con significado (--sem-*), y la interfaz no tiene colores
 * escritos a mano: todo sale de los tokens de Prensas. Así, el día que Prensas
 * retoque un color, Barriles lo sigue. Lo congelado y el papel no entran.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { cssDe, norm, reglasPlanas } from '../scripts/css-reglas.mjs';

const html = env.INDEX_HTML_BARRILES;
const CON_SIGNIFICADO = new RegExp([
  String.raw`\.celda\b`, String.raw`\.grilla\b`, String.raw`\.leyenda \.muestra`, '#cont3d', '#vacio3d', '#tooltip3d',
  String.raw`\.fb-libre`, '#escFeedback', String.raw`\.inp-libre\.error`, '#escResumen', String.raw`\.esc-res-`, 'esc-vencida',
  'esc-contador', '#escInstrucciones', String.raw`Cam\b`, String.raw`Cam[A-Z.\s]`, 'Camara', String.raw`\.cam-`, 'bar-paso',
  '#barCandidatos', '#barLoteManual', 'n-barril', '#barBtn', 'modo-lote', '#chipModoLote',
  String.raw`\.p-(lleno|vacio|mermo|tanque|barrica|revisar|revisado)\b`, 'fila-revisar', 'motivo-(revisar|edicion)',
  String.raw`\.ped-tipo`, 'marca-(on|off)', String.raw`Previo\.malo`, String.raw`\.btn\.peligro`, String.raw`\.ped-aviso`,
  String.raw`\.rot-(verde|blanca|nose|buscando)`, String.raw`\.tab-(alerta|ok)\b`, '(ini|prog)-cuenta',
  '#veloSinConexion', '#avisoSoloLectura', '#cartelLado',
].join('|'));
const PAPEL_BARRILES =
  /ot-rot|rot-hoja|-print\b|imprimiendo-|#areaImpresion|solo-impresion|\.reg-(?!barra\b|buscador\b|como\b|meses\b|mes\b|acciones\b)/;
// La portada del operario y el Inicio del programador los resuelve la Task 5.
const PORTADA = /\.ini-|\.tab-(cifra|subtitulo|accesos|valor|desc|det)\b|\.tab-cifras/;
const PERMITIDOS = new Set(['#fff', '#f3eee6']);   // letra sobre vino; el fondo del QR

function definidos(css: string): string[] {
  const m = css.match(/:root\s*\{([\s\S]*?)\}/);
  return (m ? m[1] : '').split(';').map((d) => d.slice(0, d.indexOf(':')).trim()).filter((k) => k.startsWith('--'));
}

describe('estilo de Barriles', () => {
  it('su :root solo tiene los colores con significado', () => {
    expect(definidos(cssDe(html)).sort()).toEqual(
      ['--sem-crema', '--sem-error', '--sem-gris', '--sem-ok', '--sem-vino', '--sem-vino-osc', '--sem-warn']);
  });

  it('nadie usa los tokens viejos de Barriles', () => {
    expect(html.match(/var\(--(vino|vino-osc|gris|crema|error)\)/g) || []).toEqual([]);
  });

  it('la interfaz no tiene colores escritos a mano', () => {
    const malas = reglasPlanas(html)
      .filter((r) => !CON_SIGNIFICADO.test(r.selector) && !PAPEL_BARRILES.test(r.selector) && !PORTADA.test(r.selector))
      .flatMap((r) => (r.cuerpo.match(/#[0-9a-fA-F]{3,8}\b/g) || [])
        .filter((c) => !PERMITIDOS.has(c.toLowerCase()))
        .map((c) => r.selector + ' → ' + c));
    expect(malas).toEqual([]);
  });

  it('Plex en el cuerpo y Cormorant en los títulos', () => {
    const css = norm(cssDe(html));
    expect(css).toContain(norm('body { font-family: var(--sans); background: var(--bg); color: var(--txt);'));
    expect(css).toContain(norm('h2 { font-family: var(--serif);'));
  });

  it('el papel sigue fijado con la letra de antes', () => {
    expect(cssDe(html).replace(/\s+/g, ' ')).toContain("body { font-family: 'Segoe UI', Arial, sans-serif; background: var(--sem-crema);");
  });
});
```

Run: `npx vitest run test/barriles-estilo.test.ts`
Expected: FAIL.

- [ ] **Step 2: `:root` solo con lo congelado**

Reemplazar el `:root` por:

```css
  :root {
    /* Los tokens de interfaz (--bg, --panel, --accent, --ok, --serif, --sans…)
     * vienen de /shared/estilo.css, copia exacta de los de Prensas
     * (test/estilo-tokens.test.ts). Barriles NO los redefine
     * (test/barriles-estilo.test.ts). Acá quedan solo los de significado. */
    /* --- Colores con significado (congelados el 2026-10-19) ---------------
     * Mapa, escáner, cámara, modo por lote, píldoras, Registro (que también se
     * imprime): el equipo los lee de memoria y NO cambian con la estética.
     * Los vigila test/barriles-colores-congelados.test.ts; el muestreo de
     * scripts/muestreo-colores-barriles.js tiene que dar igual antes y después. */
    --sem-ok: #2e7d32; --sem-error: #c62828; --sem-warn: #e65100;
    --sem-vino: #6b1f3a; --sem-vino-osc: #4a1428; --sem-gris: #e8e2da; --sem-crema: #faf6f0;
  }
```

- [ ] **Step 3: Reglas de base con el estilo de Prensas**

Reemplazos (regla entera por regla entera, en su lugar; las que no se nombran y no tienen colores quedan):

```css
  body { font-family: var(--sans); background: var(--bg); color: var(--txt); -webkit-font-smoothing: antialiased; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  #toggleModoLote { font-size: 1rem; display: inline-flex; align-items: center; gap: 8px; background: var(--panel); border: 1px solid var(--line); padding: 9px 16px; border-radius: 2px; cursor: pointer; user-select: none; }
  #toggleModoLote input { cursor: pointer; width: 18px; height: 18px; accent-color: var(--accent); }
  main { padding: 22px 26px 64px; max-width: 1400px; margin: 0 auto; }
  .tarjeta { background: var(--panel); border: none; border-top: 1px solid var(--rule); border-radius: 0; padding: 18px; margin-bottom: 18px; }
  h2 { font-family: var(--serif); font-size: 1.45rem; font-weight: 500; line-height: 1.15; margin-bottom: 12px; color: var(--txt); }
  button.btn { background: var(--accent); color: #F3EEE6; border: 1px solid var(--accent); border-radius: 2px; padding: 9px 16px; font-size: .9rem; font-weight: 500; font-family: var(--sans); cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
  button.btn:hover { background: var(--accent2); border-color: var(--accent2); color: #fff; }
  button.btn.sec { background: transparent; color: var(--txt); border: 1px solid var(--txt); }
  button.btn.sec:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-tinte); }
  input, select { padding: 8px 10px; border: 1px solid var(--line); border-radius: 2px; font-size: .95rem; font-family: inherit; }
  table.datos th, table.datos td { border: 1px solid var(--line); padding: 6px 9px; text-align: left; }
  table.datos th { background: var(--panel2); color: var(--muted); font-weight: 500; font-size: .74rem; text-transform: uppercase; letter-spacing: .8px; }
  .pildora { display: inline-block; padding: 2px 10px; border-radius: 2px; font-size: .78rem; font-weight: 600; }
  .filtros-inv input[type="search"] { flex: 1 1 240px; min-width: 180px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 2px; font-size: 1rem; }
  .filtros-inv select { padding: 9px 10px; border: 1px solid var(--line); border-radius: 2px; font-size: .95rem; background: var(--panel); }
  table.datos tr.filtros-col th { background: var(--bg); padding: 4px 5px; }
  table.datos tr.filtros-col input, table.datos tr.filtros-col select {
    width: 100%; box-sizing: border-box; padding: 4px 6px; font-size: .8rem;
    border: 1px solid var(--line); border-radius: 2px; background: var(--panel); font-weight: 400; }
  table.datos tr.filtros-col .con-filtro { border-color: var(--accent); background: var(--accent-tinte); }
  .alta-campos label { display: flex; flex-direction: column; gap: 3px; font-size: .8rem; color: var(--muted); }
  #altaPrevio, #bajaPrevio { font-size: .85rem; border-radius: 2px; padding: 9px 11px; margin-bottom: 12px; background: var(--panel2); }
  .ed-input { width: 100%; min-width: 90px; box-sizing: border-box; padding: 4px 6px; font-size: .95rem; border: 2px solid var(--accent); border-radius: 2px; }
  .link-rev { background: none; border: 0; padding: 0; color: var(--muted); font-size: .78rem; text-decoration: underline; cursor: pointer; }
  .tanda-alta { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
                font-size: .82rem; padding: 4px 0; border-top: 1px solid var(--line); }
  .pos-actual { font-size: 1.1rem; font-weight: 700; color: var(--accent); }
  .esc-tipo { flex: 1; min-width: 150px; padding: 20px 14px; font-size: 1.1rem; font-weight: 600; font-family: var(--sans); border: 1px solid var(--txt); background: var(--panel); color: var(--txt); border-radius: 2px; cursor: pointer; }
  .esc-tipo:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-tinte); }
  .esc-tipo.activo { background: var(--txt); border-color: var(--txt); color: var(--bg); }
  #escInput { font-size: 1.4rem; padding: 14px; width: 100%; max-width: 460px; border: 2px solid var(--txt); border-radius: 2px; background: var(--panel); }
  .esc-historial > summary::after { content: '⌄ mostrar'; margin-left: auto; color: var(--accent); font-weight: 600; font-size: .9rem; }
  .esc-historial[open] > summary { border-bottom: 1px solid var(--line); padding-bottom: 10px; }
  .titulo-box { font-family: var(--serif); font-weight: 500; font-size: 1.25rem; margin-bottom: 6px; color: var(--txt); display: flex; gap: 10px; align-items: center; }
  .etiqueta-fila { width: 34px; height: 52px; display: flex; align-items: center; justify-content: center; font-size: .75rem; color: var(--muted); font-weight: 600; }
  .etiqueta-col { height: 22px; display: flex; align-items: center; justify-content: center; font-size: .75rem; color: var(--muted); font-weight: 600; }
  .enc-col { display: flex; flex-direction: column; justify-content: flex-end; font-size: .75rem; color: var(--muted); font-weight: 600; padding-bottom: 2px; }
  .leyenda .item { display: flex; align-items: center; gap: 5px; font-size: .8rem; background: var(--panel); border: 1px solid var(--line); border-radius: 2px; padding: 3px 10px; cursor: pointer; }
  .leyenda-colapsable { background: var(--panel); border: 1px solid var(--line); border-radius: 2px; margin: 10px 0; font-size: .92rem; }
  .leyenda-colapsable > summary { cursor: pointer; padding: 9px 14px; font-weight: 600; color: var(--txt); list-style: none; user-select: none; }
  .leyenda-colapsable > summary::after { content: ' ⌄'; color: var(--muted); }
  .leyenda-colapsable[open] > summary { border-bottom: 1px solid var(--line); }
  .resultado-busqueda .item-resultado { display: flex; align-items: center; gap: 5px; font-size: .85rem; background: var(--panel); border: 1px solid var(--accent); color: var(--accent); border-radius: 2px; padding: 4px 12px; cursor: pointer; font-weight: 600; }
  .resultado-busqueda .item-resultado:hover { background: var(--accent-tinte); }
  .resultado-busqueda .sin-resultado { font-size: .85rem; color: var(--nook); font-style: italic; }
  #modalContenido { background: var(--panel); border-top: 2px solid var(--rule); border-radius: 2px; padding: 22px; max-width: 420px; width: 92%; max-height: 85vh; overflow: auto; box-shadow: 0 20px 50px rgba(28,27,25,.25); }
  #modalContenido h3 { font-family: var(--serif); font-size: 1.4rem; font-weight: 500; color: var(--txt); margin-top: 0; }
  #modalContenido td { padding: 4px 6px; border-bottom: 1px solid var(--line); }
  #modalContenido td:first-child { color: var(--muted); width: 42%; }
  .mini-stats .stat .valor { font-family: var(--serif); font-size: 1.9rem; font-weight: 500; color: var(--txt); font-variant-numeric: lining-nums tabular-nums; }
  .mini-stats .stat .desc { font-size: .78rem; color: var(--muted); }
  .nota { font-size: .82rem; color: var(--muted); margin-top: 8px; }
  .ayuda { background: var(--panel); border: none; border-left: 2px solid var(--accent); border-radius: 0; margin-bottom: 16px; font-size: .92rem; }
  .ayuda > summary { cursor: pointer; padding: 11px 15px; font-weight: 600; color: var(--txt); list-style: none; user-select: none; }
  .ayuda > summary::after { content: ' ⌄'; color: var(--muted); }
  .ayuda[open] > summary { border-bottom: 1px solid var(--line); }
  .ayuda .cuerpo { padding: 12px 16px; line-height: 1.65; color: var(--txt); }
  .ayuda .cuerpo b { color: var(--txt); }
  .ayuda .muestra-celda { display: inline-block; min-width: 34px; padding: 2px 6px; border-radius: 2px; border: 1px solid var(--line); font-weight: 700; font-size: .78rem; text-align: center; vertical-align: middle; }
  .qr-caja { background: #fff; padding: 14px; border-radius: 2px; display: inline-block; }
  .url-grande { font-size: 1.05rem; font-weight: 700; color: var(--accent); word-break: break-all; }
  #overlayPedido .ped-caja { background: var(--panel); border-top: 2px solid var(--rule); border-radius: 2px; padding: 22px; width: 100%; max-width: 380px; box-shadow: 0 20px 50px rgba(28,27,25,.25); }
  #overlayPedido h3 { margin: 0 0 14px; font-family: var(--serif); font-size: 1.4rem; font-weight: 500; color: var(--txt); }
  .ped-op { padding: 16px; font-size: 1.1rem; font-weight: 600; font-family: var(--sans); border: 1px solid var(--txt); background: var(--panel); color: var(--txt); border-radius: 2px; cursor: pointer; }
  #pedInput { width: 100%; font-size: 1.6rem; text-align: center; font-weight: 700; padding: 12px; border: 2px solid var(--txt); border-radius: 2px; box-sizing: border-box; }
  .ped-cerrar { margin-top: 16px; width: 100%; background: none; border: none; color: var(--muted); font-size: .9rem; cursor: pointer; }
  #mapaTipoSel button { background: var(--panel); border: 1px solid var(--line); color: var(--muted); border-radius: 2px; padding: 7px 16px; font: 500 .92rem var(--sans); cursor: pointer; }
  #mapaTipoSel button.activo { background: var(--txt); border-color: var(--txt); color: var(--bg); }
  .palet .cas-col { font-size: .6rem; color: var(--muted); text-align: center; }
  body.rol-operario main { max-width: 1280px; padding: 24px 28px; }
  body.rol-operario .tarjeta { border-radius: 0; padding: 22px; }
  body.rol-operario button.btn { font-size: 1rem; padding: 11px 18px; border-radius: 2px; }
  body.rol-operario #panel-escaner .fila-flex > label { font-size: 1.15rem; font-weight: 600; color: var(--txt); }
  body.rol-operario #panel-escaner #escFecha,
  body.rol-operario #panel-escaner #escOT,
  body.rol-operario #panel-escaner #escLote { font-size: 1.4rem; padding: 12px 14px; height: 56px; border: 2px solid var(--txt); border-radius: 2px; }
  body.rol-programador main { max-width: 1320px; padding: 22px 26px; }
  body.rol-programador .tarjeta { border-radius: 0; padding: 20px 22px; }
  .reg-buscador { flex: 1; display: flex; align-items: center; gap: 10px; background: var(--panel); border: 2px solid var(--txt); border-radius: 2px; padding: 2px 16px; font-size: 1.3rem; }
  .reg-como:not(:empty) { background: var(--accent-tinte); color: var(--accent); border-radius: 2px; padding: 4px 12px; font-size: .9rem; font-weight: 600; white-space: nowrap; }
  .reg-mes { background: var(--panel); border: 1px solid var(--line); border-radius: 2px; padding: 8px 16px; font: inherit; font-size: .98rem; cursor: pointer; color: var(--txt); }
  .reg-mes:hover { border-color: var(--txt); }
  .reg-mes.activo { background: var(--txt); border-color: var(--txt); color: var(--bg); font-weight: 600; }
  .rot-form label { display: flex; flex-direction: column; gap: 4px; font-weight: 600; color: var(--txt); }
  .rot-form input { font-size: 1.25rem; padding: 10px 12px; border: 1px solid var(--line); border-radius: 2px; font-weight: 400; background: var(--panel); }
  .rot-form input:focus { border-color: var(--txt); outline: none; }
  .con-cuenta { color: var(--muted); margin-bottom: 8px; }
  .con-tabla-wrap { background: var(--panel); border: none; border-top: 1px solid var(--rule); border-radius: 0; overflow: auto; }
  .con-tabla th { text-align: left; background: var(--panel2); color: var(--muted); padding: 10px 14px; font-size: .76rem; font-weight: 500; text-transform: uppercase; letter-spacing: .8px; white-space: nowrap; }
  .con-tabla td { padding: 9px 14px; border-top: 1px solid var(--line); }
  .con-tabla tr:hover td { background: var(--accent-tinte); }
  .con-num { font-family: Consolas, 'Courier New', monospace; font-size: 1.05rem; font-weight: 700; background: none; border: none;
             color: var(--accent); cursor: pointer; padding: 0; text-decoration: underline dotted; }
```

Notas:
- `button.btn.peligro` (congelada): agregarle `border-color: var(--sem-error);` (el borde nuevo de `.btn` sería vino). `button.btn.marca` (base, sin on/off) queda como está: hereda el vino de Prensas.
- `#escBtnGuardar` y `#barBtnAsociar`: su `style="background:var(--sem-ok);"` pasa a `style="background:var(--sem-ok); border-color:var(--sem-ok);"`.
- Los seis `style=""` del HTML con tokens viejos: `color:var(--vino)` del `<summary>` "Ya impresos" → `var(--accent)`; `color:var(--vino-osc)` de `#nota2dLibre`, `#destinoLibre2d`, `#destinoTanque2d`, `#nota3dLibre`, `#destinoLibre` → `var(--txt)`.
- Todas las reglas nuevas quedan **antes** del bloque "Papel igual que antes".
- `rgba(...)` de sombras y fondos oscuros (modal, pedido) quedan.

Después, buscar en el `<style>` las reglas de interfaz que todavía tengan `var(--vino`, `var(--gris)`, `var(--crema)`, `var(--error)` o un `#hex` (el test las lista con su selector): pasarlas con la tabla de arriba.

- [ ] **Step 4: Tests**

Run: `npx vitest run test/barriles-estilo.test.ts test/barriles-colores-congelados.test.ts test/barriles-colores-js.test.mjs test/barriles-papel-intacto.test.mjs test/barriles-barra.test.ts test/estilo-tokens.test.ts`
Expected: PASS los seis.

- [ ] **Step 5: En el navegador**

Recargar a 1280 px, `?rol=admin`:
- Muestreo **idéntico** a `muestreo-antes.json`. Si alguna muestra cambió, su regla todavía lee un token de interfaz o pisa un color congelado: arreglarlo y repetir.
- `getComputedStyle(document.querySelector('.tarjeta h2')).fontFamily` empieza con `"Cormorant Garamond"`; el `body` con `"IBM Plex Sans"`.
- Recorrer Inicio, Barriles (Inventario, Llenado / vaciado, Registro), Mapa (2D y 3D), Imprimir (Rótulos, Pedidos), Más (las cuatro): nada en blanco sobre blanco, botones legibles (`.btn` vino macizo, `.btn.sec` de contorno). El mapa 2D, la vista 3D y los marcos de cámara se ven igual que antes.
- PDFs: `bash "$S/imprimir.sh" t4` y comparar con `antes-*`: `IGUALES` las tres. **Si alguna difiere**, encontrar qué regla de pantalla nueva entra en la hoja: abrir la URL de esa hoja en el panel, emular impresión (`javascript_tool`: no hay emulación; en su lugar, poner la clase `imprimiendo-*` o llamar a `construirImpresion()` y comparar `getComputedStyle` de `.reg-tarjeta`, `.reg-grupo h3`, `#areaImpresion .celda-print` contra los valores de `main`), y fijar esa propiedad en el bloque "Papel igual que antes" con `:where()` para no subir la especificidad. Repetir hasta `IGUALES`.

- [ ] **Step 6: Suite y commit**

```bash
git add public/barriles/index.html test/barriles-estilo.test.ts
git commit -m "feat(barriles): estilo de Prensas en la interfaz (estilo.css, Cormorant y Plex, sin colores sueltos)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Portada del operario e Inicio del programador

Los 6 botones grandes **no se achican**: mismas medidas, recuadro piedra con filete de tinta arriba y el nombre de la tarea bien legible. Los íconos quedan.

**Files:**
- Create: `test/barriles-portada.test.ts`
- Modify: `public/barriles/index.html` (reglas `.ini-*`, `.tab-subtitulo`, `.tab-cifra*`, `.tab-accesos …`), `test/barriles-estilo.test.ts` (sacar la excepción `PORTADA`)

- [ ] **Step 1: Test que falla**

`test/barriles-portada.test.ts`:

```ts
/**
 * La portada del operario: seis botones grandes que se usan de pie, a un metro
 * de la pantalla. La estética les cambia el recuadro (piedra con filete de
 * tinta, esquina de 2 px), NO el tamaño: ni el alto, ni la letra, ni las tres
 * columnas.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { reglasPlanas } from '../scripts/css-reglas.mjs';

const html = env.INDEX_HTML_BARRILES;
const reglas = reglasPlanas(html);
// Sin espacios: el CSS de Barriles escribe "prop: valor" y norm() deja ese espacio.
const plano = (s: string) => s.replace(/\s+/g, '');
const regla = (sel: string, media = '') =>
  plano((reglas.find((r) => r.selector === sel && plano(r.media) === plano(media)) || { cuerpo: '' }).cuerpo);
const tiene = (sel: string, decl: string, media = '') => expect(regla(sel, media), sel + ' ' + decl).toContain(plano(decl));

describe('portada del operario', () => {
  it('seis botones grandes', () => {
    const portada = (html.match(/<div class="ini-grandes">[\s\S]*?<\/div>\s*<div class="ini-chicos">/) || [''])[0];
    expect((portada.match(/class="ini-boton/g) || []).length).toBe(6);
  });

  it('las medidas de siempre', () => {
    tiene('.ini-boton', 'min-height: 150px');
    tiene('.ini-boton', 'padding: 26px 22px');
    tiene('.ini-boton b', 'font-size: 1.35rem');
    tiene('.ini-boton .ini-ico', 'font-size: 2.6rem');
    tiene('.ini-grandes', 'grid-template-columns: repeat(3, minmax(0, 1fr))');
    tiene('.ini-grandes', 'grid-template-columns: repeat(2, minmax(0, 1fr))', '@media (max-width: 700px)');
  });

  it('recuadro piedra con filete de tinta y esquina de 2 px', () => {
    tiene('.ini-boton', 'background: var(--panel)');
    tiene('.ini-boton', 'border-top: 2px solid var(--rule)');
    tiene('.ini-boton', 'border-radius: 2px');
    tiene('.ini-boton b', 'color: var(--txt)');
  });

  it('las cifras del Inicio del programador en Cormorant', () => {
    tiene('.tab-cifra .tab-valor', 'font-family: var(--serif)');
  });
});
```

Run: `npx vitest run test/barriles-portada.test.ts`
Expected: FAIL en "recuadro" y "cifras".

- [ ] **Step 2: CSS**

Reemplazar (regla entera por regla entera):

```css
  .ini-saludo h2 { font-family: var(--serif); font-size: 2.3rem; font-weight: 500; color: var(--txt); margin: 0; }
  .ini-saludo p { color: var(--muted); font-size: 1.1rem; margin-top: 4px; }
  .ini-boton { background: var(--panel); border: 1px solid var(--line); border-top: 2px solid var(--rule); border-radius: 2px; padding: 26px 22px; text-align: left; cursor: pointer;
               display: flex; flex-direction: column; gap: 8px; min-height: 150px; font: inherit; color: inherit;
               transition: border-color .15s, background .15s; }
  .ini-boton:hover { border-color: var(--accent); border-top-color: var(--accent); background: var(--accent-tinte); }
  .ini-boton:focus-visible, .ini-chico:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  .ini-boton b { font-size: 1.35rem; font-weight: 600; line-height: 1.2; color: var(--txt); margin-top: auto; }
  .ini-boton span:last-child { color: var(--muted); font-size: 1rem; }
  .ini-boton.ini-destacado { border: 1px solid var(--accent); border-top: 2px solid var(--accent); background: var(--accent-tinte); }
  .ini-chico { background: var(--panel); border: 1px solid var(--line); border-radius: 2px; padding: 12px 20px; font: inherit; font-size: 1rem; cursor: pointer; color: var(--txt); min-height: var(--ci-tap); }
  .ini-chico:hover { border-color: var(--txt); }
  .tab-subtitulo { font-size: 10px; text-transform: uppercase; letter-spacing: 1.8px; color: var(--muted); margin: 22px 0 10px; font-weight: 500; }
  .tab-cifra { background: var(--panel); border: none; border-top: 1px solid var(--rule); border-radius: 0; padding: 16px 18px; text-align: left; font: inherit; color: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 4px; transition: background .15s; }
  .tab-cifra:hover { background: var(--accent-tinte); }
  .tab-cifra:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  .tab-cifra .tab-valor { font-family: var(--serif); font-size: 2.4rem; font-weight: 500; color: var(--txt); line-height: 1; font-variant-numeric: lining-nums tabular-nums; }
  .tab-cifra .tab-desc { font-weight: 600; color: var(--txt); }
  .tab-cifra .tab-det { font-size: .85rem; color: var(--muted); }
```

`.ini-grandes`, `.ini-boton .ini-ico`, `.ini-chicos`, `.tab-cifras`, `.tab-accesos .ini-boton*` y el `@media (max-width: 700px)` quedan iguales. `.tab-cifra.tab-alerta/.tab-ok` e `.ini-cuenta` son congeladas: no se tocan (su `border-left` de 6 px sigue ganando a `border: none` por especificidad).

En `test/barriles-estilo.test.ts`: borrar la constante `PORTADA` y su uso (`&& !PORTADA.test(r.selector)`).

- [ ] **Step 3: Tests**

Run: `npx vitest run test/barriles-portada.test.ts test/barriles-estilo.test.ts test/barriles-colores-congelados.test.ts`
Expected: PASS.

- [ ] **Step 4: En el navegador**

`?rol=editor` a 1280 px y a 375 px (preset mobile): los 6 botones miden **≥ 150 px** de alto (`[...document.querySelectorAll('#panel-inicio .ini-boton')].map(b => b.getBoundingClientRect().height)`), el título `getComputedStyle(b.querySelector('b')).fontSize` = `21.6px`, 3 columnas a 1280 y 2 a 375. Comparar con `portada` de `$S/medidas-antes.json`: ninguno más bajo. `?rol=admin`: el Inicio con las cifras en Cormorant; las de alerta con su franja naranja (muestreo idéntico).

- [ ] **Step 5: Suite y commit**

```bash
git add public/barriles/index.html test/barriles-portada.test.ts test/barriles-estilo.test.ts
git commit -m "feat(barriles): portada del operario e Inicio del programador en piedra y tinta, sin achicar los botones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Infraestructura de avisos y diálogos (+ freno del servidor y arranque)

**Files:**
- Create: `public/barriles/js/dialogos.js`, `test/barriles-sin-ventanas-nativas.test.ts`
- Modify: `vitest.config.ts`, `test/env.d.ts`, `public/barriles/index.html` (`<head>`, `msgPerdidas`, `push`, `sincronizar`, `descartarPorSoloLectura`, `pasarASoloLectura`, `escRecuperarPendientes`)

**Interfaces:**
- Produces `js/dialogos.js` (script clásico, globales): `dlgAvisar(texto, op?) → {cerrar()}`, `dlgInformar(op) → Promise<void>`, `dlgConfirmar(op) → Promise<boolean>`, `dlgPedir(op) → Promise<string|null>` (mismas opciones que `CI.*`; `CI.informar` existe desde la Etapa 2).
- Produces `confirmacionPerdidas(info) → {titulo, texto, si, no, peligro}` (reemplaza a `msgPerdidas`).
- Produces binding de test `env.BARRILES_JS: Record<string, string>` (clave `js/<archivo>.js`).
- **Nombre:** NO se llaman `confirmar`/`avisar`: el script principal ya tiene `confirmar` local en `push(confirmar)`, `sincronizar` y `editarCelda`.

Reglas para cada reemplazo (valen también en las Tasks 7 y 8):
1. Si la función no es `async`, se hace `async`. Si es un listener (`addEventListener('click', () => {…})` o `.onclick = () => {…}`), pasa a `async () => {…}`. Un `e.preventDefault()`/`e.stopPropagation()` queda **antes** del primer `await`.
2. Después de un `await`, todo objeto capturado antes (`b`, `p`, `box`, `o`, `t`, el `plan`) **se vuelve a buscar por id** en `estado`: mientras la pregunta está abierta, `sondear()` (cada 3 s) puede adoptar una copia nueva del servidor y dejar los objetos viejos sueltos.
3. Un aviso que va antes de `cerrarModal()` se pone **después**.
4. Los textos que llevaban `\n` siguen andando (`CI` usa `white-space: pre-line`). Los que se armaban con `escapeHtml` para un `alert` lo pierden: `CI` escribe con `textContent`.
5. `avisar`: falta un dato o algo que se ve y se va. `informar`: hay que leerlo sí o sí. `confirmar`: decisión, `si` con la acción; destructivo con `peligro: true`.

- [ ] **Step 1: Binding `BARRILES_JS`**

En `vitest.config.ts`, después del bloque de `LOTES_JS`:

```ts
// Barriles: todo su js/ (Etapa 3 de la estética: que no queden alert/confirm/prompt).
const dirBarrilesJs = path.join(import.meta.dirname, 'public/barriles/js');
const BARRILES_JS: Record<string, string> = Object.fromEntries(
  readdirSync(dirBarrilesJs).filter((f) => f.endsWith('.js')).map((f) => ['js/' + f, leer('public/barriles/js/' + f)]),
);
```

y agregar `BARRILES_JS` a `bindings`. En `test/env.d.ts`, dentro de `ProvidedEnv`, después de `LOTES_JS`:

```ts
    // Barriles (Etapa 3 de la estética): su js/ por archivo ('js/sync.js', 'js/dialogos.js', …).
    BARRILES_JS: Record<string, string>;
```

- [ ] **Step 2: Test que falla**

`test/barriles-sin-ventanas-nativas.test.ts`:

```ts
/**
 * Barriles no usa alert/confirm/prompt: frenan la pantalla (y la pistola), no
 * se pueden diseñar y en el celular se leen mal. Todo pasa por js/dialogos.js
 * (que delega en CI.* de shared/dialogo.js y solo cae a las nativas si ese
 * script no cargó).
 *
 * PENDIENTES_EN_INDEX baja tarea a tarea (Etapa 3 de la estética):
 * 69 → 64 (Task 6) → 27 (Task 7) → 0 (Task 8).
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const PENDIENTES_EN_INDEX = 64;
const PERMITIDO = 'js/dialogos.js';

const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const NATIVAS = /(?:^|[^\w$.])(?:alert|confirm|prompt)\s*\(|window\.(?:alert|confirm|prompt)\s*\(/gm;
const scripts = (html: string) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');

describe('Barriles sin ventanitas nativas', () => {
  it('en index.html quedan exactamente las pendientes', () => {
    expect((sinComentarios(scripts(env.INDEX_HTML_BARRILES)).match(NATIVAS) || []).length).toBe(PENDIENTES_EN_INDEX);
  });

  it('ningún archivo de js/ (salvo dialogos.js) llama a alert/confirm/prompt', () => {
    const con = Object.entries(env.BARRILES_JS)
      .filter(([f, src]) => f !== PERMITIDO && (sinComentarios(src).match(NATIVAS) || []).length > 0)
      .map(([f]) => f);
    expect(con).toEqual([]);
  });

  it('dialogos.js se carga antes del script principal', () => {
    const html = env.INDEX_HTML_BARRILES;
    const i = html.indexOf('<script src="js/dialogos.js"></script>');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(html.search(/<script>\r?\n'use strict';/));
  });
});
```

Run: `npx vitest run test/barriles-sin-ventanas-nativas.test.ts`
Expected: FAIL (cuenta 69; no existe `dialogos.js`).

- [ ] **Step 3: `public/barriles/js/dialogos.js`**

```js
/* ===== Mapa de Barriles — avisos y diálogos (Etapa 3 de la estética) =====
 * Puerta única a CI.avisar / CI.informar / CI.confirmar / CI.pedir
 * (public/shared/dialogo.js, lo inyecta el servidor antes que la página). Si
 * por algo no cargó, cae a las ventanitas del navegador: mejor fea que muda.
 * Es el ÚNICO archivo de Barriles que puede llamar a alert/confirm/prompt
 * (test/barriles-sin-ventanas-nativas.test.ts).
 *
 * Script clásico: funciones globales con prefijo dlg (el script principal ya
 * tiene variables locales llamadas `confirmar`).
 *
 * Cuándo usar cada una:
 *  - dlgAvisar: algo que se ve y se va solo (falta un dato, salió bien). NO
 *    toma el foco: la pistola sigue escribiendo en el escáner.
 *  - dlgInformar: una noticia que hay que leer sí o sí (no se guardó, sin cámara).
 *  - dlgConfirmar: una decisión. `si` dice la acción ("Borrar orden"); lo
 *    destructivo con `peligro: true` (el foco arranca en "no": un Enter de la
 *    pistola no confirma).
 *  - dlgPedir: un dato. */
'use strict';

function dlgCI() { return (window.CI && window.CI.confirmar) ? window.CI : null; }
function dlgPlano(op) { return typeof op === 'string' ? op : [op.titulo, op.texto].filter(Boolean).join('\n\n'); }

/** op.tipo: 'ok' | 'mal' | 'info'; op.deshacer: función (agrega el botón Deshacer). */
function dlgAvisar(texto, op) {
  const c = dlgCI();
  if (c) return c.avisar(texto, op || {});
  window.alert(texto);
  return { cerrar() {} };
}

async function dlgInformar(op) {
  const c = dlgCI();
  if (c) return c.informar(op);
  window.alert(dlgPlano(op));
}

async function dlgConfirmar(op) {
  const c = dlgCI();
  if (c) return c.confirmar(op);
  return window.confirm(dlgPlano(op));
}

async function dlgPedir(op) {
  const c = dlgCI();
  if (c) return c.pedir(op);
  const r = window.prompt(dlgPlano(op), (op.campo && op.campo.valor) || '');
  return r == null ? null : r.trim();
}
```

En `<head>` de `public/barriles/index.html`, después de `<script src="js/sync.js"></script>`: `<script src="js/dialogos.js"></script>`.

- [ ] **Step 4: El freno del servidor (412), sin segunda pregunta encima**

Reemplazar `msgPerdidas` entera (~1561) por:

```js
// Pregunta cuando el servidor frena un borrado grande (respuesta 412).
// "Descartar lo mío" llama a adoptar(): descarta lo que esta pestaña no llegó a
// subir y baja la copia del servidor. Escape = lo mismo (igual que el Cancelar
// del confirm() de antes).
function confirmacionPerdidas(info) {
  const p = info.perdidas || { celdas: info.borradas || 0 };
  const partes = [];
  if (p.celdas) partes.push(p.celdas + ' casillero(s) del mapa');
  if (p.inventario) partes.push(p.inventario + ' registro(s) del inventario');
  if (p.escaneos) partes.push(p.escaneos + ' orden(es) del escáner');
  if (p.palets) partes.push(p.palets + ' casillero(s) de palets');
  if (p.carteles) partes.push(p.carteles + ' cartel(es) de revisión');
  if (p.pedidos) partes.push(p.pedidos + ' pedido(s) de rótulos');
  if (p.tanques) partes.push(p.tanques + ' escaneo(s) viejos');
  if (p.revisiones) partes.push(p.revisiones + ' pendiente(s) viejos');
  if (p.ediciones) partes.push(p.ediciones + ' corrección(es) viejas');
  return {
    titulo: 'Este cambio borra datos',
    texto: 'Borra ' + (partes.join(', ') || 'datos ya cargados') + '.\n\n' +
      'Si era tu intención, borralos. Si no, se descarta lo que cargaste y todavía no se subió, y se baja de nuevo la copia del servidor.',
    si: 'Borrar igual', no: 'Descartar lo mío', peligro: true,
  };
}
```

En `push` (~1611), reemplazar la rama `freno`:

```js
    } else if (tipo === 'freno') {
      // pushEnCurso sigue en true mientras se pregunta: si no, sondear() vuelve
      // a subir, recibe otro 412 y abre una segunda pregunta encima.
      const borrar = await dlgConfirmar(confirmacionPerdidas(r.datos || {}));
      pushEnCurso = false;
      if (borrar) await push(true);
      else { escOlvidarPendientes(); await bajarYAdoptar(); }   // eligió descartar lo no subido
      return;
```

En `sincronizar` (~1731), dentro del `for` (ya es `async`; `sincronizando` sigue en true mientras espera):

```js
      if (t === 'freno') {
        if (await dlgConfirmar(confirmacionPerdidas(r.datos || {}))) { confirmar = true; continue; }
```

(El resto de la rama queda igual.)

- [ ] **Step 5: Solo lectura y arranque**

`descartarPorSoloLectura` (~1494): el aviso no se repite en ráfaga ni se apila:

```js
let avisoLecturaTs = 0, avisoLecturaAbierto = false;
async function descartarPorSoloLectura() {
  if (!avisoLecturaAbierto && Date.now() - avisoLecturaTs > 4000) {
    avisoLecturaTs = Date.now(); avisoLecturaAbierto = true;
    dlgInformar({ titulo: 'Solo lectura', texto: MSG_SOLO_LECTURA }).then(() => { avisoLecturaAbierto = false; });
  }
  await bajarYAdoptar();
}
```

(Reemplaza también la línea `let avisoLecturaTs = 0;` de arriba.)

`pasarASoloLectura` (~1513): `alert('El servidor no acepta…' + (…))` → `dlgInformar({ titulo: 'Quedaste en solo lectura', texto: 'El servidor no acepta cambios de tu usuario: quedó de solo lectura en el Mapa de Barriles.' + (habiaPendiente ? '\n\nLo que cargaste desde la última sincronización NO se guardó. Pedile a un administrador permiso de edición.' : '') });` (sin `await`: la copia del servidor se baja mientras se lee).

`escRecuperarPendientes` (~5919): `alert(\`En este equipo quedaron …\`)` → `dlgInformar({ titulo: 'Órdenes recuperadas', texto: \`En este equipo quedaron ${plan.agregar.length + plan.editar.length} orden(es) del escáner que se guardaron pero no llegaron al servidor (la página se cerró o recargó antes de que confirmara): ${ots}.\n\nYa se volvieron a cargar. Revisalas en el historial del escáner.\` });`

- [ ] **Step 6: Tests**

Run: `npx vitest run test/barriles-sin-ventanas-nativas.test.ts test/barriles-pantalla.test.ts test/barriles-sync.test.mjs test/inyeccion.test.ts`
Expected: PASS (cuenta 64).

- [ ] **Step 7: En el navegador**

Recargar `?rol=admin`:
- Consola: `await dlgInformar({titulo:'Prueba',texto:'x'})` abre un diálogo con un botón "Entendido"; `dlgAvisar('hola')` sale abajo y se va solo.
- Freno: en la consola, envolver `window.fetch` para que `POST /barriles/api/estado` devuelva `412 {"perdidas":{"celdas":40}}` una sola vez (después, pasar al fetch real). Mover un barril en el mapa: aparece "Este cambio borra datos" con "Borrar igual" en rojo y el foco en "Descartar lo mío". Esperar 10 s sin contestar: **no** aparece una segunda pregunta (en Network no salen más POST). Escape descarta (la pantalla vuelve a la copia del servidor).
- `?rol=lector`: tocar cualquier carga dos veces seguidas: un solo diálogo "Solo lectura".

- [ ] **Step 8: Suite y commit**

```bash
git add vitest.config.ts test/env.d.ts public/barriles/js/dialogos.js public/barriles/index.html test/barriles-sin-ventanas-nativas.test.ts
git commit -m "feat(barriles): diálogos propios (dlg*), freno del servidor sin preguntas apiladas, solo lectura y órdenes recuperadas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Escáner, cámara, mapa y asociar (37) + el ✕ con Deshacer

**Files:**
- Modify: `public/barriles/index.html`, `test/barriles-sin-ventanas-nativas.test.ts` (`PENDIENTES_EN_INDEX = 27`)

**Interfaces:**
- Consumes: `dlgAvisar`, `dlgInformar`, `dlgConfirmar` (Task 6).
- Changes: `procesarScan(bruto)` pasa a `async → Promise<void>`; sus llamadores de cámara (`posTipearConfirmar`, `detectadoPorCamara`, `confirmarCam`) pasan a `async` y hacen `await procesarScan(…)` antes de `reflejarEnCamara()`. `escEditarOrden`, `escGuardar`, `escCancelar`, `escBorrarOrden`, `barAsociarManual` pasan a `async` (nadie usa su valor de retorno; los `onclick="escEditarOrden(…)"` y `onclick="escBorrarOrden(…)"` siguen empezando así: el CSS de solo lectura los busca con `[onclick^=…]`).
- Produces: `escQuitar(i)` con Deshacer; `escEnfocarEscaner()`.

- [ ] **Step 1: Bajar la cuenta del test**

En `test/barriles-sin-ventanas-nativas.test.ts`: `const PENDIENTES_EN_INDEX = 64;` → `27`.
Run: `npx vitest run test/barriles-sin-ventanas-nativas.test.ts` → FAIL (cuenta 64).

- [ ] **Step 2: `procesarScan`, con la cámara en pausa mientras pregunta**

Arriba de `function procesarScan(bruto) {` (~3871): `let preguntaScanAbierta = false;   // con una pregunta abierta, la cámara no lee`.

Reemplazar `function procesarScan(bruto) {` por `async function procesarScan(bruto) {`, `const b = boxSesion();` por `let b = boxSesion();`, y los dos `if (!confirm(…)) {…}` por:

```js
  const ocupanteDestino = b.celdas[clave];
  if (ocupanteDestino && ocupanteDestino !== 'HUECO' && ocupanteDestino !== num) {
    preguntaScanAbierta = true;
    const reemplazar = await dlgConfirmar({ titulo: 'Posición ocupada',
      texto: `Esa posición ya tiene el barril ${ocupanteDestino}. ¿Reemplazarlo por ${num}?`,
      si: 'Reemplazar', no: 'Dejar el que está', peligro: true });
    preguntaScanAbierta = false;
    if (!reemplazar) {
      mostrarScan('aviso', `Se mantuvo el barril <b>${escapeHtml(ocupanteDestino)}</b> en esa posición. No se cargó <b>${escapeHtml(num)}</b>.`);
      return;
    }
    // mientras preguntaba pudo llegar una copia nueva del servidor o cambiar el destino
    if (!sesion || !sesion.destino || claveSesion() !== clave) { mostrarScan('aviso', 'Cambió la posición mientras preguntaba. Volvé a leer el barril.'); return; }
    b = boxSesion();
  }
  let previa = buscarUbicacion(num);
  if (previa) {
    const dondePrevia = `${previa.box.nombre} col ${previa.col} ${LADO_NOMBRE[previa.lado]} fila ${previa.fila}`;
    preguntaScanAbierta = true;
    const mover = await dlgConfirmar({ titulo: 'Barril ya ubicado',
      texto: `El barril ${num} ya está ubicado en ${dondePrevia}. ¿Moverlo a la posición actual?`,
      si: 'Mover acá', no: 'No mover', peligro: true });
    preguntaScanAbierta = false;
    if (!mover) {
      mostrarScan('aviso', `Barril <b>${escapeHtml(num)}</b> ya estaba en ${escapeHtml(dondePrevia)}. No se movió.`);
      return;
    }
    if (!sesion || !sesion.destino || claveSesion() !== clave) { mostrarScan('aviso', 'Cambió la posición mientras preguntaba. Volvé a leer el barril.'); return; }
    b = boxSesion();
    previa = buscarUbicacion(num);
    if (previa) delete previa.box.celdas[previa.col + '-' + previa.fila + '-' + previa.lado];
  }
```

(Lo que sigue — `b.celdas[clave] = num;`, `historial.push(…)` con `previa`, etc. — queda igual.)

Llamadores:
- `.inp-libre` keydown (~3807): `procesarScan(bruto);` queda (última línea; no espera).
- `posTipearConfirmar` (~4550) → `async function posTipearConfirmar()`, y `else { procesarScan(v); reflejarEnCamara(); }` → `else { await procesarScan(v); reflejarEnCamara(); }`.
- `detectadoPorCamara` (~4612) → `async`, primera línea agregar `if (preguntaScanAbierta) return;`, y `else { procesarScan(codigo); reflejarEnCamara(); }` → `else { await procesarScan(codigo); reflejarEnCamara(); }`.
- `confirmarCam` (~4647) → `async function confirmarCam()`, `procesarScan(c);` → `await procesarScan(c);`.

- [ ] **Step 3: El ✕ que saca un barril de la orden, con Deshacer**

En `escRender` (~5211), el botón:
`<td><button class="btn sec" style="padding:3px 9px;" onclick="escQuitar(${i})">✕</button></td></tr>`
→ `<td><button type="button" class="btn sec esc-quitar" onclick="escQuitar(${i})" aria-label="Quitar ${escapeHtml(c)} de la orden">✕</button></td></tr>`

CSS, al lado de `.btn.esc-vencida`: `.esc-quitar { padding: 3px 9px; }` (mismo tamaño que el `style` de antes; la Task 9 lo agranda en pantallas táctiles).

Reemplazar `escQuitar` entera por:

```js
let escAvisoQuitar = null;   // el aviso con Deshacer de la última ✕
// Después de tocar ✕ (o Deshacer) el foco quedaba en body y la pistola ya no
// escribía en #escInput. Con la cámara abierta no: abriría el teclado encima.
function escEnfocarEscaner() {
  if ($('escZona').style.display !== 'none' && !$('overlayCamaraEsc').classList.contains('abierto')) $('escInput').focus();
}
function escQuitar(i) {
  const sesionDeAntes = escSesion;
  const num = escSesion.codigos[i];
  if (num === undefined) return;
  escSesion.codigos.splice(i, 1);
  escAutoLote(); escRender(); escGuardarBorrador();
  escEnfocarEscaner();
  if (escAvisoQuitar) escAvisoQuitar.cerrar();
  escAvisoQuitar = dlgAvisar(`Quitaste ${num} de la orden.`, {
    deshacer: () => {
      escAvisoQuitar = null;
      if (escSesion !== sesionDeAntes) return;           // se guardó, se canceló o se abrió otra orden
      if (escSesion.codigos.includes(num)) return;       // lo volvieron a escanear mientras tanto
      escSesion.codigos.splice(Math.min(i, escSesion.codigos.length), 0, num);
      escAutoLote(); escRender(); escGuardarBorrador();
      escFeedbackMostrar('ok', `↩ Volvió <b>${escapeHtml(num)}</b> a la orden.`, false);
      escEnfocarEscaner();
    },
  });
}
```

En `escLimpiarSesion` (~5436), primera línea: `if (escAvisoQuitar) { escAvisoQuitar.cerrar(); escAvisoQuitar = null; }`. En `escDeshacer` (~5220), después de `escFeedbackMostrar(…)`: `escEnfocarEscaner();`.

- [ ] **Step 4: El resto de esta tanda**

| # | Función (~línea) | Antes | Después |
|---|---|---|---|
| 21 | `iniciarModoLibre` (3676) | `alert('Primero importá el inventario (pestaña 📋 Inventario).')` | `dlgAvisar('Primero importá el inventario (Barriles → Inventario).', { tipo: 'mal' })` |
| 22 | `iniciarModoLibre` (3677) | `alert('Primero creá al menos un box (pestaña 📦 Boxes).')` | `dlgAvisar('Primero creá al menos un box (Más → Boxes y palets).', { tipo: 'mal' })` |
| 23 | click `.cam-libre` (3823) | `alert('Tocá primero una celda en el mapa.')` | `dlgAvisar('Tocá primero una celda en el mapa.', { tipo: 'mal' })` |
| 26 | `iniciarModoLibreTanque` (4093) | `alert('Primero creá al menos un palet (pestaña 📦 Boxes y Palets).')` | `dlgAvisar('Primero creá al menos un palet (Más → Boxes y palets).', { tipo: 'mal' })` |
| 27 | `$('btnQuitarBarril').onclick` (4326) | `if (!confirm(msg)) return;` | `.onclick = async () => {` y `if (!await dlgConfirmar({ titulo: estado.modoLote ? 'Vaciar posición' : 'Quitar del mapa', texto: msg, si: estado.modoLote ? 'Vaciar posición' : 'Quitar del mapa', peligro: true })) return;` y después del await volver a buscar el box: `const boxVivo = estado.boxes.find(x => x.id === box.id); if (!boxVivo) { cerrarModal(); return; }` y usar `boxVivo` en lo que sigue |
| 28 | `$('btnQuitarTanque').onclick` (4350) | `if (!confirm(\`¿Quitar el tanque ${num} del mapa? (no afecta su asociación de lote)\`)) return;` | `async`; `if (!await dlgConfirmar({ titulo: 'Quitar del mapa', texto: \`El tanque ${num} sale del mapa. No afecta su asociación de lote.\`, si: 'Quitar del mapa', peligro: true })) return;` y volver a buscar el palet por id (`estado.palets.find(x => x.id === p.id)`) |
| 32 | `posTipearAbrir` (4538) | `alert('Primero activá "👆 Cargar tocando" en el mapa.')` | `dlgAvisar('Primero activá "Cargar tocando" en el mapa.', { tipo: 'mal' })` |
| 33 | `posTipearAbrir` (4539) | `alert('Primero tocá en el mapa el barril o hueco donde cargar.')` | `dlgAvisar('Primero tocá en el mapa el barril o hueco donde cargar.', { tipo: 'mal' })` |
| 34 | `abrirCamara` (4574) | `alert('Primero activá "👆 Cargar tocando" en el mapa y tocá la posición.')` | `dlgAvisar('Primero activá "Cargar tocando" en el mapa y tocá la posición.', { tipo: 'mal' })` |
| 35, 51, 54, 64 | `abrirCamara` (4576), `escAbrirCamara` (5945), `paletAbrirCamara` (6018), `barAbrirCamara` (6711) | `alert(msgSinCamara())` | `dlgInformar({ titulo: 'Sin cámara', texto: msgSinCamara() })` |
| 36, 52, 55, 65 | los cuatro `catch` de cámara (4607, 5971, 6043, 6736) | `alert('No pude acceder a la cámara: ' + e.message + '\n\nVerificá…')` | `dlgInformar({ titulo: 'No pude abrir la cámara', texto: e.message + '\n\nVerificá que diste permiso de cámara y que abriste la app por https:// (Más → Celular).' })` |
| 37 | `escAgregar` (5179) | `alert('Primero elegí el tipo de operación (Vaciado, Llenado o Llenado y Vaciado).')` | `dlgAvisar('Primero elegí el tipo de operación (Vaciado, Llenado o Llenado y Vaciado).', { tipo: 'mal' })` |
| 38 | `escEditarOrden` (5284) | `alert('Esa orden ya no está.')` | `dlgAvisar('Esa orden ya no está.', { tipo: 'mal' })` |
| 39 | `escEditarOrden` (5291) | `if (… && !confirm('Tenés una carga sin guardar con ' + n + ' barriles. …¿Seguir igual?')) return;` | `async function escEditarOrden`; `if (… && !await dlgConfirmar({ titulo: 'Carga sin guardar', texto: 'Tenés una carga sin guardar con ' + escSesion.codigos.length + ' barriles. Si editás esta orden, esa carga se pierde.', si: 'Editar igual', no: 'Volver', peligro: true })) return;` |
| 40 | `escEditarOrden` (5294) | `confirm('Esta orden figura como pasada al inventario …¿Editarla igual?')` | `!await dlgConfirmar({ titulo: 'Orden marcada', texto: 'Esta orden figura como pasada al inventario (marca puesta a mano).\n\nSi le cambiás los datos, esa marca puede quedar diciendo algo que ya no es.', si: 'Editar igual', no: 'Volver' })`. Después de los dos `await`, volver a buscar la orden: `const oViva = estado.escaneos.find(x => x.id === o.id); if (!oViva || !escPuedeEditar(oViva)) { dlgAvisar('Esa orden ya no se puede editar.', { tipo: 'mal' }); escDibujarHistorial(); return; }` y seguir con `oViva` (usar el mismo nombre de la función de permiso que ya llama `escEditarOrden` al principio) |
| 41 | `escGuardar` (5316) | `alert(MSG_SOLO_LECTURA)` | `dlgInformar({ titulo: 'Solo lectura', texto: MSG_SOLO_LECTURA })` |
| 42 | `escGuardar` (5317) | `alert('Elegí el tipo de operación.')` | `dlgAvisar('Elegí el tipo de operación.', { tipo: 'mal' })` |
| 43 | `escGuardar` (5318) | `alert('No escaneaste ningún barril todavía.')` | `dlgAvisar('No escaneaste ningún barril todavía.', { tipo: 'mal' })` |
| 44 | `escGuardar` (5328) | `if (!confirm('⚠ Falta completar: ' + faltan.join(', ') + '.\n\n¿Querés guardar la orden igual?')) {…}` | `async function escGuardar`; `if (!await dlgConfirmar({ titulo: 'Faltan datos', texto: 'Falta completar: ' + faltan.join(', ') + '.', si: 'Guardar igual', no: 'Completar' })) {…}` (el bloque que enfoca el campo que falta queda). Después del await, volver a leer `fecha`, `ot` y `lote` de sus campos (mismas líneas con que se leen arriba) |
| 45 | `escGuardar` (5341) | `alert('Esa orden ya no está: la borraron desde otro dispositivo …')` | `dlgInformar({ titulo: 'La orden ya no está', texto: 'La borraron desde otro dispositivo mientras la editabas.\n\nLo que cargaste sigue acá. Si lo querés conservar, tocá "Cancelar edición" y guardalo como orden nueva.' })` |
| 46 | `escCancelar` (5453) | `if (escSesion.codigos.length && !confirm(editando ? '…' : '…')) return;` | `async function escCancelar`; `if (escSesion.codigos.length && !await dlgConfirmar(editando ? { titulo: 'Cancelar la edición', texto: 'La orden queda como estaba.', si: 'Cancelar edición', no: 'Seguir editando' } : { titulo: 'Descartar la orden', texto: 'Se pierden los ' + escSesion.codigos.length + ' barriles escaneados.', si: 'Descartar', no: 'Seguir cargando', peligro: true })) return;` |
| 48 | `escBorrarOrden` (5862) | `if (!confirm(\`¿Borrar la orden ${o.ot \|\| '(sin OT)'} de ${o.codigos.length} barriles? No se puede deshacer.\`)) return;` | `async function escBorrarOrden`; `if (!await dlgConfirmar({ titulo: 'Borrar orden', texto: \`La orden ${o.ot \|\| '(sin OT)'} de ${o.codigos.length} barriles se borra. No se puede deshacer.\`, si: 'Borrar orden', peligro: true })) return;` (después filtra por id: sirve) |
| 50 | `escAbrirCamara` (5943) | `alert('Primero elegí el tipo de operación.')` | `dlgAvisar('Primero elegí el tipo de operación.', { tipo: 'mal' })` |
| 53 | `paletAbrirCamara` (6016) | `alert('Primero tocá un casillero del palet.')` | `dlgAvisar('Primero tocá un casillero del palet.', { tipo: 'mal' })` |
| 57 | `barAsociarManual` (6223) | `alert('Completá el número de la vasija y el lote.')` | `barFeedbackMostrar('err', 'Completá el número de la vasija y el lote.'); dlgAvisar('Completá el número de la vasija y el lote.', { tipo: 'mal' });` (si `barFeedbackMostrar` tiene otra firma, usar solo `dlgAvisar`) |
| 58 | `barAsociarManual` (6226) | `if (!confirm(\`⚠ El inventario dice que ${num} está ${r.estadoInv} con lote ${r.loteInv}.\n\nLeíste ${lote}. ¿Lo piso?\`)) return;` | `async function barAsociarManual`; `if (!await dlgConfirmar({ titulo: 'Lote distinto', texto: \`El inventario dice que ${num} está ${r.estadoInv} con lote ${r.loteInv}. Leíste ${lote}.\`, si: 'Pisar con ' + lote, no: 'Dejar ' + r.loteInv, peligro: true })) return;` |
| 59 | `barAsociarManual` (6229) | `if (r.error) { beep(true); alert(r.error); return; }` | `if (r.error) { beep(true); dlgAvisar(r.error, { tipo: 'mal' }); return; }` |
| 60 | `barMarcarVacia` (6246) | `alert('Poné el número de la vasija.')` | `dlgAvisar('Poné el número de la vasija.', { tipo: 'mal' })` |
| 61 | `barMarcarVacia` (6248) | `alert(r.error)` | `dlgAvisar(r.error, { tipo: 'mal' })` |

Total de la tanda: 37 (#21-28, #32-46, #48, #50-55, #57-61, #64, #65; el #56 va en la Task 8). El test de la cuenta tiene que dar 27 (los de la Task 8).

- [ ] **Step 5: Tests**

Run: `npx vitest run test/barriles-sin-ventanas-nativas.test.ts test/barriles-pantalla.test.ts test/barriles-colores-js.test.mjs test/barriles-orden-editable.test.mjs test/barriles-registro.test.mjs`
Expected: PASS (cuenta 27).

- [ ] **Step 6: En el navegador**

`?rol=editor`, Llenado / vaciado:
- Elegir Llenado, enfocar `#escInput`, escribir `2180036` + Enter tres veces con códigos distintos. Tocar ✕ del segundo: sale "Quitaste … de la orden." con **Deshacer**, y `document.activeElement.id === 'escInput'`. Tocar Deshacer: el barril vuelve **en su lugar** (mismo índice) y el foco vuelve a `#escInput`.
- Con un aviso a la vista, escribir otro código + Enter: entra a la orden (el aviso no se roba el foco).
- ✕ y después "Cancelar" (descartar) antes de los 8 s: el Deshacer desaparece.
- "Guardar orden" sin OT: "Faltan datos" con "Guardar igual" / "Completar"; Completar enfoca `#escOT`.
- `?rol=admin`, Mapa → Cargar tocando → tocar una celda ocupada → escribir otro código en `.inp-libre` + Enter: "Posición ocupada" con el foco en "Dejar el que está"; un Enter **no** reemplaza. Reemplazar: queda cargado y el foco vuelve al campo.
- Muestreo idéntico (`?rol=admin`).

- [ ] **Step 7: Suite y commit**

```bash
git add public/barriles/index.html test/barriles-sin-ventanas-nativas.test.ts
git commit -m "feat(barriles): sin ventanitas en escáner, cámara, mapa y asociar; el ✕ de la orden da Deshacer y no le roba el foco a la pistola

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Las ventanitas que quedan (27)

**Files:**
- Modify: `public/barriles/index.html`, `test/barriles-sin-ventanas-nativas.test.ts` (`PENDIENTES_EN_INDEX = 0`)

**Interfaces:**
- Consumes: `dlgAvisar`, `dlgInformar`, `dlgConfirmar`, `dlgPedir` (Task 6).
- Changes a `async`: listener de `#btnImportar`, `guardarCelda`, `deshacerTanda`, los listeners de change/click de `dibujarTablaBoxes` y `dibujarTablaPalets`.

- [ ] **Step 1: Bajar la cuenta del test**

`PENDIENTES_EN_INDEX = 27` → `0`. Run → FAIL (cuenta 27).

- [ ] **Step 2: Reemplazos**

| # | Función (~línea) | Antes | Después |
|---|---|---|---|
| 5 | `confirmarMigracion` (1983) | `alert(\`✅ Listo. ${n} vasijas quedaron con fecha. …\`)` | `dlgAvisar(\`Listo: ${n} vasijas quedaron con fecha. Desde ahora gana lo último que pasó.\`, { tipo: 'ok', ms: 6000 })` |
| 6 | click `#rotImprimir` (2744) | `alert('Escribí el lote y la cantidad de barriles.')` | `dlgAvisar('Escribí el lote y la cantidad de barriles.', { tipo: 'mal' }); $('rotLote').focus();` |
| 7 | click `#btnImportar` (2933) | `if (!confirm(\`La planilla trae …¿Importar?\`)) return;` | listener `async`; `if (!await dlgConfirmar({ titulo: 'Importar planilla', texto: \`La planilla trae ${inv.length} vasijas:\n\n• ${plan.nuevas.length} nuevas, se agregan\n• ${plan.ficha.length} con cambios de ficha (capacidad, marca…), se actualizan\n• ${plan.carteles.length} dicen otro estado o lote que la app: quedan con cartel para revisar\n• ${plan.iguales} coinciden con la app\n\` + (plan.faltan.length ? \`• ${plan.faltan.length} de la app no están en la planilla: NO se borran\n\` : ''), si: 'Importar' })) return;` y después del await **volver a calcular** el plan con la misma llamada con que se calculó arriba (`plan = planImportacion(…)`, cambiando su `const` por `let`) |
| 8 | `aplicarOpcionCartel` (3105) | `alert(res.error)` | `dlgAvisar(res.error, { tipo: 'mal' })` |
| 9 | `guardarCelda` (3130) | `const lote = prompt(\`¿Con qué lote queda ${est} la vasija ${num}?\`);` | `async function guardarCelda`; `const lote = await dlgPedir({ titulo: \`Lote de la vasija ${num}\`, texto: \`Para dejarla ${est} hace falta el lote.\`, si: 'Guardar', campo: { tipo: 'text', placeholder: 'ej: 25006' } });` (el `if (!lote \|\| !lote.trim())` que sigue queda) |
| 10 | `guardarCelda` (3138) | `alert('Una vasija VACÍA no tiene cosecha. Primero cargale el lote.')` | `dlgAvisar('Una vasija VACÍA no tiene cosecha. Primero cargale el lote.', { tipo: 'mal' })` |
| 11 | `guardarCelda` (3142) | `if (res.error) alert(res.error);` | `if (res.error) dlgAvisar(res.error, { tipo: 'mal' });` |
| 12 | `confirmarAlta` (3413) | `alert(\`✅ Se ${…} de alta ${n} ${…}.\`)` | `dlgAvisar(\`Se ${n === 1 ? 'dio' : 'dieron'} de alta ${n} ${n === 1 ? 'vasija' : 'vasijas'}.\`, { tipo: 'ok' })` (después de cerrar el modal) |
| 13 | `deshacerTanda` (3473) | `alert('Pasaron los 15 minutos: …')` | `async function deshacerTanda`; `dlgInformar({ titulo: 'Ya no se puede deshacer', texto: 'Pasaron los 15 minutos: esta tanda ya no se puede deshacer entera. Para sacar una vasija, usá "dar de baja" en su fila.' })` |
| 14 | `deshacerTanda` (3478) | `if (!confirm(avisoDeUso(…) + \`¿Deshacer el alta de …?\n\n\` + 'Salen del inventario …')) return;` | `if (!await dlgConfirmar({ titulo: 'Deshacer altas', texto: avisoDeUso(usoDeVasijas(t.nums, estado)) + \`Se deshace el alta de ${t.cuantas} ${t.cuantas === 1 ? 'vasija' : 'vasijas'} (${rango}). Salen del inventario en este teléfono y en los demás.\`, si: 'Deshacer altas', peligro: true })) return;` y después del await volver a mirar el plazo con la misma condición de arriba (la que dispara el #13): si ya venció, `dlgInformar(…)` del #13 y `return` |
| 15 | `deshacerTanda` (3486) | `alert(\`✅ Se … altas.\`)` | `dlgAvisar(\`Se ${r.marcadas === 1 ? 'deshizo' : 'deshicieron'} ${r.marcadas} ${r.marcadas === 1 ? 'alta' : 'altas'}.\`, { tipo: 'ok' })` |
| 16 | `confirmarBaja` (3547) | `alert(\`✅ La vasija ${n} se dio de baja.\`)` | `dlgAvisar(\`La vasija ${n} se dio de baja.\`, { tipo: 'ok' })` |
| 17 | change `input[data-id]` de `dibujarTablaBoxes` (3586) | `if (fuera.length && !confirm(\`Hay ${fuera.length} posiciones ocupadas …\`)) {…}` | listener `async`; `if (fuera.length && !await dlgConfirmar({ titulo: 'Achicar box', texto: \`Hay ${fuera.length} posiciones ocupadas fuera del nuevo tamaño.\`, si: 'Quitar del mapa', no: 'Dejar como estaba', peligro: true })) {…}` y después volver a buscar `b` por id en `estado.boxes` (si no está, `dibujarTablaBoxes(); return;`) |
| 18 | click `button[data-borrar]` de `dibujarTablaBoxes` (3595) | `if (!confirm(\`¿Borrar "${b.nombre}"…?\`)) return;` | `async`; `if (!await dlgConfirmar({ titulo: 'Borrar box', texto: \`Se borra "${b.nombre}"${ocup ? \` y sus ${ocup} barriles ubicados\` : ''}.\`, si: 'Borrar box', peligro: true })) return;` |
| 19 | change de `dibujarTablaPalets` (3631) | `confirm(\`Hay ${fuera.length} tanque(s) …\`)` | igual que #17 con `p`/`estado.palets`: `{ titulo: 'Achicar palet', texto: \`Hay ${fuera.length} tanque(s) ubicado(s) fuera del nuevo tamaño.\`, si: 'Quitar del mapa', no: 'Dejar como estaba', peligro: true }` |
| 20 | click borrar de `dibujarTablaPalets` (3640) | `confirm(\`¿Borrar "${p.nombre}"…?\`)` | `{ titulo: 'Borrar palet', texto: \`Se borra "${p.nombre}"${ocup ? \` y sus ${ocup} tanque(s) ubicado(s)\` : ''}.\`, si: 'Borrar palet', peligro: true }` |
| 29 | change `#archivoJSON` (4520, ya `async`) | `if (!confirm('Esto reemplaza el inventario y el mapa actuales …')) return;` | `if (!await dlgConfirmar({ titulo: 'Restaurar respaldo', texto: 'Esto reemplaza el inventario y el mapa actuales por los del respaldo.', si: 'Reemplazar con el respaldo', peligro: true })) return;` |
| 30 | igual (4523) | `alert('✅ Respaldo restaurado.')` | `dlgAvisar('Respaldo restaurado.', { tipo: 'ok' })` |
| 31 | igual, `catch` (4524) | `alert('El archivo no parece un respaldo válido.')` | `dlgAvisar('El archivo no parece un respaldo válido.', { tipo: 'mal' })` |
| 47 | `invConfirmarRevertir` (5844) | `alert('Deshacer parcial: ' + …)` | `dlgInformar({ titulo: 'Deshacer parcial', texto: res.revertidos + ' barriles volvieron atrás. ' + res.quedan.length + ' no se tocaron porque cambiaron después de esta orden: ' + res.quedan.map(q => q.num).join(', ') })` |
| 56 | `escExportar` (6082) | `alert('No hay órdenes registradas para exportar.')` | `dlgAvisar('No hay órdenes registradas para exportar.', { tipo: 'mal' })` |
| 62 | `barExportar` (6260) | `alert('No hay filas para exportar …')` | `dlgAvisar('No hay filas para exportar (probá limpiar la búsqueda o el filtro).', { tipo: 'mal' })` |
| 63 | `exportTodo` (6473) | `alert('Todavía no hay datos para exportar.')` | `dlgAvisar('Todavía no hay datos para exportar.', { tipo: 'mal' })` |
| 66 | `#btnDescargarDB` (6804, `async`) | `alert('Todavía no hay conexión con el servidor.\n…')` | `dlgInformar({ titulo: 'Sin conexión', texto: 'Todavía no hay conexión con el servidor.\nMientras tanto podés usar "⬇ Exportar respaldo", que baja lo que ves en esta pantalla.' })` |
| 67 | igual (6811) | `alert('La copia del servidor solo la puede bajar un administrador. …')` | `dlgInformar({ titulo: 'Solo administradores', texto: 'La copia del servidor solo la puede bajar un administrador.\n\nPodés usar "⬇ Exportar respaldo" o los exports a Excel, que bajan lo que ves en esta pantalla.' })` |
| 68 | igual (6814) | `alert('No pude generar la copia (error ' + r.status + ').')` | `dlgAvisar('No pude generar la copia (error ' + r.status + ').', { tipo: 'mal' })` |
| 69 | igual, `catch` (6824) | `alert('No pude descargar la copia: ' + e.message)` | `dlgAvisar('No pude descargar la copia: ' + e.message, { tipo: 'mal' })` |

Total: 27 (#5-20, #29-31, #47, #56, #62, #63, #66-69). `grep -nE "(^|[^\w$.])(alert|confirm|prompt)\s*\(" public/barriles/index.html` → nada (salvo comentarios).

- [ ] **Step 3: Tests**

Run: `npx vitest run test/barriles-sin-ventanas-nativas.test.ts test/barriles-pantalla.test.ts test/barriles-altas.test.mjs test/barriles-inventario.test.mjs test/barriles-colores-js.test.mjs`
Expected: PASS (cuenta 0).

- [ ] **Step 4: En el navegador**

`?rol=admin`:
- Barriles → Inventario: editar el estado de una vasija VACÍA a LLENO → "Lote de la vasija …" con un campo; Escape = no cambia; con lote, se guarda.
- Más → Boxes y palets: achicar un box con barriles fuera → "Achicar box" (foco en "Dejar como estaba"); Escape deja el tamaño como estaba.
- Más → Respaldos: elegir un JSON inválido → aviso "El archivo no parece un respaldo válido."
- Imprimir → Rótulos sin lote → aviso y el foco en el campo de lote.
- Todo diálogo se cierra con Escape y devuelve el foco al botón que lo abrió.

- [ ] **Step 5: Suite y commit**

```bash
git add public/barriles/index.html test/barriles-sin-ventanas-nativas.test.ts
git commit -m "feat(barriles): sin alert/confirm/prompt (inventario, altas, boxes, respaldos, exportes); importar recalcula después de preguntar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Celular

**Files:**
- Create: `test/barriles-celular.test.ts`
- Modify: `public/barriles/index.html` (meta viewport, `inputmode`, `scroll-x`, capas, safe-area, CSS de celular y táctil, botones del historial)

**Interfaces:**
- Produces la clase `.scroll-x` (`overflow-x:auto` dentro de su contenedor) y `.esc-hist-btn` (botones Ver/Editar/Borrar del historial del escáner).

Lo que se sabe que desborda o queda chico a 375 px (relevado en el `main` del 2026-10-19): `#opVistaSel` (sin wrap, ~400 px), `#buscarMapa` (`width:280px` dentro de una tarjeta de 273 px), `.reg-ficha` (3 columnas), las cabeceras de cámara (`space-between` sin wrap), `#tablaBoxes`/`#tablaPalets`/`#pedidosPendientes`/`#pedidosHechos` sin recuadro; el operario sigue con 28 px de margen a los costados (la regla de 700 px pierde contra `body.rol-operario main`); los inputs a 15.2 px (iOS hace zoom); el ✕ de la orden mide ~27 px y los botones del historial ~25 px.

- [ ] **Step 1: Test que falla**

`test/barriles-celular.test.ts`:

```ts
/**
 * Barriles en el celular: la página no se pasa del ancho, todo lo táctil mide
 * 44 px, los campos van a 16 px (sin zoom de iOS), el teclado según el dato, y
 * los pies de la cámara respetan la barra de gestos (safe-area).
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { cssDe } from '../scripts/css-reglas.mjs';

const html = env.INDEX_HTML_BARRILES;
// Todo el CSS sin espacios: así no importa cómo esté sangrado ni si hay espacio después de ":".
const plano = (s: string) => s.replace(/\s+/g, '');
const css = plano(cssDe(html));
const input = (id: string) => (html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) || [''])[0];

describe('Barriles en el celular', () => {
  it('viewport con viewport-fit=cover (si no, env(safe-area-*) vale 0)', () => {
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">');
  });

  it('pies y cabeceras de cámara con safe-area', () => {
    expect(css).toContain(plano('#escPieCam, #barPieCam, #paletPieCam, #pieCamara { padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));'));
    expect(css).toContain(plano('#escCabeceraCam, #barCabeceraCam, #paletCabeceraCam, #cabeceraCamara { padding-top: calc(12px + env(safe-area-inset-top, 0px));'));
  });

  it('teclado numérico donde el dato es número; OT y lote con letras', () => {
    expect(input('rotCantidad')).toContain('inputmode="numeric"');
    for (const id of ['posTipearInput', 'escTipearInput', 'barTipearInput']) expect(input(id), id).toContain('inputmode="numeric"');
    for (const id of ['escOT', 'escLote', 'barInputLote']) expect(input(id), id).not.toContain('inputmode="numeric"');
  });

  it('44 px en pantallas táctiles y 16 px en los campos del celular', () => {
    expect(css).toMatch(/@media\(pointer:coarse\)\{[^@]*\.esc-quitar\{min-width:var\(--ci-tap\);min-height:var\(--ci-tap\)/);
    expect(css).toMatch(/@media\(max-width:760px\)\{[^@]*input:not\(\[type=checkbox\]\):not\(\[type=radio\]\),select,textarea\{font-size:16px/);
  });

  it('cámara, pedidos y modal arriba de la barra de la plataforma (1050)', () => {
    expect(css).toContain(plano('#overlayCamara, #overlayCamaraEsc, #overlayCamaraBar, #overlayCamaraPalet, #overlayPedido, #modal { z-index: 1060; }'));
  });

  it('las tablas anchas tienen su recuadro con scroll', () => {
    for (const id of ['tablaBoxes', 'tablaPalets', 'pedidosPendientes', 'pedidosHechos']) {
      expect(html, id).toMatch(new RegExp(`<div class="scroll-x"><table class="datos" id="${id}"`));
    }
  });
});
```

Run: `npx vitest run test/barriles-celular.test.ts`
Expected: FAIL.

- [ ] **Step 2: HTML**

- Línea 5: `<meta name="viewport" content="width=device-width, initial-scale=1.0">` → `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`.
- `#rotCantidad` (~769): agregar `inputmode="numeric"`.
- `#posTipearInput` (~1252), `#escTipearInput` (~1280), `#barTipearInput` (~1306): agregar `inputmode="numeric"`.
- `#escOT`, `#escLote`, `#barInputLote`, `#barLoteInputCam`: **sin** `inputmode` (llevan letras en los datos reales).
- `#buscarMapa` (~1087): `style="width:280px;"` → `style="width:280px; max-width:100%;"`; `#buscar3d` (~1139): `style="width:260px;"` → `style="width:260px; max-width:100%;"`.
- `#tablaBoxes` (~942), `#tablaPalets` (~952), `#pedidosPendientes` (~1055), `#pedidosHechos` (~1058): envolver cada `<table …>…</table>` en `<div class="scroll-x">…</div>` (el `<div>` justo antes de `<table class="datos" id="…"`).
- Historial del escáner (~5541-5545, botones Ver / Editar / Borrar con `style="padding:4px 9px;"`): sacar ese `style` y agregar la clase `esc-hist-btn` (quedan `class="btn sec esc-hist-btn"` o la clase que ya tengan + `esc-hist-btn`; el `onclick` sigue empezando igual).

- [ ] **Step 3: CSS**

Después de las reglas de cámara (`#cabeceraCamara label`, ~348), agregar:

```css
  /* Celular: la barra de gestos y la muesca no tapan los botones de la cámara
     (con viewport-fit=cover; sin muesca, env() vale 0 y queda como antes). */
  #escPieCam, #barPieCam, #paletPieCam, #pieCamara { padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)); padding-left: calc(16px + env(safe-area-inset-left, 0px)); padding-right: calc(16px + env(safe-area-inset-right, 0px)); }
  #escCabeceraCam, #barCabeceraCam, #paletCabeceraCam, #cabeceraCamara { padding-top: calc(12px + env(safe-area-inset-top, 0px)); }
  /* Capas: la barra de la plataforma (#ciw-barra) es z 1050; los avisos de CI
     1100 y el velo sin conexión 9999 quedan arriba. */
  #overlayCamara, #overlayCamaraEsc, #overlayCamaraBar, #overlayCamaraPalet, #overlayPedido, #modal { z-index: 1060; }
  .scroll-x { overflow-x: auto; max-width: 100%; }
  .esc-hist-btn { padding: 4px 9px; }
```

Al final del `<style>`, **antes** del bloque "Papel igual que antes":

```css
  /* ===== Celular (≤ 760 px) =====
   * La página nunca se pasa del ancho: lo ancho se scrollea dentro de su
   * recuadro. Campos a 16 px para que iOS no haga zoom. */
  @media (max-width:760px){
    main, body.rol-operario main, body.rol-programador main { padding: 14px 16px 48px; }
    .app-barra { padding: 8px 16px; gap: 6px 12px; }
    .app-barra .marca { font-size: 23px; }
    #opTitulo { font-size: 22px; }
    #opVistaSel { padding: 8px 16px; }
    input:not([type=checkbox]):not([type=radio]), select, textarea { font-size: 16px; }
    button.btn, select, input:not([type=checkbox]):not([type=radio]) { min-height: var(--ci-tap); }
    #escCabeceraCam, #barCabeceraCam, #paletCabeceraCam { flex-wrap: wrap; }
    .reg-ficha { grid-template-columns: minmax(0, 1fr); }
    .esc-tipo { min-width: 0; flex: 1 1 100%; }
  }
  /* ===== Pantallas táctiles: blancos de 44 px. Con mouse no cambia nada. ===== */
  @media (pointer:coarse){
    .esc-quitar { min-width: var(--ci-tap); min-height: var(--ci-tap); margin-left: 12px; }
    .esc-hist-btn { min-width: var(--ci-tap); min-height: var(--ci-tap); margin: 2px 4px; }
    button.btn, button.btn.marca, .btn-rev, #navSubProg button, #mapaTipoSel button, #opVistaSel button, .reg-mes, .reg-barril,
    .tabs button[data-grupo], .mas-btn, .mas-menu button, #chipModoLote, .ped-cerrar, .link-rev, .reg-link, .con-num, .cam-btn-rotulo,
    .cam-tipear button, .leyenda .item, .resultado-busqueda .item-resultado { min-height: var(--ci-tap); }
    body.rol-operario .reg-acciones .btn, body.rol-operario .con-tabla .btn { min-height: var(--ci-tap); }
    .check-revisar input, #toggleModoLote input { width: 24px; height: 24px; }
  }
```

(`.reg-ficha` y `.reg-barril` son papel, pero el papel no se imprime en celular: el test del papel saca los `@media (max-width:760px)` y `(pointer:coarse)`. `.cam-*` y `.esc-contador` son congelados: aquí solo cambia el alto.)

- [ ] **Step 4: Tests**

Run: `npx vitest run test/barriles-celular.test.ts test/barriles-papel-intacto.test.mjs test/barriles-colores-congelados.test.ts test/barriles-estilo.test.ts test/barriles-portada.test.ts`
Expected: PASS.

- [ ] **Step 5: En el navegador a 375 px (preset mobile, emula táctil)**

Recargar `?rol=editor` y recorrer la portada y cada pantalla del operario; luego `?rol=admin` y cada sub-pestaña y cada pantalla de Más:

```js
// operario
const r = {};
for (const s of ['inicio','cargar','buscar','escaner','registro','rotulos','consulta','inventario','pedidos','celular']) {
  opSeccion(s); await new Promise(x => setTimeout(x, 700)); r[s] = document.documentElement.scrollWidth;
}
JSON.stringify({ innerWidth, r })
// programador: lo mismo con progIr y ['tablero','inventario','escaner','registro','mapa','mapa3d','rotulos','pedidos','datos','boxes','respaldos','celular']
```

Expected: `innerWidth` = 375 y todos los valores ≤ 375. Si alguno se pasa, encontrar el culpable (`[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > 376)` fuera de un contenedor con `overflow`) y envolverlo en `.scroll-x` o darle `max-width:100%`/`min-width:0`.

Además:
- Llenado / vaciado con 3 barriles: el ✕ mide ≥ 44×44 y queda a ≥ 12 px de lo de al lado; `document.querySelectorAll('.esc-hist-btn')` todos ≥ 44 px.
- `getComputedStyle($('escOT')).fontSize` = `16px`.
- Abrir la cámara del escáner (en el panel no hay cámara: llamar `$('overlayCamaraEsc').classList.add('abierto')`): `document.elementFromPoint(10, 10)` está **dentro** del overlay (la barra de la plataforma ya no lo tapa). Cerrar con `classList.remove('abierto')`.
- Un diálogo de `CI` ocupa el ancho y sus botones miden ≥ 44 px.
- Muestreo idéntico (con `?rol=admin` a 375 px también: ninguna regla de celular toca un color con significado).

- [ ] **Step 6: Suite y commit**

```bash
git add public/barriles/index.html test/barriles-celular.test.ts
git commit -m "feat(barriles): base de celular (sin desborde, 44 px, campos a 16 px, teclado numérico donde va, safe-area en la cámara, cámara arriba de la barra)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Verificación completa y entrega

**Files:** ninguno nuevo (scratchpad: PDFs, muestreos, medidas).

- [ ] **Step 1: Suite completa y tipos**

Correr la suite de a 12 (Task 0, Step 3) y `npx tsc --noEmit`.
Expected: verde; total = línea de base + los nuevos (2 + 4 + 2 + 6 + 5 + 4 + 3 + 6 ≈ 32 más). Anotar el número exacto.

- [ ] **Step 2: Lo que no se tenía que tocar**

```bash
git diff main --stat -- public/prensas public/lotes src    # vacío
git diff main -- public/barriles/index.html | grep -n "^[-+].*@media print"   # solo la línea + del bloque "Papel igual que antes"
```

- [ ] **Step 3: Colores con significado y papel**

- Mock reiniciado, `?rol=admin` a 1280 y a 375 px: muestreo idéntico a `muestreo-antes.json` (`[]`).
- `bash "$S/imprimir.sh" final` y `comparar-pdf.py` contra `antes-*`: `IGUALES` las tres (registro, rótulos, mapa del operario).
- Vista previa de impresión en el panel del mapa del programador: arriba ya no sale la tira de sub-pestañas (el único cambio de papel, a propósito).

- [ ] **Step 4: Recorrido de accesibilidad básico**

- Todo diálogo nuevo se cierra con Escape y devuelve el foco.
- Tab recorre la barra: marca no enfocable, los cuatro grupos, Más, sin trampas.
- Escáner: con un aviso a la vista, la pistola (escribir + Enter en `#escInput`) sigue cargando.
- A 375 px: `scrollWidth <= 375` en todas las pantallas (Task 9, Step 5).

- [ ] **Step 5: Informe para el usuario**

Mandar (texto, sin fotos si el subagente no puede guardarlas; el controlador puede sacar capturas con el panel y mandarlas con `SendUserFile`): qué cambió (barra con Más, estilo de Prensas, portada, diálogos, ✕ con Deshacer, celular) y qué no (colores con significado: N muestras idénticas; papel: 3 hojas idénticas en PDF; colores del JS: idénticos). Incluir los pendientes anotados: contraste bajo de `#ffd180`/`#8bc34a` sobre el modal blanco, grises escritos en el JS (`#8a7f76`, `#888`), y que `#cartelLado` es CSS muerto.

- [ ] **Step 6: Pedir el OK, avisando qué entra al deploy**

Antes de mergear, decirle al usuario:
- que **pushear `main` publica la web** (Workers Builds);
- qué otros commits de `main` todavía no están en producción: `git log origin/main..main --oneline` (al escribir este plan, `main` = `origin/main` = `ce6908c`; si hay más, listarlos);
- desde qué carpeta: `repos\catenainstitute` en `main` con `git status` limpio (el `borrar-duplicados-2026-10-14.sql` sin trackear no viaja en un push, pero avisarlo).

- [ ] **Step 7: Merge y push (solo con el OK)**

```bash
cd /c/Users/Bmax/repos/catenainstitute
git status -sb            # main limpio, sin trabajo de otra sesión
git merge --no-ff feat/estetica-barriles -m "Merge feat/estetica-barriles: Barriles con el estilo de Prensas (barra con Más, diálogos propios, celular), colores con significado y papel intactos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Correr la suite de a 12 sobre `main` mergeado y, si da verde, `git push origin main`. Después: `gh api repos/lucs56/catenainstitute/commits/<sha>/check-runs --jq '.check_runs[]|.name+" "+.conclusion'` hasta ver `Workers Builds: catenainstitute success` y `verificar success` (si `gh` no está en el PATH: `export PATH="$PATH:/c/Program Files/GitHub CLI"`). Recién ahí avisar que está en producción (Ctrl+F5).

- [ ] **Step 8: Limpieza y memoria**

Parar el mock. `git worktree remove ../catenainstitute-estetica-barriles` y `git branch -d feat/estetica-barriles` (solo después del merge). Actualizar la memoria `estetica-unificada.md`: Etapa 3 hecha (sha del merge, si se pusheó), herramientas (`scripts/colores-literales.mjs`, `scripts/muestreo-colores-barriles.js`, `$S/imprimir.sh` + `comparar-pdf.py` para comparar papel), pendientes (contraste del modal, grises del JS). Actualizar `barriles-programador-grupos.md`: ya está en main desde `23ff7e1` y ahora Administrar vive en Más.
