# OT de trasiego con varios destinos (Lotes web) — diseño

Fecha: 2026-11-12 · Pedido del usuario (lo pidió una usuaria al armar una OT real)

## Qué es

Hoy una OT de trasiego tiene **un solo destino** (`ot.destino`, texto). Cuando por la
cantidad de litros el vino no entra en una vasija, no hay forma de cargar una segunda.
Este cambio permite agregar **tanques destino extra** en todas las plantillas de
trasiego, cada uno con su **lote nuevo**, su **merma** al confirmar y sus **agregados**
(TH2 + Solución SO2).

## Decisiones del usuario

1. Aplica a **todas las plantillas de trasiego**: barricas a barricas, TQ a barricas,
   barrica a tanque, tq a tq y Corte. No aplica a Corte + achique (ya tiene varias
   vasijas), ni a Traslado ni a Muestras.
2. **El reparto depende de la plantilla.**
   - En el **Corte** todo el vino va al conjunto de destinos, así que la lista de
     destinos es una sola para toda la OT.
   - En los **trasiegos simples**, cada lote de origen va a **sus** destinos y la lista
     de destinos extra es por lote.
3. **Litros por destino: opcionales al emitir.** Si se cargan, salen en el papel y
   sirven para la dosis. Al confirmar se mide cada destino.
4. **El destino 1 sigue el lote** (tanque o barricas, según la plantilla). **Cada
   tanque extra es SIEMPRE un lote nuevo.** El número se propone (`siguienteLote`) y es
   editable. Con esto, cada tanque tiene sus litros exactos y nunca hay un mismo lote
   repartido en dos tanques.
5. **Los destinos extra son siempre tanques.** Llenar más barricas ya entra en el
   destino de barricas de siempre, así que no hay "varios destinos de barricas".
6. **Cada tanque tiene su propia merma** al confirmar. La merma no se reparte en
   proporción.
7. **Cada vasija destino recibe sus agregados**, en el papel y en el panel
   "Correcciones de esta OT".

## Modelo

El item de un destino extra tiene la misma forma que un destino `tanque` del achique
(`ot-achique.js`). Así se reusan `nombreDestino`, la validación del padrón y
`llenadoDeEntrada`:

```js
{ tipo: 'tanque', num: '214', clase: {tipo, cap}?, litros: 3000 | null,
  lote: '26330', nuevo: true, mov_id: 'OT-…-x0-0' }
```

**Trasiegos simples.** El destino 1 sigue siendo `ot.destino`, común a todos los lotes
como hoy; al confirmar cada lote lo puede corregir con `destino_real`. Los extra van
por lote:

```js
ot.lotes[i].destinos_extra = [ {…}, {…} ]   // vacío o ausente = como hoy
```

**Corte.** El destino 1 sigue siendo `ot.destino` (el tanque del lote del corte). Los
extra van a nivel de la OT:

```js
ot.destinos_extra = [ {…} ]                 // hijos del lote del corte
```

Por qué no se reusa `ot.achique.destinos` para el Corte: varias vistas (Confirmar,
hojas, inventario) leen "hay `ot.achique.destinos`" como "hay pulmón y queda vacío". En
el Corte el tanque de `ot.destino` **conserva** el vino, así que un campo propio evita
ese malentendido. Los helpers sí se comparten.

**Compatibilidad.** Una OT sin `destinos_extra` funciona exactamente como hoy y no hay
que migrar nada. Toda lectura usa `destinosExtra(ot, i)`, que devuelve `[]` cuando el
campo falta.

**Módulo nuevo `ot-destinos.js`** (puro, con tests). Tiene:

- `destinosExtra(ot, i?)`: la lista de un lote, o la del Corte si `i` es null.
- `normalizarDestinosExtra(lista)`: limpia y numera.
- `asignarLotesExtra(lista, {lotes, anio, propios})`: propone `siguienteLote` a los que
  no traen número, sin repetir.
- `validarDestinosExtra(lista, {padron, lotes, origenes, loteCorte, destino1})`.
  Controla:
  - número de tanque presente y que no repita el del destino 1 ni el de otro extra;
  - número de lote presente, sin repetir, distinto de los orígenes y del lote del
    corte, y libre en Lotes, salvo los hijos propios de esta OT;
  - litros, si vienen, mayores a 0.
- `movimientosDeExtras(ot)`: movimientos de los destinos extra.
- `lotesHijosDeOT(ot)`: lotes hijos de la OT, para borrarlos y crearlos.
- `textoDestinos(ot)`: resumen de los destinos para la lista de OT.

## Emitir

**Trasiegos simples** (`vista-ot-emitir.js`):
- La tarjeta de cada lote suma un bloque **Destinos**. El primer renglón muestra el
  destino de la OT (solo lectura, "→ T 12"). Debajo va **＋ Tanque**.
- Cada tanque extra pide:
  - n.º de tanque, con la lista del padrón y el mismo filtro por clase que el achique;
  - litros, opcionales;
  - n.º de lote nuevo, propuesto y editable;
  - botón ✕ para quitarlo.
- Aviso de suma, que no bloquea: "Destinos extra: 3.000 L de 5.400 L previstos; al
  destino 1 van 2.400 L". Los litros previstos del destino 1 son los previstos del lote
  menos la suma de los extra que traen litros.
- Al emitir se valida con `validarDestinosExtra`. Los errores se muestran como hoy.

**Corte** (`vista-ot-corte.js`): el paso "Tanque destino" suma el mismo bloque
**＋ Tanque** debajo del campo del tanque del corte. Los extra son hijos del lote del
corte. El resumen los lista.

**Lotes hijos.** Se crean **al emitir** (y al guardar una edición), igual que en el
achique: se copian la ficha del lote padre (variedad, año, origen y lo que copia
`armarHijo`), con `vasija_actual = ''` y sin litros. Los litros llegan al confirmar.

**Movimientos** (`ot-armado.js`). El movimiento del lote hacia el destino 1 sigue
siendo `trasiego`, o `traspaso` en el Corte. En un trasiego simple, si todos los
tanques extra del lote tienen litros (y el lote tiene litros previstos), ese
movimiento lleva el resto: previstos − Σ litros de los extra (`restoDestino1` en
`ot-destinos.js`); si a alguno le faltan los litros, lleva los previstos enteros.
Sin extras no cambia. Cada tanque extra suma un movimiento **`traspaso`** pendiente:

- trasiego simple: `lote` padre → `lote_destino` hijo;
- Corte: `lote` del corte → `lote_destino` hijo;
- `vasija_origen`: `ot.destino` (el tanque del destino 1), igual que en el achique:
  el hijo se forma con vino que sale del destino de la OT;
- `vasija_destino`: el tanque;
- `litros`: los del destino, o vacío.

Ese movimiento arma el linaje padre→hijo, porque `TIPOS_A_LOTE` en
`src/lotes/motores/linaje.ts` ya incluye traspaso. `movIdsDeOT` los incluye, así que
borrar la OT los borra.

## Confirmar

`vista-ot-confirmar.js` y `propuesta-ot.js`. Paso 1, "Lo que pasó":

- Cada lote tiene el renglón de su destino 1, igual que hoy: tanque + cm o litros, o
  barricas llenas + mermas. Debajo hay **un renglón por tanque extra**: tanque
  (prellenado), cm o litros, y **Merma (L)**.
- El renglón del destino 1 de un tanque también suma **Merma (L)**.
- En las plantillas de barricas, el destino 1 no lleva campo de merma: su merma sale
  de la diferencia, como hoy, pero ahora descontando lo que llegó a los tanques extra
  (la misma cuenta de abajo).

**Cómo se propone la merma de cada tanque:**
- Extra con litros previstos: `merma = previstos − medidos`, editable.
- Extra sin previstos: arranca en 0 (vacío) y se carga a mano.
- Destino 1: `merma = vaciado del origen − medido del destino 1 − Σ (medido + merma de
  los extra)`, editable. El vaciado del origen se calcula como hoy (`vaciadoDeLote` /
  Mapa). Así la cuenta cierra sola si el operario no toca nada.
- Una merma negativa se muestra en rojo, con el aviso "llegó más de lo que salió", y no
  bloquea.

**Cómo se aplica:**
- El lote de origen se vacía **una vez** con lo vaciado y recibe lo medido en el
  destino 1. Es un solo `aplicado` en `ot.lotes[i]`, como hoy.
- Cada lote hijo recibe lo medido en su tanque: `vasija_grande = 1`,
  `vasija_actual = 'T n'` y `litros_actuales`. Su `aplicado` se guarda **en el item del
  destino extra**, igual que `achique.destinos[k].aplicado`.
- El destino 1 de cada tanque guarda su merma en `ot.lotes[i].merma_litros` (en el
  Corte, en el movimiento base). Cada extra la guarda en `destinos_extra[k].merma_litros`
  y en su movimiento. Los movimientos pasan a EJECUTADO con `litros` y
  `merma_litros`.
- **Corte**: todo o nada, como hoy. Los orígenes se vacían, la base recibe lo medido en
  el destino 1 y los hijos lo suyo. Cada tanque extra lleva su merma en su
  movimiento; la merma del tanque base se sigue repartiendo en proporción entre los
  movimientos de los orígenes, como hoy.

**Validación:** falta tanque, o cm/litros, en un destino extra → error con el nombre
del lote.

**Borrar y deshacer** (`ot-deshacer.js`): recorre también `aplicado` de cada
`destinos_extra`. El padre vuelve a su `antes` y cada hijo al suyo (0 L, sin
vasija), salvo que se hayan cambiado después de la OT; en ese caso no se tocan, con la
regla de siempre. En un trasiego simple cada lote de origen y los hijos de sus
tanques extra van **entero o nada**: si uno del grupo se cambió después, ninguno del
grupo vuelve (`porGrupo`) y sus mermas no se tocan; los demás lotes de la OT se juzgan
solos. En el Corte, los hijos son parte del corte (`corteParcial`, como el achique).
El lote hijo queda en la lista (no se borra solo), igual que los hijos del achique.

## Agregados (TH2 + Solución SO2) por vasija

**Papel** (`ot-hojas.js`, `tabla-correccion`):
- Por defecto: por cada lote, sus filas TH2 + SO2 en el destino 1 y, debajo, TH2 + SO2
  por cada tanque extra, con la vasija (`T 214`) y el lote hijo.
- `agregado-corte`: filas TH2 + SO2 del lote del corte en `ot.destino` y lo mismo por
  cada extra.
- `vasija:'origen'` (TQ a barricas) no cambia para el origen. Las filas de los extra se
  agregan igual.

**Panel "Correcciones de esta OT"** (`ot-correcciones.js` + `vista-ot-correcciones.js`):
- `lotesACorregir` devuelve **una entrada por vasija destino**:
  `{lote, id_texto, vasija, litros_previstos, extra:bool}`. Es decir, los lotes como hoy
  más un elemento por cada `destinos_extra`, con el lote hijo y su tanque. En el Corte
  sale el lote del corte más sus hijos. La entrada de un lote con extras lleva
  `con_extras: true`, sus litros son los reales del lote si se conocen los de todos sus
  extra (si no, el resto de los previstos, como el movimiento al destino 1) y, si el
  destino es un tanque, `vasija = ot.destino`. Un lote sin extras queda igual que antes.
- Tarjeta por entrada:
  - tanque propuesto = el `num` del extra;
  - litros = `litros_reales` si la OT ya se confirmó, si no `litros` previstos, si no
    `lote.litros_actuales`. Se pueden editar como hoy.
- Lo registrado va al lote de la tarjeta: el padre o el hijo. Como el hijo es otro
  lote, no se pisa con el padre.
- Por las dudas, la clave de reemplazo de `aplicarCorreccion` (so2-bitacora.js) pasa a
  ser lote + fecha + `ot_n` + `vasija` cuando la corrección trae vasija. Una corrección
  vieja sin vasija se reemplaza como hoy.
- `registrarTH2` no cambia: ya reemplaza por OT dentro de lote + fecha, y cada vasija es
  un lote distinto.

## Hojas, lista y vistas que leen destinos

- **Tabla de vaciado**: la celda Destino del lote lista "T 12: ____" y debajo
  "T 214 (lote 26330): ____". Con `porBarril` sigue el rowspan, con los destinos uno
  debajo del otro.
- **Rótulos** del Corte: suman una línea por lote hijo.
- **Banda**: no cambia (lotes de origen).
- **Tabla de llenado** (`desde-tanque` / `a-barricas`): el destino 1 se mantiene.
  Debajo de cada lote suma una fila por tanque extra: vasija, lote hijo y litros.
- **Lista de OT** (`ot-lista.js`): el destino muestra "T 12 + T 214".
- **Inventario de tanques** (`inventario-tanques.js`): marca "en trasiego" también a
  los tanques extra.

## Editar una OT pendiente

`ot-editar.js`:
- ✎ Editar reabre Emitir, o el asistente del Corte, con los extra cargados.
- `aplicarEdicionOT`:
  - conserva el `mov_id` de los extra que siguen;
  - crea los movimientos y los lotes hijos nuevos;
  - borra los movimientos de los extra quitados. Su lote hijo **no se borra solo**
    (misma regla que el Corte y el achique): se avisa y se borra a mano desde Lotes.
    Lo mismo al borrar la OT entera.
- La firma que reinicia las celdas del papel suma los destinos extra, porque cambian
  las filas.

## Borrador

El borrador de Emitir (`lotes_ot_borrador`) y el del Corte guardan los extra junto con
el resto.

## Fuera de esta entrega

- Varios destinos de barricas por lote.
- Un mismo lote en dos tanques.
- Destinos extra en Corte + achique, Traslado y Muestras.
- Editar los destinos de una OT ya confirmada.

## Pruebas

Tests de unidad (vitest), con `npx vitest run --maxWorkers=2 test/lotes-*.mjs`:

- `test/lotes-ot-destinos.test.mjs` (nuevo): normalizar, asignar lotes, validar
  (repetidos, padrón, lote ocupado, tanque = destino 1) y movimientos de los extra.
- `lotes-ot-armado`: OT con extra → movimientos traspaso padre→hijo. Una OT sin extra
  queda idéntica a hoy.
- `lotes-propuesta-ot`:
  - merma por tanque (previstos − medidos; el destino 1 cierra la cuenta);
  - hijos con `vasija_grande = 1`;
  - Corte todo o nada con extra.
- `lotes-ot-deshacer`: deshacer con hijos.
- `lotes-ot-correcciones`: `lotesACorregir` con extra, y una corrección de la misma
  fecha en dos vasijas no se pisa.
- `lotes-ot-hojas`: celda Destino con extra y filas TH2/SO2 por extra.
- `lotes-ot-editar`: agregar y quitar extra conserva y crea `mov_id`.
- `lotes-linaje`: el traspaso del extra arma padre→hijo.

Navegador: servidor de prueba sin login (mock, como en las entregas anteriores),
entrada nueva en `.claude/launch.json` del Escritorio. Se prueba emitir tq-tq con
2 extra, imprimir, confirmar con mermas, registrar SO2 en el tanque extra, deshacer y
el Corte con 1 extra.

## Entrega

Rama `feat/ot-varios-destinos`, worktree `C:\Users\Bmax\repos\catenainstitute-ot-destinos`.
El merge a main y el deploy los hace el usuario, porque el clasificador bloquea el push
a main.
