/* Tests de posicionDePanel(): donde se dibuja el panel de casillas cuando el
 * filtro se abre desde el embudo de una cabecera (pestana Lotes).
 *
 * La funcion recibe medidas ya tomadas en lugar de elementos, y vive en su
 * propio modulo puro y no en tabla.js (que es quien la usa), justamente para
 * poder testearla: tabla.js importa nucleo.js, que toca `window` al cargarse, y
 * el runtime de Workers donde corren los tests no tiene window ni document.
 *
 * Por que importa: el panel es position:fixed y vive colgado de <body> (tiene
 * que salir del .scroll.tall{overflow:auto} de la tabla o quedaria recortado).
 * Al salir del flujo normal nadie lo acomoda, y si la cuenta se equivoca el
 * panel se dibuja medio afuera de la ventana -- sin scroll que lo alcance,
 * porque es fixed. Las columnas de la derecha y las filas de abajo son
 * exactamente donde eso pasaria.
 */
import { describe, it, expect } from 'vitest';
import { posicionDePanel } from '../public/lotes/js/posicion-panel.js';

// Medidas parecidas a las reales: el panel mide min 200 / max 280 de ancho por
// CSS, y alto ~300 con la lista llena (max-height 240 + busqueda + pie).
const PANEL = { ancho: 240, alto: 300 };
const VENTANA = { ancho: 1280, alto: 800 };

describe('posicionDePanel', () => {
  it('lo cuelga debajo del embudo y alineado a su izquierda', () => {
    // Caso normal: una columna del medio de la tabla, con lugar de sobra.
    const p = posicionDePanel({ left: 400, top: 100, bottom: 130 }, PANEL, VENTANA);
    expect(p.izq).toBe(400);
    expect(p.top).toBe(134);   // bottom + 4 de separacion
  });

  it('lo corre hacia adentro si se saldria por la derecha', () => {
    // Un embudo de las ultimas columnas: alineado a su izquierda el panel
    // terminaria en 1180+240 = 1420, fuera de una ventana de 1280.
    const p = posicionDePanel({ left: 1180, top: 100, bottom: 130 }, PANEL, VENTANA);
    expect(p.izq).toBe(1280 - 240 - 6);   // pegado al borde derecho, con margen
    expect(p.izq + PANEL.ancho).toBeLessThanOrEqual(VENTANA.ancho);
  });

  it('lo vuelca hacia arriba si no entra abajo', () => {
    // Encabezado cerca del pie de la ventana: 700+4+300 = 1004 > 800.
    const p = posicionDePanel({ left: 400, top: 670, bottom: 700 }, PANEL, VENTANA);
    expect(p.top).toBe(670 - 300 - 4);    // arriba del embudo
    expect(p.top).toBeGreaterThanOrEqual(0);
  });

  it('nunca lo deja arrancar fuera de la ventana', () => {
    // Ventana baja (o panel largo): no entra ni abajo ni arriba. Entre las dos
    // reglas gana el margen: un top negativo cortaria la busqueda y el "Todas",
    // que son lo primero que se usa al abrir.
    const chica = { ancho: 1280, alto: 320 };
    const p = posicionDePanel({ left: 400, top: 40, bottom: 70 }, PANEL, chica);
    expect(p.top).toBe(6);
    expect(p.izq).toBeGreaterThanOrEqual(0);
  });

  it('no lo pega al borde izquierdo cuando el embudo esta casi afuera', () => {
    // La columna Lote es sticky en left:38px, pero al scrollear una tabla
    // angosta un embudo puede quedar con left chico o negativo.
    const p = posicionDePanel({ left: -20, top: 100, bottom: 130 }, PANEL, VENTANA);
    expect(p.izq).toBe(6);
  });

  it('prefiere abajo cuando entra justo', () => {
    // Frontera exacta: bottom+4+alto == alto de ventana - margen.
    const bottom = VENTANA.alto - 6 - PANEL.alto - 4;
    const p = posicionDePanel({ left: 400, top: bottom - 30, bottom }, PANEL, VENTANA);
    expect(p.top).toBe(bottom + 4);
  });
});
