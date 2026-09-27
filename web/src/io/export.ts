import type { Sample } from '../engine/distributions';

function download(name: string, content: string, type = 'text/csv;charset=utf-8') {
  // BOM para que Excel reconozca UTF-8 (acentos, ≤, etc.)
  const blob = new Blob(['﻿' + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSamplesCsv(
  samples: readonly Sample[],
  test: (x: number) => boolean,
  meta: { dist: string; method: string; query: string },
) {
  const maxR = samples.reduce((m, s) => Math.max(m, s.rs.length), 0);
  const header = ['i', ...Array.from({ length: maxR }, (_, j) => `R_${j + 1}`), 'X_i', 'Cumple'];
  const rows = samples.map((s) => [
    s.i,
    ...Array.from({ length: maxR }, (_, j) => (s.rs[j] !== undefined ? s.rs[j].toFixed(8) : '')),
    Number.isInteger(s.x) ? s.x : s.x.toFixed(8),
    test(s.x) ? 'SI' : 'NO',
  ]);
  const lines = [
    `# STOCHASTIX · ${meta.dist} · ${meta.method}`,
    `# Condición: ${meta.query}`,
    header.join(','),
    ...rows.map((r) => r.join(',')),
  ];
  download(`stochastix_${meta.dist.replace(/\W+/g, '_')}.csv`, lines.join('\n'));
}

/** Plantilla CSV con las mismas columnas que el Excel de simulacion-trabajo. */
export function downloadCsvTemplate() {
  const lines = ['i,X_i,R_i,Estado'];
  const demo = [0.5123, 0.0871, 0.9342, 0.3310, 0.7765];
  demo.forEach((r, k) => lines.push(`${k + 1},,${r},✓`));
  download('plantilla_stochastix.csv', lines.join('\n'));
}
