/**
 * Reglas que tienen que seguir cumplidas en el index.html real de Barriles
 * (lo lee vitest.config.ts y llega como binding: el runtime de Workers no
 * tiene fs). La lógica pura se testea en barriles-sync.test.mjs; esto cuida
 * que la página la siga usando y que no vuelvan los defectos de la auditoría.
 */

import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const html = env.INDEX_HTML_BARRILES;

describe('la pantalla de Barriles', () => {
  it('carga js/sync.js antes del script principal', () => {
    const iSync = html.indexOf('<script src="js/sync.js"></script>');
    const iPrincipal = html.search(/<script>\r?\n'use strict';/);
    expect(iSync).toBeGreaterThan(-1);
    expect(iPrincipal).toBeGreaterThan(iSync);
  });

  it('no arma onclick con el id de una orden entre comillas a mano', () => {
    // '${o.id}' o '\'' + o.id: un id con una comilla cerraba el string.
    expect(html).not.toMatch(/'\$\{o\.id\}'/);
    expect(html).not.toMatch(/\\'' \+ o\.id/);
  });

  it('escapa el lote en el cartelito de la vista 3D', () => {
    expect(html).not.toMatch(/Lote \$\{lote \|\| '—'\}/);
  });

  it('avisa antes de cerrar con cambios sin confirmar', () => {
    expect(html).toMatch(/addEventListener\('beforeunload'[\s\S]{0,80}pendienteLocal/);
  });

  it('sondear no toma como versión una respuesta que no la trae', () => {
    const cuerpo = html.slice(html.indexOf('async function sondear()'), html.indexOf('function fusionarSobreServidor'));
    expect(cuerpo).toContain('versionDe(');
    expect(cuerpo).not.toMatch(/\(await fetch\(API\+'\/version'/);
  });

  it('no quedan instrucciones del servidor local ni el "Borrar todo"', () => {
    expect(html).not.toContain('abrí http://localhost:8766');
    expect(html).not.toContain('entrá a <b>http://localhost:8766');
    expect(html).not.toContain('id="btnBorrarTodo"');
    expect(html).not.toContain("let modoConexion = 'local'");
  });
});
