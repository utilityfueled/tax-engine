// Spec: state/oh-2026-return-draft.yaml#part-year-bank-interest.
import { describe, expect, it } from 'vitest';
import { calculateOhio2026BankInterestReturnDraft } from '@/engine/state/oh-2026-return-draft.js';
import { calculateOhio2026ReturnDraftFromSources } from '@/engine/state/oh-engine.js';
import { Form1099IntSchema } from '@/models/inputs.js';
import { ohio2026OrdinaryFixture, rebindOhio2026Ordinary } from '../../fixtures/oh-2026-ordinary-return.js';

const bankMethods = {
  full_year_resident: 'oh-2026-full-year-bank-interest-employee-draft-v1',
  part_year_resident: 'oh-2026-part-year-bank-interest-employee-draft-v1',
  nonresident: 'oh-2026-nonresident-bank-interest-employee-draft-v1',
} as const;

const declaredResidency = {
  full_year_resident: 'full-year',
  part_year_resident: 'part-year',
  nonresident: 'nonresident',
} as const;

const bankZeroBoxes = ['earlyWithdrawalPenalty', 'usSavingsBondInterest', 'federalWithheld',
  'foreignTaxPaid', 'taxExemptInterest', 'privateActivityBondInterest', 'stateWithheld'] as const;

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Complete fictional bank and residency sources required');
  return value;
}

function bankFixture(status: keyof typeof bankMethods = 'part_year_resident') {
  const packet = ohio2026OrdinaryFixture(status, '50000', {
    full_year_resident: '50000', part_year_resident: '30000', nonresident: '10000',
  }[status]);
  packet.input.taxpayer.stateResidency = declaredResidency[status];
  const w2 = required(packet.input.w2s[0]);
  const stateLocal = required(w2.stateLocalSources);
  const stateRow = required(stateLocal.stateRows[0]);
  if (status === 'full_year_resident') {
    w2.stateTaxWithheld = '1250';
    stateLocal.originalW2.stateTaxWithheld = '1250';
    stateRow.withheld = '1250';
  } else if (status === 'nonresident') {
    w2.stateWages = '10000';
    stateLocal.originalW2.stateWages = '10000';
    stateRow.wages = '10000';
  }
  const form = Form1099IntSchema.parse({
    taxYear: 2026, payer: 'Fictional Domestic Bank', payerTin: '55-5555512',
    accountReference: 'PRIVATE-DEPOSIT-001', accountHolder: 'primary', interestIncome: '4000',
    earlyWithdrawalPenalty: '0', usSavingsBondInterest: '0', federalWithheld: '0',
    foreignTaxPaid: '0', taxExemptInterest: '0', privateActivityBondInterest: '0', stateWithheld: '0',
  });
  packet.input.form1099Int = [form];
  const residency = required(packet.input.ohioResidency);
  const allocation = required(required(residency.owners[0]).amounts).interestDividends;
  allocation.federalAmount = '4000';
  allocation.residentAmount = { full_year_resident: '4000', part_year_resident: '1000', nonresident: '0' }[status];
  const accountReference = required(form.accountReference);
  const { firstName, lastName, ssn } = packet.input.taxpayer.primary;
  const original = {
    sourceTaxYear: 2026, sourceReference: 'PRIVATE-BANK-2026-FORM',
    payerName: form.payer, payerTin: required(form.payerTin), accountReference,
    recipient: { accountHolder: 'primary', firstName, lastName, ssn },
    currentUncorrectedNonvoidOriginalConfirmed: true, allOriginalBoxesKnownConfirmed: true,
    otherBoxAmounts: {
      earlyWithdrawalPenalty: '0', usSavingsBondInterest: '0', federalWithheld: '0',
      foreignTaxPaid: '0', taxExemptInterest: '0', privateActivityBondInterest: '0', stateWithheld: '0',
    },
    noOtherOriginalReportingConfirmed: true, cashMethodOrdinaryDomesticDepositConfirmed: true,
    completeActualBankCreditsConfirmed: true,
    credits: [
      { sourceReference: 'PRIVATE-2026-CREDIT-1', accountReference, creditedOn: '2026-06-30', amount: '3000', availableOnCreditDateConfirmed: true },
      { sourceReference: 'PRIVATE-2026-CREDIT-2', accountReference, creditedOn: '2026-07-01', amount: '1000', availableOnCreditDateConfirmed: true },
    ],
  };
  const sources = { ...packet.sources, methodId: bankMethods[status], bankInterestOriginal: original };
  const bound = { input: packet.input, sources, original, residency, allocation, form, credits: original.credits };
  rebindOhio2026Ordinary(bound);
  return bound;
}

type Packet = ReturnType<typeof bankFixture>;

function run({ input, sources }: Packet) {
  return calculateOhio2026BankInterestReturnDraft(input, sources);
}

describe('Ohio 2026 private bank interest draft', () => {
  it('allocates actual bank credits on both sides of the Ohio move', () => {
    const saved: Packet = JSON.parse(JSON.stringify(bankFixture()));
    const before = JSON.stringify(saved);
    const result = run(saved);
    expect(result.federalAgi.toFixed()).toBe('54000');
    expect(result.ohioAgi.toFixed()).toBe('54000');
    expect(result.taxBeforeCredits.toFixed()).toBe('1042');
    expect(result.nonresidentRatio.toFixed(4)).toBe('0.4259');
    expect(result.nonresidentCredit.toFixed()).toBe('444');
    expect(result.incomeTax.toFixed()).toBe('598');
    expect(result.refund.toFixed()).toBe('402');
    expect(result.lines.find(line => line.form === 'OH-IT-NRC' && line.line === '10')?.value.toFixed()).toBe('1000');
    expect(result).toMatchObject({
      taxYear: 2026, ruleVersion: saved.sources.methodId, calculationStatus: 'incomplete',
      reviewStatus: 'independent-review-pending', filingQualified: false,
    });
    expect(JSON.stringify(saved)).toBe(before);
    const audit = JSON.stringify(result.lines);
    for (const fact of [saved.original.recipient.ssn, saved.original.payerTin, saved.original.accountReference, saved.credits[0].sourceReference]) {
      expect(audit).not.toContain(fact);
    }
  });

  it('reconciles interest cents before rounding the Ohio and federal AGI', () => {
    const p = bankFixture();
    p.form.interestIncome = '4000.50';
    p.credits[0].amount = '3000.25';
    p.credits[1].amount = '1000.25';
    p.allocation.federalAmount = '4000.50';
    p.allocation.residentAmount = '1000.25';
    rebindOhio2026Ordinary(p);
    const result = run(p);
    expect(result.federalAgi.toFixed()).toBe('54001');
    expect(result.ohioAgi.toFixed()).toBe('54001');
    expect(result.lines.find(line => line.form === 'OH-IT-NRC' && line.line === '10')?.value.toFixed()).toBe('1000');
  });

  it('includes all bank interest for a full-year Ohio resident', () => {
    const saved: Packet = JSON.parse(JSON.stringify(bankFixture('full_year_resident')));
    const result = calculateOhio2026ReturnDraftFromSources({ taxInput: saved.input, sources: saved.sources });
    expect(result).toEqual(run(saved));
    expect(result).toMatchObject({
      ruleVersion: bankMethods.full_year_resident, calculationStatus: 'incomplete',
      reviewStatus: 'independent-review-pending', filingQualified: false,
    });
    expect(result.federalAgi.toFixed()).toBe('54000');
    expect(result.ohioAgi.toFixed()).toBe('54000');
    // RC 5747.02(A)(3)(c): 332 + (54000 - 2150 - 26050) * .0275 = 1041.50.
    expect(result.taxBeforeCredits.toFixed()).toBe('1042');
    expect(result.nonresidentRatio.toFixed(4)).toBe('0.0000');
    expect(result.nonresidentCredit.toFixed()).toBe('0');
    expect(result.incomeTax.toFixed()).toBe('1042');
    expect(result.refund.toFixed()).toBe('208');
    expect(result.lines.find(line => line.line === 'ohio-bank-interest')?.value.toFixed()).toBe('4000');
    expect(result.lines.some(line => line.form === 'OH-IT-NRC')).toBe(false);
  });

  it('credits all bank interest away from Ohio for a full-year nonresident', () => {
    const saved: Packet = JSON.parse(JSON.stringify(bankFixture('nonresident')));
    const result = calculateOhio2026ReturnDraftFromSources({ taxInput: saved.input, sources: saved.sources });
    expect(result).toEqual(run(saved));
    expect(result).toMatchObject({
      ruleVersion: bankMethods.nonresident, calculationStatus: 'incomplete',
      reviewStatus: 'independent-review-pending', filingQualified: false,
    });
    expect(result.federalAgi.toFixed()).toBe('54000');
    expect(result.ohioAgi.toFixed()).toBe('54000');
    expect(result.taxBeforeCredits.toFixed()).toBe('1042');
    // The $44,000 outside Ohio is $40,000 of wages plus the full $4,000 bank interest.
    expect(result.nonresidentRatio.toFixed(4)).toBe('0.8148');
    expect(result.nonresidentCredit.toFixed()).toBe('849');
    expect(result.incomeTax.toFixed()).toBe('193');
    expect(result.refund.toFixed()).toBe('807');
    expect(result.lines.find(line => line.form === 'OH-IT-NRC' && line.line === '1')?.value.toFixed()).toBe('10000');
    expect(result.lines.find(line => line.form === 'OH-IT-NRC' && line.line === '18')?.value.toFixed()).toBe('44000');
    expect(result.lines.some(line => line.form === 'OH-IT-NRC' && /^1[0-5]$/.test(line.line))).toBe(false);
    expect(result.lines.find(line => line.line === 'ohio-bank-interest')?.value.toFixed()).toBe('0');
  });

  it('reconciles multiple current W-2 originals for one full-year resident', () => {
    const p = bankFixture('full_year_resident');
    const joint = ohio2026OrdinaryFixture('full_year_resident', '50000', '50000', true);
    const second = required(joint.input.w2s[1]);
    const secondStateLocal = required(second.stateLocalSources);
    const { firstName, lastName, ssn } = p.input.taxpayer.primary;
    second.accountHolder = 'primary';
    secondStateLocal.originalW2.accountHolder = 'primary';
    secondStateLocal.owner = { accountHolder: 'primary', originalTaxpayer: { firstName, lastName, ssn } };
    p.input.w2s.push(second);
    p.sources.employmentOriginals.push({ ...required(joint.sources.employmentOriginals[1]), accountHolder: 'primary' });
    const wageAllocation = required(required(p.residency.owners[0]).amounts).wages;
    wageAllocation.federalAmount = '100000';
    wageAllocation.residentAmount = '100000';
    rebindOhio2026Ordinary(p);
    const result = calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
    expect(result.ohioAgi.toFixed()).toBe('104000');
    expect(result.withholding.toFixed()).toBe('2500');
    // $332 + ($104,000 - $1,900 - $26,050) * .0275 rounds to $2,423.
    expect(result.incomeTax.toFixed()).toBe('2423');
    expect(result.refund.toFixed()).toBe('77');
  });

  it.each([
    ['full_year_resident', bankMethods.part_year_resident],
    ['part_year_resident', bankMethods.nonresident],
    ['nonresident', bankMethods.full_year_resident],
  ] as const)('holds mismatched bank method and primary domicile (%s)', (status, methodId) => {
    const p = bankFixture(status);
    p.sources.methodId = methodId;
    expect(() => run(p)).toThrow(/bank interest method and confirmed primary domicile differ/i);
    expect(() => calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources }))
      .toThrow(/bank interest method and confirmed primary domicile differ/i);
  });

  it.each([
    'full_year_resident', 'nonresident',
  ] as const)('holds unknown or contradictory evidence across the added residency methods (%s)', status => {
    const dispatch = ({ input, sources }: Packet) => calculateOhio2026ReturnDraftFromSources({ taxInput: input, sources });
    const missingDate = bankFixture(status);
    Reflect.deleteProperty(missingDate.credits[0], 'creditedOn');
    expect(() => dispatch(missingDate)).toThrow(/complete confirmed current source packets/i);
    const availability = bankFixture(status);
    availability.credits[0].availableOnCreditDateConfirmed = false;
    expect(() => dispatch(availability)).toThrow(/complete confirmed current source packets/i);
    const missingCredit = bankFixture(status);
    missingCredit.credits.pop();
    expect(() => dispatch(missingCredit)).toThrow(/credits do not reconcile to Box 1/i);
    const allocation = bankFixture(status);
    allocation.allocation.residentAmount = status === 'nonresident' ? '1000' : '0';
    expect(() => dispatch(allocation)).toThrow(/source categories and service allocation differ/i);
    const missingAllocation = bankFixture(status);
    Reflect.deleteProperty(missingAllocation.allocation, 'nonresidentOhioAmount');
    expect(() => dispatch(missingAllocation)).toThrow(/complete confirmed current source packets/i);
    const overlappingTimeline = bankFixture(status);
    const owner = required(overlappingTimeline.residency.owners[0]);
    owner.periods.push({ ...required(owner.periods[0]) });
    expect(() => dispatch(overlappingTimeline)).toThrow(/domicile periods must uniquely cover/i);
    const unknownDomicile = bankFixture(status);
    const period = required(required(unknownDomicile.residency.owners[0]).periods[0]);
    period.to = '2026-12-30';
    unknownDomicile.credits[1].creditedOn = '2026-12-31';
    expect(() => dispatch(unknownDomicile)).toThrow(/bank credit date must be covered by confirmed domicile/i);
    const stale = bankFixture(status);
    stale.form.interestIncome = '4000.01';
    expect(() => dispatch(stale)).toThrow(/original source snapshot is missing or changed/i);
  });

  // Spec: state/oh-2026-return-draft.yaml#part-year-bank-interest-source-holds.
  it('holds normalized return defaults without recorded amounts on the original', () => {
    const p = bankFixture();
    for (const field of bankZeroBoxes) {
      if (field !== 'privateActivityBondInterest') Reflect.deleteProperty(p.form, field);
    }
    p.input.form1099Int = [Form1099IntSchema.parse(p.form)];
    Reflect.deleteProperty(p.original, 'otherBoxAmounts');
    rebindOhio2026Ordinary(p);
    expect(() => run(p)).toThrow(/complete confirmed current source packets/i);
  });

  it('holds a zero return amount contradicted by a recorded original box', () => {
    const p = bankFixture();
    p.original.otherBoxAmounts.federalWithheld = '0.01';
    rebindOhio2026Ordinary(p);
    expect(() => run(p)).toThrow(/other interest or withholding/i);
  });

  it.each(bankZeroBoxes)('holds a missing documented zero in %s', key => {
    const p = bankFixture();
    Reflect.deleteProperty(p.form, key);
    rebindOhio2026Ordinary(p);
    expect(() => run(p)).toThrow(/unknown original boxes/i);
  });

  it.each(['full_year_resident', 'nonresident'] as const)('holds an unrecorded state withholding box for %s', status => {
    const p = bankFixture(status);
    Reflect.deleteProperty(p.form, 'stateWithheld');
    rebindOhio2026Ordinary(p);
    expect(() => calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources }))
      .toThrow(/unknown original boxes/i);
  });

  it('accepts recorded zero for documented blank boxes without PA-only metadata', () => {
    const p = bankFixture();
    for (const key of bankZeroBoxes) p.form[key] = '0.00';
    Reflect.deleteProperty(p.form, 'paDirectObligationInterest');
    rebindOhio2026Ordinary(p);
    const result = run(p);
    expect(result.incomeTax.toFixed()).toBe('598');
    expect(result.filingQualified).toBe(false);
  });

  it.each<[string, (packet: Packet) => void, RegExp]>([
    ['missing statement', p => { p.input.form1099Int = []; }, /one current original Form 1099-INT/i],
    ['duplicate statement', p => { p.input.form1099Int.push({ ...p.form }); }, /one current original Form 1099-INT/i],
    ['zero Box 1', p => { p.form.interestIncome = '0'; }, /positive Box 1/i],
    ['unknown Box 1', p => { Reflect.deleteProperty(p.form, 'interestIncome'); }, /original Form 1099-INT/i],
    ['unknown original boxes', p => { p.original.allOriginalBoxesKnownConfirmed = false; }, /complete confirmed current source packets/i],
    ['corrected original', p => { p.original.currentUncorrectedNonvoidOriginalConfirmed = false; }, /complete confirmed current source packets/i],
    ['wrong proof year', p => { p.original.sourceTaxYear = 2025; }, /complete confirmed current source packets/i],
    ['wrong statement year', p => { p.form.taxYear = 2025; }, /current original Form 1099-INT/i],
    ['statement for spouse', p => { p.form.accountHolder = 'spouse'; }, /current original Form 1099-INT/i],
    ['different recipient', p => { p.original.recipient.lastName = 'Fictional mismatch'; }, /recipient, bank or account differs/i],
    ['different payer TIN', p => { p.form.payerTin = '55-5555513'; }, /recipient, bank or account differs/i],
    ['different bank', p => { p.form.payer = 'Other Bank'; }, /recipient, bank or account differs/i],
    ['different account', p => { p.form.accountReference = 'PRIVATE-DEPOSIT-002'; }, /recipient, bank or account differs/i],
    ['masked account', p => { p.form.accountReference = p.original.accountReference = 'acct-****1234'; }, /stable account reference/i],
    ['different credited account', p => { p.credits[1].accountReference = 'PRIVATE-DEPOSIT-002'; }, /credit account differs/i],
    ['duplicate bank credit', p => { p.credits[1].sourceReference = p.credits[0].sourceReference.toLowerCase(); }, /distinct original bank credit/i],
    ['credit reusing original reference', p => { p.credits[1].sourceReference = p.original.sourceReference; }, /distinct original bank credit/i],
    ['zero credit', p => { p.credits[0].amount = '0'; p.credits[1].amount = '4000'; }, /positive actual bank credits/i],
    ['unknown credit amount', p => { Reflect.deleteProperty(p.credits[0], 'amount'); }, /complete confirmed current source packets/i],
    ['unknown access to credited income', p => { p.credits[0].availableOnCreditDateConfirmed = false; }, /complete confirmed current source packets/i],
    ['impossible credit date', p => { p.credits[1].creditedOn = '2026-06-31'; }, /valid actual source date/i],
    ['outside year', p => { p.credits[0].creditedOn = '2025-12-31'; }, /actual bank credit must be in current calendar 2026/i],
    ['unreconciled credit total', p => { p.credits[1].amount = '999.99'; }, /credits do not reconcile to Box 1/i],
    ['resident portion includes outside interest', p => { p.allocation.residentAmount = '4000'; }, /source categories and service allocation differ/i],
    ['nonresident portion claimed as Ohio sourced', p => { p.allocation.nonresidentOhioAmount = '3000'; }, /source categories and service allocation differ/i],
    ['corrected resident date requires a new allocation', p => { p.credits[1].creditedOn = '2026-06-30'; }, /source categories and service allocation differ/i],
    ['inconsistent ordinary residency', p => { p.input.taxpayer.stateResidency = 'full-year'; }, /declared Ohio residency conflicts/i],
    ['Treasury income in another box', p => { p.form.usSavingsBondInterest = '1'; }, /other interest or withholding/i],
    ['state withholding in another box', p => { p.form.stateWithheld = '1'; }, /other interest or withholding/i],
    ['orphan unemployment receipt', p => {
      p.residency.unemploymentPaymentSource = {
        originalSourceId: 'PRIVATE-OTHER-ORIGINAL', allPaymentsIncludedConfirmed: true,
        paidOrAccruedOn: '2026-08-01', amount: '100', sourceReference: 'PRIVATE-OTHER-RECEIPT',
      };
    }, /retained unemployment receipts/i],
  ])('holds incomplete contradictory or unsupported bank evidence (%s)', (_kind, modify, reason) => {
    const p = bankFixture();
    modify(p);
    rebindOhio2026Ordinary(p);
    expect(() => run(p)).toThrow(reason);
  });

  it('dispatches complete reopened bank evidence through the private Ohio entry', () => {
    const saved: Packet = JSON.parse(JSON.stringify(bankFixture()));
    const result = calculateOhio2026ReturnDraftFromSources({ taxInput: saved.input, sources: saved.sources });
    expect(result).toEqual(run(saved));
    expect(result.incomeTax.toFixed()).toBe('598');
    expect(result.refund.toFixed()).toBe('402');
    expect(result.filingQualified).toBe(false);
  });

  it('holds incomplete bank evidence through the private Ohio entry', () => {
    const p = bankFixture();
    p.input.form1099Int = [];
    rebindOhio2026Ordinary(p);
    expect(() => calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources })).toThrow(/one current original Form 1099-INT/i);
  });

  it('keeps bank originals out of the wage-only method', () => {
    const ordinary = ohio2026OrdinaryFixture('part_year_resident', '50000', '30000');
    expect(calculateOhio2026ReturnDraftFromSources({ taxInput: ordinary.input, sources: ordinary.sources }).refund.toFixed()).toBe('441');
    const p = bankFixture();
    expect(() => calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: { ...ordinary.sources, originalFederalSources: p.sources.originalFederalSources } })).toThrow(/retained other originals/i);
  });
});
