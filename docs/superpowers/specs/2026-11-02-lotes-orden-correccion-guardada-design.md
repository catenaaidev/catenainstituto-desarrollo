# Orden de corrección guardada (Lotes web) — diseño

Fecha: 2026-11-02 · Pedido del usuario · Rama `feat/oc-orden-guardada`

## Problema

Hoy la Orden de corrección de SO₂ existe solo en papel. "🖨️ Imprimir" guarda el
PDF en la carpeta B de OneDrive pero no guarda nada en la app. "✔ Ejecutar orden"
vuelve a calcular la lista desde cero (análisis del momento, filtros, unidad,
objetivos pisados en esta sesión), pide otra vez el N° de OT a mano y arranca con
todos los lotes tildados.

Consecuencia observada por el usuario (semana anterior al 2026-11-02): **las dosis o los lotes
registrados no coincidían con el papel impreso.** Además, entre que se imprime y
se ejecuta, la orden no aparece en ningún registro.

## Objetivo

1. Lo que se registra sale de una **copia guardada de lo que se imprimió**, nunca
   de un recálculo.
2. Cada orden impresa aparece en el **Registro de corrección de SO₂** como
   pendiente hasta que se ejecuta (o se anula).
3. Ejecutar es simple y seguro: todo destildado, sin retipear el N° de OT, sin
   poder cambiar dosis.

## Decisiones del usuario

- La orden aparece en la Bitácora, que pasa a llamarse **"Registro de corrección
  de SO₂"**. No en Movimientos.
- Modo **por lote**, como el selector "Vasijas específicas / Cantidad de
  barricas" de la OT de Corte: cada lote elige **Genérica** o **Por barril**, y
  la elección vale para el papel y para la ejecución.
- La orden se ejecuta **una sola vez**, cuando está terminada (sin avance
  parcial).
- Se descartan: OT de Movimientos tipo "Corrección" (tocaría litros/inventario) y
  congelar la lista solo en el navegador (no sobrevive a recargar ni a otra PC).

## Pantalla

Sub-pestañas de Correcciones, en el orden del flujo:
`Orden de corrección | Registro de corrección de SO₂ | Otros agregados`
(`data-v` / ids internos `so2` y `ordencorr` no cambian; solo etiqueta y orden).

### Orden de corrección (armar e imprimir)

- Aviso arriba si hay pendientes: "⏳ Hay N órdenes pendientes de ejecutar: B223 ·
  B225 [Ver →]" → lleva al Registro.
- Cada fila separadora de lote suma el selector `( Genérica | Por barril )`.
  Por defecto **Genérica** si todas sus vasijas son barricas de misma capacidad,
  mismos litros y misma dosis impresa (lo que hoy `gruposPorLote` junta en un
  renglón); si no, **Por barril**.
- Sale el botón global "📄 Papel: por barril / por lote": lo reemplaza el selector
  por lote. El papel usa SIEMPRE las columnas del papel por lote
  (`# | LOTE | VASIJAS | PRODUCTO | dosis por vasija | Check`), porque una misma
  hoja mezcla los dos modos y no puede tener dos encabezados. Genérica = un
  renglón por tipo de vasija (como hoy); Por barril = un renglón por barril con
  VASIJAS = "Barril 1250010 · 225 L". **Cambio visible:** los lotes por barril ya
  no salen con el renglón separador de la B219; cada renglón lleva su lote.
- Sale el botón "✔ Ejecutar orden" y su overlay.
- "🖨️ Imprimir" pasa a "🖨️ Imprimir y guardar": si `imprimirYGuardar` devuelve
  `ok`, se guarda la orden (ver Datos). Si se cancela, no se guarda nada.
- Lote que ya está en una orden **pendiente**: fila gris con etiqueta "⏳ en B223"
  y **excluido por defecto** de la orden nueva. Se puede incluir a mano; al
  hacerlo, aviso "Ya está en la B223 sin ejecutar".

### Registro de corrección de SO₂ (ex Bitácora)

- Arriba, sección **Órdenes**:
  - ⏳ Pendientes primero: `B225 · 01/11 · 8 lotes · emitió Juan [✔ Ejecutar] [Anular]`
  - ✔ Ejecutadas: `B219 · 20/10 · 12 de 13 lotes hechos · ejecutó Oriana el 21/10 [ver]`
  - ✕ Anuladas: tachadas, con quién y cuándo.
  - "[ver]" abre la orden en solo lectura (lotes, modo, dosis, qué se hizo).
- Abajo, la tabla de correcciones por lote de hoy, sin cambios (incluido anular
  por lote). La calculadora queda donde está.

### Ejecutar (overlay desde el Registro)

```
Ejecutar B223 · emitida 28/10 por Oriana
Fecha real de la corrección [hoy]        Ejecuta: <usuario logueado>
☐ 26001 Malbec · Genérica · 10 barricas × 50 mL              500 mL
☐ 26014 CF · Por barril                  [tildar todos]       0 de 6
     ☐ B-1203 48 mL  ☐ B-1207 52 mL …
   ⚠ hay un análisis del 30/10 posterior a la orden
Vas a registrar: 0 lotes · 0 mL                 [Cancelar] [Confirmar]
```

- **Todo arranca destildado.** Confirmar se apaga con 0 tildes.
- N° de OT = el de la orden guardada; no se escribe.
- Dosis y unidad = las guardadas; no editables. Si en la bodega se hizo otra cosa,
  se ejecuta sin ese lote y se corrige/anula desde la tabla del Registro.
- Genérica: un tilde = todas las vasijas del lote.
  Por barril: tilde por vasija; el tilde del lote hace de "tildar todos" (queda a
  medio marcar si hay algunas). El lote registra la **suma de lo tildado** (mbk y mL).
- Aviso ⚠ si el lote tiene un análisis con `fecha` posterior a `orden.fecha`.
  Solo informa; no bloquea.
- Al confirmar: una corrección por lote tildado vía `armarCorreccion` +
  `aplicarCorreccion` (mismo camino que hoy, `ot_n` = número de la orden), y la
  orden pasa a `ejecutada`. Lo no tildado no se registra y vuelve solo a la lista
  "a corregir" (la supresión del servidor solo mira correcciones escritas).
- Una sola ejecución: después de confirmar no se reabre. Para cambiar algo, se
  anula la corrección del lote desde la tabla (como hoy).
- Se conservan las protecciones de `_ocEjecConfirmar`: guarda de doble clic,
  rollback en memoria si `guardar()` falla (incluido el estado de la orden), aviso
  de convivencia con otra OT el mismo día.

### Anular una orden pendiente

Confirmación → `estado: 'anulada'`, `anulada: {por, fecha}`. No se borra. Sus
lotes dejan de figurar "⏳ en Bxxx" y vuelven a entrar por defecto. Una orden
**ejecutada** no se anula entera desde acá (se anulan sus correcciones por lote,
como hoy).

## Datos

Sección nueva del documento de Lotes: `ordenes_correccion` (lista).

```js
{
  id: 'oc-<timestamp>-<rand>',     // clave para fusion.js (merge por id)
  numero: 'B223',
  fecha: '2026-10-28',             // fecha de la orden (encabezado)
  emitio: 'Oriana', recibio: '',
  creada_por: '<usuario>', creada_en: '<ISO>',
  unidad: 'sol' | 'mbk',           // como se expresó en papel
  estado: 'pendiente' | 'ejecutada' | 'anulada',
  lotes: [{
    lote: '26001', variedad: 'Malbec',
    so2_libre: 18, objetivo: 35, diferencia: 17,
    modo: 'generica' | 'barril',
    vasijas: [{ num: '1250010', vasija: '', cap: 225,      // num '' = tanque/sin ubicar
                litros: 225, mbk_g: 11.5, ml: 104.3 }],
    mbk_total_g: 115, ml_total: 1043,
  }],
  ejecucion: null | {
    fecha: '2026-11-02', por: '<usuario>', en: '<ISO>',
    hechos: [{ lote: '26014', vasijas: ['1250010', '1250011'], // siempre la lista real
               mbk_g: 22.9, ml: 208.5 }],
  },
  anulada: null | { por, fecha },
}
```

- Se declara en `SECCIONES_LOTES.secciones` (`src/prensas/validacion.ts`) para el
  control de lista y el freno anti-borrado. No es requerida.
- Los números se guardan **ya calculados** con lo que se vio en pantalla
  (objetivo pisado incluido). Nada se recalcula al ejecutar.
- La corrección escrita en `analisis[].correccion` mantiene su forma actual, así
  los carteles, la ficha, Agenda y la supresión del servidor no cambian.
- `numerosWeb` (numeración B) pasa a contar también `ordenes_correccion`, para
  que el próximo B propuesto no repita uno ya guardado.

## Unidades de código

- `public/lotes/js/orden-correccion-guardada.js` (**puro**, con test):
  `armarOrdenGuardada(filas, modos, encabezado, unidad)`,
  `entradasDeEjecucion(orden, tildes, fecha)` → entradas para
  `aplicarCorreccion` + `ejecucion.hechos`,
  `lotesPendientes(ordenes)` → Map lote → número,
  `modoPorDefecto(fila)`, `analisisPosterior(orden, analisis)`.
- `vista-orden-correccion.js`: selector por lote, papel por modo, guardar al
  imprimir, etiqueta "⏳ en Bxxx", fuera el overlay de ejecutar
  (`_ocEntradasDeEjecucion` y su overlay se reemplazan).
- `vista-so2.js`: título "Registro de corrección de SO₂", sección Órdenes,
  overlay de ejecutar (reusa `_ocEscribirEntradas` / `_ocRevertirEntradas`),
  anular orden.
- `nucleo.js`: etiqueta y orden de las sub-pestañas.
- `src/prensas/validacion.ts`: sección nueva.

## Pruebas

- Unitarias del módulo puro: snapshot fiel a las filas (objetivo pisado, ambas
  unidades), genérica = todas las vasijas, por barril = suma de lo tildado,
  0 tildes = 0 entradas, lote pendiente excluido por defecto, análisis posterior.
- Servidor: `validarDatos` acepta `ordenes_correccion` y frena su borrado masivo.
- Navegador (mock sin login, como `lotes-oc-filtros`): imprimir → aparece
  pendiente → cambiar un análisis → ejecutar registra los números del papel →
  la orden queda ejecutada; anular pendiente libera los lotes; falla de
  `guardar()` no deja ni correcciones ni orden ejecutada.

## Fuera de alcance

- Ejecución parcial / en varios días.
- Editar una orden ya guardada (se anula y se emite otra).
- Órdenes viejas impresas antes de este cambio: no se migran; siguen visibles
  como hoy por su `ot_n` en la tabla.
- Que Otros agregados (TH2, etc.) use el mismo modelo.
- El panel "Correcciones de esta OT" de las OT de trasiego (`vista-ot-correcciones.js`)
  sigue escribiendo directo en la bitácora: no pasa por órdenes guardadas.
