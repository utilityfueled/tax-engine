import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';

/** Every answer is an explicit synthetic source fact, never a production default. */
export function foreignTaxDirectCreditFixture(year = 2025) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
    form1099Int: [{ payer: 'Synthetic investment bank', payerTin: '112233445', accountReference: 'Private synthetic account A',
      accountHolder: 'primary', interestIncome: '2000', foreignTaxPaid: '200.25', foreignCountry: 'Canada' }],
    foreignTaxElection: { taxYear: year, election: 'credit', accountingMethod: 'paid', priorAccruedCreditElection: false,
      sourceReference: 'Private synthetic annual decision', sourceFactsConfirmed: true, allQualifiedForeignTaxesIncludedConfirmed: true,
      noUnusedCreditCarryoversConfirmed: true, noRedeterminationsConfirmed: true,
      creditWithoutForm1116: { electionConfirmed: true, filingContext: 'original_return',
        allForeignGrossIncomePassiveConfirmed: true, allForeignIncomeOnQualifiedPayeeStatementsConfirmed: true,
        noRequiredTaxReductionsConfirmed: true, sourceFactsConfirmed: true, sourceReference: 'Private synthetic eligibility worksheet',
        taxpayers: [{ owner: 'primary', status: 'us_citizen', sourceReference: 'Private synthetic status record' }],
        carryoverHistoryConfirmed: true, adjustedThroughTaxYear: year - 1, filingHistory: 'continuous_individual',
        carryovers: [], amtCarryovers: [],
      },
      sources: [{ sourceId: 'form1099Int:0', payerName: 'Synthetic investment bank', payerTin: '112233445', accountReference: 'Private synthetic account A',
        owner: 'primary', foreignCountry: 'Canada', jurisdictionType: 'foreign_country', reportedTaxAmount: '200.25',
        qualifiedIncomeTaxConfirmed: true, taxOnExcludedIncome: '0', taxDeductedElsewhere: '0', investmentAllocableAmount: '0',
        payments: [{ date: `${year}-09-15`, amountUsd: '200.25' }], sourceReference: 'Private synthetic statement and payments',
        creditEligibility: { passiveIncomeConfirmed: true, legalTaxLiabilityConfirmed: true, noRefundOrSubsidyConfirmed: true,
          holdingPeriodRequirementMetConfirmed: true, noRelatedPaymentsConfirmed: true, noDisallowedCountryOrBoycottConfirmed: true },
      }],
    },
  });
}
