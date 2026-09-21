# Mapa de Barriles: cerrar la pérdida silenciosa de órdenes

Fecha: 2026-09-17
Rama: `arreglo/perdida-de-ordenes` (sale de `feat/escaner-operario-simple`)
Entrega: 1 de 2

## Por qué

El 16/09 se confirmó que dos órdenes de vaciado (lotes 25312 y 25314) nunca
llegaron al servidor. Los operarios las cargaron, vieron el cartel verde de
confirmación, y el propio celular las borró al recuperar la señal. El informe
`informe-ordenes-perdidas-2026-09-16.pdf` tiene la investigación y la
reproducción (`repro_orden_perdida.js`).

Ese informe identificó **un** punto de pisada. Una auditoría posterior sobre los
seis caminos de datos de la aplicación encontró que son **cuatro**, más cinco
defectos del servidor que dejan pasar la pérdida sin frenarla ni registrarla.

Este documento cubre la Entrega 1: **frenar la pérdida**. La Entrega 2 (que el
cartel verde deje de mentir) va aparte.

Las referencias de línea son sobre `public/barriles/index.html` tal como está en
`feat/escaner-operario-simple`, que es la base de esta rama.

## Qué se confirmó

Todo lo que sigue fue verificado leyendo el código, no inferido.

### Los cuatro puntos donde se pisa el estado local

`hayPendientes()` (:1158) es `diffBoxesLocal().length > 0 || diffPaletsLocal().length > 0`.
Solo mira celdas del mapa y palets. Una orden del escáner vive en
`estado.escaneos`, que esa función no cuenta. Esa respuesta gobierna cuatro
decisiones distintas:

| # | Sitio | Qué pasa |
|---|-------|----------|
| 1 | `sondear()` :1112 | el servidor cambió y no hay pendientes → `adoptar()` pisa todo |
| 2 | `sondear()` :1108 | al volver de offline, si no hay pendientes cae al :1110 y termina en el mismo `adoptar()` |
| 3 | `sincronizar()` :1273 | sale con `return` **antes** de llegar al código de fusión de :1282-1307 |
| 4 | `iniciar()` :1419-1424 | ver abajo |

El cuarto es el más grave y no estaba en el informe original:

```js
if (localTiene && pbase && typeof pbase.boxes === 'string') {
    estado = local; reindexar(); baseBoxes = pbase.boxes;
    if (hayPendientes()) { await sincronizar(true); return; }   // única salida
}
if (d.estado) estado = d.estado;      // pisa lo que se acaba de cargar
```

Si el celular tiene órdenes sin subir pero no tocó el mapa, no entra al `return`
y la línea siguiente reemplaza el estado local por el del servidor. **Corre en
cada arranque de la aplicación.** No hace falta que se caiga el WiFi ni que otro
dispositivo escriba: alcanza con recargar la página.

Detalle que confirma que es un olvido y no una decisión: el código que fusiona
todas las colecciones sin perder nada **ya existe y está bien escrito**, en
:1282-1307. Es inalcanzable salvo que además se haya movido un barril en el mapa.

### El servidor

- **No hay compare-and-swap.** `rutas.ts:116-137` lee, compara
  `pedido.version !== doc.version`, y después escribe con `ON CONFLICT(modulo) DO
  UPDATE` sin ningún `WHERE version = ?`. Dos dispositivos que pasan el chequeo a
  la vez escriben los dos; el segundo pisa al primero.
- **El freno de borrado cuenta longitudes, no identidades.** `guardas.ts:79-90`
  usa `Math.max(0, actual.length - nuevo.length)`. Un guardado que **borra 2
  órdenes y agrega 2** da cero y no dispara el freno. Esa es exactamente la forma
  que tiene esta falla.
- **`revisiones`, `ediciones` y `pedidos` no están en `Perdidas`.** Se pueden
  borrar todas, en cualquier cantidad, sin ningún freno.
- **Un POST sin `estado` borra todo:** `const nuevoEstado = pedido.estado ?? {}`
  (`rutas.ts:121`).
- **El historial no permite auditar:** `detalle` se inserta siempre como `'[]'`
  (`rutas.ts:141`) y `resumen()` solo anota variaciones netas de cantidad.

### Un 5xx se traga en silencio

En `push()` (:1075-1099), `fetch` no rechaza ante un 500. La respuesta no es 409,
ni 412, ni `r.ok`: no entra a ningún branch, no entra al `catch`, la función
termina sin avisar y la insignia puede seguir diciendo «🔗 sincronizado».

### Lo que no existe

`beforeunload`, `pagehide`, `keepalive`, `sendBeacon`, `navigator.onLine` y
`addEventListener('storage')`: ninguno aparece en el archivo. Lo único que hay es
`setInterval(sondear, 3000)`, que sirve de latido y sobre eso se construye.

### Descartado

Que `adoptar(undefined)` corrompa el estado. No ocurre: revienta en `d.version`
dentro del `try`, cae al `catch` y solo pone la insignia en offline. No muta nada.

## Decisiones tomadas

1. **Online estricto**: ningún dato se da por guardado sin confirmación del
   servidor.
2. **Aplica a todo el estado**, no solo a las órdenes.
3. **La caída de señal se detecta en el momento**, no al guardar. Lo ya escaneado
   se retiene en pantalla; no se descarta.
4. **Barriles es web-only.** La copia del servidor local de bodega queda
   congelada; no se mantiene en paralelo.
5. **Primero frenar la hemorragia**, después el rediseño. El defecto está vivo en
   producción.

## Diseño

### Cliente: un marcador de "sucio", persistido

El enfoque ingenuo —que `hayPendientes()` sume `estado.escaneos.length > 0`— está
mal: después de adoptar del servidor, `escaneos` trae cientos de órdenes que ya
están arriba. La condición daría verdadero siempre y forzaría un `sincronizar()`
completo cada tres segundos.

Se marca el hecho, no se infiere del contenido:

```js
let pendienteLocal = false;   // hay algo escrito acá que el servidor no confirmó
```

- `guardar()` lo prende y lo persiste en `localStorage` junto al estado.
- Lo apaga un **200 del servidor** (en `push()` :1092 y al cierre exitoso de
  `sincronizar()` :1329) **y `adoptar()`**.
- `hayPendientes()` pasa a ser
  `pendienteLocal || diffBoxesLocal().length > 0 || diffPaletsLocal().length > 0`.

Que `adoptar()` también lo apague no es una concesión: adoptar el estado del
servidor significa, por definición, que no queda nada local sin confirmar. Y sin
eso el arreglo introduce un bucle. `adoptar()` se llama desde cuatro lugares; en
dos el marcador ya está apagado, pero los otros dos son el camino del **412
rechazado**: cuando el servidor frena un borrado masivo y el operario contesta
que no, `push()` (:1089) y `sincronizar()` (:1326) descartan lo local a
propósito. Con el marcador prendido ahí, `hayPendientes()` daría verdadero para
siempre y el operario recibiría un cartel de confirmación cada tres segundos, sin
salida.

Persistirlo es lo que tapa el punto 4: al arrancar, `iniciar()` lee el marcador
del disco y sabe que ese celular tiene trabajo sin subir aunque no haya tocado el
mapa.

**Alcance real del marcador.** *Detectar* sí cubre por construcción cualquier
colección que se agregue en el futuro: el marcador se prende en `guardar()`, que
es por donde pasa toda escritura, sin depender de que alguien se acuerde de sumar
la colección a una lista. *Resolver* no. La fusión de `sincronizar()` arranca del
estado del servidor y le aplica encima, colección por colección, las celdas del
mapa, `escaneos`, `tanques`, `pedidos`, `revisiones`, `ediciones` y `palets`.
Quedan afuera `inventario`, `fechaInventario` y `modoLote`: vienen tal cual de
`d.estado` y pisan lo local. Si el único cambio sin confirmar está en una de esas
tres, el marcador lo detecta y fuerza la fusión, pero la fusión no lo preserva.
Una colección nueva que no se sume a esa lista queda en la misma situación.
Cerrarlo es alcance de la Entrega 2 (portón único de escritura).

Cambios por punto:

- **1 y 2**: salen sin tocar nada más; ambos consultan `hayPendientes()`.
- **3**: la condición de :1273 incorpora el marcador, de modo que con trabajo sin
  confirmar no sale por el `return` y cae en la fusión de :1282-1307.
- **4**: `localTiene` (:1409) incorpora el marcador, y el `if (d.estado) estado =
  d.estado` de :1424 no corre si ya se adoptó el estado local.

### Cliente: el 5xx deja de ser silencioso

`push()` gana una rama final: si la respuesta no es 409, 412 ni `r.ok`, se trata
igual que un error de red (insignia en offline, `estabaOffline = true`,
`necesitaResync = true`) y el marcador **no** se apaga.

### Servidor

- **Compare-and-swap real.** `escribir()` pasa a
  `UPDATE documento SET version = ?, json = ?, autor = ?, guardado = datetime('now')
  WHERE modulo = ? AND version = ?`, con la versión previa en el `WHERE`. Si
  `changes() === 0`, otro escribió en el medio: se responde 409 con el documento
  actual, que es lo que el cliente ya sabe manejar (`push()` :1077).
  El `INSERT` inicial queda para el caso de que no exista la fila.
- **Freno por identidad.** `contarPerdidas()` compara **conjuntos de id** y cuenta
  los que desaparecen, en vez del delta de `.length`. Así un intercambio (borrar 2,
  agregar 2) se detecta como pérdida de 2.
- **`revisiones`, `ediciones` y `pedidos`** entran a `Perdidas` y a
  `superanUmbral()`, con umbral 3 —el mismo criterio que `escaneos`: borrar una o
  dos a mano es normal, tres ya es un accidente.
- **Validación de entrada.** Si `pedido.estado` falta o no es un objeto, se
  responde 400 en vez de reemplazar todo por `{}`.
- **Historial auditable.** `detalle` guarda los ids concretos que desaparecieron,
  serializados, en vez de `'[]'`.

## Fuera de alcance (Entrega 2)

- El portón único de escritura: que toda mutación pase por una función que postea
  y solo aplica a `estado` con el 200 en la mano.
- Los seis carteles verdes que confirman antes de hablar con el servidor: escáner
  (:4512), pincel de celdas (:2879), cámara de vasijas (:6016), palets (:5358),
  carga manual (:5578) e importación de inventario (:1792).
- Cortar la pantalla apenas se cae la señal.
- Reconexión automática sin recargar la página.

La Entrega 1 frena la pérdida. No arregla la mentira del cartel: un operario
puede seguir viendo verde sobre algo que todavía no subió, pero ese dato ya no se
va a destruir solo.

## Tests

Primero el test, después el arreglo. Cada punto necesita su prueba de regresión:

- **Los cuatro puntos de pisada**: `repro_orden_perdida.js` ya extrae las
  funciones reales del archivo de producción y corre el escenario. Se porta a
  `test/` como cuatro casos —uno por sitio— que hoy fallan y tienen que pasar.
  El del arranque (`iniciar()`) es el que más importa: es el que dispara sin que
  se caiga el WiFi.
- **El marcador**: que sobreviva a la recarga, y que solo lo apague un 200.
- **Compare-and-swap**: dos escrituras concurrentes desde la misma versión; la
  segunda tiene que recibir 409 y no pisar.
- **Freno por identidad**: un guardado que borra 2 órdenes y agrega 2 tiene que
  disparar el 412. Hoy pasa sin freno.
- **Colecciones nuevas en el freno**: borrar 3 revisiones tiene que frenar.
- **POST sin `estado`**: 400.

## Riesgos

- **`hayPendientes()` se vuelve más sensible.** Con el marcador prendido se va a
  llamar a `sincronizar()` en casos donde antes se adoptaba directo. Es más lento
  y más correcto. Si aparece un problema de rendimiento, se mide; no se relaja el
  criterio.
- **El compare-and-swap va a generar más 409.** Es la intención: hoy esos casos
  son escrituras que se pisan en silencio. El cliente ya sabe resolverlos
  fusionando.
- **Dos archivos de pantalla.** El informe advertía que hay que corregir la copia
  de bodega y la de la web porque se sincronizan copiándolas. Con la decisión de
  web-only, se corrige **solo la de la web** y la de bodega se congela. Si esa
  copia llegara a revivir, reintroduce todos estos defectos.
