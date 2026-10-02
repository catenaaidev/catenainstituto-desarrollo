/**
 * Las piezas puras de la sincronización con el servidor: cómo leer una
 * respuesta, cuánto esperar un pedido y cómo fusionar lo que esta pestaña
 * cambió encima de lo que otro guardó mientras tanto (el reintento de un 409).
 *
 * Viven acá y no en el index.html para que los tests corran la regla de verdad
 * (test/barriles-sync.test.mjs). Se carga como <script> clásico en el <head>,
 * igual que inventario.js y altas.js: el arranque de la página corre durante el
 * parseo y un type="module" llegaría tarde. No toca el DOM ni el estado global.
 */
(function (raiz) {
  'use strict';

  // ---------------- respuestas del servidor ----------------

  /* Qué significa un código de respuesta para la pantalla. Antes todo lo que
   * no era 409, 412 u ok se leía como "sin conexión": una sesión vencida (401)
   * tapaba la pantalla con "no cierres ni recargues" cuando lo único que había
   * que hacer era volver a iniciar sesión, y un usuario de solo lectura (403)
   * encolaba escrituras que nunca iban a entrar. */
  function clasificarRespuesta(status) {
    if (status >= 200 && status < 300) return 'ok';
    if (status === 409) return 'conflicto';
    if (status === 412) return 'freno';
    if (status === 401) return 'sesion';
    if (status === 403) return 'permiso';
    return 'error';
  }

  /* La versión de una respuesta de /version o /estado, o null si no hay una
   * que sirva. Un 401 trae {error:'sin_sesion'}: tomarlo como versión dejaba
   * versionServidor en undefined y la pantalla decía "sincronizado". */
  function versionDe(d) {
    const v = d && d.version;
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  // Cuánto se espera un pedido antes de darlo por perdido. Sin límite, un POST
  // colgado (señal que va y viene en la nave) dejaba pushEnCurso en true para
  // siempre: no se subía nada más y la pantalla seguía diciendo que estaba bien.
  const LIMITE_PEDIDO_MS = 15000;

  /* fetch con límite de tiempo que además lee el cuerpo dentro del mismo
   * límite (un cuerpo que no termina de llegar cuelga igual que uno que no
   * empieza). Devuelve { status, ok, datos } con datos = el JSON o null si el
   * cuerpo no es JSON (una página de error, un redirect a HTML). Si se corta
   * la red o vence el plazo, rechaza: el llamador lo trata como sin conexión.
   * Usa el fetch global del momento, así pasa por el envoltorio de
   * /shared/fusion.js que muestra el aviso de sesión cerrada. */
  function pedirJson(url, opciones, ms) {
    const plazo = ms || LIMITE_PEDIDO_MS;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer = null;
    const vencido = new Promise(function (_, mal) {
      timer = setTimeout(function () {
        if (ctl) ctl.abort();
        mal(new Error('el servidor no respondió en ' + Math.round(plazo / 1000) + ' s'));
      }, plazo);
    });
    const op = Object.assign({}, opciones || {});
    if (ctl) op.signal = ctl.signal;
    const trabajo = raiz.fetch(url, op).then(function (r) {
      return r.text().then(function (t) {
        let datos = null;
        try { datos = t ? JSON.parse(t) : null; } catch (e) { datos = null; }
        return { status: r.status, ok: r.ok, datos: datos };
      });
    });
    return Promise.race([trabajo, vencido]).finally(function () { clearTimeout(timer); });
  }

  // ---------------- fusión al reintentar un 409 ----------------

  function igual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function esObjeto(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  /* Los valores sueltos del estado (fechaInventario, inventarioCorte, modoLote,
   * y cualquier otro que no sea una lista ni un objeto), como texto, para usar
   * de base en la fusión. */
  function fotoEscalares(estado) {
    const foto = {};
    for (const k of Object.keys(estado || {})) {
      const v = estado[k];
      if (v === null || typeof v !== 'object') foto[k] = JSON.stringify(v);
    }
    return foto;
  }

  /* Fusión de tres vías de los valores sueltos: lo que esta pestaña cambió
   * respecto de la base se pone encima del servidor; lo que no tocó queda como
   * lo dejó el servidor. Antes se tomaban SIEMPRE del servidor, así que importar
   * el Excel (que fija fechaInventario e inventarioCorte) o prender el modo por
   * lote se perdía si justo otro guardaba en el medio. Muta y devuelve `serv`. */
  function fusionarEscalares(base, local, serv) {
    const b = base || {};
    const l = local || {};
    const claves = new Set(Object.keys(b));
    for (const k of Object.keys(l)) if (l[k] === null || typeof l[k] !== 'object') claves.add(k);
    for (const k of claves) {
      const v = l[k];
      if (v !== null && typeof v === 'object') continue;   // pasó a ser lista u objeto: no es de acá
      if (JSON.stringify(v) === b[k]) continue;            // no lo cambié: manda el servidor
      if (v === undefined) delete serv[k]; else serv[k] = v;
    }
    return serv;
  }

  /* Un box o palet que existe en los tres lados. Los datos del contenedor
   * (nombre, columnas, filas) se fusionan campo por campo contra la base; las
   * celdas, casillero por casillero:
   *  - la que cambié acá, gana lo de acá (es lo que el operario tiene a la vista);
   *  - la que borré acá se borra del servidor SOLO si allá sigue como en la
   *    base: si otro dispositivo puso un barril nuevo en ese casillero, el
   *    barril se queda (antes se borraba igual y se perdía sin aviso). */
  function fusionarContenedor(b, l, s) {
    const out = Object.assign({}, s);
    const claves = new Set(Object.keys(b).concat(Object.keys(l)));
    claves.delete('celdas'); claves.delete('id');
    for (const k of claves) {
      if (igual(l[k], b[k])) continue;
      if (l[k] === undefined) delete out[k]; else out[k] = l[k];
    }
    const cb = esObjeto(b.celdas) ? b.celdas : {};
    const cl = esObjeto(l.celdas) ? l.celdas : {};
    const cs = esObjeto(s.celdas) ? s.celdas : {};
    const celdas = Object.assign({}, cs);
    for (const k of Object.keys(cl)) if (!igual(cl[k], cb[k])) celdas[k] = cl[k];
    for (const k of Object.keys(cb)) {
      if (k in cl) continue;
      if (cs[k] === undefined || igual(cs[k], cb[k])) delete celdas[k];
    }
    out.celdas = celdas;
    return out;
  }

  /* Fusión de tres vías de una lista de contenedores (boxes o palets), por id.
   * Antes solo se miraban las celdas de los contenedores que esta pestaña
   * todavía tenía: borrar un box, renombrarlo o achicarlo se perdía si otro
   * guardaba en el medio.
   *  - borrado acá y el servidor no lo tocó: se va;
   *  - borrado acá pero otro lo cambió: se queda (gana el cambio, como en
   *    fusionar3: perder un barril cargado es peor que un box de más);
   *  - borrado por otro y acá no lo toqué: queda borrado;
   *  - borrado por otro pero acá lo cambié: vuelve, con lo de acá;
   *  - nuevo de acá: se agrega al final.
   * No muta los argumentos; devuelve la lista nueva. */
  function fusionarContenedores(base, local, serv) {
    const porId = function (arr) {
      const m = new Map();
      for (const c of (Array.isArray(arr) ? arr : [])) if (c && c.id != null) m.set(String(c.id), c);
      return m;
    };
    const mb = porId(base), ml = porId(local);
    const out = [];
    const vistos = new Set();
    for (const s of (Array.isArray(serv) ? serv : [])) {
      if (!s || s.id == null) { out.push(s); continue; }
      const id = String(s.id);
      vistos.add(id);
      const b = mb.get(id), l = ml.get(id);
      if (!l) {
        if (b && igual(s, b)) continue;
        out.push(s);
        continue;
      }
      out.push(fusionarContenedor(b || { celdas: {} }, l, s));
    }
    for (const [id, l] of ml) {
      if (vistos.has(id)) continue;
      const b = mb.get(id);
      if (!b || !igual(l, b)) out.push(l);
    }
    return out;
  }

  /* Cuánto esperar antes de la vuelta `n` (desde 1) del reintento de un 409.
   * Sin espera, dos pestañas que chocan se vuelven a chocar enseguida; con
   * tope, el operario no se queda mirando el reloj. */
  function esperaReintento(n) {
    return Math.min(2000, 150 * Math.max(1, n));
  }

  // ---------------- órdenes del escáner sin confirmar ----------------

  // Lo que el operario carga en una orden. `mes` no: se deduce de la fecha.
  const CAMPOS_ORDEN = ['fecha', 'ot', 'lote', 'tipo', 'codigos'];

  function camposDeOrden(o) {
    const c = {};
    for (const k of CAMPOS_ORDEN) {
      const v = o ? o[k] : undefined;
      c[k] = v === undefined ? undefined : JSON.parse(JSON.stringify(v));
    }
    return c;
  }

  /* Qué hacer al abrir la app con órdenes que se guardaron en este equipo y no
   * se sabe si llegaron. pendientes: [{ orden, antes }] (antes = los datos de
   * la orden antes de editarla, o null si es nueva). escaneos: los del servidor.
   *  - nueva que el servidor no tiene: se agrega (con su mismo id: si después
   *    choca con otra pestaña, fusionar3 la reconoce y no la duplica);
   *  - nueva que el servidor ya tiene: llegó, nada que hacer;
   *  - edición que el servidor ya tiene: llegó;
   *  - edición sobre una orden que en el servidor sigue como estaba antes: se
   *    vuelve a aplicar;
   *  - edición sobre una orden que ya no está, que se aplicó al inventario o
   *    que otro cambió después: no se toca (no se resucita ni se pisa).
   * Devuelve { agregar: [orden], editar: [{ id, campos }] }. */
  function planRecuperarOrdenes(pendientes, escaneos) {
    const porId = new Map();
    for (const o of (Array.isArray(escaneos) ? escaneos : [])) if (o && o.id != null) porId.set(String(o.id), o);
    const out = { agregar: [], editar: [] };
    const vistos = new Set();
    for (const p of (Array.isArray(pendientes) ? pendientes : [])) {
      const o = p && p.orden;
      if (!o || o.id == null || !Array.isArray(o.codigos)) continue;
      const id = String(o.id);
      if (vistos.has(id)) continue;
      vistos.add(id);
      const enServ = porId.get(id);
      if (!p.antes) { if (!enServ) out.agregar.push(o); continue; }
      if (!enServ || enServ.aplicado) continue;
      const ahora = camposDeOrden(enServ);
      if (igual(ahora, camposDeOrden(o))) continue;
      if (!igual(ahora, camposDeOrden(p.antes))) continue;
      out.editar.push({ id: o.id, campos: camposDeOrden(o) });
    }
    return out;
  }

  raiz.LIMITE_PEDIDO_MS = LIMITE_PEDIDO_MS;
  raiz.CAMPOS_ORDEN = CAMPOS_ORDEN;
  raiz.camposDeOrden = camposDeOrden;
  raiz.planRecuperarOrdenes = planRecuperarOrdenes;
  raiz.clasificarRespuesta = clasificarRespuesta;
  raiz.versionDe = versionDe;
  raiz.pedirJson = pedirJson;
  raiz.fotoEscalares = fotoEscalares;
  raiz.fusionarEscalares = fusionarEscalares;
  raiz.fusionarContenedor = fusionarContenedor;
  raiz.fusionarContenedores = fusionarContenedores;
  raiz.esperaReintento = esperaReintento;
})(typeof globalThis !== 'undefined' ? globalThis : window);
