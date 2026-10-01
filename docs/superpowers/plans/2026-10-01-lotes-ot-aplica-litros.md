# Confirmar OT aplica litros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que confirmar una OT de trasiego o de corte en Lotes (web) proponga cómo queda cada lote (envases, litros, vasija actual y barricas mermas), lo compare con el Mapa de Barriles y lo aplique después de un check manual por lote.

**Architecture:** Todo vive en el documento de Lotes y en módulos JS puros dentro de `public/lotes/js/`, testeados con vitest. Del lado del servidor solo cambian dos cosas:

- el endpoint de solo lectura `/lotes/api/barriles`, que suma `lote`, `fecha` y consulta por número;
- la lista de secciones validadas.

El Mapa de Barriles nunca se escribe.

**Tech Stack:** Cloudflare Workers + D1, JS de navegador en módulos ES (sin build), vitest con `@cloudflare/vitest-pool-workers`, Python con openpyxl (solo para generar el padrón una vez).

**Spec:** `docs/superpowers/specs/2026-10-01-lotes-ot-aplica-litros-design.md`

## Global Constraints

**Dónde y cómo se trabaja:**
- Trabajar en el worktree `C:\Users\Bmax\repos\catenainstitute-ot-litros`, rama `feat/ot-aplica-litros`.
- Antes de cada commit, verificar con `git branch --show-current`. Otras sesiones cambian de rama la carpeta principal `repos\catenainstitute`.

**Reglas de los datos:**
- El Mapa de Barriles **solo se lee**. Ninguna tarea escribe `modulo='barriles'`.
- **Manda la Cap REAL:** `litros = cap_real − (tabla(0) − tabla(cm))`, redondeado a 1 decimal.
- `litros_actuales = litrosDeEnvases(lote) − faltante de las mermas pendientes del lote`. **Nunca `null`**: es 0 si no queda nada.
- Capacidades: 228 y 300 L cuentan como 225 (igual que `EQUIV_CAP` en `src/lotes/motores/cruce.ts`).
- Lote en las mermas: se compara por los primeros 5 dígitos (`codigoLote`), así "26730 ROJO" es igual a "26730".

**Archivos:**
- Los módulos puros no importan `nucleo.js` ni tocan `document`. Los tests corren en el runtime de Workers, donde no hay DOM.
- Algunos archivos de `public/lotes/js/` tienen finales de línea CRLF, por ejemplo `vista-ot-emitir.js`. Al editar, respetar el final de línea que ya tiene el archivo.

**Tests y commits:**
- Tests: `npx vitest run <archivo>` desde la raíz del worktree. Suite completa: `npm test`. Typecheck: `npx tsc --noEmit`.
- Los mensajes de commit terminan con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Pantalla:**
- Los textos que ve el usuario van en español rioplatense, como el resto de la app.

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `scripts/generar-cubicacion.mjs` | crear | Lee el HTML de cubicaciones y escribe `cubicacion-tablas.js` |
| `scripts/generar-padron-vasijas.py` | crear | Lee el Excel de vasijas y escribe `vasijas-padron.js` |
| `public/lotes/js/cubicacion-tablas.js` | generado | Las 6 tablas `{clave: {nombre, puntos:[[cm,litros],…]}}` |
| `public/lotes/js/cubicacion.js` | crear | `litrosPorCm(vasija, cm)` |
| `public/lotes/js/vasijas-padron.js` | generado + editado | `PADRON_INICIAL` (78 filas) y `buscarVasija` |
| `public/lotes/js/mermas.js` | crear | Faltantes, litros del lote, cierre por el Mapa, por vaciado o a mano |
| `public/lotes/js/propuesta-ot.js` | crear | Vaciado, llenado, `proponer`, `recalcularItem`, `compararConMapa`, `aplicarPropuesta` |
| `public/lotes/js/ot-armado.js` | modificar | `confirmarOT` guarda `merma_litros` |
| `public/lotes/js/vista-ot-confirmar.js` | reescribir | Confirmación en dos pasos |
| `public/lotes/js/mermas-mapa.js` | crear | Caché del Mapa para las mermas y cierre al guardar (usa `fetch`, no DOM) |
| `public/lotes/js/vista-mermas.js` | crear | Sub-pestaña Movimientos → Mermas |
| `public/lotes/js/vista-vasijas.js` | crear | Sección Configuración → Vasijas fijas |
| `public/lotes/js/nucleo.js` | modificar | Secciones por defecto y `registrarAntesDeGuardar` |
| `public/lotes/js/vista-lotes.js` | modificar | El overlay de Envases usa `litrosDelLote` |
| `public/lotes/js/vista-movimientos.js` | modificar | Tercer botón de la sub-pestaña |
| `public/lotes/js/vista-dashboard.js` | modificar | Tarjeta "Barricas mermas" |
| `public/lotes/js/vista-config.js` | modificar | Llama a `renderVasijas` |
| `public/lotes/js/envases.js`, `src/lotes/motores/envases.ts` | modificar | Solo el comentario de la invariante |
| `public/lotes/index.html` | modificar | Contenedor de Vasijas fijas en `#tab-config` + CSS |
| `src/lotes/motores/barriles-lote.ts` | modificar | `lote` y `fecha` en `BarrilOT`; `barrilesPorNum` |
| `src/lotes/rutas.ts` | modificar | `GET /barriles?nums=` |
| `src/prensas/validacion.ts` | modificar | `SECCIONES_LOTES` suma `vasijas` y `mermas` |
| `docs/guia-lotes.md` | modificar | Sección de uso nueva |
| `test/lotes-cubicacion.test.mjs`, `test/lotes-vasijas-padron.test.mjs`, `test/lotes-mermas.test.mjs`, `test/lotes-propuesta-ot.test.mjs` | crear | Tests |
| `test/lotes-barriles-ruta.test.ts`, `test/validacion.test.ts`, `test/lotes-ot-armado.test.mjs` | modificar | Tests |

---

### Task 1: Tablas de cubicación y `litrosPorCm`

**Files:**
- Create: `scripts/generar-cubicacion.mjs`
- Create (generado): `public/lotes/js/cubicacion-tablas.js`
- Create: `public/lotes/js/cubicacion.js`
- Test: `test/lotes-cubicacion.test.mjs`

**Interfaces:**
- Produces:
  - `TABLAS_CUBICACION: Record<string, {nombre: string, puntos: [number, number][]}>`, con las claves `esfera-1500`, `tanque-40hl`, `tanque-75hl`, `huevo-33hl`, `huevo-24hl` y `pileta-30hl`. Los puntos van ordenados por cm ascendente, y `puntos[0]` es cm 0 (tanque lleno).
  - `litrosPorCm(vasija: {cap_real: number, tabla: string|null}, cm): {litros: number|null, faltante: number|null, error: null|'sin-tabla'|'cm-invalido'|'fuera-de-rango', max?: number}`

- [ ] **Step 1: Escribir el generador**

`scripts/generar-cubicacion.mjs`:

```js
/* Genera public/lotes/js/cubicacion-tablas.js desde el HTML de cubicaciones
 * de la bodega (las tablas vienen embebidas de "base de datos cubicaciones.xlsx").
 *
 * Uso: node scripts/generar-cubicacion.mjs "<ruta a cubicaciones_tanques.html>"
 * Volver a correrlo si cambia el Excel. */
import { readFileSync, writeFileSync } from 'node:fs';

const ORIGEN = process.argv[2];
if (!ORIGEN) { console.error('Falta la ruta al HTML de cubicaciones'); process.exit(1); }

const CLAVES = {
  'cubicacion_esfera_plano_cm': ['esfera-1500', 'Esfera + plano 1500 L'],
  'cubicacion tanque 40HL':     ['tanque-40hl', 'Tanque 40 HL'],
  'cubicacion tanque 75HL':     ['tanque-75hl', 'Tanque 75 HL'],
  'cubicacion Huevo 33HL':      ['huevo-33hl',  'Huevo 33 HL'],
  'cubicacion Huevos 24HL':     ['huevo-24hl',  'Huevo 24 HL'],
  'cubicacion piletas 30HL':    ['pileta-30hl', 'Pileta 30 HL'],
};

const html = readFileSync(ORIGEN, 'utf8');
const m = html.match(/const DB = (\{.*?\});\n/s);
if (!m) throw new Error('No encontré "const DB = {...};" en el HTML');
const DB = JSON.parse(m[1]);

const out = {};
for (const [hoja, t] of Object.entries(DB)) {
  const c = CLAVES[hoja];
  if (!c) throw new Error('Tabla sin clave asignada: ' + hoja);
  const puntos = t.data.map(p => [Number(p.merma_cm), Number(p.litros)]).sort((a, b) => a[0] - b[0]);
  out[c[0]] = { nombre: c[1], puntos };
}

const cabecera = `/* ===== Lotes CIW — tablas de cubicacion de tanques (GENERADO) =====
 *
 * NO editar a mano: sale de scripts/generar-cubicacion.mjs, que lee
 * "Archivos de Roy Urvieta - Año 2026/cubicacion de tanques/cubicaciones_tanques.html".
 * Cada punto es [cm de merma, litros]; cm 0 = tanque lleno. */
'use strict';

`;
writeFileSync('public/lotes/js/cubicacion-tablas.js',
  cabecera + 'export const TABLAS_CUBICACION = ' + JSON.stringify(out) + ';\n');
console.log('Tablas:', Object.keys(out).map(k => `${k} (${out[k].puntos.length} puntos)`).join(', '));
```

- [ ] **Step 2: Generar las tablas**

Run: `node scripts/generar-cubicacion.mjs "C:/Users/Bmax/OneDrive - BODEGAS ESMERALDA SA/Archivos de Roy Urvieta - Año 2026/cubicacion de tanques/cubicaciones_tanques.html"`

Expected:

```
Tablas: esfera-1500 (143 puntos), tanque-40hl (191 puntos), tanque-75hl (221 puntos), huevo-33hl (233 puntos), huevo-24hl (181 puntos), pileta-30hl (146 puntos)
```

- [ ] **Step 3: Escribir los tests que fallan**

`test/lotes-cubicacion.test.mjs`:

```js
/* cm de merma -> litros. Manda la Cap REAL de la vasija: la tabla solo dice
 * cuanto falta para llenarla (spec 2026-10-01, decision D4). */
import { describe, it, expect } from 'vitest';
import { TABLAS_CUBICACION } from '../public/lotes/js/cubicacion-tablas.js';
import { litrosPorCm } from '../public/lotes/js/cubicacion.js';

const T40 = { cap_real: 4200, tabla: 'tanque-40hl' };

describe('TABLAS_CUBICACION', () => {
  it('tiene las 6 tablas, ordenadas y empezando en 0 cm', () => {
    expect(Object.keys(TABLAS_CUBICACION).sort()).toEqual(
      ['esfera-1500', 'huevo-24hl', 'huevo-33hl', 'pileta-30hl', 'tanque-40hl', 'tanque-75hl']);
    for (const t of Object.values(TABLAS_CUBICACION)) {
      expect(t.puntos[0][0]).toBe(0);
      for (let i = 1; i < t.puntos.length; i++) expect(t.puntos[i][0]).toBeGreaterThan(t.puntos[i - 1][0]);
    }
  });
});

describe('litrosPorCm', () => {
  it('cm exacto: la Cap REAL menos lo que falta segun la tabla', () => {
    // tabla 40 HL: 0 cm = 4299, 30 cm = 4174 -> faltan 125
    expect(litrosPorCm(T40, 30)).toEqual({ litros: 4075, faltante: 125, error: null });
  });
  it('0 cm es la Cap REAL, no el lleno de la tabla', () => {
    expect(litrosPorCm(T40, 0).litros).toBe(4200);
  });
  it('interpola entre dos centimetros', () => {
    // 30 cm = 4174, 31 cm = 4159 -> 30,5 cm = 4166,5 -> faltan 132,5
    expect(litrosPorCm(T40, 30.5)).toEqual({ litros: 4067.5, faltante: 132.5, error: null });
  });
  it('acepta el cm como texto con coma', () => {
    expect(litrosPorCm(T40, '30,5').litros).toBe(4067.5);
  });
  it('fuera de rango avisa con el maximo', () => {
    expect(litrosPorCm(T40, 191)).toMatchObject({ litros: null, error: 'fuera-de-rango', max: 190 });
  });
  it('cm vacio, negativo o basura es invalido', () => {
    for (const cm of ['', null, undefined, -1, 'abc']) expect(litrosPorCm(T40, cm).error).toBe('cm-invalido');
  });
  it('vasija sin tabla', () => {
    expect(litrosPorCm({ cap_real: 2000, tabla: null }, 10).error).toBe('sin-tabla');
    expect(litrosPorCm(null, 10).error).toBe('sin-tabla');
  });
  it('nunca da litros negativos', () => {
    // esfera: 142 cm = 0,5 L de 1500 -> faltan 1499,5; con Cap REAL 1400 daria -99,5
    expect(litrosPorCm({ cap_real: 1400, tabla: 'esfera-1500' }, 142).litros).toBe(0);
  });
});
```

- [ ] **Step 4: Correr los tests y ver que fallan**

Run: `npx vitest run test/lotes-cubicacion.test.mjs`

Expected: FAIL, porque no se encuentra `../public/lotes/js/cubicacion.js`.

- [ ] **Step 5: Implementar `cubicacion.js`**

`public/lotes/js/cubicacion.js`:

```js
/* ===== Lotes CIW — cm de merma a litros (puro) =====
 *
 * Manda la Cap REAL del padron de vasijas: la tabla de cubicacion solo dice
 * cuantos litros FALTAN para llenar el tanque a esa altura de merma
 * (tabla(0) - tabla(cm)), y eso se le resta a la Cap REAL. Entre dos cm de la
 * tabla se interpola en linea recta, igual que el HTML de cubicaciones. */
'use strict';

import { TABLAS_CUBICACION } from './cubicacion-tablas.js';

const r1 = x => Math.round(x * 10) / 10;

function leerCm(cm){
  if (cm === '' || cm == null) return null;
  const x = typeof cm === 'number' ? cm : parseFloat(String(cm).replace(',', '.'));
  return Number.isFinite(x) && x >= 0 ? x : null;
}

export function litrosPorCm(vasija, cm){
  const t = vasija && TABLAS_CUBICACION[vasija.tabla];
  if (!t) return { litros: null, faltante: null, error: 'sin-tabla' };
  const x = leerCm(cm);
  if (x == null) return { litros: null, faltante: null, error: 'cm-invalido' };
  const pts = t.puntos;
  const max = pts[pts.length - 1][0];
  if (x > max) return { litros: null, faltante: null, error: 'fuera-de-rango', max };

  let y = pts[0][1];
  for (let i = 0; i < pts.length - 1; i++){
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (x >= x0 && x <= x1){ y = y0 + (y1 - y0) * (x - x0) / (x1 - x0); break; }
  }
  const faltante = r1(pts[0][1] - y);
  const cap = Number(vasija.cap_real) > 0 ? Number(vasija.cap_real) : pts[0][1];
  return { litros: Math.max(0, r1(cap - faltante)), faltante, error: null };
}
```

- [ ] **Step 6: Correr los tests y ver que pasan**

Run: `npx vitest run test/lotes-cubicacion.test.mjs`

Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # tiene que decir feat/ot-aplica-litros
git add scripts/generar-cubicacion.mjs public/lotes/js/cubicacion-tablas.js public/lotes/js/cubicacion.js test/lotes-cubicacion.test.mjs
git commit -m "feat(lotes): tablas de cubicacion y cm de merma a litros con Cap REAL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Padrón inicial de vasijas fijas

**Files:**
- Create: `scripts/generar-padron-vasijas.py`
- Create (generado): `public/lotes/js/vasijas-padron.js`
- Test: `test/lotes-vasijas-padron.test.mjs`

**Interfaces:**
- Consumes: `TABLAS_CUBICACION` (Task 1).
- Produces:
  - `PADRON_INICIAL: {num: string, tipo: string, cap_real: number, tabla: string|null, activa: true}[]` (78 filas).
  - `normalizarNumVasija(x): string`: los dígitos del texto ("T 201" → "201"). Si no tiene dígitos, devuelve el texto en mayúsculas sin espacios.
  - `buscarVasija(padron, texto): fila|null`: solo busca entre las activas.

- [ ] **Step 1: Escribir el generador**

`scripts/generar-padron-vasijas.py`:

```python
"""Genera public/lotes/js/vasijas-padron.js desde la hoja "Inventario vasijas"
del Excel "Inventario de vasijas de CIW 2026.xlsx" (columnas B = N° de vasija,
C = Cap REAL, E = Vasija). La tabla de cubicacion se asigna por (tipo, Cap REAL).

Uso: python scripts/generar-padron-vasijas.py "<ruta al .xlsx>"
"""
import json
import sys

import openpyxl

TABLA = {
    ('ESFERA HORMIGON', 1500): 'esfera-1500',
    ('PILETA DE HORMIGON', 3000): 'pileta-30hl',
    ('TANQUE AC.INOX.', 4200): 'tanque-40hl',
    ('TANQUE AC.INOX.', 7500): 'tanque-75hl',
    ('TANQUE HORMIGON OVOIDE', 3300): 'huevo-33hl',
    ('TANQUE OVOIDE AC.INOX.', 2600): 'huevo-24hl',
}

wb = openpyxl.load_workbook(sys.argv[1], data_only=True, read_only=True)
ws = wb['Inventario vasijas']
filas = []
for r in ws.iter_rows(min_row=5, values_only=True):
    num, cap, tipo = r[1], r[2], r[4]
    if num is None:
        continue
    num = str(int(num)) if isinstance(num, (int, float)) else str(num).strip()
    tipo = str(tipo).strip()
    cap = int(cap)
    filas.append({'num': num, 'tipo': tipo, 'cap_real': cap,
                  'tabla': TABLA.get((tipo, cap)), 'activa': True})

CABECERA = '''/* ===== Lotes CIW — padron de vasijas fijas =====
 *
 * PADRON_INICIAL es GENERADO por scripts/generar-padron-vasijas.py desde
 * "Registro de Lotes CIW 2026/Inventario de vasijas de CIW 2026.xlsx" (Cap REAL).
 * Solo se usa para el boton "Cargar padron inicial": el padron vivo esta en
 * DATOS().vasijas y se edita en Configuracion. */
'use strict';

'''
FUNCIONES = '''
/* "T 201", "201", "tq201" -> "201". Sin digitos: el texto en mayusculas. */
export function normalizarNumVasija(x){
  const s = String(x ?? '').trim();
  const d = s.replace(/\\D/g, '');
  return d || s.toUpperCase().replace(/\\s+/g, '');
}

/* Fila activa del padron con ese numero, o null. */
export function buscarVasija(padron, texto){
  const n = normalizarNumVasija(texto);
  if (!n) return null;
  return (padron || []).find(v => v && v.activa !== false && normalizarNumVasija(v.num) === n) || null;
}
'''
with open('public/lotes/js/vasijas-padron.js', 'w', encoding='utf-8', newline='\n') as f:
    f.write(CABECERA)
    f.write('export const PADRON_INICIAL = ' + json.dumps(filas, ensure_ascii=False) + ';\n')
    f.write(FUNCIONES)
print(len(filas), 'vasijas;', sum(1 for x in filas if x['tabla']), 'con tabla')
```

- [ ] **Step 2: Generar el padrón**

Run: `python scripts/generar-padron-vasijas.py "C:/Users/Bmax/OneDrive - BODEGAS ESMERALDA SA/Archivos de Roy Urvieta - Año 2026/Registro de Lotes CIW 2026/Inventario de vasijas de CIW 2026.xlsx"`

Expected: `78 vasijas; 55 con tabla`. Puede aparecer el warning de openpyxl "Data Validation extension is not supported"; es inocuo.

- [ ] **Step 3: Escribir los tests**

`test/lotes-vasijas-padron.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { PADRON_INICIAL, buscarVasija, normalizarNumVasija } from '../public/lotes/js/vasijas-padron.js';
import { TABLAS_CUBICACION } from '../public/lotes/js/cubicacion-tablas.js';

describe('PADRON_INICIAL', () => {
  it('son las 78 vasijas del Excel, sin numeros repetidos', () => {
    expect(PADRON_INICIAL).toHaveLength(78);
    expect(new Set(PADRON_INICIAL.map(v => v.num)).size).toBe(78);
  });
  it('55 tienen tabla y toda tabla referida existe', () => {
    const con = PADRON_INICIAL.filter(v => v.tabla);
    expect(con).toHaveLength(55);
    for (const v of con) expect(TABLAS_CUBICACION[v.tabla]).toBeTruthy();
  });
  it('usa la Cap REAL', () => {
    expect(PADRON_INICIAL.find(v => v.num === '124').cap_real).toBe(46500);
  });
});

describe('buscarVasija', () => {
  const P = [{ num: '201', activa: true }, { num: '202', activa: false }];
  it('encuentra por el numero aunque venga con prefijo', () => {
    expect(normalizarNumVasija('T 201')).toBe('201');
    expect(buscarVasija(P, 'T 201')).toBe(P[0]);
    expect(buscarVasija(P, 201)).toBe(P[0]);
  });
  it('ignora las dadas de baja y lo que no existe', () => {
    expect(buscarVasija(P, '202')).toBeNull();
    expect(buscarVasija(P, '999')).toBeNull();
    expect(buscarVasija(P, '')).toBeNull();
  });
});
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run test/lotes-vasijas-padron.test.mjs`

Expected: PASS, 5 tests. Si falla la cuenta de 78 o de 55, revisar el generador y no ajustar el test: las cuentas salen de la spec.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add scripts/generar-padron-vasijas.py public/lotes/js/vasijas-padron.js test/lotes-vasijas-padron.test.mjs
git commit -m "feat(lotes): padron inicial de 78 vasijas fijas desde el Excel (Cap REAL)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Mermas y litros del lote

**Files:**
- Create: `public/lotes/js/mermas.js`
- Modify: `public/lotes/js/envases.js:1-12` (solo el comentario de la invariante)
- Modify: `src/lotes/motores/envases.ts:1-10` (solo el comentario)
- Test: `test/lotes-mermas.test.mjs`

**Interfaces:**
- Consumes: `litrosDeEnvases(lote)` de `./envases.js`.
- Produces (una merma es `{id, lote, barril, cap, litros, desde, ot, resuelta_el, resuelta_por, resuelta_como}`):
  - `codigoLote(v): string`
  - `faltanteDe(merma): number`
  - `estaPendiente(merma): boolean`
  - `faltanteDeLote(mermas, lote): number`
  - `litrosDelLote(lote, mermas): number`
  - `nuevaMerma({lote, barril, cap, litros, desde, ot}, id): merma`
  - `llenaSegunMapa(merma, barrilMapa): boolean`. `barrilMapa` es `{estado, lote, fecha}` o `null`.
  - `resolver(merma, como: 'mapa'|'manual'|'vaciada', usuario, hoy): void`
  - `cerrarLlenasSegunMapa(mermas, porNum, usuario, hoy): Set<string>`. Devuelve los códigos de lote afectados.
  - `recalcularLitros(lotes, mermas, codigos: Set<string>): void`

- [ ] **Step 1: Escribir los tests que fallan**

`test/lotes-mermas.test.mjs`:

```js
/* Barricas mermas: lo que les falta se descuenta de los litros del lote
 * hasta que se completan (spec 2026-10-01, D5 y D7). */
import { describe, it, expect } from 'vitest';
import { codigoLote, faltanteDe, estaPendiente, faltanteDeLote, litrosDelLote, nuevaMerma,
         llenaSegunMapa, resolver, cerrarLlenasSegunMapa, recalcularLitros } from '../public/lotes/js/mermas.js';
import { litrosDeEnvases } from '../public/lotes/js/envases.js';

const M = (extra = {}) => nuevaMerma({ lote: '26217', barril: '2221713', cap: 225, litros: 180,
  desde: '2026-10-01', ot: 'OT-2026-014', ...extra }, 'mer-1');

describe('codigoLote', () => {
  it('se queda con los 5 digitos del lote', () => {
    expect(codigoLote('26730 ROJO')).toBe('26730');
    expect(codigoLote(26217)).toBe('26217');
    expect(codigoLote(' VERMUT ')).toBe('VERMUT');
  });
});

describe('faltante', () => {
  it('es cap - litros, nunca negativo', () => {
    expect(faltanteDe(M())).toBe(45);
    expect(faltanteDe(M({ litros: 230 }))).toBe(0);
  });
  it('solo cuentan las pendientes del lote', () => {
    const resuelta = M({ barril: '9' }); resuelta.resuelta_el = '2026-10-02';
    const otro = M({ lote: '26300' });
    expect(faltanteDeLote([M(), resuelta, otro], 26217)).toBe(45);
  });
});

describe('litrosDelLote', () => {
  it('12 x 225 con una barrica de 180 da 2655', () => {
    expect(litrosDelLote({ lote: 26217, cap225: 12 }, [M()])).toBe(2655);
  });
  it('sin mermas es la invariante de siempre', () => {
    for (const l of [{ cap225: 4 }, { vasija_grande: 3500 }, { cap225: 2, vasija_grande: 1500.5 }, {}])
      expect(litrosDelLote({ lote: 1, ...l }, [])).toBe(litrosDeEnvases(l));
  });
  it('nunca baja de 0', () => {
    expect(litrosDelLote({ lote: 26217 }, [M()])).toBe(0);
  });
});

describe('llenaSegunMapa', () => {
  it('LLENO con el mismo lote y fecha posterior', () => {
    expect(llenaSegunMapa(M(), { estado: 'LLENO', lote: '26217 CHECK', fecha: '2026-10-03' })).toBe(true);
  });
  it('no si sigue MERMO, cambio de lote, la fecha es anterior o no hay barril', () => {
    expect(llenaSegunMapa(M(), { estado: 'MERMO', lote: '26217', fecha: '2026-10-03' })).toBe(false);
    expect(llenaSegunMapa(M(), { estado: 'LLENO', lote: '26300', fecha: '2026-10-03' })).toBe(false);
    expect(llenaSegunMapa(M(), { estado: 'LLENO', lote: '26217', fecha: '2026-09-30' })).toBe(false);
    expect(llenaSegunMapa(M(), { estado: 'LLENO', lote: '26217', fecha: '' })).toBe(false);
    expect(llenaSegunMapa(M(), null)).toBe(false);
  });
});

describe('cerrar', () => {
  it('cerrarLlenasSegunMapa marca como mapa y devuelve los lotes', () => {
    const ms = [M(), M({ barril: '5' })];
    const lotes = cerrarLlenasSegunMapa(ms, { '2221713': { estado: 'LLENO', lote: '26217', fecha: '2026-10-05' } },
      'ana', '2026-10-06');
    expect([...lotes]).toEqual(['26217']);
    expect(ms[0]).toMatchObject({ resuelta_el: '2026-10-06', resuelta_por: 'ana', resuelta_como: 'mapa' });
    expect(estaPendiente(ms[1])).toBe(true);
  });
  it('resolver a mano', () => {
    const m = M(); resolver(m, 'manual', 'roy', '2026-10-07');
    expect(m).toMatchObject({ resuelta_como: 'manual', resuelta_por: 'roy' });
    expect(estaPendiente(m)).toBe(false);
  });
  it('recalcularLitros vuelve el lote a sus envases al cerrar la merma', () => {
    const lote = { lote: 26217, cap225: 12, litros_actuales: 2655 };
    const ms = [M()]; resolver(ms[0], 'mapa', 'x', '2026-10-06');
    recalcularLitros([lote], ms, new Set(['26217']));
    expect(lote.litros_actuales).toBe(2700);
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npx vitest run test/lotes-mermas.test.mjs`

Expected: FAIL, porque no se encuentra `mermas.js`.

- [ ] **Step 3: Implementar `mermas.js`**

`public/lotes/js/mermas.js`:

```js
/* ===== Lotes CIW — barricas mermas (puro) =====
 *
 * Una merma es una barrica que quedo con menos vino que su capacidad despues
 * de una OT. Mientras esta pendiente, lo que le falta se descuenta de los
 * litros del lote:
 *   litros_actuales = litrosDeEnvases(lote) - faltante de sus mermas pendientes
 * Se cierra sola cuando el Mapa de Barriles la muestra LLENO con el mismo lote
 * y fecha posterior (cerrarLlenasSegunMapa), a mano, o cuando otra OT la vacia. */
'use strict';

import { litrosDeEnvases } from './envases.js';

const r1 = x => Math.round(x * 10) / 10;

/* Los 5 digitos del lote: el Mapa anota cosas como "26730 ROJO". */
export function codigoLote(v){
  const s = String(v ?? '').trim();
  const m = s.match(/\d{5}/);
  return m ? m[0] : s;
}

export function faltanteDe(m){
  const c = Number(m && m.cap), l = Number(m && m.litros);
  return Number.isFinite(c) && Number.isFinite(l) && c > l ? r1(c - l) : 0;
}

export const estaPendiente = m => !!m && !m.resuelta_el;

export function faltanteDeLote(mermas, lote){
  const L = codigoLote(lote);
  return r1((mermas || []).filter(m => estaPendiente(m) && codigoLote(m.lote) === L)
    .reduce((s, m) => s + faltanteDe(m), 0));
}

/* Nunca null y nunca negativo: motor_etapas lee litros_actuales <= 0 como lote cerrado. */
export function litrosDelLote(lote, mermas){
  if (!lote) return 0;
  return Math.max(0, r1(litrosDeEnvases(lote) - faltanteDeLote(mermas, lote.lote)));
}

export function nuevaMerma({ lote, barril, cap, litros, desde, ot }, id){
  return { id, lote: String(lote), barril: String(barril).trim(), cap: Number(cap), litros: Number(litros),
           desde: String(desde || ''), ot: String(ot || ''),
           resuelta_el: '', resuelta_por: '', resuelta_como: '' };
}

/* barrilMapa: la fila del Mapa para ese numero ({estado, lote, fecha}) o null.
 * Sin fecha en el Mapa no se cierra: es preferible una merma de mas en la lista
 * que una barrica medio vacia que nadie recuerda. */
export function llenaSegunMapa(m, b){
  if (!m || !b || b.estado !== 'LLENO') return false;
  if (codigoLote(b.lote) !== codigoLote(m.lote)) return false;
  const f = String(b.fecha || '');
  return !!f && f >= String(m.desde || '');
}

export function resolver(m, como, usuario, hoy){
  m.resuelta_el = hoy; m.resuelta_por = usuario || ''; m.resuelta_como = como;
}

export function cerrarLlenasSegunMapa(mermas, porNum, usuario, hoy){
  const lotes = new Set();
  for (const m of mermas || []){
    if (estaPendiente(m) && llenaSegunMapa(m, (porNum || {})[String(m.barril)])){
      resolver(m, 'mapa', usuario, hoy);
      lotes.add(codigoLote(m.lote));
    }
  }
  return lotes;
}

export function recalcularLitros(lotes, mermas, codigos){
  for (const l of lotes || []){
    if (codigos.has(codigoLote(l.lote))) l.litros_actuales = litrosDelLote(l, mermas);
  }
}
```

- [ ] **Step 4: Actualizar el comentario de la invariante en los dos `envases`**

En `public/lotes/js/envases.js` y en `src/lotes/motores/envases.ts`, debajo de la línea de la invariante (`litros_actuales = 50·cap50 + …`), agregar:

```
 *   … menos lo que les falta a las barricas mermas pendientes del lote
 *   (DATOS().mermas, ver mermas.js). Con 0 mermas es exactamente esta suma.
```

No cambia ninguna función. `litrosDeEnvases` sigue siendo la suma de los envases.

- [ ] **Step 5: Correr los tests**

Run: `npx vitest run test/lotes-mermas.test.mjs test/lotes-vacios.test.mjs`

Expected: PASS en los dos.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add public/lotes/js/mermas.js public/lotes/js/envases.js src/lotes/motores/envases.ts test/lotes-mermas.test.mjs
git commit -m "feat(lotes): barricas mermas descuentan su faltante de los litros del lote

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Servidor — el Mapa por número, con lote y fecha; secciones nuevas

**Files:**
- Modify: `src/lotes/motores/barriles-lote.ts`
- Modify: `src/lotes/rutas.ts` (bloque `GET /barriles`, cerca de la línea 270)
- Modify: `src/prensas/validacion.ts` (`SECCIONES_LOTES`, cerca de la línea 39)
- Test: `test/lotes-barriles-ruta.test.ts`, `test/validacion.test.ts`

**Interfaces:**
- Produces:
  - `BarrilOT` gana `lote: string` y `fecha: string`.
  - `barrilesPorNum(estado, nums: string[]): Record<string, BarrilOT | null>`
  - `GET /lotes/api/barriles?nums=a,b` responde `{version, por_num}`.
  - `?lotes=` sigue respondiendo `{version, por_lote}`. Se pueden pedir los dos a la vez.
  - Sin ninguno de los dos parámetros responde 400.

- [ ] **Step 1: Actualizar y agregar los tests**

En `test/lotes-barriles-ruta.test.ts`:

1. Actualizar el `toEqual` del primer test para que incluya los campos nuevos:

```ts
    expect(r['26217'][0]).toEqual({
      num: '2221713', estado: 'LLENO', cap: 225, litros: 225,
      anio: '2022', marca: 'TARANSAUD', origen: 'FRANCES', trat: 'REF.101 M',
      lote: '26217', fecha: '',
    });
```

2. Agregar al import `barrilesPorNum` y sumar este bloque después de `describe('barrilesDeLotes'…)`:

```ts
describe('barrilesPorNum', () => {
  it('trae cada numero pedido con su lote, o null si no existe', () => {
    const inv = [...INV, { num: '777', estado: 'LLENO', cap: 225, litros: 225, lote: '26730 ROJO', fecha: '2026-10-03' }];
    const r = barrilesPorNum({ inventario: inv }, ['777', ' 9001 ', 'nada']);
    expect(r['777']).toMatchObject({ lote: '26730 ROJO', fecha: '2026-10-03', estado: 'LLENO' });
    expect(r['9001']).toMatchObject({ lote: '26300' });
    expect(r['nada']).toBeNull();
  });
});
```

3. En `describe('GET /barriles')`, cambiar el test `'400 sin lotes'` para que diga "400 sin lotes ni nums" (el `pedir('')` queda igual), y agregar:

```ts
  it('nums devuelve por_num', async () => {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO documento (modulo, json) VALUES ('barriles', ?)`,
    ).bind(JSON.stringify({ version: 2304, estado: { inventario: INV } })).run();
    const r = await pedir('?nums=2221713,nada');
    expect(r.status).toBe(200);
    const j = (await r.json()) as { version: number; por_num: Record<string, unknown> };
    expect(j.version).toBe(2304);
    expect(j.por_num['2221713']).toMatchObject({ lote: '26217' });
    expect(j.por_num['nada']).toBeNull();
  });
```

En `test/validacion.test.ts`, dentro de `describe('ordenes_trabajo en Lotes', …)` o en un `describe` nuevo a continuación:

```ts
describe('vasijas y mermas en Lotes', () => {
  it('estan declaradas pero no son requeridas', () => {
    expect(SECCIONES_LOTES.secciones).toEqual(expect.arrayContaining(['vasijas', 'mermas']));
    expect(SECCIONES_LOTES.requeridas).not.toContain('vasijas');
    expect(SECCIONES_LOTES.requeridas).not.toContain('mermas');
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npx vitest run test/lotes-barriles-ruta.test.ts test/validacion.test.ts`

Expected: FAIL, porque `barrilesPorNum` no existe y `lote`/`fecha` todavía no vienen en el resultado.

- [ ] **Step 3: Implementar en `barriles-lote.ts`**

1. Agregar a la interfaz `BarrilOT`:

```ts
  lote: string;
  fecha: string;
```

2. Extraer el armado de la fila a una función, usarla en `barrilesDeLotes` y agregar `barrilesPorNum`:

```ts
function aBarrilOT(b: Record<string, unknown>): BarrilOT {
  return {
    num: txt(b.num),
    estado: txt(b.estado),
    cap: numero(b.cap),
    litros: numero(b.litros),
    anio: txt(b.anio),
    marca: txt(b.marca),
    origen: txt(b.origen),
    trat: txt(b.trat),
    lote: txt(b.lote),
    fecha: txt(b.fecha),
  };
}
```

Dentro de `barrilesDeLotes`, reemplazar el objeto literal del `push` por `out[L].push(aBarrilOT(b));`. Después, agregar:

```ts
/**
 * Barriles del Mapa por número, sin importar el lote. Lo usan las barricas
 * mermas de Lotes: validar que el barril existe y ver si ya se llenó, aunque
 * el Mapa le haya anotado el lote distinto ("26730 ROJO").
 */
export function barrilesPorNum(
  estado: Record<string, unknown>,
  nums: string[],
): Record<string, BarrilOT | null> {
  const out: Record<string, BarrilOT | null> = {};
  for (const n of nums) {
    const k = txt(n);
    if (k) out[k] = null;
  }
  const inventario = Array.isArray(estado.inventario) ? (estado.inventario as Record<string, unknown>[]) : [];
  for (const b of inventario) {
    const k = txt(b.num);
    if (k in out && out[k] === null) out[k] = aBarrilOT(b);
  }
  return out;
}
```

- [ ] **Step 4: Implementar la ruta**

En `src/lotes/rutas.ts`, importar `barrilesPorNum` junto a `barrilesDeLotes` y reemplazar el bloque `GET /barriles` completo por:

```ts
  // ---------- GET /barriles?lotes=26217,26218  y/o  ?nums=2221713,451 ----------
  // Para las OT de trasiego y las barricas mermas. Solo lectura: el Mapa lo
  // escribe el escáner, nunca una OT.
  if (ruta === '/barriles' && req.method === 'GET') {
    const qs = new URL(req.url).searchParams;
    const lista = (p: string) => (qs.get(p) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const pedidos = lista('lotes');
    const nums = lista('nums');
    if (!pedidos.length && !nums.length) return json(400, { error: 'falta el parámetro lotes o nums' });
    try {
      const doc = await leerMapaBarriles(env);
      const estado = doc.estado ?? {};
      const r: Record<string, unknown> = { version: doc.version };
      if (pedidos.length) r.por_lote = barrilesDeLotes(estado, pedidos);
      if (nums.length) r.por_num = barrilesPorNum(estado, nums);
      return json(200, r);
    } catch (e) {
      if (e instanceof MapaNoDisponible) return json(503, { error: e.message });
      throw e;
    }
  }
```

- [ ] **Step 5: Declarar las secciones**

En `src/prensas/validacion.ts`:

```ts
export const SECCIONES_LOTES: ConfigSecciones = {
  secciones: ['lotes', 'analisis', 'movimientos', 'ordenes_trabajo', 'vasijas', 'mermas'],
  requeridas: ['lotes', 'analisis'],
};
```

Sumar al comentario de arriba una línea: "`vasijas` (padrón de vasijas fijas) y `mermas` (barricas mermas), 2026-10-01: mismo criterio."

- [ ] **Step 6: Correr los tests y el typecheck**

Run: `npx vitest run test/lotes-barriles-ruta.test.ts test/validacion.test.ts && npx tsc --noEmit`

Expected: PASS y typecheck sin errores.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add src/lotes/motores/barriles-lote.ts src/lotes/rutas.ts src/prensas/validacion.ts test/lotes-barriles-ruta.test.ts test/validacion.test.ts
git commit -m "feat(lotes): /barriles por numero de barril, con lote y fecha; secciones vasijas y mermas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Propuesta de la OT (cálculo puro)

**Files:**
- Create: `public/lotes/js/propuesta-ot.js`
- Test: `test/lotes-propuesta-ot.test.mjs`

**Interfaces:**
- Consumes:
  - `litrosPorCm` (Task 1)
  - `buscarVasija` (Task 2)
  - `codigoLote`, `faltanteDe`, `estaPendiente` (Task 3)
  - `origenTanque` y `LITROS_BARRICA` de `ot-plantillas.js`
  - `resumenEnvases` de `envases.js`
- Produces:
  - `DESTINO_POR_PLANTILLA`, y `tipoDestino(plantilla): 'barricas'|'tanque'`
  - `capNormal(cap): 50|200|225|500|null`
  - `ENV_KEYS = ['cap50','cap200','cap225','cap500','vasija_grande']`
  - `envasesDe(lote): Envases`, donde `Envases = {cap50,cap200,cap225,cap500,vasija_grande}` (números, 0 si vacío).
  - `fotoLote(lote): Envases & {litros_actuales, vasija_actual}`, con los valores tal cual están en el lote.
  - `vaciadoDeLote(otLote, lote, plantilla): {vaciado: Envases, avisos: string[]}`
  - `llenadoDeEntrada(entrada, tipo, padron): {llenado: Envases, litros: number|null, mermas: {barril,cap,litros}[], vasija_texto: string, avisos: string[], bloqueado: boolean}`, donde la `entrada` es:
    - de tanque: `{vasija: string, cm, litros_manual}`;
    - de barricas: `{barricas_llenas, mermas: [{barril, cap, litros}]}`.
  - `proponer({ot, lotes, mermas, padron, entradas, hoy}): {tipo, corte: string|null, items: Item[]}`, donde:
    - `entradas = {por_lote: Entrada[], corte: Entrada|null}`;
    - cada `Item = {lote, indice: number|null, antes, despues: Envases & {vasija_actual}, mermas_nuevas, mermas_cerradas: string[], litros_origen, litros_llegados, merma_litros, litros_despues, avisos, bloqueado}`;
    - `indice` es `null` para el lote del corte.
  - `recalcularItem(item, mermas): void`, que recalcula `item.litros_despues`.
  - `compararConMapa(item, otLote|null, barrilesDelLote: BarrilOT[]|null): {estado: 'coincide'|'difiere'|'sin-escanear'|'sin-datos', texto: string}`

- [ ] **Step 1: Escribir los tests que fallan**

`test/lotes-propuesta-ot.test.mjs`:

```js
/* La propuesta "asi queda cada lote" al confirmar una OT:
 *   envases despues = envases antes - lo que se vacio + lo que se lleno
 * (spec 2026-10-01). Puro: no aplica nada, eso es aplicarPropuesta. */
import { describe, it, expect } from 'vitest';
import { tipoDestino, capNormal, vaciadoDeLote, llenadoDeEntrada, proponer, recalcularItem,
         compararConMapa } from '../public/lotes/js/propuesta-ot.js';

const PADRON = [
  { num: '201', tipo: 'TANQUE AC.INOX.', cap_real: 4200, tabla: 'tanque-40hl', activa: true },
  { num: '154', tipo: 'FOUDRE OVAL', cap_real: 2000, tabla: null, activa: true },
];
const b = (num, cap = 225) => ({ num, cap, estado: 'LLENO' });
const DOCE = Array.from({ length: 12 }, (_, i) => b('1' + i));

function ot(plantilla, lotes, extra = {}) {
  return { id: 'ot-1', ot: 'OT-2026-014', plantilla, destino: 'T 201', lote_corte: null,
    lotes: lotes.map((l, i) => ({ barriles: [], litros_previstos: null, barricas_previstas: null,
      mov_id: 'ot-1-' + i, ...l })), ...extra };
}

describe('tipoDestino y capNormal', () => {
  it('cada plantilla sabe si llena barricas o un tanque', () => {
    expect(tipoDestino('barricas-barricas')).toBe('barricas');
    expect(tipoDestino('tq-barricas')).toBe('barricas');
    expect(tipoDestino('barrica-tanque')).toBe('tanque');
    expect(tipoDestino('tq-tq')).toBe('tanque');
    expect(tipoDestino('barricas-tanque')).toBe('tanque');
  });
  it('228 y 300 son barricas de 225; lo raro es null', () => {
    expect([capNormal(228), capNormal(300), capNormal('500'), capNormal(1000), capNormal(null)])
      .toEqual([225, 225, 500, null, null]);
  });
});

describe('vaciadoDeLote', () => {
  it('cuenta los barriles de la foto por capacidad', () => {
    const r = vaciadoDeLote({ barriles: [b('1'), b('2', 228), b('3', 500)] }, { cap225: 5, cap500: 1 }, 'barricas-barricas');
    expect(r.vaciado).toMatchObject({ cap225: 2, cap500: 1, vasija_grande: 0 });
    expect(r.avisos).toEqual([]);
  });
  it('si la OT vacia mas de lo que el lote tiene, recorta y avisa', () => {
    const r = vaciadoDeLote({ barriles: DOCE }, { cap225: 10 }, 'barricas-barricas');
    expect(r.vaciado.cap225).toBe(10);
    expect(r.avisos[0]).toMatch(/tenía 10.*vació 12/);
  });
  it('origen tanque descuenta los litros previstos del tanque', () => {
    const r = vaciadoDeLote({ barriles: [], litros_previstos: 3000 }, { vasija_grande: 4075 }, 'tq-barricas');
    expect(r.vaciado.vasija_grande).toBe(3000);
  });
  it('sin barriles ni litros previstos se vacia el tanque entero', () => {
    const r = vaciadoDeLote({ barriles: [] }, { vasija_grande: 4075 }, 'tq-tq');
    expect(r.vaciado.vasija_grande).toBe(4075);
  });
});

describe('llenadoDeEntrada', () => {
  it('tanque con tabla: cm a litros', () => {
    const r = llenadoDeEntrada({ vasija: 'T 201', cm: 30 }, 'tanque', PADRON);
    expect(r).toMatchObject({ litros: 4075, bloqueado: false, vasija_texto: 'T 201' });
    expect(r.llenado.vasija_grande).toBe(4075);
  });
  it('tanque con cm fuera de rango queda bloqueado', () => {
    const r = llenadoDeEntrada({ vasija: '201', cm: 250 }, 'tanque', PADRON);
    expect(r.bloqueado).toBe(true);
    expect(r.avisos[0]).toMatch(/190/);
  });
  it('tanque sin tabla usa los litros a mano', () => {
    expect(llenadoDeEntrada({ vasija: '154', litros_manual: 1900 }, 'tanque', PADRON).litros).toBe(1900);
    expect(llenadoDeEntrada({ vasija: '154' }, 'tanque', PADRON).bloqueado).toBe(true);
  });
  it('barricas: llenas + mermas', () => {
    const r = llenadoDeEntrada({ barricas_llenas: 11, mermas: [{ barril: '777', cap: 225, litros: 180 }] }, 'barricas', PADRON);
    expect(r.llenado.cap225).toBe(12);
    expect(r.litros).toBe(11 * 225 + 180);
    expect(r.vasija_texto).toBe('12 barricas');
    expect(r.mermas).toHaveLength(1);
  });
  it('una merma con litros imposibles bloquea', () => {
    expect(llenadoDeEntrada({ barricas_llenas: 1, mermas: [{ barril: '7', cap: 225, litros: 300 }] }, 'barricas', PADRON).bloqueado).toBe(true);
  });
});

describe('proponer', () => {
  it('barricas a barricas: 12 vacias, 11 llenas + 1 merma', () => {
    const lotes = [{ lote: 26217, cap225: 12, litros_actuales: 2700, vasija_actual: 'Nave 2' }];
    const p = proponer({ ot: ot('barricas-barricas', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ barricas_llenas: 11, mermas: [{ barril: '777', cap: 225, litros: 180 }] }], corte: null } });
    const it0 = p.items[0];
    expect(it0.despues).toMatchObject({ cap225: 12, vasija_actual: '12 barricas' });
    expect(it0.litros_despues).toBe(2655);
    expect(it0.merma_litros).toBe(45);
    expect(it0.mermas_nuevas[0]).toMatchObject({ lote: '26217', barril: '777', litros: 180, desde: '2026-10-01', ot: 'OT-2026-014' });
  });

  it('barrica a tanque: el lote queda en el tanque con lo medido', () => {
    const lotes = [{ lote: 26217, cap225: 19, litros_actuales: 4275 }];
    const p = proponer({ ot: ot('barrica-tanque', [{ lote: '26217', barriles: DOCE.concat(DOCE.slice(0, 7)), litros_previstos: 4275 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ vasija: 'T 201', cm: 30 }], corte: null } });
    expect(p.items[0].despues).toMatchObject({ cap225: 0, vasija_grande: 4075, vasija_actual: 'T 201' });
    expect(p.items[0].litros_despues).toBe(4075);
    expect(p.items[0].merma_litros).toBe(200);
  });

  it('OT parcial: las barricas que no fueron quedan', () => {
    const lotes = [{ lote: 26217, cap225: 20 }];
    const p = proponer({ ot: ot('barrica-tanque', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ vasija: '154', litros_manual: 2650 }], corte: null } });
    expect(p.items[0].despues).toMatchObject({ cap225: 8, vasija_grande: 2650 });
    expect(p.items[0].litros_despues).toBe(8 * 225 + 2650);
  });

  it('una merma pendiente en un barril que se vacia se cierra', () => {
    const lotes = [{ lote: 26217, cap225: 12 }];
    const mermas = [{ id: 'mer-viejo', lote: '26217', barril: '10', cap: 225, litros: 200, resuelta_el: '' }];
    const p = proponer({ ot: ot('barrica-tanque', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]),
      lotes, mermas, padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ vasija: 'T 201', cm: 30 }], corte: null } });
    expect(p.items[0].mermas_cerradas).toEqual(['mer-viejo']);
    expect(p.items[0].litros_despues).toBe(4075);
  });

  it('corte: los origenes se vacian y el lote nuevo recibe el tanque', () => {
    const lotes = [{ lote: 26300, litros_actuales: 0 }, { lote: 25315, cap225: 5 }, { lote: 25324, cap225: 3 }];
    const o = ot('barricas-tanque', [
      { lote: '25315', barriles: DOCE.slice(0, 5), litros_previstos: 1125 },
      { lote: '25324', barriles: DOCE.slice(5, 8), litros_previstos: 675 },
    ], { lote_corte: { lote: '26300', id_texto: 'Corte' } });
    const p = proponer({ ot: o, lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{}, {}], corte: { vasija: '154', litros_manual: 1750 } } });
    expect(p.corte).toBe('26300');
    expect(p.items.map(i => [i.lote, i.litros_despues])).toEqual([['25315', 0], ['25324', 0], ['26300', 1750]]);
    // 1800 previstos - 1750 medidos = 50 de merma, repartida por litros
    expect(p.items[0].merma_litros).toBe(31.3);
    expect(p.items[1].merma_litros).toBe(18.8);
    expect(p.items[2]).toMatchObject({ indice: null, despues: { vasija_grande: 1750, vasija_actual: 'T 154' } });
  });

  it('avisa si el lote que recibe queda en 0 L', () => {
    const p = proponer({ ot: ot('barricas-barricas', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]),
      lotes: [{ lote: 26217, cap225: 12 }], mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ barricas_llenas: 0, mermas: [] }], corte: null } });
    expect(p.items[0].avisos).toContain('El lote queda en 0 L y pasa a inactivo.');
  });

  it('un lote que no existe queda bloqueado', () => {
    const p = proponer({ ot: ot('barricas-barricas', [{ lote: '99999' }]), lotes: [], mermas: [], padron: PADRON,
      hoy: '2026-10-01', entradas: { por_lote: [{ barricas_llenas: 1 }], corte: null } });
    expect(p.items[0].bloqueado).toBe(true);
  });

  it('recalcularItem toma las correcciones del despues', () => {
    const lotes = [{ lote: 26217, cap225: 12 }];
    const p = proponer({ ot: ot('barricas-barricas', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ barricas_llenas: 12, mermas: [] }], corte: null } });
    p.items[0].despues.cap225 = 11;
    recalcularItem(p.items[0], []);
    expect(p.items[0].litros_despues).toBe(2475);
  });
});

describe('compararConMapa', () => {
  const item = { despues: { cap50: 0, cap200: 0, cap225: 12, cap500: 0, vasija_grande: 0 } };
  it('sin datos del Mapa', () => {
    expect(compararConMapa(item, null, null).estado).toBe('sin-datos');
  });
  it('si un barril vaciado sigue LLENO con el lote, falta escanear', () => {
    expect(compararConMapa(item, { barriles: [b('1')] }, [b('1')]).estado).toBe('sin-escanear');
  });
  it('coincide contando LLENO y MERMO por capacidad', () => {
    const mapa = [...Array.from({ length: 11 }, (_, i) => b('n' + i)), { num: 'm', cap: 225, estado: 'MERMO' }];
    expect(compararConMapa(item, { barriles: [b('viejo')] }, mapa).estado).toBe('coincide');
  });
  it('difiere y dice cuanto ve el Mapa', () => {
    const r = compararConMapa(item, { barriles: [] }, Array.from({ length: 10 }, (_, i) => b('n' + i)));
    expect(r).toEqual({ estado: 'difiere', texto: '⚠ el Mapa dice 10×225' });
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npx vitest run test/lotes-propuesta-ot.test.mjs`

Expected: FAIL, porque no se encuentra `propuesta-ot.js`.

- [ ] **Step 3: Implementar `propuesta-ot.js`**

`public/lotes/js/propuesta-ot.js`:

```js
/* ===== Lotes CIW — propuesta "asi queda cada lote" al confirmar una OT (puro) =====
 *
 *   envases despues = envases antes - vaciado + llenado
 *   litros despues  = litrosDeEnvases(despues) - faltante de las mermas pendientes
 *
 * Vaciado: la foto de barriles de la OT por capacidad; si el origen es tanque
 * (o la OT no tiene barriles), los litros previstos salen de vasija_grande.
 * Llenado: un tanque (cm -> litros con la cubicacion, o litros a mano) o N
 * barricas llenas + las mermas. En un corte los origenes solo vacian y el lote
 * del corte recibe el tanque. Nada se aplica aca: ver aplicarPropuesta. */
'use strict';

import { litrosDeEnvases, resumenEnvases } from './envases.js';
import { litrosPorCm } from './cubicacion.js';
import { buscarVasija } from './vasijas-padron.js';
import { codigoLote, faltanteDe, estaPendiente } from './mermas.js';
import { origenTanque, LITROS_BARRICA } from './ot-plantillas.js';

export const DESTINO_POR_PLANTILLA = {
  'barricas-barricas': 'barricas',
  'tq-barricas': 'barricas',
  'barrica-tanque': 'tanque',
  'tq-tq': 'tanque',
  'barricas-tanque': 'tanque',   // Corte
};
export const tipoDestino = pl => DESTINO_POR_PLANTILLA[pl] || 'tanque';

export const ENV_KEYS = ['cap50', 'cap200', 'cap225', 'cap500', 'vasija_grande'];
const CLAVE = { 50: 'cap50', 200: 'cap200', 225: 'cap225', 500: 'cap500' };
const EQUIV = { 228: 225, 300: 225 };   // mismo criterio que EQUIV_CAP de cruce.ts

const r1 = x => Math.round(x * 10) / 10;
const n0 = x => { const v = Number(x); return Number.isFinite(v) && v > 0 ? v : 0; };
const numONull = x => {
  if (x === '' || x == null) return null;
  const v = typeof x === 'number' ? x : parseFloat(String(x).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};
const vacio = () => ({ cap50: 0, cap200: 0, cap225: 0, cap500: 0, vasija_grande: 0 });

export function capNormal(cap){
  const n = Number(cap);
  if (!Number.isFinite(n)) return null;
  const c = EQUIV[n] ?? n;
  return CLAVE[c] ? c : null;
}

export function envasesDe(lote){
  const e = vacio();
  for (const k of ENV_KEYS) e[k] = n0(lote && lote[k]);
  return e;
}

export function fotoLote(lote){
  const f = {};
  for (const k of ENV_KEYS) f[k] = lote[k] ?? null;
  f.litros_actuales = lote.litros_actuales ?? 0;
  f.vasija_actual = lote.vasija_actual ?? '';
  return f;
}

const textoEnv = (e, k) => k === 'vasija_grande' ? `${e[k]} L en tanque` : `${e[k]} de ${k.slice(3)} L`;

export function vaciadoDeLote(otLote, lote, plantilla){
  const v = vacio(), avisos = [];
  const antes = envasesDe(lote);
  const bs = (otLote && otLote.barriles) || [];
  if (origenTanque(plantilla) || !bs.length){
    const prev = numONull(otLote && otLote.litros_previstos);
    v.vasija_grande = prev != null && prev > 0 ? prev : antes.vasija_grande;
    if (!bs.length && !origenTanque(plantilla) && !antes.vasija_grande)
      avisos.push('La OT no tiene barriles ni tanque de origen: no se descontó nada.');
  } else {
    for (const x of bs){
      const c = capNormal(x.cap);
      if (c) v[CLAVE[c]]++;
      else avisos.push(`Barril ${x.num} sin capacidad conocida: no se descontó.`);
    }
  }
  for (const k of ENV_KEYS){
    if (v[k] > antes[k]){
      avisos.push(`El lote tenía ${textoEnv(antes, k)} y la OT vació ${textoEnv(v, k)}: queda en 0.`);
      v[k] = antes[k];
    }
  }
  return { vaciado: v, avisos };
}

export function llenadoDeEntrada(entrada, tipo, padron){
  const e = entrada || {};
  const llenado = vacio(), avisos = [], mermas = [];
  let litros = null, bloqueado = false, vasija_texto = '';

  if (tipo === 'tanque'){
    const v = buscarVasija(padron, e.vasija);
    vasija_texto = String(e.vasija || '').trim() || (v ? 'T ' + v.num : '');
    if (v && /^\d+$/.test(vasija_texto)) vasija_texto = 'T ' + vasija_texto;
    const cmDado = e.cm !== '' && e.cm != null;
    if (v && v.tabla && cmDado){
      const r = litrosPorCm(v, e.cm);
      if (r.error === 'fuera-de-rango'){ bloqueado = true; avisos.push(`Los cm están fuera de la tabla (máximo ${r.max} cm).`); }
      else if (r.error){ bloqueado = true; avisos.push('Los cm no son un número válido.'); }
      else litros = r.litros;
    } else {
      litros = numONull(e.litros_manual);
      if (litros == null || litros < 0){
        bloqueado = true; litros = null;
        avisos.push(v && v.tabla ? 'Faltan los cm de merma del tanque.' : 'Faltan los litros del tanque.');
      }
    }
    if (litros != null) llenado.vasija_grande = litros;
    if (!v && vasija_texto) avisos.push(`La vasija ${vasija_texto} no está en el padrón: se usan los litros a mano.`);
  } else {
    const n = Math.max(0, Math.floor(n0(e.barricas_llenas)));
    llenado.cap225 = n;
    litros = n * LITROS_BARRICA;
    for (const m of e.mermas || []){
      const c = capNormal(m.cap ?? LITROS_BARRICA) ?? LITROS_BARRICA;
      const l = numONull(m.litros);
      if (!String(m.barril || '').trim() || l == null || l <= 0 || l >= c){
        bloqueado = true;
        avisos.push(`Merma ${m.barril || '(sin número)'}: los litros tienen que estar entre 0 y ${c}.`);
        continue;
      }
      llenado[CLAVE[c]]++;
      litros += l;
      mermas.push({ barril: String(m.barril).trim(), cap: c, litros: l });
    }
    const total = n + mermas.length;
    vasija_texto = total === 1 ? '1 barrica' : `${total} barricas`;
  }
  return { llenado, litros: litros == null ? null : r1(litros), mermas, vasija_texto, avisos, bloqueado };
}

function sumar(a, b, signo = 1){
  const out = vacio();
  for (const k of ENV_KEYS) out[k] = r1(Math.max(0, a[k] + signo * b[k]));
  return out;
}

/* Litros despues del item, contando las mermas que quedan pendientes. */
export function recalcularItem(item, mermas){
  const L = codigoLote(item.lote);
  const cerradas = new Set(item.mermas_cerradas || []);
  const faltante = (mermas || [])
    .filter(m => estaPendiente(m) && codigoLote(m.lote) === L && !cerradas.has(m.id))
    .concat(item.mermas_nuevas || [])
    .reduce((s, m) => s + faltanteDe(m), 0);
  item.litros_despues = Math.max(0, r1(litrosDeEnvases(item.despues) - faltante));
}

export function proponer({ ot, lotes, mermas, padron, entradas, hoy }){
  const tipo = tipoDestino(ot.plantilla);
  const corte = (ot.lote_corte && String(ot.lote_corte.lote || '').trim()) || null;
  const buscar = num => (lotes || []).find(l => String(l.lote) === String(num));
  const items = [];

  ot.lotes.forEach((ol, i) => {
    const lote = buscar(ol.lote);
    if (!lote){
      items.push({ lote: String(ol.lote), indice: i, antes: null, despues: null, mermas_nuevas: [],
        mermas_cerradas: [], litros_origen: null, litros_llegados: null, merma_litros: null,
        litros_despues: null, avisos: ['El lote no existe en la tabla de Lotes.'], bloqueado: true });
      return;
    }
    const { vaciado, avisos } = vaciadoDeLote(ol, lote, ot.plantilla);
    let env = sumar(envasesDe(lote), vaciado, -1);
    let vasija = lote.vasija_actual || '';
    let llegados = null, bloqueado = false, nuevas = [];
    if (!corte){
      const ll = llenadoDeEntrada((entradas.por_lote || [])[i], tipo, padron);
      env = sumar(env, ll.llenado);
      llegados = ll.litros; bloqueado = ll.bloqueado; avisos.push(...ll.avisos);
      vasija = ll.vasija_texto || vasija;
      nuevas = ll.mermas.map(m => ({ lote: String(ol.lote), barril: m.barril, cap: m.cap, litros: m.litros,
        desde: hoy, ot: ot.ot }));
    } else if (litrosDeEnvases(env) <= 0) vasija = '';
    const vaciados = new Set(((ol.barriles) || []).map(x => String(x.num)));
    const cerradas = (mermas || []).filter(m => estaPendiente(m) && codigoLote(m.lote) === codigoLote(ol.lote)
      && vaciados.has(String(m.barril))).map(m => m.id);
    const origen = numONull(ol.litros_previstos);
    const item = { lote: String(ol.lote), indice: i, antes: fotoLote(lote), despues: { ...env, vasija_actual: vasija },
      mermas_nuevas: nuevas, mermas_cerradas: cerradas, litros_origen: origen, litros_llegados: llegados,
      merma_litros: origen != null && llegados != null ? r1(origen - llegados) : null,
      litros_despues: null, avisos, bloqueado };
    recalcularItem(item, mermas);
    // En un corte el origen quedando en 0 es lo esperado; en un trasiego no.
    if (!corte && item.litros_despues <= 0) avisos.push('El lote queda en 0 L y pasa a inactivo.');
    items.push(item);
  });

  if (corte){
    const lote = buscar(corte);
    const ll = llenadoDeEntrada(entradas.corte, 'tanque', padron);
    if (!lote){
      items.push({ lote: corte, indice: null, antes: null, despues: null, mermas_nuevas: [], mermas_cerradas: [],
        litros_origen: null, litros_llegados: ll.litros, merma_litros: null, litros_despues: null,
        avisos: ['El lote del corte no existe en la tabla de Lotes.'], bloqueado: true });
    } else {
      const env = sumar(envasesDe(lote), ll.llenado);
      const item = { lote: corte, indice: null, antes: fotoLote(lote),
        despues: { ...env, vasija_actual: ll.vasija_texto || lote.vasija_actual || '' },
        mermas_nuevas: [], mermas_cerradas: [], litros_origen: null, litros_llegados: ll.litros,
        merma_litros: null, litros_despues: null, avisos: ll.avisos, bloqueado: ll.bloqueado };
      recalcularItem(item, mermas);
      if (item.litros_despues <= 0) item.avisos.push('El lote del corte queda en 0 L.');
      items.push(item);
    }
    // La merma del corte es una sola (lo que salio menos lo que se midio en el
    // tanque) y se reparte entre los origenes segun sus litros.
    const origenes = items.filter(x => x.indice != null && x.litros_origen != null);
    const total = origenes.reduce((s, x) => s + x.litros_origen, 0);
    if (ll.litros != null && total > 0){
      const merma = total - ll.litros;
      for (const x of origenes) x.merma_litros = r1(merma * x.litros_origen / total);
    }
  }
  return { tipo, corte, items };
}

export function compararConMapa(item, otLote, barrilesDelLote){
  if (!Array.isArray(barrilesDelLote)) return { estado: 'sin-datos', texto: 'No se pudo comparar con el Mapa' };
  const llenos = new Set(barrilesDelLote.filter(x => x.estado === 'LLENO').map(x => String(x.num)));
  if (((otLote && otLote.barriles) || []).some(x => llenos.has(String(x.num))))
    return { estado: 'sin-escanear', texto: 'Todavía sin escanear el vaciado' };
  const cuenta = vacio();
  for (const x of barrilesDelLote){
    if (x.estado !== 'LLENO' && x.estado !== 'MERMO') continue;
    const c = capNormal(x.cap);
    if (c) cuenta[CLAVE[c]]++;
  }
  const d = (item && item.despues) || {};
  const igual = ['cap50', 'cap200', 'cap225', 'cap500'].every(k => cuenta[k] === n0(d[k]));
  if (igual) return { estado: 'coincide', texto: '✓ coincide con el Mapa' };
  return { estado: 'difiere', texto: '⚠ el Mapa dice ' + (resumenEnvases(cuenta) || 'ninguna barrica') };
}
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `npx vitest run test/lotes-propuesta-ot.test.mjs`

Expected: PASS. Si falla el corte por el redondeo (31,3 / 18,8), verificar la cuenta: 50 × 1125/1800 = 31,25 → `Math.round(312,5)/10` = 31,3; 50 × 675/1800 = 18,75 → 18,8.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add public/lotes/js/propuesta-ot.js test/lotes-propuesta-ot.test.mjs
git commit -m "feat(lotes): propuesta de envases y litros al confirmar una OT

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Aplicar la propuesta y guardar la merma en el movimiento

**Files:**
- Modify: `public/lotes/js/propuesta-ot.js` (se agrega `aplicarPropuesta`)
- Modify: `public/lotes/js/ot-armado.js` (`confirmarOT`, cerca de la línea 92)
- Test: `test/lotes-propuesta-ot.test.mjs`, `test/lotes-ot-armado.test.mjs`

**Interfaces:**
- Consumes:
  - `proponer` e `Item` (Task 5)
  - `nuevaMerma`, `resolver`, `litrosDelLote` (Task 3)
- Produces:
  - `aplicarPropuesta(datos, ot, propuesta, aplicar: Set<string>, usuario, hoy): void`. Muta `datos.lotes`, `datos.mermas` y `ot.lotes[i].aplicado` / `ot.lote_corte.aplicado`.
  - `confirmarOT` acepta `por_lote[i].merma_litros`. Lo escribe en `ot.lotes[i].merma_litros`, en `ot.lotes[i].merma` y en `movimiento.merma_litros`.

- [ ] **Step 1: Tests que fallan**

Agregar `aplicarPropuesta` al import de `test/lotes-propuesta-ot.test.mjs` y sumar al final:

```js
describe('aplicarPropuesta', () => {
  function caso() {
    const datos = { lotes: [{ lote: 26217, cap225: 12, litros_actuales: 2700, vasija_actual: 'Nave 2' }],
      mermas: [{ id: 'mer-viejo', lote: '26217', barril: '10', cap: 225, litros: 200, resuelta_el: '' }] };
    const o = ot('barricas-barricas', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]);
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: datos.mermas, padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ barricas_llenas: 11, mermas: [{ barril: '777', cap: 225, litros: 180 }] }], corte: null } });
    return { datos, o, p };
  }

  it('con check escribe envases, litros, vasija, mermas y el antes/despues', () => {
    const { datos, o, p } = caso();
    aplicarPropuesta(datos, o, p, new Set(['26217']), 'ana', '2026-10-01');
    expect(datos.lotes[0]).toMatchObject({ cap225: 12, cap500: null, vasija_grande: null,
      litros_actuales: 2655, vasija_actual: '12 barricas' });
    expect(datos.mermas.find(m => m.id === 'mer-viejo')).toMatchObject({ resuelta_como: 'vaciada', resuelta_el: '2026-10-01' });
    expect(datos.mermas.find(m => m.barril === '777')).toMatchObject({ id: 'mer-ot-1-26217-0', litros: 180, resuelta_el: '' });
    expect(o.lotes[0].aplicado).toMatchObject({ por: 'ana', el: '2026-10-01',
      antes: { cap225: 12, litros_actuales: 2700, vasija_actual: 'Nave 2' },
      despues: { cap225: 12, litros_actuales: 2655, vasija_actual: '12 barricas' } });
  });

  it('sin check no toca el lote ni las mermas', () => {
    const { datos, o, p } = caso();
    aplicarPropuesta(datos, o, p, new Set(), 'ana', '2026-10-01');
    expect(datos.lotes[0]).toMatchObject({ cap225: 12, litros_actuales: 2700, vasija_actual: 'Nave 2' });
    expect(datos.mermas).toHaveLength(1);
    expect(o.lotes[0].aplicado).toBeNull();
  });

  it('un item bloqueado no se aplica aunque tenga check', () => {
    const { datos, o, p } = caso();
    p.items[0].bloqueado = true;
    aplicarPropuesta(datos, o, p, new Set(['26217']), 'ana', '2026-10-01');
    expect(datos.lotes[0].litros_actuales).toBe(2700);
  });

  it('en el corte el antes/despues del lote nuevo queda en ot.lote_corte', () => {
    const datos = { lotes: [{ lote: 26300, litros_actuales: 0 }, { lote: 25315, cap225: 5, litros_actuales: 1125 }], mermas: [] };
    const o = ot('barricas-tanque', [{ lote: '25315', barriles: DOCE.slice(0, 5), litros_previstos: 1125 }],
      { lote_corte: { lote: '26300', id_texto: 'Corte' } });
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{}], corte: { vasija: '154', litros_manual: 1100 } } });
    aplicarPropuesta(datos, o, p, new Set(['25315', '26300']), 'ana', '2026-10-01');
    expect(datos.lotes[1]).toMatchObject({ cap225: null, litros_actuales: 0, vasija_actual: '' });
    expect(datos.lotes[0]).toMatchObject({ vasija_grande: 1100, litros_actuales: 1100, vasija_actual: 'T 154' });
    expect(o.lote_corte.aplicado.despues.litros_actuales).toBe(1100);
  });
});
```

En `test/lotes-ot-armado.test.mjs`, dentro del `describe` de `confirmarOT`, agregar:

```js
  it('guarda la merma en litros en la OT y en el movimiento', () => {
    const ot = otDe([{ lote: '26217', barriles: CINCO }]);
    const movs = movimientosDeOT(ot, 'ana', '2026-09-23');
    confirmarOT(ot, movs, { operario: 'Juan', por_lote: [{ destino_real: 'T 201', litros_reales: 1100, merma_litros: 25 }] },
      'ana', '2026-09-24');
    expect(ot.lotes[0]).toMatchObject({ merma_litros: 25, merma: 25 });
    expect(movs[0].merma_litros).toBe(25);
  });
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npx vitest run test/lotes-propuesta-ot.test.mjs test/lotes-ot-armado.test.mjs`

Expected: FAIL, porque `aplicarPropuesta` no está exportada y `merma_litros` queda `undefined`.

- [ ] **Step 3: Implementar `aplicarPropuesta`**

1. Al principio de `propuesta-ot.js`, sumar el import:

```js
import { codigoLote, faltanteDe, estaPendiente, nuevaMerma, resolver, litrosDelLote } from './mermas.js';
```

Reemplaza al import anterior de `./mermas.js`.

2. Al final del archivo, agregar:

```js
/* Aplica los items con check. Los envases en 0 se guardan como null (como el
 * overlay de Envases deja los vacios); litros_actuales nunca null. */
export function aplicarPropuesta(datos, ot, propuesta, aplicar, usuario, hoy){
  if (!Array.isArray(datos.mermas)) datos.mermas = [];
  for (const item of propuesta.items){
    const lote = (datos.lotes || []).find(l => String(l.lote) === String(item.lote));
    const destino = item.indice == null ? ot.lote_corte : ot.lotes[item.indice];
    if (!lote || item.bloqueado || !item.despues || !aplicar.has(item.lote)){
      if (destino) destino.aplicado = null;
      continue;
    }
    const antes = fotoLote(lote);
    for (const k of ENV_KEYS) lote[k] = n0(item.despues[k]) > 0 ? r1(n0(item.despues[k])) : null;
    lote.vasija_actual = String(item.despues.vasija_actual || '').trim();
    for (const id of item.mermas_cerradas){
      const m = datos.mermas.find(x => x.id === id);
      if (m && estaPendiente(m)) resolver(m, 'vaciada', usuario, hoy);
    }
    item.mermas_nuevas.forEach((m, j) =>
      datos.mermas.push(nuevaMerma(m, `mer-${ot.id}-${codigoLote(item.lote)}-${j}`)));
    lote.litros_actuales = litrosDelLote(lote, datos.mermas);
    if (destino) destino.aplicado = { antes, despues: fotoLote(lote), por: usuario || '', el: hoy };
  }
}
```

- [ ] **Step 4: Implementar en `confirmarOT`**

En `public/lotes/js/ot-armado.js`, dentro del `forEach` de `confirmarOT`:

1. Reemplazar la línea `l.merma = r.merma ?? null;` por:

```js
    // merma_litros (2026-10-01) reemplaza al campo viejo sin unidad; merma se
    // sigue llenando para que las hojas ya impresas lean lo mismo.
    l.merma_litros = r.merma_litros ?? null;
    l.merma = r.merma_litros ?? r.merma ?? null;
```

2. Después de `m.litros = l.litros_reales;`, agregar:

```js
    m.merma_litros = l.merma_litros;
```

- [ ] **Step 5: Correr los tests**

Run: `npx vitest run test/lotes-propuesta-ot.test.mjs test/lotes-ot-armado.test.mjs`

Expected: PASS, incluidos los tests viejos de `confirmarOT`.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add public/lotes/js/propuesta-ot.js public/lotes/js/ot-armado.js test/lotes-propuesta-ot.test.mjs test/lotes-ot-armado.test.mjs
git commit -m "feat(lotes): aplicar la propuesta por lote con check y merma en litros en el movimiento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Pantalla de confirmación en dos pasos

**Files:**
- Rewrite: `public/lotes/js/vista-ot-confirmar.js`
- Modify: `public/lotes/index.html`. En el bloque `<style>` donde está `.otc-tabla`, agregar las clases `otc-*` nuevas.
- Modify: `public/lotes/js/nucleo.js`. En `cargarDatos`, agregar las secciones por defecto.

**Interfaces:**
- Consumes:
  - `proponer`, `recalcularItem`, `compararConMapa`, `aplicarPropuesta`, `tipoDestino`, `ENV_KEYS` (Tasks 5-6)
  - `confirmarOT` (Task 6)
  - `buscarVasija` (Task 2)
  - `litrosPorCm` (Task 1)
  - `barricasEstimadas` (`ot-plantillas.js`)
  - `GET API/barriles?lotes=…&nums=…` (Task 4)
- Produces: `abrirConfirmarOT(ot, onListo)`, con la misma firma de hoy. La llaman `vista-movimientos.js:397` y `vista-ot-lista.js:107`.

Esta tarea es de pantalla: no hay test unitario. Se verifica en el navegador en el Step 4.

- [ ] **Step 1: Secciones por defecto en `nucleo.js`**

En `cargarDatos`, después de `DATOS().excepciones_analisis = …`, agregar:

```js
    DATOS().vasijas              = DATOS().vasijas || [];
    DATOS().mermas               = DATOS().mermas || [];
```

Y en el comentario de la forma, al principio del archivo, sumar `vasijas, mermas`.

- [ ] **Step 2: Reescribir `vista-ot-confirmar.js`**

```js
/* ===== Lotes CIW — confirmar una OT en dos pasos (spec 2026-10-01) =====
 *
 * Paso 1, "Lo que pasó": por lote, el tanque destino y sus cm (o litros), o las
 * barricas llenas y las mermas. Paso 2, "Así queda cada lote": la propuesta
 * antes -> despues de propuesta-ot.js, comparada con el Mapa de Barriles, con
 * un check por lote. "Aplicar y guardar" confirma la OT (como siempre), aplica
 * los lotes con check y guarda. El Mapa solo se lee. */
'use strict';

import { $, esc, escA, num, DATOS, markDirty, guardar, usuarioActual, invalidarDashMap,
         mostrarOverlay, cerrarOverlay } from './nucleo.js';
import { confirmarOT } from './ot-armado.js';
import { barricasEstimadas } from './ot-plantillas.js';
import { proponer, recalcularItem, compararConMapa, aplicarPropuesta, tipoDestino, ENV_KEYS }
  from './propuesta-ot.js';
import { buscarVasija } from './vasijas-padron.js';
import { litrosPorCm } from './cubicacion.js';
import { resumenEnvases } from './envases.js';

const hoyISO = () => new Date().toISOString().slice(0, 10);
const fmtL = v => v == null ? '—' : Number(v).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' L';

async function leerMapa(lotes, nums){
  const qs = [];
  if (lotes.length) qs.push('lotes=' + encodeURIComponent(lotes.join(',')));
  if (nums.length) qs.push('nums=' + encodeURIComponent(nums.join(',')));
  try {
    const r = await fetch(API + '/barriles?' + qs.join('&'));
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

export function abrirConfirmarOT(ot, onListo){
  const st = { ot, onListo, tipo: tipoDestino(ot.plantilla), corte: !!(ot.lote_corte && ot.lote_corte.lote),
               entradas: null, mapa: null, propuesta: null, paso: 1,
               operario: '', pasos: false, comentario: '' };
  st.entradas = {
    por_lote: ot.lotes.map(l => st.tipo === 'tanque'
      ? { vasija: l.destino_real || ot.destino || '', cm: '', litros_manual: l.litros_reales ?? '' }
      : { barricas_llenas: l.barricas_previstas ?? barricasEstimadas(l.litros_previstos) ?? '', mermas: [] }),
    corte: st.corte ? { vasija: ot.destino || '', cm: '', litros_manual: '' } : null,
  };
  _paso1(st);
  // El Mapa se lee de entrada para ofrecer barriles en las mermas. Solo se
  // refrescan las listas: repintar el paso 1 le sacaria el foco a quien tipea,
  // y si ya paso al 2 lo devolveria para atras.
  leerMapa(ot.lotes.map(l => l.lote), []).then(m => {
    if (st.mapa) return;   // el paso 2 ya leyo uno mas nuevo
    st.mapa = m;
    if (st.paso !== 1) return;
    ot.lotes.forEach((_, i) => { const dl = $('otcBarr' + i); if (dl) dl.outerHTML = _dlBarriles(st, i); });
  });
}

/* ---------- paso 1 ---------- */

function _dlVasijas(){
  return '<datalist id="otcVasijas">' + (DATOS().vasijas || []).filter(v => v.activa !== false)
    .map(v => `<option value="T ${escA(v.num)}">${esc(v.tipo)} · ${esc(v.cap_real)} L${v.tabla ? '' : ' · sin tabla'}</option>`)
    .join('') + '</datalist>';
}

function _dlBarriles(st, i){
  const ol = st.ot.lotes[i];
  const enFoto = new Set((ol.barriles || []).map(b => String(b.num)));
  const delMapa = ((st.mapa && st.mapa.por_lote) || {})[ol.lote] || [];
  return `<datalist id="otcBarr${i}">` + delMapa
    .filter(b => (b.estado === 'LLENO' || b.estado === 'MERMO') && !enFoto.has(String(b.num)))
    .map(b => `<option value="${escA(b.num)}">${esc(b.estado)} · ${esc(b.cap ?? '')} L</option>`).join('') + '</datalist>';
}

function _bloqueTanque(id, e){
  return `<input class="txt otc-vas" list="otcVasijas" data-id="${id}" data-f="vasija" value="${escA(e.vasija)}" placeholder="T 201">
    <input class="txt otc-num" type="number" step="any" min="0" data-id="${id}" data-f="cm" value="${escA(e.cm)}" placeholder="cm">
    <input class="txt otc-num" type="number" step="any" min="0" data-id="${id}" data-f="litros_manual" value="${escA(e.litros_manual)}" placeholder="litros">
    <span class="otc-calc" id="otcCalc${id}"></span>`;
}

function _bloqueBarricas(st, i, e){
  const mermas = e.mermas.map((m, j) => `<div class="otc-merma">
      <input class="txt" list="otcBarr${i}" data-i="${i}" data-j="${j}" data-f="barril" value="${escA(m.barril)}" placeholder="N° barril">
      <input class="txt otc-num" type="number" step="any" min="0" data-i="${i}" data-j="${j}" data-f="litros" value="${escA(m.litros)}" placeholder="litros">
      <button class="btn" data-quitar="${i}:${j}" title="Quitar">✕</button></div>`).join('');
  return `<label>Barricas llenas <input class="txt otc-num" type="number" min="0" step="1" data-i="${i}" data-f="barricas_llenas" value="${escA(e.barricas_llenas)}"></label>
    <div class="otc-mermas">${mermas}<button class="btn" data-agregar="${i}">+ Barrica merma</button></div>${_dlBarriles(st, i)}`;
}

function _paso1(st){
  const { ot } = st;
  const filas = ot.lotes.map((l, i) => {
    const e = st.entradas.por_lote[i];
    const destino = st.corte ? '<span style="color:var(--muted)">va al tanque del corte</span>'
      : st.tipo === 'tanque' ? _bloqueTanque(String(i), e) : _bloqueBarricas(st, i, e);
    return `<tr><td><b>${esc(l.lote)}</b><br><span style="color:var(--muted)">${esc(l.id_texto)}</span></td>
      <td>${esc(fmtL(l.litros_previstos))}</td><td class="otc-dest">${destino}</td></tr>`;
  }).join('');
  const corte = st.corte ? `<div class="otc-corte"><b>Tanque del corte · lote ${esc(ot.lote_corte.lote)}</b>
      ${_bloqueTanque('c', st.entradas.corte)}</div>` : '';

  st.paso = 1;
  mostrarOverlay(`<div id="otcRaiz">
<h3 style="margin:0 0 4px">✓ Confirmar ${esc(ot.ot)} · 1 de 2: lo que pasó</h3>
<p style="margin:0 0 12px;color:var(--muted);font-size:13px">${st.tipo === 'tanque'
    ? 'Elegí el tanque y cargá los <b>cm de merma</b> medidos; si el tanque no tiene tabla, cargá los litros.'
    : 'Cargá cuántas barricas quedaron llenas y agregá las que quedaron mermas con sus litros.'}</p>
${_dlVasijas()}${corte}
<div class="otc-scroll"><table class="otc-tabla"><thead><tr><th>Lote</th><th>Previstos</th><th>Destino</th></tr></thead>
<tbody>${filas}</tbody></table></div>
<div style="display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center;margin-top:12px">
  <label>Operario</label><input class="txt" id="otcOperario" value="${escA(st.operario)}" placeholder="Quién lo hizo…">
  <label>Pasos</label><label><input type="checkbox" id="otcPasos"${st.pasos ? ' checked' : ''}> Todos los pasos de la hoja están cumplidos</label>
  <label>Comentario</label><input class="txt" id="otcComentario" value="${escA(st.comentario)}">
</div>
<div class="msg err" id="otcErr" style="display:none;margin-top:10px"></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="otcCancelar">Cancelar</button>
  <button class="btn primary" id="otcSig">Siguiente →</button>
</div></div>`);

  // Los listeners van en #otcRaiz y no en #overlayBox: el box sobrevive entre
  // overlays y cada repintado le sumaria otro listener.
  const box = $('otcRaiz');
  box.addEventListener('input', ev => _leerCampo(st, ev.target));
  box.addEventListener('click', ev => {
    const ag = ev.target.closest('[data-agregar]'), qu = ev.target.closest('[data-quitar]');
    if (ag){ _guardarCabecera(st); st.entradas.por_lote[+ag.dataset.agregar].mermas.push({ barril: '', litros: '' }); _paso1(st); }
    if (qu){ _guardarCabecera(st); const [i, j] = qu.dataset.quitar.split(':').map(Number);
      st.entradas.por_lote[i].mermas.splice(j, 1); _paso1(st); }
  });
  $('otcCancelar').addEventListener('click', () => cerrarOverlay());
  $('otcSig').addEventListener('click', () => _irAPaso2(st));
  ot.lotes.forEach((_, i) => _pintarCalc(st, String(i)));
  if (st.corte) _pintarCalc(st, 'c');
}

function _entradaDe(st, id){ return id === 'c' ? st.entradas.corte : st.entradas.por_lote[+id]; }

function _leerCampo(st, el){
  const f = el.dataset.f;
  if (!f) return;
  if (el.dataset.id != null){ _entradaDe(st, el.dataset.id)[f] = el.value; _pintarCalc(st, el.dataset.id); return; }
  const e = st.entradas.por_lote[+el.dataset.i];
  if (el.dataset.j != null) e.mermas[+el.dataset.j][f] = el.value; else e[f] = el.value;
}

/* Litros en vivo al lado del tanque: "4.075 L de 4.200". */
function _pintarCalc(st, id){
  const out = $('otcCalc' + id);
  if (!out) return;
  const e = _entradaDe(st, id);
  const v = buscarVasija(DATOS().vasijas, e.vasija);
  if (!v){ out.textContent = e.vasija ? 'no está en el padrón: cargá los litros' : ''; return; }
  if (!v.tabla){ out.textContent = `${v.tipo} · sin tabla: cargá los litros`; return; }
  if (e.cm === '' || e.cm == null){ out.textContent = `${v.tipo} · ${v.cap_real} L: cargá los cm`; return; }
  const r = litrosPorCm(v, e.cm);
  out.textContent = r.error === 'fuera-de-rango' ? `fuera de la tabla (máx. ${r.max} cm)`
    : r.error ? 'cm inválido' : `${fmtL(r.litros)} de ${fmtL(v.cap_real)}`;
}

function _guardarCabecera(st){
  if (!$('otcOperario')) return;
  st.operario = $('otcOperario').value.trim();
  st.pasos = $('otcPasos').checked;
  st.comentario = $('otcComentario').value;
}

async function _irAPaso2(st){
  _guardarCabecera(st);
  const err = m => { $('otcErr').textContent = m; $('otcErr').style.display = ''; };
  if (!st.operario) return err('Falta el operario: la confirmación registra quién hizo el trabajo.');
  $('otcSig').disabled = true;

  const lotes = st.ot.lotes.map(l => l.lote).concat(st.corte ? [st.ot.lote_corte.lote] : []);
  const nums = st.entradas.por_lote.flatMap(e => (e.mermas || []).map(m => String(m.barril || '').trim())).filter(Boolean);
  st.mapa = await leerMapa(lotes, nums);

  // Una barrica merma tiene que existir en el Mapa (mismo criterio que el escáner).
  if (nums.length){
    if (!st.mapa || !st.mapa.por_num){ $('otcSig').disabled = false; return err('No se pudo consultar el Mapa para validar las barricas mermas. Probá de nuevo.'); }
    const faltan = nums.filter(n => !st.mapa.por_num[n]);
    if (faltan.length){ $('otcSig').disabled = false; return err('Estos barriles no existen en el Mapa: ' + faltan.join(', ')); }
    for (const e of st.entradas.por_lote) for (const m of e.mermas || []){
      const b = st.mapa.por_num[String(m.barril).trim()];
      if (b) m.cap = b.cap;
    }
  }

  st.propuesta = proponer({ ot: st.ot, lotes: DATOS().lotes, mermas: DATOS().mermas, padron: DATOS().vasijas,
    entradas: st.entradas, hoy: hoyISO() });
  _paso2(st);
}

/* ---------- paso 2 ---------- */

const ETIQ = { cap500: '500', cap225: '225', cap200: '200', cap50: '50', vasija_grande: 'Tanque L' };

function _paso2(st){
  const porLote = (st.mapa && st.mapa.por_lote) || null;
  const filas = st.propuesta.items.map((it, k) => {
    const ol = it.indice == null ? null : st.ot.lotes[it.indice];
    const avisos = it.avisos.map(a => `<div class="otc-aviso">⚠ ${esc(a)}</div>`).join('');
    if (!it.despues) return `<tr><td><b>${esc(it.lote)}</b></td><td colspan="5">${avisos}</td><td></td></tr>`;
    const cmp = compararConMapa(it, ol, porLote ? (porLote[it.lote] ?? null) : null);
    const envs = ENV_KEYS.map(kk => `<label class="otc-env">${ETIQ[kk]}
        <input class="txt otc-num" type="number" step="any" min="0" data-k="${k}" data-env="${kk}" value="${escA(it.despues[kk] || '')}"></label>`).join('');
    return `<tr${it.bloqueado ? ' class="otc-bloq"' : ''}>
      <td><b>${esc(it.lote)}</b>${it.indice == null ? '<br><span style="color:var(--muted)">lote del corte</span>' : ''}</td>
      <td>${esc(resumenEnvases(it.antes) || '—')}<br>${esc(fmtL(it.antes.litros_actuales))}<br><span style="color:var(--muted)">${esc(it.antes.vasija_actual)}</span></td>
      <td><div class="otc-envs">${envs}</div>
          <input class="txt" data-k="${k}" data-env="vasija_actual" value="${escA(it.despues.vasija_actual)}" placeholder="Vasija actual"></td>
      <td><b id="otcLitros${k}">${esc(fmtL(it.litros_despues))}</b></td>
      <td>${esc(fmtL(it.merma_litros))}</td>
      <td class="otc-mapa otc-${cmp.estado}">${esc(cmp.texto)}${avisos}</td>
      <td><input type="checkbox" class="otc-check" data-k="${k}"${it.bloqueado ? ' disabled' : ' checked'}></td></tr>`;
  }).join('');

  st.paso = 2;
  mostrarOverlay(`<div id="otcRaiz">
<h3 style="margin:0 0 4px">✓ Confirmar ${esc(st.ot.ot)} · 2 de 2: así queda cada lote</h3>
<p style="margin:0 0 12px;color:var(--muted);font-size:13px">Revisá cada lote y corregí lo que haga falta. Solo se aplican los lotes con ☑;
los demás quedan como estaban (la OT se confirma igual).</p>
<div class="otc-scroll"><table class="otc-tabla"><thead><tr><th>Lote</th><th>Antes</th><th>Después</th><th>Litros</th><th>Merma</th><th>Mapa</th><th>Aplicar</th></tr></thead>
<tbody>${filas}</tbody></table></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="otcVolver">← Volver</button>
  <button class="btn primary" id="otcAplicar">Aplicar y guardar</button>
</div></div>`);

  $('otcRaiz').addEventListener('input', ev => {
    const el = ev.target; if (el.dataset.env == null) return;
    const it = st.propuesta.items[+el.dataset.k];
    it.despues[el.dataset.env] = el.dataset.env === 'vasija_actual' ? el.value : (num(el.value) ?? 0);
    recalcularItem(it, DATOS().mermas);
    $('otcLitros' + el.dataset.k).textContent = fmtL(it.litros_despues);
  });
  $('otcVolver').addEventListener('click', () => _paso1(st));
  $('otcAplicar').addEventListener('click', () => _aplicar(st));
}

async function _aplicar(st){
  $('otcAplicar').disabled = true; $('otcVolver').disabled = true;
  const aplicar = new Set();
  document.querySelectorAll('#otcRaiz .otc-check').forEach(c => {
    if (c.checked) aplicar.add(st.propuesta.items[+c.dataset.k].lote);
  });
  const porIndice = new Map(st.propuesta.items.filter(x => x.indice != null).map(x => [x.indice, x]));
  const hoy = hoyISO(), usuario = usuarioActual();
  const por_lote = st.ot.lotes.map((l, i) => {
    const it = porIndice.get(i);
    const e = st.entradas.por_lote[i];
    return {
      destino_real: st.corte ? (st.entradas.corte.vasija || st.ot.destino) : st.tipo === 'tanque' ? e.vasija : (it && it.despues ? it.despues.vasija_actual : ''),
      litros_reales: it ? it.litros_llegados : null,
      merma_litros: it ? it.merma_litros : null,
    };
  });
  const faltan = confirmarOT(st.ot, DATOS().movimientos || [], {
    operario: st.operario, pasos_cumplidos: st.pasos, comentario: st.comentario, por_lote,
  }, usuario, hoy);
  aplicarPropuesta(DATOS(), st.ot, st.propuesta, aplicar, usuario, hoy);
  markDirty();
  invalidarDashMap();
  st.onListo();
  const ok = await guardar();
  if (!ok) return;   // guardar() ya mostro el error o el conflicto (409)
  if (faltan.length){
    mostrarOverlay(`<h3 style="margin:0 0 14px">✓ ${esc(st.ot.ot)} confirmada</h3>
<div class="msg err">Algunos movimientos de esta OT ya no están en la tabla (¿los borraron?). La OT quedó confirmada igual.</div>
<div style="margin-top:18px;text-align:right"><button class="btn primary" id="otcCerrar">Entendido</button></div>`);
    $('otcCerrar').addEventListener('click', () => cerrarOverlay());
    return;
  }
  cerrarOverlay();
}
```

Antes de escribir, verificar con `grep -n "^export" public/lotes/js/nucleo.js` que `invalidarDashMap` y `guardar` se exportan desde `nucleo.js`. Ya se vio que sí.

- [ ] **Step 3: CSS**

En `public/lotes/index.html`, al lado de la regla existente de `.otc-tabla` (buscar con `grep -n "otc-tabla" public/lotes/index.html`), agregar:

```css
.otc-dest{min-width:340px}
.otc-dest .otc-vas{width:90px}.otc-dest .otc-num,.otc-env .otc-num{width:72px}
.otc-calc{font-size:12px;color:var(--muted);margin-left:6px}
.otc-merma{display:flex;gap:6px;margin:4px 0}
.otc-corte{margin:0 0 12px;padding:10px;border:1px solid var(--line);border-radius:8px}
.otc-envs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px}
.otc-env{display:flex;flex-direction:column;font-size:11px;color:var(--muted)}
.otc-aviso{font-size:12px;color:#ffb35c;margin-top:4px}
.otc-coincide{color:#54d38a}.otc-difiere{color:#ffb35c}.otc-sin-escanear,.otc-sin-datos{color:var(--muted)}
tr.otc-bloq td{opacity:.7}
```

- [ ] **Step 4: Verificar en el navegador**

Seguir la nota [[catenainstitute-verificar-en-navegador]]:

1. Arrancar la web con `preview_start` y la configuración de `dev:sin-ia` del `launch.json` de `Escritorio\claude`. Si no existe una entrada para este worktree, crearla: `npm run dev:sin-ia` con cwd en el worktree, puerto 8788.
2. La D1 local arranca vacía. Hay que sembrar, por la UI o con `javascript_tool`:
   - un lote 26217 con `cap225: 12`;
   - una vasija 189 (`cap_real: 4200, tabla: 'tanque-40hl'`) en `DATOS().vasijas` (o apretar "Cargar padrón inicial" cuando exista la Task 9);
   - un documento de barriles. Es solo para el test local: `wrangler d1 execute catenainstitute --local`, nunca `--remote`.
3. Usar un lote 26217 con `cap225: 19` (4.275 L) y sus 19 barriles LLENO en el Mapa local. Emitir una OT "Trasiego de barrica a tanque" con ese lote y confirmarla con **T 189** (tanque de 4.200 L, tabla 40 HL; ojo, T 201 es de 75 HL) y 30 cm. El paso 1 tiene que mostrar "4.075 L de 4.200 L".
4. En el paso 2 deben verse: antes "19×225 · 4.275 L", después Tanque 4075 y litros 4.075 L, merma 200 L.
5. Aplicar. La grilla de Lotes tiene que mostrar el lote con "grande 4075" y 4075 L, y el movimiento tiene que quedar con `merma_litros`.
6. Repetir con "Trasiego fin FML de barricas a barricas", con 11 llenas y una merma de 180 L. El lote tiene que quedar en `12×225` y en 2.655 L.
7. Revisar `read_console_messages` y comprobar que no haya errores.

- [ ] **Step 5: Correr toda la suite y hacer commit**

Run: `npm test && npx tsc --noEmit`

Expected: todo en verde.

```bash
git branch --show-current
git add public/lotes/js/vista-ot-confirmar.js public/lotes/js/nucleo.js public/lotes/index.html
git commit -m "feat(lotes): confirmar OT en dos pasos con propuesta, cubicacion y check por lote

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Mermas pendientes — sub-pestaña, cierre al guardar, Envases y Dashboard

**Files:**
- Create: `public/lotes/js/mermas-mapa.js`
- Create: `public/lotes/js/vista-mermas.js`
- Modify: `public/lotes/js/nucleo.js` (`registrarAntesDeGuardar` y su llamada en `guardar`)
- Modify: `public/lotes/js/vista-movimientos.js` (`_selectorSub`, `renderMovimientos`)
- Modify: `public/lotes/js/vista-lotes.js` (overlay de Envases, cerca de las líneas 421 y 445)
- Modify: `public/lotes/js/vista-dashboard.js` (FAQ, cerca de la línea 258)
- Modify: `public/lotes/index.html` (CSS de `.mer-*`)

**Interfaces:**
- Consumes:
  - `cerrarLlenasSegunMapa`, `llenaSegunMapa`, `estaPendiente`, `faltanteDe`, `resolver`, `recalcularLitros`, `litrosDelLote`, `codigoLote` (Task 3)
  - `GET API/barriles?nums=` (Task 4)
- Produces:
  - `registrarAntesDeGuardar(fn: (datos) => boolean)` en `nucleo.js`. Si alguna `fn` devuelve `true`, cambió algo.
  - `refrescarMapaMermas(): Promise<void>`, `porNumMermas(): Record<string, BarrilOT|null> | null` y `cerrarMermasLlenas(datos): boolean`, en `mermas-mapa.js`.
  - `renderMermas(contenedor, {onCambio})` en `vista-mermas.js`.

- [ ] **Step 1: El gancho en `nucleo.js`**

Encima de `export async function guardar(forzar){`, agregar:

```js
/* Funciones que corren justo antes de cada POST y pueden tocar DATOS(). Hoy:
 * el cierre de las barricas mermas que el Mapa ya ve llenas (mermas-mapa.js).
 * Van por registro y no por import para no armar el ciclo nucleo -> mermas-mapa -> nucleo. */
const _antesDeGuardar = [];
export function registrarAntesDeGuardar(fn){ _antesDeGuardar.push(fn); }
```

Dentro de `guardar`, después de `if (!dirty) return true;`, agregar:

```js
  for (const fn of _antesDeGuardar){
    try { if (fn(DATOS())) invalidarVistas(); } catch (e) { console.error('antesDeGuardar:', e); }
  }
```

- [ ] **Step 2: `mermas-mapa.js`**

```js
/* ===== Lotes CIW — las barricas mermas miran el Mapa de Barriles =====
 *
 * Guarda en memoria la ultima lectura del Mapa para los barriles de las mermas
 * pendientes. Al guardar Lotes (registrarAntesDeGuardar), las que el Mapa ya ve
 * LLENAS con el mismo lote se cierran y sus lotes recalculan litros. Asi la web
 * nunca guarda sola: el cierre viaja en un guardado que alguien pidio. */
'use strict';

import { DATOS, usuarioActual, registrarAntesDeGuardar, registrarInit } from './nucleo.js';
import { estaPendiente, cerrarLlenasSegunMapa, recalcularLitros } from './mermas.js';

let _porNum = null;

export const porNumMermas = () => _porNum;

export async function refrescarMapaMermas(){
  const nums = [...new Set((DATOS().mermas || []).filter(estaPendiente).map(m => String(m.barril)))];
  if (!nums.length){ _porNum = {}; return; }
  try {
    const r = await fetch(API + '/barriles?nums=' + encodeURIComponent(nums.join(',')));
    _porNum = r.ok ? ((await r.json()).por_num || {}) : null;
  } catch (e) { _porNum = null; }
}

export function cerrarMermasLlenas(datos){
  if (!_porNum || !Array.isArray(datos.mermas)) return false;
  const lotes = cerrarLlenasSegunMapa(datos.mermas, _porNum, usuarioActual() || 'Mapa',
    new Date().toISOString().slice(0, 10));
  if (!lotes.size) return false;
  recalcularLitros(datos.lotes, datos.mermas, lotes);
  return true;
}

registrarAntesDeGuardar(cerrarMermasLlenas);
registrarInit(() => { refrescarMapaMermas(); });
```

`registrarInit` ya existe en `nucleo.js` (corre en cada `cargarDatos`).

- [ ] **Step 3: `vista-mermas.js`**

```js
/* ===== Lotes CIW — sub-pestaña Movimientos -> Mermas =====
 * Las barricas que quedaron mermas despues de una OT, hasta que se completan. */
'use strict';

import { $, esc, escA, DATOS, markDirty, usuarioActual, pedirUsuario } from './nucleo.js';
import { estaPendiente, faltanteDe, llenaSegunMapa, resolver, recalcularLitros, codigoLote } from './mermas.js';
import { porNumMermas, refrescarMapaMermas } from './mermas-mapa.js';

let _verResueltas = false;

const dias = desde => {
  const d = Date.parse(desde); if (!Number.isFinite(d)) return '';
  return Math.max(0, Math.floor((Date.now() - d) / 86400000));
};

export function renderMermas(cont, { onCambio }){
  const porNum = porNumMermas();
  const todas = DATOS().mermas || [];
  const filas = todas.filter(m => _verResueltas || estaPendiente(m)).map(m => {
    const llena = estaPendiente(m) && porNum && llenaSegunMapa(m, porNum[String(m.barril)]);
    const estado = !estaPendiente(m)
      ? `resuelta (${esc(m.resuelta_como)}) ${esc(m.resuelta_el)}`
      : llena ? '✓ llena según el Mapa · se cierra al guardar' : 'pendiente';
    return `<tr class="${estaPendiente(m) ? (llena ? 'mer-llena' : '') : 'mer-resuelta'}">
      <td>${esc(m.lote)}</td><td>${esc(m.barril)}</td><td>${esc(m.litros)} / ${esc(m.cap)}</td>
      <td>${esc(faltanteDe(m))} L</td><td>${esc(m.ot)}</td><td>${esc(dias(m.desde))}</td><td>${estado}</td>
      <td>${estaPendiente(m) ? `<button class="btn" data-resolver="${escA(m.id)}">✓ resuelta</button>` : ''}</td></tr>`;
  }).join('');
  const pend = todas.filter(estaPendiente).length;
  cont.innerHTML = `<div class="toolbar">
    <span class="tag">${pend} pendiente${pend === 1 ? '' : 's'}</span>
    <label><input type="checkbox" id="merVerRes"${_verResueltas ? ' checked' : ''}> Ver resueltas</label>
    <button class="btn" id="merRefrescar">🔄 Mirar el Mapa</button>
    ${porNum === null ? '<span class="tag">No se pudo leer el Mapa</span>' : ''}</div>
  <div class="scroll"><table><thead><tr><th>Lote</th><th>Barril</th><th>Litros / cap</th><th>Falta</th><th>OT</th><th>Días</th><th>Estado</th><th></th></tr></thead>
  <tbody>${filas || '<tr><td colspan="8" style="color:var(--muted)">No hay barricas mermas.</td></tr>'}</tbody></table></div>`;

  $('merVerRes').addEventListener('change', e => { _verResueltas = e.target.checked; onCambio(); });
  $('merRefrescar').addEventListener('click', async () => { await refrescarMapaMermas(); onCambio(); });
  cont.querySelectorAll('[data-resolver]').forEach(b => b.addEventListener('click', () => {
    const m = todas.find(x => x.id === b.dataset.resolver);
    const quien = usuarioActual() || pedirUsuario(true);
    if (!m || !quien) return;
    if (!confirm(`¿Marcar la barrica ${m.barril} del lote ${m.lote} como resuelta?`)) return;
    resolver(m, 'manual', quien, new Date().toISOString().slice(0, 10));
    recalcularLitros(DATOS().lotes, DATOS().mermas, new Set([codigoLote(m.lote)]));
    markDirty();
    onCambio();
  }));
}
```

- [ ] **Step 4: El tercer botón en Movimientos**

En `public/lotes/js/vista-movimientos.js`:

1. Agregar el import `import { renderMermas } from './vista-mermas.js';`.
2. En `_selectorSub`, cambiar `b('historial', '📋 Historial') + b('ordenes', '📝 Órdenes de trabajo') + '</div>'` por:

```js
    b('historial', '📋 Historial') + b('ordenes', '📝 Órdenes de trabajo') + b('mermas', '🛢 Mermas') + '</div>';
```

3. En `renderMovimientos`, antes del `if (_sub === 'ordenes'){`, agregar:

```js
  if (_sub === 'mermas'){
    sec.innerHTML = _selectorSub() + '<div id="movMermas"></div>';
    _cablearSelector(sec);
    renderMermas($('movMermas'), { onCambio: renderMovimientos });
    return;
  }
```

4. Actualizar el comentario de `_sub`: los valores posibles son `'historial' | 'ordenes' | 'mermas'`.

- [ ] **Step 5: El overlay de Envases descuenta las mermas**

En `public/lotes/js/vista-lotes.js`:

1. Agregar el import `import { litrosDelLote } from './mermas.js';`.
2. Reemplazar `$('envTotal').textContent = String(litrosDeEnvases(vals));` por:

```js
    $('envTotal').textContent = String(litrosDelLote({ ...vals, lote: o.lote }, DATOS().mermas));
```

3. Reemplazar `o.litros_actuales = litrosDeEnvases(vals);` por:

```js
    // Menos lo que les falta a las barricas mermas pendientes (mermas.js).
    o.litros_actuales = litrosDelLote({ ...vals, lote: o.lote }, DATOS().mermas);
```

4. Verificar que `DATOS` ya esté importado de `nucleo.js` en ese archivo (`grep -n "DATOS" public/lotes/js/vista-lotes.js | head -3`). Si `litrosDeEnvases` queda sin uso, sacarlo del import.

- [ ] **Step 6: La tarjeta del Dashboard**

En `public/lotes/js/vista-dashboard.js`:

1. Agregar el import `import { estaPendiente } from './mermas.js';`.
2. Agregar `DATOS` al import de `nucleo.js` si no está.
3. Después de `const faEnProc = …`, agregar:

```js
  const barrMermas = (DATOS().mermas || []).filter(estaPendiente).length;
```

4. En `faqs`, agregar al final:

```js
    { n: barrMermas,  label: 'Barricas mermas',          hi: barrMermas > 0 },
```

- [ ] **Step 7: CSS**

En `public/lotes/index.html`, junto a las reglas `#tab-movimientos .mov-sub`:

```css
#tab-movimientos tr.mer-llena td{color:#54d38a}
#tab-movimientos tr.mer-resuelta td{opacity:.6}
```

- [ ] **Step 8: Verificar en el navegador**

Con la web local de la Task 7 y la OT de barricas que dejó una merma de 180 L:

1. En Movimientos → 🛢 Mermas tiene que aparecer la merma "180 / 225 · Falta 45 L · pendiente".
2. En el Dashboard tiene que aparecer "Barricas mermas: 1".
3. En la D1 local de barriles (`--local`), poner ese barril en `LLENO` con el mismo lote y la fecha de hoy. Apretar "🔄 Mirar el Mapa": tiene que decir "✓ llena según el Mapa · se cierra al guardar".
4. Editar cualquier celda y Guardar. La merma pasa a "resuelta (mapa)" y el lote vuelve a 2.700 L.
5. Abrir el overlay de Envases de un lote con una merma pendiente: el total tiene que descontar el faltante.
6. "✓ resuelta" pide confirmación y deja "resuelta (manual)".

- [ ] **Step 9: Suite y commit**

Run: `npm test && npx tsc --noEmit`

Expected: todo en verde.

```bash
git branch --show-current
git add public/lotes/js/mermas-mapa.js public/lotes/js/vista-mermas.js public/lotes/js/nucleo.js public/lotes/js/vista-movimientos.js public/lotes/js/vista-lotes.js public/lotes/js/vista-dashboard.js public/lotes/index.html
git commit -m "feat(lotes): barricas mermas pendientes con cierre por el Mapa al guardar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Configuración → Vasijas fijas

**Files:**
- Create: `public/lotes/js/vista-vasijas.js`
- Modify: `public/lotes/js/vista-config.js` (`renderConfig`, cerca de la línea 208)
- Modify: `public/lotes/index.html` (contenedor dentro de `#tab-config`, después de la tabla `tConfigProy`)

**Interfaces:**
- Consumes: `PADRON_INICIAL` (Task 2) y `TABLAS_CUBICACION` (Task 1).
- Produces: `renderVasijas(contenedor)`.

- [ ] **Step 1: El contenedor en el HTML**

En `public/lotes/index.html`, dentro de `<section class="view" id="tab-config">`, después del `</div>` que cierra la tabla `tConfigProy` y antes de `</section>`:

```html
    <h2 style="margin:22px 0 8px">Vasijas fijas</h2>
    <div class="note" style="margin-bottom:8px">
      Tanques, piletas, huevos y foudres (las barricas están en el Mapa de Barriles). La <b>Cap REAL</b> manda;
      la tabla de cubicación pasa los cm de merma a litros al confirmar una OT. Sin tabla, se cargan los litros a mano.
    </div>
    <div id="cfgVasijas"></div>
```

- [ ] **Step 2: `vista-vasijas.js`**

```js
/* ===== Lotes CIW — Configuracion -> Vasijas fijas =====
 * El padron vivo es DATOS().vasijas. Nunca se borra una vasija: se da de baja
 * (activa: false), porque las OT viejas la nombran. */
'use strict';

import { $, esc, escA, DATOS, markDirty } from './nucleo.js';
import { PADRON_INICIAL, normalizarNumVasija } from './vasijas-padron.js';
import { TABLAS_CUBICACION } from './cubicacion-tablas.js';

const OPCIONES_TABLA = [['', 'sin tabla'], ...Object.entries(TABLAS_CUBICACION).map(([k, t]) => [k, t.nombre])];

export function renderVasijas(cont){
  if (!cont) return;
  if (!Array.isArray(DATOS().vasijas)) DATOS().vasijas = [];
  const vs = DATOS().vasijas;
  if (!vs.length){
    cont.innerHTML = `<button class="btn primary" id="vasInicial">⬇ Cargar padrón inicial (${PADRON_INICIAL.length} vasijas)</button>`;
    $('vasInicial').addEventListener('click', () => {
      DATOS().vasijas = PADRON_INICIAL.map(v => ({ ...v }));
      markDirty(); renderVasijas(cont);
    });
    return;
  }
  const sel = (i, val) => `<select class="cell" data-i="${i}" data-f="tabla">` + OPCIONES_TABLA.map(([k, n]) =>
    `<option value="${escA(k)}"${(val || '') === k ? ' selected' : ''}>${esc(n)}</option>`).join('') + '</select>';
  const filas = vs.map((v, i) => `<tr${v.activa === false ? ' style="opacity:.5"' : ''}>
    <td><input class="cell" data-i="${i}" data-f="num" value="${escA(v.num)}"></td>
    <td><input class="cell" data-i="${i}" data-f="tipo" value="${escA(v.tipo)}"></td>
    <td><input class="cell num" type="number" min="0" step="any" data-i="${i}" data-f="cap_real" value="${escA(v.cap_real)}"></td>
    <td>${sel(i, v.tabla)}</td>
    <td><label><input type="checkbox" data-i="${i}" data-f="activa"${v.activa === false ? '' : ' checked'}> activa</label></td></tr>`).join('');
  cont.innerHTML = `<div class="toolbar"><button class="btn" id="vasAgregar">➕ Agregar vasija</button>
    <span class="tag">${vs.filter(v => v.activa !== false).length} activas</span><span class="msg err" id="vasErr" style="display:none"></span></div>
  <div class="scroll tall"><table><thead><tr><th>N°</th><th>Tipo</th><th>Cap REAL (L)</th><th>Tabla de cubicación</th><th></th></tr></thead>
  <tbody>${filas}</tbody></table></div>`;

  $('vasAgregar').addEventListener('click', () => {
    vs.push({ num: '', tipo: '', cap_real: null, tabla: null, activa: true });
    markDirty(); renderVasijas(cont);
  });
  cont.querySelector('tbody').addEventListener('change', ev => {
    const el = ev.target, v = vs[+el.dataset.i]; if (!v) return;
    const f = el.dataset.f;
    if (f === 'activa') v.activa = el.checked;
    else if (f === 'cap_real') v.cap_real = el.value === '' ? null : Number(el.value);
    else if (f === 'tabla') v.tabla = el.value || null;
    else if (f === 'num'){
      const n = el.value.trim();
      const repetida = vs.some((o, j) => j !== +el.dataset.i && normalizarNumVasija(o.num) === normalizarNumVasija(n));
      if (repetida){ $('vasErr').textContent = `Ya existe la vasija ${n}.`; $('vasErr').style.display = ''; el.value = v.num; return; }
      $('vasErr').style.display = 'none';
      v.num = n;
    } else v[f] = el.value.trim();
    markDirty();
  });
}
```

- [ ] **Step 3: Llamarla desde `renderConfig`**

En `public/lotes/js/vista-config.js`:

1. Agregar el import `import { renderVasijas } from './vista-vasijas.js';`.
2. Al final de `export function renderConfig(){ … }`, antes de la llave de cierre, agregar `renderVasijas($('cfgVasijas'));`.

Si `renderConfig` tiene un `return` temprano, ponerlo antes de ese `return`: revisar con `sed -n 208,300p public/lotes/js/vista-config.js`.

- [ ] **Step 4: Verificar en el navegador**

1. Configuración: con el padrón vacío aparece el botón "Cargar padrón inicial (78 vasijas)".
2. Al apretarlo aparecen 78 filas. La vasija 201 tiene que decir Tanque 75 HL (Cap REAL 7500): verificarlo contra el Excel, que dice 7500 L para 199-214.
3. Si se carga un número repetido, aparece el aviso y se restaura el valor anterior.
4. Guardar y recargar: el padrón sigue ahí.
5. En la confirmación de una OT, el buscador de tanque ofrece "T 201 · TANQUE AC.INOX. · 7500 L".

- [ ] **Step 5: Suite y commit**

Run: `npm test`

Expected: todo en verde.

```bash
git branch --show-current
git add public/lotes/js/vista-vasijas.js public/lotes/js/vista-config.js public/lotes/index.html
git commit -m "feat(lotes): padron de vasijas fijas editable en Configuracion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Guía de uso, verificación completa y merge

**Files:**
- Modify: `docs/guia-lotes.md` (sección nueva al final)

- [ ] **Step 1: Sumar la sección a la guía**

Al final de `docs/guia-lotes.md`:

```markdown
## Confirmar una OT: así queda cada lote

Desde el 2026-10, confirmar una OT actualiza los envases y los litros del lote, siempre con un check tuyo.

1. **Lo que pasó.**
   - Si el destino es un tanque, elegí el tanque (por ejemplo "T 201") y cargá los **cm de merma** que mediste. Al lado ves los litros, calculados con la tabla de cubicación y la Cap REAL.
   - Si el tanque no tiene tabla (foudres, tinajas, los de 3.300 / 6.000 / 46.500 L), cargá los litros.
   - Si el destino son barricas, cargá cuántas quedaron llenas y agregá cada barrica merma con su número y sus litros.
2. **Así queda cada lote.** Ves el antes y el después de cada lote, la merma en litros y qué dice el Mapa de Barriles. Corregí lo que haga falta y dejá tildados los lotes que querés aplicar. **Aplicar y guardar** confirma la OT y guarda.

**Barricas mermas.**
- Quedan en Movimientos → 🛢 Mermas.
- Mientras están pendientes, lo que les falta se descuenta de los litros del lote.
- Se cierran solas en el próximo guardado, cuando el Mapa las ve LLENAS con el mismo lote. También se cierran con **✓ resuelta**.

**Vasijas fijas.** El padrón está en ⚙️ Configuración → Vasijas fijas. La primera vez, apretá "Cargar padrón inicial".
```

- [ ] **Step 2: Verificación completa**

Run: `npm test && npx tsc --noEmit`

Expected: todo en verde. Anotar la cantidad de tests en el mensaje al usuario.

En el navegador, repetir de punta a punta una OT de cada una de las 5 plantillas:
- Corte: con el asistente, lote nuevo, T 189, 30 cm. Los lotes de origen quedan en 0 y el corte en 4.075 L.
- TQ a barricas.
- Barricas a barricas con merma.
- Barrica a tanque.
- TQ a TQ.

Sacar una captura del paso 2 de un caso con merma y mandársela al usuario.

- [ ] **Step 3: Commit de la guía**

```bash
git branch --show-current
git add docs/guia-lotes.md
git commit -m "docs(lotes): guia de la confirmacion de OT con litros, cubicacion y mermas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Merge a main y push**

Desde el worktree, primero traer `main` para resolver conflictos ahí:

```bash
git fetch origin
git merge origin/main
npm test
```

Después, mergear en `main` desde un worktree limpio de `main` (la carpeta principal la usan otras sesiones):

```bash
git -C C:/Users/Bmax/repos/catenainstitute worktree add ../catenainstitute-merge-ot-litros main
cd C:/Users/Bmax/repos/catenainstitute-merge-ot-litros
git pull --ff-only origin main
git merge --no-ff feat/ot-aplica-litros -m "Merge: confirmar OT aplica litros, cubicacion y barricas mermas"
npm ci && npm test
git push origin main
git merge-base --is-ancestor feat/ot-aplica-litros origin/main && echo OK
```

Pedirle al usuario el deploy: `cd /d C:\Users\Bmax\repos\catenainstitute`, `git pull` en `main` limpio y `npx.cmd wrangler deploy`. Avisarle que, después del deploy, hay que entrar a ⚙️ Configuración → "Cargar padrón inicial" y Guardar.
