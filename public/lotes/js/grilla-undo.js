/* ===== Lotes CIW — pila de deshacer / rehacer de la grilla =====
 * Pura, sin DOM. Guarda operaciones en bloque: cada entrada es la lista de
 * celdas que una sola operacion (pegar, borrar, aplicar al rango) cambio, con
 * el valor CRUDO de antes y de despues. Crudo y no el texto de la pantalla,
 * porque hay diferencia real entre null, '' y 0.
 */
'use strict';

export function crearPila(tope = 50){
  let atras = [], adelante = [];

  return {
    /** cambios: [{obj, k, antes, despues}, ...]. Una operacion que no cambio
     *  nada (todo salteado o rechazado) no se apila: deshacer no deberia
     *  "consumir" un paso que no hizo nada. */
    apilar(cambios){
      if (!cambios || !cambios.length) return;
      atras.push(cambios);
      // Rehacer solo tiene sentido sobre una linea de tiempo sin ramas: al
      // hacer algo nuevo despues de deshacer, la rama vieja se descarta.
      adelante = [];
      if (atras.length > tope) atras.shift();
    },

    deshacer(){
      if (!atras.length) return null;
      const cambios = atras.pop();
      adelante.push(cambios);
      return cambios;
    },

    rehacer(){
      if (!adelante.length) return null;
      const cambios = adelante.pop();
      atras.push(cambios);
      return cambios;
    },

    limpiar(){ atras = []; adelante = []; },

    tamano(){ return { atras: atras.length, adelante: adelante.length }; },
  };
}
