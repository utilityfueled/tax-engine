import type { GuidedTaxRefundData } from '@/lib/guided-tax-refund';
import { captureGuidedRefundSources } from '@/lib/guided-tax-refund';
import { completeUnemploymentSource } from '../guided-interview/complete-facts';

export const actualRefundEntry = () => ({ ...completeUnemploymentSource, programType: 'other-government' as const,
  stateOrLocalTaxRefund: '1000.25', refundTaxYear: '2024', refundExpenseTaxYear: '2024', federalWithheld: '10.03' });
export const actualRefundHistory = (entries = [actualRefundEntry()]): GuidedTaxRefundData => ({
  sourceTaxYear: '2025', sourceReference: 'Actual filed 2024 return and refund worksheet', sourceFactsConfirmed: true,
  allRefundSourcesIncluded: true, allRefundedTaxesPaidInExpenseYear: true, returnMembershipUnchanged: true,
  primaryName: 'Jordan Example', primaryTaxpayerIdLast4: '3333', priorYearFilingStatus: 'single',
  priorTaxYear: '2024', priorYearItemized: true, priorYearStateLocalTaxElection: 'income',
  priorYearItemizedTotal: '20000', priorYearStandardDeduction: '14600', priorYearMandatoryItemization: false,
  priorYearStateLocalTaxesPaid: '8000', priorYearPropertyTaxesPaid: '0', priorYearAlternativeGeneralSalesTaxDeduction: '3000',
  priorYearTaxableIncome: '50000', priorYearRegularTax: '6000', priorYearAmt: '0', priorYearUnusedTaxCredits: '0',
  otherItemizedRecoveries: '0', priorYearCapitalRateWorksheetUsed: false, priorYearCouldBeClaimedAsDependent: false,
  priorRecoveriesBeforeReceiptYear: '0', priorYearNolCarryover: '0',
  originalRefundSources: captureGuidedRefundSources(entries),
});
