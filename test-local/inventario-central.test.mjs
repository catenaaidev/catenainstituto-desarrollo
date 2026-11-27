import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inventarios } from '../public/inventario/catalogo.js';
import '../public/shared/barra.js';
const leer = p => readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const html = ctx => globalThis.CIBarra.html(ctx);
test('Inventario: visible al lado de Reporte, y solo con rol de origen',()=>{
 const h=html({modulo:'lotes',modulos:{lotes:'editor'}});
 assert.ok(h.indexOf('>Reporte</a>')<h.indexOf('href="/inventario/"'));
 assert.ok(h.includes('href="/inventario/"'));
 assert.ok(!html({modulo:'prensas',modulos:{prensas:'lector'}}).includes('href="/inventario/"'));
 assert.ok(html({modulo:'inventario',modulos:{lotes:'lector'}}).includes('aria-current="page">Inventario</span>'));
});
test('Catalogo: no inventa permisos, y barriles distingue admin y consulta',()=>{
 assert.deepEqual(inventarios({prensas:'admin'}),[]);
 assert.deepEqual(inventarios({barriles:'lector'}).map(x=>x.href),['/barriles/#consulta']);
 assert.deepEqual(inventarios({barriles:'editor'}).map(x=>x.href),['/barriles/#consulta']);
 assert.deepEqual(inventarios({barriles:'admin'}).map(x=>x.href),['/barriles/#inventario']);
 assert.deepEqual(inventarios({lotes:'admin'}).map(x=>x.id),['tanques','padron']);
 assert.equal(inventarios({lotes:'lector',barriles:'admin'}).length,3);
});
test('Portal: Worker first, autenticacion y autorizacion de modulo',()=>{
 for(const p of ['wrangler.jsonc','wrangler.dev.jsonc']) for(const u of ['/inventario','/inventario/','/inventario/index.html']) assert.ok(leer(p).includes(JSON.stringify(u)));
 const s=leer('src/index.ts');assert.match(s,/if \(esPantallaInventario\(ruta\)\) return servirOrdenes\(req, env, true\)/);
 const fun=s.slice(s.indexOf('async function servirOrdenes'),s.indexOf('export function armarInyeccion'));
 assert.match(fun,/emailDelUsuario\(req, env\)/);assert.match(fun,/inventario \? \(modulos.lotes \|\| modulos.barriles\)/);assert.match(fun,/if \(!rol\) return Response.redirect/);
});
test('Tanques: nueva pantalla, mismo contenedor de impresion, no queda en selector Movimientos',()=>{
 const mov=leer('public/lotes/js/vista-movimientos.js');const selector=mov.slice(mov.indexOf('function _selectorSub'),mov.indexOf('function _cablearSelector'));
 assert.ok(!selector.includes("b('tanques'"));assert.match(selector,/b\('mermas'/);
 assert.match(mov,/registrarVista\('inventario-tanques'/);assert.match(mov,/vistaActiva\(\) === 'inventario-tanques'/);
 assert.match(mov,/renderInventarioTanques\(\$\('movTanques'\)/);assert.match(mov,/id="otMovHoja"/);
 const n=leer('public/lotes/js/nucleo.js');assert.match(n,/nombre === 'inventario-tanques' \? 'movimientos' : nombre/);assert.match(n,/invalidarVista\('movimientos'\); invalidarVista\('inventario-tanques'\)/);
});
test('Padron: un solo contenedor, movido fuera de Configuracion y renderer original',()=>{
 const h=leer('public/lotes/index.html');assert.equal((h.match(/id="cfgVasijas"/g)||[]).length,1);assert.ok(h.indexOf('id="cfgVasijas"')>h.indexOf('id="tab-inventario-vasijas"'));
 assert.match(leer('public/lotes/js/vista-config.js'),/registrarVista\('inventario-vasijas', \(\) => renderVasijas\(\$\('cfgVasijas'\)\)\)/);
});
test('Barriles: accesos centrales, operacion de asociacion y vistas originales conservadas',()=>{
 const h=leer('public/barriles/index.html');assert.ok(!h.includes('class="ini-boton" data-sub="inventario"'));assert.ok(!h.includes('class="ini-boton" data-op="consulta"'));assert.match(h,/data-op="inventario">.*Asociar vasija con lote/);assert.match(h,/id="panel-inventario"/);assert.match(h,/id="panel-consulta"/);assert.match(h,/PROG_GRUPOS\[grupo\]\.filter\(\(\[s\]\) => s !== 'inventario'\)/);
});
