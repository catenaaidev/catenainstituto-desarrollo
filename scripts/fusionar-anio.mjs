/**
 * Suma una vendimia del Excel al documento de Lotes, en un archivo nuevo.
 * NO escribe en la base: la subida es importar.mjs, con su respaldo y su freno.
 *
 *   python "<repo Lotes>\migrar_excel.py" "Lotes CIW 2025.xlsx" datos-origen/lotes-2025-convertido.json
 *   node scripts/fusionar-anio.mjs --anio 2025 \
 *        --doc respaldo-nube-lotes-<fecha>.json \
 *        --anio-json datos-origen/lotes-2025-convertido.json \
 *        --salida datos-origen/lotes-con-2025.json
 *
 * --doc acepta el respaldo de `wrangler d1 execute --json` (array con
 * results[0].json) o un documento pelado.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fusionarAnio } from './fusionar-anio-nucleo.mjs';

const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
const anio = Number(arg('--anio'));
const rDoc = arg('--doc'), rAnio = arg('--anio-json'), rSal = arg('--salida');
if (!anio || !rDoc || !rAnio || !rSal) {
  console.error('uso: node scripts/fusionar-anio.mjs --anio 2025 --doc <respaldo> --anio-json <convertido> --salida <archivo>');
  process.exit(1);
}

const crudo = JSON.parse(readFileSync(rDoc, 'utf8'));
const doc = Array.isArray(crudo) ? JSON.parse(crudo[0].results[0].json) : crudo;
const { doc: nuevo, reporte } = fusionarAnio(doc, JSON.parse(readFileSync(rAnio, 'utf8')), anio);

writeFileSync(rSal, JSON.stringify(nuevo));
console.log(`Documento v${doc.meta?.version}: +${reporte.lotes} lotes ${anio}, +${reporte.analisis} análisis`
  + ` (${reporte.analisis_vacios} renglones vacíos salteados)`);
if (reporte.huerfanos.length) console.log(`AVISO: análisis de lotes que no están en LOTES: ${reporte.huerfanos.join(', ')}`);
console.log(`Escrito en ${rSal} (${(JSON.stringify(nuevo).length / 1e6).toFixed(2)} MB)`);
