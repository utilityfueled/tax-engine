import { z } from 'zod';
import { MedicalMileageHohSchema } from '@/models/medical-mileage-hoh';
import { validateMedicalMileageHohSource } from '@/engine/schedules/schedule-a-medical-mileage-hoh';
import type { PersonalInfoData } from './guided-interview-flow';
export const hohMedicalConfirmations = {
    unmarriedAndNotSurvivingSpouseConfirmed: 'Unmarried at year end and not a qualifying surviving spouse',
    fullYearResidentAndNotDependentConfirmed: 'Full-year U.S. citizen or resident, not another taxpayer’s dependent or qualifying child',
    qualifyingChildTestsConfirmed: 'Child unmarried all year, did not file a joint return, is a U.S. citizen/resident/national, and did not provide over half their own support',
    noOtherQualifyingClaimantConfirmed: 'No other person qualifies for this child or uses the child for head of household',
    noSpecialQualificationRulesConfirmed: 'No custody release, temporary absence, birth/death, adoption/foster, kidnapping or other special qualification rule',
    eligibleUpkeepCostsAndPaymentsCompleteConfirmed: 'All eligible annual home-upkeep costs and actual primary payments are complete',
    primaryPaymentsFromOwnFundsConfirmed:'Primary payments came from my own funds, with no child-benefit, public-benefit, shared-funds or other-person allocation',
} as const;
const answer = z.boolean().nullable();
const person = z.strictObject({ firstName: z.string(), lastName: z.string(), ssn: z.string(), dateOfBirth: z.string() });
export const medicalMileageHohDraftSchema = z.strictObject({
    taxYear: z.string(), sourceReference: z.string(), primary: person,
    homeAddress: z.strictObject({ street: z.string(), apt: z.string().optional(), city: z.string(), state: z.string(), zip: z.string() }),
    child: person.extend({ dependentIndex: z.string(), relationship: z.string(), actualNightsInHome: z.string() }),
    totalEligibleHomeCosts: z.string(), paidByPrimary: z.string(),
    unmarriedAndNotSurvivingSpouseConfirmed: answer, fullYearResidentAndNotDependentConfirmed: answer, qualifyingChildTestsConfirmed: answer,
    noOtherQualifyingClaimantConfirmed: answer, noSpecialQualificationRulesConfirmed: answer, eligibleUpkeepCostsAndPaymentsCompleteConfirmed: answer,primaryPaymentsFromOwnFundsConfirmed:answer,
});
export type MedicalMileageHohDraft = z.infer<typeof medicalMileageHohDraftSchema>;
export function clearMedicalMileageHohConfirmations(source: MedicalMileageHohDraft): MedicalMileageHohDraft { return { ...source, unmarriedAndNotSurvivingSpouseConfirmed: null, fullYearResidentAndNotDependentConfirmed: null, qualifyingChildTestsConfirmed: null, noOtherQualifyingClaimantConfirmed: null, noSpecialQualificationRulesConfirmed: null, primaryPaymentsFromOwnFundsConfirmed:null,eligibleUpkeepCostsAndPaymentsCompleteConfirmed: null }; }
export function newMedicalMileageHohDraft(): MedicalMileageHohDraft { return clearMedicalMileageHohConfirmations({ taxYear: '', sourceReference: '', homeAddress: { street: '', city: '', state: '', zip: '' }, primary: { firstName: '', lastName: '', ssn: '', dateOfBirth: '' }, child: { dependentIndex: '', relationship: '', firstName: '', lastName: '', ssn: '', dateOfBirth: '', actualNightsInHome: '' }, totalEligibleHomeCosts: '', paidByPrimary: '', unmarriedAndNotSurvivingSpouseConfirmed: null, fullYearResidentAndNotDependentConfirmed: null, qualifyingChildTestsConfirmed: null, noOtherQualifyingClaimantConfirmed: null, noSpecialQualificationRulesConfirmed: null, primaryPaymentsFromOwnFundsConfirmed:null,eligibleUpkeepCostsAndPaymentsCompleteConfirmed: null }); }
/** Convert a retained editable or confirmed household record for source editing. */
export function readGuidedMedicalMileageHoh(value: unknown): MedicalMileageHohDraft | undefined {
    const draft = medicalMileageHohDraftSchema.safeParse(value);
    if (draft.success) return draft.data;
    const original = MedicalMileageHohSchema.safeParse(value);
    if (!original.success) return undefined;
    const { taxYear, child, ...rest } = original.data;
    return { ...rest, taxYear: String(taxYear), child: { ...child, dependentIndex: String(child.dependentIndex), actualNightsInHome: String(child.actualNightsInHome) } };
}
function integer(value: string) { if (!/^(?:0|[1-9]\d*)$/.test(value))
    throw new Error('Enter the actual household original year, child index and nights'); const result = Number(value); if (!Number.isSafeInteger(result))
    throw new Error('Enter actual whole household source counts'); return result; }
function money(value: string) { return value.trim().replace(/^(\d{1,3}(?:,\d{3})+)(\.\d{1,2})?$/, text => text.replaceAll(',', '')); }
export function normalizeGuidedMedicalMileageHoh(source: unknown) {
    const draft = medicalMileageHohDraftSchema.parse(source);
    return MedicalMileageHohSchema.parse({ ...draft, taxYear: integer(draft.taxYear), child: { ...draft.child, dependentIndex: integer(draft.child.dependentIndex), actualNightsInHome: integer(draft.child.actualNightsInHome) }, totalEligibleHomeCosts: money(draft.totalEligibleHomeCosts), paidByPrimary: money(draft.paidByPrimary) });
}
/** No household identity, eligibility or amount is manufactured from a status selection. */
export function buildGuidedMedicalMileageHoh(source: MedicalMileageHohDraft | undefined, personal: PersonalInfoData | undefined) {
    if (!source || !personal || !personal.dateOfBirth)
        throw new Error('Complete the original head-of-household evidence and actual household identities');
    const proof = normalizeGuidedMedicalMileageHoh(source);
    const facts = personal.standardDeductionFacts;
    const knownBoolean = (value: boolean | null | undefined) => typeof value === 'boolean' ? value : undefined;
    validateMedicalMileageHohSource(proof, {
        taxpayer: { taxYear: 2026, filingStatus: 'head_of_household', primary: { firstName: personal.firstName, lastName: personal.lastName, ssn: personal.ssn, dateOfBirth: personal.dateOfBirth, usResidencyMonths: /^\d+$/.test(personal.usResidencyMonths ?? '') ? Number(personal.usResidencyMonths) : undefined }, spouse: personal.spouse, address: { street: personal.addressLine1, apt: personal.addressLine2?.trim() || undefined, city: personal.city, state: personal.state, zip: personal.zip },
            dependents: (personal.dependents ?? []).map(row => ({ ...row, monthsLivedWithYou: /^\d+$/.test(row.monthsLivedWithYou) ? Number(row.monthsLivedWithYou) : NaN })) },
        standardDeductionFacts: { primaryCanBeClaimedAsDependent: knownBoolean(facts?.primaryCanBeClaimedAsDependent), nonresidentAlien: knownBoolean(facts?.nonresidentAlien), dualStatusAlien: knownBoolean(facts?.dualStatusAlien), shortTaxYear: knownBoolean(facts?.shortTaxYear), primaryDeathDate: facts?.primaryDeceased === false ? null : facts?.primaryDeathDate },
        eic: { claimantEligibility: { primaryNonresidentAlienDuringYear: knownBoolean(personal.eicClaimantEligibility?.primaryNonresidentAlienDuringYear), primaryQualifyingChildOfAnotherTaxpayer: knownBoolean(personal.eicClaimantEligibility?.primaryQualifyingChildOfAnotherTaxpayer), primaryChildless: { qualifyingChildOfAnotherTaxpayer: knownBoolean(personal.eicClaimantEligibility?.primaryChildless?.qualifyingChildOfAnotherTaxpayer) } } },
    });
    return proof;
}
