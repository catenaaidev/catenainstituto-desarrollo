# Lotes web: selector de años y carga de los lotes 2025

Fecha: 2026-10-02 · Estado: diseño aprobado, implementación en `feat/lotes-anios`.
**No se publica ni se importa nada hasta que la cuenta de Cloudflare pase a
Workers Paid** (ver "Puesta en marcha").

## Problema

La web de Lotes tiene solo la vendimia 2026 (312 lotes 26xxx, 3.159 análisis).
Hay que subir la 2025 (`Año 2025\Registro de Lotes CIW 2025\Lotes CIW 2025.xlsx`:
364 lotes 25xxx, 4.005 análisis con datos), que **se sigue trabajando**: vinos en
crianza que reciben análisis, correcciones y OT. Con dos vendimias juntas hace
falta poder prender y apagar cada año en toda la web.

Decisiones del usuario (2026-10-02):

- 2025 es tan editable como 2026.
- Selector de **varios años a la vez** (botones que se prenden y apagan por
  separado), no "un año por vez".
- El selector manda en **todas las pestañas**.
- Después de subir 2025, **la web es la única fuente** para 2025; el Excel queda
  de respaldo.
- Se construye y prueba todo en local en paralelo; se publica cuando se confirme
  el pago de Workers Paid.

## Enfoque elegido: un solo documento, año deducido del número de lote

Se descartó un documento por año: no resuelve el límite de CPU (el documento
2026 solo ya pasa los 10 ms del plan Free, ver `plataforma-error-1102`) y
complica todo lo que cruza años (OT, traspasos y linaje 25xxx → 26xxx tendrían
que escribir dos documentos con dos versiones). Partir el documento en filas de
D1 es la solución de fondo al tamaño, pero es una reescritura y queda fuera.

Costo aceptado: el documento pasa de 1,95 MB a ~4 MB (~45 ms de CPU por
lectura/escritura). **Requiere Workers Paid.** En Free empeoraría el 1102 para
todos, incluso mirando solo 2026.

## Diseño

### 1. Año de cada registro

- `anioDeLote(lote)`: si el número de lote tiene 5 dígitos, el año es `2000 +`
  los dos primeros (`25137` → 2025, `26001` → 2026). Cualquier otro formato →
  `null` = "sin año", que **se muestra siempre**.
- No se agrega ningún campo al documento. Análisis, correcciones
  (`analisis[].correccion`), movimientos, `estado_lote` y mermas heredan el año
  de su lote. Una OT se muestra si **alguno** de sus lotes (o su `lote_corte`)
  está en un año prendido.
- Los años disponibles salen de los lotes existentes (más el año en curso). El
  primer 27xxx agrega el botón 2027 solo.

### 2. Selector

- Fila de botones `2025 | 2026` en la barra de pestañas, visible en todas.
- Cada botón se prende/apaga por separado; no se puede apagar el último prendido.
- Por defecto: **solo el año más nuevo** (hoy 2026), para que la web siga igual
  de liviana para quien no mira 2025. La elección se recuerda por navegador
  (`localStorage`, envuelto en try/catch; si falla, vale el defecto).
- Cambiar la selección invalida el caché de render de pestañas
  (`invalidarVistas()` de `nucleo.js`) y redibuja la activa.

### 3. Dónde filtra y dónde no

Módulo nuevo `public/lotes/js/anios.js` con `anioDeLote`, `aniosDisponibles`,
`aniosActivos`, `loteVisible(lote)` y un evento `lotes:anios-cambiados`.

**Filtra** (solo al armar lo que se muestra): las listas de Dashboard, Lotes,
Análisis, Tablero FML, Correcciones SO2, Movimientos (historial y OT), Orden de
muestras (candidatos y autocompletar), Cruce con barriles y Orden de corrección.
Las respuestas del servidor (`/dashboard`, `/analisis`, `/orden-correccion`,
cruce) se filtran en el navegador por el lote de cada fila. Los contadores
("319 / 319 lotes") cuentan solo lo visible.

**No filtra** (trabaja siempre sobre el documento entero):

- controles de lote duplicado y el número sugerido para un lote nuevo (sigue
  siendo el siguiente del año en curso);
- linaje, padre/hijo, `⎘ Hijo`, deducción de origen Uva/Vino;
- vasijas, cubicación, padrón, configuración y criterios;
- buscar un lote puntual para una OT o una ficha: si el lote es de un año
  apagado, se encuentra igual.

El navegador sigue cargando y guardando `DATOS()` completo; `guardar()` no
cambia. El servidor no cambia.

### 4. Carga de 2025

- Script de conversión del Excel 2025 (hojas **LOTES** y **ANÁLISIS**) al formato
  del documento, con el mismo mapeo de columnas que `migrar_excel.py` del repo
  `Lotes` usó para 2026 (verificar columna por columna: las cabeceras son las
  mismas). Saltea los renglones de análisis sin ningún valor (380).
- Fusión con el documento vigente: agrega lotes 25xxx y sus análisis; **no toca
  nada de 2026**. Aborta si ya existe algún lote 25xxx en el documento (no se
  importa dos veces).
- Quedan fuera: hojas Trasladar, Disponibles y Nebbiolos (21101, 23048, 24127 no
  son lotes 2025), y el registro RCI 19 de correcciones SO2 2025.

### 5. Pruebas

- Unitarias (`node --test`): `anioDeLote` (5 dígitos, string/number, formatos
  raros), `aniosDisponibles`, selección por defecto y persistencia, `loteVisible`,
  visibilidad de una OT mixta; conversión y fusión (conteos, que 2026 queda
  idéntico, rechazo de doble importación).
- En navegador, con la D1 local sembrada con 2026 real + 2025 convertido:
  cada pestaña con 2025 / 2026 / ambos; editar un análisis 2025 y guardar;
  crear un lote nuevo con 2026 apagado; tiempos de carga, guardado y render de
  Análisis con los dos años (hoy ~2,8 s con uno).

## Puesta en marcha (cuando se confirme Workers Paid)

Desde `repos\catenainstitute` en `main` limpio, con esto mergeado:

1. Respaldo: `respaldo-nube-lotes-<fecha>-pre-2025.json`.
2. Re-chequear `version` justo antes (Oriana edita en vivo) y fusionar 2025
   sobre lo último.
3. `node scripts/importar.mjs --modulo lotes --remote --piso-la-web --datos …`
   → `✓ Importación verificada`.
4. `npx wrangler deploy`.
5. Ctrl+F5 y revisar las pestañas con 2025 prendido.
