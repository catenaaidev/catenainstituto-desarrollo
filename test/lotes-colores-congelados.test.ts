/**
 * Los colores con significado de Lotes son criterios que el equipo lee de
 * memoria (verde = en criterio, franja roja = alarma…). La Etapa 2 de la
 * estética cambia los tokens de interfaz por los de Prensas: estos tienen que
 * quedar con el valor de antes. Si este test falla, el cambio de estética se
 * llevó puesto un color con significado.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { reglasPlanas, cssDe, norm } from '../scripts/css-reglas.mjs';

function raiz(html: string): Record<string, string> {
  const m = cssDe(html).match(/:root\s*\{([\s\S]*?)\}/);
  const out: Record<string, string> = {};
  for (const decl of (m ? m[1] : '').split(';')) {
    const i = decl.indexOf(':');
    if (i > 0 && decl.slice(0, i).trim().startsWith('--')) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim().toLowerCase();
  }
  return out;
}

const CONGELADOS: Record<string, string> = {
  '--ver-ok': '#3f7d4f', '--ver-mal': '#b03a2e', '--ver-alerta': '#b07d2c', '--ver-info': '#5b7b86',
  '--ver-acento': '#8a3340', '--ver-acento-linea': 'rgba(138,51,64,.18)',
  '--ver-dentro': '#b7dba9', '--ver-fuera': '#e8a15f', '--ver-gris': '#e7e3da',
  '--ver-apagado': '#8c857b', '--ver-cero': '#f1efe9', '--ver-tinta': '#2a2622',
  '--sc-0': '#4a8360', '--sc-1': '#8aa14a', '--sc-2': '#d0a133', '--sc-3': '#c9762f', '--sc-4': '#b03a2e',
  '--tb-ok-bg': '#dcfce7', '--tb-ok-fg': '#166534', '--tb-mal-bg': '#fde8ec', '--tb-mal-fg': '#8a1538',
  '--tb-neu-bg': '#f1f5f9', '--tb-neu-fg': '#52606d', '--tb-primario': '#0b6fae', '--tb-fondo': '#f4f7fa',
  '--tb-panel': '#ffffff', '--tb-linea': '#cbd5e1', '--tb-tinta': '#17212b',
};

/* Selectores cuyo color ES el dato. No pueden usar tokens de interfaz
 * (--ok/--nook/--warn/--info/--accent…): esos pasan a valer lo de Prensas. */
const CON_SIGNIFICADO = new RegExp([
  String.raw`td\.(dentro|fuera)`, 'analisis-separador', 'fila-agregado', String.raw`tr\.(crit|venc|org|nuevo)`,
  String.raw`legend-inline \.sw`, String.raw`kpi-card\.kpi-`, String.raw`faq-item\.hi`, 'prox-', 'so2-result-box',
  'so2-anulada', 'inv-estado', 'inv-chip', 'inv-con-aviso', String.raw`\.ag-p\b`, 'pr-(alta|media|baja)',
  String.raw`ag-ficha\.p`, String.raw`ag-carga( |\.exc)`, 'ag-ronda', String.raw`ag-dia\.hoy`, 'ag-fer',
  String.raw`hm-cell\.v`, String.raw`\.tb-`, String.raw`\.barra\.(media|baja|cerrado)`, String.raw`\.barra ?> ?span`,
  String.raw`\.hito\.`, 'timeline li\\.', 'est-(finalizada|no_finalizada|excluida)', 'cruce-(alta|media|baja|ok)',
  'fila-pendiente', 'mov-pendiente', 'mer-llena', 'otc-(coincide|difiere|revisar|aviso)',
].join('|'));
const TOKEN_DE_INTERFAZ = /var\(--(ok|nook|warn|info|accent|accent2|accent-line|accent-soft|accent-rgb)\)/;

describe('colores con significado de Lotes', () => {
  it('los tokens congelados tienen su valor de siempre', () => {
    const r = raiz(env.LOTES_HTML);
    for (const [k, v] of Object.entries(CONGELADOS)) expect(r[k], k).toBe(v);
  });

  it('ninguna regla con significado usa un token de interfaz', () => {
    const malas = reglasPlanas(env.LOTES_HTML)
      .filter((r) => CON_SIGNIFICADO.test(r.selector) && TOKEN_DE_INTERFAZ.test(r.cuerpo))
      .map((r) => r.selector + '{' + r.cuerpo + '}');
    expect(malas).toEqual([]);
  });

  it('los veredictos de Análisis y los grises de la escala salen de --ver-*', () => {
    const css = norm(cssDe(env.LOTES_HTML));
    for (const d of [
      'td.dentro input.cell,td.dentro{background:var(--ver-dentro) !important}',
      'td.fuera input.cell,td.fuera{background:var(--ver-fuera) !important}',
      '.hm-cell.v0{background:var(--ver-cero);color:var(--ver-apagado)',
      '.hm-cell.v1{background:#e7ded4;color:var(--ver-tinta)}',
      '#tab-agenda .ag-p.p5{background:var(--ver-gris)}',
      '#tab-agenda .ag-ficha.p5{color:var(--ver-apagado)}',
    ]) expect(css, d).toContain(norm(d));
  });

  it('la línea de objetivo del gráfico de SO2 molecular lee --ver-acento', () => {
    expect(env.LOTES_JS['js/dash-graficos.js']).toContain("borderColor: tok('--ver-acento', '#8a3340')");
  });
});
