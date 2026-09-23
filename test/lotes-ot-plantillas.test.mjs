/* Las plantillas de OT son datos, pero una mal armada imprime una hoja sin la
 * tabla de vasijas (y el operario no sabe qué trasegar) o revienta el render
 * con un tipo de bloque que nadie dibuja. Estos tests fijan esa estructura. */
import { describe, it, expect } from 'vitest';
import { PLANTILLAS_OT, plantillaPorId, TIPOS_BLOQUE, COLS_VACIADO } from '../public/lotes/js/ot-plantillas.js';

describe('PLANTILLAS_OT', () => {
  it('trae las cuatro plantillas acordadas', () => {
    expect(PLANTILLAS_OT.map((p) => p.id)).toEqual(
      ['barricas-barricas', 'tq-barricas', 'barricas-tanque', 'tq-tq']);
  });

  it('los ids son unicos', () => {
    const ids = PLANTILLAS_OT.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const p of PLANTILLAS_OT) {
    describe(p.id, () => {
      it('tiene exactamente una tabla de vaciado', () => {
        expect(p.bloques.filter((b) => b.tipo === 'tabla-vaciado')).toHaveLength(1);
      });
      it('todos los bloques tienen un tipo conocido', () => {
        for (const b of p.bloques) expect(TIPOS_BLOQUE).toContain(b.tipo);
      });
      it('las columnas de vaciado existen y arrancan por el lote', () => {
        const t = p.bloques.find((b) => b.tipo === 'tabla-vaciado');
        expect(t.columnas[0]).toBe('lote');
        for (const c of t.columnas) expect(Object.keys(COLS_VACIADO)).toContain(c);
      });
      it('los pasos y datos tienen texto', () => {
        for (const b of p.bloques.filter((b) => b.tipo === 'paso' || b.tipo === 'dato')) {
          expect(String(b.texto).trim()).not.toBe('');
        }
      });
    });
  }

  it('el corte a tanque registra caudalimetro', () => {
    const t = plantillaPorId('barricas-tanque').bloques.find((b) => b.tipo === 'tabla-vaciado');
    expect(t.columnas).toContain('caudalimetro');
  });

  it('las de barricas marcan la cinta de organicos', () => {
    for (const id of ['barricas-barricas', 'tq-barricas']) {
      expect(plantillaPorId(id).bloques.some((b) => b.destaca === 'organico')).toBe(true);
    }
  });

  it('plantillaPorId devuelve null para un id desconocido', () => {
    expect(plantillaPorId('nada')).toBeNull();
  });
});
