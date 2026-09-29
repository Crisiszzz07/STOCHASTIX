/**
 * Escritor mínimo de .xlsx con estilos (SpreadsheetML + ZIP con fflate).
 * Admite texto, números, fórmulas con valor en caché, celdas combinadas,
 * anchos de columna y paneles inmovilizados. Sin dependencias pesadas.
 */
import { strToU8, zipSync } from 'fflate';

export type StyleName =
  | 'default' | 'title' | 'subtitle' | 'section' | 'header' | 'label' | 'text'
  | 'int' | 'num4' | 'num6' | 'pct' | 'ok' | 'bad' | 'hlText' | 'hlInt' | 'hlNum6' | 'note' | 'plain';

/** Una fórmula (sin '=') con su resultado ya calculado, para que el archivo se vea bien sin recalcular. */
export interface Formula {
  f: string;
  v: number | string;
}

export type Value = string | number | Formula | null | undefined;

export interface Cell {
  v: Value;
  s?: StyleName;
}

export interface SheetSpec {
  name: string;
  /** filas 0-based; cada fila es un arreglo de celdas (índice = columna 0-based) */
  rows: (Cell | undefined)[][];
  widths?: number[];
  merges?: string[];
  /** fila/columna 0-based de la primera celda desplazable */
  freeze?: { row: number; col: number };
}

// ---------------------------------------------------------------------------
// Estilos (orden = índice cellXfs)
// ---------------------------------------------------------------------------
const FONTS = [
  '<font><sz val="11"/><name val="Calibri"/></font>',
  '<font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
  '<font><i/><sz val="10"/><color rgb="FF5B5750"/><name val="Calibri"/></font>',
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
  '<font><b/><sz val="11"/><name val="Calibri"/></font>',
];
const FILLS = [
  '<fill><patternFill patternType="none"/></fill>',
  '<fill><patternFill patternType="gray125"/></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FF000000"/></patternFill></fill>', // 2 negro
  '<fill><patternFill patternType="solid"><fgColor rgb="FF1D3CFF"/></patternFill></fill>', // 3 cobalto
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFFE600"/></patternFill></fill>', // 4 amarillo
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF4F0EA"/></patternFill></fill>', // 5 crema
  '<fill><patternFill patternType="solid"><fgColor rgb="FF00E676"/></patternFill></fill>', // 6 verde
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFF3B30"/></patternFill></fill>', // 7 rojo
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF6A8"/></patternFill></fill>', // 8 amarillo suave
];
const BORDERS = [
  '<border><left/><right/><top/><bottom/><diagonal/></border>',
  '<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>',
  '<border><left style="medium"><color rgb="FF000000"/></left><right style="medium"><color rgb="FF000000"/></right><top style="medium"><color rgb="FF000000"/></top><bottom style="medium"><color rgb="FF000000"/></bottom><diagonal/></border>',
];
// numFmtId: 0 General, 1 "0", 10 "0.00%"; 164 "0.0000", 165 "0.000000"
const NUMFMTS = '<numFmts count="2"><numFmt numFmtId="164" formatCode="0.0000"/><numFmt numFmtId="165" formatCode="0.000000"/></numFmts>';

const STYLE_DEFS: Record<StyleName, { font: number; fill: number; border: number; fmt: number; align?: string }> = {
  default: { font: 0, fill: 0, border: 0, fmt: 0 },
  title: { font: 1, fill: 2, border: 0, fmt: 0, align: '<alignment vertical="center"/>' },
  subtitle: { font: 2, fill: 0, border: 0, fmt: 0 },
  section: { font: 3, fill: 3, border: 2, fmt: 0 },
  header: { font: 4, fill: 4, border: 2, fmt: 0, align: '<alignment horizontal="center" vertical="center" wrapText="1"/>' },
  label: { font: 4, fill: 5, border: 1, fmt: 0 },
  text: { font: 0, fill: 0, border: 1, fmt: 0, align: '<alignment wrapText="1" vertical="top"/>' },
  int: { font: 0, fill: 0, border: 1, fmt: 1 },
  num4: { font: 0, fill: 0, border: 1, fmt: 164 },
  num6: { font: 0, fill: 0, border: 1, fmt: 165 },
  pct: { font: 0, fill: 0, border: 1, fmt: 10 },
  ok: { font: 4, fill: 6, border: 1, fmt: 0, align: '<alignment horizontal="center"/>' },
  bad: { font: 4, fill: 7, border: 1, fmt: 0, align: '<alignment horizontal="center"/>' },
  hlText: { font: 0, fill: 8, border: 1, fmt: 0 },
  hlInt: { font: 0, fill: 8, border: 1, fmt: 1 },
  hlNum6: { font: 0, fill: 8, border: 1, fmt: 165 },
  note: { font: 2, fill: 0, border: 0, fmt: 0, align: '<alignment wrapText="1" vertical="top"/>' },
  /** texto con borde, sin ajuste de línea (no agranda la fila) */
  plain: { font: 0, fill: 0, border: 1, fmt: 0 },
};
const STYLE_ORDER = Object.keys(STYLE_DEFS) as StyleName[];
const STYLE_INDEX = Object.fromEntries(STYLE_ORDER.map((s, i) => [s, i])) as Record<StyleName, number>;

function stylesXml(): string {
  const xfs = STYLE_ORDER.map((name) => {
    const d = STYLE_DEFS[name];
    const attrs = `numFmtId="${d.fmt}" fontId="${d.font}" fillId="${d.fill}" borderId="${d.border}" xfId="0"` +
      (d.fmt ? ' applyNumberFormat="1"' : '') + (d.font ? ' applyFont="1"' : '') + (d.fill ? ' applyFill="1"' : '') +
      (d.border ? ' applyBorder="1"' : '') + (d.align ? ' applyAlignment="1"' : '');
    return d.align ? `<xf ${attrs}>${d.align}</xf>` : `<xf ${attrs}/>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${NUMFMTS}
<fonts count="${FONTS.length}">${FONTS.join('')}</fonts>
<fills count="${FILLS.length}">${FILLS.join('')}</fills>
<borders count="${BORDERS.length}">${BORDERS.join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
export function colName(c: number): string {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Referencia A1 a partir de índices 0-based. */
export const ref = (row: number, col: number, abs = false) =>
  abs ? `$${colName(col)}$${row + 1}` : `${colName(col)}${row + 1}`;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // caracteres de control no permitidos en XML
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const isFormula = (v: Value): v is Formula => typeof v === 'object' && v !== null && 'f' in v;

function cellXml(r: number, c: number, cell: Cell): string {
  const a = `r="${ref(r, c)}" s="${STYLE_INDEX[cell.s ?? 'default']}"`;
  const v = cell.v;
  if (v === null || v === undefined || v === '') return `<c ${a}/>`;
  if (typeof v === 'number') return Number.isFinite(v) ? `<c ${a}><v>${v}</v></c>` : `<c ${a}/>`;
  if (typeof v === 'string') return `<c ${a} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  if (isFormula(v)) {
    const f = `<f>${esc(v.f)}</f>`;
    if (typeof v.v === 'number') return `<c ${a}>${f}<v>${Number.isFinite(v.v) ? v.v : 0}</v></c>`;
    return `<c ${a} t="str">${f}<v>${esc(v.v)}</v></c>`;
  }
  return `<c ${a}/>`;
}

function sheetXml(s: SheetSpec): string {
  const cols = s.widths?.length
    ? `<cols>${s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const pane = s.freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane ${s.freeze.col ? `xSplit="${s.freeze.col}" ` : ''}ySplit="${s.freeze.row}" topLeftCell="${ref(s.freeze.row, s.freeze.col)}" activePane="${s.freeze.col ? 'bottomRight' : 'bottomLeft'}" state="frozen"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const rows: string[] = [];
  s.rows.forEach((row, r) => {
    if (!row) return;
    const cells: string[] = [];
    row.forEach((cell, c) => {
      if (cell) cells.push(cellXml(r, c, cell));
    });
    if (cells.length) rows.push(`<row r="${r + 1}"${r === 0 ? ' ht="28" customHeight="1"' : ''}>${cells.join('')}</row>`);
  });
  const merges = s.merges?.length
    ? `<mergeCells count="${s.merges.length}">${s.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}${cols}<sheetData>${rows.join('')}</sheetData>${merges}</worksheet>`;
}

/** Nombres de hoja válidos para Excel (≤31 caracteres, sin []:*?/\). */
export function sheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);
}

export function buildWorkbook(sheets: SheetSpec[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  files['[Content_Types].xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`);
  files['_rels/.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  files['xl/workbook.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${esc(sheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>`);
  files['xl/_rels/workbook.xml.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  files['xl/styles.xml'] = strToU8(stylesXml());
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
  });
  return zipSync(files, { level: 6 });
}
