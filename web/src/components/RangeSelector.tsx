import type { Histogram } from '../engine/histogram';
import type { Query } from '../engine/query';
import { PAD } from './HistogramCanvas';


export function RangeSelector({
  hist,
  query,
  onChange,
}: {
  hist: Histogram;
  query: Query;
  onChange: (q: Query) => void;
}) {
  const discrete = hist.discrete;
  const min = discrete ? hist.bins[0]?.center ?? 0 : hist.xMin;
  const max = discrete ? hist.bins[hist.bins.length - 1]?.center ?? 1 : hist.xMax;
  const step = discrete ? 1 : Number(((max - min) / 500).toPrecision(2));
  const snap = (v: number) => (discrete ? Math.round(v) : Number(v.toPrecision(6)));
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const pos = (v: number) => (max > min ? (Math.min(max, Math.max(min, v)) - min) / (max - min) : 0);
  const [lo, hi] =
    query.mode === 'interval' ? [query.a, query.b] : query.mode === 'left' ? [min, query.k] : [query.k, max];

  // En discretas el eje del canvas va de (min-0.5) a (max+0.5): se compensa con medio paso.
  const inset = discrete ? `calc(${PAD.left}px + (100% - ${PAD.left + PAD.right}px) * ${0.5 / (max - min + 1)} - 10px)` : `${PAD.left - 10}px`;
  const insetR = discrete ? `calc(${PAD.right}px + (100% - ${PAD.left + PAD.right}px) * ${0.5 / (max - min + 1)} - 10px)` : `${PAD.right - 10}px`;

  return (
    <div className="border-t-4 border-ink bg-bg px-2 pb-2 pt-3" data-tour="range">
      <div className="range-dual relative h-7" style={{ marginLeft: inset, marginRight: insetR }}>
        {/* riel + tramo seleccionado */}
        <div className="absolute inset-x-[10px] top-1/2 h-2.5 -translate-y-1/2 border-[3px] border-ink bg-paper">
          <div
            className="absolute inset-y-0 bg-yellow"
            style={{ left: `${pos(lo) * 100}%`, width: `${Math.max(0, pos(hi) - pos(lo)) * 100}%` }}
          />
        </div>
        {query.mode === 'interval' ? (
          <>
            <input
              type="range"
              className="brut-range"
              aria-label="Límite inferior a"
              min={min}
              max={max}
              step={step}
              value={clamp(query.a)}
              onChange={(e) => onChange({ ...query, a: snap(Math.min(Number(e.target.value), query.b)) })}
            />
            <input
              type="range"
              className="brut-range"
              aria-label="Límite superior b"
              min={min}
              max={max}
              step={step}
              value={clamp(query.b)}
              onChange={(e) => onChange({ ...query, b: snap(Math.max(Number(e.target.value), query.a)) })}
            />
          </>
        ) : (
          <input
            type="range"
            className="brut-range"
            aria-label="Umbral k"
            min={min}
            max={max}
            step={step}
            value={clamp(query.k)}
            onChange={(e) => onChange({ ...query, k: snap(Number(e.target.value)) })}
          />
        )}
      </div>
      <div className="px-2 pt-1 font-mono text-[10px] font-bold uppercase tracking-widest opacity-70">
        ◂ arrastra para delimitar la pregunta sobre el eje x ▸
      </div>
    </div>
  );
}
