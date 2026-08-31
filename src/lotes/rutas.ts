/**
 * Endpoints del módulo Lotes — MIGRACIÓN PARCIAL.
 *
 * Lotes es el único módulo cuya lógica NO vive en la pantalla sino en el
 * servidor: ocho motores de Python (~87 KB) calculan FML, etapas, linaje,
 * cruce con barriles y órdenes de corrección.
 *
 * Lo que YA funciona acá (los datos):
 *   GET/POST /datos · GET /estado · GET /historial · GET /info
 *   → las vistas de lotes, análisis y movimientos andan, con las mismas
 *     validaciones y el mismo control de versión que las otras dos apps.
 *
 * Lo que FALTA (los cálculos):
 *   /dashboard · /analisis · /ficha · /cruce · /orden-correccion
 *   → cada uno responde 501 con el motor que le falta, así la pantalla puede
 *     avisar en vez de romperse. Portarlos es la Fase 4 (5 a 8 días), y hay
 *     que verificar cada motor contra los datos reales antes de confiar en él:
 *     son reglas que afectan producción.
 */

import { identidad, puedeEscribir, puedeLeer, marcarSesion } from '../auth';
import { json } from '../respuestas';
import { validarDatos, SECCIONES_LOTES, ahoraBodega, type Datos } from '../prensas/validacion';
import { resumenCambios } from '../prensas/cambios';

const MODULO = 'lotes';
const HISTORIAL_MAX = 200;

/** Endpoints que dependen de un motor todavía en Python. */
const PENDIENTES: Record<string, { motores: string[]; que: string }> = {
  '/dashboard': {
    motores: ['motor_fml', 'motor_etapas'],
    que: 'el tablero con etapas y avance de FML',
  },
  '/analisis': {
    motores: ['motor_fml'],
    que: 'la evaluación de análisis contra los criterios de FML',
  },
  '/ficha': {
    motores: ['motor_etapas', 'motor_linaje'],
    que: 'la ficha del lote con su línea de tiempo y recorrido de vasijas',
  },
  '/cruce': {
    motores: ['motor_cruce', 'motor_mapa'],
    que: 'el cruce con el Mapa de Barriles',
  },
  '/orden-correccion': {
    motores: ['motor_correccion'],
    que: 'la orden de corrección',
  },
};

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

  // ---------- Endpoints que esperan a la Fase 4 ----------
  const pendiente = PENDIENTES[ruta];
  if (pendiente) {
    return json(501, {
      error: 'motor_pendiente',
      motores: pendiente.motores,
      detalles: [
        `Todavía no está migrado ${pendiente.que}.`,
        `Depende de ${pendiente.motores.join(' y ')}, que siguen en Python (Fase 4).`,
        'Los datos sí están: las vistas de lotes, análisis y movimientos funcionan.',
        'Para esta parte, por ahora usá la app local.',
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

  return null;
}

export async function snapshotLotes(env: Env, d: Datos, version: number) {
  const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const clave = `lotes/datos-v${String(version).padStart(5, '0')}-${fecha}.json`;
  await env.RESPALDOS.put(clave, JSON.stringify(d), {
    httpMetadata: { contentType: 'application/json' },
  });
}
