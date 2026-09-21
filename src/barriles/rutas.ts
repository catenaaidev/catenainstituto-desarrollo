/**
 * Endpoints del Mapa de Barriles.
 *
 * Responden igual que su servidor.py, para que su pantalla no cambie.
 * El estado completo vive en la tabla `documento`, igual que Prensas: la app
 * ya funcionaba así (una fila `snapshot` de SQLite con todo el estado en JSON),
 * solo cambia dónde está guardada.
 */

import { identidad, puedeEscribir, puedeLeer, marcarSesion } from '../auth';
import { json } from '../respuestas';
import { contarPerdidas, superanUmbral, type Estado } from './guardas';

const MODULO = 'barriles';

interface Documento {
  version: number;
  estado: Estado;
}

async function leer(env: Env): Promise<Documento> {
  const fila = await env.DB.prepare('SELECT json FROM documento WHERE modulo = ?')
    .bind(MODULO)
    .first<{ json: string }>();
  if (!fila) return { version: 0, estado: {} };
  return JSON.parse(fila.json) as Documento;
}

/**
 * Escribe solo si la versión en la base sigue siendo la que se leyó.
 *
 * Antes era un ON CONFLICT DO UPDATE, que escribe siempre: el chequeo de versión
 * de más arriba quedaba fuera de la escritura y dos dispositivos que lo pasaban
 * con la misma versión escribían los dos. Devuelve false si otro escribió en el
 * medio; el llamador responde 409 y el cliente fusiona.
 */
async function escribir(
  env: Env,
  doc: Documento,
  email: string,
  versionPrevia: number,
): Promise<boolean> {
  const json = JSON.stringify(doc);
  const escritura =
    versionPrevia === 0
      ? // No hay fila todavía. Si otro la creó en el medio, DO NOTHING no toca nada.
        env.DB.prepare(
          `INSERT INTO documento (modulo, version, json, autor, guardado)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(modulo) DO NOTHING`,
        ).bind(MODULO, doc.version, json, email)
      : env.DB.prepare(
          `UPDATE documento
              SET version = ?, json = ?, autor = ?, guardado = datetime('now')
            WHERE modulo = ? AND version = ?`,
        ).bind(doc.version, json, email, MODULO, versionPrevia);

  const r = await env.DB.batch([marcarSesion(env, email), escritura]);
  return (r[1].meta.changes ?? 0) > 0;
}

export async function rutasBarriles(
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
        `${id?.email ?? 'este usuario'} no tiene acceso al Mapa de Barriles. Pedíselo a un administrador.`,
      ],
    });
  }

  // ---------- GET /version ----------
  if (ruta === '/version' && req.method === 'GET') {
    const doc = await leer(env);
    return json(200, { version: doc.version });
  }

  // ---------- GET /estado ----------
  if (ruta === '/estado' && req.method === 'GET') {
    return json(200, await leer(env));
  }

  // ---------- GET /info ----------
  // Devolvía las direcciones de red local para conectar el celular. Acá no hay
  // red que descubrir: la dirección es una sola, pública y fija, así que `urls`
  // va vacía.
  //
  // `modo` es lo que le permite a la pantalla saber dónde está corriendo. Es el
  // mismo archivo que el de la bodega (se sincroniza copiándolo), y una lista
  // vacía sola es ambigua: puede ser "acá no hace falta ninguna IP" o "la PC se
  // quedó sin WiFi". Sin la marca, la pantalla mandaba al operario a prender un
  // servidor.py que en la web no existe.
  if (ruta === '/info' && req.method === 'GET') {
    return json(200, { modo: 'web', urls: [] });
  }

  // ---------- GET /backup ----------
  // Antes bajaba el .db, y solo desde la propia PC. Ahora los respaldos son
  // automáticos (Time Travel + snapshot diario en R2); esto queda como
  // descarga manual del estado, para un admin.
  if (ruta === '/backup' && req.method === 'GET') {
    if (id!.rol !== 'admin') return json(403, { error: 'solo_admin' });
    const doc = await leer(env);
    return new Response(JSON.stringify(doc), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="mapa-v${doc.version}.json"`,
      },
    });
  }

  // ---------- POST /estado ----------
  if (ruta === '/estado' && req.method === 'POST') {
    if (!puedeEscribir(id)) {
      return json(403, {
        error: 'sin_permiso',
        detalles: ['tu usuario es de solo lectura en el Mapa de Barriles.'],
      });
    }

    let pedido: { version?: number; estado?: Estado; confirmarBorrado?: boolean };
    try {
      pedido = (await req.json()) as typeof pedido;
    } catch {
      return json(400, { error: 'JSON invalido' });
    }

    // Sin esto, un POST sin `estado` reemplazaba el documento entero por {}.
    // La validación va ANTES del chequeo de versión: un POST malformado lo es
    // independientemente de la versión; si va después, devuelve 409 en vez de
    // 400 y el defecto queda tapado.
    if (!pedido.estado || typeof pedido.estado !== 'object' || Array.isArray(pedido.estado)) {
      return json(400, {
        error: 'validacion',
        detalles: ['falta el estado: un guardado sin estado borraría todo'],
      });
    }

    const doc = await leer(env);

    // Otro dispositivo guardó antes: se devuelve el estado actual.
    if (pedido.version !== doc.version) return json(409, doc);

    const nuevoEstado = pedido.estado;

    // Freno de borrado masivo.
    if (!pedido.confirmarBorrado) {
      const perdidas = contarPerdidas(doc.estado, nuevoEstado);
      if (superanUmbral(perdidas)) {
        return json(412, {
          error: 'confirmar_borrado',
          borradas: perdidas.celdas,
          perdidas,
          version: doc.version,
        });
      }
    }

    const actualizado: Documento = { version: doc.version + 1, estado: nuevoEstado };

    if (!(await escribir(env, actualizado, id!.email, doc.version))) {
      // Otro dispositivo ganó la carrera entre la lectura y la escritura.
      return json(409, await leer(env));
    }

    await env.DB.prepare(
      `INSERT INTO historial (modulo, version, ts, autor, email, resumen, detalle, forzado)
       VALUES (?, ?, datetime('now'), ?, ?, ?, '[]', ?)`,
    )
      .bind(
        MODULO,
        actualizado.version,
        id!.nombre ?? id!.email,
        id!.email,
        resumen(doc.estado, nuevoEstado),
        pedido.confirmarBorrado ? 1 : 0,
      )
      .run();

    ctx.waitUntil(snapshotBarriles(env, actualizado));

    return json(200, { version: actualizado.version });
  }

  return null;
}

/** Texto corto de qué cambió, para el historial. */
function resumen(antes: Estado, despues: Estado): string {
  const partes: string[] = [];
  for (const clave of ['inventario', 'escaneos', 'tanques'] as const) {
    const a = antes?.[clave]?.length ?? 0;
    const d = despues?.[clave]?.length ?? 0;
    if (d > a) partes.push(`+${d - a} ${clave}`);
    if (d < a) partes.push(`−${a - d} ${clave}`);
  }
  const p = contarPerdidas(antes, despues);
  if (p.celdas) partes.push(`${p.celdas} celda(s) vaciada(s)`);
  return partes.join('; ') || 'cambios en el mapa';
}

export async function snapshotBarriles(env: Env, doc: Documento) {
  const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const clave = `barriles/mapa-v${String(doc.version).padStart(5, '0')}-${fecha}.json`;
  await env.RESPALDOS.put(clave, JSON.stringify(doc), {
    httpMetadata: { contentType: 'application/json' },
  });
}
