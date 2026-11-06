import type { CodNolData } from '@/lib/guided-cod-nol';
import type { PaymentData } from '@/lib/guided-interview-flow';
import { carriedCurrentCharitableSources } from './form-172-charitable-carried-sources';
import { priorCharitableGuideSources } from './charitable-prior-nol-sources';

/** Fictional original records shared with browser and saved-output checks; no calculated allowance. */
export function charitableCodGuidedSources() {
  const sources = carriedCurrentCharitableSources(), history = priorCharitableGuideSources('5000');
  if (!sources.prior.alternativeTax) throw new Error('Missing fictional independent history');
  Object.assign(sources.w2, { wages: '110000', socialSecurityWages: '110000', socialSecurityWithheld: '6820', medicareWages: '110000', medicareWithheld: '1595' });
  sources.deductions.charitableCarryoverSources = history.regular;
  sources.prior.alternativeTax.charitableCarryoverHistory = history.loss.alternativeTax?.charitableCarryoverHistory;
  sources.current.cancelledDebtIncluded = true;
  const cod: CodNolData = {
    sourceTaxYear: '2025', sourceReference: 'Complete original debt and insolvency worksheet', sourceFactsConfirmed: true,
    allDischargesIncluded: true, title11Case: false, communityPropertyApplies: false, electBasisReductionFirst: false,
    otherExclusionsOrExceptionsApply: false, regularAndAlternativeExclusionSameConfirmed: true,
    debts: [{ statementId: 'Original statement-A', sourceTaxYear: '2025', sourceReference: 'Original creditor statement',
      accountHolder: 'primary', debtorName: 'Jordan Example', debtorSsnLast4: '3333', creditor: 'Original creditor', creditorTin: '12-3456789',
      accountReference: 'Original account-A', dischargeDate: '2025-10-01', amountDischarged: '5000', interestIncluded: '0',
      debtDescription: 'Unsecured personal loan', personallyLiable: true, identifiableEventCode: 'F', fmvOfProperty: '0',
      unsecuredPersonalDebtConfirmed: true, noPropertyTransferConfirmed: true, sourceFactsConfirmed: true }],
    insolvency: { asOfDate: '2025-10-01', sourceReference: 'Actual immediately-before-discharge worksheet', sourceFactsConfirmed: true,
      immediatelyBeforeDischargeConfirmed: true, allAssetsIncluded: true, exemptAndRetirementAssetsIncluded: true, allLiabilitiesIncluded: true,
      assets: [{ sourceId: 'Asset-A', description: 'Actual total assets supported by worksheet', amount: '10000', sourceReference: 'Actual asset records' }],
      liabilities: [{ sourceId: 'Liability-A', description: 'Original personal recourse loan', amount: '120000', sourceReference: 'Actual loan balance', dischargedDebtStatementId: 'Original statement-A' }] },
  };
  const payments: PaymentData = {
    estimatedPayments: [], extensionPayments: [], priorYearAppliedCredits: [], otherPayments: '',
    estimatedTaxFacts: {
      sourceTaxYear: '2025', sourceReference: 'Fictional filed 2024 return and complete payment records through April 15 2026',
      sourceFactsConfirmed: true, allPaymentRecordsIncluded: true, calendarYearTaxpayer: true, residentReturn: true,
      farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false,
      calculationMethod: 'regular', withholdingMethod: 'equal-installments', priorYearTaxStatus: 'return-filed',
      priorYearFullYear: true, priorYearResidentAllYear: true, priorYearJointReturn: false,
      priorYearTaxForForm2210: '3000', priorYearAgiForForm2210: '100000', priorYearTaxComputationConfirmed: true,
      withholdingPayments: [], priorYearCreditPayments: [], returnPayments: [], earlyReturnExceptionClaimed: false,
      returnFiledDate: '', returnPaidInFullDate: '',
    },
  };
  return { ...sources, cod, payments };
}
