# Lotes: carga de análisis, pestaña Análisis y contador del dashboard — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el laboratorio pegue los análisis en el orden de su planilla, revise la pestaña Análisis con las columnas que usa y el ancho que necesita, y vea en el dashboard cuántos análisis faltan.

**Architecture:** Todo vive en `public/lotes/`. La lógica pura sale a módulos importables desde los tests (`carga-cols.js`, y `anchos-cols.js` convertido en fábrica por tabla); las vistas quedan como capa de DOM. No se toca `src/`, ni D1, ni las migraciones.

**Tech Stack:** JavaScript ES modules sin build, vitest sobre `@cloudflare/vitest-pool-workers`, Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-09-14-lotes-analisis-y-carga-design.md`

## Global Constraints

- **Repo:** `C:\Users\Bmax\repos\catenainstitute`. No trabajar en el worktree de mapa-barriles ni en `Escritorio\claude`.
- **Nada de `src/`:** ningún task modifica el Worker, los motores, las migraciones ni `src/lotes/reporte.ts`.
- **Los tests corren dentro del runtime de Workers**, que **no tiene `document`**. Un módulo con tests no puede tocar el DOM al importarse: el DOM va debajo de la línea `de aca para abajo se toca el DOM`, dentro de funciones.
- **Comentarios en español sin tildes** en el código (`analisis`, `pestana`, `correccion`), como todo el módulo. Los textos que ve el usuario **sí** llevan tildes.
- **Suite completa:** `npm test` (222 tests al 2026-09-14). Un archivo suelto: `npx vitest run test/<archivo>`.
- **Typecheck:** `npx tsc --noEmit`.
- **Claude no puede ejecutar `wrangler`.** El deploy lo corre el usuario a mano. Ningún task lo intenta.
- **Claves canónicas de un análisis** (las únicas que se guardan): `lote`, `fecha_analisis`, `ph`, `av`, `gluc_fruc`, `azucar_reductor`, `malico`, `lactico`, `acidez_total`, `etanol`, `so2_libre`, `comentario`.

---

### Task 1: Módulo puro de columnas de carga

Saca de `vista-cargar.js` la lógica de "qué columna es cada posición del pegado" y "cómo se parsea una fila", que hoy está enredada con el DOM y sin tests. La regla nueva es **lista blanca**: un nombre desconocido (`vasija`, `año`, `-`, vacío) se saltea en vez de guardarse como campo inventado.

**Files:**
- Create: `public/lotes/js/carga-cols.js`
- Test: `test/lotes-carga-cols.test.mjs`

**Interfaces:**
- Consumes: nada (módulo hoja).
- Produces:
  - `ORDEN_PLANILLA: string` — el orden por defecto, una sola fuente de verdad.
  - `NUMERICAS: Set<string>` — claves que se parsean con `parseFloat`.
  - `parsearFecha(raw: string): string|null` — devuelve `yyyy-mm-dd` o `null`.
  - `planDeColumnas(texto: string): (string|null)[]` — una entrada por posición; `null` = se descarta.
  - `parsearFila(linea: string, plan: (string|null)[]): { campos: object, errores: string[] }`

- [ ] **Step 1: Escribir el test que falla**

Crear `test/lotes-carga-cols.test.mjs`:

```js
/* Tests del modulo de columnas de la pestana Cargar analisis.
 *
 * El modulo es puro (no toca el DOM), asi que se puede importar dentro del
 * runtime de Workers igual que anchos-cols.js y filtro-llenado.js.
 */
import { describe, it, expect } from 'vitest';
import { ORDEN_PLANILLA, parsearFecha, planDeColumnas,
         parsearFila } from '../public/lotes/js/carga-cols.js';

describe('parsearFecha', () => {
  it('acepta dd/mm/yyyy y lo pasa a ISO', () => {
    expect(parsearFecha('10/09/2026')).toBe('2026-09-10');
    expect(parsearFecha('1/9/2026')).toBe('2026-09-01');
  });

  it('acepta dd-mm-yyyy y yyyy-mm-dd', () => {
    expect(parsearFecha('10-09-2026')).toBe('2026-09-10');
    expect(parsearFecha('2026-09-10')).toBe('2026-09-10');
  });

  it('devuelve null para lo que no es una fecha', () => {
    for (const basura of ['', '   ', 'ayer', '32/01/2026', '10/09/26', null, undefined])
      expect(parsearFecha(basura)).toBe(null);
  });
});

describe('planDeColumnas', () => {
  it('resuelve los nombres conocidos a su clave canonica', () => {
    expect(planDeColumnas('lote, fecha, ph')).toEqual(['lote', 'fecha_analisis', 'ph']);
  });

  it('descarta los nombres que no son campos del analisis', () => {
    // La lista blanca es el corazon de esta tarea: 'vasija' y 'año' vienen en
    // la planilla para que las posiciones calcen, pero no se guardan.
    expect(planDeColumnas('lote, vasija, año, -, , fecha'))
      .toEqual(['lote', null, null, null, null, 'fecha_analisis']);
  });

  it('acepta alcohol como alias de etanol', () => {
    // Asi se llama la columna en la planilla del laboratorio.
    expect(planDeColumnas('alcohol')).toEqual(['etanol']);
    expect(planDeColumnas('etanol')).toEqual(['etanol']);
  });

  it('no distingue mayusculas ni espacios de sobra', () => {
    expect(planDeColumnas('  LOTE ,  Gluc_Fruc ')).toEqual(['lote', 'gluc_fruc']);
  });

  it('devuelve un plan vacio para un texto vacio', () => {
    expect(planDeColumnas('')).toEqual([]);
    expect(planDeColumnas(null)).toEqual([]);
  });
});

describe('parsearFila', () => {
  const plan = planDeColumnas(ORDEN_PLANILLA);

  /* La fila real que trajo el usuario, con sus 14 columnas separadas por tab y
   * sus tres huecos. Es el caso que justifica toda la tarea. */
  const FILA = '26194\t\t2026\t10/09/2026\t14,2\t3,6\t0,54\t3,6\t0,16\t\t4,44\t\t\t28';

  it('lee la fila de la planilla con el orden por defecto', () => {
    const { campos, errores } = parsearFila(FILA, plan);
    expect(errores).toEqual([]);
    expect(campos.lote).toBe('26194');
    expect(campos.fecha_analisis).toBe('2026-09-10');
    expect(campos.etanol).toBe(14.2);
    expect(campos.ph).toBe(3.6);
    expect(campos.av).toBe(0.54);
    expect(campos.gluc_fruc).toBe(3.6);
    expect(campos.malico).toBe(0.16);
    expect(campos.acidez_total).toBe(4.44);
    expect(campos.so2_libre).toBe(28);
  });

  it('no guarda las columnas descartadas', () => {
    const { campos } = parsearFila(FILA, plan);
    expect(campos).not.toHaveProperty('vasija');
    expect(campos).not.toHaveProperty('año');
    expect(campos).not.toHaveProperty('-');
  });

  it('deja en null la celda vacia, no en 0 ni en cadena vacia', () => {
    // Un 0 seria un dato MEDIDO: el laboratorio no midio lactico en esta fila.
    const { campos } = parsearFila(FILA, plan);
    expect(campos.lactico).toBe(null);
  });

  it('marca la fecha invalida como error', () => {
    const rota = FILA.replace('10/09/2026', 'ayer');
    expect(parsearFila(rota, plan).errores).toContain('fecha inválida');
  });

  it('marca el lote vacio como error', () => {
    const sinLote = FILA.replace('26194', '');
    expect(parsearFila(sinLote, plan).errores).toContain('lote vacío');
  });

  it('sigue leyendo el orden viejo, que alguien puede tener tipeado', () => {
    const viejo = planDeColumnas('lote, fecha, ph, av, gluc_fruc, malico, lactico, acidez_total, etanol, so2_libre');
    const { campos, errores } = parsearFila('26001\t10/09/2026\t3,22\t0,4\t1,1\t0,05\t0,9\t5,1\t13,8\t25', viejo);
    expect(errores).toEqual([]);
    expect(campos.ph).toBe(3.22);
    expect(campos.etanol).toBe(13.8);
  });

  it('usa la coma como separador cuando no hay ningun tab', () => {
    const p = planDeColumnas('lote, fecha, ph');
    expect(parsearFila('26001,10/09/2026,3.22', p).campos.ph).toBe(3.22);
  });

  it('deja en null un numero que no se puede leer, sin romper', () => {
    const p = planDeColumnas('lote, fecha, ph');
    expect(parsearFila('26001\t10/09/2026\tn/d', p).campos.ph).toBe(null);
  });

  it('sobrevive a una fila con menos celdas que el plan', () => {
    const { campos } = parsearFila('26194\t\t2026\t10/09/2026', plan);
    expect(campos.lote).toBe('26194');
    expect(campos.so2_libre).toBe(null);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run test/lotes-carga-cols.test.mjs
```

Esperado: FALLA. El error es de resolución de módulo — `Failed to load .../public/lotes/js/carga-cols.js` — porque el archivo todavía no existe.

- [ ] **Step 3: Escribir el módulo**

Crear `public/lotes/js/carga-cols.js`:

```js
/* ===== Lotes CIW — columnas de la pestana Cargar analisis =====
 *
 * Que columna del pegado es cada campo del analisis, y como se lee una fila
 * contra ese plan. El modulo es PURO a proposito: no toca el DOM, asi que se
 * importa desde los tests, que corren dentro del runtime de Workers (mismo
 * criterio que anchos-cols.js y filtro-llenado.js).
 *
 * LISTA BLANCA, NO CAMPOS LIBRES
 *
 * Antes, una columna con un nombre desconocido se guardaba tal cual como campo
 * del analisis. Con la planilla del laboratorio eso creaba analisis con
 * `vasija` y `año` colgando, que nadie lee y que igual viajan a D1 dentro del
 * JSON del documento. Ahora solo se guardan las claves de ALIAS: cualquier otro
 * nombre se lee para que las POSICIONES calcen y se descarta. Por eso el orden
 * por defecto nombra columnas que no existen ('vasija', 'año') y usa '-' para
 * las que no tienen nombre: son huecos declarados, no errores.
 */
'use strict';

/* El orden de la planilla del laboratorio, 14 columnas. Vive aca y no en el
 * HTML para que el value del input y el default del parser no se separen:
 * vista-cargar.js lo escribe en #cargarCols al arrancar. */
export const ORDEN_PLANILLA =
  'lote, vasija, año, fecha, etanol, ph, av, gluc_fruc, malico, lactico, acidez_total, -, -, so2_libre';

/* Nombre aceptado -> clave canonica del analisis. Todo lo que no este aca se
 * descarta. Las variantes existen porque la gente tipea el orden a mano:
 * 'alcohol' es como se llama la columna en la planilla, y 'gluc-fruc' con
 * guion es como sale de copiar el encabezado. */
const ALIAS = {
  lote: 'lote',
  fecha: 'fecha_analisis', fecha_analisis: 'fecha_analisis',
  ph: 'ph',
  av: 'av', acidez_volatil: 'av',
  gluc_fruc: 'gluc_fruc', 'gluc-fruc': 'gluc_fruc', glucfruc: 'gluc_fruc',
  azucar_reductor: 'azucar_reductor', 'az_reductor': 'azucar_reductor',
  malico: 'malico',
  lactico: 'lactico',
  acidez_total: 'acidez_total',
  etanol: 'etanol', alcohol: 'etanol',
  so2_libre: 'so2_libre', so2libre: 'so2_libre',
  comentario: 'comentario',
};

/* Claves que se parsean como numero. La fecha va aparte (parsearFecha) y lote y
 * comentario quedan como texto: un lote puede tener letras. */
export const NUMERICAS = new Set(['ph', 'av', 'gluc_fruc', 'azucar_reductor',
  'malico', 'lactico', 'acidez_total', 'etanol', 'so2_libre']);

/** Fecha en dd/mm/yyyy, dd-mm-yyyy o yyyy-mm-dd -> 'yyyy-mm-dd', o null.
 *  El null no es un detalle: es lo que hace que la fila se marque en rojo en la
 *  previsualizacion en vez de entrar con una fecha inventada. */
export function parsearFecha(raw){
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)){
    return isNaN(new Date(s + 'T00:00:00')) ? null : s;
  }
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  const iso = m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  const d = new Date(iso + 'T00:00:00');
  /* getUTCDate ademas de isNaN: el 32/01 y el 31/02 construyen una fecha
   * valida que se pasa de mes, y entrarian como dato bueno. */
  if (isNaN(d) || d.getUTCDate() !== Number(m[1])) return null;
  return iso;
}

/** El texto del campo "Orden de columnas" -> una entrada por POSICION.
 *  La entrada es la clave canonica, o null si esa posicion se descarta. */
export function planDeColumnas(texto){
  const s = String(texto ?? '').trim();
  if (!s) return [];
  return s.split(',').map(c => ALIAS[c.trim().toLowerCase()] ?? null);
}

/** Lee una linea del pegado contra el plan.
 *  Devuelve {campos, errores}. `campos` trae SOLO claves canonicas, listo para
 *  mezclarse en un registro de analisis. `errores` son los que se pueden ver
 *  sin conocer los datos; que el lote EXISTA lo valida vista-cargar.js, que es
 *  quien tiene DATOS(). */
export function parsearFila(linea, plan){
  /* Tab si lo hay, coma si no: es lo que sale de copiar de Excel contra lo que
   * sale de un CSV. */
  const sep = String(linea ?? '').includes('\t') ? '\t' : ',';
  const celdas = String(linea ?? '').split(sep);

  const campos = {};
  const errores = [];

  plan.forEach((k, i) => {
    if (!k) return;                       // posicion descartada
    const crudo = (celdas[i] ?? '').trim();

    if (k === 'fecha_analisis'){
      campos.fecha_analisis = parsearFecha(crudo);
      if (!campos.fecha_analisis) errores.push('fecha inválida');
      return;
    }
    if (NUMERICAS.has(k)){
      /* Coma decimal -> punto. Una celda vacia queda en null y NO en 0: un 0
       * seria un valor medido y arrastraria a los criterios y al motor. */
      const n = parseFloat(crudo.replace(',', '.'));
      campos[k] = (crudo === '' || isNaN(n)) ? null : n;
      return;
    }
    campos[k] = crudo === '' ? null : crudo;
  });

  if (!String(campos.lote ?? '').trim()) errores.push('lote vacío');

  return { campos, errores };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
npx vitest run test/lotes-carga-cols.test.mjs
```

Esperado: PASA, 20 tests.

- [ ] **Step 5: Correr la suite completa**

```bash
npm test
```

Esperado: todo verde. El módulo es nuevo y nadie lo importa todavía, así que no puede romper nada; esto confirma que el archivo se puede importar dentro del runtime de Workers.

- [ ] **Step 6: Commit**

```bash
git add public/lotes/js/carga-cols.js test/lotes-carga-cols.test.mjs
git commit -m "feat: modulo puro de columnas de carga, con lista blanca"
```

---

### Task 2: Cablear el pegado nuevo en la pestaña Cargar análisis

Reemplaza el parser interno de `vista-cargar.js` por el módulo del Task 1 y pone el orden de la planilla como default.

**Files:**
- Modify: `public/lotes/js/vista-cargar.js` (reemplaza `parsearFecha`, `parsearPegado`, `COLS_CARGAR_DEFAULT`, `CARGAR_NUMS`)
- Modify: `public/lotes/index.html:963-974` (texto de ayuda y `value` del input)

**Interfaces:**
- Consumes: `ORDEN_PLANILLA`, `planDeColumnas`, `parsearFila` de `./carga-cols.js`.
- Produces: `cargarPrevisualizar()`, `cargarConfirmar()`, `cargarLimpiar()`, `cargarResetCols()` — mismos nombres y misma exposición en `window` desde `app.js`; no cambia ninguna firma.

- [ ] **Step 1: Reemplazar el encabezado del módulo**

En `public/lotes/js/vista-cargar.js`, cambiar el bloque de imports y borrar `COLS_CARGAR_DEFAULT`, `CARGAR_NUMS` y `parsearFecha` (líneas 4 a 29), que ahora viven en `carga-cols.js`:

```js
import { $, esc, escA, DATOS, markDirty, registrarVista } from './nucleo.js';
import { activarGrilla } from './grilla.js';
import { ORDEN_PLANILLA, planDeColumnas, parsearFila } from './carga-cols.js';
```

- [ ] **Step 2: Reemplazar `parsearPegado`**

Reemplazar la función `parsearPegado` entera (líneas 32-72) por:

```js
/* --- parseo principal ---
 * El "que campo es cada posicion" y el "como se lee una celda" viven en
 * carga-cols.js, con tests. Aca queda lo que necesita DATOS(): validar que el
 * lote exista de verdad. */
function parsearPegado(texto){
  const plan = planDeColumnas($('cargarCols').value || ORDEN_PLANILLA);

  /* Las columnas que se van a MOSTRAR en la previsualizacion: solo las que se
   * guardan. Las descartadas (vasija, año, los huecos) no se listan a
   * proposito — asi se ve de un vistazo que entra y que no. */
  const colsMostrar = [...new Set(plan.filter(Boolean))];

  const lineas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
  const filas = [];

  for (const linea of lineas){
    const { campos, errores } = parsearFila(linea, plan);
    const obj = Object.assign({ _raw: linea, _errores: errores }, campos);

    /* Que el lote EXISTA no lo puede saber carga-cols.js: necesita DATOS(). */
    const loteStr = String(obj.lote ?? '').trim();
    if (loteStr && !DATOS().lotes.some(l => String(l.lote).trim() === loteStr))
      obj._errores.push('lote no existe');

    filas.push(obj);
  }
  return { colsMostrar, filas };
}
```

- [ ] **Step 3: Ajustar los consumidores de `parsearPegado`**

En `cargarPrevisualizar()`, la línea 98 desestructura `{ cols, filas }` y la 101 deriva `colsMostrar`. Reemplazar las dos por una:

```js
  const { colsMostrar, filas } = parsearPegado(texto);
```

(borrar la línea `const colsMostrar = cols.map(c => c === 'fecha' ? 'fecha_analisis' : c);`).

En `CARGAR_LABELS` (línea 75) agregar las claves que el orden nuevo puede mostrar y hoy faltan:

```js
const CARGAR_LABELS = {
  lote:'Lote', fecha_analisis:'Fecha', ph:'pH', av:'AV',
  gluc_fruc:'Gluc+Fruc', azucar_reductor:'Az. Reductor',
  malico:'Málico', lactico:'Láctico',
  acidez_total:'Acidez total', etanol:'Etanol', so2_libre:'SO₂ libre',
  comentario:'Comentario',
};
```

En `cargarResetCols()` (línea 187), usar la constante compartida:

```js
export function cargarResetCols(){
  $('cargarCols').value = ORDEN_PLANILLA;
}
```

- [ ] **Step 4: Poner el orden por defecto en el HTML**

En `public/lotes/index.html`, reemplazar el bloque de las líneas 963-974 por:

```html
      <p style="color:var(--muted);font-size:13px;margin:-6px 0 14px">
        Copiá las filas desde Excel (Ctrl+C) y pegá en el área de abajo. El separador puede ser tab (Excel por defecto) o coma (CSV).
        Los números con coma decimal se aceptan (ej: 3,22).
        El orden de abajo es el de la planilla del laboratorio: las columnas que no son campos de un análisis
        (<code>vasija</code>, <code>año</code>) y los huecos (<code>-</code>) están para que las posiciones calcen, pero no se guardan.
      </p>

      <!-- orden de columnas -->
      <div class="controls" style="margin-bottom:10px">
        <label style="font-size:13px;color:var(--muted);white-space:nowrap">Orden de columnas:</label>
        <input class="txt" id="cargarCols" style="flex:1;min-width:320px;font-size:12px;font-family:monospace"
          value="lote, vasija, año, fecha, etanol, ph, av, gluc_fruc, malico, lactico, acidez_total, -, -, so2_libre"
          placeholder="lote, fecha, ph, av, ...">
        <button class="btn" onclick="cargarResetCols()" title="Volver al orden de la planilla">Resetear</button>
      </div>
```

- [ ] **Step 5: Correr la suite y el typecheck**

```bash
npm test && npx tsc --noEmit
```

Esperado: todo verde.

- [ ] **Step 6: Verificar a ojo en el navegador**

Levantar el server (`preview_start` con la entrada `catenainstitute-dev`, o `npm run dev:sin-ia`) y en `http://localhost:8788/lotes/` correr, con `preview_eval` y **un paso corto por llamada** (los eval largos los bloquea el clasificador de permisos):

```js
document.querySelector('.tabs button[data-v="cargar"]').click()
```

```js
document.getElementById('cargarTexto').value = '26001\t\t2026\t10/09/2026\t14,2\t3,6\t0,54\t3,6\t0,16\t\t4,44\t\t\t28'; cargarPrevisualizar(); document.getElementById('cargarMsg').textContent
```

Esperado: `✓ 1 filas válidas, listas para agregar.` (26001 es uno de los 5 lotes sembrados en la D1 local).

```js
[...document.querySelectorAll('#tCargar thead th')].map(th => th.textContent)
```

Esperado: `["Lote","Fecha","Etanol","pH","AV","Gluc+Fruc","Málico","Láctico","Acidez total","SO₂ libre","Estado"]` — **sin** Vasija ni Año.

- [ ] **Step 7: Commit**

```bash
git add public/lotes/js/vista-cargar.js public/lotes/index.html
git commit -m "feat: el pegado usa el orden de la planilla y descarta lo que no es un campo"
```

---

### Task 3: Columnas de la pestaña Análisis

Etanol al cuarto lugar, fuera `mbk_a_agregar` y `ml_exactos`.

**Files:**
- Modify: `public/lotes/js/vista-analisis.js:16-39`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `COLS_ANALISIS` pasa de 17 a 15 entradas; `CAMPOS_CORRECCION` pasa a `{'ot_n','so2_deseado'}`. Ambas son internas al archivo.

- [ ] **Step 1: Reordenar y recortar `COLS_ANALISIS`**

Reemplazar el array de las líneas 16-34 por:

```js
const COLS_ANALISIS = [
  { k:'lote',          label:'Lote',          ro:true  },
  { k:'variedad',      label:'Variedad',       ro:true  },
  { k:'fecha_analisis',label:'Fecha',          ro:false },
  /* Etanol va antes que pH, no al final de la quimica: es el mismo orden en
   * que viene la planilla del laboratorio (ver ORDEN_PLANILLA en
   * carga-cols.js), asi que leer esta tabla y leer lo que se pego son el
   * mismo gesto. */
  { k:'etanol',        label:'Etanol',         num:true },
  { k:'ph',            label:'pH',             num:true },
  { k:'av',            label:'AV',             num:true },
  { k:'gluc_fruc',       label:'Gluc+Fruc',      num:true },
  { k:'azucar_reductor', label:'Az. Reductor',  num:true },
  { k:'malico',          label:'Málico',        num:true },
  { k:'lactico',       label:'Láctico',        num:true },
  { k:'acidez_total',  label:'Acidez total',   num:true },
  { k:'so2_libre',     label:'SO₂ libre',      num:true },
  { k:'comentario',    label:'Comentario',     ro:false },
  { k:'ot_n',            label:'OT',              ro:false },
  { k:'so2_deseado',     label:'SO2 deseado',     num:true },
];
```

- [ ] **Step 2: Achicar `CAMPOS_CORRECCION`**

Reemplazar la línea 39 por:

```js
/* mbk_a_agregar y ml_exactos SIGUEN existiendo en analisis.correccion y se
 * siguen viendo y editando en las pestanas SO2 y Orden de correccion: lo unico
 * que se saco es la columna de ESTA tabla. */
const CAMPOS_CORRECCION = new Set(['ot_n', 'so2_deseado']);
```

- [ ] **Step 3: Actualizar el comentario del encabezado**

En la línea 255-256 dice "COLS_ANALISIS ahora tiene 17 entradas (13 de quimica/comunes + 4 de correccion) en vez de 13". Reemplazar por:

```js
  /* encabezados: sin cambios de logica. COLS_ANALISIS tiene 15 entradas
   * (13 de quimica/comunes + 2 de correccion). */
```

- [ ] **Step 4: Verificar que no quedó ninguna referencia colgada**

```bash
grep -n "mbk_a_agregar\|ml_exactos" public/lotes/js/vista-analisis.js
```

Esperado: **sin resultados**.

```bash
grep -rln "mbk_a_agregar" public/lotes/js/
```

Esperado: `vista-so2.js` y `vista-orden-correccion.js` (siguen usándolo, y está bien).

- [ ] **Step 5: Correr la suite y el typecheck**

```bash
npm test && npx tsc --noEmit
```

Esperado: todo verde.

- [ ] **Step 6: Commit**

```bash
git add public/lotes/js/vista-analisis.js
git commit -m "feat: Analisis abre con Etanol y ya no arrastra MBK ni mL exactos"
```

---

### Task 4: Filtro de lote en cajitas

Un cuarto panel multi-select al lado de Variedad y Proyecto.

**Files:**
- Modify: `public/lotes/js/vista-analisis.js:5-6` (import), `:112` (sets), `:149-164` (descriptores)

**Interfaces:**
- Consumes: `matchValor`, `opcionesValores`, `initFiltrosMulti` de `./tabla.js`.
- Produces: nada hacia afuera. `filtAn` gana la clave `lote`.

- [ ] **Step 1: Sumar `matchValor` al import de `tabla.js`**

Reemplazar las líneas 5-6:

```js
import { toggleSort, escribirCelda, pasaMulti, opcionesValores, matchValor,
         initFiltrosMulti, limpiarFiltrosMulti } from './tabla.js';
```

- [ ] **Step 2: Sumar el Set del filtro**

Reemplazar la línea 112:

```js
const filtAn = { lote: new Set(), variedad: new Set(), proyecto: new Set() };
```

- [ ] **Step 3: Sumar el descriptor**

En `initFiltrosAn()`, insertar como **primer** elemento de `_descAn` (antes del de Variedad), para que el botón quede a la izquierda:

```js
  _descAn = [
    {
      label: 'Lote',
      set: filtAn.lote,
      /* Opciones sobre los ANALISIS, no sobre todos los lotes: el panel ofrece
       * solo lotes que tienen al menos un analisis cargado, mismo criterio que
       * Variedad. cmpValores ya ordena numerico cuando los valores son
       * numeros, asi que los lotes salen en orden. */
      opciones: () => opcionesValores(DATOS().analisis || [], a => String(a.lote ?? '')),
      match: matchValor(a => String(a.lote ?? '')),
    },
    {
      label: 'Variedad',
```

(el resto del array queda igual).

- [ ] **Step 4: Correr la suite y el typecheck**

```bash
npm test && npx tsc --noEmit
```

Esperado: todo verde.

- [ ] **Step 5: Verificar a ojo**

Con la D1 local sembrada (ver Task 2 Step 6, agregando al menos dos análisis de lotes distintos), en `preview_eval`:

```js
document.querySelector('.tabs button[data-v="analisis"]').click()
```

```js
[...document.querySelectorAll('#fltAnBar .mfilt-btn')].map(b => b.textContent)
```

Esperado: un array que empiece con el botón de Lote y siga con Variedad y Proyecto.

```js
document.querySelectorAll('#fltAnBar .mfilt')[0].querySelectorAll('.mfilt-opt input[type=checkbox]').length
```

Esperado: 1 (la casilla "Todas") + una por lote con análisis.

- [ ] **Step 6: Commit**

```bash
git add public/lotes/js/vista-analisis.js
git commit -m "feat: la pestana Analisis filtra por lote con casillas"
```

---

### Task 5: `anchos-cols.js` pasa a ser una fábrica por tabla

El módulo hoy sirve a una sola tabla: emite selectores `#tLotes` literales, guarda un solo mapa en un solo localStorage, asume el encabezado en `thead tr:nth-child(2)` y cuelga sus listeners de `document` dentro de `activarAnchos`. Este task lo convierte en fábrica **sin cambiar en nada el comportamiento de Lotes**.

El punto no cosmético: Análisis rehace su `<table>` en cada render, así que el guardrail `tabla._anchosWired` nunca se cumple y esos listeners de `document` se volverían a colgar en cada repintado. Por eso pasan a registrarse **una sola vez a nivel módulo**, despachando a la instancia dueña de la tabla del evento.

**Files:**
- Modify: `public/lotes/js/anchos-cols.js` (reescritura completa)
- Modify: `public/lotes/js/vista-lotes.js:11` (import) y `:601-614`
- Test: `test/lotes-anchos.test.mjs` (los casos de `cssDeAnchos` pasan a recibir el id)

**Interfaces:**
- Consumes: nada nuevo.
- Produces:
  - `cssDeAnchos(anchos: object, tablaId: string): string` — **cambia de firma**, ahora el id es obligatorio.
  - `crearAnchos({ tablaId: string, claveStorage: string, filaEncabezado: string }): { activar(tabla, onCambio), autoajustarTodas(), restablecer(), hay(): boolean }`
  - `MIN_ANCHO`, `MAX_ANCHO`, `normalizarAnchos`, `anchoAutoajustado` — sin cambios.
  - **Se van** los exports sueltos `activarAnchos`, `autoajustarTodas`, `restablecerAnchos`, `hayAnchos`: ahora son métodos de la instancia.

- [ ] **Step 1: Escribir los tests que fallan**

En `test/lotes-anchos.test.mjs`, reemplazar el bloque `describe('cssDeAnchos', ...)` entero (líneas 45-81) por:

```js
describe('cssDeAnchos', () => {
  it('no genera nada si no hay ningun ancho guardado', () => {
    expect(cssDeAnchos({}, 'tLotes')).toBe('');
    expect(cssDeAnchos(null, 'tLotes')).toBe('');
  });

  it('fija el ancho de la columna por las tres propiedades', () => {
    // width sola no alcanza en una tabla de layout automatico: el navegador la
    // trata como sugerencia y la estira si el contenido no entra.
    const css = cssDeAnchos({ vinedo: 210 }, 'tLotes');
    expect(css).toContain('#tLotes th[data-k="vinedo"]');
    expect(css).toContain('#tLotes td[data-k="vinedo"]');
    expect(css).toContain('width:210px');
    expect(css).toContain('min-width:210px');
    expect(css).toContain('max-width:210px');
  });

  it('scopea las reglas a la tabla que se le pide', () => {
    // Es lo que permite que Lotes y Analisis tengan anchos independientes: si
    // el selector fuera global, arrastrar 'lote' en una movería la otra.
    const css = cssDeAnchos({ etanol: 120 }, 'tAnalisis');
    expect(css).toContain('#tAnalisis th[data-k="etanol"]');
    expect(css).not.toContain('#tLotes');
  });

  it('libera el piso de 60px del input para que la columna pueda angostarse', () => {
    // td input.cell tiene min-width:60px en index.html; sin pisarlo una columna
    // no baja de ahi por mas que se arrastre el agarre.
    const css = cssDeAnchos({ ct: 50 }, 'tLotes');
    expect(css).toMatch(/#tLotes td\[data-k="ct"\][^{]*input\.cell/);
    expect(css).toContain('min-width:0');
  });

  it('genera una regla por columna', () => {
    const css = cssDeAnchos({ vinedo: 210, clon: 90 }, 'tLotes');
    expect(css).toContain('data-k="vinedo"');
    expect(css).toContain('data-k="clon"');
  });

  it('normaliza lo que recibe antes de escribir el CSS', () => {
    const css = cssDeAnchos({ vinedo: 9000, 'x"]{color:red}': 200 }, 'tLotes');
    expect(css).toContain(`width:${MAX_ANCHO}px`);
    expect(css).not.toContain('color:red');
  });

  it('no genera nada si no se le dice a que tabla', () => {
    // Sin id el selector saldria roto (#undefined). Mejor nada que basura.
    expect(cssDeAnchos({ vinedo: 210 }, '')).toBe('');
    expect(cssDeAnchos({ vinedo: 210 })).toBe('');
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run test/lotes-anchos.test.mjs
```

Esperado: FALLAN los dos casos nuevos — *scopea las reglas a la tabla que se le pide* (genera `#tLotes` en vez de `#tAnalisis`) y *no genera nada si no se le dice a que tabla* (genera reglas igual). Los demás pasan, porque hoy el segundo argumento se ignora.

- [ ] **Step 3: Reescribir `anchos-cols.js`**

Reemplazar el archivo entero por:

```js
/* ===== Lotes CIW — ancho de columnas arrastrable =====
 *
 * Arrastrar el borde DERECHO del encabezado cambia el ancho; doble clic ahi
 * mismo lo autoajusta al contenido, como en Excel. Los anchos son una
 * preferencia de pantalla de cada persona: viven en el localStorage, igual que
 * el colapsado de grupos (ver CLAVE_GRUPOS en vista-lotes.js). Guardarlos en
 * datos.json obligaria a apretar Guardar y le pisaria la vista a los demas.
 *
 * TRES DECISIONES QUE EXPLICAN TODO EL ARCHIVO
 *
 * 1) Los anchos se aplican como una REGLA CSS por columna, no como estilo en
 *    las celdas. Las vistas repintan la tabla entera con innerHTML en cada
 *    filtro, orden y edicion; un style inline en las th se borraria en el
 *    primer repintado. Una regla keyeada por [data-k] sobrevive sola y no hay
 *    que reaplicar nada despues de cada render.
 *
 * 2) El agarre esta a la DERECHA del encabezado porque la izquierda ya esta
 *    ocupada: los primeros 8px de cada th seleccionan la columna entera
 *    (grilla.js, "Encabezado: los primeros 8px toman la columna"), y el resto
 *    del th ordena. El borde derecho era el unico gesto libre.
 *
 * 3) El modulo es una FABRICA (crearAnchos) y no un singleton, porque lo usan
 *    dos pestanas con tablas distintas. Cada instancia tiene su mapa de anchos,
 *    su clave de localStorage y su <style>, asi que arrastrar 'lote' en Lotes
 *    no mueve nada en Analisis.
 *
 *    Pero los listeners de mousedown/dblclick/click NO son por instancia: van
 *    una sola vez a nivel modulo y despachan a la instancia dueña de la tabla
 *    del evento. Tiene que ser asi porque Analisis rehace su <table> entera en
 *    cada render (sec.innerHTML), asi que el guardrail tabla._anchosWired nunca
 *    se cumple: colgarlos dentro de activar() los acumularia en cada repintado
 *    y la fuga creceria toda la sesion.
 *
 * La parte de arriba del archivo es pura y tiene tests (test/lotes-anchos.test.mjs);
 * de crearAnchos() para abajo se toca el DOM. Importar el modulo no toca el
 * DOM: por eso los tests pueden correr dentro del runtime de Workers.
 */
'use strict';

/* Minimo: por debajo de 40px la columna queda ilegible Y sin superficie para
 * agarrar el borde y volver a agrandarla. Maximo: una columna mas ancha que eso
 * empuja todo lo demas fuera de la pantalla, que es el problema que este
 * subsistema viene a resolver. */
export const MIN_ANCHO = 40;
export const MAX_ANCHO = 600;

/* Las claves salen de las COLS_* de cada vista, pero el mapa se lee del
 * localStorage, que cualquiera puede editar a mano. Una clave con comillas o
 * llaves se colaria al CSS generado, asi que se aceptan solo nombres de
 * columna. */
const CLAVE_OK = /^[A-Za-z0-9_]+$/;

/** Mapa {columna: px} limpio: descarta la basura y acota los extremos. */
export function normalizarAnchos(obj){
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)){
    if (!CLAVE_OK.test(k)) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue;
    out[k] = Math.min(MAX_ANCHO, Math.max(MIN_ANCHO, Math.round(v)));
  }
  return out;
}

/** El CSS de los anchos guardados, scopeado a una tabla. Una regla por columna
 *  resizeada; las que nunca se tocaron no aparecen y las sigue midiendo el
 *  navegador.
 *
 *  `tablaId` es obligatorio: sin el, el selector saldria `#undefined` y las
 *  reglas no aplicarian a nada. Devolver '' es preferible a emitir basura. */
export function cssDeAnchos(anchos, tablaId){
  if (!tablaId || !CLAVE_OK.test(tablaId)) return '';
  const lim = normalizarAnchos(anchos);
  const partes = [];
  for (const [k, px] of Object.entries(lim)){
    /* Las tres propiedades y no solo width: en una tabla de layout automatico
     * width es una sugerencia que el navegador estira si el contenido no entra. */
    partes.push(`#${tablaId} th[data-k="${k}"],#${tablaId} td[data-k="${k}"]`
              + `{width:${px}px;min-width:${px}px;max-width:${px}px}`);
    /* td input.cell trae min-width:60px de index.html: sin pisarlo la columna
     * no baja de ahi por mas que se arrastre el agarre. */
    partes.push(`#${tablaId} td[data-k="${k}"] input.cell,`
              + `#${tablaId} td[data-k="${k}"] select.cell`
              + `{min-width:0;max-width:100%}`);
  }
  return partes.join('\n');
}

/** Ancho que hace entrar al texto mas largo de la columna (encabezado incluido).
 *  `medir` recibe un string y devuelve su ancho en px; se inyecta para que la
 *  funcion sea pura y testeable sin canvas. */
export function anchoAutoajustado(textos, medir, pad){
  let max = 0;
  for (const t of (textos || [])){
    if (typeof t !== 'string' || t === '') continue;
    const w = medir(t);
    if (w > max) max = w;
  }
  if (max === 0) return MIN_ANCHO;
  return Math.min(MAX_ANCHO, Math.max(MIN_ANCHO, Math.ceil(max + (pad || 0))));
}

/* ==================== de aca para abajo se toca el DOM ==================== */

/* Ancho de la franja del borde derecho que agarra la columna. 6px es el mismo
 * orden que los 8px del agarre de seleccion de la izquierda; mas que eso empieza
 * a comerse el clic de ordenar en las columnas angostas. */
const AGARRE = 6;
/* Padding a sumarle al texto medido en el autoajuste: 18px del padding de la
 * celda (7px 9px en la regla th,td de index.html) + 12px del padding del input
 * + 2px de su borde + 4px de aire. Si cambia el padding de las celdas hay que
 * cambiar este numero. */
const PAD_AUTOFIT = 36;

const acotar = px => Math.min(MAX_ANCHO, Math.max(MIN_ANCHO, Math.ceil(px)));

/* --- estado COMPARTIDO por todas las instancias ---
 * Un arrastre a la vez en todo el documento: el mouse es uno solo. */
const instancias = [];
let listenersPuestos = false;
let arrastre = null;        // {inst, th, x0, w0} mientras se arrastra
/* El th cuyo click de cierre hay que tragarse, o null. Es el th y no un
 * booleano a proposito: si el mouse se suelta fuera de la ventana el navegador
 * no manda ningun click, y un booleano quedaria armado comiendose el proximo
 * clic que haga la persona en cualquier lado. */
let thTragarClick = null;

let medidor = null;         // contexto 2D reusado por el autoajuste
let fuente = '';            // font del medidor, cacheada

/* --- medicion de texto ---
 * Con un canvas y no con un span de prueba: measureText no toca el DOM, asi que
 * autoajustar las 28 columnas de una no dispara 28 reflows. */
function anchoDeTexto(txt, negrita){
  if (!medidor){
    medidor = document.createElement('canvas').getContext('2d');
    /* La misma fuente de las celdas: font-size 13px de la regla `table` de
     * index.html y la familia que hereda del body. Se lee una sola vez:
     * getComputedStyle por cada celda serian miles de llamadas al autoajustar
     * las 28 columnas. */
    fuente = getComputedStyle(document.body).fontFamily;
  }
  medidor.font = `${negrita ? '600 ' : ''}13px ${fuente}`;
  return medidor.measureText(txt).width;
}

function enAgarre(th, e){
  const r = th.getBoundingClientRect();
  return (r.right - e.clientX) <= AGARRE && e.clientX <= r.right;
}

/** La instancia dueña de la tabla a la que pertenece este th, o null. */
function instanciaDeTh(th){
  const tabla = th.closest('table');
  if (!tabla || !tabla.id) return null;
  return instancias.find(i => i.tablaId === tabla.id) || null;
}

/* Los tres listeners de document, puestos UNA vez para todas las instancias.
 * En CAPTURA: la captura baja desde window, asi que estos handlers corren ANTES
 * del mousedown en captura de grilla.js (que selecciona) sin depender del orden
 * en que se cablearon los dos modulos. */
function ponerListenersDocumento(){
  if (listenersPuestos) return;
  listenersPuestos = true;

  document.addEventListener('mousedown', e => {
    const th = e.target.closest && e.target.closest('thead th[data-k]');
    if (!th || !enAgarre(th, e)) return;
    const inst = instanciaDeTh(th);
    if (!inst) return;
    e.preventDefault();
    e.stopPropagation();     // que la grilla no seleccione la columna
    empezarArrastre(inst, th, e.clientX);
  }, true);

  document.addEventListener('dblclick', e => {
    const th = e.target.closest && e.target.closest('thead th[data-k]');
    if (!th || !enAgarre(th, e)) return;
    const inst = instanciaDeTh(th);
    if (!inst) return;
    e.preventDefault();
    e.stopPropagation();
    if (inst.autoajustarTh(th)){ inst.guardar(); inst.aplicar(); }
  }, true);

  /* Arrastrar el borde no tiene que ordenar la columna. El onclick de ordenar
   * lo pone el render en el th, asi que hay que matar el click en captura antes
   * de que llegue. Se desarma siempre, se traga solo si el click es el de la
   * columna que se acaba de arrastrar: un click en otro lado significa que el
   * del arrastre nunca llego y no hay que comerselo. */
  document.addEventListener('click', e => {
    const objetivo = thTragarClick;
    if (!objetivo) return;
    thTragarClick = null;
    if (!e.target.closest || e.target.closest('th[data-k]') !== objetivo) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
}

function empezarArrastre(inst, th, x0){
  const tabla = th.closest('table');
  arrastre = { inst, th, x0, w0: th.getBoundingClientRect().width };
  thTragarClick = null;      // por si el arrastre anterior dejo uno pendiente
  /* La misma clase que usa la grilla para que el navegador no seleccione texto
   * mientras se arrastra. */
  tabla.classList.add('garrastrando');
  th.classList.add('ganchodrag');
  document.body.style.cursor = 'col-resize';

  const mover = ev => {
    const px = Math.min(MAX_ANCHO, Math.max(MIN_ANCHO,
      Math.round(arrastre.w0 + (ev.clientX - arrastre.x0))));
    arrastre.inst.anchos[arrastre.th.dataset.k] = px;
    arrastre.inst.aplicar();
  };
  const soltar = () => {
    document.removeEventListener('mousemove', mover);
    document.removeEventListener('mouseup', soltar);
    tabla.classList.remove('garrastrando');
    document.body.style.cursor = '';
    arrastre.th.classList.remove('ganchodrag');
    arrastre.th.style.cursor = '';
    thTragarClick = arrastre.th;   // el click que sigue al mouseup no ordena
    const inst = arrastre.inst;
    arrastre = null;
    inst.guardar();
  };
  document.addEventListener('mousemove', mover);
  document.addEventListener('mouseup', soltar);
}

/** Crea el manejador de anchos de UNA tabla.
 *
 *  @param tablaId         el id de la <table> (sin '#')
 *  @param claveStorage    la clave de localStorage donde guarda sus anchos
 *  @param filaEncabezado  selector de la fila de th a recorrer al autoajustar.
 *                         Lotes tiene encabezado de dos filas (bandas + columnas)
 *                         y Analisis de una sola.
 */
export function crearAnchos({ tablaId, claveStorage, filaEncabezado }){
  const inst = {
    tablaId,
    anchos: {},       // {columna: px} vigente
    tabla: null,      // la <table> del ultimo activar(); Analisis la recrea
    styleTag: null,
    onCambio: null,
  };

  inst.leer = function(){
    /* Mismo try/catch que usuarioActual() en nucleo.js: si el navegador bloquea
     * el storage la pestana funciona igual y lo unico que se pierde es la
     * memoria de la preferencia. */
    try {
      inst.anchos = normalizarAnchos(JSON.parse(localStorage.getItem(claveStorage) || 'null'));
    } catch(e){
      inst.anchos = {};
    }
  };

  inst.guardar = function(){
    try {
      if (Object.keys(inst.anchos).length) localStorage.setItem(claveStorage, JSON.stringify(inst.anchos));
      else localStorage.removeItem(claveStorage);
    } catch(e){}
  };

  /** Reescribe el <style> y avisa a la vista para que muestre u oculte el boton
   *  de restablecer. No repinta la tabla: el CSS ya alcanza. */
  inst.aplicar = function(){
    if (!inst.styleTag){
      inst.styleTag = document.createElement('style');
      inst.styleTag.id = 'anchos_' + tablaId;
      /* Al final del head: asi le gana por orden a la regla
       * #tLotes td[data-k="id_texto"] input.cell{max-width:180px} de index.html,
       * que tiene la misma especificidad. */
      document.head.appendChild(inst.styleTag);
    }
    inst.styleTag.textContent = cssDeAnchos(inst.anchos, tablaId);
    if (typeof inst.onCambio === 'function') inst.onCambio(inst.hay());
  };

  /** Los textos de una columna: el label del encabezado y el valor de cada fila.
   *  Las columnas ro son <td> de texto plano y las editables tienen un input; las
   *  dos ramas hacen falta. */
  function textosDeColumna(k){
    const textos = [];
    for (const td of inst.tabla.querySelectorAll(`tbody td[data-k="${CSS.escape(k)}"]`)){
      const ctrl = td.querySelector('input.cell, select.cell');
      textos.push(ctrl ? (ctrl.value || '') : (td.textContent || '').trim());
    }
    return textos;
  }

  /** Calcula y guarda el ancho de una columna. Devuelve false si la columna no
   *  se puede medir: Etapa y Avance las pinta celdasEstado() sin data-k en las
   *  <td> (no son campos del lote), asi que no hay contenido que medir y
   *  ajustarlas al label solo las dejaria mas angostas que el chip y la barra
   *  que muestran. */
  inst.autoajustarTh = function(th){
    if (!inst.tabla) return false;
    const k = th.dataset.k;
    const textos = textosDeColumna(k);
    if (!textos.length && inst.tabla.tBodies[0] && inst.tabla.tBodies[0].rows.length) return false;

    const porCeldas = anchoAutoajustado(textos, t => anchoDeTexto(t, false), PAD_AUTOFIT);
    /* El encabezado tambien tiene que entrar. Va medido en negrita (las th son
     * font-weight:600) y con 14px extra para la flecha de orden, que aparece en
     * cuanto alguien hace clic en la columna. El label viene sin la flecha, que
     * es un <span> aparte. */
    const label = (th.textContent || '').replace(/[▲▼]/g, '').trim();
    const porLabel = acotar(anchoDeTexto(label, true) + 14 + 18);

    inst.anchos[k] = Math.max(porCeldas, porLabel);
    return true;
  };

  /** Autoajusta de una todas las columnas visibles de la tabla. */
  inst.autoajustarTodas = function(){
    if (!inst.tabla) return;
    for (const th of inst.tabla.querySelectorAll(`${filaEncabezado} th[data-k]`))
      inst.autoajustarTh(th);
    inst.guardar();
    inst.aplicar();
  };

  /** true si la persona toco al menos un ancho. */
  inst.hay = function(){ return Object.keys(inst.anchos).length > 0; };

  /** Vuelve a dejar que el navegador mida las columnas. */
  inst.restablecer = function(){
    inst.anchos = {};
    inst.guardar();
    inst.aplicar();
  };

  /** Engancha el redimensionado en la tabla. Idempotente por tabla: las vistas
   *  la llaman en cada repintado, igual que a activarGrilla. Analisis pasa una
   *  <table> NUEVA en cada render (sec.innerHTML la recrea) y eso esta bien: lo
   *  unico que se cuelga por tabla es el mousemove del cursor, y la tabla vieja
   *  se va con su listener. */
  inst.activar = function(tabla, onCambio){
    inst.tabla = tabla;
    if (onCambio) inst.onCambio = onCambio;

    ponerListenersDocumento();
    if (!instancias.includes(inst)) instancias.push(inst);

    if (tabla._anchosWired){ inst.aplicar(); return; }
    tabla._anchosWired = true;

    inst.leer();
    inst.aplicar();

    /* Cursor col-resize solo cuando el mouse esta sobre la franja del agarre. No
     * se puede hacer con CSS: no hay selector para "los ultimos 6px". */
    tabla.addEventListener('mousemove', e => {
      const th = e.target.closest && e.target.closest('th[data-k]');
      if (!th || arrastre) return;
      th.style.cursor = enAgarre(th, e) ? 'col-resize' : '';
    });
  };

  return inst;
}
```

- [ ] **Step 4: Correr el test de anchos**

```bash
npx vitest run test/lotes-anchos.test.mjs
```

Esperado: PASA, incluidos los dos casos nuevos.

- [ ] **Step 5: Adaptar `vista-lotes.js` a la fábrica**

Reemplazar el import de la línea 11:

```js
import { crearAnchos } from './anchos-cols.js';
```

Agregar, debajo de los imports:

```js
/* La clave de storage es la de siempre (lotes_cols_ancho): respeta los anchos
 * que la gente ya tiene guardados. El encabezado de Lotes son DOS filas
 * (bandas de grupo + columnas), y la de columnas es la segunda. */
const anchosLotes = crearAnchos({
  tablaId: 'tLotes',
  claveStorage: 'lotes_cols_ancho',
  filaEncabezado: 'thead tr:nth-child(2)',
});
```

En la línea 604, cambiar **solo el receptor** de la llamada (el comentario de 601-603 y el callback quedan tal cual):

```js
  /* Anchos de columna. Tambien idempotente: los anchos se aplican como CSS por
     [data-k], asi que este innerHTML no los borro y no hay nada que reponer en
     las celdas nuevas. */
  anchosLotes.activar(t, hay => {
    const b = $('btnResetAnchos');
    if (b) b.style.display = hay ? '' : 'none';
  });
```

Reemplazar las dos funciones de las líneas 613-614:

```js
export function ajustarAnchosLotes(){ anchosLotes.autoajustarTodas(); }
export function resetAnchosLotes(){ anchosLotes.restablecer(); }
```

> Ojo con `ajustarAnchosLotes`: hoy le pasa la tabla (`autoajustarTodas($('tLotes'))`) y ahora **no lleva argumento** — la instancia se acuerda de su tabla desde el último `activar()`.

- [ ] **Step 6: Verificar que no quedó ninguna referencia al API viejo**

```bash
grep -rn "activarAnchos\|restablecerAnchos\|hayAnchos\|autoajustarTodas" public/lotes/
```

Esperado: solo las líneas de `anchos-cols.js` que definen `inst.autoajustarTodas` y la llamada de `vista-lotes.js` a `anchosLotes.autoajustarTodas()`. **Ninguna** referencia a `activarAnchos`, `restablecerAnchos` ni `hayAnchos` sueltos.

- [ ] **Step 7: Correr la suite y el typecheck**

```bash
npm test && npx tsc --noEmit
```

Esperado: todo verde.

- [ ] **Step 8: Verificar a ojo que Lotes no se rompió**

Esto es lo más importante del task: Lotes es la pantalla principal. En `preview_eval`, un paso por llamada:

```js
document.querySelector('.tabs button[data-v="lotes"]').click()
```

```js
const th=[...document.querySelectorAll('#tLotes thead tr:nth-child(2) th[data-k]')][1]; const r=th.getBoundingClientRect(); th.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:r.right-2,clientY:r.top+5})); document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:r.right+60,clientY:r.top+5})); document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); Math.round(th.getBoundingClientRect().width)
```

Esperado: un número **mayor** que el ancho original de esa columna (unos 60px más).

```js
document.getElementById('anchos_tLotes').textContent.includes('#tLotes')
```

Esperado: `true`.

```js
JSON.parse(localStorage.getItem('lotes_cols_ancho') || '{}')
```

Esperado: un objeto con la columna que se arrastró.

```js
document.getElementById('btnResetAnchos').click(); localStorage.getItem('lotes_cols_ancho')
```

Esperado: `null`.

- [ ] **Step 9: Commit**

```bash
git add public/lotes/js/anchos-cols.js public/lotes/js/vista-lotes.js test/lotes-anchos.test.mjs
git commit -m "refactor: los anchos de columna son una fabrica por tabla"
```

---

### Task 6: La pestaña Análisis se ensancha y sus columnas se arrastran

Usa la fábrica del Task 5. Son las dos partes del punto 4 del spec: ancho de ventana (CSS) y columnas arrastrables (fábrica + botones).

**Files:**
- Modify: `public/lotes/index.html:95` (ancho de ventana) y `:248-254` (CSS del agarre)
- Modify: `public/lotes/js/vista-analisis.js` (import, instancia, toolbar, activación)

**Interfaces:**
- Consumes: `crearAnchos` de `./anchos-cols.js` (Task 5).
- Produces: nada hacia afuera. Los botones viven en la toolbar que arma `renderAnalisis`, así que **no** se cablean en `app.js` (a diferencia de Lotes, cuya toolbar está fija en el HTML).

- [ ] **Step 1: Ancho de ventana**

En `public/lotes/index.html`, reemplazar la línea 95 (la regla `#tab-lotes`) por:

```css
  /* Lotes son 28 columnas y Analisis 15: las dos se llevan todo el ancho de la
   * ventana. Los -10px se comen 10 de los 24px de padding lateral de main y
   * dejan 14px de aire a cada lado. Gana ~340px sobre el resto de las pestanas,
   * que es media docena de columnas mas a la vista. */
  #tab-lotes,#tab-analisis{max-width:none;margin-left:-10px;margin-right:-10px}
```

- [ ] **Step 2: CSS del agarre para la tabla de Análisis**

En `public/lotes/index.html`, reemplazar las líneas 248-254 por:

```css
  /* Lotes tiene encabezado de dos filas y la de columnas es la segunda;
     Analisis tiene una sola. */
  #tLotes thead tr:nth-child(2) th[data-k]::after,
  #tAnalisis thead th[data-k]::after{content:'';position:absolute;
    right:0;top:22%;bottom:22%;width:3px;border-radius:2px;background:transparent}
  #tLotes thead tr:nth-child(2) th[data-k]:hover::after,
  #tAnalisis thead th[data-k]:hover::after{background:var(--line)}
  /* Mientras se arrastra, no seleccionar texto del navegador */
  table.garrastrando{user-select:none}
  /* La columna que se esta arrastrando, marcada mientras dura el gesto */
  #tLotes th.ganchodrag::after,
  #tAnalisis th.ganchodrag::after{background:var(--accent) !important}
```

- [ ] **Step 3: Crear la instancia en `vista-analisis.js`**

Agregar al bloque de imports:

```js
import { crearAnchos } from './anchos-cols.js';
```

Y debajo de la declaración de `_fltAnLlenado` (línea 120):

```js
/* Anchos de columna propios: clave de storage distinta de la de Lotes, asi que
 * arrastrar 'lote' en una pestana no mueve la otra. El encabezado de esta tabla
 * es de UNA sola fila (Lotes tiene dos por las bandas de grupo). */
const anchosAnalisis = crearAnchos({
  tablaId: 'tAnalisis',
  claveStorage: 'analisis_cols_ancho',
  filaEncabezado: 'thead tr',
});
```

- [ ] **Step 4: Sumar los dos botones a la toolbar**

En el template de `renderAnalisis`, reemplazar la línea del botón de limpiar filtros por:

```html
  <button class="btn" id="btnLimpiarFltAn">🧹 Limpiar filtros</button>
  <button class="btn" id="btnAjustarAnchosAn"
    title="Ajustar el ancho de todas las columnas a su contenido. También se puede arrastrar el borde derecho de cada encabezado, o hacerle doble clic.">↔ Ajustar anchos</button>
  <button class="btn" id="btnResetAnchosAn" style="display:none"
    title="Volver al ancho automático de las columnas">↩ Anchos originales</button>
  <span class="tag" id="analisisCount"></span>
```

- [ ] **Step 5: Activar los anchos y cablear los botones**

Al final de `renderAnalisis`, justo después del bloque `activarGrilla(t, {...})`, agregar:

```js
  /* Anchos de columna. La toolbar se rehace en cada render (sec.innerHTML), asi
   * que los botones se vuelven a cablear cada vez; la instancia y los anchos
   * guardados son los mismos siempre. El boton de restablecer solo aparece
   * cuando hay algo que restablecer, igual que en Lotes. */
  anchosAnalisis.activar(t, hay => {
    const b = $('btnResetAnchosAn');
    if (b) b.style.display = hay ? '' : 'none';
  });

  const btnAjAn = $('btnAjustarAnchosAn');
  if (btnAjAn) btnAjAn.addEventListener('click', () => anchosAnalisis.autoajustarTodas());

  const btnResAn = $('btnResetAnchosAn');
  if (btnResAn) btnResAn.addEventListener('click', () => anchosAnalisis.restablecer());
```

- [ ] **Step 6: Correr la suite y el typecheck**

```bash
npm test && npx tsc --noEmit
```

Esperado: todo verde.

- [ ] **Step 7: Verificar a ojo, incluida la fuga de listeners**

En `preview_eval`, un paso por llamada:

```js
document.querySelector('.tabs button[data-v="analisis"]').click(); Math.round(document.getElementById('tab-analisis').getBoundingClientRect().width)
```

Esperado: un número claramente mayor que el ancho de una pestaña común (comparar contra `document.getElementById('tab-fml').getBoundingClientRect().width`).

Arrastrar una columna:

```js
const th=[...document.querySelectorAll('#tAnalisis thead th[data-k]')][3]; const r=th.getBoundingClientRect(); th.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:r.right-2,clientY:r.top+5})); document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:r.right+70,clientY:r.top+5})); document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); Math.round(th.getBoundingClientRect().width)
```

Esperado: ~70px más que el original (índice 3 es Etanol).

Que el ancho sobreviva al re-render:

```js
renderAnalisis(); Math.round(document.querySelectorAll('#tAnalisis thead th[data-k]')[3].getBoundingClientRect().width)
```

Esperado: **el mismo número** que el paso anterior.

Que los anchos sean independientes de Lotes:

```js
[localStorage.getItem('analisis_cols_ancho'), localStorage.getItem('lotes_cols_ancho')]
```

Esperado: el primero con la columna arrastrada, el segundo `null` (o lo que tuviera de antes, sin `etanol`).

Que no haya fuga de listeners — es el motivo de todo el refactor:

```js
let n=0; const orig=document.addEventListener.bind(document); document.addEventListener=(...a)=>{if(a[0]==='mousedown')n++;return orig(...a)}; for(let i=0;i<20;i++) renderAnalisis(); document.addEventListener=orig; n
```

Esperado: **0**. Veinte re-renders no agregan ni un `mousedown` en `document`.

- [ ] **Step 8: Commit**

```bash
git add public/lotes/index.html public/lotes/js/vista-analisis.js
git commit -m "feat: la pestana Analisis usa todo el ancho y sus columnas se arrastran"
```

---

### Task 7: Contador de análisis en el Dashboard

Tres tarjetas: totales, completados y faltantes. Se calculan en el navegador desde `d.lotes`, que el motor FML ya manda con sus alarmas.

**Files:**
- Modify: `public/lotes/index.html:828-848` (tres `.kpi-card` nuevas dentro de `#dashKpis`)
- Modify: `public/lotes/js/vista-dashboard.js` (función `faltaAnalizar`, pintado de las tarjetas, reuso en la FAQ)

**Interfaces:**
- Consumes: `d.lotes[].alarmas` — array de strings que ya llega del motor FML.
- Produces: `faltaAnalizar(lote): boolean` — interna al archivo, usada por las tarjetas y por la pregunta frecuente *"Faltan analizar"*.

- [ ] **Step 1: Agregar las tres tarjetas al HTML**

En `public/lotes/index.html`, dentro de `<div class="kpi-grid" id="dashKpis">`, agregar después de la última `.kpi-card` existente:

```html
      <div class="kpi-card kpi-neutral">
        <div class="kpi-val" id="kpiAnTotal">—</div>
        <div class="kpi-lbl">Análisis totales</div>
        <div class="kpi-sub" id="kpiAnTotalSub"></div>
      </div>
      <div class="kpi-card kpi-ok">
        <div class="kpi-val" id="kpiAnHechos">—</div>
        <div class="kpi-lbl">Análisis completados</div>
        <div class="kpi-sub" id="kpiAnHechosSub"></div>
      </div>
      <div class="kpi-card kpi-bad">
        <div class="kpi-val" id="kpiAnFaltan">—</div>
        <div class="kpi-lbl">Análisis faltantes</div>
        <div class="kpi-sub" id="kpiAnFaltanSub"></div>
      </div>
```

- [ ] **Step 2: Extraer la definición de "falta analizar"**

En `public/lotes/js/vista-dashboard.js`, agregar arriba de la función que pinta el dashboard (junto a las demás constantes del módulo):

```js
/** ¿A este lote le falta el analisis que pide su frecuencia?
 *
 *  Es la MISMA definicion que alimenta la pregunta frecuente "Faltan analizar"
 *  y las tarjetas de análisis: vive en un solo lugar a proposito, porque dos
 *  copias de esta condicion se separan callado y el dashboard pasa a mostrar
 *  dos numeros distintos para lo mismo.
 *
 *  Las dos alarmas cuentan: 'frecuencia_vencida' es el lote que se paso de sus
 *  dias, y 'sin_analisis_valido' el que nunca tuvo uno. Los dos casos son "hay
 *  que ir a medirlo".  */
function faltaAnalizar(l){
  return !!(l.alarmas && (l.alarmas.includes('frecuencia_vencida')
                       || l.alarmas.includes('sin_analisis_valido')));
}
```

- [ ] **Step 3: Pintar las tres tarjetas**

En el bloque `/* ---- KPIs ---- */`, después de la línea que setea `$('kpiAv').textContent`, agregar:

```js
  /* Analisis segun la frecuencia. Se cuenta por LOTE y sobre el estado de hoy:
   * cada lote activo debe un analisis, y o esta al dia o no. Los tres numeros
   * cierran (hechos + faltan = total), que es justo lo que se pidio. Sale todo
   * de d.lotes, que ya trae las alarmas del motor FML: sin llamadas nuevas al
   * servidor y sin reglas inventadas aca. */
  const lotesAn   = d.lotes || [];
  const anTotal   = lotesAn.length;
  const anFaltan  = lotesAn.filter(faltaAnalizar).length;
  const anHechos  = anTotal - anFaltan;

  $('kpiAnTotal').textContent  = anTotal;
  $('kpiAnHechos').textContent = anHechos;
  $('kpiAnFaltan').textContent = anFaltan;

  const pctAn = n => (anTotal ? Math.round(n * 100 / anTotal) : 0) + ' % de los lotes';
  $('kpiAnTotalSub').textContent  = 'Un análisis por lote activo';
  $('kpiAnHechosSub').textContent = anTotal ? pctAn(anHechos) : '';
  $('kpiAnFaltanSub').textContent = anFaltan
    ? pctAn(anFaltan) + ' — vencidos o sin análisis'
    : 'Todos dentro de frecuencia';
```

- [ ] **Step 4: Hacer que la FAQ use la misma función**

En el bloque `/* ---- Preguntas frecuentes ---- */`, reemplazar la línea de `sinAnalisis` (hoy `vista-dashboard.js:222`) por:

```js
  /* La misma definicion que la tarjeta de faltantes: si los dos numeros no dan
   * igual, es un bug. */
  const sinAnalisis = lotes.filter(faltaAnalizar).length;
```

- [ ] **Step 5: Sumar los placeholders del estado "sin datos"**

En la rama `if (!d){ … }` del principio (líneas 151-160), agregar junto a los demás:

```js
    $('kpiAnTotal').textContent  = '—';
    $('kpiAnHechos').textContent = '—';
    $('kpiAnFaltan').textContent = '—';
```

- [ ] **Step 6: Correr la suite y el typecheck**

```bash
npm test && npx tsc --noEmit
```

Esperado: todo verde.

- [ ] **Step 7: Verificar a ojo, incluido que los números cierren**

En `preview_eval`, un paso por llamada:

```js
document.querySelector('.tabs button[data-v="dashboard"]').click()
```

```js
['kpiAnTotal','kpiAnHechos','kpiAnFaltan'].map(id => document.getElementById(id).textContent)
```

Esperado: tres números, y el primero igual a la suma de los otros dos.

```js
const faq=[...document.querySelectorAll('#dashFaq *')].map(e=>e.textContent).join('|'); [document.getElementById('kpiAnFaltan').textContent, faq.includes('Faltan analizar')]
```

Esperado: el número de faltantes, y `true`. El número que muestra la FAQ *"Faltan analizar"* tiene que ser **exactamente el mismo** que la tarjeta.

- [ ] **Step 8: Commit**

```bash
git add public/lotes/index.html public/lotes/js/vista-dashboard.js
git commit -m "feat: el dashboard cuenta los analisis totales, hechos y faltantes"
```

---

### Task 8: Cierre — verificación completa y handoff del deploy

**Files:** ninguno (salvo que la verificación encuentre algo).

- [ ] **Step 1: Suite completa y typecheck desde cero**

```bash
npm test && npx tsc --noEmit
```

Esperado: todo verde. Los tests pasan de 222 a ~242 (los 20 de `carga-cols` más los 2 nuevos de `anchos`, menos ninguno).

- [ ] **Step 2: Recorrida final a ojo de las cuatro pestañas tocadas**

Con el server en `:8788`, confirmar en este orden:

1. **Lotes** — arrastrar una columna, `↔ Ajustar anchos`, `↩ Anchos originales`. Es la pantalla que más se usa y la que el refactor pone en riesgo.
2. **Cargar análisis** — pegar la fila de la planilla, previsualizar, confirmar que la tabla no muestra Vasija ni Año.
3. **Análisis** — que abra con Etanol cuarto, sin MBK ni mL exactos, con el filtro `Lote ▾`, a ancho de ventana y con las columnas arrastrables.
4. **Dashboard** — las tres tarjetas, con los números cerrando.

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Pedirle el deploy al usuario**

Claude **no puede** correr `wrangler`: el clasificador de permisos lo bloquea, y el deploy automático de GitHub Actions está en rojo desde el 2026-09-10 por falta de API token. Si este paso no se hace, el trabajo queda en GitHub y **nadie en la bodega lo ve**.

Pedirle explícitamente que corra, en `cmd.exe`:

```
cd /d C:\Users\Bmax\repos\catenainstitute
npx.cmd wrangler deploy
```

Y después, Ctrl+F5 en `https://catenainstitute.besa-junin.workers.dev/lotes/`.

---

## Self-review

**Cobertura del spec:**

| Sección del spec | Task |
|---|---|
| 1 · Pegado con el orden de la planilla | 1 (módulo + tests) y 2 (cableado + HTML) |
| 1 · Preview no muestra las descartadas | 2, Step 2 (`colsMostrar` filtra los `null`) |
| 2 · Etanol adelante, fuera MBK y mL | 3 |
| 3 · Filtro de lote en cajitas | 4 |
| 4a · Ancho de ventana | 6, Step 1 |
| 4b · Columnas arrastrables (fábrica) | 5 (refactor) y 6 (uso en Análisis) |
| 5 · Tres tarjetas del dashboard | 7 |
| Riesgo 1 · Lotes no se rompe | 5 Step 8 y 8 Step 2.1 |
| Riesgo 2 · La lista blanca se ve | 2 Step 6 (los th del preview) |
| Riesgo 3 · El deploy lo corre el usuario | 8, Step 4 |
| Verificación (`npm test`, `tsc`, `:8788`) | cada task + 8 |

Sin huecos.

**Consistencia de nombres entre tasks:** `ORDEN_PLANILLA` / `planDeColumnas` / `parsearFila` se definen en el Task 1 y se consumen con esos mismos nombres en el 2. `crearAnchos({tablaId, claveStorage, filaEncabezado})` y los métodos `activar` / `autoajustarTodas` / `restablecer` / `hay` se definen en el Task 5 y se usan igual en el 6. `cssDeAnchos(anchos, tablaId)` cambia de firma en el Task 5 y su único consumidor está dentro del propio módulo, más los tests, que se actualizan en el mismo task. `faltaAnalizar` se define y se consume dentro del Task 7.
