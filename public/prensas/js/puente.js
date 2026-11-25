/* ===== Prensas — puente a los módulos compartidos =====
 * app.js es un script clásico (globales, sin import). Este módulo carga lo
 * compartido con Lotes y las reglas puras de Prensas, los cuelga de
 * window.PrensasMods y avisa: app.js recién carga los datos después del aviso.
 *
 * Entrega 3 de Órdenes de trabajo: además de lo de arriba, cuelga las 4 hojas
 * de orden de Prensas (hojas-prensas.js, puro) y las piezas compartidas con
 * Lotes para guardar/ejecutar órdenes de papel (public/lotes/js/…), así
 * app.js puede pintarlas y usarlas sin duplicar ese código. */
import { anioDeLote } from '../../shared/anios.js';
import { crearSelectorAnios } from '../../shared/selector-anios.js';
import { crearFiltroLlenado } from '../../shared/filtro-llenado.js';
import { esVaciado, claveTiempo, ordenarPorTiempo, ultimoAnalisis } from './reglas-lote.js';
import * as HojasPrensas from './hojas-prensas.js';
import { leerModoOrden, destinoPrensas, tituloModoPrensas, urlVolver } from './modo-ordenes-prensas.js';
import { fijarEntornoOT } from '../../lotes/js/entorno-ot.js';
import { proponerNumero, chipCarpeta, cablearChipsCarpeta, imprimirYGuardar } from '../../lotes/js/guardar-ot.js';
import { armarOrdenHoja, ordenHojaPorId } from '../../lotes/js/ordenes-hojas.js';
import { htmlCabeceraOrden, cablearCabeceraOrden, guardarOrdenHojaConfirmando } from '../../lotes/js/vista-orden-guardada.js';
import { avisar, informar, confirmar } from '../../lotes/js/dialogos.js';

window.PrensasMods = { anioDeLote, crearSelectorAnios, crearFiltroLlenado,
                       esVaciado, claveTiempo, ordenarPorTiempo, ultimoAnalisis,
                       ...HojasPrensas,
                       leerModoOrden, destinoPrensas, tituloModoPrensas, urlVolver,
                       fijarEntornoOT,
                       proponerNumero, chipCarpeta, cablearChipsCarpeta, imprimirYGuardar,
                       armarOrdenHoja, ordenHojaPorId,
                       htmlCabeceraOrden, cablearCabeceraOrden, guardarOrdenHojaConfirmando,
                       avisar, informar, confirmar };
document.dispatchEvent(new Event('prensas:mods-listos'));
