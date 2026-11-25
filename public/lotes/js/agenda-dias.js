/* ===== Lotes CIW — Agenda: fechas, dias habiles, feriados y parametros =====
 *
 * Modulo PURO (sin DOM ni nucleo.js): lo importan agenda.js, las vistas y los
 * tests. Las fechas son texto ISO 'AAAA-MM-DD' y se cuentan en UTC, como
 * fechaDia() del servidor: asi el huso horario nunca corre un dia.
 */
'use strict';

const DIA_MS = 86400000;
const _ms = (f) => Date.parse(String(f).slice(0, 10) + 'T00:00:00Z');
const _iso = (t) => new Date(t).toISOString().slice(0, 10);

export const AGENDA_DEFAULT = Object.freeze({
  cupo_analisis: 55,      // analisis por dia habil (el laboratorio hace 50-60)
  cupo_trasiegos: 4,      // lotes trasegados por dia habil
  aviso_dias: 5,          // "proximo a vencer"
  horizonte_semanas: 8,   // cuanto calendario se calcula
  ronda_tanques_dia: 4,   // ronda semanal de analisis de tanques: 1 = lunes … 5 = viernes, 0 = sin ronda
});

/* Minimo y maximo aceptados por parametro (todos enteros). El tope de semanas
 * evita que un numero enorme arme un calendario de miles de dias. */
export const MINIMOS = Object.freeze({ cupo_analisis: 0, cupo_trasiegos: 0, aviso_dias: 0, horizonte_semanas: 1, ronda_tanques_dia: 0 });
export const MAXIMOS = Object.freeze({ horizonte_semanas: 52, ronda_tanques_dia: 5 });
const _enRango = (k, n) => Number.isInteger(n) && n >= MINIMOS[k] && !(n > MAXIMOS[k]);

/* Feriados nacionales de Argentina. Los trasladables siguen la ley 27.399 y los
 * "puentes" son los del decreto de cada año: el usuario los revisa en
 * Configuracion (los de 2027 todavia no estaban decretados al cargarlos). */
export const FERIADOS_AR = Object.freeze([
  { fecha: '2026-01-01', nombre: 'Año Nuevo' },
  { fecha: '2026-02-16', nombre: 'Carnaval' },
  { fecha: '2026-02-17', nombre: 'Carnaval' },
  { fecha: '2026-03-23', nombre: 'Feriado puente' },
  { fecha: '2026-03-24', nombre: 'Día de la Memoria' },
  { fecha: '2026-04-02', nombre: 'Malvinas' },
  { fecha: '2026-04-03', nombre: 'Viernes Santo' },
  { fecha: '2026-05-01', nombre: 'Día del Trabajador' },
  { fecha: '2026-05-25', nombre: 'Revolución de Mayo' },
  { fecha: '2026-06-15', nombre: 'Paso a la Inmortalidad de Güemes' },
  { fecha: '2026-06-20', nombre: 'Día de la Bandera' },
  { fecha: '2026-07-09', nombre: 'Día de la Independencia' },
  { fecha: '2026-07-10', nombre: 'Feriado puente' },
  { fecha: '2026-08-17', nombre: 'Paso a la Inmortalidad de San Martín' },
  { fecha: '2026-10-12', nombre: 'Día del Respeto a la Diversidad Cultural' },
  { fecha: '2026-11-23', nombre: 'Día de la Soberanía Nacional' },
  { fecha: '2026-12-07', nombre: 'Feriado puente' },
  { fecha: '2026-12-08', nombre: 'Inmaculada Concepción' },
  { fecha: '2026-12-25', nombre: 'Navidad' },
  { fecha: '2027-01-01', nombre: 'Año Nuevo' },
  { fecha: '2027-02-08', nombre: 'Carnaval' },
  { fecha: '2027-02-09', nombre: 'Carnaval' },
  { fecha: '2027-03-24', nombre: 'Día de la Memoria' },
  { fecha: '2027-03-26', nombre: 'Viernes Santo' },
  { fecha: '2027-04-02', nombre: 'Malvinas' },
  { fecha: '2027-05-01', nombre: 'Día del Trabajador' },
  { fecha: '2027-05-25', nombre: 'Revolución de Mayo' },
  { fecha: '2027-06-20', nombre: 'Día de la Bandera' },
  { fecha: '2027-06-21', nombre: 'Paso a la Inmortalidad de Güemes' },
  { fecha: '2027-07-09', nombre: 'Día de la Independencia' },
  { fecha: '2027-08-16', nombre: 'Paso a la Inmortalidad de San Martín' },
  { fecha: '2027-10-11', nombre: 'Día del Respeto a la Diversidad Cultural' },
  { fecha: '2027-11-20', nombre: 'Día de la Soberanía Nacional' },
  { fecha: '2027-12-08', nombre: 'Inmaculada Concepción' },
  { fecha: '2027-12-25', nombre: 'Navidad' },
].map(Object.freeze));

/* ---------- fechas ---------- */

export function esIso(s){
  const t = String(s ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const ms = _ms(t);
  return !Number.isNaN(ms) && _iso(ms) === t; // descarta 2026-02-30
}
export function sumarDias(f, n){ return _iso(_ms(f) + n * DIA_MS); }
/** b − a, en dias. */
export function difDias(a, b){ return Math.round((_ms(b) - _ms(a)) / DIA_MS); }
/** 0 = domingo … 6 = sabado. */
export function diaSemana(f){ return new Date(_ms(f)).getUTCDay(); }
export function lunesDe(f){ const d = diaSemana(f); return sumarDias(f, d === 0 ? -6 : 1 - d); }

/* ---------- config efectiva ---------- */

const _copiaFeriados = (lista) => lista.map(f => ({ fecha: f.fecha, nombre: f.nombre }));

/** Parametros que rigen: config.agenda validada y completada con los defaults. */
export function configAgenda(config){
  const a = (config && typeof config === 'object' && config.agenda
    && typeof config.agenda === 'object' && !Array.isArray(config.agenda)) ? config.agenda : {};
  const out = { ...AGENDA_DEFAULT };
  for (const k of Object.keys(AGENDA_DEFAULT)){
    const v = Number(a[k]);
    if (_enRango(k, v)) out[k] = v;
  }
  out.feriados = Array.isArray(a.feriados)
    ? a.feriados.filter(f => f && esIso(f.fecha))
        .map(f => ({ fecha: String(f.fecha), nombre: String(f.nombre ?? '') }))
    : _copiaFeriados(FERIADOS_AR);
  return out;
}

export function mapaFeriados(feriados){ return new Map((feriados || []).map(f => [f.fecha, f.nombre])); }
export function esHabil(f, mapa){ const d = diaSemana(f); return d !== 0 && d !== 6 && !mapa.has(f); }

/* ---------- edicion (Configuracion) ----------
 * Mientras nadie edita, config.agenda no existe y rigen los defaults. La
 * primera edicion la materializa entera, feriados incluidos. */

export function asegurarConfigAgenda(datos){
  if (!datos.config || typeof datos.config !== 'object' || Array.isArray(datos.config)) datos.config = {};
  const c = datos.config;
  if (!c.agenda || typeof c.agenda !== 'object' || Array.isArray(c.agenda)) c.agenda = configAgenda(c);
  return c.agenda;
}

export function fijarParametro(datos, k, valor){
  if (!(k in AGENDA_DEFAULT)) return false;
  const n = Number(String(valor ?? '').trim());
  if (String(valor ?? '').trim() === '' || !_enRango(k, n)) return false;
  asegurarConfigAgenda(datos)[k] = n;
  return true;
}

export function agregarFeriado(datos, fecha, nombre){
  if (!esIso(fecha)) return false;
  const a = asegurarConfigAgenda(datos);
  if (a.feriados.some(f => f.fecha === fecha)) return false;
  a.feriados.push({ fecha, nombre: String(nombre ?? '').trim() });
  a.feriados.sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0));
  return true;
}

export function quitarFeriado(datos, fecha){
  const a = asegurarConfigAgenda(datos);
  const antes = a.feriados.length;
  a.feriados = a.feriados.filter(f => f.fecha !== fecha);
  return a.feriados.length !== antes;
}

export function restaurarFeriados(datos){ asegurarConfigAgenda(datos).feriados = _copiaFeriados(FERIADOS_AR); }
