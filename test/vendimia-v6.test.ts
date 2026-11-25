import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { extraerHechos } from '../src/vendimia/v6';
import { PLANTILLAS } from '../src/vendimia/plantillas-data';

let cookie = '';
async function pedir(path: string, body?: unknown) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request('https://ciw.example/vendimia/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'https://ciw.example' }, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  await waitOnExecutionContext(ctx);
  return { status: res.status, body: await res.json<any>() };
}
type Snap = { sheets: { name: string; celldata: { r: number; c: number; v: Record<string, unknown> }[] }[] };
const plantilla = (id: string) => structuredClone(PLANTILLAS.find(p => p.id === id)!.snapshot) as Snap;
const poner = (s: Snap, hoja: number, r: number, c: number, v: unknown) => { const cs = s.sheets[hoja].celldata; const x = cs.find(x => x.r === r && x.c === c); if (x) x.v = { v }; else cs.push({ r, c, v: { v } }); };
const campos = { lote_sistema: '7287', variedad: 'Malbec', distrito: 'Gualtallary', proyecto: 'P1', vinedo: 'Adrianna', ct: 'T1', clon: 'SL', id_texto: 'MB Adrianna', organico_convencional: 'Orgánico', origen: 'Uva' };
const anio = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Mendoza', year: 'numeric' }).format(new Date()));
const aa = String(anio).slice(-2);

beforeAll(async () => {
  const ctx = createExecutionContext();
  const login = await worker.fetch(new Request('https://ciw.example/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'admin', password: '1234' }) }), env, ctx);
  cookie = (login.headers.get('Set-Cookie') || '').split(';')[0];
  await worker.fetch(new Request('https://ciw.example/api/auth/cambiar-clave', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ actual: '1234', nueva: 'prueba-v6-2026' }) }), env, ctx);
  await env.DB.prepare("INSERT OR IGNORE INTO perfiles(email,modulo,rol) SELECT email,'lotes','admin' FROM usuarios").run();
});

describe('Vendimia V6: precarga e Información ID', () => {
  it('informa maestro vacío y propone AA001', async () => {
    const r = await pedir('/identificacion');
    expect(r.status).toBe(200);
    expect(r.body.maestroVacio).toBe(true);
    expect(r.body.siguiente).toBe(aa + '001');
  });
  it('valida cinco dígitos y opciones cerradas', async () => {
    expect((await pedir('/precargas', { lote: '2601', campos })).status).toBe(400);
    expect((await pedir('/precargas', { lote: aa + '000', campos })).status).toBe(400);
    expect((await pedir('/precargas', { lote: aa + '009', campos: { ...campos, origen: 'Mosto' } })).status).toBe(400);
  });
  it('crea borrador con 12 planillas, evita duplicados y controla concurrencia', async () => {
    const a = await pedir('/precargas', { lote: aa + '001', campos: { variedad: 'Malbec' }, nuevo: true });
    expect(a.status).toBe(201);
    expect((await pedir('/precargas', { lote: aa + '001', campos, nuevo: true })).status).toBe(409);
    const libros = await env.DB.prepare('SELECT count(*) n FROM vend_libros WHERE periodo_id=?').bind(a.body.periodo_id).first<{ n: number }>();
    expect(libros!.n).toBe(12);
    const [x, y] = await Promise.all([pedir('/precargas', { lote: aa + '002', campos, nuevo: true }), pedir('/precargas', { lote: aa + '002', campos, nuevo: true })]);
    expect([x.status, y.status].sort()).toEqual([201, 409]);
    expect((await pedir('/siguiente?anio=' + anio)).body.lote).toBe(aa + '003');
  });
  it('confirmar da de alta en Lotes con los 11 campos, historial y auditoría', async () => {
    const a = await pedir('/precargas', { lote: aa + '010', campos, nuevo: true });
    const c = await pedir('/precargas/' + a.body.periodo_id, { lote: aa + '010', campos, version: 0, confirmar: true });
    expect(c.status).toBe(200);
    expect(c.body.lotes).toBe('creado');
    const doc = JSON.parse((await env.DB.prepare("SELECT json FROM documento WHERE modulo='lotes'").first<{ json: string }>())!.json);
    expect(doc.lotes.find((l: any) => String(l.lote) === aa + '010')).toMatchObject({ ...campos, lote: Number(aa + '010') });
    expect(await env.DB.prepare("SELECT 1 FROM historial WHERE modulo='lotes' AND resumen LIKE ?").bind('%' + aa + '010%').first()).toBeTruthy();
    // versión vieja: no pisa
    expect((await pedir('/precargas/' + a.body.periodo_id, { lote: aa + '010', campos, version: 0 })).status).toBe(409);
    // recupera desde Lotes y corrige
    const id = await pedir('/identificacion');
    expect(id.body.lotes.find((l: any) => l.lote === aa + '010')).toMatchObject(campos);
    expect(id.body.catalogos.variedad).toContain('Malbec');
    const d = await pedir('/precargas/' + a.body.periodo_id, { lote: aa + '010', campos: { ...campos, clon: '337' }, version: 1, confirmar: true });
    expect(d.body.lotes).toBe('actualizado');
    // un lote existente en Lotes no se toma como nuevo
    const e = await pedir('/precargas', { lote: aa + '010', campos, nuevo: true });
    expect(e.status).toBe(409);
  });
});

describe('Vendimia V6: planillas conectadas', () => {
  it('extrae Brix/temperatura por encabezado aunque se inserten filas y columnas', () => {
    const s = plantilla('brix-v1');
    // desplazar todo una fila y una columna (como si el usuario insertara)
    for (const h of s.sheets) for (const c of h.celldata) { c.r++; c.c++; }
    poner(s, 0, 8, 8, 24.5); poner(s, 0, 8, 9, 26); // fila de 26098 / E188
    poner(s, 0, 8, 2, 22); poner(s, 0, 8, 3, 25);   // vasija grande 192 (sin lote)
    const h = extraerHechos('brix-v1', 'RCI', s, '2026-03-10');
    expect(h).toContainEqual(expect.objectContaining({ lote: '26098', vasija: 'E188', brix: 24.5, temperatura: 26, fecha_origen: 'guardado' }));
    expect(h).toContainEqual(expect.objectContaining({ lote: '', vasija: '192', brix: 22, temperatura: 25 }));
    expect(h.filter(x => x.lote === '26100')).toHaveLength(0); // sin valores no inventa mediciones
  });
  it('extrae análisis iniciales de Tintos y agregados por tipo de copia', () => {
    const t = extraerHechos('tintos-v1', 'Tintos', plantilla('tintos-v1'), '2026-03-10');
    expect(t).toContainEqual(expect.objectContaining({ lote: '26271', vasija: 'H 171', brix: 26.1, fecha: '2026-04-10', fecha_origen: 'celda' }));
    const n = extraerHechos('agregados-v1', 'Agregado de nutrientes', plantilla('agregados-v1'), '2026-03-10');
    expect(n[0]).toMatchObject({ tipo: 'nutriente', lote: '26011', vasija: 'Esfera 164', producto: 'Nutristar org' });
    expect(extraerHechos('agregados-v1', 'Anhídrido sulfuroso (SO₂)', plantilla('agregados-v1'), 'x')[0].tipo).toBe('so2');
  });
  it('un guardado de Brix queda disponible para la Tintos del mismo lote y vasija', async () => {
    const a = await pedir('/precargas', { lote: aa + '020', campos, nuevo: true });
    const pid = a.body.periodo_id;
    const libro = await env.DB.prepare("SELECT id FROM vend_libros WHERE periodo_id=? AND plantilla_id='brix-v1'").bind(pid).first<{ id: string }>();
    const s = plantilla('brix-v1');
    poner(s, 0, 7, 5, aa + '020'); poner(s, 0, 7, 6, 'T 12'); poner(s, 0, 7, 7, 23.4); poner(s, 0, 7, 8, 27);
    poner(s, 0, 8, 5, aa + '020'); poner(s, 0, 8, 6, 'T13'); poner(s, 0, 8, 7, 20); poner(s, 0, 8, 8, 21);
    const g = await pedir('/libros/' + libro!.id + '/guardar', { version: 0, operacion: crypto.randomUUID(), snapshot: { ...s, print: {} } });
    expect(g.status).toBe(200);
    const m = await pedir(`/mediciones?lote=${aa}020&vasija=T12`);
    expect(m.body.mediciones).toHaveLength(1); // no mezcla la vasija T13
    expect(m.body.mediciones[0]).toMatchObject({ brix: 23.4, temperatura: 27 });
    // reguardar igual no duplica
    await pedir('/libros/' + libro!.id + '/guardar', { version: 1, operacion: crypto.randomUUID(), snapshot: { ...s, print: {} } });
    expect((await pedir(`/mediciones?lote=${aa}020&vasija=T12`)).body.mediciones).toHaveLength(1);
    // recepción, etapas, seguimiento y finalizado
    expect((await pedir('/recepcion/' + pid, { recepcion: '2026-03-01', vasija: 'T12', version: 0 })).status).toBe(200);
    expect((await pedir('/recepcion/' + pid, { recepcion: '2026-03-02', version: 0 })).status).toBe(409);
    expect((await pedir('/etapas/' + pid, { etapa: 'fin_fa', estado: 'hecha', resultado: 'no_termina' })).status).toBe(200);
    expect((await pedir('/etapas/' + pid, { etapa: 'inventada', estado: 'hecha' })).status).toBe(400);
    const seg = await pedir('/seguimiento/' + pid);
    expect(seg.body.ingreso).toMatchObject({ recepcion: '2026-03-01', vasija: 'T12' });
    expect(seg.body.etapas.find((e: any) => e.etapa === 'fin_fa').resultado).toBe('no_termina');
    expect(seg.body.hechos.length).toBeGreaterThanOrEqual(2);
    expect((await pedir('/estado/' + pid, { estado: 'finalizado', version: 1 })).status).toBe(200);
  });
});
