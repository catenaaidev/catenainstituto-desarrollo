// Foto de las reglas de papel e impresión de Barriles (rótulos A4, hoja del
// mapa, Registro). Se corre UNA vez, al final de la Task 2 de la Etapa 3 (con
// los colores ya en --sem-* y el bloque "Papel igual que antes"), después de
// verificar con PDFs que el papel sale idéntico al de main.
// Uso: node scripts/extraer-papel-barriles.mjs > test/fixtures/barriles-papel.json
// Las mismas dos constantes están en test/barriles-papel-intacto.test.mjs.
import { readFileSync } from 'node:fs';
import { reglasDePapel } from './css-reglas.mjs';
import { PAPEL_BARRILES, sinCelular } from './selectores-barriles.mjs';

const html = readFileSync(new URL('../public/barriles/index.html', import.meta.url), 'utf8');
process.stdout.write(JSON.stringify(sinCelular(reglasDePapel(html, PAPEL_BARRILES)), null, 1) + '\n');
