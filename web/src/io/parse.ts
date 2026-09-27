import { parseTemplateWorkbook } from './template';
import { emptySequence, pushValue, type ParsedSequence } from './sequence';

/** Convierte "0,123" en 0.123 cuando la coma es claramente decimal. */
function toNumber(token: string): number {
  const t = token.trim().replace(/^["']|["']$/g, '');
  if (t === '') return NaN;
  return Number(/^-?\d+,\d+$/.test(t) ? t.replace(',', '.') : t);
}

/**
 * Texto libre: números separados por saltos de línea, espacios, ';', tabs o comas.
 * Si la lista usa ';' o saltos de línea, la coma se interpreta como decimal (0,5).
 */
export function parsePlainText(input: string, origin = 'Textarea'): ParsedSequence {
  const seq = emptySequence(origin, 'texto');
  const commaIsDecimal =
    /\d,\d/.test(input) &&
    (/;/.test(input) || (!/\d\.\d/.test(input) && !/,\s/.test(input) && !/\d,\d+,\d/.test(input)));
  const lines = input.split(/\r?\n/);
  lines.forEach((line, li) => {
    if (line.trim().startsWith('#')) return; // comentario
    const tokens = line.split(commaIsDecimal ? /[\s;\t]+/ : /[\s;,\t]+/).filter(Boolean);
    for (const tok of tokens) pushValue(seq, toNumber(tok), li + 1, tok);
  });
  return seq;
}

/** CSV con cabecera de la plantilla (i, X_i, R_i, Estado) o una lista simple. */
export function parseCsv(input: string, origin: string): ParsedSequence {
  const lines = input.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return emptySequence(origin, 'csv');
  const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const headerIdx = lines.findIndex((l) => /(^|[;,\t"])\s*R_?i\b/i.test(l) || /(^|[;,\t"])\s*r\s*($|[;,\t"])/i.test(l));
  if (headerIdx < 0) {
    const s = parsePlainText(input, origin);
    s.format = 'csv';
    return s;
  }
  const seq = emptySequence(origin, 'csv');
  const header = lines[headerIdx].split(sep).map((h) => h.trim().replace(/^"|"$/g, ''));
  const col = header.findIndex((h) => /^R_?i\b/i.test(h) || /^r$/i.test(h));
  const stateCol = header.findIndex((h) => /^estado/i.test(h));
  for (let li = headerIdx + 1; li < lines.length; li++) {
    const cells = lines[li].split(sep);
    const tok = cells[col] ?? '';
    if (tok.trim() === '') continue;
    pushValue(seq, toNumber(tok), li + 1, tok);
    if (stateCol >= 0 && /ciclo/i.test(cells[stateCol] ?? '')) seq.cycles++;
  }
  return seq;
}

/**
 * JSON aceptado:
 *   [0.12, 0.5, …]
 *   [{ "r": 0.12 }, { "R_i": 0.5 }, …]
 *   { "data": [{ "i":1, "x":3, "r":0.375 }, …] }   ← respuesta de /api/generate de simulacion-trabajo
 *   { "values": [...] } | { "R": [...] }
 */
export function parseJson(input: string, origin: string): ParsedSequence {
  const seq = emptySequence(origin, 'json');
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch (e) {
    seq.errors.push({ pos: 0, token: '', reason: `JSON inválido: ${(e as Error).message}` });
    return seq;
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    data = o.data ?? o.values ?? o.R ?? o.r ?? o.R_i ?? o.uniforms;
  }
  if (!Array.isArray(data)) {
    seq.errors.push({ pos: 0, token: '', reason: 'Se esperaba un arreglo de números u objetos con "r".' });
    return seq;
  }
  data.forEach((item, k) => {
    let v: unknown = item;
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      v = o.r ?? o.R ?? o.R_i ?? o.value;
      if (o.is_repeat === true) seq.cycles++;
    }
    const n = typeof v === 'number' ? v : typeof v === 'string' ? toNumber(v) : NaN;
    pushValue(seq, n, k + 1, JSON.stringify(v));
  });
  return seq;
}

export async function parseFile(file: File): Promise<ParsedSequence> {
  const name = file.name;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'xlsx' || ext === 'xlsm') {
    const buf = new Uint8Array(await file.arrayBuffer());
    try {
      return parseTemplateWorkbook(buf, name);
    } catch (e) {
      const s = emptySequence(name, 'xlsx');
      s.errors.push({ pos: 0, token: '', reason: (e as Error).message });
      return s;
    }
  }
  if (ext === 'xls') {
    const s = emptySequence(name, 'xlsx');
    s.errors.push({ pos: 0, token: '', reason: 'Formato .xls antiguo no soportado: guarda como .xlsx o exporta CSV.' });
    return s;
  }
  const content = await file.text();
  if (ext === 'json') return parseJson(content, name);
  if (ext === 'csv' || ext === 'tsv') return parseCsv(content, name);
  const t = content.trim();
  if (t.startsWith('[') || t.startsWith('{')) return parseJson(content, name);
  return parseCsv(content, name);
}
