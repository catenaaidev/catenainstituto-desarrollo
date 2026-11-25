# OT "Corte + achique" (Lotes web) — diseño

Fecha: 2026-10-26 · Pedido del usuario · Referencia: `Ordenes de Trabajo 2026\0943 Corte PN Grand Mere.xlsx`

## Qué es

Una plantilla nueva de Emitir OT que funciona **igual que el Corte** (varios lotes de
origen → un tanque, que forma el lote del corte) y además, en la misma orden, **reubica
el vino del tanque pulmón en sus vasijas definitivas**. Las vasijas definitivas pueden
ser de cualquier tipo: tanques grandes del padrón, barricas o T50.

En la 0943: 10 lotes en barricas (15.000 L) → TQ pulmón bodega = lote 26323 → T 206
(7.500 L, lote 26323) y T 209 (7.500 L, lote 26324).

## Decisiones del usuario

1. **Cada vasija definitiva es un lote.** La primera conserva el número del lote del
   corte. Cada vasija extra es un lote NUEVO con la misma información, porque solo sirve
   para saber dónde está cada parte.
2. **Qué cuenta como "una vasija":** cada tanque es un lote propio. Todas las barricas y
   los T50 juntos forman UN solo lote.
3. **El pulmón siempre termina vacío.** Ningún lote queda registrado en el pulmón.
4. Es una sola OT con una sola hoja y una sola confirmación. No son dos OT enlazadas.

## Modelo

La plantilla nueva va en `ot-plantillas.js`:

- `id: 'corte-achique'`, `nombre: 'Corte + achique'`, `banda: ['TRASIEGO']`,
  `origen: 'barriles'`, `loteCorte: true`, `creaLote: true`, `achique: true`.
- Las hojas se calculan: `ot` siempre, y `planilla` + `rotulos` solo si hay un destino
  de vasijas chicas. La función `hojasDePlantilla(id, ot)` recibe la OT para decidirlo.

La OT guarda, además de lo del Corte:

```js
ot.destino = 'TQ pulmón bodega'          // el tanque del corte (lo escrito en el asistente)
ot.achique = {
  destinos: [
    { tipo: 'tanque', num: '206', litros: 7500, lote: '26323', nuevo: false, mov_id: null },
    { tipo: 'tanque', num: '209', litros: 7500, lote: '26324', nuevo: true,  mov_id: '<id>-a1' },
    { tipo: 'chicas', barricas: 20, t50: 2, litros: 4600, lote: '26325', nuevo: true, mov_id: '<id>-a2' },
  ],
}
```

- Hay como máximo **un** destino `chicas`.
- **Qué destino se queda con el número del corte:**
  - si hay algún tanque, el primer destino de tipo tanque;
  - si no hay ningún tanque, el destino `chicas`.
- Ese destino tiene `nuevo: false` y `mov_id: null`, porque no genera movimiento: el
  vino ya es de ese lote.
- Los litros de un destino `chicas` se proponen como `barricas × 225 + t50 × 50`, y se
  pueden corregir.
- Las OT viejas no tienen `achique`. Todo el código que lo lee lo trata como opcional.

### Lotes que crea la OT

- El lote del corte se crea igual que hoy: nuevo o existente, en blanco o "⎘ Hijo".
- **Cada destino con `nuevo: true`** crea un lote con `armarHijo(lote del corte)`, al
  que se le pone el número propuesto y se le copia la descripción (`id_texto`).
- Los números se proponen con `siguienteLote`, consecutivos y salteando los que ya
  están tomados en el propio asistente. Se pueden corregir y se validan con
  `validarNumeroLote`.
  - No pueden repetir un lote de origen.
  - No pueden repetir el lote del corte.
  - No pueden repetirse entre sí.
- Todo (OT, lote del corte y lotes hijos) entra en **un solo guardado**, como hoy.

### Movimientos y linaje

- **Lotes de origen → lote del corte:** son `traspaso`, igual que el Corte
  (`movimientosDeOT`, sin cambios).
- **Lote del corte → cada lote hijo:** un `traspaso` por cada destino con `mov_id`.
  - `lote` = lote del corte; `lote_destino` = el hijo.
  - `vasija_origen` = el pulmón; `vasija_destino` = la vasija definitiva.
  - `litros` = lo previsto. Queda `pendiente` hasta confirmar.
  - Así el linaje cuelga 26324 de 26323, y por 26323 de las barricas de origen.
- `otDeMovimiento` y `eliminarOT` también tienen que encontrar y borrar estos
  movimientos (los `mov_id` de `ot.achique.destinos`).

## Asistente (vista-ot-corte.js)

Se elige "Corte + achique" en el select y se abre el **mismo asistente del Corte**, en
modo achique. Los pasos son los del Corte, con dos cambios:

1. El paso "Tanque destino" se llama **"Tanque pulmón"**.
2. Antes del resumen va un paso nuevo, **"Vasijas definitivas"**:
   - Las filas son **Tanque** (número del padrón con datalist + litros) o **Barricas /
     T50** (cantidad de barricas + cantidad de T50 + litros). Solo se permite una fila
     de chicas.
   - Cada fila muestra qué lote va a ser: "lote del corte 26323" o "lote nuevo ___",
     con el número propuesto y editable.
   - Abajo va la suma contra los litros del corte (la suma de los orígenes). Si no
     cierra hay un aviso, pero se puede seguir, porque al emitir los litros son
     previstos.
   - Hace falta al menos una vasija definitiva para seguir.
3. El **resumen** lista las vasijas definitivas con sus lotes, y dice cuántos lotes
   nuevos se crean.

El borrador, el minimizado y **✎ Editar OT pendiente** funcionan como en el Corte:

- Al editar, el paso de vasijas arranca con los destinos guardados.
- Si se agrega un destino, se crea su lote hijo.
- Si se quita un destino que había creado un lote, ese lote **no se borra solo**. Se
  avisa, igual que hoy con el lote del corte.

## Hoja impresa (ot-hojas.js)

Es la 0943 en orden. Los textos se copian literal del Excel.

1. **Bloque del corte**, igual que el Corte:
   - pasos de sanitizar e inertizar, % final de O2;
   - "Trasegar … a tanque";
   - ID del corte;
   - tabla de vaciado por barril → pulmón;
   - rotular el pulmón;
   - Argón y falcon;
   - tabla de corrección (agregado-corte).
2. **"Homogeneizar."** y **"Registrar SO2 Final"** (dato SO2).
3. **"Preparar pare reubicar"** e "Inertizar tanque destino hasta obtener menos de 20% de
   O2…".
4. **Tabla de achique** (bloque nuevo, `tabla-achique`):
   - columnas Check | CIW lote | Vasija | Cantidad | Litros | Destino | Litros
     caudalímetro | Merma;
   - Vasija = el pulmón, una vez, con rowspan;
   - una fila por destino: el lote, la cantidad (1 por tanque, o "20 + 2 T50") y la
     vasija definitiva.
5. **Rotular** (bloque `rotular` con `de: 'achique'`): una línea "Rotular vasija ID." por
   destino, con la vasija, el lote y el ID.
6. Los pasos finales de la 0943:
   - Inertizar espacio de cabeza con Argón;
   - "En caso de que quede mermo:" y "Rellenar con :", con "Oriana tiene que degustar";
   - Chequear O2 final y registrar;
   - Lavar y vaporizar barriles vaciados (SEPARAR BARRILES DE 2020…);
   - Lavar por fuera con agua oxigenada;
   - Scanear…;
   - Anotar cantidad de barriles: LLENADOS / VACIADOS / MERMOS;
   - Lavar vasija utilizada;
   - Juntar borras.
7. **Planilla de barriles y Rótulos**: se ofrecen solo si hay un destino `chicas`.
   - Los rótulos son del lote de las chicas, uno por barrica/T50.
   - La planilla de llenado se arma como en "TQ a barricas" (`desde-tanque`).

Las celdas editables, la banda y el ID editables de la hoja siguen funcionando por
bloque, como hoy.

## Confirmar (vista-ot-confirmar.js + propuesta-ot.js)

- Los lotes de origen se confirman **igual que en el Corte**: vaciado, barricas merma
  pendientes, avisos.
- Donde hoy está la tarjeta "Tanque del corte", hay **una tarjeta por destino**:
  - **tanque:** cm de merma, con la cubicación y la Cap REAL (`llenadoDeEntrada` tipo
    `tanque`). Si el tanque no tiene tabla, los litros van a mano.
  - **chicas:** barricas llenas + T50 llenos + barricas merma con sus litros (tipo
    barricas, más la clave de T50).
- **El pulmón no se mide.** Ningún lote queda con litros en el pulmón.
- **La propuesta:**
  - Lote del corte: `despues` = lo de su destino. Si es un lote existente, se le suma a
    lo que ya tenía, con la misma regla de "mismo tanque = contenido total" de hoy.
  - Cada lote hijo: `despues` = lo medido en su vasija, y `vasija_actual` = esa vasija.
  - **La merma es una sola:** litros de los orígenes − suma de lo medido en todos los
    destinos. Se reparte entre los orígenes como hoy, y el último origen se lleva el
    resto.
- **Todo o nada.** Si falta la medida de cualquier destino, o cualquier lote está
  bloqueado o pide revisar, no se aplica nada. Es la misma regla I1/I2 del Corte,
  extendida a los hijos.
- **Al aplicar:**
  - los traspasos origen → corte toman sus litros reales como hoy;
  - los traspasos corte → hijo toman lo medido en el hijo y quedan `ejecutado`;
  - `aplicado` guarda la foto `antes` de cada hijo, para deshacer.
- **Borrar y deshacer** una OT aplicada revierte también los hijos, con la misma regla:
  si un lote cambió después de la OT, no se toca. Los lotes creados no se borran.

## Otros lugares que leen la OT

- **Inventario de tanques** (`inventario-tanques.js`): además de `ot.destino` (el
  pulmón), anota los tanques de `ot.achique.destinos`.
- **Lista de OT** y Historial: el destino se muestra como "pulmón → T 206 + T 209".
- **Mapa de Barriles:** se sigue solo leyendo. No hay cambios.

## Pruebas

Tests de node:

- **Plantilla:** existe, sus bloques son válidos y `hojasDePlantilla` depende de las
  chicas.
- **Armado:**
  - destinos y lote base (tanque primero; sin tanques, chicas);
  - movimientos corte → hijo;
  - `otDeMovimiento` y `eliminarOT` con los mov_id del achique.
- **Números propuestos:** consecutivos, sin chocar entre sí ni con los orígenes.
- **Propuesta:**
  - litros por destino;
  - merma única repartida;
  - todo o nada con un destino sin medida;
  - lote existente en el mismo tanque.
- **Deshacer** con hijos.
- **Hoja:** la tabla de achique, el rotular por destino y el test de papel intacto
  (`test/lotes-papel-intacto`).

En el navegador, con el mock (`mock-ot-vasijas.mjs` o uno nuevo), se arma la 0943 entera:

1. 10 lotes de origen;
2. pulmón;
3. T 206 + T 209;
4. emitir;
5. imprimir y comparar con el Excel;
6. confirmar con cm;
7. comprobar los litros, la merma y el linaje de 26324.

Después se repite con un destino de barricas + T50, que ofrece la planilla y los
rótulos.

## Fuera de alcance

- Que el pulmón quede con vino (el usuario dijo que siempre se vacía).
- Borrar los lotes hijos solos al borrar o editar la OT.
- Escribir en el Mapa de Barriles.

## Entrega

Rama `feat/ot-corte-achique` (worktree `C:\Users\Bmax\repos\catenainstitute-achique`).
Un push a main = deploy (Workers Builds): **el merge a main lo hace el usuario**.
