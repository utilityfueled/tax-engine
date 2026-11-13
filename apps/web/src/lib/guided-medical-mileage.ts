import { z } from 'zod';
import { ScheduleAMedicalMileageSchema } from '@/models/inputs';
import { parseGuidedCurrency } from './guided-currency';
import type { DeductionData, FilingStatus } from './guided-interview-flow';

export const medicalMileageConfirmations = {
  taxpayerOwnEssentialQualifiedCareConfirmed: 'Trips were essential to my own qualified medical care',
  singleVehicleMileageAndEligibleParkingTollsConfirmed: 'One vehicle and only eligible parking and tolls',
  allTransportationCostsPaidAndUnreimbursedConfirmed: 'All claimed transportation costs were paid and unreimbursed',
  noActualVehicleCostsOrDuplicatedTaxBenefitsConfirmed: 'No actual vehicle costs or duplicate tax benefits',
} as const;

const unansweredConfirmations = {
  taxpayerOwnEssentialQualifiedCareConfirmed: null,
  singleVehicleMileageAndEligibleParkingTollsConfirmed: null,
  allTransportationCostsPaidAndUnreimbursedConfirmed: null,
  noActualVehicleCostsOrDuplicatedTaxBenefitsConfirmed: null,
} as const;

const answer = z.boolean().nullable();
export const medicalMileageDraftSchema = ScheduleAMedicalMileageSchema.extend({
  logReference: z.string(),
  taxpayerOwnEssentialQualifiedCareConfirmed: answer,
  singleVehicleMileageAndEligibleParkingTollsConfirmed: answer,
  allTransportationCostsPaidAndUnreimbursedConfirmed: answer,
  noActualVehicleCostsOrDuplicatedTaxBenefitsConfirmed: answer,
  otherEligibleUnreimbursedMedicalExpenses: z.string(),
  parkingAndTolls: z.string(),
  entries: z.array(z.strictObject({ date: z.string(), miles: z.string() })).max(365),
});
export type MedicalMileageDraft = z.infer<typeof medicalMileageDraftSchema>;

export function newMedicalMileageDraft(): MedicalMileageDraft {
  return {
    taxYear: 2026, logReference: '', otherEligibleUnreimbursedMedicalExpenses: '', parkingAndTolls: '',
    entries: [{ date: '', miles: '' }], ...unansweredConfirmations,
  };
}

export function clearMedicalMileageConfirmations(draft: MedicalMileageDraft): MedicalMileageDraft {
  return { ...draft, ...unansweredConfirmations };
}

export function medicalMileageOriginals(draft: MedicalMileageDraft | undefined) {
  const parsed = medicalMileageDraftSchema.safeParse(draft);
  return parsed.success ? clearMedicalMileageConfirmations(parsed.data) : undefined;
}

export function supportsMedicalMileage(taxYear?: number | null, filingStatus?: FilingStatus | null, spouse?: unknown) {
  return taxYear === 2026 && filingStatus === 'single' && !spouse;
}

export function buildGuidedMedicalMileage(data: DeductionData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, spouse?: unknown) {
  if (data?.method !== 'itemized' || data.medicalMileage === undefined) return undefined;
  if (!supportsMedicalMileage(taxYear, filingStatus, spouse)) {
    throw new Error('Medical mileage needs a matching 2026 single-taxpayer return.');
  }
  if (!parseGuidedCurrency(data.medicalExpenses).isZero()) {
    throw new Error('Reconcile the saved medical total with the mileage log. Enter other eligible costs in the log and clear the separate total.');
  }
  const draft = medicalMileageDraftSchema.safeParse(data.medicalMileage);
  if (!draft.success) throw new Error('Replace the saved medical mileage log with a supported source record.');
  const knownAmount = (value: string) => value.trim().replace(/^(\d{1,3}(?:,\d{3})+)(\.\d{1,2})?$/, text => text.replaceAll(',', ''));
  const result = ScheduleAMedicalMileageSchema.safeParse({
    ...draft.data,
    otherEligibleUnreimbursedMedicalExpenses: knownAmount(draft.data.otherEligibleUnreimbursedMedicalExpenses),
    parkingAndTolls: knownAmount(draft.data.parkingAndTolls),
    entries: draft.data.entries.map(row => ({ date: row.date, miles: row.miles.trim() })),
  });
  if (!result.success) {
    throw new Error('Complete the medical mileage reference, one eligible mileage total per date, both actual dollar amounts and all four confirmations.');
  }
  return result.data;
}

export function guidedMedicalMileageErrors(...args: Parameters<typeof buildGuidedMedicalMileage>): Record<string, string> {
  try { buildGuidedMedicalMileage(...args); }
  catch (error) { return { medicalMileage: error instanceof Error ? error.message : 'Check the medical mileage source.' }; }
  return {};
}
