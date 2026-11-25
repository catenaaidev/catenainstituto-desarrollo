/**
 * Autenticación propia de la plataforma.
 *
 * La identidad ya no depende de Cloudflare Access. El usuario inicia sesión
 * con usuario + contraseña y el Worker mantiene una sesión mediante una cookie
 * HttpOnly. Los roles siguen viviendo en `perfiles`, por módulo, con el nombre
 * de usuario en la columna `email` (se llama así desde la época de Access; un
 * usuario puede ser también un email).
 *
 * Las cuentas nuevas nacen con la contraseña inicial 1234 y `debe_cambiar = 1`:
 * hasta que la cambien, la sesión solo sirve para cambiarla.
 */

export type Rol = 'admin' | 'editor' | 'lector';
export type Modulo = 'prensas' | 'barriles' | 'lotes' | 'vendimia';

export const MODULOS: Modulo[] = ['prensas', 'barriles', 'lotes', 'vendimia'];
export const ROLES: Rol[] = ['admin', 'editor', 'lector'];

/** Contraseña con la que nace (o se resetea) toda cuenta. */
export const CLAVE_INICIAL = '1234';
export const CLAVE_MINIMA = 6;

export interface Identidad {
  email: string;
  rol: Rol | null;
  nombre: string | null;
}

/** Quién tiene la sesión abierta, antes de mirar módulos. */
export interface Sesion {
  email: string;
  nombre: string | null;
  esAdmin: boolean;
  debeCambiar: boolean;
}

const COOKIE = 'ciw_session';
// La sesión se corre hacia adelante con cada uso: quien trabaja todos los días
// no queda afuera nunca a mitad de una carga (era la queja con Access). Solo se
// cierra tras SESSION_DAYS sin usar la app, o con "Salir".
const SESSION_DAYS = 30;
// La cookie dura lo máximo que aceptan los navegadores; el vencimiento real lo
// decide la tabla sesiones.
const COOKIE_DAYS = 400;
// Tras MAX_INTENTOS contraseñas mal seguidas, la cuenta queda frenada un rato.
const MAX_INTENTOS = 5;
const BLOQUEO_MINUTOS = 15;
// El uso de la sesión se anota (y el vencimiento se corre) como mucho una vez
// por este lapso: anotarlo en cada pedido eran decenas de miles de escrituras
// por día con Barriles consultando cada 3 segundos.
const RENOVAR_CADA_SEG = 3600;
// Workers no acepta más de 100.000 iteraciones de PBKDF2: con más, deriveBits
// tira una excepción y el login devuelve error 1101.
const PBKDF2_ITERATIONS = 100_000;

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
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToB64(salt)}$${hash}`;
}

async function verificarPassword(password: string, encoded: string): Promise<boolean> {
  const [alg, it, salt64, expected] = encoded.split('$');
  if (alg !== 'pbkdf2-sha256' || !it || !salt64 || !expected) return false;
  const iterations = Number(it);
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > PBKDF2_ITERATIONS) return false;
  const actual = await derivePassword(password, b64ToBytes(salt64), iterations);
  return actual === expected;
}

/** Usuario en minúsculas y sin espacios. Acepta también un email. */
export function normalizarUsuario(valor: unknown): string {
  return String(valor ?? '').trim().toLowerCase();
}

export function usuarioValido(usuario: string): boolean {
  return /^[a-z0-9._@-]{2,64}$/.test(usuario);
}

/** null si la contraseña nueva sirve; si no, el motivo. */
export function problemaClaveNueva(nueva: string): string | null {
  if (nueva.length < CLAVE_MINIMA) return `La contraseña tiene que tener al menos ${CLAVE_MINIMA} caracteres.`;
  if (nueva === CLAVE_INICIAL) return 'La contraseña nueva no puede ser la inicial.';
  return null;
}

function leerCookie(req: Request, nombre: string): string | null {
  const header = req.headers.get('Cookie') ?? '';
  for (const parte of header.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return v.join('=') || null;
  }
  return null;
}

function cookieSesion(token: string, maxAge = COOKIE_DAYS * 86400): string {
  return `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * Set-Cookie que vuelve a estirar la cookie de la sesión actual. Las sesiones
 * abiertas antes de que la cookie durara COOKIE_DAYS (salían con 7 días) se
 * renuevan solas al abrir el portal o un módulo.
 */
export function renovarCookie(req: Request): string | null {
  const token = leerCookie(req, COOKIE);
  return token ? cookieSesion(token) : null;
}

function cookieBorrada(): string {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * Deja la base lista para el login: tablas de usuarios y sesiones, columnas
 * nuevas y la cuenta `admin` / 1234 si todavía no hay ningún administrador.
 *
 * Se corre en cada login (no en cada pedido) para que el despliegue no dependa
 * de acordarse de `npm run migrar:nube`. Todo es idempotente, y coincide con
 * migrations/0002: da igual cuál de los dos corra primero.
 */
export async function prepararAutenticacion(env: Env): Promise<void> {
  // Restos de intentos anteriores de este login, con otro esquema: en
  // producción apareció una `sesiones` sin la columna `vence`, y como
  // CREATE TABLE IF NOT EXISTS no la toca, todo lo de abajo fallaba (1101).
  // Las sesiones se tiran (a lo sumo, hay que volver a entrar); una tabla de
  // usuarios incompatible se renombra, no se borra.
  const usu = await columnasDe(env, 'usuarios');
  const usuariosIncompatibles = usu.size > 0 && !(usu.has('email') && usu.has('password_hash'));
  const ses = await columnasDe(env, 'sesiones');
  const sesionesIncompatibles =
    ses.size > 0 && !['token_hash', 'email', 'creado', 'ultimo_uso', 'vence'].every((c) => ses.has(c));
  // Si se renombra usuarios, SQLite haría apuntar la clave foránea de
  // sesiones a la tabla renombrada: sesiones también se recrea.
  if (sesionesIncompatibles || (usuariosIncompatibles && ses.size > 0)) {
    await env.DB.prepare('DROP TABLE sesiones').run();
  }
  if (usuariosIncompatibles) {
    await env.DB.prepare(`ALTER TABLE usuarios RENAME TO usuarios_anterior_${Date.now()}`).run();
  }

  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS usuarios (
      email         TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      nombre        TEXT,
      activo        INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
      es_admin      INTEGER NOT NULL DEFAULT 0 CHECK (es_admin IN (0,1)),
      debe_cambiar  INTEGER NOT NULL DEFAULT 0 CHECK (debe_cambiar IN (0,1)),
      intentos_fallidos INTEGER NOT NULL DEFAULT 0,
      bloqueado_hasta   INTEGER NOT NULL DEFAULT 0,
      creado        TEXT NOT NULL DEFAULT (datetime('now')),
      actualizado   TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sesiones (
      token_hash TEXT PRIMARY KEY,
      email      TEXT NOT NULL REFERENCES usuarios(email) ON DELETE CASCADE,
      creado     INTEGER NOT NULL,
      ultimo_uso INTEGER NOT NULL,
      vence      INTEGER NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sesiones_email ON sesiones(email)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sesiones_vence ON sesiones(vence)'),
  ]);

  // Una usuarios de una versión anterior puede no tener estas columnas.
  const columnas = await columnasDe(env, 'usuarios');
  const faltantes: Array<[string, string]> = [
    ['nombre', 'TEXT'],
    ['activo', 'INTEGER NOT NULL DEFAULT 1'],
    ['es_admin', 'INTEGER NOT NULL DEFAULT 0'],
    ['debe_cambiar', 'INTEGER NOT NULL DEFAULT 0'],
    ['intentos_fallidos', 'INTEGER NOT NULL DEFAULT 0'],
    ['bloqueado_hasta', 'INTEGER NOT NULL DEFAULT 0'],
    ['creado', 'TEXT'],
    ['actualizado', 'TEXT'],
  ];
  for (const [col, def] of faltantes) {
    if (!columnas.has(col)) await env.DB.prepare(`ALTER TABLE usuarios ADD COLUMN ${col} ${def}`).run();
  }

  const hayAdmin = await env.DB.prepare(
    'SELECT 1 FROM usuarios WHERE es_admin = 1 AND activo = 1 LIMIT 1',
  ).first();
  if (hayAdmin) return;

  // Sin ningún administrador activo, `admin` vuelve a 1234 aunque ya existiera
  // (por ejemplo, de un intento anterior con otra contraseña). No se puede
  // llegar a este estado desde /admin.html: siempre queda un admin activo.
  const hash = await crearHashPassword(CLAVE_INICIAL);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO usuarios (email, password_hash, nombre, activo, es_admin, debe_cambiar)
       VALUES ('admin', ?, 'Administrador', 1, 1, 1)
       ON CONFLICT(email) DO UPDATE SET
         password_hash = excluded.password_hash, activo = 1, es_admin = 1, debe_cambiar = 1`,
    ).bind(hash),
    env.DB.prepare("DELETE FROM sesiones WHERE email = 'admin'"),
    ...MODULOS.map((m) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO perfiles (email, modulo, rol, nombre) VALUES ('admin', ?, 'admin', 'Administrador')`,
      ).bind(m),
    ),
  ]);
}

async function columnasDe(env: Env, tabla: 'usuarios' | 'sesiones'): Promise<Set<string>> {
  const { results } = await env.DB.prepare(`PRAGMA table_info(${tabla})`).all<{ name: string }>();
  return new Set((results ?? []).map((c) => c.name));
}

export async function login(
  usuarioIngresado: string,
  password: string,
  env: Env,
): Promise<Response> {
  const usuarioNorm = normalizarUsuario(usuarioIngresado);
  if (!usuarioNorm || !password) {
    return Response.json({ error: 'credenciales_invalidas' }, { status: 401 });
  }

  const usuario = await env.DB.prepare(
    `SELECT email, password_hash, nombre, activo, es_admin, debe_cambiar, intentos_fallidos, bloqueado_hasta
       FROM usuarios WHERE email = ?`,
  ).bind(usuarioNorm).first<{
    email: string;
    password_hash: string;
    nombre: string | null;
    activo: number;
    es_admin: number;
    debe_cambiar: number;
    intentos_fallidos: number;
    bloqueado_hasta: number;
  }>();

  const ahora = Math.floor(Date.now() / 1000);

  // Freno a la prueba de contraseñas: con la inicial 1234 conocida, una cuenta
  // recién creada se podía adivinar a fuerza de intentos.
  if (usuario && usuario.bloqueado_hasta > ahora) {
    const minutos = Math.ceil((usuario.bloqueado_hasta - ahora) / 60);
    return Response.json({
      error: 'bloqueado',
      detalles: [`Demasiados intentos fallidos. Probá de nuevo en ${minutos} minuto${minutos === 1 ? '' : 's'}.`],
    }, { status: 429 });
  }

  if (!usuario || usuario.activo !== 1 || !(await verificarPassword(password, usuario.password_hash))) {
    if (usuario) {
      const intentos = (usuario.intentos_fallidos ?? 0) + 1;
      await env.DB.prepare('UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE email = ?')
        .bind(intentos >= MAX_INTENTOS ? 0 : intentos, intentos >= MAX_INTENTOS ? ahora + BLOQUEO_MINUTOS * 60 : 0, usuario.email)
        .run();
    }
    return Response.json({ error: 'credenciales_invalidas' }, { status: 401 });
  }

  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToB64(tokenBytes);
  const tokenHash = await sha256(token);
  const vence = ahora + SESSION_DAYS * 86400;

  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO sesiones (token_hash, email, creado, ultimo_uso, vence) VALUES (?, ?, ?, ?, ?)',
    ).bind(tokenHash, usuario.email, ahora, ahora, vence),
    env.DB.prepare('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = 0 WHERE email = ?').bind(usuario.email),
  ]);

  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Set-Cookie': cookieSesion(token),
  });

  return new Response(JSON.stringify({
    ok: true,
    email: usuario.email,
    nombre: usuario.nombre ?? usuario.email.split('@')[0],
    es_admin: usuario.es_admin === 1,
    debe_cambiar: usuario.debe_cambiar === 1,
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

/**
 * Cambia la contraseña de quien tiene la sesión abierta y le saca la marca de
 * "debe cambiarla". Cierra sus otras sesiones: si alguien más la conocía, deja
 * de servirle.
 */
export async function cambiarClave(req: Request, env: Env): Promise<Response> {
  const s = await sesion(req, env);
  if (!s) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  const body = await req.json().catch(() => null) as { actual?: string; nueva?: string } | null;
  const actual = String(body?.actual ?? '');
  const nueva = String(body?.nueva ?? '');

  const fila = await env.DB.prepare('SELECT password_hash FROM usuarios WHERE email = ?')
    .bind(s.email).first<{ password_hash: string }>();
  if (!fila || !(await verificarPassword(actual, fila.password_hash))) {
    return Response.json({ error: 'clave_actual_incorrecta', detalles: ['La contraseña actual no es correcta.'] }, { status: 400 });
  }

  const problema = problemaClaveNueva(nueva);
  if (problema) return Response.json({ error: 'clave_invalida', detalles: [problema] }, { status: 400 });
  if (nueva === actual) {
    return Response.json({ error: 'clave_invalida', detalles: ['La contraseña nueva tiene que ser distinta de la actual.'] }, { status: 400 });
  }

  const token = leerCookie(req, COOKIE);
  const tokenHash = token ? await sha256(token) : '';
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE usuarios SET password_hash = ?, debe_cambiar = 0, actualizado = datetime('now') WHERE email = ?",
    ).bind(await crearHashPassword(nueva), s.email),
    env.DB.prepare('DELETE FROM sesiones WHERE email = ? AND token_hash <> ?').bind(s.email, tokenHash),
  ]);

  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

// Un pedido puede preguntar por la sesión varias veces (el ruteo y después el
// módulo): se resuelve una sola vez por pedido.
const sesionesPorPedido = new WeakMap<Request, Promise<Sesion | null>>();

/** La sesión del pedido, aunque todavía deba cambiar la contraseña. */
export function sesion(req: Request, env: Env): Promise<Sesion | null> {
  let p = sesionesPorPedido.get(req);
  if (!p) {
    p = buscarSesion(req, env);
    sesionesPorPedido.set(req, p);
  }
  return p;
}

async function buscarSesion(req: Request, env: Env): Promise<Sesion | null> {
  const token = leerCookie(req, COOKIE);
  if (!token) {
    // Compatibilidad exclusiva con tests existentes. Nunca se habilita en producción.
    if ((env as { TEST_MODE?: string }).TEST_MODE === '1') {
      const testEmail = req.headers.get('Cf-Access-Authenticated-User-Email');
      return testEmail ? { email: testEmail.toLowerCase(), nombre: null, esAdmin: false, debeCambiar: false } : null;
    }
    return null;
  }

  const tokenHash = await sha256(token);
  const ahora = Math.floor(Date.now() / 1000);
  type Fila = { email: string; nombre: string | null; es_admin: number; debe_cambiar: number; ultimo_uso: number };
  let fila: Fila | null;
  try {
    fila = await env.DB.prepare(
      `SELECT u.email, u.nombre, u.es_admin, u.debe_cambiar, s.ultimo_uso
         FROM sesiones s JOIN usuarios u ON u.email = s.email
        WHERE s.token_hash = ? AND s.vence > ? AND u.activo = 1`,
    ).bind(tokenHash, ahora).first<Fila>();
  } catch {
    // Tablas sin crear o sin las columnas nuevas: el próximo login las prepara.
    return null;
  }

  if (!fila?.email) return null;

  // El uso corre el vencimiento: la sesión vence por inactividad, no por edad.
  // Se anota como mucho una vez por RENOVAR_CADA_SEG.
  if (ahora - (fila.ultimo_uso ?? 0) >= RENOVAR_CADA_SEG) {
    await env.DB.prepare('UPDATE sesiones SET ultimo_uso = ?, vence = ? WHERE token_hash = ?')
      .bind(ahora, ahora + SESSION_DAYS * 86400, tokenHash).run();
  }

  return {
    email: fila.email.toLowerCase(),
    nombre: fila.nombre,
    esAdmin: fila.es_admin === 1,
    debeCambiar: fila.debe_cambiar === 1,
  };
}

/**
 * Usuario con sesión válida y ya habilitado para trabajar. Quien todavía tiene
 * la contraseña inicial queda afuera: su sesión solo sirve para cambiarla.
 */
export async function emailDelUsuario(req: Request, env: Env): Promise<string | null> {
  const s = await sesion(req, env);
  return s && !s.debeCambiar ? s.email : null;
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
  // Una vez que las tablas están, no se van: se recuerda por instancia del
  // Worker. Si no, era una consulta de ~150 ms (D1 queda lejos de Buenos
  // Aires) delante de CADA pedido a la API.
  if (_baseLista) return true;
  try {
    const fila = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='perfiles'",
    ).first();
    _baseLista = Boolean(fila);
    return _baseLista;
  } catch {
    return false;
  }
}
let _baseLista = false;

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
