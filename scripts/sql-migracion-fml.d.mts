/**
 * Tipos de sql-migracion-fml.mjs, para que el test en TypeScript pueda
 * importarlo. El script sigue siendo JavaScript porque lo corre node a mano;
 * esto solo describe su firma, no agrega comportamiento.
 */

export interface CambioFml {
  indice: number;
  lote: string;
  variedad: string;
  valor: string;
}

export declare function construirSqlMigracion(entrada: {
  version: number;
  cambios: CambioFml[];
  criterios: { config: Record<string, unknown>; agregadas: string[] };
  tieneConfig: boolean;
}): { sentencias: string[]; sql: string; resumen: string };
