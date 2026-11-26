// Spec: spec/federal/schedule-a-medical-mileage-hoh.yaml
import { describe, expect, it } from 'vitest';
import { calculateScheduleA } from '@/engine/schedules/schedule-a.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { d } from '@/utils/decimal.js';
import { assertPdfExportAllowed } from '@/pdf/export-policy.js';
import { medicalMileageHohFixture } from '../../fixtures/medical-mileage-hoh.js';
function present<T,>(value: T | undefined): T { if(value===undefined)throw new Error('Missing explicit fictional source value'); return value; }
function run(raw = medicalMileageHohFixture()) { const input = TaxYearInputSchema.parse(raw); return calculateScheduleA(input, d('20000'), input.taxpayer.filingStatus, FEDERAL_2026_CONSTANTS); }
describe('finite HOH own-care medical mileage', () => {
    it('admits matching actual HOH own-care sources with exact upkeep and mileage arithmetic', () => {
        const raw = medicalMileageHohFixture();
        const before = JSON.stringify(raw);
        const result = run(raw);
        expect(result.lines.find(row => row.form === 'Sched A' && row.line === '1')?.value.toFixed()).toBe('1506.61375');
        expect(result.medicalDeduction.toFixed()).toBe('6.61375');
        expect(JSON.stringify(raw)).toBe(before);
        for (const [total, paid] of [['20000.00', '10000.00'], ['20000.02', '10000.01']]) {
            const changed = medicalMileageHohFixture();
            changed.scheduleA.medicalMileage.headOfHouseholdSources.totalEligibleHomeCosts = present(total);
            changed.scheduleA.medicalMileage.headOfHouseholdSources.paidByPrimary = present(paid);
            expect(() => run(changed)).toThrow(/household|upkeep/i);
        }
    });
    it('compares one cent below, at and above half of long original household costs', () => {
        const raw = medicalMileageHohFixture();
        const proof = raw.scheduleA.medicalMileage.headOfHouseholdSources;
        proof.totalEligibleHomeCosts = '100000000000000000006.02';
        proof.paidByPrimary = '50000000000000000003.00';
        expect(() => run(raw)).toThrow(/home upkeep/i);
        proof.paidByPrimary = '50000000000000000003.01';
        expect(() => run(raw)).toThrow(/home upkeep/i);
        proof.paidByPrimary = '50000000000000000003.02';
        expect(run(raw).medicalDeduction.toFixed()).toBe('6.61375');
    });
    it('rejects incomplete contradictory and mismatched HOH originals without inferring zero', () => {
        const changes: Array<(raw: ReturnType<typeof medicalMileageHohFixture>) => void> = [
            raw => { Reflect.deleteProperty(raw.scheduleA.medicalMileage, 'headOfHouseholdSources'); },
            raw => { Reflect.deleteProperty(raw.scheduleA.medicalMileage.headOfHouseholdSources, 'paidByPrimary'); },
            raw => { raw.scheduleA.medicalMileage.headOfHouseholdSources.paidByPrimary = '20000.01'; },
            raw => { raw.scheduleA.medicalMileage.headOfHouseholdSources.paidByPrimary = '0'; },
            raw => { raw.scheduleA.medicalMileage.headOfHouseholdSources.sourceReference = ''; },
            raw => { raw.scheduleA.medicalMileage.headOfHouseholdSources.child.dependentIndex = 1; },
            raw => { raw.scheduleA.medicalMileage.headOfHouseholdSources.child.actualNightsInHome = 182; },
            raw => { present(raw.taxpayer.dependents[0]).monthsLivedWithYou = 6; },
            raw => { present(raw.taxpayer.dependents[0]).ssn = '444-55-6666'; },
            raw => { raw.taxpayer.dependents.push({ ...present(raw.taxpayer.dependents[0]) }); },
            raw => { raw.taxpayer.primary.usResidencyMonths = 11; },
            raw => { Reflect.deleteProperty(raw.standardDeductionFacts, 'dualStatusAlien'); },
            raw => { present(raw.standardDeductionFacts).primaryCanBeClaimedAsDependent = true; },
            raw => { raw.taxpayer.primary.dateOfBirth = '2018-01-01'; },
            raw => { present(raw.taxpayer.dependents[0]).dateOfBirth = '2007-12-31'; raw.scheduleA.medicalMileage.headOfHouseholdSources.child.dateOfBirth = '2007-12-31'; },
            raw => { present(raw.taxpayer.dependents[0]).dateOfBirth = '2026-01-01'; raw.scheduleA.medicalMileage.headOfHouseholdSources.child.dateOfBirth = '2026-01-01'; },
        ];
        for (const mutate of changes) {
            const raw = medicalMileageHohFixture();
            mutate(raw);
            expect(() => run(raw)).toThrow();
        }
        for (const key of ['unmarriedAndNotSurvivingSpouseConfirmed', 'fullYearResidentAndNotDependentConfirmed', 'qualifyingChildTestsConfirmed', 'noOtherQualifyingClaimantConfirmed', 'noSpecialQualificationRulesConfirmed', 'eligibleUpkeepCostsAndPaymentsCompleteConfirmed'])
            for (const value of [false, undefined]) {
                const raw = medicalMileageHohFixture();
                Reflect.set(raw.scheduleA.medicalMileage.headOfHouseholdSources, key, value);
                expect(() => run(raw)).toThrow();
            }
        for (const status of ['single', 'married_filing_jointly', 'married_filing_separately', 'qualifying_surviving_spouse']) {
            const raw = medicalMileageHohFixture();
            raw.taxpayer.filingStatus = status;
            expect(() => run(raw)).toThrow();
        }
    });
    it('requires every actual source field and rejects a reordered qualifying child', () => {
        for (const key of Object.keys(medicalMileageHohFixture().scheduleA.medicalMileage.headOfHouseholdSources)) { const raw=medicalMileageHohFixture(); Reflect.deleteProperty(raw.scheduleA.medicalMileage.headOfHouseholdSources,key); expect(()=>run(raw),key).toThrow(); }
        for (const owner of ['primary','child','homeAddress'] as const) for (const key of Object.keys(medicalMileageHohFixture().scheduleA.medicalMileage.headOfHouseholdSources[owner])) { const raw=medicalMileageHohFixture(); Reflect.deleteProperty(raw.scheduleA.medicalMileage.headOfHouseholdSources[owner],key); expect(()=>run(raw),owner+key).toThrow(); }
        const raw=medicalMileageHohFixture(); raw.taxpayer.dependents.unshift({...present(raw.taxpayer.dependents[0]),firstName:'Other',ssn:'444-55-6666'}); expect(()=>run(raw)).toThrow(/household|HOH/i);
        const valid=medicalMileageHohFixture(); valid.scheduleA.medicalMileage.headOfHouseholdSources.primary.ssn='123456789';valid.scheduleA.medicalMileage.headOfHouseholdSources.child.ssn='333445555';expect(run(valid).medicalDeduction.toFixed()).toBe('6.61375');
    });
    it('requires actual own-fund provenance without inferring benefit or third-party allocations',()=>{const raw=medicalMileageHohFixture();Reflect.deleteProperty(raw.scheduleA.medicalMileage.headOfHouseholdSources,'primaryPaymentsFromOwnFundsConfirmed');expect(()=>run(raw)).toThrow();});
    it('rejects malformed original and canonical taxpayer IDs before identity normalization', () => {
        for (const value of ['123--45-6789', '-123456789-', '123-456789', '12345-6789']) {
            const raw = medicalMileageHohFixture();
            raw.taxpayer.primary.ssn = value;
            expect(() => run(raw)).toThrow(/household|identity|taxpayer|HOH/i);
        }
        for (const value of ['333--44-5555', '-333445555-', '333-445555', '33344-5555']) {
            const raw = medicalMileageHohFixture();
            present(raw.taxpayer.dependents[0]).ssn = value;
            expect(() => run(raw)).toThrow(/household|identity|taxpayer|HOH/i);
        }
    });
    it('rejects known contradictory original EIC residency or qualifying-child facts', () => {
        for (const facts of [{ primaryNonresidentAlienDuringYear: true }, { primaryQualifyingChildOfAnotherTaxpayer: true }, { primaryChildless: { qualifyingChildOfAnotherTaxpayer: true } }]) {
            const raw = medicalMileageHohFixture();
            Reflect.set(raw, 'eic', { claimantEligibility: facts });
            expect(() => run(raw)).toThrow(/household|HOH/i);
        }
    });
    it('rejects a household worksheet replayed against another canonical home', () => { const raw = medicalMileageHohFixture(); raw.taxpayer.address.street = 'Different actual household'; expect(() => run(raw)).toThrow(/household|HOH/i); });
    it('preserves the original single method and annual gates and omits private household details from audit', () => {
        const raw = medicalMileageHohFixture();
        const audit = JSON.stringify(run(raw).lines);
        for (const secret of ['private-actual-household-worksheet', '333-44-5555', 'Child', '123-45-6789', 'private-own-care-ledger'])
            expect(audit).not.toContain(secret);
        expect(() => calculateFederalTax(TaxYearInputSchema.parse(raw))).toThrow(/2026.*incomplete/i);
        expect(()=>assertPdfExportAllowed(2026,2026)).toThrow(/No qualified/u);
        raw.taxpayer.filingStatus = 'single';
        Reflect.deleteProperty(raw.scheduleA.medicalMileage, 'headOfHouseholdSources');
        expect(run(raw).medicalDeduction.toFixed()).toBe('6.61375');
    });
});
