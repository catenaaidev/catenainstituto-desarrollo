// Merge de main (pantalla en la URL) con el modo órdenes: el modo no anota la
// pantalla en el #hash ni deja que el hash la cambie, y Prensas abre
// Muestras/Rellenos aunque ya no tengan pestaña.
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const cuerpo = (src: string, firma: string) => {
  const i = src.indexOf(firma);
  expect(i, firma).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('\n}', i));
};

describe('Prensas: modo órdenes con la pantalla en la URL', () => {
  const app = env.PRENSAS_JS['app.js'];
  it('activarVista no exige botón de pestaña y no anota el hash en modo órdenes', () => {
    const f = cuerpo(app, 'function activarVista(v, op={}){');
    expect(f).toContain("if(!$('v-'+v)) return;");
    expect(f).not.toMatch(/if\(!b\s*\|\|/);
    expect(f).toMatch(/!op\.sinHistorial && !enModoOrdenesP\(\) && window\.CIWPantalla\) CIWPantalla\.anotarPantalla\(v\)/);
    expect(f).toContain('if(listo) renderActive();');
  });
  it('ni Atrás ni el F5 mueven la pantalla por el hash en modo órdenes', () => {
    const f = cuerpo(app, 'function setupTabs(){');
    expect(f).toMatch(/addEventListener\('popstate',\(\)=>\{ if\(enModoOrdenesP\(\)\) return;/);
    expect(f).toContain('const enUrl=enModoOrdenesP()?null:deUrl();');
    expect(f).not.toContain('const irA=');
  });
  it('renderActive lee la vista de la sección activa, no del botón', () => {
    const f = cuerpo(app, 'function renderActive(){');
    expect(f).not.toContain(".tabs button[data-v].active').dataset.v");
    expect(f).toContain("document.querySelector('.view.active')");
    expect(f).toContain("v==='orden'");
    expect(f).toContain("v==='relleno'");
  });
});

describe('Lotes: modo órdenes con la pantalla en la URL', () => {
  const nucleo = env.LOTES_JS['js/nucleo.js'];
  const app = env.LOTES_JS['app.js'];
  it('mostrarTab no anota la pantalla en modo órdenes', () => {
    const f = cuerpo(nucleo, 'export function mostrarTab(nombre, op = {}){');
    expect(f).toMatch(/if \(enModoOrdenes\(\)\)\{[^\n]*replaceState/);
    expect(f).toContain('else _PU().anotarPantalla(nombre);');
    expect(nucleo).toContain("export const enModoOrdenes = () => !!new URLSearchParams(location.search).get('orden');");
  });
  it('app.js: en modo órdenes ni la restauración del hash ni Atrás llevan a otra pantalla', () => {
    expect(app).toContain('const pantallaEnUrl = enModoOrdenes() ? null : pantallaDeUrl();');
    expect(app).toMatch(/else if \(enModoOrdenes\(\)\) \{ if \(vistaActiva\(\) === 'ficha'\) mostrarTab\(vistaAntesDeFicha\(\)/);
  });
  it('app.js: el modo órdenes arranca dentro del try/finally de main, antes de restaurada()', () => {
    const i = app.indexOf('arrancarModoOrden(modo)');
    expect(i).toBeGreaterThan(app.indexOf('await cargarDatos();'));
    expect(i).toBeLessThan(app.indexOf('window.CIWPantalla?.restaurada();\n  }'));
  });
});
