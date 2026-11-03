/** Spec: spec/state/pa-ordinary-employee-sources.yaml. All literal expectations precede products. */
import Decimal from 'decimal.js';
import { expect, it } from 'vitest';
import { PAOrdinaryEmployeeSourcesSchema } from '@/models/pa-ordinary-employee-sources';
import { calculatePAOrdinaryEmployeeSources } from '@/engine/state/pa-ordinary-employee-sources';
import { paOrdinaryEmployeeFixture } from '../../fixtures/pa-ordinary-employee-sources';

function employer(f: ReturnType<typeof paOrdinaryEmployeeFixture>) {
  const row = f.packet.employers[0];
  if (!row) throw new Error('Fictional control requires an employer original');
  return row;
}
function receipt(f: ReturnType<typeof paOrdinaryEmployeeFixture>) {
  const row = employer(f).ue.expenses[0];
  if (!row) throw new Error('Fictional control requires an actual paid receipt');
  return row;
}
const calculate = (f: ReturnType<typeof paOrdinaryEmployeeFixture>) => calculatePAOrdinaryEmployeeSources(f.input, f.packet);
const rejects = (f: ReturnType<typeof paOrdinaryEmployeeFixture>) => expect(() => calculate(f)).toThrow(/actual|source|original|employee|employer|calendar|expense|work|unknown|confirm|method|reimburse|precision/i);

it('actual employee sources derive calendar and literal NRH lines from complete originals', () => {
  const f = paOrdinaryEmployeeFixture(), before = structuredClone(f), r = calculate(f);
  const row = r.perEmployer[0];
  if (!row) throw new Error('Actual output requires a per-employer allocation');
  expect(row.calendarDays).toBe(260);
  expect(row.nonworkingDays).toBe(10);
  expect(row.workingDays).toBe(250);
  expect(row.paWorkingDays).toBe(90);
  expect(row.workingDayFraction.toFixed(6)).toBe('0.360000');
  expect(row.rawGrossCompensation.toFixed()).toBe('75000');
  expect(row.rawPAServiceCompensation.toFixed()).toBe('27000');
  expect(row.scheduleUE.line3.toFixed()).toBe('1000');
  expect(row.scheduleUE.line5.toFixed()).toBe('1000');
  expect(row.scheduleUE.lineH.toFixed()).toBe('1000');
  expect(row.scheduleUE.lineI.toFixed()).toBe('0');
  expect(row.scheduleUE.lineJ.toFixed()).toBe('1000');
  for (const [line, value] of [['line9', '75000'], ['line12', '27000'], ['line13', '1000'], ['line16', '360'], ['line17', '0'], ['line18', '27000'], ['line19', '0'], ['line20', '27000'], ['line21', '360'], ['line22', '26640']] as const) expect(row.scheduleNRH[line].toFixed()).toBe(value);
  expect(r.sourceCommitment).toMatch(/^[a-f0-9]{64}$/);
  expect(f).toEqual(before);
});


it('actual employee sources reject unknown complete expense history', () => {
  for (const key of ['allExpenseAndReimbursementSourcesReviewedConfirmed', 'otherExpenseClassesConfirmedNone']) {
    for (const value of [null, false]) {
      const f = paOrdinaryEmployeeFixture(); Reflect.set(employer(f).ue, key, value); rejects(f);
    }
  }
});

it('actual employee sources reject unknown signed statement facts instead of inferring a signature', () => {
  for (const key of ['signed', 'documentAvailableConfirmed', 'fullCalendarAndOutsideDaysVerifiedConfirmed']) {
    const f = paOrdinaryEmployeeFixture(); Reflect.set(employer(f).statement, key, null); rejects(f);
  }
  for (const key of ['documentReference', 'signerName', 'signerRole', 'signedOn']) {
    const f = paOrdinaryEmployeeFixture(); Reflect.set(employer(f).statement, key, ''); rejects(f);
  }
  const unsigned = paOrdinaryEmployeeFixture(); employer(unsigned).statement.signed = false; rejects(unsigned);
});

it('actual employee sources reject incomplete or duplicated calendar records', () => {
  const gap = paOrdinaryEmployeeFixture(); employer(gap).calendar.splice(20, 1); rejects(gap);
  const duplicate = paOrdinaryEmployeeFixture(); const calendar = employer(duplicate).calendar;
  const first = calendar[0]; if (!first) throw new Error('Calendar control is missing');
  calendar.push(structuredClone(first)); rejects(duplicate);
  const invalid = paOrdinaryEmployeeFixture(); const day = employer(invalid).calendar[0]; if (!day) throw new Error('Calendar control is missing');
  day.date = '2025-02-30'; rejects(invalid);
});

it('actual employee sources reject outside calendar proof with unchanged money', () => {
  const f = paOrdinaryEmployeeFixture(); employer(f).statement.outsideWorkDates.pop(); rejects(f);
});

it('actual employee sources classify personal convenience at a suitable PA workplace', () => {
  const f = paOrdinaryEmployeeFixture(); const day = employer(f).calendar[100]; const location = day?.locations[0];
  if (!location) throw new Error('Control requires actual outside work');
  location.employerRequiredOutsideWork = false;
  const result = calculate(f), row = result.perEmployer[0]; if (!row) throw new Error('Actual output is missing');
  expect(row.paWorkingDays).toBe(91);
  expect(row.workingDayFraction.toFixed(6)).toBe('0.364000');
  expect(row.scheduleNRH.line12.toFixed()).toBe('27300');
  expect(row.scheduleNRH.line16.toFixed()).toBe('364');
  expect(row.scheduleNRH.line22.toFixed()).toBe('26936');
});

it('actual employee sources reject unknown outside necessity and commuting as compensable work', () => {
  const f = paOrdinaryEmployeeFixture(); const day = employer(f).calendar[100]; const location = day?.locations[0];
  if (!day || !location) throw new Error('Control requires actual outside work');
  location.employerRequiredOutsideWork = null; rejects(f);
  const transit = paOrdinaryEmployeeFixture(); const transitDay = employer(transit).calendar[10]; const transitLocation = transitDay?.locations[0];
  if (!transitDay || !transitLocation) throw new Error('Control requires actual PA work');
  transitDay.travelClassification = 'commute_only'; transitLocation.transitOnly = true; rejects(transit);
});

it('actual employee sources reject unpaid nonwork masquerading as a workday', () => {
  const f = paOrdinaryEmployeeFixture(); const day = employer(f).calendar[10]; const location = day?.locations[0];
  if (!location) throw new Error('Control requires a working source');
  location.compensatedWorkConfirmed = false; rejects(f);
});

it('actual employee sources reject unsupported allocation and expense methods', () => {
  for (const key of ['allocationMethod', 'specialInterstateOccupation', 'workplaceBasis']) {
    const f = paOrdinaryEmployeeFixture(); Reflect.set(employer(f), key, key === 'allocationMethod' ? 'business_volume' : key === 'specialInterstateOccupation' ? 'motor_carrier' : ''); rejects(f);
  }
  const travel = paOrdinaryEmployeeFixture(); receipt(travel).category = 'overnight_meals'; rejects(travel);
  const depreciation = paOrdinaryEmployeeFixture(); receipt(depreciation).usefulLifeAtMostOneYearConfirmed = false; rejects(depreciation);
});

it('actual employee sources reject unknown required expense conditions', () => {
  for (const key of ['ordinaryCustomaryConfirmed', 'actuallyPaidConfirmed', 'reasonableConfirmed', 'necessaryConfirmed', 'directlyRelatedConfirmed', 'employerRequiredConfirmed', 'notProvidedByEmployerConfirmed', 'usefulLifeAtMostOneYearConfirmed']) {
    const f = paOrdinaryEmployeeFixture(); Reflect.set(receipt(f), key, null); rejects(f);
  }
  const clothing = paOrdinaryEmployeeFixture(); receipt(clothing).category = 'work_clothing'; receipt(clothing).notEverydayClothingConfirmed = false; rejects(clothing);
  const license = paOrdinaryEmployeeFixture(); receipt(license).category = 'occupational_license'; receipt(license).requiredLicenseOrUnionMembershipConfirmed = null; rejects(license);
});

it('actual employee sources reject missing actual receipt and employer provenance', () => {
  const missingReceipt = paOrdinaryEmployeeFixture(); receipt(missingReceipt).receiptReference = ''; rejects(missingReceipt);
  const missingEmployer = paOrdinaryEmployeeFixture(); employer(missingEmployer).employer.telephone = ''; rejects(missingEmployer);
  const wrongEmployer = paOrdinaryEmployeeFixture(); employer(wrongEmployer).employer.ein = '98-7654321'; rejects(wrongEmployer);
});

it('actual employee sources reject stale and missing owner year or current original facts', () => {
  const stale = paOrdinaryEmployeeFixture(); stale.input.w2s[0].employer.name = 'Equal-dollar changed employer original'; rejects(stale);
  const wrongOwner = paOrdinaryEmployeeFixture(); wrongOwner.packet.owner.originalTaxpayer.ssn = '900-70-0312'; rejects(wrongOwner);
  const unknownYear = paOrdinaryEmployeeFixture(); unknownYear.packet.sourceTaxYear = null; rejects(unknownYear);
  const wrongYear = paOrdinaryEmployeeFixture(); employer(wrongYear).sourceTaxYear = 2026; rejects(wrongYear);
  const status = paOrdinaryEmployeeFixture(); employer(status).currentUncorrectedNonvoidOriginalConfirmed = null; rejects(status);
});

it('actual employee sources reject duplicated original indices and economic originals', () => {
  const f = paOrdinaryEmployeeFixture(); const original = employer(f); f.packet.employers.push(structuredClone(original)); rejects(f);
  const duplicate = paOrdinaryEmployeeFixture(); duplicate.input.w2s.push(structuredClone(duplicate.input.w2s[0]));
  duplicate.packet.employers.push({ ...structuredClone(employer(duplicate)), originalIndex: 1, sourceReference: 'Another label for same original' }); rejects(duplicate);
});

it('actual employee sources reject missing index coverage including zero originals', () => {
  const f = paOrdinaryEmployeeFixture(); f.packet.employers = []; rejects(f);
  const unknown = paOrdinaryEmployeeFixture(); employer(unknown).originalIndex = null; rejects(unknown);
});

it('actual employee sources reject payroll and receipt money residuals', () => {
  const f = paOrdinaryEmployeeFixture(); const pay = employer(f).payroll[0]; if (!pay) throw new Error('Actual payroll is missing'); pay.grossCompensation = '74999.99'; rejects(f);
  for (const amount of ['', '-0.01', 'NaN', 'Infinity']) { const invalid = paOrdinaryEmployeeFixture(); receipt(invalid).amount = amount; rejects(invalid); }
});

it('actual employee sources reject duplicate receipts and reimbursement references', () => {
  const duplicate = paOrdinaryEmployeeFixture(); employer(duplicate).ue.expenses.push(structuredClone(receipt(duplicate))); rejects(duplicate);
  const missing = paOrdinaryEmployeeFixture(); receipt(missing).reimbursementReferences = ['Unknown actual reimbursement']; rejects(missing);
});

it('actual employee sources suppress fixed allowance gap and exact reimbursement expenses', () => {
  for (const [method, amount] of [['fixed_allowance_not_w2', '30'], ['exact_accounted_not_w2', '100']] as const) {
    const f = paOrdinaryEmployeeFixture(), row = employer(f), expense = receipt(f);
    expense.reimbursementMethod = method; expense.reimbursementReferences = ['Fictional actual matching reimbursement'];
    row.ue.reimbursements = [{ sourceReference: expense.reimbursementReferences[0], paidOn: '2025-05-01', amount, method, expenseReferences: [expense.sourceReference], includedInW2Confirmed: false }];
    const result = calculate(f), output = result.perEmployer[0]; if (!output) throw new Error('Actual output is missing');
    expect(output.scheduleUE.lineH.toFixed()).toBe('900');
    expect(output.scheduleUE.lineI.toFixed()).toBe('0');
    expect(output.scheduleUE.lineJ.toFixed()).toBe('900');
    expect(output.scheduleNRH.line19.toFixed()).toBe('0');
    expect(output.scheduleNRH.line16.toFixed()).toBe('324');
    expect(output.scheduleNRH.line22.toFixed()).toBe('26676');
  }
});

it('actual employee sources reject unaccounted partial or excess reimbursement methods', () => {
  const f = paOrdinaryEmployeeFixture(); receipt(f).reimbursementMethod = 'unaccounted_partial'; rejects(f);
  const contradiction = paOrdinaryEmployeeFixture(); employer(contradiction).ue.reimbursements.push({ sourceReference: 'Retained unpaired actual allowance', paidOn: '2025-05-01', amount: '1', method: 'fixed_allowance_not_w2', expenseReferences: [], includedInW2Confirmed: false }); rejects(contradiction);
});

it('actual employee sources sum exact cents once per printed direct-expense line', () => {
  const f = paOrdinaryEmployeeFixture(); employer(f).ue.expenses.forEach(expense => { expense.amount = '0.10'; });
  const result = calculate(f), row = result.perEmployer[0]; if (!row) throw new Error('Actual output is missing');
  expect(row.rawAllowableExpenses.toFixed()).toBe('1');
  expect(row.scheduleUE.line3.toFixed()).toBe('1');
  expect(row.scheduleUE.lineH.toFixed()).toBe('1');
  expect(row.scheduleNRH.line16.toFixed()).toBe('0');
  expect(Decimal.precision).toBe(20);
});

it('actual employee sources preserve local Decimal precision without changing the global context', () => {
  const f = paOrdinaryEmployeeFixture(), original = Decimal.precision;
  const wage = '123456789012345678901234567890.50'; f.input.w2s[0].wages = wage; employer(f).originalW2.wages = wage;
  const pay = employer(f).payroll[0]; if (!pay) throw new Error('Actual payroll is missing'); pay.grossCompensation = wage;
  const result = calculate(f), row = result.perEmployer[0]; if (!row) throw new Error('Actual output is missing');
  expect(row.rawGrossCompensation.toFixed()).toBe('123456789012345678901234567890.5');
  expect(row.rawPAServiceCompensation.toFixed()).toBe('44444444044444444404444444440.58');
  expect(Decimal.precision).toBe(original);
});






it('actual employee sources keep strict draft shape and opaque output commitments', () => {
  const f = paOrdinaryEmployeeFixture(); expect(PAOrdinaryEmployeeSourcesSchema.safeParse(f.packet).success).toBe(true);
  const unknown = structuredClone(f.packet); Reflect.set(unknown, 'freeDayCounter', 260); expect(PAOrdinaryEmployeeSourcesSchema.safeParse(unknown).success).toBe(false);
  const result = JSON.stringify(calculate(f));
  for (const privateValue of [f.packet.owner.originalTaxpayer.ssn, employer(f).employer.ein, employer(f).statement.signerName, receipt(f).receiptReference]) expect(result).not.toContain(privateValue);
});


it('actual employee sources bind signature dates to actual complete-through proof', () => {
  const future = paOrdinaryEmployeeFixture(); employer(future).statement.signedOn = '2026-02-02'; rejects(future);
  const beforeWork = paOrdinaryEmployeeFixture(); employer(beforeWork).statement.signedOn = '2025-01-01'; rejects(beforeWork);
});


it('actual employee sources guard six-place and full-ratio dollar disagreement', () => {
  const f = paOrdinaryEmployeeFixture(), row = employer(f), w2 = f.input.w2s[0];
  const wage = '1000000.50';
  Object.assign(w2, { wages: wage, stateWages: wage, socialSecurityWages: '176100', socialSecurityWithheld: '10918.20', medicareWages: wage, medicareWithheld: '14500.01' });
  row.originalW2 = structuredClone(w2);
  row.employmentPeriods = [{ from: '2025-01-11', through: '2025-01-13', sourceReference: 'Fictional complete three-calendar-day precision employment record' }];
  row.calendar = row.calendar.slice(10, 13);
  row.calendar.forEach((day, index) => { const location = day.locations[0]; if (!location) throw new Error('Precision fixture requires actual work'); location.state = index === 0 ? 'PA' : 'NY'; location.employerRequiredOutsideWork = index === 0 ? null : true; });
  row.statement.outsideWorkDates = ['2025-01-12', '2025-01-13'];
  row.payroll = [{ sourceReference: 'Fictional original precision payroll', paidOn: '2025-01-13', serviceFrom: '2025-01-11', serviceThrough: '2025-01-13', grossCompensation: wage }];
  row.ue.expenses = [];
  // Printed gross1000001 /3 =>333334; printed six-place .333333 =>333333.
  expect(() => calculate(f)).toThrow(/precision|six|fraction/i);
});
