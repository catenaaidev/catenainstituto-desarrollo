/* ===== Lotes CIW — desglose de envases de un lote (subsistema H) =====
 *
 * Modulo PURO: sin DOM y sin imports. Lo importa tests/grilla.test.html, que
 * solo puede cargar modulos que no toquen el documento.
 *
 * Invariante del subsistema:
 *   litros_actuales = 50*cap50 + 200*cap200 + 225*cap225 + 500*cap500 + vasija_grande
 *   … menos lo que les falta a las barricas mermas pendientes del lote
 *   (DATOS().mermas, ver mermas.js). Con 0 mermas es exactamente esta suma.
 *
 * OJO CON LA ASIMETRIA: los cuatro capNNN son CANTIDADES de envases, mientras
 * que vasija_grande son LITROS directos. Por eso vasija_grande NO esta en
 * CAPACIDADES: si estuviera, se multiplicaria por una capacidad y daria un
 * numero absurdo. El espejo Python (motor_envases.py) tiene la misma nota.
 */
'use strict';

/* Orden DESCENDENTE de capacidad. resumenEnvases y tiposDeEnvase recorren este
   array en orden, y de ahi sale que su salida sea determinista y no dependa del
   orden de las claves del objeto lote. */
export const CAPACIDADES = [
  { k: 'cap500', cap: 500 },
  { k: 'cap225', cap: 225 },
  { k: 'cap200', cap: 200 },
  { k: 'cap50',  cap: 50  },
];

/* Los envases de 50 L son tanques chicos, no barricas: en bodega se escriben
 * "T50" ("2 T50"), igual que el filtro tanque50 del Mapa de Barriles. Todo
 * texto que cuente vasijas por capacidad pregunta aca antes de decir
 * "barrica". El Mapa guarda cap a veces como '50' (texto). */
export const NOMBRE_T50 = 'T50';
export const esT50 = cap => Number(cap) === 50;
/* "T50" dentro de un texto de vasija ("11 barricas + 1 T50", "t 50"). */
export const RE_T50 = /\bt\s*50\b/i;

/* Numero positivo, o 0. null, undefined, '', negativos y basura valen 0.
 * Es deliberadamente indulgente: estos campos vienen de una migracion de Excel
 * y un valor raro no tiene que hacer explotar el render de la tabla. La
 * validacion de lo que el usuario tipea vive en el overlay, no aca. */
export function numPositivo(x){
  if (x == null || x === '') return 0;
  const v = Number(x);
  return (isFinite(v) && v > 0) ? v : 0;
}
/* Alias corto para el uso interno del modulo, que lo repite en cada formula. */
const n0 = numPositivo;

/** Litros que suman los envases del lote. */
export function litrosDeEnvases(lote){
  if (!lote) return 0;
  let t = 0;
  for (const c of CAPACIDADES) t += n0(lote[c.k]) * c.cap;
  return t + n0(lote.vasija_grande);
}

/* Numeros de tanque escritos en vasija_actual: "H 170 + Barricas" -> ['170'].
 * Cada grupo de digitos es un candidato aparte ("T201/202" -> ['201','202']).
 * NO son tanques los envases chicos: barricas, y toneles/T50 escritos con
 * cantidad ("1 t200", "2 x T50"), que es como la OT escribe lo que queda.
 * El tanque 200 SI existe en el padron: "T 200" sin cantidad es el tonel solo
 * si el lote (opcional) tiene toneles de 200 cargados (2026-11-18: el 26260,
 * "huevo + 1 t200", aparecia en el tanque 200 del inventario). */
const ENVASE_CON_CANTIDAD = /^\s*\d+\s*(?:x\s*)?(?:t\s*(?:50|200|500)\b|barric)/i;
const TONEL_SUELTO = /^\s*t\s*(50|200|500)\s*$/i;
export function numerosDeTanque(texto, lote){
  const out = [];
  for (const parte of String(texto ?? '').split('+')){
    if (/barric/i.test(parte) || ENVASE_CON_CANTIDAD.test(parte)) continue;
    const suelto = parte.match(TONEL_SUELTO);
    if (suelto && (suelto[1] !== '200' || n0(lote && lote.cap200) > 0)) continue;
    for (const d of parte.match(/\d+/g) || []) if (!out.includes(d)) out.push(d);
  }
  return out;
}

/** Litros del lote que estan en un tanque. Unica regla de "el lote esta en un
 *  tanque", compartida por el Inventario de tanques y la ronda de la Orden de
 *  muestras: manda vasija_grande; sin el, si el lote no tiene envases chicos y
 *  su vasija nombra un tanque, todos sus litros estan ahi (lotes migrados del
 *  Excel sin el desglose). Con envases chicos y sin vasija_grande, el tanque
 *  del texto quedo viejo: 0. */
export function litrosEnTanque(lote){
  if (!lote) return 0;
  const g = n0(lote.vasija_grande);
  if (g > 0) return g;
  if (CAPACIDADES.some(c => n0(lote[c.k]) > 0)) return 0;
  const total = n0(lote.litros_actuales);
  return total > 0 && numerosDeTanque(lote.vasija_actual, lote).length ? total : 0;
}

/** Resumen legible: '2×225 + 1×50', 'grande 3500', '2×225 + grande 1500', ''.
 *  Sin separador de miles, para que copiar la celda y pegarla en Excel de un
 *  texto limpio. */
export function resumenEnvases(lote){
  if (!lote) return '';
  const partes = [];
  for (const c of CAPACIDADES){
    const n = n0(lote[c.k]);
    if (n > 0) partes.push(n + '×' + c.cap);
  }
  const g = n0(lote.vasija_grande);
  if (g > 0) partes.push('grande ' + g);
  return partes.join(' + ');
}

/** Cantidad de envases del lote. El tanque cuenta como 1, sean 1500 o 7500 L. */
export function contarEnvases(lote){
  if (!lote) return 0;
  let n = 0;
  for (const c of CAPACIDADES) n += n0(lote[c.k]);
  return n + (n0(lote.vasija_grande) > 0 ? 1 : 0);
}

/** ¿El lote no tiene litros? Unica definicion de "vacio" de la pestaña Lotes:
 *  la usan el atenuado de la fila y el filtro Todos/Llenos/Vacios.
 *
 *  Mira litros_actuales y no litrosDeEnvases(lote) a proposito: es el numero
 *  que la columna muestra en pantalla, asi que la fila tenue siempre coincide
 *  con el 0 que se lee al lado. Por la invariante del subsistema las dos
 *  cuentas dan lo mismo (verificado sobre los 304 lotes reales), pero si
 *  alguna vez se separan gana lo que ve el usuario.
 *
 *  El <= 0 es el mismo corte que usa motor_etapas para volver inactivo a un
 *  lote, y por eso el overlay de Envases guarda 0 y nunca null. */
export function estaVacio(lote){
  if (!lote) return true;
  return n0(lote.litros_actuales) === 0;
}

/** ¿El lote es orgánico? Unica definicion de "organico" de la pestaña Lotes:
 *  la usa el verde pastel de la fila.
 *
 *  Vive en este modulo y no en vista-lotes.js por la misma razon que estaVacio:
 *  es una propiedad derivada del lote, pura, y aca se puede testear (el runtime
 *  de Workers donde corren los tests no tiene document, asi que vista-lotes.js
 *  no se puede importar).
 *
 *  La comparacion es indulgente -- sin distinguir mayusculas, sin espacios de
 *  los bordes y con o sin tilde -- aunque en los 304 lotes de produccion el
 *  valor sea siempre 'Organico' con tilde y la columna sea un <select> que solo
 *  ofrece esa forma. El motivo es que este campo tambien lo escribio la
 *  migracion del Excel, donde no hubo ningun <select> que lo forzara, y un
 *  valor apenas torcido apagaria el color sin ningun error a la vista.
 *
 *  Compara el valor ENTERO y no una subcadena: una nota como 'en transicion a
 *  organico' no vuelve organico al lote. */
const ORGANICO = ['organico', 'orgánico'];

export function esOrganico(lote){
  if (!lote) return false;
  const v = lote.organico_convencional;
  // typeof antes de trim(): el campo puede traer un numero o un objeto de una
  // migracion vieja, y String({}) daria '[object Object]' en lugar de false.
  if (typeof v !== 'string') return false;
  return ORGANICO.includes(v.trim().toLowerCase());
}

/** Claves de los tipos de envase presentes, p. ej. ['cap225','cap50'].
 *  El tanque aparece como 'vasija_grande' y siempre al final. Lo usa el filtro
 *  de la pestaña Lotes. */
export function tiposDeEnvase(lote){
  if (!lote) return [];
  const out = [];
  for (const c of CAPACIDADES) if (n0(lote[c.k]) > 0) out.push(c.k);
  if (n0(lote.vasija_grande) > 0) out.push('vasija_grande');
  return out;
}
