/**
 * Convierte las filas crudas del Excel de Prensas al formato de la web.
 * NO escribe en la base.
 *
 *   python scripts/leer-excel-prensas.py "<Lotes prensas 2025.xlsx>" datos-origen/prensas-2025-crudo.json
 *   node scripts/convertir-prensas.mjs datos-origen/prensas-2025-crudo.json datos-origen/prensas-2025-convertido.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { convertirPrensas } from './convertir-prensas-nucleo.mjs';

const [entrada, salida] = process.argv.slice(2);
if (!entrada || !salida) { console.error('uso: node scripts/convertir-prensas.mjs <crudo.json> <salida.json>'); process.exit(1); }
const { lotes, analisis, reporte } = convertirPrensas(JSON.parse(readFileSync(entrada, 'utf8')));
writeFileSync(salida, JSON.stringify({ lotes, analisis }));
console.log(`${reporte.lotes} lotes, ${reporte.analisis} análisis (${reporte.vacios_salteados} renglones vacíos salteados)`);
if (reporte.huerfanos.length) console.log(`AVISO: análisis de lotes que no están en LOTES: ${reporte.huerfanos.join(', ')}`);
console.log(`Escrito en ${salida}`);
