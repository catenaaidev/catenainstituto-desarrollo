# Lotes: carga de análisis, pestaña Análisis y contador del dashboard

Fecha: 2026-09-14

Seis cambios pedidos por el equipo de laboratorio, todos sobre pantallas que ya
existen en el módulo Lotes de la plataforma web. Ninguno toca el servidor, D1 ni
las migraciones: todo vive en `public/lotes/`.

## Por qué

El pegado de análisis viene de una planilla cuyo orden de columnas no es el que
la app trae por defecto, así que hoy hay que reescribir el orden a mano cada vez.
La pestaña Análisis, que es donde se revisa lo cargado, muestra las columnas en
un orden que no coincide con el de la planilla, arrastra dos columnas de
corrección que nadie edita ahí y no deja filtrar por lote ni ensanchar las
columnas. Y el dashboard no dice cuántos análisis faltan.

---

## 1 · Pegado con el orden de la planilla

### Qué cambia

El default del campo *Orden de columnas* (`#cargarCols`, `index.html:972`) pasa a
ser las 14 columnas de la planilla:

```
lote, vasija, año, fecha, etanol, ph, av, gluc_fruc, malico, lactico, acidez_total, -, -, so2_libre
```

Mapeo confirmado con el usuario a partir de una fila real
(`26194 ⇥ ⇥ 2026 ⇥ 10/09/2026 ⇥ 14,2 ⇥ 3,6 ⇥ 0,54 ⇥ 3,6 ⇥ 0,16 ⇥ ⇥ 4,44 ⇥ ⇥ ⇥ 28`):

| # | Valor | Destino |
|---|---|---|
| 1 | `26194` | `lote` |
| 2 | (vacía) | vasija — **se descarta** |
| 3 | `2026` | año — **se descarta** |
| 4 | `10/09/2026` | `fecha_analisis` |
| 5 | `14,2` | `etanol` |
| 6 | `3,6` | `ph` |
| 7 | `0,54` | `av` |
| 8 | `3,6` | `gluc_fruc` |
| 9 | `0,16` | `malico` |
| 10 | (vacía) | `lactico` |
| 11 | `4,44` | `acidez_total` |
| 12-13 | (vacías) | **se descartan** |
| 14 | `28` | `so2_libre` |

### La corrección de fondo

Hoy `parsearPegado` (`vista-cargar.js:46-58`) hace `obj[col] = valor` para
cualquier nombre que no sea `fecha` ni una clave numérica conocida. Con el orden
de arriba eso crearía análisis con campos `vasija` y `año` colgando, que nadie
lee y que viajarían a D1 dentro del JSON del documento.

La regla pasa a ser **lista blanca**: solo se guardan las claves conocidas.
Cualquier otro nombre — `vasija`, `año`, `-`, o una columna sin nombre — se lee
para que las posiciones calcen y se descarta. `alcohol` queda como alias de
`etanol`, porque así se llama la columna en la planilla.

### Dónde vive

La parte pura (resolver la lista de nombres a un plan de columnas, y parsear una
línea contra ese plan) sale a `public/lotes/js/carga-cols.js`, con tests en
`test/lotes-carga-cols.test.mjs`. Es el patrón que ya siguen `anchos-cols.js`,
`filtro-llenado.js` y `envases.js`: lógica pura importable desde los tests, que
corren en el runtime de Workers y no tienen `document`.

`vista-cargar.js` queda como la capa que lee el textarea, arma la tabla de
previsualización y confirma.

### Criterios de aceptación

- La fila de ejemplo, pegada con el orden por defecto, previsualiza sin errores y
  produce un análisis con `etanol 14.2`, `ph 3.6`, `av 0.54`, `gluc_fruc 3.6`,
  `malico 0.16`, `acidez_total 4.44`, `so2_libre 28`, `fecha_analisis 2026-09-10`.
- Ese análisis **no** tiene claves `vasija` ni `año`.
- `lactico` queda en `null`, no en `0` ni en `''`.
- Un orden que nombre una columna desconocida no rompe: la saltea.
- La tabla de previsualización **no muestra** las columnas descartadas, así que
  se ve de un vistazo qué se va a guardar y qué no.
- El orden viejo (`lote, fecha, ph, av, …`) sigue funcionando para quien lo tipee.

---

## 2 · Columnas de la pestaña Análisis

`COLS_ANALISIS` (`vista-analisis.js:16`) pasa de 17 a 15 entradas:

> Lote · Variedad · Fecha · **Etanol** · pH · AV · Gluc+Fruc · Az. Reductor ·
> Málico · Láctico · Acidez total · SO₂ libre · Comentario · OT · SO2 deseado

Dos cambios: **Etanol sube al cuarto lugar**, para leer la tabla en el mismo
orden en que se pega; y se van **MBK a agregar** (`mbk_a_agregar`) y **mL
exactos** (`ml_exactos`).

Las dos columnas que se van son de corrección: el dato no se borra y se sigue
viendo y editando en las pestañas **SO₂** y **Orden de corrección**, que es donde
se usa para preparar la dosis. Lo único que se pierde es poder editarlas desde
Análisis.

`CAMPOS_CORRECCION` queda con `ot_n` y `so2_deseado`. No hay número mágico que
ajustar: `COLSPAN_TOTAL` y el índice de la grilla se derivan de
`COLS_ANALISIS.length`.

### Criterios de aceptación

- La tabla dibuja 15 columnas de dato más la de acciones.
- Ninguna celda de la tabla tiene `data-k="mbk_a_agregar"` ni `data-k="ml_exactos"`.
- Las pestañas SO₂ y Orden de corrección siguen mostrando y editando esos campos.
- Seleccionar un rango y copiarlo sigue dando las columnas en el orden de pantalla.

---

## 3 · Filtro de lote en cajitas

Un cuarto descriptor en `_descAn` (`vista-analisis.js:149`), al lado de Variedad
y Proyecto:

```js
{
  label: 'Lote',
  set: filtAn.lote,
  opciones: () => opcionesValores(DATOS().analisis || [], a => String(a.lote ?? '')),
  match: matchValor(a => String(a.lote ?? '')),
}
```

Reusa `initFiltrosMulti` y `crearFiltroMulti` sin tocarlos. `cmpValores` ya
ordena numéricamente cuando los valores son números, así que los lotes salen en
orden. El botón 🧹 Limpiar filtros lo barre solo, porque `limpiarFiltrosMulti`
recorre `_descAn`.

Las opciones salen de los **análisis**, no de todos los lotes: el panel ofrece
solo lotes que tienen al menos un análisis cargado, igual que ya hace Variedad.

El buscador de texto por lote (`#buscaAnalisis`) queda: sirve para el caso de
tipear un número suelto sin abrir el panel.

### Criterios de aceptación

- El botón `Lote ▾` aparece entre los filtros y lista los lotes con análisis.
- Tildar dos lotes deja en la tabla solo las filas de esos dos.
- El filtro convive con Variedad, Proyecto, mes y llenado (se cruzan con AND).
- 🧹 Limpiar filtros lo destilda.

---

## 4 · Ancho de la pestaña Análisis

Son dos cosas independientes.

### 4a · Ancho de ventana

`#tab-analisis` se suma a la regla que hoy le da el ancho completo a Lotes
(`index.html:95`):

```css
#tab-lotes,#tab-analisis{max-width:none;margin-left:-10px;margin-right:-10px}
```

### 4b · Columnas arrastrables — el refactor

`anchos-cols.js` hoy sirve a una sola tabla. Está clavado a Lotes en cuatro
puntos:

| Punto | Qué asume |
|---|---|
| `cssDeAnchos` (`:60`) | emite selectores `#tLotes` literales |
| `anchos` (`:98`) y `CLAVE_ANCHOS` (`:87`) | un mapa y un localStorage para todo el módulo |
| `autoajustarTodas` (`:206`) | el encabezado está en `thead tr:nth-child(2)` |
| `activarAnchos` (`:239`) | cuelga en `document` un listener filtrado por `#tLotes` |

Análisis tiene encabezado de **una sola fila**, así que el tercer punto falla
directo. Y hay una trampa peor: Análisis rehace su `<table>` entera en cada
render (`sec.innerHTML = html`), así que el guardrail `tabla._anchosWired`
(`:221`) nunca se cumple — ese listener de `document` se volvería a cablear en
cada repintado y la fuga crecería toda la sesión. Lotes no tiene el problema
porque su tabla vive en `index.html` y es el mismo nodo siempre.

**El módulo pasa a ser una fábrica por tabla:**

```js
export function crearAnchos({ tablaId, claveStorage, filaEncabezado });
// devuelve { activar(tabla, onCambio), autoajustarTodas(), restablecer(), hay() }
```

- El estado (`anchos`, `styleTag`, `onCambio`, `arrastre`) pasa de variables de
  módulo a variables de la instancia.
- `cssDeAnchos(anchos, tablaId)` recibe el prefijo del selector. La función sigue
  siendo pura; el test que ya existe (`test/lotes-anchos.test.mjs`) se actualiza
  para pasarle el prefijo y se le suma un caso con `#tAnalisis`.
- `filaEncabezado` es el selector de la fila de `th` a recorrer:
  `'thead tr:nth-child(2)'` para Lotes, `'thead tr'` para Análisis.
- El listener de `mousedown` en `document` se registra **una vez a nivel
  módulo** y despacha a la instancia cuyo `tablaId` contiene al `th` del evento.
  Así el re-render de Análisis no acumula listeners.
- `claveStorage`: `lotes_cols_ancho` (sin cambio, respeta lo que la gente ya
  tiene guardado) y `analisis_cols_ancho`.

En la toolbar de Análisis van los mismos dos botones que Lotes: `↔ Ajustar
anchos` y `↩ Anchos originales`, este último visible solo cuando hay algo que
restablecer.

El CSS del agarre (`index.html:248-254`) hoy está scopeado a
`#tLotes thead tr:nth-child(2)`. Se extiende para cubrir también
`#tAnalisis thead tr`.

### Criterios de aceptación

- Arrastrar el borde derecho de un encabezado en Análisis cambia el ancho de esa
  columna, y el ancho sobrevive al re-render que dispara editar una celda.
- Los anchos de Análisis y los de Lotes son independientes y sobreviven a F5.
- Doble clic en el borde autoajusta la columna al contenido.
- Después de veinte re-renders de Análisis hay **un solo** listener de `mousedown`
  en `document` por el módulo de anchos.
- Lotes sigue funcionando exactamente igual que antes.
- `test/lotes-anchos.test.mjs` pasa, con su caso nuevo de `#tAnalisis`.

---

## 5 · Contador de análisis en el Dashboard

Tres tarjetas nuevas en `#dashKpis`:

| Tarjeta | Qué cuenta |
|---|---|
| **Análisis totales** | lotes activos (`d.lotes.length`) |
| **Completados** | los que tienen análisis dentro de su frecuencia |
| **Faltantes** | los que tienen alarma `frecuencia_vencida` o `sin_analisis_valido` |

Los tres cierran: completados + faltantes = totales.

Se calcula **en el navegador** desde `d.lotes`, que el motor FML ya manda con
`alarmas`, `frecuencia_max` y `dias_desde_analisis`. Cero cambios en `src/`, cero
migraciones.

La definición de "faltante" **ya está escrita** en `vista-dashboard.js:222`,
alimentando la pregunta frecuente *"Faltan analizar"*. Se extrae a una función
única (`faltaAnalizar(lote)`) que usen la tarjeta y la FAQ, para que no puedan
dar números distintos. Es el mismo criterio que ya venía aplicándose; no se
inventa una regla nueva.

Sobre la escala: con los datos de hoy esto va a mostrar del orden de
*240 / 2 / 238*, porque el motor marca casi todo el stock con la frecuencia
vencida. Es el estado real y el usuario ya está avisado.

### Criterios de aceptación

- Las tres tarjetas aparecen y sus números cierran (completados + faltantes = totales).
- "Faltantes" coincide exactamente con el número de la FAQ *"Faltan analizar"*.
- Sin datos cargados, las tres muestran `—` y no rompen el render.

---

## Alcance explícito

**Dentro:** `public/lotes/index.html`, `public/lotes/app.js`,
`public/lotes/js/{vista-cargar,vista-analisis,vista-dashboard,anchos-cols,vista-lotes}.js`,
más los módulos nuevos `js/carga-cols.js` y los tests
`test/lotes-carga-cols.test.mjs` y `test/lotes-anchos.test.mjs`.

**Fuera:** `src/` (el Worker y los motores), migraciones de D1, el reporte HTML
de `src/lotes/reporte.ts`, y las pestañas SO₂ / Orden de corrección salvo para
verificar que no se rompieron.

## Riesgos

1. **El refactor de anchos toca una pestaña que se usa todos los días.** Lotes es
   la pantalla principal. Mitigación: el test de `cssDeAnchos` ya existe, se
   amplía, y la verificación a ojo incluye arrastrar y resetear en Lotes antes de
   dar por buena la pestaña Análisis.
2. **El cambio de lista blanca en el pegado es un cambio de comportamiento
   silencioso.** Alguien que hoy use un orden propio con un nombre inventado
   perdería esa columna en vez de guardarla. Es justamente la intención, pero la
   previsualización debe dejar ver qué columnas se descartan para que no sea una
   sorpresa: las columnas descartadas no aparecen en la tabla de preview.
3. **El deploy no lo puede correr Claude.** El clasificador de permisos bloquea
   `wrangler`, y el CI está en rojo desde el 2026-09-10 por falta de API token.
   El trabajo queda invisible en la bodega hasta que el usuario corra
   `npx.cmd wrangler deploy` a mano. Tiene que ser el último paso del plan,
   pedido explícitamente.

## Verificación

- `npm test` y `npx tsc --noEmit` en verde.
- Prueba a ojo en `npm run dev:sin-ia` (`:8788`). La D1 local tiene 5 lotes
  sembrados y 0 análisis; se cargan unos pocos por la pestaña Cargar análisis
  usando `cargarPrevisualizar()` / `cargarConfirmar()`, que están expuestas en
  `window`. `preview_click` y `preview_screenshot` no son confiables en esta app:
  se verifica con `preview_eval` y `getBoundingClientRect()`.
