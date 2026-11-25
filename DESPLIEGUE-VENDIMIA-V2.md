# Vendimia V2 - libros editables por periodo

Trabajar exclusivamente con el repositorio privado de desarrollo. El paquete contiene los diez Excel originales, con sus datos de ejemplo, dentro del codigo del Worker. No publicar el repositorio ni los archivos fuente de las plantillas. El Worker entrega los originales solamente tras verificar el permiso de lectura de Vendimia.

## Instalacion y pruebas

Con Node.js 22 o 24, desde el repositorio de desarrollo, conservar .git y copiar el contenido de este paquete encima de la copia de trabajo (previamente respaldada y actualizada). Verificar `git remote -v`: el destino debe ser `https://github.com/catenaaidev/catenainstituto-desarrollo.git`. No usar push --force.

```bash
npm ci
npm run build:vendimia
npm run test:vendimia-libros
npm run tipos
npx tsc --noEmit
npm test
```

El build instala las dependencias del editor en frontend/vendimia, genera su package-lock.json en la primera instalacion y compila el JS/CSS local en public/vendimia/vendor. Incorporar el lock al commit. No se usa CDN en tiempo de ejecucion. Wrangler ejecuta este build antes de publicar.

Verificar manualmente con los diez libros: hojas y orden, editar celda, agregar filas/columnas/hojas, pegar, formulas, exportacion XLSX, impresion, recarga, periodos independientes, desconexion, dos sesiones concurrentes y roles. No publicar hasta completar las pruebas. La exportacion intenta conservar el paquete original si solo cambiaron celdas compatibles; si cambia la estructura o el formato, solicita confirmacion para reconstruir el XLSX. No garantiza objetos Excel heredados, controles VML, formatos avanzados ni paginacion identica. Los originales se conservan intactos. No se ha homologado la interfaz con el navegador ni la exportacion con Excel en este entorno. El motor se eligio sin licencia adicional; la instalacion local fallo por DNS EAI_AGAIN del registro npm. npm test y tsc quedaron bloqueados por dependencias y tipos de Wrangler ausentes. Las pruebas Node con SQLite, R2 y autenticacion simulada pasaron; no equivalen a una prueba del runtime Cloudflare.

## Publicacion exclusiva de desarrollo

Confirmar que wrangler.jsonc y wrangler.dev.jsonc apuntan al Worker catenainstituto-desarrollo, D1 catenainstitute-desarrollo (bab98747-2936-431c-a1c6-f8e333eb5a77), R2 catenainstitute-desarrollo-respaldos. Aplicar la migracion aditiva 0006 solo tras las pruebas y respaldar desarrollo antes de migrar. No modifica las tablas V1.

```bash
npx wrangler d1 migrations apply catenainstitute-desarrollo --remote
 git add .
 git commit -m "Vendimia V2 - libros editables por periodo"
 git push -u origin main
```

URL prevista: https://catenainstituto-desarrollo.besa-junin.workers.dev/vendimia/

## Diseno y limites

Cada periodo tiene fechas elegidas por el usuario, diez copias independientes y posibilidad de crear copias adicionales. Las revisiones son inmutables en R2, con puntero versionado en D1. Si hay un conflicto, se conserva el borrador IndexedDB y se permite guardar otra copia, descargar o abrir la version del servidor. No hay fusion automatica de celdas. El almacenamiento local depende del navegador y de su disponibilidad. Limites: 100 hojas, 20000 filas, 512 columnas, 200000 celdas con contenido y 8 MiB por snapshot. La trazabilidad V1 sigue disponible; las celdas editables no sincronizan automaticamente sus campos con las tablas V1. El flujo enologico es orientativo, sin correcciones automaticas. La duracion no se infiere de la imagen.

No se modifico ni publico el entorno de produccion, ni se cambiaron credenciales.
