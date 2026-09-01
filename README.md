# Plataforma CIW

Las aplicaciones de Bodegas Esmeralda en un solo sitio, con login de Office 365.

| Módulo | Estado |
|---|---|
| **Control de Prensas** | ✅ Migrado y funcionando |
| **Mapa de Barriles** | ✅ Migrado y funcionando |
| **Lotes** | ✅ Migrado y funcionando (8 motores portados) |

**➡️ Para subirlo, seguí [DESPLIEGUE.md](DESPLIEGUE.md).**

---

## Qué reemplaza

| Antes | Ahora |
|---|---|
| `servidor.py` + `supervisor.pyw` en una PC | un Worker en Cloudflare |
| `datos.json` en OneDrive | base de datos D1 |
| `Abrir/Cerrar Prensas.bat` | una dirección web |
| Sin contraseña, sin HTTPS | login de Office 365 + HTTPS |
| `backups/` en el mismo disco | Time Travel + snapshots en R2 |
| `historial.jsonl` | tabla `historial` |
| Python instalado en cada PC | solo el navegador |
| «un solo servidor por vez» | deja de existir el problema |

---

## Cómo está armado

```
public/            Lo que ve el usuario (lo sirve el CDN)
  index.html         portal con las tres tarjetas
  prensas/           la app de Prensas, tal cual estaba
  barriles/          el Mapa de Barriles, tal cual estaba
  lotes/             la app de Lotes, tal cual estaba
  shared/            barra de navegación y avisos, comunes a los tres
src/               El Worker (TypeScript)
  index.ts           ruteo, entrega de páginas e inyección de identidad
  auth.ts            identidad de Access + roles por módulo
  prensas/           rutas + validaciones + resumen de cambios
  barriles/          rutas + frenos de borrado
  lotes/
    rutas.ts         los 10 endpoints
    vistas.ts        armado de tablero, ficha y análisis
    motores/         los 8 motores portados de Python
migrations/        Esquema de la base
scripts/           Importación de los tres módulos
test/              167 tests, portados de los de Python
```

### La decisión de diseño principal

**Las pantallas no se reescribieron.** Los tres frontends son los mismos
archivos de siempre, con un solo cambio en cada uno: una línea que dice dónde
está su API, porque ahora conviven en un mismo sitio.

```js
const API = '/prensas/api';    // y sus equivalentes en barriles y lotes
```

El Worker responde exactamente lo que respondían los `servidor.py`. Por eso el
equipo ve las apps idénticas y no tiene que aprender nada.

La barra superior para volver al menú y saltar entre módulos **tampoco está en
el código de las apps**: el Worker se la inyecta al entregar la página.

### Qué se conservó de la app local

Las protecciones que ya venían salvando datos, portadas con sus mismos umbrales
y mensajes:

- Freno anti-borrado masivo (>20 % de una sección y al menos 10 filas).
- Rechazo de guardados con estructura corrupta, que **no se puede forzar**.
- Control de versión: si otro guardó mientras editabas, avisa en vez de pisar.
- Aviso de registros huérfanos.
- Cambio automático de mes, calculado en hora de Mendoza.

En el Mapa de Barriles se conservan además sus propios frenos: no se pueden
vaciar 15 casilleros, 15 registros de inventario, 3 órdenes del escáner, 5
tanques ni 9 casilleros de palet sin confirmarlo.

Los 167 tests de `test/` son el port de los de Python y verifican justamente eso.

### Qué desapareció, y por qué

- **Cartel de conflicto de OneDrive** — ya no hay archivo compartido.
- **QR de red local** — la dirección es pública y fija. `/api/info` devuelve la
  lista vacía y el botón se oculta solo, sin tocar `app.js`.
- **«¿Quién está usando la app?»** — el nombre lo da Office 365. El servidor lo
  inyecta en la página al entregarla.

### Sobre los permisos

D1 no tiene permisos por fila como Postgres, así que el rol se verifica en el
Worker. **Hay dos paredes, no una:**

1. **Cloudflare Access** decide quién entra al sitio (Office 365).
2. **El Worker** decide qué puede hacer cada uno, con la tabla `perfiles`.

El navegador nunca habla con la base: no tiene credenciales para hacerlo.

---

## Trabajar en el proyecto

```bash
npm install           # una vez
npm test              # los 167 tests
npm run dev           # servidor local en :8787
npm run deploy        # publicar
npx tsc --noEmit      # verificar tipos
npx wrangler types    # regenerar tipos tras tocar wrangler.jsonc
```

Para desarrollo local, copiá `.dev.vars.ejemplo` a `.dev.vars`: identifica al
usuario mientras no hay Access. En producción se ignora.

---

## Los motores de Lotes

Lotes era el único módulo cuya lógica vivía en el servidor: ocho motores de
Python (~82 KB) que calculan FML, etapas, linaje, cruce con barriles y órdenes
de corrección. Están portados a `src/lotes/motores/`:

| Motor | Qué decide |
|---|---|
| `fml.ts` | Si un lote está en condición, si venció, cuánto SO2 le falta |
| `etapas.ts` | En qué etapa está y cuánto avanzó (9 hitos) |
| `linaje.ts` | De qué lote viene cada uno y por qué vasijas pasó |
| `cruce.ts` | Diferencias entre los envases declarados y los del mapa |
| `correccion.ts` | La dosis de SO2 por barrica |
| `mapa.ts` | Normaliza el inventario del Mapa de Barriles |
| `envases.ts` · `movimientos.ts` | Litros por envase; qué movimiento ya se hizo |

### Cómo se verificó que el port es fiel

Sin Python instalado no se puede comparar corriendo los dos lados, así que se
hicieron tres cosas:

1. **Se portaron los tests de Python**, caso por caso y con los mismos números:
   130 tests solo para estos motores.
2. **Se comparó contra el `Reporte Lotes.html`**, que había generado el Python
   con los datos reales el 21/07. Sobre los 240 lotes del reporte:
   - **litros: 240/240 exacto**
   - **estado de FML: 164/164 exacto** en los lotes comparables
   - la única diferencia de "vencido" se explica por un cambio de configuración
     posterior (14 variedades blancas pasaron a `hace_fml: no`), no por el port
3. **Se corrieron los cinco endpoints contra los datos completos** de la bodega.

### Lo que el port MEJORA

`motor_mapa.py` era el único punto del sistema que tocaba SQLite, y la mayor
parte de su código existía para sortear OneDrive: buscar el backup rotado de
mayor versión, abrirlo con `immutable=1` para no crear los `-wal`/`-shm` que
corrompen la base, rechazar los que tuvieran un WAL con contenido.

**Todo eso desapareció.** El Mapa de Barriles vive en la misma base que Lotes,
así que el cruce es una consulta. Ya no depende de que la PC del mapa esté
encendida ni de que OneDrive haya sincronizado.

---

## Equivalencia con las apps locales

Los 20 endpoints de los tres `servidor.py` están, y además dos páginas nuevas:

| Lo que hacía la app local | En la plataforma |
|---|---|
| Los 20 endpoints de los tres servidores | ✅ todos |
| `exportar_xlsx()` con openpyxl | ✅ SheetJS en el navegador, mismas columnas |
| `reporte.py` → archivo HTML por guardado | ✅ `/prensas/reporte` y `/lotes/reporte`, en vivo |
| Los 8 motores de Lotes | ✅ portados, 130 tests |
| Frenos de borrado de los tres módulos | ✅ portados con sus umbrales |
| Asistente IA (Ollama local) | ⚠️ portado a Workers AI, **sin verificar** (ver abajo) |
| `generar_respaldo()` → `.md` legible | 🔄 reemplazado por snapshots JSON en R2 |
| `restaurar.py` + "Restaurar Datos.bat" | 🔄 reemplazado por Time Travel, **sin interfaz** |
| Barriles: `/api/backup` bajaba el `.db` | 🔄 baja el estado en JSON |
| `supervisor.pyw`, `backup.py`, `migrar_*.py` | ❌ ya no hacen falta |

### Lo que queda por hacer

**El asistente IA no se pudo probar.** El binding de Workers AI no funciona en
`wrangler dev` local ("not supported"), así que el código está escrito y
compila, pero recién se sabrá si responde bien al desplegarlo. Mientras tanto
devuelve un aviso claro en vez de romperse. **Probalo apenas despliegues.**

**Restaurar no tiene interfaz.** D1 guarda todos los cambios y se restaura con
`wrangler d1 time-travel restore`, pero desde la consola. Falta una página
`/admin` que lo haga con un botón, como hacía "Restaurar Datos.bat".

**El respaldo `.md` legible ya no se genera.** Los snapshots de R2 son JSON.
Si el `.md` se usaba para revisar a ojo, hay que rehacerlo.

---

## Lo que falta

### De Prensas (Fase 3 · 2–3 días)

- Partir el documento en tablas y guardar por fila → se termina el aviso de
  conflicto y dos personas pueden editar a la vez.
- Exportar a Excel con SheetJS en el navegador. Hoy `/exportar` avisa en
  pantalla que está pendiente, en vez de fallar.

### Del Mapa de Barriles

El estado importado viene del respaldo del **28/08/2026 (versión 1939)**, que era
el más reciente disponible. Antes de salir a producción conviene reimportar con
el archivo del día del corte.
