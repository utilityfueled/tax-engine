/** Fictional separately authored settled-bank and applied-agency records, not account verification. */
import { ohioResidentCreditFixture } from './oh-resident-credit-sources.js';

type OriginalIdentity = { firstName: string; lastName: string; ssn: string };
interface TransactionIdentity {
  sourceReference: string;
  taxYear: number;
  accountHolder: string;
  originalTaxpayer: OriginalIdentity;
  stateCode: string;
  purpose: string;
  taxPeriodEnd: string;
  amount: string;
  achTraceNumber: string;
}
export interface FictionalResidentCreditTransactionOriginals {
  kind: string;
  bankTransferOriginal: TransactionIdentity & { settlementDate: string; status: string };
  agencyPostingOriginal: TransactionIdentity & {
    accountSourceReference: string; postingDate: string; postingId: string; status: string;
  };
}
export function ohioResidentCreditTransactionsFixture(
  each = '250.00', netTax = '1000.00', refund = '700.00', totalBalance = '500.00',
) {
  const packet = ohioResidentCreditFixture('60000', netTax, '2000');
  const { source } = packet;
  source.filedReturn.balancePayments = totalBalance;
  source.filedReturn.refund = refund;
  const withheld = source.completedAccount.payments.find(row => row.kind === 'withholding');
  if (!withheld) throw new Error('Actual fictional withholding original required');
  source.completedAccount.payments = [withheld];
  for (const [index, trace, postingId] of [
    [1, '091000011000001', 'VA-2026-POST-70001'],
    [2, '091000011000002', 'VA-2026-POST-70002'],
  ] as const) {
    const common = {
      taxYear: 2025, accountHolder: 'primary', originalTaxpayer: structuredClone(source.originalTaxpayer),
      stateCode: 'VA', purpose: 'individual_income_tax_balance', taxPeriodEnd: '2025-12-31',
      amount: each, achTraceNumber: trace,
    };
    const transactionOriginals: FictionalResidentCreditTransactionOriginals = {
      kind: 'settled_ach_credit',
      bankTransferOriginal: {
        ...structuredClone(common), sourceReference: `PRIVATE-BANK-SETTLED-ORIGINAL-${index}`,
        settlementDate: '2026-02-16', status: 'settled',
      },
      agencyPostingOriginal: {
        ...structuredClone(common), sourceReference: `PRIVATE-AGENCY-APPLIED-ORIGINAL-${index}`,
        accountSourceReference: source.completedAccount.sourceReference,
        postingDate: '2026-02-17', postingId, status: 'applied',
      },
    };
    const receipt = {
      sourceId: `PRIVATE-VA-ACTUAL-BALANCE-${index}`, sourceReference: `PRIVATE-VA-ACTUAL-RECEIPT-${index}`,
      taxYear: 2025, accountHolder: 'primary', originalTaxpayer: structuredClone(source.originalTaxpayer),
      kind: 'balance', date: '2026-02-16', amount: each,
    };
    Reflect.set(receipt, 'transactionOriginals', transactionOriginals);
    source.completedAccount.payments.push(receipt);
  }
  if (refund === '0.00' || refund === '0') source.completedAccount.refunds = [];
  else {
    const received = source.completedAccount.refunds[0];
    if (!received) throw new Error('Actual fictional refund original required');
    received.amount = refund;
  }
  return packet;
}
export function residentCreditTransactionRow(packet: ReturnType<typeof ohioResidentCreditTransactionsFixture>, index = 0) {
  const row = packet.source.completedAccount.payments.filter(receipt => receipt.kind === 'balance')[index];
  if (!row) throw new Error('Actual fictional balance receipt required');
  return row;
}
export function residentCreditTransactionOriginals(packet: ReturnType<typeof ohioResidentCreditTransactionsFixture>, index = 0) {
  const original: unknown = Reflect.get(residentCreditTransactionRow(packet, index), 'transactionOriginals');
  if (!original || typeof original !== 'object') throw new Error('Actual fictional original pair required');
  return original as FictionalResidentCreditTransactionOriginals;
}
