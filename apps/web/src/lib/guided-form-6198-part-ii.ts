import { calculateScheduleE } from '@/engine/schedules/schedule-e';
import { Form6198PartII2026Schema } from '@/models/form-6198-part-ii-2026';
import { ScheduleK1Schema } from '@/models/inputs';
import { d } from '@/utils/decimal';
import type { GuidedFlowState } from './guided-interview-flow';
import { guidedSourceValuesChanged } from './guided-source-confirmation';
import { combineGivenNameWithMiddleInitial } from './guided-taxpayer-identity';

export interface GuidedForm6198PartIIData {
  sourceTaxYear?: string;
  accountHolder?: '' | 'primary' | 'spouse';
  recipientName?: string;
  recipientTaxpayerIdLast4?: string;
  activityName?: string;
  entityEin?: string;
  originalK1Reference?: string;
  openingBasisReference?: string;
  changeWorksheetReference?: string;
  box1Loss?: string;
  openingAdjustedBasis?: string;
  currentOutsideBasis?: { reference?: string; availableForLosses?: string };
  increases?: string;
  decreases?: string;
  section199AQBI?: string;
  selfEmploymentEarnings?: string;
  selfEmploymentNetEarningsAfterAdjustments?: string;
  selfEmploymentIncomeType?: '' | 'farm' | 'nonfarm';
  oneDomesticNonPtpPartnershipConfirmed?: boolean | null;
  allOtherAmountsZeroConfirmed?: boolean | null;
  noPriorBasisOrPassiveLossConfirmed?: boolean | null;
  ordinaryNonpassivePartIIConfirmed?: boolean | null;
  noPriorAtRiskLossOrRecaptureConfirmed?: boolean | null;
  noQbiOrSelfEmploymentAmountsConfirmed?: boolean | null;
  sourceFactsConfirmed?: boolean | null;
}

const filingStatuses = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately',
  hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' } as const;

function sourceAmount(value: string | undefined, label: string): string {
  if (typeof value !== 'string' || !/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value.trim())) {
    throw new Error(`Enter the actual ${label} in dollars and cents, including zero when confirmed.`);
  }
  return value.trim().replaceAll(',', '');
}

/** Project the ordinary original once, then use the same basis and at-risk checks as the return. */
export function buildGuidedForm6198PartII(state: GuidedFlowState) {
  const { sectionData, segmentation, taxYear } = state;
  const adjustments = sectionData.adjustments;
  const source = adjustments?.form6198PartII;
  if (source === undefined) return undefined;
  if (taxYear !== 2026 || source?.sourceTaxYear !== '2026') {
    throw new Error('Confirm the actual 2026 year shown on the Schedule K-1 and workpapers.');
  }
  const personal = sectionData['personal-info'];
  if (!personal || !segmentation.filingStatus) throw new Error('Confirm the return household and filing status for Form 6198.');
  if (adjustments?.k1LossSources !== undefined || sectionData.deductions?.k1CharitableSources !== undefined
    || sectionData['other-taxes']?.foreignTaxElection?.qualifiedK3Statements?.length
    || adjustments?.codNolSources?.attributeSources?.currentMinimumTaxCredit?.sourceYearCalculation !== undefined) {
    throw new Error('Reconcile the competing K-1 source packets. This Form 6198 method requires a single independently verified K-1.');
  }
  if (source.sourceFactsConfirmed !== true || source.oneDomesticNonPtpPartnershipConfirmed !== true
    || source.allOtherAmountsZeroConfirmed !== true || source.noPriorBasisOrPassiveLossConfirmed !== true) {
    throw new Error('Confirm the actual single domestic partnership original, other K-1 amounts and prior basis and passive loss history.');
  }
  const currentOutsideBasis = source.currentOutsideBasis;
  let outsideBasisProof;
  if (currentOutsideBasis !== undefined) {
    if (!currentOutsideBasis?.reference?.trim()) throw new Error('Enter the original current outside-basis workpaper reference.');
    const availableForLosses = sourceAmount(currentOutsideBasis.availableForLosses, 'current outside basis available for losses');
    if (d(availableForLosses).lt(0)) throw new Error('Enter a nonnegative original current outside-basis amount.');
    outsideBasisProof = { reference: currentOutsideBasis.reference, availableForLosses };
  }
  const partII = Form6198PartII2026Schema.safeParse({
    taxYear, activityName: source.activityName, entityEin: source.entityEin, accountHolder: source.accountHolder,
    recipientName: source.recipientName, recipientTaxpayerIdLast4: source.recipientTaxpayerIdLast4,
    originalK1Reference: source.originalK1Reference, openingBasisReference: source.openingBasisReference,
    changeWorksheetReference: source.changeWorksheetReference,
    ordinaryNonpassivePartIIConfirmed: source.ordinaryNonpassivePartIIConfirmed,
    noPriorAtRiskLossOrRecaptureConfirmed: source.noPriorAtRiskLossOrRecaptureConfirmed,
    noQbiOrSelfEmploymentAmountsConfirmed: source.noQbiOrSelfEmploymentAmountsConfirmed,
    box1Loss: sourceAmount(source.box1Loss, 'Schedule K-1 Box 1 loss'),
    openingAdjustedBasis: sourceAmount(source.openingAdjustedBasis, 'Form 6198 line 6 opening adjusted basis'),
    ...(outsideBasisProof ? { currentOutsideBasis: outsideBasisProof } : {}),
    increases: sourceAmount(source.increases, 'Form 6198 line 7 increases'),
    decreases: sourceAmount(source.decreases, 'Form 6198 line 9 decreases'),
  });
  if (!partII.success) throw new Error('Confirm the original Form 6198 activity, owner, record references and Part II facts.');

  const section199AQBI = sourceAmount(source.section199AQBI, 'Schedule K-1 Section 199A qualified business income');
  const selfEmploymentEarnings = sourceAmount(source.selfEmploymentEarnings, 'Schedule K-1 Box 14 Code A');
  const selfEmploymentNetEarningsAfterAdjustments = sourceAmount(source.selfEmploymentNetEarningsAfterAdjustments, 'adjusted partner self-employment earnings');
  const selfEmploymentIncomeType = source.selfEmploymentIncomeType;
  if (![section199AQBI, selfEmploymentEarnings, selfEmploymentNetEarningsAfterAdjustments].every(amount => d(amount).isZero())
    || (selfEmploymentIncomeType !== 'farm' && selfEmploymentIncomeType !== 'nonfarm')) {
    throw new Error('Confirm the actual farm or nonfarm classification and known zero Section 199A and self-employment amounts.');
  }

  const workpaper = partII.data;
  const original = ScheduleK1Schema.parse({
    taxYear, partnershipName: workpaper.activityName, partnershipEIN: workpaper.entityEin, accountHolder: workpaper.accountHolder,
    entityType: 'partnership', isPassiveActivity: false, isPubliclyTradedPartnership: false, isForeignPartnership: false,
    ordinaryIncome: workpaper.box1Loss, beginningBasis: workpaper.openingAdjustedBasis,
    section199AQBI, selfEmploymentEarnings, selfEmploymentNetEarningsAfterAdjustments, selfEmploymentIncomeType,
    selfEmploymentFactsConfirmed: workpaper.noQbiOrSelfEmploymentAmountsConfirmed,
    form6198: { partII2026: workpaper },
  });
  const taxpayer = { taxYear, filingStatus: filingStatuses[segmentation.filingStatus],
    primary: { firstName: combineGivenNameWithMiddleInitial(personal.firstName, personal.middleName), lastName: personal.lastName, ssn: personal.ssn },
    ...(segmentation.filingStatus === 'mfj' && personal.spouse ? { spouse: personal.spouse } : {}),
  };
  calculateScheduleE({ taxpayer, scheduleK1: [original], rentalProperties: [], form1099Misc: [] });
  return original;
}

export function guidedForm6198PartIIFactErrors(state: GuidedFlowState): Record<string, string> {
  try { buildGuidedForm6198PartII(state); return {}; }
  catch (error) { return { form6198PartII: error instanceof Error ? error.message : 'Reconcile the actual Form 6198 records.' }; }
}

export function invalidateEditedGuidedForm6198PartII(previous: GuidedForm6198PartIIData | undefined, next: GuidedForm6198PartIIData | undefined) {
  return previous && next && guidedSourceValuesChanged(previous, next) ? { ...next, sourceFactsConfirmed: null } : next;
}
