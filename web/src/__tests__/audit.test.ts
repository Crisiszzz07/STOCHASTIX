import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeAudit, criticalOf, DEFAULT_AUDIT, passes, type AuditKey } from '../engine/audit';
import { parseTemplateWorkbook } from '../io/template';

const load = (p: string) => parseTemplateWorkbook(new Uint8Array(readFileSync(join(__dirname, p))), p);

// Valores del panel «AUDITORÍA ESTADÍSTICA» de cada plantilla, calculados por LibreOffice
// a partir de las fórmulas originales de la hoja «Auxiliares».
const REF: Record<string, Record<AuditKey, number>> = {
  '../../public/plantilla_simulacion.xlsx': {
    promedios: 0.0387298334620699, frecuencias: 0, ks: 0.000500000000000056, entropia: 3.32192809488736,
    montecarlo: 0.005592653589793, distancia: 3.98356481481482, series: 17.2706353176588,
  },
  'fixtures/mixto.xlsx': {
    promedios: 0.968245836551854, frecuencias: 6, ks: 0.15, entropia: 2.97095059445467,
    montecarlo: 0.858407346410207, distancia: 2.43121693121693, series: 42.8421052631579,
  },
  'fixtures/cuadratico.xlsx': {
    promedios: 0.968245836551854, frecuencias: 30, ks: 0.25, entropia: 2,
    montecarlo: 1.14159265358979, distancia: 14.7345679012346, series: 100.736842105263,
  },
};

describe('auditoría de R_i (réplica de la plantilla)', () => {
  it.each(Object.keys(REF))('%s coincide con las fórmulas de la plantilla', (file) => {
    const seq = load(file);
    const a = computeAudit(seq.values);
    for (const [k, v] of Object.entries(REF[file])) expect(a.stat[k as AuditKey]).toBeCloseTo(v, 10);
  });

  it('lee el panel de la plantilla (nombres, críticos y sentido de la comparación)', () => {
    const seq = load('../../public/plantilla_simulacion.xlsx');
    expect(seq.audit).toEqual(DEFAULT_AUDIT);
  });

  it('veredictos como la plantilla (mixto: entropía, π y series rechazadas)', () => {
    const seq = load('fixtures/mixto.xlsx');
    const a = computeAudit(seq.values);
    const verdict = Object.fromEntries(DEFAULT_AUDIT.map((s) => [s.key, passes(s, a.stat[s.key], a.n)]));
    expect(verdict).toEqual({
      promedios: true, frecuencias: true, ks: true, entropia: false, montecarlo: false, distancia: true, series: false,
    });
    expect(criticalOf(DEFAULT_AUDIT[2], 20)).toBeCloseTo(0.304105244939971, 12);
  });
});
