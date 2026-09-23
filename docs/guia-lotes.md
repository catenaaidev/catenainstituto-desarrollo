# Guía de uso — Módulo Lotes

Cómo funciona la pantalla de Lotes de Catena Institute: qué hace cada pestaña,
qué reglas aplica, qué te avisa y de dónde sale cada número.

Esta guía está escrita **contra el código**, no contra la memoria de nadie. Cada
regla y cada umbral llevan la referencia al archivo y la línea donde viven, para
que cuando el código cambie se sepa qué párrafo hay que corregir. Si algo no está
acá es porque el código no lo hace.

- **Dirección:** `https://catenainstitute.besa-junin.workers.dev/lotes/`
- **Entrada:** Cloudflare Access (PIN de un solo uso al mail)
- **Fuente de datos:** la nube. Desde el corte del 2026-09-09 la app local de
  Lotes está apagada; lo que se carga acá es lo único que existe.

---

## Índice

1. [Quién entra y qué puede hacer](#1-quién-entra-y-qué-puede-hacer)
2. [Las doce pestañas](#2-las-doce-pestañas)
3. [Cálculo de SO₂](#3-cálculo-de-so₂) ← el capítulo largo
4. [Criterios por variedad y proyecto](#4-criterios-por-variedad-y-proyecto)
5. [Alarmas, etapas e hitos](#5-alarmas-etapas-e-hitos)
6. [Cruce con el Mapa de Barriles](#6-cruce-con-el-mapa-de-barriles)
7. [Todas las alertas, una por una](#7-todas-las-alertas-una-por-una)
8. [Guardado, historial y respaldos](#8-guardado-historial-y-respaldos)

---

## 1. Quién entra y qué puede hacer

Entrar al sitio y entrar al módulo son dos cosas distintas. Access te deja pasar
la puerta; el rol en la tabla `perfiles` decide si ves Lotes.

| Rol | Ver | Guardar |
|---|---|---|
| `admin` | ✅ | ✅ |
| `editor` | ✅ | ✅ |
| `lector` | ✅ | ❌ |
| *sin rol* | ❌ | ❌ |

`src/auth.ts:98-105`

Los dos rechazos que vas a ver, con su texto exacto:

- **Sin rol en Lotes** (403): *«{tu-mail} no tiene acceso a Lotes. Pedíselo a un
  administrador.»* — `src/lotes/rutas.ts:62`
- **Lector intentando guardar** (403): *«tu usuario es de solo lectura en Lotes:
  no podés guardar cambios.»* — `src/lotes/rutas.ts:77`

Si no tenés rol, la pantalla ni se entrega: te manda al portal, que explica qué
pasa. Sin eso la app cargaría vacía y parecería rota (`src/index.ts:150`).

**Quién queda registrado.** Cada guardado anota dos nombres: el que la app
muestra arriba a la derecha (editable, sale de tu identidad de Office 365) y el
mail verificado por Access. El segundo es el que vale, y es el que queda en el
historial. El nombre visible se recorta a 60 caracteres (`rutas.ts:102`).

---

## 2. Las doce pestañas

En orden, tal como aparecen (`public/lotes/index.html:786-799`):

| Pestaña | Para qué es |
|---|---|
| 📊 **Dashboard** | KPIs, gráficos de estado analítico y la bandeja de etapas a confirmar. Es la vista de arranque. |
| 📋 **Lotes** | El maestro. Tabla ancha donde se ven y se editan todos los lotes. |
| ⬆️ **Cargar análisis** | Carga masiva pegando filas desde Excel o un CSV. |
| 🧪 **Análisis** | Historial de análisis por lote, con las celdas fuera de criterio en rojo. |
| 🧫 **Seguimiento FML** | Cómo viene la maloláctica de cada lote. |
| 🧴 **Correcciones SO₂** | Calculadora manual de dosis + bitácora de correcciones. |
| 🔄 **Movimientos** | Descubes, trasiegos, traspasos, rellenos, renombres y salidas. |
| 📈 **Evolución** | Gráficos de cada parámetro en el tiempo, por lote. |
| 📝 **Orden de muestras** | Arma e imprime la orden para el laboratorio. |
| 🛢️ **Cruce con barriles** | Compara lo declarado en Lotes contra el Mapa de Barriles. |
| 💊 **Orden de corrección** | La orden de SO₂ ejecutable, barrica por barrica. |
| ⚙️ **Configuración** | Los umbrales de criterio, por defecto / por variedad / por proyecto. |

Dos pestañas se parecen y **no son lo mismo**:

- **🧴 Correcciones SO₂** es una calculadora manual: vos elegís lote, actual,
  deseado y litros, y te da la dosis. Sirve para una corrección puntual.
- **💊 Orden de corrección** es automática: el servidor decide **qué lotes** hay
  que corregir y **cuánto va en cada barrica**, cruzando análisis, criterios y el
  Mapa de Barriles. Es la que se imprime y se lleva a la nave.

---

## 3. Cálculo de SO₂

Este es el corazón del módulo. Va de la química a la barrica, en cuatro pasos.

### 3.1 SO₂ molecular — cuánto protege realmente

El SO₂ que protege al vino no es todo el libre: es la fracción **molecular**, y
esa fracción depende del pH. La app usa Henderson-Hasselbalch:

```
molecular = SO₂ libre / (1 + 10^(pH − 1,8))
```

`src/lotes/motores/fml.ts:280-286`

El 1,8 es el pKa del par SO₂/bisulfito. La consecuencia práctica: **el mismo SO₂
libre protege muchísimo menos a pH alto.** 30 mg/L de libre dan 1,15 mg/L de
molecular a pH 3,2, pero apenas 0,30 a pH 3,8 — **casi cuatro veces menos con el
mismo número en el papel del laboratorio.** Por eso subir el pH obliga a subir el
SO₂.

> ⚠️ **El pH y el SO₂ tienen que salir de la misma muestra.** El molecular es una
> propiedad del par (libre, pH): mezclar el SO₂ de un análisis con el pH de otro
> da un veredicto que no describe a ninguno de los dos. La app toma el pH de la
> misma muestra que trae el SO₂, y **solo si esa muestra no tiene pH** cae al
> último pH válido del lote (`fml.ts:397-412`, `correccion.ts:154-180`).

### 3.2 SO₂ libre objetivo — a cuánto hay que llegar

Invirtiendo la fórmula de arriba sale cuánto libre hace falta para alcanzar el
molecular objetivo a ese pH. Y después se aplica un piso:

```
objetivo = máx( 0,38 × (1 + 10^(pH − 1,8)) , 25 ppm )
```

`src/lotes/motores/fml.ts:299-307`

Los dos números son configurables por variedad y proyecto (§4). Por defecto:
`so2_molecular_objetivo = 0,38` y `so2_libre_piso = 25,0`.

**Por qué existe el piso, y por qué importa tanto.** A pH bajo el objetivo
molecular cae a 5–9 mg/L de libre: alcanza para proteger microbiológicamente,
pero no deja ninguna reserva antioxidante. Como los pH de la bodega se concentran
entre 3,2 y 3,6, **el piso gobierna la mayoría de los casos** — es el número que
en la práctica decide cuántos lotes entran a la orden de corrección. Si querés
mover cuántos lotes hay que corregir, el piso es la perilla, no el molecular.

La orden te dice cuál de los dos mandó en cada lote, en la columna `manda`:
`'piso'` o `'molecular'` (`correccion.ts:442-444`).

| pH | Objetivo por molecular | ¿Manda? |
|---|---|---|
| 3,2 | 9,9 ppm | **piso (25)** |
| 3,4 | 15,5 ppm | **piso (25)** |
| 3,6 | 24,3 ppm | **piso (25)** |
| 3,8 | 38,4 ppm | molecular |

*(Cuentas hechas con la fórmula y los valores por defecto — sirven para leer el
comportamiento, no como tabla de referencia oficial.)*

### 3.3 Dosis — cuánto metabisulfito hay que tirar

Fórmulas heredadas del Excel, asumiendo solución **d1030 ≈ 55 g/L de SO₂**:

```
diferencia   = deseado − actual
MBK [g]      = ((diferencia × litros × 1,5) / 1000) × 2
mL solución  = (diferencia × litros × 1,5) / 55
```

`src/lotes/motores/fml.ts:309-331`

El `1,5` es el factor de sobredosificación del Excel; el `× 2` sale de que el
metabisulfito de potasio libera aproximadamente la mitad de su peso como SO₂.

La misma fórmula corre en el navegador para la calculadora manual
(`public/lotes/js/vista-so2.js:19-26`) y en el servidor para la orden. **Son la
misma función**: la orden la llama pasando `0` como actual, así la "diferencia"
que calcula es la que se le da (`correccion.ts:87-90`).

> ⚠️ El control de la solución no lo hace la app: si el DMA marca menos de 1,028
> hay que concentrar, y si marca más de 1,032 hay que diluir. Fuera de esa banda
> los mL de la orden no corresponden a la dosis real.

### 3.4 Reparto — la dosis se calcula por barrica, no se reparte

Esta es la decisión de diseño más importante de la orden, y la que más sorprende
la primera vez:

**La dosis de cada barrica se calcula con los litros reales de *esa* barrica, que
salen del Mapa de Barriles. No se calcula un total del lote y después se
reparte.**

`src/lotes/motores/correccion.ts:9-12, 103-121`

El motivo es concreto: sobre los datos de la bodega, **106 de 489 barricas están
en mermo**, y el mapa guarda sus litros reales. Dosificar por capacidad le daría
a una barrica de 200 L que tiene 50 L adentro **cuatro veces** lo que le toca.

Reglas de borde del reparto:

- Si el mapa **no trae litros** de una barrica (o son ≤ 0), se usa su capacidad y
  la fila queda marcada con `litros_de_capacidad` (`correccion.ts:106-109`). Es
  una estimación, no un dato.
- La porción en **tanque grande** (`vasija_grande`) va en una fila aparte, con el
  número de barrica **en blanco a propósito**: es lo que el operario completa a
  mano (`correccion.ts:123-140`).
- Si el veredicto del cruce es `solo_representacion`, el tanque grande **no** se
  agrega como fila extra — porque en ese caso las barricas del mapa *son* ese
  volumen, no un volumen adicional. Sin ese cuidado se dosificaba dos veces
  (medido: 339,7 g de MBK de más sobre cuatro lotes) — `correccion.ts:430-437`.
- Si el lote no tiene ni barricas ni tanque, se emite una sola fila con los
  litros declarados (`correccion.ts:438-440`).

### 3.5 Qué lote entra a la orden

El servidor recorre todos los lotes y aplica esta cascada, **en este orden**
(`correccion.ts:347-470`):

1. **Series prensa fuera.** Los lotes 267xx, 268xx y 269xx son de otra
   aplicación y se saltean (`cruce.ts:45-50`).
2. **¿Hay volumen para dosificar?** Se toma `litros del mapa + vasija_grande`; si
   da cero, se cae a los litros declarados. Si sigue en cero, el lote va a
   `sin_volumen[]` y no produce fila. El filtro mira el volumen **efectivo**, no
   el declarado: hay lotes que declaran 0 L pero el mapa les ve barricas con vino
   real (el 26285 tiene 150 L en 3 barricas y se dosifica sobre eso).
3. **Última medición válida** de SO₂ libre y pH.
4. **Objetivo** según §3.2, con los criterios de esa variedad y proyecto.
5. **¿Falta el dato?** Sin SO₂ válido o sin pH válido, el lote va a
   `no_calculables[]` con el motivo (*«sin SO2 valido»* / *«sin pH valido»*) y se
   imprime en una hoja aparte: **"Necesitan análisis antes de corregir"**.
6. **¿Ya está protegido?** Si `SO₂ ≥ objetivo`, no entra. Simple.
7. **Regla de supresión** (§3.6).
8. Se calcula la diferencia y se arman las filas de barrica.

**Orden de impresión:** por urgencia, no alfabético. Primero el lote al que más
le falta (`objetivo − actual` descendente), porque alfabético no le dice nada al
operario (`correccion.ts:472-475`).

> 💡 Los análisis marcados como "no usar" en `excepciones_analisis`
> (`usar_registro = 'no'`) quedan afuera del cálculo. Es importante que sea así:
> si no, el tablero ignoraría un SO₂ mal medido pero la orden dosificaría sobre
> él (`fml.ts:467-485`, `correccion.ts:337-340`).

### 3.6 Regla de supresión — por qué un lote bajo no aparece

**Esta es la que más confunde en el uso diario.** Un lote puede estar por debajo
del objetivo y aun así no salir en la orden. No es un error: es el freno contra
la doble dosis.

Si el lote tiene una corrección previa (con N° de OT, no anulada) de **30 días o
menos** (`VENTANA_SUPRESION_DIAS`, `correccion.ts:36-41`):

| Situación | Qué hace | Motivo que muestra |
|---|---|---|
| No hay ningún análisis posterior a la corrección | **Suprime** | *«corregido en OT {n}, sin análisis nuevo»* |
| Hay análisis posterior, pero el SO₂ **se movió ≤ 5 ppm** | **Suprime** | *«corregido en OT {n}, el SO₂ no se movió»* |
| Hay análisis posterior y el SO₂ se movió más de 5 ppm | **Entra**, con el cartel de que fue corregido | — |

El umbral de 5 ppm (`UMBRAL_REPETICION_PPM`, `correccion.ts:43-48`) es la
respuesta a esta pregunta: si el SO₂ no se movió desde la corrección, o la
muestra se sacó *antes* de tirar el MBK, o la corrección no se reflejó. En los
dos casos volver a dosificar sería doble dosis.

**De dónde salen los 30 días:** el ciclo mediano entre análisis de SO₂ en esta
bodega es de 21 días (p75 = 41), y la corrección histórica más reciente es de
hace 43. La banda segura es 21–42; 30 es el centro. Subirlo a 60 empieza a
comerse la data vieja.

Vencida la ventana el lote vuelve a la orden — pero si **todavía no lo
remidieron**, el SO₂ que se muestra es *anterior* a la corrección y la dosis sale
de un número viejo. Ese cartel no caduca (`correccion.ts:419-424`).

Tres detalles finos que evitan sorpresas:

- **Solo cuentan las correcciones con N° de OT.** El `datos.json` migrado del
  Excel trae un objeto `correccion` en los 1.972 análisis, y la mayoría son
  cáscaras vacías. Sin ese filtro la regla suprimiría los 291 lotes
  (`correccion.ts:204-209`).
- **Una corrección fechada en el futuro no suprime.** Daría edad negativa; ante
  la duda se muestra el vino (`correccion.ts:394-397`).
- **La comparación es estricta (`>`, no `>=`).** Las fechas son de día y no se
  sabe si la muestra se sacó antes o después de tirar el MBK; además el registro
  que *contiene* la corrección lleva esa misma fecha, así que con `>=` se
  validaría a sí misma (`correccion.ts:263-269`).

Los lotes suprimidos **no desaparecen**: se listan en su propia tabla, con la OT
y el motivo, y con un botón para cancelar la corrección.

### 3.7 Cancelar una corrección (anular)

Anular es el *"me equivoqué al ejecutar la orden"*.

- La entrada **no se borra**. Queda en la bitácora tachada, con sello ANULADA,
  con quién y cuándo. Un registro de calidad no borra en silencio.
- Para la regla de supresión es como si no existiera: **el lote vuelve a
  proponerse** en la orden.
- Se anula la **última no anulada**, no la última a secas. Si un lote tuvo dos
  correcciones y anulás la segunda, **la primera sigue valiendo**: anular un
  error no borra la historia previa (`correccion.ts:218-225`).

El texto de confirmación que vas a ver
(`public/lotes/js/vista-orden-correccion.js:266`):

> Vas a cancelar la corrección de {descripción}.
>
> La entrada NO se borra: queda en la bitácora marcada como anulada, con tu
> nombre y la fecha. El/Los lote/s vuelve/n a proponerse en la orden.
>
> ¿Confirmás?

### 3.8 La calculadora manual (🧴 Correcciones SO₂)

Para una corrección puntual, fuera de la orden.

Elegís el lote y la app te autocompleta litros, SO₂ libre y pH de los últimos
análisis válidos. Los cuatro resultados se recalculan mientras tipeás:
diferencia, MBK (g), mL de solución y SO₂ molecular.

> ⚠️ **El "SO₂ deseado = 35" que viene puesto es solo un valor inicial del
> formulario** (`vista-so2.js:78`), **no un criterio de la bodega**. El criterio
> es el objetivo calculado de §3.2, que depende del pH. No confundir: 35 fijo
> para todos los lotes ignora el pH, que es justamente lo que la fórmula existe
> para evitar.

Al registrar, la corrección se pega al análisis de `(lote, fecha)`; si no existe
ese registro, se crea uno nuevo con solo esos campos. **Queda en memoria: hay que
apretar 💾 Guardar.**

---

## 4. Criterios por variedad y proyecto

Los umbrales no son únicos para toda la bodega. Se resuelven en tres capas:

```
default  →  override de variedad  →  override de proyecto
```

Cada capa **pisa campo por campo** lo que define, y hereda lo que deja vacío. Si
un lote tiene variedad y proyecto, el proyecto gana sobre la variedad, y hereda
de la variedad los campos que el proyecto no completa (`fml.ts:99-119`).

Los nombres se comparan **sin tildes, sin mayúsculas y sin puntuación**, así que
"Cabernet Sauvignon", "cabernet sauvignon" y "CABERNET-SAUVIGNON" son el mismo
(`fml.ts:66-79`).

### Valores por defecto

`src/lotes/motores/fml.ts:30-43`

| Clave | Valor | Qué decide |
|---|---|---|
| `hace_fml` | `si` | Si al lote se le sigue la maloláctica |
| `fa_azucar_reductor_max` | 5,0 | Por encima de esto la FA no está terminada |
| `fml_malico_finalizada` | 0,2 | Un málico por debajo de esto cierra la FML |
| `fml_malico_2ultimas` | 0,5 | Dos mediciones seguidas debajo de esto también la cierran |
| `so2_molecular_objetivo` | 0,38 | Molecular al que se apunta |
| `so2_libre_piso` | 25,0 | Libre mínimo, gane quien gane |
| `ph_max` | 3,75 | pH ≥ esto es alarma |
| `av_max` | 0,8 | Volátil por encima de esto es alarma |
| `av_delta_max` | 0,3 | Salto de volátil que dispara alarma |
| `av_delta_dias` | 15 | Ventana en días para medir ese salto |
| `frecuencia_no_terminada` | 15 | Días máximos entre análisis con FML abierta |
| `frecuencia_terminada` | 30 | Días máximos entre análisis con FML cerrada |

La pestaña ⚙️ Configuración lo explica así, en la propia pantalla
(`index.html:1004-1009`):

> La fila General (default) define los umbrales para todos los lotes. Las filas
> de variedad y de proyecto solo sobreescriben los campos que tengan valor; los
> campos vacíos heredan.

### El −999

`−999` **no es "sin dato": es "se midió y la medición no sirve"**
(`fml.ts:57-58, 161-165`). La app lo descarta de todos los cálculos numéricos,
pero **no lo ignora**: en acidez volátil, un −999 dispara la alarma por sí solo
(`fml.ts:210`).

---

## 5. Alarmas, etapas e hitos

### 5.1 Las nueve alarmas

Cada lote activo se evalúa contra estas nueve condiciones. Cada una viene con la
acción que la app propone (`fml.ts:45-55, 427-439`):

| Alarma | Cuándo salta | Acción propuesta |
|---|---|---|
| `sin_analisis_valido` | No hay pH, AV ni málico utilizables | hacer OT y analizar |
| `frecuencia_vencida` | Pasaron más días que la frecuencia que le toca | hacer OT y analizar |
| `fa_no_finalizada` | Azúcar reductor por encima del límite | seguir control de FA |
| `fml_no_finalizada` | Málico no bajó lo suficiente | seguir control de FML |
| `so2_no_ok` | SO₂ libre por debajo del objetivo de su pH | revisar ajuste SO₂/pH |
| `ph_no_ok` | pH ≥ `ph_max` | revisar ajuste SO₂/pH |
| `no_lleno` | `mermo = si` | dar lleno o achicar |
| `av_alerta` | Ver abajo | revisar urgente y confirmar analisis |
| `datos_operativos_incompletos` | `mermo` sin cargar | completar Mermo/FML en LOTES |

**La alarma de volátil (`av_alerta`) tiene tres disparadores** (`fml.ts:203-230`).
Se mira la **última** medición con dato de AV, y salta si:

1. el valor es `−999` (medición inválida), **o**
2. supera `av_max` (0,8 por defecto), **o**
3. subió más de `av_delta_max` (0,3) respecto de **alguna** medición anterior de
   los últimos `av_delta_dias` (15) días.

El tercer caso es el que atrapa lo que se escapa: una subida rápida cuando el
valor todavía está en rango.

### 5.2 Estados de FA y FML

**FA** (`fml.ts:256-260`) — mira el último azúcar reductor válido:
`finalizada` si está en el límite o abajo · `no_finalizada` si lo pasa ·
`sin_dato` si no hay medición.

**FML** (`fml.ts:232-254`) — dos caminos para darla por cerrada:
- el último málico está por debajo de `fml_malico_finalizada` (0,2), **o**
- las **dos últimas** mediciones están por debajo de `fml_malico_2ultimas` (0,5)

Además existe `excluida`, para lotes que no hacen maloláctica: se marca con
`fml_excluida = si` o `hace_fml = no` en el lote, o con `hace_fml: no` en los
criterios de esa variedad.

### 5.3 Las cinco etapas

`ingreso → fa → fml → crianza → cerrado` (`etapas.ts:20`)

La app **sugiere** una etapa con esta cascada (`etapas.ts:58-72`):

1. Sin litros **y** con fecha de ingreso → `cerrado`
2. Sin fecha de ingreso → `ingreso`
3. Sin descube → `fa`
4. FML `finalizada` o `excluida` → `crianza`
5. Si no → `fml`

> ⚠️ **Crianza exige descube.** Una blanca tiene `fml_estado = excluida` desde el
> alta, así que sin esa condición un lote recién ingresado caería directamente en
> crianza (`etapas.ts:51-57`).

La sugerencia **no se aplica sola**. La etapa que vale es la **confirmada** en el
lote; la sugerida alimenta la bandeja del Dashboard, donde alguien la confirma.
Un lote entra a la bandeja si nunca tuvo etapa confirmada, o si la sugerida
difiere de la confirmada (`src/lotes/vistas.ts:48-65`).

**Los movimientos `pendiente` son planes, no hechos.** No cuentan para la etapa,
ni para el avance, ni para el linaje. Un movimiento sin campo `estado` se
considera ejecutado — así vino la migración del Excel
(`movimientos.ts:9-11, 31-35`).

### 5.4 Los nueve hitos y la barra de avance

`etapas.ts:34-44, 129-200`

| Hito | Aplica desde | Se cumple cuando |
|---|---|---|
| Datos de ingreso completos | ingreso | Están variedad, proyecto, fecha de ingreso, kilos y vasija FA |
| FA finalizada | fa | Azúcar reductor dentro del límite |
| Descube cargado | fa | Hay un movimiento de descube **con vasija destino** |
| Análisis al día | fa | Días desde el último análisis ≤ la frecuencia que le toca |
| FML finalizada | fml | FML cerrada *(no aplica si está excluida)* |
| pH OK | fml | pH por debajo de `ph_max` |
| SO₂ OK | fml | SO₂ molecular llega al objetivo |
| Lleno | fml | `mermo` distinto de `si` |
| Trasiego post-FML | crianza | Hay trasiego con fecha ≥ el fin de la FML |

"Desde" es inclusivo y hacia adelante: un hito que aplica desde `fa` también
aplica en fml, crianza y cerrado.

**La barra de % cuenta cumplidos sobre *aplicables*.** Los hitos que no aplican
en la etapa actual no suman ni restan (`etapas.ts:208-218`). Por eso un lote en
`fa` puede estar al 100% sin haber tocado la maloláctica.

**Al cerrar un lote el avance se congela.** Queda guardado en `avance_congelado`
y la barra ya no se mueve; los hitos se siguen calculando, pero solo como
referencia histórica (`etapas.ts:275-280`).

Para el hito de trasiego post-FML hay un caso especial: una blanca nunca cruza el
umbral de málico, así que en los lotes excluidos la referencia es **la fecha del
descube**, no la del fin de FML (`etapas.ts:147-152`).

---

## 6. Cruce con el Mapa de Barriles

Compara el desglose de envases declarado en Lotes contra el inventario real del
Mapa de Barriles. Es lo que manda a alguien a caminar la bodega a contar
barricas, así que conviene entender bien qué significa cada veredicto.

**Qué se compara:** solo envases de 50, 200, 225 y 500 L. **`vasija_grande` queda
deliberadamente afuera** de la comparación: el mapa no ve los tanques grandes, y
meterlos inventaría diferencias que no existen (`cruce.ts:108-118`).

El invariante que se asume del lado de Lotes (`envases.ts:5-10`):

```
litros_actuales = 50·cap50 + 200·cap200 + 225·cap225 + 500·cap500 + vasija_grande
```

### Los seis veredictos

`cruce.ts:120-222`

| Veredicto | Qué significa | ¿Se camina? |
|---|---|---|
| `coincide` | Los conteos dan exactamente iguales | No |
| `solo_representacion` | El total cierra sumando el tanque: es vasija grande sin desglosar | No |
| `ausente_ok` | Ausente del mapa con razón (cerrado, solo tanque, fermentando, o con tanque asociado) | No |
| `difiere` | Los conteos no dan — con severidad alta / media / baja | Solo alta y media |
| `sin_barriles` | Declara envases y **no tiene ni una unidad en el mapa** — severidad alta | **Sí** |
| `sin_envase` | En etapa intermedia, ni declarado ni en el mapa — severidad media | **Sí** |

### Cómo se calcula la severidad

**Es el peor de dos criterios**, absoluto o relativo (`cruce.ts:148-156`):

| Severidad | Diferencia absoluta | **o** proporción |
|---|---|---|
| **alta** | > 700 L | ≥ 25 % |
| **media** | > 250 L | ≥ 10 % |
| **baja** | el resto | — |

Un umbral solo absoluto entierra problemas reales: el lote 26172 declara cero
envases estando cerrado y el mapa tiene una barrica a su nombre. Son 50 L —ruido
por tamaño— pero es el **100 %** del lote.

**Las de severidad baja quedan afuera** de la lista a verificar: son ±1 envase
sobre 14 a 18, ≤ 250 L y menos del 10 % del lote, consistente con demora de
registro y no con vino faltante (`cruce.ts:257-262`).

### Detalles que explican números raros

- **228 y 300 L se cuentan como 225.** El mapa tiene 51 barricas de 228 L y una
  de 300 L, y Lotes no tiene esos campos. El informe declara cuántas se
  aproximaron; el error es de 3 L por unidad, o **0,04 %** sobre 343.850 L
  (`cruce.ts:33-38`).
- **`solo_representacion` tolera 250 L** de margen para decidir que el lote está
  sin desglosar (`cruce.ts:40-41`).
- **`mezcla_distinta`** marca los lotes donde la *cantidad* de envases coincide
  pero las capacidades no. Mismo número de barricas, distinta mezcla.
- **Las series 267xx / 268xx / 269xx no se cruzan.** Son 206 unidades y 46.350 L
  de otra aplicación; dejarlas entrar era el **72 %** del ruido de huérfanos (288
  en vez de 82) — `cruce.ts:45-50`.
- **Conflictos:** si una barrica aparece atribuida a dos lotes distintos, el
  aviso le llega **a los dos**, porque los dos merecen enterarse
  (`cruce.ts:275-280`).

Si el Mapa de Barriles todavía no está en la plataforma, el cruce devuelve **503**
con: *«todavía no hay datos del Mapa de Barriles en la plataforma. Importalo antes
de cruzar.»* (`mapa.ts:127-131`).

---

## 7. Todas las alertas, una por una

### 7.1 El servidor frenó el guardado

**Cuándo:** perdés muchas filas de una sección en un solo guardado.

**La regla exacta:** se frena si desaparecen **10 filas o más** *y* eso es **más
del 20 %** de la sección. Las dos condiciones juntas
(`src/prensas/validacion.ts:10-12, 99-109` — el mismo módulo valida Lotes).

Aplica por separado a `lotes`, `analisis` y `movimientos`.

> ⚠️ El servidor FRENÓ este guardado para proteger los datos:
>
> • se perderían {N} de {M} {sección} en un solo guardado
>
> ¿Era tu intención? Aceptar = guardar igual (queda registrado como FORZADO en el
> historial). Cancelar = no guardar nada y revisar.

**Qué hacer:** casi siempre, cancelar y revisar. Aceptar guarda igual, pero el
guardado queda marcado `[FORZADO]` en el historial, con tu nombre.

### 7.2 Errores que NO se pueden forzar

Son de estructura: el archivo está roto, no es una decisión tuya
(`validacion.ts:60-97`).

- *«el guardado no es un objeto JSON válido»*
- *«falta la sección 'lotes' (o no es una lista)»*
- *«falta la sección 'analisis' (o no es una lista)»*
- *«la sección 'movimientos' no es una lista»*
- *«la sección 'meta' no es un objeto»*
- *«la sección '{sec}' tiene {N} fila(s) inválida(s)»*

`lotes` y `analisis` son **obligatorias**. `movimientos` es opcional —el
`datos.json` migrado del Excel no la trae y tiene que poder guardarse igual.

### 7.3 Conflicto de versión

**Cuándo:** otra persona guardó mientras vos editabas. La app manda su número de
versión y el servidor lo compara con el que tiene; si no coinciden, responde
**409** y no escribe nada (`rutas.ts:95-97`).

> **Conflicto de versión**
> Otra PC guardó cambios mientras editabas. Para no pisar su trabajo, recargá la
> última versión.
> ⚠️ Tus cambios sin guardar se perderán al recargar.

**Qué hacer:** no hay merge automático. Antes de recargar, copiá a mano lo que
estabas cargando (o sacale una foto a la pantalla). Después recargá y volvé a
cargarlo.

### 7.4 El servidor no responde

> No se pudo guardar: el servidor no responde. Revisá que esté abierto y probá de
> nuevo. Tus cambios siguen en pantalla.

`public/lotes/js/nucleo.js:172`. La parte importante es la última frase: **no
cierres la pestaña**. Lo que tenés en pantalla sigue ahí; probá guardar de nuevo
en un rato.

> 📝 *Nota:* el texto habla de "revisá que esté abierto", herencia de cuando el
> servidor era un programa en una PC de la bodega. Hoy el servidor está en la
> nube; si no responde, es la conexión o Cloudflare.

### 7.5 El objetivo tiene que ser mayor que el actual

En la orden de corrección podés editar el objetivo de SO₂ de un lote. Si ponés un
valor **menor o igual** al SO₂ actual, el campo se pone en rojo por 2,5 segundos
y **se restaura el valor del servidor**
(`vista-orden-correccion.js:717-723`). No se guarda nada.

### 7.6 Filas y celdas de color

| Marca | Significa |
|---|---|
| Fila **roja** (`tr.crit`) | Lote con alarmas: NO OK, sin análisis o vencido |
| Fila **amarilla** (`tr.venc`) | Frecuencia vencida: más días sin análisis de los permitidos |
| Celda **roja** | Ese valor está fuera de criterio |

Las celdas rojas salen del endpoint `/analisis`, que devuelve por cada análisis
qué métricas están fuera: `ph`, `av`, `malico`, `gluc_fruc`, `azucar_reductor`,
`so2_libre` (`fml.ts:333-359`).

Ojo con dos de ellas:
- **`av`** se marca también cuando vale `−999`.
- **`gluc_fruc`** usa un umbral fijo de **3,0** que *no* es configurable por
  variedad, a diferencia de todos los demás (`fml.ts:348-349`).

### 7.7 Estado del guardado (arriba a la derecha)

- **● Cambios sin guardar** (ámbar) — tenés ediciones en memoria que todavía no
  viajaron. Si cerrás la pestaña, se pierden.
- **✓ Guardado (v{N})** (verde) — todo escrito, y ese es el número de versión.

`public/lotes/js/nucleo.js:36-43`

### 7.8 Banner de avisos

Una franja arriba de todo, que se refresca **cada 60 segundos**
(`public/lotes/app.js:87`):

> ⚠️ **Atención:** {aviso}

Hoy `/estado` devuelve la lista de avisos vacía en Lotes (`rutas.ts:161-168`): el
banner existe y funciona, pero no tiene nada que decir. Si aparece algo ahí, es
nuevo.

---

## 8. Guardado, historial y respaldos

**Cómo se guarda.** La app manda el documento **entero** en cada guardado, no los
cambios. Por eso importan tanto el freno del 20 % y el control de versión: son
las dos redes que impiden que un documento incompleto pise al bueno.

**Versionado.** Cada guardado exitoso incrementa la versión en 1
(`rutas.ts:100`). Ese número es el que ves al lado del ✓.

**Historial** (botón 🕘). Guarda las últimas **200** versiones (`rutas.ts:20`).
De cada una: versión, fecha y hora de la bodega, nombre visible, mail verificado,
resumen de qué cambió y si fue forzado.

El resumen cuenta altas y bajas por sección. Para lotes usa el número de lote
como clave, así que distingue agregados / eliminados / editados. Para análisis y
movimientos no hay clave natural: **una edición cuenta como −1 y +1**
(`src/prensas/cambios.ts:62-85`).

**Respaldos.** Cada guardado dispara un snapshot a R2, sin bloquear la respuesta
(`rutas.ts:264-270`):

```
lotes/datos-v00123-2026-09-10-14-35-22.json
```

Además hay un snapshot diario por cron (`src/index.ts:112-120`).

**Zona horaria.** Todas las fechas y horas se calculan en la zona de la bodega
(`TZ_BODEGA`), no en UTC: el servidor de Cloudflare puede estar en cualquier
lado (`src/prensas/validacion.ts:182-195`).

---

## Apéndice: los números de un vistazo

| Constante | Valor | Dónde manda |
|---|---|---|
| pKa del SO₂ | 1,8 | Fórmula del molecular |
| SO₂ molecular objetivo | 0,38 | Objetivo de libre |
| SO₂ libre piso | 25,0 ppm | Objetivo de libre — **el que suele mandar** |
| Concentración solución d1030 | ≈ 55 g/L | mL de solución |
| Factor del Excel | 1,5 | Dosis (MBK y mL) |
| Rendimiento del MBK | × 2 | Gramos de metabisulfito |
| Banda de densidad DMA | 1,028 – 1,032 | Control de la solución (fuera de la app) |
| Ventana de supresión | 30 días | Qué lote entra a la orden |
| Umbral de repetición | 5,0 ppm | Qué lote entra a la orden |
| pH máximo | 3,75 | Alarma `ph_no_ok` |
| AV máxima | 0,8 g/L | Alarma `av_alerta` |
| Salto de AV | 0,3 g/L en 15 días | Alarma `av_alerta` |
| Málico — FML cerrada | 0,2 · 0,5 (dos últimas) | Estado de FML |
| Azúcar reductor máximo | 5,0 g/L | Estado de FA |
| Gluc/Fruc | 3,0 (fijo, no configurable) | Celda roja en Análisis |
| Frecuencia de análisis | 15 días (FML abierta) · 30 (cerrada) | Alarma `frecuencia_vencida` |
| Freno anti-borrado | ≥ 10 filas **y** > 20 % | Guardado |
| Cruce — severidad alta | > 700 L **o** ≥ 25 % | Cruce |
| Cruce — severidad media | > 250 L **o** ≥ 10 % | Cruce |
| Historial | últimas 200 versiones | Botón 🕘 |
| Marcador de dato inválido | −999 | Todos los cálculos |

---

*Guía escrita el 2026-09-10 contra el código de `main`. Si cambiás una regla,
buscá acá la referencia `archivo:línea` y actualizá el párrafo.*
