// Foto de las reglas CON pantalla "con significado" de Barriles (mapa 2D,
// escena 3D, feedback del escáner, cámara, modo por lote, inventario/altas/
// pedidos/historial, rótulos/cifras/cuentas, velo/solo lectura) + el bloque
// :root --sem-*. Se corre UNA vez, con los valores ya verificados contra
// commit 9b077ed (antes de la Etapa 3), para que un cambio futuro no les
// mueva el valor sin que un test lo note.
// Uso: node scripts/extraer-congelados-barriles.mjs > test/fixtures/barriles-congelados.json
import { readFileSync } from 'node:fs';
import { cssDe, reglasPlanas, reglasTope, norm } from './css-reglas.mjs';
import { CON_SIGNIFICADO, sinCelular } from './selectores-barriles.mjs';

const html = readFileSync(new URL('../public/barriles/index.html', import.meta.url), 'utf8');

const congeladas = sinCelular(
  reglasPlanas(html)
    .filter((r) => CON_SIGNIFICADO.test(r.selector))
    .map((r) => (r.media ? r.media + '>' : '') + r.selector + '{' + r.cuerpo + '}')
);

const root = reglasTope(cssDe(html)).find((r) => r.startsWith(':root'));
if (root) congeladas.push(norm(root));

process.stdout.write(JSON.stringify(congeladas.sort(), null, 1) + '\n');
