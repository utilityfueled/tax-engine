/** Explicit fictional employment, payroll, signed proof and receipts; never product defaults. */
import { TaxYearInputSchema } from '@/models/inputs';
import { paOrdinaryResidencyFixture } from './pa-residency-sources';
import { paOrdinaryReturnFixture } from './pa-ordinary-return';
import { snapshotPAOrdinaryReturnOriginals } from '@/engine/state/pa-ordinary-return-facts';

export function paOrdinaryEmployeeFixture(status: 'resident' | 'part_year' | 'nonresident' = 'nonresident') {
  const base = paOrdinaryResidencyFixture(status), input = base.input;
  input.form1099Int = [];
  const w2 = input.w2s[0];
  if (!w2) throw new Error('Fictional employee requires the actual W2 original');
  Object.assign(w2, {
    employer: { name: 'Fictional Keystone Instrument Employer', ein: '12-3456789' },
    // Explicit fictional original W2 Box8 source fact; never a production default.
    allocatedTips: '0',
    wages: '75000', federalWithheld: '8200', socialSecurityWages: '75000', socialSecurityWithheld: '4650',
    medicareWages: '75000', medicareWithheld: '1087.50', state: 'NY', stateWages: '75000', stateTaxWithheld: '0',
  });
  const calendar = Array.from({ length: 260 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10);
    return {
      date, sourceReference: `Fictional original daily timecard ${date}`,
      kind: index < 10 ? 'nonworking' : 'working',
      nonworkingReason: index < 10 ? 'vacation_leave' : '',
      travelClassification: 'none',
      locations: index < 10 ? [] : [{
        state: index < 100 ? 'PA' : 'NY', compensatedWorkConfirmed: true as boolean | null,
        employerRequiredOutsideWork: index < 100 ? null : true as boolean | null,
        transitOnly: false as boolean | null,
      }],
    };
  });
  const expenses = Array.from({ length: 10 }, (_, index) => ({
    sourceReference: `Fictional required consumed supplies purchase ${index + 1}`,
    receiptReference: `Fictional actual itemized and paid receipt ${index + 1}`,
    paidOn: `2025-04-${String(index + 11).padStart(2, '0')}`,
    category: 'small_tools_supplies', description: 'Required supplies consumed while servicing employer instruments', amount: '100',
    ordinaryCustomaryConfirmed: true as boolean | null, actuallyPaidConfirmed: true as boolean | null,
    reasonableConfirmed: true as boolean | null, necessaryConfirmed: true as boolean | null,
    directlyRelatedConfirmed: true as boolean | null, employerRequiredConfirmed: true as boolean | null,
    notProvidedByEmployerConfirmed: true as boolean | null, notEverydayClothingConfirmed: null as boolean | null,
    requiredLicenseOrUnionMembershipConfirmed: null as boolean | null,
    usefulLifeAtMostOneYearConfirmed: true as boolean | null,
    reimbursementMethod: 'none', reimbursementReferences: [] as string[],
  }));
  const originalPayroll = {
    sourceReference: 'Fictional original complete employment payroll', paidOn: '2025-09-17',
    serviceFrom: '2025-01-01', serviceThrough: '2025-09-17', grossCompensation: '75000',
  };
  const packet = {
    sourceTaxYear: 2025 as number | null, sourceReference: 'Fictional complete actual employee source packet',
    asOfDate: '2026-02-01',
    sourceFactsConfirmed: true as boolean | null,
    owner: { accountHolder: 'primary', originalTaxpayer: structuredClone(base.sources.owner.originalTaxpayer) },
    employers: [{
      originalIndex: 0 as number | null, sourceTaxYear: 2025 as number | null,
      sourceReference: 'Fictional original employer W2 and supporting payroll set', originalW2: structuredClone(w2),
      sourceFactsConfirmed: true as boolean | null, currentUncorrectedNonvoidOriginalConfirmed: true as boolean | null,
      allOriginalBoxesKnownConfirmed: true as boolean | null, ordinaryCashCompensationOnlyConfirmed: true as boolean | null,
      employer: {
        name: w2.employer.name, ein: w2.employer.ein, address: '10 Fictional Employer Street, Philadelphia PA 19103',
        telephone: '215-555-0100', jobDuties: 'Service and calibrate employer instruments in its PA and NY workplaces',
      },
      allocationMethod: 'working_days', workplaceBasis: 'suitable_PA', specialInterstateOccupation: 'none',
      employmentPeriods: [{ from: '2025-01-01', through: '2025-09-17', sourceReference: 'Fictional actual hire and termination record' }],
      statement: {
        documentReference: 'Fictional synthetic signed employer letter; no real external attestation',
        documentAvailableConfirmed: true as boolean | null, signed: true as boolean | null,
        signerName: 'Fictional Payroll Officer', signerRole: 'Employer payroll officer', signedOn: '2026-02-01',
        fullCalendarAndOutsideDaysVerifiedConfirmed: true as boolean | null,
        outsideWorkDates: calendar.filter(day => day.locations.some(location => location.state === 'NY')).map(day => day.date),
        w2CorrectionExplanation: 'Fictional original NY W2 has no PA wage row; employer documents actual PA workdays',
      },
      calendar, payroll: [originalPayroll],
      ue: {
        sourceReference: 'Fictional complete actual employer UE receipts and reimbursement policy',
        allExpenseAndReimbursementSourcesReviewedConfirmed: true as boolean | null,
        otherExpenseClassesConfirmedNone: true as boolean | null, expenses,
        reimbursements: [] as Array<{
          sourceReference: string; paidOn: string; amount: string; method: string;
          expenseReferences: string[]; includedInW2Confirmed: boolean | null;
        }>,
      },
    }],
  };
  const residency = {
    ...base.sources, employeeSources: packet, interest: [],
    wages: [{ ...base.sources.wages[0], original: structuredClone(w2), payroll: [{
      ...originalPayroll, paServicesCompensation: '27000', outsidePAServicesCompensation: '48000',
    }] }],
  };
  if (status === 'part_year') {
    residency.residency.domicilePeriods = [
      { from: '2025-01-01', through: '2025-09-30', state: 'NY', daysInPA: 90 },
      { from: '2025-10-01', through: '2025-12-31', state: 'PA', daysInPA: 90 },
    ];
    residency.residency.paPermanentAbodePeriods = [{ from: '2025-10-01', through: '2025-12-31' }];
    residency.residency.outsidePAPermanentAbodePeriods = [{ from: '2025-01-01', through: '2025-09-30' }];
  } else residency.residency.domicilePeriods[0].daysInPA = 90;
  return { input, residency, packet };
}

/** Original financial expectations are explicit, not calculated from candidate products. */
export function paOrdinaryEmployeeReturnFixture(status: 'resident' | 'part_year' | 'nonresident' = 'nonresident', mode: 'nrh' | 'payroll' = 'nrh') {
  const f = paOrdinaryEmployeeFixture(status), base = paOrdinaryReturnFixture(status), row = f.packet.employers[0];
  const w2 = f.input.w2s[0], residencyWage = f.residency.wages[0];
  if (!row || !w2 || !residencyWage) throw new Error('Fictional ordinary employee originals are incomplete');
  if (mode === 'payroll') {
    // Separate genuine synthetic 3-day record: original75000, actual PA50000, outside25000.
    row.employmentPeriods = [{ from: '2025-01-13', through: '2025-01-15', sourceReference: 'Fictional original three-day employment contract' }];
    row.calendar = [13, 14, 15].map((day, index) => ({
      date: `2025-01-${day}`, sourceReference: `Fictional actual three-day timecard ${day}`,
      kind: 'working', nonworkingReason: '', travelClassification: 'none',
      locations: [{ state: index < 2 ? 'PA' : 'NY', compensatedWorkConfirmed: true,
        employerRequiredOutsideWork: index < 2 ? null : true, transitOnly: false }],
    }));
    row.statement.outsideWorkDates = ['2025-01-15']; row.statement.w2CorrectionExplanation = '';
    row.payroll = [{ sourceReference: 'Fictional actual three-day75000 payroll', paidOn: '2025-01-15', serviceFrom: '2025-01-13', serviceThrough: '2025-01-15', grossCompensation: '75000' }];
    row.ue.expenses = [];
    Object.assign(w2, { state: 'PA', stateWages: '50000' }); row.originalW2 = structuredClone(w2); residencyWage.original = structuredClone(w2);
    residencyWage.payroll = [{ ...row.payroll[0], paServicesCompensation: '50000', outsidePAServicesCompensation: '25000' }];
    f.residency.residency.domicilePeriods[0].daysInPA = 2;
  }
  const input = TaxYearInputSchema.parse({ ...f.input, paResidencySources: f.residency }), facts = structuredClone(base.facts), sources = structuredClone(base.sources);
  facts.sourceReference = 'Fictional complete new source-bound employee annual filing facts';
  facts.timing.asOfDate = f.packet.asOfDate;
  facts.timing.remainingTaxPayment = { status: 'expected_payment', date: '2026-04-15', amountAppliedToTax: mode === 'payroll' ? '1135' : status === 'resident' ? '2272' : '818', sourceReference: 'Fictional explicit April15 principal payment election' };
  if (mode === 'payroll') facts.payments.rows = [{ sourceReference: 'Fictional actual timely April15 estimate400', intendedInstallment: 1, original: {
    accountName: input.taxpayer.primary.firstName + ' ' + input.taxpayer.primary.lastName,
    accountSsn: input.taxpayer.primary.ssn, taxYear: 2025, returnType: 'pa40', kind: 'estimated', date: '2025-04-15', amount: '400', confirmationNumber: 'Fictional originalPAestimate400receipt',
  } }];
  facts.originalFederalSources = snapshotPAOrdinaryReturnOriginals(input);
  sources.originalFederalSources = snapshotPAOrdinaryReturnOriginals(input);
  for (const history of sources.otherStateTaxes.jurisdictions) history.completeThroughDate = f.packet.asOfDate;
  return { ...f, input, facts, sources };
}
