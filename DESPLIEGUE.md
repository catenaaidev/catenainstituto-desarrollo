# Cómo subirlo — paso a paso

Todo esto ya se probó funcionando en una PC. Seguí los pasos en orden; cada uno
dice qué tenés que ver si salió bien.

**Tiempo estimado: 45 minutos**, la mayoría esperando.

---

> **Sobre `datos-origen/`**: trae los datos actuales de los tres módulos, para
> la importación inicial. Está en `.gitignore` a propósito —los datos de la
> bodega no van a GitHub— así que existe en tu carpeta pero no se sube.

## Antes de empezar

Necesitás:

- **Node.js** instalado (solo en esta PC, no en las de la bodega) → https://nodejs.org
- Una cuenta de **Cloudflare** (gratis) → https://dash.cloudflare.com/sign-up
- Una cuenta de **GitHub** (gratis)

Comprobá que Node está:

```bash
node --version
```

---

## 1 · Instalar y probar en tu PC (10 min)

```bash
cd ciw-plataforma
npm install
```

Si npm avisa que hay *install scripts* pendientes, habilitalos:

```bash
npm rebuild workerd esbuild
```

Corré los tests. **Tienen que pasar los 167.**

```bash
npm test
```

Creá la base local y cargale los datos reales:

```bash
npx wrangler d1 migrations apply catenainstitute --local
npm run importar:todo
```

Importa los tres módulos. Cada uno tiene que terminar con `✓ Importación
verificada` y los conteos coincidiendo:

| Módulo | Qué tiene que decir |
|---|---|
| prensas | 278 lotes · 1.512 análisis · 313 degustaciones · 147 agregados |
| barriles | 2.354 inventario · 15 boxes · 692 escaneos · 500 tanques |
| lotes | 291 lotes · 1.972 análisis · 341 movimientos |

Date acceso a vos mismo en la base local. Creá un archivo `sembrar.sql`:

```sql
INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre) VALUES
  ('dev@local', 'prensas',  'admin', 'Tu Nombre'),
  ('dev@local', 'barriles', 'admin', 'Tu Nombre'),
  ('dev@local', 'lotes',    'admin', 'Tu Nombre');
```

```bash
npx wrangler d1 execute catenainstitute --local --file=sembrar.sql
```

Levantalo:

```bash
npm run dev
```

Abrí **http://localhost:8787**. Tenés que ver el portal con las tres tarjetas
y poder entrar a Prensas con todos tus datos.

---

## 2 · Subirlo a GitHub (5 min)

> ⚠️ **El repositorio `lucs56/catenainstitute` está en PUBLIC.**
> Ponelo en privado ANTES de subir: en GitHub, **Settings → General → abajo de
> todo → Change repository visibility → Make private**. El código de producción
> de la bodega no tiene por qué ser público.
>
> Los datos no se suben (`datos-origen/` está en `.gitignore`), pero el esquema
> de la base, las reglas de negocio y la lógica de permisos sí quedarían a la vista.

> ⚠️ Tampoco lo pongas dentro de una carpeta de OneDrive: así se corrompió el
> repositorio viejo de `prensas-app`.

El proyecto **ya viene con su historial** (7 commits), así que no hace falta
`git init`. Solo falta apuntarlo a tu repositorio y empujar:

```bash
git remote add origin https://github.com/lucs56/catenainstitute.git
```

```bash
git branch -M main
```

```bash
git push -u origin main
```


---

## 3 · El bucket de respaldos (2 min)

La base D1 **ya está creada** y su id ya está puesto en `wrangler.jsonc`:

| Recurso | Nombre | Estado |
|---|---|---|
| Base D1 | `catenainstitute` | ✅ creada (`28dc2eb1-aa60-…`) |
| Worker | `catenainstitute` | ✅ creado |
| Bucket R2 | `catenainstitute-respaldos` | ⬜ falta crearlo |

```bash
npx wrangler login
```

```bash
npx wrangler r2 bucket create catenainstitute-respaldos
```

Y creá las tablas en la base de la nube:

```bash
npx wrangler d1 migrations apply catenainstitute --remote
```


---

## 4 · Publicar (5 min, una sola vez)

El despliegue lo hace **GitHub Actions**, con la receta que está en
`.github/workflows/desplegar.yml`. Cada `git push` a `main` instala, genera los
tipos, typechequea, corre los 167 tests y —sólo si todo pasó— publica.

> **Por qué así y no con "Workers Builds" de Cloudflare:** eso se configuraba en
> el panel, no en el código. Cuando fallaba, desde el repositorio no había forma
> de darse cuenta: el código quedaba en GitHub y el sitio seguía con la versión
> vieja, sin ningún aviso. Ahora el registro de cada despliegue se lee en la
> pestaña **Actions** del repositorio.

Para que funcione hay que darle a GitHub permiso de publicar en Cloudflare. Son
dos datos, se cargan una única vez.

**a) Creá el token en Cloudflare** → https://dash.cloudflare.com/profile/api-tokens

**Create Token** → usá la plantilla **"Edit Cloudflare Workers"** → **Continue
to summary** → **Create Token**. Copiá el token: se muestra una sola vez.

**b) Buscá el Account ID** → entrá a **Workers & Pages**. El *Account ID* está
en la barra derecha (y también en la dirección del navegador, después de
`dash.cloudflare.com/`).

**c) Cargá los dos en GitHub** → en el repositorio, **Settings → Secrets and
variables → Actions → New repository secret**. Creá exactamente estos dos:

| Nombre del secreto | Valor |
|---|---|
| `CLOUDFLARE_API_TOKEN` | el token del paso (a) |
| `CLOUDFLARE_ACCOUNT_ID` | el Account ID del paso (b) |

> Si falta alguno, el despliegue se detiene con un mensaje que dice cuál falta,
> en vez de fallar de forma confusa.

Listo. Desde ahora, **cada push publica solo**. Para publicar sin hacer un
commit: pestaña **Actions → Desplegar → Run workflow**.

### Si preferís publicar desde tu PC

Sirve para probar algo puntual. Necesita `npx wrangler login` la primera vez:

```bash
git pull
npm run deploy
```

> ⚠️ El `git pull` no es opcional. Si desplegás con el repositorio atrasado,
> publicás código viejo y parece que el despliegue no funcionó.

---

Cualquiera de los dos te deja la dirección, algo como
`https://catenainstitute.TU-CUENTA.workers.dev`.

> ⚠️ **Todavía no está protegida.** No le pases la dirección a nadie hasta
> terminar el paso 6.


---

## 5 · Cargar los datos reales (5 min)

```bash
node scripts/importar.mjs --modulo prensas  --remote --datos datos-origen/prensas-datos.json
node scripts/importar.mjs --modulo barriles --remote --datos datos-origen/estado-barriles.json
node scripts/importar.mjs --modulo lotes    --remote --datos datos-origen/lotes-datos.json
```

Los tres tienen que terminar con `✓ Importación verificada`. Si algún conteo no
coincide, **parás acá** y lo revisás: no sigas.

> ⚠️ El estado del Mapa de Barriles sale del respaldo del **28/08/2026 (v1939)**.
> Si conseguís el archivo del día del corte, reimportá ese en su lugar.

Ahora cargá las personas. Creá `usuarios.sql` con los emails reales:

```sql
INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre) VALUES
  ('marcelo@catenawines.com',  'prensas',  'admin',  'Marcelo'),
  ('marcelo@catenawines.com',  'barriles', 'admin',  'Marcelo'),
  ('marcelo@catenawines.com',  'lotes',    'admin',  'Marcelo'),
  ('lab@catenawines.com',      'prensas',  'editor', 'Laboratorio'),
  ('gerencia@catenawines.com', 'prensas',  'lector', 'Gerencia');
```

```bash
npx wrangler d1 execute catenainstitute --remote --file=usuarios.sql
```

> Los roles: **admin** hace todo · **editor** carga y edita · **lector** solo mira.
> El rol es **por módulo**: alguien puede ser editor en Prensas y lector en Lotes.

---

## 6 · Encender el login (5 min) — IMPRESCINDIBLE

En el panel de Cloudflare:

1. Entrá a **Workers & Pages → catenainstitute → Access**.
2. Tocá **"Protect this Worker behind Access"**.
3. Elegí proteger **todo el tráfico**.
4. Creá la política. Para arrancar hoy mismo, sin depender de Sistemas:
   - Método: **One-time PIN** (código de 6 dígitos al mail).
   - Regla: *Emails ending in* → `@catenawines.com`.

Probá desde una ventana de incógnito: tiene que pedirte el mail y el código
**antes** de mostrar nada.

### Después: pasarlo a Office 365

Cuando Sistemas registre la aplicación (§7), en *Zero Trust → Integrations →
Identity providers* agregás **Azure AD** con los tres datos que te den, y cambiás
el método de la política. **No hay que tocar código ni migrar usuarios.**

---

## 7 · Lo que hay que pedirle a Sistemas

Para el ingreso con el usuario de la empresa. Para ellos son unos 15 minutos,
y necesitan rol *Cloud Application Administrator*:

1. En **Microsoft Entra admin center → App registrations → New registration**,
   crear una aplicación.
2. **Redirect URI** (tipo Web):
   `https://<nombre-de-equipo>.cloudflareaccess.com/cdn-cgi/access/callback`
   — el `<nombre-de-equipo>` sale del panel de Cloudflare Zero Trust.
3. En **API permissions**, permisos **delegados** de Microsoft Graph:
   `email`, `offline_access`, `openid`, `profile`, `User.Read`,
   `Directory.Read.All`, `GroupMember.Read.All`.
4. Botón **Grant admin consent**.
5. Pasarte tres datos: **Application (client) ID**, **Directory (tenant) ID** y
   un **Client secret** (el valor se ve una sola vez; que lo copien al crearlo).

---

## 8 · Comprobación final

Antes de avisarle a nadie:

- [ ] En incógnito, la dirección pide login y no muestra nada sin autenticar.
- [ ] El portal muestra las tres tarjetas, las tres entrables.
- [ ] Prensas abre y muestra **278 lotes** y **1.512 análisis**.
- [ ] Barriles abre, dice **sincronizado** y el mapa muestra los boxes cargados.
- [ ] Lotes abre, su grilla muestra **291 lotes** y el tablero muestra los KPIs.
- [ ] En Lotes, **Cruce con barriles** cruza contra el mapa y dice "misma base".
- [ ] En Lotes, **Orden de corrección** lista lotes con su dosis de MBK.
- [ ] Desde cualquier módulo, **← Menú** vuelve al portal.
- [ ] Editás un comentario, guardás, recargás y el cambio sigue ahí.
- [ ] El botón **🕘 Historial** muestra tu guardado con tu nombre.
- [ ] Con un usuario **lector**, el guardado se rechaza con un mensaje claro.
- [ ] El **asistente IA** de Prensas responde. Es lo único que no se pudo probar
      en local (Workers AI no corre en `wrangler dev`). Si falla, avisa con un
      cartel en vez de romperse.
- [ ] La app local sigue funcionando (es la red de seguridad; no la apagues).

---

## Después de subirlo

### Cambiar algo

```bash
git add . && git commit -m "qué cambié" && git push
```

Con eso alcanza: el push dispara el despliegue. Seguilo en la pestaña
**Actions** del repositorio — tarda unos 2 minutos. Mientras el tilde esté en
amarillo todavía no está publicado; si queda en rojo, el sitio siguió intacto
con la versión anterior y el log dice qué falló.

> Si el cambio no se ve en el navegador pero Actions dice verde, es la caché:
> recargá con **Ctrl + F5**.

### Volver el tiempo atrás si algo sale mal

D1 guarda todos los cambios de los últimos días. Para volver a un momento exacto:

```bash
npx wrangler d1 time-travel restore catenainstitute --timestamp=2026-09-01T10:00:00Z
```

Antes de restaurar, mirá qué había:

```bash
npx wrangler d1 time-travel info catenainstitute
```

### Bajar un respaldo

Los snapshots diarios quedan en R2:

```bash
npx wrangler r2 object get catenainstitute-respaldos/prensas/datos-v00087-....json --file=respaldo.json
```

---

## Si algo falla

| Síntoma | Qué pasa |
|---|---|
| **Pusheé y el sitio no cambió** | Mirá la pestaña **Actions**. Sin ejecución = falta el secreto o el push no fue a `main`. En rojo = el log dice qué falló. En verde = es caché del navegador, **Ctrl + F5** |
| `database_id` inválido al desplegar | Falta pegar el id del paso 3 en `wrangler.jsonc` |
| La página pide login en un bucle | La política de Access tiene mal el dominio del email |
| «no tiene acceso al módulo Prensas» | Falta cargar ese email en `perfiles` (paso 5) |
| `SQLITE_TOOBIG` al importar | Bajá `TRAMO` en `scripts/importar-prensas.mjs` |
| Los conteos no coinciden | **No sigas.** Revisá el `datos.json` de origen |

## La reconciliación ocasional del Excel de Lotes

Desde el corte a web-only la fuente de datos es la web. `importar.mjs` sigue
existiendo para un solo caso: cuando hay que reconciliar el Excel de Lotes,
que se usa poco y todavía no está integrado a la plataforma.

Es la **única** razón para levantar el freno. Los cuatro pasos, en orden:

1. Exportar de la web con el botón de Excel de Lotes (3 hojas: LOTES, ANALISIS,
   MOVIMIENTOS).
2. Reconciliar con los scripts que están en la carpeta local de Lotes
   (`motor_reconciliacion.py`, `reconciliar_excel.py`).
3. **Respaldar la nube antes de subir nada.** Es el rollback:

       npx wrangler d1 execute catenainstitute --remote --json --command "SELECT json FROM documento WHERE modulo='lotes'" > respaldo-nube-lotes-<fecha>.json

   El archivo es un array; la versión sale de
   `JSON.parse(d[0].results[0].json).version`.
4. Subir, diciendo en voz alta que se pisa la nube:

       node scripts/importar.mjs --modulo lotes --remote --piso-la-web --datos <archivo>

   Tiene que terminar con `✓ Importación verificada`. Si no lo dice, no seguir:
   el respaldo del paso 3 es el camino de vuelta.

Cuando el Excel se integre a la web, esta sección, los tres scripts de Python y
el freno de `scripts/freno.mjs` se borran.
