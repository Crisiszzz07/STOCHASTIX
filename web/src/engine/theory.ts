/**
 * Funciones teóricas (masa/densidad y distribución acumulada).
 * Todo en espacio logarítmico cuando hay factoriales, para evitar overflow/underflow.
 */

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** ln Γ(z) por aproximación de Lanczos (g=7). */
export function lgamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) x += LANCZOS[i] / (z + i + 1);
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export const lfact = (n: number) => lgamma(n + 1);

/** erfc con ajuste de Chebyshev (Numerical Recipes), error relativo < 1.2e-7. */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z - 1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
        t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

// ---------- Binomial ----------
export function binomPmf(k: number, n: number, p: number): number {
  if (!Number.isInteger(k) || k < 0 || k > n) return 0;
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(lfact(n) - lfact(k) - lfact(n - k) + k * Math.log(p) + (n - k) * Math.log1p(-p));
}
export function binomCdf(x: number, n: number, p: number): number {
  const k = Math.floor(x);
  if (k < 0) return 0;
  if (k >= n) return 1;
  let s = 0;
  for (let i = 0; i <= k; i++) s += binomPmf(i, n, p);
  return Math.min(1, s);
}

// ---------- Poisson ----------
export function poissonPmf(k: number, lambda: number): number {
  if (!Number.isInteger(k) || k < 0) return 0;
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(k * Math.log(lambda) - lambda - lfact(k));
}
export function poissonCdf(x: number, lambda: number): number {
  const k = Math.floor(x);
  if (k < 0) return 0;
  let s = 0;
  for (let i = 0; i <= k; i++) {
    s += poissonPmf(i, lambda);
    if (s >= 1) return 1;
  }
  return Math.min(1, s);
}

// ---------- Normal ----------
export function normalPdf(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return 0;
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}
export function normalCdf(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return x < mu ? 0 : 1;
  return 0.5 * erfc(-(x - mu) / (sigma * Math.SQRT2));
}

// ---------- Erlang ----------
export function erlangPdf(x: number, k: number, lambda: number): number {
  if (x < 0 || lambda <= 0) return 0;
  if (x === 0) return k === 1 ? lambda : 0;
  return Math.exp(k * Math.log(lambda) + (k - 1) * Math.log(x) - lambda * x - lfact(k - 1));
}
export function erlangCdf(x: number, k: number, lambda: number): number {
  if (x <= 0 || lambda <= 0) return 0;
  // F(x) = 1 - Σ_{j=0}^{k-1} e^{-λx}(λx)^j / j!
  const lx = lambda * x;
  let term = Math.exp(-lx);
  let s = term;
  for (let j = 1; j < k; j++) {
    term *= lx / j;
    s += term;
  }
  return Math.max(0, Math.min(1, 1 - s));
}
