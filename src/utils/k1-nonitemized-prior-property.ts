import type Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { K1CharitableCategory } from '@/engine/forms/k1-charitable-basis-sources.js';
import type { K1CharitableReturnResult } from '@/engine/forms/k1-charitable-return-sources.js';
import type { CharitableCategory } from '@/engine/forms/charitable-contribution-worksheet.js';

/** Source-fact admission only; the actual allowable-carry floor proof below remains mandatory. */
export function isNonitemizedPriorPropertySource(year: number, election: TaxYearInput['deductionElection'], category: K1CharitableCategory): boolean {
  return year === 2026 && (election === 'standard' || election === 'nonitemized')
    && (category === 'capital_gain_30' || category === 'capital_gain_20');
}

/** Internal actual-source result and derived floor only; no TaxYearInput proof or amount override. */
export function assertPriorPropertyAllowableCarryProof(source: K1CharitableReturnResult | undefined, proof: {
  hasCurrentPercentageExcess: boolean;
  percentageExcessByCategory: Record<CharitableCategory, Decimal>;
  floorByCategory: Record<CharitableCategory, Decimal>;
}): void {
  if (!proof.hasCurrentPercentageExcess) return;
  const assertReleasedCategory = (category: CharitableCategory): void => {
    if (proof.percentageExcessByCategory[category].gt(0)) {
      throw new Error('Prior entity property release with positive carry requires its actual first-section170-entry and contribution-year source proof');
    }
    if (proof.floorByCategory[category].gt(0)) {
      throw new Error('Prior entity property release with an eligible positive floor requires its separate contribution-year method; nonitemization alone is not a floor proof');
    }
  };
  for (const statement of source?.statements ?? []) {
    for (const row of statement.basis.charitableSources?.records ?? []) {
      const available = statement.atRiskAllocation?.charitable.find(item => item.sourceId === row.sourceId)?.allowed ?? row.availableAfterBasis;
      const firstAdmission = statement.firstAdmissions?.find(admission => admission.sourceId === row.sourceId);
      if (!row.current && available.gt(0) && !firstAdmission?.currentAdmission.eq(available)) assertReleasedCategory(row.category);
    }
    for (const row of statement.atRiskAllocation?.prior ?? []) {
      if (row.gift && row.allowed.gt(0)) assertReleasedCategory(row.gift.category);
    }
  }
}
