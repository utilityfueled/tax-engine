// Spec: state/oh-2026-return-draft.yaml#direct-treasury-coupon.
import { describe, expect, it } from 'vitest';
import { calculateOhio2026OrdinarySource, calculateOhio2026TreasuryCouponEmployeeSource } from '@/engine/state/oh-2026-ordinary-source.js';
import { calculateOhio2026ReturnDraft, calculateOhio2026TreasuryCouponReturnDraft } from '@/engine/state/oh-2026-return-draft.js';
import { calculateOhio2026ReturnDraftFromSources } from '@/engine/state/oh-engine.js';
import { Form1099IntSchema } from '@/models/inputs.js';
import { ohio2026OrdinaryFixture, rebindOhio2026Ordinary } from '../../fixtures/oh-2026-ordinary-return.js';

const optionalTreasuryZeroBoxes = [
  'earlyWithdrawalPenalty', 'federalWithheld', 'foreignTaxPaid',
  'taxExemptInterest', 'privateActivityBondInterest', 'stateWithheld',
] as const;

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Complete fictional current sources required');
  return value;
}

function treasuryFixture(couponAmount = '4000', wages = '50000', status: Parameters<typeof ohio2026OrdinaryFixture>[0] = 'full_year_resident', joint = false) {
  const packet = ohio2026OrdinaryFixture(status, wages, status === 'part_year_resident' ? '30000' : status === 'nonresident' ? '10000' : wages, joint);
  const form = Form1099IntSchema.parse({
    taxYear: 2026, payer: 'Fictional domestic Treasury custodian', payerTin: '90-7800221',
    accountReference: 'PRIVATE-TREASURY-ACCOUNT', accountHolder: 'primary',
    interestIncome: '0', earlyWithdrawalPenalty: '0', usSavingsBondInterest: couponAmount,
    federalWithheld: '0', foreignTaxPaid: '0', taxExemptInterest: '0', privateActivityBondInterest: '0', stateWithheld: '0',
  });
  packet.input.form1099Int = [form];
  const owner = required(required(packet.input.ohioResidency).owners[0]);
  const category = required(owner.amounts).interestDividends;
  category.federalAmount = couponAmount;
  category.residentAmount = status === 'full_year_resident' ? couponAmount : '0';
  const { firstName, lastName, ssn } = packet.input.taxpayer.primary;
  const sources = {
    ...packet.sources, methodId: 'oh-2026-treasury-coupon-employee-draft-v1',
    treasuryCouponOriginal: {
      sourceReference: 'PRIVATE-CUSTODIAN-ORIGINAL', sourceTaxYear: 2026,
      custodianName: form.payer, custodianTin: required(form.payerTin), accountReference: required(form.accountReference),
      recipient: { accountHolder: 'primary', firstName, lastName, ssn },
      currentUncorrectedNonvoidOriginalConfirmed: true, allOriginalBoxesKnownConfirmed: true,
      noOtherOriginalReportingConfirmed: true,
      otherBoxAmounts: {
        interestIncome: '0', earlyWithdrawalPenalty: '0', federalWithheld: '0', foreignTaxPaid: '0',
        taxExemptInterest: '0', privateActivityBondInterest: '0', stateWithheld: '0',
      },
      security: {
        sourceReference: 'PRIVATE-TREASURY-CONVENTIONAL-NOTE-RECORD', cusip: '912ZZZZZ0',
        accountReference: required(form.accountReference),
        issuer: 'us_treasury', type: 'treasury_note', directBeneficialHoldingConfirmed: true,
        conventionalFixedCouponConfirmed: true,
      },
      receipt: {
        sourceReference: 'PRIVATE-TREASURY-COUPON-RECEIPT', cusip: '912ZZZZZ0', accountReference: required(form.accountReference),
        paidOn: '2026-06-15', amount: couponAmount, currency: 'USD',
        actualGrossCashCouponConfirmed: true, noTimingBasisOrReportingAdjustmentsConfirmed: true,
      },
    },
  };
  const bound = { ...packet, sources, form, category };
  rebindOhio2026Ordinary(bound);
  return bound;
}

type Packet = ReturnType<typeof treasuryFixture>;
function run({ input, sources }: Packet) {
  return calculateOhio2026TreasuryCouponReturnDraft(input, sources);
}

function withAccountReference(accountReference: string): Packet {
  const packet = treasuryFixture();
  packet.form.accountReference = accountReference;
  const original = packet.sources.treasuryCouponOriginal;
  original.accountReference = accountReference;
  original.security.accountReference = accountReference;
  original.receipt.accountReference = accountReference;
  rebindOhio2026Ordinary(packet);
  return JSON.parse(JSON.stringify(packet)) as Packet;
}

describe('Ohio 2026 private direct Treasury coupon draft', () => {
  it('holds normalized zeros without recorded Treasury original amounts', () => {
    const packet = treasuryFixture();
    for (const field of optionalTreasuryZeroBoxes) {
      if (field !== 'privateActivityBondInterest') Reflect.deleteProperty(packet.form, field);
    }
    packet.input.form1099Int = [Form1099IntSchema.parse(packet.form)];
    Reflect.deleteProperty(packet.sources.treasuryCouponOriginal, 'otherBoxAmounts');
    rebindOhio2026Ordinary(packet);
    expect(() => run(packet)).toThrow(/complete confirmed current source packets/i);
  });

  it.each(optionalTreasuryZeroBoxes)('holds an omitted Treasury reporting amount in %s', field => {
    const packet = treasuryFixture();
    Reflect.deleteProperty(packet.form, field);
    rebindOhio2026Ordinary(packet);
    expect(() => run(packet)).toThrow(/unknown original boxes/i);
  });

  it('holds a zero contradicted by a recorded Treasury original box', () => {
    const packet = treasuryFixture();
    packet.sources.treasuryCouponOriginal.otherBoxAmounts.federalWithheld = '0.01';
    rebindOhio2026Ordinary(packet);
    expect(() => run(packet)).toThrow(/other interest or withholding/i);
  });

  it('accepts explicitly confirmed blank Treasury boxes', () => {
    const packet = treasuryFixture();
    for (const field of optionalTreasuryZeroBoxes) packet.form[field] = '0.00';
    packet.form.interestIncome = '0.00';
    packet.sources.treasuryCouponOriginal.otherBoxAmounts.federalWithheld = '0.00';
    Reflect.deleteProperty(packet.form, 'paDirectObligationInterest');
    rebindOhio2026Ordinary(packet);
    const result = run(packet);
    expect(result.treasuryCouponDeduction?.toFixed()).toBe('4000');
    expect(result.ohioAgi.toFixed()).toBe('50000');
    expect(result.filingQualified).toBe(false);
  });

  it('deducts only the matched direct Treasury coupon included in federal AGI', () => {
    const packet = treasuryFixture();
    packet.input.taxpayer.stateResidency = 'full-year';
    rebindOhio2026Ordinary(packet);
    const saved: Packet = JSON.parse(JSON.stringify(packet));
    const before = JSON.stringify(saved);
    const result = run(saved);
    expect(result.federalAgi.toFixed()).toBe('54000');
    expect(result.ohioAgi.toFixed()).toBe('50000');
    expect(result.treasuryCouponDeduction?.toFixed()).toBe('4000');
    expect(result.nonresidentCredit.toFixed()).toBe('0');
    expect(result.incomeTax.toFixed()).toBe('932');
    expect(result.withholding.toFixed()).toBe('1000');
    expect(result.refund.toFixed()).toBe('68');
    expect(result.lines.find(line => line.line === 'direct-treasury-coupon')?.value.toFixed()).toBe('4000');
    expect(result).toMatchObject({ taxYear: 2026, ruleVersion: saved.sources.methodId, calculationStatus: 'incomplete', reviewStatus: 'independent-review-pending', filingQualified: false });
    expect(JSON.stringify(saved)).toBe(before);
    const audit = JSON.stringify(result.lines);
    const proof = saved.sources.treasuryCouponOriginal;
    for (const privateFact of [proof.sourceReference, proof.custodianTin, proof.recipient.ssn, proof.accountReference, proof.security.cusip, proof.receipt.sourceReference]) expect(audit).not.toContain(privateFact);
  });

  it.each(['****1234', '•••• 1234', 'XXXX-1234', 'Account ending in 1234', 'ending in …1234', '1234', 'acct-****1234'])(
    'holds a repeated masked or suffix-only account reference after reopening (%s)',
    accountReference => {
      const saved = withAccountReference(accountReference);
      const before = JSON.stringify(saved);
      expect(() => run(saved)).toThrow(/stable account reference/i);
      expect(JSON.stringify(saved)).toBe(before);
    },
  );

  it('accepts an opaque local account identifier with an embedded suffix', () => {
    const result = run(withAccountReference('local-treasury-xxxx1234'));
    expect(result.treasuryCouponDeduction?.toFixed()).toBe('4000');
    expect(result.ohioAgi.toFixed()).toBe('50000');
    expect(result.filingQualified).toBe(false);
  });

  it('rounds each AGI after its exact cash computation and admits a documented Treasury bond', () => {
    const packet = treasuryFixture('4000.49', '50000.49');
    packet.sources.treasuryCouponOriginal.security.type = 'treasury_bond';
    const result = run(packet);
    expect(result.federalAgi.toFixed()).toBe('54001');
    expect(result.ohioAgi.toFixed()).toBe('50000');
    expect(result.lines.find(line => line.line === 'direct-treasury-coupon')?.value.toFixed()).toBe('4000.49');
  });

  it.each<[string, (packet: Packet) => void, RegExp]>([
    ['a missing original tax year', p => { delete p.form.taxYear; }, /current original Form 1099-INT/],
    ['a different custodian original year', p => { p.form.taxYear = 2025; }, /current original Form 1099-INT/],
    ['a different proof year', p => { p.sources.treasuryCouponOriginal.sourceTaxYear = 2025; }, /complete confirmed current source packets/],
    ['a different taxpayer name', p => { p.sources.treasuryCouponOriginal.recipient.firstName = 'Different'; }, /recipient, custodian or account differs/],
    ['a different taxpayer SSN', p => { p.sources.treasuryCouponOriginal.recipient.ssn = '900-70-0911'; }, /recipient, custodian or account differs/],
    ['the other taxpayer owner tag', p => { p.form.accountHolder = 'spouse'; }, /current original Form 1099-INT/],
    ['a different custodian TIN', p => { p.form.payerTin = '90-7800321'; }, /recipient, custodian or account differs/],
    ['a different custodian name', p => { p.form.payer += ' Inc.'; }, /recipient, custodian or account differs/],
    ['an omitted account', p => { delete p.form.accountReference; }, /current original Form 1099-INT/],
    ['a different original account', p => { p.form.accountReference = 'PRIVATE-OTHER-ACCOUNT'; }, /recipient, custodian or account differs/],
    ['a security recorded for a different account', p => { p.sources.treasuryCouponOriginal.security.accountReference = 'PRIVATE-OTHER-ACCOUNT'; }, /security and receipt do not match/],
    ['a receipt for a different account', p => { p.sources.treasuryCouponOriginal.receipt.accountReference = 'PRIVATE-OTHER-ACCOUNT'; }, /security and receipt do not match/],
    ['a receipt for a different CUSIP', p => { p.sources.treasuryCouponOriginal.receipt.cusip = '912YYYYY1'; }, /security and receipt do not match/],
    ['a different issuer', p => { p.sources.treasuryCouponOriginal.security.issuer = 'treasury_fund'; }, /complete confirmed current source packets/],
    ['a Treasury bill', p => { p.sources.treasuryCouponOriginal.security.type = 'treasury_bill'; }, /complete confirmed current source packets/],
    ['a savings bond', p => { p.sources.treasuryCouponOriginal.security.type = 'savings_bond'; }, /complete confirmed current source packets/],
    ['an indirect holding', p => { p.sources.treasuryCouponOriginal.security.directBeneficialHoldingConfirmed = false; }, /complete confirmed current source packets/],
    ['a corrected or void original', p => { p.sources.treasuryCouponOriginal.currentUncorrectedNonvoidOriginalConfirmed = false; }, /complete confirmed current source packets/],
    ['an omitted original confirmation', p => { Reflect.deleteProperty(p.sources.treasuryCouponOriginal, 'currentUncorrectedNonvoidOriginalConfirmed'); }, /complete confirmed current source packets/],
    ['an unknown unrepresented box', p => { p.sources.treasuryCouponOriginal.allOriginalBoxesKnownConfirmed = false; }, /complete confirmed current source packets/],
    ['an omitted all-box confirmation', p => { Reflect.deleteProperty(p.sources.treasuryCouponOriginal, 'allOriginalBoxesKnownConfirmed'); }, /complete confirmed current source packets/],
    ['premium or other original reporting', p => { p.sources.treasuryCouponOriginal.noOtherOriginalReportingConfirmed = false; }, /complete confirmed current source packets/],
    ['a basis or federal timing adjustment', p => { p.sources.treasuryCouponOriginal.receipt.noTimingBasisOrReportingAdjustmentsConfirmed = false; }, /complete confirmed current source packets/],
    ['a repeated receipt reference', p => { p.sources.treasuryCouponOriginal.receipt.sourceReference = p.sources.treasuryCouponOriginal.security.sourceReference; }, /distinct original Form 1099-INT, security and receipt references/],
    ['an invalid receipt date', p => { p.sources.treasuryCouponOriginal.receipt.paidOn = '2026-02-29'; }, /valid actual source date/],
    ['payment from a prior calendar year', p => { p.sources.treasuryCouponOriginal.receipt.paidOn = '2025-12-31'; }, /current calendar 2026/],
    ['a mismatched gross coupon', p => { p.sources.treasuryCouponOriginal.receipt.amount = '3999.99'; }, /cash coupon does not reconcile to Box 3/],
    ['zero Box 3', p => { p.form.usSavingsBondInterest = '0'; p.sources.treasuryCouponOriginal.receipt.amount = '0'; }, /cash coupon does not reconcile to Box 3/],
    ['other ordinary interest', p => { p.form.interestIncome = '1'; }, /other interest or withholding requires/],
    ['an omitted Box 1', p => { Reflect.deleteProperty(p.form, 'interestIncome'); }, /current original Form 1099-INT/],
    ['federal withholding', p => { p.form.federalWithheld = '12'; }, /other interest or withholding requires/],
    ['state withholding', p => { p.form.stateWithheld = '10'; }, /other interest or withholding requires/],
    ['an original state entry', p => { p.form.state = 'OH'; }, /other interest or withholding requires/],
    ['an unrecognized canonical field', p => { Object.assign(p.form, { treasuryBondPremium: '10' }); }, /current original Form 1099-INT/],
    ['multiple interest originals', p => { required(p.input.form1099Int).push(structuredClone(p.form)); }, /current original Form 1099-INT/],
    ['an unsupported zero-income original', p => { Object.assign(p.input, { form1099OID: [{}] }); }, /retained other originals/],
    ['a false resident category', p => { p.category.residentAmount = '0'; }, /source categories and service allocation differ/],
    ['a contradictory primary declaration', p => { p.input.taxpayer.stateResidency = 'nonresident'; }, /declared Ohio residency conflicts/],
  ])('holds %s', (_name, mutate, message) => {
    const packet = treasuryFixture();
    mutate(packet);
    rebindOhio2026Ordinary(packet);
    expect(() => run(packet)).toThrow(message);
  });

  // Spec: state/oh-2026-return-draft.yaml#direct-treasury-coupon-source-holds.
  it.each(['payment', 'payment schedule'] as const)('holds an orphan unemployment %s without canonical Form 1099-G', kind => {
    const packet = treasuryFixture();
    delete packet.input.form1099G;
    const residency = required(packet.input.ohioResidency);
    const source = { originalSourceId: 'PRIVATE-OTHER-BOX-1', allPaymentsIncludedConfirmed: true as const };
    const receipt = { paidOrAccruedOn: '2026-05-15', amount: '100', sourceReference: 'PRIVATE-OTHER-BOX-1-PAY-1' };
    if (kind === 'payment') residency.unemploymentPaymentSource = { ...source, ...receipt };
    else residency.unemploymentPaymentSchedule = { ...source, payments: [receipt, { ...receipt, paidOrAccruedOn: '2026-05-31', sourceReference: 'PRIVATE-OTHER-BOX-1-PAY-2' }] };
    rebindOhio2026Ordinary(packet);
    expect(() => run(packet)).toThrow(/retained unemployment receipts require their separate method/);
  });

  it('requires separate documentary evidence and leaves ordinary and historical routes unchanged', () => {
    const packet = treasuryFixture();
    const { methodId: _method, treasuryCouponOriginal: _proof, ...ordinarySources } = packet.sources;
    expect(() => calculateOhio2026TreasuryCouponReturnDraft(packet.input, { ...ordinarySources, methodId: _method })).toThrow(/complete confirmed current source packets/);
    expect(() => calculateOhio2026OrdinarySource(packet.input, ordinarySources)).toThrow(/retained other originals/);
    expect(() => calculateOhio2026ReturnDraftFromSources({ taxInput: packet.input, sources: packet.sources })).toThrow(/complete confirmed current source packets/);
    const ordinary = ohio2026OrdinaryFixture();
    const wageDraft = calculateOhio2026ReturnDraftFromSources({ taxInput: ordinary.input, sources: ordinary.sources });
    expect(wageDraft.incomeTax.toFixed()).toBe('932');
    expect(wageDraft.refund.toFixed()).toBe('68');
    expect(wageDraft.ruleVersion).toBe('oh-2026-ordinary-employee-draft-v1');
    expect(wageDraft.lines.some(line => line.line === 'direct-treasury-coupon')).toBe(false);
    packet.input.taxpayer.taxYear = 2025;
    rebindOhio2026Ordinary(packet);
    expect(() => run(packet)).toThrow(/actual current2026 taxpayer and source year required/);
  });

  it('holds part-year, nonresident and joint owners for their separate source allocation', () => {
    for (const packet of [treasuryFixture('4000', '50000', 'part_year_resident'), treasuryFixture('4000', '50000', 'nonresident'), treasuryFixture('4000', '50000', 'full_year_resident', true)]) {
      expect(() => run(packet)).toThrow(/single primary full-year Ohio resident/);
    }
  });

  it('requires fresh qualification after even a provenance-only source change', () => {
    const packet = treasuryFixture();
    const first = run(packet);
    const context = calculateOhio2026TreasuryCouponEmployeeSource(packet.input, packet.sources);
    expect(() => calculateOhio2026ReturnDraft(packet.input, packet.sources, { ...context })).toThrow(/stale or forged/);
    packet.sources.treasuryCouponOriginal.receipt.sourceReference += '-ALTERNATE';
    expect(() => calculateOhio2026ReturnDraft(packet.input, packet.sources, context)).toThrow(/stale or forged/);
    const next = run(packet);
    expect(next.sourceCommitment).not.toBe(first.sourceCommitment);
    expect(next.incomeTax.toFixed()).toBe('932');
  });
});
