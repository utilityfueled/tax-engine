// Spec: spec/federal/schedule-a-medical-mileage-hoh.yaml
import Decimal from 'decimal.js';
import { MedicalMileageHohSchema } from '@/models/medical-mileage-hoh.js';
import type { TaxYearInput } from '@/models/inputs.js';
type Person = Pick<TaxYearInput['taxpayer']['primary'], 'firstName' | 'lastName' | 'ssn' | 'dateOfBirth'>;
export interface MedicalMileageHohContext {
    taxpayer: {
        taxYear: number;
        filingStatus: string;
        primary: Person & {
            usResidencyMonths?: number;
        };
        spouse?: unknown;
        address: TaxYearInput['taxpayer']['address'];
        dependents: ReadonlyArray<Person & {
            relationship: string;
            monthsLivedWithYou: number;
        }>;
    };
    eic?: Pick<NonNullable<TaxYearInput['eic']>, 'claimantEligibility'>;
    standardDeductionFacts?: Pick<NonNullable<TaxYearInput['standardDeductionFacts']>, 'primaryCanBeClaimedAsDependent' | 'nonresidentAlien' | 'dualStatusAlien' | 'shortTaxYear' | 'primaryDeathDate'>;
}
function actualId(value: string) { if (!/^(?!000000000$|000-00-0000$)(?:\d{9}|\d{3}-\d{2}-\d{4})$/.test(value))
    throw new Error('Medical mileage HOH needs an actual correctly formatted taxpayer identity'); return value.replaceAll('-', ''); }
function samePerson(original: Person, actual: Person) { return original.firstName === actual.firstName?.trim() && original.lastName === actual.lastName?.trim() && actualId(original.ssn) === actualId(actual.ssn) && original.dateOfBirth === actual.dateOfBirth; }
/** Validate only the source-bound finite HOH mileage cohort; never infer general HOH qualification. */
export function validateMedicalMileageHohSource(source: unknown, context: MedicalMileageHohContext): void {
    const proof = MedicalMileageHohSchema.parse(source), { taxpayer, standardDeductionFacts: facts } = context;
    const child = taxpayer.dependents[proof.child.dependentIndex];
    const eic = context.eic?.claimantEligibility;
    if (taxpayer.taxYear !== 2026 || taxpayer.filingStatus !== 'head_of_household' || taxpayer.spouse !== undefined
        || taxpayer.primary.usResidencyMonths !== 12 || facts?.primaryCanBeClaimedAsDependent !== false
        || facts.nonresidentAlien !== false || facts.dualStatusAlien !== false || facts.shortTaxYear !== false || facts.primaryDeathDate !== null
        || eic?.primaryNonresidentAlienDuringYear === true || eic?.primaryQualifyingChildOfAnotherTaxpayer === true || eic?.primaryChildless?.qualifyingChildOfAnotherTaxpayer === true
        || (['street', 'apt', 'city', 'state', 'zip'] as const).some(key => (proof.homeAddress[key] ?? '') !== (taxpayer.address[key]?.trim() ?? ''))
        || !samePerson(proof.primary, taxpayer.primary) || !child || !samePerson(proof.child, child)
        || child.relationship !== 'child' || !Number.isInteger(child.monthsLivedWithYou) || child.monthsLivedWithYou < 7 || child.monthsLivedWithYou > 12
        || child.dateOfBirth < '2008-01-01' || child.dateOfBirth > '2025-12-31' || child.dateOfBirth <= taxpayer.primary.dateOfBirth
        || taxpayer.dependents.filter(row => actualId(row.ssn) === actualId(proof.child.ssn)).length !== 1
        || proof.primary.ssn.replaceAll('-', '') === proof.child.ssn.replaceAll('-', '')) {
        throw new Error('Medical mileage HOH needs matching actual primary and qualifying-child originals, known full-year resident eligibility and no spouse or special qualification method');
    }
    // Doubling may add a digit. Keep every original cent for the strict half test.
    const Money = Decimal.clone({ precision: Math.max(proof.totalEligibleHomeCosts.length, proof.paidByPrimary.length) + 1 });
    const total = new Money(proof.totalEligibleHomeCosts);
    const paid = new Money(proof.paidByPrimary);
    if (total.lte(0) || paid.gt(total) || paid.times(2).lte(total))
        throw new Error('Medical mileage HOH requires actual eligible home upkeep and primary payments strictly greater than half, not more than total');
}
