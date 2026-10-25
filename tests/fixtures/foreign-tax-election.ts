import { TaxYearInputSchema } from '@/models/inputs.js';
import { ordinaryNiitSourceFixture } from './niit-ordinary-sources.js';

/** Actual synthetic paid foreign income tax and completed allocation; no dates or amounts inferred. */
export function foreignTaxElectionFixture(year = 2025) {
  const base = ordinaryNiitSourceFixture(year);
  return TaxYearInputSchema.parse({ ...base,
    form1099Int: [{ ...base.form1099Int[0], payer: 'Synthetic foreign bank', payerTin: '112233445',
      accountReference: 'Synthetic foreign account A', accountHolder: 'primary', foreignTaxPaid: '600.75', foreignCountry: 'Canada' }],
    foreignTaxElection: { taxYear: year, election: 'deduction', accountingMethod: 'paid', priorAccruedCreditElection: false,
      sourceReference: 'Synthetic annual election and statement worksheet', sourceFactsConfirmed: true,
      allQualifiedForeignTaxesIncludedConfirmed: true, noUnusedCreditCarryoversConfirmed: true, noRedeterminationsConfirmed: true,
      sources: [{ sourceId: 'form1099Int:0', payerName: 'Synthetic foreign bank', payerTin: '112233445',
        accountReference: 'Synthetic foreign account A', owner: 'primary', foreignCountry: 'Canada', jurisdictionType: 'foreign_country',
        reportedTaxAmount: '600.75', qualifiedIncomeTaxConfirmed: true, taxOnExcludedIncome: '0.25', taxDeductedElsewhere: '0',
        payments: [{ date: `${year}-03-15`, amountUsd: '300.25' }, { date: `${year}-09-15`, amountUsd: '300.50' }],
        investmentAllocableAmount: '400.50', allocationMethodDescription: 'Actual source investment-income share of included foreign tax',
        sourceReference: 'Synthetic recipient statement and completed paid-tax allocation' }],
    },
  });
}
