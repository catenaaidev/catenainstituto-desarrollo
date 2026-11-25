/* ===== Lotes CIW — hoja de recorrida del inventario de tanques (puro) =====
 * El formulario de la hoja "Inventario" del Excel de Oriana (N° de vasija,
 * Lote, cm Merma / Lleno; sin Velo, que no se usa) en dos columnas, con el lote ya puesto. */
'use strict';

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const POR_HOJA = 40, POR_COLUMNA = 20;

const fechaAr = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

function tabla(filas){
  const tr = filas.map(f => `<tr><td class="inv-h-num">${esc(f.num)}</td><td>${esc((f.lotes || []).map(o => o.lote).join(' + '))}</td><td></td></tr>`).join('');
  return `<table class="inv-h-tabla"><thead><tr><th>N° de vasija</th><th>Lote</th><th>cm Merma / Lleno</th></tr></thead><tbody>${tr}</tbody></table>`;
}

export function hojaRecorridaHTML(filas, fecha){
  const hojas = [];
  for (let i = 0; i < Math.max(1, filas.length); i += POR_HOJA){
    const parte = filas.slice(i, i + POR_HOJA);
    hojas.push(`<div class="orden-hoja inv-hoja">
      <div class="inv-h-titulo">Inventario de vasijas fijas de CIW — recorrida del ${esc(fechaAr(fecha))}</div>
      <div class="inv-h-cols">${tabla(parte.slice(0, POR_COLUMNA))}${tabla(parte.slice(POR_COLUMNA))}</div>
      <div class="inv-h-firma">Recorrió: ______________________ &nbsp; Firma: ______________________</div>
    </div>`);
  }
  return hojas.join('');
}
