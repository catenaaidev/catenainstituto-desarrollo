/* ===== Lotes CIW — criterios FML (espejo JS de src/lotes/motores/fml.ts) ===== */
'use strict';

/**
 * CRITERIOS_DEFAULT replicados desde src/lotes/motores/fml.ts (CRITERIOS_DEFAULT),
 * que a su vez sigue el tablero aprobado Dashboard FML.
 * Usados por criteriosEfectivosJS y por el boton "Restaurar valores por defecto".
 */
export const CRITERIOS_DEFAULT = {
  hace_fml:               'si',
  fa_azucar_reductor_max: 5.0,
  gluc_fruc_max:          3.0,
  fml_malico_finalizada:  0.2,
  fml_malico_2ultimas:    0.5,
  so2_molecular_objetivo: 0.38,
  so2_libre_piso:         20.0,
  ph_max:                 3.75,
  av_max:                 0.8,
  av_delta_max:           0.3,
  av_delta_dias:          15,
  frecuencia_no_terminada:15,
  frecuencia_terminada:   30,
  so2_caida_max:          12.0,
  so2_aplica:             'si',
  ph_max_inclusive:       'no',
};

/* --- helpers de criterios (replica JS de criteriosEfectivos en fml.ts) --- */
export function _normVar(v){
  return String(v==null?'':v).normalize('NFKD').replace(/[̀-ͯ]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
/* Espejo de motor_fml._aplicar_override: aplica sobre `base` el override de
 * `tabla` cuya clave normaliza igual que `clave`. Muta `base`. */
function _aplicarOverride(base, tabla, clave){
  const objetivo = _normVar(clave);
  const t = tabla || {};
  for (const nombre in t){
    if (_normVar(nombre) === objetivo){ Object.assign(base, t[nombre] || {}); break; }
  }
}

export function criteriosEfectivosJS(config, variedad, proyecto){
  const cf = (config && config.criterios_fml) || {};
  // Sembrar desde CRITERIOS_DEFAULT (igual que motor_fml.criterios_efectivos) para
  // que sea un espejo real: si config.default pierde una clave, no queda undefined.
  const base = Object.assign({}, CRITERIOS_DEFAULT, cf.default || {});
  // El orden ES la precedencia, igual que en el motor: variedad y despues
  // proyecto, para que el proyecto pise clave por clave lo que define.
  _aplicarOverride(base, cf.por_variedad, variedad);
  _aplicarOverride(base, cf.por_proyecto, proyecto);
  return base;
}
