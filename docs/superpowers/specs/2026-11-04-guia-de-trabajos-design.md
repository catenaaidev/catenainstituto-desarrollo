# Guía de trabajos en Órdenes de trabajo — diseño

Fecha: 2026-11-04 · Estado: aprobado por el usuario en chat

## Problema

La bodega arma a mano en Excel la "Guía de trabajos" (`Ordenes de Trabajo 2026/AAA Guía de Trabajos.xlsx`,
hoja `OT`): un papel RCI 08 con la fecha, el título "GUÍA DE TRABAJOS, SEGUIR ORDEN INDICADO", una lista de
tareas de texto libre con casilla (lavar barriles, llevar lotes a Cava, mechado, separar barriles para
trasiego…), alguna nota sin casilla debajo de una tarea, y "Emitió: Oriana" / "Recibió: Enzo - Marcelo - Ignacio".
Lo que no se termina se vuelve a escribir en la guía siguiente, y las órdenes pendientes de la web no aparecen ahí.

Se quiere la guía en la web, con:

- **A)** las tareas que no se hicieron siguen en la guía hasta tildarlas;
- **B)** las órdenes pendientes aparecen solas en la guía;
- opciones para agregar y quitar renglones.

## Decisiones

1. **Una sola guía viva** (no una OT numerada por día). Imprimir no guarda una OT ni pide número.
2. Vive en la **sección Órdenes de trabajo** (`/ordenes/`) como 4.ª tarjeta, **Guía de trabajos**, con
   pantalla en la URL (`/ordenes/?v=guia`, como el resto de la sección).
3. Entran **todas las órdenes de "Pendientes"** (OT de movimientos sin confirmar + hojas guardadas sin
   ejecutar de Lotes y Prensas: muestras, micro, corrección SO₂, otros agregados, órdenes de Prensas).
4. Fuera de alcance: las hojas "Hoja1" (solución de cartuchos) y "Lavados" (RCI 01) del mismo Excel.

## Pantalla

La pantalla **es la hoja** (como la Orden de corrección en vivo): encabezado RCI 08
(`ORDEN DE TRABAJO - RCI 08 - Rev. 02 · Aprobado por: Roy Urvieta · Emisión: 28/01/2013`), "CATENA INSTITUTE" (como las demás hojas RCI 08 de Lotes; el Excel dice "BODEGAS ESMERALDA S.A."),
"Orden de Trabajo", Fecha (hoy), "GUÍA DE TRABAJOS, SEGUIR ORDEN INDICADO", la lista numerada, y abajo
Emitió / Firma / Recibió. Los controles se ven solo en pantalla (`@media screen`), no en el papel.

### Renglones

Una sola lista ordenada con tres tipos:

| tipo | casilla | origen | Quitar | Hecha |
|---|---|---|---|---|
| `tarea` | sí | escrita a mano | la borra | ✓ la saca de la guía |
| `nota` | no, con sangría bajo la anterior | escrita a mano | la borra | — |
| `orden` | sí, otro color + enlace a la orden | sola, desde Pendientes | la **oculta** de la guía (la orden sigue pendiente) | — (sale sola al ejecutarse/confirmarse/anularse) |

- **＋ Agregar tarea** agrega al final; el texto se edita directo sobre la hoja. Un renglón a mano puede
  pasar de tarea a nota y viceversa.
- **▲▼** cambia el lugar de cualquier renglón, incluidas las órdenes.
- Una orden pendiente que todavía no tiene lugar guardado entra **al final**.
- "Mostrar ocultas" lista las órdenes ocultas con **Volver a mostrar**.
- **Hechas (últimos 7 días)**: plegada, con quién/cuándo y **Deshacer** (vuelve a su lugar). Después de 7 días
  se descartan al guardar.
- Texto de un renglón de orden: armado en cada carga desde el resumen de Pendientes (tipo, N°, lotes; p. ej.
  "OT 0957 · Traslado · 26329 CS → VF"), nunca copiado en la guía.
- **Emitió / Recibió**: editables y guardados con la guía.

### Imprimir

A4 RCI 08 con la fecha de hoy y los renglones visibles en ese momento (tareas, notas y órdenes no ocultas),
casillas vacías. Una tarea larga hace crecer su renglón; si no entra en una hoja, sigue en otra con el mismo
encabezado.

### Permisos

Ve e imprime cualquiera con rol en Lotes o Prensas (como el resto de la sección). Cambia la guía solo
editor o admin en alguno de los dos; el servidor rechaza (403) el guardado de un lector.

## Datos

Tabla nueva (migración `migrations/0003_guia_trabajos.sql`), una sola fila:

```sql
CREATE TABLE guia_trabajos (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  version  INTEGER NOT NULL DEFAULT 0,
  json     TEXT    NOT NULL,
  autor    TEXT,
  guardado TEXT
);
```

No va en `documento` (su CHECK solo admite prensas/barriles/lotes, y la guía es de las dos apps: guardarla
no debe chocar con un guardado de Lotes).

`json`:

```js
{
  emitio: 'Oriana',
  recibio: 'Enzo - Marcelo - Ignacio',
  renglones: [
    { id: 'r_…', tipo: 'tarea', texto: '…' },
    { id: 'r_…', tipo: 'nota',  texto: '…' },
    { id: 'r_…', tipo: 'orden', ref: 'lotes:<id de la orden>', oculta: false },
  ],
  hechas: [ { id, tipo, texto, hecha: '2026-11-04T…', por: 'email', lugar: 3 } ],
}
```

`ref` = módulo + id estable de la orden tal como lo entrega `resumenOrdenes` (a confirmar en el plan cuál
campo es estable). Si una `ref` guardada ya no está en Pendientes, el renglón no se dibuja y se descarta en
el próximo guardado.

## Servidor (`src/ordenes/`)

- `GET /ordenes/api/guia` → `{ version, guia, ordenes, puedeEditar }`: la guía y los pendientes en una sola
  ida a D1 (batch), como `/lista`. Sin fila todavía → guía vacía, versión 0.
- `POST /ordenes/api/guia` con `{ version, guia }` → guarda si `version` coincide (UPDATE … WHERE version = ?,
  o INSERT si es 0); si no coincide → 409 con la guía actual. 403 para lectores. Valida forma y tamaño.
- `/ordenes/api/*` ya está en `assets.run_worker_first` de los dos wrangler (lo vigila `ordenes-run-worker-first`): no hay que tocarlos.

## Cliente (`public/ordenes/js/`)

- `guia.js` — **puro**: `unirGuia(guia, ordenes)` (renglones visibles en orden, órdenes nuevas al final,
  refs vencidas fuera), y las operaciones `agregar`, `editarTexto`, `cambiarTipo`, `mover`, `quitar`
  (borra u oculta según tipo), `mostrar`, `marcarHecha`, `deshacerHecha`, `podarHechas(hoy)`.
  Cada operación es una función `(guia, …) → guia` para poder **re-aplicarla** sobre la versión nueva tras un 409.
- `guia-hoja.js` — dibuja la hoja (pantalla + papel), reusando el encabezado RCI 08 existente.
- `app.js` — tarjeta nueva en la portada y vista `?v=guia`.

Guardado: cada operación se aplica en pantalla y se manda enseguida (texto: a los ~800 ms de dejar de
tipear). En 409 se toma la guía del servidor, se re-aplica la operación pendiente y se reintenta.
Error de red → aviso visible "No se pudo guardar" con Reintentar; no se pierde lo que está en pantalla.

## Pruebas

- Unitarias de `guia.js`: orden nueva al final; orden ejecutada desaparece; oculta no vuelve hasta
  "mostrar"; mover; hecha → deshacer vuelve al mismo lugar; poda de 7 días; re-aplicar tras conflicto.
- Rutas: lector → 403; versión vieja → 409; primera escritura con versión 0.
- Navegador con servidor de prueba: agregar/mover/tildar/ocultar, F5 conserva, A4 impreso.

## Puesta en producción

Push a main despliega el Worker, **pero la tabla hay que crearla una vez** en la D1 remota:
`npx wrangler d1 migrations apply <base> --remote` (se confirma el comando exacto en el plan). Sin eso la
tarjeta responde error. Se hace junto con el usuario al mergear.
