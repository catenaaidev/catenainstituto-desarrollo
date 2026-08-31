/* ===== Lotes CIW — portapapeles en formato TSV =====
 * Funciones puras, sin DOM. TSV es lo que Excel pone y espera en el
 * portapapeles: celdas separadas por tabulador, filas por salto de linea, y
 * las celdas que contienen un tabulador, un salto o una comilla van entre
 * comillas dobles con las comillas internas duplicadas.
 */
'use strict';

/** Texto del portapapeles -> matriz de strings. */
export function parsearTSV(texto){
  const s = String(texto ?? '');
  if (s === '') return [];

  const filas = [];
  let fila = [], celda = '', i = 0, enComillas = false;
  // Una celda esta "entrecomillada" solo si la comilla es su primer caracter.
  // Asi `12" barril` se lee literal, que es lo que pasa con las vasijas.
  let celdaEmpezada = false;

  while (i < s.length){
    const ch = s[i];

    if (enComillas){
      if (ch === '"'){
        if (s[i+1] === '"'){ celda += '"'; i += 2; continue; }
        enComillas = false; i++; continue;
      }
      celda += ch; i++; continue;
    }

    if (ch === '"' && !celdaEmpezada){
      enComillas = true; celdaEmpezada = true; i++; continue;
    }
    if (ch === '\t'){
      fila.push(celda); celda = ''; celdaEmpezada = false; i++; continue;
    }
    if (ch === '\n' || ch === '\r'){
      if (ch === '\r' && s[i+1] === '\n') i++;
      fila.push(celda); filas.push(fila);
      fila = []; celda = ''; celdaEmpezada = false; i++; continue;
    }
    celda += ch; celdaEmpezada = true; i++;
  }

  // Ultima celda: solo cuenta si quedo algo pendiente. Excel cierra el
  // portapapeles con un salto de linea, y eso NO es una fila vacia extra.
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }

  // Y descartar las filas que quedaron con UNA sola celda vacia: las genera un
  // salto de linea suelto, y no son datos. Ojo con el limite: una fila de VARIAS
  // celdas vacias SI es dato legitimo (significa "borra estas celdas"), asi que
  // el filtro mira length === 1 y no "todas vacias".
  return filas.filter(f => f.length > 1 || (f.length === 1 && f[0] !== ''));
}

/** Matriz -> texto para el portapapeles. */
export function armarTSV(matriz){
  return (matriz || []).map(fila =>
    (fila || []).map(v => {
      const t = v == null ? '' : String(v);
      return /[\t\n\r"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    }).join('\t')
  ).join('\n');
}
