// Reutiliza las pantallas y los permisos del módulo de origen. No duplica registros.
export function accesosOperativos(modulos = {}) {
  if (!['admin','editor','lector'].includes(modulos.lotes)) return [];
  return [
    ['/lotes/#movimientos','Movimientos','Traslados, mermas y seguimiento de movimientos'],
    ['/lotes/#so2','Correcciones','Registro de SO₂, otros agregados y su historial']
  ];
}
