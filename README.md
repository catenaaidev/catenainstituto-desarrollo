# Plataforma CIW

Las aplicaciones de Bodegas Esmeralda en un solo sitio, con login de Office 365.

| Módulo | Estado |
|---|---|
| **Control de Prensas** | ✅ Migrado y funcionando |
| **Mapa de Barriles** | ✅ Migrado y funcionando |
| **Lotes** | 🟡 Datos sí; faltan los cálculos de los 8 motores |

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
  lotes/             rutas de datos; los cálculos esperan a la Fase 4
migrations/        Esquema de la base
scripts/           Importación de los tres módulos
test/              37 tests, portados de los de Python
```
public/            Lo que ve el usuario (lo sirve el CDN)
  index.html         portal con las tres tarjetas
  prensas/           la app de Prensas, tal cual estaba
  shared/            código común a los módulos
src/               El Worker (TypeScript)
  index.ts           ruteo y entrega de páginas
  auth.ts            identidad de Access + roles
  prensas/
    rutas.ts         los endpoints que ya usaba app.js
    validacion.ts    port de validar_datos() de servidor.py
    cambios.ts       port de resumen_cambios() de servidor.py
  barriles/, lotes/  pendientes, con lo que falta documentado adentro
migrations/        Esquema de la base
scripts/           Importación de datos.json
test/              25 tests, portados de los de Python
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

Los 37 tests de `test/` son el port de los de Python y verifican justamente eso.

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
npm test              # los 37 tests
npm run dev           # servidor local en :8787
npm run deploy        # publicar
npx tsc --noEmit      # verificar tipos
npx wrangler types    # regenerar tipos tras tocar wrangler.jsonc
```

Para desarrollo local, copiá `.dev.vars.ejemplo` a `.dev.vars`: identifica al
usuario mientras no hay Access. En producción se ignora.

---

## Lo que falta

### Los cálculos de Lotes (Fase 4 · 5–8 días)

Lotes es el único módulo cuya lógica vive en el servidor y no en la pantalla.
Sus datos ya están migrados y las vistas de **lotes, análisis y movimientos
funcionan**, pero cinco vistas dependen de motores que siguen en Python:

| Vista | Motor que le falta |
|---|---|
| Tablero | `motor_fml`, `motor_etapas` |
| Análisis | `motor_fml` |
| Ficha del lote | `motor_etapas`, `motor_linaje` |
| Cruce con barriles | `motor_cruce`, `motor_mapa` |
| Orden de corrección | `motor_correccion` |

Cada una avisa con un cartel explicando qué falta, en vez de quedarse colgada.
Son reglas que afectan producción: hay que portarlas y **verificar cada motor
contra los datos reales** antes de confiar en ellas.

### De Prensas (Fase 3 · 2–3 días)

- Partir el documento en tablas y guardar por fila → se termina el aviso de
  conflicto y dos personas pueden editar a la vez.
- Exportar a Excel con SheetJS en el navegador (hoy `/exportar` avisa que está
  en preparación).

### Del Mapa de Barriles

El estado importado viene del respaldo del **28/08/2026 (versión 1939)**, que era
el más reciente disponible. Antes de salir a producción conviene reimportar con
el archivo del día del corte.