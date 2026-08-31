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
 *  3. DEV_EMAIL, solo para `wrangler dev` (en producción nunca se usa, porque
 *     alguna de las dos anteriores siempre responde).
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

  // Solo desarrollo local.
  if (env.DEV_EMAIL) return env.DEV_EMAIL.toLowerCase();

  return null;
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
