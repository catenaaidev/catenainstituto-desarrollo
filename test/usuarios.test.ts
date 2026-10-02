/**
 * Login con usuario y contraseña, cambio obligatorio de la contraseña inicial
 * y administración de usuarios.
 *
 * Va contra el Worker entero (index.ts), con la cookie de sesión de verdad.
 */

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const BASE = 'https://catenainstitute.example';

async function pedir(ruta: string, opciones: { metodo?: string; cookie?: string; cuerpo?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opciones.cookie) headers.Cookie = opciones.cookie;
  if (opciones.cuerpo !== undefined) headers['Content-Type'] = 'application/json';
  const req = new Request(BASE + ruta, {
    method: opciones.metodo ?? 'GET',
    headers,
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    redirect: 'manual',
  });
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function entrar(usuario: string, password: string) {
  const res = await pedir('/api/auth/login', { metodo: 'POST', cuerpo: { usuario, password } });
  const setCookie = res.headers.get('Set-Cookie') ?? '';
  const cookie = setCookie.split(';')[0];
  return { res, cookie, cuerpo: res.ok ? await res.json<Record<string, unknown>>() : null };
}

describe('login con usuario y contraseña', () => {
  it('la cuenta admin / 1234 existe desde el primer login y obliga a cambiar la contraseña', async () => {
    const { res, cookie, cuerpo } = await entrar('admin', '1234');
    expect(res.status).toBe(200);
    expect(cuerpo).toMatchObject({ es_admin: true, debe_cambiar: true });

    // Con la contraseña inicial no se ve ningún módulo ni se administra nada.
    const yo = await pedir('/api/yo', { cookie });
    expect(yo.status).toBe(403);
    await expect(yo.json()).resolves.toMatchObject({ error: 'debe_cambiar_clave' });
    expect((await pedir('/api/admin/usuarios', { cookie })).status).toBe(403);
    const pantalla = await pedir('/prensas/', { cookie });
    expect(pantalla.status).toBe(302);
    expect(pantalla.headers.get('Location')).toContain('/cambiar-clave.html');

    // La nueva no puede ser 1234.
    const mala = await pedir('/api/auth/cambiar-clave', {
      metodo: 'POST', cookie, cuerpo: { actual: '1234', nueva: '1234' },
    });
    expect(mala.status).toBe(400);

    const ok = await pedir('/api/auth/cambiar-clave', {
      metodo: 'POST', cookie, cuerpo: { actual: '1234', nueva: 'bodega2026' },
    });
    expect(ok.status).toBe(200);

    const yoDespues = await pedir('/api/yo', { cookie });
    expect(yoDespues.status).toBe(200);
    await expect(yoDespues.json()).resolves.toMatchObject({
      email: 'admin',
      es_admin: true,
      modulos: { prensas: 'admin', barriles: 'admin', lotes: 'admin' },
    });

    // La contraseña vieja ya no sirve.
    expect((await entrar('admin', '1234')).res.status).toBe(401);
  });

  it('rechaza credenciales incorrectas', async () => {
    expect((await entrar('admin', 'otra')).res.status).toBe(401);
    expect((await entrar('nadie', '1234')).res.status).toBe(401);
  });
});

describe('administración de usuarios', () => {
  async function adminListo() {
    const { cookie } = await entrar('admin', '1234');
    await pedir('/api/auth/cambiar-clave', {
      metodo: 'POST', cookie, cuerpo: { actual: '1234', nueva: 'bodega2026' },
    });
    return cookie;
  }

  it('crea, edita, resetea y elimina usuarios', async () => {
    const admin = await adminListo();

    const alta = await pedir('/api/admin/usuarios', {
      metodo: 'POST', cookie: admin,
      cuerpo: { usuario: 'Laboratorio', nombre: 'Laboratorio', modulos: { prensas: 'editor', lotes: 'lector' } },
    });
    expect(alta.status).toBe(201);

    // Repetido: no.
    const repetido = await pedir('/api/admin/usuarios', {
      metodo: 'POST', cookie: admin, cuerpo: { usuario: 'laboratorio' },
    });
    expect(repetido.status).toBe(409);

    // El nuevo entra con 1234 y tiene que cambiarla.
    const lab = await entrar('laboratorio', '1234');
    expect(lab.cuerpo).toMatchObject({ debe_cambiar: true, es_admin: false });
    await pedir('/api/auth/cambiar-clave', {
      metodo: 'POST', cookie: lab.cookie, cuerpo: { actual: '1234', nueva: 'labo-propia' },
    });
    const yoLab = await pedir('/api/yo', { cookie: lab.cookie });
    await expect(yoLab.json()).resolves.toMatchObject({ modulos: { prensas: 'editor', lotes: 'lector' } });

    // Un usuario común no administra.
    expect((await pedir('/api/admin/usuarios', { cookie: lab.cookie })).status).toBe(403);

    // Editar permisos y nombre.
    const edicion = await pedir('/api/admin/usuarios/laboratorio', {
      metodo: 'PUT', cookie: admin,
      cuerpo: { nombre: 'Lab', modulos: { barriles: 'editor' } },
    });
    expect(edicion.status).toBe(200);
    const lista = await (await pedir('/api/admin/usuarios', { cookie: admin }))
      .json<{ usuarios: Array<{ usuario: string; nombre: string; modulos: Record<string, string> }> }>();
    expect(lista.usuarios.find((u) => u.usuario === 'laboratorio')).toMatchObject({
      nombre: 'Lab',
      modulos: { barriles: 'editor' },
    });

    // Resetear la contraseña cierra su sesión y vuelve a 1234.
    const reset = await pedir('/api/admin/usuarios/laboratorio', {
      metodo: 'PUT', cookie: admin, cuerpo: { resetear_clave: true },
    });
    expect(reset.status).toBe(200);
    expect((await pedir('/api/yo', { cookie: lab.cookie })).status).toBe(401);
    expect((await entrar('laboratorio', '1234')).cuerpo).toMatchObject({ debe_cambiar: true });

    // Eliminar.
    const baja = await pedir('/api/admin/usuarios/laboratorio', { metodo: 'DELETE', cookie: admin });
    expect(baja.status).toBe(200);
    expect((await entrar('laboratorio', '1234')).res.status).toBe(401);
    const perfiles = await env.DB.prepare("SELECT COUNT(*) AS n FROM perfiles WHERE email = 'laboratorio'")
      .first<{ n: number }>();
    expect(perfiles?.n).toBe(0);
  });

  it('no deja eliminarse a sí mismo ni quedarse sin administradores', async () => {
    const admin = await adminListo();

    expect((await pedir('/api/admin/usuarios/admin', { metodo: 'DELETE', cookie: admin })).status).toBe(400);
    const quitarse = await pedir('/api/admin/usuarios/admin', {
      metodo: 'PUT', cookie: admin, cuerpo: { es_admin: false },
    });
    expect(quitarse.status).toBe(400);
  });
});
