# Modo operario de Barriles: portada y Registro — diseño

Fecha: 2026-10-06 · Rama: `feat/barriles-operario` · Solo `public/barriles/` (web)

## Por qué

Antes, los llenados y vaciados se anotaban en el Excel *Registro vaciado y llenado
de barricas* (hoja "Datos Ori"): cada **columna** era una orden, con la fecha, la
OT, el **lote arriba**, LLENADO/VACIADO y debajo la lista de barriles. Los
operarios dicen que se leía fácil. El problema era encontrar algo: un archivo por
mes y sin buscador.

En la web, el modo operario tiene seis pestañas, y lo cargado antes vive en un
"Historial de órdenes" plegado dentro de Escáner. Es una tabla que muestra solo la
**cantidad** de barriles por orden; para ver los números hay que abrir orden por
orden con 👁. Se perdió justo lo que hacía visual al Excel, y tampoco hay buscador.

Objetivo: que cualquier operario, sin saber de computación, llegue, entienda dónde
está y encuentre lo cargado antes, sin perder la forma "lote arriba, barriles
abajo".

## Alcance

- Todo el modo operario (`body.rol-operario`): portada nueva, navegación nueva,
  estilo más legible y la pantalla **Registro**.
- El programador (`rol-programador`, admin) **no ve ningún cambio**.
- Ni servidor, ni API, ni datos. Todo sale de `estado.escaneos` y
  `estado.inventario`, que ya existen.
- Las pantallas de carga (Escáner, Cargar box, Asociar vasija) **no cambian por
  dentro**: solo se ven con el estilo nuevo. Así nadie aprende de nuevo a cargar.
- Dispositivo principal: la **PC de la nave** (pistola + mouse, ~1366 px). Tiene
  que seguir siendo usable en el celular, pero no se diseña para él.
- La app local de mapa-barriles está congelada (ver corte web-only): este cambio
  va **solo a la web**, a propósito. Se rompe a sabiendas la invariante de los
  dos `index.html`.

## 1. Portada y navegación

- Al entrar, el operario ve la **portada** (panel `#panel-inicio`): un saludo con
  la fecha y cuatro botones grandes:
  - **Cargar box**: ubicar barriles en el mapa (hoy, "📦 Cargar box").
  - **Llenado / vaciado**: escanear una orden (hoy, "🛢️ Escáner").
  - **Registro**: ver lo cargado (nuevo).
  - **Dónde está**: buscar un barril en el mapa (hoy, "🔍 Buscar barriles").
- Debajo, más chicos, los de uso ocasional: **Asociar vasija con lote** (hoy,
  "🧾 Inventario"), **Pedidos de rótulos** (con la cantidad de pendientes si hay)
  y **Conectar teléfono**.
- Las seis pestañas de `#navOperario` se reemplazan por una **barra fija**: botón
  "← Inicio" + el nombre de la pantalla actual (+ el selector Mapa 2D / Vista 3D
  donde ya existía). Siempre se sabe dónde estás y cómo volver.
- Textos sin jerga: botones con verbo, y una línea de ayuda arriba de cada
  pantalla del operario en lugar de los `<details class="ayuda">` (que siguen para
  el programador).
- Estilo: se mantiene la identidad vino de la app (`--vino`, `--vino-osc`), con
  tipografía base más grande para el operario, más aire, tarjetas con borde fino
  y radios suaves. Los colores de operación son fijos en toda la pantalla:
  **LLENADO = verde**, **VACIADO = ámbar**.

## 2. Registro

Panel nuevo `#panel-registro`, solo para el operario (el programador sigue con su
historial en Escáner).

### Buscador único

Un campo grande que filtra mientras escribís y muestra cómo interpretó el texto
("lote", "barril", "OT", "fecha"). Regla de interpretación (`interpretarBusqueda`):

| Lo escrito | Se toma como |
|---|---|
| vacío | sin búsqueda: se muestra el mes elegido |
| fecha `d/m`, `d/m/aa`, `d/m/aaaa` o `aaaa-mm-dd` | **fecha**: órdenes de ese día (sin año = el año más reciente que tenga órdenes ese día) |
| solo dígitos, 6 o más | **barril** (los números de barril tienen 5 a 7 dígitos; ver abajo) |
| solo dígitos, 5 | **lote** si existe alguna orden con ese lote; si no, **barril** |
| `OT 812`, `ot812` | **OT** |
| otra cosa (dígitos cortos, letras) | **texto libre**: coincide en lote, OT o barril (como el filtro de hoy) |

Los barriles de 5 dígitos existen (`50157`, `50101` en el Excel), por eso el caso
de 5 dígitos mira primero si es un lote cargado. Si un número es a la vez lote y
barril, gana lote y se ofrece un enlace "¿Buscabas el barril 25242?".

### Meses como carpetas

Fila de botones con los meses que tienen órdenes (`escMesDe`: el campo `mes` de
las órdenes importadas, o el mes de la fecha). Arranca en el **mes actual**, o en
el último con órdenes si el actual está vacío. "Todos" muestra todos los meses,
cada uno como un bloque con título. Con una búsqueda activa se buscan **todos**
los meses, y el resultado se agrupa por mes.

### Tarjeta por orden

- Lote grande arriba, etiqueta LLENADO/VACIADO, fecha (`dd/mm/aa`), OT y la
  cantidad de barriles.
- Debajo, la grilla con **todos** los números de barril, en el orden en que se
  escanearon.
- Dentro de un mes: de la orden más nueva a la más vieja (por fecha y, en el
  mismo día, por orden de carga).
- Los botones de editar y borrar están en la tarjeta y siguen la regla de hoy
  (`escPuedeEditar`: 15 minutos para el operario, más los motivos de "aplicada").
  Llaman a `escEditarOrden` y `escBorrarOrden`, que ya existen.
- Tocar un número de barril abre su ficha (equivale a buscarlo).

### Ficha del barril (al buscar un barril)

Arriba de las tarjetas:
- El número grande.
- **Hoy**: estado (LLENO/MERMO/VACÍO), lote y fecha de la fila del inventario
  (`indiceInv`). Si no está en el inventario: "No figura en el inventario".
- **Dónde está**: box y posición (`buscarUbicacion`). Si no está ubicado: "Sin
  ubicar en el mapa".
- **Historia**: cada orden donde aparece, de la más vieja a la más nueva, en una
  línea: "14/01/26 · Vaciado · lote 25242 · OT 812".
- Botón **Ver en el mapa**: abre el mapa 2D con ese barril buscado y resaltado
  (lo mismo que hoy hace "Buscar barriles" con `#buscarMapa`). Sin ubicación, el
  botón no aparece.

Las tarjetas que lo contienen se marcan con un borde y el número queda
resaltado.

### Resumen de lote (al buscar un lote)

Una línea arriba: "Lote 25242 · 3 órdenes · 10 barriles llenados · 8 vaciados ·
último movimiento 14/01/26". Los barriles se cuentan **sin repetir** por
operación.

### Imprimir

El botón "Imprimir" imprime lo que se está viendo (un mes o el resultado de una
búsqueda) en formato de hoja: título con el mes o la búsqueda, y las tarjetas en
tres columnas, sin botones. Usa `@media print` y no abre ventanas nuevas.

### Vacíos y errores

- Sin órdenes: "Todavía no hay órdenes cargadas. Se cargan desde Llenado /
  vaciado." con el botón a esa pantalla.
- Búsqueda sin resultados: "No encontramos «X» en ninguna orden." Si parece un
  barril que está en el inventario, igual se muestra la ficha (estado y
  ubicación) con "sin órdenes registradas".

## 3. Construcción

- **`public/barriles/js/registro.js`** (nuevo, puro, script clásico colgado de
  `globalThis`, como `inventario.js`): no toca el DOM ni lee el estado global.
  - `interpretarBusqueda(texto, ordenes)` → `{ tipo: 'vacio'|'fecha'|'barril'|'lote'|'ot'|'texto', valor, alternativa? }`
  - `mesDeOrden(o)` → `'aaaa-mm'` (misma regla que `escMesDe`)
  - `mesesConOrdenes(ordenes)` → meses ordenados de más nuevo a más viejo
  - `filtrarOrdenes(ordenes, consulta, mes)` → órdenes que coinciden
  - `agruparPorMes(ordenes)` → `[{ mes, ordenes }]`, meses y órdenes de más nuevo a más viejo
  - `historiaDeBarril(num, ordenes)` → entradas de la más vieja a la más nueva
  - `resumenDeLote(lote, ordenes)` → `{ ordenes, llenados, vaciados, ultimaFecha }`
  - `nombreMes('2026-01')` → `'Enero 2026'`; `fechaCorta('2026-01-14')` → `'14/01/26'`
- **Tests**: `test/barriles-registro.test.mjs`, con las fechas `14/1`, las órdenes
  importadas con `mes`, los lotes con letras, los barriles de 5 dígitos, los
  barriles en varias órdenes y los números que son a la vez lote y barril.
- **`public/barriles/index.html`**:
  - `<script src="js/registro.js">` junto a los demás.
  - Paneles `#panel-inicio` y `#panel-registro`; `#navOperario` pasa a ser la
    barra "← Inicio · título".
  - `opSeccion` gana las secciones `inicio` y `registro`; el arranque del
    operario va a `inicio` en vez de a `cargar`.
  - CSS nuevo, todo bajo `body.rol-operario` (o en clases de los paneles nuevos).
  - El historial plegado de Escáner se oculta para el operario (`.solo-prog`).
    Las "Lotes trasegados por mes" quedan como están.
  - El Registro se redibuja cuando cambian las órdenes: hoy es
    `escDibujarHistorial`; se suma la llamada a `regDibujar()` ahí si el panel
    está activo.
- Rendimiento: se dibuja solo el mes elegido o el resultado de la búsqueda; en
  "Todos" sin búsqueda, cada mes es un `<details>` plegado salvo el más nuevo.

## 4. Verificación

- `npm test` y `npm run typecheck` en verde.
- Servidor local (`dev:sin-ia`), órdenes de prueba copiadas del Excel sembradas
  por la API y, en el navegador, como operario a 1366 px: portada, cada botón, la
  vuelta a Inicio, las búsquedas (lote, barril, barril de 5 dígitos, OT, fecha
  `14/1`), la ficha, "Ver en el mapa", editar dentro de los 15 minutos y la vista
  de impresión. Con capturas.
- Como programador: comprobar que no cambió nada.

## 5. Publicación

Merge a `main` y push. El deploy lo corre el usuario a mano con
`npx wrangler deploy` desde `C:\Users\Bmax\repos\catenainstitute` en `main`
limpio. Un push a `main` no publica.
