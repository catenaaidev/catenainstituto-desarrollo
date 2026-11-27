// El catálogo no carga ni copia datos: abre las vistas nativas con la sesión vigente.
export function inventarios(modulos = {}) {
  const items = [];
  if (modulos.barriles) items.push({ id:'barriles', area:'Barriles', titulo:'Barriles y vasijas móviles', detalle:'Barricas, vasijas, tanques de 50 L, estado y lote asignado. Consulta, filtros y administración según tu rol.', href:modulos.barriles === 'admin' ? '/barriles/#inventario' : '/barriles/#consulta' });
  if (modulos.lotes) {
    items.push({ id:'tanques', area:'Lotes', titulo:'Tanques y vasijas fijas', detalle:'Contenido, litros, estado de cada vasija, recorridas, mediciones y OT de inventario.', href:'/lotes/#inventario-tanques' });
    items.push({ id:'padron', area:'Lotes · Maestro', titulo:'Padrón de vasijas fijas', detalle:'Capacidades reales, tipos de vasija, tablas de cubicación y altas o bajas del padrón.', href:'/lotes/#inventario-vasijas' });
  }
  return items;
}
