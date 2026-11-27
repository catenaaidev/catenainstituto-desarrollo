import { describe, it, expect } from 'vitest';
import { CRITERIOS_DEFAULT, objetivoSo2Libre, objetivoSo2LibreOT, criteriosEfectivos } from '../src/lotes/motores/fml';
import { numerosDeDocumento } from '../src/ordenes/resumen';
describe('CIW-03 motores reales', () => {
  it('conserva el objetivo químico original', () => expect(objetivoSo2Libre(3.9, CRITERIOS_DEFAULT)).toBeGreaterThan(40));
  it('limita el objetivo de OT a 40', () => expect(objetivoSo2LibreOT(3.9, CRITERIOS_DEFAULT)).toBe(40));
  it('respeta el techo configurable del documento', () => expect(objetivoSo2LibreOT(3.9, criteriosEfectivos({default:{so2_libre_techo:38}}, 'Malbec'))).toBe(38));
  it('mantiene numeración de pendientes pero no de borradores', () => expect(numerosDeDocumento('lotes',{ordenes_trabajo:[{ot:'0950',estado:'pendiente'},{ot:'0951',estado:'borrador'}]},'principal')).toEqual([950]));
});
