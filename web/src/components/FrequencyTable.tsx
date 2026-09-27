import { chiSquare, type Histogram } from '../engine/histogram';
import { fmtNum, satisfies, type Query } from '../engine/query';
import { Sticker } from './ui';

/** Valor crítico χ²(α=0.05, gl) por la aproximación de Wilson-Hilferty. */
function chiCritical(df: number): number {
  const z = 1.6448536;
  const a = 2 / (9 * df);
  return df * (1 - a + z * Math.sqrt(a)) ** 3;
}

export function FrequencyTable({ hist, query }: { hist: Histogram; query: Query }) {
  const N = hist.bins.reduce((s, b) => s + b.count, 0);
  const chi = chiSquare(hist);
  const crit = chiCritical(chi.df);
  const pass = chi.stat < crit;
  let acc = 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
        <span className="font-extrabold">
          χ²₀ = {chi.stat.toFixed(3)} · gl = {chi.df} · χ²₀.₀₅ ≈ {crit.toFixed(3)}
        </span>
        {N > 0 && (
          <Sticker tone={pass ? 'green' : 'red'} rot={pass ? 2 : -3}>
            {pass ? 'Ajuste aceptado' : 'REJECTED H₀'}
          </Sticker>
        )}
      </div>
      <div className="brut brut-scroll max-h-[420px] overflow-auto bg-paper">
        <table className="w-full border-collapse font-mono text-xs">
          <thead className="sticky top-0 z-10 bg-ink text-bg">
            <tr>
              {['Clase', 'fo', 'fr', 'Fr acum.', 'fe', 'P teórica'].map((h) => (
                <th key={h} className="border-b-4 border-ink px-2 py-2 text-left font-display text-[11px] uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hist.bins.map((b) => {
              acc += b.rel;
              const hit = hist.discrete
                ? satisfies(b.center, query)
                : satisfies(b.lo, query) && satisfies(b.hi, query);
              const partial = !hist.discrete && !hit && (satisfies(b.lo, query) || satisfies(b.hi, query));
              return (
                <tr
                  key={b.lo}
                  className={`border-b-2 border-ink/20 ${hit ? 'bg-yellow text-black' : partial ? 'bg-yellow/40' : ''}`}
                >
                  <td className="px-2 py-1 font-bold whitespace-nowrap">
                    {hist.discrete ? b.center : `[${fmtNum(b.lo, 3)}, ${fmtNum(b.hi, 3)})`}
                  </td>
                  <td className="px-2 py-1">{b.count}</td>
                  <td className="px-2 py-1">{b.rel.toFixed(4)}</td>
                  <td className="px-2 py-1">{Math.min(1, acc).toFixed(4)}</td>
                  <td className="px-2 py-1">{b.expected.toFixed(2)}</td>
                  <td className="px-2 py-1">{b.expectedRel.toFixed(4)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
