/**
 * Endpoints del Mapa de Barriles.
 *
 * Responden igual que su servidor.py, para que su pantalla no cambie.
 * El estado completo vive en la tabla `documento`, igual que Prensas: la app
 * ya funcionaba así (una fila `snapshot` de SQLite con todo el estado en JSON),
 * solo cambia dónde está guardada.
 */

import { identidad, puedeEscribir, puedeLeer, marcarSesion } from '../auth';
import { json } from '../respuestas';
import { contarPerdidas, idsPerdidos, superanUmbral, type ColeccionLista, type Estado } from './guardas';

const MODULO = 'barriles';

export interface Documento {
  version: number;
  estado: Estado;
}

async function leer(env: Env): Promise<Documento> {
  const fila = await env.DB.prepare('SELECT json FROM documento WHERE modulo = ?')
    .bind(MODULO)
    .first<{ json: string }>();
  if (!fila) return { version: 0, estado: {} };
  return JSON.parse(fila.json) as Documento;
}

/**
 * Escribe solo si la versión en la base sigue siendo la que se leyó.
 *
 * Antes era un ON CONFLICT DO UPDATE, que escribe siempre: el chequeo de versión
 * de más arriba quedaba fuera de la escritura y dos dispositivos que lo pasaban
 * con la misma versión escribían los dos. Devuelve false si otro escribió en el
 * medio; el llamador responde 409 y el cliente fusiona.
 *
 * El INSERT unificado resuelve también la ambigüedad de versionPrevia === 0:
 * eso puede significar "no hay fila todavía" O "hay una fila cuyo json dice
 * version: 0". La rama anterior entraba por DO NOTHING en ambos casos, pero en
 * el segundo chocaba con la fila existente, changes = 0, y devolvía false para
 * siempre: la app quedaba trabada en 409 sin poder escribir nunca más.
 * Con el WHERE en el DO UPDATE, si la fila existe con esa versión se actualiza;
 * si existe con otra versión no se toca nada y changes = 0 devuelve false.
 *
 * Lo que esto NO cubre: una fila cuyo json directamente no traiga el campo
 * `version`. Ahí leer() devuelve un documento con version undefined y las
 * comparaciones dejan de tener sentido; no está arreglado ni testeado. El caso
 * cubierto y testeado es el del json que dice `version: 0`.
 */
export async function escribir(
  env: Env,
  doc: Documento,
  email: string,
  versionPrevia: number,
): Promise<boolean> {
  const jsonDoc = JSON.stringify(doc);
  // Una sola sentencia para los dos casos (no hay fila / hay fila con versionPrevia).
  // El WHERE en el DO UPDATE garantiza que solo se escribe si la versión no cambió,
  // sin ambigüedad sobre si versionPrevia === 0 significa "fila ausente" o "fila en v0".
  // IMPORTANTE: version tiene que quedar siempre igual a $.version del json;
  // leer() saca la versión del json parseado, no de la columna — si se desacoplan
  // el compare-and-swap empieza a comparar contra el valor equivocado.
  const escritura = env.DB.prepare(
    `INSERT INTO documento (modulo, version, json, autor, guardado)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(modulo) DO UPDATE SET
       version  = excluded.version,
       json     = excluded.json,
       autor    = excluded.autor,
       guardado = excluded.guardado
     WHERE documento.version = ?`,
  ).bind(MODULO, doc.version, jsonDoc, email, versionPrevia);

  const [, resEscritura] = await env.DB.batch([marcarSesion(env, email), escritura]);
  return (resEscritura.meta.changes ?? 0) > 0;
}

export async function rutasBarriles(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  ruta: string,
): Promise<Response | null> {
  const id = await identidad(req, env, ctx, MODULO);

  if (!puedeLeer(id)) {
    return json(403, {
      error: 'sin_permiso',
      detalles: [
        `${id?.email ?? 'este usuario'} no tiene acceso al Mapa de Barriles. Pedíselo a un administrador.`,
      ],
    });
  }

  // ---------- GET /version ----------
  // Lo consulta cada pestaña abierta cada 3 segundos. Antes parseaba el JSON
  // entero (todo el inventario y el mapa) solo para devolver un número: con
  // varias pestañas eso era la mayor parte del CPU del módulo. Se lee la
  // columna, que escribir() mantiene igual a $.version del json en la misma
  // sentencia (e importar.mjs también): es el mismo número que la pantalla
  // recibe de GET /estado y de cada POST, y contra el que compara.
  if (ruta === '/version' && req.method === 'GET') {
    const fila = await env.DB.prepare('SELECT version FROM documento WHERE modulo = ?')
      .bind(MODULO)
      .first<{ version: number }>();
    // Sin fila, leer() devuelve version 0: acá lo mismo, para que la pantalla
    // no vea una diferencia que no existe.
    return json(200, { version: fila?.version ?? 0 });
  }

  // ---------- GET /estado ----------
  if (ruta === '/estado' && req.method === 'GET') {
    return json(200, await leer(env));
  }

  // ---------- GET /info ----------
  // Devolvía las direcciones de red local para conectar el celular. Acá no hay
  // red que descubrir: la dirección es una sola, pública y fija, así que `urls`
  // va vacía.
  //
  // `modo` es lo que le permite a la pantalla saber dónde está corriendo. Es el
  // mismo archivo que el de la bodega (se sincroniza copiándolo), y una lista
  // vacía sola es ambigua: puede ser "acá no hace falta ninguna IP" o "la PC se
  // quedó sin WiFi". Sin la marca, la pantalla mandaba al operario a prender un
  // servidor.py que en la web no existe.
  if (ruta === '/info' && req.method === 'GET') {
    return json(200, { modo: 'web', urls: [] });
  }

  // ---------- GET /lote-rotulo?lote=26124 ----------
  // La pantalla de Rótulos necesita dos datos de Lotes: el título del lote
  // (id_texto) y si es orgánico (etiqueta verde) o no (blanca). Se devuelven solo
  // esos, con el permiso de Barriles: el operario no tiene por qué tener acceso a
  // Lotes, y el documento de Lotes pesa ~4 MB. json_each busca el lote dentro
  // del documento sin parsearlo entero en el Worker. El lote puede estar guardado
  // como número o como texto: se compara como texto.
  if (ruta === '/lote-rotulo' && req.method === 'GET') {
    const lote = (new URL(req.url).searchParams.get('lote') ?? '').trim();
    if (!lote) return json(400, { error: 'falta_lote' });
    const fila = await env.DB.prepare(
      `SELECT json_extract(l.value, '$.id_texto') AS titulo,
              json_extract(l.value, '$.organico_convencional') AS manejo
         FROM documento d, json_each(d.json, '$.lotes') l
        WHERE d.modulo = 'lotes' AND CAST(json_extract(l.value, '$.lote') AS TEXT) = ?
        LIMIT 1`,
    )
      .bind(lote)
      .first<{ titulo: unknown; manejo: unknown }>();
    if (!fila) return json(404, { error: 'no_existe' });
    // Misma regla que esOrganico() de public/lotes/js/envases.js: el valor entero,
    // sin mayúsculas, sin espacios de los bordes, con o sin tilde.
    const manejo = typeof fila.manejo === 'string' ? fila.manejo.trim().toLowerCase() : '';
    return json(200, {
      lote,
      titulo: typeof fila.titulo === 'string' ? fila.titulo : '',
      organico: manejo === 'organico' || manejo === 'orgánico',
    });
  }

  // ---------- GET /backup ----------
  // Antes bajaba el .db, y solo desde la propia PC. Ahora los respaldos son
  // automáticos (Time Travel + snapshot diario en R2); esto queda como
  // descarga manual del estado, para un admin.
  if (ruta === '/backup' && req.method === 'GET') {
    if (id!.rol !== 'admin') return json(403, { error: 'solo_admin' });
    const doc = await leer(env);
    return new Response(JSON.stringify(doc), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="mapa-v${doc.version}.json"`,
      },
    });
  }

  // ---------- POST /estado ----------
  if (ruta === '/estado' && req.method === 'POST') {
    if (!puedeEscribir(id)) {
      return json(403, {
        error: 'sin_permiso',
        detalles: ['tu usuario es de solo lectura en el Mapa de Barriles.'],
      });
    }

    let pedido: { version?: number; estado?: Estado; confirmarBorrado?: boolean };
    try {
      pedido = (await req.json()) as typeof pedido;
    } catch {
      return json(400, { error: 'JSON invalido' });
    }

    // `null`, un número o un array son JSON válido: pasaban el try de arriba y
    // `pedido.estado` tiraba TypeError (un 1101 del Worker en vez de un 400).
    if (!pedido || typeof pedido !== 'object' || Array.isArray(pedido)) {
      return json(400, { error: 'validacion', detalles: ['el pedido tiene que ser un objeto'] });
    }

    // Sin esto, un POST sin `estado` reemplazaba el documento entero por {}.
    // La validación va ANTES del chequeo de versión: un POST malformado lo es
    // independientemente de la versión; si va después, devuelve 409 en vez de
    // 400 y el defecto queda tapado.
    if (!pedido.estado || typeof pedido.estado !== 'object' || Array.isArray(pedido.estado)) {
      return json(400, {
        error: 'validacion',
        detalles: ['falta el estado: un guardado sin estado borraría todo'],
      });
    }

    // Boxes y palets son listas de contenedores. Si llegan como otra cosa el
    // freno las cuenta como vacías (no revienta, ver comoLista en guardas.ts),
    // pero guardarlas así dejaría el mapa roto para todas las pantallas: se
    // rechaza acá, que es el único lugar donde se escribe.
    for (const clave of ['boxes', 'palets'] as const) {
      const v = pedido.estado[clave];
      if (v !== undefined && !Array.isArray(v)) {
        return json(400, { error: 'validacion', detalles: [`${clave} tiene que ser una lista`] });
      }
    }

    const doc = await leer(env);

    // Otro dispositivo guardó antes: se devuelve el estado actual.
    if (pedido.version !== doc.version) return json(409, doc);

    const nuevoEstado = pedido.estado;

    // Freno de borrado masivo.
    if (!pedido.confirmarBorrado) {
      const perdidas = contarPerdidas(doc.estado, nuevoEstado);
      if (superanUmbral(perdidas)) {
        return json(412, {
          error: 'confirmar_borrado',
          borradas: perdidas.celdas,
          perdidas,
          version: doc.version,
        });
      }
    }

    const actualizado: Documento = { version: doc.version + 1, estado: nuevoEstado };

    if (!(await escribir(env, actualizado, id!.email, doc.version))) {
      // Otro dispositivo ganó la carrera entre la lectura y la escritura.
      return json(409, await leer(env));
    }

    // Qué desapareció exactamente. El resumen solo anota variaciones netas, así
    // que un intercambio (se va una orden, entra otra) se leía como "sin cambios".
    // La investigación del 16/09 tuvo que bajar snapshots de R2 para esto.
    //
    // Contar y presentar son dos responsabilidades distintas y no deben compartir
    // estructura. `borrados` es solo para presentación en `detalle`; los conteos
    // reales para el resumen vienen de `contarPerdidas()` (que ya llamamos arriba).
    const borrados: Record<string, string[]> = {};
    for (const coleccion of ['inventario', 'escaneos', 'tanques', 'revisiones', 'ediciones', 'pedidos'] as ColeccionLista[]) {
      const ids = idsPerdidos(doc.estado, nuevoEstado, coleccion);
      if (!ids.length) continue;

      // `idsPerdidos` puede devolver '' o 'num|campo' con num vacío para registros
      // sin identificador (p. ej. inventario importado del Excel con num: '').
      // Listar cadenas vacías en el historial no le sirve a nadie: agrupamos bajo
      // una etiqueta explícita con la cantidad para que el rastro sea útil.
      // Siempre es string[] — nunca string a secas — para que el lector no tenga
      // que manejar dos formas distintas al parsear el historial.
      const identificados = ids.filter((k) => k !== '' && k !== '|');
      const sinIdentificar = ids.length - identificados.length;

      if (sinIdentificar) {
        borrados[coleccion] = [...identificados, `(${sinIdentificar} sin identificar)`];
      } else {
        borrados[coleccion] = identificados;
      }
    }

    await env.DB.prepare(
      `INSERT INTO historial (modulo, version, ts, autor, email, resumen, detalle, forzado)
       VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?)`,
    )
      .bind(
        MODULO,
        actualizado.version,
        id!.nombre ?? id!.email,
        id!.email,
        resumen(doc.estado, nuevoEstado),
        JSON.stringify(borrados),
        pedido.confirmarBorrado ? 1 : 0,
      )
      .run();

    ctx.waitUntil(snapshotBarriles(env, actualizado));

    return json(200, { version: actualizado.version });
  }

  return null;
}

/**
 * Texto corto de qué cambió, para el historial.
 *
 * Contar y presentar son dos responsabilidades distintas: `resumen()` toma los
 * conteos de `contarPerdidas()` — la misma fuente que usa el freno de borrado —
 * en vez de derivar cantidades de `borrados`, que es una estructura pensada para
 * mostrar texto. Antes, cuando todos los borrados eran anónimos, `borrados[clave]`
 * era el string "(N sin identificar)" y `Array.isArray` devolvía false → n = 1:
 * el resumen mentía con −1 justo sobre los registros más difíciles de rastrear.
 *
 * El loop cubre las 6 colecciones de lista (antes solo cubría 3): el freno ya las
 * cuenta todas; el resumen tiene que nombrarlas también.
 *
 * Criterio para altas y bajas en la misma colección: se anotan por separado.
 * Un intercambio (−3 escaneos / +3 escaneos) produce "−3 escaneos; +3 escaneos",
 * que es más claro para una investigación que colapsar todo en "cambios en el mapa".
 */
function resumen(antes: Estado, despues: Estado): string {
  const partes: string[] = [];
  const p = contarPerdidas(antes, despues);

  for (const clave of ['inventario', 'escaneos', 'tanques', 'revisiones', 'ediciones', 'pedidos'] as ColeccionLista[]) {
    const a = (antes?.[clave] as unknown[] | undefined)?.length ?? 0;
    const d = (despues?.[clave] as unknown[] | undefined)?.length ?? 0;
    // Bajas: usamos el conteo de contarPerdidas(), que ya calcula los ids reales.
    // Así se evita derivar cantidades de la estructura de presentación (`borrados`).
    if (p[clave]) partes.push(`−${p[clave]} ${clave}`);
    // Altas: el delta de longitudes es la fuente correcta (no hay idsPerdidos para altas).
    if (d > a) partes.push(`+${d - a} ${clave}`);
  }

  if (p.celdas) partes.push(`${p.celdas} celda(s) vaciada(s)`);
  return partes.join('; ') || 'cambios en el mapa';
}

export async function snapshotBarriles(env: Env, doc: Documento) {
  const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const clave = `barriles/mapa-v${String(doc.version).padStart(5, '0')}-${fecha}.json`;
  await env.RESPALDOS.put(clave, JSON.stringify(doc), {
    httpMetadata: { contentType: 'application/json' },
  });
}
