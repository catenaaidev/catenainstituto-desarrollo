// Explicitly apply shared fields, preserving all other original cells and styles.
export function aplicarCompartidos(snapshot,plantilla,datos,fila){
 const next=structuredClone(snapshot),s=next.sheets[0];
 function put(r,c,value){if(r>=s.row||c>=s.column)throw Error('La fila no existe en la hoja. Agregala primero.');let x=s.celldata.find(x=>x.r===r&&x.c===c);if(x?.v?.f)throw Error('La celda contiene una fórmula; no se reemplazó.');if(!x){x={r,c,v:{}};s.celldata.push(x);}x.v={...x.v,v:value,m:String(value)};}
 const serial=Math.round((Date.parse(datos.recepcion+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000);
 if(plantilla==='tintos-v1'){const label=(r,c)=>s.celldata.find(x=>x.r===r&&x.c===c)?.v?.v;if(label(5,0)!=='Fecha recepción:'||label(5,4)!=='N° Vasija'||label(7,0)!=='Nombre del Lote')throw Error('La estructura original cambió; completá estos campos manualmente.');put(5,1,serial);const dateCell=s.celldata.find(x=>x.r===5&&x.c===1);dateCell.v.m=datos.recepcion.split('-').reverse().join('/');put(5,5,datos.vasija);put(5,9,datos.lote);put(7,1,datos.nombre_lote);}
 else if(plantilla==='blancos-v1'){throw Error('Usá los datos de la ficha como referencia; la plantilla de blancos requiere otra homologación.');}
 else if(plantilla==='brix-v1'){if(s.celldata.find(x=>x.r===6&&x.c===5)?.v?.v!=='CIW Lote')throw Error('La estructura original cambió; completá estos campos manualmente.');if(!Number.isInteger(fila)||fila<8)throw Error('Elegí una fila de datos desde la 8.');put(fila-1,5,datos.lote);put(fila-1,6,datos.vasija);}
 else if(plantilla==='agregados-v1'){if(s.celldata.find(x=>x.r===7&&x.c===1)?.v?.v!=='CIW lote')throw Error('La estructura original cambió; completá estos campos manualmente.');if(!Number.isInteger(fila)||fila<9)throw Error('Elegí una fila de datos desde la 9.');const r=fila-1;if(Object.values(s.config?.merge||{}).some(m=>m.r===r&&m.c===0&&m.cs>2))throw Error('Elegí una fila de datos, no una fila separadora combinada.');put(r,1,datos.lote);put(r,2,datos.vasija);}
 else throw Error('No hay una equivalencia de celdas verificada para este libro.');
 return next;
}
