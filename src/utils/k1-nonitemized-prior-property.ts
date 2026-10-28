import type { TaxYearInput } from '@/models/inputs.js';
import type { K1CharitableCategory } from '@/engine/forms/k1-charitable-basis-sources.js';

/** Applicability only; original source validation and all monetary limits remain separate. */
export function isNonitemizedPriorPropertyMethod(year: number, election: TaxYearInput['deductionElection'], category: K1CharitableCategory): boolean {
  return year === 2026 && (election === 'standard' || election === 'nonitemized')
    && (category === 'capital_gain_30' || category === 'capital_gain_20');
}
