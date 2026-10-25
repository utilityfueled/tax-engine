// Spec: spec/federal/form-8960.yaml; IRS final2025 line5a.
import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
function input(short: string, long: string) { return TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [{ ...simpleW2Fixture.w2s[0], wages: '250000', federalWithheld: '100000' }], form1099Int: [{ payer: 'Actual interest', interestIncome: '20000' }], form1099B: [{ broker: 'Actual broker', transactions: [{ description: 'Short', dateAcquired: '2025-02-01', dateSold: '2025-05-01', proceeds: '20000', costBasis: short, holdingPeriod: 'short', basisReportedToIRS: true }, { description: 'Long', dateAcquired: '2020-02-01', dateSold: '2025-05-01', proceeds: '40000', costBasis: long, holdingPeriod: 'long', basisReportedToIRS: true }] }] }); }
describe('Form8960 actual return sources', () => {
  it('adds back only actual FEIE and its allocable deductions for NIIT', () => {
    const base = input('20000', '40000');
    const form2555 = { foreignEarnedIncome: '150000', qualifyingDays: 365, totalDaysInYear: 365, qualifiedHousingExpenses: '30000', employerProvidedForeignEarnedIncome: '150000', isSelfEmployed: false, deductionsAllocableToExcludedIncome: '7000', foreignEarnedIncomeTaxWorksheetDisallowedDeductions: '0' };
    expect(() => calculateFederalTax({ ...base, form2555 })).toThrow(/FEIE.*allocation|allocation.*FEIE/);
    const actual = TaxYearInputSchema.parse({ ...base, form2555, form8960Sources: { sourceTaxYear: 2025, sourceReference: 'Actual synthetic NIIT worksheet', sourceFactsConfirmed: true, feieAllocableDeductions: '5000' } });
    const result = calculateFederalTax(actual);
    // 9,200 housing +130,000 FEIE -7,000 deductions =132,200 excluded.
    // AGI137,800 +130,000 FEIE -5,000 actual FEIE deductions =262,800.
    expect(result.agi.toString()).toBe('137800');
    expect(result.form8960.magi.toString()).toBe('262800');
    expect(result.form8960.niitTax.toString()).toBe('760');
    expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...actual, form8960Sources: { ...actual.form8960Sources, feieAllocableDeductions: '8000' } }))).toThrow(/allocation|allocable/);
  });
  it('requires actual business-disposition adjustments and reconciles both return components', () => {
    const base = TaxYearInputSchema.parse({ ...input('20000', '40000'), form4797: { propertySales: [{ description: 'Actual nonpassive business equipment', costOrBasis: '10000', depreciationAllowed: '8000', grossSalesPrice: '6000', propertyType: 'section1245', heldMoreThanOneYear: true }] } });
    expect(() => calculateFederalTax(base)).toThrow(/disposition.*source|source.*disposition/i);
    const actual = TaxYearInputSchema.parse({ ...base, form8960Sources: { sourceTaxYear: 2025, sourceReference: 'Actual synthetic disposition worksheet', sourceFactsConfirmed: true, dispositions: { regularCapitalGainOrLoss: '0', regularOrdinaryGainOrLoss: '4000', excludedGainOrLossAdjustment: '-4000', passthroughAdjustment: '0' } } });
    const result = calculateFederalTax(actual);
    expect(result.form8960.netCapitalGain.toString()).toBe('4000');
    expect(result.form8960.lines.find(line => line.line === '5b')?.value.toString()).toBe('-4000');
    expect(result.form8960.netInvestmentIncome.toString()).toBe('20000');
    expect(result.niitTax.toString()).toBe('760');
    expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...actual, form8960Sources: { ...actual.form8960Sources, dispositions: { ...actual.form8960Sources?.dispositions, regularOrdinaryGainOrLoss: '0' } } }))).toThrow(/reconcile/);
  });
  it('deducts allowed investment interest once and rejects contradictory source allocations', () => {
    const base = TaxYearInputSchema.parse({ ...input('20000', '40000'), scheduleA: { personalPropertyTaxes: '20000', medicalExpenses: '30000' }, form4952: { investmentInterestExpense: '1000', grossInvestmentIncome: '20000' } });
    const result = calculateFederalTax(base);
    expect(result.deductionUsed).toBe('itemized');
    expect(result.form8960.lines.find(line => line.line === '9a')?.value.toString()).toBe('1000');
    expect(result.form8960.netInvestmentIncome.toString()).toBe('19000');
    expect(result.niitTax.toString()).toBe('722');
    expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...base, form8960Sources: { sourceTaxYear: 2025, sourceReference: 'Incorrect actual allocation', sourceFactsConfirmed: true, itemizedAllocation: { investmentInterest: '2000', ordinaryLoss: '0' } } }))).toThrow(/allocation|source/i);
  });
  it('nets opposing capital categories and retains the permitted capital loss', () => {
    const netGain = calculateFederalTax(input('30000', '10000'));
    expect(netGain.capitalGainLoss.toString()).toBe('20000');
    expect(netGain.form8960.netCapitalGain.toString()).toBe('20000');
    expect(netGain.form8960.netInvestmentIncome.toString()).toBe('40000');
    expect(netGain.form8960.niitTax.toString()).toBe('1520');
    const netLoss = calculateFederalTax(input('60000', '40000'));
    expect(netLoss.capitalGainLoss.toString()).toBe('-3000');
    expect(netLoss.form8960.netCapitalGain.toString()).toBe('-3000');
    expect(netLoss.form8960.netInvestmentIncome.toString()).toBe('17000');
    expect(netLoss.form8960.niitTax.toString()).toBe('646');
  });
  it('preserves the source gate when business gains and losses offset', () => {
    const base = TaxYearInputSchema.parse({
      ...input('20000', '40000'), form4797: {
        propertySales: [
          { description: 'Actual nonpassive equipment gain', costOrBasis: '10000', depreciationAllowed: '10000', grossSalesPrice: '4000', propertyType: 'section1245', heldMoreThanOneYear: true },
          { description: 'Actual passive rental loss', costOrBasis: '10000', depreciationAllowed: '0', grossSalesPrice: '6000', propertyType: 'section1250', heldMoreThanOneYear: true }]
      }
    });
    expect(() => calculateFederalTax(base)).toThrow(/disposition.*source/i);
    const result = calculateFederalTax(TaxYearInputSchema.parse({
      ...base, form8960Sources: {
        sourceTaxYear: 2025, sourceReference: 'Actual offsetting disposition worksheet', sourceFactsConfirmed: true,
        dispositions: { regularCapitalGainOrLoss: '0', regularOrdinaryGainOrLoss: '0', excludedGainOrLossAdjustment: '-4000', passthroughAdjustment: '0' }
      }
    }));
    expect(result.form8960.netCapitalGain.toString()).toBe('0');
    expect(result.form8960.netInvestmentIncome.toString()).toBe('16000');
    expect(result.niitTax.toString()).toBe('608');
  });

});
