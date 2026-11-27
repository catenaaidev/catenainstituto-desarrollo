CIW Desarrollo — integración con Original + corrección de carga
Base: CIW_Desarrollo_Actual.zip (archivo enviado por el usuario).
Origen de mejoras: CIW_Original_Actual.zip.

Instalar solo en CIW Desarrollo. No reemplazar la carpeta ni usar en producción.
1. Descomprimir este ZIP en Descargas/CIW_Sincronizacion.
2. Desde Git Bash en el repositorio de desarrollo:
   node "$HOME/Downloads/CIW_Sincronizacion/instalar.mjs" . --check
   node "$HOME/Downloads/CIW_Sincronizacion/instalar.mjs" .
   git diff --check
3. Compilar y probar:
   npm ci && npm run build:vendimia && npm run tipos && npx tsc --noEmit
   node --test test-local/*.test.mjs
   npm test
4. Agregar solo los archivos del manifiesto:
   node -e 'const fs=require("fs"),cp=require("child_process");const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));cp.execFileSync("git",["add","--",...m.archivos.map(x=>x.ruta)],{stdio:"inherit"})' "$HOME/Downloads/CIW_Sincronizacion/manifest.json"
   git diff --cached --check && git commit -m "CIW - Integrar mejoras de Original y corregir carga" && git push -u origin HEAD
5. Verificar git status --short y que wrangler.jsonc apunta a catenainstituto-desarrollo, con su propia D1 y R2.
   npm run deploy
   Refrescar navegador y probar Lotes > Actual / Todos, Análisis > Cargar análisis, Prensas, Inventario, Movimientos, Correcciones, Vendimia.

Cambios: carga manual individual, edición de mediciones y actualización parcial de Excel/CSV del original; numeración de OT, protección de movimientos ejecutados, techo operativo de SO2 y excepción con permisos y auditoría. Se conserva el objetivo químico independiente del techo de OT. Se mantiene navegación de Desarrollo, formularios de Vendimia e inventarios centralizados.

Datos: ambas bases D1 están disponibles. No son la misma base. No hay cambios de bindings ni migraciones. La lectura validó 702 lotes en Original y 703 en Desarrollo; 337 son de 2026 en cada base y Desarrollo tiene además un lote de 2027. El selector anterior seleccionaba ese año futuro por defecto. Ahora prioriza el año vigente, permite elegir Todos/Actual, conserva selección explícita y muestra el total por año antes de otros filtros. Las lecturas Lotes y Prensas reintentan GET temporales, validan respuesta y muestran un aviso si no cargan. No se ha validado el caso de Oriana en su navegador.
La copia original sigue adelantada: barriles v3821 (2179 registros) vs v3786 (2163), lotes v736 vs v722, prensas v134 vs v132. No se copiaron registros entre bases: debe hacerse una conciliación independiente con respaldo y control de versiones para conservar los datos nuevos de Desarrollo. No se deben conectar ambos Workers a la misma base ni copiar las tablas de usuarios, sesiones o Vendimia. Consultar con Wrangler sin escribir:
   npx wrangler d1 execute catenainstitute-desarrollo --remote --command "SELECT modulo,version,guardado FROM documento"

Validaciones ejecutadas: 47 pruebas node:test aprobadas, comprobaciones directas de motores y sintaxis JavaScript/TypeScript. No equivalen a una compilación completa: npm ci no completó en este entorno y no se ejecutó Vitest completo. No se realizó despliegue ni cambios en Cloudflare. La impresión física sigue fuera del alcance de esta integración.
