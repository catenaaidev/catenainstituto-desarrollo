/* La bitácora de correcciones de SO2 (so2-bitacora.js): registrar sin pisar
 * la corrección de otra OT, y deshacer lo escrito aunque una fusión tras un 409
 * haya reemplazado todos los objetos de DATOS() (las referencias de antes del
 * guardado quedan huérfanas). */
import { describe, it, expect } from 'vitest';
import { armarCorreccion, aplicarCorreccion, revertirCorrecciones,
         anularCorreccion, revertirAnulaciones, esAnulada } from '../public/lotes/js/so2-bitacora.js';

const corr = (ot, fecha = '2026-09-10', mbk = 12) =>
  armarCorreccion({ so2Actual: 20, so2Deseado: 35, mbk, ml: 40, ot, fecha });
/* Lo que hace la fusión del 409 con los objetos: el mismo contenido, otros objetos. */
const clonar = v => JSON.parse(JSON.stringify(v));

describe('aplicarCorreccion', () => {
  it('no se engancha al análisis de un barril (vasija cargada): crea su registro', () => {
    const barril = { lote: '26056', fecha_analisis: '2026-09-10', so2_libre: 6, vasija: '923' };
    const analisis = [barril];
    const r = aplicarCorreccion(analisis, '26056', '2026-09-10', corr('OC-1'));
    expect(r.que).toBe('creado');
    expect(barril.correccion).toBeUndefined();
    expect(analisis).toHaveLength(2);
  });

  it('un análisis con nombre de tanque en vasija es del lote: se engancha como siempre', () => {
    const tanque = { lote: '26056', fecha_analisis: '2026-09-10', so2_libre: 20, vasija: 'T 201' };
    const r = aplicarCorreccion([tanque], '26056', '2026-09-10', corr('OC-1'));
    expect(r).toMatchObject({ que: 'actualizado', ref: tanque });
  });

  it('sin nada ese día crea un registro nuevo', () => {
    const analisis = [];
    const r = aplicarCorreccion(analisis, 26218, '2026-09-10', corr('OC-1'));
    expect(r.que).toBe('creado');
    expect(r.convive).toBeNull();
    expect(analisis).toEqual([{ lote: '26218', fecha_analisis: '2026-09-10', correccion: corr('OC-1') }]);
  });

  it('se engancha a la medición de ese día y avisa lo que tenía', () => {
    const quim = { lote: 26218, fecha_analisis: '2026-09-10', ph: 3.6 };
    const analisis = [quim];
    const r = aplicarCorreccion(analisis, '26218', '2026-09-10', corr('OC-1'));
    expect(r).toMatchObject({ que: 'actualizado', ref: quim, anterior: undefined, convive: null });
    expect(analisis).toHaveLength(1);
  });

  it('pisa una cáscara de la migración (sin OT ni dosis)', () => {
    const cascara = { lote: '26218', fecha_analisis: '2026-09-10',
      correccion: { so2_deseado: null, mbk_a_agregar: null, ot_n: null } };
    const analisis = [cascara];
    expect(aplicarCorreccion(analisis, '26218', '2026-09-10', corr('OC-1')).que).toBe('actualizado');
    expect(cascara.correccion.ot_n).toBe('OC-1');
  });

  it('volver a registrar la misma OT actualiza en vez de duplicar', () => {
    const analisis = [{ lote: '26218', fecha_analisis: '2026-09-10', correccion: corr('OC-1', '2026-09-10', 10) }];
    const r = aplicarCorreccion(analisis, '26218', '2026-09-10', corr('OC-1', '2026-09-10', 14));
    expect(r.que).toBe('actualizado');
    expect(analisis).toHaveLength(1);
    expect(analisis[0].correccion.mbk_a_agregar).toBe(14);
  });

  it('NO pisa la corrección de otra OT el mismo día: quedan las dos', () => {
    const vieja = corr('OC-1');
    const analisis = [{ lote: '26218', fecha_analisis: '2026-09-10', correccion: vieja }];
    const r = aplicarCorreccion(analisis, '26218', '2026-09-10', corr('OC-2'));
    expect(r.que).toBe('creado');
    expect(r.convive).toBe('OC-1');
    expect(analisis).toHaveLength(2);
    expect(analisis[0].correccion).toBe(vieja);
    expect(analisis[1].correccion.ot_n).toBe('OC-2');
  });

  it('prefiere el registro de la misma OT aunque haya otro antes', () => {
    const analisis = [
      { lote: '26218', fecha_analisis: '2026-09-10', correccion: corr('OC-1') },
      { lote: '26218', fecha_analisis: '2026-09-10', correccion: corr('OC-2', '2026-09-10', 10) },
    ];
    const r = aplicarCorreccion(analisis, '26218', '2026-09-10', corr('OC-2', '2026-09-10', 11));
    expect(r.ref).toBe(analisis[1]);
    expect(analisis[0].correccion.ot_n).toBe('OC-1');
    expect(analisis[1].correccion.mbk_a_agregar).toBe(11);
  });

  it('una corrección sin OT pero con dosis tampoco se pisa con una de OT', () => {
    const analisis = [{ lote: '26218', fecha_analisis: '2026-09-10', correccion: corr('') }];
    const r = aplicarCorreccion(analisis, '26218', '2026-09-10', corr('OC-1'));
    expect(r.que).toBe('creado');
    expect(r.convive).toBe('');
  });

  it('nunca pisa una anulada, aunque sea de la misma OT (es el rastro de auditoría)', () => {
    const anulada = { ...corr('OC-1'), anulada: { fecha: '2026-09-11', por: 'ana' } };
    const analisis = [{ lote: '26218', fecha_analisis: '2026-09-10', correccion: anulada }];
    const r = aplicarCorreccion(analisis, '26218', '2026-09-10', corr('OC-1'));
    expect(r.que).toBe('creado');
    expect(esAnulada(analisis[0].correccion)).toBe(true);
    expect(analisis).toHaveLength(2);
  });

  it('dos vasijas del mismo lote, misma fecha y OT, no se pisan', () => {
    const analisis = [];
    aplicarCorreccion(analisis, '26217', '2026-11-12', { ot_n: '0990', vasija: '212', dosis: 1 });
    aplicarCorreccion(analisis, '26217', '2026-11-12', { ot_n: '0990', vasija: '214', dosis: 2 });
    expect(analisis).toHaveLength(2);
    aplicarCorreccion(analisis, '26217', '2026-11-12', { ot_n: '0990', vasija: '214', dosis: 3 });
    expect(analisis).toHaveLength(2);
    expect(analisis[1].correccion.dosis).toBe(3);
  });
});

describe('revertirCorrecciones', () => {
  function escribir(analisis) {
    return [
      aplicarCorreccion(analisis, '1', '2026-09-10', corr('OC-9')),   // creado
      aplicarCorreccion(analisis, '2', '2026-09-10', corr('OC-9')),   // actualizado sobre la química
    ];
  }
  const inicial = () => [{ lote: '2', fecha_analisis: '2026-09-10', ph: 3.5 }, { lote: '3', fecha_analisis: '2026-09-01', ph: 3.7 }];

  it('con las referencias vivas deshace todo', () => {
    const analisis = inicial();
    const snaps = escribir(analisis);
    expect(revertirCorrecciones(analisis, snaps)).toBe(2);
    expect(analisis).toEqual(inicial());
  });

  it('después de una fusión (objetos nuevos) deshace igual, buscando por clave y contenido', () => {
    const analisis = inicial();
    const snaps = escribir(analisis);
    // El 409: el documento fusionado tiene lo escrito acá más lo de otra PC.
    const fusionado = clonar(analisis);
    fusionado.push({ lote: '4', fecha_analisis: '2026-09-12', ph: 3.4 });
    expect(revertirCorrecciones(fusionado, snaps)).toBe(2);
    expect(fusionado).toEqual([...inicial(), { lote: '4', fecha_analisis: '2026-09-12', ph: 3.4 }]);
  });

  it('acepta snaps con la forma {tipo, corrAnterior} (sin el `que`/`anterior` de aplicarCorreccion)', () => {
    const analisis = inicial();
    const snaps = escribir(analisis).map(r => ({ tipo: r.que, ref: r.ref, corrAnterior: r.anterior,
      lote: r.lote, fecha: r.fecha, escrita: r.escrita }));
    const fusionado = clonar(analisis);
    revertirCorrecciones(fusionado, snaps);
    expect(fusionado).toEqual(inicial());
  });

  it('no toca la corrección de otra OT del mismo lote y fecha', () => {
    const otra = { lote: '1', fecha_analisis: '2026-09-10', correccion: corr('OC-1') };
    const analisis = [otra];
    const snaps = [aplicarCorreccion(analisis, '1', '2026-09-10', corr('OC-9'))];
    const fusionado = clonar(analisis);
    revertirCorrecciones(fusionado, snaps);
    expect(fusionado).toEqual([clonar(otra)]);
  });

  it('un registro creado al que después le cargaron química no se borra: solo pierde la corrección', () => {
    const analisis = [];
    const snaps = [aplicarCorreccion(analisis, '1', '2026-09-10', corr('OC-9'))];
    const fusionado = clonar(analisis);
    fusionado[0].ph = 3.6;
    revertirCorrecciones(fusionado, snaps);
    expect(fusionado).toEqual([{ lote: '1', fecha_analisis: '2026-09-10', ph: 3.6 }]);
  });

  it('si el registro ya no está no hace nada', () => {
    const analisis = [];
    const snaps = [aplicarCorreccion(analisis, '1', '2026-09-10', corr('OC-9'))];
    const vacio = [{ lote: '5', fecha_analisis: '2026-09-10', ph: 3.5 }];
    expect(revertirCorrecciones(vacio, snaps)).toBe(0);
    expect(vacio).toHaveLength(1);
  });
});

describe('revertirAnulaciones', () => {
  const quien = { por: 'ana', cuando: '2026-09-20' };
  /* Dos correcciones reales del mismo lote, fecha y OT: la clave duplicada que
   * existe en los datos reales. Anular de nuevo avanza a la siguiente. */
  const inicial = () => [
    { lote: '7', fecha_analisis: '2026-09-10', correccion: corr('OC-1') },
    { lote: '7', fecha_analisis: '2026-09-10', correccion: corr('OC-1', '2026-09-10', 99) },
  ];

  it('con las referencias vivas deshace la anulación', () => {
    const analisis = inicial();
    const s = anularCorreccion(analisis, '7', '2026-09-10', 'OC-1', quien);
    expect(esAnulada(analisis[0].correccion)).toBe(true);
    expect(revertirAnulaciones(analisis, [s])).toBe(1);
    expect(analisis).toEqual(inicial());
  });

  it('después de una fusión deshace la anulación en el objeto nuevo', () => {
    const analisis = inicial();
    const s = anularCorreccion(analisis, '7', '2026-09-10', 'OC-1', quien);
    const fusionado = clonar(analisis);
    expect(revertirAnulaciones(fusionado, [s])).toBe(1);
    expect(fusionado).toEqual(inicial());
    /* Lo que importa: reintentar anula la MISMA corrección, no la segunda. */
    const s2 = anularCorreccion(fusionado, '7', '2026-09-10', 'OC-1', quien);
    expect(s2.ref).toBe(fusionado[0]);
    expect(esAnulada(fusionado[1].correccion)).toBe(false);
  });

  it('dos anulaciones de la misma clave se deshacen las dos, cada una en su registro', () => {
    const analisis = inicial();
    const snaps = [anularCorreccion(analisis, '7', '2026-09-10', 'OC-1', quien),
                   anularCorreccion(analisis, '7', '2026-09-10', 'OC-1', quien)];
    const fusionado = clonar(analisis);
    expect(revertirAnulaciones(fusionado, snaps)).toBe(2);
    expect(fusionado).toEqual(inicial());
  });

  it('no deshace una anulación que hizo otra persona', () => {
    const analisis = inicial();
    analisis[1].correccion.anulada = { fecha: '2026-09-19', por: 'beto' };
    const s = anularCorreccion(analisis, '7', '2026-09-10', 'OC-1', quien);
    const fusionado = clonar(analisis);
    revertirAnulaciones(fusionado, [s]);
    expect(esAnulada(fusionado[0].correccion)).toBe(false);
    expect(fusionado[1].correccion.anulada).toEqual({ fecha: '2026-09-19', por: 'beto' });
  });
});
