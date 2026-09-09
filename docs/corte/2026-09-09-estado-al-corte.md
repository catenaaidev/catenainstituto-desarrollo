# Estado al corte · 2026-09-09

Registro de en qué quedó cada módulo el día en que la web pasó a ser la única
fuente. Es el criterio de éxito 5 del spec
`docs/superpowers/specs/2026-09-09-corte-web-only-design.md`.

## En la nube (tabla `documento` de D1)

| modulo | version | autor | guardado |
|---|---|---|---|
| barriles | 2218 | importacion | (vacío) |
| lotes | 16 | reconciliacion-excel | 2026-09-08 16:38:47 |
| prensas | 89 | Marcelo | 2026-09-04 12:18:55 |

Fuente: medición directa sobre la base de producción el 2026-09-09.

## En local, antes de apagar

| modulo | version | de dónde salió |
|---|---|---|
| barriles | 2218 | `http://localhost:8766/api/estado` (server vivo) |
| lotes | 16 | `Lotes\datos.json` |
| prensas | 87 | `prensas-app\datos.json` |

Nota: Prensas local (87) está por debajo de la nube (89, autor Marcelo): la web
ya iba adelante en este módulo, exactamente lo esperado.

## Archivos guardados

Todos viven **solo en esta máquina**: están gitignorados a propósito porque son
datos de producción y el repositorio es público. Si el rollback tiene que estar
disponible en otro lado, hay que copiarlos a mano.

- Respaldo de la nube (la red de rollback), verificado versión por versión:
  - `respaldo-nube-barriles-2026-09-09-corte.json` (831 809 bytes, versión 2218)
  - `respaldo-nube-lotes-2026-09-09-corte.json` (1 785 225 bytes, versión 16)
  - `respaldo-nube-prensas-2026-09-09-corte.json` (750 401 bytes, versión 89)
- Último estado local:
  - `docs/corte/ultimo-estado-local-barriles-2026-09-09.json` (768 375 bytes, versión 2218)
  - `docs/corte/ultimo-estado-local-lotes-2026-09-09.json` (2 150 450 bytes, versión 16)
  - `docs/corte/ultimo-estado-local-prensas-2026-09-09.json` (929 883 bytes, versión 87)

Los tres respaldos de la nube los generó el usuario a mano en `cmd.exe`: el
clasificador de permisos de Claude Code rechaza `wrangler d1 execute --remote`,
aunque las credenciales funcionan bien desde la terminal. No es un problema de
Cloudflare.

**Comprobación que no hay que saltear:** un respaldo puede traer `"results": []`
y pesar poco sin que nadie lo note, dejando la red de rollback vacía. Los tres se
verificaron abriendo el JSON y comparando la versión de adentro contra la tabla
de arriba. Coinciden.

## Lo que había que saber

- Ningún dato local era más nuevo que la nube en Barriles ni en Lotes.
  En Prensas la nube va adelante (89 vs 87 local): no se perdió información.
- `autor` mostraba que solo Prensas tenía uso real desde la web (`Marcelo`).
  Barriles decía `importacion` y Lotes `reconciliacion-excel`: los dos estaban
  al día porque los empujamos nosotros, no porque el equipo los usara. De ahí
  la prueba de humo de la Tarea 4.
