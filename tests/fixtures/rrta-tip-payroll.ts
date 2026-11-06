import { TaxYearInputSchema } from '@/models/inputs.js';
// Explicit fictional ordinary-household facts, matching the existing simple-W2
// baseline without importing its historical incomplete typed fixture graph.
const simpleW2Fixture = TaxYearInputSchema.parse({
    standardDeductionFacts: {
        primaryBlind: false, spouseBlind: false, primaryCanBeClaimedAsDependent: false, spouseCanBeClaimedAsDependent: false, primaryDeathDate: null, spouseDeathDate: null, dualStatusAlien: false, nonresidentAlien: false, shortTaxYear: false, spouseItemizes: false, claimSpouseAdditionalDeduction: false
    },
    taxpayer: {
        taxYear: 2025, filingStatus: 'single', primary: {
            firstName: 'Jane', lastName: 'Doe', ssn: '123-45-6789', dateOfBirth: '1990-01-15', occupation: 'Employee'
        }, address: {
            street: '123 Main St', city: 'Seattle', state: 'WA', zip: '98101'
        }, dependents: []
    },
    w2s: [{
            employer: {
                name: 'Fictional Ordinary Employer', ein: '33-3333333'
            }, wages: '85000', box10DependentCareBenefits: '0', federalWithheld: '12750', socialSecurityWages: '85000', socialSecurityWithheld: '5270', medicareWages: '85000', medicareWithheld: '1232.50', stateTaxWithheld: '0', stateWages: '0', localTaxWithheld: '0', state: 'WA'
        }]
});
export function rrtaTipInput(year = 2025, railroad = '100000', restaurant = '20000', additionalWithheld = '0') {
    const regular = restaurant !== '0';
    const railW2 = {
        ...simpleW2Fixture.w2s[0], taxYear: year, accountHolder: 'primary', employer: {
            name: 'Fictional Railroad', ein: '11-1111111'
        }, wages: railroad, federalWithheld: '60000', socialSecurityWages: '0', socialSecurityTips: '0', socialSecurityWithheld: '0', allocatedTips: '0', medicareWages: '0', medicareWithheld: '0', box12CodeTP: '0', treasuryTippedOccupationCodes: ['000']
    };
    const tipW2 = {
        ...simpleW2Fixture.w2s[0], taxYear: year, accountHolder: 'primary', employer: {
            name: 'Fictional Restaurant', ein: '22-2222222'
        }, wages: restaurant, federalWithheld: '0', socialSecurityWages: restaurant, socialSecurityTips: '0', socialSecurityWithheld: '1240', allocatedTips: '0', medicareWages: restaurant, medicareWithheld: '290', box12CodeTP: '0', treasuryTippedOccupationCodes: ['102']
    };
    const base = TaxYearInputSchema.parse({
        ...simpleW2Fixture, taxpayer: {
            ...simpleW2Fixture.taxpayer, taxYear: year, primary: {
                ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true
            }
        }, w2s: regular ? [railW2, tipW2] : [railW2], form4137: {
            accountHolder: 'primary', sourceFacts: {
                sourceTaxYear: year, sourceReference: 'Fictional original cash-tip ledger', sourceFactsConfirmed: true, allEmployersIncluded: true, reportingYearTreatmentConfirmed: true, railroadRetirementCompensation: railroad, noncashTipsNotIncludedInWages: '0', employers: [{
                        sourceId: 'restaurant', employerName: 'Fictional Restaurant', employerEin: '22-2222222', w2SourceIds: regular ? ['formW2:1'] : [], cashAndChargeTipsReceived: '1000', tipsReportedToEmployer: '0', allocatedTips: '0', adequateRecordsSupportUnreportedTips: true, railroadRetirementCovered: false, medicareOnlyGovernmentUnreportedTips: '0', reportedTipsNotIncludedInBox7: '0', box7TipsExcludedFromReportedTotal: '0', smallTipMonths: []
                    }]
            }
        }, schedule1A: {
            sourceTaxYear: year, sourceReference: 'Fictional original occupation and cash-tip records', sourceFactsConfirmed: true, allSourcesIncluded: true, primarySsnEligible: true, excludedPuertoRicoIncome: '0', form4563Exclusion: '0', seniorOwners: [], employeeTips: [{
                    owner: 'primary', employer: 'Fictional Restaurant', occupationCode: '102', eligibleOccupation: true, voluntaryCashTips: true, lawfulActivity: true, meetsSstbRuleOrTransition: true, w2SourceIds: regular ? ['formW2:1'] : [], form4137EmployerSourceId: 'restaurant', reportingMethod: 'form4137', reportingSourceReference: 'Fictional original Form4137 employer', qualifiedW2Tips: '0', qualifiedForm4137Tips: '1000'
                }], businessTips: [], overtime: [], vehicleLoans: []
        }
    });
    return TaxYearInputSchema.parse({
        ...base, rrtaPayrollSources: {
            methodVersion: 'ordinary-w2-rrta-v1', sourceTaxYear: year, sourceReference: 'Fictional original railroad W2 and annual ledger', sourceFactsConfirmed: true, allRRTASourcesIncludedConfirmed: true, noEmployeeRepresentativeCompensationConfirmed: true, noCorrectionsConfirmed: true, noOtherRRTATaxAdjustmentsConfirmed: true, noSelfEmploymentIncomeConfirmed: true, originalTaxpayer: structuredClone(base.taxpayer), originalTipForms: [{
                    owner: 'primary', original: structuredClone(base.form4137)
                }], sources: [{
                    sourceId: 'railroad-original', w2SourceId: 'formW2:0', owner: 'primary', sourceTaxYear: year, sourceReference: 'Fictional original W2 Box14', sourceFactsConfirmed: true, ordinaryBox1EqualsMedicareCompensationConfirmed: true, nonRRTAPayrollBoxesKnownZeroConfirmed: true, noRailroadTipsConfirmed: true, tier1SocialSecurityCompensation: railroad, tier1MedicareCompensation: railroad, additionalMedicareTaxWithheld: additionalWithheld, originalW2: structuredClone(base.w2s[0])
                }]
        }
    });
}
