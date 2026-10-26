import { actualGuidedNolSources } from './guided-net-operating-loss';
import { actualCurrentLossOrigin } from './guided-current-loss-origin';

/** Shared fictional original records for unit, workspace and production browser checks. */
export function guidedCurrentCharitableOriginals() {
  const prior = structuredClone(actualGuidedNolSources);
  if (!prior.alternativeTax) throw new Error('Missing fictional independent alternative source');
  prior.vintages = []; prior.alternativeTax.vintages = [];
  prior.alternativeTax.charitableCarryoverHistory = { sourceTaxYear: '2024', sourceReference: 'Fictional independent current-origin charity histories',
    sourceFactsConfirmed: true, allCarryoversIncluded: true, priorRegularCarryovers: [], priorAlternativeCarryovers: [] };
  return {
    w2: { employerName: 'Synthetic Employer', employerEin: '12-3456789', accountHolder: 'primary' as const, wages: '20000', federalWithheld: '0',
      socialSecurityWages: '20000', socialSecurityTips: '0', socialSecurityWithheld: '1240', medicareWages: '20000', medicareWithheld: '290',
      box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' as const },
    business: { necEntries: [], manualGrossReceipts: '0', qbiMateriallyParticipated: true,
      expenses: { advertising: '0', carAndTruck: '0', insurance: '0', officeExpense: '0', supplies: '0', travel: '0', meals: '0', utilities: '0', otherExpenses: '40000' },
      businessFacts: { businessName: 'Actual active sole proprietorship', accountHolder: 'primary' as const, activityDescription: 'Independent design services', businessCode: '541430',
        accountingMethod: 'cash' as const, singleBusinessConfirmed: true, incomeReconciled: true, expensesReconciled: true, returnsAndAllowances: '0', costOfGoodsSold: '0', otherIncome: '0',
        contractLabor: '0', depreciation: '0', legalAndProfessional: '0', w2WagesPaid: '0', ubiaQualifiedProperty: '0', isSST: false, allInvestmentAtRisk: true,
        priorYearUnallowedLoss: '0', additionalWorksheetRequired: false, otherExpenseDescription: 'Fictional current operating expense',
        mealsEligibilityConfirmed: true, carExpenseWorksheetConfirmed: true, depreciationWorksheetConfirmed: true } },
    interest: { payer: 'Actual bank', payerTin: '12-3456789', accountHolder: 'primary' as const, interestIncome: '30000', federalWithheld: '0',
      earlyWithdrawalPenalty: '0', usSavingsBondInterest: '0', foreignTaxPaid: '0', foreignCountry: '', taxExemptInterest: '0', privateActivityBondInterest: '0',
      marketDiscount: '0', bondPremium: '0', treasuryBondPremium: '0', taxExemptBondPremium: '0', stateTaxReporting: 'none' as const },
    deductions: { method: 'itemized' as const, medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '20000', personalPropertyTaxes: '0',
      mortgageInterest: '0', charitableContributions: '', casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0', gamblingLosses: '0', nonW2IncomeTaxesDeductedElsewhere: '0',
      donationEntries: [{ organization: 'Fictional current-origin charity', type: 'cash' as const, amount: '20,000.49', date: '2025-05-01',
        qualifiedOrganization: true, recipientCategory: 'fifty-percent' as const, isPrivateFoundation: false,
        costBasis: '', isLongTermCapitalGain: null, supportingOrganization: false, donorAdvisedFund: false }] },
    prior, current: structuredClone(actualCurrentLossOrigin),
  };
}
