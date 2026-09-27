import { useEffect, useRef, useState } from 'react';

const ITEM_CH = 11;
const SPEED = 70;
const VISIBLE = 48;

export function Ticker({ values }: { values: readonly number[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<{ id: number; r: number }[]>([]);
  const cursor = useRef(0);
  const idRef = useRef(0);
  const valuesRef = useRef(values);

  const nextItem = () => {
    const v = valuesRef.current;
    const r = v[cursor.current % v.length];
    cursor.current++;
    return { id: idRef.current++, r };
  };

  useEffect(() => {
    valuesRef.current = values;
    cursor.current = 0;
    setItems(values.length ? Array.from({ length: VISIBLE }, nextItem) : []);
  }, [values]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || !values.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const fallback = ITEM_CH * parseFloat(getComputedStyle(el).fontSize) * 0.6;
    let offset = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      offset += (SPEED * Math.min(100, now - last)) / 1000;
      last = now;
      const itemPx = (el.children[0] as HTMLElement | undefined)?.offsetWidth || fallback;
      if (offset >= itemPx) {
        const shifts = Math.floor(offset / itemPx);
        offset -= shifts * itemPx;
        setItems((prev) => {
          const next = prev.slice(shifts);
          for (let s = 0; s < shifts; s++) next.push(nextItem());
          return next;
        });
      }
      el.style.transform = `translateX(${-offset}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.style.transform = '';
    };
  }, [values.length]);

  return (
    <div className="relative overflow-hidden border-y-4 border-ink bg-term text-term-fg" aria-hidden="true">
      <div className="absolute left-0 top-0 z-10 flex h-full items-center border-r-4 border-ink bg-green px-3 font-display text-xs text-black">
        R_i ARCHIVO
      </div>
      <div ref={trackRef} className="flex whitespace-nowrap py-1.5 pl-36 font-mono text-sm will-change-transform">
        {items.length === 0 ? (
          <span className="text-yellow">SIN DATOS ▪ SUBE TU ARCHIVO .XLSX EXPORTADO DE SIMULACION-TRABAJO ▪</span>
        ) : (
          items.map((it) => (
            <span key={it.id} style={{ width: `${ITEM_CH}ch` }} className="inline-block shrink-0">
              <span className={it.r < 0.1 || it.r > 0.9 ? 'text-pink' : it.r > 0.5 ? 'text-yellow' : ''}>
                {it.r.toFixed(6)}
              </span>
              <span className="opacity-40"> ▪</span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
