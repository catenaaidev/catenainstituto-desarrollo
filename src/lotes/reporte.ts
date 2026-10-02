/**
 * Reporte de Lotes para gerencia — port de reporte.py de la app local.
 *
 * A diferencia del de Prensas (que es una página con su JS adentro), este se
 * arma en el servidor con el motor FML. Es la misma página, con las mismas
 * tablas y el mismo buscador.
 *
 * Lo que cambia: antes se escribía un archivo en el disco en cada guardado y
 * había que mandarlo por mail. Ahora se sirve en vivo, así que nunca queda
 * viejo.
 */

import { evaluar, normalizarConfig, CONDICIONES, type Fila } from './motores/fml';
import { normalizarLote } from './motores/linaje';

const ETIQUETAS_ALARMA: Record<string, string> = Object.fromEntries(
  Object.entries(CONDICIONES).map(([k, v]) => [k, v.etiqueta]),
);

function esc(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const celda = (v: unknown) => (v === null || v === undefined ? '' : esc(v));

const ESTILOS = `
 body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;background:#f6f3ee;color:#2a2622}
 header{background:#5a3a2e;color:#fff;padding:14px 20px}
 header h1{margin:0;font-size:20px} header .sub{opacity:.8;font-size:13px;margin-top:4px}
 .wrap{max-width:1100px;margin:0 auto;padding:16px}
 .kpis{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}
 .kpi{background:#fff;border:1px solid #e0dacd;border-radius:8px;padding:14px 18px;flex:1;min-width:140px;text-align:center}
 .kpi .n{font-size:30px;font-weight:700} .kpi .l{color:#8c857b;font-size:13px}
 h2{font-size:16px;margin:20px 0 6px} table{border-collapse:collapse;width:100%;background:#fff;font-size:13px}
 th,td{border:1px solid #e6e0d5;padding:4px 7px;text-align:left} th{background:#efe9dd;position:sticky;top:0}
 td.num{text-align:right} tr.venc{background:#fbe9c8}
 #q{padding:7px 10px;width:100%;max-width:320px;margin:8px 0;border:1px solid #cfc7b8;border-radius:6px}
 @media print{ #q{display:none} th{position:static} }`;

const BUSCADOR = `
function filtrar(){var q=document.getElementById('q').value.toLowerCase();
 ['tLo','tAn'].forEach(function(id){var rows=document.querySelectorAll('#'+id+' tbody tr');
  rows.forEach(function(r){r.style.display=r.textContent.toLowerCase().indexOf(q)>=0?'':'none';});});}`;

/** Arma el reporte completo. `hoy` en milisegundos UTC del día. */
export function construirReporte(datos: Record<string, unknown>, version: number, ahora: string, hoy: number): string {
  const res = evaluar(normalizarConfig(datos), hoy);
  const { kpis, alarmas } = res;
  // La misma clave que usa evaluar() (normalizarLote): con String() de un lado
  // y del otro andaba solo mientras los dos vinieran escritos igual.
  const evPorLote = new Map(res.lotes.map((r) => [normalizarLote(r.lote), r]));

  const kpiHtml =
    '<div class="kpis">' +
    `<div class="kpi"><div class="n">${kpis.total_activos}</div><div class="l">Lotes activos</div></div>` +
    `<div class="kpi"><div class="n">${kpis.vencidos}</div><div class="l">Vencidos</div></div>` +
    `<div class="kpi"><div class="n">${kpis.condicion_ideal}</div><div class="l">Condición ideal</div></div>` +
    '</div>';

  // Alarmas, de la más frecuente a la menos.
  const filasAl =
    Object.entries(alarmas)
      .sort((a, b) => b[1].cantidad - a[1].cantidad)
      .map(
        ([cond, info]) =>
          `<tr><td>${esc(ETIQUETAS_ALARMA[cond] ?? cond)}</td>` +
          `<td class="num">${info.cantidad}</td><td>${esc(info.accion)}</td></tr>`,
      )
      .join('') || '<tr><td colspan="3">Sin alarmas 🎉</td></tr>';

  // Solo los activos: evaluar() ya filtró los de litros 0.
  const filasLo = ((datos.lotes as Fila[]) ?? [])
    .map((l) => {
      const ev = evPorLote.get(normalizarLote((l ?? {}).lote));
      if (!ev) return '';
      return (
        `<tr class="${ev.vencido ? 'venc' : ''}">` +
        `<td>${celda(l.lote)}</td><td>${celda(l.variedad)}</td><td>${celda(l.distrito)}</td>` +
        `<td>${celda(l.proyecto)}</td><td>${celda(l.vasija_actual)}</td>` +
        `<td class="num">${celda(l.litros_actuales)}</td><td>${celda(ev.fml_estado)}</td>` +
        `<td>${ev.vencido ? 'sí' : ''}</td></tr>`
      );
    })
    .join('');

  const filasAn = ((datos.analisis as Fila[]) ?? [])
    .map(
      (a) =>
        `<tr><td>${celda(a.lote)}</td><td>${celda(a.fecha_analisis)}</td><td>${celda(a.ph)}</td>` +
        `<td>${celda(a.av)}</td><td>${celda(a.gluc_fruc)}</td><td>${celda(a.malico)}</td>` +
        `<td>${celda(a.so2_libre)}</td></tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reporte Lotes</title>
<style>${ESTILOS}
</style></head>
<body>
<header><h1>Reporte Lotes — CIW</h1><div class="sub">Datos al ${esc(ahora)} — versión ${version} · SOLO LECTURA</div></header>
<div class="wrap">
 ${kpiHtml}
 <h2>Alarmas</h2>
 <table><thead><tr><th>Condición</th><th class="num">Lotes</th><th>Acción</th></tr></thead><tbody>${filasAl}</tbody></table>
 <input id="q" placeholder="Buscar (filtra las tablas de abajo)…" oninput="filtrar()">
 <h2>Lotes activos</h2>
 <table id="tLo"><thead><tr><th>Lote</th><th>Variedad</th><th>Distrito</th><th>Proyecto</th><th>Vasija</th><th class="num">Litros</th><th>FML</th><th>Vencido</th></tr></thead><tbody>${filasLo}</tbody></table>
 <h2>Análisis</h2>
 <table id="tAn"><thead><tr><th>Lote</th><th>Fecha</th><th>pH</th><th>AV</th><th>Gluc/Fruc</th><th>Málico</th><th>SO2 libre</th></tr></thead><tbody>${filasAn}</tbody></table>
</div>
<script>${BUSCADOR}
</script>
</body></html>`;
}
