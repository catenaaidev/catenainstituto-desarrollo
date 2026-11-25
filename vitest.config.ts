import path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
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

// Archivos que leen los tests de estilo (mismo motivo: no hay fs en Workers).
const leer = (p: string) => {
  try { return readFileSync(path.join(import.meta.dirname, p), 'utf8'); }
  catch { return ''; }   // archivo todavía no creado: el test falla con un mensaje claro
};
const PRENSAS_HTML = leer('public/prensas/index.html');
const ESTILO_CSS = leer('public/shared/estilo.css');
const ADMIN_HTML = leer('public/admin.html');
const PORTAL_HTML = leer('public/index.html');
const ORDENES_HTML = leer('public/ordenes/index.html');
// La vista de la Guía de trabajos (imprimir con N° de la carpeta).
const ORDENES_GUIA_VISTA_JS = leer('public/ordenes/js/guia-vista.js');
// Los dos wrangler.*jsonc, para el test que vigila run_worker_first (texto plano: son JSONC con comentarios).
const WRANGLER_JSONC = leer('wrangler.jsonc');
const WRANGLER_DEV_JSONC = leer('wrangler.dev.jsonc');
const CAMBIAR_CLAVE_HTML = leer('public/cambiar-clave.html');

// Lotes: el index.html y todo su JS, para los tests de estética de la Etapa 2.
const LOTES_HTML = leer('public/lotes/index.html');
const dirLotesJs = path.join(import.meta.dirname, 'public/lotes/js');
const LOTES_JS: Record<string, string> = Object.fromEntries(
  ['app.js', ...readdirSync(dirLotesJs).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)]
    .map((f) => [f, leer('public/lotes/' + f)]),
);

// Barriles: todo su js/ (Etapa 3 de la estética: que no queden alert/confirm/prompt).
const dirBarrilesJs = path.join(import.meta.dirname, 'public/barriles/js');
const BARRILES_JS: Record<string, string> = Object.fromEntries(
  readdirSync(dirBarrilesJs).filter((f) => f.endsWith('.js')).map((f) => ['js/' + f, leer('public/barriles/js/' + f)]),
);

// Prensas: app.js y su js/, para los tests de cableado de las órdenes (entrega 3).
const dirPrensasJs = path.join(import.meta.dirname, 'public/prensas/js');
const PRENSAS_JS: Record<string, string> = Object.fromEntries(
  ['app.js', ...readdirSync(dirPrensasJs).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)]
    .map((f) => [f, leer('public/prensas/' + f)]),
);

// Órdenes de trabajo: su js/, para tests de cableado de la página.
const dirOrdenesJs = path.join(import.meta.dirname, 'public/ordenes/js');
const ORDENES_JS: Record<string, string> = Object.fromEntries(
  readdirSync(dirOrdenesJs).filter((f) => f.endsWith('.js')).map((f) => ['js/' + f, leer('public/ordenes/js/' + f)]),
);

export default defineWorkersConfig({
  test: {
    // Crea las tablas antes de cada archivo de test, y al terminar cada uno
    // saca de globalThis lo que ese archivo agregó.
    setupFiles: ['./test/aplicar-migraciones.ts', './test/limpiar-globales.ts'],
    // Los tests de .claude/worktrees/* son copias de otras ramas: no son de esta.
    exclude: ['**/node_modules/**', '.claude/**'],
    poolOptions: {
      workers: {
        // Un solo runtime para todos los archivos. Sin esto el pool levanta un
        // workerd POR ARCHIVO de test, todos a la vez y sin límite (maxWorkers
        // no lo frena): con ~120 archivos pasaba los 12 GB, el runner de CI se
        // quedaba sin memoria y GitHub cancelaba el paso ("The operation was
        // canceled"). El almacenamiento sigue aislado por archivo
        // (isolatedStorage), así que cada archivo arranca con su D1 vacía.
        singleWorker: true,
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          d1Databases: ['DB'],
          bindings: { MIGRACIONES: migraciones, INDEX_HTML_BARRILES: indexHtmlBarriles, TEST_MODE: '1',
            PRENSAS_HTML, ESTILO_CSS, ADMIN_HTML, CAMBIAR_CLAVE_HTML, LOTES_HTML, LOTES_JS, BARRILES_JS, PRENSAS_JS, PORTAL_HTML, ORDENES_HTML, ORDENES_GUIA_VISTA_JS, ORDENES_JS,
            WRANGLER_JSONC, WRANGLER_DEV_JSONC },
        },
      },
    },
  },
});
