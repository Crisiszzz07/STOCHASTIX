import { createPrng, type GeneratorConfig, type GeneratorMethod } from './generators';

export const EPS = 1e-12;

/**
 * Fuente de uniformes consumida por los métodos de generación de variables.
 * `next()` devuelve null cuando una secuencia manual se agota (OVERFLOW).
 */
export interface UniformSource {
  next(): number | null;
  readonly consumed: number;
  readonly wraps: number;
}

export function arraySource(values: readonly number[], wrap: boolean): UniformSource {
  let i = 0;
  let consumed = 0;
  let wraps = 0;
  return {
    next() {
      if (values.length === 0) return null;
      if (i >= values.length) {
        if (!wrap) return null;
        i = 0;
        wraps++;
      }
      consumed++;
      return values[i++];
    },
    get consumed() {
      return consumed;
    },
    get wraps() {
      return wraps;
    },
  };
}

export function prngSource(method: GeneratorMethod, cfg: GeneratorConfig): UniformSource {
  const prng = createPrng(method, cfg);
  let consumed = 0;
  return {
    next() {
      consumed++;
      return prng.next().r;
    },
    get consumed() {
      return consumed;
    },
    wraps: 0,
  };
}

/** Lleva U a (EPS, 1-EPS). Se usa sólo donde se toma un logaritmo. */
export function openUnit(u: number): number {
  if (!Number.isFinite(u)) return 0.5;
  return Math.min(1 - EPS, Math.max(EPS, u));
}

/** -ln(U) seguro: siempre finito y positivo. */
export function negLog(u: number): number {
  return -Math.log(openUnit(u));
}
