import { ChevronDown, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Sample } from '../engine/distributions';
import { Button, Segmented } from './ui';

const PAGE = 50;
const MAX_R_COLS = 12;

type Filter = 'all' | 'yes' | 'no';

export function DataDrawer({
  samples,
  test,
  onExport,
}: {
  samples: readonly Sample[];
  test: (x: number) => boolean;
  onExport: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(
    () => (filter === 'all' ? samples : samples.filter((s) => test(s.x) === (filter === 'yes'))),
    [samples, filter, test],
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  useEffect(() => setPage((p) => Math.min(p, pages - 1)), [pages]);
  const view = rows.slice(page * PAGE, page * PAGE + PAGE);
  const rCols = Math.min(MAX_R_COLS, view.reduce((m, s) => Math.max(m, s.rs.length), 0));

  return (
    <section className="brut-panel" data-tour="drawer">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 bg-pink px-4 py-3 text-left text-black"
      >
        <span className="font-mono text-[11px] font-bold">05</span>
        <span className="font-display text-lg uppercase leading-none">Data Drawer · Inspección de semillas</span>
        <span className="ml-auto font-mono text-xs font-bold">{samples.length.toLocaleString('es')} variables</span>
        <ChevronDown className={`transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={3} />
      </button>
      {open && (
        <div className="space-y-3 border-t-4 border-ink p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<Filter>
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setPage(0);
              }}
              size="sm"
              tone="yellow"
              options={[
                { value: 'all', label: 'Todas' },
                { value: 'yes', label: 'Cumplen' },
                { value: 'no', label: 'No cumplen' },
              ]}
            />
            <Button tone="green" className="ml-auto flex items-center gap-2 px-3 py-2 text-xs" onClick={onExport}>
              <Download size={14} /> Exportar CSV
            </Button>
          </div>

          <div className="brut brut-scroll overflow-auto bg-paper">
            <table className="w-full border-collapse font-mono text-xs">
              <thead className="bg-ink text-bg">
                <tr>
                  <th className="px-2 py-2 text-left">i</th>
                  {Array.from({ length: rCols }, (_, j) => (
                    <th key={j} className="px-2 py-2 text-left">
                      R<sub>{j + 1}</sub>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-left">…</th>
                  <th className="bg-cobalt px-2 py-2 text-left text-white">X_i</th>
                  <th className="px-2 py-2 text-left">¿Cumple?</th>
                </tr>
              </thead>
              <tbody>
                {view.map((s) => {
                  const ok = test(s.x);
                  return (
                    <tr key={s.i} className="border-b-2 border-ink/15 hover:bg-yellow/40">
                      <td className="px-2 py-1 font-bold">{s.i}</td>
                      {Array.from({ length: rCols }, (_, j) => (
                        <td key={j} className="px-2 py-1 whitespace-nowrap">
                          {s.rs[j] !== undefined ? s.rs[j].toFixed(5) : ''}
                        </td>
                      ))}
                      <td className="px-2 py-1 opacity-60" title={s.rs.length > rCols ? s.rs.map((r) => r.toFixed(5)).join(', ') : ''}>
                        {s.rs.length > rCols ? `+${s.rs.length - rCols}` : ''}
                      </td>
                      <td className="px-2 py-1 font-extrabold">{Number.isInteger(s.x) ? s.x : s.x.toFixed(5)}</td>
                      <td className="px-2 py-1">
                        <span
                          className={`inline-block border-2 border-black px-1.5 text-[10px] font-extrabold text-black ${
                            ok ? 'bg-green' : 'bg-red'
                          }`}
                        >
                          {ok ? 'SÍ' : 'NO'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between font-mono text-xs font-bold">
            <span>
              {rows.length ? `${page * PAGE + 1}–${Math.min(rows.length, (page + 1) * PAGE)} de ${rows.length}` : 'Sin filas'}
            </span>
            <div className="flex gap-2">
              <Button className="px-2 py-1" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Página anterior">
                <ChevronLeft size={16} />
              </Button>
              <span className="self-center">
                {page + 1}/{pages}
              </span>
              <Button className="px-2 py-1" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Página siguiente">
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
