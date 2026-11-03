/** Spec: state/oh-sd-100-sources.yaml. Literals pinned before all product outputs. */
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateW2StateLocalSources } from '@/engine/forms/w2-state-local.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { calculateOhioResidentReturn, type OhioResidentReturnInput } from '@/engine/state/oh-return.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { ohioPaymentFixture } from '../../fixtures/oh-payments.js';
import { schoolDistrictSourcesFixture, schoolDistrictEstimatedFixture, schoolDistrictZeroWithholdingFixture, schoolDistrictPriorReturn,
  schoolW2, schoolW2Packet, bindSchoolDistrictFixture, addSchoolMunicipalRow, schoolRaw,
  type SchoolDistrictFixtureInput } from '../../fixtures/oh-school-district-sources.js';

function canonical(input: SchoolDistrictFixtureInput, overlay: Parameters<typeof buildOhioResidentReturnInput>[2] = {}) {
  return calculateOhioResidentReturn(buildOhioResidentReturnInput(input, calculateFederalTax(input), overlay));
}
function requireSD(input: SchoolDistrictFixtureInput) {
  const result = canonical(input);
  if (!result.sd100) throw new Error('Current actual canonical packet did not produce SD100');
  return result;
}
function sdResult(input: SchoolDistrictFixtureInput) {
  const result = requireSD(input).sd100;
  if (!result) throw new Error('Actual school return missing');
  return result;
}
function firstCoverage(input: SchoolDistrictFixtureInput) {
  const row = input.ohioSchoolDistrict.w2Sources[0];
  if (!row) throw new Error('Actual fixture coverage missing');
  return row;
}
function firstLocal(input: SchoolDistrictFixtureInput) {
  const row = schoolW2Packet(input).localRows[0];
  if (!row) throw new Error('Actual fixture local row missing');
  return row;
}
/** Valid typed IT-only arithmetic context, derived from independently supplied current originals.
 * It is not a fabricated full Ohio result and does not replace canonical replay controls.
 */
function actualOhioContext(input: SchoolDistrictFixtureInput): OhioResidentReturnInput {
  return { taxYear: input.taxpayer.taxYear, filingStatus: input.taxpayer.filingStatus,
    federalAgi: calculateFederalTax(input).agi, exemptions: 1, ohioWithholding: '3000',
    computeUnderpaymentPenalty: true, estimatedPayments: '0', creditCarryforward: '0',
    useTax: '0', donations: '0', latePaymentInterest: '0',
  };
}
async function source(input: SchoolDistrictFixtureInput, result = calculateFederalTax(input)) {
  const { buildOhioSchoolDistrictSource } = await import('@/engine/state/oh-sd-100-sources.js');
  return buildOhioSchoolDistrictSource(input, result, actualOhioContext(input));
}
function ordinaryProperty(value: object, key: string, replacement: unknown) {
  Object.defineProperty(value, key, { value: replacement, enumerable: true, writable: true, configurable: true });
}
async function rejectSource(input: SchoolDistrictFixtureInput, message: RegExp) {
  const { buildOhioSchoolDistrictSource } = await import('@/engine/state/oh-sd-100-sources.js');
  const invoke = () => buildOhioSchoolDistrictSource(input, calculateFederalTax(input), actualOhioContext(input));
  expect(invoke).not.toThrow(TypeError);
  expect(invoke).toThrow(message);
}

describe('OH SD baseline', () => {
  it('OH SD baseline retains the existing actual no-district IT1040 method', () => {
    const input = ohioPaymentFixture();
    const result = calculateOhioResidentReturn(buildOhioResidentReturnInput(input, calculateFederalTax(input)));
    expect(result.it1040.line10_taxAfterCredits.toString()).toBe('2323');
    expect(result.sd100).toBeNull();
  });
  it('OH SD baseline validates explicit original rows before district calculation', () => {
    const input = schoolDistrictSourcesFixture();
    const before = structuredClone(input);
    const federal = calculateFederalTax(input);
    expect(federal.totalWages.toString()).toBe('80000');
    expect(federal.agi.toString()).toBe('80000');
    const rows = calculateW2StateLocalSources(input, 0, schoolW2Packet(input));
    expect(rows.stateRows.map(row => [row.state, row.withheld.toString()])).toEqual([['OH', '3000']]);
    expect(rows.localRows.map(row => row.withheld.toString())).toEqual(['1100']);
    expect(input.ohioResidency.schoolDistrictStatus).toBe('actual_district_sources_required');
    expect(input.ohioSchoolDistrict.payments.priorReturn.status).toBe('no_return');
    expect(input).toEqual(before);
  });
});

describe('OH SD canonical', () => {
  it('OH SD canonical preserves actual district sources in the canonical schema', () => {
    const input = schoolDistrictSourcesFixture();
    const parsed = TaxYearInputSchema.parse(input);
    expect(parsed).toHaveProperty('ohioSchoolDistrict');
    expect(Reflect.get(parsed, 'ohioSchoolDistrict')).toEqual(input.ohioSchoolDistrict);
  });
  it('OH SD canonical computes independently derived Hillsdale tax and refund', () => {
    const input = schoolDistrictSourcesFixture();
    const before = structuredClone(input);
    const result = requireSD(input);
    const sd = result.sd100;
    if (!sd) throw new Error('Actual SD result missing');
    expect(sd.line3_magi.toString()).toBe('80000');
    expect(sd.line6_traditionalTax.toString()).toBe('0');
    expect(sd.line7_earnedIncomeTax.toString()).toBe('1000');
    expect(sd.line8_totalTaxAfterCredits.toString()).toBe('1000');
    expect(sd.line9_underpaymentPenalty.toString()).toBe('0');
    expect(sd.line10_totalLiability.toString()).toBe('1000');
    expect(sd.line11_sdWithholding.toString()).toBe('1100');
    expect(sd.line12_estimatedPayments.toString()).toBe('0');
    expect(sd.line13_totalPayments.toString()).toBe('1100');
    expect(sd.line14_amendedPriorOverpayment.toString()).toBe('0');
    expect(sd.line15_netPayments.toString()).toBe('1100');
    expect(sd.line16_taxDue.toString()).toBe('0');
    expect(sd.line17_latePaymentInterest.toString()).toBe('0');
    expect(sd.line18_totalAmountDue.toString()).toBe('0');
    expect(sd.line19_overpayment.toString()).toBe('100');
    expect(sd.line20_creditCarryforward.toString()).toBe('0');
    expect(sd.line21_refund.toString()).toBe('100');
    expect(sd.districtDetails.map(d => [d.districtNumber, d.taxType, d.rate.toString(), d.residencyFactor.toFixed(4), d.taxBase.toString(), d.seniorCredit.toString()]))
      .toEqual([['0302', 'earned_income', '0.0125', '1.0000', '80000', '0']]);
    expect(result.it1040.line14_ohioWithholding.toString()).toBe('3000');
    expect(result.itsd2210?.line17_totalPenalty.toString()).toBe('0');
    expect(result.sdItsd2210?.line17_totalPenalty.toString()).toBe('0');
    expect(input).toEqual(before);
  });
  it('OH SD canonical uses four actual SD receipts on their actual quarter dates', () => {
    const input = schoolDistrictEstimatedFixture();
    const result = requireSD(input);
    expect(result.sd100?.line11_sdWithholding.toString()).toBe('600');
    expect(result.sd100?.line12_estimatedPayments.toString()).toBe('400');
    expect(result.sd100?.line15_netPayments.toString()).toBe('1000');
    expect(result.sd100?.line21_refund.toString()).toBe('0');
    expect(result.sd100?.line18_totalAmountDue.toString()).toBe('0');
    expect(result.sdItsd2210?.line17_totalPenalty.toString()).toBe('0');
    expect(input.ohioSchoolDistrict.payments.paymentRows.map(r => [r.date, r.amount])).toEqual([
      ['2025-04-15', '100'], ['2025-06-16', '100'], ['2025-09-15', '100'], ['2026-01-15', '100'],
    ]);
    const adapted = buildOhioResidentReturnInput(input, calculateFederalTax(input));
    expect(Reflect.get(adapted, 'sdEstimatedPaymentSchedule')?.map((r: { date: string; amount: { toString(): string } }) => [r.date, r.amount.toString()]))
      .toEqual([['2025-04-15', '100'], ['2025-06-16', '100'], ['2025-09-15', '100'], ['2026-01-15', '100']]);
  });
  it('OH SD canonical applies an explicit outgoing election without inventing received cash', () => {
    const input = schoolDistrictSourcesFixture();
    input.ohioSchoolDistrict.payments.refundDisposition.outgoingCarryforward = '25';
    const result = sdResult(input);
    expect(result.line19_overpayment.toString()).toBe('100');
    expect(result.line20_creditCarryforward.toString()).toBe('25');
    expect(result.line21_refund.toString()).toBe('75');
    expect(input.ohioSchoolDistrict.payments).not.toHaveProperty('refundReceived');
  });
  it.each([false, true])('OH SD canonical separates municipal cash in either actual local row order %s', (municipalFirst) => {
    const input = schoolDistrictSourcesFixture();
    addSchoolMunicipalRow(input, municipalFirst);
    const result = requireSD(input);
    expect(result.sd100?.line11_sdWithholding.toString()).toBe('1100');
    expect(result.sd100?.line21_refund.toString()).toBe('100');
    expect(result.it1040.line14_ohioWithholding.toString()).toBe('3000');
    expect(schoolW2Packet(input).localRows.map(r => r.withheld)).toEqual(municipalFirst ? ['50', '1100'] : ['1100', '50']);
  });
  it.each([false, true])('OH SD canonical distinguishes actual zero from explicitly absent local rows %s', noLocalRows => {
    const input = schoolDistrictZeroWithholdingFixture();
    if (noLocalRows) {
      schoolW2Packet(input).localReporting = 'none';
      schoolW2Packet(input).localRows = [];
      firstCoverage(input).localRows = [];
      Object.assign(schoolW2(input), { localTaxWithheld: '0', localWages: '0', localityName: '' });
      bindSchoolDistrictFixture(input);
    }
    const result = requireSD(input);
    expect(result.sd100?.line11_sdWithholding.toString()).toBe('0');
    expect(result.sd100?.line12_estimatedPayments.toString()).toBe('1000');
    expect(result.sd100?.line8_totalTaxAfterCredits.toString()).toBe('1000');
    expect(result.sd100?.line21_refund.toString()).toBe('0');
    expect(result.sdItsd2210?.line17_totalPenalty.toString()).toBe('0');
  });
  it('OH SD canonical aggregates separately identified actual W2 originals once', () => {
    const input = schoolDistrictSourcesFixture();
    const first = schoolW2(input);
    const copy = structuredClone(first);
    for (const w2 of [first, copy]) {
      Object.assign(w2, { wages: '40000', federalWithheld: '5000', socialSecurityWages: '40000',
        socialSecurityWithheld: '2480', medicareWages: '40000', medicareWithheld: '580',
        stateWages: '40000', stateTaxWithheld: '1500', localWages: '40000', localTaxWithheld: '550' });
      const packet = w2.stateLocalSources;
      if (!packet) throw new Error('Fictional original packet missing');
      const state = packet.stateRows[0], local = packet.localRows[0];
      if (!state || !local) throw new Error('Fictional original rows missing');
      state.wages = '40000'; state.withheld = '1500'; local.wages = '40000'; local.withheld = '550';
    }
    copy.employer = { name: 'PRIVATE-GENUINELY-DISTINCT-EMPLOYER', ein: '91-0000303' };
    input.w2s.push(copy);
    input.ohioSchoolDistrict.w2Sources.push({ ...structuredClone(firstCoverage(input)), w2Index: 1, sourceReference: 'PRIVATE-DISTINCT-ACTUAL-W2-COVERAGE' });
    bindSchoolDistrictFixture(input);
    const result = requireSD(input);
    expect(calculateFederalTax(input).totalWages.toString()).toBe('80000');
    expect(result.it1040.line14_ohioWithholding.toString()).toBe('3000');
    expect(result.sd100?.line11_sdWithholding.toString()).toBe('1100');
    expect(result.sd100?.line7_earnedIncomeTax.toString()).toBe('1000');
    expect(result.sd100?.line21_refund.toString()).toBe('100');
  });
  it('OH SD canonical uses actual rows when every legacy state and local projection is explicitly unused', () => {
    const input = schoolDistrictSourcesFixture();
    const w2 = schoolW2(input);
    for (const key of ['state', 'stateWages', 'stateTaxWithheld', 'localWages', 'localTaxWithheld', 'localityName', 'locality'] as const) delete w2[key];
    schoolW2Packet(input).legacyScalarProjection = 'unused';
    bindSchoolDistrictFixture(input);
    const result = requireSD(input);
    expect(result.it1040.line14_ohioWithholding.toString()).toBe('3000');
    expect(result.sd100?.line11_sdWithholding.toString()).toBe('1100');
  });
  it('OH SD canonical preserves the federal and IT1040 results independently of the separate district account', () => {
    const input = schoolDistrictSourcesFixture();
    const federal = calculateFederalTax(input);
    const before = requireSD(input);
    input.ohioSchoolDistrict.payments.refundDisposition.outgoingCarryforward = '25';
    const after = requireSD(input);
    expect(calculateFederalTax(input)).toEqual(federal);
    expect(after.it1040).toEqual(before.it1040);
    expect(after.sd100?.line21_refund.toString()).toBe('75');
  });
  it('OH SD canonical retains missing actual district packet as a source rejection', () => {
    const input = schoolDistrictSourcesFixture();
    delete schoolRaw(input).ohioSchoolDistrict;
    expect(() => canonical(input)).not.toThrow(TypeError);
    expect(() => canonical(input)).toThrow(/district|school|source/i);
  });
  it('OH SD canonical requires independent actual IT1040 payment sources', () => {
    const input = schoolDistrictSourcesFixture();
    delete schoolRaw(input).ohioPayments;
    expect(() => canonical(input)).not.toThrow(TypeError);
    expect(() => canonical(input)).toThrow(/payment|IT1040|independent/i);
  });
  it('OH SD canonical rejects a positive independent IT1040 penalty instead of silently reallocating school payments', () => {
    const input = schoolDistrictSourcesFixture();
    const state = schoolW2Packet(input).stateRows[0];
    if (!state) throw new Error('Actual state row missing');
    state.withheld = '0'; schoolW2(input).stateTaxWithheld = '0';
    input.ohioPayments.remainingTaxPayment = { status: 'expected_payment', sourceReference: 'Explicit independently intended IT balance', sourceFactsConfirmed: true, date: '2026-04-15', amountAppliedToTax: '5000' };
    bindSchoolDistrictFixture(input);
    expect(() => canonical(input)).not.toThrow(TypeError);
    expect(() => canonical(input)).toThrow(/separate|combined|penalty|2210/i);
  });
  it.each([
    ['schoolDistricts', [{ districtNumber: '0302', taxType: 'earned_income', rate: '0', residencyFactor: '0', wages: '0' }]],
    ['sdWithholdingOverride', '0'], ['sdEstimatedPayments', '0'], ['sdUnderpaymentPenalty', '0'],
    ['sdPriorYearTaxLiability', '0'], ['sdPriorYearTimelyFiled', true], ['sdAmendedPriorOverpayment', '0'],
    ['sdLatePaymentInterest', '0'], ['sdCreditCarryforward', '0'],
  ] as const)('OH SD canonical rejects unbound district overlays %s', (key, value) => {
    const input = schoolDistrictSourcesFixture();
    const overlay = Object.fromEntries([[key, value]]);
    expect(() => canonical(input, overlay)).not.toThrow(TypeError);
    expect(() => canonical(input, overlay)).toThrow(/override|bound|source|conflict/i);
  });
});

describe('OH SD helper', () => {
  it('OH SD helper reproduces independently derived worksheet source amounts and quarter schedule', async () => {
    const input = schoolDistrictEstimatedFixture();
    const result = await source(input);
    expect(result.methodVersion).toBe('oh-2025-sd100-ordinary-sources-v1');
    expect(result.residentIncome.residentDays).toBe(365);
    expect(result.residentIncome.residencyFactor.toFixed(4)).toBe('1.0000');
    expect([result.residentIncome.line29, result.residentIncome.line30, result.residentIncome.line31, result.residentIncome.line32, result.residentIncome.line33].map(v => v.toString()))
      .toEqual(['80000', '0', '80000', '80000', '80000']);
    expect(result.sdWithholding.toString()).toBe('600');
    expect(result.estimatedPayments.toString()).toBe('400');
    expect(result.estimatedPaymentSchedule.map(r => [r.date, r.amount.toString()])).toEqual([
      ['2025-04-15', '100'], ['2025-06-16', '100'], ['2025-09-15', '100'], ['2026-01-15', '100'],
    ]);
  });
  it('OH SD helper preserves actual no-return versus a filed zero-tax return', async () => {
    const input = schoolDistrictSourcesFixture();
    const noReturn = await source(input);
    expect(noReturn.priorYearTaxLiability).toBeUndefined();
    expect(noReturn.priorYearTimelyFiled).toBe(false);
    input.ohioSchoolDistrict.payments.priorReturn = schoolDistrictPriorReturn(input);
    const filedZero = await source(input);
    expect(filedZero.priorYearTaxLiability?.toString()).toBe('0');
    expect(filedZero.priorYearTimelyFiled).toBe(true);
    expect(filedZero.sourceDigest).not.toBe(noReturn.sourceDigest);
  });
  it('OH SD helper applies an actually available elected prior credit once', async () => {
    const input = schoolDistrictSourcesFixture();
    const p = input.ohioSchoolDistrict.payments;
    p.priorReturn = schoolDistrictPriorReturn(input, '1000', '25', '25');
    p.priorCreditCarryforward = { status: 'actual_credit', sourceReference: 'PRIVATE-CURRENT-AGENCY-AVAILABLE-CREDIT', accountHolder: 'primary', accountSsn: input.taxpayer.primary.ssn, electedAmount: '25', availableForThisReturn: '25', appliedToThisReturnConfirmed: true };
    p.account.priorCreditApplied = '25';
    const result = await source(input);
    expect(result.estimatedPayments.toString()).toBe('25');
    expect(result.estimatedPaymentSchedule.map(r => [r.date, r.amount.toString()])).toEqual([['2025-04-15', '25']]);
    expect(sdResult(input).line21_refund.toString()).toBe('125');
  });
  it('OH SD helper binds changed private originals without leaking them into audit', async () => {
    const input = schoolDistrictSourcesFixture();
    const before = structuredClone(input);
    const first = await source(input);
    expect(input).toEqual(before);
    schoolW2(input).employer.name = 'PRIVATE-CHANGED-CURRENT-EMPLOYER';
    bindSchoolDistrictFixture(input);
    const next = await source(input);
    expect(next.sourceDigest).not.toBe(first.sourceDigest);
    expect(next.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
    const audit = JSON.stringify(next.lines);
    expect(audit).toContain(next.sourceDigest);
    for (const value of [input.taxpayer.primary.ssn, input.taxpayer.address.street, schoolW2(input).employer.ein, schoolW2(input).employer.name,
      input.ohioSchoolDistrict.sourceReference, input.ohioSchoolDistrict.residence.lookup.sourceReference, input.ohioSchoolDistrict.payments.account.sourceReference]) expect(audit).not.toContain(value);
  });
  it('OH SD helper rejects a saved federal computation after an actual wage edit', async () => {
    const input = schoolDistrictSourcesFixture();
    const stale = calculateFederalTax(input);
    schoolW2(input).wages = '90000';
    bindSchoolDistrictFixture(input);
    const { buildOhioSchoolDistrictSource } = await import('@/engine/state/oh-sd-100-sources.js');
    expect(() => buildOhioSchoolDistrictSource(input, stale, actualOhioContext(input))).toThrow(/fresh|stale|federal|current/i);
  });
  const sourceCases: [string, (f: SchoolDistrictFixtureInput) => void, RegExp, boolean?][] = [
    ['missing current snapshot', f => { f.ohioSchoolDistrict.originalFederalSources = {}; }, /original|snapshot|current/i],
    ['stale same-money employer', f => { schoolW2(f).employer.name = 'PRIVATE-EDITED-EMPLOYER'; }, /original|snapshot|current/i, false],
    ['unconfirmed packet', f => ordinaryProperty(f.ohioSchoolDistrict, 'sourceFactsConfirmed', false), /confirm|complete|source/i],
    ['source year', f => { f.ohioSchoolDistrict.taxYear = 2024; }, /year/i],
    ['unsupported2026', f => { f.taxpayer.taxYear = 2026; f.ohioSchoolDistrict.taxYear = 2026; }, /2025|year|unavailable/i],
    ['changed owner', f => { f.ohioSchoolDistrict.owner.originalTaxpayer.ssn = '900-70-0999'; }, /owner|identity|original/i],
    ['unknown birth date', f => ordinaryProperty(f.taxpayer.primary, 'dateOfBirth', ''), /birth|age|owner|identity/i],
    ['senior cohort', f => { f.taxpayer.primary.dateOfBirth = '1950-01-01'; f.ohioSchoolDistrict.owner.originalTaxpayer.dateOfBirth = '1950-01-01'; }, /senior|65|cohort|age/i],
    ['address mismatch', f => { f.ohioSchoolDistrict.residence.originalAddress.street = 'Different actual home'; }, /address|residen/i],
    ['lookup address mismatch', f => { f.ohioSchoolDistrict.residence.lookup.originalAddress.street = 'Different actual lookup'; }, /address|lookup/i],
    ['lookup year', f => { f.ohioSchoolDistrict.residence.lookup.taxYear = 2024; }, /year|lookup/i],
    ['lookup unknown', f => ordinaryProperty(f.ohioSchoolDistrict.residence.lookup, 'officialResultMatchedConfirmed', false), /lookup|confirm/i],
    ['district lookup contradiction', f => { f.ohioSchoolDistrict.residence.lookup.districtCode = '9999'; }, /district|lookup/i],
    ['invalid real calendar day', f => { const period = f.ohioSchoolDistrict.residence.periods[0]; if (!period) throw new Error('fixture'); period.through = '2025-02-30'; }, /calendar|date|residen|complete/i],
    ['source rate override', f => ordinaryProperty(f.ohioSchoolDistrict, 'rate', '0'), /strict|unknown|rate|source|complete/i],
    ['source factor override', f => ordinaryProperty(f.ohioSchoolDistrict.residence, 'residencyFactor', '0'), /strict|unknown|factor|source|complete/i],
    ['calendar gap', f => { const period = f.ohioSchoolDistrict.residence.periods[0]; if (!period) throw new Error('fixture'); period.from = '2025-01-02'; }, /calendar|365|residen|complete/i],
    ['calendar overlap', f => { const period = f.ohioSchoolDistrict.residence.periods[0]; if (!period) throw new Error('fixture'); f.ohioSchoolDistrict.residence.periods.push(structuredClone(period)); }, /calendar|overlap|residen|complete/i],
    ['part-year Ohio owner', f => { const owner = f.ohioResidency.owners[0]; if (!owner) throw new Error('fixture'); owner.status = 'part_year_resident'; }, /full|residen|cohort/i],
    ['unknown ordinary classification', f => ordinaryProperty(f.ohioSchoolDistrict.income, 'ordinaryCompensationOnlyConfirmed', false), /income|ordinary|source|confirm/i],
    ['unknown all source review', f => ordinaryProperty(f.ohioSchoolDistrict.income, 'allOtherIncomeSourcesCheckedConfirmed', false), /source|income|confirm/i],
    ['unknown no-SE proof', f => ordinaryProperty(f.ohioSchoolDistrict.income, 'noSelfEmploymentIncomeConfirmed', false), /self|income|confirm|source/i],
    ['unclassified local row', f => { const local = firstCoverage(f).localRows[0]; if (!local) throw new Error('fixture'); local.classification = 'unresolved'; }, /local|class|district/i],
    ['omitted local row coverage', f => { firstCoverage(f).localRows = []; }, /local|row|cover|source/i],
    ['wrong district local allocation', f => { const local = firstCoverage(f).localRows[0]; if (!local) throw new Error('fixture'); local.districtCode = '9999'; }, /district|local/i],
    ['unknown box14', f => { firstCoverage(f).box14SchoolDistrictReporting.status = 'unknown'; }, /box.?14|report|unknown/i],
    ['positive box14', f => { firstCoverage(f).box14SchoolDistrictReporting.status = 'reported'; }, /box.?14|report|method/i],
    ['military compensation contradiction', f => { schoolW2(f).militaryService = { activeDuty: true, dutyState: 'OH', combatOrHazardousDutyPay: false }; }, /ordinary|military|special|method/i],
    ['allocated tips contradiction', f => { schoolW2(f).allocatedTips = '100'; }, /ordinary|special|tip|method/i],
    ['missing actual W2 owner', f => { delete schoolW2(f).accountHolder; }, /owner/i],
    ['missing actual W2 year', f => { delete schoolW2(f).taxYear; }, /year/i],
    ['unknown local money', f => { firstLocal(f).withheld = ''; }, /amount|money|withheld|source/i],
    ['fractional printed-boundary method', f => { firstLocal(f).withheld = '1100.49'; schoolW2(f).localTaxWithheld = '1100.49'; }, /round|whole|cent|printed|method/i],
    ['duplicated economic original', f => { f.w2s.push(structuredClone(schoolW2(f))); f.ohioSchoolDistrict.w2Sources.push({ ...structuredClone(firstCoverage(f)), w2Index: 1 }); }, /duplic|original|W2/i],
  ];
  it.each(sourceCases)('OH SD helper rejects unknown or contradictory actual source %s', async (_label, mutate, message, doBind) => {
    const input = schoolDistrictSourcesFixture();
    mutate(input);
    if (doBind !== false && _label !== 'missing current snapshot') bindSchoolDistrictFixture(input);
    await rejectSource(input, message);
  });
  it.each(['form1099Int', 'form1099Div', 'form1099B', 'form1099DA', 'form1099Nec', 'form1099Misc', 'form1099G', 'form1099OID', 'formW2G', 'form1099K', 'form1099R', 'form1099C', 'form1099SA', 'form1099Q', 'formSSA1099', 'formRRB1099', 'scheduleK1', 'scheduleK1Form1041'] as const)('OH SD helper rejects a hidden nonW2 current original %s', async key => {
      const input = schoolDistrictSourcesFixture();
      schoolRaw(input)[key] = [{ taxYear: 2025, accountHolder: 'primary', state: 'OH', localTaxWithheld: '10', interestIncome: '0', ordinaryDividends: '0' }];
      bindSchoolDistrictFixture(input);
      // Method rejection must precede attempted calculation of unsupported/incomplete forms.
      const { buildOhioSchoolDistrictSource } = await import('@/engine/state/oh-sd-100-sources.js');
      const invoke = () => buildOhioSchoolDistrictSource(input, calculateFederalTax(schoolDistrictSourcesFixture()), actualOhioContext(schoolDistrictSourcesFixture()));
      expect(invoke).not.toThrow(TypeError);
      expect(invoke).toThrow(/W2|finite|unsupported|method/i);
    });
  const cashCases: [string, (f: SchoolDistrictFixtureInput) => void, RegExp][] = [
    ['wrong account owner', f => { f.ohioSchoolDistrict.payments.account.accountSsn = '900-70-0999'; }, /owner|identity|account/i],
    ['wrong account tax year', f => { f.ohioSchoolDistrict.payments.account.taxYear = 2024; }, /year|account/i],
    ['wrong receipt tax type', f => { const row = f.ohioSchoolDistrict.payments.paymentRows[0]; if (!row) throw new Error('fixture'); ordinaryProperty(row.original, 'returnType', 'it1040'); }, /type|sd100|original|receipt/i],
    ['unreconciled account total', f => { f.ohioSchoolDistrict.payments.account.estimatedPaymentsCredited = '399'; }, /account|reconcil|total/i],
    ['unconfirmed complete account', f => ordinaryProperty(f.ohioSchoolDistrict.payments.account, 'completeAccountConfirmed', false), /account|confirm|complete/i],
    ['unconfirmed all payments', f => ordinaryProperty(f.ohioSchoolDistrict.payments, 'allCurrentAndPriorPaymentsIncludedConfirmed', false), /payment|confirm|complete/i],
    ['account asof contradiction', f => { f.ohioSchoolDistrict.payments.account.asOfDate = '2026-03-31'; }, /account|as.of|tim/i],
    ['receipt amount contradiction', f => { const row = f.ohioSchoolDistrict.payments.paymentRows[0]; if (!row) throw new Error('fixture'); row.original.amount = '101'; }, /amount|original|receipt|reconcil/i],
    ['wrong receipt year', f => { const row = f.ohioSchoolDistrict.payments.paymentRows[0]; if (!row) throw new Error('fixture'); row.original.taxYear = 2024; }, /year|original|receipt/i],
    ['prior owner contradiction', f => { const prior = schoolDistrictPriorReturn(f); prior.accountSsn = '900-70-0999'; f.ohioSchoolDistrict.payments.priorReturn = prior; }, /prior|owner|identity/i],
    ['prior election exceeds actual overpayment', f => { f.ohioSchoolDistrict.payments.priorReturn = schoolDistrictPriorReturn(f, '1000', '25', '0'); }, /prior|election|overpayment|carry/i],
    ['prior credit account contradicts explicit none', f => { f.ohioSchoolDistrict.payments.account.priorCreditApplied = '25'; }, /prior|account|credit|reconcil/i],
    ['available credit exceeds filed election', f => { const p = f.ohioSchoolDistrict.payments; p.priorReturn = schoolDistrictPriorReturn(f, '1000', '25', '25'); p.priorCreditCarryforward = { status: 'actual_credit', sourceReference: 'PRIVATE-CONTRADICTORY-AVAILABLE-CREDIT', accountHolder: 'primary', accountSsn: f.taxpayer.primary.ssn, electedAmount: '25', availableForThisReturn: '26', appliedToThisReturnConfirmed: true }; p.account.priorCreditApplied = '26'; }, /prior|election|available|credit/i],
    ['future payment', f => { const row = f.ohioSchoolDistrict.payments.paymentRows[0]; if (!row) throw new Error('fixture'); row.date = '2026-04-02'; row.original.date = row.date; }, /future|date|as.of|tim/i],
    ['late first quarter despite annual catchup', f => { const row = f.ohioSchoolDistrict.payments.paymentRows[0]; if (!row) throw new Error('fixture'); row.date = '2026-01-15'; row.original.date = row.date; }, /quarter|installment|tim|penalty|2210/i],
    ['renamed duplicate receipt', f => { const first = f.ohioSchoolDistrict.payments.paymentRows[0]; if (!first) throw new Error('fixture'); f.ohioSchoolDistrict.payments.paymentRows.push({ ...structuredClone(first), sourceId: 'different label', sourceReference: 'different private reference' }); f.ohioSchoolDistrict.payments.account.estimatedPaymentsCredited = '500'; }, /duplic|receipt|cash/i],
    ['semantic duplicate receipt', f => { const first = f.ohioSchoolDistrict.payments.paymentRows[0]; if (!first) throw new Error('fixture'); const copy = { ...structuredClone(first), sourceId: 'different label' }; copy.original.confirmationNumber = `  ${first.original.confirmationNumber.toLowerCase()}  `; f.ohioSchoolDistrict.payments.paymentRows.push(copy); f.ohioSchoolDistrict.payments.account.estimatedPaymentsCredited = '500'; }, /duplic|receipt|cash/i],
    ['cash reused on IT1040', f => { const first = f.ohioSchoolDistrict.payments.paymentRows[0]; if (!first) throw new Error('fixture'); f.ohioPayments.paymentRows.push({ ...structuredClone(first), returnType: 'it1040', original: { ...structuredClone(first.original), returnType: 'it1040' } }); }, /duplic|receipt|cash|tax.type|account/i],
    ['pending prior refund relabeled available credit', f => { f.ohioSchoolDistrict.payments.priorCreditCarryforward = { status: 'actual_credit', sourceReference: 'Only requested refund, not elected credit', accountHolder: 'primary', accountSsn: f.taxpayer.primary.ssn, electedAmount: '25', availableForThisReturn: '25', appliedToThisReturnConfirmed: true }; f.ohioSchoolDistrict.payments.account.priorCreditApplied = '25'; }, /prior|election|filed|credit/i],
    ['late endpoint', f => { f.ohioSchoolDistrict.payments.currentTiming = { kind: 'expected', expectedDate: '2026-04-16', asOfDate: '2026-04-01' }; }, /late|tim|endpoint|method/i],
    ['filed date after asof', f => { f.ohioSchoolDistrict.payments.currentTiming = { kind: 'filed', filedDate: '2026-04-15', asOfDate: '2026-04-01' }; }, /filed|date|as.of|tim/i],
    ['election exceeds overpayment', f => { f.ohioSchoolDistrict.payments.refundDisposition.outgoingCarryforward = '101'; }, /election|overpayment|carry/i],
  ];
  it.each(cashCases)('OH SD helper rejects duplicate or contradictory cash original %s', async (_label, mutate, message) => {
    const input = _label === 'election exceeds overpayment' ? schoolDistrictSourcesFixture()
      : _label === 'late first quarter despite annual catchup' ? schoolDistrictZeroWithholdingFixture()
      : schoolDistrictEstimatedFixture();
    mutate(input);
    await rejectSource(input, message);
  });
});

/** All records below are independently authored fictional originals. Some zero-source
 * federal elections are themselves invalid, so the baseline federal context is
 * intentional: unsupported-family presence must reject before any downstream
 * recomputation/staleness or election threshold can mask this source-method guard.
 */
const retainedNonwageOriginals: [string, unknown][] = [
  ['form4797', { netSection1231GainOrLoss: '0', nonrecapturedNetSection1231Losses: '0', propertySales: [] }],
  ['homeSales', [{ accountHolder: 'primary', salePrice: '100', purchasePrice: '100', daysOwned: 730, daysUsedAsResidence: 730, usedExclusionInPrior2Years: false }]],
  ['form6252', [{ description: 'Actual separate installment source', accountHolder: 'primary', isYearOfSale: true, sellingPrice: '100', costBasis: '100', paymentsReceived: '100' }]],
  ['form6781', { accountHolder: 'primary', section1256Gains: '100', section1256Losses: '100', adjustments: '0', carrybackElection: false }],
  ['form8814', [{ taxableInterest: '0', taxExemptInterest: '0', ordinaryDividends: '0', qualifiedDividends: '0', capitalGainDistributions: '0' }]],
  ['form8824', [{ description: 'Actual separate exchange source', fmvLikeKindPropertyReceived: '0', adjustedBasisLikeKindPropertyGivenUp: '0' }]],
  ['savingsBondRedemptions', [{ sourceId: 'retained-actual-bond', proceeds: '100', faceValue: '100', interest: '0', bondType: 'series_i', issueDate: '2000-01-01', redemptionDate: '2025-08-01', ownerDateOfBirth: '1990-01-15', registeredOwner: 'taxpayer', ownershipConfirmed: true, priorYearInterestReported: '0' }]],
];
it.each(retainedNonwageOriginals)('OH SD helper rejects retained source family before downstream derivation %s', async (family, value) => {
  const input = schoolDistrictSourcesFixture();
  const baselineFederal = calculateFederalTax(input);
  const baselineOhio = actualOhioContext(input);
  const parsed = TaxYearInputSchema.parse({ ...input, [family]: value });
  const actual = Reflect.get(parsed, family);
  expect(actual).toBeDefined();
  if (Array.isArray(actual)) expect(actual).toHaveLength(1);
  Reflect.set(input, family, actual);
  bindSchoolDistrictFixture(input);
  const before = structuredClone(input);
  const { buildOhioSchoolDistrictSource } = await import('@/engine/state/oh-sd-100-sources.js');
  const invoke = () => buildOhioSchoolDistrictSource(input, baselineFederal, baselineOhio);
  expect(invoke).not.toThrow(TypeError);
  expect(invoke).toThrow('the finite ordinaryW2-only source method does not support other income/local originals');
  expect(input).toEqual(before);
});
