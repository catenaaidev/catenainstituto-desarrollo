# OT: ventana que no se pierde, cambiar N° y check de carpeta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A (minimizar/borrador), E (renumerar OT) y F (estado del PDF + cartel) del spec.

**Architecture:** Lógica pura en `ot-renumerar.js` y `ot-pdf.js` (nuevos, con tests); guardia/minimizar en `nucleo.js` + `app.js`; vistas `vista-ot-emitir.js`, `vista-ot-corte.js`, `vista-ot-lista.js`, `guardar-ot.js`.

**Spec:** `docs/superpowers/specs/2026-10-26-ot-ventana-numero-carpeta-design.md`

## Global Constraints

- OT viejas sin `pdf`: sin etiqueta. Sin migración.
- `localStorage` siempre con try/catch.
- Push a `main` = producción: lo hace el usuario.
- Tests: `npx vitest run test/<archivo>`.

---

### Task 1: `renumerarOT` (puro) — `public/lotes/js/ot-renumerar.js`, `test/lotes-ot-renumerar.test.mjs`
- [ ] Test: renumera ot.ot, movimientos por mov_id, mermas `{ot viejo, lote de la OT}`, `analisis[].correccion.ot_n` y `analisis[].agregados[].ot_n` de lotes de la OT; no toca otros lotes ni otros números; devuelve `{movimientos, mermas, correcciones, agregados}`.
- [ ] Implementar, tests verdes, commit.

### Task 2: estado del PDF y desfase (puro) — `public/lotes/js/ot-pdf.js`, `test/lotes-ot-pdf.test.mjs`
- [ ] `etiquetaPdf(ot) -> {txt, clase, title} | null`; `desfaseCarpeta({nombres, web}, serie) -> {web:'0953', carpeta:'0950'} | null` (solo si web > carpeta).
- [ ] Implementar, tests verdes, commit.

### Task 3: F en la vista — `guardar-ot.js` devuelve `guardado/nombre` (relee la carpeta tras escribir) y acepta `renumerar(libre)`; `vista-ot-emitir.js#imprimirOT` guarda `ot.pdf`; `vista-ot-lista.js` etiqueta + cartel.
- [ ] Probar en navegador (sin carpeta → descargado, etiqueta, cartel). Commit.

### Task 4: E en la vista — botón "✎ N°" en `vista-ot-lista.js`; "Pasar a la 0953" al imprimir.
- [ ] Probar en navegador. Commit.

### Task 5: A — guardia + minimizar (`nucleo.js`, `app.js`, `index.html` pastilla), Emitir OT y Corte con botón Minimizar, confirmación al descartar, pregunta al reabrir.
- [ ] Probar en navegador: clic afuera minimiza, retomar, fetch en vuelo repinta. Commit.

### Task 6: A — borrador ante recarga (`fotoSesion`/`restaurarSesion` en `vista-ot-emitir.js`, estado del asistente en `vista-ot-corte.js`).
- [ ] Test puro de serializar/restaurar (Sets ↔ arrays). Probar recarga en navegador. Commit.

### Task 7: todos los tests + typecheck, push de la rama, pedir merge al usuario.
