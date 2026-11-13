// Spec: spec/federal/education-prepared-return-integrity.yaml. Synthetic originals only.
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { assertPreparedEducationReturn, assertPreparedEducationReview, hasInKindEducationReviewSources, prepareEducationReview } from '@/pdf/education-review-context.js';
import { buildForm1099QReferenceSummary } from '@/pdf/fill-form-1099-q.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { fillForm5329 } from '@/pdf/mappings/2025/fill-form-5329.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { inKindAssistanceFixture } from '../fixtures/education-in-kind-assistance.js';
import { roomBoardPeriodFixture } from '../fixtures/education-room-board-periods.js';
import { annualCashQtpFixture } from '../fixtures/education-annual-cash.js';
import { annualLoanInterestFixture, mixedAnnualLoanInterestFixture } from '../fixtures/education-annual-loan-interest.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';

const cases = [
  { id: 'prepaid-assistance', input: () => inKindAssistanceFixture(2025), taxable: '200', excluded: '600', agi: '50200' },
  { id: 'academic-period', input: () => roomBoardPeriodFixture(2025).input, taxable: '800', excluded: '1200', agi: '50800' },
  { id: 'annual-cash', input: () => annualCashQtpFixture(2025).input, taxable: '3500', excluded: '1500', agi: '53500' },
] as const;
const resultDenial = /education review full federal result.*reconcile/i;
const sourceDenial = /education review original return sources.*(?:stale|conflict)/i;

it.each(cases.map(row => [row.id, row] as const))('preserves literal originals and education-only APIs: %s', (_id, row) => {
  const input = row.input(), inputBefore = JSON.stringify(input);
  const result = calculateFederalTax(input), resultBefore = JSON.stringify(result), token = prepareEducationReview(input);
  const education = result.form1099Q;
  if (!education) throw new Error('Missing original education result');
  expect(education.loanInterestSourceAdjustments.some(source => source.annualInterestOnlyReporting)).toBe(false);
  expect([education.taxFreeEarnings.toFixed(), education.taxableEarnings.toFixed(), result.agi.toFixed()])
    .toEqual([row.excluded, row.taxable, row.agi]);
  expect(JSON.stringify(token)).toBe('{}');
  for (const [renderInput, renderResult] of [[input, result], [redactReviewIdentifiers(input), redactReviewIdentifiers(result)]] as const) {
    const renderedEducation = renderResult.form1099Q;
    if (!renderedEducation) throw new Error('Missing render education result');
    expect(() => assertPreparedEducationReturn(renderInput, renderedEducation, token, renderResult.schedule1?.studentLoanInterest, renderResult)).not.toThrow();
    // These education-only APIs legitimately have no whole-return argument.
    expect(() => assertPreparedEducationReview(renderInput.form1099Q, renderInput.qualifiedEducationExpenses, renderedEducation, token)).not.toThrow();
    expect(buildForm1099QReferenceSummary(renderInput.form1099Q, renderedEducation, renderInput.qualifiedEducationExpenses, token).sourceLines.length).toBeGreaterThan(0);
  }
  expect(JSON.stringify(input)).toBe(inputBefore);
  expect(JSON.stringify(result)).toBe(resultBefore);
});

it.each(cases.flatMap(row => ['return', 'direct5329'].map(consumer => [row.id, consumer] as const)))('rejects forged AGI before template access: %s %s', async (id, consumer) => {
  const row = cases.find(candidate => candidate.id === id);
  if (!row) throw new Error('Missing literal original case');
  const input = row.input(), result = calculateFederalTax(input), token = prepareEducationReview(input);
  const inputBefore = JSON.stringify(input), resultBefore = JSON.stringify(result);
  expect(result.agi.toFixed()).toBe(row.agi);
  const changed = { ...result, agi: result.agi.plus(1) };
  if (id === 'prepaid-assistance') expect(changed.agi.toFixed()).toBe('50201');
  const directory = await mkdtemp(join(tmpdir(), 'education-complete-denial-'));
  try {
    const templates = join(directory, 'absent-templates'), outputDir = join(directory, 'never-created');
    for (const [renderInput, renderResult] of [[input, changed], [redactReviewIdentifiers(input), redactReviewIdentifiers(changed)]] as const) {
      // In-kind preparation needs actual recipient identity. Its redacted render
      // copy uses the original token; do not invent identity for auto-preparation.
      const preparedContexts = renderInput === input || id === 'annual-cash' ? [token, undefined] : [token];
      for (const prepared of preparedContexts) {
        const action = consumer === 'return'
          ? fillReturn(renderInput, renderResult, { blankFormsDir: templates, outputDir, educationReview: prepared })
          : fillForm5329(renderInput, renderResult, join(templates, 'f5329.pdf'), 'primary', prepared);
        await expect(action).rejects.toThrow(resultDenial);
        await expect(access(outputDir)).rejects.toThrow();
      }
    }
    expect(JSON.stringify(input)).toBe(inputBefore);
    expect(JSON.stringify(result)).toBe(resultBefore);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it.each(cases.slice(0, 2).map(row => [row.id, row] as const))('retains missing-identity denial for fresh redacted in-kind input: %s', async (_id, row) => {
  const input = row.input(), result = calculateFederalTax(input);
  const renderInput = redactReviewIdentifiers(input), renderResult = redactReviewIdentifiers(result);
  const directory = await mkdtemp(join(tmpdir(), 'education-original-identity-'));
  try {
    const templates = join(directory, 'absent-templates'), outputDir = join(directory, 'never-created');
    await expect(fillReturn(renderInput, renderResult, { blankFormsDir: templates, outputDir })).rejects.toThrow(/in-kind recipient requires/i);
    await expect(fillForm5329(renderInput, renderResult, join(templates, 'f5329.pdf'), 'primary')).rejects.toThrow(/in-kind recipient requires/i);
    await expect(access(outputDir)).rejects.toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it.each(['withholding', 'refund', 'carryforward', 'audit'])('rejects other altered federal fields: %s', mode => {
  const input = inKindAssistanceFixture(2025), result = calculateFederalTax(input), token = prepareEducationReview(input);
  const education = result.form1099Q;
  if (!education || result.allLines.length === 0) throw new Error('Missing actual education or audit');
  const changed = { ...result };
  if (mode === 'withholding') changed.totalWithholding = result.totalWithholding.plus(1);
  if (mode === 'refund') changed.refund = result.refund.plus(1);
  if (mode === 'carryforward') changed.carryforwards = { ...result.carryforwards, capitalLoss: result.carryforwards.capitalLoss.plus(1) };
  if (mode === 'audit') changed.allLines = result.allLines.map((line, index) => index === 0 ? { ...line, description: line.description + ' changed' } : line);
  expect(() => assertPreparedEducationReturn(input, education, token, changed.schedule1?.studentLoanInterest, changed)).toThrow(resultDenial);
});

it.each(['wages', 'lexical-wages'])('rejects stale complete original sources: %s', mode => {
  const input = inKindAssistanceFixture(2025), result = calculateFederalTax(input), token = prepareEducationReview(input);
  const changed = structuredClone(input), w2 = changed.w2s[0], education = result.form1099Q;
  if (!w2 || !education) throw new Error('Missing actual wage or education source');
  w2.wages = mode === 'wages' ? '50001' : '50000.00';
  expect(() => assertPreparedEducationReturn(changed, education, token, result.schedule1?.studentLoanInterest, result)).toThrow(sourceDenial);
});

it('requires the full result only at whole-return assertions', () => {
  for (const row of cases) {
    const input = row.input(), result = calculateFederalTax(input), token = prepareEducationReview(input), education = result.form1099Q;
    if (!education) throw new Error('Missing original education result');
    expect(() => assertPreparedEducationReturn(input, education, token, result.schedule1?.studentLoanInterest)).toThrow(resultDenial);
    expect(() => assertPreparedEducationReview(input.form1099Q, input.qualifiedEducationExpenses, education, token)).not.toThrow();
  }
});

it('preserves the separate state envelope while binding every federal field', () => {
  const input = inKindAssistanceFixture(2025), result = calculateFederalTax(input), token = prepareEducationReview(input), education = result.form1099Q;
  if (!education) throw new Error('Missing original education result');
  // This empty typed envelope exercises only the federal boundary, not state qualification.
  const attached = { ...result, stateReturns: {} };
  expect(() => assertPreparedEducationReturn(input, education, token, attached.schedule1?.studentLoanInterest, attached)).not.toThrow();
  expect(() => assertPreparedEducationReturn(input, education, token, attached.schedule1?.studentLoanInterest, { ...attached, agi: result.agi.plus(1) })).toThrow(resultDenial);
});

it('preserves annual-interest and unrelated-return context boundaries', () => {
  for (const fixture of [annualLoanInterestFixture(), mixedAnnualLoanInterestFixture()]) {
    const input = fixture.input, result = calculateFederalTax(input), token = prepareEducationReview(input), education = result.form1099Q;
    if (!education) throw new Error('Missing annual-interest result');
    expect(() => assertPreparedEducationReturn(input, education, token, result.schedule1?.studentLoanInterest, result)).not.toThrow();
    expect(() => assertPreparedEducationReturn(input, education, token, result.schedule1?.studentLoanInterest)).toThrow(/annual.*full.*result/i);
  }
  expect(hasInKindEducationReviewSources(simpleW2Fixture)).toBe(false);
  const input = inKindAssistanceFixture(2025), result = calculateFederalTax(input), changed = structuredClone(input);
  changed.taxpayer.primary.firstName = 'Other original taxpayer';
  const otherToken = prepareEducationReview(changed), education = result.form1099Q;
  if (!education) throw new Error('Missing original education result');
  expect(() => assertPreparedEducationReturn(input, education, otherToken, result.schedule1?.studentLoanInterest, result)).toThrow(/taxpayer.*(?:identity|stale|conflict)/i);
});
