# Estética unificada · Etapa 1 (base común) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar lista la base visual común (tokens de Prensas, aviso y diálogo propios, barra arreglada para celular) y aplicarla a admin, cambiar clave y la base de celular de Prensas, sin cambiar todavía Lotes ni Barriles.

**Architecture:** Un CSS compartido (`public/shared/estilo.css`) con los tokens idénticos a Prensas, vigilado por un test de vitest que compara los dos `:root`. Un par de scripts clásicos compartidos: `dialogo-modelo.js` (lógica pura, testeada) y `dialogo.js` (DOM, con su propio CSS acotado a `.ci-*` para verse igual en cualquier módulo). El Worker inyecta los dos scripts en las tres pantallas de módulo; `estilo.css` NO se inyecta en Lotes ni Barriles en esta etapa (sus `:root` locales pisarían o serían pisados).

**Tech Stack:** HTML/CSS/JS vanilla (scripts clásicos que se cuelgan de `globalThis`), Cloudflare Workers (TypeScript, `src/index.ts`), vitest con `@cloudflare/vitest-pool-workers` (sin DOM, sin `fs`: los archivos se leen en `vitest.config.ts` y viajan como bindings).

**Spec:** `docs/superpowers/specs/2026-10-16-estetica-unificada-design.md`

## Global Constraints

- **Prensas: su estética no cambia.** En Prensas solo se tocan reglas dentro de `@media (pointer: coarse)` / `@media (max-width: 900px)` y un atributo `inputmode`. Ningún color, letra, borde ni tamaño de escritorio.
- Tokens de `estilo.css` con **los mismos nombres y valores** que el `:root` de `public/prensas/index.html` (líneas 16–23): `--bg:#ECE8E1; --panel:#F4F1EB; --panel2:#E4DFD6; --line:#D6D0C5; --rule:#1C1B19; --txt:#1C1B19; --muted:#68625A; --accent:#5A1724; --accent2:#43101A; --ok:#56684A; --nook:#8E2330; --warn:#7F622B; --info:#3F5560; --ok-tinte:#E3E7DD; --nook-tinte:#F1E3E1; --warn-tinte:#F2EADB; --accent-tinte:rgba(90,23,36,.07); --serif:'Cormorant Garamond',Georgia,'Times New Roman',serif; --sans:'IBM Plex Sans',system-ui,'Segoe UI',sans-serif;`
- Letras siempre desde `/prensas/fonts/` (no mover ni borrar archivos de esa carpeta).
- `estilo.css` **sin reglas sobre etiquetas sueltas** (`body`, `html`, `table`, `th`, `td`, `select`, `input`, `button`, `textarea`, `a`, `h1`–`h3`): solo clases `ci-*` y `:root`.
- Botones de diálogo con la acción escrita (`'Borrar OT'`); nunca "Aceptar"/"OK".
- Alto mínimo táctil: `44px`. Campos en celular: `16px` de letra.
- Breakpoint de celular: `760px` (el mismo del login).
- Textos de interfaz en castellano rioplatense, con `…` (no `...`).
- **Push a `main` = deploy a producción** (Workers Builds). No se pushea sin verificación local completa y OK explícito del usuario.
- Las hojas de papel y los bloques `@media print` no se tocan.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Desvíos de la spec, a propósito:**
- La vigilancia de tokens va como test de vitest (patrón ya usado con `INDEX_HTML_BARRILES`), no como `scripts/verificar-estilo.mjs` encadenado al `npm test`: corre igual en el CI y no hace falta tocar `package.json`.
- El CSS de `ci-dialogo` y `ci-aviso` vive dentro de `dialogo.js` (como hace `barra.js`), no en `estilo.css`: así el diálogo se ve igual en Prensas, Lotes y Barriles aunque esos módulos todavía no carguen `estilo.css`.
- `ci-mas` lo resuelve `barra.js` con su propio CSS; no va en `estilo.css` hasta que Lotes o Barriles lo necesiten (Etapas 2–3).

---

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `public/shared/estilo.css` | Crear | Fuentes, tokens de Prensas, tokens `--ci-*`, piezas `ci-btn`, `ci-pill`, `ci-pg-head`, `ci-tbar`, `ci-campo`, `ci-tabla` |
| `public/shared/dialogo-modelo.js` | Crear | Lógica pura: normalizar opciones, validar lo pedido, duración del aviso. `globalThis.CIDialogoModelo` |
| `public/shared/dialogo.js` | Crear | `CI.avisar`, `CI.confirmar`, `CI.pedir` con `<dialog>`; CSS propio `.ci-*` |
| `public/shared/barra.js` | Modificar | Plex + tokens, `<nav>`, `aria-current`, menú en celular, publica `--ciw-h`; expone `CIBarra.html(ctx)` |
| `public/shared/fusion.js:425-433` | Modificar | Recuperar borrador con `CI.confirmar` (con respaldo a `confirm`) |
| `src/index.ts:258-281` | Modificar | Extraer `armarInyeccion()` exportada; inyectar `dialogo-modelo.js` + `dialogo.js` antes de `fusion.js` |
| `public/admin.html` | Modificar | Estilo de Prensas con `estilo.css`; `CI.confirmar`; `<fieldset>` |
| `public/cambiar-clave.html` | Modificar | Letras y colores del login; error con `role="alert"` |
| `public/prensas/index.html`, `public/prensas/app.js:519` | Modificar | Solo base de celular |
| `vitest.config.ts`, `test/env.d.ts` | Modificar | Bindings `PRENSAS_HTML`, `ESTILO_CSS`, `ADMIN_HTML`, `CAMBIAR_CLAVE_HTML` |
| `test/estilo-tokens.test.ts` | Crear | Tokens iguales a Prensas, sin selectores de etiqueta |
| `test/dialogo-modelo.test.mjs` | Crear | Tests de la lógica pura |
| `test/inyeccion.test.ts` | Crear | Orden de los scripts inyectados |
| `test/barra.test.mjs` | Crear | HTML de la barra |
| `test/pantallas-sueltas.test.ts` | Crear | admin y cambiar clave: sin `confirm(`, con `estilo.css`, `role="alert"` |

---

### Task 0: Worktree de trabajo

**Files:** ninguno (preparación).

- [ ] **Step 1: Crear el worktree desde `main`**

```bash
cd /c/Users/Bmax/repos/catenainstitute
git fetch -q origin
git worktree add ../catenainstitute-estetica -b feat/estetica-base main
cd ../catenainstitute-estetica
npm ci
```

Expected: worktree en `C:\Users\Bmax\repos\catenainstitute-estetica`, rama `feat/estetica-base`. (Otras sesiones cambian de rama `repos\catenainstitute`: todo el trabajo va en este worktree.)

- [ ] **Step 2: Línea de base de tests**

Run: `npx vitest run`
Expected: todo en verde. Anotar el total de tests para comparar al final.

---

### Task 1: `estilo.css` y su test de tokens

**Files:**
- Create: `public/shared/estilo.css`
- Create: `test/estilo-tokens.test.ts`
- Modify: `vitest.config.ts` (bindings), `test/env.d.ts` (tipos)

**Interfaces:**
- Produces: clases `ci-btn` (+ `.primario`, `.peligro`, `.chico`), `ci-pill` (+ `.ok`, `.mal`, `.aviso`, `.neutro`), `ci-pg-head` (con `h1`, `p`, `.ci-acc`), `ci-tbar`, `ci-campo` (con `label`, `input`, `select`, `.ci-ayuda`), `ci-tabla`; tokens `--ci-r`, `--ci-tap`, `--ci-z-sticky`, `--ci-z-menu`, `--ci-z-dialogo`, `--ci-z-aviso`, `--ci-ring`.

- [ ] **Step 1: Bindings en `vitest.config.ts`**

Después de la lectura de `indexHtmlBarriles`, agregar:

```ts
// Archivos que leen los tests de estilo (mismo motivo: no hay fs en Workers).
const leer = (p: string) => {
  try { return readFileSync(path.join(import.meta.dirname, p), 'utf8'); }
  catch { return ''; }   // archivo todavía no creado: el test falla con un mensaje claro
};
const PRENSAS_HTML = leer('public/prensas/index.html');
const ESTILO_CSS = leer('public/shared/estilo.css');
const ADMIN_HTML = leer('public/admin.html');
const CAMBIAR_CLAVE_HTML = leer('public/cambiar-clave.html');
```

y en `bindings`:

```ts
bindings: { MIGRACIONES: migraciones, INDEX_HTML_BARRILES: indexHtmlBarriles, TEST_MODE: '1',
  PRENSAS_HTML, ESTILO_CSS, ADMIN_HTML, CAMBIAR_CLAVE_HTML },
```

En `test/env.d.ts`, dentro de `ProvidedEnv`:

```ts
    // Leídos en Node por vitest.config.ts para los tests de estilo.
    PRENSAS_HTML: string;
    ESTILO_CSS: string;
    ADMIN_HTML: string;
    CAMBIAR_CLAVE_HTML: string;
```

- [ ] **Step 2: Escribir el test que falla**

`test/estilo-tokens.test.ts`:

```ts
/**
 * public/shared/estilo.css tiene que llevar los MISMOS tokens que Prensas: es la
 * copia que usan Lotes, Barriles y admin para verse como Prensas. Si alguien
 * retoca un color en uno solo de los dos lados, este test lo frena.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function tokens(css: string): Record<string, string> {
  const m = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const decl of m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const k = decl.slice(0, i).trim();
    if (k.startsWith('--')) out[k] = decl.slice(i + 1).trim().replace(/\s+/g, ' ').toLowerCase();
  }
  return out;
}

describe('estilo.css', () => {
  it('existe', () => {
    expect(env.ESTILO_CSS.length).toBeGreaterThan(0);
  });

  it('tiene todos los tokens de Prensas con el mismo valor', () => {
    const prensas = tokens(env.PRENSAS_HTML);
    const comun = tokens(env.ESTILO_CSS);
    expect(Object.keys(prensas).length).toBeGreaterThanOrEqual(19);
    for (const [k, v] of Object.entries(prensas)) {
      expect(comun[k], `token ${k}`).toBe(v);
    }
  });

  it('no estiliza etiquetas sueltas (solo :root y clases ci-*)', () => {
    const sinComentarios = env.ESTILO_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const etiqueta = /(^|[{},])\s*(html|body|table|th|td|tr|select|input|button|textarea|a|h1|h2|h3|p|label)\s*[{,:]/m;
    expect(sinComentarios).not.toMatch(etiqueta);
  });

  it('carga las letras desde /prensas/fonts', () => {
    expect(env.ESTILO_CSS).toContain("url('/prensas/fonts/cormorant-garamond-latin-500-normal.woff2')");
    expect(env.ESTILO_CSS).toContain("url('/prensas/fonts/ibm-plex-sans-latin-400-normal.woff2')");
  });
});
```

Nota sobre la regex de etiquetas: un selector como `.ci-campo input` tiene `input` precedido por espacio, no por `{`, `}` o `,`, así que **no** dispara. Un `input{` suelto al principio de una regla sí.

- [ ] **Step 3: Correrlo y ver que falla**

Run: `npx vitest run test/estilo-tokens.test.ts`
Expected: FAIL en "existe" (`ESTILO_CSS` vacío).

- [ ] **Step 4: Crear `public/shared/estilo.css`**

```css
/* Estilo común de la plataforma: el de Prensas ("Piedra y tinta").
 *
 * Los tokens de :root son COPIA EXACTA de public/prensas/index.html; los vigila
 * test/estilo-tokens.test.ts. Si se cambia un color, se cambia en los dos.
 *
 * Reglas de este archivo:
 *  - Solo :root y clases ci-*. Nada sobre etiquetas sueltas (table, input…):
 *    cada app re-estiliza sus propias clases con estos tokens.
 *  - El aviso y el diálogo (ci-aviso, ci-dialogo) traen su CSS en dialogo.js,
 *    para verse igual en los módulos que todavía no cargan este archivo. */

@font-face{font-family:'Cormorant Garamond';src:url('/prensas/fonts/cormorant-garamond-latin-500-normal.woff2') format('woff2');font-weight:500;font-style:normal;font-display:swap}
@font-face{font-family:'Cormorant Garamond';src:url('/prensas/fonts/cormorant-garamond-latin-600-normal.woff2') format('woff2');font-weight:600;font-style:normal;font-display:swap}
@font-face{font-family:'Cormorant Garamond';src:url('/prensas/fonts/cormorant-garamond-latin-500-italic.woff2') format('woff2');font-weight:500;font-style:italic;font-display:swap}
@font-face{font-family:'IBM Plex Sans';src:url('/prensas/fonts/ibm-plex-sans-latin-400-normal.woff2') format('woff2');font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:'IBM Plex Sans';src:url('/prensas/fonts/ibm-plex-sans-latin-500-normal.woff2') format('woff2');font-weight:500;font-style:normal;font-display:swap}
@font-face{font-family:'IBM Plex Sans';src:url('/prensas/fonts/ibm-plex-sans-latin-600-normal.woff2') format('woff2');font-weight:600;font-style:normal;font-display:swap}

:root{
  --bg:#ECE8E1; --panel:#F4F1EB; --panel2:#E4DFD6; --line:#D6D0C5; --rule:#1C1B19;
  --txt:#1C1B19; --muted:#68625A; --accent:#5A1724; --accent2:#43101A;
  --ok:#56684A; --nook:#8E2330; --warn:#7F622B; --info:#3F5560;
  --ok-tinte:#E3E7DD; --nook-tinte:#F1E3E1; --warn-tinte:#F2EADB; --accent-tinte:rgba(90,23,36,.07);
  --serif:'Cormorant Garamond',Georgia,'Times New Roman',serif;
  --sans:'IBM Plex Sans',system-ui,'Segoe UI',sans-serif;

  /* Propios de la base común (Prensas no los tiene). */
  --ci-r:2px;
  --ci-tap:44px;
  --ci-ring:0 0 0 2px var(--bg),0 0 0 4px var(--accent);
  --ci-z-sticky:40; --ci-z-menu:60; --ci-z-dialogo:1000; --ci-z-aviso:1100;
}

/* Botones: contorno de tinta, como button.btn de Prensas. */
.ci-btn{display:inline-flex;align-items:center;gap:6px;background:transparent;color:var(--txt);border:1px solid var(--txt);border-radius:var(--ci-r);padding:7px 14px;cursor:pointer;font:500 13px/1.2 var(--sans);white-space:nowrap;text-decoration:none;transition:border-color .15s,background .15s,color .15s}
.ci-btn:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-tinte)}
.ci-btn:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.ci-btn:disabled{opacity:.45;cursor:default}
.ci-btn.primario{background:var(--accent);color:#F3EEE6;border-color:var(--accent)}
.ci-btn.primario:hover{background:var(--accent2);border-color:var(--accent2);color:#fff}
.ci-btn.peligro{color:var(--nook);border-color:var(--nook)}
.ci-btn.peligro:hover{background:var(--nook-tinte)}
.ci-btn.chico{padding:5px 10px;font-size:12px}

/* Etiquetas rectas, como .pill de Prensas. */
.ci-pill{display:inline-block;padding:1px 7px;border-radius:var(--ci-r);font:600 11px/1.5 var(--sans);border:1px solid transparent;white-space:nowrap}
.ci-pill.ok{background:var(--ok-tinte);color:var(--ok);border-color:rgba(86,104,74,.3)}
.ci-pill.mal{background:var(--nook-tinte);color:var(--nook);border-color:rgba(142,35,48,.25)}
.ci-pill.aviso{background:var(--warn-tinte);color:var(--warn);border-color:rgba(127,98,43,.3)}
.ci-pill.neutro{background:var(--panel2);color:var(--muted)}

/* Cabecera de pantalla: título en Cormorant, bajada en gris, acciones a la derecha. */
.ci-pg-head{display:flex;align-items:flex-end;gap:18px;margin:2px 0 14px;flex-wrap:wrap}
.ci-pg-head h1{margin:0;font-family:var(--serif);font-size:34px;font-weight:500;line-height:1}
.ci-pg-head p{margin:0 0 3px;color:var(--muted);font-size:13px;max-width:620px;line-height:1.45}
.ci-pg-head .ci-acc{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}

/* Barra mínima sobre una tabla: filete de tinta arriba. */
.ci-tbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 0;border-top:1px solid var(--rule);margin-bottom:8px}

/* Campo de formulario. */
.ci-campo{margin:14px 0 0}
.ci-campo label,.ci-campo legend{display:block;font:500 10px var(--sans);text-transform:uppercase;letter-spacing:1.6px;color:var(--muted);margin-bottom:6px;padding:0}
.ci-campo input[type=text],.ci-campo input[type=password],.ci-campo input[type=number],.ci-campo select,.ci-campo textarea{width:100%;background:var(--panel);color:var(--txt);border:1px solid var(--line);border-radius:var(--ci-r);padding:8px 10px;font:13.5px var(--sans)}
.ci-campo input:focus,.ci-campo select:focus,.ci-campo textarea:focus{border-color:var(--txt);outline:none;box-shadow:inset 3px 0 0 var(--accent)}
.ci-campo .ci-ayuda{color:var(--muted);font-size:12px;line-height:1.5;margin:6px 0 0}
fieldset.ci-campo{border:0;padding:0;min-width:0}

/* Tabla de lista: filete de tinta bajo la cabecera, como las de Prensas. */
.ci-tabla{width:100%;border-collapse:collapse;font-size:13px;background:var(--panel)}
.ci-tabla th,.ci-tabla td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
.ci-tabla th{color:var(--muted);font-weight:500;font-size:10px;text-transform:uppercase;letter-spacing:1.3px;border-bottom-color:var(--rule)}
.ci-tabla td.num{text-align:right;font-variant-numeric:tabular-nums}
.ci-tabla tbody tr:hover{background:var(--panel2)}

/* Celular: blancos táctiles y campos sin zoom de iOS. */
@media (max-width:760px){
  .ci-btn{min-height:var(--ci-tap);padding:10px 16px}
  .ci-btn.chico{min-height:36px}
  .ci-campo input[type=text],.ci-campo input[type=password],.ci-campo input[type=number],.ci-campo select,.ci-campo textarea{font-size:16px;min-height:var(--ci-tap)}
  .ci-pg-head h1{font-size:28px}
}
@media (prefers-reduced-motion:reduce){.ci-btn{transition:none}}
```

Ojo: `fieldset.ci-campo` empieza con `fieldset` precedido de un salto de línea, no de `{`, `}` o `,`… pero la regex usa `(^|[{},])` en modo `m`, y `^` matchea inicio de línea. `fieldset` **no está** en la lista de etiquetas prohibidas, así que pasa. No agregar `fieldset` a la lista.

- [ ] **Step 5: Correr el test**

Run: `npx vitest run test/estilo-tokens.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Probar que el test de verdad caza una diferencia**

Cambiar a mano en `estilo.css` `--accent:#5A1724` por `--accent:#5A1725`, correr el test y ver FAIL con `token --accent`. Volver a `#5A1724` y ver PASS.

- [ ] **Step 7: Commit**

```bash
git add public/shared/estilo.css test/estilo-tokens.test.ts vitest.config.ts test/env.d.ts
git commit -m "feat(estilo): estilo.css común con los tokens de Prensas y test que los vigila

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `dialogo-modelo.js` (lógica pura)

**Files:**
- Create: `public/shared/dialogo-modelo.js`
- Create: `test/dialogo-modelo.test.mjs`

**Interfaces:**
- Produces `globalThis.CIDialogoModelo` con:
  - `normalizarConfirmar(op) → {titulo: string, texto: string, si: string, no: string, peligro: boolean}`. Acepta también un string (se toma como `texto`). Defaults: `titulo: 'Confirmar'`, `si: 'Seguir'`, `no: 'Cancelar'`, `peligro: false`. Si `si` es `'Aceptar'` o `'OK'` (cualquier mayúscula) lo cambia por `'Seguir'`.
  - `normalizarPedir(op) → {titulo, texto, si, no, campo: {tipo: 'text'|'number'|'select', valor: string, opciones: {valor, texto}[], inputmode: string, requerido: boolean, placeholder: string}}`. Defaults: `titulo: 'Completar'`, `si: 'Guardar'`, `no: 'Cancelar'`, `tipo: 'text'` (o `'select'` si hay `opciones`), `requerido: true`. `opciones` acepta strings o `{valor, texto}`. `inputmode` por defecto `'decimal'` si `tipo === 'number'`, si no `''`.
  - `validarPedido(campo, valor) → {ok: boolean, valor: string, error: string}`: recorta espacios; vacío y requerido → error `'Completá este dato.'`; `select` con valor fuera de opciones → `'Elegí una de la lista.'`; `number` que no parsea (acepta coma decimal) → `'Tiene que ser un número.'`; en `number` devuelve el valor con punto decimal.
  - `duracionAviso(op) → number` ms: `op.ms` si es número > 0; si no `8000` con `deshacer`, `5000` para `tipo: 'mal'`, `4000` en el resto.

- [ ] **Step 1: Escribir los tests que fallan**

`test/dialogo-modelo.test.mjs`:

```js
/**
 * Lógica pura del aviso y el diálogo propios (public/shared/dialogo-modelo.js).
 * Va en .mjs porque importa un .js clásico que se cuelga de globalThis.
 */
import { describe, it, expect } from 'vitest';
import '../public/shared/dialogo-modelo.js';

const M = globalThis.CIDialogoModelo;

describe('normalizarConfirmar', () => {
  it('acepta solo un texto', () => {
    expect(M.normalizarConfirmar('¿Borrar la OT 0712?')).toEqual({
      titulo: 'Confirmar', texto: '¿Borrar la OT 0712?', si: 'Seguir', no: 'Cancelar', peligro: false });
  });
  it('respeta los textos de los botones', () => {
    const c = M.normalizarConfirmar({ titulo: 'Borrar OT', texto: 'x', si: 'Borrar OT', no: 'Volver', peligro: true });
    expect(c).toEqual({ titulo: 'Borrar OT', texto: 'x', si: 'Borrar OT', no: 'Volver', peligro: true });
  });
  it('nunca deja "Aceptar" ni "OK" en el botón', () => {
    expect(M.normalizarConfirmar({ texto: 'x', si: 'Aceptar' }).si).toBe('Seguir');
    expect(M.normalizarConfirmar({ texto: 'x', si: 'ok' }).si).toBe('Seguir');
  });
});

describe('normalizarPedir', () => {
  it('con opciones arma un select', () => {
    const p = M.normalizarPedir({ titulo: 'Variedad', campo: { opciones: ['Malbec', { valor: 'CF', texto: 'Cabernet Franc' }] } });
    expect(p.campo.tipo).toBe('select');
    expect(p.campo.opciones).toEqual([{ valor: 'Malbec', texto: 'Malbec' }, { valor: 'CF', texto: 'Cabernet Franc' }]);
    expect(p.si).toBe('Guardar');
  });
  it('un número pide teclado decimal', () => {
    const p = M.normalizarPedir({ campo: { tipo: 'number', valor: 12 } });
    expect(p.campo).toMatchObject({ tipo: 'number', valor: '12', inputmode: 'decimal', requerido: true });
  });
  it('defaults de texto', () => {
    const p = M.normalizarPedir({});
    expect(p.campo).toEqual({ tipo: 'text', valor: '', opciones: [], inputmode: '', requerido: true, placeholder: '' });
    expect(p.titulo).toBe('Completar');
  });
});

describe('validarPedido', () => {
  const texto = M.normalizarPedir({}).campo;
  const num = M.normalizarPedir({ campo: { tipo: 'number' } }).campo;
  const sel = M.normalizarPedir({ campo: { opciones: ['Malbec'] } }).campo;
  it('vacío y requerido', () => {
    expect(M.validarPedido(texto, '   ')).toEqual({ ok: false, valor: '', error: 'Completá este dato.' });
  });
  it('vacío pero opcional', () => {
    expect(M.validarPedido({ ...texto, requerido: false }, '')).toEqual({ ok: true, valor: '', error: '' });
  });
  it('número con coma', () => {
    expect(M.validarPedido(num, ' 12,5 ')).toEqual({ ok: true, valor: '12.5', error: '' });
    expect(M.validarPedido(num, 'doce').error).toBe('Tiene que ser un número.');
  });
  it('select fuera de la lista', () => {
    expect(M.validarPedido(sel, 'Syrah').error).toBe('Elegí una de la lista.');
    expect(M.validarPedido(sel, 'Malbec').ok).toBe(true);
  });
});

describe('duracionAviso', () => {
  it('según el tipo y si tiene deshacer', () => {
    expect(M.duracionAviso({})).toBe(4000);
    expect(M.duracionAviso({ tipo: 'mal' })).toBe(5000);
    expect(M.duracionAviso({ deshacer() {} })).toBe(8000);
    expect(M.duracionAviso({ ms: 1500 })).toBe(1500);
  });
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `npx vitest run test/dialogo-modelo.test.mjs`
Expected: FAIL (`Cannot read properties of undefined` sobre `M`, o import fallido).

- [ ] **Step 3: Implementar `public/shared/dialogo-modelo.js`**

```js
/**
 * Lógica pura del aviso y el diálogo de la plataforma (dialogo.js la usa).
 *
 * Va aparte y sin DOM para poder testearla: los tests corren en el runtime de
 * Workers, donde no hay document. Script clásico que se cuelga de globalThis
 * (como barriles/js/orden-editable.js), porque se carga antes que las apps.
 */
(function (g) {
  'use strict';

  function str(v, def) { return v == null || v === '' ? def : String(v); }

  function normalizarConfirmar(op) {
    if (typeof op === 'string') op = { texto: op };
    op = op || {};
    var si = str(op.si, 'Seguir');
    if (/^(aceptar|ok)$/i.test(si.trim())) si = 'Seguir';
    return {
      titulo: str(op.titulo, 'Confirmar'),
      texto: str(op.texto, ''),
      si: si,
      no: str(op.no, 'Cancelar'),
      peligro: !!op.peligro,
    };
  }

  function normalizarPedir(op) {
    op = op || {};
    var c = op.campo || {};
    var opciones = (c.opciones || []).map(function (o) {
      return typeof o === 'object' && o !== null
        ? { valor: String(o.valor), texto: str(o.texto, String(o.valor)) }
        : { valor: String(o), texto: String(o) };
    });
    var tipo = c.tipo || (opciones.length ? 'select' : 'text');
    return {
      titulo: str(op.titulo, 'Completar'),
      texto: str(op.texto, ''),
      si: str(op.si, 'Guardar'),
      no: str(op.no, 'Cancelar'),
      campo: {
        tipo: tipo,
        valor: c.valor == null ? '' : String(c.valor),
        opciones: opciones,
        inputmode: c.inputmode != null ? String(c.inputmode) : (tipo === 'number' ? 'decimal' : ''),
        requerido: c.requerido !== false,
        placeholder: str(c.placeholder, ''),
      },
    };
  }

  function validarPedido(campo, valor) {
    var v = String(valor == null ? '' : valor).trim();
    if (!v) {
      return campo.requerido
        ? { ok: false, valor: '', error: 'Completá este dato.' }
        : { ok: true, valor: '', error: '' };
    }
    if (campo.tipo === 'select') {
      var esta = campo.opciones.some(function (o) { return o.valor === v; });
      return esta ? { ok: true, valor: v, error: '' } : { ok: false, valor: v, error: 'Elegí una de la lista.' };
    }
    if (campo.tipo === 'number') {
      var n = v.replace(',', '.');
      return /^-?\d+(\.\d+)?$/.test(n)
        ? { ok: true, valor: n, error: '' }
        : { ok: false, valor: v, error: 'Tiene que ser un número.' };
    }
    return { ok: true, valor: v, error: '' };
  }

  function duracionAviso(op) {
    op = op || {};
    if (typeof op.ms === 'number' && op.ms > 0) return op.ms;
    if (typeof op.deshacer === 'function') return 8000;
    if (op.tipo === 'mal') return 5000;
    return 4000;
  }

  g.CIDialogoModelo = {
    normalizarConfirmar: normalizarConfirmar,
    normalizarPedir: normalizarPedir,
    validarPedido: validarPedido,
    duracionAviso: duracionAviso,
  };
})(globalThis);
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run test/dialogo-modelo.test.mjs`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add public/shared/dialogo-modelo.js test/dialogo-modelo.test.mjs
git commit -m "feat(dialogo): lógica pura del aviso y el diálogo propios

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `dialogo.js` + inyección en las pantallas de módulo

**Files:**
- Create: `public/shared/dialogo.js`
- Modify: `src/index.ts:258-281` (extraer `armarInyeccion`)
- Create: `test/inyeccion.test.ts`

**Interfaces:**
- Consumes: `globalThis.CIDialogoModelo` (Task 2).
- Produces `window.CI`:
  - `CI.avisar(texto: string, op?: {tipo?: 'ok'|'mal'|'info', deshacer?: () => void, ms?: number}) → {cerrar(): void}`
  - `CI.confirmar(op: string | {titulo, texto, si, no, peligro}) → Promise<boolean>`
  - `CI.pedir(op: {titulo, texto, si, no, campo: {tipo, valor, opciones, inputmode, requerido, placeholder}}) → Promise<string|null>`
- Produces en `src/index.ts`: `export function armarInyeccion(contexto: {email: string; nombre: string; rol: string; modulo: string; modulos: Record<string, string>}, nombre: string, modulo: string): string`

- [ ] **Step 1: Test de la inyección que falla**

`test/inyeccion.test.ts`:

```ts
/**
 * Lo que el Worker mete en el <head> de cada pantalla de módulo. El orden
 * importa: fusion.js usa CI.confirmar, así que dialogo.js tiene que estar antes.
 */
import { describe, it, expect } from 'vitest';
import { armarInyeccion } from '../src/index';

const ctx = { email: 'ana@catenawines.com', nombre: 'Ana', rol: 'editor', modulo: 'lotes', modulos: { lotes: 'editor' } };

describe('armarInyeccion', () => {
  for (const modulo of ['prensas', 'lotes', 'barriles']) {
    it(`en ${modulo}: modelo → dialogo → fusion, y la barra al final`, () => {
      const h = armarInyeccion({ ...ctx, modulo }, 'Ana', modulo);
      const iModelo = h.indexOf('<script src="/shared/dialogo-modelo.js"></script>');
      const iDialogo = h.indexOf('<script src="/shared/dialogo.js"></script>');
      const iFusion = h.indexOf('<script src="/shared/fusion.js"></script>');
      const iBarra = h.indexOf('<script defer src="/shared/barra.js"></script>');
      expect(iModelo).toBeGreaterThan(-1);
      expect(iDialogo).toBeGreaterThan(iModelo);
      expect(iFusion).toBeGreaterThan(iDialogo);
      expect(iBarra).toBeGreaterThan(iFusion);
      expect(h.endsWith('</head>')).toBe(true);
    });
  }
  it('el Excel solo en prensas y lotes', () => {
    expect(armarInyeccion(ctx, 'Ana', 'lotes')).toContain('/shared/exportar.js');
    expect(armarInyeccion({ ...ctx, modulo: 'barriles' }, 'Ana', 'barriles')).not.toContain('/shared/exportar.js');
  });
  it('no inyecta estilo.css todavía (Lotes y Barriles tienen su :root propio)', () => {
    expect(armarInyeccion(ctx, 'Ana', 'lotes')).not.toContain('estilo.css');
  });
});
```

Run: `npx vitest run test/inyeccion.test.ts`
Expected: FAIL (`armarInyeccion` no exportada).

- [ ] **Step 2: Extraer `armarInyeccion` en `src/index.ts`**

Reemplazar el bloque `const inyeccion = ...;` (líneas ~258-281) por una llamada, y agregar la función exportada debajo de `servirConIdentidad`. La función contiene **el mismo texto de hoy**, con dos scripts nuevos antes de `fusion.js`:

```ts
  const inyeccion = armarInyeccion(contexto, nombre, modulo);
```

```ts
/**
 * Lo que se mete en el <head> de cada pantalla de módulo, ya con el </head>.
 * Separado para poder testear el orden de los scripts.
 */
export function armarInyeccion(
  contexto: { email: string; nombre: string; rol: string; modulo: string; modulos: Record<string, string> },
  nombre: string,
  modulo: string,
): string {
  return (
    // Ícono de la pestaña: sin él, el navegador muestra el globo genérico y
    // parece que la página no terminó de cargar.
    ICONO +
    `<script>/* Identidad de la cuenta de la plataforma y contexto de la plataforma, puestos por el servidor. */\n` +
    // Prensas y Lotes preguntan el nombre por prompt y lo guardan acá; se lo
    // dejamos puesto para que no lo pregunten.
    `try{localStorage.setItem('prensas_usuario',${JSON.stringify(nombre)});}catch(e){}\n` +
    `try{localStorage.setItem('lotes_usuario',${JSON.stringify(nombre)});}catch(e){}\n` +
    `window.CIW=${JSON.stringify(contexto)};window.CIW_USUARIO=window.CIW;` +
    `</script>\n` +
    // Sin defer: tiene que envolver fetch ANTES de que la app haga su primer
    // pedido, o el aviso no aparece.
    `<script src="/shared/pendientes.js"></script>\n` +
    // Aviso y diálogo propios (CI.avisar / CI.confirmar / CI.pedir), en lugar
    // de alert/confirm/prompt. Antes de fusion.js, que los usa al recuperar
    // un borrador. Sin defer: las apps los llaman al cargar.
    `<script src="/shared/dialogo-modelo.js"></script>\n` +
    `<script src="/shared/dialogo.js"></script>\n` +
    // Fusión de cambios entre dispositivos, borrador local y aviso de sesión
    // cerrada. Sin defer: la app lo lee al cargar.
    `<script src="/shared/fusion.js"></script>\n` +
    // La exportación a Excel se arma en el navegador, porque la nube no
    // ejecuta openpyxl. Solo se carga donde hay botón de exportar: es 950 KB.
    (modulo === 'prensas' || modulo === 'lotes'
      ? `<script defer src="/shared/xlsx.full.min.js"></script>\n` +
        `<script defer src="/shared/exportar.js"></script>\n`
      : '') +
    `<script defer src="/shared/barra.js"></script>\n</head>`
  );
}
```

Ajustar el tipo de `contexto` si `id.rol` puede ser `null` en el tipo real (usar el tipo que ya tenga `contexto` en el código: `typeof contexto`). Correr `npx tsc --noEmit` para confirmar.

- [ ] **Step 3: Correr el test**

Run: `npx vitest run test/inyeccion.test.ts && npx tsc --noEmit`
Expected: PASS y sin errores de tipos.

- [ ] **Step 4: Implementar `public/shared/dialogo.js`**

```js
/**
 * Aviso y diálogo de la plataforma: CI.avisar, CI.confirmar y CI.pedir, en
 * lugar de alert/confirm/prompt (que frenan la pantalla, no se pueden diseñar
 * y en el celular se leen mal).
 *
 * Trae su propio CSS acotado a .ci-avisos / .ci-dialogo con los colores de
 * Prensas escritos acá: así se ve igual en los tres módulos aunque alguno no
 * cargue todavía shared/estilo.css. La lógica pura está en dialogo-modelo.js.
 */
(function (g) {
  'use strict';
  var M = g.CIDialogoModelo;
  if (!g.document || !M) return;
  var d = g.document;

  var CSS =
    '.ci-avisos{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:1100;display:flex;flex-direction:column;gap:8px;width:min(520px,calc(100% - 32px));pointer-events:none}' +
    '.ci-aviso{pointer-events:auto;display:flex;align-items:center;gap:14px;background:#1C1B19;color:#ECE8E1;border-left:3px solid #ECE8E1;padding:11px 14px;font:13.5px/1.45 "IBM Plex Sans",system-ui,"Segoe UI",sans-serif;box-shadow:0 10px 30px -14px rgba(28,27,25,.55)}' +
    '.ci-aviso.ok{border-left-color:#9DB08F}.ci-aviso.mal{border-left-color:#D9727E}' +
    '.ci-aviso span{flex:1;white-space:pre-line}' +
    '.ci-aviso button{background:none;border:1px solid rgba(236,232,225,.5);color:#ECE8E1;padding:5px 11px;font:500 12.5px "IBM Plex Sans",system-ui,sans-serif;cursor:pointer;border-radius:2px}' +
    '.ci-aviso button:hover{border-color:#ECE8E1}' +
    '.ci-aviso button:focus-visible{outline:2px solid #ECE8E1;outline-offset:2px}' +
    '.ci-dialogo{border:1px solid #1C1B19;border-top:3px solid #1C1B19;border-radius:2px;padding:0;width:min(480px,calc(100% - 32px));background:#F4F1EB;color:#1C1B19;font:14px/1.45 "IBM Plex Sans",system-ui,"Segoe UI",sans-serif;box-shadow:8px 8px 0 rgba(28,27,25,.08)}' +
    '.ci-dialogo::backdrop{background:rgba(28,27,25,.38)}' +
    '.ci-dialogo form{padding:20px 22px 18px;margin:0}' +
    '.ci-dialogo h2{margin:0 0 10px;font:500 24px/1.1 "Cormorant Garamond",Georgia,serif}' +
    '.ci-dialogo p{margin:0 0 14px;color:#68625A;white-space:pre-line}' +
    '.ci-dialogo label{display:block;font:500 10px "IBM Plex Sans",sans-serif;text-transform:uppercase;letter-spacing:1.6px;color:#68625A;margin-bottom:6px}' +
    '.ci-dialogo input,.ci-dialogo select{width:100%;box-sizing:border-box;background:#fff;color:#1C1B19;border:1px solid #D6D0C5;border-radius:2px;padding:9px 10px;font:14px "IBM Plex Sans",sans-serif}' +
    '.ci-dialogo input:focus,.ci-dialogo select:focus{outline:none;border-color:#1C1B19;box-shadow:inset 3px 0 0 #5A1724}' +
    '.ci-dialogo .ci-err{color:#8E2330;font-size:12.5px;margin:6px 0 0;min-height:1em}' +
    '.ci-dialogo .ci-pie{display:flex;justify-content:flex-end;gap:8px;margin-top:18px;flex-wrap:wrap}' +
    '.ci-dialogo .ci-pie button{background:transparent;color:#1C1B19;border:1px solid #1C1B19;border-radius:2px;padding:8px 15px;font:500 13px "IBM Plex Sans",sans-serif;cursor:pointer}' +
    '.ci-dialogo .ci-pie button:hover{border-color:#5A1724;color:#5A1724;background:rgba(90,23,36,.07)}' +
    '.ci-dialogo .ci-pie button.si{background:#5A1724;border-color:#5A1724;color:#F3EEE6}' +
    '.ci-dialogo .ci-pie button.si:hover{background:#43101A;border-color:#43101A;color:#fff}' +
    '.ci-dialogo .ci-pie button.si.peligro{background:#8E2330;border-color:#8E2330}' +
    '.ci-dialogo button:focus-visible{outline:2px solid #5A1724;outline-offset:2px}' +
    '@media (max-width:760px){.ci-dialogo{width:calc(100% - 20px);max-width:none}' +
    '.ci-dialogo .ci-pie button{min-height:44px;flex:1}.ci-dialogo input,.ci-dialogo select{font-size:16px;min-height:44px}' +
    '.ci-aviso button{min-height:40px}}' +
    '@media print{.ci-avisos,.ci-dialogo{display:none!important}}';

  function asegurarEstilo() {
    if (d.getElementById('ci-dialogo-css')) return;
    var s = d.createElement('style');
    s.id = 'ci-dialogo-css';
    s.textContent = CSS;
    (d.head || d.documentElement).appendChild(s);
  }

  function el(tag, cls, texto) {
    var e = d.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = texto;
    return e;
  }

  // ---------- aviso ----------
  var caja = null;
  function contenedor() {
    if (caja && caja.isConnected) return caja;
    caja = el('div', 'ci-avisos');
    caja.setAttribute('role', 'status');
    caja.setAttribute('aria-live', 'polite');
    d.body.appendChild(caja);
    return caja;
  }

  function avisar(texto, op) {
    op = op || {};
    asegurarEstilo();
    var a = el('div', 'ci-aviso' + (op.tipo ? ' ' + op.tipo : ''));
    a.appendChild(el('span', '', texto));
    var t = null;
    function cerrar() { if (t) clearTimeout(t); if (a.parentNode) a.parentNode.removeChild(a); }
    if (typeof op.deshacer === 'function') {
      var b = el('button', '', 'Deshacer');
      b.type = 'button';
      b.addEventListener('click', function () { cerrar(); op.deshacer(); });
      a.appendChild(b);
    }
    contenedor().appendChild(a);
    t = setTimeout(cerrar, M.duracionAviso(op));
    return { cerrar: cerrar };
  }

  // ---------- diálogo ----------
  // Arma un <dialog>, lo abre con showModal (Escape cierra, el foco queda
  // adentro) y al cerrar devuelve el foco a donde estaba.
  function abrir(armar) {
    asegurarEstilo();
    return new Promise(function (resolver) {
      var previo = d.activeElement;
      var dlg = el('dialog', 'ci-dialogo');
      var form = el('form');
      form.method = 'dialog';
      dlg.appendChild(form);
      var hecho = false;
      function terminar(valor) {
        if (hecho) return;
        hecho = true;
        if (dlg.open) dlg.close();
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        if (previo && typeof previo.focus === 'function' && previo.isConnected) previo.focus();
        resolver(valor);
      }
      var foco = armar(form, terminar);
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); terminar(null); });
      d.body.appendChild(dlg);
      dlg.showModal();
      if (foco) foco.focus();
    });
  }

  function pie(form, c, alSi, alNo) {
    var p = el('div', 'ci-pie');
    var no = el('button', 'no', c.no);
    no.type = 'button';
    no.addEventListener('click', alNo);
    var si = el('button', 'si' + (c.peligro ? ' peligro' : ''), c.si);
    si.type = 'submit';
    p.appendChild(no);
    p.appendChild(si);
    form.appendChild(p);
    form.addEventListener('submit', function (e) { e.preventDefault(); alSi(); });
    return { si: si, no: no };
  }

  function confirmar(op) {
    var c = M.normalizarConfirmar(op);
    return abrir(function (form, terminar) {
      form.appendChild(el('h2', '', c.titulo));
      if (c.texto) form.appendChild(el('p', '', c.texto));
      var b = pie(form, c, function () { terminar(true); }, function () { terminar(false); });
      // En lo peligroso el foco arranca en Cancelar: un Enter apurado no borra.
      return c.peligro ? b.no : b.si;
    }).then(function (v) { return v === true; });
  }

  var nId = 0;
  function pedir(op) {
    var c = M.normalizarPedir(op);
    return abrir(function (form, terminar) {
      form.appendChild(el('h2', '', c.titulo));
      if (c.texto) form.appendChild(el('p', '', c.texto));
      var id = 'ci-pedir-' + (++nId);
      var lab = el('label', '', c.titulo);
      lab.htmlFor = id;
      form.appendChild(lab);
      var campo;
      if (c.campo.tipo === 'select') {
        campo = el('select');
        if (!c.campo.valor) campo.appendChild(el('option', '', 'Elegí…')).value = '';
        c.campo.opciones.forEach(function (o) {
          var opt = el('option', '', o.texto);
          opt.value = o.valor;
          campo.appendChild(opt);
        });
        campo.value = c.campo.valor;
      } else {
        campo = el('input');
        campo.type = 'text';
        campo.value = c.campo.valor;
        campo.autocomplete = 'off';
        if (c.campo.inputmode) campo.setAttribute('inputmode', c.campo.inputmode);
        if (c.campo.placeholder) campo.placeholder = c.campo.placeholder;
      }
      campo.id = id;
      form.appendChild(campo);
      var err = el('p', 'ci-err');
      err.id = id + '-err';
      err.setAttribute('aria-live', 'polite');
      campo.setAttribute('aria-describedby', err.id);
      form.appendChild(err);
      pie(form, c, function () {
        var r = M.validarPedido(c.campo, campo.value);
        if (!r.ok) { err.textContent = r.error; campo.focus(); return; }
        terminar(r.valor);
      }, function () { terminar(null); });
      return campo;
    });
  }

  g.CI = g.CI || {};
  g.CI.avisar = avisar;
  g.CI.confirmar = confirmar;
  g.CI.pedir = pedir;
})(globalThis);
```

- [ ] **Step 5: Correr toda la suite**

Run: `npx vitest run`
Expected: todo verde (el archivo de DOM no se testea con vitest; se verifica en el navegador en la Task 9).

- [ ] **Step 6: Commit**

```bash
git add public/shared/dialogo.js src/index.ts test/inyeccion.test.ts
git commit -m "feat(dialogo): CI.avisar/confirmar/pedir con <dialog> e inyección en los tres módulos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Recuperar el borrador con `CI.confirmar` (`fusion.js`)

**Files:**
- Modify: `public/shared/fusion.js:425-433`

**Interfaces:**
- Consumes: `g.CI.confirmar` (Task 3). `recuperar(modulo, servidor)` sigue devolviendo `Promise<documento|null>` (Prensas `app.js:149` y Lotes `nucleo.js:466` ya lo `await`ean: no cambian).

- [ ] **Step 1: Reemplazar el `g.confirm` por una promesa**

En `recuperar`, reemplazar desde `var si = g.confirm(` hasta `return doc;` por:

```js
      var cuantas = candidatos.length > 1 ? ' (de ' + candidatos.length + ' pestañas)' : '';
      var texto = 'En este equipo quedaron cambios sin guardar' + cuantas + ', el último del ' + cuando + '.\n' +
        'Si los recuperás, se combinan con lo que cargaron los demás.';
      // CI.confirmar lo pone dialogo.js (lo inyecta el servidor antes que este
      // archivo). Sin él (tests, página suelta) se usa el confirm de siempre.
      var preguntar = g.CI && g.CI.confirmar
        ? g.CI.confirmar({ titulo: 'Cambios sin guardar', texto: texto, si: 'Recuperar cambios', no: 'Descartarlos' })
        : Promise.resolve(g.confirm(texto + '\n\nAceptar = recuperarlos · Cancelar = descartarlos.'));
      var claves = candidatos.map(function (b) { return b.clave; });
      return preguntar.then(function (si) {
        if (!si) { borrador.borrarClaves(claves); return null; }
        var doc = servidor;
        candidatos.forEach(function (b) { doc = fusionarDocumento(b.valor.base, b.valor.local, doc); });
        // Los de pestañas cerradas pasan a ser de esta: el de esta pestaña se
        // reescribe con todo junto en cuanto la app marque los cambios.
        borrador.borrarClaves(claves.filter(function (k) { return k !== propia; }));
        return doc;
      });
```

(El `.then` exterior ya devuelve lo que devuelva este bloque, así que la cadena sigue resolviendo al documento o a `null`.)

- [ ] **Step 2: Suite completa**

Run: `npx vitest run test/fusion.test.mjs && npx vitest run`
Expected: PASS (los tests de fusión no ejercitan `recuperar`; se prueba en el navegador en la Task 9: con un borrador en IndexedDB aparece el diálogo "Cambios sin guardar").

- [ ] **Step 3: Commit**

```bash
git add public/shared/fusion.js
git commit -m "feat(fusion): recuperar el borrador con el diálogo propio en vez de confirm()

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Barra común con Plex, `<nav>` y menú en el celular

**Files:**
- Modify: `public/shared/barra.js`
- Create: `test/barra.test.mjs`

**Interfaces:**
- Produces `globalThis.CIBarra.html(ctx: {modulo, modulos, nombre, rol}) → string` (el contenido interno de `<nav id="ciw-barra">`).
- Produces en el DOM: `document.documentElement.style['--ciw-h']` = alto de la barra en px, actualizado al cambiar de tamaño.

- [ ] **Step 1: Test que falla**

`test/barra.test.mjs`:

```js
/**
 * La barra común (public/shared/barra.js). Se testea el HTML que arma; el
 * montaje en la página necesita DOM y se verifica en el navegador.
 */
import { describe, it, expect } from 'vitest';
import '../public/shared/barra.js';

const html = (ctx) => globalThis.CIBarra.html(ctx);

describe('barra común', () => {
  const ctx = { modulo: 'lotes', modulos: { lotes: 'editor', prensas: 'lector' }, nombre: 'Ana <x>', rol: 'editor' };

  it('marca el módulo actual con aria-current y no lo enlaza', () => {
    const h = html(ctx);
    expect(h).toContain('<span class="aqui" aria-current="page">Lotes</span>');
    expect(h).not.toContain('href="/lotes/"');
  });
  it('solo ofrece los módulos con rol', () => {
    const h = html(ctx);
    expect(h).toContain('href="/prensas/"');
    expect(h).not.toContain('href="/barriles/"');
  });
  it('escapa el nombre', () => {
    expect(html(ctx)).toContain('Ana &lt;x&gt;');
  });
  it('Reporte solo en prensas y lotes', () => {
    expect(html(ctx)).toContain('/lotes/reporte');
    expect(html({ ...ctx, modulo: 'barriles' })).not.toContain('reporte');
  });
  it('trae el menú de cuenta para el celular, con Contraseña y Salir', () => {
    const h = html(ctx);
    expect(h).toContain('class="cuenta-btn"');
    expect(h).toContain('aria-expanded="false"');
    expect((h.match(/href="\/api\/auth\/logout"/g) || []).length).toBe(2);   // ancho y celular
  });
});
```

Run: `npx vitest run test/barra.test.mjs`
Expected: FAIL (`globalThis.CIBarra` no existe; o el import revienta en `document.createElement`).

- [ ] **Step 2: Reescribir `public/shared/barra.js`**

```js
/**
 * Barra de la plataforma: volver al portal, saltar a otro módulo y ver quién
 * sos. La inyecta el servidor en los tres módulos, así que ninguna de las
 * apps tuvo que modificarse para tenerla.
 *
 * Letras y colores de Prensas (Plex, tinta #1C1B19 sobre piedra). En el celular
 * (≤ 760 px) el nombre, Contraseña y Salir pasan a un menú "Cuenta" para que la
 * barra no se desborde. Publica su alto en --ciw-h para que los encabezados
 * fijos de cada app se ubiquen debajo.
 *
 * El servidor deja los datos en window.CIW antes de que corra esto.
 */
(function (g) {
  'use strict';

  var NOMBRES = { prensas: 'Prensas', barriles: 'Barriles', lotes: 'Lotes' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function html(ctx) {
    ctx = ctx || {};
    var actual = ctx.modulo || '';
    var modulos = ctx.modulos || {};
    var p = ['<a class="inicio" href="/" title="Volver al menú">← Menú</a>', '<span class="sep" aria-hidden="true"></span>'];
    ['prensas', 'barriles', 'lotes'].forEach(function (m) {
      if (m === actual) p.push('<span class="aqui" aria-current="page">' + NOMBRES[m] + '</span>');
      else if (modulos[m]) p.push('<a href="/' + m + '/">' + NOMBRES[m] + '</a>');
    });
    // Reporte de gerencia: solo en los módulos que lo tienen.
    if (actual === 'prensas' || actual === 'lotes') {
      p.push('<span class="sep ancho" aria-hidden="true"></span>');
      p.push('<a class="ancho" href="/' + actual + '/reporte" target="_blank" rel="noopener" ' +
        'title="Reporte para gerencia, en vivo">Reporte</a>');
    }
    var yo = ctx.nombre
      ? esc(ctx.nombre) + (ctx.rol ? ' <span class="rol">' + esc(ctx.rol) + '</span>' : '')
      : '';
    /* Cerrar sesión: /api/auth/logout borra la sesión y la cookie. Hace falta
       sobre todo en las PC compartidas de la bodega, donde si no queda abierta y
       el siguiente que se sienta guarda con el nombre del anterior. */
    p.push('<span class="cuenta-ancho">' +
      (yo ? '<span class="yo">' + yo + '</span>' : '') +
      '<span class="sep" aria-hidden="true"></span>' +
      '<a class="salir" href="/cambiar-clave.html" title="Cambiar tu contraseña">Contraseña</a>' +
      '<a class="salir" href="/api/auth/logout" title="Cerrar sesión y volver al login">Salir</a>' +
      '</span>');
    p.push('<span class="cuenta-cel">' +
      '<button type="button" class="cuenta-btn" aria-expanded="false" aria-controls="ciw-cuenta">Cuenta</button>' +
      '<span class="cuenta-menu" id="ciw-cuenta" hidden>' +
      (yo ? '<span class="yo">' + yo + '</span>' : '') +
      '<a href="/cambiar-clave.html">Contraseña</a>' +
      '<a href="/api/auth/logout">Salir</a>' +
      '</span></span>');
    return p.join('');
  }

  g.CIBarra = { html: html };
  if (!g.document) return;   // tests: solo se exporta el armado
  var d = g.document;

  var css =
    "@font-face{font-family:'IBM Plex Sans';src:url('/prensas/fonts/ibm-plex-sans-latin-400-normal.woff2') format('woff2');font-weight:400;font-display:swap}" +
    "@font-face{font-family:'IBM Plex Sans';src:url('/prensas/fonts/ibm-plex-sans-latin-500-normal.woff2') format('woff2');font-weight:500;font-display:swap}" +
    '#ciw-barra{position:sticky;top:0;z-index:1050;display:flex;align-items:center;gap:6px;' +
    'padding:6px 16px;background:#1C1B19;color:#ECE8E1;font-size:12.5px;' +
    "font-family:'IBM Plex Sans',system-ui,'Segoe UI',sans-serif;line-height:1.4;min-height:38px;box-sizing:border-box}" +
    '#ciw-barra a{color:#ECE8E1;text-decoration:none;padding:4px 9px;border-radius:2px;transition:background .15s}' +
    '#ciw-barra a:hover{background:rgba(236,232,225,.12)}' +
    '#ciw-barra a:focus-visible,#ciw-barra button:focus-visible{outline:2px solid #ECE8E1;outline-offset:1px}' +
    '#ciw-barra .inicio{border:1px solid rgba(236,232,225,.3)}' +
    '#ciw-barra .sep{width:1px;height:16px;background:rgba(236,232,225,.2);margin:0 4px}' +
    '#ciw-barra .aqui{padding:4px 9px;font-weight:500;box-shadow:inset 0 -2px 0 #ECE8E1}' +
    '#ciw-barra .cuenta-ancho{margin-left:auto;display:flex;align-items:center;gap:4px;white-space:nowrap}' +
    '#ciw-barra .yo{opacity:.75}' +
    '#ciw-barra .rol{opacity:.6;text-transform:uppercase;letter-spacing:1.2px;font-size:9.5px;margin-left:4px}' +
    '#ciw-barra .salir{opacity:.8}' +
    '#ciw-barra .cuenta-cel{display:none;margin-left:auto;position:relative}' +
    '#ciw-barra .cuenta-btn{background:none;border:1px solid rgba(236,232,225,.3);color:#ECE8E1;font:inherit;padding:0 12px;min-height:36px;border-radius:2px;cursor:pointer}' +
    '#ciw-barra .cuenta-menu{position:absolute;right:0;top:calc(100% + 6px);min-width:200px;background:#1C1B19;border:1px solid rgba(236,232,225,.25);display:flex;flex-direction:column;padding:6px 0}' +
    '#ciw-barra .cuenta-menu[hidden]{display:none}' +
    '#ciw-barra .cuenta-menu .yo{padding:8px 14px;border-bottom:1px solid rgba(236,232,225,.15);margin-bottom:4px}' +
    '#ciw-barra .cuenta-menu a{padding:11px 14px}' +
    '@media (max-width:760px){#ciw-barra{padding:4px 10px;gap:2px}' +
    '#ciw-barra a{padding:9px 9px}' +
    '#ciw-barra .ancho,#ciw-barra .cuenta-ancho{display:none}' +
    '#ciw-barra .cuenta-cel{display:block}}' +
    '@media (prefers-reduced-motion:reduce){#ciw-barra a{transition:none}}' +
    '@media print{#ciw-barra{display:none}}';

  var est = d.createElement('style');
  est.textContent = css;
  d.head.appendChild(est);

  var ctx = g.CIW || {};
  var barra = d.createElement('nav');
  barra.id = 'ciw-barra';
  barra.setAttribute('aria-label', 'Plataforma');
  barra.innerHTML = html(ctx);

  var btn = barra.querySelector('.cuenta-btn');
  var menu = barra.querySelector('.cuenta-menu');
  function abrirMenu(si) {
    menu.hidden = !si;
    btn.setAttribute('aria-expanded', si ? 'true' : 'false');
  }
  btn.addEventListener('click', function (e) { e.stopPropagation(); abrirMenu(menu.hidden); });
  d.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) abrirMenu(false); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { abrirMenu(false); btn.focus(); } });

  function publicarAlto() {
    d.documentElement.style.setProperty('--ciw-h', barra.offsetHeight + 'px');
  }

  function montar() {
    if (d.getElementById('ciw-barra')) return;
    d.body.insertBefore(barra, d.body.firstChild);
    publicarAlto();
    if (g.ResizeObserver) new g.ResizeObserver(publicarAlto).observe(barra);
    else g.addEventListener('resize', publicarAlto);
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', montar);
  else montar();
})(globalThis);
```

Notas:
- `z-index:1050` (antes `99999`): queda sobre los menús de las apps (≤ 60) y debajo del diálogo (que va en la capa superior del navegador por `showModal`) y del aviso (`1100`). Verificar en la Task 9 que en Barriles nada quede encima de la barra (el velo sin conexión usa `9999`: **a propósito** debe seguir tapándola; si no la tapa, no es un problema de esta etapa, anotarlo).
- Se quita el emoji 📊 de "Reporte" (sin emojis, como Prensas).
- Prensas sigue fijando `--ciw-h` por su cuenta (`app.js:1585`): las dos escriben el mismo valor; no se toca Prensas.

- [ ] **Step 3: Correr el test**

Run: `npx vitest run test/barra.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 4: Commit**

```bash
git add public/shared/barra.js test/barra.test.mjs
git commit -m "feat(barra): letras y colores de Prensas, <nav> con aria-current, menú Cuenta en el celular y --ciw-h

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: admin con el estilo de Prensas

**Files:**
- Modify: `public/admin.html` (todo el `<style>`, el `<header>`, el campo "Acceso a cada módulo", los dos `confirm(` de las líneas ~268 y ~305, y el `<head>` para cargar `estilo.css` y los scripts del diálogo)
- Create: `test/pantallas-sueltas.test.ts`

**Interfaces:**
- Consumes: `estilo.css` (Task 1), `CI.confirmar` (Task 3).

- [ ] **Step 1: Test que falla**

`test/pantallas-sueltas.test.ts`:

```ts
/**
 * admin.html y cambiar-clave.html: las reglas de la estética unificada que
 * tienen que seguir cumplidas en los archivos reales.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('admin.html', () => {
  const h = env.ADMIN_HTML;
  it('usa el estilo común', () => {
    expect(h).toContain('<link rel="stylesheet" href="/shared/estilo.css">');
  });
  it('carga el diálogo propio y no usa confirm/alert/prompt', () => {
    expect(h).toContain('<script src="/shared/dialogo-modelo.js"></script>');
    expect(h).toContain('<script src="/shared/dialogo.js"></script>');
    expect(h).not.toMatch(/\b(confirm|alert|prompt)\(/);
  });
  it('ya no usa las letras viejas', () => {
    expect(h).not.toMatch(/Fraunces|Hanken/);
  });
  it('agrupa el acceso por módulo en un fieldset', () => {
    expect(h).toMatch(/<fieldset class="ci-campo">\s*<legend>Acceso a cada módulo<\/legend>/);
  });
});

describe('cambiar-clave.html', () => {
  const h = env.CAMBIAR_CLAVE_HTML;
  it('usa las letras del login', () => {
    expect(h).toContain("font-family:'Instrument Serif'");
    expect(h).toContain("font-family:'IBM Plex Sans'");
    expect(h).not.toMatch(/Fraunces|Hanken/);
  });
  it('anuncia el error al lector de pantalla', () => {
    expect(h).toMatch(/id="error"[^>]*role="alert"|role="alert"[^>]*id="error"/);
  });
  it('mantiene los autocompletar de contraseña', () => {
    expect(h).toContain('autocomplete="current-password"');
    expect((h.match(/autocomplete="new-password"/g) || []).length).toBe(2);
  });
});
```

Run: `npx vitest run test/pantallas-sueltas.test.ts`
Expected: FAIL en los de admin y cambiar clave.

- [ ] **Step 2: `<head>` de admin**

Reemplazar las 4 líneas de `@font-face` y el bloque `:root{...}` del `<style>` por nada (salen de `estilo.css`), y antes del `<style>` agregar:

```html
<link rel="stylesheet" href="/shared/estilo.css">
<script src="/shared/dialogo-modelo.js"></script>
<script src="/shared/dialogo.js"></script>
```

- [ ] **Step 3: Reemplazar el resto del `<style>` de admin**

Todo el contenido del `<style>` de admin pasa a ser:

```css
  *{box-sizing:border-box}
  body{margin:0;font-family:var(--sans);background:var(--bg);color:var(--txt);font-size:14px;line-height:1.4;-webkit-font-smoothing:antialiased;min-height:100vh}
  ::selection{background:var(--accent);color:#fff}
  :focus-visible{outline:2px solid var(--accent);outline-offset:1px}
  header{position:sticky;top:0;z-index:var(--ci-z-sticky);background:var(--bg);display:flex;align-items:center;gap:18px;padding:11px 26px;border-bottom:1px solid var(--rule);flex-wrap:wrap}
  header .marca{font-family:var(--serif);font-size:27px;font-weight:500;line-height:1}
  header .sub{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:1.8px}
  header .right{margin-left:auto;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);flex-wrap:wrap}
  main{max-width:1080px;margin:0 auto;padding:22px 26px 60px}
  .usuario{font-weight:600}
  .muted{color:var(--muted);font-size:12px}
  .envoltura{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .ci-tabla td.acciones{white-space:nowrap;text-align:right}
  .ci-tabla td.acciones .ci-btn{margin-left:6px}
  .ci-pill{margin:1px 2px 1px 0;text-transform:uppercase;letter-spacing:1px;font-size:9.5px}
  dialog#dlg{border:1px solid var(--rule);border-top:3px solid var(--rule);border-radius:var(--ci-r);padding:0;width:min(560px,calc(100% - 32px));background:var(--panel);color:var(--txt);box-shadow:8px 8px 0 rgba(28,27,25,.08)}
  dialog#dlg::backdrop{background:rgba(28,27,25,.38)}
  .dlg{padding:22px 24px}
  .dlg h3{margin:0 0 6px;font-family:var(--serif);font-size:26px;font-weight:500}
  .mods{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
  .mods label{text-transform:none;letter-spacing:0;font-size:12px}
  .checks{display:flex;gap:20px;flex-wrap:wrap;margin-top:16px}
  .checks label{display:flex;align-items:center;gap:7px;font-size:13px;min-height:32px}
  .checks input{accent-color:var(--accent)}
  .pie{display:flex;gap:8px;justify-content:flex-end;margin-top:22px;flex-wrap:wrap}
  .pie .izq{margin-right:auto}
  .error{background:var(--nook-tinte);border-left:3px solid var(--nook);color:var(--nook);padding:10px 12px;font-size:13px;line-height:1.5;margin-top:14px}
  .ok{background:var(--ok-tinte);border-left:3px solid var(--ok);color:var(--ok);padding:10px 12px;font-size:13px;line-height:1.5;margin-bottom:16px}
  @media (max-width:760px){
    header{padding:10px 16px}
    main{padding:18px 16px 50px}
    .mods{grid-template-columns:1fr}
    .pie .ci-btn{flex:1}
    .pie .izq{flex-basis:100%}
  }
```

- [ ] **Step 4: Markup de admin**

1. `<header>`: reemplazar por

```html
<header>
  <span class="marca">Usuarios</span>
  <span class="sub">Plataforma CIW · administración</span>
  <div class="right">
    <span id="quien"></span>
    <a class="ci-btn chico" href="/">← Menú</a>
    <a class="ci-btn chico" href="/cambiar-clave.html">Contraseña</a>
    <a class="ci-btn chico" href="/api/auth/logout">Salir</a>
  </div>
</header>
```

2. El bloque `<div class="barra">…</div>` de `<main>`: reemplazar por

```html
  <div class="ci-pg-head">
    <h1>Usuarios</h1>
    <p>Los usuarios nuevos entran con la contraseña <strong>1234</strong> y se les pide cambiarla.</p>
    <div class="ci-acc"><button class="ci-btn primario" id="nuevo" type="button">Nuevo usuario</button></div>
  </div>
```

3. En el `<dialog>`: cada `<div class="campo">` pasa a `<div class="ci-campo">`; cada `<p class="ayuda">` a `<p class="ci-ayuda">`. El campo de módulos pasa a:

```html
    <fieldset class="ci-campo">
      <legend>Acceso a cada módulo</legend>
      <div class="mods">
        <div><label for="m-prensas">Prensas</label><select id="m-prensas"></select></div>
        <div><label for="m-barriles">Barriles</label><select id="m-barriles"></select></div>
        <div><label for="m-lotes">Lotes</label><select id="m-lotes"></select></div>
      </div>
      <p class="ci-ayuda">Lector: solo mira · Editor: carga y edita · Admin: todo, incluidos los respaldos.<br>
        En Barriles, Editor abre la vista de <b>operario</b> y Admin la de <b>programador</b>.</p>
    </fieldset>
```

4. `<div class="campo checks">` pasa a `<div class="checks">`.
5. Botones del pie: `class="sec izq"` → `class="ci-btn izq"`; `class="sec"` → `class="ci-btn"`; el `submit` → `class="ci-btn primario"`.
6. En el JS que arma la tabla (`fila(u)` y `pintar()`): la `<table class="tabla">` pasa a `<table class="ci-tabla">`; los botones de cada fila `class="sec chico"` → `class="ci-btn chico"` y el de eliminar `class="peligro chico"` → `class="ci-btn chico peligro"`; los chips `class="chip admin"` / `editor` / `lector` / `warn` / `off` pasan a `class="ci-pill neutro"` para admin/lector/off, `ci-pill ok` para editor, `ci-pill aviso` para warn. (Buscar `class="chip` y `class="sec` / `class="peligro` en el `<script>` y reemplazar cada uno; si hay otra clase de botón que no esté en esta lista, pasarla a `ci-btn chico`.)

- [ ] **Step 5: Los dos `confirm()` de admin**

Eliminar usuario (handler de `$('contenido')`, que ya es `async`):

```js
    const u = el.dataset.eliminar;
    const seguro = await CI.confirmar({
      titulo: 'Eliminar usuario',
      texto: `"${u}" pierde el acceso a la plataforma. El historial de lo que cargó se conserva.`,
      si: 'Eliminar usuario', no: 'Cancelar', peligro: true,
    });
    if (!seguro) return;
```

Resetear contraseña (handler de `$('f-reset')`, ya `async`). Ojo: el `<dialog id="dlg">` de admin está abierto con `showModal`; un segundo `showModal` encima funciona en los navegadores actuales (se apila):

```js
  if (!editando) return;
  const seguro = await CI.confirmar({
    titulo: 'Resetear contraseña',
    texto: `La contraseña de "${editando}" vuelve a 1234. Se le cierran las sesiones abiertas y al entrar se le pide elegir una nueva.`,
    si: 'Resetear a 1234', no: 'Cancelar', peligro: true,
  });
  if (!seguro) return;
```

- [ ] **Step 6: Tests**

Run: `npx vitest run test/pantallas-sueltas.test.ts`
Expected: los 4 de admin PASS (los de cambiar clave siguen en FAIL hasta la Task 7).

- [ ] **Step 7: Commit**

```bash
git add public/admin.html test/pantallas-sueltas.test.ts
git commit -m "feat(admin): estilo de Prensas con estilo.css y diálogo propio para eliminar y resetear

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: cambiar clave con el estilo del login

**Files:**
- Modify: `public/cambiar-clave.html` (el `<style>` completo, el markup de `<main>`; la lógica del `<script>` NO se toca salvo `err.style.display` → atributo `hidden`, ver abajo)

- [ ] **Step 1: Reemplazar el `<style>`**

```css
@font-face{font-family:'Instrument Serif';src:url('/prensas/fonts/instrument-serif-latin-400-normal.woff2') format('woff2');font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:'Instrument Serif';src:url('/prensas/fonts/instrument-serif-latin-400-italic.woff2') format('woff2');font-weight:400;font-style:italic;font-display:swap}
@font-face{font-family:'IBM Plex Sans';src:url('/prensas/fonts/ibm-plex-sans-latin-400-normal.woff2') format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:'IBM Plex Sans';src:url('/prensas/fonts/ibm-plex-sans-latin-500-normal.woff2') format('woff2');font-weight:500;font-display:swap}
/* Mismas letras y colores que el login: es parte de entrar. */
:root{--bg:#F3F4F1;--hoja:#FBFBF9;--ink:#15191D;--piz:#3E5566;--muted:#5C6669;--mal:#7A1631;--linea:#C9CFCF;
  --serif:'Instrument Serif',Georgia,serif;--sans:'IBM Plex Sans',system-ui,'Segoe UI',sans-serif;
  --mono:'IBM Plex Mono',ui-monospace,Consolas,'Cascadia Mono',monospace}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:var(--sans);display:grid;place-items:center;padding:24px 16px;-webkit-font-smoothing:antialiased}
.hoja{width:min(400px,100%);background:var(--hoja);border:1.5px solid var(--ink);box-shadow:8px 8px 0 rgba(21,25,29,.08)}
.hoja header{display:flex;justify-content:space-between;align-items:baseline;gap:12px;border-bottom:1.5px solid var(--ink);padding:10px 16px;font:500 10.5px var(--mono);letter-spacing:.12em;text-transform:uppercase}
.hoja header span:last-child{color:var(--muted);text-transform:none;letter-spacing:.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.cuerpo{padding:22px 22px 18px;display:flex;flex-direction:column;gap:16px}
h1{margin:0;font-family:var(--serif);font-weight:400;font-size:40px;line-height:.95;letter-spacing:-.01em}
h1 em{color:var(--mal)}
.aviso{margin:0;padding:10px 12px;border-left:3px solid var(--piz);background:#E9EEF0;color:var(--piz);font-size:13px;line-height:1.45}
label{display:flex;justify-content:space-between;font:500 10.5px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--piz);margin-bottom:6px}
input{width:100%;border:1px solid var(--linea);background:#fff;padding:11px 12px;font:14px var(--mono);color:var(--ink);border-radius:0}
input:focus{outline:none;border-color:var(--ink);box-shadow:inset 3px 0 0 var(--mal)}
.nota{margin:-6px 0 0;font-size:12px;color:var(--muted)}
button{display:flex;justify-content:space-between;align-items:center;width:100%;border:0;background:var(--ink);color:#fff;padding:13px 16px;font:500 13px var(--mono);letter-spacing:.14em;text-transform:uppercase;cursor:pointer}
button:hover{background:var(--mal)}
button:focus-visible{outline:2px solid var(--mal);outline-offset:3px}
button:disabled{opacity:.7;cursor:wait}
.error{margin:0;padding:10px 12px;border-left:3px solid var(--mal);background:#F8EDEF;color:#6B1229;font-size:13px;line-height:1.45}
.error[hidden]{display:none}
.pie{display:flex;justify-content:space-between;border-top:1px dashed #B9C0C0;padding-top:12px;font:400 11px var(--mono)}
.pie a{color:var(--muted);text-decoration:none;padding:6px 0}
.pie a:hover{color:var(--ink)}
@media (max-width:760px){h1{font-size:34px}input{font-size:16px}button{min-height:48px}}
```

- [ ] **Step 2: Reemplazar el `<main>`**

```html
<main class="hoja">
  <header><span>Plataforma CIW</span><span id="quien">Catena Institute</span></header>
  <div class="cuerpo">
    <h1>Cambiar <em>contraseña</em></h1>
    <p class="aviso" id="aviso" hidden>Estás entrando con la contraseña inicial. Elegí una propia para continuar.</p>
    <form id="form" autocomplete="on">
      <input type="text" name="username" id="username" autocomplete="username" hidden>
      <div><label for="actual"><span>Contraseña actual</span><span>▸</span></label><input id="actual" type="password" autocomplete="current-password" required autofocus></div>
      <div><label for="nueva"><span>Contraseña nueva</span><span>▸</span></label><input id="nueva" type="password" autocomplete="new-password" minlength="6" required></div>
      <div><label for="repetir"><span>Repetí la nueva</span><span>▸</span></label><input id="repetir" type="password" autocomplete="new-password" minlength="6" required></div>
      <p class="nota">Al menos 6 caracteres, y distinta de 1234.</p>
      <p id="error" class="error" role="alert" hidden></p>
      <button id="submit" type="submit"><span id="submit-texto">Guardar contraseña</span><span>→</span></button>
    </form>
    <div class="pie"><a id="volver" href="/" hidden>← Volver al menú</a><a href="/api/auth/logout">Salir</a></div>
  </div>
</main>
```

Y agregar al `<style>` del Step 1: `#form{display:contents}` (así los hijos del formulario participan del `gap` de `.cuerpo`).

- [ ] **Step 3: Ajustar el `<script>` (mínimo)**

1. `document.getElementById('quien').textContent='Usuario: '+yo.email;` → `document.getElementById('quien').textContent=yo.email;`
2. `const mostrar=t=>{err.textContent=t;err.style.display='block';};` → `const mostrar=t=>{err.textContent=t;err.hidden=false;};`
3. `err.style.display='none';` → `err.hidden=true;`
4. Línea ~61: `btn.textContent='Guardando…';` → `document.getElementById('submit-texto').textContent='Guardando…';` y línea ~69: `btn.textContent='Guardar contraseña';` → `document.getElementById('submit-texto').textContent='Guardar contraseña';` (si no, se borra la flecha `→` del botón).

- [ ] **Step 4: Tests**

Run: `npx vitest run test/pantallas-sueltas.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add public/cambiar-clave.html
git commit -m "feat(cambiar-clave): letras y colores del login, error anunciado con role=alert

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Prensas, solo base de celular

**Files:**
- Modify: `public/prensas/index.html` (dentro de `@media(max-width:900px)` línea ~85 y un `@media (pointer:coarse)` nuevo al final del `<style>`, antes de `@media print`)
- Modify: `public/prensas/app.js:519`

- [ ] **Step 1: Teclado numérico en las celdas numéricas**

En `public/prensas/app.js:519`, dentro del template del `<input class="cell ...">`, después de `type="${c.date?'date':'text'}"` agregar `${c.num?' inputmode="decimal"':''}`:

```js
      else { const v=o[c.k]==null?'':o[c.k]; const bad=c.bad&&c.bad(o)?'bad2':''; tb+=`<td><input class="cell ${c.num?'num':''} ${bad}" type="${c.date?'date':'text'}"${c.num?' inputmode="decimal"':''} data-row="${ri}" data-k="${c.k}" value="${escA(v)}"></td>`; }
```

- [ ] **Step 2: Punto de guardado visible en pantallas angostas**

En el bloque `@media(max-width:900px){ ... }` (línea ~85), reemplazar `.barra .right .status{display:none}` por:

```css
    .barra .right .status:not(#status){display:none}
    #status{font-size:0}
    #status::before{margin-right:0}
```

(El `#status` queda como solo el punto de color: rojo/ámbar = sin guardar, verde = guardado. El texto sigue en el DOM para lectores de pantalla.)

- [ ] **Step 3: Blancos táctiles solo en pantallas táctiles**

Antes de `@media print{` agregar:

```css
  /* Pantallas táctiles: blancos de dedo. No cambia nada con mouse. */
  @media (pointer:coarse){
    .rowbtn{min-width:40px;min-height:40px;font-size:15px}
    th .th-flt{min-width:32px;min-height:32px}
    .degbtn{min-height:40px;padding:6px 14px}
    button.btn{min-height:40px}
    td input.cell{min-height:36px;font-size:16px}
  }
```

- [ ] **Step 4: Confirmar que no se tocó nada fuera de esos bloques**

Run: `git diff --stat public/prensas/ && git diff public/prensas/index.html`
Expected: solo las líneas de los pasos 2 y 3; ningún cambio en `:root`, en reglas de escritorio ni en `@media print`.

Run: `npx vitest run`
Expected: todo verde (incluido `estilo-tokens`, que vuelve a leer el `:root` de Prensas).

- [ ] **Step 5: Commit**

```bash
git add public/prensas/index.html public/prensas/app.js
git commit -m "feat(prensas): base de celular (teclado numérico, punto de guardado, blancos táctiles) sin cambiar su estética

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verificación en el navegador y entrega

**Files:**
- Create (scratchpad, fuera del repo): `mock-estetica.mjs`

- [ ] **Step 1: Server de prueba sin login**

Escribir en el scratchpad de la sesión un server de Node (`node:http`, sin dependencias) que:
- sirva los archivos de `C:\Users\Bmax\repos\catenainstitute-estetica\public` por su ruta;
- para `/prensas/`, `/lotes/` y `/barriles/` sirva su `index.html` reemplazando `</head>` por lo mismo que arma `armarInyeccion` (copiar el texto de la función con `window.CIW={"email":"prueba@catenawines.com","nombre":"Prueba","rol":"admin","modulo":"<m>","modulos":{"prensas":"admin","lotes":"admin","barriles":"admin"}}`);
- responda `GET /api/auth/me` → `{"email":"prueba@catenawines.com","debe_cambiar":false}`, `GET /api/yo` → el mismo contexto, `GET /api/admin/usuarios` (`admin.html` llama a `fetch('/api/admin' + ruta)`) → 3 usuarios de ejemplo con los campos que lee `fila(u)` en `admin.html` (leer esa función para armar la forma exacta), y `GET /<modulo>/api/datos` → el contenido del respaldo más nuevo del módulo (`respaldo-nube-<modulo>-*.json` de `repos\catenainstitute`, tomando `JSON.parse(d[0].results[0].json)`);
- todo `POST`/`PUT`/`DELETE` → `{"ok":true,"version":1}` sin guardar nada.

Levantarlo con la tool de Bash en segundo plano en el puerto `8820` y abrir `http://localhost:8820/admin.html` en el navegador del panel.

- [ ] **Step 2: Recorrido a 1280 px**

En cada una de `/admin.html`, `/cambiar-clave.html`, `/prensas/`, `/lotes/`, `/barriles/`:
- la barra común se ve con Plex y tinta `#1C1B19`, `aria-current` en el módulo actual;
- en Lotes y Barriles, los encabezados fijos de la app quedan **debajo** de la barra al hacer scroll (leer `getComputedStyle(document.documentElement).getPropertyValue('--ciw-h')` ≠ vacío);
- en la consola: `await CI.confirmar({titulo:'Prueba',texto:'x',si:'Borrar OT',peligro:true})` abre el diálogo, Escape lo cierra y devuelve `false`, el foco vuelve a donde estaba; `CI.avisar('Guardado',{deshacer(){console.log('deshecho')}})` muestra el aviso abajo y Deshacer loguea; `await CI.pedir({titulo:'Variedad',campo:{opciones:['Malbec','Cabernet Franc']}})` muestra el select y valida vacío.
- admin: eliminar usuario y resetear contraseña abren el diálogo propio (con `peligro`), y Cancelar no llama a la API.
- Prensas a 1280 px: **comparar con una foto de producción o de `main` antes de la rama** (abrir el `index.html` de `repos\catenainstitute` servido por el mismo mock en otro puerto): tiene que verse idéntica.

- [ ] **Step 3: Recorrido a 375 px (preset mobile)**

- La barra no se desborda: `document.getElementById('ciw-barra').scrollWidth <= innerWidth`. El botón "Cuenta" abre el menú con el nombre, Contraseña y Salir; Escape lo cierra.
- Ninguna de las 5 páginas tiene scroll horizontal de página: `document.documentElement.scrollWidth <= innerWidth`.
- admin: el diálogo ocupa el ancho, los botones del pie miden ≥ 44 px (`getBoundingClientRect().height`).
- cambiar clave: la hoja entra entera, campos a 16 px.
- Prensas (emulación táctil del preset mobile): `.rowbtn` ≥ 40 px; una celda numérica tiene `inputmode="decimal"`; el punto de guardado se ve en la barra.

- [ ] **Step 4: Borrador recuperado con el diálogo**

En `/lotes/`: editar una celda (sin guardar: el mock no persiste), recargar. Tiene que aparecer el diálogo **"Cambios sin guardar"** con "Recuperar cambios" / "Descartarlos" en lugar del `confirm()`.

- [ ] **Step 5: Impresión**

En Prensas, abrir una Orden de muestras y emular impresión (`emulateMedia print` no está disponible: usar la vista de impresión del navegador o verificar que `git diff main -- public/prensas/index.html` no toca `@media print`). Confirmar que la barra, el aviso y el diálogo no salen en la impresión (`@media print{...display:none}` presentes en `barra.js` y `dialogo.js`).

- [ ] **Step 6: Suite y tipos**

Run: `npx vitest run && npx tsc --noEmit`
Expected: verde; total de tests = línea de base de la Task 0 + los nuevos (4 + 11 + 5 + 5 + 7 = 32 más).

- [ ] **Step 7: Fotos para el usuario y pedido de OK**

Sacar fotos (1280 y 375) de admin, cambiar clave, la barra en Lotes y Barriles, el diálogo y el aviso. Mandárselas al usuario con un resumen y **preguntar si se mergea y se pushea**, avisando que **el push a `main` publica la web** (Workers Builds) y listando qué otros commits de `main` todavía no estaban en producción (`gh api repos/lucs56/catenainstitute/commits/main/check-runs` y comparar con el último commit que tuvo "Workers Builds … success").

- [ ] **Step 8: Merge (solo con el OK)**

```bash
cd /c/Users/Bmax/repos/catenainstitute
git status -sb            # main limpio, sin trabajo de otra sesión
git merge --no-ff feat/estetica-base -m "Merge feat/estetica-base: base visual común (estilo.css, diálogo propio, barra para celular, admin y cambiar clave)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npx vitest run
git push origin main
```

Después del push: `gh api repos/lucs56/catenainstitute/commits/<sha>/check-runs --jq '.check_runs[]|.name+" "+.conclusion'` hasta ver `Workers Builds: catenainstitute success` y `verificar success`. Recién ahí avisar al usuario que está en producción (Ctrl+F5).

- [ ] **Step 9: Limpieza**

Parar el mock. `git worktree remove ../catenainstitute-estetica` y `git branch -d feat/estetica-base` (solo después del merge).
