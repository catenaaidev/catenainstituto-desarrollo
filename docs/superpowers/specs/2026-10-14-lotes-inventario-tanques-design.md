# Inventario de tanques (Lotes web) — diseño

Fecha: 2026-10-14 · Rama: `feat/inventario-tanques` · Módulo: Lotes

## Problema

Oriana actualiza todos los días a mano la hoja "Inventario vasijas" de
`Registro de Lotes CIW 2026\Inventario de vasijas de CIW 2026.xlsx`: qué lote
hay en cada una de las 78 vasijas fijas de CIW, cuántos litros, el estado
(VINO TERMINADO, MERMO, NO SO2…) y observaciones (velo, Brett). Casi todo eso
ya lo sabe la web, porque al confirmar una OT se escriben `vasija_actual`,
`vasija_grande` y `litros_actuales` en cada lote. Pero nada arma la vista al
revés ("qué hay en cada tanque"), y lo que solo se sabe mirando el tanque (cm
de merma, velo) no tiene dónde cargarse.

## Objetivo

Agregar una cuarta sub-pestaña **Movimientos → Inventario de tanques** que:

1. Muestre las vasijas del padrón con su contenido. Se **actualiza sola** con
   las OT: no se guarda nada calculado.
2. Permita cargar una **recorrida** (cm de merma, velo, observación, estado a
   mano) y, con check manual, corregir los litros del lote cuando lo medido no
   coincide.
3. Imprima la hoja de recorrida para llevar a la bodega.

## Fuera de alcance

- Los tanques de la bodega que no son de CIW (hoja "Vasijas y capacidades
  Bodega Ag"): siguen en el Excel. Decisión del usuario del 2026-10-14.
- Barricas: las sigue llevando el Mapa de Barriles.
- Totales por color y año, traslados, fraccionados y borras.

## Decisiones

| Tema | Decisión |
|---|---|
| Fuente del contenido | Se calcula al abrir la sub-pestaña, cruzando padrón × lotes × OT pendientes × recorridas. No hay tabla "inventario" guardada (sería una segunda verdad que se desincroniza al borrar o deshacer OT). |
| Recorrida | Completa: cm, velo, observación y estado manual, con fecha y autor. |
| Diferencia medido vs. web | Se marca en amarillo; "Aplicar diferencias" con check por fila corrige el lote. |
| Estado | Automático, con la posibilidad de pisarlo a mano (ver tabla abajo). |

## Datos

### Lo que ya existe y se lee

- `DATOS().vasijas`: padrón `{num, tipo, cap_real, tabla, activa}`
  (`vasijas-padron.js`). Solo entran las activas.
- `DATOS().lotes`: `vasija_actual` (texto libre: "T 201", "H 170 + Barricas"),
  `vasija_grande` (litros en tanque), `litros_actuales`, `etapa`, `variedad`,
  `cosecha`, `id_texto`, `organico_convencional`.
- `DATOS().ordenes_trabajo`: las de `estado` PENDIENTE (`ot-movimientos.js`)
  con `destino` y, por lote, `vasijas_manual` / `barriles`.
- `cubicacion.js litrosPorCm(vasija, cm)`: manda la Cap REAL.

### Sección nueva: `recorridas`

```js
DATOS().recorridas = [{
  id: 'rec-2026-10-14-1',     // clave para deshacer.js
  fecha: '2026-10-14',        // hoyLocalISO()
  por: 'oriana@…',
  filas: [{
    vasija: '201',            // normalizarNumVasija
    lote: '25313',            // el lote que la web ubicaba ahí al medir ('' si vacía)
    cm: 3,                    // null = no se midió; 0 = lleno
    litros_medidos: 7420,     // litrosPorCm; null si sin tabla o error
    litros_web: 7500,         // foto de lo que decía la web al medir
    velo: false,
    obs: 'Brett',
    estado_manual: '',        // '' | 'NO SO2' | 'FUERA DE SERVICIO' | 'DESCUBE' | 'DESBORRE' | 'TRASLADO' | …
    aplicado: null,           // {el, por, antes:{vasija_grande, litros_actuales}} al aplicar
  }],
}]
```

- Se agrega `'recorridas'` a `SECCIONES_LOTES.secciones` (`src/prensas/validacion.ts`),
  no a `requeridas`. Así hereda el freno anti-borrado sin exigirla.
- `nucleo.js` la inicializa en `[]` y documenta la forma.
- `deshacer.js CLAVE_DE_SECCION.recorridas = 'id'`: Ctrl+Z de la recorrida y
  de "Aplicar diferencias" funciona como en el resto de la página.
- Una recorrida puede cubrir solo algunas vasijas. La foto vigente de cada
  vasija es la **última fila que la mide**, en cualquier recorrida.

## Cálculo (`inventario-tanques.js`, puro)

`inventarioTanques({padron, lotes, ots, recorridas, hoy}) →
{filas, sinVasija, totales}`

1. **Ocupación.** Para cada lote con `litros_actuales > 0`, se parte
   `vasija_actual` por `+`, se normaliza cada parte con `normalizarNumVasija` y
   se cruza contra el padrón activo.
   - Litros en la vasija = `vasija_grande` del lote. Si el lote está en una
     sola vasija del padrón y no tiene `vasija_grande`, se usa `litros_actuales`.
   - Si una parte parece tanque pero no está en el padrón, el lote va a
     `sinVasija`.
   - Las partes "Barricas"/"Barrica" se ignoran.
2. **Fila por vasija** (orden: el del padrón):
   `{num, tipo, cap_real, lotes:[{lote, cosecha, variedad, id_texto, organico, litros}], litros, estado, estado_origen, velo, obs, ultima:{fecha, cm, por}, avisos:[]}`.
3. **Estado**, en este orden (gana el primero que aplica):

   | # | Condición | Estado | `estado_origen` |
   |---|---|---|---|
   | 1 | `estado_manual` de la última medición ≠ '' | ese valor | `manual` |
   | 2 | OT pendiente que sale de la vasija o entra en ella | `TRASIEGO (OT 0xxx)` | `ot` |
   | 3 | Vacía | `VACÍA` | `auto` |
   | 4 | Última medición con cm > 0, del mismo lote que hoy | `MERMO` | `medicion` |
   | 5 | Etapa `ingreso` | `MOSTO` | `auto` |
   | 6 | Etapa `fa` | `FERMENTANDO` | `auto` |
   | 7 | Cualquier otra etapa con litros | `VINO TERMINADO` | `auto` |

   - En el paso 2, una OT "sale" si `normalizarNumVasija` de alguna parte de
     `vasijas_manual` de sus lotes es la vasija, y "entra" si lo es `destino`.
   - En el paso 4, una medición de un lote anterior no cuenta: el tanque se
     vació y se volvió a llenar.
   - FUERA DE SERVICIO y NO SO2 siguen hasta que una recorrida posterior los
     cambie. Lo mismo `velo` y `obs`.
4. **Avisos por fila:**
   - `dos-lotes`: más de un lote en la vasija.
   - `excede`: litros > `cap_real`.
   - `diferencia`: la última medición es del mismo lote y su `litros_medidos`
     difiere de los litros actuales por más de 1 L, sin `aplicado`.
5. **Totales:** vasijas ocupadas/vacías, litros totales, cantidad de MERMO y
   cantidad con aviso.

## Vista (`vista-inventario-tanques.js`)

- Se registra como `b('tanques','Inventario de tanques')` en `_selectorSub()`
  de `vista-movimientos.js`, con su rama en `renderMovimientos`.
- **Barra:**
  - Totales.
  - Filtro Todas / Ocupadas / Vacías / Con aviso, recordado en localStorage
    con try/catch.
  - Botones "Nueva recorrida" e "🖨 Hoja de recorrida".
- **Tabla:** N°, tipo, Cap REAL, lote, cosecha, variedad, ID, litros, estado
  (chip con color por origen), orgánico, velo, observación, última medición.
  - Una vasija con dos lotes muestra los dos renglones dentro de la celda.
  - Los avisos van como ícono con tooltip.
  - Debajo de la tabla, el bloque "Lotes sin vasija conocida": lote,
    `vasija_actual` y litros, con enlace a la ficha.
- **Modo recorrida** (botón "Nueva recorrida"):
  - La tabla suma inputs por fila: cm, velo ✓, obs y estado manual (select con
    la lista de la Hoja1 del Excel más '').
  - Al tipear cm se muestran los litros medidos. Si no hay tabla o el cm es
    inválido, se muestra el error de `litrosPorCm` y no se calculan litros.
  - Una fila sin cm ni cambios no se guarda.
  - "Guardar recorrida" agrega la recorrida, llama a `markDirty()` y la
    guarda el autoguardado. "Cancelar" descarta.
- **Aplicar diferencias:**
  - Las filas con aviso `diferencia` muestran "web 7500 → medido 7420" y un
    check, tildado por defecto.
  - El botón "Aplicar diferencias (n)" escribe en cada lote tildado
    `vasija_grande = litros_medidos` y recalcula `litros_actuales` con
    `litrosDelLote(lote, mermas)`, igual que `aplicarPropuesta`.
  - También completa `fila.aplicado` con lo que había antes.
  - Solo aplica a lotes que están en **una sola** vasija del padrón. Con
    `dos-lotes` no se puede repartir, y la fila lo explica.
- **Hoja de recorrida (imprimir):** A4 con el formato de la hoja "Inventario"
  del Excel (N° vasija, lote, cm merma/lleno, velo) en dos columnas, con el
  lote precargado, la fecha y una línea de firma. Reusa el mecanismo de
  impresión de las otras hojas de Movimientos.
- Los permisos son los del módulo: un lector ve la tabla y no ve los botones
  de recorrida.

## Errores y bordes

- Padrón vacío: se muestra un aviso con enlace a Configuración ("Cargar
  padrón inicial"), igual que hoy.
- Un lote en una vasija `activa:false` va a `sinVasija`, con motivo "vasija
  inactiva".
- Cuando se aplica una diferencia y la recorrida es vieja (el lote cambió
  después de medir, porque su `vasija_actual` ya no incluye esa vasija), la
  fila se saltea y se avisa. Es la misma regla que el deshacer de OT.

## Pruebas

- `test/lotes-inventario-tanques.test.mjs` (node:test, como los demás):
  - ocupación simple;
  - "H 170 + Barricas";
  - corte con dos lotes en un tanque (aviso);
  - tanque fuera del padrón → sinVasija;
  - vasija inactiva;
  - cada fila de la tabla de estados, incluida la precedencia manual > OT >
    medición > etapa;
  - una medición de un lote anterior que no da MERMO;
  - diferencia y su desaparición tras `aplicado`;
  - la última medición gana entre recorridas.
- Tests de aplicar diferencias: lote en una vasija → actualiza; con dos lotes
  → no toca; con un lote que se movió → saltea.
- `validacion` acepta `recorridas` y frena su borrado masivo.
- Verificación en el navegador con un servidor de prueba propio
  (`lotes-inv-tanques`, :8815) antes de mergear a main. El deploy lo hace el
  usuario.
