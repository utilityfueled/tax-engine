import type { AdoptionCreditData } from '@/lib/guided-adoption-facts';
/** Actual fictional records; no application defaults or derived source amounts. */
export function actualGuidedAdoptionHistory(): AdoptionCreditData {
  return { eligibilityConfirmed: true, foreignEarnedIncomeExclusion: '0', foreignHousingExclusion: '0', possessionIncomeExclusion: '0',
    exclusionMagi: '102000', carryforwardHistoryConfirmed: true, carryforwards: [], children: [{
      childFirstName: 'Sam', childLastName: 'Example', childBirthYear: '2020', childIdentifyingNumber: '345-67-8901',
      childPermanentlyDisabled: false, isSpecialNeeds: false, isForeignAdoption: true, adoptionFinalized: true, adoptionFinalizedYear: '2025',
      expensesConfirmed: true, expensesByYear: [], employerBenefits: '2000', employerPlanQualified: true,
      priorYearCreditsClaimed: '0', priorYearExclusionsClaimed: '0', priorYearForeignBenefits: '8000.10',
      priorYearForeignBenefitHistory: { sourceTaxYear: '2025', sourceReference: 'Actual fictional prior benefits worksheet', sourceFactsConfirmed: true,
        allPriorBenefitsIncluded: true, returnMembershipUnchangedConfirmed: true, childNameOnSource: 'Sam Example', childIdentifyingNumberLast4: '8901',
        otherAdopterReceivedBenefits: false, priorExclusionHistoryConfirmed: true, priorExclusionLimitUsed: '0',
        records: [{ sourceId: 'Actual original adoption statement-A', taxYear: '2024', employerName: 'Example Employer', employerEin: '12-3456789',
          accountHolder: 'primary', recipientName: 'Jordan Example', recipientTaxpayerIdLast4: '3333', originalEmployerBenefits: '8000.10',
          benefitsAllocatedToChild: '8000.10', allocatedBenefitsIncludedInPriorIncome: true, employerPlanQualified: true }],
      },
    }] };
}
