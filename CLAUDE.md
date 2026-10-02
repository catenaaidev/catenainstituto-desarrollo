# Plataforma CIW (Catena Institute)

Un solo Worker de Cloudflare sirve el portal y las APIs de los tres módulos:
Prensas, Mapa de Barriles y Lotes. Reemplaza a los tres `servidor.py` que
corrían en PCs de la bodega.

- Producción: https://catenainstitute.besa-junin.workers.dev
- Login: propio, usuario y contraseña (`src/auth.ts`, cookie `ciw_session`).
  Usuarios en `/admin.html`; las cuentas nuevas nacen con `1234` y deben
  cambiarla al entrar. La cuenta `admin` / `1234` se crea sola en el primer
  login si no hay ningún administrador.
- Repo: github.com/lucs56/catenainstitute — **es público**, no commitear datos
  ni emails del personal

## Esta es la única fuente de datos

Las tres apps locales se congelaron en el corte del 2026-09-09
(`docs/superpowers/specs/2026-09-09-corte-web-only-design.md`, registro del día
en `docs/corte/2026-09-09-estado-al-corte.md`). Sus lanzadores están renombrados
a `.bat.congelado`.

**Un arreglo "para la web" se hace acá y solo acá.** Antes había que
commitearlo en dos repos porque `public/barriles/index.html` era una copia a
mano del `index.html` de la bodega; eso terminó.

**No corras `scripts/importar.mjs --remote`.** Reemplaza el documento entero
del módulo (DELETE + INSERT, no fusiona) y borraría lo que cargó el equipo.
Exige la bandera `--piso-la-web` justamente para que no pase por inercia. El
único caso legítimo —la reconciliación ocasional del Excel de Lotes— está en
`DESPLIEGUE.md`.

## Cómo está armado

- `src/index.ts` — ruteo, entrega de páginas e inyección de identidad
- `src/auth.ts` — login, sesiones y roles por módulo (tabla `perfiles`)
- `src/admin.ts` — API de administración de usuarios (`/api/admin/usuarios`)
- `src/{prensas,barriles,lotes}/` — rutas y reglas de cada módulo
- `src/lotes/motores/` — los 8 motores portados de Python
- `public/` — las pantallas, servidas por el CDN; `public/shared/` es común
- `migrations/` — el esquema; `test/` — los tests

El dato de cada módulo es **un JSON entero en una fila** de la tabla
`documento`, con un contador `version`. Las tablas por fila son "Fase 3" y no
existen todavía. Para que varias personas editen a la vez sin perder nada:

- El servidor rechaza con 409 (y manda el documento `actual`) un guardado hecho
  sobre una versión vieja. **La versión se chequea antes de validar**: si no, el
  freno toma un guardado viejo por un borrado masivo.
- Prensas y Lotes combinan solos ese 409 con `public/shared/fusion.js`
  (fusión de tres vías contra la copia `BASE`/`_base` de cuando cargaron) y
  reintentan. `lotes` se combina por número de lote; las demás secciones fila
  por fila por contenido. No agregar "lote" como clave automática: fundía
  análisis distintos del mismo lote.
- Lo no guardado vive también en IndexedDB (borrador por módulo y usuario) y se
  ofrece recuperar al reabrir. Barriles tiene su propia fusión y cola.
- La sesión dura 30 días **desde el último uso** (se estira con cada pedido) y
  las APIs de módulo sin sesión responden 401, que la pantalla avisa.

## Comandos

    npm test              # los tests (corren en el runtime real de Workers)
    npx tsc --noEmit      # typecheck
    npx wrangler types    # regenerar tipos tras tocar wrangler.jsonc
    npm run dev:sin-ia    # servidor local

## Trampas conocidas

- **`npm run dev` se cae.** El binding `env.AI` es remoto y el Worker publicado
  está detrás de Access, así que `wrangler dev` no lo resuelve. Usá
  `dev:sin-ia`, que es la misma config sin el bloque `"ai"`. **Si agregás un
  binding a `wrangler.jsonc`, agregalo también a `wrangler.dev.jsonc`.**
- **Para que las pantallas se entreguen en local** hace falta, una sola vez,
  aplicar las migraciones con `--local` y sembrar un perfil para el `DEV_EMAIL`
  de `.dev.vars`. Sin esa fila el Worker no encuentra rol y manda al portal.
- **`tsconfig.json` incluye solo `src/**/*.ts` y `test/**/*.ts`.**
  `test/freno.test.mjs` está en `.mjs` a propósito para quedar fuera del
  typecheck: no hay declaraciones para un `.mjs` y `tsc` fallaría, frenando el
  despliegue. No lo pases a `.ts`.
- **El despliegue lo hace Workers Builds de Cloudflare en cada push a `main`**
  (check "Workers Builds: catenainstitute"). `.github/workflows/desplegar.yml`
  solo verifica: `wrangler types` → `tsc --noEmit` → tests; ya no publica (su
  token quedó inválido y fallaba en cada push). Ojo: Workers Builds publica
  aunque los tests fallen. **No corre las migraciones**: eso es a mano con
  `npm run migrar:nube` (las tablas de login se crean solas al primer login).
- **PBKDF2 en Workers admite como máximo 100.000 iteraciones.** Con más,
  `deriveBits` tira excepción y el login da error 1101.
- **Los tests se identifican con la cabecera `Cf-Access-Authenticated-User-Email`**
  (solo con `TEST_MODE=1`, que pone `vitest.config.ts`). En producción la
  identidad sale únicamente de la cookie de sesión.
- **La pantalla de Barriles no tiene service worker ni manifest**, así que una
  recarga sin señal deja la pantalla en blanco. Relevante para la zona de la
  bodega sin cobertura Wi-Fi.
- **El usuario trabaja en `cmd.exe`, no en PowerShell.** Los comandos que le
  pases tienen que ser de cmd: sin `foreach`, sin variables `$var`, una línea
  por vez.
