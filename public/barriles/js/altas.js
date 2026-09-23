/**
 * La capa de altas a mano: qué vasijas dadas de alta están vivas, cuáles se
 * deshicieron, y cómo se unen las de dos celulares.
 *
 * Por qué hace falta una lápida y no alcanza con sacar la entrada del array:
 * `inventario` es una de las cuatro claves que vienen tal cual del servidor y
 * pisan lo local (ver el comentario de `serv` en `sincronizar()`). La fila de un
 * alta vive ahí, con `alta: true`. Si el deshacer solo sacara la entrada de
 * `estado.altas`, la fila volvería del servidor en el próximo sync, y la copia
 * que todavía tiene el otro celular repondría también la entrada. Así que el
 * borrado se MARCA (`borrado` + `borradoTs`), la marca viaja en la fusión, y
 * `aplicarAltas()` poda la fila en cada reindexada, corra el inventario de donde
 * corra.
 *
 * Las entradas no se unen por número a secas sino por (tanda, número). Un mismo
 * número puede aparecer dos veces a propósito: la tanda vieja con lápida y la
 * tanda nueva que la revive —que es el caso central, cargar 50 con el lote
 * equivocado, deshacer y volver a cargarlas bien—. Uniéndolas por número, la
 * segunda se comería la primera y el resultado dependería del orden del sync.
 *
 * Quién gana, entonces, se decide por número recién en `resolverAltas()`: el
 * alta viva más nueva le gana a la lápida más nueva. Eso converge igual en los
 * dos órdenes, que es lo único que sirve cuando hay dos celulares cargando.
 *
 * También viven acá el plazo de 15 minutos del deshacer por tanda y las bajas de
 * vasijas sueltas (del Excel o a mano), que usan la misma idea de marca que viaja.
 *
 * Se testea en test/barriles-altas.test.mjs.
 */

// Una tanda por confirmación del formulario; las altas cargadas antes de que
// existiera el id caen todas en la bolsa del día.
function claveDeAlta(a) {
  return String((a && a.tanda) || '') + '|' + String((a && a.num) || '');
}

function tandaDeAlta(a) {
  return (a && a.tanda) ? String(a.tanda) : 'dia:' + String((a && a.creadoEl) || '');
}

/**
 * Separa las altas en las que hay que aplicar y los números que hay que podar
 * del inventario.
 *
 * `tapiadas` son SOLO los números con lápida y sin ningún alta viva que la
 * supere. Nunca se poda por ausencia —una fila `alta: true` sin entrada en
 * `estado.altas` se deja donde está—: podar por lo que falta es exactamente la
 * forma de borrar en cascada cuando una colección llega incompleta.
 */
function resolverAltas(altas) {
  const lista = Array.isArray(altas) ? altas : [];
  const tapa = new Map();                       // número → lápida más nueva
  for (const a of lista) {
    if (!a || !a.borrado) continue;
    const n = String(a.num);
    const ts = Number(a.borradoTs || 0);
    if (!tapa.has(n) || ts > tapa.get(n)) tapa.set(n, ts);
  }
  const vivas = [];
  const conViva = new Set();
  for (const a of lista) {
    if (!a || a.borrado) continue;
    const n = String(a.num);
    if (tapa.has(n) && Number(a.ts || 0) <= tapa.get(n)) continue;   // la tapa es posterior
    vivas.push(a);
    conViva.add(n);
  }
  const tapiadas = new Set();
  for (const n of tapa.keys()) if (!conViva.has(n)) tapiadas.add(n);
  return { vivas, tapiadas };
}

/**
 * Une las altas del servidor con las de este celular. Muta y devuelve el array
 * del servidor, igual que `fusionarEdiciones`.
 *
 * La lápida es pegajosa dentro de una tanda: si cualquiera de los dos lados la
 * tiene, queda. Deshacer no se deshace —volver a cargar esos números es un alta
 * nueva, con tanda nueva, y esa sí puede ganarle en `resolverAltas()`.
 */
function fusionarAltas(altasServidor, altasLocales) {
  const arr = Array.isArray(altasServidor) ? altasServidor : [];
  const ix = new Map();
  for (const a of arr) if (!ix.has(claveDeAlta(a))) ix.set(claveDeAlta(a), a);

  for (const a of (Array.isArray(altasLocales) ? altasLocales : [])) {
    if (!a) continue;
    const s = ix.get(claveDeAlta(a));
    if (!s) { arr.push(a); ix.set(claveDeAlta(a), a); continue; }
    if (Number(a.ts || 0) > Number(s.ts || 0)) {
      // Los datos de la vasija, no las marcas: esas se resuelven abajo.
      for (const c of ['cap', 'estado', 'marca', 'lote', 'cosecha', 'litros', 'creadoEl', 'ts'])
        if (c in a) s[c] = a[c];
    }
    if (a.borrado) {
      s.borrado = true;
      s.borradoTs = Math.max(Number(s.borradoTs || 0), Number(a.borradoTs || 0));
    }
  }
  return arr;
}

/**
 * Las tandas vivas, de la más nueva a la más vieja, para ofrecer el deshacer.
 *
 * Las de legado (altas sin id, cargadas antes de este cambio) se agrupan por
 * día y se marcan con `legado`. Un día puede juntar dos cargas distintas, así
 * que quien las muestre tiene que decirlo y cantar el número exacto.
 */
function agruparTandas(altas) {
  const { vivas } = resolverAltas(altas);
  const ix = new Map();
  for (const a of vivas) {
    const id = tandaDeAlta(a);
    let t = ix.get(id);
    if (!t) {
      t = { id, legado: !a.tanda, creadoEl: a.creadoEl || '', ts: Number(a.ts || 0),
            estado: a.estado || '', cap: a.cap || '', marca: a.marca || '',
            lote: a.lote || '', cosecha: a.cosecha || '', nums: [] };
      ix.set(id, t);
    }
    t.nums.push(String(a.num));
    t.ts = Math.max(t.ts, Number(a.ts || 0));
  }
  const tandas = [...ix.values()];
  for (const t of tandas) {
    t.cuantas = t.nums.length;
    t.desde = t.nums[0];
    t.hasta = t.nums[t.nums.length - 1];
  }
  // Por ts, y por fecha cuando no hay ts (las de legado no lo traen).
  return tandas.sort((a, b) => (b.ts - a.ts) || String(b.creadoEl).localeCompare(String(a.creadoEl)));
}

/**
 * Le pone lápida a las altas vivas de una tanda. Devuelve un array nuevo: el
 * original no se toca, para que quien llama decida si el cambio se aplica.
 */
function marcarTandaBorrada(altas, id, ts) {
  let marcadas = 0;
  const salida = (Array.isArray(altas) ? altas : []).map(a => {
    if (!a || a.borrado || tandaDeAlta(a) !== String(id)) return a;
    marcadas++;
    return { ...a, borrado: true, borradoTs: Number(ts) };
  });
  return { altas: salida, marcadas };
}

/**
 * Cuáles de esos números ya están en uso en otra parte de la app.
 *
 * Deshacer un alta saca la fila del inventario, y una celda del mapa que apunte
 * a un número que ya no existe se dibuja como '?' sin explicar nada. Antes de
 * borrar, entonces, se pregunta; si hay aunque sea una, el deshacer se frena y
 * dice cuáles.
 */
function usoDeVasijas(nums, { boxes, escaneos, tanques, palets } = {}) {
  const buscados = new Set((nums || []).map(String));
  const motivos = new Map();
  const anotar = (num, motivo) => {
    const n = String(num);
    if (!buscados.has(n)) return;
    if (!motivos.has(n)) motivos.set(n, []);
    if (!motivos.get(n).includes(motivo)) motivos.get(n).push(motivo);
  };
  for (const b of (boxes || []))
    for (const v of Object.values((b && b.celdas) || {})) if (v && v !== 'HUECO') anotar(v, 'en el mapa');
  for (const p of (palets || []))
    for (const v of Object.values((p && p.celdas) || {})) if (v && v !== 'HUECO') anotar(v, 'en un palet');
  for (const t of (tanques || [])) if (t) anotar(t.num, 'asociada a un lote');
  for (const o of (escaneos || [])) for (const c of ((o && o.codigos) || [])) anotar(c, 'escaneada');

  // En el orden en que vinieron los números, que es el que ve el operario.
  return [...buscados].filter(n => motivos.has(n)).map(n => ({ num: n, motivos: motivos.get(n) }));
}

// ---------- plazo del deshacer por tanda ----------
// El deshacer de una tanda entera es para el error recién cometido ("cargué 50
// con el lote equivocado"). Pasado el plazo desaparece: a esa altura las vasijas
// ya pueden estar en el mapa o escaneadas, y deshacer 50 de un toque es más riesgo
// que ayuda. Para corregir después está la baja de a una.
const PLAZO_DESHACER_MS = 15 * 60 * 1000;

/**
 * Las tandas que todavía se pueden deshacer, con `quedaMs`. Las de legado no
 * traen ts, así que no hay forma de saber si están en plazo: no se ofrecen. Un ts
 * en el futuro (reloj adelantado del celular que cargó) no estira el plazo.
 */
function tandasEnPlazo(altas, ahora) {
  return agruparTandas(altas)
    .filter(t => !t.legado && t.ts && Number(ahora) - t.ts < PLAZO_DESHACER_MS)
    .map(t => ({ ...t, quedaMs: Math.min(PLAZO_DESHACER_MS, PLAZO_DESHACER_MS - (Number(ahora) - t.ts)) }));
}

// ---------- bajas de vasijas ----------
// Dar de baja sirve para cualquier vasija, venga del Excel o de un alta a mano.
// Por el mismo motivo que las altas deshechas, la baja no puede ser sacar la fila:
// `inventario` viene del servidor y pisa lo local, y la próxima importación del
// Excel la traería de vuelta. Así que es una capa aparte (`estado.bajas`) que se
// vuelve a aplicar en cada reindexada.
//
// Una entrada por número: { num, ts, revividaTs? }. Está vigente mientras la baja
// sea más nueva que el revivir. Volver a cargar el número (con "Agregar vasijas")
// pone `revividaTs`; darlo de baja otra vez sube `ts`. Las dos marcas se unen por
// máximo, que es conmutativo: converge en los dos órdenes de sync.

function bajaVigente(b) {
  return !!b && Number(b.ts || 0) > Number(b.revividaTs || 0);
}

function numerosDeBaja(bajas) {
  const s = new Set();
  for (const b of (Array.isArray(bajas) ? bajas : [])) if (bajaVigente(b)) s.add(String(b.num));
  return s;
}

/**
 * Da de baja un número. Devuelve arrays nuevos; los originales no se tocan.
 *
 * También le pone lápida a las altas vivas de ese número. Sin eso, volver a
 * cargarlo dejaría dos altas vivas y `aplicarAltas()` pondría la primera, que es
 * la vieja, con los datos que se quisieron corregir.
 */
function darDeBaja(bajas, altas, num, ts) {
  const n = String(num), t = Number(ts);
  const lista = (Array.isArray(bajas) ? bajas : []).map(b => b);
  const i = lista.findIndex(b => b && String(b.num) === n);
  if (i >= 0) lista[i] = { ...lista[i], ts: Math.max(Number(lista[i].ts || 0), t) };
  else lista.push({ num: n, ts: t });
  const salida = (Array.isArray(altas) ? altas : []).map(a =>
    (a && !a.borrado && String(a.num) === n) ? { ...a, borrado: true, borradoTs: t } : a);
  return { bajas: lista, altas: salida };
}

/** Destapa los números que se vuelven a cargar. Devuelve un array nuevo. */
function revivirBajas(bajas, nums, ts) {
  const set = new Set((nums || []).map(String));
  return (Array.isArray(bajas) ? bajas : []).map(b =>
    (b && set.has(String(b.num)) && bajaVigente(b))
      ? { ...b, revividaTs: Math.max(Number(b.revividaTs || 0), Number(ts)) } : b);
}

/** Une las bajas del servidor con las locales. Muta y devuelve el del servidor. */
function fusionarBajas(bajasServidor, bajasLocales) {
  const arr = Array.isArray(bajasServidor) ? bajasServidor : [];
  const ix = new Map();
  for (const b of arr) if (b && !ix.has(String(b.num))) ix.set(String(b.num), b);
  for (const b of (Array.isArray(bajasLocales) ? bajasLocales : [])) {
    if (!b) continue;
    const s = ix.get(String(b.num));
    if (!s) { const c = { ...b }; arr.push(c); ix.set(String(b.num), c); continue; }
    s.ts = Math.max(Number(s.ts || 0), Number(b.ts || 0));
    const rv = Math.max(Number(s.revividaTs || 0), Number(b.revividaTs || 0));
    if (rv) s.revividaTs = rv;
  }
  return arr;
}

globalThis.resolverAltas = resolverAltas;
globalThis.fusionarAltas = fusionarAltas;
globalThis.agruparTandas = agruparTandas;
globalThis.marcarTandaBorrada = marcarTandaBorrada;
globalThis.usoDeVasijas = usoDeVasijas;
globalThis.PLAZO_DESHACER_MS = PLAZO_DESHACER_MS;
globalThis.tandasEnPlazo = tandasEnPlazo;
globalThis.numerosDeBaja = numerosDeBaja;
globalThis.darDeBaja = darDeBaja;
globalThis.revivirBajas = revivirBajas;
globalThis.fusionarBajas = fusionarBajas;
