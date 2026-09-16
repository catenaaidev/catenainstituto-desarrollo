# Tablero FML en el módulo Lotes

Fecha: 2026-09-14
Estado: aprobado, pendiente de plan de implementación

## Por qué

En `Registro de Lotes CIW 2026/Dashboard FML` hay un tablero de FML **aprobado
por los supervisores** y en producción desde el 2026-09-14 (v1.8.0). Es un
generador Python que lee `Lotes CIW 2026.xlsx` y escupe un HTML autocontenido.

La pestaña "Seguimiento FML" del módulo Lotes de la web resuelve el mismo
problema con otras reglas y otra pantalla. Desde el corte a web-only del
2026-09-09 la web es la única fuente de datos, así que mantener dos lecturas
distintas del mismo dominio es garantía de que los números no coincidan.

Esta entrega **da de baja la pestaña actual** y pone en su lugar el tablero
aprobado, alimentado por los datos de la web.

## Qué se decidió

| Decisión | Valor |
|---|---|
| Alcance | Visual **y** reglas del tablero aprobado |
| Fuente de datos | Exclusivamente los lotes de la web (D1). El Excel sale de la ecuación |
| Pestaña actual | Se da de baja |
| Umbrales | Configurables, sembrados con los del tablero |
| Overrides por variedad/proyecto | En `config.criterios_fml`, editables desde Configuración |
| Antigüedad de alarmas | Derivada de los análisis, no por snapshots diarios |
| Motor | Único y reescrito, con campos de compatibilidad |
| Endpoint | El `/dashboard` existente; no se agrega uno nuevo |

## Principio que ordena el diseño

**El motor decide, la vista dibuja.** El tablero no recalcula ninguna regla en
JavaScript: estados, chips, condiciones, acción sugerida y antigüedad vienen
resueltos del servidor. Si algo no se puede pintar sin recalcular, le falta un
campo a la salida del motor.

Es una corrección de rumbo consciente: hoy `dash-metricas.js` recalcula en JS el
objetivo de SO₂ por muestra, en espejo del motor. Esa deuda no se paga en esta
entrega, pero no se amplía.

## Arquitectura

### Servidor

- `src/lotes/motores/fml.ts` — orquestación: `criteriosEfectivos`,
  `analisisPorLote`, `evaluarLote`, `evaluar`.
- `src/lotes/motores/fml-condiciones.ts` — **nuevo**. Las 11 condiciones como
  funciones puras: reciben los análisis del lote y los criterios efectivos, y
  devuelven estado más fecha desde la que rige. Es el equivalente de `rules.py`
  del tablero y concentra la mayoría de los tests.
- `src/lotes/vistas.ts` — `datosDashboard()` suma los campos nuevos.
- `src/lotes/reporte.ts` — su `ETIQUETAS_ALARMA` enumera 9 alarmas a mano; hay
  que agregar las 2 nuevas. El resto lo hereda solo, porque usa `evaluar()`.

### Cliente

`public/lotes/js/vista-fml.js` se elimina. En su lugar:

- `vista-tablero.js` — orquesta: pide datos, arma filtros, pinta la lista, se
  registra como vista.
- `tablero-panel.js` — el panel "Estado de los N lotes" (mosaico y números).
- `tablero-ficha.js` — la ficha desplegable, incluidos los campos editables.
- `tablero-export.js` — el Excel filtrado, sobre `shared/exportar.js`.

Cuatro archivos y no uno porque el tablero es bastante más que la tabla actual;
junto daría del orden de 900 líneas y cada cambio obligaría a releerlo entero.

También tocan: `criterios.js` y `vista-config.js` (claves nuevas), `index.html`
y `app.js` (la pestaña pasa a llamarse **"Tablero FML"**), y
`test/lotes-fml.test.ts`.

## Las 11 condiciones

La acción sugerida es la **unión** de las acciones de todas las condiciones
activas, separadas por `" | "` (igual que la columna `accion_sugerida` del
tablero aprobado). No se elige una sola por prioridad.

| Clave | Etiqueta | Regla | Acción sugerida |
|---|---|---|---|
| `sin_analisis_valido` | Sin análisis válido | No hay ninguna fila con fecha y al menos una medición útil, descontando las excluidas por `excepciones_analisis` | hacer OT y analizar |
| `control_proceso_pendiente` | Sin control de proceso | Hay análisis válidos pero ninguna fila informa **etanol, AV y málico simultáneamente** | hacer OT y analizar |
| `frecuencia_vencida` | Frecuencia vencida | `dias_desde_control` supera `frecuencia_no_terminada` (FML no terminada) o `frecuencia_terminada` (terminada o excluida) | hacer OT y analizar |
| `av_alerta` | AV alerta | Último AV > `av_max`, **o** subió más de `av_delta_max` contra una medición de los últimos `av_delta_dias` días, **o** el FOSS informó −999 | revisar urgente y confirmar análisis |
| `so2_caida_alerta` | Caída de SO₂ libre >12 ppm | Entre las dos últimas fechas distintas con SO₂ válido hay una caída **estrictamente mayor** a `so2_caida_max`. No se evalúa si `so2_aplica = no` | confirmar SO₂; revisar llenado/mermo y evaluar posible desvío microbiológico |
| `fa_no_finalizada` | FA no finalizada | Último azúcar reductor válido > `fa_azucar_reductor_max` | seguir control de FA |
| `fml_no_finalizada` | FML no finalizada | No cumple ningún criterio de cierre: último málico < `fml_malico_finalizada`, o las dos últimas mediciones válidas < `fml_malico_2ultimas`. No aplica si la FML está excluida | seguir control de FML |
| `so2_no_ok` | SO2 no OK | `libre ≤ so2_libre_piso`, **o** (`libre > so2_libre_piso` y `molecular < so2_molecular_objetivo`). El 0 se ignora como placeholder. Sin pH y con libre > piso queda `sin_datos`. Con `so2_aplica = no` queda `no_aplica` y no alarma | revisar ajuste SO2/pH |
| `ph_no_ok` | pH no OK | Último pH > `ph_max`, o `≥ ph_max` si `ph_max_inclusive = si` | revisar ajuste SO2/pH |
| `no_lleno` | No lleno | `estado_llenado = no_lleno`, derivado de `mermo` | dar lleno o achicar |
| `datos_operativos_incompletos` | Datos operativos incompletos | Falta `mermo` o falta la decisión de FML en el lote | completar Mermo/FML en el lote |

`so2_molecular = so2_libre / (1 + 10^(pH − 1.8))`.

### Definiciones que la tabla da por sabidas

**Medición útil**: un valor no nulo y distinto de −999 en `ph`, `av`, `malico`,
`azucar_reductor`, `so2_libre` o `etanol`. Hoy el motor sólo mira `ph`, `av` y
`malico`, así que **la definición se ensancha**: un control individual de SO₂ ya
cuenta como análisis válido, como en el tablero.

**Decisión de FML del lote**: sale de `hace_fml` / `fml_excluida` de la fila del
lote. Cuando el lote la trae, **le gana** a lo que diga `hace_fml` por variedad
en `config` — la variedad define el caso general y el lote es la excepción
puntual. `fml_excluida_origen` reporta cuál de las dos mandó: `'lote'` (el lote
define explícitamente), `'variedad_blanca'` (la variedad excluye por config),
o `'sin_dato'` (ninguna de las dos). Se informa en los cuatro estados de FML,
no sólo al excluir.

**Datos operativos incompletos** se dispara si falta `mermo` **o** si no hay
decisión de FML por ninguna de las dos vías. Un Chardonnay sin `hace_fml` en la
fila **no** está incompleto: la variedad ya lo define por config.

### Cambios de semántica respecto del motor actual

1. **La frecuencia se cuenta desde el último control de proceso**, no desde el
   último análisis. Un pH suelto ya no reinicia el reloj. Se agrega
   `dias_desde_control`; `vencido` pasa a mirarlo a él.
2. **El pH deja de ser inclusivo por defecto.** Hoy `evaluarLote` hace
   `phVal < eff.ph_max` y `flagsAnalisis` hace `ph >= eff.ph_max`: un pH de 3.75
   clavado **alarma**. El tablero es exclusivo salvo en los Cabernet. Al portar,
   los pH justo en el límite dejan de alarmar en todas las variedades menos las
   tres que llevan `ph_max_inclusive: si`. Las dos funciones tienen que quedar
   consistentes entre sí.
3. **SO₂ no OK** cambia de `libre < max(inversión, 25)` a la regla de dos tramos.
   Las dos formas son casi equivalentes —`molecular ≥ 0.38` es exactamente
   `libre ≥ inversión`—: lo que cambia de verdad es **el piso de 25 a 20** y el
   borde exacto (con `libre = piso` el motor actual da OK y el tablero da no OK).
4. **El fallback de pH del SO₂ se mantiene** (revisado el 2026-09-14 contra los
   datos del tablero). El diálogo de criterios del tablero dice que sin pH el
   estado queda `sin_datos`, pero sus propios resultados muestran lo contrario:
   en `estado_actual_lotes.csv` el lote **26031** tiene el SO₂ del 19/08 y el pH
   de referencia del **11/09** —otra muestra, y posterior— con estado `ok`; y de
   los 249 lotes, los únicos 2 en `sin_datos` no tienen **ninguna** medición de
   SO₂. O sea que el tablero usa el último pH válido del lote, igual que el motor
   web. Se conserva el comportamiento actual y se publica
   `so2_ph_referencia_fecha` para que la ficha pueda avisar cuándo el pH viene de
   otra muestra.
5. **"Medición útil" se ensancha** de `ph`/`av`/`malico` a seis campos, según la
   definición de arriba.

**No es un cambio, aunque lo parezca:** el AV en −999 **ya dispara alerta** hoy
(`evaluarAvAlerta` corta con `raw === INVALIDO` antes de validar). Lo único
nuevo es reportar `av_motivo: 'fuera_rango_foss'`.

### Antigüedad ("desde cuándo")

Para las condiciones que salen de mediciones se recorre el historial hacia atrás
mientras la condición se siga cumpliendo, y se toma la fecha del análisis más
viejo de esa corrida.

`frecuencia_vencida` usa la fecha en que venció: último control más los días de
frecuencia.

`sin_analisis_valido`, `control_proceso_pendiente`, `no_lleno` y
`datos_operativos_incompletos` no llevan fecha: no se derivan de una medición.

## Criterios

`CRITERIOS_DEFAULT` queda como la base, con dos cambios y tres claves nuevas:

| Clave | Valor | Nota |
|---|---|---|
| `hace_fml` | `si` | |
| `fa_azucar_reductor_max` | 5.0 | |
| `fml_malico_finalizada` | 0.2 | |
| `fml_malico_2ultimas` | 0.5 | |
| `so2_molecular_objetivo` | 0.38 | |
| `so2_libre_piso` | **20.0** | antes 25.0, y ahora compara con ≤ |
| `so2_caida_max` | **12.0** | nueva |
| `so2_aplica` | **`si`** | nueva |
| `ph_max` | 3.75 | |
| `ph_max_inclusive` | **`no`** | nueva |
| `av_max` | 0.8 | |
| `av_delta_max` | 0.3 | |
| `av_delta_dias` | 15 | |
| `frecuencia_no_terminada` | 15 | |
| `frecuencia_terminada` | 30 | |

`ph_max_inclusive` existe porque el tablero usa "> 3.65", "**≥** 3.79" y
"> 3.75": el Cabernet es inclusivo y los otros no. Es preferible una clave
explícita a escribir un 3.789 mágico.

### Overrides sembrados en `config.criterios_fml`

Van al dato, no al código, para que queden a la vista y editables en
Configuración. Son **19 filas de variedad y 1 de proyecto**:

- Las **15 variedades blancas** con `hace_fml: no`: Blanco, Chardonnay, Chenin,
  Gibi, Gewurztraminer, Moscatel Rosado, Pedro Gimenez, Pinot Blanco, Pinot
  Gris, Riesling, Sauvignon Blanc, Semillón, Torrontés, Ugni Blanc, Viognier.
- **Pinot Noir, Sauvignon Blanc y Chardonnay** con `ph_max: 3.65`. Las dos
  últimas ya están entre las blancas: suman clave a su fila.
- **Cabernet Sauvignon, Cabernet Franc y Petit Verdot** con `ph_max: 3.79` y
  `ph_max_inclusive: si`.
- **El Amiguito** en `por_proyecto` con `so2_aplica: no`.

Se siembran con un script **idempotente** que sólo agrega las claves que no
existen y nunca pisa lo que alguien haya editado.

La precedencia no cambia: `CRITERIOS_DEFAULT` → `default` → `por_variedad` →
`por_proyecto`, clave por clave.

## Contrato de datos

`ResultadoLote` suma:

```
estado_frecuencia        'al_dia' | 'vencido' | 'sin_datos'
control_proceso_pendiente boolean
ultima_fecha_control     string | null
dias_desde_control       number | null
fml_excluida_origen      'lote' | 'variedad_blanca' | 'sin_dato'   // presente en los cuatro estados de FML
so2_estado               'ok' | 'no_ok' | 'no_aplica' | 'sin_datos'
so2_libre                number | null
so2_libre_fecha          string | null
so2_ph_referencia        number | null
so2_ph_referencia_fecha  string | null   // avisa si el pH viene de otra muestra
so2_molecular            number | null
so2_motivo               string          // por qué quedó en ese estado
so2_caida                { anterior, anterior_fecha, actual, actual_fecha, caida, alerta }
ph_estado                'ok' | 'no_ok' | 'sin_datos'
av_motivo                'umbral' | 'aumento' | 'fuera_rango_foss' | null
inoculado_origen         'analisis' | 'manual' | null
condiciones              [{ clave, etiqueta, accion, desde }]
accion_sugerida          string          // union de las acciones de todas las condiciones activas, separadas por " | "
```

**Campos de compatibilidad**, derivados de los nuevos para no tocar Dashboard,
Evolución ni Orden de muestras: `so2_ok` (`ok` y `no_aplica` → `true`, `no_ok` →
`false`, `sin_datos` → `null`), `ph_ok`, `vencido`, `dias_desde_analisis`,
`ultima_fecha` y `alarmas` (las claves de `condiciones`).

`kpis` suma los seis ejes del panel: `fml_terminada`, `frecuencia_al_dia`,
`so2_conforme`, `ph_ok`, `lleno`, `requieren_accion`. `condicion_ideal` pasa a
la definición del tablero: SO₂ conforme **y** pH OK **y** lleno.

## La pestaña

De arriba a abajo: barra de acciones → panel → filtros → lista → ficha.

**Panel "Estado de los N lotes"**, en dos modos con un toggle. *Mosaico*: un
cuadrado por lote, verde sin condiciones, gris una, rojo dos o más, con tooltip
`lote · variedad · N condiciones`. *Números*: seis tarjetas con porcentaje y
cantidad — FML terminada, Frecuencia al día, SO₂ conforme, pH OK, Lleno,
Requieren acción. En el original "números" era el fallback sin JS; acá es un
modo elegible, porque leer los seis ejes de un vistazo sirve por sí solo.

**Filtros**: búsqueda libre, proyecto, condición y pregunta frecuente (FML no
terminada / FML terminada / Mermos / Faltan analizar / FA en proceso), más
"Limpiar". Se usan los widgets **multi-select** que ya tiene la app
(`initFiltrosMulti` de `tabla.js`) en vez de los selects de valor único del
original: filtrar por dos condiciones a la vez sale gratis.

**Lista**: Lote+variedad · Proyecto · Vasija · Último control · Proceso (FA/FML)
· Condiciones (chips) · Acción sugerida · Ver ficha. Chips: `Frec` / `Frec
vencida`, `FML` / `FML no`, `SO₂` / `SO₂ no`, `pH` / `pH no`, `Lleno` / `No
lleno`, más `AV alerta` y `Caída SO₂` cuando corresponden, con sufijo de
antigüedad. Orden por defecto: condiciones más viejas primero.

**Exportar Excel**: una fila por condición activa — Lote · Vasija · Litros ·
Condición · Desde/antigüedad.

**Diálogo "Ver criterios"**: se genera **desde los criterios vigentes**, no con
los textos fijos del original. Como los umbrales ahora son configurables, un
texto escrito a mano mentiría apenas alguien edite Configuración.

**No se porta** la variante de tarjetas mobile: es la misma información dos
veces y esta app se usa en escritorio.

### Paleta

Se respeta la del tablero aprobado: OK `#DCFCE7`/`#166534`, problema
`#FDE8EC`/`#8A1538`, neutro `#F1F5F9`/`#52606D`, primario `#0B6FAE`, fondo
`#F4F7FA`, panel `#FFFFFF`, línea `#CBD5E1`, tinta `#17212B`.

## La ficha

Badges de las condiciones activas con su antigüedad · "Por qué requiere
atención" cuando hay alerta de AV · grilla de datos operativos (vasija, litros,
última medición, último control de proceso, frecuencia, inoculación, mermo, FML
excluida) · bloque de SO₂ con libre, pH de referencia, molecular y motivo del
estado · evidencia de la caída · acción sugerida · comentario · tabla de las
últimas 6 mediciones válidas.

### Dónde escribe cada campo

El tablero usa la hoja `ESTADO_LOTE` como capa de override sobre `LOTES`, con
una precedencia enredada (`mermo` le gana al override manual; para FML el orden
es blanca → manual → `hace_fml` → `fml_excluida`).

- **Mermo** y **FML excluida** se escriben directo en el lote (`mermo`,
  `hace_fml`), las mismas columnas que ya se editan en la pestaña Lotes. Un solo
  valor, un solo lugar, sin precedencia que explicar.
- **Comentario** e **inoculado** siguen en `estado_lote`: no tienen columna
  propia en el lote.

> **ATENCIÓN — dato faltante, bloqueante del despliegue:** la lógica del motor
> es fiel al diseño. Lo que falta es **el dato**. De los 249 lotes del tablero
> aprobado, 139 tienen su decisión de FML en la columna `ESTADO_LOTE` del Excel
> y **nunca se migraron a D1**: `lotes.hace_fml` está cargado en sólo 1 de 249
> lotes. Con la D1 actual, `datos_operativos_incompletos` dispara en 179 de 249
> lotes (72 %), contra los 40 (16 %) que aprobaron los supervisores.
> Antes de desplegar hay que **migrar las 139 decisiones a `lotes.hace_fml`**,
> como tarea hermana de la siembra de criterios. Es bloqueante del despliegue,
> no del merge.

**Inoculado** es el único con dos orígenes. El motor lo detecta de los análisis
(`VP41`, `bacterias`, `inoc`) y además se puede cargar a mano. **Lo detectado
manda cuando hay evidencia**; lo manual completa cuando no hay ninguna. La ficha
muestra el origen: "detectado en el análisis del 12/08" vs "cargado por Roy".

**Se da de baja el botón "Finalizar FML"** (`fml_finalizada_confirmada`). En el
modelo del tablero el estado de FML lo calcula el motor con el málico, y la
salida manual es marcar el lote como FML excluida. Los valores ya cargados en D1
quedan sin usarse; **no se borran**.

**Refresco**: las condiciones las calcula el servidor, así que al editar mermo o
FML excluida los chips quedarían viejos. La ficha guarda y **refresca el
dashboard** después de esos dos campos, para que el lote se repinte solo.

## Pruebas

Cada condición nace de un test, con los casos de `CONDICIONES_FML.md` y sus
bordes: SO₂ = 20 exacto, Cabernet en 3.79 clavado, caída de 12.0 que **no**
alarma, AV −999, análisis excluido por `excepciones_analisis`, SO₂ = 0 como
placeholder, falta de pH con libre > piso.

Los 50 tests actuales de `test/lotes-fml.test.ts` siguen corriendo. **Algunos
van a fallar a propósito** —frecuencia, piso de SO₂, −999—: cada uno se revisa a
mano y se reescribe. No se borran en bloque.

**Casos de oro.** El tablero aprobado dejó `var/outputs/estado_actual_lotes.csv`
con 249 lotes ya evaluados. Se toman ~20 lotes reales que cubran las 11
condiciones y se congelan en la suite con su salida esperada. Es la evidencia de
que el port dice lo mismo que lo aprobado por los supervisores.

Comandos: `npm test` (vitest) y `npx tsc --noEmit`.

## Orden de trabajo

1. **Motor** — las 11 condiciones, los criterios, la siembra y la capa de
   compatibilidad. Sin tocar UI. Cierra con la suite verde y los casos de oro.
2. **La pestaña** — panel, filtros y lista, contra el motor ya terminado.
3. **Ficha** — contenido, campos editables, export y diálogo de criterios.
4. **Baja** — se elimina `vista-fml.js`, se agregan las dos etiquetas nuevas en
   `reporte.ts` y se limpia.

La pestaña vieja **queda viva hasta el tramo 4**, para poder mirar las dos en
paralelo mientras se construye.

## Riesgos

- **BLOQUEANTE DEL DESPLIEGUE — 139 decisiones de FML sin migrar.** De los 249
  lotes del tablero, 139 tienen su decisión de FML sólo en la hoja `ESTADO_LOTE`
  del Excel. En D1, `lotes.hace_fml` está cargado en 1 de 249 lotes. Sin migrar
  ese dato, `datos_operativos_incompletos` dispara en 179/249 (72 %) en vez de
  los 40/249 (16 %) que aprobaron los supervisores. El código es correcto; lo que
  falta es el dato. Tarea hermana de la siembra de criterios, antes del
  despliegue.
- **Los números del Dashboard cambian** el día que esto salga: con el piso de
  SO₂ en 20 en vez de 25, "SO₂ no OK" baja, y `condicion_ideal` pasa a la
  definición del tablero. Conviene avisarlo antes, no después.
- **Los overrides son dato, no código.** Si alguien borra la fila de una
  variedad blanca, esa variedad empieza a exigir FML en silencio. El freno de
  borrado masivo **no cubre `config`** (deuda conocida del módulo). No se
  resuelve en esta entrega: es un riesgo asumido.
- **Verificación en el navegador**: la D1 local arranca vacía y el importador
  está frenado, así que hay que sembrar lotes por la UI.
- **El despliegue no lo puede hacer Claude**: `npx wrangler deploy` desde
  `cmd.exe` lo corre el usuario. Sin ese paso, el trabajo queda en GitHub y
  nadie en la bodega lo ve.

## Fuera de alcance

- Migrar `dash-metricas.js` y el Dashboard a los estados nuevos: siguen andando
  por la capa de compatibilidad.
- Snapshots diarios y antigüedad por cantidad de snapshots: la antigüedad se
  deriva de los análisis.
- La variante de tarjetas mobile del tablero.
- Cubrir `config` con el freno de borrado masivo.
