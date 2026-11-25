/* ===== Lotes CIW — filtro de llenado =====
 * La lógica vive en public/shared/filtro-llenado.js (la comparte Prensas).
 * Acá se liga la definición de vacío de Lotes: estaVacio() de envases.js. */
'use strict';
import { estaVacio } from './envases.js';
import { MODOS_LLENADO, pasaLlenado as _pasa,
         crearFiltroLlenado as _crear } from '../../shared/filtro-llenado.js';

export { MODOS_LLENADO };
export const pasaLlenado = (lote, modo) => _pasa(lote, modo, estaVacio);
export const crearFiltroLlenado = (onChange, clave) => _crear(onChange, estaVacio, clave);
