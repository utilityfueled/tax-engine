/** Fictional actual records, authored before implementation. Spec state/oh-sd-100-remaining-balance.yaml. */
import type { TaxYearInput } from '@/models/inputs.js';
import { schoolDistrictSourcesFixture } from './oh-school-district-sources.js';

export function schoolBalanceFixture(status: 'unpaid' | 'expected_payment' | 'actual_payment' = 'unpaid'): TaxYearInput {
  const input = structuredClone(schoolDistrictSourcesFixture('900'));
  const payments = input.ohioSchoolDistrict.payments as unknown as Record<string, unknown>;
  const account = payments.account as Record<string, unknown>;
  account.currentOriginalReturnPaymentCredited = status === 'actual_payment' ? '100' : '0';
  payments.remainingTaxPayment = status === 'unpaid'
    ? { status, sourceReference: 'Fictional complete current balance account', sourceFactsConfirmed: true }
    : status === 'expected_payment'
      ? { status, sourceReference: 'Fictional explicit planned payment', sourceFactsConfirmed: true, date: '2026-04-15', amountAppliedToTax: '100' }
      : { status, sourceReference: 'Fictional completed current-original remittance', sourceFactsConfirmed: true, date: '2026-04-15', amountAppliedToTax: '100',
        currentOriginalReturnConfirmed: true, original: { accountName: 'Avery School', accountSsn: input.taxpayer.primary.ssn, taxYear: 2025,
          returnType: 'sd100', districtCode: '0302', kind: 'balance', date: '2026-04-15', amount: '100', confirmationNumber: 'FICTIONAL-SD-BALANCE-2025' } };
  if (status === 'actual_payment') {
    payments.currentTiming = { kind: 'filed', filedDate: '2026-04-15', asOfDate: '2026-04-16' };
    account.asOfDate = '2026-04-16';
  }
  return input;
}
