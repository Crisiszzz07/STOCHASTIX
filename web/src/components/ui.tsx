import { Minus, Plus } from 'lucide-react';
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Tone = 'yellow' | 'cobalt' | 'red' | 'green' | 'pink' | 'paper' | 'ink';

const TONE: Record<Tone, string> = {
  yellow: 'bg-yellow text-on-accent',
  cobalt: 'bg-cobalt text-white',
  red: 'bg-red text-on-accent',
  green: 'bg-green text-on-accent',
  pink: 'bg-pink text-on-accent',
  paper: 'bg-paper text-ink',
  ink: 'bg-ink text-bg',
};

export function Button({
  tone = 'paper',
  on,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; on?: boolean }) {
  return (
    <button
      type="button"
      data-on={on ? 'true' : undefined}
      className={`brut-btn font-display uppercase ${TONE[tone]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Sticker({
  children,
  tone = 'yellow',
  rot = -2,
  className = '',
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  rot?: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`sticker animate-stamp px-2 py-0.5 text-[11px] ${TONE[tone]} ${className}`}
      style={{ ['--rot' as string]: `${rot}deg`, transform: `rotate(${rot}deg)` }}
    >
      {children}
    </span>
  );
}

export function Panel({
  title,
  kicker,
  right,
  children,
  className = '',
  bodyClass = 'p-4',
  tone = 'ink',
  tour,
}: {
  tour?: string;
  title: ReactNode;
  kicker?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  tone?: Tone;
}) {
  return (
    <section className={`brut-panel ${className}`} data-tour={tour}>
      <header className={`flex flex-wrap items-center gap-3 border-b-4 border-ink px-4 py-2 ${TONE[tone]}`}>
        {kicker && <span className="font-mono text-[11px] font-bold opacity-80">{kicker}</span>}
        <h2 className="font-display text-lg uppercase leading-none tracking-tight">{title}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>
      </header>
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  tone = 'yellow',
  size = 'md',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  tone?: Tone;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o) => (
        <Button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          on={o.value === value}
          tone={o.value === value ? tone : 'paper'}
          onClick={() => onChange(o.value)}
          className={size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-xs'}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

export function NumberField({
  label,
  symbol,
  value,
  min,
  max,
  step,
  integer,
  onChange,
  slider = true,
}: {
  label: string;
  symbol?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  onChange: (v: number) => void;
  slider?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const clamp = (v: number) => {
    const c = Math.min(max, Math.max(min, v));
    return integer ? Math.round(c) : Number(c.toFixed(6));
  };
  const commit = (raw: string) => {
    const v = Number(raw.replace(',', '.'));
    if (Number.isFinite(v)) onChange(clamp(v));
    else setDraft(String(value));
  };
  const bump = (dir: 1 | -1) => onChange(clamp(value + dir * step));
  const invalid = !Number.isFinite(Number(draft.replace(',', '.')));

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="font-grotesk text-xs font-bold uppercase tracking-wide">{label}</label>
        {symbol && <span className="font-mono text-sm font-extrabold">{symbol}</span>}
      </div>
      <div className="flex items-stretch">
        <button
          type="button"
          aria-label={`Disminuir ${label}`}
          onClick={() => bump(-1)}
          className="brut-btn bg-paper px-2 text-ink"
        >
          <Minus size={16} strokeWidth={3} />
        </button>
        <input
          className={`brut-input mx-2 w-full min-w-0 px-2 py-1.5 text-center text-sm ${invalid ? 'bg-red!' : ''}`}
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              bump(1);
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              bump(-1);
            }
          }}
          aria-label={label}
        />
        <button
          type="button"
          aria-label={`Aumentar ${label}`}
          onClick={() => bump(1)}
          className="brut-btn bg-paper px-2 text-ink"
        >
          <Plus size={16} strokeWidth={3} />
        </button>
      </div>
      {slider && (
        <input
          type="range"
          className="brut-range w-full"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          aria-label={`${label} (deslizador)`}
        />
      )}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className={`brut min-w-0 px-3 py-2 ${tone ? TONE[tone] : 'bg-paper text-ink'}`}>
      <div className="font-grotesk text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</div>
      <div className="truncate font-mono text-lg font-extrabold leading-tight">{value}</div>
      {sub && <div className="truncate font-mono text-[11px] opacity-80">{sub}</div>}
    </div>
  );
}
