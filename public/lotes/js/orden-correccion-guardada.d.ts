export interface ExcepcionSo2 {
  objetivo: number;
  motivo: string;
  autorizada_por?: string;
  autorizada_en?: string;
}

export interface EntradaEjecucion {
  lote: string;
  correccion: Record<string, unknown>;
}

export function armarOrdenGuardada(opciones: {
  id: string;
  numero: string;
  fecha: string;
  unidad: string;
  filas: Record<string, unknown>[];
  modos?: Map<string, string>;
  excepciones?: Map<string, ExcepcionSo2>;
  emitio?: string;
  recibio?: string;
  quien?: string;
  ahora?: string;
  titulo?: string;
  instrucciones?: string;
}): Record<string, unknown>;

export function entradasDeEjecucion(
  orden: Record<string, unknown>,
  tildes: Map<string, Set<number>>,
  fecha: string
): {
  entradas: EntradaEjecucion[];
  hechos: {
    lote: string;
    vasijas: string[];
    mbk_g: number;
    ml: number;
  }[];
};
