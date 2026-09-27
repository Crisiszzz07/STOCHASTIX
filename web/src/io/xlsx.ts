/**
 * Lector mínimo de .xlsx (ZIP + SpreadsheetML) sin dependencias pesadas.
 * Devuelve, por hoja, un mapa "A5" → { value, formula }.
 * Funciona igual en navegador y en Node (tests), porque no usa DOMParser.
 */
import { unzipSync, strFromU8 } from 'fflate';

export interface Cell {
  /** valor en caché (número o texto) — puede faltar si la celda sólo tiene fórmula */
  value: number | string | null;
  formula: string | null;
}

export interface Sheet {
  name: string;
  cells: Map<string, Cell>;
  maxRow: number;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return m ? decodeXml(m[1]) : null;
}

function textOf(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

export function rowOf(ref: string): number {
  return parseInt(ref.replace(/^[A-Z]+/, ''), 10);
}

export function readWorkbook(data: Uint8Array): Sheet[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new Error('El archivo no es un .xlsx válido (no se pudo descomprimir).');
  }
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : null);

  const workbook = read('xl/workbook.xml');
  if (!workbook) throw new Error('El .xlsx no contiene xl/workbook.xml.');

  const shared: string[] = [];
  const sst = read('xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));

  const rels = new Map<string, string>();
  const relXml = read('xl/_rels/workbook.xml.rels') ?? '';
  for (const m of relXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], 'Id');
    const target = attr(m[1], 'Target');
    if (id && target) rels.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }

  const sheets: Sheet[] = [];
  let idx = 0;
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    idx++;
    const name = attr(m[1], 'name') ?? `Hoja${idx}`;
    const rid = attr(m[1], 'r:id');
    const path = (rid && rels.get(rid)) || `xl/worksheets/sheet${idx}.xml`;
    const xml = read(path);
    if (!xml) continue;
    const cells = new Map<string, Cell>();
    let maxRow = 0;
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], 'r');
      if (!ref) continue;
      const type = attr(c[1], 't');
      const inner = c[2] ?? '';
      const f = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(inner);
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
      let value: number | string | null = null;
      if (type === 's' && v) value = shared[parseInt(v[1], 10)] ?? null;
      else if (type === 'inlineStr') value = textOf(inner);
      else if (type === 'str' && v) value = decodeXml(v[1]);
      else if (type === 'b' && v) value = v[1] === '1' ? 1 : 0;
      else if (type === 'e') value = null;
      else if (v && v[1] !== '') {
        const n = Number(v[1]);
        value = Number.isFinite(n) ? n : decodeXml(v[1]);
      }
      cells.set(ref, { value, formula: f ? decodeXml(f[1]) : null });
      maxRow = Math.max(maxRow, rowOf(ref));
    }
    sheets.push({ name, cells, maxRow });
  }
  if (!sheets.length) throw new Error('El .xlsx no contiene hojas legibles.');
  return sheets;
}
