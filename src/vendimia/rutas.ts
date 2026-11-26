import { identidad, puedeLeer, puedeEscribir } from '../auth';
import { json } from '../respuestas';
import { esquema } from './esquema';
import { rutasLibros } from './libros';
import { rutasV6 } from './v6';
import { rutasFlujo } from './flujo';

export async function rutasVendimia(req: Request, env: Env, ctx: ExecutionContext, sub: string): Promise<Response> {
  const fl = await rutasFlujo(req, env, ctx, sub); if (fl) return fl;
  const v6 = await rutasV6(req, env, ctx, sub); if (v6) return v6;
  if (sub === '/ingresos' || sub.startsWith('/ingresos/') || sub === '/plantillas' || sub === '/periodos' || sub.startsWith('/periodos/') || sub.startsWith('/libros/')) return rutasLibros(req,env,ctx,sub);
  const id = await identidad(req, env, ctx, 'vendimia');
  if (!puedeLeer(id)) return json(403, {error:'sin_permiso'});
  const url = new URL(req.url);
  try {
    if (req.method === 'GET' && sub === '/lotes') {
      const q = (url.searchParams.get('q') || '').trim();
      const anio = url.searchParams.get('anio') || '';
      const {results} = await env.DB.prepare(`SELECT l.*, (SELECT COALESCE(SUM(bruto-tara),0) FROM vend_pesajes WHERE lote_id=l.id) kg_netos FROM vend_lotes l WHERE (?='' OR CAST(anio AS TEXT)=?) AND (?='' OR instr(lower(codigo||' '||nombre||' '||variedad),lower(?))>0) ORDER BY anio DESC,fecha DESC`).bind(anio,anio,q,q).all();
      return json(200,{lotes:results});
    }
    const ficha = /^\/lotes\/([\w-]+)$/.exec(sub);
    if (req.method==='GET' && ficha) {
      const lote = await env.DB.prepare('SELECT * FROM vend_lotes WHERE id=?').bind(ficha[1]).first();
      if (!lote) return json(404,{error:'lote_no_encontrado'});
      const keys=Object.keys(esquema);
      const data=await env.DB.batch([...keys.map(k=>env.DB.prepare(`SELECT * FROM vend_${k} WHERE lote_id=? ORDER BY fecha DESC`).bind(ficha[1])),env.DB.prepare('SELECT * FROM vend_existencias WHERE lote_id=?').bind(ficha[1])]);
      return json(200,{lote,registros:Object.fromEntries(keys.map((k,i)=>[k,data[i].results])),existencias:data[keys.length].results});
    }
    if (req.method !== 'POST') return json(404,{error:'ruta_no_encontrada'});
    if (!puedeEscribir(id)) return json(403,{error:'solo_lectura'});
    if (req.headers.get('Origin') && req.headers.get('Origin')!==url.origin) return json(403,{error:'origen_invalido'});
    if (!req.headers.get('Content-Type')?.includes('application/json')) return json(415,{error:'formato_invalido'});
    const b=await req.json() as Record<string,unknown>;
    if (!b || typeof b!=='object') return json(400,{error:'datos_invalidos'});
    const uid=typeof b.id==='string' && /^[a-f0-9-]{36}$/.test(b.id) ? b.id : crypto.randomUUID();
    const fecha=typeof b.fecha==='string' && Number.isFinite(Date.parse(b.fecha)) ? b.fecha : new Date().toISOString();
    if (sub==='/lotes') {
      const {codigo,nombre,variedad,anio}=b;
      if (![codigo,nombre,variedad].every(x=>typeof x==='string' && x.trim() && x.length<=200) || !Number.isInteger(anio) || Number(anio)<1900 || Number(anio)>2200) return json(400,{error:'completar_lote'});
      await env.DB.prepare('INSERT INTO vend_lotes(id,codigo,anio,nombre,variedad,autor,fecha) VALUES(?,?,?,?,?,?,?)').bind(uid,codigo,anio,nombre,variedad,id!.email,fecha).run();
      return json(201,{id:uid});
    }
    const m=/^\/lotes\/([\w-]+)\/([a-z]+)$/.exec(sub);
    if (!m || !Object.prototype.hasOwnProperty.call(esquema,m[2])) return json(404,{error:'ruta_no_encontrada'});
    const [_,lote,k]=m;
    const fields=esquema[k].fields;
    const vals: (string|number|null)[]=[];
    for (const f of fields) {
      const v=b[f.key];
      if (v===undefined || v===null || v==='') {if(f.required)return json(400,{error:`Falta ${f.label}`}); vals.push(null);continue;}
      if(f.type==='number'){if(typeof v!=='number'||!Number.isFinite(v))return json(400,{error:`Número inválido: ${f.label}`});vals.push(v);}
      else {if(typeof v!=='string'||v.length>4000|| (f.type==='unit'&&!['kg','L'].includes(v)) || (f.type==='status'&&!['Pendiente','Realizado'].includes(v)))return json(400,{error:`Dato inválido: ${f.label}`});vals.push(v.trim());}
    }
    const obs=typeof b.observaciones==='string'?b.observaciones.slice(0,4000):'';
    const columns=['id','lote_id','fecha','autor','observaciones',...fields.map(f=>f.key)];
    const stmt=env.DB.prepare(`INSERT INTO vend_${k}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).bind(uid,lote,fecha,id!.email,obs,...vals);
    const estado:Record<string,string>={moliendas:'Molienda',distribuciones:'Distribución',tintos:'Fermentación',blancos:'Fermentación'};
    if(estado[k]) await env.DB.batch([stmt,env.DB.prepare('UPDATE vend_lotes SET estado=? WHERE id=?').bind(estado[k],lote)]); else await stmt.run();
    return json(201,{id:uid});
  } catch(e) {
    console.error('vendimia',e);
    return json(409,{error:'No se guardó: verificá duplicados, referencias y saldo disponible.'});
  }
}
