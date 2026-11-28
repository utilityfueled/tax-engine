// Spec: spec/state/oh-2026-return-draft.yaml. Independent literal statutory oracles.
import { describe, expect, it } from 'vitest';
import { calculateOhio2026ReturnDraftFromSources } from '@/engine/state/oh-engine.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { OHIO_TAX_CONSTANTS, TAX_CONSTANTS } from '@/models/constants.js';
import { calculateOhio2026OrdinarySource } from '@/engine/state/oh-2026-ordinary-source.js';
import { calculateOhio2026ReturnDraft } from '@/engine/state/oh-2026-return-draft.js';
import { Form1099GSchema, TaxYearInputSchema } from '@/models/inputs.js';
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
function withSeniorHistory(p: Packet, joint = false) {
  p.input.taxpayer.primary.dateOfBirth = '1961-12-31';
  if (joint) current(p.input.taxpayer.spouse).dateOfBirth = '1957-06-01';
  const ownerHistory = (accountHolder: 'primary' | 'spouse', dateOfBirth: string) => ({
    accountHolder, dateOfBirth, sourceReference: `PRIVATE-OH-SENIOR-HISTORY-${accountHolder}`,
    completeOhioCreditHistoryConfirmed: true, noPriorSeniorLumpSumElectionConfirmed: true,
    noRetirementCreditCarryforwardConfirmed: true,
  });
  const history = [ownerHistory('primary', p.input.taxpayer.primary.dateOfBirth)];
  if (joint) history.push(ownerHistory('spouse', current(p.input.taxpayer.spouse).dateOfBirth));
  const sources = { ...p.sources, seniorCreditHistory: history };
  const packet = { input: p.input, sources };
  rebindOhio2026Ordinary(packet);
  return packet;
}

describe('Ohio2026 current ordinary source-to-return draft', () => {
  it.each([
    ['full_year_resident', 'full-year', 'nonresident', '50000', '932'],
    ['part_year_resident', 'part-year', 'full-year', '30000', '559'],
    ['nonresident', 'nonresident', 'part-year', '10000', '186'],
  ] as const)('reconciles the primary declaration against the ordinary Ohio draft for %s', (status, matching, conflicting, ohioWages, tax) => {
    const p = ohio2026OrdinaryFixture(status, '50000', ohioWages);
    expect(run(p)).toMatchObject({ calculationStatus: 'incomplete', reviewStatus: 'independent-review-pending', filingQualified: false });
    expect(run(p).incomeTax.toFixed()).toBe(tax);
    p.input.taxpayer.stateResidency = matching;
    rebindOhio2026Ordinary(p);
    expect(run(p).incomeTax.toFixed()).toBe(tax);
    p.input.taxpayer.stateResidency = conflicting;
    rebindOhio2026Ordinary(p);
    expect(() => run(p)).toThrow(/declared Ohio residency conflicts with the primary taxpayer's confirmed domicile records/i);
  });

  it('permits a separate spouse domicile on the ordinary Ohio joint draft', () => {
    const p = ohio2026OrdinaryFixture('full_year_resident', '50000', '50000', true);
    const spouse = current(residency(p).owners.find(record => record.accountHolder === 'spouse'));
    const spouseEmployment = current(p.sources.employmentOriginals.find(record => record.accountHolder === 'spouse'));
    spouse.status = 'nonresident';
    spouse.periods = [{ from: '2026-01-01', to: '2026-12-31', domicileState: 'VA' }];
    current(spouse.amounts).wages.residentAmount = '0';
    current(spouseEmployment.serviceRows[0]).serviceState = 'VA';
    residency(p).owners.reverse();
    p.input.taxpayer.stateResidency = 'full-year';
    rebindOhio2026Ordinary(p);
    const result = run(p);
    expect(result.nonresidentRatio.toFixed(4)).toBe('0.5000');
    const nrcRows = result.lines.filter(line => line.form === 'OH-IT-NRC');
    expect(nrcRows.map(line => line.line)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '16', '17', '18', '19', '20']);
    expect(nrcRows.find(line => line.line === '1')?.value.toFixed()).toBe('50000');
    p.input.taxpayer.stateResidency = 'nonresident';
    rebindOhio2026Ordinary(p);
    expect(() => run(p)).toThrow(/declared Ohio residency conflicts/i);
  });

  it('omits IT NRC Part B for two full-year nonresident joint owners', () => {
    const result = run(ohio2026OrdinaryFixture('nonresident', '50000', '10000', true));
    expect(result.nonresidentRatio.toFixed(4)).toBe('0.8000');
    expect(result.lines.filter(line => line.form === 'OH-IT-NRC').map(line => line.line))
      .toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '16', '17', '18', '19', '20']);
  });

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
    const nrcLines = result.lines.filter(line => line.form === 'OH-IT-NRC').map(line => line.line);
    if (status === 'full_year_resident') expect(nrcLines).toEqual([]);
    if (status === 'nonresident') expect(nrcLines).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '16', '17', '18', '19', '20']);
    if (status === 'part_year_resident') expect(nrcLines).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']);
  });

  it.each([
    ['full_year_resident', '50000', '0', '882', '118'],
    ['part_year_resident', '30000', '353', '529', '471'],
    ['nonresident', '10000', '706', '176', '824'],
  ] as const)('applies the Ohio senior credit before residency relief for %s', (status, ohio, nrc, net, refund) => {
    const packet = withSeniorHistory(ohio2026OrdinaryFixture(status, '50000', ohio));
    const result = run(packet);
    expect(result.seniorCitizenCredit?.toFixed()).toBe('50');
    expect(result.nonresidentCredit.toFixed()).toBe(nrc);
    expect(result.incomeTax.toFixed()).toBe(net);
    expect(result.refund.toFixed()).toBe(refund);
    expect(result.filingQualified).toBe(false);
  });

  it('uses one senior credit, available tax and the strict Ohio income limit', () => {
    const joint = run(withSeniorHistory(ohio2026OrdinaryFixture('full_year_resident', '21000', '21000', true), true));
    expect(joint.seniorCitizenCredit?.toFixed()).toBe('50');
    expect(joint.taxBeforeCredits.toFixed()).toBe('652');
    expect(joint.jointFilingCredit.toFixed()).toBe('90');
    expect(joint.incomeTax.toFixed()).toBe('512');
    const spouseOnly = withSeniorHistory(ohio2026OrdinaryFixture('full_year_resident', '21000', '21000', true), true);
    spouseOnly.input.taxpayer.primary.dateOfBirth = '1962-01-02';
    current(spouseOnly.sources.seniorCreditHistory[0]).dateOfBirth = '1962-01-02';
    rebindOhio2026Ordinary(spouseOnly);
    expect(run(spouseOnly).seniorCitizenCredit?.toFixed()).toBe('50');
    const zero = run(withSeniorHistory(ohio2026OrdinaryFixture('full_year_resident', '28450')));
    expect(zero.seniorCitizenCredit?.toFixed()).toBe('0');
    const personal = run(withSeniorHistory(ohio2026OrdinaryFixture('full_year_resident', '28451')));
    expect(personal.personalExemptionCredit.toFixed()).toBe('20');
    expect(personal.incomeTax.toFixed()).toBe('262');
    const below = run(withSeniorHistory(ohio2026OrdinaryFixture('nonresident', '101899', '20000')));
    const at = run(withSeniorHistory(ohio2026OrdinaryFixture('nonresident', '101900', '20000')));
    expect(below.seniorCitizenCredit?.toFixed()).toBe('50');
    expect(at.seniorCitizenCredit?.toFixed()).toBe('0');
    expect(run(ohio2026OrdinaryFixture()).seniorCitizenCredit).toBeUndefined();
  });

  it('requires complete owner-bound Ohio senior credit history', () => {
    const make = () => withSeniorHistory(ohio2026OrdinaryFixture('full_year_resident', '21000', '21000', true), true);
    const missing = make();
    Reflect.deleteProperty(missing.sources, 'seniorCreditHistory');
    expect(() => run(missing)).toThrow(/credit history/i);
    const spouseMissing = make();
    spouseMissing.sources.seniorCreditHistory.pop();
    expect(() => run(spouseMissing)).toThrow(/credit history/i);
    const mismatched = make();
    current(mismatched.sources.seniorCreditHistory[0]).dateOfBirth = '1961-12-30';
    expect(() => run(mismatched)).toThrow(/credit history/i);
    const duplicate = make();
    current(duplicate.sources.seniorCreditHistory[1]).accountHolder = 'primary';
    expect(() => run(duplicate)).toThrow(/credit history/i);
    const jointRecord = make();
    for (const row of jointRecord.sources.seniorCreditHistory) row.sourceReference = 'PRIVATE-JOINT-CREDIT-HISTORY';
    expect(run(jointRecord).seniorCitizenCredit?.toFixed()).toBe('50');
    const election = make();
    current(election.sources.seniorCreditHistory[0]).noPriorSeniorLumpSumElectionConfirmed = false;
    expect(() => run(election)).toThrow();
    const carry = make();
    current(carry.sources.seniorCreditHistory[1]).noRetirementCreditCarryforwardConfirmed = false;
    expect(() => run(carry)).toThrow();
    const boundary = make();
    boundary.input.taxpayer.primary.dateOfBirth = '1962-01-01';
    current(boundary.sources.seniorCreditHistory[0]).dateOfBirth = '1962-01-01';
    rebindOhio2026Ordinary(boundary);
    expect(() => run(boundary)).toThrow(/age/i);
    const under65 = withSeniorHistory(ohio2026OrdinaryFixture());
    under65.input.taxpayer.primary.dateOfBirth = '1962-01-02';
    current(under65.sources.seniorCreditHistory[0]).dateOfBirth = '1962-01-02';
    rebindOhio2026Ordinary(under65);
    expect(() => run(under65)).toThrow(/eligible owner/i);
    const before = make();
    const context = calculateOhio2026OrdinarySource(before.input, before.sources);
    current(before.sources.seniorCreditHistory[0]).sourceReference += '-different';
    expect(() => calculateOhio2026ReturnDraft(before.input, before.sources, context)).toThrow(/stale/);
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
    expect(joint.nonresidentCredit.toFixed()).toBe('0');
    expect(joint.lines.some(line => line.form === 'OH-IT-NRC')).toBe(false);
  });

  it('uses actual services amounts rather than residency day counts', () => {
    const r = run(ohio2026OrdinaryFixture('nonresident', '50000', '16666'));
    expect(r.nonresidentRatio.toFixed(4)).toBe('0.6666');
    expect(r.nonresidentCredit.toFixed()).toBe('621');
    expect(r.incomeTax.toFixed()).toBe('311');
  });

  it.each([
    ['full_year_resident', '50000', '68'],
    ['part_year_resident', '30000', '441'],
    ['nonresident', '10000', '814'],
  ] as const)('accepts the canonical federal input for %s without admitting a retained zero original', (status, wages, refund) => {
    const p = ohio2026OrdinaryFixture(status, '50000', wages);
    const parsed = TaxYearInputSchema.parse(p.input);
    expect(parsed.form1099G).toEqual([]);
    p.input = parsed;
    expect(() => run(p)).toThrow(/snapshot/);
    rebindOhio2026Ordinary(p);
    expect(run(p).refund.toFixed()).toBe(refund);
    p.input.form1099G = [Form1099GSchema.parse({ payer: 'Fictional original', unemploymentCompensation: '0' })];
    rebindOhio2026Ordinary(p);
    expect(() => run(p)).toThrow(/retained other originals/);
  });

  it('refuses a source key outside the canonical document allowlist even if empty', () => {
    const p = ohio2026OrdinaryFixture();
    Object.assign(p.input, { unrecognizedSourceCollection: [] });
    rebindOhio2026Ordinary(p);
    expect(() => run(p)).toThrow(/retained other originals/);
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

  it('keeps a timely filed withholding-only return available after the deadline', () => {
    const p = ohio2026OrdinaryFixture();
    payments(p).currentTiming = { kind: 'filed', filedDate: '2027-04-15', asOfDate: '2027-04-16' };
    const result = run(p);

    expect(result.refund.toFixed()).toBe('68');
    expect(result.latePaymentInterest.toFixed()).toBe('0');
    expect(result.filingQualified).toBe(false);
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
    ['unfiled expected date passed', p => { payments(p).currentTiming = { kind: 'expected', expectedDate: '2027-04-15', asOfDate: '2027-04-16' }; }],
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
    expect(() => TaxYearInputSchema.parse(p.input)).toThrow('This taxpayer identifier is already used for another person on this return.');
    expect(() => run(p)).toThrow('Ohio2026 ordinary actual sources: actual current2026 taxpayer and source year required');
  });
  it('rejects reciprocal compensation without losing its deduction', () => {
    const p = ohio2026OrdinaryFixture('nonresident', '50000', '50000');
    period(p).domicileState = 'PA';
    expect(() => run(p)).toThrow(/reciprocal/);
  });
});

it('routes reported combat pay to a separate method for each Ohio residency', () => {
  for (const [status, wages, refund] of [
    ['full_year_resident', '50000', '68'], ['part_year_resident', '30000', '441'], ['nonresident', '10000', '814'],
  ] as const) {
    const p = ohio2026OrdinaryFixture(status, '50000', wages);
    const w = w2(p), rows = current(w.stateLocalSources);
    for (const codeQ of ['0.00', '0.01']) {
      w.box12CodeQ = codeQ;
      const { stateLocalSources: _rows, ...original } = w;
      rows.originalW2 = structuredClone(original);
      rebindOhio2026Ordinary(p);
      if (codeQ === '0.00') expect(run(p).refund.toFixed()).toBe(refund);
      else expect(() => run(p)).toThrow(/separate.*method/i);
    }
  }
});
