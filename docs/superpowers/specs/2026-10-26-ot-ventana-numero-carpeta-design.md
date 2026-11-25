# OT de movimientos: no perder la OT, cambiar el N° y saber si se guardó en la carpeta

Fecha: 2026-10-26 · Segunda entrega del pedido del usuario (la primera, Corte a
lote existente + tanques + vasijas manuales, ya está en main a4e6e8b).

## A. No perder la OT a medio armar

Hoy Emitir OT y el asistente del Corte viven en el `<dialog id="overlay">`, y
`app.js` lo cierra con clic en el fondo o Escape: se pierde todo.

**Cambio:**

- `nucleo.js` suma una *guardia* para el overlay abierto:
  `protegerOverlay({ titulo: () => string, hayDatos: () => bool, alRetomar: () => void })`.
  Se borra sola cuando se abre otro overlay de cero o se cierra con `cerrarOverlay`.
- Con guardia y `hayDatos()`, **el clic en el fondo y Escape minimizan** en vez
  de cerrar. Sin datos, cierran como hoy.
- **Minimizar** (botón "— Minimizar" en Emitir OT y en el asistente, y por
  clic afuera / Escape): los nodos de `#overlayBox` se sacan del DOM y se
  guardan tal cual (con sus listeners), el dialog se cierra y aparece una
  pastilla fija abajo a la derecha: **"📝 OT 0951 en curso · retomar"**.
  Mientras tanto se usa toda la web.
- **Retomar**: si no hay otra ventana abierta, los nodos vuelven a
  `#overlayBox`, se abre el dialog y se llama `alRetomar` (repinta la lista de
  lotes por si un fetch del Mapa llegó mientras estaba minimizada). Si hay otra
  ventana abierta, aviso "Cerrá la ventana abierta primero".
- **Cancelar / ✕** con datos pide confirmación ("Descartar la OT sin emitir").
- Abrir **Emitir OT** con una minimizada pregunta: "Retomar la OT en curso" o
  "Descartarla y empezar otra" (la sesión de lotes es una sola).
- **Borrador ante recarga**: la sesión (cabecera, plantilla, lotes con sus
  tildes/tanques/otras, y en el Corte el paso y sus datos) se guarda en
  `localStorage` (`lotes_ot_borrador`) en cada cambio. Al abrir Emitir OT, si
  hay borrador de menos de 7 días: "Retomar la OT sin emitir (N° …, lotes …)" /
  "Descartar". Se borra al emitir o descartar. Todo con try/catch (sin
  storage, sigue andando).

## E. Cambiar el N° de una OT emitida

- Módulo puro `ot-renumerar.js`: `renumerarOT(datos, ot, nuevo)` cambia
  `ot.ot`, el `ot` de sus movimientos (por `mov_id`), el `ot` de las mermas
  que creó (`ot` viejo + lote de la OT) y el `ot_n` de las correcciones SO₂ y
  agregados registrados desde la OT (`ot_n` viejo + lote de la OT). Devuelve
  cuántas cosas cambió.
- Botón **"✎ N°"** en la cabecera de la hoja de la OT (pendiente o
  ejecutada). Pide el número (propone el siguiente libre de la carpeta),
  normaliza ("953" → "0953"), avisa si ya lo usa otra OT de la web o un
  archivo de la carpeta (y deja seguir), renumera, guarda y repinta. Si la OT
  ya tenía PDF en la carpeta con el número viejo, avisa que ese archivo hay
  que renombrarlo o borrarlo a mano (la web no borra archivos).
- **Al imprimir**, si el número ya está en la carpeta: primero ofrece
  **"Pasar a la 0953"** (el siguiente libre); eso renumera la OT (mismo
  `renumerarOT`), guarda y sigue imprimiendo con el número nuevo. Si dice que
  no, queda lo de hoy (Guardar igual / Cancelar).

## F. ¿Se guardó en la carpeta?

- `imprimirYGuardar` devuelve además `guardado`: `'carpeta'` (se escribió y
  al releer la carpeta el archivo está), `'sin-verificar'` (se escribió pero
  no aparece al releer), `'descargado'` (sin carpeta o error: se descargó) o
  `'papel'` (Solo imprimir), y `nombre`.
- La OT de movimientos guarda `ot.pdf = { estado, nombre, el }` y se guarda.
- En la lista de OT, cada fila muestra: **📁 ✓** (en la carpeta, con el nombre
  en el title), **⚠ PDF descargado**, **⚠ solo papel**, **⚠ sin verificar**,
  o nada si todavía no se imprimió.
- **Cartel** arriba de la lista de Órdenes de trabajo:
  - sin carpeta / sin permiso / navegador sin soporte → "⚠ Sin carpeta de OT:
    los números pueden repetirse y los PDF se descargan" con el chip para
    conectar / dar permiso;
  - con carpeta, si la web ya usó un número mayor que el último de la
    carpeta → "⚠ La web ya usó la 0953 pero en la carpeta la última es la
    0950: ¿OneDrive está sincronizado?".
- Limitación (se dice en el title del cartel): la web ve la carpeta de esta
  PC; si OneDrive subió el archivo a la nube lo muestra el ícono de OneDrive.

## Pruebas

- Unitarias: `renumerarOT` (OT, movimientos, mermas, correcciones y agregados
  del lote; no toca los de otros lotes ni otros números), `estadoPdf`/texto
  de la etiqueta, el cartel de desfase (`desfaseCarpeta(nombres, web)`), y la
  guardia del overlay en lo que sea puro (serializar/restaurar el borrador).
- Navegador con el mock :8819: clic afuera minimiza y retoma con los lotes;
  recarga y retomar borrador; ✎ N°; imprimir con número ocupado (OPFS no
  aplica: se prueba "sin carpeta" → descargado + cartel).
