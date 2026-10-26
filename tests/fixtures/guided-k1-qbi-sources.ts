import type { HealthInsuranceData } from '@/lib/guided-health-insurance-facts';
import type { K1LossSourcesData } from '@/lib/guided-qbi-loss-data';

/** Explicit fictional original records; no runtime app aliases or parsed defaults. */
export function actualGuidedK1Sources(): K1LossSourcesData {
  return {
    sourceTaxYear: '2025', sourceReference: 'Complete actual K1 source set', sourceFactsConfirmed: true, allK1ActivitiesIncluded: true,
    activities: [{
      sourceTaxYear: '2025', sourceReference: 'Original K1 and199A attachment', accountHolder: 'primary', entityType: 'partnership',
      entityName: 'Actual ordinary activity', entityEIN: '12-3456789', recipientName: 'Jordan Example', recipientTaxpayerIdLast4: '3333',
      ordinaryBusinessOnlyConfirmed: true, continuingActivityConfirmed: true, allOtherAmountsZeroConfirmed: true, domesticNonPtpConfirmed: true,
      statement: { ordinaryIncome: '-100000.00', section199AQBI: '-80000.00', section199AW2Wages: '0', section199AUBIA: '0',
        selfEmploymentEarnings: '-100000.00', selfEmploymentIncomeType: 'nonfarm', section199AIsSST: false, isPassiveActivity: false, qbiMateriallyParticipated: true },
      basis: { sourceTaxYear: '2024', sourceReference: 'Actual year-end outside-basis worksheet', sourceFactsConfirmed: true,
        beginningBasis: '100000', noOtherBasisChangesConfirmed: true, priorSuspendedLoss: '0' },
      atRisk: { sourceTaxYear: '2025', sourceReference: 'Actual simplified6198 source worksheet', sourceFactsConfirmed: true,
        simplifiedMethodEligible: true, adjustedBasisAtEffectiveDate: '0', priorYearAmountAtRisk: '60000', currentYearIncreases: '0', currentYearDecreases: '0', priorSuspendedLoss: '0',
        priorLossHistory: { sourceTaxYear: '2024', sourceReference: 'Actual preceding-year at-risk loss history', sourceFactsConfirmed: true, vintages: [] } },
      priorPassiveLoss: '0', sameOwnerHistoryConfirmed: true, sameRegularAmtTreatmentConfirmed: true,
      passiveHistory: { sourceTaxYear: '2024', sourceReference: 'Prior filed passive/QBI worksheet', sourceFactsConfirmed: true, vintages: [] },
      selfEmploymentTreatment: { method: 'ordinary_current', sourceTaxYear: '2025', sourceReference: 'Actual partner adjustment source', sourceFactsConfirmed: true,
        noOtherPartnerAdjustmentsConfirmed: true, priorLossHistory: { sourceTaxYear: '2024', sourceReference: 'Actual prior SE ledger', sourceFactsConfirmed: true, amount: '0' } },
    }],
    form461Classification: { method: 'ordinary_k1_only', sourceTaxYear: '2025', sourceReference: 'Actual complete business classification', sourceFactsConfirmed: true,
      allNonEmployeeBusinessSourcesIncluded: true, capitalIncomeIsNonbusiness: true, otherBusinessIncome: '0', otherBusinessDeductions: '0' },
  };
}

export function actualPartnerHealthInsurance(): HealthInsuranceData {
  return { sourceTaxYear: "2025", sourceReference: "Actual paid policy statement and eligibility records", sourceFactsConfirmed: true, allPlansIncluded: true,
    persons: [{ personId: "primary", name: "Jordan Example", householdRole: "primary", attainedAgeAtYearEnd: "35" }],
    plans: [{ planId: "medical-1", policyReference: "Actual policy number 123", accountHolder: "primary", businessSourceId: "scheduleC", businessKind: "self_employed", kind: "medical", policyHolder: "individual",
      establishedUnderBusiness: true, insuranceQualificationConfirmed: true, premiumsIncludedInOwnerIncome: null, moreThanTwoPercentShareholder: null,
      marketplaceCoverage: false, premiumTaxCreditInvolved: false, clergySpecialRules: false,
      coveredPersons: [{ personId: "primary", relationshipToOwner: "self", dependencyEligibilityConfirmed: null }],
      months: [{ month: "1", employerSubsidizedPlanEligible: false }],
      payments: [{ sourceId: "premium-1", datePaid: "2025-01-15", coverageTaxYear: "2025", coverageMonth: "1", grossPremium: "600.10", ownerOrBusinessPaid: "600.10", otherPersonPaid: "0",
        personAmounts: [{ personId: "primary", payer: "owner_after_tax", amountPaid: "600.10", excludedPublicSafetyOfficerAmount: "0", publicSafetyOfficerAccountHolder: "", otherTaxFreeFunding: "0" }] }] }],
    longTermCareAllocations: [] };
}
