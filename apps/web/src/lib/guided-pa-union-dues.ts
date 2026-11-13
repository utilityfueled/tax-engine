import { originalOwner, originalPayroll, unionDuesWageSource, validateGuidedPAUnionDues } from '@/engine/state/pa-guided-union-dues';
import type { TaxYearInput } from '@/models/inputs';
import type { PAOrdinaryEmployeeSources } from '@/models/pa-ordinary-employee-sources';
import type { PAResidencySources } from '@/models/pa-residency';

type Employer = PAOrdinaryEmployeeSources['employers'][number];
type CalendarDay = Employer['calendar'][number];
type Expense = Employer['ue']['expenses'][number];
type DayClassification = 'working' | Exclude<CalendarDay['nonworkingReason'], '' | 'other_employer'>;

export function createGuidedPAUnionDues(input: TaxYearInput, data: PAResidencySources): PAOrdinaryEmployeeSources {
  const parent = unionDuesWageSource(input, data);
  if (!parent) throw new Error('Complete the one actual Pennsylvania W-2 and PA-only original payroll first.');
  const { wage, original } = parent;
  return {
    collectionMethod: 'guided_union_dues_2025',
    sourceTaxYear: wage.sourceTaxYear, sourceReference: '', sourceFactsConfirmed: null, asOfDate: '',
    owner: { accountHolder: 'primary', originalTaxpayer: originalOwner(input) },
    employers: [{
      originalIndex: wage.originalIndex, sourceTaxYear: wage.sourceTaxYear, sourceReference: wage.sourceReference,
      originalW2: structuredClone(original),
      sourceFactsConfirmed: wage.sourceFactsConfirmed, currentUncorrectedNonvoidOriginalConfirmed: wage.currentUncorrectedNonvoidOriginalConfirmed,
      allOriginalBoxesKnownConfirmed: wage.allOriginalBoxesKnownConfirmed, ordinaryCashCompensationOnlyConfirmed: wage.ordinaryCashCompensationOnlyConfirmed,
      employer: { name: original.employer.name, ein: original.employer.ein, address: '', telephone: '', jobDuties: '' },
      allocationMethod: 'working_days', workplaceBasis: 'suitable_PA', specialInterstateOccupation: 'none',
      employmentPeriods: [{ from: '', through: '', sourceReference: '' }],
      statement: { documentReference: '', documentAvailableConfirmed: null, signed: null, signerName: '', signerRole: '', signedOn: '',
        fullCalendarAndOutsideDaysVerifiedConfirmed: null, outsideWorkDates: [], w2CorrectionExplanation: '' },
      calendar: [], payroll: originalPayroll(wage),
      ue: { sourceReference: '', allExpenseAndReimbursementSourcesReviewedConfirmed: null, otherExpenseClassesConfirmedNone: null,
        expenses: [], reimbursements: [] },
    }],
  };
}

export function emptyGuidedPAUnionDuesReceipt(): Expense {
  return { sourceReference: '', receiptReference: '', paidOn: '', category: 'union_dues', description: '', amount: '',
    ordinaryCustomaryConfirmed: null, actuallyPaidConfirmed: null, reasonableConfirmed: null, necessaryConfirmed: null,
    directlyRelatedConfirmed: null, employerRequiredConfirmed: null, notProvidedByEmployerConfirmed: null,
    notEverydayClothingConfirmed: null, requiredLicenseOrUnionMembershipConfirmed: null, usefulLifeAtMostOneYearConfirmed: null,
    reimbursementMethod: 'none', reimbursementReferences: [] };
}

export function applyUnionDuesReceiptEligibility(value: boolean | null): Partial<Expense> {
  return { ordinaryCustomaryConfirmed: value, actuallyPaidConfirmed: value, reasonableConfirmed: value, necessaryConfirmed: value,
    directlyRelatedConfirmed: value, employerRequiredConfirmed: value, notProvidedByEmployerConfirmed: value,
    requiredLicenseOrUnionMembershipConfirmed: value };
}

export function documentedUnionDuesCalendarRange(from: string, through: string, reference: string, classification: '' | DayClassification): CalendarDay[] {
  const start = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${through}T00:00:00Z`);
  if (!/^2025-\d{2}-\d{2}$/.test(from) || !/^2025-\d{2}-\d{2}$/.test(through) || !Number.isFinite(start)
    || !Number.isFinite(end) || start > end || new Date(start).toISOString().slice(0, 10) !== from
    || new Date(end).toISOString().slice(0, 10) !== through || !reference.trim() || !classification) {
    throw new Error('Enter actual 2025 calendar dates, the original reference and a classification for every date in the range.');
  }
  const result: CalendarDay[] = [];
  for (let day = start; day <= end; day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    result.push({ date, sourceReference: `${reference.trim()} (${date})`, kind: classification === 'working' ? 'working' : 'nonworking',
      nonworkingReason: classification === 'working' ? '' : classification, travelClassification: 'none',
      locations: classification === 'working' ? [{ state: 'PA', compensatedWorkConfirmed: true, employerRequiredOutsideWork: null, transitOnly: false }] : [] });
  }
  return result;
}

export function prepareGuidedPAUnionDues(input: TaxYearInput, data: PAResidencySources): PAOrdinaryEmployeeSources {
  const packet = validateGuidedPAUnionDues(input, data);
  return { ...packet, sourceFactsConfirmed: true };
}
