# OT de Muestras (Lotes web) — diseño

Fecha: 2026-11-11 · Rama: `feat/ot-muestras` · Referencia: `Ordenes de Trabajo 2026\0993 Muestras Ensayos Nico Torti.xlsx`

## Qué se pide

Una orden de trabajo nueva, **"Muestras"**, en Órdenes de trabajo (columna Lotes de
«Nueva orden»). La hoja es la de la 0993: instrucciones arriba, una tabla
**Lote / Vasija / Muestra / Check** e instrucciones abajo. Las **filas de la tabla**
y los **pasos de texto** se editan, agregan y quitan. La forma de editar la tabla
es la de la Orden de muestras de laboratorio (la hoja es la pantalla).

## Decisiones

- Es **una plantilla más de OT** (como Traslado), no un tipo aparte: hereda el
  número por carpeta de OneDrive, la sección Órdenes, ✎ en los pasos, Ver,
  imprimir/PDF, ✎ N° y borrar.
- Id interno `muestras-ot`. El id `muestras` ya es la Orden de muestras de
  laboratorio en `public/ordenes/js/catalogo.js`.
- **No mueve vino**: no crea movimientos y confirmar no toca lotes.
- Al emitir se eligen lotes. Cada lote da una fila, la Vasija sale sola de los
  envases/Mapa y la Muestra se escribe una vez para todas (por defecto `750 ml`).
- Fuera de alcance: las secciones «Jueves / LAB AGRELO / 1 tubo falcon» y
  «Martes» del encabezado de la 0993. Si hace falta, se escriben como un paso más.
- Fuera de alcance: agregar o quitar columnas.

## Datos

La OT se guarda en `DATOS().ordenes_trabajo`, como las demás, con estas diferencias:

```js
{
  id, ot: '0993', plantilla: 'muestras-ot', fecha, estado: 'pendiente',
  sin_movimientos: true,      // marca EN LA OT: la lee también el servidor
  lotes: [],                  // sin movimientos => sin mov_id
  muestras: [                 // la tabla; única fuente de verdad
    { lote: '26142', vasija: 'T50', muestra: '750 ml' },
    ...
  ],
  bloques?, celdas?, banda?   // ediciones de papel, igual que hoy (ot-bloques.js)
  emitio, emitida_por, emitida_el, confirmada_por, confirmada_el, operario, comentario
}
```

`sin_movimientos` va en la OT y no se deduce de la plantilla. `src/ordenes/resumen.ts`
no importa `ot-plantillas.js`, y así una OT ya guardada no cambia de regla si
mañana cambia la plantilla.

## Componentes

1. **`ot-plantillas.js`**: plantilla `muestras-ot`, con nombre `Muestras`, banda
   `['MUESTRAS']`, `hojas: ['ot']` y `sinMovimientos: true`. Lleva los bloques de
   la 0993 literales:
   - `p('Buscar las siguientes muestras y armar cortes según indicaciones')`
   - `p('IR DESINFECTANDO MANGUERITA ENTRE MUESTRA Y MUESTRA')`
   - `{ tipo: 'tabla-muestras' }`
   - `p('AL finalizar gasear TODOS LOS T50 ANTES DE CERRAR')`
   - `p('Analizar los cortes y de ser necesario corregir a 35 ppm')`
   - `p('Enviar por mail a Nico Torti datos analizados')`

   Se agrega `'tabla-muestras'` a `TIPOS_BLOQUE` y el helper `sinMovimientos(id)`.
2. **`ot-muestras.js`** (nuevo, puro, testeable en node):
   - `filasIniciales(lotesElegidos, muestra)` → una fila por lote, con
     `vasija = resumenVasijas(l)` de `ot-armado.js`; `'T50'` queda como lo escribe `esT50`.
   - `agregarFila(filas)`, `quitarFila(filas, i)`, `editarCelda(filas, i, col, valor)`.
     Ninguna muta su entrada.
   - `lotesDeMuestras(ot)` → los lotes no vacíos y sin repetir, para búsqueda y resumen.
3. **Emitir** (`vista-ot-emitir.js`): con la plantilla `muestras-ot`, el formulario
   oculta el destino y los campos de litros y llenado, y muestra el campo
   **Muestra**. Al guardar arma la OT con `lotes: []`, `muestras: filasIniciales(...)`
   y `sin_movimientos: true`, y **no** llama a `movimientosDeOT`.
4. **Hoja** (`ot-hojas.js`): el bloque `tabla-muestras` dibuja `# · Lote · Vasija ·
   Muestra · Check`. Si la OT está pendiente, cada celda es un `<input>`, ✕ quita la
   fila y «＋ Agregar fila» suma una. Ni ✕ ni ＋ se imprimen. El lote que no existe
   queda en rojo, como en `orden-hoja-filas.js`. Si está confirmada o es solo lectura,
   se ve como texto. El check queda en blanco para tildar en papel.
5. **Guardar la tabla** (`vista-ot-lista.js`): los cambios van a `ot.muestras` por
   el mismo camino que hoy guardan `ot.bloques` y las celdas (autoguardado, Ctrl+Z).
6. **Que no se esconda**: hay dos filtros de "OT huérfana":
   - `ot-lista.js filtrarOrdenes`
   - `src/ordenes/resumen.ts deTrabajo`

   Los dos pasan a dejar ver una OT con `sin_movimientos`. Los lotes, la búsqueda y
   el resumen toman `lotesDeMuestras` cuando `ot.lotes` está vacío.
7. **Confirmar** (`vista-ot-confirmar.js`): con `sin_movimientos` no hay propuesta
   ni pasos de litros. Aparece un diálogo de sí/no, «Marcar como ejecutada», que
   llama a `confirmarOT(ot, [], {...})` con operario = quien confirma. El papel ya
   lleva «Recibió». Con `ot.lotes` vacío solo marca estado, quién y cuándo.
8. **Botones que no aplican**: ✎ Editar OT (rearma movimientos) se oculta para
   `sin_movimientos`. Quedan ✎ N°, Ver e Imprimir. Hoy una OT se borra desde su
   fila del Historial; una OT sin movimientos no tiene esa fila, así que suma un
   botón **🗑 Borrar** en la cabecera de su hoja.
9. **Catálogo** (`public/ordenes/js/catalogo.js`): `{ id: 'muestras-ot', modulo: 'lotes',
   nombre: 'Muestras', desc: 'Buscar muestras de lotes y vasijas (ensayos, cortes).',
   sinonimos: ['muestras', 'ensayos', 'cortes', 't50', 'nico'] }`. El test de
   sincronía con `PLANTILLAS_OT` lo exige.

## Lo que NO cambia

Inventario de tanques, vaciado automático con el Mapa, propuesta antes→después,
etapas y linaje recorren `ot.lotes` o movimientos. Con `lotes: []` y sin
movimientos, la OT de Muestras no les aporta nada. La numeración
(`numerosDeDocumento`) ya lee `ordenes_trabajo[].ot`, así que la 0993 cuenta.

## Errores y bordes

- Emitir sin lotes está permitido: la tabla sale vacía y se carga a mano.
- Las filas totalmente vacías no se guardan al emitir. Sobre la hoja se puede
  dejar una vacía mientras se escribe.
- Si una OT vieja, sin `muestras`, tiene plantilla `muestras-ot`, la tabla se
  dibuja vacía y no falla.
- Borrar la OT la saca de `ordenes_trabajo`. No hay movimientos que deshacer.

## Pruebas

- **Node:**
  - `ot-muestras.test.mjs`: filas iniciales con vasija desde envases y T50;
    agregar, quitar y editar sin mutar; `lotesDeMuestras`.
  - `ot-lista`: una OT con `sin_movimientos` no se filtra como huérfana.
  - `resumen.ts` (vitest): aparece en la sección Órdenes con sus lotes.
  - `confirmarOT` con `lotes: []`: marca ejecutada y devuelve `faltan = []`.
  - El test de sincronía del catálogo, que ya existe.
- **Navegador**, con el servidor de prueba de Lotes y un launch.json nuevo: emitir
  una Muestras con 3 lotes; editar una celda, agregar y quitar una fila; F5 y que
  siga igual; imprimir sin ✕ ni ＋; confirmar; verla en `/ordenes/` como ejecutada.
