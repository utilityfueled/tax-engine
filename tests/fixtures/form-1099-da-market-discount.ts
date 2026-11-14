import { TaxYearInputSchema, type TaxYearInput } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';
import { actualDigitalAssetSource } from './digital-asset-sources.js';

// All values are independently supplied fictional sources, not IRS example data.
export function marketDiscountInput(proceeds = '1200.03', basis = '1000.01', marketDiscount = '50.005'): TaxYearInput {
  const input = structuredClone(simpleW2Fixture);
  const form = structuredClone(actualDigitalAssetSource);
  form.sourceId = 'Synthetic corporate debt statement';
  const row = form.transactions[0];
  Object.assign(row, {
    digitalAssetCode: 'SYNTHETIC-DEBT', digitalAssetName: 'Synthetic taxable corporate tokenized debt',
    dateAcquired: '2024-01-15', reportedDateAcquired: '2024-01-15', dateSold: '2025-06-01',
    proceeds, costBasis: basis, reportedCostBasis: basis, basisReportedToIRS: true,
    basisSource: 'broker_statement', holdingPeriod: 'long', noncoveredSecurity: true, securityIdentifier: 'SYNTH00001',
    customerProvidedAcquisitionInformation: false, marketDiscount, ordinaryIncome: true,
    marketDiscountSource: {
      sourceReference: 'Synthetic original debt classification and full disposition reconciliation', sourceFactsConfirmed: true,
      statementSourceId: form.sourceId, transactionSourceId: row.sourceId, sourceTaxYear: 2025, accountHolder: 'primary',
      accountReference: form.accountReference, originalDispositionReference: 'Synthetic original full sale confirmation A', heldForInvestmentConfirmed: true,
      securityIdentifier: 'SYNTH00001', issuerTaxTreatment: 'taxable_corporate', tokenizedDebtConfirmed: true,
      issueDate: '2020-01-01', maturityDate: '2030-01-01', usDollarDenominated: true, fullDisposition: true,
      ordinaryIncomeCause: 'market_discount_only', currentInclusionElectionApplies: false, allInterestAsOidElectionApplies: false,
      previouslyIncludedMarketDiscount: '0', priorPartialPrincipalPayments: '0', originalIssueDiscount: '0',
      acquisitionPremium: '0', bondPremium: '0', strippedDebt: false, contingentPaymentDebt: false,
      borrowedToAcquireOrCarry: false,
      installmentObligation: false, transferredBasis: false, reorganizationDebt: false,
      originalDisposition: { dateAcquired: '2024-01-15', dateSold: '2025-06-01', proceeds, costBasis: basis, marketDiscount, ordinaryIncome: true },
      interestReportingReconciliation: {
        sourceReference: 'Synthetic complete original interest statement reconciliation',
        originalForm1099Int: [], originalForm1099OID: [], allOriginalInterestStatementsIncludedConfirmed: true,
        sameDiscountIncludedElsewhere: false,
      },
    },
  });
  input.form1099DA = [form];
  return TaxYearInputSchema.parse(input);
}
