import { z } from 'zod';
import { ScheduleCStandardMileageSchema } from '@/models/inputs';
import { reconcileScheduleCStandardMileage } from '@/utils/schedule-c-standard-mileage';
import { parseGuidedCurrency } from './guided-currency';
import type { BusinessSourceData } from './guided-business-facts';
import type { GuidedFlowState, SelfEmploymentSectionData } from './guided-interview-flow';

export const businessMileageConfirmations = {
  ownedVehicleFirstBusinessYearAndElectionConfirmed: 'I own the vehicle and chose standard mileage in its first business year',
  writtenCompleteMileageLogConfirmed: 'I kept a complete written mileage log',
  eligibleBusinessParkingAndTollsConfirmed: 'Parking and tolls are eligible business costs',
  noOtherActivityAllocationReimbursementsOrVehicleDeductionsConfirmed: 'No reimbursements, other vehicle deductions or other business use',
  noDispositionInServiceYearConfirmed: 'I did not dispose of this vehicle in 2026',
} as const;

const unanswered = {
  ownedVehicleFirstBusinessYearAndElectionConfirmed: null,
  writtenCompleteMileageLogConfirmed: null,
  eligibleBusinessParkingAndTollsConfirmed: null,
  noOtherActivityAllocationReimbursementsOrVehicleDeductionsConfirmed: null,
  noDispositionInServiceYearConfirmed: null,
};
const unansweredPartIV = {
  offDutyPersonalUseAvailable: null,
  otherPersonalVehicleAvailable: null,
  notRequiredToFileForm4562ForBusiness: null,
};
const answer = z.boolean().nullable();
export const businessMileageDraftSchema = ScheduleCStandardMileageSchema.extend({
  logReference: z.string(),
  placedInService: z.string(),
  ownedVehicleFirstBusinessYearAndElectionConfirmed: answer,
  writtenCompleteMileageLogConfirmed: answer,
  eligibleBusinessParkingAndTollsConfirmed: answer,
  noOtherActivityAllocationReimbursementsOrVehicleDeductionsConfirmed: answer,
  noDispositionInServiceYearConfirmed: answer,
  totalMiles: z.string(),
  commutingMiles: z.string(),
  otherPersonalMiles: z.string(),
  parkingAndTolls: z.string(),
  entries: z.array(z.strictObject({ date: z.string(), miles: z.string() })).max(365),
  partIV: z.strictObject({
    offDutyPersonalUseAvailable: answer,
    otherPersonalVehicleAvailable: answer,
    notRequiredToFileForm4562ForBusiness: answer,
  }),
});
export type BusinessMileageDraft = z.infer<typeof businessMileageDraftSchema>;

export function newBusinessMileageDraft(): BusinessMileageDraft {
  return {
    taxYear: 2026, logReference: '', placedInService: '', totalMiles: '', commutingMiles: '', otherPersonalMiles: '',
    parkingAndTolls: '', entries: [{ date: '', miles: '' }], ...unanswered, partIV: { ...unansweredPartIV },
  };
}

export function clearBusinessMileageConfirmations(draft: BusinessMileageDraft): BusinessMileageDraft {
  return { ...draft, ...unanswered, partIV: { ...unansweredPartIV } };
}

export function businessMileageOriginals(facts: BusinessSourceData | undefined) {
  const parsed = businessMileageDraftSchema.safeParse(facts?.standardMileage);
  return {
    owner: facts?.accountHolder, method: facts?.accountingMethod, activity: facts?.activityDescription,
    code: facts?.businessCode, name: facts?.businessName, ein: facts?.ein,
    log: parsed.success ? { ...clearBusinessMileageConfirmations(parsed.data), partIV: undefined } : undefined,
  };
}

export function supportsBusinessMileage(state: GuidedFlowState | undefined, facts: BusinessSourceData | undefined) {
  return state?.taxYear === 2026 && state.segmentation.filingStatus === 'single'
    && state.segmentation.stateCode === null && !state.sectionData['personal-info']?.spouse
    && facts?.accountHolder === 'primary' && facts.accountingMethod === 'cash';
}

export function readGuidedBusinessMileage(data: SelfEmploymentSectionData | undefined, state: GuidedFlowState | undefined) {
  const facts = data?.businessFacts;
  if (facts?.standardMileage === undefined) return undefined;
  if (!supportsBusinessMileage(state, facts)) {
    throw new Error('Business mileage needs a 2026 single-taxpayer federal return and a primary-owner cash business.');
  }
  const careBenefits = state?.sectionData.credits?.dependentCareBenefits;
  if (state?.sectionData.adjustments?.foreignIncome !== undefined
    || careBenefits?.selfEmployedBenefits?.some(row => row.schedule === 'schedule-c' || row.sourceId === 'scheduleC')
    || careBenefits?.deductionAllocations?.some(row => row.schedule === 'schedule-c' || row.sourceId === 'scheduleC')
    || facts.depreciationMethod === 'assets' || facts.depreciationMethod === 'passenger'
    || facts.macrsAssets !== undefined || facts.passengerSources !== undefined
    || facts.scheduleCSourceFacts?.depreciation !== undefined || facts.scheduleCSourceFacts?.passengerFirstYear !== undefined
    || facts.scheduleCSourceFacts?.interest !== undefined
    || [data?.expenses.carAndTruck, facts.depreciation, facts.businessInterest].some(value => !parseGuidedCurrency(value).isZero())) {
    throw new Error('Reconcile the mileage log with any separate vehicle expenses, depreciation, interest, foreign income or business care-benefit allocation.');
  }
  const saved = businessMileageDraftSchema.safeParse(facts.standardMileage);
  if (!saved.success) throw new Error('Replace the saved business mileage log with a supported source record.');
  const { partIV, ...draft } = saved.data;
  const hasPartIV = Object.values(partIV).some(value => value !== null);
  if (hasPartIV && (partIV.offDutyPersonalUseAvailable === null || partIV.otherPersonalVehicleAvailable === null
    || partIV.notRequiredToFileForm4562ForBusiness !== true)) {
    throw new Error('Complete both Part IV vehicle-availability answers and confirm Form 4562 is unnecessary, or clear the optional Part IV answers.');
  }
  const packet = ScheduleCStandardMileageSchema.safeParse({
    ...draft,
    totalMiles: draft.totalMiles.trim(),
    commutingMiles: draft.commutingMiles.trim(),
    otherPersonalMiles: draft.otherPersonalMiles.trim(),
    parkingAndTolls: draft.parkingAndTolls.trim().replace(/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/, text => text.replaceAll(',', '')),
    entries: draft.entries.map(row => ({ date: row.date, miles: row.miles.trim() })),
    partIV: hasPartIV ? partIV : undefined,
  });
  if (!packet.success) throw new Error('Complete the business mileage reference, actual dates and distances, parking and tolls, and all five confirmations.');
  return { packet: packet.data, deduction: reconcileScheduleCStandardMileage(packet.data).deduction };
}
