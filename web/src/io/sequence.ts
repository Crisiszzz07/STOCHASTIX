import type { AuditSpec } from '../engine/audit';
import type { GeneratorMethod } from '../engine/generators';

export interface Issue {
  /** posición 1-based (fila de Excel, línea o índice) */
  pos: number;
  token: string;
  reason: string;
}

/** Secuencia de R_i lista para usar como fuente de uniformes. */
export interface ParsedSequence {
  values: number[];
  /** origen legible: nombre de archivo, "Textarea", "simulacion-trabajo", … */
  origin: string;
  format: 'xlsx' | 'csv' | 'json' | 'texto';
  generator?: GeneratorMethod;
  params?: Record<string, number>;
  /** filas marcadas como "🔄 Ciclo" en la plantilla */
  cycles: number;
  /** R_i exactamente 0 o 1 (se ajustan a (0,1) al tomar logaritmos) */
  boundary: number;
  errors: Issue[];
  warnings: string[];
  /** pruebas del panel «AUDITORÍA ESTADÍSTICA» de la plantilla, si el archivo lo trae */
  audit?: AuditSpec[];
}

export function emptySequence(origin: string, format: ParsedSequence['format']): ParsedSequence {
  return { values: [], origin, format, cycles: 0, boundary: 0, errors: [], warnings: [] };
}

/** Valida un valor como R_i ∈ [0,1]; 0 y 1 se aceptan pero se cuentan como frontera. */
export function pushValue(seq: ParsedSequence, v: number, pos: number, token: string): void {
  if (!Number.isFinite(v)) {
    seq.errors.push({ pos, token, reason: 'no es numérico' });
  } else if (v < 0 || v > 1) {
    seq.errors.push({ pos, token, reason: 'fuera de [0, 1]' });
  } else {
    if (v === 0 || v === 1) seq.boundary++;
    seq.values.push(v);
  }
}
