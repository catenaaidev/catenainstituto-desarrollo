import { identidad, puedeLeer, puedeEscribir } from '../auth';
import { json } from '../respuestas';
import { PLANTILLAS } from './plantillas-data';

const MAX_BYTES=8*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const catalogo=PLANTILLAS.map(({originalBase64:_b,snapshot:_s,...p})=>p);
const plantilla=(id:string)=>PLANTILLAS.find(p=>p.id===id);
const tipoXlsx='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
interface Libro {id:string;periodo_id:string;plantilla_id:string;nombre:string;version:number;objeto:string|null;autor:string;creado:string;actualizado:string;}
interface Revision {libro_id:string;version:number;objeto:string|null;autor:string;fecha:string;operacion:string;}
function response(status:number,data:unknown) {const r=json(status,data);r.headers.set('Cache-Control','private, no-store');return r;}
function validoTexto(v:unknown,max:number):v is string{return typeof v==='string'&&v.trim().length>0&&v.trim().length<=max;}
function fechaISO(v:unknown):v is string {if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
function esObj(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
export function snapshotValido(v:unknown):boolean {
 if(!esObj(v)||!Array.isArray(v.sheets)||v.sheets.length===0||v.sheets.length>100||!esObj(v.print))return false;
 const ids=new Set<string>(),names=new Set<string>();let n=0;
 for(const s of v.sheets){
  if(!esObj(s)||!validoTexto(s.id,160)||!validoTexto(s.name,31)||/[\\/?*\[\]:]/.test(s.name)||ids.has(s.id)||names.has(s.name.toLocaleLowerCase())||!Number.isInteger(s.row)||!Number.isInteger(s.column)||Number(s.row)<1||Number(s.row)>20000||Number(s.column)<1||Number(s.column)>512||!Array.isArray(s.celldata)||!esObj(s.config))return false;
  ids.add(s.id);names.add(s.name.toLocaleLowerCase());n+=s.celldata.length;if(n>200000)return false;
  const coords=new Set<string>();
  for(const c of s.celldata){if(!esObj(c)||!Number.isInteger(c.r)||!Number.isInteger(c.c)||Number(c.r)<0||Number(c.r)>=Number(s.row)||Number(c.c)<0||Number(c.c)>=Number(s.column)||!esObj(c.v))return false;const k=`${c.r},${c.c}`;if(coords.has(k))return false;coords.add(k);}
 }
 return true;
}
async function leerJSON(req:Request,limite:number):Promise<Record<string,unknown>>{
 if(Number(req.headers.get('Content-Length')||0)>limite)throw new RangeError('Solicitud demasiado grande');
 if(!req.body)throw new SyntaxError('Sin datos');
 const reader=req.body.getReader();let total=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limite){await reader.cancel();throw new RangeError('Solicitud demasiado grande');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
 const b:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!esObj(b))throw new SyntaxError('Datos inválidos');return b;
}
function libroPublico(l:Libro){const {objeto:_o,...rest}=l;return rest;}
function nuevaCopia(env:Env,periodo:string,plantillaId:string,nombre:string,autor:string,id=crypto.randomUUID()){
 return {id,stmts:[env.DB.prepare('INSERT INTO vend_libros(id,periodo_id,plantilla_id,nombre,autor) VALUES(?,?,?,?,?)').bind(id,periodo,plantillaId,nombre,autor),env.DB.prepare("INSERT INTO vend_libro_versiones(libro_id,version,objeto,autor,operacion) VALUES(?,0,NULL,?,'plantilla')").bind(id,autor)]};
}
async function leerVersion(env:Env,libro:Libro,rev?:Revision){
 const version=rev?.version??libro.version; const objeto=rev?rev.objeto:libro.objeto;
 const p=plantilla(libro.plantilla_id);if(!p)return response(500,{error:'plantilla_no_disponible'});
 let snapshot:unknown;
 if(version===0)snapshot=p.snapshot;
 else{const o=objeto?await env.RESPALDOS.get(objeto):null;if(!o)return response(503,{error:'version_no_disponible',detalles:['No se puede leer la versión guardada. No se reemplazó por la plantilla.']});snapshot=await o.json();}
 return response(200,{libro:libroPublico(libro),version,snapshot,plantilla:catalogo.find(x=>x.id===libro.plantilla_id),lecturaHistorica:rev!==undefined});
}

// Estas rutas comparten el login y perfiles de Vendimia. Nunca aceptan un autor
// del cliente. Los bytes de cada revisión son inmutables; D1 publica el puntero
// con compare-and-swap en una sola transacción. R2 no es la fuente del contador.
export async function rutasLibros(req:Request,env:Env,ctx:ExecutionContext,sub:string):Promise<Response>{
 const id=await identidad(req,env,ctx,'vendimia');if(!puedeLeer(id))return response(403,{error:'sin_permiso'});
 const url=new URL(req.url),autor=id!.email;
 try{
  if(req.method==='GET'&&sub==='/ingresos'){
   const {results}=await env.DB.prepare('SELECT * FROM vend_ingresos ORDER BY actualizado DESC').all();return response(200,{ingresos:results});
  }
  if(req.method==='GET'&&sub==='/plantillas')return response(200,{plantillas:catalogo});
  if(req.method==='GET'&&sub==='/periodos'){
   const {results}=await env.DB.prepare('SELECT p.*, (SELECT count(*) FROM vend_libros l WHERE l.periodo_id=p.id) AS libros FROM vend_periodos p ORDER BY anio DESC,desde DESC,creado DESC').all();
   return response(200,{periodos:results});
  }
  const pth=/^\/periodos\/([0-9a-f-]{36})(?:\/(libros))?$/i.exec(sub);
  if(pth&&req.method==='GET'&&!pth[2]){
   const p=await env.DB.prepare('SELECT * FROM vend_periodos WHERE id=?').bind(pth[1]).first();if(!p)return response(404,{error:'periodo_no_encontrado'});
   const {results}=await env.DB.prepare('SELECT id,periodo_id,plantilla_id,nombre,version,autor,creado,actualizado FROM vend_libros WHERE periodo_id=? ORDER BY creado,nombre').bind(pth[1]).all();
   return response(200,{periodo:p,libros:results});
  }
  const m=/^\/libros\/([0-9a-f-]{36})(?:\/(original|versiones|guardar)(?:\/(\d+))?)?$/i.exec(sub);
  const libro=m?await env.DB.prepare('SELECT * FROM vend_libros WHERE id=?').bind(m[1]).first<Libro>():null;
  if(m&&!libro)return response(404,{error:'libro_no_encontrado'});
  if(m&&libro&&req.method==='GET'){
   if(!m[2])return leerVersion(env,libro);
   if(m[2]==='original'&&!m[3]){const p=plantilla(libro.plantilla_id);if(!p)return response(404,{error:'plantilla_no_encontrada'});const bytes=Uint8Array.from(atob(p.originalBase64),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'Content-Type':tipoXlsx,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(p.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
   if(m[2]==='versiones'){
    if(m[3]!==undefined){const rev=await env.DB.prepare('SELECT * FROM vend_libro_versiones WHERE libro_id=? AND version=?').bind(libro.id,Number(m[3])).first<Revision>();if(!rev)return response(404,{error:'version_no_encontrada'});return leerVersion(env,libro,rev);}
    const {results}=await env.DB.prepare('SELECT version,autor,fecha FROM vend_libro_versiones WHERE libro_id=? ORDER BY version DESC').bind(libro.id).all();return response(200,{versiones:results});
   }
   return response(404,{error:'ruta_no_encontrada'});
  }
  if(req.method!=='POST')return response(404,{error:'ruta_no_encontrada'});
  if(!puedeEscribir(id))return response(403,{error:'solo_lectura'});
  // Las operaciones de escritura del navegador siempre son same-origin.
  if(req.headers.get('Origin')!==url.origin)return response(403,{error:'origen_invalido'});
  if(!req.headers.get('Content-Type')?.startsWith('application/json'))return response(415,{error:'formato_invalido'});
  const b=await leerJSON(req,m?.[2]==='guardar'?MAX_BYTES:16384);
  if(sub==='/ingresos'||sub.startsWith('/ingresos/')){
   if(!validoTexto(b.lote,80)||!validoTexto(b.nombre_lote,120)||(typeof b.vasija!=='string'||b.vasija.length>80)||typeof b.variedad!=='string'||b.variedad.length>100||!fechaISO(b.recepcion)||!['borrador','en_proceso','finalizado'].includes(String(b.estado)))return response(400,{error:'Completá lote, nombre, vasija y fecha de recepción.'});
   const info=esObj(b.informacion_id)?JSON.stringify(b.informacion_id):'{}';
   const datos=[b.lote.trim(),b.nombre_lote.trim(),b.variedad.trim(),b.vasija.trim(),b.recepcion,String(b.estado),autor];
   if(sub==='/ingresos'){
    const pid=crypto.randomUUID();const nombre=`${b.lote} · ${b.vasija} · ${pid.slice(0,8)}`;
    const stmts=[env.DB.prepare('INSERT INTO vend_periodos(id,nombre,anio,desde,autor) VALUES(?,?,?,?,?)').bind(pid,nombre,Number(b.recepcion.slice(0,4)),b.recepcion,autor),env.DB.prepare('INSERT INTO vend_ingresos(periodo_id,lote,nombre_lote,variedad,vasija,recepcion,estado,autor,informacion_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(pid,...datos,info)];
    for(const p of PLANTILLAS)stmts.push(...nuevaCopia(env,pid,p.id,p.name,autor).stmts);
    stmts.push(...nuevaCopia(env,pid,'agregados-v1','Agregado de nutrientes',autor).stmts,...nuevaCopia(env,pid,'agregados-v1','Anhídrido sulfuroso (SO₂)',autor).stmts);
    await env.DB.batch(stmts);return response(201,{id:pid});
   }
   const pid=sub.slice('/ingresos/'.length);if(!uuid.test(pid)||!Number.isInteger(b.version))return response(400,{error:'Versión inválida'});
   const r=await env.DB.batch([env.DB.prepare("UPDATE vend_ingresos SET lote=?,nombre_lote=?,variedad=?,vasija=?,recepcion=?,estado=?,autor=?,informacion_id=?,version=version+1,actualizado=datetime('now') WHERE periodo_id=? AND version=?").bind(...datos,info,pid,b.version)]);
   if(r[0].meta.changes!==1)return response(409,{error:'Otro usuario cambió la ficha. Volvé a abrirla antes de guardar.'});return response(200,{version:Number(b.version)+1});
  }
  if(sub==='/periodos'){
   if(!validoTexto(b.nombre,120)||!Number.isInteger(b.anio)||Number(b.anio)<1900||Number(b.anio)>2200||!fechaISO(b.desde)||((b.hasta!==null&&b.hasta!==undefined&&b.hasta!=='')&&(!fechaISO(b.hasta)||String(b.hasta)<b.desde)))return response(400,{error:'Completar nombre, año y fechas válidas.'});
   const pid=crypto.randomUUID();const stmts=[env.DB.prepare('INSERT INTO vend_periodos(id,nombre,anio,desde,hasta,autor) VALUES(?,?,?,?,?,?)').bind(pid,b.nombre.trim(),b.anio,b.desde,b.hasta||null,autor)];
   for(const p of PLANTILLAS)stmts.push(...nuevaCopia(env,pid,p.id,p.name,autor).stmts);
   await env.DB.batch(stmts);return response(201,{id:pid});
  }
  if(pth&&pth[2]==='libros'){
   if(!validoTexto(b.plantilla_id,160)||!plantilla(b.plantilla_id)||!validoTexto(b.nombre,240))return response(400,{error:'Seleccionar plantilla y nombre de la copia.'});
   if(!await env.DB.prepare('SELECT id FROM vend_periodos WHERE id=?').bind(pth[1]).first())return response(404,{error:'periodo_no_encontrado'});
   const copia=nuevaCopia(env,pth[1],b.plantilla_id,b.nombre.trim(),autor);await env.DB.batch(copia.stmts);return response(201,{id:copia.id});
  }
  if(m&&libro&&m[2]==='guardar'&&!m[3]){
   if(!Number.isInteger(b.version)||Number(b.version)<0||typeof b.operacion!=='string'||!uuid.test(b.operacion)||!snapshotValido(b.snapshot))return response(400,{error:'Estructura del libro inválida o fuera de límites. Conservá el borrador local.'});
   const previa=await env.DB.prepare('SELECT version,autor,fecha FROM vend_libro_versiones WHERE libro_id=? AND operacion=?').bind(libro.id,b.operacion).first<{version:number;autor:string;fecha:string}>();
   if(previa&&previa.version===libro.version)return response(200,{version:previa.version,autor:previa.autor,actualizado:previa.fecha,repetida:true});
   const conflicto=()=>response(409,{error:'conflicto_version',version:libro.version,autor:libro.autor,actualizado:libro.actualizado});
   if(previa||b.version!==libro.version)return conflicto();
   const version=libro.version+1,clave=`vendimia-libros/${libro.periodo_id}/${libro.id}/${version}-${crypto.randomUUID()}.json`;
   // El nombre de objeto es único aun si dos usuarios guardan la misma versión.
   await env.RESPALDOS.put(clave,JSON.stringify(b.snapshot),{httpMetadata:{contentType:'application/json'}});
   let r:D1Result[];
   try{
    r=await env.DB.batch([
     env.DB.prepare("UPDATE vend_libros SET version=?,objeto=?,autor=?,actualizado=datetime('now') WHERE id=? AND version=?").bind(version,clave,autor,libro.id,b.version),
     env.DB.prepare('INSERT INTO vend_libro_versiones(libro_id,version,objeto,autor,fecha,operacion) SELECT id,version,objeto,autor,actualizado,? FROM vend_libros WHERE id=? AND version=? AND objeto=?').bind(b.operacion,libro.id,version,clave),
    ]);
   }catch(e){
    // Si se perdió la respuesta de la transacción, no borrar un objeto que
    // podría haberse publicado. El reintento con el mismo id es idempotente.
    console.error('vendimia guardar',e);return response(503,{error:'guardado_no_confirmado',detalles:['El borrador queda en el navegador. Reintentá.']});
   }
   if(r[0].meta.changes!==1){await env.RESPALDOS.delete(clave).catch(()=>{});const actual=await env.DB.prepare('SELECT version,autor,actualizado FROM vend_libros WHERE id=?').bind(libro.id).first<{version:number;autor:string;actualizado:string}>();return response(409,{error:'conflicto_version',...actual});}
   return response(200,{version,autor,actualizado:new Date().toISOString()});
  }
  return response(404,{error:'ruta_no_encontrada'});
 }catch(e){if(e instanceof RangeError)return response(413,{error:'La planilla excede el límite de 8 MiB.'});if(e instanceof SyntaxError)return response(400,{error:'datos_invalidos'});console.error('vendimia libros',e);if(e instanceof Error&&/UNIQUE constraint/i.test(e.message))return response(409,{error:'Ya existe un documento o período con ese nombre.'});return response(503,{error:'No se pudo completar la operación. No se sobrescribieron datos deliberadamente; conservá el borrador y reintentá.'});}
}
