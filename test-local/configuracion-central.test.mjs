import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../public/shared/barra.js';
const {html,menuConfiguracion}=globalThis.CIBarra;
const read=p=>readFileSync(p,'utf8');
const all={nombre:'Admin <x>',es_admin:true,modulo:'lotes',modulos:{prensas:'admin',lotes:'admin',barriles:'admin',vendimia:'admin'}};
test('Un engranaje y una salida en cualquier pantalla, también en el portal',()=>{
 for(const h of [html(all),menuConfiguracion(all,'')]){
  assert.equal((h.match(/<details class="ciw-ajustes">/g)||[]).length,1);
  assert.equal((h.match(/href="\/api\/auth\/logout"/g)||[]).length,1);
  assert.match(h,/href="\/cambiar-clave.html"/);assert.match(h,/Admin &lt;x&gt;/);
 }
 assert.match(read('public/index.html'),/CIBarra.menuConfiguracion\(yo, ''\)/);
});
test('Cada configuración conserva su ruta original, incluido el padrón de Inventario',()=>{
 const h=html(all);
 for(const href of ['/admin.html','/prensas/#config','/lotes/#config','/barriles/#datos','/barriles/#boxes','/barriles/#respaldos','/barriles/#celular','/vendimia/?config=1','/lotes/#inventario-vasijas'])assert.ok(h.includes(`href="${href}"`),href);
 for(const grupo of ['Prensas','Lotes','Barriles','Vendimia','Inventario'])assert.match(h,new RegExp('ciw-ajustes-titulo">'+grupo));
});
test('Admin global no se deduce del rol de módulo; Barriles y Vendimia exigen admin de origen',()=>{
 const h=html({modulo:'lotes',modulos:{lotes:'editor',prensas:'lector',barriles:'editor',vendimia:'lector'},es_admin:false});
 assert.doesNotMatch(h,/href="\/admin.html"|href="\/barriles\/#|href="\/vendimia\/\?config/);
 assert.match(h,/Criterios y alertas · Consulta/);assert.match(h,/href="\/lotes\/#config"/);
 const no=menuConfiguracion({modulos:{}},'');assert.doesNotMatch(no,/href="\/(lotes|prensas|barriles|vendimia)\//);
 const global=menuConfiguracion({modulos:{},es_admin:true},'');assert.match(global,/href="\/admin.html"/);
});
test('Se ocultan accesos anteriores sin retirar las vistas ni los listeners originales',()=>{
 for(const m of ['lotes','prensas'])assert.match(read(`public/${m}/index.html`),/data-v="config" hidden style="display:none!important"/);
 const b=read('public/barriles/index.html');for(const sub of ['datos','boxes','respaldos','celular'])assert.match(b,new RegExp('data-sub="'+sub+'" hidden style="display:none!important"'));
 assert.match(b,/function progIr\(/);assert.match(read('public/prensas/app.js'),/else if\(v==='config'\)renderConfig\(\)/);
 assert.match(read('public/lotes/js/vista-config.js'),/registrarVista\('config'/);
});
test('Vendimia abre los permisos e impresoras por su manejador existente y rechaza acceso directo sin admin',()=>{
 const s=read('public/vendimia/libros-app.js');assert.match(s,/get\('config'\)==='1'&&ciw.rol==='admin'/);
 assert.match(s,/admin-btn'\)\.onclick=\(\)=>\{if\(ciw.rol!=='admin'\)return/);assert.match(s,/await administrar\(\{api,avisar:aviso\}\)/);
});
