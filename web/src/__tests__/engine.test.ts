import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultParams, DISTRIBUTIONS, simulate } from '../engine/distributions';
import { generateSequence, hullDobell } from '../engine/generators';
import { evaluateQuery, theoreticalProbability, type Query } from '../engine/query';
import { binomCdf, erlangCdf, normalCdf, poissonCdf } from '../engine/theory';
import { arraySource, prngSource } from '../engine/uniform';
import { parseCsv, parseJson, parsePlainText } from '../io/parse';
import { parseTemplateWorkbook } from '../io/template';

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', name)));
const auto = () => prngSource('mixto', { seed: 12345, a: 1103515245, c: 12345, m: 2147483648 });

describe('generadores (idénticos a simulacion-trabajo /api/generate)', () => {
  it('lineal mixto seed=4 a=5 c=7 m=8', () => {
    expect(generateSequence('mixto', { seed: 4, a: 5, c: 7, m: 8 }, 5).x).toEqual([3, 6, 5, 0, 7]);
  });
  it('Hull-Dobell', () => {
    expect(hullDobell({ a: 1103515245, c: 12345, m: 2147483648 })).toBe(true);
    expect(hullDobell({ a: 21, c: 7, m: 2000 })).toBe(true);
    expect(hullDobell({ a: 4, c: 2, m: 8 })).toBe(false);
  });
});

describe('plantilla Excel', () => {
  it('lee el Excel del usuario (Lineal Mixto, 2000 filas) recalculando fórmulas', () => {
    const buf = new Uint8Array(readFileSync(join(__dirname, '../../public/plantilla_simulacion.xlsx')));
    const s = parseTemplateWorkbook(buf, 'plantilla');
    expect(s.errors).toEqual([]);
    expect(s.generator).toBe('mixto');
    expect(s.values).toHaveLength(2000);
    expect(s.params).toMatchObject({ seed: 4, a: 21, c: 7, m: 2000 });
    expect(s.values.slice(0, 3)).toEqual([(21 * 4 + 7) % 2000 / 2000, ((21 * 91 + 7) % 2000) / 2000, ((21 * 1918 + 7) % 2000) / 2000]);
  });
  it.each(['mixto', 'multiplicativo', 'cuadratico', 'xorshift', 'bbs'])('exportación %s', (m) => {
    const s = parseTemplateWorkbook(fixture(`${m}.xlsx`), m);
    expect(s.errors).toEqual([]);
    expect(s.generator).toBe(m);
    expect(s.values).toHaveLength(20);
    s.values.forEach((v) => expect(v >= 0 && v <= 1).toBe(true));
  });
  it('xorshift coincide con el algoritmo de 32 bits', () => {
    const s = parseTemplateWorkbook(fixture('xorshift.xlsx'), 'x');
    expect(s.values[0]).toBeCloseTo(generateSequence('xorshift', { seed: 123456789, a: 13, b: 17, c: 5 }, 1).r[0], 12);
  });
  it('ciclos marcados', () => {
    expect(parseTemplateWorkbook(fixture('mixto.xlsx'), 'm').cycles).toBe(12);
  });
});

describe('entrada manual', () => {
  it('texto con coma decimal y errores', () => {
    const s = parsePlainText('0,5\n0,25; 1,7\nabc');
    expect(s.values).toEqual([0.5, 0.25]);
    expect(s.errors.map((e) => e.reason)).toEqual(['fuera de [0, 1]', 'no es numérico']);
  });
  it('csv con cabecera de plantilla', () => {
    expect(parseCsv('i,X_i,R_i,Estado\n1,3,0.375,✓\n2,6,0.75,🔄 Ciclo', 'f').values).toEqual([0.375, 0.75]);
  });
  it('json de /api/generate', () => {
    const s = parseJson('{"data":[{"i":1,"x":3,"r":0.375,"is_repeat":false},{"i":2,"x":0,"r":0,"is_repeat":true}]}', 'j');
    expect(s.values).toEqual([0.375, 0]);
    expect(s.boundary).toBe(1);
    expect(s.cycles).toBe(1);
  });
});

describe('simulación', () => {
  it('nunca produce NaN/Infinity con R = 0 ó 1', () => {
    for (const d of ['poisson', 'normal', 'erlang'] as const) {
      for (const m of DISTRIBUTIONS[d].methods) {
        const r = simulate(d, m.key, defaultParams(d), arraySource([0, 1, 0, 1, 0.5], true), 200);
        r.values.forEach((v) => expect(Number.isFinite(v)).toBe(true));
        expect(r.clamped).toBeGreaterThan(0);
      }
    }
  });
  it('OVERFLOW si la secuencia manual se agota', () => {
    const r = simulate('erlang', 'convolution', { k: 3, lambda: 1 }, arraySource([0.1, 0.2, 0.3, 0.4], false), 5);
    expect(r.samples).toHaveLength(1);
    expect(r.overflow).toBe(true);
    expect(r.samples[0].x).toBeCloseTo(-(Math.log(0.1) + Math.log(0.2) + Math.log(0.3)), 12);
  });
  it('TCL n=12 usa exactamente Σ R − 6', () => {
    const r = simulate('normal', 'tcl12', { mu: 10, sigma: 2 }, arraySource(Array(12).fill(0.5), false), 1);
    expect(r.values[0]).toBe(10);
  });
  it.each([
    ['binomial', 'bernoulli'], ['binomial', 'inverse'], ['poisson', 'arrivals'], ['poisson', 'inverse'],
    ['normal', 'boxmuller'], ['normal', 'tcl12'], ['erlang', 'convolution'],
  ] as const)('%s/%s converge a media y varianza teóricas', (d, m) => {
    const spec = DISTRIBUTIONS[d];
    const p = defaultParams(d);
    const { values } = simulate(d, m, p, auto(), 40000);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
    expect(Math.abs(mean - spec.mean(p))).toBeLessThan(0.05 * Math.max(1, spec.mean(p)));
    expect(Math.abs(v - spec.variance(p)) / spec.variance(p)).toBeLessThan(0.06);
  });
});

describe('teoría y consultas', () => {
  it('FDA conocidas', () => {
    expect(normalCdf(1.96, 0, 1)).toBeCloseTo(0.975, 4);
    expect(binomCdf(3, 10, 0.3)).toBeCloseTo(0.6496107184, 8);
    expect(poissonCdf(4, 4)).toBeCloseTo(0.6288369352, 8);
    expect(erlangCdf(1, 1, 1)).toBeCloseTo(1 - Math.exp(-1), 10);
  });
  it('desigualdades estrictas en discretas', () => {
    const d = DISTRIBUTIONS.binomial;
    const p = { n: 10, p: 0.3 };
    const base: Query = { mode: 'left', k: 3, strict: false, a: 2, b: 4, aStrict: false, bStrict: false };
    expect(theoreticalProbability(base, d, p)).toBeCloseTo(binomCdf(3, 10, 0.3), 12);
    expect(theoreticalProbability({ ...base, strict: true }, d, p)).toBeCloseTo(binomCdf(2, 10, 0.3), 12);
    expect(theoreticalProbability({ ...base, mode: 'right', strict: true }, d, p)).toBeCloseTo(1 - binomCdf(3, 10, 0.3), 12);
    expect(theoreticalProbability({ ...base, mode: 'interval' }, d, p)).toBeCloseTo(binomCdf(4, 10, 0.3) - binomCdf(1, 10, 0.3), 12);
    expect(theoreticalProbability({ ...base, mode: 'interval', aStrict: true, bStrict: true }, d, p)).toBeCloseTo(binomCdf(3, 10, 0.3) - binomCdf(2, 10, 0.3), 12);
  });
  it('consulta empírica', () => {
    const r = evaluateQuery([1, 2, 3, 4], { mode: 'right', k: 3, strict: false, a: 0, b: 0, aStrict: false, bStrict: false }, DISTRIBUTIONS.poisson, { lambda: 2 });
    expect(r.favorable).toBe(2);
    expect(r.simulated).toBe(0.5);
  });
});
