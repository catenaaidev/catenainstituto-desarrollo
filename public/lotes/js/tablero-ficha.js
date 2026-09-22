/* ===== Lotes CIW — la ficha del tablero =====
 *
 * Todo lo que muestra sale resuelto del motor. La unica cuenta que hace la
 * ficha es elegir que mediciones listar, y eso vive en tablero-datos.js.
 */
'use strict';

import { esc, escA } from './nucleo.js';
import { chipsDe, ultimasMediciones } from './tablero-datos.js';

const dato = (label, valor) => `<div class="tb-dato"><span>${esc(label)}</span><strong>${esc(valor ?? '—')}</strong></div>`;

function selecFicha(campo, label, valor, opciones){
  const ops = opciones.map(o => `<option value="${escA(o)}"${String(valor ?? '') === o ? ' selected' : ''}>${esc(o || '—')}</option>`).join('');
  return `<div class="tb-dato"><span>${esc(label)}</span><select class="tb-edit" data-campo="${escA(campo)}">${ops}</select></div>`;
}

/* El -999 es el FOSS diciendo "fuera de rango", no una medicion de -999. */
const celda = (v) => (v === null || v === undefined || v === '') ? '' : (Number(v) === -999 ? 'fuera de rango' : v);

export function htmlFicha(fila, analisis, hoy){
  const chips = chipsDe(fila, hoy).filter(c => c.tono === 'mal');
  const c = fila.so2_caida || {};
  const mediciones = ultimasMediciones(analisis, fila.lote, 6);

  const avisoAv = fila.av_alerta ? `
    <div class="tb-aviso">
      <strong>Por qué requiere atención:</strong>
      ${esc({ umbral: 'el AV superó el máximo', aumento: 'el AV subió más de lo tolerado entre análisis',
              fuera_rango_foss: 'el FOSS informó −999 (medición fuera de rango)' }[fila.av_motivo] || 'alerta de AV')}
    </div>` : '';

  const evidencia = c.alerta ? `
    <div class="tb-aviso">
      El SO₂ libre bajó de ${esc(c.anterior)} (${esc(c.anterior_fecha)})
      a ${esc(c.actual)} (${esc(c.actual_fecha)}): ${esc(c.caida)} ppm.
    </div>` : '';

  // Avisa cuando el pH de referencia viene de otra muestra que la del SO2.
  const phRef = fila.so2_ph_referencia_fecha && fila.so2_ph_referencia_fecha !== fila.so2_libre_fecha
    ? `${fila.so2_ph_referencia} (del ${fila.so2_ph_referencia_fecha})`
    : fila.so2_ph_referencia;

  const inoculado = fila.inoculado_origen === 'analisis' ? `${fila.inoculado} (detectado en el análisis)`
    : fila.inoculado_origen === 'manual' ? `${fila.inoculado} (cargado a mano)`
    : fila.inoculado;

  return `
    <div class="tb-ficha" data-ficha-de="${escA(fila.lote)}">
      <h3>${esc(fila.lote)} · ${esc(fila.variedad ?? '')}</h3>
      <div>${chips.map(x => `<span class="tb-chip ${x.tono}" title="${escA(x.titulo)}">${esc(x.texto)}</span>`).join('') || '<span class="tb-sub">Sin condiciones activas.</span>'}</div>
      ${avisoAv}
      <div class="tb-grilla">
        ${dato('Vasija', fila._info.vasija_actual)}
        ${dato('Litros', fila.litros)}
        ${dato('Última medición', fila.ultima_fecha)}
        ${dato('Último control de proceso', fila.ultima_fecha_control)}
        ${dato('Frecuencia', `${fila.frecuencia_max} d (hace ${fila.dias_desde_control ?? '—'})`)}
        ${/* El motor solo detecta 'analisis'; el valor a mano vive en estado_lote y lo resuelve la pestana. */''}
        ${selecFicha('inoculado', 'Inoculación', (fila._est || {}).inoculado ?? fila.inoculado, ['', 'si', 'no', 'desconocido'])}
        ${selecFicha('mermo', 'Mermo', fila._info.mermo, ['', 'si', 'no'])}
        ${selecFicha('hace_fml', 'Hace FML', fila._info.hace_fml, ['', 'si', 'no'])}
      </div>
      <div class="tb-so2">
        <h4>SO₂</h4>
        ${dato('Libre', fila.so2_libre !== null ? `${fila.so2_libre} (${fila.so2_libre_fecha ?? '—'})` : '—')}
        ${dato('pH de referencia', phRef)}
        ${dato('Molecular', fila.so2_molecular)}
        ${dato('Motivo', fila.so2_motivo)}
      </div>
      ${evidencia}
      <p><strong>Acción sugerida:</strong> ${esc(fila.accion_sugerida || '—')}</p>
      <div class="tb-dato"><span>Comentario</span>
        <input class="tb-edit" data-campo="comentario" value="${escA((fila._est || {}).comentario ?? '')}"></div>
      <table class="tb-tabla">
        <thead><tr><th>Fecha</th><th>pH</th><th>AV</th><th>Málico</th><th>Az. red.</th><th>SO₂ libre</th><th>Etanol</th></tr></thead>
        <tbody>${mediciones.map(m => `<tr>
          <td>${esc(m.fecha_analisis)}</td><td>${esc(celda(m.ph))}</td><td>${esc(celda(m.av))}</td>
          <td>${esc(celda(m.malico))}</td><td>${esc(celda(m.azucar_reductor))}</td>
          <td>${esc(celda(m.so2_libre))}</td><td>${esc(celda(m.etanol))}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
}
