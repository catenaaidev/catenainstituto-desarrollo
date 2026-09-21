/**
 * Tipos del entorno de test.
 *
 * MIGRACIONES no es un binding del Worker: lo inyecta vitest.config.ts para que
 * el setup pueda crear el esquema. Por eso no aparece en wrangler.jsonc ni en
 * los tipos que genera `npm run tipos`.
 */

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    MIGRACIONES: D1Migration[];
    // INDEX_HTML_BARRILES: leído en Node por vitest.config.ts (el runtime de
    // Workers no tiene fs) y viajando como binding. Lo usan los tests que
    // verifican que la regla siga cumplida en el archivo real de producción.
    INDEX_HTML_BARRILES: string;
  }
}

export {};
