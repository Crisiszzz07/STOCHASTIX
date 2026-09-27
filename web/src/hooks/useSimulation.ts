import { useEffect, useMemo, useState } from 'react';
import { simulate, type DistKey, type Params, type SimResult } from '../engine/distributions';
import type { GeneratorConfig, GeneratorMethod } from '../engine/generators';
import { arraySource, prngSource } from '../engine/uniform';

export type SourceSpec =
  | { kind: 'prng'; generator: GeneratorMethod; config: GeneratorConfig }
  | { kind: 'sequence'; values: number[]; wrap: boolean };

export interface SimInput {
  dist: DistKey;
  method: string;
  params: Params;
  n: number;
  source: SourceSpec;
}

export type Engine = 'ts' | 'go';

function runLocal(input: SimInput): SimResult {
  const src =
    input.source.kind === 'prng'
      ? prngSource(input.source.generator, input.source.config)
      : arraySource(input.source.values, input.source.wrap);
  return simulate(input.dist, input.method, input.params, src, input.n);
}


export function useSimulation(input: SimInput | null, engine: Engine) {
  const local = useMemo(() => (input && engine === 'ts' ? runLocal(input) : null), [input, engine]);

  const [remote, setRemote] = useState<{ key: SimInput; result: SimResult; ms: number } | null>(null);
  const [goError, setGoError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!input || engine !== 'go') return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setPending(true);
      const t0 = performance.now();
      try {
        const res = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
        const data = (await res.json()) as Omit<SimResult, 'values'>;
        const result: SimResult = { ...data, values: data.samples.map((s) => s.x) };
        setRemote({ key: input, result, ms: performance.now() - t0 });
        setGoError(null);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setGoError((e as Error).message.slice(0, 120));
        setRemote(null);
      } finally {
        if (!ctrl.signal.aborted) setPending(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [input, engine]);

  // Respaldo local cuando Go falla (o mientras llega la primera respuesta)
  const fallback = useMemo(
    () => (input && engine === 'go' && (goError || !remote) ? runLocal(input) : null),
    [input, engine, goError, remote],
  );

  if (!input) return { result: null, engineUsed: engine, goError, pending: false, ms: 0 };
  if (engine === 'ts') return { result: local, engineUsed: 'ts' as Engine, goError: null, pending: false, ms: 0 };
  if (remote && !goError) return { result: remote.result, engineUsed: 'go' as Engine, goError, pending, ms: remote.ms };
  return { result: fallback, engineUsed: 'ts' as Engine, goError, pending, ms: 0 };
}

export async function pingGo(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(1500) });
    return res.ok && (await res.json()).engine === 'go';
  } catch {
    return false;
  }
}
