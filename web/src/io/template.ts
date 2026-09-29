/**
 * Interpreta la plantilla Excel exportada por https://simulacion-trabajo.vercel.app/
 *
 *   Fila 1  "📊  SIMULACIÓN — <Método>"        (el nombre de la hoja es el método)
 *   Fila 4  i | X_i | R_i | Estado |   | ⚙️ Parámetros
 *   Fila 5+ 1 | =MOD(...) | =B5/$G$8 | ✓ |   | Semilla (X0) | 4
 *                                            | a            | 21
 *                                            | c            | 7
 *                                            | m            | 2000
 *                                            | N            | 2000
 *
 * El exportador escribe fórmulas SIN valores en caché, así que cuando la celda R_i
 * no trae un número se reconstruye la serie con la misma recurrencia de la fórmula
 * (usando los parámetros de F:G). Si alguien pega números directamente en R_i
 * (o guarda el archivo desde Excel, que sí cachea), se usan esos números.
 */
import { generateSequence, GENERATORS, type GeneratorMethod } from '../engine/generators';
import { readWorkbook, type Cell, type Sheet } from './xlsx';
import { emptySequence, pushValue, type ParsedSequence } from './sequence';

const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ref = (col: number, row: number) => `${COLS[col]}${row}`;

const text = (c?: Cell) => (c && typeof c.value === 'string' ? c.value.trim() : '');
const num = (c?: Cell): number | null => (c && typeof c.value === 'number' ? c.value : null);

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function detectGenerator(name: string): GeneratorMethod | undefined {
  const n = norm(name);
  if (n.includes('mixto')) return 'mixto';
  if (n.includes('multiplicativo')) return 'multiplicativo';
  if (n.includes('cuadrat')) return 'cuadratico';
  if (n.includes('blum') || n.includes('bbs')) return 'bbs';
  if (n.includes('xorshift')) return 'xorshift';
  return undefined;
}

/** "Semilla (X0)" → seed, "a (Shift Izq)" → a, "M calculado" → M, "N" → N */
function paramKey(label: string): string | null {
  if (/^semilla/i.test(label)) return 'seed';
  const first = label.split(/[\s(]/)[0];
  return /^[a-zA-Z]$/.test(first) ? first : null;
}

interface Layout {
  headerRow: number;
  colI: number;
  colX: number;
  colR: number;
  colState: number;
}

function findLayout(sheet: Sheet): Layout | null {
  for (let row = 1; row <= Math.min(sheet.maxRow, 30); row++) {
    let colI = -1, colX = -1, colR = -1, colState = -1;
    for (let col = 0; col < 12; col++) {
      const t = text(sheet.cells.get(ref(col, row)));
      if (t === 'i') colI = col;
      else if (/^X_i/i.test(t)) colX = col;
      else if (/^R_i(\s*\(.*\))?$/i.test(t)) colR = col;
      else if (/^estado/i.test(t)) colState = col;
    }
    if (colR >= 0) return { headerRow: row, colI, colX, colR, colState };
  }
  return null;
}

function readParams(sheet: Sheet): Record<string, number> {
  const params: Record<string, number> = {};
  for (const [addr, cell] of sheet.cells) {
    if (!/par[aá]metros/i.test(text(cell))) continue;
    const col = COLS.indexOf(addr.replace(/\d+$/, ''));
    const row = parseInt(addr.replace(/^[A-Z]+/, ''), 10);
    for (let r = row + 1; r < row + 20; r++) {
      const label = text(sheet.cells.get(ref(col, r)));
      if (!label) break;
      const key = paramKey(label);
      const value = num(sheet.cells.get(ref(col + 1, r)));
      if (key && value !== null) params[key] = value;
    }
    break;
  }
  return params;
}

export function parseTemplateWorkbook(data: Uint8Array, origin: string): ParsedSequence {
  const seq = emptySequence(origin, 'xlsx');
  const sheets = readWorkbook(data);
  const sheet =
    sheets.find((s) => !/auxiliar/i.test(s.name) && findLayout(s)) ??
    sheets.find((s) => findLayout(s));
  if (!sheet) {
    seq.errors.push({ pos: 0, token: '', reason: 'No se encontró la cabecera "i | X_i | R_i | Estado" de la plantilla.' });
    return seq;
  }
  const layout = findLayout(sheet)!;
  const params = readParams(sheet);
  const generator = detectGenerator(sheet.name) ?? detectGenerator(text(sheet.cells.get('A1')));
  seq.generator = generator;
  seq.params = params;

  // Filas de datos: desde la cabecera hasta que la columna i deje de ser numérica.
  const rows: { row: number; r: Cell | undefined; x: Cell | undefined }[] = [];
  for (let row = layout.headerRow + 1; row <= sheet.maxRow; row++) {
    const iCell = layout.colI >= 0 ? sheet.cells.get(ref(layout.colI, row)) : undefined;
    const rCell = sheet.cells.get(ref(layout.colR, row));
    if (layout.colI >= 0 ? num(iCell) === null : !rCell) break;
    rows.push({ row, r: rCell, x: layout.colX >= 0 ? sheet.cells.get(ref(layout.colX, row)) : undefined });
    if (layout.colState >= 0 && /ciclo/i.test(text(sheet.cells.get(ref(layout.colState, row))))) seq.cycles++;
  }
  if (!rows.length) {
    seq.errors.push({ pos: layout.headerRow, token: '', reason: 'La plantilla no tiene filas de datos.' });
    return seq;
  }

  const isBbs = generator === 'bbs';
  const cachedR = rows.every((r) => num(r.r) !== null);
  const cachedX = rows.every((r) => num(r.x) !== null);

  if (isBbs) {
    // En BBS la columna R_i es un bit de paridad (0/1), que no es U(0,1).
    // Se usa R_i = X_i / M, con M = p·q.
    const M = params.M ?? (params.p && params.q ? params.p * params.q : NaN);
    if (!(M > 1)) {
      seq.errors.push({ pos: 0, token: '', reason: 'Blum Blum Shub: faltan p, q o M en los parámetros.' });
      return seq;
    }
    const xs = cachedX
      ? rows.map((r) => num(r.x)!)
      : generateSequence('bbs', { ...params, M }, rows.length).x;
    xs.forEach((x, k) => pushValue(seq, x / M, rows[k].row, String(x)));
    seq.warnings.push('Blum Blum Shub exporta un bit de paridad en R_i; se usa R_i = X_i / M para obtener U(0,1).');
    return seq;
  }

  if (cachedR) {
    rows.forEach((r) => pushValue(seq, num(r.r)!, r.row, String(r.r!.value)));
    return seq;
  }

  if (!generator) {
    seq.errors.push({
      pos: 0,
      token: sheet.name,
      reason: 'R_i contiene fórmulas sin valores y no se reconoce el método de la hoja para recalcularlas.',
    });
    return seq;
  }
  const missing = GENERATORS[generator].params.filter((p) => params[p.key] === undefined).map((p) => p.label);
  if (missing.length) {
    seq.errors.push({ pos: 0, token: '', reason: `Faltan parámetros en la plantilla: ${missing.join(', ')}` });
    return seq;
  }
  // Se respetan números pegados a mano en filas sueltas; el resto se recalcula.
  const gen = generateSequence(generator, params, rows.length);
  rows.forEach((r, k) => {
    const v = num(r.r) ?? gen.r[k];
    pushValue(seq, v, r.row, String(v));
  });
  seq.warnings.push(
    `Fórmulas de "${sheet.name}" recalculadas con ${Object.entries(params)
      .filter(([k]) => k !== 'N')
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}.`,
  );
  return seq;
}
