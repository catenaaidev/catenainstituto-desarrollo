/* ===== Lotes CIW — grupos de columnas colapsables =====
 * Modulo puro: decide QUE columnas se pintan y con que colspan, sin tocar el
 * DOM. La vista pinta; este archivo solo calcula.
 *
 * Las columnas colapsadas no se pintan (no se ocultan con CSS): asi geo() en
 * grilla.js ve exactamente las columnas visibles y la seleccion, el Ctrl+C y el
 * pegado siguen siendo coherentes sin cambios en el motor de columnas.
 *
 * Forma de los datos que recibe:
 *   cols   -> [{ k, label, banda, grupo? }]  grupo ausente = no colapsa nunca
 *   bandas -> [{ id, titulo, grupo?, colsFijas? }]
 *   colapsados -> { [idGrupo]: true|false }  true = colapsado
 */
'use strict';

/** Una columna se pinta salvo que su grupo este colapsado. */
export function colsVisibles(cols, colapsados){
  const est = colapsados || {};
  return (cols || []).filter(c => !c.grupo || est[c.grupo] !== true);
}

/** Una entrada por banda, con el colspan ya calculado sobre lo visible.
 *
 *  colsFijas cubre las columnas que pertenecen a la banda pero no estan en el
 *  modelo de columnas: en Lotes son Etapa y Avance, que la vista pinta a mano.
 *
 *  Una banda que se queda sin ninguna columna visible no desaparece: queda como
 *  `testigo` con colspan 1, y la vista le pinta una columna angosta que es la
 *  marca del grupo cerrado y el lugar donde se vuelve a abrir. */
export function bandasVisibles(bandas, cols, colapsados){
  const est = colapsados || {};
  const out = [];
  for (const b of (bandas || [])){
    const propias = (cols || []).filter(c => c.banda === b.id);
    const visibles = colsVisibles(propias, est).length;
    const fijas = b.colsFijas || 0;
    // Una banda sin columnas y sin colsFijas no existe en la tabla.
    if (propias.length === 0 && fijas === 0) continue;
    const testigo = (visibles + fijas) === 0;
    out.push({
      id: b.id,
      titulo: b.titulo,
      grupo: b.grupo || null,
      colspan: testigo ? 1 : visibles + fijas,
      ocultas: propias.length - visibles,
      testigo,
    });
  }
  return out;
}

/** Estado nuevo con ese grupo invertido. No muta el que recibe: el estado viene
 *  del localStorage y de la vista, y mutarlo desde aca haria que un render a
 *  medias dejara la tabla y el chip contando cosas distintas. */
export function alternar(colapsados, grupo){
  const est = { ...(colapsados || {}) };
  est[grupo] = !est[grupo];
  return est;
}
