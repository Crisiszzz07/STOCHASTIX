import { BookOpen, Contrast, Cpu, ExternalLink, FileSpreadsheet, GraduationCap, Server } from 'lucide-react';
import { GENERATORS } from '../engine/generators';
import type { Engine } from '../hooks/useSimulation';
import { GENERATOR_SITE } from '../io/remote';
import type { ParsedSequence } from '../io/sequence';
import { Ticker } from './Ticker';
import { Button, Sticker } from './ui';

const EMPTY: number[] = [];

export function Header({
  theme,
  onTheme,
  engine,
  onEngine,
  goStatus,
  seq,
  onHelp,
}: {
  onHelp: (tab: 'steps' | 'summary') => void;
  theme: 'light' | 'dark';
  onTheme: () => void;
  engine: Engine;
  onEngine: (e: Engine) => void;
  goStatus: 'unknown' | 'online' | 'offline';
  seq: ParsedSequence | null;
}) {
  const ok = !!seq && seq.errors.length === 0 && seq.values.length > 0;
  return (
    <header className="border-b-4 border-ink bg-bg">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-end gap-x-6 gap-y-4 px-4 pb-4 pt-5 md:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-widest">
            <span className="bg-ink px-1.5 py-0.5 text-bg" title="Raúl Coss Bu · Simulación: un enfoque práctico">
              Coss Bu · Cap. 4
            </span>
            <span className="hidden sm:inline">Simulación: un enfoque práctico</span>
          </div>
          <h1 className="font-display text-[clamp(2.6rem,9vw,6.5rem)] uppercase leading-[0.82] tracking-tighter">
            STOCHASTIX
            <span className="text-cobalt">//</span>
          </h1>
          <p className="mt-1 font-grotesk text-sm font-bold uppercase tracking-[0.25em] md:text-base">
            Taller de Simulación
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-end gap-3">
          {/* Ayuda siempre disponible */}
          <div className="flex flex-col gap-2">
            <Button
              tone="pink"
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px]"
              onClick={() => onHelp('steps')}
              title="Ver el tutorial paso a paso"
            >
              <GraduationCap size={15} /> Tutorial
            </Button>
            <Button
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px]"
              onClick={() => onHelp('summary')}
              title="Ver el resumen rápido"
            >
              <BookOpen size={14} /> Resumen
            </Button>
          </div>

          {/* Fuente activa: siempre un archivo */}
          <div className={`brut max-w-xs p-2 text-black ${ok ? 'bg-yellow' : 'bg-red'}`} data-tour="file-status">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-display text-[11px] uppercase">
                <FileSpreadsheet size={14} /> Fuente de R_i
              </span>
              {ok && (
                <Sticker tone="green" rot={3} className="-my-2">
                  SEED ACTIVE
                </Sticker>
              )}
            </div>
            <div className="truncate font-mono text-sm font-extrabold" title={seq?.origin}>
              {ok ? seq!.origin : 'Ningún archivo cargado'}
            </div>
            <div className="font-mono text-[11px]">
              {ok
                ? `${seq!.values.length.toLocaleString('es')} R_i${seq!.generator ? ` · ${GENERATORS[seq!.generator].label}` : ''}`
                : 'Sube tu .xlsx en el panel 01'}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex gap-2" role="radiogroup" aria-label="Motor de cálculo" data-tour="engine">
              <Button
                on={engine === 'ts'}
                tone={engine === 'ts' ? 'cobalt' : 'paper'}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px]"
                onClick={() => onEngine('ts')}
                title="Calcular en tu dispositivo (instantáneo, sin internet)"
              >
                <Cpu size={14} /> Cliente TS
              </Button>
              <Button
                on={engine === 'go'}
                tone={engine === 'go' ? 'cobalt' : 'paper'}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px]"
                onClick={() => onEngine('go')}
                title="Calcular en el servidor de la página (backend en Go)"
              >
                <Server size={14} /> Servidor Go
                <span
                  className={`ml-1 inline-block h-2.5 w-2.5 border-2 border-black ${
                    goStatus === 'online' ? 'bg-green' : goStatus === 'offline' ? 'bg-red' : 'bg-paper'
                  }`}
                />
              </Button>
            </div>
            <div className="flex gap-2">
              <a
                href={GENERATOR_SITE}
                target="_blank"
                rel="noreferrer"
                className="brut-btn flex items-center gap-1.5 bg-green px-2.5 py-1.5 font-display text-[11px] uppercase text-black"
                data-tour="generator"
              >
                Generador <ExternalLink size={13} />
              </a>
              <Button
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px]"
                onClick={onTheme}
                title="Alternar alto contraste"
              >
                <Contrast size={14} /> {theme === 'light' ? 'Invertir' : 'Crema'}
              </Button>
            </div>
          </div>
        </div>
      </div>
      <Ticker values={ok ? seq!.values : EMPTY} />
    </header>
  );
}
