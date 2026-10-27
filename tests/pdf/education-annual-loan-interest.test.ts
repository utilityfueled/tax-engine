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
import { prepareEducationReview } from '@/pdf/education-review-context.js';
import { annualLoanInterestFixture } from '../fixtures/education-annual-loan-interest.js';

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
