// Spec: spec/federal/education-annual-loan-interest.yaml original-review.
import Decimal from 'decimal.js';
import { execFileSync } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { FORM_1040_FIELDS as F1040 } from '@/pdf/fill-form-1040.js';
import { FORM_5329_FIELDS as F5329 } from '@/pdf/fill-form-5329.js';
import { SCHEDULE_1_FIELDS as S1 } from '@/pdf/fill-schedule-1.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { prepareEducationReview, assertPreparedEducationReturn } from '@/pdf/education-review-context.js';
import { fillForm5329 } from '@/pdf/mappings/2025/fill-form-5329.js';
import { annualLoanInterestFixture, mixedAnnualLoanInterestFixture } from '../fixtures/education-annual-loan-interest.js';

it('binds original lender records and the calculated deduction before rendering', async () => {
  const { input } = annualLoanInterestFixture(), before = JSON.stringify(input);
  const result = calculateFederalTax(input), context = prepareEducationReview(input);
  const directory = await mkdtemp(join(tmpdir(), 'annual-loan-interest-review-'));
  try {
    for (const kind of ['lender', 'qualification', 'amount', 'removed', 'deduction', 'income']) {
      const changed = structuredClone(input), loan = changed.studentLoanInterestFacts?.loans?.[0];
      if (!loan || !result.schedule1) throw new Error('Missing original fictional lender result');
      if (kind === 'lender') loan.lender = 'Replacement actual lender';
      if (kind === 'qualification') loan.legallyObligated = false;
      if (kind === 'amount') loan.interestPaid = '1001';
      if (kind === 'removed') delete changed.studentLoanInterestFacts;
      if (kind === 'income') {
        const w2 = changed.w2s[0];
        if (!w2) throw new Error('Missing original fictional wage statement');
        w2.wages = '200000'; w2.federalIncomeTaxWithheld = '70000';
        expect(result.schedule1.studentLoanInterest.toFixed()).toBe('700');
        expect(calculateFederalTax(changed).schedule1?.studentLoanInterest.toFixed()).toBe('0');
      }
      const forged = kind === 'deduction' ? { ...result, schedule1: { ...result.schedule1, studentLoanInterest: new Decimal(701) } } : result;
      const outputDir = join(directory, kind);
      await expect(fillReturn(redactReviewIdentifiers(changed), redactReviewIdentifiers(forged), {
        blankFormsDir: 'forms/blank/2025', outputDir, educationReview: context })).rejects.toThrow(/loan|lender|deduction|source/i);
      await expect(access(outputDir)).rejects.toThrow();
    }
    const outputDir = join(directory, 'original');
    await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), {
      blankFormsDir: 'forms/blank/2025', outputDir, educationReview: context });
    const fields = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'import json,sys;from pypdf import PdfReader;print(json.dumps([{k:str(v.get("/V","")) for k,v in PdfReader(p).get_fields().items()} for p in sys.argv[1:]]))',
      join(outputDir, 'f1040-filled.pdf'), join(outputDir, 'f1040s1-filled.pdf'), join(outputDir, 'f5329-primary-filled.pdf')], { encoding: 'utf8', timeout: 30000 })) as Array<Record<string, string>>;
    expect([fields[0]?.[F1040.line10], fields[0]?.[F1040.line11], fields[1]?.[S1.line21], fields[2]?.[F5329.line5], fields[2]?.[F5329.line8]])
      .toEqual(['700', '58000', '700', '8700', '870']);
    expect(fields[2]?.[F5329.ssn]).toBe('');
    expect(JSON.stringify(input)).toBe(before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

// Spec: education-annual-loan-interest.yaml mixed-original-review.
it('binds mixed-purpose originals and the full return before PDF output', async () => {
  const { input } = mixedAnnualLoanInterestFixture(), original = JSON.stringify(input);
  const result = calculateFederalTax(input), context = prepareEducationReview(input);
  const directory = await mkdtemp(join(tmpdir(), 'mixed-interest-original-review-'));
  try {
    for (const kind of ['lexical', 'same-cash-replacement', 'lender', 'owner', 'year', 'qualification', 'income', 'result', 'forged-context', 'removed-context']) {
      const changed = structuredClone(input), facts = changed.qualifiedEducationExpenses?.sourceFacts, loan = changed.studentLoanInterestFacts?.loans?.[0];
      if (!facts?.expenses?.[1] || !loan || !changed.w2s[0] || !result.schedule1) throw new Error('Missing fictional mixed-interest original');
      if (kind === 'lexical') facts.expenses[1].amount = '5000.00';
      if (kind === 'same-cash-replacement') facts.expenses[1].id = 'different-original-tuition';
      if (kind === 'lender') loan.lender = 'Replacement fictional lender';
      if (kind === 'owner') loan.accountHolder = 'spouse';
      if (kind === 'year') changed.taxpayer.taxYear = 2026;
      if (kind === 'qualification') loan.legallyObligated = false;
      if (kind === 'income') changed.w2s[0].wages = '200000';
      if (kind === 'removed-context') delete changed.qualifiedEducationExpenses;
      const forged = kind === 'result' ? { ...result, schedule1: { ...result.schedule1, studentLoanInterest: new Decimal(701) } } : result;
      const token = kind === 'forged-context' ? {} as typeof context : kind === 'removed-context' ? undefined : context;
      const outputDir = join(directory, kind);
      await expect(fillReturn(redactReviewIdentifiers(changed), redactReviewIdentifiers(forged), {
        blankFormsDir: 'forms/blank/2025', outputDir, educationReview: token }), kind).rejects.toThrow(/education|loan|original|context|source|2026|year|deduction/i);
      await expect(access(outputDir)).rejects.toThrow();
    }
    const outputDir = join(directory, 'original');
    await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), {
      blankFormsDir: 'forms/blank/2025', outputDir, educationReview: context });
    const fields = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'import json,sys;from pypdf import PdfReader;print(json.dumps([{k:str(v.get("/V","")) for k,v in PdfReader(p).get_fields().items()} for p in sys.argv[1:]]))',
      join(outputDir, 'f1040-filled.pdf'), join(outputDir, 'f1040s1-filled.pdf'), join(outputDir, 'f5329-primary-filled.pdf')], { encoding: 'utf8', timeout: 30000 })) as Array<Record<string, string>>;
    expect([fields[0]?.[F1040.line10], fields[0]?.[F1040.line11], fields[1]?.[S1.line21], fields[2]?.[F5329.line5], fields[2]?.[F5329.line8]])
      .toEqual(['700', '56500', '700', '7200', '720']);
    expect(fields[2]?.[F5329.ssn]).toBe('');
    expect(JSON.stringify(input)).toBe(original);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

// Spec: education-review-full-result-binding.yaml before-io-result.
it.each(['agi', 'total-income', 'taxable-income', 'total-tax', 'refund', 'withholding', 'carryforward', 'audit', 'digital-asset'])('rejects annual-interest full-result mutations before every PDF entry point: %s', async mode => {
  const directory = await mkdtemp(join(tmpdir(), 'education-full-result-denial-'));
  try {
    for (const fixture of [annualLoanInterestFixture(), mixedAnnualLoanInterestFixture()]) {
      const input = fixture.input, result = calculateFederalTax(input), token = prepareEducationReview(input);
      const originalInput = JSON.stringify(input), originalResult = JSON.stringify(result);
      const changed = { ...result };
      if (mode === 'agi') changed.agi = result.agi.plus(1);
      if (mode === 'total-income') changed.totalIncome = result.totalIncome.plus(1);
      if (mode === 'taxable-income') changed.taxableIncome = result.taxableIncome.plus(1);
      if (mode === 'total-tax') changed.totalTax = result.totalTax.plus(1);
      if (mode === 'refund') changed.refund = result.refund.plus(1);
      if (mode === 'withholding') changed.totalWithholding = result.totalWithholding.plus(1);
      if (mode === 'carryforward') changed.carryforwards = { ...result.carryforwards, capitalLoss: result.carryforwards.capitalLoss.plus(1) };
      if (mode === 'audit') changed.allLines = result.allLines.map((line, index) => index === 0 ? { ...line, description: line.description + ' altered' } : line);
      if (mode === 'digital-asset') changed.digitalAssetQuestion = !result.digitalAssetQuestion;
      const displayed = redactReviewIdentifiers(changed), renderInput = redactReviewIdentifiers(input);
      const absent = join(directory, 'absent-templates'), outputDir = join(directory, 'never-created');
      for (const prepared of [token, undefined]) {
        await expect(fillReturn(renderInput, displayed, { blankFormsDir: absent, outputDir, educationReview: prepared }), mode)
          .rejects.toThrow(/annual.*(?:full|result)|education.*(?:full|result).*reconcile/i);
        await expect(access(outputDir)).rejects.toThrow();
      }
      await expect(fillForm5329(renderInput, displayed, join(absent, 'f5329.pdf'), 'primary', token), mode)
        .rejects.toThrow(/annual.*(?:full|result)|education.*(?:full|result).*reconcile/i);
      expect(JSON.stringify(input)).toBe(originalInput); expect(JSON.stringify(result)).toBe(originalResult);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

// Spec: education-review-full-result-binding.yaml exact-render-copy.
it('accepts exact original and redacted annual-interest results with private full-result binding', () => {
  for (const fixture of [annualLoanInterestFixture(), mixedAnnualLoanInterestFixture()]) {
    const input = fixture.input, result = calculateFederalTax(input), token = prepareEducationReview(input);
    const education = result.form1099Q;
    if (!education) throw new Error('Missing actual original education result');
    expect(Object.keys(token)).toEqual([]);
    expect(() => assertPreparedEducationReturn(input, education, token, result.schedule1?.studentLoanInterest, result)).not.toThrow();
    const redacted = redactReviewIdentifiers(result), redactedEducation = redacted.form1099Q;
    if (!redactedEducation) throw new Error('Missing redacted original education result');
    expect(() => assertPreparedEducationReturn(redactReviewIdentifiers(input), redactedEducation, token, redacted.schedule1?.studentLoanInterest, redacted)).not.toThrow();
    expect(() => assertPreparedEducationReturn(input, education, token, result.schedule1?.studentLoanInterest)).toThrow(/annual.*(?:full|result)|education.*(?:full|result)/i);
  }
});

// Spec: education-review-full-result-binding.yaml fresh-auto-preparation.
it('retains fresh auto-preparation for exact annual-interest render results', async () => {
  const { input } = mixedAnnualLoanInterestFixture(), result = calculateFederalTax(input);
  const originalInput = JSON.stringify(input), originalResult = JSON.stringify(result);
  const renderedInput = redactReviewIdentifiers(input), renderedResult = redactReviewIdentifiers(result);
  const directory = await mkdtemp(join(tmpdir(), 'education-full-result-fresh-'));
  try {
    const outputDir = join(directory, 'fresh');
    await fillReturn(renderedInput, renderedResult, { blankFormsDir: 'forms/blank/2025', outputDir });
    await expect(access(join(outputDir, 'f1040-filled.pdf'))).resolves.toBeUndefined();
    const direct = await fillForm5329(renderedInput, renderedResult, 'forms/blank/2025/f5329.pdf', 'primary');
    expect(direct.getForm().getTextField(F5329.line5).getText()).toBe('7200');
    expect(JSON.stringify(input)).toBe(originalInput); expect(JSON.stringify(result)).toBe(originalResult);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
