import { BarChart3, Bell, Sigma, Timer } from 'lucide-react';
import { DIST_LIST, DISTRIBUTIONS, type DistKey, type Params } from '../engine/distributions';
import { Button, NumberField, Panel, Segmented } from './ui';

const ICONS: Record<DistKey, typeof Sigma> = {
  binomial: BarChart3,
  poisson: Timer,
  normal: Bell,
  erlang: Sigma,
};

export function DistributionPanel({
  dist,
  onDist,
  params,
  onParam,
  method,
  onMethod,
  N,
  onN,
  bins,
  onBins,
  errors,
}: {
  dist: DistKey;
  onDist: (d: DistKey) => void;
  params: Params;
  onParam: (key: string, v: number) => void;
  method: string;
  onMethod: (m: string) => void;
  N: number;
  onN: (n: number) => void;
  bins: number;
  onBins: (b: number) => void;
  errors: string[];
}) {
  const spec = DISTRIBUTIONS[dist];
  const m = spec.methods.find((x) => x.key === method) ?? spec.methods[0];

  return (
    <Panel title="Tablero de control" kicker="02" tone="yellow" tour="dist">
      <div className="space-y-5">
        {/* Interruptores físicos de distribución */}
        <div className="grid grid-cols-2 gap-3">
          {DIST_LIST.map((d) => {
            const Icon = ICONS[d.key];
            const on = d.key === dist;
            return (
              <Button
                key={d.key}
                on={on}
                tone={on ? 'cobalt' : 'paper'}
                onClick={() => onDist(d.key)}
                className="flex items-center gap-2 px-3 py-3 text-left text-sm"
                aria-pressed={on}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center border-[3px] border-black ${
                    on ? 'bg-yellow text-black' : 'bg-bg text-ink'
                  }`}
                >
                  <Icon size={15} strokeWidth={3} />
                </span>
                <span className="leading-none">{d.label}</span>
              </Button>
            );
          })}
        </div>

        <div className="brut bg-bg px-3 py-2 font-mono text-sm font-extrabold">
          X ~ {spec.notation(params)}
          <span className="ml-2 font-normal opacity-70">{spec.discrete ? '[discreta]' : '[continua]'}</span>
        </div>

        {spec.params.map((p) => (
          <NumberField
            key={p.key}
            label={p.label}
            symbol={p.symbol}
            value={params[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            integer={p.integer}
            onChange={(v) => onParam(p.key, v)}
          />
        ))}

        {errors.length > 0 && (
          <ul className="brut bg-red px-3 py-2 font-mono text-xs font-bold text-black">
            {errors.map((e) => (
              <li key={e}>✗ {e}</li>
            ))}
          </ul>
        )}

        <div className="space-y-2">
          <div className="font-grotesk text-xs font-bold uppercase tracking-wide">Método de generación</div>
          <Segmented
            value={m.key}
            onChange={onMethod}
            tone="pink"
            size="sm"
            options={spec.methods.map((x) => ({ value: x.key, label: x.label }))}
          />
          <div className="brut bg-term px-3 py-2 font-mono text-[12px] leading-relaxed text-term-fg">
            <div className="text-yellow">{m.formula}</div>
            <div className="mt-1 opacity-80">{m.note}</div>
            <div className="mt-1 text-green">▸ consumo: {m.cost(params)}</div>
          </div>
        </div>

        <NumberField label="Tamaño de muestra" symbol="N" value={N} min={10} max={50000} step={10} integer onChange={onN} />
        {!spec.discrete && (
          <NumberField label="Clases del histograma" symbol="k" value={bins} min={5} max={80} step={1} integer onChange={onBins} />
        )}
      </div>
    </Panel>
  );
}
