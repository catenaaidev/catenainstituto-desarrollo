// Foto de las reglas de papel e impresión de Lotes. Se corre UNA vez sobre
// main sin cambios (Etapa 2, Task 1); después el test compara contra ella.
// Uso: node scripts/extraer-papel-lotes.mjs > test/fixtures/lotes-papel.json
import { readFileSync } from 'node:fs';
import { reglasDePapel } from './css-reglas.mjs';

const html = readFileSync(new URL('../public/lotes/index.html', import.meta.url), 'utf8');
process.stdout.write(JSON.stringify(reglasDePapel(html), null, 1) + '\n');
