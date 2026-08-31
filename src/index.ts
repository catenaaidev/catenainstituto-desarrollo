/**
 * Plataforma CIW — Worker único.
 *
 * Sirve el portal y las pantallas de los tres módulos (archivos estáticos de
 * public/) y responde las APIs de cada uno. Reemplaza a los tres servidor.py.
 *
 * Quién entra lo decide Cloudflare Access (Office 365) ANTES de llegar acá.
 * Qué puede hacer cada uno, lo decide este código con la tabla `perfiles`.
 */

import { rutasPrensas, snapshot } from './prensas/rutas';
import { rutasBarriles } from './barriles/rutas';
import { rutasLotes } from './lotes/rutas';
import { emailDelUsuario, identidad, type Modulo } from './auth';
import { json } from './respuestas';

const MODULOS: Modulo[] = ['prensas', 'barriles', 'lotes'];

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const ruta = url.pathname;

    // ---- API del portal: qué módulos puede ver esta persona ----
    if (ruta === '/api/yo') {
      const email = await emailDelUsuario(req, env, ctx);
      if (!email) return json(401, { error: 'sin sesión' });

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
    // A la pantalla de cada módulo se le inyecta la identidad de Office 365,
    // para que la app no tenga que preguntar "¿quién sos?".
    const esPantallaDeModulo = MODULOS.some(
      (m) => ruta === `/${m}` || ruta === `/${m}/` || ruta === `/${m}/index.html`,
    );

    if (esPantallaDeModulo) {
      return servirConIdentidad(req, env, ctx, ruta);
    }

    return env.ASSETS.fetch(req);
  },

  /** Snapshot diario a R2 (cron de wrangler.jsonc). */
  async scheduled(_ev: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const fila = await env.DB.prepare('SELECT json, version FROM documento WHERE modulo = ?')
      .bind('prensas')
      .first<{ json: string; version: number }>();
    if (fila) {
      ctx.waitUntil(snapshot(env, JSON.parse(fila.json), fila.version));
    }
  },
} satisfies ExportedHandler<Env>;

/**
 * Sirve el index.html de un módulo con el nombre del usuario ya cargado.
 *
 * Así desaparece el cartel "¿Quién está usando la app?" sin tocar app.js: la
 * app lee ese nombre de localStorage, y acá se lo dejamos puesto con la
 * identidad verificada por Office 365.
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
    `<script>/* Identidad de Office 365 y contexto de la plataforma, puestos por el servidor. */\n` +
    // Prensas y Lotes preguntan el nombre por prompt y lo guardan acá; se lo
    // dejamos puesto para que no lo pregunten.
    `try{localStorage.setItem('prensas_usuario',${JSON.stringify(nombre)});}catch(e){}\n` +
    `try{localStorage.setItem('lotes_usuario',${JSON.stringify(nombre)});}catch(e){}\n` +
    `window.CIW=${JSON.stringify(contexto)};window.CIW_USUARIO=window.CIW;` +
    `</script>\n` +
    // Sin defer: tiene que envolver fetch ANTES de que la app haga su primer
    // pedido, o el aviso no aparece.
    `<script src="/shared/pendientes.js"></script>\n` +
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
