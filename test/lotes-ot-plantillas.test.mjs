/* Las plantillas de OT son datos, pero una mal armada imprime una hoja sin la
 * tabla de vasijas (y el operario no sabe qué trasegar) o revienta el render
 * con un tipo de bloque que nadie dibuja. Estos tests fijan esa estructura. */
import { describe, it, expect } from 'vitest';
import { PLANTILLAS_OT, plantillaPorId, TIPOS_BLOQUE, COLS_VACIADO, MODELOS_VACIADO, MODELOS_LLENADO, MODELOS_CORRECCION,
  origenTanque, pideLoteCorte, creaLote, hojasDePlantilla, HOJAS_OT, barricasEstimadas, sinMovimientos } from '../public/lotes/js/ot-plantillas.js';

describe('PLANTILLAS_OT', () => {
  it('trae las plantillas acordadas', () => {
    expect(PLANTILLAS_OT.map((p) => p.id)).toEqual(
      ['barricas-barricas', 'tq-barricas', 'barrica-tanque', 'tq-tq', 'barricas-tanque', 'corte-achique', 'traslado', 'muestras-ot']);
  });

  // El corte conserva el id 'barricas-tanque': las OT ya emitidas lo tienen
  // guardado y se tienen que seguir imprimiendo igual.
  it('el corte se llama Corte y crea el lote nuevo; el trasiego a tanque no', () => {
    expect(plantillaPorId('barricas-tanque').nombre).toBe('Corte');
    expect(creaLote('barricas-tanque')).toBe(true);
    expect(plantillaPorId('barrica-tanque').nombre).toBe('Trasiego de barrica a tanque');
    expect(creaLote('barrica-tanque')).toBe(false);
    expect(pideLoteCorte('barrica-tanque')).toBe(false);
    for (const p of PLANTILLAS_OT) expect(p.nombre).not.toMatch(/\(corte\)/);
  });

  it('el trasiego de barrica a tanque usa la 0867 pero con los lotes de origen', () => {
    const pl = plantillaPorId('barrica-tanque');
    expect(hojasDePlantilla('barrica-tanque')).toEqual(['ot']);
    expect(pl.bloques.find((b) => b.tipo === 'tabla-vaciado').porBarril).toBe(true);
    expect(pl.bloques.find((b) => b.tipo === 'ids').de).toBeUndefined();
    expect(pl.bloques.find((b) => b.tipo === 'rotular').de).toBeUndefined();
    expect(pl.bloques.find((b) => b.tipo === 'tabla-correccion').modelo).toBeUndefined();
  });

  it('los ids son unicos', () => {
    const ids = PLANTILLAS_OT.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const p of PLANTILLAS_OT) {
    describe(p.id, () => {
      it('tiene exactamente una tabla de vaciado (ninguna si sale de tanque)', () => {
        expect(p.bloques.filter((b) => b.tipo === 'tabla-vaciado')).toHaveLength(p.origen === 'tanque' || p.sinMovimientos ? 0 : 1);
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

  it('el corte a tanque sigue la 0867: lote del corte, fila por barril, agregado y una sola hoja', () => {
    const pl = plantillaPorId('barricas-tanque');
    expect(pideLoteCorte('barricas-tanque')).toBe(true);
    expect(pideLoteCorte('tq-tq')).toBe(false);
    expect(hojasDePlantilla('barricas-tanque')).toEqual(['ot']);
    expect(hojasDePlantilla('barricas-barricas')).toEqual(HOJAS_OT);
    const t = pl.bloques.find((b) => b.tipo === 'tabla-vaciado');
    expect(t.porBarril).toBe(true);
    expect(t.columnas).not.toContain('caudalimetro');
    expect(pl.bloques.find((b) => b.tipo === 'ids').de).toBe('corte');
    expect(pl.bloques.find((b) => b.tipo === 'rotular').de).toBe('corte');
    expect(pl.bloques.find((b) => b.tipo === 'tabla-correccion').modelo).toBe('agregado-corte');
    const textos = pl.bloques.map((b) => b.texto || '').join(' | ');
    expect(textos).toContain('CON BORRAS');
    expect(textos).not.toContain('CAUDALÍMETRO');
  });

  it('los modelos de vaciado son conocidos', () => {
    for (const p of PLANTILLAS_OT) for (const b of p.bloques.filter((b) => b.tipo === 'tabla-vaciado' && b.modelo)) {
      expect(MODELOS_VACIADO).toContain(b.modelo);
    }
  });

  it('los modelos de correccion son conocidos', () => {
    for (const p of PLANTILLAS_OT) for (const b of p.bloques.filter((b) => b.tipo === 'tabla-correccion' && b.modelo)) {
      expect(MODELOS_CORRECCION).toContain(b.modelo);
    }
  });

  it('las hojas de cada plantilla son conocidas e incluyen la OT', () => {
    for (const p of PLANTILLAS_OT) {
      const hs = hojasDePlantilla(p.id);
      expect(hs).toContain('ot');
      for (const h of hs) expect(HOJAS_OT).toContain(h);
    }
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

describe('Corte + achique (0943)', () => {
  it('es un corte que crea lote y reparte el pulmon', () => {
    const pl = plantillaPorId('corte-achique');
    expect(pl.nombre).toBe('Corte + achique');
    expect(pideLoteCorte('corte-achique')).toBe(true);
    expect(creaLote('corte-achique')).toBe(true);
    expect(pl.achique).toBe(true);
    const tipos = pl.bloques.map(b => b.tipo);
    expect(tipos.indexOf('tabla-achique')).toBeGreaterThan(tipos.indexOf('tabla-correccion'));
    expect(pl.bloques.filter(b => b.tipo === 'rotular').map(b => b.de)).toEqual(['corte', 'achique']);
    const textos = pl.bloques.map(b => b.texto || '').join(' | ');
    for (const t of ['SIN BORRAS', 'Homogeneizar.', 'Registrar SO2 Final', 'Preparar pare reubicar',
                     'En caso de que quede mermo:', 'Chequear O2 final y registrar', 'Lavar vasija utilizada.'])
      expect(textos).toContain(t);
  });
  it('hojas: solo la OT, salvo que haya barricas o T50 de destino', () => {
    const ot = destinos => ({ plantilla: 'corte-achique', achique: { destinos } });
    expect(hojasDePlantilla('corte-achique')).toEqual(['ot']);
    expect(hojasDePlantilla('corte-achique', ot([{ tipo: 'tanque', num: '206' }]))).toEqual(['ot']);
    expect(hojasDePlantilla('corte-achique', ot([{ tipo: 'tanque', num: '206' }, { tipo: 'chicas', barricas: 2 }])))
      .toEqual(HOJAS_OT);
  });
});

describe('muestras-ot (0993)', () => {
  const pl = plantillaPorId('muestras-ot');
  it('se llama Muestras, una sola hoja, sin movimientos', () => {
    expect(pl.nombre).toBe('Muestras');
    expect(pl.banda).toEqual(['MUESTRAS']);
    expect(hojasDePlantilla('muestras-ot')).toEqual(['ot']);
    expect(sinMovimientos('muestras-ot')).toBe(true);
    expect(sinMovimientos('traslado')).toBe(false);
    expect(sinMovimientos('no-existe')).toBe(false);
  });
  it('trae los pasos de la 0993 y una tabla de muestras en el medio', () => {
    expect(pl.bloques.map(b => b.tipo === 'paso' ? b.texto : b.tipo)).toEqual([
      'Buscar las siguientes muestras y armar cortes según indicaciones',
      'IR DESINFECTANDO MANGUERITA ENTRE MUESTRA Y MUESTRA',
      'tabla-muestras',
      'AL finalizar gasear TODOS LOS T50 ANTES DE CERRAR',
      'Analizar los cortes y de ser necesario corregir a 35 ppm',
      'Enviar por mail a Nico Torti datos analizados',
    ]);
  });
});
