# Lotes web — Órdenes de trabajo editables sobre la hoja

Fecha: 2026-09-29 · Estado: aprobado por el usuario en chat

## Problema

En la pestaña **Movimientos** las OT de trasiego (formato RCI 08, plantillas de
`ot-plantillas.js`) se emiten con un modal y después solo se pueden imprimir o
confirmar desde la fila de uno de sus movimientos. No hay un lugar para ver las
OT como tales, y los textos de los pasos son siempre los de la plantilla: si una
orden puntual necesita una instrucción distinta, hoy no hay forma de cambiarla.

La **Orden de muestras** ya resolvió esto para su hoja: la hoja A4 se ve en
pantalla tal cual se imprime y se edita encima (`hoja-campos.js`,
`orden-hoja-filas.js`). El usuario quiere lo mismo para las OT.

## Decisiones del usuario

- Lo único editable sobre la hoja son **los textos de los pasos** de ESA OT
  (cambiar, agregar, quitar renglones). No se crean OT sobre la hoja, no se
  corrigen lotes/litros/destino, no se confirma sobre la hoja.
- Se llega a la hoja por una **lista de OT** en una sub-pestaña nueva.
- Una OT **ejecutada es de solo lectura** (registro de calidad).

## Pantalla

Movimientos gana un selector segmentado arriba (mismo estilo que
`#ordenControls .oc-tipo`): **📋 Historial | 📝 Órdenes de trabajo**. La
elección vive en memoria (arranca en Historial).

- **Historial**: la tabla actual, sin cambios.
- **Órdenes de trabajo**:
  - **Lista** (izquierda): una fila por entrada de `DATOS().ordenes_trabajo`,
    con N°, fecha, plantilla (nombre), lotes (o el lote del corte) y estado
    (● pendiente / ejecutada). Filtro *Pendientes / Todas* (default:
    Pendientes) y buscador por N° o lote. Orden: fecha descendente.
  - **Botonera**: ➕ Emitir OT, 🖨 Imprimir, ✓ Confirmar (solo pendiente),
    ↺ Textos de la plantilla (solo pendiente con textos editados).
  - **Hoja** (derecha; debajo en pantallas angostas): la hoja 1 (`hojaOT`) de
    la OT elegida a tamaño A4 real, como `#otPaginas` de Orden de muestras. La
    planilla y los rótulos no se muestran en pantalla; se siguen imprimiendo.
  - Sin OT elegida: texto guía. Sin OT en la lista: texto vacío.

### Edición sobre la hoja

- Cada bloque `paso` y `dato` es un `<textarea>` que crece con el texto
  (`field-sizing:content`), con `data-bloque=<índice>`.
- Al pasar el mouse por un renglón aparecen **✕** (quitar) y **＋** (insertar un
  paso vacío debajo). No se imprimen.
- Tablas (`tabla-vaciado`, `tabla-correccion`, `tabla-llenado`), `ids` y
  `rotular` **no se editan ni se quitan**: salen de los datos de la OT. Se
  puede insertar un paso debajo de ellos.
- Se conservan las marcas de cada bloque (`ok`, `destaca`) al editar su texto.
  Un paso insertado es `{tipo:'paso', texto:''}`.
- OT ejecutada: la hoja sale como hoy (texto plano), sin ✕ ni ＋.
- Tipear actualiza el dato y marca "sin guardar" (`markDirty`) **sin repintar**
  (no se pierde el foco). ✕ y ＋ repintan la hoja y devuelven el foco al
  renglón correspondiente.
- Un paso que quedó vacío no se imprime (mismo criterio que
  `:placeholder-shown` de la Orden de muestras).

### Flujos que cambian

- **Emitir OT** (modal) y el **asistente del Corte** siguen igual. Al guardar
  bien, en vez de abrir el diálogo de impresión, se pasa a *Órdenes de trabajo*
  con la OT nueva elegida. Si el guardado falla, el aviso de hoy queda igual.
- **🖨 en una fila del Historial**: si la fila pertenece a una OT de
  `ordenes_trabajo` (`otDeMovimiento`), pasa a la sub-pestaña con esa OT
  elegida. Si no (OT viejas, anteriores a las plantillas), sale la hoja
  genérica de siempre (`_imprimirOT`).
- **✓ en el Historial**: sin cambios.
- **🖨 Imprimir** en la sub-pestaña abre el diálogo de hojas de hoy
  (`abrirImprimirOT`), que imprime con los textos editados.

## Datos

Opción elegida: **copia de los bloques dentro de la OT** (`ot.bloques`), creada
recién en la primera edición.

- `bloquesDeOT(ot)` = `ot.bloques` si existe, si no `plantilla.bloques`.
- Primera edición: `ot.bloques = structuredClone(plantilla.bloques)` y se edita
  la copia. Las OT que nunca se editan no guardan nada extra (el documento de
  Lotes pesa ~1,6 MB y el plan Free corta a 10 ms de CPU).
- **↺ Textos de la plantilla**: `delete ot.bloques` (con confirmación).
- Los movimientos no se tocan: los textos no cambian litros, lotes ni vasijas.
- OT con `ot.bloques` cuya plantilla después cambia: conserva su copia (es lo
  buscado: el papel de esa OT no cambia solo).

Descartadas: guardar diferencias por índice de renglón (insertar/quitar corre
los índices y aplica cambios al paso equivocado); editar la plantilla (el
usuario pidió cambios por OT).

## Código

- **`public/lotes/js/ot-bloques.js`** (nuevo, puro, testeado):
  `bloquesDeOT(ot)`, `editarTexto(ot, i, texto)`, `insertarPaso(ot, i)`,
  `quitarBloque(ot, i)` (solo `paso`/`dato`), `volverAPlantilla(ot)`,
  `tieneTextosPropios(ot)`, `esEditable(ot)` (pendiente). Todas copian los
  bloques de la plantilla a la OT antes de la primera mutación; nunca mutan la
  plantilla.
- **`public/lotes/js/ot-hojas.js`**: `hojaOT(ot, { editable })` usa
  `bloquesDeOT(ot)`; con `editable` los `paso`/`dato` salen como textarea con
  sus botones. `hojasOT` (impresión) sigue sin `editable`, salvo que los pasos
  vacíos no salen.
- **`public/lotes/js/vista-ot-lista.js`** (nuevo): la sub-pestaña (lista,
  filtros, botonera, hoja y cableado de la edición). Exporta
  `renderOrdenesTrabajo(sec)` y `elegirOT(id)`.
- **`public/lotes/js/vista-movimientos.js`**: selector Historial | Órdenes,
  🖨 del historial deriva a la sub-pestaña.
- **`public/lotes/js/vista-ot-emitir.js`**: `registrarOT` llama a `onListo(ot)`
  y la vista pasa a la sub-pestaña; ya no abre `abrirImprimirOT`.
- **`public/lotes/index.html`**: CSS del selector, la lista, la hoja en
  pantalla y los controles de edición (ocultos al imprimir).

## Pruebas

- `test/lotes-ot-bloques.test.mjs`: copia perezosa, editar/insertar/quitar,
  que no se pueden quitar tablas, volver a plantilla, plantilla intacta.
- Tests de `hojaOT` editable y de que el paso vacío no se imprime (en el test
  existente de `ot-hojas`).
- Navegador (`dev:sin-ia`, :8788): emitir una OT → cae en la hoja; editar,
  insertar y quitar pasos; guardar, recargar y ver los cambios; OT ejecutada
  de solo lectura; 🖨 del historial abre la hoja; PDF sin ✕/＋ ni bordes.

## Fuera de alcance

Reordenar pasos (↑↓), editar tablas/datos de la OT, editar las plantillas por
defecto, crear o confirmar OT sobre la hoja.

## Publicación

Trabajo en el worktree `catenainstitute-ot-editables` (rama
`feat/ot-editables`), merge a `main` y push. El deploy lo corre el usuario
(`npx.cmd wrangler deploy` desde `repos\catenainstitute` en `main` limpio).
