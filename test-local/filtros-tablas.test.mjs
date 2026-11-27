import test from 'node:test';import assert from 'node:assert/strict';
import {coincideFiltros,opcionesColumna} from '../public/shared/filtros-tablas.js';
const datos=[['Malbec','177','Pendiente'],['Chenin','178','Ejecutada'],['Malbec','179','Ejecutada'],['Cabernet','177','Ejecutada'],['','180','Pendiente']];
test('OR dentro de una columna y AND entre columnas',()=>{const filtros=new Map([[0,new Set(['Malbec','Chenin'])],[2,new Set(['Ejecutada'])]]);assert.deepEqual(datos.filter(r=>coincideFiltros(r,filtros)),[datos[1],datos[2]]);});
test('opciones unicas, vacios seleccionables y quitar filtro',()=>{assert.deepEqual(opcionesColumna(datos,0),['','Cabernet','Chenin','Malbec']);assert.equal(datos.filter(r=>coincideFiltros(r,new Map([[0,new Set([''])]]))).length,1);assert.equal(datos.filter(r=>coincideFiltros(r,new Map([[0,new Set()]]))).length,0);assert.equal(datos.filter(r=>coincideFiltros(r,new Map())).length,5);});

import {readFileSync} from 'node:fs';
test('filtros de consulta anclados a los encabezados, sin barra externa en reposo',()=>{const js=readFileSync(new URL('../public/shared/filtros-tablas.js',import.meta.url),'utf8'),css=readFileSync(new URL('../public/shared/filtros-tablas.css',import.meta.url),'utf8');assert.match(js,/th\.append\(b\)/);assert.match(js,/s\.barra\.hidden=!s\.filtros\.size/);assert.match(js,/todos\.indeterminate/);assert.match(css,/\.ciw-filtro-barra\[hidden\]/);});
