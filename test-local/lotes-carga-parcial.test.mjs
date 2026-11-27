import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planParcial } from '../public/lotes/js/carga-parcial.js';
import { parsearFila, planDeColumnas } from '../public/lotes/js/carga-cols.js';
const a = { lote:'26001', fecha_analisis:'2026-11-26', vasija:'T1', ph:3.4, etanol:13, so2_libre:22 };
const fila = (s) => { const r = parsearFila(s, planDeColumnas('lote, fecha, ph, so2_libre')); return {...r.campos,_errores:r.errores}; };
test('solo cambia SO2; blancos conservados y cero valido', () => {
 const p = planParcial([fila('26001\t26/11/2026\t\t0')],[a])[0];
 assert.deepEqual(p.cambios,{so2_libre:0});
 assert.deepEqual({...a,...p.cambios},{...a,so2_libre:0});
});
test('no modifica fechas distintas ni crea filas',()=>assert.ok(planParcial([fila('26001\t25/11/2026\t\t28')],[a])[0].error));
test('ambiguedad bloqueada',()=>assert.ok(planParcial([fila('26001\t26/11/2026\t\t28')],[a,{...a,vasija:'T2'}])[0].error));
test('vasija identifica registro',()=>assert.equal(planParcial([{...fila('26001\t26/11/2026\t\t28'),vasija:'T2'}],[a,{...a,vasija:'T2'}])[0].i,1));
test('duplicados bloqueados',()=>assert.ok(planParcial([fila('26001\t26/11/2026\t\t28'),fila('26001\t26/11/2026\t\t29')],[a]).every(p=>p.error)));
test('sin cambios no guarda',()=>assert.ok(planParcial([fila('26001\t26/11/2026\t\t22')],[a])[0].error));
