/**
 * Administración de usuarios: alta, edición y baja.
 *
 * Solo para cuentas con `es_admin = 1` (que es distinto del rol "admin" de un
 * módulo: ese decide qué se puede hacer dentro del módulo, este decide quién
 * entra a la plataforma).
 *
 * Toda cuenta nueva, y toda cuenta a la que se le resetea la contraseña, queda
 * con la contraseña inicial 1234 y obligada a cambiarla al entrar.
 */

import {
  sesion,
  crearHashPassword,
  normalizarUsuario,
  usuarioValido,
  CLAVE_INICIAL,
  MODULOS,
  ROLES,
  type Rol,
  type Sesion,
} from './auth';
import { json } from './respuestas';

interface Cambios {
  usuario?: unknown;
  nombre?: unknown;
  activo?: unknown;
  es_admin?: unknown;
  modulos?: unknown;
  resetear_clave?: unknown;
}

/** Rol por módulo; un módulo ausente o vacío significa "sin acceso". */
function leerModulos(valor: unknown): Partial<Record<string, Rol>> | string {
  if (valor == null) return {};
  if (typeof valor !== 'object') return 'Los permisos por módulo vienen mal armados.';
  const salida: Partial<Record<string, Rol>> = {};
  for (const [modulo, rol] of Object.entries(valor as Record<string, unknown>)) {
    if (!MODULOS.includes(modulo as never)) return `No existe el módulo ${modulo}.`;
    if (rol == null || rol === '') continue;
    if (!ROLES.includes(rol as Rol)) return `El rol ${String(rol)} no existe.`;
    salida[modulo] = rol as Rol;
  }
  return salida;
}

function perfilesDe(env: Env, usuario: string, nombre: string, modulos: Partial<Record<string, Rol>>) {
  return [
    env.DB.prepare('DELETE FROM perfiles WHERE email = ?').bind(usuario),
    ...Object.entries(modulos).map(([modulo, rol]) =>
      env.DB.prepare('INSERT INTO perfiles (email, modulo, rol, nombre) VALUES (?, ?, ?, ?)')
        .bind(usuario, modulo, rol, nombre),
    ),
  ];
}

async function otrosAdminsActivos(env: Env, usuario: string): Promise<number> {
  const fila = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM usuarios WHERE es_admin = 1 AND activo = 1 AND email <> ?',
  ).bind(usuario).first<{ n: number }>();
  return fila?.n ?? 0;
}

export async function rutasAdmin(req: Request, env: Env, sub: string): Promise<Response> {
  const yo = await sesion(req, env);
  if (!yo) return json(401, { error: 'sin_sesion' });
  if (yo.debeCambiar) return json(403, { error: 'debe_cambiar_clave' });
  if (!yo.esAdmin) {
    return json(403, { error: 'sin_permiso', detalles: ['Solo un administrador puede gestionar usuarios.'] });
  }

  if (sub === '/usuarios' && req.method === 'GET') return listar(env);
  if (sub === '/usuarios' && req.method === 'POST') return crear(req, env);

  const m = sub.match(/^\/usuarios\/([^/]+)$/);
  if (m) {
    const usuario = normalizarUsuario(decodeURIComponent(m[1]));
    if (req.method === 'PUT') return editar(req, env, yo, usuario);
    if (req.method === 'DELETE') return eliminar(env, yo, usuario);
  }

  return json(404, { error: `no existe ${req.method} /api/admin${sub}` });
}

async function listar(env: Env): Promise<Response> {
  const { results: usuarios } = await env.DB.prepare(
    `SELECT email, nombre, activo, es_admin, debe_cambiar, creado, actualizado
       FROM usuarios ORDER BY email`,
  ).all<{
    email: string; nombre: string | null; activo: number; es_admin: number;
    debe_cambiar: number; creado: string; actualizado: string;
  }>();
  const { results: perfiles } = await env.DB.prepare('SELECT email, modulo, rol FROM perfiles')
    .all<{ email: string; modulo: string; rol: string }>();

  const porUsuario = new Map<string, Record<string, string>>();
  for (const p of perfiles ?? []) {
    const mods = porUsuario.get(p.email) ?? {};
    mods[p.modulo] = p.rol;
    porUsuario.set(p.email, mods);
  }

  return json(200, {
    usuarios: (usuarios ?? []).map((u) => ({
      usuario: u.email,
      nombre: u.nombre ?? '',
      activo: u.activo === 1,
      es_admin: u.es_admin === 1,
      debe_cambiar: u.debe_cambiar === 1,
      creado: u.creado,
      actualizado: u.actualizado,
      modulos: porUsuario.get(u.email) ?? {},
    })),
  });
}

async function crear(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as Cambios | null;
  const usuario = normalizarUsuario(body?.usuario);
  if (!usuarioValido(usuario)) {
    return json(400, {
      error: 'usuario_invalido',
      detalles: ['El usuario tiene que tener entre 2 y 64 caracteres: letras, números, punto, guion, guion bajo o @.'],
    });
  }
  const nombre = String(body?.nombre ?? '').trim() || usuario;
  const modulos = leerModulos(body?.modulos);
  if (typeof modulos === 'string') return json(400, { error: 'modulos_invalidos', detalles: [modulos] });

  const existe = await env.DB.prepare('SELECT 1 FROM usuarios WHERE email = ?').bind(usuario).first();
  if (existe) return json(409, { error: 'usuario_existente', detalles: [`Ya existe el usuario ${usuario}.`] });

  const hash = await crearHashPassword(CLAVE_INICIAL);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO usuarios (email, password_hash, nombre, activo, es_admin, debe_cambiar)
       VALUES (?, ?, ?, ?, ?, 1)`,
    ).bind(usuario, hash, nombre, body?.activo === false ? 0 : 1, body?.es_admin === true ? 1 : 0),
    // Sin módulos elegidos se respetan los perfiles que ya hubiera con ese
    // nombre (los de la época de Access, cargados por email): así se le da
    // cuenta a alguien que ya tenía permisos sin tener que volver a cargarlos.
    ...(Object.keys(modulos).length > 0
      ? perfilesDe(env, usuario, nombre, modulos)
      : [env.DB.prepare('UPDATE perfiles SET nombre = ? WHERE email = ?').bind(nombre, usuario)]),
  ]);

  return json(201, { ok: true, usuario, clave_inicial: CLAVE_INICIAL });
}

async function editar(req: Request, env: Env, yo: Sesion, usuario: string): Promise<Response> {
  const actual = await env.DB.prepare('SELECT email, nombre, activo, es_admin FROM usuarios WHERE email = ?')
    .bind(usuario).first<{ email: string; nombre: string | null; activo: number; es_admin: number }>();
  if (!actual) return json(404, { error: 'no_existe', detalles: [`No existe el usuario ${usuario}.`] });

  const body = (await req.json().catch(() => null)) as Cambios | null;
  if (!body) return json(400, { error: 'pedido_invalido' });

  const nuevoUsuario = body.usuario === undefined ? usuario : normalizarUsuario(body.usuario);
  if (!usuarioValido(nuevoUsuario)) {
    return json(400, {
      error: 'usuario_invalido',
      detalles: ['El usuario tiene que tener entre 2 y 64 caracteres: letras, números, punto, guion, guion bajo o @.'],
    });
  }
  const nombre = body.nombre === undefined ? (actual.nombre ?? usuario) : String(body.nombre).trim() || nuevoUsuario;
  const activo = body.activo === undefined ? actual.activo : body.activo ? 1 : 0;
  const esAdmin = body.es_admin === undefined ? actual.es_admin : body.es_admin ? 1 : 0;
  const esUnoMismo = usuario === yo.email;

  if (esUnoMismo && (activo === 0 || esAdmin === 0)) {
    return json(400, {
      error: 'no_permitido',
      detalles: ['No podés desactivarte ni quitarte el permiso de administrador a vos mismo.'],
    });
  }
  if ((activo === 0 || esAdmin === 0) && actual.es_admin === 1 && (await otrosAdminsActivos(env, usuario)) === 0) {
    return json(400, { error: 'no_permitido', detalles: ['Tiene que quedar al menos un administrador activo.'] });
  }

  const renombrar = nuevoUsuario !== usuario;
  if (renombrar) {
    const ocupado = await env.DB.prepare('SELECT 1 FROM usuarios WHERE email = ?').bind(nuevoUsuario).first();
    if (ocupado) return json(409, { error: 'usuario_existente', detalles: [`Ya existe el usuario ${nuevoUsuario}.`] });
  }

  let modulos: Partial<Record<string, Rol>> | null = null;
  if (body.modulos !== undefined) {
    const leidos = leerModulos(body.modulos);
    if (typeof leidos === 'string') return json(400, { error: 'modulos_invalidos', detalles: [leidos] });
    modulos = leidos;
  }

  const resetear = body.resetear_clave === true;
  const sentencias: D1PreparedStatement[] = [];

  // Renombrar, desactivar o resetear la clave cierra las sesiones abiertas de
  // esa cuenta. Al renombrar además hace falta: sesiones apunta a usuarios por
  // clave foránea y no se puede cambiar la clave con filas colgando.
  if (renombrar || activo === 0 || resetear) {
    sentencias.push(env.DB.prepare('DELETE FROM sesiones WHERE email = ?').bind(usuario));
  }
  sentencias.push(
    env.DB.prepare(
      `UPDATE usuarios SET email = ?, nombre = ?, activo = ?, es_admin = ?, actualizado = datetime('now')
        WHERE email = ?`,
    ).bind(nuevoUsuario, nombre, activo, esAdmin, usuario),
  );
  if (resetear) {
    sentencias.push(
      env.DB.prepare('UPDATE usuarios SET password_hash = ?, debe_cambiar = 1 WHERE email = ?')
        .bind(await crearHashPassword(CLAVE_INICIAL), nuevoUsuario),
    );
  }
  if (modulos) {
    if (renombrar) sentencias.push(env.DB.prepare('DELETE FROM perfiles WHERE email = ?').bind(usuario));
    sentencias.push(...perfilesDe(env, nuevoUsuario, nombre, modulos));
  } else {
    // Puede haber perfiles sueltos de la época de Access con el nombre nuevo:
    // chocarían con la clave primaria (email, modulo).
    if (renombrar) sentencias.push(env.DB.prepare('DELETE FROM perfiles WHERE email = ?').bind(nuevoUsuario));
    sentencias.push(
      env.DB.prepare('UPDATE perfiles SET email = ?, nombre = ? WHERE email = ?').bind(nuevoUsuario, nombre, usuario),
    );
  }

  await env.DB.batch(sentencias);
  return json(200, { ok: true, usuario: nuevoUsuario, clave_reseteada: resetear });
}

async function eliminar(env: Env, yo: Sesion, usuario: string): Promise<Response> {
  if (usuario === yo.email) {
    return json(400, { error: 'no_permitido', detalles: ['No podés eliminar tu propio usuario.'] });
  }
  const actual = await env.DB.prepare('SELECT es_admin FROM usuarios WHERE email = ?')
    .bind(usuario).first<{ es_admin: number }>();
  if (!actual) return json(404, { error: 'no_existe', detalles: [`No existe el usuario ${usuario}.`] });
  if (actual.es_admin === 1 && (await otrosAdminsActivos(env, usuario)) === 0) {
    return json(400, { error: 'no_permitido', detalles: ['Tiene que quedar al menos un administrador activo.'] });
  }

  // El historial conserva el nombre de quien guardó: no se toca.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sesiones WHERE email = ?').bind(usuario),
    env.DB.prepare('DELETE FROM perfiles WHERE email = ?').bind(usuario),
    env.DB.prepare('DELETE FROM usuarios WHERE email = ?').bind(usuario),
  ]);
  return json(200, { ok: true });
}
