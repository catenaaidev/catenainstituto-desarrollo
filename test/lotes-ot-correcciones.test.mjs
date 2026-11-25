/* El panel de correcciones al lado de la hoja de la OT: la parte pura
 * (ot-correcciones.js y so2-calculo.js). */
import { describe, it, expect, beforeAll } from 'vitest';

let C, S;
beforeAll(async () => {
  globalThis.window ??= { addEventListener(){} };
  globalThis.document ??= { addEventListener(){} };
  C = await import('../public/lotes/js/ot-correcciones.js');
  S = await import('../public/lotes/js/so2-calculo.js');
  // Importar los modulos de papel tarda cuando corren todos los tests juntos:
  // 30 s en vez de los 10 por defecto (si no, el arranque se corta por tiempo).
}, 30000);

const otTrasiego = () => ({ id: 'a', ot: 'OT-2026-020', plantilla: 'barricas-barricas',
  lotes: [{ lote: '26273', id_texto: 'CF Gy Alto Ct.5', litros_previstos: 2487 },
          { lote: '26105', id_texto: '' }] });

describe('calcCorreccionSO2', () => {
  it('replica la formula de la calculadora', () => {
    const r = S.calcCorreccionSO2(20, 35, 1000, 3.8);
    expect(r.diferencia).toBe(15);
    expect(r.mbk_a_agregar).toBeCloseTo(45, 6);
    expect(r.ml_exactos).toBeCloseTo(15 * 1000 * 1.5 / 55, 6);
    expect(r.so2_molecular).toBeCloseTo(20 / (1 + 100), 6);
  });
  it('sin datos no calcula', () => {
    expect(S.calcCorreccionSO2(null, 35, 1000)).toBeNull();
  });
  it('ultimoSo2Ph toma el ultimo valor real de cada uno', () => {
    const an = [
      { lote: '26273', fecha_analisis: '2026-09-01', so2_libre: 18, ph: 3.6 },
      { lote: 26273, fecha_analisis: '2026-10-01', so2_libre: 22, ph: -999 },
      { lote: '26105', fecha_analisis: '2026-10-05', so2_libre: 40, ph: 3.4 },
    ];
    expect(S.ultimoSo2Ph(an, '26273')).toEqual({ so2: 22, ph: 3.6 });
    expect(S.ultimoSo2Ph(an, '9')).toEqual({ so2: null, ph: null });
  });
});

describe('lotesACorregir', () => {
  it('una OT con tabla Correccion corrige sus lotes', () => {
    expect(C.lotesACorregir(otTrasiego()).map(l => l.lote)).toEqual(['26273', '26105']);
  });
  it('la OT de corte corrige el lote del corte', () => {
    const o = { ot: 'OT-1', plantilla: 'barricas-tanque', lotes: [{ lote: '26004' }, { lote: '26005' }],
      lote_corte: { lote: '26300', id_texto: 'Base HOFB' } };
    expect(C.lotesACorregir(o)).toEqual([{ lote: '26300', id_texto: 'Base HOFB', vasija: '', extra: false }]);
  });
  it('si se quito la tabla de la hoja, no hay panel', () => {
    const o = otTrasiego();
    o.bloques = [{ tipo: 'paso', texto: 'x' }];
    expect(C.lotesACorregir(o)).toEqual([]);
  });
});

describe('tanques destino extra', () => {
  const ot = { ot: '0990', plantilla: 'tq-tq', destino: 'T 212', lote_corte: null,
    lotes: [{ lote: '26217', id_texto: 'MB', litros_previstos: 4000,
      destinos_extra: [{ tipo: 'tanque', num: '214', litros: 1600, lote: '26330', mov_id: 'x' }] }] };
  it('una tarjeta por vasija: el lote en el destino (con el resto) y el hijo en su tanque', () => {
    expect(C.lotesACorregir(ot)).toEqual([
      { lote: '26217', id_texto: 'MB', litros_previstos: 2400, vasija: 'T 212', extra: false, con_extras: true },
      { lote: '26330', id_texto: 'MB', litros_previstos: 1600, vasija: 'T 214', extra: true }]);
  });
  it('confirmada: el extra usa los litros reales, y el lote los suyos', () => {
    const o = structuredClone(ot); o.lotes[0].destinos_extra[0].litros_reales = 1580; o.lotes[0].litros_reales = 2380;
    expect(C.lotesACorregir(o).map(x => x.litros_previstos)).toEqual([2380, 1580]);
  });
  it('si algun extra no tiene litros, el lote propone los previstos enteros', () => {
    const o = structuredClone(ot); o.lotes[0].destinos_extra[0].litros = null;
    expect(C.lotesACorregir(o)[0]).toMatchObject({ litros_previstos: 4000, con_extras: true, vasija: 'T 212' });
  });
  it('si el lote tiene litros reales pero falta el real de un extra, se usa el resto de los previstos', () => {
    const o = structuredClone(ot); o.lotes[0].litros_reales = 2380;
    expect(C.lotesACorregir(o)[0].litros_previstos).toBe(2400);
  });
  it('destino barricas: el lote con extras no propone vasija', () => {
    const o = structuredClone(ot); o.plantilla = 'barricas-barricas';
    expect(C.lotesACorregir(o)[0]).toMatchObject({ vasija: '', con_extras: true });
  });
  it('un lote sin extras en la misma OT queda igual que antes', () => {
    const o = structuredClone(ot); o.lotes.push({ lote: '26105', id_texto: '', litros_previstos: 900 });
    expect(C.lotesACorregir(o)[1]).toEqual({ lote: '26105', id_texto: '', litros_previstos: 900, vasija: '', extra: false });
  });
  it('agregado-corte: el lote del corte y cada hijo extra', () => {
    const c = { ot: '0991', plantilla: 'barricas-tanque', destino: 'T 201', lote_corte: { lote: '26400', id_texto: 'Corte' }, lotes: [],
      destinos_extra: [{ tipo: 'tanque', num: '214', litros: null, lote: '26401', mov_id: 'y' }] };
    expect(C.lotesACorregir(c).map(x => [x.lote, x.vasija])).toEqual([['26400', ''], ['26401', 'T 214']]);
  });
  it('tanquePropuesto prefiere la vasija de la tarjeta', () => {
    const PAD = [{ num: '214', tipo: 'T', cap_real: 7500, activa: true }, { num: '212', tipo: 'T', cap_real: 7500, activa: true }];
    expect(C.tanquePropuesto(PAD, { vasija_actual: '' }, ot, 'T 214')).toBe('214');
    expect(C.tanquePropuesto(PAD, { vasija_actual: '' }, ot)).toBe('212');
  });
});

describe('registradasDeOT', () => {
  it('junta SO2 y TH2 vigentes de esa OT y ese lote', () => {
    const an = [
      { lote: '26273', fecha_analisis: '2026-10-08', correccion: { ot_n: 'OT-2026-020', mbk_a_agregar: 5, ml_exactos: 50 } },
      { lote: '26273', fecha_analisis: '2026-10-09', correccion: { ot_n: 'OT-2026-020', mbk_a_agregar: 1, anulada: { por: 'x' } } },
      { lote: '26273', fecha_analisis: '2026-10-08', correccion: { ot_n: 'OTRA', mbk_a_agregar: 9 } },
      { lote: 26273, fecha_analisis: '2026-10-08', agregados: [
        { producto: 'TH2', cantidad: 300, unidad: 'g', ot_n: 'OT-2026-020' },
        { producto: 'Quitosano', cantidad: 50, unidad: 'g', ot_n: 'OT-2026-020' },
        { producto: 'TH2', cantidad: 1, unidad: 'g', ot_n: 'OT-2026-020', anulada: { por: 'x' } }] },
    ];
    const r = C.registradasDeOT(an, 'OT-2026-020', '26273');
    expect(r.so2.map(x => x.fecha)).toEqual(['2026-10-08']);
    expect(r.so2[0].correccion.ml_exactos).toBe(50);
    expect(r.th2.map(x => x.ag.cantidad)).toEqual([300]);
    expect(r.th2[0].fecha).toBe('2026-10-08');
  });
});

describe('registrarTH2', () => {
  it('reemplaza el TH2 de la misma OT y no toca los otros agregados de esa OT', () => {
    const an = [{ lote: '26273', fecha_analisis: '2026-10-08', agregados: [
      { producto: 'TH2', cantidad: 300, unidad: 'g', ot_n: 'OT-2026-020' },
      { producto: 'Quitosano', cantidad: 50, unidad: 'g', ot_n: 'OT-2026-020' }] }];
    C.registrarTH2(an, { lote: '26273', fecha: '2026-10-08', cantidad: '250,5', unidad: 'g',
      ot: 'OT-2026-020', quien: 'ana', cuando: 't' });
    const ags = an[0].agregados.map(a => `${a.producto} ${a.cantidad}`).sort();
    expect(ags).toEqual(['Quitosano 50', 'TH2 250.5']);
  });
  it('sin registro ese dia crea uno solo de agregados', () => {
    const an = [];
    C.registrarTH2(an, { lote: '26105', fecha: '2026-10-08', cantidad: 100, unidad: 'g', ot: 'OT-1', quien: 'ana', cuando: 't' });
    expect(an).toHaveLength(1);
    expect(an[0].agregados[0]).toMatchObject({ producto: 'TH2', cantidad: 100, unidad: 'g', ot_n: 'OT-1', registrado_por: 'ana' });
  });
  it('sin cantidad no registra', () => {
    const an = [];
    expect(C.registrarTH2(an, { lote: '1', fecha: '2026-10-08', cantidad: '', unidad: 'g', ot: 'OT-1' })).toBeNull();
    expect(an).toHaveLength(0);
  });
});

describe('tanque y merma -> litros', () => {
  const padron = [
    { num: '201', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: 'tanque-75hl', activa: true },
    { num: '154', tipo: 'FOUDRE OVAL', cap_real: 2000, tabla: null, activa: true },
    { num: '999', tipo: 'X', cap_real: 100, tabla: 'tanque-75hl', activa: false },
  ];
  it('con tabla calcula los litros con la Cap REAL', () => {
    const r = C.litrosDeTanque(padron, 'T 201', '0');
    expect(r.litros).toBe(7500);
    expect(r.texto).toContain('7.500 L de 7.500');
    const r2 = C.litrosDeTanque(padron, 'tq201', 20);
    expect(r2.litros).toBeLessThan(7500);
    expect(r2.litros).toBeGreaterThan(0);
  });
  it('sin tabla, sin cm, fuera del padron o dado de baja: no calcula y avisa', () => {
    expect(C.litrosDeTanque(padron, '154', 5)).toMatchObject({ litros: null });
    expect(C.litrosDeTanque(padron, '154', 5).texto).toMatch(/sin tabla/);
    expect(C.litrosDeTanque(padron, '201', '').texto).toMatch(/cm/);
    expect(C.litrosDeTanque(padron, '777', 5).texto).toMatch(/padrón/);
    expect(C.litrosDeTanque(padron, '999', 5).texto).toMatch(/padrón/);
    expect(C.litrosDeTanque(padron, '', 5)).toEqual({ litros: null, texto: '', vasija: null });
    expect(C.litrosDeTanque(padron, '201', 9999).texto).toMatch(/fuera/);
  });
  it('tanquePropuesto: la vasija actual del lote o el destino de la OT, si estan en el padron', () => {
    expect(C.tanquePropuesto(padron, { vasija_actual: 'T 201' }, { destino: 'Huevo Inox' })).toBe('201');
    expect(C.tanquePropuesto(padron, { vasija_actual: 'Barricas' }, { destino: 'Tq 201' })).toBe('201');
    expect(C.tanquePropuesto(padron, { vasija_actual: 'Barricas' }, { destino: 'Huevo Inox' })).toBe('');
    expect(C.tanquePropuesto(padron, null, {})).toBe('');
  });
  it('correccionDeOT guarda litros, tanque y cm junto a la correccion', () => {
    const c = C.correccionDeOT({ so2Actual: 20, so2Deseado: 35, mbk: 1, ml: 2, ot: 'OT-1', fecha: '2026-10-14',
      litros: 7320, vasija: 'T 201', cm: '12,5', padron });
    expect(c).toMatchObject({ so2_libre_actual: 20, ot_n: 'OT-1', litros: 7320, vasija: '201', cm_merma: 12.5 });
    const s = C.correccionDeOT({ so2Actual: 20, so2Deseado: 35, mbk: 1, ml: 2, ot: 'OT-1', fecha: 'f', litros: 500, vasija: '', cm: '' });
    expect(s.litros).toBe(500);
    expect('vasija' in s).toBe(false);
    expect('cm_merma' in s).toBe(false);
  });
});

/* Una OT ejecutada ya no se corrige desde la hoja: el panel queda solo para
 * consultar lo registrado con ella, y sin nada registrado no aparece. */
describe('panelDeOT', () => {
  const conTabla = estado => ({ ...otTrasiego(), estado, bloques: undefined });
  const an = [
    { lote: '26273', fecha_analisis: '2026-10-28', correccion: { ot_n: 'OT-2026-020', mbk_a_agregar: 10, ml_exactos: 90 } },
  ];
  it('pendiente: para cargar, con todos los lotes', () => {
    const p = C.panelDeOT(conTabla('pendiente'), []);
    expect(p.consulta).toBe(false);
    expect(p.lotes.map(l => l.lote)).toEqual(['26273', '26105']);
  });
  it('ejecutada: solo consulta, con los lotes que tienen algo registrado', () => {
    const p = C.panelDeOT(conTabla('ejecutado'), an);
    expect(p.consulta).toBe(true);
    expect(p.lotes.map(l => l.lote)).toEqual(['26273']);
  });
  it('ejecutada sin nada registrado: sin panel', () => {
    expect(C.panelDeOT(conTabla('ejecutado'), [])).toBeNull();
  });
  it('una correccion anulada no cuenta', () => {
    const anulada = [{ ...an[0], correccion: { ...an[0].correccion, anulada: { por: 'x' } } }];
    expect(C.panelDeOT(conTabla('ejecutado'), anulada)).toBeNull();
  });
  it('sin tabla de correccion en la hoja: sin panel', () => {
    expect(C.panelDeOT({ id: 'b', ot: '1', plantilla: 'traslado', estado: 'pendiente', lotes: [] }, [])).toBeNull();
  });
});
