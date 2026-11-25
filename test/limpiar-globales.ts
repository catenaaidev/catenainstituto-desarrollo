/**
 * Lo que un archivo de test cuelga de globalThis no pasa al siguiente.
 *
 * Todos los archivos corren en un mismo runtime (singleWorker en
 * vitest.config.ts) y comparten globalThis. Varios tests ponen un window o un
 * document de mentira para poder importar el JS de las páginas, y los .js
 * clásicos (fusion.js, barra.js, …) se cuelgan de window si existe: sin esta
 * limpieza, el archivo siguiente encontraba ese window falso y fallaba según
 * el orden en que tocaran.
 */

import { afterAll } from 'vitest';

const antes = new Set(Reflect.ownKeys(globalThis));

afterAll(() => {
  for (const k of Reflect.ownKeys(globalThis)) {
    if (!antes.has(k)) delete (globalThis as Record<PropertyKey, unknown>)[k];
  }
});
