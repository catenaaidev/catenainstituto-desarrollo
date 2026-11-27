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
  so2_libre_techo:        40,
  ph_max:                 3.75,
  av_max:                 0.8,
  av_delta_max:           0.3,
  av_delta_dias:          15,
  frecuencia_no_terminada:15,
  frecuencia_terminada:   30,
  frecuencia_trasiego:    90,
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

/** Techo operativo de las OT; no altera el objetivo molecular de laboratorio. */
export function techoSo2OT(config, variedad, proyecto){
  const cfg = config?.criterios_fml || {};
  let techo = 40;
  const aplicar = obj => {
    const raw = obj?.so2_libre_techo;
    if (raw == null || typeof raw === 'boolean' || String(raw).trim() === '') return;
    const n = Number(String(raw).trim().replace(',', '.'));
    if (Number.isFinite(n)) techo = n;
  };
  aplicar(cfg.default);
  for (const [tabla, clave] of [[cfg.por_variedad, variedad], [cfg.por_proyecto, proyecto]]){
    const match = Object.entries(tabla || {}).find(([nombre]) => _normVar(nombre) === _normVar(clave));
    if (match) aplicar(match[1]);
  }
  return techo > 0 ? Math.min(techo, 40) : 40;
}

/** Validación de dosis según la fórmula que ya usa CIW, no una predicción química.
 * Sin SO2 medido o volumen conocido no se autoriza una dosis positiva. */
export function problemaDosisSo2(actual, litros, dosis, techo){
  const { mbk_g: g, ml_solucion: ml } = dosis || {};
  if (g == null && ml == null) return '';
  if (![g,ml].every(n=>n == null || (Number.isFinite(n) && n >= 0))) return 'Dosis inválida.';
  if (!(g > 0 || ml > 0)) return '';
  if (!Number.isFinite(actual) || actual < 0 || !Number.isFinite(litros) || litros <= 0) return 'Falta SO₂ medido o volumen válido para verificar la dosis.';
  const dif = Math.max(0, techo - actual);
  const maxG = dif * litros * 1.5 / 1000 * 2;
  const maxMl = dif * litros * 1.5 / 55;
  if ((g ?? 0) > maxG + 1e-8 || (ml ?? 0) > maxMl + 1e-8) return `La dosis supera el techo operativo de ${techo} ppm.`;
  return '';
}

export function problemaObjetivoSo2(actual, deseado, techo){
  if (deseado == null) return '';
  if (!Number.isFinite(deseado) || deseado < 0) return 'Ingresá un objetivo de SO₂ válido.';
  if (deseado > techo) return `El objetivo supera el techo de SO₂ libre de ${techo} ppm.`;
  if (actual != null && (!Number.isFinite(actual) || actual < 0)) return 'Ingresá un SO₂ actual válido.';
  if (actual != null && deseado < actual) return 'El SO₂ medido supera el objetivo: no corresponde agregar SO₂.';
  return '';
}
