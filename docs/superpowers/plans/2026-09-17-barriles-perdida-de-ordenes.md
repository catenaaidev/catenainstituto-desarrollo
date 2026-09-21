# Arreglo de la pérdida silenciosa de órdenes — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una orden cargada en un celular no pueda desaparecer sin que nadie se entere.

**Architecture:** El cliente deja de *inferir* si tiene trabajo sin subir mirando el contenido de las colecciones, y pasa a *marcarlo* con un booleano persistido en `localStorage` que solo apaga un 200 del servidor. Ese marcador gobierna los cuatro puntos donde hoy se pisa el estado local. En el servidor, la escritura pasa a ser un compare-and-swap real y el freno de borrado cuenta identidades en vez de longitudes.

**Tech Stack:** JavaScript sin build (`public/barriles/index.html` + módulos clásicos en `public/barriles/js/`), Cloudflare Workers + D1 (TypeScript en `src/barriles/`), vitest con `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-09-17-barriles-perdida-de-ordenes-design.md`

## Global Constraints

- Rama de trabajo: `arreglo/perdida-de-ordenes`. Ya existe y sale de `feat/escaner-operario-simple`.
- Los tests corren con `npm test` (vitest). Un test solo: `npx vitest run test/<archivo> -t "<nombre>"`.
- Los tests que importan archivos **no-TypeScript** (`public/barriles/js/*.js`, `scripts/*.mjs`) van en `.mjs`, nunca en `.ts`: `tsconfig.json` solo incluye `src/**/*.ts` y `test/**/*.ts`, y `tsc --noEmit` frenaría el despliegue. Ya está documentado en `test/freno.test.mjs` y `test/barriles-orden-editable.test.mjs`. **No lo "arregles" pasándolo a `.ts`.**
- Los módulos de `public/barriles/js/` se cargan como `<script>` clásico y **no exportan nada**: se cuelgan de `globalThis`. El test los importa por efecto (`import '../public/barriles/js/x.js'`) y después desestructura de `globalThis`. Patrón establecido en `public/barriles/js/orden-editable.js`.
- Los tests de rutas construyen un `Request` con la cabecera `Cf-Access-Authenticated-User-Email` y llaman `rutasBarriles(req, env, ctx, ruta)` directamente. Patrón en `test/barriles-info.test.ts`.
- Constantes existentes que se usan abajo: `CLAVE = 'mapaBarriles_v1'` (:994), `CLAVE_BASE = 'mapaBarriles_base_v1'` (:995).
- Comentarios y mensajes en español rioplatense, como el resto del código. Los comentarios explican **por qué**, no qué.
- **Se corrige solo la copia de la web.** La copia de bodega queda congelada (decisión de web-only). No la toques.

---

### Task 1: El módulo de decisión, puro y testeable

Las dos preguntas que hoy están mal contestadas —«¿fusiono o piso?» y «¿qué hago al arrancar?»— salen de `index.html` a un módulo propio. Ahí se pueden testear sin DOM, sin `fetch` y sin `localStorage`.

**Files:**
- Create: `public/barriles/js/pendientes.js`
- Test: `test/barriles-pendientes.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: en `globalThis`, `decidirSincronizacion({ pendienteLocal, cambiosBoxes, cambiosPalets }) -> 'fusionar' | 'adoptar'` y `decidirArranque({ hayLocal, pendienteLocal, hayFotoBase, hayEstadoServidor }) -> 'fusionar' | 'subir-local' | 'adoptar-servidor' | 'vacio'`.

- [ ] **Step 1: Escribir el test que falla**

Crear `test/barriles-pendientes.test.mjs`:

```js
/**
 * Las dos decisiones que deciden si el trabajo de un operario sobrevive.
 *
 * Va en .mjs y no en .ts a propósito, igual que `barriles-orden-editable.test.mjs`:
 * `tsconfig.json` solo incluye `test/**\/*.ts`, y este archivo importa un .js sin
 * declaraciones de tipos. No lo pases a .ts.
 *
 * El import es por efecto: `pendientes.js` se carga como <script> clásico en la
 * página, así que no exporta nada — se cuelga del objeto global.
 */

import { describe, it, expect } from 'vitest';
import '../public/barriles/js/pendientes.js';

const { decidirSincronizacion, decidirArranque } = globalThis;

describe('decidirSincronizacion', () => {
  it('piso lo local solo si no hay absolutamente nada sin confirmar', () => {
    expect(decidirSincronizacion({ pendienteLocal: false, cambiosBoxes: 0, cambiosPalets: 0 }))
      .toBe('adoptar');
  });

  it('fusiona si hay celdas del mapa sin subir', () => {
    expect(decidirSincronizacion({ pendienteLocal: false, cambiosBoxes: 1, cambiosPalets: 0 }))
      .toBe('fusionar');
  });

  it('fusiona si hay casilleros de palets sin subir', () => {
    expect(decidirSincronizacion({ pendienteLocal: false, cambiosBoxes: 0, cambiosPalets: 1 }))
      .toBe('fusionar');
  });

  // Este es el caso que costó dos órdenes de vaciado el 16/09: el operario cargó
  // con el escáner y no tocó ninguna celda del mapa, así que los dos contadores
  // dan cero. Antes eso se leía como "no hay nada local" y se pisaba.
  it('fusiona si el marcador dice que hay trabajo, aunque el mapa esté intacto', () => {
    expect(decidirSincronizacion({ pendienteLocal: true, cambiosBoxes: 0, cambiosPalets: 0 }))
      .toBe('fusionar');
  });
});

describe('decidirArranque', () => {
  it('sube lo local si quedó trabajo sin confirmar, aunque el servidor traiga estado', () => {
    expect(decidirArranque({ hayLocal: true, pendienteLocal: true, hayFotoBase: false, hayEstadoServidor: true }))
      .toBe('subir-local');
  });

  it('fusiona cuando hay copia local y foto de la última sincronización', () => {
    expect(decidirArranque({ hayLocal: true, pendienteLocal: false, hayFotoBase: true, hayEstadoServidor: true }))
      .toBe('fusionar');
  });

  it('adopta lo del servidor cuando no hay nada local que proteger', () => {
    expect(decidirArranque({ hayLocal: false, pendienteLocal: false, hayFotoBase: false, hayEstadoServidor: true }))
      .toBe('adoptar-servidor');
  });

  it('sube lo local si el servidor está vacío', () => {
    expect(decidirArranque({ hayLocal: true, pendienteLocal: false, hayFotoBase: false, hayEstadoServidor: false }))
      .toBe('subir-local');
  });

  it('arranca vacío si no hay nada en ningún lado', () => {
    expect(decidirArranque({ hayLocal: false, pendienteLocal: false, hayFotoBase: false, hayEstadoServidor: false }))
      .toBe('vacio');
  });

  // El marcador pesa más que la foto base: si no hay foto no se puede diferenciar,
  // pero eso nunca puede terminar en pisar trabajo sin confirmar.
  it('el marcador gana aunque falte la foto base', () => {
    expect(decidirArranque({ hayLocal: true, pendienteLocal: true, hayFotoBase: true, hayEstadoServidor: true }))
      .toBe('subir-local');
  });
});
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run test/barriles-pendientes.test.mjs`
Expected: FAIL — no existe `public/barriles/js/pendientes.js`.

- [ ] **Step 3: Escribir el módulo**

Crear `public/barriles/js/pendientes.js`:

```js
/**
 * Las dos decisiones de las que depende que el trabajo de un operario sobreviva.
 *
 * El 16/09 se perdieron dos órdenes de vaciado porque la app preguntaba "¿tengo
 * algo sin subir?" mirando SOLO las celdas del mapa y los palets. Una orden del
 * escáner no toca ninguna celda, así que la respuesta era "no" y el estado local
 * se reemplazaba por el del servidor.
 *
 * La lección: no se infiere del contenido si hay trabajo sin confirmar, se marca
 * el hecho. `pendienteLocal` lo prende cada guardado y solo lo apaga un 200 del
 * servidor. Así queda cubierta cualquier colección, incluidas las que se agreguen
 * después, sin depender de que alguien se acuerde de sumarla a una lista.
 *
 * Se testea en test/barriles-pendientes.test.mjs.
 */

/**
 * ¿El estado local se fusiona con el del servidor, o se puede pisar?
 * Ante cualquier señal de trabajo sin confirmar: fusionar. Pisar es irreversible.
 */
function decidirSincronizacion({ pendienteLocal, cambiosBoxes, cambiosPalets }) {
  const hayTrabajo = !!pendienteLocal || cambiosBoxes > 0 || cambiosPalets > 0;
  return hayTrabajo ? 'fusionar' : 'adoptar';
}

/**
 * Qué hacer al abrir la página, según lo que haya de cada lado.
 *
 * - 'subir-local'      : hay trabajo sin confirmar; fusionar y subirlo YA.
 * - 'fusionar'         : hay copia local y foto de la última sincronización.
 * - 'adoptar-servidor' : no hay nada local que proteger.
 * - 'vacio'            : no hay nada en ningún lado.
 *
 * El marcador pesa más que todo lo demás: sin foto base no se puede calcular qué
 * cambió, pero eso jamás puede terminar en descartar lo que el operario cargó.
 */
function decidirArranque({ hayLocal, pendienteLocal, hayFotoBase, hayEstadoServidor }) {
  if (hayLocal && pendienteLocal) return 'subir-local';
  if (hayLocal && hayFotoBase) return 'fusionar';
  if (hayEstadoServidor) return 'adoptar-servidor';
  if (hayLocal) return 'subir-local';
  return 'vacio';
}

globalThis.decidirSincronizacion = decidirSincronizacion;
globalThis.decidirArranque = decidirArranque;
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `npx vitest run test/barriles-pendientes.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add public/barriles/js/pendientes.js test/barriles-pendientes.test.mjs
git commit -m "feat(barriles): modulo puro con las dos decisiones de sincronizacion"
```

---

### Task 2: El marcador persistido en la pantalla

El marcador entra en `index.html` y `hayPendientes()` pasa a consultarlo. Con esto solos ya se cierran los puntos 1 y 2 (`sondear()`), porque los dos preguntan por `hayPendientes()`.

**Files:**
- Modify: `public/barriles/index.html` — cargar el script (junto a `js/orden-editable.js`, ~:16), declarar el marcador (después de :995), `guardar()` (:1044-1049), `push()` (:1092-1097), `hayPendientes()` (:1158)

**Interfaces:**
- Consumes: `decidirSincronizacion` de Task 1.
- Produces: `pendienteLocal` (booleano de módulo), `marcarPendiente()`, `limpiarPendiente()`, `hayPendientes()` con la semántica nueva.

- [ ] **Step 1: Cargar el módulo**

En el bloque de `<script src=...>` del encabezado, junto a `js/orden-editable.js`:

```html
<!-- Decide si lo local se fusiona o se puede pisar. Va acá, como script clásico,
     porque el arranque de la página corre durante el parseo: un type="module"
     llegaría tarde. Se testea en test/barriles-pendientes.test.mjs. -->
<script src="js/pendientes.js"></script>
```

- [ ] **Step 2: Declarar el marcador**

Justo después de `CLAVE_BASE` (:995):

```js
// Hay algo escrito en este dispositivo que el servidor todavía no confirmó.
// Se persiste porque tiene que sobrevivir a la recarga de la página: si no, al
// arrancar la app no sabe que el celular tiene órdenes sin subir y las pisa.
const CLAVE_PENDIENTE = 'mapaBarriles_pendiente_v1';
let pendienteLocal = false;
try { pendienteLocal = localStorage.getItem(CLAVE_PENDIENTE) === '1'; } catch (e) {}

function marcarPendiente() {
  pendienteLocal = true;
  try { localStorage.setItem(CLAVE_PENDIENTE, '1'); } catch (e) {}
}
// Solo lo llama una confirmación del servidor. Nunca lo apagues "porque sí":
// apagarlo sin confirmación es exactamente la falla que este marcador previene.
function limpiarPendiente() {
  pendienteLocal = false;
  try { localStorage.removeItem(CLAVE_PENDIENTE); } catch (e) {}
}
```

- [ ] **Step 3: Prenderlo en `guardar()` y apagarlo con el 200**

`guardar()` (:1044-1049) queda:

```js
function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); fallaLocal = false; }
  catch (e) { fallaLocal = true; }
  marcarPendiente();
  if (modoServidor) programarPush();
  else if (fallaLocal) ponerInsignia('local');
}
```

En `push()`, la rama `else if (r.ok)` (:1092-1097):

```js
    } else if (r.ok) {
      versionServidor = (await r.json()).version;
      limpiarPendiente();          // el servidor lo confirmó: recién ahora
      snapBoxes();                 // quedó sincronizado: esta es la nueva base
      estabaOffline = false;
      ponerInsignia('ok');
    }
```

- [ ] **Step 4: `hayPendientes()` consulta la decisión**

Reemplazar :1158:

```js
function hayPendientes() {
  return decidirSincronizacion({
    pendienteLocal,
    cambiosBoxes: diffBoxesLocal().length,
    cambiosPalets: diffPaletsLocal().length,
  }) === 'fusionar';
}
```

- [ ] **Step 5: Verificar que la suite sigue verde**

Run: `npm test`
Expected: PASS. Ningún test existente depende de `hayPendientes()`, así que esto no debería romper nada. Si algo se pone rojo, **pará y avisá** antes de seguir: significa que había un acoplamiento no previsto.

- [ ] **Step 6: Commit**

```bash
git add public/barriles/index.html
git commit -m "fix(barriles): el celular marca lo que no confirmo el servidor

hayPendientes() miraba solo celdas del mapa y palets. Una orden del
escaner no toca ninguna celda, asi que daba falso y el estado local se
reemplazaba por el del servidor, borrando la orden sin aviso.

Ahora cada guardado prende un marcador persistido que solo apaga un 200.
Cierra los dos puntos de sondear(); iniciar() y sincronizar() van aparte."
```

---

### Task 3: El punto que dispara en cada arranque

El peor de los cuatro: no necesita que se caiga el WiFi. Alcanza con recargar la página.

**Files:**
- Modify: `public/barriles/index.html:1405-1432` (`iniciar()`)
- Test: `test/barriles-arranque.test.mjs`

**Interfaces:**
- Consumes: `decidirArranque` de Task 1, `pendienteLocal` de Task 2.
- Produces: nada nuevo.

- [ ] **Step 1: Escribir el test que falla**

Este test extrae la decisión del archivo real de producción, como hace `repro_orden_perdida.js`. Crear `test/barriles-arranque.test.mjs`:

```js
/**
 * El arranque de la página no puede descartar trabajo sin confirmar.
 *
 * Reproduce el punto 4 del informe del 16/09: `iniciar()` cargaba la copia
 * local, preguntaba `hayPendientes()`, y si daba falso NO salía por el `return`
 * — la línea siguiente (`if (d.estado) estado = d.estado`) pisaba lo que acababa
 * de cargar. Con órdenes del escáner sin subir eso disparaba en CADA arranque.
 *
 * Se lee el index.html de verdad: si alguien afloja la regla en producción, este
 * test se entera. Va en .mjs por la misma razón que los otros.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import '../public/barriles/js/pendientes.js';

const { decidirArranque } = globalThis;
const INDEX = readFileSync(
  new URL('../public/barriles/index.html', import.meta.url), 'utf8');

describe('el arranque, sobre el archivo real', () => {
  it('iniciar() decide con decidirArranque y no a mano', () => {
    const i = INDEX.indexOf('async function iniciar()');
    expect(i, 'no encontré iniciar()').toBeGreaterThan(-1);
    const cuerpo = INDEX.slice(i, i + 2000);
    expect(cuerpo).toContain('decidirArranque');
  });

  it('el marcador pesa en localTiene: una orden sin subir cuenta como copia local', () => {
    const i = INDEX.indexOf('const localTiene');
    expect(i, 'no encontré localTiene').toBeGreaterThan(-1);
    expect(INDEX.slice(i, i + 220)).toContain('pendienteLocal');
  });
});

describe('la decisión de arranque, con órdenes sin subir', () => {
  // El escenario exacto de los lotes 25312 y 25314: el celular tiene la orden
  // guardada, no tocó el mapa, y el servidor tiene estado. Antes: se pisaba.
  it('nunca adopta el servidor si hay trabajo sin confirmar', () => {
    const d = decidirArranque({
      hayLocal: true, pendienteLocal: true, hayFotoBase: false, hayEstadoServidor: true,
    });
    expect(d).not.toBe('adoptar-servidor');
    expect(d).toBe('subir-local');
  });
});
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run test/barriles-arranque.test.mjs`
Expected: FAIL en los dos primeros — `iniciar()` todavía no usa `decidirArranque` ni `localTiene` mira el marcador.

- [ ] **Step 3: Reescribir el bloque de `iniciar()`**

Reemplazar desde `const localTiene` (:1409) hasta el `return` del bloque `if (r.ok)` (:1427):

```js
  // El marcador cuenta como "hay algo local": una orden del escáner no deja
  // celdas en el mapa ni filas de inventario, y esa era justamente la ceguera.
  const localTiene = !!(local && (local.boxes?.length || local.inventario?.length || pendienteLocal));
  try {
    const r = await fetch(API+'/estado', { cache: 'no-store' });
    if (r.ok) {
      const d = await r.json();
      modoServidor = true; versionServidor = d.version;
      // No se espera: solo decide textos. Si tarda o falla, queda el modo 'local'.
      pedirInfo().catch(() => {});
      const hayFotoBase = !!(pbase && typeof pbase.boxes === 'string');
      const quePasa = decidirArranque({
        hayLocal: localTiene, pendienteLocal, hayFotoBase, hayEstadoServidor: !!d.estado,
      });

      if (quePasa === 'fusionar' || quePasa === 'subir-local') {
        estado = local; reindexar();
        if (hayFotoBase) {
          baseBoxes = pbase.boxes;
          if (typeof pbase.palets === 'string') basePalets = pbase.palets;
        }
        // Sin foto base no se puede calcular qué cambió, pero sincronizar()
        // fusiona por id igual: nunca se pisa lo que cargó el operario.
        await sincronizar(true);
        return;
      }
      if (quePasa === 'adoptar-servidor') estado = d.estado;
      reindexar(); snapBoxes(); ponerInsignia('ok');
      return;
    }
  } catch (e) {}
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run test/barriles-arranque.test.mjs && npm test`
Expected: PASS los dos.

- [ ] **Step 5: Commit**

```bash
git add public/barriles/index.html test/barriles-arranque.test.mjs
git commit -m "fix(barriles): el arranque ya no descarta ordenes sin subir

iniciar() cargaba la copia local y, si hayPendientes() daba falso, no
salia por el return: la linea siguiente la pisaba con el estado del
servidor. Con ordenes del escaner sin subir eso disparaba en cada
arranque, sin necesidad de que se cayera el WiFi."
```

---

### Task 4: La salida temprana de `sincronizar()`

El cuarto punto. `sincronizar()` sale con `return` **antes** de llegar a su propio código de fusión, que está bien escrito y es inalcanzable.

**Files:**
- Modify: `public/barriles/index.html:1273-1276` y el cierre exitoso de `sincronizar()` (~:1326-1340)
- Test: `test/barriles-arranque.test.mjs` (se agrega un `describe`)

- [ ] **Step 1: Agregar el test que falla**

Al final de `test/barriles-arranque.test.mjs`:

```js
describe('la salida temprana de sincronizar()', () => {
  // sincronizar() tiene la fusión correcta de TODAS las colecciones (escaneos por
  // id, tanques por num, pedidos, revisiones, ediciones). Pero salía por un return
  // antes de llegar, si el mapa y los palets estaban intactos.
  it('no sale temprano cuando el marcador dice que hay trabajo', () => {
    const i = INDEX.indexOf('async function sincronizar(');
    expect(i, 'no encontré sincronizar()').toBeGreaterThan(-1);
    const hastaLaFusion = INDEX.slice(i, INDEX.indexOf('unir órdenes de escáner por id', i));
    const corte = hastaLaFusion.indexOf('!diffPaletsLocal().length');
    expect(corte, 'no encontré la condición de salida temprana').toBeGreaterThan(-1);
    expect(hastaLaFusion.slice(corte, corte + 120)).toContain('pendienteLocal');
  });

  it('el marcador se apaga cuando sincronizar() sube con éxito', () => {
    const i = INDEX.indexOf('async function sincronizar(');
    const fin = INDEX.indexOf('function adoptar(', i);
    expect(INDEX.slice(i, fin)).toContain('limpiarPendiente()');
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/barriles-arranque.test.mjs`
Expected: FAIL en los dos nuevos.

- [ ] **Step 3: Agregar el marcador a la condición**

En :1273:

```js
      // El marcador entra acá: sin él, una orden del escáner (que no toca ninguna
      // celda) hacía salir por este return, salteando la fusión de más abajo.
      if (!cambios.length && !diffPaletsLocal().length && !pendienteLocal) {
        if (d.version !== versionServidor) adoptar(d); else versionServidor = d.version;
        ponerInsignia('ok'); sincronizando = false; return;
      }
```

- [ ] **Step 4: Apagar el marcador al subir con éxito**

En `sincronizar()`, en la rama `if (r.ok)` (:1328-1329), justo después de actualizar `versionServidor`:

```js
      if (r.ok) {
        versionServidor = (await r.json()).version;
        limpiarPendiente();          // el servidor lo confirmó: recién ahora
        estado = serv; reindexar(); snapBoxes();
```

Tiene que quedar **dentro** de la rama de éxito. Ni en el `break` del 500 (:1346), ni en el `catch` (:1349).

- [ ] **Step 5: Apagar el marcador también en `adoptar()`**

Sin esto el arreglo introduce un bucle infinito de carteles, y conviene entender por qué antes de escribirlo.

`adoptar()` se llama desde cuatro lugares. En dos de ellos (`sondear()` :1112 y `sincronizar()` :1274) el marcador ya está apagado, porque justamente por eso se llegó ahí. Pero los otros dos son el camino del **412 rechazado**: cuando el servidor frena un borrado masivo y el operario contesta que no, `push()` (:1089) y `sincronizar()` (:1326) descartan lo local a propósito. Si el marcador queda prendido ahí, `hayPendientes()` da verdadero para siempre → `sincronizar()` cada 3 segundos → 412 de nuevo → otro cartel de confirmación, sin salida.

Apagarlo dentro de `adoptar()` cubre los cuatro sitios y además es lo semánticamente correcto: adoptar el estado del servidor significa, por definición, que no queda nada local sin confirmar.

En `adoptar()` (:1353-1357):

```js
function adoptar(d) {
  versionServidor = d.version;
  if (d.estado) { estado = d.estado; reindexar(); }
  // Adoptar es "lo del servidor pasa a ser lo mío": por definición no queda nada
  // local sin confirmar. Y si no se apagara acá, rechazar un borrado masivo (412)
  // dejaría el marcador prendido para siempre, con un cartel cada tres segundos.
  limpiarPendiente();
  snapBoxes(); estabaOffline = false;   // quedamos alineados con el servidor
```

Agregar el test correspondiente en `test/barriles-arranque.test.mjs`:

```js
describe('adoptar() y el marcador', () => {
  // Rechazar un borrado masivo (412) descarta lo local a proposito. Si el
  // marcador quedara prendido, hayPendientes() daria verdadero para siempre y
  // el operario se comeria un cartel de confirmacion cada tres segundos.
  it('apaga el marcador, para no dejar un bucle de carteles', () => {
    const i = INDEX.indexOf('function adoptar(');
    expect(i, 'no encontré adoptar()').toBeGreaterThan(-1);
    const cuerpo = INDEX.slice(i, INDEX.indexOf('\n}', i));
    expect(cuerpo).toContain('limpiarPendiente()');
  });
});
```

- [ ] **Step 6: Correr los tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/barriles/index.html test/barriles-arranque.test.mjs
git commit -m "fix(barriles): sincronizar() deja de saltearse su propia fusion

El codigo que une escaneos por id, tanques, pedidos, revisiones y
ediciones ya existia y estaba bien escrito. Era inalcanzable: la funcion
salia por un return antes de llegar, si el mapa estaba intacto."
```

---

### Task 5: Un 500 deja de ser silencioso

`fetch` no rechaza ante un 500. Hoy la respuesta no matchea 409, ni 412, ni `r.ok`: la función termina sin avisar y la insignia puede seguir diciendo «sincronizado».

**Files:**
- Modify: `public/barriles/index.html:1092-1099` (`push()`)
- Test: `test/barriles-arranque.test.mjs` (se agrega un `describe`)

- [ ] **Step 1: Agregar el test que falla**

```js
describe('push() ante un error del servidor', () => {
  // fetch NO rechaza ante un 500. Sin una rama else, la respuesta no matcheaba
  // 409, ni 412, ni r.ok: la funcion terminaba en silencio y el marcador
  // quedaba prendido pero la insignia podia seguir diciendo "sincronizado".
  //
  // OJO con como se busca: push() YA tiene un `} else {` (el del 412 rechazado,
  // :1088). Buscarlo suelto daba un test que pasaba sin el arreglo. Hay que
  // anclar la busqueda DESPUES de la rama del exito.
  it('tiene una rama para las respuestas que no son 409, 412 ni ok', () => {
    const i = INDEX.indexOf('async function push(');
    expect(i, 'no encontré push()').toBeGreaterThan(-1);
    const cuerpo = INDEX.slice(i, INDEX.indexOf('async function sondear(', i));
    const exito = cuerpo.indexOf('} else if (r.ok) {');
    expect(exito, 'no encontré la rama del éxito').toBeGreaterThan(-1);
    expect(cuerpo.slice(exito)).toMatch(/\}\s*else\s*\{[\s\S]{0,300}ponerInsignia\('offline'\)/);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/barriles-arranque.test.mjs -t "respuestas que no son"`
Expected: FAIL.

- [ ] **Step 3: Agregar la rama**

Después del `else if (r.ok) { ... }` de :1092-1097:

```js
    } else {
      // 500, 502, 503: fetch no rechaza, así que sin esta rama la función salía
      // en silencio dejando al operario con un cartel de "sincronizado" falso.
      // El marcador NO se toca: lo local sigue sin confirmar.
      ponerInsignia('offline'); estabaOffline = true; necesitaResync = true;
    }
```

- [ ] **Step 4: Correr los tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/barriles/index.html test/barriles-arranque.test.mjs
git commit -m "fix(barriles): un 500 del servidor deja de pasar en silencio"
```

---

### Task 6: Compare-and-swap real en el servidor

Hoy el servidor lee, compara la versión, y después escribe con `ON CONFLICT DO UPDATE` sin ningún `WHERE version = ?`. Dos dispositivos que pasan el chequeo a la vez escriben los dos: el segundo pisa al primero.

**Files:**
- Modify: `src/barriles/rutas.ts:29-40` (`escribir`), `:116-155` (el POST)
- Test: `test/barriles-guardado.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `escribir(env, doc, email, versionPrevia) -> Promise<boolean>` (antes devolvía `void`). `false` significa «otro escribió en el medio».

- [ ] **Step 1: Escribir el test que falla**

Crear `test/barriles-guardado.test.ts`:

```ts
/**
 * Dos dispositivos guardando a la vez.
 *
 * El chequeo de version estaba FUERA de la escritura: leer, comparar y despues
 * escribir con ON CONFLICT DO UPDATE, que escribe siempre. Dos celulares que
 * pasaban el chequeo con la misma version escribian los dos, y el segundo se
 * llevaba puesto el trabajo del primero sin dejar rastro.
 */

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { rutasBarriles } from '../src/barriles/rutas';

const EDITOR = 'editor@catenawines.com';

beforeAll(async () => {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre)
     VALUES (?, 'barriles', 'editor', 'Editor')`,
  ).bind(EDITOR).run();
});

/** Un POST /estado como lo manda la pantalla. */
async function guardar(version: number, estado: unknown) {
  const req = new Request('https://catenainstitute.example/barriles/api/estado', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cf-Access-Authenticated-User-Email': EDITOR,
    },
    body: JSON.stringify({ version, estado }),
  });
  const ctx = createExecutionContext();
  const res = await rutasBarriles(req, env, ctx, '/estado');
  await waitOnExecutionContext(ctx);
  return res!;
}

/** El documento completo, como lo baja la pantalla. */
async function leerDoc() {
  const req = new Request('https://catenainstitute.example/barriles/api/estado', {
    headers: { 'Cf-Access-Authenticated-User-Email': EDITOR },
  });
  const ctx = createExecutionContext();
  const res = await rutasBarriles(req, env, ctx, '/estado');
  await waitOnExecutionContext(ctx);
  return res!.json<{ version: number; estado: { escaneos?: { id: string }[] } }>();
}

/**
 * La version que hay AHORA. Los describe de este archivo comparten
 * almacenamiento, asi que despues del primer guardado la version ya no es 0:
 * asumirlo hacia que el test rompiera por 409 y no por el defecto que persigue.
 */
async function versionActual() {
  return (await leerDoc()).version;
}

function conOrdenes(...ids: string[]) {
  return { boxes: [], palets: [], inventario: [], tanques: [],
           escaneos: ids.map((id) => ({ id, ot: '1', lote: '1', tipo: 'vaciado', codigos: [] })) };
}

describe('dos guardados desde la misma version', () => {
  // OJO: en secuencia esto NO prueba nada. El chequeo `pedido.version !==
  // doc.version` YA existe y devuelve 409 para el segundo, asi que un test
  // secuencial pasa igual sin compare-and-swap.
  //
  // La carrera real es que los dos lean ANTES de que cualquiera escriba. Con
  // Promise.all en un isolate de un solo hilo, los dos llegan a su `await
  // leer(env)` y ceden; cuando resuelven, los dos tienen la misma version y los
  // dos pasan el chequeo. Ahi es donde el ON CONFLICT DO UPDATE escribia dos
  // veces y el segundo se llevaba puesto al primero.
  it('el segundo recibe 409 y no pisa al primero', async () => {
    const base = await versionActual();
    expect((await guardar(base, conOrdenes('a'))).status).toBe(200);
    const version = await versionActual();

    const [a, b] = await Promise.all([
      guardar(version, conOrdenes('a', 'celular-A')),
      guardar(version, conOrdenes('a', 'celular-B')),
    ]);

    const estados = [a.status, b.status].sort();
    expect(estados).toEqual([200, 409]);

    // Y el que gano sigue estando: no quedaron los dos escritos ni se perdieron
    // los dos.
    const doc = await leerDoc();
    const ids = (doc.estado.escaneos ?? []).map((o) => o.id);
    expect(ids).toContain('a');
    expect(ids.includes('celular-A') !== ids.includes('celular-B')).toBe(true);
  });

  it('una version vieja tambien se rechaza', async () => {
    const version = await versionActual();
    expect((await guardar(version, conOrdenes('a', 'nuevo'))).status).toBe(200);
    expect((await guardar(version, conOrdenes('a', 'tarde'))).status).toBe(409);
  });
});

describe('un POST sin estado', () => {
  it('se rechaza con 400 en vez de borrar todo', async () => {
    const req = new Request('https://catenainstitute.example/barriles/api/estado', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cf-Access-Authenticated-User-Email': EDITOR,
      },
      body: JSON.stringify({ version: await versionActual() }),   // sin campo `estado`
    });
    const ctx = createExecutionContext();
    const res = await rutasBarriles(req, env, ctx, '/estado');
    await waitOnExecutionContext(ctx);
    expect(res!.status).toBe(400);
  });

  it('se rechaza tambien con una version vieja: malformado es malformado', async () => {
    const req = new Request('https://catenainstitute.example/barriles/api/estado', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cf-Access-Authenticated-User-Email': EDITOR,
      },
      body: JSON.stringify({ version: 0 }),
    });
    const ctx = createExecutionContext();
    const res = await rutasBarriles(req, env, ctx, '/estado');
    await waitOnExecutionContext(ctx);
    expect(res!.status).toBe(400);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/barriles-guardado.test.ts`
Expected: FAIL — el segundo guardado devuelve 200 (pisa), y el POST sin `estado` devuelve 200.

- [ ] **Step 3: `escribir()` pasa a ser compare-and-swap**

Reemplazar `escribir` (`src/barriles/rutas.ts:29-40`):

```ts
/**
 * Escribe solo si la versión en la base sigue siendo la que se leyó.
 *
 * Antes era un ON CONFLICT DO UPDATE, que escribe siempre: el chequeo de versión
 * de más arriba quedaba fuera de la escritura y dos dispositivos que lo pasaban
 * con la misma versión escribían los dos. Devuelve false si otro escribió en el
 * medio; el llamador responde 409 y el cliente fusiona.
 */
async function escribir(
  env: Env,
  doc: Documento,
  email: string,
  versionPrevia: number,
): Promise<boolean> {
  const json = JSON.stringify(doc);
  const escritura =
    versionPrevia === 0
      ? // No hay fila todavía. Si otro la creó en el medio, DO NOTHING no toca nada.
        env.DB.prepare(
          `INSERT INTO documento (modulo, version, json, autor, guardado)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(modulo) DO NOTHING`,
        ).bind(MODULO, doc.version, json, email)
      : env.DB.prepare(
          `UPDATE documento
              SET version = ?, json = ?, autor = ?, guardado = datetime('now')
            WHERE modulo = ? AND version = ?`,
        ).bind(doc.version, json, email, MODULO, versionPrevia);

  const r = await env.DB.batch([marcarSesion(env, email), escritura]);
  return (r[1].meta.changes ?? 0) > 0;
}
```

- [ ] **Step 4: El POST valida la entrada y respeta el 409**

La validación va **antes** del chequeo de versión, inmediatamente después del
`catch { return json(400, { error: 'JSON invalido' }); }` que cierra el parseo del
body (:112-114) y antes de `const doc = await leer(env);` (:116). Una petición
malformada lo es independientemente de la versión; si va después, un POST sin
`estado` y con versión vieja devuelve 409 en vez de 400 y el defecto queda tapado.

```ts
    // Sin esto, un POST sin `estado` reemplazaba el documento entero por {}.
    if (!pedido.estado || typeof pedido.estado !== 'object' || Array.isArray(pedido.estado)) {
      return json(400, {
        error: 'validacion',
        detalles: ['falta el estado: un guardado sin estado borraría todo'],
      });
    }
```

Y reemplazar la línea `const nuevoEstado = pedido.estado ?? {};` (:121) por:

```ts
    const nuevoEstado = pedido.estado;
```

Y reemplazar `await escribir(env, actualizado, id!.email);` (:137):

```ts
    if (!(await escribir(env, actualizado, id!.email, doc.version))) {
      // Otro dispositivo ganó la carrera entre la lectura y la escritura.
      return json(409, await leer(env));
    }
```

El `INSERT` al historial y el `ctx.waitUntil(snapshotBarriles(...))` quedan **después** de ese chequeo: si no se escribió, no hay nada que registrar.

- [ ] **Step 5: Correr los tests**

Run: `npx vitest run test/barriles-guardado.test.ts && npm test`
Expected: PASS los dos. `test/barriles.test.ts` y `test/barriles-info.test.ts` tienen que seguir verdes.

- [ ] **Step 6: Commit**

```bash
git add src/barriles/rutas.ts test/barriles-guardado.test.ts
git commit -m "fix(barriles): la escritura es un compare-and-swap de verdad

El chequeo de version estaba fuera de la escritura y ON CONFLICT DO
UPDATE escribe siempre, asi que dos dispositivos que pasaban el chequeo
con la misma version escribian los dos. Ademas, un POST sin estado
reemplazaba el documento entero por {}."
```

---

### Task 7: El freno de borrado cuenta identidades

`Math.max(0, actual.length - nuevo.length)` es ciego al intercambio: borrar 2 órdenes y agregar 2 da cero. Es exactamente la forma que tiene esta falla. Y `revisiones`, `ediciones` y `pedidos` no están en `Perdidas` en absoluto.

**Files:**
- Modify: `src/barriles/guardas.ts:10-18` (umbrales), `:26-41` (tipos), `:79-100` (conteo y umbral)
- Modify: `public/barriles/index.html:1052-1061` (`msgPerdidas`)
- Test: `test/barriles.test.ts` (se agregan `describe`)

**Interfaces:**
- Consumes: nada.
- Produces: `Perdidas` gana `revisiones`, `ediciones` y `pedidos` (todos `number`). Nueva función exportada `idsPerdidos(actual, nuevo, coleccion) -> string[]`, que Task 8 usa para el historial.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `test/barriles.test.ts`:

```ts
describe('el freno ve los intercambios, no solo las bajas netas', () => {
  // Contar longitudes es ciego a esto: se borran 3 ordenes y se agregan 3, el
  // delta da 0 y el freno no salta. Es la forma exacta que tiene esta falla.
  it('frena cuando se borran 3 ordenes y se agregan otras 3', () => {
    const antes = estado({ escaneos: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
    const despues = estado({ escaneos: [{ id: 'x' }, { id: 'y' }, { id: 'z' }] });
    const p = contarPerdidas(antes, despues);
    expect(p.escaneos).toBe(3);
    expect(superanUmbral(p)).toBe(true);
  });

  it('no frena si las mismas ordenes siguen estando, en otro orden', () => {
    const antes = estado({ escaneos: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
    const despues = estado({ escaneos: [{ id: 'c' }, { id: 'a' }, { id: 'b' }] });
    expect(contarPerdidas(antes, despues).escaneos).toBe(0);
  });

  it('agregar sin borrar nunca es perdida', () => {
    const antes = estado({ escaneos: [{ id: 'a' }] });
    const despues = estado({ escaneos: [{ id: 'a' }, { id: 'b' }] });
    expect(contarPerdidas(antes, despues).escaneos).toBe(0);
  });
});

describe('las colecciones que no tenian ningun freno', () => {
  it('cuenta las revisiones que desaparecen', () => {
    const antes = estado({ revisiones: [
      { num: '1', campo: 'lote' }, { num: '2', campo: 'lote' }, { num: '3', campo: 'lote' }] });
    const p = contarPerdidas(antes, estado({ revisiones: [] }));
    expect(p.revisiones).toBe(3);
    expect(superanUmbral(p)).toBe(true);
  });

  it('cuenta las ediciones a mano que desaparecen', () => {
    const antes = estado({ ediciones: [
      { num: '1', campo: 'litros' }, { num: '2', campo: 'litros' }, { num: '3', campo: 'litros' }] });
    expect(superanUmbral(contarPerdidas(antes, estado({ ediciones: [] })))).toBe(true);
  });

  it('cuenta los pedidos de rotulos que desaparecen', () => {
    const antes = estado({ pedidos: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] });
    expect(superanUmbral(contarPerdidas(antes, estado({ pedidos: [] })))).toBe(true);
  });
});

describe('idsPerdidos', () => {
  it('devuelve los ids concretos, para que el historial pueda nombrarlos', () => {
    const antes = estado({ escaneos: [{ id: 'a' }, { id: 'b' }] });
    const despues = estado({ escaneos: [{ id: 'b' }] });
    expect(idsPerdidos(antes, despues, 'escaneos')).toEqual(['a']);
  });
});
```

Agregar `idsPerdidos` al `import` de `../src/barriles/guardas` al inicio del archivo, y `revisiones`, `ediciones` y `pedidos` a los valores por defecto de la función `estado()` (que hoy es `{ boxes: [], palets: [], inventario: [], escaneos: [], tanques: [], ...parcial }`).

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/barriles.test.ts`
Expected: FAIL — `idsPerdidos` no existe y `p.revisiones` es `undefined`.

- [ ] **Step 3: Reescribir el conteo**

En `src/barriles/guardas.ts`, agregar el umbral (junto a los otros, :10-18):

```ts
/** Revisiones, ediciones a mano y pedidos de rótulos: mismo criterio que escaneos. */
export const UMBRAL_REVISIONES = 3;
export const UMBRAL_EDICIONES = 3;
export const UMBRAL_PEDIDOS = 3;
```

Extender `Estado` con `revisiones?: unknown[]; ediciones?: unknown[]; pedidos?: unknown[];` y `Perdidas` con `revisiones: number; ediciones: number; pedidos: number;`.

Reemplazar `contarPerdidas` y agregar `idsPerdidos`:

```ts
/**
 * Cómo se identifica un registro de cada colección de lista.
 *
 * Sin `Record<string, ...>` a propósito: con esa anotación `keyof` colapsa a
 * `string` y se pierde el chequeo de que la colección exista.
 */
const CLAVE_DE = {
  inventario: (r: any) => String(r?.num ?? ''),
  escaneos: (o: any) => String(o?.id ?? ''),
  tanques: (t: any) => String(t?.num ?? ''),
  revisiones: (r: any) => String(r?.num ?? '') + '|' + String(r?.campo ?? ''),
  ediciones: (e: any) => String(e?.num ?? '') + '|' + String(e?.campo ?? ''),
  pedidos: (p: any) => String(p?.id ?? ''),
};

export type ColeccionLista = keyof typeof CLAVE_DE;

/**
 * Los identificadores que estaban y ya no están.
 *
 * Contar longitudes era ciego al intercambio: un guardado que borra 3 órdenes y
 * agrega otras 3 daba cero y pasaba sin freno. Que es la forma exacta que tiene
 * la falla que este freno tiene que atajar.
 */
export function idsPerdidos(
  actual: Estado | undefined,
  nuevo: Estado | undefined,
  coleccion: ColeccionLista,
): string[] {
  const clave = CLAVE_DE[coleccion];
  const presentes = new Set(((nuevo?.[coleccion] as unknown[]) ?? []).map(clave));
  const faltan: string[] = [];
  for (const x of ((actual?.[coleccion] as unknown[]) ?? [])) {
    const k = clave(x);
    if (k && k !== '|' && !presentes.has(k)) faltan.push(k);
  }
  return faltan;
}

/** Cuánto se pierde al pasar del estado actual al nuevo. Crecer nunca es pérdida. */
export function contarPerdidas(actual: Estado | undefined, nuevo: Estado | undefined): Perdidas {
  const caida = (clave: ColeccionLista) => idsPerdidos(actual, nuevo, clave).length;

  return {
    celdas: contarBorrados(actual, nuevo, 'boxes'),
    inventario: caida('inventario'),
    escaneos: caida('escaneos'),
    tanques: caida('tanques'),
    palets: contarBorrados(actual, nuevo, 'palets'),
    revisiones: caida('revisiones'),
    ediciones: caida('ediciones'),
    pedidos: caida('pedidos'),
  };
}

export function superanUmbral(p: Perdidas): boolean {
  return (
    p.celdas >= UMBRAL_BORRADO ||
    p.inventario >= UMBRAL_INVENTARIO ||
    p.escaneos >= UMBRAL_ESCANEOS ||
    p.tanques >= UMBRAL_TANQUES ||
    p.palets >= UMBRAL_PALETS ||
    p.revisiones >= UMBRAL_REVISIONES ||
    p.ediciones >= UMBRAL_EDICIONES ||
    p.pedidos >= UMBRAL_PEDIDOS
  );
}
```

- [ ] **Step 4: El aviso al operario nombra las pérdidas nuevas**

En `public/barriles/index.html`, `msgPerdidas()` (:1052-1061), agregar después de la línea de `p.palets`:

```js
  if (p.revisiones) partes.push(p.revisiones + ' pendiente(s) de revisión');
  if (p.ediciones) partes.push(p.ediciones + ' corrección(es) a mano');
  if (p.pedidos) partes.push(p.pedidos + ' pedido(s) de rótulos');
```

Sin esto el servidor frena el borrado pero el cartel dice «datos ya cargados» sin nombrar qué.

- [ ] **Step 5: Correr los tests**

Run: `npm test`
Expected: PASS. Los tests viejos de `barriles.test.ts` tienen que seguir verdes: el conteo por identidad da el mismo resultado que el de longitudes en todos los casos donde solo se borra.

- [ ] **Step 6: Commit**

```bash
git add src/barriles/guardas.ts public/barriles/index.html test/barriles.test.ts
git commit -m "fix(barriles): el freno de borrado cuenta identidades, no longitudes

Restar longitudes es ciego al intercambio: borrar 3 ordenes y agregar 3
daba cero y pasaba sin frenar, que es la forma exacta que tiene esta
falla. Y revisiones, ediciones y pedidos no estaban en el freno: se
podian borrar todas, en cualquier cantidad, sin aviso."
```

---

### Task 8: El historial deja rastro de lo que se borró

`detalle` se inserta siempre como `'[]'` y `resumen()` solo anota variaciones netas. La investigación del 16/09 dependió de los snapshots de R2 para identificar una sola baja.

**Files:**
- Modify: `src/barriles/rutas.ts:139-151` (el INSERT al historial)
- Test: `test/barriles-guardado.test.ts` (se agrega un `describe`)

**Interfaces:**
- Consumes: `idsPerdidos` de Task 7.

- [ ] **Step 1: Agregar el test que falla**

En `test/barriles-guardado.test.ts`:

```ts
describe('el historial deja rastro de lo que desaparecio', () => {
  it('guarda los ids borrados en detalle, no un corchete vacio', async () => {
    // versionActual(), no 0: este describe comparte almacenamiento con los de
    // arriba, asi que el documento ya no esta en la version inicial.
    expect((await guardar(await versionActual(), conOrdenes('sobrevive', 'se-borra'))).status).toBe(200);
    expect((await guardar(await versionActual(), conOrdenes('sobrevive'))).status).toBe(200);

    const fila = await env.DB.prepare(
      `SELECT detalle FROM historial WHERE modulo = 'barriles'
        ORDER BY version DESC LIMIT 1`,
    ).first<{ detalle: string }>();

    expect(JSON.parse(fila!.detalle)).toEqual({ escaneos: ['se-borra'] });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/barriles-guardado.test.ts -t "corchete vacio"`
Expected: FAIL — `detalle` es `'[]'`.

- [ ] **Step 3: Calcular el detalle y guardarlo**

En `src/barriles/rutas.ts`, importar `idsPerdidos` desde `./guardas` junto a `contarPerdidas` y `superanUmbral`. Antes del INSERT al historial:

```ts
    // Qué desapareció exactamente. El resumen solo anota variaciones netas, así
    // que un intercambio (se va una orden, entra otra) se leía como "sin cambios".
    // La investigación del 16/09 tuvo que bajar snapshots de R2 para esto.
    const borrados: Record<string, string[]> = {};
    for (const coleccion of ['inventario', 'escaneos', 'tanques', 'revisiones', 'ediciones', 'pedidos'] as const) {
      const ids = idsPerdidos(doc.estado, nuevoEstado, coleccion);
      if (ids.length) borrados[coleccion] = ids;
    }
```

Y en el INSERT, reemplazar el literal `'[]'` por un parámetro `?` ligado a `JSON.stringify(borrados)`. **Cuidado con el orden de los `.bind()`**: `detalle` va entre `resumen` y `forzado`.

- [ ] **Step 4: Correr los tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/barriles/rutas.ts test/barriles-guardado.test.ts
git commit -m "feat(barriles): el historial anota que registros desaparecieron

detalle se insertaba siempre como '[]' y el resumen solo anota
variaciones netas, asi que un intercambio se leia como 'sin cambios'. La
investigacion del 16/09 tuvo que bajar snapshots de R2 para identificar
una sola baja."
```

---

### Task 9: Verificación de punta a punta

Los ocho cambios anteriores están testeados por separado. Falta ver la aplicación de verdad, en el navegador, haciendo lo que hace un operario.

**Files:** ninguno (verificación).

- [ ] **Step 1: Suite completa y typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: todo verde.

- [ ] **Step 2: Levantar la aplicación**

Run: `npm run dev:sin-ia` (queda en `http://localhost:8788`)

La D1 local arranca vacía y el importador está bloqueado por el freno de `--piso-la-web`. Cargá las filas necesarias por la interfaz.

- [ ] **Step 3: Reproducir el escenario que costó las dos órdenes**

En el navegador, sobre `/barriles/`:

1. Cargar una orden con el escáner **sin tocar ninguna celda del mapa**.
2. Verificar en la consola que `localStorage.getItem('mapaBarriles_pendiente_v1')` es `'1'` mientras el push está en vuelo, y `null` después del 200.
3. Con la orden ya subida, **recargar la página**. La orden tiene que seguir en el historial.
4. Cortar la red (DevTools → Network → Offline), cargar otra orden, **recargar la página**, volver a poner la red. La orden tiene que aparecer en el servidor, no desaparecer.

El paso 4 es el que fallaba en cada arranque.

- [ ] **Step 4: Anotar el resultado**

Si algo no se comporta como dice el paso 3, **no lo arregles sobre la marcha**: anotá qué pasó y pará. Un arreglo apresurado sobre un síntoma en un incidente de pérdida de datos es cómo se destruye la evidencia que queda.

---

## Lo que este plan NO hace

Queda para la Entrega 2, con su propio spec y plan:

- El portón único de escritura: que toda mutación pase por una función que postea y solo aplica a `estado` con el 200 en la mano.
- Los seis carteles verdes que confirman antes de hablar con el servidor: escáner (:4512), pincel de celdas (:2879), cámara de vasijas (:6016), palets (:5358), carga manual (:5578) e importación de inventario (:1792).
- Cortar la pantalla apenas se cae la señal (hoy no hay `navigator.onLine` ni `pagehide` ni `keepalive` en todo el archivo).
- Reconexión automática sin recargar la página.

**Después de esta entrega un operario todavía puede ver un cartel verde sobre algo que no subió.** Lo que ya no puede pasar es que ese dato se destruya solo.
