/**
 * Módulo Mapa de Barriles — PENDIENTE (Fase 2).
 *
 * Qué falta para completarlo:
 *  1. El archivo .db actual del mapa (en el zip vinieron solo los respaldos de
 *     backups/auto/). Se importa a D1 con:
 *       npx wrangler d1 execute ciw-plataforma --file=barriles.sql --remote
 *  2. Portar los endpoints de su servidor.py (40 KB) acá.
 *  3. Portar sus tests: test_persistencia.py, test_borrado_masivo.py,
 *     test_instancia_unica.py.
 *  4. Copiar su index.html (288 KB) + three.min.js, OrbitControls.js,
 *     zxing.min.js, xlsx.full.min.js a public/barriles/, y apuntar sus
 *     llamadas a /barriles/api (igual que se hizo en Prensas).
 *
 * Al migrar se pueden BORRAR cert.pem, key.pem y los .bat de firewall: el
 * HTTPS de Cloudflare es real, así que la cámara del celular funciona sin la
 * advertencia de seguridad que hoy hay que aceptar en cada teléfono.
 */

import { json } from '../respuestas';

export async function rutasBarriles(
  _req: Request,
  _env: Env,
  _ctx: ExecutionContext,
  _ruta: string,
): Promise<Response | null> {
  return json(503, {
    error: 'en_preparacion',
    detalles: ['El Mapa de Barriles todavía no está migrado (Fase 2). Seguí usando la app local.'],
  });
}
