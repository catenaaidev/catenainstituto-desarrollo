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
import {
  emailDelUsuario,
  identidad,
  baseInicializada,
  login,
  logout,
  sesion,
  cambiarClave,
  prepararAutenticacion,
  renovarCookie,
  type Modulo,
} from './auth';
import { rutasAdmin } from './admin';
import { json } from './respuestas';
import { PLANTILLA as PLANTILLA_PRENSAS } from './prensas/reporte-plantilla';
import { construirReporte as construirReporteLotes } from './lotes/reporte';

const MODULOS: Modulo[] = ['prensas', 'barriles', 'lotes'];
const ICONO = '<link rel="icon" type="image/svg+xml" href="/favicon.svg">\n';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const ruta = url.pathname;

    // ---- Autenticación propia ----
    if (ruta === '/api/auth/login' && req.method === 'POST') {
      // Esta ruta no requiere sesión. Las tablas de usuarios las crea ella
      // misma si faltan (con la cuenta admin / 1234); perfiles viene de 0001.
      if (!(await baseInicializada(env))) {
        return json(503, { error: 'base_sin_inicializar', detalles: ['Falta aplicar las migraciones de la base.'] });
      }
      // Sin este try, una falla acá es un "error 1101" mudo y la pantalla de
      // login lo muestra como contraseña incorrecta.
      try {
        await prepararAutenticacion(env);
        const body = await req.json().catch(() => null) as { usuario?: string; email?: string; password?: string } | null;
        return await login(body?.usuario ?? body?.email ?? '', body?.password ?? '', env);
      } catch (e) {
        console.error('login', e);
        return json(500, { error: 'error_interno', detalles: [e instanceof Error ? e.message : String(e)] });
      }
    }

    if (ruta === '/api/auth/logout') {
      return logout(req, env);
    }

    if (ruta === '/api/auth/me') {
      const s = await sesion(req, env);
      if (!s) return json(401, { error: 'sin_sesion' });
      return json(200, {
        email: s.email,
        nombre: s.nombre ?? s.email.split('@')[0],
        es_admin: s.esAdmin,
        debe_cambiar: s.debeCambiar,
      });
    }

    if (ruta === '/api/auth/cambiar-clave' && req.method === 'POST') {
      return cambiarClave(req, env);
    }

    // ---- Administración de usuarios ----
    if (ruta.startsWith('/api/admin/')) {
      return rutasAdmin(req, env, ruta.slice('/api/admin'.length));
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

    // ---- Contraseña inicial sin cambiar ----
    // Con la contraseña 1234 la sesión solo sirve para cambiarla. Los módulos
    // ya la rechazan por su cuenta (identidad() devuelve null); acá se le
    // explica a la pantalla qué pasa en vez de un 403 genérico.
    if (tocaLaBase) {
      const s = await sesion(req, env);
      if (s?.debeCambiar) {
        const esPantalla = MODULOS.some((m) => ruta === `/${m}` || ruta === `/${m}/` || ruta === `/${m}/index.html`);
        if (esPantalla) return Response.redirect(new URL('/cambiar-clave.html', req.url).toString(), 302);
        return json(403, {
          error: 'debe_cambiar_clave',
          detalles: ['Tenés que cambiar la contraseña inicial antes de seguir.'],
        });
      }
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

      const s = await sesion(req, env);
      const res = json(200, {
        email,
        nombre: s?.nombre ?? results?.[0]?.nombre ?? email.split('@')[0],
        es_admin: s?.esAdmin ?? false,
        modulos: Object.fromEntries((results ?? []).map((r) => [r.modulo, r.rol])),
      });
      const cookie = renovarCookie(req);
      if (cookie) res.headers.set('Set-Cookie', cookie);
      return res;
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

        // Sin sesión, un 401 claro (antes salía un 403 "sin permiso" que la
        // app mostraba como error raro). La pantalla avisa y no pierde nada.
        if (!(await emailDelUsuario(req, env))) {
          return json(401, {
            error: 'sin_sesion',
            detalles: ['Tu sesión se cerró. Iniciá sesión de nuevo; lo que cargaste sigue en la pantalla.'],
          });
        }

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

  // Sin sesión no se entrega la pantalla: antes la frenaba Access, ahora el login.
  if (!id) return Response.redirect(new URL('/login.html', req.url).toString(), 302);

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
    // Ícono de la pestaña: sin él, el navegador muestra el globo genérico y
    // parece que la página no terminó de cargar.
    ICONO +
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
    // Fusión de cambios entre dispositivos, borrador local y aviso de sesión
    // cerrada. Sin defer: la app lo lee al cargar.
    `<script src="/shared/fusion.js"></script>\n` +
    // La exportación a Excel se arma en el navegador, porque la nube no
    // ejecuta openpyxl. Solo se carga donde hay botón de exportar: es 950 KB.
    (modulo === 'prensas' || modulo === 'lotes'
      ? `<script defer src="/shared/xlsx.full.min.js"></script>\n` +
        `<script defer src="/shared/exportar.js"></script>\n`
      : '') +
    `<script defer src="/shared/barra.js"></script>\n</head>`;

  const html = (await res.text()).replace('</head>', inyeccion);

  const headers: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  const cookie = renovarCookie(req);
  if (cookie) headers['Set-Cookie'] = cookie;

  return new Response(html, { status: res.status, headers });
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
    //
    // Los datos van dentro de un <script>: cualquier "<" se pasa a < para que
    // un texto cargado por un editor ("</script><script>…") no pueda cerrar el
    // bloque y correr en la sesión de quien abre el reporte. (El viejo
    // .replace(/<\//g, '<\/') no hacía nada: '<\/' y '</' son el mismo string.)
    // Los reemplazos van con función: con un string, `$&` o `$'` en los datos se
    // expandirían como patrones de replace.
    //
    // Además, la plantilla (copia de reporte.py) arma sus tablas con innerHTML sin
    // escapar nada: los textos se escapan acá, antes de entrar. El reporte solo
    // muestra, así que se ven igual.
    const datosJson = JSON.stringify(escaparTextos(datos))
      .replace(/</g, '\\u003c')
      .split(String.fromCharCode(0x2028)).join('\\u2028')
      .split(String.fromCharCode(0x2029)).join('\\u2029');
    const meta = (datos.meta ?? {}) as Record<string, unknown>;
    const mes = Number(meta.mes_actual) || 1;
    html = PLANTILLA_PRENSAS.replace('__DATOS__', () => datosJson)
      .replace('__MES_ACTUAL__', () => String(mes))
      .replace('__REF_FECHA__', () => ahora.slice(0, 10))
      .replace('__VERSION__', () => String(fila.version))
      .replace('__GENERADO__', () => ahora);
  }

  html = html.replace('</head>', () => ICONO + '</head>');

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Copia profunda con todos los strings escapados para HTML. */
function escaparTextos(v: unknown): unknown {
  if (typeof v === 'string') {
    return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  }
  if (Array.isArray(v)) return v.map(escaparTextos);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, escaparTextos(x)]));
  }
  return v;
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
