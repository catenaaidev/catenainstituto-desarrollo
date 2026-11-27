import { NUMERICAS, parsearFecha } from './carga-cols.js';
const texto = v => String(v ?? '').trim();
export function planParcial(filas, existentes){
  const usados = new Set();
  const planes = filas.map(f => {
    if (f._errores?.length) return { error: f._errores.join(', ') };
    const fecha = parsearFecha(f.fecha_analisis);
    if (!fecha || !texto(f.lote)) return { error: 'Lote y fecha obligatorios' };
    const candidatos = existentes.map((a,i) => ({a,i})).filter(({a}) =>
      texto(a.lote) === texto(f.lote) && parsearFecha(a.fecha_analisis) === fecha &&
      (!texto(f.vasija) || texto(a.vasija) === texto(f.vasija)));
    if (candidatos.length !== 1) return { error: candidatos.length ? 'Varios análisis coinciden; indicá la vasija o editá el análisis individual' : 'No existe un análisis coincidente' };
    const {a,i} = candidatos[0];
    const cambios = Object.fromEntries([...NUMERICAS, 'comentario'].filter(k => f[k] != null && texto(f[k]) !== '' && f[k] !== a[k]).map(k => [k,f[k]]));
    if (!Object.keys(cambios).length) return { error: 'Sin cambios' };
    return { i, cambios, anterior: JSON.stringify(a) };
  });
  for (const p of planes) if (!p.error) {
    if (usados.has(p.i)) { for (const q of planes) if (q.i === p.i) q.error = 'Más de una fila apunta al mismo análisis'; }
    usados.add(p.i);
  }
  return planes;
}
