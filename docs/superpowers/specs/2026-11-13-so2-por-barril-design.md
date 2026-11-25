# Corrección de SO₂ barril por barril (lotes heterogéneos)

Fecha: 2026-11-13 · Módulo: Lotes web · Pantalla: Correcciones → Orden de corrección

## Problema

Cuando un lote sale con SO₂ libre heterogéneo, la bodega analiza **todas** sus
vasijas una por una para corregir cada una por separado. Hoy la Orden de
corrección no lo sabe: `ultimaMedicion` (src/lotes/motores/correccion.ts) toma
**un solo SO₂ por lote**, el del último análisis cargado, y le da **la misma
dosis** a todas las vasijas. La columna `vasija` que guarda Cargar análisis
(`analisis[].vasija`) no se usa.

Caso real (respaldo del 21/10), lote 26056: barriles 923 → 6 ppm, 305 → 41,
527 → 23, 51 → 8. La orden corregía el lote entero con el número que hubiera
quedado último. Hay 135 análisis con vasija cargada.

Son **casos especiales**: después de la corrección se vuelve a analizar una
muestra por lote y todo sigue como hoy.

## Objetivos

- Que la orden calcule **una dosis independiente para cada vasija** (barril,
  T50, T200) que tenga análisis propio.
- Una **alerta** clara en pantalla y en el papel para que no se corrija a todos
  por igual.
- Volver solo al modo normal cuando llega un análisis del lote.

## Fuera de alcance

- Tablero, Dashboard y la alarma `so2_no_ok` siguen mirando el SO₂ del lote
  como hoy.
- Orden de muestras y Cargar análisis no cambian (la columna vasija ya existe).

## 1. Qué análisis corresponde a qué vasija

Vasijas candidatas = las unidades **llenas** del lote en el Mapa
(`unidades_por_lote`). Para cada análisis con `vasija`, normalizando el texto
(sin espacios ni letras, comparación por dígitos):

1. **Número completo** igual al `num` de una vasija del lote → esa vasija
   (los T50 se cargan así: "50042").
2. Si no, y el texto tiene **hasta 3 dígitos**, los **últimos 3 dígitos** (rellenando con ceros a la izquierda) contra
   los últimos 3 de cada vasija del lote (barriles de 7 cifras y T200) → esa
   vasija si hay **una sola**.
3. **"t50" / "t200" sin número** (cargas viejas) → si el lote tiene una sola
   vasija de esa capacidad, esa; si tiene varias, ambiguo.
4. **Ambiguo** (dos vasijas coinciden) o **sin coincidencia** → el análisis no
   se le asigna a nadie y genera un aviso en el lote ("dos vasijas terminan en
   042" / "la vasija 777 no está llena en este lote").

Un análisis con `vasija` no numérica que no es t50/t200 (p. ej. el nombre de un
tanque) cuenta como **análisis del lote**, igual que uno sin vasija.

Medido con los datos del 21/10 contra el Mapa del 02/10: 75 de 83 análisis por
barril se asignan sin dudas, 7 no encuentran vasija (Mapa más viejo) y 1 es
ambiguo; 8 de 455 lotes tienen dos vasijas con los mismos 3 últimos dígitos.

## 2. Cuándo un lote es "barril por barril"

Fecha de un análisis = `fecha_analisis` (mismo orden que `ordenarPorFecha`).

- **Último análisis del lote** = el más nuevo con SO₂ válido que NO está
  asignado a una vasija (regla 1 de arriba). Los análisis por vasija **ya no**
  cuentan como "último del lote".
- Para cada vasija, su **análisis propio** = el más nuevo asignado a ella con
  SO₂ válido.
- El lote es **barril por barril** si hay al menos un análisis por vasija
  (asignado, ambiguo o sin coincidencia) **más nuevo o del mismo día** que el último análisis del lote (o si no hay
  análisis del lote). Si no, el lote se calcula **exactamente como hoy**.

En modo barril por barril, para cada vasija del lote:

| Situación | SO₂ actual | Dosis |
|---|---|---|
| Su análisis propio es más nuevo o del mismo día que el del lote | el propio | calculada |
| El análisis del lote es más nuevo que el propio | el del lote | calculada |
| No tiene análisis propio | — | **vacía**, aviso rojo "sin análisis propio: medir o escribir la dosis a mano" |
| Vasija con análisis ambiguo | — | vacía, aviso rojo con el motivo |

La porción en tanque grande (`vasija_grande`) y el renglón sin barrica siguen
usando el último análisis del lote como hoy; si no hay, quedan sin dosis con
aviso.

## 3. Objetivo de cada vasija

El objetivo sale del pH (SO₂ molecular), como hoy, con esta cadena:

1. pH del análisis propio de la vasija.
2. Si no lo trae → el pH más reciente anterior **de esa vasija**; si no hay,
   el último pH del lote.
3. Si no hay ningún pH → el objetivo del lote como hoy (incluido el pisado a
   mano en la banda).

Si el usuario pisa el objetivo del lote en la banda, ese objetivo manda para
todas las vasijas del lote (es una decisión explícita del usuario).

Dosis de cada vasija = `max(0, objetivo − SO₂ actual)` sobre sus litros, con la
misma fórmula de hoy (`calcularCorreccionSo2`). Una vasija ya en objetivo queda
con dosis 0 y la marca "en objetivo".

## 4. El lote en la orden

- Entra en la orden si **alguna** vasija está bajo su objetivo. Si todas están
  en objetivo, va a `activables` con `fuera: 'en_objetivo'`.
- Urgencia (orden por defecto): la diferencia de su **peor** vasija.
- `so2_libre` del lote (lo que muestran filtros y columnas) = el SO₂ de la peor
  vasija; se agrega `so2_min`/`so2_max` para el cartel.
- Nuevos campos:
  - `LoteOrden.por_vasija: boolean` y `LoteOrden.avisos_vasija: string[]`.
  - `FilaBarrica.so2_libre`, `ph`, `objetivo`, `fecha_analisis`,
    `fuente: 'propio' | 'lote' | null`, `aviso: string | null`.
- La regla de supresión (corregido hace poco) se aplica igual al lote; la rama
  de ±5 ppm **no** se aplica a lotes barril por barril (no hay un solo SO₂
  anterior con qué comparar): solo cuenta "sin análisis nuevo".

## 5. Pantalla y papel

**Banda del lote (solo pantalla):** cartel naranja
"⚠ Barril por barril: N vasijas con análisis propio del dd/mm · SO₂ entre X y
Y ppm · cada una lleva su dosis", más los avisos rojos de vasijas sin análisis o
ambiguas.

**Modo:** fijo en *Por barril*; *Genérica* deshabilitado para ese lote (con
título explicando por qué). `modoPorDefecto` devuelve 'barril' si
`por_vasija`.

**Renglones de vasija:** muestran SO₂ actual, objetivo y dosis de esa vasija;
"en objetivo · 0" cuando corresponde; vacíos y en rojo cuando no hay análisis.
La dosis escrita a mano sobre la hoja sigue funcionando y se guarda
(`orden-correccion-manual.js`).

**Papel impreso (B219):** el renglón del lote lleva el rótulo
"CORRECCIÓN BARRIL POR BARRIL — cada vasija su dosis". El resto del formato no
cambia. Regenerar `test/fixtures/lotes-papel.json` solo si cambia el CSS de
papel, y revisar que el diff sea solo esto.

**Cliente:** `_ocBuildRows` hoy recalcula la dosis con un solo
`l.so2_libre`. En lotes `por_vasija` debe usar el `so2_libre`/`objetivo` de cada
`FilaBarrica` (o el objetivo pisado del lote si lo hay). Papel = guardado =
ejecutado sigue saliendo de la misma función.

## 6. Al ejecutar

- Se registra la corrección del lote como hoy (misma OT, mismo Registro de
  corrección de SO₂), agregando el **detalle por vasija**: `num`, SO₂ que tenía,
  dosis puesta.
- `so2_libre_actual` del registro = el de la peor vasija (para lectura humana);
  la supresión no usa ±5 en estos lotes (sección 4).
- Cuando se carga un análisis del lote (sin vasija) más nuevo, el lote vuelve
  solo al modo normal. No hay nada que apagar.

## Entregas

1. **Motor + alerta**: cruce de vasijas, modo barril por barril, dosis por
   vasija en el servidor, cartel en la banda, modo fijo, rótulo en el papel.
   Es lo que el usuario necesita ya.
2. **Registro al ejecutar**: detalle por vasija en la corrección y supresión sin
   ±5.

## Pruebas

- Motor (vitest, `src/lotes/motores`): lote 26056 del ejemplo (4 vasijas con
  dosis distintas); lote con análisis del lote más nuevo → modo normal; vasija
  sin análisis → sin dosis + aviso; 3 últimos dígitos ambiguos; T50 por número
  completo; "t50" con una y con dos T50; mismo día barril vs lote → gana el
  barril; cadena de pH (propio → anterior de la vasija → lote → objetivo del
  lote); objetivo pisado manda.
- Cliente: `_ocBuildRows` con lote `por_vasija` da dosis por vasija; modo
  Genérica deshabilitado; papel con el rótulo.
- En navegador con mock: hoja de la orden con el lote 26056 y un lote normal al
  lado.
