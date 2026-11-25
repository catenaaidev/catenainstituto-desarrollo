# CIW Desarrollo V6 — Vendimia conectada

Base: V5 (commit 29f0982). Solo entorno de desarrollo (`catenainstituto-desarrollo`, D1 `catenainstitute-desarrollo`, R2 `catenainstitute-desarrollo-respaldos`).

## Qué cambió
- **Precargar lote**: solo los 11 campos de Información ID (LOTE … ORIGEN). Se guarda solo como borrador en el servidor apenas el LOTE tiene 5 dígitos; "Confirmar precarga" lo da de alta (o corrige) en **Lotes** con compare-and-swap, historial y auditoría. Sugerencias y autocompletado salen del documento de Lotes (no de Vendimia). Si Lotes está vacío, se avisa; no se inventan registros.
- **Numeración AANNN en el servidor** (`/vendimia/api/siguiente`): mira Lotes + números reservados (`vend_numeros`, PRIMARY KEY = freno de concurrencia). Valida 5 dígitos, evita duplicados, reinicia por año y avisa al llegar a 999.
- **Inicio sin selector de períodos**: pasos guiados, lotes con estado, buscador y filtros (año, estado, variedad, distrito, proyecto, viñedo, vasija, responsable, planilla trabajada, fecha). Las planillas se ven desde el primer ingreso.
- **Ficha del lote**: circuito de 12 etapas (manual; "No corresponde" para lo que no aplica; fin de FA → FML o pie de cuba), botón "Abrir planilla" por etapa, finalizar/reabrir (reabrir solo admin; un lote finalizado deja sus planillas en solo lectura, también en el servidor).
- **Fecha de recepción**: no está en la precarga. Al abrir molienda/tintos/blancos se completa con la fecha de Mendoza (editable, se guarda en el servidor). En la copia de molienda se fija la fecha en lugar de `=TODAY()` para que no cambie al reabrir; la plantilla original no se toca.
- **Planillas conectadas** (`vend_hechos`): al guardar Control de Brix y Temperatura, Tintos (tabla diaria, análisis iniciales, agregados en molienda) y las OT B005 / Nutrientes / SO₂, el servidor extrae los datos **por encabezados**, no por coordenadas (tolera filas/columnas insertadas). En Tintos, "Traer Brix y temperatura" trae las mediciones del mismo lote **y vasija** por fecha; nunca pisa fórmulas ni valores distintos: muestra el conflicto para elegir.
- **Seguimiento de fermentación**: gráfico de Brix y temperatura por vasija (solo datos reales), tablas de mediciones, análisis, agregados, nutrientes y SO₂.
- Estados visibles: Guardando, Guardado, Borrador, Sin conexión, Cambios pendientes, Conflicto, Finalizado. Versión visible: "V6 · 2026-11-25".

## Pruebas ejecutadas
- `npm run test:vendimia-libros`: 10/10 (incluye 3 nuevas de V6).
- `npx vitest run test/vendimia-v6.test.ts`: 7/7 (precarga, 11 campos, numeración, duplicados, concurrencia, alta y corrección en Lotes, extracción por encabezados, Brix→Tintos sin mezclar vasijas, recepción, etapas, finalizado).
- `npx tsc --noEmit`: sin errores. `npm test`: 2.524 pruebas en 167 archivos, todas aprobadas.
- Navegador (servidor local): precarga con siguiente número, autoguardado, confirmación, apertura de molienda con fecha de recepción, ficha y circuito en celular y escritorio.

## Limitaciones y pendientes
- **Impresión automática de OT por IP: no implementada** en V6 (requiere un agente local en la red de la bodega; no se agregó infraestructura).
- Planilla de Blancos: su tabla diaria combina Brix/°C/Az en una columna; no se conecta automáticamente.
- Las fechas de Control de Brix y de las OT B005 son `TODAY()` o incompletas: esas mediciones se fechan con el día del guardado (se indica "(carga)").
- El motor web no reproduce controles de formulario heredados ni la configuración binaria de impresora (ya documentado en V2–V5).
- La revisión integral de Prensas, Barriles, Lotes y Órdenes no se hizo en esta entrega.

## Actualizar y desplegar (cmd.exe, una línea por vez)
    npm ci
    npm run build:vendimia
    npm run test:vendimia-libros
    npm run tipos
    npx tsc --noEmit
    npm test
    npx wrangler d1 migrations apply catenainstitute-desarrollo --remote
    git add -A
    git commit -m "CIW V6 - Vendimia conectada"
    git push origin main

La migración 0009 solo crea tablas nuevas. Si Workers Builds no publica solo: `npx wrangler deploy`. Verificar que /vendimia/ muestre "V6 · 2026-11-25".
