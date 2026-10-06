# Lotes web — pestaña Correcciones y Otros agregados

Fecha: 2026-10-05 · Rama: `feat/lotes-agregados`

## Qué pidió el usuario

1. La pestaña principal **Correcciones SO2** pasa a llamarse **Correcciones**.
2. Adentro, sub-pestañas: **Bitácora SO₂** (lo que hoy es Correcciones SO2),
   **Orden de corrección** (la pestaña de hoy, que deja de estar en la barra
   principal) y **Otros agregados** (nueva).
3. Otros agregados = TH2, T1, quitosano, levadura, nutrientes, etc. Base: el
   generador local `generar_OT_v3.py` (formato B015, "OT agregados nutrientes").
4. Opción B: la orden **y** una bitácora por lote.
5. Cada agregado registrado aparece como **una fila en la pestaña Análisis**.

## Navegación

- Los tres `section.view` siguen existiendo (`tab-so2`, `tab-ordencorr`,
  `tab-agregados`); el botón `data-v="so2"` se llama "🧴 Correcciones" y el de
  `ordencorr` se va de la barra.
- `nucleo.js` conoce el grupo `{so2, ordencorr, agregados} → botón so2`.
  `mostrarTab` marca activo el botón del grupo, muestra un selector
  `#corrSub` (mismo estilo que `.mov-sub` de Movimientos) y recuerda la última
  sub-pestaña en memoria: tocar "Correcciones" vuelve a la última.
- `vistaActiva()` pasa a devolver la vista realmente mostrada (variable), no el
  `data-v` del botón: si no, en `ordencorr` diría `so2` y `renderActivo`
  redibujaría la equivocada.
- `#corrSub` no se imprime.

## Dato

Lista `agregados` dentro de un registro de `DATOS().analisis` (lote + fecha):

```js
{ producto: 'TH2', cantidad: 380, unidad: 'g', ot_n: 'B231',
  registrado_por: 'Oriana', registrado_en: '2026-10-05T14:03:00Z',
  anulada?: { por, en } }
```

- Se engancha al registro de ese lote y fecha que ya tenga agregados, o si no
  a cualquiera de ese lote y fecha; si no hay ninguno, se crea
  `{lote, fecha_analisis, agregados: []}` (igual que SO₂).
- Volver a registrar la **misma OT** para el mismo lote y fecha reemplaza sus
  renglones no anulados (corregir un dato); una OT distinta se suma.
- Anular no borra: marca `anulada` con quién y cuándo, y queda tachado.
- Módulo puro `public/lotes/js/agregados.js` (sin DOM), con test.

## Sub-pestaña Otros agregados

- **Armar orden**: fecha, N° de OT (sugerido: próximo `B###` de los `ot_n` de
  correcciones y agregados), Emitió, Recibió. Tarjetas por lote: el lote
  completa vasija/variedad/proyecto desde `DATOS().lotes`. Filas
  producto (lista de comunes + "Otro…") + cantidad + unidad (g, kg, litros,
  ml). Plantillas: Siembra, Siembra + Sangría, Nutrición, Lisozyme.
  Botones **🖨 Imprimir** (papel) y **✔ Registrar en los lotes** (pide N° de OT).
  El borrador vive en memoria mientras la página esté abierta.
- **Bitácora**: fecha, lote, variedad, vasija, producto, cantidad, OT,
  registró; buscador; anular por renglón.
- **Papel**: RCI 08 compartido (`pintarHojas`), tabla
  `# | Lote | Vasija | Agregado | Cantidad | Check`, separador entre lotes.

## Pestaña Análisis

- Tipo de fila nuevo `agregado` (`analisis-filas.js`) cuando el registro tiene
  algún agregado no anulado. Columna nueva **Agregado** (solo lectura, texto
  "TH2 380 g · Quitosano 50 g"); la columna OT muestra la OT de los agregados.
- Sin veredicto de color; fondo propio. El botón eliminar de esa fila anula
  los agregados (no los borra).

## Que un agregado no se haga pasar por análisis

- `fml.ts`: `ultima_fecha` / `dias_desde_analisis` ignoran registros que solo
  tienen agregados.
- `linaje.ts`: un registro solo-agregados no genera evento "Analisis"; los
  agregados generan eventos `agregado` en la línea de tiempo de la ficha.

## Pruebas

- `test/lotes-agregados.test.mjs`: registrar, re-registrar misma OT, convivir
  otra OT, anular, revertir, sugerir OT, texto, papel.
- `test/lotes-analisis-filas.test.mjs`: fila `agregado`.
- Tests de `fml`/`linaje` para el registro solo-agregados.
- Prueba en navegador con el server local.
