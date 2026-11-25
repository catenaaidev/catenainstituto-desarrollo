# Orden de corrección: la hoja en vivo, editable encima

Fecha: 2026-11-02 · Pedido: "que visualmente se vea la OT de corrección mientras
voy editando, así como lo hacen las OT de movimientos o las de muestras".

## Decisiones (con el usuario)

1. **Al lado.** Dos columnas: a la izquierda lo de siempre (encabezado N°/fecha/
   emitió/recibió, tabla con Genérica/Por barril, objetivo, filtros, suprimidos);
   a la derecha la hoja de papel (`#ocPaginas`, antes oculta), fija al scrollear.
   En pantallas angostas la hoja pasa abajo. Al imprimir sale solo la hoja, igual
   que antes.
2. **Encabezado editable sobre la hoja**: título, fecha, N° de orden, Emitió y
   Recibió son campos `data-campo` (`pintarHojas({editable:true})`, igual que la
   Orden de muestras), sincronizados en los dos sentidos con los de arriba.
   Escribir el N° en la hoja cuenta como tocarlo a mano (`_ocNumAuto = false`).
3. **Dosis editable por renglón, y se guarda.** Cada renglón del papel tiene la
   dosis como campo. Lo escrito pasa a ser la "dosis a mano" de TODAS las vasijas
   que ese renglón junta (Genérica) o de esa vasija (Por barril).

## Modelo

- `_ocManuales`: `Map lote -> Map claveVasija -> {mbk_g, ml_solucion}`, en memoria
  (como `_ocObjetivos`). Clave de vasija: `n:<num>` si tiene número de barril,
  si no `i:<índice en l.barricas>`.
- Módulo puro nuevo `orden-correccion-manual.js`:
  - `claveVasija(b, i)`
  - `dosisDesdeUnidad(valor, unidad)` — lo tipeado en la unidad vigente → las dos
    formas. Misma fórmula que `_dosis`: 1 mL de solución d1030 = 0,11 g de MBK.
  - `aplicarManuales(filas, manuales)` — sobre la salida de `_ocBuildRows`: pone
    `clave` y `manual` en cada fila de barrica, reemplaza su dosis si hay una a
    mano y recalcula los totales del lote desde las dosis resultantes.
- `_ocBuildRowsLocal()` = `aplicarManuales(_ocBuildRows(...), _ocManuales)`. De ahí
  salen la tabla, el chip, el papel y `armarOrdenGuardada`: **papel = guardado =
  ejecutado** sigue valiendo por construcción.
- `gruposPorLote` / `filasPapelPorModo` llevan `claves` (las vasijas del renglón) y
  `manual` (alguna vasija del renglón tiene dosis a mano). Un barril con dosis a
  mano distinta se separa solo de su grupo (se agrupa por dosis impresa).

## Reglas

- La dosis se escribe en la unidad vigente; la otra se recalcula.
- Vacío → vuelve a la calculada. No numérico o negativo → no se acepta (se repinta
  con la anterior).
- La celda a mano se ve marcada en pantalla, con ↺ para volver a la calculada; al
  imprimir no se ve ni la marca ni el botón.
- Cambiar el **objetivo** de un lote borra sus dosis a mano. Cambiar unidad o modo
  las mantiene. 🔄 Recargar las borra. Al guardar una orden, se borran las de sus
  lotes.
- Se repinta en `change` (no en cada tecla); el foco vuelve al campo al que se
  movió el usuario. Enter pasa a la dosis siguiente.

## Pruebas

- vitest del módulo puro: clave, conversión de unidades, dosis a mano en fila y
  totales, renglón Genérica que reparte, separación de grupo, y la garantía
  papel == guardado con dosis a mano.
- Navegador con el mock sin login: editar dosis/encabezado sobre la hoja, ver la
  tabla y el chip actualizados, imprimir y que la orden guardada tenga la dosis
  a mano.

## Vueltas siguientes (mismo PR)

- **2.ª:** sin columna Posición/Aviso (avisos debajo de la variedad), sin tarjeta
  N°/Fecha/Emitió/Recibió (se escriben solo sobre la hoja; viven en `_ocNum`,
  `_ocFecha`, `_ocEmitio`, `_ocRecibio`), ▾ en todas las columnas + buscador.
- **3.ª: la hoja ES la pantalla** (como la Orden de muestras). Ya no hay tabla al
  lado: cada lote lleva arriba de sus renglones una **banda de pantalla**
  (`bandaLote`, `tr.oc-banda`) con ☑, lote, Genérica/Por barril, variedad, pH,
  SO₂, objetivo editable, total y avisos. La banda va dentro de `renderFila` del
  primer renglón del lote, así que no cuenta como renglón: numeración y corte de
  hojas son los del papel. Al imprimir se oculta (`@media print`).
  - Filtros como botones en la barra (Lote, Variedad, pH, SO₂, Estado del cruce,
    Objetivo, Dosis, Proyecto, Etapa) + buscador + "Ordenar por" con ▲▼.
  - Los lotes destildados o en una orden pendiente no tienen renglones (ni
    banda): se listan debajo de la hoja en "Fuera de esta orden", con su ☑.
  - En Genérica ya no se ve el detalle barrica por barrica en pantalla, solo el
    renglón agrupado que se imprime.
