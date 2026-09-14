# Tablero FML — Tramo 1: el motor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el motor FML de la web decida exactamente lo mismo que el tablero aprobado por los supervisores: las 11 condiciones, con sus umbrales, su antigüedad y su acción sugerida.

**Architecture:** Las reglas se mudan a `src/lotes/motores/fml-condiciones.ts` como funciones puras, una por condición, cada una devolviendo estado más la fecha desde la que rige. `fml.ts` queda como orquestador: arma los criterios efectivos, llama a las condiciones y ensambla `ResultadoLote`. La dependencia es en un solo sentido (`fml.ts` → `fml-condiciones.ts`) para que no haya import circular.

**Tech Stack:** TypeScript, Cloudflare Workers, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-lotes-tablero-fml-design.md`

## Global Constraints

- Rama de trabajo: `feat/tablero-fml`.
- La UI **no se toca en este tramo**. `vista-fml.js` sigue viva y funcionando.
- Todo `ResultadoLote` que hoy consumen Dashboard, Evolución y Orden de muestras se sigue publicando: `so2_ok`, `ph_ok`, `vencido`, `dias_desde_analisis`, `ultima_fecha`, `alarmas`, `fa_estado`, `fml_estado`, `estado_llenado`, `frecuencia_max`, `inoculado`, `litros`, `activo`.
- `so2_molecular = so2_libre / (1 + 10^(pH − 1.8))`.
- Fechas: siempre día UTC (`Date.parse(iso + 'T00:00:00Z')`). Nunca hora local.
- `INVALIDO = -999` significa "medido pero inválido", distinto de "sin dato".
- Comandos: `npm test` y `npx tsc --noEmit`. Los dos tienen que quedar verdes en cada commit.
- Mensajes de commit en español, sin tildes en el asunto (convención del repo).

---

### Task 1: Criterios nuevos y piso de SO₂ en 20

**Files:**
- Modify: `src/lotes/motores/fml.ts:14-43` (interfaz `Criterios` y `CRITERIOS_DEFAULT`)
- Modify: `public/lotes/js/criterios.js` (el espejo JS)
- Test: `test/lotes-fml.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `Criterios` con tres claves nuevas — `so2_caida_max: number`, `so2_aplica: string`, `ph_max_inclusive: string` — y `so2_libre_piso: 20.0`.

- [ ] **Step 1: Escribir el test que falla**

En `test/lotes-fml.test.ts`, dentro del `describe('criterios efectivos')`:

```typescript
it('trae las claves nuevas del tablero', () => {
  expect(CRITERIOS_DEFAULT.so2_libre_piso).toBe(20.0);
  expect(CRITERIOS_DEFAULT.so2_caida_max).toBe(12.0);
  expect(CRITERIOS_DEFAULT.so2_aplica).toBe('si');
  expect(CRITERIOS_DEFAULT.ph_max_inclusive).toBe('no');
});

it('un proyecto puede apagar el SO2', () => {
  const eff = criteriosEfectivos(
    { default: { ...CRITERIOS_DEFAULT }, por_proyecto: { 'El Amiguito': { so2_aplica: 'no' } } },
    'Malbec',
    'el amiguito',
  );
  expect(eff.so2_aplica).toBe('no');
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npx vitest run test/lotes-fml.test.ts -t "claves nuevas"`
Expected: FAIL — `expected 25 to be 20`.

- [ ] **Step 3: Implementar**

En `fml.ts`, agregar a la interfaz `Criterios` (después de `so2_libre_piso`):

```typescript
  so2_caida_max: number;
  so2_aplica: string;
  ph_max_inclusive: string;
```

Y en `CRITERIOS_DEFAULT` cambiar el piso y sumar las tres:

```typescript
  so2_libre_piso: 20.0,
  so2_caida_max: 12.0,
  so2_aplica: 'si',
  ph_max_inclusive: 'no',
```

- [ ] **Step 4: Reconciliar el test que asumía 25**

`test/lotes-fml.test.ts:54` afirma `expect(eff.so2_libre_piso).toBe(25.0)`. Cambiarlo a `20.0`. Es el mismo caso —"lo no sobrescrito viene del default"— con el default nuevo.

- [ ] **Step 5: Espejar en el cliente**

En `public/lotes/js/criterios.js`, `CRITERIOS_DEFAULT` tiene que quedar idéntico: `so2_libre_piso: 20.0` y las tres claves nuevas. Este archivo sólo lo usa la pestaña Configuración para resolver herencia; no decide reglas.

- [ ] **Step 6: Correr todo**

Run: `npm test && npx tsc --noEmit`
Expected: los tests nuevos PASAN. **Es esperable que fallen otros** de SO₂ que asumían el piso 25 — anotarlos, no tocarlos todavía: se reconcilian en la Task 9, cuando la regla nueva esté completa.

- [ ] **Step 7: Commit**

```bash
git add src/lotes/motores/fml.ts public/lotes/js/criterios.js test/lotes-fml.test.ts
git commit -m "feat: criterios del tablero aprobado, con el piso de SO2 en 20"
```

---

### Task 2: `fml-condiciones.ts` con los helpers de bajo nivel

Mudanza mecánica primero, para que las tareas siguientes tengan dónde apoyarse sin import circular.

**Files:**
- Create: `src/lotes/motores/fml-condiciones.ts`
- Modify: `src/lotes/motores/fml.ts` (importa y re-exporta)
- Test: `test/lotes-condiciones.test.ts` (nuevo)

**Interfaces:**
- Consumes: `Criterios` de Task 1.
- Produces:
  - `type Fila = Record<string, unknown>`
  - `num(x: unknown): number | null`
  - `fechaDia(iso: unknown): number | null` — ms UTC del día, o null
  - `valorValido(x: unknown): number | null` — null si es null o −999
  - `ordenarPorFecha(analisis: Fila[]): Fila[]`
  - `so2LibreDe(a: Fila): number | null` — mira `so2_libre_actual`, `so2_libre` y sus gemelos dentro de `correccion`; **ignora el 0 como placeholder**
  - `INVALIDO = -999`, `DIA_MS = 86_400_000`

- [ ] **Step 1: Escribir el test que falla**

Crear `test/lotes-condiciones.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { so2LibreDe, valorValido, fechaDia } from '../src/lotes/motores/fml-condiciones';

describe('helpers de condiciones', () => {
  it('el SO2 en 0 es un placeholder, no una medicion', () => {
    expect(so2LibreDe({ so2_libre: 0 })).toBe(null);
    expect(so2LibreDe({ so2_libre: 18 })).toBe(18);
  });

  it('prefiere so2_libre_actual y sabe mirar dentro de correccion', () => {
    expect(so2LibreDe({ so2_libre_actual: 31, so2_libre: 12 })).toBe(31);
    expect(so2LibreDe({ correccion: { so2_libre: 27 } })).toBe(27);
  });

  it('el -999 no es un valor', () => {
    expect(valorValido(-999)).toBe(null);
    expect(valorValido(0.62)).toBe(0.62);
  });

  it('la fecha se lee como dia UTC', () => {
    expect(fechaDia('2026-08-24T13:45:00')).toBe(Date.parse('2026-08-24T00:00:00Z'));
    expect(fechaDia('no es fecha')).toBe(null);
  });
});
```

- [ ] **Step 2: Correr y verlo fallar**

Run: `npx vitest run test/lotes-condiciones.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Crear el módulo**

`src/lotes/motores/fml-condiciones.ts` arranca con el encabezado y los helpers movidos **literalmente** desde `fml.ts` (`num`, `fecha`→`fechaDia`, `valorValido`, `ordenarPorFecha`, `INVALIDO`, `DIA_MS`, `FECHA_MAX`, `Fila`), todos exportados.

El tipo `Criterios` se queda en `fml.ts` y acá se trae **sólo como tipo**, que TypeScript borra al compilar y por lo tanto no crea ciclo en tiempo de ejecución:

```typescript
import type { Criterios } from './fml';
```

`so2LibreDe` es el `so2Libre` privado de `fml.ts:190-199` **más el descarte del 0**:

```typescript
/**
 * SO2 libre de una fila. El 0 es el placeholder que deja el laboratorio cuando
 * no midio, asi que no cuenta como medicion: tratarlo como valor real daria
 * "SO2 no OK" en lotes que nunca se analizaron.
 */
export function so2LibreDe(a: Fila): number | null {
  for (const campo of ['so2_libre_actual', 'so2_libre']) {
    let v = valorValido(a[campo]);
    if (v === null && a.correccion && typeof a.correccion === 'object') {
      v = valorValido((a.correccion as Fila)[campo]);
    }
    if (v !== null && v !== 0) return v;
  }
  return null;
}
```

- [ ] **Step 4: Dejar `fml.ts` apoyado en el módulo nuevo**

En `fml.ts`: borrar las definiciones movidas, importarlas y **re-exportar** las tres que ya eran públicas, porque `etapas.ts` y los tests las importan desde `fml`:

```typescript
import { num, fechaDia as fecha, valorValido, ordenarPorFecha, so2LibreDe, INVALIDO, DIA_MS, type Fila } from './fml-condiciones';

export { valorValido, ordenarPorFecha, INVALIDO, type Fila };
```

Los alias internos `ordenar` y `valido` siguen apuntando a lo mismo. El `so2Libre` privado se reemplaza por `so2LibreDe`.

- [ ] **Step 5: Correr todo**

Run: `npm test && npx tsc --noEmit`
Expected: los tests nuevos PASAN y **`test/lotes-etapas.test.ts` sigue verde** — es la prueba de que la re-exportación quedó bien.

- [ ] **Step 6: Commit**

```bash
git add src/lotes/motores/fml-condiciones.ts src/lotes/motores/fml.ts test/lotes-condiciones.test.ts
git commit -m "refactor: los helpers del motor FML se mudan a fml-condiciones"
```

---

### Task 3: Medición útil, control de proceso y frecuencia

**Files:**
- Modify: `src/lotes/motores/fml-condiciones.ts`
- Test: `test/lotes-condiciones.test.ts`

**Interfaces:**
- Produces:
  - `esMedicionUtil(a: Fila): boolean`
  - `tieneAnalisisValido(analisis: Fila[]): boolean`
  - `ultimoControlProceso(analisis: Fila[]): Fila | null`
  - `estadoFrecuencia(analisis: Fila[], eff: Criterios, fmlEstado: string, hoy: number): ResultadoFrecuencia`

```typescript
export interface ResultadoFrecuencia {
  estado: 'al_dia' | 'vencido' | 'sin_datos';
  ultima_fecha_control: string | null;
  dias_desde_control: number | null;
  frecuencia_max: number;
  control_proceso_pendiente: boolean;
  desde: string | null;   // fecha en que vencio
}
```

- [ ] **Step 1: Escribir los tests que fallan**

```typescript
import {
  esMedicionUtil, ultimoControlProceso, estadoFrecuencia,
} from '../src/lotes/motores/fml-condiciones';
import { CRITERIOS_DEFAULT } from '../src/lotes/motores/fml';

const d = (iso: string) => Date.parse(iso + 'T00:00:00Z');
const eff = () => ({ ...CRITERIOS_DEFAULT });

describe('medicion util', () => {
  it('un control suelto de SO2 ya es analisis valido', () => {
    expect(esMedicionUtil({ fecha_analisis: '2026-08-01', so2_libre: 24 })).toBe(true);
  });

  it('una fila sin ninguna medicion no cuenta', () => {
    expect(esMedicionUtil({ fecha_analisis: '2026-08-01', comentario: 'nada' })).toBe(false);
  });

  it('el -999 no alcanza para ser medicion util', () => {
    expect(esMedicionUtil({ fecha_analisis: '2026-08-01', av: -999 })).toBe(false);
  });
});

describe('control de proceso', () => {
  it('exige etanol, AV y malico en la MISMA fila', () => {
    const filas = [
      { fecha_analisis: '2026-08-01', etanol: 13.9, av: 0.4 },
      { fecha_analisis: '2026-08-10', malico: 0.1 },
    ];
    expect(ultimoControlProceso(filas)).toBe(null);
  });

  it('toma el mas reciente que los tenga juntos', () => {
    const filas = [
      { fecha_analisis: '2026-07-01', etanol: 13.9, av: 0.4, malico: 0.1 },
      { fecha_analisis: '2026-08-01', etanol: 14.1, av: 0.5, malico: 0.1 },
      { fecha_analisis: '2026-08-20', ph: 3.6 },
    ];
    expect(ultimoControlProceso(filas)?.fecha_analisis).toBe('2026-08-01');
  });
});

describe('frecuencia', () => {
  it('un pH suelto NO reinicia el reloj', () => {
    const filas = [
      { fecha_analisis: '2026-07-01', etanol: 14, av: 0.4, malico: 0.6 },
      { fecha_analisis: '2026-08-20', ph: 3.6 },
    ];
    const r = estadoFrecuencia(filas, eff(), 'no_finalizada', d('2026-08-24'));
    expect(r.dias_desde_control).toBe(54);
    expect(r.estado).toBe('vencido');
    expect(r.desde).toBe('2026-07-16'); // 1 de julio + 15 dias
  });

  it('con FML terminada la frecuencia es de 30 dias', () => {
    const filas = [{ fecha_analisis: '2026-08-01', etanol: 14, av: 0.4, malico: 0.1 }];
    const r = estadoFrecuencia(filas, eff(), 'finalizada', d('2026-08-24'));
    expect(r.frecuencia_max).toBe(30);
    expect(r.estado).toBe('al_dia');
  });

  it('la FML excluida tambien afloja a 30 dias', () => {
    const filas = [{ fecha_analisis: '2026-08-01', etanol: 14, av: 0.4, malico: 0.1 }];
    expect(estadoFrecuencia(filas, eff(), 'excluida', d('2026-08-24')).frecuencia_max).toBe(30);
  });

  it('sin saber el estado de la FML se exige el plazo corto', () => {
    // Lote 26280 del tablero: fml_estado sin_datos y frecuencia_maxima 15.
    const filas = [{ fecha_analisis: '2026-08-01', etanol: 14, av: 0.4, malico: 0.1 }];
    expect(estadoFrecuencia(filas, eff(), 'sin_dato', d('2026-08-24')).frecuencia_max).toBe(15);
  });

  it('sin control de proceso queda pendiente y sin datos', () => {
    const r = estadoFrecuencia([{ fecha_analisis: '2026-08-01', ph: 3.6 }], eff(), 'no_finalizada', d('2026-08-24'));
    expect(r.control_proceso_pendiente).toBe(true);
    expect(r.estado).toBe('sin_datos');
    expect(r.dias_desde_control).toBe(null);
  });
});
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run test/lotes-condiciones.test.ts`
Expected: FAIL — las funciones no existen.

- [ ] **Step 3: Implementar**

```typescript
const METRICAS_UTILES = ['ph', 'av', 'malico', 'azucar_reductor', 'so2_libre', 'etanol'];
const METRICAS_PROCESO = ['etanol', 'av', 'malico'];

/** Una fila cuenta como analisis si trae fecha y al menos una medicion real. */
export function esMedicionUtil(a: Fila): boolean {
  if (fechaDia(a.fecha_analisis) === null) return false;
  return METRICAS_UTILES.some((m) => (m === 'so2_libre' ? so2LibreDe(a) : valorValido(a[m])) !== null);
}

export function tieneAnalisisValido(analisis: Fila[]): boolean {
  return (analisis ?? []).some(esMedicionUtil);
}

/**
 * El control de proceso exige etanol, AV y malico en la MISMA fila: es una
 * corrida completa del FOSS. Mediciones sueltas no lo reemplazan, y por eso no
 * reinician la frecuencia.
 */
export function ultimoControlProceso(analisis: Fila[]): Fila | null {
  const ordenados = ordenarPorFecha(analisis);
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const a = ordenados[i];
    if (fechaDia(a.fecha_analisis) === null) continue;
    if (METRICAS_PROCESO.every((m) => valorValido(a[m]) !== null)) return a;
  }
  return null;
}

export function estadoFrecuencia(
  analisis: Fila[],
  eff: Criterios,
  fmlEstado: string,
  hoy: number,
): ResultadoFrecuencia {
  // Solo aflojan a 30 dias los lotes con la FML cerrada o excluida. "sin_dato"
  // se trata como no terminada: no saber no es una razon para espaciar.
  const terminada = fmlEstado === 'finalizada' || fmlEstado === 'excluida';
  const frecuencia_max = terminada ? eff.frecuencia_terminada : eff.frecuencia_no_terminada;
  const control = ultimoControlProceso(analisis);

  if (!control) {
    return {
      estado: 'sin_datos',
      ultima_fecha_control: null,
      dias_desde_control: null,
      frecuencia_max,
      control_proceso_pendiente: true,
      desde: null,
    };
  }

  const f = fechaDia(control.fecha_analisis) as number;
  const dias = Math.round((hoy - f) / DIA_MS);
  const vencido = dias > frecuencia_max;

  return {
    estado: vencido ? 'vencido' : 'al_dia',
    ultima_fecha_control: String(control.fecha_analisis).slice(0, 10),
    dias_desde_control: dias,
    frecuencia_max,
    control_proceso_pendiente: false,
    desde: vencido ? new Date(f + frecuencia_max * DIA_MS).toISOString().slice(0, 10) : null,
  };
}
```

- [ ] **Step 4: Correr y verlos pasar**

Run: `npx vitest run test/lotes-condiciones.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lotes/motores/fml-condiciones.ts test/lotes-condiciones.test.ts
git commit -m "feat: control de proceso y frecuencia contada desde la corrida completa"
```

---

### Task 4: Antigüedad genérica (`desdeCuando`)

Se hace antes que pH, SO₂ y AV porque las tres la usan.

**Files:**
- Modify: `src/lotes/motores/fml-condiciones.ts`
- Test: `test/lotes-condiciones.test.ts`

**Interfaces:**
- Produces: `desdeCuando(analisis: Fila[], cumple: (a: Fila) => boolean | null): string | null`

`cumple` devuelve `true` (la condición se cumple en esa fila), `false` (no se cumple) o `null` (esa fila no tiene el dato, así que no opina).

- [ ] **Step 1: Escribir el test que falla**

```typescript
describe('desde cuando', () => {
  const filas = [
    { fecha_analisis: '2026-06-01', ph: 3.5 },
    { fecha_analisis: '2026-07-01', ph: 3.9 },
    { fecha_analisis: '2026-08-01', ph: 3.9 },
  ];

  it('devuelve el mas viejo de la corrida que sigue cumpliendo', () => {
    expect(desdeCuando(filas, (a) => (a.ph == null ? null : Number(a.ph) > 3.75))).toBe('2026-07-01');
  });

  it('las filas sin el dato no cortan la corrida', () => {
    const conHueco = [
      { fecha_analisis: '2026-07-01', ph: 3.9 },
      { fecha_analisis: '2026-07-15', av: 0.4 },
      { fecha_analisis: '2026-08-01', ph: 3.9 },
    ];
    expect(desdeCuando(conHueco, (a) => (a.ph == null ? null : Number(a.ph) > 3.75))).toBe('2026-07-01');
  });

  it('si la ultima no cumple, no hay desde', () => {
    expect(desdeCuando(filas, (a) => (a.ph == null ? null : Number(a.ph) > 4.5))).toBe(null);
  });
});
```

- [ ] **Step 2: Correr y verlo fallar**

Run: `npx vitest run test/lotes-condiciones.test.ts -t "desde cuando"`
Expected: FAIL — `desdeCuando is not a function`.

- [ ] **Step 3: Implementar**

```typescript
/**
 * Desde cuando rige una condicion: se camina el historial hacia atras mientras
 * se siga cumpliendo y se devuelve la fecha de la mas vieja de esa corrida.
 *
 * Las filas que no traen el dato devuelven null y se saltean sin cortar: un
 * analisis de AV en el medio no "arregla" un pH alto que nadie volvio a medir.
 */
export function desdeCuando(
  analisis: Fila[],
  cumple: (a: Fila) => boolean | null,
): string | null {
  const ordenados = ordenarPorFecha(analisis).filter((a) => fechaDia(a.fecha_analisis) !== null);
  let desde: string | null = null;
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const v = cumple(ordenados[i]);
    if (v === null) continue;
    if (!v) break;
    desde = String(ordenados[i].fecha_analisis).slice(0, 10);
  }
  return desde;
}
```

- [ ] **Step 4: Correr y verlos pasar**

Run: `npx vitest run test/lotes-condiciones.test.ts -t "desde cuando"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lotes/motores/fml-condiciones.ts test/lotes-condiciones.test.ts
git commit -m "feat: antiguedad de una condicion derivada del historial"
```

---

### Task 5: pH, con el límite inclusivo opcional

**Files:**
- Modify: `src/lotes/motores/fml-condiciones.ts`
- Modify: `src/lotes/motores/fml.ts:334-359` (`flagsAnalisis`, para que no contradiga)
- Test: `test/lotes-condiciones.test.ts`

**Interfaces:**
- Produces:
  - `phFueraDeCriterio(ph: number, eff: Criterios): boolean`
  - `estadoPh(analisis: Fila[], eff: Criterios): { estado: 'ok'|'no_ok'|'sin_datos'; valor: number|null; fecha: string|null; desde: string|null }`

- [ ] **Step 1: Escribir los tests que fallan**

```typescript
describe('pH', () => {
  it('por defecto el limite es exclusivo', () => {
    expect(phFueraDeCriterio(3.75, { ...CRITERIOS_DEFAULT })).toBe(false);
    expect(phFueraDeCriterio(3.76, { ...CRITERIOS_DEFAULT })).toBe(true);
  });

  it('el Cabernet lo tiene inclusivo', () => {
    const cab = { ...CRITERIOS_DEFAULT, ph_max: 3.79, ph_max_inclusive: 'si' };
    expect(phFueraDeCriterio(3.79, cab)).toBe(true);
    expect(phFueraDeCriterio(3.78, cab)).toBe(false);
  });

  it('manda el ultimo pH, no el mejor', () => {
    const r = estadoPh(
      [
        { fecha_analisis: '2026-06-01', ph: 3.5 },
        { fecha_analisis: '2026-08-01', ph: 3.9 },
      ],
      { ...CRITERIOS_DEFAULT },
    );
    expect(r.estado).toBe('no_ok');
    expect(r.valor).toBe(3.9);
    expect(r.desde).toBe('2026-08-01');
  });

  it('sin ningun pH queda sin datos', () => {
    expect(estadoPh([{ fecha_analisis: '2026-08-01', av: 0.4 }], { ...CRITERIOS_DEFAULT }).estado).toBe('sin_datos');
  });
});
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run test/lotes-condiciones.test.ts -t "pH"`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
/**
 * El tablero usa "> 3.65", "> 3.75" y ">= 3.79": el Cabernet es inclusivo y el
 * resto no. La clave ph_max_inclusive lo hace explicito en vez de esconderlo en
 * un 3.789 magico.
 */
export function phFueraDeCriterio(ph: number, eff: Criterios): boolean {
  const inclusive = String(eff.ph_max_inclusive ?? 'no').trim().toLowerCase() === 'si';
  return inclusive ? ph >= eff.ph_max : ph > eff.ph_max;
}

export function estadoPh(analisis: Fila[], eff: Criterios) {
  const ordenados = ordenarPorFecha(analisis);
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const v = valorValido(ordenados[i].ph);
    if (v === null) continue;
    const fuera = phFueraDeCriterio(v, eff);
    return {
      estado: (fuera ? 'no_ok' : 'ok') as 'ok' | 'no_ok' | 'sin_datos',
      valor: v,
      fecha: String(ordenados[i].fecha_analisis).slice(0, 10),
      desde: fuera
        ? desdeCuando(analisis, (a) => {
            const p = valorValido(a.ph);
            return p === null ? null : phFueraDeCriterio(p, eff);
          })
        : null,
    };
  }
  return { estado: 'sin_datos' as const, valor: null, fecha: null, desde: null };
}
```

- [ ] **Step 4: Dejar `flagsAnalisis` consistente**

En `fml.ts:339` dice `if (ph !== null && ph >= eff.ph_max)`. Con el default exclusivo eso pintaría de rojo un pH que el motor considera OK. Reemplazar por la función compartida:

```typescript
  if (ph !== null && phFueraDeCriterio(ph, eff)) fuera.push('ph');
```

- [ ] **Step 5: Correr todo**

Run: `npm test && npx tsc --noEmit`
Expected: los de pH PASAN. Si algún test viejo esperaba que 3.75 clavado alarme, es el cambio de semántica del spec: se reconcilia en la Task 9.

- [ ] **Step 6: Commit**

```bash
git add src/lotes/motores/fml-condiciones.ts src/lotes/motores/fml.ts test/lotes-condiciones.test.ts
git commit -m "feat: el limite de pH puede ser inclusivo, como en los Cabernet"
```

---

### Task 6: SO₂ en dos tramos

**Files:**
- Modify: `src/lotes/motores/fml-condiciones.ts`
- Test: `test/lotes-condiciones.test.ts`

**Interfaces:**
- Produces: `estadoSo2(analisis: Fila[], eff: Criterios): ResultadoSo2`

```typescript
export interface ResultadoSo2 {
  estado: 'ok' | 'no_ok' | 'no_aplica' | 'sin_datos';
  libre: number | null;
  libre_fecha: string | null;
  ph_referencia: number | null;
  ph_referencia_fecha: string | null;
  molecular: number | null;
  motivo: string;
  desde: string | null;
}
```

- [ ] **Step 1: Escribir los tests que fallan**

```typescript
describe('SO2', () => {
  const base = { ...CRITERIOS_DEFAULT };

  it('en el piso exacto es no OK', () => {
    const r = estadoSo2([{ fecha_analisis: '2026-08-01', so2_libre: 20, ph: 3.4 }], base);
    expect(r.estado).toBe('no_ok');
  });

  it('arriba del piso pero con molecular bajo tambien es no OK', () => {
    // pH 3.8: molecular = 28 / (1 + 10^2) = 0.277 < 0.38
    const r = estadoSo2([{ fecha_analisis: '2026-08-01', so2_libre: 28, ph: 3.8 }], base);
    expect(r.estado).toBe('no_ok');
    expect(r.molecular).toBeCloseTo(0.277, 3);
  });

  it('arriba del piso y con molecular suficiente es OK', () => {
    // pH 3.2: molecular = 24 / (1 + 10^1.4) = 0.925 >= 0.38
    const r = estadoSo2([{ fecha_analisis: '2026-08-01', so2_libre: 24, ph: 3.2 }], base);
    expect(r.estado).toBe('ok');
  });

  it('sin pH en la muestra cae al ultimo pH del lote, como el tablero', () => {
    // El lote 26031 del tablero aprobado tiene el SO2 del 19/08 y el pH del
    // 11/09, y queda "ok": el pH de referencia puede venir de otra muestra.
    const r = estadoSo2(
      [
        { fecha_analisis: '2026-08-01', so2_libre: 26 },
        { fecha_analisis: '2026-09-11', ph: 3.2 },
      ],
      base,
    );
    expect(r.estado).toBe('ok');
    expect(r.ph_referencia).toBe(3.2);
    expect(r.ph_referencia_fecha).toBe('2026-09-11');
    expect(r.libre_fecha).toBe('2026-08-01');
  });

  it('sin ningun pH en todo el lote si queda sin datos', () => {
    const r = estadoSo2([{ fecha_analisis: '2026-08-01', so2_libre: 26 }], base);
    expect(r.estado).toBe('sin_datos');
  });

  it('el proyecto sin adicion de SO2 no aplica', () => {
    const r = estadoSo2([{ fecha_analisis: '2026-08-01', so2_libre: 8, ph: 3.4 }], { ...base, so2_aplica: 'no' });
    expect(r.estado).toBe('no_aplica');
  });

  it('el 0 no es una medicion', () => {
    expect(estadoSo2([{ fecha_analisis: '2026-08-01', so2_libre: 0, ph: 3.4 }], base).estado).toBe('sin_datos');
  });
});
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run test/lotes-condiciones.test.ts -t "SO2"`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
function molecularDe(libre: number, ph: number): number {
  return libre / (1 + Math.pow(10, ph - 1.8));
}

/** Ultimo pH valido del lote, con su fecha. Es el pH de referencia de respaldo. */
function ultimoPh(analisis: Fila[]): [number | null, string | null] {
  const ordenados = ordenarPorFecha(analisis);
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const v = valorValido(ordenados[i].ph);
    if (v !== null) return [v, String(ordenados[i].fecha_analisis).slice(0, 10)];
  }
  return [null, null];
}

function so2NoOk(a: Fila, eff: Criterios, phRespaldo: number | null): boolean | null {
  const libre = so2LibreDe(a);
  if (libre === null) return null;
  if (libre <= eff.so2_libre_piso) return true;
  const ph = valorValido(a.ph) ?? phRespaldo;
  if (ph === null) return null;
  return molecularDe(libre, ph) < eff.so2_molecular_objetivo;
}

/**
 * Dos tramos, como el tablero: en el piso o por debajo es no OK sin mirar nada
 * mas; por encima, decide el molecular.
 *
 * El pH sale de la misma muestra cuando esta, y si no del ultimo pH valido del
 * lote. Verificado contra el tablero aprobado: su lote 26031 tiene el SO2 del
 * 19/08 y el pH del 11/09 y queda "ok", asi que el respaldo existe alla tambien.
 * ph_referencia_fecha deja ver de que muestra salio.
 */
export function estadoSo2(analisis: Fila[], eff: Criterios): ResultadoSo2 {
  const vacio = {
    libre: null, libre_fecha: null, ph_referencia: null,
    ph_referencia_fecha: null, molecular: null, desde: null,
  };

  if (String(eff.so2_aplica ?? 'si').trim().toLowerCase() === 'no') {
    return { ...vacio, estado: 'no_aplica', motivo: 'el proyecto no lleva adicion de SO2' };
  }

  const [phRespaldo, phRespaldoFecha] = ultimoPh(analisis);
  const ordenados = ordenarPorFecha(analisis);

  for (let i = ordenados.length - 1; i >= 0; i--) {
    const a = ordenados[i];
    const libre = so2LibreDe(a);
    if (libre === null) continue;

    const libre_fecha = String(a.fecha_analisis).slice(0, 10);
    const desde = () => desdeCuando(analisis, (f) => so2NoOk(f, eff, phRespaldo));

    if (libre <= eff.so2_libre_piso) {
      return {
        ...vacio, estado: 'no_ok', libre, libre_fecha,
        motivo: `SO2 libre ${libre} ppm, en o por debajo del piso de ${eff.so2_libre_piso}`,
        desde: desde(),
      };
    }

    const propio = valorValido(a.ph);
    const ph = propio ?? phRespaldo;
    if (ph === null) {
      return {
        ...vacio, estado: 'sin_datos', libre, libre_fecha,
        motivo: 'el lote no tiene ningun pH, no se puede calcular el molecular',
      };
    }

    const molecular = molecularDe(libre, ph);
    const bajo = molecular < eff.so2_molecular_objetivo;
    return {
      estado: bajo ? 'no_ok' : 'ok',
      libre, libre_fecha,
      ph_referencia: ph,
      ph_referencia_fecha: propio !== null ? libre_fecha : phRespaldoFecha,
      molecular,
      motivo: bajo
        ? `molecular ${molecular.toFixed(3)} mg/L, por debajo de ${eff.so2_molecular_objetivo}`
        : `molecular ${molecular.toFixed(3)} mg/L, suficiente`,
      desde: bajo ? desde() : null,
    };
  }

  return { ...vacio, estado: 'sin_datos', motivo: 'sin ninguna medicion de SO2 libre' };
}
```

- [ ] **Step 4: Correr y verlos pasar**

Run: `npx vitest run test/lotes-condiciones.test.ts -t "SO2"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lotes/motores/fml-condiciones.ts test/lotes-condiciones.test.ts
git commit -m "feat: SO2 en dos tramos y con el pH de la misma muestra"
```

---

### Task 7: Caída de SO₂ y AV con motivo

Van juntas porque las dos son "alertas" y ninguna cambia de estado: sólo prenden o no.

**Files:**
- Modify: `src/lotes/motores/fml-condiciones.ts`
- Test: `test/lotes-condiciones.test.ts`

**Interfaces:**
- Produces:
  - `caidaSo2(analisis: Fila[], eff: Criterios): ResultadoCaida`
  - `alertaAv(analisis: Fila[], eff: Criterios): ResultadoAv`

```typescript
export interface ResultadoCaida {
  alerta: boolean;
  anterior: number | null; anterior_fecha: string | null;
  actual: number | null;   actual_fecha: string | null;
  caida: number | null;
  desde: string | null;
}

export interface ResultadoAv {
  alerta: boolean;
  motivo: 'umbral' | 'aumento' | 'fuera_rango_foss' | null;
  valor: number | null;
  fecha: string | null;
  delta: number | null;
  desde: string | null;
}
```

- [ ] **Step 1: Escribir los tests que fallan**

```typescript
describe('caida de SO2', () => {
  const base = { ...CRITERIOS_DEFAULT };

  it('una caida de mas de 12 ppm alarma', () => {
    const r = caidaSo2([
      { fecha_analisis: '2026-07-01', so2_libre: 35 },
      { fecha_analisis: '2026-08-01', so2_libre: 22 },
    ], base);
    expect(r.alerta).toBe(true);
    expect(r.caida).toBe(13);
  });

  it('12 clavado NO alarma: el umbral es estricto', () => {
    const r = caidaSo2([
      { fecha_analisis: '2026-07-01', so2_libre: 34 },
      { fecha_analisis: '2026-08-01', so2_libre: 22 },
    ], base);
    expect(r.alerta).toBe(false);
  });

  it('no se evalua en proyectos sin SO2', () => {
    const r = caidaSo2([
      { fecha_analisis: '2026-07-01', so2_libre: 35 },
      { fecha_analisis: '2026-08-01', so2_libre: 10 },
    ], { ...base, so2_aplica: 'no' });
    expect(r.alerta).toBe(false);
  });

  it('dos mediciones del mismo dia no son dos fechas distintas', () => {
    const r = caidaSo2([
      { fecha_analisis: '2026-08-01', so2_libre: 35 },
      { fecha_analisis: '2026-08-01', so2_libre: 18 },
    ], base);
    expect(r.alerta).toBe(false);
  });
});

describe('AV', () => {
  const base = { ...CRITERIOS_DEFAULT };

  it('por encima del umbral', () => {
    const r = alertaAv([{ fecha_analisis: '2026-08-01', av: 0.95 }], base);
    expect(r.alerta).toBe(true);
    expect(r.motivo).toBe('umbral');
  });

  it('por salto en la ventana de 15 dias', () => {
    const r = alertaAv([
      { fecha_analisis: '2026-08-01', av: 0.3 },
      { fecha_analisis: '2026-08-10', av: 0.7 },
    ], base);
    expect(r.alerta).toBe(true);
    expect(r.motivo).toBe('aumento');
    expect(r.delta).toBeCloseTo(0.4, 5);
  });

  it('el mismo salto fuera de la ventana no alarma', () => {
    const r = alertaAv([
      { fecha_analisis: '2026-06-01', av: 0.3 },
      { fecha_analisis: '2026-08-10', av: 0.7 },
    ], base);
    expect(r.alerta).toBe(false);
  });

  it('el -999 del FOSS alarma con su propio motivo', () => {
    const r = alertaAv([{ fecha_analisis: '2026-08-01', av: -999 }], base);
    expect(r.alerta).toBe(true);
    expect(r.motivo).toBe('fuera_rango_foss');
  });
});
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run test/lotes-condiciones.test.ts -t "caida de SO2"`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
/**
 * Caida entre las dos ultimas FECHAS DISTINTAS con SO2 valido. Dos mediciones
 * del mismo dia son la misma foto, no una evolucion.
 */
export function caidaSo2(analisis: Fila[], eff: Criterios): ResultadoCaida {
  const vacio: ResultadoCaida = {
    alerta: false, anterior: null, anterior_fecha: null,
    actual: null, actual_fecha: null, caida: null, desde: null,
  };
  if (String(eff.so2_aplica ?? 'si').trim().toLowerCase() === 'no') return vacio;

  const porFecha = new Map<string, number>();
  for (const a of ordenarPorFecha(analisis)) {
    const v = so2LibreDe(a);
    if (v === null || fechaDia(a.fecha_analisis) === null) continue;
    porFecha.set(String(a.fecha_analisis).slice(0, 10), v); // la ultima del dia manda
  }
  const fechas = [...porFecha.keys()].sort();
  if (fechas.length < 2) return vacio;

  const actual_fecha = fechas[fechas.length - 1];
  const anterior_fecha = fechas[fechas.length - 2];
  const actual = porFecha.get(actual_fecha) as number;
  const anterior = porFecha.get(anterior_fecha) as number;
  const caida = anterior - actual;
  const alerta = caida > eff.so2_caida_max;

  return {
    alerta, anterior, anterior_fecha, actual, actual_fecha, caida,
    desde: alerta ? actual_fecha : null,
  };
}

/**
 * Tres motivos, en orden de prioridad: el FOSS fuera de rango, el umbral y el
 * salto. El -999 gana porque significa que el valor no es confiable.
 */
export function alertaAv(analisis: Fila[], eff: Criterios): ResultadoAv {
  const ordenados = ordenarPorFecha(analisis);
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const a = ordenados[i];
    const raw = num(a.av);
    if (raw === null) continue;

    const fecha = String(a.fecha_analisis).slice(0, 10);
    if (raw === INVALIDO) {
      return { alerta: true, motivo: 'fuera_rango_foss', valor: null, fecha, delta: null, desde: fecha };
    }

    const fUltimo = fechaDia(a.fecha_analisis);
    if (raw > eff.av_max) {
      return {
        alerta: true, motivo: 'umbral', valor: raw, fecha, delta: null,
        desde: desdeCuando(analisis, (f) => {
          const v = valorValido(f.av);
          return v === null ? null : v > eff.av_max;
        }),
      };
    }

    for (let j = i - 1; j >= 0; j--) {
      const fp = fechaDia(ordenados[j].fecha_analisis);
      const pav = valorValido(ordenados[j].av);
      if (fp === null || fUltimo === null || pav === null || fp >= fUltimo) continue;
      if (fUltimo - fp <= eff.av_delta_dias * DIA_MS && raw - pav > eff.av_delta_max) {
        return { alerta: true, motivo: 'aumento', valor: raw, fecha, delta: raw - pav, desde: fecha };
      }
    }

    return { alerta: false, motivo: null, valor: raw, fecha, delta: null, desde: null };
  }
  return { alerta: false, motivo: null, valor: null, fecha: null, delta: null, desde: null };
}
```

- [ ] **Step 4: Correr y verlos pasar**

Run: `npx vitest run test/lotes-condiciones.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lotes/motores/fml-condiciones.ts test/lotes-condiciones.test.ts
git commit -m "feat: caida de SO2 y motivo de la alerta de AV"
```

---

### Task 8: FML, FA y el origen de la exclusión

**Files:**
- Modify: `src/lotes/motores/fml-condiciones.ts`
- Test: `test/lotes-condiciones.test.ts`

**Interfaces:**
- Produces:
  - `estadoFml(analisis: Fila[], eff: Criterios, lote: Fila): { estado: string; origen: 'lote'|'variedad'|null; desde: string|null }`
  - `estadoFa(analisis: Fila[], eff: Criterios): { estado: string; desde: string|null }`
  - `decisionFmlPresente(lote: Fila, eff: Criterios): boolean`

**La regla que hay que respetar:** la decisión de la fila del lote (`hace_fml` / `fml_excluida`) **le gana** a la de la variedad (`eff.hace_fml`, que viene de config).

- [ ] **Step 1: Escribir los tests que fallan**

```typescript
describe('FML', () => {
  const blanca = { ...CRITERIOS_DEFAULT, hace_fml: 'no' };
  const tinta = { ...CRITERIOS_DEFAULT };

  it('la variedad blanca excluye, y el origen lo dice', () => {
    const r = estadoFml([{ fecha_analisis: '2026-08-01', malico: 2.0 }], blanca, { lote: '1' });
    expect(r.estado).toBe('excluida');
    expect(r.origen).toBe('variedad_blanca');
  });

  it('el lote le gana a la variedad', () => {
    const r = estadoFml([{ fecha_analisis: '2026-08-01', malico: 2.0 }], blanca, { lote: '1', hace_fml: 'si' });
    expect(r.estado).toBe('no_finalizada');
    expect(r.origen).toBe('lote');
  });

  it('sin decision en ningun lado el origen queda sin dato', () => {
    const r = estadoFml([{ fecha_analisis: '2026-08-01', malico: 2.0 }], tinta, { lote: '1' });
    expect(r.origen).toBe('sin_dato');
  });

  it('cierra por malico bajo', () => {
    expect(estadoFml([{ fecha_analisis: '2026-08-01', malico: 0.1 }], tinta, { lote: '1' }).estado).toBe('finalizada');
  });

  it('cierra por dos ultimas por debajo de 0.5', () => {
    const r = estadoFml([
      { fecha_analisis: '2026-07-01', malico: 0.4 },
      { fecha_analisis: '2026-08-01', malico: 0.3 },
    ], tinta, { lote: '1' });
    expect(r.estado).toBe('finalizada');
  });

  it('la decision esta presente si la pone la variedad', () => {
    expect(decisionFmlPresente({ lote: '1' }, blanca)).toBe(true);
    expect(decisionFmlPresente({ lote: '1' }, tinta)).toBe(false);
    expect(decisionFmlPresente({ lote: '1', hace_fml: 'si' }, tinta)).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run test/lotes-condiciones.test.ts -t "FML"`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
function textoDe(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

/**
 * La variedad define el caso general y el lote es la excepcion puntual, asi que
 * lo que diga la fila del lote pisa a lo que diga config.
 */
export function estadoFml(analisis: Fila[], eff: Criterios, lote: Fila) {
  const decisionLote = textoDe(lote.hace_fml);
  const excluidaLote = textoDe(lote.fml_excluida);

  // Los nombres de origen son los del tablero (columna fml_excluida_origen).
  let excluida = false;
  let origen: 'lote' | 'variedad_blanca' | 'sin_dato' = 'sin_dato';
  if (excluidaLote === 'si' || decisionLote === 'no') {
    excluida = true; origen = 'lote';
  } else if (decisionLote === 'si' || excluidaLote === 'no') {
    origen = 'lote';
  } else if (textoDe(eff.hace_fml) === 'no') {
    excluida = true; origen = 'variedad_blanca';
  }
  if (excluida) return { estado: 'excluida', origen, desde: null };

  const malicos = ordenarPorFecha(analisis)
    .map((a) => valorValido(a.malico))
    .filter((v): v is number => v !== null);

  if (!malicos.length) return { estado: 'sin_dato', origen: null, desde: null };

  const ultimo = malicos[malicos.length - 1];
  const cierra =
    ultimo < eff.fml_malico_finalizada ||
    (malicos.length >= 2 &&
      ultimo < eff.fml_malico_2ultimas &&
      malicos[malicos.length - 2] < eff.fml_malico_2ultimas);

  if (cierra) return { estado: 'finalizada', origen: null, desde: null };

  return {
    estado: 'no_finalizada',
    origen: null,
    desde: desdeCuando(analisis, (a) => {
      const v = valorValido(a.malico);
      return v === null ? null : v >= eff.fml_malico_finalizada;
    }),
  };
}

export function estadoFa(analisis: Fila[], eff: Criterios) {
  const ordenados = ordenarPorFecha(analisis);
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const v = valorValido(ordenados[i].azucar_reductor);
    if (v === null) continue;
    const abierta = v > eff.fa_azucar_reductor_max;
    return {
      estado: abierta ? 'no_finalizada' : 'finalizada',
      desde: abierta
        ? desdeCuando(analisis, (a) => {
            const x = valorValido(a.azucar_reductor);
            return x === null ? null : x > eff.fa_azucar_reductor_max;
          })
        : null,
    };
  }
  return { estado: 'sin_dato', desde: null };
}

/** Hay decision de FML si la trae el lote o si la variedad la define por config. */
export function decisionFmlPresente(lote: Fila, eff: Criterios): boolean {
  const decisionLote = textoDe(lote.hace_fml);
  const excluidaLote = textoDe(lote.fml_excluida);
  if (decisionLote === 'si' || decisionLote === 'no') return true;
  if (excluidaLote === 'si' || excluidaLote === 'no') return true;
  return textoDe(eff.hace_fml) === 'no';
}
```

- [ ] **Step 4: Correr y verlos pasar**

Run: `npx vitest run test/lotes-condiciones.test.ts -t "FML"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lotes/motores/fml-condiciones.ts test/lotes-condiciones.test.ts
git commit -m "feat: la decision de FML del lote le gana a la de la variedad"
```

---

### Task 9: Ensamblar `evaluarLote` y reconciliar los tests viejos

La tarea más grande: acá se junta todo y se paga el cambio de semántica.

**Files:**
- Modify: `src/lotes/motores/fml.ts:363-534`
- Test: `test/lotes-fml.test.ts`

**Interfaces:**
- Consumes: todas las funciones de las Tasks 3 a 8.
- Produces: `ResultadoLote` con los campos nuevos del spec más los de compatibilidad, `CONDICIONES` (metadatos) y `PRIORIDAD_ACCION`.

- [ ] **Step 1: Escribir los tests que fallan**

En `test/lotes-fml.test.ts`:

```typescript
describe('tablero: resultado del lote', () => {
  const lote = { lote: '26001', variedad: 'Malbec', litros_actuales: 225, mermo: 'no', hace_fml: 'si' };

  it('publica los estados nuevos y los viejos a la vez', () => {
    const r = evaluarLote(
      lote,
      [{ fecha_analisis: '2026-08-20', etanol: 14, av: 0.4, malico: 0.1, ph: 3.5, so2_libre: 30 }],
      cfg(),
      d('2026-08-24'),
    );
    expect(r.so2_estado).toBe('ok');
    expect(r.ph_estado).toBe('ok');
    expect(r.estado_frecuencia).toBe('al_dia');
    // compatibilidad
    expect(r.so2_ok).toBe(true);
    expect(r.ph_ok).toBe(true);
    expect(r.vencido).toBe(false);
  });

  it('no_aplica cuenta como conforme para la compatibilidad', () => {
    const r = evaluarLote(
      { ...lote, proyecto: 'El Amiguito' },
      [{ fecha_analisis: '2026-08-20', etanol: 14, av: 0.4, malico: 0.1, ph: 3.5, so2_libre: 5 }],
      { default: { ...CRITERIOS_DEFAULT }, por_proyecto: { 'El Amiguito': { so2_aplica: 'no' } } },
      d('2026-08-24'),
    );
    expect(r.so2_estado).toBe('no_aplica');
    expect(r.so2_ok).toBe(true);
    expect(r.alarmas).not.toContain('so2_no_ok');
  });

  it('cada condicion viene con etiqueta, accion y desde', () => {
    const r = evaluarLote(
      lote,
      [{ fecha_analisis: '2026-06-01', etanol: 14, av: 0.4, malico: 0.1, ph: 3.5, so2_libre: 30 }],
      cfg(),
      d('2026-08-24'),
    );
    const frec = r.condiciones.find((c) => c.clave === 'frecuencia_vencida');
    expect(frec?.etiqueta).toBe('Frecuencia vencida');
    expect(frec?.accion).toBe('hacer OT y analizar');
    expect(frec?.desde).toBe('2026-07-01');
  });

  it('la accion sugerida une las de todas las condiciones activas', () => {
    const r = evaluarLote(
      lote,
      [{ fecha_analisis: '2026-06-01', etanol: 14, av: 1.2, malico: 0.1, ph: 3.5, so2_libre: 30 }],
      cfg(),
      d('2026-08-24'),
    );
    expect(r.alarmas).toContain('av_alerta');
    expect(r.alarmas).toContain('frecuencia_vencida');
    // en el orden de CONDICIONES: frecuencia primero, AV despues
    expect(r.accion_sugerida).toBe('hacer OT y analizar | revisar urgente y confirmar analisis');
  });

  it('un Chardonnay sin hace_fml no esta incompleto', () => {
    const r = evaluarLote(
      { lote: '26002', variedad: 'Chardonnay', litros_actuales: 225, mermo: 'no' },
      [{ fecha_analisis: '2026-08-20', etanol: 14, av: 0.4, malico: 2.0, ph: 3.5, so2_libre: 30 }],
      cfg(),
      d('2026-08-24'),
    );
    expect(r.fml_estado).toBe('excluida');
    expect(r.alarmas).not.toContain('datos_operativos_incompletos');
  });
});

describe('tablero: KPIs', () => {
  it('trae los seis ejes del panel', () => {
    const datos = {
      config: { criterios_fml: { default: { ...CRITERIOS_DEFAULT } } },
      lotes: [{ lote: '1', variedad: 'Malbec', litros_actuales: 225, mermo: 'no', hace_fml: 'si' }],
      analisis: [{ lote: '1', fecha_analisis: '2026-08-20', etanol: 14, av: 0.4, malico: 0.1, ph: 3.5, so2_libre: 30 }],
    };
    const ev = evaluar(normalizarConfig(datos), d('2026-08-24'));
    expect(ev.kpis.fml_terminada).toBe(1);
    expect(ev.kpis.frecuencia_al_dia).toBe(1);
    expect(ev.kpis.so2_conforme).toBe(1);
    expect(ev.kpis.ph_ok).toBe(1);
    expect(ev.kpis.lleno).toBe(1);
    expect(ev.kpis.requieren_accion).toBe(0);
    expect(ev.kpis.condicion_ideal).toBe(1);
  });
});
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run test/lotes-fml.test.ts -t "tablero"`
Expected: FAIL.

- [ ] **Step 3: Definir metadatos de condiciones**

En `fml.ts`, reemplazar `ACCIONES` (líneas 45-55) por la tabla completa, respetando el orden del tablero:

```typescript
export interface MetaCondicion { etiqueta: string; accion: string; }

/** Las 11 condiciones del tablero, en su orden de presentacion. */
export const CONDICIONES: Record<string, MetaCondicion> = {
  sin_analisis_valido: { etiqueta: 'Sin análisis válido', accion: 'hacer OT y analizar' },
  control_proceso_pendiente: { etiqueta: 'Sin control de proceso', accion: 'hacer OT y analizar' },
  frecuencia_vencida: { etiqueta: 'Frecuencia vencida', accion: 'hacer OT y analizar' },
  av_alerta: { etiqueta: 'AV alerta', accion: 'revisar urgente y confirmar analisis' },
  so2_caida_alerta: { etiqueta: 'Caída de SO₂ libre >12 ppm', accion: 'confirmar SO2; revisar llenado/mermo y evaluar posible desvio microbiologico' },
  fa_no_finalizada: { etiqueta: 'FA no finalizada', accion: 'seguir control de FA' },
  fml_no_finalizada: { etiqueta: 'FML no finalizada', accion: 'seguir control de FML' },
  so2_no_ok: { etiqueta: 'SO2 no OK', accion: 'revisar ajuste SO2/pH' },
  ph_no_ok: { etiqueta: 'pH no OK', accion: 'revisar ajuste SO2/pH' },
  no_lleno: { etiqueta: 'No lleno', accion: 'dar lleno o achicar' },
  datos_operativos_incompletos: { etiqueta: 'Datos operativos incompletos', accion: 'completar Mermo/FML en el lote' },
};

/**
 * La accion sugerida es la UNION de las acciones de las condiciones activas,
 * sin repetir y separadas por " | ", igual que la columna accion_sugerida del
 * tablero (p. ej. el lote 26011: "revisar ajuste SO2/pH | completar Mermo/FML
 * en LOTES"). No se elige una sola por prioridad.
 */
export function accionSugerida(claves: string[]): string {
  const vistas: string[] = [];
  for (const k of claves) {
    const a = CONDICIONES[k]?.accion;
    if (a && !vistas.includes(a)) vistas.push(a);
  }
  return vistas.join(' | ');
}

/** @deprecated usar CONDICIONES. Se conserva porque reporte.ts todavia lo mira. */
export const ACCIONES: Record<string, string> = Object.fromEntries(
  Object.entries(CONDICIONES).map(([k, v]) => [k, v.accion]),
);
```

- [ ] **Step 4: Reescribir `evaluarLote`**

Reemplazar el cuerpo de `evaluarLote` (`fml.ts:382-464`) por el ensamblado. Las reglas ya no viven acá.

Primero el import, arriba de `fml.ts`:

```typescript
import {
  estadoFml, estadoFa, estadoFrecuencia, estadoPh, estadoSo2,
  caidaSo2, alertaAv, tieneAnalisisValido, decisionFmlPresente,
} from './fml-condiciones';
```

Y el cuerpo:

```typescript
export function evaluarLote(
  lote: Fila, analisisDelLote: Fila[], config: Record<string, unknown>, hoy: number,
): ResultadoLote {
  const eff = criteriosEfectivos(config, lote.variedad, lote.proyecto);
  const analisis = ordenarPorFecha(analisisDelLote);
  const litrosLote = litros(lote);

  const fml = estadoFml(analisis, eff, lote);
  const fa = estadoFa(analisis, eff);
  const frec = estadoFrecuencia(analisis, eff, fml.estado, hoy);
  const ph = estadoPh(analisis, eff);
  const so2 = estadoSo2(analisis, eff);
  const caida = caidaSo2(analisis, eff);
  const av = alertaAv(analisis, eff);
  const llenado = estadoLlenado(lote);
  const hayAnalisis = tieneAnalisisValido(analisis);
  const inoculado = detectarInoculado(analisis);

  const activas: Array<[string, string | null]> = [];
  if (!hayAnalisis) activas.push(['sin_analisis_valido', null]);
  if (hayAnalisis && frec.control_proceso_pendiente) activas.push(['control_proceso_pendiente', null]);
  if (frec.estado === 'vencido') activas.push(['frecuencia_vencida', frec.desde]);
  if (av.alerta) activas.push(['av_alerta', av.desde]);
  if (caida.alerta) activas.push(['so2_caida_alerta', caida.desde]);
  if (fa.estado === 'no_finalizada') activas.push(['fa_no_finalizada', fa.desde]);
  if (fml.estado === 'no_finalizada') activas.push(['fml_no_finalizada', fml.desde]);
  if (so2.estado === 'no_ok') activas.push(['so2_no_ok', so2.desde]);
  if (ph.estado === 'no_ok') activas.push(['ph_no_ok', ph.desde]);
  if (llenado === 'no_lleno') activas.push(['no_lleno', null]);
  if (llenado === 'desconocido' || !decisionFmlPresente(lote, eff)) {
    activas.push(['datos_operativos_incompletos', null]);
  }

  // Orden de presentacion = orden de CONDICIONES.
  const orden = Object.keys(CONDICIONES);
  activas.sort((a, b) => orden.indexOf(a[0]) - orden.indexOf(b[0]));

  const condiciones = activas.map(([clave, desde]) => ({
    clave, etiqueta: CONDICIONES[clave].etiqueta, accion: CONDICIONES[clave].accion, desde,
  }));
  const alarmas = condiciones.map((c) => c.clave);

  const accion_sugerida = accionSugerida(alarmas);

  const fechas = analisis.map((a) => fecha(a.fecha_analisis)).filter((f): f is number => f !== null);
  const ultima = fechas.length ? Math.max(...fechas) : null;

  return {
    lote: lote.lote, variedad: lote.variedad, litros: litrosLote, activo: litrosLote > 0,
    fa_estado: fa.estado, fml_estado: fml.estado, fml_excluida_origen: fml.origen,
    estado_frecuencia: frec.estado,
    control_proceso_pendiente: frec.control_proceso_pendiente,
    ultima_fecha_control: frec.ultima_fecha_control,
    dias_desde_control: frec.dias_desde_control,
    so2_estado: so2.estado, so2_libre: so2.libre, so2_libre_fecha: so2.libre_fecha,
    so2_ph_referencia: so2.ph_referencia,
    so2_ph_referencia_fecha: so2.ph_referencia_fecha,
    so2_molecular: so2.molecular, so2_motivo: so2.motivo,
    so2_caida: caida,
    ph_estado: ph.estado,
    av_alerta: av.alerta, av_motivo: av.motivo,
    estado_llenado: llenado,
    inoculado,
    // El motor solo puede decir 'analisis': el valor cargado a mano vive en
    // estado_lote, que el motor no lee. La pestana resuelve el 'manual'.
    inoculado_origen: inoculado === 'si' ? 'analisis' : null,
    condiciones, alarmas, accion_sugerida,
    // --- compatibilidad con Dashboard, Evolucion y Orden de muestras ---
    so2_ok: so2.estado === 'ok' || so2.estado === 'no_aplica' ? true : so2.estado === 'no_ok' ? false : null,
    ph_ok: ph.estado === 'ok' ? true : ph.estado === 'no_ok' ? false : null,
    vencido: frec.estado === 'vencido',
    frecuencia_max: frec.frecuencia_max,
    dias_desde_analisis: ultima !== null ? Math.round((hoy - ultima) / DIA_MS) : null,
    ultima_fecha: ultima !== null ? new Date(ultima).toISOString().slice(0, 10) : null,
  };
}
```

Actualizar la interfaz `ResultadoLote` con todos esos campos, usando los tipos del spec.

- [ ] **Step 5: Ampliar los KPIs en `evaluar`**

En `evaluar` (`fml.ts:521-533`), reemplazar el cálculo de `ideal`:

```typescript
  const cuenta = (p: (r: ResultadoLote) => boolean) => resultados.filter(p).length;
  const so2Conforme = (r: ResultadoLote) => r.so2_estado === 'ok' || r.so2_estado === 'no_aplica';

  return {
    lotes: resultados,
    alarmas,
    kpis: {
      total_activos: resultados.length,
      vencidos: cuenta((r) => r.vencido),
      condicion_ideal: cuenta((r) => so2Conforme(r) && r.ph_estado === 'ok' && r.estado_llenado === 'lleno'),
      fml_terminada: cuenta((r) => r.fml_estado === 'finalizada' || r.fml_estado === 'excluida'),
      frecuencia_al_dia: cuenta((r) => r.estado_frecuencia === 'al_dia'),
      so2_conforme: cuenta(so2Conforme),
      ph_ok: cuenta((r) => r.ph_estado === 'ok'),
      lleno: cuenta((r) => r.estado_llenado === 'lleno'),
      requieren_accion: cuenta((r) => r.alarmas.length > 0),
    },
  };
```

Actualizar `ResultadoEvaluar` con las seis claves nuevas. En `alarmas`, cambiar `ACCIONES[cond]` por `CONDICIONES[cond]?.accion ?? ''`.

- [ ] **Step 6: Reconciliar los 50 tests viejos, uno por uno**

Run: `npm test`

Van a fallar los que codificaban la semántica anterior. **Revisar cada uno a mano** — no borrar en bloque. Los esperables:

| Test | Por qué falla | Qué hacer |
|---|---|---|
| SO₂ con piso 25 | el piso ahora es 20 | recalcular el número esperado |
| SO₂ libre justo en el piso | antes daba OK, ahora `no_ok` | invertir la expectativa (verificado: lotes 26008 y 26011 del tablero, con 20.0 exacto, son `no_ok`) |
| pH exactamente en `ph_max` | antes alarmaba, ahora no | invertir la expectativa |
| frecuencia con análisis parciales | ahora cuenta desde el control de proceso | agregar `etanol` a la fila o esperar `control_proceso_pendiente` |
| frecuencia con FML `sin_dato` | antes daba 30 días, ahora 15 | recalcular |

Si un test falla por un motivo **que no está en esta tabla**, es un bug de la implementación: arreglar el código, no el test.

- [ ] **Step 7: Correr todo**

Run: `npm test && npx tsc --noEmit`
Expected: PASS en los dos.

- [ ] **Step 8: Commit**

```bash
git add src/lotes/motores/fml.ts test/lotes-fml.test.ts
git commit -m "feat: evaluarLote arma las 11 condiciones del tablero aprobado"
```

---

### Task 10: Etiquetas nuevas en el reporte

**Files:**
- Modify: `src/lotes/reporte.ts:15-25`

**Interfaces:**
- Consumes: `CONDICIONES` de Task 9.

- [ ] **Step 1: Reemplazar la tabla escrita a mano**

`reporte.ts` enumera 9 alarmas en `ETIQUETAS_ALARMA` y se quedaría mudo con las dos nuevas. Como `CONDICIONES` ya tiene etiqueta por clave, borrar la constante y derivarla:

```typescript
import { evaluar, normalizarConfig, CONDICIONES, type Fila } from './motores/fml';

const ETIQUETAS_ALARMA: Record<string, string> = Object.fromEntries(
  Object.entries(CONDICIONES).map(([k, v]) => [k, v.etiqueta]),
);
```

- [ ] **Step 2: Verificar**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lotes/reporte.ts
git commit -m "fix: el reporte nombra las once condiciones, no nueve"
```

---

### Task 11: Siembra idempotente de los overrides

**Files:**
- Create: `scripts/sembrar-criterios-fml.mjs`
- Test: `test/lotes-siembra.test.mjs`

**Interfaces:**
- Produces: `sembrarCriterios(config: object): { config: object; agregadas: string[] }` — función pura, exportada, para poder testearla sin tocar D1.

- [ ] **Step 1: Escribir los tests que fallan**

```javascript
import { describe, it, expect } from 'vitest';
import { sembrarCriterios, BLANCAS } from '../scripts/sembrar-criterios-fml.mjs';

describe('siembra de criterios', () => {
  it('siembra las 15 blancas y los dos grupos de pH', () => {
    const { config, agregadas } = sembrarCriterios({});
    expect(BLANCAS).toHaveLength(15);
    expect(config.por_variedad.Chardonnay.hace_fml).toBe('no');
    expect(config.por_variedad.Chardonnay.ph_max).toBe(3.65);
    expect(config.por_variedad['Cabernet Sauvignon'].ph_max_inclusive).toBe('si');
    expect(config.por_proyecto['El Amiguito'].so2_aplica).toBe('no');
    expect(agregadas.length).toBeGreaterThan(0);
  });

  it('no pisa lo que alguien ya edito', () => {
    const previo = { por_variedad: { Chardonnay: { ph_max: 3.5 } } };
    const { config } = sembrarCriterios(previo);
    expect(config.por_variedad.Chardonnay.ph_max).toBe(3.5);   // respetado
    expect(config.por_variedad.Chardonnay.hace_fml).toBe('no'); // completado
  });

  it('correrlo dos veces no agrega nada la segunda', () => {
    const uno = sembrarCriterios({});
    const dos = sembrarCriterios(uno.config);
    expect(dos.agregadas).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run test/lotes-siembra.test.mjs`
Expected: FAIL — no existe el script.

- [ ] **Step 3: Implementar**

```javascript
/**
 * Siembra en config.criterios_fml los overrides del tablero aprobado.
 *
 * Es idempotente y NO pisa: solo agrega la clave que falta. Correrlo dos veces
 * no cambia nada, y un umbral que alguien ajusto a mano sobrevive.
 */

export const BLANCAS = [
  'Blanco', 'Chardonnay', 'Chenin', 'Gibi', 'Gewurztraminer', 'Moscatel Rosado',
  'Pedro Gimenez', 'Pinot Blanco', 'Pinot Gris', 'Riesling', 'Sauvignon Blanc',
  'Semillón', 'Torrontés', 'Ugni Blanc', 'Viognier',
];

const PH_365 = ['Pinot Noir', 'Sauvignon Blanc', 'Chardonnay'];
const PH_379 = ['Cabernet Sauvignon', 'Cabernet Franc', 'Petit Verdot'];

export function sembrarCriterios(configPrevia) {
  const config = structuredClone(configPrevia ?? {});
  config.por_variedad ??= {};
  config.por_proyecto ??= {};
  const agregadas = [];

  const poner = (tabla, nombre, clave, valor) => {
    tabla[nombre] ??= {};
    if (tabla[nombre][clave] === undefined) {
      tabla[nombre][clave] = valor;
      agregadas.push(`${nombre}.${clave}`);
    }
  };

  for (const v of BLANCAS) poner(config.por_variedad, v, 'hace_fml', 'no');
  for (const v of PH_365) poner(config.por_variedad, v, 'ph_max', 3.65);
  for (const v of PH_379) {
    poner(config.por_variedad, v, 'ph_max', 3.79);
    poner(config.por_variedad, v, 'ph_max_inclusive', 'si');
  }
  poner(config.por_proyecto, 'El Amiguito', 'so2_aplica', 'no');

  return { config, agregadas };
}
```

- [ ] **Step 4: Correr y verlos pasar**

Run: `npx vitest run test/lotes-siembra.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/sembrar-criterios-fml.mjs test/lotes-siembra.test.mjs
git commit -m "feat: siembra idempotente de los criterios por variedad y proyecto"
```

> **La aplicación en producción NO es parte de este tramo.** El script expone la
> función pura; empujarla al documento de D1 va junto con el despliegue del
> tramo de UI, para no cambiar los números de la web antes de que haya pantalla
> que los explique.

---

### Task 12: Casos de oro contra el tablero aprobado

Es la tarea que demuestra que el port es fiel. Va última porque necesita el motor completo.

**Files:**
- Create: `test/lotes-tablero-oro.test.ts`
- Read (no se commitea): `Dashboard FML/var/outputs/estado_actual_lotes.csv`

**Interfaces:**
- Consumes: `evaluarLote` de Task 9.

**Los lotes ya están elegidos**, leídos del snapshot del 2026-09-14. Sólo tres de las once condiciones (`control_proceso_pendiente`, `fa_no_finalizada`, `no_lleno`) **no ocurren en ningún lote** de los 249, así que esas tres van con casos sintéticos, ya cubiertos por las Tasks 3, 8 y 9.

| Lote | Variedad / proyecto | Entrada relevante | Qué demuestra |
|---|---|---|---|
| 26002 | Ugni Blanc / Brandy | SO₂ 16, pH 3.21 | `no_ok` **aunque el molecular (0.599) alcance**: manda el piso |
| 26008 | Pinot Noir / Domaine Nico | SO₂ 20.0, pH 3.40, anterior 34 el 10/08 | piso **inclusive** + `so2_caida_alerta` (14 ppm) |
| 26003 | Semillón / Field Blend Blanco | SO₂ 24, pH 3.11 | `ok` con el piso nuevo (con el viejo de 25 daba `no_ok`) |
| 26079 | Chardonnay / White Colluvium | pH 3.70 | `ph_no_ok` por el límite 3.65 de la variedad |
| 26023 | Chardonnay / White Colluvium | AV −999 | `av_alerta` con motivo `fuera_rango_foss` |
| 26025 | Chardonnay / White Colluvium | último control 04/08 | `frecuencia_vencida` con frecuencia 30 (FML excluida) |
| 26007 | Pinot Noir / Domaine Nico | málico alto, `hace_fml` en el lote | `fml_no_finalizada`, frecuencia 15 |
| 26011 | Chardonnay / White Colluvium | SO₂ 20.0, `mermo` vacío | `so2_no_ok` + `datos_operativos_incompletos` |
| 26280 | Syrah / Desarrollo productos | sin ningún análisis | `sin_analisis_valido` + `datos_operativos_incompletos`, frecuencia 15 con FML `sin_dato` |

- [ ] **Step 1: Escribir los casos**

Los datos van **literales en el test**, no leídos del CSV: el Excel es un archivo vivo y un test que lo lee deja de ser determinista.

Los análisis de cada caso se reconstruyen con los valores que el propio tablero reporta (`so2_ultima_valor`, `so2_ph_referencia`, `av_ultimo_valor`, `fecha_ultimo_control_proceso`), que es lo que el motor necesita para llegar al mismo veredicto.

**Ojo con dos nombres:** el CSV del tablero escribe `sin_datos` donde el motor web usa `sin_dato` (en `fa_estado` y `fml_estado`), y `mermo` vacío aparece como el texto `desconocido`. Traducir al escribir los casos.

```typescript
/**
 * Casos de oro: lotes reales del tablero FML aprobado por los supervisores
 * (snapshot del 2026-09-14, var/outputs/estado_actual_lotes.csv).
 *
 * Si uno de estos falla, el motor de la web dejo de decir lo que dice el
 * tablero. Los numeros NO se ajustan para que pase: se arregla el motor.
 */
import { describe, it, expect } from 'vitest';
import { evaluarLote, CRITERIOS_DEFAULT } from '../src/lotes/motores/fml';
import { sembrarCriterios } from '../scripts/sembrar-criterios-fml.mjs';

const d = (iso: string) => Date.parse(iso + 'T00:00:00Z');
const HOY = d('2026-09-14');
const CONFIG = { default: { ...CRITERIOS_DEFAULT }, ...sembrarCriterios({}).config };

const proc = (fecha: string, extra: Record<string, unknown> = {}) => ({
  fecha_analisis: fecha, etanol: 13.5, av: 0.4, malico: 0.1, ...extra,
});

const CASOS: Array<{ nombre: string; lote: Record<string, unknown>; analisis: Record<string, unknown>[]; espera: Record<string, unknown> }> = [
  {
    nombre: '26002 Ugni Blanc: el piso manda aunque el molecular alcance',
    lote: { lote: '26002', variedad: 'Ugni Blanc', proyecto: 'Brandy', litros_actuales: 3500, mermo: 'no' },
    analisis: [proc('2026-09-09', { ph: 3.21, so2_libre: 16, av: 0.41 })],
    espera: { so2_estado: 'no_ok', ph_estado: 'ok', fml_estado: 'excluida', fml_excluida_origen: 'variedad_blanca', estado_frecuencia: 'al_dia', alarmas: ['so2_no_ok'] },
  },
  {
    nombre: '26008 Pinot Noir: SO2 en 20 clavado es no OK, y la caida de 14 alarma',
    lote: { lote: '26008', variedad: 'Pinot Noir', proyecto: 'Domaine Nico', litros_actuales: 1575, mermo: 'no', hace_fml: 'si' },
    analisis: [
      proc('2026-08-10', { ph: 3.4, so2_libre: 34 }),
      proc('2026-09-11', { ph: 3.4, so2_libre: 20, av: 0.58 }),
    ],
    espera: { so2_estado: 'no_ok', fml_estado: 'finalizada', alarmas: ['so2_caida_alerta', 'so2_no_ok'] },
  },
  {
    nombre: '26003 Semillon: 24 ppm es OK con el piso nuevo',
    lote: { lote: '26003', variedad: 'Semillón', proyecto: 'Field Blend Blanco', litros_actuales: 100, mermo: 'no' },
    analisis: [proc('2026-09-09', { ph: 3.11, so2_libre: 24, av: 0.0 })],
    espera: { so2_estado: 'ok', ph_estado: 'ok', fml_estado: 'excluida', alarmas: [] },
  },
  {
    nombre: '26079 Chardonnay: pH 3.70 pasa el limite 3.65 de la variedad',
    lote: { lote: '26079', variedad: 'Chardonnay', proyecto: 'White Colluvium', litros_actuales: 725, mermo: 'no' },
    analisis: [proc('2026-09-08', { ph: 3.7, so2_libre: 55, av: 0.14 })],
    espera: { ph_estado: 'no_ok', so2_estado: 'ok', alarmas: ['ph_no_ok'] },
  },
  {
    nombre: '26023 Chardonnay: el -999 del FOSS alarma',
    lote: { lote: '26023', variedad: 'Chardonnay', proyecto: 'White Colluvium', litros_actuales: 50, mermo: 'no' },
    analisis: [proc('2026-09-09', { ph: 3.32, so2_libre: 37, av: -999, azucar_reductor: 1.0 })],
    espera: { av_alerta: true, av_motivo: 'fuera_rango_foss', fa_estado: 'finalizada', alarmas: ['av_alerta'] },
  },
  {
    nombre: '26025 Chardonnay: vencido a los 41 dias con frecuencia de 30',
    lote: { lote: '26025', variedad: 'Chardonnay', proyecto: 'White Colluvium', litros_actuales: 50, mermo: 'no' },
    analisis: [proc('2026-08-04', { ph: 3.22, so2_libre: 42, av: 0.01 })],
    espera: { estado_frecuencia: 'vencido', frecuencia_max: 30, alarmas: ['frecuencia_vencida'] },
  },
  {
    nombre: '26007 Pinot Noir: FML sin terminar exige los 15 dias',
    lote: { lote: '26007', variedad: 'Pinot Noir', proyecto: 'Domaine Nico', litros_actuales: 2025, mermo: 'no', hace_fml: 'si' },
    analisis: [proc('2026-09-11', { ph: 3.28, so2_libre: 27, av: 0.49, malico: 1.4 })],
    espera: { fml_estado: 'no_finalizada', fml_excluida_origen: 'lote', frecuencia_max: 15, estado_frecuencia: 'al_dia', alarmas: ['fml_no_finalizada'] },
  },
  {
    nombre: '26011 Chardonnay: sin mermo cargado, datos incompletos',
    lote: { lote: '26011', variedad: 'Chardonnay', proyecto: 'White Colluvium', litros_actuales: 100 },
    analisis: [proc('2026-09-09', { ph: 3.25, so2_libre: 20, av: 0.02 })],
    espera: { so2_estado: 'no_ok', estado_llenado: 'desconocido', alarmas: ['so2_no_ok', 'datos_operativos_incompletos'] },
  },
  {
    nombre: '26280 Syrah: sin ningun analisis, y la FML sin dato no afloja la frecuencia',
    lote: { lote: '26280', variedad: 'Syrah', proyecto: 'Desarrollo productos', litros_actuales: 225 },
    analisis: [],
    espera: { fml_estado: 'sin_dato', frecuencia_max: 15, estado_frecuencia: 'sin_datos', alarmas: ['sin_analisis_valido', 'datos_operativos_incompletos'] },
  },
];

describe('casos de oro del tablero aprobado', () => {
  for (const c of CASOS) {
    it(c.nombre, () => {
      const r = evaluarLote(c.lote, c.analisis, CONFIG, HOY);
      for (const [k, v] of Object.entries(c.espera)) {
        if (k === 'alarmas') expect(r.alarmas.sort()).toEqual([...(v as string[])].sort());
        else expect(r[k as keyof typeof r]).toBe(v);
      }
    });
  }
});
```

- [ ] **Step 2: Correr**

Run: `npx vitest run test/lotes-tablero-oro.test.ts`
Expected: PASS. Si un caso falla, comparar contra la fila del CSV y decidir: o el motor tiene un bug, o el caso se transcribió mal. **Nunca ajustar el esperado para que pase.**

Los análisis de estos casos son una reconstrucción a partir de lo que reporta el tablero, no la fila exacta del Excel. Si un caso falla **sólo** por málico o azúcar —los dos campos que el CSV no expone— ajustar ese valor de entrada es legítimo; ajustar un estado esperado, no.

- [ ] **Step 3: Correr todo**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add test/lotes-tablero-oro.test.ts
git commit -m "test: lotes reales del tablero aprobado como casos de oro"
```

---

## Cierre del tramo

Al terminar la Task 12:

- `npm test` y `npx tsc --noEmit` en verde.
- La pestaña `vista-fml.js` **sigue funcionando** (usa sólo campos de compatibilidad).
- El Dashboard muestra números distintos a los de antes: es lo esperado, y es la señal de que el motor cambió de reglas.
- **No se despliega todavía.** El tramo 2 (la pestaña) sale junto con esto.

Con el motor real andando se puede escribir el plan del tramo 2, ya con su salida a la vista en vez de a ciegas.
