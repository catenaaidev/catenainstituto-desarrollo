# Conexión de datos entre los tres módulos

**Fecha:** 2026-09-04
**Estado:** diseño aprobado, pendiente de plan de implementación

## El problema

La plataforma reunió tres apps que antes eran tres `servidor.py` en tres PCs. Las
tres funcionan, pero siguen siendo tres islas: comparten base de datos y no
comparten información.

De las tres conexiones posibles entre Prensas, Lotes y el Mapa de Barriles,
**funciona una**.

| Conexión | Estado hoy | Dónde |
|---|---|---|
| Lotes lee Barriles | ✅ en vivo | `src/lotes/rutas.ts:252` (`leerMapaBarriles`), alimenta `/cruce` y `/orden-correccion` |
| Barriles lee Lotes | ❌ no existe | `src/barriles/rutas.ts` no consulta otros módulos |
| Prensas ↔ Barriles | ❌ excluido a propósito | `src/lotes/motores/cruce.ts:47-50` |
| Prensas ↔ Lotes | ❌ no existe, pero la clave ya está en los datos | campo `origen` de Prensas |

### Consecuencia concreta

`cruce.ts:47-50` dice:

> «Las series 267xx, 268xx y 269xx son lotes prensa de **OTRA aplicación**. Son
> 206 unidades y 46.350 L»

Ese comentario se escribió cuando Prensas era, efectivamente, otra aplicación.
Ya no lo es. Hoy hay **206 barricas con 46.350 L de vino de prensa en el Mapa de
Barriles que la app de Prensas no puede ver**, y el cruce las descarta como
ruido.

### Causa raíz

El esquema está declarado como «Fase 1» en `migrations/0001_plataforma.sql:3`:
cada módulo guarda todo su estado como un JSON en una fila de la tabla
`documento`. No hay tabla de lotes ni de barricas. «Lote 26805» no es una fila
que los tres módulos referencian; es un string que aparece suelto en tres JSON
distintos.

## Qué se midió, y de dónde sale cada número

Distinguir esto importa: el plan de implementación arranca re-midiendo contra los
datos vivos.

**Medido directamente sobre los archivos de origen** (`prensas-app/datos.json` y
`Lotes/datos.json`, leídos el 2026-09-04):

- Prensas: 278 lotes, series `267xx` (99), `268xx` (100), `269xx` (79); 1512
  análisis.
- Lotes: 291 lotes, series `260xx` (99), `261xx` (100), `262xx` (92); 1974
  análisis.
- **Solapamiento de números de lote entre las dos apps: 0.** Numeraciones
  disjuntas dentro de la misma serie 26xxx.
- `Prensas.litros` es un entero **binario**: 0 (74 lotes) o 225 (204 lotes).
  Nada en el medio. Máximo 225.
- 204 × 225 = **45.900 L declarados** en Prensas.
- Los **74 lotes con 0 L tienen todos al menos un análisis** de laboratorio: son
  lotes activos a los que nadie les cargó los litros, no lotes vacíos.
- `Prensas.origen` contiene números de lote de Lotes. 273 de 278 lotes lo tienen
  cargado, y **los 273 resuelven**: 257 en forma directa (`26008`, `26008/26007`)
  y 16 por notación de rango (`26201-26212`).
- 89 lotes de Lotes distintos son referenciados; 78 lotes de prensa tienen origen
  múltiple.
- **Un valor roto:** un lote declara origen `26274-26777`, un rango de 504 lotes
  del que existen 18. Casi seguro un tipeo por `26274-26277`.
- `Prensas.accion` / `accion2` son texto libre y están vacíos en 251 y 276 de 278
  lotes: **no sirven como campo de estado.**
- Los esquemas de análisis usan nombres distintos para lo mismo. Prensas:
  `so2l`, `so2t`, `at`, `azucar`, `gluc`, `fecha`. Lotes: `so2_libre`,
  `so2_total`, `acidez_total`, `azucar_reductor`, `gluc_fruc`,
  `fecha_analisis`.

**Tomado del comentario de `cruce.ts:47-50`**, escrito durante el port validado
contra datos reales, no re-medido acá:

- 206 unidades de serie prensa en el mapa, 46.350 L.

**Derivado de los dos anteriores:** 46.350 L ÷ 225 = 206 barricas en el mapa
contra 204 lotes declarando 225 L. **La diferencia es de exactamente 2
barricas**, menos del 1 %.

### La conclusión que cambia el diseño

Un lote de prensa **es** una barrica de 225 L, y el campo `litros` ya *es* la
declaración de envase. No hace falta agregar campos `cap225`/`cap500` a Prensas
ni cargar 278 lotes a mano: la declaración existe y coincide con el mapa en el
agregado.

## Decisiones

### D1 · Los análisis quedan separados

Cada app sigue siendo dueña de sus análisis: Lotes los de las series 260-262xx,
Prensas los de 267-269xx. No se mueve ningún dato ni se unifica el vocabulario.
Lo que se construye es visibilidad cruzada.

*Descartado:* un repositorio único de análisis con vocabulario unificado. Es
trabajo real (3486 filas, dos esquemas) para un beneficio que hoy nadie pidió.

### D2 · Extender el patrón existente, no normalizar

Se mantiene la tabla `documento` de la Fase 1.

*Descartado — normalizar ahora (la «Fase 3» que el esquema anticipa):* tablas
reales de `lote`, `barrica`, `analisis` y `origen` es lo correcto a largo plazo,
pero los tres frontends guardan el documento entero, así que exige reescribir el
camino de escritura de los tres. El README estima 2-3 días solo para Prensas. Es
infraestructura para una escala que todavía no existe, y este diseño no cierra
esa puerta.

*Descartado — índice derivado de solo lectura:* tablas denormalizadas
recalculadas en cada guardado, solo para consultas cruzadas. Elegante, pero con
tres documentos de ~250 lotes cada uno, leer y parsear alcanza de sobra.

### D3 · El motor de cruce de Lotes NO se parametriza

El cruce de Lotes es complejo con razón: cuatro capacidades, vasija grande,
reglas de ausencia legítima por etapa, severidad por litros y por fracción. Tiene
130 tests que pasan contra datos reales.

El cruce de Prensas es «¿tiene su única barrica de 225 L?». Meter el caso trivial
dentro del motor complejo pone en riesgo lo que funciona para ahorrar unas 50
líneas.

Van separados. `cruce.ts` recibe **un solo cambio quirúrgico** y el de Prensas es
un archivo nuevo, chico, con sus propios tests.

### D4 · Prensas no gana campos de envase

Por lo medido en «Qué se midió»: `litros ∈ {0, 225}` ya es la declaración. Se verificó que
`validarDatos` (`src/prensas/validacion.ts:60`) solo comprueba que las secciones
sean listas y las filas objetos — no mira dentro de las filas. Así que esta
decisión no requiere migración ni cambio de validación.

## Arquitectura

### Piezas nuevas en `src/compartido/`

Hoy no existe este directorio, y es lo que falta para que cualquier conexión
nueva no duplique trabajo.

**`documentos.ts`** — `leerDocumento(env, modulo)`, tipada.

La función que lee un documento de D1 está hoy **escrita tres veces**:
`prensas/rutas.ts:17`, `barriles/rutas.ts:21`, `lotes/rutas.ts:22`. Y la que lee
el mapa (`leerMapaBarriles`) es privada de Lotes, así que Prensas no puede
usarla. Es el prerequisito de todo lo demás.

Responsabilidad añadida: hacer explícito el límite de que un documento crudo de
otro módulo **nunca se emite al navegador** — solo el subconjunto que un cruce
calcula. Hoy eso se cumple por casualidad; acá queda escrito.

**`series.ts`** — Qué prefijos de lote pertenecen a qué módulo.

Hoy esa información vive escondida en `cruce.ts:50` como `PREFIJOS_PRENSA`,
comentada como «de OTRA aplicación». Pasa a ser el registro explícito de la
plataforma, y **guardado en la tabla `config`** (que ya existe en el esquema y
está sin usar), no en el código: las series cambian cada cosecha y en 2027 nadie
debería editar TypeScript para eso.

Forma: `{ lotes: ['260','261','262'], prensas: ['267','268','269'] }`, con los
valores actuales como respaldo si la clave no está en `config`.

**`origen.ts`** — Resolvedor de `Prensas.origen` → lotes de Lotes.

Parsea las tres formas que existen en los datos reales: simple (`26008`),
múltiple (`26008/26007`) y rango (`26201-26212`). Devuelve además lo que no
resuelve, para que los valores rotos se vean en vez de desaparecer. Construye
también el índice inverso: dado un lote de Lotes, qué lotes de prensa salieron
de él.

### Cambio en `src/lotes/motores/cruce.ts`

Uno solo, quirúrgico: leer las series desde `series.ts` en vez de la constante
local, y dejar de tratar las barricas de prensa como ruido ahora que tienen
dueño. El bucket `serie_prensa` ya se calcula; cambia lo que significa y cómo se
reporta.

## Las tres conexiones

### C1 · Prensas ↔ Barriles

`GET /prensas/api/cruce`, espejo del de Lotes. Cinco veredictos:

| Declara (`litros`) | Mapa | Veredicto |
|---|---|---|
| 225 | 1 barrica | coincide |
| 225 | 0 barricas | **falta la barrica** — alarma real |
| 0 | 1 barrica | **el dato falta y el mapa lo tiene** — corregible con un botón |
| 0 | 0 barricas | sin datos en ninguno de los dos |
| cualquiera | **≥ 2 barricas** | **demasiado llenado** |

La tercera fila es la que hace el trabajo pesado: en vez de que alguien cargue
278 lotes, el cruce muestra los que el mapa ya sabe y ofrece completarlos desde
ahí. Es el mismo patrón que `unificar_inventario.py --publicar-revisiones` usó
para el inventario de barriles.

No se porta la función `ausencia()` de Lotes: depende de `lote.etapa`, y Prensas
no tiene campo de estado («Qué se midió» verificó que `accion` es texto libre y
está vacío en el 90 % de los lotes). El criterio de `litros` la reemplaza y
produce menos ruido.

Vista nueva en la app de Prensas para mostrar el informe.

### C2 · Prensas ↔ Lotes, por el campo `origen`

Habilita las dos direcciones:

- **En Prensas:** cada lote muestra de qué lotes de Lotes salió, con variedad y
  viñedo.
- **En Lotes:** la ficha de un lote muestra qué lotes de prensa salieron de él.
  Esta información hoy no existe en ninguna pantalla y es la que cierra la
  trazabilidad uva → prensa → barrica.

El informe incluye los orígenes que no resuelven, empezando por el
`26274-26777`.

### C3 · El Mapa mostrando el lote

`GET /barriles/api/lote?num=NNNNN` devuelve la información cruzada de un lote,
sea de Lotes o de Prensas; `series.ts` decide a quién preguntarle.

`abrirFicha()` (`public/barriles/index.html:3085`) gana filas. Es un modal
autocontenido que ya renderiza una tabla con la fila «Lote», así que el cambio
está acotado y no toca el resto del archivo.

- **Lote de Lotes:** variedad, viñedo, etapa, estado de FML, fecha del último
  análisis.
- **Lote de prensa:** variedad, IG, OT de prensado, y de qué lotes de Lotes
  salió.

Es el cambio más chico de los tres y el que más se nota en el uso diario: hoy
alguien parado frente a una barrica ve un número de lote y nada más.

## Permisos

El rol es por módulo a propósito, para que alguien pueda cargar en Prensas y solo
consultar en Lotes. Hoy `/lotes/api/cruce` lee el mapa sin verificar el rol en
Barriles. Dos reglas, explícitas:

**P1 · Para los cruces: se mantiene el comportamiento actual, pero documentado.**
Tener rol en un módulo habilita a ver las barricas que los lotes propios
reclaman, más las listas de discrepancias. Ya está naturalmente acotado: `cruzar()`
nunca emite el mapa completo, solo el subconjunto atribuido a los lotes propios.
`documentos.ts` hace ese límite explícito (ver arriba).

Las listas de huérfanos y conflictos son la excepción — por definición no están
atribuidas a los lotes propios — pero son precisamente las discrepancias
accionables, y contienen números de barrica, no el mapa.

**P2 · Para la ficha del mapa: se respeta el rol.** Con rol en Lotes, la barrica
muestra la información rica del lote. Sin rol, muestra solo lo que el mapa ya
sabía. Es por usuario, coherente con el diseño de roles existente, y sale gratis
porque `identidad()` ya se llama en cada pedido.

## Criterios de aceptación

| Qué | Valor esperado |
|---|---|
| Barricas de serie prensa en el mapa | 206 unidades · 46.350 L |
| Lotes de prensa declarando 225 L | 204 · 45.900 L |
| Diferencia a explicar | exactamente 2 barricas |
| Orígenes que resuelven | 273 de 273 no vacíos (257 directos + 16 por rango) |
| Lotes de Lotes referenciados | 89 distintos |
| Rangos rotos detectados | 1 (`26274-26777`) |
| Tests existentes | los 167 siguen pasando |

**Chequeo de regresión clave:** el conteo de huérfanos del cruce de Lotes tiene
que **bajar**. Hoy las barricas de prensa se cuentan como no atribuidas; cuando
tengan dueño, dejan de ser huérfanas. Si ese número no baja, algo quedó mal
conectado.

**Los números de arriba salen de los archivos locales del 2026-09-04.** El
`README.md:210` advierte que el mapa en la nube se importó de un respaldo del
28/08/2026 (versión 1939) y recomienda reimportarlo. El primer paso del plan de
implementación es **re-medir contra los datos vivos** y actualizar esta tabla:
pueden diferir.

## Fuera de scope

- Unificar el vocabulario de análisis entre Prensas y Lotes (D1).
- Normalizar el esquema en tablas por fila, la «Fase 3» (D2).
- Corregir el `26274-26777` y los 74 lotes sin litros. El diseño los **detecta y
  ofrece corregirlos**; cargar el dato es trabajo de la bodega, no del código.
- Los pendientes que el README ya lista y que no tocan este trabajo: página
  `/admin` de restauración, respaldo `.md` legible, verificación del asistente IA.

## Riesgos

**Los datos vivos difieren de los medidos.** Mitigación: re-medir como primer
paso del plan; los criterios de aceptación se recalculan antes de codificar.

**El cambio en `cruce.ts` rompe alguno de los 130 tests.** Mitigación: el cambio
se limita a de dónde vienen los prefijos y a cómo se reporta un bucket que ya se
calcula. Los tests corren antes y después; cualquier diferencia se explica o se
revierte.

**Los 2 barriles de diferencia esconden otra cosa.** Menos del 1 % sobre 46.350 L
es consistente con demora de registro, pero también podría ser un lote mal
atribuido. El cruce los va a nombrar; hay que mirarlos, no asumir que son ruido.

**Estado del repositorio:** hay 2 commits locales sin subir (`562f19f`,
`c5b3791`), que tocan el dashboard de Lotes y el workflow de despliegue
automático. Ninguno toca `src/`, así que no afectan esta auditoría — pero el
despliegue automático **todavía no está activo en producción**, porque el commit
que lo agrega no se subió.
