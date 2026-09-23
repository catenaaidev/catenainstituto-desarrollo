# Órdenes de trabajo de trasiego con el formato RCI 08, en Lotes

**Fecha:** 2026-09-23
**Estado:** diseño aprobado en chat; falta que el usuario revise este spec
**Módulo:** Lotes (web), pestaña Movimientos. Lee (no escribe) el Mapa de Barriles.

## El problema

Las órdenes de trabajo (OT) para los operarios se arman hoy en Excel, copiando
una plantilla (`Ordenes de Trabajo 2026\0700 Trasiego fin FML de barricas a
barricas 26217.xlsx` es la de referencia). Para cada orden alguien:

- escribe el número de lote, y un `VLOOKUP` contra el Excel LOTES trae la
  descripción (columna 9) y el orgánico/convencional (columna 10);
- escribe a mano cuántas barricas son y cuáles, y en la hoja *Barriles* completa
  N° barril, capacidad, año, proveedor, origen y tratamiento de cada una.

Los barriles de cada lote ya están en el Mapa de Barriles, y la descripción ya
está en Lotes. Hay tres fuentes que hoy se cruzan a mano.

La pestaña Movimientos ya tiene un **➕ Emitir OT** (`vista-movimientos.js`,
`_abrirModalOT` / `_pintarHojaOT`), pero es genérico: un lote, un origen, un
destino, una hoja con tres datos en grande. No sigue el formato RCI 08, no tiene
pasos y no sabe de barriles.

## Qué se mide (y dónde, para re-verificar)

- La plantilla de referencia tiene 3 hojas: **OT** (pasos con casillero OK,
  tabla *CIW lote / Vasija / Litros / Destino / Merma*, tabla de correcciones
  TH2/SO2, tabla de llenado, firmas), **Barriles** (Planilla de movimiento de
  barriles PCI 00 RCI 00 Rev00: bloque *Vaciado* y bloque *Llenado*, 19 filas
  cada uno) y **rotulo** (etiquetas lote + descripción, numeradas).
- La carpeta tiene 230 órdenes. Entre los trasiegos aparecen: *Trasiego fin FML
  de barricas a barricas* (30), *de TQ a barricas* (4), *de barricas a tanque*
  (NCZ/ER: **varios lotes cortados en un tanque**, columna extra *Litros
  caudalímetro*), *tq a tq*, *Bajada a barriles*.
- Lote → campos: `id_texto` es la descripción (col. 9 del Excel) y
  `organico_convencional` es la col. 10. Ejemplo: 26217 → "CS VSC Ct.3 Clon 169",
  Convencional. `esOrganico()` ya existe en `public/lotes/js/envases.js`.
- Barril del Mapa (`estado.inventario[]` del documento `barriles`): `num`,
  `estado` (LLENO/VACIO), `cap`, `litros`, `anio`, `marca` (= proveedor),
  `origen`, `trat` (= tratamiento), `lote`, `cosecha`. Ejemplo: el 26217 tiene
  una barrica, 2221713, TARANSAUD 2022 FRANCES REF.101 M, 225 L, que coincide
  con la OT 0700.
- Lotes ya lee el Mapa en vivo: `leerMapaBarriles()` en `src/lotes/rutas.ts`,
  que usan `/cruce` y `/orden-correccion`. Pero `normalizarMapa()` descarta
  `anio`, `marca`, `origen` y `trat`.

## Decisiones tomadas con el usuario

1. **Alcance:** un formato base con **plantillas por tipo de trasiego**, no solo
   la de barricas→barricas ni un editor de plantillas.
2. **Mapa de Barriles: solo lectura.** La OT no marca vaciados ni llenados; eso
   sigue siendo del escáner. Al confirmar, la OT *avisa* si algún barril sigue
   LLENO en el Mapa (faltó escanear).
3. **Confirmación: solo totales por lote** (tanque destino real, litros reales,
   merma), más operario y un check general de "pasos cumplidos". Los OK de cada
   paso quedan en el papel firmado, que sigue siendo el registro de calidad.
4. **Impresión: las tres hojas** (OT, Planilla de barriles, Rótulos), cada una
   activable o desactivable al imprimir.

## Diseño

### Modelo de datos

Clave nueva en el documento de Lotes: `ordenes_trabajo: OT[]`. Se agrega junto a
`movimientos`, sin migración, porque la ausencia equivale a `[]`.

```js
{
  id: 'ot-<base36>',
  ot: 'OT-2026-014',            // mismo esquema que proximoNumeroOT()
  plantilla: 'barricas-barricas',
  fecha: '2026-09-23',           // prevista
  estado: 'pendiente' | 'ejecutado',
  destino: 'T 201',              // tanque destino previsto; '' = "Tanque pulmón: ____"
  lotes: [{
    lote: '26217',
    id_texto: 'CS VSC Ct.3 Clon 169',   // foto al emitir
    organico: false,                     // foto al emitir
    barriles: [{ num, cap, litros, anio, marca, origen, trat }],  // foto, solo los tildados
    vasijas_manual: '',                  // texto libre si no hay barriles en el Mapa ("1 x t500")
    litros_previstos: 225,               // suma de cap de los barriles tildados, editable
    // al confirmar:
    destino_real: '', litros_reales: null, merma: null,
    mov_id: 'mov-…',                     // el movimiento que genera este lote
  }],
  pasos_cumplidos: false,
  operario: '', comentario: '',
  emitida_por, emitida_el, confirmada_por, confirmada_el,
  mapa_version: 2304,           // versión del Mapa usada para la foto
}
```

**Por qué hay una foto de los barriles:** la hoja impresa tiene que coincidir con
lo que queda en el sistema aunque el Mapa cambie después (lo que va a pasar
apenas el operario escanee el vaciado).

**Relación con `movimientos`:** al emitir se crea **un movimiento `pendiente`
por lote** (`tipo: 'trasiego'`, `vasija_origen` = lista corta de los barriles,
por ejemplo "1 barrica (2221713)" o "5 barricas", `vasija_destino` = destino,
`litros` = previstos, `ot` = número). Al confirmar pasan a `ejecutado` con los
valores reales. Etapas y linaje siguen leyendo solo `movimientos`: no cambian.

**Validación del guardado:** `validarDatos()` deja pasar claves que no conoce,
así que la sección se guardaría igual sin tocar nada. Se agrega igual a
`SECCIONES_LOTES.secciones` en `src/prensas/validacion.ts` (sin sumarla a
`requeridas`) para que tenga el mismo control de "es una lista de objetos" y el
**freno anti-borrado masivo** que ya protege a `movimientos`.

Borrar o anular una OT queda **fuera de alcance**. Hoy se borra el movimiento
desde la grilla, como siempre.

### Plantillas (`public/lotes/js/ot-plantillas.js`, módulo puro)

Cuatro plantillas, con los textos copiados de las órdenes reales:

| id | nombre | origen del texto |
|---|---|---|
| `barricas-barricas` | Trasiego fin FML de barricas a barricas | 0700 |
| `tq-barricas` | Trasiego fin FML de TQ a barricas | 0837 / 0854 |
| `barricas-tanque` | Trasiego de barricas a tanque (corte) | 0885 / 0908 |
| `tq-tq` | Trasiego de tq a tq | 0898 |

Cada plantilla es una lista ordenada de **bloques**:

- `{tipo:'titulo', texto}`: la banda (TRASIEGO / FIN FML);
- `{tipo:'paso', texto, ok?:true, destaca?:'organico'}`: fila con casillero;
- `{tipo:'tabla-vaciado', columnas:[...]}`: una fila por lote, con columnas de la
  plantilla (la de corte agrega *Litros caudalímetro*) y fila de total;
- `{tipo:'rotular'}`: "Rotular vasija ID" con lote y descripción;
- `{tipo:'tabla-correccion'}`: CIW lote / Cant. vasijas / Vasijas / Producto /
  Cantidad / Tipo, con TH2 y SO2 precargados y el resto en blanco;
- `{tipo:'tabla-llenado'}`: CIW lote / Vasija / Litros / Destino / Dar lleno con;
- `{tipo:'dato', texto}`: línea a completar ("% final de O2: ____", "Registrar
  cantidad de barriles llenos: ____").

Emitió/Recibió y las firmas van fijos al pie, en todas las plantillas.

### Lógica pura (`public/lotes/js/ot-armado.js`)

Sin DOM, para poder testearla:

- `barrilesDeLote(inventario, lote)`: las unidades del lote en el Mapa;
- `armarOT({plantilla, lotes, barrilesPorLote, destino, fecha, numero})`: el
  objeto OT;
- `litrosPrevistos(barriles)`: la suma de `cap`;
- `movimientosDeOT(ot)`: los movimientos pendientes a crear;
- `confirmarOT(ot, reales)`: el nuevo estado de la OT y de sus movimientos;
- `sinEscanear(ot, inventarioActual)`: los barriles de la foto que en el Mapa
  siguen LLENO con el mismo lote.

### Backend

`GET /lotes/api/barriles?lotes=26217,26218` en `src/lotes/rutas.ts`. Reusa
`leerMapaBarriles()` y devuelve `{version, por_lote: {lote: [barril…]}}`, con
los campos completos (`num, estado, cap, litros, anio, marca, origen, trat`).
Normaliza el lote con `normalizarLote()` y trae solo los pedidos. Si el Mapa no
está, responde 503 con `MapaNoDisponible`, igual que `/cruce`.

`normalizarMapa()` no se toca: tiene otros dos consumidores.

### Pantalla: Emitir OT

El botón **➕ Emitir OT** abre el modal nuevo, que reemplaza a `_abrirModalOT`
para emitir. **Registrar movimiento hecho** y la grilla no cambian.

1. Plantilla (select), N° OT (sugerido con `proximoNumeroOT`), fecha, tanque
   destino.
2. Lotes: un campo donde se escribe un lote y Enter lo agrega. Por cada lote se
   muestra una tarjeta con descripción, una marca 🟢 si es orgánico y la lista de
   barriles del Mapa **todos tildados**. Se pueden destildar. Si el lote no
   tiene barriles en el Mapa, aparece un campo de texto *Vasijas* para cargarlas
   a mano (tanques, t500). Litros previstos = suma, editable.
3. Avisos que no bloquean: lote que no existe en Lotes; barril que figura VACIO
   en el Mapa; Mapa no disponible (sigue en modo manual).
4. **Emitir** → guarda (igual que hoy: guardar antes de ofrecer imprimir) →
   ofrece imprimir.

### Impresión

Contenedor oculto `#otMovHoja`, clase `printing-ot-mov` en el body (la
convención actual), una hoja A4 por página (`page-break-after`). Cada hoja lleva
el encabezado del documento de calidad: *BODEGAS ESMERALDA S.A. · ORDEN DE
TRABAJO - RCI 08 - Rev. 02 · Aprobado por: Roy Urvieta · Emisión: 28/01/2013*
(la Planilla lleva su propio código, *PCI 00 RCI 00 - Rev00 · Emisión:
1/7/2020*).

1. **OT**: fecha, N° de orden, lote(s) con su descripción y los bloques de la
   plantilla, con casilleros ☐ vacíos.
2. **Planilla de movimiento de barriles**: *Vaciado* completo con los barriles
   de la foto (N°, Lote, N° barril, Capac, Año, Proveedor, Origen, Tratamiento)
   y *Llenado* con las mismas filas numeradas en blanco. Si pasa de 19
   barriles, sigue en otra hoja.
3. **Rótulos**: una etiqueta por barril vaciado (lote grande, descripción,
   número 1..N), en grilla de 2 columnas.

En el modal de impresión hay tres checkboxes (OT / Planilla / Rótulos), todos
tildados. También se puede reimprimir desde el 🖨 de la fila.

### Pantalla: Confirmar

Se entra desde la OT pendiente (botón en la fila del movimiento, que abre la OT
completa). Por lote: destino real (precargado con el previsto), litros reales y
merma. Para toda la OT: operario (obligatorio), ☐ pasos cumplidos y comentario.
Al aceptar:

- la OT y sus movimientos pasan a `ejecutado` con los valores reales;
- se pide `/barriles` de nuevo y se muestra `sinEscanear()`: "Estos barriles
  siguen LLENOS en el Mapa con el lote 26217: 2221713. ¿Faltó escanear?". Es un
  aviso: no bloquea y no toca el Mapa.

### Casos de error

- Mapa no disponible (503 o sin red): la OT se emite en modo manual y la hoja
  sale sin la Planilla precompletada (con las filas en blanco).
- Guardado con conflicto (409): mismo comportamiento que hoy, no se ofrece
  imprimir hasta que se guarde.
- OT vieja (movimiento con `ot` pero sin entrada en `ordenes_trabajo`): se sigue
  imprimiendo con la hoja genérica actual (`_pintarHojaOT` queda para ese caso).

## Tests

- `test/lotes-ot-armado.test.mjs`: `armarOT` con 1 lote y 5 barriles, un corte
  con 3 lotes al mismo destino, un lote sin barriles (manual), la suma de
  litros, `movimientosDeOT` (uno por lote, pendientes, con `ot`),
  `confirmarOT` (pisa previstos, pasa a ejecutado) y `sinEscanear`
  (LLENO + mismo lote = aviso; VACIO o lote distinto = no).
- `test/lotes-ot-plantillas.test.mjs`: cada plantilla tiene exactamente una
  tabla de vaciado, todos los bloques tienen tipo conocido y los ids son únicos.
- En el test existente de validación: guardar con `ordenes_trabajo` que no es
  lista da error, y perder la mayoría de las OT en un guardado se frena.
- `test/lotes-barriles-ruta.test.ts`: `/barriles` filtra por lote, normaliza
  (`"26217 "` → `26217`), trae los campos completos y da 503 sin Mapa.
- Verificación visual en `dev:sin-ia` (:8788) con una D1 local sembrada con un
  documento de barriles de prueba: emitir, ver las tres hojas en vista de
  impresión, confirmar y ver el aviso de sin escanear.

## Fuera de alcance

- Escribir en el Mapa de Barriles (reservar, vaciar o llenar).
- Editor de plantillas desde la app.
- Plantillas que no son de trasiego (muestras, correcciones, limpieza).
- Precargar dosis de TH2/SO2 desde la Orden de corrección.
- Anular o borrar una OT como unidad.
- Detalle por barril al confirmar.

## Despliegue

Solo código; no hay migración de D1 (la clave nueva vive en el JSON del
documento). Después del merge, el usuario corre `npx.cmd wrangler deploy`
**desde una carpeta con `main` limpio** (ver memoria: `wrangler deploy` publica
la carpeta, no la rama).
