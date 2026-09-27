/**
 * Enlace directo con el generador https://simulacion-trabajo.vercel.app/
 * Pide su exportación a Excel (/api/export, CORS abierto) y la interpreta con
 * el mismo lector de plantilla que se usa al subir el archivo a mano.
 */
import type { GeneratorConfig, GeneratorMethod } from '../engine/generators';
import { parseTemplateWorkbook } from './template';
import type { ParsedSequence } from './sequence';

export const GENERATOR_SITE = 'https://simulacion-trabajo.vercel.app';

export async function fetchFromGeneratorSite(
  method: GeneratorMethod,
  config: GeneratorConfig,
  n: number,
  signal?: AbortSignal,
): Promise<ParsedSequence> {
  const res = await fetch(`${GENERATOR_SITE}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, config: { ...config, n } }),
    signal,
  });
  if (!res.ok) throw new Error(`simulacion-trabajo respondió ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return parseTemplateWorkbook(buf, `simulacion-trabajo · ${method}`);
}
