/* fotoOrdenMuestras: la foto de la Orden de muestras / microbiología que se
 * guarda en ordenes_hojas al imprimir. Vive en orden-foto.js (pura) porque
 * vista-orden.js importa nucleo.js, que toca el DOM al cargarse. */
import { describe, it, expect } from 'vitest';
import { fotoOrdenMuestras, cfgDeHojaGuardada, fechaPapel } from '../public/lotes/js/orden-foto.js';

const hoja = { nro: '0961', fecha: '2026-11-04', dia: 'miércoles', emitio: 'Oriana', recibio: 'Juan' };

describe('fotoOrdenMuestras — análisis', () => {
  const filas = [
    { lote: '26015', variedad: 'Malbec', vasija: 'Barrica', barril: '1203', cantidad: 2,
      recipiente: 'Tubo falcon', litros: 900, motivo: 'vencido', manual: true, noEncontrado: false },
    { lote: '', variedad: '', vasija: '', barril: '', cantidad: 1, recipiente: 'Tubo falcon' },
    { lote: '  ', variedad: 'x', vasija: ' ', cantidad: 1, recipiente: 'Tubo falcon' },
    { lote: '', variedad: '', vasija: 'Tanque 12', cantidad: 1, recipiente: 'Botella 120 mL' },
  ];

  it('arma la hoja con encabezado, título, conBarril y las filas con los 6 campos', () => {
    const f = fotoOrdenMuestras({ tipo: 'muestras', titulo: 'Orden de Trabajo', hoja, filas, conBarril: true });
    expect(f).toEqual({
      titulo: 'Orden de Trabajo', fecha: '2026-11-04', dia: 'miércoles', nro: '0961',
      emitio: 'Oriana', recibio: 'Juan', conBarril: true,
      filas: [
        { lote: '26015', variedad: 'Malbec', vasija: 'Barrica', barril: '1203', cantidad: 2, recipiente: 'Tubo falcon' },
        { lote: '', variedad: '', vasija: 'Tanque 12', barril: '', cantidad: 1, recipiente: 'Botella 120 mL' },
      ],
    });
  });

  it('descarta las filas sin lote ni vasija', () => {
    const f = fotoOrdenMuestras({ tipo: 'muestras', titulo: 'T', hoja, filas, conBarril: false });
    expect(f.filas.map(r => r.lote || r.vasija)).toEqual(['26015', 'Tanque 12']);
    expect(f.conBarril).toBe(false);
  });

  it('no comparte referencias con las filas de la pantalla', () => {
    const f = fotoOrdenMuestras({ tipo: 'muestras', titulo: 'T', hoja, filas, conBarril: true });
    filas[0].barril = '9999';
    expect(f.filas[0].barril).toBe('1203');
    filas[0].barril = '1203';
  });

  it('sin filas o sin hoja no se rompe', () => {
    const f = fotoOrdenMuestras({ tipo: 'muestras' });
    expect(f.filas).toEqual([]);
    expect(f.nro).toBe('');
    expect(f.conBarril).toBe(false);
  });
});

describe('fotoOrdenMuestras — microbiología', () => {
  it('filas {lote, vasija} + los textos de la orden y el cartel', () => {
    const textos = { banda: 'MICRO', destino: 'Vista Flores' };
    const f = fotoOrdenMuestras({
      tipo: 'micro', titulo: 'OT micro', hoja,
      filas: [
        { lote: '26015', variedad: 'Malbec', vasija: 'Barrica', barril: '1', cantidad: 1, recipiente: 'x' },
        { lote: '', vasija: '' },
      ],
      textosMicro: textos, conBarril: true,
    });
    expect(f).toEqual({
      titulo: 'OT micro', fecha: '2026-11-04', dia: 'miércoles', nro: '0961',
      emitio: 'Oriana', recibio: 'Juan',
      filas: [{ lote: '26015', vasija: 'Barrica' }],
      textos: { banda: 'MICRO', destino: 'Vista Flores' },
    });
    textos.banda = 'otro';
    expect(f.textos.banda).toBe('MICRO');
  });
});

/* cfgDeHojaGuardada: la hoja guardada -> cfg de pintarHojas para redibujarla
 * en solo lectura igual que el papel (pintarHojas importa nucleo.js, así que
 * se prueba el cfg y el HTML de renderFila / hojasExtra, que son puros). */
describe('cfgDeHojaGuardada', () => {
  const micro = {
    titulo: 'OT Micro', fecha: '2026-11-04', dia: 'miércoles', nro: '0903', emitio: '', recibio: '',
    filas: [{ lote: '26038', vasija: '2 barricas' }],
    textos: { instrucciones: 'Instr', banda: 'Micro VF', subtitulo: 'Bolsas', cierre: 'Cierre',
      de: 'Oriana - CIW', retira: 'Martín Pineda', para: 'Microbiología', destino: 'Vista Flores', nota: 'Entregar a Julieta' },
  };
  const filasHtml = cfg => cfg.filas.map((fila, i) => cfg.renderFila({ numero: i + 1, fila })).join('');

  it('fechaPapel da dd/mm/aaaa y el año, como el papel impreso', () => {
    expect(fechaPapel('2026-11-04')).toEqual({ fechaTxt: '04/11/2026', anio: '2026' });
    expect(fechaPapel('')).toEqual({ fechaTxt: '', anio: '' });
  });

  it('micro: lleva las filas guardadas (lote, vasija), los textos y la fecha', () => {
    const cfg = cfgDeHojaGuardada(micro, 'micro');
    expect(cfg.editable).toBe(false);
    expect(cfg.meta).toMatchObject({ fechaTxt: '04/11/2026', anio: '2026', nro: '0903' });
    expect(cfg.filas).toEqual([{ lote: '26038', vasija: '2 barricas' }]);
    const html = filasHtml(cfg);
    expect(html).toContain('value="26038"');
    expect(html).toContain('value="2 barricas"');
    const cartel = cfg.hojasExtra.join('');
    for (const v of ['Oriana - CIW', 'Martín Pineda', 'Microbiología', 'Vista Flores', 'Entregar a Julieta'])
      expect(cartel).toContain(`value="${v}"`);
    expect(cfg.banda[0]).toMatchObject({ valor: 'Micro VF' });
    expect(cfg.despuesTablaUltima || '').not.toContain('oh-agregar');
  });

  it('muestras: filas, columna Barril si se guardó con barril, fecha y sin botón de agregar', () => {
    const h = { titulo: 'OT', fecha: '2026-11-04', dia: 'miércoles', nro: '0961', conBarril: true,
      filas: [
        { lote: '26015', variedad: 'Malbec', vasija: 'Barrica', barril: '1203', cantidad: 2, recipiente: 'Tubo falcon' },
        { lote: '26016', variedad: 'Syrah', vasija: 'Tanque 4', barril: '', cantidad: 1, recipiente: 'Botella 120 mL' },
      ] };
    const cfg = cfgDeHojaGuardada(h, 'muestras');
    expect(cfg.editable).toBe(false);
    expect(cfg.meta).toMatchObject({ fechaTxt: '04/11/2026', anio: '2026', nro: '0961' });
    expect(cfg.columnas).toBe(8);
    const html = filasHtml(cfg);
    for (const v of ['26015', '1203', '26016', 'Tanque 4', 'Botella 120 mL']) expect(html).toContain(`value="${v}"`);
    expect(html).toContain('Malbec');
    expect(cfg.despuesTablaUltima || '').not.toContain('oh-agregar');
  });

  it('sin fecha en la hoja usa la de la orden', () => {
    const cfg = cfgDeHojaGuardada({ filas: [] }, 'muestras', { fecha: '2026-10-30', nro: '0900' });
    expect(cfg.meta).toMatchObject({ fechaTxt: '30/10/2026', anio: '2026', nro: '0900' });
  });
});
