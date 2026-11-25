# Vendimia V3 - ingresos y datos compartidos (desarrollo)

Se mantiene la base D1 de desarrollo (bab98747-2936-431c-a1c6-f8e333eb5a77), Worker catenainstituto-desarrollo y R2 de desarrollo. No se modifica producción. Aplicar 0007 antes de publicar.

- Inicio con catálogo de diez originales, dos copias de la OT de agregados para nutrientes y SO2, ingreso e historial. Cada ingreso crea doce libros separados asociados a un espacio interno; los espacios V2 siguen accesibles desde el historial.
- Fecha inicial de recepción de Mendoza, editable. Sugerencias a partir de ingresos guardados (no maestros de otros módulos). Seleccionar lote completa campos vacíos. Ficha central versionada, cambios por CAS.
- En Tintos se precarga recepción, vasija, número y nombre del lote al abrir una copia inicial. En Brix y OT agregados elegir una fila y confirmar el botón de datos compartidos. La hoja original puede contener ejemplos; no se borran automáticamente. No se sincronizan mediciones, tratamientos ni dosis entre celdas automáticamente. No se dispone de originales específicos de nutrientes y anhídrido, se usan copias identificadas de la OT sin reglas de dosificación.
- El editor conserva guardado por versión, borrador IndexedDB, reintento, conflictos, exportación e historial V2. La ficha del ingreso se guarda al confirmar; los campos sin confirmar no se guardan en servidor. No se modifica automáticamente la fecha de un documento ya guardado. No se impide editar libros marcados finalizados.
- UI adaptable; pendiente verificar interacción táctil, renderizado FortuneSheet, impresión y exportación real en navegador. No incluye nuevos gráficos ni sincronización de trazabilidad V1.

## Verificación y publicación

```bash
npm ci
npm run build:vendimia
npm run tipos
npx tsc --noEmit
npm run test:vendimia-libros
npm test
npx wrangler d1 migrations apply catenainstitute-desarrollo --remote
git add .
git commit -m "Vendimia V3 - ingresos y datos compartidos"
git push -u origin main
```

Pruebas locales Node/SQLite: 4 casos aprobados (integridad, concurrencia, permisos, ingresos, mapeos y fórmulas). No se ejecutó la suite Vitest completa de V3 ni se compiló el motor aquí. No publicar si falla alguna verificación.
