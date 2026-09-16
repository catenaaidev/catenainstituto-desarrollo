#!/usr/bin/env node
/**
 * Aplica a D1 los dos datos que el Tablero FML necesita y que todavia no estan
 * en la nube. Los dos son bloqueantes del despliegue, no del merge:
 *
 *   1. Los criterios del tablero aprobado en `config.criterios_fml`
 *      (piso de SO2 en 20, so2_caida_max, so2_aplica, ph_max_inclusive y los
 *      overrides por variedad y por proyecto).
 *   2. Las decisiones de FML que vivian en la hoja ESTADO_LOTE del Excel y
 *      nunca se migraron a `lotes.hace_fml`.
 *
 * Uso:
 *   node scripts/aplicar-datos-fml.mjs --local  --excel "<Lotes CIW 2026.xlsx>"
 *   node scripts/aplicar-datos-fml.mjs --local  --excel "<...>" --aplicar
 *   node scripts/aplicar-datos-fml.mjs --remote --excel "<...>" --aplicar
 *
 * Sin --aplicar solo informa lo que cambiaria. Es idempotente: nunca pisa un
 * valor cargado, asi que correrlo de nuevo no propone nada.
 *
 * NO usa `importar.mjs`: ese reemplaza el documento entero (DELETE + INSERT) y
 * revertiria en silencio lo que el equipo haya cargado desde la lectura. Este
 * toca solo los campos que faltan y va con candado: todas las sentencias
 * exigen que la version siga siendo la que se leyo.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { argv, exit } from 'node:process';
import { sembrarCriterios } from './sembrar-criterios-fml.mjs';
import { migrarDecisionesFml } from './migrar-decisiones-fml.mjs';
import { construirSqlMigracion } from './sql-migracion-fml.mjs';

const MODULO = 'lotes';

// ---- argumentos ----
const args = argv.slice(2);
const remoto = args.includes('--remote');
const local = args.includes('--local');
const aplicar = args.includes('--aplicar');
const valor = (bandera) => {
  const i = args.indexOf(bandera);
  return i >= 0 ? args[i + 1] : undefined;
};
const rutaExcel = valor('--excel');

if (!remoto && !local) {
  console.error('Falta indicar --local o --remote.');
  exit(1);
}
if (!rutaExcel) {
  console.error('Falta --excel con la ruta del "Lotes CIW 2026.xlsx".');
  exit(1);
}

const flag = remoto ? '--remote' : '--local';

/** Nombre de la base, leido de wrangler.jsonc para no tenerlo en dos lugares. */
function nombreBase() {
  const crudo = readFileSync('wrangler.jsonc', 'utf8');
  const limpio = crudo.replace(/\/\*[^]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  const nombre = JSON.parse(limpio)?.d1_databases?.[0]?.database_name;
  if (!nombre) throw new Error('no encontre database_name en wrangler.jsonc');
  return nombre;
}
const BASE = nombreBase();

/**
 * Corre una consulta y devuelve sus filas.
 *
 * Va siempre por --command: con --file y --remote, wrangler devuelve un resumen
 * ("Total queries executed") en lugar de las filas (la misma trampa que ya
 * documenta importar.mjs).
 */
function consultar(sql) {
  const salida = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', BASE, flag, '--json', '--command', `"${sql}"`],
    { encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(salida.slice(salida.indexOf('[')))?.[0]?.results ?? [];
}

// ---- 1. Leer el documento vivo ----
console.log(`\nLeyendo el documento de ${MODULO} de ${remoto ? 'la nube' : 'la base local'}...`);

const fila = consultar(
  `SELECT version, json_extract(json,'$.meta.version') AS meta_version, json FROM documento WHERE modulo='${MODULO}'`,
)[0];

if (!fila) {
  console.error(`No hay documento de ${MODULO} en la base. Nada que migrar.`);
  exit(1);
}

const version = Number(fila.version);
const doc = JSON.parse(fila.json);

/* La columna y el meta del JSON tienen que decir lo mismo: el candado mira la
 * columna y la app mira el meta. Si divergen, el candado no protegeria nada. */
if (Number(fila.meta_version) !== version) {
  console.error(
    `La version de la columna (${version}) no coincide con la del meta (${fila.meta_version}). Parar y revisar.`,
  );
  exit(1);
}

console.log(`  version ${version} - ${doc.lotes?.length ?? 0} lotes`);

if (remoto) {
  const fecha = new Date().toISOString().slice(0, 10);
  const respaldo = `respaldo-nube-lotes-${fecha}-pre-fml.json`;
  writeFileSync(respaldo, JSON.stringify([{ results: [{ json: fila.json }] }]), 'utf8');
  console.log(`  respaldo: ${respaldo}  (es el camino de vuelta)`);
}

// ---- 2. Leer ESTADO_LOTE del Excel ----
/* El SheetJS que ya usa la app para exportar sirve igual para leer, asi que la
 * migracion no agrega una dependencia. El bundle es para el navegador y no
 * exporta en CommonJS: declara `var XLSX` y listo, asi que `require()` devuelve
 * un objeto vacio. Envolverlo en una funcion convierte ese `var` en un local
 * que se puede devolver.
 *
 * Es el unico `new Function` del repo y no interpola nada: el cuerpo es un
 * archivo versionado nuestro mas la constante ';return XLSX;'. El riesgo de
 * inyeccion aparece cuando se concatena una variable, y aca no hay ninguna.
 * Correrlo equivale a lo que ya hace el navegador con este mismo archivo. */
const XLSX = new Function(readFileSync('public/shared/xlsx.full.min.js', 'utf8') + ';return XLSX;')();

let estadoLote;
try {
  const libro = XLSX.read(readFileSync(rutaExcel), { type: 'buffer', sheets: ['ESTADO_LOTE'] });
  const hoja = libro.Sheets['ESTADO_LOTE'];
  if (!hoja) throw new Error('el Excel no tiene la hoja ESTADO_LOTE');
  estadoLote = Object.fromEntries(
    XLSX.utils.sheet_to_json(hoja, { defval: '' }).map((f) => [f.lote, f.fml_excluida]),
  );
} catch (e) {
  console.error(`\nNo se pudo leer ${rutaExcel}: ${e.message}`);
  exit(1);
}
console.log(`  ESTADO_LOTE: ${Object.keys(estadoLote).length} filas`);

// ---- 3. Calcular los dos parches ----
const criterios = sembrarCriterios(doc.config?.criterios_fml);
const decisiones = migrarDecisionesFml(doc.lotes ?? [], estadoLote);

console.log('\n-- Criterios --');
console.log(
  criterios.agregadas.length
    ? `  ${criterios.agregadas.length} claves a agregar: ${criterios.agregadas.join(', ')}`
    : '  nada que agregar (ya estan sembrados)',
);

console.log('\n-- Decisiones de FML --');
const porVariedad = {};
for (const c of decisiones.cambios) porVariedad[c.variedad] = (porVariedad[c.variedad] ?? 0) + 1;
console.log(`  ${decisiones.cambios.length} lotes a completar`);
for (const [v, n] of Object.entries(porVariedad).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(4)}  ${v}`);
}
console.log(
  `  salteados: ${decisiones.salteados.ya_decididos} ya decididos - ` +
    `${decisiones.salteados.blancas} blancas (las decide la variedad) - ` +
    `${decisiones.salteados.inactivos} sin litros`,
);
console.log(`  quedan sin decision: ${decisiones.sinDecision.length} lotes activos`);
for (const s of decisiones.sinDecision) console.log(`    ${s.lote} ${s.variedad} (${s.motivo})`);

if (!criterios.agregadas.length && !decisiones.cambios.length) {
  console.log('\nNo hay nada que aplicar. La base ya tiene los dos datos.\n');
  exit(0);
}

if (!aplicar) {
  console.log('\nEsto fue un informe. Para escribirlo, repetilo con --aplicar.\n');
  exit(0);
}

// ---- 4. Armar el SQL ----
const { sentencias, sql } = construirSqlMigracion({
  version,
  cambios: decisiones.cambios,
  criterios,
  tieneConfig: Boolean(doc.config),
});

const archivoSql = 'migrar-fml.generado.sql';
writeFileSync(archivoSql, sql, 'utf8');
console.log(`\nSQL generado: ${archivoSql} (${sentencias.length} sentencias)`);

// ---- 5. Aplicarlo ----
try {
  console.log(`\nAplicando con wrangler ${flag}...\n`);
  execFileSync('npx', ['wrangler', 'd1', 'execute', BASE, flag, `--file=${archivoSql}`, '--yes'], {
    stdio: 'inherit',
    shell: true,
  });
} catch {
  console.error(`\nFallo al aplicar. El SQL quedo en ${archivoSql} para revisarlo.`);
  exit(1);
}

// ---- 6. Verificar ----
console.log('\nVerificando lo que quedo guardado...\n');

const control = consultar(
  `SELECT version, ` +
    `(SELECT COUNT(*) FROM json_each(json,'$.lotes') WHERE json_extract(value,'$.hace_fml') IN ('si','no')) AS con_decision, ` +
    `json_extract(json,'$.config.criterios_fml.default.so2_caida_max') AS so2_caida_max ` +
    `FROM documento WHERE modulo='${MODULO}'`,
)[0];

if (Number(control?.version) !== version + 1) {
  console.error(
    `La version quedo en ${control?.version} y esperaba ${version + 1}.\n` +
      `  El candado freno la migracion: alguien guardo entre la lectura y la escritura.\n` +
      `  No se toco nada. Volve a correrlo.\n`,
  );
  exit(1);
}

const esperados = decisiones.salteados.ya_decididos + decisiones.cambios.length;
const okDecisiones = Number(control.con_decision) >= esperados;

console.log(`  version              ${version} -> ${control.version}`);
console.log(
  `  lotes con decision   ${control.con_decision}  (esperaba al menos ${esperados})  ${okDecisiones ? 'OK' : 'NO COINCIDE'}`,
);
console.log(`  so2_caida_max        ${control.so2_caida_max ?? '(falta)'}`);

if (!okDecisiones || control.so2_caida_max == null) {
  console.error('\nLa verificacion no cierra. Revisar antes de desplegar.\n');
  exit(1);
}

console.log('\nMigracion aplicada y verificada.\n');
