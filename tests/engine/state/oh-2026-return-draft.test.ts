// Spec: spec/state/oh-2026-return-draft.yaml. Independent literal statutory oracles.
import { describe, expect, it } from 'vitest';
import { calculateOhio2026ReturnDraftFromSources } from '@/engine/state/oh-engine.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { OHIO_TAX_CONSTANTS, TAX_CONSTANTS } from '@/models/constants.js';
import { calculateOhio2026OrdinarySource } from '@/engine/state/oh-2026-ordinary-source.js';
import { calculateOhio2026ReturnDraft } from '@/engine/state/oh-2026-return-draft.js';
import { ohio2026OrdinaryFixture, rebindOhio2026Ordinary } from '../../fixtures/oh-2026-ordinary-return.js';

type Packet = ReturnType<typeof ohio2026OrdinaryFixture>;
const run = (p: Packet) => calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });

function current<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Complete current fixture required');
  return value;
}
const w2 = (p: Packet, index = 0) => current(p.input.w2s[index]);
const residency = (p: Packet) => current(p.input.ohioResidency);
const owner = (p: Packet) => current(residency(p).owners[0]);
const period = (p: Packet) => current(owner(p).periods[0]);
const amounts = (p: Packet) => current(owner(p).amounts);
const employment = (p: Packet) => current(p.sources.employmentOriginals[0]);
const service = (p: Packet) => current(employment(p).serviceRows[0]);
const payments = (p: Packet) => current(p.input.ohioPayments);

describe('Ohio2026 current ordinary source-to-return draft', () => {
  it('derives current ordinary wage AGI without a fabricated federal return', () => {
    const p = ohio2026OrdinaryFixture();
    const before = JSON.stringify(p);
    const result = run(p);
    expect(result.federalAgi.toFixed()).toBe('50000');
    expect(result.ohioAgi.toFixed()).toBe('50000');
    expect(result.exemptions.toFixed()).toBe('2150');
    expect(result.taxBeforeCredits.toFixed()).toBe('932');
    expect(result.withholding.toFixed()).toBe('1000');
    expect(result.refund.toFixed()).toBe('68');
    expect(JSON.stringify(p)).toBe(before);
  });

  it.each([
    ['full_year_resident', '50000', '0.0000', '0', '932', '68'],
    ['part_year_resident', '30000', '0.4000', '373', '559', '441'],
    ['nonresident', '10000', '0.8000', '746', '186', '814'],
  ] as const)('integrates enacted tax and explicit exemptions across all three residencies: %s', (status, ohio, ratio, nrc, net, refund) => {
    const result = run(ohio2026OrdinaryFixture(status, '50000', ohio));
    expect(result.taxBeforeCredits.toFixed()).toBe('932');
    expect(result.nonresidentRatio.toFixed(4)).toBe(ratio);
    expect(result.nonresidentCredit.toFixed()).toBe(nrc);
    expect(result.incomeTax.toFixed()).toBe(net);
    expect(result.refund.toFixed()).toBe(refund);
    expect(result.underpaymentPenalty.toFixed()).toBe('0');
    expect(result.latePaymentInterest.toFixed()).toBe('0');
  });

  it('retains credit order caps and strict personal-credit boundary', () => {
    for (const [wages, personal, tax] of [['32399', '20', '421'], ['32400', '0', '441']]) {
      const r = run(ohio2026OrdinaryFixture('full_year_resident', wages, wages));
      expect(r.personalExemptionCredit.toFixed()).toBe(personal);
      expect(r.incomeTax.toFixed()).toBe(tax);
    }
    const joint = run(ohio2026OrdinaryFixture('full_year_resident', '50000', '50000', true));
    expect(joint.federalAgi.toFixed()).toBe('100000');
    expect(joint.exemptions.toFixed()).toBe('3800');
    expect(joint.taxBeforeCredits.toFixed()).toBe('2261');
    expect(joint.jointFilingCredit.toFixed()).toBe('113');
    expect(joint.earnedIncomeCredit.toFixed()).toBe('0');
    expect(joint.incomeTax.toFixed()).toBe('2148');
    expect(joint.refund.toFixed()).toBe('352');
  });

  it('uses actual services amounts rather than residency day counts', () => {
    const r = run(ohio2026OrdinaryFixture('nonresident', '50000', '16666'));
    expect(r.nonresidentRatio.toFixed(4)).toBe('0.6666');
    expect(r.nonresidentCredit.toFixed()).toBe('621');
    expect(r.incomeTax.toFixed()).toBe('311');
  });

  it.each([
    ['28450', '2400', '0', '0', '0', '1000'],
    ['28451', '2400', '332', '20', '312', '688'],
    ['40000', '2400', '650', '0', '650', '350'],
    ['40001', '2150', '657', '0', '657', '343'],
  ])('uses enacted zero-tax and actual exemption boundaries at wages %s', (wages, exemptions, before, personal, net, refund) => {
    const result = run(ohio2026OrdinaryFixture('full_year_resident', wages, wages));
    expect(result.exemptions.toFixed()).toBe(exemptions);
    expect(result.taxBeforeCredits.toFixed()).toBe(before);
    expect(result.personalExemptionCredit.toFixed()).toBe(personal);
    expect(result.incomeTax.toFixed()).toBe(net);
    expect(result.refund.toFixed()).toBe(refund);
  });

  it('rejects forged or stale source contexts instead of caller tax projections', () => {
    const p = ohio2026OrdinaryFixture();
    const context = calculateOhio2026OrdinarySource(p.input, p.sources);
    expect(() => calculateOhio2026ReturnDraft(p.input, p.sources, { ...context })).toThrow(/forged/);
    service(p).sourceReference += '-different-original';
    expect(() => calculateOhio2026ReturnDraft(p.input, p.sources, context)).toThrow(/stale/);
    const result = run(p);
    expect(result.sourceCommitment).not.toBe(context.sourceCommitment);
    expect(result.incomeTax.toFixed()).toBe('932');
  });

  it('settles only complete current withholding-covered returns', () => {
    const p = ohio2026OrdinaryFixture();
    const r = run(p);
    expect(r.amountDue.toFixed()).toBe('0');
    const w = p.input.w2s[0];
    if (!w?.stateLocalSources?.stateRows[0]) throw new Error('Current source fixture required');
    w.stateTaxWithheld = '100';
    w.stateLocalSources.stateRows[0].withheld = '100';
    const { stateLocalSources: _source, ...original } = w;
    w.stateLocalSources.originalW2 = structuredClone(original);
    rebindOhio2026Ordinary(p);
    expect(() => run(p)).toThrow(/withholding coverage/);
  });

  it('keeps filing and historical gates intact', () => {
    const p = ohio2026OrdinaryFixture();
    const r = run(p);
    expect(r).toMatchObject({ taxYear: 2026, calculationStatus: 'incomplete', filingQualified: false, reviewStatus: 'independent-review-pending' });
    expect(TAX_CONSTANTS[2026]).toBeUndefined();
    expect(OHIO_TAX_CONSTANTS[2026]).toBeUndefined();
    expect(() => calculateFederalTax(p.input)).toThrow(/incomplete; calculation is unavailable/);
    const audit = JSON.stringify(r.lines);
    for (const secret of [p.input.taxpayer.primary.ssn, p.input.taxpayer.primary.firstName, p.input.taxpayer.address.street, p.sources.sourceReference]) expect(audit).not.toContain(secret);
  });

  it('binds exact current source provenance even when money is unchanged', () => {
    const p = ohio2026OrdinaryFixture();
    const first = run(p);
    p.sources.sourceReference += '-new-original-reference';
    const next = run(p);
    expect(next.sourceCommitment).not.toBe(first.sourceCommitment);
    expect(next.incomeTax.eq(first.incomeTax)).toBe(true);
    w2(p).employer.name = 'Changed source employer';
    expect(() => run(p)).toThrow();
  });

  const negatives: Array<[string, (p: Packet) => void]> = [
    ['wrong actual year', p => { p.input.taxpayer.taxYear = 2025; }],
    ['unknown complete inventory', p => { Reflect.deleteProperty(p.sources, 'allIncomeAndAdjustmentOriginalsIncludedConfirmed'); }],
    ['unknown actual zero credit', p => { Reflect.deleteProperty(p.sources, 'noOtherOhioCreditSourcesConfirmed'); }],
    ['qualifying EITC child unknown', p => { Reflect.deleteProperty(p.sources, 'noQualifyingEitcChildrenConfirmed'); }],
    ['retained zero adjustment original', p => { p.input.adjustments = { iraDeduction: '0' }; rebindOhio2026Ordinary(p); }],
    ['retained zero Social Security original', p => { p.input.formSSA1099 = [{ recipient: 'Private other original', netBenefits: '0', federalWithheld: '0' }]; rebindOhio2026Ordinary(p); }],
    ['retained netzero sources', p => { p.input.form1099Misc = [{ payer: 'A', otherIncome: '100' }, { payer: 'B', otherIncome: '-100' }]; rebindOhio2026Ordinary(p); }],
    ['missing exact original snapshot', p => { p.sources.originalFederalSources = {}; }],
    ['unknown eligible exemption', p => { Reflect.deleteProperty(p.input.standardDeductionFacts ?? {}, 'primaryCanBeClaimedAsDependent'); rebindOhio2026Ordinary(p); }],
    ['claimed dependent elsewhere', p => { if (p.input.standardDeductionFacts) p.input.standardDeductionFacts.primaryCanBeClaimedAsDependent = true; rebindOhio2026Ordinary(p); }],
    ['owner original changed', p => { p.input.taxpayer.primary.ssn = '900-70-0999'; rebindOhio2026Ordinary(p); }],
    ['unknown owner dates', p => { period(p).to = '2026-12-30'; }],
    ['unknown category zero', p => { Reflect.deleteProperty(owner(p).amounts ?? {}, 'pensions'); }],
    ['unreconciled actual Ohio wages', p => { amounts(p).wages.residentAmount = '49999'; }],
    ['different employer source', p => { employment(p).employerTin = '90-7000999'; }],
    ['duplicate payroll original', p => { const rows = employment(p).serviceRows; rows.push(structuredClone(current(rows[0]))); }],
    ['missing all service periods', p => { service(p).to = '2026-12-30'; }],
    ['unknown valid payroll date', p => { service(p).paymentDate = '2026-02-30'; }],
    ['school liability requires separate method', p => { residency(p).schoolDistrictStatus = 'actual_district_sources_required'; }],
    ['unknown other-state resident credit', p => { Reflect.deleteProperty(p.sources, 'noOtherStateTaxOnOhioResidentIncomeConfirmed'); }],
    ['actual school/local withholding', p => { const w = w2(p); w.localTaxWithheld = '1'; rebindOhio2026Ordinary(p); }],
    ['unknown remaining tax coverage', p => { payments(p).remainingTaxPayment = { status: 'expected_payment', date: '2027-04-15', amountAppliedToTax: '1', sourceReference: 'Actual pending payment', sourceFactsConfirmed: true }; }],
    ['unknown cash zero', p => { Reflect.deleteProperty(payments(p).balanceFacts, 'useTax'); }],
    ['actual nonzero use tax', p => { payments(p).balanceFacts.useTax = '1'; }],
    ['late expected filing', p => { payments(p).currentTiming = { kind: 'expected', expectedDate: '2027-04-16', asOfDate: '2027-03-01' }; }],
    ['missing source year', p => { Reflect.deleteProperty(p.input.w2s[0] ?? {}, 'taxYear'); rebindOhio2026Ordinary(p); }],
  ];
  it.each(negatives)('rejects unknown changed or unsupported actual original sources: %s', (_name, mutate) => {
    const p = ohio2026OrdinaryFixture();
    mutate(p);
    const before = JSON.stringify(p);
    expect(() => run(p)).toThrow();
    expect(JSON.stringify(p)).toBe(before);
  });
  it('rejects low income without inventing a zero federal credit', () => {
    expect(() => run(ohio2026OrdinaryFixture('full_year_resident', '19539', '19539'))).toThrow(/EITC/);
  });
  it('rejects an unknown service state even when resident tax totals agree', () => {
    const p = ohio2026OrdinaryFixture();
    service(p).serviceState = 'XX';
    expect(() => run(p)).toThrow(/source/);
  });
  it('rejects an unknown domicile instead of classifying it as outside Ohio', () => {
    const p = ohio2026OrdinaryFixture('nonresident', '50000', '10000');
    period(p).domicileState = 'XX';
    expect(() => run(p)).toThrow(/domicile|source/);
  });
  it('rejects counting the same actual person as both joint owners', () => {
    const p = ohio2026OrdinaryFixture('full_year_resident', '50000', '50000', true);
    current(p.input.taxpayer.spouse).ssn = p.input.taxpayer.primary.ssn;
    current(current(w2(p, 1).stateLocalSources).owner.originalTaxpayer).ssn = p.input.taxpayer.primary.ssn;
    rebindOhio2026Ordinary(p);
    expect(() => run(p)).toThrow(/distinct|owner/);
  });
  it('rejects reciprocal compensation without losing its deduction', () => {
    const p = ohio2026OrdinaryFixture('nonresident', '50000', '50000');
    period(p).domicileState = 'PA';
    expect(() => run(p)).toThrow(/reciprocal/);
  });
});
