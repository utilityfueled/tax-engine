/** Spec: spec/state/oh-2026-resident-credit-draft.yaml. Literal expectations precede implementation. */
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { calculateOhio2026ReturnDraftFromSources } from '@/engine/state/oh-engine.js';
import { calculateOhio2026ReturnDraft } from '@/engine/state/oh-2026-return-draft.js';
import { calculateOhio2026VaResidentCreditEmployeeSource } from '@/engine/state/oh-2026-ordinary-source.js';
import { calculateOhio2026ResidentCreditSource, readOhio2026ResidentCreditSource } from '@/engine/state/oh-2026-resident-credit-source.js';
import { calculateOhio2026OrdinarySource } from '@/engine/state/oh-2026-ordinary-source.js';
import { TAX_CONSTANTS, OHIO_TAX_CONSTANTS } from '@/models/constants.js';
import { ohio2026VaResidentCreditFixture, ohio2026VaSettledTransactionsFixture, rebindOhio2026VaResidentCredit } from '../../fixtures/oh-2026-va-resident-credit-return.js';
type Packet = ReturnType<typeof ohio2026VaResidentCreditFixture>;
const run = (p: Packet) => calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
function current<T>(v: T | null | undefined): T { if (v === undefined || v === null) throw new Error('Explicit fictional original required'); return v; }
const credit = (p: Packet) => p.sources.residentCreditSources;
const firstW2 = (p: Packet) => current(p.input.w2s[0]);
const owner = (p: Packet) => current(current(p.input.ohioResidency).owners[0]);
const receipt = (p: Packet) => current(credit(p).completedAccount.payments[0]);
const filed = (p: Packet) => credit(p).filedReturn;
const account = (p: Packet) => credit(p).completedAccount;
const cases = [
  ['liability-not-gross-WH', '100000', '60000', '1000', '2000', '2313', '0', '1000', '1313', '687'],
  ['Ohio-cap', '100000', '60000', '1800', '2000', '2313', '0', '1388', '925', '1075'],
  ['truncate-four', '100000', '27778', '1300', '2000', '2313', '0', '642', '1671', '329'],
  ['truncate-changes-credit', '100000', '20035', '1300', '2000', '2313', '0', '463', '1850', '150'],
  ['all-VA-services', '100000', '100000', '2500', '2000', '2313', '0', '2313', '0', '2000'],
  ['complete-known-zero', '100000', '0', '0', '2500', '2313', '0', '0', '2313', '187'],
  ['paid-cents-down', '100000', '60000', '1000.49', '2000', '2313', '0', '1000', '1313', '687'],
  ['paid-half-up', '100000', '60000', '1000.50', '2000', '2313', '0', '1001', '1312', '688'],
  ['income-cents-down', '100000', '27777.49', '1300', '2000', '2313', '0', '642', '1671', '329'],
  ['income-half-up', '100000', '27777.50', '1300', '2000', '2313', '0', '642', '1671', '329'],
  ['preceding-personal-credit', '30000', '15000', '500', '1000', '375', '20', '178', '177', '823'],
  ['paid-rounds-zero', '100000', '60000', '0.49', '2500', '2313', '0', '0', '2313', '187'],
  ['income-rounds-zero', '100000', '0.49', '1', '2500', '2313', '0', '0', '2313', '187'],
  ['zero-Ohio-tax', '28000', '14000', '300', '1000', '0', '0', '0', '0', '1000'],
] as const;

describe('Ohio2026 paid Virginia resident-credit source draft', () => {
  it.each(cases)('applies independent literal2026 paid-credit and settlement accounts %s', (_name, wages, vaIncome, netTax, withholding, gross, personal, allowed, liability, refund) => {
    const p = ohio2026VaResidentCreditFixture(vaIncome, netTax, withholding, wages), before = JSON.stringify(p);
    const result = run(p);
    expect(result.taxYear).toBe(2026);
    expect(result.ruleVersion).toBe('oh-2026-va-resident-credit-employee-draft-v1');
    expect(result.federalAgi.toFixed()).toBe(wages);
    expect(result.ohioAgi.toFixed()).toBe(wages);
    expect(result.taxBeforeCredits.toFixed()).toBe(gross);
    expect(result.personalExemptionCredit.toFixed()).toBe(personal);
    expect(result.nonresidentCredit.toFixed()).toBe('0');
    expect(result.jointFilingCredit.toFixed()).toBe('0');
    expect(result.earnedIncomeCredit.toFixed()).toBe('0');
    expect(result.residentCredit?.toFixed()).toBe(allowed);
    const ratios: Record<string, string> = { 'liability-not-gross-WH': '0.6000', 'Ohio-cap': '0.6000', 'truncate-four': '0.2777', 'truncate-changes-credit': '0.2003', 'all-VA-services': '1.0000', 'complete-known-zero': '0.0000', 'paid-cents-down': '0.6000', 'paid-half-up': '0.6000', 'income-cents-down': '0.2777', 'income-half-up': '0.2777', 'preceding-personal-credit': '0.5000', 'paid-rounds-zero': '0.6000', 'income-rounds-zero': '0.0000', 'zero-Ohio-tax': '0.5000' };
    expect(result.lines.find(line => line.form === 'OH2026 enacted resident credit draft' && line.line === 'ratio')?.value.toFixed(4)).toBe(ratios[_name]);
    expect(result.incomeTax.toFixed()).toBe(liability);
    expect(result.withholding.toFixed()).toBe(withholding);
    expect(result.refund.toFixed()).toBe(refund);
    for (const amount of [result.amountDue, result.underpaymentPenalty, result.latePaymentInterest]) expect(amount.toFixed()).toBe('0');
    expect(result.filingQualified).toBe(false); expect(result.calculationStatus).toBe('incomplete');
    expect(result.reviewStatus).toBe('independent-review-pending');
    expect(JSON.stringify(p)).toBe(before);
  });

  const sourceContradictions: Array<[string, (p: Packet) => void]> = [
    ['wrong-current-year', p => { p.input.taxpayer.taxYear = 2025; }],
    ['wrong-credit-year', p => { credit(p).sourceTaxYear = 2025; }],
    ['wrong-owner', p => { credit(p).accountHolder = 'spouse'; }],
    ['wrong-index', p => { credit(p).w2Index = 1; }],
    ['current-W2-snapshot', p => { credit(p).originalW2.wages = '99999'; }],
    ['identity', p => { credit(p).originalTaxpayer.ssn = '900-70-9999'; }],
    ['entity', p => { credit(p).employerEntityOriginal.entityType = 'partnership'; }],
    ['employer-name', p => { credit(p).employerEntityOriginal.employerName = 'Other'; }],
    ['employer-document-date', p => { credit(p).employerEntityOriginal.documentDate = '2027-03-02'; }],
    ['special-compensation', p => { firstW2(p).box10DependentCareBenefits = '1'; }],
    ['foreign-local-source', p => { firstW2(p).localTaxWithheld = '1'; }],
    ['service-gap', p => { current(credit(p).serviceRows[0]).servicePeriodTo = '2026-06-29'; }],
    ['service-identity', p => { current(credit(p).serviceRows[0]).employerTin = '90-7000999'; }],
    ['service-calendar', p => { current(credit(p).serviceRows[0]).paymentDate = '2026-02-30'; }],
    ['future-services', p => { current(credit(p).serviceRows[0]).paymentDate = '2027-01-01'; }],
    ['wrong-taxed-service', p => { current(credit(p).serviceRows[0]).serviceState = 'PA'; }],
    ['contradictory-common-payroll', p => { current(current(p.sources.employmentOriginals[0]).serviceRows[0]).serviceState = 'OH'; }],
    ['service-totals', p => { current(credit(p).serviceRows[0]).wages = '59999'; }],
    ['duplicate-service', p => { credit(p).serviceRows.push(structuredClone(current(credit(p).serviceRows[0]))); }],
    ['PY-overlap', p => { owner(p).status = 'part_year_resident'; }],
    ['NRC-overlap', p => { current(owner(p).amounts).wages.nonresidentOhioAmount = '1'; }],
    ['hidden-income-even-zero', p => { p.input.form1099Int = [{ interestIncome: '0' }] as never; }],
    ['unconfirmed-income-inventory', p => { credit(p).allIncomeOriginalsIncludedConfirmed = false; }],
    ['unsupported-family', p => { p.input.taxpayer.filingStatus = 'head_of_household'; }],
    ['contradictory-no-other-state', p => { Reflect.set(p.sources, 'noOtherStateTaxOnOhioResidentIncomeConfirmed', true); }],
    ['missing-other-credit-confirmation', p => { Reflect.deleteProperty(p.sources, 'noOtherOhioCreditBeyondDocumentedResidentCreditConfirmed'); }],
  ];
  it.each(sourceContradictions)('qualifies only complete current paid Virginia originals: %s', (_name, mutate) => {
    const p = ohio2026VaResidentCreditFixture(); mutate(p); rebindOhio2026VaResidentCredit(p);
    expect(() => run(p)).toThrow();
  });
  const accountContradictions: Array<[string, (p: Packet) => void]> = [
    ['gross-WH-is-not-net-tax', p => { filed(p).netIncomeTax = '1200'; account(p).netIncomeTax = '1200'; }],
    ['unpaid-tax', p => { account(p).unpaidTax = '0.01'; }],
    ['unapplied-payment', p => { account(p).unappliedPayments = '0.01'; }],
    ['pending-refund', p => { account(p).noPendingChangesOrRefundClaimsConfirmed = false; }],
    ['missing-paid-receipt', p => { account(p).payments = []; }],
    ['missing-refund', p => { account(p).refunds = []; }],
    ['liability-before-credits', p => { filed(p).nonrefundableCredits = '1499'; }],
    ['wrong-same-income', p => { filed(p).incomeTaxedByVirginia = '59999'; }],
    ['wrong-return-owner', p => { filed(p).originalTaxpayer.ssn = '900-70-9999'; }],
    ['wrong-return-year', p => { filed(p).taxYear = 2025; }],
    ['wrong-return-form', p => { filed(p).form = '760'; }],
    ['wrong-refund-year', p => { current(account(p).refunds[0]).taxYear = 2025; }],
    ['unfiled', p => { filed(p).filedDate = ''; }],
    ['future-return', p => { filed(p).filedDate = '2027-03-02'; }],
    ['future-account', p => { account(p).statementDate = '2027-03-02'; }],
    ['refund-before-filed', p => { current(account(p).refunds[0]).date = '2027-02-14'; }],
    ['negative-cash', p => { receipt(p).amount = '-1'; }],
    ['unknown-cash', p => { Reflect.deleteProperty(filed(p), 'otherTaxes'); }],
    ['null-cash', p => { Reflect.set(filed(p), 'outgoingCredit', null); }],
    ['overprecision', p => { account(p).netIncomeTax = '1000.001'; }],
    ['duplicate-ID', p => { const a = receipt(p); a.amount = '600'; account(p).payments.push({ ...a, sourceReference: 'DIFFERENT-REFERENCE' }); }],
    ['renamed-semantic-duplicate', p => { const a = receipt(p); a.amount = '600'; account(p).payments.push({ ...a, sourceId: 'NEW-ID', sourceReference: 'NEW-REF' }); }],
    ['tax-deducted-federal', p => { credit(p).taxDeductedInFederalAgi = 'deducted'; }],
  ];
  it.each(accountContradictions)('rejects unsettled contradictory or unavailable paid-account originals: %s', (_name, mutate) => {
    const p = ohio2026VaResidentCreditFixture(); mutate(p); rebindOhio2026VaResidentCredit(p);
    expect(() => run(p)).toThrow();
    const zero = ohio2026VaResidentCreditFixture('14000', '300', '1000', '28000'); mutate(zero); rebindOhio2026VaResidentCredit(zero);
    expect(() => run(zero)).toThrow();
  });

  it('reconciles distinct settled remittances and exact cents before rounding', () => {
    for (const [each, refund, net, allowed, expectedRefund] of [
      ['250', '700', '1000', '1000', '687'],
      ['250.25', '700.01', '1000.49', '1000', '687'],
      ['250.25', '700', '1000.50', '1001', '688'],
      ['300', '0', '1800', '1388', '1075'],
    ] as const) {
      const p = ohio2026VaSettledTransactionsFixture(each, refund, net), before = JSON.stringify(p), a = run(p);
      expect(a.residentCredit?.toFixed()).toBe(allowed); expect(a.refund.toFixed()).toBe(expectedRefund);
      expect(JSON.stringify(p)).toBe(before);
      account(p).payments.reverse(); const b = run(p);
      expect(b.incomeTax.toFixed()).toBe(a.incomeTax.toFixed());
      expect(b.sourceCommitment).not.toBe(a.sourceCommitment);
      expect(JSON.stringify(a)).not.toContain('09100001100000');
    }
  });
  it.each(['missing-proof', 'trace-reuse', 'posting-reuse', 'wrong-period', 'bank-unsettled', 'wrong-account', 'wrong-date', 'wrong-cents', 'partial-pair'])('rejects contradictory remittance evidence: %s', kind => {
    const p = ohio2026VaSettledTransactionsFixture(), payments = account(p).payments;
    const a = current(payments[1]), b = current(payments[2]);
    const proof = Reflect.get(b, 'transactionOriginals') as { bankTransferOriginal: Record<string, unknown>; agencyPostingOriginal: Record<string, unknown> };
    if (kind === 'missing-proof') { Reflect.deleteProperty(a, 'transactionOriginals'); Reflect.deleteProperty(b, 'transactionOriginals'); }
    else if (kind === 'trace-reuse') { proof.bankTransferOriginal.achTraceNumber = '091000011000001'; proof.agencyPostingOriginal.achTraceNumber = '091000011000001'; }
    else if (kind === 'posting-reuse') proof.agencyPostingOriginal.postingId = 'PRIVATE-2026-AGENCY-POST-1';
    else if (kind === 'wrong-period') proof.bankTransferOriginal.taxPeriodEnd = '2025-12-31';
    else if (kind === 'bank-unsettled') proof.bankTransferOriginal.status = 'pending';
    else if (kind === 'wrong-account') proof.agencyPostingOriginal.accountSourceReference = 'OTHER';
    else if (kind === 'wrong-date') proof.agencyPostingOriginal.postingDate = '2027-02-15';
    else if (kind === 'wrong-cents') proof.bankTransferOriginal.amount = '250.01';
    else Reflect.deleteProperty(proof, 'agencyPostingOriginal');
    expect(() => run(p)).toThrow();
  });

  it('binds current originals privately and preserves historical and filing gates', () => {
    const p = ohio2026VaResidentCreditFixture(), before = JSON.stringify(p), precision = Decimal.precision;
    const a = run(p), b = run(p);
    const context = calculateOhio2026VaResidentCreditEmployeeSource(p.input, p.sources);
    const inner = calculateOhio2026ResidentCreditSource(p.input, p.sources);
    expect(() => calculateOhio2026ReturnDraft(p.input, p.sources, { ...context })).toThrow(/forged/);
    expect(() => readOhio2026ResidentCreditSource({ ...inner }, p.input, p.sources)).toThrow(/forged/);
    expect(a).toEqual(b); expect(JSON.stringify(p)).toBe(before); expect(Decimal.precision).toBe(precision);
    expect(() => calculateOhio2026OrdinarySource(p.input, p.sources)).toThrow();
    const fake = { methodId: 'oh-2026-va-resident-credit-employee-draft-v1', sourceCommitment: a.sourceCommitment };
    expect(() => calculateOhio2026ReturnDraft(p.input, p.sources, fake as never)).toThrow(/forged/);
    credit(p).completedAccount.sourceReference += '-new-original';
    expect(() => calculateOhio2026ReturnDraft(p.input, p.sources, context)).toThrow(/stale/);
    expect(() => readOhio2026ResidentCreditSource(inner, p.input, p.sources)).toThrow(/stale/);
    const changed = run(p); expect(changed.sourceCommitment).not.toBe(a.sourceCommitment);
    expect(changed.incomeTax.toFixed()).toBe(a.incomeTax.toFixed());
    for (const marker of ['900-70-0901', '90-7000901', 'PRIVATE-2026-', 'PRIVATE-COMPLETE-']) expect(JSON.stringify(a)).not.toContain(marker);
    expect(a.lines.some(line => line.form.includes('2026') && line.description.includes('resident credit'))).toBe(true);
    expect(TAX_CONSTANTS[2026]).toBeUndefined(); expect(OHIO_TAX_CONSTANTS[2026]).toBeUndefined();
  });
});
