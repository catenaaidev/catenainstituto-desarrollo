/* Las plantillas de OT son datos, pero una mal armada imprime una hoja sin la
 * tabla de vasijas (y el operario no sabe qué trasegar) o revienta el render
 * con un tipo de bloque que nadie dibuja. Estos tests fijan esa estructura. */
import { describe, it, expect } from 'vitest';
import { PLANTILLAS_OT, plantillaPorId, TIPOS_BLOQUE, COLS_VACIADO, MODELOS_LLENADO,
  origenTanque, barricasEstimadas } from '../public/lotes/js/ot-plantillas.js';

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
      it('tiene exactamente una tabla de vaciado (ninguna si sale de tanque)', () => {
        expect(p.bloques.filter((b) => b.tipo === 'tabla-vaciado')).toHaveLength(p.origen === 'tanque' ? 0 : 1);
      });
      it('todos los bloques tienen un tipo conocido', () => {
        for (const b of p.bloques) expect(TIPOS_BLOQUE).toContain(b.tipo);
      });
      it('las columnas de vaciado existen y arrancan por el lote', () => {
        const t = p.bloques.find((b) => b.tipo === 'tabla-vaciado');
        if (!t) return;
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

  it('los modelos de llenado son conocidos', () => {
    for (const p of PLANTILLAS_OT) for (const b of p.bloques.filter((b) => b.tipo === 'tabla-llenado')) {
      expect(MODELOS_LLENADO).toContain(b.modelo);
    }
  });

  it('TQ a barricas sigue la 0912: sale de tanque, ID propio y llenado desde tanque', () => {
    const pl = plantillaPorId('tq-barricas');
    expect(origenTanque('tq-barricas')).toBe(true);
    expect(origenTanque('barricas-barricas')).toBe(false);
    expect(pl.bloques.some((b) => b.tipo === 'ids')).toBe(true);
    expect(pl.bloques.some((b) => b.tipo === 'rotular')).toBe(false);
    expect(pl.bloques.find((b) => b.tipo === 'tabla-llenado').modelo).toBe('desde-tanque');
    expect(pl.bloques.find((b) => b.tipo === 'tabla-correccion').vasija).toBe('origen');
  });

  it('barricas estimadas: litros / 225 para arriba, sin litros no hay', () => {
    expect(barricasEstimadas(1500)).toBe(7);
    expect(barricasEstimadas(225)).toBe(1);
    expect(barricasEstimadas(null)).toBeNull();
    expect(barricasEstimadas(0)).toBeNull();
  });

  it('plantillaPorId devuelve null para un id desconocido', () => {
    expect(plantillaPorId('nada')).toBeNull();
  });
});
