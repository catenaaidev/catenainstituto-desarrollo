/**
 * Sección Órdenes de trabajo: junta las órdenes de Prensas y de Lotes.
 *
 * No es un módulo con rol propio: se entra con el rol que se tenga en prensas
 * o en lotes, y cada lista trae SOLO los módulos en los que hay rol.
 */
import { emailDelUsuario, type Rol } from '../auth';
import { json } from '../respuestas';
import { resumenOrdenes, numerosDeDocumento, type ResumenOrden, type Fila } from './resumen';
import { leerGuia, escribirGuia, problemaGuia, normalizarGuia, type Guia } from './guia';
import { problemaImpresa, guardarImpresa, leerImpresa, resumenImpresas, numerosImpresas, type Foto } from './impresas';

/** La tabla de la guía (migración 0003) puede no existir todavía en un entorno
 * recién creado: sin esto, la primera visita a /guia tira un 500 en vez de
 * decir qué falta. */
const SIN_TABLA_GUIA = { error: 'base_sin_inicializar', detalles: ['Falta crear la tabla de la guía (migración 0003).'] } as const;
function esFaltaTabla(e: unknown): boolean {
  return e instanceof Error && e.message.includes('no such table');
}

const FUENTES = ['lotes', 'prensas'] as const;
const PESO: Record<string, number> = { lector: 1, editor: 2, admin: 3 };

/** El mayor rol entre prensas y lotes (barriles no cuenta). */
export function rolOrdenes(modulos: Record<string, string | null | undefined>): Rol | null {
  let mejor: Rol | null = null;
  for (const m of FUENTES) {
    const r = modulos[m];
    if (r && PESO[r] && (!mejor || PESO[r] > PESO[mejor])) mejor = r as Rol;
  }
  return mejor;
}

/* D1 queda lejos del Worker (~150 ms por consulta): todo lo que se puede
 * pedir junto se pide junto. Los roles salen de UNA consulta (antes, una por
 * módulo) y los documentos de UNA tanda (antes, uno detrás del otro). */
async function rolesDe(req: Request, env: Env): Promise<Partial<Record<(typeof FUENTES)[number], Rol>>> {
  const email = await emailDelUsuario(req, env);
  if (!email) return {};
  const { results } = await env.DB.prepare(
    `SELECT modulo, rol FROM perfiles WHERE email = ? AND modulo IN (${FUENTES.map(() => '?').join(', ')})`,
  ).bind(email, ...FUENTES).all<{ modulo: (typeof FUENTES)[number]; rol: Rol | null }>();
  const roles: Partial<Record<(typeof FUENTES)[number], Rol>> = {};
  for (const r of results ?? []) if (r.rol) roles[r.modulo] = r.rol;
  return roles;
}

/** Los documentos de esos módulos, parseados, en una sola ida a D1. */
async function documentos(env: Env, mods: readonly (typeof FUENTES)[number][]): Promise<Map<string, Fila>> {
  const docs = new Map<string, Fila>();
  if (!mods.length) return docs;
  const res = await env.DB.batch(mods.map((m) =>
    env.DB.prepare('SELECT json FROM documento WHERE modulo = ?').bind(m)));
  mods.forEach((m, i) => {
    const fila = (res[i]?.results as { json: string }[] | undefined)?.[0];
    if (fila) docs.set(m, JSON.parse(fila.json));
  });
  return docs;
}

export async function rutasOrdenes(
  req: Request, env: Env, _ctx: ExecutionContext, sub: string,
): Promise<Response | null> {
  if (sub === '/numeros' && req.method === 'GET') {
    const serie = new URL(req.url).searchParams.get('serie');
    if (serie !== 'principal' && serie !== 'B') return json(400, { error: 'serie_invalida' });
    if (!Object.keys(await rolesDe(req, env)).length) return json(403, { error: 'sin_permiso', detalles: ['No tenés rol en Prensas ni en Lotes.'] });
    /* Los dos documentos, aunque el rol sea de uno solo: comparten la serie de la
     * carpeta de OneDrive y solo se devuelven números. */
    const numeros = new Set<number>();
    for (const [m, doc] of await documentos(env, FUENTES)) for (const n of numerosDeDocumento(m as (typeof FUENTES)[number], doc, serie)) numeros.add(n);
    if (serie === 'principal') for (const n of await numerosImpresas(env)) numeros.add(n);
    return json(200, { numeros: [...numeros].sort((a, b) => a - b) });
  }

  if (sub === '/guia/impresas') {
    const modulos = await rolesDe(req, env);
    const conRol = FUENTES.filter((m) => modulos[m]);
    if (!conRol.length) return json(403, { error: 'sin_permiso', detalles: ['No tenés rol en Prensas ni en Lotes.'] });
    try {
      if (req.method === 'GET') {
        const id = Number(new URL(req.url).searchParams.get('id'));
        const imp = Number.isInteger(id) && id > 0 ? await leerImpresa(env, id) : null;
        return imp ? json(200, imp) : json(404, { error: 'no_encontrada' });
      }
      if (req.method === 'POST') {
        if (!conRol.some((m) => PESO[modulos[m]!] >= PESO.editor)) return json(403, { error: 'sin_permiso', detalles: ['Solo un editor puede numerar la guía.'] });
        let body: { numero?: unknown; foto?: unknown };
        try { body = await req.json(); } catch { return json(400, { error: 'impresa_invalida', detalles: ['JSON inválido.'] }); }
        const problema = problemaImpresa(body?.numero, body?.foto);
        if (problema) return json(400, { error: 'impresa_invalida', detalles: [problema] });
        const id = await guardarImpresa(env, body.numero as string, body.foto as Foto, (await emailDelUsuario(req, env)) || '');
        return json(200, { id });
      }
    } catch (e) {
      if (esFaltaTabla(e)) return json(503, { error: 'base_sin_inicializar', detalles: ['Falta crear la tabla de impresas de la guía (migración 0004).'] });
      throw e;
    }
    return null;
  }

  if (sub === '/guia') {
    const modulos = await rolesDe(req, env);
    const conRol = FUENTES.filter((m) => modulos[m]);
    if (!conRol.length) return json(403, { error: 'sin_permiso', detalles: ['No tenés rol en Prensas ni en Lotes.'] });
    const puedeEditar = conRol.some((m) => PESO[modulos[m]!] >= PESO.editor);

    /** Las órdenes PENDIENTES que puede ver este caller (sus módulos con rol),
     * igual en el GET y en el cuerpo de un 409 (hallazgo 1b: con la guía fresca
     * del servidor van también las órdenes frescas, para no perder las que
     * aparecieron después de la carga original). */
    const ordenesPendientes = async () => {
      const docs = await documentos(env, conRol);
      const ordenes: ResumenOrden[] = [];
      for (const m of conRol) if (docs.has(m)) ordenes.push(...resumenOrdenes(m, docs.get(m)!));
      return ordenes.filter((o) => o.estado === 'pendiente');
    };

    if (req.method === 'GET') {
      try {
        const [ordenes, { version, guia }] = await Promise.all([ordenesPendientes(), leerGuia(env)]);
        return json(200, { version, guia, puedeEditar, modulos, ordenes });
      } catch (e) {
        if (esFaltaTabla(e)) return json(503, SIN_TABLA_GUIA);
        throw e;
      }
    }
    if (req.method === 'POST') {
      if (!puedeEditar) return json(403, { error: 'sin_permiso', detalles: ['Solo un editor puede cambiar la guía.'] });
      let body: { version?: unknown; guia?: unknown };
      try { body = await req.json(); } catch { return json(400, { error: 'guia_invalida', detalles: ['JSON inválido.'] }); }
      const problema = problemaGuia(body?.guia);
      if (problema || typeof body.version !== 'number') return json(400, { error: 'guia_invalida', detalles: [problema || 'Falta la versión.'] });
      const email = (await emailDelUsuario(req, env)) || '';
      const limpia = normalizarGuia(body.guia as Guia);
      try {
        if (await escribirGuia(env, body.version, limpia, email)) return json(200, { version: body.version + 1 });
        const [ordenes, actual] = await Promise.all([ordenesPendientes(), leerGuia(env)]);
        return json(409, { error: 'conflicto', ...actual, modulos, ordenes });
      } catch (e) {
        if (esFaltaTabla(e)) return json(503, SIN_TABLA_GUIA);
        throw e;
      }
    }
    return null;
  }

  if (sub !== '/lista' || req.method !== 'GET') return null;

  const modulos = await rolesDe(req, env);
  const conRol = FUENTES.filter((m) => modulos[m]);
  if (!conRol.length) {
    return json(403, { error: 'sin_permiso', detalles: ['No tenés rol en Prensas ni en Lotes.'] });
  }
  const ordenes: ResumenOrden[] = [];
  const [docs, impresas] = await Promise.all([documentos(env, conRol), resumenImpresas(env)]);
  for (const m of conRol) if (docs.has(m)) ordenes.push(...resumenOrdenes(m, docs.get(m)!));
  ordenes.push(...impresas);
  ordenes.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero));
  return json(200, { modulos, ordenes });
}
