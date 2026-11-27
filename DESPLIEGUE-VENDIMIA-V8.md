# CIW Desarrollo V8 — Formularios oficiales de Vendimia

Base exacta: commit `f4636406429eca7603d493dbeca8d813db09f735` del ZIP CIW_V7_actual.zip. Entrega de integración para validación en desarrollo, no desplegada. No reemplazar producción. No se modifican D1/R2 ni sus migraciones existentes.

## Cambios

- Nuevo acceso «1 · Ingreso y molienda», formularios Blanco y Tinto con identificación, chequeos, siete destinos, bins, transporte, SO2, mermas, controles y firmas. Total de bins replica SUM: valores numéricos se suman; transportes textuales no. Se conservan fórmulas internas de total en XLSX.
- Las pestañas de análisis, aprobación, control, movimientos y órdenes reutilizan V7. Análisis añade número de pesada, NPA (separado de NFA; unidad pendiente) y litros estimados (manual; no se dispone de fórmula aprobada).
- Fin FA: las OT existentes de desvine/descube permiten abrir su formulario convencional o ROLL, incluyendo registros de sanitización. La numeración, lote, vasija y destino parten de la OT existente. No emite ni ejecuta otra OT; no debe usarse para reemplazar su aprobación/ejecución. La cantidad solo se precarga como litros si la unidad de la orden es L.
- Los cuatro XLSX originales se mantienen byte por byte en `src/vendimia/plantillas-flujo-data.ts`. El mapeo web está en `public/vendimia/formularios-flujo.js`. Los datos se guardan con el mecanismo versionado D1/R2 de los libros, con control de concurrencia y borrador local; una copia por lote/modelo o por OT/modelo, creada solo cuando se abre. No hay migración nueva: usa `vend_libros` y `vend_libro_versiones` existentes. No hay sincronización automática adicional entre las copias históricas V7 y las nuevas plantillas; las OT de desvine y los formularios documentales tienen registros diferentes y no deben considerarse una única fuente de ejecución.
- Los documentos históricos de un lote quedan disponibles para consulta, exportación y revisiones; el trabajo diario va por los formularios nativos. Los libros antiguos no se borran ni se migran. Los archivos anteriores sin ficha siguen accesibles. Las siete secciones originales siguen presentes y se agrega ingreso.
- La exportación de las cuatro plantillas nuevas usa el paquete OOXML original y modifica valores de celdas, manteniendo estilos, imágenes, márgenes, hojas y objetos. Se rechaza una reconstrucción si no se puede conservar el paquete. Las fechas de recepción quedan fijas en lugar de TODAY; el vínculo externo VLOOKUP de C8 en desvine se sustituye por la identificación CIW del lote. Las otras fórmulas y rótulos se conservan y Excel debe recalcularlas. Los ejemplos de campos operativos se limpian al crear una copia. El original archivado conserva todos sus datos.

## Impresión: límite de esta entrega

El botón «Descargar para impresión fiel» genera XLSX con el diseño original, no una captura del formulario. Puede imprimirse desde Excel o convertirlo a PDF con una estación Windows con Excel instalado. No se comprobó el documento final en Excel ni impresora física; la coincidencia visual exacta todavía debe verificarse. No se ha conectado la impresión automática V7 al XLSX oficial: la cola sigue usando el documento HTML existente. No se afirma que el flujo automático imprima estos cuatro modelos con fidelidad exacta. No sustituir el agente ni cambiar su configuración sin probarlo. Las firmas se mantienen como campos de responsables/espacios de firma; no se simulan firmas digitales.

## Verificación efectuada

- Node 22.16 con `NODE_OPTIONS=--experimental-strip-types npm run test:vendimia-libros`: 14 pruebas, 14 aprobadas. Incluye las 10 anteriores y 4 nuevas (hashes, mapeos, fórmulas, datos de ejemplo, asociación OT, idempotencia, permisos y aislamiento por lote).
- `node --check` para JS modificado y transpilación TypeScript de los tres archivos TS nuevos/modificados con TypeScript global: sin errores sintácticos.
- No se completó `npm ci` en este entorno (caché incompleta/descargas sin finalizar). Por tanto, no se ejecutó el build del editor, `tsc --noEmit`, suite Vitest/Workers completa, prueba de navegador ni impresión real. Ejecutar los siguientes comandos antes de desplegar.

## Instalar y desplegar en el repositorio de desarrollo

Descomprimir el ZIP en una carpeta separada. Desde Git Bash en el repositorio existente (`main` sobre f463640 o una versión compatible), crear rama de prueba y copiar los archivos del ZIP sin reemplazar `.git`. Preferir el parche adjunto dentro del proyecto `CIW_V8.patch` si está incluido. No copiar `node_modules` ni archivos de credenciales.

    git status --short
    git switch -c vendimia-v8-formularios
    git apply --check "$HOME/Downloads/CIW_V8.patch"
    git apply "$HOME/Downloads/CIW_V8.patch"
    git diff --check
    npm ci
    npm run build:vendimia
    npm run tipos
    npx tsc --noEmit
    npm run test:vendimia-libros
    npm test
    npm run dev

En Node 22.16 usar `NODE_OPTIONS=--experimental-strip-types npm run test:vendimia-libros`; Node 24 no suele necesitarlo. Probar un lote demo y confirmar que no envía impresiones productivas. Probar los cuatro formularios, volver al resumen y volver al formulario, edición concurrente y exportación. Verificar que los totales y rótulos estén correctos al abrir el XLSX en Excel. No desplegar si falla alguna comprobación.

Una vez aprobado en desarrollo:

    git add public/vendimia src/vendimia frontend/vendimia scripts test-local docs DESPLIEGUE-VENDIMIA-V8.md
    git commit -m "CIW V8 formularios oficiales de vendimia"
    git push -u origin vendimia-v8-formularios
    npm run deploy

El wrangler.jsonc existente apunta al Worker `catenainstituto-desarrollo`. Confirmar su nombre y bindings antes de desplegar. No aplicar migraciones nuevas. No se despliega a producción.
