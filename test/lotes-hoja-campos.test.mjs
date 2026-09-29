/* Tests de los campos editables sobre la hoja (vista previa de la Orden de
 * muestras) y de las fechas por defecto de la hoja. */
import { describe, it, expect } from 'vitest';
import { campoHoja, hoyLocalISO, diaDeSemana } from '../public/lotes/js/hoja-campos.js';

describe('campoHoja', () => {
  it('input de texto con data-campo, clase y placeholder, escapado', () => {
    const h = campoHoja('nro', 'OT "7" <b>', { cls: 'oh-campo-nro', ph: '—' });
    expect(h).toMatch(/^<input class="oh-campo oh-campo-nro" data-campo="nro" placeholder="—" type="text"/);
    expect(h).toContain('value="OT &quot;7&quot; &lt;b>"');
  });
  it('fecha como input date', () => {
    expect(campoHoja('fecha', '2026-09-29', { tipo: 'date' })).toContain('type="date" value="2026-09-29"');
  });
  it('area como textarea que conserva los renglones', () => {
    const h = campoHoja('cierre', 'a\n<b>', { tipo: 'area' });
    expect(h).toBe('<textarea class="oh-campo oh-campo-area" data-campo="cierre" rows="1">a\n&lt;b&gt;</textarea>');
  });
});

describe('fechas de la hoja', () => {
  it('hoyLocalISO usa la hora de la PC, no UTC', () => {
    // 28/09 a las 23:30 locales: toISOString() ya diria 29 en Mendoza (UTC-3)
    expect(hoyLocalISO(new Date(2026, 8, 28, 23, 30))).toBe('2026-09-28');
    expect(hoyLocalISO(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });
  it('diaDeSemana de una fecha ISO', () => {
    expect(diaDeSemana('2026-09-28')).toBe('lunes');
    expect(diaDeSemana('2026-09-29')).toBe('martes');
    expect(diaDeSemana('2026-10-04')).toBe('domingo');
    expect(diaDeSemana('')).toBe('');
    expect(diaDeSemana('29/09/2026')).toBe('');
  });
});
