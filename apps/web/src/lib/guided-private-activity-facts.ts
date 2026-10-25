import type { Form1099Int } from '@/models/inputs.js';
import { parseGuidedCurrency } from './guided-currency';

export interface PrivateActivitySourceData {
  pabSourceTaxYear?: string;
  pabSourceId?: string;
  pabRecipientAmountsConfirmed?: string;
  pabOtherwiseAllowableDeduction?: string;
  pabDeductionSourceReference?: string;
  pabDeductionAllowanceAndNoDuplicationConfirmed?: string;
}

export function buildGuidedPrivateActivityFacts(entry: PrivateActivitySourceData, preference: string | undefined, year?: number | null): Form1099Int['privateActivityBondFacts'] {
  const started = Object.entries(entry).some(([key, value]) => key.startsWith('pab') && typeof value === 'string' && value.trim());
  if (!started && (!preference?.trim() || parseGuidedCurrency(preference).isZero())) return undefined;
  if ((year !== 2025 && year !== 2026) || entry.pabSourceTaxYear !== String(year)) throw new Error('Match the actual bond preference source year to the return.');
  if (!entry.pabSourceId?.trim() || entry.pabRecipientAmountsConfirmed !== 'true') throw new Error('Identify the actual source record and confirm recipient amounts after the last edit.');
  if (!entry.pabOtherwiseAllowableDeduction?.trim()) throw new Error('Enter the actual otherwise allowable deduction, including zero when established.');
  const deduction = parseGuidedCurrency(entry.pabOtherwiseAllowableDeduction);
  if (!deduction.isFinite() || deduction.lt(0)) throw new Error('The actual bond deduction must be finite and nonnegative.');
  if (deduction.gt(0) && (!entry.pabDeductionSourceReference?.trim() || entry.pabDeductionAllowanceAndNoDuplicationConfirmed !== 'true')) {
    throw new Error('Provide the actual allowance worksheet and confirm the deduction has not already been used.');
  }
  return { taxYear: year, sourceId: entry.pabSourceId.trim(), recipientAmountsConfirmed: true,
    otherwiseAllowableDeduction: deduction.toFixed(), deductionSourceReference: entry.pabDeductionSourceReference?.trim() || undefined,
    deductionAllowanceAndNoDuplicationConfirmed: entry.pabDeductionAllowanceAndNoDuplicationConfirmed === 'true' ? true : undefined };
}

export function changePrivateActivitySource<T extends PrivateActivitySourceData>(entry: T, field: keyof T, value: string): T {
  if (entry[field] === value) return entry;
  const confirmationFields = ['pabRecipientAmountsConfirmed', 'pabDeductionAllowanceAndNoDuplicationConfirmed'];
  return { ...entry,
    ...(field !== 'pabRecipientAmountsConfirmed' ? { pabRecipientAmountsConfirmed: '' } : {}),
    ...(!confirmationFields.includes(String(field)) ? { pabDeductionAllowanceAndNoDuplicationConfirmed: '' } : {}),
    [field]: value,
  };
}
