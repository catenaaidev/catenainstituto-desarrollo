# Sección "Órdenes de trabajo" en la plataforma — diseño

Fecha: 2026-11-03 · Rama `feat/seccion-ordenes` · Estado: aprobado en chat, pendiente de revisión del spec escrito

## Problema

Los usuarios reportan que cuesta encontrar las órdenes de trabajo. Hoy están
repartidas por las apps:

| App | Orden | Dónde está hoy | ¿Se guarda? |
|---|---|---|---|
| Lotes | OT de movimientos (trasiego, corte, corte+achique, traslado) | Movimientos → Órdenes de trabajo | Sí, `ordenes_trabajo` |
| Lotes | OT suelta de un movimiento (modal viejo) | Movimientos → Historial | Solo como fila de `movimientos` |
| Lotes | Orden de corrección SO₂ | Correcciones → Orden de corrección | Sí, `ordenes_correccion` (pendiente → ejecutada) |
| Lotes | Orden de muestras / Microbiología | Más → Orden de muestras | No (solo `muestreos_barriles`) |
| Lotes | Otros agregados ("Armar orden") | Correcciones → Otros agregados | No (solo `analisis[].agregados`) |
| Prensas | Orden de muestras | vista `#v-orden` | No |
| Prensas | Rellenos | vista `#v-relleno` | No |
| Prensas | Acción rápida | bloque dentro de Degustación | No |
| Prensas | OT de Agregados | pestaña Agregados | No (la tabla `agregados` sí) |

## Decisiones del usuario

1. La sección es una **4ª tarjeta del portal** ("Órdenes de trabajo"), no una pestaña de Lotes.
2. **Todas** las órdenes pasan a quedar guardadas, también las de solo papel.
3. Las órdenes **se sacan del todo** de sus lugares actuales (sin enlace de transición).
   Excepción: **Inventario de tanques** (y su "🖨 OT inventario") **se queda** en Lotes → Movimientos.
4. Enfoque **A**: `/ordenes/` lista y busca; el armado y la hoja de cada orden se siguen
   dibujando con el código de su app, en un **modo órdenes**.
5. Las órdenes de solo papel se cierran con un botón **"Marcar ejecutada"**.
6. Barriles queda afuera (sus "órdenes" son escaneos).
7. Se hace en **3 entregas**, cada una publicable sola.

## Pantalla `/ordenes/`

Estética "Piedra y tinta" (`public/shared/estilo.css`), barra de plataforma común.

**Portada:** tres tarjetas grandes — **Nueva orden**, **Pendientes** (con el conteo) e
**Historial**. Al entrar en una, una barra chica permite cambiar entre las tres y volver
a la portada. La sub-vista elegida va en la URL (`/ordenes/?v=nueva|pendientes|historial`)
para que se pueda copiar y recargar.

**Nueva orden**
- Buscador grande "¿Qué orden vas a hacer?" con foco inicial; `/` o Ctrl+K vuelven a él.
- Debajo, los tipos en **dos columnas Prensas | Lotes**, cada uno como tarjeta chica
  (nombre + una línea de para qué sirve):
  - Prensas: Orden de muestras, Rellenos, Acción rápida, Agregados.
  - Lotes: Trasiego, Corte, Corte + achique, Traslado, Orden de muestras, Microbiología,
    Corrección SO₂, Otros agregados.
- El buscador filtra las tarjetas por nombre **y por sinónimos** (catálogo fijo en un
  módulo puro, ej.: "so2", "sulfuroso" → Corrección SO₂; "barrica a tanque" → Trasiego;
  "mezcla" → Corte). Ignora mayúsculas y tildes. ↑↓ + Enter abren la primera/seleccionada.
- Elegir un tipo abre su armador en modo órdenes (`/lotes/?orden=nueva:<tipo>`).
- Solo se muestran las columnas de los módulos donde el usuario es **editor o admin**;
  un lector no ve la tarjeta "Nueva orden".

**Pendientes / Historial**
- Lista de los dos módulos con etiqueta Prensas/Lotes por fila: N°, tipo, fecha
  (📅 si es programada), lotes (resumidos), estado, quién la emitió. Más nuevas arriba.
- Filtros: módulo, tipo, rango de fecha, y un campo de texto por N° o lote.
- Pendientes = `estado` pendiente; Historial = ejecutada/anulada (solo lectura).
- Abrir una fila → `/<modulo>/?orden=<id>` en modo órdenes.
- Respeta el selector de años de la plataforma igual que hoy la lista de OT de Lotes
  (las OT se ven con cualquier año prendido, PR #9).

## Modo órdenes (en Lotes y en Prensas)

Con `?orden=nueva:<tipo>` o `?orden=<id>` la app:
- arranca normal (login, datos, autoguardado, en vivo, Ctrl+Z, fusión 409);
- esconde su barra de pestañas y muestra arriba
  "← Órdenes de trabajo · Nueva · Corte" o "OT 0945 · Trasiego · pendiente";
- muestra solo el armador o la hoja de esa orden, con sus acciones de siempre
  (imprimir, confirmar, ejecutar, marcar ejecutada, editar);
- al terminar ofrece "Volver a Órdenes" (vuelve a `/ordenes/` con la sub-vista y filtros
  que tenía, guardados en la URL de retorno).

La lógica de cada armador **no se mueve de archivo**: se mueve la puerta de entrada.
Un `?orden=` con id inexistente muestra un aviso y el botón de volver.

## Datos

**Se mantienen sin cambios:** `lotes.ordenes_trabajo` y `lotes.ordenes_correccion`.

**Sección nueva `ordenes_hojas`** en el documento de Lotes y en el de Prensas
(agregar a `SECCIONES_LOTES` y `SECCIONES_PRENSAS` de `src/prensas/validacion.ts`,
fusión por `id`, freno de borrado masivo como las demás):

```
{ id, tipo, ot, fecha, estado: 'pendiente'|'ejecutada'|'anulada',
  emitida_por, emitida_el, ejecutada_por, ejecutada_el,
  lotes: [...], hoja: { ...foto de lo impreso... }, pdf }
```

- Se crea **al imprimir** (igual que la Orden de corrección SO₂); armar no registra nada.
- `hoja` guarda la foto exacta del papel (filas, dosis, barriles sorteados, textos
  editados), así reabrir la muestra igual que lo impreso aunque los análisis cambien.
- **Marcar ejecutada** se hace una sola vez y deja quién y cuándo. Antes de ejecutar
  se compara `/version` con la local, como en la corrección SO₂.
- **Otros agregados (Lotes):** como la corrección SO₂ — al marcar ejecutada se escriben
  los `analisis[].agregados` con las dosis del papel (no editables). Deja de registrarse
  al armar.
- **Agregados (Prensas):** hoy la orden se arma *desde* la tabla `agregados` ya cargada;
  eso se mantiene (la tabla sigue siendo la fuente) y "Marcar ejecutada" solo cierra la orden.
- **N° de OT:** Prensas toma número de la misma serie de la carpeta OneDrive que Lotes
  (`numero-ot.js` / `carpeta-ot.js`: principal 0xxx, B para agregados), con el mismo
  re-chequeo antes de emitir. `numerosWeb` pasa a mirar también `ordenes_hojas`.

**Endpoint nuevo `GET /ordenes/api/lista`** (Worker): lee el documento de cada módulo en
el que el usuario tiene rol, y devuelve solo resúmenes normalizados:

```
{ modulo, id, fuente: 'ordenes_trabajo'|'ordenes_correccion'|'ordenes_hojas',
  tipo, numero, fecha, programada, estado, lotes: [...], emitio }
```

No baja los documentos enteros al navegador (Lotes pesa ~3,9 MB). OT huérfanas se
filtran con la misma regla que hoy (`filtrarOrdenes` con `movimientos`).

**Rutas y permisos:** `/ordenes/` se sirve si el usuario tiene rol en prensas **o** lotes
(si no, vuelve al portal). No hay rol nuevo ni migración: los permisos son los de cada
módulo. `window.CIW` en `/ordenes/` lleva `modulos` para decidir columnas y botones.
El portal (`public/index.html`, array `MODULOS`) suma la tarjeta con su forma de puntos
(una hoja de orden con renglones); `public/shared/barra.js` suma "Órdenes".

## Qué se saca de cada app

**Lotes**
- Movimientos: sub-pestaña "Órdenes de trabajo". Quedan Historial, Mermas,
  Inventario de tanques. El modal viejo de movimiento suelto (`_abrirModalOT`)
  **se queda**: ya no emite OT, solo confirma movimientos sueltos pendientes.
  El 🖨 del Historial en una fila con OT lleva a esa OT en modo órdenes.
- Agenda: "Emitir OT" abre el formulario arriba de la Agenda y, una vez guardada
  la OT, pasa a ella en modo órdenes.
- Más → Orden de muestras: se va.
- Correcciones → Orden de corrección: se va. **Se queda** el Registro de corrección de SO₂
  (historial de lo aplicado); ejecutar una pendiente se hace desde Pendientes.
- Otros agregados: se va "Armar orden"; se queda la bitácora de lo aplicado.

**Prensas**
- Vistas Orden de muestras y Rellenos; bloque Acción rápida de Degustación; OT de
  Agregados de la pestaña Agregados. Se queda la tabla de agregados.

## Entregas

1. **Sección + Lotes con lo que ya se guarda.** Portal, barra, `/ordenes/` con las 3
   tarjetas, Nueva orden (solo tipos de Lotes ya guardados: Trasiego, Corte, Corte+achique,
   Traslado, Corrección SO₂), Pendientes, Historial, endpoint, modo órdenes en Lotes.
   Se saca de Lotes: Movimientos → OT, modal viejo, Orden de corrección.
2. **Lotes: muestras, microbiología y otros agregados** pasan a `ordenes_hojas` con
   Marcar ejecutada; se suman a Nueva orden y se sacan de su lugar viejo.
3. **Prensas:** `ordenes_hojas`, número de la carpeta, modo órdenes, sus 4 tipos en
   Nueva orden; se sacan de Prensas.

## Pruebas

- **Puras (vitest):** catálogo de tipos + búsqueda con sinónimos y tildes; normalización
  de resúmenes del endpoint (cada fuente, huérfanas, estados); armado de filas de
  `ordenes_hojas`; marcar ejecutada (una sola vez, agregados de Lotes escritos con las
  dosis del papel); `numerosWeb` contando `ordenes_hojas`.
- **Worker:** `/ordenes/api/lista` solo devuelve módulos con rol; 401 sin sesión;
  `/ordenes/` redirige al portal sin rol en prensas ni lotes; validación acepta
  `ordenes_hojas` y le aplica el freno de borrado masivo.
- **Navegador** (preview local con mock, como las entregas anteriores): portada →
  Nueva orden → buscar "so2" → Enter abre la corrección en modo órdenes → imprimir →
  aparece en Pendientes → ejecutar → pasa a Historial. Verificar que las pestañas
  viejas ya no muestran órdenes y que Inventario de tanques sigue en Movimientos.
- Toda la suite (`npx vitest run`) y `tsc --noEmit` en verde antes de cada merge.

## Publicación

Push a `main` = producción (Workers Builds). Cada entrega va en su rama/PR, se verifica
local, y se mergea **solo con OK del usuario**. Como se sacan pantallas que la gente usa
a diario, avisar al equipo el día que sale cada entrega dónde quedó cada orden.

## Fuera de alcance

- Barriles y sus escaneos.
- Unificar la estética de las hojas A4 entre Prensas y Lotes (`.orden-hoja` duplicado).
- Migrar órdenes de papel viejas: solo existen las que se impriman desde la entrega
  correspondiente.
