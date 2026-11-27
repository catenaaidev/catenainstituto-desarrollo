import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accesosOperativos } from '../public/ordenes/js/operaciones.js';
import { inventarios } from '../public/inventario/catalogo.js';
import { reglasDePapel } from '../scripts/css-reglas.mjs';
import { PAPEL_BARRILES, sinCelular } from '../scripts/selectores-barriles.mjs';
import '../public/shared/barra.js';
const leer = f => readFileSync(f,'utf8').replace(/\r\n/g,'\n');
const {html,centroDeVista}=globalThis.CIBarra;
test('Inicio sin accesos rápidos, con Inventario según roles originales',()=>{
 const s=leer('public/index.html');assert.doesNotMatch(s,/id="rapidas"|const rapidas =/);assert.match(s,/id: 'inventario', nombre: 'Inventario'/);assert.match(s,/m.id === 'inventario' \? \['barriles', 'lotes'\]/);
});
test('La barra identifica Órdenes de trabajo e Inventario, no concede permisos',()=>{
 const modulos={lotes:'editor',barriles:'admin',prensas:'lector'};
 const h=html({modulo:'lotes',modulos});assert.ok(h.indexOf('>Reporte</a>')<h.indexOf('>Inventario</a>'));assert.match(h,/>Órdenes de trabajo<\/a>/);
 assert.match(html({modulo:'lotes',modulos,centro:'ordenes'}),/aria-current="page">Órdenes de trabajo<\/span>/);
 assert.match(html({modulo:'lotes',modulos,centro:'inventario'}),/aria-current="page">Inventario<\/span>/);
 assert.doesNotMatch(html({modulo:'prensas',modulos:{prensas:'lector'}}),/href="\/inventario\/"/);
});
test('Órdenes: las dos pantallas conservan rutas nativas y permisos de Lotes',()=>{
 assert.deepEqual(accesosOperativos({prensas:'admin'}),[]);
 for(const rol of ['admin','editor','lector'])assert.deepEqual(accesosOperativos({lotes:rol}).map(x=>x[0]),['/lotes/#movimientos','/lotes/#so2']);
 const a=leer('public/ordenes/js/app.js');assert.match(a,/operaciones\(\)\.map/);assert.match(a,/pintarPortada/);assert.match(a,/pintarNav/);
});
test('Lotes: las vistas retiradas del menú se abren en el centro correcto por rutas viejas',()=>{
 const s=leer('public/lotes/index.html'); const nav=s.match(/<nav class="tabs" id="tabs"[\s\S]*?<\/nav>/)[0];assert.doesNotMatch(nav,/data-v="(?:movimientos|so2)"/);
 for(const v of ['movimientos','correcciones','ordencorr','so2','agregados'])assert.equal(centroDeVista('lotes',v),'ordenes');
 for(const v of ['inventario-tanques','inventario-vasijas'])assert.equal(centroDeVista('lotes',v),'inventario');
 assert.equal(centroDeVista('lotes','ficha'),'');assert.equal(centroDeVista('barriles','consulta'),'inventario');
 assert.match(s,/id="tab-movimientos"/);assert.match(s,/id="tab-so2"/);assert.match(s,/id="ciwCentroNav"/);assert.match(s,/href="\/ordenes\/\?v=historial"/);
 const n=leer('public/lotes/js/nucleo.js');assert.match(n,/actualizarCentro\(nombre\)/);assert.match(n,/location.hash === '#correcciones'/);assert.match(n,/enModoOrdenes\(\) \? ''/);
});
test('Barriles: cinco botones, inventario centralizado y las dos vistas originales permanecen',()=>{
 const s=leer('public/barriles/index.html'); const portada=s.match(/<div class="ini-grandes">[\s\S]*?<\/div>\s*<div class="ini-chicos">/)[0];
 assert.equal((portada.match(/class="ini-boton/g)||[]).length,5); assert.doesNotMatch(portada,/data-op="consulta"/);assert.match(s,/id="panel-consulta"/);assert.match(s,/id="panel-inventario"/);assert.equal(inventarios({barriles:'admin'})[0].href,'/barriles/#inventario');assert.equal(inventarios({barriles:'lector'})[0].href,'/barriles/#consulta');
});
test('Hojas de impresión de Lotes y Barriles idénticas a fixtures originales',()=>{
 assert.deepEqual(reglasDePapel(leer('public/lotes/index.html')),JSON.parse(leer('test/fixtures/lotes-papel.json')));
 assert.deepEqual(sinCelular(reglasDePapel(leer('public/barriles/index.html'),PAPEL_BARRILES)),JSON.parse(leer('test/fixtures/barriles-papel.json')));
});
test('Vendimia: saldo se comprueba antes de insertar, trigger permanece y rechazo esperado no imprime error crudo',()=>{
 const s=leer('src/vendimia/rutas.ts');assert.ok(s.indexOf('SELECT cantidad FROM vend_existencias')<s.indexOf('const stmt=env.DB.prepare'));assert.match(s,/no tiene saldo suficiente/);assert.ok(s.indexOf("detalle.includes('movimiento sin saldo suficiente')")<s.indexOf("console.error('vendimia',e)"));assert.match(leer('migrations/0005_vendimia.sql'),/CREATE TRIGGER vend_movimiento_validar BEFORE INSERT/);
});
