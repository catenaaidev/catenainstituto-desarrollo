/**
 * Freno de la importación a la nube.
 *
 * `importar.mjs` hace DELETE + INSERT: reemplaza el documento entero del
 * módulo, no fusiona. Eso era correcto durante la migración inicial, cuando lo
 * local era la fuente y la nube el destino vacío.
 *
 * Desde el corte a web-only (spec 2026-09-09) la fuente es la web. Una
 * importación a --remote borra lo que haya cargado el equipo desde entonces, y
 * está a un `npm run` de distancia.
 *
 * No se prohíbe: hay un caso legítimo (la reconciliación ocasional del Excel de
 * Lotes, documentada en DESPLIEGUE.md). Se exige decirlo en voz alta.
 *
 * Este módulo es puro a propósito —sin node:fs, sin node:process, sin
 * efectos— para poder testearlo dentro del runtime de Workers, que es donde
 * corren los tests de este repo y donde no hay disco.
 */

/** La bandera que hay que agregar para autorizar el reemplazo. */
export const BANDERA = '--piso-la-web';

/**
 * ¿Esta invocación puede escribir en la nube?
 *
 * @param {string[]} args Los argumentos de línea de comandos (sin node ni el script).
 * @returns {{permitido: boolean, motivo: string}} `motivo` va vacío si está permitido.
 */
export function decidirFreno(args) {
  const permitido = { permitido: true, motivo: '' };

  if (!args.includes('--remote')) return permitido;
  if (args.includes(BANDERA)) return permitido;

  const motivo = [
    '',
    '  FRENO: esta importación REEMPLAZA el documento entero del módulo en la nube.',
    '',
    '  No fusiona: hace DELETE y vuelve a insertar. Todo lo que el equipo haya',
    '  cargado en la web desde la última importación se pierde.',
    '',
    '  Desde el corte a web-only la fuente de datos es la web, no lo local.',
    '  Si igual es lo que querés (por ejemplo, la reconciliación del Excel de',
    '  Lotes), primero respaldá la nube y después agregá la bandera:',
    '',
    `      ${BANDERA}`,
    '',
    '  El procedimiento completo está en DESPLIEGUE.md.',
    '',
  ].join('\n');

  return { permitido: false, motivo };
}
