// Vendimia V6: precarga por Información ID (fuente: módulo Lotes), numeración
// AANNN en el servidor, fecha de recepción, etapas del circuito y datos
// compartidos entre planillas (vend_hechos).
import { identidad, puedeLeer, puedeEscribir, type Identidad } from '../auth';
import { json } from '../respuestas';
import { escribirDocumento } from '../lotes/rutas';
import { ahoraBodega } from '../prensas/validacion';
import { PLANTILLAS } from './plantillas-data';

export const CAMPOS_ID = ['lote_sistema','variedad','distrito','proyecto','vinedo','ct','clon','id_texto','organico_convencional','origen'] as const;
export const ETAPAS = ['precarga','ot_ingreso','analisis_iniciales','agregados','nutrientes','seguimiento_fa','fin_fa','fml','pie_de_cuba','correccion_ph','inoculacion_bal','crianza_so2'] as const;
const ESTADOS_ETAPA = ['pendiente','en_curso','hecha','no_aplica'];
type Doc = { meta?: Record<string, unknown>; lotes?: Record<string, unknown>[]; [k: string]: unknown };
type Hecho = { tipo: string; lote: string; vasija: string; fecha: string; fecha_origen: 'celda'|'guardado'; hoja: string; brix: number|null; temperatura: number|null; producto: string|null; cantidad: string|null; detalle: Record<string, unknown> };

const r = (s: number, d: unknown) => { const x = json(s, d); x.headers.set('Cache-Control', 'private, no-store'); return x; };
const esObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const txt = (v: unknown, max = 160) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
export const hoyBodega = (env: Env) => ahoraBodega(env.TZ_BODEGA || 'America/Argentina/Mendoza').slice(0, 10);
const fechaISO = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
export const normVasija = (v: unknown) => txt(v).toLowerCase().replace(/\s+/g, '');

async function leerLotes(env: Env): Promise<Doc> {
  const f = await env.DB.prepare("SELECT json FROM documento WHERE modulo='lotes'").first<{ json: string }>();
  return f ? JSON.parse(f.json) as Doc : { meta: { version: 0 }, lotes: [], analisis: [], movimientos: [] };
}
const idDe = (l: Record<string, unknown>) => Object.fromEntries([['lote', txt(l.lote, 20)], ...CAMPOS_ID.map(k => [k, txt(l[k])])]);

/** Mayor correlativo del año + 1, mirando Lotes y los números ya reservados. */
export async function siguienteNumero(env: Env, anio: number, doc?: Doc): Promise<string> {
  const aa = String(anio).slice(-2);
  const d = doc ?? await leerLotes(env);
  const { results } = await env.DB.prepare("SELECT lote FROM vend_numeros WHERE lote LIKE ? UNION SELECT lote FROM vend_ingresos WHERE lote LIKE ?").bind(aa + '%', aa + '%').all<{ lote: string }>();
  let max = 0;
  for (const t of [...(d.lotes ?? []).map(l => txt(l.lote, 20)), ...results.map(x => x.lote)])
    if (/^\d{5}$/.test(t) && t.startsWith(aa)) max = Math.max(max, Number(t.slice(2)));
  if (max >= 999) throw new RangeError(`Se agotaron los correlativos de ${anio} (formato de cinco dígitos).`);
  return aa + String(max + 1).padStart(3, '0');
}

/** Alta o corrección de Información ID en Lotes, con compare-and-swap y reintento. */
async function escribirEnLotes(env: Env, quien: Identidad, lote: string, campos: Record<string, string>): Promise<'creado'|'actualizado'|'sin_cambios'> {
  for (let intento = 0; intento < 3; intento++) {
    const doc = await leerLotes(env);
    const va = Number(doc.meta?.version ?? 0);
    const lotes = doc.lotes ?? (doc.lotes = []);
    const ex = lotes.find(l => txt(l.lote, 20) === lote);
    let res: 'creado'|'actualizado';
    const antes = ex ? idDe(ex) : null;
    if (ex) {
      if (CAMPOS_ID.every(k => txt(ex[k]) === campos[k])) return 'sin_cambios';
      for (const k of CAMPOS_ID) ex[k] = campos[k]; res = 'actualizado';
    } else {
      lotes.push({ lote: Number(lote), ...campos, litros_actuales: 0, cap50: null, cap200: null, cap225: null, cap500: null, vasija_grande: null }); res = 'creado';
    }
    const meta = (doc.meta ??= {});
    meta.version = va + 1; meta.actualizado = ahoraBodega(env.TZ_BODEGA); meta.autor = quien.nombre || quien.email;
    if (!(await escribirDocumento(env, doc as never, quien.email, va))) continue;
    const resumen = `Vendimia: ${res === 'creado' ? 'alta' : 'corrección de Información ID'} del lote ${lote}`;
    await env.DB.batch([
      env.DB.prepare('INSERT INTO historial (modulo, version, ts, autor, email, resumen, detalle, forzado) VALUES (?,?,?,?,?,?,?,0)')
        .bind('lotes', va + 1, String(meta.actualizado), String(meta.autor), quien.email, resumen, JSON.stringify({ lote, antes, despues: campos })),
      env.DB.prepare("INSERT INTO auditoria (modulo, tabla, operacion, fila_id, antes, despues, email) VALUES ('lotes','lotes',?,?,?,?,?)")
        .bind(res === 'creado' ? 'INSERT' : 'UPDATE', lote, antes ? JSON.stringify(antes) : null, JSON.stringify(campos), quien.email),
    ]);
    return res;
  }
  throw new Error('conflicto_lotes');
}

function camposDe(b: Record<string, unknown>) {
  const c = esObj(b.campos) ? b.campos : {};
  const out = Object.fromEntries(CAMPOS_ID.map(k => [k, txt(c[k])])) as Record<string, string>;
  if (out.organico_convencional && !['Orgánico','Convencional'].includes(out.organico_convencional)) throw new SyntaxError('ORGÁNICO / CONVENCIONAL admite Orgánico o Convencional.');
  if (out.origen && !['Uva','Vino'].includes(out.origen)) throw new SyntaxError('ORIGEN admite Uva o Vino.');
  return out;
}

function copias(env: Env, pid: string, autor: string) {
  const s: D1PreparedStatement[] = [];
  const una = (plantilla: string, nombre: string) => { const id = crypto.randomUUID(); s.push(
    env.DB.prepare('INSERT INTO vend_libros(id,periodo_id,plantilla_id,nombre,autor) VALUES(?,?,?,?,?)').bind(id, pid, plantilla, nombre, autor),
    env.DB.prepare("INSERT INTO vend_libro_versiones(libro_id,version,objeto,autor,operacion) VALUES(?,0,NULL,?,'plantilla')").bind(id, autor)); };
  for (const p of PLANTILLAS) una(p.id, p.name);
  una('agregados-v1', 'Agregado de nutrientes'); una('agregados-v1', 'Anhídrido sulfuroso (SO₂)');
  return s;
}

export async function rutasV6(req: Request, env: Env, ctx: ExecutionContext, sub: string): Promise<Response | null> {
  const rutas = /^\/(identificacion|siguiente|precargas|seguimiento|etapas|recepcion|mediciones|estado)(?:\/([0-9a-f-]{36}))?$/i.exec(sub);
  if (!rutas) return null;
  const [, ruta, pid] = rutas;
  const id = await identidad(req, env, ctx, 'vendimia');
  if (!puedeLeer(id)) return r(403, { error: 'Tu usuario no tiene acceso a Vendimia.' });
  const url = new URL(req.url);
  try {
    if (req.method === 'GET') {
      if (ruta === 'identificacion') {
        const doc = await leerLotes(env), lotes = (doc.lotes ?? []).map(idDe).filter(l => l.lote);
        const catalogos: Record<string, string[]> = {};
        for (const k of CAMPOS_ID) { const n = new Map<string, number>(); for (const l of lotes) if (l[k]) n.set(l[k], (n.get(l[k]) ?? 0) + 1); catalogos[k] = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(x => x[0]); }
        const lid = await identidad(req, env, ctx, 'lotes');
        const anio = Number(hoyBodega(env).slice(0, 4));
        return r(200, { lotes, catalogos, maestroVacio: lotes.length === 0, puedeEditarLotes: puedeEscribir(lid), anio, siguiente: await siguienteNumero(env, anio, doc).catch(e => e.message) });
      }
      if (ruta === 'siguiente') {
        const anio = Number(url.searchParams.get('anio'));
        if (!Number.isInteger(anio) || anio < 2000 || anio > 2099) return r(400, { error: 'Año inválido.' });
        return r(200, { lote: await siguienteNumero(env, anio) });
      }
      if (ruta === 'seguimiento' && pid) {
        const ing = await env.DB.prepare('SELECT * FROM vend_ingresos WHERE periodo_id=?').bind(pid).first<Record<string, string>>();
        if (!ing) return r(404, { error: 'No se encontró el lote.' });
        const info = JSON.parse(ing.informacion_id || '{}');
        const vasijas = new Set([ing.vasija, ...((info.recepcion_detalle?.destinos ?? []) as { vasija?: string }[]).map(d => d.vasija)].map(normVasija).filter(Boolean));
        const anio = ing.lote.length === 5 ? '20' + ing.lote.slice(0, 2) : (ing.recepcion || '').slice(0, 4);
        const [et, hl, hv, lb] = await env.DB.batch([
          env.DB.prepare('SELECT * FROM vend_etapas WHERE periodo_id=?').bind(pid),
          env.DB.prepare('SELECT * FROM vend_hechos WHERE lote=? ORDER BY fecha, registrado').bind(ing.lote),
          env.DB.prepare("SELECT * FROM vend_hechos WHERE lote='' AND substr(fecha,1,4)=? ORDER BY fecha").bind(anio),
          env.DB.prepare('SELECT id,plantilla_id,nombre,version,autor,actualizado FROM vend_libros WHERE periodo_id=? ORDER BY creado,nombre').bind(pid),
        ]);
        const porVasija = (hv.results as Record<string, unknown>[]).filter(h => vasijas.has(normVasija(h.vasija))).map(h => ({ ...h, vinculo: 'vasija' }));
        return r(200, { ingreso: ing, etapas: et.results, hechos: [...hl.results, ...porVasija], libros: lb.results });
      }
      if (ruta === 'mediciones') {
        const lote = txt(url.searchParams.get('lote'), 20), vas = normVasija(url.searchParams.get('vasija')), excluir = txt(url.searchParams.get('excluir'), 40);
        const { results } = await env.DB.prepare("SELECT * FROM vend_hechos WHERE tipo='medicion' AND (lote=? OR lote='') AND libro_id<>? ORDER BY fecha").bind(lote, excluir).all<Record<string, unknown>>();
        return r(200, { mediciones: results.filter(h => normVasija(h.vasija) === vas && (h.lote === lote || String(h.fecha).slice(2, 4) === lote.slice(0, 2)) && (h.brix !== null || h.temperatura !== null)) });
      }
      return r(404, { error: 'ruta_no_encontrada' });
    }
    if (req.method !== 'POST') return r(404, { error: 'ruta_no_encontrada' });
    if (!puedeEscribir(id)) return r(403, { error: 'Tu usuario puede consultar Vendimia, pero no modificarla.' });
    if (req.headers.get('Origin') !== url.origin) return r(403, { error: 'origen_invalido' });
    const b = await req.json().catch(() => null);
    if (!esObj(b)) return r(400, { error: 'Datos inválidos.' });
    const autor = id!.email;

    if (ruta === 'precargas') {
      const lote = txt(b.lote, 20);
      if (!/^\d{5}$/.test(lote)) return r(400, { error: 'El LOTE tiene que tener cinco dígitos: año (2) + correlativo (3). Ej.: 26001.' });
      if (lote.endsWith('000')) return r(400, { error: 'El correlativo empieza en 001.' });
      const campos = camposDe(b);
      const nombre = campos.id_texto || [campos.variedad, campos.vinedo].filter(Boolean).join(' ') || lote;
      const doc = await leerLotes(env);
      const enLotes = (doc.lotes ?? []).find(l => txt(l.lote, 20) === lote);
      let periodo = pid;
      if (!periodo) {
        const ya = await env.DB.prepare('SELECT periodo_id FROM vend_ingresos WHERE lote=? LIMIT 1').bind(lote).first<{ periodo_id: string }>();
        if (ya) return r(409, { error: `El lote ${lote} ya está en Vendimia.`, periodo_id: ya.periodo_id });
        if (b.nuevo === true && enLotes) return r(409, { error: `El lote ${lote} ya existe en Lotes. Elegilo de la lista para recuperar sus datos.`, siguiente: await siguienteNumero(env, 2000 + Number(lote.slice(0, 2)), doc) });
        periodo = crypto.randomUUID();
        const info = { ...campos, precarga: { confirmada: false, creada: ahoraBodega(env.TZ_BODEGA) } };
        try {
          await env.DB.batch([
            env.DB.prepare('INSERT INTO vend_periodos(id,nombre,anio,desde,autor) VALUES(?,?,?,?,?)').bind(periodo, `Lote ${lote} · ${periodo.slice(0, 8)}`, 2000 + Number(lote.slice(0, 2)), hoyBodega(env), autor),
            env.DB.prepare("INSERT INTO vend_ingresos(periodo_id,lote,nombre_lote,variedad,vasija,recepcion,estado,autor,informacion_id) VALUES(?,?,?,?,'','','borrador',?,?)").bind(periodo, lote, nombre, campos.variedad, autor, JSON.stringify(info)),
            env.DB.prepare('INSERT INTO vend_numeros(lote,periodo_id,autor) VALUES(?,?,?)').bind(lote, periodo, autor),
            env.DB.prepare("INSERT INTO vend_etapas(periodo_id,etapa,estado,autor) VALUES(?,'precarga','en_curso',?)").bind(periodo, autor),
            ...copias(env, periodo, autor),
          ]);
        } catch (e) {
          if (/UNIQUE/i.test(String(e))) return r(409, { error: `Otra persona acaba de tomar el número ${lote}.`, siguiente: await siguienteNumero(env, 2000 + Number(lote.slice(0, 2))) });
          throw e;
        }
        if (b.confirmar !== true) return r(201, { periodo_id: periodo, version: 0, enLotes: !!enLotes });
        b.version = 0;
      }
      const ing = await env.DB.prepare('SELECT * FROM vend_ingresos WHERE periodo_id=?').bind(periodo).first<Record<string, string | number>>();
      if (!ing) return r(404, { error: 'No se encontró la precarga.' });
      if (!Number.isInteger(b.version)) return r(400, { error: 'Versión inválida.' });
      const info = JSON.parse(String(ing.informacion_id || '{}'));
      const stm: D1PreparedStatement[] = [];
      if (ing.lote !== lote) {
        if (info.precarga?.confirmada) return r(400, { error: 'El número de un lote confirmado no se cambia desde acá.' });
        if (await env.DB.prepare('SELECT 1 FROM vend_ingresos WHERE lote=? AND periodo_id<>?').bind(lote, periodo).first()) return r(409, { error: `El lote ${lote} ya está en Vendimia.` });
        stm.push(env.DB.prepare('DELETE FROM vend_numeros WHERE periodo_id=?').bind(periodo), env.DB.prepare('INSERT INTO vend_numeros(lote,periodo_id,autor) VALUES(?,?,?)').bind(lote, periodo, autor));
      }
      let lotesRes = '';
      if (b.confirmar === true) {
        const lid = await identidad(req, env, ctx, 'lotes');
        const cambia = !enLotes || CAMPOS_ID.some(k => txt(enLotes[k]) !== campos[k]);
        if (cambia && !puedeEscribir(lid)) return r(403, { error: enLotes ? 'Para corregir la Información ID de un lote existente necesitás permiso de edición en Lotes. Pedíselo a un administrador.' : 'Para dar de alta el lote en Lotes necesitás permiso de edición en Lotes.' });
        lotesRes = cambia ? await escribirEnLotes(env, lid!, lote, campos) : 'sin_cambios';
        info.precarga = { ...info.precarga, confirmada: true, confirmo: autor, fecha: ahoraBodega(env.TZ_BODEGA) };
        stm.push(env.DB.prepare("INSERT INTO vend_etapas(periodo_id,etapa,estado,autor) VALUES(?,'precarga','hecha',?) ON CONFLICT(periodo_id,etapa) DO UPDATE SET estado='hecha',autor=excluded.autor,fecha=datetime('now')").bind(periodo, autor));
      }
      Object.assign(info, campos);
      const estado = b.confirmar === true && ing.estado === 'borrador' ? 'en_proceso' : ing.estado;
      try {
        const res = await env.DB.batch([...stm, env.DB.prepare("UPDATE vend_ingresos SET lote=?,nombre_lote=?,variedad=?,informacion_id=?,estado=?,autor=?,version=version+1,actualizado=datetime('now') WHERE periodo_id=? AND version=?").bind(lote, nombre, campos.variedad, JSON.stringify(info), estado, autor, periodo, b.version)]);
        if (res[res.length - 1].meta.changes !== 1) throw new Error('version');
      } catch (e) {
        if (/UNIQUE/i.test(String(e))) return r(409, { error: `Otra persona acaba de tomar el número ${lote}.` });
        if (String(e).includes('version')) return r(409, { error: 'Otra persona modificó esta precarga. Volvé a abrirla.' });
        throw e;
      }
      return r(200, { periodo_id: periodo, version: Number(b.version) + 1, lotes: lotesRes, estado });
    }

    if (!pid) return r(404, { error: 'ruta_no_encontrada' });
    const ing = await env.DB.prepare('SELECT * FROM vend_ingresos WHERE periodo_id=?').bind(pid).first<Record<string, string | number>>();
    if (!ing) return r(404, { error: 'No se encontró el lote.' });
    if (ing.estado === 'finalizado' && id!.rol !== 'admin' && ruta !== 'estado') return r(403, { error: 'Este lote está finalizado. Solo un administrador puede modificarlo.' });

    if (ruta === 'etapas') {
      const etapa = txt(b.etapa, 40), estado = txt(b.estado, 20);
      if (!(ETAPAS as readonly string[]).includes(etapa) || !ESTADOS_ETAPA.includes(estado)) return r(400, { error: 'Etapa o estado inválido.' });
      const resultado = etapa === 'fin_fa' ? (['termina','no_termina',''].includes(txt(b.resultado)) ? txt(b.resultado) : '') : '';
      await env.DB.prepare("INSERT INTO vend_etapas(periodo_id,etapa,estado,resultado,nota,autor) VALUES(?,?,?,?,?,?) ON CONFLICT(periodo_id,etapa) DO UPDATE SET estado=excluded.estado,resultado=excluded.resultado,nota=excluded.nota,autor=excluded.autor,fecha=datetime('now')")
        .bind(pid, etapa, estado, resultado, txt(b.nota, 1000), autor).run();
      return r(200, { ok: true });
    }
    if (!Number.isInteger(b.version)) return r(400, { error: 'Versión inválida.' });
    const cas = (sql: string, ...v: unknown[]) => env.DB.prepare(`UPDATE vend_ingresos SET ${sql},autor=?,version=version+1,actualizado=datetime('now') WHERE periodo_id=? AND version=?`).bind(...v, autor, pid, b.version).run();
    let res: D1Result;
    if (ruta === 'recepcion') {
      if (!fechaISO(b.recepcion)) return r(400, { error: 'Elegí una fecha de recepción válida.' });
      const vas = typeof b.vasija === 'string' ? txt(b.vasija, 80) : String(ing.vasija);
      res = await cas('recepcion=?,vasija=?', b.recepcion, vas);
    } else {
      const estado = txt(b.estado);
      if (!['borrador','en_proceso','finalizado'].includes(estado)) return r(400, { error: 'Estado inválido.' });
      if (ing.estado === 'finalizado' && id!.rol !== 'admin') return r(403, { error: 'Solo un administrador puede reabrir un lote finalizado.' });
      res = await cas('estado=?', estado);
    }
    if (res.meta.changes !== 1) return r(409, { error: 'Otra persona modificó este lote. Se recargan los datos.' });
    return r(200, { version: Number(b.version) + 1 });
  } catch (e) {
    if (e instanceof SyntaxError || e instanceof RangeError) return r(400, { error: e.message });
    console.error('vendimia v6', e);
    return r(503, { error: String(e).includes('conflicto_lotes') ? 'Lotes está recibiendo muchos cambios a la vez. Reintentá en unos segundos; no se perdió nada.' : 'No se pudo completar la operación. No se perdió nada: reintentá.' });
  }
}

// ---------- Datos compartidos: extracción por encabezados, no por coordenadas ----------
type Celda = { r: number; c: number; v: Record<string, unknown> };
type Hoja = { name: string; celldata: Celda[] };
const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const serialAISO = (n: number) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
function tabla(h: Hoja) {
  const m = new Map<string, Record<string, unknown>>(); for (const c of h.celldata) m.set(c.r + ',' + c.c, c.v);
  const val = (r: number, c: number) => { const v = m.get(r + ',' + c); return v?.v ?? null; };
  const busca = (pred: (t: string) => boolean) => h.celldata.filter(c => pred(norm(c.v.v ?? c.v.m))).sort((a, b) => a.r - b.r || a.c - b.c);
  const derecha = (r: number, c: number) => { for (let k = c + 1; k < c + 15; k++) { const v = val(r, k); if (v !== null && v !== '') return { v, f: !!m.get(r + ',' + k)?.f }; } return null; };
  return { val, busca, derecha };
}
const numero = (v: unknown) => { if (v === null || v === '' || typeof v === 'boolean') return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fechaCelda = (x: { v: unknown; f: boolean } | null) => { const n = x ? numero(x.v) : null; return n !== null && n > 30000 && n < 80000 ? serialAISO(n) : null; };

export function extraerHechos(plantilla: string, nombreLibro: string, snap: { sheets?: Hoja[] }, hoy: string): Hecho[] {
  const out: Hecho[] = [];
  const base = (h: Hoja, o: Partial<Hecho>): Hecho => ({ tipo: 'medicion', lote: '', vasija: '', fecha: hoy, fecha_origen: 'guardado', hoja: h.name, brix: null, temperatura: null, producto: null, cantidad: null, detalle: {}, ...o });
  for (const h of snap.sheets ?? []) {
    const t = tabla(h);
    if (plantilla === 'brix-v1') {
      const enc = t.busca(x => x === 'ciw lote')[0]; if (!enc) continue;
      const fila = t.busca(x => true).filter(c => c.r === enc.r);
      const col = (nombre: string, desde: number, hasta: number) => fila.find(c => norm(c.v.v).startsWith(nombre) && c.c > desde && c.c < hasta)?.c;
      const fl = t.busca(x => x.startsWith('fecha')).find(c => c.r < enc.r);
      const fx = fl ? t.derecha(fl.r, fl.c) : null, f = fx && !fx.f ? fechaCelda(fx) : null;
      const vg = col('vasija', -1, enc.c), secciones = [
        { lote: enc.c, vas: col('vasija', enc.c, 99), brix: col('brix', enc.c, 99), temp: col('temperatura', enc.c, 99) },
        ...(vg !== undefined ? [{ lote: -1, vas: vg, brix: col('brix', vg, enc.c), temp: col('temperatura', vg, enc.c) }] : []),
      ];
      const maxR = Math.max(...h.celldata.map(c => c.r));
      for (const s of secciones) for (let rr = enc.r + 1; rr <= maxR; rr++) {
        const brix = s.brix !== undefined ? numero(t.val(rr, s.brix)) : null, temp = s.temp !== undefined ? numero(t.val(rr, s.temp)) : null;
        const lote = s.lote >= 0 ? txt(t.val(rr, s.lote), 20) : '', vasija = s.vas !== undefined ? txt(t.val(rr, s.vas), 80) : '';
        if ((brix === null && temp === null) || !vasija || (s.lote >= 0 && !/^\d{5}$/.test(lote))) continue;
        out.push(base(h, { lote, vasija, brix, temperatura: temp, fecha: f ?? hoy, fecha_origen: f ? 'celda' : 'guardado', detalle: { fila: rr + 1 } }));
      }
    }
    if (plantilla === 'tintos-v1') {
      const lc = t.busca(x => x.startsWith('numero de lote'))[0], vc = t.busca(x => x.startsWith('n° vasija'))[0], rc = t.busca(x => x.startsWith('fecha recepcion'))[0];
      if (!lc || !vc) continue;
      const lote = txt(t.derecha(lc.r, lc.c)?.v, 20), vasija = txt(t.derecha(vc.r, vc.c)?.v, 80), recep = rc ? fechaCelda(t.derecha(rc.r, rc.c)) : null;
      if (!/^\d{5}$/.test(lote)) continue;
      const hb = t.busca(x => x.startsWith('brix (') && x.includes('6'))[0];
      if (hb) {
        const fila = t.busca(() => true).filter(c => c.r === hb.r), fc = fila.find(c => norm(c.v.v).startsWith('fecha'))?.c, tc = fila.find(c => norm(c.v.v).startsWith('°c'))?.c;
        const maxR = Math.max(...h.celldata.map(c => c.r));
        for (let rr = hb.r + 1; rr <= maxR; rr++) {
          const brix = numero(t.val(rr, hb.c)), temp = tc !== undefined ? numero(t.val(rr, tc)) : null, f = fc !== undefined ? fechaCelda({ v: t.val(rr, fc), f: false }) : null;
          if ((brix === null && temp === null) || !f) continue;
          out.push(base(h, { lote, vasija, brix, temperatura: temp, fecha: f, fecha_origen: 'celda', detalle: { fila: rr + 1, fuente: 'seguimiento diario' } }));
        }
      }
      const ini = t.busca(x => x === 'iniciales')[0], hdr = ini ? t.busca(() => true).filter(c => c.r === ini.r - 1) : [];
      if (ini && hdr.length) {
        const d: Record<string, unknown> = { analisis_inicial: true }; let brix = null;
        for (const c of hdr) { const k = norm(c.v.v), v = numero(t.val(ini.r, c.c)); if (v === null || !k) continue; if (k === 'brix') brix = v; else d[k] = v; }
        if (brix !== null || Object.keys(d).length > 1) out.push(base(h, { lote, vasija, brix, fecha: recep ?? hoy, fecha_origen: recep ? 'celda' : 'guardado', detalle: d }));
      }
      const pr = t.busca(x => x.startsWith('productos'))[0];
      if (pr) {
        const fila = t.busca(() => true).filter(c => c.r === pr.r), dc = fila.find(c => norm(c.v.v).startsWith('dosis'))?.c, qc = fila.find(c => norm(c.v.v).startsWith('cantidad'))?.c, oc = fila.find(c => norm(c.v.v).includes('ot'))?.c;
        for (let rr = pr.r + 1; rr < pr.r + 12; rr++) {
          const p = txt(t.val(rr, pr.c)); if (!p) continue; if (p.startsWith('(') || norm(p).startsWith('agregado de levadura')) break;
          out.push(base(h, { tipo: 'agregado', lote, vasija, producto: p, cantidad: qc !== undefined ? txt(t.val(rr, qc)) : '', fecha: recep ?? hoy, fecha_origen: recep ? 'celda' : 'guardado', detalle: { dosis: dc !== undefined ? t.val(rr, dc) : null, ot: oc !== undefined ? t.val(rr, oc) : null, fuente: 'agregados en molienda' } }));
        }
      }
    }
    if (plantilla === 'agregados-v1') {
      const enc = t.busca(x => x === 'ciw lote')[0]; if (!enc) continue;
      const fila = t.busca(() => true).filter(c => c.r === enc.r), col = (n: string) => fila.find(c => norm(c.v.v) === n)?.c;
      const vc = col('vasija'), pc = col('agregado'), qc = col('cantidad'), ic = col('lote');
      const n = norm(nombreLibro), tipo = n.includes('nutriente') ? 'nutriente' : /so2|so₂|sulfuroso/.test(n) ? 'so2' : 'agregado';
      const ol = t.busca(x => x.startsWith('nro de orden'))[0];
      const ot = ol ? [1, 2, 3].map(k => txt(t.val(ol.r, ol.c + k))).filter(Boolean).join(' ') : '';
      const maxR = Math.max(...h.celldata.map(c => c.r));
      for (let rr = enc.r + 1; rr <= maxR; rr++) {
        const lote = txt(t.val(rr, enc.c), 20), producto = pc !== undefined ? txt(t.val(rr, pc)) : '';
        if (!/^\d{5}$/.test(lote) || !producto) continue;
        out.push(base(h, { tipo, lote, vasija: vc !== undefined ? txt(t.val(rr, vc), 80) : '', producto, cantidad: qc !== undefined ? txt(t.val(rr, qc)) : '', detalle: { lote_insumo: ic !== undefined ? t.val(rr, ic) : null, ot, fila: rr + 1 } }));
      }
    }
  }
  return out;
}

/** Celda: la planilla es la fuente (se reemplaza). Guardado: se conserva lo de
 *  días anteriores; hoy se reemplaza; y un valor que no cambió desde el último
 *  registro no se vuelve a anotar como medición nueva. */
export async function registrarHechos(env: Env, libro: { id: string; periodo_id: string; plantilla_id: string; nombre: string }, version: number, autor: string, snap: unknown) {
  if (!['brix-v1', 'tintos-v1', 'agregados-v1'].includes(libro.plantilla_id)) return;
  const hoy = hoyBodega(env), hs = extraerHechos(libro.plantilla_id, libro.nombre, snap as { sheets?: Hoja[] }, hoy);
  const { results: previos } = await env.DB.prepare("SELECT tipo,lote,vasija,hoja,brix,temperatura,producto,cantidad FROM vend_hechos WHERE libro_id=? AND fecha_origen='guardado' AND fecha<? ORDER BY fecha").bind(libro.id, hoy).all<Record<string, unknown>>();
  const clave = (h: Record<string, unknown>) => [h.tipo, h.lote, h.vasija, h.hoja].join('|'), valor = (h: Record<string, unknown>) => [h.brix, h.temperatura, h.producto, h.cantidad].join('|');
  const ultimo = new Map<string, string>(); for (const p of previos) ultimo.set(clave(p), valor(p));
  const ins = env.DB.prepare('INSERT INTO vend_hechos(id,periodo_id,libro_id,libro_version,plantilla_id,tipo,lote,vasija,fecha,fecha_origen,hoja,brix,temperatura,producto,cantidad,detalle,autor) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  await env.DB.batch([
    env.DB.prepare("DELETE FROM vend_hechos WHERE libro_id=? AND (fecha_origen='celda' OR fecha=?)").bind(libro.id, hoy),
    ...hs.filter(h => h.fecha_origen === 'celda' || ultimo.get(clave(h)) !== valor(h)).map(h => ins.bind(crypto.randomUUID(), libro.periodo_id, libro.id, version, libro.plantilla_id, h.tipo, h.lote, h.vasija, h.fecha, h.fecha_origen, h.hoja, h.brix, h.temperatura, h.producto, h.cantidad, JSON.stringify(h.detalle), autor)),
  ]);
}
