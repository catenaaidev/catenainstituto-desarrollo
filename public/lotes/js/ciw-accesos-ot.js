/* Navegación de consulta desde una OT: no modifica la orden ni la sesión. */
export function accesosConfirmacionOT(ctx){
  if (!ctx?.email) return '';
  const roles = ctx.modulos || {};
  const puede = m => ['admin','editor','lector'].includes(roles[m]);
  const links = [];
  if (puede('barriles')) links.push(['/barriles/#' + (roles.barriles === 'admin' ? 'inventario' : 'consulta'), 'Inventario'], ['/barriles/#' + (roles.barriles === 'admin' ? 'mapa' : 'buscar'), 'Mapa de barriles']);
  if (puede('lotes')) links.push(['/lotes/#lotes','Lotes'], ['/lotes/#inventario-tanques','Tanques']);
  links.push(['/','Sistema']);
  return '<nav class="ciw02-nav ciw02-nav--dialog" aria-label="Consultar desde la OT"><span>Consultar</span>' + links.map(([url,txt]) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${txt}</a>`).join('') + '<small>Volvé a esta pestaña para continuar la OT.</small></nav>';
}
