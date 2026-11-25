# Prensas web con las mejoras de Lotes — diseño

Fecha: 2026-10-07 · Rama: `feat/prensas-como-lotes` (worktree `repos\ci-prensas-como-lotes`, desde main 29ca3ab)

## Objetivo

Llevar a la web de Prensas (`public/prensas/`) lo que ya funciona en Lotes web:
vaciados atenuados, filtro de llenado, selector de años y el sistema de la
pestaña Análisis (colores por criterio, franja por lote, tabla rápida, grilla
tipo Excel, autoguardado con Ctrl+Z). Siempre con **las reglas de Prensas**, que
no son las de Lotes: Prensas no calcula SO₂ (ver memoria
`so2-vive-en-lotes-no-en-prensas`) y sus criterios son pH, AV, Gluc/Fruc y Málico.

Además se suma la vendimia 2025 desde
`OneDrive\Año 2025\Prensas 2025\Lotes prensas 2025.xlsx`.

## Estado de partida (main 29ca3ab)

- Prensas es un documento único `{meta, lotes, analisis, degustaciones, agregados}`
  en D1; se guarda con el botón Guardar (`POST /prensas/api/datos`, chequeo de
  versión, freno anti-borrado masivo, fusión en 409 vía `shared/fusion.js`).
- Respaldo del corte: 278 lotes (todos 26xxx), 1527 análisis (278 son
  "separadores" sin mediciones), 74 lotes con `litros = 0`.
- Vaciado = `litros === 0` (no hay otro campo). Hoy se excluyen del Panel, Alto
  riesgo y Rellenos, pero en Lotes/Análisis/Degustación se ven iguales que los llenos.
- Análisis dibuja todas las filas (~20k inputs), celda mala en rojo (`bad2`),
  sin franja por lote. Umbrales fijos en `REGLAS` de `app.js`.
- La pestaña ⚙️ Configuración (`config.alertas`, `shared/reglas-alertas.js`) está
  en la rama `feat/prensas-config` (2687403) **sin mergear**.
- `app.js` es un script clásico (no módulo), 1860 líneas.

## Enfoque: compartir los módulos de Lotes

Las piezas genéricas de Lotes se mueven a `public/shared/` y en `public/lotes/js/`
queda un reexportador de una línea por archivo (`export * from '/shared/x.js'`),
así Lotes no cambia de comportamiento y sus tests siguen cubriéndolas:

| Módulo | Para qué | Ajuste para compartir |
|---|---|---|
| `anios.js` | año de un lote (5 dígitos → 20YY), selección, visibilidad | ninguno (puro) |
| `selector-anios.js` | botones + localStorage + evento | parametrizar clave de localStorage y nombre del evento (`lotes_anios` / `prensas_anios`) |
| `filtro-llenado.js` | Todos / Llenos / Vacíos | recibir el predicado `esVacio` en vez de importar `envases.js` |
| `ventana-virtual.js`, `tabla-virtual.js` | tabla que dibuja solo lo visible | ninguno |
| `grilla.js`, `grilla-tsv.js`, `grilla-rect.js` | grilla tipo Excel | `escribirCelda` se inyecta (hoy viene de `tabla.js`, que importa el núcleo de Lotes); eventos de deshacer parametrizados |
| `autoguardado.js`, `deshacer.js`, `en-vivo.js` | guardar a los 2 s, Ctrl+Z/Y, avisos en vivo | ninguno (puros) |

Lo que es **propio de Prensas** va en `public/prensas/js/` como módulos ES:

- `reglas-analisis.js` (puro, con tests): veredicto por celda y por lote con
  los umbrales de `config.alertas`.
- `vista-analisis.js`: la pestaña Análisis nueva sobre tabla virtual + grilla.
- `nucleo-guardado.js`: autoguardado + deshacer + en vivo cableados al documento de Prensas.

`app.js` sigue siendo clásico. La conexión con los módulos va por `window`
(`window.PrensasApp = {DATOS, markDirty, ...}`) y un `<script type="module">`
que se monta después.

Los veredictos se calculan **en el navegador**: las reglas de Prensas son
simples, el color cambia al tipear sin pedir nada al servidor, y no hace falta
API nueva. Las reglas de Lotes no se tocan.

## Paso 0 — Configuración de alertas

Mergear `feat/prensas-config` en la rama, resolviendo los conflictos con el
rediseño "Piedra y tinta" (barra con "Más", sin emojis en la barra). Los colores
de Análisis, el Panel y Alto riesgo leen los mismos umbrales (`REGLAS` mutado por
`aplicarReglas()`). Un valor por alerta, igual para todos los lotes.

## Paso 1 — Vaciados atenuados y filtro de llenado

- Vaciado: `num(litros) === 0`. Un lote sin el campo `litros` NO es vaciado.
- CSS como Lotes: `tr.vacio{opacity:.45}` sobre la fila (la columna fija de Lote
  sigue opaca), `tr.vacio:hover, tr.vacio:focus-within{opacity:1}`, y una muestra
  en la leyenda.
- Se aplica en **Lotes**, **Análisis** (franja y filas del lote) y **Degustación**.
- Filtro **Todos / Llenos / Vacíos** en las barras de Lotes, Análisis y
  Degustación. Arranca siempre en Todos (sin persistencia, como Lotes) y entra en
  "Limpiar filtros".
- Panel, Alto riesgo y Rellenos siguen excluyendo los vaciados como hoy.

## Paso 2 — Selector de años

- Botones `2025 | 2026` en la cabecera de página, prendibles por separado; nunca
  queda ninguno prendido. Se oculta si hay menos de dos años.
- Año = `2000 + primeros dos dígitos` de un lote de 5 dígitos; lo demás siempre
  se ve.
- Arranca en el año más nuevo; la elección se recuerda en `localStorage`
  (`prensas_anios`).
- Manda en **todas** las pestañas: Panel (KPIs, gráficos, NO OK, vencidos,
  próximos), Alto riesgo, Lotes, Análisis, Degustación, Agregados, Rellenos y
  Orden de muestras. Historial no se filtra (es del documento entero). El
  filtro es del lado del cliente: el documento tiene los dos años.
- El selector de mes del Panel y Degustación lista solo los meses de los años
  prendidos.
- El reporte del servidor no cambia: en la web `POST /datos` responde
  `reporte: null` (el reporte para el jefe era del servidor local).

## Paso 3 — Carga de la vendimia 2025

1. `scripts/convertir-prensas-excel.py <xlsx> <salida.json>` lee las hojas
   **LOTES** y **ANÁLISIS** y devuelve `{lotes, analisis}` con las claves de la web:
   - LOTES → `lote, variedad, origen (Lote origen), ig, id_origen (ID),
     ot_prensado (Orden de prensado), litros, dia_prensado (ISO), prensa (Tipo de
     prensa), so2_agregado, comentario`. `accion, comentario2, accion2` vacíos.
   - Columnas del Excel 2025 que la web no tiene (Refermentación, Bacteria,
     Actividad, Degustación Brett/AV) se guardan en `comentario2` como texto
     ("Referm.: SI · Bacteria: NO · Actividad: POCA") solo si traen algo.
   - ANÁLISIS → las 25 claves de la web (`mes, fecha, etanol, ph, av, gluc,
     malico, lactico, at, azucar, revisar_av, brett, aceticas, lacticas,
     levaduras, hongos, so2l, so2t, so2molec, fecha_corr, so2_corr, th2, otro, ot`).
     Coma decimal y textos con espacios se pasan a número; `-999` se respeta.
   - Se ignoran las hojas Sheet1, Hoja2, planilla degustacion y Claude Log.
   - Reporte: lotes, análisis, renglones vacíos salteados, análisis huérfanos
     (lote que no está en LOTES).
2. `scripts/fusionar-anio.mjs` se generaliza con `--modulo prensas` (o un
   `fusionar-anio-prensas.mjs` hermano si el núcleo es muy de Lotes): agrega los
   lotes/análisis 2025 al documento sin tocar los 2026; falla si algún número de
   lote ya existe.
3. Publicación (la hace Claude solo con OK explícito del usuario en el momento):
   respaldo de la nube → re-chequear `meta.version` → fusionar sobre ese respaldo
   → `importar.mjs --modulo prensas --remote --piso-la-web` → verificar.
   Rollback: el respaldo.

## Paso 4 — Análisis nuevo

**Filas.** Agrupadas por lote. Arriba de cada grupo, una **franja** con número de
lote (lleva a Lotes), variedad y prensa. Las filas "separador" del documento
(sin mediciones) **no se dibujan**: siguen guardadas, no se borran. Se quitan las
opciones "Con análisis / Solo separadores".

**Colores por celda** (solo pH, AV, Gluc/Fruc, Málico; celda vacía sin color):

| Columna | Naranja (fuera) | Amarillo (atención) | Verde (dentro) |
|---|---|---|---|
| pH | > `ph_max` (4) | — | ≤ 4 |
| AV | ≥ `av_max` (1) o = −999 | > `av_atencion` (0,85) y < 1 | ≤ 0,85 |
| Gluc/Fruc | > `gluc_max` (3) | — | ≤ 3 |
| Málico | > `malico_max` (0,5) | — | ≤ 0,5 |

**Salto de AV:** `▲` en la celda AV cuando subió `av_salto` (0,3) o más respecto
del análisis anterior del mismo lote (misma regla que Alto riesgo, `saltoAV` de
`shared/reglas-av.js`), con un `title` que dice "subió de X a Y".

**Franja del lote:** verde (OK) o naranja (NO OK) con la **misma regla que el
Panel**: el último análisis del lote (por mes, como `evaluarLotes`). Esa elección
del último análisis se saca a `reglas-analisis.js` y la usan el Panel y la
franja. Sin análisis con mediciones → franja neutra. Lote vaciado → franja y
filas atenuadas.

**Color al tipear:** al editar una celda se recalcula su fila y la franja de su
lote al instante (no hay servidor de por medio).

**Barra:** buscar por lote · Todos/Llenos/Vacíos · Mostrar "Todas / Solo fuera
de criterio" (una fila de análisis con alguna celda naranja) · Limpiar filtros ·
contador "N análisis de M lotes". Los embudos por columna del rediseño (con
desde/hasta) se mantienen sobre la tabla virtual. Ordenar por cabecera ordena
dentro de cada lote. Leyenda: verde, amarillo, naranja, ▲, vaciado.

**Tabla rápida:** `montarVirtual` de shared; con 2025 cargado son ~4.900 filas.

**Grilla:** la de Lotes (selección, Ctrl+C/V, Supr, Ctrl+D, Ctrl+Enter, F2,
flechas). Reemplaza la selección con Alt de hoy. Columnas de solo lectura
(Variedad, Prensa, Mes) no se pegan.

**Alta y baja:** "+ Agregar análisis" y ✕ por fila se mantienen.

## Paso 5 — Autoguardado, Ctrl+Z y en vivo (toda la página)

- Cada `markDirty` programa un guardado a los 2 s; reintentos 5/15/30/60 s;
  Ctrl+S fuerza. El botón Guardar pasa a indicador "Guardado · hh:mm /
  Guardando… / Sin conexión".
- Ctrl+Z / Ctrl+Y deshacen cualquier cambio de la página (fotos JSON del
  documento, como Lotes), con aviso corto de qué se deshizo.
- Cada 15 s se mira la versión; si otro guardó y no hay cambios propios
  pendientes, se recarga y se redibuja sin perder la pestaña ni el scroll.
- Se mantienen el freno anti-borrado masivo (pregunta; "Cancelar" deshace) y la
  fusión del 409 de `shared/fusion.js`.
- Exportar a Excel ya no necesita "guardar antes".

## Pruebas

- Tests de vitest para todo lo puro: `reglas-analisis.js` (cada umbral, −999,
  atención, salto, último análisis, lote sin análisis), filtro de llenado con
  predicado inyectado, selector de años parametrizado, conversor 2025 (Python:
  test con una planilla mínima) y fusión de año para Prensas.
- Los tests existentes de Lotes tienen que seguir verdes sin cambios (prueba de
  que mover a shared no rompió nada).
- Verificación en navegador con el mock de Prensas (`mock-prensas.mjs` sobre el
  respaldo, sin login) y con 2025 fusionado: atenuado, filtros, años, colores,
  franja, grilla, autoguardado y Ctrl+Z, medido con `getComputedStyle` y tiempos
  de apertura de Análisis.

## Fuera de alcance

- Criterios por variedad en Prensas (se eligió un valor por alerta).
- Cambiar las reglas de Lotes o el cálculo de SO₂.
- Borrar las filas separador del documento.
- Desplegar: lo corre el usuario con `npx wrangler deploy` desde una carpeta en
  main limpio.

## Entregas sugeridas

1. Pasos 0–3 (configuración, atenuado, filtro, años, 2025).
2. Pasos 4–5 (Análisis nuevo, autoguardado).
