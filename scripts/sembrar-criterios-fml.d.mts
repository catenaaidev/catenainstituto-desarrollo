/**
 * Tipos de sembrar-criterios-fml.mjs, para que los tests en TypeScript puedan
 * importarlo. El script sigue siendo JavaScript porque lo corre node a mano;
 * esto solo describe su firma, no agrega comportamiento.
 */

export declare const BLANCAS: string[];

export interface ConfigCriterios {
  por_variedad: Record<string, Record<string, unknown>>;
  por_proyecto: Record<string, Record<string, unknown>>;
  [k: string]: unknown;
}

export declare function sembrarCriterios(
  configPrevia: Record<string, unknown> | null | undefined,
): { config: ConfigCriterios; agregadas: string[] };
