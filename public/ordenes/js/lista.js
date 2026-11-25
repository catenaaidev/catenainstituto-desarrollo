/* ===== Órdenes de trabajo — lista, URL y enlaces (puro) ===== */
'use strict';

const VISTAS = ['nueva', 'pendientes', 'historial', 'guia'];
/* Los filtros de Pendientes / Historial son los embudos de los títulos:
 * n (N°, texto), tipo ("modulo:tipo", varios), desde/hasta, lote, est
 * (estado) y emitio (varios), mas el orden ("col-asc|desc"). modulo y q son
 * de la barra vieja: ya no tienen control, pero un enlace guardado sigue
 * filtrando igual. Los valores de varios van separados por | en la URL. */
const CLAVES = ['v', 'modulo', 'tipo', 'desde', 'hasta', 'q', 'n', 'lote', 'est', 'emitio', 'orden', 'impresa'];
export const FILTROS = CLAVES.filter(k => k !== 'v' && k !== 'orden' && k !== 'impresa');
export const ESTADO_LIMPIO = Object.freeze(Object.fromEntries(CLAVES.map(k => [k, ''])));

export const lista = v => String(v || '').split('|').map(x => x.trim()).filter(Boolean);
export const unirLista = xs => (xs || []).join('|');

export const claveTipo = o => o.modulo + ':' + o.tipo;
/* Los lotes de la orden: los de la OT y el del corte. */
const lotesDe = o => (o.lotes || []).map(String).concat(o.lote_corte ? [String(o.lote_corte)] : []);

export function filtrar(ordenes, { vista = 'pendientes', modulo = '', tipo = '', desde = '', hasta = '', q = '',
                                   n = '', lote = '', est = '', emitio = '' } = {}){
  const t = String(q || '').trim().toLowerCase();
  const num = String(n || '').trim().toLowerCase();
  // Un tipo sin módulo (enlace de antes de los embudos) vale para los dos.
  const tipos = lista(tipo);
  const lotes = new Set(lista(lote)), estados = new Set(lista(est)), quienes = new Set(lista(emitio));
  return (ordenes || [])
    .filter(o => vista === 'historial' ? o.estado !== 'pendiente' : o.estado === 'pendiente')
    .filter(o => !modulo || o.modulo === modulo)
    .filter(o => !tipos.length || tipos.some(x => x.includes(':') ? x === claveTipo(o) : x === o.tipo))
    .filter(o => !desde || String(o.fecha || '') >= desde)
    .filter(o => !hasta || String(o.fecha || '') <= hasta)
    .filter(o => !num || String(o.numero || '').toLowerCase().includes(num))
    .filter(o => !lotes.size || lotesDe(o).some(l => lotes.has(l)))
    .filter(o => !estados.size || estados.has(o.estado))
    .filter(o => !quienes.size || quienes.has(String(o.emitio || '')))
    .filter(o => !t ||
      String(o.numero || '').toLowerCase().includes(t) ||
      (o.lotes || []).some(l => String(l).toLowerCase().includes(t)) ||
      String(o.lote_corte || '').toLowerCase().includes(t));
}

/** ¿Hay algún filtro puesto? (la vista y el orden no cuentan) */
export const hayFiltros = e => FILTROS.some(k => e && e[k]);

const _cmp = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });

/** Los valores que ofrece el embudo de `col` (tipo, lote, est, emitio). */
export function opcionesDe(ordenes, col){
  const de = { tipo: o => [claveTipo(o)], lote: lotesDe, est: o => [o.estado], emitio: o => [String(o.emitio || '')] }[col];
  if (!de) return [];
  return [...new Set((ordenes || []).flatMap(de).filter(Boolean))].sort(_cmp);
}

/* La clave de orden de cada columna. Lotes: el del corte, si no el primero. */
const CLAVE_ORDEN = {
  numero: o => o.numero || '',
  tipo: o => o.tipo || '',
  fecha: o => o.fecha || '',
  lotes: o => o.lote_corte || (o.lotes || [])[0] || '',
  estado: o => o.estado || '',
  emitio: o => o.emitio || '',
};

/** Ordena por "col-asc" / "col-desc"; sin orden (o uno desconocido) deja
 *  las filas como vinieron (la lista ya viene por fecha, la más nueva arriba).
 *  `nombre` (opcional) da el texto de un tipo, para ordenar como se lee. */
export function ordenar(filas, orden, { nombre } = {}){
  const m = /^(\w+)-(asc|desc)$/.exec(orden || '');
  const clave = m && CLAVE_ORDEN[m[1]];
  if (!clave) return filas || [];
  const k = m[1] === 'tipo' && nombre ? o => nombre(o.tipo) : clave;
  const sig = m[2] === 'desc' ? -1 : 1;
  return [...(filas || [])].sort((a, b) => sig * _cmp(k(a), k(b)));
}

/* ¿Cada fila lleva la etiqueta Prensas/Lotes? (spec: "lista de los dos
 * módulos con etiqueta Prensas/Lotes por fila"). Sí en Pendientes Y en
 * Historial cuando el usuario tiene rol en los dos módulos (la lista es de
 * los dos, y desde la entrega 3 ambos tienen p. ej. "Orden de muestras"): la
 * etiqueta no aparece y desaparece según el filtro. Si por algún motivo se
 * listan filas de dos módulos sin esos roles, también. */
export function conEtiquetaModulo(filas, modulosConRol){
  // 'guia' no cuenta como módulo: el Tipo ya dice "Guía de trabajos", y si no se
  // ignorara acá, un usuario con rol en un solo módulo vería la etiqueta en
  // todas las filas apenas hubiera una guía impresa en la lista.
  return (modulosConRol || []).length > 1 ||
    new Set((filas || []).filter(o => o.modulo !== 'guia').map(o => o.modulo)).size > 1;
}

export const contarPendientes = ordenes => (ordenes || []).filter(o => o.estado === 'pendiente').length;

export function estadoDeURL(search){
  const p = new URLSearchParams(search || '');
  const e = Object.fromEntries(CLAVES.map(k => [k, p.get(k) || '']));
  if (!VISTAS.includes(e.v)) e.v = '';
  return e;
}

export function urlDeEstado(e){
  const p = new URLSearchParams();
  for (const k of CLAVES) if (e && e[k]) p.set(k, e[k]);
  const s = p.toString();
  return s ? '?' + s : '';
}

const _volver = v => '&volver=' + encodeURIComponent(v || '/ordenes/');

export const urlAbrir = (o, volver) => o.modulo === 'guia'
  ? '/ordenes/?v=guia&impresa=' + encodeURIComponent(o.id)
  : '/' + o.modulo + '/?orden=' + encodeURIComponent(o.id) + _volver(volver);

export const urlNueva = (t, volver) =>
  '/' + t.modulo + '/?orden=' + encodeURIComponent('nueva:' + t.id) + _volver(volver);
