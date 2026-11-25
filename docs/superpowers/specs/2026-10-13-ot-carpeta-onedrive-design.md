# OT numeradas por la carpeta de OneDrive + PDF guardado al emitir (Lotes web)

Fecha: 2026-10-13 · Estado: diseño aprobado, falta plan

## Problema

Cada orden de trabajo emitida se archiva en la carpeta de OneDrive
`Archivos de Roy Urvieta - Año 2026\Ordenes de Trabajo 2026`, con un número
consecutivo al principio del nombre. Hoy:

- La web numera sus OT por su cuenta (`OT-2026-NNN`, `proximoNumeroOT` en
  `public/lotes/js/ot-movimientos.js`), mirando solo sus datos.
- La numeración real es la de la carpeta y la comparten OT que nunca pasan
  por la web (muestras en Excel, fraccionamiento, orden y limpieza…):
  - carpeta principal: `0700 … 0938 <título>.xlsx|.pdf`
  - `B Ordenes de agregados`: `B211 … B222 <título>.xlsx`
- El PDF de la OT emitida se guarda a mano (o no se guarda).

Como la serie la alimentan otras fuentes, **la carpeta es la verdad del número**.

## Objetivo

Al emitir una OT desde la web: proponer el siguiente número de la serie
correcta mirando la carpeta, y guardar ahí el PDF de la hoja emitida.

## Series

| Origen en la web | Serie | Carpeta | Ejemplo |
|---|---|---|---|
| OT de Movimientos (trasiego, corte) | principal | raíz de la carpeta elegida | `0939` |
| Orden de muestras (análisis) | principal | raíz | `0940` |
| Orden de microbiología | principal | raíz | `0941` |
| Orden de corrección de SO₂ | B | `B Ordenes de agregados` | `B223` |
| Otros agregados | B | `B Ordenes de agregados` | `B224` |

Carpetas A, C, D, E: fuera de alcance.

## Comportamiento

### Conectar la carpeta
- Botón **📁 Carpeta de OT** en Lotes. Usa la File System Access API
  (`showDirectoryPicker`, modo `readwrite`): solo Chrome/Edge.
- El handle se guarda en IndexedDB (por navegador/PC). En cada sesión nueva se
  pide `requestPermission` con un clic (el navegador no lo deja automático).
- El botón muestra el estado: conectada (nombre de la carpeta) / pide permiso /
  sin conectar / navegador no compatible.
- Se valida que la carpeta elegida contenga la subcarpeta
  `B Ordenes de agregados`; si no, se avisa ("¿es la carpeta correcta?") pero se
  permite seguir.

### Emitir (paso común a los cinco orígenes)
1. Listar la carpeta de la serie y calcular el máximo. Mostrar
   "última en la carpeta: 0938 Muestra cortes vinos Liberados".
2. Proponer número = máx(carpeta, último número conocido por la web) + 1,
   editable.
3. Proponer nombre de archivo `<número> <título de la hoja>.pdf`, editable.
   Se limpian caracteres inválidos en Windows (`\/:*?"<>|`).
4. Al confirmar: **volver a listar** la carpeta; si el número ya existe (algún
   archivo empieza con ese número), avisar y proponer el siguiente libre sin
   guardar nada.
5. Guardar la OT en la web con ese número; generar el PDF y escribirlo en la
   carpeta. Si ya existe un archivo con el mismo nombre exacto, no se pisa:
   se avisa.
6. Si falla la escritura del PDF (permiso perdido, disco), la OT queda guardada
   y se ofrece descargar el PDF.

### Sin carpeta (otra PC, Firefox, celular)
- Aviso visible: "sin carpeta: revisá el número a mano".
- Número propuesto con lo que conoce la web: último número emitido en la web
  y el último máximo visto en la carpeta (guardado junto al handle).
- El PDF se descarga en vez de escribirse.

### Números en la web
- El número de la carpeta **reemplaza** a `OT-2026-NNN` en la web, en el papel
  (`N° de Orden`) y en el nombre del PDF. Las OT ya emitidas conservan el suyo.
- `proximoNumeroOT` deja de ser la fuente del número; queda solo como respaldo
  para el caso sin carpeta, leyendo los números con formato nuevo (`0939`,
  `B223`) además de los viejos.

## Reglas de parseo del número (módulo puro, con tests)
- Serie principal: nombre que empieza con exactamente 4 dígitos seguidos de
  espacio o fin (`/^(\d{4})(\s|\.|$)/`). Archivos y carpetas.
- Serie B: `/^B(\d{3,4})(\s|\.|$)/i`, dentro de `B Ordenes de agregados`.
- Todo lo demás se ignora (`AAA Guía…`, `Backup`, `CLAUDE.md`, `A Ordenes…`,
  `Templeates`, `__pycache__`).
- Números repetidos en la carpeta (hay dos `0702`) no rompen nada: solo
  importa el máximo.
- Formato de salida: principal 4 dígitos con ceros (`0939`); B sin ceros extra
  (`B223`).
- Tests con la lista real de nombres de la carpeta al 2026-10-13.

## PDF
- Se genera en el navegador a partir de las mismas hojas A4 que hoy se
  imprimen, con las ediciones de papel (celdas, banda, título) incluidas.
- Rasterizado (imagen por página dentro del PDF; sin texto seleccionable):
  suficiente para archivo.
- Librerías cargadas desde cdn.jsdelivr.net/npm o copiadas al repo
  (decidir en el plan; preferir copiadas al repo para no depender del CDN).

## Unidades
- `public/lotes/js/carpeta-ot.js`: handle en IndexedDB, permisos, listar,
  escribir. Sin lógica de numeración.
- `public/lotes/js/numero-ot.js` (puro): parseo de nombres, máximo por serie,
  siguiente número, limpieza del nombre de archivo, chequeo de duplicado.
- `public/lotes/js/hoja-pdf.js`: hojas A4 del DOM → Blob PDF.
- `public/lotes/js/dialogo-emitir-ot.js`: el paso común (número, nombre,
  re-chequeo, guardar/descargar), usado por los cinco orígenes.
- Cambios en `vista-ot-emitir.js`, `vista-ot-corte.js`,
  `vista-movimientos.js`, `orden-hoja.js`/vista de muestras y
  microbiología, `vista-orden-correccion.js`, `vista-agregados.js`.
- Nada del lado del servidor.

## Pruebas
- Tests unitarios de `numero-ot.js` con los nombres reales.
- En el navegador: emitir contra una **copia** de la carpeta (nunca la real),
  verificar número, re-chequeo con un archivo agregado a mano entre medio,
  PDF escrito, y el camino sin carpeta (descarga).

## Fuera de alcance
- Re-generar el PDF al editar una OT ya emitida (futuro botón "Re-guardar PDF").
- Carpetas A, C, D, E.
- Escribir en OneDrive por Microsoft Graph.
