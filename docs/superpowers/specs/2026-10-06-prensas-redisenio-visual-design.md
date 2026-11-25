# Rediseño de Prensas — "Piedra y tinta"

Fecha: 2026-10-06 · Rama: `feat/prensas-redisenio` · Módulo: `public/prensas/`

## Objetivo

Que la web de Prensas se vea como una herramienta profesional con identidad de
bodega, y no como una página genérica hecha con IA. Se hace **todo en una sola
entrega**: piel nueva, disposición nueva de todas las pestañas, filtros por
columna como en Lotes, y se quitan las pestañas que no se usan. Los datos y las
reglas de cálculo no cambian.

Decisiones tomadas con bocetos en el navegador:

| Tema | Elegido |
|---|---|
| Dirección | Bodega editorial |
| Paleta y letras | B · Piedra y tinta |
| Navegación | Barra compacta con "Más" |
| Dashboard | A · Informe: números arriba, pendientes al frente |
| Tablas de trabajo | Filtros **en la cabecera de cada columna**, como en Lotes web |
| Armado de documentos | Panel de campos a la izquierda + hoja a la derecha |
| Cargas desde Excel | Tres pasos: Pegar → Revisar → Cargar |
| Evolución | **Se quita** (no se usa) |
| Asistente | **Se quita** (no se usa) |

## Fuera de alcance

- Lotes y Barriles. La barra oscura de la plataforma (`public/shared/barra.js`)
  no se toca.
- El contenido de las hojas de papel (`.orden-hoja`) y `@media print`: las
  hojas impresas salen igual que hoy.
- Las reglas de cálculo, `DATOS`, el guardado y la API.
- La ruta `POST /prensas/api/asistente` del Worker (`src/prensas/rutas.ts`)
  queda viva aunque nadie la llame; sacarla es otra tarea (toca `src/` y tests).
- Bandas de columnas colapsables (los "Información ID ⊞4" de Lotes web): no se
  copian; solo los embudos de filtro.

## 1. Tokens de diseño

Reemplazan las variables `:root` actuales, **conservando los nombres** que ya
usa el CSS para que las reglas existentes hereden el cambio.

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#ECE8E1` | fondo piedra |
| `--panel` | `#F4F1EB` | superficies (tablas, fichas) |
| `--panel2` | `#E4DFD6` | campos, hover, panel lateral de documentos |
| `--line` | `#D6D0C5` | filetes |
| `--rule` (nuevo) | `#1C1B19` | filete fuerte bajo la barra, sobre franjas y cabeceras |
| `--txt` | `#1C1B19` | tinta |
| `--muted` | `#68625A` | texto secundario (contraste AA: 4,9 sobre `--bg`, 4,5 sobre `--panel2`) |
| `--accent` | `#5A1724` | tinto: botón principal, pestaña activa, filtro activo |
| `--accent2` | `#43101A` | hover del principal |
| `--ok` | `#56684A` | oliva |
| `--nook` | `#8E2330` | rojo vino |
| `--warn` | `#7F622B` | ocre (4,7 sobre `--bg`) |
| `--info` | `#3F5560` | pizarra |
| `--serif` | `'Cormorant Garamond'` | **solo** títulos de pantalla y números grandes |
| `--sans` | `'IBM Plex Sans'` | todo lo demás, tablas incluidas |

Letras: `.woff2` dentro de `public/prensas/fonts/` (Cormorant Garamond
500/600/500 itálica; IBM Plex Sans 400/500/600) con `@font-face`, como hoy.
Se bajan una vez de `@fontsource` (jsDelivr) y se versionan; la app no carga
nada de Google Fonts. Las Fraunces/Hanken actuales **se quedan**: las usan el
portal, el login y admin desde `/prensas/fonts/`.

Forma: radios de 2 px, sin `box-shadow` salvo desplegables y la hoja de papel
en el visor, sin barritas de color en los KPI. Separación con filetes.
Rótulos en versalitas (`uppercase; letter-spacing:~1.5–2px; 9–10px`).

Colores de estado de filas y carteles (`tr.crit`, `tr.venc`, `tr.sep`,
`.pill`, `.msg`, `.evo-badge`…): se recalculan como tintes de
`--ok/--nook/--warn` sobre `--panel`. Ningún hex viejo (`#f6e4e1`, `#fbeeeb`,
`#ff8a7a`, `#7be3a0`, `#ffd766`, `#8c857b`…) queda en el CSS ni en `app.js`.

**Sin emojis** en ninguna parte de la interfaz: título, pestañas, botones,
placeholders (`🔎`), estados (`👤`, `✓ Guardado` queda como texto con punto de
color), overlays y opciones de `<select>` (`📝 Hoja en blanco`).

## 2. Encabezado y navegación

Una sola franja, que reemplaza `<header>` + `.tabs`:

```
Prensas | [Panel] Alto riesgo  Lotes  Análisis  Degustación  Más ▾ |  ● Guardado 14:02 · usuario · Exportar · [Guardar]
```

- Visibles: `dashboard` (rotulada **Panel**), `riesgo`, `lotes`, `analisis`,
  `degustacion`.
- **Más ▾**: *Registro* — Agregados, Rellenos · *Herramientas* — Orden de
  muestras, Cargar análisis, Historial.
- Si la pestaña activa está en el "Más", el botón se marca y muestra su nombre
  ("Rellenos ▾").
- Las 9 pestañas siguen siendo `<button data-v="…">` dentro de `#tabs` (así lo
  lee `app.js`: `closest('button[data-v]')` y `.tabs button.active`). Historial
  es un botón más del desplegable con su `id="btnHistorial"` de siempre (no
  tiene `data-v`). Los ids `btnConectar`, `usuario`, `status`, `btnExport`,
  `btnGuardar` no cambian.
- El desplegable: clic en "Más" abre/cierra; clic afuera, `Escape` o elegir
  algo lo cierra.
- Bajo 900 px de ancho, las 5 visibles también pasan al desplegable. Nunca hay
  scroll horizontal de la página.

## 3. Estructura común de pantalla

Cada pestaña (salvo Panel) arranca con una **cabecera de página**:

```
Lotes                 Maestro de lotes de prensa: litros, variedad y estado…     [Agregar lote]
```

Título en serif ~28 px, una línea de descripción en `--muted`, acciones a la
derecha. Los recuadros `.note` largos (reglas de Alto riesgo, Agregados,
Degustación) se pliegan en un `<details>` "Cómo se calcula" / "Cómo funciona"
debajo de la cabecera, cerrado por defecto.

## 4. Dashboard (versión A)

1. **Controles**: "Mes en curso" (`#selMes`), "Referencia" (`#hoy`),
   "Descargar HTML" a la derecha (mismo `data-descargar-html`).
2. **Franja de números**: los 5 KPI (`kTotal`, `kOk`, `kNoOk`, `kSinMes`,
   `kProx` y sus `…Pct`), separados por filetes verticales, número en serif
   ~44 px coloreado por estado. Filete `--rule` arriba.
3. **Dos columnas** (1,55 : 1; una sola bajo 1000 px):
   - Izquierda — **una tabla con solapas** *No OK · Vencidos · Próximos ·
     Últimos agregados*, cada una con su contador (`cntNoOk`, `cntVenc`,
     `cntProx`, `cntUltAgr`). Las 4 tablas (`tNoOk`, `tVenc`, `tProx`,
     `tUltAgr`) siguen existiendo; la solapa muestra una. Por defecto No OK; la
     elegida se recuerda en `localStorage` (con try/catch).
   - Derecha — **Fallas por criterio** (`critList`, como barras finas con el
     número), **pH vs Acidez volátil** (`chScatter`), **Estado de lotes**
     (`chDonut`, más chico) y **Criterios fallidos** (`chBars`).
4. **Pie**: la línea de reglas (`.foot`).

**Descargar HTML** copia todas las hojas de estilo de la página. En la copia se
muestran las 4 tablas, una debajo de otra (las solapas no sirven sin JS).

## 5. Tablas de trabajo — filtros en la cabecera

Aplica a **Alto riesgo** (`tRiesgo`), **Lotes** (`tLotes`), **Análisis**
(`tAna`), **Degustación** (`tDeg`) y la bitácora de **Agregados** (`tAgr`).

- Cada `<th>` lleva su nombre (clic = ordenar, como hoy) y un **embudo ▾**
  (`<button class="th-flt" data-flt="k">`). Activo: tinto, con la cantidad de
  valores elegidos (`▾ 2`).
- El embudo abre el **mismo panel multi-select** de hoy (buscar, Todas, lista
  de valores con casillas, Limpiar), en **modo anclado**: el panel cuelga de
  `<body>` con `position:fixed` bajo el `<th>`, para que no lo recorte el
  `.scroll{overflow:auto}`; si no entra abajo, se vuelca arriba. Se porta la
  lógica de `crearFiltroMulti({anclado:true})` y `posicionDePanel` de
  `public/lotes/js/tabla.js` (allá son módulos; acá se copian como funciones
  del script clásico `app.js`).
- **Columnas numéricas y de fecha** (las que hoy tienen mín/máx en la fila de
  filtros de Análisis y Agregados): el panel agrega arriba dos campos
  **desde / hasta**, que guardan en el mismo estado de hoy (`filtAna`,
  `filtAgr`). No se pierde el filtro por rango.
- Desaparecen la barra de botones de filtro (`.mfilt-bar` / `fltXxxBar`) y la
  fila de filtros de texto (`tr.fltrow`). Los filtros que hoy no corresponden a
  una columna visible se ubican así:
  - Análisis "Mostrar (Con análisis / Separador / NO OK)": queda como un
    selector en la barra de la tabla.
  - Variedad / Prensa en Análisis y Agregados (se calculan desde el lote):
    pasan a ser columnas de solo lectura con su embudo. Agregados ya tiene
    `_variedad`; se suma `_prensa` donde falte.
- Sobre la tabla queda una **barra mínima**: buscador (sin emoji), `Limpiar
  filtros` (limpia buscador, embudos y rangos), el contador (`lotesCount`,
  `anaCount`, …) y las acciones de la pantalla (Agregar lote / Agregar fila).
- Leyenda de colores (`.legend-inline`) debajo de la barra, como hoy.
- Cabecera de tabla: versalitas, filete `--rule` abajo, `position:sticky`.
  Números alineados a la derecha con cifras tabulares.
- Alto riesgo mantiene sus dos filas por lote; el embudo filtra por lote
  completo (las dos filas juntas).
- Degustación mantiene sus botones OK / NO OK / motivos, restilizados.

## 6. Armado de documentos

Aplica a **Orden de muestras**, **Rellenos**, **Acción rápida** (dentro de
Degustación) y **Orden de trabajo** (dentro de Agregados).

- Dos columnas: **panel de campos** (~280 px, fondo `--panel2`) y **visor**
  (fondo gris piedra oscuro, la hoja blanca centrada con sombra suave).
- El panel ordena los controles de las `.toolbar` actuales en grupos
  numerados con rótulo en versalitas. Orden de muestras:
  1. *Qué lotes* — Incluir, Criterio NO OK, filtros, Regenerar lista
  2. *Encabezado* — N° de orden, Fecha, Día, Recibió
  3. *Valores por defecto* — Recipiente, Cantidad (stepper), Vasija,
     Aplicar a todos, Agregar fila
  4. *Mapas de barriles* — Adjuntar mapa, chips
  Rellenos, Acción rápida y Orden de trabajo usan los mismos grupos con sus
  campos (Rellenos suma *Instrucciones y pie* con sus dos textareas).
- Arriba del visor: contador ("23 lotes · 1 hoja · máx 25 por hoja") y el
  botón **Imprimir** (primario).
- Todos los ids de campos y botones se conservan; solo cambian de lugar.
- Acción rápida y Orden de trabajo siguen apareciendo debajo de su tabla al
  apretar su botón, como hoy, pero con esta forma de dos columnas.
- Bajo 1000 px el panel va arriba y el visor abajo.
- `@media print` no cambia: imprime solo las hojas.

## 7. Cargas desde Excel

Aplica a **Cargar análisis** y a la carga pegada de **Agregados**
(`agrImportWrap`).

- Tira de **tres pasos** numerados: *1 Pegar · 2 Revisar · 3 Cargar*. El paso
  activo se marca según el estado: 1 al entrar, 2 cuando `Analizar` dejó
  vista previa, 3 cuando se cargó.
- Izquierda: textarea, archivo, "primera fila = encabezado", **Analizar**.
  Derecha: las columnas esperadas como etiquetas (en vez del párrafo) y, tras
  analizar, el mensaje y la tabla de vista previa con **Cargar al historial**.
- Ids sin cambios (`pasteArea`, `fileCsv`, `chkHeader`, `btnAnalizar`,
  `importMsg`, `tPreview`, `btnConfirmarCarga`, y sus pares `agr…`).

## 8. Quitar Evolución y Asistente

- Se borran las pestañas, las `<section>` `v-evolucion` y `v-asistente`, su
  CSS (`.evo-*`, `.chat*`, `.chip-ej`) y su código en `app.js`:
  `renderEvolucion` y sus auxiliares de gráfico por lote, filtros de
  Evolución, `enviarPregunta`, `chatAppend`, `renderAsistente`, la aplicación
  de acciones del asistente, y sus ramas en `renderActive()` y en el
  cableado de eventos.
- Antes de borrar una función se verifica con búsqueda que nadie más la use
  (p. ej. el gráfico de línea de Evolución podría usarse en otro lado; si se
  usa, se queda).
- La ruta del servidor queda (ver Fuera de alcance).

## 9. Gráficos

Los colores escritos a mano en `app.js` (donut, barras, dispersión) pasan a una
constante `PALETA` única, alimentada de los tokens CSS con `getComputedStyle`
una vez por render. Ejes y grillas en tinta a baja opacidad, umbrales en
`--nook` punteado, puntos OK en `--ok`, fuera de norma en `--nook`.

## 10. Verificación

- Servidor local `npm run dev:sin-ia` (:8788) desde el worktree, con datos
  sembrados por la API local. Recorrer las 9 pestañas.
- Con números, no solo foto: sin scroll horizontal de la página a 1280 y
  390 px; contraste AA de `--muted` y estados; cada pestaña (incluidas las del
  "Más") activa su vista; cada embudo filtra, cuenta y se limpia; el rango
  desde/hasta filtra; ordenar sigue andando; editar una celda marca "sin
  guardar"; Guardar, Exportar, Historial y usuario responden.
- Cada documento imprime igual que antes (comparar vista de impresión).
- Descargar HTML del Dashboard y abrirlo.
- Que no quede ningún emoji ni hex viejo: `grep` sobre `index.html` y `app.js`.
- `npm test` y `tsc --noEmit` en verde.

## 11. Entrega

Commits en `feat/prensas-redisenio`. Merge a `main` con OK del usuario.
Publicar = el usuario corre `npx.cmd wrangler deploy` desde una carpeta con
`main` limpio.
