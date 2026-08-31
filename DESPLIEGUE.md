# Cómo subirlo — paso a paso

Todo esto ya se probó funcionando en una PC. Seguí los pasos en orden; cada uno
dice qué tenés que ver si salió bien.

**Tiempo estimado: 45 minutos**, la mayoría esperando.

---

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

Corré los tests. **Tienen que pasar los 25.**

```bash
npm test
```

Creá la base local y cargale los datos reales:

```bash
npx wrangler d1 migrations apply ciw-plataforma --local
node scripts/importar-prensas.mjs --local --datos ../prensas-app/datos.json
```

Al final tiene que decir `✓ Importación verificada` con los conteos coincidiendo.

Date acceso a vos mismo en la base local. Creá un archivo `sembrar.sql`:

```sql
INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre) VALUES
  ('dev@local', 'prensas',  'admin', 'Tu Nombre'),
  ('dev@local', 'barriles', 'admin', 'Tu Nombre'),
  ('dev@local', 'lotes',    'admin', 'Tu Nombre');
```

```bash
npx wrangler d1 execute ciw-plataforma --local --file=sembrar.sql
```

Levantalo:

```bash
npm run dev
```

Abrí **http://localhost:8787**. Tenés que ver el portal con las tres tarjetas
y poder entrar a Prensas con todos tus datos.

---

## 2 · Subirlo a GitHub (5 min)

> ⚠️ El repositorio viejo de `prensas-app` está dañado por OneDrive. Este es un
> repositorio nuevo y limpio. **No lo pongas dentro de una carpeta de OneDrive.**

```bash
git init
git add .
git commit -m "Plataforma CIW: portal, login y modulo Prensas"
```

Creá un repositorio **privado** en GitHub llamado `ciw-plataforma`, sin README.
Después:

```bash
git remote add origin https://github.com/TU-USUARIO/ciw-plataforma.git
git branch -M main
git push -u origin main
```

---

## 3 · Crear la base y el respaldo en Cloudflare (5 min)

```bash
npx wrangler login
npx wrangler d1 create ciw-plataforma
```

El comando devuelve un `database_id`. **Copialo y pegalo en `wrangler.jsonc`**,
reemplazando `COMPLETAR_TRAS_CREAR_LA_BASE`.

```bash
npx wrangler r2 bucket create ciw-respaldos
npx wrangler d1 migrations apply ciw-plataforma --remote
```

---

## 4 · Publicar (2 min)

```bash
npm run deploy
```

Te devuelve la dirección, algo como `https://ciw-plataforma.TU-CUENTA.workers.dev`.

> ⚠️ **Todavía no está protegida.** No le pases la dirección a nadie hasta
> terminar el paso 6.

---

## 5 · Cargar los datos reales (5 min)

```bash
node scripts/importar-prensas.mjs --remote --datos ../prensas-app/datos.json
```

Tiene que terminar con `✓ Importación verificada`. Si algún conteo no coincide,
**parás acá** y lo revisás: no sigas.

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
npx wrangler d1 execute ciw-plataforma --remote --file=usuarios.sql
```

> Los roles: **admin** hace todo · **editor** carga y edita · **lector** solo mira.
> El rol es **por módulo**: alguien puede ser editor en Prensas y lector en Lotes.

---

## 6 · Encender el login (5 min) — IMPRESCINDIBLE

En el panel de Cloudflare:

1. Entrá a **Workers & Pages → ciw-plataforma → Access**.
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
- [ ] El portal muestra las tres tarjetas; Barriles y Lotes aparecen en gris.
- [ ] Prensas abre y muestra **278 lotes** y **1.512 análisis**.
- [ ] Editás un comentario, guardás, recargás y el cambio sigue ahí.
- [ ] El botón **🕘 Historial** muestra tu guardado con tu nombre.
- [ ] Con un usuario **lector**, el guardado se rechaza con un mensaje claro.
- [ ] La app local sigue funcionando (es la red de seguridad; no la apagues).

---

## Después de subirlo

### Cambiar algo

```bash
git add . && git commit -m "qué cambié" && git push
npm run deploy
```

### Volver el tiempo atrás si algo sale mal

D1 guarda todos los cambios de los últimos días. Para volver a un momento exacto:

```bash
npx wrangler d1 time-travel restore ciw-plataforma --timestamp=2026-09-01T10:00:00Z
```

Antes de restaurar, mirá qué había:

```bash
npx wrangler d1 time-travel info ciw-plataforma
```

### Bajar un respaldo

Los snapshots diarios quedan en R2:

```bash
npx wrangler r2 object get ciw-respaldos/prensas/datos-v00087-....json --file=respaldo.json
```

---

## Si algo falla

| Síntoma | Qué pasa |
|---|---|
| `database_id` inválido al desplegar | Falta pegar el id del paso 3 en `wrangler.jsonc` |
| La página pide login en un bucle | La política de Access tiene mal el dominio del email |
| «no tiene acceso al módulo Prensas» | Falta cargar ese email en `perfiles` (paso 5) |
| `SQLITE_TOOBIG` al importar | Bajá `TRAMO` en `scripts/importar-prensas.mjs` |
| Los conteos no coinciden | **No sigas.** Revisá el `datos.json` de origen |
