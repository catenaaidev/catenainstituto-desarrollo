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
Los respaldos JSON de D1 quedaron PENDIENTES (ver sección más abajo).

## En local, al momento de apagar

| modulo | version | de dónde salió |
|---|---|---|
| barriles | 2218 | `http://localhost:8766/api/estado` (server vivo) |
| lotes | 16 | `Lotes\datos.json` |
| prensas | 87 | `prensas-app\datos.json` |

Nota: Prensas local (87) está por debajo de la nube (89, autor Marcelo): la web
ya iba adelante en este módulo, exactamente lo esperado.

## Archivos guardados

- Último estado local (solo en esta máquina, gitignorados):
  - `docs/corte/ultimo-estado-local-barriles-2026-09-09.json` (768 375 bytes, versión 2218)
  - `docs/corte/ultimo-estado-local-lotes-2026-09-09.json` (2 150 450 bytes, versión 16)
  - `docs/corte/ultimo-estado-local-prensas-2026-09-09.json` (929 883 bytes, versión 87)

## Pendiente

Los tres respaldos JSON de D1 (`respaldo-nube-barriles-2026-09-09-corte.json`,
`respaldo-nube-lotes-2026-09-09-corte.json`, `respaldo-nube-prensas-2026-09-09-corte.json`)
**no se pudieron generar**: los pasos 1–3 del brief (Tarea 3) usan
`npx wrangler d1 execute --remote` y el entorno rechazó el permiso.

**La Tarea 5 (apagar los servidores locales) NO debe correr hasta que esos tres
archivos existan.** El paso 1 de la Tarea 5 los exige como red de rollback. Hay
que ejecutar los pasos 1–3 del brief de Tarea 3 manualmente (o desde una sesión
con permisos desbloqueados para wrangler) antes de continuar.

## Lo que había que saber

- Ningún dato local era más nuevo que la nube en Barriles ni en Lotes.
  En Prensas la nube va adelante (89 vs 87 local): no se perdió información.
- `autor` mostraba que solo Prensas tenía uso real desde la web (`Marcelo`).
  Barriles decía `importacion` y Lotes `reconciliacion-excel`: los dos estaban
  al día porque los empujamos nosotros, no porque el equipo los usara. De ahí
  la prueba de humo de la Tarea 4.
