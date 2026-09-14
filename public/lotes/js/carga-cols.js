/* ===== Lotes CIW — columnas de la pestana Cargar analisis =====
 *
 * Que columna del pegado es cada campo del analisis, y como se lee una fila
 * contra ese plan. El modulo es PURO a proposito: no toca el DOM, asi que se
 * importa desde los tests, que corren dentro del runtime de Workers (mismo
 * criterio que anchos-cols.js y filtro-llenado.js).
 *
 * LISTA BLANCA, NO CAMPOS LIBRES
 *
 * Antes, una columna con un nombre desconocido se guardaba tal cual como campo
 * del analisis. Con la planilla del laboratorio eso creaba analisis con
 * `vasija` y `año` colgando, que nadie lee y que igual viajan a D1 dentro del
 * JSON del documento. Ahora solo se guardan las claves de ALIAS: cualquier otro
 * nombre se lee para que las POSICIONES calcen y se descarta. Por eso el orden
 * por defecto nombra columnas que no existen ('vasija', 'año') y usa '-' para
 * las que no tienen nombre: son huecos declarados, no errores.
 */
'use strict';

/* El orden de la planilla del laboratorio, 14 columnas. Vive aca y no en el
 * HTML para que el value del input y el default del parser no se separen:
 * vista-cargar.js lo escribe en #cargarCols al arrancar. */
export const ORDEN_PLANILLA =
  'lote, vasija, año, fecha, etanol, ph, av, gluc_fruc, malico, lactico, acidez_total, -, -, so2_libre';

/* Nombre aceptado -> clave canonica del analisis. Todo lo que no este aca se
 * descarta. Las variantes existen porque la gente tipea el orden a mano:
 * 'alcohol' es como se llama la columna en la planilla, y 'gluc-fruc' con
 * guion es como sale de copiar el encabezado. */
const ALIAS = {
  lote: 'lote',
  fecha: 'fecha_analisis', fecha_analisis: 'fecha_analisis',
  ph: 'ph',
  av: 'av', acidez_volatil: 'av',
  gluc_fruc: 'gluc_fruc', 'gluc-fruc': 'gluc_fruc', glucfruc: 'gluc_fruc',
  azucar_reductor: 'azucar_reductor', 'az_reductor': 'azucar_reductor',
  malico: 'malico',
  lactico: 'lactico',
  acidez_total: 'acidez_total',
  etanol: 'etanol', alcohol: 'etanol',
  so2_libre: 'so2_libre', so2libre: 'so2_libre',
  comentario: 'comentario',
};

/* Claves que se parsean como numero. La fecha va aparte (parsearFecha) y lote y
 * comentario quedan como texto: un lote puede tener letras. */
export const NUMERICAS = new Set(['ph', 'av', 'gluc_fruc', 'azucar_reductor',
  'malico', 'lactico', 'acidez_total', 'etanol', 'so2_libre']);

/** Fecha en dd/mm/yyyy, dd-mm-yyyy o yyyy-mm-dd -> 'yyyy-mm-dd', o null.
 *  El null no es un detalle: es lo que hace que la fila se marque en rojo en la
 *  previsualizacion en vez de entrar con una fecha inventada. */
export function parsearFecha(raw){
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)){
    return isNaN(new Date(s + 'T00:00:00')) ? null : s;
  }
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  const iso = m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  const d = new Date(iso + 'T00:00:00');
  /* getUTCDate ademas de isNaN: el 32/01 y el 31/02 construyen una fecha
   * valida que se pasa de mes, y entrarian como dato bueno. */
  if (isNaN(d) || d.getUTCDate() !== Number(m[1])) return null;
  return iso;
}

/** El texto del campo "Orden de columnas" -> una entrada por POSICION.
 *  La entrada es la clave canonica, o null si esa posicion se descarta. */
export function planDeColumnas(texto){
  const s = String(texto ?? '').trim();
  if (!s) return [];
  return s.split(',').map(c => ALIAS[c.trim().toLowerCase()] ?? null);
}

/** Lee una linea del pegado contra el plan.
 *  Devuelve {campos, errores}. `campos` trae SOLO claves canonicas, listo para
 *  mezclarse en un registro de analisis. `errores` son los que se pueden ver
 *  sin conocer los datos; que el lote EXISTA lo valida vista-cargar.js, que es
 *  quien tiene DATOS(). */
export function parsearFila(linea, plan){
  /* Tab si lo hay, coma si no: es lo que sale de copiar de Excel contra lo que
   * sale de un CSV. */
  const sep = String(linea ?? '').includes('\t') ? '\t' : ',';
  const celdas = String(linea ?? '').split(sep);

  const campos = {};
  const errores = [];

  plan.forEach((k, i) => {
    if (!k) return;                       // posicion descartada
    const crudo = (celdas[i] ?? '').trim();

    if (k === 'fecha_analisis'){
      campos.fecha_analisis = parsearFecha(crudo);
      if (!campos.fecha_analisis) errores.push('fecha inválida');
      return;
    }
    if (NUMERICAS.has(k)){
      /* Coma decimal -> punto. Una celda vacia queda en null y NO en 0: un 0
       * seria un valor medido y arrastraria a los criterios y al motor. */
      const n = parseFloat(crudo.replace(',', '.'));
      campos[k] = (crudo === '' || isNaN(n)) ? null : n;
      return;
    }
    campos[k] = crudo === '' ? null : crudo;
  });

  if (!String(campos.lote ?? '').trim()) errores.push('lote vacío');

  return { campos, errores };
}
