/* ===== Lotes CIW — el Excel del tablero =====
 *
 * Una fila por condicion activa, no una por lote: el Excel se usa para repartir
 * trabajo, y el trabajo es la condicion.
 */
'use strict';

import { antiguedadTexto } from './tablero-datos.js';
import { fmtFecha } from './fechas.js';

export const COLUMNAS_EXPORT = [
  ['lote', 'Lote'], ['vasija', 'Vasija'], ['litros', 'Litros'],
  ['condicion', 'Condición'], ['desde', 'Desde'], ['antiguedad', 'Antigüedad'],
];

export function filasExport(filas, hoy){
  const salida = [];
  for (const f of filas){
    for (const c of (f.condiciones || [])){
      salida.push({
        lote: f.lote,
        vasija: (f._info || {}).vasija_actual ?? '',
        litros: f.litros,
        condicion: c.etiqueta,
        /* Se formatea aca y no en ISO: esta es la salida para imprimir. La
         * antiguedad se calcula con c.desde crudo, que sigue siendo ISO. */
        desde: fmtFecha(c.desde),
        antiguedad: antiguedadTexto(c.desde, hoy),
      });
    }
  }
  return salida;
}
