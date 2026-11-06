import type { MortgageInterestWorksheet } from '@/models/inputs';
import type { MortgageEntryData } from './guided-interview-flow';
import { amountError, hasEnteredAmount, isActualDate } from './guided-required-facts';
import { parseGuidedCurrency } from './guided-currency';

export interface MortgageDebtCategoryData {
  sourceTaxYear?: string; worksheetReference?: string;
  grandfatheredDebt?: string; acquisitionDebtBefore2017?: string; acquisitionDebtAfter2017?: string; excludedDebt?: string;
  classificationConfirmed?: boolean | null; paymentsAppliedInRequiredOrderConfirmed?: boolean | null;
  interestAllocationConfirmed?: boolean | null; refinancingHistoryConfirmed?: boolean | null; grandfatheredStatusConfirmed?: boolean | null;
}
const money = (value: string | undefined, label: string) => {
  const error = amountError(value, label); if (error) throw new Error(error);
  return parseGuidedCurrency(value).toFixed();
};
function actualTrue(value: boolean | null | undefined, label: string): true {
  if (value !== true) throw new Error(`The completed mortgage category worksheet requires actual confirmation of ${label}.`);
  return true;
}
/** Original completed source averages only; never derives classifications from Box 2. */
export function buildGuidedMortgageDebtCategories(entry: MortgageEntryData): Extract<MortgageInterestWorksheet['loans'][number]['balance'], { method: 'category_worksheet' }> {
  const data = entry.balanceCategories;
  if (!data || !/^20\d{2}$/.test(data.sourceTaxYear ?? '') || data.sourceTaxYear !== entry.sourceTaxYear || !data.worksheetReference?.trim()) throw new Error('Enter the actual completed mortgage category worksheet year and source reference matching the original statement.');
  const grandfatheredDebt = money(data.grandfatheredDebt, 'actual average grandfathered debt');
  const acquisitionDebtBefore2017 = money(data.acquisitionDebtBefore2017, 'actual average acquisition debt before December 16, 2017');
  const acquisitionDebtAfter2017 = money(data.acquisitionDebtAfter2017, 'actual average acquisition debt after December 15, 2017');
  const excludedDebt = money(data.excludedDebt, 'actual average nonqualifying debt');
  const grandfathered = parseGuidedCurrency(grandfatheredDebt), older = parseGuidedCurrency(acquisitionDebtBefore2017), newer = parseGuidedCurrency(acquisitionDebtAfter2017), excluded = parseGuidedCurrency(excludedDebt);
  const classificationConfirmed = actualTrue(data.classificationConfirmed, 'all original proceeds, debt dates and completed category averages');
  const paymentsAppliedInRequiredOrderConfirmed = actualTrue(data.paymentsAppliedInRequiredOrderConfirmed, 'principal payments applied to nonacquisition, grandfathered and acquisition categories in the required order');
  actualTrue(data.interestAllocationConfirmed, 'the actual interest attributed to excluded uses is included in the separately entered ineligible or other-schedule amounts');
  if (entry.loanType === 'refinance' || entry.loanType === 'heloc') actualTrue(data.refinancingHistoryConfirmed, 'original balances and use history, refinancing limits and applicable remaining terms');
  if (grandfathered.gt(0)) actualTrue(data.grandfatheredStatusConfirmed, 'grandfathered continuous security and any refinancing remaining-term or balloon-exception history');
  if (hasEnteredAmount(entry.maximumBalanceDuringYear) && grandfathered.plus(older).plus(newer).plus(excluded).gt(money(entry.maximumBalanceDuringYear, 'known actual maximum debt'))) throw new Error('The completed category averages exceed the known actual maximum debt; reconcile the original source worksheets.');
  if (entry.proceedsUse === 'acquisition' && excluded.gt(0)) throw new Error('The original all-acquisition-use answer conflicts with a positive nonacquisition debt category.');
  if (entry.proceedsUse === 'other' && older.plus(newer).gt(0)) throw new Error('The original other-use answer conflicts with positive acquisition debt categories.');
  if (entry.loanType === 'original') {
    if (!isActualDate(entry.originationDate)) throw new Error('Enter the actual original loan date before classifying its debt.');
    if (entry.originationDate <= '1987-10-13') {
      if (older.plus(newer).plus(excluded).gt(0)) throw new Error('Additional or reclassified debt on a grandfathered original loan needs its actual refinancing or borrowing history.');
    } else {
      if (grandfathered.gt(0)) throw new Error('An original loan after October 13, 1987 cannot establish grandfathered debt; reconcile the actual source classification.');
      const signed = entry.bindingContractSignedDate, closing = entry.bindingContractRequiredClosingDate, purchase = entry.bindingContractPurchaseDate;
      const transition = entry.bindingContractApplies === true && typeof signed === 'string' && typeof closing === 'string' && typeof purchase === 'string' && isActualDate(signed) && isActualDate(closing) && isActualDate(purchase)
        && signed < '2017-12-15' && closing < '2018-01-01' && purchase < '2018-04-01' && signed <= purchase
        && entry.originationDate >= '2017-12-16' && entry.originationDate < '2018-04-01';
      const oldOriginal = entry.originationDate < '2017-12-16' || transition;
      if (oldOriginal ? newer.gt(0) : older.gt(0)) throw new Error('The completed acquisition category conflicts with the original loan date and actual binding-contract sources.');
    }
  }
  return { method: 'category_worksheet', grandfatheredDebt, acquisitionDebtBefore2017, acquisitionDebtAfter2017, excludedDebt,
    worksheetReference: data.worksheetReference.trim(), classificationConfirmed, paymentsAppliedInRequiredOrderConfirmed };
}
