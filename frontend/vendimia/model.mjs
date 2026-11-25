// Normaliza el libro editable a formato disperso, sin estado de selección/scroll.
// Se exporta por separado para probar la conversión sin abrir un navegador.
export function snapshotDe(sheets,metadata={}){
 if(!Array.isArray(sheets)||!sheets.length)throw Error('El libro debe conservar al menos una hoja.');
 const ordered=sheets.map((s,i)=>({s,i})).sort((a,b)=>(a.s.order??a.i)-(b.s.order??b.i));
 const print={};
 const out=ordered.map(({s},order)=>{
  const id=String(s.id??crypto.randomUUID()), cells=[];
  if(Array.isArray(s.data)&&s.data.length){for(let r=0;r<s.data.length;r++){const row=s.data[r];if(!Array.isArray(row))continue;for(let c=0;c<row.length;c++){const v=row[c];if(v&&typeof v==='object'&&Object.keys(v).length)cells.push({r,c,v});}}}
  else for(const c of s.celldata||[]){if(c.v&&typeof c.v==='object'&&Object.keys(c.v).length)cells.push({r:c.r,c:c.c,v:c.v});}
  cells.sort((a,b)=>a.r-b.r||a.c-b.c);
  const row=Math.max(1,Number(s.row)||0,s.data?.length||0,cells.reduce((n,c)=>Math.max(n,c.r+1),0));
  const column=Math.max(1,Number(s.column)||0,cells.reduce((n,c)=>Math.max(n,c.c+1),0));
  print[id]=metadata[id]||{areas:[],setup:{orientation:'portrait',paperSize:9},margins:{left:.3,right:.3,top:.4,bottom:.4,header:.2,footer:.2},showGridLines:true};
  const result={name:String(s.name),id,order,status:s.status===1?1:0,hide:Number(s.hide||0),row,column,defaultRowHeight:s.defaultRowHeight||20,defaultColWidth:s.defaultColWidth||73,showGridLines:s.showGridLines??1,celldata:cells,config:s.config||{},calcChain:s.calcChain||[]};
  for(const k of ['color','dataVerification','hyperlink','images','luckysheet_conditionformat_save','luckysheet_alternateformat_save','frozen','filter','filter_select'])if(s[k]!==undefined)result[k]=s[k];
  return result;
 });
 return JSON.parse(JSON.stringify({sheets:out,print}));
}
function stable(x){if(Array.isArray(x))return x.map(stable);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])]));return x;}
export function firma(snapshot){return JSON.stringify(stable({print:snapshot.print,sheets:snapshot.sheets.map(s=>{const {status,calcChain,...rest}=s;return {...rest,celldata:s.celldata.map(c=>{const {m,...v}=c.v;if(v.f)delete v.v;return {...c,v};})};})}));}
export function validar(snapshot){
 const names=new Set();let n=0;
 for(const s of snapshot.sheets){if(!s.name.trim()||s.name.length>31||/[\\/?*\[\]:]/.test(s.name)||names.has(s.name.toLowerCase()))throw Error('Cada hoja debe tener un nombre de Excel válido y único (máximo 31 caracteres).');names.add(s.name.toLowerCase());n+=s.celldata.length;if(s.row>20000||s.column>512||n>200000)throw Error('El libro supera los límites de edición: 20.000 filas, 512 columnas o 200.000 celdas con contenido.');}
 if(snapshot.sheets.length>100)throw Error('Máximo 100 hojas por libro.');
 const size=new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;if(size>8*1024*1024-1024)throw Error('El libro supera 8 MiB. Descargá el borrador y dividilo en otra copia.');
 return snapshot;
}
export function columnName(i){let s='';for(i+=1;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;}
export function parseRange(a){const m=/^\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/i.exec(a.trim());if(!m)return null;const c=v=>[...v.toUpperCase()].reduce((n,l)=>n*26+l.charCodeAt(0)-64,0)-1;const r0=Number(m[2])-1,r1=Number(m[4]||m[2])-1,c0=c(m[1]),c1=c(m[3]||m[1]);if(r0<0||r1<r0||c1<c0||r1>=20000||c1>=512)return null;return {r0,r1,c0,c1};}
export function usedRange(s){let r=0,c=0;for(const cell of s.celldata){r=Math.max(r,cell.r);c=Math.max(c,cell.c);}for(const m of Object.values(s.config?.merge||{})){r=Math.max(r,m.r+m.rs-1);c=Math.max(c,m.c+m.cs-1);}return {r0:0,r1:r,c0:0,c1:c};}
export function printRanges(s,meta){return (meta?.areas?.length?meta.areas.map(parseRange).filter(Boolean):[usedRange(s)]);}
