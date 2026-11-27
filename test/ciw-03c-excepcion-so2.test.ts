import { describe, it, expect } from 'vitest';
import { validarTechoSo2, sellosExcepcionesSo2 } from '../src/lotes/motores/techo-so2';
const admin={rol:'admin',email:'enologo@example.invalid',ahora:'2026-11-27T18:00:00Z'};
const editor={...admin,rol:'editor'};
const motivo='Ensayo enológico autorizado';
const lote=()=>({lote:'26007',so2_libre:30,objetivo:41,modo:'generica',vasijas:[{num:'123',litros:100,mbk_g:3.3,ml:1650/55}],excepcion_so2:{objetivo:41,motivo}});
const orden=()=>({id:'oc-1',numero:'B245',estado:'pendiente',lotes:[lote()]});
const doc=(ordenes:any[]=[],analisis:any[]=[])=>({lotes:[{lote:'26007'}],config:{criterios_fml:{default:{so2_libre_techo:40}}},ordenes_correccion:ordenes,analisis});
function aprobado(){const d=doc([orden()]);expect(validarTechoSo2(d,doc(),admin)).toEqual([]);return d;}
function ejecutar(d:ReturnType<typeof doc>){const n=structuredClone(d);n.ordenes_correccion[0].estado='ejecutada'; const e=n.ordenes_correccion[0].lotes[0].excepcion_so2;n.analisis=[{lote:'26007',fecha_analisis:'2026-11-27',correccion:{ot_n:'B245',so2_libre_actual:30,so2_deseado:41,mbk_a_agregar:3.3,ml_exactos:30,litros:100,excepcion_so2:{...e,orden_id:'oc-1',indices:[0]}}}];return n;}
describe('CIW-03c excepción SO₂ por OT',()=>{
  it('admin autoriza 41 con motivo y servidor sella identidad',()=>{const d=aprobado();expect(sellosExcepcionesSo2(d)[0].excepcion).toMatchObject({objetivo:41,motivo,autorizada_por:admin.email,autorizada_en:admin.ahora});});
  it('editor no autoriza aun falsificando metadatos',()=>{const d=doc([orden()]);Object.assign(d.ordenes_correccion[0].lotes[0].excepcion_so2,{autorizada_por:admin.email,autorizada_en:admin.ahora});expect(validarTechoSo2(d,doc(),editor).length).toBeGreaterThan(0);});
  it('sin sesión administrativa no se permite',()=>expect(validarTechoSo2(doc([orden()]),doc()).length).toBeGreaterThan(0));
  it('sin motivo suficiente se rechaza',()=>{const o=orden();o.lotes[0].excepcion_so2.motivo=' ';expect(validarTechoSo2(doc([o]),doc(),admin).length).toBeGreaterThan(0);});
  it('objetivo diferente de excepción se rechaza',()=>{const o=orden();o.lotes[0].objetivo=42;expect(validarTechoSo2(doc([o]),doc(),admin).length).toBeGreaterThan(0);});
  it('dosis superior a lo autorizado se rechaza',()=>{const o=orden();o.lotes[0].vasijas[0].mbk_g=4;expect(validarTechoSo2(doc([o]),doc(),admin).length).toBeGreaterThan(0);});
  it('no permite dosis sin volumen válido',()=>{const o=orden();o.lotes[0].vasijas[0].litros=0;expect(validarTechoSo2(doc([o]),doc(),admin).length).toBeGreaterThan(0);});
  it('no cambia configuración general ni otra OT',()=>{const d=aprobado();const o=orden();o.id='oc-2';o.numero='B246';delete (o.lotes[0] as any).excepcion_so2;expect(validarTechoSo2({...d,ordenes_correccion:[...d.ordenes_correccion,o]},d,admin).length).toBeGreaterThan(0);expect(d.config.criterios_fml.default.so2_libre_techo).toBe(40);});
  it('ejecuta la OT aprobada con dosis exacta',()=>{const d=aprobado();const n=ejecutar(d);expect(validarTechoSo2(n,d,admin)).toEqual([]);expect(n.analisis[0].correccion.excepcion_so2.autorizada_por).toBe(admin.email);});
  it('editor no ejecuta excepción',()=>{const d=aprobado();expect(validarTechoSo2(ejecutar(d),d,editor).length).toBeGreaterThan(0);});
  it('no admite dosis alterada durante ejecución',()=>{const d=aprobado();const n=ejecutar(d);n.analisis[0].correccion.ml_exactos=31;expect(validarTechoSo2(n,d,admin).length).toBeGreaterThan(0);});
  it('no permite reutilizar aprobación en otro lote',()=>{const d=aprobado();const n=ejecutar(d);n.analisis[0].lote='26008';expect(validarTechoSo2(n,d,admin).length).toBeGreaterThan(0);});
  it('no permite usar aprobación sin transición de OT',()=>{const d=aprobado();const n=ejecutar(d);n.ordenes_correccion[0].estado='pendiente';expect(validarTechoSo2(n,d,admin).length).toBeGreaterThan(0);});
  it('no admite dos correcciones de una excepción en un mismo guardado',()=>{const d=aprobado();const n=ejecutar(d);n.analisis.push(structuredClone(n.analisis[0]));expect(validarTechoSo2(n,d,admin).length).toBeGreaterThan(0);});
  it('histórico excepcional no puede reabrirse',()=>{const d=aprobado();const n=ejecutar(d);expect(validarTechoSo2(n,d,admin)).toEqual([]);const x=structuredClone(n);x.ordenes_correccion[0].estado='pendiente';expect(validarTechoSo2(x,n,admin).length).toBeGreaterThan(0);});
  it('corrección histórica permanece intacta en guardado ordinario',()=>{const d=aprobado();const n=ejecutar(d);expect(validarTechoSo2(n,d,admin)).toEqual([]);expect(validarTechoSo2(structuredClone(n),n,editor)).toEqual([]);});
  it('cancelar pendiente conserva autorización histórica',()=>{const d=aprobado();const n=structuredClone(d);n.ordenes_correccion[0].estado='anulada';expect(validarTechoSo2(n,d,admin)).toEqual([]);});
  it('corrección directa sin OT sigue bloqueada',()=>{const d=doc();const n=ejecutar(aprobado());n.ordenes_correccion=[];expect(validarTechoSo2(n,d,admin).length).toBeGreaterThan(0);});
  it('sello falso en orden pendiente se reemplaza por servidor',()=>{const d=aprobado(),n=structuredClone(d);n.ordenes_correccion[0].lotes[0].excepcion_so2.autorizada_por='falso';expect(validarTechoSo2(n,d,editor)).toEqual([]);expect(n.ordenes_correccion[0].lotes[0].excepcion_so2.autorizada_por).toBe(admin.email);});
});

// La forma de los datos coincide con los módulos que realmente usa la interfaz.
import { armarOrdenGuardada, entradasDeEjecucion } from '../public/lotes/js/orden-correccion-guardada.js';
it('conserva objetivo, motivo y detalle por vasija desde armado hasta ejecución',()=>{
  const l={lote:'26007',variedad:'Malbec',so2_libre:30,por_vasija:true};
  const f=[{tipo:'lote',lote:l,objetivo:41,diferencia:11,mbk_total_g:3.3,ml_total:30},
    {tipo:'barrica',lote:l,barrica:{num:'123',litros_usados:100,so2_libre:30,objetivo:41},dosis:{mbk_g:3.3,ml_solucion:30}}];
  const o=armarOrdenGuardada({id:'oc-1',numero:'B245',fecha:'2026-11-27',unidad:'sol',filas:f,modos:new Map(),excepciones:new Map([['26007',{objetivo:41,motivo}]])});
  const d=doc([o]);expect(validarTechoSo2(d,doc(),admin)).toEqual([]);
  const n=structuredClone(d);const guardada=n.ordenes_correccion[0];
  const {entradas}=entradasDeEjecucion(guardada,new Map([['26007',new Set([0])]]),'2026-11-27');
  guardada.estado='ejecutada';n.analisis=entradas.map(e=>({...e,fecha_analisis:'2026-11-27'}));
  expect(validarTechoSo2(n,d,admin)).toEqual([]);
  expect(n.analisis[0].correccion.excepcion_so2.autorizada_por).toBe(admin.email);
});
