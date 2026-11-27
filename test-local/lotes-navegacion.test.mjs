import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const leer = f => readFileSync(f,'utf8').replace(/\r\n/g,'\n');
const html = leer('public/lotes/index.html');
const n = leer('public/lotes/js/nucleo.js');
const app = leer('public/lotes/app.js');
const nav=html.match(/<nav class="tabs" id="tabs"[\s\S]*?<\/nav>/)[0];
test('Lotes primero, análisis segundo, demás herramientas intactas',()=>{
 assert.match(nav, /data-v="lotes" class="active">Lotes<\/button>\s*<button[^>]+data-v="analisis"/);
 assert.doesNotMatch(nav,/data-v="(?:dashboard|cargar)"/);
 assert.match(nav,/data-v="tablero">Tablero<\/button>/);
 for(const v of ['agenda','cruce','config'])assert.match(nav,new RegExp('data-v="'+v+'"'));
 for(const v of ['btnExportarCompleto','btnHistorial','btnCuadricula'])assert.ok(nav.includes(v));
 assert.match(html,/class="view active" id="tab-lotes"/);
 assert.equal((html.match(/class="view active"/g)||[]).length,1);
 assert.match(n,/let _vistaMostrada = 'lotes'/);assert.match(n,/let _antesDeFicha = 'lotes'/);
 assert.match(app,/pantallaDeUrl\(\) \|\| 'lotes'/);
});
test('Subvista de carga usa la misma sección y manejadores originales',()=>{
 assert.match(html,/id="analisisSub"[^>]*hidden/);
 assert.match(html,/data-analisis-v="analisis"/);assert.match(html,/data-analisis-v="cargar"/);
 for(const id of ['tab-analisis','tab-cargar','cargarTexto','cargarPreview','btnAgregarAnalisis'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert.match(app,/mostrarTab\(b.dataset.analisisV\)/);
 assert.match(app,/window.cargarConfirmar\s*= cargarConfirmar/);
});
test('Navegación ejecutada: carga mantiene Análisis activo, Panel antiguo abre Tablero y otras vistas no muestran submenú',()=>{
 const body=n.slice(n.indexOf('export function mostrarTab('),n.indexOf('export function renderActivo(')).replace('export function','function');
 const make=(v)=>({dataset:{analisisV:v},attrs:{},classList:{toggle(k,b){this[k]=b}},setAttribute(k,v){this.attrs[k]=v}});
 const buttons=[make('analisis'),make('cargar')];const sub={hidden:true,querySelectorAll:()=>buttons};
 const active={};const c={GRUPO_CORRECCIONES:['ordencorr','so2','agregados'],_ultimaCorreccion:'so2',_vistaMostrada:'lotes',_PU:()=>null,invalidarVista(){},actualizarCentro(){},marcarPestana(v){active.menu=v},$:id=>id==='analisisSub'?sub:id==='corrSub'?null:{classList:{add(){active.section=id}}},document:{querySelectorAll:()=>[]},_dibujar(v){active.render=v}};
 runInNewContext(body+'\nthis.go=mostrarTab;',c);
 c.go('cargar');assert.equal(active.menu,'analisis');assert.equal(active.section,'tab-cargar');assert.equal(active.render,'cargar');assert.equal(sub.hidden,false);assert.equal(buttons[1].attrs['aria-pressed'],'true');
 c.go('analisis');assert.equal(active.section,'tab-analisis');assert.equal(buttons[0].attrs['aria-pressed'],'true');
 c.go('dashboard');assert.equal(active.menu,'tablero');assert.equal(active.section,'tab-tablero');assert.equal(sub.hidden,true);
 c.go('movimientos');assert.equal(active.section,'tab-movimientos');assert.equal(sub.hidden,true);
});
