// Spec: spec/federal/browser-federal-source-year-contract.yaml.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { investmentFactErrors, type InvestmentData } from '@/lib/guided-investment-facts';
import type { InterestEntryData } from '@/lib/guided-interview-flow';
import { actualEducatorBondInterview } from '../../apps/web/tests/guided-educator-bond-fixture';
import { actualSavingsBondReissueInterview } from '../../apps/web/tests/guided-savings-bond-reissue-fixture';

// Read the existing inline browser originals without importing Playwright's test runner.
// Only string literal source fields are accepted; no evaluation or production default.
function inlineOriginal(file: string): InterestEntryData {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'interest') continue;
      if (!declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) throw new Error('Explicit original object required');
      const fields: Record<string, string> = {};
      for (const property of declaration.initializer.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name) || !ts.isStringLiteral(property.initializer)) throw new Error('Explicit original string fact required');
        fields[property.name.text] = property.initializer.text;
      }
      return fields as unknown as InterestEntryData;
    }
  }
  throw new Error('Existing inline interest original missing');
}
const cases = [
  ['loss', () => inlineOriginal('apps/web/tests/guided-current-loss-origin.spec.ts'), '5000', '0'],
  ['capital', () => inlineOriginal('apps/web/tests/guided-current-capital-origin.spec.ts'), '5000', '0'],
  ['educator bond', () => actualEducatorBondInterview().sectionData['income-investments'].interestEntries[0] as InterestEntryData, '0', '1000'],
  ['bond reissue', () => actualSavingsBondReissueInterview().sectionData['income-investments'].interestEntries[0] as InterestEntryData, '0', '500'],
] as const;
function actualData(row: InterestEntryData): InvestmentData { return { interestEntries: [row], dividendEntries: [], brokerageEntries: [] }; }
it.each(cases)('actual2025 browser original is admitted: %s', (_name, load, interest, treasury) => {
  const row = load(), before = structuredClone(row);
  expect(row).toHaveProperty('sourceTaxYear', '2025');
  expect(row.interestIncome).toBe(interest);
  expect(row.usSavingsBondInterest).toBe(treasury);
  expect(investmentFactErrors(actualData(row), 'mfj', 2025)).toEqual({});
  expect(row).toEqual(before);
});
it.each(cases)('missing original year remains blocked: %s', (_name, load) => {
  const row = structuredClone(load()); Reflect.deleteProperty(row, 'sourceTaxYear');
  const before = structuredClone(row);
  expect(investmentFactErrors(actualData(row), 'mfj', 2025)['interest-0-year']).toMatch(/actual.*calendar year/i);
  expect(row).toEqual(before);
});
it.each(cases)('wrong original year remains blocked: %s', (_name, load) => {
  const row = { ...load(), sourceTaxYear: '2024' }, before = structuredClone(row);
  expect(investmentFactErrors(actualData(row), 'mfj', 2025)['interest-0-year']).toMatch(/actual.*calendar year/i);
  expect(row).toEqual(before);
});
