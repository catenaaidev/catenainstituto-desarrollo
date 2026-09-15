/**
 * Siembra en config.criterios_fml los overrides del tablero aprobado.
 *
 * Es idempotente y NO pisa: solo agrega la clave que falta. Correrlo dos veces
 * no cambia nada, y un umbral que alguien ajusto a mano sobrevive.
 */

export const BLANCAS = [
  'Blanco', 'Chardonnay', 'Chenin', 'Gibi', 'Gewurztraminer', 'Moscatel Rosado',
  'Pedro Gimenez', 'Pinot Blanco', 'Pinot Gris', 'Riesling', 'Sauvignon Blanc',
  'Semillón', 'Torrontés', 'Ugni Blanc', 'Viognier',
];

const PH_365 = ['Pinot Noir', 'Sauvignon Blanc', 'Chardonnay'];
const PH_379 = ['Cabernet Sauvignon', 'Cabernet Franc', 'Petit Verdot'];

export function sembrarCriterios(configPrevia) {
  const config = structuredClone(configPrevia ?? {});
  config.por_variedad ??= {};
  config.por_proyecto ??= {};
  const agregadas = [];

  const poner = (tabla, nombre, clave, valor) => {
    tabla[nombre] ??= {};
    if (tabla[nombre][clave] === undefined) {
      tabla[nombre][clave] = valor;
      agregadas.push(`${nombre}.${clave}`);
    }
  };

  for (const v of BLANCAS) poner(config.por_variedad, v, 'hace_fml', 'no');
  for (const v of PH_365) poner(config.por_variedad, v, 'ph_max', 3.65);
  for (const v of PH_379) {
    poner(config.por_variedad, v, 'ph_max', 3.79);
    poner(config.por_variedad, v, 'ph_max_inclusive', 'si');
  }
  poner(config.por_proyecto, 'El Amiguito', 'so2_aplica', 'no');

  return { config, agregadas };
}
