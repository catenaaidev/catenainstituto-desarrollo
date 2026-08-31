/**
 * Endpoints del módulo Lotes.
 *
 * Responden igual que su servidor.py, con los ocho motores portados a
 * TypeScript en motores/. El cruce con el Mapa de Barriles ya no lee el .db de
 * otra máquina: los dos módulos viven en la misma base, así que es una consulta.
 */

import { identidad, puedeEscribir, puedeLeer, marcarSesion } from '../auth';
import { json } from '../respuestas';
import { validarDatos, SECCIONES_LOTES, ahoraBodega, type Datos } from '../prensas/validacion';
import { resumenCambios } from '../prensas/cambios';
import { datosDashboard, datosFicha, analisisConFlags } from './vistas';
import { normalizarMapa, MapaNoDisponible } from './motores/mapa';
import { cruzar } from './motores/cruce';
import { armarOrden } from './motores/correccion';
import { ETAPAS } from './motores/etapas';

const MODULO = 'lotes';
const HISTORIAL_MAX = 200;

async function leerDocumento(env: Env): Promise<Datos> {
  const fila = await env.DB.prepare('SELECT json FROM documento WHERE modulo = ?')
    .bind(MODULO)
    .first<{ json: string }>();
  if (!fila) return { meta: { version: 0 }, lotes: [], analisis: [], movimientos: [] };
  return JSON.parse(fila.json) as Datos;
}

async function escribirDocumento(env: Env, d: Datos, email: string) {
  const meta = (d.meta ?? {}) as Record<string, unknown>;
  await env.DB.batch([
    marcarSesion(env, email),
    env.DB.prepare(
      `INSERT INTO documento (modulo, version, json, autor, guardado)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(modulo) DO UPDATE SET
         version = excluded.version, json = excluded.json,
         autor = excluded.autor, guardado = excluded.guardado`,
    ).bind(
      MODULO,
      Number(meta.version ?? 0),
      JSON.stringify(d),
      String(meta.autor ?? ''),
      String(meta.actualizado ?? ''),
    ),
  ]);
}

export async function rutasLotes(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  ruta: string,
): Promise<Response | null> {
  const id = await identidad(req, env, ctx, MODULO);

  if (!puedeLeer(id)) {
    return json(403, {
      error: 'sin_permiso',
      detalles: [
        `${id?.email ?? 'este usuario'} no tiene acceso a Lotes. Pedíselo a un administrador.`,
      ],
    });
  }

  // ---------- GET /datos ----------
  if (ruta === '/datos' && req.method === 'GET') {
    return json(200, await leerDocumento(env));
  }

  // ---------- POST /datos ----------
  if (ruta === '/datos' && req.method === 'POST') {
    if (!puedeEscribir(id)) {
      return json(403, {
        error: 'validacion',
        detalles: ['tu usuario es de solo lectura en Lotes: no podés guardar cambios.'],
      });
    }

    const forzar = new URL(req.url).searchParams.get('forzar') === '1';

    let nuevo: Datos;
    try {
      nuevo = (await req.json()) as Datos;
    } catch {
      return json(400, { error: 'validacion', detalles: ['el guardado no es un objeto JSON válido'] });
    }

    const actual = await leerDocumento(env);

    const errores = validarDatos(nuevo, actual, forzar, SECCIONES_LOTES);
    if (errores.length) return json(400, { error: 'validacion', detalles: errores });

    const va = Number((actual.meta as Record<string, unknown>)?.version ?? 0);
    const vc = Number((nuevo.meta as Record<string, unknown>)?.version ?? 0);
    if (vc !== va) return json(409, { error: 'conflicto', actual });

    const meta = (nuevo.meta ??= {}) as Record<string, unknown>;
    meta.version = va + 1;
    meta.actualizado = ahoraBodega(env.TZ_BODEGA);
    const autor = String(meta.autor ?? '').trim().slice(0, 60) || id!.nombre || id!.email;
    meta.autor = autor;

    await escribirDocumento(env, nuevo, id!.email);

    const { texto, detalle } = resumenCambios(actual, nuevo);
    await env.DB.prepare(
      `INSERT INTO historial (modulo, version, ts, autor, email, resumen, detalle, forzado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        MODULO,
        Number(meta.version),
        String(meta.actualizado),
        autor,
        id!.email,
        forzar ? '[FORZADO] ' + texto : texto,
        JSON.stringify(detalle),
        forzar ? 1 : 0,
      )
      .run();

    ctx.waitUntil(snapshotLotes(env, nuevo, Number(meta.version)));

    return json(200, {
      ok: true,
      version: meta.version,
      actualizado: meta.actualizado,
      respaldo: null,
      reporte: null,
    });
  }

  // ---------- GET /historial ----------
  if (ruta === '/historial' && req.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT version, ts, autor, email, resumen, detalle, forzado
       FROM historial WHERE modulo = ? ORDER BY id DESC LIMIT ?`,
    )
      .bind(MODULO, HISTORIAL_MAX)
      .all<{
        version: number; ts: string; autor: string; email: string;
        resumen: string; detalle: string; forzado: number;
      }>();

    return json(200, {
      historial: (results ?? []).map((h) => ({
        version: h.version,
        ts: h.ts,
        autor: h.autor,
        email: h.email,
        resumen: h.resumen,
        detalle: h.detalle ? JSON.parse(h.detalle) : [],
        forzado: !!h.forzado,
      })),
    });
  }

  // ---------- GET /estado ----------
  if (ruta === '/estado' && req.method === 'GET') {
    const d = await leerDocumento(env);
    return json(200, {
      avisos: [],
      version: Number((d.meta as Record<string, unknown>)?.version ?? 0),
      host: 'cloudflare',
    });
  }

  // ---------- GET /info ----------
  if (ruta === '/info' && req.method === 'GET') {
    return json(200, { ips: [], port: 443, host: 'cloudflare' });
  }

  // ================= los que usan los motores =================

  const hoy = hoyBodega(env.TZ_BODEGA);

  // ---------- GET /dashboard ----------
  if (ruta === '/dashboard' && req.method === 'GET') {
    return json(200, datosDashboard(await leerDocumento(env), hoy));
  }

  // ---------- GET /analisis ----------
  if (ruta === '/analisis' && req.method === 'GET') {
    return json(200, analisisConFlags(await leerDocumento(env)));
  }

  // ---------- GET /ficha?lote=NNN[&etapa=X] ----------
  if (ruta === '/ficha' && req.method === 'GET') {
    const url = new URL(req.url);
    const lote = url.searchParams.get('lote');
    if (!lote) return json(400, { error: 'falta el parametro lote' });

    const etapa = url.searchParams.get('etapa');
    if (etapa && !(ETAPAS as readonly string[]).includes(etapa)) {
      return json(400, { error: `etapa invalida: ${etapa}` });
    }

    const ficha = datosFicha(await leerDocumento(env), lote, hoy, etapa);
    if (!ficha) return json(404, { error: `no existe el lote ${lote}` });
    return json(200, ficha);
  }

  // ---------- GET /cruce ----------
  // Antes leía el .db del Mapa de Barriles desde una carpeta de OneDrive.
  // Ahora los dos módulos comparten base: es una consulta.
  if (ruta === '/cruce' && req.method === 'GET') {
    try {
      const mapa = normalizarMapa(await leerMapaBarriles(env));
      const d = await leerDocumento(env);
      return json(200, cruzar((d.lotes as Record<string, unknown>[]) ?? [], mapa));
    } catch (e) {
      if (e instanceof MapaNoDisponible) return json(503, { error: e.message });
      throw e;
    }
  }

  // ---------- GET /orden-correccion ----------
  if (ruta === '/orden-correccion' && req.method === 'GET') {
    try {
      const mapa = normalizarMapa(await leerMapaBarriles(env));
      return json(200, armarOrden(await leerDocumento(env), mapa, hoy));
    } catch (e) {
      if (e instanceof MapaNoDisponible) return json(503, { error: e.message });
      throw e;
    }
  }

  return null;
}

/** Día de hoy en la bodega, en milisegundos UTC del día. */
function hoyBodega(tz: string): number {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const v = (t: string) => partes.find((p) => p.type === t)!.value;
  return Date.parse(`${v('year')}-${v('month')}-${v('day')}T00:00:00Z`);
}

/**
 * Documento del Mapa de Barriles, para el cruce.
 *
 * Acá está el premio de haber unificado: el cruce dejó de depender de que la
 * PC del mapa estuviera encendida y de que OneDrive hubiera sincronizado su
 * backup. Es una fila de la misma base.
 */
async function leerMapaBarriles(env: Env): Promise<{ version: unknown; estado: Record<string, unknown> }> {
  const fila = await env.DB.prepare('SELECT json FROM documento WHERE modulo = ?')
    .bind('barriles')
    .first<{ json: string }>();
  if (!fila) {
    throw new MapaNoDisponible(
      'todavía no hay datos del Mapa de Barriles en la plataforma. Importalo antes de cruzar.',
    );
  }
  return JSON.parse(fila.json);
}

export async function snapshotLotes(env: Env, d: Datos, version: number) {
  const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const clave = `lotes/datos-v${String(version).padStart(5, '0')}-${fecha}.json`;
  await env.RESPALDOS.put(clave, JSON.stringify(d), {
    httpMetadata: { contentType: 'application/json' },
  });
}
