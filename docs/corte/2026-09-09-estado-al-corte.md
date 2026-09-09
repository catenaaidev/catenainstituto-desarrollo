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

## Apagado (Tarea 5) — ola parcial

- **Fecha y hora:** 2026-09-09, tarde
- **Ola:** Prensas y Lotes únicamente. Barriles quedó sin congelar a propósito
  (ver más abajo).

### Procesos terminados

| Puerto | PID (medido ahora) | Proceso | Acción |
|---|---|---|---|
| 8772 | 15448 | python (servidor Lotes) | `Stop-Process -Id 15448 -Force` |
| 8787 | 9160 (node/wrangler dev) + workers | workerd relanzado por wrangler | `Stop-Process -Id 9160 -Force` |
| 8788 | 4596 (node/wrangler dev) + workers | workerd relanzado por wrangler | `Stop-Process -Id 4596 -Force` |

Los workerd en 8787/8788 se relanzaban solos: fue necesario matar el proceso
padre (`node wrangler-dist/cli.js dev`) para que no volvieran.

**Puertos vivos después del apagado:** 8765 y 8766 (servidor de Barriles,
PID 1244). Verificado con `Get-NetTCPConnection` tras cada kill.

### Lanzadores congelados (renombrados con sufijo `.congelado`)

- `Abrir Lotes.bat` → `Abrir Lotes.bat.congelado`
- `Cerrar Lotes.bat` → `Cerrar Lotes.bat.congelado`
- `Abrir Prensas.bat` → `Abrir Prensas.bat.congelado`
- `Cerrar Prensas.bat` → `Cerrar Prensas.bat.congelado`
- `supervisor.pyw` → `supervisor.pyw.congelado`

`Restaurar Datos.bat` en ambas carpetas: no tocado (herramienta de emergencia).

### Barriles: sin congelar — a propósito

La Tarea 4 (prueba de humo de Barriles desde el celular) todavía no se hizo.
Congelar Barriles antes de esa prueba le sacaría la red de seguridad local al
único módulo que nunca se usó desde la web en producción. La segunda ola
(congelar los cuatro lanzadores de Barriles y su `.lnk` de Inicio) espera el
resultado de la Tarea 4.

**Nota para la segunda ola:** hay un acceso directo en la carpeta de Inicio de
Windows que apunta a `Abrir Mapa de Barriles.bat`:
`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Mapa de Barriles.lnk`
Este `.lnk` tiene que eliminarse o moverse cuando se ejecute la segunda ola,
de lo contrario el servidor de Barriles se relanzará en cada inicio de sesión
aunque sus `.bat` estén congelados.

### Arranque automático — resultado de la verificación

- **Tareas programadas** (`Get-ScheduledTask` con filtro barril/mapa/prensa/lote/
  servidor/supervisor): **ninguna encontrada**.
- **Carpeta de Inicio** (`%APPDATA%\...\Startup`): existe `Mapa de Barriles.lnk`
  que apunta a `Abrir Mapa de Barriles.bat`. No se toca en esta ola (es de
  Barriles, segunda ola). Los módulos congelados en esta ola (Lotes, Prensas)
  no tienen acceso directo de Inicio.
- **Claves HKCU\...\Run**: solo entradas del sistema (Adobe Acrobat, OneDrive,
  Edge). Ninguna de nuestras apps.

### Paso 8 — verificación de la nube post-apagado

No ejecutado. El clasificador de permisos de Claude Code rechaza
`wrangler d1 execute --remote` y se instruyó explícitamente no intentarlo por
vías alternativas. El usuario debe ejecutar esta verificación a mano desde
`cmd.exe` si lo necesita:

```
npx wrangler d1 execute catenainstitute --remote --command "SELECT modulo, version, autor, guardado FROM documento ORDER BY modulo"
```

### Cómo volver atrás

Renombrar los `.bat.congelado` y `.pyw.congelado` quitándoles el sufijo
`.congelado`. Los datos de la nube están en
`respaldo-nube-*-2026-09-09-corte.json` (en la raíz del repo, gitignorados) y
el último estado local en `docs/corte/ultimo-estado-local-*.json`.
