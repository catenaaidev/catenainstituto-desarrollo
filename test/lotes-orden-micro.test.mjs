/* Tests de la orden de microbiologia (Orden de muestras, tipo 🦠): textos
 * editables con defaults del Excel 0868, columnas del papel y cartel. La hoja
 * es la vista previa editable, asi que los textos salen como campos
 * data-campo (hoja-campos.js). */
import { describe, it, expect } from 'vitest';
import { TEXTOS_MICRO_DEF, textosMicro, cfgHojasMicro, hojaCartel }
  from '../public/lotes/js/orden-micro.js';

describe('textosMicro', () => {
  it('sin nada guardado devuelve los textos del Excel', () => {
    expect(textosMicro(null)).toEqual(TEXTOS_MICRO_DEF);
    expect(textosMicro(undefined).destino).toBe('Vista Flores');
  });
  it('lo guardado pisa el default, incluso vacio', () => {
    const t = textosMicro({ nota: 'Entregar a Rosana', retira: '' });
    expect(t.nota).toBe('Entregar a Rosana');
    expect(t.retira).toBe('');
    expect(t.de).toBe('Oriana - CIW');
  });
  it('ignora claves desconocidas y valores que no son texto', () => {
    const t = textosMicro({ nota: 5, hack: '<x>', de: null });
    expect(t).toEqual(TEXTOS_MICRO_DEF);
    expect('hack' in t).toBe(false);
  });
});

describe('cfgHojasMicro', () => {
  const filas = [{ lote: '26141', vasija: 'Barricas', variedad: 'Malbec' }];
  const cfg = cfgHojasMicro({ filas, textos: null, dia: 'lunes' });

  it('papel con # / Check / Lote / Vasija, sin variedad, columnas justas', () => {
    expect(cfg.columnas).toBe(4);
    expect(cfg.thead).toMatch(/#.*Check.*Lote.*Vasija/);
    expect(cfg.claseTabla).toBe('oh-tabla-justa');
    const tr = cfg.renderFila({ numero: 1, fila: filas[0] });
    expect(tr).toContain('26141');
    expect(tr).toContain('Barricas');
    expect(tr).not.toContain('Malbec');
  });
  it('es la vista previa editable: textos como campos de la hoja', () => {
    expect(cfg.editable).toBe(true);
    expect(cfg.banda[0]).toEqual({ campo: 'banda', valor: 'Microbiología VF', ph: 'Banda' });
    expect(cfg.banda[1]).toMatchObject({ campo: 'dia', valor: 'lunes' });
    expect(cfg.antesBanda).toMatch(/<textarea[^>]*data-campo="instrucciones"[^>]*>Tomar muestras según protocolo adjunto\n/);
    expect(cfg.nota).toMatch(/data-campo="subtitulo".*Bolsas estériles 200 ml/);
    expect(cfg.alLadoTabla).toMatch(/data-campo="cierre"[^>]*>Colocarle cartel adjunto/);
  });
  it('un texto borrado queda como campo vacio con placeholder (no se imprime)', () => {
    const c = cfgHojasMicro({ filas, textos: { instrucciones: '', subtitulo: '' } });
    expect(c.antesBanda).toMatch(/placeholder="Instrucciones \(opcional\)"[^>]*><\/textarea>/);
    expect(c.nota).toMatch(/value=""/);
  });
  it('el cartel va primero entre las hojas extra', () => {
    const c = cfgHojasMicro({ filas, textos: null, hojasExtra: ['<div>mapa</div>'] });
    expect(c.hojasExtra).toHaveLength(2);
    expect(c.hojasExtra[0]).toContain('oh-cartel');
    expect(c.hojasExtra[1]).toBe('<div>mapa</div>');
  });
});

describe('hojaCartel', () => {
  it('lleva los cinco campos editables con lo guardado, escapado', () => {
    const h = hojaCartel({ nota: 'Entregar a "Julieta" <x>' });
    for (const l of ['De:', 'Retira en Agrelo:', 'Para:', 'Destino:', 'Nota:']) expect(h).toContain(l);
    for (const k of ['de', 'retira', 'para', 'destino', 'nota']) expect(h).toContain(`data-campo="${k}"`);
    expect(h).toContain('value="Oriana - CIW"');
    expect(h).toContain('value="Entregar a &quot;Julieta&quot; &lt;x>"');
  });
});
