import type { TaxYearInput } from '@/models/inputs';
import { PAOrdinaryReturnFactsSchema } from '@/models/pa-ordinary-return-facts';
import { PADigitalTaxRefundSourcesSchema, type PADigitalTaxRefundSources } from '@/models/pa-digital-tax-refund-sources';
import { calculatePADigitalTaxRefundSources } from '@/engine/state/pa-digital-tax-refund-sources';
import { snapshotPAOrdinaryReturnOriginals } from '@/engine/state/pa-ordinary-return-facts';
/** Only an explicit source action may bind fresh private original snapshots.
 * Actual agency/return/receipt facts are validated, never refreshed or invented.
 */
export function confirmGuidedPADigitalTaxRefundSources(input: TaxYearInput, facts: unknown, raw: unknown): PADigitalTaxRefundSources {
  const source = PADigitalTaxRefundSourcesSchema.parse(raw), actualFacts = PAOrdinaryReturnFactsSchema.parse(facts), t = input.taxpayer.primary;
  const candidate: PADigitalTaxRefundSources = { ...source, sourceFactsConfirmed: true,
    owner: { firstName: t.firstName, lastName: t.lastName, ssn: t.ssn }, originalFederalSources: snapshotPAOrdinaryReturnOriginals(input),
    originalPAResidencySources: structuredClone(input.paResidencySources), originalPAFacts: structuredClone(actualFacts),
    statements: source.statements.map(row => ({ ...row, originalStatement: row.originalIndex === null ? undefined : structuredClone(input.form1099DA[row.originalIndex]) })),
  };
  calculatePADigitalTaxRefundSources(input, facts, candidate); return candidate;
}
/** Reads replay the exact private packet and never confirm or replace it. */
export function buildGuidedPADigitalTaxRefundSources(input: TaxYearInput, facts: unknown, raw: unknown): PADigitalTaxRefundSources {
  const source = PADigitalTaxRefundSourcesSchema.parse(raw); calculatePADigitalTaxRefundSources(input, facts, source); return source;
}
