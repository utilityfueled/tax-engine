import type { EicDisallowanceInput } from '@/engine/forms/eic-disallowance-history.js';
import type { EicDisallowanceSources } from '@/models/eic-disallowance-sources.js';

/** Explicit fictional records for eligible-source controls, never a production default. */
export function fictionalEmptyEicHistory(taxpayer: EicDisallowanceInput['taxpayer']): EicDisallowanceSources {
  const joint = taxpayer.filingStatus === 'married_filing_jointly';
  if (joint && taxpayer.spouse === undefined) throw new Error('Fictional joint history needs its actual fixture spouse');
  const owners = [{ owner: 'primary' as const, original: taxpayer.primary },
    ...(joint && taxpayer.spouse ? [{ owner: 'spouse' as const, original: taxpayer.spouse }] : [])];
  return {
    sourceTaxYear: taxpayer.taxYear, sourceReference: 'Fictional complete IRS and filed-return records', sourceFactsConfirmed: true,
    claimStatus: 'preparing', reviewedThroughDate: `${taxpayer.taxYear + 1}-03-01`, preparationAsOfDate: `${taxpayer.taxYear + 1}-03-01`,
    filers: owners.map(({ owner, original }) => ({ owner,
      originalTaxpayer: { firstName: original.firstName, lastName: original.lastName, ssn: original.ssn },
      sourceReference: `Fictional ${owner} complete history`, sourceFactsConfirmed: true, allHistoryIncluded: true,
      denials: [], laterAllowances: [],
    })),
  };
}
