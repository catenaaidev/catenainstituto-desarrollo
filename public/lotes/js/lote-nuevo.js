/* ===== Lotes CIW — lote nuevo, lote hijo y lotes fijados arriba =====
 * Modulo puro (sin DOM ni storage) para que se pueda testear en el runtime de
 * Workers. La parte de pantalla (el asistente y el boton Ordenar) vive en
 * vista-lotes.js. */
'use strict';

/* Mismo `num` que nucleo.js. No se importa de ahi porque nucleo.js toca el DOM
 * y este modulo tiene que poder cargarse en los tests. */
const num = v => { if (v===''||v==null) return null; const n=parseFloat(String(v).replace(',','.')); return isNaN(n)?null:n; };

/* Los campos del desglose de envases. Un lote hijo NO los hereda: arranca
 * vacio y se le carga su parte en el overlay de Envases. */
export const CAMPOS_ENVASE = ['cap50', 'cap200', 'cap225', 'cap500', 'vasija_grande'];

/* Los pasos del asistente de "Nuevo lote", en el orden en que se preguntan.
 * Solo el numero de lote es obligatorio: lo demas se puede completar despues
 * en la tabla. `sugerir` arma la lista de valores ya usados en otros lotes. */
export const PASOS = [
  { k: 'lote',                  label: 'Número de lote', obligatorio: true },
  { k: 'variedad',              label: 'Variedad',       sugerir: true },
  { k: 'distrito',              label: 'Distrito',       sugerir: true },
  { k: 'proyecto',              label: 'Proyecto',       sugerir: true },
  { k: 'organico_convencional', label: 'Orgánico / Convencional',
    opciones: ['', 'Orgánico', 'Convencional'] },
];

/* Copia exacta del padre, salvo el numero de lote (lo pone el usuario), los
 * litros (0 y nunca null: motor_etapas compara litros_actuales <= 0) y los
 * envases. Los campos que empiezan con _ son de la vista, no del lote. */
export function armarHijo(padre){
  const h = {};
  for (const [k, v] of Object.entries(padre)){
    if (k.startsWith('_')) continue;
    h[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
  }
  h.lote = '';
  h.litros_actuales = 0;
  for (const k of CAMPOS_ENVASE) h[k] = null;
  return h;
}

/* El numero de lote es obligatorio, numerico (la columna Lote es num) y no
 * puede repetirse. Los lotes viejos lo tienen guardado como numero o como
 * texto, por eso se compara por String. */
export function validarNumeroLote(texto, lotes){
  const t = String(texto ?? '').trim();
  if (!t) return { ok: false, error: 'Escribí el número de lote.' };
  const valor = num(t);
  if (valor === null) return { ok: false, error: 'El número de lote tiene que ser un número.' };
  if (lotes.some(l => String(l.lote ?? '') === String(valor)))
    return { ok: false, error: `El lote ${valor} ya existe.` };
  return { ok: true, valor };
}

/* Los fijos van arriba, del mas nuevo al mas viejo (`fijos` esta en orden de
 * creacion), y despues el resto en el orden que ya traian. Un fijo se muestra
 * aunque el filtro lo haya dejado afuera: un lote recien creado arranca en 0
 * litros y el filtro de Llenado lo esconderia justo cuando se lo esta
 * completando. */
export function ordenarConFijos(visibles, fijos){
  const set = new Set(fijos);
  return [...fijos].reverse().concat(visibles.filter(o => !set.has(o)));
}

/* El movimiento que deja registrado de donde salio un lote hijo. Tiene que ser
 * un traspaso EJECUTADO: el linaje (src/lotes/motores/linaje.ts, TIPOS_A_LOTE)
 * solo arma la arista padre→hijo con traspaso o renombre, y los pendientes no
 * cuentan. Mismo criterio que la OT de corte. Los litros quedan vacios: se
 * completan en la pestaña Movimientos. Misma forma que el ➕ de Movimientos. */
export function movimientoHijo(padre, hijo, usuario, hoy){
  return {
    id: 'mov-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    lote: String(padre.lote ?? ''), tipo: 'traspaso', fecha: hoy,
    vasija_origen: '', vasija_destino: '', litros: null,
    lote_destino: String(hijo.lote ?? ''), destino_externo: '',
    estado: 'ejecutado',
    ot: '', operario: '', comentario: 'Lote hijo creado desde la pestaña Lotes',
    cargado_por: usuario || '', cargado_el: hoy,
  };
}
