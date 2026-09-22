/* Quién puede editar (o borrar) una orden ya guardada del Escáner.
 *
 * Vive fuera del index.html para que los tests puedan correr la regla de verdad
 * en vez de una copia que se desincroniza sola. Se carga como <script> clásico
 * en el <head>, junto a las otras librerías: el arranque de la página es una
 * IIFE del script inline que corre durante el parseo, así que un módulo
 * diferido llegaría tarde y `escPuedeEditar` sería undefined en el primer
 * dibujado del historial.
 *
 * Por eso el archivo no usa `export`: se cuelga del objeto global, que es como
 * ya vive todo lo demás de esta página. Vitest lo importa por su efecto y lee
 * `globalThis`.
 */
(function (raiz) {
  'use strict';

  /* El operario corrige lo que acaba de cargar, no el historial. Pasada esta
   * ventana la orden queda sólo para el programador: a esa altura la orden ya
   * se copió a la planilla o se usó para otra cosa, y un cambio silencioso deja
   * a los papeles diciendo algo distinto que el sistema. */
  var ESC_MINUTOS_EDICION = 15;

  /* La hora real de la orden vive en el id, que se arma como 'e' + Date.now().
   * Las órdenes que entraron por el import del Excel no lo tienen, así que no
   * hay forma de saber cuándo se cargaron: se las considera viejas. */
  function escMinutosDesde(o, ahora) {
    var m = /^e(\d+)$/.exec(String((o && o.id) || ''));
    if (!m) return Infinity;
    return (ahora - Number(m[1])) / 60000;
  }

  /* Devuelve { puede, motivo?, aviso? }.
   * motivo: 'no-existe' | 'aplicada' | 'vencida'   ·   aviso: 'marcada' */
  function escPuedeEditar(o, rolActual, ahora) {
    if (ahora === undefined) ahora = Date.now();
    if (!o) return { puede: false, motivo: 'no-existe' };
    // Aplicada va primero: frena a los dos roles, y explicarle al operario que
    // "pasaron 15 minutos" escondería que además hay que deshacerla.
    if (o.aplicado) return { puede: false, motivo: 'aplicada' };
    if (rolActual !== 'programador' && escMinutosDesde(o, ahora) > ESC_MINUTOS_EDICION)
      return { puede: false, motivo: 'vencida' };
    // Marcada a mano como pasada al inventario, pero sin cambios registrados: no
    // hay foto que romper, así que se edita — pero la marca puede quedar
    // diciendo algo que ya no es, y eso conviene preguntarlo antes.
    if (o.marcas && o.marcas.inventario) return { puede: true, aviso: 'marcada' };
    return { puede: true };
  }

  raiz.ESC_MINUTOS_EDICION = ESC_MINUTOS_EDICION;
  raiz.escMinutosDesde = escMinutosDesde;
  raiz.escPuedeEditar = escPuedeEditar;
})(typeof globalThis !== 'undefined' ? globalThis : window);
