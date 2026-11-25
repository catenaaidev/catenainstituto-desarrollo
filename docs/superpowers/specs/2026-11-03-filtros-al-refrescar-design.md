# Filtros que sobreviven al F5 (y sin salto al tablero)

Fecha: 2026-11-03 · Pedido del usuario después del PR #10 (pantalla en la URL).

## Problema

1. **Salto al tablero.** Con `#analisis` en la URL, al apretar F5 se ve primero el
   Panel/Inicio y después la pantalla correcta. Los tres `index.html` traen el
   tablero marcado activo en el HTML, y el navegador lo pinta mientras baja el
   código de la app (Lotes: más de 80 módulos; Prensas: `app.js` al final del body).
   El operario de Barriles además espera a los datos (`aplicarRol`) para ir a su
   sección.
2. **Filtros.** Al refrescar se pierden los embudos, los buscadores, los
   selectores y el orden de columnas.

## Decisiones (aprobadas)

- Los filtros duran **solo en esa pestaña del navegador** (`sessionStorage`).
  Sobreviven al F5 y a Atrás, y se borran al cerrar la pestaña. Otra pestaña
  arranca limpia.
- Se recuerdan: **embudos de columna** (incluidos los rangos mín/máx de Prensas),
  **buscadores**, **selectores y botones de filtro** (mes, tipo, Llenos/Vacíos,
  Mostrar, chips, sub-pestañas) y **orden de columnas**.
- Fuera de alcance: el scroll, los anchos de columna (ya se guardan) y los datos
  de la ficha.

## Diseño

### A. Sin salto al tablero

`shared/pantalla-url.js` corre en el `<head>` sin defer. Si `location.hash` no
está vacío:

- Pone la clase `ciw-restaurando` en `<html>` y un `<style>` con
  `html.ciw-restaurando .view.active, html.ciw-restaurando .panel.activo { visibility: hidden }`.
  Se oculta solo lo activo: la barra y la navegación siguen a la vista.
- Expone `CIWPantalla.restaurada()`, que saca la clase. Cada app la llama apenas
  intentó abrir la pantalla de la URL, haya encontrado una válida o no.
- Tope de seguridad: a los 5 s se saca sola.

Puntos de llamada:

- **Lotes:** después del `mostrarTab` temprano en `app.js`. Si el hash es una
  ficha, después de `irALote` (cuando ya están los datos).
- **Prensas:** al final del bloque de URL en `setupTabs`.
- **Barriles programador:** después de marcar el panel en el arranque.
- **Barriles operario:** se marca la sección temprano, sin esperar los datos. Para
  eso `OP_TITULOS` y `OP_A_PROG` se suben antes del bloque de arranque. Se pone la
  clase `op-<sec>`, el panel activo (`cargar` y `buscar` usan `mapa`) y el
  título. El dibujo con datos sigue en `aplicarRol`.

### B. Filtros en la sesión

**Pieza común:** `shared/filtros-sesion.js`, un script clásico inyectado por el
Worker junto a `pantalla-url.js`. Expone `window.CIWFiltros`:

- `leer(clave, porDefecto)` y `guardar(clave, valor)`: JSON en `sessionStorage`
  con la clave `ciw_filtros:<clave>`. Todo va en try/catch; sin storage, no
  recuerda nada y nada se rompe.
- `borrar(prefijo)`: borra todas las claves que empiezan así. La usan los botones
  Limpiar.
- Funciones puras testeables:
  - `setsAObjeto({k: Set})` → `{k: [..]}`.
  - `objetoASets(obj, claves)` llena los Sets existentes. No reemplaza objetos,
    porque los widgets guardan referencias a esos Sets.

Las claves llevan módulo y pantalla, por ejemplo `lotes:analisis:embudos`,
`prensas:ana:busca` o `barriles:registro:mes`.

**Lotes** (`public/lotes/js/tabla.js` y las vistas):

- `crearFiltroMulti` / `initFiltrosMulti` reciben una `clave` opcional.
- Al iniciar, rellenan los Sets desde la sesión. Cada cambio de un embudo guarda.
- `limpiarFiltrosMulti` borra lo guardado.
- En cada vista, el buscador, los selectores, la sub-pestaña y el orden se leen al
  cargar el módulo (antes del primer dibujo) y se guardan en su handler.
- Vistas: Lotes, Análisis, Movimientos, Orden de muestras, Orden de corrección,
  Registro SO₂, Tablero FML, Agregados, Lista de OT y Agenda.

**Prensas** (`public/prensas/app.js`):

- `crearFiltrosColumnas(cols, base, onChange, clave)` guarda los Sets y los
  `rangos`.
- `setup()` restaura los valores de los inputs y selects, el `filtroLlenado` y los
  `sort*` antes del primer `renderActive`.
- Cada handler guarda.
- Vistas: Lotes, Análisis, Agregados, Riesgo, Degustación, Orden de muestras y el
  `selMes` del Panel.

**Barriles** (`public/barriles/index.html`, pantalla por pantalla):

- `regMes` y `regBuscar` (Registro).
- `conFiltro` y `conBuscar` (Consulta).
- `filtrosCol`, `filtroInv`, `soloRevisar` e `invTipo` (Inventario del programador).
- `escFiltro` (historial del escáner).
- `buscarMapa` y `buscar3d`.

### Reglas

- **Valores fantasma:** un valor guardado de un embudo que ya no está entre las
  opciones se descarta al rearmar las opciones. Una tabla nunca queda vacía por
  un filtro invisible. Los selects (mes, variedad) vuelven a "todos" si el valor
  ya no existe; Barriles ya hace esto en `refrescarOpcionesFiltroCol`.
- **Limpiar filtros** borra también lo guardado de esa pantalla.
- **Llenos/Vacíos** (`shared/filtro-llenado.js`): hoy no se recuerda a propósito,
  porque un filtro olvidado hace pensar que faltan filas. Con "solo esta pestaña"
  el riesgo queda acotado: se guarda en la sesión y se actualiza el comentario.

## Pruebas

- Tests puros de `filtros-sesion.js` (serialización de Sets, prefijos, storage
  ausente) y de la inyección en los tres módulos.
- La suite completa en verde.
- En el navegador con el servidor de prueba de los respaldos:
  - F5 con un hash: no aparece el tablero.
  - En cada app: poner un embudo, un buscador, un selector y un orden, apretar F5,
    y ver los mismos filtros y la misma cantidad de filas.
  - Limpiar filtros, apretar F5, y ver la pantalla limpia.
  - En una pestaña nueva, la app arranca limpia.
