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
