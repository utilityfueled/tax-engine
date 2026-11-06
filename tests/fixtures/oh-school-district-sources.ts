/** Independently supplied FICTIONAL records; no taxpayer/source facts inferred from tax outputs.
 * Spec: state/oh-sd-100-sources.yaml. Contract authored before production model/helper.
 */
import { TaxYearInputSchema, type TaxYearInput } from '@/models/inputs.js';
import type { OhioPaymentFacts } from '@/models/ohio-payments.js';
import type { OhioResidencyFacts } from '@/models/ohio-residency.js';
import type { W2StateLocalSources } from '@/models/w2-state-local.js';
import { ohioResidencyFacts, ohioResidencyOwner } from './oh-residency.js';
import { simpleW2Fixture } from './simple-w2.js';

type ActualIdentity = { firstName: string; lastName: string; ssn: string; dateOfBirth: string };
type ActualAddress = TaxYearInput['taxpayer']['address'];
type SDReceiptOriginal = {
  accountName: string; accountSsn: string; taxYear: number; returnType: 'sd100';
  kind: 'estimated'; date: string; amount: string; confirmationNumber: string;
};
export interface SchoolDistrictFixtureFacts {
  taxYear: number; sourceReference: string; sourceFactsConfirmed: true;
  originalFederalSources: Record<string, unknown>;
  owner: { accountHolder: 'primary'; originalTaxpayer: ActualIdentity };
  residence: {
    sourceReference: string; originalAddress: ActualAddress;
    periods: { from: string; through: string; districtCode: string; sourceReference: string }[];
    lookup: {
      sourceReference: string; taxYear: number; lookupDate: string;
      originalAddress: ActualAddress; districtCode: string; districtName: string;
      officialResultMatchedConfirmed: true;
    };
  };
  income: {
    sourceReference: string; ordinaryCompensationOnlyConfirmed: true;
    noSelfEmploymentIncomeConfirmed: true; allOtherIncomeSourcesCheckedConfirmed: true;
    noSpecialWageAdjustmentsConfirmed: true;
  };
  w2Sources: {
    w2Index: number; sourceReference: string;
    box14SchoolDistrictReporting: { status: 'none' | 'reported' | 'unknown'; sourceReference: string };
    localRows: { printedRow: number; sourceReference: string; classification: 'school_district' | 'municipal' | 'unresolved'; districtCode?: string; municipalityCode?: string }[];
  }[];
  payments: {
    sourceReference: string; allCurrentAndPriorPaymentsIncludedConfirmed: true;
    withholdingTreatment: 'equal_quarters';
    paymentRows: {
      sourceId: string; sourceReference: string; accountHolder: 'primary'; taxYear: number;
      returnType: 'sd100'; kind: 'estimated'; date: string; amount: string;
      appliedToThisReturnConfirmed: true; original: SDReceiptOriginal;
    }[];
    account: {
      sourceReference: string; accountName: string; accountSsn: string; taxYear: number;
      returnType: 'sd100'; asOfDate: string; completeAccountConfirmed: true;
      estimatedPaymentsCredited: string; priorCreditApplied: string;
    };
    priorReturn: { status: 'no_return'; sourceReference: string } | {
      status: 'filed_return'; sourceReference: string; taxYear: number; returnType: 'sd100';
      districtCode: string; accountName: string; accountSsn: string; filingStatus: 'single';
      periodStart: string; periodEnd: string; returnKind: 'original'; filedDate: string;
      filingExtension: { kind: 'none' }; line8: string; line19: string; electedCreditCarryforward: string;
    };
    priorCreditCarryforward: { status: 'none'; sourceReference: string } | {
      status: 'actual_credit'; sourceReference: string; accountHolder: 'primary'; accountSsn: string;
      electedAmount: string; availableForThisReturn: string; appliedToThisReturnConfirmed: true;
    };
    remainingTaxPayment: { status: 'no_remaining_tax'; sourceReference: string; sourceFactsConfirmed: true };
    currentTiming: { kind: 'expected'; expectedDate: string; asOfDate: string } | { kind: 'filed'; filedDate: string; asOfDate: string };
    filingExtension: { kind: 'none' }; paymentExtension: { kind: 'none' };
    returnKind: 'original'; specialMethod: 'regular';
    refundDisposition: { sourceReference: string; outgoingCarryforward: string };
  };
}
export type SchoolDistrictFixtureInput = TaxYearInput & {
  ohioResidency: OhioResidencyFacts; ohioPayments: OhioPaymentFacts;
  ohioSchoolDistrict: SchoolDistrictFixtureFacts;
};

export function schoolW2(input: SchoolDistrictFixtureInput) {
  const original = input.w2s[0];
  if (!original) throw new Error('Fictional school fixture needs its original W2');
  return original;
}
export function schoolW2Packet(input: SchoolDistrictFixtureInput) {
  const packet = schoolW2(input).stateLocalSources;
  if (!packet) throw new Error('Fictional school fixture needs its actual W2 packet');
  return packet;
}
/** Explicit test-record authoring only. Production reading must never do this. */
export function bindSchoolDistrictFixture(input: SchoolDistrictFixtureInput) {
  for (const w2 of input.w2s) {
    const packet = w2.stateLocalSources;
    if (packet) {
      const { stateLocalSources: _source, ...original } = w2;
      packet.originalW2 = structuredClone(original);
    }
  }
  const { ohioResidency: _r, ohioPayments: _p, ohioSchoolDistrict: _s, ...original } = input;
  input.ohioResidency.originalFederalSources = structuredClone(original);
  input.ohioPayments.originalFederalSources = structuredClone(original);
  input.ohioSchoolDistrict.originalFederalSources = structuredClone(original);
}

export function schoolDistrictSourcesFixture(sdWithheld = '1100'): SchoolDistrictFixtureInput {
  const input = TaxYearInputSchema.parse(structuredClone(simpleW2Fixture));
  const person = input.taxpayer.primary;
  Object.assign(person, { firstName: 'Avery', lastName: 'School', ssn: '900-70-0302', dateOfBirth: '1990-01-15' });
  // New fictional address/calendar/lookup originals are expressly supplied, not postal qualification.
  input.taxpayer.address = { street: '302 Fictional District Lane', city: 'Ashland', state: 'OH', zip: '44805' };
  const existing = input.w2s[0];
  if (!existing) throw new Error('Base fixture has no original W2');
  input.w2s = [{ ...existing, accountHolder: 'primary', taxYear: 2025,
    employer: { name: 'FICTIONAL-SD-PRIVATE-EMPLOYER', ein: '91-0000302' },
    wages: '80000', federalWithheld: '10000', socialSecurityWages: '80000', socialSecurityWithheld: '4960',
    medicareWages: '80000', medicareWithheld: '1160', allocatedTips: '0', box10DependentCareBenefits: '0',
    box12CodeW: '0', box12CodeD: '0', box12CodeE: '0', box12CodeF: '0', box12CodeG: '0', box12CodeH: '0', box12CodeS: '0',
    box12CodeAA: '0', box12CodeBB: '0', box12CodeEE: '0', box12CodeT: '0',
    state: 'OH', stateWages: '80000', stateTaxWithheld: '3000',
    localWages: '80000', localTaxWithheld: sdWithheld, localityName: 'HILLSDALE LSD 0302',
  }];
  const w2 = input.w2s[0];
  if (!w2) throw new Error('Fictional original W2 missing');
  const w2Packet: W2StateLocalSources = {
    sourceTaxYear: 2025, sourceReference: 'PRIVATE-SD-W2-ALL-ORIGINAL-PAGES', sourceFactsConfirmed: true,
    owner: { accountHolder: 'primary', originalTaxpayer: { firstName: person.firstName, lastName: person.lastName, ssn: person.ssn } },
    originalW2: structuredClone(w2), currentUncorrectedNonvoidOriginalConfirmed: true,
    allOriginalBoxesKnownConfirmed: true, singleOriginalWithoutContinuationConfirmed: true,
    allOriginalPagesAndCopiesCheckedConfirmed: true, stateReporting: 'single', localReporting: 'single',
    legacyScalarProjection: 'first_entered_rows',
    stateRows: [{ printedRow: 1, sourceReference: 'PRIVATE-ACTUAL-OH-STATE-ROW', state: 'OH', employerStateIDStatus: 'reported', employerStateID: 'PRIVATE-OH-EMPLOYER-ID-0302', wages: '80000', withheld: '3000' }],
    localRows: [{ printedRow: 1, sourceReference: 'PRIVATE-ACTUAL-SD-LOCAL-ROW', localityNameStatus: 'reported', localityName: 'HILLSDALE LSD 0302', wages: '80000', withheld: sdWithheld }],
  };
  w2.stateLocalSources = w2Packet;
  const resident = ohioResidencyOwner('primary', 'full_year_resident');
  Object.assign(resident.amounts.wages, { federalAmount: '80000', residentAmount: '80000', nonresidentOhioAmount: '0' });
  const ohioResidency: OhioResidencyFacts = { ...ohioResidencyFacts(), schoolDistrictStatus: 'actual_district_sources_required', owners: [resident] };
  const ohioPayments: OhioPaymentFacts = {
    taxYear: 2025, sourceReference: 'PRIVATE-EXPLICIT-IT1040-ACCOUNT', sourceFactsConfirmed: true,
    originalFederalSources: {}, calendarYearConfirmed: true, allPaymentsIncludedConfirmed: true,
    withholdingTreatment: 'equal_quarters', paymentRows: [],
    priorReturn: { status: 'no_return', sourceReference: 'PRIVATE-EXPLICIT-NO-PRIOR-IT1040' },
    priorCreditCarryforward: { status: 'none', sourceReference: 'PRIVATE-ACTUAL-NO-IT-PRIOR-CREDIT' },
    remainingTaxPayment: { status: 'no_remaining_tax', sourceReference: 'PRIVATE-EXPLICIT-IT-TAX-COVERAGE', sourceFactsConfirmed: true },
    currentTiming: { kind: 'expected', expectedDate: '2026-04-15', asOfDate: '2026-04-01' },
    filingExtension: { kind: 'none' }, paymentExtension: { kind: 'none' }, returnKind: 'original', specialMethod: 'regular',
    balanceFacts: { sourceReference: 'PRIVATE-ACTUAL-IT-USE-TAX-ELECTIONS', useTax: '0', outgoingCarryforward: '0', donations: '0' },
  };
  const sd: SchoolDistrictFixtureFacts = {
    taxYear: 2025, sourceReference: 'PRIVATE-SD-COMPLETE-ORIGINALS', sourceFactsConfirmed: true, originalFederalSources: {},
    owner: { accountHolder: 'primary', originalTaxpayer: { firstName: person.firstName, lastName: person.lastName, ssn: person.ssn, dateOfBirth: '1990-01-15' } },
    residence: { sourceReference: 'PRIVATE-ACTUAL-DOMICILE-AND-ABODE-CALENDAR', originalAddress: structuredClone(input.taxpayer.address),
      periods: [{ from: '2025-01-01', through: '2025-12-31', districtCode: '0302', sourceReference: 'PRIVATE-ACTUAL-FULL-YEAR-HOME-RECORD' }],
      lookup: { sourceReference: 'PRIVATE-FICTIONAL-SUPPLIED-2025-FINDER-RESULT', taxYear: 2025, lookupDate: '2026-03-01', originalAddress: structuredClone(input.taxpayer.address), districtCode: '0302', districtName: 'Hillsdale LSD', officialResultMatchedConfirmed: true },
    },
    income: { sourceReference: 'PRIVATE-ACTUAL-COMPLETE-INCOME-CLASSIFICATION', ordinaryCompensationOnlyConfirmed: true, noSelfEmploymentIncomeConfirmed: true, allOtherIncomeSourcesCheckedConfirmed: true, noSpecialWageAdjustmentsConfirmed: true },
    w2Sources: [{ w2Index: 0, sourceReference: 'PRIVATE-CHECKED-ALL-BOXES-COPIES', box14SchoolDistrictReporting: { status: 'none', sourceReference: 'PRIVATE-ACTUAL-BOX14-NO-SD-REPORTING' }, localRows: [{ printedRow: 1, sourceReference: 'PRIVATE-CLASSIFIED-ACTUAL-ROW-1', classification: 'school_district', districtCode: '0302' }] }],
    payments: { sourceReference: 'PRIVATE-COMPLETE-SD100-PAYMENT-HISTORY', allCurrentAndPriorPaymentsIncludedConfirmed: true, withholdingTreatment: 'equal_quarters', paymentRows: [],
      account: { sourceReference: 'PRIVATE-ACTUAL-COMPLETE-SD-AGENCY-ACCOUNT', accountName: 'Avery School', accountSsn: person.ssn, taxYear: 2025, returnType: 'sd100', asOfDate: '2026-04-01', completeAccountConfirmed: true, estimatedPaymentsCredited: '0', priorCreditApplied: '0' },
      priorReturn: { status: 'no_return', sourceReference: 'PRIVATE-EXPLICIT-NO-PRIOR-SD100' },
      priorCreditCarryforward: { status: 'none', sourceReference: 'PRIVATE-ACTUAL-NO-PRIOR-SD-CREDIT' },
      remainingTaxPayment: { status: 'no_remaining_tax', sourceReference: 'PRIVATE-EXPLICIT-SD-TAX-COVERAGE', sourceFactsConfirmed: true },
      currentTiming: { kind: 'expected', expectedDate: '2026-04-15', asOfDate: '2026-04-01' },
      filingExtension: { kind: 'none' }, paymentExtension: { kind: 'none' }, returnKind: 'original', specialMethod: 'regular',
      refundDisposition: { sourceReference: 'PRIVATE-ACTUAL-REFUND-ELECTION', outgoingCarryforward: '0' },
    },
  };
  const complete = { ...input, ohioResidency, ohioPayments, ohioSchoolDistrict: sd };
  bindSchoolDistrictFixture(complete);
  return complete;
}

export function schoolDistrictEstimatedFixture() {
  const input = schoolDistrictSourcesFixture('600');
  const dates = ['2025-04-15', '2025-06-16', '2025-09-15', '2026-01-15'];
  input.ohioSchoolDistrict.payments.paymentRows = dates.map((date, index) => ({
    sourceId: `PRIVATE-SD-ESTIMATE-${index + 1}`, sourceReference: `PRIVATE-SD-BANK-RECEIPT-${index + 1}`,
    accountHolder: 'primary', taxYear: 2025, returnType: 'sd100', kind: 'estimated', date, amount: '100', appliedToThisReturnConfirmed: true,
    original: { accountName: 'Avery School', accountSsn: input.taxpayer.primary.ssn, taxYear: 2025, returnType: 'sd100', kind: 'estimated', date, amount: '100', confirmationNumber: `PRIVATE-SD-CASH-${index + 1}` },
  }));
  input.ohioSchoolDistrict.payments.account.estimatedPaymentsCredited = '400';
  return input;
}
export function addSchoolMunicipalRow(input: SchoolDistrictFixtureInput, municipalFirst = false) {
  const packet = schoolW2Packet(input);
  const school = packet.localRows[0];
  if (!school) throw new Error('Fictional district original row missing');
  const municipal = { printedRow: 2, sourceReference: 'PRIVATE-ACTUAL-MUNICIPAL-ROW', localityNameStatus: 'reported' as const, localityName: 'R0302', wages: '80000', withheld: '50' };
  packet.localReporting = 'multiple';
  packet.localRows = municipalFirst ? [municipal, school] : [school, municipal];
  packet.localRows.forEach((row, index) => { row.printedRow = index + 1; });
  const coverage = input.ohioSchoolDistrict.w2Sources[0];
  if (!coverage) throw new Error('Fictional W2 coverage missing');
  coverage.localRows = packet.localRows.map(row => row.localityName === 'R0302'
    ? { printedRow: row.printedRow ?? 0, sourceReference: 'PRIVATE-MUNICIPAL-CLASSIFICATION', classification: 'municipal', municipalityCode: 'R0302' }
    : { printedRow: row.printedRow ?? 0, sourceReference: 'PRIVATE-SD-CLASSIFICATION', classification: 'school_district', districtCode: '0302' });
  const first = packet.localRows[0];
  if (!first) throw new Error('Fictional original first local row missing');
  Object.assign(schoolW2(input), { localTaxWithheld: first.withheld, localityName: first.localityName });
  bindSchoolDistrictFixture(input);
}
export function schoolDistrictPriorReturn(input: SchoolDistrictFixtureInput, line8 = '0', carry = '0', priorOverpayment = '0') {
  return { status: 'filed_return' as const, sourceReference: 'PRIVATE-ACTUAL-2024-SD100-FILED-ORIGINAL', taxYear: 2024,
    returnType: 'sd100' as const, districtCode: '0302', accountName: 'Avery School', accountSsn: input.taxpayer.primary.ssn,
    filingStatus: 'single' as const, periodStart: '2024-01-01', periodEnd: '2024-12-31', returnKind: 'original' as const,
    filedDate: '2025-04-15', filingExtension: { kind: 'none' as const }, line8, line19: priorOverpayment, electedCreditCarryforward: carry };
}
/** Raw supplied-input omission/contradiction controls; no production source coercion. */
export function schoolRaw(input: SchoolDistrictFixtureInput): Record<string, unknown> {
  return input as unknown as Record<string, unknown>;
}

export function schoolDistrictZeroWithholdingFixture() {
  const input = schoolDistrictEstimatedFixture();
  const local = schoolW2Packet(input).localRows[0];
  if (!local) throw new Error('Fictional original local row missing');
  local.withheld = '0';
  schoolW2(input).localTaxWithheld = '0';
  for (const row of input.ohioSchoolDistrict.payments.paymentRows) {
    row.amount = '250'; row.original.amount = '250';
  }
  input.ohioSchoolDistrict.payments.account.estimatedPaymentsCredited = '1000';
  bindSchoolDistrictFixture(input);
  return input;
}
