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
    // Leídos en Node por vitest.config.ts para los tests de estilo.
    PRENSAS_HTML: string;
    ESTILO_CSS: string;
    ADMIN_HTML: string;
    CAMBIAR_CLAVE_HTML: string;
    // El portal (public/index.html): tarjeta Órdenes de trabajo y su figura de puntos.
    PORTAL_HTML: string;
    // La página de la sección Órdenes de trabajo (public/ordenes/index.html).
    ORDENES_HTML: string;
    // public/ordenes/js/guia-vista.js (test de fuentes: imprimir la guía con N°).
    ORDENES_GUIA_VISTA_JS: string;
    // Lotes (Etapa 2 de la estética): index.html y su JS por archivo ('app.js', 'js/nucleo.js', …).
    LOTES_HTML: string;
    LOTES_JS: Record<string, string>;
    // Barriles (Etapa 3 de la estética): su js/ por archivo ('js/sync.js', 'js/dialogos.js', …).
    BARRILES_JS: Record<string, string>;
    // Prensas (Entrega 3 de Órdenes de trabajo): app.js y su js/ por archivo ('app.js', 'js/puente.js', …).
    PRENSAS_JS: Record<string, string>;
    // Órdenes de trabajo: su js/ por archivo ('js/app.js', 'js/lista.js', …).
    ORDENES_JS: Record<string, string>;
    // Los dos wrangler.*jsonc en texto plano (no se parsean: son JSONC con comentarios),
    // para el test que vigila que /ordenes esté en run_worker_first.
    WRANGLER_JSONC: string;
    WRANGLER_DEV_JSONC: string;
  }
}

export {};
