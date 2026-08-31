/**
 * Endpoints del módulo Prensas.
 *
 * Responden EXACTAMENTE igual que servidor.py, para que app.js no note el
 * cambio. Lo único distinto es de dónde salen los datos: antes datos.json,
 * ahora D1.
 */

import { identidad, puedeEscribir, puedeLeer, marcarSesion, type Identidad } from '../auth';
import { json } from '../respuestas';
import { validarDatos, registrosHuerfanos, avanzarMesSiCorresponde, ahoraBodega, type Datos } from './validacion';
import { resumenCambios } from './cambios';

const MODULO = 'prensas';
const HISTORIAL_MAX = 200;

async function leerDocumento(env: Env): Promise<Datos> {
  const fila = await env.DB.prepare('SELECT json FROM documento WHERE modulo = ?')
    .bind(MODULO)
    .first<{ json: string }>();
  if (!fila) return { meta: { version: 0 }, lotes: [], analisis: [], degustaciones: [], agregados: [] };
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
         version = excluded.version,
         json = excluded.json,
         autor = excluded.autor,
         guardado = excluded.guardado`,
    ).bind(MODULO, Number(meta.version ?? 0), JSON.stringify(d), String(meta.autor ?? ''), String(meta.guardado ?? '')),
  ]);
}

export async function rutasPrensas(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  ruta: string,
): Promise<Response | null> {
  const id = await identidad(req, env, ctx, MODULO);

  // Sin rol asignado en este módulo no se ve ni una fila, aunque Access lo haya
  // dejado entrar al sitio.
  if (!puedeLeer(id)) {
    return json(403, {
      error: 'sin_permiso',
      detalles: [`${id?.email ?? 'este usuario'} no tiene acceso al módulo Prensas. Pedíselo a un administrador.`],
    });
  }

  // ---------- GET /datos ----------
  if (ruta === '/datos' && req.method === 'GET') {
    const d = await leerDocumento(env);
    const cambio = avanzarMesSiCorresponde(d, env.TZ_BODEGA);
    if (cambio && puedeEscribir(id)) {
      const [anterior, nuevoMes] = cambio;
      const meta = (d.meta ??= {}) as Record<string, unknown>;
      meta.version = Number(meta.version ?? 0) + 1;
      meta.guardado = ahoraBodega(env.TZ_BODEGA);
      meta.autor = 'sistema';
      await escribirDocumento(env, d, id!.email);
      await registrarHistorial(env, {
        version: Number(meta.version),
        ts: String(meta.guardado),
        autor: 'sistema',
        email: id!.email,
        resumen: `Cambio automático de mes: ${anterior} → ${nuevoMes}`,
        detalle: [],
        forzado: false,
      });
    }
    return json(200, d);
  }

  // ---------- POST /datos ----------
  if (ruta === '/datos' && req.method === 'POST') {
    if (!puedeEscribir(id)) {
      return json(403, {
        error: 'validacion',
        detalles: ['tu usuario es de solo lectura en Prensas: no podés guardar cambios.'],
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

    const errores = validarDatos(nuevo, actual, forzar);
    if (errores.length) return json(400, { error: 'validacion', detalles: errores });

    const va = Number((actual.meta as Record<string, unknown>)?.version ?? 0);
    const vc = Number((nuevo.meta as Record<string, unknown>)?.version ?? 0);
    if (vc !== va) {
      // Otra persona guardó mientras editabas.
      return json(409, { error: 'conflicto', actual });
    }

    const meta = (nuevo.meta ??= {}) as Record<string, unknown>;
    meta.version = va + 1;
    meta.guardado = ahoraBodega(env.TZ_BODEGA);
    // El nombre visible lo manda la app; la identidad real y verificada es la
    // de Office 365, y es la que queda en el historial.
    const autor = String(meta.autor ?? '').trim().slice(0, 60) || id!.nombre || id!.email;
    meta.autor = autor;

    await escribirDocumento(env, nuevo, id!.email);

    const { texto: resumen, detalle } = resumenCambios(actual, nuevo);
    await registrarHistorial(env, {
      version: Number(meta.version),
      ts: String(meta.guardado),
      autor,
      email: id!.email,
      resumen: forzar ? '[FORZADO] ' + resumen : resumen,
      detalle,
      forzado: forzar,
    });

    // Snapshot a R2, sin bloquear la respuesta.
    ctx.waitUntil(snapshot(env, nuevo, Number(meta.version)));

    return json(200, {
      ok: true,
      version: meta.version,
      guardado: meta.guardado,
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
      .all<{ version: number; ts: string; autor: string; email: string; resumen: string; detalle: string; forzado: number }>();

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
  // Antes avisaba de conflictos de OneDrive y de otro servidor activo en la
  // red. Esos problemas dejaron de existir. Queda el aviso de registros
  // huérfanos, que sigue siendo útil.
  if (ruta === '/estado' && req.method === 'GET') {
    const d = await leerDocumento(env);
    return json(200, {
      avisos: registrosHuerfanos(d),
      version: Number((d.meta as Record<string, unknown>)?.version ?? 0),
      host: 'cloudflare',
    });
  }

  // ---------- GET /info ----------
  // Devolvía la IP de la red local para el QR del celular. Ya no hace falta:
  // la dirección es pública y fija. Devolvemos la lista vacía y el botón
  // "Conectar" se oculta solo, sin tocar app.js.
  if (ruta === '/info' && req.method === 'GET') {
    return json(200, { ips: [], port: 443, host: 'cloudflare' });
  }

  // ---------- GET /yo ----------
  // Nuevo: quién soy, según Office 365.
  if (ruta === '/yo' && req.method === 'GET') {
    return json(200, { email: id!.email, nombre: id!.nombre, rol: id!.rol });
  }

  // ---------- GET /exportar ----------
  // El Excel ya no se arma acá: lo hace el navegador con SheetJS, porque la
  // nube no ejecuta openpyxl. El endpoint queda por si alguien tiene la
  // dirección vieja guardada, y explica dónde está ahora el botón.
  if (ruta === '/exportar' && req.method === 'GET') {
    return json(410, {
      error: 'se_mudo',
      detalles: [
        'La exportación a Excel ahora se arma en el navegador.',
        'Usá el botón "⬇️ Exportar a Excel" de la app: baja el mismo archivo, con las mismas columnas.',
      ],
    });
  }

  // ---------- POST /asistente ----------
  if (ruta === '/asistente' && req.method === 'POST') {
    return asistente(req, env, id!);
  }

  return null;
}

// ---------------------------------------------------------------- historial

interface EntradaHistorial {
  version: number;
  ts: string;
  autor: string;
  email: string;
  resumen: string;
  detalle: unknown;
  forzado: boolean;
}

function registrarHistorial(env: Env, e: EntradaHistorial) {
  return env.DB.prepare(
    `INSERT INTO historial (modulo, version, ts, autor, email, resumen, detalle, forzado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(MODULO, e.version, e.ts, e.autor, e.email, e.resumen, JSON.stringify(e.detalle), e.forzado ? 1 : 0)
    .run();
}

// ---------------------------------------------------------------- respaldo

/** Snapshot fechado a R2. Reemplaza a backups/json/. */
export async function snapshot(env: Env, d: Datos, version: number) {
  const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const clave = `prensas/datos-v${String(version).padStart(5, '0')}-${fecha}.json`;
  await env.RESPALDOS.put(clave, JSON.stringify(d), {
    httpMetadata: { contentType: 'application/json' },
  });
}

// ---------------------------------------------------------------- asistente

/**
 * Asistente IA. Antes llamaba a Ollama en localhost, que solo existía en una
 * PC. Ahora corre en Workers AI y funciona para todos.
 */
async function asistente(req: Request, env: Env, id: Identidad): Promise<Response> {
  let body: { pregunta?: string };
  try {
    body = (await req.json()) as { pregunta?: string };
  } catch {
    return json(400, { error: 'pedido inválido' });
  }

  const pregunta = String(body.pregunta ?? '').trim();
  if (!pregunta) return json(400, { error: 'falta la pregunta' });

  const d = await leerDocumento(env);
  const contexto = resumenParaIA(d);

  try {
    const r = (await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        {
          role: 'system',
          content:
            'Sos un asistente de una bodega. Respondés en español rioplatense, ' +
            'en pocas frases y solo con los datos que te dan. Si el dato no está, decilo.',
        },
        { role: 'user', content: `Datos actuales:\n${contexto}\n\nPregunta: ${pregunta}` },
      ],
    })) as { response?: string };

    return json(200, {
      respuesta: r.response ?? 'No obtuve respuesta del modelo.',
      acciones: [],
      modelo: '@cf/meta/llama-3.1-8b-instruct',
    });
  } catch (e) {
    return json(503, { error: 'el asistente no está disponible en este momento.' });
  }
}

/** Resumen corto del estado, equivalente a `resumen_datos()` de servidor.py. */
function resumenParaIA(d: Datos): string {
  const lotes = (d.lotes as Record<string, unknown>[]) || [];
  const analisis = (d.analisis as Record<string, unknown>[]) || [];
  const meta = (d.meta as Record<string, unknown>) || {};

  const porVariedad = new Map<string, number>();
  for (const l of lotes) {
    const v = String(l.variedad ?? 'sin variedad');
    porVariedad.set(v, (porVariedad.get(v) ?? 0) + 1);
  }
  const variedades = [...porVariedad.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([v, n]) => `${v}: ${n}`)
    .join(', ');

  return [
    `Mes en curso: ${meta.mes_actual ?? '?'}/${meta.mes_actual_anio ?? '?'}`,
    `Total de lotes: ${lotes.length}`,
    `Total de análisis: ${analisis.length}`,
    `Lotes por variedad — ${variedades}`,
  ].join('\n');
}
