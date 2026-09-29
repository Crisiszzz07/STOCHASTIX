/**
 * Auditoría estadística de los R_i: réplica exacta del panel «🛡️ AUDITORÍA ESTADÍSTICA»
 * de la plantilla Excel de simulacion-trabajo y de las fórmulas de su hoja «Auxiliares».
 */

export type AuditKey = 'promedios' | 'frecuencias' | 'ks' | 'entropia' | 'montecarlo' | 'distancia' | 'series';

/** Cómo aparece cada prueba en el panel de la plantilla. */
export interface AuditSpec {
  key: AuditKey;
  name: string;
  /** valor crítico fijo, o null si depende de N (Kolmogorov-Smirnov: 1.36/√N) */
  critical: number | null;
  /** el estadístico aprueba si es menor ('<') o mayor ('>') que el crítico */
  op: '<' | '>';
}

/** Panel por defecto (idéntico en las 5 exportaciones de simulacion-trabajo). */
export const DEFAULT_AUDIT: AuditSpec[] = [
  { key: 'promedios', name: 'Promedios (Z_0)', critical: 1.96, op: '<' },
  { key: 'frecuencias', name: 'Frecuencias (Chi-cuadrada)', critical: 16.919, op: '<' },
  { key: 'ks', name: 'Kolmogorov-Smirnov (D_n)', critical: null, op: '<' },
  { key: 'entropia', name: 'Entropía de Shannon (Bits)', critical: 3.2, op: '>' },
  { key: 'montecarlo', name: 'Monte Carlo para Pi (Error Absoluto)', critical: 0.15, op: '<' },
  { key: 'distancia', name: 'Distancia (Coss Bu)', critical: 7.81, op: '<' },
  { key: 'series', name: 'Series (Coss Bu)', critical: 36.41, op: '<' },
];

export function auditKeyOf(name: string): AuditKey | null {
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (n.includes('promedio')) return 'promedios';
  if (n.includes('frecuencia')) return 'frecuencias';
  if (n.includes('kolmogorov')) return 'ks';
  if (n.includes('entropia')) return 'entropia';
  if (n.includes('monte carlo') || /\bpi\b/.test(n)) return 'montecarlo';
  if (n.includes('distancia')) return 'distancia';
  if (n.includes('serie')) return 'series';
  return null;
}

/** Constantes del método de Distancia (hoja Auxiliares de la plantilla). */
export const DIST_ALPHA = 0.3;
export const DIST_BETA = 0.7;

export interface AuditDetail {
  n: number;
  // Promedios
  mean: number;
  z0: number;
  // Frecuencias / Entropía (10 clases)
  classes: { lo: number; hi: number; o: number; e: number; chi: number; p: number; h: number }[];
  // Kolmogorov-Smirnov
  sorted: number[];
  // Monte Carlo
  pairs: number;
  hits: number;
  piEst: number;
  // Distancia
  distRows: { r: number; inRange: 0 | 1; active: 0 | 1; counter: number; bucket: number | null }[];
  distBuckets: { label: string; o: number; p: number; e: number; chi: number }[];
  // Series
  seriesBins: { o: number; e: number; d: number }[];
  /** estadístico de cada prueba */
  stat: Record<AuditKey, number>;
}

export function computeAudit(values: readonly number[]): AuditDetail {
  const n = values.length;
  const mean = n ? values.reduce((a, b) => a + b, 0) / n : 0;
  const z0 = n ? ((mean - 0.5) * Math.sqrt(n)) / Math.sqrt(1 / 12) : 0;

  // Frecuencias: clases [k/10, (k+1)/10); la última sólo exige ≥ 0.9 (como la plantilla)
  const classes = Array.from({ length: 10 }, (_, k) => {
    const lo = k / 10;
    const hi = k === 9 ? 1 : (k + 1) / 10;
    const o = values.filter((v) => v >= lo && (k === 9 || v < hi)).length;
    const e = n / 10;
    const p = n ? o / n : 0;
    return { lo, hi, o, e, chi: e > 0 ? (o - e) ** 2 / e : 0, p, h: o > 0 ? -p * Math.log2(p) : 0 };
  });

  // Kolmogorov-Smirnov: D = max |k/N − R(k)|
  const sorted = [...values].sort((a, b) => a - b);
  let ks = 0;
  sorted.forEach((r, k) => (ks = Math.max(ks, Math.abs((k + 1) / n - r))));

  // Monte Carlo para π con pares (R_{2j-1}, R_{2j})
  const pairs = Math.floor(n / 2);
  let hits = 0;
  for (let j = 1; j <= pairs; j++) {
    const x = values[2 * j - 2];
    const y = values[2 * j - 1];
    if (x * x + y * y <= 1) hits++;
  }
  const piEst = pairs === 0 ? 0 : (4 * hits) / pairs;

  // Distancia (Coss Bu): rachas entre aciertos en [α, β]
  const theta = DIST_BETA - DIST_ALPHA;
  const distRows: AuditDetail['distRows'] = [];
  values.forEach((r, i) => {
    const inRange: 0 | 1 = r >= DIST_ALPHA && r <= DIST_BETA ? 1 : 0;
    if (i === 0) {
      distRows.push({ r, inRange, active: inRange, counter: 0, bucket: null });
      return;
    }
    const prev = distRows[i - 1];
    distRows.push({
      r,
      inRange,
      active: prev.active === 1 || inRange === 1 ? 1 : 0,
      counter: inRange === 1 ? 0 : prev.active === 1 ? prev.counter + 1 : 0,
      bucket: inRange === 1 && prev.active === 1 ? Math.min(prev.counter, 3) : null,
    });
  });
  const probs = [theta, theta * (1 - theta), theta * (1 - theta) ** 2, (1 - theta) ** 3];
  const counts = [0, 1, 2, 3].map((b) => distRows.filter((d) => d.bucket === b).length);
  const totalO = counts.reduce((a, b) => a + b, 0);
  const distBuckets = counts.map((o, b) => {
    const e = totalO * probs[b];
    return { label: b === 3 ? '≥3' : String(b), o, p: probs[b], e, chi: e > 0 ? (o - e) ** 2 / e : 0 };
  });

  // Series (Coss Bu): pares solapados (r_i, r_{i+1}) en cuadrícula 5×5
  const bin = (x: number) => Math.min(Math.floor(x * 5), 4);
  const seriesCounts = new Array<number>(25).fill(0);
  for (let i = 0; i + 1 < n; i++) seriesCounts[bin(values[i]) * 5 + bin(values[i + 1])]++;
  const eSeries = (n - 1) / 25;
  const seriesBins = seriesCounts.map((o) => ({ o, e: eSeries, d: (o - eSeries) ** 2 }));
  const seriesChi = (25 / Math.max(n - 1, 1)) * seriesBins.reduce((s, b) => s + b.d, 0);

  return {
    n, mean, z0, classes, sorted, pairs, hits, piEst, distRows, distBuckets, seriesBins,
    stat: {
      promedios: Math.abs(z0),
      frecuencias: classes.reduce((s, c) => s + c.chi, 0),
      ks,
      entropia: classes.reduce((s, c) => s + c.h, 0),
      montecarlo: pairs === 0 ? 0 : Math.abs(piEst - Math.PI),
      distancia: distBuckets.reduce((s, b) => s + b.chi, 0),
      series: seriesChi,
    },
  };
}

export function criticalOf(spec: AuditSpec, n: number): number {
  return spec.critical ?? (n > 0 ? 1.36 / Math.sqrt(n) : 0);
}

export function passes(spec: AuditSpec, stat: number, n: number): boolean {
  const crit = criticalOf(spec, n);
  return spec.op === '<' ? stat < crit : stat > crit;
}
