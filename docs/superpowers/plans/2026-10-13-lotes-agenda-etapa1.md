# Agenda de Lotes — Etapa 1 (ver y planificar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pestaña 📅 Agenda en la web de Lotes con la bandeja "Alertas para analizar" y un calendario (Semana/Mes) que reparte análisis y trasiegos con cupos diarios, días hábiles y prioridades, conectado con Orden de muestras y Emitir OT.

**Architecture:** El plan se CALCULA en el navegador en cada dibujo con un motor puro (`agenda.js` + `agenda-dias.js`) a partir de `/dashboard` (alertas del servidor), `lotes`, `analisis`, `movimientos` y `config.agenda`. En la Etapa 1 no se guarda ninguna decisión de agenda (solo la configuración). El servidor suma una condición nueva, `reanalisis_correccion`, al motor FML.

**Tech Stack:** Cloudflare Worker (TypeScript) + D1; front JS vanilla con ES modules (`public/lotes/js/*.js`); tests Vitest 3 con `@cloudflare/vitest-pool-workers` (`npm test`).

**Spec:** `docs/superpowers/specs/2026-10-13-lotes-agenda-design.md` (leerlo antes de empezar).

## Global Constraints

- Trabajar en el worktree `C:\Users\Bmax\repos\catenainstitute-agenda`, rama `feat/lotes-agenda` (otras sesiones cambian de rama en `repos\catenainstitute`).
- Textos de pantalla y comentarios en castellano rioplatense, como el resto del código.
- Fechas siempre ISO `AAAA-MM-DD`; la cuenta de días se hace en UTC (como `fechaDia` del servidor) para que el huso no corra un día.
- Módulos de lógica PUROS (sin DOM, sin imports de `nucleo.js`) para poder testearlos con Vitest; la vista solo dibuja.
- Defaults: `cupo_analisis` 55, `cupo_trasiegos` 4, `dias_trasiego` 90, `aviso_dias` 5, `horizonte_semanas` 8; re-análisis = corrección + 3 días (constante `REANALISIS_DIAS`).
- Prioridad de análisis: 1 AV/caída SO₂ → 2 vencido/sin análisis → 3 re-análisis → 4 próximo a vencer → 5 control programado (solo calendario).
- Prioridad de trasiego automática: `alta` si d > 15, `media` si −15 ≤ d ≤ 15, `baja` si d < −15 (d = días desde el vencimiento).
- Lote "en barricas": `cap225 > 0` o `cap500 > 0` o `vasija_actual` contiene "barric". Movimientos reales: `trasiego`, `descube`, `traspaso` ejecutados (estado ausente = ejecutado).
- Los archivos de `public/lotes/js` pueden tener finales CRLF: si un reemplazo no matchea, revisar eso antes de dudar del texto.
- `npm test` tiene que quedar verde al final de cada tarea. Commits chicos, mensaje en castellano con prefijo `feat:`/`test:`/`refactor:`, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- NO correr `wrangler deploy` ni `importar.mjs --remote`: el deploy lo hace el usuario.

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lotes/motores/correcciones-base.ts` | crear | Última corrección real, SO₂ posterior y `reanalisisPendiente` (compartido por fml.ts y correccion.ts, sin ciclo) |
| `src/lotes/motores/correccion.ts` | modificar | Importa los helpers movidos en vez de definirlos |
| `src/lotes/motores/fml.ts` | modificar | Condición `reanalisis_correccion` en `CONDICIONES` y `evaluarLote` |
| `public/lotes/js/vista-dashboard.js`, `tablero-datos.js` | modificar | Etiqueta/chip de la condición nueva |
| `public/lotes/js/agenda-dias.js` | crear | Fechas UTC, días hábiles, feriados AR, `configAgenda` y edición de `config.agenda` |
| `public/lotes/js/agenda.js` | crear | Motor: ítems de análisis, ítems de trasiego, reparto con cupo, `planificar` |
| `public/lotes/js/vista-agenda.js` | crear | Pestaña: barra, bandeja, calendario Semana/Mes, panel del día |
| `public/lotes/js/vista-config-agenda.js` | crear | Sección Agenda de Configuración (parámetros + feriados) |
| `public/lotes/js/vista-orden.js` | modificar | `precargarOrden(lotes)` |
| `public/lotes/js/vista-ot-emitir.js` | modificar | `precargarLotesOT(lotes)` |
| `public/lotes/js/vista-movimientos.js` | modificar | `emitirOTDesdeAgenda(lotes)` |
| `public/lotes/js/vista-config.js` | modificar | Llama a `renderConfigAgenda()` |
| `public/lotes/js/nucleo.js` | modificar | `agenda` en `_redibujarVistaDashboard` |
| `public/lotes/app.js`, `public/lotes/index.html` | modificar | Import, botón, `<section id="tab-agenda">`, `#cfgAgenda`, CSS |
| `test/lotes-correcciones-base.test.ts` | crear | Tests de `reanalisisPendiente` y de la condición en `evaluarLote` |
| `test/lotes-agenda-dias.test.mjs` | crear | Tests de fechas, hábiles, config |
| `test/lotes-agenda.test.mjs` | crear | Tests del motor |

---

### Task 0: Worktree y línea de base

**Files:** ninguno.

- [ ] **Step 1: Crear el worktree desde `main`**

```bash
cd /c/Users/Bmax/repos/catenainstitute
git fetch origin
git worktree add ../catenainstitute-agenda -b feat/lotes-agenda main
cd ../catenainstitute-agenda
npm ci
```

- [ ] **Step 2: Correr la suite completa como línea de base**

Run: `npm test`
Expected: todos PASS. Anotar la cantidad de tests (sirve para comparar al final). Si algo falla ANTES de tocar nada, frenar y avisar.

---

### Task 1: Condición `reanalisis_correccion` en el servidor

**Files:**
- Create: `src/lotes/motores/correcciones-base.ts`
- Modify: `src/lotes/motores/correccion.ts` (borrar `so2Medido` ~l.201, `interface Correccion` ~l.209, `ultimaCorreccion` ~l.239, `verazPython` ~l.271, `ultimoSo2Posterior` ~l.285; importar desde el módulo nuevo)
- Modify: `src/lotes/motores/fml.ts` (`CONDICIONES` ~l.96, `evaluarLote` ~l.523-545, comentarios "11 condiciones")
- Modify: `public/lotes/js/vista-dashboard.js` (~l.26, mapa de etiquetas), `public/lotes/js/tablero-datos.js` (~l.53, `EVENTUALES`)
- Test: `test/lotes-correcciones-base.test.ts`

**Interfaces:**
- Produces: `export const REANALISIS_DIAS = 3`; `export function reanalisisPendiente(analisisDelLote: Fila[], hoy: number, dias?: number): { activa: boolean; desde: string | null }`; condición `reanalisis_correccion` en `ResultadoLote.alarmas` / `condiciones` (la consume `agenda.js` vía `/dashboard`).

- [ ] **Step 1: Escribir el test que falla**

`test/lotes-correcciones-base.test.ts`:

```ts
/* La condicion de re-analisis: una correccion real de SO2 pide volver a medir a
 * los 3 dias (las "72 h" del pedido; la correccion guarda solo el dia). */
import { describe, it, expect } from 'vitest';
import { reanalisisPendiente, REANALISIS_DIAS } from '../src/lotes/motores/correcciones-base';
import { evaluarLote, CRITERIOS_DEFAULT, CONDICIONES } from '../src/lotes/motores/fml';

const d = (iso: string) => Date.parse(iso + 'T00:00:00Z');
const corregido = (extra: Record<string, unknown> = {}) => ({
  lote: '26001', fecha_analisis: '2026-10-01', so2_libre: 18,
  correccion: { ot_n: 'B230', fecha: '2026-10-02', so2_libre_actual: 18, ...extra },
});

describe('reanalisisPendiente', () => {
  it('son 3 dias', () => { expect(REANALISIS_DIAS).toBe(3); });

  it('se activa justo al tercer dia de la correccion', () => {
    expect(reanalisisPendiente([corregido()], d('2026-10-05'))).toEqual({ activa: true, desde: '2026-10-05' });
  });

  it('antes del tercer dia no', () => {
    expect(reanalisisPendiente([corregido()], d('2026-10-04')).activa).toBe(false);
  });

  it('una correccion anulada no cuenta', () => {
    const an = [corregido({ anulada: { fecha: '2026-10-03', por: 'Ori' } })];
    expect(reanalisisPendiente(an, d('2026-10-09')).activa).toBe(false);
  });

  it('una correccion sin numero de OT es una cascara de la migracion: no cuenta', () => {
    expect(reanalisisPendiente([corregido({ ot_n: '' })], d('2026-10-09')).activa).toBe(false);
  });

  it('un SO2 medido despues de la correccion la apaga', () => {
    const an = [corregido(), { lote: '26001', fecha_analisis: '2026-10-04', so2_libre: 31 }];
    expect(reanalisisPendiente(an, d('2026-10-09')).activa).toBe(false);
  });

  it('un analisis posterior SIN SO2 no la apaga', () => {
    const an = [corregido(), { lote: '26001', fecha_analisis: '2026-10-04', ph: 3.6 }];
    expect(reanalisisPendiente(an, d('2026-10-09')).activa).toBe(true);
  });

  it('sin correcciones no hay nada que re-analizar', () => {
    expect(reanalisisPendiente([{ lote: '26001', fecha_analisis: '2026-10-01', so2_libre: 25 }], d('2026-10-09')))
      .toEqual({ activa: false, desde: null });
  });
});

describe('condicion reanalisis_correccion en evaluarLote', () => {
  const cfg = { default: { ...CRITERIOS_DEFAULT }, por_variedad: {} };
  const lote = { lote: '26001', variedad: 'Malbec', litros_actuales: 1000 };

  it('esta en CONDICIONES con etiqueta y accion', () => {
    expect(CONDICIONES.reanalisis_correccion.etiqueta).toBe('Re-análisis post-corrección');
  });

  it('aparece en alarmas y condiciones con su "desde"', () => {
    const r = evaluarLote(lote, [corregido()], cfg, d('2026-10-06'));
    expect(r.alarmas).toContain('reanalisis_correccion');
    expect(r.condiciones.find((c) => c.clave === 'reanalisis_correccion')?.desde).toBe('2026-10-05');
  });

  it('no aparece antes de tiempo', () => {
    const r = evaluarLote(lote, [corregido()], cfg, d('2026-10-03'));
    expect(r.alarmas).not.toContain('reanalisis_correccion');
  });
});
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run test/lotes-correcciones-base.test.ts`
Expected: FAIL — no resuelve `../src/lotes/motores/correcciones-base`.

- [ ] **Step 3: Crear `correcciones-base.ts` moviendo los helpers**

Crear `src/lotes/motores/correcciones-base.ts`. Copiar TAL CUAL desde `correccion.ts` los cuerpos y comentarios de `so2Medido`, `interface Correccion`, `ultimaCorreccion`, `verazPython` y `ultimoSo2Posterior` (incluidos sus comentarios largos: explican bordes reales), exportándolos, y agregar `reanalisisPendiente`:

```ts
/**
 * Lo que fml.ts y correccion.ts necesitan saber de las correcciones de SO2:
 * cuál fue la última REAL y si hubo una medición de SO2 después.
 *
 * Vive aparte porque correccion.ts importa fml.ts: si fml.ts importara
 * correccion.ts habría un ciclo. Este módulo solo depende de fml-condiciones.
 */

import { valorValido, fechaDia, DIA_MS, type Fila } from './fml-condiciones';

const fechaMs = fechaDia;
const aIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Las "72 h" del pedido: la corrección guarda solo el día, así que son 3 días. */
export const REANALISIS_DIAS = 3;

// ... (aquí los 5 elementos copiados de correccion.ts, cada uno con `export`)

/**
 * ¿Hay que volver a analizar el lote por una corrección de SO2?
 *
 * Sí cuando la última corrección real (con OT y no anulada) cumplió `dias` y
 * desde entonces no se midió SO2. El análisis posterior tiene que traer SO2:
 * un pH suelto no confirma que la dosis llegó.
 */
export function reanalisisPendiente(
  analisisDelLote: Fila[],
  hoy: number,
  dias: number = REANALISIS_DIAS,
): { activa: boolean; desde: string | null } {
  const c = ultimaCorreccion(analisisDelLote);
  if (!c) return { activa: false, desde: null };
  if (ultimoSo2Posterior(analisisDelLote, c.fecha) !== null) return { activa: false, desde: null };
  const vence = c.fecha + dias * DIA_MS;
  if (hoy < vence) return { activa: false, desde: null };
  return { activa: true, desde: aIso(vence) };
}
```

En `correccion.ts`: borrar esas cinco definiciones y agregar
`import { ultimaCorreccion, ultimoSo2Posterior, type Correccion } from './correcciones-base';`
(agregar también `so2Medido`/`verazPython` al import SOLO si el resto de `correccion.ts` los usa: `grep -n "so2Medido\|verazPython" src/lotes/motores/correccion.ts`). Dejar `fechaMs` y `aIso` locales de `correccion.ts` si se siguen usando en otras partes del archivo.

- [ ] **Step 4: Sumar la condición a `fml.ts`**

En `CONDICIONES`, inmediatamente después de `so2_caida_alerta`:

```ts
  reanalisis_correccion: {
    etiqueta: 'Re-análisis post-corrección',
    accion: 'analizar SO2 para confirmar la corrección',
  },
```

Import arriba: `import { reanalisisPendiente } from './correcciones-base';`

En `evaluarLote`, junto a las otras evaluaciones (después de `const av = alertaAv(...)`):

```ts
  const rean = reanalisisPendiente(analisis, hoy);
```

y en la lista de activas, después de la línea de `caida.alerta`:

```ts
  if (rean.activa) activas.push(['reanalisis_correccion', rean.desde]);
```

Actualizar los comentarios "11 condiciones" de `fml.ts` (cabecera ~l.2, ~l.96, ~l.504) a "12".

- [ ] **Step 5: Etiquetas en el cliente**

`public/lotes/js/vista-dashboard.js`, en el mapa de etiquetas (junto a `so2_caida_alerta`):

```js
  reanalisis_correccion:      'Re-análisis post-corrección',
```

`public/lotes/js/tablero-datos.js`, en `EVENTUALES` (y cambiar el comentario "Los dos que…" por "Los que solo aparecen cuando el motor los prende."):

```js
  { clave: 'reanalisis_correccion', cond: 'reanalisis_correccion', texto: 'Re-análisis' },
```

- [ ] **Step 6: Correr el test nuevo y la suite**

Run: `npx vitest run test/lotes-correcciones-base.test.ts` → PASS.
Run: `npm test` → todo PASS. Si falla un test de oro (`lotes-tablero-oro`, `lotes-fml`) porque un fixture con corrección real ahora dispara la condición, leer el caso: si la corrección tiene OT, ≥3 días y no hay SO₂ posterior, la condición es correcta y el fixture/expectativa se actualiza agregando `'reanalisis_correccion'` en el lugar que le toca según el orden de `CONDICIONES`; anotarlo en el mensaje del commit. Correr `npx tsc --noEmit` → sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/lotes/motores/correcciones-base.ts src/lotes/motores/correccion.ts src/lotes/motores/fml.ts public/lotes/js/vista-dashboard.js public/lotes/js/tablero-datos.js test/lotes-correcciones-base.test.ts
git commit -m "feat(lotes): condición reanalisis_correccion (SO2 a los 3 días de una corrección)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `agenda-dias.js` — fechas, días hábiles, feriados y config

**Files:**
- Create: `public/lotes/js/agenda-dias.js`
- Test: `test/lotes-agenda-dias.test.mjs`

**Interfaces:**
- Produces:
  - `AGENDA_DEFAULT` `{cupo_analisis:55, cupo_trasiegos:4, dias_trasiego:90, aviso_dias:5, horizonte_semanas:8}`
  - `FERIADOS_AR: Array<{fecha, nombre}>`
  - `esIso(s): boolean`, `sumarDias(iso, n): iso`, `difDias(a, b): number` (= b − a), `diaSemana(iso): 0..6` (0 = domingo), `lunesDe(iso): iso`
  - `configAgenda(config): {…AGENDA_DEFAULT, feriados:[{fecha,nombre}]}` (efectiva, nunca falla)
  - `mapaFeriados(feriados): Map<iso, nombre>`, `esHabil(iso, mapa): boolean`
  - `asegurarConfigAgenda(datos)`, `fijarParametro(datos, k, valor): boolean`, `agregarFeriado(datos, fecha, nombre): boolean`, `quitarFeriado(datos, fecha): boolean`, `restaurarFeriados(datos): void`

- [ ] **Step 1: Escribir el test que falla**

`test/lotes-agenda-dias.test.mjs`:

```js
/* Agenda: fechas en UTC, dias habiles, feriados y parametros de config.agenda. */
import { describe, it, expect } from 'vitest';
import { AGENDA_DEFAULT, FERIADOS_AR, esIso, sumarDias, difDias, diaSemana, lunesDe,
         configAgenda, mapaFeriados, esHabil, asegurarConfigAgenda, fijarParametro,
         agregarFeriado, quitarFeriado, restaurarFeriados } from '../public/lotes/js/agenda-dias.js';

describe('fechas', () => {
  it('suma y resta dias sin que el huso corra la fecha', () => {
    expect(sumarDias('2026-10-14', 3)).toBe('2026-10-17');
    expect(sumarDias('2026-07-20', 90)).toBe('2026-10-18');
    expect(difDias('2026-10-14', '2026-10-17')).toBe(3);
    expect(difDias('2026-08-30', '2026-10-14')).toBe(45);
  });
  it('dia de la semana y lunes de la semana', () => {
    expect(diaSemana('2026-10-14')).toBe(3);      // miercoles
    expect(lunesDe('2026-10-14')).toBe('2026-10-12');
    expect(lunesDe('2026-10-18')).toBe('2026-10-12'); // domingo -> lunes anterior
    expect(lunesDe('2026-10-12')).toBe('2026-10-12');
  });
  it('esIso rechaza basura y fechas que no existen', () => {
    expect(esIso('2026-10-14')).toBe(true);
    expect(esIso('2026-02-30')).toBe(false);
    expect(esIso('14/10/2026')).toBe(false);
    expect(esIso(null)).toBe(false);
  });
});

describe('dias habiles', () => {
  const fer = mapaFeriados(FERIADOS_AR);
  it('feriado, sabado y domingo no son habiles', () => {
    expect(esHabil('2026-10-12', fer)).toBe(false); // Diversidad Cultural
    expect(esHabil('2026-10-13', fer)).toBe(true);
    expect(esHabil('2026-10-17', fer)).toBe(false);
    expect(esHabil('2026-10-18', fer)).toBe(false);
  });
  it('los feriados precargados son fechas validas, ordenadas y sin repetir', () => {
    const fechas = FERIADOS_AR.map(f => f.fecha);
    expect(fechas.every(esIso)).toBe(true);
    expect([...fechas].sort()).toEqual(fechas);
    expect(new Set(fechas).size).toBe(fechas.length);
    expect(fer.get('2026-10-12')).toBe('Día del Respeto a la Diversidad Cultural');
  });
});

describe('configAgenda', () => {
  it('sin config.agenda rigen los defaults y los feriados precargados', () => {
    const c = configAgenda({});
    expect(c.cupo_analisis).toBe(55);
    expect(c.cupo_trasiegos).toBe(4);
    expect(c.feriados).toEqual(FERIADOS_AR);
    expect(c.feriados).not.toBe(FERIADOS_AR); // copia: editarla no toca la constante
  });
  it('toma lo valido y descarta lo invalido', () => {
    const c = configAgenda({ agenda: { cupo_analisis: 60, cupo_trasiegos: 'x', horizonte_semanas: 0,
      feriados: [{ fecha: '2026-10-20', nombre: 'X' }, { fecha: 'mal' }] } });
    expect(c.cupo_analisis).toBe(60);
    expect(c.cupo_trasiegos).toBe(4);
    expect(c.horizonte_semanas).toBe(8);
    expect(c.feriados).toEqual([{ fecha: '2026-10-20', nombre: 'X' }]);
  });
  it('no se cae con config rara', () => {
    expect(configAgenda(null).cupo_analisis).toBe(AGENDA_DEFAULT.cupo_analisis);
    expect(configAgenda({ agenda: [] }).cupo_analisis).toBe(55);
  });
});

describe('edicion de config.agenda', () => {
  it('asegurarConfigAgenda materializa defaults + feriados una sola vez', () => {
    const datos = {};
    const a = asegurarConfigAgenda(datos);
    expect(datos.config.agenda).toBe(a);
    expect(a.cupo_analisis).toBe(55);
    expect(a.feriados.length).toBe(FERIADOS_AR.length);
    expect(asegurarConfigAgenda(datos)).toBe(a);
  });
  it('fijarParametro valida enteros y minimos', () => {
    const datos = {};
    expect(fijarParametro(datos, 'cupo_analisis', '58')).toBe(true);
    expect(datos.config.agenda.cupo_analisis).toBe(58);
    expect(fijarParametro(datos, 'cupo_trasiegos', '0')).toBe(true);
    expect(fijarParametro(datos, 'dias_trasiego', '0')).toBe(false);
    expect(fijarParametro(datos, 'cupo_analisis', '3,5')).toBe(false);
    expect(fijarParametro(datos, 'inventado', '3')).toBe(false);
  });
  it('agregar, quitar y restaurar feriados', () => {
    const datos = {};
    expect(agregarFeriado(datos, '2026-10-21', 'Vendimia chica')).toBe(true);
    expect(agregarFeriado(datos, '2026-10-21', 'otra vez')).toBe(false);
    expect(agregarFeriado(datos, '2026-02-30', 'no existe')).toBe(false);
    const fechas = datos.config.agenda.feriados.map(f => f.fecha);
    expect([...fechas].sort()).toEqual(fechas);
    expect(quitarFeriado(datos, '2026-10-21')).toBe(true);
    expect(quitarFeriado(datos, '2026-10-21')).toBe(false);
    datos.config.agenda.feriados = [];
    restaurarFeriados(datos);
    expect(datos.config.agenda.feriados).toEqual(FERIADOS_AR);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/lotes-agenda-dias.test.mjs`
Expected: FAIL — no existe `agenda-dias.js`.

- [ ] **Step 3: Implementar `public/lotes/js/agenda-dias.js`**

```js
/* ===== Lotes CIW — Agenda: fechas, dias habiles, feriados y parametros =====
 *
 * Modulo PURO (sin DOM ni nucleo.js): lo importan agenda.js, las vistas y los
 * tests. Las fechas son texto ISO 'AAAA-MM-DD' y se cuentan en UTC, como
 * fechaDia() del servidor: asi el huso horario nunca corre un dia.
 */
'use strict';

const DIA_MS = 86400000;
const _ms = (f) => Date.parse(String(f).slice(0, 10) + 'T00:00:00Z');
const _iso = (t) => new Date(t).toISOString().slice(0, 10);

export const AGENDA_DEFAULT = Object.freeze({
  cupo_analisis: 55,      // analisis por dia habil (el laboratorio hace 50-60)
  cupo_trasiegos: 4,      // lotes trasegados por dia habil
  dias_trasiego: 90,      // regla general: trasegar cada 3 meses
  aviso_dias: 5,          // "proximo a vencer"
  horizonte_semanas: 8,   // cuanto calendario se calcula
});

/* Minimo aceptado por parametro (todos enteros). */
const MINIMOS = { cupo_analisis: 0, cupo_trasiegos: 0, dias_trasiego: 1, aviso_dias: 0, horizonte_semanas: 1 };

/* Feriados nacionales de Argentina. Los trasladables siguen la ley 27.399 y los
 * "puentes" son los del decreto de cada año: el usuario los revisa en
 * Configuracion (los de 2027 todavia no estaban decretados al cargarlos). */
export const FERIADOS_AR = Object.freeze([
  { fecha: '2026-01-01', nombre: 'Año Nuevo' },
  { fecha: '2026-02-16', nombre: 'Carnaval' },
  { fecha: '2026-02-17', nombre: 'Carnaval' },
  { fecha: '2026-03-23', nombre: 'Feriado puente' },
  { fecha: '2026-03-24', nombre: 'Día de la Memoria' },
  { fecha: '2026-04-02', nombre: 'Malvinas' },
  { fecha: '2026-04-03', nombre: 'Viernes Santo' },
  { fecha: '2026-05-01', nombre: 'Día del Trabajador' },
  { fecha: '2026-05-25', nombre: 'Revolución de Mayo' },
  { fecha: '2026-06-15', nombre: 'Paso a la Inmortalidad de Güemes' },
  { fecha: '2026-06-20', nombre: 'Día de la Bandera' },
  { fecha: '2026-07-09', nombre: 'Día de la Independencia' },
  { fecha: '2026-07-10', nombre: 'Feriado puente' },
  { fecha: '2026-08-17', nombre: 'Paso a la Inmortalidad de San Martín' },
  { fecha: '2026-10-12', nombre: 'Día del Respeto a la Diversidad Cultural' },
  { fecha: '2026-11-23', nombre: 'Día de la Soberanía Nacional' },
  { fecha: '2026-12-07', nombre: 'Feriado puente' },
  { fecha: '2026-12-08', nombre: 'Inmaculada Concepción' },
  { fecha: '2026-12-25', nombre: 'Navidad' },
  { fecha: '2027-01-01', nombre: 'Año Nuevo' },
  { fecha: '2027-02-08', nombre: 'Carnaval' },
  { fecha: '2027-02-09', nombre: 'Carnaval' },
  { fecha: '2027-03-24', nombre: 'Día de la Memoria' },
  { fecha: '2027-03-26', nombre: 'Viernes Santo' },
  { fecha: '2027-04-02', nombre: 'Malvinas' },
  { fecha: '2027-05-01', nombre: 'Día del Trabajador' },
  { fecha: '2027-05-25', nombre: 'Revolución de Mayo' },
  { fecha: '2027-06-20', nombre: 'Día de la Bandera' },
  { fecha: '2027-06-21', nombre: 'Paso a la Inmortalidad de Güemes' },
  { fecha: '2027-07-09', nombre: 'Día de la Independencia' },
  { fecha: '2027-08-16', nombre: 'Paso a la Inmortalidad de San Martín' },
  { fecha: '2027-10-11', nombre: 'Día del Respeto a la Diversidad Cultural' },
  { fecha: '2027-11-20', nombre: 'Día de la Soberanía Nacional' },
  { fecha: '2027-12-08', nombre: 'Inmaculada Concepción' },
  { fecha: '2027-12-25', nombre: 'Navidad' },
].map(Object.freeze));

/* ---------- fechas ---------- */

export function esIso(s){
  const t = String(s ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const ms = _ms(t);
  return !Number.isNaN(ms) && _iso(ms) === t; // descarta 2026-02-30
}
export function sumarDias(f, n){ return _iso(_ms(f) + n * DIA_MS); }
/** b − a, en dias. */
export function difDias(a, b){ return Math.round((_ms(b) - _ms(a)) / DIA_MS); }
/** 0 = domingo … 6 = sabado. */
export function diaSemana(f){ return new Date(_ms(f)).getUTCDay(); }
export function lunesDe(f){ const d = diaSemana(f); return sumarDias(f, d === 0 ? -6 : 1 - d); }

/* ---------- config efectiva ---------- */

const _copiaFeriados = (lista) => lista.map(f => ({ fecha: f.fecha, nombre: f.nombre }));

/** Parametros que rigen: config.agenda validada y completada con los defaults. */
export function configAgenda(config){
  const a = (config && typeof config === 'object' && config.agenda
    && typeof config.agenda === 'object' && !Array.isArray(config.agenda)) ? config.agenda : {};
  const out = { ...AGENDA_DEFAULT };
  for (const k of Object.keys(AGENDA_DEFAULT)){
    const v = Number(a[k]);
    if (Number.isInteger(v) && v >= MINIMOS[k]) out[k] = v;
  }
  out.feriados = Array.isArray(a.feriados)
    ? a.feriados.filter(f => f && esIso(f.fecha))
        .map(f => ({ fecha: String(f.fecha), nombre: String(f.nombre ?? '') }))
    : _copiaFeriados(FERIADOS_AR);
  return out;
}

export function mapaFeriados(feriados){ return new Map((feriados || []).map(f => [f.fecha, f.nombre])); }
export function esHabil(f, mapa){ const d = diaSemana(f); return d !== 0 && d !== 6 && !mapa.has(f); }

/* ---------- edicion (Configuracion) ----------
 * Mientras nadie edita, config.agenda no existe y rigen los defaults. La
 * primera edicion la materializa entera, feriados incluidos. */

export function asegurarConfigAgenda(datos){
  if (!datos.config || typeof datos.config !== 'object' || Array.isArray(datos.config)) datos.config = {};
  const c = datos.config;
  if (!c.agenda || typeof c.agenda !== 'object' || Array.isArray(c.agenda)) c.agenda = configAgenda(c);
  return c.agenda;
}

export function fijarParametro(datos, k, valor){
  if (!(k in AGENDA_DEFAULT)) return false;
  const n = Number(String(valor ?? '').trim());
  if (String(valor ?? '').trim() === '' || !Number.isInteger(n) || n < MINIMOS[k]) return false;
  asegurarConfigAgenda(datos)[k] = n;
  return true;
}

export function agregarFeriado(datos, fecha, nombre){
  if (!esIso(fecha)) return false;
  const a = asegurarConfigAgenda(datos);
  if (a.feriados.some(f => f.fecha === fecha)) return false;
  a.feriados.push({ fecha, nombre: String(nombre ?? '').trim() });
  a.feriados.sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0));
  return true;
}

export function quitarFeriado(datos, fecha){
  const a = asegurarConfigAgenda(datos);
  const antes = a.feriados.length;
  a.feriados = a.feriados.filter(f => f.fecha !== fecha);
  return a.feriados.length !== antes;
}

export function restaurarFeriados(datos){ asegurarConfigAgenda(datos).feriados = _copiaFeriados(FERIADOS_AR); }
```

Nota: el test `expect(c.feriados).toEqual(FERIADOS_AR)` compara contra objetos congelados; `toEqual` ignora el congelado, así que pasa.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run test/lotes-agenda-dias.test.mjs` → PASS. Luego `npm test` → todo PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/agenda-dias.js test/lotes-agenda-dias.test.mjs
git commit -m "feat(lotes): agenda-dias.js (días hábiles, feriados AR y config.agenda)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Motor — ítems de análisis

**Files:**
- Create: `public/lotes/js/agenda.js`
- Test: `test/lotes-agenda.test.mjs`

**Interfaces:**
- Consumes: `sumarDias`, `difDias` de `agenda-dias.js`; filas de `dashData().lotes` con `{lote, variedad, activo, alarmas[], ultima_fecha_control, frecuencia_max}`.
- Produces: `itemsAnalisis(dashLotes, cfg, hoy, fin) → Item[]` con `Item = {tipo:'analisis', lote:string, variedad:string, prioridad:1..5, motivo:string, etiquetas:string[], objetivo:iso, vence:iso|null, atraso:number|null, urgente:boolean, orden:number, ordenFecha:string}`; constante `GRUPOS_ANALISIS`.

- [ ] **Step 1: Escribir el test que falla**

`test/lotes-agenda.test.mjs`:

```js
/* Motor de la Agenda: que analizar y que trasegar, y cuando. */
import { describe, it, expect } from 'vitest';
import { itemsAnalisis, GRUPOS_ANALISIS } from '../public/lotes/js/agenda.js';
import { configAgenda } from '../public/lotes/js/agenda-dias.js';

const HOY = '2026-10-14';           // miercoles
const FIN = '2026-12-06';           // ultimo dia de 8 semanas desde el lunes 12/10
const cfg = configAgenda({});

describe('itemsAnalisis', () => {
  const dash = [
    { lote: '26001', variedad: 'Malbec', activo: true, alarmas: ['so2_caida_alerta', 'frecuencia_vencida'],
      ultima_fecha_control: '2026-09-01', frecuencia_max: 15 },
    { lote: '26002', variedad: 'Malbec', activo: true, alarmas: ['reanalisis_correccion'],
      ultima_fecha_control: '2026-10-10', frecuencia_max: 15 },
    { lote: '26003', variedad: 'Cabernet', activo: true, alarmas: [],
      ultima_fecha_control: '2026-10-01', frecuencia_max: 15 },
    { lote: '26004', variedad: 'Cabernet', activo: true, alarmas: ['no_lleno'],
      ultima_fecha_control: '2026-10-10', frecuencia_max: 30 },
    { lote: '26005', variedad: 'Syrah', activo: true, alarmas: [],
      ultima_fecha_control: '2026-12-01', frecuencia_max: 30 },
    { lote: '26006', variedad: 'Syrah', activo: true, alarmas: ['sin_analisis_valido'],
      ultima_fecha_control: null, frecuencia_max: 15 },
    { lote: '26007', variedad: 'Syrah', activo: false, alarmas: ['av_alerta'],
      ultima_fecha_control: '2026-09-01', frecuencia_max: 15 },
  ];
  const items = itemsAnalisis(dash, cfg, HOY, FIN);
  const de = (l) => items.find(i => i.lote === l);

  it('AV o caida de SO2 es prioridad 1, urgente, con las otras alertas como etiquetas', () => {
    expect(de('26001')).toMatchObject({ prioridad: 1, motivo: 'Caída SO₂', etiquetas: ['Vencido'],
      objetivo: HOY, urgente: true, vence: '2026-09-16', atraso: 28 });
  });
  it('re-analisis es prioridad 3', () => {
    expect(de('26002')).toMatchObject({ prioridad: 3, motivo: 'Re-análisis', urgente: true, objetivo: HOY });
  });
  it('a 5 dias o menos del vencimiento es prioridad 4 y apunta al vencimiento', () => {
    expect(de('26003')).toMatchObject({ prioridad: 4, objetivo: '2026-10-16', urgente: false, atraso: null });
  });
  it('mas lejos es un control programado (prioridad 5) si cae en el horizonte', () => {
    expect(de('26004')).toMatchObject({ prioridad: 5, objetivo: '2026-11-09' });
    expect(de('26005')).toBeUndefined();            // vence 31/12, fuera del horizonte
  });
  it('sin analisis valido es prioridad 2, sin atraso calculable', () => {
    expect(de('26006')).toMatchObject({ prioridad: 2, motivo: 'Sin análisis', vence: null, atraso: null });
  });
  it('los lotes inactivos no entran', () => {
    expect(de('26007')).toBeUndefined();
  });
  it('los nombres de los grupos', () => {
    expect(GRUPOS_ANALISIS[1]).toBe('AV / caída de SO₂');
    expect(GRUPOS_ANALISIS[4]).toBe('Próximos a vencer');
  });
  it('sin dashboard no hay items', () => {
    expect(itemsAnalisis(null, cfg, HOY, FIN)).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/lotes-agenda.test.mjs`
Expected: FAIL — no existe `agenda.js`.

- [ ] **Step 3: Implementar la primera parte de `public/lotes/js/agenda.js`**

```js
/* ===== Lotes CIW — Agenda: que analizar y que trasegar, y cuando =====
 *
 * Modulo PURO. El plan no se guarda: se calcula en cada dibujo a partir de las
 * alertas del servidor (/dashboard), los lotes, los analisis, los movimientos
 * y config.agenda. Asi nunca queda viejo: entra un analisis y el item se va.
 */
'use strict';

import { sumarDias, difDias, lunesDe, esHabil, mapaFeriados, configAgenda, esIso } from './agenda-dias.js';

/* ---------- analisis ---------- */

/* Grupos de prioridad, en el orden que pidio el usuario (2026-10-13). */
const GRUPOS = {
  1: ['av_alerta', 'so2_caida_alerta'],
  2: ['frecuencia_vencida', 'sin_analisis_valido'],
  3: ['reanalisis_correccion'],
};
const ETIQUETA = {
  av_alerta: 'AV', so2_caida_alerta: 'Caída SO₂',
  frecuencia_vencida: 'Vencido', sin_analisis_valido: 'Sin análisis',
  reanalisis_correccion: 'Re-análisis',
};
export const GRUPOS_ANALISIS = {
  1: 'AV / caída de SO₂', 2: 'Vencidos', 3: 'Re-análisis post-corrección',
  4: 'Próximos a vencer', 5: 'Controles programados',
};

/**
 * Un item por lote activo que necesita analisis, con su motivo de mayor
 * prioridad. 1-3 son urgentes (van desde hoy); 4 y 5 apuntan a la fecha en
 * que vence la frecuencia (ultimo control + frecuencia_max). La 5 solo entra
 * si vence dentro del horizonte [hoy, fin].
 */
export function itemsAnalisis(dashLotes, cfg, hoy, fin){
  const out = [];
  for (const l of dashLotes || []){
    if (!l || l.activo === false) continue;
    const al = new Set(l.alarmas || []);
    let prioridad = null;
    for (const n of [1, 2, 3]) if (GRUPOS[n].some(k => al.has(k))){ prioridad = n; break; }

    const fm = Number(l.frecuencia_max);
    const vence = esIso(l.ultima_fecha_control) && Number.isFinite(fm) ? sumarDias(l.ultima_fecha_control, fm) : null;
    let objetivo = prioridad ? hoy : null;
    if (!prioridad && vence){
      if (difDias(hoy, vence) <= cfg.aviso_dias){ prioridad = 4; objetivo = vence < hoy ? hoy : vence; }
      else if (vence <= fin){ prioridad = 5; objetivo = vence; }
    }
    if (!prioridad) continue;

    const propias = prioridad <= 3 ? GRUPOS[prioridad].filter(k => al.has(k)) : [];
    const otras = [1, 2, 3].filter(n => n > prioridad).flatMap(n => GRUPOS[n].filter(k => al.has(k)));
    out.push({
      tipo: 'analisis',
      lote: String(l.lote ?? '').trim(),
      variedad: String(l.variedad ?? ''),
      prioridad,
      motivo: propias.length ? propias.map(k => ETIQUETA[k]).join(' + ') : GRUPOS_ANALISIS[prioridad],
      etiquetas: otras.map(k => ETIQUETA[k]),
      objetivo, vence,
      atraso: vence && vence < hoy ? difDias(vence, hoy) : null,
      urgente: prioridad <= 3,
      orden: prioridad,
      ordenFecha: vence || '0000-00-00',   // sin control: el mas viejo posible
    });
  }
  return out;
}
```

(`lunesDe`, `esHabil`, `mapaFeriados`, `configAgenda` se usan en la Task 5; importarlos ya no rompe nada.)

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run test/lotes-agenda.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/agenda.js test/lotes-agenda.test.mjs
git commit -m "feat(lotes): agenda.js, ítems de análisis por prioridad

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Motor — ítems de trasiego

**Files:**
- Modify: `public/lotes/js/agenda.js`
- Test: `test/lotes-agenda.test.mjs`

**Interfaces:**
- Produces: `TIPOS_MOV_REALES`, `estaEnBarricas(lote): boolean`, `prioridadAuto(d): 'alta'|'media'|'baja'`, `fechaBaseTrasiego(lote, movsDelLote, analisisDelLote) → {fecha, origen:'movimiento'|'ingreso'|'etapa'|'analisis'} | null`, `itemsTrasiego(lotes, movimientos, analisis, cfg, hoy) → Item[]` con `Item = {tipo:'trasiego', lote, variedad, barriles:number, base:iso|null, origen, vencimiento:iso|null, d:number|null, prioridad, prioridadAuto, objetivo:iso|null, urgente:boolean, enCurso:{fecha, ot}|null, sinBase:boolean, orden:1|2|3, ordenFecha:string}`.

- [ ] **Step 1: Agregar los tests que fallan** (al final de `test/lotes-agenda.test.mjs`, y sumar los nombres al import de `agenda.js`)

```js
import { itemsTrasiego, prioridadAuto, fechaBaseTrasiego, estaEnBarricas } from '../public/lotes/js/agenda.js';

describe('prioridadAuto', () => {
  it('bordes de 15 dias', () => {
    expect(prioridadAuto(16)).toBe('alta');
    expect(prioridadAuto(15)).toBe('media');
    expect(prioridadAuto(0)).toBe('media');
    expect(prioridadAuto(-15)).toBe('media');
    expect(prioridadAuto(-16)).toBe('baja');
  });
});

describe('estaEnBarricas', () => {
  it('cap225, cap500 o el texto "barric"; cap200 son tanques t200', () => {
    expect(estaEnBarricas({ cap225: 3 })).toBe(true);
    expect(estaEnBarricas({ cap500: 1 })).toBe(true);
    expect(estaEnBarricas({ vasija_actual: 'Barrica + t50' })).toBe(true);
    expect(estaEnBarricas({ cap200: 2, vasija_actual: 't200 + t50' })).toBe(false);
    expect(estaEnBarricas({ vasija_actual: 't50' })).toBe(false);
  });
});

describe('fechaBaseTrasiego', () => {
  it('movimiento real mas reciente; si no, ingreso; si no, etapa; si no, primer analisis', () => {
    const movs = [{ tipo: 'descube', fecha: '2026-03-01' }, { tipo: 'trasiego', fecha: '2026-06-01' },
                  { tipo: 'salida', fecha: '2026-09-01' }, { tipo: 'trasiego', fecha: '2026-09-15', estado: 'pendiente' }];
    expect(fechaBaseTrasiego({}, movs, [])).toEqual({ fecha: '2026-06-01', origen: 'movimiento' });
    expect(fechaBaseTrasiego({ fecha_ingreso: '2026-02-12' }, [], [])).toEqual({ fecha: '2026-02-12', origen: 'ingreso' });
    expect(fechaBaseTrasiego({ historial_etapas: [{ desde: '2026-04-01' }] }, [], []))
      .toEqual({ fecha: '2026-04-01', origen: 'etapa' });
    expect(fechaBaseTrasiego({}, [], [{ fecha_analisis: '2026-05-02' }, { fecha_analisis: '2026-04-20' }]))
      .toEqual({ fecha: '2026-04-20', origen: 'analisis' });
    expect(fechaBaseTrasiego({}, [], [])).toBeNull();
  });
});

describe('itemsTrasiego', () => {
  const lotes = [
    { lote: '26101', variedad: 'Malbec', litros_actuales: 2000, cap225: 9, vasija_actual: 'Barricas', fecha_ingreso: '2026-03-01' },
    { lote: '26102', variedad: 'Malbec', litros_actuales: 500, cap225: 2, fecha_ingreso: '2026-07-20' },
    { lote: '26103', variedad: 'Syrah', litros_actuales: 300, vasija_actual: 't50' },
    { lote: '26104', variedad: 'Syrah', litros_actuales: 0, cap225: 4 },
    { lote: '26105', variedad: 'Petit Verdot', litros_actuales: 900, cap225: 4, fecha_ingreso: '2026-02-01' },
    { lote: '26106', variedad: 'Bonarda', litros_actuales: 400, vasija_actual: 'Barrica + t50' },
  ];
  const movs = [
    { lote: '26101', tipo: 'trasiego', fecha: '2026-06-01' },
    { lote: '26099', lote_destino: '26105', tipo: 'traspaso', fecha: '2026-07-01' },
    { lote: '26105', tipo: 'trasiego', fecha: '2026-10-15', estado: 'pendiente', ot: '0712' },
  ];
  const items = itemsTrasiego(lotes, movs, [], cfg, HOY);
  const de = (l) => items.find(i => i.lote === l);

  it('vencido hace 45 dias: alta y urgente', () => {
    expect(de('26101')).toMatchObject({ base: '2026-06-01', origen: 'movimiento', vencimiento: '2026-08-30',
      d: 45, prioridad: 'alta', urgente: true, objetivo: HOY, barriles: 9, enCurso: null });
  });
  it('vence en 4 dias: media, apunta al vencimiento', () => {
    expect(de('26102')).toMatchObject({ origen: 'ingreso', vencimiento: '2026-10-18', d: -4,
      prioridad: 'media', urgente: false, objetivo: '2026-10-18' });
  });
  it('tanques y lotes vacios no entran', () => {
    expect(de('26103')).toBeUndefined();
    expect(de('26104')).toBeUndefined();
  });
  it('cuenta el traspaso donde el lote es destino y marca la OT pendiente como en curso', () => {
    expect(de('26105')).toMatchObject({ base: '2026-07-01', vencimiento: '2026-09-29', d: 15, prioridad: 'media',
      enCurso: { fecha: '2026-10-15', ot: '0712' } });
  });
  it('sin ninguna fecha: sinBase, prioridad media, sin objetivo', () => {
    expect(de('26106')).toMatchObject({ sinBase: true, prioridad: 'media', objetivo: null, vencimiento: null });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/lotes-agenda.test.mjs`
Expected: FAIL — `itemsTrasiego` no está exportado.

- [ ] **Step 3: Implementar en `agenda.js`** (debajo de `itemsAnalisis`)

```js
/* ---------- trasiegos ---------- */

/** Movimientos que realmente mueven el vino y reinician los 3 meses. */
export const TIPOS_MOV_REALES = ['trasiego', 'descube', 'traspaso'];
const RANGO = { alta: 1, media: 2, baja: 3 };

const _pos = (x) => { const n = Number(String(x ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
const _clave = (x) => String(x ?? '').trim();
const _pendiente = (m) => String((m && m.estado) ?? '') === 'pendiente';
const _f10 = (x) => String(x ?? '').slice(0, 10);

/** Barricas: cap225/cap500 o el texto. cap200 son tanques t200, no barricas. */
export function estaEnBarricas(l){
  return _pos(l.cap225) > 0 || _pos(l.cap500) > 0 || /barric/i.test(String(l.vasija_actual ?? ''));
}

/** d = dias desde el vencimiento (negativo = falta). */
export function prioridadAuto(d){
  if (d > 15) return 'alta';
  if (d >= -15) return 'media';
  return 'baja';
}

/** Desde cuando se cuentan los 3 meses del lote. */
export function fechaBaseTrasiego(l, movsDelLote, analisisDelLote){
  let mejor = null;
  for (const m of movsDelLote || []){
    if (!TIPOS_MOV_REALES.includes(m.tipo) || _pendiente(m)) continue;
    const f = _f10(m.fecha);
    if (esIso(f) && (!mejor || f > mejor)) mejor = f;
  }
  if (mejor) return { fecha: mejor, origen: 'movimiento' };
  const ing = _f10(l.fecha_ingreso);
  if (esIso(ing)) return { fecha: ing, origen: 'ingreso' };
  const h = Array.isArray(l.historial_etapas) ? l.historial_etapas[0] : null;
  const de = _f10(h && h.desde);
  if (esIso(de)) return { fecha: de, origen: 'etapa' };
  const fs = (analisisDelLote || []).map(a => _f10(a.fecha_analisis)).filter(esIso).sort();
  return fs.length ? { fecha: fs[0], origen: 'analisis' } : null;
}

function _agrupar(lista, claves){
  const m = new Map();
  for (const x of lista || []){
    if (!x || typeof x !== 'object') continue;
    for (const k of new Set(claves.map(c => _clave(x[c])).filter(Boolean))){
      const arr = m.get(k); if (arr) arr.push(x); else m.set(k, [x]);
    }
  }
  return m;
}

/** Un item por lote activo en barricas: cuando vence su trasiego y con que prioridad. */
export function itemsTrasiego(lotes, movimientos, analisis, cfg, hoy){
  const movsPor = _agrupar(movimientos, ['lote', 'lote_destino']);
  const anPor = _agrupar(analisis, ['lote']);
  const out = [];
  for (const l of lotes || []){
    if (!l || _pos(l.litros_actuales) === 0 || !estaEnBarricas(l)) continue;
    const k = _clave(l.lote);
    const movs = movsPor.get(k) || [];
    const pend = movs.filter(m => _pendiente(m) && TIPOS_MOV_REALES.includes(m.tipo) && esIso(_f10(m.fecha)))
      .sort((a, b) => (_f10(a.fecha) < _f10(b.fecha) ? -1 : 1))[0];
    const enCurso = pend ? { fecha: _f10(pend.fecha), ot: String(pend.ot ?? '') } : null;
    const base = fechaBaseTrasiego(l, movs, anPor.get(k) || []);
    const comun = { tipo: 'trasiego', lote: k, variedad: String(l.variedad ?? ''),
                    barriles: Math.round(_pos(l.cap225) + _pos(l.cap500)), enCurso };
    if (!base){
      out.push({ ...comun, base: null, origen: null, vencimiento: null, d: null, prioridad: 'media',
        prioridadAuto: 'media', objetivo: null, urgente: false, sinBase: true, orden: RANGO.media, ordenFecha: '9999-99-99' });
      continue;
    }
    const vencimiento = sumarDias(base.fecha, cfg.dias_trasiego);
    const d = difDias(vencimiento, hoy);
    const p = prioridadAuto(d);
    out.push({ ...comun, base: base.fecha, origen: base.origen, vencimiento, d, prioridad: p, prioridadAuto: p,
      objetivo: d >= 0 ? hoy : vencimiento, urgente: d >= 0, sinBase: false, orden: RANGO[p], ordenFecha: vencimiento });
  }
  return out;
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run test/lotes-agenda.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/agenda.js test/lotes-agenda.test.mjs
git commit -m "feat(lotes): agenda.js, ítems de trasiego (90 días desde el último movimiento real)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Motor — reparto con cupo y `planificar`

**Files:**
- Modify: `public/lotes/js/agenda.js`
- Test: `test/lotes-agenda.test.mjs`

**Interfaces:**
- Produces:
  - `armarDias(desde, cantidad, mapaFer) → [{fecha, habil, feriado}]`
  - `repartir(items, dias, cupoDe, hoy) → Map<iso, Item[]>`. Muta cada item: `programado` (iso | null), `sinLugar` (bool), `atrasado` (bool).
  - `planificar({lotes, analisis, movimientos, dashLotes, config, hoy}) → Plan`, donde `Plan = {cfg, hoy, dias:[{fecha, habil, feriado, cupoA, cupoT, analisis:Item[], trasiegos:Item[], excedidoA, excedidoT}], bandeja:{analisis:Item[], trasiegos:Item[]}, sinAlertas:boolean}`.

- [ ] **Step 1: Agregar los tests que fallan**

```js
import { armarDias, repartir, planificar } from '../public/lotes/js/agenda.js';
import { mapaFeriados } from '../public/lotes/js/agenda-dias.js';

const it_ = (lote, extra) => ({ lote, orden: 1, ordenFecha: '2026-09-01', ...extra });

describe('repartir', () => {
  const dias = armarDias('2026-10-12', 14, mapaFeriados([{ fecha: '2026-10-12', nombre: 'Feriado' }]));
  const cupo2 = () => 2;

  it('armarDias marca feriados y fines de semana', () => {
    expect(dias[0]).toEqual({ fecha: '2026-10-12', habil: false, feriado: 'Feriado' });
    expect(dias[5]).toMatchObject({ fecha: '2026-10-17', habil: false, feriado: null });
    expect(dias).toHaveLength(14);
  });

  it('urgentes desde hoy con cupo; lo demas en su fecha, primero hacia atras y despues hacia adelante', () => {
    const items = [
      it_('1', { urgente: true, objetivo: HOY, ordenFecha: '2026-09-01' }),
      it_('2', { urgente: true, objetivo: HOY, ordenFecha: '2026-09-02' }),
      it_('3', { urgente: true, objetivo: HOY, ordenFecha: '2026-09-03' }),
      it_('5', { urgente: false, objetivo: '2026-10-15', orden: 4, ordenFecha: '2026-10-15' }),
      it_('9', { urgente: false, objetivo: '2026-10-15', orden: 4, ordenFecha: '2026-10-15' }),
      it_('7', { urgente: false, objetivo: '2026-10-18', orden: 4, ordenFecha: '2026-10-18' }), // domingo
    ];
    const r = repartir(items, dias, cupo2, HOY);
    const lotes = (f) => r.get(f).map(i => i.lote);
    expect(lotes('2026-10-14')).toEqual(['1', '2']);
    expect(lotes('2026-10-15')).toEqual(['3', '5']);
    expect(lotes('2026-10-16')).toEqual(['9', '7']);   // 9: 15 y 14 llenos -> adelante; 7: domingo -> viernes
    expect(lotes('2026-10-13')).toEqual([]);            // los dias pasados no reciben nada
    expect(items.find(i => i.lote === '7').programado).toBe('2026-10-16');
  });

  it('sin lugar en todo el horizonte queda marcado; fuera del horizonte no se ubica', () => {
    const muchos = Array.from({ length: 25 }, (_, k) => it_(String(100 + k), { urgente: true, objetivo: HOY }));
    const lejos = it_('900', { urgente: false, objetivo: '2027-01-10', orden: 5, ordenFecha: '2027-01-10' });
    repartir([...muchos, lejos], dias, cupo2, HOY);
    expect(muchos.filter(i => i.sinLugar)).toHaveLength(25 - 2 * 8); // 8 dias habiles desde hoy (14 al 23/10, sin 17-18)
    expect(lejos.programado).toBeNull();
    expect(lejos.sinLugar).toBe(false);
  });

  it('un trasiego en curso va al dia de su OT; si ya paso, a hoy y atrasado', () => {
    const a = it_('A', { urgente: true, objetivo: HOY, enCurso: { fecha: '2026-10-16', ot: '1' } });
    const b = it_('B', { urgente: true, objetivo: HOY, enCurso: { fecha: '2026-10-13', ot: '2' } });
    const r = repartir([a, b], dias, cupo2, HOY);
    expect(r.get('2026-10-16').map(i => i.lote)).toEqual(['A']);
    expect(r.get(HOY).map(i => i.lote)).toEqual(['B']);
    expect(b.atrasado).toBe(true);
  });
});

describe('planificar', () => {
  const datos = {
    lotes: [{ lote: '26101', variedad: 'Malbec', litros_actuales: 2000, cap225: 9, fecha_ingreso: '2026-03-01' }],
    analisis: [], movimientos: [{ lote: '26101', tipo: 'trasiego', fecha: '2026-06-01' }],
    config: {}, hoy: HOY,
  };

  it('arma 8 semanas desde el lunes, con el feriado del 12/10', () => {
    const p = planificar({ ...datos, dashLotes: [] });
    expect(p.dias).toHaveLength(56);
    expect(p.dias[0]).toMatchObject({ fecha: '2026-10-12', habil: false, feriado: 'Día del Respeto a la Diversidad Cultural' });
    expect(p.dias.find(d => d.fecha === HOY).trasiegos.map(t => t.lote)).toEqual(['26101']);
    expect(p.dias[2]).toMatchObject({ cupoA: 55, cupoT: 4, excedidoA: false, excedidoT: false });
  });

  it('sin dashboard: solo trasiegos y el aviso', () => {
    const p = planificar({ ...datos, dashLotes: null });
    expect(p.sinAlertas).toBe(true);
    expect(p.bandeja.analisis).toEqual([]);
    expect(p.bandeja.trasiegos.map(t => t.lote)).toEqual(['26101']);
  });

  it('la bandeja de analisis va por prioridad y deja afuera los programados', () => {
    const dash = [
      { lote: '2', activo: true, alarmas: ['frecuencia_vencida'], ultima_fecha_control: '2026-09-01', frecuencia_max: 15 },
      { lote: '1', activo: true, alarmas: ['av_alerta'], ultima_fecha_control: '2026-10-10', frecuencia_max: 15 },
      { lote: '3', activo: true, alarmas: [], ultima_fecha_control: '2026-10-10', frecuencia_max: 30 },
    ];
    const p = planificar({ ...datos, dashLotes: dash });
    expect(p.bandeja.analisis.map(i => i.lote)).toEqual(['1', '2']);
    expect(p.bandeja.analisis[0].programado).toBe(HOY);
  });

  it('respeta los cupos de config.agenda', () => {
    const p = planificar({ ...datos, config: { agenda: { cupo_trasiegos: 0 } }, dashLotes: [] });
    expect(p.dias.every(d => d.trasiegos.length === 0)).toBe(true);
    expect(p.bandeja.trasiegos[0].sinLugar).toBe(true);
  });
});
```

Cuenta del segundo test: días hábiles desde el 14/10 en 14 días desde el 12/10 → 14, 15, 16, 19, 20, 21, 22, 23 = 8 días × 2 = 16 lugares, sobran 25 − 16 = 9.

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run test/lotes-agenda.test.mjs`
Expected: FAIL — `armarDias` no está exportado.

- [ ] **Step 3: Implementar en `agenda.js`**

```js
/* ---------- reparto ---------- */

export function armarDias(desde, cantidad, mapaFer){
  const out = [];
  for (let k = 0; k < cantidad; k++){
    const fecha = sumarDias(desde, k);
    out.push({ fecha, habil: esHabil(fecha, mapaFer), feriado: mapaFer.get(fecha) ?? null });
  }
  return out;
}

const _cmpLote = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

/**
 * Ubica cada item en un dia, respetando el cupo de cada dia.
 *  1. En curso (OT emitida): el dia de su OT; si ya paso, hoy y "atrasado".
 *  2. El resto por (orden, ordenFecha, lote):
 *     - urgente: primer dia habil desde hoy con lugar;
 *     - no urgente: su fecha objetivo; si esta llena, dias habiles ANTERIORES
 *       hasta hoy (para no dejarlo vencer) y despues POSTERIORES.
 *  Los no habiles nunca reciben items. Lo que vence despues del horizonte no
 *  se ubica (programado null, sinLugar false); lo que no entra, sinLugar true.
 */
export function repartir(items, dias, cupoDe, hoy){
  const asign = new Map(dias.map(d => [d.fecha, []]));
  const ultimo = dias.length ? dias[dias.length - 1].fecha : hoy;
  const habiles = dias.filter(d => d.habil && d.fecha >= hoy).map(d => d.fecha);
  const lleno = (f) => asign.get(f).length >= cupoDe(f);
  const poner = (it, f) => { asign.get(f).push(it); it.programado = f; it.sinLugar = false; };

  for (const it of items){ it.programado = null; it.sinLugar = false; it.atrasado = false; }

  for (const it of items.filter(i => i.enCurso)){
    let f = it.enCurso.fecha;
    if (f < hoy){ f = hoy; it.atrasado = true; }
    if (asign.has(f)) poner(it, f);
  }

  const resto = items.filter(i => !i.enCurso && i.objetivo)
    .sort((a, b) => a.orden - b.orden || (a.ordenFecha < b.ordenFecha ? -1 : a.ordenFecha > b.ordenFecha ? 1 : 0)
      || _cmpLote(a.lote, b.lote));

  for (const it of resto){
    let candidatos;
    if (it.urgente) candidatos = habiles;
    else {
      if (it.objetivo > ultimo) continue;                       // fuera del horizonte
      const t = it.objetivo < hoy ? hoy : it.objetivo;
      candidatos = habiles.filter(f => f <= t).reverse().concat(habiles.filter(f => f > t));
    }
    const f = candidatos.find(x => !lleno(x));
    if (f) poner(it, f); else it.sinLugar = true;
  }
  return asign;
}

/* ---------- plan completo ---------- */

const _cmpBandejaT = (a, b) => a.orden - b.orden || (b.d ?? -1e9) - (a.d ?? -1e9) || _cmpLote(a.lote, b.lote);

export function planificar({ lotes = [], analisis = [], movimientos = [], dashLotes = null, config = {}, hoy }){
  const cfg = configAgenda(config);
  const fer = mapaFeriados(cfg.feriados);
  const dias = armarDias(lunesDe(hoy), cfg.horizonte_semanas * 7, fer);
  const fin = dias[dias.length - 1].fecha;

  const ia = dashLotes ? itemsAnalisis(dashLotes, cfg, hoy, fin) : [];
  const it = itemsTrasiego(lotes, movimientos, analisis, cfg, hoy);
  const ra = repartir(ia, dias, () => cfg.cupo_analisis, hoy);
  const rt = repartir(it, dias, () => cfg.cupo_trasiegos, hoy);

  return {
    cfg, hoy,
    sinAlertas: !dashLotes,
    dias: dias.map(d => {
      const a = ra.get(d.fecha), t = rt.get(d.fecha);
      return { ...d, cupoA: cfg.cupo_analisis, cupoT: cfg.cupo_trasiegos, analisis: a, trasiegos: t,
               excedidoA: a.length > cfg.cupo_analisis, excedidoT: t.length > cfg.cupo_trasiegos };
    }),
    bandeja: {
      analisis: ia.filter(i => i.prioridad <= 4)
        .sort((a, b) => a.prioridad - b.prioridad || (a.ordenFecha < b.ordenFecha ? -1 : a.ordenFecha > b.ordenFecha ? 1 : 0)
          || _cmpLote(a.lote, b.lote)),
      trasiegos: it.filter(t => t.sinBase || t.enCurso || t.d >= 0).sort(_cmpBandejaT),
    },
  };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run test/lotes-agenda.test.mjs` → PASS. `npm test` → todo PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/agenda.js test/lotes-agenda.test.mjs
git commit -m "feat(lotes): agenda.js, reparto con cupo diario y planificar()

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Conexiones con Orden de muestras y Emitir OT

**Files:**
- Modify: `public/lotes/js/vista-orden.js` (import de `mostrarTab` desde `nucleo.js`; export nuevo junto a `renderOrden`)
- Modify: `public/lotes/js/vista-ot-emitir.js` (export nuevo debajo de `asegurarLotes`)
- Modify: `public/lotes/js/vista-movimientos.js` (import de `precargarLotesOT`; export nuevo junto a `verOrdenTrabajo`, ~l.104)

**Interfaces:**
- Produces: `precargarOrden(lotes: string[]): void`, `precargarLotesOT(lotes: string[]): void`, `emitirOTDesdeAgenda(lotes: string[]): void`.

Estas funciones tocan el DOM y no tienen test unitario. Se verifican en el navegador en la Task 9.

- [ ] **Step 1: `precargarOrden` en `vista-orden.js`**

Sumar `mostrarTab` al import de `./nucleo.js` y agregar:

```js
/* La Agenda arma la orden del dia: muestra la pestana y carga esos lotes como
 * si se hubieran pegado en "Pegar lotes" (reemplazando la orden). */
export function precargarOrden(lotes){
  mostrarTab('orden');
  _otPegado = (lotes || []).join('\n');
  const t = $('otPegar'); if (t) t.value = _otPegado;
  _otCargarPegados(true);
}
```

Verificar con `grep -n "otPegar\b\|id=\"otPegar\"" public/lotes/js/vista-orden.js` que el textarea se llama `otPegar` (si se llama distinto, usar ese id).

- [ ] **Step 2: `precargarLotesOT` en `vista-ot-emitir.js`**

```js
/* Lotes que llegan desde la Agenda: se agregan como si se tipearan y Enter.
 * _agregarLoteAhora limpia el campo antes de su await, asi que se pueden
 * encadenar sin esperar al Mapa de Barriles. */
export function precargarLotesOT(lotes){
  const inp = $('oteLote');
  if (!inp) return;
  for (const l of lotes || []){ inp.value = String(l); _agregarLote(); }
}
```

- [ ] **Step 3: `emitirOTDesdeAgenda` en `vista-movimientos.js`**

Sumar `precargarLotesOT` al import de `./vista-ot-emitir.js`. Ubicar con `grep -n "_alEmitir" public/lotes/js/vista-movimientos.js` el callback que se le pasa hoy a `abrirEmitirOT` en la sub-pestaña `ordenes` y reusarlo:

```js
/* Desde la Agenda: Movimientos > Ordenes de trabajo, con el formulario de
 * Emitir OT abierto (plantilla barricas->barricas, la primera) y el lote cargado. */
export function emitirOTDesdeAgenda(lotes){
  mostrarTab('movimientos');
  _sub = 'ordenes';
  renderMovimientos();
  abrirEmitirOT(_alEmitir);
  precargarLotesOT(lotes);
}
```

Si `_alEmitir` no es una función de módulo sino un closure dentro del render, extraerla a nivel de módulo con el mismo cuerpo y usarla en los dos lugares (sin cambiar su comportamiento).

- [ ] **Step 4: Chequeo de sintaxis y suite**

Run: `node --check public/lotes/js/vista-orden.js && node --check public/lotes/js/vista-ot-emitir.js && node --check public/lotes/js/vista-movimientos.js` → sin salida.
Run: `npm test` → todo PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/vista-orden.js public/lotes/js/vista-ot-emitir.js public/lotes/js/vista-movimientos.js
git commit -m "feat(lotes): entradas para abrir Orden de muestras y Emitir OT con lotes precargados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Pestaña 📅 Agenda (bandeja + calendario + panel del día)

**Files:**
- Create: `public/lotes/js/vista-agenda.js`
- Modify: `public/lotes/index.html` (botón en `.tabs` después de `tablero`; `<section class="view" id="tab-agenda"></section>` junto a las demás; CSS al final del `<style>` principal, antes de `</style>` ~l.1454; sumar `#tab-agenda` a la regla de `content-visibility` ~l.129)
- Modify: `public/lotes/app.js` (import `./js/vista-agenda.js`)
- Modify: `public/lotes/js/nucleo.js` (`_redibujarVistaDashboard`: agregar `'agenda'` a la lista)

**Interfaces:**
- Consumes: `planificar` (Task 5), `GRUPOS_ANALISIS` (Task 3), `sumarDias`, `lunesDe`, `diaSemana` (Task 2), `precargarOrden`, `emitirOTDesdeAgenda` (Task 6).
- Produces: `renderAgenda()` registrada como vista `'agenda'`.

**Antes de escribir CSS:** cargar la skill `frontend-design` y respetar los tokens que ya existen en `:root` de `public/lotes/index.html` (`--panel`, `--panel2`, `--line`, `--txt`, `--muted`, `--accent`, `--ok`, `--nook`, `--warn`, `--info`, `--r-sm/md/lg`, `--sh-sm/md`, `--serif`, `--sans`, `--accent-soft`). No inventar paleta nueva.

- [ ] **Step 1: Botón, sección y registro**

En `index.html`, dentro de `<div class="tabs" id="tabs">`, después del botón `data-v="tablero"`:

```html
      <button data-v="agenda">📅 Agenda</button>
```

Junto a las otras secciones:

```html
    <section class="view" id="tab-agenda"></section>
```

En la regla `@media screen{ … content-visibility … }` sumar `#tab-agenda` y `#tab-agenda.active` a las dos listas.

En `app.js`, junto a los demás imports de vistas: `import './js/vista-agenda.js';`

En `nucleo.js`, `_redibujarVistaDashboard`: `['lotes', 'dashboard', 'orden', 'tablero', 'agenda']`.

- [ ] **Step 2: Crear `public/lotes/js/vista-agenda.js`**

```js
/* ===== Lotes CIW — pestana Agenda =====
 *
 * Bandeja "Alertas para analizar" + calendario de analisis y trasiegos.
 * El motor decide (agenda.js, puro) y la vista dibuja: aca no se recalcula
 * ninguna regla. Etapa 1: ver y planificar; arrastrar llega en la Etapa 2.
 */
'use strict';

import { $, esc, escA, DATOS, dashData, dashLoading, cargarDashboard, registrarVista } from './nucleo.js';
import { planificar, GRUPOS_ANALISIS } from './agenda.js';
import { sumarDias, lunesDe, diaSemana } from './agenda-dias.js';
import { hoyLocalISO } from './fechas.js';
import { precargarOrden } from './vista-orden.js';
import { emitirOTDesdeAgenda } from './vista-movimientos.js';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
               'septiembre', 'octubre', 'noviembre', 'diciembre'];
const PRIO = { alta: 'Alta', media: 'Media', baja: 'Baja' };

let _modo = 'semana';   // 'semana' | 'mes'
let _filtro = 'ambos';  // 'ambos' | 'analisis' | 'trasiegos'
let _ancla = null;      // semana: su lunes; mes: cualquier dia del mes
let _diaAbierto = null; // ISO del panel del dia
let _resaltado = '';    // lote elegido en la bandeja
let _plan = null;
let _montado = false;

const ddmm = (f) => f.slice(8, 10) + '/' + f.slice(5, 7);

function _calcular(){
  const d = DATOS() || {};
  const dash = dashData();
  _plan = planificar({
    lotes: d.lotes || [], analisis: d.analisis || [], movimientos: d.movimientos || [],
    dashLotes: dash ? (dash.lotes || []) : null, config: d.config || {}, hoy: hoyLocalISO(),
  });
  return _plan;
}

export function renderAgenda(){
  const sec = $('tab-agenda');
  if (!sec) return;
  if (!dashData() && !dashLoading()) cargarDashboard();
  const p = _calcular();
  if (!_ancla) _ancla = lunesDe(p.hoy);
  const porFecha = new Map(p.dias.map(d => [d.fecha, d]));
  const aviso = p.sinAlertas
    ? `<div class="msg ${dashLoading() ? '' : 'err'} ag-aviso">${dashLoading() ? 'Cargando alertas…' : 'Alertas no disponibles: se muestran solo los trasiegos.'}</div>`
    : '';
  sec.innerHTML = `
<div class="ag">
  ${_htmlBarra(p)}
  ${aviso}
  <div class="ag-cuerpo">
    <aside class="ag-bandeja" aria-label="Alertas para analizar">${_htmlBandeja(p)}</aside>
    <div class="ag-cal">${_modo === 'semana' ? _htmlSemana(p, porFecha) : _htmlMes(p, porFecha)}</div>
  </div>
  ${_diaAbierto ? _htmlPanelDia(porFecha.get(_diaAbierto), _diaAbierto) : ''}
</div>`;
  if (!_montado){
    sec.addEventListener('click', _alClic);
    sec.addEventListener('keydown', _alTecla);
    _montado = true;
  }
}
registrarVista('agenda', renderAgenda);

/* ---------- barra ---------- */

function _htmlBarra(p){
  const seg = (grupo, v, txt, on) =>
    `<button type="button" class="ag-seg${on ? ' on' : ''}" data-ag-${grupo}="${v}" aria-pressed="${on}">${txt}</button>`;
  const titulo = _modo === 'semana'
    ? `Semana del ${ddmm(_ancla)} al ${ddmm(sumarDias(_ancla, 6))}`
    : `${MESES[Number(_ancla.slice(5, 7)) - 1]} ${_ancla.slice(0, 4)}`;
  return `<div class="ag-barra">
  <div class="ag-nav">
    <button type="button" class="btn" data-ag-nav="-1" aria-label="Anterior">←</button>
    <button type="button" class="btn" data-ag-nav="0">Hoy</button>
    <button type="button" class="btn" data-ag-nav="1" aria-label="Siguiente">→</button>
    <h2 class="ag-titulo">${esc(titulo)}</h2>
  </div>
  <div class="ag-segs" role="group" aria-label="Vista">${seg('modo', 'semana', 'Semana', _modo === 'semana')}${seg('modo', 'mes', 'Mes', _modo === 'mes')}</div>
  <div class="ag-segs" role="group" aria-label="Mostrar">${seg('filtro', 'ambos', 'Ambos', _filtro === 'ambos')}${seg('filtro', 'analisis', 'Análisis', _filtro === 'analisis')}${seg('filtro', 'trasiegos', 'Trasiegos', _filtro === 'trasiegos')}</div>
  <span class="ag-cupos">Cupo diario: <b>${p.cfg.cupo_analisis}</b> análisis · <b>${p.cfg.cupo_trasiegos}</b> trasiegos</span>
</div>`;
}

/* ---------- bandeja ---------- */

function _htmlBandeja(p){
  const grupos = [1, 2, 3, 4].map(n => {
    const items = p.bandeja.analisis.filter(i => i.prioridad === n);
    if (!items.length) return '';
    return `<details class="ag-grupo" open><summary><span class="ag-p p${n}"></span>${esc(GRUPOS_ANALISIS[n])} <b>${items.length}</b></summary>${items.map(_htmlFilaA).join('')}</details>`;
  }).join('');
  const tr = p.bandeja.trasiegos;
  const trHtml = tr.length
    ? `<details class="ag-grupo"><summary><span class="ag-p tr"></span>Trasiegos vencidos <b>${tr.length}</b></summary>${tr.map(_htmlFilaT).join('')}</details>`
    : '';
  const vacio = p.sinAlertas ? '' : '<p class="ag-vacio">Sin alertas pendientes.</p>';
  return `<h3 class="ag-h">Alertas para analizar</h3>${grupos || vacio}${trHtml}`;
}

function _cuando(i){
  if (i.programado) return `📅 ${ddmm(i.programado)}`;
  return i.sinLugar ? '⚠ sin lugar' : '';
}

function _htmlFilaA(i){
  const extra = (i.atraso ? ` · ${i.atraso} d de atraso` : '') + (i.etiquetas.length ? ' · ' + i.etiquetas.join(', ') : '');
  return `<button type="button" class="ag-fila${_resaltado === i.lote ? ' res' : ''}" data-ag-lote="${escA(i.lote)}" data-ag-fecha="${escA(i.programado || '')}">
<span class="ag-lote">${esc(i.lote)}</span><span class="ag-var">${esc(i.variedad)}</span>
<span class="ag-mot">${esc(i.motivo + extra)}</span><span class="ag-cuando">${_cuando(i)}</span></button>`;
}

function _htmlFilaT(t){
  return `<button type="button" class="ag-fila pr-${t.prioridad}${_resaltado === t.lote ? ' res' : ''}" data-ag-lote="${escA(t.lote)}" data-ag-fecha="${escA(t.programado || '')}">
<span class="ag-lote"><span class="ag-punto"></span>${esc(t.lote)}</span><span class="ag-var">${esc(t.variedad)}</span>
<span class="ag-mot">${esc(_textoTrasiego(t))}</span><span class="ag-cuando">${_cuando(t)}</span></button>`;
}

function _textoTrasiego(t){
  const pr = `Prioridad ${PRIO[t.prioridad]}`;
  if (t.enCurso) return `${pr} · en curso (OT ${t.enCurso.ot || 's/n'})`;
  if (t.sinBase) return `${pr} · sin fecha base`;
  const cuando = t.d >= 0 ? `vencido hace ${t.d} d` : `vence en ${-t.d} d`;
  return `${pr} · ${cuando} · último movimiento ${ddmm(t.base)}`;
}

/* ---------- calendario ---------- */

function _htmlSemana(p, porFecha){
  const dias = Array.from({ length: 7 }, (_, k) => sumarDias(_ancla, k));
  return `<div class="ag-semana">${dias.map(f => _htmlDia(porFecha.get(f), f, false, p.hoy, false)).join('')}</div>`;
}

function _htmlMes(p, porFecha){
  const primero = _ancla.slice(0, 8) + '01';
  const mes = primero.slice(0, 7);
  const inicio = lunesDe(primero);
  const celdas = [];
  for (let k = 0; k < 42; k++){
    const f = sumarDias(inicio, k);
    if (k % 7 === 0 && k > 0 && f.slice(0, 7) > mes) break;
    celdas.push(_htmlDia(porFecha.get(f), f, true, p.hoy, f.slice(0, 7) !== mes));
  }
  const cab = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(x => `<span>${x}</span>`).join('');
  return `<div class="ag-cabmes" aria-hidden="true">${cab}</div><div class="ag-mes">${celdas.join('')}</div>`;
}

function _barra(nombre, n, cupo, exc){
  const pct = cupo ? Math.min(100, Math.round(n * 100 / cupo)) : (n ? 100 : 0);
  return `<div class="ag-carga${exc ? ' exc' : ''}"><span>${nombre} <b>${n}/${cupo}</b></span><i style="width:${pct}%"></i></div>`;
}

function _htmlDia(d, f, compacto, hoy, fuera){
  const dow = diaSemana(f);
  const habil = d ? d.habil : (dow !== 0 && dow !== 6);
  const todos = d ? d.analisis.concat(d.trasiegos) : [];
  const cls = ['ag-dia', habil ? '' : 'nohabil', f === hoy ? 'hoy' : '', f < hoy ? 'pasado' : '',
               fuera ? 'fuera' : '', _resaltado && todos.some(i => i.lote === _resaltado) ? 'res' : '']
    .filter(Boolean).join(' ');
  const fer = d && d.feriado ? `<span class="ag-fer" title="${escA(d.feriado)}">${esc(d.feriado)}</span>` : '';
  const cab = `<div class="ag-cab"><span>${DIAS[dow]} <b>${f.slice(8, 10)}</b>${compacto ? '' : '/' + f.slice(5, 7)}</span>${fer}</div>`;
  if (!d) return `<div class="${cls}">${cab}</div>`;

  const verA = _filtro !== 'trasiegos', verT = _filtro !== 'analisis';
  let cuerpo = '';
  if (verA && (d.habil || d.analisis.length)) cuerpo += _barra('Análisis', d.analisis.length, d.cupoA, d.excedidoA);
  if (verT && (d.habil || d.trasiegos.length)) cuerpo += _barra('Trasiegos', d.trasiegos.length, d.cupoT, d.excedidoT);
  if (verT) cuerpo += compacto
    ? d.trasiegos.map(t => `<span class="ag-mini pr-${t.prioridad}${_resaltado === t.lote ? ' res' : ''}">${esc(t.lote)}</span>`).join('')
    : d.trasiegos.map(_htmlTarjeta).join('');
  if (verA && !compacto && d.analisis.length) cuerpo += `<div class="ag-fichas">${d.analisis.map(_htmlFicha).join('')}</div>`;
  const etiqueta = `${DIAS[dow]} ${ddmm(f)}: ${d.analisis.length} análisis, ${d.trasiegos.length} trasiegos`;
  return `<div class="${cls}" data-ag-dia="${f}" role="button" tabindex="0" aria-label="${escA(etiqueta)}">${cab}${cuerpo}</div>`;
}

function _htmlTarjeta(t){
  const meta = [t.barriles ? `${t.barriles} barr.` : '', t.enCurso ? 'en curso' : '', t.atrasado ? 'atrasado' : '']
    .filter(Boolean).join(' · ');
  return `<div class="ag-tarj pr-${t.prioridad}${_resaltado === t.lote ? ' res' : ''}" title="${escA(_textoTrasiego(t))}">
<span class="ag-punto"></span><b>${esc(t.lote)}</b> <span class="ag-var">${esc(t.variedad)}</span>${meta ? `<span class="ag-meta">${esc(meta)}</span>` : ''}</div>`;
}

function _htmlFicha(i){
  return `<span class="ag-ficha p${i.prioridad}${_resaltado === i.lote ? ' res' : ''}" title="${escA(i.lote + ' · ' + i.motivo)}">${esc(i.lote)}</span>`;
}

/* ---------- panel del dia ---------- */

function _htmlPanelDia(d, f){
  const titulo = `${DIAS[diaSemana(f)]} ${ddmm(f)}${d && d.feriado ? ' · ' + d.feriado : ''}`;
  const cab = `<div class="ag-panel-cab"><h3>${esc(titulo)}</h3><button type="button" class="btn" data-ag-cerrar aria-label="Cerrar">✕</button></div>`;
  if (!d) return `<div class="ag-panel" role="dialog" aria-label="${escA(titulo)}">${cab}<p class="ag-vacio">Fuera del horizonte planificado.</p></div>`;
  const an = d.analisis, tr = d.trasiegos;
  const liA = an.map(i => `<li><span class="ag-p p${i.prioridad}"></span><b>${esc(i.lote)}</b> <span class="ag-var">${esc(i.variedad)}</span> <span class="ag-mot">${esc(i.motivo)}</span></li>`).join('');
  const liT = tr.map(t => `<li class="pr-${t.prioridad}"><span class="ag-punto"></span><b>${esc(t.lote)}</b> <span class="ag-var">${esc(t.variedad)}</span> <span class="ag-mot">${esc(_textoTrasiego(t))}</span>${t.enCurso ? '' : `<button type="button" class="btn" data-ag-ot="${escA(t.lote)}">Emitir OT</button>`}</li>`).join('');
  return `<div class="ag-panel" role="dialog" aria-label="${escA(titulo)}">${cab}
<section><h4>Análisis · ${an.length}/${d.cupoA}</h4>
${an.length ? `<button type="button" class="btn primary" data-ag-orden="${f}">📝 Armar orden de muestras del día</button>` : ''}
<ul class="ag-lista">${liA || '<li class="ag-vacio">Nada programado.</li>'}</ul></section>
<section><h4>Trasiegos · ${tr.length}/${d.cupoT}</h4>
<ul class="ag-lista">${liT || '<li class="ag-vacio">Nada programado.</li>'}</ul></section>
</div>`;
}

/* ---------- eventos ---------- */

function _moverMes(f, n){
  const m0 = Number(f.slice(5, 7)) - 1 + n;
  const y = Number(f.slice(0, 4)) + Math.floor(m0 / 12);
  const m = ((m0 % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

function _alClic(e){
  const el = e.target.closest('[data-ag-nav],[data-ag-modo],[data-ag-filtro],[data-ag-lote],[data-ag-orden],[data-ag-ot],[data-ag-cerrar],[data-ag-dia]');
  if (!el) return;
  const ds = el.dataset;
  if (ds.agNav !== undefined){
    const n = Number(ds.agNav);
    if (n === 0) _ancla = _modo === 'semana' ? lunesDe(_plan.hoy) : _plan.hoy;
    else _ancla = _modo === 'semana' ? sumarDias(_ancla, 7 * n) : _moverMes(_ancla, n);
  } else if (ds.agModo){
    _modo = ds.agModo;
    if (_modo === 'semana') _ancla = lunesDe(_ancla);
  } else if (ds.agFiltro){
    _filtro = ds.agFiltro;
  } else if (ds.agLote !== undefined){
    _resaltado = _resaltado === ds.agLote ? '' : ds.agLote;
    if (_resaltado && ds.agFecha) _ancla = _modo === 'semana' ? lunesDe(ds.agFecha) : ds.agFecha;
  } else if (ds.agOrden){
    const d = _plan.dias.find(x => x.fecha === ds.agOrden);
    _diaAbierto = null;
    precargarOrden(d ? d.analisis.map(i => i.lote) : []);
    return;
  } else if (ds.agOt){
    emitirOTDesdeAgenda([ds.agOt]);
    return;
  } else if (ds.agCerrar !== undefined){
    _diaAbierto = null;
  } else if (ds.agDia){
    _diaAbierto = ds.agDia;
  }
  renderAgenda();
}

function _alTecla(e){
  if (e.key === 'Escape' && _diaAbierto){ _diaAbierto = null; renderAgenda(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-ag-dia]')){
    e.preventDefault();
    _diaAbierto = e.target.dataset.agDia;
    renderAgenda();
  }
}
```

- [ ] **Step 3: CSS** (al final del `<style>` principal de `index.html`)

Punto de partida. Ajustarlo con `frontend-design` sin salir de los tokens:

```css
/* ===== Agenda ===== */
.ag{display:flex;flex-direction:column;gap:12px}
.ag-barra{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}
.ag-nav{display:flex;gap:6px;align-items:center}
.ag-titulo{font-family:var(--serif);font-size:1.15rem;margin:0 0 0 8px;font-weight:600}
.ag-segs{display:inline-flex;border:1px solid var(--line);border-radius:var(--r-pill);overflow:hidden;background:var(--panel)}
.ag-seg{border:0;background:transparent;padding:5px 12px;font:inherit;color:var(--muted);cursor:pointer}
.ag-seg.on{background:var(--accent-soft);color:var(--accent);font-weight:600}
.ag-cupos{margin-left:auto;color:var(--muted);font-size:.85rem}
.ag-cuerpo{display:grid;grid-template-columns:300px 1fr;gap:14px;align-items:start}
.ag-bandeja{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);padding:10px;max-height:calc(100vh - 220px);overflow:auto;position:sticky;top:8px}
.ag-h{font-family:var(--serif);font-size:1rem;margin:2px 4px 8px}
.ag-grupo{margin-bottom:6px}
.ag-grupo>summary{cursor:pointer;padding:6px 4px;font-weight:600;display:flex;gap:6px;align-items:center}
.ag-grupo>summary b{margin-left:auto;color:var(--muted)}
.ag-fila{display:grid;grid-template-columns:auto 1fr auto;gap:2px 8px;width:100%;text-align:left;border:0;border-radius:var(--r-sm);background:transparent;padding:6px 8px;font:inherit;cursor:pointer}
.ag-fila:hover{background:var(--panel2)}
.ag-fila.res{background:var(--accent-soft);outline:1px solid var(--accent-line)}
.ag-lote{font-weight:700;font-variant-numeric:tabular-nums}
.ag-var{color:var(--muted)}
.ag-mot{grid-column:1/3;font-size:.82rem;color:var(--txt)}
.ag-cuando{grid-row:1/3;grid-column:3;align-self:center;font-size:.8rem;color:var(--muted);white-space:nowrap}
.ag-p{display:inline-block;width:9px;height:9px;border-radius:50%;flex:none}
.ag-p.p1{background:var(--nook)} .ag-p.p2{background:var(--warn)} .ag-p.p3{background:var(--info)}
.ag-p.p4{background:var(--sc-1)} .ag-p.p5{background:var(--line)} .ag-p.tr{background:var(--accent)}
.ag-semana{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.ag-cabmes{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;color:var(--muted);font-size:.8rem;padding:0 4px}
.ag-mes{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.ag-dia{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);padding:8px;min-height:120px;display:flex;flex-direction:column;gap:6px;cursor:pointer}
.ag-mes .ag-dia{min-height:96px}
.ag-dia:hover{box-shadow:var(--sh-sm)}
.ag-dia:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ag-dia.hoy{border-color:var(--accent);box-shadow:inset 0 3px 0 var(--accent)}
.ag-dia.nohabil{background:var(--panel2);color:var(--muted)}
.ag-dia.pasado{opacity:.6}
.ag-dia.fuera{opacity:.45}
.ag-dia.res{outline:2px solid var(--accent-line)}
.ag-cab{display:flex;justify-content:space-between;gap:6px;font-size:.85rem}
.ag-fer{font-size:.72rem;color:var(--accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ag-carga{position:relative;font-size:.75rem;background:var(--panel2);border-radius:var(--r-sm);padding:2px 6px;overflow:hidden}
.ag-carga span{position:relative;z-index:1}
.ag-carga i{position:absolute;inset:0 auto 0 0;background:var(--accent-soft)}
.ag-carga.exc{color:var(--nook);font-weight:600}
.ag-carga.exc i{background:rgba(176,58,46,.15)}
.ag-tarj{border:1px solid var(--line);border-left-width:4px;border-radius:var(--r-sm);padding:4px 6px;font-size:.8rem;background:var(--panel)}
.ag-tarj .ag-meta{display:block;color:var(--muted);font-size:.72rem}
.pr-alta{border-left-color:var(--nook)} .pr-media{border-left-color:var(--warn)} .pr-baja{border-left-color:var(--ok)}
.ag-punto{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;background:var(--muted)}
.pr-alta .ag-punto{background:var(--nook)} .pr-media .ag-punto{background:var(--warn)} .pr-baja .ag-punto{background:var(--ok)}
.ag-fichas{display:flex;flex-wrap:wrap;gap:3px}
.ag-ficha{font-size:.7rem;padding:1px 5px;border-radius:var(--r-pill);background:var(--panel2);font-variant-numeric:tabular-nums}
.ag-ficha.p1{background:rgba(176,58,46,.14)} .ag-ficha.p2{background:rgba(176,125,44,.16)} .ag-ficha.p3{background:rgba(91,123,134,.16)}
.ag-ficha.p5{color:var(--muted)}
.ag-ficha.res,.ag-mini.res{outline:2px solid var(--accent)}
.ag-mini{font-size:.7rem;border-left:3px solid;padding-left:4px}
.ag-panel{position:fixed;top:0;right:0;bottom:0;width:min(420px,100vw);background:var(--panel);border-left:1px solid var(--line);box-shadow:var(--sh-lg);padding:16px;overflow:auto;z-index:50;display:flex;flex-direction:column;gap:14px}
.ag-panel-cab{display:flex;justify-content:space-between;align-items:center}
.ag-panel-cab h3{font-family:var(--serif);margin:0}
.ag-panel h4{margin:0 0 8px}
.ag-lista{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}
.ag-lista li{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;padding:6px;border-radius:var(--r-sm);background:var(--panel2)}
.ag-lista li .btn{margin-left:auto}
.ag-vacio{color:var(--muted);font-style:italic}
@media (max-width:900px){
  .ag-cuerpo{grid-template-columns:1fr}
  .ag-bandeja{position:static;max-height:none}
  .ag-semana{grid-template-columns:1fr}
  .ag-cupos{margin-left:0}
}
```

- [ ] **Step 4: Chequeo rápido**

Run: `node --check public/lotes/js/vista-agenda.js` → sin salida. `npm test` → todo PASS.

- [ ] **Step 5: Commit**

```bash
git add public/lotes/js/vista-agenda.js public/lotes/index.html public/lotes/app.js public/lotes/js/nucleo.js
git commit -m "feat(lotes): pestaña Agenda (bandeja de alertas + calendario semana/mes + panel del día)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sección Agenda en Configuración

**Files:**
- Create: `public/lotes/js/vista-config-agenda.js`
- Modify: `public/lotes/index.html` (dentro de `<section class="view" id="tab-config">`, al final: `<div id="cfgAgenda" class="ag-cfg"></div>`; CSS mínimo)
- Modify: `public/lotes/js/vista-config.js` (import y llamada al final de `renderConfig()`)

**Interfaces:**
- Consumes: `configAgenda`, `fijarParametro`, `agregarFeriado`, `quitarFeriado`, `restaurarFeriados` (Task 2).
- Produces: `renderConfigAgenda()`.

- [ ] **Step 1: Crear `public/lotes/js/vista-config-agenda.js`**

```js
/* ===== Lotes CIW — Configuracion > Agenda =====
 * Cupos, plazos y feriados de la Agenda. Toda la validacion vive en
 * agenda-dias.js (testeada); aca solo se dibuja y se llama markDirty. */
'use strict';

import { $, esc, escA, DATOS, markDirty } from './nucleo.js';
import { configAgenda, fijarParametro, agregarFeriado, quitarFeriado, restaurarFeriados } from './agenda-dias.js';

const PARAMS = [
  { k: 'cupo_analisis', label: 'Análisis por día' },
  { k: 'cupo_trasiegos', label: 'Trasiegos (lotes) por día' },
  { k: 'dias_trasiego', label: 'Días entre trasiegos' },
  { k: 'aviso_dias', label: 'Aviso "próximo a vencer" (días)' },
  { k: 'horizonte_semanas', label: 'Semanas de calendario' },
];

let _montado = false;
let _msg = '';

export function renderConfigAgenda(){
  const box = $('cfgAgenda');
  if (!box) return;
  const cfg = configAgenda(DATOS().config);
  box.innerHTML = `
<h3>📅 Agenda</h3>
<div class="ag-cfg-params">${PARAMS.map(p => `<label>${esc(p.label)}
  <input class="txt" type="number" min="0" step="1" data-ag-cfg="${p.k}" value="${escA(cfg[p.k])}"></label>`).join('')}</div>
<h4>Feriados (días que no se trabaja)</h4>
<p class="ag-cfg-nota">Precargados los nacionales de 2026 y 2027. Revisá los trasladables y los puentes de cada año, y sumá los de la bodega o de Mendoza.</p>
<table class="ag-cfg-fer"><thead><tr><th>Fecha</th><th>Nombre</th><th></th></tr></thead><tbody>
${cfg.feriados.map(f => `<tr><td>${esc(f.fecha)}</td><td>${esc(f.nombre)}</td><td><button type="button" class="btn" data-ag-fer-quitar="${escA(f.fecha)}">Quitar</button></td></tr>`).join('')}
</tbody></table>
<div class="ag-cfg-alta">
  <input class="txt" type="date" id="agFerFecha" aria-label="Fecha del feriado">
  <input class="txt" id="agFerNombre" placeholder="Nombre" aria-label="Nombre del feriado">
  <button type="button" class="btn" data-ag-fer-agregar>Agregar</button>
  <button type="button" class="btn" data-ag-fer-restaurar>Restaurar precargados</button>
  <span class="ag-cfg-msg" role="status">${esc(_msg)}</span>
</div>`;
  _msg = '';
  if (!_montado){
    box.addEventListener('change', _alCambiar);
    box.addEventListener('click', _alClic);
    _montado = true;
  }
}

function _alCambiar(e){
  const k = e.target.dataset && e.target.dataset.agCfg;
  if (!k) return;
  if (fijarParametro(DATOS(), k, e.target.value)) markDirty();
  else _msg = 'Valor inválido: tiene que ser un número entero.';
  renderConfigAgenda();
}

function _alClic(e){
  const el = e.target.closest('[data-ag-fer-quitar],[data-ag-fer-agregar],[data-ag-fer-restaurar]');
  if (!el) return;
  const ds = el.dataset;
  if (ds.agFerQuitar){
    if (quitarFeriado(DATOS(), ds.agFerQuitar)) markDirty();
  } else if (ds.agFerAgregar !== undefined){
    const fecha = ($('agFerFecha') || {}).value || '';
    const nombre = ($('agFerNombre') || {}).value || '';
    if (agregarFeriado(DATOS(), fecha, nombre)) markDirty();
    else _msg = 'Fecha inválida o ya cargada.';
  } else if (ds.agFerRestaurar !== undefined){
    if (!confirm('¿Reemplazar la lista por los feriados precargados?')) return;
    restaurarFeriados(DATOS());
    markDirty();
  }
  renderConfigAgenda();
}
```

- [ ] **Step 2: Enganchar en `vista-config.js` e `index.html`**

`vista-config.js`: `import { renderConfigAgenda } from './vista-config-agenda.js';` y como última línea de `renderConfig()`: `renderConfigAgenda();`.

`index.html`: dentro de `#tab-config`, al final, `<div id="cfgAgenda" class="ag-cfg"></div>`. CSS (junto al de la Agenda):

```css
.ag-cfg{margin-top:28px;padding-top:18px;border-top:1px solid var(--line)}
.ag-cfg h3{font-family:var(--serif)}
.ag-cfg-params{display:flex;flex-wrap:wrap;gap:12px 20px;margin-bottom:16px}
.ag-cfg-params label{display:flex;flex-direction:column;gap:4px;font-size:.85rem;color:var(--muted)}
.ag-cfg-params input{width:110px}
.ag-cfg-nota{color:var(--muted);font-size:.85rem;margin:0 0 8px}
.ag-cfg-fer{border-collapse:collapse;margin-bottom:10px}
.ag-cfg-fer td,.ag-cfg-fer th{padding:4px 10px;border-bottom:1px solid var(--line-soft);text-align:left}
.ag-cfg-alta{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ag-cfg-msg{color:var(--nook);font-size:.85rem}
```

- [ ] **Step 3: Chequeo**

Run: `node --check public/lotes/js/vista-config-agenda.js` y `npm test` → PASS.

- [ ] **Step 4: Commit**

```bash
git add public/lotes/js/vista-config-agenda.js public/lotes/js/vista-config.js public/lotes/index.html
git commit -m "feat(lotes): sección Agenda en Configuración (cupos, plazos y feriados)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verificación en el navegador, revisión y merge

**Files:**
- Create (fuera del repo, en el scratchpad de la sesión): `mock-agenda.mjs`
- Modify (fuera del repo): `C:\Users\Bmax\OneDrive - BODEGAS ESMERALDA SA\Escritorio\claude\.claude\launch.json` (entrada `lotes-agenda`, puerto 8811)

- [ ] **Step 1: Servidor de prueba sin login**

Mismo patrón que `mock-ot-carpeta.mjs` (memoria `lotes-grilla-copiar-foco`): un `http.createServer` que sirve `C:/Users/Bmax/repos/catenainstitute-agenda/public` y responde `/lotes/api/*`. Datos: `datos-origen/lotes-datos.json` del worktree (GET `datos` lo devuelve, POST `datos` lo reemplaza en memoria y sube `meta.version`). `/lotes/api/dashboard`: el motor TS no corre en Node pelado, así que el mock arma filas sintéticas deterministas para los lotes con `litros_actuales > 0`:
- `ultima_fecha_control` = fecha del último análisis del lote;
- `frecuencia_max: 15`;
- `alarmas` según `Number(lote) % 9`: 0 → `['av_alerta']`, 1 → `['frecuencia_vencida']`, 2 → `['reanalisis_correccion']`, 3 → `['sin_analisis_valido']`; el resto → `[]`;
- `activo: true`, más `variedad`.

Responder también `version`, `estado` (`{avisos:[]}`), `barriles` (`{barriles:[],version:1}`), `info`, y `/api/yo`, como el mock de referencia. Sumar la entrada a `launch.json`:

```json
{ "name": "lotes-agenda", "runtimeExecutable": "node", "runtimeArgs": ["<scratchpad>/mock-agenda.mjs"], "port": 8811 }
```

- [ ] **Step 2: Recorrido con `preview_start {name:'lotes-agenda'}` en `/lotes/`**

Verificar con `read_page` / `read_console_messages` / `computer`, sin errores de consola:
1. La pestaña 📅 Agenda aparece y dibuja la bandeja con grupos y conteos.
2. Semana: el lunes 12/10 sale gris con "Día del Respeto a la Diversidad Cultural"; sábado y domingo grises; ningún ítem en días no hábiles; barras `n/55` y `n/4`.
3. Mes: contadores y mini-tarjetas; ← → cambia de mes; Hoy vuelve.
4. Filtros Análisis / Trasiegos / Ambos ocultan y muestran lo que corresponde.
5. Clic en una fila de la bandeja: navega a la semana de su día y la resalta.
6. Clic en un día: abre el panel; Escape lo cierra; Enter sobre un día con foco lo abre.
7. "Armar orden de muestras del día": abre Orden de muestras con esos lotes en "Hoja en blanco".
8. "Emitir OT" en un trasiego: abre Movimientos › Órdenes de trabajo con el formulario y el lote agregado.
9. Configuración › Agenda: cambiar el cupo de trasiegos a 2 → la Agenda muestra `/2`; agregar un feriado en un día hábil próximo → ese día pasa a gris y los ítems se corren; un valor inválido muestra el mensaje.
10. `resize_window` a `mobile`: una columna, sin scroll horizontal; volver a `desktop`.

Sacar captura de la Semana y del panel del día como prueba.

- [ ] **Step 3: Suite, tipos y revisión**

Run: `npm test` (comparar la cantidad con la línea de base de la Task 0: tiene que haber más tests y ninguno rojo), `npx tsc --noEmit`.
Pedir revisión con la skill `superpowers:requesting-code-review` sobre el diff `main..feat/lotes-agenda` y aplicar lo que corresponda.

- [ ] **Step 4: Merge a `main` y push**

```bash
cd /c/Users/Bmax/repos/catenainstitute
git status            # tiene que estar limpio y en main
git pull --ff-only
git merge --no-ff feat/lotes-agenda -m "Merge feat/lotes-agenda: Agenda de Lotes, etapa 1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm test
git push origin main
```

Verificar CI con `gh run list --limit 3` (si `gh` no está en el PATH: `$env:Path += ";C:\Program Files\GitHub CLI"`).

- [ ] **Step 5: Pedirle el deploy al usuario**

Decirle explícitamente que desde `C:\Users\Bmax\repos\catenainstitute`, con `main` limpio (`git status`), corra en `cmd.exe`:

```
cd /d C:\Users\Bmax\repos\catenainstitute
npx.cmd wrangler deploy
```

Y que en la web revise Configuración › Agenda → Feriados (trasladables y puentes).
