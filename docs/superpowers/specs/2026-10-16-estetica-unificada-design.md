# Estética unificada de la plataforma — diseño

Fecha: 2026-10-16 · Estado: aprobado en conversación, falta revisión de la spec escrita

## Objetivo

Que Lotes, Barriles y las pantallas sueltas de la plataforma se vean como un solo
producto profesional, con el estilo que ya tiene Prensas ("Piedra y tinta"), y que
toda la plataforma se pueda usar desde el teléfono.

Origen: la auditoría de UI del 2026-10-15 (skills `web-design-guidelines` y
`redesign-existing-projects`) encontró cuatro estéticas distintas (tres letras,
cuatro fondos, tres tonos de vino, ningún token compartido), unas 145 ventanitas
nativas `alert/confirm/prompt` y una barra común que se desborda en 375 px.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Estilo de referencia | **Prensas** tal como está hoy. Su estética no se toca. |
| Menú (`index.html`) y login | Quedan como están (Instrument Serif + mapa). Ya combinan: comparten Plex y el vino. |
| `cambiar-clave.html` | Se alinea con el **login**, porque es parte de entrar. |
| `admin.html` y barra común | Pasan al estilo de Prensas. |
| Colores con significado | **No cambian de valor.** Solo cambia la interfaz alrededor. |
| Alcance | Estética + aviso y diálogo propios que reemplazan `alert/confirm/prompt`. Los arreglos de fondo de Barriles en el celular (carga diferida, foco del escáner, botón Atrás, consultas sin conexión) son **otro proyecto**. |
| Celular | Base de celular en todas las pantallas (Prensas incluida, sin cambiar su estética) + una vista hecha para el dedo en Lotes: **buscar lote → ficha**. |
| Orden | Etapa 1 base común → Etapa 2 Lotes → Etapa 3 Barriles. |
| Técnica | Un archivo de estilo compartido (`public/shared/estilo.css`) + un script que vigila que no se separe de Prensas. |
| Rama `feat/barriles-programador` | Se revisa y se mergea al empezar la Etapa 3. |

## Fuera de alcance

- Cualquier cambio de la estética de Prensas, del menú y del login.
- Las hojas de papel (OT, Orden de muestras, Orden de corrección, Orden de
  microbiología, rótulos de OT, rótulos A4 de Barriles, Acción rápida, Rellenos)
  y su CSS de impresión.
- Los arreglos de fondo de Barriles en el celular listados arriba.
- Vistas "para el dedo" de Lotes que no sean buscar lote → ficha (la Agenda, el
  registro de SO₂ y la recorrida de tanques funcionan con la base de celular).
- Modo oscuro.

## Parte 1 · Base común

### `public/shared/estilo.css` (nuevo)

- `@font-face` de Cormorant Garamond (500, 500 itálica, 600) e IBM Plex Sans (400,
  500, 600) leyendo de `/prensas/fonts/`. No se mueve ningún archivo de fuentes.
- `:root` con **los mismos nombres y valores** que `public/prensas/index.html`:
  `--bg #ECE8E1`, `--panel #F4F1EB`, `--panel2 #E4DFD6`, `--line #D6D0C5`,
  `--rule #1C1B19`, `--txt #1C1B19`, `--muted #68625A`, `--accent #5A1724`,
  `--accent2 #43101A`, `--ok #56684A`, `--nook #8E2330`, `--warn #7F622B`,
  `--info #3F5560`, los cuatro `--*-tinte`, `--serif`, `--sans`.
- Tokens nuevos que Prensas no tiene, con prefijo propio para no chocar:
  `--ci-r: 2px` (esquinas), escala de capas `--ci-z-sticky`, `--ci-z-menu`,
  `--ci-z-dialogo`, `--ci-z-aviso`, `--ci-tap: 44px` (alto mínimo táctil).
- Piezas con prefijo `ci-`: `ci-dialogo`, `ci-aviso`, `ci-btn` (+ `.primario`,
  `.peligro`), `ci-pill` (+ `.ok`, `.mal`, `.aviso`), `ci-pg-head` (cabecera de
  pantalla con título en Cormorant), `ci-tbar` (barra mínima sobre la tabla),
  `ci-mas` (menú "Más").
- **Sin reglas sobre etiquetas sueltas** (`table`, `th`, `td`, `select`, `input`,
  `button`, `body`). Cada app re-estiliza sus clases actuales con estos tokens;
  así no se reescribe el HTML de Lotes (≈2.000 líneas) ni de Barriles (≈6.900).
- Base de celular en `@media (max-width: 760px)` para las piezas `ci-*`: alto
  mínimo `--ci-tap`, campos a 16 px (sin zoom de iOS), diálogo a pantalla
  completa.

### `public/shared/dialogo.js` (nuevo)

Script clásico (no módulo) que cuelga `window.CI`:

- `CI.avisar(texto, {tipo: 'ok'|'mal'|'info', deshacer: fn, ms})` — aviso abajo
  que se va solo (≈4 s, más si tiene Deshacer), dentro de un contenedor
  `role="status" aria-live="polite"`. **No toma el foco.**
- `CI.confirmar({titulo, texto, si, no, peligro}) → Promise<boolean>` — `<dialog>`
  con `showModal()`: Escape = no, foco atrapado, vuelve al elemento de antes al
  cerrar. Los botones dicen la acción (`si: 'Borrar OT'`), nunca "Aceptar".
- `CI.pedir({titulo, texto, campo: {tipo, valor, opciones, inputmode}}) →
  Promise<string|null>` — reemplaza `prompt()`. Con `opciones` muestra un
  `<select>` (p. ej. la variedad en Configuración de Lotes).
- La lógica pura (armar el modelo del diálogo, validar opciones) va separada en
  `public/shared/dialogo-modelo.js` para testearla con vitest (el runtime de
  Workers no tiene DOM).

**Costo conocido:** `confirm()` es sincrónico y `CI.confirmar` no. Cada llamada se
pasa a `async`/`await` en su función. Son ≈75 en Lotes, 69 en Barriles, 2 en
admin y 1 en `fusion.js`; se migran **dentro de la etapa de cada app**, no todas
juntas. `fusion.js` y admin van en la Etapa 1.

### `public/shared/barra.js`

- Letra Plex (deja Hanken Grotesk) y colores de los tokens: fondo `--txt`, letra `--bg`.
- `<nav aria-label="Plataforma">`, el módulo actual con `aria-current="page"`.
- Celular (≤ 760 px): se esconden el nombre y el rol; Contraseña y Salir pasan a
  un menú `ci-mas`. Nada se desborda a 375 px.
- Publica su altura en `document.documentElement.style.setProperty('--ciw-h', …)`
  (ya lo usa Prensas) para que los encabezados fijos de Lotes y Barriles se
  ubiquen debajo.

### Pantallas sueltas

- `admin.html`: estilo de Prensas con `estilo.css`; sus 2 `confirm()` pasan a
  `CI.confirmar` reutilizando su `<dialog>`; "Acceso a cada módulo" como
  `<fieldset><legend>`.
- `cambiar-clave.html`: letras y colores del login (Instrument Serif, `#F3F4F1`,
  malbec `#7A1631`), sin el mapa. Mantiene toda su lógica actual.

### Prensas: solo base de celular

Sin cambiar ningún color, letra ni forma: botones e íconos de fila con alto
mínimo táctil en pantallas táctiles (`@media (pointer: coarse)`),
`inputmode="decimal"` en celdas numéricas y el punto de "guardado" visible en
pantallas angostas (hoy se esconde bajo 900 px).

### Vigilancia: `scripts/verificar-estilo.mjs`

Script de Node que extrae el bloque `:root` de `public/prensas/index.html` y el de
`public/shared/estilo.css` y falla si algún token compartido difiere. Se engancha
al `npm test` (`node scripts/verificar-estilo.mjs && vitest run`) para que corra
también en el CI.

## Parte 2 · Lotes

1. **Congelar los colores con significado.** Se revisa cada uso de `--ok`,
   `--nook`, `--warn`, `--accent` y sus `rgba(...)` en `public/lotes/`. Los que
   expresan un criterio pasan a tokens propios con el **valor de hoy**:
   `--ver-ok #3f7d4f`, `--ver-fuera` (el naranja de Análisis), `--ver-mal
   #b03a2e`, etc. Se dejan como están: `--sc-0…4`, `--tb-*`, el naranja de
   `fila-pendiente`, el violeta de `fila-agregado`, los semáforos de la Agenda y
   las series de los gráficos. Los usos de interfaz (estado "guardado", bordes,
   botones) pasan a los tokens de Prensas. Este paso va en su propio commit y
   **no cambia nada visible**.
2. **Estilo de Prensas en la interfaz.** Cargar `estilo.css`; fondo piedra;
   títulos, cabeceras y números de KPI en Cormorant; resto en Plex; botones de
   contorno con esquina de 2 px; pills rectas. Se borra el bloque de "renovación
   visual" (sombras `--sh-*`, radios `--r-*`, `fadeUp` duplicado, los 45
   `!important`). En los gráficos cambian solo grilla y letras.
3. **Barra como la de Prensas.** Arriba: **Panel · Lotes · Análisis ·
   Movimientos · Agenda**. En **Más**: Cargar análisis, Tablero FML,
   Correcciones, Orden de muestras, Cruce con barriles, Configuración. Sin
   emojis en pestañas ni sub-pestañas. Las sub-pestañas mantienen su lugar.
4. **Avisos y diálogos.** Las ≈75 ventanitas a `CI.*`. El overlay de formularios
   (`#overlay`, `nucleo.js`) pasa a `<dialog>` con la clase `ci-dialogo`.
   "✓ Confirmar todas" del Dashboard pide confirmación con la cantidad de lotes.
   El nombre de usuario deja de pedirse con `prompt()`: se muestra el de la
   sesión, de solo lectura (verificar antes qué usa el servidor para el
   historial).
5. **Celular.** Base de celular en todas las pestañas (tablas con scroll dentro de
   su recuadro y primera columna fija, botones `.rowbtn` a `--ci-tap`,
   `inputmode` en lote, vasija, N° de OT y valores). Un campo **Buscar lote**
   siempre visible en la barra, que abre la Ficha en una columna (variedad,
   litros, vasijas, etapa, último análisis con sus colores de veredicto). La
   ficha queda en la URL `#ficha/<lote>`: se comparte y sobrevive al F5.

## Parte 3 · Barriles

0. **Revisar y mergear `feat/barriles-programador` (9ff29b6)** a `main`. Si la
   revisión encuentra algo que no conviene, se avisa antes de mergear.
1. **Congelar los colores con significado:** estados de barril en el mapa 2D y
   3D (lleno/vacío/libre), avisos del escáner (marco verde/rojo, número grande),
   amarillo del modo por lote, la escena 3D completa.
2. **Estilo de Prensas:** sale el header vino macizo y la letra Segoe; entra el
   encabezado claro con la marca en Cormorant, Plex y el fondo piedra. La
   navegación del programador pasa a pestañas tipo Prensas con **Más**, sin
   emojis. Los ≈96 colores escritos a mano pasan a tokens, salvo los congelados.
3. **Portada del operario:** los 6 botones grandes **no se achican**; pasan a
   recuadros piedra con filete de tinta y el nombre de la tarea bien legible.
4. **Avisos y diálogos:** las 69 ventanitas a `CI.*`. El aviso no le roba el
   foco al escáner. El ✕ que saca un barril de la orden da **Deshacer**.
5. **Celular:** botones a `--ci-tap` con el ✕ separado; campos a 16 px;
   `inputmode` en OT, lote y cantidad; `env(safe-area-inset-*)` en los pies de
   cámara.

El cambio va solo en `repos\catenainstitute`: Barriles local está congelado desde
el 2026-10-06, así que ya no aplica la invariante de las 12/9 líneas con el repo
de mapa-barriles.

## Entrega

| Etapa | Contenido | Deploy |
|---|---|---|
| 1 · Base común | `estilo.css`, `dialogo.js`, barra, admin, cambiar clave, base de celular en Prensas, `verificar-estilo.mjs` | 1 |
| 2 · Lotes | Pasos 1–5 de la Parte 2 | 1 (o 2 si conviene separar el paso 5) |
| 3 · Barriles | Paso 0 + pasos 1–5 de la Parte 3 | 1 |

Cada etapa en su rama y worktree, mergeada a `main` en un solo merge (rollback
= `git revert`). El deploy lo corre el usuario desde `repos\catenainstitute` en
`main` y con la carpeta limpia; antes se le dice qué otros cambios de `main`
todavía sin desplegar entran en ese deploy.

## Verificación de cada etapa

- Server de prueba local que sirve `public/` con el último respaldo y sin login.
- Navegador a 1280 px y a 375 px: sin scroll horizontal de página, botones
  ≥ 44 px en táctil, todo diálogo nuevo se cierra con Escape y devuelve el foco.
- **Colores con significado:** script que anota el color calculado de una
  muestra fija de celdas con veredicto, escala de riesgo, Tablero FML, estados del
  mapa, etc., antes y después. Tiene que dar idéntico.
- **Impresión:** vista de impresión de cada hoja comparada con la de antes, y
  `git diff` sin cambios en sus bloques `@media print`.
- `npm test` en verde (incluye `verificar-estilo.mjs` y los tests de
  `dialogo-modelo.js`).
- Fotos de antes y después de cada pestaña para el usuario.

## Riesgos

- **Nombres de token compartidos con significado distinto** (`--ok` en Lotes es
  veredicto y en Prensas es interfaz): lo resuelve el paso de congelado, que va
  primero y en su propio commit.
- **Migrar `confirm()` a `async`** puede cambiar el orden de ejecución si el
  código seguía después del `confirm`. Cada migración se revisa en su función y
  se prueba el flujo.
- **Cambios en `main` sin desplegar** de otras sesiones: se listan antes de cada
  deploy.
- **Otras sesiones cambian de rama `repos\catenainstitute`**: trabajar siempre en
  worktree propio.
