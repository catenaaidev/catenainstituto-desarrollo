import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {columnName,parseRange,usedRange} from './model.mjs';
const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const borders=['','thin','hair','dotted','dashed','dashDot','dashDotDot','double','medium','mediumDashed','mediumDashDot','mediumDashDotDot','slantDashDot','thick'];
const fonts=['Times New Roman','Arial','Tahoma','Verdana','Microsoft Yahei','Song','ST Heiti','ST Kaiti','ST FangSong','ST Jiu','Chinese New Wei','Chinese Xingkai','Chinese Lishu'];
export function rgb(v){if(!v)return undefined;const x=String(v).trim();let m=/^#?([0-9a-f]{6})$/i.exec(x);if(m)return {argb:'FF'+m[1].toUpperCase()};m=/^#([0-9a-f]{3})$/i.exec(x);if(m)return {argb:'FF'+[...m[1]].map(c=>c+c).join('').toUpperCase()};m=/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(x);if(m)return {argb:'FF'+m.slice(1,4).map(n=>Math.min(255,Number(n)).toString(16).padStart(2,'0')).join('').toUpperCase()};return undefined;}
function excelValue(v){if(v.f){const formula=String(v.f).replace(/^=/,'');const result=v.v;return {formula,...(result===undefined||result===null?{}:{result})};}if(v.v===undefined||v.v===null)return null;if(typeof v.v==='number'||typeof v.v==='string'||typeof v.v==='boolean')return v.v;return v.m??String(v.v);}
function styleCell(cell,v){
 const font={};if(v.ff!==undefined)font.name=typeof v.ff==='number'?fonts[v.ff]||'Arial':String(v.ff);if(v.fs)font.size=Number(v.fs);if(v.bl)font.bold=true;if(v.it)font.italic=true;if(v.cl)font.strike=true;if(v.un)font.underline=true;const fc=rgb(v.fc);if(fc)font.color=fc;if(Object.keys(font).length)cell.font=font;
 const bg=rgb(v.bg);if(bg)cell.fill={type:'pattern',pattern:'solid',fgColor:bg};
 const alignment={};if(v.ht!==undefined)alignment.horizontal=['center','left','right'][v.ht];if(v.vt!==undefined)alignment.vertical=['middle','top','bottom'][v.vt];if(v.tb===2)alignment.wrapText=true;if(v.tr)alignment.textRotation=[0,45,-45,'vertical',90,-90][v.tr]||0;if(Object.keys(alignment).length)cell.alignment=alignment;
 if(v.ct?.fa)cell.numFmt=v.ct.fa;
 if(v.ps?.value)cell.note=String(v.ps.value);
}
function applyBorders(ws,info){
 const sides={l:'left',r:'right',t:'top',b:'bottom'};
 const apply=(r,c,edges)=>{const cell=ws.getCell(r+1,c+1),b={...cell.border};for(const [k,v] of Object.entries(edges)){if(!sides[k])continue;if(v?.style&&borders[Number(v.style)])b[sides[k]]={style:borders[Number(v.style)],color:rgb(v.color)||{argb:'FF000000'}};else delete b[sides[k]];}cell.border=b;};
 for(const item of info||[]){if(item.rangeType==='cell'){const v=item.value;apply(v.row_index,v.col_index,v);continue;}if(item.rangeType!=='range')continue;const style={style:item.style,color:item.color};for(const r of item.range||[]){const [r0,r1]=r.row,[c0,c1]=r.column;for(let y=r0;y<=r1;y++)for(let x=c0;x<=c1;x++){const type=item.borderType,e={};if(type==='border-none'){apply(y,x,{t:null,b:null,l:null,r:null});continue;}if(type==='border-all')Object.assign(e,{t:style,b:style,l:style,r:style});if(type==='border-top'&&y===r0||type==='border-outside'&&y===r0)e.t=style;if(type==='border-bottom'&&y===r1||type==='border-outside'&&y===r1)e.b=style;if(type==='border-left'&&x===c0||type==='border-outside'&&x===c0)e.l=style;if(type==='border-right'&&x===c1||type==='border-outside'&&x===c1)e.r=style;if((type==='border-inside'||type==='border-horizontal')&&y<r1)e.b=style;if((type==='border-inside'||type==='border-vertical')&&x<c1)e.r=style;apply(y,x,e);}}}
}
export async function generarXlsx(snapshot){
 const w=new ExcelJS.Workbook();w.creator='Catena Institute of Wine';w.calcProperties.fullCalcOnLoad=true;
 for(const s of snapshot.sheets){const meta=snapshot.print[s.id]||{},cfg=s.config||{};const ws=w.addWorksheet(s.name,{properties:{defaultRowHeight:(s.defaultRowHeight||20)*.75,defaultColWidth:Math.max(1,((s.defaultColWidth||73)-5)/7)},views:[{showGridLines:!!s.showGridLines}],pageSetup:{...meta.setup,margins:meta.margins,printArea:(meta.areas||[]).join('&&')||undefined,printTitlesRow:meta.titleRows?.replaceAll('$','')||undefined,printTitlesColumn:meta.titleCols?.replaceAll('$','')||undefined}});if(s.hide)ws.state='hidden';
  for(const [r,h] of Object.entries(cfg.rowlen||{}))ws.getRow(Number(r)+1).height=Number(h)*.75;
  for(const [c,v] of Object.entries(cfg.columnlen||{}))ws.getColumn(Number(c)+1).width=Math.max(0,(Number(v)-5)/7);
  for(const r of Object.keys(cfg.rowhidden||{}))ws.getRow(Number(r)+1).hidden=true;
  for(const c of Object.keys(cfg.colhidden||{}))ws.getColumn(Number(c)+1).hidden=true;
  for(const m of Object.values(cfg.merge||{})){if(m.rs>1||m.cs>1)ws.mergeCellsWithoutStyle(m.r+1,m.c+1,m.r+m.rs,m.c+m.cs);}
  for(const {r,c,v} of s.celldata){const cell=ws.getCell(r+1,c+1);if(!cell.isMerged||cell.master===cell)cell.value=excelValue(v);styleCell(cell,v);}
  applyBorders(ws,cfg.borderInfo);
  // Listas / validaciones creadas en el editor, si usan el formato de FortuneSheet.
  for(const [key,d] of Object.entries(s.dataVerification||{})){const m=/^(\d+)_(\d+)$/.exec(key);if(!m||!d)continue;const cell=ws.getCell(Number(m[1])+1,Number(m[2])+1);if(d.type==='dropdown'||d.type==='list'){const values=String(d.value1??'').replaceAll('"','""');cell.dataValidation={type:'list',allowBlank:true,formulae:[`"${values}"`],showErrorMessage:true};}}
  for(const row of meta.rowBreaks||[])ws.getRow(row).addPageBreak();
 }
 return new Blob([await w.xlsx.writeBuffer()],{type:MIME});
}
// Guardado fiel de celdas cuando no cambió la estructura ni los formatos.
// Se conserva cada parte del paquete OOXML, incluidas imágenes y controles VML.
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xml=(s)=>new DOMParser().parseFromString(s,'application/xml');
const serialize=(d)=>new XMLSerializer().serializeToString(d);
const els=(doc,name)=>[...doc.getElementsByTagNameNS(NS,name)];
const coord=c=>columnName(c.c)+String(c.r+1);
function shape(s){return JSON.stringify({id:s.id,name:s.name,hide:s.hide,order:s.order,row:s.row,column:s.column,config:s.config,defaultRowHeight:s.defaultRowHeight,defaultColWidth:s.defaultColWidth,showGridLines:s.showGridLines,dataVerification:s.dataVerification||{},images:s.images||{},hyperlink:s.hyperlink||{}});}
function style(v){if(!v)return '';const {v:_v,m:_m,f:_f,...st}=v;return JSON.stringify(Object.fromEntries(Object.keys(st).sort().map(k=>[k,st[k]])));}
function value(v){return JSON.stringify({v:v?.f?undefined:v?.v??null,f:v?.f??null});}
function planPatch(snapshot,original){if(!original||snapshot.sheets.length!==original.sheets.length||JSON.stringify(snapshot.print)!==JSON.stringify(original.print))return null;const plans=[];for(let i=0;i<snapshot.sheets.length;i++){const s=snapshot.sheets[i],o=original.sheets[i];if(shape(s)!==shape(o))return null;const a=new Map(o.celldata.map(c=>[coord(c),c.v])),b=new Map(s.celldata.map(c=>[coord(c),c.v])),changes=[];for(const k of new Set([...a.keys(),...b.keys()])){const old=a.get(k),next=b.get(k);if(style(old)!==style(next))return null;if(value(old)!==value(next))changes.push({ref:k,v:next});}plans.push(changes);}return plans;}
function setValue(doc,node,v){for(const c of [...node.children])if(['f','v','is'].includes(c.localName))node.removeChild(c);node.removeAttribute('t');const put=(tag,text,into=node)=>{const e=doc.createElementNS(NS,tag);e.textContent=String(text);into.append(e);return e;};if(!v||(!v.f&&(v.v===undefined||v.v===null||v.v==='')))return;if(v.f){put('f',String(v.f).replace(/^=/,''));if(typeof v.v==='number')put('v',v.v);else if(typeof v.v==='boolean'){node.setAttribute('t','b');put('v',v.v?1:0);}else if(v.v!==null&&v.v!==undefined){node.setAttribute('t','str');put('v',v.v);}return;}if(typeof v.v==='number')put('v',v.v);else if(typeof v.v==='boolean'){node.setAttribute('t','b');put('v',v.v?1:0);}else{node.setAttribute('t','inlineStr');const is=doc.createElementNS(NS,'is');node.append(is);const t=put('t',v.v,is);t.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');}}
async function patchOriginal(raw,snapshot,seed){const changes=planPatch(snapshot,seed);if(!changes)return null;const zip=await JSZip.loadAsync(raw);if(changes.every(x=>!x.length))return new Blob([raw],{type:MIME});const wb=xml(await zip.file('xl/workbook.xml').async('string')),rels=xml(await zip.file('xl/_rels/workbook.xml.rels').async('string'));const targets=new Map([...rels.documentElement.children].map(n=>[n.getAttribute('Id'),n.getAttribute('Target')]));const sh=els(wb,'sheet');for(let i=0;i<changes.length;i++){if(!changes[i].length)continue;let path=targets.get(sh[i].getAttributeNS(REL,'id'));path=path.startsWith('/')?path.slice(1):'xl/'+path;const doc=xml(await zip.file(path).async('string')),nodes=new Map(els(doc,'c').map(c=>[c.getAttribute('r'),c]));for(const ch of changes[i]){const node=nodes.get(ch.ref);if(!node)return null;setValue(doc,node,ch.v);}zip.file(path,serialize(doc));}
 const calc=els(wb,'calcPr')[0];if(calc){calc.setAttribute('fullCalcOnLoad','1');calc.setAttribute('forceFullCalc','1');}zip.file('xl/workbook.xml',serialize(wb));
 if(zip.file('xl/calcChain.xml')){zip.remove('xl/calcChain.xml');for(const node of [...rels.documentElement.children])if(node.getAttribute('Type')?.endsWith('/calcChain'))node.remove();zip.file('xl/_rels/workbook.xml.rels',serialize(rels));const ct=xml(await zip.file('[Content_Types].xml').async('string'));for(const node of [...ct.documentElement.children])if(node.getAttribute('PartName')==='/xl/calcChain.xml')node.remove();zip.file('[Content_Types].xml',serialize(ct));}
 return zip.generateAsync({type:'blob',mimeType:MIME,compression:'DEFLATE'});
}
export async function exportarExcel(snapshot,{original,seed,confirmarReconversion}={}){
 if(original&&seed){try{const fiel=await patchOriginal(original,snapshot,seed);if(fiel)return {blob:fiel,modo:'original'};}catch(e){console.warn('Exportación conservadora no disponible',e);}}
 if(confirmarReconversion&&!(await confirmarReconversion()))return null;
 return {blob:await generarXlsx(snapshot),modo:'reconstruido'};
}
