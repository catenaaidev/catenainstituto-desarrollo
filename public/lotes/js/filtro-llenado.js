/* ===== Lotes CIW — filtro de llenado (Todos | Llenos | Vacíos) =====
 *
 * Lo comparten dos pestañas que montan sus controles de forma distinta:
 *
 *   Lotes    tiene la toolbar fija en index.html y monta el control UNA vez.
 *   Análisis rehace su sección entera (`sec.innerHTML = html`) en cada render,
 *            así que vuelve a colgar el MISMO nodo despues de cada repintado.
 *
 * Por eso la fabrica devuelve el nodo ya armado en vez de un string de HTML:
 * es la forma que ya tiene crearFiltroMulti en tabla.js, y deja que cada vista
 * lo cuelgue donde y cuando le sirva sin que el estado se pierda.
 *
 * Sin esto habria dos copias del mismo control -- markup, modos y logica de
 * clic -- y renombrar una etiqueta o sumar un modo habria que hacerlo en las
 * dos. Es el mismo motivo por el que escribirCelda vive una sola vez en
 * tabla.js y no una vez por camino de edicion.
 *
 * El modulo toca el DOM SOLO dentro de crearFiltroLlenado; pasaLlenado es puro
 * y por eso el archivo se puede importar en los tests, que corren en el
 * runtime de Workers y no tienen document (igual que anchos-cols.js).
 */
'use strict';

import { estaVacio } from './envases.js';

export const MODOS_LLENADO = ['todos', 'llenos', 'vacios'];

/* El orden es el del array de arriba; el texto y el title son lo unico que ve
 * el usuario, y viven aca para que las dos pestañas digan exactamente lo
 * mismo. */
const BOTONES = [
  { modo: 'todos',  texto: 'Todos',  titulo: 'Mostrar todos los lotes' },
  { modo: 'llenos', texto: 'Llenos', titulo: 'Solo los lotes con litros' },
  { modo: 'vacios', texto: 'Vacíos', titulo: 'Solo los lotes en 0 litros' },
];

/** ¿Este lote pasa el filtro puesto en `modo`?
 *
 *  En Análisis el lote llega de buscar el numero en DATOS().lotes y puede ser
 *  undefined (el lote se borro y el analisis quedo). estaVacio() ya trata eso
 *  como vacio, asi que cae en Vacios sin una rama especial.
 *
 *  Un modo desconocido devuelve true, o sea muestra TODO. Es a proposito: el
 *  modo sale de un data-llenado del DOM, y el error caro es la tabla vacia sin
 *  ningun boton marcado y sin forma de recuperarla salvo recargando. */
export function pasaLlenado(lote, modo){
  if (modo !== 'llenos' && modo !== 'vacios') return true;
  return estaVacio(lote) === (modo === 'vacios');
}

/** Crea el control segmentado. Devuelve:
 *    el     el nodo, para colgarlo donde vaya
 *    pasa   predicado contra el modo puesto ahora
 *    reset  vuelve a 'Todos' (lo usa el boton Limpiar filtros)
 *    modo   el modo puesto, de solo lectura
 *
 *  `onChange` se llama solo cuando el modo CAMBIA de verdad, asi que volver a
 *  apretar el boton ya marcado no repinta la tabla al pedo.
 *
 *  El estado no se guarda en localStorage, al reves que el colapsado de
 *  columnas: un filtro que sobrevive a la recarga sin verse de entrada es
 *  justo lo que despues parece "faltan lotes". Arranca en 'todos'. */
export function crearFiltroLlenado(onChange){
  let modo = 'todos';

  const el = document.createElement('div');
  el.className = 'segm';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Filtrar por llenado');

  const btns = BOTONES.map(o => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.llenado = o.modo;
    b.textContent = o.texto;
    b.title = o.titulo;
    el.appendChild(b);
    return b;
  });

  /* aria-pressed y no una clase: es el estado real del boton para un lector de
     pantalla, y de paso es lo que engancha el CSS de .segm. */
  function pintar(){
    for (const b of btns) b.setAttribute('aria-pressed', String(b.dataset.llenado === modo));
  }

  el.addEventListener('click', e => {
    const b = e.target.closest('button[data-llenado]');
    if (!b || b.dataset.llenado === modo) return;
    modo = b.dataset.llenado;
    pintar();
    onChange();
  });

  pintar();

  return {
    el,
    pasa: (lote) => pasaLlenado(lote, modo),
    reset(){ modo = 'todos'; pintar(); },
    get modo(){ return modo; },
  };
}
