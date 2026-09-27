/**
 * Generadores pseudoaleatorios U(0,1).
 * Replican exactamente los 5 métodos de https://simulacion-trabajo.vercel.app/
 * (y las fórmulas que su exportación a Excel escribe en la columna X_i).
 * Se usa BigInt en las congruenciales para que a·X + c nunca pierda precisión.
 */

export type GeneratorMethod = 'mixto' | 'multiplicativo' | 'cuadratico' | 'bbs' | 'xorshift';

export type GeneratorConfig = Record<string, number>;

export interface GeneratorParamSpec {
  key: string;
  label: string;
  min: number;
}

export interface GeneratorSpec {
  key: GeneratorMethod;
  label: string;
  /** Nombre de la hoja en el Excel exportado por simulacion-trabajo */
  sheetName: string;
  formula: string;
  params: GeneratorParamSpec[];
  defaults: GeneratorConfig;
}

export const GENERATORS: Record<GeneratorMethod, GeneratorSpec> = {
  mixto: {
    key: 'mixto',
    label: 'Lineal Mixto',
    sheetName: 'Lineal Mixto',
    formula: 'X[n+1] = (a·X[n] + c) mod m',
    params: [
      { key: 'seed', label: 'X0', min: 0 },
      { key: 'a', label: 'a', min: 1 },
      { key: 'c', label: 'c', min: 0 },
      { key: 'm', label: 'm', min: 2 },
    ],
    // glibc / ANSI C: periodo completo 2^31 (cumple Hull-Dobell)
    defaults: { seed: 12345, a: 1103515245, c: 12345, m: 2147483648 },
  },
  multiplicativo: {
    key: 'multiplicativo',
    label: 'Multiplicativo',
    sheetName: 'Multiplicativo',
    formula: 'X[n+1] = (a·X[n]) mod m',
    params: [
      { key: 'seed', label: 'X0', min: 1 },
      { key: 'a', label: 'a', min: 1 },
      { key: 'm', label: 'm', min: 2 },
    ],
    // Park-Miller "minimal standard"
    defaults: { seed: 12345, a: 16807, m: 2147483647 },
  },
  cuadratico: {
    key: 'cuadratico',
    label: 'Cuadrático',
    sheetName: 'Cuadrático',
    formula: 'X[n+1] = (d·X[n]² + a·X[n] + c) mod m',
    params: [
      { key: 'seed', label: 'X0', min: 0 },
      { key: 'd', label: 'd', min: 0 },
      { key: 'a', label: 'a', min: 0 },
      { key: 'c', label: 'c', min: 0 },
      { key: 'm', label: 'm', min: 2 },
    ],
    defaults: { seed: 4, d: 2, a: 5, c: 7, m: 1048576 },
  },
  bbs: {
    key: 'bbs',
    label: 'Blum Blum Shub',
    sheetName: 'Blum Blum Shub',
    formula: 'X[n+1] = X[n]² mod (p·q) ; R = X/M',
    params: [
      { key: 'seed', label: 'X0', min: 2 },
      { key: 'p', label: 'p', min: 3 },
      { key: 'q', label: 'q', min: 3 },
    ],
    defaults: { seed: 3, p: 30011, q: 40031 },
  },
  xorshift: {
    key: 'xorshift',
    label: 'Xorshift',
    sheetName: 'Xorshift',
    formula: 'x^=x<<a ; x^=x>>b ; x^=x<<c',
    params: [
      { key: 'seed', label: 'X0', min: 1 },
      { key: 'a', label: 'a', min: 1 },
      { key: 'b', label: 'b', min: 1 },
      { key: 'c', label: 'c', min: 1 },
    ],
    defaults: { seed: 123456789, a: 13, b: 17, c: 5 },
  },
};

export const GENERATOR_LIST = Object.values(GENERATORS);

export interface GeneratorStep {
  x: number;
  r: number;
}

export interface Prng {
  next(): GeneratorStep;
}

const big = (v: number) => BigInt(Math.trunc(Number.isFinite(v) ? v : 0));
const bmod = (v: bigint, m: bigint) => ((v % m) + m) % m;

/** Devuelve la lista de errores de configuración (vacía si es válida). */
export function validateGenerator(method: GeneratorMethod, cfg: GeneratorConfig): string[] {
  const errs: string[] = [];
  for (const p of GENERATORS[method].params) {
    const v = cfg[p.key];
    if (!Number.isFinite(v) || !Number.isInteger(v)) errs.push(`${p.label} debe ser entero`);
    else if (v < p.min) errs.push(`${p.label} ≥ ${p.min}`);
  }
  if (method === 'xorshift') {
    for (const k of ['a', 'b', 'c']) if (cfg[k] > 31) errs.push(`${k} ≤ 31`);
    if ((cfg.seed >>> 0) === 0) errs.push('X0 ≠ 0 (estado nulo absorbente)');
  }
  if ((method === 'mixto' || method === 'multiplicativo' || method === 'cuadratico') && cfg.seed >= cfg.m) {
    errs.push('X0 < m');
  }
  return errs;
}

export function createPrng(method: GeneratorMethod, cfg: GeneratorConfig): Prng {
  switch (method) {
    case 'mixto':
    case 'multiplicativo':
    case 'cuadratico': {
      const m = big(cfg.m);
      const a = big(cfg.a);
      const c = method === 'multiplicativo' ? 0n : big(cfg.c);
      const d = method === 'cuadratico' ? big(cfg.d) : 0n;
      const mNum = Number(m);
      let x = bmod(big(cfg.seed), m);
      return {
        next() {
          x = bmod(d * x * x + a * x + c, m);
          const xn = Number(x);
          return { x: xn, r: xn / mNum };
        },
      };
    }
    case 'bbs': {
      const M = big(cfg.M ?? cfg.p * cfg.q);
      const mNum = Number(M);
      let x = bmod(big(cfg.seed), M);
      return {
        next() {
          x = bmod(x * x, M);
          const xn = Number(x);
          return { x: xn, r: xn / mNum };
        },
      };
    }
    case 'xorshift': {
      let x = cfg.seed >>> 0;
      const { a, b, c } = cfg;
      return {
        next() {
          x = (x ^ (x << a)) >>> 0;
          x = (x ^ (x >>> b)) >>> 0;
          x = (x ^ (x << c)) >>> 0;
          return { x, r: x / 4294967295 };
        },
      };
    }
  }
}

export interface GeneratedSequence {
  x: number[];
  r: number[];
  /** índice (0-based) del primer X repetido, o null si no se detectó ciclo */
  cycleAt: number | null;
}

export function generateSequence(method: GeneratorMethod, cfg: GeneratorConfig, n: number): GeneratedSequence {
  const prng = createPrng(method, cfg);
  const x: number[] = [];
  const r: number[] = [];
  const seen = new Set<number>();
  let cycleAt: number | null = null;
  for (let i = 0; i < n; i++) {
    const s = prng.next();
    if (cycleAt === null && seen.has(s.x)) cycleAt = i;
    if (cycleAt === null) seen.add(s.x);
    x.push(s.x);
    r.push(s.r);
  }
  return { x, r, cycleAt };
}

function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

function primeFactors(n: bigint): bigint[] {
  const out: bigint[] = [];
  let d = 2n;
  while (d * d <= n && d < 1_000_000n) {
    if (n % d === 0n) {
      out.push(d);
      while (n % d === 0n) n /= d;
    }
    d += d === 2n ? 1n : 2n;
  }
  if (n > 1n) out.push(n);
  return out;
}

/** Teorema de Hull-Dobell: el LCG mixto alcanza periodo completo m. */
export function hullDobell(cfg: GeneratorConfig): boolean {
  const m = big(cfg.m), a = big(cfg.a), c = big(cfg.c);
  if (m < 2n || c === 0n) return false;
  if (gcd(c, m) !== 1n) return false;
  for (const p of primeFactors(m)) if ((a - 1n) % p !== 0n) return false;
  if (m % 4n === 0n && (a - 1n) % 4n !== 0n) return false;
  return true;
}
