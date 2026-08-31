#!/usr/bin/env node
/**
 * Importa el datos.json de Prensas a D1 (Fase 1).
 *
 * Uso:
 *   node scripts/importar-prensas.mjs --local  --datos ../prensas-app/datos.json
 *   node scripts/importar-prensas.mjs --remote --datos ../prensas-app/datos.json
 *
 * Genera un .sql y lo aplica con wrangler. Antes de terminar verifica los
 * conteos contra el archivo original: si algo no coincide, avisa y no sigue.
 */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { argv, exit } from 'node:process';

const args = argv.slice(2);
const remoto = args.includes('--remote');
const local = args.includes('--local');
const iDatos = args.indexOf('--datos');
const rutaDatos = iDatos >= 0 ? args[iDatos + 1] : '../prensas-app/datos.json';

if (!remoto && !local) {
  console.error('Falta indicar --local o --remote.');
  exit(1);
}

const destino = remoto ? 'la nube' : 'la base local';
console.log(`\nImportando Prensas a ${destino}`);
console.log(`Origen: ${rutaDatos}\n`);

// ---- 1. Leer y validar el archivo ----
let datos;
try {
  datos = JSON.parse(readFileSync(rutaDatos, 'utf8'));
} catch (e) {
  console.error(`No se pudo leer ${rutaDatos}: ${e.message}`);
  exit(1);
}

const conteos = {
  lotes: (datos.lotes ?? []).length,
  analisis: (datos.analisis ?? []).length,
  degustaciones: (datos.degustaciones ?? []).length,
  agregados: (datos.agregados ?? []).length,
};
const version = Number(datos.meta?.version ?? 0);

console.log('Lo que hay en el archivo:');
for (const [k, v] of Object.entries(conteos)) {
  console.log(`  ${k.padEnd(15)} ${v}`);
}
console.log(`  ${'version'.padEnd(15)} ${version}\n`);

if (!Array.isArray(datos.lotes) || !Array.isArray(datos.analisis)) {
  console.error('El archivo no tiene las secciones lotes y analisis. Abortado.');
  exit(1);
}

// ---- 2. Armar el SQL ----
// El JSON entero no entra en una sola sentencia: D1 la rechaza con
// SQLITE_TOOBIG. Se inserta vacío y se va agregando de a tramos con ||.
const TRAMO = 40_000; // caracteres por sentencia, bien por debajo del límite

const jsonTexto = JSON.stringify(datos);
const esc = (s) => String(s ?? '').replace(/'/g, "''");
const autor = esc(datos.meta?.autor ?? 'importacion');
const guardado = esc(datos.meta?.guardado ?? '');

const partes = [];
for (let i = 0; i < jsonTexto.length; i += TRAMO) {
  partes.push(esc(jsonTexto.slice(i, i + TRAMO)));
}

const sql = [
  '-- Importación de Prensas · generado por scripts/importar-prensas.mjs',
  `-- ${conteos.lotes} lotes · ${conteos.analisis} análisis · ${conteos.degustaciones} degustaciones · ${conteos.agregados} agregados`,
  '',
  "DELETE FROM documento WHERE modulo = 'prensas';",
  `INSERT INTO documento (modulo, version, json, autor, guardado) VALUES ('prensas', ${version}, '', '${autor}', '${guardado}');`,
  '',
  `-- El documento se arma en ${partes.length} tramos de hasta ${TRAMO} caracteres.`,
  ...partes.map(
    (p) => `UPDATE documento SET json = json || '${p}' WHERE modulo = 'prensas';`,
  ),
  '',
  `INSERT INTO historial (modulo, version, ts, autor, email, resumen, detalle, forzado)`,
  `VALUES ('prensas', ${version}, datetime('now'), '${autor}', 'importacion',`,
  `        'Importación inicial desde datos.json (${conteos.lotes} lotes, ${conteos.analisis} análisis)',`,
  `        '[]', 0);`,
  '',
].join('\n');

console.log(`El documento se parte en ${partes.length} tramos (límite de sentencia de D1).`);

const archivoSql = 'importar-prensas.generado.sql';
writeFileSync(archivoSql, sql, 'utf8');
console.log(`SQL generado: ${archivoSql} (${(sql.length / 1024).toFixed(0)} KB)`);

// ---- 3. Aplicarlo ----
const flag = remoto ? '--remote' : '--local';
try {
  console.log(`\nAplicando con wrangler ${flag}…\n`);
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'ciw-plataforma', flag, `--file=${archivoSql}`, '--yes'],
    { stdio: 'inherit', shell: true },
  );
} catch (e) {
  console.error('\nFalló la importación. El SQL quedó en ' + archivoSql + ' para revisarlo.');
  exit(1);
}

// ---- 4. Verificar ----
console.log('\nVerificando lo que quedó guardado…\n');
// La consulta va en un archivo: pasarla por --command se rompe con el quoting
// de la consola de Windows.
const archivoVerif = 'verificar.generado.sql';
writeFileSync(
  archivoVerif,
  "SELECT version," +
    " json_array_length(json_extract(json,'$.lotes')) AS lotes," +
    " json_array_length(json_extract(json,'$.analisis')) AS analisis," +
    " json_array_length(json_extract(json,'$.degustaciones')) AS degustaciones," +
    " json_array_length(json_extract(json,'$.agregados')) AS agregados" +
    " FROM documento WHERE modulo='prensas';\n",
  'utf8',
);

try {
  const salida = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'ciw-plataforma', flag, `--file=${archivoVerif}`, '--json'],
    { encoding: 'utf8', shell: true },
  );

  const filas = JSON.parse(salida.slice(salida.indexOf('[')))?.[0]?.results ?? [];
  const g = filas[0];

  if (!g) throw new Error('la consulta no devolvió filas');

  let todoBien = true;
  console.log('  sección          archivo    en la base');
  for (const k of ['lotes', 'analisis', 'degustaciones', 'agregados']) {
    const ok = Number(g[k]) === conteos[k];
    if (!ok) todoBien = false;
    console.log(`  ${k.padEnd(15)} ${String(conteos[k]).padStart(7)} ${String(g[k]).padStart(13)}  ${ok ? 'OK' : '✗ NO COINCIDE'}`);
  }
  const okVer = Number(g.version) === version;
  if (!okVer) todoBien = false;
  console.log(`  ${'version'.padEnd(15)} ${String(version).padStart(7)} ${String(g.version).padStart(13)}  ${okVer ? 'OK' : '✗ NO COINCIDE'}`);

  if (todoBien) {
    unlinkSync(archivoSql);
    unlinkSync(archivoVerif);
    console.log('\n✓ Importación verificada. Todo coincide con el archivo original.\n');
  } else {
    console.error('\n✗ Los conteos NO coinciden. Revisá antes de usar la app.\n');
    exit(1);
  }
} catch (e) {
  console.error(`\nNo se pudo verificar automáticamente: ${e.message}`);
  console.error('Verificá a mano con:');
  console.error(`  npx wrangler d1 execute ciw-plataforma ${flag} --command "SELECT version FROM documento"\n`);
  exit(1);
}
