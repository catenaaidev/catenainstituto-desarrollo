/* Suma una vendimia convertida del Excel (migrar_excel.py) al documento de
 * Lotes. Puro: sin archivos ni red, para poder testearlo.
 *
 * Solo AGREGA: los lotes y análisis de otros años quedan tal cual, y si el
 * documento ya tiene algún lote del año se frena (importar dos veces
 * duplicaría todos los análisis). */
import { anioDeLote } from '../public/lotes/js/anios.js';

/* Campos que migrar_excel.py escribe y la web nunca leyó. */
const SOBRAN = ['trasiegos', 'ultimo_relleno'];
const MEDIDAS = ['etanol', 'ph', 'av', 'gluc_fruc', 'malico', 'lactico', 'acidez_total',
  'azucar_reductor', 'so2_libre', 'so2_total', 'so2_molec', 'brett', 'aceticas',
  'lacticas', 'levaduras', 'hongos'];

const lleno = v => v !== null && v !== undefined && String(v).trim() !== '';

/* Un renglón del Excel con lote y fecha pero sin ninguna medida, comentario,
 * vasija analizada ni corrección: la planilla los tiene "preparados" y en la
 * web no son nada. */
function analisisVacio(a){
  if (MEDIDAS.some(k => lleno(a[k]))) return false;
  if (lleno(a.comentario)) return false;
  if (lleno(a.vasija_analizada)) return false;
  const c = a.correccion || {};
  return !Object.values(c).some(v => lleno(v) && v !== 0);
}

export function fusionarAnio(doc, convertido, anio){
  const ajenos = (convertido.lotes || []).filter(l => anioDeLote(l.lote) !== anio).map(l => l.lote);
  if (ajenos.length) throw new Error(`el Excel trae lotes que no son de ${anio}: ${ajenos.slice(0, 10).join(', ')}`);
  const yaEstan = (doc.lotes || []).filter(l => anioDeLote(l.lote) === anio);
  if (yaEstan.length) throw new Error(`el documento ya tiene ${yaEstan.length} lotes de ${anio}: no se importa dos veces`);

  const lotes = (convertido.lotes || []).map(l => {
    const n = {};
    for (const [k, v] of Object.entries(l)) if (!SOBRAN.includes(k)) n[k] = v;
    n.lote = Number(String(l.lote).trim());   // como los de 2026
    return n;
  });
  const todos = convertido.analisis || [];
  const analisis = todos.filter(a => !analisisVacio(a)).map(a => ({ ...a, lote: String(a.lote).trim() }));
  const maestro = new Set(lotes.map(l => String(l.lote)));
  const huerfanos = [...new Set(analisis.map(a => a.lote).filter(l => !maestro.has(l)))].sort();

  return {
    doc: { ...doc, meta: { ...(doc.meta || {}), version: Number((doc.meta || {}).version || 0) + 1 },
           lotes: [...(doc.lotes || []), ...lotes], analisis: [...(doc.analisis || []), ...analisis] },
    reporte: { lotes: lotes.length, analisis: analisis.length,
               analisis_vacios: todos.length - analisis.length, huerfanos },
  };
}
