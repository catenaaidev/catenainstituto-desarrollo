import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';
async function pedir(path:string, cookie='', body?:unknown){
 const ctx=createExecutionContext();const res=await worker.fetch(new Request('https://ciw.example'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env,ctx);await waitOnExecutionContext(ctx);return res;
}
describe('Vendimia',()=>{
 it('protege API y conserva recepción, pesaje y traslados',async()=>{
  expect((await pedir('/vendimia/api/lotes')).status).toBe(401);
  const login=await pedir('/api/auth/login','',{usuario:'admin',password:'1234'});
  const cookie=(login.headers.get('Set-Cookie')||'').split(';')[0];
  expect((await pedir('/api/auth/cambiar-clave',cookie,{actual:'1234',nueva:'prueba-vendimia-2026'})).status).toBe(200);
  const created=await pedir('/vendimia/api/lotes',cookie,{codigo:'26001',anio:2026,nombre:'Prueba',variedad:'Malbec'});
  expect(created.status).toBe(201);const {id}=await created.json<{id:string}>();const path='/vendimia/api/lotes/'+id;
  const recepcion=await pedir(path+'/recepciones',cookie,{proveedor:'Prueba'});expect(recepcion.status).toBe(201);const r=await recepcion.json<{id:string}>();
  expect((await pedir(path+'/pesajes',cookie,{recepcion_id:r.id,bruto:100,tara:10})).status).toBe(201);
  const molienda=await pedir(path+'/moliendas',cookie,{ot:'OT1'});expect(molienda.status).toBe(201);const m=await molienda.json<{id:string}>();
  expect((await pedir(path+'/distribuciones',cookie,{molienda_id:m.id,vasija:'A',cantidad:90,unidad:'kg'})).status).toBe(201);
  expect((await pedir(path+'/movimientos',cookie,{origen:'A',destino:'B',cantidad:30,unidad:'kg',tipo:'traslado'})).status).toBe(201);
  const sinSaldo=await pedir(path+'/movimientos',cookie,{origen:'A',destino:'B',cantidad:70,unidad:'kg',tipo:'traslado'});
  expect(sinSaldo.status).toBe(409);
  expect(await sinSaldo.json()).toMatchObject({error:expect.stringContaining('saldo suficiente')});
  expect((await pedir(path+'/mediciones',cookie,{vasija:'B',brix:22,temperatura:25})).status).toBe(201);
  const ficha=await pedir(path,cookie);expect(ficha.status).toBe(200);expect(await ficha.json()).toMatchObject({lote:{codigo:'26001'},existencias:expect.arrayContaining([expect.objectContaining({vasija:'A',cantidad:60}),expect.objectContaining({vasija:'B',cantidad:30})])});
 });
});
