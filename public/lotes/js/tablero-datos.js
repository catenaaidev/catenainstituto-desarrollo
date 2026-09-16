/* ===== Lotes CIW — el tablero, lo que se puede decidir sin DOM =====
 *
 * Modulo puro: sin DOM, sin fetch, sin estado. Todo lo que la pestana necesita
 * derivar de una fila del dashboard vive aca, para poder testearlo.
 *
 * "Derivar" no es "recalcular": los estados y la antiguedad los decide el
 * motor en el servidor. Aca solo se elige que texto y que color le toca a
 * cada uno. Si algo no se puede pintar sin volver a aplicar una regla, le
 * falta un campo a la salida del motor.
 */
'use strict';

const DIA = 86400000;

/** Dias entre dos fechas ISO, en UTC. Nunca hora local: el motor cuenta igual. */
export function diasEntre(desde, hoy){
  if (!desde || !hoy) return null;
  const a = Date.parse(desde + 'T00:00:00Z');
  const b = Date.parse(hoy + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / DIA);
}

export function antiguedadTexto(desde, hoy){
  const d = diasEntre(desde, hoy);
  if (d === null) return '';
  return d <= 0 ? 'hoy' : `${d} d`;
}

/* Los cinco ejes que siempre se muestran: el chip cambia de texto y de color
 * segun el estado, pero nunca desaparece. Leer la fila de un vistazo es el
 * punto del tablero. */
const EJES = [
  { clave: 'frecuencia', campo: 'estado_frecuencia', cond: 'frecuencia_vencida',
    ok: 'Frec',  mal: 'Frec vencida', okSi: 'al_dia' },
  { clave: 'fml',        campo: 'fml_estado',        cond: 'fml_no_finalizada',
    ok: 'FML',   mal: 'FML no',       okSi: ['finalizada', 'excluida'] },
  { clave: 'so2',        campo: 'so2_estado',        cond: 'so2_no_ok',
    ok: 'SO₂',   mal: 'SO₂ no',       okSi: 'ok' },
  { clave: 'ph',         campo: 'ph_estado',         cond: 'ph_no_ok',
    ok: 'pH',    mal: 'pH no',        okSi: 'ok' },
  { clave: 'llenado',    campo: 'estado_llenado',    cond: 'no_lleno',
    ok: 'Lleno', mal: 'No lleno',     okSi: 'lleno' },
];

/* Los dos que solo aparecen cuando el motor los prende. */
const EVENTUALES = [
  { clave: 'av_alerta',        cond: 'av_alerta',        texto: 'AV alerta' },
  { clave: 'so2_caida_alerta', cond: 'so2_caida_alerta', texto: 'Caída SO₂' },
];

const esOk = (valor, okSi) => Array.isArray(okSi) ? okSi.includes(valor) : valor === okSi;

export function chipsDe(fila, hoy){
  const activas = new Map((fila.condiciones || []).map(c => [c.clave, c]));
  const chips = [];

  const conSufijo = (texto, cond) => {
    const ant = antiguedadTexto(cond && cond.desde, hoy);
    return ant ? `${texto} · ${ant}` : texto;
  };
  const titulo = (cond, porDefecto) =>
    cond ? `${cond.etiqueta} — ${cond.accion}` : porDefecto;

  for (const eje of EJES){
    const cond = activas.get(eje.cond);
    const valor = fila[eje.campo];
    let tono;
    if (cond) tono = 'mal';
    else if (esOk(valor, eje.okSi)) tono = 'ok';
    else tono = 'neutro';   // no_aplica, sin_datos, sin_dato, desconocido

    chips.push({
      clave: eje.clave,
      texto: cond ? conSufijo(eje.mal, cond) : eje.ok,
      tono,
      titulo: titulo(cond, String(valor ?? '')),
    });
  }

  for (const ev of EVENTUALES){
    const cond = activas.get(ev.cond);
    if (!cond) continue;
    chips.push({ clave: ev.clave, texto: conSufijo(ev.texto, cond), tono: 'mal', titulo: titulo(cond, ev.texto) });
  }

  return chips;
}
