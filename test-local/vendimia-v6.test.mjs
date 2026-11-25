import test from 'node:test';
import assert from 'node:assert/strict';
import {integrarMediciones,ponerValor,fijarFechaMolienda,filtrar,enriquecer,graficoSVG,isoASerial} from '../public/vendimia/v6.js';
const {PLANTILLAS}=await import('../src/vendimia/plantillas-data.ts');
const snap=id=>structuredClone(PLANTILLAS.find(p=>p.id===id).snapshot);
const celda=(s,r,c)=>s.sheets[0].celldata.find(x=>x.r===r&&x.c===c)?.v;

test('V6: Brix/temperatura del control diario entran en la Tintos por fecha, sin pisar ni fórmulas', ()=>{
 const s=snap('tintos-v1');
 // fila 61 (r=60) = día 1 = 46123 = 2026-04-11. Valor manual previo en la fila del día 2.
 {const x=s.sheets[0].celldata.find(x=>x.r===61&&x.c===2);if(x)x.v={...x.v,v:20};else s.sheets[0].celldata.push({r:61,c:2,v:{v:20}});}
 const r=integrarMediciones(s,[{fecha:'2026-04-11',brix:24.5,temperatura:26},{fecha:'2026-04-12',brix:22,temperatura:null},{fecha:'2030-01-01',brix:1,temperatura:1}]);
 assert.equal(celda(r.snapshot,60,2).v,24.5); assert.equal(celda(r.snapshot,60,3).v,26);
 assert.equal(celda(r.snapshot,61,2).v,20,'no pisa el dato manual');
 assert.equal(r.agregadas,2); assert.equal(r.conflictos.length,1); assert.equal(r.sinFila.length,1);
 assert.equal(celda(r.snapshot,60,1).f, celda(s,60,1).f, 'la fórmula de fecha queda igual');
 assert.equal(celda(ponerValor(r.snapshot,r.conflictos[0]),61,2).v,22);
 // tolera filas insertadas arriba
 const d=snap('tintos-v1');for(const c of d.sheets[0].celldata)c.r+=3;
 assert.equal(celda(integrarMediciones(d,[{fecha:'2026-04-11',brix:24,temperatura:null}]).snapshot,63,2).v,24);
});
test('V6: la molienda fija la fecha de recepción en la copia, no TODAY(); el original no cambia', ()=>{
 const s=snap('molienda-ch-v1'),r=fijarFechaMolienda(s,'2026-03-05');
 assert.ok(r.cambio); assert.equal(celda(r.snapshot,1,2).v,isoASerial('2026-03-05')); assert.equal(celda(r.snapshot,1,2).f,undefined);
 assert.match(String(celda(s,1,2).f),/TODAY/i);
 assert.equal(fijarFechaMolienda(r.snapshot,'2026-03-05').cambio,false);
});
test('V6: filtros del historial por año, estado, variedad, vasija y planilla', ()=>{
 const xs=[{lote:'26001',nombre_lote:'A',vasija:'T 12',recepcion:'2026-03-01',estado:'en_proceso',autor:'a',actualizado:'2026-03-01',planillas:'brix-v1',informacion_id:JSON.stringify({variedad:'Malbec'})},{lote:'27001',nombre_lote:'B',vasija:'',recepcion:'',estado:'borrador',autor:'b',actualizado:'2027-01-01',informacion_id:'{}'}].map(enriquecer);
 assert.deepEqual(filtrar(xs,{anio:'2026'}).map(x=>x.lote),['26001']);
 assert.deepEqual(filtrar(xs,{vasija:'t12'}).map(x=>x.lote),['26001']);
 assert.deepEqual(filtrar(xs,{planilla:'brix-v1',variedad:'Malbec',estado:'en_proceso'}).length,1);
 assert.deepEqual(filtrar(xs,{q:'malbec'}).length,1);
 assert.match(graficoSVG([]),/Todavía no hay/); assert.match(graficoSVG([{fecha:'2026-03-01',brix:24,temperatura:null}]),/<svg/);
});
