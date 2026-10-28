// Spec: spec/federal/k1-cash-distribution-gain.yaml
import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { fillForm8949, FORM_8949_FIELDS as F } from '@/pdf/fill-form-8949.js';
import { SCHEDULE_D_FIELDS as D } from '@/pdf/fill-schedule-d.js';
import { prepareForm8949Review, form8949ReviewCalculation, type PreparedForm8949Review } from '@/pdf/form-8949-review-context.js';
import { prepareCharitableReview } from '@/pdf/charitable-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { k1CashDistributionFixture, cashDistributionSource } from '../fixtures/k1-cash-distribution.js';
import { charitableStatement } from '../fixtures/k1-charitable-return.js';
import { readCompletedPdfPages } from './read-completed-pdf-pages.js';

it('rejects replaced distribution sources before capital template access', async () => {
  const input = k1CashDistributionFixture(), result = calculateFederalTax(input);
  const token = prepareForm8949Review(input), charity = prepareCharitableReview(input), redacted = redactReviewIdentifiers(input);
  expect(form8949ReviewCalculation(redacted, token).longTermBoxF.totalGainLoss.toFixed()).toBe('1');
  const changes: Array<(x: typeof input) => void> = [
    x => { cashDistributionSource(x).acquisitionDate = '2024-12-31'; },
    x => { cashDistributionSource(x).cashAmount = '31.01'; },
    x => { cashDistributionSource(x).sourceReference = 'Different actual attachment'; },
    x => { charitableStatement(x).basis!.recipientTaxpayerIdLast4 = '0000'; },
    x => { x.scheduleK1[0].accountHolder = 'spouse'; },
    x => { x.scheduleK1[0].beginningBasis = '30.01'; },
    x => { x.standardDeductionFacts!.nonresidentAlien = true; },
    x => { x.eic = { primaryIsFullTimeStudent: false, claimantEligibility: { sourceTaxYear: 2025, sourceReference: 'Changed actual owner status', sourceFactsConfirmed: true, primaryNonresidentAlienDuringYear: true } }; },
    x => { delete charitableStatement(x).cashDistribution; },
  ];
  for (const change of changes) {
    const changed = structuredClone(redacted); change(changed);
    await expect(fillForm8949(changed, 'missing.pdf', token)).rejects.toThrow(/source facts.*stale|conflicting/);
  }
  await expect(fillForm8949(redacted, 'missing.pdf')).rejects.toThrow(/identity/);
  await expect(fillForm8949(redacted, 'missing.pdf', {} as PreparedForm8949Review)).rejects.toThrow(/original prepared/);
  const stale = { ...result, allLines: result.allLines.map(row => row.form === 'Form 8949' ? { ...row, value: row.value.plus('.01') } : row) };
  await expect(fillReturn(redacted, stale, { charitableReview: charity, capitalGainReview: token, blankFormsDir: 'missing', outputDir: 'missing' })).rejects.toThrow(/calculation|reconcile/);
});

it('binds and saves the redacted distribution gain with original basis evidence', async () => {
  for (const scorp of [false, true]) {
    const input = k1CashDistributionFixture(2025, scorp), before = JSON.stringify(input), result = calculateFederalTax(input);
    const charity = prepareCharitableReview(input), dir = await mkdtemp(join(tmpdir(), 'k1-cash-distribution-review-'));
    try {
      // The packet can prepare its private capital calculation from the already
      // validated charitable original context; render copies remain redacted.
      const packet = await fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), {
        charitableReview: charity, blankFormsDir: 'forms/blank/2025', outputDir: dir, flatten: false,
      });
      const path = (name: string) => { const p = packet.filledForms.find(value => value.endsWith(name)); if (!p) throw Error(`Missing ${name}`); return p; };
      const capital = await PDFDocument.load(await readFile(path('/f8949-filled.pdf')));
      const row = F.page2Rows[0], form = capital.getForm();
      expect(form.getCheckBox(F.boxF).isChecked()).toBe(true);
      expect(form.getTextField(row.dateAcquired).getText()).toBe('2023-01-01');
      expect(form.getTextField(row.dateSold).getText()).toBe('2025-12-31');
      expect(form.getTextField(row.proceeds).getText()).toBe(scorp ? '1' : '31');
      expect(form.getTextField(row.costBasis).getText() ?? '').toBe(scorp ? '' : '30');
      expect(form.getTextField(row.gainLoss).getText()).toBe('1');
      expect(form.getTextField(F.ssn2).getText()).toBeUndefined();
      const sd = await PDFDocument.load(await readFile(path('/f1040sd-filled.pdf')));
      expect(sd.getForm().getTextField(D.line10GainLoss).getText()).toBe('1');
      expect(sd.getForm().getTextField(D.line15).getText()).toBe('1');
      expect(sd.getForm().getTextField(D.ssn).getText()).toBeUndefined();
      const names = ['/f8949-filled.pdf', '/f1040sd-filled.pdf', '/k1-charitable-reference-filled.pdf'];
      const pageGroups = readCompletedPdfPages(names.map(path), 10000);
      for (const [index, name] of names.entries()) {
        const pages = pageGroups[index]!;
        for (const page of pages) {
          expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
          for (const secret of ['123456789', '6789', 'gift-1', 'Fictional actual annual cash distribution attachment']) expect(page).not.toContain(secret);
        }
        if (name.includes('reference')) {
          expect(pages.join(' ')).toContain('Actual cash distribution: $31');
          expect(pages.join(' ')).toContain('Basis before distribution: $30');
          expect(pages.join(' ')).toContain('Owner capital gain: $1');
          expect(pages.join(' ')).toContain('Distribution gain is not another entity income or charitable contribution.');
        }
      }
      expect(JSON.stringify(input)).toBe(before);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});
