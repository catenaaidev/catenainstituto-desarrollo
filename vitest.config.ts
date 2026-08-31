import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

/**
 * Los tests corren DENTRO del runtime real de Workers, contra una base D1 de
 * verdad (no simulada). Cada archivo de test tiene su propio almacenamiento
 * aislado, así no se pisan entre sí.
 */
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          // Aplica las migraciones antes de cada archivo de test.
          d1Databases: ['DB'],
        },
      },
    },
  },
});
