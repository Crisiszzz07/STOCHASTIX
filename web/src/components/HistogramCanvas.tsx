import { useEffect, useRef, useState } from 'react';
import type { DistSpec, Params } from '../engine/distributions';
import type { Bin, Histogram } from '../engine/histogram';
import { fmtNum, satisfies, type Query } from '../engine/query';
export const PAD = { left: 64, right: 22, top: 22, bottom: 44 };

function niceStep(span: number, target: number): number {
  const raw = span / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n >= 5 ? 10 : n >= 2 ? 5 : n >= 1 ? 2 : 1) * mag;
}

function ticks(min: number, max: number, target: number, integer: boolean): number[] {
  let step = niceStep(max - min, target);
  if (integer) step = Math.max(1, Math.round(step));
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

function palette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    ink: v('--ink'), paper: v('--paper'), bg: v('--bg'), grid: v('--grid'), muted: v('--muted'),
    yellow: v('--yellow'), cobalt: v('--cobalt'), red: v('--red'), pink: v('--pink'), green: v('--green'),
  };
}

function conditionSpan(q: Query, xMin: number, xMax: number): [number, number] {
  switch (q.mode) {
    case 'left':
      return [xMin, q.k];
    case 'right':
      return [q.k, xMax];
    case 'interval':
      return [q.a, q.b];
  }
}

export function HistogramCanvas({
  hist,
  dist,
  params,
  query,
  theme,
  height = 400,
}: {
  hist: Histogram;
  dist: DistSpec;
  params: Params;
  query: Query;
  theme: string;
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<{ bin: Bin; px: number; py: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { bins, xMin, xMax, discrete } = hist;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  // Escala Y: máximo entre barras y curva teórica
  let yMax = 0;
  for (const b of bins) yMax = Math.max(yMax, b.height, discrete ? b.expectedRel : 0);
  if (!discrete) {
    for (let i = 0; i <= 200; i++) yMax = Math.max(yMax, dist.density(xMin + ((xMax - xMin) * i) / 200, params));
  }
  yMax = (yMax || 1) * 1.12;

  const sx = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y: number) => PAD.top + plotH - (y / yMax) * plotH;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const C = palette();
    const mono = (size: number, weight = 700) => `${weight} ${size}px "JetBrains Mono", monospace`;

    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, width, height);

    const yTicks = ticks(0, yMax, 5, false);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (const t of yTicks) {
      ctx.beginPath();
      ctx.moveTo(PAD.left, sy(t) + 0.5);
      ctx.lineTo(PAD.left + plotW, sy(t) + 0.5);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const [c0, c1] = conditionSpan(query, xMin, xMax);
    const clipCondition = () => {
      const a = Math.max(xMin, Math.min(c0, c1));
      const b = Math.min(xMax, Math.max(c0, c1));
      ctx.beginPath();
      ctx.rect(sx(a), PAD.top - 4, Math.max(0, sx(b) - sx(a)), plotH + 4);
      ctx.clip();
    };

    const barRect = (b: Bin) => {
      const x0 = discrete ? sx(b.center - 0.4) : sx(b.lo);
      const x1 = discrete ? sx(b.center + 0.4) : sx(b.hi);
      return { x: x0, y: sy(b.height), w: Math.max(1, x1 - x0), h: sy(0) - sy(b.height) };
    };
    const drawBars = (fill: string, only?: (b: Bin) => boolean) => {
      for (const b of bins) {
        if (b.count === 0 || (only && !only(b))) continue;
        const r = barRect(b);
        ctx.fillStyle = fill;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        const lw = r.w > 8 ? 3 : r.w > 3 ? 1.5 : 0;
        if (lw) {
          ctx.strokeStyle = '#000';
          ctx.lineWidth = lw;
          ctx.strokeRect(r.x + lw / 2, r.y + lw / 2, r.w - lw, r.h - lw);
        }
      }
    };
    drawBars(C.cobalt);
    if (discrete) {
      drawBars(C.yellow, (b) => satisfies(b.center, query));
    } else {
      ctx.save();
      clipCondition();
      drawBars(C.yellow);
      ctx.restore();
    }

    if (!discrete) {
      const pts: [number, number][] = [];
      const steps = Math.max(200, Math.floor(plotW));
      for (let i = 0; i <= steps; i++) {
        const x = xMin + ((xMax - xMin) * i) / steps;
        pts.push([sx(x), sy(dist.density(x, params))]);
      }
      ctx.save();
      clipCondition();
      ctx.beginPath();
      ctx.moveTo(pts[0][0], sy(0));
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.lineTo(pts[pts.length - 1][0], sy(0));
      ctx.closePath();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = C.pink;
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.clip();
      ctx.strokeStyle = C.pink;
      ctx.lineWidth = 1.5;
      for (let x = -height; x < width; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(x + height, 0);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      const stroke = (color: string, w: number) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.lineJoin = 'round';
        ctx.stroke();
      };
      stroke('#000', 7);
      stroke(C.red, 3.5);
    } else {
      const pts = bins.map((b) => [sx(b.center), sy(b.expectedRel), b.center] as const);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = C.red;
      ctx.lineWidth = 3;
      ctx.stroke();
      const s = Math.min(12, Math.max(6, plotW / bins.length / 3));
      for (const [x, y, k] of pts) {
        ctx.fillStyle = satisfies(k, query) ? C.pink : C.red;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - s / 2, y - s / 2, s, s);
      }
    }

    const marks = query.mode === 'interval' ? [query.a, query.b] : [query.k];
    ctx.font = mono(11, 800);
    for (const m of marks) {
      if (m < xMin || m > xMax) continue;
      const x = Math.round(sx(m)) + 0.5;
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      const label = fmtNum(m, 3);
      const tw = ctx.measureText(label).width + 10;
      const lx = Math.min(width - PAD.right - tw, Math.max(PAD.left, x - tw / 2));
      ctx.fillStyle = C.pink;
      ctx.fillRect(lx, PAD.top - 2, tw, 16);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(lx, PAD.top - 2, tw, 16);
      ctx.fillStyle = '#000';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx + 5, PAD.top + 6);
    }

    // Ejes
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top - 6);
    ctx.lineTo(PAD.left, PAD.top + plotH);
    ctx.lineTo(PAD.left + plotW + 6, PAD.top + plotH);
    ctx.stroke();

    ctx.fillStyle = C.ink;
    ctx.font = mono(11);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const t of yTicks) {
      ctx.fillRect(PAD.left - 7, sy(t) - 1, 7, 2);
      ctx.fillText(t < 0.01 && t > 0 ? t.toExponential(0) : fmtNum(t, 3), PAD.left - 10, sy(t));
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xTicks = ticks(discrete ? Math.ceil(xMin) : xMin, xMax, Math.max(4, Math.floor(plotW / 70)), discrete);
    for (const t of xTicks) {
      ctx.fillRect(sx(t) - 1, PAD.top + plotH, 2, 7);
      ctx.fillText(fmtNum(t, 3), sx(t), PAD.top + plotH + 10);
    }

    ctx.font = mono(10, 800);
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'right';
    ctx.fillText('x', PAD.left + plotW, PAD.top + plotH + 26);
    ctx.save();
    ctx.translate(14, PAD.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(discrete ? 'FRECUENCIA RELATIVA · p(k)' : 'DENSIDAD · f(x)', 0, 0);
    ctx.restore();

    if (hover) {
      const r = barRect(hover.bin);
      ctx.strokeStyle = C.pink;
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(r.x - 2, PAD.top, r.w + 4, plotH);
      ctx.setLineDash([]);
    }
  }, [bins, width, height, theme, query, dist, params, discrete, xMin, xMax, yMax, plotW, plotH, hover]);

  const onMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const x = xMin + ((px - PAD.left) / plotW) * (xMax - xMin);
    const bin = discrete ? bins.find((b) => Math.abs(b.center - x) <= 0.5) : bins.find((b) => x >= b.lo && x < b.hi);
    setHover(bin && px >= PAD.left && px <= PAD.left + plotW ? { bin, px, py } : null);
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        style={{ width, height, display: 'block' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Histograma de ${hist.bins.reduce((s, b) => s + b.count, 0)} valores simulados con la curva teórica superpuesta`}
      />
      {hover && (
        <div
          className="brut pointer-events-none absolute z-10 bg-yellow px-2 py-1 font-mono text-[11px] font-bold text-black"
          style={{
            left: Math.min(hover.px + 14, width - 190),
            top: Math.max(0, hover.py - 70),
          }}
        >
          <div>{discrete ? `X = ${hover.bin.center}` : `[${fmtNum(hover.bin.lo, 3)}, ${fmtNum(hover.bin.hi, 3)})`}</div>
          <div>fo = {hover.bin.count} · fr = {hover.bin.rel.toFixed(4)}</div>
          <div>fe = {hover.bin.expected.toFixed(2)} · p = {hover.bin.expectedRel.toFixed(4)}</div>
        </div>
      )}
    </div>
  );
}
