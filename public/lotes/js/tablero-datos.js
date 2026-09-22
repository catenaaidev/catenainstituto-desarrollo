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
  return d === 0 ? 'hoy' : `${d} d`;
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

/* --- orden por defecto: las condiciones mas viejas primero --- */

/* Tres escalones, y el del medio es el que importa: un lote con una condicion
 * activa pero sin fecha (no_lleno, datos incompletos) esta peor que uno sano,
 * asi que no puede caer al fondo junto con los sanos. */
const SIN_FECHA = '9999-12-30';
const SANO = '9999-12-31';

function masVieja(fila){
  const fechas = (fila.condiciones || []).map(c => c.desde).filter(Boolean).sort();
  if (fechas.length) return fechas[0];
  return (fila.condiciones || []).length ? SIN_FECHA : SANO;
}

export function ordenarPorAntiguedad(filas){
  return [...filas].sort((a, b) => masVieja(a).localeCompare(masVieja(b)));
}

/* --- preguntas frecuentes --- */

export const PREGUNTAS = [
  { val: 'fml_no_terminada', text: 'FML no terminada' },
  { val: 'fml_terminada',    text: 'FML terminada' },
  { val: 'mermos',           text: 'Mermos' },
  { val: 'faltan_analizar',  text: 'Faltan analizar' },
  { val: 'fa_en_proceso',    text: 'FA en proceso' },
];

/* Las tres condiciones cuya accion sugerida es "hacer OT y analizar". */
const PIDEN_OT = ['sin_analisis_valido', 'control_proceso_pendiente', 'frecuencia_vencida'];

export function pasaPregunta(fila, val){
  if (!val) return true;
  const alarmas = fila.alarmas || [];
  switch (val){
    case 'fml_no_terminada': return fila.fml_estado === 'no_finalizada';
    case 'fml_terminada':    return fila.fml_estado === 'finalizada' || fila.fml_estado === 'excluida';
    case 'mermos':           return fila.estado_llenado === 'no_lleno';
    case 'faltan_analizar':  return PIDEN_OT.some(c => alarmas.includes(c));
    case 'fa_en_proceso':    return fila.fa_estado === 'no_finalizada';
    default:                 return true;
  }
}

/* --- el panel --- */

const EJES_PANEL = [
  { clave: 'fml_terminada',     label: 'FML terminada' },
  { clave: 'frecuencia_al_dia', label: 'Frecuencia al día' },
  { clave: 'so2_conforme',      label: 'SO₂ conforme' },
  { clave: 'ph_ok',             label: 'pH OK' },
  { clave: 'lleno',             label: 'Lleno' },
  { clave: 'requieren_accion',  label: 'Requieren acción', alReves: true },
];

export function tarjetasDe(kpis){
  const total = Number((kpis || {}).total_activos) || 0;
  return EJES_PANEL.map(e => {
    const cantidad = Number((kpis || {})[e.clave]) || 0;
    const pct = total ? Math.round((cantidad / total) * 100) : 0;
    // "Requieren accion" es el unico eje donde mas es peor.
    return { clave: e.clave, label: e.label, cantidad, total, pct, hi: e.alReves ? cantidad > 0 : false };
  });
}

/** Verde sin condiciones, gris con una, rojo con dos o mas. */
export function tonoMosaico(fila){
  const n = (fila.condiciones || []).length;
  return n === 0 ? 'ok' : (n === 1 ? 'neutro' : 'mal');
}

/* --- la ficha --- */

/* Los seis campos que el motor considera "medicion util". Se replican aca solo
 * para decidir que filas vale la pena mostrar; ninguna condicion se recalcula.
 * Una fila cuenta si trae al menos una metrica informada; un -999 esta
 * informado (es el FOSS diciendo "fuera de rango"), igual que hace el motor. */
const UTILES = ['ph', 'av', 'malico', 'azucar_reductor', 'so2_libre', 'etanol'];

const util = (v) => v !== null && v !== undefined && v !== '';

export function ultimasMediciones(analisis, lote, n){
  const clave = String(lote ?? '');
  return (analisis || [])
    .filter(a => String(a.lote ?? '') === clave && a.fecha_analisis)
    .filter(a => UTILES.some(k => util(a[k])))
    .sort((a, b) => String(b.fecha_analisis).localeCompare(String(a.fecha_analisis)))
    .slice(0, n);
}

/* Donde escribe cada campo.
 *
 * mermo y hace_fml tienen columna propia en el lote, asi que van ahi: un solo
 * valor en un solo lugar, sin capa de override que explicar. Comentario e
 * inoculado no la tienen y siguen en estado_lote. */
const EN_EL_LOTE = ['mermo', 'hace_fml'];
const EN_ESTADO  = ['comentario', 'inoculado'];

export function aplicarEdicion(datos, lote, campo, valor, autor){
  const clave = String(lote ?? '');
  const fila = (datos.lotes || []).find(l => String(l.lote ?? '') === clave);
  if (!fila) return { seccion: null };

  const limpio = String(valor ?? '').trim() === '' ? null : String(valor).trim();
  const seccion = EN_EL_LOTE.includes(campo) ? 'lote' : (EN_ESTADO.includes(campo) ? 'estado_lote' : null);
  if (!seccion) return { seccion: null };

  if (seccion === 'lote') fila[campo] = limpio;

  // La firma va siempre a estado_lote: el lote no tiene columnas para quien y cuando.
  datos.estado_lote = datos.estado_lote || {};
  const est = (datos.estado_lote[clave] = datos.estado_lote[clave] || {});
  if (seccion === 'estado_lote') est[campo] = limpio;
  est.actualizado_por = autor;
  est.actualizado_el = new Date().toISOString();

  return { seccion };
}
