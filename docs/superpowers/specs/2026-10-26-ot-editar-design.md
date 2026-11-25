# Editar una OT pendiente + número de lote nuevo propuesto

Fecha: 2026-10-26 · Pedido del usuario. Se apoya en la rama
`feat/ot-ventana-numero-carpeta` (minimizar, ✎ N°, check de carpeta).

## Alcance

Solo OT **pendientes** (confirmada = solo lectura). El número se cambia con
✎ N° (ya existe); la plantilla no cambia.

## 1. ✎ Editar (cambios grandes)

- Botón **"✎ Editar"** en la cabecera de la hoja de una OT pendiente.
- OT común → la ventana de Emitir OT en modo edición: cabecera cargada (N° y
  plantilla de solo lectura), lotes de la OT con sus barriles (la foto de la
  OT tildada + los barriles que el Mapa tenga hoy, para poder sumar), tanques,
  vasijas manuales y litros. Botón **"Guardar cambios"**.
- Corte → el asistente en modo edición, arrancando en "Lotes de origen"; el
  paso del lote arranca en "Lote existente" con el lote del corte; se puede
  pasar a otro existente o a uno nuevo. Botón final **"✓ Guardar cambios"**.
- Minimizar funciona igual; en edición NO se guarda borrador de recarga (para
  no pisar el de una OT nueva).
- Al guardar, `aplicarEdicionOT(datos, ot, cambios)` (puro, `ot-editar.js`):
  - lotes que siguen conservan su `mov_id` y su movimiento se actualiza
    (vasija origen, destino, litros, lote destino, tipo, fecha);
  - lotes nuevos → movimiento pendiente nuevo con `mov_id` único;
  - lotes quitados → se borra su movimiento;
  - destino, fecha, emitió y lote del corte se actualizan;
  - los textos escritos sobre la hoja en los pasos y el título se conservan;
    los escritos en las **celdas de las tablas y del ID** se reinician si
    cambió algún lote o vasija (se guardan por posición y quedarían en la
    fila equivocada) y se avisa;
  - si había PDF guardado → `pdf.estado = 'viejo'` → etiqueta
    **"⚠ PDF viejo · reimprimir"**.
- Avisos al guardar: lote quitado que tenía correcciones SO₂/TH2 registradas
  con esta OT (quedan como están); Corte que había creado un lote y ahora va a
  otro (el lote creado no se borra solo).

## 2. ＋ vasija manual en la hoja

- En la hoja de una OT pendiente, debajo de la tabla de vaciado, un panel
  (solo en pantalla, el papel no cambia de reglas): las vasijas manuales de
  cada lote con nombre y litros editables y ✕, y **"＋ vasija manual"** con
  selector de lote si hay más de uno.
- Cada cambio usa el mismo `aplicarEdicionOT`: suma/resta los litros del
  lote (si sus litros eran la suma; si se habían escrito a mano, se ajustan
  por la diferencia), actualiza el movimiento y repinta la hoja.

## 3. Número de lote nuevo propuesto

- `siguienteLote(lotes, anio)` (puro, `lote-nuevo.js`): el mayor lote de 5
  dígitos que empieza con los dos dígitos del año, + 1 (`26319` → `26320`);
  sin ninguno, `YY001`.
- Se precarga, editable, en el paso "Lote nuevo" del Corte (año de la fecha
  de la OT) y en el asistente **Nuevo lote** de la pestaña Lotes (año actual).

## Pruebas

Unitarias de `aplicarEdicionOT` (mantener/crear/borrar movimientos, celdas,
pdf viejo, litros), `siguienteLote`. Navegador con el mock :8819: editar una
OT común (quitar/agregar lote, tanque), editar un Corte (cambiar lote
destino), ＋ vasija manual en la hoja, número propuesto en Corte y Nuevo lote.
