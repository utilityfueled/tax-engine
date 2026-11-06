/** Actual section904(j) sources. Spec: spec/federal/foreign-tax-direct-credit.yaml. */
import { resolveForeignTaxCreditSourceRecords, type ForeignTaxCreditSourceInput, type ForeignTaxCreditSourceRecords } from './foreign-tax-credit-source-records.js';
export type ForeignTaxDirectInput = ForeignTaxCreditSourceInput;
export type ForeignTaxDirectSources = ForeignTaxCreditSourceRecords;
export type { ForeignTaxCreditCarrySource as ForeignTaxDirectCarrySource } from './foreign-tax-credit-source-records.js';
export function resolveForeignTaxDirectSources(input: ForeignTaxDirectInput): ForeignTaxDirectSources {
  return resolveForeignTaxCreditSourceRecords(input, 'direct');
}
