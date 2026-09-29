import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DataDrawer } from './components/DataDrawer';
import { DataSourcePanel, FileDrop } from './components/DataSourcePanel';
import { DistributionPanel } from './components/DistributionPanel';
import { FrequencyTable } from './components/FrequencyTable';
import { Header } from './components/Header';
import { HistogramCanvas } from './components/HistogramCanvas';
import { QueryConsole } from './components/QueryConsole';
import { RangeSelector } from './components/RangeSelector';
import { isFirstVisit, Tutorial, type TutorialTab } from './components/Tutorial';
import { FileSpreadsheet } from 'lucide-react';
import { Button, Panel, Stat, Sticker } from './components/ui';
import {
  defaultParams, DIST_LIST, DISTRIBUTIONS, uniformsPerVariable, type DistKey, type DistSpec, type Params,
} from './engine/distributions';
import { buildHistogram, sampleStats } from './engine/histogram';
import { describeQuery, evaluateQuery, fmtNum, satisfies, type Query } from './engine/query';
import { pingGo, useSimulation, type Engine, type SimInput } from './hooks/useSimulation';
import { exportSamplesCsv } from './io/export';
import { downloadReport } from './io/exportXlsx';
import { parseFile, parsePlainText } from './io/parse';
import type { ParsedSequence } from './io/sequence';

function defaultQuery(spec: DistSpec, p: Params): Query {
  const m = spec.mean(p);
  const s = Math.sqrt(spec.variance(p));
  const r = (v: number) => (spec.discrete ? Math.round(v) : Number(v.toFixed(2)));
  return { mode: 'right', k: r(m + 0.5 * s), strict: false, a: r(m - s), b: r(m + s), aStrict: false, bStrict: false };
}

function readTheme(): 'light' | 'dark' {
  try {
    const t = localStorage.getItem('stochastix-theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* almacenamiento no disponible */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  // ---------------- Estado ----------------
  const [theme, setTheme] = useState(readTheme);
  const [engine, setEngine] = useState<Engine>('ts');
  const [goStatus, setGoStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');

  const [dist, setDist] = useState<DistKey>('normal');
  const [paramsBy, setParamsBy] = useState<Record<DistKey, Params>>(
    () => Object.fromEntries(DIST_LIST.map((d) => [d.key, defaultParams(d.key)])) as Record<DistKey, Params>,
  );
  const [methodBy, setMethodBy] = useState<Record<DistKey, string>>(
    () => Object.fromEntries(DIST_LIST.map((d) => [d.key, d.methods[0].key])) as Record<DistKey, string>,
  );
  const [N, setN] = useState(2000);
  const [bins, setBins] = useState(24);

  // La única fuente de R_i es el archivo (o su contenido pegado como texto).
  const [seq, setSeq] = useState<ParsedSequence | null>(null);
  const [seqText, setSeqText] = useState('');
  const [wrap, setWrap] = useState(false);

  // Tutorial: se abre solo la primera vez; luego desde el botón del encabezado.
  const [help, setHelp] = useState<{ open: boolean; tab: TutorialTab }>(() => ({ open: isFirstVisit(), tab: 'steps' }));

  const spec = DISTRIBUTIONS[dist];
  const params = paramsBy[dist];
  const method = methodBy[dist];
  // Cada distribución recuerda su propia pregunta y enunciado (el reporte los usa todos).
  const [queryBy, setQueryBy] = useState<Record<DistKey, Query>>(
    () => Object.fromEntries(DIST_LIST.map((d) => [d.key, defaultQuery(d, defaultParams(d.key))])) as Record<DistKey, Query>,
  );
  const [statementBy, setStatementBy] = useState<Partial<Record<DistKey, string>>>({});
  const query = queryBy[dist];
  const statement = statementBy[dist] ?? '';
  const setQuery = (q: Query) => setQueryBy((x) => ({ ...x, [dist]: q }));
  const setStatement = (t: string) => setStatementBy((x) => ({ ...x, [dist]: t }));

  // Layout effect: el atributo debe existir antes de que el canvas lea la paleta.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('stochastix-theme', theme);
    } catch {
      /* ignorado */
    }
  }, [theme]);

  useEffect(() => {
    if (engine !== 'go') return;
    let alive = true;
    const check = () => pingGo().then((ok) => alive && setGoStatus(ok ? 'online' : 'offline'));
    check();
    const id = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [engine]);

  const changeDist = (d: DistKey) => setDist(d);
  // Texto mostrado tras cargar un archivo: no se re-interpreta (conserva metadatos del Excel).
  const loadedText = useRef<string | null>(null);
  const loadFile = useCallback(async (file: File) => {
    const parsed = await parseFile(file);
    const PREVIEW = 5000;
    const preview =
      parsed.values.length > PREVIEW
        ? parsed.values.slice(0, PREVIEW).join('\n') + `\n# … ${parsed.values.length - PREVIEW} valores más (vista recortada)`
        : parsed.values.join('\n');
    loadedText.current = preview;
    setSeqText(preview);
    setSeq(parsed);
  }, []);

  // Editar el texto a mano vuelve a validar (con pequeño debounce)
  const editText = (t: string) => {
    setSeqText(t);
    if (!t.trim()) setSeq(null);
  };
  useEffect(() => {
    if (!seqText.trim() || seqText === loadedText.current) return;
    const id = setTimeout(() => setSeq(parsePlainText(seqText, 'Texto pegado')), 250);
    return () => clearTimeout(id);
  }, [seqText]);

  // ---------------- Simulación ----------------
  const paramErrors = spec.validate(params);
  const activeSeq = seq;
  let noFile = false;

  let blocker: string | null = null;
  if (paramErrors.length) blocker = `Parámetros inválidos: ${paramErrors.join(' · ')}`;
  else if (!activeSeq) {
    blocker = 'Sube el archivo .xlsx exportado de simulacion-trabajo para empezar.';
    noFile = true;
  }
  else if (activeSeq && activeSeq.errors.length) blocker = `Secuencia rechazada: ${activeSeq.errors.length} valor(es) inválidos.`;
  else if (activeSeq && !activeSeq.values.length) blocker = 'La secuencia está vacía.';

  const simInput = useMemo<SimInput | null>(() => {
    if (blocker) return null;
    return {
      dist,
      method,
      params,
      n: N,
      source: { kind: 'sequence', values: activeSeq!.values, wrap },
    };
  }, [blocker, dist, method, params, N, activeSeq, wrap]);

  const deferredInput = useDeferredValue(simInput);
  const { result, engineUsed, goError, ms } = useSimulation(deferredInput, engine);

  const values = useMemo(() => result?.values ?? [], [result]);
  const hist = useMemo(() => buildHistogram(values, spec, params, bins), [values, spec, params, bins]);
  const stats = useMemo(() => sampleStats(values), [values]);
  const qres = useMemo(() => evaluateQuery(values, query, spec, params), [values, query, spec, params]);
  const test = useCallback((x: number) => satisfies(x, query), [query]);
  const exportReport = () => {
    if (!seq || seq.errors.length || !seq.values.length) return;
    downloadReport({
      seq, wrap, N, bins, paramsBy, queryBy, statementBy,
      active: { dist, method },
    });
  };

  const needed = N * uniformsPerVariable(dist, method, params);
  const qStep = spec.discrete ? 1 : Number((Math.sqrt(spec.variance(params)) / 10).toPrecision(1)) || 0.1;

  return (
    <div className="min-h-screen">
      <Header
        theme={theme}
        onTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        engine={engine}
        onEngine={setEngine}
        goStatus={goStatus}
        seq={seq}
        onHelp={(tab) => setHelp({ open: true, tab })}
      />
      <Tutorial
        open={help.open}
        initialTab={help.tab}
        hasData={!!seq && seq.errors.length === 0 && seq.values.length > 0}
        onClose={() => setHelp((h) => ({ ...h, open: false }))}
        onLoadExample={async () => {
          const buf = await fetch('/plantilla_simulacion.xlsx').then((r) => r.arrayBuffer());
          await loadFile(new File([buf], 'ejemplo_plantilla_simulacion.xlsx'));
        }}
      />

      <main className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 md:px-6 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <aside className="space-y-6">
          <DataSourcePanel
            seq={seq}
            text={seqText}
            onText={editText}
            onFile={loadFile}
            wrap={wrap}
            onWrap={setWrap}
            needed={needed}
          />
          <DistributionPanel
            dist={dist}
            onDist={changeDist}
            params={params}
            onParam={(k, v) => setParamsBy((p) => ({ ...p, [dist]: { ...p[dist], [k]: v } }))}
            method={method}
            onMethod={(m) => setMethodBy((x) => ({ ...x, [dist]: m }))}
            N={N}
            onN={setN}
            bins={bins}
            onBins={setBins}
            errors={paramErrors}
          />

        </aside>

        <div className="min-w-0 space-y-6">
          <Panel
            title="Histograma vs. modelo teórico"
            kicker="03"
            tour="histogram"
            bodyClass=""
            right={
              <>
                {result && !result.overflow && (
                  <Sticker tone="green" rot={-2}>
                    GENERATED · {result.samples.length}
                  </Sticker>
                )}
                {result?.overflow && (
                  <Sticker tone="red" rot={3} title="La secuencia de R_i se agotó antes de completar N">
                    OVERFLOW · {result.samples.length}/{result.requested}
                  </Sticker>
                )}
                {!!result?.clamped && (
                  <Sticker tone="pink" rot={-1} title="R_i = 0 ó 1 ajustados a (ε, 1−ε) para evitar ln(0)">
                    CLAMPED · {result.clamped}
                  </Sticker>
                )}
                {engine === 'go' && goError && (
                  <Sticker tone="red" rot={2} title={goError}>
                    Servidor no disponible · calculado aquí
                  </Sticker>
                )}
                {engineUsed === 'go' && (
                  <Sticker tone="yellow" rot={2}>
                    GO · {ms.toFixed(0)} ms
                  </Sticker>
                )}
              </>
            }
          >
            {noFile ? (
              <div className="p-6">
                <FileDrop onFile={loadFile} big>
                  <p className="mx-auto mt-4 max-w-md font-mono text-xs leading-relaxed">
                    1. En simulacion-trabajo genera tus números y pulsa «Exportar Excel».
                    <br />
                    2. Arrastra aquí ese archivo (simulacion_aleatorios.xlsx) o selecciónalo.
                    <br />
                    3. Elige la distribución en el panel 02.
                  </p>
                </FileDrop>
              </div>
            ) : blocker ? (
              <div className="grid min-h-[300px] place-items-center p-6">
                <div className="brut max-w-lg bg-red p-5 text-center text-black">
                  <div className="font-display text-2xl uppercase">Motor detenido</div>
                  <p className="mt-2 font-mono text-sm font-bold">{blocker}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 border-b-4 border-ink bg-bg p-4 sm:grid-cols-3 2xl:grid-cols-6">
                  <Stat label="Media x̄" value={fmtNum(stats.mean, 4)} sub={`μ teórica ${fmtNum(spec.mean(params), 4)}`} />
                  <Stat label="Varianza s²" value={fmtNum(stats.variance, 4)} sub={`σ² teórica ${fmtNum(spec.variance(params), 4)}`} />
                  <Stat label="Mín / Máx" value={`${fmtNum(stats.min, 2)} / ${fmtNum(stats.max, 2)}`} />
                  <Stat label="Variables" value={values.length.toLocaleString('es')} sub={`de ${N.toLocaleString('es')} pedidas`} />
                  <Stat label="U consumidas" value={(result?.consumed ?? 0).toLocaleString('es')} sub={DISTRIBUTIONS[dist].methods.find((m) => m.key === method)?.label} />
                  <Stat label="Condición" value={`${(qres.simulated * 100).toFixed(1)}%`} sub={describeQuery(query)} tone="yellow" />
                </div>
                <div className="px-2 pt-3">
                  <HistogramCanvas hist={hist} dist={spec} params={params} query={query} theme={theme} />
                </div>
                <RangeSelector hist={hist} query={query} onChange={setQuery} />
                <div className="flex flex-wrap gap-x-5 gap-y-2 border-t-4 border-ink px-4 py-2 font-mono text-[11px] font-bold">
                  <Legend color="bg-cobalt" label="Frecuencia simulada" />
                  <Legend color="bg-yellow" label="Dentro de la condición" />
                  <Legend color="bg-red" label={spec.discrete ? 'p(k) teórica' : 'f(x) teórica'} />
                  {!spec.discrete && <Legend color="bg-pink" label="Área bajo f(x) en la condición" />}
                  {hist.outOfRange > 0 && <span>· {hist.outOfRange} fuera de rango</span>}
                </div>
              </>
            )}
          </Panel>

          {!blocker && (
            <>
              <Panel
                title="Query Engine · Preguntas concretas"
                kicker="04"
                tone="pink"
                tour="query"
                right={
                  <Button
                    tone="green"
                    className="flex items-center gap-2 px-3 py-1.5 text-[11px]"
                    onClick={exportReport}
                    title="Excel con TODAS las distribuciones y métodos: comparación, validación, χ², variables, frecuencias y pruebas de los R_i"
                    data-tour="export"
                  >
                    <FileSpreadsheet size={14} /> Exportar reporte completo .xlsx
                  </Button>
                }
              >
                <QueryConsole
                  query={query}
                  onChange={setQuery}
                  result={qres}
                  discrete={spec.discrete}
                  step={qStep}
                  statement={statement}
                  onStatement={setStatement}
                />
              </Panel>

              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Panel title="Tabla de frecuencias" kicker="04b" tone="paper" tour="freq">
                  <FrequencyTable hist={hist} query={query} />
                </Panel>
                <DataDrawer
                  samples={result?.samples ?? []}
                  test={test}
                  onExportXlsx={exportReport}
                  onExport={() =>
                    exportSamplesCsv(result?.samples ?? [], test, {
                      dist: spec.notation(params),
                      method: spec.methods.find((m) => m.key === method)?.label ?? method,
                      query: describeQuery(query),
                    })
                  }
                />
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="border-t-4 border-ink bg-term px-4 py-6 text-term-fg md:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-8 gap-y-4">
          <div className="min-w-0 font-mono text-[11px] leading-relaxed">
            <div className="font-display text-base uppercase tracking-tight">
              STOCHASTIX<span className="text-yellow">//</span>
            </div>
            Basado en el capítulo 4 de <i>Simulación: un enfoque práctico</i>, Raúl Coss Bu.
            <br />
            R_i generados con simulacion-trabajo.vercel.app
          </div>
          <nav aria-label="Autores" className="flex flex-wrap gap-3 md:ml-auto">
            {['Crisiszzz07', '7val07'].map((user) => (
              <a
                key={user}
                href={`https://github.com/${user}`}
                target="_blank"
                rel="noreferrer"
                className="brut-btn flex items-center gap-2 bg-yellow px-3 py-2 font-mono text-sm font-extrabold text-black shadow-[5px_5px_0_0_#FF41A5]!"
              >
                <GithubMark />@{user}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3.5 w-3.5 border-2 border-black ${color}`} />
      {label}
    </span>
  );
}
