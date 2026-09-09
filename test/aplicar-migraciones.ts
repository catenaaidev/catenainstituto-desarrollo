/**
 * Crea el esquema en la base de cada archivo de test.
 *
 * El almacenamiento está aislado por archivo, así que esto corre una vez por
 * archivo y las tablas arrancan vacías. Las migraciones son las de
 * `migrations/`, leídas en vitest.config.ts.
 */

import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.MIGRACIONES);
