# Estética unificada · Etapa 2 (Lotes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Lotes se vea y se maneje como Prensas (tokens, letras, barra con Más, diálogos propios) y que se pueda usar desde el celular (sin desborde, buscar lote → ficha), sin que cambie ninguno de sus colores con significado ni sus hojas de papel.

**Architecture:** Primero se arman las redes de seguridad (un server de prueba con los motores reales, un muestreo de colores calculados y un test que congela el CSS de papel). Después se congelan los colores con significado como tokens `--ver-*` con su valor de hoy, y recién entonces Lotes carga `public/shared/estilo.css` y deja de redefinir los tokens de Prensas: lo que era interfaz cambia solo, lo congelado no se mueve. Las ventanitas nativas pasan por un único módulo `js/dialogos.js` que delega en `CI.*` (Etapa 1), vigilado por un test que lista los archivos pendientes y se vacía tarea a tarea.

**Tech Stack:** HTML/CSS/JS vanilla (módulos ES en `public/lotes/js/`), scripts clásicos compartidos (`public/shared/dialogo*.js`), Cloudflare Workers (TypeScript, `src/lotes/vistas.ts`), vitest con `@cloudflare/vitest-pool-workers` (sin DOM ni `fs`: los archivos se leen en `vitest.config.ts` y viajan como bindings), esbuild (viene con wrangler) para el server de prueba.

**Spec:** `docs/superpowers/specs/2026-10-16-estetica-unificada-design.md` (Parte 2 · Lotes). Plan anterior, como referencia de formato y de lo que ya existe: `docs/superpowers/plans/2026-10-16-estetica-etapa1-base-comun.md`.

## Global Constraints

- **Prensas no se toca** (ni `public/prensas/`). Si algo de esta etapa obliga a tocar Prensas, se para y se pregunta.
- **Colores con significado NO cambian de valor**: veredictos de Análisis (`td.dentro`/`td.fuera`, separador de lote, fila de agregado), `--sc-0…4`, `--tb-*`, filas `crit`/`venc`/`org`/`nuevo`/`fila-pendiente`/`fila-agregado`, rieles y números de los KPI, escala del heatmap, semáforos de la Agenda, estados del inventario de tanques, cruce, series de los gráficos. Se verifican con `scripts/muestreo-colores-lotes.js`: antes y después tienen que dar **idéntico**.
- **Hojas de papel y `@media print` no se tocan.** Lo vigila `test/lotes-papel-intacto.test.mjs` contra `test/fixtures/lotes-papel.json` (generado en la Task 1 sobre `main` sin cambios). Ningún archivo `ot-hojas.js`, `orden-filas.js`, ni el armado de hojas de `vista-orden*.js` cambia su HTML de papel.
- **44 px mínimo en todo lo táctil** (`--ci-tap`), aunque Prensas use menos en algún lado.
- Breakpoint de celular: `760px`. Campos en celular: `16px` de letra.
- Botones de diálogo con la acción escrita (`'Eliminar lote'`); nunca "Aceptar"/"OK". Lo peligroso con `peligro: true` (el foco arranca en Cancelar).
- Sin emojis en pestañas ni sub-pestañas (barra, Más, Correcciones, Movimientos, Análisis/Microbiología). Los botones de las vistas pueden quedar como están.
- Tokens de Prensas: los da `estilo.css` (vigilado por `test/estilo-tokens.test.ts`). Lotes **no** los redefine.
- Textos en castellano rioplatense, con `…`.
- **Push a `main` = deploy a producción** (Workers Builds). No se pushea sin verificación local completa y OK explícito del usuario.
- Trabajar **siempre en el worktree propio** (otras sesiones cambian de rama `repos\catenainstitute`).
- **Tests de a 12 archivos** (todos juntos dan timeout en esta PC): ver la Task 0, Step 3.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Desvíos de la spec, a propósito:**
- La spec dice "se borran los 45 `!important`". Medido: 33 están en `@media print` (papel, no se tocan), 6 en los veredictos de Análisis (congelados: le tienen que ganar al fondo de la grilla), 2 en la tabla virtual y 1 en la Orden de muestras micro. Solo se borra el `*{transition-duration:.01ms!important}` del bloque de renovación (Prensas no lo tiene).
- El orden de los pasos 2 y 3 de la spec se invierte: primero la barra (Task 3), después el estilo general (Task 4). La barra reemplaza al `header` y a `.tabs`, que son justo lo que más toca el bloque de "renovación visual"; borrarlos juntos evita un estado intermedio sin pestañas fijas.
- La spec pide `inputmode` en "lote, vasija, N° de OT y valores". Medido sobre el respaldo v75: los 683 lotes son numéricos (`inputmode="numeric"`), pero las vasijas (`T 140`, `H174`, `P 147`) y las OT (`0712`, `B219`) llevan letras: esas quedan con teclado de texto.
- Se agrega `CI.informar` (un solo botón, "Entendido") a `public/shared/dialogo*.js`: varios `alert()` de Lotes dan noticias que hay que leer sí o sí ("La OT NO se guardó…") y un aviso que se va solo no alcanza.
- El nombre de usuario sale de la sesión (`window.CIW.nombre`) y ya no se pregunta. Verificado: el servidor guarda `meta.autor` y además el `email` de la sesión en el historial (`src/lotes/rutas.ts:161-181`), y `armarInyeccion` ya pone `lotes_usuario` con el nombre de la sesión en cada carga.

---

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `scripts/css-reglas.mjs` | Crear | Parser mínimo de CSS: reglas de tope, reglas de papel, reglas planas (puro, lo usan tests y scripts) |
| `scripts/extraer-papel-lotes.mjs` | Crear | Escribe `test/fixtures/lotes-papel.json` desde `public/lotes/index.html` |
| `scripts/muestreo-colores-lotes.js` | Crear | Fragmento de navegador: color calculado de ~95 muestras con significado |
| `test/fixtures/lotes-papel.json` | Crear | Foto de las reglas de papel e impresión de Lotes en `main` |
| `test/lotes-papel-intacto.test.mjs` | Crear | Papel e impresión idénticos a la foto |
| `test/lotes-colores-congelados.test.ts` | Crear | `--ver-*`, `--sc-*`, `--tb-*` con su valor; reglas con significado sin tokens de interfaz |
| `test/lotes-barra.test.ts` | Crear | Barra tipo Prensas, Más, sin emojis, sticky bajo `--ciw-h` |
| `test/lotes-estilo.test.ts` | Crear | `estilo.css` cargado, sin tokens de Prensas redefinidos, sin bloque de renovación |
| `test/lotes-sin-ventanas-nativas.test.ts` | Crear | Ningún `alert/confirm/prompt` fuera de `js/dialogos.js` (lista de pendientes que se vacía) |
| `test/lotes-ficha-url.test.mjs` | Crear | `#ficha/<lote>` ida y vuelta |
| `test/lotes-ficha-ultimo.test.ts` | Crear | `datosFicha` trae el último análisis con veredicto |
| `vitest.config.ts`, `test/env.d.ts` | Modificar | Bindings `LOTES_HTML`, `LOTES_JS` |
| `public/shared/dialogo-modelo.js`, `public/shared/dialogo.js`, `test/dialogo-modelo.test.mjs` | Modificar | `CI.informar`; el aviso se cuelga del `<dialog>` modal abierto |
| `public/lotes/index.html` | Modificar | `--ver-*`, `estilo.css`, barra, estilo, `<dialog id="overlay">`, celular |
| `public/lotes/js/dialogos.js` | Crear | `avisar`, `informar`, `confirmar`, `pedir` (única puerta a las nativas) |
| `public/lotes/js/barra-lotes.js` | Crear | Menú Más: abrir/cerrar, marcar la pestaña activa |
| `public/lotes/js/ficha-url.js` | Crear | `loteDeHash`, `hashDeLote` (puro) |
| `public/lotes/js/nucleo.js` | Modificar | Overlay en `<dialog>`, `avisoBreve`→`CI.avisar`, usuario de la sesión, autoguardado espera las preguntas, `mostrarTab` con Más, `irALote` con historial |
| `public/lotes/app.js` | Modificar | Cablear barra, Más, Buscar lote, `#ficha/` al cargar, `popstate` |
| `public/lotes/js/dash-graficos.js:403` | Modificar | La línea de objetivo lee `--ver-acento` |
| `public/lotes/js/vista-*.js`, `guardar-ot.js` (18 archivos) | Modificar | Las 72 llamadas nativas → `dialogos.js` |
| `public/lotes/js/vista-ficha.js` | Modificar | Resumen en una columna con el último análisis |
| `public/lotes/js/vista-lotes.js`, `vista-agenda.js`, `vista-tablero.js`, `vista-orden-correccion.js`, `vista-agregados.js`, `vista-config-agenda.js`, `vista-movimientos.js`, `vista-orden.js`, `vista-analisis.js`, `vista-config.js` | Modificar | Celular (scroll propio, `inputmode`, alto de la banda) y sub-pestañas sin emojis |
| `src/lotes/vistas.ts` | Modificar | `datosFicha().ultimo_analisis` |

---

### Task 0: Worktree y línea de base

**Files:** ninguno.

- [ ] **Step 1: Confirmar que este plan está en `main` local**

```bash
cd /c/Users/Bmax/repos/catenainstitute
git log --oneline -3 main
git show main:docs/superpowers/plans/2026-10-16-estetica-etapa2-lotes.md | head -3
```

Expected: `main` en `fa46cb4` (merge de la Etapa 1) o más nuevo, y el plan existe. Si el plan no está en `main`, mergear antes la rama `docs/plan-estetica-etapa2` (`git merge --ff-only docs/plan-estetica-etapa2` desde un worktree en `main`, o pedírselo al usuario). **No pushear.**

- [ ] **Step 2: Crear el worktree**

```bash
cd /c/Users/Bmax/repos/catenainstitute
git worktree add ../catenainstitute-estetica-lotes -b feat/estetica-lotes main
cd ../catenainstitute-estetica-lotes
npm ci
```

Expected: `C:\Users\Bmax\repos\catenainstitute-estetica-lotes` en la rama `feat/estetica-lotes`. Todo el trabajo va acá.

- [ ] **Step 3: Línea de base de tests, de a 12 archivos**

```bash
cd /c/Users/Bmax/repos/catenainstitute-estetica-lotes
ls test/*.test.* | split -l 12 - "$TMP/tanda-"
for t in "$TMP"/tanda-*; do npx vitest run $(cat "$t") || echo "FALLÓ $t"; done
rm -f "$TMP"/tanda-*
```

Expected: ninguna línea `FALLÓ`. Anotar la suma de tests de las tandas (la Etapa 1 cerró con 1581). Este mismo bloque es "correr la suite" en todo el plan; `npx tsc --noEmit` se corre aparte.

---

### Task 1: Redes de seguridad (sin cambiar nada visible)

**Files:**
- Create: `scripts/css-reglas.mjs`, `scripts/extraer-papel-lotes.mjs`, `scripts/muestreo-colores-lotes.js`
- Create: `test/fixtures/lotes-papel.json`, `test/lotes-papel-intacto.test.mjs`
- Modify: `vitest.config.ts`, `test/env.d.ts`
- Create (scratchpad, fuera del repo): `mock-lotes.mjs`, `vistas.mjs`, `muestreo-antes.json`, fotos de antes

**Interfaces:**
- Produces `scripts/css-reglas.mjs`:
  - `cssDe(html: string) → string` (todo el contenido de los `<style>`, sin comentarios)
  - `reglasTope(css: string) → string[]` (bloques de primer nivel, por conteo de llaves)
  - `norm(regla: string) → string` (espacios normalizados)
  - `reglasDePapel(html: string) → string[]` (ordenadas)
  - `reglasPlanas(html: string) → {media: string, selector: string, cuerpo: string}[]` (todas las de pantalla, bajando un nivel dentro de `@media` que no sea print)
- Produces bindings de test: `env.LOTES_HTML: string`, `env.LOTES_JS: Record<string, string>` (clave `app.js` o `js/<archivo>.js`).
- Produces el fragmento `scripts/muestreo-colores-lotes.js` que devuelve un texto JSON `{muestra: valor}`.

- [ ] **Step 1: `scripts/css-reglas.mjs`**

```js
/**
 * Parser mínimo del CSS de una página: lo justo para que los tests de estilo
 * puedan decir "estas reglas no cambiaron". Puro (sin fs), así lo importan
 * tanto los scripts de Node como los tests que corren en Workers.
 */

/** Todo el CSS de los <style> de un HTML, sin comentarios. */
export function cssDe(html) {
  return [...String(html).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Bloques de primer nivel ("sel{...}" o "@media ...{...}"), por conteo de llaves. */
export function reglasTope(css) {
  const out = [];
  let prof = 0, ini = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') prof++;
    else if (c === '}') {
      prof--;
      if (prof === 0) { out.push(css.slice(ini, i + 1).trim()); ini = i + 1; }
    }
  }
  return out.filter(Boolean);
}

/** Espacios normalizados: el mismo CSS escrito con otro sangrado da lo mismo. */
export function norm(r) {
  return String(r).replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').trim();
}

const selectorDe = (r) => r.slice(0, r.indexOf('{')).trim();
const cuerpoDe = (r) => r.slice(r.indexOf('{') + 1, -1);

/** Lo que toca una hoja de papel (OT, órdenes, rótulos, hoja de recorrida). */
export const SELECTOR_PAPEL =
  /orden-hoja|ot-rot|inv-hoja|#otPaginas|#otlHoja|#ocPaginas|#agPaginas|#otMovHoja|#cruceHoja|printing-/;

/**
 * Las reglas de papel: cada @media print entero, y toda regla de pantalla
 * (también dentro de un @media de pantalla) cuyo selector toca una hoja.
 * Ordenadas, para que mover una regla de lugar no cuente como cambio.
 */
export function reglasDePapel(html) {
  const out = [];
  for (const r of reglasTope(cssDe(html))) {
    if (/^@media[^{]*\bprint\b/.test(r)) { out.push(norm(r)); continue; }
    if (r.startsWith('@')) {
      const media = norm(selectorDe(r));
      for (const ir of reglasTope(cuerpoDe(r))) {
        if (SELECTOR_PAPEL.test(selectorDe(ir))) out.push(media + '>' + norm(ir));
      }
      continue;
    }
    if (SELECTOR_PAPEL.test(selectorDe(r))) out.push(norm(r));
  }
  return out.sort();
}

/** Todas las reglas de pantalla, una por selector, con el @media que las envuelve ('' si ninguno). */
export function reglasPlanas(html) {
  const out = [];
  for (const r of reglasTope(cssDe(html))) {
    if (/^@media[^{]*\bprint\b/.test(r) || /^@(font-face|keyframes|page)/.test(r)) continue;
    if (r.startsWith('@')) {
      const media = norm(selectorDe(r));
      for (const ir of reglasTope(cuerpoDe(r))) out.push({ media, selector: norm(selectorDe(ir)), cuerpo: norm(cuerpoDe(ir)) });
      continue;
    }
    out.push({ media: '', selector: norm(selectorDe(r)), cuerpo: norm(cuerpoDe(r)) });
  }
  return out;
}
```

- [ ] **Step 2: `scripts/extraer-papel-lotes.mjs` y la foto de `main`**

```js
// Foto de las reglas de papel e impresión de Lotes. Se corre UNA vez sobre
// main sin cambios (Etapa 2, Task 1); después el test compara contra ella.
// Uso: node scripts/extraer-papel-lotes.mjs > test/fixtures/lotes-papel.json
import { readFileSync } from 'node:fs';
import { reglasDePapel } from './css-reglas.mjs';

const html = readFileSync(new URL('../public/lotes/index.html', import.meta.url), 'utf8');
process.stdout.write(JSON.stringify(reglasDePapel(html), null, 1) + '\n');
```

Run:

```bash
mkdir -p test/fixtures
node scripts/extraer-papel-lotes.mjs > test/fixtures/lotes-papel.json
node -e "const a=require('./test/fixtures/lotes-papel.json');console.log(a.length, a.filter(r=>r.startsWith('@media print')).length)"
```

Expected: algo como `60 3` (unas 60 reglas, 3 bloques `@media print`). Si el segundo número no es 3, el parser no está viendo los `@media print` de las líneas ~696, ~811 y ~1310 de `index.html`: revisar antes de seguir.

- [ ] **Step 3: Bindings en `vitest.config.ts` y `test/env.d.ts`**

En `vitest.config.ts`, cambiar el import de fs a `import { readFileSync, readdirSync } from 'node:fs';` y, después de `const CAMBIAR_CLAVE_HTML = ...`, agregar:

```ts
// Lotes: el index.html y todo su JS, para los tests de estética de la Etapa 2.
const LOTES_HTML = leer('public/lotes/index.html');
const dirLotesJs = path.join(import.meta.dirname, 'public/lotes/js');
const LOTES_JS: Record<string, string> = Object.fromEntries(
  ['app.js', ...readdirSync(dirLotesJs).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)]
    .map((f) => [f, leer('public/lotes/' + f)]),
);
```

y en `bindings` agregar `LOTES_HTML, LOTES_JS`. En `test/env.d.ts`, dentro de `ProvidedEnv`:

```ts
    // Lotes (Etapa 2 de la estética): index.html y su JS por archivo ('app.js', 'js/nucleo.js', …).
    LOTES_HTML: string;
    LOTES_JS: Record<string, string>;
```

- [ ] **Step 4: Test del papel**

`test/lotes-papel-intacto.test.mjs`:

```js
/**
 * Las hojas de papel de Lotes (OT, órdenes, rótulos, hoja de recorrida) y
 * todo su @media print tienen que quedar EXACTAMENTE como en main antes de la
 * Etapa 2 de la estética: salen impresas para calidad y bodega. La foto la
 * escribió scripts/extraer-papel-lotes.mjs; si un cambio la rompe, se arregla
 * el cambio, no la foto.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { reglasDePapel } from '../scripts/css-reglas.mjs';
import foto from './fixtures/lotes-papel.json';

describe('papel de Lotes', () => {
  it('las reglas de papel e impresión son las de la foto', () => {
    expect(reglasDePapel(env.LOTES_HTML)).toEqual(foto);
  });
});
```

Run: `npx vitest run test/lotes-papel-intacto.test.mjs`
Expected: PASS (el HTML todavía es el de la foto).

Probar que caza: cambiar a mano en `public/lotes/index.html` `.orden-hoja .oh-check{width:34px}` por `35px`, correr, ver FAIL; volver a `34px`, ver PASS.

- [ ] **Step 5: `scripts/muestreo-colores-lotes.js`**

```js
/* Muestreo de los colores con significado de Lotes (estética unificada, Etapa 2).
 *
 * NO es un script de Node: se pega en la consola del navegador (o se corre con
 * javascript_tool) con /lotes/ abierto y los datos ya cargados. Devuelve un
 * texto JSON {muestra: valor}. Antes y después de cada cambio de estilo tiene
 * que dar IDÉNTICO.
 *
 * Cada muestra se arma como un fragmento suelto dentro del contenedor que
 * piden sus reglas (#tab-analisis, #tab-agenda…), se lee el estilo calculado
 * y se saca: no depende de qué datos haya ni de qué filas tenga dibujadas una
 * tabla virtual. Si se agrega un color con significado nuevo, se agrega acá. */
await (async () => {
  const T = (id, filas) => `<table${id ? ` id="${id}"` : ''}><tbody>${filas}</tbody></table>`;
  const BG = ['background-color'], C = ['color'], BGC = ['background-color', 'color'];
  // [nombre, contenedor, html, selector a leer, propiedades, pseudo]
  const M = [
    // Análisis
    ['an.dentro', '#tab-analisis', T('tAnalisis', '<tr><td class="dentro"><input class="cell"></td></tr>'), 'td', BG],
    ['an.dentro.input', '#tab-analisis', T('tAnalisis', '<tr><td class="dentro"><input class="cell"></td></tr>'), 'input', BGC],
    ['an.fuera', '#tab-analisis', T('tAnalisis', '<tr><td class="fuera"><input class="cell"></td></tr>'), 'td', BG],
    ['an.fuera.input', '#tab-analisis', T('tAnalisis', '<tr><td class="fuera"><input class="cell"></td></tr>'), 'input', BGC],
    ['an.dentro.gsel', '#tab-analisis', T('tAnalisis', '<tr><td class="dentro gsel"></td></tr>'), 'td', BG],
    ['an.fuera.gsel', '#tab-analisis', T('tAnalisis', '<tr><td class="fuera gsel"></td></tr>'), 'td', BG],
    ['an.sep.ok', '#tab-analisis', T('tAnalisis', '<tr class="analisis-separador ok"><td>x</td></tr>'), 'td', BG],
    ['an.sep.mal', '#tab-analisis', T('tAnalisis', '<tr class="analisis-separador mal"><td>x</td></tr>'), 'td', BG],
    ['an.agregado', '#tab-analisis', T('tAnalisis', '<tr class="fila-agregado"><td data-k="agregado_txt">x</td></tr>'), 'td', ['background-color', 'color', 'font-weight']],
    // Lotes
    ['lo.crit', '#tab-lotes', T('', '<tr class="crit"><td>a</td><td>b</td></tr>'), 'td:last-child', BG],
    ['lo.crit.franja', '#tab-lotes', T('', '<tr class="crit"><td>a</td></tr>'), 'td', ['box-shadow']],
    ['lo.venc', '#tab-lotes', T('', '<tr class="venc"><td>a</td><td>b</td></tr>'), 'td:last-child', BG],
    ['lo.venc.franja', '#tab-lotes', T('', '<tr class="venc"><td>a</td></tr>'), 'td', ['box-shadow']],
    ['lo.org', '#tab-lotes', T('', '<tr class="org"><td>a</td></tr>'), 'td', BG],
    ['lo.vacio', '#tab-lotes', T('', '<tr class="vacio"><td>a</td></tr>'), 'tr', ['opacity']],
    ['lo.nuevo', '#tab-lotes', T('tLotes', '<tr class="nuevo"><td>a</td></tr>'), 'td', ['border-top-color', 'border-top-width']],
    ['lo.crit.lote', '#tab-lotes', T('tLotes', '<tr class="crit"><td data-k="lote">1</td></tr>'), 'td', BG],
    ['lo.venc.lote', '#tab-lotes', T('tLotes', '<tr class="venc"><td data-k="lote">1</td></tr>'), 'td', BG],
    ['lo.org.lote', '#tab-lotes', T('tLotes', '<tr class="org"><td data-k="lote">1</td></tr>'), 'td', BG],
    // Leyendas
    ...['crit', 'venc'].map((k) => [`ley.${k}`, '#tab-lotes', `<div class="legend-inline"><span class="sw ${k}"></span></div>`, 'span', ['background-color', 'border-left-color']]),
    ...['org', 'dentro', 'fuera', 'sep-mal'].map((k) => [`ley.${k}`, '#tab-lotes', `<div class="legend-inline"><span class="sw ${k}"></span></div>`, 'span', ['background-color', 'border-top-color']]),
    ['ley.vacio', '#tab-lotes', '<div class="legend-inline"><span class="sw vacio"></span></div>', 'span', ['opacity']],
    // Dashboard
    ...['ok', 'warn', 'bad'].map((k) => [`kpi.${k}.val`, '#tab-dashboard', `<div class="kpi-card kpi-${k}"><div class="kpi-val">1</div></div>`, '.kpi-val', C]),
    ...['ok', 'warn', 'bad', 'neutral'].map((k) => [`kpi.${k}.riel`, '#tab-dashboard', `<div class="kpi-card kpi-${k}"></div>`, '.kpi-card', BG, '::before']),
    ['faq.hi', '#tab-dashboard', '<div class="faq-item hi"><div class="faq-n">1</div></div>', '.faq-n', C],
    ...[0, 1, 2, 3, 4, 5].map((v) => [`hm.v${v}`, '#tab-dashboard', `<button class="hm-cell v${v}">1</button>`, 'button', BGC]),
    // Ficha y seguimiento
    ...['', 'media', 'baja', 'cerrado'].map((k) => [`avance.${k || 'alta'}`, '#tab-ficha', `<div class="barra ${k}"><span></span></div>`, 'span', BG]),
    ...['ok', 'falta', 'na'].map((k) => [`hito.${k}`, '#tab-ficha', `<div class="hito ${k}">x</div>`, 'div', C]),
    ...['ingreso', 'movimiento', 'analisis', 'correccion', 'etapa', 'agregado'].map((k) => [`linea.${k}`, '#tab-ficha', `<ul class="timeline"><li class="${k}">x</li></ul>`, 'li', BG, '::before']),
    ...['finalizada', 'no_finalizada', 'excluida'].map((k) => [`est.${k}`, '#tab-dashboard', `<span class="est-${k}">x</span>`, 'span', BGC]),
    ['prox.venc', '#tab-dashboard', '<span class="prox-venc">x</span>', 'span', C],
    ['prox.ok', '#tab-dashboard', '<span class="prox-ok">x</span>', 'span', C],
    ...['hi', 'pos'].map((k) => [`so2box.${k}`, '#tab-so2', `<div class="so2-result-box ${k}"><div class="so2-val">1</div></div>`, '.so2-val', C]),
    // Tablero FML
    ...['ok', 'mal', 'neutro'].map((k) => [`tb.chip.${k}`, '#tab-tablero', `<span class="tb-chip ${k}">x</span>`, 'span', BGC]),
    ...['ok', 'mal', 'neutro'].map((k) => [`tb.cuadro.${k}`, '#tab-tablero', `<button class="tb-cuadro ${k}"></button>`, 'button', BG]),
    ['tb.pct', '#tab-tablero', '<div class="tb-tarjeta"><div class="tb-pct">1</div></div>', '.tb-pct', C],
    ['tb.tarjeta.hi', '#tab-tablero', '<div class="tb-tarjeta hi"><div class="tb-pct">1</div></div>', '.tb-tarjeta', BGC],
    ['tb.tarjeta.hi.pct', '#tab-tablero', '<div class="tb-tarjeta hi"><div class="tb-pct">1</div></div>', '.tb-pct', C],
    ['tb.toggle.on', '#tab-tablero', '<div class="tb-toggle"><button class="active">x</button></div>', 'button', BGC],
    // Movimientos
    ['mov.pendiente', '#tab-movimientos', T('tMov', '<tr class="fila-pendiente"><td>x</td></tr>'), 'tr', BG],
    ['mov.pendiente.tag', '#tab-movimientos', '<span class="tag mov-pendiente">x</span>', 'span', ['color', 'border-top-color']],
    ['mov.merma.llena', '#tab-movimientos', T('', '<tr class="mer-llena"><td>x</td></tr>'), 'td', C],
    ['inv.estado.ot', '#tab-movimientos', '<span class="inv-estado inv-ot">x</span>', 'span', C],
    ['inv.estado.medicion', '#tab-movimientos', '<span class="inv-estado inv-medicion">x</span>', 'span', C],
    ['inv.chip', '#tab-movimientos', '<span class="inv-chip">x</span>', 'span', ['background-color', 'border-top-color']],
    ['inv.chip.excede', '#tab-movimientos', '<span class="inv-chip inv-chip-excede">x</span>', 'span', ['background-color', 'border-top-color']],
    ['inv.aviso', '#tab-movimientos', '<table class="inv-tabla"><tbody><tr class="inv-con-aviso"><td>x</td></tr></tbody></table>', 'tr', BG],
    // Agenda
    ...['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'tr'].map((k) => [`ag.punto.${k}`, '#tab-agenda', `<span class="ag-p ${k}"></span>`, 'span', BG]),
    ...['alta', 'media', 'baja'].map((k) => [`ag.tarj.${k}`, '#tab-agenda', `<div class="ag-tarj pr-${k}">x</div>`, 'div', ['border-left-color']]),
    ...['alta', 'media', 'baja'].map((k) => [`ag.prio.${k}`, '#tab-agenda', `<div class="pr-${k}"><span class="ag-punto"></span></div>`, 'span', BG]),
    ...['p1', 'p2', 'p3', 'p4'].map((k) => [`ag.ficha.${k}`, '#tab-agenda', `<span class="ag-ficha ${k}">x</span>`, 'span', BG]),
    ['ag.ficha.p5', '#tab-agenda', '<span class="ag-ficha p5">x</span>', 'span', C],
    ['ag.carga', '#tab-agenda', '<div class="ag-carga"><i></i></div>', 'i', BG],
    ['ag.carga.exc', '#tab-agenda', '<div class="ag-carga exc"><i></i></div>', 'div', C],
    ['ag.carga.exc.barra', '#tab-agenda', '<div class="ag-carga exc"><i></i></div>', 'i', BG],
    ['ag.ronda', '#tab-agenda', '<div class="ag-ronda">x</div>', 'div', BG],
    ['ag.hoy', '#tab-agenda', '<div class="ag-dia hoy"><div class="ag-cab"><b>1</b></div></div>', '.ag-dia', ['border-top-color', 'box-shadow']],
    ['ag.hoy.num', '#tab-agenda', '<div class="ag-dia hoy"><div class="ag-cab"><b>1</b></div></div>', 'b', C],
    ['ag.feriado', '#tab-agenda', '<span class="ag-fer">x</span>', 'span', C],
    // Correcciones, cruce y confirmación de OT
    ['so2.anulada', '#tab-so2', T('', '<tr class="so2-anulada"><td>x</td></tr>'), 'td', ['opacity', 'text-decoration-line']],
    ['so2.anulada.sello', '#tab-so2', '<span class="so2-anulada-sello">x</span>', 'span', C],
    ...['alta', 'media', 'baja', 'ok'].map((k) => [`cruce.${k}`, '#tab-cruce', T('', `<tr class="cruce-${k}"><td>x</td></tr>`), 'td', BG]),
    ['otc.coincide', 'body', '<span class="otc-coincide">x</span>', 'span', C],
    ['otc.difiere', 'body', '<span class="otc-difiere">x</span>', 'span', C],
    ['otc.aviso', 'body', '<div class="otc-aviso">x</div>', 'div', C],
    ['otc.revisar', 'body', T('', '<tr class="otc-revisar"><td>x</td></tr>'), 'td', BG],
  ];
  const out = {};
  for (const [nombre, cont, html, sel, props, pseudo] of M) {
    const caja = document.createElement('div');
    caja.setAttribute('data-muestreo', '');
    caja.innerHTML = html;
    (document.querySelector(cont) || document.body).appendChild(caja);
    const el = caja.querySelector(sel) || caja.firstElementChild;
    const cs = getComputedStyle(el, pseudo || null);
    out[nombre] = props.map((p) => cs.getPropertyValue(p)).join(' | ');
    caja.remove();
  }
  const raiz = getComputedStyle(document.documentElement);
  for (const t of ['--sc-0', '--sc-1', '--sc-2', '--sc-3', '--sc-4', '--tb-ok-bg', '--tb-ok-fg', '--tb-mal-bg', '--tb-mal-fg',
    '--tb-neu-bg', '--tb-neu-fg', '--tb-primario', '--tb-fondo', '--tb-panel', '--tb-linea', '--tb-tinta']) {
    out['token' + t] = raiz.getPropertyValue(t).trim().toLowerCase();
  }
  if (window.Chart) for (const id of ['chAv', 'chSo2', 'chNube']) {
    const c = window.Chart.getChart(id);
    out['grafico.' + id] = c
      ? JSON.stringify(c.data.datasets.map((d) => [d.label, d.borderColor, d.backgroundColor, d.pointBackgroundColor]))
      : 'sin dibujar';
  }
  return JSON.stringify(out, null, 1);
})();
```

- [ ] **Step 6: Server de prueba con los motores reales**

En el scratchpad de la sesión (llamarlo `$S`), empaquetar los motores y escribir el mock:

```bash
cd /c/Users/Bmax/repos/catenainstitute-estetica-lotes
npx esbuild src/lotes/vistas.ts --bundle --format=esm --platform=node --outfile="$S/vistas.mjs" --log-level=warning
```

`$S/mock-lotes.mjs`:

```js
// Server de prueba de Lotes SIN login, con los motores reales (solo lectura).
// Uso: node mock-lotes.mjs <carpeta public> <puerto> <vistas.mjs>
// Inyecta en /lotes/ lo mismo que armarInyeccion() (src/index.ts). HOY fijo para
// que dos corridas (antes / después) den exactamente los mismos veredictos.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PUB = path.resolve(process.argv[2]);
const PUERTO = Number(process.argv[3] || 8830);
const V = await import(pathToFileURL(path.resolve(process.argv[4])).href);
const RESPALDOS = 'C:/Users/Bmax/repos/catenainstitute';
const HOY = Date.parse('2026-10-16T00:00:00Z');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const CTX = { email: 'prueba@catenawines.com', nombre: 'Oriana Prueba', rol: 'admin', modulo: 'lotes',
  modulos: { prensas: 'admin', lotes: 'admin', barriles: 'admin' } };

function inyeccion() {
  const hay = (f) => fs.existsSync(path.join(PUB, f));
  return `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` +
    `<script>try{localStorage.setItem('lotes_usuario','Oriana Prueba');}catch(e){}window.CIW=${JSON.stringify(CTX)};window.CIW_USUARIO=window.CIW;</script>\n` +
    (hay('shared/dialogo.js') ? `<script src="/shared/dialogo-modelo.js"></script>\n<script src="/shared/dialogo.js"></script>\n` : '') +
    `<script src="/shared/fusion.js"></script>\n` +
    `<script defer src="/shared/xlsx.full.min.js"></script>\n<script defer src="/shared/exportar.js"></script>\n` +
    `<script defer src="/shared/barra.js"></script>\n</head>`;
}

const f = fs.readdirSync(RESPALDOS).filter((x) => x.startsWith('respaldo-nube-lotes-')).sort().pop();
const DOC = JSON.parse(JSON.parse(fs.readFileSync(path.join(RESPALDOS, f), 'utf8'))[0].results[0].json);
console.log('respaldo:', f, 'v' + (DOC.meta || {}).version);

function enviar(res, code, cuerpo, tipo = 'application/json') {
  res.writeHead(code, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
  res.end(typeof cuerpo === 'string' || Buffer.isBuffer(cuerpo) ? cuerpo : JSON.stringify(cuerpo));
}
const leerCuerpo = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => ok(b)); });

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname);
  if (p === '/api/auth/me') return enviar(res, 200, { email: CTX.email, nombre: CTX.nombre, es_admin: true, debe_cambiar: false });
  if (p === '/api/yo') return enviar(res, 200, { ...CTX, es_admin: true });
  const api = p.match(/^\/lotes\/api(\/.*)$/);
  if (api) {
    const r = api[1];
    if (req.method === 'POST' && r === '/analisis/veredictos') return enviar(res, 200, V.veredictosSueltos(JSON.parse(await leerCuerpo(req) || 'null')));
    if (req.method !== 'GET') return enviar(res, 200, { ok: true, version: (DOC.meta || {}).version || 1 });
    if (r === '/datos') return enviar(res, 200, DOC);
    if (r === '/version') return enviar(res, 200, { version: (DOC.meta || {}).version, autor: '', guardado: '' });
    if (r === '/dashboard') return enviar(res, 200, V.datosDashboard(DOC, HOY));
    if (r === '/analisis') return enviar(res, 200, V.analisisConFlags(DOC));
    if (r === '/ficha') {
      const fi = V.datosFicha(DOC, u.searchParams.get('lote'), HOY, u.searchParams.get('etapa'));
      return fi ? enviar(res, 200, fi) : enviar(res, 404, { error: 'no existe' });
    }
    if (r === '/historial') return enviar(res, 200, { historial: [] });
    return enviar(res, 200, {});
  }
  if (/^\/(prensas|barriles)\/api\//.test(p)) return enviar(res, 200, {});
  if (/^\/lotes\/?(index\.html)?$/.test(p)) {
    return enviar(res, 200, fs.readFileSync(path.join(PUB, 'lotes/index.html'), 'utf8').replace('</head>', inyeccion()), TIPOS['.html']);
  }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(PUB, p);
  if (!file.startsWith(PUB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return enviar(res, 404, 'no', 'text/plain');
  enviar(res, 200, fs.readFileSync(file), TIPOS[path.extname(file)] || 'application/octet-stream');
}).listen(PUERTO, () => console.log(`mock de Lotes en http://localhost:${PUERTO}/lotes/ sirviendo ${PUB}`));
```

Levantarlo con la tool de Bash **en segundo plano**: `node "$S/mock-lotes.mjs" /c/Users/Bmax/repos/catenainstitute-estetica-lotes/public 8830 "$S/vistas.mjs"`, y abrir `http://localhost:8830/lotes/` en el navegador del panel (`preview_start` con `url`). Cuando cambie `src/lotes/vistas.ts` (Task 9) hay que volver a empaquetar y reiniciar el mock.

- [ ] **Step 7: Foto "antes" de los colores y de las pantallas**

Con `/lotes/` cargado a 1280 px y el Dashboard visible (para que los gráficos estén dibujados): pegar el contenido de `scripts/muestreo-colores-lotes.js` en `javascript_tool` y guardar el resultado en `$S/muestreo-antes.json`. Verificar que tenga ~120 claves y que `grafico.chNube` no diga `sin dibujar`.

Fotos de antes (1280 px y preset mobile 375 px): Dashboard, Lotes, Análisis, Movimientos (Historial y Órdenes de trabajo), Agenda, Correcciones, Tablero FML, Configuración. Guardarlas en `$S/antes-*.png` para la comparación final.

Medición de celular de antes (para el informe final), a 375 px:

```js
JSON.stringify({ innerWidth, scrollWidth: document.documentElement.scrollWidth })
```

Expected hoy: `innerWidth` ≈ 609 (la cabecera `header .right` mide 581 px y no se parte).

- [ ] **Step 8: Suite y commit**

Correr la suite (Task 0, Step 3). Expected: verde, +1 test.

```bash
git add scripts/css-reglas.mjs scripts/extraer-papel-lotes.mjs scripts/muestreo-colores-lotes.js \
  test/fixtures/lotes-papel.json test/lotes-papel-intacto.test.mjs vitest.config.ts test/env.d.ts
git commit -m "test(lotes): foto del papel e impresión y muestreo de colores con significado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Congelar los colores con significado (`--ver-*`)

Este commit **no cambia nada visible**: solo cambia de qué token sale cada color con significado, con el mismo valor.

**Files:**
- Create: `test/lotes-colores-congelados.test.ts`
- Modify: `public/lotes/index.html` (`:root` y las reglas listadas abajo), `public/lotes/js/dash-graficos.js:403`

**Interfaces:**
- Produces tokens en el `:root` de Lotes: `--ver-ok:#3f7d4f; --ver-mal:#b03a2e; --ver-alerta:#b07d2c; --ver-info:#5b7b86; --ver-acento:#8a3340; --ver-acento-linea:rgba(138,51,64,.18); --ver-dentro:#b7dba9; --ver-fuera:#e8a15f; --ver-gris:#e7e3da; --ver-apagado:#8c857b; --ver-cero:#f1efe9; --ver-tinta:#2a2622;`
- Consumes: `reglasPlanas` (Task 1).

- [ ] **Step 1: Test que falla**

`test/lotes-colores-congelados.test.ts`:

```ts
/**
 * Los colores con significado de Lotes son criterios que el equipo lee de
 * memoria (verde = en criterio, franja roja = alarma…). La Etapa 2 de la
 * estética cambia los tokens de interfaz por los de Prensas: estos tienen que
 * quedar con el valor de antes. Si este test falla, el cambio de estética se
 * llevó puesto un color con significado.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { reglasPlanas, cssDe, norm } from '../scripts/css-reglas.mjs';

function raiz(html: string): Record<string, string> {
  const m = cssDe(html).match(/:root\s*\{([\s\S]*?)\}/);
  const out: Record<string, string> = {};
  for (const decl of (m ? m[1] : '').split(';')) {
    const i = decl.indexOf(':');
    if (i > 0 && decl.slice(0, i).trim().startsWith('--')) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim().toLowerCase();
  }
  return out;
}

const CONGELADOS: Record<string, string> = {
  '--ver-ok': '#3f7d4f', '--ver-mal': '#b03a2e', '--ver-alerta': '#b07d2c', '--ver-info': '#5b7b86',
  '--ver-acento': '#8a3340', '--ver-acento-linea': 'rgba(138,51,64,.18)',
  '--ver-dentro': '#b7dba9', '--ver-fuera': '#e8a15f', '--ver-gris': '#e7e3da',
  '--ver-apagado': '#8c857b', '--ver-cero': '#f1efe9', '--ver-tinta': '#2a2622',
  '--sc-0': '#4a8360', '--sc-1': '#8aa14a', '--sc-2': '#d0a133', '--sc-3': '#c9762f', '--sc-4': '#b03a2e',
  '--tb-ok-bg': '#dcfce7', '--tb-ok-fg': '#166534', '--tb-mal-bg': '#fde8ec', '--tb-mal-fg': '#8a1538',
  '--tb-neu-bg': '#f1f5f9', '--tb-neu-fg': '#52606d', '--tb-primario': '#0b6fae', '--tb-fondo': '#f4f7fa',
  '--tb-panel': '#ffffff', '--tb-linea': '#cbd5e1', '--tb-tinta': '#17212b',
};

/* Selectores cuyo color ES el dato. No pueden usar tokens de interfaz
 * (--ok/--nook/--warn/--info/--accent…): esos pasan a valer lo de Prensas. */
const CON_SIGNIFICADO = new RegExp([
  String.raw`td\.(dentro|fuera)`, 'analisis-separador', 'fila-agregado', String.raw`tr\.(crit|venc|org|nuevo)`,
  String.raw`legend-inline \.sw`, String.raw`kpi-card\.kpi-`, String.raw`faq-item\.hi`, 'prox-', 'so2-result-box',
  'so2-anulada', 'inv-estado', 'inv-chip', 'inv-con-aviso', String.raw`\.ag-p\b`, 'pr-(alta|media|baja)',
  String.raw`ag-ficha\.p`, String.raw`ag-carga( |\.exc)`, 'ag-ronda', String.raw`ag-dia\.hoy`, 'ag-fer',
  String.raw`hm-cell\.v`, String.raw`\.tb-`, String.raw`\.barra\.(media|baja|cerrado)`, String.raw`\.barra ?> ?span`,
  String.raw`\.hito\.`, 'timeline li\\.', 'est-(finalizada|no_finalizada|excluida)', 'cruce-(alta|media|baja|ok)',
  'fila-pendiente', 'mov-pendiente', 'mer-llena', 'otc-(coincide|difiere|revisar|aviso)',
].join('|'));
const TOKEN_DE_INTERFAZ = /var\(--(ok|nook|warn|info|accent|accent2|accent-line|accent-soft|accent-rgb)\)/;

describe('colores con significado de Lotes', () => {
  it('los tokens congelados tienen su valor de siempre', () => {
    const r = raiz(env.LOTES_HTML);
    for (const [k, v] of Object.entries(CONGELADOS)) expect(r[k], k).toBe(v);
  });

  it('ninguna regla con significado usa un token de interfaz', () => {
    const malas = reglasPlanas(env.LOTES_HTML)
      .filter((r) => CON_SIGNIFICADO.test(r.selector) && TOKEN_DE_INTERFAZ.test(r.cuerpo))
      .map((r) => r.selector + '{' + r.cuerpo + '}');
    expect(malas).toEqual([]);
  });

  it('los veredictos de Análisis y los grises de la escala salen de --ver-*', () => {
    const css = norm(cssDe(env.LOTES_HTML));
    for (const d of [
      'td.dentro input.cell,td.dentro{background:var(--ver-dentro) !important}',
      'td.fuera input.cell,td.fuera{background:var(--ver-fuera) !important}',
      '.hm-cell.v0{background:var(--ver-cero);color:var(--ver-apagado)',
      '.hm-cell.v1{background:#e7ded4;color:var(--ver-tinta)}',
      '#tab-agenda .ag-p.p5{background:var(--ver-gris)}',
      '#tab-agenda .ag-ficha.p5{color:var(--ver-apagado)}',
    ]) expect(css, d).toContain(norm(d));
  });

  it('la línea de objetivo del gráfico de SO2 molecular lee --ver-acento', () => {
    expect(env.LOTES_JS['js/dash-graficos.js']).toContain("borderColor: tok('--ver-acento', '#8a3340')");
  });
});
```

Run: `npx vitest run test/lotes-colores-congelados.test.ts`
Expected: FAIL en los cuatro (no existen los `--ver-*`; varias reglas usan `var(--nook)` etc.).

- [ ] **Step 2: Agregar los `--ver-*` al `:root` de Lotes**

En `public/lotes/index.html`, dentro de `:root`, después de la línea `--sc-0:#4a8360; …` (línea ~44):

```css
    /* --- Colores con significado (congelados el 2026-10-16) ---------------
     * Son criterios que el equipo lee de memoria: NO cambian con la estética.
     * Tienen los valores que tenían --ok/--nook/--warn/--info/--accent (y los
     * grises de la escala) antes de que Lotes tomara los tokens de Prensas.
     * Los vigila test/lotes-colores-congelados.test.ts; el muestreo de
     * scripts/muestreo-colores-lotes.js tiene que dar igual antes y después. */
    --ver-ok:#3f7d4f; --ver-mal:#b03a2e; --ver-alerta:#b07d2c; --ver-info:#5b7b86;
    --ver-acento:#8a3340; --ver-acento-linea:rgba(138,51,64,.18);
    --ver-dentro:#b7dba9; --ver-fuera:#e8a15f;
    --ver-gris:#e7e3da; --ver-apagado:#8c857b; --ver-cero:#f1efe9; --ver-tinta:#2a2622;
```

- [ ] **Step 3: Pasar cada regla con significado a su `--ver-*`**

Reemplazos exactos en `public/lotes/index.html` (buscar el texto de la izquierda, dejar el de la derecha; nada más en cada regla cambia):

| Regla (selector) | Antes | Después |
|---|---|---|
| `tr.crit td:first-child` | `var(--nook)` | `var(--ver-mal)` |
| `tr.venc td:first-child` | `var(--warn)` | `var(--ver-alerta)` |
| `#tLotes tr.nuevo td` (2 veces) | `var(--info)` | `var(--ver-info)` |
| `.legend-inline .sw.crit` | `var(--nook)` | `var(--ver-mal)` |
| `.legend-inline .sw.venc` | `var(--warn)` | `var(--ver-alerta)` |
| `.legend-inline .sw.dentro` | `background:#b7dba9` | `background:var(--ver-dentro)` |
| `.legend-inline .sw.fuera` | `background:#e8a15f` | `background:var(--ver-fuera)` |
| `td.dentro input.cell,td.dentro` | `#b7dba9` | `var(--ver-dentro)` |
| `td.fuera input.cell,td.fuera` | `#e8a15f` | `var(--ver-fuera)` |
| `.kpi-card.kpi-ok .kpi-val` | `var(--ok)` | `var(--ver-ok)` |
| `.kpi-card.kpi-warn .kpi-val` | `var(--warn)` | `var(--ver-alerta)` |
| `.kpi-card.kpi-bad .kpi-val` | `var(--nook)` | `var(--ver-mal)` |
| `.kpi-card.kpi-neutral::before` | `var(--accent)` | `var(--ver-acento)` |
| `.faq-item.hi .faq-n` | `var(--warn)` | `var(--ver-alerta)` |
| `.prox-venc` | `var(--nook)` | `var(--ver-mal)` |
| `.prox-ok` | `var(--ok)` | `var(--ver-ok)` |
| `.so2-result-box.hi .so2-val` | `var(--warn)` | `var(--ver-alerta)` |
| `.so2-result-box.pos .so2-val` | `var(--ok)` | `var(--ver-ok)` |
| `.so2-anulada-sello` | `color:var(--warn)` | `color:var(--ver-alerta)` |
| `.inv-estado.inv-ot` | `var(--info)` | `var(--ver-info)` |
| `.inv-estado.inv-medicion` | `var(--warn)` | `var(--ver-alerta)` |
| `#tAnalisis tbody tr.fila-agregado td[data-k="agregado_txt"]` | `var(--accent)` | `var(--ver-acento)` |
| `.hm-cell.v0` | `background:var(--panel2);color:var(--muted)` | `background:var(--ver-cero);color:var(--ver-apagado)` |
| `.hm-cell.v1` | `color:var(--txt)` | `color:var(--ver-tinta)` |
| `#tab-agenda .ag-p.p1` / `.p2` / `.p3` | `var(--nook)` / `var(--warn)` / `var(--info)` | `var(--ver-mal)` / `var(--ver-alerta)` / `var(--ver-info)` |
| `#tab-agenda .ag-p.p5` | `var(--line)` | `var(--ver-gris)` |
| `#tab-agenda .ag-p.tr` | `var(--accent)` | `var(--ver-acento)` |
| `#tab-agenda .ag-p.p6` | `var(--info)` | `var(--ver-info)` |
| `#tab-agenda .ag-ficha.p5` | `color:var(--muted)` | `color:var(--ver-apagado)` |
| `#tab-agenda .ag-carga i` | `var(--accent-line)` | `var(--ver-acento-linea)` |
| `#tab-agenda .ag-carga.exc` | `var(--nook)` | `var(--ver-mal)` |
| `#tab-agenda .pr-alta` / `.pr-media` / `.pr-baja` (borde y `.ag-punto`, 6 reglas) | `var(--nook)` / `var(--warn)` / `var(--ok)` | `var(--ver-mal)` / `var(--ver-alerta)` / `var(--ver-ok)` |
| `#tab-agenda .ag-dia.hoy` | `var(--accent)` (2 veces) | `var(--ver-acento)` |
| `#tab-agenda .ag-dia.hoy .ag-cab b` | `var(--accent)` | `var(--ver-acento)` |
| `#tab-agenda .ag-fer` | `color:var(--accent)` | `color:var(--ver-acento)` |

En `public/lotes/js/dash-graficos.js:403`: `borderColor: tok('--accent', '#8a3340'),` → `borderColor: tok('--ver-acento', '#8a3340'),`.

Lo que **no** se congela, porque es interfaz y pasa a los colores de Prensas en la Task 4: `.status.*`, `button.btn.danger`, `.rowbtn`, `#otTable … .ot-noexiste`, `.oc-aviso`, `.oc-chip-x`, `.ag-badge.err`, `#cfgAgenda .ag-cfg-msg`, `#cargarErrNote`, `.msg.*`, `.pill.*` (validación del pegado), la selección de la grilla (`td.gsel`, `th.gselcol`), `.alarm-lote-link`, `.note`.

- [ ] **Step 4: Tests**

Run: `npx vitest run test/lotes-colores-congelados.test.ts test/lotes-papel-intacto.test.mjs`
Expected: PASS. Si "ninguna regla con significado usa un token de interfaz" lista alguna regla, pasarla a su `--ver-*` (mismo valor que el token que usaba, según la tabla de valores de arriba) y volver a correr.

- [ ] **Step 5: Muestreo idéntico**

Recargar `http://localhost:8830/lotes/` (el mock sirve el worktree), ir al Dashboard, correr el muestreo y comparar con `muestreo-antes.json`:

```js
const antes = /* pegar el JSON de muestreo-antes.json */;
const ahora = JSON.parse(/* resultado del muestreo */);
Object.keys({...antes, ...ahora}).filter(k => antes[k] !== ahora[k]).map(k => k + ': ' + antes[k] + ' → ' + ahora[k])
```

Expected: `[]`.

- [ ] **Step 6: Suite y commit**

Correr la suite. Expected: verde.

```bash
git add public/lotes/index.html public/lotes/js/dash-graficos.js test/lotes-colores-congelados.test.ts
git commit -m "refactor(lotes): congelar los colores con significado como --ver-* (sin cambio visible)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Barra como la de Prensas (Panel · Lotes · Análisis · Movimientos · Agenda + Más)

**Files:**
- Create: `public/lotes/js/barra-lotes.js`, `test/lotes-barra.test.ts`
- Modify: `public/lotes/index.html` (header, `.tabs`, `#corrSub`, CSS de header/tabs, partes "header" y "barra de pestanas" del bloque de renovación), `public/lotes/js/nucleo.js` (`mostrarTab`, `refrescarInfo`), `public/lotes/app.js` (cableado), `public/lotes/js/vista-agenda.js:85-87` y su CSS de `.ag-bandeja`, `public/lotes/js/vista-movimientos.js:92-93`, `public/lotes/js/vista-orden.js:544`

**Interfaces:**
- Produces `js/barra-lotes.js`:
  - `montarMas() → void` (abre/cierra `#masMenu` con `#masBtn`, Escape, clic afuera)
  - `cerrarMas() → void`
  - `marcarPestana(boton: string) → void` (marca `.active` en todos los `button[data-v=boton]`, y si la pantalla vive en Más, el botón Más se marca y toma su nombre)
- Produces en el DOM: `<header class="app-barra" id="barraLotes">` con `<nav class="tabs" id="tabs">`, `#masBtn`, `#masMenu`, `#btnHistorial` y `#btnCuadricula` dentro del menú. El `header` y la clase `.tabs` se mantienen porque los usan las reglas de `@media print` (que ocultan `header` y `.tabs`).
- **Ojo con el nombre:** la clase NO puede ser `barra`: `.barra` ya es la barra de avance de la Ficha (`vista-ficha.js:clasesBarra`) y sus reglas pintarían la cabecera.

- [ ] **Step 1: Test que falla**

`test/lotes-barra.test.ts`:

```ts
/**
 * La barra de Lotes tiene que ser como la de Prensas: cinco pantallas a la
 * vista, el resto en Más, sin emojis, y pegada debajo de la barra de la
 * plataforma (--ciw-h) al hacer scroll.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { cssDe, norm } from '../scripts/css-reglas.mjs';

const html = env.LOTES_HTML;
const nav = (html.match(/<nav class="tabs" id="tabs"[\s\S]*?<\/nav>/) || [''])[0];
const principales = [...nav.replace(/<div class="mas"[\s\S]*$/, '').matchAll(/<button[^>]*data-v="([^"]+)"[^>]*>([^<]*)<\/button>/g)]
  .map((m) => [m[1], m[2].trim()]);
const menu = (nav.match(/<div class="mas-menu" id="masMenu">[\s\S]*$/) || [''])[0]
  .replace(/<div class="mas-angosto">[\s\S]*?<\/div>/, '');
const enMas = [...menu.matchAll(/data-v="([^"]+)"/g)].map((m) => m[1]);
const EMOJI = /\p{Extended_Pictographic}/u;

describe('barra de Lotes', () => {
  it('cinco pantallas a la vista, en este orden', () => {
    expect(principales).toEqual([
      ['dashboard', 'Panel'], ['lotes', 'Lotes'], ['analisis', 'Análisis'],
      ['movimientos', 'Movimientos'], ['agenda', 'Agenda'],
    ]);
  });

  it('el resto en Más', () => {
    expect(enMas.sort()).toEqual(['cargar', 'config', 'cruce', 'orden', 'so2', 'tablero']);
    expect(menu).toContain('id="btnHistorial"');
    expect(menu).toContain('id="btnCuadricula"');
  });

  it('sin emojis en pestañas ni sub-pestañas', () => {
    expect(nav).not.toMatch(EMOJI);
    const corr = (html.match(/<div class="corr-sub"[\s\S]*?<\/div>/) || [''])[0];
    expect(corr).not.toMatch(EMOJI);
    const mov = env.LOTES_JS['js/vista-movimientos.js'];
    for (const m of mov.matchAll(/\bb\('\w+', '([^']*)'\)/g)) expect(m[1]).not.toMatch(EMOJI);
    const orden = env.LOTES_JS['js/vista-orden.js'];
    for (const m of orden.matchAll(/tipoBtn\('\w+', '([^']*)'\)/g)) expect(m[1]).not.toMatch(EMOJI);
  });

  it('pegada debajo de la barra de la plataforma', () => {
    expect(norm(cssDe(html))).toContain(norm('.app-barra{position:sticky;top:var(--ciw-h,0px)'));
  });

  it('no usa la clase .barra (es la barra de avance de la Ficha)', () => {
    expect(html).not.toMatch(/<header[^>]*class="[^"]*\bbarra\b/);
  });
});
```

Run: `npx vitest run test/lotes-barra.test.ts`
Expected: FAIL.

- [ ] **Step 2: Markup de la barra**

En `public/lotes/index.html`, reemplazar desde `<header>` hasta el cierre de `<div class="tabs" id="tabs">…</div>` (líneas ~1635-1662; `<div id="avisos"></div>` queda entre medio y se mueve debajo del header) por:

```html
<header class="app-barra" id="barraLotes">
  <span class="marca">Lotes</span>
  <nav class="tabs" id="tabs" aria-label="Pantallas">
    <button type="button" data-v="dashboard" class="active">Panel</button>
    <button type="button" data-v="lotes">Lotes</button>
    <button type="button" data-v="analisis">Análisis</button>
    <button type="button" data-v="movimientos">Movimientos</button>
    <button type="button" data-v="agenda">Agenda</button>
    <div class="mas" id="masWrap">
      <button type="button" class="mas-btn" id="masBtn" aria-haspopup="true" aria-expanded="false" aria-controls="masMenu">Más</button>
      <div class="mas-menu" id="masMenu">
        <div class="mas-angosto">
          <button type="button" data-v="dashboard">Panel</button>
          <button type="button" data-v="lotes">Lotes</button>
          <button type="button" data-v="analisis">Análisis</button>
          <button type="button" data-v="movimientos">Movimientos</button>
          <button type="button" data-v="agenda">Agenda</button>
        </div>
        <div class="mas-grupo">Registro</div>
        <button type="button" data-v="cargar">Cargar análisis</button>
        <button type="button" data-v="so2">Correcciones</button>
        <div class="mas-grupo">Seguimiento</div>
        <button type="button" data-v="tablero">Tablero FML</button>
        <button type="button" data-v="cruce">Cruce con barriles</button>
        <div class="mas-grupo">Herramientas</div>
        <button type="button" data-v="orden">Orden de muestras</button>
        <button type="button" data-v="config">Configuración</button>
        <button type="button" id="btnHistorial" title="Quién guardó qué y cuándo">Historial</button>
        <button type="button" id="btnCuadricula" aria-pressed="false" title="Mostrar u ocultar el recuadro de todas las celdas de las tablas. Se recuerda en esta computadora.">Cuadrícula</button>
      </div>
    </div>
  </nav>
  <div class="right">
    <div class="segm sel-anios" id="selAnios" hidden aria-label="Años de lotes que se muestran"></div>
    <span class="status" id="redInfo" hidden></span>
    <span class="status" id="statusBar">Cargando…</span>
    <span class="status usuario" id="usuario">—</span>
  </div>
</header>

<div id="avisos"></div>
```

Y en `#corrSub` (línea ~1666): sacar `🧴 `, `💊 ` y `🧪 ` de los tres botones (quedan "Bitácora SO₂", "Orden de corrección", "Otros agregados").

En `public/lotes/js/vista-movimientos.js:93-94`: `'📋 Historial'` → `'Historial'`, `'📝 Órdenes de trabajo'` → `'Órdenes de trabajo'`, `'🛢 Mermas'` → `'Mermas'`, `'🏺 Inventario de tanques'` → `'Inventario de tanques'`.

En `public/lotes/js/vista-orden.js:544`: `'🧪 Análisis'` → `'Análisis'`, `'🦠 Microbiología'` → `'Microbiología'`.

- [ ] **Step 3: CSS de la barra (copia de la de Prensas)**

En `public/lotes/index.html`:
1. Borrar las reglas viejas `header{…}`, `header h1{…}`, `header .sub{…}`, `header .right{…}` (líneas ~58-61), `.status{…}`, `.status.dirty{…}`, `.status.saved{…}` (líneas ~62-64; van de nuevo en el bloque de abajo) y `.tabs{…}`, `.tabs button{…}`, `.tabs button.active{…}`, `.tabs button:hover{…}` (líneas ~74-77).
2. Del bloque "RENOVACION VISUAL", borrar las secciones `/* ---- header ---- */` (header, header h1, header h1::before, header .sub, header .right, .status, .status.dirty, .status.saved, #usuario:hover) y `/* ---- barra de pestanas ---- */` (.tabs, .tabs::-webkit-scrollbar, .tabs button, .tabs button:hover, .tabs button.active), y en la línea `header,.tabs,main,#avisos{position:relative;z-index:1}` sacar `header,.tabs,` (queda `main,#avisos{position:relative;z-index:1}`).
3. En su lugar (donde estaban las reglas de `header` del paso 1) poner:

```css
  /* ---- barra de la app: como la de Prensas (marca, pantallas, Más, estado) ----
   * Clase app-barra y no "barra": .barra es la barra de avance de la Ficha.
   * Sticky debajo de la barra de la plataforma (shared/barra.js publica su alto
   * en --ciw-h). z-index 40: por encima de los th sticky (7 como máximo); los
   * formularios y diálogos son <dialog> y van en la capa superior. */
  .app-barra{position:sticky;top:var(--ciw-h,0px);z-index:40;background:var(--bg);display:flex;align-items:center;gap:20px;padding:11px 26px;border-bottom:1px solid var(--rule)}
  .app-barra .marca{font-family:var(--serif);font-size:27px;font-weight:500;line-height:1;letter-spacing:.2px}
  .app-barra .right{margin-left:auto;display:flex;align-items:center;gap:14px;min-width:0}
  .tabs{display:flex;align-items:center;gap:2px}
  .tabs button[data-v],.mas-btn{background:transparent;border:none;color:var(--muted);padding:6px 11px;cursor:pointer;font-size:13.5px;font-weight:500;font-family:var(--sans);border-radius:2px;white-space:nowrap}
  .tabs button[data-v]:hover,.mas-btn:hover{color:var(--txt);background:var(--panel2)}
  .tabs > button[data-v].active,.mas-btn.active{background:var(--txt);color:var(--bg)}
  .mas{position:relative}
  .mas-btn::after{content:' ▾';font-size:10px}
  .mas-menu{position:absolute;top:calc(100% + 8px);left:0;min-width:210px;background:var(--panel);border:1px solid var(--line);border-top:2px solid var(--rule);border-radius:2px;box-shadow:0 12px 30px rgba(28,27,25,.16);padding:6px 0;display:none;z-index:45}
  .mas-menu.open{display:block}
  .mas-menu button{display:block;width:100%;text-align:left;background:none;border:none;padding:7px 16px;font-size:13.5px;font-family:var(--sans);color:var(--txt);cursor:pointer;border-radius:0}
  .mas-menu button:hover{background:var(--panel2);color:var(--txt)}
  .mas-menu button.active{color:var(--accent);font-weight:600;background:var(--accent-tinte)}
  .mas-menu #btnCuadricula[aria-pressed="true"]::before{content:'✓ '}
  .mas-grupo{font-size:9.5px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);padding:10px 16px 4px}
  .mas-angosto{display:none;border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:2px}
  .status{font-size:12px;color:var(--muted);white-space:nowrap}
  .status.dirty{color:var(--warn)}
  .status.saved{color:var(--ok)}
  .status.saved::before,.status.dirty::before{content:'';display:inline-block;width:7px;height:7px;border-radius:50%;background:currentColor;margin-right:6px;vertical-align:1px}
  .status.usuario{color:var(--txt);opacity:.75}
  @media(max-width:1100px){.app-barra .right .status.usuario{display:none}}
  @media(max-width:900px){
    .app-barra{flex-wrap:wrap;gap:10px 14px;padding:10px 16px}
    .tabs > button[data-v]{display:none}
    .mas-angosto{display:block}
    .app-barra .right{gap:8px;flex-wrap:wrap}
    .app-barra .right .status:not(#statusBar){display:none}
    #statusBar{font-size:0}
    #statusBar::before{margin-right:0}
  }
```

Nota: `--accent-tinte` lo trae `estilo.css` recién en la Task 4. Hasta entonces el fondo del ítem activo del menú no se ve (la variable no existe → transparente); es esperado.

4. La bandeja de la Agenda (sticky) mide desde la barra: en `public/lotes/js/vista-agenda.js:85-87` reemplazar

```js
  // La bandeja es sticky: se corre lo que mide la barra de pestañas (tambien sticky).
  const tabs = $('tabs');
  if (tabs && tabs.offsetHeight) sec.style.setProperty('--ag-tope', (tabs.offsetHeight + 8) + 'px');
```

por

```js
  // La bandeja es sticky: se corre lo que miden la barra de la plataforma
  // (--ciw-h, en el CSS) y la de Lotes (también sticky).
  const barra = $('barraLotes');
  if (barra && barra.offsetHeight) sec.style.setProperty('--ag-tope', (barra.offsetHeight + 8) + 'px');
```

y en la regla `#tab-agenda .ag-bandeja{…}` cambiar `max-height:calc(100vh - var(--ag-tope,64px) - 16px)` por `max-height:calc(100vh - var(--ciw-h,0px) - var(--ag-tope,64px) - 16px)` y `top:var(--ag-tope,64px)` por `top:calc(var(--ciw-h,0px) + var(--ag-tope,64px))`.

- [ ] **Step 4: `js/barra-lotes.js`**

```js
/* ===== Lotes CIW — barra: menú Más y pestaña activa =====
 * Mismo comportamiento que la barra de Prensas (prensas/app.js setupTabs):
 * las cinco pantallas principales están dos veces (en la barra y, en
 * pantallas angostas, dentro de Más), así que se marcan todas las de la misma
 * pantalla. Si la pantalla vive en Más, el botón Más toma su nombre.
 * Sin imports: nucleo.js lo importa y no puede haber ciclo. */
'use strict';

const $ = id => document.getElementById(id);

export function cerrarMas(){
  const menu = $('masMenu'), btn = $('masBtn');
  if (!menu || !btn) return;
  menu.classList.remove('open');
  btn.setAttribute('aria-expanded', 'false');
}

export function montarMas(){
  const menu = $('masMenu'), btn = $('masBtn');
  if (!menu || !btn) return;
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const abrir = !menu.classList.contains('open');
    menu.classList.toggle('open', abrir);
    btn.setAttribute('aria-expanded', String(abrir));
  });
  document.addEventListener('click', e => { if (!e.target.closest('#masWrap')) cerrarMas(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menu.classList.contains('open')){ cerrarMas(); btn.focus(); }
  });
  // Elegir algo del menú lo cierra (las pantallas las cablea app.js).
  menu.addEventListener('click', e => { if (e.target.closest('button')) cerrarMas(); });
}

/** Marca la pestaña de `boton` (el data-v; Correcciones es 'so2'). */
export function marcarPestana(boton){
  document.querySelectorAll('.tabs button[data-v]').forEach(b => b.classList.toggle('active', b.dataset.v === boton));
  const btn = $('masBtn');
  if (!btn) return;
  const enLaBarra = document.querySelector('.tabs > button[data-v="' + boton + '"]');
  const enMas = !enLaBarra && document.querySelector('#masMenu > button[data-v="' + boton + '"]');
  btn.classList.toggle('active', !!enMas);
  btn.textContent = enMas ? enMas.textContent : 'Más';
}
```

- [ ] **Step 5: Usarlo en `nucleo.js` y `app.js`**

`public/lotes/js/nucleo.js`:
1. Arriba, con los demás imports: `import { marcarPestana } from './barra-lotes.js';`
2. En `mostrarTab`, reemplazar `document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.v === boton));` por `marcarPestana(boton);`
3. En `refrescarInfo`, reemplazar `if (el) el.textContent = '📱 Red: ' + esc(ip) + ':' + j.port;` por `if (el){ el.textContent = 'Red: ' + ip + ':' + j.port; el.hidden = false; }` (textContent no necesita `esc`).

`public/lotes/app.js`:
1. Import: `import { montarMas } from './js/barra-lotes.js';`
2. Al principio del `DOMContentLoaded`, antes del bloque `/* tabs */`: `montarMas();`
3. El listener de Cuadrícula sigue igual (los ids no cambiaron); `$('btnCuadricula').classList.toggle('on', …)` queda (no molesta).

- [ ] **Step 6: Tests**

Run: `npx vitest run test/lotes-barra.test.ts test/lotes-papel-intacto.test.mjs test/lotes-colores-congelados.test.ts`
Expected: PASS los tres. (Si `lotes-papel-intacto` falla, se tocó una regla de `@media print`: las reglas `body.printing-* header` y `.tabs` tienen que seguir idénticas.)

- [ ] **Step 7: En el navegador**

Recargar `/lotes/` a 1280 px:
- Se ve "Lotes" en Cormorant (cae a Georgia hasta la Task 4, es esperado), las cinco pantallas y Más. Clic en cada una: cambia la pantalla y queda marcada; en Más → Tablero FML, el botón Más pasa a decir "Tablero FML" y se marca.
- Correcciones (desde Más) abre la última sub-pestaña usada y muestra `#corrSub`.
- Escape cierra Más y devuelve el foco al botón.
- Scroll hacia abajo en Lotes: la barra queda pegada bajo la de la plataforma. `getComputedStyle(document.getElementById('barraLotes')).top` = el valor de `--ciw-h`.
- Agenda: la bandeja queda pegada debajo de las dos barras al scrollear.
- Impresión: en Movimientos → Órdenes de trabajo, imprimir una OT (vista previa del navegador): la barra no sale.

- [ ] **Step 8: Suite y commit**

```bash
git add public/lotes/index.html public/lotes/js/barra-lotes.js public/lotes/js/nucleo.js public/lotes/app.js \
  public/lotes/js/vista-agenda.js public/lotes/js/vista-movimientos.js public/lotes/js/vista-orden.js test/lotes-barra.test.ts
git commit -m "feat(lotes): barra como la de Prensas con Más y sin emojis en pestañas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Estilo de Prensas en la interfaz

**Files:**
- Create: `test/lotes-estilo.test.ts`
- Modify: `public/lotes/index.html` (head, `:root`, reglas de base, bloque de renovación), `public/lotes/js/vista-lotes.js:699` (alto de la fila de bandas)

**Interfaces:**
- Consumes: `public/shared/estilo.css` (Etapa 1): tokens de Prensas, `--ci-tap`, `--ci-ring`, `--accent-tinte`, `@font-face` de Cormorant y Plex.
- Produces: en `#tLotes`, la variable `--lt-banda-h` (alto real de la fila de bandas) que usa la segunda fila del encabezado.

- [ ] **Step 1: Test que falla**

`test/lotes-estilo.test.ts`:

```ts
/**
 * Lotes con el estilo de Prensas: carga shared/estilo.css (tokens y letras) y
 * NO redefine ninguno de esos tokens en su :root, así el día que Prensas
 * retoque un color, Lotes lo sigue. El bloque de "renovación visual" (sombras,
 * radios de 7 a 16 px, píldoras redondas) desaparece.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { cssDe } from '../scripts/css-reglas.mjs';

const html = env.LOTES_HTML;
const PRENSAS = ['--bg', '--panel', '--panel2', '--line', '--rule', '--txt', '--muted', '--accent', '--accent2',
  '--ok', '--nook', '--warn', '--info', '--ok-tinte', '--nook-tinte', '--warn-tinte', '--accent-tinte', '--serif', '--sans'];

function definidos(css: string): string[] {
  const m = css.match(/:root\s*\{([\s\S]*?)\}/);
  return (m ? m[1] : '').split(';').map((d) => d.slice(0, d.indexOf(':')).trim()).filter((k) => k.startsWith('--'));
}

describe('estilo de Lotes', () => {
  it('carga estilo.css antes de su propio <style>', () => {
    const i = html.indexOf('<link rel="stylesheet" href="/shared/estilo.css">');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(html.indexOf('<style>'));
  });

  it('no redefine los tokens de Prensas', () => {
    const propios = definidos(cssDe(html));
    for (const k of PRENSAS) expect(propios, k).not.toContain(k);
  });

  it('sin el bloque de renovación ni radios redondos', () => {
    expect(html).not.toContain('RENOVACION VISUAL');
    const css = cssDe(html);
    expect(css).toMatch(/--r-sm:2px;\s*--r-md:2px;\s*--r-lg:2px;\s*--r-pill:2px/);
    expect(css).toMatch(/--sh-xs:none;\s*--sh-sm:none;\s*--sh-md:none;\s*--sh-lg:none/);
    // El vino viejo (138,51,64) solo queda en el token congelado.
    expect((css.match(/138,51,64/g) || []).length).toBe(1);
  });
});
```

Run: `npx vitest run test/lotes-estilo.test.ts`
Expected: FAIL.

- [ ] **Step 2: Cargar `estilo.css` y achicar el `:root`**

En el `<head>` de `public/lotes/index.html`, antes de `<style>`: `<link rel="stylesheet" href="/shared/estilo.css">`.

Reemplazar el principio del `:root` (desde `:root{` hasta la línea `--ring:0 0 0 3px rgba(138,51,64,.16);` inclusive, y la de `--ease`) por:

```css
  :root{
    /* Los tokens de interfaz (--bg, --panel, --accent, --ok, --serif, --sans…)
     * vienen de /shared/estilo.css, que es copia exacta de los de Prensas
     * (test/estilo-tokens.test.ts). Lotes NO los redefine
     * (test/lotes-estilo.test.ts). Acá quedan solo los propios de Lotes.
     *
     * Los de abajo son los nombres que usaba la "renovación visual" de
     * 2026-09; las reglas de la Agenda, la Orden de muestras y Movimientos los
     * siguen leyendo, así que se dejan con los valores de Prensas: esquina de
     * 2 px, sin sombras. */
    --accent-soft:var(--accent-tinte);
    --accent-line:rgba(90,23,36,.18);
    --bg-2:var(--bg);
    --panel-hi:var(--panel);
    --line-soft:var(--panel2);
    --ch-txt:var(--muted);      /* letras de los gráficos */
    --r-sm:2px; --r-md:2px; --r-lg:2px; --r-pill:2px;
    --sh-xs:none; --sh-sm:none; --sh-md:none; --sh-lg:none;
    --ring:var(--ci-ring);
    --ease:cubic-bezier(.32,.72,.34,1);
```

(Se borran `--bg`…`--sans`, el comentario de "Sistema visual (renovacion 2026-09)", `--accent-rgb`, y los valores viejos de los alias. Lo que sigue — `--sc-*`, `--ver-*`, `--tb-*` — no se toca.)

Buscar `rgba(var(--accent-rgb)` en el archivo: solo aparece dentro del bloque de renovación, que se borra en el Step 4. Si aparece en otro lado, reemplazar `rgba(var(--accent-rgb),X)` por `rgba(90,23,36,X)`.

- [ ] **Step 3: Reglas de base con el estilo de Prensas**

Reemplazos en `public/lotes/index.html` (regla entera por regla entera; las que no se nombran quedan):

```css
  body{margin:0;font-family:var(--sans);background:var(--bg);color:var(--txt);font-size:14px;line-height:1.4;-webkit-font-smoothing:antialiased}
  ::-webkit-scrollbar-thumb{background:#C9C2B5;border-radius:2px;border:2px solid var(--bg)}
  ::-webkit-scrollbar-thumb:hover{background:#A9A196}
  :focus-visible{outline:2px solid var(--accent);outline-offset:1px}
  #avisos .aviso{background:var(--nook);color:#fff;padding:9px 22px;font-size:13px;line-height:1.45}
  #avisos .aviso b{color:#fff;text-decoration:underline}
  button.btn{background:transparent;color:var(--txt);border:1px solid var(--txt);border-radius:2px;padding:7px 14px;cursor:pointer;font-size:13px;font-weight:500;font-family:var(--sans);line-height:1.2;white-space:nowrap;transition:border-color .15s,background .15s,color .15s}
  button.btn:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-tinte)}
  button.btn.primary{background:var(--accent);color:#F3EEE6;border-color:var(--accent)}
  button.btn.primary:hover{background:var(--accent2);border-color:var(--accent2);color:#fff}
  button.btn.primary:disabled{opacity:.35;cursor:default;background:var(--accent)}
  button.btn.danger{color:var(--nook);border-color:var(--nook)}
  button.btn.on{border-color:var(--accent);color:var(--accent);background:var(--accent-tinte)}
  main{padding:24px 24px 64px;margin:0 auto}
  .controls label{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:1.8px}
  select,input.txt,textarea{background:var(--panel);color:var(--txt);border:1px solid var(--line);border-radius:2px;padding:7px 10px;font-size:13.5px;font-family:inherit}
  select:focus,input.txt:focus,textarea:focus{border-color:var(--txt);outline:none}
  .tag{background:var(--panel);border:1px solid var(--line);border-radius:2px;padding:4px 9px;font-size:12px;color:var(--muted)}
  th{color:var(--muted);font-weight:500;font-size:10px;text-transform:uppercase;letter-spacing:1.3px;cursor:pointer;user-select:none;position:sticky;top:0;background:var(--panel);z-index:1;border-bottom:1px solid var(--rule)}
  th.banda{cursor:default;text-align:center;color:var(--txt);font-size:12px;text-transform:none;letter-spacing:.02em;background:var(--panel2);border-bottom:1px solid var(--line)}
  #tLotes thead tr:nth-child(2) th{top:var(--lt-banda-h,30px);z-index:5}
  .rowbtn{background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:2px 6px;border-radius:2px}
  .rowbtn:hover{color:var(--nook);background:var(--nook-tinte)}
  .scroll{max-height:560px;overflow:auto;background:var(--panel)}
  .scroll.tall{max-height:72vh}
  .legend-inline .sw{display:inline-block;width:13px;height:13px;border-radius:1px;vertical-align:-2px;margin-right:2px}
  .pill{display:inline-block;padding:1px 7px;border-radius:2px;font-size:11px;font-weight:600;border:1px solid transparent}
  .pill.bad{background:var(--nook-tinte);color:var(--nook);border-color:rgba(142,35,48,.25)}
  .pill.warn{background:var(--warn-tinte);color:#7A5A22;border-color:rgba(154,116,52,.3)}
  .pill.ok{background:var(--ok-tinte);color:var(--ok);border-color:rgba(86,104,74,.3)}
  .msg{padding:9px 14px;border-radius:2px;font-size:13px;margin:10px 0;border-left:3px solid}
  .msg.ok{background:var(--ok-tinte);color:#3F5035;border-color:var(--ok)}
  .msg.err{background:var(--nook-tinte);color:var(--nook);border-color:var(--nook)}
  .msg.warn{background:var(--warn-tinte);color:#7A5A22;border-color:var(--warn)}
  .msg.info{background:var(--panel);color:var(--muted);border-color:var(--line)}
  .card{background:var(--panel);border:none;border-top:1px solid var(--rule);border-radius:0;padding:16px 18px 18px;margin-bottom:22px}
  .card h2{margin:0 0 12px;font-family:var(--serif);font-size:21px;font-weight:500}
  .mfilt-btn{background:var(--panel);color:var(--txt);border:1px solid var(--line);border-radius:2px;padding:6px 10px;font-size:13px;font-family:inherit;cursor:pointer;white-space:nowrap}
  .mfilt-btn:hover{border-color:var(--txt)}
  .segm{display:inline-flex;border:1px solid var(--line);border-radius:2px;overflow:hidden}
  .segm button{background:transparent;color:var(--muted);border:none;border-left:1px solid var(--line);padding:6px 11px;font-size:13px;font-family:var(--sans);cursor:pointer}
  .segm button:hover{color:var(--txt);background:var(--panel2)}
  .segm button[aria-pressed="true"]{background:var(--txt);color:var(--bg)}
  .mfilt-panel{position:absolute;top:calc(100% + 4px);left:0;z-index:20;min-width:200px;max-width:280px;background:var(--panel);border:1px solid var(--line);border-radius:2px;box-shadow:0 10px 28px rgba(28,27,25,.14);padding:8px;display:none}
  .mfilt-search{width:100%;box-sizing:border-box;background:var(--bg);color:var(--txt);border:1px solid var(--line);border-radius:2px;padding:6px 8px;font-size:13px;font-family:inherit;margin-bottom:6px}
  .mfilt-opt{display:flex;align-items:center;gap:7px;padding:4px 6px;border-radius:2px;cursor:pointer;font-size:13px;white-space:nowrap}
  .mfilt-opt input{margin:0;cursor:pointer;accent-color:var(--accent)}
  .note{background:transparent;border:none;border-left:2px solid var(--accent);border-radius:0;padding:4px 0 4px 12px;color:var(--muted);font-size:12.5px;line-height:1.5;margin-bottom:16px;max-width:900px}
  .kpi-card{background:var(--panel);border:none;border-top:1px solid var(--rule);border-radius:0;padding:18px 20px 17px;min-width:0;flex:1;position:relative;overflow:hidden}
  .kpi-card .kpi-val{font-family:var(--serif);font-size:42px;font-weight:500;line-height:.95;margin-bottom:5px;font-variant-numeric:lining-nums tabular-nums}
  .faq-item{background:var(--panel);border:1px solid var(--line);border-radius:2px;padding:13px 15px;display:flex;flex-direction:column;gap:4px}
  .faq-item .faq-n{font-size:26px;font-weight:500;font-family:var(--serif);line-height:1}
  .so2-result-box .so2-val{font-family:var(--serif);font-size:28px;font-weight:500;line-height:1.1}
  .chip-etapa{display:inline-block;padding:2px 9px;border-radius:2px;background:var(--panel2);border:1px solid var(--line);font-weight:600;font-size:11.5px;color:var(--txt)}
  .alarm-lote-link{background:none;border:none;padding:0;color:var(--accent);cursor:pointer;font-size:12px;font-family:inherit;text-decoration:underline;text-decoration-color:rgba(90,23,36,.3);margin:1px}
  td.gsel{background:rgba(90,23,36,.10)}
  th.gselcol{background:rgba(90,23,36,.10);color:var(--txt)}
  #tLotes tbody td[data-k="lote"].gsel{background:linear-gradient(rgba(90,23,36,.10),rgba(90,23,36,.10)) var(--panel)}
  .dash-band h2{font-family:var(--serif);font-size:21px;font-weight:500;margin:0}
  .chart-card{background:var(--panel);border:none;border-top:1px solid var(--rule);border-radius:0;padding:14px 4px 12px;display:flex;flex-direction:column;min-width:0}
  .chart-card h3{margin:0;font-family:var(--sans);font-size:10px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:1.4px;display:flex;align-items:center;gap:8px}
  .corr-sub,#tab-movimientos .mov-sub,#ordenControls .oc-tipo{border-radius:2px;background:transparent;padding:0;gap:0;border:1px solid var(--line)}
  .corr-sub button,#tab-movimientos .mov-sub button,#ordenControls .oc-tipo button{border-radius:0;font-weight:500;border-left:1px solid var(--line)}
  .corr-sub button:first-child,#tab-movimientos .mov-sub button:first-child,#ordenControls .oc-tipo button:first-child{border-left:none}
  .corr-sub button.on,#tab-movimientos .mov-sub button.on,#ordenControls .oc-tipo button.on{background:var(--txt);color:var(--bg);box-shadow:none}
```

Notas:
- `.kpi-card`, `.kpi-card .kpi-val`, `.faq-item` y `.faq-item .faq-n` están **dos veces**: en la base (líneas ~533-544) y en la sección `DASHBOARD` (líneas ~1001-1024), que va después y gana. Reemplazar la de la sección `DASHBOARD` por la de arriba y borrar la de base. `.chart-card`, `.chart-card h3` y `.dash-band h2` solo están en la sección `DASHBOARD`: se reemplazan ahí. Borrar también los `:hover` que levantan o dan sombra: `.kpi-card:hover`, `.chart-card:hover`, `.faq-item:hover` (Prensas no tiene).
- La `kpi-card` conserva `position:relative;overflow:hidden` porque su riel (`::before`, congelado) es absoluto.
- Las últimas cuatro reglas (sub-pestañas) van **al final** del `<style>`, después de las de Movimientos, Correcciones y la Orden de muestras, para ganarles por orden de cascada sin subir especificidad.
- `.chart-card h3` contiene `.ch-crit` (pastilla del criterio): queda como está.
- `body.cuadricula table…{border:1px solid #d9d3c7}` es regla de papel (toca `.orden-hoja`): no se toca.

- [ ] **Step 4: Borrar el bloque de "renovación visual"**

Borrar desde el comentario `RENOVACION VISUAL (2026-09)` (línea ~848) hasta `.note{border-radius:var(--r-md)}` (línea ~991) inclusive, **salvo** estas reglas, que se mueven tal cual:
- `.orden-hoja th,.orden-hoja td{font-size:13px;text-transform:none;letter-spacing:normal;border:1px solid #888}` y `.orden-hoja th{background:#e6e6e6;color:#111}` (con su comentario "Las hojas de papel…") → justo después de `.orden-hoja tbody tr:hover{background:transparent}`. Son de papel: sin ellas, la `th` nueva (versalitas de 10 px) entraría en la hoja.
- `.barra{border-radius:var(--r-pill);height:8px;background:var(--line)}`, `.barra>span{border-radius:var(--r-pill);background:var(--sc-0)}`, `.barra.media>span{background:var(--sc-2)}`, `.barra.baja>span{background:var(--sc-4)}` → al final de la sección `/* ---- Ficha de lote ---- */`. Son los colores congelados de la barra de avance.
- `main,#avisos{position:relative;z-index:1}` (si no, `body::before` se borra junto y ya no hace falta: borrar también `body::before`).
- `.view.active{animation:fadeUp .32s var(--ease)}` **no** se mueve: queda la de la línea ~106 y la `@keyframes fadeUp` de la línea ~133. La `@media (prefers-reduced-motion:reduce)` se reemplaza por `@media (prefers-reduced-motion:reduce){.view.active{animation:none}}` (sin el `*{transition-duration:.01ms!important}`), puesta después de la `@keyframes`.

Después, buscar en el archivo `var(--sh-` y `var(--r-` que hayan quedado en reglas que antes pisaba la renovación: valen `none` / `2px` por los alias, no hay que tocarlas.

- [ ] **Step 5: Alto real de la fila de bandas de Lotes**

El encabezado de Lotes tiene dos filas y la segunda se apoya en `top:var(--lt-banda-h,30px)`. Con Plex y `line-height:1.4` la primera ya no mide 30 px; se mide. En `public/lotes/js/vista-lotes.js`, justo después de `t.innerHTML = h + '<tbody></tbody>' + _filaMedidoraLotes(t._rows, bandas, colsDe);` (línea ~699):

```js
  /* La segunda fila del encabezado (columnas) se apoya debajo de la de bandas
   * (las dos son sticky). Su alto depende de la letra y, en pantallas táctiles,
   * de los blancos de 44 px: se mide en vez de escribirlo a mano. Oculta (otra
   * pestaña, content-visibility) mide 0: se deja el valor anterior. */
  const filaBandas = t.tHead && t.tHead.rows[0];
  const altoBandas = filaBandas ? filaBandas.getBoundingClientRect().height : 0;
  if (altoBandas > 0) t.style.setProperty('--lt-banda-h', altoBandas + 'px');
```

- [ ] **Step 6: Tests**

Run: `npx vitest run test/lotes-estilo.test.ts test/lotes-colores-congelados.test.ts test/lotes-papel-intacto.test.mjs test/lotes-barra.test.ts test/estilo-tokens.test.ts`
Expected: PASS los cinco.

- [ ] **Step 7: En el navegador**

Recargar `/lotes/` a 1280 px:
- Muestreo de colores (Dashboard visible) **idéntico** a `muestreo-antes.json` (comparación del Task 2, Step 5). Si alguna muestra cambió, su regla todavía lee un token de interfaz: congelarla (Task 2) y repetir.
- `getComputedStyle(document.querySelector('.card h2')).fontFamily` empieza con `"Cormorant Garamond"` y `document.fonts.check('500 24px "Cormorant Garamond"')` da `true` (esto resuelve el pendiente "Cormorant no carga para el h2 del diálogo").
- Lotes: scrollear la tabla hacia abajo: la fila de columnas queda pegada **justo** debajo de la de bandas (sin hueco ni encime): `document.querySelector('#tLotes thead tr:nth-child(2) th').getBoundingClientRect().top` = `bottom` de `#tLotes thead tr:first-child th.banda`.
- Análisis: scrollear rápido hasta abajo y volver: sin huecos en blanco ni filas repetidas (la tabla virtual mide el alto de fila con la letra nueva).
- Gráficos del Dashboard: letras en Plex, grilla en el gris de Prensas; colores de barras y la línea punteada de objetivo iguales (el muestreo ya lo dice).
- Fotos de cada pestaña a 1280 px en `$S/despues-*.png`.

- [ ] **Step 8: Suite y commit**

```bash
git add public/lotes/index.html public/lotes/js/vista-lotes.js test/lotes-estilo.test.ts
git commit -m "feat(lotes): estilo de Prensas en la interfaz (estilo.css, Cormorant y Plex, sin la renovación visual)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Infraestructura de avisos y diálogos

**Files:**
- Modify: `public/shared/dialogo-modelo.js`, `public/shared/dialogo.js`, `test/dialogo-modelo.test.mjs`
- Create: `public/lotes/js/dialogos.js`, `test/lotes-sin-ventanas-nativas.test.ts`
- Modify: `public/lotes/index.html` (`#overlay` → `<dialog>` y su CSS), `public/lotes/js/nucleo.js`, `public/lotes/app.js`, `public/lotes/js/grilla.js:628`, `public/lotes/js/vista-orden-correccion.js:1195`, `public/lotes/js/vista-ot-confirmar.js:62,253`

**Interfaces:**
- Produces `CI.informar(op: string | {titulo, texto, si}) → Promise<void>` y `CIDialogoModelo.normalizarInformar(op) → {titulo, texto, si}` (defaults `titulo: 'Aviso'`, `si: 'Entendido'`; "Aceptar"/"OK" → "Entendido").
- Produces `js/dialogos.js`: `avisar(texto, op?) → {cerrar()}`, `informar(op) → Promise<void>`, `confirmar(op) → Promise<boolean>`, `pedir(op) → Promise<string|null>` (mismas opciones que `CI.*`).
- Produces en `nucleo.js`: `overlayAbierto() → boolean`; `mostrarOverlay(html)` / `cerrarOverlay()` con la misma firma; `avisoBreve(texto, tipo)` con la misma firma (ahora es `CI.avisar`); `usuarioActual()` devuelve el nombre de la sesión; `pedirUsuario()` ya no pregunta.

- [ ] **Step 1: Tests que fallan (modelo y vigilancia)**

Agregar a `test/dialogo-modelo.test.mjs`:

```js
describe('normalizarInformar', () => {
  it('acepta solo un texto', () => {
    expect(M.normalizarInformar('La OT no se guardó.')).toEqual({ titulo: 'Aviso', texto: 'La OT no se guardó.', si: 'Entendido' });
  });
  it('respeta el título y el botón, menos Aceptar/OK', () => {
    expect(M.normalizarInformar({ titulo: 'No se guardó', texto: 'x', si: 'Volver' })).toEqual({ titulo: 'No se guardó', texto: 'x', si: 'Volver' });
    expect(M.normalizarInformar({ texto: 'x', si: 'OK' }).si).toBe('Entendido');
  });
});
```

`test/lotes-sin-ventanas-nativas.test.ts`:

```ts
/**
 * Lotes no usa alert/confirm/prompt: frenan la pantalla, no se pueden diseñar
 * y en el celular se leen mal. Todo pasa por js/dialogos.js (que delega en
 * CI.* de shared/dialogo.js y solo cae a las nativas si ese script no cargó).
 *
 * PENDIENTES se vacía tarea a tarea (Etapa 2 de la estética, Tasks 5-7).
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const PENDIENTES = new Set([
  'js/guardar-ot.js', 'js/vista-movimientos.js', 'js/vista-ot-emitir.js', 'js/vista-ot-confirmar.js',
  'js/vista-ot-lista.js', 'js/vista-mermas.js', 'js/vista-inventario-tanques.js',
  'js/vista-agenda.js', 'js/vista-agregados.js', 'js/vista-analisis.js', 'js/vista-cargar.js',
  'js/vista-config-agenda.js', 'js/vista-config.js', 'js/vista-cruce.js', 'js/vista-lotes.js',
  'js/vista-orden-correccion.js', 'js/vista-so2.js',
]);
const PERMITIDO = 'js/dialogos.js';

const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const NATIVA = /(?:^|[^\w$.])(?:alert|confirm|prompt)\s*\(|window\.(?:alert|confirm|prompt)\s*\(/m;

describe('Lotes sin ventanitas nativas', () => {
  it('ningún archivo (salvo los pendientes) llama a alert/confirm/prompt', () => {
    const conNativas = Object.entries(env.LOTES_JS)
      .filter(([f, src]) => f !== PERMITIDO && !PENDIENTES.has(f) && NATIVA.test(sinComentarios(src)))
      .map(([f]) => f);
    expect(conNativas).toEqual([]);
  });

  it('los pendientes de verdad tienen alguna (si no, sacalos de la lista)', () => {
    for (const f of PENDIENTES) expect(NATIVA.test(sinComentarios(env.LOTES_JS[f] || '')), f).toBe(true);
  });

  it('el overlay es un <dialog>', () => {
    expect(env.LOTES_HTML).toMatch(/<dialog id="overlay"[^>]*><div class="box" id="overlayBox"><\/div><\/dialog>/);
  });
});
```

Run: `npx vitest run test/dialogo-modelo.test.mjs test/lotes-sin-ventanas-nativas.test.ts`
Expected: FAIL (`normalizarInformar` no existe; `js/nucleo.js` y `app.js` no están en pendientes pero tienen nativas; el overlay es un `<div>`).

- [ ] **Step 2: `CI.informar` y el aviso dentro del diálogo modal**

En `public/shared/dialogo-modelo.js`, antes de `function normalizarPedir`:

```js
  function normalizarInformar(op) {
    if (typeof op === 'string') op = { texto: op };
    op = op || {};
    var si = str(op.si, 'Entendido');
    if (/^(aceptar|ok)$/i.test(si.trim())) si = 'Entendido';
    return { titulo: str(op.titulo, 'Aviso'), texto: str(op.texto, ''), si: si };
  }
```

y agregar `normalizarInformar: normalizarInformar,` al objeto `g.CIDialogoModelo`.

En `public/shared/dialogo.js`:

1. Reemplazar la función `contenedor()` por:

```js
  // Con un <dialog> modal abierto, todo lo de afuera queda debajo de su fondo
  // (la capa superior): el aviso se cuelga del diálogo modal de más arriba.
  function anfitrion() {
    var abiertos = d.querySelectorAll('dialog[open]');
    for (var i = abiertos.length - 1; i >= 0; i--) {
      try { if (abiertos[i].matches(':modal')) return abiertos[i]; } catch (e) { /* navegador sin :modal */ }
    }
    return d.body;
  }
  function contenedor() {
    if (!caja) {
      caja = el('div', 'ci-avisos');
      caja.setAttribute('role', 'status');
      caja.setAttribute('aria-live', 'polite');
    }
    var h = anfitrion();
    if (caja.parentNode !== h) h.appendChild(caja);
    return caja;
  }
```

2. Después de `function confirmar(op){…}`:

```js
  // Una noticia que hay que leer: un solo botón. Escape también la cierra.
  function informar(op) {
    var c = M.normalizarInformar(op);
    return abrir(function (form, terminar) {
      form.appendChild(el('h2', '', c.titulo));
      if (c.texto) form.appendChild(el('p', '', c.texto));
      var p = el('div', 'ci-pie');
      var si = el('button', 'si', c.si);
      si.type = 'submit';
      p.appendChild(si);
      form.appendChild(p);
      form.addEventListener('submit', function (e) { e.preventDefault(); terminar(true); });
      return si;
    }).then(function () {});
  }
```

3. Al final, junto a los demás: `g.CI.informar = informar;`

Run: `npx vitest run test/dialogo-modelo.test.mjs`
Expected: PASS.

- [ ] **Step 3: `public/lotes/js/dialogos.js`**

```js
/* ===== Lotes CIW — avisos y diálogos =====
 * Puerta única a CI.avisar / CI.informar / CI.confirmar / CI.pedir
 * (public/shared/dialogo.js, lo inyecta el servidor antes que la app). Si por
 * algo no cargó, cae a las ventanitas del navegador: mejor fea que muda.
 * Es el ÚNICO archivo de Lotes que puede llamar a alert/confirm/prompt
 * (test/lotes-sin-ventanas-nativas.test.ts).
 *
 * Cuándo usar cada una:
 *  - avisar: algo que se ve y se va solo (falta un dato, no hubo nada que hacer).
 *  - informar: una noticia que hay que leer sí o sí (no se guardó, el PDF se descargó).
 *  - confirmar: una decisión. `si` dice la acción ("Eliminar lote"); lo
 *    destructivo con `peligro: true` (el foco arranca en Cancelar).
 *  - pedir: un dato; con `campo.opciones` muestra una lista. */
'use strict';

const ci = () => (window.CI && window.CI.confirmar) ? window.CI : null;
const plano = op => typeof op === 'string' ? op : [op.titulo, op.texto].filter(Boolean).join('\n\n');

/** tipo: 'ok' | 'mal' | 'info'. No frena nada. */
export function avisar(texto, op = {}){
  const c = ci();
  if (c) return c.avisar(texto, op);
  window.alert(texto);
  return { cerrar(){} };
}

export async function informar(op){
  const c = ci();
  if (c) return c.informar(op);
  window.alert(plano(op));
}

export async function confirmar(op){
  const c = ci();
  if (c) return c.confirmar(op);
  return window.confirm(plano(op));
}

export async function pedir(op){
  const c = ci();
  if (c) return c.pedir(op);
  const r = window.prompt(plano(op), (op.campo && op.campo.valor) || '');
  return r == null ? null : r.trim();
}
```

- [ ] **Step 4: El overlay pasa a `<dialog>`**

`public/lotes/index.html`: reemplazar `<div class="overlay" id="overlay"><div class="box" id="overlayBox"></div></div>` por `<dialog id="overlay" aria-label="Formulario"><div class="box" id="overlayBox"></div></dialog>`.

CSS: reemplazar las reglas `.overlay{…}`, `.overlay.show{…}`, `.overlay .box{…}`, `.overlay .box:has(.otc-tabla){max-width:760px}` y `.overlay .box:has(.otc-envs){max-width:1100px}` por:

```css
  /* ---- overlay: los formularios de Lotes, en un <dialog> modal ----
   * showModal: Escape cierra, el foco queda adentro y vuelve al cerrar
   * (nucleo.js mostrarOverlay/cerrarOverlay). Estilo de .overlay .box de Prensas. */
  #overlay{border:none;border-top:2px solid var(--rule);border-radius:2px;padding:0;background:var(--panel);color:var(--txt);width:90%;max-width:min(460px,calc(100vw - 24px));max-height:calc(100dvh - 32px);box-shadow:0 20px 50px rgba(28,27,25,.25)}
  #overlay::backdrop{background:rgba(28,27,25,.45)}
  #overlay .box{padding:24px 28px;text-align:center;position:relative}
  #overlay .box h2,#overlay .box h3{font-family:var(--serif);font-weight:500;font-size:24px}
  /* confirmar una OT de trasiego: 5 columnas con campos; el paso 2 trae además los envases */
  #overlay:has(.otc-tabla){max-width:min(760px,calc(100vw - 24px))}
  #overlay:has(.otc-envs){max-width:min(1100px,calc(100vw - 24px))}
  @media (max-width:760px){#overlay{width:calc(100vw - 16px);max-width:none}#overlay .box{padding:18px 16px}}
```

(`.overlay-cerrar` y las reglas `#overlayBox …` quedan como están.)

`public/lotes/js/nucleo.js`, reemplazar el bloque `/* ---------- overlay ---------- */`:

```js
/* ---------- overlay ----------
 * Un <dialog> modal: Escape (evento cancel, cableado en app.js) y el clic en el
 * fondo lo cierran; el foco vuelve a donde estaba. Volver a llamar a
 * mostrarOverlay con uno abierto solo cambia su contenido (los asistentes
 * pasan de paso así). */
let _focoAntesOverlay = null;
export function overlayAbierto(){ return !!$('overlay').open; }
export function mostrarOverlay(html){
  const dlg = $('overlay');
  $('overlayBox').innerHTML = html;
  if (!dlg.open){ _focoAntesOverlay = document.activeElement; dlg.showModal(); }
}
export function cerrarOverlay(){
  const dlg = $('overlay');
  if (!dlg.open) return;
  dlg.close();
  const f = _focoAntesOverlay; _focoAntesOverlay = null;
  if (f && f.isConnected && typeof f.focus === 'function') f.focus();
}
```

En `_ocupado()` (nucleo.js:260): `overlayAbierto: $('overlay').classList.contains('show')` → `overlayAbierto: !!document.querySelector('dialog[open]')` (cualquier diálogo abierto, incluidas las preguntas de `CI.*` y los paneles de la Agenda, frena la actualización en vivo).

Reemplazar `.classList.contains('show')` del overlay por `.open` en: `public/lotes/js/grilla.js:628` (`document.getElementById('overlay')?.open`), `public/lotes/js/vista-orden-correccion.js:1195` (`$('overlay').open`), `public/lotes/js/vista-ot-confirmar.js:62` y `:253` (`!$('overlay').open`), `public/lotes/app.js:84` (`if ($('overlay').open){ e.preventDefault(); return; }`).

`public/lotes/app.js`:
1. Borrar `document.addEventListener('keydown', e => { if(e.key==='Escape') cerrarOverlay(); });` y su comentario: con un diálogo de `CI` abierto encima del overlay, ese Escape cerraba los dos.
2. Al lado de `$('overlay').addEventListener('click', …)` agregar: `$('overlay').addEventListener('cancel', e => { e.preventDefault(); cerrarOverlay(); });`

- [ ] **Step 5: `avisoBreve`, usuario de la sesión, autoguardado y las 8 nativas de `nucleo.js`**

`public/lotes/js/nucleo.js`:

1. Import: `import { avisar, informar, confirmar } from './dialogos.js';`
2. Reemplazar `avisoBreve` (y `let _timerAviso = null;`) por:

```js
/** Cartel corto al pie (deshacer, actualizaciones). Ahora es CI.avisar: el
 *  toast propio (z-index 9999) se encimaba con los avisos de la plataforma. */
export function avisoBreve(texto, tipo){
  avisar(texto, { tipo: tipo === 'error' ? 'mal' : (tipo || 'info'), ms: 3000 });
}
```

3. Reemplazar el bloque `/* ---------- usuario (trazabilidad) ---------- */` (`usuarioActual` y `pedirUsuario`) por:

```js
/* ---------- usuario (trazabilidad) ----------
 * Es el de la sesión de la plataforma (window.CIW, lo pone el servidor) y ya
 * no se pregunta: el servidor anota además el email de la sesión en el
 * historial (src/lotes/rutas.ts, POST /datos). localStorage queda de respaldo
 * para la página suelta sin servidor. */
export function usuarioActual(){
  const ciw = window.CIW || {};
  if (ciw.nombre || ciw.email) return String(ciw.nombre || ciw.email);
  try { return localStorage.getItem('lotes_usuario') || ''; } catch(e) { return ''; }
}
/** Compatibilidad: quien pedía el nombre ahora recibe el de la sesión. */
export function pedirUsuario(){
  const u = usuarioActual();
  const el = $('usuario'); if (el) el.textContent = u || '(sin sesión)';
  return u;
}
```

4. En `markDirty()` borrar la línea `if (!_nombrePedido && !usuarioActual()){ _nombrePedido = true; pedirUsuario(true); }`, y borrar `let _nombrePedido = false;` con su comentario.
5. El autoguardado espera a que se conteste una pregunta abierta. Antes de `const _auto = crearAutoguardado({`:

```js
/* Con una pregunta de CI (confirmar/pedir/informar) abierta, el autoguardado
 * espera. Antes confirm() frenaba todo; ahora no, y un guardado con fusión
 * (409) en el medio dejaría a la función que preguntó trabajando sobre
 * objetos viejos de DATOS(). El overlay de formularios no cuenta: esos ya
 * buscan el objeto "vivo" al aceptar. */
function _sinPreguntasAbiertas(){
  const hay = () => !!document.querySelector('dialog.ci-dialogo[open]');
  if (!hay()) return Promise.resolve();
  return new Promise(ok => { const t = setInterval(() => { if (!hay()){ clearInterval(t); ok(); } }, 250); });
}
```

y cambiar `ejecutar: () => _guardarEnCola(false),` por `ejecutar: () => _sinPreguntasAbiertas().then(() => _guardarEnCola(false)),`.

6. Las nativas de `nucleo.js`:

| Línea | Antes | Después |
|---|---|---|
| ~348 `verHistorial` | `alert('No se pudo cargar el historial (' + r.status + ').')` | `avisar('No se pudo cargar el historial (' + r.status + ').', { tipo: 'mal' })` |
| ~362 `verHistorial` | `alert('No se pudo cargar el historial.')` | `avisar('No se pudo cargar el historial.', { tipo: 'mal' })` |
| ~552 `_guardar` | `alert('No se pudo guardar:\n• ' + det)` | `await informar({ titulo: 'No se pudo guardar', texto: '• ' + det })` |
| ~553 `_guardar` | `if (confirm('⚠️ El servidor FRENÓ … último guardado.'))` | ver abajo |
| ~561 `_guardar` | `alert('Error al guardar: ' + (j.error \|\| r.status))` | `await informar({ titulo: 'Error al guardar', texto: String(j.error \|\| r.status) })` |
| ~598 `_guardar` | `alert('No se pudo guardar: ' + (…))` | `await informar({ titulo: 'No se pudo guardar', texto: (j.detalles && j.detalles[0]) \|\| 'Tu usuario no tiene permiso para guardar en Lotes.' })` |
| ~745 `guardar` | `alert('No se pudo guardar: no hay conexión …')` | `await informar({ titulo: 'Sin conexión', texto: 'No se pudo guardar: no hay conexión con el servidor. Tus cambios siguen en pantalla y quedaron guardados en este equipo; se van a guardar solos cuando vuelva la señal.' })` |

El freno (~553), que **sigue** con la misma semántica (Cancelar = deshacer lo de este guardado):

```js
      const forzar = await confirmar({
        titulo: 'El servidor frenó este guardado',
        texto: 'Lo frenó para proteger los datos:\n\n• ' + det +
          '\n\nSi era tu intención, guardalo igual: queda registrado como FORZADO en el historial. ' +
          'Si no, se deshace lo que hiciste desde el último guardado.',
        si: 'Guardar igual', no: 'Deshacer lo mío', peligro: true,
      });
      if (forzar) return _guardar(true);
      return _alCancelarFreno();
```

Y en `verHistorial`, el título del overlay: `'<h2 style="margin-top:0">🕘 Historial de guardados</h2>'` → `'<h2 style="margin-top:0">Historial de guardados</h2>'`. En el overlay de conflicto (~575): `'<button class="btn primary" onclick="location.reload()">🔄 Recargar y recuperar</button>'` → `'… >Recargar y recuperar</button>'` y el `h2` sin `color:#ffd766` (era para el fondo oscuro viejo).

`public/lotes/app.js`:
1. Borrar `$('usuario').addEventListener('click', () => pedirUsuario(true));`.
2. Reemplazar `const u = usuarioActual(); $('usuario').textContent = '👤 ' + (u || '(sin nombre)');` por `pedirUsuario();`.
3. Sacar `usuarioActual` del import de nucleo si quedó sin usar.

`public/lotes/index.html`: el `#usuario` ya quedó sin `cursor:pointer` en la Task 3; agregarle `title="Usuario de la sesión: queda registrado en cada guardado."`.

- [ ] **Step 6: Tests**

Run: `npx vitest run test/dialogo-modelo.test.mjs test/lotes-sin-ventanas-nativas.test.ts test/lotes-autoguardado.test.mjs test/lotes-en-vivo.test.mjs test/inyeccion.test.ts`
Expected: PASS.

- [ ] **Step 7: En el navegador**

- Consola: `await CI.informar({titulo:'Prueba',texto:'x'})` abre un diálogo con un solo botón "Entendido".
- Lotes → ✕ de un lote: todavía `confirm()` nativo (pendiente, Task 7). Abrir un formulario con overlay (Movimientos → "Nueva OT" o la ventana de envases de un lote): es un `<dialog>` (fondo oscurecido, Tab no se escapa), Escape lo cierra y el foco vuelve al botón que lo abrió; clic en el fondo lo cierra.
- Con el overlay abierto: `CI.avisar('hola')` se ve **encima** del fondo (colgado del diálogo).
- Ctrl+Z con un cambio hecho: el aviso "Deshecho: …" sale con el estilo de `ci-aviso`, abajo al centro, y no se encima con otro cartel (`document.getElementById('avisoBreve')` es `null`).
- El nombre de la barra dice "Oriana Prueba" (el del mock) y no pide nada al editar una celda.
- Freno: en la consola, `window.fetch` envuelto para que `POST /lotes/api/datos` devuelva `400 {"error":"validacion","detalles":["Se borrarían 50 lotes"]}`; editar una celda y esperar 2 s: aparece "El servidor frenó este guardado" con "Guardar igual" en rojo y el foco en "Deshacer lo mío"; Escape deshace la edición (igual que el Cancelar de antes).
- Autoguardado y pregunta: editar una celda y, antes de 2 s, en consola `CI.confirmar({texto:'espera'})`; en Network no sale ningún `POST /datos` hasta contestar.

- [ ] **Step 8: Suite y commit**

```bash
git add public/shared/dialogo-modelo.js public/shared/dialogo.js test/dialogo-modelo.test.mjs \
  public/lotes/js/dialogos.js test/lotes-sin-ventanas-nativas.test.ts public/lotes/index.html \
  public/lotes/js/nucleo.js public/lotes/app.js public/lotes/js/grilla.js \
  public/lotes/js/vista-orden-correccion.js public/lotes/js/vista-ot-confirmar.js
git commit -m "feat(lotes): overlay en <dialog>, CI.informar, avisos propios y usuario de la sesión

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ventanitas de Movimientos, OT, mermas e inventario (32)

**Files:**
- Modify: `public/lotes/js/guardar-ot.js`, `vista-movimientos.js`, `vista-ot-emitir.js`, `vista-ot-corte.js`, `vista-ot-confirmar.js`, `vista-ot-lista.js`, `vista-mermas.js`, `vista-inventario-tanques.js`, `test/lotes-sin-ventanas-nativas.test.ts`

**Interfaces:**
- Consumes: `avisar`, `informar`, `confirmar` de `./dialogos.js` (Task 5).
- Changes: `confirmarNumeroRepetido(numero)` (vista-ot-emitir.js) pasa a `async → Promise<boolean>`; sus dos llamadores lo `await`ean.

Reglas para cada reemplazo (valen también en la Task 7):
1. Agregar el import `import { avisar, informar, confirmar } from './dialogos.js';` (solo los nombres que use el archivo).
2. Si la función que llama no es `async`, se hace `async`. Si es un listener (`addEventListener('click', e => {…})`), se cambia a `async e => {…}`. Si el listener llama a `e.preventDefault()` o `e.stopPropagation()`, eso queda **antes** del primer `await`.
3. Si un aviso va antes de `cerrarOverlay()`, se lo pone **después**: si no, se cuelga del overlay y se va con él.
4. Los textos que antes llevaban `esc(...)` dentro de un `confirm` lo pierden: `CI` escribe con `textContent`.

- [ ] **Step 1: Sacar los siete archivos de `PENDIENTES` y ver el test fallar**

En `test/lotes-sin-ventanas-nativas.test.ts`, borrar de `PENDIENTES`: `js/guardar-ot.js`, `js/vista-movimientos.js`, `js/vista-ot-emitir.js`, `js/vista-ot-confirmar.js`, `js/vista-ot-lista.js`, `js/vista-mermas.js`, `js/vista-inventario-tanques.js`.

Run: `npx vitest run test/lotes-sin-ventanas-nativas.test.ts`
Expected: FAIL listando esos siete.

- [ ] **Step 2: `guardar-ot.js` (6)**

| Línea | Después |
|---|---|
| 55 | `await informar({ titulo: 'Esa carpeta no parece la de OT', texto: 'No tiene «B Ordenes de agregados». ¿Es «Ordenes de Trabajo 2026»? Si no, volvé a elegirla.' });` |
| 74 | `if (!numero){ avisar('Falta el N° de orden.', { tipo: 'mal' }); return { ok: false }; }` |
| 83 | `await informar({ titulo: 'Ese número ya está en la carpeta', texto: 'El N° ' + numero + ' ya está: «' + usado + '».\nTe propongo el ' + libre + '. Revisalo y volvé a imprimir.' });` |
| 86 | `if (!await confirmar({ titulo: 'Número repetido en la carpeta', texto: 'Ya hay otro archivo con el N° ' + numero + ': «' + usado + '».', si: 'Guardar igual', no: 'Cancelar' }))` |
| 123 | `await informar({ titulo: 'El PDF se descargó', texto: 'No hay carpeta de OT elegida. Copiá el PDF a la carpeta y revisá el número a mano.' });` |
| 126 | `await informar({ titulo: 'No se pudo escribir en la carpeta', texto: '¿Falta permiso? El PDF se descargó: copialo a mano.' });` |

En el `<h3>` del overlay (línea ~89): `🖨 Imprimir y guardar` → `Imprimir y guardar`.

- [ ] **Step 3: `vista-movimientos.js` (16)**

```js
  // 222
  const sinOT = () => { cerrarOverlay(); avisar('La ' + ot.ot + ' ya no está en los datos actuales (¿la borraron desde otra PC?). No se cambió nada.', { tipo: 'mal' }); renderMovimientos(); };
  // 224-225
  $('otbSolo').addEventListener('click', async () => {
    if (!await confirmar({ titulo: 'Borrar solo la OT', texto: 'Los lotes quedan como los dejó la OT.', si: 'Borrar solo la OT', no: 'Volver', peligro: true })) return;
  // 237 (el overlay se vuelve a abrir enseguida: el aviso queda colgado de él)
      avisar('Los lotes de esta OT cambiaron mientras mirabas esta ventana. Revisá de nuevo qué vuelve atrás.', { tipo: 'info' });
```

El listener de la tabla (línea ~556, `t.addEventListener('click', e => {`) pasa a `async e => {`, y:

```js
          // 590
          if (await confirmar({
            titulo: 'Eliminar la ' + ot.ot,
            texto: 'Esta fila es de la ' + ot.ot + ' (' + n + (n === 1 ? ' lote' : ' lotes') + '). Se elimina la OT completa con ' +
              (n === 1 ? 'su movimiento' : 'sus ' + n + ' movimientos') + '.' + corte,
            si: 'Eliminar OT', no: 'Cancelar', peligro: true })){
        // 598
        if (await confirmar({
          titulo: 'Eliminar movimiento',
          texto: 'Movimiento del lote ' + (o.lote || '(sin lote)') + ' (' + (o.tipo || '') + ' ' + fmtFecha(o.fecha) + ').',
          si: 'Eliminar', no: 'Cancelar', peligro: true })){
            // 601
            avisar('No se encontró ese movimiento en los datos actuales (puede que se hayan recargado). No se borró nada.', { tipo: 'mal' });
```

`_aceptarModalOT` (ya es `async`):

| Línea | Después |
|---|---|
| 933 | `if (!lote){ avisar('Falta el lote.', { tipo: 'mal' }); $('otfLote').focus(); return; }` |
| 938 | `if (!fecha){ avisar('Falta la fecha.', { tipo: 'mal' }); $('otfFecha').focus(); return; }` |
| 944 | `!await confirmar({ titulo: 'Lote que no está en la lista', texto: 'El lote ' + lote + ' no está en la lista de lotes. Puede ser uno que todavía no se cargó.', si: 'Seguir igual', no: 'Revisar' })) return;` |
| 948 | `if (litrosTxt !== '' && litros == null){ avisar('Los litros no son un número válido.', { tipo: 'mal' }); $('otfLitros').focus(); return; }` |
| 996 | `await informar({ titulo: 'La OT no se guardó', texto: 'Quedó en pantalla pero NO se guardó, así que todavía no conviene imprimirla: resolvé el guardado y usá el botón 🖨 de la fila.' });` |
| 1000 | `if (await confirmar({ titulo: 'OT emitida y guardada', texto: '¿Imprimir la hoja para el operario?', si: 'Imprimir hoja', no: 'Ahora no' })){` |
| 1014 | `avisar('Falta el operario: la confirmación registra quién hizo el trabajo.', { tipo: 'mal' }); $('otfOperario').focus();` |
| 1017 | `if (litros == null && !await confirmar({ titulo: 'Confirmar sin litros', texto: 'Vas a confirmar el trabajo sin litros reales.', si: 'Confirmar sin litros', no: 'Volver' })) return;` |
| 1024 | `cerrarOverlay(); avisar('No se encontró ese movimiento en los datos actuales (puede que se hayan recargado). No se confirmó nada.', { tipo: 'mal' });` (y borrar el `cerrarOverlay();` que venía después) |
| 1031 | `cerrarOverlay(); avisar('Este movimiento ya figura como ejecutado (¿lo confirmaron desde otra PC?). No se cambió nada.', { tipo: 'mal' });` (ídem) |

- [ ] **Step 4: OT (`vista-ot-emitir.js` 4, `vista-ot-corte.js`, `vista-ot-confirmar.js` 1, `vista-ot-lista.js` 2)**

`vista-ot-emitir.js`:

```js
  // 270-271 (dentro de _emitir, ya async)
  if (error){ avisar(error, { tipo: 'mal' }); return; }
  if (!await confirmarNumeroRepetido(numero)) return;

// 299-304
export async function confirmarNumeroRepetido(numero){
  const d0 = DATOS();
  const yaExiste = (d0.movimientos || []).some(m => m.ot === numero) ||
    (d0.ordenes_trabajo || []).some(o => o.ot === numero);
  if (!yaExiste) return true;
  return confirmar({ titulo: 'Número de OT repetido', texto: 'El número ' + numero + ' ya existe en las OT de la web.', si: 'Usarlo igual', no: 'Cambiarlo' });
}

    // 354
    await informar({ titulo: 'La OT no se guardó', texto: 'Todavía no conviene imprimirla. Resolvé el guardado; si la OT sigue en «Órdenes de trabajo», su botón 🖨 vuelve a intentar guardar, y si no, emitila de nuevo.' });

  // 394
  await informar({ titulo: 'Ese número ya está en la carpeta', texto: 'El N° ' + numero + ' ya está en la carpeta de OT: «' + usado + '».\nTe propongo el ' + libre + '. Revisalo y volvé a emitir.' });
```

`vista-ot-corte.js:244`: `if (!confirmarNumeroRepetido(st.numero)) return;` → `if (!await confirmarNumeroRepetido(st.numero)) return;` (la función ya es `async`: la línea 247 tiene `await`).

`vista-ot-confirmar.js:408` (`_aplicar`, ya `async`):

```js
    if (sinLitros && !await confirmar({ titulo: 'Lotes sin litros medidos', texto: 'La OT se confirma igual y esos lotes no se tocan.', si: 'Confirmar OT', no: 'Volver' })){
```

`vista-ot-lista.js`:

```js
  // 125-126
  if ($('otlPlantilla')) $('otlPlantilla').addEventListener('click', async () => {
    if (!await confirmar({ titulo: 'Volver al original', texto: 'Se descarta todo lo escrito sobre la hoja de ' + ot.ot + ' (pasos, casilleros y título).', si: 'Volver al original', no: 'Cancelar', peligro: true })) return;
  // 197
  if (!ot){ avisar('Esta OT ya no está en los datos guardados (¿la borraron desde otra PC?).', { tipo: 'mal' }); _cb.onCambio(); return; }
```

- [ ] **Step 5: `vista-mermas.js` (1) e inventario de tanques (2)**

`vista-mermas.js:62-67`: el listener pasa a `async () => {` y

```js
    if (!await confirmar({ titulo: 'Barrica resuelta', texto: `La barrica ${m.barril} del lote ${m.lote} queda marcada como resuelta.`, si: 'Marcar resuelta', no: 'Cancelar' })) return;
```

`vista-inventario-tanques.js`:

```js
    // 163-165
    $('invCancelarRec').addEventListener('click', async () => {
      const n = contarCargadas(_entradas);
      if (n && !await confirmar({ titulo: 'Descartar la recorrida', texto: `Se pierde lo cargado en ${n} vasija${n === 1 ? '' : 's'}.`, si: 'Descartar', no: 'Seguir cargando', peligro: true })) return;
  // 202-207
  if (btnAplicar) btnAplicar.addEventListener('click', async () => {
    …
    if (!await confirmar({ titulo: 'Corregir litros con lo medido', texto: `${items.length} lote${items.length === 1 ? '' : 's'}:\n\n${detalle}`, si: 'Corregir litros', no: 'Cancelar' })) return;
```

- [ ] **Step 6: Tests**

Run: `npx vitest run test/lotes-sin-ventanas-nativas.test.ts test/lotes-ot-lista.test.mjs test/lotes-ot-corte.test.mjs test/lotes-numero-ot.test.mjs test/lotes-inventario-tanques-ui.test.mjs test/lotes-mermas.test.mjs`
Expected: PASS.

- [ ] **Step 7: En el navegador (flujos, no solo que abra)**

- Movimientos → Historial → ✕ de un movimiento suelto: "Eliminar movimiento", Cancelar no borra, Eliminar borra y el aviso de autoguardado arranca recién después.
- ✕ de un movimiento de una OT no aplicada: "Eliminar la 0xxx" con la cantidad de movimientos.
- Nueva OT (botón de Movimientos): dejar el lote vacío y Emitir → aviso "Falta el lote." **encima** del fondo del formulario y el foco en el campo. Lote inexistente → "Lote que no está en la lista"; "Revisar" vuelve al formulario sin emitir.
- Órdenes de trabajo → una OT → "Volver al original": diálogo con "Volver al original" en rojo.
- Inventario de tanques → nueva recorrida, cargar un cm, "Cancelar recorrida" → "Descartar la recorrida (1 vasija)"; "Seguir cargando" no pierde el dato.
- El mock no guarda: `guardar()` da ok (devuelve `{ok:true}`); para ver "La OT no se guardó", envolver `fetch` para que `POST /datos` devuelva 500.

- [ ] **Step 8: Suite y commit**

```bash
git add public/lotes/js/guardar-ot.js public/lotes/js/vista-movimientos.js public/lotes/js/vista-ot-emitir.js \
  public/lotes/js/vista-ot-corte.js public/lotes/js/vista-ot-confirmar.js public/lotes/js/vista-ot-lista.js \
  public/lotes/js/vista-mermas.js public/lotes/js/vista-inventario-tanques.js test/lotes-sin-ventanas-nativas.test.ts
git commit -m "feat(lotes): diálogos propios en Movimientos, OT, mermas e inventario de tanques

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Las ventanitas que quedan (32) y "Confirmar todas" con la cantidad

**Files:**
- Modify: `public/lotes/js/vista-agenda.js`, `vista-agregados.js`, `vista-analisis.js`, `vista-cargar.js`, `vista-config-agenda.js`, `vista-config.js`, `vista-cruce.js`, `vista-lotes.js`, `vista-orden-correccion.js`, `vista-so2.js`, `vista-dashboard.js`, `test/lotes-sin-ventanas-nativas.test.ts`

**Interfaces:**
- Consumes: `avisar`, `confirmar`, `pedir` (Task 5). Las reglas 1-4 de la Task 6 valen acá.
- Changes: `agregarVariedadConfig`, `agregarProyectoConfig`, `restaurarDefaultsConfig` (vista-config.js) y `_registrarCorreccionSO2` (vista-so2.js) pasan a `async`; sus llamadores (`app.js` y un `addEventListener`) no usan el resultado, no cambian.

- [ ] **Step 1: Vaciar `PENDIENTES` y ver el test fallar**

En `test/lotes-sin-ventanas-nativas.test.ts`: `const PENDIENTES = new Set<string>([]);` y borrar el segundo `it` ("los pendientes de verdad tienen alguna") y la mención a "Tasks 5-7" del comentario.

Run: `npx vitest run test/lotes-sin-ventanas-nativas.test.ts`
Expected: FAIL con los diez archivos.

- [ ] **Step 2: Agenda y configuración de la Agenda**

`vista-agenda.js`: `function _alClic(e){` → `async function _alClic(e){` (lo registra `sec.addEventListener('click', _alClic)`; verificar que ningún `e.preventDefault()` quede después del primer `await`). Líneas 385-388:

```js
    if (!f){ avisar('Elegí una fecha.', { tipo: 'mal' }); return; }
    if (f < inp.min || f > inp.max){ avisar(`La fecha tiene que estar entre el ${ddmm(inp.min)} y el ${ddmm(inp.max)}.`, { tipo: 'mal' }); return; }
    const dia = _plan.dias.find(x => x.fecha === f);
    if (dia && !dia.habil && !await confirmar({ titulo: 'Día no hábil', texto: `El ${ddmm(f)} no es día hábil${dia.feriado ? ' (' + dia.feriado + ')' : ''}.`, si: 'Reprogramar igual', no: 'Elegir otro día' })) return;
```

`vista-config-agenda.js`: `function _alClic(e){` → `async function _alClic(e){`; línea 73:

```js
    if (!await confirmar({ titulo: 'Restaurar feriados', texto: 'La lista se reemplaza por los feriados precargados.', si: 'Reemplazar lista', no: 'Cancelar', peligro: true })) return;
```

- [ ] **Step 3: Otros agregados y Análisis**

`vista-agregados.js`: el listener de `sec` (línea ~282) pasa a `async e => {`; `function _anular(i){` → `async function _anular(i){` (su llamador, línea 301, no espera el resultado).

| Línea | Después |
|---|---|
| 294 | `if (!await confirmar({ titulo: 'Empezar una orden nueva', texto: 'Se borra lo cargado en pantalla. Lo ya registrado queda en los lotes.', si: 'Empezar de cero', no: 'Cancelar', peligro: true })) return;` |
| 381 | `if (noExisten.length && !await confirmar({ titulo: 'Lotes que no están en Lotes', texto: 'Estos lotes no están en la pestaña Lotes: ' + noExisten.join(', ') + '.', si: 'Registrar igual', no: 'Revisar' })) return;` |
| 391 | `if (_mapaFallo && !await confirmar({ titulo: 'El Mapa de Barriles no respondió', texto: 'El total se calcula con los envases que declara cada lote.', si: 'Registrar igual', no: 'Cancelar' })){` |
| 408 | `if (yaEstaba.length && !await confirmar({ titulo: 'La OT ya estaba registrada', texto: 'La OT ' + ot + ' ya estaba registrada el ' + fmtFecha(fecha) + ' en: ' + yaEstaba.join(', ') + '.\nSe reemplaza por lo que está en pantalla.', si: 'Reemplazar', no: 'Cancelar' })) return;` |
| 427 | ``if (!await confirmar({ titulo: 'Anular agregado', texto: `${ag.producto} ${cantidadTexto(ag)} del lote ${f.lote} (${fmtFecha(f.fecha)}, OT ${ag.ot_n || '-'}).\n\nNo se borra: queda tachado con tu nombre.`, si: 'Anular', no: 'Cancelar', peligro: true })) return;`` |

`vista-analisis.js`: el listener de la tabla (línea ~1006, `t.addEventListener('click', e => {`) pasa a `async e => {`.

```js
        // 1019
        if (!await confirmar({ titulo: 'Anular agregados', texto: `Lote ${o.lote} (${fmtFecha(o.fecha_analisis) || 'sin fecha'}): ${textoAgregados(o)}.\n\nQuedan tachados en Correcciones → Otros agregados.`, si: 'Anular', no: 'Cancelar', peligro: true })) return;
      // 1029
      if (!await confirmar({ titulo: esQuimica ? 'Eliminar medición' : 'Eliminar corrección', texto: `Lote ${o.lote} (${fmtFecha(o.fecha_analisis) || 'sin fecha'}).`, si: 'Eliminar', no: 'Cancelar', peligro: true })) return;
```

- [ ] **Step 4: Cargar análisis y Configuración**

`vista-cargar.js`:
- 67: `if (!DATOS()){ avisar('Los datos aún no cargaron.', { tipo: 'mal' }); return; }`
- 155-156: `avisar(salteadas ? 'Todas las filas ya están cargadas: no hay nada nuevo para agregar.' : 'No hay filas válidas para agregar.', { tipo: 'info' });`

`vista-config.js`: `function _cfgOnClick(e){` → `async function _cfgOnClick(e){`.

```js
    // 194
    if (!await confirmar({ titulo: 'Quitar override', texto: `"${varNombre}" pasa a usar los valores del default.`, si: 'Quitar override', no: 'Cancelar', peligro: true })) return;
    // 204
    if (!await confirmar({ titulo: 'Quitar criterios del proyecto', texto: `Los lotes de "${proyNombre}" vuelven a usar los de su variedad.`, si: 'Quitar criterios', no: 'Cancelar', peligro: true })) return;
```

`agregarVariedadConfig` → `export async function agregarVariedadConfig(){`, y desde `if (disponibles.length === 0){` hasta `if (!disponibles.includes(v)){ … }`:

```js
  if (disponibles.length === 0){
    avisar('No hay variedades para agregar: todas tienen criterios propios o no hay lotes con variedad.', { tipo: 'info' });
    return;
  }
  const elegida = disponibles.length === 1
    ? disponibles[0]
    : await pedir({ titulo: 'Agregar variedad', texto: 'Elegí la variedad que va a tener criterios propios.', si: 'Agregar',
                    campo: { opciones: disponibles, valor: disponibles[0] } });
  if (!elegida || !elegida.trim()) return;
  const v = elegida.trim();
  if (!disponibles.includes(v)){ avisar(`"${v}" no está entre las variedades disponibles.`, { tipo: 'mal' }); return; }
```

`agregarProyectoConfig`: igual, con `'No hay proyectos para agregar: todos tienen criterios propios o no hay lotes con proyecto.'`, `titulo: 'Agregar proyecto'`, `texto: 'Elegí el proyecto que va a tener criterios propios.'` y `` `"${p}" no está entre los proyectos disponibles.` ``.

`restaurarDefaultsConfig` → `export async function restaurarDefaultsConfig(){` y:

```js
  if (!await confirmar({ titulo: 'Restaurar valores por defecto', texto: 'La fila "General (default)" vuelve a los valores originales del motor FML.', si: 'Restaurar', no: 'Cancelar', peligro: true })) return;
```

- [ ] **Step 5: Cruce, Lotes, Orden de corrección y Bitácora SO₂**

`vista-cruce.js` (`aplicarSeleccion`, ya `async`):
- 59: `if (!elegidos.size){ avisar('No hay ningún lote tildado.', { tipo: 'mal' }); return; }`
- 80: `if (!planCambios.length){ avisar('No hubo nada que cambiar.', { tipo: 'info' }); return; }`
- 111: `if (!await confirmar({ titulo: 'Corregir ' + planCambios.length + ' lotes con el mapa', texto: msg, si: 'Corregir lotes', no: 'Cancelar' })) return;`
- 64: el comentario `para armar el texto del confirm()` → `para armar el texto de la confirmación`.

`vista-lotes.js`:
- 475: `cerrarOverlay(); avisar('No se encontró el lote ' + (o.lote ?? '') + ' en los datos actuales (puede que se hayan recargado). No se cambió nada.', { tipo: 'mal' });` y borrar el `cerrarOverlay();` siguiente.
- El listener de la tabla (línea ~765) pasa a `async e => {`; 794: `if (await confirmar({ titulo: 'Eliminar lote', texto: 'Se elimina el lote ' + o.lote + ' de la pestaña Lotes.', si: 'Eliminar lote', no: 'Cancelar', peligro: true })){`
- 800: `avisar('No se encontró el lote ' + (o.lote ?? '') + ' en los datos actuales (puede que se hayan recargado). No se borró nada.', { tipo: 'mal' });`

`vista-orden-correccion.js` (`_ocAnularCorrecciones` y `_ocEjecConfirmar`, ya `async`):

```js
  // 274
  if (!await confirmar({
    titulo: 'Cancelar corrección',
    texto: 'Vas a cancelar la corrección de ' + descripcion + '.\n\n' +
      'La entrada NO se borra: queda en la bitácora marcada como anulada, con tu nombre y la fecha. ' +
      (objetivos.length === 1 ? 'El lote vuelve' : 'Los lotes vuelven') + ' a proponerse en la orden.',
    si: 'Cancelar corrección', no: 'Volver', peligro: true })) return;
      // 311
      else avisar('No se pudo guardar. No se canceló nada.', { tipo: 'mal' });
      // 1200
      else avisar('No se pudo guardar. No se registró nada. Resolvé el conflicto y volvé a confirmar.', { tipo: 'mal' });
```

Y el `<label …>` sin cerrar de la barra de la orden (línea ~761, `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)">` sin `</label>`): borrarlo. Envolvía a los botones que siguen y es lo que hacía desbordar la barra en el celular (medido: 368 px).

`vista-so2.js`: `function _registrarCorreccionSO2(){` → `async function _registrarCorreccionSO2(){`; 263:

```js
  if (otraOt && !await confirmar({
      titulo: 'Ya hay una corrección ese día',
      texto: 'El lote ' + loteStr + ' ya tiene una corrección el ' + fmtFecha(fecha) + ' con la OT ' +
        String(otraOt.correccion.ot_n).trim() + '.\n\nSi registrás esta también, quedan las dos en la bitácora (no se pisa la anterior).',
      si: 'Registrar también', no: 'Revisar OT o fecha' })) return;
```

- [ ] **Step 6: "Confirmar todas" del Dashboard pide confirmación con la cantidad**

`vista-dashboard.js`: import `import { confirmar } from './dialogos.js';`. En el botón (línea ~326): `'<div style="margin-bottom:12px"><button class="btn primary" id="btnConfirmarTodas">✓ Confirmar todas</button></div>' +` → `'<div style="margin-bottom:12px"><button class="btn primary" id="btnConfirmarTodas">Confirmar todas (' + esc(String(bandeja.length)) + ')</button></div>' +`.

En el listener (línea ~353):

```js
    const btnTodas = e.target.closest('#btnConfirmarTodas');
    if (btnTodas){
      const card = e.target.closest('#bandejaEtapasCard');
      const filas = card._filas || [];
      if (!filas.length) return;
      const n = filas.length;
      if (!await confirmar({
        titulo: 'Confirmar ' + n + (n === 1 ? ' etapa' : ' etapas'),
        texto: (n === 1 ? 'El lote pasa' : 'Los ' + n + ' lotes pasan') + ' a la etapa que sugiere el sistema. Queda registrado con tu nombre.',
        si: 'Confirmar ' + n, no: 'Cancelar' })) return;
      await confirmarTodasLasEtapas(filas);
      return;
    }
```

- [ ] **Step 7: Tests**

Run: `npx vitest run test/lotes-sin-ventanas-nativas.test.ts test/lotes-cubicacion.test.mjs test/lotes-agregados.test.mjs test/lotes-agenda.test.mjs test/lotes-carga-duplicados.test.mjs test/lotes-so2-bitacora.test.mjs`
Expected: PASS. Confirmar además: `grep -rnE "(^|[^a-zA-Z0-9_.$])(alert|confirm|prompt)\(" public/lotes/js public/lotes/app.js | grep -v dialogos.js | grep -v vendor` no devuelve código (solo comentarios, si quedara alguno).

- [ ] **Step 8: En el navegador**

- Lotes → ✕ de un lote: "Eliminar lote" en rojo, foco en Cancelar; Escape no borra.
- Configuración → "Agregar variedad": lista desplegable con las variedades sin criterio; vacío y Guardar → "Elegí una de la lista." no aplica (hay valor por defecto); elegir una la agrega.
- Agenda → menú de un trasiego → Reprogramar a un domingo → "Día no hábil" encima del menú; "Elegir otro día" deja el menú abierto.
- Dashboard: "Confirmar todas (N)" → diálogo con la misma N.
- Correcciones → Orden de corrección: la barra de botones ya no queda envuelta en un `<label>` (inspeccionar `#ocToolbar > label` → no existe).

- [ ] **Step 9: Suite y commit**

```bash
git add public/lotes/js test/lotes-sin-ventanas-nativas.test.ts
git commit -m "feat(lotes): sin alert/confirm/prompt; Confirmar todas pide confirmación con la cantidad

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Base de celular en todas las pestañas

**Files:**
- Modify: `public/lotes/index.html` (CSS de celular y táctil), `public/lotes/js/vista-tablero.js:141`, `public/lotes/js/tablero-ficha.js:81`, `public/lotes/js/vista-agregados.js` (tabla de `.ag-card-body`), `public/lotes/js/vista-config-agenda.js:35`, `public/lotes/js/vista-lotes.js:539`, `public/lotes/js/vista-analisis.js:607,920`, `public/lotes/js/vista-orden-correccion.js:614`, `public/lotes/js/vista-ficha.js` (campo de lote)

**Interfaces:**
- Produces la clase `.scroll-x` (`overflow-x:auto` con el ancho de su contenedor) para tablas que no tenían recuadro propio.

Lo que desbordaba a 375 px (medido en la Task 1 con el respaldo v75): la cabecera (`header .right`, 581 px; resuelto por la barra de la Task 3), la tabla del Tablero FML sin recuadro (2.481 px) y sus tarjetas en 6 columnas, la barra de la Orden de corrección (el `<label>` sin cerrar; resuelto en la Task 7), la tabla de cada tarjeta de Otros agregados (348 px dentro de una tarjeta más angosta), la tabla de feriados de Configuración (422 px) y la leyenda del heatmap.

- [ ] **Step 1: Recuadros con scroll propio para las tablas sueltas**

En `public/lotes/index.html`, junto a `.scroll`: `.scroll-x{overflow-x:auto;max-width:100%}`.

- `vista-tablero.js:141`: `` : `<table class="tb-tabla"> `` → `` : `<div class="scroll-x"><table class="tb-tabla"> `` y el cierre `</table>` + `` ` `` de esa expresión → `</table></div>` + `` ` ``.
- `tablero-ficha.js:81`: envolver la `<table class="tb-tabla">…</table>` en `<div class="scroll-x">…</div>` de la misma forma.
- `vista-agregados.js`: dentro de `<div class="ag-card-body">` (línea ~120), envolver su `<table>…</table>` en `<div class="scroll-x">…</div>`.
- `vista-config-agenda.js:35`: `<table class="ag-cfg-fer">` → `<div class="scroll-x"><table class="ag-cfg-fer">` y su `</table>` → `</table></div>`.

(Ninguna de estas tablas es papel: `test/lotes-papel-intacto.test.mjs` lo confirma.)

- [ ] **Step 2: Teclado según el dato**

- Celdas numéricas (los lotes son todos numéricos y los valores llevan decimales):
  - `vista-lotes.js:539`: `<input class="cell ${c.num?'num':''}" type="text"` → `<input class="cell ${c.num?'num':''}" type="text"${c.num ? ' inputmode="decimal"' : (c.k === 'lote' ? ' inputmode="numeric"' : '')}`
  - `vista-analisis.js:607` y `:920`: después de `type="text"` agregar `${c.num ? ' inputmode="decimal"' : (c.k === 'lote' ? ' inputmode="numeric"' : '')}`.
  - `vista-orden-correccion.js:614`: `'<input class="cell num" type="text" style="width:60px" '` → `'<input class="cell num" type="text" inputmode="decimal" style="width:60px" '`.
- Campos de lote: `#buscaLotes` (index.html) y `#fichaInputLote` (vista-ficha.js `htmlBuscador`): agregar `inputmode="numeric"`; el placeholder de `#buscaLotes` pasa de `🔎 Buscar por lote…` a `Buscar por lote…`.
- Vasijas y N° de OT llevan letras (`T 140`, `B219`): **sin** `inputmode` (teclado de texto).

- [ ] **Step 3: CSS de celular y de pantallas táctiles**

Al final del `<style>` de `public/lotes/index.html` (después de las reglas de la Agenda, antes de `</style>`):

```css
/* ===== Celular (≤ 760 px) =====
 * La página nunca se pasa del ancho: lo ancho (tablas, la hoja A4) se
 * scrollea dentro de su recuadro. Campos a 16 px para que iOS no haga zoom. */
@media (max-width:760px){
  main{padding:14px 16px 48px}
  .app-barra{padding:8px 16px}
  .app-barra .marca{font-size:23px}
  #tab-lotes,#tab-analisis,#tab-orden{margin-left:0;margin-right:0}
  .card{padding:14px 12px 16px}
  .scroll,.scroll.tall{max-height:70vh}
  select,input.txt,textarea,.mfilt-search{font-size:16px}
  select,input.txt,button.btn,.mfilt-btn{min-height:var(--ci-tap)}
  .kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .kpi-card .kpi-val{font-size:34px}
  .chart-grid,.chart-grid.wide{grid-template-columns:minmax(0,1fr)}
  .tb-tarjetas{grid-template-columns:repeat(3,minmax(0,1fr))}
  .hm-leyenda{flex-wrap:wrap}
  .toolbar .spacer{display:none}
}
/* ===== Pantallas táctiles: blancos de 44 px. Con mouse no cambia nada. ===== */
@media (pointer:coarse){
  .rowbtn,th button.th-flt,th.banda button.chip-grupo{min-width:var(--ci-tap);min-height:var(--ci-tap)}
  td input.cell,td select.cell{min-height:var(--ci-tap);font-size:16px}
  .tabs button[data-v],.mas-btn,.mas-menu button{min-height:var(--ci-tap)}
  .segm button,.corr-sub button,#tab-movimientos .mov-sub button,#ordenControls .oc-tipo button,.tb-toggle button{min-height:var(--ci-tap)}
  .btn-hijo,.alarm-lote-link{min-height:var(--ci-tap);padding-left:10px;padding-right:10px}
  .corr-sub,#tab-movimientos .mov-sub,#ordenControls .oc-tipo{height:auto}
}
```

`--ci-tap` lo define `estilo.css` (44 px). La segunda fila del encabezado de Lotes se acomoda sola al alto de la fila de bandas con chips de 44 px (`--lt-banda-h`, Task 4, Step 5).

- [ ] **Step 4: Tests**

Run: `npx vitest run test/lotes-papel-intacto.test.mjs test/lotes-colores-congelados.test.ts test/lotes-estilo.test.ts test/lotes-tablero-panel.test.mjs test/lotes-tablero-ficha.test.mjs`
Expected: PASS.

- [ ] **Step 5: En el navegador a 375 px (preset mobile, emula táctil)**

Recargar y, para cada pestaña (Panel, Lotes, Cargar, Análisis, Tablero, Agenda, las tres de Correcciones, las cuatro de Movimientos, Orden de muestras, Cruce, Configuración):

```js
const { mostrarTab } = await import('/lotes/js/nucleo.js');
const r = {};
for (const v of ['dashboard','lotes','cargar','analisis','tablero','agenda','so2','ordencorr','agregados','movimientos','orden','cruce','config']){
  mostrarTab(v); await new Promise(x => setTimeout(x, 700));
  r[v] = document.documentElement.scrollWidth;
}
JSON.stringify({ innerWidth, r })
```

Expected: `innerWidth` = 375 y todos los valores ≤ 375. Si alguno se pasa, encontrar el culpable con el mismo recorrido de la Task 1 (elementos con `getBoundingClientRect().right > 376` fuera de un contenedor con `overflow`) y envolverlo en `.scroll-x` o darle `min-width:0`.

Además:
- Botones de la barra, del menú Más y ✕ de filas: `getBoundingClientRect().height >= 44`.
- Lotes: la segunda fila del encabezado queda justo debajo de la de bandas (con chips de 44 px).
- Una celda numérica de Análisis tiene `inputmode="decimal"`; la de lote, `numeric`.
- Un diálogo de `CI` ocupa el ancho y sus botones miden ≥ 44 px.

- [ ] **Step 6: Commit**

```bash
git add public/lotes
git commit -m "feat(lotes): base de celular (sin desborde, tablas con scroll propio, teclado según el dato, blancos de 44 px)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Buscar lote → Ficha en una columna, en `#ficha/<lote>`

**Files:**
- Create: `public/lotes/js/ficha-url.js`, `test/lotes-ficha-url.test.mjs`, `test/lotes-ficha-ultimo.test.ts`
- Modify: `src/lotes/vistas.ts` (`datosFicha`), `public/lotes/index.html` (campo en la barra, CSS de la ficha), `public/lotes/js/nucleo.js` (`irALote`, `mostrarTab`), `public/lotes/app.js`, `public/lotes/js/vista-ficha.js`

**Interfaces:**
- Produces `js/ficha-url.js`: `loteDeHash(hash: string) → string | null`, `hashDeLote(lote: string) → string`.
- Produces en `datosFicha(...)`: `ultimo_analisis: { analisis: Fila, fuera: string[], dentro: string[], so2_molec_calc: number | null } | null` (el último análisis usable con alguna medición química, con su veredicto).
- Changes: `irALote(loteStr, op?: { sinHistorial?: boolean })`; nuevo `vistaAntesDeFicha() → string` en `nucleo.js`.

- [ ] **Step 1: Tests que fallan**

`test/lotes-ficha-url.test.mjs`:

```js
/** #ficha/<lote>: la ficha queda en la URL, se comparte y sobrevive al F5. */
import { describe, it, expect } from 'vitest';
import { loteDeHash, hashDeLote } from '../public/lotes/js/ficha-url.js';

describe('ficha en la URL', () => {
  it('ida y vuelta', () => {
    expect(hashDeLote('26217')).toBe('#ficha/26217');
    expect(loteDeHash('#ficha/26217')).toBe('26217');
    expect(loteDeHash(hashDeLote(' 26 217 '))).toBe('26 217');
  });
  it('lo que no es una ficha da null', () => {
    expect(loteDeHash('')).toBe(null);
    expect(loteDeHash('#lotes')).toBe(null);
    expect(loteDeHash('#ficha/')).toBe(null);
    expect(loteDeHash('#ficha/%E0%A4%A')).toBe(null);   // mal codificado
  });
});
```

`test/lotes-ficha-ultimo.test.ts`:

```ts
/** La ficha del celular muestra el último análisis con los colores de Análisis. */
import { describe, it, expect } from 'vitest';
import { datosFicha } from '../src/lotes/vistas';

const HOY = Date.parse('2026-10-16T00:00:00Z');
const base = {
  lotes: [{ lote: '26217', variedad: 'Malbec', fecha_ingreso: '2026-03-01', litros_actuales: 1000 }],
  movimientos: [],
};

describe('datosFicha: último análisis', () => {
  it('el más nuevo con medición química, con su veredicto', () => {
    const f = datosFicha({ ...base, analisis: [
      { lote: '26217', fecha_analisis: '2026-08-01', ph: 3.6, av: 0.4 },
      { lote: '26217', fecha_analisis: '2026-09-20', ph: 3.7, av: 2.5 },
      // Solo corrección, sin medición: no cuenta como "último análisis".
      { lote: '26217', fecha_analisis: '2026-10-01', correccion: { ot_n: '0712' } },
    ] }, '26217', HOY)!;
    expect(f.ultimo_analisis!.analisis.fecha_analisis).toBe('2026-09-20');
    expect(f.ultimo_analisis!.fuera).toContain('av');
  });

  it('respeta los "no usar"', () => {
    const f = datosFicha({ ...base,
      analisis: [
        { lote: '26217', fecha_analisis: '2026-08-01', av: 0.4 },
        { lote: '26217', fecha_analisis: '2026-09-20', av: 2.5 },
      ],
      excepciones_analisis: [{ lote: '26217', fecha_analisis: '2026-09-20', usar_registro: 'no' }],
    }, '26217', HOY)!;
    expect(f.ultimo_analisis!.analisis.fecha_analisis).toBe('2026-08-01');
  });

  it('sin análisis da null', () => {
    expect(datosFicha({ ...base, analisis: [] }, '26217', HOY)!.ultimo_analisis).toBe(null);
  });
});
```

Run: `npx vitest run test/lotes-ficha-url.test.mjs test/lotes-ficha-ultimo.test.ts`
Expected: FAIL (no existe `ficha-url.js`; `ultimo_analisis` undefined).

- [ ] **Step 2: `public/lotes/js/ficha-url.js`**

```js
/* ===== Lotes CIW — la ficha en la URL (#ficha/<lote>) =====
 * Puro: lo usan nucleo.js y app.js, y se testea en test/lotes-ficha-url.test.mjs. */
'use strict';

/** El lote de un hash "#ficha/<lote>", o null si no es una ficha. */
export function loteDeHash(hash){
  const m = /^#ficha\/(.+)$/.exec(String(hash || ''));
  if (!m) return null;
  try {
    const v = decodeURIComponent(m[1]).trim();
    return v || null;
  } catch (e) { return null; }
}

export function hashDeLote(lote){
  return '#ficha/' + encodeURIComponent(String(lote ?? '').trim());
}
```

- [ ] **Step 3: `ultimo_analisis` en `datosFicha`**

En `src/lotes/vistas.ts`, dentro de `datosFicha`, antes del `return {`:

```ts
  // El último análisis usable con alguna medición química, con su veredicto:
  // la ficha del celular lo muestra con los mismos colores que la pestaña
  // Análisis. Una fila que es solo corrección (SO2 agregado) no cuenta.
  const QUIMICOS = ['ph', 'av', 'malico', 'gluc_fruc', 'azucar_reductor', 'so2_libre', 'etanol', 'acidez_total'];
  const conMedicion = ansUsables.filter((a) => QUIMICOS.some((k) => a[k] != null && a[k] !== ''));
  const ultimo = conMedicion.reduce<Fila | null>(
    (u, a) => (!u || String(a.fecha_analisis ?? '') >= String(u.fecha_analisis ?? '') ? a : u), null);
  const criterios = ((config as Fila).criterios_fml as Record<string, unknown>) ?? {};
```

y en el objeto que devuelve, al final:

```ts
    ultimo_analisis: ultimo ? { analisis: { ...ultimo }, ...veredictoDeFila(ultimo, fila, criterios) } : null,
```

(`veredictoDeFila` está más abajo en el mismo archivo; es una `function`, así que se puede usar antes de su declaración.)

Run: `npx vitest run test/lotes-ficha-ultimo.test.ts test/lotes-motores-auditoria.test.ts test/lotes-linaje.test.ts && npx tsc --noEmit`
Expected: PASS y sin errores de tipos. Si el primer `it` falla en `fuera` (porque `av: 2.5` no se juzga para Malbec sin criterio), mirar `CRITERIOS_DEFAULT` en `src/lotes/motores/fml.ts` y usar un valor por encima del máximo de AV de fábrica.

Volver a empaquetar `vistas.mjs` (Task 1, Step 6) y reiniciar el mock.

- [ ] **Step 4: Campo "Buscar lote" en la barra**

`public/lotes/index.html`, en el `header`, entre `</nav>` y `<div class="right">`:

```html
  <form class="buscar-lote" id="buscarLote" role="search" autocomplete="off">
    <label for="buscarLoteNum" class="ci-sr">Buscar lote</label>
    <input id="buscarLoteNum" class="txt" type="text" inputmode="numeric" enterkeyhint="go" placeholder="Buscar lote" list="buscarLoteLista">
    <datalist id="buscarLoteLista"></datalist>
  </form>
```

CSS (con las reglas de `.app-barra`):

```css
  .buscar-lote{display:flex;align-items:center}
  .buscar-lote input.txt{width:150px;padding:6px 9px}
  .ci-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
```

y dentro de `@media(max-width:900px){…}` de la barra: `.buscar-lote{order:3;flex:1 1 100%}.buscar-lote input.txt{width:100%}` (en el celular queda siempre visible, en su propio renglón, debajo de la marca y Más).

- [ ] **Step 5: `irALote` con historial y la URL**

`public/lotes/js/nucleo.js`:
1. Import: `import { hashDeLote, loteDeHash } from './ficha-url.js';`
2. Reemplazar `irALote`:

```js
/* La ficha queda en la URL (#ficha/<lote>): se comparte, sobrevive al F5 y
 * el botón Atrás del celular vuelve a donde se estaba (app.js, popstate). */
let _antesDeFicha = 'dashboard';
/** La pantalla desde la que se abrió la ficha (a donde vuelven Volver y Atrás). */
export function vistaAntesDeFicha(){ return _antesDeFicha; }
export function irALote(loteStr, op = {}){
  if (vistaActiva() !== 'ficha') _antesDeFicha = vistaActiva();
  setLoteActivo(String(loteStr));
  const h = hashDeLote(loteStr);
  if (!op.sinHistorial && location.hash !== h) history.pushState(null, '', h);
  mostrarTab('ficha');
}
```

3. En `mostrarTab`, al principio (después de resolver `nombre`): 

```js
  // Salir de la ficha saca el #ficha/<lote> de la URL (sin entrada nueva en el historial).
  if (nombre !== 'ficha' && loteDeHash(location.hash)) history.replaceState(null, '', location.pathname + location.search);
```

`public/lotes/app.js`:
1. Import: `import { loteDeHash } from './js/ficha-url.js';` y agregar `irALote, vistaActiva, vistaAntesDeFicha` al import de nucleo.
2. En `DOMContentLoaded`, después de `montarMas();`:

```js
  /* Buscar lote (barra): abre la ficha. Siempre visible, también en el celular. */
  $('buscarLote').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('buscarLoteNum').value.trim();
    if (!v) return;
    $('buscarLoteNum').value = '';
    $('buscarLoteNum').blur();      // en el celular baja el teclado
    irALote(v);
  });
  registrarInit(() => {
    $('buscarLoteLista').innerHTML = (DATOS().lotes || [])
      .map(l => String(l.lote ?? '').trim()).filter(Boolean)
      .map(l => '<option value="' + l.replace(/"/g, '&quot;') + '">').join('');
  });
  /* Atrás / Adelante del navegador entre la ficha y la pantalla de antes. */
  window.addEventListener('popstate', () => {
    const l = loteDeHash(location.hash);
    if (l) irALote(l, { sinHistorial: true });
    else if (vistaActiva() === 'ficha') mostrarTab(vistaAntesDeFicha());
  });
```

3. Donde termina la carga de datos (después del `await cargarDatos()` del arranque; si `cargarDatos` se llama sin `await`, agregar el `.then`):

```js
  const loteEnUrl = loteDeHash(location.hash);
  if (loteEnUrl) irALote(loteEnUrl, { sinHistorial: true });
```

- [ ] **Step 6: Ficha en una columna con el último análisis**

`public/lotes/js/vista-ficha.js`:
1. "← Volver" vuelve a la pantalla desde la que se abrió la ficha: en `_pintarFicha`, el listener de `fichaBtnVolver` pasa a `() => mostrarTab(vistaAntesDeFicha())` (agregar `vistaAntesDeFicha` al import de `./nucleo.js`). No usa `history.back()`: si la ficha se abrió con un link compartido o con F5, eso sacaría de Lotes. `mostrarTab` ya saca el `#ficha/…` de la URL.
2. Antes de `/* ---- linea de tiempo ---- */` en `htmlFicha`, armar el resumen:

```js
  /* ---- resumen (lo primero que se ve en el celular) ----
   * Variedad, litros, vasija, etapa y el último análisis con los mismos
   * colores de veredicto que la pestaña Análisis (td.dentro / td.fuera). */
  const ua = f.ultimo_analisis;
  const METRICAS = [['ph', 'pH'], ['av', 'AV'], ['malico', 'Málico'], ['gluc_fruc', 'Gluc+Fruc'],
    ['azucar_reductor', 'Az. red.'], ['so2_libre', 'SO₂ libre'], ['so2_molecular', 'SO₂ molec.']];
  const celda = k => {
    const v = k === 'so2_molecular' ? ua.so2_molec_calc : ua.analisis[k];
    if (v == null || v === '') return '';
    const cls = (ua.fuera || []).includes(k) ? 'fuera' : (ua.dentro || []).includes(k) ? 'dentro' : '';
    const txt = typeof v === 'number' ? v.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : String(v);
    return `<tr><th scope="row">${esc(METRICAS.find(m => m[0] === k)[1])}</th><td class="num ${cls}">${esc(txt)}</td></tr>`;
  };
  const filasUa = ua ? METRICAS.map(([k]) => celda(k)).join('') : '';
  const vasijaActual = ((f.recorrido_vasijas || []).find(v => v.hasta == null) || {}).vasija || lote.vasija_actual || '';
  const secResumen = `
<div class="card ficha-resumen">
  <dl class="fr-datos">
    <div><dt>Variedad</dt><dd>${esc(lote.variedad || '—')}</dd></div>
    <div><dt>Litros</dt><dd>${lote.litros_actuales != null ? esc(String(lote.litros_actuales)) : '—'}</dd></div>
    <div><dt>Vasija</dt><dd>${esc(vasijaActual || '—')}</dd></div>
    <div><dt>Etapa</dt><dd>${esc(f.etapa || '—')}</dd></div>
  </dl>
  <h2>Último análisis${ua ? ' · ' + esc(fmtFecha(ua.analisis.fecha_analisis)) : ''}</h2>
  ${filasUa ? `<table class="fr-analisis"><tbody>${filasUa}</tbody></table>` : '<p style="color:var(--muted)">Sin análisis con medición.</p>'}
</div>`;
```

3. `return cabecera + secTimeline + secVasijas + secLinaje;` → `return cabecera + secResumen + secTimeline + secVasijas + secLinaje;`
4. Al contenedor del linaje (`<div style="display:flex;flex-wrap:wrap;gap:0;align-items:flex-start">` en `secLinaje`) agregarle `class="fr-linaje"`.

CSS en `public/lotes/index.html` (sección Ficha):

```css
  /* Ficha: resumen en una columna, legible en el celular */
  .ficha-resumen .fr-datos{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 18px;margin:0 0 14px}
  .ficha-resumen .fr-datos dt{font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:var(--muted)}
  .ficha-resumen .fr-datos dd{margin:2px 0 0;font-family:var(--serif);font-size:22px;font-weight:500}
  .ficha-resumen .fr-analisis{width:auto;min-width:240px}
  .ficha-resumen .fr-analisis th{position:static;cursor:default;text-align:left}
  @media (max-width:760px){
    .ficha-resumen .fr-datos{grid-template-columns:repeat(2,minmax(0,1fr))}
    .ficha-resumen .fr-analisis{width:100%}
    #tab-ficha .fr-linaje{flex-direction:column}
    #tab-ficha .linaje-col{min-width:0}
  }
```

Las celdas `td.dentro` / `td.fuera` toman los colores congelados de Análisis sin regla nueva.

- [ ] **Step 7: Tests**

Run: `npx vitest run test/lotes-ficha-url.test.mjs test/lotes-ficha-ultimo.test.ts test/lotes-barra.test.ts test/lotes-papel-intacto.test.mjs`
Expected: PASS.

- [ ] **Step 8: En el navegador (375 px y 1280 px)**

- Escribir un lote en "Buscar lote" y Enter: abre la ficha; la URL termina en `#ficha/<lote>`; el teclado del celular baja.
- El resumen muestra variedad, litros, vasija, etapa y el último análisis; una métrica fuera de criterio sale en el naranja de Análisis (mismo `background-color` que `td.fuera` en `#tAnalisis`: `rgb(232, 161, 95)`).
- F5 con `#ficha/<lote>`: vuelve a la misma ficha.
- Atrás del navegador: vuelve a la pantalla de antes y la URL pierde el `#ficha/…`.
- Lote inexistente: "El lote X no existe." (buscador de la ficha), sin errores en consola.
- A 375 px: la ficha entera en una columna, sin scroll horizontal (`document.documentElement.scrollWidth <= 375`).

- [ ] **Step 9: Suite y commit**

```bash
git add public/lotes src/lotes/vistas.ts test/lotes-ficha-url.test.mjs test/lotes-ficha-ultimo.test.ts
git commit -m "feat(lotes): buscar lote desde la barra y ficha en una columna con el último análisis, en #ficha/<lote>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Verificación completa y entrega

**Files:** ninguno nuevo (scratchpad: fotos y muestreos).

- [ ] **Step 1: Suite completa y tipos**

Correr la suite de a 12 (Task 0, Step 3) y `npx tsc --noEmit`.
Expected: verde; total = línea de base + los nuevos (≈ 1 + 4 + 5 + 3 + 3 + 2 + 2 + 3 + 2 = 25 más). Anotar el número exacto.

- [ ] **Step 2: Colores con significado**

Mock recargado, 1280 px, Dashboard visible: muestreo idéntico a `muestreo-antes.json` (`[]` de diferencias). Repetir a 375 px (mismo resultado esperado: ninguna regla de celular toca un color con significado).

- [ ] **Step 3: Papel e impresión**

- `git diff main -- public/lotes/index.html | grep -n "@media print"` → solo líneas de contexto, ningún `+`/`-` dentro de esos bloques (el test ya lo garantiza; esto es el control a ojo que pide la spec).
- Vista previa de impresión (Ctrl+P en el panel) de: una OT de Movimientos → Órdenes de trabajo, la Orden de muestras, la Orden de corrección, la Bitácora de SO₂, Otros agregados (formato B015), la hoja de recorrida de tanques. Ninguna muestra la barra, avisos ni diálogos; la hoja se ve igual que en `$S/antes-*.png` (si hay fotos de impresión de antes) o que en producción.

- [ ] **Step 4: Recorrido de accesibilidad básico**

- Todo diálogo nuevo se cierra con Escape y devuelve el foco.
- Tab recorre la barra: marca no enfocable, las cinco pantallas, Más, Buscar lote, sin trampas.
- A 375 px: `document.documentElement.scrollWidth <= 375` en todas las pestañas (Task 8, Step 5).

- [ ] **Step 5: Fotos para el usuario**

Fotos de después (1280 y 375 px) de: Panel, Lotes, Análisis (con celdas verdes/naranjas a la vista), Movimientos, Agenda, Tablero FML, menú Más abierto, un diálogo de confirmación, un aviso, la ficha en el celular. Mandarlas junto con las de antes (`SendUserFile`), con un resumen corto de qué cambió y qué no (colores con significado y papel: idénticos, con el número del muestreo).

- [ ] **Step 6: Pedir el OK, avisando qué entra al deploy**

Antes de mergear, decirle al usuario:
- que **pushear `main` publica la web** (Workers Builds);
- qué otros commits de `main` todavía no están en producción: la Etapa 1 (`fa46cb4` y anteriores, sin push al 2026-10-16) entra en el mismo deploy. Verificar con `gh api repos/lucs56/catenainstitute/commits/main/check-runs --jq '.check_runs[]|.name+" "+.conclusion'` y comparar `git log origin/main..main --oneline`;
- desde qué carpeta: `repos\catenainstitute` en `main` con `git status` limpio.

- [ ] **Step 7: Merge y push (solo con el OK)**

```bash
cd /c/Users/Bmax/repos/catenainstitute
git status -sb            # main limpio, sin trabajo de otra sesión
git merge --no-ff feat/estetica-lotes -m "Merge feat/estetica-lotes: Lotes con el estilo de Prensas (barra con Más, diálogos propios, celular y ficha en #ficha/<lote>)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Correr la suite de a 12 sobre `main` mergeado y, si da verde, `git push origin main`. Después: `gh api repos/lucs56/catenainstitute/commits/<sha>/check-runs --jq '.check_runs[]|.name+" "+.conclusion'` hasta ver `Workers Builds: catenainstitute success` y `verificar success`. Recién ahí avisar que está en producción (Ctrl+F5).

- [ ] **Step 8: Limpieza y memoria**

Parar el mock. `git worktree remove ../catenainstitute-estetica-lotes` y `git branch -d feat/estetica-lotes` (solo después del merge). Actualizar la memoria `estetica-unificada.md`: Etapa 2 hecha (sha del merge, si se pusheó o no), lo que quedó para la Etapa 3 (Barriles: arrancar revisando y mergeando `feat/barriles-programador` 9ff29b6) y que `scripts/muestreo-colores-lotes.js` + `scripts/css-reglas.mjs` sirven de modelo para congelar los colores de Barriles.
