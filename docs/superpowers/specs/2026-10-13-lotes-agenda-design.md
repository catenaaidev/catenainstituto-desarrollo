# Agenda de Lotes: alertas para analizar + cronograma de análisis y trasiegos

Fecha: 2026-10-13 · Módulo: Lotes (web) · Estado: diseño aprobado en chat, pendiente de revisión escrita

## Problema

Hoy el equipo no tiene un lugar donde ver **qué hay que analizar y qué hay que
trasegar, y cuándo**:

- Las alertas existen (11 condiciones en `src/lotes/motores/fml.ts:97`), pero
  están repartidas en Dashboard, Tablero FML y la ficha, y no hay una lista de
  trabajo "esto hay que analizar".
- Después de una corrección de SO₂ nadie recuerda pedir el re-análisis: no hay
  alerta que lo pida.
- La regla de trasegar cada 3 meses no está en ningún lado: no hay fechas
  planificadas, solo el registro de lo ya hecho (`movimientos[]`).
- El laboratorio puede hacer **50–60 análisis por día** y la bodega **~4
  trasiegos (lotes) por día**; nada ayuda a repartir la carga respetando esos
  cupos, fines de semana y feriados.

## Objetivo

Una pestaña nueva **📅 Agenda** en la web de Lotes que reúne:

1. la bandeja **Alertas para analizar** (lotes que necesitan un análisis nuevo),
2. un **calendario** con el cronograma de análisis y el de trasiegos juntos,
   repartido automáticamente con cupos diarios, días hábiles y prioridades,
3. **arrastrar** lotes a otros días para ajustar lo propuesto,

conectada con lo existente (Orden de muestras, Emitir OT, carga de análisis,
confirmación de OT) para que sea un solo sistema.

## No objetivos

- No se guarda el plan completo: se calcula (ver Arquitectura).
- No se planifican otras tareas (agregados, descubes, embotellado).
- No hay notificaciones por mail/push.
- No se toca Prensas ni Barriles.

## Decisiones del usuario (2026-10-13)

| # | Tema | Decisión |
|---|------|----------|
| 1 | Qué entra en "Alertas para analizar" | Solo lo que pide un análisis nuevo (ver Reglas §1) |
| 2 | Cómo se arma el cronograma de análisis | Propuesta automática; lo que se mueve a mano queda fijado |
| — | Orden de prioridad de análisis | AV/caída SO₂ → vencidos → re-análisis → próximos a vencer |
| — | Capacidad de análisis | 50–60 por día (cupo configurable, default 55) |
| 3 | Desde cuándo cuentan los 3 meses | Desde el último movimiento real ejecutado |
| 4 | A qué lotes aplica la regla de trasiego | Solo lotes en barricas; tanques solo si se agregan a mano |
| 5 | Prioridad de trasiego | Automática por fecha; se puede cambiar a mano (queda fija) |
| 6 | Ubicación de trasiegos | En su fecha de vencimiento, con cupo de lotes por día (default 4), variable por día |
| 7 | Conexión con el sistema | Todo conectado: orden de muestras, emitir OT, cierre automático |
| 8 | Días hábiles | Lunes a viernes + lista de feriados editable |
| — | Arquitectura | Enfoque 1: el plan se calcula, solo se guardan decisiones humanas |

## Reglas

### §1 Ítems de análisis

Un lote **activo** (`litros_actuales > 0`) genera un ítem de análisis con el
motivo de mayor prioridad que cumpla; los demás motivos se muestran como
etiquetas.

| Prioridad | Motivo | Fuente | Fecha objetivo |
|---|---|---|---|
| 1 | AV en alerta / caída de SO₂ | condiciones `av_alerta`, `so2_caida_alerta` | hoy (urgente) |
| 2 | Vencido / sin análisis válido | `frecuencia_vencida`, `sin_analisis_valido` | hoy (urgente) |
| 3 | Re-análisis post-corrección | condición nueva `reanalisis_correccion` | hoy (urgente) |
| 4 | Próximo a vencer | `frecuencia_max − dias_desde_control ≤ aviso_dias` (5) | fecha de vencimiento |
| 5 | Control programado (solo calendario, no bandeja) | último control + `frecuencia_max` dentro del horizonte | fecha de vencimiento |

La **bandeja** muestra prioridades 1–4. El **calendario** muestra 1–5 (la 5 en
tono tenue): sin la proyección de controles programados el cupo diario no sirve
para planificar.

### §2 Condición nueva `reanalisis_correccion` (servidor)

Se agrega a `CONDICIONES` en `src/lotes/motores/fml.ts` y su función en
`fml-condiciones.ts`, reutilizando `ultimaCorreccion` / `ultimoSo2Posterior`
(`src/lotes/motores/correccion.ts:239,285`).

Se activa cuando:

- existe una corrección **real** del lote (`correccion.ot_n` no vacío y sin
  `anulada`), y
- `hoy ≥ correccion.fecha + REANALISIS_DIAS` (constante 3 en el motor; la
  corrección guarda solo el día, por eso "72 h" = 3 días), y
- no hay ningún análisis con `so2_libre` medido y `fecha_analisis >
  correccion.fecha`.

`desde` = `correccion.fecha + REANALISIS_DIAS`. Es una constante y no un
parámetro de `config.agenda`: el motor del servidor recibe la config ya
aplanada a `criterios_fml` (`normalizarConfig`) y no ve `config.agenda`.
La lógica de "última corrección real" y "SO₂ posterior" se mueve de
`correccion.ts` a un módulo base compartido (`correcciones-base.ts`) para que
fml.ts la use sin ciclo de imports (correccion.ts ya importa fml.ts). Al ser una condición del motor
aparece también en Dashboard, Tablero y ficha, como las otras.

### §3 Ítems de trasiego

- Aplica a lotes activos **en barricas**: `cap225 > 0` o `cap500 > 0` o
  `vasija_actual` contiene "barric" (coinciden en los 174 lotes activos de los
  datos; `cap200` son tanques t200, no barricas) **más** los tanques agregados a mano (`agenda`, clase
  `tanque`).
- **Base**: fecha del último movimiento **ejecutado** del lote con `tipo` ∈
  {`trasiego`, `descube`, `traspaso`} (estado ausente = ejecutado, como en
  `movimientos.ts`). Cuenta el movimiento si el lote es `lote` o `lote_destino`. Si no hay
  ninguno: `fecha_ingreso`, si falta `historial_etapas[0].desde`, si falta el
  primer análisis.
- **Vencimiento** = base + frecuencia de trasiego del lote: columna
  "Trasiego cada (d)" (`frecuencia_trasiego`, default 90) de la tabla de
  criterios de Configuración, con la precedencia de siempre (proyecto pisa a
  variedad, variedad al general; un valor inválido cae al general). Agregado
  el 2026-10-14 a pedido del usuario.
- **Prioridad automática** (`d` = días desde el vencimiento; negativo = falta):
  - `alta` si `d > 15`
  - `media` si `-15 ≤ d ≤ 15`
  - `baja` si `d < -15`
- **Prioridad manual** (`agenda`, clase `prioridad`) gana sobre la automática
  hasta que se cumple el trasiego (§5).
- **En curso**: si el lote tiene un movimiento de trasiego `pendiente` (OT
  emitida sin confirmar), el ítem se muestra en la fecha de la OT con marca
  "en curso" y no se reprograma; no consume cupo de otro día.

### §4 Días hábiles

- Lunes a viernes, excepto las fechas de `config.agenda.feriados`.
- La lista viene precargada con los feriados nacionales de Argentina 2026 y
  2027 (fechas trasladables según la ley 27.399; **el usuario las verifica en
  Configuración** al primer uso). Cada entrada: `{fecha, nombre}`.
- El reparto automático nunca usa días no hábiles. Arrastrar a mano a un día no
  hábil se permite con confirmación y queda marcado.

### §5 Caducidad de decisiones

Una decisión humana (`fijado`, `prioridad`) vale **hasta que se cumple**:

- análisis: entra un análisis del lote con `fecha_analisis ≥` fecha de creación
  de la decisión (`el`, día);
- trasiego: entra un movimiento real ejecutado (§3) con `fecha ≥` `el`.

A partir de ahí el motor la ignora. **No se poda automáticamente**: el freno
de borrado masivo (≥10 filas y >20 % de la sección en un guardado) saltaría
si se limpian muchas juntas; quedan como historia inofensiva. Lo mismo
si el lote se vació o se borró. Los `cupo` caducan cuando su fecha pasó; los
`tanque` duran hasta que se quitan a mano o el lote se vacía.

## Arquitectura

**El plan se calcula; solo se guardan decisiones humanas.**

```
/dashboard (servidor: condiciones FML + reanalisis_correccion)
        │
        ▼
public/lotes/js/agenda.js  ── planificar(entrada) → calendario   (puro, testeable)
        ▲          ▲
   datos.agenda   datos.config.agenda + movimientos + analisis + lotes + hoy
        │
public/lotes/js/vista-agenda.js  (pestaña: bandeja + calendario + panel del día)
public/lotes/js/agenda-arrastre.js (arrastre por pointer events)
```

### Datos

**`datos.config.agenda`** (objeto, editable en Configuración):

```js
{
  cupo_analisis: 55,      // análisis por día hábil
  cupo_trasiegos: 4,      // lotes por día hábil
  aviso_dias: 5,          // "próximo a vencer"
  horizonte_semanas: 8,
  feriados: [{ fecha: '2026-12-08', nombre: 'Inmaculada Concepción' }, ...]
}
```

Valores ausentes o inválidos caen al default. Mientras nadie edite la sección
Agenda de Configuración, `config.agenda` no existe y rigen los defaults.

**`datos.agenda`** (lista de primer nivel, nueva; se agrega a
`SECCIONES_LOTES.secciones` en `src/prensas/validacion.ts:41` para que tenga el
freno de borrado masivo; `fusion.js` la funde por `id` sin cambios):

```js
{ id, clase: 'fijado',    tipo: 'analisis'|'trasiego', lote, fecha, por, el }
{ id, clase: 'prioridad', lote, prioridad: 'alta'|'media'|'baja', por, el }
{ id, clase: 'cupo',      tipo: 'analisis'|'trasiego', fecha, cupo, por, el }
{ id, clase: 'tanque',    lote, por, el }
```

`por` = email del usuario, `el` = ISO datetime. Un `fijado` por (tipo, lote):
fijar de nuevo reemplaza. Un `cupo` por (tipo, fecha).

### Motor `planificar` (puro)

Entrada: `{ lotes, analisis, movimientos, dash, agenda, config, hoy }`.
Salida: `{ dias: [{ fecha, habil, feriado?, cupoA, cupoT, analisis: [item], trasiegos: [item], excedidoA, excedidoT }], bandeja: { analisis: [item], trasiegos: [item] }, avisos: [] }`.

Reparto, por separado para análisis y trasiegos, cada uno con su cupo
(`cupo` de `agenda` para ese día, si existe; si no, el de config):

1. **Fijados** primero, en su día, aunque excedan el cupo (el día queda
   `excedido`). Un fijado a un día **pasado** no cumplido se trata como no
   fijado y lleva marca `atrasado`.
2. **Resto** ordenado por (prioridad, fecha objetivo, n° de lote):
   - **urgente** (análisis prioridad 1–3, trasiego ya vencido): primer día
     hábil `≥ hoy` con lugar;
   - **no vencido** (análisis 4–5, trasiego a futuro): su fecha objetivo; si no
     hay lugar, días hábiles anteriores hasta `hoy`, y después posteriores.
   - Lo urgente que no entra en ningún día del horizonte queda sin ubicar y
     marcado `sin lugar` (se ve en la bandeja); lo no urgente que vence después
     del horizonte simplemente no se muestra todavía.
3. Determinista: misma entrada → misma salida.

### Pantalla (`vista-agenda.js`)

- Botón `📅 Agenda` en la barra (`public/lotes/index.html`), sección
  `#tab-agenda`, `registrarVista('agenda', …)`, import en `app.js`, alta en
  `_redibujarVistaDashboard` (depende de `/dashboard`).
- **Bandeja** (izquierda): Alertas para analizar agrupadas por prioridad 1–4 con
  conteos; cada fila: lote, variedad, motivo + etiquetas, días de atraso, día
  programado. Clic → resalta en el calendario. Plegable: Trasiegos vencidos por
  prioridad.
- **Calendario** (derecha): Semana (por defecto) / Mes; filtro Análisis /
  Trasiegos / Ambos; navegación ← Hoy →. Encabezado del día: barras
  `Análisis 47/55` y `Trasiegos 3/4` (rojo si excede). No hábiles grisados con
  nombre del feriado.
  - Trasiego: tarjeta con lote, variedad, n° de barriles, punto de prioridad,
    📌 si fijado, ✋ si prioridad manual, "en curso" si tiene OT.
  - Análisis: en Semana, fichas compactas coloreadas por motivo (programados
    tenues); en Mes solo contadores.
- **Panel del día** (clic en un día): lista completa, cupo editable del día,
  en cada trasiego selector de prioridad (↺ vuelve a automática) y **Emitir
  OT**, en cada fijado **Soltar**, arriba **Armar orden de muestras del día**.
- Estética alineada con el resto de Lotes (se aplica `frontend-design` en la
  implementación).
- Lector: solo ver. Editor/admin: todo. El cliente de Lotes hoy no conoce el
  rol (solo se entera por el 403 al guardar); en la Etapa 1 no hay ediciones
  propias de la Agenda salvo Configuración, así que el chequeo de rol
  (`GET /api/yo`) entra en la Etapa 2 junto con el arrastre.

### Arrastre (`agenda-arrastre.js`)

- Pointer events (mouse + táctil; el DnD nativo no anda en tablet).
- Arrastrar tarjeta(s) a un día → crea/reemplaza `fijado`. Selección múltiple
  con Ctrl+clic (o mantener presionado en táctil).
- Soltar en día no hábil → confirmación.
- Alternativa accesible: menú de la tarjeta → "Mover a…" con selector de fecha.
- Cada cambio pasa por el flujo normal de edición: entra en Ctrl+Z y
  autoguardado.

### Conexión con lo existente

- **Armar orden de muestras del día** → `mostrarTab('orden')` con los lotes del
  día precargados. Se agrega en `nucleo.js` un mecanismo chico de "abrir con
  datos" (intención pendiente que la vista destino consume al dibujarse).
- **Emitir OT** → Movimientos › Emitir OT con plantilla barricas→barricas y el
  lote precargado (mismo mecanismo).
- **Cierre automático**: un análisis nuevo recalcula `/dashboard` y el ítem sale;
  confirmar la OT ejecuta el movimiento y el trasiego se reprograma a +90 días.
- **Configuración**: sección Agenda con los parámetros y editor de feriados
  (validación de fecha ISO).
- **Ficha del lote**: línea "Próximo análisis: … · Próximo trasiego: …".

## Errores y casos borde

- `/dashboard` no disponible → el calendario muestra trasiegos (no dependen de
  él) y un aviso "alertas no disponibles"; no inventa ítems de análisis.
- Decisiones de lotes vacíos/borrados → ignoradas (no se podan).
- Dos personas editando → fusión por `id` (la de siempre); dos fijados del
  mismo (tipo, lote) tras una fusión → gana el `el` más reciente.
- Feriado con fecha inválida → Configuración no lo acepta.
- Lote sin fecha base de trasiego → aparece en la bandeja de trasiegos con
  "sin fecha base" y prioridad media, sin ubicar en el calendario hasta que se
  fije a mano.

## Pruebas

- **Motor** (`test/lotes-agenda.test.mjs`, Vitest, importa `agenda.js`):
  orden de prioridades; cupo y desborde; búsqueda antes/después; fines de
  semana y feriados; fijados (en cupo, excedidos, pasados → atrasado); cupo por
  día; caducidad de `fijado` y `prioridad`; prioridad automática en los bordes
  (−15, 15, 16); "en curso"; horizonte; determinismo.
- **Servidor** (`test/lotes-fml.test.ts` o nuevo): `reanalisis_correccion` —
  sin `ot_n`, anulada, con SO₂ posterior, justo en el día 3, antes del día 3.
- **Validación**: `agenda` en `SECCIONES_LOTES` (freno de borrado masivo).
- **Navegador**: preview local con datos de prueba — arrastre mouse y táctil,
  Mover a…, Emitir OT y Orden de muestras precargadas, lector sin edición,
  captura de pantalla.

## Entregas

1. **Etapa 1, ver y planificar**: condición `reanalisis_correccion`;
   `config.agenda` + Configuración; motor `agenda.js`; pestaña Agenda con
   bandeja, calendario Semana/Mes y panel del día;
   Armar orden de muestras y Emitir OT.
2. **Etapa 2, decidir**: arrastre (incluida selección múltiple), Mover a…,
   fijados, prioridad manual, cupo por día, tanques agregados a mano, línea en
   la ficha.

Cada etapa se mergea a `main` en `C:\Users\Bmax\repos\catenainstitute`; el
deploy (`npx.cmd wrangler deploy`) lo corre el usuario desde esa carpeta con
`main` limpio.
