# Guía de trabajos numerada, guardada en la carpeta y con recuadro

Fecha: 2026-11-11 · Rama `feat/guia-numerada` (sale de origin/main e498337)

## Por qué

La Guía de trabajos (`/ordenes/?v=guia`, spec 2026-11-04) se diseñó como "una
guía viva, imprimir no guarda". En la práctica cada impresión es una OT de la
serie principal (en la carpeta ya hay `0950 Orden de Trabajo.pdf`,
`0955 Orden de Trabajo.pdf` hechas a mano), así que la guía tiene que numerar y
guardar como las demás órdenes. Además la hoja impresa sale "página en blanco":
el Excel original (`AAA Guía de Trabajos.xlsx`, hoja OT) tiene el título en una
caja y un marco que encierra todas las tareas hasta el pie.

Decisiones del usuario (2026-11-11):
- Al imprimir: próximo N° de la serie principal + PDF en la carpeta; queda en
  **Historial ya cerrada** (no en Pendientes). La guía sigue viva igual.
- **Sin vista preliminar**: la pantalla ya es la hoja.
- Recuadro como el Excel RCI 08.

## 1. Número y PDF al imprimir

- La barra de la guía (`.gt-barra`) suma el chip de carpeta de las otras OT
  (`chipCarpeta('principal')` + `cablearChipsCarpeta`): "📁 Ordenes de Trabajo
  2026 · última: 0965", o el aviso "Sin carpeta… Conectar".
- El encabezado de la hoja muestra **N° 0966**: el propuesto por
  `proponerNumero('principal')` (carpeta + números de la web de Lotes y Prensas
  vía `/ordenes/api/numeros`, que ahora también cuenta las guías impresas). Es
  editable (contenteditable, como las firmas); se guarda solo en memoria de la
  vista, no en la guía viva — después de imprimir se vuelve a proponer.
- **Imprimir** llama a `imprimirYGuardar({ serie: 'principal', numero,
  titulo: 'Guía de trabajos', contenedor, claseBody: 'printing-guia' })` de
  `public/lotes/js/guardar-ot.js`: re-chequeo contra la carpeta, diálogo
  "Imprimir y guardar 0966" con nombre `0966 Guía de trabajos.pdf`, PDF a la
  carpeta o descarga si no hay. Si el número ya está, devuelve `numeroLibre` y
  la hoja lo toma.
- La app de Órdenes hoy no fija `entornoOT`: `guia-vista.js` lo fija al montar
  con lo mínimo que usa `guardar-ot.js` (`mostrarOverlay`/`cerrarOverlay`
  propios de /ordenes/, `datos` y `numerosWeb` que devuelven vacío porque los
  números de la web llegan por `/ordenes/api/numeros`). `dialogos.js` y
  `hoja-pdf.js` se importan desde /lotes/js como ya hace Prensas.
- La hoja lleva la clase `.orden-hoja` que espera `hoja-pdf.js`, y el CSS de
  impresión de la guía vive en `public/ordenes/index.html` (no toca
  `lotes-papel-intacto`).

## 2. Historial (ya cerrada)

- Cada impresión es una fila de una tabla nueva `guia_impresas` (migración
  0004: `id` autoincremental, `numero`, `fecha` ISO, `por` email, `json` con
  la **foto** `{ emitio, recibio, renglones: [{ n, tipo, texto }] }` — las
  órdenes pendientes van como su texto, `textoDeOrden`). Va aparte de
  `guia_trabajos` a propósito: la guía viva se manda ENTERA en cada guardado
  (cada 800 ms al tipear) y cargarle cientos de fotos la volvería pesada.
  **Al desplegar: `npm run migrar:nube`.** Sin la tabla, lista y números
  siguen andando (sin impresas) y guardar una impresa avisa que falta.
- Se agrega con `POST /ordenes/api/guia/impresas` (solo editor), **después**
  de que `imprimirYGuardar` devuelve `ok` — cualquier salida ok cuenta,
  también "Solo imprimir" (el papel lleva el número). Un lector imprime sin
  número (como hoy).
- `GET /ordenes/api/lista` suma las impresas como `ResumenOrden` con
  `modulo: 'guia'`, `id` = id de la fila, `fuente: 'guia_impresas'`, `tipo: 'guia'`,
  `estado: 'ejecutada'`, `numero`, `fecha`. Las ve quien tenga rol en Lotes o
  Prensas (el mismo permiso que la guía).
- `GET /ordenes/api/numeros?serie=principal` suma los números de
  `guia_impresas`: Lotes y Prensas ya no proponen un número que usó la guía.
- **Ver** en Historial abre `/ordenes/?v=guia&impresa=<id>` (la foto sale de
  `GET /ordenes/api/guia/impresas?id=<id>`): la hoja guardada
  armada con la misma función de la hoja (sin controles), solo lectura, con
  "Reimprimir" (imprime sin pedir número nuevo ni guardar otra vez) y "Volver".
  `urlAbrir` resuelve `modulo: 'guia'` a esa URL.
- La guía viva no cambia al imprimir: lo no tildado sigue.

## 3. Recuadro como el Excel RCI 08

Pantalla y papel iguales (la pantalla ES la hoja):
- Arriba: CATENA INSTITUTE · ORDEN DE TRABAJO - RCI 08 - Rev. 02 … (como hoy).
- "Orden de Trabajo" dentro de una **caja con borde**.
- Debajo: Fecha, año y **N°**.
- La banda gris "GUÍA DE TRABAJOS, SEGUIR ORDEN INDICADO" es la tapa de un
  **marco** (borde izquierdo, derecho y de abajo) que encierra todos los
  renglones; al imprimir el marco se estira hasta el pie de la A4 aunque haya
  pocas tareas (alto mínimo de la hoja impresa), como el Excel.
- Emitió / Firma / Recibió al pie, justo debajo del marco.
- Si la guía no entra en una A4, el encabezado se repite (thead) como hoy y el
  marco sigue en la hoja siguiente.

## Fuera de alcance

Vista preliminar; Pendientes para la guía; editar una guía impresa; cambiar la
guía viva al imprimir.

## Pruebas

- `fotoImpresa` (foto de renglones, numeración, texto de las órdenes).
- Rutas: `POST/GET /guia/impresas` (permisos, validación), `/lista` incluye
  las impresas como ejecutadas, `/numeros` las cuenta.
- Hoja: N° en el encabezado, clases del marco, modo solo lectura sin controles.
- Navegador con mock (`scratchpad/mock-guia*.mjs`) y carpeta de prueba en OPFS
  (nunca la real): numerar, imprimir y guardar, aparece en Historial, Ver y
  Reimprimir; Ctrl+P para ver el marco en A4.
- Si se agrega un módulo JS nuevo: `node scripts/precargas.mjs`.
