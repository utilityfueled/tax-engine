import type { TaxYearInput } from '@/models/inputs.js';
import ordinary from './cod-empty-nol-foreign/ordinary.json';
import deduction from './cod-empty-nol-foreign/deduction.json';

/** Explicit fictional originals, saved before first product execution. */
export function codEmptyNolForeignInput(method: 'ordinary' | 'deduction' = 'deduction'): TaxYearInput {
  return structuredClone(method === 'ordinary' ? ordinary : deduction) as unknown as TaxYearInput;
}
