import type { DistSpec, Params } from './distributions';

export type QueryMode = 'left' | 'right' | 'interval';

export interface Query {
  mode: QueryMode;
  /** umbral para cola izquierda / derecha */
  k: number;
  /** true: desigualdad estricta (<, >); false: (≤, ≥) */
  strict: boolean;
  a: number;
  b: number;
  aStrict: boolean;
  bStrict: boolean;
}

export function describeQuery(q: Query): string {
  switch (q.mode) {
    case 'left':
      return `P(X ${q.strict ? '<' : '≤'} ${fmtNum(q.k)})`;
    case 'right':
      return `P(X ${q.strict ? '>' : '≥'} ${fmtNum(q.k)})`;
    case 'interval':
      return `P(${fmtNum(q.a)} ${q.aStrict ? '<' : '≤'} X ${q.bStrict ? '<' : '≤'} ${fmtNum(q.b)})`;
  }
}

export function fmtNum(v: number, d = 4): string {
  if (!Number.isFinite(v)) return '—';
  if (Number.isInteger(v)) return String(v);
  return Number(v.toFixed(d)).toString();
}

export function satisfies(x: number, q: Query): boolean {
  switch (q.mode) {
    case 'left':
      return q.strict ? x < q.k : x <= q.k;
    case 'right':
      return q.strict ? x > q.k : x >= q.k;
    case 'interval':
      return (q.aStrict ? x > q.a : x >= q.a) && (q.bStrict ? x < q.b : x <= q.b);
  }
}

/** Probabilidad teórica exacta de la condición. */
export function theoreticalProbability(q: Query, dist: DistSpec, p: Params): number {
  const F = (x: number) => dist.cdf(x, p);
  // Para discretas: P(X < t) = F(⌈t⌉ − 1); P(X ≤ t) = F(⌊t⌋). En continuas coinciden.
  const lt = (t: number) => (dist.discrete ? F(Math.ceil(t) - 1) : F(t));
  const le = (t: number) => (dist.discrete ? F(Math.floor(t)) : F(t));
  let prob: number;
  switch (q.mode) {
    case 'left':
      prob = q.strict ? lt(q.k) : le(q.k);
      break;
    case 'right':
      prob = 1 - (q.strict ? le(q.k) : lt(q.k));
      break;
    case 'interval': {
      if (q.b < q.a) return 0;
      const upper = q.bStrict ? lt(q.b) : le(q.b);
      const lower = q.aStrict ? le(q.a) : lt(q.a);
      prob = upper - lower;
      break;
    }
  }
  return Math.min(1, Math.max(0, prob));
}

export interface QueryResult {
  favorable: number;
  total: number;
  simulated: number;
  theoretical: number;
  /** error relativo en %, null si la teórica es 0 */
  relError: number | null;
  absError: number;
  validated: boolean;
}

export function evaluateQuery(values: readonly number[], q: Query, dist: DistSpec, p: Params): QueryResult {
  let favorable = 0;
  for (const x of values) if (satisfies(x, q)) favorable++;
  
  const total = values.length;
  const simulated = total ? favorable / total : 0;
  const theoretical = theoreticalProbability(q, dist, p);
  const absError = Math.abs(simulated - theoretical);
  
  // CÁLCULO DEL INTERVALO DE CONFIANZA (95%)
  let validated = false;
  if (total > 0) {
    const z = 1.96; // Valor Z para el 95% de confianza
    // Margen de error = Z * sqrt( p * (1 - p) / N )
    const margin = z * Math.sqrt((simulated * (1 - simulated)) / total);
    
    const lowerBound = simulated - margin;
    const upperBound = simulated + margin;
    
    // Si la teórica cae dentro del intervalo de la simulada, está validado
    validated = (theoretical >= lowerBound && theoretical <= upperBound);
  }

  return {
    favorable,
    total,
    simulated,
    theoretical,
    absError,
    relError: theoretical > 0 ? (absError / theoretical) * 100 : null,
    validated, // Retornamos el veredicto
  };
}
