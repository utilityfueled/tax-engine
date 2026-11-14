import { Form1099IntSchema } from '@/models/inputs.js';
import { CoverdellPostDisqualificationInterestSchema } from '@/models/coverdell-post-disqualification-interest.js';
import type { Form1099QOptions } from '@/engine/forms/form-1099-q.js';
import type { EducationStatementDraft } from './guided-education-distributions';
import type { FilingStatus, InterestEntryData } from './guided-interview-flow';
import { buildInterestInputs, enteredInterestSources } from './guided-interest-originals';
import { parseGuidedCurrency } from './guided-currency';

export interface EducationOriginalContext {
  interestEntries?: InterestEntryData[];
  primarySsn?: string;
  spouseSsn?: string;
}
export const conversionMoneyFields = [
  ['openingCash', 'Actual opening cash after conversion'], ['closingCash', 'Actual full-year closing bank cash'],
  ['taxableBankInterest', 'Actual full-year taxable bank interest'], ['otherIncome', 'Other actual income'],
  ['realizedGains', 'Actual realized gains'], ['realizedLosses', 'Actual realized losses'],
  ['contributions', 'Actual later contributions'], ['withdrawals', 'Actual later withdrawals'],
  ['transfers', 'Actual later transfers'], ['fees', 'Actual later fees'],
] as const;
export const conversionBooleanFields = [
  ['allPostJanuary1ActivityIncludedConfirmed', 'All activity after January 1 is included in these original records'],
  ['cashOnlyAtJanuary1Confirmed', 'The account held only cash on January 1'],
  ['primaryBeneficiaryOwnsDepositConfirmed', 'You are the designated beneficiary and own the converted bank deposit'],
  ['noRetainedTrustConfirmed', 'No trust retained ownership after the actual conversion'],
  ['domesticBankDepositConfirmed', 'Actual records establish an ordinary domestic bank deposit'],
] as const;
type MoneyKey = typeof conversionMoneyFields[number][0];
type BooleanKey = typeof conversionBooleanFields[number][0];
export type CoverdellBankInterestData = Partial<Record<MoneyKey, string> & Record<BooleanKey, boolean | null>> & {
  sourceReference?: string; custodianConversionDate?: string; custodianConversionReference?: string;
  originalIntIndex?: string; sourceFactsConfirmed?: boolean | null; confirmedOriginalValues?: string;
};
/** Private review metadata is not a new source fact. */
export function educationOriginalValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(educationOriginalValues);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'sourceFactsConfirmed' && key !== 'confirmedOriginalValues')
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, educationOriginalValues(entry)]));
  return value;
}
function reviewValues(statement: EducationStatementDraft, context: EducationOriginalContext | undefined, year?: number | null, status?: FilingStatus | null) {
  return JSON.stringify(educationOriginalValues({ statement, context: { interestEntries: context?.interestEntries, primarySsn: context?.primarySsn }, year, status }));
}
export function confirmCoverdellBankInterest(statement: EducationStatementDraft, context: EducationOriginalContext | undefined, year?: number | null, status?: FilingStatus | null): CoverdellBankInterestData {
  if (!statement.bankInterestConversion) throw Error('Add actual bank conversion sources before reviewing them.');
  return { ...statement.bankInterestConversion, sourceFactsConfirmed: true, confirmedOriginalValues: reviewValues(statement, context, year, status) };
}
export function invalidateCoverdellBankInterest(data?: CoverdellBankInterestData): CoverdellBankInterestData | undefined {
  return data ? { ...data, sourceFactsConfirmed: null, confirmedOriginalValues: undefined } : data;
}
const statusMap = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately', hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' } as const;
export function educationOriginalOptions(context?: EducationOriginalContext, year?: number | null, status?: FilingStatus | null): Pick<Form1099QOptions, 'taxpayer' | 'originalInterestStatements'> {
  if ((year !== 2025 && year !== 2026) || !status || !Object.hasOwn(statusMap, status) || !context?.primarySsn || !/^\d{3}-?\d{2}-?\d{4}$/.test(context.primarySsn)) throw Error('Actual return year, filing status and complete primary SSN are required for the converted bank original.');
  if (!Array.isArray(context.interestEntries)) throw Error('Enter the actual original interest statements; an unknown list is not an empty list.');
  return { taxpayer: { taxYear: year, filingStatus: statusMap[status], primary: { ssn: context.primarySsn },
    ...(context.spouseSsn ? { spouse: { ssn: context.spouseSsn } } : {}) },
    originalInterestStatements: buildInterestInputs(context.interestEntries, year).map(row => Form1099IntSchema.parse(row)) };
}
const originalMoneyKeys = ['interestIncome', 'federalWithheld', 'earlyWithdrawalPenalty', 'usSavingsBondInterest', 'foreignTaxPaid', 'taxExemptInterest', 'privateActivityBondInterest', 'paDirectObligationInterest'] as const;
export function buildCoverdellBankInterest(statement: EducationStatementDraft, context?: EducationOriginalContext, year?: number | null, status?: FilingStatus | null) {
  const data = statement.bankInterestConversion;
  if (!data) return undefined;
  if (data.sourceFactsConfirmed !== true || data.confirmedOriginalValues !== reviewValues(statement, context, year, status)) throw Error('Review the actual bank conversion and original interest sources after their last edit.');
  const options = educationOriginalOptions(context, year, status);
  if (!data.originalIntIndex || !/^\d+$/.test(data.originalIntIndex)) throw Error('Choose the actual original bank interest statement.');
  const index = Number(data.originalIntIndex);
  const enteredRows = enteredInterestSources(context?.interestEntries);
  const raw = enteredRows?.[index], original = options.originalInterestStatements?.[index];
  if (!raw || !original) throw Error('Choose an actual original interest statement already entered on this return.');
  for (const key of originalMoneyKeys) if (typeof raw[key] !== 'string' || !raw[key]?.trim()) throw Error(`Enter actual original ${key}, including explicit zero when established.`);
  if (raw.stateWithheld?.trim() && !parseGuidedCurrency(raw.stateWithheld).isZero()) throw Error('The actual no-state-reporting original cannot contain positive state withholding.');
  if (raw.stateTaxReporting !== 'none') throw Error('This domestic cash conversion requires actual no-state-reporting sources.');
  for (const key of ['marketDiscount', 'bondPremium', 'treasuryBondPremium', 'taxExemptBondPremium'] as const)
    if (!raw[key]?.trim() || !parseGuidedCurrency(raw[key]).isZero()) throw Error('Enter actual zero bond adjustments for this ordinary domestic deposit original.');
  const amounts = Object.fromEntries(conversionMoneyFields.map(([key]) => {
    const value = data[key]; if (!value?.trim()) throw Error(`Enter actual ${key}, including zero when established.`);
    return [key, parseGuidedCurrency(value).toFixed()];
  }));
  const snapshotKeys = ['taxYear', 'payer', 'payerTin', 'accountReference', 'accountHolder', ...originalMoneyKeys, 'stateWithheld'] as const;
  return CoverdellPostDisqualificationInterestSchema.parse({ ...amounts,
    ...Object.fromEntries(conversionBooleanFields.map(([key]) => [key, data[key]])),
    sourceTaxYear: year, sourceReference: data.sourceReference?.trim(), sourceFactsConfirmed: true,
    sourceId: statement.fields.sourceId, accountId: statement.fields.accountId, beneficiaryId: statement.fields.beneficiaryId,
    custodianConversionDate: data.custodianConversionDate, custodianConversionReference: data.custodianConversionReference?.trim(),
    originalIntIndex: index, originalInterestSnapshot: Object.fromEntries(snapshotKeys.map(key => [key, original[key]])),
  });
}
