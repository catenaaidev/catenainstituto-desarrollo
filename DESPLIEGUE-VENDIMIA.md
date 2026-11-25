# CIW Desarrollo — Vendimia, primera integración funcional

Base: versión del 18/11/2026 (ZIP (2)). No se modificaron los motores originales de Lotes, Barriles, Prensas ni Órdenes. Vendimia tiene API propia, permisos de módulo, tablas separadas, ficha, registros anexados, saldo por vasija/unidad, historial cronológico e impresión del navegador. Los criterios son referencias, no instrucciones automáticas de dosificación.

## Estado y límites
- Validado localmente: migraciones SQLite 0001–0005, pesaje, distribución, movimiento con rechazo por saldo, auditoría; sintaxis JavaScript.
- `npm test` no pudo arrancar (vitest no instalado); `npx tsc --noEmit` no pudo completar (tipos Worker y pool ausentes). `npm ci --offline` falló por paquete zod no disponible en caché. No es una versión certificada ni publicada.
- Pendiente: homologar todas las fórmulas/formatos originales y casillas, documentos PDF idénticos, checklist global recurrente y su cierre, filtros adicionales, integración de maestros de vasijas/usuarios/órdenes entre módulos, edición versionada y auditoría de cambios, recuperación de borradores, prueba de concurrencia real, backup específico de Vendimia. Los registros actuales son de solo anexado para evitar sobrescritura. El saldo contabiliza kg y L por separado, no convierte ni estima rendimiento. Los movimientos operativos sin traslado se anotan en mediciones; los traslados deben tener cantidad y unidad. No importar registros de ejemplo como datos reales.
- `docs/vendimia-fuentes.md` contiene inventario de celdas con fórmulas, no una validación de todos los controles incrustados. Mantener privado el repositorio: los originales incluyen ejemplos y datos internos.

## Recursos aislados
Desde la raíz, con Node 24 y Wrangler autenticado en la cuenta correcta:

```bash
npm ci
npx wrangler login
npx wrangler d1 create catenainstitute-desarrollo
npx wrangler r2 bucket create catenainstitute-desarrollo-respaldos
```
Si ya existen, no crear duplicados: verificar en Cloudflare sus identificadores. En **ambos** `wrangler.jsonc` y `wrangler.dev.jsonc`, sustituir `00000000-0000-0000-0000-000000000000` por el UUID de la base **de desarrollo**, nunca el de producción. Los nombres del Worker, base y bucket ya están separados. No copiar sesiones, contraseñas ni datos productivos sin autorización. Una base nueva está vacía; cambiar inmediatamente la clave inicial admin/1234 mediante pruebas locales antes de exponerla, y restringir acceso de red/Cloudflare Access al entorno antes de publicar. Verificar acceso con usuario lector/editor.

```bash
npm run tipos
npx tsc --noEmit
npm test
npm run migrar:local
npm run dev:sin-ia
```
Solo después de aprobar tests y revisar seguridad, aplicar y publicar en el Worker de desarrollo:

```bash
npx wrangler d1 migrations apply catenainstitute-desarrollo --remote
npx wrangler deploy --config wrangler.jsonc
```
URL esperada: https://catenainstitute-desarrollo.besa-junin.workers.dev. No se verificó que exista. Crear los permisos Vendimia desde Administración. No conectar un repositorio a Workers Builds sin confirmar que apunta al Worker de desarrollo. El workflow heredado verifica tests, no publica por sí mismo. No ejecutar instrucciones antiguas de DESPLIEGUE.md.

## Git
Extraer el ZIP en carpeta aparte. Copiar su contenido al clon del repositorio privado de desarrollo (sin copiar .git ni borrar archivos no relacionados). Comprobar `git remote -v` y `git status`. Si el remoto apunta al proyecto original, ejecutar `git remote set-url origin https://github.com/catenaaidev/catenainstituto-desarrollo.git`. No usar force push. Si el repo de destino ya tiene commits, clonar primero y copiar sobre ese clon, revisar diff, commit y push.
