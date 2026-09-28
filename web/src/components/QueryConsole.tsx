import { Terminal } from 'lucide-react';
import { describeQuery, fmtNum, type Query, type QueryMode, type QueryResult } from '../engine/query';
import { Button, NumberField, Segmented, Sticker } from './ui';

function Op({ on, a, b, onToggle, label }: { on: boolean; a: string; b: string; onToggle: () => void; label: string }) {
  return (
    <Button
      tone="yellow"
      className="min-w-11 px-2 py-0.5 font-mono! text-lg normal-case shadow-[3px_3px_0_0_var(--pink)]!"
      onClick={onToggle}
      title={`${label}: alternar ${a} / ${b}`}
      aria-label={`${label}: ${on ? b : a}`}
    >
      {on ? b : a}
    </Button>
  );
}

export function QueryConsole({
  query,
  onChange,
  result,
  discrete,
  step,
  statement,
  onStatement,
}: {
  query: Query;
  onChange: (q: Query) => void;
  result: QueryResult;
  discrete: boolean;
  step: number;
  statement: string;
  onStatement: (s: string) => void;
}) {
  const set = (patch: Partial<Query>) => onChange({ ...query, ...patch });
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const err = result.relError;
  const errBg = err === null ? 'bg-paper' : err < 5 ? 'bg-green' : err < 15 ? 'bg-yellow' : 'bg-red';
  const lim = { min: -1e6, max: 1e6, step, integer: false };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      {/* Consola de entrada */}
      <div className="space-y-4">
        <Segmented<QueryMode>
          value={query.mode}
          onChange={(mode) => set({ mode })}
          tone="pink"
          size="sm"
          options={[
            { value: 'left', label: 'Caso 1 · Menor que', title: 'Cola izquierda P(X ≤ k)' },
            { value: 'right', label: 'Caso 2 · Mayor que', title: 'Cola derecha P(X ≥ k)' },
            { value: 'interval', label: 'Caso 3 · Rango', title: 'Intervalo P(a ≤ X ≤ b)' },
          ]}
        />

        <div className="brut flex flex-wrap items-center gap-2 bg-term px-3 py-3 font-mono text-term-fg">
          <span className="text-green">&gt;</span>
          <span className="text-lg font-extrabold">P(</span>
          {query.mode === 'interval' ? (
            <>
              <span className="text-lg font-extrabold text-yellow">{fmtNum(query.a)}</span>
              <Op on={query.aStrict} a="≤" b="<" onToggle={() => set({ aStrict: !query.aStrict })} label="Límite inferior" />
              <span className="text-lg font-extrabold">X</span>
              <Op on={query.bStrict} a="≤" b="<" onToggle={() => set({ bStrict: !query.bStrict })} label="Límite superior" />
              <span className="text-lg font-extrabold text-yellow">{fmtNum(query.b)}</span>
            </>
          ) : (
            <>
              <span className="text-lg font-extrabold">X</span>
              <Op
                on={query.strict}
                a={query.mode === 'left' ? '≤' : '≥'}
                b={query.mode === 'left' ? '<' : '>'}
                onToggle={() => set({ strict: !query.strict })}
                label="Operador"
              />
              <span className="text-lg font-extrabold text-yellow">{fmtNum(query.k)}</span>
            </>
          )}
          <span className="text-lg font-extrabold">)</span>
          <span className="ml-auto animate-blink text-green">▌</span>
        </div>

        {query.mode === 'interval' ? (
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Desde" symbol="a" value={query.a} {...lim} integer={discrete} slider={false} onChange={(a) => set({ a, b: Math.max(a, query.b) })} />
            <NumberField label="Hasta" symbol="b" value={query.b} {...lim} integer={discrete} slider={false} onChange={(b) => set({ b, a: Math.min(b, query.a) })} />
          </div>
        ) : (
          <NumberField label="Umbral" symbol="k" value={query.k} {...lim} slider={false} onChange={(k) => set({ k })} />
        )}

        <label className="block">
          <span className="font-grotesk text-xs font-bold uppercase">Enunciado (opcional)</span>
          <input
            className="brut-input mt-1 w-full px-2 py-1.5 text-xs"
            placeholder="Ej.: probabilidad de que la tensión supere 5 minutos"
            value={statement}
            onChange={(e) => onStatement(e.target.value)}
          />
        </label>
      </div>

      {/* Ticker de resultados */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Terminal size={16} />
          <span className="font-mono text-sm font-extrabold">{describeQuery(query)}</span>
          {statement && <span className="font-mono text-xs opacity-70">— “{statement}”</span>}
        </div>

        <div className="brut bg-paper p-3">
          <div className="font-grotesk text-[10px] font-bold uppercase tracking-widest">Casos favorables</div>
          <div className="flex items-baseline gap-2 font-mono">
            <span className="text-4xl font-extrabold leading-none">{result.favorable.toLocaleString('es')}</span>
            <span className="text-xl font-bold opacity-60">/ {result.total.toLocaleString('es')}</span>
          </div>
          <div className="mt-2 h-4 border-[3px] border-ink bg-bg">
            <div className="h-full bg-pink" style={{ width: pct(result.simulated) }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="brut bg-yellow p-3 text-black">
            <div className="font-grotesk text-[10px] font-bold uppercase tracking-widest">P simulada</div>
            <div className="font-mono text-3xl font-extrabold leading-tight">{result.simulated.toFixed(4)}</div>
            <div className="font-mono text-xs">{pct(result.simulated)}</div>
          </div>
          <div className="brut bg-cobalt p-3 text-white">
            <div className="font-grotesk text-[10px] font-bold uppercase tracking-widest">P teórica exacta</div>
            <div className="font-mono text-3xl font-extrabold leading-tight">{result.theoretical.toFixed(4)}</div>
            <div className="font-mono text-xs">{pct(result.theoretical)}</div>
          </div>
        </div>

        <div className={`brut flex flex-wrap items-center gap-3 p-3 ${errBg} ${err === null ? 'text-ink' : 'text-black'}`}>
          <div>
            <div className="font-grotesk text-[10px] font-bold uppercase tracking-widest">Error relativo</div>
            <div className="font-mono text-2xl font-extrabold">{err === null ? '—' : `${err.toFixed(2)} %`}</div>
          </div>
          <div className="font-mono text-xs">
            |P̂ − P| = {result.absError.toFixed(5)}
            <br />
            {err === null ? 'P teórica = 0: sólo error absoluto' : '|P̂ − P| / P × 100'}
          </div>
          {result.total > 0 && err !== null && err > 15 && (
            <Sticker tone="paper" rot={3} className="ml-auto">
              Desvío alto
            </Sticker>
          )}
        </div>
      {/* --- NUEVO: VEREDICTO DE VALIDACIÓN --- */}
        {result.total > 0 && (
          <div className={`brut flex flex-col justify-center p-3 text-black ${result.validated ? 'bg-green' : 'bg-red text-white'}`}>
            <div className="font-grotesk text-[10px] font-bold uppercase tracking-widest opacity-80">
              Intervalo de Confianza (95%)
            </div>
            <div className="font-mono text-2xl font-extrabold tracking-tight">
              {result.validated ? '¡VALIDADO! ✅' : 'NO VALIDADO ❌'}
            </div>
            <div className="font-mono text-xs mt-1">
              La probabilidad teórica {result.validated ? 'cae dentro' : 'está fuera'} del margen de error de la simulada.
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
}
