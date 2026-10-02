/**
 * Plataforma CIW — Worker único.
 *
 * Sirve el portal y las pantallas de los tres módulos (archivos estáticos de
 * public/) y responde las APIs de cada uno. Reemplaza a los tres servidor.py.
 *
 * Quién entra lo decide el sistema de autenticación propio (la cuenta de la plataforma) ANTES de llegar acá.
 * Qué puede hacer cada uno, lo decide este código con la tabla `perfiles`.
 */

import { rutasPrensas, snapshot } from './prensas/rutas';
import { rutasBarriles } from './barriles/rutas';
import { rutasLotes } from './lotes/rutas';
import { emailDelUsuario, identidad, baseInicializada, login, logout, type Modulo } from './auth';
import { json } from './respuestas';
import { PLANTILLA as PLANTILLA_PRENSAS } from './prensas/reporte-plantilla';
import { construirReporte as construirReporteLotes } from './lotes/reporte';

const MODULOS: Modulo[] = ['prensas', 'barriles', 'lotes'];

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const ruta = url.pathname;

    // ---- Autenticación propia ----
    if (ruta === '/api/auth/login' && req.method === 'POST') {
      // Esta ruta no requiere sesión, pero sí necesita la migración 0002.
      if (!(await baseInicializada(env)) || !(await tablaExiste(env, 'usuarios'))) {
        return json(503, { error: 'base_sin_inicializar', detalles: ['Falta aplicar la migración de autenticación.'] });
      }
      const body = await req.json().catch(() => null) as { email?: string; password?: string } | null;
      return login(body?.email ?? '', body?.password ?? '', env);
    }

    if (ruta === '/api/auth/logout') {
      return logout(req, env);
    }

    if (ruta === '/api/auth/me') {
      const email = await emailDelUsuario(req, env);
      if (!email) return json(401, { error: 'sin_sesion' });
      const usuario = await env.DB.prepare('SELECT email, nombre FROM usuarios WHERE email = ?')
        .bind(email).first<{email:string; nombre:string|null}>();
      return json(200, { email, nombre: usuario?.nombre ?? email.split('@')[0] });
    }

    // ---- La base todavía sin tablas ----
    // Pasa entre publicar el Worker y correr las migraciones. Sin este aviso,
    // la primera consulta revienta con un "error 1101" ilegible.
    //
    // Solo se comprueba en las rutas que tocan la base: el portal y los
    // archivos estáticos tienen que seguir sirviéndose igual (así el aviso se
    // ve DENTRO del portal), y sería una consulta de más en cada pedido.
    const tocaLaBase =
      ruta.startsWith('/api/') ||
      MODULOS.some((m) => ruta.startsWith(`/${m}/api`) || ruta.startsWith(`/${m}/reporte`)) ||
      MODULOS.some((m) => ruta === `/${m}` || ruta === `/${m}/` || ruta === `/${m}/index.html`);

    if (tocaLaBase && !(await baseInicializada(env))) {
      return json(503, {
        error: 'base_sin_inicializar',
        detalles: [
          'La base de datos todavía no tiene sus tablas.',
          'Falta correr las migraciones: npx wrangler d1 migrations apply catenainstitute --remote',
          'Y después importar los datos (paso 5 de DESPLIEGUE.md).',
        ],
      });
    }

    // ---- API del portal: qué módulos puede ver esta persona ----
    if (ruta === '/api/yo') {
      const email = await emailDelUsuario(req, env);
      if (!email) {
        return json(401, {
          error: 'sin_sesion',
          detalles: ['Tu sesión no está iniciada o venció.', 'Ingresá nuevamente desde /login.html.'],
        });
      }

      const { results } = await env.DB.prepare(
        'SELECT modulo, rol, nombre FROM perfiles WHERE email = ?',
      )
        .bind(email)
        .all<{ modulo: string; rol: string; nombre: string | null }>();

      return json(200, {
        email,
        nombre: results?.[0]?.nombre ?? email.split('@')[0],
        modulos: Object.fromEntries((results ?? []).map((r) => [r.modulo, r.rol])),
      });
    }

    // ---- Reporte de gerencia, en vivo ----
    // Antes era un archivo que Python reescribía en cada guardado y alguien
    // tenía que mandar por mail. Ahora es una página: nunca queda vieja.
    for (const modulo of ['prensas', 'lotes'] as const) {
      if (ruta === `/${modulo}/reporte` || ruta === `/${modulo}/reporte/`) {
        return servirReporte(req, env, ctx, modulo);
      }
    }

    // ---- APIs de cada módulo ----
    for (const modulo of MODULOS) {
      const prefijo = `/${modulo}/api`;
      if (ruta.startsWith(prefijo + '/') || ruta === prefijo) {
        const sub = ruta.slice(prefijo.length) || '/';
        const handler =
          modulo === 'prensas' ? rutasPrensas : modulo === 'barriles' ? rutasBarriles : rutasLotes;

        const r = await handler(req, env, ctx, sub);
        if (r) return r;
        return json(404, { error: `no existe ${req.method} ${ruta}` });
      }
    }

    // ---- Archivos estáticos ----
    // A la pantalla de cada módulo se le inyecta la identidad de la cuenta de la plataforma,
    // para que la app no tenga que preguntar "¿quién sos?".
    const esPantallaDeModulo = MODULOS.some(
      (m) => ruta === `/${m}` || ruta === `/${m}/` || ruta === `/${m}/index.html`,
    );

    if (esPantallaDeModulo) {
      return servirConIdentidad(req, env, ctx, ruta);
    }

    // El portal también es privado. La página de login queda pública.
    if (ruta === '/' || ruta === '/index.html') {
      const email = await emailDelUsuario(req, env);
      if (!email) return Response.redirect(new URL('/login.html', req.url).toString(), 302);
    }

    return env.ASSETS.fetch(req);
  },

  /** Snapshot diario a R2 (cron de wrangler.jsonc). */
  async scheduled(_ev: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(env.DB.prepare('DELETE FROM sesiones WHERE vence <= ?').bind(Math.floor(Date.now() / 1000)).run());
    const fila = await env.DB.prepare('SELECT json, version FROM documento WHERE modulo = ?')
      .bind('prensas')
      .first<{ json: string; version: number }>();
    if (fila) {
      ctx.waitUntil(snapshot(env, JSON.parse(fila.json), fila.version));
    }
  },
} satisfies ExportedHandler<Env>;

async function tablaExiste(env: Env, nombre: string): Promise<boolean> {
  try {
    const fila = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
    ).bind(nombre).first();
    return Boolean(fila);
  } catch {
    return false;
  }
}

/**
 * Sirve el index.html de un módulo con el nombre del usuario ya cargado.
 *
 * Así desaparece el cartel "¿Quién está usando la app?" sin tocar app.js: la
 * app lee ese nombre de localStorage, y acá se lo dejamos puesto con la
 * identidad verificada por la cuenta de la plataforma.
 */
async function servirConIdentidad(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  ruta: string,
): Promise<Response> {
  const modulo = ruta.split('/')[1] as Modulo;
  const id = await identidad(req, env, ctx, modulo);

  // Se pide la ruta canónica con barra final: el manejador de assets redirige
  // /prensas/index.html a /prensas/, y eso nos dejaría en un bucle.
  const url = new URL(req.url);
  url.pathname = `/${modulo}/`;
  const res = await env.ASSETS.fetch(new Request(url, { method: 'GET', headers: req.headers }));

  const tipo = res.headers.get('Content-Type') ?? '';
  if (!res.ok || !id || !tipo.includes('text/html')) return res;

  // Sin rol en este módulo no se entrega la pantalla: se manda al portal, que
  // explica qué pasa. Sin esto, la app cargaría vacía y parecería rota.
  if (!id.rol) return Response.redirect(new URL('/', req.url).toString(), 302);

  const nombre = id.nombre ?? id.email.split('@')[0];

  // Roles en TODOS los módulos: la barra solo ofrece los que puede abrir.
  const { results } = await env.DB.prepare('SELECT modulo, rol FROM perfiles WHERE email = ?')
    .bind(id.email)
    .all<{ modulo: string; rol: string }>();
  const modulos = Object.fromEntries((results ?? []).map((r) => [r.modulo, r.rol]));

  const contexto = { email: id.email, nombre, rol: id.rol, modulo, modulos };

  const inyeccion =
    `<script>/* Identidad de la cuenta de la plataforma y contexto de la plataforma, puestos por el servidor. */\n` +
    // Prensas y Lotes preguntan el nombre por prompt y lo guardan acá; se lo
    // dejamos puesto para que no lo pregunten.
    `try{localStorage.setItem('prensas_usuario',${JSON.stringify(nombre)});}catch(e){}\n` +
    `try{localStorage.setItem('lotes_usuario',${JSON.stringify(nombre)});}catch(e){}\n` +
    `window.CIW=${JSON.stringify(contexto)};window.CIW_USUARIO=window.CIW;` +
    `</script>\n` +
    // Sin defer: tiene que envolver fetch ANTES de que la app haga su primer
    // pedido, o el aviso no aparece.
    `<script src="/shared/pendientes.js"></script>\n` +
    // La exportación a Excel se arma en el navegador, porque la nube no
    // ejecuta openpyxl. Solo se carga donde hay botón de exportar: es 950 KB.
    (modulo === 'prensas' || modulo === 'lotes'
      ? `<script defer src="/shared/xlsx.full.min.js"></script>\n` +
        `<script defer src="/shared/exportar.js"></script>\n`
      : '') +
    `<script defer src="/shared/barra.js"></script>\n</head>`;

  const html = (await res.text()).replace('</head>', inyeccion);

  return new Response(html, {
    status: res.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Sirve el reporte de gerencia en vivo.
 *
 * Es la misma página que generaba `reporte.py`, con los mismos números. Lo que
 * cambia es cuándo se arma: antes se escribía a disco en cada guardado (y podía
 * quedar vieja si nadie guardaba), ahora se arma al pedirla.
 *
 * Solo lectura: no hay forma de editar desde acá, así que alcanza con tener
 * cualquier rol en el módulo.
 */
async function servirReporte(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  modulo: 'prensas' | 'lotes',
): Promise<Response> {
  const id = await identidad(req, env, ctx, modulo);
  if (!id?.rol) {
    return new Response('No tenés acceso a este reporte. Pedíselo a un administrador.', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const fila = await env.DB.prepare('SELECT version, json FROM documento WHERE modulo = ?')
    .bind(modulo)
    .first<{ version: number; json: string }>();
  if (!fila) return new Response('Todavía no hay datos de este módulo.', { status: 404 });

  const datos = JSON.parse(fila.json);
  const ahora = ahoraBodega(env.TZ_BODEGA);
  const hoy = Date.parse(ahora.slice(0, 10) + 'T00:00:00Z');

  let html: string;
  if (modulo === 'lotes') {
    html = construirReporteLotes(datos, fila.version, ahora, hoy);
  } else {
    // La plantilla de Prensas trae su propio JS y renderiza en el navegador:
    // solo hay que inyectarle los datos, igual que hacía generar() en Python.
    const datosJson = JSON.stringify(datos).replace(/<\//g, '<\/');
    const meta = (datos.meta ?? {}) as Record<string, unknown>;
    const mes = Number(meta.mes_actual) || 1;
    html = PLANTILLA_PRENSAS.replace('__DATOS__', datosJson)
      .replace('__MES_ACTUAL__', String(mes))
      .replace('__REF_FECHA__', ahora.slice(0, 10))
      .replace('__VERSION__', String(fila.version))
      .replace('__GENERADO__', ahora);
  }

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Fecha y hora en la bodega: YYYY-MM-DD HH:MM */
function ahoraBodega(tz: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
    .format(new Date())
    .replace('T', ' ');
}
