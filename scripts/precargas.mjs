/**
 * Precargas de módulos (<link rel="modulepreload">) de cada pantalla.
 *
 * Por qué: Lotes son ~110 módulos ES encadenados hasta 12 niveles. Sin aviso,
 * el navegador recién se entera de que necesita un archivo cuando llega el que
 * lo importa: ~18 idas y vueltas en fila (≈3,7 s con 140 ms de latencia), y
 * todo eso antes de pedir los datos. Con la lista completa en el <head> los
 * pide todos juntos, en una sola tanda.
 *
 * La lista se arma leyendo los import estáticos desde el módulo de entrada y se
 * escribe entre los marcadores <!-- precargas:inicio --> y <!-- precargas:fin -->.
 *
 *   node scripts/precargas.mjs              reescribe las listas
 *   node scripts/precargas.mjs --verificar  falla si alguna quedó vieja (CI)
 *
 * Una lista vieja no rompe nada (solo vuelve la lentitud), por eso alcanza con
 * que el CI avise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** html: la pantalla; entradas: sus <script type="module">, como URL del sitio. */
const PANTALLAS = [
  { html: 'lotes/index.html', entradas: ['/lotes/app.js'] },
  { html: 'prensas/index.html', entradas: ['/prensas/js/puente.js'] },
  { html: 'ordenes/index.html', entradas: ['/ordenes/js/app.js'] },
];

const INICIO = '<!-- precargas:inicio -->';
const FIN = '<!-- precargas:fin -->';

/** El código sin comentarios, para no seguir un import que está en un comentario. */
function sinComentarios(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

/** Los import/export ... from '...' estáticos (no import() dinámico). */
function importsDe(src) {
  const r = [];
  const re = /(?:^|[;\s])(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?['"]([^'"]+)['"]/g;
  for (const m of sinComentarios(src).matchAll(re)) r.push(m[1]);
  return r;
}

/** Todos los módulos que carga la entrada, como URL del sitio, en orden estable. */
export function grafo(entradas) {
  const vistos = new Set();
  const visitar = (url) => {
    if (vistos.has(url)) return;
    const archivo = path.join(RAIZ, url);
    if (!fs.existsSync(archivo)) throw new Error(`No existe ${url}`);
    vistos.add(url);
    for (const esp of importsDe(fs.readFileSync(archivo, 'utf8'))) {
      if (!esp.startsWith('.') && !esp.startsWith('/')) continue;   // sin paquetes "desnudos"
      visitar(new URL(esp, 'http://x' + url).pathname);
    }
  };
  entradas.forEach(visitar);
  return [...vistos];
}

function bloque(urls, nl) {
  return INICIO + nl + urls.map((u) => `<link rel="modulepreload" href="${u}">`).join(nl) + nl + FIN;
}

const verificar = process.argv.includes('--verificar');
let viejas = 0;
for (const p of PANTALLAS) {
  const archivo = path.join(RAIZ, p.html);
  const html = fs.readFileSync(archivo, 'utf8');
  const i = html.indexOf(INICIO), f = html.indexOf(FIN);
  if (i < 0 || f < i) throw new Error(`${p.html}: faltan los marcadores ${INICIO} / ${FIN}`);
  const nl = html.includes('\r\n') ? '\r\n' : '\n';
  const nuevo = html.slice(0, i) + bloque(grafo(p.entradas), nl) + html.slice(f + FIN.length);
  // Los finales de línea no cuentan: git los cambia según el equipo (CRLF en Windows).
  if (nuevo.replace(/\r/g, '') === html.replace(/\r/g, '')) continue;
  viejas++;
  if (verificar) console.error(`✗ ${p.html}: la lista de precargas quedó vieja. Correr: node scripts/precargas.mjs`);
  else { fs.writeFileSync(archivo, nuevo); console.log(`✓ ${p.html} actualizado`); }
}
if (verificar && viejas) process.exit(1);
if (verificar) console.log('✓ precargas al día');
