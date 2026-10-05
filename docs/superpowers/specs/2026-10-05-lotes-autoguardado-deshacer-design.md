# Lotes web: autoguardado y deshacer con Ctrl+Z

Fecha: 2026-10-05 · Estado: diseño aprobado en el chat, implementación en
`feat/lotes-autoguardado-deshacer` (worktree `repos\catenainstitute-autoguardado`).

## Problema

En la web de Lotes cada cambio enciende "● Cambios sin guardar" y no llega al
servidor hasta que alguien aprieta **💾 Guardar**. El usuario quiere lo mismo que
tiene la web de Barriles: que se guarde solo, sin ningún botón extra.

Además quiere **deshacer con Ctrl+Z "como en cualquier plataforma"**. Hoy hay un
Ctrl+Z, pero muy limitado:

- vive solo en las grillas (`grilla-undo.js`) y solo anda con una celda
  seleccionada;
- guarda referencias a objetos, así que se borra entero cada vez que un 409 se
  combina con lo de otro dispositivo;
- no cubre nada fuera de las celdas: borrar un lote, cargar análisis,
  confirmar/borrar una OT, Config, mermas, órdenes de corrección.

Decisiones del usuario (2026-10-05):

- Ctrl+Z deshace **todo cambio de datos**, en cualquier pestaña: un solo
  historial para toda la página. Reemplaza al de las grillas.
- Respaldo completo en R2 **como máximo cada 5 minutos** (hoy es uno por
  guardado).
- La cuenta ya está en **Workers Paid**: el límite de 10 ms de CPU dejó de ser
  el freno (ver `plataforma-error-1102`).

Datos medidos (respaldo v75, 2026-10-02): el documento pesa **3,9 MB** (683
lotes, 7.438 análisis, 363 movimientos, 78 vasijas). `JSON.parse(JSON.stringify())`
del documento entero tarda ~65 ms en la PC de desarrollo; pasar cada fila a texto
por separado, ~22 ms.

## Enfoque elegido: diferencia automática después de cada acción

Todo cambio de datos ya pasa por un solo lugar: `markDirty()` en `nucleo.js`
(~50 llamadas). El deshacer se cuelga de ahí: después de cada acción se compara
el documento con una **foto por fila** (cada fila como texto JSON) y se anota qué
filas cambiaron. Cualquier botón actual o futuro que llame a `markDirty` queda
cubierto solo.

Descartado: que cada botón anote su propio antes/después. Son ~50 lugares, y el
que se olvide queda sin deshacer, en silencio.

Descartado: guardar copias enteras del documento por paso (3,9 MB × 100 pasos).

## Diseño

### 1. Autoguardado (`nucleo.js`)

- `markDirty()` programa un guardado **2 s después del último cambio**. Si llega
  otro cambio, el reloj vuelve a empezar.
- Nunca hay dos guardados a la vez. Lo que se edita mientras viaja un POST ya
  queda pendiente (`_ediciones`, sin cambios) y dispara el siguiente
  autoguardado cuando vuelve la respuesta.
- **Ctrl+S** guarda ya (corta la espera de 2 s). Se intercepta para que el
  navegador no abra "Guardar página como".
- Se va el botón **💾 Guardar** de `index.html`. El `statusBar` pasa a decir:
  - `● Cambios sin guardar` → `⟳ Guardando…` → `✓ Guardado (v123)`;
  - `⚠ Sin conexión — reintentando en 15 s` mientras reintenta.
- `beforeunload` sigue avisando, solo mientras quede algo sin subir o en vuelo.
- Las vistas que hoy llaman `await guardar()` antes de imprimir (OT, orden de
  muestras, orden de corrección, cruce, dashboard) no cambian: `guardar()` sigue
  existiendo y ahora además cancela el autoguardado programado.
- `vista-analisis.js` deja de leer `btnGuardar.disabled` para saber si hay
  cambios sin guardar: `nucleo.js` exporta `hayCambiosSinGuardar()`.

**Errores, sin cartelitos repetidos.** Hoy cada falla abre un `alert`. Con
autoguardado eso sería un cartel cada 2 s.

| Respuesta | Qué hace |
|---|---|
| Sin red / 5xx / tiempo vencido | Reintenta solo a los 5, 15, 30 y después cada 60 s. Lo tuyo sigue en el borrador del equipo (IndexedDB), como hoy. Un cambio nuevo o Ctrl+S reintenta ya. |
| 409 (otro guardó) | Se combina solo, como hoy (`fusionarDocumento`, hasta 4 intentos). Si no se puede, el mismo cartel de hoy con "Recargar y recuperar". |
| 401 (sesión vencida) | Un aviso, abre el login en otra pestaña y **deja de intentar** hasta que vuelva un cambio nuevo o Ctrl+S. |
| 403 (solo lectura) | Un aviso y deja de intentar por el resto de la sesión de la página. |
| 400 freno de borrado masivo | Sigue preguntando (es la protección). **Aceptar** = guardar forzado, como hoy. **Cancelar** = deshacer el último paso (sección 2) en vez de dejarlo colgado sin guardar. |

El pedido de usuario (`pedirUsuario`) que hoy aparece al primer guardado se
adelanta: si no hay nombre, se pide al primer `markDirty`, no en medio de un
autoguardado.

**Lo que NO cambia:** abrir la página no escribe nada. La lectura automática del
Mapa al cargar (`mermas-mapa.js`) sigue sin cerrar mermas; los ajustes de
`registrarAntesDeGuardar` siguen corriendo justo antes de cada POST, y como solo
hay POST si hubo un cambio tuyo, la regla "la web no guarda sola" de las mermas
se mantiene.

### 2. Deshacer y rehacer (`js/deshacer.js`, nuevo, puro)

**La foto.** Al cargar los datos se toma una foto por sección:

| Sección | Clave de cada fila |
|---|---|
| `lotes` | `lote` |
| `movimientos`, `ordenes_trabajo`, `mermas` | `id` |
| `vasijas` | `num` |
| `analisis`, `excepciones_analisis` | ninguna: se reconocen por contenido (como `fusionarPorContenido`) |
| `estado_lote` (objeto) | cada clave del objeto |
| `config` (objeto) | cada clave de primer nivel |
| `meta` | **no entra**: versión y autor los maneja el servidor |

Cualquier sección que aparezca en el futuro sin entrada en la tabla se trata
"por contenido" si es lista y "por clave" si es objeto, así que no se escapa
nada.

**Un paso.** `markDirty()` anota que hay una acción abierta. El paso se cierra
(se compara contra la foto y se apila) cuando pasa lo primero de esto:

- 300 ms sin otro `markDirty` (así una acción que llama varias veces, como
  confirmar una OT, queda como un solo paso);
- empieza un guardado;
- se aprieta Ctrl+Z / Ctrl+Y.

Un paso es una lista de cambios de fila, guardados como **texto JSON** (no
referencias a objetos: así un 409 no los invalida):

```
{ seccion, clave | null, antes: texto | null, despues: texto | null, pos }
```

`antes: null` = fila agregada; `despues: null` = fila borrada; `pos` = dónde
estaba, para devolverla a su lugar. En las listas con clave también se anota el
orden de las claves si cambió (el botón "Ordenar" de Lotes reordena sin tocar
filas). Un paso sin cambios no se apila. La pila guarda los **últimos 100
pasos**. Hacer algo nuevo después de deshacer descarta lo que se podía rehacer.

**Deshacer = aplicar cada cambio al revés, sobre el documento actual.** Cada fila
se revierte **solo si hoy está igual a como la dejaste** (`despues`):

- igual → se vuelve a `antes`. Las filas editadas se reescriben **en el mismo
  objeto** (se vacían y se les copia `antes`), así las grillas y la ficha que
  tienen la referencia siguen apuntando a algo vivo; las agregadas se sacan, las
  borradas se reinsertan en `pos` (o al final si la lista se achicó);
- distinta (otra persona la cambió después, o ya no existe) → **no se toca** y se
  avisa: *"No se deshizo el lote 26123: lo cambió otra persona después"*.

Rehacer es lo mismo con `antes`/`despues` invertidos. Deshacer y rehacer marcan
el documento como cambiado **sin apilar un paso nuevo** y lo sube el
autoguardado a los 2 s.

**Lo ajeno no entra nunca a tu historial.** La foto se vuelve a tomar, sin
apilar nada, cuando los datos cambian por algo que no hiciste vos:

- al cargar la página y al recuperar un borrador del equipo;
- después de combinar un 409 (lo que trajo el otro);
- después de `registrarAntesDeGuardar` (cierre automático de mermas);
- al recargar (`lotes:datos-recargados`).

En todos los casos, **antes** de esos cambios se cierra el paso abierto, para que
tus ediciones queden anotadas y lo del otro no.

**Teclas** (`keydown` en fase de captura, en `app.js`):

- Ctrl+Z deshace; Ctrl+Y y Ctrl+Shift+Z rehacen.
- Si el foco está en un `input`/`textarea`/`contenteditable` **que se está
  editando** (un buscador, una celda en edición), la tecla es del navegador: deshace
  lo que vas tipeando.
- Con un overlay abierto (asistentes, confirmaciones) no se deshace nada: el
  paso se cierra recién al aceptar.
- Mensaje corto al pie, 3 s: *"Deshecho: cambio en lote 26123 (Lotes)"*, *"Deshecho:
  3 análisis agregados"*, *"No hay nada para deshacer"*. Si el paso fue en otra
  pestaña, se nombra la pestaña pero no se salta a ella.

**Las grillas.** `grilla.js` deja de tener pila propia: su Ctrl+Z/Ctrl+Y llaman
al deshacer general y después repintan. `grilla-undo.js` y sus tests se borran.
Lo que se gana: el deshacer de las celdas sobrevive a un 409 y no exige tener
una celda seleccionada.

**Costo.** Cerrar un paso pasa a texto todas las filas (~22 ms en la PC de
desarrollo, quizá ~60–80 ms en una PC de la bodega) y no traba la escritura
porque corre cuando la acción ya terminó. Si al medir en la implementación pasa
de 100 ms, se optimiza comparando solo las secciones con filas tocadas (sin
cambiar el diseño).

### 3. Respaldos cada 5 minutos (`src/lotes/rutas.ts`)

Hoy `snapshotLotes` sube una copia completa a R2 en **cada** guardado. Pasa a
subirla solo si:

- el último respaldo de Lotes tiene **5 minutos o más**, o
- el guardado fue **forzado** (el freno de borrado masivo lo dejó pasar).

La hora del último respaldo vive en R2, en un objeto marca
`lotes/_ultimo-respaldo` (sin migración de D1). Dos guardados casi juntos
pueden subir dos respaldos: no importa.

El historial (`🕘 Historial`) sigue anotando **cada** guardado: quién, cuándo,
qué cambió. El último estado siempre está en D1; los respaldos sirven para
volver atrás.

Espacio estimado: 3,9 MB × 12 por hora × ~9 h ≈ **420 MB por día de trabajo**.
Los 10 GB gratis de R2 alcanzan para ~4–5 semanas; después, USD 0,015 por GB al
mes. **Recomendado (paso aparte, lo corre el usuario):** una regla de ciclo de
vida en el bucket que borre `lotes/` de más de 60 días.

Prensas y Barriles no se tocan.

## Fuera de alcance

- Mandar solo los cambios en vez del documento entero (el POST sigue siendo de
  3,9 MB; con Workers Paid no es urgente).
- Historial de deshacer que sobreviva a recargar la página.
- Autoguardado y deshacer en Prensas.

## Pruebas

**Automáticas** (`node --test`, como las demás):

- `test/lotes-deshacer.test.mjs`: foto y diferencia por sección (con clave, por
  contenido, objetos, orden); deshacer/rehacer de edición, alta, baja y
  reordenamiento; fila cambiada por otro → se saltea y se informa; paso vacío no
  se apila; tope de 100; nada nuevo después de deshacer descarta el rehacer.
- `test/lotes-autoguardado.test.mjs`: el programador de guardados como máquina
  de estados con reloj falso (espera de 2 s, nunca dos en vuelo, reintentos 5 →
  15 → 30 → 60 s, 401/403 paran, Ctrl+S corta la espera).
- `test/lotes-guardado.test.ts`: respaldo solo con 5 min o forzado.

**En el navegador** (servidor local, ver `catenainstitute-verificar-en-navegador`):
editar celdas, pegar un bloque, borrar un lote, confirmar una OT, cambiar Config;
deshacer y rehacer cada una; confirmar que se autoguarda sin botón; cortar la red
(reintento y recuperación); simular otro dispositivo que guarda en el medio (el
deshacer no pisa lo ajeno).

## Puesta en marcha

1. Merge a `main` y push.
2. El usuario publica desde `repos\catenainstitute` en `main` limpio
   (`npx.cmd wrangler deploy`).
3. Avisar a quien tenga Lotes abierto que **recargue** (Ctrl+F5): una pestaña
   vieja sigue con el botón Guardar y sin autoguardado. Las dos versiones
   conviven sin romper nada, porque el servidor no cambia de contrato.
4. Opcional: regla de ciclo de vida de 60 días en R2.
