# Corte a web-only: apagar las apps locales y dejar una sola fuente

**Fecha:** 2026-09-09
**Estado:** diseño aprobado, pendiente de plan de implementación
**Relacionado:** `2026-09-04-conexion-entre-modulos-design.md` (este corte es su prerequisito)

## El problema

Los tres módulos ya están migrados y **los tres ya se usan en la web**. Pero las
tres apps locales siguen arrancables, con sus servidores Python corriendo y sus
`datos.json` en el disco. Eso deja dos cosas peligrosas abiertas:

1. **Dos fuentes de verdad por módulo.** Alguien abre la app local por costumbre
   y carga datos que la web nunca va a ver.
2. **Una vía destructiva de local hacia la web.** `scripts/importar.mjs` hace
   `DELETE FROM documento` + INSERT por tramos: no fusiona, **reemplaza el
   documento entero del módulo**.

El punto 2 es el más grave y cambió de signo. El script se escribió para la
migración inicial, cuando lo local era la fuente y la web el destino vacío.
Ahora que la web es la fuente, **correrlo contra cualquier módulo destruiría el
trabajo del equipo**. Y está a un `npm run importar:prensas` de distancia.

## Estado real por módulo (verificado el 2026-09-09)

Todo lo de esta tabla está medido, no inferido.

| Módulo | Verificación | Falta |
|---|---|---|
| **Barriles** | Diff `local/index.html` vs `public/barriles/index.html` = **exactamente 12 inserciones / 9 borrados**, solo el prefijo de API. Los 4 endpoints (`/version`, `/estado`, `/info`, `/backup`) presentes. Datos en v2218 (09/09). | Nada |
| **Prensas** | Los 6 endpoints presentes. `/exportar` devuelve **410 a propósito**: el Excel se arma en el navegador con SheetJS. | Nada |
| **Lotes** | De los **29 archivos JS**, 8 difieren y son **14 líneas en total**: 13 del prefijo de API y 1 de marca (`BODEGAS ESMERALDA S.A.` → `CATENA INSTITUTE`, commit `bcc41a6`). `dash-graficos.js` y `dash-metricas.js` son **idénticos**. Los 8 motores portados. Export a Excel en `public/shared/exportar.js` con **3 hojas** (LOTES, ANALISIS, MOVIMIENTOS), una más que el `openpyxl` local. | Nada en la app. Solo el Excel ocasional, abajo. |

**No hay nada que portar y no hay ningún dato que migrar.** El corte es una
operación de apagado y limpieza, no de desarrollo.

### Nota metodológica

Una revisión anterior de este spec afirmaba que el dashboard de Lotes estaba
seis días atrasado (`dash-graficos.js` y `dash-metricas.js`, «+537 y +369
líneas»). **Era falso.** Salía de un subagente que leyó estadísticas de commits
y las reportó como diferencias de contenido. La comparación real de los archivos
da cero diferencias. Vale como recordatorio: para afirmar que dos archivos
difieren hay que comparar los archivos.

## El principio de diseño

**La web escribe. Lo local no.**

El corte no mueve datos: vuelve asimétrica una relación que hoy es ambigua. Dos
cambios lo logran.

1. Lo local deja de ser arrancable por accidente.
2. La vía del martillo (`importar.mjs`) queda cerrada salvo para un
   procedimiento explícito y documentado.

## El procedimiento

Es uno solo para los tres módulos, y **no incluye importar nada**.

### Paso 0 · Confirmar que la web va adelante

```
npx wrangler d1 execute catenainstitute --remote --command "SELECT modulo, version, autor, guardado FROM documento ORDER BY modulo"
```

Comparar cada `guardado` con la fecha de modificación del `datos.json` local
correspondiente. Se espera que la web sea más nueva en los tres. **Si algún
módulo tiene local más nuevo, ese módulo se detiene y se resuelve aparte** —
nunca importando a ciegas.

Este paso es de confirmación, no de decisión: la decisión ya está tomada (no se
importa). Sirve para dejar registro de en qué versión quedó cada módulo al
momento del corte.

### Paso 1 · Respaldar la nube

Uno por módulo, como red antes de tocar nada:

```
npx wrangler d1 execute catenainstitute --remote --json --command "SELECT json FROM documento WHERE modulo='<mod>'" > respaldo-nube-<mod>-<fecha>.json
```

El archivo es un array; la versión sale de
`JSON.parse(d[0].results[0].json).version`. Están gitignorados por
`respaldo-nube-*.json`.

### Paso 2 · Exportar el último estado local, como archivo muerto

No para importarlo: para tenerlo. Se guarda fuera de `datos-origen/` con nombre
que diga qué es, del tipo `ultimo-estado-local-<mod>-2026-09-09.json`.

**Ojo con el orden en Lotes:** su servidor está vivo, no es un zombi (lock
`servidor-activo-AGDLABORATORIOCIW25.json` con latido a las 07:36 del 09/09, PID
15448, puerto 8772). Exportar **antes** de matarlo; al revés se pierde lo que
tenga en memoria sin guardar.

### Paso 3 · Matar los servidores locales

Al 2026-09-09 hay **4 procesos colgados desde el 08/09**:

- 2 servidores Python (PID 1244 en los puertos 8765 y 8766; PID 15448 en 8772).
- 2 `wrangler dev` (workerd en 8787 y 8788).

Múltiples servidores simultáneos sobre los mismos datos es exactamente la
condición que causó la pérdida de datos del 3 de julio.

### Paso 4 · Congelar los lanzadores

Renombrar a `.bat.congelado`. No se borra nada: el código y el último
`datos.json` quedan como respaldo. Reversible en diez segundos.

| Módulo | Lanzadores a renombrar | Dónde |
|---|---|---|
| Barriles | `Abrir Mapa de Barriles.bat`, `Iniciar servidor.bat`, `Arranque automatico (instalar).bat`, `Backup semanal (instalar).bat` | `Escritorio\claude\mapa de barriles\mapa-barriles` |
| Lotes | `Abrir Lotes.bat`, `Cerrar Lotes.bat` | `Escritorio\claude\Lotes` |
| Prensas | `Abrir Prensas.bat`, `Cerrar Prensas.bat`, `supervisor.pyw` | `OneDrive\Archivos de Roy Urvieta - Año 2026\Registro de Lotes CIW 2026\prensas-app` |

`Restaurar Datos.bat` (en Lotes y en Prensas) **no se renombra**: es la
herramienta de emergencia y no levanta servidor.

Los dos instaladores de Barriles se congelan aunque no estén instalados, porque
correrlos después del corte reviviría el problema. Se verificó el 2026-09-09 que
**no hay arranque automático activo**: cero tareas programadas, carpeta de
Inicio vacía, `HKCU:\...\Run` sin entradas.

### Paso 5 · Cerrar la vía del martillo

`scripts/importar.mjs` con `--remote` tiene que exigir una confirmación
explícita (una bandera del tipo `--piso-la-web`). Hoy cualquier invocación
reemplaza el documento sin preguntar, y los scripts `importar:prensas`,
`importar:barriles` e `importar:lotes` de `package.json` lo dejan a un `npm run`
de distancia.

El objetivo no es impedirlo —hay un caso legítimo, abajo— sino que no pueda
pasar por inercia.

### El corte se hace en una sola máquina

Los tres locks `servidor-activo-*.json` apuntan al mismo host:
**`AGDLABORATORIOCIW25`**, que es esta PC (`$env:COMPUTERNAME` devuelve
`AGDLABORATORIOC`, truncado a los 15 caracteres de NetBIOS). No hay que repetir
el congelamiento en otras computadoras de la bodega.

## El Excel ocasional de Lotes

`motor_reconciliacion.py` (27 KB) + `reconciliar_excel.py` +
`migrar_movimientos.py` son trabajo del 08/09 que no existe en la web. Decisión
del usuario: **el Excel se usa con poca frecuencia y más adelante se va a
integrar a la web.**

Mientras tanto **no se porta** —27 KB de motor para un uso ocasional es YAGNI— y
queda un procedimiento documentado en `DESPLIEGUE.md`:

1. Exportar de la web con el botón de Excel (3 hojas).
2. Reconciliar con los scripts que ya están en `Lotes/`.
3. Respaldar la nube (paso 1 de arriba).
4. Subir con `importar.mjs --modulo lotes --remote --piso-la-web`.

Es la **única excepción autorizada** a "no tocar lo local", y la única razón
legítima para levantar el freno del paso 5. Cuando el Excel se integre a la web,
esta sección y los tres scripts se borran.

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
- **La conexión de datos entre módulos**, ya diseñada en el spec del 04/09. Es
  el paso siguiente natural: con lo local apagado, «una sola fuente» pasa de ser
  «un solo lugar donde correr» a «un solo modelo de datos».

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Alguien corre `npm run importar:*` y borra el trabajo del equipo | El paso 5. Es el riesgo principal del sistema hoy, y el corte no lo crea: lo elimina. |
| Roy o el equipo abren la app local por costumbre | El `.bat.congelado` lo vuelve imposible en vez de dejarlo a la memoria de cada uno |
| La sesión de Cloudflare Access vence mientras el celular está offline | La API devuelve un redirect al login con HTML, no un 401. La cola de pendientes no distingue eso de un error de red y puede acumular cambios contra una sesión muerta. **Hay que arreglarlo aparte de este corte.** |
| El repo es público | Ya contemplado: `usuarios.sql`, `datos.json`, `respaldo-nube-*.json` y `datos-origen/` están en `.gitignore`. Reconfirmarlo antes de commitear datos nuevos. |
| Perder el último estado local al apagar | El paso 2 lo guarda como archivo muerto antes de matar los servidores |

## Criterios de éxito

1. Los 10 lanzadores de la tabla del paso 4 están renombrados a
   `.bat.congelado` y ningún servidor Python local escucha en 8765, 8766 ni 8772.
2. Los tres módulos se cargan y se guardan desde
   `https://catenainstitute.besa-junin.workers.dev`.
3. `importar.mjs --remote` no puede reemplazar un documento sin confirmación
   explícita.
4. Existe `CLAUDE.md` en el repo web y la memoria del proyecto ya no describe
   flujos locales.
5. Queda registrado en qué `version` quedó cada módulo el día del corte.
