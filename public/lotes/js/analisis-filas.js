/* ===== Lotes CIW — filas virtuales de la pestana Analisis =====
 * Funciones puras, sin DOM. Un registro de DATOS().analisis puede respaldar
 * hasta DOS filas visibles: una de quimica y una de correccion. Las dos
 * comparten la referencia al objeto real (nunca se clona), asi que escribir
 * en cualquiera de las dos es la misma escritura sobre el mismo dato.
 */
'use strict';

/* Campos quimicos: los mismos que ya definia COLS_ANALISIS antes de esta
 * tarea (lote/variedad/fecha_analisis quedan afuera porque son metadatos,
 * no una medicion). */
const CAMPOS_QUIMICA = ['ph', 'av', 'gluc_fruc', 'azucar_reductor', 'malico',
  'lactico', 'acidez_total', 'etanol', 'so2_libre', 'comentario'];

/** Hay algun valor quimico real en el registro (no todo null/vacio).
 *  0 SI cuenta como real (a diferencia de null/undefined/''): un so2_libre en
 *  0 es una medicion valida, no la ausencia de medicion. */
export function esQuimicaReal(obj){
  if (!obj) return false;
  return CAMPOS_QUIMICA.some(c => obj[c] != null && obj[c] !== '');
}

/** Hay una correccion real, no solo el relleno que dejo la migracion del
 *  Excel. mbk_a_agregar NO se usa aca a proposito: en los datos reales
 *  siempre vale 0 (nadie via la app guardo todavia un valor de la
 *  calculadora en vivo), y usarlo contaria como "correccion" un monton de
 *  registros que en realidad no tienen ninguna. ot_n y so2_deseado son la
 *  senal de que alguien realmente registro algo. */
export function esCorreccionReal(correccion){
  if (!correccion) return false;
  const ot = String(correccion.ot_n ?? '').trim();
  return ot !== '' || correccion.so2_deseado != null;
}

/** Map<registro -> su posicion en el array>, armado de una sola pasada.
 *
 *  Existe para sacar el `indexOf` por fila que hacia la pestana Analisis en
 *  cada repintado: los flags de "fuera de criterio" que devuelve la API vienen
 *  indexados por la POSICION del registro en DATOS().analisis, asi que pintar
 *  una fila exigia saber esa posicion. Con un indexOf por fila eso era O(N^2)
 *  por render — invisible con 5 analisis, caro con miles.
 *
 *  Conserva la semantica de indexOf: si el mismo objeto estuviera dos veces en
 *  el array, gana la PRIMERA posicion. No deberia pasar, pero si pasara, que
 *  las dos formas de buscar difieran movería los colores de lugar en silencio
 *  en vez de fallar de forma visible. */
export function indicesPorObjeto(arr){
  const m = new Map();
  const lista = arr || [];
  for (let i = 0; i < lista.length; i++){
    if (!m.has(lista[i])) m.set(lista[i], i);
  }
  return m;
}

/** Compara dos valores para el orden dentro de un grupo: numeros si los dos
 *  lo son, texto en espanol si no. null/undefined siempre van al final,
 *  independientemente de la direccion (mismo criterio que sortRows de
 *  tabla.js). */
function _comparar(va, vb, dir){
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  if (typeof va === 'string' && typeof vb === 'string') return dir * va.localeCompare(vb, 'es');
  return dir * (va - vb);
}

/** Arma la lista de filas visibles: agrupadas por lote (orden numerico de
 *  lote), y dentro de cada grupo ordenadas segun sortState (por defecto,
 *  fecha_analisis ascendente). Antepone un separador a cada grupo que tenga
 *  al menos una fila tras aplicar filtroFila.
 *
 *  filtroFila se aplica ANTES de agrupar, no despues: asi un grupo que queda
 *  sin ninguna fila (por ejemplo, "Solo fuera de criterio" descarta todas las
 *  filas de quimica de ese lote) no genera un separador con nada debajo.
 *
 *  analisisArray ya viene filtrado por el llamador (mes/busca/variedad/
 *  proyecto) exactamente como filtraba la version plana de esta pestana. */
export function armarFilas(analisisArray, sortState, filtroFila){
  const pasaFiltro = filtroFila || (() => true);

  let candidatas = [];
  for (const obj of (analisisArray || [])){
    if (esQuimicaReal(obj)) candidatas.push({ tipo: 'quimica', analisis: obj });
    if (esCorreccionReal(obj.correccion)) candidatas.push({ tipo: 'correccion', analisis: obj });
  }

  candidatas = candidatas.filter(pasaFiltro);

  /* Agrupar preservando el orden de aparicion de cada lote nuevo; el orden
   * final de los GRUPOS se decide aparte, abajo, por numero de lote. */
  const grupos = new Map();
  const lotesEncontrados = [];
  for (const fila of candidatas){
    const lote = String(fila.analisis.lote ?? '');
    if (!grupos.has(lote)){ grupos.set(lote, []); lotesEncontrados.push(lote); }
    grupos.get(lote).push(fila);
  }

  /* Mismo criterio de orden de lote que ya usa vista-so2.js: numerico si se
   * puede, alfabetico en espanol si no. */
  lotesEncontrados.sort((a, b) => {
    const na = parseFloat(a), nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b, 'es');
  });

  const key = (sortState && sortState.key) || 'fecha_analisis';
  const dir = (sortState && sortState.dir) || 1;

  const salida = [];
  for (const lote of lotesEncontrados){
    const filasDelGrupo = grupos.get(lote);
    filasDelGrupo.sort((a, b) => _comparar(a.analisis[key], b.analisis[key], dir));
    salida.push({ tipo: 'separador', lote });
    salida.push(...filasDelGrupo);
  }
  return salida;
}

/** Color del cartel de un lote en la pestana Analisis: 'mal', 'ok' o null.
 *
 *  Manda el ULTIMO analisis del lote, no la ultima medicion de cada metrica por
 *  separado: antes un malico o una AV de hace meses que nadie volvio a medir
 *  dejaba el cartel naranja aunque el analisis de hoy estuviera todo en
 *  criterio, y el cartel contradecia a las celdas que tenia justo debajo.
 *
 *  `veredictos` es una lista de {fecha, fuera, dentro} (fecha ISO o '' si no
 *  tiene una usable; fuera/dentro, Sets de metricas). Los analisis sin ningun
 *  veredicto (sin medicion juzgable) no cuentan: no pueden decir que el lote
 *  esta bien. Si el ultimo dia tiene dos analisis, se juzgan juntos. Una fila
 *  sin fecha solo se usa si ninguna con fecha tiene veredicto.
 *
 *  null = sin color: nada que juzgar no es lo mismo que "esta bien". */
export function estadoCartelLote(veredictos){
  const juzgables = (veredictos || []).filter(v => v.fuera.size || v.dentro.size);
  if (!juzgables.length) return null;
  const conFecha = juzgables.filter(v => v.fecha);
  let ultimos = juzgables;
  if (conFecha.length){
    const max = conFecha.reduce((m, v) => v.fecha > m ? v.fecha : m, '');
    ultimos = conFecha.filter(v => v.fecha === max);
  }
  return ultimos.some(v => v.fuera.size) ? 'mal' : 'ok';
}
