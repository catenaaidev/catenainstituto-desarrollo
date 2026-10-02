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
import { ETAPAS, etapasSugeridas } from './motores/etapas';
import { barrilesDeLotes, barrilesPorNum } from './motores/barriles-lote';
import { leerAnios, enAnios, recortarPorAnios, anioDeLote } from './motores/anios';

const MODULO = 'lotes';
const HISTORIAL_MAX = 200;

async function leerDocumento(env: Env): Promise<Datos> {
  const fila = await env.DB.prepare('SELECT json FROM documento WHERE modulo = ?')
    .bind(MODULO)
    .first<{ json: string }>();
  if (!fila) return { meta: { version: 0 }, lotes: [], analisis: [], movimientos: [] };
  return JSON.parse(fila.json) as Datos;
}

/**
 * Escribe solo si la versión en la base sigue siendo la que se leyó.
 *
 * Antes era un ON CONFLICT DO UPDATE pelado, que escribe siempre: el chequeo de
 * versión del handler quedaba FUERA de la escritura, así que dos navegadores que
 * leían la misma versión antes de que cualquiera escribiera pasaban los dos el
 * chequeo y escribían los dos. El trabajo del primero desaparecía sin rastro.
 * Devuelve false si otro escribió en el medio; el llamador responde 409.
 *
 * Va todo en UNA sola sentencia a propósito. Ramificar según
 * `versionPrevia === 0` para distinguir "no hay fila" de "hay fila" es un
 * defecto: leerDocumento() devuelve versión 0 en los dos casos, y una fila
 * sembrada por scripts/importar.mjs en versión 0 dejaría la app devolviendo 409
 * en cada guardado, sin salida. Con el WHERE en el DO UPDATE: si la fila no
 * existe, entra por el INSERT; si existe con esa versión, se actualiza; si
 * existe con otra, no se toca nada y changes = 0.
 *
 * IMPORTANTE: la columna `version` tiene que quedar siempre igual a
 * $.meta.version del json, porque leerDocumento() saca la versión del json
 * parseado y el WHERE compara contra la columna. Si se desacoplan, el
 * compare-and-swap empieza a comparar contra el valor equivocado.
 */
export async function escribirDocumento(
  env: Env,
  d: Datos,
  email: string,
  versionPrevia: number,
): Promise<boolean> {
  const meta = (d.meta ?? {}) as Record<string, unknown>;
  const escritura = env.DB.prepare(
    `INSERT INTO documento (modulo, version, json, autor, guardado)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(modulo) DO UPDATE SET
       version = excluded.version, json = excluded.json,
       autor = excluded.autor, guardado = excluded.guardado
     WHERE documento.version = ?`,
  ).bind(
    MODULO,
    Number(meta.version ?? 0),
    JSON.stringify(d),
    String(meta.autor ?? ''),
    String(meta.actualizado ?? ''),
    versionPrevia,
  );

  // Desestructurar y no indexar con un número mágico: el batch incluye
  // marcarSesion, y si mañana se le agrega otra sentencia adelante, un índice
  // fijo leería el meta.changes equivocado y el freno quedaría en nada.
  const [, resEscritura] = await env.DB.batch([marcarSesion(env, email), escritura]);
  return (resEscritura.meta.changes ?? 0) > 0;
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
    // `null`, un número o una lista también son JSON válido, y reventaban más
    // abajo al leer nuevo.meta (error 1101).
    if (!nuevo || typeof nuevo !== 'object' || Array.isArray(nuevo)) {
      return json(400, { error: 'validacion', detalles: ['el guardado no es un objeto JSON válido'] });
    }

    const actual = await leerDocumento(env);

    // La versión va ANTES de validar (ver prensas/rutas.ts): uno viejo no tiene
    // lo de los demás y el freno lo tomaría por un borrado masivo.
    const va = Number((actual.meta as Record<string, unknown>)?.version ?? 0);
    const vc = Number((nuevo.meta as Record<string, unknown>)?.version ?? 0);
    if (vc !== va) return json(409, { error: 'conflicto', actual });

    const errores = validarDatos(nuevo, actual, forzar, SECCIONES_LOTES);
    if (errores.length) return json(400, { error: 'validacion', detalles: errores });

    const meta = (nuevo.meta ??= {}) as Record<string, unknown>;
    meta.version = va + 1;
    meta.actualizado = ahoraBodega(env.TZ_BODEGA);
    const autor = String(meta.autor ?? '').trim().slice(0, 60) || id!.nombre || id!.email;
    meta.autor = autor;

    // El INSERT al historial y el snapshot van DESPUÉS de este chequeo: si la
    // escritura no ocurrió no hay nada que registrar, y un historial que miente
    // arruina la próxima investigación.
    if (!(await escribirDocumento(env, nuevo, id!.email, va))) {
      // Otro dispositivo ganó la carrera entre la lectura y la escritura.
      return json(409, { error: 'conflicto', actual: await leerDocumento(env) });
    }

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

  // ?anios=2025,2026: el selector de años de la pantalla. Solo las rutas que
  // corren motores lo usan; sin el parámetro calculan con todo, como siempre.
  const anios = leerAnios(new URL(req.url).searchParams.get('anios'));

  // ---------- GET /dashboard ----------
  if (ruta === '/dashboard' && req.method === 'GET') {
    return json(200, datosDashboard(recortarPorAnios(await leerDocumento(env), anios), hoy));
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
      // Con la etapa sugerida: un lote que nadie confirmó en la bandeja de
      // etapas no se marca "sin envase" mientras todavía está fermentando.
      // Los lotes van recortados por año; las etapas sugeridas salen del
      // documento entero (el linaje cruza años). Un barril del Mapa con un lote
      // de un año apagado quedaría como huérfano: se lo saca de ahí también.
      const informe = cruzar(
        (recortarPorAnios(d, anios).lotes as Record<string, unknown>[]) ?? [],
        mapa,
        etapasSugeridas(d, hoy),
      );
      // Un huérfano de un año que ni aparece en el documento no es un huérfano
      // de un año apagado (no hay boton para apagarlo): si lo sacamos de aca
      // un Nebbiolo viejo (24xxx) desaparece del cruce para siempre.
      const aniosDelDoc = new Set(
        ((d.lotes as Record<string, unknown>[]) ?? [])
          .map((l) => anioDeLote((l as { lote?: unknown }).lote))
          .filter((a): a is number => a !== null),
      );
      informe.huerfanos = informe.huerfanos.filter((h) => {
        if (enAnios(h.lote, anios)) return true;
        const a = anioDeLote(h.lote);
        return a === null || !aniosDelDoc.has(a);
      });
      return json(200, informe);
    } catch (e) {
      if (e instanceof MapaNoDisponible) return json(503, { error: e.message });
      throw e;
    }
  }

  // ---------- GET /orden-correccion ----------
  if (ruta === '/orden-correccion' && req.method === 'GET') {
    try {
      const mapa = normalizarMapa(await leerMapaBarriles(env));
      return json(200, armarOrden(recortarPorAnios(await leerDocumento(env), anios), mapa, hoy));
    } catch (e) {
      if (e instanceof MapaNoDisponible) return json(503, { error: e.message });
      throw e;
    }
  }

  // ---------- GET /barriles?lotes=26217,26218  y/o  ?nums=2221713,451 ----------
  // Para las OT de trasiego y las barricas mermas. Solo lectura: el Mapa lo
  // escribe el escáner, nunca una OT.
  if (ruta === '/barriles' && req.method === 'GET') {
    const qs = new URL(req.url).searchParams;
    const lista = (p: string) => (qs.get(p) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const pedidos = lista('lotes');
    const nums = lista('nums');
    if (!pedidos.length && !nums.length) return json(400, { error: 'falta el parámetro lotes o nums' });
    try {
      const doc = await leerMapaBarriles(env);
      const estado = doc.estado ?? {};
      const r: Record<string, unknown> = { version: doc.version };
      if (pedidos.length) r.por_lote = barrilesDeLotes(estado, pedidos);
      if (nums.length) r.por_num = barrilesPorNum(estado, nums);
      return json(200, r);
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
