import { ArrowLeft, ArrowRight, BookOpen, Cpu, FileSpreadsheet, ListChecks, Server, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { GENERATOR_SITE } from '../io/remote';
import { Button, Sticker } from './ui';

export type TutorialTab = 'steps' | 'summary';

const STORAGE_KEY = 'stochastix-tutorial-visto';

export function isFirstVisit(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignorado */
  }
}

interface Step {
  title: string;
  target?: string;
  body: ReactNode;
  needsData?: boolean;
}

const K = ({ children }: { children: ReactNode }) => (
  <code className="border-2 border-ink bg-bg px-1 font-mono text-[12px] font-bold">{children}</code>
);

const EngineInfo = () => (
  <div className="grid gap-2 sm:grid-cols-2">
    <div className="brut bg-paper p-2 text-[13px] leading-snug">
      <div className="mb-1 flex items-center gap-1.5 font-display text-xs uppercase">
        <Cpu size={14} /> Cliente TS
      </div>
      Los cálculos se hacen en <b>tu propio dispositivo</b>. Es inmediato y sigue funcionando aunque se corte internet.
      <div className="mt-1 font-bold">Recomendado: úsalo normalmente.</div>
    </div>
    <div className="brut bg-paper p-2 text-[13px] leading-snug">
      <div className="mb-1 flex items-center gap-1.5 font-display text-xs uppercase">
        <Server size={14} /> Servidor Go
      </div>
      Tus R_i se envían al <b>servidor de la página</b>, que hace los cálculos y te devuelve el resultado. Necesita
      internet.
      <div className="mt-1 font-bold">
        Úsalo si tu dispositivo va lento (celular o equipo antiguo) con muestras grandes.
      </div>
    </div>
  </div>
);

const STEPS: Step[] = [
  {
    title: 'Bienvenido a STOCHASTIX',
    body: (
      <>
        <p>
          Esta página convierte números pseudoaleatorios <K>R_i ∈ (0,1)</K> en variables aleatorias (Binomial, Poisson,
          Normal y Erlang) y compara lo simulado con la teoría.
        </p>
        <p className="mt-2">
          Los <K>R_i</K> <b>no se generan aquí</b>: vienen del archivo que exportas en simulacion-trabajo. Te mostramos
          el recorrido en 10 pasos.
        </p>
      </>
    ),
  },
  {
    title: '1 · Exporta tus números',
    target: 'generator',
    body: (
      <>
        <p>
          Abre el{' '}
          <a href={GENERATOR_SITE} target="_blank" rel="noreferrer" className="font-bold underline decoration-2">
            generador (simulacion-trabajo)
          </a>
          , elige el método y sus parámetros y pulsa <b>«Exportar Excel»</b>.
        </p>
        <p className="mt-2">
          Descargarás <K>simulacion_aleatorios.xlsx</K> con las columnas <K>i · X_i · R_i · Estado</K>.
        </p>
      </>
    ),
  },
  {
    title: '2 · Sube el archivo',
    target: 'source',
    body: (
      <>
        <p>
          En el panel <b>01 · Archivo de números R_i</b> arrastra el Excel o pulsa <b>«Seleccionar archivo»</b>. También
          acepta <K>.csv</K>, <K>.json</K> o pegar los valores como texto.
        </p>
        <p className="mt-2">
          Verás cuántos <K>R_i</K> son válidos, el método detectado y avisos (ciclos, valores 0 ó 1). Arriba, el recuadro{' '}
          <b>Fuente de R_i</b> se pone amarillo cuando todo está bien.
        </p>
      </>
    ),
  },
  {
    title: '3 · Elige distribución y método',
    target: 'dist',
    body: (
      <>
        <p>
          En <b>02 · Tablero de control</b> pulsa la distribución y ajusta sus parámetros con los botones <K>− / +</K>, el
          campo o el deslizador.
        </p>
        <p className="mt-2">
          Elige el método (p. ej. Box-Muller o TCL n=12 para la Normal). La caja negra muestra la fórmula y cuántas{' '}
          <K>R_i</K> consume cada variable.
        </p>
      </>
    ),
  },
  {
    title: '4 · Tamaño de muestra N',
    target: 'dist',
    body: (
      <>
        <p>
          <K>N</K> es cuántas variables quieres. Necesitas aprox. <K>N × consumo</K> números en el archivo (Erlang k=3 con
          N=2000 → 6000 <K>R_i</K>).
        </p>
        <p className="mt-2">
          Si no alcanzan aparece <Sticker tone="red" rot={0}>OVERFLOW</Sticker>: exporta más números, baja N o activa{' '}
          <b>«Reciclar la secuencia»</b>.
        </p>
      </>
    ),
  },
  {
    title: '5 · Lee el histograma',
    target: 'histogram',
    needsData: true,
    body: (
      <>
        <p>
          Las barras <span className="bg-cobalt px-1 text-white">azules</span> son tus datos simulados; la línea{' '}
          <span className="bg-red px-1 text-black">roja</span> es la distribución teórica. Pasa el cursor por una barra
          para ver frecuencia observada y esperada.
        </p>
        <p className="mt-2">Arriba tienes media, varianza, mínimo/máximo y las R_i consumidas.</p>
      </>
    ),
  },
  {
    title: '6 · Haz una pregunta concreta',
    target: 'query',
    needsData: true,
    body: (
      <>
        <p>
          <b>Caso 1</b> «menor que» <K>P(X ≤ k)</K> · <b>Caso 2</b> «mayor que» <K>P(X ≥ k)</K> · <b>Caso 3</b> «rango»{' '}
          <K>P(a ≤ X ≤ b)</K>. Pulsa el operador para cambiar entre <K>≤</K> y <K>&lt;</K>.
        </p>
        <p className="mt-2">
          Obtienes casos favorables / total, <b>P simulada</b> vs. <b>P teórica exacta</b> y el error relativo (verde &lt;
          5 %, amarillo &lt; 15 %, rojo mayor).
        </p>
      </>
    ),
  },
  {
    title: '7 · Selecciona sobre el eje',
    target: 'range',
    needsData: true,
    body: (
      <p>
        Arrastra el control rosa bajo el histograma para mover <K>k</K> (o <K>a</K> y <K>b</K>). Las barras que cumplen la
        condición se pintan de <span className="bg-yellow px-1 text-black">amarillo</span> y el área bajo la curva se
        raya en <span className="bg-pink px-1 text-black">magenta</span>.
      </p>
    ),
  },
  {
    title: '8 · Tabla de frecuencias',
    target: 'freq',
    needsData: true,
    body: (
      <p>
        Cada clase con <K>fo</K> (observada), <K>fr</K>, acumulada y <K>fe</K> (esperada). Arriba, la prueba{' '}
        <K>χ²</K> indica si el ajuste a la distribución teórica se acepta al 5 %.
      </p>
    ),
  },
  {
    title: '9 · Revisa y exporta',
    target: 'drawer',
    needsData: true,
    body: (
      <>
        <p>
          Abre <b>05 · Data Drawer</b> para ver el paso a paso de cada variable: <K>i, R₁, R₂, …, X_i, ¿cumple?</K>. Filtra
          por las que cumplen y pulsa <b>«Exportar CSV»</b>.
        </p>
        <p className="mt-2">
          Para entregar el trabajo usa <b>«Exportar reporte completo .xlsx»</b> (en el panel 04): simula{' '}
          <b>todas las distribuciones con todos sus métodos</b> con tus <K>R_i</K> y reúne en un Excel la comparación,
          la validación y el χ² de cada uno, sus variables paso a paso y las pruebas de uniformidad de los <K>R_i</K>.
        </p>
      </>
    ),
  },
  {
    title: '10 · ¿Dónde se calcula?',
    target: 'engine',
    body: (
      <>
        <p className="mb-3">
          Estos dos botones eligen <b>quién hace los cálculos</b>. Los resultados son <b>idénticos</b> con ambos; sólo
          cambia dónde se ejecutan.
        </p>
        <EngineInfo />
        <p className="mt-3 text-[13px]">
          El cuadrito del botón indica si el servidor responde: <span className="bg-green px-1 text-black">verde</span>{' '}
          disponible, <span className="bg-red px-1 text-black">rojo</span> no disponible. Si eliges el servidor y no
          responde, la página calcula sola en tu dispositivo y te lo avisa: nunca te quedas sin resultados.
        </p>
        <p className="mt-2 text-[13px]">
          Puedes volver a ver este tutorial o el resumen cuando quieras con los botones <b>«Tutorial»</b> y{' '}
          <b>«Resumen»</b> del encabezado.
        </p>
      </>
    ),
  },
];

const STICKERS: [string, 'green' | 'red' | 'pink' | 'yellow' | 'paper', string][] = [
  ['GENERATED', 'green', 'Se generaron las N variables pedidas.'],
  ['OVERFLOW', 'red', 'El archivo no tiene suficientes R_i para N.'],
  ['CLAMPED', 'pink', 'Había R_i = 0 ó 1; se ajustaron a (0,1) para evitar ln(0).'],
  ['REJECTED', 'red', 'Hay valores inválidos (no numéricos o fuera de [0,1]).'],
  ['SEED ACTIVE', 'green', 'Hay un archivo válido cargado como fuente.'],
  ['EN CICLO', 'pink', 'Filas que el generador marcó como repetidas.'],
];

function Summary() {
  const Row = ({ n, children }: { n: string; children: ReactNode }) => (
    <li className="flex gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center border-[3px] border-black bg-yellow font-display text-sm text-black">
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
  return (
    <div className="space-y-5 text-sm">
      <section>
        <h3 className="mb-2 font-display text-sm uppercase">Flujo en 5 pasos</h3>
        <ol className="space-y-2">
          <Row n="1">Exporta el Excel en simulacion-trabajo.</Row>
          <Row n="2">Súbelo en el panel 01 (o arrástralo al centro).</Row>
          <Row n="3">Elige distribución, parámetros, método y N (panel 02).</Row>
          <Row n="4">Plantea la pregunta: menor que, mayor que o rango (panel 04).</Row>
          <Row n="5">Compara P simulada vs. teórica y exporta el CSV (panel 05).</Row>
        </ol>
      </section>

      <section>
        <h3 className="mb-2 font-display text-sm uppercase">Fórmulas usadas</h3>
        <div className="brut overflow-x-auto bg-term p-3 font-mono text-[12px] leading-relaxed text-term-fg">
          <div><span className="text-yellow">Binomial</span>   X = Σ [R_j &lt; p] (n ensayos) · o inversa de F</div>
          <div><span className="text-yellow">Poisson</span>    X = nº de llegadas con Σ −ln(R_i)/λ ≤ 1 · o inversa</div>
          <div><span className="text-yellow">Normal</span>     Z = √(−2 ln R₁)·cos(2πR₂) · o TCL: Σ₁₂ R_i − 6 ; X = μ + σZ</div>
          <div><span className="text-yellow">Erlang</span>     X = −(1/λ)·Σ_{'{i=1..k}'} ln(R_i)</div>
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-display text-sm uppercase">Preguntas</h3>
        <ul className="grid gap-2 sm:grid-cols-3">
          <li className="brut bg-paper p-2"><b>Caso 1</b><br /><K>P(X ≤ k)</K> / <K>P(X &lt; k)</K></li>
          <li className="brut bg-paper p-2"><b>Caso 2</b><br /><K>P(X ≥ k)</K> / <K>P(X &gt; k)</K></li>
          <li className="brut bg-paper p-2"><b>Caso 3</b><br /><K>P(a ≤ X ≤ b)</K></li>
        </ul>
        <p className="mt-2 font-mono text-[12px]">Error relativo = |P̂ − P| / P × 100</p>
      </section>

      <section>
        <h3 className="mb-2 font-display text-sm uppercase">Etiquetas</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {STICKERS.map(([label, tone, desc]) => (
            <li key={label} className="flex items-start gap-2">
              <Sticker tone={tone} rot={-2} className="shrink-0">{label}</Sticker>
              <span className="text-[12px]">{desc}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 font-display text-sm uppercase">Motor de cálculo</h3>
        <EngineInfo />
        <p className="mt-2 text-[12px]">
          Mismos resultados con ambos. Si el servidor no responde, se calcula en tu dispositivo automáticamente.
        </p>
      </section>

      <section>
        <h3 className="mb-2 font-display text-sm uppercase">Archivos aceptados</h3>
        <p className="text-[13px]">
          <K>.xlsx</K> exportado por simulacion-trabajo (recomendado) · <K>.csv</K> con columnas <K>i,X_i,R_i,Estado</K> ·{' '}
          <K>.json</K> <K>[0.12, 0.5, …]</K> · texto con un valor por línea (acepta coma decimal).
        </p>
      </section>
    </div>
  );
}

export function Tutorial({
  open,
  initialTab = 'steps',
  hasData,
  onClose,
  onLoadExample,
}: {
  open: boolean;
  initialTab?: TutorialTab;
  hasData: boolean;
  onClose: () => void;
  onLoadExample: () => void;
}) {
  const [tab, setTab] = useState<TutorialTab>(initialTab);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setStep(0);
    }
  }, [open, initialTab]);

  const current = STEPS[step];
  const targetEl = () =>
    tab === 'steps' && current.target ? document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`) : null;

  useLayoutEffect(() => {
    if (!open) return;
    const el = targetEl();
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const fallback = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) el.scrollIntoView({ block: 'center' });
    }, 700);
    const update = () => {
      const r = el.getBoundingClientRect();
      setRect((prev) =>
        prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height ? prev : r,
      );
    };
    update();
    const id = window.setInterval(update, 120); // cubre el scroll suave y cambios de layout
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearTimeout(fallback);
      window.clearInterval(id);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, tab, hasData]);

  const close = () => {
    markSeen();
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (tab !== 'steps') return;
      if (e.key === 'ArrowRight') setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  if (!open) return null;

  const pad = 8;
  const CARD_W = 380;
  let side: { left: number; top: number } | null = null;
  if (tab === 'steps' && rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = cardRef.current?.offsetHeight ?? 360;
    const top = Math.max(16, Math.min(vh - h - 16, rect.top));
    if (rect.right + pad + 24 + CARD_W <= vw - 16) side = { left: rect.right + pad + 24, top };
    else if (rect.left - pad - 24 - CARD_W >= 16) side = { left: rect.left - pad - 24 - CARD_W, top };
  }
  const spotlight = rect && tab === 'steps';
  const last = step === STEPS.length - 1;
  const missing = tab === 'steps' && current.needsData && !hasData;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      {/* Oscurecido con "hueco" sobre el elemento resaltado */}
      {spotlight ? (
        (() => {
          const t = rect.top - pad;
          const l = rect.left - pad;
          const w = rect.width + pad * 2;
          const h = rect.height + pad * 2;
          const dim = 'pointer-events-none fixed bg-black/60';
          return (
            <>
              <div className={dim} style={{ top: 0, left: 0, right: 0, height: Math.max(0, t) }} />
              <div className={dim} style={{ top: t + h, left: 0, right: 0, bottom: 0 }} />
              <div className={dim} style={{ top: t, left: 0, width: Math.max(0, l), height: h }} />
              <div className={dim} style={{ top: t, left: l + w, right: 0, height: h }} />
              <div
                className="pointer-events-none fixed border-4 border-yellow shadow-[8px_8px_0_0_#FF41A5]"
                style={{ top: t, left: l, width: w, height: h }}
              />
            </>
          );
        })()
      ) : (
        <div className="fixed inset-0 bg-black/60" />
      )}
      {/* Captura clics fuera de la tarjeta (no cierra: evita perder el tutorial por accidente) */}
      <div className="fixed inset-0" />

      <div
        ref={cardRef}
        tabIndex={-1}
        className={`brut-panel fixed flex flex-col outline-none ${
          tab === 'summary'
            ? 'left-1/2 top-1/2 max-h-[calc(100vh-48px)] w-[min(680px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2'
            : side
              ? 'max-h-[calc(100vh-32px)] w-[380px]'
              : 'bottom-4 left-1/2 max-h-[min(60vh,520px)] w-[min(600px,calc(100vw-32px))] -translate-x-1/2'
        }`}
        style={side ?? undefined}
      >
        <header className="flex items-center gap-2 border-b-4 border-ink bg-yellow px-3 py-2 text-black">
          <div className="flex gap-2" role="tablist">
            <Button
              role="tab"
              aria-selected={tab === 'steps'}
              on={tab === 'steps'}
              tone={tab === 'steps' ? 'ink' : 'paper'}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px]"
              onClick={() => setTab('steps')}
            >
              <ListChecks size={14} /> Paso a paso
            </Button>
            <Button
              role="tab"
              aria-selected={tab === 'summary'}
              on={tab === 'summary'}
              tone={tab === 'summary' ? 'ink' : 'paper'}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px]"
              onClick={() => setTab('summary')}
            >
              <BookOpen size={14} /> Resumen
            </Button>
          </div>
          <button type="button" onClick={close} className="brut-btn ml-auto bg-paper p-1 text-ink" aria-label="Cerrar tutorial">
            <X size={18} strokeWidth={3} />
          </button>
        </header>

        <div className="brut-scroll overflow-y-auto p-5">
          {tab === 'summary' ? (
            <>
              <h2 id="tutorial-title" className="mb-4 font-display text-2xl uppercase leading-none">
                Resumen rápido
              </h2>
              <Summary />
            </>
          ) : (
            <>
              <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-widest opacity-70">
                {step === 0 ? 'Introducción' : `Paso ${step} de ${STEPS.length - 1}`}
              </div>
              <h2 id="tutorial-title" className="mb-3 font-display text-2xl uppercase leading-none">
                {current.title}
              </h2>
              <div className="font-grotesk text-[15px] leading-relaxed">{current.body}</div>
              {(current.target === 'source' || missing) && !hasData && (
                <div className="brut mt-4 space-y-3 bg-bg p-3">
                  <FileSpreadsheet size={20} className="float-left mr-2" />
                  <span className="block font-mono text-[12px] leading-snug">
                    {missing
                      ? 'Esta sección aparece cuando cargas un archivo. ¿Quieres verla con la plantilla de ejemplo?'
                      : '¿Aún no tienes tu archivo? Prueba con la plantilla de ejemplo (un Excel real de simulacion-trabajo).'}
                  </span>
                  <Button tone="green" className="px-3 py-1.5 text-[11px]" onClick={onLoadExample}>
                    Usar plantilla de ejemplo
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {tab === 'steps' && (
          <footer className="flex items-center gap-3 border-t-4 border-ink px-4 py-3">
            <div className="hidden flex-1 gap-1 sm:flex" aria-hidden="true">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  tabIndex={-1}
                  onClick={() => setStep(i)}
                  className={`h-3 flex-1 border-2 border-ink ${i === step ? 'bg-pink' : i < step ? 'bg-ink' : 'bg-paper'}`}
                />
              ))}
            </div>
            <button type="button" onClick={close} className="font-mono text-[11px] font-bold underline sm:hidden">
              Saltar
            </button>
            <div className="ml-auto flex gap-2">
              <Button
                className="flex items-center gap-1 px-3 py-2 text-xs"
                disabled={step === 0}
                onClick={() => setStep(step - 1)}
                aria-label="Paso anterior"
              >
                <ArrowLeft size={14} /> Atrás
              </Button>
              {last ? (
                <Button tone="green" className="px-4 py-2 text-xs" onClick={close}>
                  ¡Empezar!
                </Button>
              ) : (
                <Button tone="cobalt" className="flex items-center gap-1 px-4 py-2 text-xs" onClick={() => setStep(step + 1)}>
                  Siguiente <ArrowRight size={14} />
                </Button>
              )}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
