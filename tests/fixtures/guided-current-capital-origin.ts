import type { CurrentCapitalSourceData } from '../../apps/web/src/lib/guided-current-capital-origin';
import type { BrokerageEntryData } from '../../apps/web/src/lib/guided-interview-flow';

/** Explicit fictional source records, not application defaults. */
export const actualCurrentCapitalBrokerage: BrokerageEntryData = {
  broker: 'Actual origin broker', sourceId: 'Original current capital statement', sourceTaxYear: '2025',
  payerTin: '12-3456789', accountHolder: 'primary', federalWithheld: '0', stateTaxReporting: 'none', state: '', stateWithheld: '0',
  transactions: [
    { description: 'Actual ordinary gain', dateAcquired: '2025-01-02', dateSold: '2025-06-03', proceeds: '1100.49', costBasis: '1000', adjustments: '0', holdingPeriod: 'short', basisReportedToIRS: false, digitalAsset: false, washSale: false, washSaleDisallowed: '0', sourceClassificationConfirmed: true, specialGainCharacter: 'ordinary' },
    { description: 'Actual ordinary loss', dateAcquired: '2024-01-02', dateSold: '2025-06-03', proceeds: '899.50', costBasis: '1000', adjustments: '0', holdingPeriod: 'long', basisReportedToIRS: false, digitalAsset: false, washSale: false, washSaleDisallowed: '0', sourceClassificationConfirmed: true, specialGainCharacter: 'ordinary' },
  ],
};
export const actualCurrentCapitalOrigin: CurrentCapitalSourceData = {
  sourceTaxYear: '2025', sourceReference: 'Actual current capital packet', sourceFactsConfirmed: true, allCapitalSourcesIncluded: true,
  transactions: actualCurrentCapitalBrokerage.transactions.map((transaction, index) => ({
    sourceId: `form1099B:0:transaction:${index}`, sourceTaxYear: '2025', sourceReference: 'Original current capital statement',
    statementSourceId: 'Original current capital statement', payerName: 'Actual origin broker', accountHolder: 'primary',
    nonbusinessInvestmentConfirmed: true, capitalCharacter: 'ordinary_investment', transaction: { ...transaction, holdingPeriod: transaction.holdingPeriod || undefined },
  })),
  distributions: [],
  priorCapitalLosses: { sourceTaxYear: '2024', sourceReference: 'Actual filed capital carry worksheet', sourceFactsConfirmed: true,
    allCarryoversIncluded: true, sameReturnMembershipConfirmed: true, nonbusinessInvestmentConfirmed: true, shortTermCapitalLoss: '0', longTermCapitalLoss: '0' },
  alternativeTax: { sourceReference: 'Independent AMT capital worksheet', sourceFactsConfirmed: true, currentBasisAndAdjustmentsSameConfirmed: true, priorCapitalLossesSameConfirmed: true },
};
