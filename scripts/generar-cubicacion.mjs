/* Genera public/lotes/js/cubicacion-tablas.js desde el HTML de cubicaciones
 * de la bodega (las tablas vienen embebidas de "base de datos cubicaciones.xlsx").
 *
 * Uso: node scripts/generar-cubicacion.mjs "<ruta a cubicaciones_tanques.html>"
 * Volver a correrlo si cambia el Excel. */
import { readFileSync, writeFileSync } from 'node:fs';

const ORIGEN = process.argv[2];
if (!ORIGEN) { console.error('Falta la ruta al HTML de cubicaciones'); process.exit(1); }

const CLAVES = {
  'cubicacion_esfera_plano_cm': ['esfera-1500', 'Esfera + plano 1500 L'],
  'cubicacion tanque 40HL':     ['tanque-40hl', 'Tanque 40 HL'],
  'cubicacion tanque 75HL':     ['tanque-75hl', 'Tanque 75 HL'],
  'cubicacion Huevo 33HL':      ['huevo-33hl',  'Huevo 33 HL'],
  'cubicacion Huevos 24HL':     ['huevo-24hl',  'Huevo 24 HL'],
  'cubicacion piletas 30HL':    ['pileta-30hl', 'Pileta 30 HL'],
};

const html = readFileSync(ORIGEN, 'utf8');
const m = html.match(/const DB = (\{.*?\});\n/s);
if (!m) throw new Error('No encontré "const DB = {...};" en el HTML');
const DB = JSON.parse(m[1]);

const out = {};
for (const [hoja, t] of Object.entries(DB)) {
  const c = CLAVES[hoja];
  if (!c) throw new Error('Tabla sin clave asignada: ' + hoja);
  const puntos = t.data.map(p => [Number(p.merma_cm), Number(p.litros)]).sort((a, b) => a[0] - b[0]);
  out[c[0]] = { nombre: c[1], puntos };
}

const cabecera = `/* ===== Lotes CIW — tablas de cubicacion de tanques (GENERADO) =====
 *
 * NO editar a mano: sale de scripts/generar-cubicacion.mjs, que lee
 * "Archivos de Roy Urvieta - Año 2026/cubicacion de tanques/cubicaciones_tanques.html".
 * Cada punto es [cm de merma, litros]; cm 0 = tanque lleno. */
'use strict';

`;
writeFileSync('public/lotes/js/cubicacion-tablas.js',
  cabecera + 'export const TABLAS_CUBICACION = ' + JSON.stringify(out) + ';\n');
console.log('Tablas:', Object.keys(out).map(k => `${k} (${out[k].puntos.length} puntos)`).join(', '));
