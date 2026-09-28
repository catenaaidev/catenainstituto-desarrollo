# Mapa de Barriles: inventario simple, gana lo último

Fecha: 2026-09-28
Rama: `feat/inventario-simple` (sale de `main` 7c79fc6)
Alcance: solo la web (`public/barriles`, `src/barriles`, `src/lotes/motores/mapa.ts`).
La app local de la bodega está congelada (sin servidor ni acceso directo de
arranque, verificado el 2026-09-28), así que el `index.html` de
`mapa-barriles` NO se toca y la invariante de "12 inserciones / 9 borrados"
deja de valer a propósito.

## Por qué

Hoy cada fila del inventario se arma con cuatro fuentes: el Excel, la capa de
correcciones a mano (`estado.ediciones`), la de escaneos (`estado.tanques`) y
la de pendientes (`estado.revisiones`). La regla de precedencia es "la
corrección a mano le gana a la orden". Como escanear también escribe una
corrección, un barril escaneado queda **clavado**: la orden de vaciado de un
trasiego posterior no se aplica, crea un cartel, y la siguiente otro. La
última acción nunca gana. El 🗑 de la lista es la marca de ese escaneo que
nunca se va, y su lote viejo vuelve a aparecer "(del escaneo)" cuando una
orden vacía la fila.

## Qué se decidió (con el usuario, 2026-09-28)

- La lista del inventario queda con **Tipo · Número · Estado · Marca · Lote ·
  Cosecha · Fecha**. Se van Historial, 🗑, 🕘, "✏ a mano", "⚠ escaneado" y las
  filas "no figura en el inventario".
- Tres estados: **LLENO, MERMO, VACÍO**.
- Una sola fuente: la fila. Toda acción la escribe directo y le pone fecha.
- **Gana lo último que pasó, medido por la fecha del hecho.** Si dos acciones
  son del mismo día, gana la que se cargó después. Una orden de ayer cargada
  hoy no pisa lo que se hizo hoy (caso 5).
- **Llenado sobre un barril LLENO/MERMO con otro lote → cartel** (caso 6). El
  cartel ofrece la acción completa (LLENO/MERMO con cada lote en juego, o
  VACÍO); al tocarla queda resuelto. Puede haber más de un cartel por barril.
- **Sin modo offline** (caso 7). Sin conexión, la app no acepta cambios y lo
  dice fuerte. Nunca finge haber guardado.
- **Deshacer una orden** solo revierte los barriles donde esa orden sigue
  siendo lo último; avisa cuáles no (caso 8).
- **Importar el Excel** agrega vasijas nuevas y actualiza marca/capacidad. Si
  cambia estado/lote/cosecha de una existente, **cartel** (caso 9). Nunca borra
  filas (las bajas siguen siendo su propio flujo).
- **Número que no figura** se rechaza en el momento del escaneo (caso 10).
- **El operario escribe directo**, igual que el programador.
- **Historial de lotes por barril: se saca del todo.** (El historial de
  órdenes del escáner no es esto y se queda.)
- **Carteles viejos: se descartan con respaldo** (Excel) en la migración.

## Modelo

Fila de `estado.inventario`:

```
{ num, cap, marca, estado, lote, cosecha, litros,   // lo de siempre
  fecha,   // 'YYYY-MM-DD' del hecho que dejó la fila así ('' = sin dato)
  ts,      // Date.now() del momento en que se cargó (desempate del mismo día)
  por }    // 'inventario' | 'escaneo' | 'orden:<id>' | 'excel' | 'cartel'
           // (no `origen`: esa columna ya viene del Excel, es el de la barrica)
```

Coherencia que se impone en toda escritura:
- VACÍO ⇒ lote '', cosecha '', litros 0.
- LLENO ⇒ lote obligatorio, litros = cap (si hay cap).
- MERMO ⇒ lote obligatorio, litros se conservan.
- La cosecha se deduce del lote (`invCosechaDeLote`) si no viene; editable.

`estado.carteles[]` reemplaza a `estado.revisiones`:

```
{ id, num, fecha, ts, origen: 'orden' | 'excel', ordenId?,
  motivo,                                  // texto para la persona
  opciones: [{ estado, lote }] }           // cada una es un botón
```

Se cierra (se borra) al elegir una opción o cuando una acción más nueva
escribe la fila (`fecha` del hecho ≥ `fecha` del cartel).

Desaparecen: `estado.tanques`, `estado.ediciones`, `estado.revisiones`.
Se quedan: `altas`, `bajas`, `boxes`, `palets`, `escaneos` (órdenes),
`pedidos`.

## Una sola puerta de escritura

`escribirFila(fila, cambio, { fecha, ts, por })` en un módulo nuevo
`public/barriles/js/inventario.js` (puro, sin DOM, testeable como `altas.js`):

1. Si `fecha < fila.fecha` → no escribe, devuelve `{ viejo: true }`.
2. Aplica `cambio`, impone la coherencia, pone `fecha`/`ts`/`por`.
3. Cierra los carteles del barril con `fecha ≤` la nueva.

La usan:

| Acción | Cambio | Fecha |
|---|---|---|
| Doble click en estado/lote/cosecha | el campo, con coherencia | hoy |
| Doble click en marca | solo marca, **no** toca fecha | — |
| Escaneo: asociar lote | VACÍO→LLENO lote; LLENO/MERMO→mismo estado, lote nuevo (confirmación si cambia, como hoy) | hoy |
| Escaneo: ⊘ Vacía | VACÍO | hoy |
| Orden vaciado | VACÍO (ya VACÍO → nada, sin cartel) | fecha de la orden |
| Orden llenado | VACÍO→LLENO; mismo lote→LLENO (relleno de una MERMO); otro lote→**cartel** | fecha de la orden |
| Botón de un cartel | la opción elegida | hoy |
| Importar Excel | vasija nueva → fila; marca/cap → directo; estado/lote/cosecha distinto → **cartel** | fecha de importación |

Orden más vieja que la fila (caso 5): el barril va a la lista de "no
aplicados" del resultado de la orden con el motivo "hay un dato más nuevo del
DD/MM", sin cartel.

## Deshacer una orden (caso 8)

`orden.aplicado.cambios[]` ya guarda `antes`/`despues`. Se agrega el `ts` con
que se escribió. Se revierte el barril solo si la fila sigue con
`por === 'orden:<id>'` y ese `ts`; si no, va a "no se deshizo: cambió
después". Se quita el bloqueo por orden posterior (`invConflictoDeUndo`),
porque la comprobación por barril lo cubre con más precisión.

## Sin offline

Se va: `CLAVE`, `CLAVE_BASE`, `CLAVE_PENDIENTE`, la copia en localStorage, el
arranque desde la copia local, `decidirArranque`, el aviso "se subió lo que
cargaste sin WiFi", el botón "Descartar copia local" y `js/pendientes.js` con
sus dos tests.

Se queda la **fusión en el reintento por 409**, porque dos personas en línea a
la vez siguen existiendo: el push baja el estado fresco y le aplica lo propio.
Para el inventario la fusión pasa a ser por barril, gana el `ts` más nuevo;
los carteles se fusionan por `id`.

Sin conexión (el POST o el sondeo fallan por red):
- La insignia pasa a "⛔ sin conexión" y un velo a pantalla completa tapa la
  app: no se pueden cargar cambios hasta que vuelva.
- Si quedó un cambio sin confirmar, **vive solo en la memoria de la pestaña**:
  el velo lo dice ("no cierres ni recargues esta página") y, al volver la
  conexión, se sube solo por la misma fusión del 409. Se eligió esto en vez de
  descartarlo porque el caso típico es un corte de segundos justo al guardar, y
  tirar ese cambio sería perder la orden que el operario acaba de cargar. Lo que
  no hay es copia en el dispositivo: recargar o cerrar la página lo pierde.
- El borrador del escáner (`CLAVE_ESC_DRAFT`) se queda: el operario no tiene
  que retipear los números de una orden que no pudo subir.

Riesgo aceptado a sabiendas: en la nave, con WiFi flojo, una orden se puede
rechazar. La diferencia con hoy es que se rechaza **a la vista**; hoy puede
perderse en silencio (ver `2026-09-17-barriles-perdida-de-ordenes-design.md`).

## Migración (una sola vez)

Al abrir la app, si el estado trae `tanques`, `ediciones` o `revisiones`, el
programador ve un aviso con:
1. Cuántas correcciones quedan fijas (ya están aplicadas en las filas).
2. **La lista de barriles donde el último escaneo dice un lote distinto al de
   la fila**, para mirarla antes.
3. Cuántos carteles viejos abiertos se descartan.
4. Botón "⬇ Respaldo" (Excel con las tres secciones viejas) — obligatorio
   antes de habilitar "Migrar".

Migrar hace: `fecha` de cada fila = la más nueva entre su corrección, su
escaneo y la última orden aplicada que la tocó; borra las tres secciones; sube
con `confirmarBorrado: true` (el freno 412 las contaría como pérdida).

Agregado al implementar: la lista de discrepancias deja **elegir por vasija**
entre la fila y el escaneo, con la más nueva marcada. Hace falta porque los
escaneos del operario nunca llegaban a la fila (quedaban como cartel), así que
a veces el escaneo es lo último que se sabe. El piso de la comparación es
`inventarioCorte` (2026-08-18): el Excel unificado ya incorporaba todo lo
anterior. Los lotes se comparan por su código de 5 dígitos, porque los
escaneos traen anotaciones del rótulo ("26730 ROJO"). Con la foto del
2026-09-09 quedan 2 discrepancias, las dos erratas de tipeo.

Importar el Excel: una columna que la planilla no trae no se toca (antes se
leía como vacía y borraba ese dato de toda la app).

Operario: no ve el aviso y sigue trabajando; la app nueva lee las filas tal
como están.

## Lo que tiene que cambiar afuera de la pantalla

- `src/barriles/guardas.ts`: **sin cambios**. Los `carteles` NO llevan freno a
  propósito: se cierran en tanda por diseño (un vaciado de 30 barriles con
  cartel los cierra todos en un solo guardado) y un freno pediría confirmar
  cada vez. `tanques`/`revisiones`/`ediciones` siguen protegidas hasta la
  migración, que sube con `confirmarBorrado: true`.
- `src/barriles/rutas.ts`: listas de secciones del resumen/borrados.
- `src/lotes/motores/mapa.ts`: `lotes_con_tanque` sale de las filas del
  inventario con marca TANQUE y lote (más `tanques` si todavía existe);
  `conflictos` queda vacío sin `tanques`.
- Mapa de palets y ficha de tanque: el lote y la fecha salen de la fila.
- `js/altas.js` `usoDeVasijas`: "asociada a un lote" pasa a mirar la fila.
- Exportaciones: se van las hojas de historial, "Lote escaneado", "Fecha
  escaneo"; se agrega Fecha; la hoja de pendientes pasa a ser de carteles.

## Pruebas

- `test/barriles-inventario.test.mjs` (nuevo) sobre `js/inventario.js`:
  los casos 1–10 de la conversación, coherencia de estados, cierre de
  carteles, plan de orden (vaciado/llenado/relleno/otro lote/más vieja),
  deshacer por barril, import del Excel, plan de migración.
- Se borran `barriles-pendientes.test.mjs` y `barriles-arranque.test.mjs`.
- Se ajustan `barriles.test.ts`, `barriles-altas.test.mjs`,
  `lotes-barriles-ruta.test.ts` según corresponda.
- Carga del `index.html` contra DOM falso y referencias `$('id')` colgadas,
  si el repo tiene el equivalente de `test_carga_index.js`/`test_ids_html.js`.
- Prueba en el navegador con `dev:sin-ia` y D1 local.

## Despliegue

Claude mergea a `main` y pushea; el usuario corre `npx.cmd wrangler deploy`
desde `C:\Users\Bmax\repos\catenainstitute` con `main` limpio. Después, el
programador abre la app y migra.
