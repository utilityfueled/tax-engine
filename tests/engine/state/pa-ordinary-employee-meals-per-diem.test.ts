/** Spec: state/pa-ordinary-employee-sources.yaml#outsideBox16MealsPerDiem. */
import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodePDFRawStream, PDFDocument, PDFRawStream } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal';
import { calculatePAOrdinaryEmployeeSources } from '@/engine/state/pa-ordinary-employee-sources';
import { calculatePAOrdinaryReturn } from '@/engine/state/pa-ordinary-return';
import { snapshotPAOrdinaryReturnOriginals } from '@/engine/state/pa-ordinary-return-facts';
import { calculatePAResidencySources } from '@/engine/state/pa-residency-sources';
import { fillReturn } from '@/pdf/fill-return';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy';
import { PA_40_FIELDS } from '@/pdf/mappings/2025/fill-pa-40';
import { buildPAScheduleUEReferenceSummary, PA_SCHEDULE_UE_REFERENCE_FILENAME } from '@/pdf/mappings/2025/fill-pa-schedule-ue';
import { preparePAOrdinaryReturnReview } from '@/pdf/pa-ordinary-return-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { paOrdinaryEmployeeFixture } from '../../fixtures/pa-ordinary-employee-sources';
import { paOrdinaryReturnFixture } from '../../fixtures/pa-ordinary-return';

function excludedAllowance() {
  const { input, residency, packet } = paOrdinaryEmployeeFixture('resident');
  const [row] = packet.employers;
  const [wage] = residency.wages;
  const [w2] = input.w2s;
  const [pay] = row.payroll;
  const [originalExpense] = row.ue.expenses;
  input.taxpayer.address = { street: '10 Fictional Home Way', city: 'Harrisburg', state: 'PA', zip: '17101' };
  residency.residency.schoolDistrictCode = '22275';
  residency.residency.schoolDistrictName = 'Harrisburg City';
  Object.assign(w2, {
    wages: '30000.41', socialSecurityWages: '30000.41', medicareWages: '30000.41',
    socialSecurityWithheld: '1860.03', medicareWithheld: '435.01', state: 'PA',
    stateWages: '30000.41', stateTaxWithheld: '921.00', federalWithheld: '3500.00',
  });
  row.originalW2 = structuredClone(w2);
  wage.original = structuredClone(w2);
  wage.noPAFederalCompensationDifferencesConfirmed = false;
  for (const day of row.calendar) for (const location of day.locations) location.state = 'PA';
  row.statement.outsideWorkDates = [];
  row.statement.w2CorrectionExplanation = '';
  pay.grossCompensation = '30000.41';
  wage.payroll[0] = { ...pay, paServicesCompensation: '30000.41', outsidePAServicesCompensation: '0' };
  const payment = {
    sourceReference: 'Fictional dated meals per diem remittance', paidOn: '2025-06-20',
    amount: '50.00', method: 'fixed_allowance_not_w2', includedInW2Confirmed: false,
    expenseReferences: ['Fictional Tuesday meal expense', 'Fictional Wednesday meal expense'],
  };
  const expenses = [
    { sourceReference: payment.expenseReferences[0], receiptReference: 'Fictional private Tuesday itemized receipt', paidOn: '2025-06-17', amount: '14.90' },
    { sourceReference: payment.expenseReferences[1], receiptReference: 'Fictional private Wednesday itemized receipt', paidOn: '2025-06-18', amount: '15.50' },
  ].map(receipt => ({
    ...originalExpense, ...receipt, category: 'overnight_meals', description: 'Required overnight employer training meal',
    usefulLifeAtMostOneYearConfirmed: null, reimbursementMethod: 'fixed_allowance_not_w2',
    reimbursementReferences: [payment.sourceReference],
  }));
  const evidence = {
    tripReference: 'Fictional private employer Philadelphia training order',
    employerPolicyReference: 'Fictional original accountable-plan policy',
    lodgingPaymentReference: 'Fictional employer-to-hotel payment',
    remittanceReference: payment.sourceReference,
    taxHomeState: 'PA', taxHomeCity: 'Harrisburg',
    destinationState: 'PA', destinationCounty: 'Philadelphia', destinationCity: 'Philadelphia',
    lodgingLocation: { state: 'PA', county: 'Philadelphia', city: 'Philadelphia' },
    unrelatedPrivateEmployerConfirmed: true,
    overnightBusinessTravelAwayFromTaxHomeConfirmed: true,
    employerPaidLodgingDirectlyConfirmed: true,
    accountablePlanAndTimelyAccountingConfirmed: true,
    gsaLocalityMealsAndIncidentalsOnlyWith75PercentPartialDaysConfirmed: true,
    excludedFromFederalBox1AndPABox16Confirmed: true,
    noOtherPaymentsIncidentalCostsAdvanceRefundOrWageSubstitutionConfirmed: true,
    days: [
      { date: '2025-06-17', accountingReference: 'Fictional Tuesday time, place and purpose approval', expenseReference: expenses[0].sourceReference, amount: '25.00' },
      { date: '2025-06-18', accountingReference: 'Fictional Wednesday time, place and purpose approval', expenseReference: expenses[1].sourceReference, amount: '25.00' },
    ],
  };
  const verification = {
    employerPolicyReference: evidence.employerPolicyReference, remittanceReference: payment.sourceReference,
    accountablePlanPolicyAndTimelyAccountingVerifiedConfirmed: true, federalBox1AndPABox16ExclusionsVerifiedConfirmed: true,
  };
  row.statement.documentReference = 'Fictional signed employer calendar and remittance verification';
  Object.assign(row.statement, { outsideBox16MealsPerDiemVerification: verification });
  row.ue.expenses = expenses;
  row.ue.reimbursements = [payment];
  Object.assign(row.ue, { outsideBox16MealsPerDiem: evidence });
  return { input, residency, packet, row, wage, w2, payment, expenses, evidence, verification };
}

it('routes a verified excluded Philadelphia meals per diem excess only to PA compensation', async () => {
  const f = excludedAllowance();
  const w2Before = structuredClone(f.w2);
  const [employer] = calculatePAOrdinaryEmployeeSources(f.input, f.packet).perEmployer;
  const ue = employer.scheduleUE;
  expect([ue.mealsBeforeLimitation, ue.mealsAfterLimitation, ue.totalTravelExpenses, ue.lineH, ue.lineI, ue.lineJ, ue.netUnreimbursedExpenses]
    .map(amount => amount.toFixed())).toEqual(['30.4', '30', '30', '30', '50', '-20', '0']);
  expect(employer.outsideBox16MealsPerDiem?.rawAdditionalPACompensation.toFixed()).toBe('19.6');
  expect(employer.outsideBox16MealsPerDiem?.additionalPACompensation.toFixed()).toBe('20');
  expect(employer.rawGrossCompensation.toFixed()).toBe('30000.41');
  expect(employer.scheduleNRH).toBeUndefined();
  const result = calculatePAResidencySources(f.input, f.residency);
  expect([result.compensation, result.reportedCompensation, result.unreimbursedEmployeeExpenses, result.totalOrdinaryPATaxableIncome, result.taxBeforeCredits, result.actualPAServiceCompensation]
    .map(amount => amount?.toFixed())).toEqual(['30020.01', '30020', '0', '30020', '922', '30020.01']);
  const full = paOrdinaryReturnFixture('resident');
  const facts = { ...full.facts, originalFederalSources: snapshotPAOrdinaryReturnOriginals(f.input),
    timing: { ...full.facts.timing, asOfDate: f.packet.asOfDate,
      remainingTaxPayment: { status: 'expected_payment', date: '2026-04-15', amountAppliedToTax: '1', sourceReference: 'Fictional April principal payment' } } };
  Object.assign(f.input, { paResidencySources: f.residency, paOrdinaryReturnFacts: facts, paOrdinaryReturnCompletionSources: full.sources });
  facts.originalFederalSources = snapshotPAOrdinaryReturnOriginals(f.input);
  full.sources.originalFederalSources = snapshotPAOrdinaryReturnOriginals(f.input);
  full.sources.otherStateTaxes.jurisdictions[0].completeThroughDate = f.packet.asOfDate;
  const ordinary = calculatePAOrdinaryReturn(f.input, facts, full.sources);
  expect([ordinary.pa40.compensation, ordinary.pa40.netCompensation, ordinary.pa40.stateWithholding, ordinary.pa40.taxLiability,
    ordinary.pa40.taxForgivenessEligibilityIncome].map(amount => amount.toFixed()))
    .toEqual(['30020', '30020', '921', '922', '30020']);
  expect(ordinary.readiness.filingEligible).toBe(false);
  expect(ordinary.workingCredit.federalEarnedIncomeCredit.isZero()).toBe(true);
  expect(f.w2).toEqual(w2Before);
  const review = buildPAScheduleUEReferenceSummary(ue);
  expect(review.totals.slice(1)).toEqual([
    { label: 'Section II travel expenses', value: '30' },
    { label: 'Section I and miscellaneous expenses', value: '0' },
    { label: 'Line H total expenses', value: '30' },
    { label: 'Line I employer reimbursements', value: '50' },
    { label: 'Line J taxable reimbursement to PA-40 line 1a', value: '20' },
  ]);
  expect(JSON.stringify(review)).not.toContain(f.expenses[0].receiptReference);
  expect(review.warningLabel).toBe('REFERENCE SUMMARY ONLY');
  const outputDir = process.env.TAX_ENGINE_PA_PER_DIEM_TEST_ARTIFACT_DIR ?? await mkdtemp(join(tmpdir(), 'pa-meals-per-diem-'));
  try {
    const federal = calculateFederalTax(f.input);
    expect(federal.totalIncome.toFixed()).toBe('30000.41');
    federal.stateReturns = { pennsylvania: ordinary };
    const output = await fillReturn(redactReviewIdentifiers(f.input), federal, {
      blankFormsDir: join(process.cwd(), 'forms/blank/2025'), outputDir, purpose: 'review',
      paOrdinaryReview: preparePAOrdinaryReturnReview(f.input),
    });
    expect(output.filledForms.some(path => /pa-schedule-nrh/i.test(path))).toBe(false);
    expect(output.filledForms.some(path => path.endsWith(PA_SCHEDULE_UE_REFERENCE_FILENAME))).toBe(true);
    const pa40Document = await PDFDocument.load(await readFile(join(outputDir, 'pa-40-filled.pdf')));
    expect(pa40Document.getSubject()).toBe(REVIEW_PDF_NOTICE);
    const pa40 = pa40Document.getForm();
    expect([PA_40_FIELDS.line1a, PA_40_FIELDS.line1b, PA_40_FIELDS.line1c, PA_40_FIELDS.primarySSN]
      .map(name => (pa40.getTextField(name).getText() ?? '').replaceAll(',', ''))).toEqual(['30020', '', '30020', '']);
    const doc = await PDFDocument.load(await readFile(join(outputDir, PA_SCHEDULE_UE_REFERENCE_FILENAME)));
    expect(doc.getPageCount()).toBe(1);
    const [page] = doc.getPages();
    const contents = page.node.Contents();
    const streams = contents instanceof PDFRawStream ? [contents] : contents?.asArray().map(ref => doc.context.lookup(ref));
    const lines = streams?.flatMap(stream => stream instanceof PDFRawStream
      ? Array.from(Buffer.from(decodePDFRawStream(stream).decode()).toString('ascii').matchAll(/<([0-9A-F]+)> Tj/g), match => Buffer.from(match[1], 'hex').toString('latin1'))
      : []) ?? [];
    expect(lines.slice(-5)).toEqual(['Section I and miscellaneous expenses: $0', 'Line H total expenses: $30',
      'Line I employer reimbursements: $50', 'Line J taxable reimbursement to PA-40 line 1a: $20',
      REVIEW_PDF_NOTICE]);
    expect(lines).toContain('REFERENCE SUMMARY ONLY');
    expect(lines.join('\n')).not.toContain(f.expenses[0].receiptReference);
    expect(lines.join('\n')).not.toContain(f.input.taxpayer.primary.ssn);
  } finally {
    if (!process.env.TAX_ENGINE_PA_PER_DIEM_TEST_ARTIFACT_DIR) await rm(outputDir, { recursive: true, force: true });
  }
});

it('suppresses a verified below-cost or exact Philadelphia meals per diem group', () => {
  for (const amounts of [['27.00', '28.00'], ['25.00', '25.00']]) {
    const f = excludedAllowance();
    f.expenses[0].amount = amounts[0];
    f.expenses[1].amount = amounts[1];
    f.wage.noPAFederalCompensationDifferencesConfirmed = true;
    const result = calculatePAResidencySources(f.input, f.residency);
    const [employer] = result.employeeSources?.perEmployer ?? [];
    expect([employer.scheduleUE.lineH, employer.scheduleUE.lineI, employer.scheduleUE.lineJ, result.reportedCompensation, result.unreimbursedEmployeeExpenses]
      .map(amount => amount.toFixed())).toEqual(['0', '0', '0', '30000', '0']);
    expect(employer.scheduleNRH).toBeUndefined();
  }
});

it('requires actual Philadelphia lodging and a signed employer verification of the original excluded remittance', () => {
  const outsideLodging = excludedAllowance();
  outsideLodging.evidence.lodgingPaymentReference = 'Fictional original employer-paid hotel in Montgomery County';
  outsideLodging.evidence.lodgingLocation = { state: 'PA', county: 'Montgomery', city: 'King of Prussia' };
  outsideLodging.evidence.days.forEach(day => { day.amount = '60.00'; });
  outsideLodging.payment.amount = '120.00';
  const calendarOnly = excludedAllowance();
  calendarOnly.row.statement.documentReference = 'Fictional signed work calendar only';
  calendarOnly.evidence.employerPolicyReference = 'Fictional unsigned travel email with no payroll exclusion';
  expect(() => calculatePAOrdinaryEmployeeSources(outsideLodging.input, outsideLodging.packet)).toThrow(/lodging.*locality/i);
  expect(() => calculatePAOrdinaryEmployeeSources(calendarOnly.input, calendarOnly.packet)).toThrow(/signed.*policy/i);
});

it('rejects unsupported or contradictory Philadelphia per diem originals and calculations', () => {
  type Fixture = ReturnType<typeof excludedAllowance>;
  const checks: Array<[(f: Fixture) => void, RegExp]> = [
    [f => { f.input.taxpayer.taxYear = 2026; }, /year|2025/i],
    [f => { f.w2.stateWages = '30000.40'; f.row.originalW2 = structuredClone(f.w2); }, /Box 16|wage/i],
    [f => { f.evidence.excludedFromFederalBox1AndPABox16Confirmed = false; }, /exclusion|excluded|Box 16/i],
    [f => { f.evidence.accountablePlanAndTimelyAccountingConfirmed = false; }, /accountable/i],
    [f => { f.evidence.destinationCounty = 'Montgomery'; }, /Philadelphia/i],
    [f => { f.evidence.employerPaidLodgingDirectlyConfirmed = false; }, /lodging/i],
    [f => { Reflect.deleteProperty(f.evidence, 'lodgingLocation'); }, /packet shape/i],
    [f => { Reflect.deleteProperty(f.row.statement, 'outsideBox16MealsPerDiemVerification'); }, /signed.*policy/i],
    [f => { f.verification.accountablePlanPolicyAndTimelyAccountingVerifiedConfirmed = false; }, /signed.*policy/i],
    [f => { f.verification.federalBox1AndPABox16ExclusionsVerifiedConfirmed = false; }, /signed.*payroll/i],
    [f => { f.verification.remittanceReference = 'Fictional different remittance'; }, /signed.*remittance/i],
    [f => { Reflect.deleteProperty(f.row.ue, 'outsideBox16MealsPerDiem'); }, /matching original trip/i],
    [f => { f.evidence.days[0].date = '2025-06-16'; }, /consecutive|date/i],
    [f => { f.evidence.days[0].amount = '69.01'; f.payment.amount = '94.01'; }, /cap|69/i],
    [f => { f.evidence.days[0].amount = '25.001'; f.payment.amount = '50.001'; }, /cents/i],
    [f => { f.evidence.days[0].amount = '26'; }, /reconcile|payment/i],
    [f => { f.payment.paidOn = '2025-06-16'; }, /remittance|date/i],
    [f => { f.expenses[1].receiptReference = f.expenses[0].receiptReference; }, /duplicate|receipt/i],
    [f => { f.expenses[1].reimbursementReferences = ['different allowance']; }, /pair|link/i],
    [f => { f.expenses[0].amount = '15.00'; f.payment.amount = '50.49'; f.evidence.days[0].amount = '25.49'; }, /precision|whole-dollar/i],
    [f => { f.expenses[0].amount = '24.99'; f.expenses[1].amount = '25.00'; }, /precision|whole-dollar/i],
    [f => { f.expenses[0].amount = '34.49'; }, /direction|group/i],
  ];
  for (const [change, error] of checks) {
    const f = excludedAllowance();
    change(f);
    expect(() => calculatePAOrdinaryEmployeeSources(f.input, f.packet)).toThrow(error);
  }
  const f = excludedAllowance();
  f.wage.payroll[0].sourceReference = 'A distinct original payroll with the same amount';
  expect(() => calculatePAResidencySources(f.input, f.residency)).toThrow(/same original payroll/i);
  const difference = excludedAllowance();
  difference.wage.noPAFederalCompensationDifferencesConfirmed = true;
  expect(() => calculatePAResidencySources(difference.input, difference.residency)).toThrow(/compensation difference/i);
  const nonresident = excludedAllowance();
  nonresident.residency.residency = paOrdinaryEmployeeFixture('nonresident').residency.residency;
  expect(() => calculatePAResidencySources(nonresident.input, nonresident.residency)).toThrow(/full-year Pennsylvania resident/i);
  const statutoryResident = excludedAllowance();
  statutoryResident.residency.residency.domicilePeriods[0].state = 'NY';
  statutoryResident.residency.residency.domicilePeriods[0].daysInPA = 200;
  expect(() => calculatePAResidencySources(statutoryResident.input, statutoryResident.residency)).toThrow(/domiciliary/i);
});
