# CIW Desarrollo V7 — Vendimia por lote y vasija

Base: V6 (commit 1ee6af1). Solo entorno de desarrollo: Worker `catenainstituto-desarrollo`, D1 `catenainstitute-desarrollo`, R2 `catenainstitute-desarrollo-respaldos`.

## Qué cambió

**Inicio.** Se retiró el panel general “Planillas de trabajo”. Quedan la precarga, el listado de lotes con filtros, “Órdenes pendientes” y, para administradores, “Permisos e impresión”.

**Panel del lote** (tocar la tarjeta; no hay que elegir período). Encabezado con lote, vino/variedad, vasijas, recepción, estado y **próxima acción por vasija**. Pestañas:
- **Resumen**: una tarjeta por vasija, con su próxima acción, la evaluación de pH, el fin de FA y sus OT. Muestra los datos de identificación faltantes y un botón para completarlos.
- **Análisis inicial**: formulario para tablet con kg recibidos y procesados, bins, merma y su unidad, tipo de vasija, fecha y hora de muestreo, Brix, pH, AT, NFA, SO₂T, ácido málico, temperatura, responsable y observaciones. Sigue la revisión técnica: el técnico confirma que revisó kilos, mermas y análisis, y elige entre **OT de TH2** (producto, dosis, cantidad, unidad, base de cálculo obligatoria, instrucciones y responsable) o **“No requiere corrección”** con motivo. Después vienen el análisis posterior y **“Confirmar pH para siembra”** con la receta de siembra y la de nutrientes.
- **Órdenes de trabajo**: estado de la OT y de su impresión, documento imprimible, reimpresión con el mismo número, ejecución (fecha y hora real, producto, cantidad, lote de insumo, vasija, observaciones, completa o parcial), inicio, incidencias, aprobación o modificación con motivo (genera una nueva versión y la reimprime), cancelación y trazabilidad completa.
- **Control**: carga de fecha y hora, Brix, temperatura, azúcar, pH, Az. Red., AV y operación (P, PS, J, C, DE, RC, RA, Rcm, C-C de la OT C001) con su tiempo. Historial con gráfico y tabla que separa la fecha de medición de la fecha de carga, y agregados ejecutados separados de los planificados.
- **Movimientos**: el técnico solicita trasiego, división, unión, corte o bajada a barricas; el operario los ejecuta desde la OT. La ubicación del lote cambia **solo** cuando se confirma la ejecución.
- **Fin FA y descube**: evaluación de Az. Red. < 1,64, estricta (1,64 no cumple), marcada como **regla provisoria**. Después vienen la confirmación técnica y la OT de descube o desvinado. La FML se sigue en Lotes (Tablero FML).
- **Documentos e historial**: las planillas originales, las copias de trabajo, la exportación a Excel y el historial de versiones, sin cambios.

**Reglas que valida el servidor.**
- Criterio de pH tomado de *Criterio de corrección Rev 01 2021.xlsx*, versión `ph-rev01-2021`, con 3 etapas y “Límite máx.” separado de “Esperado”. Verde = pH ≤ límite máximo; rojo = lo supera; gris = falta el dato o la variedad no tiene criterio. Cada decisión guarda la versión del criterio usada.
- No se calcula ácido desde el pH: la OT de TH2 exige una base de cálculo aprobada.
- Aprobar una OT no equivale a ejecutarla. El pH para siembra exige un análisis tomado **después** de ejecutar el TH2.
- Una ejecución parcial no habilita el paso siguiente.
- **Nutrientes**: se programan a la hora **real** de ejecución completa de la siembra + 24 h. Un cron cada 5 minutos los emite y los manda a imprimir una sola vez, aunque todas las tablets estén cerradas. Si falta la receta, la OT queda bloqueada y no se imprime incompleta. Corregir la hora de la siembra reprograma los nutrientes.
- Doble clic, reintentos y reconexiones no duplican nada: cada operación lleva un identificador único y el servidor no la aplica dos veces.
- Las correcciones de un registro guardan el valor anterior, el autor y la fecha, y controlan la edición simultánea.

**Permisos.** Se agregan **técnico** (aprueba) y **operario** (ejecuta) sin cambiar los roles actuales. El admin tiene todo; los editores ejecutan órdenes por defecto; un operario no puede aprobar. Se asignan en “Permisos e impresión”.

**Sin conexión.** Los análisis, los controles y las ejecuciones cargados sin señal quedan en la tablet marcados como **PENDIENTE de sincronizar**, y se envían solos al volver la conexión.

**Demostración.** Un administrador puede marcar un lote como demostración. Sus OT llevan la leyenda “DEMOSTRACIÓN — NO EJECUTAR” y no entran a la cola de impresión.

**Impresión.**
- La cola es persistente y separa los estados: en cola → enviado a la impresora → impresión confirmada por una persona, o error. “Enviado” no significa que haya salido en papel.
- El agente local `scripts/agente-impresion.mjs` corre en una PC de la bodega: pide trabajos por HTTPS, genera el PDF con Edge o Chrome y lo envía por RAW 9100. La impresora no queda expuesta a Internet.
- La alternativa manual es el botón “Imprimir / ver documento”.

## Pruebas

- `test/vendimia-flujo.test.ts` (6 pruebas):
  - criterios de pH: verde, rojo y gris; el valor esperado se informa aparte del límite;
  - fin de FA con 1,63, 1,64 y 1,65;
  - recorrido completo: precarga → análisis → pH fuera de criterio → revisión → TH2 → ejecución → doble confirmación → análisis posterior → siembra → ejecución parcial → ejecución completa → +24 h → bloqueo por receta faltante → aprobación → emisión e impresión única;
  - vasijas separadas; descube solo después de confirmar el fin de FA; un movimiento solicitado no cambia la ubicación y uno ejecutado sí;
  - correcciones con valor anterior y control de concurrencia;
  - lote de demostración sin impresión; el agente exige token.
- Suite completa: 168 archivos de prueba aprobados. `npx tsc --noEmit` sin errores. `npm run test:vendimia-libros`: 10/10.
- Navegador local en tamaño tablet (1024 × 768), sobre un lote de prueba: análisis inicial, revisión técnica con TH2, ejecución desde la OT, análisis posterior, confirmación de pH, siembra ejecutada desde “Órdenes pendientes”, y nutrientes programados para el día siguiente y bloqueados por receta.

## Pendiente o con configuración externa

- **Impresión automática**: no se probó con una impresora real.
  1. Cargar en el Worker el secreto `IMPRESION_TOKEN` (`npx wrangler secret put IMPRESION_TOKEN`).
  2. Dar de alta la impresora (IP, RAW 9100) como **activa** y **automática**.
  3. Correr el agente en una PC de la bodega con Edge o Chrome.

  El agente todavía no soporta IPP: hay que usar RAW 9100.
- **Regla de fin de FA**: la denominación y la unidad (Az. Red., g/L) están por confirmar. Está marcada como provisoria en la tabla `vend_criterios`.
- **Planillas originales**: los formularios cubren los campos de trabajo de las planillas de tintos y blancos, B005, C001 y D006. Las planillas originales siguen disponibles en Documentos, pero los datos cargados en formularios no se vuelcan automáticamente a esas planillas. El “valor esperado” de pH se muestra; no se usa para decidir.
- **Probar con usuarios reales**: el modo sin conexión en una tablet real y los permisos de operario y técnico con usuarios reales.

## Instalar y desplegar (cmd.exe, una línea por vez)

    cd "D:\Proyectos\Catena Instituto\catenainstitute desarrollo"
    npm ci
    npm run build:vendimia
    npm run tipos
    npx tsc --noEmit
    npm run test:vendimia-libros
    npm test
    npx wrangler d1 migrations apply catenainstitute-desarrollo --remote
    git add -A
    git commit -m "CIW V7 - Vendimia por lote: panel, OT con aprobacion y ejecucion, nutrientes 24 h, impresion"
    git push origin main

Workers Builds publica solo al hacer push. Si no lo hace: `npx wrangler deploy`. Verificar que `/vendimia/` muestre “V7 · 2026-11-26”. La migración 0010 solo crea tablas nuevas.
