/** Explicit fictional 2026 employee originals; expected tax is stored separately. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { OhioResidencyFacts } from '@/models/ohio-residency.js';
import type { OhioPaymentFacts } from '@/models/ohio-payments.js';
import { ohioNrcCategories } from '@/models/ohio-residency.js';
import { simpleW2Fixture } from './simple-w2.js';

type Status = 'full_year_resident' | 'part_year_resident' | 'nonresident';
export function ohio2026OrdinaryFixture(status: Status = 'full_year_resident', wages = '50000', ohioWages = wages, joint = false) {
  const input: TaxYearInput = structuredClone(simpleW2Fixture);
  input.taxpayer.taxYear = 2026;
  input.taxpayer.filingStatus = joint ? 'married_filing_jointly' : 'single';
  input.taxpayer.primary = { firstName: 'Private', lastName: 'Employee', ssn: '900-70-0901', dateOfBirth: '1990-01-15' };
  if (joint) input.taxpayer.spouse = { firstName: 'Private', lastName: 'Spouse', ssn: '900-70-0902', dateOfBirth: '1991-01-15' };
  input.w2s = [];
  const holders = joint ? ['primary', 'spouse'] as const : ['primary'] as const;
  const owners: OhioResidencyFacts['owners'] = [];
  const employmentOriginals = [];
  for (const [index, holder] of holders.entries()) {
    const person = holder === 'primary' ? input.taxpayer.primary : input.taxpayer.spouse;
    if (!person) throw new Error('Explicit fictional owner required');
    const withheld = joint ? '1250' : '1000';
    const w2: TaxYearInput['w2s'][number] = {
      accountHolder: holder, taxYear: 2026,
      employer: { name: `Fictional Corporation ${index + 1}`, ein: `90-700090${index + 1}` },
      wages, federalWithheld: '0', socialSecurityWages: wages, socialSecurityTips: '0', allocatedTips: '0',
      socialSecurityWithheld: new Decimal(wages).times('.062').toFixed(2),
      medicareWages: wages, medicareWithheld: new Decimal(wages).times('.0145').toFixed(2),
      box10DependentCareBenefits: '0', box12CodeW: '0', box12CodeD: '0', box12CodeE: '0', box12CodeF: '0',
      box12CodeG: '0', box12CodeH: '0', box12CodeS: '0', box12CodeAA: '0', box12CodeBB: '0', box12CodeEE: '0', box12CodeT: '0',
      state: 'OH', stateWages: wages, stateTaxWithheld: withheld, localWages: '0', localTaxWithheld: '0', localityName: '',
    };
    w2.stateLocalSources = {
      sourceTaxYear: 2026, sourceReference: `PRIVATE-CURRENT-W2-${index}`, sourceFactsConfirmed: true,
      owner: { accountHolder: holder, originalTaxpayer: { firstName: person.firstName, lastName: person.lastName, ssn: person.ssn } },
      originalW2: structuredClone(w2), currentUncorrectedNonvoidOriginalConfirmed: true, allOriginalBoxesKnownConfirmed: true,
      singleOriginalWithoutContinuationConfirmed: true, allOriginalPagesAndCopiesCheckedConfirmed: true,
      stateReporting: 'single', localReporting: 'none', legacyScalarProjection: 'first_entered_rows',
      stateRows: [{ printedRow: 1, sourceReference: `PRIVATE-OH-ROW-${index}`, state: 'OH', employerStateIDStatus: 'reported', employerStateID: `PRIVATE-ID-${index}`, wages, withheld }], localRows: [],
    };
    input.w2s.push(w2);
    const periods = status === 'full_year_resident'
      ? [{ from: '2026-01-01', to: '2026-12-31', domicileState: 'OH' }]
      : status === 'part_year_resident'
        ? [{ from: '2026-01-01', to: '2026-06-30', domicileState: 'VA' }, { from: '2026-07-01', to: '2026-12-31', domicileState: 'OH' }]
        : [{ from: '2026-01-01', to: '2026-12-31', domicileState: 'VA' }];
    owners.push({ accountHolder: holder, status, sourceReference: `PRIVATE-DOMICILE-${index}`, periods,
      amounts: Object.fromEntries(ohioNrcCategories.map(category => [category, {
        federalAmount: category === 'wages' ? wages : '0',
        residentAmount: category === 'wages' && status !== 'nonresident' ? ohioWages : '0',
        nonresidentOhioAmount: category === 'wages' && status === 'nonresident' ? ohioWages : '0',
        sourceReference: `PRIVATE-CATEGORY-${index}-${category}`,
      }])) as NonNullable<OhioResidencyFacts['owners'][number]['amounts']>, stateAdditions: [], stateDeductions: [],
    });
    const amounts = status === 'full_year_resident' ? [['2026-01-01', '2026-12-31', 'OH', wages]]
      : status === 'part_year_resident'
        ? [['2026-01-01', '2026-06-30', 'VA', new Decimal(wages).minus(ohioWages).toFixed()], ['2026-07-01', '2026-12-31', 'OH', ohioWages]]
        : [['2026-01-01', '2026-03-31', 'OH', ohioWages], ['2026-04-01', '2026-12-31', 'VA', new Decimal(wages).minus(ohioWages).toFixed()]];
    employmentOriginals.push({ w2Index: index, sourceReference: `PRIVATE-EMPLOYER-${index}`, sourceTaxYear: 2026,
      accountHolder: holder, employerTin: w2.employer.ein, employerName: w2.employer.name,
      entityType: 'c_corporation', ordinaryEmployeeCompensationConfirmed: true,
      allServiceAndPaymentPeriodsIncludedConfirmed: true,
      serviceRows: amounts.map(([from, to, serviceState, amount], row) => ({
        sourceId: `PRIVATE-PAYROLL-${index}-${row}`, sourceReference: `PRIVATE-PAYROLL-ORIGINAL-${index}-${row}`,
        from, to, paymentDate: to, serviceState, wages: amount,
      })),
    });
  }
  input.ohioResidency = { taxYear: 2026, sourceReference: 'PRIVATE-ALL-CURRENT-DOMICILE-ORIGINALS', sourceFactsConfirmed: true,
    allFederalSourcesIncludedConfirmed: true, noBusinessIncomeConfirmed: true, schoolDistrictStatus: 'no_ohio_taxing_district_residency', owners };
  input.ohioPayments = { taxYear: 2026, sourceReference: 'PRIVATE-COMPLETE-2026-OH-ACCOUNT', sourceFactsConfirmed: true,
    originalFederalSources: {}, calendarYearConfirmed: true, allPaymentsIncludedConfirmed: true, withholdingTreatment: 'equal_quarters', paymentRows: [],
    priorReturn: { status: 'no_return', sourceReference: 'PRIVATE-ACTUAL-PRIOR-RETURN-SEARCH' },
    priorCreditCarryforward: { status: 'none', sourceReference: 'PRIVATE-ACTUAL-ACCOUNT-NO-CREDIT' },
    remainingTaxPayment: { status: 'no_remaining_tax', sourceReference: 'PRIVATE-CURRENT-PAYMENT-COVERAGE', sourceFactsConfirmed: true },
    currentTiming: { kind: 'expected', expectedDate: '2027-04-15', asOfDate: '2027-03-01' },
    filingExtension: { kind: 'none' }, paymentExtension: { kind: 'none' }, returnKind: 'original', specialMethod: 'regular',
    balanceFacts: { sourceReference: 'PRIVATE-KNOWN-USE-TAX-AND-ELECTIONS', useTax: '0', outgoingCarryforward: '0', donations: '0' } } satisfies OhioPaymentFacts;
  const sources = { taxYear: 2026, sourceReference: 'PRIVATE-COMPLETE-ORDINARY-EMPLOYEE-METHOD', sourceFactsConfirmed: true,
    originalFederalSources: {}, allIncomeAndAdjustmentOriginalsIncludedConfirmed: true, noOtherIncomeOrAdjustmentSourcesConfirmed: true,
    noQualifyingEitcChildrenConfirmed: true, noOtherOhioCreditSourcesConfirmed: true,
    noOtherStateTaxOnOhioResidentIncomeConfirmed: true, noTaxingSchoolDistrictResidencyConfirmed: true,
    noOtherPaymentOrRefundableCreditSourcesConfirmed: true,
    employmentOriginals };
  const packet = { input, sources };
  rebindOhio2026Ordinary(packet);
  return packet;
}
export function rebindOhio2026Ordinary(packet: ReturnType<typeof ohio2026OrdinaryFixture>) {
  const { ohioResidency: _residency, ohioPayments: _payments, ...original } = packet.input;
  packet.sources.originalFederalSources = structuredClone(original);
  if (!packet.input.ohioResidency || !packet.input.ohioPayments) throw new Error('Actual source fixture requires both original packets');
  packet.input.ohioResidency.originalFederalSources = structuredClone(original);
  packet.input.ohioPayments.originalFederalSources = structuredClone(original);
}
