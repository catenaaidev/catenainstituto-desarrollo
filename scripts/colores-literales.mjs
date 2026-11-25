/**
 * Los colores escritos a mano en los <script> en línea de una página (no en
 * <style> ni en los style="" del HTML): en Barriles son la escena 3D
 * (0x1a1320…), colorLote (hsl), los textos del pie de la cámara (#b9f6ca,
 * #ffd180, #ff8a80) y los fondos de filas armadas en JS. En orden de
 * aparición. Puro (sin fs): lo usan el script que escribe la foto y el test.
 */
export function coloresDelJs(html) {
  const js = [...String(html).matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  return [...js.matchAll(/#[0-9a-fA-F]{3,8}\b|0x[0-9a-fA-F]{6}\b|rgba?\([^)]*\)|hsl\([^)]*\)/g)].map((m) => m[0]);
}
