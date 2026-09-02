/**
 * Identidad y permisos.
 *
 * Quién es el usuario lo decide Cloudflare Access ANTES de que el pedido llegue
 * hasta acá: si no está autenticado con Office 365, este código no se ejecuta.
 * Acá solo leemos esa identidad ya verificada y buscamos el rol en la base.
 */

export type Rol = 'admin' | 'editor' | 'lector';
export type Modulo = 'prensas' | 'barriles' | 'lotes';

export interface Identidad {
  email: string;
  rol: Rol | null;
  nombre: string | null;
}

/**
 * Email del usuario autenticado.
 *
 * Se prueban tres fuentes, en orden:
 *  1. ctx.access — la API nueva de Workers protegidos por Access.
 *  2. La cabecera Cf-Access-Authenticated-User-Email, que Access agrega a cada
 *     pedido. Es confiable porque el Worker está protegido a nivel Worker: no
 *     hay forma de llegar hasta acá sin pasar por Access.
 *  3. DEV_EMAIL, que solo existe en desarrollo.
 *
 * DEV_EMAIL vive en `.dev.vars` y NO en el "vars" de wrangler.jsonc: todo lo
 * que está en "vars" se despliega, y un email de desarrollo en producción
 * dejaría entrar a cualquiera con esa identidad mientras Access esté apagado.
 * En producción queda sin definir, así que sin Access no hay identidad y el
 * Worker responde 401.
 */
export async function emailDelUsuario(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<string | null> {
  try {
    const id = await ctx.access?.getIdentity?.();
    if (id?.email) return id.email.toLowerCase();
  } catch {
    // ctx.access no disponible en este runtime: seguimos con la cabecera.
  }

  const cab = req.headers.get('Cf-Access-Authenticated-User-Email');
  if (cab) return cab.toLowerCase();

  // Solo desarrollo. Se lee con un tipo propio y no desde `Env` a propósito:
  // `wrangler types` genera `Env` a partir de wrangler.jsonc y del .dev.vars
  // local, así que en una máquina con .dev.vars la propiedad existe y en una
  // sin él no compila. Tipándola acá como opcional, el código compila igual en
  // las dos y sigue siendo indefinida en producción.
  const dev = (env as { DEV_EMAIL?: string }).DEV_EMAIL;
  if (dev) return dev.toLowerCase();

  return null;
}

/**
 * ¿La base ya tiene sus tablas?
 *
 * Sin esto, un despliegue con la base todavía vacía revienta con un "error
 * 1101" que no le dice nada a nadie. Es exactamente lo que pasa entre publicar
 * el Worker y correr las migraciones.
 */
export async function baseInicializada(env: Env): Promise<boolean> {
  try {
    const fila = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='perfiles'",
    ).first();
    return Boolean(fila);
  } catch {
    return false;
  }
}

/** Identidad + rol en un módulo concreto. */
export async function identidad(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  modulo: Modulo,
): Promise<Identidad | null> {
  const email = await emailDelUsuario(req, env, ctx);
  if (!email) return null;

  const fila = await env.DB.prepare(
    'SELECT rol, nombre FROM perfiles WHERE email = ? AND modulo = ?',
  )
    .bind(email, modulo)
    .first<{ rol: Rol; nombre: string | null }>();

  return { email, rol: fila?.rol ?? null, nombre: fila?.nombre ?? null };
}

/** ¿Puede escribir en este módulo? Solo admin y editor. */
export function puedeEscribir(id: Identidad | null): boolean {
  return id?.rol === 'admin' || id?.rol === 'editor';
}

/** ¿Puede leer? Cualquier rol asignado en el módulo. */
export function puedeLeer(id: Identidad | null): boolean {
  return id?.rol === 'admin' || id?.rol === 'editor' || id?.rol === 'lector';
}

/**
 * Deja registrada la identidad de la operación en curso, para que los triggers
 * de auditoría (Fase 3) sepan quién la hizo. SQLite no tiene equivalente a
 * auth.uid(), así que se guarda en una tabla de una sola fila.
 */
export function marcarSesion(env: Env, email: string) {
  return env.DB.prepare('UPDATE sesion_actual SET email = ? WHERE id = 1').bind(email);
}
