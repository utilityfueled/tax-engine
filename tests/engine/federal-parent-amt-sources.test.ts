// Spec: spec/federal/form-6251-bond-sources.yaml.
import { describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { fillForm6251, FORM_6251_FIELDS } from '@/pdf/fill-form-6251.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

function fixture(year: number) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: '75000' }],
    form1099Int: [{ payer: 'Synthetic bank', accountHolder: 'primary', interestIncome: '100', taxExemptInterest: '500.25', privateActivityBondInterest: '125.10',
      privateActivityBondFacts: { taxYear: year, sourceId: 'parent-int', recipientAmountsConfirmed: true, otherwiseAllowableDeduction: '0' } }],
    form1099Div: [{ payer: 'Synthetic fund', accountHolder: 'primary', ordinaryDividends: '0', exemptInterestDividends: '400.25', specifiedPrivateActivityBondInterest: '20.20',
      privateActivityBondFacts: { taxYear: year, sourceId: 'parent-div', recipientAmountsConfirmed: true, otherwiseAllowableDeduction: '0' } }],
  });
}
describe('Parent bond preference canonical transfer', () => {
  it('transfers parent preference boxes once without changing regular exempt income', () => {
    for (const year of [2025, 2026]) {
      const input = fixture(year);
      const result = calculateFederalTax(input);
      expect(result.allLines.find(line => line.form === 'Form 6251' && line.line === '2g')?.value.toFixed()).toBe('145.3');
      expect(result.taxExemptInterest.toFixed()).toBe('900.5');
      expect(result.agi.toFixed()).toBe('75100');
      const zero = structuredClone(input);
      zero.form1099Int[0]!.privateActivityBondInterest = '0';
      zero.form1099Div[0]!.specifiedPrivateActivityBondInterest = '0';
      expect(result.form6251.amti.minus(calculateFederalTax(zero).form6251.amti).toFixed()).toBe('145.3');
      const withOid = TaxYearInputSchema.parse({ ...input, form1099OID: [{
        payer: 'Synthetic broker', sourceId: 'oid-parent', taxYear: year, sourceFormRevision: '2024-01',
        sourceFactsConfirmed: true, recipientAmountsConfirmed: true, description: 'Actual synthetic bond',
        obligationType: 'tax_exempt', specifiedPrivateActivityBond: true, inflationIndexed: false,
        originalIssueDiscount: '0', otherPeriodicInterest: '0', earlyWithdrawalPenalty: '0', federalWithheld: '0',
        marketDiscount: '0', acquisitionPremium: '0', treasuryOID: '0', investmentExpenses: '0',
        bondPremium: '0', taxExemptOID: '150', stateWithholding: [],
        oidReportedNetOfAcquisitionPremium: false, interestReportedNetOfBondPremium: false,
      }] });
      withOid.form1099Int[0]!.privateActivityBondFacts = { ...withOid.form1099Int[0]!.privateActivityBondFacts!,
        otherwiseAllowableDeduction: '200', deductionSourceReference: 'Actual allowed parent deduction worksheet',
        deductionAllowanceAndNoDuplicationConfirmed: true };
      const withOidResult = calculateFederalTax(withOid);
      expect(withOidResult.allLines.find(line => line.form === 'Form 6251' && line.line === '2g')?.value.toFixed()).toBe('95.3');
      expect(withOidResult.taxExemptInterest.toFixed()).toBe('1050.5');
    }
  });
  it('prints the actual parent preference in the Form6251 review field', async () => {
    const input = fixture(2025);
    const result = calculateFederalTax(input);
    const document = await PDFDocument.load(await (await fillForm6251(input, result, 'forms/blank/2025/f6251.pdf')).save());
    expect(document.getForm().getTextField(FORM_6251_FIELDS.line2g).getText()).toBe('145');
  });
});
