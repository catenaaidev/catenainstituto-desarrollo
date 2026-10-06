/**
 * El Registro del operario: lo que antes era la carpeta de Excel "Registro
 * vaciado y llenado de barricas" (una columna por orden, el lote arriba y los
 * barriles abajo, un archivo por mes y sin buscador).
 *
 * Acá está solo la parte pura: entender lo que se escribe en el buscador,
 * filtrar y agrupar las órdenes del escáner (estado.escaneos), la historia de un
 * barril y el resumen de un lote. No lee el estado global ni toca el DOM.
 *
 * Se carga como <script> clásico y se cuelga de globalThis, igual que
 * inventario.js: el arranque de la página corre durante el parseo y un módulo
 * llegaría tarde. Se testea en test/barriles-registro.test.mjs.
 * Diseño: docs/superpowers/specs/2026-10-06-barriles-operario-registro-design.md
 */
(function (raiz) {
  'use strict';

  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
    'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  function txt(v) { return String(v == null ? '' : v).trim(); }
  function dos(n) { return String(n).padStart(2, '0'); }

  // El campo `mes` lo traen las órdenes importadas del Excel y es más confiable
  // que una fecha tipeada a mano (misma regla que escMesDe en index.html).
  function mesDeOrden(o) {
    if (o && txt(o.mes)) return txt(o.mes);
    const m = /^(\d{4})-(\d{2})/.exec(txt(o && o.fecha));
    return m ? m[1] + '-' + m[2] : '';
  }

  function mesesConOrdenes(ordenes) {
    return [...new Set((ordenes || []).map(mesDeOrden).filter(Boolean))].sort().reverse();
  }

  function nombreMes(mes) {
    const m = /^(\d{4})-(\d{2})$/.exec(txt(mes));
    return m && +m[2] >= 1 && +m[2] <= 12 ? MESES[+m[2] - 1] + ' ' + m[1] : txt(mes);
  }

  // No se llama fechaCorta: index.html ya tiene una con ese nombre (día/mes) y,
  // como los dos son scripts clásicos, la de la página pisaría a esta.
  function fechaRegistro(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt(iso));
    return m ? m[3] + '/' + m[2] + '/' + m[1].slice(2) : txt(iso);
  }

  // La mitad de las órdenes reales trae la OT con el prefijo ("OT-89", "ot 63",
  // "OT-D024", hasta "OT OT-91"). Solo se saca si sigue un número, con o sin una
  // letra adelante: una palabra como "OTOÑO" no se toca.
  function otLimpia(ot) {
    let s = txt(ot), antes;
    do { antes = s; s = s.replace(/^ot\s*[:#-]?\s*(?=(?:ot\b|[a-z]?\d))/i, ''); } while (s !== antes);
    return s;
  }

  function lotesCargados(ordenes) {
    return new Set((ordenes || []).map(o => txt(o.lote).toUpperCase()).filter(Boolean));
  }
  function apareceComoBarril(num, ordenes) {
    return (ordenes || []).some(o => (o.codigos || []).some(c => txt(c) === num));
  }

  // Un día sin año: el año más reciente que tenga órdenes ese día; si no hay, el
  // más reciente cargado; sin órdenes, el actual.
  function anioPara(mmdd, ordenes) {
    const anios = f => (ordenes || []).map(o => txt(o.fecha)).filter(f)
      .map(s => +s.slice(0, 4)).filter(Boolean);
    const conEseDia = anios(s => /^\d{4}-\d{2}-\d{2}/.test(s) && s.slice(5, 10) === mmdd);
    if (conEseDia.length) return Math.max(...conEseDia);
    const todos = anios(s => /^\d{4}-/.test(s));
    return todos.length ? Math.max(...todos) : new Date().getFullYear();
  }

  function interpretarBusqueda(texto, ordenes) {
    const t = txt(texto);
    if (!t) return { tipo: 'vacio', valor: '' };
    let m;
    // "b" corto solo con dígitos: "blend" es un lote, no el barril "lend".
    if ((m = /^(?:barril\s*[:#-]?\s*(\S+)|b\s*[:#-]?\s*(\d+))$/i.exec(t))) return { tipo: 'barril', valor: m[1] || m[2] };
    if ((m = /^lote\s*[:#-]?\s*(\S.*)$/i.exec(t))) return { tipo: 'lote', valor: txt(m[1]) };
    // OT siempre arranca con número: "OTOÑO" es un lote, no la OT "OÑO".
    if ((m = /^ot\s*[:#-]?\s*(\d\S*)$/i.exec(t))) return { tipo: 'ot', valor: m[1] };
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return { tipo: 'fecha', valor: t };
    if ((m = /^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2}|\d{4}))?$/.exec(t))) {
      const d = +m[1], mes = +m[2];
      if (d >= 1 && d <= 31 && mes >= 1 && mes <= 12) {
        const mmdd = dos(mes) + '-' + dos(d);
        const anio = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : anioPara(mmdd, ordenes);
        return { tipo: 'fecha', valor: anio + '-' + mmdd };
      }
    }
    const lotes = lotesCargados(ordenes);
    if (/^\d{6,}$/.test(t)) return { tipo: 'barril', valor: t };
    if (/^\d{5}$/.test(t)) {
      if (!lotes.has(t)) return { tipo: 'barril', valor: t };
      return apareceComoBarril(t, ordenes)
        ? { tipo: 'lote', valor: t, alternativa: 'barril' }
        : { tipo: 'lote', valor: t };
    }
    if (lotes.has(t.toUpperCase())) return { tipo: 'lote', valor: t };
    return { tipo: 'texto', valor: t };
  }

  function filtrarOrdenes(ordenes, consulta, mes) {
    const arr = ordenes || [];
    const q = consulta || { tipo: 'vacio', valor: '' };
    const v = txt(q.valor);
    switch (q.tipo) {
      case 'fecha': return arr.filter(o => txt(o.fecha).slice(0, 10) === v);
      case 'barril': return arr.filter(o => (o.codigos || []).some(c => txt(c) === v));
      case 'lote': return arr.filter(o => txt(o.lote).toUpperCase() === v.toUpperCase());
      case 'ot': return arr.filter(o => otLimpia(o.ot).toLowerCase() === otLimpia(v).toLowerCase());
      case 'texto': {
        const b = v.toLowerCase();
        return arr.filter(o => txt(o.lote).toLowerCase().includes(b) ||
          txt(o.ot).toLowerCase().includes(b) ||
          (o.codigos || []).some(c => txt(c).toLowerCase().includes(b)));
      }
      default: return mes ? arr.filter(o => mesDeOrden(o) === mes) : arr.slice();
    }
  }

  // Más nuevo primero: por fecha y, en el mismo día, la que se cargó después
  // (la que está más abajo en estado.escaneos).
  function masNuevaPrimero(ordenes) {
    return ordenes.map((o, i) => ({ o, i }))
      .sort((a, b) => txt(b.o.fecha).localeCompare(txt(a.o.fecha)) || b.i - a.i)
      .map(x => x.o);
  }

  function agruparPorMes(ordenes) {
    const grupos = new Map();
    for (const o of masNuevaPrimero(ordenes || [])) {
      const m = mesDeOrden(o);
      if (!grupos.has(m)) grupos.set(m, []);
      grupos.get(m).push(o);
    }
    return [...grupos.keys()]
      .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : b.localeCompare(a)))
      .map(mes => ({ mes, ordenes: grupos.get(mes) }));
  }

  function historiaDeBarril(num, ordenes) {
    const n = txt(num);
    return masNuevaPrimero((ordenes || []).filter(o => (o.codigos || []).some(c => txt(c) === n)))
      .reverse()
      .map(o => ({ id: o.id, fecha: txt(o.fecha), tipo: o.tipo, lote: txt(o.lote), ot: txt(o.ot) }));
  }

  function resumenDeLote(lote, ordenes) {
    const sus = filtrarOrdenes(ordenes, { tipo: 'lote', valor: lote }, '');
    const llenados = new Set(), vaciados = new Set();
    let ultimaFecha = '';
    for (const o of sus) {
      const cods = (o.codigos || []).map(txt);
      if (o.tipo === 'llenado' || o.tipo === 'llenado_vaciado') cods.forEach(c => llenados.add(c));
      if (o.tipo === 'vaciado' || o.tipo === 'llenado_vaciado') cods.forEach(c => vaciados.add(c));
      if (txt(o.fecha) > ultimaFecha) ultimaFecha = txt(o.fecha);
    }
    return { ordenes: sus.length, llenados: llenados.size, vaciados: vaciados.size, ultimaFecha };
  }

  raiz.interpretarBusqueda = interpretarBusqueda;
  raiz.mesDeOrden = mesDeOrden;
  raiz.mesesConOrdenes = mesesConOrdenes;
  raiz.filtrarOrdenes = filtrarOrdenes;
  raiz.agruparPorMes = agruparPorMes;
  raiz.historiaDeBarril = historiaDeBarril;
  raiz.resumenDeLote = resumenDeLote;
  raiz.nombreMes = nombreMes;
  raiz.fechaRegistro = fechaRegistro;
  raiz.otLimpia = otLimpia;
})(typeof globalThis !== 'undefined' ? globalThis : window);
