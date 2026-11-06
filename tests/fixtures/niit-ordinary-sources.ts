import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';

/** Actual synthetic statements and a completed tax allocation worksheet. */
export function ordinaryNiitSourceFixture(year = 2025) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: '250000', federalWithheld: '100000', stateWages: '250000', stateTaxWithheld: '15000', socialSecurityTips: '0' }],
    form1099Int: [{ payer: 'Synthetic interest payer', interestIncome: '20000' }],
    form1099R: [{ payer: 'Synthetic annuity insurer', payerTin: '112233445', accountHolder: 'primary', grossDistribution: '30000', taxableAmount: '10000', distributionCode: '7D', iraSepSimple: false }],
    scheduleA: { realEstateTaxes: '6000', personalPropertyTaxes: '1000' },
    form8960Sources: { sourceTaxYear: year, sourceFactsConfirmed: true, sourceReference: 'Synthetic current tax allocation worksheet', ordinaryTaxAllocation: {
      allocationMethodDescription: 'Actual investment income and property tax source allocation; no business/rental amount is reused.', noDuplicateDeductionConfirmed: true,
      incomeOrSalesTaxes: { sourceAmount: '15000', regularDeductibleAmount: '15000', investmentAllocableAmount: '2000.25' },
      realPropertyTaxes: { sourceAmount: '6000', regularDeductibleAmount: '6000', investmentAllocableAmount: '500.25' },
      personalPropertyTaxes: { sourceAmount: '1000', regularDeductibleAmount: '1000', investmentAllocableAmount: '0' },
    } },
  });
}
