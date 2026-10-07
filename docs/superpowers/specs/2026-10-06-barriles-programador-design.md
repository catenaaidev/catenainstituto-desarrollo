# Barriles web — vista del programador más simple (2026-10-06)

Pedido: hacer con el programador (rol admin) algo parecido a lo del operario,
ordenando mejor la información **sin tocar funciones ni reglas**.

## Qué cambia

Nueve pestañas sueltas → cinco grupos con sub-pestañas (`PROG_GRUPOS`, `progIr`):

| Grupo | Sub-pestañas |
|---|---|
| 🏠 Inicio | (pantalla nueva `#panel-tablero`) |
| 🛢️ Barriles | Inventario · Llenado / vaciado · Registro |
| 🗺️ Mapa | Mapa · Vista 3D |
| 🏷️ Imprimir | Rótulos · Pedidos de rótulos (con contador) |
| ⚙️ Administrar | Importar y modo · Boxes y palets · Respaldos · Celular |

- **Inicio**: saludo, cifras (vasijas, llenas, vacías, órdenes del mes) y
  pendientes (carteles ⚠, pedidos sin imprimir, fechas para corregir, migración).
  Cada tarjeta lleva a su pantalla. Los avisos de fechas/migración que se
  pospusieron con "Más tarde" se reabren desde acá.
  No muestra "llenas sin ubicar" ni "lotes fragmentados": el mapa de la bodega se
  carga por lote, sin número de barril, y darían siempre "todas" y 0.
- **Asociar vasija**: el programador no la usa (pedido del usuario, 2da vuelta): en
  Barriles → Inventario ve solo la lista. El operario la sigue teniendo en su portada.
- **Importar Excel**, **Modo por lote** (antes en el encabezado) y **Respaldos**
  se mudaron a Administrar, con los mismos ids. En el encabezado queda
  `#chipModoLote`, visible solo cuando el modo está prendido.
- **Reportes** se sacó a pedido del usuario (3ra vuelta); "Lotes trasegados por mes" sigue en Llenado / vaciado.
- **Registro** (el del operario) ahora también lo ve el programador.
  `opSeccion` redirige al programador a su barra (`OP_A_PROG`), así los atajos del
  Registro (ver en mapa, editar) funcionan igual.
- La ayuda del Mapa arranca plegada para el programador.

## Qué no cambia

Lógica, reglas, ids y manejadores. El operario se ve igual (CSS nuevo bajo
`body.rol-programador`; las tarjetas mudadas eran `solo-prog`).

## Cómo se probó

Mock sin login (`mock-programador.mjs`, entrada `barriles-programador` :8804 del
launch.json de Escritorio\claude) con el respaldo del 2026-10-02: cada
sub-pestaña abre su panel, atajos del Registro, interruptor de modo por lote,
corrección de fechas desde Inicio, vista del operario sin cambios, 375 px sin
scroll lateral.
