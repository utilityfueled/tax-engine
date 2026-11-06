/** Source-first additive existing APIs; original70+peer47 test bodies remain unchanged. */
import Decimal from 'decimal.js';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { calculateOhioResidentReturn } from '@/engine/state/oh-return.js';
import { calculateOhioResidentReturnFromFederal } from '@/engine/state/oh-engine.js';
import { ohioResidentCreditFixture } from '../../fixtures/oh-resident-credit-sources.js';
import {
  ohioResidentCreditTransactionsFixture, residentCreditTransactionRow, residentCreditTransactionOriginals,
} from '../../fixtures/oh-resident-credit-transactions.js';

type Packet = ReturnType<typeof ohioResidentCreditTransactionsFixture>;
const run = (p: Packet) => calculateOhioResidentReturnFromFederal({ taxInput: p.input, federalResult: calculateFederalTax(p.input) });
it.each([
  ['whole', '250.00', '1000.00', '700.00', '500.00', '1000', '677'],
  ['cents-down', '250.25', '1000.49', '700.01', '500.50', '1000', '677'],
  ['cents-up', '250.25', '1000.50', '700.00', '500.50', '1001', '678'],
  ['Ohio-cap', '300.00', '1800.00', '0.00', '600.00', '1394', '1071'],
] as const)('admits independently linked same-day remittance originals %s', (_label, each, tax, refund, total, credit, ohioRefund) => {
  const packet = ohioResidentCreditTransactionsFixture(each, tax, refund, total);
  const before = structuredClone(packet), precision = Decimal.precision;
  const result = run(packet);
  expect(result.it1040.line3_ohioAgi.toString()).toBe('100000');
  expect(result.it1040.line8c_totalTax.toString()).toBe('2323');
  expect(result.residentCredit?.line1_totalDoubleTaxedIncome.toString()).toBe('60000');
  expect(result.residentCredit?.line6_ohioTaxOnOtherStateIncome.toString()).toBe('1394');
  expect(result.residentCredit?.totalResidentCredit.toString()).toBe(credit);
  expect(result.it1040.line26_refund.toString()).toBe(ohioRefund);
  expect(residentCreditTransactionRow(packet).amount).toBe(each);
  packet.source.completedAccount.payments.reverse();
  expect(run(packet).it1040.line26_refund.toString()).toBe(ohioRefund);
  packet.source.completedAccount.payments.reverse();
  expect(packet).toEqual(before); expect(Decimal.precision).toBe(precision);
});

const invalid: [string, (packet: Packet) => void][] = [
  ['both-originals-absent', p => { for (const row of p.source.completedAccount.payments) Reflect.deleteProperty(row, 'transactionOriginals'); }],
  ['one-colliding-original-absent', p => { Reflect.deleteProperty(residentCreditTransactionRow(p, 1), 'transactionOriginals'); }],
  ['bank-absent', p => { Reflect.deleteProperty(residentCreditTransactionOriginals(p), 'bankTransferOriginal'); }],
  ['agency-absent', p => { Reflect.deleteProperty(residentCreditTransactionOriginals(p), 'agencyPostingOriginal'); }],
  ['unknown-method', p => { residentCreditTransactionOriginals(p).kind = 'eforms_filing_confirmation'; }],
  ['unsettled-bank', p => { residentCreditTransactionOriginals(p).bankTransferOriginal.status = 'scheduled'; }],
  ['unapplied-agency', p => { residentCreditTransactionOriginals(p).agencyPostingOriginal.status = 'submitted'; }],
  ['bank-reference-missing', p => { residentCreditTransactionOriginals(p).bankTransferOriginal.sourceReference = ''; }],
  ['agency-reference-missing', p => { residentCreditTransactionOriginals(p).agencyPostingOriginal.sourceReference = ''; }],
  ['wrong-complete-account', p => { residentCreditTransactionOriginals(p).agencyPostingOriginal.accountSourceReference = 'PRIVATE-DIFFERENT-ACCOUNT'; }],
  ['missing-agency-posting-identity', p => { residentCreditTransactionOriginals(p).agencyPostingOriginal.postingId = ''; }],
  ['wrong-bank-owner', p => { residentCreditTransactionOriginals(p).bankTransferOriginal.originalTaxpayer.ssn = '900-71-0999'; }],
  ['wrong-agency-owner', p => { residentCreditTransactionOriginals(p).agencyPostingOriginal.originalTaxpayer.ssn = '900-71-0999'; }],
  ['wrong-account-holder', p => { residentCreditTransactionOriginals(p).bankTransferOriginal.accountHolder = 'spouse'; }],
  ['wrong-year', p => { residentCreditTransactionOriginals(p).agencyPostingOriginal.taxYear = 2026; }],
  ['wrong-state', p => { residentCreditTransactionOriginals(p).bankTransferOriginal.stateCode = 'OH'; }],
  ['wrong-purpose', p => { residentCreditTransactionOriginals(p).agencyPostingOriginal.purpose = 'estimated_income_tax'; }],
  ['wrong-tax-period', p => { residentCreditTransactionOriginals(p).bankTransferOriginal.taxPeriodEnd = '2024-12-31'; }],
  ['bank-amount-mismatch', p => { residentCreditTransactionOriginals(p).bankTransferOriginal.amount = '250.01'; }],
  ['agency-amount-mismatch', p => { residentCreditTransactionOriginals(p).agencyPostingOriginal.amount = '250.01'; }],
  ['overprecision-original', p => { residentCreditTransactionOriginals(p).bankTransferOriginal.amount = '250.001'; }],
  ['negative-original', p => { residentCreditTransactionOriginals(p).agencyPostingOriginal.amount = '-250'; }],
  ['unknown-original-amount', p => { Reflect.deleteProperty(residentCreditTransactionOriginals(p).bankTransferOriginal, 'amount'); }],
  ['zero-settled-transfer-even-balanced-account', p => {
    residentCreditTransactionRow(p).amount = '0';
    residentCreditTransactionOriginals(p).bankTransferOriginal.amount = '0';
    residentCreditTransactionOriginals(p).agencyPostingOriginal.amount = '0';
    p.source.filedReturn.balancePayments = '250'; p.source.filedReturn.refund = '450';
    const refund = p.source.completedAccount.refunds[0]; if (!refund) throw new Error('Actual refund required'); refund.amount = '450';
  }],
  ['wrong-settlement-date', p => { residentCreditTransactionOriginals(p).bankTransferOriginal.settlementDate = '2026-02-15'; }],
  ['invalid-posting-date', p => { residentCreditTransactionOriginals(p).agencyPostingOriginal.postingDate = '2026-02-30'; }],
  ['posting-before-settlement', p => { residentCreditTransactionOriginals(p).agencyPostingOriginal.postingDate = '2026-02-15'; }],
  ['posting-after-account', p => { residentCreditTransactionOriginals(p).agencyPostingOriginal.postingDate = '2026-03-11'; }],
  ['missing-bank-trace', p => { Reflect.deleteProperty(residentCreditTransactionOriginals(p).bankTransferOriginal, 'achTraceNumber'); }],
  ['arbitrary-provider-confirmation', p => { residentCreditTransactionOriginals(p).bankTransferOriginal.achTraceNumber = 'CONFIRMATION-123'; }],
  ['fourteen-digit-trace', p => { residentCreditTransactionOriginals(p).bankTransferOriginal.achTraceNumber = '09100001100001'; }],
  ['sixteen-digit-trace', p => { residentCreditTransactionOriginals(p).bankTransferOriginal.achTraceNumber = '0910000110000001'; }],
  ['different-counterpart-trace', p => { residentCreditTransactionOriginals(p).agencyPostingOriginal.achTraceNumber = '091000011000099'; }],
  ['same-bank-trace', p => {
    const first = residentCreditTransactionOriginals(p), second = residentCreditTransactionOriginals(p, 1);
    second.bankTransferOriginal.achTraceNumber = first.bankTransferOriginal.achTraceNumber;
    second.agencyPostingOriginal.achTraceNumber = first.agencyPostingOriginal.achTraceNumber;
  }],
  ['same-agency-posting', p => { residentCreditTransactionOriginals(p, 1).agencyPostingOriginal.postingId = residentCreditTransactionOriginals(p).agencyPostingOriginal.postingId; }],
  ['copied-full-original-renamed-receipt', p => { Reflect.set(residentCreditTransactionRow(p, 1), 'transactionOriginals', structuredClone(residentCreditTransactionOriginals(p))); }],
  ['duplicate-original-across-dates', p => {
    const first = residentCreditTransactionOriginals(p), second = residentCreditTransactionOriginals(p, 1);
    residentCreditTransactionRow(p, 1).date = '2026-02-18'; second.bankTransferOriginal.settlementDate = '2026-02-18'; second.agencyPostingOriginal.postingDate = '2026-02-19';
    second.bankTransferOriginal.achTraceNumber = first.bankTransferOriginal.achTraceNumber; second.agencyPostingOriginal.achTraceNumber = first.agencyPostingOriginal.achTraceNumber;
  }],
  ['invalid-proof-without-semantic-collision', p => {
    residentCreditTransactionRow(p, 1).date = '2026-02-18';
    residentCreditTransactionOriginals(p, 1).bankTransferOriginal.settlementDate = '2026-02-18';
    residentCreditTransactionOriginals(p, 1).agencyPostingOriginal.postingDate = '2026-02-19';
    residentCreditTransactionOriginals(p).agencyPostingOriginal.achTraceNumber = '091000011000099';
  }],
  ['withholding-as-bank-balance', p => {
    const row = p.source.completedAccount.payments.find(r => r.kind === 'withholding');
    if (!row) throw new Error('Original withholding required');
    const original = structuredClone(residentCreditTransactionOriginals(p));
    for (const record of [original.bankTransferOriginal, original.agencyPostingOriginal]) {
      record.amount = '1200'; record.achTraceNumber = '091000011000003';
    }
    original.bankTransferOriginal.settlementDate = '2025-12-31';
    original.agencyPostingOriginal.postingDate = '2026-01-02';
    original.agencyPostingOriginal.postingId = 'VA-2026-POST-70003';
    Reflect.set(row, 'transactionOriginals', original);
  }],
  ['unknown-original-key', p => { Reflect.set(residentCreditTransactionOriginals(p).agencyPostingOriginal, 'callerPaymentOverride', true); }],
  ['changed-account-net-total', p => { p.source.completedAccount.netIncomeTax = '1001'; }],
  ['actual-refund-omitted', p => { p.source.completedAccount.refunds = []; }],
];
it.each(invalid)('rejects incomplete or contradictory transaction originals %s', (_name, mutate) => {
  const packet = ohioResidentCreditTransactionsFixture();
  expect(run(packet).it1040.line26_refund.toString()).toBe('677');
  mutate(packet); expect(() => run(packet)).toThrow();
});

it('preserves legacy unique receipts and rejects renamed unproved duplicates', () => {
  const legacy = ohioResidentCreditFixture(); expect(run(legacy).it1040.line26_refund.toString()).toBe('677');
  const packet = ohioResidentCreditTransactionsFixture();
  for (const row of packet.source.completedAccount.payments) Reflect.deleteProperty(row, 'transactionOriginals');
  expect(() => run(packet)).toThrow();
  residentCreditTransactionRow(packet, 1).date = '2026-02-17';
  expect(run(packet).it1040.line26_refund.toString()).toBe('677');
});

it('binds exact transaction originals privately and rejects stale adapted source', () => {
  const packet = ohioResidentCreditTransactionsFixture(), precision = Decimal.precision, before = structuredClone(packet);
  const federal = calculateFederalTax(packet.input), adapted = buildOhioResidentReturnInput(packet.input, federal), first = calculateOhioResidentReturn(adapted);
  expect(first.it1040.line26_refund.toString()).toBe('677');
  const adaptedRow = adapted.residency?.residentCreditSources?.completedAccount.payments.find(row => row.kind === 'balance');
  if (!adaptedRow) throw new Error('Actual adapted receipt required');
  const adaptedOriginals: unknown = Reflect.get(adaptedRow, 'transactionOriginals');
  if (!adaptedOriginals || typeof adaptedOriginals !== 'object') throw new Error('Actual adapted transaction originals required');
  const adaptedAgency: unknown = Reflect.get(adaptedOriginals, 'agencyPostingOriginal');
  if (!adaptedAgency || typeof adaptedAgency !== 'object') throw new Error('Actual adapted agency original required');
  Reflect.set(adaptedAgency, 'sourceReference', 'PRIVATE-NEW-EQUAL-CASH-AGENCY-ORIGINAL');
  residentCreditTransactionOriginals(packet).agencyPostingOriginal.sourceReference = 'PRIVATE-NEW-EQUAL-CASH-AGENCY-ORIGINAL';
  expect(() => calculateOhioResidentReturn(adapted)).toThrow();
  const second = run(packet); expect(second.it1040.line26_refund.toString()).toBe('677'); expect(second.lines).not.toEqual(first.lines);
  expect(JSON.stringify(second.lines)).not.toMatch(/09100001100000[12]|VA-2026-POST-7000[12]|900-71-0412|PRIVATE-/);
  residentCreditTransactionOriginals(packet).agencyPostingOriginal.sourceReference = 'PRIVATE-AGENCY-APPLIED-ORIGINAL-1';
  expect(packet).toEqual(before); expect(Decimal.precision).toBe(precision);
});
