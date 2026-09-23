/* Tests del modulo de fechas de Lotes.
 *
 * El modulo es puro (no toca el DOM ni el navegador), asi que se puede importar
 * dentro del runtime de Workers igual que carga-cols.js.
 *
 * Lo que se esta protegiendo es una sola cosa, dicha de muchas maneras: el dato
 * viaja en ISO y la persona ve dd/mm/aaaa, y el dia nunca se convierte en el
 * mes por el camino.
 */
import { describe, it, expect } from 'vitest';
import { fmtFecha, fmtMes, aIso } from '../public/lotes/js/fechas.js';

describe('fmtFecha', () => {
  it('pasa el ISO a dd/mm/aaaa', () => {
    expect(fmtFecha('2026-09-10')).toBe('10/09/2026');
  });

  it('conserva los ceros a la izquierda', () => {
    expect(fmtFecha('2026-01-05')).toBe('05/01/2026');
  });

  it('acepta un ISO con hora y se queda con el dia', () => {
    expect(fmtFecha('2026-09-10T14:30:00')).toBe('10/09/2026');
    expect(fmtFecha('2026-09-10 14:30')).toBe('10/09/2026');
  });

  it('devuelve vacio para lo que no tiene fecha', () => {
    for (const vacio of ['', '   ', null, undefined]) expect(fmtFecha(vacio)).toBe('');
  });

  it('devuelve el texto tal cual si no es un ISO', () => {
    /* Preferible que se vea un dato raro a que desaparezca de la pantalla: en
     * el Excel viejo quedaron fechas que nunca se normalizaron. */
    expect(fmtFecha('ayer')).toBe('ayer');
    expect(fmtFecha('10/09/2026')).toBe('10/09/2026');
  });

  it('no da vuelta el dia y el mes', () => {
    /* El bug que se esta arreglando, al reves: un 10 de septiembre no puede
     * salir como 9 de octubre. */
    expect(fmtFecha('2026-09-10')).not.toBe('09/10/2026');
    expect(fmtFecha('2026-10-09')).toBe('09/10/2026');
  });
});

describe('fmtMes', () => {
  it('pasa el aaaa-mm a mm/aaaa', () => {
    expect(fmtMes('2026-09')).toBe('09/2026');
  });

  it('acepta un ISO completo y se queda con el mes', () => {
    expect(fmtMes('2026-09-10')).toBe('09/2026');
  });

  it('devuelve el texto tal cual si no lo entiende', () => {
    expect(fmtMes('')).toBe('');
    expect(fmtMes(null)).toBe('');
    expect(fmtMes('sin mes')).toBe('sin mes');
  });
});

describe('aIso', () => {
  it('acepta dd/mm/aaaa y dd-mm-aaaa', () => {
    expect(aIso('10/09/2026')).toBe('2026-09-10');
    expect(aIso('10-09-2026')).toBe('2026-09-10');
    expect(aIso('1/9/2026')).toBe('2026-09-01');
  });

  it('acepta un ISO y lo deja como esta', () => {
    expect(aIso('2026-09-10')).toBe('2026-09-10');
    expect(aIso('2026-9-1')).toBe('2026-09-01');
  });

  it('ignora los espacios de los costados', () => {
    expect(aIso('  10/09/2026  ')).toBe('2026-09-10');
  });

  it('devuelve vacio cuando el texto esta vacio', () => {
    /* Vacio y basura no son lo mismo: borrar una fecha es valido, escribir
     * cualquier cosa no. */
    expect(aIso('')).toBe('');
    expect(aIso('   ')).toBe('');
    expect(aIso(null)).toBe('');
  });

  it('devuelve null para lo que no es una fecha', () => {
    for (const basura of ['ayer', '10/09/26', '2026/09/10', 'x/y/z'])
      expect(aIso(basura)).toBe(null);
  });

  it('rechaza los dias que no existen', () => {
    expect(aIso('31/02/2026')).toBe(null);
    expect(aIso('32/01/2026')).toBe(null);
    expect(aIso('2026-02-31')).toBe(null);
  });

  it('exige que los dos separadores sean el mismo', () => {
    expect(aIso('28/01-2026')).toBe(null);
  });
});

describe('ida y vuelta', () => {
  it('escribir dd/mm/aaaa y volver a leerlo devuelve lo mismo', () => {
    /* La prueba que importa: la celda editable de Analisis muestra fmtFecha,
     * guarda con aIso y vuelve a mostrar con fmtFecha. Si en algun punto se
     * dieran vuelta el dia y el mes, un 10/09 volveria como 09/10. */
    for (const escrito of ['10/09/2026', '01/12/2026', '28/02/2026', '31/12/2025'])
      expect(fmtFecha(aIso(escrito))).toBe(escrito);
  });

  it('un ISO guardado sobrevive a mostrarlo y volverlo a guardar', () => {
    for (const iso of ['2026-09-10', '2026-01-05', '2025-12-31'])
      expect(aIso(fmtFecha(iso))).toBe(iso);
  });
});
