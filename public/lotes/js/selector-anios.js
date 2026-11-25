/* ===== Lotes CIW — selector de años =====
 * La lógica vive en public/shared/selector-anios.js (la comparte Prensas).
 * No importa nucleo.js: nucleo lo importa a él (cargarDashboard necesita la
 * clave). Avisa los cambios con 'lotes:anios-cambiados' y app.js hace el resto. */
'use strict';
import { crearSelectorAnios } from '../../shared/selector-anios.js';

const _s = crearSelectorAnios({ claveLS: 'lotes_anios', idContenedor: 'selAnios',
                                evento: 'lotes:anios-cambiados' });
export const aniosActivos = _s.aniosActivos;
export const visible = _s.visible;
export const otVisibleAhora = _s.otVisibleAhora;
export const queryAnios = _s.queryAnios;
export const montarSelectorAnios = _s.montar;
