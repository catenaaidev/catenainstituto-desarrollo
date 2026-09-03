/* ===== Lotes CIW — clasificacion, filtro y paginado de la Orden de muestras =====
 * Modulo puro: sin DOM, sin fetch, sin import de nucleo.js. Misma entrada que
 * hoy usa _otClasificar() (un elemento de dashData().lotes), extendida para
 * exponer las 6 alarmas de "atencion" por separado -- eso es lo que habilita
 * el filtro granular (antes solo existia el booleano combinado). */
'use strict';

/* claves de dashData().lotes[i].alarmas que hoy arma _otClasificar() como
 * "atencion" (cualquiera de estas). Coinciden 1:1 con motor_fml.py (linea 24-31). */
const CRITERIOS_ATENCION = {
  so2:     'so2_no_ok',
  ph:      'ph_no_ok',
  av:      'av_alerta',
  fa:      'fa_no_finalizada',
  fml:     'fml_no_finalizada',
  noLleno: 'no_lleno',
};

export function clasificarLote(l){
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
  };
}

export function pasaFuente(cls, fuente, criterioAtencion){
  if (fuente === 'todos')             return true;
  if (fuente === 'vencidos')          return cls.vencido;
  if (fuente === 'proximos')          return cls.proximo;
  if (fuente === 'vencidos_proximos') return cls.vencido || cls.proximo;
  if (fuente === 'sin_analisis')      return cls.sinAnalisis;
  if (fuente === 'atencion'){
    if (!criterioAtencion || criterioAtencion === 'todos') return cls.atencion;
    return !!cls.criterios[criterioAtencion];
  }
  return false;
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
