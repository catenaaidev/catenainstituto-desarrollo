# Plataforma CIW

Las aplicaciones de Bodegas Esmeralda en un solo sitio, con login de Office 365.

| Módulo | Estado |
|---|---|
| **Control de Prensas** | ✅ Migrado y funcionando |
| **Mapa de Barriles** | ⏳ Fase 2 — falta el `.db` actual |
| **Lotes** | ⏳ Fase 4 — hay que portar 8 motores de Python |

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

**La pantalla de Prensas no se reescribió.** `app.js` es el mismo archivo de
siempre, con un solo cambio: una línea al principio que dice dónde está la API,
porque ahora convive con otros dos módulos.

```js
const API = '/prensas/api';
```

El Worker responde exactamente lo que respondía `servidor.py`. Por eso el equipo
ve la app idéntica y no tiene que aprender nada.

### Qué se conservó de la app local

Las protecciones que ya venían salvando datos, portadas con sus mismos umbrales
y mensajes:

- Freno anti-borrado masivo (>20 % de una sección y al menos 10 filas).
- Rechazo de guardados con estructura corrupta, que **no se puede forzar**.
- Control de versión: si otro guardó mientras editabas, avisa en vez de pisar.
- Aviso de registros huérfanos.
- Cambio automático de mes, calculado en hora de Mendoza.

Los 25 tests de `test/` son el port de los de Python y verifican justamente eso.

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
npm test              # los 25 tests
npm run dev           # servidor local en :8787
npm run deploy        # publicar
npx tsc --noEmit      # verificar tipos
npx wrangler types    # regenerar tipos tras tocar wrangler.jsonc
```

Para desarrollo local, copiá `.dev.vars.ejemplo` a `.dev.vars`: identifica al
usuario mientras no hay Access. En producción se ignora.

---

## Lo que falta

### Mapa de Barriles (Fase 2 · 2–3 días)

Necesita el archivo `.db` actual — en el zip vinieron solo los respaldos. Como
**ya usa SQLite**, la base se importa casi directo a D1.

Se gana algo concreto: escanear códigos con la cámara exige HTTPS, y hoy se
resuelve con certificados caseros que obligan a aceptar una advertencia en cada
teléfono. Con HTTPS real eso desaparece, y se pueden borrar `cert.pem`, `key.pem`
y los `.bat` de firewall.

### Lotes (Fase 4 · 5–8 días)

El único que no se puede mudar: 87 KB de reglas viven en ocho `motor_*.py`
(FML, linaje, corrección, etapas, envases, movimientos) y hay que reescribirlos.
Los 25 módulos de `js/` sí se reaprovechan. Conviene estimarlo aparte.

### De Prensas (Fase 3 · 2–3 días)

- Partir el documento en tablas y guardar por fila → se termina el aviso de
  conflicto y dos personas pueden editar a la vez.
- Exportar a Excel con SheetJS en el navegador (hoy `/exportar` avisa que está
  en preparación).
