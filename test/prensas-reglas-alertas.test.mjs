/* Tests de los criterios de alerta de Prensas (public/shared/reglas-alertas.js).
 *
 * Lo que se protege: un documento sin config.alertas se comporta EXACTAMENTE
 * como antes de que existiera la pestaña Configuración, y un valor cargado a
 * mano pisa solo su campo.
 *
 * El archivo es un script clásico que publica globales (lo carga un <script>
 * en la app y en el reporte).
 */
import { describe, it, expect } from 'vitest';
import { PLANTILLA } from '../src/prensas/reporte-plantilla';
import * as modulo from '../public/shared/reglas-alertas.js';

// Según cómo lo transforme vitest, el UMD sale por module.exports (default) o
// por globalThis, como en el navegador.
const api = (modulo.default && modulo.default.reglasAlertas) ? modulo.default : globalThis;
const { ALERTAS_DEFAULT, CAMPOS_ALERTAS, reglasAlertas, avisosAlertas } = api;

describe('reglasAlertas', () => {
  it('sin config usa los valores de siempre', () => {
    const esperado = {
      ph_max: 4, av_max: 1, gluc_max: 3, malico_max: 0.5, av_atencion: 0.85,
      av_salto: 0.3, vencido_dias: 30, proximo_dias: 21, accion_ml: 250,
    };
    expect(reglasAlertas(undefined)).toEqual(esperado);
    expect(reglasAlertas({})).toEqual(esperado);
    expect(reglasAlertas({ alertas: {} })).toEqual(esperado);
    expect(ALERTAS_DEFAULT).toEqual(esperado);
  });

  it('un valor guardado pisa solo su campo', () => {
    const r = reglasAlertas({ alertas: { ph_max: 3.8 } });
    expect(r.ph_max).toBe(3.8);
    expect(r.av_max).toBe(1);
    expect(r.vencido_dias).toBe(30);
  });

  it('acepta texto con coma decimal', () => {
    expect(reglasAlertas({ alertas: { malico_max: '0,4' } }).malico_max).toBe(0.4);
  });

  it('vacío, negativo o basura caen al valor por defecto', () => {
    for (const malo of ['', null, 'abc', -1, NaN, Infinity]) {
      expect(reglasAlertas({ alertas: { gluc_max: malo } }).gluc_max).toBe(3);
    }
  });

  it('el cero es un valor válido', () => {
    expect(reglasAlertas({ alertas: { malico_max: 0 } }).malico_max).toBe(0);
  });

  it('no deja pasar claves que no son criterios', () => {
    expect(reglasAlertas({ alertas: { otra: 5 } })).not.toHaveProperty('otra');
  });
});

describe('CAMPOS_ALERTAS', () => {
  it('hay un recuadro por cada criterio, sin repetidos', () => {
    const ks = CAMPOS_ALERTAS.map(c => c.k);
    expect(new Set(ks).size).toBe(ks.length);
    expect(ks.sort()).toEqual(Object.keys(ALERTAS_DEFAULT).sort());
  });

  it('la frase de cada recuadro muestra el valor', () => {
    const r = reglasAlertas({ alertas: { ph_max: 3.7, proximo_dias: 18 } });
    for (const c of CAMPOS_ALERTAS) expect(c.regla(r[c.k], r)).toContain(String(r[c.k]));
    expect(CAMPOS_ALERTAS.find(c => c.k === 'proximo_dias').regla(18, r)).toContain('30');
  });
});

describe('avisosAlertas', () => {
  it('con los valores de siempre no avisa nada', () => {
    expect(avisosAlertas(reglasAlertas())).toEqual([]);
  });

  it('avisa si "próximo" queda después de "vencido"', () => {
    expect(avisosAlertas(reglasAlertas({ alertas: { proximo_dias: 40 } }))).toHaveLength(1);
  });

  it('avisa si la AV de atención alcanza a la de NO OK', () => {
    expect(avisosAlertas(reglasAlertas({ alertas: { av_atencion: 1 } }))).toHaveLength(1);
  });
});

describe('reporte del servidor', () => {
  it('carga los criterios compartidos', () => {
    expect(PLANTILLA).toContain('<script src="/shared/reglas-alertas.js"></script>');
    expect(PLANTILLA).toContain('reglasAlertas(DATOS.config)');
  });

  it('no conserva umbrales escritos a mano', () => {
    for (const fijo of ['f.ph>4', 'f.av>=1', 'f.gluc>3', 'f.malico>0.5', 'f.dias>30', 'v>4;', 'v>3;', 'v>0.5;', 'ph>4)']) {
      expect(PLANTILLA).not.toContain(fijo);
    }
  });
});
