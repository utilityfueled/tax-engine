// Spec: spec/federal/guided-private-activity-sources.yaml.
import { describe, expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { investmentFactErrors } from '@/lib/guided-investment-facts';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { completeInterestSource, completeDividendSource, startCompleteInterview } from './complete-facts';

function fixture() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null });
  state.sectionData['income-investments'] = {
    interestEntries: [{ ...completeInterestSource, taxExemptInterest: '500.25', privateActivityBondInterest: '125.10',
      pabSourceTaxYear: '2025', pabSourceId: 'actual-bank-record', pabRecipientAmountsConfirmed: 'true', pabOtherwiseAllowableDeduction: '0' }],
    dividendEntries: [{ ...completeDividendSource, exemptInterestDividends: '400.25', specifiedPrivateActivityBondInterest: '20.20',
      pabSourceTaxYear: '2025', pabSourceId: 'actual-fund-record', pabRecipientAmountsConfirmed: 'true', pabOtherwiseAllowableDeduction: '5.05',
      pabDeductionSourceReference: 'Actual allowed deduction worksheet', pabDeductionAllowanceAndNoDuplicationConfirmed: 'true' }],
    brokerageEntries: [],
  };
  return state;
}

describe('Guided parent preference source handoff', () => {
  it('carries actual parent preference sources into canonical AMT without duplicate exempt income', () => {
    const state = fixture();
    const input = buildTaxInputFromGuidedData(state);
    expect(input).not.toBeNull();
    if (!input) throw new Error('Missing actual completed source input');
    expect(input.form1099Int[0]?.privateActivityBondInterest).toBe('125.10');
    expect(input.form1099Div[0]?.privateActivityBondFacts?.otherwiseAllowableDeduction).toBe('5.05');
    const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    expect(result.taxExemptInterest.toFixed()).toBe('900.5');
    expect(result.allLines.find(line => line.form === 'Form 6251' && line.line === '2g')?.value.toFixed()).toBe('140.25');
    for (const changes of [{ pabSourceTaxYear: '2026' }, { pabSourceId: '' }, { pabRecipientAmountsConfirmed: '' },
      { pabOtherwiseAllowableDeduction: '' }, { pabOtherwiseAllowableDeduction: '1' }, { privateActivityBondInterest: '' },
      { privateActivityBondInterest: '501' }, { bondPremium: '1' }]) {
      const invalid = fixture();
      Object.assign(invalid.sectionData['income-investments']!.interestEntries[0]!, changes);
      expect(buildTaxInputFromGuidedData(invalid), JSON.stringify(changes)).toBeNull();
    }
    const duplicate = fixture();
    duplicate.sectionData['income-investments']!.dividendEntries[0]!.pabSourceId = 'actual-bank-record';
    expect(Object.values(investmentFactErrors(duplicate.sectionData['income-investments'], 'single', 2025)).join(' ')).toMatch(/duplicate/i);
    expect(buildTaxInputFromGuidedData(duplicate)).toBeNull();
  });
});
