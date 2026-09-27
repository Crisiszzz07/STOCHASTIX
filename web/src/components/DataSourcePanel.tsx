import { FileSpreadsheet, FileUp, Repeat } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { GENERATORS } from '../engine/generators';
import { downloadCsvTemplate } from '../io/export';
import { GENERATOR_SITE } from '../io/remote';
import type { ParsedSequence } from '../io/sequence';
import { Button, Panel, Sticker } from './ui';

export const FILE_ACCEPT = '.xlsx,.xlsm,.csv,.tsv,.json,.txt';

export function FileDrop({ onFile, big = false, children }: { onFile: (f: File) => void; big?: boolean; children?: ReactNode }) {
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      className={`border-[3px] border-dashed border-ink text-center transition-colors ${big ? 'p-8' : 'p-4'} ${
        dragging ? 'bg-yellow text-black' : 'bg-bg'
      }`}
    >
      <FileSpreadsheet className="mx-auto" size={big ? 48 : 30} />
      <p className={`mt-2 font-display uppercase ${big ? 'text-xl' : 'text-sm'}`}>
        Arrastra aquí tu Excel de simulacion-trabajo
      </p>
      <p className="font-mono text-[11px] opacity-70">.xlsx (plantilla) · .csv · .json · .txt</p>
      <Button
        tone="yellow"
        className={`mt-3 inline-flex items-center gap-2 ${big ? 'px-5 py-3 text-base' : 'px-4 py-2 text-xs'}`}
        onClick={() => ref.current?.click()}
      >
        <FileUp size={big ? 20 : 16} /> Seleccionar archivo
      </Button>
      <input
        ref={ref}
        type="file"
        accept={FILE_ACCEPT}
        className="hidden"
        aria-label="Seleccionar archivo de números R_i"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      {children}
    </div>
  );
}

function SequenceSummary({ seq }: { seq: ParsedSequence }) {
  const ok = seq.errors.length === 0 && seq.values.length > 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {ok ? (
          <Sticker tone="green" rot={-2}>
            {seq.values.length} R_i válidos
          </Sticker>
        ) : (
          <Sticker tone="red" rot={-3}>
            REJECTED
          </Sticker>
        )}
        {seq.generator && (
          <Sticker tone="yellow" rot={2}>
            {GENERATORS[seq.generator].label}
          </Sticker>
        )}
        {seq.cycles > 0 && (
          <Sticker tone="pink" rot={-1} title="Filas marcadas '🔄 Ciclo' en la plantilla">
            {seq.cycles} en ciclo
          </Sticker>
        )}
        {seq.boundary > 0 && (
          <Sticker tone="paper" rot={1} title="R_i = 0 ó 1: se ajustan a (0,1) donde se toma ln">
            {seq.boundary} en frontera
          </Sticker>
        )}
      </div>
      <div className="font-mono text-[11px] opacity-80">
        origen: {seq.origin} · formato {seq.format}
      </div>
      {seq.warnings.map((w) => (
        <div key={w} className="border-l-4 border-yellow pl-2 font-mono text-[11px]">
          {w}
        </div>
      ))}
      {seq.errors.length > 0 && (
        <ul className="brut max-h-36 overflow-auto bg-red px-3 py-2 font-mono text-[11px] font-bold text-black brut-scroll">
          {seq.errors.slice(0, 12).map((e, k) => (
            <li key={k}>
              {e.pos > 0 ? `L${e.pos}: ` : ''}
              {e.token && <code className="bg-black px-1 text-red">{e.token.slice(0, 24)}</code>} {e.reason}
            </li>
          ))}
          {seq.errors.length > 12 && <li>… y {seq.errors.length - 12} errores más</li>}
        </ul>
      )}
    </div>
  );
}

export function DataSourcePanel({
  seq,
  text,
  onText,
  onFile,
  wrap,
  onWrap,
  needed,
}: {
  seq: ParsedSequence | null;
  text: string;
  onText: (t: string) => void;
  onFile: (f: File) => void;
  wrap: boolean;
  onWrap: (w: boolean) => void;
  needed: number;
}) {
  const ok = seq && seq.errors.length === 0 && seq.values.length > 0;
  const short = ok && seq.values.length < needed && !wrap;

  return (
    <Panel
      title="Archivo de números R_i"
      kicker="01"
      tour="source"
      tone="cobalt"
      right={
        ok ? (
          <Sticker tone="green" rot={3}>
            Cargado
          </Sticker>
        ) : (
          <Sticker tone="red" rot={-3}>
            Sin archivo
          </Sticker>
        )
      }
    >
      <div className="space-y-4">
        <p className="font-mono text-[11px] leading-snug">
          Los R_i salen <b>únicamente</b> del archivo que exportas en{' '}
          <a href={GENERATOR_SITE} target="_blank" rel="noreferrer" className="underline decoration-2">
            simulacion-trabajo
          </a>{' '}
          (botón Exportar Excel). No se usan números aleatorios internos.
        </p>

        <FileDrop onFile={onFile} />

        <div className="flex flex-wrap gap-3 font-mono text-[11px]">
          <a className="underline decoration-2 underline-offset-2 hover:bg-yellow hover:text-black" href="/plantilla_simulacion.xlsx" download>
            ↓ plantilla .xlsx de ejemplo
          </a>
          <button type="button" className="underline decoration-2 underline-offset-2 hover:bg-yellow hover:text-black" onClick={downloadCsvTemplate}>
            ↓ plantilla .csv
          </button>
        </div>

        {seq && <SequenceSummary seq={seq} />}

        <details className="brut bg-paper px-3 py-2">
          <summary className="cursor-pointer font-grotesk text-xs font-bold uppercase">
            Ver / pegar los R_i como texto
          </summary>
          <textarea
            value={text}
            onChange={(e) => onText(e.target.value)}
            spellCheck={false}
            rows={6}
            placeholder={'0.5123\n0.0871\n0.9342\n…'}
            className="brut-input brut-scroll mt-2 w-full resize-y px-2 py-1.5 text-xs"
            aria-label="Valores R_i"
          />
        </details>

        <label className="flex cursor-pointer items-center gap-2 font-grotesk text-xs font-bold uppercase">
          <input type="checkbox" className="h-5 w-5 accent-pink" checked={wrap} onChange={(e) => onWrap(e.target.checked)} />
          <Repeat size={14} /> Reciclar la secuencia si se agota
        </label>
        {short && (
          <div className="brut bg-pink px-3 py-2 font-mono text-[11px] font-bold text-black">
            El archivo tiene {seq.values.length} R_i y se necesitan ≈ {Math.ceil(needed)} para N variables: se generarán
            menos (OVERFLOW). Exporta más números, baja N o activa "Reciclar".
          </div>
        )}
      </div>
    </Panel>
  );
}
