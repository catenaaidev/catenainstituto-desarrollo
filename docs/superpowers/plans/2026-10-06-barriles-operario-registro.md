# Modo operario de Barriles: portada y Registro — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el operario de Barriles entre a una portada simple de botones grandes y tenga una pantalla Registro, con forma del Excel viejo (lote arriba, barriles abajo, por mes), con un buscador único por lote, barril, OT o fecha.

**Architecture:** La lógica pura (interpretar la búsqueda, filtrar, agrupar por mes, historia de un barril, resumen de un lote) va en un script clásico nuevo, `public/barriles/js/registro.js`, que se cuelga de `globalThis` y se testea con vitest. La pantalla (portada, barra "← Inicio", panel Registro, impresión) va en `public/barriles/index.html`, con todo el CSS colgado de `body.rol-operario` o de clases nuevas, así el programador no ve cambios. No se toca servidor, API ni datos.

**Tech Stack:** HTML/CSS/JS sin framework (single-file `index.html`), vitest con `@cloudflare/vitest-pool-workers` (sin DOM), Cloudflare Workers (`wrangler dev`).

**Spec:** `docs/superpowers/specs/2026-10-06-barriles-operario-registro-design.md`

## Global Constraints

- Directorio de trabajo: `C:\Users\Bmax\repos\catenainstitute-operario` (worktree, rama `feat/barriles-operario`, sin upstream). Nunca trabajar en `C:\Users\Bmax\repos\catenainstitute` directamente.
- Solo se tocan `public/barriles/index.html`, `public/barriles/js/registro.js` (nuevo), `test/barriles-registro.test.mjs` (nuevo) y docs.
- El programador (`body.rol-programador`) no ve ningún cambio: cada regla CSS nueva va bajo `body.rol-operario` o en clases que solo existen en los paneles nuevos.
- Scripts de `public/barriles/js/` son **clásicos** (no `type="module"`): IIFE `(function (raiz) { ... })(typeof globalThis !== 'undefined' ? globalThis : window);` que cuelga sus funciones de `raiz`. El arranque de la página corre durante el parseo y un módulo llegaría tarde.
- Los tests no tienen DOM ni `node:fs`: solo pueden probar `registro.js`.
- Textos de la pantalla en español rioplatense, sin jerga: "Llenado", "Vaciado", "Registro", "Ver en el mapa".
- Colores de operación fijos: LLENADO = verde (`var(--ok)` #2e7d32), VACIADO = ámbar (#e0a100), llenado y vaciado = vino (`var(--vino)`).
- Tipos de orden que existen en `estado.escaneos[].tipo`: `'llenado'`, `'vaciado'`, `'llenado_vaciado'`.
- Todo dato que llega al HTML pasa por `escapeHtml(...)`; todo argumento dentro de un `onclick="..."` pasa por `argJs(...)` (ya existen en `index.html`).
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Comandos: `npm test` (vitest), `npx tsc --noEmit` (typecheck). Correrlos desde el worktree.

## Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `public/barriles/js/registro.js` (nuevo) | Lógica pura del Registro: `interpretarBusqueda`, `mesDeOrden`, `mesesConOrdenes`, `filtrarOrdenes`, `agruparPorMes`, `historiaDeBarril`, `resumenDeLote`, `nombreMes`, `fechaCorta` |
| `test/barriles-registro.test.mjs` (nuevo) | Tests de lo anterior |
| `public/barriles/index.html` | `<script src="js/registro.js">`, CSS del operario, panel `#panel-inicio`, panel `#panel-registro`, barra `#navOperario` nueva, `opSeccion`/`activarPanel`/`aplicarRol`/`redibujarTodo`/`escDibujarHistorial` enganchados, impresión del Registro |

## Datos que hay que conocer

Una orden (`estado.escaneos[i]`):

```js
{ id: 'e1736860000000', fecha: '2026-01-14', ot: '812', lote: '25242',
  tipo: 'vaciado',            // 'llenado' | 'vaciado' | 'llenado_vaciado'
  codigos: ['2180036', '2181088'],
  mes: '2026-01',             // opcional: solo las importadas del Excel; si está, manda sobre la fecha
  aplicado: false, marcas: {} }
```

Fila del inventario: `indiceInv.get('2180036')` → `{ num, estado: 'LLENO'|'MERMO'|'VACIO', lote, cosecha, fecha, ... }` o `undefined`.

Ubicación: `buscarUbicacion(num)` → `{ box, col, fila, lado }` (`lado` 1 = Izquierda, 2 = Derecha; `LADO_NOMBRE[lado]`; nombre del box en `box.nombre`) o `null`. Para tanques en palets: `buscarUbicacionTanque(num)` → `{ palet, col }` o `null`.

Funciones existentes que se reutilizan: `$`, `escapeHtml`, `argJs`, `hoyISO()`, `escPuedeEditar(o, rol)`, `escEditarOrden(id)`, `escBorrarOrden(id)`, `opSeccion(sec)`, `opVista(v)`, `activarPanel(nombre)`, `setMapaTipo('barriles'|'tanques')`, `aplicarBusqueda()`, variables globales `estado`, `rol`, `soloLectura`, `indiceInv`.

---

### Task 1: Lógica pura del Registro (`registro.js`)

**Files:**
- Create: `public/barriles/js/registro.js`
- Test: `test/barriles-registro.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces (en `globalThis`):
  - `interpretarBusqueda(texto: string, ordenes: Orden[]) → { tipo: 'vacio'|'fecha'|'barril'|'lote'|'ot'|'texto', valor: string, alternativa?: 'barril' }`
  - `mesDeOrden(o: Orden) → string` (`'aaaa-mm'` o `''`)
  - `mesesConOrdenes(ordenes) → string[]` (más nuevo primero)
  - `filtrarOrdenes(ordenes, consulta, mes: string) → Orden[]` (conserva el orden de entrada)
  - `agruparPorMes(ordenes) → { mes: string, ordenes: Orden[] }[]` (meses y órdenes de más nuevo a más viejo; mes `''` al final)
  - `historiaDeBarril(num: string, ordenes) → { id, fecha, tipo, lote, ot }[]` (más vieja primero)
  - `resumenDeLote(lote: string, ordenes) → { ordenes: number, llenados: number, vaciados: number, ultimaFecha: string }`
  - `nombreMes('2026-01') → 'Enero 2026'`, `fechaCorta('2026-01-14') → '14/01/26'`

Reglas de `interpretarBusqueda` (en este orden):
1. Vacío o solo espacios → `{ tipo: 'vacio', valor: '' }`.
2. `barril 123`, `b 123`, `b123` (sin distinguir mayúsculas; la forma `b` solo con dígitos) → `{ tipo: 'barril', valor: '123' }`. Sirve para forzar barril cuando el número es también un lote.
3. `lote X` → `{ tipo: 'lote', valor: 'X' }`.
4. `OT 812`, `ot812`, `ot: 812`, `OT-812` → `{ tipo: 'ot', valor: '812' }`.
5. Fecha `aaaa-mm-dd` → `{ tipo: 'fecha', valor: 'aaaa-mm-dd' }`.
6. Fecha `d/m`, `d/m/aa`, `d/m/aaaa` (también con `-` o `.` en lugar de `/`, solo si son 1–2 dígitos + 1–2 dígitos): `valor = 'aaaa-mm-dd'` con ceros. Sin año: el año más reciente entre las órdenes que tienen ese `mm-dd`; si ninguna, el año más reciente entre todas las órdenes; si no hay órdenes, el año actual. Año de 2 dígitos → `2000 + aa`. Día 1–31 y mes 1–12; si no, no es fecha.
7. Solo dígitos, 6 o más → `barril`.
8. Solo dígitos, exactamente 5 → si alguna orden tiene `lote === texto` → `lote` (con `alternativa: 'barril'` si además algún `codigos` lo contiene); si no → `barril`.
9. Cualquier texto igual (sin mayúsculas, sin espacios al borde) al lote de alguna orden → `lote`.
10. Lo demás → `{ tipo: 'texto', valor: texto }`.

Reglas de `filtrarOrdenes(ordenes, consulta, mes)`:
- `vacio`: si `mes` tiene valor, las de `mesDeOrden(o) === mes`; si no, todas.
- `fecha`: `String(o.fecha).slice(0, 10) === valor`.
- `barril`: algún `String(c).trim() === valor`.
- `lote`: `String(o.lote).trim().toUpperCase() === valor.toUpperCase()`.
- `ot`: `String(o.ot).trim().toLowerCase() === valor.toLowerCase()`.
- `texto`: contiene `valor` (minúsculas) en lote, OT o algún código.
- Con cualquier tipo que no sea `vacio`, `mes` se ignora (se busca en todos los meses).

- [ ] **Step 1: Escribir el test que falla**

Crear `test/barriles-registro.test.mjs`:

```js
/**
 * El Registro del operario: buscar, filtrar y agrupar las órdenes del escáner.
 *
 * Va en .mjs por lo mismo que barriles-inventario.test.mjs: importa un .js
 * clásico que se cuelga de globalThis y no tiene tipos.
 * Diseño: docs/superpowers/specs/2026-10-06-barriles-operario-registro-design.md
 */

import { describe, it, expect } from 'vitest';
import '../public/barriles/js/registro.js';

const { interpretarBusqueda, mesDeOrden, mesesConOrdenes, filtrarOrdenes, agruparPorMes,
        historiaDeBarril, resumenDeLote, nombreMes, fechaCorta } = globalThis;

// Tres órdenes del Excel "Datos Ori" (14/01/26) y dos de enero 12 importadas con `mes`.
const ORD = [
  { id: 'a', fecha: '2026-01-12', ot: '700', lote: '25265', tipo: 'vaciado', codigos: ['50157'], mes: '2026-01' },
  { id: 'b', fecha: '2025-12-03', ot: '650', lote: '25242', tipo: 'llenado', codigos: ['2180036', '2181088'] },
  { id: 'c', fecha: '2026-01-14', ot: '812', lote: '25242', tipo: 'vaciado', codigos: ['2180036', '2181088', '2150485'] },
  { id: 'd', fecha: '2026-01-14', ot: '813', lote: '25306', tipo: 'llenado', codigos: ['1250341', '25242'] },
  { id: 'e', fecha: '2026-01-14', ot: '', lote: 'VERMUT', tipo: 'llenado_vaciado', codigos: ['1260018'] },
];

describe('interpretarBusqueda', () => {
  it('vacío', () => {
    expect(interpretarBusqueda('   ', ORD)).toEqual({ tipo: 'vacio', valor: '' });
  });
  it('7 dígitos es barril', () => {
    expect(interpretarBusqueda(' 2180036 ', ORD)).toEqual({ tipo: 'barril', valor: '2180036' });
  });
  it('5 dígitos que es un lote cargado es lote', () => {
    expect(interpretarBusqueda('25306', ORD)).toEqual({ tipo: 'lote', valor: '25306' });
  });
  it('5 dígitos que es lote y también barril: gana lote y ofrece el barril', () => {
    expect(interpretarBusqueda('25242', ORD)).toEqual({ tipo: 'lote', valor: '25242', alternativa: 'barril' });
  });
  it('5 dígitos que no es lote es barril (los barriles 50157 existen)', () => {
    expect(interpretarBusqueda('50157', ORD)).toEqual({ tipo: 'barril', valor: '50157' });
  });
  it('"barril X" fuerza barril', () => {
    expect(interpretarBusqueda('barril 25242', ORD)).toEqual({ tipo: 'barril', valor: '25242' });
    expect(interpretarBusqueda('B25242', ORD)).toEqual({ tipo: 'barril', valor: '25242' });
  });
  it('"b" seguido de letras no es barril (lote BLEND)', () => {
    expect(interpretarBusqueda('blend', [{ lote: 'BLEND', codigos: [] }])).toEqual({ tipo: 'lote', valor: 'blend' });
  });
  it('"lote X" fuerza lote', () => {
    expect(interpretarBusqueda('lote 99999', ORD)).toEqual({ tipo: 'lote', valor: '99999' });
  });
  it('OT en sus formas', () => {
    for (const t of ['OT 812', 'ot812', 'ot: 812', 'OT-812'])
      expect(interpretarBusqueda(t, ORD)).toEqual({ tipo: 'ot', valor: '812' });
  });
  it('fecha ISO', () => {
    expect(interpretarBusqueda('2026-01-14', ORD)).toEqual({ tipo: 'fecha', valor: '2026-01-14' });
  });
  it('fecha d/m sin año toma el año más reciente con órdenes ese día', () => {
    expect(interpretarBusqueda('14/1', ORD)).toEqual({ tipo: 'fecha', valor: '2026-01-14' });
    expect(interpretarBusqueda('3/12', ORD)).toEqual({ tipo: 'fecha', valor: '2025-12-03' });
  });
  it('fecha d/m sin órdenes ese día usa el año más reciente cargado', () => {
    expect(interpretarBusqueda('1/2', ORD)).toEqual({ tipo: 'fecha', valor: '2026-02-01' });
  });
  it('fecha con año de 2 y 4 dígitos', () => {
    expect(interpretarBusqueda('14/01/26', ORD)).toEqual({ tipo: 'fecha', valor: '2026-01-14' });
    expect(interpretarBusqueda('14-1-2025', ORD)).toEqual({ tipo: 'fecha', valor: '2025-01-14' });
  });
  it('día o mes imposibles no son fecha', () => {
    expect(interpretarBusqueda('32/1', ORD).tipo).toBe('texto');
    expect(interpretarBusqueda('1/13', ORD).tipo).toBe('texto');
  });
  it('lote con letras, sin importar mayúsculas', () => {
    expect(interpretarBusqueda('vermut', ORD)).toEqual({ tipo: 'lote', valor: 'vermut' });
  });
  it('dígitos cortos son texto libre', () => {
    expect(interpretarBusqueda('218', ORD)).toEqual({ tipo: 'texto', valor: '218' });
  });
});

describe('mesDeOrden y mesesConOrdenes', () => {
  it('el campo mes manda sobre la fecha', () => {
    expect(mesDeOrden({ fecha: '2026-02-01', mes: '2026-01' })).toBe('2026-01');
    expect(mesDeOrden({ fecha: '2026-02-01' })).toBe('2026-02');
    expect(mesDeOrden({ fecha: '' })).toBe('');
  });
  it('meses sin repetir, más nuevo primero', () => {
    expect(mesesConOrdenes(ORD)).toEqual(['2026-01', '2025-12']);
  });
});

describe('filtrarOrdenes', () => {
  const ids = arr => arr.map(o => o.id);
  it('sin búsqueda filtra por mes', () => {
    expect(ids(filtrarOrdenes(ORD, { tipo: 'vacio', valor: '' }, '2025-12'))).toEqual(['b']);
    expect(ids(filtrarOrdenes(ORD, { tipo: 'vacio', valor: '' }, ''))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('barril busca en todos los meses e ignora el mes', () => {
    expect(ids(filtrarOrdenes(ORD, { tipo: 'barril', valor: '2180036' }, '2025-12'))).toEqual(['b', 'c']);
  });
  it('barril es coincidencia exacta', () => {
    expect(ids(filtrarOrdenes(ORD, { tipo: 'barril', valor: '218003' }, ''))).toEqual([]);
  });
  it('lote sin importar mayúsculas', () => {
    expect(ids(filtrarOrdenes(ORD, { tipo: 'lote', valor: 'vermut' }, ''))).toEqual(['e']);
    expect(ids(filtrarOrdenes(ORD, { tipo: 'lote', valor: '25242' }, ''))).toEqual(['b', 'c']);
  });
  it('OT y fecha', () => {
    expect(ids(filtrarOrdenes(ORD, { tipo: 'ot', valor: '812' }, ''))).toEqual(['c']);
    expect(ids(filtrarOrdenes(ORD, { tipo: 'fecha', valor: '2026-01-14' }, ''))).toEqual(['c', 'd', 'e']);
  });
  it('texto libre busca en lote, OT y códigos', () => {
    expect(ids(filtrarOrdenes(ORD, { tipo: 'texto', valor: '218' }, ''))).toEqual(['b', 'c']);
    // '81' está en la OT 812 y 813, y también dentro del código 2181088
    expect(ids(filtrarOrdenes(ORD, { tipo: 'texto', valor: '81' }, ''))).toEqual(['b', 'c', 'd']);
  });
});

describe('agruparPorMes', () => {
  it('meses y órdenes de más nuevo a más viejo; mismo día, la última cargada primero', () => {
    const g = agruparPorMes(ORD);
    expect(g.map(x => x.mes)).toEqual(['2026-01', '2025-12']);
    expect(g[0].ordenes.map(o => o.id)).toEqual(['e', 'd', 'c', 'a']);
  });
  it('las órdenes sin fecha ni mes van al final, en un grupo con mes vacío', () => {
    const g = agruparPorMes([{ id: 'x', fecha: '' }, ORD[1]]);
    expect(g.map(x => x.mes)).toEqual(['2025-12', '']);
  });
});

describe('historiaDeBarril', () => {
  it('cada orden donde aparece, la más vieja primero', () => {
    expect(historiaDeBarril('2180036', ORD)).toEqual([
      { id: 'b', fecha: '2025-12-03', tipo: 'llenado', lote: '25242', ot: '650' },
      { id: 'c', fecha: '2026-01-14', tipo: 'vaciado', lote: '25242', ot: '812' },
    ]);
  });
  it('sin órdenes, lista vacía', () => {
    expect(historiaDeBarril('9999999', ORD)).toEqual([]);
  });
});

describe('resumenDeLote', () => {
  it('cuenta barriles sin repetir por operación y la última fecha', () => {
    expect(resumenDeLote('25242', ORD)).toEqual({ ordenes: 2, llenados: 2, vaciados: 3, ultimaFecha: '2026-01-14' });
  });
  it('llenado y vaciado cuenta para los dos', () => {
    expect(resumenDeLote('vermut', ORD)).toEqual({ ordenes: 1, llenados: 1, vaciados: 1, ultimaFecha: '2026-01-14' });
  });
});

describe('nombreMes y fechaCorta', () => {
  it('formatos', () => {
    expect(nombreMes('2026-01')).toBe('Enero 2026');
    expect(nombreMes('2025-12')).toBe('Diciembre 2025');
    expect(nombreMes('raro')).toBe('raro');
    expect(fechaCorta('2026-01-14')).toBe('14/01/26');
    expect(fechaCorta('')).toBe('');
  });
});
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run test/barriles-registro.test.mjs`
Expected: FAIL (no existe `public/barriles/js/registro.js`).

- [ ] **Step 3: Escribir la implementación**

Crear `public/barriles/js/registro.js`:

```js
/**
 * El Registro del operario: lo que antes era la carpeta de Excel "Registro
 * vaciado y llenado de barricas" (una columna por orden, el lote arriba y los
 * barriles abajo, un archivo por mes y sin buscador).
 *
 * Acá está solo la parte pura: entender lo que se escribe en el buscador,
 * filtrar y agrupar las órdenes del escáner (estado.escaneos), la historia de un
 * barril y el resumen de un lote. No lee el estado global ni toca el DOM.
 *
 * Se carga como <script> clásico y se cuelga de globalThis, igual que
 * inventario.js: el arranque de la página corre durante el parseo y un módulo
 * llegaría tarde. Se testea en test/barriles-registro.test.mjs.
 * Diseño: docs/superpowers/specs/2026-10-06-barriles-operario-registro-design.md
 */
(function (raiz) {
  'use strict';

  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
    'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  function txt(v) { return String(v == null ? '' : v).trim(); }
  function dos(n) { return String(n).padStart(2, '0'); }

  // El campo `mes` lo traen las órdenes importadas del Excel y es más confiable
  // que una fecha tipeada a mano (misma regla que escMesDe en index.html).
  function mesDeOrden(o) {
    if (o && txt(o.mes)) return txt(o.mes);
    const m = /^(\d{4})-(\d{2})/.exec(txt(o && o.fecha));
    return m ? m[1] + '-' + m[2] : '';
  }

  function mesesConOrdenes(ordenes) {
    return [...new Set((ordenes || []).map(mesDeOrden).filter(Boolean))].sort().reverse();
  }

  function nombreMes(mes) {
    const m = /^(\d{4})-(\d{2})$/.exec(txt(mes));
    return m && +m[2] >= 1 && +m[2] <= 12 ? MESES[+m[2] - 1] + ' ' + m[1] : txt(mes);
  }

  function fechaCorta(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt(iso));
    return m ? m[3] + '/' + m[2] + '/' + m[1].slice(2) : txt(iso);
  }

  function lotesCargados(ordenes) {
    return new Set((ordenes || []).map(o => txt(o.lote).toUpperCase()).filter(Boolean));
  }
  function apareceComoBarril(num, ordenes) {
    return (ordenes || []).some(o => (o.codigos || []).some(c => txt(c) === num));
  }

  // Un día sin año: el año más reciente que tenga órdenes ese día; si no hay, el
  // más reciente cargado; sin órdenes, el actual.
  function anioPara(mmdd, ordenes) {
    const anios = f => (ordenes || []).map(o => txt(o.fecha)).filter(f)
      .map(s => +s.slice(0, 4)).filter(Boolean);
    const conEseDia = anios(s => /^\d{4}-\d{2}-\d{2}/.test(s) && s.slice(5, 10) === mmdd);
    if (conEseDia.length) return Math.max(...conEseDia);
    const todos = anios(s => /^\d{4}-/.test(s));
    return todos.length ? Math.max(...todos) : new Date().getFullYear();
  }

  function interpretarBusqueda(texto, ordenes) {
    const t = txt(texto);
    if (!t) return { tipo: 'vacio', valor: '' };
    let m;
    // "b" corto solo con dígitos: "blend" es un lote, no el barril "lend".
    if ((m = /^(?:barril\s*[:#-]?\s*(\S+)|b\s*[:#-]?\s*(\d+))$/i.exec(t))) return { tipo: 'barril', valor: m[1] || m[2] };
    if ((m = /^lote\s*[:#-]?\s*(\S.*)$/i.exec(t))) return { tipo: 'lote', valor: txt(m[1]) };
    if ((m = /^ot\s*[:#-]?\s*(\S+)$/i.exec(t))) return { tipo: 'ot', valor: m[1] };
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return { tipo: 'fecha', valor: t };
    if ((m = /^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2}|\d{4}))?$/.exec(t))) {
      const d = +m[1], mes = +m[2];
      if (d >= 1 && d <= 31 && mes >= 1 && mes <= 12) {
        const mmdd = dos(mes) + '-' + dos(d);
        const anio = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : anioPara(mmdd, ordenes);
        return { tipo: 'fecha', valor: anio + '-' + mmdd };
      }
    }
    const lotes = lotesCargados(ordenes);
    if (/^\d{6,}$/.test(t)) return { tipo: 'barril', valor: t };
    if (/^\d{5}$/.test(t)) {
      if (!lotes.has(t)) return { tipo: 'barril', valor: t };
      return apareceComoBarril(t, ordenes)
        ? { tipo: 'lote', valor: t, alternativa: 'barril' }
        : { tipo: 'lote', valor: t };
    }
    if (lotes.has(t.toUpperCase())) return { tipo: 'lote', valor: t };
    return { tipo: 'texto', valor: t };
  }

  function filtrarOrdenes(ordenes, consulta, mes) {
    const arr = ordenes || [];
    const q = consulta || { tipo: 'vacio', valor: '' };
    const v = txt(q.valor);
    switch (q.tipo) {
      case 'fecha': return arr.filter(o => txt(o.fecha).slice(0, 10) === v);
      case 'barril': return arr.filter(o => (o.codigos || []).some(c => txt(c) === v));
      case 'lote': return arr.filter(o => txt(o.lote).toUpperCase() === v.toUpperCase());
      case 'ot': return arr.filter(o => txt(o.ot).toLowerCase() === v.toLowerCase());
      case 'texto': {
        const b = v.toLowerCase();
        return arr.filter(o => txt(o.lote).toLowerCase().includes(b) ||
          txt(o.ot).toLowerCase().includes(b) ||
          (o.codigos || []).some(c => txt(c).toLowerCase().includes(b)));
      }
      default: return mes ? arr.filter(o => mesDeOrden(o) === mes) : arr.slice();
    }
  }

  // Más nuevo primero: por fecha y, en el mismo día, la que se cargó después
  // (la que está más abajo en estado.escaneos).
  function masNuevaPrimero(ordenes) {
    return ordenes.map((o, i) => ({ o, i }))
      .sort((a, b) => txt(b.o.fecha).localeCompare(txt(a.o.fecha)) || b.i - a.i)
      .map(x => x.o);
  }

  function agruparPorMes(ordenes) {
    const grupos = new Map();
    for (const o of masNuevaPrimero(ordenes || [])) {
      const m = mesDeOrden(o);
      if (!grupos.has(m)) grupos.set(m, []);
      grupos.get(m).push(o);
    }
    return [...grupos.keys()]
      .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : b.localeCompare(a)))
      .map(mes => ({ mes, ordenes: grupos.get(mes) }));
  }

  function historiaDeBarril(num, ordenes) {
    const n = txt(num);
    return masNuevaPrimero((ordenes || []).filter(o => (o.codigos || []).some(c => txt(c) === n)))
      .reverse()
      .map(o => ({ id: o.id, fecha: txt(o.fecha), tipo: o.tipo, lote: txt(o.lote), ot: txt(o.ot) }));
  }

  function resumenDeLote(lote, ordenes) {
    const sus = filtrarOrdenes(ordenes, { tipo: 'lote', valor: lote }, '');
    const llenados = new Set(), vaciados = new Set();
    let ultimaFecha = '';
    for (const o of sus) {
      const cods = (o.codigos || []).map(txt);
      if (o.tipo === 'llenado' || o.tipo === 'llenado_vaciado') cods.forEach(c => llenados.add(c));
      if (o.tipo === 'vaciado' || o.tipo === 'llenado_vaciado') cods.forEach(c => vaciados.add(c));
      if (txt(o.fecha) > ultimaFecha) ultimaFecha = txt(o.fecha);
    }
    return { ordenes: sus.length, llenados: llenados.size, vaciados: vaciados.size, ultimaFecha };
  }

  raiz.interpretarBusqueda = interpretarBusqueda;
  raiz.mesDeOrden = mesDeOrden;
  raiz.mesesConOrdenes = mesesConOrdenes;
  raiz.filtrarOrdenes = filtrarOrdenes;
  raiz.agruparPorMes = agruparPorMes;
  raiz.historiaDeBarril = historiaDeBarril;
  raiz.resumenDeLote = resumenDeLote;
  raiz.nombreMes = nombreMes;
  raiz.fechaCorta = fechaCorta;
})(typeof globalThis !== 'undefined' ? globalThis : window);
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `npx vitest run test/barriles-registro.test.mjs`
Expected: PASS (todos). Después `npm test` completo: todo en verde.

- [ ] **Step 5: Commit**

```bash
git add public/barriles/js/registro.js test/barriles-registro.test.mjs
git commit -m "feat(barriles): lógica pura del Registro del operario (buscar, filtrar, agrupar por mes)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Portada y barra "← Inicio" del operario

**Files:**
- Modify: `public/barriles/index.html` (bloque `<style>` antes de `</style>` ~línea 446; `<nav id="navOperario">` ~línea 466; principio de `<main>`; `activarPanel` ~línea 1844; `redibujarTodo` ~línea 1402; `aplicarRol` ~línea 1979; `opSeccion` ~línea 1995; `#escCajaHistorial` ~línea 673)

**Interfaces:**
- Consumes: `opSeccion`, `activarPanel`, `opVista`, `estado.pedidos`.
- Produces: `iniDibujar()`; secciones `'inicio'` y `'registro'` en `opSeccion` (la de registro llama `activarPanel('registro')`, que Task 3 completa); clase `op-inicio` en `body` cuando se está en la portada; constante `OP_TITULOS`.

- [ ] **Step 1: Reemplazar la barra del operario**

En `index.html`, reemplazar el bloque entero:

```html
<nav id="navOperario">
  <button data-op="cargar">📦 Cargar box</button>
  <button data-op="buscar">🔍 Buscar barriles</button>
  <button data-op="escaner">🛢️ Escáner</button>
  <button data-op="inventario">🧾 Inventario</button>
  <button data-op="pedidos">🏷️ Pedidos de rótulos</button>
  <button data-op="celular">📱 Conectar teléfono</button>
</nav>
```

por:

```html
<!-- Operario: ya no hay pestañas. Se entra por la portada (#panel-inicio) y esta
     barra solo dice dónde estás y cómo volver. -->
<nav id="navOperario">
  <button id="opInicio" data-op="inicio">← Inicio</button>
  <span id="opTitulo"></span>
  <span id="opAyuda"></span>
</nav>
```

- [ ] **Step 2: Agregar el panel de la portada**

Inmediatamente después de `<main>` (antes del comentario `<!-- ============ INVENTARIO`), insertar:

```html
  <!-- ============ PORTADA DEL OPERARIO ============ -->
  <section class="panel" id="panel-inicio">
    <div class="ini-saludo">
      <h2 id="iniSaludo">Buen día</h2>
      <p id="iniFecha"></p>
    </div>
    <div class="ini-grandes">
      <button class="ini-boton" data-op="cargar"><span class="ini-ico">📦</span><b>Cargar box</b><span>Ubicar barriles en el mapa</span></button>
      <button class="ini-boton" data-op="escaner"><span class="ini-ico">🛢️</span><b>Llenado / vaciado</b><span>Escanear una orden</span></button>
      <button class="ini-boton ini-destacado" data-op="registro"><span class="ini-ico">📒</span><b>Registro</b><span>Ver lo que se cargó</span></button>
      <button class="ini-boton" data-op="buscar"><span class="ini-ico">🔍</span><b>Dónde está</b><span>Buscar un barril en el mapa</span></button>
    </div>
    <div class="ini-chicos">
      <button class="ini-chico" data-op="inventario">🧾 Asociar vasija con lote</button>
      <button class="ini-chico" data-op="pedidos">🏷️ Pedidos de rótulos<span class="ini-cuenta" id="iniPedidos"></span></button>
      <button class="ini-chico" data-op="celular">📱 Conectar teléfono</button>
    </div>
  </section>
```

- [ ] **Step 3: Agregar el CSS del operario y de la portada**

Antes del bloque `/* ===== Impresión: versión armada en #areaImpresion` (~línea 417), insertar:

```css
  /* ===== Modo operario: portada y barra de Inicio (2026-10-06) =====
     Todo bajo body.rol-operario o en clases que solo existen en la portada: el
     programador no ve ningún cambio. */
  body.rol-operario { font-size: 17px; }
  body.rol-operario main { max-width: 1280px; padding: 24px 28px; }
  body.rol-operario .tarjeta { border-radius: 14px; padding: 22px; }
  body.rol-operario button.btn { font-size: 1rem; padding: 11px 18px; border-radius: 8px; }
  body.rol-operario #panel-inventario > details.ayuda { display: none; }
  #navOperario #opInicio { color: #fff; font-weight: 700; }
  body.op-inicio #navOperario #opInicio { display: none; }
  #opTitulo { color: #fff; font-size: 1.15rem; font-weight: 700; padding: 14px 8px 14px 24px; }
  body:not(.op-inicio) #opTitulo { border-left: 1px solid rgba(255,255,255,.25); padding-left: 18px; }
  #opAyuda { color: #e8d3db; font-size: .98rem; padding: 14px 8px; }
  .ini-saludo { margin: 8px 0 24px; }
  .ini-saludo h2 { font-size: 1.9rem; color: var(--vino-osc); margin: 0; }
  .ini-saludo p { color: #6d6259; font-size: 1.1rem; margin-top: 4px; }
  .ini-grandes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
  .ini-boton { background: #fff; border: 1px solid var(--gris); border-radius: 18px; padding: 26px 22px; text-align: left; cursor: pointer;
               display: flex; flex-direction: column; gap: 8px; min-height: 190px; font: inherit; color: inherit;
               transition: border-color .15s, transform .15s; }
  .ini-boton:hover { border-color: var(--vino); transform: translateY(-2px); }
  .ini-boton:focus-visible, .ini-chico:focus-visible { outline: 3px solid var(--vino); outline-offset: 2px; }
  .ini-boton .ini-ico { font-size: 2.6rem; line-height: 1; }
  .ini-boton b { font-size: 1.35rem; color: var(--vino-osc); margin-top: auto; }
  .ini-boton span:last-child { color: #6d6259; font-size: 1rem; }
  .ini-boton.ini-destacado { border: 2px solid var(--vino); background: #fdf6f7; }
  .ini-chicos { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 22px; }
  .ini-chico { background: #fff; border: 1px solid var(--gris); border-radius: 999px; padding: 12px 20px; font: inherit; font-size: 1rem; cursor: pointer; color: var(--vino-osc); }
  .ini-chico:hover { border-color: var(--vino); }
  .ini-cuenta:not(:empty) { background: var(--warn); color: #fff; border-radius: 999px; padding: 1px 9px; margin-left: 8px; font-size: .85rem; font-weight: 700; }
  @media (max-width: 900px) { .ini-grandes { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
```

- [ ] **Step 4: Títulos, portada y secciones nuevas en el JS**

Reemplazar la función `opSeccion` entera (desde `// Operario: dos secciones (cargar / buscar)` hasta su `}` de cierre, antes de `function opVista`) por:

```js
// Operario: se entra por la portada; cada botón abre una sección. Cargar y
// Buscar reusan los paneles de Mapa y Vista 3D; Registro es propio.
// La barra de arriba (#navOperario) solo dice dónde estás y cómo volver.
const OP_TITULOS = {
  inicio: ['', ''],
  cargar: ['📦 Cargar box', 'Tocá la posición en el mapa y después leé el barril con la pistola.'],
  buscar: ['🔍 Dónde está', 'Escribí un barril o un lote y se marca en el mapa.'],
  escaner: ['🛢️ Llenado / vaciado', 'Elegí la operación, completá la OT y el lote, y leé los barriles.'],
  registro: ['📒 Registro', 'Todo lo que se cargó, por mes. Buscá por lote, barril, OT o fecha.'],
  inventario: ['🧾 Asociar vasija con lote', 'Leé la vasija y escribí el lote que tiene.'],
  pedidos: ['🏷️ Pedidos de rótulos', 'Rótulos pedidos para reimprimir.'],
  celular: ['📱 Conectar teléfono', 'Escaneá el código con el celular para usarlo como lector.'],
};
function opSeccion(sec) {
  if (sesion && sesion.modo === 'libre') salirModoLibre();   // no mezclar cargar y buscar
  if (!OP_TITULOS[sec]) sec = 'inicio';
  for (const s of Object.keys(OP_TITULOS)) document.body.classList.toggle('op-' + s, s === sec);
  $('opTitulo').textContent = OP_TITULOS[sec][0];
  $('opAyuda').textContent = OP_TITULOS[sec][1];
  const lbl = $('opVistaLabel');
  if (lbl) lbl.textContent = sec === 'buscar' ? 'Ver en:' : 'Ver y cargar en:';
  if (sec === 'cargar') opVista(opVistaActual);
  // Buscar arranca en Mapa 2D (el que se imprime); el selector permite pasar a 3D.
  else if (sec === 'buscar') { $('buscarMapa').value = ''; if ($('buscar3d')) $('buscar3d').value = ''; opVista('mapa'); }
  else activarPanel(sec);   // inicio, registro, escaner, inventario, pedidos, celular
  window.scrollTo(0, 0);
}
```

Después del listener existente
`document.querySelectorAll('#navOperario button[data-op]').forEach(...)`, agregar:

```js
document.querySelectorAll('#panel-inicio button[data-op]').forEach(b => b.addEventListener('click', () => opSeccion(b.dataset.op)));

function iniDibujar() {
  const h = new Date().getHours();
  $('iniSaludo').textContent = h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  const f = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('iniFecha').textContent = f.charAt(0).toUpperCase() + f.slice(1) + ' · ¿Qué vas a hacer?';
  const pend = (estado.pedidos || []).filter(p => !p.hecho).length;
  $('iniPedidos').textContent = pend ? String(pend) : '';
}
```

En `activarPanel`, después de `if (nombre === 'celular') dibujarQR();`, agregar:

```js
  if (nombre === 'inicio') iniDibujar();
```

En `redibujarTodo`, después de `if ($('panel-pedidos').classList.contains('activo')) pedidosDibujar();`, agregar:

```js
  if ($('panel-inicio').classList.contains('activo')) iniDibujar();
```

En `aplicarRol`, cambiar `if (r === 'operario') opSeccion('cargar');` por:

```js
  if (r === 'operario') opSeccion('inicio');
```

- [ ] **Step 5: Ocultarle el historial plegado al operario**

En la etiqueta `<details class="tarjeta esc-historial" id="escCajaHistorial">`, agregar la clase `solo-prog`:

```html
    <details class="tarjeta esc-historial solo-prog" id="escCajaHistorial">
```

Y actualizar el comentario de arriba (`<!-- El historial se pliega: ...`) agregando una línea: `Desde el 2026-10-06 el operario no lo ve: tiene el Registro.`

- [ ] **Step 6: Verificar que no rompe tests ni typecheck**

Run: `npm test` y `npx tsc --noEmit`
Expected: verde los dos (incluye `test/barriles-pantalla.test.ts`, que lee el HTML servido; si algún test mira los botones viejos de `#navOperario`, actualizarlo a la barra nueva y explicarlo en el commit).

- [ ] **Step 7: Commit**

```bash
git add public/barriles/index.html
git commit -m "feat(barriles): portada de botones grandes y barra de Inicio para el operario

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Panel Registro (buscador, meses, tarjetas, ficha del barril, resumen del lote)

**Files:**
- Modify: `public/barriles/index.html` (`<script src>` junto a los otros ~línea 29; panel nuevo después de `#panel-inicio`; CSS después del de la portada; JS nuevo después de `iniDibujar`; `activarPanel`; `redibujarTodo`; principio de `escDibujarHistorial`)

**Interfaces:**
- Consumes: de Task 1 `interpretarBusqueda`, `mesesConOrdenes`, `filtrarOrdenes`, `agruparPorMes`, `historiaDeBarril`, `resumenDeLote`, `nombreMes`, `fechaCorta`; de Task 2 `opSeccion('registro')`; existentes `escPuedeEditar`, `escEditarOrden`, `escBorrarOrden`, `buscarUbicacion`, `buscarUbicacionTanque`, `LADO_NOMBRE`, `indiceInv`, `setMapaTipo`, `aplicarBusqueda`, `hoyISO`, `soloLectura`, `rol`.
- Produces: `regDibujar()`, `regPanelActivo()`, `regElegirMes(mes)`, `regBuscarBarril(num)`, `regVerEnMapa(num)`, `regEditar(id)`, variable `regMes`, constante `REG_TIPO`.

- [ ] **Step 1: Cargar el script**

Después de `<script src="js/altas.js"></script>` (y su comentario), agregar:

```html
<!-- El Registro del operario: entender el buscador, filtrar y agrupar las órdenes
     por mes, la historia de un barril y el resumen de un lote. Va acá, como script
     clásico, por lo mismo que los de arriba. Se testea en test/barriles-registro.test.mjs. -->
<script src="js/registro.js"></script>
```

- [ ] **Step 2: Agregar el panel**

Después del cierre `</section>` de `#panel-inicio`, insertar:

```html
  <!-- ============ REGISTRO DEL OPERARIO (lo que antes era la carpeta de Excel) ============ -->
  <section class="panel" id="panel-registro">
    <h2 class="reg-titulo-impresion" id="regTituloImpresion"></h2>
    <div class="reg-barra">
      <label class="reg-buscador">
        <span aria-hidden="true">🔍</span>
        <input type="search" id="regBuscar" autocomplete="off"
               placeholder="Lote, barril, OT o fecha — ej. 25242 · 2180036 · OT 812 · 14/1">
        <span class="reg-como" id="regComo"></span>
      </label>
      <button class="btn sec" id="regImprimir">🖨️ Imprimir</button>
    </div>
    <div class="reg-meses" id="regMeses"></div>
    <div id="regArriba"></div>
    <div id="regLista"></div>
  </section>
```

- [ ] **Step 3: Agregar el CSS del Registro**

Después del CSS de la portada (Task 2, Step 3), insertar:

```css
  /* ===== Registro del operario ===== */
  .reg-barra { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; }
  .reg-buscador { flex: 1; display: flex; align-items: center; gap: 10px; background: #fff; border: 2px solid var(--vino); border-radius: 12px; padding: 2px 16px; font-size: 1.3rem; }
  .reg-buscador input { flex: 1; border: none; outline: none; font-size: 1.35rem; padding: 12px 0; background: transparent; min-width: 0; }
  .reg-como:not(:empty) { background: #f3e6ea; color: var(--vino-osc); border-radius: 999px; padding: 4px 12px; font-size: .9rem; font-weight: 600; white-space: nowrap; }
  .reg-meses { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
  .reg-mes { background: #fff; border: 1px solid var(--gris); border-radius: 999px; padding: 8px 16px; font: inherit; font-size: .98rem; cursor: pointer; color: var(--vino-osc); }
  .reg-mes:hover { border-color: var(--vino); }
  .reg-mes.activo { background: var(--vino); border-color: var(--vino); color: #fff; font-weight: 700; }
  .reg-grupo { margin-bottom: 24px; }
  .reg-grupo h3 { font-size: 1.25rem; color: var(--vino-osc); margin: 0 0 12px; }
  .reg-grupo h3 span { font-size: .95rem; color: #8a7f76; font-weight: 400; margin-left: 8px; }
  details.reg-grupo > summary { cursor: pointer; list-style: none; }
  details.reg-grupo > summary::-webkit-details-marker { display: none; }
  details.reg-grupo > summary h3::before { content: '▸ '; }
  details.reg-grupo[open] > summary h3::before { content: '▾ '; }
  .reg-grilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; align-items: start; }
  .reg-tarjeta { background: #fff; border: 1px solid var(--gris); border-top: 6px solid #9e9e9e; border-radius: 12px; padding: 14px 16px; }
  .reg-tarjeta.reg-llenado { border-top-color: var(--ok); }
  .reg-tarjeta.reg-vaciado { border-top-color: #e0a100; }
  .reg-tarjeta.reg-mixto { border-top-color: var(--vino); }
  .reg-tarjeta.reg-con-barril { box-shadow: 0 0 0 3px #ffd54f; }
  .reg-cabeza { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .reg-lote { font-size: 1.9rem; font-weight: 800; color: #2b2b2b; letter-spacing: .5px; }
  .reg-tipo { font-size: .8rem; font-weight: 700; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: .5px; background: #eee; color: #444; white-space: nowrap; }
  .reg-llenado .reg-tipo { background: #e3f1e4; color: #1b5e20; }
  .reg-vaciado .reg-tipo { background: #fff3d6; color: #7a5200; }
  .reg-mixto .reg-tipo { background: #f3e6ea; color: var(--vino-osc); }
  .reg-datos { color: #6d6259; font-size: .95rem; margin: 4px 0 10px; }
  .reg-barriles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .reg-barril { font-family: Consolas, 'Courier New', monospace; font-size: 1.05rem; padding: 6px 0; border: 1px solid var(--gris); border-radius: 6px; background: #faf8f5; cursor: pointer; color: #2b2b2b; }
  .reg-barril:hover { border-color: var(--vino); background: #fff; }
  .reg-barril.reg-hit { background: #ffd54f; border-color: #c79a00; font-weight: 700; }
  .reg-acciones { display: flex; gap: 8px; margin-top: 12px; }
  body.rol-operario .reg-acciones .btn { padding: 6px 12px; font-size: .9rem; }
  .reg-vacio { background: #fff; border: 1px dashed var(--gris); border-radius: 12px; padding: 30px; text-align: center; font-size: 1.1rem; color: #6d6259; }
  .reg-ficha { background: #fff; border: 2px solid var(--vino); border-radius: 14px; padding: 18px 22px; margin-bottom: 18px;
               display: grid; grid-template-columns: auto 1fr auto; gap: 8px 26px; align-items: start; }
  .reg-ficha-num { font-family: Consolas, 'Courier New', monospace; font-size: 2.2rem; font-weight: 800; color: var(--vino-osc); }
  .reg-ficha dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 4px 0 0; }
  .reg-ficha dt { color: #8a7f76; }
  .reg-ficha dd { margin: 0; font-weight: 600; }
  .reg-historia { grid-column: 1 / -1; border-top: 1px solid var(--gris); padding: 10px 0 0 22px; margin: 4px 0 0; }
  .reg-historia li { margin: 3px 0; }
  .reg-estado { padding: 2px 10px; border-radius: 999px; font-weight: 700; font-size: .9rem; background: #eceff1; color: #37474f; }
  .reg-estado.LLENO { background: #e3f1e4; color: #1b5e20; }
  .reg-estado.MERMO { background: #fff3d6; color: #7a5200; }
  .reg-resumen { background: #fff; border: 1px solid var(--gris); border-left: 6px solid var(--vino); border-radius: 0 12px 12px 0; padding: 14px 18px; margin-bottom: 18px; font-size: 1.1rem; }
  .reg-alternativa { margin-top: 6px; font-size: .98rem; }
  .reg-link { background: none; border: none; color: var(--vino); text-decoration: underline; cursor: pointer; font: inherit; padding: 0; }
  .reg-titulo-impresion { display: none; }
```

- [ ] **Step 4: Agregar el JS del Registro**

Después de la función `iniDibujar` (Task 2), insertar:

```js
// ================== REGISTRO (operario) ==================
// La carpeta de Excel de antes, con buscador: una tarjeta por orden con el lote
// arriba y los barriles abajo, agrupadas por mes. La lógica pura está en
// js/registro.js; acá solo se dibuja.
let regMes = null;   // 'aaaa-mm', 'todos' o null (= todavía no se eligió: arranca en el mes actual)
const REG_TIPO = {
  llenado: ['Llenado', 'reg-llenado'],
  vaciado: ['Vaciado', 'reg-vaciado'],
  llenado_vaciado: ['Llenado y vaciado', 'reg-mixto'],
};
const REG_COMO = { fecha: 'fecha', barril: 'barril', lote: 'lote', ot: 'OT', texto: 'texto' };

function regPanelActivo() { return !!$('panel-registro') && $('panel-registro').classList.contains('activo'); }

function regTextoUbicacion(num) {
  const u = buscarUbicacion(num);
  if (u) return `${u.box.nombre} · ${LADO_NOMBRE[u.lado] || ''} · Fila ${u.fila} · Pos ${u.col}`;
  const t = buscarUbicacionTanque(num);
  if (t) return `${t.palet.nombre || 'Palet'} · Pos ${t.col}`;
  return '';
}

function regTarjetaHtml(o, resaltar) {
  const [txtTipo, clase] = REG_TIPO[o.tipo] || [o.tipo || '—', ''];
  const cods = (o.codigos || []).map(c => String(c).trim());
  const tiene = resaltar && cods.includes(resaltar);
  const v = escPuedeEditar(o, rol);
  const acciones = (!soloLectura && v.puede) ? `<div class="reg-acciones">
      <button class="btn sec" onclick="regEditar(${argJs(o.id)})">✏️ Editar</button>
      <button class="btn peligro" onclick="escBorrarOrden(${argJs(o.id)})">🗑 Borrar</button></div>` : '';
  return `<article class="reg-tarjeta ${clase}${tiene ? ' reg-con-barril' : ''}">
    <div class="reg-cabeza"><span class="reg-lote">${escapeHtml(o.lote || 'Sin lote')}</span><span class="reg-tipo">${escapeHtml(txtTipo)}</span></div>
    <div class="reg-datos">${escapeHtml(fechaCorta(o.fecha) || 'sin fecha')} · ${o.ot ? 'OT ' + escapeHtml(o.ot) : 'sin OT'} · <b>${cods.length}</b> barril${cods.length === 1 ? '' : 'es'}</div>
    <div class="reg-barriles">${cods.map(c =>
      `<button class="reg-barril${c === resaltar ? ' reg-hit' : ''}" title="Ver la historia de este barril" onclick="regBuscarBarril(${argJs(c)})">${escapeHtml(c)}</button>`).join('')}</div>
    ${acciones}
  </article>`;
}

function regFichaHtml(num, ordenes) {
  const fila = indiceInv.get(String(num));
  const hist = historiaDeBarril(num, ordenes);
  const donde = regTextoUbicacion(num);
  const hoy = fila
    ? `<span class="reg-estado ${escapeHtml(fila.estado)}">${escapeHtml(fila.estado === 'VACIO' ? 'VACÍO' : (fila.estado || '—'))}</span>` +
      (fila.lote ? ' · lote ' + escapeHtml(fila.lote) : '') +
      (fila.fecha ? ' · desde el ' + escapeHtml(fechaCorta(fila.fecha)) : '')
    : 'No figura en el inventario';
  const lineas = hist.length
    ? hist.map(h => `<li>${escapeHtml(fechaCorta(h.fecha))} · <b>${escapeHtml((REG_TIPO[h.tipo] || [h.tipo])[0])}</b> · lote ${escapeHtml(h.lote || '—')}${h.ot ? ' · OT ' + escapeHtml(h.ot) : ''}</li>`).join('')
    : '<li>Sin órdenes registradas.</li>';
  return `<div class="reg-ficha">
    <div class="reg-ficha-num">${escapeHtml(num)}</div>
    <dl><dt>Hoy</dt><dd>${hoy}</dd><dt>Dónde está</dt><dd>${donde ? escapeHtml(donde) : 'Sin ubicar en el mapa'}</dd></dl>
    ${donde ? `<button class="btn" onclick="regVerEnMapa(${argJs(String(num))})">🗺️ Ver en el mapa</button>` : '<span></span>'}
    <ol class="reg-historia">${lineas}</ol>
  </div>`;
}

function regArribaHtml(q, ordenes) {
  if (q.tipo === 'barril') return regFichaHtml(q.valor, ordenes);
  if (q.tipo === 'lote') {
    const r = resumenDeLote(q.valor, ordenes);
    const esBarril = q.alternativa === 'barril' || indiceInv.has(q.valor);
    const alt = esBarril ? `<div class="reg-alternativa">¿Buscabas el barril ${escapeHtml(q.valor)}?
      <button class="reg-link" onclick="regBuscarBarril(${argJs(q.valor)})">Ver el barril</button></div>` : '';
    if (!r.ordenes) return alt ? `<div class="reg-resumen">${alt}</div>` : '';
    return `<div class="reg-resumen"><b>Lote ${escapeHtml(q.valor)}</b> · ${r.ordenes} orden${r.ordenes === 1 ? '' : 'es'} ·
      ${r.llenados} barril${r.llenados === 1 ? '' : 'es'} llenado${r.llenados === 1 ? '' : 's'} ·
      ${r.vaciados} vaciado${r.vaciados === 1 ? '' : 's'} · último movimiento ${escapeHtml(fechaCorta(r.ultimaFecha))}${alt}</div>`;
  }
  return '';
}

function regDibujar() {
  if (!$('panel-registro')) return;
  const ordenes = estado.escaneos || [];
  const texto = $('regBuscar').value;
  const q = interpretarBusqueda(texto, ordenes);
  const meses = mesesConOrdenes(ordenes);
  if (regMes === null || (regMes !== 'todos' && !meses.includes(regMes))) {
    const actual = hoyISO().slice(0, 7);
    regMes = meses.includes(actual) ? actual : (meses[0] || 'todos');
  }
  $('regComo').textContent = q.tipo === 'vacio' ? '' : 'buscando ' + REG_COMO[q.tipo];
  $('regMeses').innerHTML = meses.length
    ? [['todos', 'Todos'], ...meses.map(m => [m, nombreMes(m)])].map(([m, t]) =>
        `<button class="reg-mes${q.tipo === 'vacio' && m === regMes ? ' activo' : ''}" onclick="regElegirMes(${argJs(m)})">${escapeHtml(t)}</button>`).join('')
    : '';
  $('regArriba').innerHTML = regArribaHtml(q, ordenes);
  if (!ordenes.length) {
    $('regLista').innerHTML = `<div class="reg-vacio">Todavía no hay órdenes cargadas. Se cargan desde
      <button class="btn" onclick="opSeccion('escaner')">🛢️ Llenado / vaciado</button></div>`;
    return;
  }
  const filtradas = filtrarOrdenes(ordenes, q, regMes === 'todos' ? '' : regMes);
  if (!filtradas.length) {
    $('regLista').innerHTML = q.tipo === 'vacio'
      ? '<div class="reg-vacio">Este mes no tiene órdenes.</div>'
      : `<div class="reg-vacio">No encontramos «${escapeHtml(texto.trim())}» en ninguna orden.</div>`;
    return;
  }
  const resaltar = q.tipo === 'barril' ? q.valor : '';
  const plegar = q.tipo === 'vacio' && regMes === 'todos';
  $('regLista').innerHTML = agruparPorMes(filtradas).map((g, i) => {
    const n = g.ordenes.length;
    const titulo = `${escapeHtml(g.mes ? nombreMes(g.mes) : 'Sin fecha')} <span>${n} orden${n === 1 ? '' : 'es'}</span>`;
    const tarjetas = `<div class="reg-grilla">${g.ordenes.map(o => regTarjetaHtml(o, resaltar)).join('')}</div>`;
    return plegar
      ? `<details class="reg-grupo"${i === 0 ? ' open' : ''}><summary><h3>${titulo}</h3></summary>${tarjetas}</details>`
      : `<section class="reg-grupo"><h3>${titulo}</h3>${tarjetas}</section>`;
  }).join('');
}

function regElegirMes(mes) {
  regMes = mes;
  $('regBuscar').value = '';
  regDibujar();
}
// "barril X" fuerza la lectura de barril aunque el número sea también un lote.
function regBuscarBarril(num) {
  $('regBuscar').value = 'barril ' + num;
  regDibujar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function regVerEnMapa(num) {
  opSeccion('buscar');
  setMapaTipo(buscarUbicacion(num) ? 'barriles' : 'tanques');
  $('buscarMapa').value = String(num);
  aplicarBusqueda();
}
// Editar es lo mismo que el ✏️ del historial: carga la orden en la pantalla de
// Llenado / vaciado. Se cambia de pantalla antes, para que el operario la vea.
function regEditar(id) {
  opSeccion('escaner');
  escEditarOrden(id);
}

$('regBuscar').addEventListener('input', regDibujar);
```

- [ ] **Step 5: Enganchar los redibujados**

En `activarPanel`, después de la línea `if (nombre === 'inicio') iniDibujar();` (Task 2), agregar:

```js
  if (nombre === 'registro') { regDibujar(); setTimeout(() => $('regBuscar').focus(), 0); }
```

En `redibujarTodo`, después de la línea de `iniDibujar` (Task 2), agregar:

```js
  if (regPanelActivo()) regDibujar();
```

Al principio del cuerpo de `function escDibujarHistorial() {` (primera línea, antes de `escPoblarFiltros();`), agregar:

```js
  // El Registro del operario muestra las mismas órdenes: guardar, editar o borrar
  // una (todas terminan acá) lo tiene que redibujar.
  if (regPanelActivo()) regDibujar();
```

- [ ] **Step 6: Verificar que no rompe tests ni typecheck**

Run: `npm test` y `npx tsc --noEmit`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add public/barriles/index.html
git commit -m "feat(barriles): pantalla Registro del operario con buscador, meses y ficha del barril

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Imprimir el Registro

**Files:**
- Modify: `public/barriles/index.html` (dentro de `@media print { ... }` ~línea 419; JS del Registro)

**Interfaces:**
- Consumes: `regMes`, `nombreMes`, `regDibujar`, `#regTituloImpresion`, `#regImprimir`.
- Produces: `regImprimir()`; clase `imprimiendo-registro` en `body` durante la impresión.

- [ ] **Step 1: CSS de impresión**

Dentro del bloque `@media print { ... }` existente, al final (antes de su `}` de cierre), agregar:

```css
    /* Registro del operario: se imprime la pantalla tal cual (sin #areaImpresion,
       que es la del mapa), con las tarjetas en tres columnas. */
    body.imprimiendo-registro main { display: block !important; padding: 0; max-width: none; }
    body.imprimiendo-registro #areaImpresion,
    body.imprimiendo-registro #avisoSoloLectura,
    body.imprimiendo-registro .reg-barra,
    body.imprimiendo-registro .reg-meses,
    body.imprimiendo-registro .reg-acciones,
    body.imprimiendo-registro .reg-ficha .btn { display: none !important; }
    body.imprimiendo-registro .reg-titulo-impresion { display: block !important; font-size: 16pt; color: #000; margin-bottom: 8px; }
    body.imprimiendo-registro .reg-grilla { grid-template-columns: repeat(3, 1fr); gap: 8px; }
    body.imprimiendo-registro .reg-tarjeta { break-inside: avoid; box-shadow: none; }
    body.imprimiendo-registro .reg-barril { background: #fff; }
    body.imprimiendo-registro details.reg-grupo > summary h3::before { content: ''; }
```

- [ ] **Step 2: JS de impresión**

Al final del JS del Registro (después de `$('regBuscar').addEventListener('input', regDibujar);`), agregar:

```js
// Imprime lo que se está viendo (un mes o una búsqueda), como la carpeta del Excel.
function regImprimir() {
  const texto = $('regBuscar').value.trim();
  $('regTituloImpresion').textContent = 'Registro de llenado y vaciado de barricas — ' +
    (texto ? 'búsqueda «' + texto + '»' : regMes === 'todos' ? 'todas las órdenes' : nombreMes(regMes));
  document.querySelectorAll('#regLista details').forEach(d => { d.open = true; });
  document.body.classList.add('imprimiendo-registro');
  window.print();
}
window.addEventListener('afterprint', () => document.body.classList.remove('imprimiendo-registro'));
$('regImprimir').addEventListener('click', regImprimir);
```

- [ ] **Step 3: Verificar tests y commit**

Run: `npm test` y `npx tsc --noEmit` → verde.

```bash
git add public/barriles/index.html
git commit -m "feat(barriles): imprimir el Registro del operario por mes o por búsqueda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Verificación en el navegador

**Files:**
- Modify (no versionado): `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\.claude\launch.json` — entrada nueva `barriles-operario`.
- Temporales en el worktree (borrar al terminar): `seed-doc.json`, `seed-payload.json`.

- [ ] **Step 1: Levantar el server local del worktree**

Agregar a `Escritorio\claude\.claude\launch.json` (copiar la forma de `barriles-inventario-simple`) una entrada:

```json
{
  "name": "barriles-operario",
  "runtimeExecutable": "cmd",
  "runtimeArgs": ["/c", "cd /d C:\\Users\\Bmax\\repos\\catenainstitute-operario && npx wrangler dev -c wrangler.dev.jsonc --port 8802 --local --persist-to C:\\Users\\Bmax\\repos\\catenainstitute\\.wrangler\\state"],
  "port": 8802
}
```

(Si la entrada `barriles-inventario-simple` usa otro `--persist-to` u otras opciones, copiar las suyas.) `preview_start {name: "barriles-operario"}`.

- [ ] **Step 2: Sembrar órdenes de prueba**

Bajar el documento: `curl -s http://localhost:8802/barriles/api/estado -o seed-doc.json`. Armar con `node -e` un payload que agregue a `estado.escaneos` las órdenes del Excel "Datos Ori"/"Registro" (25224 vaciado, 25242 vaciado con 8 barriles, 25301 vaciado, 25306 llenado con 10 barriles, todas del 2026-01-14; 25265, 25123, 25254 vaciado del 2026-01-12) más dos órdenes de octubre 2026 con fecha de hoy, y POSTearlo (mirar en `src/` la ruta y el control de versión de `POST /barriles/api/estado` antes de armarlo). Avisar al usuario que pisa la D1 local.

- [ ] **Step 3: Recorrer como operario a 1366 px**

`resize_window` 1366×900. Comprobar con `read_page`/`javascript_tool` y capturas:
1. Abre en la portada: saludo, 4 botones grandes, 3 chicos, sin "← Inicio".
2. Cada botón abre su pantalla con título y ayuda en la barra; "← Inicio" vuelve.
3. Registro arranca en Octubre 2026; "Enero 2026" muestra las tarjetas con lote arriba y barriles abajo; "Todos" pliega los meses salvo el primero.
4. Búsquedas: `25242` (lote + resumen), `2180036` (ficha + tarjeta resaltada), `50157` (barril de 5 dígitos), `OT 812`, `14/1`, `xyz` (mensaje sin resultados).
5. Tocar un número de barril abre su ficha; "Ver en el mapa" abre Dónde está con el número buscado.
6. Una orden recién cargada muestra Editar/Borrar; Editar abre Llenado / vaciado con la orden cargada.
7. `document.body.classList.add('imprimiendo-registro')` + emulación de impresión, o captura de `window.print` reemplazado: verificar con `getComputedStyle` que `.reg-barra` y `#areaImpresion` quedan `none` y `main` `block`.
8. Sin errores en `read_console_messages`.

- [ ] **Step 4: Comprobar que el programador no cambió**

Si el server permite simular rol admin (mirar cómo inyecta `window.CIW.rol` con `DEV_EMAIL`/perfil local), recargar como admin: barra de pestañas del programador, historial de Escáner visible, sin portada. Si no se puede simular, comprobar por CSS que ninguna regla nueva aplica sin `rol-operario` y decirlo.

- [ ] **Step 5: Limpiar**

Borrar `seed-doc.json` y `seed-payload.json`; `git status` limpio salvo lo commiteado.

---

### Task 6: Merge y aviso de deploy

- [ ] **Step 1:** `npm test` y `npx tsc --noEmit` en verde en la rama.
- [ ] **Step 2:** Usar superpowers:finishing-a-development-branch. El merge va a `main` en `C:\Users\Bmax\repos\catenainstitute` (revisar antes su `git status`: si hay trabajo sin commitear de otra sesión, no tocarlo y avisar).
- [ ] **Step 3:** Push de `main` si el usuario lo aprueba. Recordar que el push **no publica**: el usuario corre `npx.cmd wrangler deploy` en `cmd.exe` desde `C:\Users\Bmax\repos\catenainstitute` con `main` limpio.
