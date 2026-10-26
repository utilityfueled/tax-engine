import type { PersonalInfoData } from '../../apps/web/src/lib/guided-interview-flow';
import type { EicDisallowanceHistoryData } from '../../apps/web/src/lib/guided-eic-disallowance-history';

/** Explicit fictional complete records for positive controls; never an intake default. */
export function fictionalGuidedEmptyEicHistory(personal: PersonalInfoData, filingStatus: string, taxYear: number): EicDisallowanceHistoryData {
  const primary = { firstName: [personal.firstName, personal.middleName?.trim().slice(0, 1)].filter(Boolean).join(' '), lastName: personal.lastName, ssn: personal.ssn };
  if (filingStatus === 'mfj' && !personal.spouse) throw new Error('Fictional joint history needs its actual fixture spouse');
  const owners = [{ owner: 'primary' as const, original: primary },
    ...(filingStatus === 'mfj' && personal.spouse ? [{ owner: 'spouse' as const, original: personal.spouse }] : [])];
  return {
    sourceTaxYear: String(taxYear), sourceReference: 'Fictional complete IRS and filed-return records', sourceFactsConfirmed: true,
    claimStatus: 'preparing', reviewedThroughDate: `${taxYear + 1}-03-01`, preparationAsOfDate: `${taxYear + 1}-03-01`,
    filers: owners.map(({ owner, original }) => ({ owner,
      originalTaxpayer: { firstName: original.firstName, lastName: original.lastName, ssn: original.ssn },
      sourceReference: `Fictional ${owner} complete history`, sourceFactsConfirmed: true, allHistoryIncluded: true,
      denials: [], laterAllowances: [],
    })),
  };
}
