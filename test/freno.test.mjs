/**
 * El freno de la importación a la nube.
 *
 * Este test está en .mjs y no en .ts a propósito: `tsconfig.json` incluye solo
 * `src/**\/*.ts` y `test/**\/*.ts`, así que `tsc --noEmit` no intenta resolver
 * `scripts/freno.mjs` (no hay declaraciones para un .mjs y el typecheck
 * fallaría, frenando el despliegue). Vitest sí lo levanta. No lo "arregles"
 * pasándolo a .ts.
 */

import { describe, it, expect } from 'vitest';
import { decidirFreno, BANDERA } from '../scripts/freno.mjs';

describe('decidirFreno', () => {
  it('deja pasar una importación a la base local', () => {
    const r = decidirFreno(['--modulo', 'lotes', '--local', '--datos', 'x.json']);
    expect(r.permitido).toBe(true);
    expect(r.motivo).toBe('');
  });

  it('frena una importación a la nube sin la bandera', () => {
    const r = decidirFreno(['--modulo', 'lotes', '--remote', '--datos', 'x.json']);
    expect(r.permitido).toBe(false);
  });

  it('explica cómo seguir, nombrando la bandera', () => {
    const r = decidirFreno(['--modulo', 'lotes', '--remote', '--datos', 'x.json']);
    expect(r.motivo).toContain(BANDERA);
  });

  it('avisa que reemplaza el documento entero, no que fusiona', () => {
    const r = decidirFreno(['--modulo', 'prensas', '--remote', '--datos', 'x.json']);
    expect(r.motivo.toLowerCase()).toContain('reemplaza');
  });

  it('deja pasar la nube cuando la bandera está presente', () => {
    const r = decidirFreno(['--modulo', 'lotes', '--remote', BANDERA, '--datos', 'x.json']);
    expect(r.permitido).toBe(true);
    expect(r.motivo).toBe('');
  });

  it('no le molesta la bandera en una importación local', () => {
    const r = decidirFreno(['--modulo', 'lotes', '--local', BANDERA]);
    expect(r.permitido).toBe(true);
  });

  it('frena también si --remote viene después de otras banderas', () => {
    const r = decidirFreno(['--datos', 'x.json', '--modulo', 'barriles', '--remote']);
    expect(r.permitido).toBe(false);
  });
});
