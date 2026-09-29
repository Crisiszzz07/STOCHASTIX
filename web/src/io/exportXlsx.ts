/**
 * Reporte .xlsx completo: simula TODAS las distribuciones con TODOS sus métodos sobre
 * la misma secuencia de R_i y reúne sus resultados y pruebas en un solo libro, con el
 * estilo de la plantilla de simulacion-trabajo (título fila 1, subtítulo fila 2,
 * cabeceras fila 4, panel de parámetros a la derecha, fórmulas reales de Excel con
 * su valor ya calculado).
 *
 * Hojas: Resumen general · Pruebas R_i · <Distribución · Método> (una por método) · R_i · Teoría
 */
import {
  DIST_LIST, simulate, type DistKey, type DistSpec, type MethodSpec, type Params, type SimResult,
} from '../engine/distributions';
import { GENERATORS } from '../engine/generators';
import {
  buildHistogram, chiCritical, chiSquare, sampleStats, type Histogram, type SampleStats,
} from '../engine/histogram';
import { describeQuery, evaluateQuery, satisfies, type Query, type QueryResult } from '../engine/query';
import { arraySource } from '../engine/uniform';
import type { ParsedSequence } from './sequence';
import {
  buildWorkbook, colName, ref, sheetName, type Cell, type SheetSpec, type StyleName, type Value,
} from './xlsxWriter';

export interface ReportInput {
  seq: ParsedSequence;
  wrap: boolean;
  N: number;
  bins: number;
  paramsBy: Record<DistKey, Params>;
  queryBy: Record<DistKey, Query>;
  statementBy: Partial<Record<DistKey, string>>;
  /** distribución y método que se estaban viendo en la página */
  active: { dist: DistKey; method: string };
  date?: Date;
}

/** Resultado de un método: todo lo necesario para su hoja y su fila en el resumen. */
export interface MethodRun {
  spec: DistSpec;
  method: MethodSpec;
  params: Params;
  query: Query;
  statement: string;
  sheet: string;
  error?: string;
  result?: SimResult;
  hist?: Histogram;
  stats?: SampleStats;
  qres?: QueryResult;
  margin?: number;
  chi?: { stat: number; df: number; classes: number };
  crit?: number;
}

const MAX_R_COLS = 12;
const Z95 = 1.96;
const HEADER_ROW = 3; // fila 4 de Excel, como en la plantilla
const FIRST_DATA = HEADER_ROW + 1;
const VALID = '✅ VALIDADA';
const INVALID = '❌ NO VALIDADA';
const PASS = '✅ APROBADO';
const FAIL = '❌ RECHAZADO';

/** Nombres cortos para que «Distribución · Método» quepa en 31 caracteres. */
const METHOD_SHORT: Record<string, string> = {
  bernoulli: 'Bernoulli',
  inverse: 'Inversa',
  arrivals: 'Llegadas exp',
  boxmuller: 'Box-Muller',
  tcl12: 'TCL n=12',
  convolution: 'Convolución',
};

const c = (v: Value, s?: StyleName): Cell => ({ v, s });
const f = (formula: string, value: number | string, s?: StyleName): Cell => ({ v: { f: formula, v: value }, s });
const q = (name: string) => `'${name.replace(/'/g, "''")}'`;
const strLit = (s: string) => `"${s.replace(/"/g, '""')}"`;
const paramText = (spec: DistSpec, p: Params) => spec.params.map((x) => `${x.symbol}=${p[x.key]}`).join(', ');

class Sheet {
  rows: (Cell | undefined)[][] = [];
  merges: string[] = [];
  constructor(public name: string, public widths: number[] = []) {}
  set(row: number, col: number, cell: Cell) {
    (this.rows[row] ??= [])[col] = cell;
  }
  title(text: string, subtitle: string, lastCol: number) {
    this.set(0, 0, c(text, 'title'));
    for (let k = 1; k <= lastCol; k++) this.set(0, k, c(null, 'title'));
    this.set(1, 0, c(subtitle, 'subtitle'));
    this.merges.push(`A1:${colName(lastCol)}1`, `A2:${colName(lastCol)}2`);
  }
  section(row: number, col: number, text: string, span: number) {
    this.set(row, col, c(text, 'section'));
    for (let k = 1; k < span; k++) this.set(row, col + k, c(null, 'section'));
    if (span > 1) this.merges.push(`${ref(row, col)}:${ref(row, col + span - 1)}`);
  }
  /** referencia absoluta a una celda de esta hoja desde otra hoja */
  ext(row: number, col: number) {
    return `${q(this.name)}!${ref(row, col, true)}`;
  }
  spec(freeze?: { row: number; col: number }): SheetSpec {
    return { name: this.name, rows: this.rows, widths: this.widths, merges: this.merges, freeze };
  }
}

// ===========================================================================
// Cálculo de todos los métodos
// ===========================================================================
export function computeRuns(input: ReportInput): MethodRun[] {
  const used = new Set<string>(['Resumen general', 'Pruebas R_i', 'R_i', 'Teoría']);
  const runs: MethodRun[] = [];
  for (const spec of DIST_LIST) {
    const params = input.paramsBy[spec.key];
    const query = input.queryBy[spec.key];
    const statement = input.statementBy[spec.key] ?? '';
    for (const method of spec.methods) {
      let name = sheetName(`${spec.label} · ${METHOD_SHORT[method.key] ?? method.label}`);
      for (let k = 2; used.has(name); k++) name = sheetName(`${name.slice(0, 28)} ${k}`);
      used.add(name);
      const run: MethodRun = { spec, method, params, query, statement, sheet: name };
      const errors = spec.validate(params);
      if (errors.length) {
        run.error = `Parámetros inválidos: ${errors.join(' · ')}`;
      } else {
        const result = simulate(spec.key, method.key, params, arraySource(input.seq.values, input.wrap), input.N);
        const hist = buildHistogram(result.values, spec, params, input.bins);
        const qres = evaluateQuery(result.values, query, spec, params);
        const chi = chiSquare(hist);
        Object.assign(run, {
          result,
          hist,
          qres,
          stats: sampleStats(result.values),
          chi,
          crit: chiCritical(chi.df),
          margin: qres.total > 0 ? Z95 * Math.sqrt((qres.simulated * (1 - qres.simulated)) / qres.total) : 0,
        });
      }
      runs.push(run);
    }
  }
  return runs;
}

// ===========================================================================
// Hoja de un método: variables (izquierda) · panel (centro) · frecuencias (derecha)
// ===========================================================================
interface MethodRefs {
  nGen: string; mean: string; variance: string; fav: string; pSim: string; pTeo: string;
  relErr: string; lo: string; hi: string; verdict: string; chi: string; crit: string; chiState: string;
}

function methodSheet(run: MethodRun, subtitle: string): { sheet: Sheet; refs: MethodRefs } {
  const { spec, method, params, query, result, hist, stats, qres, chi, crit, margin } = run;
  const samples = result!.samples;
  const n = samples.length;
  const S = new Sheet(run.sheet);

  const maxRs = samples.reduce((m, s) => Math.max(m, s.rs.length), 0);
  const rCols = Math.min(MAX_R_COLS, maxRs);
  const colR0 = 1;
  const colCount = colR0 + rCols;
  const colX = colCount + 1;
  const colOk = colX + 1;
  const P = colOk + 2; // panel: etiqueta | valor | teórico | diferencia
  const FQ = P + 5; // tabla de frecuencias (10 columnas)
  S.widths = [7, ...Array(rCols).fill(10), 6, 13, 10, 3, 34, 18, 14, 14, 3, 9, 13, 13, 8, 10, 12, 11, 11, 12, 13];
  S.title(`📊  SIMULACIÓN — ${spec.label} · ${method.label}`, subtitle, FQ + 9);

  // ---- Variables ----------------------------------------------------------
  S.set(HEADER_ROW, 0, c('i', 'header'));
  for (let j = 0; j < rCols; j++) S.set(HEADER_ROW, colR0 + j, c(`R_${j + 1}`, 'header'));
  S.set(HEADER_ROW, colCount, c('Nº R', 'header'));
  S.set(HEADER_ROW, colX, c('X_i', 'header'));
  S.set(HEADER_ROW, colOk, c('¿Cumple?', 'header'));
  const lastRow = FIRST_DATA + Math.max(0, n - 1);
  const xRange = `${ref(FIRST_DATA, colX, true)}:${ref(lastRow, colX, true)}`;
  const okRange = `${ref(FIRST_DATA, colOk, true)}:${ref(lastRow, colOk, true)}`;

  // ---- Panel --------------------------------------------------------------
  let r = HEADER_ROW;
  const line = (label: string, value: Cell) => {
    S.set(r, P, c(label, 'label'));
    S.set(r, P + 1, value);
    return r++;
  };

  S.section(r++, P, '⚙️  Parámetros', 4);
  line('Distribución', c(spec.label, 'plain'));
  line('Notación', c(spec.notation(params), 'plain'));
  line('Método', c(method.label, 'plain'));
  line('Fórmula', c(method.formula, 'plain'));
  spec.params.forEach((p) => line(`${p.symbol} · ${p.label}`, c(params[p.key], p.integer ? 'int' : 'num4')));
  line('Consumo de R_i', c(method.cost(params), 'plain'));
  line('Variables pedidas (N)', c(result!.requested, 'int'));
  const nGenRow = line('Variables generadas', f(`COUNT(${xRange})`, n, 'int'));
  line('Estado', c(result!.overflow ? 'OVERFLOW' : 'GENERATED', result!.overflow ? 'bad' : 'ok'));
  line('R_i consumidas', c(result!.consumed, 'int'));
  line('R_i ajustadas (CLAMPED)', c(result!.clamped, 'int'));
  r++;

  S.section(r++, P, '❓  Condición', 4);
  line('Pregunta', c(describeQuery(query), 'plain'));
  if (run.statement) line('Enunciado', c(run.statement, 'plain'));
  line('Modo', c(query.mode === 'left' ? 'Menor que' : query.mode === 'right' ? 'Mayor que' : 'Rango', 'plain'));
  const kRow = line('Umbral k', c(query.k, 'num4'));
  const aRow = line('Desde a', c(query.a, 'num4'));
  const bRow = line('Hasta b', c(query.b, 'num4'));
  const kRef = ref(kRow, P + 1, true);
  const aRef = ref(aRow, P + 1, true);
  const bRef = ref(bRow, P + 1, true);
  r++;

  S.section(r++, P, '✅  Validación (IC 95 %)', 4);
  const favRow = line('Casos favorables', f(`COUNTIF(${okRange},"✓")`, qres!.favorable, 'int'));
  const totRow = line('Total de variables', f(`COUNT(${xRange})`, qres!.total, 'int'));
  const pSimRow = line('P simulada', f(`IF(${ref(totRow, P + 1)}>0,${ref(favRow, P + 1)}/${ref(totRow, P + 1)},0)`, qres!.simulated, 'num6'));
  const pTeoRow = line('P teórica exacta', c(qres!.theoretical, 'num6'));
  const absRow = line('Error absoluto |P̂ − P|', f(`ABS(${ref(pSimRow, P + 1)}-${ref(pTeoRow, P + 1)})`, qres!.absError, 'num6'));
  const relRow = line('Error relativo', f(
    `IF(${ref(pTeoRow, P + 1)}>0,${ref(absRow, P + 1)}/${ref(pTeoRow, P + 1)},"—")`,
    qres!.relError === null ? '—' : qres!.relError / 100, 'pct',
  ));
  const marRow = line('Margen = 1.96·√(P̂(1−P̂)/n)', f(
    `${Z95}*SQRT(${ref(pSimRow, P + 1)}*(1-${ref(pSimRow, P + 1)})/${ref(totRow, P + 1)})`, margin!, 'num6',
  ));
  const loRow = line('Límite inferior', f(`${ref(pSimRow, P + 1)}-${ref(marRow, P + 1)}`, qres!.simulated - margin!, 'num6'));
  const hiRow = line('Límite superior', f(`${ref(pSimRow, P + 1)}+${ref(marRow, P + 1)}`, qres!.simulated + margin!, 'num6'));
  const verRow = line('Veredicto', f(
    `IF(AND(${ref(pTeoRow, P + 1)}>=${ref(loRow, P + 1)},${ref(pTeoRow, P + 1)}<=${ref(hiRow, P + 1)}),${strLit(VALID)},${strLit(INVALID)})`,
    qres!.validated ? VALID : INVALID, qres!.validated ? 'ok' : 'bad',
  ));
  r++;

  S.section(r++, P, '📈  Estadísticos', 4);
  ['Medida', 'Simulado', 'Teórico', 'Diferencia'].forEach((h, k) => S.set(r, P + k, c(h, 'header')));
  r++;
  const stat = (label: string, formula: string, sim: number, theo: number | null) => {
    S.set(r, P, c(label, 'label'));
    S.set(r, P + 1, f(formula, sim, 'num6'));
    S.set(r, P + 2, c(theo, 'num6'));
    S.set(r, P + 3, theo === null ? c(null, 'plain') : f(`${ref(r, P + 1)}-${ref(r, P + 2)}`, sim - theo, 'num6'));
    return r++;
  };
  const meanRow = stat('Media', `AVERAGE(${xRange})`, stats!.mean, spec.mean(params));
  const varRow = stat('Varianza (muestral)', `VAR(${xRange})`, stats!.variance, spec.variance(params));
  stat('Desviación estándar', `STDEV(${xRange})`, Math.sqrt(stats!.variance), Math.sqrt(spec.variance(params)));
  stat('Mínimo', `MIN(${xRange})`, stats!.min, null);
  stat('Máximo', `MAX(${xRange})`, stats!.max, null);
  r++;

  S.section(r++, P, '🛡️  Bondad de ajuste (χ²)', 4);
  const chiRow = line('χ²₀ (clases con fe < 5 agrupadas)', c(chi!.stat, 'num4'));
  line('Clases agrupadas', c(chi!.classes, 'int'));
  line('Grados de libertad', c(chi!.df, 'int'));
  const critRow = line('Valor crítico χ²(0.05, gl)', c(crit!, 'num4'));
  const chiStateRow = line('Estado', f(
    `IF(${ref(chiRow, P + 1)}<${ref(critRow, P + 1)},${strLit(PASS)},${strLit(FAIL)})`,
    chi!.stat < crit! ? PASS : FAIL, chi!.stat < crit! ? 'ok' : 'bad',
  ));

  // ---- Filas de variables (usan las celdas k/a/b del panel) -----------------
  samples.forEach((s, k) => {
    const row = FIRST_DATA + k;
    const hit = satisfies(s.x, query);
    S.set(row, 0, c(s.i, hit ? 'hlInt' : 'int'));
    for (let j = 0; j < rCols; j++) S.set(row, colR0 + j, c(s.rs[j] ?? null, 'num6'));
    S.set(row, colCount, c(s.rs.length, 'int'));
    S.set(row, colX, c(s.x, hit ? (spec.discrete ? 'hlInt' : 'hlNum6') : spec.discrete ? 'int' : 'num6'));
    const x = ref(row, colX);
    const cond =
      query.mode === 'left'
        ? `${x}${query.strict ? '<' : '<='}${kRef}`
        : query.mode === 'right'
          ? `${x}${query.strict ? '>' : '>='}${kRef}`
          : `AND(${x}${query.aStrict ? '>' : '>='}${aRef},${x}${query.bStrict ? '<' : '<='}${bRef})`;
    S.set(row, colOk, f(`IF(${cond},"✓","✗")`, hit ? '✓' : '✗', hit ? 'ok' : 'bad'));
  });
  if (maxRs > rCols) {
    S.set(lastRow + 2, 0, c(`Se muestran las primeras ${rCols} R_j de cada variable (Nº R indica cuántas usó).`, 'note'));
  }

  // ---- Tabla de frecuencias ------------------------------------------------
  S.section(HEADER_ROW - 1, FQ, '📊  Tabla de frecuencias', 10);
  ['Clase', 'Lím. inf', 'Lím. sup', 'fo', 'fr', 'Fr acum.', 'fe', 'p teórica', '(fo−fe)²/fe', '¿Condición?'].forEach((h, k) =>
    S.set(HEADER_ROW, FQ + k, c(h, 'header')),
  );
  const nRef = `COUNT(${xRange})`;
  let acc = 0;
  hist!.bins.forEach((b, k) => {
    const row = FIRST_DATA + k;
    const last = k === hist!.bins.length - 1;
    acc += b.rel;
    const inCond = hist!.discrete ? satisfies(b.center, query) : satisfies(b.lo, query) && satisfies(b.hi, query);
    const partial = !hist!.discrete && !inCond && (satisfies(b.lo, query) || satisfies(b.hi, query));
    S.set(row, FQ, c(hist!.discrete ? b.center : k + 1, 'int'));
    S.set(row, FQ + 1, c(hist!.discrete ? b.center : b.lo, hist!.discrete ? 'int' : 'num4'));
    S.set(row, FQ + 2, c(hist!.discrete ? b.center : b.hi, hist!.discrete ? 'int' : 'num4'));
    const fo = hist!.discrete
      ? `COUNTIF(${xRange},${ref(row, FQ + 1)})`
      : `COUNTIFS(${xRange},">="&${ref(row, FQ + 1)},${xRange},"${last ? '<=' : '<'}"&${ref(row, FQ + 2)})`;
    S.set(row, FQ + 3, f(fo, b.count, 'int'));
    S.set(row, FQ + 4, f(`IF(${nRef}>0,${ref(row, FQ + 3)}/${nRef},0)`, b.rel, 'num4'));
    S.set(row, FQ + 5, f(k === 0 ? ref(row, FQ + 4) : `${ref(row - 1, FQ + 5)}+${ref(row, FQ + 4)}`, Math.min(1, acc), 'num4'));
    S.set(row, FQ + 6, c(b.expected, 'num4'));
    S.set(row, FQ + 7, c(b.expectedRel, 'num6'));
    const chiCell = b.expected > 0 ? (b.count - b.expected) ** 2 / b.expected : 0;
    S.set(row, FQ + 8, f(`IF(${ref(row, FQ + 6)}>0,(${ref(row, FQ + 3)}-${ref(row, FQ + 6)})^2/${ref(row, FQ + 6)},0)`, chiCell, 'num4'));
    S.set(row, FQ + 9, c(inCond ? 'Sí' : partial ? 'Parcial' : 'No', inCond ? 'ok' : partial ? 'hlText' : 'plain'));
  });
  const fLast = FIRST_DATA + hist!.bins.length - 1;
  S.set(fLast + 1, FQ, c('Total', 'label'));
  const sumCol = (k: number, v: number, s: StyleName) =>
    S.set(fLast + 1, FQ + k, f(`SUM(${ref(FIRST_DATA, FQ + k)}:${ref(fLast, FQ + k)})`, v, s));
  sumCol(3, hist!.bins.reduce((s, b) => s + b.count, 0), 'int');
  sumCol(6, hist!.bins.reduce((s, b) => s + b.expected, 0), 'num4');
  sumCol(8, hist!.bins.reduce((s, b) => s + (b.expected > 0 ? (b.count - b.expected) ** 2 / b.expected : 0), 0), 'num4');

  const at = (row: number) => S.ext(row, P + 1);
  return {
    sheet: S,
    refs: {
      nGen: at(nGenRow), mean: at(meanRow), variance: at(varRow), fav: at(favRow), pSim: at(pSimRow),
      pTeo: at(pTeoRow), relErr: at(relRow), lo: at(loRow), hi: at(hiRow), verdict: at(verRow),
      chi: at(chiRow), crit: at(critRow), chiState: at(chiStateRow),
    },
  };
}

// ===========================================================================
// Hoja R_i + pruebas de uniformidad de la secuencia
// ===========================================================================
function sequenceSheets(seq: ParsedSequence, subtitle: string): { data: Sheet; tests: Sheet; summary: string[][] } {
  const values = seq.values;
  const n = values.length;

  // ---- R_i: secuencia + columnas auxiliares de Kolmogorov-Smirnov ----------
  const R = new Sheet('R_i', [8, 13, 30, 3, 8, 13, 11, 14]);
  R.title('📥  SECUENCIA DE NÚMEROS R_i', `Fuente: ${seq.origin} • ${subtitle}`, 7);
  ['i', 'R_i', 'Observación'].forEach((h, k) => R.set(HEADER_ROW, k, c(h, 'header')));
  ['k', 'R(k) ordenado', 'k / n', '|k/n − R(k)|'].forEach((h, k) => R.set(HEADER_ROW, 4 + k, c(h, 'header')));
  const sorted = [...values].sort((a, b) => a - b);
  let dMax = 0;
  values.forEach((v, k) => {
    const row = FIRST_DATA + k;
    R.set(row, 0, c(k + 1, 'int'));
    R.set(row, 1, c(v, 'num6'));
    R.set(row, 2, c(v === 0 || v === 1 ? 'En frontera: se ajusta a (0,1) al tomar ln' : '', 'plain'));
    const d = Math.abs((k + 1) / n - sorted[k]);
    dMax = Math.max(dMax, d);
    R.set(row, 4, c(k + 1, 'int'));
    R.set(row, 5, c(sorted[k], 'num6'));
    R.set(row, 6, f(`${ref(row, 4)}/COUNT(${ref(FIRST_DATA, 1, true)}:${ref(FIRST_DATA + n - 1, 1, true)})`, (k + 1) / n, 'num6'));
    R.set(row, 7, f(`ABS(${ref(row, 6)}-${ref(row, 5)})`, d, 'num6'));
  });
  const rRange = `${q('R_i')}!${ref(FIRST_DATA, 1, true)}:${ref(FIRST_DATA + n - 1, 1, true)}`;
  const dRange = `${q('R_i')}!${ref(FIRST_DATA, 7, true)}:${ref(FIRST_DATA + n - 1, 7, true)}`;

  // ---- Pruebas R_i ---------------------------------------------------------
  const T = new Sheet('Pruebas R_i', [34, 16, 16, 16, 3, 10, 11, 11, 12, 11, 14]);
  T.title('🛡️  AUDITORÍA ESTADÍSTICA DE LOS R_i', `Fuente: ${seq.origin} • ${subtitle}`, 10);
  const mean = n ? values.reduce((a, b) => a + b, 0) / n : 0;
  const z0 = n ? ((mean - 0.5) * Math.sqrt(n)) / Math.sqrt(1 / 12) : 0;
  const classes = Array.from({ length: 10 }, (_, k) => ({
    lo: k / 10,
    hi: (k + 1) / 10,
    o: values.filter((v) => v >= k / 10 && (k === 9 ? v <= 1 : v < (k + 1) / 10)).length,
  }));
  const e = n / 10;
  const chi = classes.reduce((s, cl) => s + (e > 0 ? (cl.o - e) ** 2 / e : 0), 0);
  const ksCrit = n ? 1.36 / Math.sqrt(n) : 0;

  // Tabla principal (como el panel «AUDITORÍA ESTADÍSTICA» de la plantilla)
  ['Prueba', 'Estadístico', 'Valor crítico', 'Estado'].forEach((h, k) => T.set(HEADER_ROW, k, c(h, 'header')));
  // Auxiliares debajo
  let r = HEADER_ROW + 6;
  T.section(r++, 0, '📐  Prueba de promedios', 2);
  const meanRow = r;
  T.set(r, 0, c('R̄ = AVERAGE(R_i)', 'label')); T.set(r++, 1, f(`AVERAGE(${rRange})`, mean, 'num6'));
  const nRow = r;
  T.set(r, 0, c('n = COUNT(R_i)', 'label')); T.set(r++, 1, f(`COUNT(${rRange})`, n, 'int'));
  const zRow = r;
  T.set(r, 0, c('Z₀ = (R̄ − 0.5)·√n / √(1/12)', 'label'));
  T.set(r++, 1, f(`(${ref(meanRow, 1)}-0.5)*SQRT(${ref(nRow, 1)})/SQRT(1/12)`, z0, 'num6'));

  // Frecuencias (a la derecha)
  const FQ = 5;
  T.section(HEADER_ROW - 1 + 6, FQ, '📊  Prueba de frecuencias (10 clases)', 6);
  ['Clase', 'Lím. inf', 'Lím. sup', 'Oi', 'Ei', '(Oi−Ei)²/Ei'].forEach((h, k) => T.set(HEADER_ROW + 6, FQ + k, c(h, 'header')));
  classes.forEach((cl, k) => {
    const row = HEADER_ROW + 7 + k;
    T.set(row, FQ, c(k, 'int'));
    T.set(row, FQ + 1, c(cl.lo, 'num4'));
    T.set(row, FQ + 2, c(cl.hi, 'num4'));
    T.set(row, FQ + 3, f(
      k === 9
        ? `COUNTIFS(${rRange},">="&${ref(row, FQ + 1)},${rRange},"<="&${ref(row, FQ + 2)})`
        : `COUNTIFS(${rRange},">="&${ref(row, FQ + 1)},${rRange},"<"&${ref(row, FQ + 2)})`,
      cl.o, 'int',
    ));
    T.set(row, FQ + 4, f(`COUNT(${rRange})/10`, e, 'num4'));
    T.set(row, FQ + 5, f(`IF(${ref(row, FQ + 4)}>0,(${ref(row, FQ + 3)}-${ref(row, FQ + 4)})^2/${ref(row, FQ + 4)},0)`,
      e > 0 ? (cl.o - e) ** 2 / e : 0, 'num4'));
  });
  const chiFirst = HEADER_ROW + 7;
  const chiLast = chiFirst + 9;

  const tests: [string, string, number, string, number, boolean][] = [
    ['Promedios (|Z₀|)', `ABS(${ref(zRow, 1)})`, Math.abs(z0), '1.96', 1.96, Math.abs(z0) < 1.96],
    ['Frecuencias (χ², 9 gl)', `SUM(${ref(chiFirst, FQ + 5)}:${ref(chiLast, FQ + 5)})`, chi, '16.919', 16.919, chi < 16.919],
    ['Kolmogorov-Smirnov (Dₙ)', `MAX(${dRange})`, dMax, `1.36/SQRT(${ref(nRow, 1)})`, ksCrit, dMax < ksCrit],
  ];
  const summary: string[][] = [];
  tests.forEach(([name, formula, value, critF, critV, ok], k) => {
    const row = HEADER_ROW + 1 + k;
    T.set(row, 0, c(name, 'label'));
    T.set(row, 1, f(formula, value, 'num6'));
    T.set(row, 2, f(critF, critV, 'num6'));
    T.set(row, 3, f(`IF(${ref(row, 1)}<${ref(row, 2)},${strLit(PASS)},${strLit(FAIL)})`, ok ? PASS : FAIL, ok ? 'ok' : 'bad'));
    summary.push([name, `${q('Pruebas R_i')}!${ref(row, 3, true)}`, ok ? PASS : FAIL]);
  });
  T.set(r + 1, 0, c('Nivel de significancia α = 0.05. Mismas pruebas que la auditoría del generador simulacion-trabajo.', 'note'));
  T.merges.push(`${ref(r + 1, 0)}:${ref(r + 1, 3)}`);
  return { data: R, tests: T, summary };
}

// ===========================================================================
// Hoja Teoría: f(x)/p(k) y F(x) de cada distribución, en bloques lado a lado
// ===========================================================================
function theorySheet(runs: MethodRun[], subtitle: string): Sheet {
  const T = new Sheet('Teoría');
  const dists = [...new Map(runs.filter((r) => !r.error).map((r) => [r.spec.key, r])).values()];
  T.title('📐  MODELOS TEÓRICOS', subtitle, Math.max(2, dists.length * 4 - 2));
  dists.forEach((run, k) => {
    const col = k * 4;
    const { spec, params } = run;
    T.widths[col] = 11; T.widths[col + 1] = 14; T.widths[col + 2] = 14; T.widths[col + 3] = 3;
    T.section(HEADER_ROW - 1, col, spec.notation(params), 3);
    [spec.discrete ? 'k' : 'x', spec.discrete ? 'p(k)' : 'f(x)', 'F(x)'].forEach((h, j) => T.set(HEADER_ROW, col + j, c(h, 'header')));
    const [d0, d1] = spec.domain(params);
    const pts = spec.discrete
      ? Array.from({ length: Math.max(1, Math.round(d1) - Math.round(d0) + 1) }, (_, j) => Math.round(d0) + j)
      : Array.from({ length: 51 }, (_, j) => d0 + ((d1 - d0) * j) / 50);
    pts.forEach((x, j) => {
      T.set(FIRST_DATA + j, col, c(x, spec.discrete ? 'int' : 'num4'));
      T.set(FIRST_DATA + j, col + 1, c(spec.density(x, params), 'num6'));
      T.set(FIRST_DATA + j, col + 2, c(spec.cdf(x, params), 'num6'));
    });
  });
  return T;
}

// ===========================================================================
// Libro completo
// ===========================================================================
export function buildReport(input: ReportInput, runs = computeRuns(input)): Uint8Array {
  const date = input.date ?? new Date();
  const subtitle = `STOCHASTIX • Exportado ${date.toLocaleString('es')} • Fuente: ${input.seq.origin}`;
  const { data, tests, summary } = sequenceSheets(input.seq, subtitle);
  const methodSheets = runs.map((run) => (run.error ? null : methodSheet(run, subtitle)));

  // ---- Resumen general -----------------------------------------------------
  const S = new Sheet('Resumen general');
  const cols = [
    'Actual', 'Distribución', 'Método', 'Parámetros', 'Condición', 'N generadas', 'Estado', 'Media sim.', 'Media teór.',
    'Var. sim.', 'Var. teór.', 'Favorables', 'P simulada', 'P teórica', 'Error rel.', 'IC inf.', 'IC sup.',
    'Veredicto IC 95 %', 'χ²₀', 'χ² crítico', 'Prueba χ²', 'Detalle',
  ];
  S.widths = [7, 18, 20, 20, 22, 11, 12, 11, 11, 11, 11, 11, 11, 11, 10, 10, 10, 17, 10, 10, 15, 12];
  S.title('📊  STOCHASTIX — Reporte completo de simulación', subtitle, cols.length - 1);

  let r = HEADER_ROW;
  S.section(r++, 0, '📥  Fuente de R_i', 4);
  const info: [string, Value, StyleName][] = [
    ['Archivo', input.seq.origin, 'plain'],
    ['Formato', input.seq.format, 'plain'],
    ['R_i disponibles', input.seq.values.length, 'int'],
    ['Variables pedidas por método (N)', input.N, 'int'],
    ['Reciclar secuencia', input.wrap ? 'Sí' : 'No', 'plain'],
  ];
  if (input.seq.generator) {
    info.splice(2, 0, ['Generador', GENERATORS[input.seq.generator].label, 'plain']);
    const gp = Object.entries(input.seq.params ?? {}).map(([k, v]) => `${k}=${v}`).join(', ');
    if (gp) info.splice(3, 0, ['Parámetros del generador', gp, 'plain']);
  }
  info.forEach(([label, value, style]) => {
    S.set(r, 0, c(label, 'label'));
    S.merges.push(`${ref(r, 0)}:${ref(r, 2)}`);
    S.set(r, 1, c(null, 'label')); S.set(r, 2, c(null, 'label'));
    S.set(r, 3, c(value, style));
    r++;
  });
  r++;

  // Pruebas de uniformidad (enlazadas a su hoja)
  S.section(r++, 0, '🛡️  Pruebas de uniformidad de los R_i', 4);
  summary.forEach(([name, cellRef, value]) => {
    S.set(r, 0, c(name, 'label'));
    S.merges.push(`${ref(r, 0)}:${ref(r, 2)}`);
    S.set(r, 1, c(null, 'label')); S.set(r, 2, c(null, 'label'));
    S.set(r, 3, f(cellRef, value, value === PASS ? 'ok' : 'bad'));
    r++;
  });
  r++;

  // Comparación de todos los métodos
  S.section(r++, 0, '🎲  Todas las distribuciones y métodos', cols.length);
  cols.forEach((h, k) => S.set(r, k, c(h, 'header')));
  const firstRow = ++r;
  runs.forEach((run, k) => {
    const row = firstRow + k;
    const isActive = run.spec.key === input.active.dist && run.method.key === input.active.method;
    S.set(row, 0, c(isActive ? '★' : '', isActive ? 'ok' : 'plain'));
    S.set(row, 1, c(run.spec.label, isActive ? 'hlText' : 'plain'));
    S.set(row, 2, c(run.method.label, isActive ? 'hlText' : 'plain'));
    S.set(row, 3, c(paramText(run.spec, run.params), 'plain'));
    S.set(row, 4, c(describeQuery(run.query), 'plain'));
    const ms = methodSheets[k];
    if (run.error || !ms) {
      S.set(row, 5, c(run.error ?? 'Sin datos', 'bad'));
      S.merges.push(`${ref(row, 5)}:${ref(row, cols.length - 1)}`);
      return;
    }
    const { refs } = ms;
    const res = run.result!;
    const qr = run.qres!;
    S.set(row, 5, f(refs.nGen, res.samples.length, 'int'));
    S.set(row, 6, c(res.overflow ? 'OVERFLOW' : 'GENERATED', res.overflow ? 'bad' : 'ok'));
    S.set(row, 7, f(refs.mean, run.stats!.mean, 'num4'));
    S.set(row, 8, c(run.spec.mean(run.params), 'num4'));
    S.set(row, 9, f(refs.variance, run.stats!.variance, 'num4'));
    S.set(row, 10, c(run.spec.variance(run.params), 'num4'));
    S.set(row, 11, f(refs.fav, qr.favorable, 'int'));
    S.set(row, 12, f(refs.pSim, qr.simulated, 'num4'));
    S.set(row, 13, f(refs.pTeo, qr.theoretical, 'num4'));
    S.set(row, 14, f(refs.relErr, qr.relError === null ? '—' : qr.relError / 100, 'pct'));
    S.set(row, 15, f(refs.lo, qr.simulated - run.margin!, 'num4'));
    S.set(row, 16, f(refs.hi, qr.simulated + run.margin!, 'num4'));
    S.set(row, 17, f(refs.verdict, qr.validated ? VALID : INVALID, qr.validated ? 'ok' : 'bad'));
    S.set(row, 18, f(refs.chi, run.chi!.stat, 'num4'));
    S.set(row, 19, f(refs.crit, run.crit!, 'num4'));
    const chiOk = run.chi!.stat < run.crit!;
    S.set(row, 20, f(refs.chiState, chiOk ? PASS : FAIL, chiOk ? 'ok' : 'bad'));
    S.set(row, 21, f(`HYPERLINK("#${q(run.sheet)}!A1","Ver hoja →")`, 'Ver hoja →', 'plain'));
  });
  const lastRow = firstRow + runs.length - 1;
  r = lastRow + 2;
  const ok = runs.filter((x) => x.qres?.validated).length;
  const chiOkN = runs.filter((x) => x.chi && x.crit && x.chi.stat < x.crit).length;
  S.set(r, 0, c('Métodos validados (IC 95 %)', 'label'));
  S.merges.push(`${ref(r, 0)}:${ref(r, 2)}`);
  S.set(r, 3, f(`COUNTIF(${ref(firstRow, 17)}:${ref(lastRow, 17)},${strLit(VALID)})&" de "&COUNTA(${ref(firstRow, 2)}:${ref(lastRow, 2)})`,
    `${ok} de ${runs.length}`, 'plain'));
  r++;
  S.set(r, 0, c('Métodos que aprueban χ²', 'label'));
  S.merges.push(`${ref(r, 0)}:${ref(r, 2)}`);
  S.set(r, 3, f(`COUNTIF(${ref(firstRow, 20)}:${ref(lastRow, 20)},${strLit(PASS)})&" de "&COUNTA(${ref(firstRow, 2)}:${ref(lastRow, 2)})`,
    `${chiOkN} de ${runs.length}`, 'plain'));
  r += 2;
  S.set(r, 0, c(
    '★ = distribución y método que se estaban viendo en la página. Cada método se simula con los mismos R_i desde el primero, con los parámetros y la pregunta configurados para su distribución. Veredicto: la P teórica debe caer en [P̂ − 1.96·√(P̂(1−P̂)/n), P̂ + 1.96·√(P̂(1−P̂)/n)].',
    'note',
  ));
  S.merges.push(`${ref(r, 0)}:${ref(r, 12)}`);

  return buildWorkbook([
    S.spec(),
    tests.spec(),
    ...methodSheets.filter((m): m is NonNullable<typeof m> => !!m).map((m) => m.sheet.spec({ row: FIRST_DATA, col: 0 })),
    data.spec({ row: FIRST_DATA, col: 0 }),
    theorySheet(runs, subtitle).spec({ row: FIRST_DATA, col: 0 }),
  ]);
}

export function downloadReport(input: ReportInput) {
  const bytes = buildReport(input);
  const blob = new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const d = input.date ?? new Date();
  const pad = (v: number) => String(v).padStart(2, '0');
  const name = `stochastix_reporte_completo_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
