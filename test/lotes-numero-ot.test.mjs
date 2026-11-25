/* Numeracion de OT a partir de los nombres de la carpeta de OneDrive
 * "Ordenes de Trabajo 2026". Los nombres son reales (2026-10-13). */
import { describe, it, expect } from 'vitest';
import { numeroDeNombre, maximoSerie, formatearNumero, numerosWeb, siguienteNumero,
         numeroUsado, nombreArchivo, pareceCarpetaOT, normalizarNumero,
         nombreConNumero, unirNumeros } from '../public/lotes/js/numero-ot.js';

const RAIZ = [
  '0700 Trasiego fin FML de barricas a barricas 26217.xlsx',
  '0702 Inertización de tanques.xlsx',
  '0702 Orden de Correccion So2 .xlsx',
  '0707 Orden de muestras Prensa.pdf',
  '0937 Muestras Ensayos Nico Torti.xlsx',
  '0938 Muestra cortes vinos Liberados.xlsx',
  'A Ordenes de molienda', 'AAA Guía de Trabajos.xlsx', 'B Ordenes de agregados',
  'Backup', 'Buckup', 'CLAUDE.md', 'Iniciar generador OT v3.bat', 'Templeates', 'memory',
];
const AGREGADOS = ['B211 Agregado de Quitosano.xlsx', 'B220 OT agregados.xlsx',
  'B222 Correccion SO2.xlsx', 'CHANGELOG.md', '__pycache__', 'generar_OT_v3.py'];

describe('numeroDeNombre', () => {
  it('serie principal: 4 digitos al principio', () => {
    expect(numeroDeNombre('0938 Muestra cortes.xlsx', 'principal')).toBe(938);
    expect(numeroDeNombre('0939.pdf', 'principal')).toBe(939);
    expect(numeroDeNombre('0939', 'principal')).toBe(939);
  });
  it('ignora lo que no es un numero de OT', () => {
    for (const n of ['AAA Guía de Trabajos.xlsx', 'Backup', 'CLAUDE.md', 'B222 Correccion SO2.xlsx',
                     '12345 algo.xlsx', '093 corto.xlsx', '0938x.xlsx'])
      expect(numeroDeNombre(n, 'principal')).toBeNull();
  });
  it('serie B', () => {
    expect(numeroDeNombre('B222 Correccion SO2.xlsx', 'B')).toBe(222);
    expect(numeroDeNombre('b1005 algo.pdf', 'B')).toBe(1005);
    expect(numeroDeNombre('B Ordenes de agregados', 'B')).toBeNull();
    expect(numeroDeNombre('0938 x.xlsx', 'B')).toBeNull();
  });
});

describe('maximoSerie', () => {
  it('toma el mayor y su nombre; repetidos no molestan', () => {
    expect(maximoSerie(RAIZ, 'principal')).toEqual({ n: 938, nombre: '0938 Muestra cortes vinos Liberados.xlsx' });
    expect(maximoSerie(AGREGADOS, 'B')).toEqual({ n: 222, nombre: 'B222 Correccion SO2.xlsx' });
  });
  it('null si no hay ninguno', () => {
    expect(maximoSerie(['CLAUDE.md'], 'principal')).toBeNull();
    expect(maximoSerie([], 'B')).toBeNull();
  });
});

describe('formatearNumero', () => {
  it('principal con 4 digitos, B con 3 como minimo', () => {
    expect(formatearNumero(939, 'principal')).toBe('0939');
    expect(formatearNumero(1000, 'principal')).toBe('1000');
    expect(formatearNumero(223, 'B')).toBe('B223');
    expect(formatearNumero(7, 'B')).toBe('B007');
  });
});

describe('numerosWeb', () => {
  const datos = {
    movimientos: [{ ot: 'OT-2026-014' }, { ot: '0941' }, { ot: '' }, {}],
    ordenes_trabajo: [{ ot: '0942' }],
    analisis: [
      { correccion: { ot_n: 'B224' }, agregados: [{ ot_n: 'B226' }, null] },
      { correccion: null }, null,
    ],
  };
  it('principal: ot de movimientos y de ordenes_trabajo con formato nuevo', () => {
    expect(numerosWeb(datos, 'principal').sort()).toEqual([941, 942]);
  });
  it('B: ot_n de correcciones y agregados', () => {
    expect(numerosWeb(datos, 'B').sort()).toEqual([224, 226]);
  });
  it('B: cuenta tambien las ordenes de correccion guardadas (aunque esten anuladas)', () => {
    const d = { analisis: [], ordenes_correccion: [
      { numero: 'B230', estado: 'pendiente' }, { numero: 'B231', estado: 'anulada' }, {} ] };
    expect(numerosWeb(d, 'B').sort()).toEqual([230, 231]);
    expect(numerosWeb(d, 'principal')).toEqual([]);
  });
  it('datos vacios', () => {
    expect(numerosWeb({}, 'principal')).toEqual([]);
    expect(numerosWeb(null, 'B')).toEqual([]);
  });
  it('numerosWeb cuenta las órdenes de papel en su serie', () => {
    const d = { ordenes_hojas: [{ tipo: 'muestras', ot: '0951' }, { tipo: 'micro', ot: '0952' }, { tipo: 'agregados', ot: 'B251' }] };
    expect(numerosWeb(d, 'principal').sort()).toEqual(numerosWeb({ movimientos: [{ ot: '0951' }, { ot: '0952' }] }, 'principal').sort());
    expect(numerosWeb(d, 'B')).toEqual(numerosWeb({ ordenes_correccion: [{ numero: 'B251' }] }, 'B'));
  });
});

describe('siguienteNumero', () => {
  it('maximo de carpeta + 1', () => {
    expect(siguienteNumero({ nombres: RAIZ }, 'principal')).toBe('0939');
    expect(siguienteNumero({ nombres: AGREGADOS }, 'B')).toBe('B223');
  });
  it('la web puede ir adelante de la carpeta (PDF todavia sin sincronizar)', () => {
    expect(siguienteNumero({ nombres: RAIZ, web: [940] }, 'principal')).toBe('0941');
  });
  it('sin carpeta usa lo ultimo visto y la web', () => {
    expect(siguienteNumero({ nombres: null, web: [], ultimoVisto: 938 }, 'principal')).toBe('0939');
    expect(siguienteNumero({ nombres: null, web: [950], ultimoVisto: 938 }, 'principal')).toBe('0951');
  });
  it('sin nada: 1', () => {
    expect(siguienteNumero({}, 'principal')).toBe('0001');
    expect(siguienteNumero({}, 'B')).toBe('B001');
  });
});

describe('numeroUsado', () => {
  it('devuelve el archivo que ya usa ese numero', () => {
    expect(numeroUsado(RAIZ, '0938', 'principal')).toBe('0938 Muestra cortes vinos Liberados.xlsx');
    expect(numeroUsado(RAIZ, '938', 'principal')).toBe('0938 Muestra cortes vinos Liberados.xlsx');
    expect(numeroUsado(AGREGADOS, 'b222', 'B')).toBe('B222 Correccion SO2.xlsx');
  });
  it('null si esta libre o el numero no se entiende', () => {
    expect(numeroUsado(RAIZ, '0939', 'principal')).toBeNull();
    expect(numeroUsado(RAIZ, 'OT-2026-001', 'principal')).toBeNull();
  });
});

describe('nombreArchivo', () => {
  it('numero + titulo + .pdf, sin caracteres invalidos de Windows', () => {
    expect(nombreArchivo('0939', 'Trasiego 26217')).toBe('0939 Trasiego 26217.pdf');
    expect(nombreArchivo('B223', 'Correccion SO2 / lote: "26"?')).toBe('B223 Correccion SO2 lote 26.pdf');
    expect(nombreArchivo('0939', '   ')).toBe('0939.pdf');
    expect(nombreArchivo('0939', 'algo.pdf')).toBe('0939 algo.pdf');
  });
});

describe('pareceCarpetaOT', () => {
  it('true si tiene la subcarpeta de agregados', () => {
    expect(pareceCarpetaOT(RAIZ)).toBe(true);
    expect(pareceCarpetaOT(['Documentos', 'foto.jpg'])).toBe(false);
  });
});

describe('normalizarNumero', () => {
  it('serie principal: completa a 4 digitos', () => {
    expect(normalizarNumero('939', 'principal')).toBe('0939');
    expect(normalizarNumero(' 0939 ', 'principal')).toBe('0939');
    expect(normalizarNumero(939, 'principal')).toBe('0939');
  });
  it('serie B: mayuscula y sin espacio', () => {
    expect(normalizarNumero('b223', 'B')).toBe('B223');
    expect(normalizarNumero('B 223', 'B')).toBe('B223');
    expect(normalizarNumero('B223', 'B')).toBe('B223');
  });
  it('lo que no se entiende queda igual (recortado)', () => {
    expect(normalizarNumero(' OT-2026-001 ', 'principal')).toBe('OT-2026-001');
    expect(normalizarNumero('12345', 'principal')).toBe('12345');
    expect(normalizarNumero('223', 'B')).toBe('223');
    expect(normalizarNumero('', 'principal')).toBe('');
  });
});

describe('unirNumeros', () => {
  it('junta sin repetir y descarta basura', () => {
    expect(unirNumeros([940, 941], [941, 951], [null, NaN, '3'])).toEqual([940, 941, 951]);
    expect(unirNumeros()).toEqual([]);
  });
});

describe('nombreConNumero', () => {
  it('si el nombre ya empieza con el numero, lo deja (limpio y con .pdf)', () => {
    expect(nombreConNumero('0939 Trasiego 26217.pdf', '0939', 'principal')).toBe('0939 Trasiego 26217.pdf');
    expect(nombreConNumero('0939 Trasiego: 26217', '939', 'principal')).toBe('0939 Trasiego 26217.pdf');
    expect(nombreConNumero('B223 Correccion SO2', 'b223', 'B')).toBe('B223 Correccion SO2.pdf');
  });
  it('numero mal tipeado o corto al principio: lo cambia por el correcto', () => {
    expect(nombreConNumero('093 Trasiego.pdf', '0939', 'principal')).toBe('0939 Trasiego.pdf');
    expect(nombreConNumero('939 Trasiego.pdf', '0939', 'principal')).toBe('0939 Trasiego.pdf');
    expect(nombreConNumero('0940 Trasiego.pdf', '0939', 'principal')).toBe('0939 Trasiego.pdf');
    expect(nombreConNumero('B22 Correccion.pdf', 'B223', 'B')).toBe('B223 Correccion.pdf');
  });
  it('sin numero al principio: lo antepone', () => {
    expect(nombreConNumero('Trasiego.pdf', '0939', 'principal')).toBe('0939 Trasiego.pdf');
    expect(nombreConNumero('', '0939', 'principal')).toBe('0939.pdf');
    expect(nombreConNumero('Correccion SO2', 'B223', 'B')).toBe('B223 Correccion SO2.pdf');
  });
  it('el resultado siempre lo reconoce numeroDeNombre', () => {
    for (const [nom, num, s] of [['093 x', '0939', 'principal'], ['x', '939', 'principal'], ['b 22 y', 'B223', 'B']])
      expect(numeroDeNombre(nombreConNumero(nom, num, s), s)).toBe(numeroDeNombre(normalizarNumero(num, s), s));
  });
});
