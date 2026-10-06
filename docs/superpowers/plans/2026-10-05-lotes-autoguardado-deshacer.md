# Lotes web: autoguardado, deshacer con Ctrl+Z y cambios ajenos en vivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la web de Lotes guarde sola (sin botón), tenga un Ctrl+Z / Ctrl+Y para toda la página que nunca pisa lo de otra persona, y muestre en vivo lo que guardan los demás.

**Architecture:** Tres módulos puros nuevos en `public/lotes/js/` (`deshacer.js`, `autoguardado.js`, `en-vivo.js`), con tests de vitest, y `nucleo.js` como único lugar que los conecta con el DOM, la red y `DATOS()`. Todo cambio de datos ya pasa por `markDirty()`: de ahí cuelgan el autoguardado (2 s) y el paso de deshacer (diferencia por fila contra una "foto"). En el servidor: `GET /lotes/api/version` liviano y respaldos a R2 como máximo cada 5 minutos.

**Tech Stack:** JS de navegador en módulos ES (sin build), Cloudflare Workers + D1 + R2 en TypeScript, vitest con `@cloudflare/vitest-pool-workers` (los tests corren dentro del runtime de Workers: **no hay `document`**, solo se testean módulos puros).

**Spec:** `docs/superpowers/specs/2026-10-05-lotes-autoguardado-deshacer-design.md`

## Global Constraints

- Trabajar en el worktree `C:\Users\Bmax\repos\catenainstitute-autoguardado`, rama `feat/lotes-autoguardado-deshacer`. **No** tocar `C:\Users\Bmax\repos\catenainstitute` (otras sesiones cambian de rama ahí).
- Solo Lotes. Prensas y Barriles no se tocan (salvo el texto opcional de `public/shared/fusion.js` de la Tarea 6, que no cambia el comportamiento de Prensas).
- Autoguardado: **2000 ms** después del último cambio. Reintentos: **5000, 15000, 30000 ms y después 60000 ms** fijos.
- Paso de deshacer: se cierra a los **300 ms** sin otro `markDirty`, al empezar un guardado o al apretar Ctrl+Z/Ctrl+Y. Pila de **100** pasos.
- Respaldo a R2 como máximo cada **5 minutos** (`300000` ms), siempre si el guardado es forzado. Marca en `lotes/_ultimo-respaldo`.
- En vivo: consulta cada **15000 ms**, solo con `document.visibilityState === 'visible'`.
- Comentarios y textos de pantalla en castellano rioplatense, como el resto del código ("apretá", "tocá"). Estilo de los archivos: `'use strict';`, comentarios `/* */` explicando el porqué, sin punto y coma faltantes, indentación de 2.
- Varios archivos de `public/lotes/js/` tienen finales de línea **CRLF**: si un Edit no matchea, revisar con `file <archivo>` y respetar los `\r\n`.
- Correr los tests con `npx vitest run <archivo>` desde el worktree (el `npm test` completo tarda; correrlo entero al final de cada tarea).
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de archivos

| Archivo | Qué hace | Tarea |
|---|---|---|
| `public/lotes/js/deshacer.js` (nuevo) | Foto por fila, diferencia, aplicar al revés, pila, descripciones. Puro. | 1, 2 |
| `test/lotes-deshacer.test.mjs` (nuevo) | Tests de lo anterior | 1, 2 |
| `public/lotes/js/autoguardado.js` (nuevo) | Cuándo guardar: espera, reintentos, paradas. Puro, reloj inyectable. | 3 |
| `test/lotes-autoguardado.test.mjs` (nuevo) | Tests con reloj falso | 3 |
| `src/lotes/rutas.ts` | `GET /version`; `snapshotLotes` espaciado | 4 |
| `test/lotes-version-respaldo.test.ts` (nuevo) | Tests de lo anterior | 4 |
| `public/lotes/js/en-vivo.js` (nuevo) | Decisión adoptar/esperar/nada. Puro. | 7 |
| `test/lotes-en-vivo.test.mjs` (nuevo) | Tests | 7 |
| `public/lotes/js/nucleo.js` | Conecta todo: autoguardado, pasos, deshacer, en vivo | 5, 6, 7 |
| `public/lotes/app.js` | Teclas Ctrl+S / Ctrl+Z / Ctrl+Y; saca el botón | 5, 6 |
| `public/lotes/index.html` | Saca `#btnGuardar` | 5 |
| `public/lotes/js/vista-analisis.js` | Usa `hayCambiosSinGuardar()` en vez del botón | 5 |
| `public/lotes/js/grilla.js` | Sin pila propia: Ctrl+Z/Y pasan al general | 6 |
| `public/lotes/js/grilla-undo.js` + su test | Se borran | 6 |
| `docs/guia-lotes.md` | Sección "Guardado y deshacer" | 8 |

---

### Task 1: `deshacer.js` — foto y diferencia

**Files:**
- Create: `public/lotes/js/deshacer.js`
- Test: `test/lotes-deshacer.test.mjs`

**Interfaces:**
- Produces:
  - `CLAVE_DE_SECCION: {lotes:'lote', movimientos:'id', ordenes_trabajo:'id', mermas:'id', vasijas:'num'}`
  - `tomarFoto(datos) -> Foto` — `Foto = {[seccion]: {tipo:'clave', campo, claves:string[], textos:string[]} | {tipo:'contenido', textos:string[]} | {tipo:'objeto', filas:{[k]:string}} | {tipo:'valor', texto:string|undefined}}`. `meta` no entra.
  - `diferencia(foto, datos) -> {cambios: Cambio[], foto: Foto}` (la foto devuelta es la nueva base).
  - `Cambio` es uno de:
    - `{seccion, tipo:'fila', clave:string|null, antes:string|null, despues:string|null, pos:number}` (null = la fila no existe en ese lado)
    - `{seccion, tipo:'campo', clave:string, antes:string|null, despues:string|null}` (secciones objeto: `estado_lote`, `config`)
    - `{seccion, tipo:'orden', antes:string[], despues:string[]}` (claves en orden)
    - `{seccion, tipo:'valor', antes:string|undefined, despues:string|undefined}` (sección entera)

- [ ] **Step 1: Escribir los tests que fallan**

```js
/* Deshacer de toda la página de Lotes: la foto por fila y la diferencia
 * (spec 2026-10-05, sección 2). */
import { describe, it, expect } from 'vitest';
import { tomarFoto, diferencia } from '../public/lotes/js/deshacer.js';

const doc = () => ({
  meta: { version: 7, autor: 'x' },
  lotes: [{ lote: '26001', litros: 100 }, { lote: '26002', litros: 200 }],
  analisis: [{ lote: '26001', ph: 3.5 }, { lote: '26001', ph: 3.6 }],
  movimientos: [{ id: 'm1', lote: '26001' }],
  estado_lote: { '26001': { etapa: 'FML' } },
  config: { criterios_fml: { a: 1 }, destinos_externos: [] },
});

describe('tomarFoto', () => {
  it('no incluye meta', () => {
    expect(tomarFoto(doc()).meta).toBeUndefined();
  });
  it('usa la clave natural de cada sección y contenido donde no hay', () => {
    const f = tomarFoto(doc());
    expect(f.lotes.tipo).toBe('clave');
    expect(f.lotes.claves).toEqual(['26001', '26002']);
    expect(f.movimientos.tipo).toBe('clave');
    expect(f.analisis.tipo).toBe('contenido');
    expect(f.estado_lote.tipo).toBe('objeto');
  });
  it('una sección con clave repetida se compara por contenido', () => {
    const d = doc(); d.lotes.push({ lote: '26001', litros: 5 });
    expect(tomarFoto(d).lotes.tipo).toBe('contenido');
  });
});

describe('diferencia', () => {
  it('sin cambios no devuelve nada', () => {
    const d = doc();
    expect(diferencia(tomarFoto(d), d).cambios).toEqual([]);
  });
  it('un cambio en meta no cuenta', () => {
    const d = doc(); const f = tomarFoto(d);
    d.meta.version = 8;
    expect(diferencia(f, d).cambios).toEqual([]);
  });
  it('edición de un lote: antes y después de esa fila', () => {
    const d = doc(); const f = tomarFoto(d);
    d.lotes[1].litros = 150;
    const { cambios } = diferencia(f, d);
    expect(cambios).toEqual([{ seccion: 'lotes', tipo: 'fila', clave: '26002',
      antes: JSON.stringify({ lote: '26002', litros: 200 }),
      despues: JSON.stringify({ lote: '26002', litros: 150 }), pos: 1 }]);
  });
  it('alta y baja de lotes', () => {
    const d = doc(); const f = tomarFoto(d);
    d.lotes.splice(0, 1);
    d.lotes.push({ lote: '26003', litros: 0 });
    const { cambios } = diferencia(f, d);
    expect(cambios).toContainEqual({ seccion: 'lotes', tipo: 'fila', clave: '26001',
      antes: JSON.stringify({ lote: '26001', litros: 100 }), despues: null, pos: 0 });
    expect(cambios).toContainEqual({ seccion: 'lotes', tipo: 'fila', clave: '26003',
      antes: null, despues: JSON.stringify({ lote: '26003', litros: 0 }), pos: 1 });
    expect(cambios.some(c => c.tipo === 'orden')).toBe(false);
  });
  it('reordenar sin tocar filas anota el orden', () => {
    const d = doc(); const f = tomarFoto(d);
    d.lotes.reverse();
    expect(diferencia(f, d).cambios).toEqual([{ seccion: 'lotes', tipo: 'orden',
      antes: ['26001', '26002'], despues: ['26002', '26001'] }]);
  });
  it('análisis editado en su lugar = una fila con antes y después', () => {
    const d = doc(); const f = tomarFoto(d);
    d.analisis[1].ph = 3.7;
    expect(diferencia(f, d).cambios).toEqual([{ seccion: 'analisis', tipo: 'fila', clave: null,
      antes: JSON.stringify({ lote: '26001', ph: 3.6 }),
      despues: JSON.stringify({ lote: '26001', ph: 3.7 }), pos: 1 }]);
  });
  it('análisis agregados y borrados', () => {
    const d = doc(); const f = tomarFoto(d);
    d.analisis.splice(0, 1);
    d.analisis.push({ lote: '26002', ph: 3.4 }, { lote: '26002', ph: 3.3 });
    const { cambios } = diferencia(f, d);
    expect(cambios.filter(c => c.antes && !c.despues)).toHaveLength(1);
    expect(cambios.filter(c => !c.antes && c.despues)).toHaveLength(2);
  });
  it('dos análisis idénticos: borrar uno es un solo cambio', () => {
    const d = doc(); d.analisis.push({ lote: '26001', ph: 3.6 });
    const f = tomarFoto(d);
    d.analisis.pop();
    const { cambios } = diferencia(f, d);
    expect(cambios).toHaveLength(1);
    expect(cambios[0].despues).toBeNull();
  });
  it('objetos: un campo por clave', () => {
    const d = doc(); const f = tomarFoto(d);
    d.estado_lote['26001'].etapa = 'Crianza';
    d.estado_lote['26002'] = { etapa: 'FML' };
    delete d.config.destinos_externos;
    const { cambios } = diferencia(f, d);
    expect(cambios).toContainEqual({ seccion: 'estado_lote', tipo: 'campo', clave: '26001',
      antes: '{"etapa":"FML"}', despues: '{"etapa":"Crianza"}' });
    expect(cambios).toContainEqual({ seccion: 'estado_lote', tipo: 'campo', clave: '26002',
      antes: null, despues: '{"etapa":"FML"}' });
    expect(cambios).toContainEqual({ seccion: 'config', tipo: 'campo', clave: 'destinos_externos',
      antes: '[]', despues: null });
  });
  it('una sección nueva o que desaparece es un cambio de valor entero', () => {
    const d = doc(); const f = tomarFoto(d);
    d.mermas = [{ id: 'x' }];
    expect(diferencia(f, d).cambios).toEqual([{ seccion: 'mermas', tipo: 'valor',
      antes: undefined, despues: '[{"id":"x"}]' }]);
  });
  it('la foto devuelta es la nueva base', () => {
    const d = doc(); const f = tomarFoto(d);
    d.lotes[0].litros = 1;
    const { foto } = diferencia(f, d);
    expect(diferencia(foto, d).cambios).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/lotes-deshacer.test.mjs`
Expected: FAIL — `Failed to load url ../public/lotes/js/deshacer.js` (el archivo no existe).

- [ ] **Step 3: Implementar**

```js
/* ===== Lotes CIW — deshacer / rehacer de toda la pagina =====
 * Puro, sin DOM. Todo cambio de datos pasa por markDirty() (nucleo.js); despues
 * de cada accion nucleo compara el documento con una FOTO (cada fila pasada a
 * texto JSON) y apila las filas que cambiaron. Asi cualquier boton, actual o
 * futuro, queda cubierto sin que tenga que anotar nada.
 *
 * Se guarda TEXTO y no referencias a objetos: un 409 que combina con lo de otro
 * dispositivo reemplaza todos los objetos, y el deshacer tiene que seguir
 * sirviendo despues (el de la grilla, que guardaba objetos, se borraba entero).
 * Spec: docs/superpowers/specs/2026-10-05-lotes-autoguardado-deshacer-design.md
 */
'use strict';

/* Secciones con clave natural. Las listas que no estan aca (analisis,
 * excepciones_analisis, cualquiera que aparezca) se comparan por contenido,
 * como fusionarPorContenido de shared/fusion.js. */
export const CLAVE_DE_SECCION = {
  lotes: 'lote', movimientos: 'id', ordenes_trabajo: 'id', mermas: 'id', vasijas: 'num',
};

/* meta la maneja el servidor (version, autor, actualizado): deshacerla
 * mandaria una version vieja y el guardado daria 409 para siempre. */
const FUERA = new Set(['meta']);

const aTexto = v => JSON.stringify(v);

export function claveDeFila(fila, campo){
  if (!fila || typeof fila !== 'object') return null;
  const v = fila[campo];
  return (v == null || v === '') ? null : String(v);
}

function fotoSeccion(nombre, valor){
  if (Array.isArray(valor)){
    const textos = valor.map(aTexto);
    const campo = CLAVE_DE_SECCION[nombre];
    if (campo){
      const claves = valor.map(f => claveDeFila(f, campo));
      /* Una fila sin clave o una clave repetida haria confundir dos filas: en
       * ese caso se compara por contenido. Mas grueso, pero nunca equivocado. */
      if (!claves.includes(null) && new Set(claves).size === claves.length){
        return { tipo: 'clave', campo, claves, textos };
      }
    }
    return { tipo: 'contenido', textos };
  }
  if (valor && typeof valor === 'object'){
    const filas = {};
    for (const k of Object.keys(valor)){
      const t = aTexto(valor[k]);
      if (t !== undefined) filas[k] = t;
    }
    return { tipo: 'objeto', filas };
  }
  return { tipo: 'valor', texto: aTexto(valor) };
}

/* El texto de la seccion entera, igual al JSON.stringify del valor. */
function textoSeccion(f){
  if (!f) return undefined;
  if (f.tipo === 'clave' || f.tipo === 'contenido') return '[' + f.textos.join(',') + ']';
  if (f.tipo === 'objeto'){
    return '{' + Object.keys(f.filas).map(k => JSON.stringify(k) + ':' + f.filas[k]).join(',') + '}';
  }
  return f.texto;
}

export function tomarFoto(datos){
  const foto = {};
  for (const nombre of Object.keys(datos || {})){
    if (FUERA.has(nombre)) continue;
    foto[nombre] = fotoSeccion(nombre, datos[nombre]);
  }
  return foto;
}

function mismosTextos(a, b){
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function difClave(s, a, b, cambios){
  if (mismosTextos(a.textos, b.textos) && mismosTextos(a.claves, b.claves)) return;
  const idxA = new Map(a.claves.map((k, i) => [k, i]));
  const idxB = new Map(b.claves.map((k, i) => [k, i]));
  for (let i = 0; i < a.claves.length; i++){
    const k = a.claves[i], j = idxB.get(k);
    if (j === undefined){
      cambios.push({ seccion: s, tipo: 'fila', clave: k, antes: a.textos[i], despues: null, pos: i });
    } else if (a.textos[i] !== b.textos[j]){
      cambios.push({ seccion: s, tipo: 'fila', clave: k, antes: a.textos[i], despues: b.textos[j], pos: j });
    }
  }
  for (let j = 0; j < b.claves.length; j++){
    const k = b.claves[j];
    if (!idxA.has(k)) cambios.push({ seccion: s, tipo: 'fila', clave: k, antes: null, despues: b.textos[j], pos: j });
  }
  /* El orden se anota solo si las filas que estan en los dos lados cambiaron
   * de lugar entre si (el boton "Ordenar" de Lotes). Un alta o una baja corre
   * a las demas, pero eso no es reordenar. */
  const comunesA = a.claves.filter(k => idxB.has(k));
  const comunesB = b.claves.filter(k => idxA.has(k));
  if (!mismosTextos(comunesA, comunesB)){
    cambios.push({ seccion: s, tipo: 'orden', antes: a.claves.slice(), despues: b.claves.slice() });
  }
}

function contar(textos){
  const m = new Map();
  for (const t of textos) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

function difContenido(s, a, b, cambios){
  if (mismosTextos(a.textos, b.textos)) return;
  // Multiconjunto: dos analisis identicos son dos filas, no una.
  const enB = contar(b.textos), enA = contar(a.textos);
  const quitadas = [], puestas = [];
  a.textos.forEach((t, i) => { const n = enB.get(t) || 0; if (n) enB.set(t, n - 1); else quitadas.push({ t, pos: i }); });
  b.textos.forEach((t, j) => { const n = enA.get(t) || 0; if (n) enA.set(t, n - 1); else puestas.push({ t, pos: j }); });
  /* Una quitada y una puesta en la misma posicion son la misma fila editada:
   * asi deshacer la reescribe en su lugar en vez de borrar y agregar. */
  const puestaEn = new Map(puestas.map(p => [p.pos, p]));
  for (const q of quitadas){
    const p = puestaEn.get(q.pos);
    if (p){
      puestaEn.delete(q.pos);
      cambios.push({ seccion: s, tipo: 'fila', clave: null, antes: q.t, despues: p.t, pos: q.pos });
    } else {
      cambios.push({ seccion: s, tipo: 'fila', clave: null, antes: q.t, despues: null, pos: q.pos });
    }
  }
  for (const p of puestaEn.values()){
    cambios.push({ seccion: s, tipo: 'fila', clave: null, antes: null, despues: p.t, pos: p.pos });
  }
}

function difObjeto(s, a, b, cambios){
  for (const k of new Set([...Object.keys(a.filas), ...Object.keys(b.filas)])){
    const ta = a.filas[k] ?? null, tb = b.filas[k] ?? null;
    if (ta !== tb) cambios.push({ seccion: s, tipo: 'campo', clave: k, antes: ta, despues: tb });
  }
}

/** Lo que cambio desde la foto. Devuelve tambien la foto nueva, que reusa los
 *  textos ya calculados: asi cerrar un paso pasa el documento a texto una sola vez. */
export function diferencia(foto, datos){
  const nueva = tomarFoto(datos);
  const cambios = [];
  for (const s of new Set([...Object.keys(foto || {}), ...Object.keys(nueva)])){
    const a = foto ? foto[s] : undefined, b = nueva[s];
    if (a && b && a.tipo === b.tipo && (a.tipo !== 'clave' || a.campo === b.campo)){
      if (a.tipo === 'clave') difClave(s, a, b, cambios);
      else if (a.tipo === 'contenido') difContenido(s, a, b, cambios);
      else if (a.tipo === 'objeto') difObjeto(s, a, b, cambios);
      else if (a.texto !== b.texto) cambios.push({ seccion: s, tipo: 'valor', antes: a.texto, despues: b.texto });
    } else {
      // La seccion aparecio, desaparecio o cambio de forma: se anota entera.
      const ta = textoSeccion(a), tb = textoSeccion(b);
      if (ta !== tb) cambios.push({ seccion: s, tipo: 'valor', antes: ta, despues: tb });
    }
  }
  return { cambios, foto: nueva };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run test/lotes-deshacer.test.mjs`
Expected: PASS (13 tests).

- [ ] **Step 5: Medir el costo con el documento real**

Run (desde el worktree; usa el respaldo v75 del repo principal, que está gitignorado y vive solo en esa carpeta):

```bash
node -e "
const fs=require('fs');
import('./public/lotes/js/deshacer.js').then(({tomarFoto,diferencia})=>{
  let d=JSON.parse(fs.readFileSync('../catenainstitute/respaldo-nube-lotes-2026-10-02-v75-con-2025.json','utf8'));
  d=JSON.parse(d[0].results[0].json);
  let t=performance.now(); const f=tomarFoto(d); console.log('foto ms', (performance.now()-t).toFixed(1));
  d.lotes[3].litros=(d.lotes[3].litros||0)+1;
  t=performance.now(); const r=diferencia(f,d); console.log('diferencia ms', (performance.now()-t).toFixed(1), 'cambios', r.cambios.length);
});"
```

Expected: `foto ms` y `diferencia ms` del orden de 20–40, `cambios 1`. Anotar los números en el mensaje del commit. Si `diferencia` pasa de 100 ms, parar y avisar (el spec prevé optimizar comparando solo secciones tocadas).

- [ ] **Step 6: Commit**

```bash
git add public/lotes/js/deshacer.js test/lotes-deshacer.test.mjs
git commit -m "feat(lotes): foto por fila y diferencia para el deshacer general

Medido con el documento real (v75, 3,9 MB): foto <N> ms, diferencia <N> ms.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `deshacer.js` — aplicar, pila y descripciones

**Files:**
- Modify: `public/lotes/js/deshacer.js` (agregar al final)
- Test: `test/lotes-deshacer.test.mjs` (agregar al final)

**Interfaces:**
- Consumes: `tomarFoto`, `diferencia`, `claveDeFila`, `CLAVE_DE_SECCION`, tipo `Cambio` (Tarea 1).
- Produces:
  - `aplicar(datos, cambios, sentido: 'deshacer'|'rehacer') -> {aplicados:number, salteados:Cambio[]}` — muta `datos`. Una fila se revierte solo si hoy está igual al lado de origen.
  - `crearHistorial(tope = 100) -> {apilar(paso) -> boolean, deshacer() -> paso|null, rehacer() -> paso|null, limpiar(), tamano() -> {atras, adelante}}`. `paso = {cambios: Cambio[], etiqueta: string, vista: string|null}`.
  - `describirCambio(c) -> string` (p. ej. `"lote 26123"`, `"análisis del lote 26001"`, `"estado del lote 26001"`).
  - `describirPaso(cambios) -> string` (p. ej. `"lote 26123"`, `"3 análisis"`, `"12 cambios"`).

- [ ] **Step 1: Escribir los tests que fallan** (agregar al archivo de la Tarea 1; sumar `aplicar, crearHistorial, describirPaso, describirCambio` al import)

```js
/* Helper: hace algo sobre d, devuelve los cambios como los apilaria nucleo. */
function paso(d, fn){
  const f = tomarFoto(d);
  fn(d);
  return diferencia(f, d).cambios;
}

describe('aplicar', () => {
  it('deshacer y rehacer una edición, en el mismo objeto', () => {
    const d = doc(); const obj = d.lotes[1];
    const c = paso(d, x => { x.lotes[1].litros = 150; });
    expect(aplicar(d, c, 'deshacer')).toEqual({ aplicados: 1, salteados: [] });
    expect(d.lotes[1]).toBe(obj);
    expect(obj.litros).toBe(200);
    aplicar(d, c, 'rehacer');
    expect(obj.litros).toBe(150);
  });
  it('deshacer una baja la devuelve a su lugar', () => {
    const d = doc();
    const c = paso(d, x => { x.lotes.splice(0, 1); });
    aplicar(d, c, 'deshacer');
    expect(d.lotes.map(l => l.lote)).toEqual(['26001', '26002']);
  });
  it('deshacer un alta la saca', () => {
    const d = doc();
    const c = paso(d, x => { x.lotes.push({ lote: '26009' }); });
    aplicar(d, c, 'deshacer');
    expect(d.lotes.map(l => l.lote)).toEqual(['26001', '26002']);
  });
  it('deshacer un reordenamiento', () => {
    const d = doc();
    const c = paso(d, x => { x.lotes.reverse(); });
    aplicar(d, c, 'deshacer');
    expect(d.lotes.map(l => l.lote)).toEqual(['26001', '26002']);
  });
  it('análisis: agregar tres y deshacer', () => {
    const d = doc();
    const c = paso(d, x => { x.analisis.push({ lote: 'a' }, { lote: 'b' }, { lote: 'c' }); });
    aplicar(d, c, 'deshacer');
    expect(d.analisis).toEqual(doc().analisis);
  });
  it('análisis editado en su lugar vuelve en el mismo objeto', () => {
    const d = doc(); const obj = d.analisis[1];
    const c = paso(d, x => { x.analisis[1].ph = 9; });
    aplicar(d, c, 'deshacer');
    expect(d.analisis[1]).toBe(obj);
    expect(obj.ph).toBe(3.6);
  });
  it('objetos: estado_lote y config', () => {
    const d = doc();
    const c = paso(d, x => { x.estado_lote['26001'].etapa = 'Crianza'; delete x.config.destinos_externos; });
    aplicar(d, c, 'deshacer');
    expect(d.estado_lote).toEqual(doc().estado_lote);
    expect(d.config).toEqual(doc().config);
  });
  it('una fila que otro cambió después no se toca y se informa', () => {
    const d = doc();
    const c = paso(d, x => { x.lotes[0].litros = 1; x.lotes[1].litros = 2; });
    d.lotes[0].litros = 999;   // llega lo de otra persona (409 o en vivo)
    const r = aplicar(d, c, 'deshacer');
    expect(r.aplicados).toBe(1);
    expect(r.salteados.map(s => s.clave)).toEqual(['26001']);
    expect(d.lotes[0].litros).toBe(999);
    expect(d.lotes[1].litros).toBe(200);
  });
  it('deshacer una baja no duplica si otro ya volvió a crear esa clave', () => {
    const d = doc();
    const c = paso(d, x => { x.lotes.splice(0, 1); });
    d.lotes.push({ lote: '26001', litros: 7 });
    const r = aplicar(d, c, 'deshacer');
    expect(r.salteados).toHaveLength(1);
    expect(d.lotes.filter(l => l.lote === '26001')).toHaveLength(1);
  });
  it('sección entera que apareció: deshacer la quita', () => {
    const d = doc();
    const c = paso(d, x => { x.mermas = [{ id: 'x' }]; });
    aplicar(d, c, 'deshacer');
    expect('mermas' in d).toBe(false);
  });
});

describe('crearHistorial', () => {
  const p = n => ({ cambios: [{ n }], etiqueta: 'p' + n, vista: 'lotes' });
  it('un paso vacío no se apila', () => {
    const h = crearHistorial();
    expect(h.apilar({ cambios: [], etiqueta: '', vista: null })).toBe(false);
    expect(h.deshacer()).toBeNull();
  });
  it('deshacer y rehacer en orden', () => {
    const h = crearHistorial();
    h.apilar(p(1)); h.apilar(p(2));
    expect(h.deshacer().etiqueta).toBe('p2');
    expect(h.rehacer().etiqueta).toBe('p2');
    expect(h.rehacer()).toBeNull();
  });
  it('algo nuevo después de deshacer descarta el rehacer', () => {
    const h = crearHistorial();
    h.apilar(p(1)); h.deshacer(); h.apilar(p(2));
    expect(h.rehacer()).toBeNull();
  });
  it('tope', () => {
    const h = crearHistorial(3);
    [1, 2, 3, 4].forEach(n => h.apilar(p(n)));
    expect(h.tamano()).toEqual({ atras: 3, adelante: 0 });
    h.deshacer(); h.deshacer(); h.deshacer();
    expect(h.deshacer()).toBeNull();
  });
});

describe('descripciones', () => {
  it('una sola fila nombra lo que es', () => {
    const d = doc();
    expect(describirPaso(paso(d, x => { x.lotes[1].litros = 1; }))).toBe('lote 26002');
    expect(describirPaso(paso(d, x => { x.analisis[0].ph = 1; }))).toBe('análisis del lote 26001');
    expect(describirPaso(paso(d, x => { x.estado_lote['26001'].etapa = 'z'; }))).toBe('estado del lote 26001');
  });
  it('varias filas de una sección las cuenta', () => {
    const d = doc();
    expect(describirPaso(paso(d, x => { x.analisis.push({ lote: 'a' }, { lote: 'b' }, { lote: 'c' }); }))).toBe('3 análisis');
  });
  it('mezcla de secciones', () => {
    const d = doc();
    expect(describirPaso(paso(d, x => { x.lotes[0].litros = 1; x.movimientos.push({ id: 'm2' }); }))).toBe('2 cambios');
  });
  it('describirCambio de un análisis sin lote', () => {
    expect(describirCambio({ seccion: 'analisis', tipo: 'fila', clave: null, antes: '{}', despues: null, pos: 0 })).toBe('análisis');
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/lotes-deshacer.test.mjs`
Expected: FAIL — `aplicar is not a function` (y los demás nuevos).

- [ ] **Step 3: Implementar** (agregar al final de `deshacer.js`)

```js
/* ---------- aplicar al reves ---------- */

const esObjetoPlano = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/* Reescribe `obj` con el contenido de `nuevo` sin cambiar el objeto: las
 * grillas y la ficha tienen referencias a las filas y tienen que seguir
 * apuntando a algo vivo. Si no son los dos objetos, devuelve `nuevo`. */
function enSitio(obj, nuevo){
  if (!esObjetoPlano(obj) || !esObjetoPlano(nuevo)) return nuevo;
  for (const k of Object.keys(obj)) delete obj[k];
  Object.assign(obj, nuevo);
  return obj;
}

/* Donde esta hoy la fila que tiene que estar como `texto`, o -1. */
function buscarFila(arr, s, c, texto){
  const campo = CLAVE_DE_SECCION[s];
  if (c.clave != null && campo){
    const i = arr.findIndex(f => claveDeFila(f, campo) === c.clave);
    return (i >= 0 && aTexto(arr[i]) === texto) ? i : -1;
  }
  // Por contenido: primero donde estaba, despues en cualquier lado.
  if (c.pos != null && c.pos < arr.length && aTexto(arr[c.pos]) === texto) return c.pos;
  return arr.findIndex(f => aTexto(f) === texto);
}

function existeClave(arr, s, clave){
  const campo = CLAVE_DE_SECCION[s];
  return clave != null && !!campo && arr.some(f => claveDeFila(f, campo) === clave);
}

/** Aplica los cambios de un paso hacia atras ('deshacer') o hacia adelante
 *  ('rehacer') sobre el documento ACTUAL. Cada fila se toca solo si hoy esta
 *  exactamente como quedo despues del paso (o antes, al rehacer): si otra
 *  persona la cambio despues, se saltea y se devuelve en `salteados`. */
export function aplicar(datos, cambios, sentido){
  const atras = sentido === 'deshacer';
  const desde = c => atras ? c.despues : c.antes;   // como tiene que estar hoy
  const hacia = c => atras ? c.antes : c.despues;   // como queda
  const salteados = [];
  let aplicados = 0;

  // 1) secciones enteras
  for (const c of cambios.filter(c => c.tipo === 'valor')){
    if (aTexto(datos[c.seccion]) !== desde(c)){ salteados.push(c); continue; }
    if (hacia(c) === undefined) delete datos[c.seccion];
    else datos[c.seccion] = JSON.parse(hacia(c));
    aplicados++;
  }

  // 2) campos de secciones objeto
  for (const c of cambios.filter(c => c.tipo === 'campo')){
    if (!esObjetoPlano(datos[c.seccion])) datos[c.seccion] = {};
    const o = datos[c.seccion];
    const hoy = o[c.clave] === undefined ? null : aTexto(o[c.clave]);
    if (hoy !== desde(c)){ salteados.push(c); continue; }
    if (hacia(c) === null) delete o[c.clave];
    else o[c.clave] = enSitio(o[c.clave], JSON.parse(hacia(c)));
    aplicados++;
  }

  // 3) filas: ediciones, despues bajas, despues altas (en orden de posicion,
  //    asi cada una vuelve a su lugar aunque sean varias)
  const filas = cambios.filter(c => c.tipo === 'fila');
  const arr = s => (Array.isArray(datos[s]) ? datos[s] : (datos[s] = []));
  for (const c of filas.filter(c => desde(c) !== null && hacia(c) !== null)){
    const a = arr(c.seccion), i = buscarFila(a, c.seccion, c, desde(c));
    if (i < 0){ salteados.push(c); continue; }
    a[i] = enSitio(a[i], JSON.parse(hacia(c)));
    aplicados++;
  }
  for (const c of filas.filter(c => desde(c) !== null && hacia(c) === null)){
    const a = arr(c.seccion), i = buscarFila(a, c.seccion, c, desde(c));
    if (i < 0){ salteados.push(c); continue; }
    a.splice(i, 1);
    aplicados++;
  }
  for (const c of filas.filter(c => desde(c) === null && hacia(c) !== null).sort((x, y) => x.pos - y.pos)){
    const a = arr(c.seccion);
    if (existeClave(a, c.seccion, c.clave)){ salteados.push(c); continue; }
    a.splice(Math.min(c.pos, a.length), 0, JSON.parse(hacia(c)));
    aplicados++;
  }

  // 4) orden (al final, con las filas ya en su lugar). No se saltea nunca: si
  //    otro agrego filas, quedan al final en el orden en que estaban.
  for (const c of cambios.filter(c => c.tipo === 'orden')){
    const a = datos[c.seccion], campo = CLAVE_DE_SECCION[c.seccion];
    if (!Array.isArray(a) || !campo) continue;
    const rango = new Map(hacia(c).map((k, i) => [k, i]));
    const con = [], sin = [];
    for (const f of a) (rango.has(claveDeFila(f, campo)) ? con : sin).push(f);
    con.sort((x, y) => rango.get(claveDeFila(x, campo)) - rango.get(claveDeFila(y, campo)));
    a.splice(0, a.length, ...con, ...sin);
    aplicados++;
  }

  return { aplicados, salteados };
}

/* ---------- pila ---------- */

/** Pila de pasos. paso = {cambios, etiqueta, vista}. Misma linea de tiempo sin
 *  ramas que tenia grilla-undo.js: hacer algo nuevo descarta el rehacer. */
export function crearHistorial(tope = 100){
  let atras = [], adelante = [];
  return {
    apilar(paso){
      if (!paso || !paso.cambios || !paso.cambios.length) return false;
      atras.push(paso);
      adelante = [];
      if (atras.length > tope) atras.shift();
      return true;
    },
    deshacer(){
      const p = atras.pop();
      if (!p) return null;
      adelante.push(p);
      return p;
    },
    rehacer(){
      const p = adelante.pop();
      if (!p) return null;
      atras.push(p);
      return p;
    },
    limpiar(){ atras = []; adelante = []; },
    tamano(){ return { atras: atras.length, adelante: adelante.length }; },
  };
}

/* ---------- textos para el aviso ---------- */

const NOMBRES = {
  lotes: ['lote', 'lotes'], analisis: ['análisis', 'análisis'],
  movimientos: ['movimiento', 'movimientos'], ordenes_trabajo: ['OT', 'OT'],
  vasijas: ['vasija', 'vasijas'], mermas: ['merma', 'mermas'],
  estado_lote: ['estado de lote', 'estados de lote'], config: ['Config', 'ajustes de Config'],
  excepciones_analisis: ['excepción', 'excepciones'],
};
const nombre = (s, plural) => (NOMBRES[s] || [s, s])[plural ? 1 : 0];

function loteDe(c){
  try {
    const o = JSON.parse(c.despues ?? c.antes);
    return o && o.lote != null && o.lote !== '' ? String(o.lote) : '';
  } catch (e) { return ''; }
}

export function describirCambio(c){
  if (c.tipo === 'campo'){
    return c.seccion === 'estado_lote' ? `estado del lote ${c.clave}` : `${nombre(c.seccion)} ${c.clave}`;
  }
  if (c.tipo === 'valor') return nombre(c.seccion, true);
  if (c.tipo === 'orden') return `orden de ${nombre(c.seccion, true)}`;
  if (c.seccion === 'lotes' || c.seccion === 'vasijas') return `${nombre(c.seccion)} ${c.clave}`;
  const lote = loteDe(c);
  return lote ? `${nombre(c.seccion)} del lote ${lote}` : nombre(c.seccion);
}

export function describirPaso(cambios){
  const filas = cambios.filter(c => c.tipo !== 'orden');
  if (!filas.length) return cambios.length ? describirCambio(cambios[0]) : '';
  if (filas.length === 1) return describirCambio(filas[0]);
  const secciones = new Set(filas.map(c => c.seccion));
  if (secciones.size === 1) return `${filas.length} ${nombre(filas[0].seccion, true)}`;
  return `${filas.length} cambios`;
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run test/lotes-deshacer.test.mjs`
Expected: PASS (todos los de la Tarea 1 + 18 nuevos).

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/deshacer.js test/lotes-deshacer.test.mjs
git commit -m "feat(lotes): aplicar al reves, pila y textos del deshacer general

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `autoguardado.js` — cuándo guardar

**Files:**
- Create: `public/lotes/js/autoguardado.js`
- Test: `test/lotes-autoguardado.test.mjs`

**Interfaces:**
- Produces:
  - `ESPERA_MS = 2000`, `REINTENTOS_MS = [5000, 15000, 30000, 60000]`
  - `crearAutoguardado({ejecutar, avisar, reloj}) -> {cambio(), ahora() -> Promise, pendiente() -> boolean, parado() -> string|null}`
  - `ejecutar(): Promise<'ok'|'nada'|'cancelado'|'red'|'sesion'|'error'|'permiso'|'conflicto'>` (lo implementa nucleo en la Tarea 5).
  - `avisar(estado, info)` con `estado` ∈ `'guardando' | 'reintentando' ({ms}) | 'parado' ({motivo}) | 'listo'`.
  - `reloj = {setTimeout, clearTimeout}` (por defecto `globalThis`).
  - Paradas: `'sesion'` y `'error'` se reanudan con `cambio()` o `ahora()`; `'permiso'` y `'conflicto'` no se reanudan nunca (hay que recargar).

- [ ] **Step 1: Escribir los tests que fallan**

```js
/* Autoguardado de Lotes: cuando se llama a guardar (spec 2026-10-05, seccion 1). */
import { describe, it, expect } from 'vitest';
import { crearAutoguardado, ESPERA_MS, REINTENTOS_MS } from '../public/lotes/js/autoguardado.js';

/* Reloj falso: los timers corren solo cuando el test avanza el tiempo. */
function relojFalso(){
  let ahora = 0, id = 0;
  const timers = new Map();
  return {
    setTimeout(fn, ms){ timers.set(++id, { fn, en: ahora + ms }); return id; },
    clearTimeout(i){ timers.delete(i); },
    async avanzar(ms){
      ahora += ms;
      for (;;){
        const prox = [...timers].filter(([, t]) => t.en <= ahora).sort((a, b) => a[1].en - b[1].en)[0];
        if (!prox) break;
        timers.delete(prox[0]);
        prox[1].fn();
        await vaciar();
      }
      await vaciar();
    },
    cuantos(){ return timers.size; },
  };
}
// Deja correr las promesas pendientes (los await de ejecutar).
const vaciar = () => new Promise(r => setTimeout(r, 0));

function armar(respuestas){
  const reloj = relojFalso();
  const avisos = [];
  let llamadas = 0;
  const ag = crearAutoguardado({
    ejecutar: async () => { llamadas++; return respuestas.shift() ?? 'ok'; },
    avisar: (e, info) => avisos.push(info ? [e, info] : [e]),
    reloj,
  });
  return { ag, reloj, avisos, llamadas: () => llamadas };
}

describe('autoguardado', () => {
  it('guarda 2 s después del último cambio', async () => {
    const { ag, reloj, llamadas } = armar([]);
    ag.cambio();
    await reloj.avanzar(ESPERA_MS - 1);
    expect(llamadas()).toBe(0);
    await reloj.avanzar(1);
    expect(llamadas()).toBe(1);
  });
  it('cada cambio vuelve a empezar la espera', async () => {
    const { ag, reloj, llamadas } = armar([]);
    ag.cambio();
    await reloj.avanzar(1500);
    ag.cambio();
    await reloj.avanzar(1500);
    expect(llamadas()).toBe(0);
    await reloj.avanzar(500);
    expect(llamadas()).toBe(1);
  });
  it('ahora() corta la espera', async () => {
    const { ag, llamadas } = armar([]);
    ag.cambio();
    await ag.ahora();
    expect(llamadas()).toBe(1);
  });
  it('nunca dos a la vez: lo que llega en vuelo sale en la vuelta siguiente', async () => {
    const reloj = relojFalso();
    let enCurso = 0, maximo = 0, llamadas = 0, soltar;
    const ag = crearAutoguardado({
      ejecutar: () => { llamadas++; enCurso++; maximo = Math.max(maximo, enCurso);
        return new Promise(r => { soltar = () => { enCurso--; r('ok'); }; }); },
      reloj,
    });
    ag.cambio();
    await reloj.avanzar(ESPERA_MS);       // sale el primero y queda colgado
    ag.cambio();
    await reloj.avanzar(ESPERA_MS);       // vence la espera con uno en vuelo
    expect(llamadas).toBe(1);
    soltar(); await vaciar(); await vaciar();
    expect(llamadas).toBe(2);
    soltar(); await vaciar();
    expect(maximo).toBe(1);
  });
  it('sin red reintenta a los 5, 15, 30 y después cada 60 s', async () => {
    const { ag, reloj, avisos, llamadas } = armar(['red', 'red', 'red', 'red', 'red']);
    ag.cambio();
    await reloj.avanzar(ESPERA_MS);
    for (const ms of [...REINTENTOS_MS, 60000]){
      const antes = llamadas();
      await reloj.avanzar(ms - 1);
      expect(llamadas()).toBe(antes);
      await reloj.avanzar(1);
      expect(llamadas()).toBe(antes + 1);
    }
    expect(avisos.filter(a => a[0] === 'reintentando').map(a => a[1].ms))
      .toEqual([5000, 15000, 30000, 60000, 60000]);
  });
  it('un ok vuelve los reintentos a cero', async () => {
    const { ag, reloj, avisos } = armar(['red', 'ok', 'red']);
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    await reloj.avanzar(5000);              // reintento: ok
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    expect(avisos.filter(a => a[0] === 'reintentando').map(a => a[1].ms)).toEqual([5000, 5000]);
  });
  it('sesión vencida: para, y un cambio nuevo lo reanuda', async () => {
    const { ag, reloj, llamadas } = armar(['sesion', 'ok']);
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    expect(ag.parado()).toBe('sesion');
    await reloj.avanzar(120000);
    expect(llamadas()).toBe(1);
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    expect(llamadas()).toBe(2);
    expect(ag.parado()).toBeNull();
  });
  it('solo lectura: para para siempre', async () => {
    const { ag, reloj, llamadas } = armar(['permiso']);
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    await ag.ahora();
    expect(llamadas()).toBe(1);
    expect(ag.parado()).toBe('permiso');
  });
  it('pendiente() mientras espera o guarda', async () => {
    const { ag, reloj } = armar([]);
    expect(ag.pendiente()).toBe(false);
    ag.cambio();
    expect(ag.pendiente()).toBe(true);
    await reloj.avanzar(ESPERA_MS);
    expect(ag.pendiente()).toBe(false);
  });
  it('si ejecutar revienta se trata como sin red', async () => {
    const reloj = relojFalso(); const avisos = [];
    const ag = crearAutoguardado({ ejecutar: async () => { throw new Error('x'); },
      avisar: (e, i) => avisos.push([e, i]), reloj });
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    expect(avisos.some(a => a[0] === 'reintentando')).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/lotes-autoguardado.test.mjs`
Expected: FAIL — no existe `autoguardado.js`.

- [ ] **Step 3: Implementar**

```js
/* ===== Lotes CIW — cuando se guarda solo =====
 * Puro: no toca el DOM ni la red. Recibe la funcion que guarda (`ejecutar`,
 * la pone nucleo.js) y decide cuando llamarla:
 *  - 2 s despues del ultimo cambio (cada cambio vuelve a empezar la espera);
 *  - nunca dos a la vez: si vence la espera con uno en vuelo, sale otra vuelta
 *    apenas vuelve;
 *  - sin red, reintenta a los 5, 15, 30 y despues cada 60 s, sin carteles;
 *  - sesion vencida o error: para hasta el proximo cambio o Ctrl+S;
 *  - solo lectura o conflicto sin combinar: para hasta recargar.
 * El reloj se inyecta para poder testearlo sin esperar de verdad.
 * Spec: docs/superpowers/specs/2026-10-05-lotes-autoguardado-deshacer-design.md
 */
'use strict';

export const ESPERA_MS = 2000;
export const REINTENTOS_MS = [5000, 15000, 30000, 60000];

const PARA_SIEMPRE = new Set(['permiso', 'conflicto']);
const PARA_HASTA_CAMBIO = new Set(['sesion', 'error']);

export function crearAutoguardado({ ejecutar, avisar = () => {}, reloj = globalThis }){
  let timer = null, enVuelo = false, otraVuelta = false, intentos = 0, parado = null;

  function cancelar(){ if (timer !== null){ reloj.clearTimeout(timer); timer = null; } }
  function programar(ms){ cancelar(); timer = reloj.setTimeout(() => { timer = null; correr(); }, ms); }

  async function correr(){
    if (PARA_SIEMPRE.has(parado)) return;
    if (enVuelo){ otraVuelta = true; return; }
    enVuelo = true;
    avisar('guardando');
    let res;
    try { res = await ejecutar(); } catch (e) { res = 'red'; }
    enVuelo = false;

    if (res === 'red'){
      otraVuelta = false;
      const ms = REINTENTOS_MS[Math.min(intentos, REINTENTOS_MS.length - 1)];
      intentos++;
      avisar('reintentando', { ms });
      programar(ms);
      return;
    }
    intentos = 0;
    if (PARA_SIEMPRE.has(res) || PARA_HASTA_CAMBIO.has(res)){
      parado = res;
      otraVuelta = false;
      cancelar();
      avisar('parado', { motivo: res });
      return;
    }
    if (otraVuelta){ otraVuelta = false; return correr(); }
    avisar('listo');
  }

  return {
    /** Hubo un cambio: guardar dentro de ESPERA_MS. */
    cambio(){
      if (PARA_SIEMPRE.has(parado)) return;
      parado = null;
      programar(ESPERA_MS);
    },
    /** Ctrl+S: guardar ya. */
    ahora(){
      if (PARA_SIEMPRE.has(parado)) return Promise.resolve();
      parado = null;
      cancelar();
      return correr();
    },
    pendiente(){ return timer !== null || enVuelo; },
    parado(){ return parado; },
  };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run test/lotes-autoguardado.test.mjs`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/autoguardado.js test/lotes-autoguardado.test.mjs
git commit -m "feat(lotes): programador del autoguardado (espera, reintentos, paradas)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Servidor — `GET /version` y respaldos cada 5 minutos

**Files:**
- Modify: `src/lotes/rutas.ts` (ruta nueva antes de `// ---------- GET /datos ----------`; `snapshotLotes` en la línea ~360; la llamada en la línea ~171)
- Test: `test/lotes-version-respaldo.test.ts` (nuevo)

**Interfaces:**
- Produces:
  - `GET /lotes/api/version` → `200 {version:number, autor:string, guardado:string}`; sin fila: `{version:0, autor:'', guardado:''}`.
  - `export const RESPALDO_CADA_MS = 300000`
  - `export async function snapshotLotes(env, d, version, forzado = false, ahora = Date.now()): Promise<boolean>` — `true` si subió respaldo.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
/**
 * Lotes con autoguardado: la consulta liviana de version (para ver en vivo lo
 * que guardan los demas) y los respaldos a R2 como maximo cada 5 minutos
 * (spec 2026-10-05, secciones 3 y 4).
 */
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { rutasLotes, snapshotLotes, RESPALDO_CADA_MS } from '../src/lotes/rutas';

const EDITOR = 'editor@catenawines.com';

beforeAll(async () => {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre)
     VALUES (?, 'lotes', 'editor', 'Editor')`,
  ).bind(EDITOR).run();
});

async function pedir(ruta: string) {
  const req = new Request('https://catenainstitute.example/lotes/api' + ruta, {
    headers: { 'Cf-Access-Authenticated-User-Email': EDITOR },
  });
  const ctx = createExecutionContext();
  const res = await rutasLotes(req, env, ctx, ruta);
  await waitOnExecutionContext(ctx);
  return res!;
}

async function respaldos() {
  const l = await env.RESPALDOS.list({ prefix: 'lotes/datos-' });
  return l.objects.map((o) => o.key);
}

describe('GET /version', () => {
  it('devuelve version, autor y fecha del documento', async () => {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO documento (modulo, version, json, autor, guardado)
       VALUES ('lotes', 41, '{"meta":{"version":41}}', 'Oriana', '2026-10-05 10:00')`,
    ).run();
    const r = await pedir('/version');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ version: 41, autor: 'Oriana', guardado: '2026-10-05 10:00' });
  });
  it('sin documento: version 0', async () => {
    await env.DB.prepare(`DELETE FROM documento WHERE modulo = 'lotes'`).run();
    expect(await (await pedir('/version')).json()).toEqual({ version: 0, autor: '', guardado: '' });
  });
});

describe('snapshotLotes cada 5 minutos', () => {
  beforeEach(async () => {
    const l = await env.RESPALDOS.list({ prefix: 'lotes/' });
    for (const o of l.objects) await env.RESPALDOS.delete(o.key);
  });
  const d = { meta: { version: 1 }, lotes: [] };
  const t0 = Date.UTC(2026, 9, 5, 12, 0, 0);

  it('el primero siempre sube', async () => {
    expect(await snapshotLotes(env, d, 1, false, t0)).toBe(true);
    expect(await respaldos()).toHaveLength(1);
  });
  it('antes de 5 minutos no sube otro', async () => {
    await snapshotLotes(env, d, 1, false, t0);
    expect(await snapshotLotes(env, d, 2, false, t0 + RESPALDO_CADA_MS - 1)).toBe(false);
    expect(await respaldos()).toHaveLength(1);
  });
  it('a los 5 minutos sube', async () => {
    await snapshotLotes(env, d, 1, false, t0);
    expect(await snapshotLotes(env, d, 2, false, t0 + RESPALDO_CADA_MS)).toBe(true);
    expect(await respaldos()).toHaveLength(2);
  });
  it('un guardado forzado sube siempre', async () => {
    await snapshotLotes(env, d, 1, false, t0);
    expect(await snapshotLotes(env, d, 2, true, t0 + 1000)).toBe(true);
    expect(await respaldos()).toHaveLength(2);
  });
  it('la marca no se confunde con un respaldo', async () => {
    await snapshotLotes(env, d, 1, false, t0);
    const todo = (await env.RESPALDOS.list({ prefix: 'lotes/' })).objects.map((o) => o.key);
    expect(todo).toContain('lotes/_ultimo-respaldo');
    expect(await respaldos()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/lotes-version-respaldo.test.ts`
Expected: FAIL — `RESPALDO_CADA_MS` no exportado / `/version` devuelve 404 (o `null`).

- [ ] **Step 3: Implementar**

En `src/lotes/rutas.ts`, justo antes de `// ---------- GET /datos ----------`:

```ts
  // ---------- GET /version ----------
  // Lo pregunta cada pantalla abierta cada 15 s para ver en vivo lo que
  // guardan los demas (spec 2026-10-05, seccion 4). Lee solo las columnas, que
  // escribirDocumento() mantiene iguales a meta.version/autor/actualizado del
  // json en la misma sentencia: no se parsean los 3,9 MB del documento.
  if (ruta === '/version' && req.method === 'GET') {
    const fila = await env.DB.prepare(
      'SELECT version, autor, guardado FROM documento WHERE modulo = ?',
    )
      .bind(MODULO)
      .first<{ version: number; autor: string | null; guardado: string | null }>();
    return json(200, {
      version: fila?.version ?? 0,
      autor: fila?.autor ?? '',
      guardado: fila?.guardado ?? '',
    });
  }

```

Reemplazar la llamada del POST:

```ts
    ctx.waitUntil(snapshotLotes(env, nuevo, Number(meta.version), forzar));
```

Reemplazar `snapshotLotes` entero:

```ts
/* Con autoguardado hay un guardado cada pocos segundos mientras alguien edita.
 * Un respaldo completo por guardado (3,9 MB) llenaria los 10 GB de R2 en dias:
 * se sube como maximo uno cada 5 minutos, y siempre uno de los forzados (los
 * que el freno de borrado masivo dejo pasar). El ultimo estado igual esta
 * siempre en D1, y el historial sigue anotando cada guardado. La hora del
 * ultimo respaldo vive en R2 para no necesitar una migracion de D1; dos
 * guardados casi juntos pueden subir dos respaldos, y no importa. */
export const RESPALDO_CADA_MS = 5 * 60 * 1000;
const MARCA_RESPALDO = 'lotes/_ultimo-respaldo';

export async function snapshotLotes(
  env: Env,
  d: Datos,
  version: number,
  forzado = false,
  ahora = Date.now(),
): Promise<boolean> {
  if (!forzado) {
    const marca = await env.RESPALDOS.get(MARCA_RESPALDO);
    const ultimo = marca ? Number(await marca.text()) : 0;
    if (Number.isFinite(ultimo) && ahora - ultimo < RESPALDO_CADA_MS) return false;
  }
  const fecha = new Date(ahora).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const clave = `lotes/datos-v${String(version).padStart(5, '0')}-${fecha}.json`;
  await env.RESPALDOS.put(clave, JSON.stringify(d), {
    httpMetadata: { contentType: 'application/json' },
  });
  await env.RESPALDOS.put(MARCA_RESPALDO, String(ahora));
  return true;
}
```

(Leer la versión actual de `snapshotLotes` antes de reemplazarla: si tiene más opciones en el `put` que las de arriba, conservarlas.)

- [ ] **Step 4: Correr los tests nuevos y los de guardado de Lotes**

Run: `npx vitest run test/lotes-version-respaldo.test.ts test/lotes-guardado.test.ts`
Expected: PASS los dos archivos.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lotes/rutas.ts test/lotes-version-respaldo.test.ts
git commit -m "feat(lotes): GET /version liviano y respaldos a R2 cada 5 minutos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Autoguardado en la página (sin botón Guardar)

**Files:**
- Modify: `public/lotes/js/nucleo.js` (estado guardar ~L34-62, `guardar` ~L233-341)
- Modify: `public/lotes/app.js` (L53 botón; teclas)
- Modify: `public/lotes/index.html:1407` (botón)
- Modify: `public/lotes/js/vista-analisis.js:151-159` (`_hayCambiosSinGuardar`)
- Modify: `public/shared/fusion.js:430` (texto del recuperar)

**Interfaces:**
- Consumes: `crearAutoguardado`, `ESPERA_MS` (Tarea 3).
- Produces (exports de `nucleo.js` que usan las Tareas 6 y 7):
  - `hayCambiosSinGuardar() -> boolean` — `dirty || autoguardado pendiente`.
  - `guardarAhora() -> Promise` — Ctrl+S.
  - `guardar(forzar?) -> Promise<boolean>` — **misma firma de hoy**; ahora pasa por la cola y cancela la espera.
  - `avisoBreve(texto, tipo?)` — cartel al pie por 3 s (`tipo` ∈ `'ok'|'info'|'error'`).
  - Internos que la Tarea 6 va a llamar: `_marcarCambiado()` (marca sin abrir paso), `_guardarEnCola(forzar) -> Promise<string>`.

- [ ] **Step 1: Agregar la cola, el autoguardado y el cartel en `nucleo.js`**

Agregar al import del principio:

```js
import { crearAutoguardado } from './autoguardado.js';
```

Reemplazar el bloque desde `let _ediciones = 0;` hasta el `window.addEventListener('beforeunload', ...)` inclusive por:

```js
let _ediciones = 0;

/* ---------- autoguardado ----------
 * Cada cambio programa un guardado a los 2 s (autoguardado.js decide cuando).
 * Los guardados pasan por una cola: el autoguardado y los `await guardar()` de
 * las vistas que imprimen nunca mandan dos POST a la vez. */
let _cola = Promise.resolve();
function _guardarEnCola(forzar){
  const p = _cola.then(() => _guardar(forzar));
  _cola = p.catch(() => {});
  return p;
}

const _auto = crearAutoguardado({
  ejecutar: () => _guardarEnCola(false),
  avisar(estadoAuto, info){
    if (estadoAuto === 'guardando') _estado('⟳ Guardando…', 'dirty');
    else if (estadoAuto === 'reintentando') _estado('⚠ Sin conexión — reintentando en ' + Math.round(info.ms / 1000) + ' s', 'dirty');
    else if (estadoAuto === 'parado') _estado(
      info.motivo === 'sesion'   ? '⚠ Sesión cerrada: iniciá sesión y apretá Ctrl+S' :
      info.motivo === 'permiso'  ? '⚠ Solo lectura: los cambios no se guardan' :
      info.motivo === 'conflicto'? '⚠ No se pudo combinar: recargá la página' :
                                   '⚠ No se guardó: apretá Ctrl+S para reintentar', 'dirty');
  },
});

function _estado(texto, clase){
  const s = $('statusBar');
  s.textContent = texto;
  s.className = 'status ' + (clase || '');
}

/** Cartel corto al pie (deshacer, actualizaciones). Se pisa con el siguiente. */
let _timerAviso = null;
export function avisoBreve(texto, tipo){
  let el = $('avisoBreve');
  if (!el){
    el = document.createElement('div');
    el.id = 'avisoBreve';
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;' +
      'padding:8px 16px;border-radius:8px;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.35);' +
      'background:#2b3340;color:#fff;max-width:80vw;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = texto;
  el.style.background = tipo === 'error' ? '#7a2b2b' : tipo === 'ok' ? '#24503a' : '#2b3340';
  el.style.display = 'block';
  clearTimeout(_timerAviso);
  _timerAviso = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

export function hayCambiosSinGuardar(){ return dirty || _auto.pendiente(); }
export function guardarAhora(){ return _auto.ahora(); }

/* El nombre se pide con el primer cambio y una sola vez por pagina: con
 * autoguardado, pedirlo en medio de un guardado sacaba un cartel a los 2 s de
 * cualquier edicion. */
let _nombrePedido = false;

/* Marca el documento como cambiado sin abrir un paso de deshacer. Lo usan
 * markDirty (que ademas abre el paso, Tarea 6) y deshacer/rehacer. */
function _marcarCambiado(){
  _ediciones++;
  dirty = true;
  invalidarVistas();
  _estado('● Cambios sin guardar', 'dirty');
  if (FUSION && _datos) FUSION.borrador.programar('lotes', borradorActual);
  _auto.cambio();
}

export function markDirty(){
  if (!_nombrePedido && !usuarioActual()){ _nombrePedido = true; pedirUsuario(true); }
  _marcarCambiado();
}
export function markSaved(){
  dirty = false;
  invalidarVistas();
  _estado('✓ Guardado (v' + DATOS().meta.version + ')', 'saved');
}

window.addEventListener('beforeunload', e => {
  if (hayCambiosSinGuardar()){ e.preventDefault(); e.returnValue = ''; }
});
```

- [ ] **Step 2: Partir `guardar` en `_guardar` (devuelve un motivo) y `guardar` (la pública de siempre)**

Reemplazar la función `guardar` entera (desde `/* ---------- guardar (con 409/412 faithful port) ---------- */` hasta su `}` final, antes de `/* ---------- navegación de pestañas ---------- */`) por:

```js
/* ---------- guardar ----------
 * _guardar devuelve QUE paso, para que el autoguardado sepa si reintentar:
 *   'nada'      no habia cambios
 *   'ok'        guardado
 *   'cancelado' el freno pregunto y se eligio deshacer
 *   'red'       sin conexion, 5xx o error inesperado: se reintenta solo
 *   'sesion'    401: avisa shared/fusion.js; se reintenta con el proximo cambio
 *   'error'     400 que no es el freno: se avisa una vez
 *   'permiso'   403: solo lectura
 *   'conflicto' 409 que no se pudo combinar: hay que recargar
 * Sin alert en los casos que se repiten (red, sesion): con autoguardado serian
 * un cartel cada 2 s. El estado se ve en el statusBar. */
async function _guardar(forzar, intento = 0){
  if (!dirty) return 'nada';
  let cambioHook = false;
  for (const fn of _antesDeGuardar){
    try { if (fn(DATOS())) { invalidarVistas(); cambioHook = true; } } catch (e) { console.error('antesDeGuardar:', e); }
  }
  DATOS().meta.autor = usuarioActual() || 'desconocido';
  if (FUSION) await FUSION.borrador.guardar('lotes', borradorActual);
  // Lo que se envía es esta foto: si se sigue editando durante el viaje, eso
  // queda pendiente para el próximo guardado.
  const enviado = JSON.stringify(DATOS());
  const edicionesAlEnviar = _ediciones;
  let r;
  try {
    r = await fetch(API+'/datos' + (forzar ? '?forzar=1' : ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: enviado
    });
  } catch(e) {
    return 'red';
  }
  if (r.status === 401) return 'sesion';   // shared/fusion.js ya mostró el aviso
  if (r.status === 400){
    const j = await r.json().catch(() => ({}));
    if (j.error === 'validacion'){
      const det = (j.detalles || []).join('\n• ');
      if (forzar){ alert('No se pudo guardar:\n• ' + det); return 'error'; }
      if (confirm(
        '⚠️ El servidor FRENÓ este guardado para proteger los datos:\n\n• ' + det +
        '\n\n¿Era tu intención? Aceptar = guardar igual (queda registrado como FORZADO en el historial).\nCancelar = deshacer lo último que hiciste.'
      )){
        return _guardar(true);
      }
      _alCancelarFreno();
      return 'cancelado';
    }
    alert('Error al guardar: ' + (j.error || r.status));
    return 'error';
  }
  if (r.status === 409){
    const j = await r.json().catch(() => ({}));
    // Otro dispositivo guardó mientras se editaba acá: se combinan los cambios
    // de los dos y se vuelve a guardar. Nadie pierde lo suyo.
    if (FUSION && _base && j.actual && intento < 4){
      const serv = j.actual;
      _antesDeCambioAjeno();
      setDatos(FUSION.fusionarDocumento(_base, DATOS(), serv));
      completarSecciones();
      _base = FUSION.clonar(serv);
      _despuesDeCambioAjeno();
      // Los objetos de DATOS() cambiaron: la pestaña visible se redibuja YA,
      // aunque el reintento falle. Si no, sus filas seguían apuntando a los
      // objetos viejos: las ediciones se perdían y el ✕ de Lotes borraba otro
      // lote (indexOf daba -1).
      document.dispatchEvent(new CustomEvent('lotes:datos-recargados'));
      invalidarVistas();
      try { renderActivo(); } catch (e) { console.error('renderActivo tras fusionar:', e); }
      return _guardar(forzar, intento + 1);
    }
    mostrarOverlay(
      '<h2 style="margin-top:0;color:#ffd766">Conflicto de versión</h2>'+
      '<p style="color:var(--muted)">Otra PC guardó cambios mientras editabas y no se pudieron combinar solos.</p>'+
      '<p style="color:var(--muted);font-size:13px">Tus cambios quedaron guardados en este equipo: al recargar se te ofrece recuperarlos.</p>'+
      '<button class="btn primary" onclick="location.reload()">🔄 Recargar y recuperar</button>'
    );
    return 'conflicto';
  }
  if (r.status === 403){
    const j = await r.json().catch(() => ({}));
    alert('No se pudo guardar: ' + ((j.detalles && j.detalles[0]) || 'tu usuario no tiene permiso para guardar en Lotes.'));
    return 'permiso';
  }
  if (!r.ok) return 'red';
  const j = await r.json();
  DATOS().meta.version = j.version;
  DATOS().meta.actualizado = j.actualizado;
  // La base pasa a ser lo que efectivamente llegó al servidor, no la pantalla
  // actual (que puede tener ediciones posteriores, todavía sin enviar).
  if (FUSION){ _base = JSON.parse(enviado); _base.meta.version = j.version; _base.meta.actualizado = j.actualizado; }
  if (_ediciones !== edicionesAlEnviar){
    // Se editó durante el viaje: queda pendiente (y en el borrador del equipo).
    _marcarCambiado();
    cargarDashboard();
    if (cambioHook || intento > 0) renderActivo();
    return 'ok';
  }
  if (FUSION) FUSION.borrador.borrar('lotes');
  markSaved();
  /* El tablero, el Dashboard y los colores de Lotes salen de /api/dashboard,
   * que el servidor calcula sobre lo GUARDADO. */
  cargarDashboard();
  if (cambioHook || intento > 0) renderActivo();
  if (intento > 0) _estado('✓ Guardado (v' + DATOS().meta.version + ') · combinado con lo que guardaron otros', 'saved');
  return 'ok';
}

/* Ganchos que completa la Tarea 6 (deshacer). Acá quedan vacíos para que
 * esta tarea se pueda probar sola. */
function _antesDeCambioAjeno(){}
function _despuesDeCambioAjeno(){}
function _alCancelarFreno(){}

/** La de siempre, para las vistas que hacen `await guardar()` antes de
 *  imprimir: guarda YA (corta la espera del autoguardado) y devuelve si quedó
 *  guardado. Acá sí se avisa con un cartel: quien la llama está esperando. */
export async function guardar(forzar){
  const r = await _guardarEnCola(!!forzar);
  if (r === 'red'){
    alert('No se pudo guardar: no hay conexión con el servidor. Tus cambios siguen en pantalla y quedaron guardados en este equipo; se van a guardar solos cuando vuelva la señal.');
    _auto.cambio();
  }
  if (r === 'sesion') _auto.cambio();
  return r === 'ok' || r === 'nada';
}
```

En `cargarDatos`, cambiar `if (recuperado) markDirty();` por `if (recuperado) _marcarCambiado();` (recuperar un borrador no es una acción del usuario: no pide nombre ni abre paso).

- [ ] **Step 3: Sacar el botón y sumar Ctrl+S**

`public/lotes/index.html`: borrar la línea

```html
    <button class="btn primary" id="btnGuardar" disabled>💾 Guardar</button>
```

`public/lotes/app.js`:
- En el import de `./js/nucleo.js`, cambiar `guardar,` por `guardarAhora,`.
- Borrar `  $('btnGuardar').addEventListener('click', () => guardar(false));`
- Después del listener de `Escape`, agregar:

```js
  /* Ctrl+S: guardar ya, sin esperar los 2 s del autoguardado. Se intercepta
     para que el navegador no abra "Guardar página como". */
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 's' || e.key === 'S')){
      e.preventDefault();
      guardarAhora();
    }
  });
```

- [ ] **Step 4: `vista-analisis.js` sin leer el botón**

Agregar `hayCambiosSinGuardar` al import de `./nucleo.js` (línea 4) y reemplazar el comentario + función `_hayCambiosSinGuardar` (L151-159) por:

```js
/* Con cambios sin guardar el array local no es el que juzgo el servidor, asi
 * que sus veredictos no se pueden enganchar por posicion. */
function _hayCambiosSinGuardar(){ return hayCambiosSinGuardar(); }
```

- [ ] **Step 5: Texto del recuperar en `shared/fusion.js`**

En el `confirm` de `recuperar` (L430), cambiar `'Aceptar = recuperarlos (se combinan con lo que cargaron los demás; después tocá Guardar).\n' +` por `'Aceptar = recuperarlos (se combinan con lo que cargaron los demás).\n' +`. (Prensas también lo usa: el texto nuevo vale para los dos.)

- [ ] **Step 6: Buscar restos**

Run: `grep -rn "btnGuardar\|tocá Guardar\|tocar Guardar" public/lotes public/shared`
Expected: sin resultados. Si quedan textos de ayuda que dicen "tocá Guardar" en `public/lotes`, cambiarlos por "se guarda solo".

Run: `npx vitest run` (todo)
Expected: PASS (los módulos de esta tarea no tienen test propio: tocan el DOM).

- [ ] **Step 7: Commit**

```bash
git add public/lotes/js/nucleo.js public/lotes/app.js public/lotes/index.html public/lotes/js/vista-analisis.js public/shared/fusion.js
git commit -m "feat(lotes): autoguardado a los 2 s, sin boton Guardar, Ctrl+S guarda ya

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Deshacer general en la página (Ctrl+Z / Ctrl+Y)

**Files:**
- Modify: `public/lotes/js/nucleo.js`
- Modify: `public/lotes/app.js` (teclas)
- Modify: `public/lotes/js/grilla.js` (L16 import, L44 `pila`, L792 listener, L864-905 `escribirCeldas`, L1005-1055 deshacer/rehacer/limpiarPilas, L622-624 teclas)
- Delete: `public/lotes/js/grilla-undo.js` y su test (buscar con `grep -rln "grilla-undo" test`)

**Interfaces:**
- Consumes: `tomarFoto`, `diferencia`, `aplicar`, `crearHistorial`, `describirPaso`, `describirCambio` (Tareas 1-2); `_marcarCambiado`, `avisoBreve`, `_antesDeCambioAjeno`, `_despuesDeCambioAjeno`, `_alCancelarFreno` (Tarea 5).
- Produces: `deshacer()`, `rehacer()`, `cerrarPaso()` exportados de `nucleo.js`. Evento `lotes:deshacer` / `lotes:rehacer` en `document` (lo despacha la grilla; lo escucha nucleo).

- [ ] **Step 1: Pasos y deshacer en `nucleo.js`**

Agregar al import:

```js
import { tomarFoto, diferencia, aplicar, crearHistorial, describirPaso, describirCambio } from './deshacer.js';
```

Después de `markSaved`, agregar:

```js
/* ---------- deshacer / rehacer de toda la pagina ----------
 * _foto es como estaba el documento despues del ultimo paso. Cada markDirty
 * abre un paso; a los 300 ms sin otro (o al empezar un guardado, o al apretar
 * Ctrl+Z) se compara contra la foto y lo que cambio se apila. Lo que llega de
 * otros (409, en vivo, borrador recuperado, ajustes antes de guardar) mueve la
 * foto SIN apilar: tu Ctrl+Z nunca deshace lo ajeno. */
const _historial = crearHistorial(100);
let _foto = null;
let _pasoAbierto = false, _timerPaso = null, _vistaDelPaso = null;

function _abrirPaso(){
  if (!_foto) return;
  if (!_pasoAbierto) _vistaDelPaso = vistaActiva();
  _pasoAbierto = true;
  clearTimeout(_timerPaso);
  _timerPaso = setTimeout(cerrarPaso, 300);
}

export function cerrarPaso(){
  clearTimeout(_timerPaso);
  _timerPaso = null;
  if (!_pasoAbierto || !_foto || !_datos){ _pasoAbierto = false; return; }
  _pasoAbierto = false;
  const { cambios, foto } = diferencia(_foto, _datos);
  _foto = foto;
  _historial.apilar({ cambios, etiqueta: describirPaso(cambios), vista: _vistaDelPaso });
  _vistaDelPaso = null;
}

function _nuevaFoto(){ _foto = _datos ? tomarFoto(_datos) : null; }

const NOMBRE_VISTA = {
  lotes: 'Lotes', analisis: 'Análisis', movimientos: 'Movimientos', so2: 'SO2', config: 'Config',
  orden: 'Orden de muestras', ordencorr: 'Orden de corrección', cargar: 'Cargar', ficha: 'Ficha',
  dashboard: 'Dashboard', tablero: 'Tablero', cruce: 'Cruce',
};

function _mover(sentido){
  if (!_datos) return;
  cerrarPaso();
  const paso = sentido === 'deshacer' ? _historial.deshacer() : _historial.rehacer();
  if (!paso){ avisoBreve(sentido === 'deshacer' ? 'No hay nada para deshacer.' : 'No hay nada para rehacer.', 'info'); return; }
  const { aplicados, salteados } = aplicar(_datos, paso.cambios, sentido);
  _nuevaFoto();   // lo que quedo es la base nueva: deshacer no es un paso
  if (aplicados){
    _marcarCambiado();
    document.dispatchEvent(new CustomEvent('lotes:datos-recargados'));
    invalidarVistas();
    renderActivo();
  }
  if (salteados.length){
    avisoBreve('No se deshizo ' + describirCambio(salteados[0]) +
      (salteados.length > 1 ? ' (y ' + (salteados.length - 1) + ' más)' : '') +
      ': lo cambió otra persona después.', 'error');
    return;
  }
  const donde = paso.vista && paso.vista !== vistaActiva() && NOMBRE_VISTA[paso.vista] ? ' (' + NOMBRE_VISTA[paso.vista] + ')' : '';
  avisoBreve((sentido === 'deshacer' ? 'Deshecho: ' : 'Rehecho: ') + paso.etiqueta + donde, 'ok');
}
export function deshacer(){ _mover('deshacer'); }
export function rehacer(){ _mover('rehacer'); }
document.addEventListener('lotes:deshacer', deshacer);
document.addEventListener('lotes:rehacer', rehacer);
```

Completar los ganchos de la Tarea 5 (reemplazar las tres funciones vacías):

```js
/* Antes de que entre lo de otro: lo tuyo queda anotado como paso. */
function _antesDeCambioAjeno(){ cerrarPaso(); }
/* Despues: lo de otro es la base, no un paso tuyo. */
function _despuesDeCambioAjeno(){ _nuevaFoto(); }
/* El freno de borrado masivo pregunto y se eligio Cancelar. */
function _alCancelarFreno(){ deshacer(); }
```

Cambiar `markDirty` para que abra el paso:

```js
export function markDirty(){
  if (!_nombrePedido && !usuarioActual()){ _nombrePedido = true; pedirUsuario(true); }
  _marcarCambiado();
  _abrirPaso();
}
```

En `_guardar`, al principio (después de `if (!dirty) return 'nada';`), agregar `cerrarPaso();`, y después del `for` de `_antesDeGuardar`, agregar:

```js
  // Los ajustes automaticos (cierre de mermas) no son un paso tuyo.
  if (cambioHook) _nuevaFoto();
```

En `cargarDatos`, después de `if (recuperado){ setDatos(recuperado); completarSecciones(); }`, agregar:

```js
    // Lo cargado (y el borrador recuperado) es la base: no hay nada para deshacer.
    _historial.limpiar();
    _nuevaFoto();
```

- [ ] **Step 2: Teclas en `app.js`**

Agregar `deshacer, rehacer` al import de `./js/nucleo.js` y, junto al listener de Ctrl+S de la Tarea 5:

```js
  /* Ctrl+Z / Ctrl+Y (y Ctrl+Shift+Z): deshacer y rehacer de TODA la pagina.
     Si el foco esta en un campo donde se escribe, la tecla es del navegador
     (deshace lo que vas tipeando). Con un overlay abierto no se deshace nada:
     el paso se anota recien al aceptar. La grilla, cuando tiene seleccion,
     despacha lotes:deshacer/lotes:rehacer y llega al mismo lugar. */
  const esCampoDeTexto = el => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'date'].includes(el.type)));
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    const esDeshacer = k === 'z' && !e.shiftKey;
    const esRehacer = k === 'y' || (k === 'z' && e.shiftKey);
    if (!esDeshacer && !esRehacer) return;
    if (esCampoDeTexto(document.activeElement)) return;
    if ($('overlay').classList.contains('show')) return;
    e.preventDefault();
    if (esDeshacer) deshacer(); else rehacer();
  });
```

- [ ] **Step 3: La grilla usa el deshacer general**

En `public/lotes/js/grilla.js`:
- Borrar `import { crearPila } from './grilla-undo.js';` (L16).
- En `nuevoEstado`, borrar la línea `    pila: crearPila(),`.
- En `escribirCeldas`, dejar de juntar `cambios` para la pila. Reemplazar el bloque `const cambios = [];` … `if (cambios.length){ st.pila.apilar(cambios); if (ad.onCambio) ad.onCambio(); }` para que quede así (el resto del cuerpo igual):

```js
  let escribio = false;
  for (const it of items){
    const col = g.cols[it.c];
    if (!col){ res.salteadas++; continue; }
    if (g.esRO(it.f, it.c)){ res.salteadas++; continue; }
    const obj = ad.objetoDe(it.f);
    if (!obj){ res.salteadas++; continue; }

    const estado = ad.escribir(obj, col.k, it.texto);
    if (estado === 'ok'){
      res.escritas++;
      escribio = true;
      refrescarCelda(ad, g, it.f, it.c, obj, col.k);
    } else if (estado === 'ro'){
      res.salteadas++;
    } else {
      res.rechazadas++;
    }
  }

  /* onCambio llama a markDirty: toda la operacion (pegar, borrar el rango,
   * aplicar al rango) queda como UN paso del deshacer general (nucleo.js lo
   * cierra a los 300 ms). */
  if (escribio && ad.onCambio) ad.onCambio();
  return res;
```

  (Conservar los comentarios existentes de `esRO` dentro del `for`.)
- Borrar `aplicarCambios`, `deshacer(st)`, `rehacer(st)` y `limpiarPilas` (L1005-1055 aprox., con sus comentarios), y el `document.addEventListener('lotes:datos-recargados', limpiarPilas);` (L792) con su comentario.
- Reemplazar las tres líneas de teclas (L622-624) por:

```js
  /* Deshacer / rehacer: los maneja nucleo.js para toda la pagina. */
  if ((e.key === 'z' || e.key === 'Z') && e.ctrlKey && !e.shiftKey){ document.dispatchEvent(new CustomEvent('lotes:deshacer')); return true; }
  if ((e.key === 'y' || e.key === 'Y') && e.ctrlKey){ document.dispatchEvent(new CustomEvent('lotes:rehacer')); return true; }
  if ((e.key === 'z' || e.key === 'Z') && e.ctrlKey && e.shiftKey){ document.dispatchEvent(new CustomEvent('lotes:rehacer')); return true; }
```

- Si `escribirCrudo` de `adaptadorCols` quedó sin uso (`grep -n "escribirCrudo" public/lotes/js/*.js`), borrarlo también.

- [ ] **Step 4: Borrar `grilla-undo.js` y su test**

```bash
grep -rln "grilla-undo\|crearPila\|limpiarPilas" public test
git rm public/lotes/js/grilla-undo.js
```

Si aparece un test (p. ej. `test/lotes-grilla-undo.test.mjs`), `git rm` también. Si algún test importa `deshacer`/`rehacer`/`limpiarPilas` de `grilla.js`, borrar esos casos: lo cubre ahora `test/lotes-deshacer.test.mjs`.

- [ ] **Step 5: Correr todo**

Run: `npx vitest run`
Expected: PASS.

Run: `grep -rn "\.pila\b\|crearPila\|limpiarPilas\|aplicarCambios" public/lotes`
Expected: sin resultados.

- [ ] **Step 6: Commit**

```bash
git add -A public/lotes test
git commit -m "feat(lotes): Ctrl+Z / Ctrl+Y para toda la pagina; la grilla usa el deshacer general

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Ver en vivo lo que guardan los demás

**Files:**
- Create: `public/lotes/js/en-vivo.js`
- Test: `test/lotes-en-vivo.test.mjs`
- Modify: `public/lotes/js/nucleo.js`
- Modify: `public/lotes/app.js` (arrancar la consulta)

**Interfaces:**
- Consumes: `GET /lotes/api/version` (Tarea 4); `hayCambiosSinGuardar`, `_estado`, `_ediciones`, `_base`, `cerrarPaso`/`_nuevaFoto` (Tareas 5-6).
- Produces:
  - `CADA_MS = 15000`
  - `decidirActualizacion({versionServidor, versionLocal, pendiente, ocupado}) -> 'nada'|'esperar'|'adoptar'`
  - `ocupadoSegun({overlayAbierto, activo}) -> boolean` donde `activo = {tag, tipo, enTabla, valor, valorOriginal, editable}` o `null`.
  - `nucleo.js`: `export function arrancarEnVivo()`.

- [ ] **Step 1: Escribir los tests que fallan**

```js
/* Ver en vivo lo que guardan los demas (spec 2026-10-05, seccion 4). */
import { describe, it, expect } from 'vitest';
import { decidirActualizacion, ocupadoSegun, CADA_MS } from '../public/lotes/js/en-vivo.js';

describe('decidirActualizacion', () => {
  const base = { versionServidor: 10, versionLocal: 9, pendiente: false, ocupado: false };
  it('cada 15 s', () => { expect(CADA_MS).toBe(15000); });
  it('misma versión: nada', () => {
    expect(decidirActualizacion({ ...base, versionServidor: 9 })).toBe('nada');
  });
  it('versión del servidor más vieja (la mía se adelantó): nada', () => {
    expect(decidirActualizacion({ ...base, versionServidor: 8 })).toBe('nada');
  });
  it('hay algo mío sin subir: nada (lo combina el 409 del autoguardado)', () => {
    expect(decidirActualizacion({ ...base, pendiente: true })).toBe('nada');
  });
  it('estoy escribiendo: esperar', () => {
    expect(decidirActualizacion({ ...base, ocupado: true })).toBe('esperar');
  });
  it('libre y hay versión nueva: adoptar', () => {
    expect(decidirActualizacion(base)).toBe('adoptar');
  });
  it('versión que no es número: nada', () => {
    expect(decidirActualizacion({ ...base, versionServidor: undefined })).toBe('nada');
  });
});

describe('ocupadoSegun', () => {
  const campo = (x) => ({ tag: 'INPUT', tipo: 'text', enTabla: false, valor: '', valorOriginal: '', editable: false, ...x });
  it('overlay abierto', () => { expect(ocupadoSegun({ overlayAbierto: true, activo: null })).toBe(true); });
  it('nada con foco', () => { expect(ocupadoSegun({ overlayAbierto: false, activo: null })).toBe(false); });
  it('un campo fuera de las tablas con foco (buscador, formulario)', () => {
    expect(ocupadoSegun({ overlayAbierto: false, activo: campo({}) })).toBe(true);
  });
  it('celda de tabla con foco pero sin tipear', () => {
    expect(ocupadoSegun({ overlayAbierto: false, activo: campo({ enTabla: true, valor: '3,5', valorOriginal: '3,5' }) })).toBe(false);
  });
  it('celda de tabla a medio tipear', () => {
    expect(ocupadoSegun({ overlayAbierto: false, activo: campo({ enTabla: true, valor: '3,', valorOriginal: '3,5' }) })).toBe(true);
  });
  it('un botón con foco no cuenta', () => {
    expect(ocupadoSegun({ overlayAbierto: false, activo: { tag: 'BUTTON', tipo: '', enTabla: false, valor: '', valorOriginal: '', editable: false } })).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/lotes-en-vivo.test.mjs`
Expected: FAIL — no existe `en-vivo.js`.

- [ ] **Step 3: Implementar `en-vivo.js`**

```js
/* ===== Lotes CIW — ver en vivo lo que guardan los demas =====
 * Puro. nucleo.js pregunta GET /version cada 15 s (solo con la pestaña a la
 * vista) y usa esto para decidir si baja el documento y redibuja.
 * Nunca mueve la pantalla mientras alguien escribe: con un overlay abierto, el
 * foco en un campo de un formulario o una celda a medio tipear, espera.
 * Spec: docs/superpowers/specs/2026-10-05-lotes-autoguardado-deshacer-design.md
 */
'use strict';

export const CADA_MS = 15000;

export function decidirActualizacion({ versionServidor, versionLocal, pendiente, ocupado }){
  const vs = Number(versionServidor), vl = Number(versionLocal);
  if (!Number.isFinite(vs) || !(vs > (Number.isFinite(vl) ? vl : -1))) return 'nada';
  // Lo mio sin subir: el autoguardado va a recibir un 409 y combinar.
  if (pendiente) return 'nada';
  if (ocupado) return 'esperar';
  return 'adoptar';
}

const CAMPOS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** activo: lo que tiene el foco, ya leido del DOM por nucleo.js:
 *  {tag, tipo, enTabla, valor, valorOriginal, editable} o null.
 *  En una tabla, una celda con foco pero sin tipear no frena (las grillas
 *  dejan el foco en la celda); fuera de las tablas, cualquier campo frena. */
export function ocupadoSegun({ overlayAbierto, activo }){
  if (overlayAbierto) return true;
  if (!activo) return false;
  if (activo.editable) return true;
  if (!CAMPOS.has(activo.tag)) return false;
  if (activo.tag === 'INPUT' && ['button', 'submit', 'checkbox', 'radio'].includes(activo.tipo)) return false;
  if (activo.enTabla) return activo.valor !== activo.valorOriginal;
  return true;
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run test/lotes-en-vivo.test.mjs`
Expected: PASS (13 tests).

- [ ] **Step 5: La consulta en `nucleo.js`**

Agregar al import:

```js
import { CADA_MS, decidirActualizacion, ocupadoSegun } from './en-vivo.js';
```

Después del bloque de deshacer (Tarea 6), agregar:

```js
/* ---------- en vivo: lo que guardan los demas ----------
 * Cada 15 s, con la pestaña a la vista, se pregunta la version (consulta
 * minima). Si otro guardo y esta pantalla esta libre, se baja el documento y
 * se redibuja. Lo que llega no entra al deshacer (_nuevaFoto). */
let _vivoParado = false, _vivoMirando = false;

function _leerActivo(){
  const a = document.activeElement;
  if (!a || a === document.body) return null;
  return {
    tag: a.tagName, tipo: a.type || '', enTabla: !!a.closest('table'),
    valor: a.value, valorOriginal: a.defaultValue, editable: !!a.isContentEditable,
  };
}

async function _mirarVersion(){
  if (_vivoParado || _vivoMirando || !_datos || document.visibilityState !== 'visible') return;
  _vivoMirando = true;
  try {
    let info;
    try {
      const r = await fetch(API + '/version', { cache: 'no-store' });
      if (r.status === 401){ _vivoParado = true; return; }
      if (!r.ok) return;
      info = await r.json();
    } catch (e) { return; }
    const decision = decidirActualizacion({
      versionServidor: info.version,
      versionLocal: (_datos.meta || {}).version,
      pendiente: hayCambiosSinGuardar(),
      ocupado: ocupadoSegun({ overlayAbierto: $('overlay').classList.contains('show'), activo: _leerActivo() }),
    });
    if (decision === 'adoptar') await _adoptarDelServidor(info);
  } finally { _vivoMirando = false; }
}

async function _adoptarDelServidor(info){
  const edicionesAntes = _ediciones;
  let nuevo;
  try {
    const r = await fetch(API + '/datos', { cache: 'no-store' });
    if (!r.ok) return;
    nuevo = await r.json();
  } catch (e) { return; }
  // Se edito mientras bajaba: se descarta, lo combina el 409 del autoguardado.
  if (_ediciones !== edicionesAntes || hayCambiosSinGuardar()) return;
  _antesDeCambioAjeno();
  setDatos(nuevo);
  completarSecciones();
  _base = FUSION ? FUSION.clonar(DATOS()) : null;
  _despuesDeCambioAjeno();
  document.dispatchEvent(new CustomEvent('lotes:datos-recargados'));
  invalidarVistas();
  cargarDashboard();
  renderActivo();
  _estado('↻ Actualizado con cambios de ' + (info.autor || 'otro usuario') + ' (v' + DATOS().meta.version + ')', 'saved');
}

/** Arranca la consulta periodica. La llama app.js despues de cargar. */
export function arrancarEnVivo(){
  setInterval(_mirarVersion, CADA_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _mirarVersion();
  });
}
```

Para que el 401 del autoguardado también vuelva a encender la consulta cuando se recupera la sesión, en `markSaved` agregar al final: `_vivoParado = false;`

- [ ] **Step 6: Arrancarla en `app.js`**

Agregar `arrancarEnVivo` al import de `./js/nucleo.js` y, después de `await dash;`:

```js
  /* ver en vivo lo que guardan los demas (cada 15 s, con la pestaña a la vista) */
  arrancarEnVivo();
```

- [ ] **Step 7: Correr todo y commit**

Run: `npx vitest run`
Expected: PASS.

```bash
git add public/lotes/js/en-vivo.js test/lotes-en-vivo.test.mjs public/lotes/js/nucleo.js public/lotes/app.js
git commit -m "feat(lotes): ver en vivo los cambios de los demas (version cada 15 s)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Verificación en el navegador, guía y cierre

**Files:**
- Create (no versionado): `C:\Users\Bmax\repos\catenainstitute-autoguardado\.claude\launch.json`
- Modify: `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\.claude\launch.json` (sumar la entrada; el repo de Escritorio\claude sí lo versiona)
- Modify: `docs/guia-lotes.md`

- [ ] **Step 1: Server local de prueba**

Agregar a los **dos** `launch.json` (el de `Escritorio\claude` y uno nuevo en el worktree con solo esta entrada; ver memoria `catenainstitute-verificar-en-navegador`):

```json
    {
      "name": "lotes-autoguardado",
      "runtimeExecutable": "cmd",
      "runtimeArgs": [
        "/c",
        "cd /d C:\\Users\\Bmax\\repos\\catenainstitute-autoguardado && npx wrangler dev -c wrangler.dev.jsonc --port 8799 --local --persist-to C:\\Users\\Bmax\\repos\\catenainstitute\\.wrangler\\state"
      ],
      "port": 8799
    }
```

`preview_start {name: "lotes-autoguardado"}` y abrir `http://localhost:8799/lotes/`. Si la D1 local está vacía, sembrar unos lotes con `curl` POST `?forzar=1` como dice la memoria (escribir los temporales en el scratchpad, no en el repo). Después de cada cambio de código: `preview_stop` + `preview_start` y recargar con `location.replace(location.pathname + '?v=' + Date.now())`.

- [ ] **Step 2: Autoguardado**

Con `javascript_tool` / `read_page`:
1. Editar una celda de Lotes (pestaña activada con `.click()` del botón de la pestaña). En ≤ 3 s `#statusBar` dice `✓ Guardado (vN+1)` y `fetch('/lotes/api/version')` devuelve `N+1`. No existe `#btnGuardar`.
2. Ctrl+S (despachar `KeyboardEvent('keydown', {key:'s', ctrlKey:true, bubbles:true})`) guarda sin esperar.
3. Medir: `performance.now()` alrededor de `cerrarPaso` (exportado) con los datos de prueba; anotar.

- [ ] **Step 3: Deshacer y rehacer**

Para cada acción: editar una celda de Lotes, pegar un bloque en Análisis, borrar un lote (✕), cargar análisis desde Cargar, cambiar algo en Config, confirmar una OT si hay datos para eso:
1. Hacer la acción, esperar 400 ms, despachar Ctrl+Z con el foco en `document.body` → el dato vuelve y aparece `#avisoBreve` con "Deshecho: …".
2. Ctrl+Y → vuelve a aplicarse.
3. Con el foco dentro de un `<input>` de buscador, Ctrl+Z **no** dispara el deshacer general (el aviso no aparece).

- [ ] **Step 4: Otra persona en el medio y en vivo**

1. Abrir una segunda pestaña (`tabs_create`) en la misma URL.
2. En la pestaña B editar el lote X y esperar el guardado. En la pestaña A, en ≤ 15 s, aparece el cambio y `#statusBar` dice "↻ Actualizado con cambios de …".
3. En la pestaña A, con una celda **a medio tipear** (input con foco y valor distinto del original), editar algo en B: A no redibuja hasta salir de la celda.
4. En A editar el lote X (campo litros); en B editar el mismo lote X después; en A, cuando llegue lo de B, Ctrl+Z → aviso "No se deshizo lote X: lo cambió otra persona después" y queda el valor de B.

- [ ] **Step 5: Sin red**

Detener el server (`preview_stop`), editar una celda: `#statusBar` dice "⚠ Sin conexión — reintentando en 5 s" y no salta ningún `alert`. Volver a arrancarlo: en el próximo reintento queda "✓ Guardado".

Si algo falla en los pasos 2-5: arreglarlo con su test (si es lógica pura) y repetir el paso. Si no se puede verificar algo a ojo (clasificador de permisos, preview que no arranca), anotarlo y decírselo al usuario; no darlo por hecho.

- [ ] **Step 6: Guía de Lotes**

En `docs/guia-lotes.md`, agregar una sección (después de la introducción; adaptar el nivel de título al del archivo):

```markdown
## Guardado y deshacer

- **Se guarda solo.** Dos segundos después de cada cambio, sin botón. Arriba a
  la derecha dice si está guardando, guardado o sin conexión. **Ctrl+S** guarda
  en el momento.
- **Sin señal** no se pierde nada: queda en la compu y se reintenta solo.
- **Ctrl+Z deshace** lo último que hiciste, en cualquier pestaña (celdas,
  pegados, borrar un lote, cargar análisis, confirmar una OT, Config). **Ctrl+Y**
  lo rehace. Si estás escribiendo dentro de un campo, Ctrl+Z deshace lo que
  tipeaste, como siempre.
- El deshacer **nunca pisa lo de otra persona**: si alguien cambió esa fila
  después, no se toca y te avisa.
- **Lo que guardan los demás aparece solo** en tu pantalla (cada 15 s), salvo
  mientras estás escribiendo.
- Al recargar la página, el historial de Ctrl+Z arranca vacío. Para volver más
  atrás: 🕘 Historial y los respaldos (uno cada 5 minutos).
```

- [ ] **Step 7: Suite completa, typecheck y commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: todo PASS, sin errores de tipos.

```bash
git add docs/guia-lotes.md
git commit -m "docs(lotes): guia de autoguardado, deshacer y en vivo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(El `launch.json` de `Escritorio\claude` se commitea en ese repo con `chore: launch.json con el servidor de prueba del autoguardado (lotes-autoguardado, :8799)`, como los anteriores.)

- [ ] **Step 8: Integración**

Usar superpowers:finishing-a-development-branch. Recordar al usuario, al cerrar:
- el deploy lo corre él desde `repos\catenainstitute` en `main` limpio (`npx.cmd wrangler deploy`), después del merge;
- avisar en la bodega que recarguen Lotes con Ctrl+F5;
- opcional: regla de ciclo de vida de 60 días para `lotes/` en el bucket `catenainstitute-respaldos`.
