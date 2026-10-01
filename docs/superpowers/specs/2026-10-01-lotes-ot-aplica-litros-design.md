# Confirmar una OT actualiza los litros del lote

**Fecha:** 2026-10-01
**Estado:** diseño aprobado por el usuario, pendiente de plan de implementación
**Módulo:** Lotes (web). El Mapa de Barriles y Prensas no se modifican.

## El problema

Las tres apps (Prensas, Mapa de Barriles, Lotes) comparten base de datos pero
casi no comparten información. El caso más caro de todos los días: **después de
confirmar una OT de trasiego o de corte, alguien vuelve a cargar a mano los
envases y los litros del lote** en el overlay de Envases.

Hoy, en `confirmarOT` (`public/lotes/js/ot-armado.js`):

- La merma se anota solo en `ot.lotes[i].merma`, sin unidad, y no llega ni al
  movimiento ni al lote.
- `litros_actuales` y los envases (`cap50/200/225/500`, `vasija_grande`) no se
  tocan. Solo los escribe el overlay de Envases.
- `vasija_actual` no se actualiza, aunque el destino ya se conoce.
- El lote nuevo de un corte nace en 0 L.
- Confirmar marca "sin guardar" pero no guarda.

La medición de los tanques también es manual. Se usa
`Archivos de Roy Urvieta - Año 2026\cubicacion de tanques\cubicaciones_tanques.html`,
donde se elige la tabla, se cargan los cm de merma y se copian los litros. Ese
HTML no sabe qué número de tanque es de qué tipo.

## Objetivo

Que confirmar una OT **proponga** cómo queda cada lote (envases, litros, vasija
actual y barricas mermas) a partir de lo que se cargó, la compare con el Mapa de
Barriles y la aplique **solo después de un check manual por lote**. Que sea casi
automático para minimizar el error, pero con un control humano siempre.

## Fuera de alcance

Cada uno de estos puntos queda para un diseño propio:

- Escribir en el Mapa de Barriles. Se sigue usando solo para leer, como decidió
  la spec del 2026-09-23. El escaneo sigue siendo el control físico.
- Que el escáner tome el número de OT y el lote de la OT, sin volver a tipearlos.
- La conexión Prensas ↔ Lotes / Barriles (spec 2026-09-04, sin implementar).
- Reemplazar la planilla diaria de vasijas fijas que hoy mantiene Oriana
  (`Inventario de vasijas de CIW 2026.xlsx`, hoja "Inventario vasijas"). El
  padrón de esta spec es el primer paso, pero no lleva el contenido diario de
  cada vasija.
- Tablas de cubicación para foudres, tinajas y los tanques de 3.300 / 6.000 /
  46.500 L. No existen hoy; si aparecen, se agregan como datos.

## Decisiones

| # | Decisión | Elegido por el usuario |
|---|---|---|
| D1 | La propuesta sale de la OT y se contrasta con el Mapa si ya hay escaneo (no se espera al escaneo) | opción C |
| D2 | La merma en tanques son los **cm** que faltan para llenarlo, y se pasan a litros con la tabla de cubicación | sí |
| D3 | El padrón de vasijas sale del Excel "Inventario de vasijas de CIW 2026", columna **Cap REAL** | sí |
| D4 | **Manda la Cap REAL**: la tabla solo dice cuánto falta. `litros = cap_real − (tabla(0) − tabla(cm))` | recomendado |
| D5 | Las barricas mermas quedan en una lista de pendientes y se cierran **solas** cuando el Mapa las muestra LLENO, con un botón "✓ resuelta" para el resto | opción A |
| D6 | Todo vive en Lotes: un solo documento, un solo guardado, el Mapa solo se lee | enfoque 1 |
| D7 | `litros_actuales = envases llenos − faltante de las mermas pendientes del lote` | aprobado |

Enfoques descartados en D6:

- **Escribir Lotes y el Mapa desde el servidor.** Lotes no tiene fusión en el
  409 (la otra pestaña pierde su trabajo). Además, parsear dos documentos en un
  pedido choca con el límite de CPU del plan (ver `plataforma-error-1102`), y se
  saltearía el escaneo.
- **Tabla `vasijas` compartida en D1.** Es lo correcto a largo plazo, pero es
  infraestructura nueva para algo que hoy resuelve una lista de 78 filas. No
  cierra la puerta.

## Datos medidos

**Tablas de cubicación** (las 6 del HTML, embebidas desde
`base de datos cubicaciones.xlsx`). Cada una tiene un punto cada 1 cm, desde
merma 0 hasta el máximo:

| Clave | Tabla | Litros con 0 cm | Rango |
|---|---|---|---|
| `esfera-1500` | Esfera + plano | 1.500 | 0–142 cm |
| `tanque-40hl` | Tanque 40 HL | 4.299 | 0–190 cm |
| `tanque-75hl` | Tanque 75 HL | 7.502,06 | 0–220 cm |
| `huevo-33hl` | Huevo 33 HL | 3.299,35 | 0–232 cm |
| `huevo-24hl` | Huevos 24 HL | 2.652 | 0–180 cm |
| `pileta-30hl` | Piletas 30 HL | 3.048,625 | 0–145 cm |

**Padrón de vasijas fijas.** Son 78 vasijas, todas con número único, y salen de
la hoja "Inventario vasijas", columnas B (N° de vasija), C (Cap REAL) y E
(Vasija):

| Vasija | Cap REAL | Cant. | Tabla |
|---|---|---|---|
| ESFERA HORMIGON | 1.500 | 7 | `esfera-1500` |
| PILETA DE HORMIGON | 3.000 | 10 | `pileta-30hl` |
| TANQUE AC.INOX. | 4.200 | 10 | `tanque-40hl` |
| TANQUE AC.INOX. | 7.500 | 16 | `tanque-75hl` |
| TANQUE HORMIGON OVOIDE | 3.300 | 6 | `huevo-33hl` |
| TANQUE OVOIDE AC.INOX. | 2.600 | 6 | `huevo-24hl` |
| FOUDRE OVAL | 2.000 | 10 | — |
| TANQUE AC.INOX. | 3.300 | 5 | — |
| TINAJA CERAMICA | 1.000 | 6 | — |
| TANQUE AC.INOX. | 6.000 | 1 | — |
| TANQUE AC.INOX. | 46.500 | 1 | — |

Hay 55 vasijas con cálculo por cm y 23 que llevan litros a mano.

El Mapa de Barriles **no** tiene ninguna de estas vasijas. Solo conoce los
tanques chicos de 50 / 200 / 500 L y las barricas.

## Arquitectura

Las piezas nuevas están en `public/lotes/js/`. Son módulos puros, sin DOM, con
tests en `test/`:

| Módulo | Qué hace | Depende de |
|---|---|---|
| `cubicacion-tablas.js` | Las 6 tablas como datos. Hay que regenerarlo si cambia el Excel. | nada |
| `cubicacion.js` | `litrosPorCm(vasija, cm)`, que devuelve `{litros, faltante, fueraDeRango}`. Interpola en línea recta y aplica D4. | tablas |
| `vasijas-padron.js` | El padrón inicial (78 filas) y `buscarVasija(padron, num)`. | nada |
| `mermas.js` | `mermasPendientes(mermas, porLoteMapa)` y `faltanteDeLote(mermas, lote)` | nada |
| `propuesta-ot.js` | `proponer(ot, lotes, entradas, mapa)` → la propuesta "antes → después" por lote. `aplicarPropuesta(...)` muta el documento. | envases, cubicacion, mermas |

Pantallas que se tocan:

- `vista-ot-confirmar.js`: se reescribe en dos pasos (ver más abajo).
- `vista-config.js`: se suma la sección "Vasijas fijas".
- `vista-movimientos.js`: se suma la sub-pestaña "Mermas".
- `vista-dashboard.js`: se suma el contador de mermas.
- `nucleo.js`: se agregan las secciones por defecto y el cierre de mermas al
  guardar.

Servidor:

- `SECCIONES_LOTES` (`src/prensas/validacion.ts`) suma `vasijas` y `mermas`,
  para que tengan el control de lista y el freno anti-borrado. No son
  requeridas: un documento viejo sin ellas se sigue pudiendo guardar.
- Ningún motor del servidor cambia, porque todos leen `litros_actuales` tal como
  está guardado.

### Forma de los datos nuevos

En el documento de Lotes:

```js
vasijas: [            // padrón de vasijas fijas (no barricas)
  { num: '201', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: 'tanque-75hl' | null,
    activa: true }
],
mermas: [             // barricas mermas
  { id: 'mer-…', lote: '26217', barril: '2221713', cap: 225, litros: 180,
    desde: '2026-10-01', ot: 'OT-2026-014',
    resuelta_el: '' , resuelta_por: '', resuelta_como: '' | 'mapa' | 'manual' }
]
```

Cambios en lo que ya existe:

- `movimiento.merma_litros` (número o null). Es nuevo y se carga al confirmar.
- `ot.lotes[i].aplicado`, que queda así:
  `{ antes: {cap50,cap200,cap225,cap500,vasija_grande,litros_actuales,vasija_actual},
  despues: {…mismo…}, por, el }`. Queda en `null` si el lote no tuvo check.
- `ot.lotes[i].merma` (el campo viejo, sin unidad) se sigue leyendo en las OT ya
  confirmadas. Las OT nuevas escriben `merma_litros` y dejan `merma` igual a
  `merma_litros`.

### Cálculo de la propuesta

Para cada lote de la OT:

```
envases_después = envases_antes − vaciado + llenado
litros_después  = litrosDeEnvases(envases_después) − faltanteDeLote(mermas_después, lote)
merma_litros    = litros_antes_del_lote_en_la_OT − litros_llegados
vasija_actual   = texto del destino ("T 201", "11 barricas", "11 barricas + T 201")
```

**Vaciado.** Por defecto se vacía todo lo que la OT tomó del lote:

- Origen barriles: los barriles de la foto `ot.lotes[i].barriles`, contados por
  capacidad (`cap` 50/200/225/500; los 228 y 300 cuentan como 225, con la misma
  `EQUIV_CAP` de `src/lotes/motores/cruce.ts`).
- Origen tanque (`tq-barricas`): los litros que salen del tanque, que se restan
  de `vasija_grande`.
- Si la foto tiene menos barriles que el lote, el resto queda como estaba (OT
  parcial).
- Si la foto vacía más de lo que el lote tiene, se recorta en 0 y aparece un
  aviso.

**Llenado**, según la plantilla:

| Plantilla | Lote que recibe | Llenado |
|---|---|---|
| `barricas-barricas` | el mismo | N barricas llenas + las mermas cargadas |
| `tq-barricas` | el mismo | N barricas (por defecto `barricas_previstas`) + las mermas |
| `barrica-tanque` | el mismo | `vasija_grande` += litros medidos en el tanque destino |
| `tq-tq` | el mismo | `vasija_grande` += litros medidos en el tanque destino |
| `barricas-tanque` (Corte) | el lote del corte (`ot.lote_corte`) | `vasija_grande` += litros medidos. Los lotes de origen solo vacían. |

El llenado siempre **suma** sobre lo que quedó después del vaciado. Así, un
lote que pasa entero de un tanque a otro primero vacía su `vasija_grande` (o sus
`cap500`, si el origen eran tanques del Mapa) y después recibe lo medido. El
vaciado depende del `origen` de la plantilla (`'barriles'` usa la foto,
`'tanque'` usa los litros previstos), no del nombre de la plantilla.

- **Destino con tabla:** litros = `litrosPorCm(vasija, cm)`.
- **Destino sin tabla:** se cargan los litros a mano.
- **Destino barricas:** la cantidad propuesta es `ceil(litros / 225)` y se puede
  corregir. Cada merma cargada cuenta como una barrica de su capacidad y suma su
  faltante (`cap − litros`) a la lista `mermas`.

Todo valor de la propuesta se puede corregir en el paso 2, antes del check.

### Mermas y litros (D7)

- `faltanteDeLote(mermas, lote)` = suma de `cap − litros` de las mermas **no
  resueltas** de ese lote.
- Ejemplo: 12 × 225 con una barrica de 180 L → 2.700 − 45 = **2.655 L**.
- La invariante del subsistema H pasa a ser
  `litros_actuales = Σ cap·n + vasija_grande − faltante de mermas`. Se actualizan
  el comentario de `envases.js` / `envases.ts` y la cuenta del overlay de
  Envases (que hoy la recalcula).
- Con 0 mermas el resultado es idéntico al de hoy, así que los 304 lotes
  actuales no cambian.

**Cierre automático (D5):**

- Una merma está "llena según el Mapa" cuando en `/lotes/api/barriles?lotes=` ese
  `barril` aparece en estado `LLENO`, con el mismo lote (comparado por los
  primeros 5 dígitos, como `codigoLote` del Mapa) y con `fecha >= desde`.
- **La web no guarda sola.** Al apretar Guardar en Lotes, antes del POST, las
  mermas llenas según el último Mapa leído se marcan
  `resuelta_como: 'mapa'` y se recalcula `litros_actuales` de sus lotes. Así no
  hay escrituras sorpresa ni 409 con otras pestañas.
- "✓ resuelta" la cierra a mano (`resuelta_como: 'manual'`) y pide quién.

## Flujo en pantalla

### Paso 1 — "Lo que pasó" (por lote)

- **Destino tanque.** Un buscador del padrón elige la vasija. Se cargan los
  **cm** y al lado se ve en vivo "4.075 L de 4.200". Si la vasija no tiene tabla,
  se cargan los litros.
- **Destino barricas.** Se carga la cantidad de barricas llenas y se agregan las
  mermas: número de barril + litros.
  - Si el Mapa ya tiene barriles LLENO/MERMO de ese lote que no estaban en la
    foto de la OT, se ofrecen para elegir.
  - Si no, el número se tipea y tiene que existir en el inventario del Mapa.
- Operario (obligatorio), pasos cumplidos y comentario, igual que hoy.

### Paso 2 — "Así queda cada lote"

Una tabla por lote con:

- envases antes → después;
- litros antes → después;
- vasija actual;
- merma en L;
- **Mapa**, con uno de estos valores: "✓ coincide", "⚠ el Mapa dice N",
  "sin escanear todavía" o "no se pudo comparar";
- **☐ Aplicar**.

Los valores del "después" se pueden editar.

Al apretar **"Aplicar y guardar"**:

1. Se confirma la OT y los movimientos, igual que hoy. Además se escribe
   `merma_litros`.
2. Para cada lote con check: se escriben envases, `litros_actuales`,
   `vasija_actual` y las mermas nuevas, y se guarda `aplicado` en la OT.
3. Los lotes sin check no se tocan (`aplicado: null`).
4. Se llama a `guardar()`. Si da 409, aparece el aviso de conflicto de siempre.

### Sub-pestaña Movimientos → Mermas

- Columnas: lote, barril, litros / cap, faltante, OT, días, estado. Los estados
  son "pendiente", "✓ llena según el Mapa (se cierra al guardar)" y "resuelta".
- Las resueltas van ocultas detrás de un filtro.
- El Dashboard suma una tarjeta "Barricas mermas: N", resaltada si N > 0.

### Configuración → Vasijas fijas

- Se pueden ver, agregar, editar y dar de baja vasijas (`activa: false`, nunca se
  borra).
- Si `vasijas` está vacío, aparece el botón **"Cargar padrón inicial
  (78 vasijas)"**, que copia `vasijas-padron.js` al documento.
- La tabla de cada vasija se elige de un select con las 6 claves + "sin tabla".

## Errores

| Caso | Qué pasa |
|---|---|
| cm fuera del rango de la tabla | Aviso en la fila; ese lote no se puede marcar hasta corregirlo |
| cm negativo o vacío con destino tanque con tabla | Igual que el anterior |
| Vasija destino que no está en el padrón | Se cargan litros a mano, con un link "agregar al padrón" |
| Barril de merma que no existe en el Mapa | Se rechaza la fila, con el mismo criterio que el escáner |
| La OT vacía más de lo que el lote tiene | Queda en 0, aviso visible; necesita su check |
| El Mapa no responde | La propuesta se arma igual; la columna Mapa dice "no se pudo comparar" |
| Litros después ≤ 0 en el lote que recibe | Aviso; con check igual el lote pasa a inactivo, como hoy |
| 409 al guardar | El overlay de siempre. No se aplica nada a medias, porque todo va en un solo documento. |
| OT confirmada antes de esta versión | Se sigue mostrando y se imprime igual; no tiene `aplicado` |

## Pruebas

Tests automáticos en `test/`, con el formato `lotes-*.test.mjs` (vitest, igual que
los existentes):

- `lotes-cubicacion.test.mjs`
  - cm exacto;
  - interpolación;
  - D4 con Cap REAL distinta de la tabla (4.200 vs 4.299 con 30 cm → 4.075);
  - fuera de rango;
  - cm decimal.
- `lotes-propuesta-ot.test.mjs`
  - cada una de las 5 plantillas;
  - OT parcial;
  - vaciado mayor que el lote;
  - corte con lote nuevo en 0;
  - barricas_previstas por defecto;
  - corrección manual del después.
- `lotes-mermas.test.mjs`
  - faltante;
  - pendiente vs llena según el Mapa (fecha, lote con anotaciones tipo
    "26730 ROJO", estado);
  - cierre al guardar;
  - 0 mermas = invariante de hoy.
- `lotes-vasijas-padron.test.mjs`
  - las 78 filas, números únicos;
  - cada tabla referida existe.
- Los tests de envases, etapas, fml y cruce tienen que seguir pasando sin
  cambios.

**Verificación en el navegador**, con la web local (`dev:sin-ia`, ver
`catenainstitute-verificar-en-navegador`):

- emitir y confirmar una OT de cada tipo;
- revisar la tabla antes → después;
- aplicar;
- comprobar envases y litros en la grilla;
- cerrar una merma.

## Despliegue

- Va en la rama `feat/ot-aplica-litros`, se mergea a `main` y lo publica el
  usuario con `npx wrangler deploy` desde `repos\catenainstitute` en `main`
  limpio.
- No hay migración de datos: las secciones nuevas nacen vacías y el padrón se
  carga con el botón.
