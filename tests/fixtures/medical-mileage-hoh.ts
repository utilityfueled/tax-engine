import { simpleW2Fixture } from './simple-w2.js';
/** Fictional actual-original records; never production defaults. */
export function medicalMileageHohFixture() {
    return { ...structuredClone(simpleW2Fixture), taxpayer: {
            ...structuredClone(simpleW2Fixture.taxpayer), taxYear: 2026, filingStatus: 'head_of_household',
            primary: { ...simpleW2Fixture.taxpayer.primary, usResidencyMonths: 12 },
            dependents: [{ firstName: 'Child', lastName: 'Example', ssn: '333-44-5555', dateOfBirth: '2015-06-01', relationship: 'child', monthsLivedWithYou: 12, qualifiesForCTC: false, qualifiesForODC: false, qualifiesForEIC: false }],
        }, scheduleA: { medicalMileage: { taxYear: 2026, logReference: 'private-own-care-ledger',
                taxpayerOwnEssentialQualifiedCareConfirmed: true, singleVehicleMileageAndEligibleParkingTollsConfirmed: true, allTransportationCostsPaidAndUnreimbursedConfirmed: true, noActualVehicleCostsOrDuplicatedTaxBenefitsConfirmed: true,
                otherEligibleUnreimbursedMedicalExpenses: '1499.25', parkingAndTolls: '0.50', entries: [{ date: '2026-06-30', miles: '10.125' }, { date: '2026-07-01', miles: '20.375' }],
                headOfHouseholdSources: { taxYear: 2026, sourceReference: 'private-actual-household-worksheet', homeAddress: { ...simpleW2Fixture.taxpayer.address },
                    primary: { firstName: 'Jane', lastName: 'Doe', ssn: '123-45-6789', dateOfBirth: '1990-01-15' },
                    child: { dependentIndex: 0, firstName: 'Child', lastName: 'Example', ssn: '333-44-5555', dateOfBirth: '2015-06-01', relationship: 'child', actualNightsInHome: 365 },
                    totalEligibleHomeCosts: '20000.00', paidByPrimary: '10000.01', unmarriedAndNotSurvivingSpouseConfirmed: true, fullYearResidentAndNotDependentConfirmed: true, qualifyingChildTestsConfirmed: true, noOtherQualifyingClaimantConfirmed: true, noSpecialQualificationRulesConfirmed: true, eligibleUpkeepCostsAndPaymentsCompleteConfirmed: true,primaryPaymentsFromOwnFundsConfirmed:true,
                },
            } } };
}
