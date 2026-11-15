import { z } from 'zod';
const text = z.string().trim().min(1).max(250);
const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Use an actual calendar date');
const identity = z.strictObject({ firstName: text, lastName: text, ssn: z.string().regex(/^(?!000-00-0000$|000000000$)(?:\d{9}|\d{3}-\d{2}-\d{4})$/), dateOfBirth: civilDate });
const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/);
/** New-route original proof only; not a general filing-status election or validation. */
export const MedicalMileageHohSchema = z.strictObject({
    taxYear: z.literal(2026), sourceReference: text, primary: identity,
    homeAddress: z.strictObject({ street: text, apt: z.string().trim().min(1).optional(), city: text, state: z.string().regex(/^[A-Z]{2}$/), zip: z.string().regex(/^\d{5}(?:-\d{4})?$/) }),
    child: identity.extend({ dependentIndex: z.number().int().min(0).max(19), relationship: z.literal('child'), actualNightsInHome: z.number().int().min(183).max(365) }),
    totalEligibleHomeCosts: money, paidByPrimary: money,
    unmarriedAndNotSurvivingSpouseConfirmed: z.literal(true),
    fullYearResidentAndNotDependentConfirmed: z.literal(true),
    qualifyingChildTestsConfirmed: z.literal(true),
    noOtherQualifyingClaimantConfirmed: z.literal(true),
    noSpecialQualificationRulesConfirmed: z.literal(true),
    eligibleUpkeepCostsAndPaymentsCompleteConfirmed: z.literal(true),
    primaryPaymentsFromOwnFundsConfirmed:z.literal(true),
});
export type MedicalMileageHoh = z.infer<typeof MedicalMileageHohSchema>;
