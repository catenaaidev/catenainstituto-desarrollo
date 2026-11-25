/* Inventario de tanques: que lote hay en cada vasija del padron
 * (spec 2026-10-14-lotes-inventario-tanques-design.md). */
import { describe, it, expect } from 'vitest';
import { partesVasija, cosechaDeLote, ocupacion, inventarioTanques, ultimasMediciones, ESTADOS_MANUALES } from '../public/lotes/js/inventario-tanques.js';

export const V = (num, extra = {}) => ({ num: String(num), tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: 'tanque-75hl', activa: true, ...extra });
export const L = (lote, extra = {}) => ({ lote: String(lote), variedad: 'Malbec', id_texto: 'MB x', litros_actuales: 7500,
  vasija_actual: 'T 201', vasija_grande: 7500, etapa: 'crianza', ...extra });

describe('partesVasija', () => {
  it('saca los numeros de tanque y descarta barricas', () => {
    expect(partesVasija('T 201')).toEqual(['201']);
    expect(partesVasija('H 170 + Barricas')).toEqual(['170']);
    expect(partesVasija('T 201 + T 202')).toEqual(['201', '202']);
    expect(partesVasija('Barricas')).toEqual([]);
    expect(partesVasija('')).toEqual([]);
    expect(partesVasija(null)).toEqual([]);
  });
  it('cada grupo de digitos es un candidato aparte (no se pegan)', () => {
    expect(partesVasija('T201/202')).toEqual(['201', '202']);
    expect(partesVasija('H 170')).toEqual(['170']);
    expect(partesVasija('T 201 + T 201')).toEqual(['201']);
  });
  it('los toneles y T50 escritos con cantidad no son tanques (el T 200 del padron existe)', () => {
    // Asi escribe la OT lo que queda: "1 t200", "2 T50". El 200 del tonel no es el tanque 200.
    expect(partesVasija('H 183 + 1 t200')).toEqual(['183']);
    expect(partesVasija('1 x t50')).toEqual([]);
    expect(partesVasija('1 x t50 + Barricas 225')).toEqual([]);
    expect(partesVasija('T 201 + 2 T50 + 3 t500')).toEqual(['201']);
  });
  it('"T 200" sin cantidad: es el tonel solo si el lote tiene toneles de 200', () => {
    expect(partesVasija('T 200')).toEqual(['200']);
    expect(partesVasija('T 200', { cap200: 0, vasija_grande: 7000 })).toEqual(['200']);
    expect(partesVasija('H 183 + t200', { cap200: 1, vasija_grande: 3300 })).toEqual(['183']);
  });
});

describe('cosechaDeLote', () => {
  it('sale de los dos primeros digitos de un lote de 5', () => {
    expect(cosechaDeLote('25313')).toBe('2025');
    expect(cosechaDeLote(26002)).toBe('2026');
    expect(cosechaDeLote('AGRELO')).toBe('');
  });
});

describe('ocupacion', () => {
  const padron = [V(201), V(202), V(170, { cap_real: 2600, tabla: 'huevo-24hl' }), V(150, { activa: false })];

  it('ubica un lote en su tanque con los litros de vasija_grande', () => {
    const { porVasija, sinVasija } = ocupacion(padron, [L(25313)]);
    expect(porVasija.get('201')).toEqual([{ lote: '25313', cosecha: '2025', variedad: 'Malbec', id_texto: 'MB x',
      organico: false, etapa: 'crianza', litros: 7500, enVarias: false }]);
    expect(sinVasija).toEqual([]);
  });

  it('"H 170 + Barricas" va al 170 con solo los litros de tanque', () => {
    const { porVasija } = ocupacion(padron, [L(26140, { vasija_actual: 'H 170 + Barricas', vasija_grande: 2400, litros_actuales: 3300 })]);
    expect(porVasija.get('170')[0].litros).toBe(2400);
  });

  it('sin vasija_grande usa litros_actuales', () => {
    const { porVasija } = ocupacion(padron, [L(26140, { vasija_actual: 'T 202', vasija_grande: null, litros_actuales: 7000 })]);
    expect(porVasija.get('202')[0].litros).toBe(7000);
  });

  it('ignora lotes sin litros', () => {
    const { porVasija } = ocupacion(padron, [L(25313, { litros_actuales: 0 })]);
    expect(porVasija.get('201')).toBeUndefined();
  });

  it('dos lotes en el mismo tanque quedan los dos', () => {
    const { porVasija } = ocupacion(padron, [L(25313), L(25314)]);
    expect(porVasija.get('201').map(o => o.lote)).toEqual(['25313', '25314']);
  });

  it('un lote en dos vasijas del padron: litros desconocidos en cada una', () => {
    const { porVasija } = ocupacion(padron, [L(25313, { vasija_actual: 'T 201 + T 202' })]);
    expect(porVasija.get('201')[0]).toMatchObject({ litros: null, enVarias: true });
    expect(porVasija.get('202')[0]).toMatchObject({ litros: null, enVarias: true });
  });

  it('26260: huevo de 33 hl + 1 tonel de 200 L va solo al huevo, con los litros del huevo', () => {
    const p = [...padron, V(183, { cap_real: 3300, tabla: 'huevo-33hl' }), V(200)];
    const { porVasija } = ocupacion(p, [L(26260, { variedad: 'PV', vasija_actual: 'H 183 + 1 t200',
      vasija_grande: 3300, cap200: 1, litros_actuales: 3500 })]);
    expect(porVasija.get('200')).toBeUndefined();
    expect(porVasija.get('183')[0]).toMatchObject({ lote: '26260', litros: 3300, enVarias: false });
  });

  it('tanque de bodega (fuera del padron CIW) con vino: va a su propia vasija extra', () => {
    const { porVasija, sinVasija, extras } = ocupacion(padron, [L(25313, { vasija_actual: 'T60', vasija_grande: 6000, litros_actuales: 6000 })]);
    expect(sinVasija).toEqual([]);
    expect(extras).toEqual([{ num: '60', motivo: 'no-en-padron' }]);
    expect(porVasija.get('60')[0]).toMatchObject({ lote: '25313', litros: 6000 });
  });

  it('vasija inactiva con vino: tambien vasija extra, con su motivo', () => {
    const { extras, porVasija } = ocupacion(padron, [L(25313, { vasija_actual: 'P 150' })]);
    expect(extras).toEqual([{ num: '150', motivo: 'vasija-inactiva' }]);
    expect(porVasija.get('150')[0].lote).toBe('25313');
  });

  it('sin ningun numero de tanque en el texto: queda en sinVasija', () => {
    const { sinVasija } = ocupacion(padron, [L(25313, { vasija_actual: 'Tanque', vasija_grande: 500, litros_actuales: 500 })]);
    expect(sinVasija).toEqual([{ lote: '25313', vasija_actual: 'Tanque', litros: 500, motivo: 'no-en-padron' }]);
  });

  it('envases chicos sin vasija_grande no se listan como sin vasija', () => {
    const { sinVasija } = ocupacion(padron, [L(25313, { vasija_actual: 't50 + Barrica', vasija_grande: null, cap225: 2 })]);
    expect(sinVasija).toEqual([]);
  });

  it('con envases chicos y sin vasija_grande no se ubica en el tanque (texto viejo)', () => {
    const { porVasija, sinVasija } = ocupacion(padron, [L(26140, { vasija_actual: '10 barricas + H 170 + Barricas',
      vasija_grande: null, cap225: 10, litros_actuales: 2250 })]);
    expect(porVasija.get('170')).toBeUndefined();
    expect(sinVasija).toEqual([]);
  });
});

const P = [V(201), V(202), V(170, { cap_real: 2600, tabla: 'huevo-24hl' })];
const REC = (fecha, filas, id = 'rec-' + fecha) => ({ id, fecha, por: 'oriana', filas });
const F = (vasija, extra = {}) => ({ vasija: String(vasija), lote: '25313', cm: null, litros_medidos: null, litros_web: 7500,
  velo: false, obs: '', estado_manual: '', aplicado: null, ...extra });
const OT = (extra = {}) => ({ id: 'ot-1', ot: '0123', estado: 'pendiente', destino: 'T 202',
  lotes: [{ lote: '25313', vasijas_manual: 'T 201', barriles: [] }], ...extra });
const inv = (o = {}) => inventarioTanques({ padron: P, lotes: [L(25313)], ots: [], recorridas: [], ...o });
const fila = (r, num) => r.filas.find(f => f.num === String(num));

describe('ultimasMediciones', () => {
  it('gana la fila de la recorrida mas nueva para cada vasija', () => {
    const m = ultimasMediciones([REC('2026-10-01', [F(201, { cm: 5 }), F(202, { cm: 1 })]), REC('2026-10-08', [F(201, { cm: 2 })])]);
    expect(m.get('201')).toMatchObject({ cm: 2, fecha: '2026-10-08', por: 'oriana' });
    expect(m.get('202')).toMatchObject({ cm: 1, fecha: '2026-10-01' });
  });
});

describe('inventarioTanques: filas', () => {
  it('una fila por vasija activa, en el orden del padron', () => {
    expect(inv().filas.map(f => f.num)).toEqual(['201', '202', '170']);
  });

  it('suma los litros de la vasija', () => {
    expect(fila(inv(), 201).litros).toBe(7500);
    expect(fila(inv(), 202).litros).toBe(0);
  });
});

describe('inventarioTanques: tanques de bodega en el listado', () => {
  it('van despues del padron, por numero, y suman a los totales', () => {
    const r = inv({ lotes: [L(25313), L(25400, { vasija_actual: 'T 60', vasija_grande: 5000, litros_actuales: 5000 }),
      L(25401, { vasija_actual: 'Tq 25', vasija_grande: 900, litros_actuales: 900 })] });
    expect(r.filas.map(f => f.num)).toEqual(['201', '202', '170', '25', '60']);
    expect(fila(r, 60)).toMatchObject({ tipo: 'BODEGA (fuera del padrón CIW)', cap_real: null, litros: 5000,
      estado: 'VINO TERMINADO', fuera_padron: true });
    expect(fila(r, 60).avisos).toEqual([]);
    expect(r.sinVasija).toEqual([]);
    expect(r.totales).toMatchObject({ ocupadas: 3, vacias: 2, litros: 13400 });
  });
  it('vasija inactiva con vino: fila con su tipo y aviso', () => {
    const r = inventarioTanques({ padron: [...P, V(150, { activa: false, tipo: 'PILETA DE HORMIGON', cap_real: 3000 })],
      lotes: [L(25313, { vasija_actual: 'P 150', vasija_grande: 2900, litros_actuales: 2900 })], ots: [], recorridas: [] });
    expect(fila(r, 150)).toMatchObject({ tipo: 'PILETA DE HORMIGON', cap_real: 3000, litros: 2900 });
    expect(fila(r, 150).avisos).toContain('vasija-inactiva');
  });
});

describe('inventarioTanques: estado', () => {
  it('vacia', () => {
    expect(fila(inv(), 202)).toMatchObject({ estado: 'VACÍA', estado_origen: 'auto' });
  });
  it('por etapa: ingreso -> MOSTO, fa -> FERMENTANDO, resto -> VINO TERMINADO', () => {
    expect(fila(inv({ lotes: [L(25313, { etapa: 'ingreso' })] }), 201).estado).toBe('MOSTO');
    expect(fila(inv({ lotes: [L(25313, { etapa: 'fa' })] }), 201).estado).toBe('FERMENTANDO');
    expect(fila(inv({ lotes: [L(25313, { etapa: 'fml' })] }), 201).estado).toBe('VINO TERMINADO');
    expect(fila(inv({ lotes: [L(25313, { etapa: '' })] }), 201).estado).toBe('VINO TERMINADO');
  });
  it('MERMO si la ultima medicion del mismo lote dio cm > 0', () => {
    const r = inv({ recorridas: [REC('2026-10-08', [F(201, { cm: 3, litros_medidos: 7420 })])] });
    expect(fila(r, 201)).toMatchObject({ estado: 'MERMO', estado_origen: 'medicion' });
  });
  it('una medicion de un lote anterior no da MERMO', () => {
    const r = inv({ recorridas: [REC('2026-10-08', [F(201, { lote: '24001', cm: 3 })])] });
    expect(fila(r, 201).estado).toBe('VINO TERMINADO');
  });
  it('OT pendiente que sale o entra: TRASIEGO (OT n)', () => {
    const r = inv({ ots: [OT()] });
    expect(fila(r, 201)).toMatchObject({ estado: 'TRASIEGO (OT 0123)', estado_origen: 'ot', ot: '0123' });
    expect(fila(r, 202)).toMatchObject({ estado: 'TRASIEGO (OT 0123)', estado_origen: 'ot' });
  });
  it('una OT ejecutada no cuenta', () => {
    expect(fila(inv({ ots: [OT({ estado: 'ejecutado' })] }), 201).estado).toBe('VINO TERMINADO');
  });
  it('lo manual gana a todo y sigue aunque la medicion sea de otro lote', () => {
    const r = inv({ ots: [OT()], recorridas: [REC('2026-10-08', [F(201, { lote: '24001', cm: 3, estado_manual: 'NO SO2' })])] });
    expect(fila(r, 201)).toMatchObject({ estado: 'NO SO2', estado_origen: 'manual' });
  });
  it('velo y obs vienen de la ultima medicion', () => {
    const r = inv({ recorridas: [REC('2026-10-08', [F(201, { velo: true, obs: 'Brett' })])] });
    expect(fila(r, 201)).toMatchObject({ velo: true, obs: 'Brett' });
  });
  it('ESTADOS_MANUALES trae la lista de la Hoja1 del Excel', () => {
    expect(ESTADOS_MANUALES).toEqual(['FUERA DE SERVICIO', 'TRASLADO', 'TRASIEGO', 'MOSTO', 'FERMENTANDO',
      'DESBORRE', 'MERMO', 'DESCUBE', 'NO SO2', 'VINO TERMINADO']);
  });
});

describe('inventarioTanques: avisos y totales', () => {
  it('dos-lotes', () => {
    expect(fila(inv({ lotes: [L(25313), L(25314)] }), 201).avisos).toContain('dos-lotes');
  });
  it('excede la Cap REAL', () => {
    expect(fila(inv({ lotes: [L(25313, { vasija_grande: 8000, litros_actuales: 8000 })] }), 201).avisos).toContain('excede');
  });
  it('sin-reparto para un lote en dos vasijas', () => {
    const r = inv({ lotes: [L(25313, { vasija_actual: 'T 201 + T 202' })] });
    expect(fila(r, 201)).toMatchObject({ litros: null });
    expect(fila(r, 201).avisos).toContain('sin-reparto');
  });
  it('diferencia: medido del mismo lote distinto de la web y sin aplicar', () => {
    const med = F(201, { cm: 3, litros_medidos: 7420 });
    expect(fila(inv({ recorridas: [REC('2026-10-08', [med])] }), 201).avisos).toContain('diferencia');
    const aplicada = { ...med, aplicado: { el: '2026-10-08', por: 'x', antes: {} } };
    expect(fila(inv({ recorridas: [REC('2026-10-08', [aplicada])] }), 201).avisos).not.toContain('diferencia');
    const igual = F(201, { cm: 0, litros_medidos: 7500.5 });
    expect(fila(inv({ recorridas: [REC('2026-10-08', [igual])] }), 201).avisos).not.toContain('diferencia');
  });
  it('totales', () => {
    const r = inv({ recorridas: [REC('2026-10-08', [F(201, { cm: 3, litros_medidos: 7420 })])] });
    expect(r.totales).toEqual({ ocupadas: 1, vacias: 2, litros: 7500, mermos: 1, conAviso: 1 });
  });
});

describe('ultimasMediciones con soloConCm', () => {
  it('saltea las filas sin cm (solo velo/obs/estado)', () => {
    const recs = [REC('2026-10-01', [F(201, { cm: 3, litros_medidos: 7420 })]), REC('2026-10-08', [F(201, { obs: 'Brett' })])];
    expect(ultimasMediciones(recs).get('201')).toMatchObject({ cm: null, obs: 'Brett' });
    expect(ultimasMediciones(recs, { soloConCm: true }).get('201')).toMatchObject({ cm: 3, fecha: '2026-10-01' });
  });
});

describe('inventarioTanques: medicion vigente', () => {
  it('relleno despues de medir: sin MERMO ni diferencia, aviso medicion-vieja', () => {
    // Medido 7420 con la web en 7400; despues una OT de relleno dejo el lote en 7500.
    const r = inv({ recorridas: [REC('2026-10-08', [F(201, { cm: 3, litros_medidos: 7420, litros_web: 7400 })])] });
    const f = fila(r, 201);
    expect(f.estado).toBe('VINO TERMINADO');
    expect(f.avisos).not.toContain('diferencia');
    expect(f.avisos).toContain('medicion-vieja');
  });
  it('medicion aplicada cuyo lote sigue en lo medido: MERMO sigue, sin diferencia', () => {
    const aplicada = F(201, { cm: 3, litros_medidos: 7420, litros_web: 7500, aplicado: { el: '2026-10-08', por: 'x', antes: {} } });
    const f = fila(inv({ lotes: [L(25313, { vasija_grande: 7420, litros_actuales: 7420 })], recorridas: [REC('2026-10-08', [aplicada])] }), 201);
    expect(f).toMatchObject({ estado: 'MERMO', estado_origen: 'medicion' });
    expect(f.avisos).not.toContain('diferencia');
    expect(f.avisos).not.toContain('medicion-vieja');
  });
  it('sin litros_web la medicion no es vigente', () => {
    const f = fila(inv({ recorridas: [REC('2026-10-08', [F(201, { cm: 3, litros_medidos: 7420, litros_web: null })])] }), 201);
    expect(f.estado).toBe('VINO TERMINADO');
    expect(f.avisos).toEqual(['medicion-vieja']);
  });
  it('velo y obs no dependen de que la medicion este vigente', () => {
    const f = fila(inv({ recorridas: [REC('2026-10-08', [F(201, { cm: 3, litros_medidos: 7420, litros_web: 7400, velo: true, obs: 'Brett' })])] }), 201);
    expect(f).toMatchObject({ velo: true, obs: 'Brett' });
  });
  it('una fila solo-obs posterior no tapa el cm anterior: MERMO y diferencia siguen', () => {
    const recs = [REC('2026-10-01', [F(201, { cm: 3, litros_medidos: 7420 })], 'rec-a'), REC('2026-10-08', [F(201, { obs: 'Brett' })], 'rec-b')];
    const f = fila(inv({ recorridas: recs }), 201);
    expect(f).toMatchObject({ estado: 'MERMO', obs: 'Brett' });
    expect(f.avisos).toContain('diferencia');
    expect(f.ultima).toMatchObject({ recorrida_id: 'rec-b' });
    expect(f.medicion).toMatchObject({ recorrida_id: 'rec-a', litros_medidos: 7420 });
  });
  it('medicion es null si nunca se midio con cm', () => {
    expect(fila(inv(), 201).medicion).toBeNull();
  });
});

describe('inventarioTanques: medido en una vasija vacia', () => {
  it('aviso medido-en-vacia si se midio vino donde la web no tiene lote', () => {
    const r = inv({ recorridas: [REC('2026-10-08', [F(202, { lote: '', cm: 10, litros_medidos: 7000, litros_web: 0 })])] });
    expect(fila(r, 202).avisos).toEqual(['medido-en-vacia']);
  });
  it('tambien sin tabla (cm sin litros)', () => {
    const r = inv({ recorridas: [REC('2026-10-08', [F(202, { lote: '', cm: 10, litros_medidos: null, litros_web: 0 })])] });
    expect(fila(r, 202).avisos).toContain('medido-en-vacia');
  });
  it('si lo medido es 0 L no avisa', () => {
    const r = inv({ recorridas: [REC('2026-10-08', [F(202, { lote: '', cm: 200, litros_medidos: 0, litros_web: 0 })])] });
    expect(fila(r, 202).avisos).toEqual([]);
  });
});

describe('inventarioTanques: OT con destino_real', () => {
  it('el destino_real de un lote de la OT tambien marca TRASIEGO', () => {
    const P2 = [...P, V(203)];
    const ot = OT({ destino: '', lotes: [{ lote: '25313', vasijas_manual: '', destino_real: 'T 203', barriles: [] }] });
    const r = inventarioTanques({ padron: P2, lotes: [L(25313)], ots: [ot], recorridas: [] });
    expect(fila(r, 203)).toMatchObject({ estado: 'TRASIEGO (OT 0123)', estado_origen: 'ot' });
  });
});

describe('inventarioTanques: Corte + achique', () => {
  it('los tanques definitivos de una OT pendiente quedan en TRASIEGO', () => {
    const r = inv({ ots: [OT({ destino: 'TQ pulmón', lotes: [], achique: { destinos: [
      { tipo: 'tanque', num: '202', lote: '26323' }, { tipo: 'chicas', barricas: 3, lote: '26324' }] } })] });
    expect(fila(r, 202)).toMatchObject({ estado: 'TRASIEGO (OT 0123)', estado_origen: 'ot' });
  });
  it('un tanque pedido solo por tipo (sin numero) no marca ninguna vasija ni rompe', () => {
    // La capacidad del tipo (201 HL) no se confunde con el tanque 201.
    const r = inv({ ots: [OT({ destino: 'TQ pulmón', lotes: [], achique: { destinos: [
      { tipo: 'tanque', num: '', clase: { tipo: 'TANQUE AC.INOX.', cap: 20100 }, litros: null, lote: '26323' }] } })] });
    expect(fila(r, 201).estado_origen).not.toBe('ot');
    expect(fila(r, 202).estado_origen).not.toBe('ot');
  });
});

describe('inventarioTanques: destinos extra', () => {
  it('un tanque extra de una OT pendiente figura en trasiego', () => {
    // mismo armado que el test de achique de arriba, pero con
    // ot.lotes[0].destinos_extra en vez de ot.achique.
    const P2 = [...P, V(214)];
    const r = inventarioTanques({ padron: P2, lotes: [L(25313)], recorridas: [], ots: [OT({ destino: 'T 201',
      lotes: [{ lote: '25313', vasijas_manual: '', barriles: [],
        destinos_extra: [{ tipo: 'tanque', num: '214', lote: '26330', mov_id: 'x' }] }] })] });
    expect(fila(r, 214)).toMatchObject({ estado: 'TRASIEGO (OT 0123)', estado_origen: 'ot' });
  });
});
