import test from 'node:test';
import assert from 'node:assert/strict';
import {crearPanel} from '../public/vendimia/lote.js';
// DOM mínimo para verificar la navegación y el contenido generado sin abrir navegador.
class Nodo {
  constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.listeners={};this.hidden=false;this.disabled=false;}
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='hidden')this.hidden=true;if(k==='disabled')this.disabled=true;}
  addEventListener(k,fn){this.listeners[k]=fn;}
  append(...xs){for(const x of xs){this.children.push(x);if(x instanceof Nodo)x.parent=this;}}
  replaceChildren(...xs){this.children=[];this.append(...xs);}
  get nextSibling(){return this.parent.children[this.parent.children.indexOf(this)+1];}
  get previousSibling(){return this.parent.children[this.parent.children.indexOf(this)-1];}
  get text(){return this.children.map(x=>x instanceof Nodo?x.text:String(x)).join(' ');}
  click(){this.listeners.click?.({target:this});}
  find(fn){if(fn(this))return this;for(const x of this.children)if(x instanceof Nodo){const v=x.find(fn);if(v)return v;}return null;}
  querySelector(q){return this.find(n=>n.className?.split(' ').includes(q.slice(1)));}
}
const raiz=new Nodo('div');globalThis.Node=Nodo;globalThis.document={getElementById:()=>raiz,createElement:t=>new Nodo(t)};globalThis.addEventListener=()=>{};
const base=()=>({ing:{periodo_id:'p1',lote:'27001',variedad:'Chenin',estado:'en_proceso'},info:{variedad:'Chenin'},faltan:[],vasijas:[{vasija:'177',proxima:{clave:'revision_tecnica',texto:'Revisión',quien:'técnico'},ph:{estado:'gris',texto:'Sin criterio aprobado',criterio_version:'ph-rev01-2021'},ph_registro:'r1',fin_fa:{estado:'gris',texto:'Pendiente'}}],registros:[{id:'r1',vasija:'177',tipo:'analisis_inicial',datos:{kg_recibidos:900,ph:3.45,nfa:250},fecha_muestra:'2026-11-26T12:00:00Z',version:1,autor:'marcelo'}],ots:[],decisiones:[],movs:[],trabajos:[],permisos:{escribir:true,operario:true,tecnico:true,admin:true}});
const byButton=t=>raiz.find(n=>n.tag==='button'&&n.text===t);
const byName=t=>raiz.find(n=>n.attrs.name===t);
async function panel(d){const p=crearPanel({api:async()=>d,ciw:{},avisar:()=>{},abrirDocumentos:()=>{},ocultarDocumentos:()=>{}});await p.abrir('p1');return p;}
test('pasos 2–7 independientes, valores históricos y faltantes visibles',async()=>{let p=await panel(base());assert.ok(byButton('3 · Aprobación técnica'));p.irA('analisis');assert.match(raiz.text,/Número de pesada/);assert.match(raiz.text,/NPA/);assert.match(raiz.text,/Litros estimados/);assert.match(raiz.text,/900/);assert.match(raiz.text,/Pendiente de carga/);assert.match(raiz.text,/Sin criterio aprobado/);assert.equal(byName('dosis'),null);byButton('Editar análisis').click();assert.ok(byName('numero_pesada'));assert.ok(byName('npa'));assert.ok(byName('litros_estimados'));});
test('aprobación requiere elegir; TH2 se oculta al decidir que no corresponde',async()=>{const p=await panel(base());p.irA('aprobacion');const th2=raiz.find(n=>n.className?.includes('v9-decision-campos'));assert.equal(th2.hidden,true);assert.equal(byButton('Registrar decisión').disabled,true);byButton('Aprobar OT de TH2').click();assert.equal(th2.hidden,false);assert.equal(byButton('Registrar decisión').disabled,false);byButton('No requiere corrección').click();assert.equal(th2.hidden,true);assert.equal(byName('motivo').parent.parent.hidden,false);});
test('paso 4 espera ejecución y paso 5 no libera antes de tiempo',async()=>{const d=base();d.vasijas[0].proxima.clave='ejecutar_th2';d.ots=[{id:'o1',tipo:'th2',estado:'emitida',vasija:'177',numero:'01'}];const p=await panel(d);p.irA('correccion');assert.match(raiz.text,/debe estar ejecutada/);assert.equal(byName('ph'),null);p.irA('confirmacion');assert.equal(byButton('Confirmar pH y emitir OT de siembra'),null);});
test('OT de siembra y nutrientes separadas por tipo y vasija',async()=>{const d=base();d.ots=[{id:'o1',tipo:'siembra',estado:'emitida',vasija:'177',numero:'S1'},{id:'o2',tipo:'nutrientes',estado:'programada',vasija:'177',numero:'N1'},{id:'o3',tipo:'siembra',estado:'emitida',vasija:'178',numero:'S2'}];const p=await panel(d);p.irA('siembra');assert.match(raiz.text,/S1/);assert.doesNotMatch(raiz.text,/N1|S2/);p.irA('nutrientes');assert.match(raiz.text,/N1/);assert.doesNotMatch(raiz.text,/S1|S2/);});
test('no se ofrece aprobación a usuario sin permiso técnico',async()=>{const d=base();d.permisos.tecnico=false;const p=await panel(d);p.irA('aprobacion');assert.equal(byButton('Aprobar OT de TH2'),null);assert.match(raiz.text,/Esperando revisión/);});
