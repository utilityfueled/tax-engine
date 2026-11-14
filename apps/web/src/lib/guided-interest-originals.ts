import type { InterestEntryData } from './guided-interview-flow';
import { parseGuidedCurrency } from './guided-currency';
import { hasEnteredAmount } from './guided-required-facts';
import { buildGuidedPrivateActivityFacts } from './guided-private-activity-facts';

function optionalAmount(value: string | undefined): string | undefined {
  if (!hasEnteredAmount(value)) return undefined;
  parseGuidedCurrency(value);
  return (value ?? '').trim().replace(/,/g, '') || '0';
}
/** The original bridge converter, shared without importing the whole bridge/flow. */
export function buildInterestInputs(entries: InterestEntryData[] | undefined, taxYear?: number | null) {
  return (entries ?? []).filter(entry => Object.values(entry).some(value => typeof value === 'string' && value.trim() !== '')).map(entry => {
    const year = entry.sourceTaxYear?.trim();
    return {
      taxYear: year && /^\d{4}$/.test(year) ? Number(year) : undefined,
      payerTin: entry.payerTin?.trim() || undefined, accountReference: entry.accountReference?.trim() || undefined,
      accountHolder: entry.accountHolder === 'primary' || entry.accountHolder === 'spouse' ? entry.accountHolder : undefined,
      state: entry.state?.trim().toUpperCase() || undefined, stateWithheld: entry.stateTaxReporting === 'none' ? '0' : optionalAmount(entry.stateWithheld),
      payer: entry.payer.trim(), interestIncome: optionalAmount(entry.interestIncome), federalWithheld: optionalAmount(entry.federalWithheld),
      earlyWithdrawalPenalty: optionalAmount(entry.earlyWithdrawalPenalty), usSavingsBondInterest: optionalAmount(entry.usSavingsBondInterest),
      foreignTaxPaid: optionalAmount(entry.foreignTaxPaid), foreignCountry: entry.foreignCountry?.trim() || undefined,
      taxExemptInterest: optionalAmount(entry.taxExemptInterest), privateActivityBondInterest: optionalAmount(entry.privateActivityBondInterest),
      privateActivityBondFacts: buildGuidedPrivateActivityFacts(entry, entry.privateActivityBondInterest, taxYear),
    };
  });
}
