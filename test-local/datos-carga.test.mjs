import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seleccionInicial,loteVisible,anioBodega} from '../public/shared/anios.js';
import {pedirDocumento} from '../public/shared/carga-servidor.js';
import {crearSelectorAnios} from '../public/shared/selector-anios.js';
const lotes=[{lote:25001},{lote:26001},{lote:26002},{lote:27001}];
test('2027 precargado no oculta 2026; año elegido a mano se conserva',()=>{
 assert.deepEqual(seleccionInicial(null,[2024,2025,2026,2027],2026),[2026]);
 assert.deepEqual(seleccionInicial([2027],[2026,2027],2026),[2027]);
 assert.deepEqual(seleccionInicial(null,[2027,2028],2026),[2027]);
 assert.equal(anioBodega(new Date('2027-01-01T02:59:59Z')),2026);
});
test('selector ofrece todos y actual, mantiene filtros explícitos y muestra totales',()=>{
 const almac=new Map([['lotes_anios_ultima','[2027]']]); let click;
 const cont={innerHTML:'',addEventListener:(k,f)=>click=f};
 globalThis.localStorage={getItem:k=>almac.get(k),setItem:(k,v)=>almac.set(k,v)};
 globalThis.document={getElementById:()=>cont,dispatchEvent:()=>{}};
 const sel=crearSelectorAnios({claveLS:'lotes_anios',idContenedor:'sel',evento:'test'});
 // En la fecha simulada de la prueba, el último año es 2027 y la vendimia actual es 2026.
 const actual=anioBodega(); const fixtures=[{lote:(actual-2000)*1000+1},{lote:(actual-2000)*1000+2},{lote:(actual-1999)*1000+1}];
 sel.montar(fixtures); assert.deepEqual(sel.aniosActivos(),[actual]); assert.match(cont.innerHTML,/2\/3 lotes/);
 const pulsar=attr=>click({target:{closest:()=>({hasAttribute:k=>k===attr})}});
 pulsar('data-anios-todos');assert.deepEqual(sel.aniosActivos(),[actual,actual+1]);assert.match(cont.innerHTML,/3\/3 lotes/);
 pulsar('data-anios-actual');assert.deepEqual(sel.aniosActivos(),[actual]);assert.equal(almac.get('lotes_anios'),'null');
 delete globalThis.document;delete globalThis.localStorage;
});
const ok = () => Response.json({meta:{version:1},lotes:[{lote:26001}],analisis:[]});
const noWait=()=>Promise.resolve();
test('GET de datos reintenta red y 503, no usa cache, devuelve datos completos',async()=>{
 let n=0;const x=await pedirDocumento('/lotes/api/datos',{espera:noWait,fetcher:async(u,opt)=>{assert.equal(opt.cache,'no-store');assert.equal(opt.credentials,'same-origin');if(++n===1)throw Error('red');if(n===2)return new Response(null,{status:503});return ok();}});assert.equal(n,3);assert.equal(x.datos.lotes.length,1);
});
test('401/403 no se reintentan ni se confunden con lista vacía',async()=>{
 for(const status of [401,403]){let n=0;const x=await pedirDocumento('/datos',{espera:noWait,fetcher:async()=>{n++;return new Response(null,{status});}});assert.equal(n,1);assert.equal(x.respuesta.status,status);assert.equal(x.datos,null);}
});
test('JSON incompleto se rechaza: no se convierte a cero ni se usa para guardar',async()=>{
 let n=0;await assert.rejects(pedirDocumento('/datos',{espera:noWait,fetcher:async()=>{n++;return Response.json({error:'respuesta incompleta'});}}),/incompleta/);assert.equal(n,3);
});
test('lista vacía válida se distingue de una respuesta inválida',async()=>{
 const x=await pedirDocumento('/datos',{fetcher:async()=>Response.json({lotes:[],analisis:[]})});assert.deepEqual(x.datos.lotes,[]);
});
