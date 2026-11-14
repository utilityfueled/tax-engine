// Spec: spec/federal/cod-title11-history-independent.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { actualPartialPersonalCodInput } from '../fixtures/cod-partial-personal.js';

function original(chapter: string, history: boolean | undefined, assets = '80000') {
  const input = actualPartialPersonalCodInput({ debt: '18000', interest: '0', liabilities: '90000', assets, eventCode: 'A' });
  Object.assign(input.form982NolSources!, {
    title11Case: true, title11Chapter: chapter,
    title11Source: {
      sourceReference: 'Fictional complete original court case and discharge history',
      sourceFactsConfirmed: true, debtorUnderCourtJurisdictionConfirmed: true,
      dischargeByCourtOrApprovedPlanConfirmed: true,
      ...(history === undefined ? {} : { caseNeverChapter7Or11Confirmed: history }),
    },
  });
  input.codExclusion!.bankruptcy = true;
  for (const ledger of [input.form982AttributeSources.regular, input.form982AttributeSources.alternativeTax]) {
    for (const property of ledger.property.followingYear.properties) Object.assign(property, { exemptUnderSection522: false });
  }
  return input;
}

it('rejects unknown or separate-estate history for both continuing-individual chapters', () => {
  for (const chapter of ['12', '13']) {
    for (const history of [undefined, false]) {
      expect(() => calculateFederalTax(original(chapter, history)), `chapter${chapter}/${String(history)}`).toThrow();
    }
  }
});

it('uses the full chapter12 court discharge for both insolvent and solvent originals', () => {
  for (const assets of ['80000', '200000']) {
    const result = calculateFederalTax(original('12', true, assets));
    expect(result.schedule1!.cancelledDebtIncome.toFixed()).toBe('0');
    expect(result.codNolReduction!.sourceExcludedAmount.toFixed()).toBe('18000');
    expect(result.codNolReduction!.reportedExcludedAmount.toFixed()).toBe('18000');
    expect(result.codNolReduction!.title11).toBe(true);
  }
});

it('preserves the explicit separate-estate gate and confirmed chapter13 control', () => {
  for (const chapter of ['7', '11']) expect(() => calculateFederalTax(original(chapter, true))).toThrow(/estate/i);
  const result = calculateFederalTax(original('13', true));
  expect(result.codNolReduction!.sourceExcludedAmount.toFixed()).toBe('18000');
  expect(result.schedule1!.cancelledDebtIncome.toFixed()).toBe('0');
});
