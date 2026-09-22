### Task 8 — Reporte

**Estado:** COMPLETO

**Commit:** `1169ae7` en rama `arreglo/perdida-de-ordenes`

**Tests:** 17 test files, 315 tests passed (0 failed)

**tsc --noEmit:** limpio, sin errores

---

**Cómo se resolvió lo de los registros sin identificar**

`idsPerdidos` puede devolver `''` para registros de `inventario` o `tanques` sin `num`, y `'|'` para registros de `revisiones`/`ediciones` sin `num` ni `campo`. Antes de armar `borrados`, se filtran esas cadenas en dos grupos:

- `identificados`: los ids que no son `''` ni `'|'`
- `sinIdentificar`: el conteo de los que sí lo son

Si hay registros sin identificar se agrega una entrada del estilo `"(N sin identificar)"` al array (o como valor directo si todos son anónimos). Así el historial siempre tiene un rastro útil, sin listar cadenas vacías que no dicen nada.

**Qué más se cambió (defecto de revisión)**

`resumen()` pasó a recibir `borrados` ya calculado como tercer parámetro. Las bajas ahora se anotan a partir de los ids reales, no del delta de longitudes: un intercambio (se van 3 órdenes, entran 3) antes producía `"cambios en el mapa"` aunque el freno lo viera; ahora produce `"−3 escaneos"` (o la colección que corresponda).

---

### Task 8 — Reporte de revisión (defecto post-commit)

**Estado:** COMPLETO

**Commit:** `054153c` en rama `arreglo/perdida-de-ordenes`

**Tests:** 17 test files, 316 tests passed (0 failed)

**tsc --noEmit:** limpio, sin errores

**Test nuevo falló con implementación anterior:** SÍ — el assert sobre `detalle` fallaba con `{ inventario: "(5 sin identificar)" }` en vez de `{ inventario: ["(5 sin identificar)"] }`; el assert sobre `resumen` hubiera dado `−1` en vez de `−5`.

**Firma final de resumen():** `function resumen(antes: Estado, despues: Estado): string`

---

**Defecto encontrado**

`resumen()` derivaba las cantidades de bajas a partir de `borrados`, que es una estructura de presentación. Cuando todos los borrados de una colección eran anónimos, `borrados[clave]` era el string `"(N sin identificar)"`. `Array.isArray` devolvía `false` y el resumen anotaba `−1` en vez de `−N`.

**Qué se cambió**

1. **`resumen()` ya no recibe `borrados`**. Las bajas se toman de `contarPerdidas()` — la misma fuente que usa el freno — que ya tiene los conteos exactos de cada colección. Contar y presentar son dos responsabilidades distintas y no deben compartir estructura.

2. **Tipo `borrados` simplificado a `Record<string, string[]>` siempre**. Cuando todos los registros de una colección son anónimos, el array tiene un único elemento `"(N sin identificar)"` en vez de ser un string directo. Esto elimina el tipo mixto `string[] | string` que habilitó la confusión.

3. **Loop de `resumen()` extendido a las 6 colecciones** (`inventario`, `escaneos`, `tanques`, `revisiones`, `ediciones`, `pedidos`). El freno ya las contaba todas; el resumen ahora también las nombra.

4. **Test nuevo agregado**: `'borrados anonimos: el resumen cuenta la cantidad real, no -1'` — verifica que con 5 registros de inventario sin `num`, el `detalle` los agrupe como `["(5 sin identificar)"]` y el `resumen` diga `−5 inventario`.
