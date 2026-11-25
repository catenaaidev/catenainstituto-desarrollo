/* ===== Órdenes de trabajo — catálogo de tipos (puro) =====
 * Lo que se puede emitir desde «Nueva orden». Los id de Lotes son los de
 * PLANTILLAS_OT (public/lotes/js/ot-plantillas.js) + 'correccion'; un test
 * vigila que no se desincronicen. Los nombres son copia de las plantillas. */
'use strict';

export const TIPOS = [
  { id: 'barricas-barricas', modulo: 'lotes', nombre: 'Trasiego fin FML de barricas a barricas',
    desc: 'Pasar el vino de barricas a barricas al terminar la FML.',
    sinonimos: ['trasiego', 'fml', 'barricas', 'barrica a barrica'] },
  { id: 'tq-barricas', modulo: 'lotes', nombre: 'Trasiego fin FML de TQ a barricas',
    desc: 'Del tanque a barricas al terminar la FML.',
    sinonimos: ['trasiego', 'fml', 'tq', 'tanque a barrica', 'llenado'] },
  { id: 'barrica-tanque', modulo: 'lotes', nombre: 'Trasiego de barrica a tanque',
    desc: 'Vaciar barricas a un tanque.',
    sinonimos: ['trasiego', 'barrica a tanque', 'vaciado', 'descube'] },
  { id: 'tq-tq', modulo: 'lotes', nombre: 'Trasiego de tq a tq',
    desc: 'De un tanque a otro.',
    sinonimos: ['trasiego', 'tq', 'tanque a tanque'] },
  { id: 'barricas-tanque', modulo: 'lotes', nombre: 'Corte',
    desc: 'Juntar lotes en uno nuevo o en uno existente.',
    sinonimos: ['corte', 'mezcla', 'blend', 'ensamblaje'] },
  { id: 'corte-achique', modulo: 'lotes', nombre: 'Corte + achique',
    desc: 'Corte y repartir lo que sobra en otras vasijas.',
    sinonimos: ['corte', 'achique', 'mezcla', 'blend'] },
  { id: 'traslado', modulo: 'lotes', nombre: 'Traslado',
    desc: 'Mandar vino a otra bodega.',
    sinonimos: ['traslado', 'salida', 'envio', 'otra bodega', 'despacho'] },
  { id: 'muestras-ot', modulo: 'lotes', nombre: 'Muestras',
    desc: 'Buscar muestras de lotes y vasijas (ensayos, cortes).',
    sinonimos: ['muestras', 'ensayos', 'cortes', 't50', 'nico', 'muestreo'] },
  { id: 'correccion', modulo: 'lotes', nombre: 'Corrección SO₂',
    desc: 'Orden de corrección de sulfuroso de los lotes bajos.',
    sinonimos: ['correccion', 'so2', 'sulfuroso', 'metabisulfito', 'mbk', 'agregado'] },
  { id: 'muestras', modulo: 'lotes', nombre: 'Orden de muestras',
    desc: 'Muestras de lotes para el laboratorio y la degustación.',
    sinonimos: ['muestras', 'analisis', 'laboratorio', 'lab', 'degustacion', 'muestreo', 'barriles'] },
  { id: 'micro', modulo: 'lotes', nombre: 'Orden de microbiología',
    desc: 'Muestras para microbiología, con el cartel de la caja.',
    sinonimos: ['microbiologia', 'micro', 'laboratorio', 'cartel', 'caja', 'brett'] },
  { id: 'agregados', modulo: 'lotes', nombre: 'Otros agregados',
    desc: 'TH2, quitosano, levadura y otros productos por vasija.',
    sinonimos: ['agregados', 'agregado', 'th2', 'tanino', 'quitosano', 'levadura', 'nutriente', 'producto'] },
  { id: 'prensas-muestras', modulo: 'prensas', nombre: 'Orden de muestras',
    desc: 'Muestras de las prensas para el laboratorio y la degustación.',
    sinonimos: ['muestras', 'analisis', 'laboratorio', 'lab', 'degustacion', 'prensa', 'vencidos'] },
  { id: 'prensas-rellenos', modulo: 'prensas', nombre: 'Rellenos',
    desc: 'Rellenar barriles de las prensas con su lote origen.',
    sinonimos: ['relleno', 'rellenos', 'rellenar', 'merma', 'barriles', 'estirar'] },
  { id: 'prensas-accion', modulo: 'prensas', nombre: 'Acción rápida',
    desc: 'Corrección de SO₂ con Solución 1.030 para los lotes NO OK de la degustación.',
    sinonimos: ['accion rapida', 'so2', 'sulfuroso', 'sol 1030', 'solucion', 'no ok', 'degustacion', 'correccion'] },
  { id: 'prensas-agregados', modulo: 'prensas', nombre: 'Agregados',
    desc: 'OT de TH2 y SO₂ para las prensas, desde la bitácora de agregados.',
    sinonimos: ['agregados', 'agregado', 'th2', 'tartarico', 'so2', 'sulfuroso'] },
];

export function normalizar(s){
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

const _texto = t => normalizar([t.nombre, t.desc, ...t.sinonimos].join(' '));

/** Los tipos de los módulos donde se puede emitir, que contienen TODAS las palabras de q. */
export function buscarTipos(q, modulosEditables){
  const palabras = normalizar(q).split(' ').filter(Boolean);
  return TIPOS
    .filter(t => (modulosEditables || []).includes(t.modulo))
    .filter(t => { const x = _texto(t); return palabras.every(p => x.includes(p)); });
}

/** Los módulos donde se puede emitir: rol editor/admin Y al menos un tipo en
 * el catálogo. `roles` es { modulo: rol }, como window.CIW.modulos. */
export function modulosEditablesDe(roles){
  const r = roles || {};
  return [...new Set(TIPOS.map(t => t.modulo))]
    .filter(m => r[m] === 'editor' || r[m] === 'admin');
}

// Lo que aparece en Historial sin ser un tipo que se emita desde «Nueva orden».
const OTROS = { guia: 'Guía de trabajos' };

export function nombreDeTipo(id){
  const t = TIPOS.find(x => x.id === id);
  return t ? t.nombre : (OTROS[id] || String(id ?? ''));
}
