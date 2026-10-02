/**
 * Autenticación propia de la plataforma.
 *
 * La identidad ya no depende de Cloudflare Access. El usuario inicia sesión
 * con email + contraseña y el Worker mantiene una sesión mediante una cookie
 * HttpOnly. Los roles siguen viviendo en `perfiles`, por módulo.
 */

export type Rol = 'admin' | 'editor' | 'lector';
export type Modulo = 'prensas' | 'barriles' | 'lotes';

export interface Identidad {
  email: string;
  rol: Rol | null;
  nombre: string | null;
}

const COOKIE = 'ciw_session';
const SESSION_DAYS = 7;
const PBKDF2_ITERATIONS = 120_000;

function bytesToB64(bytes: ArrayBuffer | Uint8Array): string {
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of a) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64ToBytes(value: string): Uint8Array {
  const s = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function sha256(value: string): Promise<string> {
  return bytesToB64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function derivePassword(password: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return bytesToB64(bits);
}

export async function crearHashPassword(password: string): Promise<string> {
  if (password.length < 10) throw new Error('La contraseña debe tener al menos 10 caracteres.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToB64(salt)}$${hash}`;
}

async function verificarPassword(password: string, encoded: string): Promise<boolean> {
  const [alg, it, salt64, expected] = encoded.split('$');
  if (alg !== 'pbkdf2-sha256' || !it || !salt64 || !expected) return false;
  const iterations = Number(it);
  if (!Number.isInteger(iterations) || iterations < 50_000 || iterations > 1_000_000) return false;
  const actual = await derivePassword(password, b64ToBytes(salt64), iterations);
  return actual === expected;
}

function leerCookie(req: Request, nombre: string): string | null {
  const header = req.headers.get('Cookie') ?? '';
  for (const parte of header.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return v.join('=') || null;
  }
  return null;
}

function cookieSesion(token: string, maxAge = SESSION_DAYS * 86400): string {
  return `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function cookieBorrada(): string {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function login(
  email: string,
  password: string,
  env: Env,
): Promise<Response> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) {
    return Response.json({ error: 'credenciales_invalidas' }, { status: 401 });
  }

  const usuario = await env.DB.prepare(
    'SELECT email, password_hash, nombre, activo FROM usuarios WHERE email = ?',
  ).bind(normalized).first<{
    email: string;
    password_hash: string;
    nombre: string | null;
    activo: number;
  }>();

  if (!usuario || usuario.activo !== 1 || !(await verificarPassword(password, usuario.password_hash))) {
    return Response.json({ error: 'credenciales_invalidas' }, { status: 401 });
  }

  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToB64(tokenBytes);
  const tokenHash = await sha256(token);
  const ahora = Math.floor(Date.now() / 1000);
  const vence = ahora + SESSION_DAYS * 86400;

  await env.DB.prepare(
    'INSERT INTO sesiones (token_hash, email, creado, ultimo_uso, vence) VALUES (?, ?, ?, ?, ?)',
  ).bind(tokenHash, normalized, ahora, ahora, vence).run();

  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Set-Cookie': cookieSesion(token),
  });

  return new Response(JSON.stringify({
    ok: true,
    email: usuario.email,
    nombre: usuario.nombre ?? usuario.email.split('@')[0],
  }), { status: 200, headers });
}

export async function logout(req: Request, env: Env): Promise<Response> {
  const token = leerCookie(req, COOKIE);
  if (token) {
    try {
      const tokenHash = await sha256(token);
      await env.DB.prepare('DELETE FROM sesiones WHERE token_hash = ?').bind(tokenHash).run();
    } catch {
      // La cookie se borra aunque la sesión ya no exista o D1 no responda.
    }
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/login.html',
      'Set-Cookie': cookieBorrada(),
      'Cache-Control': 'no-store',
    },
  });
}

export async function emailDelUsuario(req: Request, env: Env): Promise<string | null> {
  const token = leerCookie(req, COOKIE);
  if (!token) {
    // Compatibilidad exclusiva con tests existentes. Nunca se habilita en producción.
    if ((env as { TEST_MODE?: string }).TEST_MODE === '1') {
      const testEmail = req.headers.get('Cf-Access-Authenticated-User-Email');
      return testEmail?.toLowerCase() ?? null;
    }
    return null;
  }

  const tokenHash = await sha256(token);
  const ahora = Math.floor(Date.now() / 1000);
  const fila = await env.DB.prepare(
    'SELECT email FROM sesiones WHERE token_hash = ? AND vence > ?',
  ).bind(tokenHash, ahora).first<{ email: string }>();

  if (!fila?.email) return null;

  // Renueva la actividad sin extender artificialmente la fecha de vencimiento.
  await env.DB.prepare('UPDATE sesiones SET ultimo_uso = ? WHERE token_hash = ?')
    .bind(ahora, tokenHash).run();

  return fila.email.toLowerCase();
}

export async function autenticar(
  req: Request,
  env: Env,
): Promise<{ email: string } | null> {
  const email = await emailDelUsuario(req, env);
  return email ? { email } : null;
}

/**
 * El login propio se usa también para comprobar que D1 ya está migrada.
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
  _ctx: ExecutionContext,
  modulo: Modulo,
): Promise<Identidad | null> {
  const email = await emailDelUsuario(req, env);
  if (!email) return null;

  const fila = await env.DB.prepare(
    'SELECT rol, nombre FROM perfiles WHERE email = ? AND modulo = ?',
  ).bind(email, modulo).first<{ rol: Rol; nombre: string | null }>();

  return { email, rol: fila?.rol ?? null, nombre: fila?.nombre ?? null };
}

export function puedeEscribir(id: Identidad | null): boolean {
  return id?.rol === 'admin' || id?.rol === 'editor';
}

export function puedeLeer(id: Identidad | null): boolean {
  return id?.rol === 'admin' || id?.rol === 'editor' || id?.rol === 'lector';
}

export function marcarSesion(env: Env, email: string) {
  return env.DB.prepare('UPDATE sesion_actual SET email = ? WHERE id = 1').bind(email);
}
