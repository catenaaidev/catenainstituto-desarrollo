import { describe, it, expect } from 'vitest';
import { CRITERIOS_DEFAULT, techoSo2OT, problemaObjetivoSo2, problemaDosisSo2 } from '../public/lotes/js/criterios.js';
import { numerosWeb, siguienteNumero } from '../public/lotes/js/numero-ot.js';
import { numerosWebPrensas } from '../public/prensas/js/hojas-prensas.js';
import { accesosConfirmacionOT } from '../public/lotes/js/ciw-accesos-ot.js';
import { puedeEliminarMovimientoOT } from '../public/lotes/js/ot-movimientos.js';
const cfg = (def={},variedad={},proyecto={}) => ({criterios_fml:{default:def,por_variedad:variedad,por_proyecto:proyecto}});
describe('CIW-03 techo operativo',()=>{
  it('default 40',()=>{expect(CRITERIOS_DEFAULT.so2_libre_techo).toBe(40);expect(techoSo2OT()).toBe(40);});
  it('configuración decimal',()=>expect(techoSo2OT(cfg({so2_libre_techo:'37,5'}))).toBe(37.5));
  it('proyecto tiene precedencia',()=>expect(techoSo2OT(cfg({so2_libre_techo:40},{Malbec:{so2_libre_techo:38}},{Prueba:{so2_libre_techo:35}}),'malbec','PRUEBA')).toBe(35));
  it('ignora datos inválidos y blancos',()=>expect(techoSo2OT(cfg({so2_libre_techo:39},{Malbec:{so2_libre_techo:'invalido'}},{Prueba:{so2_libre_techo:''}}),'Malbec','Prueba')).toBe(39));
  it('fallback seguro ante cero o negativo',()=>{for(const v of [0,-1,false,NaN])expect(techoSo2OT(cfg({so2_libre_techo:v}))).toBe(40);});
  it('bloquea objetivo manual sobre techo',()=>expect(problemaObjetivoSo2(30,45,40)).toContain('40'));
  it('acepta objetivo dentro del techo',()=>expect(problemaObjetivoSo2(30,40,40)).toBe(''));
  it('no calcula agregado negativo',()=>expect(problemaObjetivoSo2(45,40,40)).not.toBe(''));
  it('acepta dosis del límite según fórmula vigente',()=>expect(problemaDosisSo2(30,100,{mbk_g:3,ml_solucion:1500/55},40)).toBe(''));
  it('bloquea dosis excesiva incluso con objetivo válido',()=>expect(problemaDosisSo2(30,100,{mbk_g:4,ml_solucion:40},40)).toContain('40'));
  it('bloquea dosis positiva sin medición',()=>expect(problemaDosisSo2(null,100,{mbk_g:1},40)).not.toBe(''));
  it('bloquea dosis positiva sin volumen',()=>expect(problemaDosisSo2(30,0,{mbk_g:1},40)).not.toBe(''));
  it('permite vasijas sin dosis y no inventa datos',()=>expect(problemaDosisSo2(null,null,{mbk_g:null,ml_solucion:null},40)).toBe(''));
  it('no permite dosis si medición supera techo',()=>expect(problemaDosisSo2(41,100,{mbk_g:0.1},40)).not.toBe(''));
});
describe('CIW-03 número de OT y estados',()=>{
  it('borradores locales no ocupan serie principal',()=>expect(siguienteNumero({web:numerosWeb({ordenes_trabajo:[{ot:'0950',estado:'pendiente'},{ot:'0999',estado:'borrador'}]},'principal')},'principal')).toBe('0951'));
  it('borradores no ocupan B, conserva anuladas',()=>expect(numerosWeb({ordenes_correccion:[{numero:'B240',estado:'anulada'},{numero:'B241',estado:'borrador'}]},'B')).toEqual([240]));
  it('referencias de análisis y movimientos históricos se conservan',()=>{expect(numerosWeb({analisis:[{correccion:{ot_n:'B242'}}]},'B')).toEqual([242]);expect(numerosWeb({movimientos:[{ot:'0950'}]},'principal')).toEqual([950]);});
  it('prensas descarta borradores',()=>expect(numerosWebPrensas({ordenes_hojas:[{tipo:'prensas-muestras',ot:'0950',estado:'pendiente'},{tipo:'prensas-muestras',ot:'0951',estado:'borrador'}]},'principal')).toEqual([950]));
  it('no borra OT ejecutada o sin estado histórico',()=>{expect(puedeEliminarMovimientoOT({ot:'0950',estado:'ejecutado'})).toBe(false);expect(puedeEliminarMovimientoOT({ot:'0950'})).toBe(false);});
  it('bloquea movimiento pendiente de OT ya ejecutada',()=>expect(puedeEliminarMovimientoOT({ot:'0950',estado:'pendiente'},{estado:'ejecutado'})).toBe(false));
  it('permite pendiente sin alterar edición previa',()=>expect(puedeEliminarMovimientoOT({ot:'0950',estado:'pendiente'},{estado:'pendiente'})).toBe(true));
  it('conserva manejo de movimientos sin OT',()=>expect(puedeEliminarMovimientoOT({lote:'26001'})).toBe(true));
});
describe('CIW-03 navegación desde confirmación',()=>{
  it('sin sesión no expone accesos',()=>expect(accesosConfirmacionOT({modulos:{barriles:'admin'}})).toBe(''));
  it('respeta permisos de inventario',()=>{const h=accesosConfirmacionOT({email:'test@example.invalid',modulos:{lotes:'editor'}});expect(h).not.toContain('/barriles/');expect(h).toContain('/lotes/#lotes');});
  it('admin va a inventario y mapa',()=>{const h=accesosConfirmacionOT({email:'test@example.invalid',modulos:{barriles:'admin',lotes:'editor'}});expect(h).toContain('/barriles/#inventario');expect(h).toContain('/barriles/#mapa');expect(h).toContain('/lotes/#inventario-tanques');expect(h).toContain('target="_blank"');});
  it('operario va a consulta y buscar',()=>{const h=accesosConfirmacionOT({email:'test@example.invalid',modulos:{barriles:'lector'}});expect(h).toContain('/barriles/#consulta');expect(h).toContain('/barriles/#buscar');expect(h).not.toContain('/lotes/');});
});
