import { startCompleteInterview, completeW2Entry, completeDividendSource } from '../guided-interview/complete-facts.js';
import { captureScheduleDRecords } from '@/lib/guided-schedule-d-sources';
import { emptyEstimatedTaxFacts, type AnnualizedPeriodData } from '@/lib/guided-estimated-tax-facts';

/** Complete fictional originals; the eight new special-period facts stay absent. */
export function guidedEstimatedTaxSpecialGainsState() {
  const state = startCompleteInterview({ filingStatus: 'mfj', incomeTypes: ['w2-wages', 'investments'], lifeEvents: [], stateCode: null });
  const personal = state.sectionData['personal-info'];
  if (!personal?.spouse) throw new Error('Missing fictional joint household');
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, employerName: 'Fictional annual payroll original',
    wages: '226800', federalWithheld: '30000', socialSecurityWages: '176100', socialSecurityWithheld: '10918.20',
    medicareWages: '226800', medicareWithheld: '3529.80' }] };
  const investments = { interestEntries: [], dividendEntries: [{ ...completeDividendSource, payer: 'Fictional complete annual fund statement',
    ordinaryDividends: '1200', qualifiedDividends: '1200', capitalGainDistributions: '12000', collectiblesGain: '2000', section1250Gain: '4000' }], brokerageEntries: [] };
  state.sectionData['income-investments'] = { ...investments, scheduleDSources: {
    sourceTaxYear: '2025', sourceReference: 'Fictional complete original annual capital worksheet', sourceFactsConfirmed: true, allSourcesIncluded: true,
    primary: { firstName: personal.firstName, lastName: personal.lastName, ssnLast4: personal.ssn.replace(/-/g, '').slice(-4) },
    spouse: { firstName: personal.spouse.firstName, lastName: personal.spouse.lastName, ssnLast4: personal.spouse.ssn.replace(/-/g, '').slice(-4) },
    priorShortTermCapitalLoss: '0', priorLongTermCapitalLoss: '0', section1231Lookback: '0',
    amtBasisAndCarryoversSameAsRegularConfirmed: true, form2439Present: false, partnershipInterestDispositionPresent: false, other1250DispositionPresent: false,
    longTermAssets: [], reportedGains: captureScheduleDRecords(investments).reportedGains.map(row => ({ ...row,
      sourceTaxYear: '2025', sourceReference: 'Fictional complete annual fund statement original' })),
  } };
  const periods: AnnualizedPeriodData[] = [['60000', '300', '3000'], ['100000', '500', '5000'], ['160000', '800', '8000'], ['240000', '1200', '12000']]
    .map(([adjustedGrossIncome, qualifiedDividends, netCapitalGain]) => ({ adjustedGrossIncome: adjustedGrossIncome!, qualifiedDividends: qualifiedDividends!, netCapitalGain: netCapitalGain!,
      itemizedDeductions: '0', qbiDeduction: '0', netProfitFromSelfEmployment: '0', socialSecurityWages: '0', otherTaxes: '0', credits: '0', schedule1AAdjustment: '0' }));
  // Explicit sources establish no self-employment, other taxes or credits. W2
  // SocialSecurity wages do not become a self-employed person's PartII wages.
  state.sectionData.payments = { estimatedPayments: [], extensionPayments: [], priorYearAppliedCredits: [], otherPayments: '0', estimatedTaxFacts: {
    ...emptyEstimatedTaxFacts, sourceTaxYear: '2025', sourceReference: 'Fictional four cumulative fund/payroll worksheets and complete prior joint return',
    sourceFactsConfirmed: true, allPaymentRecordsIncluded: true, calendarYearTaxpayer: true, residentReturn: true,
    farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false, calculationMethod: 'annualized', withholdingMethod: 'equal-installments',
    bothSpousesSelfEmployed: false, annualizedIncomePeriods: periods,
    priorYearTaxStatus: 'return-filed', priorYearFullYear: true, priorYearResidentAllYear: true, priorYearJointReturn: true,
    priorYearTaxForForm2210: '30000', priorYearAgiForForm2210: '220000', priorYearTaxComputationConfirmed: true,
    withholdingPayments: [], priorYearCreditPayments: [], returnPayments: [], earlyReturnExceptionClaimed: false,
  } };
  state.currentSectionIndex = 6;
  state.completedSections = ['personal-info', 'income-w2', 'income-investments', 'deductions', 'credits', 'other-taxes'];
  return state;
}

export const actualSpecialRatePeriodAmounts = [['0', '1000'], ['0', '1250'], ['800', '2000'], ['2000', '4000']] as const;
export const independentlyDerivedPeriodTaxes = ['35054', '34984', '35068', '35194'] as const;
