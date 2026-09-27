import type { DistSpec, Params } from './distributions';

export interface Bin {
  lo: number;
  hi: number;
  /** valor representativo (entero en discretas, centro en continuas) */
  center: number;
  count: number;
  rel: number;
  /** alto a dibujar: frecuencia relativa (discretas) o densidad (continuas) */
  height: number;
  expected: number;
  expectedRel: number;
}

export interface Histogram {
  bins: Bin[];
  xMin: number;
  xMax: number;
  discrete: boolean;
  outOfRange: number;
}

export function buildHistogram(values: readonly number[], dist: DistSpec, p: Params, binCount: number): Histogram {
  const N = values.length;
  let [dMin, dMax] = dist.domain(p);
  let sMin = Infinity;
  let sMax = -Infinity;
  for (const v of values) {
    if (v < sMin) sMin = v;
    if (v > sMax) sMax = v;
  }
  if (N > 0) {
    dMin = Math.min(dMin, sMin);
    dMax = Math.max(dMax, sMax);
  }

  if (dist.discrete) {
    const lo = Math.floor(dMin);
    const hi = Math.max(lo, Math.ceil(dMax));
    const counts = new Map<number, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    const bins: Bin[] = [];
    for (let k = lo; k <= hi; k++) {
      const count = counts.get(k) ?? 0;
      const pk = dist.density(k, p);
      bins.push({
        lo: k - 0.5,
        hi: k + 0.5,
        center: k,
        count,
        rel: N ? count / N : 0,
        height: N ? count / N : 0,
        expected: N * pk,
        expectedRel: pk,
      });
    }
    return { bins, xMin: lo - 0.5, xMax: hi + 0.5, discrete: true, outOfRange: 0 };
  }

  const nb = Math.max(1, Math.min(200, Math.round(binCount)));
  if (!(dMax > dMin)) dMax = dMin + 1;
  const width = (dMax - dMin) / nb;
  const counts = new Array<number>(nb).fill(0);
  let outOfRange = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) {
      outOfRange++;
      continue;
    }
    let idx = Math.floor((v - dMin) / width);
    if (idx === nb) idx = nb - 1; // incluye el máximo en la última clase
    if (idx < 0 || idx >= nb) outOfRange++;
    else counts[idx]++;
  }
  const bins: Bin[] = counts.map((count, i) => {
    const lo = dMin + i * width;
    const hi = lo + width;
    const pr = Math.max(0, dist.cdf(hi, p) - dist.cdf(lo, p));
    return {
      lo,
      hi,
      center: (lo + hi) / 2,
      count,
      rel: N ? count / N : 0,
      height: N ? count / (N * width) : 0,
      expected: N * pr,
      expectedRel: pr,
    };
  });
  return { bins, xMin: dMin, xMax: dMax, discrete: false, outOfRange };
}

/** Regla de Sturges acotada a [5, 60]. */
export function sturges(n: number): number {
  return Math.max(5, Math.min(60, Math.ceil(Math.log2(Math.max(1, n)) + 1)));
}

export interface SampleStats {
  n: number;
  mean: number;
  variance: number;
  min: number;
  max: number;
}

export function sampleStats(values: readonly number[]): SampleStats {
  const n = values.length;
  if (n === 0) return { n, mean: NaN, variance: NaN, min: NaN, max: NaN };
  let mean = 0;
  let m2 = 0;
  let min = Infinity;
  let max = -Infinity;
  values.forEach((x, i) => {
    // Welford: estable numéricamente
    const d = x - mean;
    mean += d / (i + 1);
    m2 += d * (x - mean);
    if (x < min) min = x;
    if (x > max) max = x;
  });
  return { n, mean, variance: n > 1 ? m2 / (n - 1) : 0, min, max };
}

/** χ² de bondad de ajuste, agrupando clases contiguas hasta que la esperada sea ≥ 5. */
export function chiSquare(h: Histogram): { stat: number; df: number; classes: number } {
  const groups: { o: number; e: number }[] = [];
  let o = 0;
  let e = 0;
  for (const b of h.bins) {
    o += b.count;
    e += b.expected;
    if (e >= 5) {
      groups.push({ o, e });
      o = 0;
      e = 0;
    }
  }
  if (groups.length && (o > 0 || e > 0)) {
    groups[groups.length - 1].o += o;
    groups[groups.length - 1].e += e;
  }
  const stat = groups.reduce((s, g) => s + (g.o - g.e) ** 2 / g.e, 0);
  return { stat, df: Math.max(1, groups.length - 1), classes: groups.length };
}
