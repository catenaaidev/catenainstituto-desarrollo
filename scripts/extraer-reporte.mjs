#!/usr/bin/env node
/**
 * Extrae la plantilla del reporte desde el reporte.py de la app local.
 *
 * El reporte era una página HTML autónoma con su CSS y su JS adentro, que
 * Python escribía a disco en cada guardado. Acá se saca esa plantilla tal cual
 * y se guarda como módulo TS, para que el Worker la sirva en vivo.
 *
 * Uso:
 *   node scripts/extraer-reporte.mjs <reporte.py> <salida.ts>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { argv, exit } from 'node:process';

/** Saca un bloque `NOMBRE = r'''...'''` de un archivo .py */
function bloque(src, nombre) {
  // [^] en vez de [\s\S]: significa lo mismo y no necesita escapes.
  const re = new RegExp("^" + nombre + " = r?'''([^]*?)'''", 'm');
  const m = src.match(re);
  if (!m) throw new Error(`no encontré el bloque ${nombre} en el .py`);
  return m[1];
}

const [, , rutaPy, rutaSalida] = argv;
if (!rutaPy || !rutaSalida) {
  console.error('Uso: node scripts/extraer-reporte.mjs <reporte.py> <salida.ts>');
  exit(1);
}

const py = readFileSync(rutaPy, 'utf8');

const css = bloque(py, 'CSS');
const js = bloque(py, 'JS');
let html = bloque(py, 'HTML');

// Python escribe los emoji como \U0001F4CA; en JS van literales.
html = html.replace(/\\U([0-9A-Fa-f]{8})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));

const armado = html.replace('/*__CSS__*/', css).replace('/*__JS__*/', js);

for (const marca of ['__DATOS__', '__VERSION__', '__GENERADO__', '__MES_ACTUAL__', '__REF_FECHA__']) {
  if (!armado.includes(marca)) {
    console.error(`Falta el marcador ${marca}: la plantilla no quedó completa.`);
    exit(1);
  }
}

const ts =
  `/**\n` +
  ` * Plantilla del reporte — extraída de ${basename(rutaPy)} de la app local.\n` +
  ` *\n` +
  ` * Es la MISMA página que generaba Python: su CSS, su JS y su HTML, tal cual.\n` +
  ` * Lo único que cambia es cuándo se arma. Antes se escribía un archivo en el\n` +
  ` * disco en cada guardado; ahora se sirve en vivo, así que el reporte nunca\n` +
  ` * queda viejo y no hay que mandarlo por mail.\n` +
  ` *\n` +
  ` * Vive en src/ y no en public/ a propósito: así nadie puede pedirla con los\n` +
  ` * marcadores sin reemplazar.\n` +
  ` *\n` +
  ` * NO editar a mano: se regenera con scripts/extraer-reporte.mjs.\n` +
  ` */\n\n` +
  `export const PLANTILLA = ${JSON.stringify(armado)};\n`;

writeFileSync(rutaSalida, ts, 'utf8');
console.log(`${(armado.length / 1024).toFixed(0)} KB de plantilla → ${rutaSalida}`);
