// Foto de los colores escritos en el JS de Barriles (escena 3D, cámara,
// colorLote). Se corre UNA vez sobre main sin cambios (Etapa 3, Task 1).
// Uso: node scripts/extraer-colores-barriles.mjs > test/fixtures/barriles-colores-js.json
import { readFileSync } from 'node:fs';
import { coloresDelJs } from './colores-literales.mjs';

const html = readFileSync(new URL('../public/barriles/index.html', import.meta.url), 'utf8');
process.stdout.write(JSON.stringify(coloresDelJs(html), null, 1) + '\n');
