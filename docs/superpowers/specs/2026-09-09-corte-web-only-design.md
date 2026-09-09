# Corte a web-only: apagar las apps locales y dejar una sola fuente

**Fecha:** 2026-09-09
**Estado:** diseño aprobado, pendiente de plan de implementación
**Relacionado:** `2026-09-04-conexion-entre-modulos-design.md` (este corte es su prerequisito)

## El problema

La plataforma web funciona y los tres módulos están migrados, pero las tres apps
locales siguen vivas y arrancables. El resultado es que hay **dos fuentes de
verdad por módulo**, y una vía destructiva que va de una a la otra.

La medición de la base D1 el 2026-09-09 lo muestra crudo:

- **4030 lecturas** en 24 h — la web se consulta.
- **11 escrituras** en 24 h — casi nadie carga en la web todavía.

Se lee de un lado y se escribe del otro. Mientras eso siga así, cada mejora se
paga dos veces (dos repos, dos commits, dos revisiones) y cada dato depende de
que alguien se acuerde de correr una importación a mano.

### La vía destructiva

`scripts/importar.mjs` hace `DELETE FROM documento` + INSERT por tramos: no
fusiona, **reemplaza el documento entero del módulo**. Se escribió para la
migración inicial, cuando lo local era la fuente y la web el destino vacío.

Cuando la web pasa a ser la fuente, ese script se convierte en un martillo
apuntado al pie: correrlo "por costumbre" borra todo lo que se cargó en la web
desde la última importación.

## Estado real por módulo (medido el 2026-09-09)

| Módulo | Evidencia | Falta |
|---|---|---|
| **Barriles** | Diff `local/index.html` vs `public/barriles/index.html` = **exactamente 12 inserciones / 9 borrados**, solo el prefijo de API, cero lógica. Los 4 endpoints (`/version`, `/estado`, `/info`, `/backup`) están. Datos en v2218 (09/09). | Nada |
| **Prensas** | Los 6 endpoints están. `/exportar` devuelve **410 a propósito**: el Excel se arma en el navegador con SheetJS. **El equipo ya está usando la web** (dato del usuario, 09/09). | Nada. Ver la advertencia de abajo. |
| **Lotes** | Los 8 motores portados, 12 pestañas, export a Excel presente en `public/shared/exportar.js` con **3 hojas** (LOTES, ANALISIS, MOVIMIENTOS), una más que el `openpyxl` local. | `dash-graficos.js` y `dash-metricas.js` crecieron **+537 y +369 líneas el 08/09** en local; la web tiene la versión del 02/09. |

### Advertencia: Prensas no se importa

Como el equipo ya carga Prensas en la web, **lo local es la copia vieja**.
Correr el paso de importación para Prensas destruiría el trabajo del equipo.

Esto generaliza a una regla del procedimiento: **antes de cualquier importación
hay que comparar cuál de los dos lados es más nuevo**, y si la web va adelante,
no se importa.

## El principio de diseño

**La web escribe. Lo local no.**

El corte no es mover datos: es volver asimétrica una relación que hoy es
ambigua. Dos cambios lo logran:

1. Lo local deja de ser arrancable por accidente.
2. La vía del martillo (`importar.mjs`) queda cerrada salvo para un
   procedimiento explícito y documentado.

## Procedimiento de corte (uno por módulo)

Los pasos son los mismos para los tres, pero el paso 3 es **condicional**.

1. **Respaldar la nube.**
   `npx wrangler d1 execute catenainstitute --remote --json --command "SELECT json FROM documento WHERE modulo='<mod>'" > respaldo-nube-<mod>-<fecha>.json`
   Sirve de rollback. El archivo es un array; la versión sale de
   `JSON.parse(d[0].results[0].json).version`.

2. **Decidir la dirección (el freno nuevo).**
   `npx wrangler d1 execute catenainstitute --remote --command "SELECT modulo, version, autor, guardado FROM documento ORDER BY modulo"`
   Comparar `guardado` con la fecha de modificación del `datos.json` local.
   - Local más nuevo → seguir al paso 3.
   - **Web más nueva o igual → SALTAR el paso 3.** Es el caso de Prensas.
   Si no se puede correr la consulta, **el corte se detiene**. No se importa a
   ciegas.

3. **Solo si local va adelante:** exportar el estado vivo e importar.
   `Invoke-WebRequest http://localhost:<puerto>/api/estado -OutFile datos-origen/estado-<mod>.json`
   `node scripts/importar.mjs --modulo <mod> --remote --datos datos-origen/estado-<mod>.json`
   Tiene que decir `✓ Importación verificada`. Si no lo dice, se detiene.

4. **Verificar en la web.** Ctrl+F5 y comprobar a ojo que los datos estén y que
   la `version` sea la esperada.

5. **Congelar el arranque local.** Renombrar los `.bat` de arranque a
   `.bat.congelado`. No se borra nada: el código y el último `datos.json` quedan
   como respaldo. Reversible en diez segundos.

   Los archivos exactos, verificados el 2026-09-09:

   | Módulo | Lanzadores a renombrar | Dónde |
   |---|---|---|
   | Barriles | `Abrir Mapa de Barriles.bat`, `Iniciar servidor.bat` | `Escritorio\claude\mapa de barriles\mapa-barriles` |
   | Lotes | `Abrir Lotes.bat`, `Cerrar Lotes.bat` | `Escritorio\claude\Lotes` |
   | Prensas | `Abrir Prensas.bat`, `Cerrar Prensas.bat`, `supervisor.pyw` | `OneDrive\Archivos de Roy Urvieta - Año 2026\Registro de Lotes CIW 2026\prensas-app` |

   `Restaurar Datos.bat` (en Lotes y en Prensas) **no se renombra**: es la
   herramienta de emergencia y no levanta servidor.

   Barriles trae además `Arranque automatico (instalar).bat` y `Backup semanal
   (instalar).bat`. **No hace falta desinstalar nada**: se verificó el 2026-09-09
   que no hay tareas programadas, ni entradas en la carpeta de Inicio, ni claves
   en `HKCU:\...\Run` que levanten estos servidores. Pero esos dos instaladores
   deben quedar congelados también, porque correrlos después del corte reviviría
   el problema.

## Las tres olas

**Ola 1 · Barriles.** Está al día y no depende de nadie. Procedimiento completo.

**Ola 2 · Prensas.** El equipo ya usa la web. **Se salta el paso 3.** Queda:
respaldar, verificar en la web, congelar el `.bat` local. Antes de congelar,
confirmar que Roy y el equipo tienen fila en `perfiles` para el módulo
`prensas` (plantilla en `usuarios.ejemplo.sql`), porque sin eso entran al sitio
y el portal les dice que no tienen permisos.

**Ola 3 · Lotes.** Requiere el único trabajo de programación del plan: portar
`dash-graficos.js` y `dash-metricas.js` del 08/09. Después, procedimiento
completo (para Lotes local sí va adelante).

## Limpieza previa (antes de la Ola 1)

Al 2026-09-09 hay **4 procesos colgados desde el 08/09**:

- 2 servidores Python (PID 1244 en los puertos 8765 y 8766; PID 15448 en 8772).
- 2 `wrangler dev` (workerd en 8787 y 8788).

Hay que matarlos. Múltiples servidores simultáneos sobre los mismos datos es
exactamente la condición que causó la pérdida de datos del 3 de julio.

**Ojo con el orden:** el servidor de Lotes está vivo, no es un zombi. Su lock
`servidor-activo-AGDLABORATORIOCIW25.json` tenía latido a las 07:36 del 09/09
(PID 15448, puerto 8772). Matarlo antes de exportar su estado (paso 3 de la Ola
3) perdería lo que tenga en memoria sin guardar. **Primero exportar, después
matar.**

### El corte se hace en una sola máquina

Los tres locks `servidor-activo-*.json` encontrados apuntan al mismo host:
**`AGDLABORATORIOCIW25`**, que es esta PC (`$env:COMPUTERNAME` devuelve
`AGDLABORATORIOC`, truncado a los 15 caracteres de NetBIOS). Los tres servidores
locales corrían desde acá, así que no hay que repetir el congelamiento en otras
PCs de la bodega.

También conviene borrar el archivo basura `how 6549764 --stat` en la raíz del
repo (un `git show` mal tipeado) y commitear el spec del 04/09, que está sin
trackear y se puede perder.

## Cerrar la vía del martillo

Después de las tres olas, `scripts/importar.mjs` con `--remote` tiene que exigir
una confirmación explícita (una bandera del tipo `--piso-la-web` o una
confirmación interactiva). Hoy cualquier invocación reemplaza el documento sin
preguntar, y los scripts de `package.json` (`importar:prensas`, etc.) lo dejan a
un `npm run` de distancia.

El objetivo no es impedirlo —hay un caso legítimo, abajo— sino que no pueda
pasar por inercia.

## La reconciliación casual con el Excel

`motor_reconciliacion.py` (27 KB) + `reconciliar_excel.py` + `migrar_movimientos.py`
son trabajo del 08/09 que no existe en la web. Decisión del usuario: **puede
volver a haber una reconciliación, pero casual.**

**No se porta.** Portar 27 KB de motor para un uso ocasional es YAGNI. En su
lugar queda un procedimiento documentado en `DESPLIEGUE.md`:

1. Exportar de la web con el botón de Excel (3 hojas).
2. Reconciliar con los scripts que ya están en `Lotes/`.
3. Respaldar la nube.
4. Volver a subir con `importar.mjs --modulo lotes --remote --piso-la-web`.

Es la **única excepción autorizada** a "no tocar lo local", y la única razón
legítima para levantar el freno del punto anterior.

## Cómo se trabaja después

Acá está el ahorro de tokens que motivó el pedido. No viene de la web en sí:
viene de dejar de pagar todo dos veces.

- **Abrir las sesiones desde `C:\Users\Bmax\repos\catenainstitute`**, no desde
  `Escritorio\claude`. Hoy cada sesión carga el contexto de un repo con cinco
  proyectos y memoria de flujos que dejan de existir.
- **Escribir un `CLAUDE.md` en el repo web** con la arquitectura, el flujo de
  despliegue y las trampas conocidas (`wrangler dev` se cae por el binding
  `env.AI`; usar `dev:sin-ia`), para no re-derivarlo cada sesión.
- **Reescribir la memoria del proyecto.** Hoy varios archivos describen
  procedimientos locales —el ciclo respaldo/export/import, la sincronización a
  mano de los dos `index.html`— que después del corte son instrucciones para
  hacer lo incorrecto.
- **Un commit por arreglo en vez de dos.** Muere la invariante "12
  inserciones / 9 borrados", que hoy se rompe callada y ya revivió un bug (la
  pestaña 📱 Celular).

## Fuera de alcance

Nada de esto bloquea el corte y no se hace ahora:

- **Fase 3 de Prensas** (partir el documento en tablas por fila). Mientras el
  dato sea un blob con contador de versión, dos personas no pueden editar a la
  vez. Es una limitación real, pero preexistente y no agravada por el corte.
- **PWA / offline** para la zona de la bodega sin cobertura Wi-Fi. Parkeado por
  decisión del usuario. La pantalla de barriles **ya trae** la cola de
  pendientes sobre `localStorage`, pero **no** tiene service worker ni manifest
  (verificado: 0 coincidencias), así que una recarga sin señal deja la pantalla
  en blanco.
- **Página `/admin` de restauración.** Hoy Time Travel se usa por consola.
- **Portar el motor de reconciliación.**
- **La conexión de datos entre módulos**, ya diseñada en el spec del 04/09.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Importar sobre datos más nuevos de la web | El paso 2 es un freno obligatorio; si la consulta no se puede correr, el corte se detiene |
| Roy o el equipo abren la app local por costumbre | El `.bat.congelado` lo vuelve imposible en vez de dejarlo a la memoria de cada uno |
| Alguien corre `npm run importar:*` después del corte | La bandera de confirmación explícita en `importar.mjs` |
| La sesión de Cloudflare Access vence mientras el celular está offline | La API devuelve un redirect al login con HTML, no un 401. La cola de pendientes no distingue eso de un error de red y puede acumular cambios contra una sesión muerta. **Hay que arreglarlo aparte de este corte.** |
| El repo es público | Ya está contemplado: `usuarios.sql`, `datos.json`, `respaldo-nube-*.json` y `datos-origen/` están en `.gitignore`. Conviene reconfirmarlo antes de commitear datos nuevos. |

## Criterios de éxito

1. Los lanzadores de los tres módulos están renombrados a `.bat.congelado` y
   ningún servidor Python local escucha en 8765, 8766 ni 8772.
2. Los tres módulos se cargan y se guardan desde
   `https://catenainstitute.besa-junin.workers.dev`.
3. `write_queries_24h` en D1 sube de 11 a un número que refleje el uso real.
4. `importar.mjs --remote` no puede reemplazar un documento sin confirmación
   explícita.
5. Existe `CLAUDE.md` en el repo web y la memoria del proyecto ya no describe
   flujos locales.
6. El dashboard de Lotes en la web muestra lo mismo que el local del 08/09.
