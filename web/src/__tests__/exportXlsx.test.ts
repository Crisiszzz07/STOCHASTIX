import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultParams, DIST_LIST, DISTRIBUTIONS, simulate, type DistKey, type Params } from '../engine/distributions';
import { evaluateQuery, type Query } from '../engine/query';
import { arraySource } from '../engine/uniform';
import { buildReport, computeRuns, type ReportInput } from '../io/exportXlsx';
import { parseTemplateWorkbook } from '../io/template';
import { readWorkbook } from '../io/xlsx';

const plantilla = new Uint8Array(readFileSync(join(__dirname, '../../public/plantilla_simulacion.xlsx')));
const OUT = process.env.XLSX_OUT;

const q = (p: Partial<Query>): Query => ({ mode: 'right', k: 0, strict: false, a: 0, b: 0, aStrict: false, bStrict: false, ...p });

function input(over: Partial<ReportInput> = {}): ReportInput {
  const seq = parseTemplateWorkbook(plantilla, 'simulacion_aleatorios.xlsx');
  const paramsBy = Object.fromEntries(DIST_LIST.map((d) => [d.key, defaultParams(d.key)])) as Record<DistKey, Params>;
  const queryBy: Record<DistKey, Query> = {
    binomial: q({ mode: 'left', k: 3 }),
    poisson: q({ mode: 'right', k: 5, strict: true }),
    normal: q({ mode: 'interval', a: -1, b: 1 }),
    erlang: q({ mode: 'right', k: 5 }),
    uniform: q({ mode: 'interval', a: 2, b: 7, aStrict: true }),
  };
  return {
    seq, wrap: false, N: 300, bins: 12, paramsBy, queryBy, statementBy: { normal: 'prueba' },
    active: { dist: 'normal', method: 'boxmuller' }, date: new Date(2026, 8, 28, 10, 0), ...over,
  };
}

describe('reporte .xlsx completo', () => {
  it('incluye todas las distribuciones con todos sus métodos', () => {
    const inp = input();
    const runs = computeRuns(inp);
    const expected = DIST_LIST.reduce((s, d) => s + d.methods.length, 0);
    expect(runs).toHaveLength(expected);
    const bytes = buildReport(inp, runs);
    if (OUT) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, 'reporte_completo.xlsx'), bytes);
    }
    const sheets = readWorkbook(bytes);
    const names = sheets.map((s) => s.name);
    expect(names[0]).toBe('Resumen general');
    expect(names[1]).toBe('Auditoría R_i');
    expect(names.slice(-3)).toEqual(['R_i', 'Auxiliares', 'Teoría']);
    expect(names).toHaveLength(expected + 5);
    runs.forEach((r) => expect(names).toContain(r.sheet));
    names.forEach((n) => expect(n.length).toBeLessThanOrEqual(31));
  });

  it('cada método coincide con una simulación independiente', () => {
    const inp = input();
    for (const run of computeRuns(inp)) {
      const res = simulate(run.spec.key, run.method.key, run.params, arraySource(inp.seq.values, false), inp.N);
      const qr = evaluateQuery(res.values, inp.queryBy[run.spec.key], DISTRIBUTIONS[run.spec.key], run.params);
      expect(run.qres).toEqual(qr);
    }
  });

  it('marca como error una distribución con parámetros inválidos sin romper el resto', () => {
    const inp = input();
    inp.paramsBy = { ...inp.paramsBy, uniform: { a: 5, b: 1 } };
    const runs = computeRuns(inp);
    expect(runs.find((r) => r.spec.key === 'uniform')?.error).toMatch(/inválidos/);
    const names = readWorkbook(buildReport(inp, runs)).map((s) => s.name);
    expect(names.some((n) => n.startsWith('Uniforme'))).toBe(false);
  });

  it('copia las 7 pruebas del panel de auditoría de la plantilla', () => {
    const sheets = readWorkbook(buildReport(input()));
    const audit = sheets.find((s) => s.name === 'Auditoría R_i')!;
    const names = [5, 6, 7, 8, 9, 10, 11].map((r) => audit.cells.get(`A${r}`)?.value);
    expect(names).toEqual([
      'Promedios (Z_0)', 'Frecuencias (Chi-cuadrada)', 'Kolmogorov-Smirnov (D_n)', 'Entropía de Shannon (Bits)',
      'Monte Carlo para Pi (Error Absoluto)', 'Distancia (Coss Bu)', 'Series (Coss Bu)',
    ]);
    expect(audit.cells.get('D5')?.value).toBe('✅ APROBADO');
  });

  it('la hoja R_i se puede volver a cargar como fuente', () => {
    const inp = input();
    const again = parseTemplateWorkbook(buildReport(inp), 'reporte.xlsx');
    expect(again.errors).toEqual([]);
    expect(again.values).toEqual(inp.seq.values);
  });
});
