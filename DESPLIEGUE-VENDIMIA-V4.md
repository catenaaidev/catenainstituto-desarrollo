# Vendimia V4: Información ID

- Lee el documento real mediante GET /lotes/api/datos, con permisos existentes de Lotes. No crea un segundo maestro. Si la base de desarrollo no tiene lotes precargados, no aparecen registros hasta importarlos en desarrollo.
- Alta de lote nuevo mediante POST /lotes/api/datos y control de versión del documento existente. Propone AANNN, máximo del año + 1 (hasta 999). La creación del maestro y la ficha son operaciones separadas: si falla la ficha, el lote creado queda disponible en Lotes para seleccionarlo nuevamente.
- Los datos de identificación de un lote existente pueden editarse en la ficha de recepción, pero esas modificaciones no alteran automáticamente el maestro de Lotes. Se conserva una copia histórica en informacion_id. La sincronización hacia celdas sigue limitada a las equivalencias verificadas de V3.
- Borrador del formulario en localStorage por usuario y ficha; Guardar y continuar persiste en D1. Guardado automático de libros V3 conservado. No equivale a autosave servidor del formulario antes del primer guardado.
- Migración aditiva 0008_vendimia_informacion_id.sql. No modifica las tablas de Lotes. No elimina registros.
- Verificar permisos de lectura de Lotes y escritura para dar de alta un lote nuevo. No se amplían permisos.
- Pruebas locales: npm run test:vendimia-libros. Pendiente validar la UI real y ejecutar suite completa y compilación de FortuneSheet.

## Publicación (solo desarrollo)
Copiar archivos conservando .git. Verificar wrangler.jsonc y remote.

    npm ci
    npm run build:vendimia
    npm run tipos
    npx tsc --noEmit
    npm run test:vendimia-libros
    npm test
    npx wrangler d1 migrations apply catenainstitute-desarrollo --remote
    git add .
    git commit -m "Vendimia V4 - Informacion ID desde Lotes"
    git push -u origin main

Worker: catenainstituto-desarrollo. D1: bab98747-2936-431c-a1c6-f8e333eb5a77.
