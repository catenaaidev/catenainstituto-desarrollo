# Sobrante al confirmar una OT de trasiego — diseño

Fecha: 2026-11-16 · Pedido del usuario a partir de la OT 0967 · Rama `feat/ot-sobrante-confirmar`

## Problema

Al trasegar, muchas veces el vino no entra todo en el destino previsto y se
llena alguna vasija de más (OT 0967: se llenó el T 48 y sobraron 1 barrica y
1 T50). Hoy la única forma de registrarlo es **✎ Editar** la OT antes de
confirmar, agregando un destino extra. Si nadie se acuerda, Confirmar no tiene
dónde anotarlo: ese vino se cuenta como merma de los lotes de origen y el lote
queda sin esas vasijas.

Dato que habilita la solución: el Mapa de Barriles guarda los escaneos de
llenado con el n° de OT (438 de 444 llenados tienen OT). Para la 0967 tiene un
llenado del lote 25315 con 1250070 (barrica) y 50138 (T50).

## Decisiones del usuario (2026-11-16)

1. Lote del sobrante: **se pregunta cada vez**; por defecto el **mismo lote**,
   con la opción de **lote nuevo** (hijo).
2. Aplica a **todos los trasiegos**: Corte, Corte + achique y los trasiegos
   simples (a tanque y a barricas). No a Traslado ni a Muestras.
3. El Mapa es confiable (los operarios escanean los llenados con la OT): la web
   **detecta sola** el sobrante y pide confirmarlo; además hay carga **a mano**
   para cuando no hubo escaneo o el sobrante es un tanque.

## Comportamiento

### Confirmar · paso 1 ("lo que pasó")

**Tarjeta del Mapa.** Si el Mapa tiene llenados de esta OT que no están
explicados por los destinos de la OT, aparece una tarjeta por lote:

> 🟡 El Mapa tiene vasijas llenadas con esta OT que no estaban previstas:
> **1 barrica (1250070) + 1 T50 (50138)**, lote 25315.
> Lote: ◉ mismo lote 25315 · ○ lote nuevo (25316) — [Sumar a la OT] [Ignorar]

"Sumar a la OT" la convierte en un destino agregado (abajo), con barricas y
T50 precargados desde el Mapa y editables. "Ignorar" la esconde hasta volver a
abrir Confirmar.

**Qué cuenta como "no previsto"** (función pura `sobranteSegunMapa`):
- Se miran los **llenados** del Mapa de esta OT, agrupados por lote
  (`escaneosPorLote`).
- Lote que recibe vino en el destino principal de un **tanque** (Corte: el
  lote del corte; trasiego a tanque: cada lote de origen): todo llenado de
  barrica/T50 de ese lote es sobrante, **salvo** que la OT ya tenga un destino
  de barricas/T50 para ese lote (destino extra 'chicas' o vasija 'chicas' del
  achique). En ese caso no hay tarjeta: los llenados del Mapa precargan
  "Barricas llenas / T50 llenos" de ese destino (como ya se hace con el
  destino principal en los trasiegos a barricas).
- Trasiegos **a barricas**: los llenados ya son el destino normal (precarga
  existente). No hay tarjeta; si sobró, es un tanque y va por la carga a mano.
- Barriles del Mapa sin capacidad conocida: se cuentan aparte con aviso y no
  se suman.

**Carga a mano.** Debajo del destino de cada lote (o del corte):
**＋ Sobró vino** → elegir **Barricas / T50** (cantidades) u **Otro tanque**
(n° del padrón + cm, o litros si no tiene tabla), y el lote (mismo / nuevo con
n° propuesto editable). Se puede quitar con ✕ mientras no se aplique.

### Paso 2 ("así queda cada lote")

- **Mismo lote**: no hay fila aparte. Lo llenado se **suma** al ítem del lote:
  - Corte: al ítem del lote del corte (ya existe desde eacdee8).
  - Trasiego simple: al ítem del propio lote trasegado (nuevo: hoy un extra
    del trasiego simple siempre es lote nuevo).
  El texto de la vasija une todo: "T 48 + 1 barrica + 1 T50".
- **Lote nuevo**: fila propia de lote hijo, igual que un destino extra de hoy.
- La merma de los orígenes cuenta todo lo que llegó (destino + agregados).
- Si se eligió lote nuevo y las barricas del Mapa están con el lote viejo:
  aviso "Re-rotulá en el Mapa 1250070, 50138 al lote 25316".

### Al aplicar ("Aplicar N lotes y guardar")

Cada agregado se guarda en la OT como un destino extra más
(`destinos_extra` del corte o del lote), con `al_confirmar: true`. En el mismo
guardado:
- se crea su **movimiento** (mismo lote → `trasiego` sin `lote_destino`; lote
  nuevo → `traspaso` padre → hijo), ya EJECUTADO con los litros medidos;
- si es lote nuevo, se crea el **lote hijo** (copia de la ficha del padre,
  `armarHijo`) antes de aplicar la propuesta;
- la propuesta se aplica como siempre.

Si al final no se aplica (cancelar, "No tocar" del lote, error de versión),
no queda nada guardado del agregado.

### Ver, imprimir y deshacer

- La hoja impresa **no cambia** (es lo que se emitió).
- "Ver" de la OT ejecutada lista los agregados con la marca "agregado al
  confirmar".
- **Borrar y deshacer** los trata como cualquier destino extra: vuelve los
  lotes, borra sus movimientos (ya están en `movIdsDeOT`) y avisa que el lote
  hijo creado no se borra solo (`lotesCreadosPorOT`).

## Cambios por archivo

- `ot-destinos.js`: `esExtraMismoLote` también para trasiego simple
  (`x.i != null && lote === lote del origen`); `movimientosDeExtras` ya
  arma el trasiego; `normalizarExtras` conserva `al_confirmar`.
- `propuesta-ot.js`: `sobranteSegunMapa(ot, porLote)` (puro); sumar los
  extra del mismo lote al ítem del lote de origen en el trasiego simple
  (como ya se hace en el Corte); aviso de re-rotular.
- `vista-ot-confirmar.js`: tarjeta del Mapa, botón "＋ Sobró vino", bloque
  de cada agregado (reutiliza `_bloqueChicasExtra` / `_bloqueTanque`) con el
  selector de lote; precarga de llenados en destinos 'chicas' existentes;
  al aplicar, sumar los agregados a la OT, crear movimientos e hijos.
- `ot-armado.js`: `confirmarOT` acepta movimientos nuevos de los agregados.
- `vista-ot-lista.js` / ver papel: marca "agregado al confirmar".

## Errores y bordes

- Agregado sin cantidades (0 barricas y 0 T50) o tanque sin n°/medida: no deja
  avanzar ("Faltan cuántas barricas o T50 se llenaron", como hoy).
- Tanque agregado que ya es destino de la OT o está repetido: mismo error que
  `validarExtras`.
- Lote nuevo con número ocupado: `validarNumeroLote`.
- Una barrica merma del agregado no puede repetirse con otra merma de la OT
  (regla I4 existente).
- Corte "entero o nada": un agregado bloqueado bloquea el corte; en el
  trasiego simple, el lote y sus agregados van juntos (regla existente de los
  extras).

## Pruebas

- `sobranteSegunMapa`: corte con llenados sin destino chicas → tarjeta;
  con destino chicas → sin tarjeta y precarga; trasiego a barricas → sin
  tarjeta; barril sin capacidad → aviso; caso real 0967 (1250070, 50138).
- Propuesta: trasiego simple con agregado del mismo lote (se suma al ítem, la
  merma cierra); con lote nuevo (fila hijo).
- Aplicar: el agregado queda en `destinos_extra` con `al_confirmar`, su
  movimiento EJECUTADO y el hijo creado; deshacer los revierte.
- Navegador: mock con la 0967 y su escaneo; confirmar con la tarjeta y con
  la carga a mano.

## Fuera de alcance

- Detectar en el Mapa tanques llenados (el escáner no mide tanques).
- Cambiar la hoja impresa o la numeración de la OT.
- Agregar sobrantes a una OT ya confirmada: se sigue corrigiendo a mano en
  Lotes (Borrar y deshacer elimina la OT, no la vuelve a pendiente).
