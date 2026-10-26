/** Original receipt valuation shared by Schedule A and selected carry candidates. */
import type { TaxYearInput } from '@/models/inputs.js';
import type { CharitableContributionWorksheetInput } from '@/engine/forms/charitable-contribution-worksheet.js';
import { eligibleCurrentCharitableDonations } from '@/engine/forms/charitable-current-sources.js';
import { resolveCharitableRecipient } from './charitable-recipient.js';
import { calculateK1CharitableReturnSources } from '@/engine/forms/k1-charitable-return-sources.js';
import { d, min } from './decimal.js';

export function readCurrentCharitableReceiptAmounts(input: TaxYearInput, options?: {
  /** The current-only carry method has no tangible-property related-use election. */
  capitalStockOnly?: boolean;
  includeK1?: boolean;
}): CharitableContributionWorksheetInput['amounts'] {
  const amounts = { cashPublic: d('0'), noncashPublic: d('0'), capitalGainPublic: d('0'),
    cashPrivate: d('0'), noncashPrivate: d('0'), capitalGainPrivate: d('0') };
  for (const donation of eligibleCurrentCharitableDonations(input)) {
    const recipient = resolveCharitableRecipient(donation);
    const otherRecipient = recipient.percentageCategory === 'other-thirty-percent';
    let contributionValue = d(donation.amount);
    if (donation.type !== 'cash') {
      if (donation.isLongTermCapitalGain === undefined) throw new Error('Charitable property long-term holding status is unknown');
      if (options?.capitalStockOnly && donation.isLongTermCapitalGain && donation.type !== 'appreciated_stock') {
        throw new Error('Current charitable capital property requires the separate tangible-property or special valuation source method');
      }
      if (!donation.isLongTermCapitalGain) {
        if (donation.costBasis === undefined || !d(donation.costBasis).isFinite() || d(donation.costBasis).lt(0)) {
          throw new Error('Charitable property cost basis is unknown or invalid');
        }
        contributionValue = min(contributionValue, d(donation.costBasis));
      } else if (recipient.privateNonoperating && (donation.type !== 'appreciated_stock' || donation.qualifiedAppreciatedStock !== true)) {
        if (donation.type === 'appreciated_stock' && donation.qualifiedAppreciatedStock === undefined) {
          throw new Error('Private-foundation qualified appreciated stock status is unknown');
        }
        if (donation.costBasis === undefined || !d(donation.costBasis).isFinite() || d(donation.costBasis).lt(0)) {
          throw new Error('Private-foundation capital gain gift requires qualified appreciated stock or actual basis-reduction qualification');
        }
        contributionValue = min(contributionValue, d(donation.costBasis));
      }
    }
    const category = donation.type === 'cash'
      ? otherRecipient ? 'cashPrivate' : 'cashPublic'
      : donation.isLongTermCapitalGain
        ? otherRecipient ? 'capitalGainPrivate' : 'capitalGainPublic'
        : otherRecipient ? 'noncashPrivate' : 'noncashPublic';
    amounts[category] = amounts[category].plus(contributionValue);
  }
  if (options?.includeK1) {
    const k1=calculateK1CharitableReturnSources(input);
    if(k1) for(const key of Object.keys(amounts) as (keyof typeof amounts)[]) amounts[key]=amounts[key].plus(k1.amounts[key]);
  }
  return amounts;
}
