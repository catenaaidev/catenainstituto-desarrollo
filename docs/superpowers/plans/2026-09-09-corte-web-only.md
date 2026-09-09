# Corte a web-only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar la plataforma web de Cloudflare como única fuente de datos, apagando las tres apps locales sin perder nada y cerrando la vía que permitiría pisar la nube por accidente.

**Architecture:** No hay migración de datos ni port de código — ya se verificó que la nube no está atrás en ninguno de los tres módulos. El plan tiene una sola pieza de programación (un freno de confirmación en `scripts/importar.mjs`) y cinco tareas operativas reversibles: respaldar, guardar el último estado local como archivo muerto, probar Barriles desde un celular, matar los servidores y congelar los lanzadores. El congelamiento de Barriles está condicionado a que su prueba de humo pase; Prensas y Lotes no dependen de eso.

**Tech Stack:** Node 24 (ESM, `.mjs`), Vitest 3 con `@cloudflare/vitest-pool-workers`, Wrangler 4, Cloudflare D1, PowerShell 5.1 en Windows 11.

**Spec:** `docs/superpowers/specs/2026-09-09-corte-web-only-design.md`

## Global Constraints

- **Nada se borra.** Todo el congelamiento es por renombrado (`.bat` → `.bat.congelado`) y todo respaldo se conserva. El criterio es que cada paso sea reversible en diez segundos.
- **No se importa a la nube en ningún momento de este plan.** `importar.mjs` reemplaza el documento entero; la web es la fuente. La única excepción futura es la reconciliación del Excel de Lotes, documentada en la Tarea 1.
- **En Lotes, exportar ANTES de matar su servidor.** Está vivo (no es un zombi): al 2026-09-09 tenía latido a las 07:36 en el lock `servidor-activo-AGDLABORATORIOCIW25.json`. Matarlo primero pierde lo que tenga en memoria sin guardar.
- **Los PID se buscan por puerto, nunca se copian de este plan.** Los del spec (1244, 15448, 17500, 25816) son de la medición del 2026-09-09 y ya no serán válidos.
- **Versiones de referencia al momento del corte:** barriles `v2218`, lotes `v16`, prensas `v89`. Si el paso de verificación da otra cosa, hay que entender por qué antes de seguir.
- **`tsconfig.json` incluye solo `src/**/*.ts` y `test/**/*.ts`.** Un test en `.mjs` no lo ve `tsc --noEmit` pero sí lo corre Vitest. Eso es deliberado en la Tarea 1, no un descuido.
- **El despliegue corre en cada push a `main`**: `wrangler types` → `tsc --noEmit` → 167 tests → `wrangler deploy`. Nada se mergea a `main` con tests rotos.
- **Rutas absolutas de las apps locales** (tienen espacios; en PowerShell van siempre entre comillas dobles):
  - Barriles: `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\mapa de barriles\mapa-barriles`
  - Lotes: `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\Lotes`
  - Prensas: `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Archivos de Roy Urvieta - Año 2026\Registro de Lotes CIW 2026\prensas-app`

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `scripts/freno.mjs` | **Nuevo.** Una sola decisión pura: dado el vector de argumentos, ¿esta invocación puede pisar la nube? Sin `node:fs`, sin `node:process`, sin efectos — por eso es testeable dentro del runtime de Workers. |
| `test/freno.test.mjs` | **Nuevo.** Tests del freno. En `.mjs` a propósito (ver Global Constraints). |
| `scripts/importar.mjs` | **Modificar.** Consultar el freno inmediatamente después de parsear los argumentos, antes de leer archivos o generar SQL. |
| `DESPLIEGUE.md` | **Modificar.** Documentar el procedimiento de la reconciliación ocasional del Excel, que es el único caso legítimo para levantar el freno. |
| `CLAUDE.md` | **Nuevo.** Arquitectura, despliegue y trampas conocidas del repo, para no re-derivarlas en cada sesión. |
| `docs/corte/2026-09-09-estado-al-corte.md` | **Nuevo.** Registro de en qué versión quedó cada módulo el día del corte. Es el criterio de éxito 5 del spec. |

`scripts/freno.mjs` existe separado de `importar.mjs` por una razón concreta y no por gusto: `importar.mjs` importa `node:fs` y `node:child_process`, y los tests de este repo corren dentro del runtime de Workers, que no tiene disco. Una función pura en su propio archivo se puede testear; la misma lógica embebida en `importar.mjs` no.

---

## Task 1: El freno de la importación a la nube

Es la única tarea con código. Cierra el riesgo principal que identificó el spec: `importar.mjs --remote` hace `DELETE FROM documento` + INSERT sin preguntar, y ahora que la web es la fuente eso borra el trabajo del equipo.

No lo prohíbe: lo vuelve deliberado.

**Files:**
- Create: `scripts/freno.mjs`
- Create: `test/freno.test.mjs`
- Modify: `scripts/importar.mjs:15-17` (import) y `scripts/importar.mjs:57-60` (después de validar `--local`/`--remote`)
- Modify: `DESPLIEGUE.md` (sección nueva al final)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `BANDERA: string` — la constante `'--piso-la-web'`.
  - `decidirFreno(args: string[]): { permitido: boolean, motivo: string }` — `motivo` es `''` cuando `permitido` es `true`, y un texto listo para `console.error` cuando es `false`.

- [ ] **Step 1: Renombrar la rama, que ahora lleva código y no solo documentación**

```bash
cd C:\Users\Bmax\repos\catenainstitute
git branch -m docs/corte-web-only corte/web-only
git branch --show-current
```

Esperado: `corte/web-only`. La rama no está pusheada, así que el renombrado no afecta a nadie.

- [ ] **Step 2: Escribir el test que falla**

Crear `test/freno.test.mjs`:

```js
/**
 * El freno de la importación a la nube.
 *
 * Este test está en .mjs y no en .ts a propósito: `tsconfig.json` incluye solo
 * `src/**\/*.ts` y `test/**\/*.ts`, así que `tsc --noEmit` no intenta resolver
 * `scripts/freno.mjs` (no hay declaraciones para un .mjs y el typecheck
 * fallaría, frenando el despliegue). Vitest sí lo levanta. No lo "arregles"
 * pasándolo a .ts.
 */

import { describe, it, expect } from 'vitest';
import { decidirFreno, BANDERA } from '../scripts/freno.mjs';

describe('decidirFreno', () => {
  it('deja pasar una importación a la base local', () => {
    const r = decidirFreno(['--modulo', 'lotes', '--local', '--datos', 'x.json']);
    expect(r.permitido).toBe(true);
    expect(r.motivo).toBe('');
  });

  it('frena una importación a la nube sin la bandera', () => {
    const r = decidirFreno(['--modulo', 'lotes', '--remote', '--datos', 'x.json']);
    expect(r.permitido).toBe(false);
  });

  it('explica cómo seguir, nombrando la bandera', () => {
    const r = decidirFreno(['--modulo', 'lotes', '--remote', '--datos', 'x.json']);
    expect(r.motivo).toContain(BANDERA);
  });

  it('avisa que reemplaza el documento entero, no que fusiona', () => {
    const r = decidirFreno(['--modulo', 'prensas', '--remote', '--datos', 'x.json']);
    expect(r.motivo.toLowerCase()).toContain('reemplaza');
  });

  it('deja pasar la nube cuando la bandera está presente', () => {
    const r = decidirFreno(['--modulo', 'lotes', '--remote', BANDERA, '--datos', 'x.json']);
    expect(r.permitido).toBe(true);
    expect(r.motivo).toBe('');
  });

  it('no le molesta la bandera en una importación local', () => {
    const r = decidirFreno(['--modulo', 'lotes', '--local', BANDERA]);
    expect(r.permitido).toBe(true);
  });

  it('frena también si --remote viene después de otras banderas', () => {
    const r = decidirFreno(['--datos', 'x.json', '--modulo', 'barriles', '--remote']);
    expect(r.permitido).toBe(false);
  });
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

```bash
npx vitest run test/freno.test.mjs
```

Esperado: FALLA. El mensaje menciona que no se puede resolver `../scripts/freno.mjs` (el archivo todavía no existe).

- [ ] **Step 4: Escribir la implementación mínima**

Crear `scripts/freno.mjs`:

```js
/**
 * Freno de la importación a la nube.
 *
 * `importar.mjs` hace DELETE + INSERT: reemplaza el documento entero del
 * módulo, no fusiona. Eso era correcto durante la migración inicial, cuando lo
 * local era la fuente y la nube el destino vacío.
 *
 * Desde el corte a web-only (spec 2026-09-09) la fuente es la web. Una
 * importación a --remote borra lo que haya cargado el equipo desde entonces, y
 * está a un `npm run` de distancia.
 *
 * No se prohíbe: hay un caso legítimo (la reconciliación ocasional del Excel de
 * Lotes, documentada en DESPLIEGUE.md). Se exige decirlo en voz alta.
 *
 * Este módulo es puro a propósito —sin node:fs, sin node:process, sin
 * efectos— para poder testearlo dentro del runtime de Workers, que es donde
 * corren los tests de este repo y donde no hay disco.
 */

/** La bandera que hay que agregar para autorizar el reemplazo. */
export const BANDERA = '--piso-la-web';

/**
 * ¿Esta invocación puede escribir en la nube?
 *
 * @param {string[]} args Los argumentos de línea de comandos (sin node ni el script).
 * @returns {{permitido: boolean, motivo: string}} `motivo` va vacío si está permitido.
 */
export function decidirFreno(args) {
  const permitido = { permitido: true, motivo: '' };

  if (!args.includes('--remote')) return permitido;
  if (args.includes(BANDERA)) return permitido;

  const motivo = [
    '',
    '  FRENO: esta importación REEMPLAZA el documento entero del módulo en la nube.',
    '',
    '  No fusiona: hace DELETE y vuelve a insertar. Todo lo que el equipo haya',
    '  cargado en la web desde la última importación se pierde.',
    '',
    '  Desde el corte a web-only la fuente de datos es la web, no lo local.',
    '  Si igual es lo que querés (por ejemplo, la reconciliación del Excel de',
    '  Lotes), primero respaldá la nube y después agregá la bandera:',
    '',
    `      ${BANDERA}`,
    '',
    '  El procedimiento completo está en DESPLIEGUE.md.',
    '',
  ].join('\n');

  return { permitido: false, motivo };
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

```bash
npx vitest run test/freno.test.mjs
```

Esperado: PASA, 7 tests.

- [ ] **Step 6: Conectar el freno a `importar.mjs`**

En `scripts/importar.mjs`, agregar el import junto a los otros (después de la línea 17):

```js
import { decidirFreno } from './freno.mjs';
```

Y justo después del bloque que valida `--local`/`--remote` (líneas 57-60), antes de la validación de `--datos`:

```js
const freno = decidirFreno(args);
if (!freno.permitido) {
  console.error(freno.motivo);
  exit(1);
}
```

Va ahí y no más abajo por una razón: antes de leer el archivo de datos, antes de generar SQL y antes de tocar la red. El freno tiene que costar cero.

- [ ] **Step 7: Verificar el freno de punta a punta, sin tocar la nube**

```bash
node scripts/importar.mjs --modulo lotes --remote --datos datos-origen/no-existe.json
```

Esperado: imprime el texto del FRENO y sale con código 1. **No** dice "No encuentro el archivo de datos" — eso probaría que el freno quedó después de la validación de `--datos` en vez de antes.

Confirmar el código de salida:

```bash
echo $LASTEXITCODE
```

Esperado: `1`.

- [ ] **Step 8: Verificar que los scripts de npm siguen funcionando**

```bash
findstr /C:"importar:" package.json
```

Esperado: las tres líneas (`importar:prensas`, `importar:barriles`, `importar:lotes`) usan `--local`. El freno solo actúa sobre `--remote`, así que ninguna se rompe. Si alguna dijera `--remote`, hay que corregirla en este paso.

- [ ] **Step 9: Correr toda la batería y el typecheck**

```bash
npx wrangler types
npx tsc --noEmit
npm test
```

Esperado: typecheck limpio y los 167 tests previos más los 7 nuevos, todos en verde. Si `tsc` se queja de `scripts/freno.mjs`, el archivo quedó dentro de `include` — revisar `tsconfig.json`.

- [ ] **Step 10: Documentar el único caso legítimo en `DESPLIEGUE.md`**

Agregar al final de `DESPLIEGUE.md`:

```markdown
## La reconciliación ocasional del Excel de Lotes

Desde el corte a web-only la fuente de datos es la web. `importar.mjs` sigue
existiendo para un solo caso: cuando hay que reconciliar el Excel de Lotes,
que se usa poco y todavía no está integrado a la plataforma.

Es la **única** razón para levantar el freno. Los cuatro pasos, en orden:

1. Exportar de la web con el botón de Excel de Lotes (3 hojas: LOTES, ANALISIS,
   MOVIMIENTOS).
2. Reconciliar con los scripts que están en la carpeta local de Lotes
   (`motor_reconciliacion.py`, `reconciliar_excel.py`).
3. **Respaldar la nube antes de subir nada.** Es el rollback:

       npx wrangler d1 execute catenainstitute --remote --json --command "SELECT json FROM documento WHERE modulo='lotes'" > respaldo-nube-lotes-<fecha>.json

   El archivo es un array; la versión sale de
   `JSON.parse(d[0].results[0].json).version`.
4. Subir, diciendo en voz alta que se pisa la nube:

       node scripts/importar.mjs --modulo lotes --remote --piso-la-web --datos <archivo>

   Tiene que terminar con `✓ Importación verificada`. Si no lo dice, no seguir:
   el respaldo del paso 3 es el camino de vuelta.

Cuando el Excel se integre a la web, esta sección, los tres scripts de Python y
el freno de `scripts/freno.mjs` se borran.
```

- [ ] **Step 11: Commit**

```bash
git add scripts/freno.mjs test/freno.test.mjs scripts/importar.mjs DESPLIEGUE.md
git commit -m "feat: importar a la nube exige decirlo en voz alta"
```

Cuerpo del mensaje (el porqué, que es lo que no se ve en el diff):

```
importar.mjs reemplaza el documento entero del modulo: DELETE y vuelve a
insertar. Cuando lo local era la fuente eso era correcto. Ahora la fuente es
la web, asi que la misma invocacion borra lo que cargo el equipo, y estaba a
un npm run de distancia.

No se prohibe, porque hay un caso legitimo: la reconciliacion ocasional del
Excel de Lotes, ahora documentada en DESPLIEGUE.md. Se exige la bandera
--piso-la-web.

El freno vive en scripts/freno.mjs y no dentro de importar.mjs porque este
importa node:fs y node:child_process, y los tests corren en el runtime de
Workers, que no tiene disco. Una funcion pura se puede testear.
```

---

## Task 2: `CLAUDE.md` del repo

Sin esto, cada sesión futura vuelve a descubrir la arquitectura leyendo archivos — que es justamente el gasto que el corte busca eliminar.

**Files:**
- Create: `CLAUDE.md`

**Interfaces:**
- Consumes: la bandera `--piso-la-web` de la Tarea 1, que se documenta acá.
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Escribir `CLAUDE.md`**

```markdown
# Plataforma CIW (Catena Institute)

Un solo Worker de Cloudflare sirve el portal y las APIs de los tres módulos:
Prensas, Mapa de Barriles y Lotes. Reemplaza a los tres `servidor.py` que
corrían en PCs de la bodega.

- Producción: https://catenainstitute.besa-junin.workers.dev
- Login: Cloudflare Access (One-time PIN, pensado para pasar a Azure AD)
- Repo: github.com/lucs56/catenainstitute — **es público**, no commitear datos
  ni emails del personal

## Esta es la única fuente de datos

Las tres apps locales están congeladas desde el corte del 2026-09-09
(`docs/superpowers/specs/2026-09-09-corte-web-only-design.md`). Sus lanzadores
están renombrados a `.bat.congelado`.

**Un arreglo "para la web" se hace acá y solo acá.** Antes había que
commitearlo en dos repos porque `public/barriles/index.html` era una copia a
mano del `index.html` de la bodega; eso terminó.

**No corras `scripts/importar.mjs --remote`.** Reemplaza el documento entero
del módulo y borraría lo que cargó el equipo. Exige `--piso-la-web` justamente
para que no pase por inercia. El único caso legítimo está en `DESPLIEGUE.md`.

## Cómo está armado

- `src/index.ts` — ruteo, entrega de páginas e inyección de identidad
- `src/auth.ts` — identidad de Access + roles por módulo (tabla `perfiles`)
- `src/{prensas,barriles,lotes}/` — rutas y reglas de cada módulo
- `src/lotes/motores/` — los 8 motores portados de Python
- `public/` — las pantallas, servidas por el CDN; `public/shared/` es común
- `migrations/` — el esquema; `test/` — los tests

El dato de cada módulo es **un JSON entero en una fila** de la tabla
`documento`, con un contador `version`. Las tablas por fila son "Fase 3" y no
existen todavía: por eso dos personas no pueden editar el mismo módulo a la vez.

## Comandos

    npm test              # los tests (corren en el runtime real de Workers)
    npx tsc --noEmit      # typecheck
    npx wrangler types    # regenerar tipos tras tocar wrangler.jsonc
    npm run dev:sin-ia    # servidor local

## Trampas conocidas

- **`npm run dev` se cae.** El binding `env.AI` es remoto y el Worker publicado
  está detrás de Access, así que `wrangler dev` no lo resuelve. Usá
  `dev:sin-ia`, que es la misma config sin el bloque `"ai"`. **Si agregás un
  binding a `wrangler.jsonc`, agregalo también a `wrangler.dev.jsonc`.**
- **Para que las pantallas se entreguen en local** hace falta, una sola vez,
  aplicar las migraciones con `--local` y sembrar un perfil para el `DEV_EMAIL`
  de `.dev.vars`. Sin esa fila el Worker no encuentra rol y manda al portal.
- **`tsconfig.json` incluye solo `src/**\/*.ts` y `test/**\/*.ts`.**
  `test/freno.test.mjs` está en `.mjs` a propósito para quedar fuera del
  typecheck. No lo pases a `.ts`.
- **El despliegue es GitHub Actions en cada push a `main`**
  (`.github/workflows/desplegar.yml`): `wrangler types` → `tsc --noEmit` →
  tests → `wrangler deploy`. **No corre las migraciones**: eso es a mano con
  `npm run migrar:nube`.
- **La cola de pendientes de Barriles no distingue una sesión de Access vencida
  de un corte de red.** Access responde un redirect con HTML, no un 401.
  Problema conocido, sin resolver.
- **La pantalla de Barriles no tiene service worker ni manifest**, así que una
  recarga sin señal deja la pantalla en blanco. Relevante para la zona de la
  bodega sin Wi-Fi.
```

- [ ] **Step 2: Verificar que los comandos que documenta existen**

```bash
findstr /C:"dev:sin-ia" /C:"migrar:nube" /C:"tipos" package.json
```

Esperado: los tres aparecen. Si alguno no está, corregir `CLAUDE.md` — un `CLAUDE.md` que miente es peor que no tenerlo.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md, para no re-derivar la arquitectura cada sesion"
```

---

## Task 3: Respaldar la nube y guardar el último estado local

Todo lo de esta tarea es de solo lectura sobre los sistemas vivos: no apaga nada ni escribe en la nube. Es la red antes de los pasos irreversibles.

**Files:**
- Create: `respaldo-nube-barriles-2026-09-09-corte.json` (gitignorado)
- Create: `respaldo-nube-lotes-2026-09-09-corte.json` (gitignorado)
- Create: `respaldo-nube-prensas-2026-09-09-corte.json` (gitignorado)
- Create: `docs/corte/2026-09-09-estado-al-corte.md`

**Interfaces:**
- Consumes: nada.
- Produces: `docs/corte/2026-09-09-estado-al-corte.md` con las versiones registradas, que la Tarea 5 usa para confirmar que nada cambió mientras se apagaba.

- [ ] **Step 1: Registrar el estado de la nube**

```bash
npx wrangler d1 execute catenainstitute --remote --command "SELECT modulo, version, autor, guardado FROM documento ORDER BY modulo"
```

Esperado, según la medición del 2026-09-09:

| modulo | version | autor | guardado |
|---|---|---|---|
| barriles | 2218 | importacion | (vacío) |
| lotes | 16 | reconciliacion-excel | 2026-09-08 16:38:47 |
| prensas | 89 | Marcelo | 2026-09-04 12:18:55 |

**Si algún número es más alto, es buena noticia**: significa que alguien empezó
a usar la web. Anotar el valor real y seguir. Si alguno es más *bajo*, parar y
entender por qué antes de continuar.

- [ ] **Step 2: Respaldar los tres documentos**

Uno por módulo. Están gitignorados por `respaldo-nube-*.json`.

```bash
npx wrangler d1 execute catenainstitute --remote --json --command "SELECT json FROM documento WHERE modulo='barriles'" > respaldo-nube-barriles-2026-09-09-corte.json
npx wrangler d1 execute catenainstitute --remote --json --command "SELECT json FROM documento WHERE modulo='lotes'" > respaldo-nube-lotes-2026-09-09-corte.json
npx wrangler d1 execute catenainstitute --remote --json --command "SELECT json FROM documento WHERE modulo='prensas'" > respaldo-nube-prensas-2026-09-09-corte.json
```

- [ ] **Step 3: Verificar que los respaldos sirven, no solo que existen**

Un archivo de 0 bytes o con un error de wrangler adentro pasa desapercibido
hasta que hace falta. Comprobar que cada uno parsea y trae la versión esperada:

```powershell
foreach ($m in 'barriles','lotes','prensas') {
  $f = "respaldo-nube-$m-2026-09-09-corte.json"
  $d = Get-Content $f -Raw | ConvertFrom-Json
  $doc = $d[0].results[0].json | ConvertFrom-Json
  $v = if ($m -eq 'barriles') { $doc.version } else { $doc.meta.version }
  "{0,-10} {1,10} KB   version {2}" -f $m, [math]::Round((Get-Item $f).Length/1KB), $v
}
```

Esperado: los tres con tamaño mayor a cero y la versión del paso 1.

- [ ] **Step 4: Guardar el último estado local de Barriles**

Su servidor está vivo y responde por HTTP. **La verdad es el HTTP, no el
archivo `.db`** (leído con herramientas da un espejo viejo del sandbox).

```powershell
Invoke-WebRequest "http://localhost:8766/api/estado" -OutFile "docs\corte\ultimo-estado-local-barriles-2026-09-09.json"
(Get-Content "docs\corte\ultimo-estado-local-barriles-2026-09-09.json" -Raw | ConvertFrom-Json).version
```

Esperado: `2218`, igual que la nube. Si el puerto 8766 no responde, probar 8765;
si ninguno responde, el servidor ya está caído y este paso se salta anotándolo.

- [ ] **Step 5: Guardar el último estado local de Lotes — antes de matar nada**

```powershell
$origen = "C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\Lotes\datos.json"
Copy-Item $origen "docs\corte\ultimo-estado-local-lotes-2026-09-09.json"
(Get-Content "docs\corte\ultimo-estado-local-lotes-2026-09-09.json" -Raw | ConvertFrom-Json).meta
```

Esperado: `version 16`, `autor reconciliacion-excel`, `actualizado 2026-09-08 16:38:47`.

**Si `version` es mayor que 16, hay datos locales que la nube no tiene.** Parar
el plan y resolverlo antes de seguir: es el único escenario en que este corte
perdería información.

- [ ] **Step 6: Guardar el último estado local de Prensas**

```powershell
$origen = "C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Archivos de Roy Urvieta - Año 2026\Registro de Lotes CIW 2026\prensas-app\datos.json"
Copy-Item $origen "docs\corte\ultimo-estado-local-prensas-2026-09-09.json"
(Get-Content "docs\corte\ultimo-estado-local-prensas-2026-09-09.json" -Raw | ConvertFrom-Json).meta
```

Esperado: una `version` **menor o igual a 89**, porque la web va adelante en
este módulo (autor `Marcelo`). Si fuera mayor, aplica la misma regla del paso 5:
parar.

- [ ] **Step 7: Escribir el registro del corte**

Crear `docs/corte/2026-09-09-estado-al-corte.md`, reemplazando los valores entre
`<>` por los realmente observados:

```markdown
# Estado al corte · 2026-09-09

Registro de en qué quedó cada módulo el día en que la web pasó a ser la única
fuente. Es el criterio de éxito 5 del spec
`docs/superpowers/specs/2026-09-09-corte-web-only-design.md`.

## En la nube (tabla `documento` de D1)

| modulo | version | autor | guardado |
|---|---|---|---|
| barriles | <version> | <autor> | <guardado> |
| lotes | <version> | <autor> | <guardado> |
| prensas | <version> | <autor> | <guardado> |

## En local, al momento de apagar

| modulo | version | de dónde salió |
|---|---|---|
| barriles | <version> | `http://localhost:8766/api/estado` (server vivo) |
| lotes | <version> | `Lotes\datos.json` |
| prensas | <version> | `prensas-app\datos.json` |

## Archivos guardados

- Respaldos de la nube: `respaldo-nube-{barriles,lotes,prensas}-2026-09-09-corte.json`
  en la raíz del repo. **Gitignorados** por `respaldo-nube-*.json`: existen solo
  en esta máquina. Si hacen falta en otro lado, copiarlos a mano.
- Último estado local: `docs/corte/ultimo-estado-local-*-2026-09-09.json`.

## Lo que había que saber

- Ningún dato local era más nuevo que la nube. El corte no perdió información.
- `autor` mostraba que solo Prensas tenía uso real desde la web (`Marcelo`).
  Barriles decía `importacion` y Lotes `reconciliacion-excel`: los dos estaban
  al día porque los empujamos nosotros, no porque el equipo los usara. De ahí
  la prueba de humo de la Tarea 4.
```

- [ ] **Step 8: Confirmar que los respaldos no se van al repo, y commitear el registro**

```bash
git status --short
```

Esperado: los `respaldo-nube-*.json` **no aparecen** (los tapa `.gitignore`).
Si aparecen, parar: el repo es público.

Los `ultimo-estado-local-*.json` **sí** van a aparecer. Son datos de producción
y **no deben** commitearse en un repo público: agregarlos al `.gitignore`.

```bash
git status --short
git add .gitignore docs/corte/2026-09-09-estado-al-corte.md
git commit -m "docs: registro del estado de los tres modulos al corte"
```

Volver a correr `git status --short` después del `add` y confirmar que ningún
`.json` de datos quedó preparado para el commit.

---

## Task 4: Prueba de humo de Barriles desde un celular

**Esta tarea la ejecuta una persona con un celular en la bodega, no un agente.**

Es el gate del spec. Barriles nunca se usó desde la web (su `autor` es
`importacion`) y es el módulo con los dos problemas conocidos sin resolver: la
zona sin Wi-Fi y la cola de pendientes que confunde una sesión de Access vencida
con un corte de red. Se prueba **con lo local todavía disponible como red**.

**Files:**
- Modify: `docs/corte/2026-09-09-estado-al-corte.md` (anotar el resultado)

**Interfaces:**
- Consumes: `docs/corte/2026-09-09-estado-al-corte.md` de la Tarea 3.
- Produces: la decisión que gatea el congelamiento de Barriles en la Tarea 5.

- [ ] **Step 1: Confirmar que quien prueba tiene permisos**

```bash
npx wrangler d1 execute catenainstitute --remote --command "SELECT email, modulo, rol FROM perfiles WHERE modulo='barriles' ORDER BY email"
```

Esperado: la persona que va a probar aparece con rol `admin` o `editor`. Si no
está, darla de alta con el formato de `usuarios.ejemplo.sql` (el email tiene que
ser **exactamente** el de Office 365, en minúsculas) antes de seguir.

- [ ] **Step 2: Probar desde el celular, en la web**

En `https://catenainstitute.besa-junin.workers.dev/barriles`, con el celular del
equipo y **en la zona donde realmente se trabaja**:

1. Entrar (login de Access) y confirmar que el mapa carga.
2. Escanear un rótulo con el OCR.
3. Mover un barril y guardar.
4. Confirmar que el cambio se ve al recargar.

- [ ] **Step 3: Verificar que la escritura llegó a la nube**

```bash
npx wrangler d1 execute catenainstitute --remote --command "SELECT version, autor, guardado FROM documento WHERE modulo='barriles'"
```

Esperado: `version` **mayor a 2218** y `autor` con el nombre de la persona —
ya **no** `importacion`. Eso es la prueba de que el circuito completo funciona:
pantalla → API → D1.

- [ ] **Step 4: Anotar el resultado y decidir**

Agregar a `docs/corte/2026-09-09-estado-al-corte.md`:

```markdown
## Prueba de humo de Barriles (Tarea 4)

- Fecha y hora: <cuándo>
- Quién probó: <nombre> · <email de Office 365>
- Dónde: <sector de la bodega>
- Mapa carga: <sí/no>
- OCR del rótulo: <sí/no>
- Mover y guardar un barril: <sí/no>
- `documento.autor` después de guardar: <autor> · version <n>
- **Resultado: <PASA / NO PASA>**
- Observaciones: <lo que haya salido raro>
```

**La decisión que gatea la Tarea 5:**

- **PASA** → Barriles se congela junto con los otros dos.
- **NO PASA** → **Barriles no se congela.** Se anota qué falló, se arregla
  primero, y se repite esta tarea. Prensas y Lotes se congelan igual: no
  dependen de esto.

- [ ] **Step 5: Commit**

```bash
git add docs/corte/2026-09-09-estado-al-corte.md
git commit -m "docs: resultado de la prueba de humo de Barriles"
```

---

## Task 5: Apagar los servidores y congelar los lanzadores

El paso irreversible del plan — y aun así, reversible en diez segundos: todo es
renombrado, nada se borra.

**Files:**
- Modify: renombrado de 10 archivos en las tres carpetas locales (ver tabla)
- Modify: `docs/corte/2026-09-09-estado-al-corte.md` (anotar el apagado)

**Interfaces:**
- Consumes: la decisión de la Tarea 4 (gatea solo Barriles) y el registro de la Tarea 3.
- Produces: el sistema en su estado final; la Tarea 6 asume que esto ya pasó.

- [ ] **Step 1: Confirmar que las Tareas 3 y 4 están hechas**

```powershell
Get-ChildItem "docs\corte" | Select-Object Name, Length
Get-ChildItem "respaldo-nube-*-corte.json" | Select-Object Name, Length
```

Esperado: el registro del corte, los tres `ultimo-estado-local-*.json` y los
tres respaldos, **todos con tamaño mayor a cero**. Si falta alguno, volver a la
Tarea 3. No se apaga nada sin la red puesta.

- [ ] **Step 2: Encontrar los procesos por puerto — nunca por PID copiado**

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 8765,8766,8772,8787,8788 } |
  Select-Object LocalPort, OwningProcess |
  Sort-Object LocalPort |
  ForEach-Object {
    $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    "{0}  PID {1}  {2}" -f $_.LocalPort, $_.OwningProcess, $p.ProcessName
  }
```

Esperado, al 2026-09-09: 8765 y 8766 en un `python`, 8772 en otro `python`, 8787
y 8788 en dos `workerd`. Los PID serán distintos a los del spec.

- [ ] **Step 3: Matar los `wrangler dev` colgados**

Son de desarrollo, no tienen datos que perder. Van primero por eso.

```powershell
Get-Process workerd -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process workerd -ErrorAction SilentlyContinue
```

Esperado: la segunda línea no devuelve nada.

- [ ] **Step 4: Matar los servidores Python — recién ahora**

El estado de Lotes ya quedó guardado en la Tarea 3, paso 5. Este es el orden
que exige el spec: exportar primero, matar después.

```powershell
$pids = Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -in 8765,8766,8772 } |
  Select-Object -ExpandProperty OwningProcess -Unique
$pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 8765,8766,8772,8787,8788 }
```

Esperado: la última consulta no devuelve nada. Ningún puerto local escuchando.

- [ ] **Step 5: Congelar los lanzadores de Lotes y Prensas**

`Restaurar Datos.bat` **no se toca**: es la herramienta de emergencia y no
levanta servidor.

```powershell
$lotes = "C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\Lotes"
$prensas = "C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Archivos de Roy Urvieta - Año 2026\Registro de Lotes CIW 2026\prensas-app"

$aCongelar = @(
  "$lotes\Abrir Lotes.bat",
  "$lotes\Cerrar Lotes.bat",
  "$prensas\Abrir Prensas.bat",
  "$prensas\Cerrar Prensas.bat",
  "$prensas\supervisor.pyw"
)

foreach ($f in $aCongelar) {
  if (Test-Path $f) {
    Rename-Item $f "$(Split-Path $f -Leaf).congelado"
    "congelado: $(Split-Path $f -Leaf)"
  } else {
    "NO ESTABA: $f"
  }
}
```

Esperado: cinco líneas `congelado:`. Cualquier `NO ESTABA` hay que investigarlo
antes de seguir — puede significar que la ruta cambió o que otra persona ya lo
movió.

- [ ] **Step 6: Congelar los lanzadores de Barriles — solo si la Tarea 4 dio PASA**

**Si la prueba de humo no pasó, saltear este paso** y dejar anotado que Barriles
quedó sin congelar.

Son cuatro, e incluyen los dos instaladores: no están instalados hoy
(verificado: sin tareas programadas, sin carpeta de Inicio, sin claves en
`HKCU:\...\Run`), pero correrlos después del corte reviviría el problema.

```powershell
$barriles = "C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\mapa de barriles\mapa-barriles"

$aCongelar = @(
  "$barriles\Abrir Mapa de Barriles.bat",
  "$barriles\Iniciar servidor.bat",
  "$barriles\Arranque automatico (instalar).bat",
  "$barriles\Backup semanal (instalar).bat"
)

foreach ($f in $aCongelar) {
  if (Test-Path $f) {
    Rename-Item $f "$(Split-Path $f -Leaf).congelado"
    "congelado: $(Split-Path $f -Leaf)"
  } else {
    "NO ESTABA: $f"
  }
}
```

Esperado: cuatro líneas `congelado:`.

- [ ] **Step 7: Verificar que no quedó ningún arranque automático**

```powershell
Get-ScheduledTask -ErrorAction SilentlyContinue |
  Where-Object { $_.TaskName -match 'barril|mapa|prensa|lote|servidor|supervisor' } |
  Select-Object TaskName, State
Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup" -ErrorAction SilentlyContinue
(Get-ItemProperty "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue).PSObject.Properties |
  Where-Object { $_.Name -notmatch '^PS' } | Select-Object Name
```

Esperado: las tres consultas vacías. Si aparece algo, quitarlo — un lanzador
renombrado no frena una tarea programada que apunte directo a `python servidor.py`.

- [ ] **Step 8: Confirmar que la nube no cambió mientras se apagaba**

```bash
npx wrangler d1 execute catenainstitute --remote --command "SELECT modulo, version, autor, guardado FROM documento ORDER BY modulo"
```

Comparar con el registro de la Tarea 3. Barriles debería tener la versión que
dejó la prueba de humo; los otros dos, sin cambios. Cualquier diferencia
inesperada se anota.

- [ ] **Step 9: Anotar el apagado y commitear**

Agregar a `docs/corte/2026-09-09-estado-al-corte.md`:

```markdown
## Apagado (Tarea 5)

- Fecha y hora: <cuándo>
- Procesos terminados: <puertos y PID reales>
- Lanzadores congelados: <lista>
- Barriles congelado: <sí / no, porque la prueba de humo ...>
- Arranque automático: verificado sin tareas programadas, sin carpeta de Inicio
  y sin claves en `Run`
- Versiones en la nube después del apagado: <barriles/lotes/prensas>

### Cómo volver atrás

Renombrar los `.bat.congelado` quitándoles el sufijo. Los datos de la nube
están en `respaldo-nube-*-2026-09-09-corte.json` y el último estado local en
`docs/corte/ultimo-estado-local-*.json`.
```

```bash
git add docs/corte/2026-09-09-estado-al-corte.md
git commit -m "docs: apagado de los servidores locales y congelado de lanzadores"
```

---

## Task 6: Mudar el lugar de trabajo y la memoria del proyecto

Acá se materializa el ahorro que motivó todo. Hasta ahora las sesiones se abren
en `Escritorio\claude`, un repo con cinco proyectos y memoria que describe
flujos que ya no existen.

**Files:**
- Create: archivos de memoria en el directorio de memoria de `repos\catenainstitute`
- Modify: `MEMORY.md` de ese directorio
- Modify/Delete: los archivos de memoria de `Escritorio\claude` que quedaron obsoletos

**Interfaces:**
- Consumes: el estado final de la Tarea 5.
- Produces: nada; es la última tarea.

- [ ] **Step 1: Entender que el directorio de memoria cambia con el directorio de trabajo**

La memoria del proyecto vive en una carpeta derivada de la ruta de trabajo:

- Hoy: `C:\Users\Bmax\.claude\projects\C--Users-Bmax-OneDrive---BODEGAS-ESMERALDA-SA-Escritorio-claude\memory\`
- Al abrir en `repos\catenainstitute`: una carpeta **distinta**, derivada de esa
  ruta.

Es decir: **mudarse de directorio no lleva la memoria, la deja atrás.** Hay que
escribirla de nuevo en el destino. Confirmar el destino real:

```powershell
Get-ChildItem "C:\Users\Bmax\.claude\projects" -Directory | Select-Object Name
```

Buscar el que corresponda a `repos\catenainstitute` (aparece la primera vez que
se abre una sesión ahí; si no está, se crea escribiendo el archivo).

- [ ] **Step 2: Escribir la memoria del proyecto en el destino**

En el directorio de memoria de `repos\catenainstitute`, crear
`plataforma-corte-web-only.md`:

```markdown
---
name: plataforma-corte-web-only
description: "La web es la ÚNICA fuente desde el corte del 2026-09-09: las tres apps locales están congeladas y importar a la nube exige --piso-la-web"
metadata:
  type: project
---

Desde el **2026-09-09** la plataforma web es la única fuente de datos de
Prensas, Mapa de Barriles y Lotes. Las tres apps locales quedaron **congeladas**
(sus lanzadores renombrados a `.bat.congelado`) y sus servidores apagados. El
trabajo se hace en `C:\Users\Bmax\repos\catenainstitute` y se despliega solo.

- Producción: `https://catenainstitute.besa-junin.workers.dev`
- Spec del corte: `docs/superpowers/specs/2026-09-09-corte-web-only-design.md`
- Registro del día: `docs/corte/2026-09-09-estado-al-corte.md`

**Por qué importa:** ya no hay dos lados que sincronizar. Un arreglo se
commitea **una** vez, acá. Murió la invariante de las "12 inserciones / 9
borrados" entre los dos `index.html` de barriles, que se rompía callada y ya
revivió un bug.

**No corras `scripts/importar.mjs --remote`.** Reemplaza el documento entero
del módulo (DELETE + INSERT, no fusiona) y borraría lo que cargó el equipo.
Exige la bandera `--piso-la-web`. El único caso legítimo es la reconciliación
ocasional del Excel de Lotes, con el procedimiento en `DESPLIEGUE.md`.

**Lo que quedó abierto y no es olvido:** la zona de la bodega sin Wi-Fi (la
pantalla de barriles no tiene service worker, así que una recarga sin señal la
deja en blanco) y la cola de pendientes que no distingue una sesión de Access
vencida de un corte de red. Ver [[plataforma-web-catenainstitute]].
```

- [ ] **Step 3: Agregar el puntero en el `MEMORY.md` del destino**

Una línea, sin contenido:

```markdown
- [Corte a web-only](plataforma-corte-web-only.md) — desde el 2026-09-09 la web es la ÚNICA fuente; las locales están congeladas y importar exige --piso-la-web
```

- [ ] **Step 4: Corregir la memoria vieja, que ahora enseña a hacer lo incorrecto**

En `C:\Users\Bmax\.claude\projects\C--Users-Bmax-OneDrive---BODEGAS-ESMERALDA-SA-Escritorio-claude\memory\`, estos archivos describen procedimientos que ya no
aplican:

| Archivo | Qué pasó |
|---|---|
| `plataforma-web-catenainstitute.md` | Dice que "las apps locales siguen vivas como red de seguridad" y explica el ciclo respaldo/export/import como algo normal. Reescribir: apuntar al corte y marcar la importación como excepción. |
| `mapa-barriles.md`, `mapa-barriles-sandbox-y-carga-planilla.md`, `mapa-barriles-impresion-boxes.md`, `mapa-barriles-inventario-revisiones.md` | Describen el `servidor.py` local, `mapa.db` en LOCALAPPDATA y scripts contra la API local. El servidor ya no existe. Consolidar en **uno** que diga qué era y que quedó congelado. |
| `proyecto-lotes-app.md`, `proyecto-analisis-vinos.md` | Describen las apps locales como el trabajo en curso. Actualizar para que apunten a la web. |

Regla al reescribir: **no borrar el hecho de que existieron.** Si algo falla en
la web y hay que descongelar, esa historia es lo que permite entenderlo. Lo que
hay que quitar son las *instrucciones* de operarlas.

- [ ] **Step 5: Mergear la rama y desplegar**

```bash
git checkout main
git merge --no-ff corte/web-only -m "merge: la web queda como unica fuente de datos"
npm test
npx tsc --noEmit
```

Esperado: todo verde. Recién entonces:

```bash
git push origin main
```

El push dispara `.github/workflows/desplegar.yml`, que vuelve a correr
`wrangler types` → `tsc --noEmit` → tests y solo entonces publica.

- [ ] **Step 6: Verificar que el despliegue salió bien**

```bash
npx wrangler deployments list
```

Esperado: un despliegue nuevo, con fecha de hoy. Después, en el navegador,
entrar a los tres módulos con Ctrl+F5 y confirmar que cargan y guardan.

- [ ] **Step 7: Abrir la próxima sesión en el lugar nuevo**

De acá en adelante, las sesiones de Claude Code se abren en
`C:\Users\Bmax\repos\catenainstitute`. Ahí están el `CLAUDE.md` de la Tarea 2 y
la memoria de la Tarea 6.

Lo pendiente para la sesión siguiente, con el corte ya hecho:

1. La zona de la bodega sin Wi-Fi (service worker / cobertura).
2. La cola de pendientes vs. la sesión de Access vencida.
3. `docs/superpowers/specs/2026-09-04-conexion-entre-modulos-design.md` — el
   diseño aprobado que hace que los tres módulos compartan datos y no solo
   base. Con lo local apagado, "una sola fuente" pasa de "un solo lugar donde
   correr" a "un solo modelo de datos". Es el paso siguiente natural.

---

## Self-Review

**Cobertura del spec.** Los seis criterios de éxito tienen tarea: los
lanzadores y los procesos en la Tarea 5 (pasos 3-6), los tres módulos andando en
la Tarea 6 (paso 6), el freno de `importar.mjs` en la Tarea 1, `CLAUDE.md` y la
memoria en las Tareas 2 y 6, el registro de versiones en la Tarea 3 (paso 7), y
la prueba de humo con el `autor` de barriles en la Tarea 4 (paso 3). Los pasos 0
a 5 del procedimiento del spec están en las Tareas 3, 4 y 5; el Excel ocasional
en la Tarea 1 (paso 10); el ahorro de tokens en las Tareas 2 y 6.

**Consistencia de nombres.** `decidirFreno` y `BANDERA` se definen en la Tarea 1
paso 4 y se usan con esos mismos nombres en el test (paso 2) y en
`importar.mjs` (paso 6). El valor `'--piso-la-web'` es el mismo en el código, en
`DESPLIEGUE.md`, en `CLAUDE.md` y en la memoria.

**Tres cosas que este plan asume y conviene tener presentes:**

1. **La Tarea 4 no la puede hacer un agente.** Necesita una persona con un
   celular en la bodega. Si se ejecuta el plan con subagentes, ahí hay que
   parar y esperar.
2. **Los `respaldo-nube-*.json` están gitignorados**, así que viven solo en esta
   máquina. Si el rollback tiene que estar disponible en otro lugar, hay que
   copiarlos a mano — el plan no lo hace.
3. **La Tarea 6 paso 4 es la más fácil de dejar a medias**, porque son seis
   archivos de memoria y ninguno rompe nada si queda viejo. Pero son
   exactamente los que en la próxima sesión harían que un agente busque un
   `servidor.py` que ya no existe.
