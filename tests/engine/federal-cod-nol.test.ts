// Spec: spec/federal/cod-nol-reductions.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { actualCodNolInput } from '../fixtures/cod-nol.js';
import { currentOriginInput } from '../fixtures/form-172-origin.js';

it('reduces independent closing loss vintages only after calculating current tax', () => {
  const input = actualCodNolInput(); const before = JSON.stringify(input);
  const baseline = calculateFederalTax({ ...input, form1099C: [], codExclusion: undefined, form982NolSources: undefined });
  const result = calculateFederalTax(input), cod = result.codNolReduction;
  expect(result.nolDeduction.toFixed()).toBe('67400'); expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('90000');
  expect(result.totalTax.eq(baseline.totalTax)).toBe(true); expect(result.agi.eq(baseline.agi)).toBe(true);
  expect(cod?.regular?.vintages.map(row => row.attributeReduction.toFixed())).toEqual(['32600', '7400']);
  expect(cod?.alternativeTax?.vintages.map(row => row.attributeReduction.toFixed())).toEqual(['10000', '30000']);
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe('92600');
  expect(result.carryforwards.alternativeTaxNolCarryforward?.toFixed()).toBe('70000');
  expect(result.netOperatingLoss?.carryforward.toFixed()).toBe('132600');
  expect(JSON.stringify(input)).toBe(before);
});
it('reduces current origins before older carries in each tax system', () => {
  const cod = actualCodNolInput('90000'); const input = currentOriginInput();
  if (!input.form172 || !input.netOperatingLoss || !cod.netOperatingLoss?.vintages || !input.netOperatingLoss.alternativeTax) throw new Error('Missing fixture');
  input.netOperatingLoss.vintages = cod.netOperatingLoss.vintages.map((row, index) => ({ ...row, originalLoss: index === 0 ? '10000' : '20000', openingCarryforward: index === 0 ? '10000' : '20000' }));
  input.netOperatingLoss.alternativeTax.vintages = structuredClone(input.netOperatingLoss.vintages);
  Object.assign(input, { form1099C: cod.form1099C, codExclusion: cod.codExclusion, form982NolSources: cod.form982NolSources });
  input.form172.cancelledDebtIncluded = true;
  const result = calculateFederalTax(input);
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe('80000'); expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe('75000');
  expect(result.codNolReduction?.regular?.vintages.map(row => row.attributeReduction.toFixed())).toEqual(['80000', '10000', '0']);
  expect(result.codNolReduction?.alternativeTax?.vintages.map(row => row.attributeReduction.toFixed())).toEqual(['75000', '10000', '5000']);
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe('20000'); expect(result.carryforwards.alternativeTaxNolCarryforward?.toFixed()).toBe('15000');
});
it('applies COD before final-year expiry but never revives an already expired loss', () => {
  for (const lossTaxYear of [2005, 2004]) {
    const input = actualCodNolInput('5000');
    if (!input.netOperatingLoss?.vintages?.[0] || !input.netOperatingLoss.alternativeTax?.vintages?.[0]) throw new Error('Missing actual histories');
    for (const vintage of [input.netOperatingLoss.vintages[0], input.netOperatingLoss.alternativeTax.vintages[0]]) {
      Object.assign(vintage, { lossTaxYear, carrybackTreatment: 'waived', carrybackSourceReference: 'Actual timely original waiver' });
    }
    const result = calculateFederalTax(input), cod = result.codNolReduction;
    if (lossTaxYear === 2005) {
      expect(result.nolDeduction.toFixed()).toBe('100000');
      expect(result.netOperatingLoss?.alternativeTax.deduction.toFixed()).toBe('90000');
      expect(cod?.regular?.vintages.map(row => row.attributeReduction.toFixed())).toEqual(['5000', '0']);
      expect(cod?.alternativeTax?.vintages.map(row => row.attributeReduction.toFixed())).toEqual(['5000', '0']);
      expect(cod?.regular?.expiredAfterReduction.toFixed()).toBe('10750');
      expect(cod?.alternativeTax?.expiredAfterReduction.toFixed()).toBe('5000');
      expect(result.carryforwards.nolCarryforward.toFixed()).toBe('100000');
      expect(result.carryforwards.alternativeTaxNolCarryforward?.toFixed()).toBe('100000');
    } else {
      expect(cod?.regular?.vintages.map(row => row.attributeReduction.toFixed())).toEqual(['0', '5000']);
      expect(cod?.alternativeTax?.vintages.map(row => row.attributeReduction.toFixed())).toEqual(['0', '5000']);
      expect(result.carryforwards.nolCarryforward.toFixed()).toBe('27600');
      expect(result.carryforwards.alternativeTaxNolCarryforward?.toFixed()).toBe('5000');
    }
  }
});
it('requires the separate COD method when the actual reduction exceeds modified capacity', () => {
  const input = actualCodNolInput('11000'); input.priorYear = { shortTermCapitalLoss: '-3000' };
  expect(() => calculateFederalTax(input)).toThrow(/COD.*modified.*exhaustion/i);
});
it('retains source cents and rejects unresolved or conflicting attribute sources', () => {
  const cents = calculateFederalTax(actualCodNolInput('1000.49'));
  expect(cents.codNolReduction?.sourceExcludedAmount.toFixed()).toBe('1000.49');
  expect(cents.codNolReduction?.regular?.reduction.toFixed()).toBe('1000');
  const combined = actualCodNolInput('1000.30'), source = combined.form982NolSources;
  if (!source?.debts?.[0] || !source.insolvency?.liabilities || !combined.codExclusion?.insolvency) throw new Error('Missing actual debt sources');
  combined.form1099C.push({ ...combined.form1099C[0] });
  source.debts.push({ ...source.debts[0], sourceId: 'form1099C:1', statementId: 'Original statement-B', accountReference: 'Original account-B' });
  source.insolvency.liabilities.push({ sourceId: 'Liability-B', description: 'Second original personal loan', amount: '3000', sourceReference: 'Actual second balance', dischargedDebtSourceId: 'form1099C:1' });
  combined.codExclusion.insolvency.totalLiabilities = '123000';
  const aggregate = calculateFederalTax(combined);
  expect(aggregate.codNolReduction?.sourceExcludedAmount.toFixed()).toBe('2000.6');
  expect(aggregate.codNolReduction?.reportedExcludedAmount.toFixed()).toBe('2001');
  expect(combined.form1099C.map(row => row.amountDischarged)).toEqual(['1000.30', '1000.30']);
  for (const change of [
    (source: ReturnType<typeof actualCodNolInput>) => { if (source.form982NolSources) delete source.form982NolSources.electBasisReductionFirst; },
    (source: ReturnType<typeof actualCodNolInput>) => { if (source.form982NolSources) source.form982NolSources.title11Case = true; },
    (source: ReturnType<typeof actualCodNolInput>) => { if (source.form982NolSources?.debts?.[0]) source.form982NolSources.debts[0].amountDischarged = '40001'; },
    (source: ReturnType<typeof actualCodNolInput>) => { if (source.form982NolSources?.debts?.[0]) source.form982NolSources.debts.push(structuredClone(source.form982NolSources.debts[0])); },
    (source: ReturnType<typeof actualCodNolInput>) => { if (source.form982NolSources?.insolvency) delete source.form982NolSources.insolvency.exemptAndRetirementAssetsIncluded; },
    (source: ReturnType<typeof actualCodNolInput>) => { if (source.form982NolSources?.debts?.[0]) source.form982NolSources.debts[0].dischargeDate = '2025-13-01'; },
    (source: ReturnType<typeof actualCodNolInput>) => { if (source.netOperatingLoss?.alternativeTax) source.netOperatingLoss.alternativeTax.vintages = []; },
  ]) { const input = actualCodNolInput(); change(input); expect(() => calculateFederalTax(input)).toThrow(); }
});
it('preserves the original investment loss fraction and current deduction', () => {
  const input = actualCodNolInput('5000');
  if (!input.netOperatingLoss?.vintages?.[0] || !input.netOperatingLoss.alternativeTax?.vintages?.[0]) throw new Error('Missing fixture');
  input.netOperatingLoss.vintages = [input.netOperatingLoss.vintages[0]];
  input.netOperatingLoss.vintages[0].section1411OriginalLoss = '40000';
  input.netOperatingLoss.alternativeTax.vintages = [input.netOperatingLoss.alternativeTax.vintages[0]];
  const result = calculateFederalTax(input), row = result.codNolReduction?.regular?.vintages[0];
  expect(result.netOperatingLoss?.section1411Deduction.toFixed()).toBe('26960');
  expect(row?.originalLoss.toFixed()).toBe('100000'); expect(row?.section1411OriginalLoss?.toFixed()).toBe('40000');
  expect(row?.remainingCarryforward.toFixed()).toBe('27600'); expect(row?.section1411RemainingCarryforward?.toFixed()).toBe('11040');
});
