// Vendimia V7: flujo por lote y vasija.
// precarga → análisis inicial → revisión técnica (TH2 o "no requiere") →
// confirmación de pH → OT de siembra → ejecución → +24 h → OT de nutrientes.
// Todas las reglas y permisos se validan acá; la pantalla solo las muestra.
import { identidad, puedeLeer, puedeEscribir, type Identidad } from '../auth';
import { json } from '../respuestas';

type Fila = Record<string, any>;
const r = (s: number, d: unknown) => { const x = json(s, d); x.headers.set('Cache-Control', 'private, no-store'); return x; };
const esObj = (v: unknown): v is Fila => !!v && typeof v === 'object' && !Array.isArray(v);
const txt = (v: unknown, max = 300) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
const num = (v: unknown): number | null => { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const parse = (s: unknown, d: any = {}) => { try { return s ? JSON.parse(String(s)) : d; } catch { return d; } };
export const normVasija = (v: unknown) => txt(v).toLowerCase().replace(/\s+/g, '');
const ahora = () => new Date().toISOString();
class Regla extends Error { constructor(public status: number, msg: string, public extra: Fila = {}) { super(msg); } }

/** "2026-03-01T14:30" (hora de Mendoza, UTC-3) o ISO completo → ISO UTC. */
export function fechaHora(v: unknown): string | null {
  const s = txt(v, 40);
  const t = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s) ? Date.parse(s + (s.length === 16 ? ':00' : '') + '-03:00') : Date.parse(s);
  return Number.isFinite(t) && /^\d{4}-/.test(s) ? new Date(t).toISOString() : null;
}

// ---------- permisos ----------
export interface Permisos { leer: boolean; escribir: boolean; tecnico: boolean; operario: boolean; admin: boolean }
export async function permisos(env: Env, id: Identidad | null): Promise<Permisos> {
  const admin = id?.rol === 'admin';
  const p = id ? await env.DB.prepare('SELECT tecnico, operario FROM vend_permisos WHERE email=?').bind(id.email).first<Fila>() : null;
  return { leer: puedeLeer(id), escribir: puedeEscribir(id), admin, tecnico: admin || (puedeEscribir(id) && p?.tecnico === 1), operario: admin || id?.rol === 'editor' || (puedeLeer(id) && p?.operario === 1) };
}

// ---------- criterios ----------
export async function criterio(env: Env) {
  const f = await env.DB.prepare('SELECT version, fuente, json FROM vend_criterios WHERE vigente=1 ORDER BY creado DESC LIMIT 1').first<Fila>();
  return f ? { version: String(f.version), fuente: String(f.fuente), ...parse(f.json) } : null;
}
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** verde = evaluable dentro del límite máx; rojo = fuera; gris = falta dato o criterio.
 *  "Esperado" se informa aparte: no es el límite. */
export function evaluarPh(c: any, variedad: string, etapa: 'mosto' | 'post_descube' | 'crianza', ph: number | null, natural = false) {
  const v = sinAcentos(variedad || '');
  const g = c?.grupos?.find((x: any) => !!x.natural === natural && x.variedades.some((n: string) => v.includes(n)));
  const base = { parametro: 'pH', etapa: c?.etapas?.[etapa] ?? etapa, unidad: '', valor: ph, criterio_version: c?.version ?? null };
  if (ph === null) return { ...base, estado: 'gris', texto: 'Falta el dato de pH' };
  if (!g) return { ...base, estado: 'gris', texto: `Sin criterio aprobado para la variedad “${variedad || 'sin indicar'}”` };
  const [limite, esperado] = g[etapa];
  return ph <= limite
    ? { ...base, estado: 'verde', grupo: g.nombre, limite, esperado, texto: `pH ${ph} dentro del límite máx. ${limite} (esperado ${esperado})` }
    : { ...base, estado: 'rojo', grupo: g.nombre, limite, esperado, texto: `pH ${ph} supera el límite máx. ${limite} (esperado ${esperado})` };
}
/** Az. Red. < límite, estricto: 1,64 NO cumple "< 1,64". */
export function evaluarFinFA(c: any, azRed: number | null) {
  const f = c?.fin_fa; const base = { parametro: f?.parametro ?? 'Az. Red.', unidad: f?.unidad ?? '', limite: f?.limite ?? null, regla: f?.estado ?? 'sin_regla', criterio_version: c?.version ?? null, valor: azRed };
  if (!f) return { ...base, estado: 'gris', texto: 'Sin regla aprobada de fin de FA' };
  if (azRed === null) return { ...base, estado: 'gris', texto: 'Pendiente de análisis' };
  return azRed < f.limite ? { ...base, estado: 'verde', texto: `${f.parametro} ${azRed} ${f.unidad} < ${f.limite}: cumple` } : { ...base, estado: 'rojo', texto: `${f.parametro} ${azRed} ${f.unidad} no es menor que ${f.limite}: seguir el seguimiento de FA` };
}

// ---------- OT ----------
const RECETA = ['producto', 'dosis', 'unidad_dosis', 'cantidad', 'unidad', 'instrucciones', 'responsable'];
export const faltantesReceta = (d: Fila) => RECETA.filter(k => !txt(d?.[k]));
const ETIQUETA: Fila = { th2: 'Corrección de acidez (TH2)', siembra: 'Siembra de levaduras', nutrientes: 'Agregado de nutrientes', movimiento: 'Movimiento de vasijas', descube: 'Descube', desvinado: 'Desvinado', agregado: 'Agregado' };
async function nuevoNumero(env: Env): Promise<string> {
  const anio = Number(new Date().toISOString().slice(0, 4));
  const f = await env.DB.prepare('INSERT INTO vend_ot_numeros(anio,ultimo) VALUES(?,1) ON CONFLICT(anio) DO UPDATE SET ultimo=ultimo+1 RETURNING ultimo').bind(anio).first<{ ultimo: number }>();
  return `V${String(anio).slice(2)}-${String(f!.ultimo).padStart(4, '0')}`;
}
const evento = (env: Env, ot: Fila, ev: string, datos: Fila, autor: string) => env.DB.prepare('INSERT INTO vend_ot_eventos(ot_id,version,evento,datos,autor) VALUES(?,?,?,?,?)').bind(ot.id, ot.version, ev, JSON.stringify(datos), autor);
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Documento imprimible de la OT (A4). Todo dato de usuario va escapado. */
export function documentoOT(ot: Fila, ing: Fila, demo: boolean): string {
  const d = parse(ot.datos), info = parse(ing.informacion_id);
  const fila = (k: string, v: unknown) => v === undefined || v === null || v === '' ? '' : `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;
  const mendoza = (s: string) => s ? new Date(s).toLocaleString('es-AR', { timeZone: 'America/Argentina/Mendoza' }) : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>OT ${esc(ot.numero)}</title><style>body{font:13px Arial,sans-serif;margin:18mm}h1{font-size:18px;margin:0}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top}th{width:32%;background:#f2f2f2}.demo{color:#b00;font-weight:bold;font-size:16px;border:2px solid #b00;padding:6px;margin:8px 0}.firmas td{height:40px}</style></head><body>
<p>BODEGAS ESMERALDA S.A. · CATENA INSTITUTE OF WINE</p><h1>ORDEN DE TRABAJO N° ${esc(ot.numero)} · ${esc(ETIQUETA[ot.tipo])}</h1>
${demo ? '<div class="demo">DEMOSTRACIÓN — NO EJECUTAR</div>' : ''}<p>Versión ${esc(ot.version)} · Emitida ${esc(mendoza(ot.emitida_en || ahora()))}</p>
<table>${fila('CIW lote', ing.lote)}${fila('Vino / variedad', [info.variedad, info.id_texto].filter(Boolean).join(' · '))}${fila('Vasija', ot.vasija)}${fila('Producto', d.producto)}${fila('Dosis', d.dosis ? `${d.dosis} ${d.unidad_dosis || ''}` : '')}${fila('Cantidad total', d.cantidad ? `${d.cantidad} ${d.unidad || ''}` : '')}${fila('Base de cálculo', d.base_calculo)}${fila('Origen', d.origen)}${fila('Destino', d.destino)}${fila('Tipo de movimiento', d.tipo_mov)}${fila('Programada para', ot.programada_para ? mendoza(ot.programada_para) : '')}${fila('Instrucciones', d.instrucciones)}${fila('Responsable', d.responsable)}${fila('Aprobó', ot.aprobada_por)}</table>
<table class="firmas"><tr><th>Ejecutó (nombre y firma)</th><td></td></tr><tr><th>Fecha y hora real</th><td></td></tr><tr><th>Cantidad utilizada / lote de insumo</th><td></td></tr><tr><th>Observaciones</th><td></td></tr></table></body></html>`;
}

/** Encola la impresión. Lotes de demostración no generan impresiones productivas. */
async function encolar(env: Env, ot: Fila, autor: string, reimpresion = false): Promise<D1PreparedStatement[]> {
  const ing = await env.DB.prepare('SELECT * FROM vend_ingresos WHERE periodo_id=?').bind(ot.periodo_id).first<Fila>();
  const demo = !!parse(ing?.informacion_id).demo;
  if (demo) return [evento(env, ot, 'impresion_omitida_demo', {}, autor)];
  const imp = await env.DB.prepare('SELECT id FROM impresoras WHERE activa=1 AND automatico=1 ORDER BY nombre LIMIT 1').first<Fila>();
  const clave = `${ot.id}|v${ot.version}|${reimpresion ? crypto.randomUUID() : 'auto'}`;
  return [
    env.DB.prepare('INSERT OR IGNORE INTO impresion_trabajos(id,clave,ot_id,numero,version,impresora_id,documento,reimpresion,autor) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), clave, ot.id, ot.numero, ot.version, imp?.id ?? null, documentoOT(ot, ing ?? {}, demo), reimpresion ? 1 : 0, autor),
    evento(env, ot, reimpresion ? 'reimpresion_en_cola' : 'impresion_en_cola', { impresora: imp?.id ?? null }, autor),
  ];
}

/** Emite las OT programadas vencidas. Lo llama el cron cada 5 min y cada lectura:
 *  funciona aunque todas las tablets estén cerradas. El UPDATE con estado en el
 *  WHERE garantiza una sola emisión aunque corra dos veces a la vez. */
export async function emitirVencidas(env: Env): Promise<number> {
  const { results } = await env.DB.prepare("SELECT * FROM vend_ot WHERE estado='programada' AND programada_para<=?").bind(ahora()).all<Fila>();
  let n = 0;
  for (const ot of results) {
    const t = ahora();
    const u = await env.DB.prepare("UPDATE vend_ot SET estado='emitida', emitida_en=?, actualizado=? WHERE id=? AND estado='programada'").bind(t, t, ot.id).run();
    if (u.meta.changes !== 1) continue;
    ot.estado = 'emitida'; ot.emitida_en = t; n++;
    await env.DB.batch([evento(env, ot, 'emitida_por_agenda', { programada_para: ot.programada_para }, 'sistema'), ...(await encolar(env, ot, 'sistema'))]);
  }
  return n;
}

// ---------- estado del lote ----------
async function cargarLote(env: Env, pid: string) {
  const ing = await env.DB.prepare('SELECT * FROM vend_ingresos WHERE periodo_id=?').bind(pid).first<Fila>();
  if (!ing) throw new Regla(404, 'No se encontró el lote.');
  const [reg, ots, dec, movs, tr] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM vend_registros WHERE periodo_id=? ORDER BY fecha_muestra').bind(pid),
    env.DB.prepare('SELECT * FROM vend_ot WHERE periodo_id=? ORDER BY creado').bind(pid),
    env.DB.prepare('SELECT * FROM vend_decisiones WHERE periodo_id=? ORDER BY fecha').bind(pid),
    env.DB.prepare('SELECT * FROM vend_movs WHERE periodo_id=? ORDER BY fecha').bind(pid),
    env.DB.prepare('SELECT t.id,t.ot_id,t.numero,t.version,t.estado,t.reimpresion,t.error,t.creado,t.actualizado,t.impresora_id FROM impresion_trabajos t JOIN vend_ot o ON o.id=t.ot_id WHERE o.periodo_id=? ORDER BY t.creado').bind(pid),
  ]);
  return { ing, info: parse(ing.informacion_id), registros: reg.results as Fila[], ots: (ots.results as Fila[]).map((o): Fila => ({ ...o, datos: parse(o.datos), ejecucion: parse(o.ejecucion, null) })), decisiones: (dec.results as Fila[]).map((d): Fila => ({ ...d, resultado: parse(d.resultado) })), movs: movs.results as Fila[], trabajos: tr.results as Fila[] };
}
type Lote = Awaited<ReturnType<typeof cargarLote>>;
export function vasijasDe(L: Lote): string[] {
  const out = new Map<string, string>(), add = (v: unknown) => { const n = normVasija(v); if (n && !out.has(n)) out.set(n, txt(v, 80)); };
  add(L.ing.vasija); for (const d of L.info.recepcion_detalle?.destinos ?? []) add(d.vasija);
  for (const x of [...L.registros, ...L.ots]) add(x.vasija);
  for (const m of L.movs) if (m.estado === 'ejecutado') add(m.destino);
  return [...out.values()];
}
const de = (L: Lote, v: string) => { const n = normVasija(v); const f = (x: Fila) => normVasija(x.vasija) === n; return { reg: L.registros.filter(x => f(x) && !x.anulado), ots: L.ots.filter(x => f(x) && x.estado !== 'cancelada'), dec: L.decisiones.filter(f) }; };
const datosDe = (x: Fila) => parse(x.datos);

/** Próxima acción de una vasija: una sola, la siguiente del circuito. */
export function proximaAccion(L: Lote, vasija: string): { clave: string; texto: string; quien: string; bloqueo?: string } {
  const { reg, ots, dec } = de(L, vasija);
  const ini = reg.find(x => x.tipo === 'analisis_inicial');
  if (!ini) return { clave: 'analisis_inicial', texto: 'Cargar el análisis inicial', quien: 'laboratorio' };
  const th2 = ots.find(o => o.tipo === 'th2'), noReq = dec.find(d => d.tipo === 'no_requiere_th2');
  if (!th2 && !noReq) return { clave: 'revision_tecnica', texto: 'Revisión técnica: aprobar OT de TH2 o registrar “No requiere corrección”', quien: 'técnico' };
  if (th2 && th2.estado !== 'ejecutada') return { clave: 'ejecutar_th2', texto: `Ejecutar la corrección TH2 (OT ${th2.numero})`, quien: 'operario', bloqueo: th2.estado === 'parcial' ? 'La OT de TH2 quedó parcial.' : undefined };
  if (th2 && !reg.some(x => x.fecha_muestra > (th2.ejecucion?.fecha_real ?? '9'))) return { clave: 'analisis_post', texto: 'Cargar el análisis posterior a la corrección', quien: 'laboratorio' };
  const siembra = ots.find(o => o.tipo === 'siembra');
  if (!siembra) return { clave: 'confirmar_ph', texto: 'Confirmar pH para siembra', quien: 'técnico' };
  if (siembra.estado !== 'ejecutada') return { clave: 'ejecutar_siembra', texto: `Ejecutar la siembra (OT ${siembra.numero})`, quien: 'operario', bloqueo: siembra.estado === 'parcial' ? 'La siembra quedó parcial: los nutrientes no se programan hasta completarla.' : undefined };
  const nut = ots.find(o => o.tipo === 'nutrientes');
  if (nut && nut.estado === 'borrador') return { clave: 'aprobar_nutrientes', texto: 'Aprobar la receta de nutrientes', quien: 'técnico', bloqueo: 'Faltan datos de la receta de nutrientes: la OT no se imprime incompleta.' };
  if (nut && nut.estado === 'programada') return { clave: 'esperar_nutrientes', texto: `Nutrientes programados para ${nut.programada_para}`, quien: 'sistema' };
  if (nut && !['ejecutada'].includes(nut.estado)) return { clave: 'ejecutar_nutrientes', texto: `Ejecutar nutrientes (OT ${nut.numero})`, quien: 'operario' };
  if (!dec.some(d => d.tipo === 'fin_fa')) return { clave: 'seguimiento_fa', texto: 'Seguimiento de FA hasta evaluar el fin de fermentación', quien: 'laboratorio' };
  const desc = ots.find(o => ['descube', 'desvinado'].includes(o.tipo));
  if (!desc) return { clave: 'descube', texto: 'Emitir OT de descube o desvinado', quien: 'técnico' };
  if (desc.estado !== 'ejecutada') return { clave: 'ejecutar_descube', texto: `Ejecutar ${ETIQUETA[desc.tipo].toLowerCase()} (OT ${desc.numero})`, quien: 'operario' };
  return { clave: 'crianza', texto: 'Crianza / FML cuando corresponda', quien: 'técnico' };
}

// ---------- idempotencia ----------
async function unaVez(env: Env, op: unknown, fn: () => Promise<Fila>): Promise<Response> {
  const k = txt(op, 80); if (!/^[0-9a-f-]{36}$/i.test(k)) throw new Regla(400, 'Falta el identificador de la operación.');
  const prev = await env.DB.prepare('SELECT respuesta FROM vend_operaciones WHERE op=?').bind(k).first<Fila>();
  if (prev) return r(200, { ...parse(prev.respuesta), repetida: true });
  const res = await fn();
  await env.DB.prepare('INSERT OR IGNORE INTO vend_operaciones(op,respuesta) VALUES(?,?)').bind(k, JSON.stringify(res)).run();
  return r(200, res);
}

async function crearOT(env: Env, o: { periodo_id: string; vasija: string; tipo: string; estado: string; datos: Fila; autor: string; aprobada?: boolean; origen_id?: string; programada_para?: string | null }) {
  const ot: Fila = { id: crypto.randomUUID(), numero: await nuevoNumero(env), version: 1, ...o, datos: JSON.stringify(o.datos), aprobada_por: o.aprobada ? o.autor : null, aprobada_en: o.aprobada ? ahora() : null, emitida_en: o.estado === 'emitida' ? ahora() : null };
  const st = [env.DB.prepare('INSERT INTO vend_ot(id,numero,periodo_id,vasija,tipo,estado,datos,version,origen_id,aprobada_por,aprobada_en,programada_para,emitida_en,autor) VALUES(?,?,?,?,?,?,?,1,?,?,?,?,?,?)')
    .bind(ot.id, ot.numero, ot.periodo_id, ot.vasija, ot.tipo, ot.estado, ot.datos, o.origen_id ?? null, ot.aprobada_por, ot.aprobada_en, o.programada_para ?? null, ot.emitida_en, o.autor), evento(env, ot, 'creada', { estado: ot.estado }, o.autor)];
  return { ot, st };
}

// ---------- rutas ----------
export async function rutasFlujo(req: Request, env: Env, ctx: ExecutionContext, sub: string): Promise<Response | null> {
  const m = /^\/(lote|ot|mis-ordenes|registros|tecnico|permisos|impresoras|impresion|criterios)(?:\/([0-9a-f-]{36}))?(?:\/([a-z0-9-]+))?$/i.exec(sub);
  if (!m) return null;
  const [, ruta, rid, accion] = m;
  const id = await identidad(req, env, ctx, 'vendimia');
  const P = await permisos(env, id);
  if (!P.leer) return r(403, { error: 'Tu usuario no tiene acceso a Vendimia.' });
  const yo = id!.email, url = new URL(req.url);
  try {
    ctx.waitUntil(emitirVencidas(env).catch(e => console.error('agenda', e)));
    if (req.method === 'GET') {
      if (ruta === 'criterios') return r(200, { criterio: await criterio(env), permisos: P });
      if (ruta === 'lote' && rid) {
        await emitirVencidas(env);
        const L = await cargarLote(env, rid), c = await criterio(env);
        const vas = vasijasDe(L).map(v => {
          const { reg } = de(L, v), ini = reg.find(x => x.tipo === 'analisis_inicial'), ult = [...reg].reverse().find(x => num(datosDe(x).ph) !== null);
          const ultAz = [...reg].reverse().find(x => num(datosDe(x).az_red) !== null);
          return { vasija: v, proxima: proximaAccion(L, v), ph: evaluarPh(c, L.info.variedad || L.ing.variedad, 'mosto', ult ? num(datosDe(ult).ph) : null, !!L.info.natural), ph_registro: ult?.id ?? null, inicial: ini ? ini.id : null, fin_fa: evaluarFinFA(c, ultAz ? num(datosDe(ultAz).az_red) : null), fin_fa_registro: ultAz?.id ?? null };
        });
        const faltan = ['lote_sistema', 'variedad', 'distrito', 'proyecto', 'vinedo', 'ct', 'clon', 'id_texto', 'organico_convencional', 'origen'].filter(k => !txt(L.info[k]));
        return r(200, { ...L, vasijas: vas, faltan, criterio: c, permisos: P, ahora: ahora() });
      }
      if (ruta === 'ot' && rid) {
        const ot = await env.DB.prepare('SELECT * FROM vend_ot WHERE id=?').bind(rid).first<Fila>();
        if (!ot) return r(404, { error: 'No se encontró la OT.' });
        const [ev, tr] = await env.DB.batch([env.DB.prepare('SELECT * FROM vend_ot_eventos WHERE ot_id=? ORDER BY id').bind(rid), env.DB.prepare('SELECT id,estado,version,reimpresion,error,creado,actualizado FROM impresion_trabajos WHERE ot_id=? ORDER BY creado').bind(rid)]);
        if (accion === 'documento') { const ing = await env.DB.prepare('SELECT * FROM vend_ingresos WHERE periodo_id=?').bind(ot.periodo_id).first<Fila>(); return new Response(documentoOT(ot, ing ?? {}, !!parse(ing?.informacion_id).demo), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } }); }
        return r(200, { ot: { ...ot, datos: parse(ot.datos), ejecucion: parse(ot.ejecucion, null) }, eventos: ev.results, trabajos: tr.results });
      }
      if (ruta === 'mis-ordenes') {
        await emitirVencidas(env);
        const { results } = await env.DB.prepare("SELECT o.*, i.lote, i.informacion_id FROM vend_ot o JOIN vend_ingresos i ON i.periodo_id=o.periodo_id WHERE o.estado IN ('emitida','en_ejecucion','parcial','programada','borrador') ORDER BY CASE o.estado WHEN 'en_ejecucion' THEN 0 WHEN 'emitida' THEN 1 WHEN 'parcial' THEN 2 ELSE 3 END, COALESCE(o.programada_para,o.creado)").all<Fila>();
        return r(200, { ordenes: results.map(o => { const info = parse(o.informacion_id); return { ...o, informacion_id: undefined, datos: parse(o.datos), variedad: info.variedad || '', demo: !!info.demo }; }), permisos: P });
      }
      if (ruta === 'permisos' && P.admin) {
        const { results } = await env.DB.prepare("SELECT u.email, u.nombre, p.rol, COALESCE(v.tecnico,0) tecnico, COALESCE(v.operario,0) operario FROM usuarios u LEFT JOIN perfiles p ON p.email=u.email AND p.modulo='vendimia' LEFT JOIN vend_permisos v ON v.email=u.email WHERE u.activo=1 ORDER BY u.email").all();
        return r(200, { usuarios: results });
      }
      if (ruta === 'impresoras' && P.admin) return r(200, { impresoras: (await env.DB.prepare('SELECT * FROM impresoras ORDER BY nombre').all()).results, agente: !!(env as any).IMPRESION_TOKEN });
      if (ruta === 'impresion') return r(200, { trabajos: (await env.DB.prepare('SELECT id,ot_id,numero,version,estado,reimpresion,intentos,error,creado,actualizado,impresora_id FROM impresion_trabajos ORDER BY creado DESC LIMIT 200').all()).results });
      return r(404, { error: 'ruta_no_encontrada' });
    }
    if (req.method !== 'POST') return r(404, { error: 'ruta_no_encontrada' });
    if (req.headers.get('Origin') !== url.origin) return r(403, { error: 'origen_invalido' });
    const b = await req.json().catch(() => null);
    if (!esObj(b)) return r(400, { error: 'Datos inválidos.' });
    const tecnico = () => { if (!P.tecnico) throw new Regla(403, 'Esta acción la hace un técnico. Pedí el permiso a un administrador.'); };
    const operario = () => { if (!P.operario) throw new Regla(403, 'Tu usuario no puede ejecutar órdenes.'); };
    const escribe = () => { if (!P.escribir && !P.operario) throw new Regla(403, 'Tu usuario puede consultar, pero no cargar datos.'); };
    const lote = async (pid: unknown) => { const L = await cargarLote(env, txt(pid, 40)); if (L.ing.estado === 'finalizado' && !P.admin) throw new Regla(403, 'El lote está finalizado.'); return L; };

    // --- administración ---
    if (ruta === 'permisos') {
      if (!P.admin) throw new Regla(403, 'Solo un administrador asigna permisos.');
      const email = txt(b.email, 120); if (!email) throw new Regla(400, 'Falta el usuario.');
      await env.DB.prepare("INSERT INTO vend_permisos(email,tecnico,operario,autor) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET tecnico=excluded.tecnico,operario=excluded.operario,autor=excluded.autor,actualizado=datetime('now')").bind(email, b.tecnico ? 1 : 0, b.operario ? 1 : 0, yo).run();
      return r(200, { ok: true });
    }
    if (ruta === 'impresoras') {
      if (!P.admin) throw new Regla(403, 'Solo un administrador configura impresoras.');
      const ip = txt(b.ip, 60); if (!txt(b.nombre, 80) || !/^(\d{1,3}\.){3}\d{1,3}$|^[a-z0-9.-]+$/i.test(ip)) throw new Regla(400, 'Completá nombre e IP válidos.');
      const proto = b.protocolo === 'ipp' ? 'ipp' : 'raw9100', puerto = Number(b.puerto) || (proto === 'ipp' ? 631 : 9100);
      const iid = rid || crypto.randomUUID();
      await env.DB.prepare("INSERT INTO impresoras(id,nombre,ip,protocolo,puerto,papel,copias,automatico,activa,autor) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre,ip=excluded.ip,protocolo=excluded.protocolo,puerto=excluded.puerto,papel=excluded.papel,copias=excluded.copias,automatico=excluded.automatico,activa=excluded.activa,autor=excluded.autor,actualizado=datetime('now')")
        .bind(iid, txt(b.nombre, 80), ip, proto, puerto, txt(b.papel, 10) || 'A4', Math.min(10, Math.max(1, Number(b.copias) || 1)), b.automatico ? 1 : 0, b.activa ? 1 : 0, yo).run();
      return r(200, { id: iid });
    }
    if (ruta === 'impresion' && rid && accion === 'confirmar') {
      escribe();
      const u = await env.DB.prepare("UPDATE impresion_trabajos SET estado='confirmado', actualizado=datetime('now') WHERE id=? AND estado IN ('enviado','en_cola','tomado')").bind(rid).run();
      if (u.meta.changes !== 1) throw new Regla(409, 'Ese trabajo no está pendiente de confirmación.');
      return r(200, { ok: true });
    }
    if (ruta === 'lote' && rid && accion === 'demo') {
      if (!P.admin) throw new Regla(403, 'Solo un administrador marca un lote como demostración.');
      const ing = await env.DB.prepare('SELECT informacion_id FROM vend_ingresos WHERE periodo_id=?').bind(rid).first<Fila>(); if (!ing) throw new Regla(404, 'No se encontró el lote.');
      const info = parse(ing.informacion_id); info.demo = !!b.demo;
      await env.DB.prepare('UPDATE vend_ingresos SET informacion_id=?, version=version+1 WHERE periodo_id=?').bind(JSON.stringify(info), rid).run();
      return r(200, { ok: true });
    }

    // --- registros (análisis inicial, post corrección, control, fin FA) ---
    if (ruta === 'registros' && !rid) {
      escribe();
      return await unaVez(env, b.op, async () => {
        const L = await lote(b.periodo_id), vasija = txt(b.vasija, 80), tipo = txt(b.tipo, 30), f = fechaHora(b.fecha_muestra);
        if (!vasija) throw new Regla(400, 'Indicá la vasija.');
        if (!['analisis_inicial', 'post_correccion', 'control', 'fin_fa'].includes(tipo)) throw new Regla(400, 'Tipo de registro inválido.');
        if (!f || Date.parse(f) > Date.now() + 10 * 60000) throw new Regla(400, 'Indicá una fecha y hora de muestreo válida (no futura).');
        const d = esObj(b.datos) ? b.datos : {}, datos: Fila = {};
        for (const [k, v] of Object.entries(d)) { if (!/^[a-z0-9_]{1,30}$/.test(k)) continue; const n = num(v); datos[k] = typeof v === 'number' || (typeof v === 'string' && n !== null && /^-?[\d.,]+$/.test(v.trim())) ? n : txt(v, 300); }
        for (const k of ['ph', 'brix', 'temperatura', 'az_red', 'at', 'nfa', 'kg_recibidos', 'kg_procesados', 'merma']) if (datos[k] !== undefined && datos[k] !== '' && typeof datos[k] !== 'number') throw new Regla(400, `El valor de ${k} tiene que ser numérico.`);
        if (typeof datos.ph === 'number' && (datos.ph < 2 || datos.ph > 5)) throw new Regla(400, 'El pH tiene que estar entre 2 y 5. Revisá el dato.');
        if (tipo === 'analisis_inicial' && de(L, vasija).reg.some(x => x.tipo === 'analisis_inicial')) throw new Regla(409, 'Esta vasija ya tiene análisis inicial. Corregilo en lugar de cargar otro.');
        const rid2 = crypto.randomUUID();
        const ins = env.DB.prepare('INSERT INTO vend_registros(id,periodo_id,vasija,tipo,fecha_muestra,datos,responsable,observaciones,op,autor) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(rid2, L.ing.periodo_id, vasija, tipo, f, JSON.stringify(datos), txt(b.responsable, 120) || yo, txt(b.observaciones, 2000), txt(b.op, 80), yo);
        // La fecha de recepción sale del análisis inicial si todavía no estaba (fecha de Mendoza). Nunca pisa una existente.
        const recep = env.DB.prepare("UPDATE vend_ingresos SET recepcion=?, version=version+1, actualizado=datetime('now') WHERE periodo_id=? AND recepcion=''").bind(new Date(Date.parse(f) - 3 * 3600000).toISOString().slice(0, 10), L.ing.periodo_id);
        await env.DB.batch(tipo === 'analisis_inicial' ? [ins, recep] : [ins]);
        return { id: rid2 };
      });
    }
    if (ruta === 'registros' && rid && accion === 'corregir') {
      escribe();
      const x = await env.DB.prepare('SELECT * FROM vend_registros WHERE id=?').bind(rid).first<Fila>(); if (!x) throw new Regla(404, 'No se encontró el registro.');
      await lote(x.periodo_id);
      if (Number(b.version) !== x.version) throw new Regla(409, 'Otra persona corrigió este registro. Se recargan los datos.');
      const nuevo = { ...parse(x.datos) }; for (const [k, v] of Object.entries(esObj(b.datos) ? b.datos : {})) if (/^[a-z0-9_]{1,30}$/.test(k)) nuevo[k] = num(v) ?? txt(v, 300);
      const res = await env.DB.batch([
        env.DB.prepare('INSERT INTO vend_registros_cambios(registro_id,version,datos_antes,autor) VALUES(?,?,?,?)').bind(rid, x.version, JSON.stringify({ datos: parse(x.datos), fecha_muestra: x.fecha_muestra, motivo: txt(b.motivo, 500) }), yo),
        env.DB.prepare('UPDATE vend_registros SET datos=?, fecha_muestra=COALESCE(?,fecha_muestra), version=version+1, anulado=? WHERE id=? AND version=?').bind(JSON.stringify(nuevo), fechaHora(b.fecha_muestra), b.anular ? 1 : 0, rid, x.version),
      ]);
      if (res[1].meta.changes !== 1) throw new Regla(409, 'Otra persona corrigió este registro.');
      return r(200, { version: x.version + 1 });
    }

    // --- revisión técnica ---
    if (ruta === 'tecnico') {
      tecnico();
      return await unaVez(env, b.op, async () => {
        const L = await lote(b.periodo_id), vasija = txt(b.vasija, 80), V = de(L, vasija), c = await criterio(env);
        if (!vasija) throw new Regla(400, 'Indicá la vasija.');
        const ini = V.reg.find(x => x.tipo === 'analisis_inicial');
        if (accion === 'no-requiere' || accion === 'th2') {
          if (!ini) throw new Regla(409, 'Falta el análisis inicial de esta vasija.');
          const di = datosDe(ini);
          if ((num(di.kg_recibidos) ?? num(di.kg_procesados)) === null || num(di.merma) === null) throw new Regla(409, 'Antes de decidir, revisá los kilos y la merma: faltan en el análisis inicial.');
          if (b.revisado !== true) throw new Regla(400, 'Confirmá que revisaste kilos, mermas y análisis.');
          if (V.ots.some(o => o.tipo === 'th2') || V.dec.some(d => d.tipo === 'no_requiere_th2')) throw new Regla(409, 'Esta vasija ya tiene la revisión técnica registrada.');
          const ev = evaluarPh(c, L.info.variedad || L.ing.variedad, 'mosto', num(di.ph), !!L.info.natural);
          if (accion === 'no-requiere') {
            if (!txt(b.motivo)) throw new Regla(400, 'Indicá el motivo por el que no requiere corrección.');
            const did = crypto.randomUUID();
            await env.DB.prepare('INSERT INTO vend_decisiones(id,periodo_id,vasija,tipo,registro_id,criterio_version,resultado,motivo,autor) VALUES(?,?,?,?,?,?,?,?,?)').bind(did, L.ing.periodo_id, vasija, 'no_requiere_th2', ini.id, c?.version ?? null, JSON.stringify(ev), txt(b.motivo, 1000), yo).run();
            return { id: did };
          }
          const d = esObj(b.datos) ? b.datos : {}, datos = Object.fromEntries([...RECETA, 'base_calculo'].map(k => [k, txt(d[k], 1000)]));
          datos.producto ||= 'Ácido tartárico (TH2)';
          const f = faltantesReceta(datos); if (f.length || !datos.base_calculo) throw new Regla(400, 'Completá la OT de TH2: ' + [...f, ...(datos.base_calculo ? [] : ['base_calculo'])].join(', ') + '. La cantidad sale de la fórmula o ensayo aprobado, no del pH solo.');
          const { ot, st } = await crearOT(env, { periodo_id: L.ing.periodo_id, vasija, tipo: 'th2', estado: 'emitida', datos: { ...datos, evaluacion_ph: ev }, autor: yo, aprobada: true });
          await env.DB.batch([...st, ...(await encolar(env, ot, yo))]);
          return { id: ot.id, numero: ot.numero };
        }
        if (accion === 'confirmar-ph') {
          const reg = V.reg.find(x => x.id === txt(b.registro_id, 40));
          const falta: string[] = [];
          if (!reg) falta.push('Elegí la medición de pH de esta vasija.');
          const ph = reg ? num(datosDe(reg).ph) : null;
          const ev = evaluarPh(c, L.info.variedad || L.ing.variedad, 'mosto', ph, !!L.info.natural);
          if (reg && ev.estado !== 'verde') falta.push(ev.estado === 'rojo' ? `pH fuera de criterio: ${ev.texto}.` : `${ev.texto}.`);
          const th2 = V.ots.find(o => o.tipo === 'th2'), noReq = V.dec.find(d => d.tipo === 'no_requiere_th2');
          if (!th2 && !noReq) falta.push('Falta la revisión técnica (OT de TH2 o “No requiere corrección”).');
          if (th2 && th2.estado !== 'ejecutada') falta.push(`La OT de TH2 ${th2.numero} todavía no está ejecutada por completo.`);
          if (th2 && th2.estado === 'ejecutada' && reg && reg.fecha_muestra <= th2.ejecucion?.fecha_real) falta.push('Usá un análisis tomado después de ejecutar la corrección.');
          if (V.ots.some(o => o.tipo === 'siembra')) falta.push('Esta vasija ya tiene OT de siembra.');
          const receta = Object.fromEntries(RECETA.map(k => [k, txt((esObj(b.receta) ? b.receta : {})[k], 1000)]));
          const fr = faltantesReceta(receta); if (fr.length) falta.push('Completá la receta de siembra: ' + fr.join(', ') + '.');
          if (falta.length) throw new Regla(409, 'No se puede liberar la siembra todavía.', { falta });
          const did = crypto.randomUUID();
          const s = await crearOT(env, { periodo_id: L.ing.periodo_id, vasija, tipo: 'siembra', estado: 'emitida', datos: { ...receta, confirmacion_ph: { registro_id: reg!.id, fecha: reg!.fecha_muestra, ph, ...ev } }, autor: yo, aprobada: true });
          const rn = Object.fromEntries(RECETA.map(k => [k, txt((esObj(b.receta_nutrientes) ? b.receta_nutrientes : {})[k], 1000)]));
          const nOk = faltantesReceta(rn).length === 0;
          const n = await crearOT(env, { periodo_id: L.ing.periodo_id, vasija, tipo: 'nutrientes', estado: nOk ? 'aprobada' : 'borrador', datos: rn, autor: yo, aprobada: nOk, origen_id: s.ot.id });
          await env.DB.batch([
            env.DB.prepare('INSERT INTO vend_decisiones(id,periodo_id,vasija,tipo,registro_id,criterio_version,resultado,autor) VALUES(?,?,?,?,?,?,?,?)').bind(did, L.ing.periodo_id, vasija, 'confirmar_ph', reg!.id, c?.version ?? null, JSON.stringify(ev), yo),
            ...s.st, ...n.st, ...(await encolar(env, s.ot, yo)),
          ]);
          return { siembra: s.ot.numero, siembra_id: s.ot.id, nutrientes: n.ot.numero, nutrientes_estado: n.ot.estado };
        }
        if (accion === 'fin-fa') {
          const reg = V.reg.find(x => x.id === txt(b.registro_id, 40));
          if (!reg) throw new Regla(409, 'Pendiente de análisis: elegí un análisis de azúcares reductores de esta vasija.');
          const ev = evaluarFinFA(c, num(datosDe(reg).az_red));
          if (ev.estado !== 'verde') throw new Regla(409, ev.texto, { evaluacion: ev });
          if (V.dec.some(d => d.tipo === 'fin_fa')) throw new Regla(409, 'El fin de FA de esta vasija ya está confirmado.');
          const did = crypto.randomUUID();
          await env.DB.prepare('INSERT INTO vend_decisiones(id,periodo_id,vasija,tipo,registro_id,criterio_version,resultado,motivo,autor) VALUES(?,?,?,?,?,?,?,?,?)').bind(did, L.ing.periodo_id, vasija, 'fin_fa', reg.id, c?.version ?? null, JSON.stringify(ev), txt(b.motivo, 1000), yo).run();
          return { id: did };
        }
        if (accion === 'ot') {
          // Movimientos, descube/desvinado y agregados planificados.
          const tipo = txt(b.tipo, 20); if (!['movimiento', 'descube', 'desvinado', 'agregado'].includes(tipo)) throw new Regla(400, 'Tipo de OT inválido.');
          if (['descube', 'desvinado'].includes(tipo) && !V.dec.some(d => d.tipo === 'fin_fa')) throw new Regla(409, 'Primero confirmá técnicamente el fin de FA de esta vasija.');
          const d = esObj(b.datos) ? b.datos : {}, datos: Fila = Object.fromEntries(['producto', 'dosis', 'unidad_dosis', 'cantidad', 'unidad', 'instrucciones', 'responsable', 'origen', 'destino', 'tipo_mov', 'lote_insumo', 'tipo_vinificacion'].map(k => [k, txt(d[k], 1000)]));
          datos.total = !!d.total;
          if (tipo !== 'agregado') { datos.origen ||= vasija; if (!datos.destino) throw new Regla(400, 'Indicá la vasija de destino.'); }
          if (!datos.instrucciones || !datos.responsable) throw new Regla(400, 'Completá instrucciones y responsable.');
          if (tipo === 'agregado' && faltantesReceta(datos).length) throw new Regla(400, 'Completá el agregado: ' + faltantesReceta(datos).join(', '));
          const { ot, st } = await crearOT(env, { periodo_id: L.ing.periodo_id, vasija, tipo, estado: 'emitida', datos, autor: yo, aprobada: true });
          const extra = tipo === 'agregado' ? [] : [env.DB.prepare('INSERT INTO vend_movs(id,periodo_id,ot_id,fecha,origen,destino,tipo,total,cantidad,unidad,responsable,observaciones,autor) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), L.ing.periodo_id, ot.id, fechaHora(d.fecha) ?? ahora(), datos.origen, datos.destino, tipo === 'movimiento' ? (datos.tipo_mov || 'trasiego') : tipo, datos.total ? 1 : 0, num(datos.cantidad), datos.unidad || 'L', datos.responsable, datos.instrucciones, yo)];
          await env.DB.batch([...st, ...extra, ...(await encolar(env, ot, yo))]);
          return { id: ot.id, numero: ot.numero };
        }
        throw new Regla(404, 'Acción desconocida.');
      });
    }

    // --- acciones sobre una OT ---
    if (ruta === 'ot' && rid && accion) {
      const ot = await env.DB.prepare('SELECT * FROM vend_ot WHERE id=?').bind(rid).first<Fila>(); if (!ot) throw new Regla(404, 'No se encontró la OT.');
      await lote(ot.periodo_id);
      const cas = async (sets: string, vals: unknown[], estados: string[], extra: D1PreparedStatement[]) => {
        const res = await env.DB.batch([env.DB.prepare(`UPDATE vend_ot SET ${sets}, actualizado=datetime('now') WHERE id=? AND estado IN (${estados.map(() => '?').join(',')})`).bind(...vals, rid, ...estados), ...extra]);
        if (res[0].meta.changes !== 1) throw new Regla(409, 'La orden cambió de estado mientras tanto. Se recargan los datos.');
      };
      if (accion === 'iniciar') { operario(); return await unaVez(env, b.op, async () => { await cas("estado='en_ejecucion'", [], ['emitida', 'parcial'], [evento(env, ot, 'inicio', {}, yo)]); return { ok: true }; }); }
      if (accion === 'incidencia') { operario(); return await unaVez(env, b.op, async () => { if (!txt(b.texto)) throw new Regla(400, 'Describí la incidencia.'); await evento(env, ot, 'incidencia', { texto: txt(b.texto, 2000) }, yo).run(); return { ok: true }; }); }
      if (accion === 'reimprimir') { escribe(); return await unaVez(env, b.op, async () => { if (['borrador', 'programada', 'cancelada'].includes(ot.estado)) throw new Regla(409, 'Esta OT todavía no está emitida.'); await env.DB.batch(await encolar(env, ot, yo, true)); return { ok: true }; }); }
      if (accion === 'ejecutar') {
        operario();
        return await unaVez(env, b.op, async () => {
          if (!['emitida', 'en_ejecucion', 'parcial'].includes(ot.estado)) throw new Regla(409, ot.estado === 'ejecutada' ? 'Esta orden ya está ejecutada.' : 'Esta orden no está lista para ejecutarse.');
          const f = fechaHora(b.fecha_real); if (!f || Date.parse(f) > Date.now() + 10 * 60000) throw new Regla(400, 'Indicá la fecha y hora real de ejecución (no futura).');
          const completa = b.completa === true, ej = { ejecutor: yo, fecha_real: f, registrado: ahora(), producto: txt(b.producto, 300), cantidad: num(b.cantidad), unidad: txt(b.unidad, 20), lote_insumo: txt(b.lote_insumo, 120), vasija: txt(b.vasija, 80) || ot.vasija, observaciones: txt(b.observaciones, 2000), completa };
          if (['th2', 'siembra', 'nutrientes', 'agregado'].includes(ot.tipo) && (!ej.producto || ej.cantidad === null)) throw new Regla(400, 'Indicá el producto y la cantidad efectivamente utilizados.');
          const extra: D1PreparedStatement[] = [evento(env, ot, completa ? 'ejecutada' : 'parcial', ej, yo)];
          if (completa && ['movimiento', 'descube', 'desvinado'].includes(ot.tipo)) extra.push(env.DB.prepare("UPDATE vend_movs SET estado='ejecutado', ejecutado_por=?, ejecutado_en=?, cantidad_real=? WHERE ot_id=? AND estado='solicitado'").bind(yo, f, ej.cantidad, ot.id));
          if (completa && ot.tipo === 'siembra') {
            // +24 h desde la ejecución REAL de la siembra (no desde creación, aprobación ni impresión).
            const prog = new Date(Date.parse(f) + 24 * 3600000).toISOString();
            extra.push(env.DB.prepare("UPDATE vend_ot SET programada_para=?, estado=CASE estado WHEN 'aprobada' THEN 'programada' ELSE estado END, actualizado=datetime('now') WHERE origen_id=? AND tipo='nutrientes' AND estado IN ('aprobada','borrador')").bind(prog, ot.id));
          }
          await cas('estado=?, ejecucion=?', [completa ? 'ejecutada' : 'parcial', JSON.stringify(ej)], ['emitida', 'en_ejecucion', 'parcial'], extra);
          if (completa && ot.tipo === 'siembra') await emitirVencidas(env);
          return { estado: completa ? 'ejecutada' : 'parcial' };
        });
      }
      tecnico();
      if (accion === 'aprobar' || accion === 'editar') {
        if (Number(b.version) !== ot.version) throw new Regla(409, 'La OT cambió. Se recargan los datos.');
        if (['ejecutada', 'cancelada'].includes(ot.estado)) throw new Regla(409, 'Una OT ejecutada o cancelada no se modifica.');
        if (!txt(b.motivo) && accion === 'editar') throw new Regla(400, 'Indicá el motivo del cambio: queda registrado.');
        const d = esObj(b.datos) ? b.datos : {}, datos = { ...parse(ot.datos), ...Object.fromEntries(Object.entries(d).filter(([k]) => /^[a-z_]{1,30}$/.test(k)).map(([k, v]) => [k, txt(v, 1000)])) };
        if (['th2', 'siembra', 'nutrientes', 'agregado'].includes(ot.tipo) && faltantesReceta(datos).length) throw new Regla(400, 'Faltan datos: ' + faltantesReceta(datos).join(', ') + '. No se aprueba una orden incompleta.');
        const nueva = { ...ot, version: ot.version + 1, datos: JSON.stringify(datos) };
        let estado = ot.estado;
        if (ot.estado === 'borrador') estado = ot.programada_para ? 'programada' : 'aprobada';
        const reimp = ['emitida', 'en_ejecucion', 'parcial'].includes(ot.estado) ? await encolar(env, { ...nueva, estado }, yo, true) : [];
        await cas('datos=?, version=version+1, estado=?, aprobada_por=?, aprobada_en=?', [nueva.datos, estado, yo, ahora()], [ot.estado], [evento(env, nueva, accion === 'aprobar' ? 'aprobada' : 'modificada', { antes: parse(ot.datos), motivo: txt(b.motivo, 1000) }, yo), ...reimp]);
        await emitirVencidas(env);
        return r(200, { version: nueva.version, estado });
      }
      if (accion === 'cancelar') {
        if (!txt(b.motivo)) throw new Regla(400, 'Indicá el motivo de la cancelación.');
        await cas("estado='cancelada'", [], ['borrador', 'aprobada', 'programada', 'emitida', 'en_ejecucion', 'parcial'], [evento(env, ot, 'cancelada', { motivo: txt(b.motivo, 1000) }, yo), env.DB.prepare("UPDATE vend_movs SET estado='cancelado' WHERE ot_id=? AND estado='solicitado'").bind(rid), env.DB.prepare("UPDATE impresion_trabajos SET estado='cancelado' WHERE ot_id=? AND estado='en_cola'").bind(rid)]);
        return r(200, { ok: true });
      }
      if (accion === 'corregir-ejecucion') {
        if (ot.estado !== 'ejecutada') throw new Regla(409, 'Solo se corrige la ejecución de una OT ejecutada.');
        const f = fechaHora(b.fecha_real); if (!f || !txt(b.motivo)) throw new Regla(400, 'Indicá la nueva fecha y hora real y el motivo.');
        const ej = { ...parse(ot.ejecucion), fecha_real: f };
        const extra: D1PreparedStatement[] = [evento(env, ot, 'ejecucion_corregida', { antes: parse(ot.ejecucion).fecha_real, despues: f, motivo: txt(b.motivo, 1000) }, yo)];
        if (ot.tipo === 'siembra') {
          const nut = await env.DB.prepare("SELECT * FROM vend_ot WHERE origen_id=? AND tipo='nutrientes'").bind(rid).first<Fila>();
          if (nut && ['programada', 'borrador'].includes(nut.estado)) extra.push(env.DB.prepare('UPDATE vend_ot SET programada_para=? WHERE id=?').bind(new Date(Date.parse(f) + 24 * 3600000).toISOString(), nut.id), evento(env, nut, 'reprogramada', { por: 'corrección de la siembra' }, yo));
          else if (nut) extra.push(evento(env, nut, 'aviso_siembra_corregida', { nota: 'La OT de nutrientes ya estaba emitida; revisar manualmente.' }, yo));
        }
        await cas('ejecucion=?', [JSON.stringify(ej)], ['ejecutada'], extra);
        await emitirVencidas(env);
        return r(200, { ok: true });
      }
    }
    return r(404, { error: 'ruta_no_encontrada' });
  } catch (e) {
    if (e instanceof Regla) return r(e.status, { error: e.message, ...e.extra });
    console.error('vendimia flujo', e);
    return r(503, { error: 'No se pudo completar la operación. No se perdió nada: reintentá.' });
  }
}

// ---------- agente local de impresión (sin sesión, con token) ----------
export async function rutasAgente(req: Request, env: Env, sub: string): Promise<Response> {
  const token = (env as any).IMPRESION_TOKEN as string | undefined;
  if (!token) return r(503, { error: 'Impresión automática sin configurar (falta el secreto IMPRESION_TOKEN).' });
  const dado = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const a = new TextEncoder().encode(dado), b = new TextEncoder().encode(token);
  if (a.length !== b.length || !crypto.subtle.timingSafeEqual(a, b)) return r(401, { error: 'token_invalido' });
  if (req.method !== 'POST') return r(404, { error: 'ruta_no_encontrada' });
  if (sub === '/tomar') {
    // Toma el trabajo más viejo; si un agente lo tomó y no respondió en 2 min, se reintenta.
    const t = await env.DB.prepare("SELECT t.*, i.ip, i.protocolo, i.puerto, i.copias, i.papel FROM impresion_trabajos t JOIN impresoras i ON i.id=t.impresora_id AND i.activa=1 WHERE (t.estado='en_cola' OR (t.estado='tomado' AND t.tomado_hasta<?) OR (t.estado='error' AND t.intentos<5)) ORDER BY t.creado LIMIT 1").bind(ahora()).first<Fila>();
    if (!t) return r(200, { trabajo: null });
    const u = await env.DB.prepare("UPDATE impresion_trabajos SET estado='tomado', tomado_hasta=?, intentos=intentos+1, actualizado=datetime('now') WHERE id=? AND estado=?").bind(new Date(Date.now() + 120000).toISOString(), t.id, t.estado).run();
    if (u.meta.changes !== 1) return r(200, { trabajo: null });
    return r(200, { trabajo: { id: t.id, numero: t.numero, version: t.version, documento: t.documento, impresora: { ip: t.ip, protocolo: t.protocolo, puerto: t.puerto, copias: t.copias, papel: t.papel } } });
  }
  const m = /^\/([0-9a-f-]{36})\/resultado$/.exec(sub);
  if (m) {
    const b = await req.json().catch(() => ({})) as Fila;
    const u = await env.DB.prepare("UPDATE impresion_trabajos SET estado=?, error=?, actualizado=datetime('now') WHERE id=? AND estado='tomado'").bind(b.ok ? 'enviado' : 'error', txt(b.error, 500), m[1]).run();
    return r(u.meta.changes === 1 ? 200 : 409, { ok: u.meta.changes === 1 });
  }
  return r(404, { error: 'ruta_no_encontrada' });
}
