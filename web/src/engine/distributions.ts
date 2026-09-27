import {
  binomCdf, binomPmf, erlangCdf, erlangPdf, normalCdf, normalPdf, poissonCdf, poissonPmf,
} from './theory';
import { EPS, negLog, openUnit, type UniformSource } from './uniform';

export type DistKey = 'binomial' | 'poisson' | 'normal' | 'erlang';
export type Params = Record<string, number>;

export interface ParamSpec {
  key: string;
  label: string;
  symbol: string;
  min: number;
  max: number;
  step: number;
  integer: boolean;
  default: number;
}

export interface MethodSpec {
  key: string;
  label: string;
  formula: string;
  note: string;
  /** Uniformes consumidas por variable (texto) */
  cost: (p: Params) => string;
}

export interface DistSpec {
  key: DistKey;
  label: string;
  notation: (p: Params) => string;
  discrete: boolean;
  params: ParamSpec[];
  methods: MethodSpec[];
  mean: (p: Params) => number;
  variance: (p: Params) => number;
  /** masa (discreta) o densidad (continua) */
  density: (x: number, p: Params) => number;
  cdf: (x: number, p: Params) => number;
  /** rango razonable del eje X */
  domain: (p: Params) => [number, number];
  validate: (p: Params) => string[];
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, ''));

export const DISTRIBUTIONS: Record<DistKey, DistSpec> = {
  binomial: {
    key: 'binomial',
    label: 'Binomial',
    notation: (p) => `B(n=${fmt(p.n)}, p=${fmt(p.p)})`,
    discrete: true,
    params: [
      { key: 'n', label: 'Ensayos', symbol: 'n', min: 1, max: 500, step: 1, integer: true, default: 10 },
      { key: 'p', label: 'Prob. éxito', symbol: 'p', min: 0, max: 1, step: 0.01, integer: false, default: 0.3 },
    ],
    methods: [
      {
        key: 'bernoulli',
        label: 'Suma Bernoulli',
        formula: 'X = Σ_{j=1..n} [ R_j < p ]',
        note: 'Cada ensayo consume una R: éxito si R < p.',
        cost: (p) => `${p.n} U / var`,
      },
      {
        key: 'inverse',
        label: 'Transformada inversa',
        formula: 'X = min{ k : F(k) ≥ R }',
        note: 'Recorre la FDA acumulando p(k) hasta superar R.',
        cost: () => '1 U / var',
      },
    ],
    mean: (p) => p.n * p.p,
    variance: (p) => p.n * p.p * (1 - p.p),
    density: (x, p) => binomPmf(x, p.n, p.p),
    cdf: (x, p) => binomCdf(x, p.n, p.p),
    domain: (p) => {
      const mu = p.n * p.p;
      const sd = Math.sqrt(p.n * p.p * (1 - p.p));
      return [Math.max(0, Math.floor(mu - 5 * sd) - 1), Math.min(p.n, Math.ceil(mu + 5 * sd) + 1)];
    },
    validate: (p) => {
      const e: string[] = [];
      if (!Number.isInteger(p.n) || p.n < 1 || p.n > 500) e.push('n ∈ {1..500}');
      if (!(p.p >= 0 && p.p <= 1)) e.push('p ∈ [0,1]');
      return e;
    },
  },
  poisson: {
    key: 'poisson',
    label: 'Poisson',
    notation: (p) => `Poisson(λ=${fmt(p.lambda)})`,
    discrete: true,
    params: [
      { key: 'lambda', label: 'Media ocurrencias', symbol: 'λ', min: 0.1, max: 100, step: 0.1, integer: false, default: 4 },
    ],
    methods: [
      {
        key: 'arrivals',
        label: 'Llegadas exponenciales',
        formula: 'X = max{ k : Σ_{i=1..k} −ln(R_i)/λ ≤ T=1 }',
        note: 'Acumula tiempos inter-arribo hasta superar T = 1.',
        cost: (p) => `≈${fmt(p.lambda + 1)} U / var`,
      },
      {
        key: 'inverse',
        label: 'Transformada inversa',
        formula: 'X = min{ k : F(k) ≥ R }',
        note: 'Recorre la FDA de Poisson hasta superar R.',
        cost: () => '1 U / var',
      },
    ],
    mean: (p) => p.lambda,
    variance: (p) => p.lambda,
    density: (x, p) => poissonPmf(x, p.lambda),
    cdf: (x, p) => poissonCdf(x, p.lambda),
    domain: (p) => [0, Math.ceil(p.lambda + 5 * Math.sqrt(p.lambda) + 3)],
    validate: (p) => (p.lambda > 0 && p.lambda <= 100 ? [] : ['λ ∈ (0,100]']),
  },
  normal: {
    key: 'normal',
    label: 'Normal',
    notation: (p) => `N(μ=${fmt(p.mu)}, σ=${fmt(p.sigma)})`,
    discrete: false,
    params: [
      { key: 'mu', label: 'Media', symbol: 'μ', min: -100, max: 100, step: 0.1, integer: false, default: 0 },
      { key: 'sigma', label: 'Desv. estándar', symbol: 'σ', min: 0.01, max: 50, step: 0.01, integer: false, default: 1 },
    ],
    methods: [
      {
        key: 'boxmuller',
        label: 'Box-Muller',
        formula: 'Z₀ = √(−2 ln R₁)·cos(2πR₂) ; Z₁ = √(−2 ln R₁)·sin(2πR₂) ; X = μ + σZ',
        note: 'Cada par (R₁,R₂) produce dos normales independientes.',
        cost: () => '1 U / var',
      },
      {
        key: 'tcl12',
        label: 'TCL n=12',
        formula: 'X = μ + σ·( Σ_{i=1..12} R_i − 6 )',
        note: 'Convolución de 12 uniformes: media 6, varianza 1.',
        cost: () => '12 U / var',
      },
    ],
    mean: (p) => p.mu,
    variance: (p) => p.sigma * p.sigma,
    density: (x, p) => normalPdf(x, p.mu, p.sigma),
    cdf: (x, p) => normalCdf(x, p.mu, p.sigma),
    domain: (p) => [p.mu - 4 * p.sigma, p.mu + 4 * p.sigma],
    validate: (p) => {
      const e: string[] = [];
      if (!Number.isFinite(p.mu)) e.push('μ numérico');
      if (!(p.sigma > 0)) e.push('σ > 0');
      return e;
    },
  },
  erlang: {
    key: 'erlang',
    label: 'Erlang',
    notation: (p) => `Erlang(k=${fmt(p.k)}, λ=${fmt(p.lambda)})`,
    discrete: false,
    params: [
      { key: 'k', label: 'Fase', symbol: 'k', min: 1, max: 50, step: 1, integer: true, default: 3 },
      { key: 'lambda', label: 'Tasa', symbol: 'λ', min: 0.01, max: 50, step: 0.01, integer: false, default: 1 },
    ],
    methods: [
      {
        key: 'convolution',
        label: 'Convolución exp.',
        formula: 'X = −(1/λ)·ln( Π_{i=1..k} R_i ) = −(1/λ)·Σ ln(R_i)',
        note: 'Suma de k exponenciales independientes de tasa λ.',
        cost: (p) => `${p.k} U / var`,
      },
    ],
    mean: (p) => p.k / p.lambda,
    variance: (p) => p.k / (p.lambda * p.lambda),
    density: (x, p) => erlangPdf(x, p.k, p.lambda),
    cdf: (x, p) => erlangCdf(x, p.k, p.lambda),
    domain: (p) => [0, (p.k + 5 * Math.sqrt(p.k) + 1) / p.lambda],
    validate: (p) => {
      const e: string[] = [];
      if (!Number.isInteger(p.k) || p.k < 1 || p.k > 50) e.push('k ∈ {1..50}');
      if (!(p.lambda > 0)) e.push('λ > 0');
      return e;
    },
  },
};

export const DIST_LIST = Object.values(DISTRIBUTIONS);

export function defaultParams(key: DistKey): Params {
  return Object.fromEntries(DISTRIBUTIONS[key].params.map((p) => [p.key, p.default]));
}

// ---------------------------------------------------------------------------
// Simulación
// ---------------------------------------------------------------------------

export interface Sample {
  i: number;
  /** uniformes consumidas para producir esta variable */
  rs: number[];
  x: number;
}

export interface SimResult {
  samples: Sample[];
  values: number[];
  requested: number;
  /** la fuente manual se agotó antes de completar N */
  overflow: boolean;
  consumed: number;
  /** uniformes en la frontera {0,1} que se tuvieron que ajustar a (0,1) */
  clamped: number;
}

const MAX_POISSON_EVENTS = 100_000;

/** Tabla acumulada F(0..kMax) para la transformada inversa discreta. */
function cdfTable(pmf: (k: number) => number, kMax: number): Float64Array {
  const t = new Float64Array(kMax + 1);
  let F = 0;
  for (let k = 0; k <= kMax; k++) {
    F += pmf(k);
    t[k] = F;
  }
  return t;
}

/** min{ k : F(k) ≥ u } por búsqueda binaria (equivale a recorrer la FDA desde 0). */
function inverseDiscrete(u: number, table: Float64Array): number {
  let lo = 0;
  let hi = table.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (table[mid] >= u) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function simulate(
  dist: DistKey,
  method: string,
  params: Params,
  source: UniformSource,
  N: number,
): SimResult {
  const samples: Sample[] = [];
  let overflow = false;
  let clamped = 0;
  const take = (): number | null => {
    const u = source.next();
    if (u === null) return null;
    if (u < EPS || u > 1 - EPS) clamped++;
    return u;
  };

  let table: Float64Array | null = null;
  if (method === 'inverse' && dist === 'binomial') {
    table = cdfTable((k) => binomPmf(k, params.n, params.p), params.n);
  } else if (method === 'inverse' && dist === 'poisson') {
    const kMax = Math.ceil(params.lambda + 20 * Math.sqrt(params.lambda) + 50);
    table = cdfTable((k) => poissonPmf(k, params.lambda), kMax);
  }

  outer: while (samples.length < N) {
    const i = samples.length + 1;
    switch (dist) {
      case 'binomial': {
        const { n, p } = params;
        if (method === 'inverse') {
          const u = take();
          if (u === null) break outer;
          samples.push({ i, rs: [u], x: inverseDiscrete(u, table!) });
        } else {
          const rs: number[] = [];
          let x = 0;
          for (let j = 0; j < n; j++) {
            const u = take();
            if (u === null) break outer;
            rs.push(u);
            if (u < p) x++;
          }
          samples.push({ i, rs, x });
        }
        break;
      }
      case 'poisson': {
        const { lambda } = params;
        if (method === 'inverse') {
          const u = take();
          if (u === null) break outer;
          samples.push({ i, rs: [u], x: inverseDiscrete(u, table!) });
        } else {
          const rs: number[] = [];
          let t = 0;
          let x = 0;
          while (x < MAX_POISSON_EVENTS) {
            const u = take();
            if (u === null) break outer;
            rs.push(u);
            t += negLog(u) / lambda;
            if (t > 1) break;
            x++;
          }
          samples.push({ i, rs, x });
        }
        break;
      }
      case 'normal': {
        const { mu, sigma } = params;
        if (method === 'tcl12') {
          const rs: number[] = [];
          for (let j = 0; j < 12; j++) {
            const u = take();
            if (u === null) break outer;
            rs.push(u);
          }
          const s = rs.reduce((a, b) => a + b, 0);
          samples.push({ i, rs, x: mu + sigma * (s - 6) });
        } else {
          const u1 = take();
          const u2 = u1 === null ? null : take();
          if (u1 === null || u2 === null) break outer;
          const radius = Math.sqrt(-2 * Math.log(openUnit(u1)));
          const theta = 2 * Math.PI * u2;
          samples.push({ i, rs: [u1, u2], x: mu + sigma * radius * Math.cos(theta) });
          if (samples.length < N) {
            samples.push({ i: i + 1, rs: [u1, u2], x: mu + sigma * radius * Math.sin(theta) });
          }
        }
        break;
      }
      case 'erlang': {
        const { k, lambda } = params;
        const rs: number[] = [];
        let s = 0;
        for (let j = 0; j < k; j++) {
          const u = take();
          if (u === null) break outer;
          rs.push(u);
          s += negLog(u);
        }
        samples.push({ i, rs, x: s / lambda });
        break;
      }
    }
  }
  if (samples.length < N) overflow = true;

  return {
    samples,
    values: samples.map((s) => s.x),
    requested: N,
    overflow,
    consumed: source.consumed,
    clamped,
  };
}

/** Uniformes esperadas por variable generada (para dimensionar secuencias externas). */
export function uniformsPerVariable(dist: DistKey, method: string, p: Params): number {
  switch (dist) {
    case 'binomial':
      return method === 'inverse' ? 1 : p.n;
    case 'poisson':
      return method === 'inverse' ? 1 : p.lambda + 1;
    case 'normal':
      return method === 'tcl12' ? 12 : 1;
    case 'erlang':
      return p.k;
  }
}
