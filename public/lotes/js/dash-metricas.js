/* ===== Lotes CIW — metricas del Dashboard =====
 *
 * Calculo puro para los graficos del dashboard. No toca el DOM y no importa
 * nada de las vistas: recibe datos, devuelve numeros. Asi se puede razonar
 * sobre los cortes de banda sin abrir un navegador.
 *
 * De donde salen los datos
 * ------------------------
 * /api/dashboard devuelve por lote el VEREDICTO (so2_ok, ph_ok, av_alerta) pero
 * no el VALOR medido, y un histograma necesita el valor. Los valores estan en
 * DATOS().analisis, que el front ya tiene cargado entero, asi que se recalculan
 * aca en vez de engordar el payload del endpoint con tres campos mas por lote.
 *
 * El precio de esa decision es que este archivo es un ESPEJO de motor_fml.py y
 * tiene que seguir sus reglas al pie de la letra:
 *   - -999 es "medicion invalida", no un numero (motor_fml.INVALIDO);
 *   - el valor que vale es el de la ULTIMA muestra con dato, no el mejor ni el
 *     promedio (motor_fml._ultimo_valido);
 *   - el SO2 libre puede venir en el campo suelto o dentro de correccion
 *     (motor_fml._so2_libre);
 *   - las muestras marcadas usar_registro="no" en excepciones_analisis no
 *     existen (motor_fml._analisis_por_lote).
 * Si alguna de esas reglas cambia en el motor, cambiala tambien aca o el
 * dashboard va a contradecir a la tabla de alarmas de la misma pantalla.
 * test/lotes-dash-metricas.test.mjs corre el motor y este archivo juntos y
 * exige que la tarjeta "SO₂ bajo objetivo" cuente lo mismo que so2_no_ok.
 */
'use strict';

import { criteriosEfectivosJS } from './criterios.js';

/* -999 = medicion invalida. Espejo de motor_fml.INVALIDO. */
export const INVALIDO = -999;

/** Numero o null. Acepta coma decimal, igual que nucleo.num. */
export function nm(v){
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

/** Numero valido o null: descarta el centinela -999. Espejo de motor_fml._valido. */
export function valido(v){
  const n = nm(v);
  return (n === null || n === INVALIDO) ? null : n;
}

/** Clave de lote comparable entre secciones (el JSON mezcla number y string). */
export function claveLote(v){
  return String(v ?? '').trim();
}

/** SO2 molecular por Henderson-Hasselbalch. Espejo de motor_fml.so2_molecular. */
export function so2Molecular(so2Libre, ph){
  const s = valido(so2Libre), p = valido(ph);
  if (s === null || p === null) return null;
  return s / (1 + Math.pow(10, p - 1.8));
}

/** SO2 libre objetivo (mg/L) a ese pH, nunca por debajo del piso.
 *  Espejo de motor_fml.objetivo_so2_libre: sin pH no hay objetivo. */
export function objetivoSo2Libre(ph, eff){
  const p = valido(ph);
  if (p === null) return null;
  const piso = nm(eff.so2_libre_piso) ?? 0;
  const objMol = nm(eff.so2_molecular_objetivo);
  if (objMol === null) return piso;
  return Math.max(objMol * (1 + Math.pow(10, p - 1.8)), piso);
}

/* ---------------------------------------------------------------- analisis */

/** Analisis agrupados por lote, ya ordenados por fecha y sin los registros
 *  excluidos a mano. Espejo de motor_fml._analisis_por_lote + _ordenar. */
export function analisisPorLote(datos){
  const d = datos || {};

  const excluidos = new Set();
  for (const e of d.excepciones_analisis || []){
    if (String((e || {}).usar_registro || '').trim().toLowerCase() === 'no'){
      excluidos.add(claveLote(e.lote) + '|' + String(e.fecha_analisis ?? '').slice(0, 10));
    }
  }

  const mapa = new Map();
  for (const a of d.analisis || []){
    const lote = claveLote((a || {}).lote);
    if (excluidos.has(lote + '|' + String((a || {}).fecha_analisis ?? '').slice(0, 10))) continue;
    if (!mapa.has(lote)) mapa.set(lote, []);
    mapa.get(lote).push(a);
  }

  /* Sin fecha van al final, igual que motor_fml._ordenar: una muestra sin
   * fecha no puede reclamar ser la mas vieja ni la mas nueva, y ponerla
   * ultima la hace visible en vez de esconderla. */
  const SIN_FECHA = '9999-99-99';
  for (const filas of mapa.values()){
    filas.sort((x, y) =>
      String(x.fecha_analisis ?? SIN_FECHA).slice(0, 10)
        .localeCompare(String(y.fecha_analisis ?? SIN_FECHA).slice(0, 10)));
  }
  return mapa;
}

/**
 * SO2 libre de UNA muestra, con el fallback al bloque correccion. Espejo de
 * so2LibreDe() de fml-condiciones.ts, placeholder 0 incluido: un 0 no es una
 * medicion. Antes esta copia lo tomaba como dato y la tarjeta "SO₂ bajo
 * objetivo" contaba en deficit a un lote que la alarma so2_no_ok de la misma
 * pantalla (y el Tablero FML) daban por bien.
 */
export function so2LibreDe(a){
  const fila = a || {};
  const corr = (fila.correccion && typeof fila.correccion === 'object') ? fila.correccion : {};
  for (const campo of ['so2_libre_actual', 'so2_libre']){
    const v = valido(fila[campo]) ?? valido(corr[campo]);
    if (v !== null && v !== 0) return v;
  }
  return null;
}

/** ¿El proyecto del lote lleva SO2? Espejo de so2Aplica() del motor. */
export function so2Aplica(eff){
  return String((eff || {}).so2_aplica ?? 'si').trim().toLowerCase() !== 'no';
}

/** Ultimo valor valido de una metrica, con su fecha. Espejo de _ultimo_valido. */
function ultimoValido(ordenados, leer){
  for (let i = ordenados.length - 1; i >= 0; i--){
    const v = leer(ordenados[i]);
    if (v !== null && v !== undefined) return { valor: v, fecha: ordenados[i].fecha_analisis || null };
  }
  return { valor: null, fecha: null };
}

/* ------------------------------------------------------------------ bandas */

/* Cortes de la acidez volatil, en g/L ABSOLUTOS (pedido del 2026-11-11: el
 * grafico tiene que decir valores de AV, no porcentajes). Antes los cortes eran
 * fraccion del av_max de cada lote; hoy todos los activos tienen maximo 0,8 g/L
 * y la escala se armo alrededor de ese 0,8. Si algun dia un lote tiene otro
 * maximo, igual cae por su valor medido: el grafico ya no mira av_max (la
 * alarma de la tabla de abajo si).
 * El ultimo tramo no lleva 'hasta': todo lo que pase 1,0 cae ahi.
 * riesgo 0..4 indexa la escala --sc-0..--sc-4 del CSS. 'rango' es la segunda
 * linea de la etiqueta del eje: el nombre solo no dice donde corta la banda.
 * 'lineas' parte a mano una palabra que no entra en el ancho de su barra. */
export const BANDAS_AV = [
  { id: 'holgado',  etiqueta: 'Baja',     rango: '< 0,6 g/L',   hasta: 0.60, riesgo: 0, ayuda: 'Menos de 0,6 g/L' },
  { id: 'normal',   etiqueta: 'Moderada', rango: '0,6–0,7 g/L', hasta: 0.70, riesgo: 1, ayuda: 'De 0,6 a 0,7 g/L' },
  /* techoInclusivo: un lote que da EXACTAMENTE 0,8 entra aca y no en
   * "Fuera de especificacion". motor_fml.evaluar_av_alerta dispara la alarma
   * con `ultimo > av_max`, estrictamente mayor, asi que un lote justo en el
   * limite no tiene alarma; pintarlo como excedido mostraria un lote arriba que
   * no aparece en la tabla de alarmas de abajo. */
  { id: 'atencion', etiqueta: 'Próxima al límite', rango: '0,7–0,8 g/L', hasta: 0.80, techoInclusivo: true, riesgo: 2, ayuda: 'De 0,7 a 0,8 g/L' },
  { id: 'excedido', etiqueta: 'Fuera de especificación', rango: '0,8–1,0 g/L', hasta: 1.00, techoInclusivo: true, riesgo: 3, ayuda: 'Más de 0,8 y hasta 1,0 g/L' },
  { id: 'critico',  etiqueta: 'Crítica',  rango: '> 1,0 g/L',  hasta: null, riesgo: 4, ayuda: 'Más de 1,0 g/L' },
];

/* Cortes del SO2 libre, medidos como DIFERENCIA contra el objetivo del lote
 * (libre - objetivo, en mg/L). El objetivo depende del pH de la muestra, asi
 * que la diferencia es lo unico comparable entre lotes. */
export const BANDAS_SO2 = [
  { id: 'deficit_alto',  etiqueta: 'Déficit severo',   rango: '< −10 mg/L',  desde: null, hasta: -10, riesgo: 4, ayuda: 'Más de 10 mg/L por debajo del objetivo' },
  { id: 'deficit_medio', etiqueta: 'Déficit moderado', rango: '−10 a −5',    desde: -10,  hasta: -5,  riesgo: 3, ayuda: 'Entre 5 y 10 mg/L por debajo del objetivo' },
  { id: 'deficit_bajo',  etiqueta: 'Déficit leve',     rango: '−5 a 0',      desde: -5,   hasta: 0,   riesgo: 2, ayuda: 'Hasta 5 mg/L por debajo del objetivo' },
  { id: 'en_objetivo',   etiqueta: 'En objetivo',      rango: '0 a +10',     desde: 0,    hasta: 10,  riesgo: 0, ayuda: 'Cumple, con hasta 10 mg/L de margen' },
  { id: 'sobrado',       etiqueta: 'Sobrecorregido',   lineas: ['Sobre-', 'corregido'], rango: '> +10 mg/L',  desde: 10,   hasta: null, riesgo: 1, ayuda: 'Más de 10 mg/L por encima del objetivo: revisar sobredosificación' },
];

/** Indice de banda de AV para un valor en g/L. */
function bandaAv(gl){
  for (let i = 0; i < BANDAS_AV.length; i++){
    const b = BANDAS_AV[i];
    if (b.hasta === null) return i;
    if (b.techoInclusivo ? gl <= b.hasta : gl < b.hasta) return i;
  }
  return BANDAS_AV.length - 1;
}

/** Indice de banda de SO2 para una diferencia contra el objetivo. */
function bandaSo2(delta){
  for (let i = 0; i < BANDAS_SO2.length; i++){
    const b = BANDAS_SO2[i];
    const bajoTecho = (b.hasta === null || delta < b.hasta);
    const sobrePiso = (b.desde === null || delta >= b.desde);
    if (bajoTecho && sobrePiso) return i;
  }
  return BANDAS_SO2.length - 1;
}

/* ------------------------------------------------------------- por lote */

/**
 * Una fila por lote ACTIVO con su ultima medicion de cada parametro.
 *
 * @param dash  respuesta de /api/dashboard (trae solo los activos)
 * @param datos DATOS() completo (trae los valores medidos y la config)
 * @returns [{lote, variedad, proyecto, litros, av, avLimite, avRatio, avBanda,
 *            ph, phLimite, so2, so2Objetivo, so2Delta, so2Banda, so2Molec, phSo2,
 *            fecha, alarmas}]
 */
export function metricasPorLote(dash, datos){
  const d = datos || {};
  const config = d.config || {};
  const porLote = analisisPorLote(d);

  /* El maestro tiene variedad y proyecto; /api/dashboard solo variedad. El
   * heatmap corta por variedad, pero los criterios efectivos necesitan las
   * dos claves, asi que el maestro es la fuente. */
  const maestro = new Map();
  for (const l of d.lotes || []) maestro.set(claveLote((l || {}).lote), l);

  const filas = [];
  for (const fila of (dash && dash.lotes) || []){
    const clave = claveLote(fila.lote);
    const base  = maestro.get(clave) || {};
    const eff   = criteriosEfectivosJS(config, base.variedad ?? fila.variedad, base.proyecto);
    const ans   = porLote.get(clave) || [];

    const av  = ultimoValido(ans, a => valido(a.av));
    const ph  = ultimoValido(ans, a => valido(a.ph));
    const so2 = ultimoValido(ans, a => so2LibreDe(a));

    const avLimite = nm(eff.av_max);
    const avRatio  = (av.valor !== null && avLimite) ? av.valor / avLimite : null;

    /* El objetivo de SO2 se juzga contra el pH de LA MISMA muestra que dio el
     * SO2, no contra el ultimo pH del lote: el molecular es una propiedad del
     * par (libre, pH) y cruzarlos daria un veredicto que no describe a ninguna
     * muestra real. Es la misma cautela que motor_fml.evaluar_lote. Si esa
     * muestra no trae pH, recien ahi se cae al ultimo pH valido del lote. */
    let phDeLaMuestra = null;
    for (let i = ans.length - 1; i >= 0; i--){
      if (so2LibreDe(ans[i]) !== null){ phDeLaMuestra = valido(ans[i].ph); break; }
    }
    const phParaObjetivo = phDeLaMuestra ?? ph.valor;
    /* Un proyecto sin adicion de SO2 (El Amiguito) no tiene objetivo: no es
     * deficit ni "sin datos", queda fuera de la cuenta. Manda el motor si ya lo
     * dijo, y si no, la misma regla que usa el motor. */
    const so2NoAplica = fila.so2_estado === 'no_aplica' || !so2Aplica(eff);
    const so2Objetivo = so2NoAplica ? null : objetivoSo2Libre(phParaObjetivo, eff);
    const so2Delta = (so2.valor !== null && so2Objetivo !== null) ? so2.valor - so2Objetivo : null;

    filas.push({
      lote:     clave,
      variedad: base.variedad ?? fila.variedad ?? '(sin variedad)',
      proyecto: base.proyecto ?? '',
      litros:   nm(fila.litros) ?? 0,
      av:       av.valor,
      avLimite: avLimite,
      avRatio:  avRatio,
      avBanda:  av.valor === null ? null : bandaAv(av.valor),
      avFecha:  av.fecha,
      ph:       ph.valor,
      phLimite: nm(eff.ph_max),
      so2:         so2.valor,
      so2NoAplica: so2NoAplica,
      so2Objetivo: so2Objetivo,
      so2Delta:    so2Delta,
      so2Banda:    so2Delta === null ? null : bandaSo2(so2Delta),
      so2Molec:    so2Molecular(so2.valor, phParaObjetivo),
      /* El pH con el que se calculo ese molecular (el de la muestra del SO2).
       * La nube pH·molecular se ubica con este y no con `ph`: si no, un punto
       * mezclaria el molecular de una muestra con el pH de otra. */
      phSo2:       phParaObjetivo,
      fecha:    fila.ultima_fecha || null,
      alarmas:  fila.alarmas || [],
    });
  }
  return filas;
}

/* ---------------------------------------------------------- agrupamientos */

/** Cuenta lotes por banda. Devuelve una entrada por banda (incluidas las
 *  vacias: un histograma con huecos miente sobre la forma de la muestra). */
export function agrupar(filas, bandas, campoBanda){
  const grupos = bandas.map(b => ({ ...b, lotes: [] }));
  let sinDato = [];
  for (const f of filas){
    const i = f[campoBanda];
    if (i === null || i === undefined) sinDato.push(f.lote);
    else grupos[i].lotes.push(f.lote);
  }
  return { grupos, sinDato };
}

/* Alarmas que entran al heatmap y su etiqueta corta. Se dejan afuera las que
 * no describen al vino sino al estado del registro (sin_analisis_valido,
 * datos_operativos_incompletos): mezclarlas haria que una variedad con la
 * carga atrasada se vea igual de roja que una con problemas reales. */
export const ALARMAS_HEATMAP = [
  ['av_alerta',          'AV'],
  ['so2_no_ok',          'SO2'],
  ['ph_no_ok',           'pH'],
  ['fml_no_finalizada',  'FML'],
  ['fa_no_finalizada',   'FA'],
  ['frecuencia_vencida', 'Vencido'],
  ['no_lleno',           'Merma'],
];

/**
 * Matriz variedad x alarma. Ordena las variedades por total de alarmas
 * descendente y recorta a `maxFilas`: con veinte variedades el heatmap deja
 * de leerse de un vistazo, que es lo unico que justifica un heatmap.
 *
 * @returns {columnas, filas:[{variedad, total, lotesTotal, celdas:[{n, lotes}]}], maxCelda}
 */
export function heatmapVariedadAlarma(filas, maxFilas = 12){
  const porVariedad = new Map();
  for (const f of filas){
    const v = f.variedad || '(sin variedad)';
    if (!porVariedad.has(v)){
      porVariedad.set(v, {
        variedad: v,
        lotesTotal: 0,
        total: 0,
        celdas: ALARMAS_HEATMAP.map(() => ({ n: 0, lotes: [] })),
      });
    }
    const fila = porVariedad.get(v);
    fila.lotesTotal++;
    ALARMAS_HEATMAP.forEach(([cond], i) => {
      if (f.alarmas.includes(cond)){
        fila.celdas[i].n++;
        fila.celdas[i].lotes.push(f.lote);
        fila.total++;
      }
    });
  }

  const todas = [...porVariedad.values()]
    .sort((a, b) => b.total - a.total || b.lotesTotal - a.lotesTotal
                    || a.variedad.localeCompare(b.variedad));

  const visibles = todas.slice(0, maxFilas);
  const ocultas  = todas.slice(maxFilas);

  /* La intensidad se normaliza POR COLUMNA, no sobre toda la matriz.
   *
   * Con una escala unica gana siempre la alarma mas comun y aplasta al resto:
   * hoy 238 de 240 lotes estan con la frecuencia vencida, asi que esa columna
   * quedaria negra de punta a punta y las otras seis en el tono mas claro,
   * indistinguibles entre si. El heatmap terminaria diciendo "hay muchos lotes
   * vencidos", que ya lo dice un KPI, en vez de contestar la pregunta que
   * justifica su existencia: dentro de CADA tipo de alarma, en que variedades
   * se concentra.
   *
   * El costo es que un mismo tono significa cantidades distintas en columnas
   * distintas. Por eso cada celda lleva el numero impreso y cada columna
   * publica su propio maximo debajo del encabezado: el color ordena, el numero
   * cuantifica. */
  const maxPorColumna = ALARMAS_HEATMAP.map((_, i) =>
    visibles.reduce((m, f) => Math.max(m, f.celdas[i].n), 0));

  return {
    columnas: ALARMAS_HEATMAP.map(([, etiqueta]) => etiqueta),
    condiciones: ALARMAS_HEATMAP.map(([cond]) => cond),
    filas: visibles,
    ocultas: ocultas.length,
    maxPorColumna,
    maxCelda: Math.max(0, ...maxPorColumna),
  };
}

/** Resumen de una tanda de filas para las tarjetas KPI. */
export function resumen(filas){
  const deficit   = filas.filter(f => f.so2Delta !== null && f.so2Delta < 0);
  const avAlta    = filas.filter(f => f.avRatio !== null && f.avRatio >= 0.8);
  const litros    = filas.reduce((s, f) => s + (f.litros || 0), 0);
  return {
    total:      filas.length,
    variedades: new Set(filas.map(f => f.variedad)).size,
    deficitSo2: deficit.length,
    /* Cuanto SO2 falta en total: la suma de los deficit, en mg/L * litros
     * pasado a gramos. Es la magnitud del trabajo pendiente, no cuantos
     * lotes lo tienen, y es el numero con el que se decide si la correccion
     * se hace hoy o el lunes. */
    deficitGramos: deficit.reduce((s, f) => s + (-f.so2Delta) * (f.litros || 0) / 1000, 0),
    avAlta:     avAlta.length,
    litros:     litros,
    sinDatoAv:  filas.filter(f => f.av === null).length,
    /* "Sin dato" es "no se puede evaluar", no "falta el numero". Hay lotes que
     * traen SO2 libre desde una correccion pero nunca un pH, y sin pH no hay
     * objetivo contra el cual compararlos: contarlos como evaluados dejaria al
     * KPI diciendo "todo en objetivo" sobre lotes que nadie midio. */
    sinDatoSo2: filas.filter(f => f.so2Delta === null && !f.so2NoAplica).length,
  };
}
