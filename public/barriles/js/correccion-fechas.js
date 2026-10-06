/**
 * Corrección única (2026-10-06) de 19 fechas mal importadas de la Planilla scaner.
 *
 * Al importar las órdenes viejas, algunas celdas de fecha que Excel ya había
 * guardado con día y mes invertidos ("10/02/2026" quedó 2 de octubre) y algunos
 * años mal tipeados entraron tal cual: órdenes de febrero y marzo aparecían en
 * noviembre, diciembre o febrero de 2027. Estas 19 son las seguras (fecha futura o
 * año imposible), revisadas una por una con el usuario contra la planilla y las
 * órdenes vecinas. Las ambiguas del pasado se dejaron como están, a propósito.
 *
 * Solo se aplica si la orden todavía tiene la fecha mala (`de`): si alguien ya la
 * corrigió a mano, no se toca. La aplica el programador desde un aviso.
 * Puro, script clásico colgado de globalThis. Test: test/barriles-consulta.test.mjs.
 */
(function (raiz) {
  'use strict';

  const CORRECCION_FECHAS_2026_10 = [
    // "11/02026" en la planilla: 11 de febrero (vecinas del 10/02 y 14/02)
    { id: 'imp0108', de: '2026-11-01', a: '2026-02-11' },
    { id: 'imp0109', de: '2026-11-01', a: '2026-02-11' },
    { id: 'imp0110', de: '2026-11-02', a: '2026-02-11' },
    { id: 'imp0111', de: '2026-11-02', a: '2026-02-11' },
    // día y mes invertidos (vecinas del 11/02 y 14/02)
    { id: 'imp0112', de: '2026-12-02', a: '2026-02-12' },
    { id: 'imp0113', de: '2026-12-02', a: '2026-02-12' },
    // "20-2-27": año mal tipeado
    { id: 'imp0152', de: '2027-02-20', a: '2026-02-20' },
    // día y mes invertidos (vecinas de marzo)
    { id: 'imp0171', de: '2026-12-03', a: '2026-03-12' },
    { id: 'imp0226', de: '2026-11-03', a: '2026-03-11' },
    { id: 'imp0227', de: '2026-11-03', a: '2026-03-11' },
    { id: 'imp0228', de: '2026-11-03', a: '2026-03-11' },
    { id: 'imp0229', de: '2026-11-03', a: '2026-03-11' },
    { id: 'imp0234', de: '2026-11-03', a: '2026-03-11' },
    { id: 'imp0235', de: '2026-11-03', a: '2026-03-11' },
    { id: 'imp0236', de: '2026-12-03', a: '2026-03-12' },
    { id: 'imp0237', de: '2026-12-03', a: '2026-03-12' },
    { id: 'imp0238', de: '2026-12-03', a: '2026-03-12' },
    { id: 'imp0239', de: '2026-12-03', a: '2026-03-12' },
    // año 2023: todas sus vecinas son del 13/03/2026
    { id: 'imp0248', de: '2023-06-13', a: '2026-03-13' },
  ];

  // Las correcciones que todavía faltan: [{ id, de, a, lote }]
  function planCorreccionFechas(escaneos) {
    const porId = new Map((escaneos || []).map(o => [String(o.id), o]));
    const plan = [];
    for (const c of CORRECCION_FECHAS_2026_10) {
      const o = porId.get(c.id);
      if (o && String(o.fecha || '') === c.de) plan.push({ id: c.id, de: c.de, a: c.a, lote: String(o.lote || '') });
    }
    return plan;
  }

  raiz.CORRECCION_FECHAS_2026_10 = CORRECCION_FECHAS_2026_10;
  raiz.planCorreccionFechas = planCorreccionFechas;
})(typeof globalThis !== 'undefined' ? globalThis : window);
