/* ===== Lotes CIW — clasificacion, filtro y paginado de la Orden de muestras =====
 * Modulo puro: sin DOM, sin fetch, sin import de nucleo.js (el unico import es
 * envases.js, que tambien es puro). Misma entrada que
 * hoy usa _otClasificar() (un elemento de dashData().lotes), extendida para
 * exponer las 6 alarmas de "atencion" por separado -- eso es lo que habilita
 * el filtro granular (antes solo existia el booleano combinado). */
'use strict';

import { numPositivo } from './envases.js';

/* Claves de dashData().lotes[i].alarmas que hoy arma _otClasificar() como
 * "atencion" (cualquiera de estas). Son un subconjunto de las 11 condiciones
 * de src/lotes/motores/fml.ts, que a su vez sigue el tablero aprobado.
 * El motor tiene 11 condiciones; esta lista cubre las 6 que dan prioridad a
 * la orden de muestras (sin sin_analisis_valido, control_proceso_pendiente,
 * frecuencia_vencida, av_alerta, so2_caida_alerta ni datos_operativos_incompletos). */
const CRITERIOS_ATENCION = {
  so2:     'so2_no_ok',
  ph:      'ph_no_ok',
  av:      'av_alerta',
  fa:      'fa_no_finalizada',
  fml:     'fml_no_finalizada',
  noLleno: 'no_lleno',
};

/* `info` es el lote completo de DATOS().lotes, y es OPCIONAL: la fila del
 * dashboard no trae los envases, asi que la ronda de tanques es el unico
 * criterio que no se puede decidir sin el. Omitirlo deja rondaTanques en false
 * y no altera nada mas -- las llamadas de un solo argumento siguen valiendo. */
export function clasificarLote(l, info){
  const diasRestantes = (l.frecuencia_max ?? 0) - (l.dias_desde_analisis ?? 0);
  const alarmas = l.alarmas || [];

  const criterios = {};
  let atencion = false;
  for (const clave in CRITERIOS_ATENCION){
    const v = alarmas.includes(CRITERIOS_ATENCION[clave]);
    criterios[clave] = v;
    if (v) atencion = true;
  }

  return {
    vencido:     !!l.vencido,
    proximo:     !l.vencido && diasRestantes >= 0 && diasRestantes <= 5,
    sinAnalisis: alarmas.includes('sin_analisis_valido'),
    atencion,
    criterios,
    /* Solo los litros de tanque cuentan: los cuatro capNNN son CANTIDADES de
     * envases, no litros, y un lote de puras barricas no es de esta ronda. */
    rondaTanques: numPositivo(info && info.vasija_grande) > 0,
  };
}

export function pasaFuente(cls, fuente, criterioAtencion){
  if (fuente === 'todos')             return true;
  if (fuente === 'vencidos')          return cls.vencido;
  if (fuente === 'proximos')          return cls.proximo;
  if (fuente === 'vencidos_proximos') return cls.vencido || cls.proximo;
  if (fuente === 'sin_analisis')      return cls.sinAnalisis;
  /* La ronda de tanques es un recorrido fisico: entra TODO lote con litros en
   * vasija grande, este vencido o al dia. Los filtros box y el buscador siguen
   * aplicando encima, que es como se acota si hace falta. */
  if (fuente === 'ronda_tanques')     return cls.rondaTanques;
  if (fuente === 'atencion'){
    if (!criterioAtencion || criterioAtencion === 'todos') return cls.atencion;
    return !!cls.criterios[criterioAtencion];
  }
  return false;
}

/* Texto de la columna "Motivo": por que este lote esta en la hoja. Vive aca y
 * no en la vista porque es la contracara de pasaFuente -- si una fuente nueva
 * no deja motivo, la fila sale impresa con un guion y nadie sabe por que se la
 * pidieron. */
export function motivoDeFila(cls, fuente){
  const m = [];
  if (cls.vencido)     m.push('Vencido');
  if (cls.proximo)     m.push('Próximo');
  if (cls.sinAnalisis) m.push('Sin análisis');
  if (cls.atencion)    m.push('NO OK');
  if (m.length) return m.join(' / ');
  /* Un tanque al dia no dispara ninguno de los cuatro: sin esto quedaria en
   * blanco justo en la hoja que se lleva el que recorre los tanques. */
  if (fuente === 'ronda_tanques') return 'Ronda de tanques';
  return '—';
}

/* Envases chicos que pueden venir mezclados con el tanque en vasija_actual.
 * El texto real de la bodega escribe el mismo envase de cuatro formas
 * ('Barrica', 'Barricas', 'barricas', 'BARRICAS') y el tonel con y sin espacio
 * ('t50', 'T50', 'T 200'), asi que la comparacion es case-insensitive y tolera
 * el espacio.
 *
 * OJO: la unica forma de distinguir el tonel de 500 L de un tanque es el
 * nombre. Un tanque que se llamara 'T 500' caeria aca por error y se
 * descartaria. Hoy no existe -- los tanques son de tres digitos (140, 177,
 * 203...) -- pero si algun dia aparece, esta es la linea que lo rompe. */
const ENVASE_CHICO = /^(barricas?|t\s*(?:50|200|500))$/i;

/* Codigo del tanque dentro de vasija_actual: 'H 170 + Barricas' -> 'H 170'.
 * El que sale a hacer la ronda va al tanque, y que el lote ademas tenga dos
 * barricas guardadas en otro lado no le sirve para encontrarlo. */
export function tanqueDeVasija(texto){
  const t = String(texto ?? '').trim();
  if (t === '') return '';

  const partes  = t.split('+').map(s => s.trim()).filter(s => s !== '');
  const tanques = partes.filter(p => !ENVASE_CHICO.test(p));

  /* Si al descartar no quedo nada, el texto no nombra ningun tanque: se
   * devuelve entero. Preferimos mostrar de mas antes que una celda vacia. */
  return tanques.length ? tanques.join(' + ') : t;
}

/* Texto de la columna "Vasija" de la orden. */
export function vasijaDeFila(info){
  if (!info) return '';
  const texto = String(info.vasija_actual || '').trim();
  /* Manda el numero, no el texto: hay lotes ('P 147', 'P 149') cuyo
   * vasija_actual quedo con un codigo de tanque viejo pero ya no tienen
   * litros ahi. A esos no se les toca el texto. */
  return numPositivo(info.vasija_grande) > 0 ? tanqueDeVasija(texto) : texto;
}

/* Texto de la columna "Litros" de la orden: '2600 de 3050' cuando el lote
 * reparte el vino entre el tanque y las barricas, y un solo numero cuando no
 * hay nada que aclarar. */
export function litrosDeFila(info){
  if (!info) return '';
  const tanque = numPositivo(info.vasija_grande);
  const total  = info.litros_actuales;

  if (total == null || total === '') return tanque > 0 ? String(tanque) : '';
  if (tanque > 0 && Number(total) !== tanque) return `${tanque} de ${total}`;
  return String(total);
}

/* Campos que mira el buscador de texto libre: los mismos cuatro que el usuario
 * ve en la grilla. Litros queda afuera a proposito: es numerico y buscar '100'
 * traeria 100, 1000 y 2100 juntos, que no es lo que nadie espera al tipear. */
const CAMPOS_BUSCABLES = ['lote', 'variedad', 'vasija', 'motivo'];

export function pasaBusqueda(fila, consulta){
  const q = String(consulta ?? '').trim().toLowerCase();
  if (q === '') return true;
  return CAMPOS_BUSCABLES.some(k =>
    String((fila || {})[k] ?? '').toLowerCase().includes(q)
  );
}

/* Tipos de vasija conocidos, en el orden en que se ofrecen en el filtro. La
 * deteccion es por subcadena en minusculas, asi que 'Barrica' matchea tambien
 * 'Barricas' y 't50' matchea 'T50'. */
const TIPOS_VASIJA = [
  { tipo: 'Barrica', re: /barrica/ },
  { tipo: 't50',     re: /t\s*50/  },
  { tipo: 't200',    re: /t\s*200/ },
  { tipo: 't500',    re: /t\s*500/ },
  { tipo: 'Grande',  re: /grande/  },
];

/* vasija_actual es texto libre y viene sucio del Excel: en datos.json conviven
 * 'Barricas'(114) con 'Barrica'(15), 't50'(38) con 'T50'(8), y el mismo combo
 * escrito de tres formas ('t50 + Barrica', 'Barrica + t50', 'Barricas + t50').
 * Filtrar por el texto literal daria 35 opciones con duplicados semanticos:
 * marcar "Barricas" perderia los 15 lotes que dicen "Barrica".
 *
 * Por eso el filtro agrupa por TIPO CONTENIDO. Un lote en 't50 + Barrica'
 * devuelve ['Barrica','t50'] y aparece bajo las dos opciones, que es lo que uno
 * quiere al preguntar "que lotes tienen barrica".
 *
 * Devuelve siempre un array ordenado y sin repetidos:
 *   ''                      -> ['']        (opcion "(sin vasija)")
 *   texto sin tipo conocido -> [ese texto] (no se pierde el lote del filtro)
 */
export function tiposDeVasija(texto){
  const t = String(texto ?? '').trim();
  if (t === '') return [''];

  const bajo = t.toLowerCase();
  const hallados = TIPOS_VASIJA.filter(v => v.re.test(bajo)).map(v => v.tipo);

  /* Sin ningun tipo conocido ('H174', 'T 140', 'P 147' en los datos reales) se
   * devuelve el texto tal cual: preferimos una opcion de mas en el filtro antes
   * que un lote que no aparece bajo ninguna. */
  return hallados.length ? hallados.sort() : [t];
}

/* El "numero" de cada fila es su indice GLOBAL (1-based) dentro del pedido
 * completo, no el indice dentro de la pagina -- asi la hoja 2 arranca en 26,
 * no en 1, igual que hace prensas con `gi+1`. */
export function armarPaginas(filas, porHoja){
  const paginas = [];
  for (let i = 0; i < filas.length; i += porHoja){
    paginas.push(filas.slice(i, i + porHoja).map((f, j) => ({ numero: i + j + 1, fila: f })));
  }
  return paginas.length ? paginas : [[]];
}
