# OT de movimientos: Corte con lote existente, tanques grandes y vasijas manuales

Fecha: 2026-10-26 · Pedido del usuario al usar Emitir OT en Lotes web.

Esta entrega cubre **D** (Corte con lote existente) y **B + C** (tanques grandes,
vasijas manuales, suma de litros). Al terminarla se mergea a `main` de
emergencia (push a main = producción por Workers Builds). Las partes A (no
perder la OT al hacer clic afuera / minimizar), E (cambiar el N° de una OT
emitida) y F (check de guardado en la carpeta) quedan para la entrega
siguiente.

## D. Corte hacia un lote que ya existe

Hoy el paso "Lote" del asistente (`vista-ot-corte.js`) solo crea un lote nuevo
(En blanco o ⎘ Hijo de un origen), y `validarLoteDelCorte` rechaza un número
que ya existe.

**Cambio:**

- El paso "Lote" arranca con dos botones: **"Lote nuevo"** (lo de hoy) y
  **"Lote existente"**.
- "Lote existente" muestra un campo con sugerencias (datalist con los lotes de
  `DATOS().lotes`, número + id_texto). Se valida que el lote exista y que **no
  sea uno de los lotes de origen** (un lote no se corta consigo mismo; el vino
  que ese lote ya tiene en el tanque se queda ahí sin listarlo como origen).
- Con lote existente se **saltean los pasos de datos** (`PASOS_LOTE_CORTE`): el
  resumen muestra "Va al lote existente N (id_texto)". El ID de la hoja es el
  `id_texto` del lote existente.
- Al emitir no se crea ningún lote (`registrarOT` sin el `antes` que hace
  `unshift`). `ot.lote_corte = {lote, id_texto, existente: true}`. Los
  movimientos siguen siendo `traspaso` origen → lote destino, así el linaje
  queda igual.
- Borrar la OT no toca el lote (hoy tampoco toca el lote creado).

**Confirmar la OT** (`propuesta-ot.js`, rama del corte): si el lote del corte
ya tenía vino en el **mismo tanque** que se mide (mismo número en su
`vasija_actual`), lo medido es el contenido TOTAL del tanque: reemplaza a
`vasija_grande` en vez de sumarse (misma regla I3 que ya existe para el
trasiego). Si estaba en otro lado, se suma como hoy.

## B. Tanques grandes en la tarjeta del lote

Hoy la tarjeta de cada lote (`pintarLotes` en `vista-ot-emitir.js`) solo lista
los barriles del Mapa (barricas y T50). Los tanques del padrón
(`DATOS().vasijas`, 78 vasijas) no están en el Mapa.

**Cambio:**

- Si el lote tiene litros en tanque (`vasija_grande > 0`) y su `vasija_actual`
  nombra una vasija del padrón (`buscarVasija` sobre cada grupo de dígitos),
  la tarjeta muestra una casilla más, tildada por defecto:
  **"☑ T 201 · 4.850 L"** (litros = `vasija_grande`, editables).
- Campo **"+ tanque"** con sugerencias del padrón (número · tipo · capacidad)
  para sumar otro tanque a mano. Litros a completar (por defecto, si es el
  tanque donde está el lote, `vasija_grande`; si no, vacío).
- Se guarda en la OT como `lotes[i].tanques = [{num, litros}]` (foto, como los
  barriles).

**Al confirmar:** `vaciadoDeLote` descuenta de `vasija_grande` la suma de los
litros de `tanques` (además de los barriles). Si con eso el lote queda sin
tanque, `sinLoVaciado` ya saca el "T 201" del texto de `vasija_actual`, y el
**Inventario de tanques** (que se calcula desde los lotes) lo muestra vacío.
Las plantillas "desde tanque" (TQ a barricas, tq-tq) mantienen su campo
"Tanque origen", pero se **precarga** con el tanque del lote (si hay uno) y
los litros con `vasija_grande`.

## C. Vasijas manuales y suma de litros

- Botón **"+ vasija manual"** por lote: fila con *nombre* libre ("IBC 1",
  "bin 3") y *litros*. Se pueden agregar varias y quitar con ✕.
- Se guarda como `lotes[i].otras = [{nombre, litros}]`. No tocan envases ni
  inventario al confirmar (no están en el sistema); sí salen en el papel.
- **Litros previstos = suma** de barriles tildados + tanques + vasijas
  manuales, con el detalle a la vista ("4.850 + 225 + 300 = 5.375 L"). Sigue
  siendo corregible a mano; si se escribe a mano, deja de recalcularse (como
  hoy). Un "↺" vuelve a la suma.
- El campo de texto "Vasijas" que hoy aparece cuando no hay barriles tildados
  se reemplaza por "+ vasija manual" (las OT viejas con `vasijas_manual` se
  siguen leyendo y mostrando igual).

## Papel y movimientos

- `resumenVasijas` (columna Vasija y `vasija_origen` del movimiento) suma las
  partes: "10 barricas + T 201 + IBC 1".
- En la hoja de la OT las filas por vasija incluyen una fila por tanque y por
  vasija manual con sus litros, después de los barriles.
- `sinEscanear` y la comparación con el Mapa siguen mirando solo `barriles`.

## Compatibilidad

OT ya emitidas no tienen `tanques` ni `otras`: todo lee `|| []`. Sin
migración de datos.

## Pruebas

- Unitarias (vitest, módulos puros): `validarLoteDelCorte` con existente,
  `proponer` con corte a lote existente (mismo tanque → total; otro lado →
  suma), `vaciadoDeLote` con `tanques`, `resumenVasijas` con tanques y otras,
  suma de litros, detección del tanque del lote desde `vasija_actual`.
- Navegador con el mock local: emitir un Corte a lote existente y una OT con
  tanque + vasija manual, confirmarla y ver el Inventario de tanques.
