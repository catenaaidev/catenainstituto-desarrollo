import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { evaluarPh, evaluarFinFA, criterio, emitirVencidas } from '../src/vendimia/flujo';

let cookie = '';
async function pedir(path: string, body?: unknown) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request('https://ciw.example/vendimia/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'https://ciw.example' }, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  await waitOnExecutionContext(ctx);
  return { status: res.status, body: await res.json<any>() };
}
const op = () => crypto.randomUUID();
const hace = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
const receta = { producto: 'Levadura X', dosis: '20', unidad_dosis: 'g/hL', cantidad: '400', unidad: 'g', instrucciones: 'Hidratar y agregar', responsable: 'Bodega' };
const aa = String(new Date().getFullYear()).slice(-2);

beforeAll(async () => {
  const ctx = createExecutionContext();
  const login = await worker.fetch(new Request('https://ciw.example/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'admin', password: '1234' }) }), env, ctx);
  cookie = (login.headers.get('Set-Cookie') || '').split(';')[0];
  await worker.fetch(new Request('https://ciw.example/api/auth/cambiar-clave', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ actual: '1234', nueva: 'prueba-flujo-2026' }) }), env, ctx);
});

describe('Criterios', () => {
  it('pH: verde dentro del límite máx, rojo fuera, gris sin dato o sin criterio; esperado aparte', async () => {
    const c = await criterio(env);
    expect(c.version).toBe('ph-rev01-2021');
    expect(evaluarPh(c, 'Malbec', 'mosto', 3.7)).toMatchObject({ estado: 'verde', limite: 3.7, esperado: 3.65 });
    expect(evaluarPh(c, 'Malbec', 'mosto', 3.71).estado).toBe('rojo');
    expect(evaluarPh(c, 'Malbec', 'mosto', null).estado).toBe('gris');
    expect(evaluarPh(c, 'Tannat', 'mosto', 3.5).estado).toBe('gris');
    expect(evaluarPh(c, 'Cabernet Sauvignon', 'crianza', 3.79).estado).toBe('verde');
  });
  it('fin FA: Az. Red. < 1,64 estricto', async () => {
    const c = await criterio(env);
    expect(evaluarFinFA(c, 1.63).estado).toBe('verde');
    expect(evaluarFinFA(c, 1.64).estado).toBe('rojo');
    expect(evaluarFinFA(c, 1.65).estado).toBe('rojo');
    expect(evaluarFinFA(c, null)).toMatchObject({ estado: 'gris', texto: 'Pendiente de análisis' });
  });
});

describe('Recorrido completo por lote y vasija', () => {
  let pid = '';
  const reg = (vasija: string, tipo: string, fecha: string, datos: object) => pedir('/registros', { op: op(), periodo_id: pid, vasija, tipo, fecha_muestra: fecha, datos });
  const lote = async () => (await pedir('/lote/' + pid)).body;
  const vas = async (v: string) => (await lote()).vasijas.find((x: any) => x.vasija === v);

  it('precarga → análisis inicial → revisión técnica → TH2 → ejecución → pH → siembra → 24 h → nutrientes', async () => {
    pid = (await pedir('/precargas', { lote: aa + '501', campos: { variedad: 'Malbec' }, nuevo: true })).body.periodo_id;
    expect(pid).toBeTruthy();
    expect((await lote()).faltan.length).toBeGreaterThan(0);

    // análisis inicial con pH fuera de criterio (Malbec mosto: límite 3,7)
    expect((await reg('T 12', 'analisis_inicial', hace(6), { kg_recibidos: 1200, kg_procesados: 1150, merma: 50, merma_unidad: 'kg', brix: 25, ph: 3.8, at: 5.2, nfa: 140 })).status).toBe(200);
    expect((await reg('T 12', 'analisis_inicial', hace(5), { ph: 3.7 })).status).toBe(409); // no duplica el inicial
    let v = await vas('T 12');
    expect(v.proxima.clave).toBe('revision_tecnica');
    expect(v.ph.estado).toBe('rojo');

    // sin revisión técnica no hay siembra
    let c = await pedir('/tecnico/confirmar-ph', { op: op(), periodo_id: pid, vasija: 'T 12', registro_id: v.ph_registro, receta });
    expect(c.status).toBe(409);
    expect(c.body.falta.join(' ')).toMatch(/revisión técnica/);

    // TH2: exige revisión y base de cálculo (no calcula desde el pH)
    expect((await pedir('/tecnico/th2', { op: op(), periodo_id: pid, vasija: 'T 12', revisado: true, datos: { ...receta, producto: '' } })).status).toBe(400);
    const th2 = await pedir('/tecnico/th2', { op: op(), periodo_id: pid, vasija: 'T 12', revisado: true, datos: { ...receta, producto: 'Ácido tartárico (TH2)', base_calculo: 'Ensayo de laboratorio 1 g/L' } });
    expect(th2.status).toBe(200);
    expect((await pedir('/ot/' + th2.body.id)).body.trabajos).toHaveLength(1); // en cola de impresión

    // aprobada ≠ ejecutada
    c = await pedir('/tecnico/confirmar-ph', { op: op(), periodo_id: pid, vasija: 'T 12', registro_id: v.ph_registro, receta });
    expect(c.body.falta.join(' ')).toMatch(/todavía no está ejecutada/);

    // ejecución del TH2, con doble confirmación idempotente
    const ejec = { op: op(), completa: true, fecha_real: hace(4), producto: 'TH2', cantidad: 1200, unidad: 'g', lote_insumo: 'L-7' };
    expect((await pedir(`/ot/${th2.body.id}/ejecutar`, ejec)).status).toBe(200);
    expect((await pedir(`/ot/${th2.body.id}/ejecutar`, ejec)).body.repetida).toBe(true);
    expect((await pedir(`/ot/${th2.body.id}/ejecutar`, { ...ejec, op: op() })).status).toBe(409);
    expect((await vas('T 12')).proxima.clave).toBe('analisis_post');

    // análisis posterior dentro de criterio → confirmar pH → siembra emitida + nutrientes en borrador
    const post = await reg('T 12', 'post_correccion', hace(3), { ph: 3.62 });
    c = await pedir('/tecnico/confirmar-ph', { op: op(), periodo_id: pid, vasija: 'T 12', registro_id: post.body.id, receta: { ...receta, cantidad: '' } });
    expect(c.body.falta.join(' ')).toMatch(/receta de siembra/);
    c = await pedir('/tecnico/confirmar-ph', { op: op(), periodo_id: pid, vasija: 'T 12', registro_id: post.body.id, receta });
    expect(c.status).toBe(200);
    expect(c.body.nutrientes_estado).toBe('borrador');
    const siembra = c.body.siembra_id;

    // ejecución parcial: no programa nutrientes
    expect((await pedir(`/ot/${siembra}/ejecutar`, { op: op(), completa: false, fecha_real: hace(26), producto: 'Levadura X', cantidad: 200 })).body.estado).toBe('parcial');
    let L = await lote();
    expect(L.ots.find((o: any) => o.tipo === 'nutrientes').programada_para).toBeNull();
    expect(L.vasijas[0].proxima.bloqueo).toMatch(/parcial/);

    // completa hace 25 h → vence hace 1 h, pero la receta falta: no se imprime incompleta
    await pedir(`/ot/${siembra}/ejecutar`, { op: op(), completa: true, fecha_real: hace(25), producto: 'Levadura X', cantidad: 400 });
    L = await lote();
    const nut = L.ots.find((o: any) => o.tipo === 'nutrientes');
    expect(nut.estado).toBe('borrador');
    expect(Date.parse(nut.programada_para) - Date.parse(hace(25))).toBeLessThan(24 * 3600000 + 5000);
    expect(L.vasijas[0].proxima.clave).toBe('aprobar_nutrientes');

    // aprobar receta → vencida → se emite y se imprime una sola vez
    expect((await pedir(`/ot/${nut.id}/aprobar`, { version: nut.version, datos: { ...receta, producto: 'Nutriente orgánico' } })).status).toBe(200);
    await emitirVencidas(env); await emitirVencidas(env);
    const det = (await pedir('/ot/' + nut.id)).body;
    expect(det.ot.estado).toBe('emitida');
    expect(det.trabajos).toHaveLength(1);
    expect((await pedir('/mis-ordenes')).body.ordenes.some((o: any) => o.id === nut.id)).toBe(true);
  });

  const nuevo = async (n: string) => { pid = (await pedir('/precargas', { lote: aa + n, campos: { variedad: 'Malbec' }, nuevo: true })).body.periodo_id; await reg('T 12', 'analisis_inicial', hace(8), { kg_recibidos: 1000, merma: 20, ph: 3.6 }); };
  it('las vasijas no se mezclan y el fin FA es estricto; descube solo tras validación técnica', async () => {
    await nuevo('502');
    await reg('T13', 'analisis_inicial', hace(6), { kg_recibidos: 500, merma: 10, ph: 3.5 });
    expect((await vas('T13')).proxima.clave).toBe('revision_tecnica');
    expect((await vas('T 12')).proxima.clave).toBe('revision_tecnica');
    expect((await vas('T 12')).ph.estado).toBe('verde');

    const d = await pedir('/tecnico/ot', { op: op(), periodo_id: pid, vasija: 'T 12', tipo: 'descube', datos: { destino: 'Rolls 3', instrucciones: 'Descubar', responsable: 'Bodega' } });
    expect(d.status).toBe(409);
    const igual = await reg('T 12', 'fin_fa', hace(2), { az_red: 1.64 });
    expect((await pedir('/tecnico/fin-fa', { op: op(), periodo_id: pid, vasija: 'T 12', registro_id: igual.body.id })).status).toBe(409);
    const menor = await reg('T 12', 'fin_fa', hace(1), { az_red: 1.6 });
    expect((await pedir('/tecnico/fin-fa', { op: op(), periodo_id: pid, vasija: 'T 12', registro_id: menor.body.id })).status).toBe(200);
    const ok = await pedir('/tecnico/ot', { op: op(), periodo_id: pid, vasija: 'T 12', tipo: 'descube', datos: { destino: 'Rolls 3', cantidad: '900', unidad: 'L', total: true, instrucciones: 'Descubar', responsable: 'Bodega' } });
    expect(ok.status).toBe(200);
    let L = await lote();
    expect(L.movs.find((m: any) => m.ot_id === ok.body.id).estado).toBe('solicitado');
    expect(L.vasijas.some((x: any) => x.vasija === 'Rolls 3')).toBe(false); // solicitado no mueve
    await pedir(`/ot/${ok.body.id}/ejecutar`, { op: op(), completa: true, fecha_real: hace(0.5), cantidad: 880 });
    L = await lote();
    expect(L.movs.find((m: any) => m.ot_id === ok.body.id)).toMatchObject({ estado: 'ejecutado', cantidad_real: 880 });
    expect(L.vasijas.some((x: any) => x.vasija === 'Rolls 3')).toBe(true);
  });

  it('las correcciones de un registro guardan el valor anterior y controlan concurrencia', async () => {
    await nuevo('503');
    const x = await reg('T13', 'control', hace(1), { brix: 20, temperatura: 24 });
    expect((await pedir(`/registros/${x.body.id}/corregir`, { version: 1, datos: { brix: 19.5 }, motivo: 'tipeo' })).status).toBe(200);
    expect((await pedir(`/registros/${x.body.id}/corregir`, { version: 1, datos: { brix: 19 } })).status).toBe(409);
    const ant = await env.DB.prepare('SELECT datos_antes FROM vend_registros_cambios WHERE registro_id=?').bind(x.body.id).first<{ datos_antes: string }>();
    expect(JSON.parse(ant!.datos_antes).datos.brix).toBe(20);
  });

  it('lote de demostración no genera impresión; el agente exige token', async () => {
    await nuevo('504');
    await pedir(`/lote/${pid}/demo`, { demo: true });
    const a = await pedir('/tecnico/ot', { op: op(), periodo_id: pid, vasija: 'T13', tipo: 'agregado', datos: { ...receta, instrucciones: 'Agregar' } });
    expect((await pedir('/ot/' + a.body.id)).body.trabajos).toHaveLength(0);
    const ctx = createExecutionContext();
    const ag = await worker.fetch(new Request('https://ciw.example/api/impresion/agente/tomar', { method: 'POST' }), env, ctx);
    expect([401, 503]).toContain(ag.status);
  });
});
