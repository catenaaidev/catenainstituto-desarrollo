/**
 * Módulo Lotes — PENDIENTE (Fase 4).
 *
 * Es el módulo más grande y el único que NO se puede mudar: hay que reescribir
 * su lógica. Los 25 módulos de js/ se reaprovechan casi enteros, pero los ocho
 * motores viven en Python y la nube no los ejecuta:
 *
 *   motor_correccion.py    17,5 KB
 *   motor_fml.py           15,8 KB
 *   motor_cruce.py         12,7 KB
 *   motor_etapas.py        12,0 KB
 *   motor_linaje.py        11,9 KB
 *   motor_mapa.py           8,5 KB
 *   motor_envases.py        1,9 KB
 *   motor_movimientos.py    1,6 KB
 *                          ─────── 87 KB de reglas de negocio
 *
 * Son reglas de fermentación maloláctica, linaje y corrección que afectan
 * producción real. Portarlas exige verificar cada una contra los datos
 * actuales, motor por motor, con sus tests. Estimado: 5 a 8 días.
 *
 * Por eso se deja para el final y se estima aparte: prometerlo junto con los
 * otros dos módulos sería subestimarlo.
 */

import { json } from '../respuestas';

export async function rutasLotes(
  _req: Request,
  _env: Env,
  _ctx: ExecutionContext,
  _ruta: string,
): Promise<Response | null> {
  return json(503, {
    error: 'en_preparacion',
    detalles: ['Lotes todavía no está migrado (Fase 4). Seguí usando la app local.'],
  });
}
