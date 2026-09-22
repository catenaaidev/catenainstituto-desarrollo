/* ===== Lotes CIW — donde se dibuja un panel flotante =====
 *
 * Modulo PURO: sin DOM y sin imports, igual que envases.js. Vive separado de
 * tabla.js (que es quien lo usa) por una razon concreta: tabla.js importa
 * nucleo.js, que toca `window` al cargarse, asi que no se puede importar dentro
 * del runtime de Workers donde corren los tests. Aca la cuenta se puede probar.
 *
 * Por eso la funcion recibe MEDIDAS y no elementos: quien la llama toma los
 * getBoundingClientRect() y le pasa numeros.
 */
'use strict';

/* Separacion entre el panel y el borde de la ventana, y entre el panel y su
   ancla. */
export const MARGEN_PANEL = 6, SEPARACION_PANEL = 4;

/** Coloca un panel debajo de su ancla, en coordenadas de ventana (para un
 *  elemento position:fixed).
 *
 *  Reglas, en orden: pegado al borde izquierdo del ancla; corrido hacia adentro
 *  si se saldria por la derecha; y volcado hacia ARRIBA del ancla si no entra
 *  abajo (pasa con las ventanas bajas). Nunca devuelve una posicion fuera de la
 *  ventana: entre las dos reglas verticales gana el margen, porque un panel que
 *  arranca en top negativo se corta la busqueda y el "Todas", que son
 *  justamente lo primero que se usa al abrirlo.
 *
 *  @param ancla   {left, top, bottom} del disparador
 *  @param panel   {ancho, alto} del panel ya visible (medido con display:block)
 *  @param ventana {ancho, alto} del viewport
 *  @returns {izq, top} en pixeles
 */
export function posicionDePanel(ancla, panel, ventana){
  const izq = Math.max(
    MARGEN_PANEL,
    Math.min(ancla.left, ventana.ancho - panel.ancho - MARGEN_PANEL));

  const abajo = ancla.bottom + SEPARACION_PANEL;
  const arriba = ancla.top - panel.alto - SEPARACION_PANEL;
  const entraAbajo = abajo + panel.alto <= ventana.alto - MARGEN_PANEL;
  const top = entraAbajo ? abajo : Math.max(MARGEN_PANEL, arriba);

  return { izq, top };
}
