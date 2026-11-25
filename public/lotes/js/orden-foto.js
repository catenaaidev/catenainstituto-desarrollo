/* ===== Lotes CIW — foto de la Orden de muestras / microbiología (puro) =====
 * Lo que se guarda en ordenes_hojas[].hoja al imprimir: el encabezado y las
 * filas tal cual salieron en el papel, para reabrir la orden en solo lectura
 * y reimprimirla. Los mapas pegados NO se guardan (son imágenes de sesión).
 *
 * Módulo puro (sin nucleo.js, que toca el DOM al importarse): vista-orden.js
 * lo re-exporta. */
'use strict';

import { cfgHojasAnalisis } from './orden-hoja-filas.js';
import { cfgHojasMicro } from './orden-micro.js';

const txt = v => (v == null ? '' : String(v));
const lleno = v => txt(v).trim() !== '';

export function fotoOrdenMuestras({ tipo, titulo, hoja, filas, textosMicro, conBarril } = {}){
  const h = hoja || {};
  const cab = {
    titulo: txt(titulo), fecha: txt(h.fecha), dia: txt(h.dia), nro: txt(h.nro),
    emitio: txt(h.emitio), recibio: txt(h.recibio),
  };
  /* Solo las filas con algo: las vacías son renglones para escribir a mano. */
  const conDatos = (filas || []).filter(r => r && (lleno(r.lote) || lleno(r.vasija)));
  if (tipo === 'micro'){
    return { ...cab,
      filas: conDatos.map(r => ({ lote: txt(r.lote), vasija: txt(r.vasija) })),
      textos: { ...(textosMicro || {}) } };
  }
  return { ...cab, conBarril: !!conBarril,
    filas: conDatos.map(r => ({
      lote: txt(r.lote), variedad: txt(r.variedad), vasija: txt(r.vasija), barril: txt(r.barril),
      cantidad: r.cantidad ?? '', recipiente: txt(r.recipiente),
    })) };
}

/* Fecha 'YYYY-MM-DD' como sale en el papel impreso ("04/11/2026"): el campo
 * de fecha del papel editable es un <input type=date>, que muestra dd/mm/aaaa.
 * Lo que no tenga esa forma se muestra tal cual. */
export function fechaPapel(fecha){
  const f = txt(fecha);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f);
  return m ? { fechaTxt: `${m[3]}/${m[2]}/${m[1]}`, anio: m[1] } : { fechaTxt: f, anio: '' };
}

/* La hoja guardada (fotoOrdenMuestras) -> cfg de pintarHojas, para redibujar
 * la orden en solo lectura igual que el papel que se imprimio. tipo =
 * 'muestras' | 'micro' (el de la orden). respaldo = { fecha, nro } de la
 * orden por si la hoja no los trae. Las filas pasan como el papel editable
 * las tenia (lote / vasija / ...), los textos de micro van en `textos`. */
export function cfgDeHojaGuardada(hoja, tipo, respaldo = {}){
  const h = hoja || {};
  const fecha = txt(h.fecha || respaldo.fecha);
  const meta = { fecha, ...fechaPapel(fecha), nro: txt(h.nro || respaldo.nro) };
  const filas = (h.filas || []).map(r => ({ ...r }));
  const comun = { filas, titulo: txt(h.titulo), meta, emitio: txt(h.emitio), recibio: txt(h.recibio) };
  const cfg = tipo === 'micro'
    ? cfgHojasMicro({ ...comun, textos: h.textos, dia: txt(h.dia) })
    : cfgHojasAnalisis({ ...comun,
        banda: ['MUESTRAS', { campo: 'dia', valor: txt(h.dia), ph: 'día' }, 'Lab CIW + Degustación'],
        hojasExtra: [], modoBarril: !!h.conBarril });
  /* Sin boton de agregar fila: la guardada no se edita. */
  return { ...cfg, editable: false, despuesTablaUltima: '' };
}
