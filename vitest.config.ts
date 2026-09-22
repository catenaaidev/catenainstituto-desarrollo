import path from 'node:path';
import { readFileSync } from 'node:fs';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

/**
 * Los tests corren DENTRO del runtime real de Workers, contra una base D1 de
 * verdad (no simulada). Cada archivo de test tiene su propio almacenamiento
 * aislado, así no se pisan entre sí.
 */

// El esquema sale de las migraciones reales, no de un duplicado escrito a mano:
// así un cambio en migrations/ que rompa el código lo cazan los tests. Se leen
// acá (en Node) porque dentro del runtime de Workers no hay acceso al disco; el
// contenido viaja como binding y lo aplica el setup.
const migraciones = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));

// El HTML de barriles se lee acá (en Node) por la misma razón: el runtime de
// Workers no tiene fs. Lo reciben los tests que necesitan leer el archivo real
// de producción para verificar que la regla siga cumplida.
const indexHtmlBarriles = readFileSync(
  path.join(import.meta.dirname, 'public/barriles/index.html'), 'utf8');

export default defineWorkersConfig({
  test: {
    // Crea las tablas antes de cada archivo de test.
    setupFiles: ['./test/aplicar-migraciones.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          d1Databases: ['DB'],
          bindings: { MIGRACIONES: migraciones, INDEX_HTML_BARRILES: indexHtmlBarriles },
        },
      },
    },
  },
});
