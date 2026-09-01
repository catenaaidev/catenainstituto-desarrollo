#!/usr/bin/env node
/**
 * Importa el documento de un módulo a D1 (Fase 1).
 *
 * Uso:
 *   node scripts/importar.mjs --modulo prensas  --local  --datos ../prensas-app/datos.json
 *   node scripts/importar.mjs --modulo barriles --local  --datos ../_extraido2/barriles/estado-barriles.json
 *   node scripts/importar.mjs --modulo lotes    --remote --datos ../_extraido2/lotes/datos.json
 *
 * Cada módulo guarda su documento entero, igual que hacía su archivo local.
 * Al terminar verifica los conteos dentro de la base contra el archivo de
 * origen: si algo no coincide, avisa y termina con error.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { argv, exit } from 'node:process';

// ---- Cómo es el documento de cada módulo ----
// Las rutas usan la sintaxis de json_extract, para poder verificar sin parsear.
const MODULOS = {
  prensas: {
    version: '$.meta.version',
    secciones: ['lotes', 'analisis', 'degustaciones', 'agregados'].map((s) => [s, `$.${s}`]),
    autor: (d) => d?.meta?.autor,
    fecha: (d) => d?.meta?.guardado,
  },
  lotes: {
    version: '$.meta.version',
    secciones: ['lotes', 'analisis', 'movimientos'].map((s) => [s, `$.${s}`]),
    autor: (d) => d?.meta?.autor,
    fecha: (d) => d?.meta?.actualizado,
  },
  barriles: {
    version: '$.version',
    secciones: ['inventario', 'boxes', 'escaneos', 'tanques'].map((s) => [s, `$.estado.${s}`]),
    autor: () => 'importacion',
    fecha: () => '',
  },
};

const args = argv.slice(2);
const remoto = args.includes('--remote');
const local = args.includes('--local');
const valor = (bandera) => {
  const i = args.indexOf(bandera);
  return i >= 0 ? args[i + 1] : undefined;
};

const modulo = valor('--modulo') ?? 'prensas';
const rutaDatos = valor('--datos');

if (!MODULOS[modulo]) {
  console.error(`--modulo tiene que ser uno de: ${Object.keys(MODULOS).join(', ')}`);
  exit(1);
}
if (!remoto && !local) {
  console.error('Falta indicar --local o --remote.');
  exit(1);
}
if (!rutaDatos || !existsSync(rutaDatos)) {
  console.error(`No encuentro el archivo de datos: ${rutaDatos ?? '(falta --datos)'}`);
  exit(1);
}

const cfg = MODULOS[modulo];
const flag = remoto ? '--remote' : '--local';

/**
 * Nombre de la base, leído de wrangler.jsonc.
 *
 * Se lee en vez de escribirlo fijo acá: si el nombre está en dos lugares, uno
 * de los dos se desactualiza (ya pasó al renombrar la base a `catenainstitute`).
 */
function nombreBase() {
  const crudo = readFileSync('wrangler.jsonc', 'utf8');
  // wrangler.jsonc admite comentarios; JSON.parse no. Se sacan antes.
  const limpio = crudo.replace(/\/\*[^]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  const cfgW = JSON.parse(limpio);
  const nombre = cfgW?.d1_databases?.[0]?.database_name;
  if (!nombre) throw new Error('no encontré database_name en wrangler.jsonc');
  return nombre;
}

const BASE = nombreBase();

console.log(`\nImportando ${modulo} a ${remoto ? 'la nube' : 'la base local'}`);
console.log(`Origen: ${rutaDatos}\n`);

// ---- 1. Leer y contar ----
let datos;
try {
  datos = JSON.parse(readFileSync(rutaDatos, 'utf8'));
} catch (e) {
  console.error(`No se pudo leer el archivo: ${e.message}`);
  exit(1);
}

/** Sigue una ruta tipo `$.estado.inventario` dentro del objeto. */
function porRuta(obj, ruta) {
  return ruta
    .replace(/^\$\.?/, '')
    .split('.')
    .filter(Boolean)
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const version = Number(porRuta(datos, cfg.version) ?? 0);
const conteos = Object.fromEntries(
  cfg.secciones.map(([nombre, ruta]) => [nombre, (porRuta(datos, ruta) ?? []).length]),
);

console.log('Lo que hay en el archivo:');
for (const [k, v] of Object.entries(conteos)) console.log(`  ${k.padEnd(15)} ${v}`);
console.log(`  ${'version'.padEnd(15)} ${version}\n`);

if (Object.values(conteos).every((n) => n === 0)) {
  console.error('El archivo no tiene ninguna sección con datos. Abortado.');
  exit(1);
}

// ---- 2. Armar el SQL ----
// El documento entero no entra en una sola sentencia: D1 la rechaza con
// SQLITE_TOOBIG. Se inserta vacío y se va agregando de a tramos con ||.
const TRAMO = 40_000;

const jsonTexto = JSON.stringify(datos);
const esc = (s) => String(s ?? '').replace(/'/g, "''");
const autor = esc(cfg.autor(datos) ?? 'importacion');
const fecha = esc(cfg.fecha(datos) ?? '');

const partes = [];
for (let i = 0; i < jsonTexto.length; i += TRAMO) partes.push(esc(jsonTexto.slice(i, i + TRAMO)));

const resumen = Object.entries(conteos)
  .map(([k, v]) => `${v} ${k}`)
  .join(', ');

const sql = [
  `-- Importación de ${modulo} · generado por scripts/importar.mjs`,
  `-- ${resumen}`,
  '',
  `DELETE FROM documento WHERE modulo = '${modulo}';`,
  `INSERT INTO documento (modulo, version, json, autor, guardado) VALUES ('${modulo}', ${version}, '', '${autor}', '${fecha}');`,
  '',
  `-- El documento se arma en ${partes.length} tramos de hasta ${TRAMO} caracteres.`,
  ...partes.map((p) => `UPDATE documento SET json = json || '${p}' WHERE modulo = '${modulo}';`),
  '',
  `DELETE FROM historial WHERE modulo = '${modulo}' AND email = 'importacion';`,
  `INSERT INTO historial (modulo, version, ts, autor, email, resumen, detalle, forzado)`,
  `VALUES ('${modulo}', ${version}, datetime('now'), '${autor}', 'importacion',`,
  `        'Importación inicial (${resumen})', '[]', 0);`,
  '',
].join('\n');

console.log(`El documento se parte en ${partes.length} tramos (límite de sentencia de D1).`);

const archivoSql = `importar-${modulo}.generado.sql`;
writeFileSync(archivoSql, sql, 'utf8');
console.log(`SQL generado: ${archivoSql} (${(sql.length / 1024).toFixed(0)} KB)`);

// ---- 3. Aplicarlo ----
try {
  console.log(`\nAplicando con wrangler ${flag}…\n`);
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', BASE, flag, `--file=${archivoSql}`, '--yes'],
    { stdio: 'inherit', shell: true },
  );
} catch {
  console.error(`\nFalló la importación. El SQL quedó en ${archivoSql} para revisarlo.`);
  exit(1);
}

// ---- 4. Verificar contra el origen ----
console.log('\nVerificando lo que quedó guardado…\n');

// La consulta va en un archivo: pasarla por --command se rompe con el quoting
// de la consola de Windows.
const archivoVerif = `verificar-${modulo}.generado.sql`;
const columnas = [
  `json_extract(json,'${cfg.version}') AS version`,
  ...cfg.secciones.map(([n, r]) => `json_array_length(json_extract(json,'${r}')) AS ${n}`),
].join(', ');
writeFileSync(archivoVerif, `SELECT ${columnas} FROM documento WHERE modulo='${modulo}';\n`, 'utf8');

try {
  const salida = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', BASE, flag, `--file=${archivoVerif}`, '--json'],
    { encoding: 'utf8', shell: true },
  );

  const g = JSON.parse(salida.slice(salida.indexOf('[')))?.[0]?.results?.[0];
  if (!g) throw new Error('la consulta no devolvió filas');

  let todoBien = true;
  console.log('  sección          archivo    en la base');
  for (const [k] of cfg.secciones) {
    const ok = Number(g[k]) === conteos[k];
    if (!ok) todoBien = false;
    console.log(
      `  ${k.padEnd(15)} ${String(conteos[k]).padStart(7)} ${String(g[k]).padStart(13)}  ${ok ? 'OK' : '✗ NO COINCIDE'}`,
    );
  }
  const okVer = Number(g.version) === version;
  if (!okVer) todoBien = false;
  console.log(
    `  ${'version'.padEnd(15)} ${String(version).padStart(7)} ${String(g.version).padStart(13)}  ${okVer ? 'OK' : '✗ NO COINCIDE'}`,
  );

  if (!todoBien) {
    console.error('\n✗ Los conteos NO coinciden. Revisá antes de usar la app.\n');
    exit(1);
  }
  unlinkSync(archivoSql);
  unlinkSync(archivoVerif);
  console.log('\n✓ Importación verificada. Todo coincide con el archivo original.\n');
} catch (e) {
  console.error(`\nNo se pudo verificar automáticamente: ${e.message}`);
  console.error(`Verificá a mano con:\n  npx wrangler d1 execute ${BASE} ${flag} --file=${archivoVerif}\n`);
  exit(1);
}
